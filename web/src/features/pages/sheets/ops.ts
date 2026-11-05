// The spreadsheet editor's changes as plain functions: a change is a patch that says what the cells (or a sheet's
// other parts: sizes, hidden rows, merges, its filter, rules and charts; or the whole workbook) were before and after,
// so Undo and Redo replay it either way. The editor keeps one workbook it changes in place, patch by patch. Here too:
// typing into cells, styles over a selection, clearing, copying and pasting (tab-separated text, as Excel and Google
// Sheets exchange it), filling down and right, sorting, and where Ctrl+arrow goes (tools.ts and fill.ts have the rest).
import {
  adjustForDelete,
  adjustForInsert,
  cellsFromRows,
  COL_W,
  computeBook,
  formatValue,
  MAX_COLS,
  cleanStyle,
  parseDelimited,
  parseInput,
  parseRef,
  refName,
  ROW_H,
  SHEET_LIMITS,
  shiftFormula,
  typedCell,
  compare,
  type Calc,
  type Cell,
  type CellStyle,
  type Rect,
  type Scalar,
  type Sheet,
  type Workbook,
} from '@shared/sheets';

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

/** A sheet's parts besides its cells: sizes and hidden rows, frozen panes, merges, the filter, rules and charts. */
export interface Meta {
  cols?: Sheet['cols'];
  rows?: Sheet['rows'];
  freeze?: Sheet['freeze'];
  merges?: Sheet['merges'];
  filter?: Sheet['filter'];
  conditional?: Sheet['conditional'];
  validation?: Sheet['validation'];
  charts?: Sheet['charts'];
}
const META_KEYS = ['cols', 'rows', 'freeze', 'merges', 'filter', 'conditional', 'validation', 'charts'] as const;

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

export const metaOf = (sh: Sheet): Meta => ({ cols: sh.cols, rows: sh.rows, freeze: sh.freeze, merges: sh.merges, filter: sh.filter, conditional: sh.conditional, validation: sh.validation, charts: sh.charts });

function setMeta(sh: Sheet, m: Meta) {
  for (const k of META_KEYS) {
    const v = m[k];
    if (v && Object.keys(v).length) (sh as unknown as Record<string, unknown>)[k] = v;
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

/** Whether a cell holds something (a value or a formula), not only a look. */
export const holds = (c: Cell | undefined) => !!c && (c.v !== undefined || c.f !== undefined);

/** A cell typed into: its words as a value or a formula, its look and note kept (a number typed as 12% becomes a percent). */
export function typedInto(cell: Cell | undefined, text: string): Cell | null {
  const typed = text === '' ? (cell?.s ? { s: cell.s } : null) : typedCell(parseInput(text, cell?.s?.fmt), cell?.s);
  return cell?.note ? { ...(typed ?? {}), note: cell.note } : typed;
}

/** A cell with only what remains of it: null when it holds nothing, no look and no note. */
export const tidyCell = (c: Cell): Cell | null => (c.v === undefined && c.f === undefined && !c.s && !c.note ? null : c);

/** The cells of a rectangle that exist, by name, row by row (a big rectangle is looked through by the sheet's own cells). */
export function cellsIn(sh: Sheet, calc: Calc, si: number, x: Rect): [string, number, number][] {
  const out: [string, number, number][] = [];
  const area = (x.r2 - x.r1 + 1) * (x.c2 - x.c1 + 1);
  const keys = calc.keys(si);
  if (area <= keys.length * 2) {
    for (let r = x.r1; r <= x.r2; r++)
      for (let c = x.c1; c <= x.c2; c++) {
        const k = refName(r, c);
        if (sh.cells[k]) out.push([k, r, c]);
      }
    return out;
  }
  for (const n of keys) {
    const r = Math.floor(n / MAX_COLS);
    const c = n % MAX_COLS;
    if (r >= x.r1 && r <= x.r2 && c >= x.c1 && c <= x.c2) out.push([refName(r, c), r, c]);
  }
  return out;
}

/** The selection's contents emptied; their looks and notes kept unless `all`. */
export function clearChanges(sh: Sheet, calc: Calc, si: number, x: Rect, all = false): Record<string, Cell | null> {
  const out: Record<string, Cell | null> = {};
  for (const [k] of cellsIn(sh, calc, si, x)) {
    const c = sh.cells[k];
    out[k] = all ? null : tidyCell({ ...(c.s ? { s: c.s } : {}), ...(c.note ? { note: c.note } : {}) });
  }
  return out;
}

/**
 * A style changed over a selection: on every cell it has, and on the empty ones too when it is small (so a fill
 * shows on empty cells), else on the empty ones within what the sheet holds.
 */
export function styleChanges(sh: Sheet, calc: Calc, si: number, x: Rect, f: (s: CellStyle | undefined) => CellStyle | undefined): Record<string, Cell | null> {
  const out: Record<string, Cell | null> = {};
  const put = (k: string) => {
    const c = sh.cells[k];
    const s = f(c?.s);
    const next: Cell = { ...(c ?? {}) };
    if (s && Object.keys(s).length) next.s = s;
    else delete next.s;
    out[k] = tidyCell(next);
  };
  const area = (x.r2 - x.r1 + 1) * (x.c2 - x.c1 + 1);
  if (area <= 10_000) {
    for (let r = x.r1; r <= x.r2; r++) for (let c = x.c1; c <= x.c2; c++) put(refName(r, c));
    return out;
  }
  const e = calc.extent(si);
  const inner: Rect = { r1: x.r1, c1: x.c1, r2: Math.min(x.r2, e.rows - 1), c2: Math.min(x.c2, e.cols - 1) };
  if ((inner.r2 - inner.r1 + 1) * (inner.c2 - inner.c1 + 1) <= 50_000) {
    for (let r = inner.r1; r <= inner.r2; r++) for (let c = inner.c1; c <= inner.c2; c++) put(refName(r, c));
  } else for (const [k] of cellsIn(sh, calc, si, x)) put(k);
  return out;
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
export function pasteChanges(sh: Sheet, target: Rect, src: { clip: Clip } | { text: string }): { changes: Record<string, Cell | null>; x: Rect; cut: boolean } {
  let grid: (Cell | null)[][];
  let from: { r: number; c: number } | null = null;
  if ('clip' in src) {
    grid = src.clip.cells;
    from = { r: src.clip.x.r1, c: src.clip.x.c1 };
  } else {
    const rows = parseDelimited(src.text.replace(/\r?\n$/, ''), '\t').rows;
    // Text from elsewhere: typed as if typed here, formulas included.
    grid = rows.map((row) => row.map((t) => (t === '' ? null : typedCell(parseInput(t), undefined))));
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

/** The first row (Ctrl+D) or column (Ctrl+R) of a selection copied over the rest of it; one cell takes the one above or left. */
export function fillChanges(sh: Sheet, x: Rect, down: boolean): Record<string, Cell | null> {
  const out: Record<string, Cell | null> = {};
  const r0 = down ? (x.r1 === x.r2 ? x.r1 - 1 : x.r1) : -1;
  const c0 = !down ? (x.c1 === x.c2 ? x.c1 - 1 : x.c1) : -1;
  if (down ? r0 < 0 : c0 < 0) return out;
  for (let r = down ? r0 + 1 : x.r1; r <= x.r2; r++)
    for (let c = down ? x.c1 : c0 + 1; c <= x.c2; c++) {
      const src = sh.cells[refName(down ? r0 : r, down ? c : c0)];
      if (!src) {
        out[refName(r, c)] = null;
        continue;
      }
      const next: Cell = { ...src };
      if (next.f !== undefined) next.f = shiftFormula(next.f, down ? r - r0 : 0, down ? 0 : c - c0);
      out[refName(r, c)] = next;
    }
  return out;
}

// ---- sorting --------------------------------------------------------------------------------------------------------

/** Values in sort order: numbers, words (in any case, numbers in them by value), TRUE and FALSE; errors and blanks last. */
function sortKey(a: Scalar, b: Scalar): number {
  const blank = (v: Scalar) => v === null || v === '';
  if (blank(a) || blank(b)) return blank(a) === blank(b) ? 0 : blank(a) ? 1 : -1;
  const err = (v: Scalar) => typeof v === 'object';
  if (err(a) || err(b)) return err(a) === err(b) ? 0 : err(a) ? 1 : -1;
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  return compare(a, b);
}

/** The block of filled cells around a cell, as far as it reaches in every direction (Excel's current region). */
export function regionAround(sh: Sheet, r: number, c: number, maxR: number, maxC: number): Rect {
  const x: Rect = { r1: r, c1: c, r2: r, c2: c };
  const filled = (rr: number, cc: number) => rr >= 0 && cc >= 0 && rr < maxR && cc < maxC && holds(sh.cells[refName(rr, cc)]);
  for (let grew = true, n = 0; grew && n < 10_000; n++) {
    grew = false;
    const rowHas = (rr: number) => {
      for (let cc = x.c1 - 1; cc <= x.c2 + 1; cc++) if (filled(rr, cc)) return true;
      return false;
    };
    const colHas = (cc: number) => {
      for (let rr = x.r1 - 1; rr <= x.r2 + 1; rr++) if (filled(rr, cc)) return true;
      return false;
    };
    if (x.r1 > 0 && rowHas(x.r1 - 1)) (x.r1--, (grew = true));
    if (x.r2 < maxR - 1 && rowHas(x.r2 + 1)) (x.r2++, (grew = true));
    if (x.c1 > 0 && colHas(x.c1 - 1)) (x.c1--, (grew = true));
    if (x.c2 < maxC - 1 && colHas(x.c2 + 1)) (x.c2++, (grew = true));
  }
  return x;
}

/** Whether a block's first row is a header: words over rows of which some hold numbers or dates, or bold over plain. */
export function hasHeader(sh: Sheet, calc: Calc, si: number, x: Rect): boolean {
  if (x.r2 <= x.r1) return false;
  if (sh.freeze?.rows && x.r1 < sh.freeze.rows) return true;
  let words = 0;
  for (let c = x.c1; c <= x.c2; c++) {
    const v = calc.value(si, x.r1, c);
    if (v === null || v === '') continue;
    if (typeof v !== 'string') return false;
    words++;
  }
  if (!words) return false;
  const bold = (r: number) => [...Array(x.c2 - x.c1 + 1).keys()].some((j) => sh.cells[refName(r, x.c1 + j)]?.s?.b);
  if (bold(x.r1) && !bold(x.r1 + 1)) return true;
  for (let c = x.c1; c <= x.c2; c++) if (typeof calc.value(si, x.r1 + 1, c) === 'number') return true;
  return false;
}

/** The rows of a block sorted by one column's values: whole rows move (their formulas along with them). */
export function sortChanges(sh: Sheet, calc: Calc, si: number, x: Rect, col: number, asc: boolean): Record<string, Cell | null> {
  const rows: { r: number; key: Scalar; cells: (Cell | undefined)[] }[] = [];
  for (let r = x.r1; r <= x.r2; r++) {
    const cells: (Cell | undefined)[] = [];
    for (let c = x.c1; c <= x.c2; c++) cells.push(sh.cells[refName(r, c)]);
    rows.push({ r, key: calc.value(si, r, col), cells });
  }
  const sorted = [...rows].sort((a, b) => {
    const k = sortKey(a.key, b.key);
    const blankOrErr = (v: Scalar) => v === null || v === '' || typeof v === 'object';
    // Blanks and errors stay last either way.
    if (blankOrErr(a.key) || blankOrErr(b.key)) return k;
    return asc ? k : -k;
  });
  const out: Record<string, Cell | null> = {};
  sorted.forEach((row, i) => {
    const r = x.r1 + i;
    row.cells.forEach((cell, j) => {
      const c = x.c1 + j;
      if (!cell) out[refName(r, c)] = null;
      else out[refName(r, c)] = cell.f !== undefined ? { ...cell, f: shiftFormula(cell.f, r - row.r, 0) } : cell;
    });
  });
  return out;
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

