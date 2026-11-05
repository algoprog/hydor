// The visual editor that runs inside a page's sandboxed frame (/htmlframe) while the user edits the page.
// The frame writes the page with its scripts held back (they would rebuild what the user changes), and
// this script lets the user pick a part (a click or a tap), change its words where they are (a second
// click) with a small bar for bold, italic, links and the like, drag it elsewhere or resize it by its
// edges, and move, copy, wrap or delete it. The app's inspector changes its look and its address,
// picture or words through messages (`wa-ed`), and the page's own look: its colours (CSS variables), its
// fonts, its headings' and text's styles, its title, and CSS of the user's own.
//
// Changes to one part go in its style attribute; changes for a hover, for a tablet's or a phone's width,
// or for every part of a kind (all Heading 2s, every part with a class) go in a stylesheet of the
// editor's own in the page (<style id="n-styles">), so they stay with the page. What it gives back is
// the page's HTML with the user's changes and its scripts as they were.
//
// Writing as in Notion (blocks that flow into each other, Markdown as you type, "/" for blocks, handles
// beside each block and their menu, several blocks picked, an icon and a cover) is writing.ts, which this
// hands its insides to. Undo keeps a step per change of a block: while words are being written, Ctrl+Z
// takes back the last few words typed first, then the change before.
//
// Like the kit's bridge, the function below runs in the browser: its source is sent as text, so it uses
// only its argument and the browser's own globals.
import { writing, type At, type Core, type Next, type Writing } from './writing.ts';

export interface EditorCfg {
  n: string;
  theme: 'light' | 'dark';
  /** The page's doctype as written, put back in front of what it gives back. */
  doctype: string;
  /** The words on its bars, in the app's language. */
  labels: Record<string, string>;
}

function editor(cfg: EditorCfg, writing: (core: Core) => Writing) {
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
  const INLINE = new Set(['A', 'ABBR', 'B', 'BR', 'CITE', 'CODE', 'DEL', 'EM', 'I', 'INS', 'KBD', 'MARK', 'Q', 'S', 'SMALL', 'SPAN', 'STRIKE', 'STRONG', 'SUB', 'SUP', 'TIME', 'U', 'WBR', 'FONT']);
  const NO_TEXT = new Set([
    'IMG',
    'VIDEO',
    'AUDIO',
    'SVG',
    'CANVAS',
    'INPUT',
    'SELECT',
    'TEXTAREA',
    'IFRAME',
    'HR',
    'BR',
    'TABLE',
    'THEAD',
    'TBODY',
    'TFOOT',
    'TR',
    'UL',
    'OL',
    'DL',
    'PICTURE',
    'OBJECT',
    'EMBED',
    'SCRIPT',
    'STYLE',
    'TEMPLATE',
  ]);
  const ONE_LINE = new Set([
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'BUTTON',
    'A',
    'LABEL',
    'TH',
    'TD',
    'LI',
    'DT',
    'SPAN',
    'STRONG',
    'EM',
    'B',
    'I',
    'SMALL',
    'SUMMARY',
    'FIGCAPTION',
    'LEGEND',
    'OPTION',
    'CAPTION',
  ]);
  /** Parts that hold others: what Add can put a new part inside. */
  const HOLDS = new Set([
    'BODY',
    'DIV',
    'SECTION',
    'ARTICLE',
    'MAIN',
    'ASIDE',
    'HEADER',
    'FOOTER',
    'NAV',
    'FORM',
    'UL',
    'OL',
    'LI',
    'TD',
    'TH',
    'FIGURE',
    'DETAILS',
    'BLOCKQUOTE',
    'FIELDSET',
    'LABEL',
  ]);
  const NAMES: Record<string, string> = {
    BODY: L('page', 'Page'),
    H1: L('h1', 'Heading 1'),
    H2: L('h2', 'Heading 2'),
    H3: L('h3', 'Heading 3'),
    H4: L('h4', 'Heading 4'),
    H5: L('h5', 'Heading 5'),
    H6: L('h6', 'Heading 6'),
    P: L('text', 'Text'),
    SPAN: L('text', 'Text'),
    STRONG: L('text', 'Text'),
    EM: L('text', 'Text'),
    SMALL: L('text', 'Text'),
    B: L('text', 'Text'),
    I: L('text', 'Text'),
    A: L('link', 'Link'),
    BUTTON: L('button', 'Button'),
    IMG: L('image', 'Picture'),
    PICTURE: L('image', 'Picture'),
    SVG: L('drawing', 'Drawing'),
    CANVAS: L('drawing', 'Drawing'),
    VIDEO: L('video', 'Video'),
    AUDIO: L('audio', 'Sound'),
    UL: L('list', 'List'),
    OL: L('list', 'List'),
    LI: L('item', 'List item'),
    TABLE: L('table', 'Table'),
    TR: L('row', 'Row'),
    TD: L('cell', 'Cell'),
    TH: L('cell', 'Cell'),
    THEAD: L('table', 'Table'),
    TBODY: L('table', 'Table'),
    HR: L('divider', 'Divider'),
    BLOCKQUOTE: L('quote', 'Quote'),
    FORM: L('form', 'Form'),
    INPUT: L('field', 'Field'),
    TEXTAREA: L('field', 'Field'),
    SELECT: L('field', 'Field'),
    LABEL: L('label', 'Label'),
    HEADER: L('header', 'Top bar'),
    FOOTER: L('footer', 'Footer'),
    NAV: L('menu', 'Menu'),
    SECTION: L('section', 'Section'),
    ARTICLE: L('section', 'Section'),
    MAIN: L('main', 'Main part'),
    ASIDE: L('aside', 'Side part'),
    FIGURE: L('figure', 'Figure'),
    FIGCAPTION: L('caption', 'Caption'),
    PRE: L('code', 'Code'),
    CODE: L('code', 'Code'),
    IFRAME: L('embed', 'Embedded page'),
    DETAILS: L('details', 'Fold-out'),
    SUMMARY: L('summary', 'Fold-out title'),
  };
  const nameOf = (el: Element): string => {
    const c = el.classList;
    if (c?.contains('n-btn')) return NAMES.BUTTON;
    if (c?.contains('n-card')) return L('card', 'Card');
    if (c?.contains('n-option')) return L('option', 'Option');
    if (c?.contains('n-callout')) return L('sCallout', 'Callout');
    if (c?.contains('n-callout-text')) return NAMES.P;
    if (c?.contains('n-toggle')) return L('sToggle', 'Toggle list');
    if (c?.contains('n-cols')) return L('columns', 'Columns');
    if (c?.contains('n-toc')) return L('sToc', 'Table of contents');
    if (c?.contains('n-cover')) return L('cover', 'Cover');
    if (c?.contains('n-icon')) return L('icon', 'Icon');
    if (c?.contains('n-video')) return L('video', 'Video');
    if (c?.contains('n-math')) return L('sMath', 'Maths');
    if (el.tagName === 'LI' && el.parentElement?.classList.contains('n-todo')) return L('phTodo', 'To-do');
    if (c?.contains('n-todo')) return L('sTodo', 'To-do list');
    return NAMES[el.tagName.toUpperCase()] ?? L('box', 'Block');
  };
  const isUi = (el: Element | null) => !!el && (el === host || !!el.closest?.('[data-n-own]'));
  /** Blocks that are drawn rather than written (changed through their own fields). */
  const DRAWN = '.n-video,.n-math,.n-toc,.n-cover,.n-icon';
  const inlineOnly = (c: Element) => (INLINE.has(c.tagName) || c.tagName === 'IMG') && [...c.querySelectorAll('*')].every((x) => INLINE.has(x.tagName) || x.tagName === 'IMG');
  /**
   * Words that can be changed where they are: only words and inline parts inside. A list's item may have lists
   * nested after its words (its own words are written; the lists stay as they are).
   */
  const wordy = (el: Element): boolean => {
    if (!(el instanceof HTMLElement) || el === document.body || NO_TEXT.has(el.tagName) || el.matches(DRAWN)) return false;
    if (!(el.textContent ?? '').trim() && !ONE_LINE.has(el.tagName) && !/^(P|BLOCKQUOTE|PRE)$/.test(el.tagName) && !el.classList.contains('n-callout-text')) return false;
    let lists = false;
    for (const c of el.children) {
      if (el.tagName === 'LI' && (c.tagName === 'UL' || c.tagName === 'OL')) {
        lists = true;
        continue;
      }
      if (lists || !inlineOnly(c)) return false;
    }
    return true;
  };
  const OWN = /^n-s[a-z0-9]{5}$/;
  /** The editor's own class for a part (a hover or a size of its own needs a name to be styled by). */
  const ownClassOf = (el: Element) => [...el.classList].find((c) => OWN.test(c));
  const snippet = (el: Element): string => {
    if (el.tagName === 'IMG') return el.getAttribute('alt') || (el.getAttribute('src') ?? '').split(/[/?#]/).filter(Boolean).pop()?.slice(0, 40) || '';
    const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    return t.length > 60 ? `${t.slice(0, 59)}…` : t;
  };

  // ---- the layer drawn over the page ------------------------------------------------------------------
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
    bold: '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7z"/><path d="M7 12h7a3.5 3.5 0 0 1 0 7H7z"/>',
    italic: '<path d="M14 5h-4"/><path d="M14 19h-4"/><path d="M14 5 10 19"/>',
    underline: '<path d="M7 4v6a5 5 0 0 0 10 0V4"/><path d="M5 20h14"/>',
    strike: '<path d="M5 12h14"/><path d="M16 6.5A4 4 0 0 0 12 5c-2.5 0-4 1.3-4 3 0 1.4 1 2.3 3 3"/><path d="M8 17.5A4.5 4.5 0 0 0 12 19c2.5 0 4-1.3 4-3.2"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    unlink:
      '<path d="m18.8 13.4 1.7-1.7a5 5 0 0 0-7.1-7.1l-1.7 1.7"/><path d="m5.2 10.6-1.7 1.7a5 5 0 0 0 7.1 7.1l1.7-1.7"/><path d="m8 2v3"/><path d="M2 8h3"/><path d="M16 22v-3"/><path d="M22 16h-3"/>',
    clear: '<path d="M4 7V4h16v3"/><path d="M5 20h6"/><path d="M13 4 8 20"/><path d="m15 15 5 5"/><path d="m20 15-5 5"/>',
    done: '<path d="M20 6 9 17l-5-5"/>',
    code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
    colour: '<path d="M6 16 12 4l6 12"/><path d="M8.5 11h7"/><path d="M4 20h16" stroke-width="3"/>',
    chev: '<path d="m6 9 6 6 6-6"/>',
  };
  const svg = (k: string) => `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;
  const dark = cfg.theme === 'dark';
  const accent = dark ? '#8aa8ff' : '#b07c00';
  const panel = dark ? '#1b1f27' : '#fff';
  const line = dark ? '#3a4150' : '#e2ddd2';
  const ink = dark ? '#e9edf5' : '#1d1b17';
  const muted = dark ? '#8f99ab' : '#7a7266';
  const coarse = matchMedia('(pointer: coarse)').matches;
  const attr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  /** The colours of words, Notion's: text and highlight (the kit's .n-tc-… and .n-hl-… classes). */
  const COLOURS: [string, string][] = [
    ['grey', '#787774'],
    ['brown', '#9f6b53'],
    ['orange', '#d9730d'],
    ['yellow', '#cb912f'],
    ['green', '#448361'],
    ['blue', '#337ea9'],
    ['purple', '#9065b0'],
    ['pink', '#c14c8a'],
    ['red', '#d44c47'],
  ];
  const colourWord = (c: string) => attr(L(`c${c[0].toUpperCase()}${c.slice(1)}`, c[0].toUpperCase() + c.slice(1)));
  const swatches = (type: 'tc' | 'hl') =>
    [['', ''] as [string, string], ...COLOURS]
      .map(
        ([c, hex]) =>
          `<button data-w="${type}:${c}" title="${c ? colourWord(c) : attr(L('cDefault', 'No colour'))}" style="${type === 'tc' ? `color:${hex || ink}` : hex ? `background:${hex}38` : ''}">${type === 'tc' ? 'A' : hex ? '' : '⌀'}</button>`,
      )
      .join('');
  shadow.innerHTML = `<style>
    :host{all:initial}
    .box{position:fixed;pointer-events:none;box-sizing:border-box;border-radius:3px;display:none}
    .hover{border:1px dashed ${accent}}
    .sel{border:2px solid ${accent};box-shadow:0 0 0 4px ${accent}22}
    .sel.editing{border-style:dotted}
    .sp{position:fixed;display:none;pointer-events:none;box-sizing:border-box;border-style:solid}
    .sp.m{border-color:rgba(246,166,35,.2)}
    .sp.p{border-color:rgba(80,190,120,.2)}
    .h{position:absolute;pointer-events:auto;background:${panel};border:2px solid ${accent};border-radius:4px;touch-action:none;box-sizing:border-box}
    .h.r{right:-6px;top:50%;width:9px;height:26px;margin-top:-13px;cursor:ew-resize}
    .h.b{bottom:-6px;left:50%;height:9px;width:26px;margin-left:-13px;cursor:ns-resize}
    .h.rb{right:-7px;bottom:-7px;width:12px;height:12px;cursor:nwse-resize;border-radius:3px}
    .tag,.size{position:fixed;display:none;pointer-events:none;padding:1px 7px;border-radius:6px;background:${accent};color:${dark ? '#1a1306' : '#fff'};font:600 11px/18px system-ui,sans-serif;white-space:nowrap}
    .size{background:#1d1b17;color:#fff}
    .bar,.rtb{position:fixed;display:none;pointer-events:auto;align-items:center;gap:1px;padding:3px;border-radius:10px;background:${panel};border:1px solid ${line};box-shadow:0 6px 20px rgba(0,0,0,.18);font:12px system-ui,sans-serif}
    .bar button,.rtb button{all:unset;display:grid;place-items:center;width:30px;height:28px;border-radius:7px;color:${ink};cursor:pointer}
    .bar button:hover,.rtb button:hover,.rtb button.on{background:${line}}
    .bar button[hidden]{display:none}
    .bar button.drag{cursor:grab;touch-action:none}
    .sep{width:1px;height:18px;margin:0 3px;background:${line}}
    .rtb form{display:none;align-items:center;gap:4px;margin:0 2px}
    .rtb.linking form{display:flex}
    .rtb.linking .cmds{display:none}
    .cmds{display:flex;align-items:center;gap:1px}
    .rtb input{all:unset;width:190px;height:26px;padding:0 8px;border-radius:7px;background:${dark ? '#151412' : '#f5f3ee'};color:${ink};font:13px system-ui,sans-serif}
    .rtb{flex-wrap:wrap;max-width:calc(100vw - 8px);box-sizing:border-box}
    .cmds{flex-wrap:wrap}
    .rtb button.kind{width:auto;gap:3px;padding:0 6px 0 8px;font:500 12.5px system-ui,sans-serif;display:flex;align-items:center;white-space:nowrap}
    .rtb button.kind[hidden],.rtb .sep[hidden]{display:none}
    .pal{display:none;flex-direction:column;gap:4px;padding:3px 4px}
    .rtb.colouring .pal{display:flex}
    .rtb.colouring .cmds{display:none}
    .pal .row{display:flex;align-items:center;gap:3px}
    .pal .lbl{width:74px;color:${muted};font:11.5px system-ui,sans-serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .rtb .pal button{width:24px;height:24px;border:1px solid ${line};box-sizing:border-box;border-radius:6px;font:700 13px/1 system-ui,sans-serif}
    .drop{position:fixed;display:none;height:3px;border-radius:2px;background:${accent};pointer-events:none;box-shadow:0 0 0 2px ${accent}33}
    @media (pointer:coarse){.bar button,.rtb button{width:38px;height:36px}.h.r{width:14px;height:34px;margin-top:-17px;right:-9px}.h.b{height:14px;width:34px;margin-left:-17px;bottom:-9px}.h.rb{width:18px;height:18px;right:-10px;bottom:-10px}}
  </style>
  <div class="sp m"></div><div class="sp p"></div>
  <div class="box hover"></div>
  <div class="box sel"><i class="h r" data-h="r"></i><i class="h b" data-h="b"></i><i class="h rb" data-h="rb"></i></div>
  <div class="tag"></div><div class="size"></div><div class="drop"></div>
  <div class="bar" role="toolbar">
    <button class="drag" data-a="drag" title="${attr(L('gripTip', 'Drag to move it, click for its menu'))}">${svg('drag')}</button>
    <button data-a="parent" title="${L('parentTip', 'Pick the part around it (Esc)')}">${svg('parent')}</button>
    <button data-a="edit" title="${L('editTip', 'Change the words (click again)')}">${svg('edit')}</button>
    <span class="sep"></span>
    <button data-a="up" title="${L('upTip', 'Move up')}">${svg('up')}</button>
    <button data-a="down" title="${L('downTip', 'Move down')}">${svg('down')}</button>
    <button data-a="dup" title="${L('dupTip', 'Duplicate (Ctrl+D)')}">${svg('dup')}</button>
    <button data-a="del" title="${L('delTip', 'Delete (Delete)')}">${svg('del')}</button>
  </div>
  <div class="rtb" role="toolbar">
    <span class="cmds">
      <button class="kind" data-c="turn" title="${attr(L('turnTip', 'Turn into (Ctrl+/)'))}"><span class="kn"></span>${svg('chev')}</button>
      <span class="sep ks"></span>
      <button data-c="bold" title="${L('boldTip', 'Bold (Ctrl+B)')}">${svg('bold')}</button>
      <button data-c="italic" title="${L('italicTip', 'Italic (Ctrl+I)')}">${svg('italic')}</button>
      <button data-c="underline" title="${L('underlineTip', 'Underline (Ctrl+U)')}">${svg('underline')}</button>
      <button data-c="strikeThrough" title="${L('strikeTip', 'Strike through')}">${svg('strike')}</button>
      <button data-c="code" title="${attr(L('codeTip', 'Code (Ctrl+E)'))}">${svg('code')}</button>
      <button data-c="colour" title="${attr(L('colourTip', 'Colour and highlight'))}">${svg('colour')}</button>
      <span class="sep"></span>
      <button data-c="link" title="${L('linkTip', 'Make it a link')}">${svg('link')}</button>
      <button data-c="unlink" title="${L('unlinkTip', 'Not a link')}">${svg('unlink')}</button>
      <button data-c="removeFormat" title="${L('clearTip', 'Plain words')}">${svg('clear')}</button>
      <span class="sep"></span>
      <button data-c="done" title="${L('doneTip', 'Done (Esc)')}">${svg('done')}</button>
    </span>
    <span class="pal"><span class="row"><span class="lbl">${attr(L('textColour', 'Text colour'))}</span>${swatches('tc')}</span><span class="row"><span class="lbl">${attr(L('highlight', 'Highlight'))}</span>${swatches('hl')}</span></span>
    <form><input name="url" placeholder="https://…" autocomplete="off" spellcheck="false"><button type="submit" title="${L('addLinkTip', 'Add the link')}">${svg('done')}</button></form>
  </div>`;
  const $ = (s: string) => shadow.querySelector(s) as HTMLElement;
  const hoverBox = $('.hover');
  const selBox = $('.sel');
  const tag = $('.tag');
  const sizeTag = $('.size');
  const bar = $('.bar');
  const rtb = $('.rtb');
  const drop = $('.drop');
  const mBox = $('.sp.m');
  const pBox = $('.sp.p');

  let sel: Element | null = null;
  let hover: Element | null = null;
  let editing: HTMLElement | null = null;
  /** Whether the app has an agent to ask about a part (the block menu's Ask the agent). */
  let canAskAgent = false;
  /** What the inspector's changes apply to: this part, every part of its kind or class; on hover; at a size and smaller. */
  let ctx: { scope: string; state: '' | 'hover'; media: Media } = { scope: 'self', state: '', media: '' };

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
  const sides = (cs: CSSStyleDeclaration, k: string) => ['top', 'right', 'bottom', 'left'].map((s) => parseFloat(cs.getPropertyValue(k.replace('*', s))) || 0);
  /** Its margins (orange) and padding (green), as a browser's inspector shows them. */
  const drawSpacing = (r: DOMRect | null) => {
    if (!r || !sel || sel === document.body || editing) {
      mBox.style.display = 'none';
      pBox.style.display = 'none';
      return;
    }
    const cs = getComputedStyle(sel);
    const m = sides(cs, 'margin-*').map((v) => Math.max(0, v));
    const p = sides(cs, 'padding-*');
    const b = sides(cs, 'border-*-width');
    if (m.some(Boolean)) {
      Object.assign(mBox.style, {
        display: 'block',
        left: `${r.left - m[3]}px`,
        top: `${r.top - m[0]}px`,
        width: `${r.width + m[1] + m[3]}px`,
        height: `${r.height + m[0] + m[2]}px`,
        borderWidth: m.map((v) => `${v}px`).join(' '),
      });
    } else mBox.style.display = 'none';
    if (p.some(Boolean)) {
      Object.assign(pBox.style, {
        display: 'block',
        left: `${r.left + b[3]}px`,
        top: `${r.top + b[0]}px`,
        width: `${Math.max(0, r.width - b[1] - b[3])}px`,
        height: `${Math.max(0, r.height - b[0] - b[2])}px`,
        borderWidth: p.map((v) => `${v}px`).join(' '),
      });
    } else pBox.style.display = 'none';
  };
  const placeAbove = (el: HTMLElement, r: DOMRect, right: boolean) => {
    const vw = innerWidth;
    const vh = innerHeight;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let top = r.top - h - 8;
    if (top < 4) top = r.bottom + 8;
    if (top + h > vh - 4) top = Math.max(4, r.top + 8);
    const left = right ? r.right - w : r.left;
    el.style.left = `${Math.max(4, Math.min(left, vw - w - 4))}px`;
    el.style.top = `${top}px`;
    return top;
  };
  /** The kinds of block words can be turned into, by their names on the bar over them. */
  const KIND_NAME: Record<string, [string, string]> = {
    p: ['text', 'Text'],
    h1: ['h1', 'Heading 1'],
    h2: ['h2', 'Heading 2'],
    h3: ['h3', 'Heading 3'],
    h4: ['h4', 'Heading 4'],
    h5: ['h5', 'Heading 5'],
    h6: ['h6', 'Heading 6'],
    bullet: ['sBullet', 'Bulleted list'],
    number: ['sNumber', 'Numbered list'],
    todo: ['sTodo', 'To-do list'],
    quote: ['quote', 'Quote'],
    code: ['sCode', 'Code'],
    toggle: ['sToggle', 'Toggle list'],
    callout: ['sCallout', 'Callout'],
  };
  const draw = () => {
    drawSel();
    W.draw();
  };
  const drawSel = () => {
    place(hoverBox, hover && hover !== sel && hover.isConnected ? hover.getBoundingClientRect() : null);
    if (!sel || !sel.isConnected) {
      place(selBox, null);
      drawSpacing(null);
      tag.style.display = 'none';
      bar.style.display = 'none';
      rtb.style.display = 'none';
      return;
    }
    const r = sel.getBoundingClientRect();
    place(selBox, r);
    drawSpacing(r);
    const isBody = sel === document.body;
    selBox.classList.toggle('editing', !!editing);
    // Resize handles: not for the page, words being changed, or parts that flow inside a line.
    const inline = getComputedStyle(sel).display === 'inline';
    for (const h of selBox.querySelectorAll<HTMLElement>('.h')) h.style.display = isBody || editing || (inline && sel.tagName !== 'IMG') ? 'none' : 'block';
    tag.textContent = nameOf(sel);
    tag.style.display = 'block';
    const vw = innerWidth;
    const vh = innerHeight;
    const tagTop = r.top - 22 >= 2 ? r.top - 22 : Math.min(r.bottom + 4, vh - 22);
    tag.style.left = `${Math.max(2, Math.min(r.left - 2, vw - tag.offsetWidth - 2))}px`;
    tag.style.top = `${tagTop}px`;
    if (editing) {
      bar.style.display = 'none';
      // While writing, nothing sits over the line above: the bar shows once words are selected (always on a phone,
      // which has no keys for bold and the rest).
      tag.style.display = 'none';
      const s = getSelection();
      const words = !!s && !s.isCollapsed && !!s.anchorNode && editing.contains(s.anchorNode);
      if (!coarse && !words && !rtb.classList.contains('linking') && !rtb.classList.contains('colouring')) {
        rtb.style.display = 'none';
        return;
      }
      const kind = KIND_NAME[String(W.info(editing).kind ?? '')];
      const kb = rtb.querySelector('.kind') as HTMLElement;
      kb.hidden = !kind;
      (rtb.querySelector('.ks') as HTMLElement).hidden = !kind;
      if (kind) (kb.querySelector('.kn') as HTMLElement).textContent = L(kind[0], kind[1]);
      rtb.style.display = 'flex';
      placeAbove(rtb, r, false);
      return;
    }
    rtb.style.display = 'none';
    rtb.classList.remove('linking', 'colouring');
    bar.style.display = 'flex';
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
    const top = placeAbove(bar, r, true);
    // The name moves aside when the bar sits on it.
    if (Math.abs(top - tagTop) < bar.offsetHeight && r.right - bar.offsetWidth < r.left + tag.offsetWidth + 8) tag.style.display = 'none';
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
  /** A CSS selector that finds it, for the agent to be told which part is meant. */
  const cssPath = (el: Element): string => {
    const parts: string[] = [];
    for (let x: Element | null = el; x && x !== document.body && x !== root; x = x.parentElement) {
      if (x.id && /^[A-Za-z][\w-]*$/.test(x.id)) {
        parts.unshift(`#${x.id}`);
        break;
      }
      const t = x.tagName.toLowerCase();
      const same = x.parentElement ? [...x.parentElement.children].filter((c) => c.tagName === x!.tagName) : [];
      parts.unshift(same.length > 1 ? `${t}:nth-of-type(${same.indexOf(x) + 1})` : t);
    }
    return parts.join(' > ') || 'body';
  };

  // ---- the editor's own stylesheet: hovers, sizes, every part of a kind ---------------------------------
  type Media = '' | 'tablet' | 'phone';
  const MQ: Record<Media, string> = { '': '', tablet: '(max-width: 900px)', phone: '(max-width: 600px)' };
  const MEDIAS: Media[] = ['', 'tablet', 'phone'];
  const model: Record<Media, Map<string, Map<string, string>>> = { '': new Map(), tablet: new Map(), phone: new Map() };
  const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
  const okSelector = (s: string) => typeof s === 'string' && s.length < 300 && !!s.trim() && !/[{}<;@]/.test(s);
  const okProp = (p: string) => /^(--[\w-]+|-?[a-z][a-z-]*)$/.test(p);
  const okValue = (v: string) => !/[{}<;]/.test(v) && v.length < 2000;
  const cssText = () => {
    const block = (m: Map<string, Map<string, string>>, pad: string) =>
      [...m]
        .filter(([, d]) => d.size)
        .map(([s, d]) => `${pad}${s} { ${[...d].map(([p, v]) => `${p}: ${v};`).join(' ')} }`)
        .join('\n');
    const out: string[] = [];
    const base = block(model[''], '');
    if (base) out.push(base);
    for (const k of ['tablet', 'phone'] as Media[]) {
      const b = block(model[k], '  ');
      if (b) out.push(`@media ${MQ[k]} {\n${b}\n}`);
    }
    return out.length ? `\n/* Changed in the page editor */\n${out.join('\n')}\n` : '';
  };
  // While its hover look is being changed, the part picked shows it without the pointer over it: the
  // stylesheet's hover rules again for [data-n-hovering], in a stylesheet of the editor's own (not saved).
  const forced = document.createElement('style');
  forced.setAttribute('data-n-own', '');
  const writeForced = () => {
    const hover = (m: Map<string, Map<string, string>>) =>
      [...m]
        .filter(([s]) => s.includes(':hover'))
        .map(([s, d]) => `${s.replace(/:hover/g, '[data-n-hovering]')} { ${[...d].map(([p, v]) => `${p}: ${v};`).join(' ')} }`)
        .join('\n');
    forced.textContent = [hover(model['']), ...(['tablet', 'phone'] as Media[]).map((k) => (model[k].size ? `@media ${MQ[k]} {\n${hover(model[k])}\n}` : ''))].join('\n');
  };
  const showHover = () => {
    for (const x of document.querySelectorAll('[data-n-hovering]')) if (x !== sel || !ctx.state) x.removeAttribute('data-n-hovering');
    if (sel && ctx.state === 'hover' && sel !== document.body) sel.setAttribute('data-n-hovering', '');
  };
  const writeCss = () => {
    writeForced();
    const t = cssText();
    let el = document.getElementById('n-styles');
    if (!t) return el?.remove();
    if (!el) {
      el = document.createElement('style');
      el.id = 'n-styles';
      document.head.appendChild(el);
    }
    el.textContent = t;
    // The forced hovers come after it, so they win as the pointer would.
    document.head.appendChild(forced);
  };
  const readCss = () => {
    for (const k of MEDIAS) model[k].clear();
    const el = document.getElementById('n-styles') as HTMLStyleElement | null;
    const put = (k: Media, r: CSSStyleRule) => {
      const d = new Map<string, string>();
      for (let i = 0; i < r.style.length; i++) {
        const p = r.style[i];
        const v = r.style.getPropertyValue(p).trim();
        d.set(p, r.style.getPropertyPriority(p) ? `${v} !important` : v);
      }
      if (d.size) model[k].set(r.selectorText, d);
    };
    for (const r of el?.sheet?.cssRules ?? []) {
      if (r instanceof CSSStyleRule) put('', r);
      else if (r instanceof CSSMediaRule) {
        const k = MEDIAS.find((x) => x && norm(r.conditionText) === norm(MQ[x]));
        if (k) for (const inner of r.cssRules) if (inner instanceof CSSStyleRule) put(k, inner);
      }
    }
  };
  // A selector as the browser writes it back (so a rule read from the page is found again), or null when it is not one.
  let scratchSheet: CSSStyleSheet | null = null;
  try {
    scratchSheet = new CSSStyleSheet();
  } catch {}
  const canon = (sel: string): string | null => {
    if (!okSelector(sel)) return null;
    if (!scratchSheet) return sel.trim();
    try {
      scratchSheet.replaceSync(`${sel}{}`);
      const r = scratchSheet.cssRules[0];
      return r instanceof CSSStyleRule ? r.selectorText : null;
    } catch {
      return null;
    }
  };
  // Every part of a kind (all Heading 2s, every .card) wins over the page's own rules for them, as you would
  // expect of "all": an id's weight (no part has the id "_"), still below a part's own style attribute.
  const BOOST = ':root:not(#_) ';
  const boosted = (sel: string) => canon(BOOST + sel);
  // Shorthands (padding, border) as the properties they stand for, as a rule read back from the page has them.
  const scratch = document.createElement('i').style;
  const longhands = (props: Record<string, string | null>): Record<string, string | null> => {
    const out: Record<string, string | null> = {};
    for (const [p, v0] of Object.entries(props)) {
      if (!okProp(p)) continue;
      const v =
        v0 === null
          ? ''
          : String(v0)
              .replace(/!important/gi, '')
              .trim();
      if (p.startsWith('--') || /var\(/.test(v)) {
        out[p] = v || null;
        continue;
      }
      scratch.cssText = '';
      scratch.setProperty(p, v || 'initial');
      if (!scratch.length) continue;
      for (let i = 0; i < scratch.length; i++) out[scratch[i]] = v ? scratch.getPropertyValue(scratch[i]) : null;
    }
    return out;
  };
  const setRule = (k: Media, selector: string, props: Record<string, string | null>, important: boolean) => {
    let d = model[k].get(selector);
    if (!d) model[k].set(selector, (d = new Map()));
    for (const [p, v] of Object.entries(longhands(props))) {
      if (!v) d.delete(p);
      else if (okValue(v)) d.set(p, important ? `${v} !important` : v);
    }
    if (!d.size) model[k].delete(selector);
    writeCss();
  };
  const ruleOf = (k: Media, selector: string | null): Record<string, string> =>
    selector ? Object.fromEntries([...(model[k].get(selector) ?? [])].map(([p, v]) => [p, v.replace(/\s*!important$/, '')])) : {};

  /** Where a change in the inspector goes for this part: its style attribute (null), or a rule in the editor's stylesheet. */
  const targetOf = (el: Element, make: boolean): { selector: string | null; important: boolean } | null => {
    const st = ctx.state === 'hover' ? ':hover' : '';
    if (ctx.scope === 'tag') {
      const s = boosted(el.tagName.toLowerCase() + st);
      return s ? { selector: s, important: false } : null;
    }
    if (ctx.scope.startsWith('.')) {
      const s = el.classList.contains(ctx.scope.slice(1)) ? boosted(ctx.scope + st) : null;
      return s ? { selector: s, important: false } : null;
    }
    if (!st && !ctx.media) return { selector: null, important: false };
    let own = ownClassOf(el);
    if (!own && make) {
      own = `n-s${Math.random().toString(36).slice(2, 7).padEnd(5, '0')}`;
      el.classList.add(own);
    }
    // A hover or a size of its own wins over its style attribute.
    return own ? { selector: canon(`.${own}${st}`), important: true } : null;
  };
  /** Sets the look of a part where the inspector says, without a step to undo (the caller remembers one). */
  const styleOf = (el: Element, props: Record<string, string | null>) => {
    const t = targetOf(el, true);
    if (!t) return;
    if (t.selector) return setRule(ctx.media, t.selector, props, t.important);
    const st = (el as HTMLElement).style;
    for (const [p, v] of Object.entries(props)) {
      if (!okProp(p)) continue;
      if (v === null || v === '') st.removeProperty(p);
      else if (okValue(String(v)))
        st.setProperty(
          p,
          String(v)
            .replace(/!important/gi, '')
            .trim(),
        );
    }
    if (!el.getAttribute('style')?.trim()) el.removeAttribute('style');
  };
  /** What is set for this part where the inspector looks now (not what it inherits). */
  const declaredOf = (el: Element): Record<string, string> => {
    const t = targetOf(el, false);
    if (!t) return {};
    if (t.selector) return ruleOf(ctx.media, t.selector);
    const st = (el as HTMLElement).style;
    const out: Record<string, string> = {};
    if (st) for (let i = 0; i < st.length; i++) out[st[i]] = st.getPropertyValue(st[i]);
    return out;
  };

  // ---- the page's own look: colours, fonts, title -------------------------------------------------------
  const VAR_HOST = /(^|,)\s*(:root|html|body|\.n-page|body\.n-page)\s*(,|$)/;
  const varsOf = () => {
    const names = new Set<string>();
    const walk = (rules: CSSRuleList) => {
      for (const r of rules) {
        if (r instanceof CSSStyleRule) {
          if (VAR_HOST.test(r.selectorText)) for (let i = 0; i < r.style.length; i++) if (r.style[i].startsWith('--')) names.add(r.style[i]);
        } else if ('cssRules' in r) walk((r as CSSGroupingRule).cssRules);
      }
    };
    for (const sh of document.styleSheets) {
      // The kit's own colours count only for pages that use its look.
      if (/^n-(kit|theme)$/.test((sh.ownerNode as Element | null)?.id ?? '') && !document.body.classList.contains('n-page')) continue;
      try {
        walk(sh.cssRules);
      } catch {}
    }
    for (const el of [root, document.body]) for (let i = 0; i < el.style.length; i++) if (el.style[i].startsWith('--')) names.add(el.style[i]);
    const cs = getComputedStyle(document.body);
    return [...names].slice(0, 80).map((name) => ({ name, value: cs.getPropertyValue(name).trim() }));
  };
  const fontsLink = () => document.getElementById('n-fonts') as HTMLLinkElement | null;
  const fontsOf = (): string[] => {
    const l = fontsLink();
    if (!l) return [];
    try {
      return new URL(l.href).searchParams.getAll('family').map((f) => f.split(':')[0].replace(/\+/g, ' '));
    } catch {
      return [];
    }
  };
  const setFonts = (families: unknown) => {
    const fam = (Array.isArray(families) ? families : []).filter((f): f is string => typeof f === 'string' && /^[A-Za-z0-9 ]{2,40}$/.test(f)).slice(0, 6);
    let l = fontsLink();
    if (!fam.length) return l?.remove();
    if (!l) {
      l = document.createElement('link');
      l.id = 'n-fonts';
      l.rel = 'stylesheet';
      document.head.appendChild(l);
    }
    l.href = `https://fonts.googleapis.com/css2?${fam.map((f) => `family=${f.replace(/ /g, '+')}:wght@400;700`).join('&')}&display=swap`;
  };
  const customEl = () => document.getElementById('n-css');
  const setCustom = (text: unknown) => {
    const t = String(text ?? '').replace(/<\/style/gi, '');
    let el = customEl();
    if (!t.trim()) return el?.remove();
    if (!el) {
      el = document.createElement('style');
      el.id = 'n-css';
      document.head.appendChild(el);
    }
    el.textContent = t;
    // After it, so the editor's own rules still win where both set something.
    const own = document.getElementById('n-styles');
    if (own) document.head.appendChild(own);
  };
  const setTitle = (t: unknown) => {
    let el = document.querySelector('title');
    if (!el) {
      el = document.createElement('title');
      document.head.prepend(el);
    }
    el.textContent = String(t ?? '').slice(0, 200);
  };
  // The kinds of part the page's text styles are for (the inspector's Page tab names them).
  const KINDS = ['body', 'h1', 'h2', 'h3', 'a:not(.n-btn)', ':is(button, .n-btn)'];
  const KIND_PROPS = [
    'color',
    'background-color',
    'font-family',
    'font-size',
    'font-weight',
    'line-height',
    'letter-spacing',
    'text-transform',
    'max-width',
    'padding-top',
    'padding-left',
    'border-top-left-radius',
  ];
  const clearColour = (c: string) => !c || c === 'transparent' || /^rgba\([^)]*,\s*0\)$/.test(c);
  /** The colour behind the page, which the frame shows where the page paints nothing (white for a page of no colour). */
  const canvasBg = () => {
    for (const el of [root, document.body]) {
      const cs = getComputedStyle(el);
      if (!clearColour(cs.backgroundColor)) return cs.backgroundColor;
      if (cs.backgroundImage !== 'none') return '';
    }
    return '#fff';
  };
  const pageInfo = () => {
    const kinds: Record<string, { declared: Record<string, string>; computed: Record<string, string> }> = {};
    for (const k of KINDS) {
      const el = k === 'body' ? document.body : document.body.querySelector(k);
      const cs = el ? getComputedStyle(el) : null;
      kinds[k] = { declared: ruleOf(ctx.media, boosted(k)), computed: cs ? Object.fromEntries(KIND_PROPS.map((p) => [p, cs.getPropertyValue(p)])) : {} };
    }
    return { vars: varsOf(), fonts: fontsOf(), title: document.title, lang: root.getAttribute('lang') ?? '', css: customEl()?.textContent ?? '', kinds, media: ctx.media, bg: canvasBg(), ...W.page() };
  };
  const tellPage = () => send({ type: 'wa-ed-page', page: pageInfo() });

  // ---- the parts as a tree (the inspector's Layers) ------------------------------------------------------
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'LINK', 'META', 'NOSCRIPT', 'N-EDITOR-UI']);
  let layersOn = false;
  const layers = () => {
    let count = 0;
    type Node = { p: number[]; n: string; t: string; x: string; c: Node[] };
    const walk = (el: Element, path: number[]): Node => {
      const kids: Node[] = [];
      [...el.children].forEach((c, i) => {
        if (count > 2500 || SKIP.has(c.tagName) || isUi(c)) return;
        count++;
        kids.push(walk(c, [...path, i]));
      });
      return { p: path, n: nameOf(el), t: el.tagName.toLowerCase(), x: kids.length && !wordy(el) ? '' : snippet(el), c: kids };
    };
    return walk(document.body, pathOf(document.body));
  };
  let layersTimer = 0;
  const tellLayers = () => {
    if (!layersOn) return;
    clearTimeout(layersTimer);
    layersTimer = window.setTimeout(() => send({ type: 'wa-ed-layers', tree: layers() }), 120);
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
    return [...count]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([c]) => c);
  };

  const STYLE_PROPS = [
    'color',
    'background-color',
    'background-image',
    'background-size',
    'background-position',
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'text-align',
    'line-height',
    'letter-spacing',
    'text-decoration-line',
    'text-transform',
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
    'margin-top',
    'margin-right',
    'margin-bottom',
    'margin-left',
    'border-top-left-radius',
    'border-top-width',
    'border-top-style',
    'border-top-color',
    'width',
    'min-width',
    'max-width',
    'height',
    'min-height',
    'display',
    'flex-direction',
    'flex-wrap',
    'gap',
    'justify-content',
    'align-items',
    'grid-template-columns',
    'opacity',
    'box-shadow',
    'object-fit',
    'position',
    'top',
    'right',
    'bottom',
    'left',
    'z-index',
    'overflow',
  ];
  const info = (el: Element) => {
    const cs = getComputedStyle(el);
    const computed: Record<string, string> = {};
    for (const p of STYLE_PROPS) computed[p] = cs.getPropertyValue(p);
    const inline: Record<string, string> = {};
    const st = (el as HTMLElement).style;
    if (st) for (let i = 0; i < st.length; i++) inline[st[i]] = st.getPropertyValue(st[i]);
    const attrs: Record<string, string> = {};
    for (const a of ['id', 'href', 'target', 'src', 'alt', 'title', 'placeholder', 'value', 'type', 'name', 'data-choice', 'data-group', 'aria-label']) {
      const v = el.getAttribute(a);
      if (v !== null) attrs[a] = a === 'src' && v.length > 300 ? `${v.slice(0, 300)}…` : v;
    }
    const crumbs: { name: string; tag: string; path: number[] }[] = [];
    for (let x: Element | null = el; x && x !== root; x = x.parentElement) crumbs.unshift({ name: nameOf(x), tag: x.tagName.toLowerCase(), path: pathOf(x) });
    const words = wordy(el) && el.children.length === 0 ? (el as HTMLElement).innerText : undefined;
    const classes = [...el.classList].filter((c) => !OWN.test(c));
    const count = (s: string) => {
      try {
        return document.body.querySelectorAll(s).length;
      } catch {
        return 0;
      }
    };
    return {
      path: pathOf(el),
      tag: el.tagName.toLowerCase(),
      name: nameOf(el),
      crumbs,
      words: words !== undefined && words.length <= 4000 ? words : undefined,
      wordy: wordy(el),
      children: el.children.length,
      holds: HOLDS.has(el.tagName),
      attrs,
      classes,
      counts: { tag: count(el.tagName.toLowerCase()), ...Object.fromEntries(classes.map((c) => [`.${c}`, count(`.${CSS.escape(c)}`)])) },
      computed,
      inline,
      declared: declaredOf(el),
      selector: cssPath(el),
      snippet: snippet(el),
      can: { up: el !== document.body && !!el.previousElementSibling, down: el !== document.body && !!nextPart(el), parent: el !== document.body, remove: el !== document.body },
      ...W.info(el),
    };
  };
  const tell = () => send({ type: 'wa-ed-sel', sel: sel && sel.isConnected ? info(sel) : null });

  // ---- where the caret is, as a number: characters of a part's own words, a line break counting as one ---------
  const subListsOf = (h: Element) => (h.tagName === 'LI' ? [...h.children].filter((c) => c.tagName === 'UL' || c.tagName === 'OL') : []);
  const ownRangeOf = (h: Element) => {
    const x = document.createRange();
    x.selectNodeContents(h);
    const s = subListsOf(h)[0];
    if (s) x.setEndBefore(s);
    return x;
  };
  const charsIn = (x: Range) => x.toString().length + x.cloneContents().querySelectorAll('br').length;
  const offsetIn = (h: Element): number | null => {
    const s = getSelection();
    if (!s || !s.rangeCount) return null;
    const r = s.getRangeAt(0);
    if (!(h === r.startContainer || h.contains(r.startContainer))) return null;
    const x = document.createRange();
    x.setStart(h, 0);
    x.setEnd(r.startContainer, r.startOffset);
    return charsIn(x);
  };
  /** How many characters the words have (a line break a browser keeps at their end, showing nothing, not counted). */
  const lengthOf = (h: Element) => {
    const x = ownRangeOf(h);
    let n = charsIn(x);
    let last: Node | null = x.endContainer === h ? (h.childNodes[x.endOffset - 1] ?? null) : h.lastChild;
    while (last && last.nodeType === 3 && !(last as Text).data.trim()) last = last.previousSibling;
    if (last?.nodeName === 'BR') n--;
    return Math.max(0, n);
  };
  /** The place `n` characters into a part's own words. */
  const pointAt = (h: Element, n: number): [Node, number] => {
    const subs = subListsOf(h);
    const w = document.createTreeWalker(h, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, { acceptNode: (x) => (subs.includes(x as Element) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    let last: [Node, number] = [h, 0];
    for (let x = w.nextNode(); x; x = w.nextNode()) {
      if (x.nodeType === 3) {
        const len = (x as Text).data.length;
        if (n <= len) return [x, n];
        n -= len;
        last = [x, len];
      } else if ((x as Element).tagName === 'BR') {
        const p = x.parentNode!;
        const i = [...p.childNodes].indexOf(x as ChildNode);
        if (n === 0) return [p, i];
        n -= 1;
        last = [p, i + 1];
      }
    }
    return last;
  };

  // ---- history ------------------------------------------------------------------------------------------
  const undo: string[] = [];
  const redo: string[] = [];
  let dirty = false;
  /** The page's body as it is kept: without the editor's marks on the words being written. */
  const cleanBody = (): string => {
    const b = document.body;
    if (!editing && !b.querySelector('[data-n-ph],[data-n-ceoff],[data-n-hovering],[data-n-ce]')) return b.outerHTML;
    const c = b.cloneNode(true) as HTMLElement;
    for (const x of c.querySelectorAll('[data-n-ce]')) {
      x.removeAttribute('data-n-ce');
      x.removeAttribute('contenteditable');
    }
    for (const x of c.querySelectorAll('[data-n-hovering]')) x.removeAttribute('data-n-hovering');
    W.clean(c);
    return c.outerHTML;
  };
  /** Where words were being written, kept with each step to undo, so the caret goes back there. */
  const writingAt = () => (editing ? { p: pathOf(editing), o: offsetIn(editing) ?? 0 } : null);
  // The body and what the editor keeps in the head: its stylesheet, the user's CSS, the fonts, the title and language.
  const snap = () => JSON.stringify({ b: cleanBody(), s: cssText(), c: customEl()?.textContent ?? '', f: fontsOf(), t: document.title, l: root.getAttribute('lang') ?? '', w: writingAt() });
  const state = () => send({ type: 'wa-ed-state', dirty, canUndo: undo.length > 0 || typing.length > 0, canRedo: redo.length > 0 || typingRedo.length > 0 });
  /** Before a change: what to go back to. */
  const remember = () => {
    undo.push(snap());
    if (undo.length > 150) undo.shift();
    redo.length = 0;
  };
  let paletteTimer = 0;
  const changed = (page = false) => {
    W.changed();
    dirty = true;
    state();
    tell();
    redraw();
    tellLayers();
    if (page) tellPage();
    clearTimeout(paletteTimer);
    paletteTimer = window.setTimeout(() => send({ type: 'wa-ed-palette', colors: palette() }), 600);
  };
  const restore = (saved: string, write = false) => {
    const o = JSON.parse(saved) as { b: string; s: string; c: string; f: string[]; t: string; l: string; w?: { p: number[]; o: number } | null };
    const path = sel ? pathOf(sel) : null;
    const d = new DOMParser().parseFromString(`<!doctype html><html><head></head>${o.b}</html>`, 'text/html');
    root.replaceChild(document.importNode(d.body, true), document.body);
    let st = document.getElementById('n-styles');
    if (o.s) {
      if (!st) {
        st = document.createElement('style');
        st.id = 'n-styles';
        document.head.appendChild(st);
      }
      st.textContent = o.s;
    } else st?.remove();
    readCss();
    writeForced();
    setCustom(o.c);
    setFonts(o.f);
    setTitle(o.t);
    if (o.l) root.setAttribute('lang', o.l);
    else root.removeAttribute('lang');
    W.restored();
    sel = (path && byPath(path)) || null;
    hover = null;
    const h = o.w ? byPath(o.w.p) : null;
    changed(true);
    // The caret goes back where the words were written then (or that block is picked).
    if (h && write) startEditing(h, { off: o.w!.o });
    else if (h) {
      sel = W.unitOf(h);
      tell();
    }
  };
  const step = (back: boolean) => {
    const from = back ? undo : redo;
    const to = back ? redo : undo;
    if (!from.length) return;
    const wasWriting = !!editing;
    const cur = snap();
    finishEditing(true);
    to.push(cur);
    restore(from.pop()!, wasWriting);
  };

  // ---- the words being written: a step to undo for each change of a block, and the last few words typed -----
  /** Whether what was written since writing began has a step to undo yet. */
  let editPushed = false;
  const typing: { h: string; o: number }[] = [];
  const typingRedo: { h: string; o: number }[] = [];
  let lastTyped = 0;
  let lastKind = '';
  /** Before the words being written change: the first change makes a step to undo; each few words typed, a step of their own. */
  const noteTyping = (kind = 'edit', data = '') => {
    if (!editing) return;
    if (!editPushed) {
      remember();
      editPushed = true;
    }
    const now = Date.now();
    const top = typing[typing.length - 1];
    if (!top || (top.h !== editing.innerHTML && (kind !== lastKind || now - lastTyped > 900 || kind === 'edit' || (kind === 'insert' && /^\s$/.test(data))))) {
      typing.push({ h: editing.innerHTML, o: offsetIn(editing) ?? 0 });
      if (typing.length > 300) typing.shift();
    }
    typingRedo.length = 0;
    lastTyped = now;
    lastKind = kind;
    if (typing.length === 1) state();
  };
  const putWords = (t: { h: string; o: number }) => {
    if (!editing) return;
    editing.innerHTML = t.h;
    W.started(editing);
    placeCaret(editing, { off: t.o });
    redraw();
  };
  const undoTyping = () => {
    if (!editing || !typing.length) return step(true);
    typingRedo.push({ h: editing.innerHTML, o: offsetIn(editing) ?? 0 });
    putWords(typing.pop()!);
    // Back to where writing began: no step is left to keep.
    if (!typing.length && editPushed) {
      undo.pop();
      editPushed = false;
    }
    state();
  };
  const redoTyping = () => {
    if (!editing || !typingRedo.length) return step(false);
    if (!editPushed) {
      remember();
      editPushed = true;
    }
    typing.push({ h: editing.innerHTML, o: offsetIn(editing) ?? 0 });
    putWords(typingRedo.pop()!);
    state();
  };

  // ---- picking and changing words -------------------------------------------------------------------------
  const select = (el: Element | null) => {
    if (el && (isUi(el) || el === root || el === document.head || document.head.contains(el))) el = document.body;
    if (editing && el !== editing) finishEditing();
    sel = el;
    W.selected(el);
    showHover();
    tell();
    redraw();
  };
  /** The caret where `at` says: where a click was, near an x on the top or bottom line, so many characters in, its words selected, or at their end. */
  const placeCaret = (el: HTMLElement, at?: At) => {
    const s = getSelection();
    if (!s) return;
    let r: Range | null = null;
    const d = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
    const fromPoint = (x: number, y: number): Range | null => {
      host.style.setProperty('display', 'none', 'important');
      let q: Range | null = null;
      if (d.caretRangeFromPoint) q = d.caretRangeFromPoint(x, y);
      else if (d.caretPositionFromPoint) {
        const p = d.caretPositionFromPoint(x, y);
        if (p) {
          q = document.createRange();
          q.setStart(p.offsetNode, p.offset);
        }
      }
      host.style.setProperty('display', 'block', 'important');
      return q && (el === q.startContainer || el.contains(q.startContainer)) && !subListsOf(el).some((x) => x.contains(q!.startContainer)) ? q : null;
    };
    if (at?.point) r = fromPoint(at.point.x, at.point.y);
    else if (at?.edge && at.x !== undefined) {
      el.scrollIntoView({ block: 'nearest' });
      const rs = [...ownRangeOf(el).getClientRects()].filter((q) => q.height > 0);
      if (rs.length) {
        const ln = at.edge === 'top' ? rs.reduce((a, b) => (b.top < a.top ? b : a)) : rs.reduce((a, b) => (b.bottom > a.bottom ? b : a));
        const box = el.getBoundingClientRect();
        r = fromPoint(Math.max(box.left + 1, Math.min(at.x, box.right - 1)), ln.top + ln.height / 2);
      }
      if (!r) at = at.edge === 'top' ? { off: 0 } : { end: true };
    }
    if (!r && at?.all) r = ownRangeOf(el);
    if (!r) {
      const [n, o] = pointAt(el, at?.off !== undefined ? at.off : lengthOf(el));
      r = document.createRange();
      r.setStart(n, o);
      r.collapse(true);
    }
    s.removeAllRanges();
    s.addRange(r);
  };
  let editBefore = '';
  let saidEditing = false;
  /** Tells the app whether words are being written (a phone's keyboard is up): only when that changes. */
  const sayEditing = (on: boolean) => {
    if (on === saidEditing) return;
    saidEditing = on;
    send({ type: 'wa-ed-editing', on });
  };
  const startEditing = (el: Element | null, at?: At | { x: number; y: number }) => {
    if (!el || !wordy(el)) return;
    if (editing === el) return;
    finishEditing();
    sel = el;
    editing = el as HTMLElement;
    editPushed = false;
    typing.length = 0;
    typingRedo.length = 0;
    editing.setAttribute('contenteditable', 'true');
    editing.setAttribute('data-n-ce', '');
    W.started(editing);
    W.selected(el);
    editBefore = editing.innerHTML;
    editing.focus({ preventScroll: true });
    const where = at && 'y' in at && typeof at.y === 'number' && !('edge' in at) ? { point: at as { x: number; y: number } } : (at as At | undefined);
    placeCaret(editing, where);
    sayEditing(true);
    tell();
    redraw();
  };
  /** Writing ends: `quiet` when a change that keeps its own step to undo goes on from here. */
  function finishEditing(quiet = false) {
    const el = editing;
    if (!el) return;
    editing = null;
    const same = el.innerHTML === editBefore;
    W.finished(el);
    el.removeAttribute('contenteditable');
    el.removeAttribute('data-n-ce');
    typing.length = 0;
    typingRedo.length = 0;
    const was = editPushed;
    editPushed = false;
    // Typed and taken back again: no step to keep.
    if (was && same && !quiet) undo.pop();
    else if (was && !quiet) changed();
    else state();
    getSelection()?.removeAllRanges();
    queueMicrotask(() => sayEditing(!!editing));
    redraw();
  }
  /** Writes in another part (or elsewhere in this one). */
  const write = (h: Element, at?: At) => {
    if (editing === h && document.activeElement === h) return placeCaret(h as HTMLElement, at);
    if (editing === h) finishEditing();
    startEditing(h, at);
  };
  /** A change as one step to undo (the words typed before it are a step of their own), then where to write or what to pick. */
  const change = (f: () => Next) => {
    const before = snap();
    let r: Next;
    try {
      r = f();
    } catch (err) {
      // A page shaped in a way the change did not foresee: it goes back as it was, never half changed.
      console.warn(err);
      restore(before, !!editing);
      return;
    }
    if (!r) return;
    undo.push(before);
    if (undo.length > 150) undo.shift();
    redo.length = 0;
    lastStyle = null;
    if (typeof r === 'object' && 'write' in r) {
      finishEditing(true);
      startEditing(r.write, r.at);
    } else if (typeof r === 'object' && 'pick' in r) {
      finishEditing(true);
      select(r.pick);
    } else if (editing && !editing.isConnected) finishEditing(true);
    else if (editing) {
      editPushed = false;
      typing.length = 0;
      typingRedo.length = 0;
      editBefore = editing.innerHTML;
    }
    changed();
  };

  // The bar over words being changed: Turn into, bold, italic, underline, strike, code, colour and highlight, link,
  // plain words, done.
  let saved: Range | null = null;
  const linkForm = rtb.querySelector('form') as HTMLFormElement;
  const linkInput = rtb.querySelector('input') as HTMLInputElement;
  rtb.addEventListener('pointerdown', (e) => {
    // The words keep their selection: the bar takes no focus, except its address field.
    if (!(e.composedPath()[0] instanceof HTMLInputElement)) e.preventDefault();
  });
  rtb.addEventListener('click', (e) => {
    const b = (e.target as Element).closest?.('button');
    if (!b || !editing) return;
    e.preventDefault();
    e.stopPropagation();
    const c = b.dataset.c;
    if (b.dataset.w) {
      const [type, name] = b.dataset.w.split(':');
      rtb.classList.remove('colouring');
      W.act('wordsColour', { type, name: name || null });
      return redraw();
    }
    if (c === 'done') return finishEditing();
    if (c === 'turn') {
      const r = b.getBoundingClientRect();
      W.act('menu', { at: { left: r.left, top: r.top, bottom: r.bottom }, view: 'turn' });
      return;
    }
    if (c === 'code') {
      W.act('code', null);
      return redraw();
    }
    if (c === 'colour') {
      rtb.classList.add('colouring');
      return redraw();
    }
    if (c === 'link') {
      const s = getSelection();
      saved = s && s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
      const a = (s?.anchorNode as Element | null)?.parentElement?.closest?.('a');
      linkInput.value = a?.getAttribute('href') ?? '';
      rtb.classList.add('linking');
      linkInput.focus();
      redraw();
      return;
    }
    if (c) {
      noteTyping();
      document.execCommand(c, false);
    }
    redraw();
  });
  linkForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const url = linkInput.value.trim();
    rtb.classList.remove('linking');
    if (!editing) return;
    editing.focus({ preventScroll: true });
    const s = getSelection();
    if (saved && s) {
      s.removeAllRanges();
      s.addRange(saved);
    }
    if (url && !/^\s*javascript:/i.test(url)) {
      noteTyping();
      document.execCommand('createLink', false, url);
    }
    saved = null;
    redraw();
  });
  linkInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      rtb.classList.remove('linking');
      editing?.focus({ preventScroll: true });
    }
  });

  // ---- what the bar and the inspector ask for --------------------------------------------------------------
  let lastStyle: { key: string; at: number } | null = null;
  /** A copied part, as HTML (the app keeps one too, for other pages). */
  let clip = '';
  const placeNew = (node: Element, where: string, el: Element | null) => {
    const body = document.body;
    if (where === 'inside' && el && HOLDS.has(el.tagName)) el.append(node);
    else if (where === 'before' && el && el !== body) el.before(node);
    else if (where === 'end' || !el || el === body) {
      // Before the page's own scripts at the end, so it shows after the rest.
      let last: Element | null = body.lastElementChild;
      while (last && (last.tagName === 'SCRIPT' || isUi(last))) last = last.previousElementSibling;
      if (last) last.after(node);
      else body.prepend(node);
    } else el.after(node);
  };
  const fromHtml = (html: unknown): Element | null => {
    const t = document.createElement('template');
    t.innerHTML = String(html ?? '');
    for (const s of t.content.querySelectorAll('script')) s.remove();
    return t.content.firstElementChild;
  };
  const act = (a: string, arg?: any) => {
    const el = sel;
    const body = document.body;
    const styleKey = `${a}:${el ? pathOf(el).join('.') : ''}:${JSON.stringify(ctx)}`;
    if (a !== 'style' && a !== 'pageStyle' && a !== 'setVar') lastStyle = null;
    // Blocks as Notion has them (Turn into, colours, an icon and a cover, what the app was asked for), and several picked at once.
    if (/^(del|dup|up|down|copy|cut)$/.test(a) && W.picked().length > 1 && W.act(`many:${a}`, arg)) return;
    if (W.act(a, arg)) return;
    switch (a) {
      case 'caps':
        canAskAgent = !!arg?.ask;
        return;
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
      case 'copy':
      case 'cut': {
        if (!el || el === body) return;
        clip = el.outerHTML;
        send({ type: 'wa-ed-copied', html: clip, name: nameOf(el) });
        if (a === 'cut') return act('del');
        return;
      }
      case 'clip':
        clip = typeof arg?.html === 'string' ? arg.html : clip;
        return;
      case 'paste': {
        // Every part copied (several blocks copied together paste together), in their order.
        const t = document.createElement('template');
        t.innerHTML = String(typeof arg?.html === 'string' ? arg.html : clip);
        for (const s of t.content.querySelectorAll('script')) s.remove();
        const nodes = [...t.content.children];
        if (!nodes.length) return;
        remember();
        placeNew(nodes[0], arg?.where ?? 'after', el);
        for (let i = 1; i < nodes.length; i++) nodes[i - 1].after(nodes[i]);
        sel = nodes[0];
        break;
      }
      case 'insert': {
        // A block from the app's list: after the part picked (or before it, or inside it), or at the end of the page.
        const node = fromHtml(arg?.html);
        if (!node) return;
        remember();
        placeNew(node, arg?.where ?? (arg?.inside ? 'inside' : 'after'), el);
        sel = node;
        changed();
        (node as HTMLElement).scrollIntoView?.({ block: 'nearest' });
        if (arg?.edit) {
          // Its first words that can be written (a to-do's are in a span beside its box).
          const words = 'h1,h2,h3,h4,p,a,button,li,blockquote,summary,li>span,.n-callout-text';
          startEditing([node, ...node.querySelectorAll(words)].find((x) => x.matches(words) && wordy(x)) ?? null);
        }
        return;
      }
      case 'wrap': {
        if (!el || el === body) return;
        remember();
        const box = document.createElement(typeof arg === 'string' && /^(div|section|a)$/.test(arg) ? arg : 'div');
        el.replaceWith(box);
        box.append(el);
        sel = box;
        break;
      }
      case 'unwrap': {
        if (!el || el === body || !el.children.length) return;
        remember();
        const first = el.firstElementChild;
        el.replaceWith(...el.childNodes);
        sel = first;
        break;
      }
      case 'style': {
        if (!el) return;
        const props = (arg && typeof arg === 'object' ? arg : {}) as Record<string, string | null>;
        // A slider dragged along is one change to undo, not one per step.
        if (!(lastStyle && lastStyle.key === styleKey && Date.now() - lastStyle.at < 1200)) remember();
        lastStyle = { key: styleKey, at: Date.now() };
        // Several blocks picked: the change goes to each of them.
        const many = W.picked();
        for (const x of many.length > 1 && many.includes(el) ? many : [el]) styleOf(x, props);
        break;
      }
      case 'pageStyle': {
        // Every part of a kind across the page: the page itself, its headings, its links, its buttons.
        const list = (Array.isArray(arg?.kind) ? arg.kind : [arg?.kind]).map(String).filter((x: string) => KINDS.includes(x));
        if (!list.length) return;
        const k = MEDIAS.includes(arg?.media) ? (arg.media as Media) : ctx.media;
        const key = `page:${list.join('|')}:${k}`;
        if (!(lastStyle && lastStyle.key === key && Date.now() - lastStyle.at < 1200)) remember();
        lastStyle = { key, at: Date.now() };
        for (const kind of list) {
          const selector = boosted(kind);
          if (selector) setRule(k, selector, (arg?.props ?? {}) as Record<string, string | null>, false);
        }
        return changed(true);
      }
      case 'setVar': {
        const name = String(arg?.name ?? '');
        if (!/^--[\w-]+$/.test(name)) return;
        const key = `var:${name}`;
        if (!(lastStyle && lastStyle.key === key && Date.now() - lastStyle.at < 1200)) remember();
        lastStyle = { key, at: Date.now() };
        // The kit's colours are set again for its dark look (on the page's body), so a change wins there too.
        const selector = canon(name.startsWith('--n-') ? ':root, html[data-n-theme] body.n-page' : ':root, html body');
        if (selector) setRule('', selector, { [name]: arg?.value ?? null }, false);
        return changed(true);
      }
      case 'fonts':
        remember();
        setFonts(arg);
        return changed(true);
      case 'meta':
        remember();
        if (typeof arg?.title === 'string') setTitle(arg.title);
        if (typeof arg?.lang === 'string') {
          if (/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(arg.lang)) root.setAttribute('lang', arg.lang);
          else if (!arg.lang) root.removeAttribute('lang');
        }
        return changed(true);
      case 'customCss':
        remember();
        setCustom(arg);
        return changed(true);
      case 'css': {
        if (!el) return;
        remember();
        const v = String(arg ?? '').trim();
        const t = targetOf(el, true);
        if (t?.selector) {
          // The whole rule anew, from the text.
          model[ctx.media].delete(t.selector);
          const d = document.createElement('div');
          d.setAttribute('style', v);
          const props: Record<string, string> = {};
          for (let i = 0; i < d.style.length; i++) props[d.style[i]] = d.style.getPropertyValue(d.style[i]);
          setRule(ctx.media, t.selector, props, t.important);
        } else if (v) el.setAttribute('style', v);
        else el.removeAttribute('style');
        break;
      }
      case 'attr': {
        if (!el || !arg || typeof arg.name !== 'string') return;
        const name = arg.name.toLowerCase();
        // Handlers would only be held back here: they are written in the code view.
        if (!/^[a-z][a-z0-9:_.-]*$/.test(name) || name.startsWith('on') || name === 'contenteditable' || name.startsWith('data-n-') || name === 'style') return;
        if (name === 'href' || name === 'src') {
          if (/^\s*javascript:/i.test(String(arg.value ?? ''))) return;
        }
        remember();
        if (name === 'class') {
          // The editor's own class stays (its rules need it).
          const own = ownClassOf(el);
          const v = String(arg.value ?? '')
            .split(/\s+/)
            .filter((c) => c && !OWN.test(c));
          if (own) v.push(own);
          if (v.length) el.setAttribute('class', v.join(' '));
          else el.removeAttribute('class');
        } else if (arg.value === null) el.removeAttribute(name);
        else el.setAttribute(name, String(arg.value));
        break;
      }
      case 'words': {
        if (!el || !wordy(el) || el.children.length) return;
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
      case 'hover':
        hover = byPath(arg);
        if (hover) (hover as HTMLElement).scrollIntoView?.({ block: 'nearest' });
        return redraw();
      case 'reveal':
        if (el) (el as HTMLElement).scrollIntoView?.({ block: 'center', behavior: 'smooth' });
        return;
      case 'theme': {
        // The app's theme changed: the kit's colours, and the page's light-or-dark rules, follow it.
        const mode = arg?.theme === 'dark' ? 'dark' : 'light';
        root.setAttribute('data-n-theme', mode);
        const el = document.getElementById('n-theme');
        if (el && typeof arg?.css === 'string' && arg.css.length < 40000) el.textContent = arg.css;
        (window as unknown as { __nScheme?: (m: string) => void }).__nScheme?.(mode);
        redraw();
        tellPage();
        clearTimeout(paletteTimer);
        paletteTimer = window.setTimeout(() => send({ type: 'wa-ed-palette', colors: palette() }), 300);
        return;
      }
      case 'ctx': {
        const media = MEDIAS.includes(arg?.media) ? (arg.media as Media) : '';
        const scope = typeof arg?.scope === 'string' && (arg.scope === 'self' || arg.scope === 'tag' || /^\.[\w-]+$/.test(arg.scope)) ? arg.scope : 'self';
        ctx = { scope, state: arg?.state === 'hover' ? 'hover' : '', media };
        lastStyle = null;
        showHover();
        tell();
        return tellPage();
      }
      case 'layers':
        layersOn = !!arg;
        if (layersOn) send({ type: 'wa-ed-layers', tree: layers() });
        return;
      case 'page':
        return tellPage();
      case 'undo':
        return undoTyping();
      case 'redo':
        return redoTyping();
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
    // The page keeps the keys (Delete, the arrows) after a press on its bar.
    window.focus();
    if (b.dataset.a === 'drag') dragStart(e as PointerEvent);
  });
  bar.addEventListener('click', (e) => {
    const b = (e.target as Element).closest?.('button');
    e.preventDefault();
    e.stopPropagation();
    if (b && b.dataset.a !== 'drag') act(b.dataset.a!);
  });

  // ---- resizing a part by its edges ----------------------------------------------------------------------
  selBox.addEventListener('pointerdown', (e) => {
    const h = (e.composedPath()[0] as HTMLElement).dataset?.h;
    const el = sel as HTMLElement | null;
    if (!h || !el || el === document.body) return;
    e.preventDefault();
    e.stopPropagation();
    const r0 = el.getBoundingClientRect();
    const x0 = e.clientX;
    const y0 = e.clientY;
    remember();
    let moved = false;
    const move = (ev: PointerEvent) => {
      const w = Math.max(8, Math.round(r0.width + ev.clientX - x0));
      const hh = Math.max(8, Math.round(r0.height + ev.clientY - y0));
      const props: Record<string, string | null> = {};
      if (h !== 'b') props.width = `${w}px`;
      if (h !== 'r') props.height = el.tagName === 'IMG' && h === 'rb' ? 'auto' : `${hh}px`;
      if (h !== 'b' && getComputedStyle(el).maxWidth !== 'none' && parseFloat(getComputedStyle(el).maxWidth) < w) props['max-width'] = 'none';
      styleOf(el, props);
      moved = true;
      const r = el.getBoundingClientRect();
      sizeTag.textContent = `${Math.round(r.width)} × ${Math.round(r.height)}`;
      sizeTag.style.display = 'block';
      sizeTag.style.left = `${Math.min(r.right + 8, innerWidth - sizeTag.offsetWidth - 4)}px`;
      sizeTag.style.top = `${Math.min(r.bottom + 8, innerHeight - 24)}px`;
      redraw();
    };
    const up = () => {
      removeEventListener('pointermove', move, true);
      removeEventListener('pointerup', up, true);
      removeEventListener('pointercancel', up, true);
      sizeTag.style.display = 'none';
      if (moved) changed();
      else undo.pop();
    };
    addEventListener('pointermove', move, true);
    addEventListener('pointerup', up, true);
    addEventListener('pointercancel', up, true);
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
    const x0 = e.clientX;
    const y0 = e.clientY;
    const handle = (e.composedPath()[0] as Element).closest?.('button')?.getBoundingClientRect();
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
      moved = true;
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
      // A tap on the handle (a phone has no pointing at a block): the block's menu, Turn into, Colour and the rest.
      if (!moved && handle) return void W.act('menu', { at: { left: handle.left, top: handle.top, bottom: handle.bottom } });
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
  }

  // ---- writing as in Notion (writing.ts), handed what it needs -------------------------------------------------
  const core: Core = {
    L,
    send,
    shadow,
    look: { accent, panel, line, ink, muted, dark },
    isUi,
    wordy,
    nameOf,
    pathOf,
    byPath,
    under,
    sel: () => (sel && sel.isConnected ? sel : null),
    editing: () => editing,
    select,
    write,
    finish: () => finishEditing(),
    change,
    redraw,
    noteTyping: () => noteTyping(),
    offset: offsetIn,
    length: lengthOf,
    copy: (html, name) => {
      clip = html;
      send({ type: 'wa-ed-copied', html, name });
    },
    canAsk: () => canAskAgent,
  };
  // Its listeners come before the editor's own, so the keys it takes (Enter, Backspace, "/"…) go to it first.
  const W: Writing = writing(core);

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
  // The page grows or shrinks by itself too (a stylesheet or a picture that loads): what is drawn over it follows.
  new ResizeObserver(redraw).observe(root);
  document.addEventListener('selectionchange', () => editing && redraw());
  addEventListener(
    'focusout',
    (e) => {
      // Not when the bar's address field takes the focus.
      if (editing && e.target === editing) setTimeout(() => editing && document.activeElement !== editing && !rtb.classList.contains('linking') && finishEditing(), 0);
    },
    true,
  );
  // Pasted words come in as words, not as another page's markup; with no words being written, the part copied
  // goes after the one picked (a picture pasted is writing.ts's).
  addEventListener(
    'paste',
    (e) => {
      if (!inEditing(e)) {
        if (!editing && clip && sel) {
          e.preventDefault();
          act('paste');
        }
        return;
      }
      e.preventDefault();
      const text = e.clipboardData?.getData('text/plain') ?? '';
      noteTyping();
      document.execCommand('insertText', false, text);
    },
    true,
  );
  // Before the words being written change: a step to undo (the browser's own undo is the editor's here).
  addEventListener(
    'beforeinput',
    (ev) => {
      const e = ev as InputEvent;
      if (!editing || !(e.target instanceof Node) || !(editing === e.target || editing.contains(e.target))) return;
      if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') {
        e.preventDefault();
        return e.inputType === 'historyUndo' ? undoTyping() : redoTyping();
      }
      noteTyping(e.inputType.startsWith('delete') ? 'delete' : e.inputType.startsWith('insert') ? 'insert' : 'edit', e.data ?? '');
    },
    true,
  );
  addEventListener(
    'keydown',
    (e) => {
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key;
      if (fromUi(e)) return;
      if (mod && k.toLowerCase() === 's') {
        e.preventDefault();
        finishEditing();
        return send({ type: 'wa-ed-save' });
      }
      if (editing) {
        if (mod && (k.toLowerCase() === 'z' || k.toLowerCase() === 'y')) {
          e.preventDefault();
          return k.toLowerCase() === 'y' || e.shiftKey ? redoTyping() : undoTyping();
        }
        if (k === 'Escape' || (k === 'Enter' && !e.shiftKey && ONE_LINE.has(editing.tagName))) {
          e.preventDefault();
          finishEditing();
        } else if (k === 'Enter') {
          // A new line in the same part (a browser would start a new block in it, and the part would hold blocks).
          e.preventDefault();
          noteTyping();
          if (!document.execCommand('insertLineBreak')) document.execCommand('insertHTML', false, '<br>');
        }
        if (mod && k.toLowerCase() === 'k') {
          e.preventDefault();
          (rtb.querySelector('[data-c=link]') as HTMLElement).click();
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
      if (mod && ['c', 'x', 'd', 'g'].includes(k.toLowerCase())) {
        e.preventDefault();
        return act(k.toLowerCase() === 'c' ? 'copy' : k.toLowerCase() === 'x' ? 'cut' : k.toLowerCase() === 'd' ? 'dup' : e.shiftKey ? 'unwrap' : 'wrap');
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
      el.removeAttribute('data-n-hovering');
      if (el.hasAttribute('data-n-ce')) {
        el.removeAttribute('data-n-ce');
        el.removeAttribute('contenteditable');
      }
    }
    W.clean(copy);
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
    // Taps don't zoom, a long press doesn't select the page's words (only words being changed).
    const own = document.createElement('style');
    own.setAttribute('data-n-own', '');
    own.textContent = `html{touch-action:manipulation}body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}[data-n-ce]{-webkit-user-select:text;user-select:text;outline:none}${W.css}`;
    // A page narrower than the frame sits in the middle, as it does when it is used (the kit's bridge).
    const b = getComputedStyle(document.body);
    const l = parseFloat(b.marginLeft);
    if (b.maxWidth !== 'none' && l === parseFloat(b.marginRight) && l <= 16 && document.body.getBoundingClientRect().width < root.clientWidth - 1)
      own.textContent += 'html body{margin-left:auto;margin-right:auto}';
    document.head.appendChild(own);
    root.appendChild(host);
    readCss();
    writeForced();
    document.head.appendChild(forced);
    select(null);
    state();
    send({ type: 'wa-ed-ready', colors: palette(), bg: canvasBg() });
    tellPage();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
}

/** Puts `function`s' sources in a <script> safely (kit.ts's rules). */
const scriptSafe = (src: string) => src.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

/** The editor, with the writing it hands its insides to (both run in the page, as one script). */
export const EDITOR_SRC = scriptSafe(`(cfg) => (${editor.toString()})(cfg, ${writing.toString()})`);
