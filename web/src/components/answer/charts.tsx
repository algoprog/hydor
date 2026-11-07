// The charts answer UIs draw, in SVG, by the house's data-viz rules: the palette's eight hues in their fixed order
// (--viz-1 to --viz-8, never cycled), 2px lines, a 10% wash under an area, bars at most 24px thick with a 4px rounded data
// end and square at the baseline, a 2px gap in the panel's colour between touching bars and segments, hairline solid
// grids, a legend for two series or more, and a tooltip on hover where the value leads and the name follows (a crosshair
// that snaps to the nearest x on lines, the band under the pointer on bars, the nearest point on a scatter). Text never
// takes a series' colour: a swatch beside it does. One value axis only.
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { tr } from '../../i18n/runtime';
import { cx } from '../ui';
import { compact, fmtNum, seriesColor, str } from './kit';

/** An element's width, again whenever it changes (a chart, a chart-like layout). */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Round numbers for an axis: about `count` ticks covering lo..hi. */
export function niceTicks(lo: number, hi: number, count = 4): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (lo === hi) {
    const d = Math.abs(lo) || 1;
    lo -= d / 2;
    hi += d / 2;
  }
  const raw = (hi - lo) / Math.max(1, count);
  const exp = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / exp;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp;
  const out: number[] = [];
  for (let v = Math.floor(lo / step) * step; v <= hi + step * 0.5 && out.length < 12; v += step) out.push(Math.round(v / step) * step);
  if (out[out.length - 1] < hi) out.push(out[out.length - 1] + step);
  return out;
}

/** How an axis writes its numbers: whole under 10,000, short (12K) past it. */
const tickText = (v: number, top: number, unit = '', prefix = '') => `${prefix}${Math.abs(top) >= 10_000 ? compact(v) : fmtNum(v, { maximumFractionDigits: Math.abs(top) < 10 ? 2 : 0 })}${unit && unit.length <= 3 ? unit : ''}`;
/** A value as a tooltip writes it. */
export const valueText = (v: number | null | undefined, unit = '', prefix = '') => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${prefix}${fmtNum(v, { maximumFractionDigits: 2 })}${unit ? (/^[%°′″]/.test(unit) ? unit : ` ${unit}`) : ''}`);

/** A bar as a path, rounded at its data end (the top, or the bottom for a value below zero) and square at its baseline. */
function barPath(x: number, y: number, w: number, h: number, up: boolean, r = 4): string {
  if (h <= 0 || w <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  if (up)
    return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
  return `M${x},${y}V${y + h - rr}Q${x},${y + h} ${x + rr},${y + h}H${x + w - rr}Q${x + w},${y + h} ${x + w},${y + h - rr}V${y}Z`;
}
/** A horizontal bar, rounded at its right end. */
function hbarPath(x: number, y: number, w: number, h: number, r = 4): string {
  if (h <= 0 || w <= 0) return '';
  const rr = Math.min(r, h / 2, w);
  return `M${x},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}H${x}Z`;
}

/** The legend over a chart of two series or more: a swatch (a short line for lines, a square for fills) and each name. */
export function Legend({ names, line, className }: { names: string[]; line?: boolean; className?: string }) {
  if (names.length < 2) return null;
  return (
    <div className={cx('mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-fg-2', className)}>
      {names.map((n, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {line ? <span className="inline-block h-[2px] w-3.5 rounded-full" style={{ background: seriesColor(i) }} /> : <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: seriesColor(i) }} />}
          <span translate="no">{n}</span>
        </span>
      ))}
    </div>
  );
}

/** The tooltip: what it is about, then each value (strong) with its series' key and name. */
function Tip({ x, y, width, title, rows }: { x: number; y: number; width: number; title: string; rows: { color: string; name: string; value: string }[] }) {
  const left = Math.min(Math.max(8, x + 12), Math.max(8, width - 180));
  return (
    <div className="pointer-events-none absolute z-10 min-w-[120px] rounded-lg border border-line bg-elevated px-2.5 py-1.5 text-[12px] shadow-pop" style={{ left, top: Math.max(0, y) }}>
      {title && (
        <div className="mb-0.5 text-[11.5px] text-fg-3" translate="no">
          {title}
        </div>
      )}
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2 whitespace-nowrap">
          <span className="inline-block h-[2px] w-3 shrink-0 rounded-full" style={{ background: r.color }} />
          <span className="font-semibold text-fg tabular-nums">{r.value}</span>
          <span className="truncate text-fg-3" translate="no">
            {r.name}
          </span>
        </div>
      ))}
    </div>
  );
}

export type XYKind = 'line' | 'area' | 'bar' | 'stacked-bar' | 'hbar';

export interface XYSeries {
  name: string;
  values: (number | null)[];
}

/** Lines, areas, bars (side by side or stacked) and horizontal bars over shared labels along x. */
export function XYChart({
  kind,
  x,
  series,
  unit,
  prefix,
  min,
  marks,
  height = 240,
  yLabel,
  xLabel,
  className,
}: {
  kind: XYKind;
  x: string[];
  series: XYSeries[];
  unit?: string;
  prefix?: string;
  min?: number | null;
  marks?: { x: string; label: string }[];
  height?: number;
  yLabel?: string;
  xLabel?: string;
  className?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = Math.max(x.length, ...series.map((s) => s.values.length), 0);
  const labels = useMemo(() => Array.from({ length: n }, (_, i) => x[i] ?? String(i + 1)), [x, n]);
  const stacked = kind === 'stacked-bar';
  const bars = kind === 'bar' || stacked || kind === 'hbar';

  // The value range: bars from zero; lines from the data (or `min`).
  const [lo, hi] = useMemo(() => {
    let a = Infinity;
    let b = -Infinity;
    if (stacked)
      for (let i = 0; i < n; i++) {
        let pos = 0;
        let neg = 0;
        for (const s of series) {
          const v = s.values[i];
          if (typeof v === 'number' && Number.isFinite(v)) v >= 0 ? (pos += v) : (neg += v);
        }
        a = Math.min(a, neg);
        b = Math.max(b, pos);
      }
    else
      for (const s of series)
        for (const v of s.values)
          if (typeof v === 'number' && Number.isFinite(v)) {
            a = Math.min(a, v);
            b = Math.max(b, v);
          }
    if (!Number.isFinite(a)) return [0, 1];
    if (bars || kind === 'area') return [Math.min(0, typeof min === 'number' ? min : a), Math.max(0, b)];
    if (typeof min === 'number') return [Math.min(min, a), b];
    const pad = (b - a) * 0.08 || Math.abs(b) * 0.1 || 1;
    return [a >= 0 && a - pad < 0 ? 0 : a - pad, b + pad];
  }, [series, n, stacked, bars, kind, min]);
  const ticks = useMemo(() => niceTicks(lo, hi, kind === 'hbar' ? 4 : height < 200 ? 3 : 4), [lo, hi, kind, height]);
  const y0 = ticks[0];
  const y1 = ticks[ticks.length - 1];
  const top = ticks.reduce((m, t) => Math.max(m, Math.abs(t)), 0);

  if (!n || !series.length)
    return (
      <div ref={ref} className={cx('h-24', className)} />
    );

  // ---- horizontal bars: one row a label ----------------------------------------------------------------------------
  if (kind === 'hbar') {
    const rowH = series.length > 1 ? 14 * series.length + 12 : 30;
    const labelW = Math.min(Math.max(...labels.map((l) => l.length)) * 6.6 + 10, Math.max(80, width * 0.38));
    const valueW = 64;
    const plotW = Math.max(10, width - labelW - valueW);
    const H = rowH * n + 4;
    const sx = (v: number) => labelW + ((v - Math.min(0, y0)) / (y1 - Math.min(0, y0) || 1)) * plotW;
    const thick = series.length > 1 ? Math.min(12, (rowH - 10) / series.length - 2) : Math.min(18, rowH - 10);
    return (
      <div ref={ref} className={cx('relative', className)}>
        <Legend names={series.map((s) => s.name)} />
        {width > 0 && (
          <svg width={width} height={H} className="block overflow-visible" role="img" aria-label={series.map((s) => s.name).join(', ')}>
            {labels.map((l, i) => {
              const yRow = i * rowH;
              return (
                <g key={i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
                  <rect x={0} y={yRow} width={width} height={rowH} fill={hover === i ? 'var(--bg-2)' : 'transparent'} rx={6} />
                  <text x={labelW - 8} y={yRow + rowH / 2} dy="0.35em" textAnchor="end" className="fill-fg-2 text-[12px]">
                    {l.length > 40 ? `${l.slice(0, 39)}…` : l}
                  </text>
                  {series.map((s, k) => {
                    const v = s.values[i];
                    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
                    const yb = yRow + (rowH - (thick + 2) * series.length + 2) / 2 + k * (thick + 2);
                    const xs = sx(Math.min(0, v));
                    const w = Math.abs(sx(v) - sx(0));
                    return <path key={k} d={hbarPath(xs, yb, Math.max(w, 1), thick)} fill={seriesColor(k)} />;
                  })}
                  {series.length === 1 && typeof series[0].values[i] === 'number' && (
                    <text x={sx(Math.max(0, series[0].values[i] as number)) + 6} y={yRow + rowH / 2} dy="0.35em" className="fill-fg-2 text-[11.5px] tabular-nums">
                      {valueText(series[0].values[i], unit, prefix)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
        {hover !== null && series.length > 1 && (
          <Tip x={labelW + plotW / 2} y={hover * rowH - 8} width={width} title={labels[hover]} rows={series.map((s, k) => ({ color: seriesColor(k), name: s.name, value: valueText(s.values[hover], unit, prefix) }))} />
        )}
      </div>
    );
  }

  // ---- lines, areas and columns --------------------------------------------------------------------------------------
  const markRow = marks?.length ? 16 : 0;
  const axisW = Math.max(28, Math.max(...ticks.map((t) => tickText(t, top, unit, prefix).length)) * 6.4 + 8);
  const padT = 8 + markRow;
  const padB = xLabel ? 36 : 22;
  const plotW = Math.max(10, width - axisW - 8);
  const plotH = Math.max(40, height - padT - padB);
  const sy = (v: number) => padT + plotH - ((v - y0) / (y1 - y0 || 1)) * plotH;
  const band = plotW / n;
  const px = (i: number) => (bars ? axisW + band * i + band / 2 : axisW + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1)));
  // Labels along x: as many as fit.
  const avg = labels.reduce((m, l) => m + l.length, 0) / n;
  const every = Math.max(1, Math.ceil((n * (avg * 6.4 + 10)) / plotW));
  const zero = sy(Math.max(y0, Math.min(0, y1)));
  const groups = stacked ? 1 : series.length;
  const thick = Math.max(2, Math.min(24, (band * 0.72 - (groups - 1) * 2) / groups));

  const linePath = (vals: (number | null)[]) => {
    let d = '';
    let pen = false;
    vals.forEach((v, i) => {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${px(i).toFixed(1)},${sy(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const areaPath = (vals: (number | null)[]) => {
    const segs: string[] = [];
    let run: [number, number][] = [];
    const flush = () => {
      if (run.length > 1) segs.push(`M${run[0][0]},${zero}${run.map(([a, b]) => `L${a.toFixed(1)},${b.toFixed(1)}`).join('')}L${run[run.length - 1][0]},${zero}Z`);
      run = [];
    };
    vals.forEach((v, i) => (typeof v === 'number' && Number.isFinite(v) ? run.push([px(i), sy(v)]) : flush()));
    flush();
    return segs.join('');
  };

  /**
   * A label along x that would run into the first one or the last (on a line chart they sit at its ends, from its start
   * and up to its end, rather than centred) is left out: the ends always show.
   */
  const shownWidth = (i: number) => Math.min(labels[i].length, 14) * 6.4;
  const crowded = (i: number) => {
    if (n < 3 || i === 0 || i === n - 1) return false;
    const half = shownWidth(i) / 2;
    return px(i) - half < px(0) + shownWidth(0) + 8 || px(i) + half > px(n - 1) - shownWidth(n - 1) - 8;
  };

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const i = bars ? Math.floor(mx / band) : Math.round((mx / plotW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  const hoverRows =
    hover === null
      ? []
      : series.map((s, k) => ({ color: seriesColor(k), name: s.name, value: valueText(s.values[hover], unit, prefix) })).concat(
          stacked && series.length > 1 ? [{ color: 'transparent', name: tr('Total'), value: valueText(series.reduce((m, s) => m + (typeof s.values[hover] === 'number' ? (s.values[hover] as number) : 0), 0), unit, prefix) }] : [],
        );

  return (
    <div ref={ref} className={cx('relative', className)}>
      <Legend names={series.map((s) => s.name)} line={!bars} />
      {yLabel && <div className="mb-1 text-[11px] text-fg-3">{yLabel}</div>}
      {width > 0 && (
        <svg width={width} height={height} className="block overflow-visible" role="img" aria-label={series.map((s) => s.name).join(', ')}>
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={axisW} x2={axisW + plotW} y1={sy(t)} y2={sy(t)} stroke={t === 0 && y0 < 0 ? 'var(--viz-axis)' : 'var(--viz-grid)'} strokeWidth={1} shapeRendering="crispEdges" />
              <text x={axisW - 6} y={sy(t)} dy="0.35em" textAnchor="end" className="fill-fg-3 text-[11px] tabular-nums">
                {tickText(t, top, unit, prefix)}
              </text>
            </g>
          ))}
          <line x1={axisW} x2={axisW + plotW} y1={zero} y2={zero} stroke="var(--viz-axis)" strokeWidth={1} shapeRendering="crispEdges" />
          {bars && hover !== null && <rect x={axisW + band * hover} y={padT} width={band} height={plotH} fill="var(--bg-2)" opacity={0.7} rx={4} />}
          {/* Columns: side by side, or stacked with a gap between segments. */}
          {bars &&
            labels.map((_, i) => {
              if (stacked) {
                let pos = 0;
                let neg = 0;
                return (
                  <g key={i}>
                    {series.map((s, k) => {
                      const v = s.values[i];
                      if (typeof v !== 'number' || !Number.isFinite(v) || v === 0) return null;
                      const from = v >= 0 ? pos : neg;
                      const to = from + v;
                      v >= 0 ? (pos = to) : (neg = to);
                      const ya = sy(Math.max(from, to));
                      const yb = sy(Math.min(from, to));
                      const isEnd = series.slice(k + 1).every((o) => typeof o.values[i] !== 'number' || Math.sign(o.values[i] as number) !== Math.sign(v));
                      const h = Math.max(0, yb - ya - (isEnd ? 0 : 2));
                      return isEnd ? <path key={k} d={barPath(px(i) - thick / 2, v >= 0 ? ya : ya + 2, thick, h, v >= 0)} fill={seriesColor(k)} /> : <rect key={k} x={px(i) - thick / 2} y={v >= 0 ? ya + 2 : ya} width={thick} height={h} fill={seriesColor(k)} />;
                    })}
                  </g>
                );
              }
              const start = px(i) - (groups * thick + (groups - 1) * 2) / 2;
              return (
                <g key={i}>
                  {series.map((s, k) => {
                    const v = s.values[i];
                    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
                    const ya = sy(Math.max(0, v));
                    const h = Math.abs(sy(v) - sy(0));
                    return <path key={k} d={barPath(start + k * (thick + 2), ya, thick, Math.max(h, v === 0 ? 0 : 1), v >= 0)} fill={seriesColor(k)} />;
                  })}
                  {series.length === 1 && n <= 8 && typeof series[0].values[i] === 'number' && thick >= 14 && (
                    <text x={px(i)} y={sy(Math.max(0, series[0].values[i] as number)) - 5} textAnchor="middle" className="fill-fg-2 text-[11px] tabular-nums">
                      {valueText(series[0].values[i], unit && unit.length <= 3 ? unit : '', prefix)}
                    </text>
                  )}
                </g>
              );
            })}
          {/* Lines and areas. */}
          {!bars &&
            series.map((s, k) => (
              <g key={k}>
                {kind === 'area' && <path d={areaPath(s.values)} fill={seriesColor(k)} opacity={0.1} />}
                <path d={linePath(s.values)} fill="none" stroke={seriesColor(k)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {n <= 1 &&
                  s.values.map((v, i) => (typeof v === 'number' ? <circle key={i} cx={px(i)} cy={sy(v)} r={4} fill={seriesColor(k)} stroke="var(--panel)" strokeWidth={2} /> : null))}
              </g>
            ))}
          {/* Notes along x. */}
          {marks?.map((m, i) => {
            const at = labels.indexOf(str(m.x));
            if (at < 0) return null;
            return (
              <g key={i}>
                <line x1={px(at)} x2={px(at)} y1={padT - 4} y2={padT + plotH} stroke="var(--line-2)" strokeWidth={1} />
                <text x={Math.min(Math.max(px(at), axisW + 40), axisW + plotW - 40)} y={10} textAnchor="middle" className="fill-fg-3 text-[10.5px]">
                  {m.label.length > 34 ? `${m.label.slice(0, 33)}…` : m.label}
                </text>
              </g>
            );
          })}
          {/* The crosshair, and the points under it. */}
          {!bars && hover !== null && (
            <g>
              <line x1={px(hover)} x2={px(hover)} y1={padT} y2={padT + plotH} stroke="var(--line-2)" strokeWidth={1} />
              {series.map((s, k) => {
                const v = s.values[hover];
                return typeof v === 'number' ? <circle key={k} cx={px(hover)} cy={sy(v)} r={4} fill={seriesColor(k)} stroke="var(--panel)" strokeWidth={2} /> : null;
              })}
            </g>
          )}
          {labels.map((l, i) =>
            (bars ? i % every === 0 : i === 0 || i === n - 1 || (i % every === 0 && !crowded(i))) ? (
              <text key={i} x={px(i)} y={padT + plotH + 15} textAnchor={!bars && i === 0 && n > 1 ? 'start' : !bars && i === n - 1 && n > 1 ? 'end' : 'middle'} className="fill-fg-3 text-[11px]">
                {l.length > 14 ? `${l.slice(0, 13)}…` : l}
              </text>
            ) : null,
          )}
          {xLabel && (
            <text x={axisW + plotW / 2} y={height - 4} textAnchor="middle" className="fill-fg-3 text-[11px]">
              {xLabel}
            </text>
          )}
          <rect x={axisW} y={padT} width={plotW} height={plotH} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
      )}
      {hover !== null && <Tip x={px(hover)} y={padT} width={width} title={labels[hover]} rows={hoverRows} />}
    </div>
  );
}

export interface ScatterPoint {
  x: number;
  y: number;
  label?: string;
  size?: number;
}

/** Points by two numbers (a bubble's size by a third), a series each, the nearest one under the pointer told. */
export function ScatterChart({ series, height = 260, unit, prefix, xLabel, yLabel, className }: { series: { name: string; points: ScatterPoint[] }[]; height?: number; unit?: string; prefix?: string; xLabel?: string; yLabel?: string; className?: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ s: number; i: number } | null>(null);
  const all = series.flatMap((s) => s.points);
  const xs = niceTicks(Math.min(...all.map((p) => p.x)), Math.max(...all.map((p) => p.x)));
  const ys = niceTicks(Math.min(...all.map((p) => p.y)), Math.max(...all.map((p) => p.y)));
  const sizes = all.map((p) => p.size).filter((v): v is number => typeof v === 'number' && v > 0);
  const maxSize = sizes.length ? Math.max(...sizes) : 0;
  if (!all.length) return <div ref={ref} className="h-24" />;
  const axisW = Math.max(28, Math.max(...ys.map((t) => tickText(t, ys[ys.length - 1], unit, prefix).length)) * 6.4 + 8);
  const padB = xLabel ? 36 : 22;
  const plotW = Math.max(10, width - axisW - 10);
  const plotH = Math.max(40, height - 10 - padB);
  const sx = (v: number) => axisW + ((v - xs[0]) / (xs[xs.length - 1] - xs[0] || 1)) * plotW;
  const sy = (v: number) => 10 + plotH - ((v - ys[0]) / (ys[ys.length - 1] - ys[0] || 1)) * plotH;
  const radius = (p: ScatterPoint) => (maxSize && typeof p.size === 'number' ? 4 + Math.sqrt(Math.max(0, p.size) / maxSize) * 14 : 4.5);
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - r.left + axisW;
    const my = e.clientY - r.top + 10;
    let best: { s: number; i: number; d: number } | null = null;
    series.forEach((s, si) =>
      s.points.forEach((p, i) => {
        const d = Math.hypot(sx(p.x) - mx, sy(p.y) - my);
        if (d < 28 && (!best || d < best.d)) best = { s: si, i, d };
      }),
    );
    setHover(best ? { s: (best as { s: number }).s, i: (best as { i: number }).i } : null);
  };
  const hp = hover ? series[hover.s]?.points[hover.i] : null;
  return (
    <div ref={ref} className={cx('relative', className)}>
      <Legend names={series.map((s) => s.name)} />
      {yLabel && <div className="mb-1 text-[11px] text-fg-3">{yLabel}</div>}
      {width > 0 && (
        <svg width={width} height={height} className="block overflow-visible" role="img" aria-label={series.map((s) => s.name).join(', ')}>
          {ys.map((t, i) => (
            <g key={i}>
              <line x1={axisW} x2={axisW + plotW} y1={sy(t)} y2={sy(t)} stroke="var(--viz-grid)" shapeRendering="crispEdges" />
              <text x={axisW - 6} y={sy(t)} dy="0.35em" textAnchor="end" className="fill-fg-3 text-[11px] tabular-nums">
                {tickText(t, ys[ys.length - 1], unit, prefix)}
              </text>
            </g>
          ))}
          {xs.map((t, i) => (
            <text key={i} x={sx(t)} y={10 + plotH + 15} textAnchor="middle" className="fill-fg-3 text-[11px] tabular-nums">
              {tickText(t, xs[xs.length - 1])}
            </text>
          ))}
          <line x1={axisW} x2={axisW + plotW} y1={10 + plotH} y2={10 + plotH} stroke="var(--viz-axis)" shapeRendering="crispEdges" />
          {series.map((s, si) =>
            s.points.map((p, i) => (
              <circle key={`${si}:${i}`} cx={sx(p.x)} cy={sy(p.y)} r={radius(p)} fill={seriesColor(si)} fillOpacity={maxSize ? 0.75 : 1} stroke="var(--panel)" strokeWidth={2} />
            )),
          )}
          {series.length === 1 &&
            series[0].points.length <= 12 &&
            series[0].points.map((p, i) =>
              p.label ? (
                <text key={i} x={sx(p.x) + radius(p) + 4} y={sy(p.y)} dy="0.35em" className="pointer-events-none fill-fg-2 text-[11px]">
                  {p.label.length > 18 ? `${p.label.slice(0, 17)}…` : p.label}
                </text>
              ) : null,
            )}
          {xLabel && (
            <text x={axisW + plotW / 2} y={height - 4} textAnchor="middle" className="fill-fg-3 text-[11px]">
              {xLabel}
            </text>
          )}
          <rect x={axisW} y={10} width={plotW} height={plotH} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
      )}
      {hp && hover && (
        <Tip
          x={sx(hp.x)}
          y={Math.max(0, sy(hp.y) - 50)}
          width={width}
          title={hp.label ?? series[hover.s].name}
          rows={[
            { color: seriesColor(hover.s), name: xLabel ?? 'x', value: fmtNum(hp.x) },
            { color: seriesColor(hover.s), name: yLabel ?? 'y', value: valueText(hp.y, unit, prefix) },
            ...(typeof hp.size === 'number' ? [{ color: seriesColor(hover.s), name: tr('Size'), value: fmtNum(hp.size) }] : []),
          ]}
        />
      )}
    </div>
  );
}

/** Parts of a whole as a pie or a donut (at most eight slices: the rest fold into Other), each named with its share. */
export function PieChart({ labels, values, donut, unit, prefix, size = 180, center, className }: { labels: string[]; values: (number | null)[]; donut?: boolean; unit?: string; prefix?: string; size?: number; center?: ReactNode; className?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const parts = useMemo(() => {
    const list = labels.map((l, i) => ({ name: l, value: Math.max(0, typeof values[i] === 'number' && Number.isFinite(values[i]) ? (values[i] as number) : 0) })).filter((p) => p.value > 0);
    if (list.length <= 8) return list;
    const head = list.slice(0, 7);
    return [...head, { name: tr('Other'), value: list.slice(7).reduce((m, p) => m + p.value, 0) }];
  }, [labels, values]);
  const total = parts.reduce((m, p) => m + p.value, 0);
  if (!total) return null;
  const r = size / 2;
  const inner = donut ? r * 0.62 : 0;
  let angle = -Math.PI / 2;
  const arcs = parts.map((p) => {
    const a0 = angle;
    const a1 = angle + (p.value / total) * Math.PI * 2;
    angle = a1;
    return { ...p, a0, a1 };
  });
  const arc = (a0: number, a1: number, ro: number, ri: number) => {
    if (a1 - a0 >= Math.PI * 2 - 1e-6) a1 = a0 + Math.PI * 2 - 1e-4;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (a: number, rr: number) => `${(r + rr * Math.cos(a)).toFixed(2)},${(r + rr * Math.sin(a)).toFixed(2)}`;
    return ri > 0 ? `M${p(a0, ro)}A${ro},${ro} 0 ${large} 1 ${p(a1, ro)}L${p(a1, ri)}A${ri},${ri} 0 ${large} 0 ${p(a0, ri)}Z` : `M${r},${r}L${p(a0, ro)}A${ro},${ro} 0 ${large} 1 ${p(a1, ro)}Z`;
  };
  const shown = hover !== null ? arcs[hover] : null;
  return (
    <div className={cx('flex flex-wrap items-center gap-x-6 gap-y-3', className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} role="img" aria-label={parts.map((p) => p.name).join(', ')}>
          {arcs.map((a, i) => (
            <path key={i} d={arc(a.a0, a.a1, hover === i ? r : r - 3, inner)} fill={seriesColor(i)} stroke="var(--panel)" strokeWidth={2} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} className="transition-[d] duration-150" />
          ))}
        </svg>
        {donut && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            {shown ? (
              <div className="px-3 leading-tight">
                <div className="text-[16px] font-semibold tabular-nums">{valueText(shown.value, unit, prefix)}</div>
                <div className="mt-0.5 line-clamp-2 text-[11px] text-fg-3" translate="no">
                  {shown.name}
                </div>
              </div>
            ) : (
              (center ?? (
                <div className="leading-tight">
                  <div className="text-[17px] font-semibold tabular-nums">{valueText(total, unit, prefix)}</div>
                  <div className="mt-0.5 text-[11px] text-fg-3">{tr('Total')}</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
      <ul className="m-0 min-w-[160px] flex-1 list-none space-y-1 p-0">
        {arcs.map((a, i) => (
          <li key={i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} className={cx('flex items-center gap-2 rounded-md px-1.5 py-0.5 text-[13px]', hover === i && 'bg-bg-2')}>
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: seriesColor(i) }} />
            <span className="min-w-0 flex-1 truncate text-fg-2" translate="no">
              {a.name}
            </span>
            <span className="font-medium tabular-nums">{valueText(a.value, unit, prefix)}</span>
            <span className="w-11 text-right text-[12px] text-fg-3 tabular-nums">{fmtNum((a.value / total) * 100, { maximumFractionDigits: a.value / total < 0.1 ? 1 : 0 })}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Several series over the same axes, as polygons on a web: a radar chart. */
export function RadarChart({ axes, series, max, size = 260, unit, className }: { axes: string[]; series: XYSeries[]; max?: number | null; size?: number; unit?: string; className?: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = axes.length;
  const top = typeof max === 'number' && max > 0 ? max : Math.max(1, ...series.flatMap((s) => s.values.filter((v): v is number => typeof v === 'number')));
  const S = Math.min(size, Math.max(160, width));
  const r = S / 2 - 44;
  const cx0 = S / 2;
  const cy0 = S / 2;
  const at = (i: number, v: number) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return [cx0 + Math.cos(a) * r * (v / top), cy0 + Math.sin(a) * r * (v / top)] as const;
  };
  if (n < 3) return <div ref={ref} />;
  return (
    <div ref={ref} className={cx('relative', className)}>
      <Legend names={series.map((s) => s.name)} line />
      {width > 0 && (
        <svg width={S} height={S} className="mx-auto block overflow-visible" role="img" aria-label={series.map((s) => s.name).join(', ')}>
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <polygon key={f} points={axes.map((_, i) => at(i, top * f).join(',')).join(' ')} fill="none" stroke="var(--viz-grid)" />
          ))}
          {axes.map((a, i) => {
            const [x, y] = at(i, top);
            const [lx, ly] = at(i, top * 1.16);
            return (
              <g key={i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
                <line x1={cx0} y1={cy0} x2={x} y2={y} stroke={hover === i ? 'var(--line-2)' : 'var(--viz-grid)'} />
                <text x={lx} y={ly} dy="0.35em" textAnchor={Math.abs(lx - cx0) < 4 ? 'middle' : lx > cx0 ? 'start' : 'end'} className="fill-fg-2 text-[11px]">
                  {a.length > 16 ? `${a.slice(0, 15)}…` : a}
                </text>
                <circle cx={x} cy={y} r={14} fill="transparent" />
              </g>
            );
          })}
          {series.map((s, k) => (
            <polygon key={k} points={axes.map((_, i) => at(i, Math.max(0, typeof s.values[i] === 'number' ? (s.values[i] as number) : 0)).join(',')).join(' ')} fill={seriesColor(k)} fillOpacity={0.1} stroke={seriesColor(k)} strokeWidth={2} strokeLinejoin="round" />
          ))}
          {hover !== null &&
            series.map((s, k) => {
              const v = s.values[hover];
              if (typeof v !== 'number') return null;
              const [x, y] = at(hover, v);
              return <circle key={k} cx={x} cy={y} r={4} fill={seriesColor(k)} stroke="var(--panel)" strokeWidth={2} />;
            })}
        </svg>
      )}
      {hover !== null && <Tip x={width / 2 - 60} y={0} width={width} title={axes[hover]} rows={series.map((s, k) => ({ color: seriesColor(k), name: s.name, value: valueText(s.values[hover], unit) }))} />}
    </div>
  );
}

/** A small line of the latest values, the last one marked: a stat's trend. */
export function Sparkline({ values, width = 84, height = 26, color = 'var(--fg-3)', className }: { values: (number | null)[]; width?: number; height?: number; color?: string; className?: string }) {
  const v = values.map((x) => (typeof x === 'number' && Number.isFinite(x) ? x : null));
  const nums = v.filter((x): x is number => x !== null);
  if (nums.length < 2) return null;
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const px = (i: number) => 2 + (i / (v.length - 1)) * (width - 4);
  const py = (x: number) => 3 + (1 - (x - lo) / (hi - lo || 1)) * (height - 6);
  let d = '';
  v.forEach((x, i) => (x === null ? null : (d += `${d ? 'L' : 'M'}${px(i).toFixed(1)},${py(x).toFixed(1)}`)));
  const last = v.length - 1 - [...v].reverse().findIndex((x) => x !== null);
  return (
    <svg width={width} height={height} className={cx('block shrink-0', className)} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={px(last)} cy={py(v[last] as number)} r={2.5} fill="var(--accent)" />
    </svg>
  );
}

/** A chart's numbers as a table: what a chart shows, readable without hovering. */
export function ChartTable({ x, series, unit, prefix }: { x: string[]; series: XYSeries[]; unit?: string; prefix?: string }) {
  const n = Math.max(x.length, ...series.map((s) => s.values.length));
  return (
    <div className="max-h-80 overflow-auto rounded-lg border border-line">
      <table className="w-full border-collapse text-[12.5px]">
        <thead className="sticky top-0 bg-bg-1">
          <tr>
            <th className="px-2.5 py-1.5 text-left font-medium text-fg-3" />
            {series.map((s, i) => (
              <th key={i} className="px-2.5 py-1.5 text-right font-medium text-fg-3" translate="no">
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: n }, (_, i) => (
            <tr key={i} className="border-t border-line/70">
              <td className="px-2.5 py-1 text-fg-2" translate="no">
                {x[i] ?? i + 1}
              </td>
              {series.map((s, k) => (
                <td key={k} className="px-2.5 py-1 text-right tabular-nums">
                  {valueText(s.values[i], unit, prefix)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
