// Experiments' own charts, drawn as the app's others are (2px lines, hairline grids, a crosshair with the values):
// a metric over steps (one line per run when comparing), and a sweep's setting against its metric (a dot per run,
// on a log scale when the values span a lot, like learning rates).
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cx } from '../../components/ui';
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

/** Round numbers for an axis from lo to hi, about `n` of them. */
function ticks(lo: number, hi: number, n = 3): number[] {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

export interface StepSeries {
  label: string;
  color: string;
  points: [number, number][];
}

/** A metric over steps: one line per series, the values at the step under the pointer. */
export function StepChart({ series, height = 140, className }: { series: StepSeries[]; height?: number; className?: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const axisW = 46;
  const top = 6;
  const plotH = height - top - 18;
  const plotW = Math.max(0, width - axisW - 4);
  const box = useMemo(() => {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const s of series)
      for (const [x, y] of s.points) {
        if (!Number.isFinite(y)) continue;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    if (!Number.isFinite(x0)) return null;
    const pad = (y1 - y0) * 0.08 || Math.abs(y1) * 0.05 || 1;
    return { x0, x1: x1 > x0 ? x1 : x0 + 1, y0: y0 - pad, y1: y1 + pad };
  }, [series]);
  if (!box) return <div className={cx('flex items-center justify-center text-[12px] text-fg-3', className)} style={{ height }}>No values yet</div>;
  const x = (v: number) => axisW + ((v - box.x0) / (box.x1 - box.x0)) * plotW;
  const y = (v: number) => top + plotH - ((v - box.y0) / (box.y1 - box.y0)) * plotH;
  const ys = ticks(box.y0, box.y1, 3);
  const xs = ticks(box.x0, box.x1, Math.max(2, Math.floor(plotW / 90)));
  const path = (pts: [number, number][]) => {
    let d = '';
    let pen = false;
    for (const [px, py] of pts) {
      if (!Number.isFinite(py)) {
        pen = false;
        continue;
      }
      d += `${pen ? 'L' : 'M'}${x(px).toFixed(1)},${y(py).toFixed(1)}`;
      pen = true;
    }
    return d;
  };
  /** The value of a series at a step: its last point at or before it. */
  const at = (pts: [number, number][], step: number) => {
    let v: [number, number] | undefined;
    for (const p of pts) {
      if (p[0] > step) break;
      v = p;
    }
    return v;
  };
  const onMove = (e: React.PointerEvent) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const px = e.clientX - r.left - axisW;
    if (px < -4 || plotW <= 0) return setHover(null);
    setHover(box.x0 + (Math.max(0, Math.min(px, plotW)) / plotW) * (box.x1 - box.x0));
  };
  return (
    <div ref={ref} className={cx('relative w-full select-none', className)} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} onPointerMove={onMove} onPointerLeave={() => setHover(null)} className="block touch-pan-y">
          {ys.map((g, i) => (
            <g key={i}>
              <line x1={axisW} x2={width} y1={y(g)} y2={y(g)} className="viz-grid" />
              <text x={axisW - 6} y={y(g) + 3.5} textAnchor="end" className="tnum fill-[var(--fg-3)] text-[10px]">
                {num(g)}
              </text>
            </g>
          ))}
          <line x1={axisW} x2={width} y1={top + plotH} y2={top + plotH} className="viz-axis" />
          {xs.map((g, i) => (
            <text key={i} x={x(g)} y={height - 3} textAnchor="middle" className="tnum fill-[var(--fg-3)] text-[10px]">
              {num(g)}
            </text>
          ))}
          {series.map((s, i) => (
            <path key={i} d={path(s.points)} className="viz-line" stroke={s.color} />
          ))}
          {series.length === 1 && series[0].points.length === 1 && <circle cx={x(series[0].points[0][0])} cy={y(series[0].points[0][1])} r={3} fill={series[0].color} />}
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={top} y2={top + plotH} className="viz-axis" />
              {series.map((s, i) => {
                const p = at(s.points, hover);
                return p && Number.isFinite(p[1]) ? <circle key={i} cx={x(p[0])} cy={y(p[1])} r={4} fill={s.color} stroke="var(--panel)" strokeWidth={2} /> : null;
              })}
            </g>
          )}
        </svg>
      )}
      {hover !== null && (
        <div className="pointer-events-none absolute top-0 z-10 max-w-[260px] rounded-lg border border-line-2 bg-panel px-2.5 py-1.5 shadow-pop" style={{ left: Math.min(Math.max(x(hover) + 10, 0), Math.max(0, width - 200)) }}>
          <div className="mb-0.5 text-[10.5px] text-fg-3">Step {num(Math.round(hover))}</div>
          {series.map((s) => {
            const p = at(s.points, hover);
            return (
              <div key={s.label} className="flex items-center gap-2 text-[12px] whitespace-nowrap">
                <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: s.color }} />
                <span className="tnum font-semibold">{p ? num(p[1]) : '–'}</span>
                <span translate="no" className="truncate text-fg-3">
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
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
            <text key={String(v)} x={xOf(v)} y={height - 4} textAnchor="middle" className="tnum fill-[var(--fg-3)] text-[10px]">
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
        <div className="pointer-events-none absolute z-10 rounded-lg border border-line-2 bg-panel px-2.5 py-1 text-[12px] whitespace-nowrap shadow-pop" style={{ left: Math.min(xOf(h.x) + 8, Math.max(0, width - 160)), top: Math.max(0, yOf(h.y) - 36) }}>
          <span translate="no">{setting}</span> {typeof h.x === 'number' ? num(h.x) : h.x} · <span translate="no">{metric}</span> <span className="tnum font-semibold">{num(h.y)}</span>
        </div>
      )}
    </div>
  );
}
