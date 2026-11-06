// Data → Pivot table: a table summed up on a sheet of its own, as a pivot table does, but made of formulas that keep up
// with the table (SUMIFS, COUNTIFS, AVERAGEIFS, MINIFS, MAXIFS): a row for each value of one column (or each pair of
// values of two), a column for each value of another (and each value summed up), the rows of values a filter leaves
// out not counted, and totals. Its settings are kept with the sheet it makes, to change it and make it again (a value
// new in the table then gets its row).
import { colIndex, colName, formatValue, quoteSheet, refName, sourceOf, type Calc, type Cell, type PivotDef, type Scalar, type Sheet, type Workbook } from './sheets.ts';

const FN: Record<PivotDef['values'][number]['fn'], { ifs: string; title: string }> = {
  sum: { ifs: 'SUMIFS', title: 'Sum of' },
  count: { ifs: 'COUNTIFS', title: 'Count of' },
  average: { ifs: 'AVERAGEIFS', title: 'Average of' },
  min: { ifs: 'MINIFS', title: 'Lowest of' },
  max: { ifs: 'MAXIFS', title: 'Highest of' },
};

/** A value as a formula writes it: a number as it is, words in quotes. */
const lit = (v: Scalar) => (typeof v === 'number' ? String(v) : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : `"${String(v).replace(/"/g, '""')}"`);

/** The values a column of the table has (as their cells show them, once each, in order), and whether it has empty ones. */
export function pivotValues(book: Workbook, calc: Calc, def: Pick<PivotDef, 'source'>, col: string): string[] {
  const src = sourceOf(def.source);
  const si = src?.sheet ? calc.sheetIndex(src.sheet) : -1;
  if (!src || si < 0) return [];
  const c = colIndex(col);
  const seen = new Map<string, string>();
  for (let r = src.x.r1 + 1; r <= Math.min(src.x.r2, src.x.r1 + 20_000); r++) {
    const v = calc.value(si, r, c);
    const t = v === null ? '' : formatValue(v, book.sheets[si].cells[refName(r, c)]?.s).trim();
    if (!seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  }
  return [...seen.values()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })));
}

/** The pivot table a sheet holds, made from its settings: its cells (formulas), frozen header, and the settings kept with it. */
export function pivotSheet(book: Workbook, calc: Calc, def: PivotDef, name: string): Sheet | null {
  const src = sourceOf(def.source);
  const si = src?.sheet ? calc.sheetIndex(src.sheet) : -1;
  if (!src || si < 0 || src.x.r2 <= src.x.r1) return null;
  const sh = book.sheets[si];
  const x = src.x;
  const head = (c: number) => formatValue(calc.value(si, x.r1, c), sh.cells[refName(x.r1, c)]?.s) || colName(c);
  // Whole columns when the table starts at the top: rows added under it count too.
  const whole = x.r1 === 0;
  const ref = (c: number) => `${quoteSheet(sh.name)}!$${colName(c)}${whole ? '' : `$${x.r1 + 2}`}:$${colName(c)}${whole ? '' : `$${x.r2 + 1}`}`;
  // The values of a column, once each and in order (numbers by size, words A to Z), as they are (not as shown).
  const distinct = (c: number) => {
    const seen = new Map<string, Scalar>();
    for (let r = x.r1 + 1; r <= x.r2; r++) {
      const v = calc.value(si, r, c);
      if (v === null || v === '' || typeof v === 'object') continue;
      const k = typeof v === 'string' ? v.trim().toLowerCase() : `${typeof v}:${v}`;
      if (!seen.has(k)) seen.set(k, typeof v === 'string' ? v.trim() : v);
    }
    return [...seen.values()].sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })));
  };
  // The rows a filter leaves out: each value it hides, as "not this" (empty ones as "not empty").
  const shownText = (r: number, c: number) => {
    const v = calc.value(si, r, c);
    return v === null ? '' : formatValue(v, sh.cells[refName(r, c)]?.s).trim();
  };
  const filters: string[] = [];
  for (const f of def.filters ?? []) {
    const c = colIndex(f.col);
    const hide = new Set(f.hide.map((h) => h.toLowerCase()));
    // Hidden by what the cells show: the criteria name the values they hold.
    const vals = new Map<string, Scalar>();
    for (let r = x.r1 + 1; r <= x.r2; r++) {
      const t = shownText(r, c);
      if (hide.has(t.toLowerCase()) && !vals.has(t.toLowerCase())) vals.set(t.toLowerCase(), calc.value(si, r, c));
    }
    for (const v of vals.values()) filters.push(`,${ref(c)},${v === null || v === '' ? '"<>"' : lit(`<>${typeof v === 'number' ? String(v) : String(v)}`)}`);
  }
  const extra = filters.join('');
  const rowCols = def.rows.map(colIndex).filter((c) => c >= x.c1 && c <= x.c2);
  if (!rowCols.length) return null;
  const across = def.cols ? colIndex(def.cols) : -1;
  const values = def.values.map((v) => ({ c: colIndex(v.col), fn: v.fn })).filter((v) => v.c >= x.c1 && v.c <= x.c2);
  if (!values.length) return null;
  // The rows: each value of the first column, or each pair of the two that the table has.
  let keys: Scalar[][];
  if (rowCols.length === 1) keys = distinct(rowCols[0]).map((v) => [v]);
  else {
    const pairs = new Map<string, Scalar[]>();
    for (let r = x.r1 + 1; r <= x.r2; r++) {
      const a = calc.value(si, r, rowCols[0]);
      const b = calc.value(si, r, rowCols[1]);
      if (a === null || a === '' || typeof a === 'object' || b === null || b === '' || typeof b === 'object') continue;
      const k = `${String(a).toLowerCase()}\u0001${String(b).toLowerCase()}`;
      if (!pairs.has(k)) pairs.set(k, [typeof a === 'string' ? a.trim() : a, typeof b === 'string' ? b.trim() : b]);
    }
    const order = (u: Scalar, v: Scalar) => (typeof u === 'number' && typeof v === 'number' ? u - v : String(u).localeCompare(String(v), undefined, { numeric: true, sensitivity: 'base' }));
    keys = [...pairs.values()].sort((p, q) => order(p[0], q[0]) || order(p[1], q[1]));
  }
  // A value a filter leaves out has no row (nor column) of its own.
  const hiddenAt = (v: Scalar, c: number) => !!def.filters?.some((f) => colIndex(f.col) === c && f.hide.some((h) => h.toLowerCase() === String(v).toLowerCase()));
  keys = keys.filter((k) => !rowCols.some((c, j) => hiddenAt(k[j], c))).slice(0, 2000);
  const acrossVals = across >= 0 ? distinct(across).filter((v) => !hiddenAt(v, across)).slice(0, 100) : [null];
  const cells: Record<string, Cell> = {};
  const bold = { b: true };
  const put = (r: number, c: number, cell: Cell) => (cells[refName(r, c)] = cell);
  const fmtOf = (c: number) => {
    const s = sh.cells[refName(x.r1 + 1, c)]?.s;
    return s?.fmt || s?.code ? { ...(s.fmt ? { fmt: s.fmt } : {}), ...(s.dp !== undefined ? { dp: s.dp } : {}), ...(s.cur ? { cur: s.cur } : {}), ...(s.code ? { code: s.code } : {}) } : undefined;
  };
  const k0 = rowCols.length;
  rowCols.forEach((c, j) => put(0, j, { v: head(c), s: bold }));
  // The value columns: each value summed up, for each value of the column across (when there is one).
  const columns: { v: (typeof values)[number]; a: Scalar | null }[] = [];
  for (const a of acrossVals) for (const v of values) columns.push({ v, a });
  columns.forEach((col, j) => put(0, k0 + j, { v: `${FN[col.v.fn].title} ${head(col.v.c)}${col.a !== null ? ` · ${String(col.a)}` : ''}`, s: bold }));
  keys.forEach((key, i) => {
    key.forEach((v, j) => put(1 + i, j, typeof v === 'number' || typeof v === 'boolean' ? { v } : { v: String(v) }));
    columns.forEach((col, j) => {
      const crit = rowCols.map((c, q) => `,${ref(c)},$${colName(q)}${i + 2}`).join('') + (col.a !== null ? `,${ref(across)},${lit(col.a)}` : '') + extra;
      const body = col.v.fn === 'count' ? `COUNTIFS(${crit.slice(1)})` : `${FN[col.v.fn].ifs}(${ref(col.v.c)}${crit})`;
      put(1 + i, k0 + j, { f: body, ...(col.v.fn !== 'count' && fmtOf(col.v.c) ? { s: fmtOf(col.v.c) } : {}) });
    });
  });
  const n = keys.length;
  put(n + 1, 0, { v: 'Total', s: bold });
  columns.forEach((col, j) => {
    const L = colName(k0 + j);
    const crit = (col.a !== null ? `,${ref(across)},${lit(col.a)}` : '') + extra;
    const body =
      col.v.fn === 'sum' || col.v.fn === 'count'
        ? `SUM(${L}2:${L}${n + 1})`
        : crit
          ? `${FN[col.v.fn].ifs}(${ref(col.v.c)}${crit})`
          : `${col.v.fn === 'average' ? 'AVERAGE' : col.v.fn === 'min' ? 'MIN' : 'MAX'}(${ref(col.v.c)})`;
    put(n + 1, k0 + j, { f: body, s: { ...bold, ...(col.v.fn !== 'count' ? (fmtOf(col.v.c) ?? {}) : {}) } });
  });
  const widths: Record<number, { w: number }> = {};
  rowCols.forEach((_, j) => (widths[j] = { w: 150 }));
  columns.forEach((_, j) => (widths[k0 + j] = { w: 130 }));
  return { id: '', name, cells, freeze: { rows: 1, cols: k0 }, cols: widths, pivot: def };
}
