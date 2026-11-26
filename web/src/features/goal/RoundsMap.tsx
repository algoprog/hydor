// The map of attempts: the rounds of a goal left to right by number — the start, the kept rounds joined as one line,
// each round that was not kept hanging below the one it started from, the round at work, and the goal at the right end.
// Another way from here shows as a line of its own leaving the earlier round. A tap on a round opens it under the map
// (Rounds.tsx). Where everything stands is map.ts's work; this draws it: buttons for the boxes, one SVG for the links.
// It scrolls inside its card, and starts at the latest round.
import { useLayoutEffect, useRef } from 'react';
import { Check, Circle, Target, Undo2, X } from 'lucide-react';
import { holding, type GoalRound, type GoalState } from '@shared/goals';
import { cx } from '../../components/ui';
import { BOX, boxAt, linkPath, linkPoints, mapLayout, mapSize, type MapLink, type MapNode } from './map';
import { fewWords, firstSentence, moveOf, roundBroke, shortWhy } from './words';

const BOX_CLS = 'absolute flex flex-col justify-center gap-px overflow-hidden rounded-[10px] border px-2 text-left';

const LINK_CLS: Record<MapLink['kind'], string> = {
  kept: 'stroke-ok [stroke-width:2]',
  dead: 'stroke-fg-3/70 [stroke-width:1.5] [stroke-dasharray:4_4]',
  working: 'stroke-accent [stroke-width:2]',
  goal: 'stroke-fg-3/70 [stroke-width:1.5] [stroke-dasharray:1.5_4] [stroke-linecap:round]',
};

/** Whether a round that was not kept broke something. One with no results (a round a limit cut short) broke nothing. */
const broken = (g: GoalState, r: GoalRound) => r.results.length > 0 && roundBroke(g, r);

/** A round's mark: a shape of its own for each way a round ends (as in the list), with its word for those who cannot see it. */
function Mark({ g, r }: { g: GoalState; r: GoalRound }) {
  if (r.n === 0) return null;
  return (
    <span className="ml-auto flex shrink-0">
      {r.outcome === 'kept' ? (
        <Check aria-hidden size={12} strokeWidth={3} className="text-ok" />
      ) : r.outcome === 'undone' && broken(g, r) ? (
        <X aria-hidden size={12} strokeWidth={2.5} className="text-err" />
      ) : r.outcome === 'undone' ? (
        <Undo2 aria-hidden size={12} className="text-fg-3" />
      ) : (
        <Circle aria-hidden size={10} className="text-fg-3" />
      )}
      <span className="sr-only">{r.outcome === 'kept' ? <>Kept</> : r.outcome === 'undone' ? <>Undone</> : <>Left as it is</>}</span>
    </span>
  );
}

function RoundBox({ g, r, node, open, onOpen }: { g: GoalState; r: GoalRound; node: MapNode; open: boolean; onOpen: () => void }) {
  const at = boxAt(node);
  const best = g.best === r.n && r.n > 0;
  const kept = r.outcome === 'kept' || r.n === 0;
  const tried = r.way || firstSentence(r.did);
  const move = kept && r.n > 0 ? moveOf(g, r) : undefined;
  const h = holding({ rounds: [r], best: r.n, contract: g.contract });
  return (
    <button
      type="button"
      data-round={r.n}
      aria-pressed={open}
      onClick={onOpen}
      style={{ left: at.x, top: at.y, width: BOX.w, height: BOX.h }}
      className={cx(
        BOX_CLS,
        'cursor-pointer hover:bg-bg-2',
        open ? 'bg-bg-2 ring-2 ring-accent/70' : 'bg-bg-1',
        best ? 'border-ok' : kept ? 'border-line-2' : 'border-dashed border-line-2',
      )}
    >
      <span className="flex w-full items-center gap-1.5 text-[12px] leading-4">
        {r.n === 0 ? (
          // "Start" the place, not the button: its own part for the translations.
          <span data-i18n="goalmap" className="font-semibold">
            Start
          </span>
        ) : (
          <>
            <span className="sr-only">Round {r.n}</span>
            <span aria-hidden className="font-semibold tnum">
              {r.n}
            </span>
          </>
        )}
        {best && <span className="truncate text-[10.5px] font-semibold text-ok">Best so far</span>}
        <Mark g={g} r={r} />
      </span>
      {r.n === 0 ? (
        <span className="w-full truncate text-[11.5px] leading-4 text-fg-2">Where things stand</span>
      ) : tried ? (
        <span translate="no" title={tried} className={cx('w-full truncate text-[11.5px] leading-4', kept ? 'text-fg-2' : 'text-fg-3')}>
          {fewWords(tried)}
        </span>
      ) : (
        <span className="w-full truncate text-[11.5px] leading-4 text-fg-3">A round</span>
      )}
      <span className="flex w-full min-w-0 gap-1 text-[11px] leading-4 text-fg-3 tnum">
        {r.n === 0 ? (
          <span className="truncate">
            {h.holds} of {h.of} hold
          </span>
        ) : !kept ? (
          <span className={cx('truncate', broken(g, r) && 'text-err')}>{shortWhy(g, r)}</span>
        ) : move ? (
          // The number is never cut: its name gives way.
          <>
            <span translate="no" className="min-w-0 truncate">
              {move.name}
            </span>
            <span translate="no" className="shrink-0 text-fg-2">
              {move.to}
            </span>
          </>
        ) : (
          <span className="truncate">
            {h.holds} of {h.of} hold
          </span>
        )}
      </span>
    </button>
  );
}

/** The round at work: no result yet, so nothing to open. */
function WorkingBox({ g, node }: { g: GoalState; node: MapNode }) {
  const at = boxAt(node);
  return (
    <div style={{ left: at.x, top: at.y, width: BOX.w, height: BOX.h }} className={cx(BOX_CLS, 'border-accent bg-accent/10')}>
      <span className="flex w-full items-center gap-1.5 text-[12px] leading-4">
        <span className="sr-only">Round {node.n}</span>
        <span aria-hidden className="font-semibold tnum">
          {node.n}
        </span>
        <span aria-hidden className="ml-auto h-2 w-2 shrink-0 rounded-full bg-accent" />
      </span>
      <span className="w-full truncate text-[11.5px] leading-4 text-fg">{g.status === 'checking' ? <>Running the checks</> : <>Working on it</>}</span>
      <span data-i18n="goal" className="w-full truncate text-[11px] leading-4 text-accent">
        {g.status === 'checking' ? <>Checking</> : <>Working</>}
      </span>
    </div>
  );
}

function GoalBox({ g, node }: { g: GoalState; node: MapNode }) {
  const at = boxAt(node);
  const h = holding(g);
  const reached = g.status === 'reached';
  return (
    <div style={{ left: at.x, top: at.y, width: BOX.w, height: BOX.h }} className={cx(BOX_CLS, reached ? 'border-ok bg-ok/10' : 'border-dashed border-fg-3')}>
      <span className="flex w-full items-center gap-1.5 text-[12px] leading-4">
        <Target aria-hidden size={12} className={cx('shrink-0', reached ? 'text-ok' : 'text-accent')} />
        {/* "Goal" the aim, not a football one: the goal's own part for the translations. */}
        <span data-i18n="goal" className="font-semibold">
          Goal
        </span>
        {reached && <Check aria-hidden size={12} strokeWidth={3} className="ml-auto shrink-0 text-ok" />}
      </span>
      <span className="w-full truncate text-[11.5px] leading-4 text-fg-2">
        {h.holds} of {h.of} hold
      </span>
    </div>
  );
}

/** What the lines mean: those the map has. */
function Legend({ kinds, className }: { kinds: Set<string>; className?: string }) {
  const line = (cls: string) => (
    <svg aria-hidden width="18" height="6" className="shrink-0">
      <line x1="1" y1="3" x2="17" y2="3" className={cls} />
    </svg>
  );
  return (
    <div data-i18n="goalmap" className={cx('flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-fg-3', className)}>
      {kinds.has('kept') && (
        <span className="inline-flex items-center gap-1.5">
          {line(LINK_CLS.kept)}
          <span>kept</span>
        </span>
      )}
      {(kinds.has('undone') || kinds.has('stays')) && (
        <span className="inline-flex items-center gap-1.5">
          {line(LINK_CLS.dead)}
          <span>{kinds.has('undone') ? <>undone</> : <>left as it is</>}</span>
        </span>
      )}
      {kinds.has('working') && (
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-2 rounded-full bg-accent" />
          <span>working</span>
        </span>
      )}
      <span className="inline-flex items-center gap-1.5">
        {line(LINK_CLS.goal)}
        <span>the goal</span>
      </span>
    </div>
  );
}

export function RoundsMap({ g, open, onOpen }: { g: GoalState; open: number | null; onOpen: (n: number | null) => void }) {
  const layout = mapLayout(g);
  const { width, height } = mapSize(layout);
  const scroller = useRef<HTMLDivElement>(null);
  const latest = layout.nodes.at(-2) ?? layout.nodes.at(-1);
  // At the latest round when it opens, and again when a round is added: never while you look further back. The right end
  // (the goal), and where lines of their own make the map taller than its room, the latest round's row in the middle.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollLeft = el.scrollWidth;
    if (latest) el.scrollTop = boxAt(latest).y + BOX.h / 2 - el.clientHeight / 2;
  }, [layout.cols]);
  const byN = new Map(g.rounds.map((r) => [r.n, r]));
  return (
    <div className="border-t border-line">
      <Legend kinds={new Set(layout.nodes.map((x) => x.kind))} className="px-4 pt-2" />
      <div ref={scroller} role="group" aria-label="Map of the rounds" className="relative max-h-[min(340px,36dvh)] overflow-auto overscroll-x-contain">
        <div className="relative" style={{ width, height }}>
          <svg aria-hidden width={width} height={height} className="absolute top-0 left-0 fill-none">
            {/* The dead ends first, so that a line that goes on is drawn over them where they leave the same round. */}
            {[...layout.links]
              .sort((a, b) => Number(a.kind !== 'dead') - Number(b.kind !== 'dead'))
              .map((k) => (
                <path key={k.to} d={linkPath(linkPoints(layout, k))} className={LINK_CLS[k.kind]} />
              ))}
          </svg>
          {layout.nodes.map((node) => {
            if (node.kind === 'working') return <WorkingBox key={node.n} g={g} node={node} />;
            if (node.kind === 'goal') return <GoalBox key="goal" g={g} node={node} />;
            const r = byN.get(node.n)!;
            return <RoundBox key={node.n} g={g} r={r} node={node} open={open === r.n} onOpen={() => onOpen(open === r.n ? null : r.n)} />;
          })}
        </div>
      </div>
    </div>
  );
}
