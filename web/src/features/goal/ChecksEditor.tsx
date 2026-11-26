// The checks, the protected paths and the limits as fields: what Change… on the agreement card turns its rows into, and
// what the bar's menu (Change the checks…) opens for a goal that runs. The caller keeps the draft and sends it. A score
// check picks one of the session's folder's evaluations (GET /api/experiments/evaluations?cwd=); the app fixes its target
// from the evaluation's baseline when you start or save.
import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { GOAL_MAX_CHECKS, type GoalCheck, type GoalCheckKind, type GoalContract, type GoalLimits } from '@shared/goals';
import { Button, cx, MenuItem, Popover, inputCls } from '../../components/ui';
import { api } from '../../lib/api';
import { go } from '../../lib/nav';
import { baselineOf, evalPage, evalProblem, KIND_LABEL, limitsOf, limitsProblem, num, scoreNeeds, type EvalChoice } from './words';

/** A check being edited: one added here has no id yet (the server gives it one) and a key of its own for the editor. */
type Editing = GoalCheck & { _k?: string };

/** The parts of the checks a person may change. */
export type ContractDraft = Omit<Pick<GoalContract, 'checks' | 'protect' | 'limits'>, 'checks'> & { checks: Editing[] };

let added = 0;
/** The checks as they are sent: without the editor's own keys. */
const clean = (cs: Editing[]): GoalCheck[] => cs.map(({ _k, ...c }) => c);

const field = cx(inputCls, '!h-8 !text-[13px]');
const mono = cx(field, 'font-mono !text-[12px]');
const label = 'mb-0.5 block text-[11.5px] text-fg-3';

export const draftOf = (c: GoalContract): ContractDraft => ({ checks: c.checks.map((x) => ({ ...x })), protect: [...c.protect], limits: { ...c.limits } });

/** What is missing before the checks can be sent, in a sentence; null when they are complete. */
export function draftProblem(d: ContractDraft): string | null {
  if (!d.checks.length) return 'Add at least one check';
  for (const c of d.checks) {
    if (!c.label.trim()) return 'Every check needs a label';
    if (c.kind === 'command' && !c.run?.trim()) return `“${c.label}” needs a command`;
    if (c.kind === 'measure' && (!c.run?.trim() || !c.target || !Number.isFinite(c.target.value))) return `“${c.label}” needs a command and a target`;
    if (c.kind === 'review' && !c.claim?.trim()) return `“${c.label}” needs a sentence for the reviewer`;
    if (c.kind === 'score' && !c.evaluation) return `“${c.label}” needs an evaluation`;
    if (c.kind === 'score' && c.gain != null && !(Number.isFinite(c.gain) && c.gain >= 0)) return `“${c.label}”: how much better must be 0 or more`;
  }
  return limitsProblem(d.limits);
}


/** A number box that keeps what is being typed and passes on only numbers. */
function Num({ value, onChange, placeholder, className, 'aria-label': aria }: { value: number | undefined; onChange: (v: number | undefined) => void; placeholder?: string; className?: string; 'aria-label': string }) {
  const [text, setText] = useState(value == null ? '' : String(value));
  return (
    <input
      value={text}
      inputMode="decimal"
      aria-label={aria}
      placeholder={placeholder}
      className={cx(field, className)}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        const v = Number(t);
        if (!t.trim()) onChange(undefined);
        else if (Number.isFinite(v)) onChange(v);
      }}
    />
  );
}

/** A check to add: its id is empty, and the server gives it one. */
const fresh = (kind: GoalCheckKind): Editing => {
  const id = '';
  const _k = `new${++added}`;
  return kind === 'command'
    ? { id, _k, kind, label: '', run: '' }
    : kind === 'measure'
      ? { id, _k, kind, label: '', run: '', target: { op: '>=', value: 0 } }
      : kind === 'review'
        ? { id, _k, kind, label: '', claim: '', evidence: { diff: true } }
        : kind === 'score'
          ? { id, _k, kind, label: '', evaluation: '', gain: 0 }
          : { id, _k, kind, label: '' };
};

/** The evaluations of the session's folder, for a score check to pick from: null while they load (or with no folder known). */
function useEvaluations(cwd: string | undefined): EvalChoice[] | null {
  const [list, setList] = useState<EvalChoice[] | null>(null);
  useEffect(() => {
    if (!cwd) return;
    let on = true;
    api<{ evaluations: EvalChoice[] }>(`/api/experiments/evaluations?cwd=${encodeURIComponent(cwd)}`)
      .then((r) => on && setList(r.evaluations ?? []))
      .catch(() => on && setList([]));
    return () => {
      on = false;
    };
  }, [cwd]);
  return list;
}

/** A link inside the app, as a button (go). */
const AppLink = ({ to, children }: { to: string; children: string }) => (
  <button type="button" onClick={() => go(to)} className="text-accent underline-offset-2 hover:underline">
    {children}
  </button>
);

/** A score check's fields: its evaluation, how much better than its baseline it must be, and what that comes to. */
function ScoreFields({ c, set, evals }: { c: Editing; set: (p: Partial<GoalCheck>) => void; evals: EvalChoice[] | null }) {
  const ev = evals?.find((e) => e.id === c.evaluation);
  // The evaluation's baseline now, else the one the check was agreed against.
  const base = ev ? baselineOf(ev) : c.baseline ? { mean: c.baseline.mean } : null;
  const better = ev?.better ?? (c.target?.op === '<=' ? 'lower' : 'higher');
  // One the list does not have (removed, or of another folder) says so too, unless it is the one agreed and the list could not say.
  const problem = evals?.length && c.evaluation ? evalProblem(ev) : null;
  const pick = (id: string) => {
    const e = evals?.find((x) => x.id === id);
    // Another evaluation: the app fixes the target and baseline afresh.
    set({ evaluation: id, target: undefined, baseline: undefined, ...(c.label.trim() || !e ? {} : { label: `Beats the baseline on ${e.metric}` }) });
  };
  return (
    <>
      <div className="mt-2">
        <span className={label}>The evaluation that scores it</span>
        {evals && !evals.length && !c.baseline ? (
          <p className="text-[12.5px] leading-snug text-fg-3">
            This folder has no evaluation yet. <AppLink to="/experiments">Set one up in Experiments</AppLink>
          </p>
        ) : (
          <select value={c.evaluation ?? ''} onChange={(e) => pick(e.target.value)} disabled={!evals && !c.baseline} aria-label="The evaluation that scores it" className={cx(field, 'w-full')}>
            <option value="" disabled>
              {evals ? 'Pick an evaluation' : 'Loading…'}
            </option>
            {evals?.map((e) => (
              <option key={e.id} value={e.id} translate="no">
                {`${e.name} · ${e.metric}`}
              </option>
            ))}
            {/* The one it was agreed with, also when the folder's list does not have it (or could not be read). */}
            {c.evaluation && c.baseline && !evals?.some((e) => e.id === c.evaluation) && (
              <option value={c.evaluation} translate="no">
                {`${c.baseline.name} · ${c.baseline.metric}`}
              </option>
            )}
          </select>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
        <div className="w-60 max-w-full">
          <span className={label}>Better than the baseline by at least</span>
          <Num aria-label="Better than the baseline by at least" value={c.gain} placeholder="0" onChange={(v) => set({ gain: v ?? 0 })} />
        </div>
        {base && (
          <span className="pb-2 text-[12px] text-fg-3">
            {'Baseline '}
            <span translate="no" className="tnum">
              {num(base.mean)}
            </span>
            {' · it holds at '}
            <span translate="no" className="tnum">
              {scoreNeeds(better, base.mean, c.gain ?? 0)}
            </span>
            {', beyond the noise of its seeds'}
          </span>
        )}
      </div>
      {problem && (
        <p className="mt-1.5 text-[12px] leading-snug text-warn">
          {`${problem}. `}
          {ev && <AppLink to={evalPage(ev.id)}>Open the evaluation</AppLink>}
        </p>
      )}
    </>
  );
}

function CheckFields({ c, onChange, onRemove, evals }: { c: Editing; onChange: (c: Editing) => void; onRemove: () => void; evals: EvalChoice[] | null }) {
  const set = (p: Partial<GoalCheck>) => onChange({ ...c, ...p });
  return (
    <div className="rounded-lg border border-line bg-bg-1 p-2.5">
      <div className="flex items-center gap-2">
        <span className="shrink-0 rounded bg-bg-3 px-1.5 py-px text-[10.5px] font-medium text-fg-2">{KIND_LABEL[c.kind]}</span>
        <input value={c.label} onChange={(e) => set({ label: e.target.value })} placeholder="What it says: Tests pass" aria-label="Label" className={cx(field, 'min-w-0 flex-1')} />
        <button type="button" onClick={onRemove} aria-label="Remove this check" title="Remove this check" className="shrink-0 rounded-md p-1.5 text-fg-3 hover:bg-bg-2 hover:text-fg">
          <X size={14} />
        </button>
      </div>
      {(c.kind === 'command' || c.kind === 'measure') && (
        <div className="mt-2">
          <span className={label}>{c.kind === 'command' ? 'Command: it holds when it ends without an error' : 'Command that prints the number'}</span>
          <input value={c.run ?? ''} onChange={(e) => set({ run: e.target.value })} placeholder="npm test" aria-label="Command" className={mono} />
        </div>
      )}
      {c.kind === 'measure' && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div>
            <span className={label}>Must be</span>
            <select
              value={c.target?.op ?? '>='}
              onChange={(e) => set({ target: { op: e.target.value as '>=' | '<=', value: c.target?.value ?? 0 } })}
              aria-label="At least or at most"
              className={cx(field, 'w-auto')}
            >
              <option value=">=">at least</option>
              <option value="<=">at most</option>
            </select>
          </div>
          <div className="w-24">
            <span className={label}>Target</span>
            <Num aria-label="Target" value={c.target?.value} onChange={(v) => set({ target: { op: c.target?.op ?? '>=', value: v ?? Number.NaN } })} />
          </div>
          <div className="w-24">
            <span className={label}>Unit</span>
            <input value={c.unit ?? ''} onChange={(e) => set({ unit: e.target.value || undefined })} placeholder="ms" aria-label="Unit" className={field} />
          </div>
        </div>
      )}
      {c.kind === 'review' && (
        <div className="mt-2">
          <span className={label}>The sentence the reviewer must find true</span>
          <textarea
            value={c.claim ?? ''}
            onChange={(e) => set({ claim: e.target.value })}
            rows={2}
            aria-label="The sentence for the reviewer"
            className={cx(inputCls, 'h-auto min-h-0 py-1.5 text-[13px] leading-snug')}
          />
          <label className="mt-1.5 flex items-center gap-2 text-[12.5px] text-fg-2">
            <input type="checkbox" checked={!!c.evidence?.diff} onChange={(e) => set({ evidence: { ...c.evidence, diff: e.target.checked } })} className="h-3.5 w-3.5 accent-[var(--accent)]" />
            It reads what changed since the goal started
          </label>
        </div>
      )}
      {c.kind === 'score' && <ScoreFields c={c} set={set} evals={evals} />}
      {c.kind === 'you' && <p className="mt-1.5 text-[12px] text-fg-3">Only you can say whether this holds: it asks you when every other check does.</p>}
    </div>
  );
}

export function ChecksEditor({ value, onChange, cwd }: { value: ContractDraft; onChange: (d: ContractDraft) => void; cwd?: string }) {
  const add = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState(false);
  const evals = useEvaluations(cwd);
  const setCheck = (i: number, c: Editing) => onChange({ ...value, checks: value.checks.map((x, j) => (j === i ? c : x)) });
  const limits = value.limits;
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 text-[11px] font-semibold tracking-wide text-fg-3 uppercase">Done when</div>
        <div className="space-y-2">
          {value.checks.map((c, i) => (
            <CheckFields key={c._k ?? c.id} c={c} evals={evals} onChange={(x) => setCheck(i, x)} onRemove={() => onChange({ ...value, checks: value.checks.filter((_, j) => j !== i) })} />
          ))}
        </div>
        {value.checks.length < GOAL_MAX_CHECKS && (
          <>
            <button ref={add} type="button" onClick={() => setMenu((o) => !o)} className="mt-2 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[13px] text-fg-3 hover:bg-bg-2 hover:text-fg">
              <Plus size={14} /> Add a check
            </button>
            <Popover anchor={add} open={menu} onClose={() => setMenu(false)} width={260} title="Add a check">
              {(['command', 'measure', 'score', 'review', 'you'] as GoalCheckKind[]).map((k) => (
                <MenuItem
                  key={k}
                  hint={
                    k === 'command'
                      ? 'a command that must pass'
                      : k === 'measure'
                        ? 'a number that must reach a target'
                        : k === 'score'
                          ? 'an evaluation’s score must beat its baseline'
                          : k === 'review'
                            ? 'a sentence a reviewer finds true'
                            : 'you confirm it'
                  }
                  onClick={() => (setMenu(false), onChange({ ...value, checks: [...value.checks, fresh(k)] }))}
                >
                  {k === 'score' ? 'A score' : KIND_LABEL[k]}
                </MenuItem>
              ))}
            </Popover>
          </>
        )}
      </div>
      <div>
        <div className="mb-1.5 text-[11px] font-semibold tracking-wide text-fg-3 uppercase">Kept safe</div>
        <span className={label}>Paths it may not change, one to a line (end a folder with /)</span>
        <textarea
          value={value.protect.join('\n')}
          onChange={(e) => onChange({ ...value, protect: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })}
          rows={Math.max(2, Math.min(6, value.protect.length + 1))}
          aria-label="Protected paths"
          className={cx(inputCls, 'h-auto min-h-0 py-1.5 font-mono !text-[12px] leading-snug')}
        />
      </div>
      <div>
        <div className="mb-1.5 text-[11px] font-semibold tracking-wide text-fg-3 uppercase">Limits</div>
        <LimitsFields value={limits} onChange={(l) => onChange({ ...value, limits: l })} />
      </div>
    </div>
  );
}

/** The three limits as fields: rounds, money and time. */
export function LimitsFields({ value, onChange }: { value: GoalLimits; onChange: (l: GoalLimits) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <div className="w-24">
        <span className={label}>Rounds</span>
        <Num aria-label="Rounds" value={value.rounds} onChange={(v) => onChange({ ...value, rounds: v ?? 0 })} />
      </div>
      <div className="w-28">
        <span className={label}>Money (USD)</span>
        <Num aria-label="Money in dollars" value={value.usd} placeholder="no limit" onChange={(v) => onChange({ ...value, usd: v })} />
      </div>
      <div className="w-28">
        <span className={label}>Time (minutes)</span>
        <Num aria-label="Time in minutes" value={value.minutes} placeholder="no limit" onChange={(v) => onChange({ ...value, minutes: v })} />
      </div>
    </div>
  );
}

/** The changed checks, paths and limits for `agree` or `change`: only what differs from `was`; a check added has an empty id. */
export function draftChanges(was: GoalContract, d: ContractDraft): Partial<Pick<GoalContract, 'checks' | 'protect' | 'limits'>> {
  const out: Partial<Pick<GoalContract, 'checks' | 'protect' | 'limits'>> = {};
  if (JSON.stringify(was.checks) !== JSON.stringify(clean(d.checks))) out.checks = clean(d.checks);
  if (JSON.stringify(was.protect) !== JSON.stringify(d.protect)) out.protect = d.protect;
  const l = limitsOf(d.limits);
  if (JSON.stringify(was.limits) !== JSON.stringify(l)) out.limits = l;
  return out;
}

/** The dialog's footer buttons for a draft: Save is off while something is missing. */
export function DraftButtons({ problem, busy, onSave, onCancel, save }: { problem: string | null; busy: boolean; onSave: () => void; onCancel: () => void; save: string }) {
  return (
    <>
      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      <Button variant="primary" onClick={onSave} disabled={busy || !!problem} title={problem ?? undefined}>
        {save}
      </Button>
    </>
  );
}
