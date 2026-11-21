// "Is this what done means?": the checks the agent proposed, measured where things stand, for you to agree before any round
// runs. Start begins the rounds; Change… turns the rows into fields; Not now stops the goal.
import { useState } from 'react';
import { Check, Lock, Target } from 'lucide-react';
import { GOAL_PATIENCE, standing, type GoalCheck, type GoalState } from '@shared/goals';
import type { SessionSummary } from '@shared/types';
import { ago, usd } from '../../lib/format';
import { Button, cx } from '../../components/ui';
import { AsksControls } from './Asks';
import { say } from './Say';
import { ChecksEditor, draftChanges, draftOf, draftProblem, type ContractDraft } from './ChecksEditor';
import { useAct } from './state';
import { agreementHead, atMost, KIND_LABEL, limitMinutes, nowText, plural, startLabel, UNMEASURED_NOTE, unmeasured } from './words';

export const SECTION = 'mb-1.5 text-[11px] font-semibold tracking-wide text-fg-3 uppercase';

function Dot({ holds, error }: { holds: boolean; error?: string }) {
  const cls = 'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full';
  if (holds) return <span className={cx(cls, 'bg-ok text-bg')}><Check size={10} strokeWidth={3.5} /></span>;
  if (error) return <span className={cx(cls, 'bg-warn text-bg text-[10px] font-bold')}>!</span>;
  return <span className={cx(cls, 'border border-line-2')} />;
}

/** What a check is about, under its label: its command, or the sentence the reviewer weighs. */
function Basis({ c }: { c: GoalCheck }) {
  if (c.kind === 'command' || c.kind === 'measure') {
    return (
      <div translate="no" className="truncate font-mono text-[11.5px] text-fg-3">
        {c.run}
      </div>
    );
  }
  if (c.kind === 'review') return <div className="text-[12px] text-fg-3">{c.evidence?.diff ? 'from what changed since the goal started' : 'read by the reviewer'}</div>;
  return <div className="text-[12px] text-fg-3">you say when it holds</div>;
}

export function Agreement({ g, s, className }: { g: GoalState; s: SessionSummary; className?: string }) {
  const [run, busy] = useAct(g.key);
  const [draft, setDraft] = useState<ContractDraft | null>(null);
  const res = standing(g);
  const l = g.contract.limits;
  const problem = draft ? draftProblem(draft) : null;
  const failed = g.contract.checks.some((c) => res.find((r) => r.id === c.id)?.error);
  const start = () => {
    const contract = draft ? draftChanges(g.contract, draft) : {};
    void run({ action: 'agree', ...(Object.keys(contract).length ? { contract } : {}) });
  };
  const measured = g.rounds[0]?.endedAt;
  return (
    <div className={cx('anim-pop overflow-hidden rounded-xl border border-accent/45 bg-panel shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_10%,transparent)]', className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-line bg-accent-soft px-4 py-2.5">
        <Target size={15} className="shrink-0 text-accent" />
        <span className="text-[14px] font-semibold">Is this what done means?</span>
        {!draft && (
          <span className="ml-auto text-[12px] text-fg-3">
            {agreementHead(g, measured ? ago(measured) : 'just now')}
          </span>
        )}
      </div>
      <div className="max-h-[min(60dvh,560px)] overflow-y-auto px-4 py-3">
        <p translate="no" className="text-[14.5px] font-semibold leading-snug">
          {g.contract.title || g.contract.objective}
        </p>

        {draft ? (
          <div className="mt-3">
            <ChecksEditor value={draft} onChange={setDraft} />
          </div>
        ) : (
          <>
            <div className={cx(SECTION, 'mt-3')}>Done when</div>
            {unmeasured(g) && <p className="-mt-0.5 mb-2 text-[12.5px] leading-snug text-fg-3">{UNMEASURED_NOTE}</p>}
            <ul className="space-y-2">
              {g.contract.checks.map((c) => {
                const r = res.find((x) => x.id === c.id);
                return (
                  <li key={c.id} className="flex items-start gap-2.5">
                    <Dot holds={!!r?.holds} error={r?.error} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span translate="no" className="text-[13.5px]">
                          {c.label}
                        </span>
                        <span className="rounded bg-bg-3 px-1.5 py-px text-[10.5px] font-medium text-fg-2">{KIND_LABEL[c.kind]}</span>
                      </div>
                      <Basis c={c} />
                    </div>
                    <span className={cx('max-w-[40%] shrink-0 text-right text-[12.5px] tnum', r?.holds ? 'text-ok' : r?.error ? 'text-warn' : 'text-fg-3')}>
                      {r ? say(nowText(c, r)) : ''}
                    </span>
                  </li>
                );
              })}
            </ul>
            {failed && <p className="mt-2 text-[12.5px] leading-snug text-warn">A check that could not run counts as not holding. Change it, or start anyway.</p>}

            <div className={cx(SECTION, 'mt-4')}>Kept safe</div>
            <ul className="space-y-1.5 text-[13px] text-fg-2">
              {g.contract.protect.length > 0 && (
                <li className="flex items-start gap-2">
                  <Lock size={13} className="mt-1 shrink-0 text-fg-3" />
                  <span>
                    The agent cannot change{' '}
                    {g.contract.protect.map((p, i) => (
                      <span key={p}>
                        {i > 0 && ', '}
                        <code translate="no" className="rounded bg-bg-2 px-1 font-mono text-[12px]">
                          {p}
                        </code>
                      </span>
                    ))}
                    .
                  </span>
                </li>
              )}
              <li className="flex items-start gap-2">
                <Lock size={13} className="mt-1 shrink-0 text-fg-3" />
                {g.undo ? (
                  <span>
                    It works on a branch of its own
                    {s.worktree?.branch && (
                      <>
                        {', '}
                        <code translate="no" className="rounded bg-bg-2 px-1 font-mono text-[12px]">
                          {s.worktree.branch}
                        </code>
                      </>
                    )}
                    , where a round can be undone.
                  </span>
                ) : (
                  <span>It works in your folder, where a round cannot be undone. Start the goal in a new worktree to get that.</span>
                )}
              </li>
            </ul>

            <div className={cx(SECTION, 'mt-4')}>Limits</div>
            <div className="flex flex-wrap gap-1.5">
              {[plural(l.rounds, 'round'), l.usd ? usd(l.usd) : '', l.minutes ? limitMinutes(l.minutes) : ''].filter(Boolean).map((x) => (
                <span key={x} className="rounded-full border border-line-2 bg-bg-1 px-2.5 py-0.5 text-[12.5px] text-fg-2">
                  {x}
                </span>
              ))}
            </div>
            <p className="mt-1.5 text-[12.5px] text-fg-3">{`A new approach after ${plural(GOAL_PATIENCE, 'round')} without progress.`}</p>
          </>
        )}

        <div className={cx(SECTION, 'mt-4')}>How much it asks you</div>
        <AsksControls value={g.settings} onChange={(settings) => void run({ action: 'settings', settings })} />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
        <Button variant="primary" size="sm" disabled={busy || !!problem || (!draft && g.contract.checks.length === 0)} onClick={start} title={problem ?? undefined}>
          {startLabel(g)}
        </Button>
        {draft ? (
          <Button size="sm" onClick={() => setDraft(null)}>
            Cancel changes
          </Button>
        ) : (
          <Button size="sm" onClick={() => setDraft(draftOf(g.contract))}>
            Change…
          </Button>
        )}
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void run({ action: 'stop' })}>
          Not now
        </Button>
        {atMost(g) && <span className="ml-auto text-[12.5px] text-fg-3">{atMost(g)}</span>}
      </div>
    </div>
  );
}
