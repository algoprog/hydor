// The spending cap dialog (the session's menu → Spending cap, or the dock): what the session has spent,
// and the most it may spend. Setting it above what is spent lets held messages go on.
import { useEffect, useState } from 'react';
import { parseCap, usd, type BudgetState } from '@shared/budget';
import type { SessionSummary } from '@shared/types';
import { Button, cx, Dialog, inputCls } from '../../components/ui';
import { api, enc, put } from '../../lib/api';
import { toast, toastError } from '../../lib/store';
import { useCapDialog } from './state';

const PICKS = [1, 5, 10, 25];

export function CapDialog({ s }: { s: SessionSummary }) {
  const open = useCapDialog((x) => x.key === s.key);
  const close = useCapDialog((x) => x.close);
  const cap = typeof s.extra?.capUsd === 'number' ? s.extra.capUsd : undefined;
  const [st, setSt] = useState<BudgetState | null>(null);
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setV(cap != null ? String(cap) : '');
    api<BudgetState>(`/api/budget/${enc(s.key)}`)
      .then(setSt)
      .catch(() => {});
  }, [open, s.key]);
  const parsed = parseCap(v);
  const bad = v.trim() !== '' && !parsed;
  const save = async (capUsd: number | null) => {
    setBusy(true);
    try {
      const next = await put<BudgetState>(`/api/budget/${enc(s.key)}`, { capUsd });
      close();
      toast(capUsd == null ? 'No spending cap now' : next.reached ? `Cap set to ${usd(capUsd)}: already spent ${usd(next.spentUsd)}, so it stays stopped` : `Spending cap: ${usd(capUsd)}`);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const low = parsed?.cap != null && st ? parsed.cap <= st.spentUsd : false;
  return (
    <Dialog
      open={open}
      onClose={close}
      title="Spending cap"
      width={440}
      footer={
        <>
          {cap != null && (
            <Button variant="ghost" className="mr-auto" disabled={busy} onClick={() => save(null)}>
              Remove the cap
            </Button>
          )}
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || !parsed || parsed.cap == null} onClick={() => parsed?.cap != null && save(parsed.cap)}>
            {cap != null ? 'Change' : 'Set the cap'}
          </Button>
        </>
      }
    >
      <p className="text-[13px] leading-relaxed text-fg-3">
        The most this session may spend, at API prices (what its tokens would cost through the API, whatever plan you pay with). When it gets there the agent stops, and new
        messages wait until you raise or remove the cap. Child sessions it starts count too.
      </p>
      {st && (
        <div className="mt-3 rounded-xl bg-bg-2 px-3 py-2 text-[13px]">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-fg-2">Spent so far</span>
            <span className="tnum font-medium">{usd(st.spentUsd)}</span>
          </div>
          {st.childrenUsd > 0 && (
            <div className="mt-0.5 text-[12px] text-fg-3">
              This session {usd(st.ownUsd)}, its child sessions {usd(st.childrenUsd)}
            </div>
          )}
          {st.unpriced && <div className="mt-0.5 text-[12px] text-fg-3">Some of its tokens have no known price, so it may have spent more.</div>}
          {st.parent && (
            <div className="mt-0.5 text-[12px] text-fg-3">
              It also counts against the cap of “{st.parent.title}”, which started it: {usd(st.parent.spentUsd)} of {usd(st.parent.capUsd)}.
            </div>
          )}
        </div>
      )}
      <label className="mt-4 mb-1.5 block text-[12.5px] font-medium text-fg-2" htmlFor="cap-input">
        Cap
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[14px] text-fg-3">$</span>
        <input
          id="cap-input"
          autoFocus
          inputMode="decimal"
          value={v}
          placeholder="5.00"
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && parsed?.cap != null) save(parsed.cap);
          }}
          className={cx(inputCls, 'pl-6', bad && 'border-err/60')}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {PICKS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setV(String(n))}
            className={cx('h-7 rounded-full border px-2.5 text-[12.5px] transition-colors', parsed?.cap === n ? 'border-accent/50 bg-accent-soft text-accent' : 'border-line text-fg-2 hover:bg-bg-2')}
          >
            {usd(n)}
          </button>
        ))}
      </div>
      {(bad || low) && <p className={cx('mt-2 text-[12.5px]', bad ? 'text-err' : 'text-warn')}>{bad ? 'An amount in dollars, from $0.01.' : 'That is no more than it has spent: it stays stopped.'}</p>}
    </Dialog>
  );
}
