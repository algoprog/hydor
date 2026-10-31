// What every page agents make runs with, inside its sandboxed frame: a small stylesheet of ready-made
// classes (options, picture cards, compare tables, pros and cons, buttons, fields) and the bridge
// script. The bridge reports the page's height, sends the user's choices and form answers to the app,
// and gives saved pages window.naget.storage; it talks to the app only by postMessage, each message
// carrying the number the app gave this page. Both go in right after the page's doctype, before its
// own styles and scripts, so its CSS wins and its scripts find window.naget from their first line.
//
// The functions below run in the browser, not here: their source is sent as text (Function#toString),
// so each uses only its arguments and the browser's own globals.

/** The ready-made classes. Light by default; body.n-page follows the app's dark theme. */
export const KIT_CSS = `
:root{--n-bg:#fff;--n-card:#fff;--n-fg:#1d1b17;--n-muted:#675f52;--n-line:#e2ddd2;--n-soft:#f5f3ee;--n-accent:#8a6100;--n-accent-fg:#fff;--n-accent-soft:rgba(176,124,0,.13);--n-ok:#17733a;--n-err:#be2b2b;--n-radius:12px}
html[data-n-theme=dark] .n-page{--n-bg:#151412;--n-card:#1d1b18;--n-fg:#f2eee7;--n-muted:#a39b8e;--n-line:#36322b;--n-soft:#24211d;--n-accent:#d4b158;--n-accent-fg:#1a1306;--n-accent-soft:rgba(212,177,88,.16);--n-ok:#6dbb84;--n-err:#e57373;color-scheme:dark}
.n-page{margin:0;padding:20px;background:var(--n-bg);color:var(--n-fg);font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%}
@media (max-width:480px){.n-page{padding:14px}}
.n-page h1{font-size:22px;line-height:1.25;margin:0 0 6px;letter-spacing:-.01em}
.n-page h2{font-size:17px;line-height:1.3;margin:22px 0 8px}
.n-page a{color:var(--n-accent)}
.n-muted{color:var(--n-muted)}
.n-options{display:flex;flex-direction:column;gap:10px;margin:14px 0}
.n-option{display:flex;align-items:flex-start;gap:12px;padding:12px 14px;border:1px solid var(--n-line);border-radius:var(--n-radius);background:var(--n-card);color:inherit;font:inherit;text-align:left}
.n-letter{flex:none;display:grid;place-items:center;width:28px;height:28px;border-radius:8px;background:var(--n-soft);color:var(--n-muted);font-weight:600;font-size:13px}
.n-option h3,.n-card h3{margin:0 0 2px;font-size:15px;line-height:1.35}
.n-option p,.n-card p{margin:0;color:var(--n-muted);font-size:13.5px;line-height:1.45}
.n-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,200px),1fr));gap:12px;margin:14px 0}
.n-card{position:relative;display:flex;flex-direction:column;padding:0;border:1px solid var(--n-line);border-radius:var(--n-radius);background:var(--n-card);overflow:hidden;color:inherit;font:inherit;text-align:left}
.n-card>img,.n-media{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;background:var(--n-soft)}
.n-body{padding:12px 14px}
[data-choice]{cursor:pointer;-webkit-tap-highlight-color:transparent;transition:border-color .15s,box-shadow .15s,background-color .15s}
.n-option:hover,.n-card:hover{border-color:var(--n-accent)}
[data-choice]:focus-visible{outline:2px solid var(--n-accent);outline-offset:2px}
.n-selected{border-color:var(--n-accent)!important;box-shadow:0 0 0 3px var(--n-accent-soft)}
.n-option.n-selected .n-letter{background:var(--n-accent);color:var(--n-accent-fg)}
.n-card.n-selected::after{content:"✓";position:absolute;top:8px;right:8px;display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--n-accent);color:var(--n-accent-fg);font-size:13px;font-weight:700}
.n-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:14px 0}
.n-compare{width:100%;border-collapse:separate;border-spacing:0;border:1px solid var(--n-line);border-radius:var(--n-radius);overflow:hidden;background:var(--n-card);font-size:14px;margin:14px 0}
.n-scroll>.n-compare{margin:0}
.n-compare th,.n-compare td{padding:9px 12px;text-align:left;vertical-align:top;border-bottom:1px solid var(--n-line)}
.n-compare tr:last-child>*{border-bottom:0}
.n-compare thead th{background:var(--n-soft);font-weight:600}
.n-compare tbody th{font-weight:500;color:var(--n-muted)}
.n-compare .n-selected,.n-best{box-shadow:none;background:var(--n-accent-soft)}
.n-yes{color:var(--n-ok)}
.n-no{color:var(--n-err)}
.n-proscons{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:14px 0}
@media (max-width:520px){.n-proscons{grid-template-columns:1fr}}
.n-pros,.n-cons{padding:12px 14px;border-radius:var(--n-radius);background:var(--n-soft)}
.n-pros h4,.n-cons h4{margin:0 0 6px;font-size:13px;font-weight:600}
.n-pros h4{color:var(--n-ok)}
.n-cons h4{color:var(--n-err)}
.n-pros ul,.n-cons ul{margin:0;padding-left:18px;font-size:14px;line-height:1.5}
.n-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.n-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:36px;padding:0 14px;border:1px solid var(--n-line);border-radius:10px;background:var(--n-card);color:var(--n-fg);font:inherit;font-size:14px;font-weight:500;text-decoration:none;cursor:pointer}
.n-btn:hover{background:var(--n-soft)}
.n-btn.n-primary{border-color:transparent;background:var(--n-accent);color:var(--n-accent-fg)}
.n-btn.n-primary:hover{filter:brightness(1.07)}
.n-field{display:flex;flex-direction:column;gap:5px;margin:0 0 12px;font-size:13.5px;font-weight:500}
.n-field input,.n-field select,.n-field textarea{padding:8px 10px;border:1px solid var(--n-line);border-radius:10px;background:var(--n-card);color:var(--n-fg);font:inherit;font-size:16px;font-weight:400;outline:none}
.n-field input:focus,.n-field select:focus,.n-field textarea:focus{border-color:var(--n-accent);box-shadow:0 0 0 3px var(--n-accent-soft)}
.n-row>.n-field{margin:0}
.n-tag{display:inline-block;padding:1px 8px;border-radius:999px;background:var(--n-soft);color:var(--n-muted);font-size:12px;font-weight:500;line-height:1.6}
`
  .trim()
  .replace(/\n/g, '');

/** What the bridge is told: the number its messages carry, the theme, and the storage limits. */
export interface BridgeCfg {
  n: string;
  theme: 'light' | 'dark' | 'auto';
  max: { key: number; value: number };
  /** Only the stand-ins for the browser's storage (a published site's own pages). */
  bare?: boolean;
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

  // The page's height, so the frame in the conversation fits it.
  if (P) {
    let last = -1;
    const size = () => {
      const h = Math.max(root.scrollHeight, document.body ? document.body.scrollHeight : 0);
      if (h !== last) post({ type: 'wa-html-size', h: (last = h) });
    };
    new ResizeObserver(size).observe(root);
    addEventListener('load', size);
    setTimeout(size, 300);
  }

  // window.naget.storage: the app keeps a saved page's values; without the app, this page's memory does.
  const local = new Map<string, string>();
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
  // Configurable, so a page's own top-level `let naget` still works.
  Object.defineProperty(window, 'naget', { value: Object.freeze({ storage: Object.freeze(storage) }), enumerable: true, configurable: true });

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
 * The frame's own script (/htmlframe): it waits for its parent to post the page, puts the kit at the
 * page's head (as injectHead does) and writes the page in place of itself.
 */
function frame(kit: string, bridgeSrc: string) {
  addEventListener('message', (e) => {
    const d = e.data;
    if (e.source !== parent || !d || d.type !== 'wa-html-page' || typeof d.html !== 'string') return;
    const num = (v: unknown, def: number) => (typeof v === 'number' && v > 0 && v < 1e8 ? v : def);
    const cfg = {
      n: typeof d.n === 'string' ? d.n.slice(0, 64) : '',
      theme: d.theme === 'dark' ? 'dark' : 'light',
      max: { key: num(d.max?.key, 200), value: num(d.max?.value, 524288) },
    };
    const head = `<style id="n-kit">${kit}</style><script>(${bridgeSrc})(${JSON.stringify(cfg).replace(/</g, '\\u003c')})</script>`;
    const m = /^(?:\s|<!--[\s\S]*?-->)*<!doctype[^>]*>/i.exec(d.html);
    const html = m ? m[0] + head + d.html.slice(m[0].length) : head + d.html;
    document.open();
    document.write(html);
    document.close();
  });
  parent.postMessage({ type: 'wa-html-ready' }, '*');
}

const asJs = (s: string) => JSON.stringify(s).replace(/</g, '\\u003c');

/** The document of /htmlframe, where every page renders (sandboxed by PAGE_CSP). */
export const frameHtml = () =>
  `<!doctype html>\n<html><head><meta charset="utf-8"></head><body><script>(${scriptSafe(frame.toString())})(${asJs(KIT_CSS)}, ${asJs(BRIDGE_SRC)})</script></body></html>`;
