// What every page agents make runs with, inside its sandboxed frame: a small stylesheet of ready-made
// classes (options, picture cards, compare tables, pros and cons, buttons, fields) and the bridge
// script. The bridge reports the page's height, sends the user's choices and form answers to the app,
// and gives saved pages window.naget.storage; it talks to the app only by postMessage, each message
// carrying the number the app gave this page. Both go in right after the page's doctype, before its
// own styles and scripts, so its CSS wins and its scripts find window.naget from their first line.
//
// The functions below run in the browser, not here: their source is sent as text (Function#toString),
// so each uses only its arguments and the browser's own globals.
import { EDITOR_SRC } from './editor.ts';
import { KIT_CSS } from '../../shared/page-kit.ts';
import { ENGINE_SRC, UI_KIT_CSS, UI_SRC } from './ui-kit.ts';
import { KIT_LIB_URLS, MEDIA_SRC } from './media-kit.ts';
import { LIB_CDN } from '../../shared/app-media.ts';

export { KIT_CSS };

/**
 * In a frame, a page's light-or-dark rules (prefers-color-scheme) follow the device, not the app: the app in light
 * on a device in dark would show a page's dark look. This makes them follow the app's mode instead: the page's
 * own stylesheets as they come (the rules' conditions, not its text), pictures' sources, and what its scripts ask
 * of matchMedia. `window.__nScheme(mode)` switches it when the app's mode changes.
 */
function scheme(mode: 'dark' | 'light') {
  const W = window as unknown as { __nScheme?: (m: 'dark' | 'light') => void };
  if (W.__nScheme) return W.__nScheme(mode);
  let cur = mode;
  const FEATURE = /\(\s*prefers-color-scheme\s*:\s*(dark|light)\s*\)/gi;
  // Always true, and never true (no screen is a million pixels wide).
  const swap = (q: string) => q.replace(FEATURE, (_m, v: string) => (v.toLowerCase() === cur ? '(min-width: 0px)' : '(min-width: 999999px)'));
  const orig = new WeakMap<object, string>();
  const fixList = (m: MediaList | null | undefined) => {
    if (!m) return;
    const o = orig.get(m) ?? m.mediaText;
    if (!/prefers-color-scheme/i.test(o)) return;
    orig.set(m, o);
    const next = swap(o);
    if (m.mediaText !== next) m.mediaText = next;
  };
  const walk = (rules: CSSRuleList) => {
    for (const r of Array.from(rules)) {
      if (r instanceof CSSMediaRule) fixList(r.media);
      if (r instanceof CSSImportRule) {
        fixList(r.media);
        try {
          if (r.styleSheet) walk(r.styleSheet.cssRules);
        } catch {}
      } else if ('cssRules' in r) walk((r as CSSGroupingRule).cssRules);
    }
  };
  const run = () => {
    for (const sh of Array.from(document.styleSheets)) {
      fixList(sh.media);
      try {
        walk(sh.cssRules);
      } catch {}
    }
    for (const el of Array.from(document.querySelectorAll('source[media]'))) {
      const o = orig.get(el) ?? el.getAttribute('media') ?? '';
      if (!/prefers-color-scheme/i.test(o)) continue;
      orig.set(el, o);
      el.setAttribute('media', swap(o));
    }
  };
  const mm = window.matchMedia.bind(window);
  window.matchMedia = (q: string) => mm(swap(String(q)));
  let queued = 0;
  const soon = () => {
    if (!queued) queued = requestAnimationFrame(() => ((queued = 0), run()));
  };
  // Styles come as the page is parsed, and some later (added by its scripts).
  new MutationObserver((ms) => {
    if (ms.some((m) => Array.from(m.addedNodes).some((n) => /^(STYLE|LINK|SOURCE)$/.test((n as Element).tagName ?? '')))) soon();
  }).observe(document, { childList: true, subtree: true });
  addEventListener('DOMContentLoaded', run);
  addEventListener('load', run);
  run();
  W.__nScheme = (m) => {
    cur = m;
    run();
  };
}

/** The script that runs `scheme` in a page, for the app's mode. */
export const schemeScript = (mode: 'dark' | 'light', own = false) => `<script${own ? ' data-n-own' : ''}>(${SCHEME_SRC})(${JSON.stringify(mode)})</script>`;

/** What the bridge is told: the number its messages carry, the theme, and the storage limits. */
export interface BridgeCfg {
  n: string;
  theme: 'light' | 'dark' | 'auto';
  max: { key: number; value: number };
  /** Only the stand-ins for the browser's storage (a published site's own pages). */
  bare?: boolean;
  /** Without a parent: what storage starts with (JSON text by key), for a picture of the page with its data. */
  seed?: Record<string, string>;
  /** The page fills a window of its own (its own address), rather than a frame that grows with it. */
  fill?: boolean;
}

/**
 * The bridge, run first inside each page. Without a parent (a published copy opened on its own) it
 * keeps storage in memory and sends nothing.
 */
function bridge(cfg: BridgeCfg) {
  // A sandboxed page has no localStorage or sessionStorage: a stand-in that lasts while the page is open, so scripts that use them still run.
  const mem = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(String(k)) ?? null,
      setItem: (k: string, v: string) => void m.set(String(k), String(v)),
      removeItem: (k: string) => void m.delete(String(k)),
      clear: () => m.clear(),
      key: (i: number) => [...m.keys()][i] ?? null,
      get length() {
        return m.size;
      },
    };
  };
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    try {
      void window[name].length;
    } catch {
      try {
        Object.defineProperty(window, name, { value: mem(), configurable: true });
      } catch {}
    }
  }
  if (cfg.bare) return;

  const P = window.parent !== window ? window.parent : null;
  const root = document.documentElement;
  const send = (m: Record<string, unknown>) => P!.postMessage({ ...m, n: cfg.n }, '*');
  const post = (m: Record<string, unknown>) => {
    try {
      if (P) send(m);
    } catch {}
  };
  const dark = cfg.theme === 'dark' || (cfg.theme === 'auto' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  root.setAttribute('data-n-theme', dark ? 'dark' : 'light');

  // The page's height, so the frame in the conversation fits it, and its colour, which the frame shows where
  // the page paints nothing (before it is drawn, when it bounces at an end): white for a page of no colour.
  if (P) {
    let last = -1;
    let lastBg = '';
    const clear = (c: string) => !c || c === 'transparent' || /^rgba\([^)]*,\s*0\)$/.test(c);
    const bgOf = () => {
      for (const el of [root, document.body]) {
        if (!el) continue;
        const cs = getComputedStyle(el);
        if (!clear(cs.backgroundColor)) return cs.backgroundColor;
        if (cs.backgroundImage !== 'none') return '';
      }
      return '#fff';
    };
    const size = () => {
      // A page that says so (an app's view: body[data-n-fit]) is as tall as what it holds, so its frame shrinks with it too.
      const h = document.body?.hasAttribute('data-n-fit') ? Math.ceil(root.getBoundingClientRect().height) : Math.max(root.scrollHeight, document.body ? document.body.scrollHeight : 0);
      const bg = bgOf();
      if (h !== last || bg !== lastBg) post({ type: 'wa-html-size', h: (last = h), bg: (lastBg = bg) });
    };
    // A page narrower than its frame (written for a column of some width) sits in the middle of it, not at its left.
    const centre = () => {
      const b = document.body;
      if (!b) return;
      const cs = getComputedStyle(b);
      const l = parseFloat(cs.marginLeft);
      if (cs.maxWidth === 'none' || l !== parseFloat(cs.marginRight) || l > 16 || b.getBoundingClientRect().width >= root.clientWidth - 1) return;
      b.style.marginLeft = 'auto';
      b.style.marginRight = 'auto';
    };
    new ResizeObserver(size).observe(root);
    addEventListener('DOMContentLoaded', centre);
    addEventListener('load', () => (centre(), size()));
    setTimeout(size, 300);
    // The app's theme changed while the page is open: its colours (and its light-or-dark rules) follow.
    addEventListener('message', (e) => {
      const d = e.data;
      if (e.source !== P || !d || d.type !== 'wa-html-theme' || d.n !== cfg.n) return;
      const mode = d.theme === 'dark' ? 'dark' : 'light';
      root.setAttribute('data-n-theme', mode);
      const el = document.getElementById('n-theme');
      if (el && typeof d.css === 'string' && d.css.length < 40000) el.textContent = d.css;
      (window as unknown as { __nScheme?: (m: string) => void }).__nScheme?.(mode);
      requestAnimationFrame(size);
    });
  }

  // window.naget.storage: the app keeps a saved page's values; without the app, this page's memory does.
  const local = new Map<string, string>(Object.entries(cfg.seed ?? {}));
  const waits = new Map<number, [(v: unknown) => void, (e: Error) => void]>();
  let seq = 0;
  const call = (op: string, key?: string, value?: unknown): Promise<unknown> => {
    if (!P) {
      if (op === 'get') return Promise.resolve(local.has(key!) ? JSON.parse(local.get(key!)!) : null);
      if (op === 'set') local.set(key!, JSON.stringify(value));
      if (op === 'remove') local.delete(key!);
      return Promise.resolve(op === 'keys' ? [...local.keys()] : null);
    }
    return new Promise((ok, fail) => {
      const id = ++seq;
      waits.set(id, [ok, fail]);
      try {
        send({ type: 'wa-store', id, op, key, value });
      } catch (e) {
        waits.delete(id);
        fail(e as Error);
      }
    });
  };
  addEventListener('message', (e) => {
    const d = e.data;
    if (e.source !== P || !d || d.type !== 'wa-store-reply' || !waits.has(d.id)) return;
    const [ok, fail] = waits.get(d.id)!;
    waits.delete(d.id);
    if (typeof d.error === 'string') fail(new Error(d.error));
    else ok(d.value === undefined ? null : d.value);
  });
  const keyOf = (k: unknown) => {
    const s = String(k);
    if (!s || s.length > cfg.max.key) throw new Error(`A storage key is 1 to ${cfg.max.key} characters`);
    return s;
  };
  const storage = {
    get: (k: unknown) => new Promise((ok) => ok(keyOf(k))).then((key) => call('get', key as string)),
    set: (k: unknown, v: unknown) =>
      new Promise((ok) => {
        const key = keyOf(k);
        const json = JSON.stringify(v);
        if (json === undefined) throw new Error('naget.storage.set needs a value that JSON can hold (use remove to delete a key)');
        if (json.length > cfg.max.value) throw new Error(`That value is over ${Math.round(cfg.max.value / 1024)} KB`);
        ok([key, JSON.parse(json)]);
      }).then((kv) => call('set', (kv as [string, unknown])[0], (kv as [string, unknown])[1])),
    remove: (k: unknown) => new Promise((ok) => ok(keyOf(k))).then((key) => call('remove', key as string)),
    keys: () => call('keys'),
  };
  // Configurable, so a page's own top-level `let naget` still works. `fill`: whether the page has a window to fill.
  Object.defineProperty(window, 'naget', { value: Object.freeze({ storage: Object.freeze(storage), fill: !P || cfg.fill === true }), enumerable: true, configurable: true });

  // Choices: a click on [data-choice] selects it in its group and tells the app.
  const BOX = '[data-group],[data-multi],.n-options,.n-grid,.n-compare,form';
  const boxOf = (el: Element): Element => el.parentElement?.closest(BOX) ?? el.parentElement ?? root;
  const ids = new WeakMap<Element, string>();
  let gid = 0;
  const choose = (el: Element) => {
    const box = boxOf(el);
    const all = [...box.querySelectorAll('[data-choice]')].filter((x) => boxOf(x) === box);
    if (box.hasAttribute('data-multi')) el.classList.toggle('n-selected');
    else for (const x of all) x.classList.toggle('n-selected', x === el);
    for (const x of all) x.setAttribute('aria-pressed', String(x.classList.contains('n-selected')));
    const name = (el.closest('[data-group]')?.getAttribute('data-group') ?? '').trim().slice(0, 100);
    if (!ids.has(box)) ids.set(box, `g${++gid}`);
    const values = all
      .filter((x) => x.classList.contains('n-selected'))
      .map((x) => (x.getAttribute('data-choice') ?? '').trim().slice(0, 200))
      .slice(0, 20);
    post({ type: 'wa-pick', g: name ? `name:${name}` : ids.get(box), name, values });
  };
  document.addEventListener('click', (e) => {
    const el = (e.target as Element | null)?.closest?.('[data-choice]');
    if (!el) return;
    if (el.tagName === 'A') e.preventDefault();
    choose(el);
  });
  // Choices that are not buttons or links can be reached and picked from the keyboard too.
  const arm = () => {
    for (const x of document.querySelectorAll('[data-choice]')) {
      if (/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(x.tagName) || x.hasAttribute('tabindex')) continue;
      x.setAttribute('tabindex', '0');
      x.setAttribute('role', 'button');
    }
  };
  document.addEventListener('DOMContentLoaded', arm);
  addEventListener('load', arm);
  document.addEventListener('keydown', (e) => {
    const t = e.target as Element | null;
    if ((e.key === 'Enter' || e.key === ' ') && t?.matches?.('[data-choice][role=button]')) {
      e.preventDefault();
      choose(t);
    }
  });
  // Forms with data-choice-form send their fields instead of submitting.
  document.addEventListener(
    'submit',
    (e) => {
      const f = e.target as HTMLFormElement | null;
      if (!f?.matches?.('form[data-choice-form]')) return;
      e.preventDefault();
      const fields: [string, string][] = [];
      new FormData(f, (e as SubmitEvent).submitter ?? null).forEach((v, k) => {
        if (typeof v === 'string' && fields.length < 40) fields.push([k.slice(0, 100), v.slice(0, 2000)]);
      });
      post({ type: 'wa-form', name: (f.getAttribute('data-choice-form') ?? '').trim().slice(0, 100), fields });
    },
    true,
  );
}

/**
 * A template's screen (server/apps/screens.ts): window.naget.app, its flows and its data through the app
 * (pages/frame.tsx answers each call for the template the screen belongs to, never another), and the App
 * parts written on it: <n-form flow>, <n-result flow>, <n-table data>, <n-runs flow>, <n-button flow>,
 * <n-count data> and <n-chat>. Runs after the bridge, in the page; like it, uses only its argument and the browser.
 */
function appKit(cfg: { n: string; info: any; labels: Record<string, string> }) {
  const P = window.parent;
  if (!P || P === window || !cfg?.info) return;
  const L = (k: string, d: string): string => (typeof cfg.labels?.[k] === 'string' ? cfg.labels[k] : d);
  const send = (m: Record<string, unknown>) => P.postMessage({ ...m, n: cfg.n }, '*');
  const waits = new Map<number, [(v: any) => void, (e: Error) => void]>();
  let seq = 0;
  const heard: { run: Set<(r: any) => void>; data: Set<(c: string) => void> } = { run: new Set(), data: new Set() };
  addEventListener('message', (e) => {
    const d = e.data;
    if (e.source !== P || !d || typeof d !== 'object') return;
    if (d.type === 'wa-app-reply' && waits.has(d.id)) {
      const [ok, fail] = waits.get(d.id)!;
      waits.delete(d.id);
      if (typeof d.error === 'string') fail(new Error(d.error));
      else ok(d.value ?? null);
    } else if (d.type === 'wa-app-event' && d.n === cfg.n) {
      if (d.kind === 'run')
        heard.run.forEach((f) => {
          try {
            f(d.run);
          } catch {}
        });
      else if (d.kind === 'data')
        heard.data.forEach((f) => {
          try {
            f(String(d.collection));
          } catch {}
        });
    }
  });
  const call = (op: string, args: Record<string, unknown> = {}): Promise<any> =>
    new Promise((ok, fail) => {
      const id = ++seq;
      waits.set(id, [ok, fail]);
      try {
        send({ type: 'wa-app', id, op, args });
      } catch (e) {
        waits.delete(id);
        fail(e as Error);
      }
    });
  const ACTIVE = ['queued', 'starting', 'running', 'waiting'];
  const on = (what: 'run' | 'data', fn: (x: any) => void) => {
    heard[what].add(fn);
    return () => heard[what].delete(fn);
  };
  /** A run once it has ended: { run, steps }. */
  const wait = (id: string): Promise<any> =>
    new Promise((ok, fail) => {
      let off = () => {};
      let done = false;
      const look = () =>
        call('get', { id }).then(
          (d) => {
            if (!done && d && !ACTIVE.includes(d.run?.status)) {
              done = true;
              off();
              ok(d);
            }
          },
          (e) => {
            off();
            fail(e);
          },
        );
      off = on('run', (r: any) => r && r.id === id && look());
      look();
    });
  const data = (name: string) => ({
    find: (q: Record<string, unknown> = {}) => call('find', { collection: name, ...q }),
    search: (query: string, o: Record<string, unknown> = {}) => call('search', { collection: name, query, ...o }),
    add: (record: Record<string, unknown>) => call('add', { collection: name, record }),
    update: (id: string, set: Record<string, unknown>) => call('update', { collection: name, id, set }),
    remove: (id: string) => call('remove', { collection: name, id }),
    watch: (fn: () => void) => on('data', (c: string) => c === name && fn()),
  });
  const api = Object.freeze({
    id: cfg.info.id,
    name: cfg.info.name,
    flows: cfg.info.flows,
    collections: cfg.info.data,
    run: (flow = 'run', inputs: Record<string, unknown> = {}) => call('run', { flow, inputs }),
    get: (id: string) => call('get', { id }),
    wait,
    runs: (o: { flow?: string; limit?: number } = {}) => call('runs', o),
    data,
    on,
    // Conversations with its agent: a message starts one (or goes on with the one named); each comes back with its messages.
    chat: (text: string, id?: string) => call('chat', { text, id }),
    conversation: (id: string) => call('chat-get', { id }),
    chats: () => call('chats'),
  });
  const W = window as any;
  Object.defineProperty(window, 'naget', { value: Object.freeze({ ...(W.naget ?? {}), app: api }), enumerable: true, configurable: true });

  // ---- the App parts --------------------------------------------------------------------------------
  if (!window.customElements) return;
  const h = (tag: string, attrs: Record<string, any> = {}, ...kids: any[]): any => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) el.append(k instanceof Node ? k : String(k));
    return el;
  };
  const flowOf = (id: string | null) => cfg.info.flows.find((f: any) => f.id === (id || 'run'));
  const label = (k: string) => String(k).replace(/[_-]+/g, ' ').replace(/^./, (c) => c.toUpperCase());
  const text = (v: any): string =>
    v === null || v === undefined
      ? ''
      : typeof v === 'boolean'
        ? v
          ? L('yes', 'Yes')
          : L('no', 'No')
        : Array.isArray(v)
          ? v.map((x) => (x && typeof x === 'object' ? Object.values(x).map(text).join(' · ') : text(x))).join('\n')
          : typeof v === 'object'
            ? JSON.stringify(v)
            : String(v);
  /** A value as it reads: rows as a table, the rest as text. */
  const show = (v: any) => {
    if (Array.isArray(v) && v.length && v.every((x) => x && typeof x === 'object' && !Array.isArray(x))) {
      const cols = [...new Set(v.flatMap((x) => Object.keys(x)))];
      return h('div', { class: 'n-app-table' }, h('table', {}, h('thead', {}, h('tr', {}, ...cols.map((c) => h('th', {}, label(c))))), h('tbody', {}, ...v.map((r) => h('tr', {}, ...cols.map((c) => h('td', {}, text(r[c]))))))));
    }
    return text(v);
  };
  const statusOf = (r: any) =>
    (({ queued: L('waiting', 'Waiting'), starting: L('starting', 'Starting…'), running: L('working', 'Working…'), waiting: L('needsYou', 'Needs you in the app'), done: L('done', 'Done'), failed: L('failed', 'Did not finish'), stopped: L('stopped', 'Stopped') }) as Record<string, string>)[r?.status] ?? String(r?.status ?? '');
  const ago = (t: number) => {
    const s = Math.max(0, Math.round((Date.now() - t) / 1000));
    return s < 60 ? L('now', 'just now') : s < 3600 ? `${Math.round(s / 60)} min` : s < 86400 ? `${Math.round(s / 3600)} h` : new Date(t).toLocaleDateString();
  };
  const fieldEl = (f: any) => {
    if (f.type === 'yesno') return h('label', { class: 'n-app-check' }, h('input', { type: 'checkbox', name: f.id, checked: /^(yes|true)$/i.test(f.default ?? '') }), f.label);
    let input: any;
    if (f.type === 'long') input = h('textarea', { name: f.id, rows: 4, placeholder: f.placeholder, required: !!f.required }, f.default ?? '');
    else if (f.type === 'choice') input = h('select', { name: f.id, required: !!f.required }, ...(f.required ? [] : [h('option', { value: '' }, '')]), ...(f.options ?? []).map((o: string) => h('option', { value: o, selected: o === f.default }, o)));
    else input = h('input', { name: f.id, type: f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text', step: f.type === 'number' ? 'any' : undefined, placeholder: f.placeholder, required: !!f.required, value: f.default });
    return h('label', { class: 'n-field' }, `${f.label}${f.required ? ' *' : ''}`, input, f.help ? h('span', { class: 'n-muted' }, f.help) : null);
  };
  const json = (s: string | null) => {
    try {
      return s ? JSON.parse(s) : undefined;
    } catch {
      return undefined;
    }
  };
  const define = (name: string, c: CustomElementConstructor) => {
    if (!customElements.get(name)) customElements.define(name, c);
  };

  /** Runs a flow from a button or a form, saying how it goes; the page hears "n-run" with the run once it ends. */
  const runIt = async (el: HTMLElement, flow: string, inputs: Record<string, unknown>, status: any, busy: (on: boolean) => void): Promise<any> => {
    busy(true);
    status.className = 'n-app-status';
    status.textContent = L('working', 'Working…');
    try {
      const started = await api.run(flow, inputs);
      const end = await wait(started.id);
      const ok = end.run.status === 'done';
      status.className = `n-app-status ${ok ? 'n-app-ok' : 'n-app-err'}`;
      status.textContent = ok ? L('done', 'Done') : `${statusOf(end.run)}${end.run.error ? `: ${end.run.error}` : ''}`;
      el.dispatchEvent(new CustomEvent('n-run', { detail: end, bubbles: true }));
      return end;
    } catch (err) {
      status.className = 'n-app-status n-app-err';
      status.textContent = (err as Error).message;
      return null;
    } finally {
      busy(false);
    }
  };

  define(
    'n-form',
    class extends HTMLElement {
      connectedCallback() {
        if (this.querySelector('form.n-app-form')) return;
        const f = flowOf(this.getAttribute('flow'));
        if (!f) return void (this.textContent = `${L('noFlow', 'This app has no flow')}: ${this.getAttribute('flow')}`);
        const status = h('span', { class: 'n-app-status', role: 'status' });
        const button = h('button', { class: 'n-btn n-primary', type: 'submit' }, this.getAttribute('submit') || (f.id === 'run' ? L('run', 'Run') : f.title));
        const form = h('form', { class: 'n-app-form' }, ...f.inputs.filter((x: any) => x.type !== 'file').map(fieldEl), h('div', { class: 'n-row' }, button, status));
        form.addEventListener('submit', async (e: Event) => {
          e.preventDefault();
          const inputs: Record<string, unknown> = {};
          for (const x of f.inputs) {
            const el = form.elements.namedItem(x.id);
            if (el) inputs[x.id] = el.type === 'checkbox' ? (el.checked ? 'Yes' : 'No') : el.value;
          }
          const end = await runIt(this, f.id, inputs, status, (on) => (button.disabled = on));
          if (end?.run.status === 'done' && !this.hasAttribute('keep')) form.reset();
        });
        this.replaceChildren(form);
      }
    },
  );

  define(
    'n-button',
    class extends HTMLElement {
      connectedCallback() {
        if (this.querySelector('button')) return;
        const f = flowOf(this.getAttribute('flow'));
        const words = this.textContent?.trim() || (f ? (f.id === 'run' ? L('run', 'Run') : f.title) : L('run', 'Run'));
        const status = h('span', { class: 'n-app-status', role: 'status' });
        const button = h('button', { class: `n-btn${this.hasAttribute('plain') ? '' : ' n-primary'}`, type: 'button' }, words);
        button.addEventListener('click', () => {
          if (!f) return void (status.textContent = `${L('noFlow', 'This app has no flow')}: ${this.getAttribute('flow')}`);
          void runIt(this, f.id, json(this.getAttribute('inputs')) ?? {}, status, (on) => (button.disabled = on));
        });
        this.replaceChildren(h('span', { class: 'n-row' }, button, status));
      }
    },
  );

  define(
    'n-result',
    class extends HTMLElement {
      off: (() => void) | null = null;
      connectedCallback() {
        const flow = this.getAttribute('flow') || 'run';
        const f = flowOf(flow);
        const draw = (r: any) => {
          if (!r) return void this.replaceChildren(h('div', { class: 'n-app-empty' }, L('noRuns', 'No runs yet')));
          const parts: any[] = [];
          if (ACTIVE.includes(r.status) || r.status !== 'done') parts.push(h('div', { class: `n-app-status${r.status === 'failed' ? ' n-app-err' : ''}` }, `${statusOf(r)}${r.error ? `: ${r.error}` : ''}`));
          const res = r.result && typeof r.result === 'object' ? r.result : null;
          if (res) {
            const known = (f?.outputs ?? []).map((o: any) => o.id);
            const keys = [...known.filter((k: string) => k in res), ...Object.keys(res).filter((k) => !known.includes(k))];
            const name = (k: string) => f?.outputs?.find((o: any) => o.id === k)?.label ?? label(k);
            parts.push(h('dl', { class: 'n-app-result' }, ...keys.flatMap((k) => [h('dt', {}, name(k)), h('dd', {}, show(res[k]))])));
          } else if (r.reply) parts.push(h('div', { class: 'n-app-result' }, h('dd', { style: 'grid-column:1/-1' }, r.reply)));
          this.replaceChildren(...parts);
        };
        const load = () => api.runs({ flow, limit: 1 }).then((list: any[]) => draw(list[0] ?? null), () => {});
        this.off = on('run', (r: any) => r && (r.flow ?? 'run') === flow && !r.parent && draw(r));
        void load();
      }
      disconnectedCallback() {
        this.off?.();
      }
    },
  );

  define(
    'n-runs',
    class extends HTMLElement {
      off: (() => void) | null = null;
      connectedCallback() {
        const flow = this.getAttribute('flow') || undefined;
        const limit = Math.max(1, Math.min(Number(this.getAttribute('limit')) || 5, 50));
        const draw = (list: any[]) =>
          this.replaceChildren(
            list.length
              ? h(
                  'ul',
                  { class: 'n-app-runs' },
                  ...list.map((r) =>
                    h(
                      'li',
                      {},
                      h('span', { class: r.status === 'done' ? 'n-app-ok' : r.status === 'failed' ? 'n-app-err' : '' }, statusOf(r)),
                      h('span', {}, Object.values(r.inputs ?? {}).filter(Boolean).join(' · ').slice(0, 120)),
                      h('span', { class: 'n-muted' }, ago(r.createdAt)),
                    ),
                  ),
                )
              : h('div', { class: 'n-app-empty' }, L('noRuns', 'No runs yet')),
          );
        const load = () => api.runs({ flow, limit }).then(draw, () => {});
        this.off = on('run', (r: any) => r && !r.parent && (!flow || (r.flow ?? 'run') === flow) && load());
        void load();
      }
      disconnectedCallback() {
        this.off?.();
      }
    },
  );

  define(
    'n-table',
    class extends HTMLElement {
      off: (() => void) | null = null;
      connectedCallback() {
        const name = this.getAttribute('data') || '';
        const c = cfg.info.data.find((x: any) => x.name === name);
        if (!c) return void (this.textContent = `${L('noData', 'This app keeps no collection')}: ${name}`);
        const store = data(name);
        const limit = Math.max(1, Math.min(Number(this.getAttribute('limit')) || 100, 1000));
        const edit = (this.getAttribute('edit') || '').split(',').map((x) => x.trim()).filter(Boolean);
        const remove = this.hasAttribute('remove');
        const where = json(this.getAttribute('where'));
        const sort = this.getAttribute('sort') || undefined;
        const named = (this.getAttribute('columns') || '').split(',').map((x) => x.trim()).filter(Boolean);
        const kinds: Record<string, string> = Object.fromEntries((c.fields ?? []).map((f: any) => [f.id, f.type]));
        const titles: Record<string, string> = Object.fromEntries((c.fields ?? []).map((f: any) => [f.id, f.label]));
        let query = '';
        const box = this.hasAttribute('search') ? h('input', { class: 'n-app-search', type: 'search', placeholder: L('search', 'Search') }) : null;
        const body = h('div');
        const draw = (records: any[]) => {
          const cols = named.length ? named : c.fields ? c.fields.map((f: any) => f.id) : [...new Set(records.flatMap((r) => Object.keys(r).filter((k) => !['id', 'createdAt', 'updatedAt', 'score'].includes(k))))];
          if (!records.length) return void body.replaceChildren(h('div', { class: 'n-app-table' }, h('div', { class: 'n-app-empty' }, query ? L('nothingFound', 'Nothing found') : L('empty', 'Nothing here yet'))));
          const cell = (r: any, k: string) => {
            if (edit.includes(k) && (kinds[k] === 'yesno' || typeof r[k] === 'boolean')) {
              const box2 = h('input', { type: 'checkbox', checked: !!r[k], 'aria-label': titles[k] ?? label(k) });
              box2.addEventListener('change', () => void store.update(r.id, { [k]: box2.checked }).catch(() => (box2.checked = !box2.checked)));
              return box2;
            }
            if (kinds[k] === 'url' && typeof r[k] === 'string') return h('a', { href: r[k], target: '_blank', rel: 'noopener' }, r[k]);
            return text(r[k]);
          };
          body.replaceChildren(
            h(
              'div',
              { class: 'n-app-table' },
              h(
                'table',
                {},
                h('thead', {}, h('tr', {}, ...cols.map((k: string) => h('th', {}, titles[k] ?? label(k))), remove ? h('th', {}) : null)),
                h(
                  'tbody',
                  {},
                  ...records.map((r) =>
                    h('tr', {}, ...cols.map((k: string) => h('td', {}, cell(r, k))), remove ? h('td', { style: 'width:1%' }, h('button', { class: 'n-app-x', type: 'button', title: L('remove', 'Remove'), 'aria-label': L('remove', 'Remove'), onclick: () => void store.remove(r.id) }, '×')) : null),
                  ),
                ),
              ),
            ),
          );
        };
        const load = () => (query ? store.search(query, { limit: Math.min(limit, 100) }) : store.find({ where, sort, limit })).then((x: any) => draw(x.records ?? []), () => {});
        let t: any = 0;
        box?.addEventListener('input', () => {
          clearTimeout(t);
          t = setTimeout(() => {
            query = box.value.trim();
            void load();
          }, 300);
        });
        this.replaceChildren(...(box ? [box] : []), body);
        this.off = store.watch(load);
        void load();
      }
      disconnectedCallback() {
        this.off?.();
      }
    },
  );

  define(
    'n-chat',
    class extends HTMLElement {
      off: (() => void) | null = null;
      timer: any = 0;
      connectedCallback() {
        if (this.querySelector('.n-chat-msgs')) return;
        let cur: any = null;
        let busy = false;
        const log = h('div', { class: 'n-chat-msgs', role: 'log' });
        const status = h('span', { class: 'n-app-status', role: 'status' });
        const words = L('message', 'Write a message…');
        const box = h('textarea', { class: 'n-chat-box', rows: 2, placeholder: this.getAttribute('placeholder') || words, 'aria-label': words });
        const send = h('button', { class: 'n-btn n-primary', type: 'submit' }, L('send', 'Send'));
        const fresh = h('button', { class: 'n-chat-link', type: 'button', hidden: true }, L('newChat', 'New conversation'));
        const earlier = h('button', { class: 'n-chat-link', type: 'button', 'aria-expanded': 'false' }, L('earlier', 'Earlier conversations'));
        const menu = h('ul', { class: 'n-chat-menu', hidden: true });
        const form = h('form', { class: 'n-chat-form' }, box, h('div', { class: 'n-row' }, send, status, h('span', { class: 'n-chat-more' }, fresh, earlier)), menu);
        const draw = () => {
          const msgs: any[] = cur?.messages ?? [];
          log.replaceChildren(
            ...(msgs.length
              ? msgs.map((m) => h('div', { class: `n-chat-msg ${m.from === 'you' ? 'n-chat-you' : 'n-chat-agent'}${m.queued ? ' n-chat-queued' : ''}`, title: m.queued ? L('queued', 'Waiting its turn') : undefined }, m.text))
              : [h('div', { class: 'n-app-empty' }, this.getAttribute('hint') || L('chatHint', 'Ask its agent about what it keeps, or to run it for you.'))]),
          );
          log.scrollTop = log.scrollHeight;
          status.className = `n-app-status${cur?.status === 'failed' ? ' n-app-err' : ''}`;
          status.textContent = cur?.working || busy ? L('working', 'Working…') : cur?.status === 'failed' || cur?.status === 'stopped' ? `${statusOf(cur)}${cur.error ? `: ${cur.error}` : ''}` : '';
          // Before its agent has started, a message has nowhere to go yet.
          send.disabled = busy || cur?.status === 'queued' || cur?.status === 'starting';
          fresh.hidden = !cur;
          clearTimeout(this.timer);
          if (cur?.working) this.timer = setTimeout(load, 4000);
        };
        const load = () => cur && call('chat-get', { id: cur.id }).then((c: any) => (cur?.id === c.id ? ((cur = c), draw()) : undefined), () => {});
        const open = (id: string) => call('chat-get', { id }).then((c: any) => ((cur = c), draw()), () => {});
        form.addEventListener('submit', async (e: Event) => {
          e.preventDefault();
          const words2 = box.value.trim();
          if (!words2 || busy) return;
          busy = true;
          draw();
          try {
            cur = await api.chat(words2, cur?.id);
            box.value = '';
          } catch (err) {
            status.className = 'n-app-status n-app-err';
            status.textContent = (err as Error).message;
            busy = false;
            send.disabled = false;
            return;
          }
          busy = false;
          draw();
        });
        box.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
            e.preventDefault();
            form.requestSubmit();
          }
        });
        fresh.addEventListener('click', () => {
          cur = null;
          menu.hidden = true;
          draw();
          box.focus();
        });
        earlier.addEventListener('click', async () => {
          if (!menu.hidden) return void ((menu.hidden = true), earlier.setAttribute('aria-expanded', 'false'));
          const list: any[] = await api.chats().catch(() => []);
          menu.replaceChildren(
            ...(list.length
              ? list.slice(0, 8).map((c) =>
                  h(
                    'li',
                    {},
                    h(
                      'button',
                      {
                        type: 'button',
                        onclick: () => {
                          menu.hidden = true;
                          earlier.setAttribute('aria-expanded', 'false');
                          void open(c.id);
                        },
                      },
                      h('span', { class: 'n-chat-first' }, c.first),
                      h('span', { class: 'n-muted' }, ago(c.at)),
                    ),
                  ),
                )
              : [h('li', { class: 'n-app-empty' }, L('empty', 'Nothing here yet'))]),
          );
          menu.hidden = false;
          earlier.setAttribute('aria-expanded', 'true');
        });
        this.replaceChildren(log, form);
        this.off = on('run', (r: any) => r && cur && r.id === cur.id && load());
        draw();
        // The latest conversation, unless the part starts each visit afresh.
        if (!this.hasAttribute('fresh')) void api.chats().then((list: any[]) => !cur && list[0] && open(list[0].id), () => {});
      }
      disconnectedCallback() {
        this.off?.();
        clearTimeout(this.timer);
      }
    },
  );

  define(
    'n-count',
    class extends HTMLElement {
      off: (() => void) | null = null;
      connectedCallback() {
        const name = this.getAttribute('data') || '';
        if (!cfg.info.data.some((x: any) => x.name === name)) return void (this.textContent = `${L('noData', 'This app keeps no collection')}: ${name}`);
        const store = data(name);
        const where = json(this.getAttribute('where'));
        const n = h('div', { class: 'n-app-count' }, '…');
        this.replaceChildren(n);
        const load = () => store.find({ where, limit: 1 }).then((x: any) => (n.textContent = String(x.count ?? 0)), () => {});
        this.off = store.watch(load);
        void load();
      }
      disconnectedCallback() {
        this.off?.();
      }
    },
  );
}

/**
 * A function's source for a <script> element: nothing in it may end the element or open an HTML comment
 * there, however the compiler wrote it (it joins '</scr' + 'ipt>' back together). In strings, template
 * strings and patterns alike, \/ is / and \! is !.
 */
export const scriptSafe = (src: string) => src.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

export const BRIDGE_SRC = scriptSafe(bridge.toString());
export const APP_SRC = scriptSafe(appKit.toString());
export const SCHEME_SRC = scriptSafe(scheme.toString());

// The stylesheet goes into a page as text: it must not end the element it sits in.
if (/<\/style/i.test(KIT_CSS)) throw new Error('The page kit must not close its own element');

const cfgJson = (cfg: BridgeCfg) => JSON.stringify(cfg).replace(/</g, '\\u003c');

/** The kit's <style> and <script>, for a page. */
export function kitHead(cfg: BridgeCfg): string {
  return `<style id="n-kit">${KIT_CSS}</style><script>(${BRIDGE_SRC})(${cfgJson(cfg)})</script>`;
}

/** Only the stand-ins for localStorage and sessionStorage, for the pages of a published folder. */
export const storageShim = () => `<script>(${BRIDGE_SRC})(${cfgJson({ n: '', theme: 'auto', max: { key: 0, value: 0 }, bare: true })})</script>`;

/** Puts `head` first in the page: right after its doctype (before it, the page would lose standards mode). */
export function injectHead(html: string, head: string): string {
  const m = /^(?:\s|<!--[\s\S]*?-->)*<!doctype[^>]*>/i.exec(html);
  return m ? m[0] + head + html.slice(m[0].length) : head + html;
}

/**
 * The frame's own script (/htmlframe). It waits for its parent to post the page, then:
 * - `wa-html-page`: puts the kit at the page's head (as injectHead does) and writes the page in place of
 *   itself, to run; with mode "edit", writes it with its scripts held back and the visual editor
 *   (editor.ts) in place of the bridge.
 * - `wa-html-stream`, again and again: a page still being written, drawn as far as it goes. Its scripts
 *   are held back, and the page is changed in place (what was there stays), so it grows without
 *   flashing, following its end unless the reader scrolled up.
 */
function frame(kit: string, bridgeSrc: string, editorSrc: string, schemeSrc: string, appSrc: string, uiSrc: string, engineSrc: string, uiCss: string, mediaSrc: string, kitLibs: Record<string, string>, cdn: string) {
  const num = (v: unknown, def: number) => (typeof v === 'number' && v > 0 && v < 1e8 ? v : def);
  const nonce = (v: unknown) => (typeof v === 'string' ? v.slice(0, 64) : '');
  const theme = (v: unknown) => (v === 'dark' ? 'dark' : 'light');
  const js = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');
  const DOCTYPE = /^(?:\s|<!--[\s\S]*?-->)*<!doctype[^>]*>/i;

  /** Scripts, handlers and redirects of a page held back: kept in the page, but not run. */
  const holdBack = (doc: Document) => {
    for (const el of doc.querySelectorAll('script')) {
      el.setAttribute('data-n-type', el.getAttribute('type') ?? '');
      el.setAttribute('type', 'text/x-naget-held');
    }
    for (const el of doc.querySelectorAll('*'))
      for (const a of [...el.attributes]) {
        const name = a.name.toLowerCase();
        if (name.startsWith('on') || (name === 'http-equiv' && /refresh/i.test(a.value))) {
          el.removeAttribute(a.name);
          el.setAttribute(`data-n-x-${a.name}`, a.value);
        }
      }
  };

  /** Makes `to` (a live node) look like `from`, keeping the nodes they share. */
  const morph = (to: Element, from: Element) => {
    for (const a of [...to.attributes]) if (!from.hasAttribute(a.name)) to.removeAttribute(a.name);
    for (const a of [...from.attributes]) if (to.getAttribute(a.name) !== a.value) to.setAttribute(a.name, a.value);
    let t = to.firstChild;
    let f = from.firstChild;
    while (f) {
      const nextF: ChildNode | null = f.nextSibling;
      if (!t) {
        to.appendChild(document.importNode(f, true));
      } else if (t.nodeType === f.nodeType && (t.nodeType !== 1 || (t as Element).tagName === (f as Element).tagName)) {
        if (t.nodeType === 1) morph(t as Element, f as Element);
        else if (t.nodeValue !== f.nodeValue) t.nodeValue = f.nodeValue;
        t = t.nextSibling;
      } else {
        const n = document.importNode(f, true);
        to.replaceChild(n, t);
        t = n.nextSibling;
      }
      f = nextF;
    }
    while (t) {
      const nextT: ChildNode | null = t.nextSibling;
      to.removeChild(t);
      t = nextT;
    }
  };

  let streamN = '';
  let lastH = -1;
  let lastBg = '';
  // Following the end while it grows, until the reader scrolls up from it.
  let follow = true;
  addEventListener('scroll', () => {
    const el = document.scrollingElement ?? document.documentElement;
    follow = el.scrollTop + innerHeight >= el.scrollHeight - 48;
  });
  // The app's theme, as the kit's colours and font: CSS the app wrote (pages/frame.tsx), kept to a style element.
  const themeText = (v: unknown) => (typeof v === 'string' && v.length < 40000 ? v.replace(/</g, '') : '');
  // The page's light-or-dark rules follow the app's mode (`scheme`, run in the page; here, in this document).
  let schemeOn = false;
  const stream = (d: { html: string; n?: unknown; theme?: unknown; css?: unknown }) => {
    streamN = nonce(d.n);
    const doc = new DOMParser().parseFromString(d.html, 'text/html');
    holdBack(doc);
    const kitEl = doc.createElement('style');
    kitEl.id = 'n-kit';
    kitEl.textContent = kit;
    const themeEl = doc.createElement('style');
    themeEl.id = 'n-theme';
    themeEl.textContent = themeText(d.css);
    doc.head.prepend(kitEl, themeEl);
    doc.documentElement.setAttribute('data-n-theme', theme(d.theme));
    morph(document.documentElement, doc.documentElement);
    if (!schemeOn) {
      schemeOn = true;
      (0, eval)(`(${schemeSrc})`)(theme(d.theme));
    } else (window as unknown as { __nScheme?: (m: string) => void }).__nScheme?.(theme(d.theme));
    const el = document.scrollingElement ?? document.documentElement;
    const h = Math.max(el.scrollHeight, document.body ? document.body.scrollHeight : 0);
    // Its colour too, once it has one (until then the frame keeps the app's).
    let bg = '';
    for (const x of [document.documentElement, document.body]) {
      const c = x ? getComputedStyle(x).backgroundColor : '';
      if (c && c !== 'transparent' && !/^rgba\([^)]*,\s*0\)$/.test(c)) {
        bg = c;
        break;
      }
    }
    if (h !== lastH || bg !== lastBg) parent.postMessage({ type: 'wa-html-size', h: (lastH = h), bg: (lastBg = bg), n: streamN }, '*');
    if (follow) el.scrollTop = el.scrollHeight;
  };

  addEventListener('message', (e) => {
    const d = e.data;
    if (e.source !== parent || !d || typeof d.html !== 'string') return;
    if (d.type === 'wa-html-stream') return stream(d);
    if (d.type !== 'wa-html-page') return;
    const m = DOCTYPE.exec(d.html);
    let head: string;
    let html = d.html;
    if (d.mode === 'edit') {
      const doc = new DOMParser().parseFromString(d.html, 'text/html');
      holdBack(doc);
      const labels = d.labels && typeof d.labels === 'object' ? d.labels : {};
      const cfg = { n: nonce(d.n), theme: theme(d.theme), doctype: m ? m[0].trim() : '', labels };
      head = `<style id="n-kit" data-n-own>${kit}</style><style id="n-theme" data-n-own>${themeText(d.css)}</style><script data-n-own>(${schemeSrc})(${js(cfg.theme)})</script><script data-n-own>(${editorSrc})(${js(cfg)})</script>`;
      html = (m ? m[0] : '') + doc.documentElement.outerHTML;
    } else {
      const cfg = { n: nonce(d.n), theme: theme(d.theme), max: { key: num(d.max?.key, 200), value: num(d.max?.value, 524288) }, fill: d.fill === true };
      // A template's screen: its app's flows and data (no more than its parent sent, and not too much of it).
      const app = d.app && typeof d.app === 'object' && JSON.stringify(d.app).length < 400_000 ? { n: cfg.n, info: d.app.info, labels: d.app.labels } : null;
      // An app's view: drawn by the view's kit, with the template engine, from the view and its values its parent sent.
      const ui =
        d.ui && typeof d.ui === 'object' && JSON.stringify(d.ui).length < 2_000_000
          ? { n: cfg.n, def: d.ui.def, ctx: d.ui.ctx, can: Array.isArray(d.ui.can) ? d.ui.can : [], labels: d.ui.labels && typeof d.ui.labels === 'object' ? d.ui.labels : {}, lang: typeof d.ui.lang === 'string' ? d.ui.lang.slice(0, 20) : 'en', css: uiCss, start: typeof d.ui.start === 'string' ? d.ui.start.slice(0, 40) : undefined, libs: kitLibs }
          : null;
      // The libraries its widgets import (npm packages at exact versions, from jsDelivr): an import map, and their stylesheets.
      const imports: Record<string, string> = {};
      const sheets: string[] = [];
      if (ui && d.ui.libs && typeof d.ui.libs === 'object') {
        const im = d.ui.libs.imports && typeof d.ui.libs.imports === 'object' ? d.ui.libs.imports : {};
        for (const [k, v] of Object.entries(im).slice(0, 40)) if (typeof v === 'string' && v.startsWith(cdn) && !/["'<>\s]/.test(v) && /^[@\w./-]{1,200}$/.test(k)) imports[k] = v;
        for (const v of Array.isArray(d.ui.libs.css) ? d.ui.libs.css.slice(0, 16) : []) if (typeof v === 'string' && v.startsWith(cdn) && /\.css$/i.test(v) && !/["'<>\s]/.test(v)) sheets.push(v);
      }
      const libHead = `${Object.keys(imports).length ? `<script type="importmap">${js({ imports })}</script>` : ''}${sheets.map((h) => `<link rel="stylesheet" href="${h}">`).join('')}`;
      head = `${libHead}<style id="n-kit">${kit}</style><style id="n-theme">${themeText(d.css)}</style><script>(${schemeSrc})(${js(cfg.theme)})</script><script>(${bridgeSrc})(${js(cfg)})</script>${app ? `<script>(${appSrc})(${js(app)})</script>` : ''}${ui ? `<script>(${uiSrc})(${js(ui)}, (${engineSrc})(), (${mediaSrc}))</script>` : ''}`;
    }
    const at = DOCTYPE.exec(html);
    html = at ? at[0] + head + html.slice(at[0].length) : head + html;
    document.open();
    document.write(html);
    document.close();
  });
  parent.postMessage({ type: 'wa-html-ready' }, '*');
}

const asJs = (s: string) => JSON.stringify(s).replace(/</g, '\\u003c');

/** The document of /htmlframe, where every page renders (sandboxed by PAGE_CSP). */
export const frameHtml = () =>
  `<!doctype html>\n<html><head><meta charset="utf-8"></head><body><script>(${scriptSafe(frame.toString())})(${asJs(KIT_CSS)}, ${asJs(BRIDGE_SRC)}, ${asJs(EDITOR_SRC)}, ${asJs(SCHEME_SRC)}, ${asJs(APP_SRC)}, ${asJs(UI_SRC)}, ${asJs(ENGINE_SRC)}, ${asJs(UI_KIT_CSS)}, ${asJs(MEDIA_SRC)}, ${JSON.stringify(KIT_LIB_URLS).replace(/</g, '\\u003c')}, ${asJs(LIB_CDN)})</script></body></html>`;
