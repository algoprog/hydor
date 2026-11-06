// Clean up the data: what is untidy in a table, found here for nothing, each with the change that puts it right (one
// step to undo in the editor): words with spaces at their ends or twice between them, numbers and dates kept as words,
// different spellings of the same thing in a column of categories, duplicate rows, and empty rows inside the table.
import { cleanStyle, colName, parseDate, parseNumberText, refName, type Calc, type Cell, type Rect, type Sheet } from './sheets.ts';
import { removeDuplicates, trimChanges } from './sheet-tools.ts';

export type IssueKind = 'spaces' | 'numbers' | 'dates' | 'spelling' | 'dups' | 'blank';

export interface CleanIssue {
  id: string;
  kind: IssueKind;
  /** "Spaces at the ends of words", in a line. */
  title: string;
  /** What it is and where: "12 cells in Name (A) and City (C)". */
  detail: string;
  /** The cells it is about, to show them. */
  cells: string[];
  /** The cells' new contents (null empties one), when the fix is a change of cells. */
  changes?: Record<string, Cell | null>;
  /** Rows of the sheet to take out (from 0, highest first), when the fix is that. */
  rows?: number[];
}

/** Two words that differ by one letter put in, taken out, changed or two swapped (Damerau–Levenshtein ≤ 1). */
function nearly(a: string, b: string): boolean {
  if (a === b) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/** Words as a category's key: in small letters, without spaces, dots or dashes. */
const keyOf = (s: string) => s.toLowerCase().replace(/[\s.\-_'’]+/g, '');

/**
 * What is untidy in the table `x` of a sheet (its first row a header when `header`): each with its fix. Formulas are
 * left as they are; only cells that hold values are changed.
 */
export function findIssues(sh: Sheet, calc: Calc, si: number, x: Rect, header: boolean): CleanIssue[] {
  const out: CleanIssue[] = [];
  const r0 = header ? x.r1 + 1 : x.r1;
  const name = (c: number) => {
    const h = header ? calc.value(si, x.r1, c) : null;
    return typeof h === 'string' && h.trim() ? `${h.trim()} (${colName(c)})` : `column ${colName(c)}`;
  };
  const listCols = (cols: Set<number>) => {
    const list = [...cols].sort((a, b) => a - b).map(name);
    return list.length > 3 ? `${list.slice(0, 3).join(', ')} and ${list.length - 3} more` : list.join(' and ');
  };
  const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

  // Spaces at the ends of words, or twice between them.
  const trim = trimChanges(sh, calc, si, { ...x, r1: r0 });
  if (trim.count) {
    const names = Object.keys(trim.changes);
    const cols = new Set(names.map((k) => colIdx(k)));
    out.push({ id: 'spaces', kind: 'spaces', title: 'Spaces at the ends of words, or twice between them', detail: `${n(trim.count, 'cell')} in ${listCols(cols)}`, cells: names, changes: trim.changes });
  }

  // Per column: numbers and dates kept as words, and different spellings of the same thing.
  const numbers: Record<string, Cell | null> = {};
  const numCols = new Set<number>();
  const dates: Record<string, Cell | null> = {};
  const dateCols = new Set<number>();
  for (let c = x.c1; c <= x.c2; c++) {
    let nums = 0;
    let datesKept = 0;
    const words: [string, string][] = [];
    for (let r = r0; r <= x.r2; r++) {
      const k = refName(r, c);
      const cell = sh.cells[k];
      if (!cell || cell.f !== undefined || cell.v === undefined) continue;
      if (typeof cell.v === 'number') {
        nums++;
        if (cell.s?.fmt === 'date' || cell.s?.fmt === 'datetime') datesKept++;
      } else if (typeof cell.v === 'string' && cell.v.trim()) words.push([k, cell.v]);
    }
    const asNumbers = words.flatMap(([k, v]) => {
      if (cell(sh, k)?.s?.fmt === 'text') return [];
      const t = parseNumberText(v.trim());
      return t && typeof t.v === 'number' && !t.fmt?.startsWith('date') && t.fmt !== 'date' ? [[k, t] as const] : [];
    });
    // Numbers kept as words, in a column that is mostly numbers (or all of whose words are numbers).
    if (asNumbers.length && (nums + asNumbers.length) / Math.max(1, nums + words.length) >= 0.6) {
      for (const [k, t] of asNumbers) {
        const was = cell(sh, k)!;
        numbers[k] = { ...was, v: t.v as number, ...(t.fmt && t.fmt !== 'general' && !was.s?.fmt ? { s: cleanStyle({ ...was.s, fmt: t.fmt, dp: t.dp, cur: t.cur }) } : {}) };
        numCols.add(c);
      }
    }
    // Dates written as words, in a column of dates.
    const asDates = words.flatMap(([k, v]) => {
      if (numbers[k]) return [];
      const d = /\d/.test(v) ? parseDate(v.trim()) : null;
      return d !== null && d > 1 ? [[k, d] as const] : [];
    });
    if (asDates.length && (asDates.length + datesKept) / Math.max(1, words.length + nums) >= 0.6) {
      for (const [k, d] of asDates) {
        const was = cell(sh, k)!;
        dates[k] = { ...was, v: d, s: cleanStyle({ ...was.s, fmt: d % 1 ? 'datetime' : 'date' }) };
        dateCols.add(c);
      }
    }
    // Different spellings of a category: the same in other letters' case or spaces, or a letter apart from one far more common.
    const rest = words.filter(([k]) => !numbers[k] && !dates[k]);
    if (rest.length >= 4) {
      const counts = new Map<string, number>();
      for (const [, v] of rest) counts.set(v.trim(), (counts.get(v.trim()) ?? 0) + 1);
      if (counts.size < rest.length && counts.size <= 60) {
        const variants = [...counts.entries()].sort((a, b) => b[1] - a[1]);
        const to = new Map<string, string>();
        for (const [v, k] of variants) {
          if (to.has(v)) continue;
          const better = variants.find(([w, kw]) => w !== v && !to.has(w) && (keyOf(w) === keyOf(v) ? kw >= k : kw >= 2 * k && kw >= 2 && keyOf(v).length >= 4 && nearly(keyOf(w), keyOf(v))));
          if (better) to.set(v, better[0]);
        }
        if (to.size) {
          const changes: Record<string, Cell | null> = {};
          for (const [k, v] of rest) {
            const t = to.get(v.trim());
            if (t !== undefined) changes[k] = { ...cell(sh, k)!, v: t };
          }
          const pairs = [...to.entries()].slice(0, 3).map(([a, b]) => `“${a}” → “${b}”`);
          out.push({
            id: `spelling-${c}`,
            kind: 'spelling',
            title: `Different spellings of the same thing in ${name(c)}`,
            detail: `${pairs.join(', ')}${to.size > 3 ? ` and ${to.size - 3} more` : ''}: ${n(Object.keys(changes).length, 'cell')}`,
            cells: Object.keys(changes),
            changes,
          });
        }
      }
    }
  }
  if (Object.keys(numbers).length) out.push({ id: 'numbers', kind: 'numbers', title: 'Numbers kept as words', detail: `${n(Object.keys(numbers).length, 'cell')} in ${listCols(numCols)}: sums and charts leave them out`, cells: Object.keys(numbers), changes: numbers });
  if (Object.keys(dates).length) out.push({ id: 'dates', kind: 'dates', title: 'Dates written as words', detail: `${n(Object.keys(dates).length, 'cell')} in ${listCols(dateCols)}: they don’t sort or count as dates`, cells: Object.keys(dates), changes: dates });

  // Duplicate rows.
  const cols = Array.from({ length: x.c2 - x.c1 + 1 }, (_, i) => x.c1 + i);
  const dups = removeDuplicates(sh, calc, si, x, header, cols);
  if (dups.removed) out.push({ id: 'dups', kind: 'dups', title: 'Duplicate rows', detail: `${n(dups.removed, 'row')} the same as one above ${dups.removed === 1 ? 'it' : 'them'}`, cells: [], changes: dups.changes });

  // Empty rows inside the table (empty right across the sheet).
  const blank: number[] = [];
  for (let r = r0; r < x.r2; r++) {
    let empty = true;
    for (let c = x.c1; c <= x.c2 && empty; c++) if (calc.value(si, r, c) !== null) empty = false;
    if (empty && !Object.keys(sh.cells).some((k) => rowIdx(k) === r && (sh.cells[k].v !== undefined || sh.cells[k].f !== undefined))) blank.push(r);
  }
  if (blank.length) out.push({ id: 'blank', kind: 'blank', title: 'Empty rows inside the table', detail: `${n(blank.length, 'row')}: ${blank.slice(0, 5).map((r) => r + 1).join(', ')}${blank.length > 5 ? '…' : ''}`, cells: blank.map((r) => refName(r, x.c1)), rows: blank.reverse() });
  return out;
}

const cell = (sh: Sheet, k: string) => sh.cells[k];
const colIdx = (k: string) => {
  const m = /^([A-Z]+)/.exec(k)!;
  let c = 0;
  for (const ch of m[1]) c = c * 26 + ch.charCodeAt(0) - 64;
  return c - 1;
};
const rowIdx = (k: string) => Number(/\d+$/.exec(k)![0]) - 1;
