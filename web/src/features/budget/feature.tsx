// Spending caps: the most a session may spend, at API prices. A small dock above the message box while
// one is set ("$1.20 of $5.00"), the session menu's Spending cap, a note under a turn stopped at the
// cap, and a cap for a new session on the start page.
import { useRef, useState } from 'react';
import { OctagonAlert, Wallet } from 'lucide-react';
import { parseCap, usd, type BudgetNote } from '@shared/budget';
import type { SessionExtra, SessionNote } from '@shared/features';
import type { SessionSummary } from '@shared/types';
import { Button, cx, inputCls, MenuItem, Popover, SettingChip } from '../../components/ui';
import { openSession } from '../../lib/nav';
import { compact } from '../../lib/format';
import type { WebFeature } from '../registry';
import { CapDialog } from './CapDialog';
import { useBudget, useCapDialog } from './state';

const capOf = (x?: SessionExtra) => (typeof x?.capUsd === 'number' && x.capUsd > 0 ? x.capUsd : undefined);

/** Above the message box while a cap is set: what is spent of it. Also where the cap dialog opens. */
function CapDock({ s }: { s: SessionSummary }) {
  const cap = capOf(s.extra);
  const router = s.agent === 'acp' && s.model?.startsWith('openrouter/');
  const st = useBudget(s.key, cap != null || !!router, `${cap}|${s.stats.costUsd}|${s.stats.tokensOut}|${s.live?.status}`);
  const openDialog = useCapDialog((x) => x.open);
  const spent = st?.spentUsd ?? 0;
  const share = cap ? Math.min(1, spent / cap) : 0;
  const reached = !!st?.reached;
  const near = !reached && share >= 0.8;
  return (
    <>
      {router && cap == null && (
        <div className="mx-3 mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-3 text-[12px] text-fg-3 sm:mx-auto sm:w-[calc(100%-48px)] sm:max-w-[800px]">
          <span>API cost: <span className="tnum text-fg-2">{st && !st.unpriced ? usd(st.spentUsd) : s.stats.costUsd != null ? usd(s.stats.costUsd) : '—'}</span></span>
          <span className="tnum">{compact(s.stats.tokensIn + s.stats.tokensCached)} in · {compact(s.stats.tokensCached)} cached · {compact(s.stats.tokensOut)} out</span>
        </div>
      )}
      {cap != null && (
        <div className="mx-3 mb-2 flex items-center gap-2.5 rounded-xl border border-line bg-bg-1 px-3 py-1.5 text-[12.5px] sm:mx-auto sm:w-[calc(100%-48px)] sm:max-w-[800px]">
          <Wallet size={14} className={cx('shrink-0', reached ? 'text-err' : near ? 'text-warn' : 'text-fg-3')} />
          <span className="tnum shrink-0" title={st?.childrenUsd ? `This session ${usd(st.ownUsd)}, its child sessions ${usd(st.childrenUsd)}` : 'Spent at API prices'}>
            <span className="font-medium text-fg">{st ? usd(spent) : '…'}</span>
            <span className="text-fg-3"> of {usd(cap)}</span>
          </span>
          <span className="h-1.5 min-w-10 flex-1 overflow-hidden rounded-full bg-bg-3" aria-hidden>
            <span className={cx('block h-full rounded-full transition-[width] duration-500', reached ? 'bg-err' : near ? 'bg-warn' : 'bg-accent')} style={{ width: `${Math.max(share * 100, spent > 0 ? 2 : 0)}%` }} />
          </span>
          {reached ? <span className="shrink-0 text-err">Cap reached</span> : st?.childrenUsd ? <span className="shrink-0 text-fg-3 max-sm:hidden">with children</span> : null}
          <button type="button" onClick={() => openDialog(s.key)} className="shrink-0 font-medium text-accent hover:underline">
            {reached ? 'Raise' : 'Change'}
          </button>
        </div>
      )}
      <CapDialog s={s} />
    </>
  );
}

function CapMenuItem({ s, close }: { s: SessionSummary; close: () => void }) {
  const open = useCapDialog((x) => x.open);
  const cap = capOf(s.extra);
  return (
    <MenuItem icon={<Wallet size={15} />} hint={cap != null ? usd(cap) : undefined} onClick={() => (close(), open(s.key))}>
      Spending cap
    </MenuItem>
  );
}

/** Under a turn the cap stopped. */
function CapNote({ note, sessionKey }: { note: SessionNote; sessionKey: string }) {
  const d = note.data as BudgetNote;
  const open = useCapDialog((x) => x.open);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-xl border border-warn/30 bg-warn/[0.07] px-3 py-2 text-[13px]">
      <OctagonAlert size={15} className="shrink-0 text-warn" />
      <span className="min-w-0 flex-1 text-fg-2">
        {d.parent ? (
          <>
            Stopped: <span className="text-fg">{d.parent.title}</span>, which started this session, reached its spending cap ({usd(d.spentUsd)} of {usd(d.capUsd)}).
          </>
        ) : (
          <>
            Stopped at the spending cap: <span className="tnum text-fg">{usd(d.spentUsd)}</span> of {usd(d.capUsd)}.
          </>
        )}
      </span>
      {d.parent ? (
        <Button size="sm" variant="ghost" onClick={() => openSession(d.parent!.key)}>
          Open it
        </Button>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => open(sessionKey)}>
          Raise the cap…
        </Button>
      )}
    </div>
  );
}

/** On the start page: a cap for the new session. */
function StartCap({ value, onChange }: { value: SessionExtra; onChange: (patch: Partial<SessionExtra>) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [v, setV] = useState('');
  const cap = capOf(value);
  const parsed = parseCap(v);
  const set = (n: number | undefined) => {
    onChange({ capUsd: n });
    setOpen(false);
  };
  return (
    <>
      <SettingChip
        ref={ref}
        label="Spending cap"
        value={cap != null ? usd(cap) : 'None'}
        on={cap != null}
        open={open}
        onClick={() => {
          setV(cap != null ? String(cap) : '');
          setOpen((o) => !o);
        }}
        title={cap != null ? `This session stops once it has spent ${usd(cap)} (API prices)` : 'No limit on what this session spends. Click to set the most it may spend'}
      />
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={264} title="Spending cap">
        <div className="p-2">
          <div className="mb-2 text-[12.5px] leading-snug text-fg-3">The most this session may spend, at API prices. It stops there until you raise the cap.</div>
          <div className="flex gap-1.5">
            <div className="relative min-w-0 flex-1">
              <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[13px] text-fg-3">$</span>
              <input
                autoFocus
                inputMode="decimal"
                value={v}
                placeholder="5.00"
                onChange={(e) => setV(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && parsed?.cap != null && set(parsed.cap)}
                className={cx(inputCls, '!h-8 pl-5 text-[13px]')}
              />
            </div>
            <Button size="sm" variant="primary" disabled={parsed?.cap == null} onClick={() => parsed?.cap != null && set(parsed.cap)}>
              Set
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {[1, 5, 10, 25].map((n) => (
              <button key={n} type="button" onClick={() => set(n)} className="h-7 rounded-full border border-line px-2.5 text-[12.5px] text-fg-2 transition-colors hover:bg-bg-2">
                {usd(n)}
              </button>
            ))}
          </div>
        </div>
        {cap != null && <MenuItem onClick={() => set(undefined)}>No cap</MenuItem>}
      </Popover>
    </>
  );
}

export const budgetFeature: WebFeature = {
  id: 'budget',
  noteViews: { budget: CapNote },
  SessionMenu: CapMenuItem,
  sessionMenuPart: 'settings',
  SessionDock: CapDock,
  StartOptions: StartCap,
};
