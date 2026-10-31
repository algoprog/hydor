// Small SVG charts following the house data-viz rules: 2px lines, ~10% area washes,
// solid hairline grids, a crosshair tooltip on time series, severity-coloured meters.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cx } from './ui';

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

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nf * exp;
}

export interface Series {
  label: string;
  /** CSS colour (use the --viz-N tokens). */
  color: string;
  values: (number | null)[];
}

export function TimeSeries({
  series,
  times,
  height = 120,
  max,
  format,
  ticks = 3,
  className,
}: {
  series: Series[];
  times: number[];
  height?: number;
  max?: number;
  format: (v: number) => string;
  ticks?: number;
  className?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = times.length;
  const axisW = 44;
  const plotW = Math.max(0, width - axisW);
  const top = 6;
  const plotH = height - top - 16;
  const yMax = useMemo(() => {
    if (max) return max;
    let m = 0;
    for (const s of series) for (const v of s.values) if (v != null && v > m) m = v;
    return niceMax(m * 1.1);
  }, [series, max]);
  const x = (i: number) => axisW + (n <= 1 ? plotW : (i / (n - 1)) * plotW);
  const y = (v: number) => top + plotH - (Math.max(0, Math.min(v, yMax)) / yMax) * plotH;
  const paths = useMemo(
    () =>
      series.map((s) => {
        let d = '';
        let area = '';
        let started = false;
        let firstX = 0;
        let lastX = 0;
        s.values.forEach((v, i) => {
          if (v == null) return;
          const px = x(i);
          const py = y(v);
          d += `${started ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`;
          if (!started) firstX = px;
          lastX = px;
          started = true;
        });
        if (started) area = `${d}L${lastX.toFixed(1)},${(top + plotH).toFixed(1)}L${firstX.toFixed(1)},${(top + plotH).toFixed(1)}Z`;
        return { d, area };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, width, yMax, n],
  );
  const gridVals = Array.from({ length: ticks + 1 }, (_, i) => (yMax / ticks) * i);
  const onMove = (e: React.PointerEvent) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const px = e.clientX - r.left - axisW;
    if (n < 1 || px < -4) return setHover(null);
    setHover(Math.max(0, Math.min(n - 1, Math.round((px / plotW) * (n - 1)))));
  };
  const span = n > 1 ? times[n - 1] - times[0] : 0;
  return (
    <div ref={ref} className={cx('relative w-full select-none', className)} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} onPointerMove={onMove} onPointerLeave={() => setHover(null)} className="block touch-pan-y">
          {gridVals.map((g, i) => (
            <g key={i}>
              <line x1={axisW} x2={width} y1={y(g)} y2={y(g)} className={i === 0 ? 'viz-axis' : 'viz-grid'} />
              <text x={axisW - 6} y={y(g) + 3.5} textAnchor="end" className="tnum fill-[var(--fg-3)] text-[10px]">
                {format(g)}
              </text>
            </g>
          ))}
          {series.length === 1 && paths[0].area && <path d={paths[0].area} fill={series[0].color} opacity={0.1} />}
          {paths.map((p, i) => (
            <path key={i} d={p.d} className="viz-line" stroke={series[i].color} />
          ))}
          {hover != null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={top} y2={top + plotH} className="viz-axis" />
              {series.map((s, i) => {
                const v = s.values[hover];
                return v == null ? null : <circle key={i} cx={x(hover)} cy={y(v)} r={4} fill={s.color} stroke="var(--panel)" strokeWidth={2} />;
              })}
            </g>
          )}
          <text x={axisW} y={height - 3} className="fill-[var(--fg-3)] text-[10px]">
            {span ? `−${Math.round(span / 60000) || 1} min` : ''}
          </text>
          <text x={width} y={height - 3} textAnchor="end" className="fill-[var(--fg-3)] text-[10px]">
            now
          </text>
        </svg>
      )}
      {hover != null && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-lg border border-line-2 bg-panel px-2.5 py-1.5 shadow-pop"
          style={{ left: Math.min(Math.max(x(hover) + 10, 0), Math.max(0, width - 150)) }}
        >
          {series.map((s) => (
            <div key={s.label} className="flex items-center gap-2 text-[12px] whitespace-nowrap">
              <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
              <span className="tnum font-semibold">{s.values[hover] == null ? '–' : format(s.values[hover]!)}</span>
              <span className="text-fg-3">{s.label}</span>
            </div>
          ))}
          <div className="mt-0.5 text-[10.5px] text-fg-3">{new Date(times[hover]).toLocaleTimeString()}</div>
        </div>
      )}
    </div>
  );
}

export function Legend({ items, shape = 'line' }: { items: { label: string; color: string; value?: ReactNode }[]; shape?: 'line' | 'rect' }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          <span className={shape === 'rect' ? 'h-2.5 w-2.5 rounded-[3px]' : 'h-0.5 w-3.5 rounded-full'} style={{ background: it.color }} />
          <span className="text-fg-2">{it.label}</span>
          {it.value != null && <span className="tnum font-medium text-fg">{it.value}</span>}
        </span>
      ))}
    </div>
  );
}

/** Severity follows the fill: accent, then warning past 75 %, critical past 90 %. */
export function severityColor(p: number | null | undefined): string {
  if (p == null) return 'var(--viz-1)';
  if (p >= 90) return 'var(--status-critical)';
  if (p >= 75) return 'var(--status-warning)';
  return 'var(--viz-1)';
}

/** Columns grow from their baseline (y) when a chart first shows, one after another. */
const grow = (y: number, i: number) => ({ transformOrigin: `0 ${y}px`, animationDelay: `${Math.min(i * 18, 420)}ms` });

export function Meter({ percent, color, height = 6, className }: { percent: number | null | undefined; color?: string; height?: number; className?: string }) {
  const p = Math.max(0, Math.min(100, percent ?? 0));
  const c = color ?? severityColor(percent);
  // Fills from empty when it appears, then eases to new values.
  const [w, setW] = useState(0);
  useEffect(() => {
    const r = requestAnimationFrame(() => setW(p));
    return () => cancelAnimationFrame(r);
  }, [p]);
  return (
    <div className={cx('w-full overflow-hidden rounded-full', className)} style={{ height, background: `color-mix(in srgb, ${c} 16%, transparent)` }}>
      <div className="anim-grow-x h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${w}%`, background: c, minWidth: w > 0 ? 3 : 0 }} />
    </div>
  );
}

export function Sparkline({ values, color = 'var(--viz-1)', height = 28, max }: { values: number[]; color?: string; height?: number; max?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const m = max ?? Math.max(1, ...values);
  const n = values.length;
  const pts = values.map((v, i) => [n <= 1 ? width : (i / (n - 1)) * width, height - 2 - (Math.min(v, m) / m) * (height - 4)] as const);
  const d = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('');
  return (
    <div ref={ref} style={{ height }} className="w-full">
      {width > 0 && n > 1 && (
        <svg width={width} height={height} className="block">
          <path d={`${d}L${width},${height}L0,${height}Z`} fill={color} opacity={0.1} />
          <path d={d} className="viz-line" stroke={color} />
        </svg>
      )}
    </div>
  );
}

/** Column chart for one series (≤ 24 px columns, 4 px rounded tops, 2 px gaps). */
export function Columns({ data, height = 120, format, axisFormat, color = 'var(--viz-1)', label }: { data: { key: string; value: number; label: string }[]; height?: number; format: (v: number) => string; axisFormat?: (v: number) => string; color?: string; label: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const axisW = 44;
  const padTop = 8;
  const plotW = Math.max(0, width - axisW);
  const plotH = height - 18 - padTop;
  const max = niceMax(Math.max(1, ...data.map((d) => d.value)) * 1.05);
  const slot = data.length ? plotW / data.length : 0;
  const bw = Math.max(2, Math.min(24, slot - 2));
  const grid = [0, max / 2, max];
  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }} aria-label={label}>
      {width > 0 && (
        <svg width={width} height={height} className="block" onPointerLeave={() => setHover(null)}>
          {grid.map((g, i) => {
            const gy = padTop + plotH - (g / max) * plotH;
            return (
              <g key={i}>
                <line x1={axisW} x2={width} y1={gy} y2={gy} className={i === 0 ? 'viz-axis' : 'viz-grid'} />
                <text x={axisW - 6} y={gy + 3.5} textAnchor="end" className="tnum fill-[var(--fg-3)] text-[10px]">
                  {(axisFormat ?? format)(g)}
                </text>
              </g>
            );
          })}
          {data.map((d, i) => {
            const h = (d.value / max) * plotH;
            const bx = axisW + i * slot + (slot - bw) / 2;
            const by = padTop + plotH - h;
            const r = Math.min(4, bw / 2, h);
            const path = h <= 0 ? '' : `M${bx},${padTop + plotH}V${by + r}Q${bx},${by} ${bx + r},${by}H${bx + bw - r}Q${bx + bw},${by} ${bx + bw},${by + r}V${padTop + plotH}Z`;
            return (
              <g key={d.key} onPointerEnter={() => setHover(i)}>
                <rect x={axisW + i * slot} y={0} width={slot} height={padTop + plotH} fill="transparent" />
                {path && <path d={path} fill={color} opacity={hover == null || hover === i ? 1 : 0.55} className="bar-in" style={grow(padTop + plotH, i)} />}
              </g>
            );
          })}
          <XLabels labels={data.map((d) => d.label)} axisW={axisW} slot={slot} width={width} y={height - 3} />
        </svg>
      )}
      {hover != null && data[hover] && (
        <div className="pointer-events-none absolute top-0 z-10 rounded-lg border border-line-2 bg-panel px-2.5 py-1.5 shadow-pop" style={{ left: Math.min(axisW + hover * slot + 8, Math.max(0, width - 140)) }}>
          <div className="tnum text-[12px] font-semibold">{format(data[hover].value)}</div>
          <div className="text-[10.5px] text-fg-3">{data[hover].label}</div>
        </div>
      )}
    </div>
  );
}

/** Evenly spaced x-axis labels under columns, as many as fit (always the newest). */
function XLabels({ labels, axisW, slot, width, y }: { labels: string[]; axisW: number; slot: number; width: number; y: number }) {
  const n = labels.length;
  if (!n) return null;
  const fit = Math.max(2, Math.floor((width - axisW) / 70));
  const step = Math.max(1, Math.ceil(n / fit));
  const idx: number[] = [];
  for (let i = n - 1; i >= 0; i -= step) idx.push(i);
  return (
    <>
      {idx.map((i) => (
        <text key={i} x={Math.min(width - 2, axisW + i * slot + slot / 2)} y={y} textAnchor={i === n - 1 ? 'end' : 'middle'} className="fill-[var(--fg-3)] text-[10px]">
          {labels[i]}
        </text>
      ))}
    </>
  );
}

function roundedTop(x: number, yTop: number, w: number, h: number, r: number): string {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  const b = yTop + h;
  return `M${x},${b}V${yTop + rr}Q${x},${yTop} ${x + rr},${yTop}H${x + w - rr}Q${x + w},${yTop} ${x + w},${yTop + rr}V${b}Z`;
}

function roundedBottom(x: number, yTop: number, w: number, h: number, r: number): string {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  const b = yTop + h;
  return `M${x},${yTop}V${b - rr}Q${x},${b} ${x + rr},${b}H${x + w - rr}Q${x + w},${b} ${x + w},${b - rr}V${yTop}Z`;
}

function Tip({ x, width, children }: { x: number; width: number; children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute top-0 z-10 rounded-lg border border-line-2 bg-panel px-2.5 py-1.5 shadow-pop" style={{ left: Math.min(Math.max(0, x + 8), Math.max(0, width - 170)) }}>
      {children}
    </div>
  );
}

/** Added above the axis, removed below it (same scale both ways). */
export function DivergingColumns({
  data,
  height = 190,
  format,
  up,
  down,
}: {
  data: { key: string; label: string; up: number; down: number }[];
  height?: number;
  format: (v: number) => string;
  up: { label: string; color: string };
  down: { label: string; color: string };
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const axisW = 48;
  const padTop = 8;
  const plotW = Math.max(0, width - axisW);
  const plotH = height - 18 - padTop;
  // One scale for both directions so bar lengths compare; each side gets its own extent
  // (at least a fifth of the other's), which puts the zero line off-centre when they differ.
  const rawUp = Math.max(1, ...data.map((d) => d.up));
  const rawDown = Math.max(1, ...data.map((d) => d.down));
  const U = niceMax(Math.max(rawUp, rawDown / 5));
  const D = niceMax(Math.max(rawDown, rawUp / 5));
  const k = plotH / (U + D);
  const zero = padTop + U * k;
  const slot = data.length ? plotW / data.length : 0;
  const bw = Math.max(2, Math.min(24, slot - 2));
  const ys = (v: number) => v * k;
  const ticks = [U, ...(U * k >= 56 ? [U / 2] : []), 0, ...(D * k >= 56 ? [-D / 2] : []), -D];
  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} className="block" onPointerLeave={() => setHover(null)}>
          {ticks.map((g, i) => {
            const gy = zero - g * k;
            return (
              <g key={i}>
                <line x1={axisW} x2={width} y1={gy} y2={gy} className={g === 0 ? 'viz-axis' : 'viz-grid'} />
                <text x={axisW - 6} y={gy + 3.5} textAnchor="end" className="tnum fill-[var(--fg-3)] text-[10px]">
                  {g === 0 ? '0' : (g > 0 ? '+' : '−') + format(Math.abs(g))}
                </text>
              </g>
            );
          })}
          {data.map((d, i) => {
            const bx = axisW + i * slot + (slot - bw) / 2;
            const hu = ys(d.up);
            const hd = ys(d.down);
            const dim = hover != null && hover !== i ? 0.55 : 1;
            return (
              <g key={d.key} onPointerEnter={() => setHover(i)}>
                <rect x={axisW + i * slot} y={0} width={slot} height={padTop + plotH} fill="transparent" />
                <g className="bar-in" style={grow(zero, i)}>
                  <path d={roundedTop(bx, zero - hu - 1, bw, hu, 4)} fill={up.color} opacity={dim} />
                  <path d={roundedBottom(bx, zero + 1, bw, hd, 4)} fill={down.color} opacity={dim} />
                </g>
              </g>
            );
          })}
          <XLabels labels={data.map((d) => d.label)} axisW={axisW} slot={slot} width={width} y={height - 3} />
        </svg>
      )}
      {hover != null && data[hover] && (
        <Tip x={axisW + hover * slot} width={width}>
          <div className="tnum flex items-center gap-2 text-[12px]">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: up.color }} />
            <span className="font-semibold">+{data[hover].up.toLocaleString()}</span>
            <span className="text-fg-3">{up.label}</span>
          </div>
          <div className="tnum flex items-center gap-2 text-[12px]">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: down.color }} />
            <span className="font-semibold">−{data[hover].down.toLocaleString()}</span>
            <span className="text-fg-3">{down.label}</span>
          </div>
          <div className="tnum mt-0.5 text-[11px] text-fg-3">
            net {data[hover].up - data[hover].down >= 0 ? '+' : '−'}
            {Math.abs(data[hover].up - data[hover].down).toLocaleString()} · {data[hover].label}
          </div>
        </Tip>
      )}
    </div>
  );
}

/** Stacked columns with a 2px surface gap between segments; the top segment is rounded. */
export function StackedColumns({
  data,
  series,
  height = 170,
  format,
}: {
  data: { key: string; label: string; values: number[] }[];
  series: { label: string; color: string }[];
  height?: number;
  format: (v: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const axisW = 48;
  const padTop = 8;
  const plotW = Math.max(0, width - axisW);
  const plotH = height - 18 - padTop;
  const max = niceMax(Math.max(1, ...data.map((d) => d.values.reduce((a, b) => a + b, 0))) * 1.05);
  const slot = data.length ? plotW / data.length : 0;
  const bw = Math.max(2, Math.min(24, slot - 2));
  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} className="block" onPointerLeave={() => setHover(null)}>
          {[0, max / 2, max].map((g, i) => {
            const gy = padTop + plotH - (g / max) * plotH;
            return (
              <g key={i}>
                <line x1={axisW} x2={width} y1={gy} y2={gy} className={i === 0 ? 'viz-axis' : 'viz-grid'} />
                <text x={axisW - 6} y={gy + 3.5} textAnchor="end" className="tnum fill-[var(--fg-3)] text-[10px]">
                  {format(g)}
                </text>
              </g>
            );
          })}
          {data.map((d, i) => {
            const bx = axisW + i * slot + (slot - bw) / 2;
            let base = padTop + plotH;
            const last = d.values.reduce((acc, v, j) => (v > 0 ? j : acc), -1);
            return (
              <g key={d.key} onPointerEnter={() => setHover(i)} opacity={hover != null && hover !== i ? 0.55 : 1}>
                <rect x={axisW + i * slot} y={0} width={slot} height={padTop + plotH} fill="transparent" />
                <g className="bar-in" style={grow(padTop + plotH, i)}>
                {d.values.map((v, j) => {
                  const h = (v / max) * plotH;
                  if (h <= 0) return null;
                  const gap = j > 0 && base < padTop + plotH ? 2 : 0;
                  const top = base - h;
                  const hh = Math.max(0, h - gap);
                  const path = j === last ? roundedTop(bx, top, bw, hh, 4) : `M${bx},${top}h${bw}v${hh}h${-bw}Z`;
                  base = top;
                  return <path key={j} d={path} fill={series[j].color} />;
                })}
                </g>
              </g>
            );
          })}
          <XLabels labels={data.map((d) => d.label)} axisW={axisW} slot={slot} width={width} y={height - 3} />
        </svg>
      )}
      {hover != null && data[hover] && (
        <Tip x={axisW + hover * slot} width={width}>
          {series.map((sr, j) => (
            <div key={sr.label} className="tnum flex items-center gap-2 text-[12px] whitespace-nowrap">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: sr.color }} />
              <span className="font-semibold">{format(data[hover].values[j])}</span>
              <span className="text-fg-3">{sr.label}</span>
            </div>
          ))}
          <div className="mt-0.5 text-[11px] text-fg-3">{data[hover].label}</div>
        </Tip>
      )}
    </div>
  );
}

/** Per-core utilisation as one-hue cells (darker/brighter = busier), value on hover. */
export function CoreGrid({ cores }: { cores: number[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const cols = cores.length > 16 ? 16 : Math.max(4, cores.length);
  return (
    <div className="relative">
      <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {cores.map((c, i) => (
          <div
            key={i}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
            className="h-5 rounded-[4px] transition-colors duration-500"
            style={{ background: `color-mix(in srgb, var(--viz-1) ${Math.round(8 + c * 0.92)}%, var(--bg-2))` }}
            title={`CPU ${i}: ${c}%`}
          />
        ))}
      </div>
      {hover != null && (
        <div className="tnum mt-1 text-[11.5px] text-fg-2">
          CPU {hover}: <span className="font-semibold text-fg">{cores[hover]}%</span>
        </div>
      )}
    </div>
  );
}

export function useInterval(fn: () => void, ms: number, active = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => ref.current(), ms);
    return () => clearInterval(t);
  }, [ms, active]);
}
