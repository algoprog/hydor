// Where the other browsers on this computer keep their things, for the imports of their bookmarks and their history
// (bookmarks.ts, history-import.ts): Chrome and the browsers built on it (their user data folders and profiles),
// Firefox (the profiles its profiles.ini lists), and a way to read a copy of a database a running browser holds.
// Both imports give a browser profile the same id, so the lists they make can be put together.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

export interface Dirs {
  home: string;
  config: string;
  mac: string;
  local: string;
  roaming: string;
}

/** The folders browsers keep their data in, on this computer as it is now (asked at each use). */
export function dirsNow(): Dirs {
  const home = os.homedir();
  return {
    home,
    config: process.env.XDG_CONFIG_HOME || path.join(home, '.config'),
    mac: path.join(home, 'Library', 'Application Support'),
    local: process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'),
    roaming: process.env.APPDATA || path.join(home, 'AppData', 'Roaming'),
  };
}

const by = (linux: string[], mac: string[], win: (h: Dirs) => string[] = () => []) => (h: Dirs) =>
  process.platform === 'darwin' ? mac.map((p) => path.join(h.mac, p)) : process.platform === 'win32' ? win(h) : linux.map((p) => (p.startsWith('~/') ? path.join(h.home, p.slice(2)) : path.join(h.config, p)));

const flatpak = (app: string, rest: string) => `~/.var/app/${app}/config/${rest}`;

interface ChromiumKind {
  key: string;
  name: string;
  /** Its user data folders on this system. */
  dirs: (h: Dirs) => string[];
}

const CHROMIUMS: ChromiumKind[] = [
  { key: 'chrome', name: 'Google Chrome', dirs: by(['google-chrome', flatpak('com.google.Chrome', 'google-chrome')], ['Google/Chrome'], (h) => [path.join(h.local, 'Google', 'Chrome', 'User Data')]) },
  { key: 'chrome-beta', name: 'Google Chrome Beta', dirs: by(['google-chrome-beta'], []) },
  { key: 'chromium', name: 'Chromium', dirs: by(['chromium', '~/snap/chromium/common/chromium', flatpak('org.chromium.Chromium', 'chromium')], ['Chromium'], (h) => [path.join(h.local, 'Chromium', 'User Data')]) },
  { key: 'edge', name: 'Microsoft Edge', dirs: by(['microsoft-edge', flatpak('com.microsoft.Edge', 'microsoft-edge')], ['Microsoft Edge'], (h) => [path.join(h.local, 'Microsoft', 'Edge', 'User Data')]) },
  { key: 'brave', name: 'Brave', dirs: by(['BraveSoftware/Brave-Browser', flatpak('com.brave.Browser', 'BraveSoftware/Brave-Browser')], ['BraveSoftware/Brave-Browser'], (h) => [path.join(h.local, 'BraveSoftware', 'Brave-Browser', 'User Data')]) },
  { key: 'vivaldi', name: 'Vivaldi', dirs: by(['vivaldi'], ['Vivaldi'], (h) => [path.join(h.local, 'Vivaldi', 'User Data')]) },
  { key: 'opera', name: 'Opera', dirs: by(['opera'], ['com.operasoftware.Opera'], (h) => [path.join(h.roaming, 'Opera Software', 'Opera Stable')]) },
  { key: 'arc', name: 'Arc', dirs: by([], ['Arc/User Data']) },
];

export function readJson(file: string): any {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  } catch {
    return undefined;
  }
}

/** Chrome keeps dates as microseconds since 1601. */
export const chromeTime = (v: unknown) => {
  const ms = Number(v) / 1000 - 11_644_473_600_000;
  return Number.isFinite(ms) && ms > 0 ? ms : undefined;
};

/** The profiles of the Chrome-family browsers that have a file of that name ('Bookmarks', 'History'), each with its id, its browser's name and its profile's name (when the install has several that have it). */
export function chromiumProfiles(h: Dirs, file: string): { id: string; browser: string; profile?: string; file: string }[] {
  const found: { id: string; browser: string; profile?: string; file: string }[] = [];
  for (const kind of CHROMIUMS) {
    for (const [di, dir] of kind.dirs(h).entries()) {
      if (!fs.existsSync(dir)) continue;
      // The variants of one browser (Snap, Flatpak) get their own ids.
      const key = di === 0 ? kind.key : `${kind.key}-${di + 1}`;
      const names = readJson(path.join(dir, 'Local State'))?.profile?.info_cache ?? {};
      const folders = new Set<string>(Object.keys(names));
      try {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isDirectory() && /^(Default|Profile \d+)$/.test(e.name)) folders.add(e.name);
      } catch {}
      const mine: { folder: string; file: string }[] = [];
      // Opera keeps its files at the top, with no profile folders.
      if (fs.existsSync(path.join(dir, file))) mine.push({ folder: '', file: path.join(dir, file) });
      for (const folder of [...folders].sort((a, b) => (a === 'Default' ? -1 : b === 'Default' ? 1 : a.localeCompare(b, 'en', { numeric: true })))) {
        const f = path.join(dir, folder, file);
        if (fs.existsSync(f)) mine.push({ folder, file: f });
      }
      for (const m of mine) {
        found.push({
          id: `${key}:${m.folder || 'Default'}`,
          browser: kind.name,
          profile: mine.length > 1 ? String(names[m.folder]?.name || m.folder || 'Default') : undefined,
          file: m.file,
        });
      }
    }
  }
  return found;
}

// Firefox

const FIREFOX_DIRS = (h: Dirs) =>
  process.platform === 'darwin'
    ? [path.join(h.mac, 'Firefox')]
    : process.platform === 'win32'
      ? [path.join(h.roaming, 'Mozilla', 'Firefox')]
      : [path.join(h.home, '.mozilla', 'firefox'), path.join(h.home, 'snap', 'firefox', 'common', '.mozilla', 'firefox'), path.join(h.home, '.var', 'app', 'org.mozilla.firefox', '.mozilla', 'firefox')];

/** The profiles profiles.ini lists: their names and folders. */
function iniProfiles(dir: string): { name: string; folder: string }[] {
  let ini: string;
  try {
    ini = fs.readFileSync(path.join(dir, 'profiles.ini'), 'utf8');
  } catch {
    return [];
  }
  const out: { name: string; folder: string }[] = [];
  let sec: Record<string, string> | null = null;
  const flush = () => {
    if (sec?.Path) out.push({ name: sec.Name || path.basename(sec.Path), folder: sec.IsRelative === '0' ? sec.Path : path.join(dir, sec.Path) });
    sec = null;
  };
  for (const raw of ini.split(/\r?\n/)) {
    const line = raw.trim();
    const m = /^\[(.*)\]$/.exec(line);
    if (m) {
      flush();
      sec = /^Profile\d+$/i.test(m[1]) ? {} : null;
    } else if (sec) {
      const i = line.indexOf('=');
      if (i > 0) sec[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  flush();
  return out;
}

/** The Firefox profiles that have a places.sqlite (its bookmarks and history), each with its id and folder; the profile's name only when there are several. */
export function firefoxProfiles(h: Dirs): { id: string; browser: string; profile?: string; folder: string }[] {
  const found: { id: string; browser: string; profile?: string; folder: string }[] = [];
  for (const dir of FIREFOX_DIRS(h)) {
    const ps = iniProfiles(dir).filter((p) => fs.existsSync(path.join(p.folder, 'places.sqlite')));
    for (const p of ps) found.push({ id: `firefox:${path.basename(p.folder)}`, browser: 'Firefox', profile: ps.length > 1 ? p.name : undefined, folder: p.folder });
  }
  return found;
}

/**
 * Reads a browser's database from a copy: a running browser locks its file, and keeps what it has not folded in yet in a
 * log beside it, which comes along. The copy is opened read-only, or read-write when a log has to be folded in first, and
 * the folder it is in is removed afterwards. A copy that is refused throws the file system's error. The copying does not
 * hold the server up: a browser's history can be hundreds of megabytes.
 */
export async function readCopy<T>(file: string, read: (db: Database.Database) => T): Promise<T> {
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hydor-copy-'));
  try {
    const copy = path.join(tmp, 'copy.sqlite');
    await fs.promises.copyFile(file, copy);
    for (const ext of ['-wal', '-journal']) if (fs.existsSync(`${file}${ext}`)) await fs.promises.copyFile(`${file}${ext}`, `${copy}${ext}`);
    let db: Database.Database;
    try {
      db = new Database(copy, { readonly: true, fileMustExist: true });
      try {
        db.prepare('select 1 from sqlite_master limit 1').get();
      } catch (e) {
        db.close();
        throw e;
      }
    } catch {
      db = new Database(copy, { fileMustExist: true });
    }
    try {
      return read(db);
    } finally {
      db.close();
    }
  } finally {
    await fs.promises.rm(tmp, { recursive: true, force: true });
  }
}

/** A browser's files that macOS keeps from Hydor until you give it Full Disk Access (Safari's): the message says where. */
export class NeedsAccess extends Error {
  readonly needs = 'full-disk-access' as const;
}
