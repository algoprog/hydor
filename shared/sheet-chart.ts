// A chart of a sheet's cells, as the editor, the workbook's page and its PDF draw it: the series and labels read from
// its range as the cells are now (chartData, which the Excel export writes too), a range in parts read as if its parts
// stood side by side (the labels from one, the values from the others), and the chart drawn as SVG (chartSvg):
// columns, bars, lines, areas, pies, doughnuts and scatter plots, with a title, a legend, axis titles and round
// numbers on the axes. A range it cannot draw from says why (chartProblem), in the chart's place. The SVG is text made
// here from checked values, every word escaped; its words and lines take the colour of what holds it (currentColor), so
// it reads in a dark theme and a light one alike.
import { chartParts, colName, formatValue, isDateFmt, rangeName, type Calc, type Rect, type SheetChart, type Workbook } from './sheets.ts';
import { hiddenCols, hiddenRows } from './sheet-rules.ts';

/** A series of a chart: its name, its values (null where a cell holds no number), and where its values and name are. */
export interface ChartSeries {
  name: string;
  values: (number | null)[];
  ref: Rect;
  nameAt?: { r: number; c: number };
}

export interface ChartData {
  /** The sheet the cells are on. */
  si: number;
  labels: string[];
  labelRef?: Rect;
  series: ChartSeries[];
}

/**
 * Why a chart cannot draw from its range, in plain words, or null when it can: words that are no range, parts on
 * different sheets or of different lengths, a sheet that is not there.
 */
export function chartProblem(book: Workbook, chart: SheetChart): string | null {
  const parts = chartParts(chart.range);
  if (!parts) return `“${chart.range}” is not a range of cells: give one such as A1:C9, or several split by commas, such as A1:A7,F1:F7.`;
  const sheets = new Set(parts.map((p) => (p.sheet ?? '').toLowerCase()));
  if (sheets.size > 1) return 'Its ranges are on different sheets: a chart draws from one sheet.';
  const name = parts[0].sheet;
  if (name !== undefined && !book.sheets.some((s) => s.name.toLowerCase() === name.toLowerCase())) return `There is no sheet named “${name}”.`;
  const rows = chart.by === 'rows';
  const len = (x: Rect) => (rows ? x.c2 - x.c1 : x.r2 - x.r1) + 1;
  if (parts.some((p) => len(p.x) !== len(parts[0].x))) {
    const list = parts.map((p) => rangeName(p.x)).join(', ');
    return rows ? `Its ranges are not as wide as each other (${list}): their columns go side by side.` : `Its ranges are not as long as each other (${list}): their rows go side by side.`;
  }
  return null;
}

/** How a series is drawn: as columns, a line or an area (a combo's first series as columns and the others as lines, unless it says). */
export function seriesType(chart: SheetChart, i: number): 'column' | 'line' | 'area' {
  const own = chart.series?.[i]?.type;
  if (chart.kind === 'combo') return own ?? (i === 0 ? 'column' : 'line');
  if (chart.kind === 'line' || chart.kind === 'area') return own === 'column' ? 'column' : chart.kind;
  return own === 'line' && chart.kind === 'column' ? 'line' : 'column';
}

/** The value axis a series is on: the second (at the right) when it says, on charts of columns, lines and areas. */
export const seriesAxis = (chart: SheetChart, i: number): 1 | 2 => (['column', 'line', 'area', 'combo'].includes(chart.kind) && chart.series?.[i]?.axis === 2 ? 2 : 1);

/** Colours for series without their own, as spreadsheets give them. */
export const CHART_COLORS = ['#4285f4', '#ea4335', '#fbbc04', '#34a853', '#ff6d01', '#46bdc6', '#7baaf7', '#f07b72', '#fcd04f', '#71c287', '#ff994d', '#7ed1d7'];

/**
 * A chart's series and labels from its range: series down the columns (or along the rows), the first column (or row)
 * as labels and the first row (or column) as the series' names when the chart says so, or when they hold words. Rows
 * and columns hidden are left out, unless `withHidden` (an Excel file's series are whole ranges: Excel leaves them out itself).
 */
export function chartData(book: Workbook, calc: Calc, si: number, chart: SheetChart, withHidden = false): ChartData | null {
  const parts = chartParts(chart.range);
  if (!parts || chartProblem(book, chart)) return null;
  const ds = parts[0].sheet === undefined ? si : calc.sheetIndex(parts[0].sheet);
  if (ds < 0 || !book.sheets[ds]) return null;
  const sh = book.sheets[ds];
  const e = calc.shownExtent(ds);
  const rows = chart.by === 'rows';
  // Rows and columns hidden (by hand or by the filter) are left out, as spreadsheets leave them out of charts.
  const hidR = withHidden ? new Set<number>() : hiddenRows(sh, ds, calc);
  const hidC = withHidden ? new Set<number>() : hiddenCols(sh);
  // The parts as one table: series lines (columns, for series in columns) one part after another; along each, the
  // places its values are at, counted from each part's first row (column), so the parts line up side by side.
  const x0 = parts[0].x;
  const along = rows ? Math.min(x0.c2, Math.max(x0.c1, e.cols - 1)) - x0.c1 + 1 : Math.min(x0.r2, Math.max(x0.r1, e.rows - 1)) - x0.r1 + 1;
  const pos: number[] = [];
  for (let k = 0; k < along && pos.length < 5000; k++) if (!(rows ? hidC : hidR).has((rows ? x0.c1 : x0.r1) + k)) pos.push(k);
  const lines: { p: Rect; i: number }[] = [];
  for (const { x } of parts) for (let i = rows ? x.r1 : x.c1; i <= (rows ? x.r2 : Math.min(x.c2, Math.max(x.c1, e.cols - 1))) && lines.length < 60; i++) if (!(rows ? hidR : hidC).has(i)) lines.push({ p: x, i });
  if (!pos.length || !lines.length) return null;
  // Along: where a series runs; across: one series after another.
  const n = pos.length;
  const m = lines.length;
  const at = (i: number, j: number) => (rows ? { r: lines[j].i, c: lines[j].p.c1 + pos[i] } : { r: lines[j].p.r1 + pos[i], c: lines[j].i });
  const value = (i: number, j: number) => {
    const p = at(i, j);
    return calc.value(ds, p.r, p.c);
  };
  const shown = (i: number, j: number) => {
    const p = at(i, j);
    const cell = sh.cells[`${colName(p.c)}${p.r + 1}`];
    return formatValue(calc.value(ds, p.r, p.c), cell?.s);
  };
  const isWords = (v: unknown) => typeof v === 'string' && v.trim() !== '';
  // Names: the first row's cells are words (past the labels' column).
  let names = chart.names;
  if (names === undefined) {
    names = n > 1;
    let any = false;
    for (let j = m > 1 ? 1 : 0; j < m; j++) {
      const v = value(0, j);
      if (v === null || v === '') continue;
      any = true;
      if (!isWords(v)) names = false;
    }
    names = names && any;
  }
  const first = names ? 1 : 0;
  let labels = chart.labels;
  if (labels === undefined) {
    if (chart.kind === 'scatter' || chart.kind === 'bubble') labels = m > 1;
    else {
      // Words or dates down the first column are the labels; so is a first column under an empty corner, as in Excel.
      labels = false;
      for (let i = first; i < Math.min(n, first + 200) && !labels; i++) {
        const p = at(i, 0);
        if (isWords(value(i, 0)) || isDateFmt(sh.cells[`${colName(p.c)}${p.r + 1}`]?.s?.fmt)) labels = true;
      }
      if (!labels && m > 1 && names && (value(0, 0) === null || value(0, 0) === '')) labels = true;
    }
  }
  const skip = labels && m > 1 ? 1 : 0;
  const count = Math.max(0, Math.min(n - first, 2000));
  const out: ChartData = { si: ds, labels: [], series: [] };
  for (let i = 0; i < count; i++) out.labels.push(skip ? shown(first + i, 0) : String(i + 1));
  if (skip) {
    const a = at(first, 0);
    const b = at(n - 1, 0);
    out.labelRef = { r1: a.r, c1: a.c, r2: b.r, c2: b.c };
  }
  for (let j = skip; j < Math.min(m, skip + 50); j++) {
    const values: (number | null)[] = [];
    for (let i = 0; i < count; i++) {
      const v = value(first + i, j);
      values.push(typeof v === 'number' ? v : null);
    }
    // A column of words among the numbers is no series.
    if (m - skip > 1 && values.every((v) => v === null)) continue;
    const a = at(first, j);
    const b = at(n - 1, j);
    const head = at(0, j);
    out.series.push({ name: names ? shown(0, j) || (rows ? String(head.r + 1) : colName(head.c)) : rows ? String(head.r + 1) : colName(head.c), values, ref: { r1: a.r, c1: a.c, r2: b.r, c2: b.c }, ...(names ? { nameAt: head } : {}) });
  }
  return out;
}

// ---- drawing ----------------------------------------------------------------------------------------------------

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const r1 = (v: number) => Math.round(v * 10) / 10;

/** A step for an axis: 1, 2, 2.5 or 5 times a power of ten, giving about `n` steps over the span. */
function niceStep(span: number, n: number): number {
  if (!(span > 0)) return 1;
  const raw = span / n;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

/** A number short enough for an axis: 1.2k, 3.5M. */
function short(v: number): string {
  const a = Math.abs(v);
  const k = (x: number) => String(Math.round(x * 100) / 100);
  return a >= 1e9 ? `${k(v / 1e9)}B` : a >= 1e6 ? `${k(v / 1e6)}M` : a >= 1e4 ? `${k(v / 1e3)}k` : k(v);
}

/** Ticks from below the lowest value to above the highest, always taking in zero. */
function ticksOf(lo: number, hi: number, n: number): number[] {
  if (lo === hi) [lo, hi] = lo === 0 ? [0, 1] : lo > 0 ? [0, hi] : [lo, 0];
  const step = niceStep(hi - lo, n);
  const a = Math.floor(lo / step) * step;
  const b = Math.ceil(hi / step) * step;
  const out: number[] = [];
  for (let v = a; v <= b + step / 2 && out.length < 30; v += step) out.push(Math.round(v / step) * step);
  return out;
}

/** About how wide words are in px at a type size. */
const wordsW = (s: string, size: number) => s.length * size * 0.56;
/** Words cut to fit a width. */
const fit = (s: string, w: number, size: number) => (wordsW(s, size) <= w ? s : `${s.slice(0, Math.max(1, Math.floor(w / (size * 0.56)) - 1))}…`);

/**
 * A chart drawn as SVG, `w` × `h` px. Its words and lines are in currentColor (lines faint); series in the chart's
 * colours, else CHART_COLORS. `problem`: why it cannot draw from its range, said in its place; `say` puts the chart's
 * own words (not its title or labels) in the language the page is read in.
 */
export function chartSvg(
  chart: SheetChart,
  data: ChartData | null,
  w: number,
  h: number,
  font = 'system-ui, -apple-system, "Segoe UI", sans-serif',
  o: { problem?: string | null; say?: (s: string) => string } = {},
): string {
  const say = o.say ?? ((x: string) => x);
  const parts: string[] = [];
  const text = (x: number, y: number, s: string, o: { size?: number; anchor?: 'start' | 'middle' | 'end'; weight?: number; rotate?: boolean; opacity?: number; fill?: string } = {}) =>
    parts.push(
      `<text x="${r1(x)}" y="${r1(y)}" font-size="${o.size ?? 11}" text-anchor="${o.anchor ?? 'middle'}" dominant-baseline="middle"${o.weight ? ` font-weight="${o.weight}"` : ''}${o.opacity !== undefined ? ` fill-opacity="${o.opacity}"` : ''}${o.fill ? ` fill="${o.fill}"` : ''}${o.rotate ? ` transform="rotate(-90 ${r1(x)} ${r1(y)})"` : ''}>${esc(s)}</text>`,
    );
  const colorOf = (i: number) => chart.colors?.[i] ?? CHART_COLORS[i % CHART_COLORS.length];
  const pad = 12;
  let top = pad;
  let bottom = h - pad;
  let left = pad;
  let right = w - pad;
  if (chart.title) {
    text(w / 2, top + 9, fit(chart.title, w - pad * 2, 15), { size: 15, weight: 600 });
    top += 26;
  }
  const pie = chart.kind === 'pie' || chart.kind === 'doughnut';
  let series = (data?.series ?? []).slice(0, pie ? 1 : 50);
  let labels = data?.labels ?? [];
  // A histogram: the first series' numbers counted in bins of equal width.
  if (chart.kind === 'histogram' && series.length) {
    const h = histogramOf(series[0].values, chart.bins);
    labels = h.labels;
    series = [{ ...series[0], values: h.counts }];
  }
  if (o.problem) {
    // Why it cannot draw, in lines that fit.
    const lines: string[] = [];
    let line = '';
    for (const word of say(o.problem).split(/\s+/)) {
      if (line && wordsW(`${line} ${word}`, 12) > w - pad * 4) {
        lines.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    if (line) lines.push(line);
    const shownLines = lines.slice(0, Math.max(1, Math.floor((bottom - top) / 17)));
    shownLines.forEach((l, i) => text(w / 2, (top + bottom) / 2 + (i - (shownLines.length - 1) / 2) * 17, l, { size: 12, opacity: 0.75 }));
    return wrap(parts, w, h, font);
  }
  if (!data || !series.length || !labels.length || !series.some((x) => x.values.some((v) => v !== null))) {
    text(w / 2, (top + bottom) / 2, say('No numbers to draw'), { size: 12, opacity: 0.6 });
    return wrap(parts, w, h, font);
  }
  // The legend: the series' names (a pie's: its labels), under, over or beside the chart.
  // A bubble chart's series come in pairs (heights, then sizes): the legend has the first of each.
  const bubble = chart.kind === 'bubble';
  const shownSeries = bubble ? series.filter((_, i) => i % 2 === 0) : series;
  const items = pie ? labels.map((l, i) => ({ name: l, color: colorOf(i) })) : shownSeries.map((s, i) => ({ name: s.name, color: colorOf(i) }));
  const legend = chart.legend ?? (pie || shownSeries.length > 1 ? 'bottom' : 'none');
  if (legend !== 'none' && items.length) {
    const size = 11;
    if (legend === 'right') {
      const lw = Math.min(w * 0.35, Math.max(...items.map((it) => wordsW(it.name, size))) + 26);
      const shownItems = items.slice(0, Math.max(1, Math.floor((bottom - top) / 18)));
      const y0 = (top + bottom) / 2 - (shownItems.length * 18) / 2;
      shownItems.forEach((it, i) => {
        const y = y0 + i * 18 + 9;
        parts.push(`<rect x="${r1(right - lw + 4)}" y="${r1(y - 5)}" width="10" height="10" rx="2" fill="${it.color}"/>`);
        text(right - lw + 20, y, fit(it.name, lw - 24, size), { size, anchor: 'start' });
      });
      right -= lw + 6;
    } else {
      // Rows of swatches, centred, as many as fit.
      const rows: { name: string; color: string; w: number }[][] = [[]];
      let rowW = 0;
      for (const it of items) {
        const iw = Math.min(160, wordsW(it.name, size)) + 26;
        if (rowW + iw > w - pad * 2 && rows[rows.length - 1].length) {
          if (rows.length >= 3) break;
          rows.push([]);
          rowW = 0;
        }
        rows[rows.length - 1].push({ ...it, w: iw });
        rowW += iw;
      }
      const lh = 18;
      const y0 = legend === 'top' ? top : bottom - rows.length * lh;
      rows.forEach((row, ri) => {
        let x = (w - row.reduce((a, b) => a + b.w, 0)) / 2;
        const y = y0 + ri * lh + lh / 2;
        for (const it of row) {
          parts.push(`<rect x="${r1(x)}" y="${r1(y - 5)}" width="10" height="10" rx="2" fill="${it.color}"/>`);
          text(x + 15, y, fit(it.name, it.w - 24, size), { size, anchor: 'start' });
          x += it.w;
        }
      });
      if (legend === 'top') top += rows.length * lh + 4;
      else bottom -= rows.length * lh + 4;
    }
  }

  if (pie) {
    const vals = (series[0]?.values ?? []).map((v) => (v !== null && v > 0 ? v : 0));
    const sum = vals.reduce((a, b) => a + b, 0);
    const r = Math.max(8, Math.min(right - left, bottom - top) / 2 - 2);
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    const hole = chart.kind === 'doughnut' ? r * 0.55 : 0;
    if (!sum) {
      text(cx, cy, say('No numbers to draw'), { size: 12, opacity: 0.6 });
      return wrap(parts, w, h, font);
    }
    let a0 = -Math.PI / 2;
    vals.forEach((v, i) => {
      if (!v) return;
      const a1 = a0 + (v / sum) * Math.PI * 2;
      const big = a1 - a0 > Math.PI ? 1 : 0;
      const p = (a: number, rr: number) => `${r1(cx + rr * Math.cos(a))},${r1(cy + rr * Math.sin(a))}`;
      const d =
        v >= sum - 1e-12
          ? `M${r1(cx - r)},${r1(cy)}A${r1(r)},${r1(r)} 0 1 1 ${r1(cx + r)},${r1(cy)}A${r1(r)},${r1(r)} 0 1 1 ${r1(cx - r)},${r1(cy)}${hole ? `M${r1(cx - hole)},${r1(cy)}A${r1(hole)},${r1(hole)} 0 1 0 ${r1(cx + hole)},${r1(cy)}A${r1(hole)},${r1(hole)} 0 1 0 ${r1(cx - hole)},${r1(cy)}` : ''}Z`
          : hole
            ? `M${p(a0, r)}A${r1(r)},${r1(r)} 0 ${big} 1 ${p(a1, r)}L${p(a1, hole)}A${r1(hole)},${r1(hole)} 0 ${big} 0 ${p(a0, hole)}Z`
            : `M${r1(cx)},${r1(cy)}L${p(a0, r)}A${r1(r)},${r1(r)} 0 ${big} 1 ${p(a1, r)}Z`;
      parts.push(`<path d="${d}" fill="${colorOf(i)}" fill-rule="evenodd" stroke="#fff" stroke-opacity="0.6" stroke-width="1"/>`);
      const share = v / sum;
      if (share >= 0.05) {
        const mid = (a0 + a1) / 2;
        const rr = hole ? (r + hole) / 2 : r * 0.64;
        text(cx + rr * Math.cos(mid), cy + rr * Math.sin(mid), `${Math.round(share * 100)}%`, { size: 11, weight: 600, fill: '#ffffff' });
      }
      a0 = a1;
    });
    return wrap(parts, w, h, font);
  }

  const size = 11;
  if (chart.kind === 'radar') {
    // Each label a spoke round the middle, each series a shape through its values.
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2 + 4;
    const r = Math.max(10, Math.min(right - left, bottom - top) / 2 - 22);
    const all = series.flatMap((x) => x.values).filter((v): v is number => v !== null);
    const hi = chart.max ?? Math.max(...all, 0);
    const lo = chart.min ?? Math.min(0, ...all);
    const ticks = ticksOf(lo, hi, 4).filter((t) => t >= lo && t <= Math.max(hi, lo + 1e-9));
    const top2 = ticks[ticks.length - 1] || 1;
    const n = labels.length;
    const at = (i: number, v: number) => {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      const k = (v - lo) / (top2 - lo || 1);
      return [cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k] as const;
    };
    for (const t of ticks) {
      const ring = labels.map((_, i) => at(i, t));
      parts.push(`<path d="${ring.map((p, i) => `${i ? 'L' : 'M'}${r1(p[0])},${r1(p[1])}`).join('')}Z" fill="none" stroke="currentColor" stroke-opacity="0.15"/>`);
      text(cx + 3, at(0, t)[1], short(t), { size: 9, anchor: 'start', opacity: 0.6 });
    }
    labels.forEach((l, i) => {
      const end2 = at(i, top2);
      parts.push(`<line x1="${r1(cx)}" y1="${r1(cy)}" x2="${r1(end2[0])}" y2="${r1(end2[1])}" stroke="currentColor" stroke-opacity="0.15"/>`);
      const lp = at(i, top2 + (top2 - lo) * 0.14);
      text(lp[0], lp[1], fit(l, 80, size), { size, opacity: 0.8 });
    });
    series.forEach((x, si) => {
      const pts = x.values.map((v, i) => at(i, v ?? lo));
      const col = colorOf(si);
      parts.push(`<path d="${pts.map((p, i) => `${i ? 'L' : 'M'}${r1(p[0])},${r1(p[1])}`).join('')}Z" fill="${col}" fill-opacity="0.18" stroke="${col}" stroke-width="2"/>`);
      pts.forEach((p, i) => x.values[i] !== null && parts.push(`<circle cx="${r1(p[0])}" cy="${r1(p[1])}" r="2.6" fill="${col}"/>`));
      if (chart.values) pts.forEach((p, i) => x.values[i] !== null && text(p[0], p[1] - 9, short(x.values[i]!), { size: 10, weight: 600, fill: col }));
    });
    return wrap(parts, w, h, font);
  }
  const scatter = chart.kind === 'scatter' || bubble;
  const horiz = chart.kind === 'bar';
  // Each series' way: columns or a line (combo), the axis it is on.
  const typeOf = (i: number) => seriesType(chart, i);
  const axisOf = (i: number) => seriesAxis(chart, i);
  const percent = !!chart.percent && !scatter;
  const stacked = (!!chart.stacked || percent) && !scatter;
  const count = labels.length;
  // 100% stacked: each label's values as shares of its total.
  const vals = series.map((x, si) =>
    x.values.map((v, i) => {
      if (!percent || v === null || typeOf(si) === 'line') return v;
      const tot = series.reduce((a, y, sj) => a + (typeOf(sj) !== 'line' && axisOf(sj) === axisOf(si) ? Math.abs(y.values[i] ?? 0) : 0), 0);
      return tot ? (v / tot) * 100 : 0;
    }),
  );
  // Each axis' range: its series' values, or their sums where they stack.
  const rangeOf = (axis: number) => {
    let lo = Infinity;
    let hi = -Infinity;
    const on = series.map((_, i) => i).filter((i) => axisOf(i) === axis && (!bubble || i % 2 === 0));
    for (let i = 0; i < count; i++) {
      let pos = 0;
      let neg = 0;
      for (const si of on) {
        const v = vals[si][i];
        if (v === null) continue;
        if (stacked && typeOf(si) !== 'line') {
          if (v >= 0) pos += v;
          else neg += v;
          hi = Math.max(hi, pos);
          lo = Math.min(lo, neg);
        } else {
          hi = Math.max(hi, v);
          lo = Math.min(lo, v);
        }
      }
    }
    if (!Number.isFinite(lo)) [lo, hi] = [0, 1];
    if (!scatter || lo > 0) lo = Math.min(lo, 0);
    if (hi < 0) hi = 0;
    return [lo, hi] as const;
  };
  const plotH = bottom - top;
  const tickCount = Math.max(2, Math.min(8, Math.floor((horiz ? right - left : plotH) / 48)));
  const [lo1, hi1] = rangeOf(1);
  let vt = ticksOf(chart.min ?? lo1, chart.max ?? hi1, tickCount);
  if (percent) vt = [0, 25, 50, 75, 100];
  if (chart.min !== undefined || chart.max !== undefined) vt = vt.filter((t) => (chart.min === undefined || t >= chart.min - 1e-9) && (chart.max === undefined || t <= chart.max + 1e-9));
  const vlo = chart.min ?? vt[0];
  const vhi = chart.max ?? vt[vt.length - 1];
  const two = series.some((_, i) => axisOf(i) === 2);
  const vt2 = two ? ticksOf(...rangeOf(2), tickCount) : [];
  const v2lo = vt2[0] ?? 0;
  const v2hi = vt2[vt2.length - 1] ?? 1;
  // Scatter and bubbles: X values from the labels (numbers), else 1, 2, 3…
  const xs = scatter ? labels.map((l, i) => (Number.isFinite(Number(l.replace(/,/g, ''))) && l.trim() !== '' ? Number(l.replace(/,/g, '')) : i + 1)) : [];
  const xt = scatter ? ticksOf(Math.min(...xs), Math.max(...xs), Math.max(2, Math.min(8, Math.floor((right - left) / 70)))) : [];
  const fmtV = (v: number) => (percent ? `${short(v)}%` : short(v));
  const valW = Math.max(...vt.map((v) => wordsW(fmtV(v), size))) + 8;
  const valW2 = two ? Math.max(...vt2.map((v) => wordsW(short(v), size))) + 8 : 0;
  const catW = horiz ? Math.min((right - left) * 0.35, Math.max(...labels.map((l) => wordsW(l, size)), 10) + 8) : 0;
  if (chart.yTitle) {
    text(left + 7, (top + bottom) / 2, fit(chart.yTitle, bottom - top, 12), { size: 12, rotate: true, opacity: 0.85 });
    left += 18;
  }
  if (chart.xTitle) {
    text((left + right) / 2, bottom - 7, fit(chart.xTitle, right - left, 12), { size: 12, opacity: 0.85 });
    bottom -= 18;
  }
  const pl = left + (horiz ? catW : valW);
  const pr = right - 4 - valW2;
  const pt = top + 6 + (chart.values ? 8 : 0);
  const pb = bottom - (horiz ? 18 : 20);
  const clampV = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const vpos = (v: number) => (horiz ? pl + ((clampV(v, vlo, vhi) - vlo) / (vhi - vlo || 1)) * (pr - pl) : pb - ((clampV(v, vlo, vhi) - vlo) / (vhi - vlo || 1)) * (pb - pt));
  const vpos2 = (v: number) => pb - ((v - v2lo) / (v2hi - v2lo || 1)) * (pb - pt);
  const posOf = (si: number) => (axisOf(si) === 2 ? vpos2 : vpos);
  const xpos = (v: number) => pl + ((v - xt[0]) / (xt[xt.length - 1] - xt[0] || 1)) * (pr - pl);
  // Grid lines and the value axes' numbers.
  for (const v of vt) {
    const p = vpos(v);
    const strong = v === 0 ? 0.45 : 0.14;
    if (horiz) {
      parts.push(`<line x1="${r1(p)}" x2="${r1(p)}" y1="${r1(pt)}" y2="${r1(pb)}" stroke="currentColor" stroke-opacity="${strong}"/>`);
      text(p, pb + 10, fmtV(v), { size, opacity: 0.7 });
    } else {
      parts.push(`<line x1="${r1(pl)}" x2="${r1(pr)}" y1="${r1(p)}" y2="${r1(p)}" stroke="currentColor" stroke-opacity="${strong}"/>`);
      text(pl - 6, p, fmtV(v), { size, anchor: 'end', opacity: 0.7 });
    }
  }
  for (const v of vt2) text(pr + 6, vpos2(v), short(v), { size, anchor: 'start', opacity: 0.7 });
  const label = (x: number, y: number, v: number | null, col: string) => chart.values && v !== null && text(x, y, fmtV(v), { size: 10, weight: 600, fill: col });
  /** A trendline through a series' points (x from its places, or its X values): the line, or the curve, that fits them best. */
  const trend = (si: number, xOf: (i: number) => number, xPx: (x: number) => number, yPx: (v: number) => number) => {
    const kind = chart.series?.[si]?.trend;
    if (!kind) return;
    const pts = vals[si].flatMap((v, i) => (v === null || (kind === 'exp' && v <= 0) ? [] : [[xOf(i), kind === 'exp' ? Math.log(v) : v] as const]));
    if (pts.length < 2) return;
    const n = pts.length;
    const mx = pts.reduce((a, p) => a + p[0], 0) / n;
    const my = pts.reduce((a, p) => a + p[1], 0) / n;
    const sxx = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
    if (!sxx) return;
    const slope = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / sxx;
    const at = (x: number) => (kind === 'exp' ? Math.exp(my + slope * (x - mx)) : my + slope * (x - mx));
    const x0 = Math.min(...pts.map((p) => p[0]));
    const x1 = Math.max(...pts.map((p) => p[0]));
    const steps = kind === 'exp' ? 24 : 1;
    const d = Array.from({ length: steps + 1 }, (_, k) => {
      const x = x0 + ((x1 - x0) * k) / steps;
      return `${k ? 'L' : 'M'}${r1(xPx(x))},${r1(yPx(at(x)))}`;
    }).join('');
    parts.push(`<path d="${d}" fill="none" stroke="${colorOf(si)}" stroke-width="1.6" stroke-dasharray="5 4" stroke-opacity="0.9"/>`);
  };
  if (scatter) {
    for (const v of xt) {
      const p = xpos(v);
      parts.push(`<line x1="${r1(p)}" x2="${r1(p)}" y1="${r1(pt)}" y2="${r1(pb)}" stroke="currentColor" stroke-opacity="0.08"/>`);
      text(p, pb + 11, short(v), { size, opacity: 0.7 });
    }
    // Bubbles: each pair of series a height and a size (areas in step with the sizes).
    const sizes = bubble ? series.filter((_, i) => i % 2 === 1).flatMap((x) => x.values).filter((v): v is number => v !== null && v > 0) : [];
    const most = Math.max(1, ...sizes);
    const maxR = Math.max(6, Math.min(pr - pl, pb - pt) / 9);
    series.forEach((x, si) => {
      if (bubble && si % 2) return;
      const col = colorOf(bubble ? si / 2 : si);
      vals[si].forEach((v, i) => {
        if (v === null) return;
        const cxp = xpos(xs[i]);
        const cyp = vpos(v);
        if (bubble) {
          const z = series[si + 1]?.values[i] ?? 0;
          const rr = z > 0 ? Math.max(2, maxR * Math.sqrt(z / most)) : 2;
          parts.push(`<circle cx="${r1(cxp)}" cy="${r1(cyp)}" r="${r1(rr)}" fill="${col}" fill-opacity="0.55" stroke="${col}"/>`);
          label(cxp, cyp, z || null, '#ffffff');
        } else {
          parts.push(`<circle cx="${r1(cxp)}" cy="${r1(cyp)}" r="3.5" fill="${col}"/>`);
          label(cxp, cyp - 9, v, col);
        }
      });
      if (!bubble)
        trend(
          si,
          (i) => xs[i],
          xpos,
          (v) => vpos(v),
        );
    });
    return wrap(parts, w, h, font);
  }
  // The categories' labels, as many as have room.
  const band = (horiz ? pb - pt : pr - pl) / Math.max(1, count);
  const every = horiz ? Math.max(1, Math.ceil(14 / band)) : Math.max(1, Math.ceil((Math.max(...labels.map((l) => Math.min(wordsW(l, size), 90))) + 8) / band));
  labels.forEach((l, i) => {
    if (i % every) return;
    const mid = (horiz ? pt : pl) + band * (i + 0.5);
    if (horiz) text(pl - 6, mid, fit(l, catW - 8, size), { size, anchor: 'end', opacity: 0.8 });
    else text(mid, pb + 11, fit(l, Math.max(band * every - 4, 20), size), { size, opacity: 0.8 });
  });
  // Columns or bars first: side by side in each band (one place per series of columns), or stacked; a histogram's touch.
  const colSeries = series.map((_, i) => i).filter((i) => typeOf(i) === 'column');
  const gap = chart.kind === 'histogram' ? 0.98 : 0.72;
  const inner = band * gap;
  const slots = stacked ? 1 : Math.max(1, colSeries.length);
  const each = inner / slots;
  const pos = [labels.map(() => 0), labels.map(() => 0)];
  const neg = [labels.map(() => 0), labels.map(() => 0)];
  colSeries.forEach((si, k) => {
    const ax = axisOf(si) - 1;
    const vp = posOf(si);
    labels.forEach((_, i) => {
      const v = vals[si][i];
      if (v === null) return;
      let from = 0;
      let to = v;
      if (stacked) {
        from = v >= 0 ? pos[ax][i] : neg[ax][i];
        to = from + v;
        if (v >= 0) pos[ax][i] = to;
        else neg[ax][i] = to;
      }
      const a = vp(from);
      const b = vp(to);
      const off = (horiz ? pt : pl) + band * i + (band - inner) / 2 + (stacked ? 0 : each * k);
      const thick = Math.max(1, each - (stacked || slots === 1 || chart.kind === 'histogram' ? 0 : 1.5));
      const rx = chart.kind === 'histogram' ? 0 : Math.min(3, thick / 5);
      parts.push(
        horiz
          ? `<rect x="${r1(Math.min(a, b))}" y="${r1(off)}" width="${r1(Math.max(0.5, Math.abs(b - a)))}" height="${r1(thick)}" rx="${r1(rx)}" fill="${colorOf(si)}"/>`
          : `<rect x="${r1(off)}" y="${r1(Math.min(a, b))}" width="${r1(thick)}" height="${r1(Math.max(0.5, Math.abs(b - a)))}" rx="${r1(rx)}" fill="${colorOf(si)}"${chart.kind === 'histogram' ? ' stroke="#ffffff" stroke-opacity="0.5"' : ''}/>`,
      );
      if (chart.values) {
        if (horiz) text(Math.max(a, b) + 4, off + thick / 2, fmtV(vals[si][i]!), { size: 10, anchor: 'start', weight: 600, opacity: 0.85 });
        else if (stacked) text(off + thick / 2, (a + b) / 2, fmtV(vals[si][i]!), { size: 10, weight: 600, fill: '#ffffff' });
        else text(off + thick / 2, Math.min(a, b) - 7, fmtV(vals[si][i]!), { size: 10, weight: 600, opacity: 0.85 });
      }
    });
    trend(
      si,
      (i) => i,
      (x) => (horiz ? 0 : pl + band * (x + 0.5)),
      vp,
    );
  });
  // Then lines and areas over them.
  const base = [labels.map(() => 0), labels.map(() => 0)];
  series.forEach((x, si) => {
    const type = typeOf(si);
    if (type === 'column') return;
    const ax = axisOf(si) - 1;
    const vp = posOf(si);
    const stackHere = stacked && type === 'area';
    const pts = labels.map((_, i) => {
      const v = vals[si][i];
      if (v === null && !stackHere) return null;
      const y = (v ?? 0) + (stackHere ? base[ax][i] : 0);
      return [pl + band * (i + 0.5), vp(y)] as const;
    });
    const col = colorOf(si);
    let d = '';
    let pen = false;
    for (const p of pts) {
      if (!p) {
        pen = false;
        continue;
      }
      d += `${pen ? 'L' : 'M'}${r1(p[0])},${r1(p[1])}`;
      pen = true;
    }
    if (type === 'area') {
      const known = pts.filter((p): p is readonly [number, number] => !!p);
      if (known.length) {
        const floor = stackHere ? labels.map((_, i) => [pl + band * (i + 0.5), vp(base[ax][i])] as const).reverse() : [[known[known.length - 1][0], vp(Math.max(ax ? v2lo : vlo, 0))] as const, [known[0][0], vp(Math.max(ax ? v2lo : vlo, 0))] as const];
        const top2 = known.map((p, i) => `${i ? 'L' : 'M'}${r1(p[0])},${r1(p[1])}`).join('');
        parts.push(`<path d="${top2}${floor.map((p) => `L${r1(p[0])},${r1(p[1])}`).join('')}Z" fill="${col}" fill-opacity="${stackHere ? 0.8 : 0.3}"/>`);
      }
    }
    if (d) parts.push(`<path d="${d}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`);
    if (type === 'line' && count <= 60) for (const p of pts) if (p) parts.push(`<circle cx="${r1(p[0])}" cy="${r1(p[1])}" r="3" fill="${col}"/>`);
    pts.forEach((p, i) => p && label(p[0], p[1] - 9, vals[si][i], col));
    if (stackHere) labels.forEach((_, i) => (base[ax][i] += vals[si][i] ?? 0));
    trend(
      si,
      (i) => i,
      (xx) => pl + band * (xx + 0.5),
      vp,
    );
    void x;
  });
  return wrap(parts, w, h, font);
}

/** A histogram's bins: equal ranges from the lowest number to the highest (about √n of them, or as many as asked), with how many fall in each. */
export function histogramOf(values: (number | null)[], bins?: number): { labels: string[]; counts: number[]; edges: number[] } {
  const xs = values.filter((v): v is number => v !== null);
  if (!xs.length) return { labels: [], counts: [], edges: [] };
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  const n = Math.max(1, Math.min(100, bins ?? Math.ceil(Math.sqrt(xs.length))));
  let step = (hi - lo) / n || 1;
  // Round edges where the numbers allow.
  const nice = niceStep(hi - lo || 1, n);
  if (nice && Math.ceil((hi - Math.floor(lo / nice) * nice) / nice) <= n + 1 && !bins) step = nice;
  const start = bins ? lo : Math.floor(lo / step) * step;
  const k = Math.max(1, Math.ceil((hi - start) / step - 1e-9));
  const counts = new Array(k).fill(0);
  for (const x of xs) counts[Math.min(k - 1, Math.floor((x - start) / step + 1e-9))]++;
  const edges = Array.from({ length: k + 1 }, (_, i) => start + i * step);
  const labels = counts.map((_, i) => `${short(edges[i])}–${short(edges[i + 1])}`);
  return { labels, counts, edges };
}

const wrap = (parts: string[], w: number, h: number, font: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.round(w)} ${Math.round(h)}" width="${Math.round(w)}" height="${Math.round(h)}" font-family="${esc(font)}" fill="currentColor" style="display:block;overflow:visible">${parts.join('')}</svg>`;
