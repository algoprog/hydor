// A template's steps as the pages show them: an outline of what it does (the builder, until the steps
// editor), and a run's steps with how each went (the run's page), each agent step with its session.
import { useState } from 'react';
import { ChevronRight, MessageSquareText } from 'lucide-react';
import type { RunStepView } from '@shared/apps';
import type { Flow, Step } from '@shared/app-manifest';
import { STEP_KINDS, titleOf } from '@shared/app-manifest';
import { openSession } from '../../lib/nav';
import { cx, Throbber } from '../../components/ui';
import { useSessionShow } from '../session/show';
import { money } from './api';

const kindOf = (k: string) => STEP_KINDS.find((x) => x.value === k)?.label ?? k;

/** The lists inside a step, each with what to call it. */
function inner(s: Step): { label: string; steps: Step[] }[] {
  const out: { label: string; steps: Step[] }[] = [];
  if (s.do === 'decide') {
    out.push({ label: 'Then', steps: s.then });
    if (s.else?.length) out.push({ label: 'Else', steps: s.else });
  } else if (s.do === 'repeat') out.push({ label: s.over ? 'For each item' : 'Until it holds', steps: s.steps });
  else if (s.do === 'parallel') s.branches.forEach((b, i) => out.push({ label: `Branch ${i + 1}`, steps: b }));
  if (Array.isArray(s.failed)) out.push({ label: 'If it fails', steps: s.failed });
  return out;
}

function OutlineList({ steps, depth }: { steps: Step[]; depth: number }) {
  return (
    <ol className={cx('space-y-1.5', depth > 0 && 'mt-1.5 border-l-2 border-line pl-3')}>
      {steps.map((s) => (
        <li key={s.id}>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[13.5px] font-medium" translate="no">
              {titleOf(s)}
            </span>
            <span className="text-[12px] text-fg-3">{kindOf(s.do)}</span>
            {s.if && <span className="font-mono text-[11.5px] text-fg-3">if {s.if}</span>}
          </div>
          {inner(s).map((b) => (
            <div key={b.label} className="mt-1">
              <div className="text-[11.5px] font-medium tracking-wide text-fg-3 uppercase">{b.label}</div>
              <OutlineList steps={b.steps} depth={depth + 1} />
            </div>
          ))}
        </li>
      ))}
    </ol>
  );
}

/** What a template does, step by step, to look at. */
export function StepsOutline({ flow }: { flow: Flow }) {
  return (
    <div className="rounded-[10px] border border-line-2 bg-bg-1 px-3 py-2.5">
      <OutlineList steps={flow.steps} depth={0} />
    </div>
  );
}

const DOT: Record<RunStepView['status'], string> = { done: 'bg-ok', failed: 'bg-err', skipped: 'bg-line', stopped: 'bg-fg-3', running: '', waiting: 'bg-warn' };
const SAID: Record<RunStepView['status'], string> = { done: 'Done', failed: 'Did not finish', skipped: 'Skipped', stopped: 'Stopped', running: 'Working', waiting: 'Needs you' };

/** How long a step took, from a second up. */
const took = (s: RunStepView) => (s.startedAt && s.endedAt && s.endedAt - s.startedAt >= 1000 ? `${Math.round((s.endedAt - s.startedAt) / 1000)} s` : '');

/** A run's steps: each with how it went, what it cost, why it did not finish, and its session. */
export function RunSteps({ steps }: { steps: RunStepView[] }) {
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
            <li key={s.path} className="flex items-start gap-2.5">
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
                  <span className="text-[12px] text-fg-3">{SAID[s.status]}</span>
                  {took(s) && <span className="text-[12px] text-fg-3">{took(s)}</span>}
                  {!!s.costUsd && <span className="text-[12px] text-fg-3">{money(s.costUsd)}</span>}
                </div>
                {s.error && s.status !== 'skipped' && <div className="mt-0.5 text-[12.5px] break-words text-err">{s.error}</div>}
              </div>
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
