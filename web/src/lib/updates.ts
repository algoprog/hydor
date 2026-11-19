// Updating Hydor, in words: what an update is doing, and why a copy cannot update itself. Settings → General says it of
// the machine its page shows, and an older machine's page of that machine (features/machines/MachineOld.tsx).
import { useEffect, useState } from 'react';
import { compareVersions } from '@shared/releases';
import type { UpdateState } from '@shared/types';
import { estimateRemote, newRemoteRun, type RemoteRun, type UpdateProgress } from '@shared/update-progress';
import { tr } from '../i18n/runtime';

/** What an update is doing. */
export const UPDATE_PHASE: Record<NonNullable<UpdateState['running']>['phase'], string> = {
  pull: 'Getting the new version',
  download: 'Downloading the new version',
  install: 'Installing packages',
  build: 'Building',
  restart: 'Restarting, this page reconnects by itself',
};

/** Megabytes, whole, for how much of a download has come. */
export const mb = (n: number) => Math.round(n / 1e6);

/**
 * A desktop app's new version coming down: which version, how many bytes of how many, and how much of it (0 to 1).
 * `checking` is when the bytes are all in and it is being checked and unpacked. Null when no download is running, or
 * its size is not known yet (the first instant), and for a copy from git.
 */
export function downloadOf(update: UpdateState | undefined) {
  const run = update?.kind === 'app' ? update.running : undefined;
  if (!run || run.phase !== 'download' || !run.total) return null;
  const done = run.done ?? 0;
  return { to: run.to, done, total: run.total, share: Math.max(0, Math.min(1, done / run.total)), checking: done >= run.total };
}

let remote: RemoteRun = newRemoteRun();

/**
 * How far an update of a copy from git has got, or null when none runs (or in its last step, the restart, which has
 * its own words). From the share, step and time left the server sends; a machine running an older Hydor sends none (its
 * update is the very case: minutes of "Installing packages…"), and its phase and start give the estimate, with the same
 * guesses and curve as the server's (shared/update-progress.ts).
 */
export function progressOf(update: UpdateState | undefined, now: number): UpdateProgress | null {
  const run = update?.kind === 'app' ? undefined : update?.running;
  if (!run) {
    remote = newRemoteRun();
    return null;
  }
  if (run.phase === 'download' || run.phase === 'restart') return null;
  if (typeof run.share === 'number') return { share: Math.max(0, Math.min(1, run.share)), step: run.step ?? 1, steps: run.steps ?? 1, left: run.left, slow: run.slow };
  return estimateRemote(remote, run, !!update?.canRestart, now);
}

/** progressOf, drawn again every second while a copy from git updates (the clock is the estimate's input). */
export function useUpdateProgress(update: UpdateState | undefined): UpdateProgress | null {
  const active = !!update && update.kind !== 'app' && !!update.running && update.running.phase !== 'download' && update.running.phase !== 'restart';
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return progressOf(update, active ? now : Date.now());
}

/** How long is left, in words: "less than a minute left", "about 2 min left", "about 2 h left"; nothing when it is not known. */
export function leftWords(p: UpdateProgress): string | null {
  if (p.slow) return tr('taking longer than usual');
  if (p.left == null) return null;
  const min = Math.round(p.left / 60_000);
  if (p.left < 45_000) return tr('less than a minute left');
  if (min <= 1) return tr('about 1 min left');
  if (min < 90) return tr(`about ${min} min left`);
  return tr(`about ${Math.round(min / 60)} h left`);
}

/** The small line under an update's bar: "Step 2 of 3 · about 2 min left". */
export function stepWords(p: UpdateProgress): string {
  const left = leftWords(p);
  const step = p.steps > 1 ? tr(`Step ${p.step} of ${p.steps}`) : '';
  return [step, left].filter(Boolean).join(' · ');
}

/** Why a desktop app cannot update itself where it is (as the server says when you try). */
export function cannotUpdate(update: UpdateState): string {
  switch (update.format) {
    case 'app':
      return 'Move Hydor to your Applications folder to update it.';
    case 'appimage':
      return 'Put the AppImage in a folder you can write to (your home folder, say) to update it.';
    case 'deb':
      return 'Updating the .deb needs pkexec: install the new version from the Releases page.';
    default:
      return 'This copy does not update itself: install the new version from the Releases page.';
  }
}

/** Hydor's history on GitHub was rewritten with this version: a copy from git or Docker older than that cannot fast-forward past it. */
export const REWRITTEN_AT = '0.78.0';

/** The installer, run again on that machine: it moves the copy to the new history, builds it and restarts it. */
export const INSTALL_AGAIN = 'curl -fsSL https://raw.githubusercontent.com/algoprog/hydor/main/install.sh | bash';

/** How to update such a copy in Docker or from a clone of your own: this machine's guide (an older one's lacks it). */
export const BY_HAND = '/guide/app#update-an-older-copy-by-hand';

/**
 * Whether an update failed because the copy is from before Hydor's history was rewritten (0.78.0): its updater only
 * fast-forwards, so it is updated once on that machine itself (BeforeRewrite says how).
 */
export const beforeRewrite = (version: string | undefined, error: string | undefined): boolean =>
  !!version && !!error && /fast-forward/i.test(error) && compareVersions(version, REWRITTEN_AT) < 0;
