// The rounds of a goal as a list: the start ("Where things stand") and every round since, each with what it did, what it
// changed, how it ended and what it cost. A row opens to what the agent reported, each check's result and why it ended as
// it did, and — where rounds can be undone — Your say: keep it anyway, undo it, or go another way from it.
import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, CircleAlert, Circle, Undo2, X } from 'lucide-react';
import { tally, type GoalCheck, type GoalRound, type GoalState } from '@shared/goals';
import { Badge, Button, cx, inputCls } from '../../components/ui';
import { say } from './Say';
import { useAct } from './state';
import { before, busy, changeText, outcomeLabel, membersText, pauseWait, resultText, roundBroke, roundCost, roundName, shortLabel, sinceTitle, startResultText, valueText } from './words';

const ROWS_SHOWN = 8;

function Marker({ g, r }: { g: GoalState; r: GoalRound }) {
  const cls = 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full';
  if (r.n === 0) return <span className={cx(cls, 'border border-line-2')} />;
  if (r.outcome === 'kept') return <span className={cx(cls, 'bg-ok text-bg')}><Check size={12} strokeWidth={3} /></span>;
  if (r.outcome === 'undone' && roundBroke(g, r)) return <span className={cx(cls, 'border border-err/60 text-err')}><X size={12} strokeWidth={2.5} /></span>;
  return <span className={cx(cls, 'border border-line-2 text-fg-3')}>{r.outcome === 'undone' ? <Undo2 size={11} /> : <Circle size={9} />}</span>;
}

function Chip({ g, r }: { g: GoalState; r: GoalRound }) {
  const label = outcomeLabel(r);
  if (!label) return null;
  const tone = r.outcome === 'kept' ? 'ok' : roundBroke(g, r) ? 'err' : 'neutral';
  return <Badge tone={tone}>{label}</Badge>;
}

/** A check's mark in an open round. */
function Mark({ c, holds, error }: { c: GoalCheck; holds: boolean; error?: string }) {
  if (holds) return <Check size={12} strokeWidth={2.5} className="text-ok" />;
  if (error) return <CircleAlert size={12} className="text-warn" />;
  return c.kind === 'measure' ? <Circle size={10} className="text-fg-3" /> : <X size={12} strokeWidth={2.5} className="text-err" />;
}

/** The panel under Your say: keep the round anyway (and what to do with checks it fails), undo it, or go another way from it. */
function SayPanel({ g, r, what, onClose }: { g: GoalState; r: GoalRound; what: 'keep' | 'undo' | 'from'; onClose: () => void }) {
  const [run, working] = useAct(g.key);
  const [reason, setReason] = useState('');
  const [relax, setRelax] = useState<Record<string, boolean>>({});
  // Measured checks this round fails: keep the check, or change its target to what the round reached.
  const failing = what === 'keep' ? g.contract.checks.filter((c) => c.kind === 'measure' && c.target && r.results.find((x) => x.id === c.id)?.value != null && !r.results.find((x) => x.id === c.id)?.holds) : [];
  const go = async () => {
    const targets = Object.fromEntries(failing.filter((c) => relax[c.id]).map((c) => [c.id, r.results.find((x) => x.id === c.id)!.value!]));
    const done = await run({ action: 'round', n: r.n, do: what, ...(reason.trim() ? { reason: reason.trim() } : {}), ...(Object.keys(targets).length ? { relax: targets } : {}) });
    if (done !== undefined) onClose();
  };
  const head = what === 'keep' ? `Keep round ${r.n} anyway?` : what === 'undo' ? `Undo round ${r.n}?` : `Another way from round ${r.n}`;
  const body =
    what === 'keep'
      ? 'It becomes the best so far, and the files go to how it left them.'
      : what === 'undo'
        ? 'The files go back to the round kept before it, and what it tried is not tried again.'
        : 'The files go to how this round left them, and the next round takes another way from there.';
  const button = what === 'keep' ? `Keep round ${r.n}` : what === 'undo' ? `Undo round ${r.n}` : 'Go another way';
  return (
    <div className="mt-2 rounded-xl border border-line-2 bg-bg-1 p-3">
      <div className="text-[13.5px] font-semibold">{head}</div>
      <p className="mt-0.5 text-[12.5px] leading-snug text-fg-3">{body}</p>
      {failing.map((c) => {
        const v = r.results.find((x) => x.id === c.id)!.value!;
        return (
          <div key={c.id} role="radiogroup" aria-label={shortLabel(c)} className="mt-2 space-y-1">
            <label className="flex cursor-pointer items-start gap-2 text-[13px]">
              <input type="radio" name={`${c.id}-${r.n}`} checked={!relax[c.id]} onChange={() => setRelax((x) => ({ ...x, [c.id]: false }))} className="mt-1 accent-[var(--accent)]" />
              <span>
                Keep the <span translate="no">{shortLabel(c)}</span> check: the next rounds must win it back
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-[13px]">
              <input type="radio" name={`${c.id}-${r.n}`} checked={!!relax[c.id]} onChange={() => setRelax((x) => ({ ...x, [c.id]: true }))} className="mt-1 accent-[var(--accent)]" />
              <span>
                Change the check to “{c.target!.op === '<=' ? <>under</> : <>at least</>} <span translate="no">{valueText(c, v, c.target!.value)}</span>”
              </span>
            </label>
          </div>
        );
      })}
      <label className="mt-2 block text-[11.5px] text-fg-3">{what === 'from' ? 'What to try instead (optional, goes to later rounds)' : 'Why (goes to later rounds)'}</label>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && !working && void go()}
        aria-label={what === 'from' ? 'What to try instead' : 'Why'}
        className={cx(inputCls, '!h-8 mt-0.5 !text-[13px]')}
      />
      <div className="mt-2.5 flex gap-2">
        <Button size="sm" variant="primary" disabled={working} onClick={() => void go()}>
          {button}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Detail({ g, r }: { g: GoalState; r: GoalRound }) {
  const [panel, setPanel] = useState<'keep' | 'undo' | 'from' | null>(null);
  const wait = busy(g.status);
  const was = before(g, r);
  const res = (c: GoalCheck) => r.results.find((x) => x.id === c.id);
  const sayBtn = (what: 'keep' | 'undo' | 'from', label: string) => (
    <span title={wait ? pauseWait(g) : undefined}>
      <Button size="sm" variant={panel === what ? 'secondary' : 'ghost'} disabled={wait} onClick={() => setPanel(panel === what ? null : what)}>
        {label}
      </Button>
    </span>
  );
  return (
    <div className="space-y-2 border-t border-line bg-bg-1/40 px-4 py-3 text-[13px] sm:pl-12">
      {r.did && (
        <p translate="no" className="leading-snug text-fg-2">
          {r.did}
        </p>
      )}
      {r.remains && (
        <p translate="no" className="leading-snug text-fg-3">
          {r.remains}
        </p>
      )}
      <ul className="space-y-0.5">
        {g.contract.checks.map((c) => {
          const x = res(c);
          if (!x) return null;
          return (
            <li key={c.id}>
              <div className="flex items-center gap-2">
                <span className="flex w-4 shrink-0 justify-center">
                  {x.since != null ? <span className="text-fg-3">—</span> : <Mark c={c} holds={x.holds} error={x.error} />}
                </span>
                <span translate="no" className={cx('min-w-0 flex-1 truncate', x.holds ? 'text-fg-2' : 'text-fg')}>
                  {shortLabel(c)}
                </span>
                <span title={sinceTitle(x)} className={cx('shrink-0 text-[12.5px] tnum', x.since != null || x.holds ? 'text-fg-3' : c.kind === 'measure' ? 'text-fg-3' : 'text-err')}>
                  {say(r.n === 0 ? startResultText(c, x) : resultText(c, x))}
                </span>
              </div>
              {!x.holds && x.since == null && (x.error || x.detail) && (
                <pre translate="no" className="mt-1 mb-1.5 max-h-40 overflow-auto rounded-lg bg-bg-2 px-3 py-1.5 font-mono text-[11.5px] whitespace-pre-wrap text-fg-2">
                  {(x.error ?? x.detail ?? '').trim()}
                </pre>
              )}
            </li>
          );
        })}
      </ul>
      {r.outcome !== 'start' && (
        <p className="flex items-start gap-2 text-fg-2">
          <Undo2 size={13} className={cx('mt-1 shrink-0 text-fg-3', r.outcome === 'kept' && 'hidden')} />
          <span>
            <span className="font-medium">{outcomeLabel(r)}</span>
            {r.why && (
              <>
                {': '}
                <span translate="no">{r.why.replace(/[.!?]?$/, '.')}</span>
              </>
            )}
            {r.outcome === 'undone' && g.undo && ` The files went back to ${was && was.n > 0 ? `round ${was.n}` : 'where they started'}.`}
            {r.reason && (
              <>
                {' Your reason: '}
                <span translate="no">{r.reason}</span>
              </>
            )}
          </span>
        </p>
      )}
      {g.undo && (
        <div>
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-[12px] text-fg-3">Your say</span>
            {r.outcome === 'undone' && r.n > 0 && sayBtn('keep', 'Keep anyway…')}
            {r.outcome === 'kept' && r.n > 0 && sayBtn('undo', 'Undo')}
            {sayBtn('from', 'Another way from here')}
          </div>
          {panel && <SayPanel key={panel} g={g} r={r} what={panel} onClose={() => setPanel(null)} />}
        </div>
      )}
    </div>
  );
}

function Row({ g, r, open, toggle }: { g: GoalState; r: GoalRound; open: boolean; toggle: () => void }) {
  const undone = r.outcome === 'undone';
  const change = changeText(g, r);
  return (
    <li>
      <button type="button" onClick={toggle} aria-expanded={open} className={cx('flex min-h-[34px] w-full items-center gap-2.5 px-3 py-1 text-left transition-colors hover:bg-bg-2', open && 'bg-bg-2/60')}>
        <Marker g={g} r={r} />
        <span className="w-4 shrink-0 text-center text-[12px] text-fg-3 tnum">{r.n === 0 ? '–' : r.n}</span>
        <span translate="no" className={cx('min-w-0 flex-1 truncate text-[13.5px]', undone ? 'text-fg-3' : 'text-fg')}>
          {roundName(r)}
        </span>
        {g.best === r.n && r.n > 0 && <Badge>Best so far</Badge>}
        {change && (
          <span translate={r.n === 0 || change === 'No gain' ? undefined : 'no'} className="max-w-[40%] shrink truncate text-right font-mono text-[11.5px] text-fg-3 max-sm:hidden">
            {change}
          </span>
        )}
        {outcomeLabel(r) && <Chip g={g} r={r} />}
        {membersText(r) && <span className="shrink-0 text-[11.5px] text-fg-3 tnum max-md:hidden">{membersText(r)}</span>}
        <span className="w-[84px] shrink-0 text-right text-[11.5px] text-fg-3 tnum max-md:hidden">
          {roundCost(r)}
        </span>
        <ChevronRight size={13} className={cx('shrink-0 text-fg-3 transition-transform duration-200', open && 'rotate-90')} />
      </button>
      {open && <Detail g={g} r={r} />}
    </li>
  );
}

/** The round that runs now: a row with no result yet. */
function Running({ g }: { g: GoalState }) {
  if (g.round == null || (g.status !== 'working' && g.status !== 'checking')) return null;
  return (
    <li className="flex min-h-[34px] items-center gap-2.5 px-3 py-1">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-accent/60">
        <span className="h-2 w-2 rounded-full bg-accent" />
      </span>
      <span className="w-4 shrink-0 text-center text-[12px] text-fg-3 tnum">{g.round}</span>
      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{g.status === 'checking' ? 'Running the checks' : 'Working on it'}</span>
      <Badge tone="info">{g.status === 'checking' ? 'Checking' : 'Working'}</Badge>
    </li>
  );
}

export function Rounds({ g, onClose, className }: { g: GoalState; onClose: () => void; className?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const t = tally(g);
  return (
    <div className={cx('anim-expand overflow-hidden rounded-2xl border border-line bg-panel', className)}>
      <button type="button" onClick={onClose} aria-label="Close the rounds" className="flex w-full items-center gap-2 px-4 py-2 text-left text-[13px] hover:bg-bg-2/60">
        <ChevronDown size={14} className="shrink-0 text-fg-3" />
        <span className="font-medium">Rounds</span>
        <span className="text-fg-3">
          {t.kept} kept · {t.undone} undone
        </span>
      </button>
      <ul className={cx('divide-y divide-line/60 border-t border-line', g.rounds.length > ROWS_SHOWN && 'max-h-[320px] overflow-y-auto')}>
        {g.rounds.map((r) => (
          <Row key={r.n} g={g} r={r} open={open === r.n} toggle={() => setOpen(open === r.n ? null : r.n)} />
        ))}
        <Running g={g} />
      </ul>
    </div>
  );
}
