// The desktop apps (desktop/): when the server runs inside one, the app starts it with HYDOR_DESKTOP (mac, windows or
// linux) and a message channel (Node's IPC), starts it again whenever it exits (agents carry on, as with the Linux
// service), and installs the new versions the server downloads (updates.ts). Elsewhere `desktop` is null.
//
// The channel both ways: the server tells the app what to show (a new version ready, an agent using the computer, with
// the glow around the screen and its pointer over the real one, a session's notice as the system's own notification)
// and what to do (install), asks it what only it can find out or do (macOS's permissions
// for computer use, and asking for them; hiding the glow for a moment while it looks at the screen; letting go of Esc
// while the agent itself presses it; on Linux, a picture of the screen), and hears what you chose in its menus
// (Restart to Update, Stop, Esc) and, on Windows, that it should stop (quit: Windows has no signal a program can catch
// for that).
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import type { NotifyEvent } from '../shared/types.ts';
import type { Show } from './computer/plan.ts';

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

/** A notification from the system, with a button. */
export interface DesktopNotice {
  title: string;
  body: string;
  /** The button's words (Restart Now). */
  action: string;
}

/** What the app is asked, and answers (askDesktop). */
export type DesktopAsk =
  | { what: 'permissions' }
  | { what: 'request'; which: 'accessibility' | 'screen' }
  /** Hide the glow around the screen, and answer once it is gone (a screenshot follows; { type: 'glow' } shows it again). */
  | { what: 'glow'; show: false }
  /** Let go of Esc (the agent is about to press it), and answer once it has; { type: 'esc' } takes it back. */
  | { what: 'esc'; on: false }
  /** The main display as a JPEG at most `max` pixels on its longer side, the glow hidden meanwhile (Linux). */
  | { what: 'screenshot'; max: number; quality: number };

/** Messages to the desktop app. */
export type ToDesktop =
  | { type: 'ready'; url: string; setupToken?: string }
  | { type: 'install'; app: string; from: string; to: string }
  /**
   * A new version is downloaded and waits (null: none): the menu-bar menu offers Restart to Update; with `notice`, a
   * notification from the Mac says it restarts into it in a minute (clicking it opens the app, its button installs now).
   */
  | { type: 'update'; version: string | null; notice?: DesktopNotice }
  /**
   * An agent is using the computer (computer use), or no longer: a glow lines the screen's edges (unless `glow` is
   * false: a Linux desktop without a compositor), its note says `using` and `esc`, Esc stops it (and ⌘⇧Esc on a Mac),
   * and the menu bar or tray says so, with Stop.
   */
  | { type: 'computer'; active: boolean; title?: string; using?: string; esc?: string; glow?: boolean; agent?: string }
  /**
   * The agent's pointer, drawn over the real one in the glow's windows while the driver acts: a timeline (ms from now)
   * of where it goes and what it does there (a ring and halo with the `agent` tag, a ripple on a click, the keys or
   * words beside it), in the driver's places (points on a Mac, pixels elsewhere). Hidden with the glow for screenshots.
   */
  | { type: 'pointer'; steps: Show[] }
  /** The glow back after a screenshot. */
  | { type: 'glow'; show: true }
  /** Esc stops the agent again, after it pressed Esc itself. */
  | { type: 'esc'; on: true }
  /**
   * A session finished, failed or needs you (`n`, the notice the pages hear): the app shows it as the system's own
   * notification, with this title and body in the user's language, a click on it opening `path`; one the system does
   * not show (not allowed in its settings) goes to the window's page, which shows it inside the app.
   */
  | { type: 'notice'; n: NotifyEvent; title: string; body: string; path: string }
  | ({ type: 'ask'; id: string } & DesktopAsk);

/** Messages from the app: Restart to Update (its menu, the notification), Stop (its menu, Esc, ⌘⇧Esc), quit (Windows), and answers. */
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
      if (m.ok === false) w.reject(new Error(String(m.error ?? 'the desktop app could not do it')));
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

/** Hears one kind of message from the desktop app (nothing elsewhere). Returns how to stop. */
export function onDesktop(type: Exclude<FromDesktop['type'], 'reply'>, fn: (m: FromDesktop) => void): () => void {
  listen();
  let set = listeners.get(type);
  if (!set) listeners.set(type, (set = new Set()));
  set.add(fn);
  return () => {
    set.delete(fn);
  };
}

/** Asks the desktop app, and waits for its answer (fails outside it, or when it does not answer in time). */
export function askDesktop<T extends Record<string, unknown>>(q: DesktopAsk, timeoutMs = 8000): Promise<T> {
  if (!desktop) return Promise.reject(new Error('Not in the desktop app'));
  listen();
  const id = crypto.randomBytes(6).toString('hex');
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      waiting.delete(id);
      reject(new Error('the desktop app did not answer'));
    }, timeoutMs);
    timer.unref?.();
    waiting.set(id, { resolve: resolve as (v: Record<string, unknown>) => void, reject, timer });
    if (!tellDesktop({ type: 'ask', id, ...q } as ToDesktop)) {
      clearTimeout(timer);
      waiting.delete(id);
      reject(new Error('the desktop app did not answer'));
    }
  });
}
