// Goal seek (Excel's What-If Analysis: the value of one cell that makes a formula give the result wanted), and the
// cells a formula uses or that use a cell (Trace precedents, Trace dependents), as the editor outlines them.
import { colName, computeBook, formulaRefs, parseRef, sourceOf, type Calc, type Rect, type Workbook } from './sheets.ts';

export interface GoalSeekResult {
  /** The value found for the changing cell, and what the formula gives with it. */
  value: number;
  result: number;
  /** Whether the result is the one wanted (to about 1 in a million). */
  reached: boolean;
}

/**
 * The value of `byCell` (a cell of numbers, not a formula) that makes `setCell` (a formula that depends on it) give
 * `target`: the secant method from its value now, then halving a bracket when that does not settle. Null when the
 * formula never gives a number.
 */
export function goalSeek(book: Workbook, si: number, setCell: string, target: number, byCell: string): GoalSeekResult | null {
  const sh = book.sheets[si];
  if (!sh) return null;
  const cells = { ...sh.cells };
  const work: Workbook = { ...book, sheets: book.sheets.map((s, i) => (i === si ? { ...s, cells } : s)) };
  const calc: Calc = computeBook(work);
  const at = (x: number): number | null => {
    cells[byCell] = { ...(sh.cells[byCell] ?? {}), v: x };
    delete cells[byCell].f;
    calc.update(si, [byCell]);
    const v = calc.get(sh.id, setCell);
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };
  const start = typeof sh.cells[byCell]?.v === 'number' ? (sh.cells[byCell].v as number) : 0;
  const tol = 1e-7 * Math.max(1, Math.abs(target));
  let best: { x: number; f: number } | null = null;
  const keep = (x: number, f: number | null) => {
    if (f === null) return;
    if (!best || Math.abs(f - target) < Math.abs(best.f - target)) best = { x, f };
  };
  // Secant steps.
  let x0 = start;
  let x1 = start === 0 ? 1 : start * 1.01;
  let f0 = at(x0);
  let f1 = at(x1);
  keep(x0, f0);
  keep(x1, f1);
  for (let i = 0; i < 100 && f0 !== null && f1 !== null; i++) {
    if (Math.abs(f1 - target) <= tol) break;
    const d = f1 - f0;
    if (d === 0 || !Number.isFinite(d)) break;
    const x2 = x1 - ((f1 - target) * (x1 - x0)) / d;
    if (!Number.isFinite(x2)) break;
    [x0, f0] = [x1, f1];
    x1 = x2;
    f1 = at(x1);
    keep(x1, f1);
  }
  // Not there: a bracket found by widening steps, then halved.
  if (!best || Math.abs((best as { f: number }).f - target) > tol) {
    let lo = start - 1;
    let hi = start + 1;
    let flo = at(lo);
    let fhi = at(hi);
    for (let k = 0; k < 60 && flo !== null && fhi !== null && Math.sign(flo - target) === Math.sign(fhi - target); k++) {
      const w = (hi - lo) * 2;
      [lo, hi] = [lo - w, hi + w];
      [flo, fhi] = [at(lo), at(hi)];
    }
    if (flo !== null && fhi !== null && Math.sign(flo - target) !== Math.sign(fhi - target)) {
      for (let k = 0; k < 200; k++) {
        const mid = (lo + hi) / 2;
        const fm = at(mid);
        if (fm === null) break;
        keep(mid, fm);
        if (Math.abs(fm - target) <= tol) break;
        if (Math.sign(fm - target) === Math.sign(flo - target)) [lo, flo] = [mid, fm];
        else hi = mid;
      }
    }
  }
  if (!best) return null;
  const b = best as { x: number; f: number };
  // A value as Excel would type it: no more digits than it needs.
  const value = Number(b.x.toPrecision(15));
  return { value, result: b.f, reached: Math.abs(b.f - target) <= Math.max(tol, 1e-6 * Math.max(1, Math.abs(target))) };
}

/** The ranges a cell's formula uses, by sheet (its own when it names none); named ranges' ranges too. */
export function precedents(book: Workbook, si: number, cell: string): { sheet: number; x: Rect }[] {
  const f = book.sheets[si]?.cells[cell]?.f;
  if (f === undefined) return [];
  const out: { sheet: number; x: Rect }[] = [];
  const sheetOf = (name: string | undefined) => (name === undefined ? si : book.sheets.findIndex((s) => s.name.toLowerCase() === name.toLowerCase()));
  for (const { ref } of formulaRefs(f)) {
    const s = sheetOf(ref.sheet);
    if (s < 0) continue;
    const a = ref.a;
    const b = ref.b ?? ref.a;
    out.push({ sheet: s, x: { r1: Math.min(a.r ?? 0, b.r ?? 0), c1: Math.min(a.c ?? 0, b.c ?? 0), r2: Math.max(a.r ?? 1_048_575, b.r ?? 1_048_575), c2: Math.max(a.c ?? 16_383, b.c ?? 16_383) } });
  }
  // Named ranges it uses (by their words in the formula).
  for (const n of book.names ?? []) {
    if (n.sheet && n.sheet !== book.sheets[si].id) continue;
    if (!new RegExp(`(^|[^A-Za-z0-9_.])${n.name.replace(/[.\\]/g, '\\$&')}($|[^A-Za-z0-9_.(])`, 'i').test(f.replace(/"(?:[^"]|"")*"/g, '""'))) continue;
    const src = sourceOf(n.ref.replace(/\$/g, ''));
    const s = src ? sheetOf(src.sheet) : -1;
    if (src && s >= 0) out.push({ sheet: s, x: src.x });
  }
  return out;
}

/** The cells whose formulas use a cell (directly), by sheet. */
export function dependents(book: Workbook, si: number, cell: string): { sheet: number; cell: string }[] {
  const p = parseRef(cell);
  if (!p) return [];
  const out: { sheet: number; cell: string }[] = [];
  book.sheets.forEach((sh, s) => {
    for (const [k, c] of Object.entries(sh.cells)) {
      if (c.f === undefined) continue;
      if (precedents(book, s, k).some((q) => q.sheet === si && p.r >= q.x.r1 && p.r <= q.x.r2 && p.c >= q.x.c1 && p.c <= q.x.c2)) out.push({ sheet: s, cell: k });
    }
  });
  return out;
}

/** A range in words for a note: "B2:D9", "C" for a whole column, "4" for a whole row. */
export const rectWords = (x: Rect) => (x.r1 === 0 && x.r2 >= 1_048_575 ? (x.c1 === x.c2 ? colName(x.c1) : `${colName(x.c1)}:${colName(x.c2)}`) : x.c1 === 0 && x.c2 >= 16_383 ? `${x.r1 + 1}:${x.r2 + 1}` : x.r1 === x.r2 && x.c1 === x.c2 ? `${colName(x.c1)}${x.r1 + 1}` : `${colName(x.c1)}${x.r1 + 1}:${colName(x.c2)}${x.r2 + 1}`);
