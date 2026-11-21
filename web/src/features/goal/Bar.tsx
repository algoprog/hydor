// The goal bar above the message box: what the goal is and what it is doing, how much it asks (a chip that changes it),
// Pause or Resume and Stop, the checks as pills, what you told it for every round, money and time against their limits,
// and the fold that opens the rounds.
import { useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, CircleAlert, Circle, MoreHorizontal, Pause, Play, Plus, Settings2, SlidersHorizontal, Target, X } from 'lucide-react';
import { standing, tally, type GoalCheck, type GoalResult, type GoalState } from '@shared/goals';
import type { SessionSummary } from '@shared/types';
import { Meter } from '../../components/charts';
import { Button, cx, Dialog, IconButton, MenuItem, Popover, useConfirm, inputCls } from '../../components/ui';
import { AsksControls } from './Asks';
import { say } from './Say';
import { ChecksEditor, DraftButtons, draftChanges, draftOf, draftProblem, type ContractDraft } from './ChecksEditor';
import { useAct, useActiveMs } from './state';
import { asksChip, moneyText, needsPerson, pauseButton, pendingNote, pillValue, shortLabel, statusWords, statusWordsApp, timeText, type Team } from './words';

/** One check where the files stand: a tick, a measured value with its meter, a hollow dot, or an amber mark. */
function Pill({ c, r }: { c: GoalCheck; r: GoalResult | undefined }) {
  const holds = !!r?.holds;
  const value = r ? pillValue(c, r) : '';
  const title = [c.label, r?.error ?? r?.detail].filter(Boolean).join('\n');
  return (
    <span title={title} className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-full border border-line bg-bg-1 px-2 text-[12px] text-fg-2">
      {holds ? <Check size={12} strokeWidth={2.5} className="shrink-0 text-ok" /> : r?.error ? <CircleAlert size={12} className="shrink-0 text-warn" /> : <Circle size={11} className="shrink-0 text-fg-3" />}
      <span translate="no" className="max-w-[160px] truncate">
        {shortLabel(c)}
      </span>
      {!holds && value && (
        <>
          <span translate="no" className="tnum text-fg-3">
            {value}
          </span>
          <Meter percent={(r?.closeness ?? 0) * 100} color="var(--accent)" height={4} className="!w-9 shrink-0" />
        </>
      )}
    </span>
  );
}

/** A limit's use: "$5.04 of $10.00" with a meter when there is a limit. */
function Use({ text, used, limit }: { text: string; used: number; limit?: number }) {
  return (
    <span className="inline-flex items-center gap-2 text-[12px] text-fg-3 tnum">
      <span translate="no">{text}</span>
      {limit ? <Meter percent={(used / limit) * 100} color="var(--accent)" height={4} className="!w-16" /> : null}
    </span>
  );
}

/** The chip that shows how much it asks and changes it. */
export function AsksChip({ g }: { g: GoalState }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [run] = useAct(g.key);
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="How much it asks you"
        className={cx('press inline-flex h-7 max-w-full items-center gap-1.5 rounded-lg border border-line-2 px-2 text-[12.5px] text-fg-2 transition-colors hover:bg-bg-2', open && 'bg-bg-2')}
      >
        <SlidersHorizontal size={13} className="shrink-0 text-fg-3" />
        <span className="truncate">{asksChip(g.settings)}</span>
        <ChevronDown size={12} className={cx('shrink-0 text-fg-3 transition-transform duration-200', open && 'rotate-180')} />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={340} align="end" prefer="above" sheet title="How much it asks you">
        <div className="p-2">
          <AsksControls value={g.settings} onChange={(settings) => void run({ action: 'settings', settings })} />
        </div>
      </Popover>
    </>
  );
}

/** Add a rule: something that holds for every round from now on. */
export function RuleDialog({ g, open, onClose }: { g: GoalState; open: boolean; onClose: () => void }) {
  const [text, setText] = useState('');
  const [run, busy] = useAct(g.key);
  const add = async () => {
    if (busy || !text.trim()) return;
    if ((await run({ action: 'rule', text: text.trim() })) !== undefined) {
      setText('');
      onClose();
    }
  };
  return (
    <Dialog
      part="goal"
      open={open}
      onClose={onClose}
      title="Add a rule"
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || !text.trim()} onClick={add}>
            Add the rule
          </Button>
        </>
      }
    >
      <p className="mb-3 text-[13px] leading-relaxed text-fg-3">A rule goes into every round from now on, and the reviewer checks each round against it. Say it as you would to the agent: “No new dependencies”.</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && void add()}
        rows={3}
        autoFocus
        aria-label="The rule"
        placeholder="Don’t touch the checkout code while you are at it."
        className={cx(inputCls, 'h-auto py-2 leading-relaxed')}
      />
    </Dialog>
  );
}

/** Change the checks of a goal that runs: it takes effect with the next round. */
function ChangeDialog({ g, open, onClose }: { g: GoalState; open: boolean; onClose: () => void }) {
  const [draft, setDraft] = useState<ContractDraft>(() => draftOf(g.contract));
  const [run, busy] = useAct(g.key);
  const problem = draftProblem(draft);
  const save = async () => {
    const contract = draftChanges(g.contract, draft);
    if (!Object.keys(contract).length) return onClose();
    if ((await run({ action: 'change', contract })) !== undefined) onClose();
  };
  // Opened again, it starts from the checks as they are now.
  const close = () => {
    setDraft(draftOf(g.contract));
    onClose();
  };
  return (
    <Dialog part="goal" open={open} onClose={close} title="Change the checks" width={560} footer={<DraftButtons problem={problem} busy={busy} onSave={save} onCancel={close} save="Save" />}>
      <p className="mb-3 text-[13px] leading-relaxed text-fg-3">A change takes effect with the next round. A check you add or change is measured again first.</p>
      <ChecksEditor value={draft} onChange={setDraft} />
    </Dialog>
  );
}

function Menu({ g }: { g: GoalState }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<'rule' | 'checks' | null>(null);
  return (
    <>
      <IconButton ref={ref} label="More" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <MoreHorizontal size={16} />
      </IconButton>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} align="end" prefer="above" width={230} title="More">
        <MenuItem icon={<Plus size={15} />} onClick={() => (setOpen(false), setShown('rule'))}>
          Add a rule…
        </MenuItem>
        {/* The checks are only agreed once the rounds run. */}
        {g.rounds.length > 0 && g.status !== 'drafting' && g.status !== 'agreeing' && g.status !== 'measuring' && (
          <MenuItem icon={<Settings2 size={15} />} onClick={() => (setOpen(false), setShown('checks'))}>
            Change the checks…
          </MenuItem>
        )}
      </Popover>
      <RuleDialog g={g} open={shown === 'rule'} onClose={() => setShown(null)} />
      {shown === 'checks' && <ChangeDialog g={g} open onClose={() => setShown(null)} />}
    </>
  );
}

/** What you told it for every round, as pills with a × to take one back (also on the report of a goal that stopped at a limit). */
export function RulesRow({ g, className }: { g: GoalState; className?: string }) {
  const [run, busy] = useAct(g.key);
  if (!g.rules.length) return null;
  return (
    <div className={cx('flex flex-wrap items-center gap-1.5', className)}>
      <span className="text-[11.5px] text-fg-3">From you</span>
      {g.rules.map((r) => (
        <span key={r.id} className="inline-flex h-6 max-w-full items-center gap-1 rounded-full border border-line bg-bg-1 pr-1 pl-2.5 text-[12px] text-fg-2">
          <span translate="no" className="truncate">
            {r.text}
          </span>
          <button type="button" disabled={busy} onClick={() => void run({ action: 'unrule', id: r.id })} aria-label="Remove this rule" title="Remove this rule" className="shrink-0 rounded-full p-0.5 text-fg-3 hover:bg-bg-3 hover:text-fg">
            <X size={11} />
          </button>
        </span>
      ))}
    </div>
  );
}

export function GoalBarCard({ g, rounds, onRounds, team, className }: { g: GoalState; rounds: boolean; onRounds: () => void; team?: Team; className?: string }) {
  const [run, busy] = useAct(g.key);
  const [confirm, confirmNode] = useConfirm();
  const waits = needsPerson(g.status);
  const res = standing(g);
  const t = tally(g);
  const l = g.contract.limits;
  const active = useActiveMs(g);
  const pause = pauseButton(g);
  const live = g.status === 'working' || g.status === 'checking' || g.status === 'asking' || g.status === 'measuring';
  const stop = async () => {
    const ok = await confirm({
      title: 'Stop the goal?',
      body: 'Nothing more runs towards it. Its report shows where things stand, and you can set a new goal any time.',
      confirm: 'Stop',
      danger: true,
    });
    if (ok) void run({ action: 'stop' });
  };
  return (
    <div data-tip="goal" data-i18n="goal" role="status" className={cx('anim-expand rounded-2xl border border-line-2 bg-panel px-4 py-2.5 text-[13.5px]', className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="flex min-w-[min(100%,180px)] flex-1 items-center gap-2">
          <Target size={15} className={cx('shrink-0', waits ? 'text-warn' : 'text-accent')} />
          <span className="font-medium">Goal</span>
          <span className="min-w-0 truncate text-fg-3">· {say(statusWords(g, team))}</span>
        </div>
        <div className="ml-auto flex max-w-full min-w-0 flex-wrap items-center justify-end gap-1">
          <AsksChip g={g} />
          {/* Pause, Stop and the menu stay together on a line. */}
          <div className="flex shrink-0 items-center gap-1">
            {/* While a pause waits for the round that runs, the button takes the pause back (Resume). */}
            {live && g.status !== 'measuring' && (
              <Button size="sm" variant={pause.action === 'pause' ? 'ghost' : 'secondary'} disabled={busy} onClick={() => void run({ action: pause.action })} icon={pause.action === 'pause' ? <Pause size={13} /> : <Play size={13} />}>
                {pause.label}
              </Button>
            )}
            {g.status === 'paused' && (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run({ action: 'resume' })} icon={<Play size={13} />}>
                Resume
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void stop()} title="Stop working towards it">
              Stop
            </Button>
            <Menu g={g} />
          </div>
        </div>
      </div>
      <div translate="no" className="mt-1 line-clamp-2 text-fg-2">
        {g.contract.title || g.contract.objective}
      </div>
      {g.reason && (g.status === 'paused' || g.status === 'needs-you') && (
        <div translate="no" className="mt-1 line-clamp-2 text-[12.5px] text-warn" title={g.reason}>
          {g.reason}
        </div>
      )}
      {g.contract.checks.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {g.contract.checks.map((c) => (
            <Pill key={c.id} c={c} r={res.find((r) => r.id === c.id)} />
          ))}
        </div>
      )}
      {pendingNote(g) && <div className="mt-1.5 text-[12px] text-fg-3">Your change to the checks takes effect after this round.</div>}
      <RulesRow g={g} className="mt-2" />
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Use text={moneyText(g)} used={g.spentUsd} limit={l.usd} />
        <Use text={timeText(g, active)} used={active} limit={l.minutes ? l.minutes * 60000 : undefined} />
        {t.rounds > 0 && (
          <button
            type="button"
            onClick={onRounds}
            aria-expanded={rounds}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg"
          >
            {rounds ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            Rounds · {t.kept} kept · {t.undone} undone
          </button>
        )}
      </div>
      {confirmNode}
    </div>
  );
}

/** The bar before the whole goal has loaded: what the session's summary already says. */
export function GoalBarLite({ s, className }: { s: SessionSummary; className?: string }) {
  const g = s.goal;
  const a = g?.app;
  if (!g || !a) return null;
  const waits = a.state === 'agreeing' || a.state === 'asking' || a.state === 'needs-you' || a.state === 'paused';
  return (
    <div data-tip="goal" data-i18n="goal" role="status" className={cx('rounded-2xl border border-line-2 bg-panel px-4 py-2.5 text-[13.5px]', className)}>
      <div className="flex items-center gap-2">
        <Target size={15} className={cx('shrink-0', waits ? 'text-warn' : 'text-accent')} />
        <span className="font-medium">Goal</span>
        <span className="min-w-0 truncate text-fg-3">
          · {say(statusWordsApp(a))}
          {a.of > 0 && ` · ${a.holds} of ${a.of} hold`}
        </span>
      </div>
      <div translate="no" className="mt-1 line-clamp-2 text-fg-2">
        {g.objective}
      </div>
    </div>
  );
}
