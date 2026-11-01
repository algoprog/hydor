// The visual editor that runs inside a page's sandboxed frame (/htmlframe) while the user edits the page.
// The frame writes the page with its scripts held back (they would rebuild what the user changes), and
// this script lets the user pick a part (a click), change its words where they are (a double click),
// drag it elsewhere, and move, copy or delete it from a small bar beside it; the app's inspector changes
// its look and its address, picture or words through messages (`wa-ed`). What it gives back is the
// page's HTML with the user's changes and its scripts as they were.
//
// Like the kit's bridge, the function below runs in the browser: its source is sent as text, so it uses
// only its argument and the browser's own globals.

export interface EditorCfg {
  n: string;
  theme: 'light' | 'dark';
  /** The page's doctype as written, put back in front of what it gives back. */
  doctype: string;
  /** The words on its bar, in the app's language. */
  labels: Record<string, string>;
}

function editor(cfg: EditorCfg) {
  const P = window.parent;
  const L = (k: string, fallback: string) => (typeof cfg.labels?.[k] === 'string' ? cfg.labels[k] : fallback);
  const send = (m: Record<string, unknown>) => {
    try {
      P.postMessage({ ...m, n: cfg.n }, '*');
    } catch {}
  };
  const root = document.documentElement;
  root.setAttribute('data-n-theme', cfg.theme === 'dark' ? 'dark' : 'light');

  // ---- what parts are -------------------------------------------------------------------------------
  const INLINE = new Set(['A', 'ABBR', 'B', 'BR', 'CITE', 'CODE', 'DEL', 'EM', 'I', 'INS', 'KBD', 'MARK', 'Q', 'S', 'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP', 'TIME', 'U', 'WBR', 'FONT']);
  const NO_TEXT = new Set(['IMG', 'VIDEO', 'AUDIO', 'SVG', 'CANVAS', 'INPUT', 'SELECT', 'TEXTAREA', 'IFRAME', 'HR', 'BR', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'UL', 'OL', 'DL', 'PICTURE', 'OBJECT', 'EMBED', 'SCRIPT', 'STYLE', 'TEMPLATE']);
  const ONE_LINE = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BUTTON', 'A', 'LABEL', 'TH', 'TD', 'LI', 'DT', 'SPAN', 'STRONG', 'EM', 'B', 'I', 'SMALL', 'SUMMARY', 'FIGCAPTION', 'LEGEND', 'OPTION', 'CAPTION']);
  const NAMES: Record<string, string> = {
    BODY: L('page', 'Page'), H1: L('h1', 'Heading 1'), H2: L('h2', 'Heading 2'), H3: L('h3', 'Heading 3'), H4: L('h4', 'Heading 4'), H5: L('h5', 'Heading 5'), H6: L('h6', 'Heading 6'),
    P: L('text', 'Text'), SPAN: L('text', 'Text'), STRONG: L('text', 'Text'), EM: L('text', 'Text'), SMALL: L('text', 'Text'), B: L('text', 'Text'), I: L('text', 'Text'),
    A: L('link', 'Link'), BUTTON: L('button', 'Button'), IMG: L('image', 'Picture'), PICTURE: L('image', 'Picture'), SVG: L('drawing', 'Drawing'), CANVAS: L('drawing', 'Drawing'),
    VIDEO: L('video', 'Video'), AUDIO: L('audio', 'Sound'), UL: L('list', 'List'), OL: L('list', 'List'), LI: L('item', 'List item'), TABLE: L('table', 'Table'), TR: L('row', 'Row'),
    TD: L('cell', 'Cell'), TH: L('cell', 'Cell'), THEAD: L('table', 'Table'), TBODY: L('table', 'Table'), HR: L('divider', 'Divider'), BLOCKQUOTE: L('quote', 'Quote'),
    FORM: L('form', 'Form'), INPUT: L('field', 'Field'), TEXTAREA: L('field', 'Field'), SELECT: L('field', 'Field'), LABEL: L('label', 'Label'), HEADER: L('header', 'Top bar'),
    FOOTER: L('footer', 'Footer'), NAV: L('menu', 'Menu'), SECTION: L('section', 'Section'), ARTICLE: L('section', 'Section'), MAIN: L('main', 'Main part'), ASIDE: L('aside', 'Side part'),
    FIGURE: L('figure', 'Figure'), FIGCAPTION: L('caption', 'Caption'), PRE: L('code', 'Code'), CODE: L('code', 'Code'), IFRAME: L('embed', 'Embedded page'), DETAILS: L('details', 'Fold-out'),
    SUMMARY: L('summary', 'Fold-out title'),
  };
  const nameOf = (el: Element): string => {
    const c = el.classList;
    if (c?.contains('n-btn')) return NAMES.BUTTON;
    if (c?.contains('n-card')) return L('card', 'Card');
    if (c?.contains('n-option')) return L('option', 'Option');
    return NAMES[el.tagName.toUpperCase()] ?? L('box', 'Block');
  };
  const isUi = (el: Element | null) => !!el && (el === host || !!el.closest?.('[data-n-own]'));
  /** Words that can be changed where they are: only words and inline parts inside. */
  const wordy = (el: Element): boolean => {
    if (!(el instanceof HTMLElement) || el === document.body || NO_TEXT.has(el.tagName)) return false;
    if (!(el.textContent ?? '').trim() && !ONE_LINE.has(el.tagName) && el.tagName !== 'P') return false;
    for (const c of el.querySelectorAll('*')) if (!INLINE.has(c.tagName) && c.tagName !== 'IMG') return false;
    return true;
  };

  // ---- the layer drawn over the page: outlines, the part's name, its bar ------------------------------
  const host = document.createElement('n-editor-ui');
  host.setAttribute('data-n-own', '');
  for (const [k, v] of [
    ['position', 'fixed'],
    ['inset', '0'],
    ['pointer-events', 'none'],
    ['z-index', '2147483647'],
    ['display', 'block'],
    ['margin', '0'],
    ['padding', '0'],
    ['border', '0'],
    ['background', 'none'],
  ])
    host.style.setProperty(k, v, 'important');
  const shadow = host.attachShadow({ mode: 'closed' });
  const ICON: Record<string, string> = {
    parent: '<path d="M7 17 17 7"/><path d="M7 7h10v10"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    up: '<path d="m18 15-6-6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    dup: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/>',
    del: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/>',
    drag: '<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>',
  };
  const svg = (k: string) => `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;
  const dark = cfg.theme === 'dark';
  const accent = dark ? '#d4b158' : '#b07c00';
  shadow.innerHTML = `<style>
    :host{all:initial}
    .box{position:fixed;pointer-events:none;box-sizing:border-box;border-radius:3px;display:none}
    .hover{border:1px dashed ${accent}}
    .sel{border:2px solid ${accent};box-shadow:0 0 0 4px ${accent}22}
    .sel.editing{border-style:dotted}
    .tag{position:fixed;display:none;pointer-events:none;padding:1px 7px;border-radius:6px;background:${accent};color:${dark ? '#1a1306' : '#fff'};font:600 11px/18px system-ui,sans-serif;white-space:nowrap}
    .bar{position:fixed;display:none;pointer-events:auto;align-items:center;gap:1px;padding:3px;border-radius:10px;background:${dark ? '#24211d' : '#fff'};border:1px solid ${dark ? '#36322b' : '#e2ddd2'};box-shadow:0 6px 20px rgba(0,0,0,.18);font:12px system-ui,sans-serif}
    .bar button{all:unset;display:grid;place-items:center;width:30px;height:28px;border-radius:7px;color:${dark ? '#f2eee7' : '#1d1b17'};cursor:pointer}
    .bar button:hover{background:${dark ? '#36322b' : '#f0ece4'}}
    .bar button[hidden]{display:none}
    .bar button.drag{cursor:grab;touch-action:none}
    .bar .sep{width:1px;height:18px;margin:0 3px;background:${dark ? '#36322b' : '#e2ddd2'}}
    .drop{position:fixed;display:none;height:3px;border-radius:2px;background:${accent};pointer-events:none;box-shadow:0 0 0 2px ${accent}33}
    @media (pointer:coarse){.bar button{width:38px;height:36px}}
  </style>
  <div class="box hover"></div><div class="box sel"></div><div class="tag"></div><div class="drop"></div>
  <div class="bar" role="toolbar">
    <button class="drag" data-a="drag" title="${L('drag', 'Drag to move it')}">${svg('drag')}</button>
    <button data-a="parent" title="${L('parentTip', 'Pick the part around it (Esc)')}">${svg('parent')}</button>
    <button data-a="edit" title="${L('editTip', 'Change the words (double-click)')}">${svg('edit')}</button>
    <span class="sep"></span>
    <button data-a="up" title="${L('upTip', 'Move up')}">${svg('up')}</button>
    <button data-a="down" title="${L('downTip', 'Move down')}">${svg('down')}</button>
    <button data-a="dup" title="${L('dupTip', 'Duplicate (Ctrl+D)')}">${svg('dup')}</button>
    <button data-a="del" title="${L('delTip', 'Delete (Delete)')}">${svg('del')}</button>
  </div>`;
  const $ = (s: string) => shadow.querySelector(s) as HTMLElement;
  const hoverBox = $('.hover');
  const selBox = $('.sel');
  const tag = $('.tag');
  const bar = $('.bar');
  const drop = $('.drop');

  let sel: Element | null = null;
  let hover: Element | null = null;
  let editing: HTMLElement | null = null;
  let editBefore = '';

  const place = (el: HTMLElement, r: DOMRect | null) => {
    if (!r) {
      el.style.display = 'none';
      return;
    }
    el.style.display = 'block';
    el.style.left = `${r.left - 2}px`;
    el.style.top = `${r.top - 2}px`;
    el.style.width = `${r.width + 4}px`;
    el.style.height = `${r.height + 4}px`;
  };
  const draw = () => {
    place(hoverBox, hover && hover !== sel && hover.isConnected ? hover.getBoundingClientRect() : null);
    if (!sel || !sel.isConnected) {
      place(selBox, null);
      tag.style.display = 'none';
      bar.style.display = 'none';
      return;
    }
    const r = sel.getBoundingClientRect();
    place(selBox, r);
    selBox.classList.toggle('editing', !!editing);
    tag.textContent = nameOf(sel);
    tag.style.display = 'block';
    const vw = innerWidth;
    const vh = innerHeight;
    const tagTop = r.top - 22 >= 2 ? r.top - 22 : Math.min(r.bottom + 4, vh - 22);
    tag.style.left = `${Math.max(2, Math.min(r.left - 2, vw - tag.offsetWidth - 2))}px`;
    tag.style.top = `${tagTop}px`;
    if (editing) {
      bar.style.display = 'none';
      return;
    }
    bar.style.display = 'flex';
    const isBody = sel === document.body;
    (bar.querySelector('[data-a=drag]') as HTMLElement).hidden = isBody;
    (bar.querySelector('[data-a=parent]') as HTMLElement).hidden = isBody;
    (bar.querySelector('[data-a=edit]') as HTMLElement).hidden = !wordy(sel);
    (bar.querySelector('[data-a=up]') as HTMLElement).hidden = isBody || !sel.previousElementSibling;
    (bar.querySelector('[data-a=down]') as HTMLElement).hidden = isBody || !nextPart(sel);
    (bar.querySelector('[data-a=dup]') as HTMLElement).hidden = isBody;
    (bar.querySelector('[data-a=del]') as HTMLElement).hidden = isBody;
    if (![...bar.querySelectorAll('button')].some((b) => !b.hidden)) {
      bar.style.display = 'none';
      return;
    }
    const bw = bar.offsetWidth;
    const bh = bar.offsetHeight;
    // Above the part, at its right; below it when there is no room; inside its top when it fills the screen.
    let top = r.top - bh - 8;
    if (top < 4) top = r.bottom + 8;
    if (top + bh > vh - 4) top = Math.max(4, r.top + 8);
    bar.style.left = `${Math.max(4, Math.min(r.right - bw, vw - bw - 4))}px`;
    bar.style.top = `${top}px`;
    // The name moves aside when the bar sits on it.
    if (Math.abs(top - tagTop) < bh && r.right - bw < r.left + tag.offsetWidth + 8) tag.style.display = 'none';
  };
  let frame = 0;
  const redraw = () => {
    if (!frame) frame = requestAnimationFrame(() => ((frame = 0), draw()));
  };
  /** The next part after it, not counting the page's own (held back) scripts. */
  const nextPart = (el: Element) => {
    let x = el.nextElementSibling;
    while (x && (x.tagName === 'SCRIPT' || isUi(x))) x = x.nextElementSibling;
    return x;
  };

  // ---- where a part is, as the app names it ------------------------------------------------------------
  const pathOf = (el: Element): number[] => {
    const out: number[] = [];
    let x: Element | null = el;
    while (x && x !== root) {
      const p: Element | null = x.parentElement;
      if (!p) break;
      out.unshift([...p.children].indexOf(x));
      x = p;
    }
    return out;
  };
  const byPath = (path: unknown): Element | null => {
    if (!Array.isArray(path)) return null;
    let x: Element | null = root;
    for (const i of path) x = x && Number.isInteger(i) ? (x.children[i as number] ?? null) : null;
    return x && !isUi(x) && x !== root && x !== document.head && !document.head.contains(x) ? x : null;
  };

  // ---- the page's colours, for the inspector's swatches ------------------------------------------------
  const palette = (): string[] => {
    const count = new Map<string, number>();
    let i = 0;
    for (const el of document.body.querySelectorAll('*')) {
      if (++i > 1500) break;
      const cs = getComputedStyle(el);
      for (const c of [cs.color, cs.backgroundColor, cs.borderTopColor]) {
        if (!c || /rgba\([^)]*,\s*0\)$/.test(c) || c === 'transparent') continue;
        count.set(c, (count.get(c) ?? 0) + 1);
      }
    }
    return [...count].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([c]) => c);
  };

  const STYLE_PROPS = [
    'color', 'background-color', 'background-image', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-align', 'line-height', 'letter-spacing', 'text-decoration-line',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right', 'border-top-left-radius',
    'border-top-width', 'border-top-style', 'border-top-color', 'width', 'max-width', 'height', 'display', 'flex-direction', 'flex-wrap', 'gap', 'justify-content', 'align-items',
    'grid-template-columns', 'opacity', 'box-shadow', 'object-fit',
  ];
  const info = (el: Element) => {
    const cs = getComputedStyle(el);
    const computed: Record<string, string> = {};
    for (const p of STYLE_PROPS) computed[p] = cs.getPropertyValue(p);
    const inline: Record<string, string> = {};
    const st = (el as HTMLElement).style;
    if (st) for (let i = 0; i < st.length; i++) inline[st[i]] = st.getPropertyValue(st[i]);
    const attrs: Record<string, string> = {};
    for (const a of ['id', 'class', 'href', 'target', 'src', 'alt', 'title', 'placeholder', 'value', 'type', 'name', 'data-choice', 'data-group']) {
      const v = el.getAttribute(a);
      if (v !== null) attrs[a] = a === 'src' && v.length > 300 ? `${v.slice(0, 300)}…` : v;
    }
    const crumbs: { name: string; tag: string; path: number[] }[] = [];
    for (let x: Element | null = el; x && x !== root; x = x.parentElement) crumbs.unshift({ name: nameOf(x), tag: x.tagName.toLowerCase(), path: pathOf(x) });
    const words = wordy(el) && el.children.length === 0 ? (el as HTMLElement).innerText : undefined;
    return {
      path: pathOf(el),
      tag: el.tagName.toLowerCase(),
      name: nameOf(el),
      crumbs,
      words: words !== undefined && words.length <= 4000 ? words : undefined,
      wordy: wordy(el),
      children: el.children.length,
      attrs,
      computed,
      inline,
      can: { up: el !== document.body && !!el.previousElementSibling, down: el !== document.body && !!nextPart(el), parent: el !== document.body, remove: el !== document.body },
    };
  };
  const tell = () => send({ type: 'wa-ed-sel', sel: sel && sel.isConnected ? info(sel) : null });

  // ---- history ------------------------------------------------------------------------------------------
  const undo: string[] = [];
  const redo: string[] = [];
  let dirty = false;
  const snap = () => document.body.outerHTML;
  const state = () => send({ type: 'wa-ed-state', dirty, canUndo: undo.length > 0, canRedo: redo.length > 0 });
  /** Before a change: what to go back to. */
  const remember = () => {
    undo.push(snap());
    if (undo.length > 150) undo.shift();
    redo.length = 0;
  };
  let paletteTimer = 0;
  const changed = () => {
    dirty = true;
    state();
    tell();
    redraw();
    clearTimeout(paletteTimer);
    paletteTimer = window.setTimeout(() => send({ type: 'wa-ed-palette', colors: palette() }), 600);
  };
  const restore = (html: string) => {
    const path = sel ? pathOf(sel) : null;
    const d = new DOMParser().parseFromString(`<!doctype html><html><head></head>${html}</html>`, 'text/html');
    root.replaceChild(document.importNode(d.body, true), document.body);
    sel = (path && byPath(path)) || null;
    hover = null;
    changed();
  };
  const step = (back: boolean) => {
    finishEditing();
    const from = back ? undo : redo;
    const to = back ? redo : undo;
    const html = from.pop();
    if (html === undefined) return;
    to.push(snap());
    restore(html);
  };

  // ---- picking and changing words -------------------------------------------------------------------------
  const select = (el: Element | null) => {
    if (el && (isUi(el) || el === root || el === document.head || document.head.contains(el))) el = document.body;
    if (editing && el !== editing) finishEditing();
    sel = el;
    tell();
    redraw();
  };
  /** The caret where the click was (in the part's words), else at their end. */
  const caretAt = (el: HTMLElement, at?: { x: number; y: number }) => {
    const s = getSelection();
    if (!s) return;
    let r: Range | null = null;
    const d = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
    if (at) {
      if (d.caretRangeFromPoint) r = d.caretRangeFromPoint(at.x, at.y);
      else if (d.caretPositionFromPoint) {
        const p = d.caretPositionFromPoint(at.x, at.y);
        if (p) {
          r = document.createRange();
          r.setStart(p.offsetNode, p.offset);
        }
      }
      if (r && !el.contains(r.startContainer)) r = null;
    }
    if (!r) {
      r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
    }
    s.removeAllRanges();
    s.addRange(r);
  };
  const startEditing = (el: Element | null, at?: { x: number; y: number }) => {
    if (!el || !wordy(el)) return;
    if (editing === el) return;
    finishEditing();
    sel = el;
    editing = el as HTMLElement;
    editBefore = editing.innerHTML;
    remember();
    editing.setAttribute('contenteditable', 'true');
    editing.setAttribute('data-n-ce', '');
    editing.focus({ preventScroll: true });
    caretAt(editing, at);
    tell();
    redraw();
  };
  function finishEditing() {
    const el = editing;
    if (!el) return;
    editing = null;
    el.removeAttribute('contenteditable');
    el.removeAttribute('data-n-ce');
    // A lone line break the browser leaves in an emptied part is not the user's.
    if (el.innerHTML === '<br>') el.innerHTML = '';
    if (el.innerHTML === editBefore) undo.pop();
    else changed();
    getSelection()?.removeAllRanges();
    redraw();
  }

  // ---- what the bar and the inspector ask for --------------------------------------------------------------
  let lastStyle: { el: Element; at: number } | null = null;
  const act = (a: string, arg?: any) => {
    if (a !== 'style') lastStyle = null;
    const el = sel;
    const body = document.body;
    switch (a) {
      case 'parent':
        if (el && el !== body) select(el.parentElement);
        return;
      case 'edit':
        return startEditing(el);
      case 'up': {
        const prev = el?.previousElementSibling;
        if (!el || el === body || !prev) return;
        remember();
        prev.before(el);
        break;
      }
      case 'down': {
        const next = el && nextPart(el);
        if (!el || el === body || !next) return;
        remember();
        next.after(el);
        break;
      }
      case 'dup': {
        if (!el || el === body) return;
        remember();
        const c = el.cloneNode(true) as Element;
        c.removeAttribute('id');
        for (const x of c.querySelectorAll('[id]')) x.removeAttribute('id');
        el.after(c);
        sel = c;
        break;
      }
      case 'del': {
        if (!el || el === body) return;
        remember();
        const next = nextPart(el) ?? el.previousElementSibling ?? el.parentElement;
        el.remove();
        sel = next && next !== root ? next : body;
        break;
      }
      case 'insert': {
        // A block from the app's list: after the part picked, or at the end of the page.
        const t = document.createElement('template');
        t.innerHTML = String(arg?.html ?? '');
        const node = t.content.firstElementChild;
        if (!node) return;
        remember();
        const into = arg?.inside && el && el !== body && !NO_TEXT.has(el.tagName) ? el : null;
        if (into) into.append(node);
        else if (!el || el === body) {
          // Before the page's own scripts at the end, so it shows after the rest.
          let last: Element | null = body.lastElementChild;
          while (last && last.tagName === 'SCRIPT') last = last.previousElementSibling;
          if (last) last.after(node);
          else body.prepend(node);
        } else el.after(node);
        sel = node;
        changed();
        (node as HTMLElement).scrollIntoView?.({ block: 'nearest' });
        if (arg?.edit) startEditing(node.matches('h1,h2,h3,h4,p,a,button,li,blockquote') ? node : node.querySelector('h1,h2,h3,h4,p,a,button,li'));
        return;
      }
      case 'style': {
        if (!el) return;
        const props = (arg && typeof arg === 'object' ? arg : {}) as Record<string, string | null>;
        // A slider dragged along is one change to undo, not one per step.
        if (!(lastStyle && lastStyle.el === el && Date.now() - lastStyle.at < 1200)) remember();
        lastStyle = { el, at: Date.now() };
        const st = (el as HTMLElement).style;
        for (const [p, v] of Object.entries(props)) {
          if (!/^-?[a-z][a-z-]*$/.test(p)) continue;
          if (v === null || v === '') st.removeProperty(p);
          else st.setProperty(p, String(v).replace(/!important/gi, '').trim());
        }
        if (!el.getAttribute('style')?.trim()) el.removeAttribute('style');
        break;
      }
      case 'css': {
        if (!el) return;
        remember();
        const v = String(arg ?? '').trim();
        if (v) el.setAttribute('style', v);
        else el.removeAttribute('style');
        break;
      }
      case 'attr': {
        if (!el || !arg || typeof arg.name !== 'string') return;
        const name = arg.name.toLowerCase();
        // Handlers would only be held back here: they are written in the code view.
        if (!/^[a-z][a-z0-9:_.-]*$/.test(name) || name.startsWith('on') || name === 'contenteditable' || name.startsWith('data-n-')) return;
        remember();
        if (arg.value === null) el.removeAttribute(name);
        else el.setAttribute(name, String(arg.value));
        break;
      }
      case 'words': {
        if (!el || !wordy(el)) return;
        remember();
        (el as HTMLElement).innerText = String(arg ?? '');
        break;
      }
      case 'retag': {
        // Heading 1 into Text, and back: the same words and look in another kind of part.
        const to = String(arg ?? '').toLowerCase();
        if (!el || el === body || !/^(h[1-6]|p|blockquote|pre|div|section|li|button|a|span)$/.test(to)) return;
        remember();
        const nx = document.createElement(to);
        for (const at of [...el.attributes]) nx.setAttribute(at.name, at.value);
        while (el.firstChild) nx.append(el.firstChild);
        el.replaceWith(nx);
        sel = nx;
        break;
      }
      case 'select':
        return select(byPath(arg) ?? document.body);
      case 'deselect':
        return select(null);
      case 'undo':
        return step(true);
      case 'redo':
        return step(false);
      default:
        return;
    }
    changed();
  };

  bar.addEventListener('pointerdown', (e) => {
    const b = (e.target as Element).closest?.('button');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    if (b.dataset.a === 'drag') dragStart(e as PointerEvent);
  });
  bar.addEventListener('click', (e) => {
    const b = (e.target as Element).closest?.('button');
    e.preventDefault();
    e.stopPropagation();
    if (b && b.dataset.a !== 'drag') act(b.dataset.a!);
  });

  // ---- dragging a part to another place ------------------------------------------------------------------
  let dragging: { target: Element; after: boolean } | null = null;
  const under = (x: number, y: number): Element | null => {
    host.style.setProperty('display', 'none', 'important');
    const el = document.elementFromPoint(x, y);
    host.style.setProperty('display', 'block', 'important');
    return el;
  };
  function dragStart(e: PointerEvent) {
    const el = sel;
    if (!el || el === document.body) return;
    const move = (ev: PointerEvent) => {
      let t = under(ev.clientX, ev.clientY);
      // Not into itself; the page's top level parts when pointing at the page.
      while (t && (el.contains(t) || t === root)) t = t.parentElement;
      if (!t || t === document.body || t === root) {
        dragging = null;
        drop.style.display = 'none';
        return;
      }
      const r = t.getBoundingClientRect();
      const row = t.parentElement ? getComputedStyle(t.parentElement).flexDirection === 'row' && getComputedStyle(t.parentElement).display.includes('flex') : false;
      const after = row ? ev.clientX > r.left + r.width / 2 : ev.clientY > r.top + r.height / 2;
      dragging = { target: t, after };
      drop.style.display = 'block';
      if (row) {
        drop.style.left = `${(after ? r.right : r.left) - 1}px`;
        drop.style.top = `${r.top}px`;
        drop.style.width = '3px';
        drop.style.height = `${r.height}px`;
      } else {
        drop.style.left = `${r.left}px`;
        drop.style.top = `${(after ? r.bottom : r.top) - 1}px`;
        drop.style.width = `${r.width}px`;
        drop.style.height = '3px';
      }
    };
    const up = () => {
      removeEventListener('pointermove', move, true);
      removeEventListener('pointerup', up, true);
      removeEventListener('pointercancel', up, true);
      drop.style.display = 'none';
      const d = dragging;
      dragging = null;
      if (!d || !el.isConnected) return;
      remember();
      if (d.after) d.target.after(el);
      else d.target.before(el);
      sel = el;
      changed();
    };
    addEventListener('pointermove', move, true);
    addEventListener('pointerup', up, true);
    addEventListener('pointercancel', up, true);
    move(e);
  }

  // ---- the page's own events: held, except while words are being changed -----------------------------------
  const fromUi = (e: Event) => e.composedPath().includes(host);
  const inEditing = (e: Event) => !!editing && e.target instanceof Node && editing.contains(e.target);
  const hold = (e: Event) => {
    if (fromUi(e) || inEditing(e)) return;
    e.preventDefault();
    e.stopPropagation();
  };
  addEventListener(
    'pointerdown',
    (e) => {
      if (fromUi(e) || inEditing(e)) return;
      e.preventDefault();
      // Held, the press would not give the page the keys (Delete, Esc, arrows).
      window.focus();
    },
    true,
  );
  addEventListener(
    'click',
    (e) => {
      if (fromUi(e) || inEditing(e)) return;
      hold(e);
      const t = e.target as Element;
      // A second click (or tap) on the picked part changes its words: phones have no double tap here.
      if (t === sel && wordy(t)) return startEditing(t, { x: e.clientX, y: e.clientY });
      select(t);
    },
    true,
  );
  addEventListener(
    'dblclick',
    (e) => {
      if (fromUi(e) || inEditing(e)) return;
      hold(e);
      startEditing(e.target as Element, { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY });
    },
    true,
  );
  for (const t of ['submit', 'auxclick', 'contextmenu', 'dragstart']) addEventListener(t, hold, true);
  addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType === 'touch' || dragging) return;
      const t = fromUi(e) ? null : (e.target as Element);
      if (t !== hover) {
        hover = t && t !== root ? t : null;
        redraw();
      }
    },
    true,
  );
  document.addEventListener('mouseleave', () => {
    hover = null;
    redraw();
  });
  addEventListener('scroll', redraw, true);
  addEventListener('resize', redraw);
  addEventListener(
    'focusout',
    (e) => {
      if (editing && e.target === editing) setTimeout(() => editing && document.activeElement !== editing && finishEditing(), 0);
    },
    true,
  );
  // Pasted words come in as words, not as another page's markup.
  addEventListener(
    'paste',
    (e) => {
      if (!inEditing(e)) return;
      e.preventDefault();
      const text = e.clipboardData?.getData('text/plain') ?? '';
      document.execCommand('insertText', false, text);
    },
    true,
  );
  addEventListener(
    'keydown',
    (e) => {
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key;
      if (mod && k.toLowerCase() === 's') {
        e.preventDefault();
        finishEditing();
        return send({ type: 'wa-ed-save' });
      }
      if (editing) {
        if (k === 'Escape' || (k === 'Enter' && !e.shiftKey && ONE_LINE.has(editing.tagName))) {
          e.preventDefault();
          finishEditing();
        }
        return;
      }
      if (mod && k.toLowerCase() === 'z') {
        e.preventDefault();
        return act(e.shiftKey ? 'redo' : 'undo');
      }
      if (mod && k.toLowerCase() === 'y') {
        e.preventDefault();
        return act('redo');
      }
      if (!sel) return;
      if (mod && k.toLowerCase() === 'd') {
        e.preventDefault();
        return act('dup');
      }
      if (k === 'Delete' || k === 'Backspace') {
        e.preventDefault();
        return act('del');
      }
      if (k === 'Escape') {
        e.preventDefault();
        return sel === document.body ? select(null) : act('parent');
      }
      if (k === 'Enter' || k === 'F2') {
        e.preventDefault();
        return act('edit');
      }
      if (e.altKey && (k === 'ArrowUp' || k === 'ArrowDown')) {
        e.preventDefault();
        return act(k === 'ArrowUp' ? 'up' : 'down');
      }
      if (k === 'ArrowUp' || k === 'ArrowDown') {
        e.preventDefault();
        const x = k === 'ArrowUp' ? sel.previousElementSibling : nextPart(sel);
        if (x) select(x);
        return;
      }
      if (k === 'ArrowLeft') {
        e.preventDefault();
        return act('parent');
      }
      if (k === 'ArrowRight') {
        e.preventDefault();
        const c = sel.firstElementChild;
        if (c && c.tagName !== 'SCRIPT') select(c);
      }
    },
    true,
  );

  // ---- the HTML to give back -------------------------------------------------------------------------------
  const serialize = (): string => {
    finishEditing();
    const copy = root.cloneNode(true) as HTMLElement;
    for (const el of copy.querySelectorAll('[data-n-own]')) el.remove();
    for (const el of [copy, ...copy.querySelectorAll('*')]) {
      for (const a of [...el.attributes]) {
        if (a.name.startsWith('data-n-x-')) {
          el.removeAttribute(a.name);
          el.setAttribute(a.name.slice(9), a.value);
        }
      }
      if (el.tagName === 'SCRIPT' && el.hasAttribute('data-n-type')) {
        const t = el.getAttribute('data-n-type');
        el.removeAttribute('data-n-type');
        if (t) el.setAttribute('type', t);
        else el.removeAttribute('type');
      }
      if (el.hasAttribute('data-n-ce')) {
        el.removeAttribute('data-n-ce');
        el.removeAttribute('contenteditable');
      }
    }
    copy.removeAttribute('data-n-theme');
    return `${cfg.doctype ? `${cfg.doctype}\n` : ''}${copy.outerHTML}`;
  };

  addEventListener('message', (e) => {
    const d = e.data;
    if (e.source !== P || !d || d.n !== cfg.n || d.type !== 'wa-ed') return;
    if (d.cmd === 'html') return send({ type: 'wa-ed-html', id: d.id, html: serialize() });
    if (d.cmd === 'saved') {
      dirty = false;
      return state();
    }
    act(String(d.cmd), d.arg);
  });

  const ready = () => {
    root.appendChild(host);
    select(null);
    state();
    send({ type: 'wa-ed-ready', colors: palette() });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
}

/** Puts `function`s' sources in a <script> safely (kit.ts's rules). */
const scriptSafe = (src: string) => src.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

export const EDITOR_SRC = scriptSafe(editor.toString());
