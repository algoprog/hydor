// Pages, as Word and Google Docs lay a document out: the editor's words stay one flow (one contentEditable element,
// engine.ts) cut into pages of the document's paper. A block that does not fit at the bottom of a page goes on to the
// next one (moved down by a margin of its own); a paragraph or a list item longer than what is left is cut between two
// of its lines (two at least on each page), a table between two rows (never inside merged cells; its header row drawn
// again at the top of the next page), by an element of the layout's own where the page turns (never words: the engine
// reads past it); a heading goes on with what follows it; a page break starts the next page. Page i's top in the flow
// is i × (the paper's height + a gap), so the sheets, their header and footer and page numbers are drawn behind and
// over the words (PaperSheets.tsx). Laid out again after a pause in typing, from the page of the first block that
// changed; meanwhile a block the editor draws anew keeps what the last layout gave it (a paragraph cut is cut again at
// once, for its own lines). The rules are the PDF's (server/pages/docs.ts printCss), so the pages come out close to it.
import { paperOf, type Block, type Doc, type TableBlock } from '@shared/docs';
import type { Pos } from './ops';

/** The gap between two sheets, in the paper's own pixels. */
export const GAP = 16;
const MM = 96 / 25.4;
/** What marks the layout's own elements in the flow (the engine reads past them). */
export const CUT = 'data-nd-cut';

export interface Layout {
  /** Pages, one at least. */
  count: number;
  /** A sheet's height and the margin on it, in the paper's own (unzoomed) pixels. */
  pageH: number;
  margin: number;
  /** Changes with each layout (for what is drawn over the page to measure again). */
  n: number;
  /** The footnotes at each page's foot (by page), and the room they take there (pixels, the line over them too). */
  notes: Map<number, { ids: string[]; h: number }>;
}

/** What the layout needs of a document's footnotes: which a block brings to its page (their first marks are in it), and how tall each is drawn. */
export interface NoteRoom {
  ids: (b: Block) => string[];
  height: (id: string) => number;
  /** The line over a page's footnotes and the room around it. */
  sep: number;
}

/** What the engine gives the layout: its page, its model, its blocks' elements and its places. */
export interface PagedEngine {
  root: HTMLElement;
  doc: Doc;
  elementOf: (id: string) => HTMLElement | null;
  domOf: (p: Pos) => { node: Node; offset: number } | null;
}

/** Where a block is cut: before a character of its words, before a row of a table, or before a line of a table of contents. */
type Cut = { o: number; h: number } | { row: number; h: number; head: boolean } | { child: number; h: number };

interface Plan {
  /** The margin that moves it to the top of the next page. */
  push?: number;
  /** Where it is cut, top to bottom. */
  cuts?: Cut[];
}

/** Whether a kind of block may be cut between its lines: always, only when it is longer than a page, or never. */
function cutting(b: Block): 'yes' | 'long' | 'no' {
  if (b.type === 'li' || b.type === 'table' || b.type === 'toc') return 'yes';
  if (b.type !== 'p') return 'no';
  const s = b.style ?? 'normal';
  if (s === 'title' || s === 'subtitle' || /^h\d$/.test(s)) return 'no';
  // The PDF keeps code and callouts whole where they fit on a page.
  if (s === 'code' || s === 'callout') return 'long';
  return 'yes';
}

/** A heading (or the title) goes on to the next page with what follows it. */
const keepsWithNext = (b: Block | undefined) => !!b && b.type === 'p' && (b.style === 'title' || b.style === 'subtitle' || /^h\d$/.test(b.style ?? ''));

/** Where one character of a block's words is drawn (its last box, should it be split). */
function charRect(eng: PagedEngine, id: string, o: number, len: number): DOMRect | null {
  const a = eng.domOf({ b: id, o });
  const z = eng.domOf({ b: id, o: Math.min(len, o + 1) });
  if (!a || !z) return null;
  const r = document.createRange();
  try {
    r.setStart(a.node, a.offset);
    r.setEnd(z.node, z.offset);
  } catch {
    return null;
  }
  const rects = [...r.getClientRects()].filter((x) => x.height > 0);
  return rects[rects.length - 1] ?? null;
}

export class Paging {
  private plans = new Map<string, Plan>();
  private pageOf = new Map<string, number>();
  private laid: Block[] | null = null;
  private dirty: number | null = null;
  private timer = 0;
  private since = 0;
  private on = false;
  private n = 0;
  private imgs = (e: Event) => (e.target as HTMLElement)?.tagName === 'IMG' && this.soon(0);
  layout: Layout | null = null;

  constructor(
    private eng: PagedEngine,
    private o: { zoom: () => number; onLayout: (l: Layout | null) => void; notes?: () => NoteRoom | null },
  ) {
    // A picture's height is known once it has loaded: the pages from there on move.
    eng.root.addEventListener('load', this.imgs, true);
  }

  destroy() {
    window.clearTimeout(this.timer);
    this.eng.root.removeEventListener('load', this.imgs, true);
  }

  /** Another document (or version) drawn: what the last layout gave its blocks is forgotten, and it is laid out anew soon. */
  reload() {
    this.plans.clear();
    this.pageOf.clear();
    this.laid = null;
    this.soon(0);
  }

  /** Pages on (the paper is shown) or off (a phone, a narrow window: the words fill the width, no pages). */
  setOn(on: boolean) {
    if (on === this.on) return;
    this.on = on;
    if (!on) {
      window.clearTimeout(this.timer);
      this.timer = 0;
      for (const b of this.eng.doc.blocks) this.clear(b.id);
      this.plans.clear();
      this.pageOf.clear();
      this.laid = null;
      this.layout = null;
      this.o.onLayout(null);
    }
  }

  private geometry(doc: Doc, room?: Map<number, { ids: string[]; h: number }>) {
    const pageH = paperOf(doc.page).h * MM;
    const margin = doc.page.margin * MM;
    const step = pageH + GAP;
    // A page's words end over its footnotes.
    return { pageH, margin, step, top: (p: number) => p * step + margin, bottom: (p: number) => p * step + pageH - margin - (room?.get(p)?.h ?? 0), contentH: pageH - 2 * margin };
  }

  /** The model changed: laid out again soon, from the first block that changed. */
  changed(doc: Doc) {
    if (!this.on) return;
    const before = this.laid;
    let i = 0;
    if (before) while (i < doc.blocks.length && i < before.length && doc.blocks[i] === before[i]) i++;
    this.soon(before ? i : 0);
  }

  /** Laid out again after a pause (and at least once a second while changes keep coming). */
  soon(from: number) {
    if (!this.on) return;
    this.dirty = this.dirty === null ? from : Math.min(this.dirty, from);
    const now = performance.now();
    if (!this.timer) this.since = now;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.run(), now - this.since > 1000 ? 0 : 280);
  }

  /**
   * Blocks the editor drew anew: what the last layout gave them put back at once (a cut paragraph cut again for its own
   * lines), so nothing jumps while the next layout waits.
   */
  drawn(ids: string[] | null) {
    if (!this.on || !this.layout) return;
    const doc = this.eng.doc;
    const list = ids ?? doc.blocks.map((b) => b.id);
    for (const id of list) {
      const plan = this.plans.get(id);
      const el = this.eng.elementOf(id);
      if (!plan || !el) continue;
      if (plan.push) this.applyPush(el, plan.push);
      if (plan.cuts?.length) {
        const i = doc.blocks.findIndex((b) => b.id === id);
        if (i >= 0) this.recut(doc.blocks[i], el);
      }
    }
  }

  /** A paragraph or table cut where its lines (rows) cross its pages' bottoms now, the pages it is on kept. */
  private recut(b: Block, el: HTMLElement) {
    this.clearCuts(el);
    const g = this.geometry(this.eng.doc);
    const z = this.o.zoom();
    const rootTop = this.eng.root.getBoundingClientRect().top;
    const y = (v: number) => (v - rootTop) / z;
    const top = y(el.getBoundingClientRect().top);
    const page = Math.max(0, Math.floor(top / g.step));
    const cuts = this.cutsOf(b, el, g, page, 0, y, true);
    this.plans.set(b.id, { ...this.plans.get(b.id), cuts: cuts?.cuts });
    if (cuts) this.applyCuts(b, el, cuts.cuts);
  }

  /** The layout worked out now: from the page of the first block changed since the last one (`from`, or 0 for all). */
  run(from?: number) {
    window.clearTimeout(this.timer);
    this.timer = 0;
    if (!this.on) return;
    const doc = this.eng.doc;
    const blocks = doc.blocks;
    // The footnotes each page holds, as the walk puts their blocks on pages (those before where it starts, as they were).
    const nr = this.o.notes?.() ?? null;
    const room = new Map<number, { ids: string[]; h: number }>();
    const g = this.geometry(doc, room);
    const changed = from ?? this.dirty ?? 0;
    this.dirty = null;
    const index = new Map(blocks.map((b, i) => [b.id, i]));
    // Where to start: the first block of the page the first changed block was on (those before it stay where they are).
    let start = Math.min(changed, blocks.length);
    if (!this.laid || !this.layout) start = 0;
    else if (start > 0) {
      const pageAt = (k: number) => this.pageOf.get(blocks[k]?.id ?? '');
      const page = pageAt(start) ?? pageAt(start - 1);
      if (page === undefined) start = 0;
      else while (start > 0 && pageAt(start - 1) === page) start--;
    }
    for (let i = start; i < blocks.length; i++) this.clear(blocks[i].id);
    // Where each block lies with nothing moved (the page laid out once, then read).
    const z = this.o.zoom();
    const rootTop = this.eng.root.getBoundingClientRect().top;
    const y = (v: number) => (v - rootTop) / z;
    const els = blocks.map((b) => this.eng.elementOf(b.id));
    const box = (i: number) => {
      const r = els[i]?.getBoundingClientRect();
      return r ? { top: y(r.top), bottom: y(r.bottom) } : null;
    };
    const plans = new Map<string, Plan>();
    const pages = new Map<string, number>();
    for (const [id, pg] of this.pageOf) if ((index.get(id) ?? Infinity) < start) pages.set(id, pg);
    /** A block's footnotes onto a page's foot (or off it again, `sign` -1). */
    const notesOf = (b: Block) => (nr ? nr.ids(b) : []);
    const addNotes = (p: number, ids: string[], sign: 1 | -1) => {
      if (!ids.length || !nr) return;
      const cur = room.get(p) ?? { ids: [], h: 0 };
      const h = ids.reduce((n, id) => n + nr.height(id), 0);
      const list = sign > 0 ? [...cur.ids, ...ids] : cur.ids.filter((x) => !ids.includes(x));
      if (!list.length) room.delete(p);
      else room.set(p, { ids: list, h: Math.max(0, cur.h + sign * h + (sign > 0 && !cur.ids.length ? nr.sep : 0) - (sign < 0 && !list.length ? nr.sep : 0)) });
    };
    for (let i = 0; i < start; i++) {
      const pg = pages.get(blocks[i].id);
      if (pg !== undefined) addNotes(pg, notesOf(blocks[i]), 1);
    }
    // Each block's walk starts from where the one before left off: how far blocks are moved down from where they lie
    // (`shift`), where the last one ends, and the page it ended on. Kept per block, to walk a heading again.
    const states: { shift: number; prevBottom: number; page: number }[] = [];
    let shift = 0;
    let prevBottom = start > 0 ? (box(start - 1)?.bottom ?? g.margin) : g.margin;
    let page = start > 0 ? (this.pageOf.get(blocks[start - 1].id) ?? 0) : 0;
    let breakPage = -1;
    for (let i = start; i < blocks.length; i++) {
      const b = blocks[i];
      const el = els[i];
      const nat = box(i);
      states[i] = { shift, prevBottom, page };
      if (!el || !nat) continue;
      const plan: Plan = {};
      let top = nat.top + shift;
      let bottom = nat.bottom + shift;
      // Its footnotes go at the foot of the page it starts on (and move with it).
      const ids = notesOf(b);
      let notesAt = -1;
      const moveTo = (p: number) => {
        const target = g.top(p);
        plan.push = Math.max(0, target - prevBottom);
        shift += target - top;
        top = target;
        bottom = nat.bottom + shift;
        page = p;
        if (notesAt >= 0 && notesAt !== p) {
          addNotes(notesAt, ids, -1);
          addNotes(p, ids, 1);
          notesAt = p;
        }
      };
      const how = cutting(b);
      const long = nat.bottom - nat.top > g.contentH + 0.5;
      const cut = (first: boolean) => {
        if (!(how === 'yes' || (how === 'long' && long))) return false;
        const c = this.cutsOf(b, el, g, page, shift, y, first);
        if (!c) return false;
        plan.cuts = c.cuts;
        shift += c.added;
        bottom = nat.bottom + shift;
        page = c.page;
        return true;
      };
      // Past a page's words a block starts the next page; after a page break, the page after the break's.
      while (top >= g.bottom(page) - 0.5) page++;
      if (breakPage >= 0) {
        if (page <= breakPage || top > g.top(breakPage + 1) + 2) moveTo(breakPage + 1);
        breakPage = -1;
      }
      // Starting above its page's words (in a margin, or between two sheets): moved down to them.
      if (top < g.top(page) - 0.5) moveTo(page);
      if (ids.length) {
        addNotes(page, ids, 1);
        notesAt = page;
      }
      if (b.type === 'pagebreak') {
        breakPage = page;
      } else if (bottom > g.bottom(page) + 0.5) {
        const first = top <= g.top(page) + 2;
        if (!cut(first) && !first) {
          const prev = blocks[i - 1];
          const ps = states[i - 1];
          const hp = prev ? pages.get(prev.id) : undefined;
          const pb = box(i - 1);
          // A heading at the bottom of its page goes on to the next one with this block (unless it starts its page).
          if (keepsWithNext(prev) && i - 1 >= start && ps && pb && hp === page && plans.get(prev.id)?.push === undefined && pb.top + ps.shift > g.top(page) + 2) {
            shift = ps.shift;
            prevBottom = ps.prevBottom;
            const hTop = pb.top + shift;
            plans.set(prev.id, { push: Math.max(0, g.top(hp + 1) - prevBottom) });
            shift += g.top(hp + 1) - hTop;
            page = hp + 1;
            pages.set(prev.id, page);
            prevBottom = pb.bottom + shift;
            top = nat.top + shift;
            bottom = nat.bottom + shift;
          } else moveTo(page + 1);
          // Still longer than the page (or what is left of it after the heading): cut where it can be.
          if (bottom > g.bottom(page) + 0.5) cut(true);
        }
      }
      pages.set(b.id, page);
      if (plan.push !== undefined || plan.cuts) plans.set(b.id, plan);
      prevBottom = bottom;
      // A block that hangs over its page's end (it could not be cut): what follows starts after it.
      while (bottom > g.bottom(page) + g.margin + GAP / 2) page++;
    }
    // Put on the page: the margins that move blocks, and the cuts.
    for (let i = start; i < blocks.length; i++) {
      const id = blocks[i].id;
      const plan = plans.get(id);
      if (plan) this.plans.set(id, plan);
      else this.plans.delete(id);
      const el = els[i];
      if (!plan || !el) continue;
      if (plan.push !== undefined) this.applyPush(el, plan.push);
      if (plan.cuts) this.applyCuts(blocks[i], el, plan.cuts);
    }
    for (const id of [...this.plans.keys()]) if (!index.has(id)) this.plans.delete(id);
    this.pageOf = pages;
    this.laid = blocks;
    let count = Math.max(1, page + 1);
    while (prevBottom > g.bottom(count - 1) + g.margin + 1) count++;
    this.layout = { count, pageH: g.pageH, margin: g.margin, n: ++this.n, notes: room };
    this.o.onLayout(this.layout);
  }

  /** The page a block is on (0 first), as the last layout put it. */
  pageOfBlock = (id: string) => this.pageOf.get(id);

  /** Where a block is cut, by its kind. */
  private cutsOf(b: Block, el: HTMLElement, g: ReturnType<Paging['geometry']>, page: number, shift: number, y: (v: number) => number, first: boolean) {
    if (b.type === 'table') return this.tableCuts(b, el, g, page, shift, y, first);
    if (b.type === 'toc') return this.childCuts(el, g, page, shift, y, first);
    return this.textCuts(b, el, g, page, shift, y, first);
  }

  /** Where a table of contents is cut: before each of its lines that crosses a page's bottom. */
  private childCuts(el: HTMLElement, g: ReturnType<Paging['geometry']>, page: number, shift: number, y: (v: number) => number, first: boolean): { cuts: Cut[]; added: number; page: number } | null {
    const kids = [...el.children].filter((k) => !k.hasAttribute(CUT));
    if (kids.length < 2) return null;
    const box = kids.map((k) => {
      const r = k.getBoundingClientRect();
      return { top: y(r.top), bottom: y(r.bottom) };
    });
    const cuts: Cut[] = [];
    let added = 0;
    let p = page;
    let from = 0;
    for (;;) {
      const k = box.findIndex((x, j) => j > from && x.bottom + shift + added > g.bottom(p) + 0.5);
      if (k < 0) break;
      if (k - from < 2 && from === 0 && !first) return null;
      const h = g.top(p + 1) - (box[k].top + shift + added);
      if (h <= 0) break;
      cuts.push({ child: k, h });
      added += h;
      p++;
      from = k;
    }
    return cuts.length ? { cuts, added, page: p } : null;
  }

  /**
   * Where a paragraph or item is cut (its lines measured as they lie, moved down by `shift`): before each line that
   * crosses a page's bottom, two lines at least kept on each page and two going on (where it has them). Null when fewer
   * than two of its lines fit on this page (it goes on to the next whole), unless it starts its page (`first`).
   */
  private textCuts(b: Block, el: HTMLElement, g: ReturnType<Paging['geometry']>, page: number, shift: number, y: (v: number) => number, first: boolean): { cuts: Cut[]; added: number; page: number } | null {
    if (b.type !== 'p' && b.type !== 'li') return null;
    const lines = this.lines(el, y);
    if (lines.length < 2) return null;
    const len = b.runs.reduce((n, r) => n + r.t.length, 0);
    const cuts: Cut[] = [];
    let added = 0;
    let p = page;
    let from = 0;
    for (;;) {
      let k = lines.findIndex((l, j) => j > from && l.bottom + shift + added > g.bottom(p) + 0.5);
      if (k < 0) break;
      // Two lines going on to the next page, where this one keeps three or more.
      if (lines.length - k === 1 && k - from >= 3) k--;
      // Two lines at least on this page: fewer, and it goes on to the next page whole (unless it starts this one).
      if (k - from < 2 && from === 0 && !first) return null;
      const o = this.lineStart(b.id, lines[k].text, len);
      if (o === null || o <= 0 || o >= len) break;
      const h = g.top(p + 1) - (lines[k].top + shift + added);
      if (h <= 0) break;
      cuts.push({ o, h });
      added += h;
      p++;
      from = k;
    }
    return cuts.length ? { cuts, added, page: p } : null;
  }

  /** A text block's lines, top to bottom: each line's box (half way to its neighbours') and the top of its words. */
  private lines(el: HTMLElement, y: (v: number) => number): { top: number; bottom: number; text: number }[] {
    // The words' own boxes (not their elements', which KaTeX draws taller than its line), grouped into lines.
    const rects: DOMRect[] = [];
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const r = document.createRange();
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!(n as Text).data.length) continue;
      r.selectNodeContents(n);
      for (const x of r.getClientRects()) if (x.height > 0) rects.push(x);
    }
    rects.sort((a, b) => a.top - b.top);
    const out: { top: number; bottom: number }[] = [];
    for (const x of rects) {
      const t = y(x.top);
      const bt = y(x.bottom);
      const last = out[out.length - 1];
      // Boxes that overlap up and down (by more than a third of a line) are of one line.
      if (last && t < last.bottom - Math.min(4, (last.bottom - last.top) / 3)) {
        last.top = Math.min(last.top, t);
        last.bottom = Math.max(last.bottom, bt);
      } else out.push({ top: t, bottom: bt });
    }
    if (!out.length) return [];
    const box = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const contentTop = y(box.top) + ((parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.borderTopWidth) || 0));
    const contentBottom = y(box.bottom) - ((parseFloat(cs.paddingBottom) || 0) + (parseFloat(cs.borderBottomWidth) || 0));
    return out.map((l, i) => ({
      top: i === 0 ? Math.min(l.top, contentTop) : (out[i - 1].bottom + l.top) / 2,
      bottom: i === out.length - 1 ? Math.max(l.bottom, contentBottom) : (l.bottom + out[i + 1].top) / 2,
      text: l.top,
    }));
  }

  /** The first character on the line whose words start at `top` (a character's own box, searched by halves). */
  private lineStart(id: string, top: number, len: number): number | null {
    const z = this.o.zoom();
    const rootTop = this.eng.root.getBoundingClientRect().top;
    const yOf = (o: number) => {
      const r = charRect(this.eng, id, o, len);
      return r ? (r.top - rootTop) / z : -Infinity;
    };
    let lo = 0;
    let hi = len - 1;
    let found: number | null = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (yOf(mid) >= top - 1) {
        found = mid;
        hi = mid - 1;
      } else lo = mid + 1;
    }
    return found;
  }

  /**
   * Where a table is cut: before each row that crosses a page's bottom (moved up to where no merged cell spans the cut),
   * one body row at least before the first cut; its header row drawn again on the next page.
   */
  private tableCuts(b: Block, el: HTMLElement, g: ReturnType<Paging['geometry']>, page: number, shift: number, y: (v: number) => number, first: boolean): { cuts: Cut[]; added: number; page: number } | null {
    if (b.type !== 'table') return null;
    const t = b as TableBlock;
    const rows = this.rowsOf(el);
    if (rows.length !== t.rows.length || rows.length < 2) return null;
    const box = rows.map((r) => {
      const rr = r.getBoundingClientRect();
      return { top: y(rr.top), bottom: y(rr.bottom) };
    });
    // Rows a merged cell joins: no cut between them.
    const tied = new Array<boolean>(t.rows.length + 1).fill(false);
    t.rows.forEach((row, ri) => row.forEach((c) => {
      for (let k = 1; k < (c.rs ?? 1); k++) tied[ri + k] = true;
    }));
    const head = !!t.head;
    const headH = head ? box[0].bottom - box[0].top : 0;
    const min = head ? 2 : 1;
    const cuts: Cut[] = [];
    let added = 0;
    let p = page;
    let from = head ? 1 : 0;
    for (;;) {
      let r = box.findIndex((x, j) => j > from && x.bottom + shift + added > g.bottom(p) + 0.5);
      if (r < 0) break;
      while (r > from && tied[r]) r--;
      if (r < min || r <= from) {
        if (!cuts.length && !first) return null;
        // A row longer than a page, or rows all merged: it hangs over the page's end.
        break;
      }
      const h = g.top(p + 1) - (box[r].top + shift + added);
      if (h <= 0) break;
      cuts.push({ row: r, h, head });
      added += h + headH;
      p++;
      from = r;
    }
    return cuts.length ? { cuts, added, page: p } : null;
  }

  /** A table's rows as drawn, the layout's own left out (its header's row first). */
  private rowsOf(el: HTMLElement): HTMLTableRowElement[] {
    return [...el.querySelectorAll<HTMLTableRowElement>(':scope > thead > tr, :scope > tbody > tr')].filter((r) => !r.hasAttribute(CUT));
  }

  private applyPush(el: HTMLElement, px: number) {
    el.classList.add('nd-push');
    el.style.setProperty('--nd-push', `${Math.round(px * 100) / 100}px`);
  }

  private applyCuts(b: Block, el: HTMLElement, cuts: Cut[]) {
    for (const c of [...cuts].reverse()) {
      if ('child' in c) {
        const at = [...el.children].filter((k) => !k.hasAttribute(CUT))[c.child];
        if (at) el.insertBefore(this.cutEl(c.h), at);
        continue;
      }
      if ('row' in c) {
        const rows = this.rowsOf(el);
        const at = rows[c.row];
        if (!at?.parentNode) continue;
        const n = Math.max(1, (b as TableBlock).rows[0]?.length ?? 1);
        const gap = document.createElement('tr');
        gap.setAttribute(CUT, '');
        gap.className = 'nd-cutrow';
        gap.contentEditable = 'false';
        gap.setAttribute('aria-hidden', 'true');
        const td = document.createElement('td');
        td.colSpan = n;
        td.style.height = `${Math.round(c.h * 100) / 100}px`;
        gap.appendChild(td);
        at.parentNode.insertBefore(gap, at);
        if (c.head && rows[0]) {
          // The header row again, at the top of the next page: a picture of it, never words to edit.
          const again = rows[0].cloneNode(true) as HTMLTableRowElement;
          again.setAttribute(CUT, '');
          again.classList.add('nd-rehead');
          again.contentEditable = 'false';
          again.setAttribute('aria-hidden', 'true');
          for (const x of again.querySelectorAll('[data-c], [data-t]')) {
            x.removeAttribute('data-c');
            x.removeAttribute('data-t');
          }
          at.parentNode.insertBefore(again, at);
        }
        continue;
      }
      const d = this.eng.domOf({ b: b.id, o: c.o });
      if (!d) continue;
      const cut = this.cutEl(c.h);
      let { node, offset } = d;
      if (node.nodeType === 3) {
        const text = node as Text;
        if (offset > 0 && offset < text.data.length) {
          text.parentNode!.insertBefore(cut, text.splitText(offset));
          continue;
        }
        if (offset === 0) {
          text.parentNode!.insertBefore(cut, text);
          continue;
        }
        offset = Array.prototype.indexOf.call(text.parentNode!.childNodes, text) + 1;
        node = text.parentNode!;
      }
      node.insertBefore(cut, node.childNodes[offset] ?? null);
    }
  }

  /** The gap where the page turns, inside a block: never words, never picked. */
  private cutEl(h: number): HTMLElement {
    const cut = document.createElement('span');
    cut.setAttribute(CUT, '');
    cut.className = 'nd-cut';
    cut.contentEditable = 'false';
    cut.setAttribute('aria-hidden', 'true');
    cut.style.height = `${Math.round(h * 100) / 100}px`;
    return cut;
  }

  /** What a layout put on a block taken off again. */
  private clear(id: string) {
    const el = this.eng.elementOf(id);
    if (!el) return;
    if (el.classList.contains('nd-push')) {
      el.classList.remove('nd-push');
      el.style.removeProperty('--nd-push');
    }
    this.clearCuts(el);
  }

  private clearCuts(el: HTMLElement) {
    const cuts = el.querySelectorAll(`[${CUT}]`);
    if (!cuts.length) return;
    const parents = new Set<Node>();
    for (const c of cuts) {
      if (c.parentNode) parents.add(c.parentNode);
      c.remove();
    }
    // Text split where a cut went is one again (the selection in it follows).
    for (const p of parents) p.normalize();
  }
}

/** A box's words as drawn, the layout's own elements left out (to tell whether it shows what the model says). */
export function htmlWithoutCuts(box: Element): string {
  if (!box.querySelector(`[${CUT}]`)) return box.innerHTML;
  const c = box.cloneNode(true) as Element;
  for (const x of c.querySelectorAll(`[${CUT}]`)) x.remove();
  c.normalize();
  return c.innerHTML;
}
