// The Mac app's new version, downloaded by itself and about to install: a note over every page that counts down the
// minute before the app restarts into it, with Restart now and Later (it asks again in 4 hours). It sits with the
// toasts, and shows as it is, without fading in. Before it, a download you started with Update now: a card with the
// progress, unless Settings → General is open, which shows it itself. Then, while the app restarts, a line that says
// so (in a browser tab: the desktop app's window shows the whole-window screen instead, UpdateScreen.tsx).
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { CircleArrowUp } from 'lucide-react';
import type { UpdateState } from '@shared/types';
import { post } from '../lib/api';
import { machineId } from '../lib/machine';
import { inDesktopApp } from '../lib/notify';
import { toastError, useApp } from '../lib/store';
import { downloadOf, mb, stepWords, UPDATE_PHASE, useUpdateProgress } from '../lib/updates';
import { DownloadBar } from './DownloadBar';
import { Button, Throbber } from './ui';

// The pages that show the download themselves (Settings → General's version row): the card in the corner stays away
// while one is open.
let holders = 0;
const listeners = new Set<() => void>();
const heard = () => listeners.forEach((l) => l());

/** A page that shows the download itself calls this when it opens, and the function it returns when it closes. */
export function holdDownloadNote(): () => void {
  holders++;
  heard();
  return () => {
    holders--;
    heard();
  };
}

const listen = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
/** Whether a page that shows the download itself is open. */
const useHeld = () => useSyncExternalStore(listen, () => holders > 0);

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
  const away = useHeld();
  // A copy from git updating (started with Update now): how far it has got, drawn again each second.
  const g = useUpdateProgress(update);

  // A download you started (the app's own, in the background, stays quiet: Settings shows it).
  const d = downloadOf(update);
  if (d && update && !update.running?.auto && !away) {
    return (
      <div role="status" className="pointer-events-auto w-[min(92vw,340px)] rounded-xl border border-line bg-elevated px-3.5 py-3 text-[13px] shadow-lg">
        <div className="flex items-start gap-2.5">
          <CircleArrowUp size={16} className="mt-0.5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            {d.checking ? (
              <div className="font-medium text-fg">Checking the new version…</div>
            ) : (
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 font-medium text-fg">{d.to ? `Downloading Hydor ${d.to}` : 'Downloading the new version'}</span>
                <span className="tnum text-fg-3">{`${Math.round(d.share * 100)}%`}</span>
              </div>
            )}
            <DownloadBar share={d.share} className="mt-2" />
            {!d.checking && <p className="tnum mt-1.5 text-[12.5px] text-fg-3">{`${mb(d.done)} of ${mb(d.total)} MB`}</p>}
            <p className="mt-1.5 text-[12.5px] leading-snug text-fg-3">Hydor restarts into it once it is downloaded. Running agents carry on.</p>
          </div>
        </div>
      </div>
    );
  }

  // The same for an update of a copy from git (its steps: getting the new version, installing packages, building).
  if (g && update?.running && !update.running.auto && !away) {
    return (
      <div role="status" className="pointer-events-auto w-[min(92vw,340px)] rounded-xl border border-line bg-elevated px-3.5 py-3 text-[13px] shadow-lg">
        <div className="flex items-start gap-2.5">
          <CircleArrowUp size={16} className="mt-0.5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 font-medium text-fg">{UPDATE_PHASE[update.running.phase]}</span>
              <span className="tnum text-fg-3">{`${Math.round(g.share * 100)}%`}</span>
            </div>
            <DownloadBar share={g.share} label="Update" className="mt-2" />
            {stepWords(g) && <p className="tnum mt-1.5 text-[12.5px] text-fg-3">{stepWords(g)}</p>}
            <p className="mt-1.5 text-[12.5px] leading-snug text-fg-3">{update.canRestart ? 'Hydor restarts into it once it is built. Running agents carry on.' : 'Restart the server afterwards to use it.'}</p>
          </div>
        </div>
      </div>
    );
  }

  if (restarting) {
    // The desktop app's window shows the whole-window screen instead (UpdateScreen.tsx).
    if (inDesktopApp && !machineId) return null;
    return (
      <div role="status" className="pointer-events-auto flex w-[min(92vw,340px)] items-center gap-2.5 rounded-xl border border-line bg-elevated px-3.5 py-2.5 text-[13px] text-fg-2 shadow-lg">
        <Throbber className="shrink-0 text-fg-3" />
        <span className="min-w-0 flex-1">Opening the new version, this page reconnects by itself…</span>
      </div>
    );
  }
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
