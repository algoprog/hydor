// The app's side of a page's frame (/htmlframe, sandboxed; the bridge inside is server/pages/kit.ts).
// It posts the page with a fresh number each time the frame is ready, and takes only messages from
// that frame, carrying that number, of a known shape and size: the page's height, a choice or a form
// to put in the message box, and calls of window.hydor.storage, which a store answers. A template's
// screen also gets window.hydor.app: its calls are answered here, for that template only (its runs,
// its data), and what changes in them is passed on to it. A video's still in a page plays over it here, and a link to
// another of the Library's pages opens that page in the app.
// In Edit, the frame holds the visual editor (editor.ts): what it picks and changes comes back here, and
// what it asks for (an emoji, a picture, maths…) is chosen in the app and sent back to it.
import { createContext, forwardRef, useContext, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { KIT_CSS } from '@shared/page-kit';
import { codeColoursScript, hasCode } from '@shared/code-colours';
import { cleanAnchor, type PageAnchor } from '@shared/page-comments';
import { hasDbParts, pageDbScript } from '@shared/page-db';
import { dbLabels } from './studio/blocks';
import { BLOCK_ASKS, type BlockAsk } from './studio/BlockAsks';
import { STORAGE_LIMITS } from '@shared/pages';
import type { AppRun } from '@shared/apps';
import type { AppInfo } from '@shared/app-manifest';
import { api, del, enc, patch, post } from '../../lib/api';
import { onFeatureEvent } from '../../lib/featureEvents';
import { go } from '../../lib/nav';
import { tr } from '../../i18n/runtime';
import { cx, Throbber } from '../../components/ui';
import { openVideo } from '../../components/Lightbox';

// ---- how tall a page stands in the conversation ---------------------------------------------------------

/**
 * A page in the conversation stops at half the window's height (240 to 600 pixels), so what is around it stays in
 * sight; a taller one shows See the whole page. Measured again when the window's width changes, not when only its
 * height does (a phone's keyboard, its address bar): cards keep still while you type or scroll.
 */
const previewMax = (() => {
  let value = 0;
  let width = 0;
  const subs = new Set<() => void>();
  const measure = () => {
    if (value && window.innerWidth === width) return;
    width = window.innerWidth;
    const next = Math.round(Math.min(600, Math.max(240, window.innerHeight * 0.5)));
    if (next === value) return;
    value = next;
    for (const f of subs) f();
  };
  return {
    get: () => {
      if (!value) measure();
      return value;
    },
    subscribe: (f: () => void) => {
      if (!subs.size) {
        window.addEventListener('resize', measure);
        // The window may have changed while no card was on screen.
        measure();
      }
      subs.add(f);
      return () => {
        subs.delete(f);
        if (!subs.size) window.removeEventListener('resize', measure);
      };
    },
  };
})();

/** The most a page shows of itself in the conversation, in pixels (previewMax). */
export const usePreviewMax = () => useSyncExternalStore(previewMax.subscribe, previewMax.get);

/** A template's screen: what the frame tells it of its template. */
export interface AppBridge {
  info: AppInfo;
}

/**
 * An app's view (shared/app-ui.ts), drawn in the frame by the view's kit: the view, its values, and what it may
 * ask of the app. `onOp` answers what it asks (find records, keep a value, ask the agent, run a flow…); the frame
 * passes on news of the app's runs and data (`appId`), and new values whenever `ctx` changes.
 */
export interface UiBridge {
  def: unknown;
  ctx: Record<string, unknown>;
  can: string[];
  appId?: string;
  /** The page it opens on. */
  start?: string;
  lang?: string;
  /** The libraries its widgets import: an import map's entries (jsDelivr only), and stylesheets. */
  libs?: { imports: Record<string, string>; css: string[] };
  onOp: (op: string, args: Record<string, unknown>) => Promise<unknown>;
}

/** The words a view's kit says itself, in the app's language. */
const uiLabels = () => ({
  yes: tr('Yes'),
  no: tr('No'),
  back: tr('Back'),
  loading: tr('Loading…'),
  cannot: tr('This can’t be done here.'),
  ownPage: tr('This shows on the app’s own page.'),
  noElement: tr('No element'),
  copied: tr('Copied'),
  libFailed: tr('Its library could not be loaded: is this device online?'),
  noPlaces: tr('No places to show on the map.'),
  noMapBase: tr('This browser can’t draw the map itself, so only the places are shown.'),
  noData: tr('Nothing to draw yet.'),
  noVideo: tr('This video cannot be shown here.'),
  noWidget: tr('No widget'),
  play: tr('Play'),
});

/** The App parts' words, in the app's language. */
const appLabels = () => ({
  run: tr('Run'),
  working: tr('Working…'),
  starting: tr('Starting…'),
  waiting: tr('Waiting'),
  needsYou: tr('Needs you in the app'),
  done: tr('Done'),
  failed: tr('Did not finish'),
  stopped: tr('Stopped'),
  noRuns: tr('No runs yet'),
  empty: tr('Nothing here yet'),
  nothingFound: tr('Nothing found'),
  search: tr('Search'),
  remove: tr('Remove'),
  yes: tr('Yes'),
  no: tr('No'),
  now: tr('just now'),
  noFlow: tr('This app has no flow'),
  noData: tr('This app keeps no collection'),
  message: tr('Write a message…'),
  send: tr('Send'),
  newChat: tr('New conversation'),
  earlier: tr('Earlier conversations'),
  chatHint: tr('Ask its agent about what it keeps, or to run it for you.'),
  queued: tr('Waiting its turn'),
});

const COLLECTION = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

interface ChatDetail {
  run: AppRun;
  first?: string;
  asks?: { text: string; at?: number; reply?: string }[];
  queued?: { text: string; at: number }[];
}

/** A conversation as a screen sees it: its messages in order, and whether its agent is at work on a reply. */
function chatOf(appId: string, d: ChatDetail) {
  if (d.run.app !== appId || d.run.source !== 'chat') throw new Error('That is not a conversation of this app');
  const msgs: { from: 'you' | 'agent'; text: string; queued?: boolean }[] = [{ from: 'you', text: String(d.run.inputs.message ?? '') }];
  if (d.first) msgs.push({ from: 'agent', text: d.first });
  for (const x of d.asks ?? []) {
    msgs.push({ from: 'you', text: x.text });
    if (x.reply) msgs.push({ from: 'agent', text: x.reply });
  }
  for (const q of d.queued ?? []) msgs.push({ from: 'you', text: q.text, queued: true });
  const busy = d.run.status === 'queued' || d.run.status === 'starting' || d.run.status === 'running';
  return { id: d.run.id, status: d.run.status, working: busy, messages: msgs, ...(d.run.error ? { error: d.run.error } : {}) };
}

/** One call of a screen's window.hydor.app (or a view's), for its own template: its flows' runs and its data. */
export function appCall(appId: string, op: string, a: Record<string, unknown>): Promise<unknown> {
  const id = enc(appId);
  const col = () => {
    if (typeof a.collection !== 'string' || !COLLECTION.test(a.collection)) throw new Error('That is not a collection');
    return enc(a.collection);
  };
  const query = (q: Record<string, unknown>) =>
    new URLSearchParams(Object.entries(q).flatMap(([k, v]) => (v === undefined || v === null || v === '' ? [] : [[k, typeof v === 'object' ? JSON.stringify(v) : String(v)]]))).toString();
  switch (op) {
    case 'run':
      return post<{ run: AppRun }>(`/api/apps/${id}/runs`, { flow: typeof a.flow === 'string' ? a.flow : 'run', inputs: a.inputs && typeof a.inputs === 'object' ? a.inputs : {}, source: 'screen' }).then((r) => r.run);
    case 'get':
      return api<{ run: AppRun; steps?: unknown[]; progress?: unknown }>(`/api/apps/runs/${enc(String(a.id ?? ''))}`).then((d) => {
        if (d.run.app !== appId) throw new Error('That is not a run of this app');
        return { run: d.run, steps: d.steps ?? [], progress: d.progress };
      });
    case 'runs':
      return api<{ runs: AppRun[] }>(`/api/apps/${id}/runs`).then((r) => r.runs.filter((x) => !a.flow || (x.flow ?? 'run') === a.flow).slice(0, Math.max(1, Math.min(Number(a.limit) || 10, 50))));
    case 'find':
      return api(`/api/apps/${id}/data/${col()}?${query({ where: a.where, q: a.search, sort: a.sort, limit: a.limit })}`);
    case 'search':
      return api(`/api/apps/${id}/data/${col()}?${query({ ask: a.query, mode: a.mode, limit: a.limit })}`);
    case 'add':
      return post<{ record: unknown }>(`/api/apps/${id}/data/${col()}`, { record: a.record }).then((r) => r.record);
    case 'update':
      return patch<{ record: unknown }>(`/api/apps/${id}/data/${col()}/${enc(String(a.id ?? ''))}`, { set: a.set }).then((r) => r.record);
    case 'remove':
      return del(`/api/apps/${id}/data/${col()}/${enc(String(a.id ?? ''))}`);
    // A conversation with its agent: a message starts one, or goes on with the one named.
    case 'chat': {
      const text = String(a.text ?? '').trim();
      if (!a.id) return post<{ run: AppRun }>(`/api/apps/${id}/chats`, { text }).then((r) => chatOf(appId, { run: r.run }));
      return post<{ run: AppRun }>(`/api/apps/runs/${enc(String(a.id))}/ask`, { text }).then(() => appCall(appId, 'chat-get', { id: a.id }));
    }
    case 'chat-get':
      return api<ChatDetail>(`/api/apps/runs/${enc(String(a.id ?? ''))}`).then((d) => chatOf(appId, d));
    case 'chats':
      return api<{ chats: unknown[] }>(`/api/apps/${id}/chats`).then((r) => r.chats);
    default:
      return Promise.reject(new Error('That is not something a screen can do'));
  }
}

export interface StoreCall {
  op: 'get' | 'set' | 'remove' | 'keys';
  key?: string;
  value?: unknown;
}
export type Store = (c: StoreCall) => Promise<unknown>;

/** A page that is not saved: its storage lasts while it is on screen. */
export function memoryStore(): Store & { dump(): Record<string, unknown> } {
  const m = new Map<string, string>();
  const store = async (c: StoreCall) => {
    if (c.op === 'keys') return [...m.keys()];
    if (c.op === 'get') return m.has(c.key!) ? JSON.parse(m.get(c.key!)!) : null;
    if (c.op === 'remove') m.delete(c.key!);
    else {
      if (!m.has(c.key!) && m.size >= STORAGE_LIMITS.keys) throw new Error(`A page keeps at most ${STORAGE_LIMITS.keys} keys`);
      m.set(c.key!, JSON.stringify(c.value));
    }
    return null;
  };
  return Object.assign(store, { dump: () => Object.fromEntries([...m].map(([k, v]) => [k, JSON.parse(v)])) });
}

/** A saved page's storage, kept by the server. */
export const pageStore =
  (id: string): Store =>
  (c) =>
    post<{ value: unknown }>(`/api/pages/${enc(id)}/storage`, c).then((r) => r.value ?? null);

/** An older version on view: it reads the page's data, but what it changes is not kept. */
export function previewStore(id: string): Store {
  const real = pageStore(id);
  const mine = memoryStore();
  const gone = new Set<string>();
  return async (c) => {
    if (c.op === 'keys') {
      const keys = new Set([...((await real(c)) as string[]), ...((await mine(c)) as string[])]);
      return [...keys].filter((k) => !gone.has(k));
    }
    if (c.op === 'get') return gone.has(c.key!) ? null : (await mine({ op: 'keys' }) as string[]).includes(c.key!) ? mine(c) : real(c);
    if (c.op === 'remove') gone.add(c.key!);
    else gone.delete(c.key!);
    return mine(c);
  };
}

/** One line of text from a page: no control characters, no runs of spaces. */
const line = (s: string) => s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** What a choice puts in the message box: "Chose: B", "Color: Blue, Green"; nothing once none is picked. */
export function pickText(name: string, values: string[]): string {
  const v = values.map(line).filter(Boolean);
  return v.length ? `${line(name) || 'Chose'}: ${v.join(', ')}` : '';
}

/** What a form puts there: its name, then a line per filled field (fields of one name together). */
export function formText(name: string, fields: [string, string][]): string {
  const by = new Map<string, string[]>();
  for (const [k, v] of fields) {
    const val = clip(v.replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ').trim(), 500);
    if (val) by.set(line(k) || 'answer', [...(by.get(line(k) || 'answer') ?? []), val]);
  }
  const head = line(name) || 'Answers';
  return by.size ? `${head}:\n${[...by].map(([k, v]) => `- ${k}: ${v.join(', ')}`).join('\n')}` : `${head}: (nothing filled in)`;
}

const nonce = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');

/** The app's light or dark, now. */
const themeNow = () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light');

/** The page kit's colours, from the app theme's (lib/theme.ts paints them on the page's root). */
const KIT_OF: [string, string][] = [
  ['--n-bg', 'bg'],
  ['--n-card', 'panel'],
  ['--n-fg', 'fg'],
  ['--n-muted', 'fg-3'],
  ['--n-line', 'line'],
  ['--n-soft', 'bg-2'],
  ['--n-accent', 'accent'],
  ['--n-accent-fg', 'accent-fg'],
  ['--n-ok', 'ok'],
  ['--n-warn', 'warn'],
  ['--n-err', 'err'],
  ['--n-info', 'info'],
  // A chart's or a diagram's series.
  ['--n-c1', 'accent'],
  ['--n-c2', 'info'],
  ['--n-c3', 'ok'],
  ['--n-c4', 'warn'],
  ['--n-c5', 'claude'],
  ['--n-c6', 'codex'],
];

let faces: string | null = null;
/** The app's own fonts, for a page to load them too (from this server: absolute addresses, as a page has a base of its own). */
function fontFaces(): string {
  if (faces !== null) return faces;
  const out: string[] = [];
  const walk = (rules: CSSRuleList, href: string) => {
    for (const r of Array.from(rules)) {
      if (r instanceof CSSFontFaceRule) {
        if (/Inter Variable|JetBrains Mono Variable/.test(r.style.getPropertyValue('font-family'))) out.push(r.cssText.replace(/url\((['"]?)([^'")]+)\1\)/g, (_m, _q, u: string) => `url("${new URL(u, href).href}")`));
      } else if ('cssRules' in r) walk((r as CSSGroupingRule).cssRules, href);
    }
  };
  for (const sh of Array.from(document.styleSheets)) {
    try {
      walk(sh.cssRules, sh.href ?? location.href);
    } catch {}
  }
  return (faces = out.join('').replace(/</g, ''));
}

/**
 * The app's current theme as the page kit's colours and font (server/pages/kit.ts puts it after the kit), so a
 * page made with the kit looks like part of the app: its light or dark, and the user's own colours. In the dark
 * they go to body.n-page only, as the kit's own dark ones do: a page of its own colours keeps its light kit parts.
 */
export function themeCss(): string {
  const cs = getComputedStyle(document.documentElement);
  const v = (k: string) => cs.getPropertyValue(`--${k}`).trim();
  const colours = KIT_OF.map(([n, k]) => [n, v(k)]).filter(([, x]) => /^[#\w(),.%\s/-]{1,80}$/.test(x));
  const accent = v('accent');
  if (/^[#\w(),.%\s/-]{1,80}$/.test(accent)) colours.push(['--n-accent-soft', `color-mix(in srgb, ${accent} 14%, transparent)`]);
  const font = (k: string) => v(k).replace(/[;{}<>]/g, '');
  const fonts = [font('font-sans') && `--n-font:${font('font-sans')}`, font('font-mono') && `--n-mono:${font('font-mono')}`].filter(Boolean).join(';');
  return `${fontFaces()}:root{${fonts}}${themeNow() === 'dark' ? 'html[data-n-theme] .n-page' : ':root'}{${colours.map(([n, x]) => `${n}:${x}`).join(';')}}${partWords()}`;
}

/** What a template's parts say where they stand unrun (in the editor), in the app's language: the words before and after the part's name. */
function partWords(): string {
  const str = (s: string) => `"${s.replace(/[\\"]/g, '\\$&').replace(/[\n\r<]/g, ' ')}"`;
  const words: [string, string][] = [
    ['form', tr('Form: {0}')],
    ['answer', tr('Answer: {0}')],
    ['table', tr('Table: {0}')],
    ['runs', tr('Runs: {0}')],
    ['count', tr('Count: {0}')],
    ['chat', tr('A conversation with its agent')],
  ];
  const vars = words.map(([k, w]) => {
    const [a, b = ''] = w.split('{0}');
    return `--n-w-${k}-a:${str(a)};--n-w-${k}-b:${str(b)}`;
  });
  return `:root{${vars.join(';')}}`;
}

/** The app's theme changed (lib/theme.ts): `f` tells the page. */
function useThemeChange(f: () => void) {
  const cb = useRef(f);
  cb.current = f;
  useEffect(() => {
    const on = () => cb.current();
    window.addEventListener('wa:theme', on);
    return () => window.removeEventListener('wa:theme', on);
  }, []);
}

/**
 * A page as a file to keep: with the kit's stylesheet, so its ready-made classes and colours work wherever it is
 * opened, light or dark as that device is, and the script that colours its code blocks.
 */
export function pageFile(html: string): string {
  const head = `<style id="n-kit">${KIT_CSS}</style><script>document.documentElement.setAttribute('data-n-theme',matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')</script>${hasCode(html) ? codeColoursScript() : ''}${hasDbParts(html) ? pageDbScript() : ''}`;
  const d = /^(?:\s|<!--[\s\S]*?-->)*<!doctype[^>]*>/i.exec(html);
  return d ? d[0] + head + html.slice(d[0].length) : head + html;
}

/**
 * A frame before its page is drawn shows the app's colour (no white flash in the dark), and has the light
 * scheme pages are written for: of another scheme than its page, the browser would paint a backdrop of its
 * own (white) behind it, which shows wherever the page paints nothing.
 */
const FRAME_CLS = 'block h-full w-full border-0 bg-white [color-scheme:light] dark:bg-[#151412]';
/** The page's own colour, which the frame says once it is drawn: shown where it bounces at an end. */
const paintBg = (f: HTMLIFrameElement | null, bg: unknown) => {
  if (f && typeof bg === 'string' && bg.length < 80) f.style.backgroundColor = bg;
};
const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const OPS = new Set(['get', 'set', 'remove', 'keys']);

export interface Pick {
  /** Which choice it is, so a later pick in the same group takes its place. */
  group: string;
  text: string;
}

/**
 * A page, rendered in the sandboxed frame. Give it a `key` that changes with the page: the frame takes
 * its page once, when it loads.
 */
export function PageFrame({
  html,
  store,
  onHeight,
  onPick,
  title = 'Page',
  className,
  fill,
  app,
  ui,
}: {
  html: string;
  store: Store;
  onHeight?: (h: number) => void;
  onPick?: (p: Pick) => void;
  title?: string;
  className?: string;
  /** The frame fills a space of its own (over everything), rather than growing with the page. */
  fill?: boolean;
  /** A template's screen: window.hydor.app, for that template. */
  app?: AppBridge;
  /** An app's view, drawn in the page by the view's kit. */
  ui?: UiBridge;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const offline = useContext(OfflineFrames);
  const cb = useRef({ html, store, onHeight, onPick, fill, app, ui });
  cb.current = { html, store, onHeight, onPick, fill, app, ui };
  const nRef = useRef('');
  // What changes in the template's runs and data reaches its screen (and its view).
  const appId = app?.info.id;
  const uiApp = ui?.appId;
  useEffect(() => {
    if (!appId && !uiApp) return;
    return onFeatureEvent('apps', (e) => {
      const w = ref.current?.contentWindow;
      const n = nRef.current;
      const d = e.data as { run?: AppRun; data?: { app: string; collection: string } } | null;
      if (!w || !n || !d) return;
      if (appId && d.run?.app === appId) w.postMessage({ type: 'wa-app-event', n, kind: 'run', run: d.run }, '*');
      const changed = d.data;
      if (appId && changed?.app === appId) w.postMessage({ type: 'wa-app-event', n, kind: 'data', collection: changed.collection }, '*');
      if (uiApp && d.run && (d.run.app === uiApp || d.run.app === `tpl:${uiApp}`)) w.postMessage({ type: 'wa-ui-run', n, run: d.run }, '*');
      if (uiApp && changed && (changed.app === uiApp || changed.app === `tpl:${uiApp}`)) w.postMessage({ type: 'wa-ui-data', n, collection: changed.collection }, '*');
    });
  }, [appId, uiApp]);
  // A view's new values (its run changed, a follow-up updated its answer): it draws itself again with them.
  const uiCtx = ui?.ctx;
  const sentCtx = useRef<unknown>(null);
  useEffect(() => {
    const w = ref.current?.contentWindow;
    if (!uiCtx || !w || !nRef.current || sentCtx.current === uiCtx) return;
    sentCtx.current = uiCtx;
    w.postMessage({ type: 'wa-ui-ctx', n: nRef.current, ctx: uiCtx }, '*');
  }, [uiCtx]);
  useThemeChange(() => nRef.current && ref.current?.contentWindow?.postMessage({ type: 'wa-html-theme', n: nRef.current, theme: themeNow(), css: themeCss() }, '*'));
  // Before the frame can load (it posts "ready" as soon as it does).
  useLayoutEffect(() => {
    let n = '';
    let busy = 0;
    let appBusy = 0;
    let picks: number[] = [];
    let opened = 0;
    let saved = 0;
    const onMessage = (e: MessageEvent) => {
      const w = ref.current?.contentWindow;
      // Only this frame: a sandboxed page's origin is opaque ("null").
      if (!w || e.source !== w || e.origin !== 'null') return;
      const d = e.data;
      if (!d || typeof d !== 'object' || Array.isArray(d) || typeof d.type !== 'string') return;
      if (d.type === 'wa-html-ready') {
        n = nonce();
        nRef.current = n;
        const appInfo = cb.current.app ? { info: cb.current.app.info, labels: appLabels() } : undefined;
        const v = cb.current.ui;
        const uiInfo = v ? { def: v.def, ctx: v.ctx, can: v.can, labels: uiLabels(), lang: v.lang ?? 'en', ...(v.start ? { start: v.start } : {}), ...(v.libs ? { libs: v.libs } : {}) } : undefined;
        if (v) sentCtx.current = v.ctx;
        // (a page with databases: their words in the app's language)
        const db = hasDbParts(cb.current.html) ? dbLabels() : undefined;
        w.postMessage({ type: 'wa-html-page', html: cb.current.html, n, theme: themeNow(), css: themeCss(), max: { key: STORAGE_LIMITS.key, value: STORAGE_LIMITS.value }, fill: !!cb.current.fill, play: true, open: true, app: appInfo, ui: uiInfo, db }, '*');
        return;
      }
      const { store, onHeight, onPick } = cb.current;
      // The height alone may come without the number (a frame from before the bridge had one).
      if (d.type === 'wa-html-size' && (d.n === n || d.n === undefined)) {
        if (typeof d.h === 'number' && Number.isFinite(d.h) && d.h >= 0) onHeight?.(Math.min(d.h, 100_000));
        if (d.n === n) paintBg(ref.current, d.bg);
        return;
      }
      if (!n || d.n !== n) return;
      if (d.type === 'wa-pick' || d.type === 'wa-form') {
        // Ten a second at most: a page cannot fill the message box by itself.
        const now = Date.now();
        picks = picks.filter((t) => now - t < 1000);
        if (!onPick || picks.length >= 10) return;
        if (d.type === 'wa-pick') {
          if (!isStr(d.g, 120) || !isStr(d.name, 100) || !Array.isArray(d.values) || d.values.length > 20 || !d.values.every((v: unknown) => isStr(v, 200))) return;
          picks.push(now);
          onPick({ group: `pick:${d.g}`, text: pickText(d.name, d.values) });
        } else {
          if (!isStr(d.name, 100) || !Array.isArray(d.fields) || d.fields.length > 40) return;
          if (!d.fields.every((f: unknown) => Array.isArray(f) && f.length === 2 && isStr(f[0], 100) && isStr(f[1], 2000))) return;
          picks.push(now);
          onPick({ group: `form:${d.name}`, text: formText(d.name, d.fields) });
        }
      } else if (d.type === 'wa-app') {
        const app = cb.current.app;
        if (!app || !Number.isInteger(d.id) || d.id < 1 || typeof d.op !== 'string') return;
        const reply = (m: { value?: unknown; error?: string }) => w.postMessage({ type: 'wa-app-reply', id: d.id, ...m }, '*');
        if (appBusy >= 16) return reply({ error: 'Too many calls at once' });
        appBusy++;
        Promise.resolve()
          .then(() => appCall(app.info.id, d.op, d.args && typeof d.args === 'object' && !Array.isArray(d.args) ? d.args : {}))
          .then(
            (value) => reply({ value: value ?? null }),
            (err) => reply({ error: String((err as Error)?.message ?? err) }),
          )
          .finally(() => appBusy--);
      } else if (d.type === 'wa-ui') {
        // What a view asks of its app: answered by its owner, for this app and this run only.
        const v = cb.current.ui;
        if (!v || !Number.isInteger(d.id) || d.id < 1 || typeof d.op !== 'string' || d.op.length > 20) return;
        const reply = (m: { value?: unknown; error?: string }) => w.postMessage({ type: 'wa-ui-reply', id: d.id, ...m }, '*');
        if (appBusy >= 16) return reply({ error: 'Too many calls at once' });
        const args = d.args && typeof d.args === 'object' && !Array.isArray(d.args) ? d.args : {};
        if (JSON.stringify(args).length > 200_000) return reply({ error: 'That is too much to send' });
        appBusy++;
        Promise.resolve()
          .then(() => v.onOp(d.op, args))
          .then(
            (value) => reply({ value: value ?? null }),
            (err) => reply({ error: String((err as Error)?.message ?? err) }),
          )
          .finally(() => appBusy--);
      } else if (d.type === 'wa-download') {
        const now = Date.now();
        if (now - saved > 1000 && isStr(d.name, 200) && isStr(d.mime, 100) && isStr(d.text, 20_000_000)) {
          saved = now;
          saveFile(d.name, d.mime, d.text);
        }
      } else if (d.type === 'wa-video') {
        // A video's still in the page (the page editor's): its player cannot run in the sandbox, so it plays over the page.
        if (isStr(d.src, 300)) openVideo(d.src, isStr(d.title, 200) ? d.title : '');
      } else if (d.type === 'wa-open-page') {
        // A link to another of the Library's pages (the page editor's a.n-pagelink), clicked: that page, in the app. Once a
        // second at most, so a page cannot move the app about by itself.
        const now = Date.now();
        if (isStr(d.id, 40) && /^[\w-]+$/.test(d.id) && now - opened > 1000) {
          opened = now;
          go(`/pages/${d.id}`);
        }
      } else if (d.type === 'wa-go') {
        // A place of the Library (a page's breadcrumbs), clicked: that place, in the app; once a second at most.
        const now = Date.now();
        if (isStr(d.path, 260) && /^\/(library|projects)(\/[\w-]{1,40})?(\?[\w=&%-]{0,200})?$/.test(d.path) && now - opened > 1000) {
          opened = now;
          go(d.path);
        }
      } else if (d.type === 'wa-ui-top') {
        // A view went to another page: its top comes into sight when it was scrolled past.
        const r = ref.current?.getBoundingClientRect();
        if (r && r.top < 0) ref.current?.scrollIntoView({ block: 'start' });
      } else if (d.type === 'wa-store') {
        if (!Number.isInteger(d.id) || d.id < 1) return;
        const reply = (m: { value?: unknown; error?: string }) => w.postMessage({ type: 'wa-store-reply', id: d.id, ...m }, '*');
        if (!OPS.has(d.op) || (d.op !== 'keys' && (!isStr(d.key, STORAGE_LIMITS.key) || !d.key))) return reply({ error: 'Not a storage call' });
        if (d.op === 'set') {
          const json = JSON.stringify(d.value);
          if (json === undefined) return reply({ error: 'set needs a value' });
          if (json.length > STORAGE_LIMITS.value) return reply({ error: `That value is over ${STORAGE_LIMITS.value / 1024} KB` });
        }
        if (busy >= 16) return reply({ error: 'Too many storage calls at once' });
        busy++;
        store({ op: d.op, key: d.key, value: d.value })
          .then(
            (value) => reply({ value }),
            (err) => reply({ error: String((err as Error)?.message ?? err) }),
          )
          .finally(() => busy--);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  return (
    <iframe
      ref={ref}
      src={frameSrc(offline)}
      title={title}
      sandbox={offline ? OFFLINE_SANDBOX : SANDBOX}
      // A slide deck's own page may go full screen to present; an app's view copies what its events copy.
      allow={[isDeckPage(html) && 'fullscreen', ui && 'clipboard-write'].filter(Boolean).join('; ') || undefined}
      className={cx(FRAME_CLS, className)}
    />
  );
}

/** A file a page asks to save (a database's CSV, a file in its cells): words, or a data: address. */
export function saveFile(name: string, mime: string, text: string) {
  const blob = (): Promise<Blob> => (text.startsWith('data:') ? fetch(text).then((r) => r.blob()) : Promise.resolve(new Blob([text], { type: /^[\w.+-]+\/[\w.+-]+(;[\w=-]+)?$/.test(mime) ? mime : 'text/plain' })));
  void blob().then((b) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim() || 'file';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
  });
}

/** A slide deck's own page (server/pages/slides.ts), by its marker. */
export const isDeckPage = (html: string) => html.slice(0, 6000).includes('<script type="application/json" id="n-deck">');

const SANDBOX = 'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals';

/**
 * Frames inside a confidential session's view (server/confidential): its pages load nothing from anywhere, send no
 * form and open no window (the server's OFFLINE_PAGE_CSP), so a page can't carry off what it shows.
 */
export const OfflineFrames = createContext(false);
const OFFLINE_SANDBOX = 'allow-scripts allow-modals';
const frameSrc = (offline: boolean) => (offline ? '/htmlframe?offline=1' : '/htmlframe');

/** A page's relative addresses (its pictures, its styles) resolved against `base`: an HTML file's own folder. */
export function withBase(html: string, base?: string): string {
  if (!base) return html;
  const tag = `<base href="${base.replace(/"/g, '&quot;')}" data-n-own>`;
  const m = /<head[^>]*>/i.exec(html);
  if (m) return html.slice(0, m.index + m[0].length) + tag + html.slice(m.index + m[0].length);
  const d = /^(?:\s|<!--[\s\S]*?-->)*<!doctype[^>]*>/i.exec(html);
  return d ? d[0] + tag + html.slice(d[0].length) : tag + html;
}

/**
 * A page still being written: drawn as far as it goes, its scripts held back, growing in place (what is
 * there stays) and following its end, at most a few times a second.
 */
/** A page being written, before any of it can be drawn (its head is still coming): the app's mark at work, in the frame's place. */
function PageComing({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white text-[13px] text-fg-3 dark:bg-[#151412]">
      <Throbber size={26} />
      <span>{tr(label)}</span>
    </div>
  );
}

export function StreamFrame({
  html,
  base,
  title = 'Page',
  onHeight,
  className,
  label = 'Writing the page…',
}: {
  html: string;
  base?: string;
  title?: string;
  onHeight?: (h: number) => void;
  className?: string;
  /** What shows until the page has something to show. */
  label?: string;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const offline = useContext(OfflineFrames);
  // Anything of the page drawn yet: until then, its mark at work (in a parent that places it, `relative`).
  const [drawn, setDrawn] = useState(false);
  const st = useRef({ ready: false, sent: '', n: '', html, base, onHeight, timer: 0 });
  st.current.html = html;
  st.current.base = base;
  st.current.onHeight = onHeight;
  const push = () => {
    const s = st.current;
    const w = ref.current?.contentWindow;
    if (!s.ready || !w || s.html === s.sent) return;
    s.sent = s.html;
    w.postMessage({ type: 'wa-html-stream', html: withBase(s.html, s.base), n: s.n, theme: themeNow(), css: themeCss() }, '*');
  };
  useThemeChange(() => {
    st.current.sent = '';
    push();
  });
  useLayoutEffect(() => {
    const s = st.current;
    const onMessage = (e: MessageEvent) => {
      const w = ref.current?.contentWindow;
      if (!w || e.source !== w || e.origin !== 'null' || !e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'wa-html-ready') {
        s.ready = true;
        s.n = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('');
        s.sent = '';
        push();
      } else if (e.data.type === 'wa-html-size' && e.data.n === s.n && typeof e.data.h === 'number' && Number.isFinite(e.data.h)) {
        s.onHeight?.(Math.min(Math.max(e.data.h, 0), 100_000));
        if (e.data.bg) paintBg(ref.current, e.data.bg);
        // A frame of an older server says nothing of it: drawn, then.
        if (e.data.drawn !== false) setDrawn(true);
      }
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(s.timer);
    };
  }, []);
  // A few times a second at most: each draw parses the page so far.
  useEffect(() => {
    const s = st.current;
    if (s.timer) return;
    s.timer = window.setTimeout(() => {
      s.timer = 0;
      push();
    }, 160);
  }, [html]);
  return (
    <>
      <iframe ref={ref} src={frameSrc(offline)} title={title} sandbox={offline ? OFFLINE_SANDBOX : SANDBOX} className={cx(FRAME_CLS, className)} />
      {!drawn && <PageComing label={label} />}
    </>
  );
}

/** What the visual editor says of the part picked (editor.ts `info`). */
export interface EdSel {
  path: number[];
  tag: string;
  name: string;
  crumbs: { name: string; tag: string; path: number[] }[];
  words?: string;
  wordy: boolean;
  children: number;
  /** It can hold other parts (Add can put one inside it). */
  holds: boolean;
  attrs: Record<string, string>;
  /** Its classes (not the editor's own). */
  classes: string[];
  /** How many parts there are of its kind ("tag") and with each of its classes (".card"). */
  counts: Record<string, number>;
  computed: Record<string, string>;
  inline: Record<string, string>;
  /** What is set for it where changes go now (this part, its kind or a class; on hover; at a size). */
  declared: Record<string, string>;
  /** A CSS selector that finds it, and a few of its words: what an agent is told of it. */
  selector: string;
  snippet: string;
  can: { up: boolean; down: boolean; parent: boolean; remove: boolean };
  /** The kind of block it is, which Turn into changes (writing.ts): p, h1…h6, bullet, number, todo, quote, code, toggle, callout. */
  kind?: string;
  /** How many blocks are picked with it, when it is more than one. */
  multi?: number;
  /** Maths drawn in the page: its TeX. */
  tex?: string;
  /** Its block's text colour and background, by name (the kit's .n-tc-… and .n-hl-…). */
  colour?: string;
  fill?: string;
  /** A code block: its language ('' for Auto, shared/code-colours.ts), and the one its code looks like. */
  lang?: string;
  langAuto?: string;
}

/** A part in the editor's Layers: where it is, its name, its tag, a few of its words, the parts in it. */
export interface EdLayer {
  p: number[];
  n: string;
  t: string;
  x: string;
  c: EdLayer[];
}

/** Text styles of a kind of part across the page: what the editor's stylesheet sets, and how the first one looks. */
export interface EdKind {
  declared: Record<string, string>;
  computed: Record<string, string>;
}

/** The page's own look, as the editor reads it (editor.ts `pageInfo`). */
export interface EdPage {
  vars: { name: string; value: string }[];
  fonts: string[];
  title: string;
  lang: string;
  css: string;
  kinds: Record<string, EdKind>;
  media: '' | 'tablet' | 'phone';
  bg: string;
  /** The page's icon (an emoji) and cover, as Notion pages have them. */
  icon?: string;
  cover?: { kind: 'gradient' | 'picture'; value: string } | null;
}

/** What the editor in the page asks the app for (writing.ts `ask`): chosen in the app, then put where it was asked. */
export interface EdAsk {
  what: 'emoji' | 'icon' | 'callout-icon' | 'cover' | 'picture' | 'video' | 'math' | BlockAsk;
  id: string;
  /** Where it was asked, in the frame's own pixels. */
  rect: { x: number; y: number; w: number; h: number } | null;
  /** There is one already (an icon, a cover), which can be taken away. */
  has?: boolean;
  /** A formula's TeX, to change it. */
  tex?: string;
  /** A newer block's own value, to change it: an embed's or a bookmark's address, a diagram's code, a chart's settings. */
  value?: string;
  /** A chart's sources: the page's databases, their names, titles and columns. */
  dbs?: { name: string; title: string; cols: { name: string; kind: string }[] }[];
}
/** What a file dropped on the page becomes: its own block (the same ones Add's Media makes). */
export type DroppedKind = 'picture' | 'pdf' | 'video' | 'audio' | 'file';
const DROPPED: DroppedKind[] = ['picture', 'pdf', 'video', 'audio', 'file'];
const droppedKind = (v: unknown): DroppedKind => (DROPPED.includes(v as DroppedKind) ? (v as DroppedKind) : 'picture');
/** The largest file of each kind: a picture is made small first; a video is the slides' limit; the rest are kept by the app (50 MB). */
const DROP_LIMITS: Record<DroppedKind, number> = { picture: 40_000_000, pdf: 50_000_000, audio: 50_000_000, file: 50_000_000, video: 200 * 1024 * 1024 };
const ASKS = new Set<string>(['emoji', 'icon', 'callout-icon', 'cover', 'picture', 'video', 'math', ...BLOCK_ASKS]);
const rectOf = (v: unknown): EdAsk['rect'] => {
  const r = v as Record<string, unknown> | null;
  return r && typeof r === 'object' && ['x', 'y', 'w', 'h'].every((k) => typeof r[k] === 'number' && Number.isFinite(r[k])) ? { x: r.x as number, y: r.y as number, w: r.w as number, h: r.h as number } : null;
};

export interface EdState {
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

export interface EditHandle {
  cmd(cmd: string, arg?: unknown): void;
  /** The page's HTML with the user's changes. */
  html(): Promise<string>;
  /** What it holds is saved: no longer changed. */
  saved(): void;
  /** The frame, to place what the app shows over the page. */
  frame(): HTMLIFrameElement | null;
  /** Where the blocks the page's comments are on are now (to keep with the comments once the page is saved). */
  anchors(): Promise<{ id: string; on: PageAnchor }[]>;
}

/** The page in the visual editor (its scripts held back), and the channel to it. */
export const EditFrame = forwardRef<
  EditHandle,
  {
    html: string;
    base?: string;
    title?: string;
    labels: Record<string, string>;
    onSel: (s: EdSel | null) => void;
    onState: (s: EdState) => void;
    onPalette?: (colors: string[]) => void;
    onSave?: () => void;
    /** The editor is ready for commands (send it what it should know: where changes go, say). */
    onReady?: () => void;
    onLayers?: (tree: EdLayer) => void;
    onPage?: (page: EdPage) => void;
    /** A part was copied (or cut): its HTML and words, to paste here or in another page; `system`: the frame put it on the clipboard itself. */
    onCopied?: (c: { html: string; name: string; text: string; system: boolean }) => void;
    /** The menu's Paste: read the system clipboard (the frame may not) and answer with `cmd('pasteData', …)`. */
    onClipRead?: (plain: boolean) => void;
    /** The right-click menu's Description: the field of the part's own that should take the focus (the inspector's). */
    onFocusField?: (field: string) => void;
    /** Ctrl+wheel, Ctrl+= and Ctrl+- in the page: the view's zoom. */
    onZoom?: (op: 'in' | 'out' | 'fit') => void;
    /** Ctrl+F (Ctrl+H: `replace`) pressed in the page: the find bar. */
    onFind?: (replace: boolean) => void;
    /** What the page found of what the bar asked for: how many matches, and which is on view (from 0, or -1). */
    onFound?: (count: number, index: number) => void;
    /** Words are being changed in the page (a phone's keyboard is up). */
    onEditing?: (on: boolean) => void;
    /** A block's menu is open in the page (on a phone, the drawer under it makes room). */
    onMenu?: (on: boolean) => void;
    /** Comment, on a block (and on words of it): a new comment's block and words, and where it is in the frame. */
    onComment?: (c: { on: PageAnchor; quote: string }) => void;
    /** A comment's mark beside its block, clicked. */
    onCommentOpen?: (id: string) => void;
    /** The page's own data, which its databases are kept in (the editor reads and writes their keys only). */
    store?: Store;
    /** The editor asks for something chosen in the app: an emoji, an icon, a cover, a picture, a video, maths. */
    onAsk?: (a: EdAsk) => void;
    /** A file dropped or pasted in the page: a picture to make small enough to live in it, or another file to keep (a PDF, a video, a sound, any file); answered with `fill`. */
    onFile?: (id: string, file: File, what: DroppedKind) => void;
    /** The block menu's Ask the agent. */
    onAgent?: () => void;
    /** Ctrl+Shift+/ in the page: the keyboard shortcuts. */
    onKeys?: () => void;
    /** The AI on the page (writing-ai.ts): a request for the helper model (answered with cmd('aiAnswer')), and one stopped. */
    onAi?: (id: string, ask: Record<string, unknown>) => void;
    onAiStop?: (id: string) => void;
    /** A database's AI cell and a file for it (answered with cmd('answer')), and a CSV to save. */
    onDbAi?: (id: number, ask: Record<string, unknown>) => void;
    onUpload?: (id: number, file: File) => void;
    /** A design's editor (design-editor.ts) says something of its own: its zoom, its artboards, a file dropped… */
    onDesign?: (d: Record<string, unknown>) => void;
    className?: string;
  }
>(function EditFrame({ html, base, title = 'Page', labels, onSel, onState, onPalette, onSave, onReady, onLayers, onPage, onCopied, onClipRead, onFocusField, onZoom, onFind, onFound, onEditing, onMenu, onComment, onCommentOpen, store, onAsk, onFile, onAgent, onKeys, onAi, onAiStop, onDbAi, onUpload, onDesign, className }, handle) {
  const ref = useRef<HTMLIFrameElement>(null);
  const offline = useContext(OfflineFrames);
  const cb = useRef({ html, base, labels, onSel, onState, onPalette, onSave, onReady, onLayers, onPage, onCopied, onClipRead, onFocusField, onZoom, onFind, onFound, onEditing, onMenu, onComment, onCommentOpen, store, onAsk, onFile, onAgent, onKeys, onAi, onAiStop, onDbAi, onUpload, onDesign });
  cb.current = { html, base, labels, onSel, onState, onPalette, onSave, onReady, onLayers, onPage, onCopied, onClipRead, onFocusField, onZoom, onFind, onFound, onEditing, onMenu, onComment, onCommentOpen, store, onAsk, onFile, onAgent, onKeys, onAi, onAiStop, onDbAi, onUpload, onDesign };
  const ch = useRef({ n: '', seq: 0, waits: new Map<number, (html: string) => void>(), anchorWaits: new Map<number, (list: { id: string; on: PageAnchor }[]) => void>() });
  const send = (m: Record<string, unknown>) => ref.current?.contentWindow?.postMessage({ ...m, type: 'wa-ed', n: ch.current.n }, '*');
  useThemeChange(() => ch.current.n && send({ cmd: 'theme', arg: { theme: themeNow(), css: themeCss() } }));
  useImperativeHandle(handle, () => ({
    cmd: (cmd, arg) => send({ cmd, arg }),
    html: () =>
      new Promise<string>((resolve, reject) => {
        const id = ++ch.current.seq;
        const t = window.setTimeout(() => {
          ch.current.waits.delete(id);
          reject(new Error('The editor did not answer'));
        }, 8000);
        ch.current.waits.set(id, (h) => {
          window.clearTimeout(t);
          resolve(h);
        });
        send({ cmd: 'html', id });
      }),
    saved: () => send({ cmd: 'saved' }),
    frame: () => ref.current,
    anchors: () =>
      new Promise((resolve) => {
        const id = ++ch.current.seq;
        // Not told within a moment (an editor of before): the comments stay where they were.
        const t = window.setTimeout(() => (ch.current.anchorWaits.delete(id), resolve([])), 3000);
        ch.current.anchorWaits.set(id, (list) => {
          window.clearTimeout(t);
          resolve(list);
        });
        send({ cmd: 'anchors', arg: { id } });
      }),
  }));
  useLayoutEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const w = ref.current?.contentWindow;
      const d = e.data;
      if (!w || e.source !== w || e.origin !== 'null' || !d || typeof d !== 'object' || typeof d.type !== 'string') return;
      if (d.type === 'wa-html-ready') {
        ch.current.n = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
        w.postMessage({ type: 'wa-html-page', mode: 'edit', html: withBase(cb.current.html, cb.current.base), n: ch.current.n, theme: themeNow(), css: themeCss(), labels: cb.current.labels }, '*');
        return;
      }
      if (d.n !== ch.current.n) return;
      const c = cb.current;
      if (d.type === 'wa-ed-sel') c.onSel(d.sel && typeof d.sel === 'object' ? (d.sel as EdSel) : null);
      else if (d.type === 'wa-ed-state') c.onState({ dirty: !!d.dirty, canUndo: !!d.canUndo, canRedo: !!d.canRedo });
      else if (d.type === 'wa-ed-palette' || d.type === 'wa-ed-ready') {
        if (Array.isArray(d.colors)) c.onPalette?.(d.colors.filter((x: unknown) => typeof x === 'string').slice(0, 12));
        if (d.type === 'wa-ed-ready') {
          paintBg(ref.current, d.bg);
          c.onReady?.();
        }
      } else if (d.type === 'wa-ed-page' && d.page && typeof d.page === 'object') {
        paintBg(ref.current, d.page.bg);
        c.onPage?.(d.page as EdPage);
      } else if (d.type === 'wa-ed-layers' && d.tree && typeof d.tree === 'object') c.onLayers?.(d.tree as EdLayer);
      else if (d.type === 'wa-ed-copied' && typeof d.html === 'string' && d.html.length < 2_000_000) c.onCopied?.({ html: d.html, name: typeof d.name === 'string' ? d.name : '', text: typeof d.text === 'string' ? d.text.slice(0, 1_000_000) : '', system: d.system === true });
      else if (d.type === 'wa-ed-clip-read') c.onClipRead?.(d.plain === true);
      else if (d.type === 'wa-ed-focus' && isStr(d.field, 20)) c.onFocusField?.(d.field);
      else if (d.type === 'wa-ed-find') c.onFind?.(d.replace === true);
      else if (d.type === 'wa-ed-found' && Number.isInteger(d.count) && Number.isInteger(d.index)) c.onFound?.(d.count, d.index);
      else if (d.type === 'wa-ed-zoom' && (d.op === 'in' || d.op === 'out' || d.op === 'fit')) c.onZoom?.(d.op);
      else if (d.type === 'wa-ed-editing') c.onEditing?.(!!d.on);
      else if (d.type === 'wa-ed-menu') c.onMenu?.(!!d.on);
      else if (d.type === 'wa-ed-comment' && d.on && typeof d.on === 'object' && isStr(d.quote, 500)) c.onComment?.({ on: cleanAnchor(d.on) ?? {}, quote: d.quote });
      else if (d.type === 'wa-ed-comment-open' && isStr(d.id, 40)) c.onCommentOpen?.(d.id);
      else if (d.type === 'wa-ed-store' && Number.isInteger(d.id)) {
        // A database's rows, for the editor: its keys only (n-db:<name>), within the storage's limits.
        const reply = (m: { value?: unknown; error?: string }) => send({ cmd: 'store', arg: { id: d.id, ...m } });
        if (!c.store || (d.op !== 'get' && d.op !== 'set') || !isStr(d.key, 60) || !/^n-db:[\w-]{1,40}$/.test(d.key)) return reply({ error: 'Not a database' });
        if (d.op === 'set' && (JSON.stringify(d.value) ?? '').length > STORAGE_LIMITS.value) return reply({ error: `That is over ${STORAGE_LIMITS.value / 1024} KB` });
        c.store({ op: d.op, key: d.key, value: d.value }).then(
          (value) => reply({ value }),
          (err) => reply({ error: String((err as Error)?.message ?? err) }),
        );
      }
      else if (d.type === 'wa-ed-anchors' && Array.isArray(d.list)) {
        const done = ch.current.anchorWaits.get(d.id);
        ch.current.anchorWaits.delete(d.id);
        done?.(d.list.flatMap((x: { id?: unknown; on?: unknown }) => (isStr(x?.id, 40) && cleanAnchor(x.on) ? [{ id: x.id, on: cleanAnchor(x.on)! }] : [])).slice(0, 500));
      }
      else if (d.type === 'wa-ed-save') c.onSave?.();
      else if (d.type === 'wa-ed-ask' && ASKS.has(d.what) && isStr(d.id, 20)) c.onAsk?.({ what: d.what, id: d.id, rect: rectOf(d.rect), has: d.has === true, tex: isStr(d.tex, 5000) ? d.tex : undefined, value: isStr(d.value, 40_000) ? d.value : undefined, dbs: Array.isArray(d.dbs) ? d.dbs.slice(0, 20) : undefined });
      else if (d.type === 'wa-ed-file' && isStr(d.id, 20) && d.file instanceof File) {
        // A picture (the default), or what a file dropped on the page is made into: the editor says which, the limits are by kind.
        const what = droppedKind(d.what);
        if (d.file.size <= DROP_LIMITS[what] && (what !== 'picture' || /^image\//.test(d.file.type))) c.onFile?.(d.id, d.file, what);
      }
      else if (d.type === 'wa-ed-agent') c.onAgent?.();
      else if (d.type === 'wa-ed-ai' && isStr(d.id, 20) && d.ask && typeof d.ask === 'object' && !Array.isArray(d.ask) && JSON.stringify(d.ask).length < 600_000) c.onAi?.(d.id, d.ask);
      else if (d.type === 'wa-ed-ai-stop' && isStr(d.id, 20)) c.onAiStop?.(d.id);
      else if (d.type === 'wa-ed-db-ai' && Number.isInteger(d.id) && d.ask && typeof d.ask === 'object' && !Array.isArray(d.ask) && JSON.stringify(d.ask).length < 200_000) c.onDbAi?.(d.id, d.ask);
      else if (d.type === 'wa-ed-upload' && Number.isInteger(d.id) && d.file instanceof File) c.onUpload?.(d.id, d.file);
      else if (d.type === 'wa-ed-download' && isStr(d.name, 200) && isStr(d.mime, 100) && isStr(d.text, 20_000_000)) saveFile(d.name, d.mime, d.text);
      else if (d.type === 'wa-ed-design' && typeof d.what === 'string') c.onDesign?.(d as Record<string, unknown>);
      else if (d.type === 'wa-ed-keys') c.onKeys?.();
      else if (d.type === 'wa-ed-html' && typeof d.html === 'string') {
        const done = ch.current.waits.get(d.id);
        ch.current.waits.delete(d.id);
        done?.(d.html);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  return <iframe ref={ref} src={frameSrc(offline)} title={title} sandbox={offline ? OFFLINE_SANDBOX : SANDBOX} className={cx(FRAME_CLS, className)} />;
});

export type Device = 'desktop' | 'tablet' | 'phone';
const DEVICE_WIDTH: Record<Device, number> = { desktop: 0, tablet: 820, phone: 390 };
/** The view's zoom: 'fit' shows the page as large as the room allows (a tablet's or a phone's width shrinks to fit), or a percentage. */
export type Zoom = 'fit' | number;
export const ZOOMS = [50, 75, 100, 125, 150, 200];
/** The widest and narrowest a page can be shown at, in pixels. */
export const WIDTH_RANGE = { min: 240, max: 3000 };

/** The next zoom in or out from `now` (from Fit, 100 %), or Fit. */
export function stepZoom(now: Zoom, op: 'in' | 'out' | 'fit'): Zoom {
  if (op === 'fit') return 'fit';
  const at = now === 'fit' ? 100 : now;
  if (op === 'in') return ZOOMS.find((z) => z > at) ?? ZOOMS[ZOOMS.length - 1];
  return [...ZOOMS].reverse().find((z) => z < at) ?? ZOOMS[0];
}

/**
 * The page at a device's width (or a width of its own), centred, shown at a zoom (50 to 200 %) or scaled down to fit when the
 * room is narrower; the desktop at Fit fills the space. Zoomed in past the room, the stage scrolls sideways. Its child is the frame.
 */
export function DeviceStage({ device, zoom = 'fit', width, children, className }: { device: Device; zoom?: Zoom; width?: number | null; children: ReactNode; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const want = width && width > 0 ? Math.round(width) : DEVICE_WIDTH[device];
  const pad = 16;
  const fixed = want > 0;
  const scale = zoom === 'fit' ? (fixed && size.w ? Math.min(1, (size.w - pad * 2) / want) : 1) : zoom / 100;
  // The desktop at Fit (or at 100 %): the frame fills the room as it is.
  const fill = !fixed && scale === 1;
  // The frame's own size is the room (or the width asked for) divided by the zoom, so that it shows as much as it would at 100 %, larger.
  const frameW = fixed ? want : size.w / scale;
  const frameH = Math.max(0, (size.h - (fixed ? pad * 2 : 0)) / scale);
  const shownW = frameW * scale;
  const innerW = Math.max(size.w, shownW + (fixed ? pad * 2 : 0));
  // One shape of boxes whatever the view: the frame inside is never made again (a page being edited keeps its changes and its undo).
  return (
    <div ref={box} className={cx('relative h-full w-full', fill ? 'bg-white dark:bg-[#151412]' : cx('overflow-x-auto overflow-y-hidden', fixed ? 'bg-bg-2' : 'bg-white dark:bg-[#151412]'), className)}>
      <div className="relative h-full" style={{ width: fill ? '100%' : innerW }}>
        <div
          className={cx('absolute overflow-hidden', fill ? 'inset-0' : 'bg-white dark:bg-[#151412]', fixed && 'rounded-[14px] shadow-[0_0_0_1px_var(--line-2),0_8px_30px_rgba(0,0,0,.18)]')}
          style={fill ? undefined : { width: frameW, height: frameH, left: fixed ? Math.max(pad, (innerW - shownW) / 2) : 0, top: fixed ? pad : 0, transform: `scale(${scale})`, transformOrigin: 'top left' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
