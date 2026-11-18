import { desktopSystem } from './notify';
import { toast } from './store';
import { machineId, viaLink } from './machine';

/** The desktop app's bridge to the system's file manager (desktop/preload.cjs), in the app's own window only. */
const bridge = () => (window as unknown as { hydorDesktop?: { reveal?: (path: string) => Promise<boolean> } }).hydorDesktop?.reveal;

/**
 * Whether a file or folder of this page can be shown in the system's file manager: in the desktop app, for what is on
 * this computer (not another machine's pages, not a shared link's).
 */
export const canReveal = (): boolean => !!bridge() && !machineId && !viaLink;

/** The menu item's words, as the system calls its file manager. */
export const revealLabel = (): string => (desktopSystem === 'mac' ? 'Show in Finder' : desktopSystem === 'windows' ? 'Show in File Explorer' : 'Show in folder');

/** Shows a file or folder (its path on this computer) selected in the system's file manager; says so when it could not. */
export function reveal(path: string): void {
  const fn = bridge();
  const fail = (): void => void toast('This is not on this computer, or it is no longer there');
  if (!fn) return fail();
  void fn(path).then((ok) => ok || fail(), fail);
}
