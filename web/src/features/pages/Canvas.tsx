// Beside a session's conversation, on a wide screen: the page or document an agent is writing, as it comes, then
// the thing itself to use, edit and save. Pages shown in the conversation (show_html), saved pages, documents,
// slides, spreadsheets, LaTeX, notebooks and diagrams (save_page and the other save tools), HTML files an agent
// writes (Write) and documents that are files (Markdown, Word, Excel, PowerPoint, PDF…: BesideFile.tsx) open here;
// when the user saves a change, the agent hears of it with their next message. A turn's document opens by itself in
// the session on screen (unless that was turned off) while it is the turn's only one: a turn that makes or changes
// several shows none of them here (beside-rule.ts), and each opens from its card in the conversation. Its top line
// has a button that shows it over everything instead (full screen), and back.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { AppWindow, ChevronDown, Download, Ellipsis, ExternalLink, FileCode2, FolderOpen, Maximize2, PanelRight, X } from 'lucide-react';
import { docStem } from '@shared/documents';
import type { PageDraft, PageInfo } from '@shared/pages';
import type { SessionSummary, TimelineItem, ToolInfo, ToolItem } from '@shared/types';
import { api, enc, post, put } from '../../lib/api';
import { composeInsert } from '../../lib/featureEvents';
import { basename, tildify } from '../../lib/format';
import { go, showInFiles } from '../../lib/nav';
import { canReveal, reveal, revealLabel } from '../../lib/reveal';
import { toast, toastError, useApp, useLive, useTimeline } from '../../lib/store';
import { nagetTool } from '../registry';
import { cx, IconButton, MenuItem, MenuSep, Popover, Switch, useConfirm, useIsMobile, useMediaQuery } from '../../components/ui';
import { useSpacesStore } from '../spaces/state';
import { FileMore } from '../files/SpaceMenu';
import { tr } from '../../i18n/runtime';
import { pageFile, pageStore, shownStore, type Store } from './frame';
import { CANVAS_MEDIA, onDraftStart, onScreen, savedPageOf, savedRef, useCanvas, useDrafts, usePagesStore, type CanvasTarget } from './state';
import { Studio, type StudioDoc } from './studio/Studio';
import { exportFile } from './exportFile';
import { EXPORTS } from './exports';
import { EDITORS } from './editors';
import type { ModelDoc } from './kinds';
import { draftKind, useEmptyModel, useLiveDraft, usePageDraft } from './live';
import { noteDoc, opened, quiet, type TurnDocs } from './beside-rule';
import { SessionFile } from './BesideFile';
import { sendToSession, useCommentAi } from './common/commentAi';
import { pageNamed } from '@shared/comment-asks';
import type { Deck } from '@shared/slides';
import { usePicks } from '../session/HtmlPage';
import { ReviewPane, shotsOfTurn } from '../shots/Review';

const kb = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(n < 10_240 ? 1 : 0)} KB`);

// ---- which calls are pages --------------------------------------------------------------------------

export type PageCall = 'show_html' | 'save_page' | 'file';

/** Where a kept page is, in words: in its project's files, else just saved (it stays with its conversation). */
function keptWhere(space?: string): string {
  const name = space ? useSpacesStore.getState().list?.find((x) => x.id === space)?.name : undefined;
  return name ? tr(`In ${name}’s files`) : tr('Saved');
}

/** A call that makes a page, and which kind. */
export function pageCall(t: ToolInfo | undefined): PageCall | null {
  if (!t) return null;
  const bare = nagetTool(t.name);
  if (bare === 'show_html' || bare === 'save_page') return bare;
  // A deck, a document or a spreadsheet is a saved page too, opened by its id.
  if (bare === 'save_slides' || bare === 'save_doc' || bare === 'save_sheet' || bare === 'save_latex' || bare === 'save_notebook' || bare === 'save_diagram' || bare === 'save_board') return 'save_page';
  // A change page_action saved: the page it changed, as a save of it.
  if (bare === 'page_action' && savedRef(t.output)) return 'save_page';
  const p = (t.input as { file_path?: unknown } | undefined)?.file_path;
  return t.name === 'Write' && typeof p === 'string' && /\.html?$/i.test(p) ? 'file' : null;
}

/** The page calls of a session, in order: those in its conversation and those still coming. */
function usePageItems(key: string): ToolItem[] {
  const items = useTimeline((x) => x.byKey[key]?.items);
  const overlay = useLive((x) => x.byKey[key]?.overlay);
  return useMemo(() => {
    const seen = new Set<string>();
    const out: ToolItem[] = [];
    for (const list of [items ?? [], overlay?.items ?? []] as TimelineItem[][])
      for (const it of list)
        if (it.kind === 'tool' && !seen.has(it.id) && pageCall(it.tool)) {
          seen.add(it.id);
          out.push(it);
        }
    return out;
  }, [items, overlay]);
}

/** Which page a call shows: a saved page by its id and an HTML file by its path (saved again, it is the same), else the call itself. */
const pageKey = (it: ToolItem): string => {
  const k = pageCall(it.tool);
  const path = (it.tool.input as { file_path?: unknown } | undefined)?.file_path;
  return (k === 'save_page' && savedPageOf(it.tool)) || (k === 'file' && typeof path === 'string' ? `file:${path}` : it.id);
};

/** A call that came to nothing: it failed, was declined, or was stopped. */
const cameToNothing = (it: ToolItem) => it.tool.status === 'error' || it.tool.status === 'declined' || it.tool.status === 'interrupted';

const titleOf = (it: ToolItem | undefined, kind: PageCall | null): string => {
  const input = (it?.tool.input ?? {}) as { title?: unknown; file_path?: unknown };
  if (kind === 'file') return basename(String(input.file_path ?? 'page.html'));
  return typeof input.title === 'string' && input.title.trim() ? input.title.trim() : 'Page';
};

// ---- opening it by itself -------------------------------------------------------------------------------

/** Sessions whose panel holds changes not saved yet. */
const dirty = new Set<string>();
/** The saved page each session's panel shows now. */
const shownPage = new Map<string, string>();

/** A document a turn made or changed: the names it goes by (beside-rule.ts), and what shows it beside the conversation. */
export interface BesideDoc {
  names: string[];
  target: CanvasTarget;
  /** A page written anew by each call: the newest call is the one to show (a save of another kind shows in the editor that is open). */
  follow?: boolean;
  /** The agent handed it over (present_files): it takes the place of another form of it that opened by itself (its source, say). */
  handed?: boolean;
}

/** By session: its turn's documents so far, what opened by itself for it, and what the panel showed before that. */
const turns = new Map<string, { docs: TurnDocs; target?: CanvasTarget; before?: CanvasTarget | null }>();

const sameTarget = (a: CanvasTarget | null | undefined, b: CanvasTarget | null | undefined) => !!a && !!b && a.kind === b.kind && a.id === b.id;

/** A file as a document's name: its path without the ending that says its form (a report's .md and .pdf are one document). */
export const fileName = (path: string) => `file:${docStem(path)}`;

/**
 * A document that is a file, as the panel shows it. `page`: the saved page it is a copy of (export_page wrote it), so
 * the two are one document; `handed`: the agent handed it over.
 */
export const fileDoc = (path: string, o: { handed?: boolean; page?: string } = {}): BesideDoc => ({
  names: [fileName(path), ...(o.page ? [o.page] : [])],
  target: { kind: 'file', id: path },
  ...(o.handed ? { handed: true } : {}),
});

/** A call that makes a page (a card in the conversation), as a document. */
export function callDoc(it: ToolItem): BesideDoc {
  const kind = pageCall(it.tool);
  const page = kind === 'save_page' ? savedPageOf(it.tool) : undefined;
  const path = (it.tool.input as { file_path?: unknown } | undefined)?.file_path;
  return { names: [it.id, ...(page ? [page] : []), ...(kind === 'file' && typeof path === 'string' ? [fileName(path)] : [])], target: { kind: 'item', id: it.id } };
}

/** A call as it comes in, as a document: a page, a save of another kind, an HTML file, or a document written as text. */
function draftDoc(d: PageDraft): BesideDoc {
  if (d.tool === 'file' && d.path) return /\.html?$/i.test(d.path) ? { names: [d.id, fileName(d.path)], target: { kind: 'item', id: d.id }, follow: true } : fileDoc(d.path);
  return { names: d.pageId ? [d.id, d.pageId] : [d.id], target: { kind: 'item', id: d.id }, ...(draftKind(d) ? {} : { follow: true }) };
}

/**
 * The turn an item of a session's conversation is in, by what ended before it (the id of the end of the turn before);
 * with no item, or one the conversation does not have yet, the turn going on.
 */
function turnOf(key: string, item?: string): string {
  const items = useTimeline.getState().byKey[key]?.items ?? [];
  let end = items.length;
  if (item) {
    const i = items.findIndex((x) => x.id === item);
    if (i >= 0) end = i;
  }
  for (let i = end - 1; i >= 0; i--) if (items[i].kind === 'turn') return items[i].id;
  return '';
}

/** What else a document's name is known as by now: the page its call saved, once it has. */
function alsoKnown(key: string): (name: string) => string[] {
  return (name) => {
    if (name.startsWith('file:') || /^[a-f0-9]{10}$/.test(name)) return [];
    const d = useDrafts.getState().byKey[key]?.[name];
    const drafted = d?.saved?.pageId ?? d?.pageId;
    if (drafted) return [drafted];
    const ov = useLive.getState().byKey[key]?.overlay;
    const it = useTimeline.getState().byKey[key]?.items.find((x) => x.id === name) ?? ov?.items.find((x) => x.id === name);
    if (it?.kind !== 'tool') return [];
    const tool = { ...it.tool, ...ov?.patches?.[name] };
    const page = pageCall(tool) === 'save_page' ? savedPageOf(tool) : undefined;
    return page ? [page] : [];
  };
}

/** Whether the panel shows this document already, however it came to (opened by hand, or by an earlier save of it). */
function shows(key: string, cur: CanvasTarget | null, doc: BesideDoc): boolean {
  if (!cur) return false;
  if (sameTarget(cur, doc.target)) return true;
  if (cur.kind === 'file') return doc.names.includes(fileName(cur.id));
  if (cur.kind === 'page') return doc.names.includes(cur.id);
  const page = shownPage.get(key);
  return cur.kind === 'item' && (doc.names.includes(cur.id) || (!!page && doc.names.includes(page)));
}

/**
 * Documents a session's turn made or changed (`at`: an item of that turn; none for the turn going on). The turn's
 * first one opens beside the conversation by itself, for the session on screen on a wide one, unless that is turned
 * off; a second one puts the panel back as it was before, and nothing more opens by itself in that turn (each has
 * its card in the conversation). A page open with changes not saved is left alone, and so is one opened by hand.
 */
export function offerBeside(key: string, docs: BesideDoc[], at?: string) {
  if (!docs.length) return;
  const turn = turnOf(key, at);
  const had = turns.get(key);
  let st = had && had.docs.turn === turn ? had : { docs: { turn, docs: [] } as TurnDocs };
  const more = alsoKnown(key);
  let first: { doc: BesideDoc; at: number } | null = null;
  let back = false;
  let again: BesideDoc | null = null;
  for (const doc of docs) {
    const r = noteDoc(st.docs, turn, doc.names, more);
    st = { ...st, docs: r.now };
    if (r.step === 'open') first ??= { doc, at: r.at };
    else if (r.step === 'put-back') back = true;
    else if (r.now.opened === r.at && !r.now.quiet) again = doc;
  }
  turns.set(key, st);
  const c = useCanvas.getState();
  const cur = c.open[key] ?? null;
  // A page open with changes not saved stays.
  if (cur && dirty.has(key)) return;
  if (back) {
    // Several documents: the one that opened by itself gives way to what was there before it (wherever you are now).
    if (st.target && sameTarget(cur, st.target)) {
      if (st.before) c.show(key, st.before);
      else c.close(key);
    }
    turns.set(key, { docs: quiet(st.docs) });
    return;
  }
  // Only where it would be seen: the session on screen, with room beside it, nothing of it over everything.
  if (!c.auto || !matchMedia(CANVAS_MEDIA).matches || !onScreen(key) || useOver.getState().at?.key === key) return;
  if (first && st.docs.docs.length === 1) {
    // There already (opened by hand, or in an earlier turn): it stays as it is, and is not this turn's to put back.
    if (shows(key, cur, first.doc)) return void turns.set(key, { docs: opened(st.docs, first.at) });
    c.show(key, first.doc.target);
    turns.set(key, { docs: opened(st.docs, first.at), target: first.doc.target, before: cur });
    return;
  }
  // The one that opened by itself, again: a page written anew shows by its newest call, and a file the agent hands
  // over takes the place of the file shown (the Word file made from the Markdown that was watched). A saved page
  // stays: the file made from it is a copy, and the page is what goes on being changed.
  if (again && (again.follow || (again.handed && st.target?.kind === 'file')) && st.target && sameTarget(cur, st.target) && !sameTarget(st.target, again.target)) {
    c.show(key, again.target);
    turns.set(key, { ...st, target: again.target });
  }
}

/** The panel was closed by hand: nothing more opens there by itself in the turn going on. */
function closedByHand(key: string) {
  const st = turns.get(key);
  if (st) turns.set(key, { docs: quiet(st.docs) });
}

onDraftStart((key, started) => {
  // Which document it is shows once the call says so: the page a save of another kind changes (its id comes first,
  // mostly; a new one has none), the file a Write writes. Until then, a moment's wait.
  const decide = () => {
    const now = useDrafts.getState().byKey[key]?.[started.id];
    if (!now || now.done) return;
    if (draftKind(now) && !now.pageId && Date.now() - now.startedAt < 600) return void setTimeout(decide, 150);
    offerBeside(key, [draftDoc(now)], now.id);
  };
  decide();
});

/** Opens a page call beside the conversation, when the screen is wide enough; false when it is not. */
export function showBeside(key: string, t: CanvasTarget): boolean {
  if (!matchMedia(CANVAS_MEDIA).matches) return false;
  useCanvas.getState().show(key, t);
  return true;
}

// ---- full screen, and back ----------------------------------------------------------------------------------

/**
 * Moves what a session shows beside its conversation over everything (full screen), or what it shows there back beside
 * the conversation. It opens afresh where it goes: the caller asks about changes not saved first.
 */
function moveOver(key: string, target: CanvasTarget, layout: 'panel' | 'sheet' | 'page') {
  if (layout === 'panel') {
    useCanvas.getState().close(key);
    openOver(key, target);
  } else {
    useOver.setState({ at: null });
    showBeside(key, target);
  }
}

/** The button that does it, in the top line of what is shown: none on a phone, nor where there is no room beside. */
function FullButton({ layout, onClick }: { layout: 'panel' | 'sheet' | 'page'; onClick: () => void }) {
  const wide = useMediaQuery(CANVAS_MEDIA);
  if (layout === 'sheet' || (layout === 'page' && !wide)) return null;
  return (
    <IconButton label={layout === 'panel' ? 'Full screen' : 'Show beside the conversation'} size="sm" onClick={onClick} data-tip={layout === 'panel' ? 'beside' : undefined}>
      {layout === 'panel' ? <Maximize2 size={14} /> : <PanelRight size={15} />}
    </IconButton>
  );
}

/** The switch in the panel's menu: a turn's document opens here by itself. */
function AutoSwitch() {
  const auto = useCanvas((x) => x.auto);
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-fg-2">
      <span className="min-w-0 flex-1">Open documents here as they are written</span>
      <Switch label="Open documents here as they are written" on={auto} onChange={(v) => useCanvas.getState().setAuto(v)} />
    </div>
  );
}

// ---- what the panel shows ---------------------------------------------------------------------------------

interface Loaded {
  doc: StudioDoc;
  /** Another kind (a deck, a document, a spreadsheet), edited in its own editor instead. */
  kind?: NonNullable<PageInfo['kind']>;
  model?: ModelDoc<unknown>;
  saveModel?: (model: unknown, force?: boolean) => Promise<boolean>;
  /** What the second line under the title says. */
  sub: string;
  /** Saves; a saved page refuses (409) when a newer version came meanwhile, unless `force`. */
  save: (html: string, force?: boolean) => Promise<boolean>;
  /** Where it lives: a saved page or a file. */
  pageId?: string;
  path?: string;
  /** A saved page's version shown. */
  version?: number;
}

function useLoaded(key: string, target: CanvasTarget, item: ToolItem | undefined, kind: PageCall | null): { loaded: Loaded | null; error: string | null } {
  const home = useApp((x) => x.boot?.home);
  const kept = usePagesStore((x) => (target.kind === 'item' ? x.kept[key]?.[target.id] : undefined));
  const keptMap = usePagesStore((x) => x.kept[key]);
  const pagesVersion = usePagesStore((x) => x.pages);
  const draft = useDrafts((x) => (target.kind === 'item' ? x.byKey[key]?.[target.id] : undefined));
  const [page, setPage] = useState<{ info: PageInfo; html?: string; model?: unknown } | null>(null);
  const [file, setFile] = useState<{ content: string; mtime: number; base: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!keptMap) usePagesStore.getState().loadKept(key).catch(() => {});
  }, [key, !keptMap]);

  // The saved page it is (save_page's, a kept one, or one opened by id). A document, deck, spreadsheet or LaTeX being
  // saved shows the version it changes while its call comes in (the version being written over it: live.ts).
  const modelSave = !!item && /__save_(?:doc|slides|sheet|latex)$/.test(item.tool.name);
  const pageId = target.kind === 'page' ? target.id : kind === 'save_page' ? (modelSave && item ? (savedPageOf(item.tool) ?? draft?.pageId) : savedRef(item?.tool.output)?.id) : kind === 'show_html' ? kept : undefined;
  const loadPage = () => {
    if (!pageId) return;
    api<{ page: PageInfo; html?: string; model?: unknown }>(`/api/pages/${enc(pageId)}`)
      .then((r) => {
        setPage({ info: r.page, html: r.html, model: r.model });
        setError(null);
      })
      .catch((e) => setError((e as Error).message));
  };
  useEffect(() => {
    setPage(null);
    loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);
  // An agent's newer version (or a rename) shows when Pages says it changed.
  useEffect(() => {
    if (pageId && page) loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagesVersion]);

  // An HTML file: read once the agent finished writing it.
  const path = kind === 'file' ? String((item?.tool.input as { file_path?: unknown })?.file_path ?? draft?.path ?? '') : '';
  const fileDone = kind === 'file' && !!item && item.tool.status !== 'running' && item.tool.status !== 'pending';
  const loadFile = async () => {
    try {
      const [f, v] = await Promise.all([api<{ content: string | null; mtime: number; binary?: boolean; tooLarge?: boolean }>(`/api/fs/read?path=${enc(path)}`), post<{ url: string }>('/api/fs/view-link', { path })]);
      if (f.content == null) throw new Error(f.tooLarge ? 'The file is too large to edit here' : 'Not a text file');
      setFile({ content: f.content, mtime: f.mtime, base: `${location.origin}${v.url.slice(0, v.url.lastIndexOf('/') + 1)}` });
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    setFile(null);
    if (path && fileDone) void loadFile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, fileDone]);

  const loaded = useMemo((): Loaded | null => {
    if (pageId) {
      if (!page) return null;
      const id = page.info.id;
      return {
        pageId: id,
        version: page.info.version,
        doc: { key: `page:${id}:${page.info.version}`, title: page.info.title, html: page.html ?? '', store: pageStore(id) },
        ...(page.info.kind && page.model !== undefined
          ? {
              kind: page.info.kind,
              model: { key: `page:${id}:${page.info.version}`, title: page.info.title, model: page.model, version: page.info.version },
              saveModel: async (model: unknown, force?: boolean) => {
                await post(`/api/pages/${enc(id)}/versions`, { model, base: page.info.version, sessionKey: key, force: !!force });
                toast('Saved. The agent sees your changes with your next message.', 'ok');
                loadPage();
                return true;
              },
            }
          : {}),
        sub: `${keptWhere(page.info.space)} · version ${page.info.version}`,
        save: async (html, force) => {
          await post(`/api/pages/${enc(id)}/versions`, { html, base: page.info.version, sessionKey: key, force: !!force });
          toast('Saved. The agent sees your changes with your next message.', 'ok');
          loadPage();
          return true;
        },
      };
    }
    if (kind === 'show_html' && item) {
      const input = (item.tool.input ?? {}) as { html?: unknown; title?: unknown };
      const html = typeof input.html === 'string' ? input.html : draft?.done ? draft.text : '';
      if (!html) return null;
      const store: Store = shownStore(item.id);
      return {
        doc: { key: `item:${item.id}`, title: titleOf(item, kind), html, store },
        sub: 'Shown in the conversation',
        save: async (edited) => {
          const r = await post<{ page: PageInfo }>('/api/pages', { title: titleOf(item, kind), html, sessionKey: key, item: item.id, data: shownStore(item.id).dump(), edited });
          usePagesStore.getState().setKept(key, item.id, r.page.id);
          toast('Saved with your changes. The agent sees them with your next message.', 'ok');
          return true;
        },
      };
    }
    if (kind === 'file' && file) {
      return {
        path,
        doc: { key: `file:${path}:${file.mtime}`, title: basename(path), html: file.content, base: file.base, store: shownStore(`file:${path}`) },
        sub: tildify(path, home),
        save: async (html) => {
          const r = await put<{ mtime: number }>('/api/fs/write', { path, content: html, expectedMtime: file.mtime });
          await post('/api/pages/file-edit', { sessionKey: key, path, before: file.content, after: html }).catch(() => {});
          setFile({ ...file, content: html, mtime: r.mtime });
          toast('Saved. The agent sees your changes with your next message.', 'ok');
          return true;
        },
      };
    }
    return null;
  }, [pageId, page, kind, item, draft?.done, draft?.text, file, path, key, home]);
  return { loaded, error };
}

/**
 * A page of a session to use, edit and save: beside the conversation (`panel`), or over everything on a
 * phone or a narrow window (`sheet`, `page`).
 */
export function SessionPage({ sessionKey: key, target, layout, onClose }: { sessionKey: string; target: CanvasTarget; layout: 'panel' | 'sheet' | 'page'; onClose: () => void }) {
  const items = usePageItems(key);
  const item = target.kind === 'item' ? items.find((i) => i.id === target.id) : undefined;
  // The call's own draft; for a saved page shown here, the newest save of it being written (from any session: an agent
  // working in steps saves it again and again, each shown here as it comes).
  const own = usePageDraft(undefined, target.kind === 'item' ? { sessionKey: key, item: target.id } : {});
  const itemPage = item && /__save_(?:doc|slides|sheet|latex)$/.test(item.tool.name) ? savedPageOf(item.tool) : undefined;
  const newest = usePageDraft(target.kind === 'page' ? target.id : itemPage, { watch: true });
  const draft = newest && (!own || newest.startedAt >= own.startedAt) ? newest : own;
  const callKind = draft && !draftKind(draft) ? draft.tool : null;
  const kind: PageCall | null = target.kind === 'page' ? 'save_page' : (pageCall(item?.tool) ?? (draft ? (draftKind(draft) ? 'save_page' : (callKind as PageCall)) : null));
  const { loaded, error } = useLoaded(key, target, item, kind);
  // A document, deck, spreadsheet or LaTeX document being saved: the version being written, over the one it changes
  // (none for a new one, whose editor starts empty).
  const saving = draftKind(draft);
  const changing = target.kind === 'page' || (!!draft?.pageId && !draft.saved) || typeof (item?.tool.input as { id?: unknown } | undefined)?.id === 'string';
  // A new one's editor once the call says more than a title (before that, an id may still come: the page it changes).
  const begun = !!draft && (draft.done || /"(?!(?:id|title)")\w+"\s*:/.test(draft.text));
  const fresh = !!saving && !changing && !loaded && begun;
  const liveKind = loaded?.kind && loaded.kind !== 'notebook' && loaded.kind !== 'board' ? loaded.kind : fresh ? saving : null;
  const live = useLiveDraft(liveKind, fresh ? null : loaded?.model?.model, fresh ? undefined : loaded?.version, draft);
  useEffect(() => {
    const id = loaded?.pageId;
    if (!id) return;
    shownPage.set(key, id);
    return () => void (shownPage.get(key) === id && shownPage.delete(key));
  }, [key, loaded?.pageId]);
  // The pages to switch to, newest first: a page saved several times once, at its newest save that saved it.
  const picks = useMemo(() => {
    const newest = items.slice().reverse();
    const seen = new Set<string>();
    const out: ToolItem[] = [];
    for (const it of newest) {
      const k = pageKey(it);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(cameToNothing(it) ? (newest.find((x) => pageKey(x) === k && !cameToNothing(x)) ?? it) : it);
    }
    return out;
  }, [items]);
  const shownKey = target.kind === 'page' ? target.id : item ? pageKey(item) : target.id;
  const [menu, setMenu] = useState<'more' | 'pick' | null>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const pickRef = useRef<HTMLButtonElement>(null);
  const onPick = usePicks(key, false);
  const writing = !!draft && !draft.done;
  const title = loaded?.doc.title ?? draft?.title ?? (draft?.path ? basename(draft.path) : undefined) ?? titleOf(item, kind);

  useEffect(() => {
    // Pages being written right now, when the panel opens mid-way.
    useDrafts.getState().load(key).catch(() => {});
  }, [key]);

  const download = () => {
    const html = loaded?.doc.html ?? draft?.text ?? '';
    // A page takes the kit along; an HTML file goes as it is.
    const url = URL.createObjectURL(new Blob([kind === 'file' ? html : pageFile(html)], { type: 'text/html' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = kind === 'file' ? title : `${title.replace(/[^\w.-]+/g, '-').slice(0, 60) || 'page'}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const lead = (
    <>
      <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', writing ? 'bg-busy/12 text-busy' : 'bg-accent-soft text-accent')}>
        {kind === 'file' ? <FileCode2 size={16} /> : <AppWindow size={16} />}
      </span>
      <button ref={pickRef} type="button" onClick={() => picks.length > 1 && setMenu(menu === 'pick' ? null : 'pick')} className={cx('min-w-0 text-left', picks.length > 1 && 'cursor-pointer')}>
        <span className="flex min-w-0 items-center gap-1">
          <span translate="no" className="truncate text-[13.5px] font-medium text-fg">
            {title}
          </span>
          {picks.length > 1 && <ChevronDown size={13} className="shrink-0 text-fg-3" />}
        </span>
        <span className="flex items-center gap-1.5 truncate text-[11.5px] text-fg-3">
          {writing && <span className="breathe h-1.5 w-1.5 shrink-0 rounded-full bg-busy" />}
          {writing ? `Writing · ${kb(draft!.text.length)}` : (loaded?.sub ?? (error ? error : ' '))}
        </span>
      </button>
    </>
  );
  const tail = (
    <>
      <FullButton layout={layout} onClick={() => void full()} />
      <IconButton ref={moreRef} label="More" size="sm" active={menu === 'more'} onClick={() => setMenu(menu === 'more' ? null : 'more')}>
        <Ellipsis size={15} />
      </IconButton>
      <IconButton label="Close" size="sm" onClick={onClose}>
        <X size={15} />
      </IconButton>
      <Popover anchor={moreRef} open={menu === 'more'} onClose={() => setMenu(null)} align="end" width={250}>
        {loaded?.pageId && (
          <MenuItem icon={<ExternalLink size={14} />} onClick={() => (setMenu(null), go(`/pages/${loaded.pageId}`))}>
            Open on its own page
          </MenuItem>
        )}
        {loaded?.path && (
          <MenuItem icon={<FolderOpen size={14} />} onClick={() => (setMenu(null), showInFiles(loaded.path!))}>
            Show in Files
          </MenuItem>
        )}
        {loaded?.path && canReveal() && (
          <MenuItem icon={<FolderOpen size={14} />} onClick={() => (setMenu(null), reveal(loaded.path!))}>
            {revealLabel()}
          </MenuItem>
        )}
        {loaded?.pageId ? (
          EXPORTS(loaded.kind).map((x) => (
            <MenuItem key={x.format} icon={x.icon} onClick={() => (setMenu(null), void exportFile(loaded.pageId!, x.format, { deck: loaded.kind === 'slides' ? (loaded.model?.model as Deck) : undefined }).catch(toastError))}>
              {`Download as ${x.label}`}
            </MenuItem>
          ))
        ) : (
          <MenuItem icon={<Download size={14} />} onClick={() => (setMenu(null), download())}>
            Save as a file
          </MenuItem>
        )}
        {layout === 'panel' && (
          <>
            <MenuSep />
            <AutoSwitch />
          </>
        )}
      </Popover>
      <Popover anchor={pickRef} open={menu === 'pick'} onClose={() => setMenu(null)} width={300}>
        <div className="px-2.5 pt-1.5 pb-1 text-[11.5px] font-medium text-fg-3">Pages in this conversation</div>
        {picks.slice(0, 9).map((it) => {
            const k = pageCall(it.tool);
            return (
              <MenuItem
                key={it.id}
                icon={k === 'file' ? <FileCode2 size={14} /> : <AppWindow size={14} />}
                onClick={() => {
                  setMenu(null);
                  if (layout === 'panel') useCanvas.getState().show(key, { kind: 'item', id: it.id });
                  else openOver(key, { kind: 'item', id: it.id });
                }}
              >
                <span translate="no" className={cx('truncate', pageKey(it) === shownKey && 'font-semibold')}>
                  {titleOf(it, k)}
                </span>
              </MenuItem>
            );
          })}
      </Popover>
    </>
  );

  const [isDirty, setDirty] = useState(false);
  const [confirm, confirmNode] = useConfirm();
  // A newer version saved meanwhile (the agent's, say): asked before yours goes on top of it.
  const save = async (html: string) => {
    if (!loaded) return false;
    try {
      return await loaded.save(html);
    } catch (e) {
      if ((e as { status?: number }).status !== 409) throw e;
      if (!(await confirm({ title: 'A newer version is there', body: 'The page was saved again while you changed it (by the agent, say). Save yours on top? The other stays among its versions.', confirm: 'Save on top' }))) return false;
      return loaded.save(html, true);
    }
  };
  useEffect(() => {
    if (isDirty) dirty.add(key);
    else dirty.delete(key);
    return () => void dirty.delete(key);
  }, [isDirty, key]);
  // Resolve with AI on its comments (common/commentAi.tsx): a message to this conversation, unsaved changes saved first,
  // naming the page (the conversation may have made several).
  const saveNow = useRef<(() => Promise<boolean>) | null>(null);
  const commentAi = useCommentAi(
    loaded?.pageId ? `chat:${key}:${loaded.pageId}` : null,
    async (prompt) => {
      try {
        if (!((await saveNow.current?.()) ?? true)) return;
        await sendToSession(key, `${pageNamed(title, loaded?.pageId)}${prompt}`);
      } catch (e) {
        toastError(e);
      }
    },
    key,
  );

  // Full screen, or back beside the conversation: its editor starts afresh there, so changes not saved are saved first.
  const full = async () => {
    if (isDirty) {
      if (!(await confirm({ title: 'Save your changes first?', body: 'It opens afresh there: changes that are not saved yet would be lost.', confirm: 'Save' }))) return;
      try {
        if (!((await saveNow.current?.()) ?? true)) return;
      } catch (e) {
        return void toastError(e);
      }
    }
    moveOver(key, target, layout);
  };

  const Editor = loaded?.kind ? EDITORS[loaded.kind] : fresh && saving ? EDITORS[saving] : undefined;
  // A new one being written: its editor, empty until the first words come (the same editor then shows it saved).
  const empty = useEmptyModel(fresh ? saving : null);
  const freshDoc = useMemo(() => (fresh && saving && draft && empty ? { key: `draft:${draft.id}`, title: draft.title ?? title, model: empty } : null), [fresh, saving, draft?.id, empty]);
  if (Editor && ((loaded?.kind && loaded.model && loaded.saveModel) || freshDoc)) {
    const saveModel = loaded?.saveModel;
    return (
      <>
        {confirmNode}
        <Editor
          doc={loaded?.model ?? freshDoc}
          pageId={loaded?.pageId ?? ''}
          layout={layout}
          onSave={
            saveModel
              ? async (model: unknown) => {
                  try {
                    return await saveModel(model);
                  } catch (e) {
                    if ((e as { status?: number }).status !== 409) throw e;
                    if (!(await confirm({ title: 'A newer version is there', body: 'It was saved again while you changed it (by the agent, say). Save yours on top? The other stays among its versions.', confirm: 'Save on top' })))
                      return false;
                    return saveModel(model, true);
                  }
                }
              : undefined
          }
          readOnly={!saveModel}
          onDirty={setDirty}
          lead={lead}
          tail={tail}
          band={
            writing && isDirty ? (
              <div className="flex shrink-0 items-center gap-2 border-b border-line bg-accent-soft px-3 py-2 text-[12.5px] text-fg-2">
                <span className="breathe h-1.5 w-1.5 shrink-0 rounded-full bg-busy" />
                <span className="min-w-0 flex-1">An agent is writing a new version. Your changes stay as they are here until you save them.</span>
              </div>
            ) : undefined
          }
          savedNote="the agent sees your changes with your next message"
          saveNowRef={saveNow}
          commentAi={saveModel ? commentAi : undefined}
          onAsk={(text) => {
            composeInsert(text, key);
            if (layout === 'sheet') onClose();
          }}
          onRequest={
            saveModel
              ? (r) => {
                  // A conversation goes on here: its message box takes the whole request, to send as it is or changed.
                  composeInsert(r.full, key);
                  if (layout === 'sheet') onClose();
                }
              : undefined
          }
          live={live}
        />
      </>
    );
  }

  return (
    <>
    {confirmNode}
    <Studio
      doc={loaded?.doc ?? null}
      draft={draft && !saving ? { text: draft.text, done: draft.done } : null}
      layout={layout}
      onSave={loaded ? save : undefined}
      onPick={onPick}
      onDirty={setDirty}
      lead={lead}
      tail={tail}
      initialMode={target.edit ? 'edit' : undefined}
      saveLabel={kind === 'show_html' && !loaded?.pageId ? 'Keep with changes' : 'Save'}
      pageId={loaded?.pageId}
      savedNote="the agent sees your changes with your next message"
      saveNowRef={saveNow}
      commentAi={loaded ? commentAi : undefined}
      onAsk={(text) => {
        composeInsert(text, key);
        // Over everything on a phone: the message box is under it.
        if (layout === 'sheet') onClose();
      }}
      onRequest={
        loaded?.pageId
          ? (r) => {
              composeInsert(r.full, key);
              if (layout === 'sheet') onClose();
            }
          : undefined
      }
    />
    </>
  );
}

/** The panel's left edge: drag it to make the panel wider or narrower. */
/** The panel's left edge, dragged to resize it (pages and templates beside a conversation share its width). */
export function Grip() {
  const start = (e: React.PointerEvent) => {
    const box = (e.currentTarget.parentElement?.parentElement as HTMLElement | null)?.getBoundingClientRect();
    if (!box) return;
    e.preventDefault();
    const move = (ev: PointerEvent) => useCanvas.getState().setWidth((box.right - ev.clientX) / box.width);
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  };
  return <div onPointerDown={start} title="Drag to resize" className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize hover:bg-accent/30" />;
}

/** The panel beside the conversation, when it shows something and the screen is wide enough. */
export function CanvasSide({ s }: { s: SessionSummary }) {
  const target = useCanvas((x) => x.open[s.key]);
  const width = useCanvas((x) => x.width);
  const wide = useMediaQuery(CANVAS_MEDIA);
  if (!target || !wide) return null;
  const close = () => closeCanvas(s.key);
  return (
    <aside style={{ width: `${width * 100}%` }} className="relative flex min-h-0 shrink-0 flex-col border-l border-line">
      <Grip />
      {target.kind === 'review' ? (
        <ReviewBeside sessionKey={s.key} id={target.id} onClose={close} />
      ) : target.kind === 'file' ? (
        <FilePanel key={`file:${target.id}`} sessionKey={s.key} target={target} layout="panel" onClose={close} />
      ) : (
        <SessionPage key={`${target.kind}:${target.id}:${target.edit ? 'edit' : ''}`} sessionKey={s.key} target={target} layout="panel" onClose={close} />
      )}
    </aside>
  );
}

/** A document that is a file, in the panel or over everything: the file under the panel's own buttons (BesideFile.tsx). */
function FilePanel({ sessionKey: key, target, layout, onClose }: { sessionKey: string; target: CanvasTarget; layout: 'panel' | 'sheet' | 'page'; onClose: () => void }) {
  const path = target.id;
  const [isDirty, setDirty] = useState(false);
  useEffect(() => {
    if (isDirty) dirty.add(key);
    else dirty.delete(key);
    return () => void dirty.delete(key);
  }, [isDirty, key]);
  return (
    <SessionFile
      sessionKey={key}
      path={path}
      layout={layout}
      onDirty={setDirty}
      tail={(leave) => (
        <>
          <FullButton layout={layout} onClick={() => void leave().then((ok) => ok && moveOver(key, target, layout))} />
          <FileMore
            path={path}
            inFiles={false}
            small
            iconSize={15}
            sessionKey={key}
            extra={
              <>
                <MenuItem icon={<FolderOpen size={14} />} onClick={() => void leave().then((ok) => ok && (onClose(), showInFiles(path)))}>
                  Open in Files
                </MenuItem>
                {layout === 'panel' && <AutoSwitch />}
                <MenuSep />
              </>
            }
          />
          <IconButton label="Close" size="sm" onClick={() => void leave().then((ok) => ok && onClose())}>
            <X size={15} />
          </IconButton>
        </>
      )}
    />
  );
}

/** Before and after screenshots of a web app the agent changed, beside the conversation, with the reply's other screens. */
function ReviewBeside({ sessionKey, id, onClose }: { sessionKey: string; id: string; onClose: () => void }) {
  const items = useTimeline((x) => x.byKey[sessionKey]?.items);
  const overlay = useLive((x) => x.byKey[sessionKey]?.overlay);
  const shots = useMemo(() => {
    const seen = new Set<string>();
    const all = [...(items ?? []), ...(overlay?.items ?? [])].filter((i) => !seen.has(i.id) && !!seen.add(i.id));
    return shotsOfTurn(all, id);
  }, [items, overlay, id]);
  return <ReviewPane sessionKey={sessionKey} items={shots} id={id} onClose={onClose} />;
}

/** Whether a session shows something beside its conversation now. */
export function useCanvasOpen(key: string): boolean {
  const open = !!useCanvas((x) => x.open[key]);
  const wide = useMediaQuery(CANVAS_MEDIA);
  return open && wide;
}
/** Closes it by hand (its ✕, or the session's details opened in its place): nothing more opens there by itself in this turn. */
export const closeCanvas = (key: string) => {
  closedByHand(key);
  useCanvas.getState().close(key);
};

// ---- over everything, on a phone or a narrow window ---------------------------------------------------------

const useOver = create<{ at: { key: string; target: CanvasTarget } | null }>(() => ({ at: null }));
/** Opens a page of a session over everything (where there is no room beside the conversation). */
export const openOver = (key: string, target: CanvasTarget) => useOver.setState({ at: { key, target } });

/** A page opened over everything, if one is: mounted once by the pages feature. */
export function PageOver() {
  const at = useOver((x) => x.at);
  const mobile = useIsMobile();
  if (!at) return null;
  const close = () => useOver.setState({ at: null });
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-bg pt-[var(--safe-top)]">
      {at.target.kind === 'file' ? (
        <FilePanel key={`${at.key}:file:${at.target.id}`} sessionKey={at.key} target={at.target} layout={mobile ? 'sheet' : 'page'} onClose={close} />
      ) : (
        <SessionPage key={`${at.key}:${at.target.kind}:${at.target.id}`} sessionKey={at.key} target={at.target} layout={mobile ? 'sheet' : 'page'} onClose={close} />
      )}
    </div>,
    document.body,
  );
}
