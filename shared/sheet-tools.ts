// The spreadsheet editor's data tools as plain functions of a sheet, shared by the editor (sheets/ops.ts and tools.ts
// take them from here) and by agents (page_action, server/pages/actions.ts), so both change a workbook the same way:
// clearing cells and their looks, filling down and right, sorting by one column or several (whole rows move, their
// formulas and comments along), the table around a cell and whether its first row is a header, taking out duplicate
// rows, splitting words into columns, trimming spaces, and a summary of a table as a sheet of formulas. Each gives the
// cells it changes (null: emptied), for the editor to make one step of Undo and for an agent's change to be saved.
import { colName, compare, formatValue, MAX_COLS, parseInput, parseRef, quoteSheet, refName, shiftFormula, typedCell, type Calc, type Cell, type CellStyle, type Rect, type Scalar, type Sheet, type SheetComment } from './sheets.ts';

// ---- cells ----------------------------------------------------------------------------------------------------------

/** Whether a cell holds something (a value or a formula), not only a look. */
export const holds = (c: Cell | undefined) => !!c && (c.v !== undefined || c.f !== undefined);

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

// ---- filling --------------------------------------------------------------------------------------------------------

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

/** The rows of a block sorted by one column's values: whole rows move (their formulas along with them); `moved`: where each row went. */
export function sortChanges(sh: Sheet, calc: Calc, si: number, x: Rect, col: number, asc: boolean, moved?: Map<number, number>): Record<string, Cell | null> {
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
    moved?.set(row.r, r);
    row.cells.forEach((cell, j) => {
      const c = x.c1 + j;
      if (!cell) out[refName(r, c)] = null;
      else out[refName(r, c)] = cell.f !== undefined ? { ...cell, f: shiftFormula(cell.f, r - row.r, 0) } : cell;
    });
  });
  return out;
}

/** A sheet's comments after the rows of a block were sorted (`moved`: where each row went), each with its cell's row; null when none moved. */
export function commentsAfterSort(sh: Sheet, x: Rect, moved: Map<number, number>): SheetComment[] | null {
  if (!sh.comments?.length) return null;
  let any = false;
  const comments = sh.comments
    .map((cm) => {
      const p = parseRef(cm.cell);
      const to = p && p.c >= x.c1 && p.c <= x.c2 ? moved.get(p.r) : undefined;
      if (!p || to === undefined || to === p.r) return cm;
      any = true;
      return { ...cm, cell: refName(to, p.c) };
    })
    .sort((a, b) => (parseRef(a.cell)!.r - parseRef(b.cell)!.r) * MAX_COLS + parseRef(a.cell)!.c - parseRef(b.cell)!.c);
  return any ? comments : null;
}

export function sortByKeys(sh: Sheet, calc: Calc, si: number, x: Rect, keys: { c: number; asc: boolean }[], moved?: Map<number, number>): Record<string, Cell | null> {
  const rows: { r: number; vals: Scalar[]; cells: (Cell | undefined)[] }[] = [];
  for (let r = x.r1; r <= x.r2; r++) {
    const cells: (Cell | undefined)[] = [];
    for (let c = x.c1; c <= x.c2; c++) cells.push(sh.cells[refName(r, c)]);
    rows.push({ r, vals: keys.map((k) => calc.value(si, r, k.c)), cells });
  }
  const blank = (v: Scalar) => v === null || v === '';
  const err = (v: Scalar) => typeof v === 'object' && v !== null;
  const cmp = (a: Scalar, b: Scalar): number => {
    if (blank(a) || blank(b)) return blank(a) === blank(b) ? 0 : blank(a) ? 1 : -1;
    if (err(a) || err(b)) return err(a) === err(b) ? 0 : err(a) ? 1 : -1;
    const rank = (v: Scalar) => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    return a! < b! ? -1 : a! > b! ? 1 : 0;
  };
  const sorted = [...rows].sort((p, q) => {
    for (let i = 0; i < keys.length; i++) {
      const a = p.vals[i];
      const b = q.vals[i];
      const k = cmp(a, b);
      if (!k) continue;
      // Blanks and errors stay last either way.
      return blank(a) || blank(b) || err(a) || err(b) ? k : keys[i].asc ? k : -k;
    }
    return p.r - q.r;
  });
  const out: Record<string, Cell | null> = {};
  sorted.forEach((row, i) => {
    const r = x.r1 + i;
    // Where each row went (its comments go along).
    moved?.set(row.r, r);
    row.cells.forEach((cell, j) => {
      out[refName(r, x.c1 + j)] = !cell ? null : cell.f !== undefined ? { ...cell, f: shiftFormula(cell.f, r - row.r, 0) } : cell;
    });
  });
  return out;
}

// ---- data tools ------------------------------------------------------------------------------------------------------

/** Rows of a block with the same values in the columns chosen as a row above them taken out (the rest move up); how many went. */
export function removeDuplicates(sh: Sheet, calc: Calc, si: number, x: Rect, header: boolean, cols: number[]): { changes: Record<string, Cell | null>; removed: number } {
  const out: Record<string, Cell | null> = {};
  const seen = new Set<string>();
  const keep: number[] = [];
  const first = header ? x.r1 + 1 : x.r1;
  for (let r = first; r <= x.r2; r++) {
    const key = cols
      .map((c) =>
        formatValue(calc.value(si, r, c), sh.cells[refName(r, c)]?.s)
          .trim()
          .toLowerCase(),
      )
      .join('\u0001');
    if (cols.every((c) => !holds(sh.cells[refName(r, c)]))) {
      keep.push(r);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    keep.push(r);
  }
  const removed = x.r2 - first + 1 - keep.length;
  if (!removed) return { changes: out, removed };
  keep.forEach((from, i) => {
    const to = first + i;
    for (let c = x.c1; c <= x.c2; c++) {
      const cell = sh.cells[refName(from, c)];
      out[refName(to, c)] = cell ? (cell.f !== undefined ? { ...cell, f: shiftFormula(cell.f, to - from, 0) } : cell) : null;
    }
  });
  for (let r = first + keep.length; r <= x.r2; r++) for (let c = x.c1; c <= x.c2; c++) out[refName(r, c)] = null;
  return { changes: out, removed };
}

/** The separator most of a column's words split by: a comma, a semicolon, a tab, a space, or none. */
export function guessSeparator(texts: string[]): string {
  let best = ',';
  let score = 0;
  for (const s of ['\t', ';', ',', '|', ' ']) {
    const counts = texts.map((t) => t.split(s).length - 1);
    const hits = counts.filter((n) => n > 0).length;
    if (hits > score) [best, score] = [s, hits];
  }
  return best;
}

/** A column's words split into the columns to its right, by a separator. */
export function splitColumn(sh: Sheet, calc: Calc, si: number, x: Rect, sep: string): { changes: Record<string, Cell | null>; cols: number } {
  const out: Record<string, Cell | null> = {};
  let most = 1;
  for (let r = x.r1; r <= x.r2; r++) {
    const cell = sh.cells[refName(r, x.c1)];
    if (!holds(cell) || cell!.f !== undefined) continue;
    const text = formatValue(calc.value(si, r, x.c1), cell!.s);
    if (!sep || !text.includes(sep)) continue;
    const parts = (sep === ' ' ? text.trim().split(/ +/) : text.split(sep)).map((p) => p.trim());
    most = Math.max(most, parts.length);
    parts.forEach((p, j) => {
      const k = refName(r, x.c1 + j);
      const old = sh.cells[k];
      out[k] = p === '' ? (old?.s ? { s: old.s } : null) : typedCell(parseInput(p, old?.s?.fmt), j === 0 ? cell!.s : old?.s);
    });
  }
  return { changes: out, cols: most };
}

/** Spaces at the ends of words taken off, and runs of them made one; how many cells changed. */
export function trimChanges(sh: Sheet, calc: Calc, si: number, x: Rect): { changes: Record<string, Cell | null>; count: number } {
  const out: Record<string, Cell | null> = {};
  let count = 0;
  for (const [k] of cellsIn(sh, calc, si, x)) {
    const cell = sh.cells[k];
    if (typeof cell.v !== 'string') continue;
    const t = cell.v.replace(/[  ]+/g, ' ').trim();
    if (t === cell.v) continue;
    out[k] = tidyCell({ ...cell, v: t || undefined });
    count++;
  }
  return { changes: out, count };
}

// ---- summarize by ---------------------------------------------------------------------------------------------------------

export type SummaryFn = 'sum' | 'count' | 'average' | 'min' | 'max';
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const SUMMARY_FNS: Record<SummaryFn, { ifs: string; whole: string }> = {
  sum: { ifs: 'SUMIFS', whole: 'SUM' },
  count: { ifs: 'COUNTIFS', whole: 'COUNTA' },
  average: { ifs: 'AVERAGEIFS', whole: 'AVERAGE' },
  min: { ifs: 'MINIFS', whole: 'MIN' },
  max: { ifs: 'MAXIFS', whole: 'MAX' },
};

/** The words of a summary's headers (the editor's in the language the app is read in; an agent's in English). */
export interface SummaryWords {
  title: (fn: SummaryFn, of: string) => string;
  total: () => string;
}

const ENGLISH: SummaryWords = {
  title: (fn, of) => ({ sum: `Sum of ${of}`, count: `Count of ${of}`, average: `Average of ${of}`, min: `Lowest of ${of}`, max: `Highest of ${of}` })[fn],
  total: () => 'Total',
};

/**
 * A summary of a table, as a pivot table gives one but made of formulas that keep up with the table: a row for each
 * value of one column (and a column for each value of another, when asked), each value column summed, counted,
 * averaged or its lowest or highest, and a total. The table's first row is its header; its columns are read whole when
 * it starts at the sheet's top, so rows added under it count too.
 */
export function summarySheet(sh: Sheet, calc: Calc, si: number, x: Rect, by: number, across: number | null, values: { c: number; fn: SummaryFn }[], name: string, words: SummaryWords = ENGLISH): Sheet {
  const cells: Record<string, Cell> = {};
  const head = (c: number) => formatValue(calc.value(si, x.r1, c), sh.cells[refName(x.r1, c)]?.s) || colName(c);
  const whole = x.r1 === 0;
  const ref = (c: number) => `${quoteSheet(sh.name)}!$${colName(c)}${whole ? '' : `$${x.r1 + 2}`}:$${colName(c)}${whole ? '' : `$${x.r2 + 1}`}`;
  // The values a column has, once each, in order: numbers by size, words A to Z.
  const distinct = (c: number) => {
    const seen = new Map<string, Scalar>();
    for (let r = x.r1 + 1; r <= x.r2; r++) {
      const v = calc.value(si, r, c);
      if (v === null || v === '' || typeof v === 'object') continue;
      const k = typeof v === 'string' ? v.trim().toLowerCase() : `${typeof v}:${v}`;
      if (!seen.has(k)) seen.set(k, typeof v === 'string' ? v.trim() : v);
    }
    const list = [...seen.values()];
    // Months and weekdays go in the calendar's order; other words A to Z, numbers by size.
    const cycle = [MONTHS, DAYS].find((names) => list.length > 1 && list.every((v) => typeof v === 'string' && names.some((n) => n.startsWith(v.toLowerCase()) && v.length >= 3)));
    const at = (v: Scalar) => cycle!.findIndex((n) => n.startsWith(String(v).toLowerCase()));
    return list.sort((a, b) => (cycle ? at(a) - at(b) : typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })));
  };
  const keys = distinct(by).slice(0, 2000);
  const cols = across !== null ? distinct(across).slice(0, 200) : [];
  // Its headers in the words given (they are the sheet's words from then on).
  const title = words.title;
  const bold = { b: true };
  const put = (r: number, c: number, cell: Cell) => (cells[refName(r, c)] = cell);
  const lit = (v: Scalar) => (typeof v === 'number' || typeof v === 'boolean' ? { v } : { v: String(v) });
  const fmtOf = (c: number) => {
    const s = sh.cells[refName(x.r1 + 1, c)]?.s;
    return s?.fmt || s?.code ? { ...(s.fmt ? { fmt: s.fmt } : {}), ...(s.dp !== undefined ? { dp: s.dp } : {}), ...(s.cur ? { cur: s.cur } : {}), ...(s.code ? { code: s.code } : {}) } : undefined;
  };
  put(0, 0, { v: head(by), s: bold });
  const n = keys.length;
  if (across === null) {
    values.forEach((v, j) => put(0, 1 + j, { v: title(v.fn, head(v.c)), s: bold }));
    keys.forEach((k, i) => {
      put(1 + i, 0, lit(k));
      values.forEach((v, j) => {
        const f = SUMMARY_FNS[v.fn];
        const body = v.fn === 'count' ? `${f.ifs}(${ref(by)},$A${i + 2})` : `${f.ifs}(${ref(v.c)},${ref(by)},$A${i + 2})`;
        put(1 + i, 1 + j, { f: body, ...(v.fn !== 'count' && fmtOf(v.c) ? { s: fmtOf(v.c) } : {}) });
      });
    });
    put(n + 1, 0, { v: words.total(), s: bold });
    values.forEach((v, j) => {
      const col = colName(1 + j);
      const body = v.fn === 'sum' || v.fn === 'count' ? `SUM(${col}2:${col}${n + 1})` : `${SUMMARY_FNS[v.fn].whole}(${ref(v.c)})`;
      put(n + 1, 1 + j, { f: body, s: { ...bold, ...(v.fn !== 'count' ? (fmtOf(v.c) ?? {}) : {}) } });
    });
  } else {
    // A cross table: the first value's summary for each pair of the two columns' values.
    const v = values[0];
    const f = SUMMARY_FNS[v.fn];
    cols.forEach((k, j) => put(0, 1 + j, { ...lit(k), s: bold }));
    put(0, cols.length + 1, { v: words.total(), s: bold });
    keys.forEach((k, i) => {
      put(1 + i, 0, lit(k));
      cols.forEach((_, j) => {
        const cc = colName(1 + j);
        const body = v.fn === 'count' ? `${f.ifs}(${ref(by)},$A${i + 2},${ref(across)},${cc}$1)` : `${f.ifs}(${ref(v.c)},${ref(by)},$A${i + 2},${ref(across)},${cc}$1)`;
        put(1 + i, 1 + j, { f: body, ...(v.fn !== 'count' && fmtOf(v.c) ? { s: fmtOf(v.c) } : {}) });
      });
      const body = v.fn === 'count' ? `${f.ifs}(${ref(by)},$A${i + 2})` : `${f.ifs}(${ref(v.c)},${ref(by)},$A${i + 2})`;
      put(1 + i, cols.length + 1, { f: body, s: { ...bold, ...(v.fn !== 'count' ? (fmtOf(v.c) ?? {}) : {}) } });
    });
    put(n + 1, 0, { v: words.total(), s: bold });
    for (let j = 0; j <= cols.length; j++) {
      const col = colName(1 + j);
      const body = v.fn === 'sum' || v.fn === 'count' ? `SUM(${col}2:${col}${n + 1})` : j === cols.length ? `${f.whole}(${ref(v.c)})` : `${f.ifs}(${ref(v.c)},${ref(across)},${col}$1)`;
      put(n + 1, 1 + j, { f: body, s: { ...bold, ...(v.fn !== 'count' ? (fmtOf(v.c) ?? {}) : {}) } });
    }
  }
  return { id: '', name, cells, freeze: { rows: 1 }, cols: { 0: { w: 160 } } };
}
