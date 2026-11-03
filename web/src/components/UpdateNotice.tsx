// The Mac app's new version, downloaded by itself and about to install: a note over every page that counts down the
// minute before the app restarts into it, with Restart now and Later (it asks again in 4 hours). It sits with the
// toasts, and shows as it is, without fading in. Then, while the app restarts, a line that says so.
import { useEffect, useMemo, useState } from 'react';
import { CircleArrowUp } from 'lucide-react';
import type { UpdateState } from '@shared/types';
import { post } from '../lib/api';
import { toastError, useApp } from '../lib/store';
import { Button, Throbber } from './ui';

/** Restart now: this page reloads into the new version once the app is back with it (lib/store.ts). */
export async function restartToUpdate() {
  try {
    sessionStorage.setItem('wa.updating', '1');
  } catch {}
  try {
    const r = await post<{ update: UpdateState | null }>('/api/update/install');
    const boot = useApp.getState().boot;
    if (boot) useApp.getState().set({ boot: { ...boot, update: r.update ?? undefined } });
  } catch (e) {
    try {
      sessionStorage.removeItem('wa.updating');
    } catch {}
    toastError(e);
  }
}

/** Later: it asks again in 4 hours. */
export async function updateLater() {
  try {
    const r = await post<{ update: UpdateState | null }>('/api/update/later');
    const boot = useApp.getState().boot;
    if (boot) useApp.getState().set({ boot: { ...boot, update: r.update ?? undefined } });
  } catch (e) {
    toastError(e);
  }
}

export function UpdateNotice() {
  const update = useApp((s) => s.boot?.update);
  const ready = update?.kind === 'app' ? update.ready : undefined;
  const restarting = update?.kind === 'app' && update.running?.phase === 'restart';
  // Counted from when this page heard of it: the server's clock may differ from this device's.
  const deadline = useMemo(() => (ready?.installIn != null ? Date.now() + ready.installIn : null), [ready]);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (deadline == null) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [deadline]);
  useEffect(() => setBusy(false), [ready?.version, deadline]);

  if (restarting)
    return (
      <div role="status" className="pointer-events-auto flex w-[min(92vw,340px)] items-center gap-2.5 rounded-xl border border-line bg-elevated px-3.5 py-2.5 text-[13px] text-fg-2 shadow-lg">
        <Throbber className="shrink-0 text-fg-3" />
        <span className="min-w-0 flex-1">Opening the new version, this page reconnects by itself…</span>
      </div>
    );
  if (!ready || deadline == null) return null;
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };
  return (
    <div role="alert" className="pointer-events-auto w-[min(92vw,340px)] rounded-xl border border-accent/35 bg-elevated px-3.5 py-3 text-[13px] shadow-lg">
      <div className="flex items-start gap-2.5">
        <CircleArrowUp size={16} className="mt-0.5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-fg">{`Hydor ${ready.version} is ready`}</div>
          <div className="mt-0.5 text-[12.5px] leading-snug text-fg-3">
            <span className="tnum">{left > 0 ? `Restarting in ${left} s to install it. Running agents carry on.` : 'Restarting to install it. Running agents carry on.'}</span>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button size="sm" variant="primary" disabled={busy} onClick={() => act(restartToUpdate)}>
              Restart now
            </Button>
            <Button size="sm" variant="secondary" disabled={busy || left === 0} onClick={() => act(updateLater)}>
              Later
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
