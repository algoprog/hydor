// Computer use on Linux, on an X11 desktop: x11-helper.py (Python and X11's XTest, which every X11 desktop has) uses the
// mouse and keyboard and says where things are, the desktop app takes the picture of the screen (Electron's
// desktopCapturer, with its glow hidden meanwhile), and apps open by the names their .desktop entries give them. A
// desktop on Wayland lets no app see the screen or use the mouse and keyboard of the others, so there it says so.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { APP_ROOT } from '../config.ts';
import { askDesktop } from '../desktop.ts';
import type { DriverOut } from './driver.ts';
import { Helper } from './helper.ts';
import type { Machine, Shot } from './machine.ts';
import { driverTimeout, jpegSize, MAX_SIDE, type Op } from './plan.ts';

const SCRIPT = path.join(APP_ROOT, 'server/computer/x11-helper.py');

const helper = new Helper({ name: 'The X11 helper', command: () => ({ cmd: 'python3', args: ['-I', '-u', SCRIPT] }), startMs: 20_000 });

/** A desktop on Wayland (GNOME's and KDE's own sessions, most often): its apps cannot see or use the others. */
export function wayland(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.XDG_SESSION_TYPE === 'wayland' || (!!env.WAYLAND_DISPLAY && env.XDG_SESSION_TYPE !== 'x11');
}

export const WAYLAND =
  'This Linux desktop runs on Wayland, where one app cannot see the screen or use the mouse and keyboard of the others. Computer use needs an X11 (Xorg) session: log out, and choose one on the login screen (on Ubuntu, the gear at the bottom right → Ubuntu on Xorg).';

const NO_PYTHON = 'Computer use on Linux needs Python 3 (python3), which is not on this computer: install it (Debian, Ubuntu: sudo apt install python3).';

async function problem(): Promise<string | null> {
  if (wayland()) return WAYLAND;
  if (!process.env.DISPLAY) return 'There is no X11 display here (DISPLAY is not set): computer use needs the Linux app, on an X11 desktop.';
  try {
    await helper.start();
    return null;
  } catch (e) {
    const m = (e as Error).message;
    if (/ENOENT/.test(m)) return NO_PYTHON;
    // The helper's own words (a library missing) after "The X11 helper stopped (exit 3): ".
    return m.replace(/^The X11 helper (did not start|stopped \([^)]*\)):\s*/, '') || m;
  }
}

async function drive(ops: Op[], signal?: AbortSignal): Promise<DriverOut> {
  return (await helper.call({ ops }, { signal, timeoutMs: driverTimeout(ops) })) as unknown as DriverOut;
}

type Place = { x: number; y: number; w: number; h: number };

async function screenshot(signal?: AbortSignal): Promise<Shot> {
  const [shot, out] = await Promise.all([
    askDesktop<{ jpeg?: string; display?: Place; displays?: number }>({ what: 'screenshot', max: MAX_SIDE, quality: 70 }, 30_000),
    drive([{ op: 'info' }], signal),
  ]);
  if (signal?.aborted) throw new Error('Stopped');
  const jpeg = Buffer.from(String(shot.jpeg ?? ''), 'base64');
  const size = jpegSize(jpeg);
  if (!size) throw new Error('the desktop app made no picture of the screen');
  // The display the picture shows, in the X server's pixels: as the app found it, else as the helper did.
  const d = shot.display && shot.display.w > 0 ? shot.display : out.info?.display;
  if (!d || !(d.w > 0 && d.h > 0)) throw new Error('could not read the size of the main display');
  const info = out.info as (DriverOut['info'] & { window?: string }) | undefined;
  return {
    jpeg,
    geo: { width: size.width, height: size.height, x: d.x, y: d.y, w: d.w, h: d.h },
    app: info?.app,
    window: info?.window,
    pos: info?.pos,
    displays: shot.displays ?? info?.displays,
  };
}

// ---- apps, by their .desktop entries ---------------------------------------------------------------------------

interface Entry {
  /** Its desktop file id (org.gnome.TextEditor.desktop), and the file. */
  id: string;
  file: string;
  /** Its names: Name in English and in the user's language, and GenericName (Web Browser). */
  names: string[];
  generic: string[];
  exec: string;
  hidden: boolean;
}

function appDirs(): string[] {
  const home = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local/share');
  const data = (process.env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':').filter(Boolean);
  const all = [home, ...data, path.join(os.homedir(), '.local/share/flatpak/exports/share'), '/var/lib/flatpak/exports/share', '/var/lib/snapd/desktop'];
  return [...new Set(all)].map((d) => path.join(d, 'applications'));
}

function parseEntry(text: string, lang: string): Omit<Entry, 'id' | 'file'> | null {
  let inside = false;
  const keys: Record<string, string> = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('[')) {
      inside = line === '[Desktop Entry]';
      continue;
    }
    const eq = line.indexOf('=');
    if (!inside || eq < 0 || line.startsWith('#')) continue;
    keys[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  if ((keys.Type ?? 'Application') !== 'Application' || !keys.Name) return null;
  const short = lang.split('_')[0];
  const names = [keys.Name, keys[`Name[${lang}]`], keys[`Name[${short}]`]].filter(Boolean);
  const generic = [keys.GenericName, keys[`GenericName[${lang}]`], keys[`GenericName[${short}]`]].filter(Boolean);
  return { names, generic, exec: keys.Exec ?? '', hidden: keys.Hidden === 'true' || keys.NoDisplay === 'true' };
}

function entries(): Entry[] {
  const lang = (process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || '').split('.')[0];
  const seen = new Set<string>();
  const out: Entry[] = [];
  const walk = (dir: string, prefix: string) => {
    let list: fs.Dirent[];
    try {
      list = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of list) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, `${prefix}${e.name}-`);
      else if (e.name.endsWith('.desktop')) {
        const id = prefix + e.name;
        // The first of the same id wins: the user's own over the system's.
        if (seen.has(id)) continue;
        seen.add(id);
        try {
          const parsed = parseEntry(fs.readFileSync(p, 'utf8'), lang);
          if (parsed) out.push({ id, file: p, ...parsed });
        } catch {}
      }
    }
  };
  for (const d of appDirs()) walk(d, '');
  return out;
}

/** The entry that best answers to a name: its name, its id ("firefox"), then the start of its name, then words in it. */
export function findEntry(name: string, list: Entry[] = entries()): Entry | null {
  const want = name.trim().toLowerCase();
  const id = (e: Entry) => e.id.replace(/\.desktop$/, '').toLowerCase();
  const rank = (e: Entry): number => {
    const names = e.names.map((n) => n.toLowerCase());
    if (names.includes(want) || id(e) === want || id(e).split('.').pop() === want) return 0;
    if (e.hidden) return 9;
    if (e.generic.some((g) => g.toLowerCase() === want)) return 1;
    if (names.some((n) => n.startsWith(want))) return 2;
    if (names.some((n) => n.includes(want))) return 3;
    return 9;
  };
  let best: Entry | null = null;
  let bestRank = 9;
  for (const e of list) {
    const r = rank(e);
    if (r < bestRank) [best, bestRank] = [e, r];
  }
  return best;
}

/** An entry's Exec line as a program and its arguments, without the field codes (%u, %F…) a launcher fills in. */
export function execArgs(exec: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  let any = false;
  for (let i = 0; i < exec.length; i++) {
    const c = exec[i];
    if (quoted) {
      if (c === '\\' && i + 1 < exec.length) cur += exec[++i];
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') {
      quoted = true;
      any = true;
    } else if (c === ' ' || c === '\t') {
      if (cur || any) out.push(cur);
      cur = '';
      any = false;
    } else cur += c;
  }
  if (cur || any) out.push(cur);
  return out
    .filter((a) => !/^%[fFuUdDnNickvm]$/.test(a))
    .map((a) => a.replace(/%%/g, '%'))
    .filter(Boolean);
}

/** What an app gets from the environment: the user's, without the server's own settings. */
function appEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/^(HYDOR_|NAGET_|ELECTRON_)/.test(k) || ['NODE_ENV', 'NODE_OPTIONS', 'PORT', 'HOST', 'DATA_DIR'].includes(k)) delete env[k];
  return env;
}

/** Starts a program on its own (not the server's child for long), and says whether it could. */
function launch(cmd: string, args: string[], wait: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore', env: appEnv() });
    child.once('error', reject);
    if (!wait) {
      child.once('spawn', () => {
        child.unref();
        resolve();
      });
      return;
    }
    const t = setTimeout(() => (child.unref(), resolve()), 15_000);
    child.once('exit', (code) => {
      clearTimeout(t);
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(cmd)} could not open it (exit ${code})`));
    });
  });
}

const onPath = (name: string) => (process.env.PATH || '').split(':').some((d) => d && fs.existsSync(path.join(d, name)));

async function openApp(name: string): Promise<string | void> {
  const e = findEntry(name);
  if (!e) {
    // A program by its name (firefox, xterm).
    if (/^[\w.+-]+$/.test(name) && onPath(name)) {
      await launch(name, [], false);
      return name;
    }
    throw new Error(`there is no app called “${name}” here: use its name as your applications menu shows it, like Files or Firefox`);
  }
  // gio (GLib) and gtk-launch open an entry as the desktop does; else its Exec line, as written.
  if (onPath('gio')) await launch('gio', ['launch', e.file], true);
  else if (onPath('gtk-launch')) await launch('gtk-launch', [e.id], true);
  else {
    const [cmd, ...args] = execArgs(e.exec);
    if (!cmd) throw new Error(`“${e.names[0]}” says no program to start`);
    await launch(cmd, args, false);
  }
  return e.names[0];
}

export const linuxMachine: Machine = {
  drive,
  screenshot,
  openApp,
  problem,
  // Without a compositor a see-through window shows black, so the app shows no glow there.
  glow: () => helper.facts?.compositor === true,
};
