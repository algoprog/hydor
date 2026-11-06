// A slide's chart from a spreadsheet of the Library (Google Slides' linked charts): the tables a workbook holds (each
// block of filled cells, with its column names), and a chart's labels and series read from a sheet's range as the
// spreadsheet's own charts read them (sheet-chart.ts: the first column the labels, the first row the series' names when
// they are words, hidden rows left out), worked out with the workbook's formulas. The editor reads them when a chart is
// made and on Update; save_slides when an agent gives a chart a source and no numbers.
import { chartData } from './sheet-chart.ts';
import { Calc, colName, type Workbook } from './sheets.ts';
import { SLIDE_LIMITS, type ChartEl, type ChartKind, type ChartSource, type Series } from './slides.ts';

/** A block of filled cells: its sheet, its range, its size, and its first row's words (its columns' names, when it has them). */
export interface SheetTable {
  sheet: string;
  range: string;
  rows: number;
  cols: number;
  names: string[];
}

/** A cell's name ("B12") as its row and column from 0, or null. */
function at(name: string): { r: number; c: number } | null {
  const m = /^([A-Z]{1,3})([0-9]{1,7})$/.exec(name);
  if (!m) return null;
  let c = 0;
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
  return { r: Number(m[2]) - 1, c: c - 1 };
}

/**
 * The tables of a workbook, largest first: each block of filled cells touching one another (a gap of a whole empty row
 * or column between blocks), of two rows or more, with a number in it. At most `max` of them.
 */
export function sheetTables(book: Workbook, max = 12): SheetTable[] {
  const out: (SheetTable & { area: number })[] = [];
  for (const sh of book.sheets) {
    const filled = new Map<string, { r: number; c: number; v: unknown }>();
    for (const [name, cell] of Object.entries(sh.cells)) {
      const p = at(name);
      const v = cell.f !== undefined ? '=' : cell.v;
      if (p && v !== undefined && v !== null && v !== '') filled.set(`${p.r},${p.c}`, { ...p, v });
      if (filled.size > 200_000) break;
    }
    const seen = new Set<string>();
    for (const [k, start] of filled) {
      if (seen.has(k)) continue;
      // The block round this cell: its neighbours, across corners too.
      let [r1, c1, r2, c2] = [start.r, start.c, start.r, start.c];
      let numbers = 0;
      const stack = [start];
      seen.add(k);
      while (stack.length) {
        const p = stack.pop()!;
        [r1, c1, r2, c2] = [Math.min(r1, p.r), Math.min(c1, p.c), Math.max(r2, p.r), Math.max(c2, p.c)];
        if (typeof p.v === 'number' || p.v === '=') numbers++;
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            const n = `${p.r + dr},${p.c + dc}`;
            const q = filled.get(n);
            if (q && !seen.has(n)) {
              seen.add(n);
              stack.push(q);
            }
          }
      }
      if (r2 - r1 < 1 || !numbers) continue;
      const names: string[] = [];
      for (let c = c1; c <= Math.min(c2, c1 + 11); c++) {
        const v = filled.get(`${r1},${c}`)?.v;
        names.push(typeof v === 'string' ? v.slice(0, 40) : '');
      }
      out.push({ sheet: sh.name, range: `${colName(c1)}${r1 + 1}:${colName(c2)}${r2 + 1}`, rows: r2 - r1 + 1, cols: c2 - c1 + 1, names, area: (r2 - r1 + 1) * (c2 - c1 + 1) });
    }
  }
  return out
    .sort((a, b) => b.area - a.area)
    .slice(0, max)
    .map(({ area: _a, ...t }) => t);
}

/**
 * A chart's labels and series from a sheet's range, as the slide keeps them (at most its limits: 80 labels, 12 series;
 * a cell without a number counts 0); or why they cannot be read, in words a person can act on.
 */
export function chartFromSheet(book: Workbook, src: Pick<ChartSource, 'sheet' | 'range' | 'by'>, kind: ChartKind = 'column'): { labels: string[]; series: Series[] } | { error: string } {
  const si = book.sheets.findIndex((s) => s.name.toLowerCase() === src.sheet.trim().toLowerCase());
  if (si < 0) return { error: `The spreadsheet has no sheet named “${src.sheet}” any more.` };
  const calc = new Calc(book);
  const d = chartData(book, calc, si, { id: 'slide', kind: kind === 'doughnut' || kind === 'pie' ? kind : 'column', range: src.range, ...(src.by ? { by: src.by } : {}), from: { cell: 'A1' }, to: { cell: 'A1' } });
  if (!d || !d.series.length) return { error: `There are no numbers to draw in ${src.range} of “${src.sheet}”: pick the cells with the table, its names in the first row and its labels down the first column.` };
  const labels = d.labels.slice(0, SLIDE_LIMITS.labels).map((l) => String(l).slice(0, 120));
  const series = d.series
    .slice(0, SLIDE_LIMITS.series)
    .map((s, i) => ({ name: String(s.name || `Series ${i + 1}`).slice(0, 120), values: s.values.slice(0, labels.length).map((v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-1e12, Math.min(1e12, Math.round(v * 100) / 100)) : 0)) }));
  return { labels, series };
}

/**
 * A chart's numbers read again from its spreadsheet's workbook (Update from the spreadsheet; agents' page_action
 * update_charts): the chart as it is to be, each series keeping the colour it was given (by its name, else its place),
 * or why it cannot be read.
 */
export function chartRefreshed(el: ChartEl, book: Workbook, title: string): ChartEl | { error: string } {
  const src = el.source;
  if (!src) return el;
  const r = chartFromSheet(book, src, el.kind);
  if ('error' in r) return r;
  const series = r.series.map((s, i) => {
    const was = el.series.find((x) => x.name === s.name) ?? el.series[i];
    return was?.color ? { ...s, color: was.color } : s;
  });
  return { ...el, labels: r.labels, series, source: { ...src, title, at: Date.now() } };
}
