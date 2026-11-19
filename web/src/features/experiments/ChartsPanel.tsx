// A run's or several runs' metrics over steps, one chart each, in sections (dev, train, Metrics, Other…): a toolbar
// to find a metric, smooth the curves and choose what the x axis is, a log scale and leaving out outliers (kept on this
// device), cards that draw their chart only once they come near the screen (an experiment can have a hundred
// metrics), and a bigger view of one with its numbers.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Maximize2, Search, SlidersHorizontal } from 'lucide-react';
import { betterOf, type MetricSeries } from '@shared/experiments';
import { Dialog, IconButton, MenuItem, MenuLabel, MenuSep, Popover, cx, useIsMobile } from '../../components/ui';
import { alongX, sectionsOf, xChoices } from './analysis';
import { num } from './api';
import { LineChart, type ChartView, type LineSeries } from './Charts';

/** A run as ChartsPanel draws it. */
export interface PanelRun {
  /** runKey */
  key: string;
  label: string;
  color: string;
  /** Its metrics over steps; undefined while they load. */
  series: MetricSeries | undefined;
  /** What the run said about which way is better (RunRecord.better). */
  better?: Record<string, 'max' | 'min'>;
  last?: Record<string, number>;
  best?: Record<string, number>;
}

const OPTIONS_KEY = 'hydor.experiments.charts';
const SECTIONS_KEY = 'hydor.experiments.sections';

interface Options extends ChartView {
  /** The metric along the x axis; '' is the step. */
  x: string;
}

function readOptions(): Options {
  const d: Options = { smoothing: 0, logY: false, outliers: false, x: '' };
  try {
    const o = JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? '{}');
    if (typeof o?.smoothing === 'number' && o.smoothing >= 0 && o.smoothing <= 0.99) d.smoothing = o.smoothing;
    if (typeof o?.logY === 'boolean') d.logY = o.logY;
    if (typeof o?.outliers === 'boolean') d.outliers = o.outliers;
    if (typeof o?.x === 'string') d.x = o.x;
  } catch {}
  return d;
}

/** Up to this many charts show in one grid, without sections. */
const FLAT = 6;

/** The sections opened or folded against their default (ids). */
function readToggled(): Set<string> {
  try {
    const a = JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? '[]');
    return new Set(Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Whether an element has come near the screen (once it has, it stays so). */
function useNear<T extends HTMLElement>(margin = 400): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = ref.current;
    if (near || !el) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setNear(true), { rootMargin: `${margin}px` });
    io.observe(el);
    return () => io.disconnect();
  }, [near, margin]);
  return [ref, near];
}

const CARD_H = 170;

/** The lines of a metric: each run that has it, along the x metric when there is one. */
function seriesFor(runs: PanelRun[], metric: string, x: string): LineSeries[] {
  const out: LineSeries[] = [];
  for (const r of runs) {
    const pts = r.series?.[metric];
    if (!pts?.length) continue;
    out.push({ key: r.key, label: r.label, color: r.color, points: x ? alongX(pts, r.series?.[x] ?? []) : pts });
  }
  return out;
}

function MetricCard({ metric, runs, x, view, better, single, ring, onBigger, cardRef }: { metric: string; runs: PanelRun[]; x: string; view: ChartView; better: 'min' | 'max'; single: boolean; ring: boolean; onBigger: () => void; cardRef: (el: HTMLDivElement | null) => void }) {
  const [box, seen] = useNear<HTMLDivElement>();
  const series = seriesFor(runs, metric, x);
  const only = single ? runs.find((r) => r.series?.[metric]?.length) : undefined;
  const pts = only?.series?.[metric] ?? [];
  const ys = pts.map((p) => p[1]).filter(Number.isFinite);
  const last = only ? (pts.length ? pts[pts.length - 1][1] : only.last?.[metric]) : undefined;
  const bestV = only ? (only.best?.[metric] ?? (ys.length ? (better === 'min' ? Math.min(...ys) : Math.max(...ys)) : undefined)) : undefined;
  return (
    <div
      ref={(el) => {
        box.current = el;
        cardRef(el);
      }}
      className={cx('rounded-xl border bg-panel px-3 pt-2 pb-1 transition-shadow', ring ? 'border-accent ring-2 ring-accent' : 'border-line')}
    >
      <div className="mb-1 flex items-center gap-2">
        <div translate="no" title={metric} className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg-2">
          {metric}
        </div>
        {last !== undefined && <span className="tnum shrink-0 text-[13px] font-semibold">{num(last)}</span>}
        {last !== undefined && bestV !== undefined && num(bestV) !== num(last) && <span className="tnum shrink-0 text-[11.5px] text-fg-3">{`best ${num(bestV)}`}</span>}
        <IconButton label="Bigger" size="sm" onClick={onBigger} className="-mr-1.5">
          <Maximize2 size={13} />
        </IconButton>
      </div>
      {seen ? <LineChart series={series} height={CARD_H} view={view} better={better} xLabel={x || undefined} zoom /> : <div style={{ height: CARD_H }} />}
    </div>
  );
}

/** One run's numbers for a metric: the last, the best, the lowest and the highest. */
function statsOf(r: PanelRun, metric: string, dir: 'min' | 'max') {
  const ys = (r.series?.[metric] ?? []).map((p) => p[1]).filter(Number.isFinite);
  if (!ys.length) return null;
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  return { run: r, last: ys[ys.length - 1], best: r.best?.[metric] ?? (dir === 'min' ? min : max), min, max };
}

/**
 * Every metric the runs have over steps, a chart each, in sections (sectionsOf), with a toolbar: Find a metric,
 * Smoothing, and Chart options (X axis, Log scale, Ignore outliers), kept on this device.
 */
export function ChartsPanel({ runs, single, focus, empty, toolbarEnd }: { runs: PanelRun[]; single?: boolean; focus?: string | null; empty?: ReactNode; toolbarEnd?: ReactNode }) {
  const mobile = useIsMobile();
  const [opts, setOpts] = useState(readOptions);
  const [toggled, setToggled] = useState(readToggled);
  const [find, setFind] = useState('');
  const [menu, setMenu] = useState(false);
  const [big, setBig] = useState<string | null>(null);
  const [ring, setRing] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const cards = useRef(new Map<string, HTMLDivElement>());
  const ringTimer = useRef<number | undefined>(undefined);

  const change = (o: Partial<Options>) =>
    setOpts((p) => {
      const n = { ...p, ...o };
      try {
        localStorage.setItem(OPTIONS_KEY, JSON.stringify(n));
      } catch {}
      return n;
    });
  const toggle = (id: string) =>
    setToggled((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      try {
        localStorage.setItem(SECTIONS_KEY, JSON.stringify([...n]));
      } catch {}
      return n;
    });

  const xs = useMemo(() => xChoices(runs.map((r) => r.series)), [runs]);
  const x = xs.includes(opts.x) ? opts.x : '';
  const view = useMemo<ChartView>(() => ({ smoothing: opts.smoothing, logY: opts.logY, outliers: opts.outliers }), [opts.smoothing, opts.logY, opts.outliers]);
  const betterTold = useMemo(() => Object.assign({}, ...runs.map((r) => r.better ?? {})) as Record<string, 'max' | 'min'>, [runs]);

  // Every metric with two points or more in some run (the x metric is the axis, not a chart).
  const metrics = useMemo(() => {
    const seen = new Set<string>();
    for (const r of runs) for (const [k, pts] of Object.entries(r.series ?? {})) if (pts.length >= 2 && k !== x) seen.add(k);
    return [...seen];
  }, [runs, x]);
  const sections = useMemo(() => sectionsOf(metrics), [metrics]);
  const q = find.trim().toLowerCase();
  const shown = useMemo(() => {
    const list = sections.map((s) => ({ ...s, metrics: q ? s.metrics.filter((m) => m.toLowerCase().includes(q)) : s.metrics })).filter((s) => s.metrics.length);
    // Six charts or fewer read best in one grid, in the sections' order: headings over one chart each only take room.
    if (metrics.length > FLAT || list.length < 2) return list;
    return [{ id: 'all', label: '', own: false, metrics: list.flatMap((s) => s.metrics), folded: false }];
  }, [sections, q, metrics.length]);

  // A metric asked for (a tile on the run's page): its section opens, its card scrolls into view and shows a ring.
  useEffect(() => {
    if (!focus) return;
    setFind('');
    const s = sectionsOf(metrics).find((sec) => sec.metrics.includes(focus));
    if (s)
      setToggled((p) => {
        // Folded now (its default against what was toggled)? Toggle it open.
        if (s.folded === p.has(s.id)) return p;
        const n = new Set(p);
        if (n.has(s.id)) n.delete(s.id);
        else n.add(s.id);
        try {
          localStorage.setItem(SECTIONS_KEY, JSON.stringify([...n]));
        } catch {}
        return n;
      });
    setPending(focus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);
  useEffect(() => {
    if (!pending) return;
    const el = cards.current.get(pending);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setRing(pending);
    setPending(null);
    window.clearTimeout(ringTimer.current);
    ringTimer.current = window.setTimeout(() => setRing(null), 1600);
  });
  useEffect(() => () => window.clearTimeout(ringTimer.current), []);

  const slider = (
    <>
      <input type="range" min={0} max={0.99} step={0.01} value={opts.smoothing} onChange={(e) => change({ smoothing: Number(e.target.value) })} aria-label="Smoothing" className="w-28 accent-[var(--accent)]" />
      <span className="tnum w-8 text-[12px] text-fg-3">{opts.smoothing.toFixed(2)}</span>
    </>
  );
  const loading = !metrics.length && runs.some((r) => r.series === undefined);
  const bigRuns = big ? runs.map((r) => statsOf(r, big, betterOf(big, betterTold))).filter((s): s is NonNullable<typeof s> => !!s) : [];
  const bigDir = big ? betterOf(big, betterTold) : 'max';
  bigRuns.sort((a, b) => (bigDir === 'min' ? a.best - b.best : b.best - a.best));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {metrics.length > 0 && (
          <>
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3" />
              <input
                value={find}
                onChange={(e) => setFind(e.target.value)}
                placeholder="Find a metric"
                className="h-8 w-52 max-w-full rounded-lg border border-line-2 bg-bg-1 pr-2.5 pl-8 text-[13px] outline-none placeholder:text-fg-3 focus:border-accent/60"
              />
            </div>
            {!mobile && (
              <label className="flex items-center gap-2 text-[12px] text-fg-3">
                Smoothing
                {slider}
              </label>
            )}
            <IconButton ref={menuBtn} label="Chart options" active={menu} onClick={() => setMenu((o) => !o)}>
              <SlidersHorizontal size={15} />
            </IconButton>
            <Popover anchor={menuBtn} open={menu} onClose={() => setMenu(false)} width={260} title="Chart options" align="start">
              <MenuLabel>X axis</MenuLabel>
              <MenuItem checked={x === ''} onClick={() => change({ x: '' })}>
                Step
              </MenuItem>
              {xs.map((k) => (
                <MenuItem key={k} checked={x === k} onClick={() => change({ x: k })}>
                  <span translate="no">{k}</span>
                </MenuItem>
              ))}
              <MenuSep />
              <MenuItem checked={opts.logY} onClick={() => change({ logY: !opts.logY })}>
                Log scale
              </MenuItem>
              <MenuItem checked={opts.outliers} onClick={() => change({ outliers: !opts.outliers })}>
                Ignore outliers
              </MenuItem>
              {mobile && (
                <>
                  <MenuSep />
                  <label className="flex items-center gap-3 px-2.5 py-2 text-[13px]">
                    Smoothing
                    <span className="ml-auto flex items-center gap-2">{slider}</span>
                  </label>
                </>
              )}
            </Popover>
          </>
        )}
        {toolbarEnd}
      </div>

      {loading ? (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr))]">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-line bg-panel px-3 pt-2 pb-1">
              <div className="mb-1 h-[22px]" />
              <div className="animate-pulse rounded-md bg-bg-2/60" style={{ height: CARD_H }} />
            </div>
          ))}
        </div>
      ) : !metrics.length ? (
        <div className="py-10 text-center text-[13px] text-fg-3">{empty ?? 'No metrics over steps yet.'}</div>
      ) : !shown.length ? (
        <div className="py-10 text-center text-[13px] text-fg-3">No metric matches.</div>
      ) : (
        <div className="space-y-5">
          {shown.map((s) => {
            // Searching shows every match, folded or not.
            const folded = !q && s.folded !== toggled.has(s.id);
            return (
              <section key={s.id}>
                {s.id !== 'all' && (
                  <button type="button" onClick={() => toggle(s.id)} aria-expanded={!folded} className="mb-2 flex min-h-8 items-center gap-1 text-[12.5px] font-semibold text-fg-2 hover:text-fg">
                    {folded ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    {s.own ? <span translate="no">{s.label}</span> : s.label}
                    <span className="tnum font-normal text-fg-3">{s.metrics.length}</span>
                  </button>
                )}
                {!folded && (
                  <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr))]">
                    {s.metrics.map((m) => (
                      <MetricCard
                        key={m}
                        metric={m}
                        runs={runs}
                        x={x}
                        view={view}
                        better={betterOf(m, betterTold)}
                        single={!!single}
                        ring={ring === m}
                        onBigger={() => setBig(m)}
                        cardRef={(el) => {
                          if (el) cards.current.set(m, el);
                          else cards.current.delete(m);
                        }}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <Dialog open={big !== null} onClose={() => setBig(null)} width={1000} part="experiments" title={<span translate="no">{big}</span>}>
        {big && (
          <div>
            <LineChart series={seriesFor(runs, big, x)} height={420} view={view} better={bigDir} xLabel={x || undefined} zoom />
            {bigRuns.length > 0 && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-[12.5px] whitespace-nowrap">
                  <thead>
                    <tr className="text-left text-[11.5px] text-fg-3">
                      <th className="py-1 pr-3 font-normal">Run</th>
                      {['Last', 'Best', 'Min', 'Max'].map((h) => (
                        <th key={h} className="px-2 py-1 text-right font-normal">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bigRuns.map((s) => (
                      <tr key={s.run.key} className="border-t border-line">
                        <td className="max-w-[360px] py-1.5 pr-3">
                          <span className="flex items-center gap-2">
                            <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: s.run.color }} />
                            <span translate="no" className="truncate">
                              {s.run.label}
                            </span>
                          </span>
                        </td>
                        {[s.last, s.best, s.min, s.max].map((v, i) => (
                          <td key={i} className="tnum px-2 py-1.5 text-right">
                            {num(v)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
