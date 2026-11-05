// The Pages library and published sites as the app keeps them: loaded once, refreshed when the server
// says they changed ({ t: 'feature', id: 'pages' }), and which pages of a conversation were kept. Also the
// pages agents are writing right now (drafts, as their calls stream in) and what each session shows
// beside its conversation (the canvas).
import { create } from 'zustand';
import type { PageDraft, PageInfo, PagesEvent, PublishRequest, SiteInfo } from '@shared/pages';
import type { ToolInfo } from '@shared/types';
import { DRAFT_TOOLS } from '@shared/page-drafts';
import { api, enc } from '../../lib/api';
import { onFeatureEvent } from '../../lib/featureEvents';
import { live as socket } from '../../lib/ws';

interface PagesState {
  pages: PageInfo[] | null;
  sites: SiteInfo[] | null;
  /** By session: which of its show_html calls were kept, as which page. */
  kept: Record<string, Record<string, string>>;
  /** Publish requests by id, as last heard. */
  requests: Record<string, PublishRequest>;
  /** Pictures that became ready since the list was loaded, by page. */
  thumbs: Record<string, string>;
  loadPages(): Promise<void>;
  loadSites(): Promise<void>;
  loadKept(key: string): Promise<void>;
  setKept(key: string, item: string, page: string): void;
  setRequest(r: PublishRequest): void;
}

export const usePagesStore = create<PagesState>((set, get) => ({
  pages: null,
  sites: null,
  kept: {},
  requests: {},
  thumbs: {},
  loadPages: () => api<{ pages: PageInfo[] }>('/api/pages').then((r) => set({ pages: r.pages })),
  loadSites: () => api<{ sites: SiteInfo[] }>('/api/sites').then((r) => set({ sites: r.sites })),
  loadKept: (key) => api<{ items: Record<string, string> }>(`/api/pages/kept?key=${enc(key)}`).then((r) => set({ kept: { ...get().kept, [key]: r.items } })),
  setKept: (key, item, page) => set({ kept: { ...get().kept, [key]: { ...get().kept[key], [item]: page } } }),
  setRequest: (r) => set({ requests: { ...get().requests, [r.id]: r } }),
}));

// ---- pages being written --------------------------------------------------------------------------

interface DraftsState {
  /** By session, by tool call. */
  byKey: Record<string, Record<string, PageDraft>>;
  /** Fetches a session's drafts whole (on opening it, or after a piece went missing). */
  load(key: string): Promise<void>;
  /** Fetches the saves of a page being written now, from any session (its editor, opened mid-way). */
  loadPage(pageId: string): Promise<void>;
}

/** A draft still to end: being written, or a save of a document, slides, a spreadsheet or LaTeX still to say how it went. */
const going = (d: PageDraft) => !d.done || (d.tool in DRAFT_TOOLS && !d.saved && !d.failed);

/** The drafts open here now, of a session or of a page (by id, with the last piece heard of each). */
function goingNow(o: { key?: string; page?: string }): Map<string, number> {
  const out = new Map<string, number>();
  const byKey = useDrafts.getState().byKey;
  for (const k of o.key ? [o.key] : Object.keys(byKey)) for (const d of Object.values(byKey[k] ?? {})) if (going(d) && (o.key || d.pageId === o.page)) out.set(d.id, d.seq ?? 0);
  return out;
}

/**
 * Drafts fetched whole, each kept by its session (a newer one already here stays). One open here when they were asked
 * for (`was`) that the server no longer has, nothing heard of it since (the server started again, or its end was sent
 * while this window was away), ends where it is: a save of a document, slides, a spreadsheet or LaTeX as one that
 * saved nothing, so its page shows as it is (and can be changed) rather than waiting for good.
 */
function keepWhole(list: PageDraft[], key: string | undefined, was: Map<string, number>) {
  const byKey = { ...useDrafts.getState().byKey };
  for (const d of list) {
    const k = d.key ?? key;
    if (!k) continue;
    const had = byKey[k]?.[d.id];
    if (had && (had.seq ?? 0) > (d.seq ?? 0)) continue;
    byKey[k] = { ...byKey[k], [d.id]: d };
  }
  const has = new Set(list.map((d) => d.id));
  for (const [k, ds] of Object.entries(byKey))
    for (const d of Object.values(ds)) if (was.get(d.id) === (d.seq ?? 0) && !has.has(d.id) && going(d)) byKey[k] = { ...byKey[k], [d.id]: { ...d, done: true, ...(d.tool in DRAFT_TOOLS ? { failed: true } : {}) } };
  useDrafts.setState({ byKey });
}

export const useDrafts = create<DraftsState>(() => ({
  byKey: {},
  load: (key) => {
    const was = goingNow({ key });
    return api<{ drafts: PageDraft[] }>(`/api/pages/drafts?key=${enc(key)}`).then((r) => keepWhole(r.drafts, key, was));
  },
  loadPage: (pageId) => {
    const was = goingNow({ page: pageId });
    return api<{ drafts: PageDraft[] }>(`/api/pages/drafts?page=${enc(pageId)}`).then((r) => keepWhole(r.drafts, undefined, was));
  },
}));

// Back after the connection dropped (or the server started again): the sessions with drafts still open here ask for
// them again, which ends those the server no longer has.
let down = false;
socket.onStatus((up) => {
  if (!up) return void (down = true);
  if (!down) return;
  down = false;
  const s = useDrafts.getState();
  for (const [k, ds] of Object.entries(s.byKey)) if (Object.values(ds).some(going)) s.load(k).catch(() => {});
});

/** Who should hear that a page started being written (the session on screen opens it beside). */
const startListeners = new Set<(key: string, d: PageDraft) => void>();
export function onDraftStart(fn: (key: string, d: PageDraft) => void): () => void {
  startListeners.add(fn);
  return () => {
    startListeners.delete(fn);
  };
}

function takeDraft(key: string, e: Extract<PagesEvent, { what: 'draft' }>) {
  const s = useDrafts.getState();
  const had = s.byKey[key]?.[e.draft.id];
  // Heard of already (this window watches both the session and the page it saves).
  if (had && e.draft.seq !== undefined && had.seq !== undefined && e.draft.seq <= had.seq) return;
  if (e.from > 0 && (!had || had.text.length !== e.from)) {
    // A piece went missing: the whole draft again.
    s.load(key).catch(() => {});
    return;
  }
  const text = e.from === 0 ? e.text : had!.text + e.text;
  const d: PageDraft = { ...e.draft, text };
  useDrafts.setState({ byKey: { ...s.byKey, [key]: { ...s.byKey[key], [d.id]: d } } });
  if (!had && !d.done) for (const fn of startListeners) fn(key, d);
}

// What the server says changed: whatever is loaded is loaded again.
onFeatureEvent('pages', ({ key, data }) => {
  const e = data as PagesEvent;
  const s = usePagesStore.getState();
  if (e?.what === 'pages') {
    if (s.pages) s.loadPages().catch(() => {});
    for (const k of Object.keys(s.kept)) s.loadKept(k).catch(() => {});
  } else if (e?.what === 'sites') {
    if (s.sites) s.loadSites().catch(() => {});
  } else if (e?.what === 'request' && e.request?.id) s.setRequest(e.request);
  else if (e?.what === 'thumb' && e.id) usePagesStore.setState({ thumbs: { ...s.thumbs, [e.id]: e.thumb } });
  else if (e?.what === 'draft' && key && e.draft?.id) takeDraft(key, e);
});

// ---- beside the conversation ---------------------------------------------------------------------------

/** What a session shows beside its conversation: a page (an agent's call, by its id, or a saved page) or a review. */
export type CanvasTarget = ({ kind: 'item'; id: string } | { kind: 'page'; id: string } | { kind: 'review'; id: string }) & {
  /** Opened to change it (Edit), not just to see it. */
  edit?: boolean;
};

const CANVAS_KEY = 'wa.canvas.v1';
const saved = (): { width?: number; auto?: boolean } => {
  try {
    return JSON.parse(localStorage.getItem(CANVAS_KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
};

interface CanvasState {
  /** By session: what it shows beside the conversation, or nothing. */
  open: Record<string, CanvasTarget | null>;
  /** The panel's width, as a share of the session's space (kept on this device). */
  width: number;
  /** Pages an agent starts writing open beside the conversation by themselves (kept on this device). */
  auto: boolean;
  show(key: string, t: CanvasTarget): void;
  close(key: string): void;
  setWidth(w: number): void;
  setAuto(v: boolean): void;
}

const keep = (s: { width: number; auto: boolean }) => {
  try {
    localStorage.setItem(CANVAS_KEY, JSON.stringify({ width: s.width, auto: s.auto }));
  } catch {}
};

export const useCanvas = create<CanvasState>((set, get) => ({
  open: {},
  width: Math.min(0.68, Math.max(0.32, saved().width ?? 0.5)),
  auto: saved().auto ?? true,
  show: (key, t) => set({ open: { ...get().open, [key]: t } }),
  close: (key) => set({ open: { ...get().open, [key]: null } }),
  setWidth: (w) => {
    set({ width: Math.min(0.68, Math.max(0.32, w)) });
    keep(get());
  },
  setAuto: (v) => {
    set({ auto: v });
    keep(get());
  },
}));

/** Wide enough to show a page beside the conversation. */
export const CANVAS_MEDIA = '(min-width: 1100px)';

/** This session is the one on screen (however its address was written). */
export function onScreen(key: string): boolean {
  try {
    return decodeURIComponent(location.pathname).endsWith(`/s/${key}`);
  } catch {
    return false;
  }
}

/** A link of this app, as the browser reaches it. */
export const absolute = (p: string) => `${location.origin}${p}`;

/** The page that a save_page call saved, from what the tool answered: "(page <id>, version <n>)". */
export function savedRef(output?: string): { id: string; version: number } | null {
  const m = /\(page ([a-f0-9]{10}), version (\d+)\)/.exec(output ?? '');
  return m ? { id: m[1], version: Number(m[2]) } : null;
}

/**
 * The page a call of save_page (or save_slides, save_doc, save_sheet, save_latex) saves: the one its answer names,
 * else, while it runs, the saved page it was given to change. A long call comes shortened ({ _preview }), the id in
 * what is left of it.
 */
export function savedPageOf(t: ToolInfo): string | undefined {
  const ref = savedRef(t.output);
  if (ref) return ref.id;
  const a = (t.input ?? {}) as { id?: unknown; _preview?: unknown };
  const id = typeof a.id === 'string' ? a.id.trim() : typeof a._preview === 'string' ? /"id":"([a-f0-9]{10})"/.exec(a._preview)?.[1] : undefined;
  return id && /^[a-f0-9]{10}$/.test(id) ? id : undefined;
}

/** The request a publish_site call made, from what the tool answered: "(request <id>)". */
export const requestRef = (output?: string): string | null => /\(request ([a-f0-9]{16})\)/.exec(output ?? '')?.[1] ?? null;
