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
      const h = Math.max(root.scrollHeight, document.body ? document.body.scrollHeight : 0);
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
 * A function's source for a <script> element: nothing in it may end the element or open an HTML comment
 * there, however the compiler wrote it (it joins '</scr' + 'ipt>' back together). In strings, template
 * strings and patterns alike, \/ is / and \! is !.
 */
export const scriptSafe = (src: string) => src.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

export const BRIDGE_SRC = scriptSafe(bridge.toString());
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
function frame(kit: string, bridgeSrc: string, editorSrc: string, schemeSrc: string) {
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
      head = `<style id="n-kit">${kit}</style><style id="n-theme">${themeText(d.css)}</style><script>(${schemeSrc})(${js(cfg.theme)})</script><script>(${bridgeSrc})(${js(cfg)})</script>`;
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
  `<!doctype html>\n<html><head><meta charset="utf-8"></head><body><script>(${scriptSafe(frame.toString())})(${asJs(KIT_CSS)}, ${asJs(BRIDGE_SRC)}, ${asJs(EDITOR_SRC)}, ${asJs(SCHEME_SRC)})</script></body></html>`;
