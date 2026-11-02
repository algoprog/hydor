// The app's side of a page's frame (/htmlframe, sandboxed; the bridge inside is server/pages/kit.ts).
// It posts the page with a fresh number each time the frame is ready, and takes only messages from
// that frame, carrying that number, of a known shape and size: the page's height, a choice or a form
// to put in the message box, and calls of window.naget.storage, which a store answers.
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { KIT_CSS } from '@shared/page-kit';
import { STORAGE_LIMITS } from '@shared/pages';
import { enc, post } from '../../lib/api';
import { cx } from '../../components/ui';

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
  return `${fontFaces()}:root{${fonts}}${themeNow() === 'dark' ? 'html[data-n-theme] .n-page' : ':root'}{${colours.map(([n, x]) => `${n}:${x}`).join(';')}}`;
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
 * opened, light or dark as that device is.
 */
export function pageFile(html: string): string {
  const head = `<style id="n-kit">${KIT_CSS}</style><script>document.documentElement.setAttribute('data-n-theme',matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')</script>`;
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
}: {
  html: string;
  store: Store;
  onHeight?: (h: number) => void;
  onPick?: (p: Pick) => void;
  title?: string;
  className?: string;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const cb = useRef({ html, store, onHeight, onPick });
  cb.current = { html, store, onHeight, onPick };
  const nRef = useRef('');
  useThemeChange(() => nRef.current && ref.current?.contentWindow?.postMessage({ type: 'wa-html-theme', n: nRef.current, theme: themeNow(), css: themeCss() }, '*'));
  // Before the frame can load (it posts "ready" as soon as it does).
  useLayoutEffect(() => {
    let n = '';
    let busy = 0;
    let picks: number[] = [];
    const onMessage = (e: MessageEvent) => {
      const w = ref.current?.contentWindow;
      // Only this frame: a sandboxed page's origin is opaque ("null").
      if (!w || e.source !== w || e.origin !== 'null') return;
      const d = e.data;
      if (!d || typeof d !== 'object' || Array.isArray(d) || typeof d.type !== 'string') return;
      if (d.type === 'wa-html-ready') {
        n = nonce();
        nRef.current = n;
        w.postMessage({ type: 'wa-html-page', html: cb.current.html, n, theme: themeNow(), css: themeCss(), max: { key: STORAGE_LIMITS.key, value: STORAGE_LIMITS.value } }, '*');
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
      src="/htmlframe"
      title={title}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals"
      className={cx(FRAME_CLS, className)}
    />
  );
}

const SANDBOX = 'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals';

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
export function StreamFrame({ html, base, title = 'Page', onHeight, className }: { html: string; base?: string; title?: string; onHeight?: (h: number) => void; className?: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
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
  return <iframe ref={ref} src="/htmlframe" title={title} sandbox={SANDBOX} className={cx(FRAME_CLS, className)} />;
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
}

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
    /** A part was copied (or cut): its HTML, to paste here or in another page. */
    onCopied?: (c: { html: string; name: string }) => void;
    /** Words are being changed in the page (a phone's keyboard is up). */
    onEditing?: (on: boolean) => void;
    className?: string;
  }
>(function EditFrame({ html, base, title = 'Page', labels, onSel, onState, onPalette, onSave, onReady, onLayers, onPage, onCopied, onEditing, className }, handle) {
  const ref = useRef<HTMLIFrameElement>(null);
  const cb = useRef({ html, base, labels, onSel, onState, onPalette, onSave, onReady, onLayers, onPage, onCopied, onEditing });
  cb.current = { html, base, labels, onSel, onState, onPalette, onSave, onReady, onLayers, onPage, onCopied, onEditing };
  const ch = useRef({ n: '', seq: 0, waits: new Map<number, (html: string) => void>() });
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
      else if (d.type === 'wa-ed-copied' && typeof d.html === 'string' && d.html.length < 2_000_000) c.onCopied?.({ html: d.html, name: typeof d.name === 'string' ? d.name : '' });
      else if (d.type === 'wa-ed-editing') c.onEditing?.(!!d.on);
      else if (d.type === 'wa-ed-save') c.onSave?.();
      else if (d.type === 'wa-ed-html' && typeof d.html === 'string') {
        const done = ch.current.waits.get(d.id);
        ch.current.waits.delete(d.id);
        done?.(d.html);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  return <iframe ref={ref} src="/htmlframe" title={title} sandbox={SANDBOX} className={cx(FRAME_CLS, className)} />;
});

export type Device = 'desktop' | 'tablet' | 'phone';
const DEVICE_WIDTH: Record<Device, number> = { desktop: 0, tablet: 820, phone: 390 };

/**
 * The page at a device's width, centred, scaled down to fit when the space is narrower; the desktop
 * fills the space. Its child is the frame.
 */
export function DeviceStage({ device, children, className }: { device: Device; children: ReactNode; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const want = DEVICE_WIDTH[device];
  if (!want)
    return (
      <div ref={box} className={cx('relative h-full w-full bg-white dark:bg-[#151412]', className)}>
        {children}
      </div>
    );
  const pad = 16;
  const scale = size.w ? Math.min(1, (size.w - pad * 2) / want) : 1;
  const h = size.h ? (size.h - pad * 2) / scale : 0;
  return (
    <div ref={box} className={cx('relative h-full w-full overflow-hidden bg-bg-2', className)}>
      {size.w > 0 && (
        <div
          className="absolute top-4 left-1/2 overflow-hidden rounded-[14px] bg-white shadow-[0_0_0_1px_var(--line-2),0_8px_30px_rgba(0,0,0,.18)] dark:bg-[#151412]"
          style={{ width: want, height: h, transform: `translateX(-50%) scale(${scale})`, transformOrigin: 'top center' }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
