// The welcome tour's pictures, drawn in water: Hydor is the Greek ὕδωρ. The sea under the tour's pages, its waves
// drifting slowly and rising a little with each step; where the tour stands, as a row of small dots; the welcome's
// short film of a request being done, played once; and what can do the work (Claude, ChatGPT's Codex, OpenRouter's
// models, this computer, other agents) as streams flowing into a pool around the Ω, which fills as more are picked.
// The motion is slow and quiet (styles.css, "the welcome tour"), and still for those who ask for less motion; the
// pictures are hidden from screen readers: the words beside them say the same.
import { useId, type CSSProperties, type ReactNode } from 'react';
import { Blocks, Check, Cloud, Cpu, FileText, Search } from 'lucide-react';
import { AgentIcon } from '../../components/AgentIcon';
import { cx } from '../../components/ui';
import { MARK_BOX, MARK_STROKE, OMEGA, TileGradient, WaterGradient } from '../../components/Logo';

/** What someone may use: the tour sets up those picked. */
export type Use = 'claude' | 'codex' | 'openrouter' | 'local' | 'agents';

// ---- the sea -----------------------------------------------------------------------------------------------

/** One wave's surface along y = 0, 1600 wide, and the water below. Its length divides 800, so moving it by its
 * length loops without a seam. */
const sea = (amp: number, len: number) => {
  let d = 'M0 0';
  for (let i = 0; i < Math.round(1600 / len); i++) d += ` q${+(len / 4).toFixed(2)} ${-amp} ${+(len / 2).toFixed(2)} 0 t${+(len / 2).toFixed(2)} 0`;
  return `${d} V400 H0 Z`;
};
const SEA_WAVES = [sea(22, 400), sea(15, 800 / 3), sea(10, 200)];

/**
 * The sea along the bottom of the tour's pages (and the sign-in screens): three layers of waves drifting slowly, a
 * soft light on the water above them, and its level, `level` from 0 (low) to 1 (high), rising a little as the tour
 * goes on.
 */
export function Sea({ level = 0, className }: { level?: number; className?: string }) {
  const id = useId();
  return (
    <div className={cx('tour-sea', className)} style={{ '--level': Math.max(0, Math.min(1, level)) } as CSSProperties} aria-hidden>
      <div className="tour-sea-glow" />
      <svg className="tour-sea-waves" viewBox="0 0 800 400" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--water-2)' }} />
            <stop offset="1" style={{ stopColor: 'var(--water-3)' }} />
          </linearGradient>
        </defs>
        {SEA_WAVES.map((d, i) => (
          <g key={i} transform={`translate(0 ${[96, 150, 204][i]})`}>
            <g className={`tour-wave tour-wave-${i + 1}`}>
              <path d={d} fill={`url(#${id}s)`} />
            </g>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ---- where the tour stands ---------------------------------------------------------------------------------

/** Where the tour stands: a small dot for each step, the one now drawn out a little longer. */
export function TourProgress({ at, total, className }: { at: number; total: number; className?: string }) {
  return (
    <div className={cx('tour-progress flex items-center gap-[5px]', className)} role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={at + 1} aria-label={`Step ${at + 1} of ${total}`}>
      {Array.from({ length: total }, (_, n) => (
        <span key={n} className={cx('tour-dot', n < at && 'tour-dot-past', n === at && 'tour-dot-now')} />
      ))}
    </div>
  );
}

// ---- the Ω, filling ------------------------------------------------------------------------------------

/** The water's surface in the Ω: a gentle wave, 1440 wide (its length, 180, loops when moved by it). */
const SURFACE = `M-360 0 ${'q45 -14 90 0 t90 0 '.repeat(8)}V600 H-360 Z`;

/** The water in an Ω at `level` (0 empty to 1 full), rising to it once, its surface moving slowly. */
function OmegaWater({ id, level }: { id: string; level: number }) {
  // The water's top in the mark's 512 units: 420 is empty, 84 full.
  const top = 420 - 336 * Math.max(0, Math.min(1, level));
  return (
    <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
      <g className="tour-mark-level" style={{ transform: `translateY(${top}px)` }}>
        <path className="tour-mark-surface" d={SURFACE} fill="#fff" />
      </g>
    </mask>
  );
}

/** The app's mark on its deep blue tile, the water in its Ω at `level` (0 empty to 1 full). */
export function TideMark({ size = 96, level = 1 }: { size?: number; level?: number }) {
  const id = useId();
  return (
    <span className="tour-mark relative inline-flex shrink-0" style={{ width: size, height: size }} aria-hidden>
      <svg width={size} height={size} viewBox="0 0 512 512" className="relative text-white">
        <defs>
          <TileGradient id={`${id}t`} />
          <WaterGradient id={`${id}w`} bright />
          <OmegaWater id={`${id}m`} level={level} />
        </defs>
        <rect x="4" y="4" width="504" height="504" rx="114" fill={`url(#${id}t)`} stroke="rgba(255,255,255,0.10)" strokeWidth="8" />
        <path d={OMEGA} fill="none" stroke="currentColor" strokeWidth={MARK_STROKE} opacity={0.22} />
        <path d={OMEGA} fill="none" stroke={`url(#${id}w)`} strokeWidth={MARK_STROKE} mask={`url(#${id}m)`} />
      </svg>
    </span>
  );
}

/** The Ω alone, without its tile, filling with water to `level`: in the pool the streams flow into. As wide as its box. */
function PoolMark({ level }: { level: number }) {
  const id = useId();
  return (
    <svg viewBox={MARK_BOX} className="tour-pool-mark block h-auto w-full" aria-hidden>
      <defs>
        <WaterGradient id={`${id}w`} />
        <OmegaWater id={`${id}m`} level={level} />
      </defs>
      <path d={OMEGA} fill="none" stroke="currentColor" strokeWidth={MARK_STROKE} className="tour-pool-dry" />
      <path d={OMEGA} fill="none" stroke={`url(#${id}w)`} strokeWidth={MARK_STROKE} mask={`url(#${id}m)`} />
    </svg>
  );
}

// ---- the welcome's film -----------------------------------------------------------------------------------

/** A request being done, once: you ask in your own words, the agent works step by step, the result is ready. */
export function WelcomeFilm() {
  const steps: [ReactNode, string][] = [
    [<FileText key="f" size={13} />, 'Opened report.pdf'],
    [<Search key="s" size={13} />, 'Read its 12 pages'],
    [<Check key="c" size={13} />, 'Wrote the summary'],
  ];
  return (
    <div className="tour-film relative w-full max-w-[340px]" aria-hidden>
      <div className="tour-film-ask ml-auto w-fit max-w-[88%] rounded-2xl rounded-br-md bg-white/90 px-3.5 py-2.5 text-[13px] leading-snug text-[#10233a] shadow-lg dark:bg-white/[0.94]">
        <span className="tour-film-type">Sum up the report in my Downloads folder</span>
      </div>
      <div className="tour-film-work mt-4 rounded-2xl border border-white/15 bg-[linear-gradient(160deg,#10263c,#0b1a2c)] p-3.5 text-[12.5px] text-white/90 shadow-xl">
        <div className="mb-2.5 flex items-center gap-2 text-[12px] font-medium text-white">
          <TideMark size={20} />
          <span>Your agent</span>
          <span className="tour-film-busy ml-auto text-[11px] text-[#7dd3fc]">Working…</span>
        </div>
        <div className="space-y-1.5">
          {steps.map(([icon, words], i) => (
            <div key={words} className="tour-film-step flex items-center gap-2" style={{ '--i': i } as CSSProperties}>
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white/10 text-[#7dd3fc]">{icon}</span>
              {words}
            </div>
          ))}
        </div>
        <div className="tour-film-done mt-3 flex items-center gap-2.5 rounded-xl bg-white/10 px-3 py-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#38bdf8]/25 text-[#bae6fd]">
            <FileText size={14} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] font-medium text-white">summary.md</span>
            <span className="block text-[11px] text-white/60">Ready for you</span>
          </span>
          <span className="rounded-md bg-white/15 px-2 py-0.5 text-[11px] text-white">Open</span>
        </div>
      </div>
    </div>
  );
}

// ---- what does the work: streams into the pool ---------------------------------------------------------------

const SOURCES: { id: Use; label: string; icon: ReactNode }[] = [
  { id: 'claude', label: 'Claude', icon: <AgentIcon agent="claude" size={16} /> },
  { id: 'codex', label: 'ChatGPT', icon: <AgentIcon agent="codex" size={16} /> },
  { id: 'openrouter', label: 'Any model', icon: <Cloud size={15} strokeWidth={1.75} /> },
  { id: 'local', label: 'This computer', icon: <Cpu size={15} strokeWidth={1.75} /> },
  { id: 'agents', label: 'Other agents', icon: <Blocks size={15} strokeWidth={1.75} /> },
];

/** The figure's drawing, in its own units: 360 wide, 300 high. */
const FIG = { w: 360, h: 300 };
/** Each source's row, its circle's centre and radius, and the pool's centre and radius. */
const rowY = (i: number) => 38 + i * 56;
const NODE = { x: 134, r: 17 };
const POOL = { x: 286, y: 150, r: 58 };

/** A stream from a source to the pool's edge: level from the source, curving in to meet the pool head-on. */
function stream(i: number): string {
  const y = rowY(i);
  const x0 = NODE.x + NODE.r + 7;
  // Where it meets the pool: spread a little up and down its near side.
  const ey = POOL.y + (y - POOL.y) * 0.32;
  const ex = POOL.x - Math.sqrt(POOL.r * POOL.r - (ey - POOL.y) ** 2) - 3;
  const k = (ex - x0) * 0.5;
  return `M${x0} ${y} C${(x0 + k).toFixed(1)} ${y} ${(ex - k * 0.7).toFixed(1)} ${ey.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
}

/**
 * What can do the work, as streams flowing into a pool around the Ω: each one picked runs with water and the Ω fills
 * as more are picked; those not picked stay as faint dry channels. `focus` is the one a step sets up, marked more
 * firmly.
 */
export function SourcesMap({ on, focus }: { on: Use[]; focus?: Use | Use[] }) {
  const focused = (u: Use) => (Array.isArray(focus) ? focus.includes(u) : focus === u);
  const level = on.length ? 0.3 + Math.min(1, on.length / 3) * 0.6 : 0.06;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <div className="tour-map relative w-full max-w-[360px]" style={{ aspectRatio: `${FIG.w} / ${FIG.h}` }} aria-hidden>
      <svg viewBox={`0 0 ${FIG.w} ${FIG.h}`} className="absolute inset-0 h-full w-full overflow-visible">
        <circle cx={POOL.x} cy={POOL.y} r={POOL.r + 16} className="tour-pool-ripple" />
        <circle cx={POOL.x} cy={POOL.y} r={POOL.r} className={cx('tour-pool', on.length > 0 && 'tour-pool-on')} />
        {SOURCES.map((s, i) => (
          <path key={s.id} d={stream(i)} className={cx('tour-stream', on.includes(s.id) && 'tour-stream-on', on.includes(s.id) && focused(s.id) && 'tour-stream-focus')} />
        ))}
      </svg>
      <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: pct(POOL.x, FIG.w), top: pct(POOL.y, FIG.h), width: pct(POOL.r * 1.5, FIG.w) }}>
        <PoolMark level={level} />
      </div>
      {SOURCES.map((s, i) => {
        const lit = on.includes(s.id);
        return (
          <div key={s.id} className="absolute flex -translate-y-1/2 items-center gap-2.5" style={{ right: pct(FIG.w - NODE.x - NODE.r, FIG.w), top: pct(rowY(i), FIG.h) }}>
            <span className={cx('tour-map-label text-[12.5px] whitespace-nowrap', lit ? 'text-fg' : 'text-fg-3')}>{s.label}</span>
            <span className={cx('tour-node', lit && 'tour-node-on', focused(s.id) && 'tour-node-focus')}>{s.icon}</span>
          </div>
        );
      })}
    </div>
  );
}
