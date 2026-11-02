// A run's steps as its page shows them: how each went, how long it took and what it cost, why it did not
// finish, and each agent step's session; once it has ended, Run again from here on each step (the steps
// before it give what they gave this time). The builder changes them (StepsEditor.tsx).
import { useState } from 'react';
import { ChevronRight, MessageSquareText, RotateCcw } from 'lucide-react';
import type { RunStepView } from '@shared/apps';
import { openSession } from '../../lib/nav';
import { cx, Throbber } from '../../components/ui';
import { useSessionShow } from '../session/show';
import { money } from './api';

const DOT: Record<RunStepView['status'], string> = { done: 'bg-ok', failed: 'bg-err', skipped: 'bg-line', stopped: 'bg-fg-3', running: '', waiting: 'bg-warn' };
const SAID: Record<RunStepView['status'], string> = { done: 'Done', failed: 'Did not finish', skipped: 'Skipped', stopped: 'Stopped', running: 'Working', waiting: 'Needs you' };

/** How long a step took, from a second up. */
const took = (s: RunStepView) => (s.startedAt && s.endedAt && s.endedAt - s.startedAt >= 1000 ? `${Math.round((s.endedAt - s.startedAt) / 1000)} s` : '');

/** A run's steps: each with how it went, what it cost, why it did not finish, and its session; `onAgain` runs it again from one. */
export function RunSteps({ steps, onAgain }: { steps: RunStepView[]; onAgain?: (step: string) => void }) {
  const [open, setOpen] = useState(true);
  const shown = steps.filter((s) => s.kind !== 'round');
  if (!shown.length) return null;
  return (
    <section className="rounded-2xl border border-line bg-panel px-4 pt-3 pb-3">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 text-left">
        <ChevronRight size={15} className={cx('shrink-0 text-fg-3 transition-transform', open && 'rotate-90')} />
        <h3 className="flex-1 text-[13.5px] font-semibold">Steps</h3>
        <span className="text-[12px] text-fg-3">{shown.filter((s) => s.status === 'done').length} of {shown.length} done</span>
      </button>
      {open && (
        <ol className="mt-2 space-y-2">
          {shown.map((s) => (
            <li key={s.path} className={cx('flex items-start gap-2.5', s.path.includes('/') && 'pl-5')}>
              <span className="mt-[5px] flex h-2.5 w-2.5 shrink-0 items-center justify-center">{s.status === 'running' ? <Throbber size={11} /> : <span className={cx('h-2.5 w-2.5 rounded-full', DOT[s.status])} />}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[13.5px]" translate="no">
                    {s.title}
                  </span>
                  {s.path.includes('#') && (
                    <span className="font-mono text-[11.5px] text-fg-3" translate="no">
                      {s.path.split('/').slice(0, -1).join(' › ')}
                    </span>
                  )}
                  <span className={cx('text-[12px]', s.rescued && s.status === 'done' ? 'text-warn' : 'text-fg-3')}>{s.reused ? 'From the last run' : s.rescued && s.status !== 'failed' ? (s.status === 'done' ? 'An agent did its work' : 'An agent is doing its work') : SAID[s.status]}</span>
                  {took(s) && <span className="text-[12px] text-fg-3">{took(s)}</span>}
                  {!!s.costUsd && <span className="text-[12px] text-fg-3">{money(s.costUsd)}</span>}
                </div>
                {s.error && s.status !== 'skipped' && (
                  <div className={cx('mt-0.5 text-[12.5px] break-words', s.rescued && s.status !== 'failed' ? 'text-fg-3' : 'text-err')}>
                    {s.rescued && s.status !== 'failed' && <span>It failed: </span>}
                    <span>{s.error}</span>
                  </div>
                )}
              </div>
              {onAgain && !/[/#]/.test(s.path) && (
                <button type="button" title="Run again from here" aria-label="Run again from here" className="shrink-0 rounded-md p-1 text-fg-3 hover:bg-bg-2 hover:text-fg" onClick={() => onAgain(s.id)}>
                  <RotateCcw size={14} />
                </button>
              )}
              {s.session && (
                <button
                  type="button"
                  title="Open the session"
                  aria-label="Open the session"
                  className="shrink-0 rounded-md p-1 text-fg-3 hover:bg-bg-2 hover:text-fg"
                  onClick={() => {
                    useSessionShow.getState().show(s.session!, 'conversation');
                    openSession(s.session!);
                  }}
                >
                  <MessageSquareText size={14} />
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
