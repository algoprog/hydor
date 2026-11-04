// The desktop apps (desktop/): when the server runs inside one, the app starts it with HYDOR_DESKTOP (mac, windows or
// linux) and a message channel (Node's IPC), starts it again whenever it exits (agents carry on, as with the Linux
// service), and installs the new versions the server downloads (updates.ts). Elsewhere `desktop` is null.
//
// The channel both ways: the server tells the app what to show (a new version ready, an agent using the Mac) and
// what to do (install), asks it what only it can find out or do (macOS's permissions for computer use, and asking
// for them), and hears what you chose in its menus (Restart to Update, Stop) and, on Windows, that it should stop
// (quit: Windows has no signal a program can catch for that).
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

export type DesktopPlatform = 'mac' | 'windows' | 'linux';
/**
 * How the app was installed, which decides how it updates: a Mac app (`app`), Windows' installer (`nsis`), an
 * AppImage, the Linux .deb package; `dir` (an unpacked build) and `dev` do not update themselves.
 */
export type DesktopFormat = 'app' | 'nsis' | 'appimage' | 'deb' | 'dir' | 'dev';

export interface Desktop {
  platform: DesktopPlatform;
  format: DesktopFormat;
  /** What opens the app: its bundle (`/Applications/Hydor.app`), Hydor.exe, the AppImage, or /opt/Hydor/hydor. */
  app: string;
  /**
   * Whether the app may replace itself: a Mac app in a folder you can write to, not run from the disk image or a
   * translocated copy; an AppImage in a folder you can write to; Windows' installer for your account; the .deb with
   * your password (pkexec).
   */
  updatable: boolean;
  /** Where updates are downloaded and unpacked. */
  cache: string;
  /** What the last attempt to install a new version left to say, from the app (it rolled back, or could not swap). */
  updateError?: { from: string; to: string; error: string };
}

const PLATFORMS: DesktopPlatform[] = ['mac', 'windows', 'linux'];
const FORMATS: DesktopFormat[] = ['app', 'nsis', 'appimage', 'deb', 'dir', 'dev'];

function read(): Desktop | null {
  const platform = process.env.HYDOR_DESKTOP as DesktopPlatform;
  if (!PLATFORMS.includes(platform) || !process.env.HYDOR_DESKTOP_APP) return null;
  const given = process.env.HYDOR_DESKTOP_FORMAT as DesktopFormat;
  // A Mac app from before the others came says no format.
  const format = FORMATS.includes(given) ? given : platform === 'mac' ? 'app' : 'dir';
  let updateError: Desktop['updateError'];
  try {
    updateError = process.env.HYDOR_UPDATE_ERROR ? JSON.parse(process.env.HYDOR_UPDATE_ERROR) : undefined;
  } catch {}
  return {
    platform,
    format,
    app: process.env.HYDOR_DESKTOP_APP,
    updatable: process.env.HYDOR_DESKTOP_UPDATABLE === '1',
    cache: process.env.HYDOR_DESKTOP_CACHE || (platform === 'mac' ? path.join(os.homedir(), 'Library/Caches/Hydor') : path.join(os.tmpdir(), 'hydor-cache')),
    updateError,
  };
}

export const desktop = read();

/** The system's name, as the app's words say it. */
export const SYSTEM_NAME: Record<DesktopPlatform, string> = { mac: 'Mac', windows: 'Windows', linux: 'Linux' };

/** A notification from the Mac, with a button. */
export interface DesktopNotice {
  title: string;
  body: string;
  /** The button's words (Restart Now). */
  action: string;
}

/** What the app is asked, and answers (askDesktop). */
export type DesktopAsk = { what: 'permissions' } | { what: 'request'; which: 'accessibility' | 'screen' };

/** Messages to the Mac app. */
export type ToDesktop =
  | { type: 'ready'; url: string; setupToken?: string }
  | { type: 'install'; app: string; from: string; to: string }
  /**
   * A new version is downloaded and waits (null: none): the menu-bar menu offers Restart to Update; with `notice`, a
   * notification from the Mac says it restarts into it in a minute (clicking it opens the app, its button installs now).
   */
  | { type: 'update'; version: string | null; notice?: DesktopNotice }
  /** An agent is using the Mac (computer use), or no longer: the menu bar says so, with Stop (and ⌘⇧Esc meanwhile). */
  | { type: 'computer'; active: boolean; title?: string }
  | ({ type: 'ask'; id: string } & DesktopAsk);

/** Messages from the app: Restart to Update (its menu, the notification), Stop (its menu, ⌘⇧Esc), quit (Windows), and answers. */
export type FromDesktop = { type: 'update-now' } | { type: 'computer-stop' } | { type: 'quit' } | { type: 'reply'; id: string; ok: boolean; error?: string; [k: string]: unknown };

export function tellDesktop(m: ToDesktop): boolean {
  if (!desktop || !process.send || !process.connected) return false;
  try {
    process.send(m);
    return true;
  } catch {
    return false;
  }
}

const waiting = new Map<string, { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
const listeners = new Map<string, Set<(m: FromDesktop) => void>>();
let listening = false;

function listen() {
  if (listening || !desktop) return;
  listening = true;
  process.on('message', (raw: unknown) => {
    const m = raw as FromDesktop | null;
    if (!m || typeof m !== 'object' || typeof m.type !== 'string') return;
    if (m.type === 'reply') {
      const w = waiting.get(String(m.id));
      if (!w) return;
      waiting.delete(String(m.id));
      clearTimeout(w.timer);
      if (m.ok === false) w.reject(new Error(String(m.error ?? 'the Mac app could not do it')));
      else w.resolve(m as Record<string, unknown>);
      return;
    }
    for (const fn of listeners.get(m.type) ?? []) {
      try {
        fn(m);
      } catch (e) {
        console.error(`[desktop] ${m.type}:`, e);
      }
    }
  });
}

/** Hears one kind of message from the Mac app (nothing elsewhere). Returns how to stop. */
export function onDesktop(type: Exclude<FromDesktop['type'], 'reply'>, fn: (m: FromDesktop) => void): () => void {
  listen();
  let set = listeners.get(type);
  if (!set) listeners.set(type, (set = new Set()));
  set.add(fn);
  return () => {
    set.delete(fn);
  };
}

/** Asks the Mac app, and waits for its answer (fails outside it, or when it does not answer in time). */
export function askDesktop<T extends Record<string, unknown>>(q: DesktopAsk, timeoutMs = 8000): Promise<T> {
  if (!desktop) return Promise.reject(new Error('Not in the Mac app'));
  listen();
  const id = crypto.randomBytes(6).toString('hex');
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      waiting.delete(id);
      reject(new Error('the Mac app did not answer'));
    }, timeoutMs);
    timer.unref?.();
    waiting.set(id, { resolve: resolve as (v: Record<string, unknown>) => void, reject, timer });
    if (!tellDesktop({ type: 'ask', id, ...q } as ToDesktop)) {
      clearTimeout(timer);
      waiting.delete(id);
      reject(new Error('the Mac app did not answer'));
    }
  });
}
