// The welcome tour's pictures, all water: Hydor is the Greek ὕδωρ. The sea under the tour's pages, still, rising a
// little with each step; the progress as droplets, full once passed; the welcome's short film of a request being
// done, played once; and the map of what can do the work (Claude, ChatGPT's Codex, OpenRouter's models, this
// computer, other agents), a line of water from each one picked to the Ω, which fills as it gets more. Little moves,
// and only once (styles.css, "the welcome tour"); they are hidden from screen readers: the words beside them say the
// same.
import { useId, type CSSProperties, type ReactNode } from 'react';
import { Blocks, Check, Cloud, Cpu, FileText, Search } from 'lucide-react';
import { AgentIcon } from '../../components/AgentIcon';
import { cx } from '../../components/ui';
import { MARK_STROKE, OMEGA, TileGradient, WaterGradient } from '../../components/Logo';

/** What someone may use: the tour sets up those picked. */
export type Use = 'claude' | 'codex' | 'openrouter' | 'local' | 'agents';

// ---- the sea -----------------------------------------------------------------------------------------------

/** One wave's surface along y = 0, 1600 wide, and the water below. Its length divides 800, so moving it by 800 loops. */
const sea = (amp: number, len: number) => {
  let d = 'M0 0';
  for (let i = 0; i < Math.round(1600 / len); i++) d += ` q${+(len / 4).toFixed(2)} ${-amp} ${+(len / 2).toFixed(2)} 0 t${+(len / 2).toFixed(2)} 0`;
  return `${d} V400 H0 Z`;
};
const SEA_WAVES = [sea(26, 400), sea(18, 800 / 3), sea(12, 200)];

/**
 * The sea along the bottom of the tour's pages (and the sign-in screens): three still layers of waves, a soft light on
 * the water above them, and its level, `level` from 0 (low) to 1 (high), rising a little as the tour goes on.
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
          <g key={i} transform={`translate(0 ${[90, 150, 210][i]})`}>
            <g className={`tour-wave tour-wave-${i + 1}`}>
              <path d={d} fill={`url(#${id}s)`} />
            </g>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ---- progress, as droplets ------------------------------------------------------------------------------

const DROP = 'M6 0.8C6 0.8 1.2 6.4 1.2 9.6A4.8 4.8 0 0 0 10.8 9.6C10.8 6.4 6 0.8 6 0.8Z';

/** Where the tour stands: a droplet for each step, full once passed, filling now, empty to come. */
export function TourProgress({ at, total, className }: { at: number; total: number; className?: string }) {
  const id = useId();
  return (
    <div className={cx('flex items-center gap-[5px]', className)} role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={at + 1} aria-label={`Step ${at + 1} of ${total}`}>
      {Array.from({ length: total }, (_, n) => (
        <svg key={n} viewBox="0 0 12 15" width="11" height="14" className={cx('tour-drop', n < at ? 'tour-drop-full' : n === at ? 'tour-drop-now' : 'tour-drop-empty')} aria-hidden>
          <defs>
            <clipPath id={`${id}${n}`}>
              <path d={DROP} />
            </clipPath>
          </defs>
          <path d={DROP} className="tour-drop-shell" />
          {n <= at && (
            <g clipPath={`url(#${id}${n})`}>
              <rect className="tour-drop-water" x="-2" y="0" width="16" height="16" />
            </g>
          )}
        </svg>
      ))}
    </div>
  );
}

// ---- the Ω, filling ------------------------------------------------------------------------------------

/** The app's mark on its deep blue tile, the water in its Ω at `level` (0 empty to 1 full), rising to it once. */
export function TideMark({ size = 96, level = 1 }: { size?: number; level?: number }) {
  const id = useId();
  // The water's top in the mark's 512 units: 420 is empty, 84 full.
  const top = 420 - 336 * Math.max(0, Math.min(1, level));
  return (
    <span className="tour-mark relative inline-flex shrink-0" style={{ width: size, height: size }} aria-hidden>
      <svg width={size} height={size} viewBox="0 0 512 512" className="relative text-white">
        <defs>
          <TileGradient id={`${id}t`} />
          <WaterGradient id={`${id}w`} bright />
          <mask id={`${id}m`} maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
            <g className="tour-mark-level" style={{ transform: `translateY(${top}px)` }}>
              <path className="tour-mark-flow" d="M-360 0 q45 -18 90 0 t90 0 t90 0 t90 0 t90 0 t90 0 t90 0 t90 0 t90 0 t90 0 t90 0 t90 0 V600 H-360 Z" fill="#fff" />
            </g>
          </mask>
        </defs>
        <rect x="4" y="4" width="504" height="504" rx="114" fill={`url(#${id}t)`} stroke="rgba(255,255,255,0.10)" strokeWidth="8" />
        <path d={OMEGA} fill="none" stroke="currentColor" strokeWidth={MARK_STROKE} opacity={0.22} />
        <path d={OMEGA} fill="none" stroke={`url(#${id}w)`} strokeWidth={MARK_STROKE} mask={`url(#${id}m)`} />
      </svg>
    </span>
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

// ---- the map of what does the work -------------------------------------------------------------------------

const NODES: { id: Use; label: string; icon: ReactNode; angle: number }[] = [
  { id: 'claude', label: 'Claude', icon: <AgentIcon agent="claude" size={20} />, angle: -90 },
  { id: 'codex', label: 'ChatGPT', icon: <AgentIcon agent="codex" size={20} />, angle: -18 },
  { id: 'openrouter', label: 'Any model', icon: <Cloud size={19} />, angle: 54 },
  { id: 'local', label: 'This computer', icon: <Cpu size={19} />, angle: 126 },
  { id: 'agents', label: 'Other agents', icon: <Blocks size={19} />, angle: 198 },
];

/**
 * What can do the work, around the Ω: each one picked lights up with a line of water to the Ω, which fills as more
 * are picked; `focus` is the one a step sets up, marked more firmly.
 */
export function SourcesMap({ on, focus, compact }: { on: Use[]; focus?: Use | Use[]; compact?: boolean }) {
  const focused = (u: Use) => (Array.isArray(focus) ? focus.includes(u) : focus === u);
  const R = 37;
  return (
    <div className={cx('tour-map relative aspect-square w-full', compact ? 'max-w-[220px]' : 'max-w-[360px]')} aria-hidden>
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full overflow-visible">
        {NODES.map((n) => {
          const a = (n.angle * Math.PI) / 180;
          const x = 50 + Math.cos(a) * R;
          const y = 50 + Math.sin(a) * R;
          const lit = on.includes(n.id);
          return (
            <g key={n.id}>
              <line x1={x} y1={y} x2={50} y2={50} className="tour-map-pipe" />
              {lit && <line x1={x} y1={y} x2={50} y2={50} className="tour-map-flow" />}
            </g>
          );
        })}
      </svg>
      <div className="tour-map-center absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <TideMark size={compact ? 58 : 92} level={on.length ? 0.35 + Math.min(1, on.length / 3) * 0.6 : 0.08} />
      </div>
      {NODES.map((n) => {
        const a = (n.angle * Math.PI) / 180;
        const lit = on.includes(n.id);
        const big = focused(n.id);
        return (
          <div key={n.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${50 + Math.cos(a) * R}%`, top: `${50 + Math.sin(a) * R}%` }}>
            <div className={cx('tour-node', lit && 'tour-node-on', big && 'tour-node-focus', compact && 'tour-node-small')}>
              <span className="relative">{n.icon}</span>
            </div>
            {!compact && <div className={cx('tour-map-label mt-1.5 text-center text-[11px] font-medium whitespace-nowrap', lit ? 'text-fg' : 'text-fg-3')}>{n.label}</div>}
          </div>
        );
      })}
    </div>
  );
}
