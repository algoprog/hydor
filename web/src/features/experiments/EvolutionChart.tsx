// An evolution's chart: every try's score against its number (a first, quick score lighter than one checked with all
// seeds), failed tries as marks along the bottom, the best so far as a stepped line and the start as a dashed one.
// Each kind is one path, so thousands of tries stay smooth; a tap picks the nearest try, and the pointer says which
// one it is over (the list under it has all of it).
import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { trIn } from '../../i18n/runtime';
import { num } from './api';
import type { ChartData, ChartPoint } from './evolveWords';

const HEIGHT = 200;
const AXIS_W = 48;
const PAD = { top: 10, right: 12 };
/** Under the plot: the failed marks, then the numbers of the tries. */
const FAILED_H = 12;
const AXIS_H = 18;
const PLOT_H = HEIGHT - PAD.top - FAILED_H - AXIS_H;

/** Round numbers for an axis, about three of them inside lo…hi. */
function ticks(lo: number, hi: number, whole = false): number[] {
  // The tries' numbers have room for one more than the scores do.
  const raw = (hi - lo) / (whole ? 4 : 3);
  const mag = 10 ** Math.floor(Math.log10(raw));
  let step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw) ?? raw;
  if (whole) step = Math.max(1, Math.round(step));
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9 && out.length < 8; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

const dot = (x: number, y: number, r: number) => `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
/** A point off the axis: a small triangle at its edge, pointing the way it lies. */
const off = (x: number, y: number, up: boolean) => `M${(x - 3).toFixed(1)} ${(y + (up ? 3 : -3)).toFixed(1)}l3 ${up ? -6 : 6}l3 ${up ? 6 : -6}z`;

interface Placed {
  n: number;
  id: string;
  x: number;
  y: number;
  /** What the readout says of it. */
  say: string;
}

export const EvolutionChart = memo(function EvolutionChart({ data, onPick }: { data: ChartData; onPick: (id: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const drawn = useMemo(() => {
    const { lo, hi, start, steps, points, failed } = data;
    const plotW = Math.max(0, width - AXIS_W - PAD.right);
    // At least ten places, so the first tries do not sit at the two ends.
    const last = Math.max(10, data.last);
    const x = (n: number) => AXIS_W + ((n - 0.5) / last) * plotW;
    const y = (v: number) => PAD.top + PLOT_H - ((v - lo) / (hi - lo)) * PLOT_H;
    const r = last <= 80 ? 3.5 : last <= 300 ? 2.5 : 1.8;
    const placed: Placed[] = [];
    let full = '';
    let quick = '';
    let out = '';
    const place = (p: ChartPoint) => {
      const px = x(p.n);
      const outside = p.value > hi || p.value < lo;
      const py = y(Math.min(hi, Math.max(lo, p.value)));
      placed.push({ n: p.n, id: p.id, x: px, y: py, say: `#${p.n} · ${num(p.value)}` });
      if (outside) out += off(px, py, p.value > hi);
      else if (p.full) full += dot(px, py, r);
      else quick += dot(px, py, r);
    };
    points.forEach(place);
    const base = PAD.top + PLOT_H;
    let marks = '';
    for (const f of failed) {
      marks += `M${x(f.n).toFixed(1)} ${base + 3}v7`;
      placed.push({ n: f.n, id: f.id, x: x(f.n), y: base + 7, say: `#${f.n} · failed` });
    }
    let line = '';
    if (steps.length && start !== undefined) {
      line = `M${AXIS_W} ${y(start).toFixed(1)}`;
      for (const s of steps.slice(1)) line += `H${x(s.n).toFixed(1)}V${y(s.value).toFixed(1)}`;
      if (data.last > 0) line += `H${x(data.last).toFixed(1)}`;
    }
    return { x, y, last, placed, full, quick, out, marks, line, r };
  }, [data, width]);

  const base = PAD.top + PLOT_H;
  const kinds = {
    full: data.points.some((p) => p.full),
    quick: data.points.some((p) => !p.full),
    failed: data.failed.length > 0,
    best: data.steps.length > 1,
    off: drawn.out !== '',
  };

  return (
    <div className="rounded-xl border border-line bg-panel px-2 pt-2 pb-2">
      <div ref={box} style={{ height: HEIGHT }} className="relative">
        {width > 0 && (
          <svg width="100%" height={HEIGHT} role="img" aria-label="Every try’s score, in the order they were tried">
            {ticks(data.lo, data.hi).map((t) => (
              <g key={t}>
                <line x1={AXIS_W} x2={width - PAD.right} y1={drawn.y(t)} y2={drawn.y(t)} stroke="var(--line)" strokeWidth={1} />
                <text x={AXIS_W - 6} y={drawn.y(t) + 3.5} textAnchor="end" className="tnum fill-[var(--fg-3)] text-[10px]">
                  {num(t)}
                </text>
              </g>
            ))}
            <line x1={AXIS_W} x2={width - PAD.right} y1={base} y2={base} stroke="var(--line)" strokeWidth={1} />
            {data.start !== undefined && <line x1={AXIS_W} x2={width - PAD.right} y1={drawn.y(data.start)} y2={drawn.y(data.start)} stroke="var(--fg-3)" strokeWidth={1.5} strokeDasharray="5 4" />}
            <path d={drawn.quick} fill="var(--viz-1)" fillOpacity={0.32} />
            <path d={drawn.full} fill="var(--viz-1)" />
            <path d={drawn.out} fill="var(--viz-1)" fillOpacity={0.55} />
            {kinds.best && <path d={drawn.line} fill="none" stroke="var(--viz-3)" strokeWidth={2} strokeLinejoin="round" />}
            <path d={drawn.marks} stroke="var(--err)" strokeWidth={Math.max(1, drawn.r - 1)} strokeLinecap="round" />
            {[1, ...ticks(1, drawn.last, true).filter((t) => t > 1 && drawn.x(t) - drawn.x(1) > 28)].map((t) => (
              <text key={t} x={drawn.x(t)} y={HEIGHT - 4} textAnchor="middle" className="tnum fill-[var(--fg-3)] text-[10px]">
                {t}
              </text>
            ))}
          </svg>
        )}
        {width > 0 && <Pointer placed={drawn.placed} width={width} onPick={onPick} />}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 pt-1 text-[11.5px] text-fg-3">
        {kinds.full && <Key mark={<span className="h-2 w-2 rounded-full bg-[var(--viz-1)]" />}>All seeds</Key>}
        {kinds.quick && <Key mark={<span className="h-2 w-2 rounded-full bg-[var(--viz-1)] opacity-35" />}>First seed only</Key>}
        {kinds.failed && <Key mark={<span className="h-2.5 w-[2px] rounded bg-err" />}>Failed</Key>}
        {kinds.off && <Key mark={<span className="border-x-4 border-b-[7px] border-x-transparent border-b-[var(--viz-1)] opacity-60" />}>Off the chart</Key>}
        {kinds.best && <Key mark={<span className="h-[2px] w-4 rounded bg-[var(--viz-3)]" />}>Best so far</Key>}
        {data.start !== undefined && <Key mark={<span className="w-4 border-t-2 border-dashed border-fg-3" />}>{trIn('evolve', 'Start')}</Key>}
      </div>
    </div>
  );
});

function Key({ mark, children }: { mark: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className="flex w-4 justify-center">
        {mark}
      </span>
      <span>{children}</span>
    </span>
  );
}

/** Which try the pointer is over: drawn on its own, so the chart itself is not drawn again as it moves. */
function Pointer({ placed, width, onPick }: { placed: Placed[]; width: number; onPick: (id: string) => void }) {
  const [over, setOver] = useState<Placed | null>(null);
  const nearest = (e: React.PointerEvent | React.MouseEvent) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left;
    const py = e.clientY - box.top;
    let found: Placed | null = null;
    let best = 22 * 22;
    for (const p of placed) {
      const d = (p.x - px) ** 2 + (p.y - py) ** 2;
      if (d < best) {
        best = d;
        found = p;
      }
    }
    return found;
  };
  return (
    <div
      aria-hidden
      className="absolute inset-0"
      style={{ cursor: over ? 'pointer' : 'default' }}
      onPointerMove={(e) => e.pointerType === 'mouse' && setOver(nearest(e))}
      onPointerLeave={() => setOver(null)}
      onClick={(e) => {
        const p = nearest(e);
        if (p) onPick(p.id);
      }}
    >
      {over && (
        <>
          <span className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-fg" style={{ left: over.x, top: over.y }} />
          <span
            className="tnum pointer-events-none absolute -translate-x-1/2 rounded-md border border-line bg-elevated px-1.5 py-0.5 text-[11px] whitespace-nowrap text-fg shadow-sm"
            style={{ left: Math.min(width - 50, Math.max(50, over.x)), top: Math.max(0, over.y - 28) }}
          >
            {over.say}
          </span>
        </>
      )}
    </div>
  );
}
