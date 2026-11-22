// The report of a goal that is over: reached (every check with its proof and what it took), stopped at a limit, or stopped by
// you. Where things stood at the start and where they stand now, and the way to see the changes or dismiss it.
import { useContext, useState } from 'react';
import { Check, ChevronDown, ChevronRight, CircleAlert, Plus, Square } from 'lucide-react';
import { standing, tally, type GoalState } from '@shared/goals';
import { Button, cx } from '../../components/ui';
import { SessionCtx } from '../session/items';
import { AsksChip, RuleDialog, RulesRow } from './Bar';
import { useAct } from './state';
import { MoreDialog } from './MoreDialog';
import { say } from './Say';
import { cellText, giveMore, needsText, plural, reportLine, shortLabel, sinceTitle, startCellText } from './words';

export function Report({ g, rounds, onRounds, className }: { g: GoalState; rounds: boolean; onRounds: () => void; className?: string }) {
  const [run, busy] = useAct(g.key);
  const { openChanges } = useContext(SessionCtx);
  const [more, setMore] = useState(false);
  const [rule, setRule] = useState(false);
  const reached = g.status === 'reached';
  const t = tally(g);
  const start = g.rounds.find((r) => r.n === 0)?.results ?? [];
  const now = (reached && g.report?.final) || standing(g);
  const bestRound = g.best != null && g.best > 0 ? `round ${g.best}` : 'where they started';
  const head = reached ? 'Goal reached' : g.status === 'limit' ? 'Stopped at its limit' : 'Stopped by you';
  return (
    <div
      className={cx(
        'anim-pop overflow-hidden rounded-xl border bg-panel',
        reached ? 'border-ok/45' : g.status === 'limit' ? 'border-warn/45 shadow-[0_0_0_3px_color-mix(in_srgb,var(--warn)_10%,transparent)]' : 'border-line-2',
        className,
      )}
    >
      <div className={cx('flex flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-line px-4 py-2.5', reached ? 'bg-ok/8' : g.status === 'limit' ? 'bg-warn/8' : 'bg-bg-1')}>
        {reached ? <Check size={16} strokeWidth={2.5} className="shrink-0 text-ok" /> : g.status === 'limit' ? <CircleAlert size={16} className="shrink-0 text-warn" /> : <Square size={14} className="shrink-0 text-fg-3" />}
        <span className="text-[14px] font-semibold">{head}</span>
        <span className="ml-auto text-[12px] text-fg-3 tnum">{reportLine(g)}</span>
      </div>
      <div className="max-h-[min(60dvh,520px)] overflow-y-auto px-4 py-3 text-[13.5px]">
        {g.reason && !reached && (
          <p className="mb-1 font-medium">
            {g.reason}
          </p>
        )}
        {g.report?.summary && (
          <p className="leading-relaxed">
            {g.report.summary}
          </p>
        )}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[300px] text-left text-[12.5px]">
            <thead>
              <tr className="text-[11.5px] text-fg-3">
                <th className="py-1 pr-3 font-normal">Check</th>
                <th className="px-2 py-1 font-normal">At the start</th>
                <th className="px-2 py-1 font-normal">Now</th>
                <th className="py-1 pl-2 font-normal">Needs</th>
              </tr>
            </thead>
            <tbody>
              {g.contract.checks.map((c) => {
                const n = now.find((r) => r.id === c.id);
                const was = start.find((r) => r.id === c.id);
                return (
                  <tr key={c.id} className="border-t border-line/60">
                    <td translate="no" className="py-1.5 pr-3">
                      {shortLabel(c)}
                    </td>
                    <td title={sinceTitle(was)} className="px-2 py-1.5 text-fg-3">
                      {say(startCellText(c, was, n?.value))}
                    </td>
                    <td className={cx('px-2 py-1.5 font-medium', n?.holds ? 'text-ok' : 'text-fg')}>
                      {say(cellText(c, n, was?.since != null ? undefined : was?.value))}
                    </td>
                    <td className="py-1.5 pl-2 text-fg-3">
                      {say(needsText(c, was?.since != null ? undefined : was?.value, n?.value))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {g.report?.review && (
          <p className="mt-3 flex items-start gap-2 text-fg-2">
            <Check size={14} className="mt-0.5 shrink-0 text-ok" />
            <span translate="no">{g.report.review}</span>
          </p>
        )}
        <p className="mt-3 text-[12.5px] leading-snug text-fg-3">
          {reached ? `How it got there: ${plural(t.kept, 'round')} kept, ${t.undone} undone` : g.undo ? `The files stand at ${bestRound}, the best so far` : 'The files stand as the last round left them'}
        </p>
      </div>
      {/* At a limit the rules and how much it asks can still change: they count when it goes on. */}
      {g.status === 'limit' && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-line px-4 py-2.5">
          <AsksChip g={g} />
          <Button size="sm" variant="ghost" icon={<Plus size={13} />} onClick={() => setRule(true)}>
            Add a rule…
          </Button>
          <RulesRow g={g} className="ml-auto" />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
        <Button variant="primary" size="sm" onClick={() => openChanges?.()} disabled={!openChanges}>
          See the changes
        </Button>
        {giveMore(g) && (
          <Button size="sm" disabled={busy} onClick={() => setMore(true)}>
            Give it more…
          </Button>
        )}
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void run({ action: 'stop' })}>
          Dismiss
        </Button>
        {t.rounds > 0 && (
          <button type="button" onClick={onRounds} aria-expanded={rounds} className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg">
            {rounds ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            Rounds · {t.kept} kept · {t.undone} undone
          </button>
        )}
      </div>
      {rule && <RuleDialog g={g} open onClose={() => setRule(false)} />}
      {more && <MoreDialog g={g} open onClose={() => setMore(false)} />}
    </div>
  );
}
