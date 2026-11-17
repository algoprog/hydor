// Updating Hydor, in words: what an update is doing, and why a copy cannot update itself. Settings → General says it of
// the machine its page shows, and an older machine's page of that machine (features/machines/MachineOld.tsx).
import { compareVersions } from '@shared/releases';
import type { UpdateState } from '@shared/types';

/** What an update is doing. */
export const UPDATE_PHASE: Record<NonNullable<UpdateState['running']>['phase'], string> = {
  pull: 'Getting the new version',
  download: 'Downloading the new version',
  install: 'Installing packages',
  build: 'Building',
  restart: 'Restarting, this page reconnects by itself',
};

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
