// The spreadsheet editor's changes as plain functions: a change is a patch that says what the cells (or a sheet's
// other parts: sizes, hidden rows, merges, its filter, rules and charts; or the whole workbook) were before and after,
// so Undo and Redo replay it either way. The editor keeps one workbook it changes in place, patch by patch. Here too:
// typing into cells, styles over a selection, clearing, copying and pasting (tab-separated text, as Excel and Google
// Sheets exchange it), filling down and right, sorting, and where Ctrl+arrow goes (tools.ts and fill.ts have the rest;
// clearing, filling and sorting are shared/sheet-tools.ts's, which agents use too).
import {
  adjustForDelete,
  adjustForInsert,
  cellsFromRows,
  COL_W,
  computeBook,
  formatValue,
  cleanStyle,
  parseDelimited,
  parseInput,
  parseRef,
  refName,
  ROW_H,
  SHEET_LIMITS,
  shiftFormula,
  typedCell,
  type Calc,
  type Cell,
  type CellStyle,
  type Rect,
  type Scalar,
  type Sheet,
  type Workbook,
} from '@shared/sheets';
import { cellsIn, clearChanges, commentsAfterSort, fillChanges, hasHeader, holds, regionAround, sortChanges, styleChanges, tidyCell } from '@shared/sheet-tools';

// The data tools agents use too (shared/sheet-tools.ts), as the editor has always taken them from here.
export { cellsIn, clearChanges, fillChanges, hasHeader, holds, regionAround, sortChanges, styleChanges, tidyCell };

/** A selection: the active cell (r, c), and the range from where it started (ar, ac) to its far corner (fr, fc). */
export interface Sel {
  r: number;
  c: number;
  ar: number;
  ac: number;
  fr: number;
  fc: number;
}

export const cellSel = (r: number, c: number): Sel => ({ r, c, ar: r, ac: c, fr: r, fc: c });
export const rectOf = (s: Sel): Rect => ({ r1: Math.min(s.ar, s.fr), c1: Math.min(s.ac, s.fc), r2: Math.max(s.ar, s.fr), c2: Math.max(s.ac, s.fc) });
export const single = (s: Sel) => s.ar === s.fr && s.ac === s.fc;
export const rectSel = (x: Rect, r = x.r1, c = x.c1): Sel => ({ r, c, ar: x.r1, ac: x.c1, fr: x.r2, fc: x.c2 });

/** A sheet's parts besides its cells: sizes and hidden rows, frozen panes, merges, the filter, rules, charts, its board and comments. */
export interface Meta {
  cols?: Sheet['cols'];
  rows?: Sheet['rows'];
  freeze?: Sheet['freeze'];
  merges?: Sheet['merges'];
  filter?: Sheet['filter'];
  conditional?: Sheet['conditional'];
  validation?: Sheet['validation'];
  charts?: Sheet['charts'];
  board?: Sheet['board'];
  comments?: Sheet['comments'];
  protect?: Sheet['protect'];
  groups?: Sheet['groups'];
  print?: Sheet['print'];
  noGrid?: Sheet['noGrid'];
}
const META_KEYS = ['cols', 'rows', 'freeze', 'merges', 'filter', 'conditional', 'validation', 'charts', 'board', 'comments', 'protect', 'groups', 'print', 'noGrid'] as const;

export type Patch = (
  | { k: 'cells'; sheet: string; before: Record<string, Cell | null>; after: Record<string, Cell | null> }
  | { k: 'meta'; sheet: string; before: Meta; after: Meta }
  | { k: 'book'; before: Workbook; after: Workbook }
  /** Several changes as one step (a cut moved to another sheet, a style and the rows' heights it needs). */
  | { k: 'multi'; list: Patch[] }
) & {
  /** Where it happened: Undo and Redo go back there. */
  at?: { sheet: string; sel: Sel };
};

export const HISTORY_MAX = 200;

const same = (a: Cell | null | undefined, b: Cell | null | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** A patch of cells from what they become (null: emptied); null when nothing changes. */
export function cellsPatch(book: Workbook, si: number, after: Record<string, Cell | null>): Patch | null {
  const sh = book.sheets[si];
  const before: Record<string, Cell | null> = {};
  const next: Record<string, Cell | null> = {};
  let n = 0;
  for (const [k, c] of Object.entries(after)) {
    const was = sh.cells[k] ?? null;
    if (same(was, c)) continue;
    before[k] = was;
    next[k] = c;
    n++;
  }
  return n ? { k: 'cells', sheet: sh.id, before, after: next } : null;
}

export const metaOf = (sh: Sheet): Meta => ({
  cols: sh.cols,
  rows: sh.rows,
  freeze: sh.freeze,
  merges: sh.merges,
  filter: sh.filter,
  conditional: sh.conditional,
  validation: sh.validation,
  charts: sh.charts,
  board: sh.board,
  comments: sh.comments,
  protect: sh.protect,
  groups: sh.groups,
  print: sh.print,
  noGrid: sh.noGrid,
});

function setMeta(sh: Sheet, m: Meta) {
  for (const k of META_KEYS) {
    const v = m[k];
    if (v === true || (v && typeof v === 'object' && Object.keys(v).length)) (sh as unknown as Record<string, unknown>)[k] = v;
    else delete sh[k];
  }
}

/** A change to some of a sheet's other parts (the rest stay as they are); null when nothing changes. */
export function metaPatch(sh: Sheet, set: Partial<Meta>): Patch | null {
  const before = metaOf(sh);
  const after = { ...before, ...set };
  return JSON.stringify(before) === JSON.stringify(after) ? null : { k: 'meta', sheet: sh.id, before, after };
}

/** The workbook with a patch done (or undone): cells and sizes change in place; a whole workbook is swapped. */
export function applyPatch(book: Workbook, p: Patch, back: boolean): Workbook {
  if (p.k === 'multi') return (back ? [...p.list].reverse() : p.list).reduce((b, q) => applyPatch(b, q, back), book);
  if (p.k === 'book') return back ? p.before : p.after;
  const sh = book.sheets.find((s) => s.id === p.sheet);
  if (!sh) return book;
  if (p.k === 'meta') {
    setMeta(sh, back ? p.before : p.after);
    return book;
  }
  for (const [k, c] of Object.entries(back ? p.before : p.after)) {
    if (c) sh.cells[k] = c;
    else delete sh.cells[k];
  }
  return book;
}

/** A cell typed into: its words as a value or a formula, its look and note kept (a number typed as 12% becomes a percent). */
export function typedInto(cell: Cell | undefined, text: string): Cell | null {
  const typed = text === '' ? (cell?.s ? { s: cell.s } : null) : typedCell(parseInput(text, cell?.s?.fmt), cell?.s);
  return cell?.note ? { ...(typed ?? {}), note: cell.note } : typed;
}

/** A style with some of its values set (undefined clears one), checked and kept in its order. */
export const withStyle = (s: CellStyle | undefined, set: Partial<CellStyle>): CellStyle | undefined => {
  const next: Record<string, unknown> = { ...(s ?? {}) };
  for (const [k, v] of Object.entries(set)) {
    if (v === undefined || v === false) delete next[k];
    else next[k] = v;
  }
  return cleanStyle(next);
};

/** Patches as one step (none: null; one: itself). */
export const together = (list: (Patch | null)[]): Patch | null => {
  const ps = list.filter((p): p is Patch => !!p);
  return ps.length === 0 ? null : ps.length === 1 ? ps[0] : { k: 'multi', list: ps };
};

/** Whether a patch swaps the whole workbook (the calculator then starts again). */
export const swapsBook = (p: Patch): boolean => p.k === 'book' || (p.k === 'multi' && p.list.some(swapsBook));

/** The cells a patch changes, by sheet id. */
export function touched(p: Patch, out = new Map<string, string[]>()): Map<string, string[]> {
  if (p.k === 'multi') for (const q of p.list) touched(q, out);
  else if (p.k === 'cells') out.set(p.sheet, [...(out.get(p.sheet) ?? []), ...Object.keys(p.after)]);
  return out;
}

// ---- copy and paste ---------------------------------------------------------------------------------------------

/** Cells copied (or cut): what they hold and what they showed then (for Paste special), from where, and the text that went to the clipboard with them. */
export interface Clip {
  sheet: string;
  x: Rect;
  cells: (Cell | null)[][];
  vals: Scalar[][];
  text: string;
  cut?: boolean;
}

const htmlEsc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** A selection as the clipboard takes it: tab-separated values as they show, and a small HTML table with their looks. */
export function copyOf(sh: Sheet, calc: Calc, si: number, x0: Rect): { clip: Clip; text: string; html: string } {
  const e = calc.shownExtent(si);
  // Whole columns or rows: only as far as the sheet holds (what formulas spilled too).
  const x: Rect = { r1: x0.r1, c1: x0.c1, r2: Math.max(x0.r1, Math.min(x0.r2, e.rows - 1)), c2: Math.max(x0.c1, Math.min(x0.c2, e.cols - 1)) };
  const cells: (Cell | null)[][] = [];
  const vals: Scalar[][] = [];
  const lines: string[] = [];
  const rows: string[] = [];
  for (let r = x.r1; r <= x.r2; r++) {
    const row: (Cell | null)[] = [];
    const vrow: Scalar[] = [];
    const texts: string[] = [];
    const tds: string[] = [];
    for (let c = x.c1; c <= x.c2; c++) {
      // What a formula spilled here is copied as the value it is.
      const v = calc.value(si, r, c);
      const own = sh.cells[refName(r, c)] ?? null;
      const cell = own && holds(own) ? own : v !== null && typeof v !== 'object' && v !== '' ? { ...(own ?? {}), v } : own;
      row.push(cell);
      vrow.push(cell && holds(cell) ? v : null);
      const t = cell && holds(cell) ? formatValue(v, cell.s) : '';
      texts.push(/[\t\n"]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);
      const s = cell?.s;
      const css = [
        s?.b && 'font-weight:bold',
        s?.i && 'font-style:italic',
        s?.u && 'text-decoration:underline',
        s?.color && `color:${s.color}`,
        s?.fill && `background:${s.fill}`,
        s?.align && `text-align:${s.align}`,
      ]
        .filter(Boolean)
        .join(';');
      tds.push(`<td${css ? ` style="${css}"` : ''}>${htmlEsc(t).replace(/\n/g, '<br>')}</td>`);
    }
    cells.push(row);
    vals.push(vrow);
    lines.push(texts.join('\t'));
    rows.push(`<tr>${tds.join('')}</tr>`);
  }
  const text = lines.join('\n');
  return { clip: { sheet: sh.id, x, cells, vals, text }, text, html: `<table>${rows.join('')}</table>` };
}

/** What a paste puts where: from cells copied here (formulas moved along, looks kept), or from text (typed as typing). */
/** `styles`: the looks a table copied from Excel, Google Sheets or a web page carried, cell by cell (sheet-html.ts). */
export function pasteChanges(sh: Sheet, target: Rect, src: { clip: Clip } | { text: string; styles?: (CellStyle | undefined)[][] }): { changes: Record<string, Cell | null>; x: Rect; cut: boolean } {
  let grid: (Cell | null)[][];
  let from: { r: number; c: number } | null = null;
  if ('clip' in src) {
    grid = src.clip.cells;
    from = { r: src.clip.x.r1, c: src.clip.x.c1 };
  } else {
    const rows = parseDelimited(src.text.replace(/\r?\n$/, ''), '\t').rows;
    // Text from elsewhere: typed as if typed here, formulas included.
    grid = rows.map((row, i) => row.map((t, j) => {
      const style = src.styles?.[i]?.[j];
      return t === '' ? (style ? { s: style } : null) : typedCell(parseInput(t, style?.fmt), style);
    }));
    if (!grid.length) grid = [[null]];
  }
  const h = grid.length;
  const w = Math.max(1, ...grid.map((r) => r.length));
  const th = target.r2 - target.r1 + 1;
  const tw = target.c2 - target.c1 + 1;
  // One value into many cells fills them; a block into a selection it divides into fills it with copies.
  const reps = (big: number, small: number) => (big > small && big % small === 0 ? big / small : 1);
  const rr = reps(th, h);
  const rc = reps(tw, w);
  const out: Record<string, Cell | null> = {};
  const x: Rect = { r1: target.r1, c1: target.c1, r2: Math.min(SHEET_LIMITS.rows - 1, target.r1 + h * rr - 1), c2: Math.min(SHEET_LIMITS.cols - 1, target.c1 + w * rc - 1) };
  const cut = 'clip' in src && !!src.clip.cut;
  for (let i = 0; i < h * rr; i++)
    for (let j = 0; j < w * rc; j++) {
      const r = target.r1 + i;
      const c = target.c1 + j;
      if (r >= SHEET_LIMITS.rows || c >= SHEET_LIMITS.cols) continue;
      const cell = grid[i % h]?.[j % w] ?? null;
      const k = refName(r, c);
      if (!cell) {
        out[k] = null;
        continue;
      }
      const next: Cell = { ...cell };
      // A formula copied moves with where it goes; one cut keeps pointing where it did.
      if (next.f !== undefined && from && !cut) next.f = shiftFormula(next.f, r - (from.r + (i % h)), c - (from.c + (j % w)));
      if (!('clip' in src)) {
        const old = sh.cells[k];
        if (old?.s && !next.s) next.s = old.s;
      }
      out[k] = next;
    }
  return { changes: out, x, cut };
}

// ---- sorting --------------------------------------------------------------------------------------------------------

/** A sheet's comments after the rows of a block were sorted (`moved`: where each row went), each with its cell's row; null when none moved. */
export function commentsMoved(sh: Sheet, x: Rect, moved: Map<number, number>): Patch | null {
  const comments = commentsAfterSort(sh, x, moved);
  return comments ? metaPatch(sh, { comments }) : null;
}

// ---- rows and columns ------------------------------------------------------------------------------------------------

/** Rows or columns put in or taken out, as a whole-workbook patch (formulas everywhere follow). */
export function insertPatch(book: Workbook, si: number, axis: 'row' | 'col', at: number, count: number): Patch {
  return { k: 'book', before: book, after: adjustForInsert(book, book.sheets[si].id, axis, at, count) };
}
export function deletePatch(book: Workbook, si: number, axis: 'row' | 'col', at: number, count: number): Patch {
  return { k: 'book', before: book, after: adjustForDelete(book, book.sheets[si].id, axis, at, count) };
}

// ---- moving about -----------------------------------------------------------------------------------------------------

/** Where Ctrl+arrow goes from (r, c): the edge of the block of filled cells it is in, else the next filled cell, else the end. */
export function dataEdge(sh: Sheet, r: number, c: number, dr: number, dc: number, rows: number, cols: number): [number, number] {
  const filled = (rr: number, cc: number) => holds(sh.cells[refName(rr, cc)]);
  const inside = (rr: number, cc: number) => rr >= 0 && cc >= 0 && rr < rows && cc < cols;
  let rr = r + dr;
  let cc = c + dc;
  if (!inside(rr, cc)) return [r, c];
  if (filled(r, c) && filled(rr, cc)) {
    while (inside(rr + dr, cc + dc) && filled(rr + dr, cc + dc)) [rr, cc] = [rr + dr, cc + dc];
    return [rr, cc];
  }
  while (inside(rr, cc) && !filled(rr, cc)) [rr, cc] = [rr + dr, cc + dc];
  return inside(rr, cc) ? [rr, cc] : [Math.max(0, Math.min(rows - 1, rr - dr)), Math.max(0, Math.min(cols - 1, cc - dc))];
}

/** Sum, average and counts of a selection (or of several), for the bar under the sheet: what formulas spilled into it counts too. */
export function statsOf(sh: Sheet, calc: Calc, si: number, rects: Rect | Rect[]): { sum: number; count: number; nums: number } {
  let sum = 0;
  let count = 0;
  let nums = 0;
  const add = (v: Scalar) => {
    if (v === null || v === '') return;
    count++;
    if (typeof v === 'number') {
      sum += v;
      nums++;
    }
  };
  // A cell in two of the ranges counts once.
  const seen = new Set<string>();
  const list = Array.isArray(rects) ? rects : [rects];
  for (const x of list) {
    for (const [k, r, c] of cellsIn(sh, calc, si, x)) {
      if (!holds(sh.cells[k]) || seen.has(k)) continue;
      seen.add(k);
      add(calc.value(si, r, c));
    }
    // The values an array formula spilled into the cells picked, which hold nothing of their own.
    for (const { r, c, sp } of calc.spillsOf(si)) {
      for (let rr = Math.max(r, x.r1); rr <= Math.min(r + sp.h - 1, x.r2); rr++)
        for (let cc = Math.max(c, x.c1); cc <= Math.min(c + sp.w - 1, x.c2); cc++) {
          const k = refName(rr, cc);
          if ((rr === r && cc === c) || holds(sh.cells[k]) || seen.has(k)) continue;
          seen.add(k);
          add(sp.d[(rr - r) * sp.w + (cc - c)]);
        }
    }
  }
  return { sum, count, nums };
}

// ---- sizes -----------------------------------------------------------------------------------------------------------

export const colW = (sh: Sheet, c: number) => sh.cols?.[c]?.w ?? COL_W;
export const rowH = (sh: Sheet, r: number) => sh.rows?.[r]?.h ?? ROW_H;

/** Where each column (or row) starts, from 0, and where the last one ends. */
export function offsets(n: number, size: (i: number) => number): Float64Array {
  const out = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) out[i + 1] = out[i] + size(i);
  return out;
}

/** The index whose span holds `pos` (binary search in offsets). */
export function indexAt(off: Float64Array, pos: number): number {
  let lo = 0;
  let hi = off.length - 2;
  if (hi < 0) return 0;
  if (pos <= 0) return 0;
  if (pos >= off[hi + 1]) return hi;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (off[mid] <= pos) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** How many rows and columns the grid shows: what the sheet holds (its charts too) and more to go on with, within its limits. */
export function gridSize(calc: Calc, si: number, sh?: Sheet): { rows: number; cols: number } {
  const e = calc.shownExtent(si);
  let rows = e.rows;
  let cols = e.cols;
  for (const ch of sh?.charts ?? []) {
    const p = parseRef(ch.to.cell);
    if (p) [rows, cols] = [Math.max(rows, p.r + 1), Math.max(cols, p.c + 1)];
  }
  return { rows: Math.min(SHEET_LIMITS.rows, Math.max(1000, rows + 200)), cols: Math.min(SHEET_LIMITS.cols, Math.max(26, cols + 10)) };
}

/** A rectangle's name as people say it: "B2:D9", "B2", columns "B:C" or rows "2:5" when it spans them whole. */
export function rectLabel(x: Rect, rows: number, cols: number): string {
  const allRows = x.r1 === 0 && x.r2 >= rows - 1;
  const allCols = x.c1 === 0 && x.c2 >= cols - 1;
  const col = (c: number) => refName(0, c).replace(/\d+$/, '');
  if (allRows && allCols) return 'the whole sheet';
  if (allRows) return `${col(x.c1)}:${col(x.c2)}`;
  if (allCols) return `${x.r1 + 1}:${x.r2 + 1}`;
  return x.r1 === x.r2 && x.c1 === x.c2 ? refName(x.r1, x.c1) : `${refName(x.r1, x.c1)}:${refName(x.r2, x.c2)}`;
}

/** A sheet made from CSV text (the Add a sheet from a file menu). */
export function sheetFromCsv(text: string, name: string, id: string): { sheet: Sheet; notes: string[] } {
  const notes: string[] = [];
  const { rows, sep } = parseDelimited(text.replace(/^﻿/, ''));
  return { sheet: { id, name, cells: cellsFromRows(rows, notes, sep === ';') }, notes };
}

/** A fresh calculator for a workbook (the editor keeps one, renewed when the workbook is swapped). */
export const calcOf = (b: Workbook) => computeBook(b);

