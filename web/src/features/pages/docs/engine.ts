// The documents editor's engine: the document drawn into one contentEditable element (shared/docs.ts' blockHtml,
// the same HTML the document's own page shows), the browser's selection read as places in the model and set from
// them (ops.ts), and every edit made to the model and drawn again: Enter, Backspace and Delete across blocks,
// typing over a selection, pasting and dropping, lists, styles, spacing, tables (merged and filled cells), pictures,
// equations, a table of contents, comments' marks, replacing what was found, words' case and the format painter. The
// browser itself only types and deletes within one block's words (so spelling, accents and phone keyboards work as
// they do anywhere), and those words are read back after each change; anything else it would do to the page is
// stopped and done here. An equation among words is one thing to the caret, never words to type in. Undo and redo go
// back and forth through the model's versions. In Suggesting, every edit goes through the model as a suggestion
// (suggest.ts): the browser types nothing itself then, but for an input method's words, made a suggestion afterwards.
// An agent's version being written shows in place of the document (preview), drawn only where it differs, the
// document and its history kept underneath.
import {
  isAtom,
  asAccepted,
  blockHtml,
  CALLOUT,
  docMarkdown,
  htmlBlocks,
  htmlRuns,
  listInfo,
  normalizeBlocks,
  PAPERS,
  runsHtml,
  resolveSuggestion,
  runsText,
  tocEntries,
  type Align,
  type Band,
  type Block,
  type Doc,
  type ImageBlock,
  type ListKind,
  type Look,
  type MathDraw,
  type ParaBlock,
  type ParaStyle,
  type Run,
  type Spacing,
  type TocEntry,
} from '@shared/docs';
import { docRefs, refsKey, type Refs } from '@shared/doc-refs';
import * as ops from './ops';
import type { Pos, TableOp } from './ops';
import { CUT, htmlWithoutCuts } from './paging';
import * as sg from './suggest';

export interface Sel {
  a: Pos;
  f: Pos;
}

type Flag = 'b' | 'i' | 'u' | 's' | 'code' | 'sup' | 'sub';

/** What the toolbar and the page around show of where the caret is. */
export interface SelState {
  collapsed: boolean;
  /** The block the selection starts in, and where it is. */
  block: Block | null;
  index: number;
  /** In a table: its cell (row, column). */
  cell: [number, number] | null;
  /** How the words there look (all of them, for a stretch). */
  look: Look;
  on: Record<Flag, boolean>;
  style: ParaStyle;
  list: ListKind | null;
  align: Align;
  /** A picture, a line across or a page break picked. */
  picked: Block | null;
  /** The words picked (up to 2000 characters). */
  text: string;
  /** The link the caret is in. */
  link: string | null;
  /** The comments on the words at the caret (or picked). */
  cm: string[];
  /** The suggested changes at the caret (or among the words picked). */
  sg: string[];
  /** Edits are suggestions. */
  suggesting: boolean;
  /** In a table, from one cell to another: the cells picked. */
  cells: { b: string; a: [number, number]; f: [number, number] } | null;
  canUndo: boolean;
  canRedo: boolean;
}

/** What a click on a thing of its own in the page asks the editor for (a footnote's mark, a citation or a cross-reference: `mark`, where it starts; a table's caption: `caption`). */
export type AtomClick =
  | { kind: 'math'; id: string }
  | { kind: 'mathRun'; at: Pos; tex: string }
  | { kind: 'icon'; id: string }
  | { kind: 'mark'; k: 'fn' | 'cite' | 'xref'; at: Pos; t: string; rect: DOMRect }
  | { kind: 'caption'; id: string };

/** The look and the paragraph's style the format painter carries to the next words picked. */
export interface Paint {
  look: Look;
  para: { style: ParaStyle; align?: Align; lh?: number; sb?: number; sa?: number } | null;
  /** Stays on until Esc (a double click). */
  sticky: boolean;
}

export interface EngineOpts {
  readOnly: boolean;
  /** Where a picture's source shows from in the app. */
  src: (s: string) => string;
  /** A page break's label, in the user's language. */
  breakLabel: string;
  onChange: (doc: Doc) => void;
  onState: (s: SelState) => void;
  /** The editor's own keys first (Ctrl+K, Ctrl+S): true when one was. */
  onKey?: (e: KeyboardEvent) => boolean;
  /** A picture from the device kept by the app. */
  upload: (f: File) => Promise<{ src: string; w: number; h: number }>;
  /** A picture at an address (or a data: one) kept by the app: its kept source, or null. */
  takeIn: (src: string) => Promise<string | null>;
  onError: (e: unknown) => void;
  /** Maths as HTML (KaTeX's, once it has loaded). */
  math?: MathDraw;
  /** What a table of contents says while there are no headings. */
  tocHint?: string;
  /** What a bibliography says while the document cites nothing. */
  bibHint?: string;
  /** A click on an equation, or on a callout's emoji. */
  onAtom?: (a: AtomClick) => void;
  /** The format painter carried its look to words (and, unless it stays on, is off now). */
  onPainted?: () => void;
  /** Blocks drawn anew (null: all of them), as soon as they are on the page: the pages' layout puts back what it gave them. */
  onDrawn?: (ids: string[] | null) => void;
}

const HISTORY_MAX = 200;
const FLAGS: Flag[] = ['b', 'i', 'u', 's', 'code', 'sup', 'sub'];

/** How many characters the model counts for a piece of the page: text, and line breaks (not the ones that only hold a line open); an equation, its LaTeX's. */
function lengthOf(n: Node): number {
  if (n.nodeType === 3) return (n as Text).data.length;
  if (n.nodeName === 'BR') return (n as Element).hasAttribute('data-ph') ? 0 : 1;
  if (n.nodeType === 1 && (n as Element).hasAttribute('data-tex')) return (n as Element).getAttribute('data-tex')!.length;
  let k = 0;
  for (let c = n.firstChild; c; c = c.nextSibling) k += lengthOf(c);
  return k;
}

/** How far into a block's words a point of the page is. */
function offsetIn(box: Element, node: Node, offset: number): number {
  const r = document.createRange();
  try {
    r.setStart(box, 0);
    r.setEnd(node, offset);
  } catch {
    return 0;
  }
  return lengthOf(r.cloneContents());
}

const indexIn = (n: Node) => Array.prototype.indexOf.call(n.parentNode?.childNodes ?? [], n) as number;

/** A browser's line break that only holds the end of a line open: not a line of the words. */
const trailingBreak = /<br(?![^>]*data-ph)[^>]*>((?:\s|<\/(?:span|a|strong|em|u|s|b|i|sup|sub|code|font)>)*)$/i;

/** Where the caret goes for a point on the screen (browsers name it two ways). */
function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const d = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  if (d.caretPositionFromPoint) {
    const p = d.caretPositionFromPoint(x, y);
    return p ? { node: p.offsetNode, offset: p.offset } : null;
  }
  const r = document.caretRangeFromPoint?.(x, y);
  return r ? { node: r.startContainer, offset: r.startOffset } : null;
}

/** The layout's cut right after a text node (where a page turns), if there is one there. */
function cutAfter(x: Node, box: Element): Element | null {
  let n: Node | null = x;
  while (n && n !== box && !n.nextSibling) n = n.parentNode;
  const sib = n && n !== box ? n.nextSibling : null;
  return sib?.nodeType === 1 && (sib as Element).hasAttribute(CUT) ? (sib as Element) : null;
}

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const unb64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));

/** Blocks as HTML for another app to paste (lists as lists, a checklist's boxes as boxes), and as themselves for this one. */
function copyHtml(blocks: Block[], src: (s: string) => string): string {
  const { labels } = listInfo(blocks);
  let out = '';
  const open: { tag: 'ul' | 'ol'; lvl: number; kind: ListKind }[] = [];
  const close = (to: number) => {
    while (open.length > to) out += `</${open.pop()!.tag}>`;
  };
  blocks.forEach((b, i) => {
    if (b.type !== 'li') {
      close(0);
      if (b.type === 'p') {
        const st = [b.align ? `text-align:${b.align}` : '', b.lvl ? `margin-left:${b.lvl * 36}pt` : ''].filter(Boolean).join(';');
        const tag = b.style === 'code' ? 'pre' : b.style === 'quote' ? 'blockquote' : /^h\d$/.test(b.style ?? '') ? b.style! : 'p';
        const cls = b.style === 'title' || b.style === 'subtitle' ? ` class="${b.style}"` : '';
        out += `<${tag}${cls}${st ? ` style="${st}"` : ''}>${runsHtml(b.runs, { view: true })}</${tag}>`;
      } else out += blockHtml(b, labels[i], { src: (s) => new URL(src(s), location.href).href }).replace(/<div class="nd-b nd-pb"[^>]*><\/div>/, '<div style="page-break-before:always"></div>');
      return;
    }
    const lvl = b.lvl ?? 0;
    const tag = b.list === 'number' ? 'ol' : 'ul';
    while (open.length && (open[open.length - 1].lvl > lvl || (open[open.length - 1].lvl === lvl && open[open.length - 1].kind !== b.list))) close(open.length - 1);
    while (!open.length || open[open.length - 1].lvl < lvl) {
      open.push({ tag, lvl: open.length ? open[open.length - 1].lvl + 1 : 0, kind: b.list });
      if (open[open.length - 1].lvl > lvl) open[open.length - 1].lvl = lvl;
      out += `<${tag}>`;
      if (open[open.length - 1].lvl === lvl) break;
    }
    const box = b.list === 'check' ? `<input type="checkbox"${b.checked ? ' checked' : ''}> ` : '';
    out += `<li${b.align ? ` style="text-align:${b.align}"` : ''}>${box}${runsHtml(b.runs, { view: true })}</li>`;
  });
  close(0);
  return `<meta charset="utf-8"><!--naget-doc:${b64(JSON.stringify(blocks))}--><div>${out}</div>`;
}

export class DocEngine {
  doc: Doc;
  picked: string | null = null;
  private els = new Map<string, HTMLElement>();
  private drawn = new Map<string, Block>();
  private sel: Sel | null = null;
  /** The selection before the change being made (what undo goes back to). */
  private before: Sel | null = null;
  /** The look words typed next get, at a caret where bold (say) was just turned on. */
  private pending: Look | null = null;
  private pendingAt: Pos | null = null;
  private past: { doc: Doc; sel: Sel | null }[] = [];
  private future: { doc: Doc; sel: Sel | null }[] = [];
  private last: { key: string; at: number } | null = null;
  private composing = false;
  private plainNext = false;
  private frame = 0;
  private off: (() => void)[] = [];
  /** The headings a table of contents showed when last drawn. */
  private tocKey = '';
  /** The format painter, while it is on. */
  paint: Paint | null = null;
  /** Who suggests, while edits are suggestions (Suggesting); null while they are edits. */
  suggesting: sg.Me | null = null;

  constructor(
    public root: HTMLElement,
    doc: Doc,
    private o: EngineOpts,
  ) {
    this.doc = ops.fixDoc(doc);
    root.setAttribute('translate', 'no');
    root.spellcheck = true;
    this.setReadOnly(o.readOnly);
    this.draw(true);
    const on = <K extends keyof HTMLElementEventMap>(t: K, f: (e: HTMLElementEventMap[K]) => void) => {
      root.addEventListener(t, f as EventListener);
      this.off.push(() => root.removeEventListener(t, f as EventListener));
    };
    on('beforeinput', (e) => this.onBeforeInput(e));
    on('input', () => this.onInput());
    on('keydown', (e) => this.onKey(e));
    on('mousedown', (e) => this.onDown(e));
    on('paste', (e) => this.onPaste(e));
    on('copy', (e) => this.onCopy(e, false));
    on('cut', (e) => this.onCopy(e, true));
    on('dragstart', (e) => e.preventDefault());
    on('dragover', (e) => e.dataTransfer && [...e.dataTransfer.types].some((t) => t === 'Files' || t === 'text/html' || t === 'text/plain') && e.preventDefault());
    on('drop', (e) => this.onDrop(e));
    on('compositionstart', () => (this.composing = true));
    on('compositionend', () => {
      this.composing = false;
      this.onInput();
    });
    on('focus', () => this.emitSoon());
    on('mouseup', () => setTimeout(() => this.painted(), 0));
    on('keyup', (e) => e.shiftKey && setTimeout(() => this.painted(), 0));
    const sc = () => this.onSelChange();
    document.addEventListener('selectionchange', sc);
    this.off.push(() => document.removeEventListener('selectionchange', sc));
  }

  destroy() {
    for (const f of this.off) f();
    cancelAnimationFrame(this.frame);
  }

  /** Edits as suggestions (of `me`), or as edits again (null). */
  setSuggesting(me: sg.Me | null) {
    this.suggesting = me;
    this.pending = null;
    this.emitSoon();
  }

  setReadOnly(ro: boolean) {
    this.o.readOnly = ro;
    // While an agent's version shows, nothing is typed into it.
    const off = ro || !!this.own;
    this.root.contentEditable = off ? 'false' : 'true';
    // Ctrl+B and Ctrl+K in the words are the document's (bold, a link), not the app's sidebar and search box.
    if (off) delete this.root.dataset.keys;
    else this.root.dataset.keys = 'b k';
  }

  /**
   * Another document (or another version): its history its own. Drawn anew; with `keep`, the blocks that hold what they
   * held keep their elements (a version that changed a few blocks of a long document draws only those).
   */
  load(doc: Doc, keep = false) {
    this.own = null;
    this.doc = ops.fixDoc(doc);
    this.past = [];
    this.future = [];
    this.last = null;
    this.pending = null;
    this.picked = null;
    this.setReadOnly(!!this.o.readOnly);
    this.draw(!keep, keep);
    this.sel = null;
    this.emitSoon();
  }

  /** The document itself while an agent's version shows in its place (preview). */
  private own: Doc | null = null;
  /** The document as it is, whatever shows: its own while an agent's version shows. */
  get kept(): Doc {
    return this.own ?? this.doc;
  }

  /**
   * An agent's version as it is being written, shown in place of the document (null: the document again), read-only
   * and drawn only where it differs; the document and its history stay as they are underneath.
   */
  preview(doc: Doc | null) {
    if (doc) {
      if (!this.own) this.own = this.doc;
      this.doc = doc;
    } else {
      if (!this.own) return;
      this.doc = this.own;
      this.own = null;
    }
    this.picked = null;
    this.setReadOnly(!!this.o.readOnly);
    this.draw(false, true);
  }

  // ---- drawing --------------------------------------------------------------------------------------------

  private toc: TocEntry[] = [];
  /** Footnotes' numbers, citations, cross-references, numbered captions and the bibliography, as last drawn. */
  refs: Refs = docRefs({ v: 1, page: { size: 'a4', margin: 25 }, font: '', size: 11, blocks: [] });
  private refKeys = new Map<string, string>();

  private make(b: Block, label: string): HTMLElement {
    const t = document.createElement('template');
    t.innerHTML = blockHtml(b, label, { src: this.o.src, edit: true, breakLabel: this.o.breakLabel, math: this.o.math, toc: this.toc, tocHint: this.o.tocHint, refs: this.refs, bibHint: this.o.bibHint });
    const el = t.content.firstElementChild as HTMLElement;
    if (b.type === 'image') el.querySelector('img')?.setAttribute('draggable', 'false');
    return el;
  }

  /** Runs as the editor draws them (its equations, footnotes' marks, citations and cross-references too). */
  private runsHtml = (runs: Run[]) => runsHtml(runs, { math: this.o.math, refs: this.refs });

  /** Maths drawn again (KaTeX has loaded): the blocks that have any. */
  redrawMath() {
    const has = (runs: Run[]) => runs.some((r) => r.math);
    for (const b of this.doc.blocks)
      if (b.type === 'math' || ((b.type === 'p' || b.type === 'li') && has(b.runs)) || (b.type === 'table' && b.rows.some((r) => r.some((c) => has(c.runs))))) this.drawn.delete(b.id);
    const sel = this.picked ? null : this.readSel();
    this.draw();
    if (sel && document.activeElement === this.root) this.place(sel, false);
  }

  /**
   * The page made to show the model: blocks that changed drawn anew, the others left as they are (`loose`: a block of
   * another object that holds the same as the one drawn is left as it is too).
   */
  private draw(all = false, loose = false) {
    if (all) {
      this.els.clear();
      this.drawn.clear();
      this.refKeys.clear();
      this.root.replaceChildren();
    }
    const fresh: string[] = [];
    const { labels } = listInfo(this.doc.blocks);
    // A table of contents follows the headings: drawn again when they change.
    const hasToc = this.doc.blocks.some((b) => b.type === 'toc');
    this.toc = hasToc ? tocEntries(this.doc) : [];
    const tocKey = hasToc ? JSON.stringify(this.toc) : '';
    const tocChanged = tocKey !== this.tocKey;
    this.tocKey = tocKey;
    // What the whole document decides of a block (its marks' numbers and words, its caption's number): drawn again when it changes.
    this.refs = docRefs(this.doc);
    const mine = new Set<Node>();
    this.doc.blocks.forEach((b, i) => {
      let el = this.els.get(b.id);
      const was = this.drawn.get(b.id);
      const rk = refsKey(b, this.refs);
      const refsChanged = (this.refKeys.get(b.id) ?? '') !== rk;
      this.refKeys.set(b.id, rk);
      if (loose && el && was && was !== b && !(tocChanged && b.type === 'toc') && !refsChanged && JSON.stringify(was) === JSON.stringify(b)) this.drawn.set(b.id, b);
      if (!el || this.drawn.get(b.id) !== b || (tocChanged && b.type === 'toc') || refsChanged) {
        const made = this.make(b, labels[i]);
        el?.remove();
        el = made;
        this.els.set(b.id, el);
        this.drawn.set(b.id, b);
        fresh.push(b.id);
      } else if (b.type === 'li' && el.dataset.n !== labels[i]) el.dataset.n = labels[i];
      mine.add(el);
    });
    for (const [id, el] of this.els)
      if (!mine.has(el)) {
        el.remove();
        this.els.delete(id);
        this.drawn.delete(id);
        this.refKeys.delete(id);
      }
    // Anything else in the page (the browser's doing) goes; the blocks stand in their order.
    for (const n of Array.from(this.root.childNodes)) if (!mine.has(n)) n.remove();
    let prev: Node | null = null;
    for (const b of this.doc.blocks) {
      const el = this.els.get(b.id)!;
      const want: Node | null = prev ? prev.nextSibling : this.root.firstChild;
      if (want !== el) this.root.insertBefore(el, want);
      prev = el;
    }
    if (this.picked) {
      const p = this.els.get(this.picked);
      if (p) p.classList.add('nd-picked');
      else this.picked = null;
    }
    if (fresh.length) this.o.onDrawn?.(all ? null : fresh);
  }

  /** A block's element on the page. */
  elementOf = (id: string) => this.els.get(id) ?? null;

  // ---- places and the selection --------------------------------------------------------------------------------

  /** A point of the page as a place in the model (a point between blocks, or on a picture: the nearest words). */
  posOf(node: Node, offset: number): Pos | null {
    const el = node.nodeType === 1 ? (node as Element) : node.parentElement;
    if (!el || !this.root.contains(el)) return null;
    const box = el.closest('[data-t]');
    if (box && this.root.contains(box)) {
      const blk = box.closest('[data-b]') as HTMLElement | null;
      const b = blk?.dataset.b;
      if (!b) return null;
      const cs = (box as HTMLElement).dataset.c;
      const c = cs ? (cs.split(',').map(Number) as [number, number]) : undefined;
      const runs = ops.boxRuns(this.doc, b, c);
      if (!runs) return null;
      const o = Math.min(ops.lenOf(runs), offsetIn(box, node, offset));
      return c ? { b, c, o } : { b, o };
    }
    if (el === this.root) {
      const child = this.root.childNodes[offset] as HTMLElement | undefined;
      const id = child?.dataset?.b;
      if (id) return ops.nearPos(this.doc, ops.indexOf(this.doc, id));
      return ops.nearPos(this.doc, this.doc.blocks.length - 1, true);
    }
    const blk = el.closest('[data-b]') as HTMLElement | null;
    return ops.nearPos(this.doc, blk?.dataset.b ? ops.indexOf(this.doc, blk.dataset.b) : 0);
  }

  /** A place in the model as a point of the page. */
  domOf(p: Pos): { node: Node; offset: number } | null {
    const blk = this.els.get(p.b);
    if (!blk) return null;
    const box = p.c ? blk.querySelector(`[data-c="${p.c[0]},${p.c[1]}"]`) : blk;
    if (!box) return null;
    let left = p.o;
    // An equation is one thing: the caret goes before or after it, never into what KaTeX drew.
    const walk = document.createTreeWalker(box, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: (n) => (n.parentElement?.closest('[data-tex]') && n.parentElement.closest('[data-t]') === box ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let x = walk.nextNode(); x; x = walk.nextNode()) {
      if (x.nodeType === 3) {
        const len = (x as Text).data.length;
        if (left < len || (left === len && !cutAfter(x, box))) return { node: x, offset: left };
        if (left === len) {
          // Where the page turns: the caret goes on the next page's line, after the cut.
          const c = cutAfter(x, box)!;
          return { node: c.parentNode!, offset: indexIn(c) + 1 };
        }
        left -= len;
      } else if ((x as Element).hasAttribute?.('data-tex')) {
        const len = (x as Element).getAttribute('data-tex')!.length;
        const at = x.parentNode!;
        if (left === 0) return { node: at, offset: indexIn(x) };
        if (left <= len) return { node: at, offset: indexIn(x) + 1 };
        left -= len;
      } else if (x.nodeName === 'BR' && !(x as Element).hasAttribute('data-ph')) {
        if (left === 0) return { node: x.parentNode!, offset: indexIn(x) };
        left -= 1;
      }
    }
    const ph = box.querySelector('br[data-ph]');
    if (ph?.parentNode) return { node: ph.parentNode, offset: indexIn(ph) };
    return { node: box, offset: box.childNodes.length };
  }

  private readSel(): Sel | null {
    const s = window.getSelection();
    if (!s || !s.rangeCount || !s.anchorNode || !s.focusNode || !this.root.contains(s.anchorNode)) return null;
    const a = this.posOf(s.anchorNode, s.anchorOffset);
    const f = this.posOf(s.focusNode, s.focusOffset);
    return a && f ? { a, f } : null;
  }

  /** The selection, the first place first: the page's own as it is now (the last one, while the toolbar has the focus). */
  range(): [Pos, Pos] {
    if (!this.picked) {
      const now = this.readSel();
      if (now) this.sel = now;
    }
    const s = this.sel ?? { a: ops.firstPos(this.doc), f: ops.firstPos(this.doc) };
    const valid = (p: Pos) => !!ops.boxRuns(this.doc, p.b, p.c);
    if (!valid(s.a) || !valid(s.f)) {
      const p = ops.firstPos(this.doc);
      return [p, p];
    }
    return ops.ordered(this.doc, s.a, s.f);
  }

  /** A place made one that is in the document now (a block that went: the start of the document). */
  private valid(p: Pos): Pos {
    const runs = ops.boxRuns(this.doc, p.b, p.c);
    return runs ? { ...p, o: Math.min(p.o, ops.lenOf(runs)) } : ops.firstPos(this.doc);
  }

  /** Sets the selection on the page (and keeps it in view). */
  place(sel: Sel | null, scroll = true) {
    if (sel) sel = { a: this.valid(sel.a), f: this.valid(sel.f) };
    this.sel = sel;
    if (!sel || this.o.readOnly) return;
    const a = this.domOf(sel.a);
    const f = this.domOf(sel.f);
    if (!a || !f) return;
    if (document.activeElement !== this.root) this.root.focus({ preventScroll: true });
    const s = window.getSelection();
    try {
      s?.setBaseAndExtent(a.node, a.offset, f.node, f.offset);
    } catch {
      return;
    }
    if (scroll) this.reveal();
  }

  /** The focus back in the page, the caret where it last was (after a bar or a box over the page closes). */
  focus() {
    if (this.o.readOnly) return;
    if (this.picked) return this.root.focus({ preventScroll: true });
    this.place(this.sel ?? { a: ops.firstPos(this.doc), f: ops.firstPos(this.doc) }, false);
  }

  /**
   * The focus back in the page once a box over it has closed, unless it went somewhere already (a click in the words, a
   * field): without it, keys after a caption or an equation went nowhere.
   */
  refocusSoon() {
    requestAnimationFrame(() => {
      const a = document.activeElement;
      if (!a || a === document.body) this.focus();
    });
  }

  /** The caret brought into view, if it is out of it. */
  private reveal() {
    const s = window.getSelection();
    if (!s?.rangeCount) return;
    let r = s.getRangeAt(0).getBoundingClientRect();
    if (!r.height) {
      const n = s.focusNode;
      const el = (n?.nodeType === 1 ? (n as Element) : n?.parentElement)?.closest('[data-t], [data-b]');
      if (el) r = el.getBoundingClientRect();
    }
    let sc: HTMLElement | null = this.root.parentElement;
    while (sc && !/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement;
    if (!sc) return;
    const box = sc.getBoundingClientRect();
    if (r.bottom > box.bottom - 24) sc.scrollTop += r.bottom - box.bottom + 48;
    else if (r.top < box.top + 8) sc.scrollTop -= box.top - r.top + 48;
  }

  private onSelChange() {
    if (!this.root.contains(document.activeElement) && document.activeElement !== this.root) return;
    const sel = this.readSel();
    if (!sel) return;
    if (this.pending && !(this.pendingAt && ops.samePos(sel.f, this.pendingAt) && ops.samePos(sel.a, sel.f))) this.pending = null;
    this.sel = sel;
    this.emitSoon();
  }

  private emitSoon() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.o.onState(this.state());
    });
  }

  /** What the toolbar shows: how the words picked look, what kind of block they are in. */
  state(): SelState {
    const [s, e] = this.range();
    const collapsed = ops.samePos(s, e);
    const index = ops.indexOf(this.doc, s.b);
    const block = this.doc.blocks[index] ?? null;
    const runs = ops.boxRuns(this.doc, s.b, s.c) ?? [];
    const look = collapsed ? (this.pending ?? ops.lookAt(runs, s.o)) : ops.commonLook(this.doc, s, e);
    const on = {} as Record<Flag, boolean>;
    for (const k of FLAGS) on[k] = collapsed ? !!look[k] : ops.allHave(this.doc, s, e, k);
    const cell = s.c && block?.type === 'table' ? block.rows[s.c[0]]?.[s.c[1]] : null;
    const picked = this.picked ? (ops.blockOf(this.doc, this.picked) ?? null) : null;
    // The comments here: on the word at the caret (or the character before it), or on any of the words picked.
    const cm = collapsed ? (runs.length ? (ops.runAt(runs, s.o)?.cm ?? []) : []) : [...new Set(ops.runsBetween(this.doc, s, e).flatMap((r) => r.cm ?? []))];
    // The suggestions here: on the words on either side of the caret (or picked), and the block's own.
    const marks = (r: Run | undefined) => (r ? [r.ins, r.del, r.fmt].filter((x): x is string => !!x) : []);
    const at = collapsed ? [...marks(ops.runAt(runs, s.o)), ...marks(ops.sliceRuns(runs, s.o, s.o + 1)[0])] : ops.runsBetween(this.doc, s, e).flatMap(marks);
    const own = [block?.ins, block?.del].filter((x): x is string => !!x);
    const sgs = [...new Set([...at, ...own])];
    return {
      collapsed,
      block,
      index,
      cell: s.c ?? null,
      look,
      on,
      style: block?.type === 'p' ? (block.style ?? 'normal') : 'normal',
      list: block?.type === 'li' ? block.list : null,
      align: (cell ? cell.align : block?.type === 'p' || block?.type === 'li' ? block.align : undefined) ?? 'left',
      picked,
      text: collapsed ? '' : ops.textBetween(this.doc, s, e).slice(0, 2000),
      link: collapsed ? (ops.linkAt(this.doc, s)?.link ?? null) : (look.link ?? null),
      cm,
      sg: sgs,
      suggesting: !!this.suggesting,
      cells: s.c && e.c && s.b === e.b ? { b: s.b, a: s.c, f: e.c } : null,
      canUndo: this.past.length > 0,
      canRedo: this.future.length > 0,
    };
  }

  // ---- changes ---------------------------------------------------------------------------------------------------

  /**
   * A new model: kept for undo (changes of one kind in a row, typing say, undo together), drawn (unless the page
   * shows it already), the selection set where the change leaves it.
   */
  private commit(doc: Doc, sel: Sel | null, o: { key?: string; draw?: boolean; pick?: string | null } = {}) {
    // Nothing changes while an agent's version shows (a key or a menu would change that version, not the document).
    if (this.own) return;
    const next = ops.fixDoc(doc);
    if (next === this.doc && o.pick === undefined) {
      if (sel) this.place(sel);
      return;
    }
    if (next !== this.doc) {
      const now = Date.now();
      const same = !!o.key && this.last?.key === o.key && now - this.last.at < 1500;
      if (!same) {
        this.past.push({ doc: this.doc, sel: this.before ?? this.sel });
        if (this.past.length > HISTORY_MAX) this.past.shift();
      }
      this.future = [];
      this.last = o.key ? { key: o.key, at: now } : null;
      this.doc = next;
    }
    this.before = null;
    if (o.pick !== undefined && o.pick !== this.picked) this.setPicked(o.pick);
    if (o.draw !== false) this.draw();
    if (sel && !this.picked) this.place(sel);
    this.o.onChange(this.doc);
    this.emitSoon();
  }

  /** An edit's result applied: its model, its caret (or what it picks). */
  private apply(e: ops.Edit, key?: string) {
    this.commit(e.doc, e.pick ? null : { a: e.at, f: e.at }, { key, pick: e.pick ?? null });
  }

  undo() {
    if (this.own) return;
    const e = this.past.pop();
    if (!e) return;
    this.future.push({ doc: this.doc, sel: this.sel });
    this.doc = e.doc;
    this.last = null;
    this.setPicked(null);
    this.draw();
    this.place(e.sel ?? { a: ops.firstPos(this.doc), f: ops.firstPos(this.doc) });
    this.o.onChange(this.doc);
    this.emitSoon();
  }

  redo() {
    if (this.own) return;
    const e = this.future.pop();
    if (!e) return;
    this.past.push({ doc: this.doc, sel: this.sel });
    this.doc = e.doc;
    this.last = null;
    this.setPicked(null);
    this.draw();
    this.place(e.sel ?? { a: ops.firstPos(this.doc), f: ops.firstPos(this.doc) });
    this.o.onChange(this.doc);
    this.emitSoon();
  }

  /** A picture, a line across or a page break picked (or none). */
  setPicked(id: string | null) {
    if (this.picked === id) return;
    if (this.picked) this.els.get(this.picked)?.classList.remove('nd-picked');
    this.picked = id && this.els.has(id) ? id : id && ops.blockOf(this.doc, id) ? id : null;
    if (this.picked) {
      this.els.get(this.picked)?.classList.add('nd-picked');
      window.getSelection()?.removeAllRanges();
      this.root.focus({ preventScroll: true });
    }
    this.emitSoon();
  }

  // ---- what the browser does ----------------------------------------------------------------------------------------

  /** A block's words read back from the page. */
  private readBox(box: Element): Run[] {
    return htmlRuns(box.innerHTML.replace(trailingBreak, '$1'));
  }

  /** Whether the page's blocks are still the model's, one for one. */
  private intact(): boolean {
    const kids = this.root.children;
    if (kids.length !== this.doc.blocks.length) return false;
    for (let i = 0; i < kids.length; i++) if ((kids[i] as HTMLElement).dataset.b !== this.doc.blocks[i].id) return false;
    return this.root.childNodes.length === kids.length;
  }

  private onBeforeInput(e: InputEvent) {
    if (this.o.readOnly) return e.preventDefault();
    const t = e.inputType;
    if (this.picked) {
      e.preventDefault();
      if (t === 'insertParagraph') this.afterPicked();
      else if (t.startsWith('delete')) this.removePicked();
      return;
    }
    if (t === 'historyUndo' || t === 'historyRedo') {
      e.preventDefault();
      return t === 'historyUndo' ? this.undo() : this.redo();
    }
    const sel = this.readSel() ?? this.sel;
    if (!sel) return e.preventDefault();
    this.sel = sel;
    this.before = sel;
    const [s, en] = ops.ordered(this.doc, sel.a, sel.f);
    const collapsed = ops.samePos(s, en);
    const oneBox = ops.sameBox(s, en);
    const len = ops.lenOf(ops.boxRuns(this.doc, s.b, s.c) ?? []);
    if (t === 'insertCompositionText') return;
    if (this.suggesting && this.suggestInput(e, t, s, en)) return;
    if (t === 'insertText' || t === 'insertReplacementText') {
      const data = e.data ?? e.dataTransfer?.getData('text/plain') ?? '';
      if (collapsed && t === 'insertText' && data === ' ' && this.shortcut(s)) return e.preventDefault();
      // At the end of a comment's words (or a link), the browser would type into them and stretch the comment: the
      // words go in here instead, as lookAt says they look.
      const boxRuns = ops.boxRuns(this.doc, s.b, s.c) ?? [];
      const before = collapsed ? ops.runAt(boxRuns, s.o) : undefined;
      const want = collapsed ? ops.lookAt(boxRuns, s.o) : null;
      // So too beside a suggestion's words: words typed while editing are no suggestion's.
      const edge = !!before && !!want && !isAtom(before) && ((before.cm?.join() ?? '') !== (want.cm?.join() ?? '') || (before.link ?? '') !== (want.link ?? '') || !!(before.ins || before.del || before.fmt));
      if (oneBox && !edge && !(collapsed && this.pending && t === 'insertText')) return;
      e.preventDefault();
      const look = this.pending ?? ops.lookAt(ops.boxRuns(this.doc, s.b, s.c) ?? [], collapsed ? s.o : s.o + 1);
      const cut = ops.deleteRange(this.doc, s, en);
      this.pending = null;
      return this.apply(ops.insertText(cut.doc, cut.at, data.replace(/\r\n?/g, '\n'), look), `type:${s.b}`);
    }
    if (t === 'insertParagraph') {
      e.preventDefault();
      return this.enter();
    }
    if (t === 'insertLineBreak') {
      e.preventDefault();
      const cut = ops.deleteRange(this.doc, s, en);
      return this.apply(ops.insertText(cut.doc, cut.at, '\n'));
    }
    if (t.startsWith('delete')) {
      if (t === 'deleteByDrag' || t === 'deleteByCut') return e.preventDefault();
      const back = t.includes('Backward');
      if (!collapsed) {
        if (oneBox) return;
        e.preventDefault();
        return this.apply(ops.deleteRange(this.doc, s, en));
      }
      if (back && s.o === 0) {
        e.preventDefault();
        return this.apply(ops.backspace(this.doc, s));
      }
      if (!back && s.o >= len) {
        e.preventDefault();
        return this.apply(ops.deleteForward(this.doc, s));
      }
      // Words where a page turns: the browser would take out the cut itself, so a character or a word goes here.
      const box = this.elementOf(s.b)?.querySelector(s.c ? `[data-c="${s.c[0]},${s.c[1]}"]` : '[data-t]') ?? this.elementOf(s.b);
      if (box?.querySelector(`[${CUT}]`) && /^delete(Content|Word)(Backward|Forward)$/.test(t)) {
        e.preventDefault();
        const runs = ops.boxRuns(this.doc, s.b, s.c) ?? [];
        const to = t.startsWith('deleteWord') ? ops.wordStep(runs, s.o, back) : ops.charStep(runs, s.o, back);
        if (to === s.o) return;
        return this.apply(ops.deleteRange(this.doc, { ...s, o: Math.min(to, s.o) }, { ...s, o: Math.max(to, s.o) }), `type:${s.b}`);
      }
      return;
    }
    const fmt: Record<string, Flag> = { formatBold: 'b', formatItalic: 'i', formatUnderline: 'u', formatStrikeThrough: 's', formatSuperscript: 'sup', formatSubscript: 'sub' };
    e.preventDefault();
    if (fmt[t]) this.toggle(fmt[t]);
    else if (t === 'formatIndent' || t === 'formatOutdent') this.indent(t === 'formatIndent' ? 1 : -1);
    else if (t === 'insertOrderedList' || t === 'insertUnorderedList') this.list(t === 'insertOrderedList' ? 'number' : 'bullet');
    else if (t === 'formatRemove') this.clear();
  }

  /**
   * Suggesting: what the browser was about to type or take out made a suggestion here instead (true when it was one of
   * those: words, Enter, a line break, a deletion).
   */
  private suggestInput(e: InputEvent, t: string, s: Pos, en: Pos): boolean {
    const me = this.suggesting!;
    const collapsed = ops.samePos(s, en);
    const look = () => this.pending ?? ops.lookAt(ops.boxRuns(this.doc, s.b, s.c) ?? [], collapsed ? s.o : s.o + 1);
    if (t === 'insertText' || t === 'insertReplacementText') {
      e.preventDefault();
      const data = (e.data ?? e.dataTransfer?.getData('text/plain') ?? '').replace(/\r\n?/g, '\n');
      if (collapsed && t === 'insertText' && data === ' ' && this.shortcut(s)) return true;
      const l = look();
      this.pending = null;
      this.apply(sg.insert(this.doc, s, en, data, l, me), `type:${s.b}`);
      return true;
    }
    if (t === 'insertParagraph') {
      e.preventDefault();
      this.enter();
      return true;
    }
    if (t === 'insertLineBreak') {
      e.preventDefault();
      this.apply(sg.insert(this.doc, s, en, '\n', look(), me));
      return true;
    }
    if (t.startsWith('delete')) {
      e.preventDefault();
      if (t === 'deleteByDrag' || t === 'deleteByCut') return true;
      const back = t.includes('Backward');
      if (!collapsed) {
        const r = sg.remove(this.doc, s, en, me);
        this.apply({ doc: r.doc, at: back ? r.start : r.end }, `del:${s.b}`);
      } else if (t.startsWith('deleteWord')) this.apply(sg.deleteWord(this.doc, s, back, me), `del:${s.b}`);
      else this.apply(back ? sg.backspace(this.doc, s, me) : sg.deleteForward(this.doc, s, me), `del:${s.b}`);
      return true;
    }
    return false;
  }

  /** Words the browser typed or took out, inside one block: read back into the model. */
  private onInput() {
    if (this.o.readOnly) return;
    // Suggesting: an input method's words wait for it to finish (then they are made a suggestion).
    if (this.suggesting && this.composing) return;
    const s = window.getSelection();
    const node = s?.anchorNode;
    const el = node ? (node.nodeType === 1 ? (node as Element) : node.parentElement) : null;
    const box = el?.closest('[data-t]');
    if (!box || !this.root.contains(box) || !this.intact()) return this.resync();
    const blk = box.closest('[data-b]') as HTMLElement;
    const id = blk.dataset.b!;
    const cs = (box as HTMLElement).dataset.c;
    const c = cs ? (cs.split(',').map(Number) as [number, number]) : undefined;
    const runs = this.readBox(box);
    if (this.suggesting) return this.suggestFromBrowser(box, id, c, runs);
    const doc = ops.setBox(this.doc, id, c, runs);
    if (doc === this.doc) return;
    // The page shows this block as it now is.
    this.drawn.set(id, doc.blocks[ops.indexOf(doc, id)]);
    const sel = this.readSel();
    this.commit(doc, null, { key: `type:${id}`, draw: false });
    this.sel = sel;
    if (this.composing) return;
    // What the browser left is drawn as this editor draws it (its own spans and breaks gone; a page's cut is no difference).
    const t = document.createElement('template');
    t.innerHTML = this.runsHtml(runs);
    if (t.innerHTML !== htmlWithoutCuts(box)) {
      box.innerHTML = t.innerHTML;
      this.o.onDrawn?.([id]);
      if (sel) this.place(sel, false);
    } else if (box.querySelector(`[${CUT}]`)) this.o.onDrawn?.([id]);
  }

  /** Suggesting: words the browser changed itself (an input method's) made a suggestion, and drawn as one. */
  private suggestFromBrowser(box: Element, id: string, c: [number, number] | undefined, runs: Run[]) {
    const before = ops.boxRuns(this.doc, id, c) ?? [];
    const r = sg.fromBrowser(this.doc, { b: id, c }, before, runs, this.suggesting!);
    if (r.doc === this.doc) return;
    this.commit(r.doc, null, { key: `type:${id}`, draw: false });
    this.drawn.set(id, ops.blockOf(this.doc, id)!);
    box.innerHTML = this.runsHtml(ops.boxRuns(this.doc, id, c) ?? []);
    this.o.onDrawn?.([id]);
    this.place({ a: r.at, f: r.at }, false);
  }

  /** The page read back whole, after the browser changed more than one block's words: its blocks, as they now are. */
  private resync() {
    const used = new Set<string>();
    const blocks: Block[] = [];
    for (const n of Array.from(this.root.childNodes)) {
      const el = n as HTMLElement;
      const id = n.nodeType === 1 ? el.dataset.b : undefined;
      const known = id && !used.has(id) ? ops.blockOf(this.doc, id) : undefined;
      if (known) {
        used.add(known.id);
        if (ops.isText(known)) blocks.push({ ...known, runs: this.readBox(el) });
        else if (known.type === 'table')
          blocks.push({ ...known, rows: known.rows.map((r, ri) => r.map((c, ci) => ({ ...c, runs: ((x) => (x ? this.readBox(x) : c.runs))(el.querySelector(`[data-c="${ri},${ci}"]`)) }))) });
        else blocks.push(known);
      } else {
        const html = n.nodeType === 1 ? el.outerHTML : (n.textContent ?? '').replace(/[&<>]/g, (x) => `&#${x.charCodeAt(0)};`);
        blocks.push(...normalizeBlocks(htmlBlocks(html, { pre: true }), {}, new Set([...used, ...this.doc.blocks.map((b) => b.id)])));
      }
    }
    const sel = this.readSel();
    this.commit({ ...this.doc, blocks: blocks.length ? blocks : [{ id: ops.freshId(this.doc), type: 'p', runs: [] }] }, null, { key: 'type:page' });
    this.draw(true);
    if (sel) this.place(sel, false);
  }

  /** "# ", "- ", "1. ", "[] ", "> " typed at a paragraph's start: a heading, a list, a checklist, a quote. */
  private shortcut(at: Pos): boolean {
    if (at.c) return false;
    const b = ops.blockOf(this.doc, at.b);
    if (b?.type !== 'p' || b.style) return false;
    const before = runsText(b.runs).slice(0, at.o);
    const m = /^(#{1,4}|[-*+]|1[.)]|\[ ?\]|\[[xX]\]|>)$/.exec(before);
    if (!m) return false;
    const rest = ops.splitAt(b.runs, at.o)[1];
    const k = m[1];
    const nb: Block = k.startsWith('#')
      ? { id: b.id, type: 'p', style: `h${k.length}` as Exclude<ParaStyle, 'normal'>, runs: rest }
      : k === '>'
        ? { id: b.id, type: 'p', style: 'quote', runs: rest }
        : k.startsWith('[')
          ? { id: b.id, type: 'li', list: 'check', ...(/x/i.test(k) ? { checked: true } : {}), runs: rest }
          : { id: b.id, type: 'li', list: /\d/.test(k) ? 'number' : 'bullet', runs: rest };
    this.apply({ doc: ops.patchBlock(this.doc, b.id, () => nb), at: { b: b.id, o: 0 } });
    return true;
  }

  /** Enter: the block split (a line of "---" becomes a line across, "```" a block of code). */
  enter() {
    const [s, e] = this.range();
    if (this.suggesting) {
      const me = this.suggesting;
      const r = ops.samePos(s, e) ? { doc: this.doc, end: s } : sg.remove(this.doc, s, e, me);
      const at = r.end;
      const b = ops.blockOf(r.doc, at.b);
      // "---" or "```" just typed: a line across added, or code, as when editing (the marks typed go).
      if (!at.c && b?.type === 'p' && !b.style) {
        const shown = b.runs.filter((x) => !x.del);
        const text = runsText(shown);
        if (at.o === runsText(b.runs).length && (/^(-{3,}|\*{3,}|_{3,})$/.test(text) || /^```\w*$/.test(text))) {
          const cut = sg.remove(r.doc, { b: b.id, o: 0 }, at, me);
          if (text.startsWith('`')) return this.apply({ doc: ops.patchBlock(cut.doc, b.id, (x) => ({ ...x, style: 'code' }) as Block), at: cut.start });
          return this.apply(sg.insertBlocks(cut.doc, cut.start, cut.start, [{ id: ops.freshId(cut.doc), type: 'hr' }], me));
        }
      }
      return this.apply(sg.enter(r.doc, at, ops.lookAt(ops.boxRuns(r.doc, at.b, at.c) ?? [], at.o), me));
    }
    const cut = ops.deleteRange(this.doc, s, e);
    const at = cut.at;
    const b = ops.blockOf(cut.doc, at.b);
    if (!at.c && b?.type === 'p' && !b.style) {
      const text = runsText(b.runs);
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(text) && at.o === text.length) {
        const np: Block = { id: ops.freshId(cut.doc), type: 'p', runs: [] };
        const i = ops.indexOf(cut.doc, b.id);
        return this.apply({ doc: ops.splice(cut.doc, i, 1, [{ id: b.id, type: 'hr' }, np]), at: { b: np.id, o: 0 } });
      }
      if (/^```\w*$/.test(text) && at.o === text.length) return this.apply({ doc: ops.patchBlock(cut.doc, b.id, () => ({ id: b.id, type: 'p', style: 'code', runs: [] })), at: { b: b.id, o: 0 } });
    }
    this.apply(ops.enter(cut.doc, at));
  }

  private onKey(e: KeyboardEvent) {
    if (this.o.onKey?.(e)) return;
    if (this.o.readOnly) return;
    if (e.key === 'Escape' && this.paint) {
      e.preventDefault();
      return this.stopPaint();
    }
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (this.picked) {
      const p = this.picked;
      if (e.key === 'Backspace' || e.key === 'Delete') return void (e.preventDefault(), this.removePicked());
      if (e.key === 'Enter') return void (e.preventDefault(), this.afterPicked());
      if (e.key === 'Escape' || e.key.startsWith('Arrow')) {
        e.preventDefault();
        const i = ops.indexOf(this.doc, p);
        this.setPicked(null);
        const at = e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? ops.nearPos(this.doc, i, true) : ops.nearPos(this.doc, i);
        return this.place({ a: at, f: at });
      }
      if (mod && (k === 'z' || k === 'y')) {
        e.preventDefault();
        return k === 'y' || e.shiftKey ? this.redo() : this.undo();
      }
      // Select all picks the words, not the picture any more (else typing went nowhere and Delete took only it).
      if (mod && k === 'a' && !e.shiftKey && !e.altKey) {
        this.setPicked(null);
        return;
      }
      if (!mod && e.key.length === 1) e.preventDefault();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const [s] = this.range();
      const b = ops.blockOf(this.doc, s.b);
      if (s.c) return this.apply(ops.nextCell(this.doc, s, e.shiftKey));
      if (b?.type === 'li' || e.shiftKey) return this.indent(e.shiftKey ? -1 : 1);
      this.before = this.sel;
      const [a, z] = this.range();
      if (this.suggesting) return this.apply(sg.insert(this.doc, a, z, '\t', ops.lookAt(ops.boxRuns(this.doc, a.b, a.c) ?? [], a.o), this.suggesting), `type:${s.b}`);
      const cut = ops.deleteRange(this.doc, a, z);
      return this.apply(ops.insertText(cut.doc, cut.at, '\t'), `type:${s.b}`);
    }
    if (mod && e.key === 'Enter') return void (e.preventDefault(), this.insertAtom('pagebreak'));
    if (mod && e.altKey && !e.getModifierState('AltGraph')) {
      const m = /^Digit([0-4])$/.exec(e.code);
      if (m) {
        e.preventDefault();
        return this.style(m[1] === '0' ? 'normal' : (`h${m[1]}` as ParaStyle));
      }
    }
    if (mod && e.shiftKey && !e.altKey) {
      const map: Record<string, () => void> = {
        Digit7: () => this.list('number'),
        Digit8: () => this.list('bullet'),
        Digit9: () => this.list('check'),
        KeyX: () => this.toggle('s'),
        KeyL: () => this.align('left'),
        KeyE: () => this.align('center'),
        KeyR: () => this.align('right'),
        KeyJ: () => this.align('justify'),
        KeyV: () => {
          this.plainNext = true;
          setTimeout(() => (this.plainNext = false), 800);
        },
      };
      const f = map[e.code];
      if (f) {
        if (e.code !== 'KeyV') e.preventDefault();
        return f();
      }
    }
    if (mod && !e.altKey) {
      const map: Record<string, () => void> = {
        z: () => (e.shiftKey ? this.redo() : this.undo()),
        y: () => this.redo(),
        b: () => this.toggle('b'),
        i: () => this.toggle('i'),
        u: () => this.toggle('u'),
        '\\': () => this.clear(),
        '.': () => this.toggle('sup'),
        ',': () => this.toggle('sub'),
      };
      const f = !e.shiftKey || k === 'z' ? map[k] : undefined;
      if (f) {
        e.preventDefault();
        f();
      }
    }
  }

  private onDown(e: MouseEvent) {
    const t = e.target as HTMLElement;
    // A line of a table of contents goes to its heading.
    const line = t.closest('.nd-toc [data-h]') as HTMLElement | null;
    if (line && this.root.contains(line)) {
      e.preventDefault();
      return this.focusBlock(line.dataset.h!);
    }
    const atom = t.closest('figure.nd-img, .nd-hr, .nd-pb, .nd-toc, .nd-math') as HTMLElement | null;
    if (atom && this.root.contains(atom) && !this.o.readOnly) {
      e.preventDefault();
      this.setPicked(atom.dataset.b ?? null);
      if (atom.classList.contains('nd-math') && atom.dataset.b) this.o.onAtom?.({ kind: 'math', id: atom.dataset.b });
      return;
    }
    // A footnote's mark, a citation or a cross-reference: its box (the caret goes after it).
    const x = t.closest('.nd-x[data-tex]') as HTMLElement | null;
    if (x && this.root.contains(x) && !this.o.readOnly) {
      e.preventDefault();
      const after = x.closest('[data-t]') ? this.posOf(x.parentNode!, indexIn(x) + 1) : null;
      const k = x.dataset.k as 'fn' | 'cite' | 'xref';
      if (after) {
        this.place({ a: after, f: after }, false);
        this.o.onAtom?.({ kind: 'mark', k, at: { ...after, o: after.o - x.dataset.tex!.length }, t: x.dataset.tex!, rect: x.getBoundingClientRect() });
      }
      return;
    }
    // A table's caption: changed in its box.
    const cap = t.closest('caption.nd-cap') as HTMLElement | null;
    if (cap && this.root.contains(cap) && !this.o.readOnly) {
      e.preventDefault();
      const tb = cap.closest('[data-b]') as HTMLElement | null;
      if (tb?.dataset.b) this.o.onAtom?.({ kind: 'caption', id: tb.dataset.b });
      return;
    }
    // An equation among words: changed in its box (the caret goes after it).
    const m = t.closest('.nd-m[data-tex]') as HTMLElement | null;
    if (m && this.root.contains(m) && !this.o.readOnly) {
      e.preventDefault();
      const box = m.closest('[data-t]');
      const after = box ? this.posOf(m.parentNode!, indexIn(m) + 1) : null;
      if (after) {
        this.place({ a: after, f: after }, false);
        this.o.onAtom?.({ kind: 'mathRun', at: { ...after, o: after.o - m.getAttribute('data-tex')!.length }, tex: m.getAttribute('data-tex')! });
      }
      return;
    }
    // A callout's emoji: another one.
    const call = t.closest('.nd-callout') as HTMLElement | null;
    if (call && this.root.contains(call) && !this.o.readOnly) {
      const r = call.getBoundingClientRect();
      const em = parseFloat(getComputedStyle(call).fontSize) || 15;
      if (e.clientX < r.left + em * 2.6 && e.clientY < r.top + em * 2.4) {
        e.preventDefault();
        return this.o.onAtom?.({ kind: 'icon', id: call.dataset.b! });
      }
    }
    const li = t.closest('.nd-check') as HTMLElement | null;
    if (li && this.root.contains(li) && !this.o.readOnly) {
      // The box itself: ticked or not (not the words beside it).
      const st = getComputedStyle(li, '::before');
      const r = li.getBoundingClientRect();
      const x0 = r.left + (parseFloat(st.left) || 0);
      const x1 = x0 + (parseFloat(st.width) || 16);
      const line = parseFloat(getComputedStyle(li).lineHeight) || 24;
      if (e.clientX >= x0 - 6 && e.clientX <= x1 + 6 && e.clientY <= r.top + line + 4) {
        e.preventDefault();
        const id = li.dataset.b!;
        this.before = this.sel;
        return this.commit(ops.toggleCheck(this.doc, id), null);
      }
    }
    if (this.picked) this.setPicked(null);
    const a = t.closest('a[href]') as HTMLAnchorElement | null;
    if (a && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const to = /^#nd-([A-Za-z0-9_-]{1,24})$/.exec(a.getAttribute('href') ?? '')?.[1];
      if (to) this.focusBlock(to);
      else window.open(a.href, '_blank', 'noopener,noreferrer');
    }
  }

  // ---- pasting, copying, dropping ------------------------------------------------------------------------------------

  private ids = () => new Set(this.doc.blocks.map((b) => b.id));

  /** Pasted or dropped content as blocks: this editor's own exactly, other HTML cleaned, plain text as paragraphs. */
  private blocksFrom(dt: DataTransfer, plain: boolean): Block[] {
    const html = plain ? '' : dt.getData('text/html');
    const text = dt.getData('text/plain');
    // A copy is not what comments were made on: their marks stay behind.
    const ours = /<!--naget-doc:([A-Za-z0-9+/=]+)-->/.exec(html);
    if (ours) {
      try {
        const list = ops.withoutComments(normalizeBlocks(JSON.parse(unb64(ours[1])) as unknown[], {}, this.ids()));
        if (list.length) return list;
      } catch {}
    }
    if (html) {
      const list = ops.withoutComments(normalizeBlocks(htmlBlocks(html), {}, this.ids()));
      if (list.length) return list;
    }
    if (!text) return [];
    const lines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
    return normalizeBlocks(
      lines.map((l) => ({ type: 'p', runs: l ? [{ t: l }] : [] })),
      {},
      this.ids(),
    );
  }

  /** Blocks put in where the selection is (what is selected goes); their pictures then taken in. */
  insert(blocks: Block[]) {
    if (!blocks.length) return;
    let e: ops.Edit;
    // A table's cell holds words only: a picture, a table or a line asked for in one goes right after the table.
    const [at] = this.range();
    if (!this.picked && at.c && blocks.some((b) => !ops.isText(b))) {
      const i = ops.indexOf(this.doc, at.b);
      const next = this.doc.blocks[i + 1];
      if (this.suggesting) {
        if (!ops.isText(next)) return this.o.onError(new Error('Put the caret after the table to add this there.'));
        this.sel = { a: { b: next.id, o: 0 }, f: { b: next.id, o: 0 } };
      } else {
        this.before = this.sel;
        const np: Block = { id: ops.freshId(this.doc), type: 'p', runs: [] };
        this.apply(ops.insertBlocks(ops.splice(this.doc, i + 1, 0, [np]), { b: np.id, o: 0 }, blocks));
        void this.takeInPictures(blocks);
        return;
      }
    }
    if (this.suggesting) {
      // After a picked block, at the start of what follows it.
      if (this.picked) {
        const at = ops.nearPos(this.doc, ops.indexOf(this.doc, this.picked) + 1);
        this.setPicked(null);
        this.sel = { a: at, f: at };
      } else this.before = this.sel;
      const [s, en] = this.range();
      this.apply(sg.insertBlocks(this.doc, s, en, blocks, this.suggesting));
      void this.takeInPictures(blocks);
      return;
    }
    if (this.picked) {
      const i = ops.indexOf(this.doc, this.picked);
      const np: Block = { id: ops.freshId(this.doc), type: 'p', runs: [] };
      const d = ops.splice(this.doc, i + 1, 0, [np]);
      this.setPicked(null);
      e = ops.insertBlocks(d, { b: np.id, o: 0 }, blocks);
    } else {
      this.before = this.sel;
      const [s, en] = this.range();
      const cut = ops.deleteRange(this.doc, s, en);
      e = ops.insertBlocks(cut.doc, cut.at, blocks);
    }
    this.apply(e);
    void this.takeInPictures(blocks);
  }

  /** A table of `rows` × `cols` at the caret, the caret in its first cell. */
  insertTable(rows: number, cols: number) {
    const t = ops.newTable(this.doc, rows, cols);
    this.insert([t]);
    this.place({ a: { b: t.id, c: [0, 0], o: 0 }, f: { b: t.id, c: [0, 0], o: 0 } });
  }

  /** A line across, or a page break, at the caret. */
  insertAtom(type: 'hr' | 'pagebreak') {
    this.insert([{ id: ops.freshId(this.doc), type }]);
  }

  /** Pictures from the web or inside what was pasted: kept by the app, their sources changed when they are. */
  private async takeInPictures(blocks: Block[]) {
    for (const b of blocks) {
      if (b.type !== 'image' || b.src.startsWith('naget-asset:')) continue;
      const src = await this.o.takeIn(b.src).catch(() => null);
      if (!src || !ops.blockOf(this.doc, b.id)) continue;
      this.commit(
        ops.patchBlock<ImageBlock>(this.doc, b.id, (x) => ({ ...x, src })),
        null,
        { key: 'picture', pick: this.picked },
      );
    }
  }

  private onPaste(e: ClipboardEvent) {
    if (this.o.readOnly) return;
    e.preventDefault();
    if (e.clipboardData) this.paste(e.clipboardData);
  }

  /** What was copied, put in at the caret (Paste in the Edit menu reads the clipboard itself); `plain`: its words alone. */
  paste(dt: DataTransfer, asPlain = false) {
    if (this.o.readOnly) return;
    if (asPlain) this.plainNext = true;
    const files = [...dt.files].filter((f) => f.type.startsWith('image/'));
    if (files.length && !dt.getData('text/html')) return void this.addPictures(files);
    const [s] = this.range();
    const target = ops.blockOf(this.doc, s.b);
    // In code, words come as they are.
    const plain = this.plainNext || (target?.type === 'p' && target.style === 'code');
    this.plainNext = false;
    if (plain && !this.picked) {
      const text = dt.getData('text/plain').replace(/\r\n?/g, '\n');
      if (!text) return;
      this.before = this.sel;
      const [a, z] = this.range();
      const cut = ops.deleteRange(this.doc, a, z);
      if (target?.type === 'p' && target.style === 'code') return this.apply(ops.insertText(cut.doc, cut.at, text, {}));
    }
    this.insert(this.blocksFrom(dt, plain));
  }

  /** Pictures from the device: each kept by the app, then put in where the caret is. */
  async addPictures(files: File[]) {
    for (const f of files) {
      try {
        const p = await this.o.upload(f);
        this.insert([this.picture(p.src, p.w)]);
      } catch (err) {
        this.o.onError(err);
      }
    }
  }

  /** A picture block of `px` pixels wide, as a share of the text's width (no wider than it). */
  picture(src: string, px: number): ImageBlock {
    const paper = PAPERS[this.doc.page.size];
    const text = ((paper.w - 2 * this.doc.page.margin) * 96) / 25.4;
    return { id: ops.freshId(this.doc), type: 'image', src, w: Math.max(0.05, Math.min(1, Math.round((px / text) * 1000) / 1000)) };
  }

  private onCopy(e: ClipboardEvent, cut: boolean) {
    const [s, en] = this.range();
    const picked = this.picked ? ops.blockOf(this.doc, this.picked) : undefined;
    if (!picked && ops.samePos(s, en)) return;
    e.preventDefault();
    // What is copied is as the suggestions would make it (words marked to go left out).
    const blocks = asAccepted(ops.asDoc(this.doc, picked ? [{ ...picked }] : ops.sliceBlocks(this.doc, s, en))).blocks;
    e.clipboardData?.setData('text/html', copyHtml(blocks, this.o.src));
    e.clipboardData?.setData('text/plain', ops.blocksPlain(blocks));
    if (!cut || this.o.readOnly) return;
    if (picked) return this.removePicked();
    this.before = this.sel;
    if (this.suggesting) {
      const r = sg.remove(this.doc, s, en, this.suggesting);
      return this.apply({ doc: r.doc, at: r.start });
    }
    this.apply(ops.deleteRange(this.doc, s, en));
  }

  private onDrop(e: DragEvent) {
    if (this.o.readOnly || !e.dataTransfer) return;
    e.preventDefault();
    const pt = caretAt(e.clientX, e.clientY);
    const at = pt ? this.posOf(pt.node, pt.offset) : null;
    if (at) {
      this.setPicked(null);
      this.place({ a: at, f: at }, false);
    }
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'));
    if (files.length) return void this.addPictures(files);
    this.insert(this.blocksFrom(e.dataTransfer, false));
  }

  // ---- what the toolbar asks ----------------------------------------------------------------------------------------

  /** A run's look changed between two places: as an edit, or (Suggesting) as a suggestion with the old look kept. */
  private relook(doc: Doc, s: Pos, e: Pos, fr: (r: Run) => Run): Doc {
    return this.suggesting ? sg.look(doc, s, e, fr, this.suggesting) : ops.mapLook(doc, s, e, fr);
  }

  /** A look for the words picked; at a caret, for its word (or, between words, for what is typed next). */
  private looks(fr: (r: Run) => Run, pend: (l: Look) => Look) {
    if (this.picked) return;
    this.before = this.sel;
    const [s, e] = this.range();
    const f = (a: Pos, z: Pos) => this.relook(this.doc, a, z, fr);
    if (ops.samePos(s, e)) {
      const runs = ops.boxRuns(this.doc, s.b, s.c) ?? [];
      const w = ops.wordAt(runs, s.o);
      if (w) {
        const d = f({ ...s, o: w[0] }, { ...s, o: w[1] });
        return this.commit(d, { a: s, f: s });
      }
      this.pending = pend({ ...(this.pending ?? ops.lookAt(runs, s.o)) });
      this.pendingAt = s;
      this.place({ a: s, f: s }, false);
      return this.emitSoon();
    }
    this.commit(f(s, e), this.sel);
  }

  toggle(k: Flag) {
    const [s, e] = this.range();
    const runs = ops.boxRuns(this.doc, s.b, s.c) ?? [];
    const w = ops.samePos(s, e) ? ops.wordAt(runs, s.o) : null;
    const on = ops.samePos(s, e) ? !(w ? ops.allHave(this.doc, { ...s, o: w[0] }, { ...s, o: w[1] }, k) : (this.pending ?? ops.lookAt(runs, s.o))[k]) : !ops.allHave(this.doc, s, e, k);
    this.looks(
      ops.flagFn(k, on),
      (l) => {
        if (on) l[k] = true;
        else delete l[k];
        if (on && k === 'sup') delete l.sub;
        if (on && k === 'sub') delete l.sup;
        return l;
      },
    );
  }

  /** A colour, highlight, size or font (undefined: none of its own). */
  value(k: 'color' | 'hl' | 'size' | 'font', v: string | number | undefined) {
    this.looks(
      ops.valueFn(k, v),
      (l) => {
        if (v === undefined) delete l[k];
        else (l as Record<string, unknown>)[k] = v;
        return l;
      },
    );
  }

  clear() {
    this.looks(ops.clearFn, () => ({}));
  }

  /** A link on the words picked (or the link the caret is in; with `text`, new words with it at the caret); null takes it off. */
  link(url: string | null, text?: string) {
    if (this.picked) return;
    this.before = this.sel;
    const [s, e] = this.range();
    if (ops.samePos(s, e)) {
      const l = ops.linkAt(this.doc, s);
      if (l) return this.commit(ops.setValue(this.doc, { ...s, o: l.from }, { ...s, o: l.to }, 'link', url ?? undefined), { a: s, f: s });
      if (!url) return;
      const words = text?.trim() || url.replace(/^mailto:|^tel:/i, '');
      const look = { ...ops.lookAt(ops.boxRuns(this.doc, s.b, s.c) ?? [], s.o), link: url };
      return this.apply(ops.insertText(this.doc, s, words, look));
    }
    this.commit(ops.setValue(this.doc, s, e, 'link', url ?? undefined), this.sel);
  }

  /** The blocks picked as this style. */
  style(st: ParaStyle) {
    this.before = this.sel;
    const [s, e] = this.range();
    this.commit(ops.setStyle(this.doc, s, e, st), this.sel);
  }

  list(kind: ListKind) {
    this.before = this.sel;
    const [s, e] = this.range();
    this.commit(ops.toggleList(this.doc, s, e, kind), this.sel);
  }

  indent(by: 1 | -1) {
    this.before = this.sel;
    const [s, e] = this.range();
    this.commit(ops.indent(this.doc, s, e, by), this.sel);
  }

  align(a: Align) {
    this.before = this.sel;
    const [s, e] = this.range();
    this.commit(ops.setAlign(this.doc, s, e, a), this.sel);
  }

  table(op: TableOp) {
    const [s] = this.range();
    if (!s.c) return;
    this.before = this.sel;
    this.apply(ops.tableOp(this.doc, s.b, s.c, op));
  }

  /** A picture's width, alignment, caption, description or source. */
  image(id: string, patch: Partial<Omit<ImageBlock, 'id' | 'type'>>) {
    this.before = this.sel;
    this.commit(
      ops.patchBlock<ImageBlock>(this.doc, id, (b) => ({ ...b, ...patch })),
      null,
      { key: `image:${id}:${Object.keys(patch).join()}`, pick: this.picked },
    );
  }

  /** The picked block out (its place goes to the words after it). */
  removePicked() {
    if (!this.picked) return;
    const id = this.picked;
    this.setPicked(null);
    this.apply(this.suggesting ? sg.removeBlock(this.doc, id, this.suggesting) : ops.removeBlock(this.doc, id));
  }

  /** Enter on a picked block: a paragraph after it, the caret in it. */
  private afterPicked() {
    if (!this.picked) return;
    const i = ops.indexOf(this.doc, this.picked);
    const np: Block = { id: ops.freshId(this.doc), type: 'p', runs: [] };
    this.setPicked(null);
    this.apply({ doc: ops.splice(this.doc, i + 1, 0, [np]), at: { b: np.id, o: 0 } });
  }

  /** The caret at a block's start, in view. */
  focusBlock(id: string) {
    const at = ops.nearPos(this.doc, ops.indexOf(this.doc, id));
    this.setPicked(null);
    this.els.get(id)?.scrollIntoView({ block: 'start', behavior: 'instant' as ScrollBehavior });
    this.place({ a: at, f: at }, false);
    this.emitSoon();
  }

  /** The document's paper, margins, font or size, its header and footer, its comments. */
  setDoc(patch: Partial<Pick<Doc, 'page' | 'font' | 'size' | 'header' | 'footer' | 'titlePage' | 'comments'>>) {
    this.before = this.sel;
    const next: Doc = { ...this.doc, ...patch };
    for (const k of ['header', 'footer', 'titlePage', 'comments'] as const) if (next[k] === undefined || (k === 'comments' && !next.comments?.length)) delete next[k];
    if (!next.header && !next.footer) delete next.titlePage;
    this.commit(next, null, { key: `doc:${Object.keys(patch).join()}` });
  }

  /** The header, footer or title page changed. */
  setBands(patch: { header?: Band | null; footer?: Band | null; titlePage?: boolean }) {
    this.setDoc({
      ...('header' in patch ? { header: patch.header ?? undefined } : {}),
      ...('footer' in patch ? { footer: patch.footer ?? undefined } : {}),
      ...('titlePage' in patch ? { titlePage: patch.titlePage || undefined } : {}),
    });
  }

  // ---- what the menus ask ----------------------------------------------------------------------------------------------

  /** Line spacing, or the space before or after, for the paragraphs picked. */
  spacing(patch: Spacing) {
    this.before = this.sel;
    const [s, e] = this.range();
    this.commit(ops.setSpacing(this.doc, s, e, patch), this.sel);
  }

  /** A callout's emoji or tint. */
  callout(id: string, patch: { icon?: string; tint?: string }) {
    this.before = this.sel;
    const clean = { ...patch };
    if (clean.icon === CALLOUT.icon) clean.icon = undefined;
    if (clean.tint === CALLOUT.tint) clean.tint = undefined;
    this.commit(ops.setCallout(this.doc, id, clean), this.sel);
  }

  /** The words picked as another case. */
  setCase(k: ops.Case) {
    this.before = this.sel;
    const [s, e] = this.range();
    if (ops.samePos(s, e)) {
      const w = ops.wordAt(ops.boxRuns(this.doc, s.b, s.c) ?? [], s.o);
      if (w) return this.commit(ops.setCase(this.doc, { ...s, o: w[0] }, { ...s, o: w[1] }, k), { a: s, f: s });
      return;
    }
    this.commit(ops.setCase(this.doc, s, e, k), this.sel);
  }

  /** A comment's mark on the words picked (false when no words are). */
  comment(id: string, doc?: Doc): boolean {
    const [s, e] = this.range();
    if (ops.samePos(s, e) || !ops.textBetween(this.doc, s, e).trim()) return false;
    this.before = this.sel;
    this.commit(ops.markComment(doc ?? this.doc, s, e, id), this.sel);
    return true;
  }

  /** The comments changed (one added, answered, resolved, edited); a deleted one's marks go too. */
  setComments(list: Doc['comments'], gone?: string) {
    this.before = this.sel;
    let d: Doc = { ...this.doc, comments: list };
    if (!list?.length) delete d.comments;
    if (gone) d = ops.unmarkComment(d, gone);
    this.commit(d, null, { key: undefined, pick: this.picked });
  }

  /** A new comment on the words picked, as one change (its marks and its thread). */
  addComment(c: NonNullable<Doc['comments']>[number]): boolean {
    const [s, e] = this.range();
    if (ops.samePos(s, e) || !ops.textBetween(this.doc, s, e).trim()) return false;
    this.before = this.sel;
    this.commit(ops.markComment({ ...this.doc, comments: [...(this.doc.comments ?? []), c] }, s, e, c.id), this.sel);
    return true;
  }

  /**
   * A comment's words brought into view (false when they are gone). The editor marks them as the comment picked; the
   * caret and the focus stay where they are, so a reply can be written in its place.
   */
  revealComment(id: string): boolean {
    if (!ops.commentSpan(this.doc, id)) return false;
    const el = this.root.querySelector(`[data-cm~="${CSS.escape(id)}"]`);
    let sc: HTMLElement | null = this.root.parentElement;
    while (sc && !/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement;
    if (el && sc) {
      const r = el.getBoundingClientRect();
      const box = sc.getBoundingClientRect();
      if (r.top < box.top + 40 || r.bottom > box.bottom - 40) sc.scrollTop += r.top - box.top - box.height / 3;
    }
    return true;
  }

  /** A suggestion accepted or rejected (null: every one), as one change to undo. */
  resolve(id: string | null, accept: boolean) {
    this.before = this.sel;
    this.commit(resolveSuggestion(this.doc, id, accept), this.sel, { pick: null });
  }

  /** The suggestions' list changed (a reply). */
  setSuggestions(list: Doc['suggestions']) {
    this.before = this.sel;
    const d: Doc = { ...this.doc, suggestions: list };
    if (!list?.length) delete d.suggestions;
    this.commit(d, null, { pick: this.picked });
  }

  /** A suggestion's words (or block) brought into view (false when it marks nothing on the page). */
  revealSuggestion(id: string): boolean {
    const el = this.root.querySelector(`[data-s="${CSS.escape(id)}"]`);
    if (!el) return false;
    let sc: HTMLElement | null = this.root.parentElement;
    while (sc && !/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement;
    if (sc) {
      const r = el.getBoundingClientRect();
      const box = sc.getBoundingClientRect();
      if (r.top < box.top + 40 || r.bottom > box.bottom - 40) sc.scrollTop += r.top - box.top - box.height / 3;
    }
    return true;
  }

  /** Words found, put in place of others: one stretch, or many as one change (to undo together). */
  replace(list: ops.Found[], text: (f: ops.Found) => string) {
    if (!list.length) return;
    this.before = this.sel;
    if (this.suggesting) return this.commit(sg.replace(this.doc, list, text, this.suggesting), this.sel);
    // From the last to the first, so the places of the ones before stay where they are.
    const sorted = [...list].sort((x, y) => -ops.cmp(this.doc, { b: x.b, c: x.c, o: x.s }, { b: y.b, c: y.c, o: y.s }));
    let d = this.doc;
    for (const f of sorted) d = ops.replaceIn(d, f, text(f));
    const first = list.length === 1 ? list[0] : null;
    const at: Pos | null = first ? { b: first.b, ...(first.c ? { c: first.c } : {}), o: first.s + text(first).length } : null;
    this.commit(d, at ? { a: at, f: at } : null);
  }

  /** Words put in at the caret, in place of what is picked (a character, a date). */
  typeText(text: string) {
    if (this.picked) return;
    this.before = this.sel;
    const [s, e] = this.range();
    const look = this.pending ?? ops.lookAt(ops.boxRuns(this.doc, s.b, s.c) ?? [], s.o);
    this.pending = null;
    if (this.suggesting) return this.apply(sg.insert(this.doc, s, e, text, look, this.suggesting));
    const cut = ops.deleteRange(this.doc, s, e);
    this.apply(ops.insertText(cut.doc, cut.at, text, look));
  }

  /** The words in the caret's block before it (for "/" commands), and where they are. */
  before_(): { at: Pos; text: string } | null {
    const [s, e] = this.range();
    if (!ops.samePos(s, e) || this.picked) return null;
    const runs = ops.boxRuns(this.doc, s.b, s.c);
    return runs ? { at: s, text: runsText(runs).slice(0, s.o) } : null;
  }

  /** Words taken out of the caret's block, from `from` to the caret (a "/" command typed). */
  cutBack(from: number) {
    const [s] = this.range();
    if (from >= s.o) return;
    this.before = this.sel;
    if (this.suggesting) {
      const r = sg.remove(this.doc, { ...s, o: from }, s, this.suggesting);
      return this.apply({ doc: r.doc, at: r.start });
    }
    this.apply(ops.deleteRange(this.doc, { ...s, o: from }, s));
  }

  /** Where the caret (or what is picked) is on the screen. */
  caretRect(): DOMRect | null {
    if (this.picked) return this.els.get(this.picked)?.getBoundingClientRect() ?? null;
    const sel = window.getSelection();
    if (!sel?.rangeCount || !this.root.contains(sel.anchorNode)) return null;
    const r = sel.getRangeAt(0);
    const rects = r.getClientRects();
    const rect = rects.length ? rects[rects.length - 1] : r.getBoundingClientRect();
    if (rect.height) return rect;
    const n = sel.focusNode;
    const el = (n?.nodeType === 1 ? (n as Element) : n?.parentElement)?.closest('[data-t], [data-b]');
    return el?.getBoundingClientRect() ?? null;
  }

  // ---- equations, a table of contents ------------------------------------------------------------------------------------

  /** An equation on a line of its own at the caret; its id. */
  insertMath(tex: string): string {
    const id = ops.freshId(this.doc);
    this.insert([{ id, type: 'math', tex }]);
    this.setPicked(id);
    return id;
  }

  /** An equation's LaTeX (none: it goes). */
  setMath(id: string, tex: string) {
    this.before = this.sel;
    if (!tex.trim()) {
      this.setPicked(null);
      return this.apply(ops.removeBlock(this.doc, id));
    }
    this.commit(
      ops.patchBlock(this.doc, id, (b) => (b.type === 'math' ? { ...b, tex } : b)),
      null,
      { key: `math:${id}`, pick: this.picked },
    );
  }

  /** Maths among the words, at the caret; where it starts. */
  insertMathRun(tex: string): Pos | null {
    if (this.picked || !tex.trim()) return null;
    this.before = this.sel;
    const [s, e] = this.range();
    if (this.suggesting) {
      const r = ops.samePos(s, e) ? { doc: this.doc, end: s } : sg.remove(this.doc, s, e, this.suggesting);
      this.apply(sg.insertRuns(r.doc, r.end, [{ t: tex.trim(), math: true }], this.suggesting));
      return r.end;
    }
    const cut = ops.deleteRange(this.doc, s, e);
    this.apply(ops.insertRuns(cut.doc, cut.at, [{ t: tex.trim(), math: true }]));
    return cut.at;
  }

  /** Maths among the words changed (none: it goes), found where it starts. */
  setMathRun(at: Pos, tex: string) {
    const runs = ops.boxRuns(this.doc, at.b, at.c);
    if (!runs) return;
    let o = 0;
    const i = runs.findIndex((r) => {
      const hit = r.math && o === at.o;
      o += r.t.length;
      return hit;
    });
    if (i < 0) return;
    this.before = this.sel;
    const next = tex.trim() ? runs.map((r, k) => (k === i ? { ...r, t: tex.trim() } : r)) : runs.filter((_, k) => k !== i);
    const end: Pos = { ...at, o: at.o + (tex.trim() ? tex.trim().length : 0) };
    this.commit(ops.setBox(this.doc, at.b, at.c, next), { a: end, f: end });
  }

  /** A document made elsewhere (by the AI, a dialog) put in place of this one, as one change to undo. */
  change(next: Doc, key?: string) {
    this.before = this.sel;
    this.commit(next, this.sel, { key, pick: this.picked && ops.blockOf(next, this.picked) ? this.picked : null });
  }

  /** Where the history is now, to come back to (undoTo) while nothing else changed since. */
  mark(): Doc {
    return this.doc;
  }

  /** Undone back to a mark (true), unless the document has changed in another way since (false: left as it is). */
  undoTo(mark: Doc): boolean {
    if (this.doc === mark) return true;
    const at = this.past.findIndex((p) => p.doc === mark);
    if (at < 0) return false;
    while (this.past.length > at && this.doc !== mark) this.undo();
    return this.doc === mark;
  }

  /** A footnote's mark, a citation or a cross-reference at the caret (in place of what is picked); where it starts. */
  insertRun(run: Run): Pos | null {
    if (this.picked) return null;
    this.before = this.sel;
    const [s, e] = this.range();
    if (this.suggesting) {
      const r = ops.samePos(s, e) ? { doc: this.doc, end: s } : sg.remove(this.doc, s, e, this.suggesting);
      this.apply(sg.insertRuns(r.doc, r.end, [run], this.suggesting));
      return r.end;
    }
    const cut = ops.deleteRange(this.doc, s, e);
    this.apply(ops.insertRuns(cut.doc, cut.at, [run]));
    return cut.at;
  }

  /** A thing of its own among the words, found where it starts, changed (`t`: what it keeps) or taken out (null). */
  setAtom(at: Pos, t: string | null, doc?: Doc) {
    const base = doc ?? this.doc;
    const runs = ops.boxRuns(base, at.b, at.c);
    if (!runs) return;
    let o = 0;
    const i = runs.findIndex((r) => {
      const hit = isAtom(r) && o === at.o;
      o += r.t.length;
      return hit;
    });
    if (i < 0) return;
    this.before = this.sel;
    const next = t ? runs.map((r, k) => (k === i ? { ...r, t } : r)) : runs.filter((_, k) => k !== i);
    const end: Pos = { ...at, o: at.o + (t ? t.length : 0) };
    this.commit(ops.setBox(base, at.b, at.c, next), { a: end, f: end });
  }

  /** A block moved before the block now at `to` (dragged by its handle). */
  moveBlock(id: string, to: number) {
    this.before = this.sel;
    this.setPicked(null);
    this.apply(ops.moveBlock(this.doc, id, to));
  }

  /** A table of contents at the caret. */
  insertToc() {
    this.insert([{ id: ops.freshId(this.doc), type: 'toc' }]);
  }

  // ---- tables ----------------------------------------------------------------------------------------------------------

  /** The cells picked (from one to another), or the caret's. */
  private cellPick(): { b: string; a: [number, number]; f: [number, number] } | null {
    const [s, e] = this.range();
    if (!s.c) return null;
    return { b: s.b, a: s.c, f: e.c && e.b === s.b ? e.c : s.c };
  }

  /** The cells picked merged into one. */
  mergeCells() {
    const p = this.cellPick();
    if (!p) return;
    this.before = this.sel;
    this.apply(ops.mergeCells(this.doc, p.b, p.a, p.f));
  }

  /** The merged cell at the caret split up again. */
  unmergeCell() {
    const p = this.cellPick();
    if (!p) return;
    this.before = this.sel;
    this.apply(ops.unmergeCell(this.doc, p.b, p.a));
  }

  /** A fill, or where words sit up and down, for the cells picked. */
  cells(patch: { fill?: string; va?: 'middle' | 'bottom' }) {
    const p = this.cellPick();
    if (!p) return;
    this.before = this.sel;
    this.commit(ops.setCells(this.doc, p.b, p.a, p.f, patch), this.sel);
  }

  /** A table's columns' widths. */
  setCols(id: string, cols: number[]) {
    this.before = this.sel;
    this.commit(ops.setCols(this.doc, id, cols), null, { key: `cols:${id}` });
  }

  // ---- the format painter ------------------------------------------------------------------------------------------------

  /** The format painter on: it carries the look of the words at the caret, and their paragraph's style, to the next words picked. */
  startPaint(sticky: boolean) {
    const [s] = this.range();
    const runs = ops.boxRuns(this.doc, s.b, s.c) ?? [];
    const { link: _l, cm: _c, math: _m, fn: _n, cite: _ci, xref: _x, ...look } = this.pending ?? ops.lookAt(runs, s.o);
    const b = ops.blockOf(this.doc, s.b);
    const para = !s.c && b && ops.isText(b) ? { style: b.type === 'p' ? (b.style ?? 'normal') : ('normal' as ParaStyle), align: b.align, lh: b.lh, sb: b.sb, sa: b.sa } : null;
    this.paint = { look, para, sticky };
    this.root.classList.add('nd-painting');
    this.emitSoon();
  }

  stopPaint() {
    if (!this.paint) return;
    this.paint = null;
    this.root.classList.remove('nd-painting');
    this.emitSoon();
  }

  /** Words just picked, while the painter is on: they take its look. */
  private painted() {
    const p = this.paint;
    if (!p || this.o.readOnly) return;
    const [s, e] = this.range();
    if (ops.samePos(s, e)) return;
    this.before = this.sel;
    let d = this.relook(this.doc, s, e, (r) => (isAtom(r) ? r : { t: r.t, ...p.look, ...(r.link ? { link: r.link } : {}), ...(r.cm ? { cm: r.cm } : {}), ...(r.ins ? { ins: r.ins } : {}), ...(r.del ? { del: r.del } : {}), ...(r.fmt ? { fmt: r.fmt, was: r.was } : {}) }));
    if (p.para && !s.c) {
      const para = p.para;
      d = ops.setStyle(d, s, e, para.style);
      d = ops.setAlign(d, s, e, para.align ?? 'left');
      d = ops.setSpacing(d, s, e, { lh: para.lh, sb: para.sb, sa: para.sa });
    }
    this.commit(d, this.sel);
    if (!p.sticky) {
      this.stopPaint();
      this.o.onPainted?.();
    }
  }

  /** The document as Markdown (to copy it all as text). */
  markdown = () => docMarkdown(this.doc);

  /** The element of the link the caret is in. */
  linkElement(): HTMLElement | null {
    const n = window.getSelection()?.anchorNode;
    const el = (n?.nodeType === 1 ? (n as Element) : n?.parentElement)?.closest('a[href]');
    return el && this.root.contains(el) ? (el as HTMLElement) : null;
  }
}
