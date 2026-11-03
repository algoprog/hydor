// The Mac app (mac/): when the server runs inside it, the app starts it with NAGET_DESKTOP=mac and a message
// channel (Node's IPC), starts it again whenever it exits (agents carry on, as with the Linux service), and
// installs the new versions the server downloads (updates.ts). Elsewhere `desktop` is null.
import os from 'node:os';
import path from 'node:path';

export interface Desktop {
  /** The app's bundle, `/Applications/Naget Agent.app`. */
  app: string;
  /** Whether the app may replace itself: in a folder you can write to, not run from the disk image or a translocated copy. */
  updatable: boolean;
  /** Where updates are downloaded and unpacked. */
  cache: string;
  /** What the last attempt to install a new version left to say, from the app (it rolled back, or could not swap). */
  updateError?: { from: string; to: string; error: string };
}

function read(): Desktop | null {
  if (process.env.NAGET_DESKTOP !== 'mac' || !process.env.NAGET_DESKTOP_APP) return null;
  let updateError: Desktop['updateError'];
  try {
    updateError = process.env.NAGET_UPDATE_ERROR ? JSON.parse(process.env.NAGET_UPDATE_ERROR) : undefined;
  } catch {}
  return {
    app: process.env.NAGET_DESKTOP_APP,
    updatable: process.env.NAGET_DESKTOP_UPDATABLE === '1',
    cache: process.env.NAGET_DESKTOP_CACHE || path.join(os.homedir(), 'Library/Caches/Naget Agent'),
    updateError,
  };
}

export const desktop = read();

/** Messages to the Mac app. */
export type ToDesktop = { type: 'ready'; url: string; setupToken?: string } | { type: 'install'; app: string; from: string; to: string };

export function tellDesktop(m: ToDesktop): boolean {
  if (!desktop || !process.send || !process.connected) return false;
  process.send(m);
  return true;
}
