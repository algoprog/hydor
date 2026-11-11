// The visual editor that runs inside a page's sandboxed frame (/htmlframe) while the user edits the page.
// The frame writes the page with its scripts held back (they would rebuild what the user changes), and
// this script lets the user pick a part (a click or a tap), change its words where they are (a second
// click) with a small bar for bold, italic, links and the like, drag it elsewhere (a placed part where the
// pointer takes it, with pink guides; one that sticks when scrolled to where it sticks) or size it from any
// side, open its menu with a right-click, and move, copy, wrap or delete it. The app's inspector changes its look and its address,
// picture or words through messages (`wa-ed`), and the page's own look: its colours (CSS variables), its
// fonts, its headings' and text's styles, its title, and CSS of the user's own.
//
// Changes to one part go in its style attribute; changes for a hover, for a tablet's or a phone's width,
// or for every part of a kind (all Heading 2s, every part with a class) go in a stylesheet of the
// editor's own in the page (<style id="n-styles">), so they stay with the page. What it gives back is
// the page's HTML with the user's changes and its scripts as they were.
//
// Writing as in Notion (blocks that flow into each other, Markdown as you type, "/" for blocks, handles
// beside each block and their menu, several blocks picked, an icon and a cover, databases) is writing.ts, which this
// hands its insides to; a database's own cells, menus and keys are its own (Ctrl+S still saves), and its rows are
// read and kept through the app (`wa-ed-store`), with the page's own data. Undo keeps a step per change of a block:
// while words are being written, Ctrl+Z takes back the last few words typed first, then the change before (a
// database's rows, kept as they change, are not in its steps).
//
// Like the kit's bridge, the function below runs in the browser: its source is sent as text, so it uses
// only its argument and the browser's own globals.
import { codeColours, type CodeColours } from '../../shared/code-colours.ts';
import { pageDatabases, type PageDatabases } from '../../shared/page-db.ts';
import { geometry, type Geometry } from './editor-geometry.ts';
import { writing, type At, type Core, type CtxRow, type Extra, type ExtraCore, type Next, type Writing } from './writing.ts';
import { writingAi } from './writing-ai.ts';
import { writingBlocks } from './writing-blocks.ts';

export interface EditorCfg {
  n: string;
  theme: 'light' | 'dark';
  /** The page's doctype as written, put back in front of what it gives back. */
  doctype: string;
  /** The words on its bars, in the app's language. */
  labels: Record<string, string>;
}

function editor(cfg: EditorCfg, writing: (core: Core) => Writing, codeColours: () => CodeColours, pageDatabases: () => PageDatabases, geometry: () => Geometry, extras: ((x: ExtraCore) => Extra)[] = []) {
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
    if (c?.contains('n-db')) return L('sDatabase', 'Database');
    // An item that holds a block under its parent item (writing.ts) is named by that block: "Heading 3", "Text".
    if (el.tagName === 'LI' && c?.contains('n-block') && el.firstElementChild && !/^(UL|OL)$/.test(el.firstElementChild.tagName)) return nameOf(el.firstElementChild);
    if (el.tagName === 'LI' && el.parentElement?.classList.contains('n-todo')) return L('phTodo', 'To-do');
    if (c?.contains('n-todo')) return L('sTodo', 'To-do list');
    return NAMES[el.tagName.toUpperCase()] ?? L('box', 'Block');
  };
  const isUi = (el: Element | null) => !!el && (el === host || !!el.closest?.('[data-n-own]'));
  /** Blocks that are drawn rather than written (changed through their own fields). */
  const DRAWN = '.n-video,.n-math,.n-toc,.n-cover,.n-icon,.n-db';
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
    comment: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    ai: '<path d="m12 3-1.9 5.8L4 10.6l5.6 2.1L12 19l2-6.3 6-2.1-6-1.8z"/><path d="M5 3v4"/><path d="M3 5h4"/>',
    media: '<path d="M21 4 3 22"/><path d="m14 4 6 6"/><path d="M5 9 9 5"/>',
  };
  const svg = (k: string) => `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;
  const dark = cfg.theme === 'dark';
  /** The guides and the pills on them, as in the design editor: thin pink lines between what moves and what it lines up with. */
  const GUIDE = '#ff3b8b';
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
    .h.e{right:-6px;top:50%;width:9px;height:26px;margin-top:-13px;cursor:ew-resize}
    /* (the left and top handles sit wholly outside the box: a press at the start of its words is a click on them, not a size) */
    .h.w{left:-10px;top:50%;width:9px;height:26px;margin-top:-13px;cursor:ew-resize}
    .h.s{bottom:-6px;left:50%;height:9px;width:26px;margin-left:-13px;cursor:ns-resize}
    .h.n{top:-10px;left:50%;height:9px;width:26px;margin-left:-13px;cursor:ns-resize}
    .h.se,.h.nw,.h.ne,.h.sw{width:12px;height:12px;border-radius:3px}
    .h.se{right:-7px;bottom:-7px;cursor:nwse-resize}
    .h.nw{left:-12px;top:-12px;cursor:nwse-resize}
    .h.ne{right:-7px;top:-12px;cursor:nesw-resize}
    .h.sw{left:-12px;bottom:-7px;cursor:nesw-resize}
    .tag,.size{position:fixed;display:none;pointer-events:none;padding:1px 7px;border-radius:6px;background:${accent};color:${dark ? '#1a1306' : '#fff'};font:600 11px/18px system-ui,sans-serif;white-space:nowrap}
    .size,.gl{background:${GUIDE};color:#fff}
    .g{position:fixed;background:${GUIDE};pointer-events:none}
    .g.ghost{background:none;border:1px dashed ${GUIDE};border-radius:3px;box-sizing:border-box}
    .gl{position:fixed;pointer-events:none;font:600 10px/16px system-ui,sans-serif;padding:0 4px;border-radius:4px;white-space:nowrap}
    .size{font-size:10.5px;line-height:16px}
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
    .rtb input[aria-invalid]{outline:2px solid #d44c47;outline-offset:-2px}
    .rtb input{all:unset;width:190px;height:26px;padding:0 8px;border-radius:7px;background:${dark ? '#151412' : '#f5f3ee'};color:${ink};font:13px system-ui,sans-serif}
    .rtb{flex-wrap:wrap;max-width:calc(100vw - 8px);box-sizing:border-box}
    .cmds{flex-wrap:wrap}
    .rtb button.kind{width:auto;gap:3px;padding:0 6px 0 8px;font:500 12.5px system-ui,sans-serif;display:flex;align-items:center;white-space:nowrap}
    .rtb button.kind[hidden],.rtb .sep[hidden],.rtb button[hidden]{display:none}
    .rtb button.askai{width:auto;gap:4px;padding:0 8px 0 6px;font:600 12.5px system-ui,sans-serif;display:flex;align-items:center;white-space:nowrap;color:${dark ? '#c7b8ff' : '#6b4fd8'}}
    .pal{display:none;flex-direction:column;gap:4px;padding:3px 4px}
    .rtb.colouring .pal{display:flex}
    .rtb.colouring .cmds{display:none}
    .pal .row{display:flex;align-items:center;gap:3px}
    .pal .lbl{width:74px;color:${muted};font:11.5px system-ui,sans-serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .rtb .pal button{width:24px;height:24px;border:1px solid ${line};box-sizing:border-box;border-radius:6px;font:700 13px/1 system-ui,sans-serif}
    .drop{position:fixed;display:none;height:3px;border-radius:2px;background:${accent};pointer-events:none;box-shadow:0 0 0 2px ${accent}33}
    @media (pointer:coarse){.bar button,.rtb button{width:38px;height:36px}.h.e,.h.w{width:14px;height:34px;margin-top:-17px}.h.e{right:-9px}.h.w{left:-14px}.h.s,.h.n{height:14px;width:34px;margin-left:-17px}.h.s{bottom:-9px}.h.n{top:-14px}.h.se,.h.nw,.h.ne,.h.sw{width:18px;height:18px}.h.se{right:-10px;bottom:-10px}.h.nw{left:-16px;top:-16px}.h.ne{right:-10px;top:-16px}.h.sw{left:-16px;bottom:-10px}}
  </style>
  <div class="sp m"></div><div class="sp p"></div>
  <div class="box hover"></div>
  <div class="box sel">${['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'].map((k) => `<i class="h ${k}" data-h="${k}"></i>`).join('')}</div>
  <div class="guides"></div>
  <div class="tag"></div><div class="size"></div><div class="drop"></div>
  <div class="bar" role="toolbar">
    <button class="drag" data-a="drag" title="${attr(L('gripTip', 'Drag to move it, click for its menu'))}">${svg('drag')}</button>
    <button data-a="parent" title="${L('parentTip', 'Pick the part around it (Esc)')}">${svg('parent')}</button>
    <button data-a="edit" title="${L('editTip', 'Change the words (click again)')}">${svg('edit')}</button>
    <button data-a="media" title="${attr(L('mediaTip', 'Edit picture'))}">${svg('media')}</button>
    <span class="sep"></span>
    <button data-a="up" title="${L('upTip', 'Move up')}">${svg('up')}</button>
    <button data-a="down" title="${L('downTip', 'Move down')}">${svg('down')}</button>
    <button data-a="dup" title="${L('dupTip', 'Duplicate (Ctrl+D)')}">${svg('dup')}</button>
    <button data-a="del" title="${L('delTip', 'Delete (Delete)')}">${svg('del')}</button>
  </div>
  <div class="rtb" role="toolbar">
    <span class="cmds">
      <button class="askai" data-c="ai" title="${attr(L('aiTip', 'Ask AI (Ctrl+J)'))}">${svg('ai')}${attr(L('askAi', 'Ask AI'))}</button>
      <span class="sep"></span>
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
      <button data-c="comment" title="${attr(L('commentTip', 'Comment (Ctrl+Alt+M)'))}" hidden>${svg('comment')}</button>
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
  const guidesEl = $('.guides');
  const mBox = $('.sp.m');
  const pBox = $('.sp.p');

  let sel: Element | null = null;
  let hover: Element | null = null;
  let editing: HTMLElement | null = null;
  /** Whether the app has an agent to ask about a part (the block menu's Ask the agent), and keeps comments for the page. */
  let canAskAgent = false;
  let canComment = false;
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
  /** A placed part is being moved or sized: its bar and name step aside for the guides and the pills. */
  let placing = false;
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
    if (placing) {
      bar.style.display = 'none';
      tag.style.display = 'none';
      return;
    }
    bar.style.display = 'flex';
    (bar.querySelector('[data-a=drag]') as HTMLElement).hidden = isBody;
    (bar.querySelector('[data-a=parent]') as HTMLElement).hidden = isBody;
    (bar.querySelector('[data-a=edit]') as HTMLElement).hidden = !wordy(sel);
    // A picture, or a video the app keeps: its editor (pages/design/pageMedia.tsx), from here.
    const media = sel.tagName === 'IMG' ? 'Picture' : sel.tagName === 'VIDEO' && /\/pg\/video\//.test(sel.getAttribute('src') ?? '') ? 'Video' : '';
    const mb = bar.querySelector('[data-a=media]') as HTMLElement;
    mb.hidden = !media;
    if (media) mb.title = media === 'Video' ? L('mediaVideoTip', 'Edit video') : L('mediaTip', 'Edit picture');
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

  // ---- keys and measures for moving and sizing parts ------------------------------------------------------------------
  const G = geometry();
  const apple = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  /** The app-wide keys for dragging (web/src/features/pages/common/keys.ts, mirrored: the frame cannot import it): a copy, and no snapping. */
  const isCopyDrag = (e: { ctrlKey: boolean; altKey: boolean }) => (apple ? e.altKey : e.ctrlKey);
  const isNoSnap = (e: { metaKey: boolean; altKey: boolean }) => (apple ? e.metaKey : e.altKey);
  /** How close, in pixels of the frame, an edge must come to a line to snap to it. */
  const SNAP = 6;
  type Box = { x: number; y: number; w: number; h: number };
  const boxOfRect = (r: DOMRect): Box => ({ x: r.left, y: r.top, w: r.width, h: r.height });
  /** A part that is placed by offsets (moved from where it falls, on its block, on the screen, stuck when scrolled), not left where the page puts it. */
  const isPlaced = (el: Element | null): el is HTMLElement => !!el && el !== document.body && el !== root && el instanceof HTMLElement && getComputedStyle(el).position !== 'static';
  /** Whether a part has others beside it on its line (a flex row, a grid's row, an inline run): the drop line is then vertical. */
  const sideBySide = (el: Element): boolean => {
    const p = el.parentElement;
    if (!p) return false;
    const r = el.getBoundingClientRect();
    if (!r.height) return false;
    let n = 0;
    for (const c of p.children) {
      if (c === el || isUi(c) || SKIP.has(c.tagName)) continue;
      const q = c.getBoundingClientRect();
      if (!q.width && !q.height) continue;
      const over = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top);
      // (on the same line: they share more than half of the shorter one's height, and do not sit one over the other)
      if (over > Math.min(r.height, q.height) / 2 && (q.right <= r.left + 1 || q.left >= r.right - 1)) n++;
      if (n) return true;
    }
    return false;
  };
  /** A part's box inside its border (where its padding starts): what the offsets of the parts placed in it count from. */
  const innerOf = (x: Element): Box => {
    const r = x.getBoundingClientRect();
    const cs = getComputedStyle(x);
    return { x: r.left + (parseFloat(cs.borderLeftWidth) || 0), y: r.top + (parseFloat(cs.borderTopWidth) || 0), w: x.clientWidth, h: x.clientHeight };
  };
  /** The screen: the part of the page in view (without its scroll bars). */
  const screenBox = (): Box => ({ x: 0, y: 0, w: root.clientWidth || innerWidth, h: (document.compatMode === 'BackCompat' ? innerHeight : root.clientHeight) || innerHeight });
  /**
   * Where a part that sticks when scrolled sticks: the box that scrolls it (the screen, or a part of the page with a scroll bar
   * of its own), and whether that box scrolls sideways too (only then does a stick from the left or the right count).
   */
  const stickPort = (el: Element): { box: Box; sideways: boolean } => {
    for (let x = el.parentElement; x && x !== document.body && x !== root; x = x.parentElement) {
      const cs = getComputedStyle(x);
      if (/auto|scroll|hidden/.test(cs.overflowX + cs.overflowY)) return { box: innerOf(x), sideways: x.scrollWidth > x.clientWidth + 1 && !/visible|clip/.test(cs.overflowX) };
    }
    // (a whole page that scrolls sideways does so by mistake, a part too wide: a stick from the side is for a box that scrolls, a table's say)
    return { box: screenBox(), sideways: false };
  };
  /**
   * The box a placed part's offsets count from: the screen for one on the screen, the box that scrolls one that sticks, the
   * nearest placed part around one on its block (else the page's first screen), the part it is in for one moved from where it falls.
   */
  const placeBox = (el: HTMLElement): Box => {
    const pos = getComputedStyle(el).position;
    if (pos === 'fixed') return screenBox();
    if (pos === 'sticky') return stickPort(el).box;
    if (pos === 'absolute') {
      const op = el.offsetParent;
      if (op && op !== document.body && op !== root) return innerOf(op);
      const page = root.getBoundingClientRect();
      return { x: page.left, y: page.top, w: root.clientWidth || innerWidth, h: screenBox().h };
    }
    return innerOf(el.parentElement ?? document.body);
  };
  /** The parts a moved or sized part lines up with: its neighbours (and theirs one level in), the box it is in and the page. */
  const lineUps = (el: Element): { others: Box[]; frames: Box[] } => {
    const parent = el.parentElement ?? document.body;
    const ok = (x: Element): x is HTMLElement => x instanceof HTMLElement && x !== el && !el.contains(x) && !isUi(x) && !SKIP.has(x.tagName) && x.tagName !== 'BR';
    const others: Box[] = [];
    const add = (x: HTMLElement) => {
      if (others.length > 250) return;
      const r = x.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || getComputedStyle(x).visibility === 'hidden') return;
      others.push(boxOfRect(r));
    };
    const pos = el instanceof HTMLElement ? getComputedStyle(el).position : 'static';
    // On the screen or stuck to it: what it lines up with are the others that stay on the screen (a header, a bar), and the screen.
    if (pos === 'fixed' || pos === 'sticky') {
      const port = pos === 'sticky' ? stickPort(el).box : screenBox();
      let seen = 0;
      for (const x of document.body.querySelectorAll('*')) {
        if (++seen > 4000) break;
        if (!ok(x) || x.contains(el)) continue;
        const p = getComputedStyle(x).position;
        if (p !== 'fixed' && p !== 'sticky') continue;
        const r = x.getBoundingClientRect();
        if (r.width < 1 || r.height < 1 || r.bottom < port.y || r.top > port.y + port.h) continue;
        // (another that sticks counts where it sticks, as it is when the page is scrolled)
        const top = parseFloat(getComputedStyle(x).top);
        others.push(p === 'sticky' && Number.isFinite(top) ? { x: r.left, y: port.y + top, w: r.width, h: r.height } : boxOfRect(r));
      }
      if (pos === 'fixed') for (const x of parent.children) if (ok(x)) add(x);
      return { others, frames: [port] };
    }
    for (const x of parent.children) if (ok(x)) add(x);
    for (const x of parent.children) if (ok(x) && !x.matches('p,h1,h2,h3,h4,h5,h6,li,span,a')) for (const c of x.children) if (ok(c)) add(c);
    // The box its offsets count from (its block, for one on its block), the part it is in, and the page.
    const inner = innerOf(parent);
    const own = el instanceof HTMLElement && pos === 'absolute' ? placeBox(el) : inner;
    const page = root.getBoundingClientRect();
    const frames = [own, ...(own === inner ? [] : [inner]), { x: page.left, y: page.top, w: root.clientWidth, h: page.height }];
    return { others, frames };
  };
  /** Draws what snapping found: thin pink lines, and the distances between parts as small pills on them. */
  const drawGuides = (o: { lines: { x1: number; y1: number; x2: number; y2: number }[]; gaps: { x: number; y: number; w: number; h: number; label: string; vertical: boolean }[] }) => {
    guidesEl.textContent = '';
    const mk = (cls: string) => {
      const d = document.createElement('div');
      d.className = cls;
      guidesEl.append(d);
      return d;
    };
    for (const l of o.lines) {
      const g = mk('g');
      if (Math.abs(l.x1 - l.x2) < 0.5) Object.assign(g.style, { left: `${l.x1 - 0.5}px`, top: `${Math.min(l.y1, l.y2)}px`, width: '1px', height: `${Math.abs(l.y2 - l.y1)}px` });
      else Object.assign(g.style, { left: `${Math.min(l.x1, l.x2)}px`, top: `${l.y1 - 0.5}px`, width: `${Math.abs(l.x2 - l.x1)}px`, height: '1px' });
    }
    for (const q of o.gaps) {
      const g = mk('g');
      if (q.vertical) Object.assign(g.style, { left: `${q.x - 0.5}px`, top: `${q.y}px`, width: '1px', height: `${q.h}px` });
      else Object.assign(g.style, { left: `${q.x}px`, top: `${q.y - 0.5}px`, width: `${q.w}px`, height: '1px' });
      const t = mk('gl');
      t.textContent = q.label;
      const cx = q.x + q.w / 2;
      const cy = q.y + q.h / 2;
      t.style.left = `${Math.max(2, Math.min(innerWidth - t.offsetWidth - 2, cx - t.offsetWidth / 2 + (q.vertical ? 6 + t.offsetWidth / 2 : 0)))}px`;
      t.style.top = `${Math.max(2, Math.min(innerHeight - 18, cy - 8 + (q.vertical ? 0 : -12)))}px`;
    }
  };
  const clearGuides = () => (guidesEl.textContent = '');
  /** A small pink pill with words beside a point (a part's size while it is sized, where it is while it is moved). */
  const pill = (text: string, r: { right: number; bottom: number }) => {
    sizeTag.textContent = text;
    sizeTag.style.display = 'block';
    sizeTag.style.left = `${Math.max(2, Math.min(r.right + 8, innerWidth - sizeTag.offsetWidth - 4))}px`;
    sizeTag.style.top = `${Math.max(2, Math.min(r.bottom + 8, innerHeight - 24))}px`;
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
  /** The spans a plain code block's colours are put on with (shared/code-colours.ts): no parts of the page's own. */
  const COLOURED = 'pre > code > span:is(.n-ck,.n-cs,.n-cn,.n-cc,.n-cf,.n-ct,.n-ca,.n-cg,.n-cv,.n-ci,.n-cd)';
  let layersOn = false;
  const layers = () => {
    let count = 0;
    type Node = { p: number[]; n: string; t: string; x: string; c: Node[] };
    const walk = (el: Element, path: number[]): Node => {
      const kids: Node[] = [];
      [...el.children].forEach((c, i) => {
        if (count > 2500 || SKIP.has(c.tagName) || isUi(c) || c.matches(COLOURED) || (c.tagName === 'SPAN' && c.parentElement?.matches('pre.n-code'))) return;
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
    if (!editing && !b.querySelector(`[data-n-ph],[data-n-ceoff],[data-n-hovering],[data-n-ce],pre.n-code > *,${COLOURED}`)) return b.outerHTML;
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
    if (findAsk) {
      clearTimeout(findTimer);
      findTimer = window.setTimeout(() => findAsk && runFind(findAsk.query, findAsk.opts), 150);
    }
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
  /** Whether the page had changes before writing in this block began (words typed and taken back leave it so). */
  let dirtyBefore = false;
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
      // The app shows Save from the first letter typed (and asks before the page is left), not only once the block is left.
      if (!dirty) {
        dirty = true;
        state();
      }
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
    if (typing.length === 1 && editPushed) {
      // Back to where writing in this block began: its words become a step to redo, as any other change.
      const now = snap();
      putWords(typing.pop()!);
      undo.pop();
      editPushed = false;
      redo.push(now);
      typingRedo.length = 0;
      return state();
    }
    typingRedo.push({ h: editing.innerHTML, o: offsetIn(editing) ?? 0 });
    putWords(typing.pop()!);
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
    dirtyBefore = dirty;
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
    // Typed and taken back again: no step to keep, and the page is as changed as it was before.
    if (was && same && !quiet) {
      undo.pop();
      dirty = dirtyBefore;
      state();
    } else if (was && !quiet) changed();
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
    if (c === 'ai') {
      W.act('aiOpen', null);
      return;
    }
    if (c === 'turn') {
      const r = b.getBoundingClientRect();
      W.act('menu', { at: { left: r.left, top: r.top, bottom: r.bottom }, view: 'turn' });
      return;
    }
    if (c === 'code') {
      W.act('code', null);
      return redraw();
    }
    if (c === 'comment') {
      W.act('comment', null);
      return;
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
  linkInput.addEventListener('input', () => linkInput.removeAttribute('aria-invalid'));
  linkForm.addEventListener('submit', (e) => {
    e.preventDefault();
    // What was typed, as an address that goes somewhere (example.com is a web address, an email address mail): one that runs code is refused.
    const typed = linkInput.value.trim();
    const url = G.linkAddress(typed);
    if (typed && !url) {
      linkInput.setAttribute('aria-invalid', 'true');
      linkInput.title = L('badLink', 'That cannot be a link: only web, mail, phone and page addresses');
      return;
    }
    rtb.classList.remove('linking');
    if (!editing) return;
    editing.focus({ preventScroll: true });
    const s = getSelection();
    if (saved && s) {
      s.removeAllRanges();
      s.addRange(saved);
    }
    if (url) {
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
    if (a !== 'style' && a !== 'pageStyle' && a !== 'setVar' && a !== 'nudge') lastStyle = null;
    // Blocks as Notion has them (Turn into, colours, an icon and a cover, what the app was asked for), and several picked at once.
    if (/^(del|dup|up|down|copy|cut)$/.test(a) && W.picked().length > 1 && W.act(`many:${a}`, arg)) return;
    if (W.act(a, arg)) return;
    switch (a) {
      case 'caps':
        canAskAgent = !!arg?.ask;
        canComment = !!arg?.comment;
        (rtb.querySelector('[data-c=comment]') as HTMLElement).hidden = !canComment;
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
        copyOut(el.outerHTML, nameOf(el));
        if (a === 'cut') return act('del');
        return;
      }
      case 'clip':
        clip = typeof arg?.html === 'string' ? arg.html : clip;
        return;
      case 'pasteMenu':
        // The menu's Paste: the system clipboard is the app's to read (this frame has no permission to), and comes back as `pasteData`.
        if (arg?.plain) plainAt = Date.now();
        send({ type: 'wa-ed-clip-read', plain: !!arg?.plain });
        return;
      case 'pasteData': {
        // What the app read from the clipboard (or that it could not: the part copied in this page goes in instead).
        const html = typeof arg?.html === 'string' ? arg.html : '';
        const text = typeof arg?.text === 'string' ? arg.text : '';
        if (editing) return void W.act('pasteWords', { html, text, plain: !!arg?.plain });
        if (!pasteInPage(html, text, !!arg?.plain)) act('paste');
        return;
      }
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
        W.prepare(node);
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
        // Addresses that run code or show files are refused; a link's address typed bare is made one that goes somewhere.
        let value: unknown = arg.value;
        if (name === 'href' && typeof value === 'string' && value.trim()) {
          const url = G.linkAddress(value);
          if (!url) return;
          value = url;
        } else if (name === 'src' && /^\s*(javascript|vbscript|data|file|blob):/i.test(String(value ?? '')) && !(el.tagName === 'IMG' && /^\s*data:image\/(png|jpe?g|gif|webp|avif|bmp);/i.test(String(value)))) return;
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
        } else if (value === null) el.removeAttribute(name);
        else el.setAttribute(name, String(value));
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
      case 'nudge': {
        // The arrow keys (and the app's buttons) on a placed part (one that sticks: where it sticks).
        if (!el || !isPlaced(el)) return;
        return nudge(el, Number(arg?.dx) || 0, Number(arg?.dy) || 0);
      }
      case 'place': {
        // Place freely: where it falls, now moved from there (nothing jumps), so it can be dragged; or back in the flow.
        if (!el || el === body) return;
        remember();
        if (arg === 'flow') {
          selfStyle(el, { position: null, top: null, right: null, bottom: null, left: null, 'z-index': null });
          // (placed by the page's own CSS, a class: where it falls is said for it alone)
          if (getComputedStyle(el).position !== 'static') selfStyle(el, { position: 'static' });
        } else if (getComputedStyle(el).position === 'static') selfStyle(el, { position: 'relative' });
        break;
      }
      case 'layer': {
        // In front of the parts beside it, or behind them: a number above or below theirs (a part that is not placed is, first).
        if (!el || el === body || !el.parentElement) return;
        const z = [...el.parentElement.children].filter((x) => x !== el && x instanceof HTMLElement && !isUi(x)).map((x) => parseInt(getComputedStyle(x).zIndex, 10) || 0);
        const to = arg === 'back' ? Math.min(0, ...z) - 1 : Math.max(0, ...z) + 1;
        remember();
        if (getComputedStyle(el).position === 'static') selfStyle(el, { position: 'relative' });
        selfStyle(el, { 'z-index': String(to) });
        break;
      }
      case 'unlink': {
        const a2 = el?.closest('a');
        if (!a2 || a2.classList.contains('n-btn')) return;
        remember();
        a2.replaceWith(...a2.childNodes);
        sel = null;
        break;
      }
      case 'selectAll': {
        // Every part of the page, as if each were picked with Shift.
        const all = W.all();
        if (all.length) W.pick(all);
        return;
      }
      case 'find': {
        const o = arg?.opts ?? {};
        return runFind(String(arg?.query ?? ''), { matchCase: !!o.matchCase, wholeWord: !!o.wholeWord, regex: !!o.regex }, Number(arg?.step) || 0);
      }
      case 'findReplace': {
        const o = arg?.opts ?? {};
        return replaceFind(String(arg?.query ?? ''), { matchCase: !!o.matchCase, wholeWord: !!o.wholeWord, regex: !!o.regex }, String(arg?.replacement ?? ''), !!arg?.all);
      }
      case 'findClear':
        return clearFind();
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
    if (b?.dataset.a === 'media') return send({ type: 'wa-ed-design', what: 'action', action: sel?.tagName === 'VIDEO' ? 'editVideo' : 'editPicture' });
    if (b && b.dataset.a !== 'drag') act(b.dataset.a!);
  });

  // ---- placing a part by its offsets: moving it freely, nudging it, sizing it from any side ------------------------------
  /** A change to this part alone (not to every part of its kind the inspector may be set to), at the screen size shown. */
  const selfStyle = (el: Element, props: Record<string, string | null>) => {
    const was = ctx;
    ctx = { scope: 'self', state: '', media: was.media };
    try {
      styleOf(el, props);
    } finally {
      ctx = was;
    }
  };
  /** Which offset of each direction a part is placed by: the one it has (right or bottom if only those are set), else left and top. */
  const anchorsOf = (el: HTMLElement): { x: 'left' | 'right'; y: 'top' | 'bottom' } => {
    const st = el.style;
    const cs = getComputedStyle(el);
    const set = (v: string) => Number.isFinite(parseFloat(v));
    return {
      x: (st.right && !st.left) || (!st.left && !set(cs.left) && set(cs.right)) ? 'right' : 'left',
      y: (st.bottom && !st.top) || (!st.top && !set(cs.top) && set(cs.bottom)) ? 'bottom' : 'top',
    };
  };
  /**
   * Puts a placed part's border box where `left`, `top` say (the frame's pixels): its offsets are changed by the difference,
   * measured, and corrected where the page's own rules make them count differently (a part stretched between left and
   * right keeps its size, a scaled box moves by what shows). Returns where it ended up.
   */
  const placeAt = (el: HTMLElement, left: number, top: number): DOMRect => {
    const a = anchorsOf(el);
    const size0 = el.getBoundingClientRect();
    const num = (v: string) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0);
    let freed = false;
    for (let i = 0; i < 4; i++) {
      const r = el.getBoundingClientRect();
      const ex = left - r.left;
      const ey = top - r.top;
      if (i && Math.abs(ex) < 0.75 && Math.abs(ey) < 0.75) break;
      const cs = getComputedStyle(el);
      const props: Record<string, string | null> = {
        [a.x]: `${Math.round(num(cs[a.x]) + (a.x === 'left' ? ex : -ex))}px`,
        [a.y]: `${Math.round(num(cs[a.y]) + (a.y === 'top' ? ey : -ey))}px`,
      };
      selfStyle(el, props);
      // Stretched between two offsets: the other one is let go, so that the size stays what it was.
      const q = el.getBoundingClientRect();
      if (!freed && (Math.abs(q.width - size0.width) > 0.75 || Math.abs(q.height - size0.height) > 0.75)) {
        freed = true;
        const free: Record<string, string | null> = {};
        if (Math.abs(q.width - size0.width) > 0.75) free[a.x === 'left' ? 'right' : 'left'] = 'auto';
        if (Math.abs(q.height - size0.height) > 0.75) free[a.y === 'top' ? 'bottom' : 'top'] = 'auto';
        selfStyle(el, free);
      }
    }
    return el.getBoundingClientRect();
  };
  /** Whether a press just ended a drag: the click that follows it is not one on the page. */
  let dragged = false;
  /** Whether the press going on moves a placed part (from the press to its end, moved or not). */
  let freeHeld = false;
  /** A long press with a finger (the right-click of a phone): when it opened the menu, and its timer. */
  let longAt = 0;
  let pressTimer = 0;
  /**
   * Where a part that sticks when scrolled sticks now, in the frame's pixels: its offset from the top (or the bottom) of the box
   * that scrolls it, and from its side where that box scrolls sideways. With no offset yet, where it is.
   */
  const stuckBox = (el: HTMLElement, port: { box: Box; sideways: boolean }): Box => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const a = anchorsOf(el);
    const p = port.box;
    const v = parseFloat(cs[a.y]);
    const u = parseFloat(cs[a.x]);
    return {
      x: port.sideways && Number.isFinite(u) ? (a.x === 'left' ? p.x + u : p.x + p.w - u - r.width) : r.left,
      y: Number.isFinite(v) ? (a.y === 'top' ? p.y + v : p.y + p.h - v - r.height) : r.top,
      w: r.width,
      h: r.height,
    };
  };
  /**
   * Makes a part that sticks when scrolled stick with its box at `at` (the frame's pixels): its offset from the top (or from the
   * bottom, when that is the one it has), and from the left or the right only where the box that scrolls it scrolls sideways
   * (elsewhere they would do nothing). Whole pixels, never less than none. Returns the box where it sticks.
   */
  const stickAt = (el: HTMLElement, at: { x: number; y: number }, port: { box: Box; sideways: boolean }): Box => {
    const a = anchorsOf(el);
    const r = el.getBoundingClientRect();
    const p = port.box;
    const y = Math.max(0, Math.round(a.y === 'top' ? at.y - p.y : p.y + p.h - (at.y + r.height)));
    const x = Math.max(0, Math.round(a.x === 'left' ? at.x - p.x : p.x + p.w - (at.x + r.width)));
    selfStyle(el, port.sideways ? { [a.y]: `${y}px`, [a.x]: `${x}px` } : { [a.y]: `${y}px` });
    return {
      x: port.sideways ? (a.x === 'left' ? p.x + x : p.x + p.w - x - r.width) : r.left,
      y: a.y === 'top' ? p.y + y : p.y + p.h - y - r.height,
      w: r.width,
      h: r.height,
    };
  };
  /** The words of the pill while a part that sticks is moved: how far from the screen's edge it sticks. */
  const stickWords = (el: HTMLElement, port: { sideways: boolean }) => {
    const a = anchorsOf(el);
    const n = (side: string) => String(Math.round(parseFloat(el.style.getPropertyValue(side)) || 0));
    const words = [L(a.y === 'top' ? 'sticksTop' : 'sticksBottom', a.y === 'top' ? 'Sticks {n} px from the top' : 'Sticks {n} px from the bottom').replace('{n}', n(a.y))];
    if (port.sideways) words.push(L(a.x === 'left' ? 'sticksLeft' : 'sticksRight', a.x === 'left' ? '{n} px from the left' : '{n} px from the right').replace('{n}', n(a.x)));
    return words.join(', ');
  };
  /**
   * Dragging a part that sticks when scrolled sets where it sticks on the screen: its box goes where the pointer takes it, and
   * its offset from the top (or the bottom) says so; sideways too where the box that scrolls it scrolls sideways. It snaps to the
   * screen's edges and middle and to the parts that stay on the screen (a header it should stick under), with the same pink
   * guides, distances and keys as the other placed parts. Lower in the page than the line it sticks at, it stays where it is
   * until the page is scrolled: a dashed outline shows where it will stick.
   */
  const stickMove = (e: PointerEvent, el0: HTMLElement, tap?: () => void): boolean => {
    let el = el0;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    let r0: DOMRect | null = null;
    let port = stickPort(el0);
    let near: { others: Box[]; frames: Box[] } | null = null;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      if (!moved) {
        moved = true;
        finishEditing();
        remember();
        lastStyle = null;
        if (isCopyDrag(ev)) {
          const c = el0.cloneNode(true) as HTMLElement;
          c.removeAttribute('id');
          for (const x of c.querySelectorAll('[id]')) x.removeAttribute('id');
          el0.after(c);
          el = c;
        }
        if (sel !== el) select(el);
        r0 = el.getBoundingClientRect();
        port = stickPort(el);
        near = lineUps(el);
        hover = null;
        dragging = { target: el, after: false };
        placing = true;
      }
      let dx = port.sideways ? ev.clientX - x0 : 0;
      let dy = ev.clientY - y0;
      if (ev.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      const want: Box = { x: r0!.left + dx, y: r0!.top + dy, w: r0!.width, h: r0!.height };
      const s = G.snapMove(want, near!.others, near!.frames, SNAP, !isNoSnap(ev));
      if (port.sideways) dx += s.dx;
      dy += s.dy;
      const at = stickAt(el, { x: r0!.left + dx, y: r0!.top + dy }, port);
      // (what lines it up across is left out where it moves only up and down)
      drawGuides(port.sideways ? s : { lines: s.lines.filter((l) => Math.abs(l.y1 - l.y2) < 0.5), gaps: s.gaps.filter((g) => g.vertical) });
      const r = el.getBoundingClientRect();
      if (Math.abs(r.top - at.y) > 1 || Math.abs(r.left - at.x) > 1) {
        const g = document.createElement('div');
        g.className = 'g ghost';
        Object.assign(g.style, { left: `${at.x}px`, top: `${at.y}px`, width: `${at.w}px`, height: `${at.h}px` });
        guidesEl.append(g);
      }
      pill(stickWords(el, port), { right: at.x + at.w, bottom: at.y + at.h });
      redraw();
    };
    const up = () => {
      removeEventListener('pointermove', move, true);
      removeEventListener('pointerup', up, true);
      removeEventListener('pointercancel', up, true);
      freeHeld = false;
      placing = false;
      clearGuides();
      sizeTag.style.display = 'none';
      dragging = null;
      redraw();
      if (!moved) return tap?.();
      dragged = true;
      setTimeout(() => (dragged = false), 0);
      changed();
    };
    freeHeld = true;
    addEventListener('pointermove', move, true);
    addEventListener('pointerup', up, true);
    addEventListener('pointercancel', up, true);
    return true;
  };
  /**
   * Dragging a placed part moves it where the pointer goes: snapped to the parts around it, its box and the page, with pink
   * guides and the distances on them (Alt, ⌘ on a Mac: no snapping; Shift: straight; Ctrl, ⌥ on a Mac: a copy is dragged
   * and the part stays). A tap with no move is the caller's (`tap`). False when the part is not placed (the caller moves it in the flow).
   */
  const freeMove = (e: PointerEvent, el0: Element, tap?: () => void): boolean => {
    if (!isPlaced(el0)) return false;
    if (getComputedStyle(el0).position === 'sticky') return stickMove(e, el0, tap);
    let el: HTMLElement = el0;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    let r0: DOMRect | null = null;
    let near: { others: Box[]; frames: Box[] } | null = null;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      if (!moved) {
        moved = true;
        finishEditing();
        remember();
        lastStyle = null;
        if (isCopyDrag(ev)) {
          const c = el0.cloneNode(true) as HTMLElement;
          c.removeAttribute('id');
          for (const x of c.querySelectorAll('[id]')) x.removeAttribute('id');
          el0.after(c);
          el = c;
        }
        if (sel !== el) select(el);
        r0 = el.getBoundingClientRect();
        near = lineUps(el);
        // (no hover frames over the parts it passes while it moves)
        hover = null;
        dragging = { target: el, after: false };
        placing = true;
      }
      let dx = ev.clientX - x0;
      let dy = ev.clientY - y0;
      if (ev.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      const want: Box = { x: r0!.left + dx, y: r0!.top + dy, w: r0!.width, h: r0!.height };
      if (near) {
        const s = G.snapMove(want, near.others, near.frames, SNAP, !isNoSnap(ev));
        dx += s.dx;
        dy += s.dy;
        drawGuides(s);
      }
      const r = placeAt(el, r0!.left + dx, r0!.top + dy);
      const c = near?.frames[0];
      pill(`${Math.round(r.left - (c?.x ?? 0))}, ${Math.round(r.top - (c?.y ?? 0))}`, r);
      redraw();
    };
    const up = () => {
      removeEventListener('pointermove', move, true);
      removeEventListener('pointerup', up, true);
      removeEventListener('pointercancel', up, true);
      freeHeld = false;
      placing = false;
      clearGuides();
      sizeTag.style.display = 'none';
      dragging = null;
      redraw();
      if (!moved) return tap?.();
      dragged = true;
      setTimeout(() => (dragged = false), 0);
      changed();
    };
    freeHeld = true;
    addEventListener('pointermove', move, true);
    addEventListener('pointerup', up, true);
    addEventListener('pointercancel', up, true);
    return true;
  };
  /** The arrow keys on a placed part: it moves by `dx`, `dy` pixels; a run of presses is one step to undo. */
  const nudge = (el: HTMLElement, dx: number, dy: number) => {
    const key = `nudge:${pathOf(el).join('.')}:${JSON.stringify(ctx)}`;
    if (!(lastStyle && lastStyle.key === key && Date.now() - lastStyle.at < 1200)) remember();
    lastStyle = { key, at: Date.now() };
    // (one that sticks: where it sticks moves, from where it sticks now)
    if (getComputedStyle(el).position === 'sticky') {
      const port = stickPort(el);
      const b = stuckBox(el, port);
      stickAt(el, { x: b.x + dx, y: b.y + dy }, port);
    } else {
      const r = el.getBoundingClientRect();
      placeAt(el, r.left + dx, r.top + dy);
    }
    changed();
  };

  // ---- resizing a part by its edges and corners ----------------------------------------------------------------------
  selBox.addEventListener('pointerdown', (e) => {
    const h = (e.composedPath()[0] as HTMLElement).dataset?.h;
    const el = sel as HTMLElement | null;
    if (!h || !el || el === document.body) return;
    e.preventDefault();
    e.stopPropagation();
    const r0 = el.getBoundingClientRect();
    // (what the part is like when the drag begins, as numbers: a computed style is live, it would follow what is written)
    const cs0 = (() => {
      const c = getComputedStyle(el);
      return {
        position: c.position,
        boxSizing: c.boxSizing,
        paddingLeft: c.paddingLeft,
        paddingRight: c.paddingRight,
        paddingTop: c.paddingTop,
        paddingBottom: c.paddingBottom,
        borderLeftWidth: c.borderLeftWidth,
        borderRightWidth: c.borderRightWidth,
        borderTopWidth: c.borderTopWidth,
        borderBottomWidth: c.borderBottomWidth,
        marginLeft: c.marginLeft,
        marginTop: c.marginTop,
        maxWidth: c.maxWidth,
        minWidth: c.minWidth,
        maxHeight: c.maxHeight,
        minHeight: c.minHeight,
      };
    })();
    const edges = { l: h.includes('w'), r: h.includes('e'), t: h.includes('n'), b: h.includes('s') };
    const corner = (edges.l || edges.r) && (edges.t || edges.b);
    const pic = el.tagName === 'IMG';
    const ratio = r0.width / (r0.height || 1);
    const placed = isPlaced(el) && cs0.position !== 'sticky';
    const num = (v: string) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0);
    // A part of the page's own kind of box: its size is the box's own (padding and border outside it), unless it says otherwise.
    const extraW = cs0.boxSizing === 'border-box' ? 0 : num(cs0.paddingLeft) + num(cs0.paddingRight) + num(cs0.borderLeftWidth) + num(cs0.borderRightWidth);
    const extraH = cs0.boxSizing === 'border-box' ? 0 : num(cs0.paddingTop) + num(cs0.paddingBottom) + num(cs0.borderTopWidth) + num(cs0.borderBottomWidth);
    const parentCs = el.parentElement ? getComputedStyle(el.parentElement) : null;
    const inFlex = !!parentCs && /flex/.test(parentCs.display);
    const column = !!parentCs && /column/.test(parentCs.flexDirection);
    const near = lineUps(el);
    const x0 = e.clientX;
    const y0 = e.clientY;
    remember();
    lastStyle = null;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      const dy = ev.clientY - y0;
      let box: Box = { x: r0.left, y: r0.top, w: r0.width, h: r0.height };
      if (edges.r) box.w = r0.width + dx;
      if (edges.l) box.w = r0.width - dx;
      if (edges.b) box.h = r0.height + dy;
      if (edges.t) box.h = r0.height - dy;
      box.w = Math.max(8, box.w);
      box.h = Math.max(8, box.h);
      // Shift (and a picture's corner) keeps its shape: the other measure follows.
      const keep = ev.shiftKey;
      const follow = (b: Box, by: 'x' | 'y') => {
        if (by === 'x') b.h = b.w / ratio;
        else b.w = b.h * ratio;
        if (edges.l) b.x = r0.right - b.w;
        if (edges.t) b.y = r0.bottom - b.h;
      };
      if (keep) {
        if (corner) {
          const k = Math.max(box.w / r0.width, box.h / r0.height);
          box.w = r0.width * k;
          box.h = r0.height * k;
        } else if (edges.l || edges.r) box.h = box.w / ratio;
        else box.w = box.h * ratio;
      }
      if (edges.l) box.x = r0.right - box.w;
      if (edges.t) box.y = r0.bottom - box.h;
      if (!isNoSnap(ev)) {
        const by = keep ? (edges.l || edges.r ? 'x' : 'y') : null;
        const s = G.snapSize(box, edges, near.others, near.frames, SNAP, by ?? 'xy');
        box = s.box;
        if (by) follow(box, by);
        drawGuides(s);
      } else clearGuides();
      const props: Record<string, string | null> = {};
      const w = Math.max(0, Math.round(box.w - extraW));
      const hh = Math.max(0, Math.round(box.h - extraH));
      if (edges.l || edges.r) {
        props.width = `${w}px`;
        // A cell of a flex row keeps the size it is given (its flex settings would shrink or stretch it otherwise).
        if (inFlex && !column) props.flex = `0 0 ${w}px`;
        if (parseFloat(cs0.maxWidth) < box.w) props['max-width'] = 'none';
        if (parseFloat(cs0.minWidth) > w) props['min-width'] = '0px';
      }
      if (edges.t || edges.b) {
        props.height = pic && corner && !keep ? 'auto' : `${hh}px`;
        if (inFlex && column) props.flex = `0 0 ${hh}px`;
        if (parseFloat(cs0.maxHeight) < box.h) props['max-height'] = 'none';
        if (parseFloat(cs0.minHeight) > hh) props['min-height'] = '0px';
      } else if (keep && !pic) props.height = `${hh}px`;
      else if (keep && pic) props.height = 'auto';
      // A side that moves moves the part: by its offsets where it is placed, by its margin where the page puts it.
      if (!placed) {
        if (edges.l) props['margin-left'] = `${Math.round(num(cs0.marginLeft) + (box.x - r0.left))}px`;
        if (edges.t) props['margin-top'] = `${Math.round(num(cs0.marginTop) + (box.y - r0.top))}px`;
      }
      selfStyle(el, props);
      if (placed && (edges.l || edges.t)) placeAt(el, edges.l ? box.x : el.getBoundingClientRect().left, edges.t ? box.y : el.getBoundingClientRect().top);
      moved = true;
      placing = true;
      const r = el.getBoundingClientRect();
      pill(`${Math.round(r.width)} × ${Math.round(r.height)}`, r);
      redraw();
    };
    const up = () => {
      removeEventListener('pointermove', move, true);
      removeEventListener('pointerup', up, true);
      removeEventListener('pointercancel', up, true);
      sizeTag.style.display = 'none';
      clearGuides();
      placing = false;
      redraw();
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
  /** The bar's ⋮⋮: a placed part is moved where the pointer goes; any other is dragged to another place in the page's flow. */
  function dragStart(e: PointerEvent) {
    const el = sel;
    if (!el || el === document.body) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const handle = (e.composedPath()[0] as Element).closest?.('button')?.getBoundingClientRect();
    const tap = () => handle && void W.act('menu', { at: { left: handle.left, top: handle.top, bottom: handle.bottom } });
    if (freeMove(e, el, tap)) return;
    let moved = false;
    let copy = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
      moved = true;
      copy = isCopyDrag(ev);
      let t = under(ev.clientX, ev.clientY);
      // Not into itself; the page's top level parts when pointing at the page.
      while (t && (el.contains(t) || t === root)) t = t.parentElement;
      if (!t || t === document.body || t === root) {
        dragging = null;
        drop.style.display = 'none';
        return;
      }
      const r = t.getBoundingClientRect();
      // Beside others on its line (a flex row, a grid's row, words running on), the line is vertical: before or after by the side.
      const row = sideBySide(t);
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
      if (!moved) return tap();
      if (!d || !el.isConnected) return;
      remember();
      let part: Element = el;
      if (copy) {
        part = el.cloneNode(true) as Element;
        part.removeAttribute('id');
        for (const x of part.querySelectorAll('[id]')) x.removeAttribute('id');
      }
      if (d.after) d.target.after(part);
      else d.target.before(part);
      sel = part;
      changed();
    };
    addEventListener('pointermove', move, true);
    addEventListener('pointerup', up, true);
    addEventListener('pointercancel', up, true);
  }

  // ---- the page's own data, for its databases: kept by the app (the page's storage), asked by message ----------
  const storeWaits = new Map<number, [(v: unknown) => void, (e: Error) => void]>();
  let storeSeq = 0;
  const storeAsk = (op: 'get' | 'set', key: string, value?: unknown) =>
    new Promise<unknown>((ok, fail) => {
      const id = ++storeSeq;
      storeWaits.set(id, [ok, fail]);
      send({ type: 'wa-ed-store', id, op, key, value });
      // An app of before (or none) answers nothing: the database shows what its block says, and keeps nothing.
      setTimeout(() => storeWaits.has(id) && (storeWaits.delete(id), fail(new Error('No answer'))), 10_000);
    });
  const storeAnswer = (a: any) => {
    const w = storeWaits.get(Number(a?.id));
    if (!w) return;
    storeWaits.delete(Number(a.id));
    if (typeof a.error === 'string') w[1](new Error(a.error));
    else w[0](a.value ?? null);
  };
  const dbStore = { get: (k: string) => storeAsk('get', k), set: (k: string, v: unknown) => storeAsk('set', k, v) };
  /** Something asked of the app that answers later (an AI column's cell, a file kept for a database): `answer` brings it. */
  const appWaits = new Map<number, [(v: any) => void, (e: Error) => void]>();
  const appAsk = (type: string, payload: Record<string, unknown>, wait = 180_000) =>
    new Promise<any>((ok, fail) => {
      const id = ++storeSeq;
      appWaits.set(id, [ok, fail]);
      send({ type, id, ...payload });
      setTimeout(() => appWaits.has(id) && (appWaits.delete(id), fail(new Error('The app did not answer'))), wait);
    });
  const appAnswer = (a: any) => {
    const w = appWaits.get(Number(a?.id));
    if (!w) return;
    appWaits.delete(Number(a.id));
    if (typeof a.error === 'string') w[1](new Error(a.error));
    else w[0](a.value ?? null);
  };

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
    copy: (html, name) => copyOut(html, name),
    contextRows: (t, words) => contextRows(t, words),
    command: (a, arg) => act(a, arg),
    freeMove,
    moving: () => freeHeld,
    sideBySide,
    pasteWords: (html) => G.pasteWords(html),
    linkAddress: (raw) => G.linkAddress(raw),
    // (asked once, by the paste that follows: a later paste is a plain one again)
    plainPaste: (used = true) => {
      const on = Date.now() - plainAt < 1500;
      // (the paste with nothing in it that a Ctrl+Shift+V raises on its own does not use it up)
      if (used) plainAt = 0;
      return on;
    },
    canAsk: () => canAskAgent,
    code: codeColours(),
    canComment: () => canComment,
    db: pageDatabases(),
    store: dbStore,
    dbHooks: {
      ai: (ask) => appAsk('wa-ed-db-ai', { ask }),
      download: (name, mime, text) => send({ type: 'wa-ed-download', name, mime, text }),
      upload: (file) => appAsk('wa-ed-upload', { file }, 600_000),
    },
    extras,
  };
  // A paste event (Ctrl+V of the part copied waits for it, below): any one, a picture's too, which writing.ts takes.
  let pasteTimer = 0;
  addEventListener('paste', () => clearTimeout(pasteTimer), true);
  // Its listeners come before the editor's own, so the keys it takes (Enter, Backspace, "/"…) go to it first.
  const W: Writing = writing(core);

  // ---- the clipboard: parts copied are on the system's too, words pasted keep their look ---------------------------------
  /** When "paste without formatting" was asked for (Ctrl+Shift+V, the menu's): the paste that follows brings only words. */
  let plainAt = 0;
  /** Wraps parts copied on the system clipboard, so that this editor knows them again (in another app they are an ordinary block of HTML). */
  const PARTS = 'data-hydor-parts';
  let sysCopy: { html: string; text: string } | null = null;
  /** Whether the part copied last reached the system clipboard (else the one kept in this page is what a paste brings). */
  let clipViaSystem = true;
  /**
   * A part (or several) copied: kept in the page for pasting, and put on the system clipboard as HTML and as words, through the
   * copy event this raises (the frame may not read or write the clipboard on its own, but a copy the person asked for is allowed).
   * The app hears of it too, to paste in other pages, and to write the clipboard itself where the frame could not.
   */
  const copyOut = (html: string, name: string) => {
    clip = html;
    const t = document.createElement('template');
    t.innerHTML = html;
    const text = [...t.content.children].map((c) => (c.textContent ?? '').replace(/​/g, '').trim()).join('\n');
    sysCopy = { html: `<div ${PARTS}="1">${html}</div>`, text };
    let ok = false;
    // A copy needs something selected to raise its event: a one-character mark out of sight stands in (taken away again at once).
    const sel0 = getSelection();
    const was = sel0 && sel0.rangeCount ? sel0.getRangeAt(0).cloneRange() : null;
    const mark = document.createElement('span');
    mark.setAttribute('data-n-own', '');
    mark.setAttribute('style', 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;user-select:text;-webkit-user-select:text');
    mark.textContent = '.';
    document.body.append(mark);
    try {
      const r = document.createRange();
      r.selectNodeContents(mark);
      sel0?.removeAllRanges();
      sel0?.addRange(r);
      ok = document.execCommand('copy');
    } catch {}
    mark.remove();
    sel0?.removeAllRanges();
    if (was && editing) sel0?.addRange(was);
    sysCopy = null;
    clipViaSystem = ok;
    send({ type: 'wa-ed-copied', html, name, text, system: ok });
  };
  addEventListener(
    'copy',
    (e) => {
      if (!sysCopy || !e.clipboardData) return;
      e.clipboardData.setData('text/html', sysCopy.html);
      e.clipboardData.setData('text/plain', sysCopy.text);
      e.preventDefault();
    },
    true,
  );
  /** The parts in HTML that this editor copied (its wrapper), else null. */
  const partsOf = (html: string): string | null => {
    if (!html.includes(PARTS)) return null;
    const t = document.createElement('template');
    t.innerHTML = html;
    const w = t.content.querySelector(`[${PARTS}]`);
    return w ? w.innerHTML : null;
  };
  /**
   * What the system clipboard holds, pasted into the page after the part picked (nothing is being written): parts this editor
   * copied as they were, other HTML or words as blocks of words. False when there was nothing of either.
   */
  const pasteInPage = (html: string, text: string, plain: boolean): boolean => {
    const parts = plain ? null : partsOf(html);
    if (parts) {
      act('paste', { html: parts, where: 'after' });
      return true;
    }
    // The part copied in this page, when it could not reach the clipboard (what is there is older).
    if (!clipViaSystem && clip) return (act('paste'), true);
    let pieces = html && !plain ? G.pasteWords(html) : [];
    if (!pieces.length && text.trim())
      pieces = text
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => ({ kind: '' as const, html: l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }));
    if (!pieces.length) return false;
    W.act('pastePieces', { pieces, where: 'after' });
    return true;
  };

  // ---- the right-click menu: the block menu of writing.ts, with what is under the pointer ---------------------------------
  /**
   * What a right-click on `t` (or a block's menu) adds at the top of the block menu: while words are written, their own
   * commands (cut, copy, paste, select all, link, bold, italic); else a link's, a picture's, a placed part's. The rows are
   * data (an icon of the writing's, words from the labels, what to do): writing.ts draws them with its own menu, so Turn
   * into, Colour, the language of code and the rest stay one menu, which works the same from the ⋮⋮ on a phone.
   */
  const contextRows = (t: Element | null, words: boolean): CtxRow[] => {
    const rows: CtxRow[] = [];
    if (words && editing) {
      const s = getSelection();
      const has = !!s && !s.isCollapsed;
      const doIt = (c: string) => () => {
        editing?.focus({ preventScroll: true });
        noteTyping();
        document.execCommand(c, false);
        redraw();
      };
      rows.push(
        { icon: 'cut', label: L('cut', 'Cut'), keys: 'Ctrl+X', off: !has, run: doIt('cut') },
        { icon: 'copy', label: L('copy', 'Copy'), keys: 'Ctrl+C', off: !has, run: () => (editing?.focus({ preventScroll: true }), void document.execCommand('copy')) },
        { icon: 'paste', label: L('paste', 'Paste'), keys: 'Ctrl+V', run: () => act('pasteMenu', { plain: false }) },
        { icon: 'pastePlain', label: L('pastePlain', 'Paste without formatting'), keys: 'Ctrl+Shift+V', run: () => act('pasteMenu', { plain: true }) },
        { icon: 'selectAll', label: L('selectAll', 'Select all'), keys: 'Ctrl+A', run: () => (editing?.focus({ preventScroll: true }), void document.execCommand('selectAll')) },
        '-',
        { icon: 'link', label: L('link', 'Link'), keys: 'Ctrl+K', off: !has, run: () => (rtb.querySelector('[data-c=link]') as HTMLElement).click() },
        { icon: 'bold', label: L('bold', 'Bold'), keys: 'Ctrl+B', run: doIt('bold') },
        { icon: 'italic', label: L('italic', 'Italic'), keys: 'Ctrl+I', run: doIt('italic') },
      );
      return rows;
    }
    if (!t || t === document.body || t === root) {
      return [
        { icon: 'paste', label: L('paste', 'Paste'), keys: 'Ctrl+V', run: () => act('pasteMenu', { plain: false }) },
        { icon: 'selectAll', label: L('selectParts', 'Select all parts'), keys: 'Ctrl+A', run: () => act('selectAll') },
      ];
    }
    const a = t.closest('a[href]') as HTMLAnchorElement | null;
    if (a && !a.classList.contains('n-btn') && !a.matches('.n-file,.n-bookmark,.n-video') && !isUi(a)) {
      rows.push(
        { icon: 'external', label: L('openLink', 'Open the link'), run: () => void open(a.href, '_blank', 'noopener') },
        {
          icon: 'edit',
          label: L('editLink', 'Change the link'),
          run: () => {
            if (wordy(a)) {
              startEditing(a, { all: true });
              setTimeout(() => (rtb.querySelector('[data-c=link]') as HTMLElement).click(), 0);
            } else select(a);
          },
        },
        { icon: 'unlink', label: L('removeLink', 'Remove the link'), run: () => (select(a), act('unlink')) },
      );
    }
    const img = t.tagName === 'IMG' ? t : (sel?.tagName === 'IMG' ? sel : null);
    if (img) {
      rows.push(
        { icon: 'picture', label: L('replacePicture', 'Replace the picture'), run: () => (select(img), void W.act('replacePicture', null)) },
        { icon: 'media', label: L('mediaTip', 'Edit picture'), run: () => (select(img), send({ type: 'wa-ed-design', what: 'action', action: 'editPicture' })) },
        { icon: 'alt', label: L('pictureDesc', 'Description'), run: () => (select(img), send({ type: 'wa-ed-focus', field: 'alt' })) },
      );
    }
    // Where it sits: free to be dragged, or where the page puts it.
    const part = sel && sel !== document.body ? sel : null;
    if (part && part instanceof HTMLElement) {
      if (rows.length) rows.push('-');
      if (isPlaced(part)) {
        rows.push(
          { icon: 'flow', label: L('placeFlow', 'Back in the flow'), run: () => act('place', 'flow') },
          { icon: 'front', label: L('bringForward', 'Bring forward'), run: () => act('layer', 'front') },
          { icon: 'back', label: L('sendBackward', 'Send backward'), run: () => act('layer', 'back') },
        );
      } else rows.push({ icon: 'move', label: L('placeFree', 'Place freely'), run: () => act('place', 'free') });
    }
    return rows;
  };
  /** A right-click (or the menu key) on `target` at (x, y): picks the part under it (words written stay so when it is on them), and opens the menu. */
  const openContext = (target: Element, x: number, y: number) => {
    const words = !!editing && editing.contains(target);
    if (!words) {
      const part = partAt(target);
      if (editing) finishEditing();
      // Several picked: a right-click on one of them keeps them.
      const many = W.picked();
      if (!(many.length > 1 && many.some((p) => p === part || p.contains(part)))) select(part === root ? document.body : part);
    }
    W.act('context', { at: { left: x, top: y, bottom: y }, target, words });
  };

  // ---- the page's own events: held, except while words are being changed -----------------------------------
  const fromUi = (e: Event) => e.composedPath().includes(host);
  /** The part a press is on: a code block for a word its colours wrap (writing.ts colours code as it shows; a plain block's <code>). */
  const partAt = (t: Element) => (t.closest?.('pre.n-code') as Element | null) ?? (t.matches?.(COLOURED) ? t.parentElement! : t);
  /** A database's own cells, buttons and menus (shared/page-db.ts): its presses and keys are its own, not the editor's. */
  const fromDb = (e: Event) => e.composedPath().some((x) => x instanceof Element && x.hasAttribute('data-db-ui'));
  const inEditing = (e: Event) => !!editing && e.target instanceof Node && editing.contains(e.target);
  const hold = (e: Event) => {
    if (fromUi(e) || inEditing(e) || fromDb(e)) return;
    e.preventDefault();
    e.stopPropagation();
  };
  addEventListener(
    'pointerdown',
    (e) => {
      // A press anywhere but in a database takes the caret out of its cell (held presses move no focus): the keys that
      // follow (Delete, Ctrl+D, arrows) are for the part picked, not for the cell written in before.
      if (!fromDb(e)) {
        const a = document.activeElement;
        if (a?.matches?.('.n-db')) ((a.shadowRoot?.activeElement ?? a) as HTMLElement).blur();
      }
      if (fromUi(e) || inEditing(e) || fromDb(e)) return;
      e.preventDefault();
      // Held, the press would not give the page the keys (Delete, Esc, arrows).
      window.focus();
      // A long press with a finger is a right-click (a phone has none): the part's menu. Not while words are written (a long press there selects words).
      if (e.pointerType === 'touch' && !editing) {
        const x = e.clientX;
        const y = e.clientY;
        const target = e.target as Element;
        const cancel = () => {
          clearTimeout(pressTimer);
          removeEventListener('pointermove', away, true);
          removeEventListener('pointerup', cancel, true);
          removeEventListener('pointercancel', cancel, true);
          removeEventListener('scroll', cancel, true);
        };
        const away = (m: PointerEvent) => Math.hypot(m.clientX - x, m.clientY - y) > 10 && cancel();
        pressTimer = window.setTimeout(() => {
          cancel();
          longAt = Date.now();
          // The click that ends the press is not one on the page.
          dragged = true;
          setTimeout(() => (dragged = false), 800);
          openContext(target, x, y);
        }, 520);
        addEventListener('pointermove', away, true);
        addEventListener('pointerup', cancel, true);
        addEventListener('pointercancel', cancel, true);
        addEventListener('scroll', cancel, true);
      }
      // A placed part is dragged where it is: the one picked, or the one pressed (a finger scrolls the page: its ⋮⋮ moves it).
      if (e.button === 0 && e.pointerType !== 'touch' && !editing) {
        const t = partAt(e.target as Element);
        const el = sel && sel !== document.body && sel.contains(t) && isPlaced(sel) ? sel : isPlaced(t) ? t : null;
        if (el && W.picked().length < 2) freeMove(e, el);
      }
    },
    true,
  );
  addEventListener(
    'click',
    (e) => {
      if (fromUi(e) || inEditing(e) || fromDb(e)) return;
      hold(e);
      // The click that ends a drag is not one on the page.
      if (dragged) return;
      const t = partAt(e.target as Element);
      // A second click (or tap) on the picked part changes its words: phones have no double tap here.
      if (t === sel && wordy(t)) return startEditing(t, { x: e.clientX, y: e.clientY });
      select(t);
    },
    true,
  );
  addEventListener(
    'dblclick',
    (e) => {
      if (fromUi(e) || inEditing(e) || fromDb(e)) return;
      hold(e);
      startEditing(partAt(e.target as Element), { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY });
    },
    true,
  );
  for (const t of ['submit', 'auxclick', 'dragstart']) addEventListener(t, hold, true);
  // A right-click picks the part under it and opens its menu (Shift+right-click leaves the browser's own: spelling, the address of a link…).
  addEventListener(
    'contextmenu',
    (e) => {
      if (fromDb(e) || e.shiftKey) return;
      e.preventDefault();
      e.stopPropagation();
      // (a phone that raises it after a long press as well: the menu is open already)
      if (fromUi(e) || Date.now() - longAt < 1200) return;
      openContext(e.target as Element, e.clientX, e.clientY);
    },
    true,
  );
  // Ctrl+wheel zooms the page's view (the app's, beside the device buttons), not the whole app.
  addEventListener(
    'wheel',
    (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      send({ type: 'wa-ed-zoom', op: e.deltaY < 0 ? 'in' : 'out' });
    },
    { passive: false, capture: true },
  );
  addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType === 'touch' || dragging) return;
      const t = fromUi(e) ? null : partAt(e.target as Element);
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
  // The frame grew or shrank (on a phone, the drawer under it opened as a part was picked): the part picked, or the words
  // being written, stay in sight rather than ending up under the frame's new edge.
  let resizeTimer = 0;
  addEventListener('resize', () => {
    redraw();
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      const el = editing ?? sel;
      if (!el || el === document.body || !el.isConnected) return;
      const s = editing ? getSelection() : null;
      const at = s && s.rangeCount ? s.getRangeAt(0).getBoundingClientRect() : null;
      const r = at && (at.height || at.width) ? at : el.getBoundingClientRect();
      if (r.bottom > innerHeight) scrollBy(0, Math.min(r.bottom - innerHeight + 16, r.top - 16));
      else if (r.top < 0) scrollBy(0, r.top - 16);
    }, 60);
  });
  // The page grows or shrinks by itself too (a stylesheet or a picture that loads, a database drawn once its rows come):
  // what is drawn over it follows, and the app hears the picked part's size as it is now.
  let sizeTimer = 0;
  new ResizeObserver(() => {
    redraw();
    clearTimeout(sizeTimer);
    sizeTimer = window.setTimeout(() => sel && !editing && tell(), 150);
  }).observe(root);
  document.addEventListener('selectionchange', () => editing && redraw());
  addEventListener(
    'focusout',
    (e) => {
      // Not when the bar's address field takes the focus.
      if (editing && e.target === editing) setTimeout(() => editing && document.activeElement !== editing && !rtb.classList.contains('linking') && finishEditing(), 0);
    },
    true,
  );
  // Pasted words are writing.ts's (it keeps bold, italic, links, headings and lists from pasted HTML, drops all else); what it leaves
  // goes in as plain words. With no words being written, what the clipboard holds goes after the part picked: the part copied as it
  // was, or other HTML and words as blocks (a picture pasted is writing.ts's).
  addEventListener(
    'paste',
    (e) => {
      if (fromDb(e)) return;
      if (!inEditing(e)) {
        clearTimeout(pasteTimer);
        if (!editing && sel) {
          const html = e.clipboardData?.getData('text/html') ?? '';
          const text = e.clipboardData?.getData('text/plain') ?? '';
          const plain = Date.now() - plainAt < 1500;
          if (html || text) plainAt = 0;
          if (pasteInPage(html, text, plain)) e.preventDefault();
          else if (clip) {
            e.preventDefault();
            act('paste');
          }
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
      if (fromUi(e) || e.isComposing || e.keyCode === 229) return;
      // (Ctrl+S saves from a database's cell too: its other keys are its own)
      if (mod && k.toLowerCase() === 's') {
        e.preventDefault();
        finishEditing();
        return send({ type: 'wa-ed-save' });
      }
      if (fromDb(e)) return;
      // Zoom the view of the page (the app's zoom, beside the device buttons), not the whole app.
      if (mod && !e.altKey && (k === '=' || k === '+' || k === '-' || k === '_' || k === '0')) {
        e.preventDefault();
        return send({ type: 'wa-ed-zoom', op: k === '0' ? 'fit' : k === '-' || k === '_' ? 'out' : 'in' });
      }
      // Find and replace in the page's words (the app's bar).
      if (mod && !e.altKey && !e.shiftKey && (k.toLowerCase() === 'f' || k.toLowerCase() === 'h')) {
        e.preventDefault();
        return send({ type: 'wa-ed-find', replace: k.toLowerCase() === 'h' });
      }
      if (mod && e.shiftKey && k.toLowerCase() === 'v') plainAt = Date.now();
      // The menu key (and Shift+F10): the block menu, at the part picked or the caret.
      if (k === 'ContextMenu' || (k === 'F10' && e.shiftKey)) {
        e.preventDefault();
        const el = editing ?? sel;
        if (!el || !el.isConnected) return;
        const s = editing ? getSelection() : null;
        const caret = s && s.rangeCount ? s.getRangeAt(0).getBoundingClientRect() : null;
        const r = caret && (caret.height || caret.width) ? caret : el.getBoundingClientRect();
        return openContext(editing ? editing : el, Math.max(4, r.left), Math.max(4, r.bottom));
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
      if (mod && k.toLowerCase() === 'v' && clip && sel) {
        // The paste event comes next where the browser sends one (with a picture, say: writing.ts takes it); Safari
        // sends none while nothing editable has the focus, so the part copied goes in after a moment unless one came.
        clearTimeout(pasteTimer);
        pasteTimer = window.setTimeout(() => act('paste'), 80);
        return;
      }
      // Every part of the page picked: Delete takes them out, one step to undo.
      if (mod && !e.shiftKey && k.toLowerCase() === 'a') {
        e.preventDefault();
        return act('selectAll');
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
      // A placed part moves with the arrows, a pixel (Shift: ten): the part beside it is picked only where it is not placed. One
      // that sticks when scrolled moves up and down (where it sticks); left and right too only where its box scrolls sideways.
      if (!mod && /^Arrow/.test(k) && isPlaced(sel) && W.picked().length < 2 && (k === 'ArrowUp' || k === 'ArrowDown' || getComputedStyle(sel).position !== 'sticky' || stickPort(sel).sideways)) {
        e.preventDefault();
        const n = e.shiftKey ? 10 : 1;
        return act('nudge', { dx: k === 'ArrowLeft' ? -n : k === 'ArrowRight' ? n : 0, dy: k === 'ArrowUp' ? -n : k === 'ArrowDown' ? n : 0 });
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

  // ---- find and replace in the page's words (the app's find bar asks; the matches are marked here) ----------------------------
  type FindOpts = { matchCase: boolean; wholeWord: boolean; regex: boolean };
  /** A match: the words it covers in each text node (from, to), the range over them, and what a regular expression's groups say. */
  type FindHit = { parts: { node: Text; s: number; e: number }[]; range: Range; m: RegExpExecArray };
  let finds: FindHit[] = [];
  let findNow = -1;
  /** What is being looked for, kept so that the marks follow the page as it changes. */
  let findAsk: { query: string; opts: FindOpts } | null = null;
  let findTimer = 0;
  const findRe = (query: string, o: FindOpts): RegExp | null => {
    if (!query) return null;
    let src = o.regex ? query : query.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
    if (o.wholeWord) src = `(?<![\\p{L}\\p{N}_])(?:${src})(?![\\p{L}\\p{N}_])`;
    const flags = o.matchCase ? 'g' : 'gi';
    try {
      return new RegExp(src, `${flags}u`);
    } catch {
      if (o.wholeWord) return null;
      try {
        return new RegExp(src, flags);
      } catch {
        return null;
      }
    }
  };
  /** A regular expression's replacement with $1…$99, $&, $<name> and $$ put in from the match. */
  const expandFind = (rep: string, m: RegExpExecArray) =>
    rep.replace(/\$(\$|&|\d{1,2}|<([^>]+)>)/g, (all, what: string, name?: string) => {
      if (what === '$') return '$';
      if (what === '&') return m[0];
      if (name !== undefined) return m.groups?.[name] ?? '';
      const n = Number(what);
      if (n > 0 && n < m.length) return m[n] ?? '';
      return all;
    });
  /** Where text is not the page's words: the editor's own parts, scripts, styles, drawings. */
  const NOT_WORDS = 'script,style,template,noscript,textarea,svg,head,[data-n-own],n-editor-ui';
  /** Every match of the query in the page's words, block by block (a match may run through bold or a link, not from one block into the next). */
  const scanFind = (query: string, o: FindOpts): FindHit[] => {
    const re = findRe(query, o);
    if (!re) return [];
    const groups = new Map<Element, { node: Text; start: number }[]>();
    const blocks = new Map<Element, Element>();
    const blockOf = (p: Element) => {
      let x: Element | null = p;
      while (x && x !== document.body) {
        const d = getComputedStyle(x).display;
        if (!d.startsWith('inline') && d !== 'contents') return x;
        x = x.parentElement;
      }
      return document.body;
    };
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode() as Text | null; n; n = w.nextNode() as Text | null) {
      const p = n.parentElement;
      if (!n.data || !p || p.closest(NOT_WORDS)) continue;
      let b = blocks.get(p);
      if (!b) blocks.set(p, (b = blockOf(p)));
      const g = groups.get(b);
      if (g) g.push({ node: n, start: 0 });
      else groups.set(b, [{ node: n, start: 0 }]);
    }
    const out: FindHit[] = [];
    for (const g of groups.values()) {
      let text = '';
      for (const x of g) {
        x.start = text.length;
        text += x.node.data;
      }
      re.lastIndex = 0;
      for (let m = re.exec(text); m && out.length < 5000; m = re.exec(text)) {
        if (!m[0]) {
          re.lastIndex = m.index + 1;
          continue;
        }
        const s = m.index;
        const e = s + m[0].length;
        const parts: FindHit['parts'] = [];
        for (const x of g) {
          const a = Math.max(s, x.start);
          const z = Math.min(e, x.start + x.node.data.length);
          if (z > a) parts.push({ node: x.node, s: a - x.start, e: z - x.start });
        }
        if (!parts.length) continue;
        const range = document.createRange();
        range.setStart(parts[0].node, parts[0].s);
        range.setEnd(parts[parts.length - 1].node, parts[parts.length - 1].e);
        out.push({ parts, range, m });
      }
    }
    return out;
  };
  /** The marks: every match tinted, the one on view stronger (the CSS highlights, which change no part of the page); the app hears how many and which. */
  const paintFind = (scroll: boolean) => {
    const css = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
    const Hl = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
    if (css && Hl) {
      css.set('n-find', new Hl(...finds.filter((_, i) => i !== findNow).map((h) => h.range)));
      css.set('n-find-now', new Hl(...(findNow >= 0 ? [finds[findNow].range] : [])));
    } else if (findNow >= 0) {
      const s = getSelection();
      s?.removeAllRanges();
      s?.addRange(finds[findNow].range);
    }
    if (scroll && findNow >= 0) finds[findNow].range.startContainer.parentElement?.scrollIntoView({ block: 'center' });
    send({ type: 'wa-ed-found', count: finds.length, index: findNow });
  };
  const runFind = (query: string, opts: FindOpts, step = 0) => {
    findAsk = query ? { query, opts } : null;
    finds = findAsk ? scanFind(query, opts) : [];
    findNow = !finds.length ? -1 : step ? (Math.max(findNow, 0) + step + finds.length) % finds.length : Math.min(Math.max(findNow, 0), finds.length - 1);
    paintFind(!!step || !!query);
  };
  const clearFind = () => {
    findAsk = null;
    finds = [];
    findNow = -1;
    const css = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
    css?.delete('n-find');
    css?.delete('n-find-now');
  };
  /**
   * Puts `rep` in the place of the match on view, or of every match: in the words only (a part's tags, classes and addresses are never
   * touched). One step to undo, whichever. A match that runs through bold or a link puts the new words in its first piece, and takes the rest out.
   */
  const replaceFind = (query: string, opts: FindOpts, rep: string, all: boolean) => {
    finishEditing();
    const list = scanFind(query, opts);
    const chosen = all ? list : list.slice(Math.max(0, findNow), Math.max(0, findNow) + 1);
    if (!chosen.length) return;
    remember();
    const literal = !opts.regex;
    // From the last to the first, so that the places of the ones before are still right.
    for (const h of [...chosen].reverse()) {
      const text = literal ? rep : expandFind(rep, h.m);
      h.parts.forEach((p, i) => {
        const d = p.node.data;
        // The first piece keeps what comes before the match and takes the new words, the last keeps what comes after; those between go.
        p.node.data = (i === 0 ? d.slice(0, p.s) + text : '') + (i === h.parts.length - 1 ? d.slice(p.e) : '');
      });
    }
    changed();
    const keep = findNow;
    findAsk = { query, opts };
    finds = scanFind(query, opts);
    findNow = !finds.length ? -1 : all ? 0 : Math.min(Math.max(keep, 0), finds.length - 1);
    paintFind(true);
  };

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
    if (d.cmd === 'store') return storeAnswer(d.arg);
    if (d.cmd === 'answer') return appAnswer(d.arg);
    act(String(d.cmd), d.arg);
  });

  const ready = () => {
    // Taps don't zoom, a long press doesn't select the page's words (only words being changed).
    const own = document.createElement('style');
    own.setAttribute('data-n-own', '');
    own.textContent = `html{touch-action:manipulation}body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}[data-n-ce]{-webkit-user-select:text;user-select:text;outline:none}::highlight(n-find){background-color:#ffd54a99;color:inherit}::highlight(n-find-now){background-color:#ff9f1c;color:#111}${W.css}`;
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
    W.ready();
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

/** The editor, with the writing it hands its insides to, the code blocks' colours and the databases (all run in the page, as one script). */
export const EDITOR_SRC = scriptSafe(`(cfg) => (${editor.toString()})(cfg, ${writing.toString()}, ${codeColours.toString()}, ${pageDatabases.toString()}, ${geometry.toString()}, [${writingAi.toString()}, ${writingBlocks.toString()}])`);
