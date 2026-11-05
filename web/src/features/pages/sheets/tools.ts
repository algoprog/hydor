// The spreadsheet editor's tools as plain functions, each giving the changes it makes (ops.ts turns them into a
// patch, one step of Undo): borders over a selection, merging cells, hiding and showing rows and columns, Paste
// special (values, formats or formulas only, or turned on its side), the data tools (remove duplicates, split text to
// columns, trim spaces, a summary of a table as a sheet of formulas), sorting by several columns, and finding words in
// the cells and putting others in their place.
import { findIn, replaceAllIn, replacementOf, type FindOptions, type Match } from '../common/find';
import { colName, formatValue, inputText, parseInput, quoteSheet, rangeName, refName, shiftFormula, typedCell, type Calc, type Cell, type Rect, type Scalar, type Sheet, type Workbook } from '@shared/sheets';
import { Merges } from '@shared/sheet-rules';
import { tr } from '../../../i18n/runtime';
import { cellsIn, holds, tidyCell, withStyle, type Clip } from './ops';

// ---- borders ------------------------------------------------------------------------------------------------------

export type BorderWhere = 'all' | 'inner' | 'outer' | 'top' | 'bottom' | 'left' | 'right' | 'h' | 'v' | 'none';

/**
 * Borders set over a selection: every cell's sides (all), the lines between cells (inner, h across, v down), the
 * edge round it (outer, or one side), or none (those of the cells beside it that face it go too).
 */
export function borderChanges(sh: Sheet, x: Rect, where: BorderWhere, line: string | undefined): Record<string, Cell | null> {
  const out: Record<string, Cell | null> = {};
  if ((x.r2 - x.r1 + 1) * (x.c2 - x.c1 + 1) > 50_000) return out;
  const set = (r: number, c: number, sides: Partial<Record<'bt' | 'br' | 'bb' | 'bl', string | undefined>>) => {
    if (r < 0 || c < 0) return;
    const k = refName(r, c);
    const cur = (k in out ? out[k] : sh.cells[k]) ?? {};
    const s = withStyle(cur.s, sides);
    const next: Cell = { ...cur };
    if (s) next.s = s;
    else delete next.s;
    out[k] = tidyCell(next);
  };
  for (let r = x.r1; r <= x.r2; r++)
    for (let c = x.c1; c <= x.c2; c++) {
      const top = r === x.r1;
      const bottom = r === x.r2;
      const left = c === x.c1;
      const right = c === x.c2;
      const sides: Partial<Record<'bt' | 'br' | 'bb' | 'bl', string | undefined>> = {};
      switch (where) {
        case 'all':
          Object.assign(sides, { bt: line, br: line, bb: line, bl: line });
          break;
        case 'inner':
          if (!top) sides.bt = line;
          if (!bottom) sides.bb = line;
          if (!left) sides.bl = line;
          if (!right) sides.br = line;
          break;
        case 'h':
          if (!top) sides.bt = line;
          if (!bottom) sides.bb = line;
          break;
        case 'v':
          if (!left) sides.bl = line;
          if (!right) sides.br = line;
          break;
        case 'outer':
          if (top) sides.bt = line;
          if (bottom) sides.bb = line;
          if (left) sides.bl = line;
          if (right) sides.br = line;
          break;
        case 'top':
          if (top) sides.bt = line;
          break;
        case 'bottom':
          if (bottom) sides.bb = line;
          break;
        case 'left':
          if (left) sides.bl = line;
          break;
        case 'right':
          if (right) sides.br = line;
          break;
        case 'none':
          Object.assign(sides, { bt: undefined, br: undefined, bb: undefined, bl: undefined });
          break;
      }
      if (Object.keys(sides).length) set(r, c, sides);
    }
  if (where === 'none') {
    for (let c = x.c1; c <= x.c2; c++) {
      if (sh.cells[refName(x.r1 - 1, c)]?.s?.bb) set(x.r1 - 1, c, { bb: undefined });
      if (sh.cells[refName(x.r2 + 1, c)]?.s?.bt) set(x.r2 + 1, c, { bt: undefined });
    }
    for (let r = x.r1; r <= x.r2; r++) {
      if (sh.cells[refName(r, x.c1 - 1)]?.s?.br) set(r, x.c1 - 1, { br: undefined });
      if (sh.cells[refName(r, x.c2 + 1)]?.s?.bl) set(r, x.c2 + 1, { bl: undefined });
    }
  }
  return out;
}

// ---- merging ------------------------------------------------------------------------------------------------------

/**
 * Merges after merging a selection (all of it, each row across, or each column down) or splitting what it touches;
 * and the cells whose values go (all but each merge's first), so the caller can ask first.
 */
export function mergeResult(sh: Sheet, x: Rect, how: 'all' | 'across' | 'down' | 'none'): { merges: string[]; lost: string[] } {
  const keep = (sh.merges ?? []).filter((m) => {
    const r = new Merges([m]).list[0];
    return r && (r.r2 < x.r1 || r.r1 > x.r2 || r.c2 < x.c1 || r.c1 > x.c2);
  });
  const lost: string[] = [];
  if (how === 'none') return { merges: keep, lost };
  const made: Rect[] = [];
  if (how === 'all') made.push(x);
  else if (how === 'across') for (let r = x.r1; r <= x.r2; r++) made.push({ r1: r, c1: x.c1, r2: r, c2: x.c2 });
  else for (let c = x.c1; c <= x.c2; c++) made.push({ r1: x.r1, c1: c, r2: x.r2, c2: c });
  const merges = [...keep];
  for (const m of made) {
    if (m.r1 === m.r2 && m.c1 === m.c2) continue;
    merges.push(rangeName(m));
    for (let r = m.r1; r <= m.r2; r++)
      for (let c = m.c1; c <= m.c2; c++) {
        if (r === m.r1 && c === m.c1) continue;
        const cell = sh.cells[refName(r, c)];
        if (holds(cell)) lost.push(refName(r, c));
      }
  }
  return { merges, lost };
}

// ---- hiding -------------------------------------------------------------------------------------------------------

/** Rows (or columns) from `a` to `b` hidden or shown again, as a sheet's rows (cols) keep them. */
export function hiddenSet(sizes: Sheet['rows'] | Sheet['cols'], a: number, b: number, hide: boolean): Record<number, { w?: number; h?: number; hidden?: boolean }> | undefined {
  const next: Record<number, { w?: number; h?: number; hidden?: boolean }> = { ...(sizes ?? {}) };
  for (let i = a; i <= b; i++) {
    const cur = { ...(next[i] ?? {}) };
    if (hide) cur.hidden = true;
    else delete cur.hidden;
    if (Object.keys(cur).length) next[i] = cur;
    else delete next[i];
  }
  return Object.keys(next).length ? next : undefined;
}

/** The runs of hidden rows (or columns) next to `i`'s group of them: [first, last], or null. */
export function hiddenRun(sizes: Sheet['rows'] | Sheet['cols'], i: number): [number, number] | null {
  if (!sizes?.[i]?.hidden) return null;
  let a = i;
  let b = i;
  while (a > 0 && sizes[a - 1]?.hidden) a--;
  while (sizes[b + 1]?.hidden) b++;
  return [a, b];
}

// ---- paste special ------------------------------------------------------------------------------------------------

export type PasteHow = 'values' | 'formats' | 'formulas' | 'transposed';

/** What Paste special puts where, from cells copied here: their values as they showed, their looks, their formulas, or all of it turned on its side. */
export function pasteSpecial(sh: Sheet, target: Rect, clip: Clip, how: PasteHow): { changes: Record<string, Cell | null>; x: Rect } {
  const out: Record<string, Cell | null> = {};
  const src = clip.cells;
  const h0 = src.length;
  const w0 = Math.max(1, ...src.map((r) => r.length));
  const turn = how === 'transposed';
  const h = turn ? w0 : h0;
  const w = turn ? h0 : w0;
  const x: Rect = { r1: target.r1, c1: target.c1, r2: target.r1 + h - 1, c2: target.c1 + w - 1 };
  for (let i = 0; i < h; i++)
    for (let j = 0; j < w; j++) {
      const [si, sj] = turn ? [j, i] : [i, j];
      const cell = src[si]?.[sj] ?? null;
      const val = clip.vals[si]?.[sj] ?? null;
      const r = x.r1 + i;
      const c = x.c1 + j;
      const k = refName(r, c);
      const old = sh.cells[k];
      if (how === 'formats') {
        const next: Cell = { ...(old ?? {}) };
        if (cell?.s) next.s = cell.s;
        else delete next.s;
        out[k] = tidyCell(next);
      } else if (how === 'values') {
        const v = valueOf(val);
        const next: Cell = { ...(old?.s ? { s: old.s } : {}), ...(old?.note ? { note: old.note } : {}) };
        if (v !== undefined) next.v = v;
        out[k] = tidyCell(next);
      } else if (how === 'formulas') {
        const next: Cell = { ...(old?.s ? { s: old.s } : {}), ...(old?.note ? { note: old.note } : {}) };
        if (cell?.f !== undefined) next.f = clip.cut ? cell.f : shiftFormula(cell.f, r - (clip.x.r1 + si), c - (clip.x.c1 + sj));
        else if (cell?.v !== undefined) next.v = cell.v;
        out[k] = tidyCell(next);
      } else {
        if (!cell) {
          out[k] = null;
          continue;
        }
        const next: Cell = { ...cell };
        if (next.f !== undefined && !clip.cut) next.f = shiftFormula(next.f, r - (clip.x.r1 + si), c - (clip.x.c1 + sj));
        out[k] = next;
      }
    }
  return { changes: out, x };
}

/** A worked-out value as a cell keeps it (errors and blanks are nothing). */
const valueOf = (v: Scalar): string | number | boolean | undefined => (v === null || typeof v === 'object' ? undefined : v === '' ? undefined : v);

/** Text pasted as values only: typed in as words and numbers, never formulas, the cells' own looks kept. */
export function pasteTextValues(sh: Sheet, target: Rect, rows: string[][]): { changes: Record<string, Cell | null>; x: Rect } {
  const out: Record<string, Cell | null> = {};
  rows.forEach((row, i) =>
    row.forEach((t, j) => {
      const k = refName(target.r1 + i, target.c1 + j);
      const old = sh.cells[k];
      const typed = t === '' ? null : t.startsWith('=') ? { v: t } : typedCell(parseInput(t, old?.s?.fmt), old?.s);
      out[k] = tidyCell({ ...(old?.s ? { s: old.s } : {}), ...(typed ?? {}), ...(old?.note ? { note: old.note } : {}) });
    }),
  );
  const w = Math.max(1, ...rows.map((r) => r.length));
  return { changes: out, x: { r1: target.r1, c1: target.c1, r2: target.r1 + Math.max(1, rows.length) - 1, c2: target.c1 + w - 1 } };
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

/** The rows of a block sorted by several columns in turn, each A to Z or Z to A: whole rows move (their formulas along). */
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

/**
 * A summary of a table, as a pivot table gives one but made of formulas that keep up with the table: a row for each
 * value of one column (and a column for each value of another, when asked), each value column summed, counted,
 * averaged or its lowest or highest, and a total. The table's first row is its header; its columns are read whole when
 * it starts at the sheet's top, so rows added under it count too.
 */
export function summarySheet(sh: Sheet, calc: Calc, si: number, x: Rect, by: number, across: number | null, values: { c: number; fn: SummaryFn }[], name: string): Sheet {
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
  // Its headers in the language the app is read in (they are the sheet's words from then on).
  const title = (fn: SummaryFn, of: string) => ({ sum: tr(`Sum of ${of}`), count: tr(`Count of ${of}`), average: tr(`Average of ${of}`), min: tr(`Lowest of ${of}`), max: tr(`Highest of ${of}`) })[fn];
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
    put(n + 1, 0, { v: tr('Total'), s: bold });
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
    put(0, cols.length + 1, { v: tr('Total'), s: bold });
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
    put(n + 1, 0, { v: tr('Total'), s: bold });
    for (let j = 0; j <= cols.length; j++) {
      const col = colName(1 + j);
      const body = v.fn === 'sum' || v.fn === 'count' ? `SUM(${col}2:${col}${n + 1})` : j === cols.length ? `${f.whole}(${ref(v.c)})` : `${f.ifs}(${ref(v.c)},${ref(across)},${col}$1)`;
      put(n + 1, 1 + j, { f: body, s: { ...bold, ...(v.fn !== 'count' ? (fmtOf(v.c) ?? {}) : {}) } });
    }
  }
  return { id: '', name, cells, freeze: { rows: 1 }, cols: { 0: { w: 160 } } };
}

// ---- find and replace ---------------------------------------------------------------------------------------------------

/** Where a cell found is: its sheet (index), row and column. */
export interface Found {
  si: number;
  r: number;
  c: number;
}

export interface FindHow extends FindOptions {
  /** In the formulas (what cells hold), rather than the values they show. */
  formulas: boolean;
  /** The whole of a cell's words, not a part of them. */
  wholeCell: boolean;
  /** Every sheet, from this one on. */
  allSheets: boolean;
}

/** What a cell is searched in: its formula (or value as typed), or what it shows. */
const searched = (cell: Cell | undefined, calc: Calc, si: number, r: number, c: number, formulas: boolean) => (!holds(cell) ? '' : formulas ? inputText(cell) : formatValue(calc.value(si, r, c), cell!.s));

/** The matches of a cell's words: where they are, or (whole cell) all of them when they are the words looked for. */
function matchesOf(text: string, q: string, o: FindHow): Match[] {
  if (!text) return [];
  if (o.wholeCell) {
    if (o.regex) {
      const m = findIn(text, q, o);
      return m.length === 1 && m[0].s === 0 && m[0].e === text.length ? m : [];
    }
    return (o.matchCase ? text === q : text.toLowerCase() === q.toLowerCase()) ? [{ s: 0, e: text.length }] : [];
  }
  return findIn(text, q, o, 200);
}

/** Every cell with the words in it, in reading order, this sheet first. */
export function findCells(book: Workbook, calc: Calc, si: number, q: string, o: FindHow, limit = 5000): Found[] {
  const out: Found[] = [];
  if (!q) return out;
  const order = o.allSheets ? [...book.sheets.keys()].map((i) => (si + i) % book.sheets.length) : [si];
  for (const s of order) {
    const sh = book.sheets[s];
    for (const k of calc.keys(s)) {
      const r = Math.floor(k / 16_384);
      const c = k % 16_384;
      const cell = sh.cells[refName(r, c)];
      if (matchesOf(searched(cell, calc, s, r, c, o.formulas), q, o).length) out.push({ si: s, r, c });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** A cell with the words replaced (the first match, or all), typed again as a person would type the new words. */
export function replacedCell(cell: Cell, calc: Calc, si: number, r: number, c: number, q: string, rep: string, o: FindHow, all: boolean): { cell: Cell | null; count: number } | null {
  const text = searched(cell, calc, si, r, c, o.formulas);
  const ms = matchesOf(text, q, o);
  if (!ms.length) return null;
  let next: string;
  let count: number;
  if (o.wholeCell) {
    next = o.regex ? replacementOf(text, ms[0], q, rep, o) : rep;
    count = 1;
  } else if (all) {
    const got = replaceAllIn(text, q, rep, o);
    next = got.text;
    count = got.count;
  } else {
    next = text.slice(0, ms[0].s) + replacementOf(text, ms[0], q, rep, o) + text.slice(ms[0].e);
    count = 1;
  }
  // In values, a formula's result cannot be changed: only cells that hold what they show.
  if (!o.formulas && cell.f !== undefined) return null;
  const typed = next === '' ? null : typedCell(parseInput(next, cell.s?.fmt), cell.s);
  return { cell: tidyCell({ ...(typed ?? {}), ...(cell.s && !typed?.s ? { s: cell.s } : {}), ...(cell.note ? { note: cell.note } : {}) }), count };
}
