// The spreadsheet editor's tools as plain functions, each giving the changes it makes (ops.ts turns them into a
// patch, one step of Undo): borders over a selection, merging cells, hiding and showing rows and columns, Paste
// special (values, formats or formulas only, or turned on its side), the data tools (remove duplicates, split text to
// columns, trim spaces, a summary of a table as a sheet of formulas), sorting by several columns, and finding words in
// the cells and putting others in their place.
import { findIn, replaceAllIn, replacementOf, type FindOptions, type Match } from '../common/find';
import { formatValue, inputText, parseInput, rangeName, refName, shiftFormula, typedCell, type Calc, type Cell, type Rect, type Scalar, type Sheet, type Workbook } from '@shared/sheets';
import { Merges } from '@shared/sheet-rules';
import { tr } from '../../../i18n/runtime';
import { holds, tidyCell, withStyle, type Clip } from './ops';
import { guessSeparator, removeDuplicates, sortByKeys, splitColumn, summarySheet as summaryOf, trimChanges, type SummaryFn, type SummaryWords } from '@shared/sheet-tools';

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

// The data tools agents use too (shared/sheet-tools.ts): removing duplicates, splitting words into columns, trimming
// spaces, sorting by several columns, and a summary of a table, its headers in the language the app is read in.
export { guessSeparator, removeDuplicates, sortByKeys, splitColumn, trimChanges, type SummaryFn };

const SUMMARY_WORDS: SummaryWords = {
  title: (fn, of) => ({ sum: tr(`Sum of ${of}`), count: tr(`Count of ${of}`), average: tr(`Average of ${of}`), min: tr(`Lowest of ${of}`), max: tr(`Highest of ${of}`) })[fn],
  total: () => tr('Total'),
};

/** A summary of a table as a sheet of formulas (shared/sheet-tools.ts summarySheet), its headers in the app's language. */
export const summarySheet = (sh: Sheet, calc: Calc, si: number, x: Rect, by: number, across: number | null, values: { c: number; fn: SummaryFn }[], name: string): Sheet => summaryOf(sh, calc, si, x, by, across, values, name, SUMMARY_WORDS);

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
