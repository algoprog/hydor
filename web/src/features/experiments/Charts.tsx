// Experiments' own charts, drawn as the app's others are (2px lines, hairline grids, a crosshair with the values):
// a metric over steps or along another metric (a line per run, smoothing, a log scale, a drag to zoom with a mouse),
// a small curve with no axes, a hyperparameter against its metric (a dot per run, on a log scale when the values
// span a lot, like learning rates), and parallel coordinates over every hyperparameter and the metric. Colours come
// from the caller (the app's --viz-1…8); text is always in the text colours, never a series' colour. Everything that
// shows on pointing works by touch too (a tap or a drag across shows the same).
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LOCALE } from '../../i18n/locale';
import { cx } from '../../components/ui';
import { domainOf, smooth } from './analysis';
import { num } from './api';

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
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

/** A number on an axis: as `num` says it, but from 10,000 up compact ("12k", "1.2M"). */
function axis(v: number): string {
  const a = Math.abs(v);
  if (!Number.isFinite(v) || a < 1e4) return num(v);
  const [d, unit] = a >= 1e9 ? [1e9, 'B'] : a >= 1e6 ? [1e6, 'M'] : [1e3, 'k'];
  return `${v < 0 ? '−' : ''}${String(Number((a / d).toPrecision(3)))}${unit}`;
}

/** Round numbers for an axis from lo to hi, about `n` of them (whole numbers, at least 1 apart, with `whole`). */
function ticks(lo: number, hi: number, n = 3, whole = false): number[] {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const nice = [1, 2, 2.5, 5, 10].map((f) => f * mag).filter((s) => s >= raw && (!whole || (Number.isInteger(s) && s >= 1)));
  const step = nice[0] ?? (whole ? Math.max(1, Math.ceil(raw)) : raw);
  const out: number[] = [];
  if (!(step > 0) || !Number.isFinite(lo) || !Number.isFinite(hi)) return [lo];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9 && out.length < 50; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

/** Round numbers on a log axis from lo to hi, at most 5: 1-2-5 times powers of ten, else powers of ten, else every step of 1…9. */
function logTicks(lo: number, hi: number): number[] {
  const a = Math.floor(Math.log10(lo)) - 1;
  const b = Math.ceil(Math.log10(hi)) + 1;
  const gen = (mults: number[]) => {
    const out: number[] = [];
    for (let e = a; e <= b; e++)
      for (const m of mults) {
        const v = Number((m * 10 ** e).toPrecision(12));
        if (v >= lo && v <= hi) out.push(v);
      }
    return out;
  };
  const thin = (t: number[]) => {
    const stride = Math.ceil(t.length / 5);
    return t.filter((_, i) => i % stride === 0);
  };
  for (const mults of [[1, 2, 5], [1]]) {
    const t = gen(mults);
    if (t.length >= 2 && t.length <= 5) return t;
  }
  const pw = gen([1]);
  if (pw.length > 5) return thin(pw);
  const dense = gen([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  if (dense.length >= 2) return thin(dense);
  return [Number(lo.toPrecision(2)), Number(hi.toPrecision(2))];
}

/** A series on a LineChart: a run's points of one metric, [x, y]. */
export interface LineSeries {
  /** The run's key (runKey). */
  key: string;
  label: string;
  color: string;
  points: [number, number][];
}

/** How a LineChart draws: smoothing 0 (none) to 0.99, a log scale for y, and outliers left out of the y range. */
export interface ChartView {
  smoothing: number;
  logY: boolean;
  outliers: boolean;
}

const AXIS_W = 46;
const PAD_TOP = 8;
const PAD_RIGHT = 8;
const PAD_BOTTOM = 18;
const finite = (p: [number, number]) => Number.isFinite(p[0]) && Number.isFinite(p[1]);

/**
 * A metric over steps (or along another metric), a line per run: hairline grid, 2px lines (the raw curve faint
 * beneath a smoothed one), a crosshair with each run's value at that x (the best first when `better` is given), and
 * with a mouse a drag across to zoom in (double-click or Reset zoom goes back). A tap or a drag across by touch shows the
 * same values and keeps them until a tap elsewhere.
 */
export function LineChart({ series, height = 180, view, better, xLabel, zoom, className }: { series: LineSeries[]; height?: number; view?: Partial<ChartView>; better?: 'min' | 'max'; xLabel?: string; zoom?: boolean; className?: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const clip = `lc${useId().replace(/\W/g, '')}`;
  const smoothing = view?.smoothing ?? 0;
  const [hx, setHx] = useState<number | null>(null);
  const [range, setRange] = useState<[number, number] | null>(null);
  const [drag, setDrag] = useState<{ a: number; b: number } | null>(null);
  const plotW = Math.max(0, width - AXIS_W - PAD_RIGHT);
  const plotH = height - PAD_TOP - PAD_BOTTOM;

  const data = useMemo(
    () =>
      series.map((s) => {
        const raw = s.points.filter((p) => Number.isFinite(p[0]));
        return { s, raw, line: smoothing > 0 ? smooth(raw, smoothing) : raw };
      }),
    [series, smoothing],
  );
  // Every x any series has, for the crosshair to snap to.
  const allX = useMemo(() => {
    const xs = new Set<number>();
    for (const d of data) for (const p of d.line) if (Number.isFinite(p[1])) xs.add(p[0]);
    return [...xs].sort((a, b) => a - b);
  }, [data]);
  const box = useMemo(() => {
    const vals: number[] = [];
    let x0 = Infinity;
    let x1 = -Infinity;
    let whole = true;
    for (const d of data)
      for (const p of d.raw) {
        if (!Number.isFinite(p[1])) continue;
        vals.push(p[1]);
        x0 = Math.min(x0, p[0]);
        x1 = Math.max(x1, p[0]);
        if (!Number.isInteger(p[0])) whole = false;
      }
    if (!vals.length) return null;
    // On a log scale only when every value can be (a log of 0 or less is nothing).
    const log = !!view?.logY && vals.every((v) => v > 0);
    let [rx0, rx1] = range ?? [x0, x1];
    if (rx1 <= rx0) {
      rx0 -= 0.5;
      rx1 += 0.5;
    }
    const inView: number[] = [];
    for (const d of data) {
      for (const p of d.raw) if (Number.isFinite(p[1]) && p[0] >= rx0 && p[0] <= rx1) inView.push(p[1]);
      if (smoothing > 0) for (const p of d.line) if (Number.isFinite(p[1]) && p[0] >= rx0 && p[0] <= rx1) inView.push(p[1]);
    }
    const dom = domainOf(inView.length ? inView : vals, !!view?.outliers, log);
    if (!dom) return null;
    return { x0: rx0, x1: rx1, y0: dom[0], y1: dom[1], whole, log };
  }, [data, range, view?.logY, view?.outliers, smoothing]);

  // A tap elsewhere puts the values away (a mouse leaving does it on its own).
  useEffect(() => {
    if (hx === null) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setHx(null);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [hx, ref]);

  if (!box)
    return (
      <div ref={ref} className={cx('flex items-center justify-center text-[12px] text-fg-3', className)} style={{ height }}>
        No values yet
      </div>
    );
  const xp = (v: number) => AXIS_W + ((v - box.x0) / (box.x1 - box.x0)) * plotW;
  const ty = box.log ? Math.log10 : (v: number) => v;
  const yp = (v: number) => {
    const y = PAD_TOP + plotH - ((ty(v) - ty(box.y0)) / (ty(box.y1) - ty(box.y0))) * plotH;
    return Math.max(-1e4, Math.min(1e4, y));
  };
  const yTicks = box.log ? logTicks(box.y0, box.y1) : ticks(box.y0, box.y1, 4);
  const xTicks = ticks(box.x0, box.x1, Math.max(3, Math.floor(plotW / 70)), box.whole);
  const path = (pts: [number, number][]) => {
    let d = '';
    let pen = false;
    for (const [px, py] of pts) {
      if (!Number.isFinite(py) || !Number.isFinite(px)) {
        pen = false;
        continue;
      }
      d += `${pen ? 'L' : 'M'}${xp(px).toFixed(1)},${yp(py).toFixed(1)}`;
      pen = true;
    }
    return d;
  };
  const xAt = (px: number) => box.x0 + (Math.max(0, Math.min(px - AXIS_W, plotW)) / plotW) * (box.x1 - box.x0);
  /** The x of any series nearest this one. */
  const snap = (v: number) => {
    let lo = 0;
    let hi = allX.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (allX[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    const a = allX[lo - 1];
    const b = allX[lo];
    return a === undefined ? b : b === undefined ? a : v - a <= b - v ? a : b;
  };
  const pxOf = (e: React.PointerEvent) => e.clientX - (e.currentTarget as SVGElement).getBoundingClientRect().left;
  const show = (px: number) => {
    if (plotW <= 0 || px < AXIS_W - 6 || !allX.length) return setHx(null);
    setHx(snap(xAt(px)));
  };
  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const px = pxOf(e);
    if (zoom && e.pointerType === 'mouse' && e.button === 0 && px >= AXIS_W && px <= AXIS_W + plotW) {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ a: px, b: px });
      setHx(null);
    } else show(px);
  };
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const px = pxOf(e);
    if (drag) return setDrag({ a: drag.a, b: Math.max(AXIS_W, Math.min(px, AXIS_W + plotW)) });
    show(px);
  };
  const onUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (Math.abs(drag.b - drag.a) > 6) {
      const a = xAt(Math.min(drag.a, drag.b));
      const b = xAt(Math.max(drag.a, drag.b));
      if (b > a) setRange([a, b]);
    }
    setDrag(null);
  };

  // The tooltip: each series' last point at or before the crosshair.
  const at = hx === null ? [] : data.map((d) => {
    let p: [number, number] | undefined;
    for (const q of d.line) {
      if (q[0] > hx) break;
      if (Number.isFinite(q[1])) p = q;
    }
    return { d, p };
  });
  const rows = at
    .filter((r): r is { d: (typeof data)[number]; p: [number, number] } => !!r.p)
    .sort((a, b) => (better === 'min' ? a.p[1] - b.p[1] : b.p[1] - a.p[1]))
    .slice(0, 8);
  const many = data.length > 4;
  const flip = hx !== null && xp(hx) > width / 2;

  return (
    <div ref={ref} className={cx('relative w-full select-none', className)} style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          className={cx('block touch-pan-y', zoom && 'cursor-crosshair')}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => setDrag(null)}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse' && !drag) setHx(null);
          }}
          onDoubleClick={() => setRange(null)}
        >
          <defs>
            <clipPath id={clip}>
              <rect x={AXIS_W - 2} y={PAD_TOP - 3} width={plotW + 4} height={plotH + 6} />
            </clipPath>
          </defs>
          {yTicks.map((g, i) => (
            <g key={i}>
              <line x1={AXIS_W} x2={width - PAD_RIGHT + 4} y1={yp(g)} y2={yp(g)} className="viz-grid" />
              <text x={AXIS_W - 6} y={yp(g) + 3.5} textAnchor="end" className="tnum fill-[var(--fg-3)] text-[10px]">
                {axis(g)}
              </text>
            </g>
          ))}
          <line x1={AXIS_W} x2={width - PAD_RIGHT + 4} y1={PAD_TOP + plotH} y2={PAD_TOP + plotH} className="viz-axis" />
          {xTicks.map((g, i) => (
            <text key={i} x={xp(g)} y={height - 4} textAnchor={xp(g) > width - 28 ? 'end' : xp(g) < AXIS_W + 12 ? 'start' : 'middle'} className="tnum fill-[var(--fg-3)] text-[10px]">
              {axis(g)}
            </text>
          ))}
          <g clipPath={`url(#${clip})`}>
            {data.map((d, i) => {
              const dots = d.raw.filter((p) => Number.isFinite(p[1]));
              return (
                <g key={`${d.s.key}:${i}`}>
                  {smoothing > 0 && <path d={path(d.raw)} className="viz-line" stroke={d.s.color} style={{ strokeWidth: 1, opacity: 0.2 }} />}
                  <path d={path(d.line)} className="viz-line" stroke={d.s.color} style={{ strokeWidth: many ? 1.5 : 2 }} />
                  {dots.length === 1 && <circle cx={xp(dots[0][0])} cy={yp(dots[0][1])} r={3} fill={d.s.color} />}
                </g>
              );
            })}
          </g>
          {hx !== null && (
            <g pointerEvents="none">
              <line x1={xp(hx)} x2={xp(hx)} y1={PAD_TOP} y2={PAD_TOP + plotH} className="viz-axis" />
              {rows.map(({ d, p }, i) =>
                p[0] >= box.x0 && p[0] <= box.x1 ? <circle key={`${d.s.key}:${i}`} cx={xp(p[0])} cy={yp(p[1])} r={3.5} fill={d.s.color} stroke="var(--panel)" strokeWidth={2} /> : null,
              )}
            </g>
          )}
          {drag && Math.abs(drag.b - drag.a) > 1 && <rect x={Math.min(drag.a, drag.b)} y={PAD_TOP} width={Math.abs(drag.b - drag.a)} height={plotH} fill="var(--accent)" opacity={0.12} pointerEvents="none" />}
        </svg>
      )}
      {range && (
        <button type="button" onClick={() => setRange(null)} className="absolute top-0.5 right-1.5 z-10 rounded-md border border-line bg-panel px-1.5 py-0.5 text-[11px] text-fg-2 hover:text-fg">
          Reset zoom
        </button>
      )}
      {hx !== null && rows.length > 0 && (
        <div className="pointer-events-none absolute top-1 z-20 max-w-[260px] rounded-lg border border-line-2 bg-panel px-2.5 py-1.5 shadow-pop" style={flip ? { right: Math.max(0, width - xp(hx) + 10) } : { left: xp(hx) + 10 }}>
          <div className="mb-0.5 text-[10.5px] whitespace-nowrap text-fg-3">
            {xLabel ? (
              <>
                <span translate="no">{xLabel}</span> {axis(hx)}
              </>
            ) : (
              `Step ${Math.round(hx).toLocaleString(LOCALE)}`
            )}
          </div>
          {rows.map(({ d, p }, i) => (
            <div key={`${d.s.key}:${i}`} className="flex items-center gap-2 text-[12px] whitespace-nowrap">
              <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: d.s.color }} />
              <span className="tnum font-semibold">{num(p[1])}</span>
              <span translate="no" className="max-w-[180px] truncate text-fg-3">
                {d.s.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** A small curve without axes: a metric's shape at a glance. */
export function Sparkline({ points, color = 'var(--viz-1)', height = 28, className }: { points: [number, number][]; color?: string; height?: number; className?: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const pts = useMemo(() => points.filter(finite).sort((a, b) => a[0] - b[0]), [points]);
  const pad = 3;
  let body = null;
  if (pts.length >= 2 && width > 0) {
    const x0 = pts[0][0];
    const x1 = pts[pts.length - 1][0];
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const p of pts) {
      y0 = Math.min(y0, p[1]);
      y1 = Math.max(y1, p[1]);
    }
    const x = (v: number) => pad + (x1 > x0 ? (v - x0) / (x1 - x0) : 0.5) * (width - 2 * pad);
    const y = (v: number) => (y1 > y0 ? pad + (1 - (v - y0) / (y1 - y0)) * (height - 2 * pad) : height / 2);
    const last = pts[pts.length - 1];
    body = (
      <svg width={width} height={height} className="block" aria-hidden>
        <path d={pts.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join('')} className="viz-line" stroke={color} style={{ strokeWidth: 1.5 }} />
        <circle cx={x(last[0])} cy={y(last[1])} r={2} fill={color} />
      </svg>
    );
  }
  return (
    <div ref={ref} className={cx('w-full', className)} style={{ height }}>
      {body}
    </div>
  );
}


/** A setting against a metric, a dot per run; the best run ringed. Numbers spanning a lot go on a log scale. */
export function Scatter({ points, setting, metric, best, height = 150 }: { points: { x: number | string; y: number; id: string }[]; setting: string; metric: string; best?: string; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const axisW = 46;
  const top = 8;
  const plotH = height - top - 20;
  const plotW = Math.max(0, width - axisW - 12);
  const numeric = points.every((p) => typeof p.x === 'number');
  const xsNum = numeric ? (points.map((p) => p.x) as number[]) : [];
  const log = numeric && xsNum.every((v) => v > 0) && Math.max(...xsNum) / Math.min(...xsNum) >= 20;
  const cats = numeric ? [] : [...new Set(points.map((p) => String(p.x)))];
  const fx = (v: number) => (log ? Math.log10(v) : v);
  const x0 = numeric ? Math.min(...xsNum.map(fx)) : 0;
  const x1 = numeric ? Math.max(...xsNum.map(fx)) : Math.max(1, cats.length - 1);
  const xOf = (v: number | string) => {
    const t = numeric ? (x1 > x0 ? (fx(v as number) - x0) / (x1 - x0) : 0.5) : cats.length > 1 ? cats.indexOf(String(v)) / (cats.length - 1) : 0.5;
    return axisW + 6 + t * plotW;
  };
  const ys = points.map((p) => p.y).filter(Number.isFinite);
  const pad = (Math.max(...ys) - Math.min(...ys)) * 0.1 || 1;
  const y0 = Math.min(...ys) - pad;
  const y1 = Math.max(...ys) + pad;
  const yOf = (v: number) => top + plotH - ((v - y0) / (y1 - y0)) * plotH;
  const labels = numeric ? [...new Set(xsNum)].sort((a, b) => a - b) : cats;
  const shown = labels.length > 8 ? labels.filter((_, i) => i % Math.ceil(labels.length / 8) === 0) : labels;
  const h = points.find((p) => p.id === hover);
  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      <div className="absolute top-0 right-1 text-[11px] text-fg-3" translate="no">
        {setting}
        {log ? ' (log)' : ''}
      </div>
      {width > 0 && ys.length > 0 && (
        <svg width={width} height={height} className="block">
          {ticks(y0, y1, 3).map((g, i) => (
            <g key={i}>
              <line x1={axisW} x2={width} y1={yOf(g)} y2={yOf(g)} className="viz-grid" />
              <text x={axisW - 6} y={yOf(g) + 3.5} textAnchor="end" className="tnum fill-[var(--fg-3)] text-[10px]">
                {num(g)}
              </text>
            </g>
          ))}
          {shown.map((v) => (
            <text key={String(v)} x={xOf(v)} y={height - 4} textAnchor={xOf(v) > width - 28 ? 'end' : xOf(v) < axisW + 28 ? 'start' : 'middle'} className="tnum fill-[var(--fg-3)] text-[10px]">
              {typeof v === 'number' ? num(v) : v}
            </text>
          ))}
          {points.map((p) =>
            Number.isFinite(p.y) ? (
              <circle
                key={p.id}
                cx={xOf(p.x)}
                cy={yOf(p.y)}
                r={p.id === best ? 5 : 3.5}
                fill={p.id === best ? 'var(--accent)' : 'var(--viz-1)'}
                stroke={p.id === best ? 'var(--panel)' : 'none'}
                strokeWidth={2}
                opacity={hover && hover !== p.id ? 0.5 : 0.9}
                onPointerEnter={() => setHover(p.id)}
                onPointerLeave={() => setHover(null)}
              />
            ) : null,
          )}
        </svg>
      )}
      {h && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-line-2 bg-panel px-2.5 py-1 text-[12px] whitespace-nowrap shadow-pop"
          style={{ left: Math.min(xOf(h.x) + 8, Math.max(0, width - 160)), top: Math.max(0, yOf(h.y) - 36) }}
        >
          <span translate="no">{setting}</span> {typeof h.x === 'number' ? num(h.x) : h.x} · <span translate="no">{metric}</span> <span className="tnum font-semibold">{num(h.y)}</span>
        </div>
      )}
    </div>
  );
}

/** An axis of a ParallelCoords chart: a hyperparameter (or the metric, which is the last). */
export interface ParallelAxis {
  key: string;
  label: string;
}

/** A run on a ParallelCoords chart: its values on each axis, and its metric. */
export interface ParallelRow {
  key: string;
  label: string;
  values: Record<string, number | string | boolean | undefined>;
  metric: number;
}

/** Text cut to about `px` wide (11px type, about 6px a letter). */
const cut = (t: string, px: number) => {
  const n = Math.max(3, Math.floor(px / 6));
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

interface PAxisModel {
  key: string;
  label: string;
  /** 0 (bottom) to 1 (top); undefined for a missing value. */
  pos: (v: unknown) => number | undefined;
  ticks: { pos: number; text: string }[];
}

/** One axis: numbers on a linear scale (a log one when they are all above 0 and span 20 times or more), other values spread evenly. */
function axisModel(key: string, label: string, vals: unknown[], flip = false): PAxisModel {
  const defined = vals.filter((v) => v !== undefined && v !== null);
  if (defined.every((v) => typeof v === 'number' && Number.isFinite(v))) {
    const ns = defined as number[];
    const lo = Math.min(...ns);
    const hi = Math.max(...ns);
    const log = ns.length > 0 && lo > 0 && hi / lo >= 20;
    const f = log ? Math.log10 : (v: number) => v;
    const t = (v: number) => (hi > lo ? (f(v) - f(lo)) / (f(hi) - f(lo)) : 0.5);
    const pos = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? (flip ? 1 - t(v) : t(v)) : undefined);
    const tk: { pos: number; text: string }[] = [];
    if (ns.length) {
      tk.push({ pos: pos(lo)!, text: num(lo) });
      if (hi > lo) {
        const mid = log ? Math.sqrt(lo * hi) : (lo + hi) / 2;
        tk.push({ pos: 0.5, text: num(Number(mid.toPrecision(3))) }, { pos: pos(hi)!, text: num(hi) });
      }
    }
    return { key, label, pos, ticks: tk };
  }
  const cats = [...new Set(defined.map(String))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const at = (c: string) => (cats.length > 1 ? 1 - cats.indexOf(c) / (cats.length - 1) : 0.5);
  const stride = Math.ceil(cats.length / 12);
  return { key, label, pos: (v) => (v === undefined || v === null ? undefined : at(String(v))), ticks: cats.filter((_, i) => i % stride === 0).map((c) => ({ pos: at(c), text: c })) };
}

/**
 * Parallel coordinates: an axis per hyperparameter and the metric last, a line per run through its values, shaded
 * from the worst (faint) to the best (strong); numbers on a linear or log axis, other values spaced evenly. Pointing
 * at a line (or tapping it) names the run; clicking opens it (by touch, a second tap).
 */
export function ParallelCoords({ axes, rows, metric, better, best, height = 260, onOpen }: { axes: ParallelAxis[]; rows: ParallelRow[]; metric: string; better: 'min' | 'max'; best?: string; height?: number; onOpen?: (key: string) => void }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const outer = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ key: string; x: number; y: number } | null>(null);
  // The kind of pointer that pressed last (the click event itself is a plain MouseEvent on older Safari): a touch only highlights at first.
  const pointer = useRef('mouse');
  const padL = 56;
  const padR = 72;
  const top = 34;
  const plotH = Math.max(20, height - top - 14);
  const live = useMemo(() => rows.filter((r) => Number.isFinite(r.metric)), [rows]);
  const models = useMemo(() => {
    const m = axes.map((a) => axisModel(a.key, a.label, live.map((r) => r.values[a.key])));
    // The metric: the best at the top, whichever way is better.
    m.push(axisModel('\u0000metric', `${metric} ${better === 'min' ? '↓' : '↑'}`, live.map((r) => r.metric), better === 'min'));
    return m;
  }, [axes, live, metric, better]);
  const n = models.length;
  const spacing = n > 1 ? Math.max(110, (width - padL - padR) / (n - 1)) : 0;
  const svgW = n > 1 ? padL + padR + (n - 1) * spacing : Math.max(width, 200);
  const ax = (i: number) => (n > 1 ? padL + i * spacing : svgW / 2);
  const yOf = (pos: number) => top + (1 - pos) * plotH;
  const metricAxis = models[n - 1];
  const lines = useMemo(
    () =>
      live.map((r) => {
        const pts = models.map((m, i) => {
          const p = m.key === '\u0000metric' ? m.pos(r.metric) : m.pos(r.values[m.key]);
          return p === undefined ? null : ([ax(i), yOf(p)] as [number, number]);
        });
        const t = metricAxis.pos(r.metric) ?? 0;
        return { r, pts, t };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [live, models, svgW, spacing, plotH],
  );
  const dOf = (pts: ([number, number] | null)[]) => {
    let d = '';
    let pen = false;
    for (const p of pts) {
      if (!p) {
        pen = false;
        continue;
      }
      d += `${pen ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`;
      pen = true;
    }
    return d;
  };
  /** The run whose line passes nearest the pointer (within 14px). */
  const nearest = (e: { clientX: number; clientY: number }, svg: SVGSVGElement) => {
    const rect = svg.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    if (n < 2 || px < padL - 14 || px > svgW - padR + 14) return null;
    const i = Math.max(0, Math.min(n - 2, Math.floor((px - padL) / spacing)));
    const t = Math.max(0, Math.min(1, (px - ax(i)) / spacing));
    let found: string | null = null;
    let min = 14;
    for (const l of lines) {
      const a = l.pts[i];
      const b = l.pts[i + 1];
      if (!a || !b) continue;
      const d = Math.abs(a[1] + (b[1] - a[1]) * t - py);
      // The better run wins a tie: it is drawn over the others.
      if (d < min || (d === min && found !== null)) {
        min = d;
        found = l.r.key;
      }
    }
    return found;
  };
  const tipAt = (e: { clientX: number; clientY: number }, key: string | null) => {
    const o = outer.current?.getBoundingClientRect();
    setHover(key && o ? { key, x: e.clientX - o.left, y: e.clientY - o.top } : null);
  };
  const order = [...lines].sort((a, b) => a.t - b.t);
  const bestLine = order.find((l) => l.r.key === best);
  const top1 = hover ? order.find((l) => l.r.key === hover.key) : undefined;
  const rest = order.filter((l) => l !== bestLine && l !== top1);
  const hovered = hover ? live.find((r) => r.key === hover.key) : undefined;
  const scrolls = svgW > width + 1;
  const svgH = scrolls ? height - 10 : height;
  const fade = (l: (typeof lines)[number]) => (hover ? (l.r.key === hover.key ? 1 : 0.12) : 0.2 + 0.8 * l.t);

  return (
    <div ref={outer} className="relative w-full" style={{ height }}>
      <div ref={ref} translate="no" className="h-full w-full overflow-x-auto overflow-y-hidden">
        {!live.length && (
          <div translate="yes" className="flex items-center justify-center text-[12px] text-fg-3" style={{ height }}>
            No values yet
          </div>
        )}
        {width > 0 && live.length > 0 && (
          <svg
            width={svgW}
            height={svgH}
            className={cx('block select-none', hover && onOpen && 'cursor-pointer')}
            onPointerMove={(e) => e.pointerType === 'mouse' && tipAt(e, nearest(e, e.currentTarget))}
            onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
            onPointerDown={(e) => {
              pointer.current = e.pointerType;
            }}
            onPointerUp={(e) => {
              pointer.current = e.pointerType;
            }}
            onClick={(e) => {
              const key = nearest(e, e.currentTarget);
              const mouse = pointer.current === 'mouse';
              if (!key) return setHover(null);
              if (mouse || hover?.key === key) onOpen?.(key);
              else tipAt(e, key);
            }}
          >
            {models.map((m, i) => (
              <g key={m.key}>
                <line x1={ax(i)} x2={ax(i)} y1={top} y2={top + plotH} className="viz-axis" />
                <text x={ax(i)} y={top - 12} textAnchor="middle" className="fill-[var(--fg-2)] text-[11px]">
                  <title>{m.label}</title>
                  {i === n - 1 ? `${cut(m.label.slice(0, -2), (n > 1 ? spacing : 160) - 24)} ${m.label.slice(-1)}` : cut(m.label, (n > 1 ? spacing : 160) - 12)}
                </text>
              </g>
            ))}
            <g>
              {rest.map((l) => (
                <path key={l.r.key} d={dOf(l.pts)} className="viz-line" stroke="var(--viz-1)" style={{ strokeWidth: 1.5, opacity: fade(l) }} />
              ))}
              {bestLine && bestLine !== top1 && <path d={dOf(bestLine.pts)} className="viz-line" stroke="var(--accent)" style={{ strokeWidth: 2.5, opacity: hover ? 0.2 : 1 }} />}
              {top1 && <path d={dOf(top1.pts)} className="viz-line" stroke={top1.r.key === best ? 'var(--accent)' : 'var(--viz-1)'} style={{ strokeWidth: 2.5, opacity: 1 }} />}
            </g>
            {models.map((m, i) => (
              <g key={m.key} pointerEvents="none">
                {m.ticks.map((t, j) => (
                  <text key={j} x={ax(i) + 6} y={yOf(t.pos) + 3.5} className="tnum fill-[var(--fg-3)] text-[10px]" style={{ paintOrder: 'stroke', stroke: 'var(--panel)', strokeWidth: 3 }}>
                    {cut(t.text, (n > 1 ? spacing : 160) - 14)}
                  </text>
                ))}
              </g>
            ))}
          </svg>
        )}
      </div>
      {hover && hovered && (
        <div
          className="pointer-events-none absolute z-20 max-w-[260px] rounded-lg border border-line-2 bg-panel px-2.5 py-1.5 shadow-pop"
          style={hover.x > width * 0.6 ? { right: Math.max(0, width - hover.x + 12), top: Math.max(0, hover.y - 34) } : { left: hover.x + 12, top: Math.max(0, hover.y - 34) }}
        >
          <div translate="no" className="truncate text-[12px] font-medium whitespace-nowrap">
            {hovered.label}
          </div>
          <div className="text-[12px] whitespace-nowrap text-fg-3">
            <span translate="no">{metric}</span> <span className="tnum font-semibold text-fg">{num(hovered.metric)}</span>
          </div>
          {onOpen && <div className="text-[10.5px] text-fg-3 [@media(hover:hover)]:hidden">Tap again to open</div>}
        </div>
      )}
    </div>
  );
}
