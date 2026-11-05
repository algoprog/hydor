// A chart of a sheet's cells, as the editor, the workbook's page and its PDF draw it: the series and labels read from
// its range as the cells are now (chartData, which the Excel export writes too), and the chart drawn as SVG
// (chartSvg): columns, bars, lines, areas, pies, doughnuts and scatter plots, with a title, a legend, axis titles and
// round numbers on the axes. The SVG is text made here from checked values, every word escaped; its words and lines
// take the colour of what holds it (currentColor), so it reads in a dark theme and a light one alike.
import { colName, formatValue, isDateFmt, sourceOf, type Calc, type Rect, type SheetChart, type Workbook } from './sheets.ts';
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

/** Colours for series without their own, as spreadsheets give them. */
export const CHART_COLORS = ['#4285f4', '#ea4335', '#fbbc04', '#34a853', '#ff6d01', '#46bdc6', '#7baaf7', '#f07b72', '#fcd04f', '#71c287', '#ff994d', '#7ed1d7'];

/**
 * A chart's series and labels from its range: series down the columns (or along the rows), the first column (or row)
 * as labels and the first row (or column) as the series' names when the chart says so, or when they hold words. Rows
 * and columns hidden are left out, unless `withHidden` (an Excel file's series are whole ranges: Excel leaves them out itself).
 */
export function chartData(book: Workbook, calc: Calc, si: number, chart: SheetChart, withHidden = false): ChartData | null {
  const src = sourceOf(chart.range);
  if (!src) return null;
  const ds = src.sheet === undefined ? si : calc.sheetIndex(src.sheet);
  if (ds < 0 || !book.sheets[ds]) return null;
  const sh = book.sheets[ds];
  const e = calc.extent(ds);
  const x: Rect = { r1: src.x.r1, c1: src.x.c1, r2: Math.min(src.x.r2, Math.max(src.x.r1, e.rows - 1)), c2: Math.min(src.x.c2, Math.max(src.x.c1, e.cols - 1)) };
  const rows = chart.by === 'rows';
  // Rows and columns hidden (by hand or by the filter) are left out, as spreadsheets leave them out of charts.
  const hidR = withHidden ? new Set<number>() : hiddenRows(sh, ds, calc);
  const hidC = withHidden ? new Set<number>() : hiddenCols(sh);
  const rIdx: number[] = [];
  for (let r = x.r1; r <= x.r2 && rIdx.length < 5000; r++) if (!hidR.has(r)) rIdx.push(r);
  const cIdx: number[] = [];
  for (let c = x.c1; c <= x.c2; c++) if (!hidC.has(c)) cIdx.push(c);
  if (!rIdx.length || !cIdx.length) return null;
  // Along: where a series runs (rows, for series in columns); across: one series after another.
  const n = rows ? cIdx.length : rIdx.length;
  const m = rows ? rIdx.length : cIdx.length;
  const at = (i: number, j: number) => (rows ? { r: rIdx[j], c: cIdx[i] } : { r: rIdx[i], c: cIdx[j] });
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
    if (chart.kind === 'scatter') labels = m > 1;
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
 * colours, else CHART_COLORS.
 */
export function chartSvg(chart: SheetChart, data: ChartData | null, w: number, h: number, font = 'system-ui, -apple-system, "Segoe UI", sans-serif'): string {
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
  const series = (data?.series ?? []).slice(0, pie ? 1 : 50);
  const labels = data?.labels ?? [];
  if (!data || !series.length || !labels.length) {
    text(w / 2, (top + bottom) / 2, 'No numbers to draw', { size: 12, opacity: 0.6 });
    return wrap(parts, w, h, font);
  }
  // The legend: the series' names (a pie's: its labels), under, over or beside the chart.
  const items = pie ? labels.map((l, i) => ({ name: l, color: colorOf(i) })) : series.map((s, i) => ({ name: s.name, color: colorOf(i) }));
  const legend = chart.legend ?? (pie || series.length > 1 ? 'bottom' : 'none');
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
      text(cx, cy, 'No numbers to draw', { size: 12, opacity: 0.6 });
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

  const scatter = chart.kind === 'scatter';
  const horiz = chart.kind === 'bar';
  const stacked = !!chart.stacked && !scatter && chart.kind !== 'line';
  const count = labels.length;
  // The values' range: each series', or their sums when stacked.
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < count; i++) {
    if (stacked) {
      let pos = 0;
      let neg = 0;
      for (const s of series) {
        const v = s.values[i] ?? 0;
        if (v >= 0) pos += v;
        else neg += v;
      }
      hi = Math.max(hi, pos);
      lo = Math.min(lo, neg);
    } else
      for (const s of series) {
        const v = s.values[i];
        if (v === null) continue;
        hi = Math.max(hi, v);
        lo = Math.min(lo, v);
      }
  }
  if (!Number.isFinite(lo)) [lo, hi] = [0, 1];
  if (!scatter || lo > 0) lo = Math.min(lo, 0);
  if (hi < 0) hi = 0;
  const plotH = bottom - top;
  const vt = ticksOf(lo, hi, Math.max(2, Math.min(8, Math.floor((horiz ? right - left : plotH) / 48))));
  const vlo = vt[0];
  const vhi = vt[vt.length - 1];
  // Scatter: X values from the labels (numbers), else 1, 2, 3…
  const xs = scatter ? labels.map((l, i) => (Number.isFinite(Number(l.replace(/,/g, ''))) && l.trim() !== '' ? Number(l.replace(/,/g, '')) : i + 1)) : [];
  const xt = scatter ? ticksOf(Math.min(...xs), Math.max(...xs), Math.max(2, Math.min(8, Math.floor((right - left) / 70)))) : [];
  const size = 11;
  const valW = Math.max(...vt.map((v) => wordsW(short(v), size))) + 8;
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
  const pr = right - 4;
  const pt = top + 6;
  const pb = bottom - (horiz ? 18 : 20);
  const vpos = (v: number) => (horiz ? pl + ((v - vlo) / (vhi - vlo || 1)) * (pr - pl) : pb - ((v - vlo) / (vhi - vlo || 1)) * (pb - pt));
  const xpos = (v: number) => pl + ((v - xt[0]) / (xt[xt.length - 1] - xt[0] || 1)) * (pr - pl);
  // Grid lines and the value axis' numbers.
  for (const v of vt) {
    const p = vpos(v);
    const strong = v === 0 ? 0.45 : 0.14;
    if (horiz) {
      parts.push(`<line x1="${r1(p)}" x2="${r1(p)}" y1="${r1(pt)}" y2="${r1(pb)}" stroke="currentColor" stroke-opacity="${strong}"/>`);
      text(p, pb + 10, short(v), { size, opacity: 0.7 });
    } else {
      parts.push(`<line x1="${r1(pl)}" x2="${r1(pr)}" y1="${r1(p)}" y2="${r1(p)}" stroke="currentColor" stroke-opacity="${strong}"/>`);
      text(pl - 6, p, short(v), { size, anchor: 'end', opacity: 0.7 });
    }
  }
  if (scatter) {
    for (const v of xt) {
      const p = xpos(v);
      parts.push(`<line x1="${r1(p)}" x2="${r1(p)}" y1="${r1(pt)}" y2="${r1(pb)}" stroke="currentColor" stroke-opacity="0.08"/>`);
      text(p, pb + 11, short(v), { size, opacity: 0.7 });
    }
    series.forEach((s, si) => {
      s.values.forEach((v, i) => {
        if (v === null) return;
        parts.push(`<circle cx="${r1(xpos(xs[i]))}" cy="${r1(vpos(v))}" r="3.5" fill="${colorOf(si)}"/>`);
      });
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
  if (chart.kind === 'line' || chart.kind === 'area') {
    const base = labels.map(() => 0);
    series.forEach((s, si) => {
      const pts = labels.map((_, i) => {
        const v = s.values[i];
        if (v === null && !stacked) return null;
        const y = (v ?? 0) + (stacked ? base[i] : 0);
        return [pl + band * (i + 0.5), vpos(y)] as const;
      });
      const col = colorOf(si);
      // Lines break where a cell holds no number.
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
      if (chart.kind === 'area') {
        const known = pts.filter((p): p is readonly [number, number] => !!p);
        if (known.length) {
          const floor = stacked ? labels.map((_, i) => [pl + band * (i + 0.5), vpos(base[i])] as const).reverse() : [[known[known.length - 1][0], vpos(Math.max(vlo, 0))] as const, [known[0][0], vpos(Math.max(vlo, 0))] as const];
          const top2 = known.map((p, i) => `${i ? 'L' : 'M'}${r1(p[0])},${r1(p[1])}`).join('');
          parts.push(`<path d="${top2}${floor.map((p) => `L${r1(p[0])},${r1(p[1])}`).join('')}Z" fill="${col}" fill-opacity="${stacked ? 0.8 : 0.3}"/>`);
        }
      }
      if (d) parts.push(`<path d="${d}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`);
      if (chart.kind === 'line' && count <= 60) for (const p of pts) if (p) parts.push(`<circle cx="${r1(p[0])}" cy="${r1(p[1])}" r="3" fill="${col}"/>`);
      if (stacked) labels.forEach((_, i) => (base[i] += s.values[i] ?? 0));
    });
    return wrap(parts, w, h, font);
  }
  // Columns or bars: side by side in each band, or stacked.
  const inner = band * 0.72;
  const each = stacked ? inner : inner / Math.max(1, series.length);
  const pos = labels.map(() => 0);
  const neg = labels.map(() => 0);
  series.forEach((s, si) => {
    labels.forEach((_, i) => {
      const v = s.values[i];
      if (v === null) return;
      let from = 0;
      let to = v;
      if (stacked) {
        from = v >= 0 ? pos[i] : neg[i];
        to = from + v;
        if (v >= 0) pos[i] = to;
        else neg[i] = to;
      }
      const a = vpos(from);
      const b = vpos(to);
      const off = (horiz ? pt : pl) + band * i + (band - inner) / 2 + (stacked ? 0 : each * si);
      const thick = Math.max(1, each - (stacked || series.length === 1 ? 0 : 1.5));
      const rx = Math.min(3, thick / 5);
      parts.push(
        horiz
          ? `<rect x="${r1(Math.min(a, b))}" y="${r1(off)}" width="${r1(Math.max(0.5, Math.abs(b - a)))}" height="${r1(thick)}" rx="${r1(rx)}" fill="${colorOf(si)}"/>`
          : `<rect x="${r1(off)}" y="${r1(Math.min(a, b))}" width="${r1(thick)}" height="${r1(Math.max(0.5, Math.abs(b - a)))}" rx="${r1(rx)}" fill="${colorOf(si)}"/>`,
      );
    });
  });
  return wrap(parts, w, h, font);
}

const wrap = (parts: string[], w: number, h: number, font: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.round(w)} ${Math.round(h)}" width="${Math.round(w)}" height="${Math.round(h)}" font-family="${esc(font)}" fill="currentColor" style="display:block;overflow:visible">${parts.join('')}</svg>`;
