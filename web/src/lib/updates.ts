// Updating Hydor, in words: what an update is doing, and why a copy cannot update itself. Settings → General says it of
// the machine its page shows, and an older machine's page of that machine (features/machines/MachineOld.tsx).
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
