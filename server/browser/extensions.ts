// Chrome extensions for your own browsing (the desktop app's browser runs them): where they come from (the Chrome Web Store,
// a folder on this computer, another browser here), how each is read (its manifest: names in the user's language, its toolbar
// button, icon and options page, what it asks for that the desktop app's browser does not have), and the registry of them
// (the key-value store, `browser.extensions`). The files of those brought in are kept under <data>/browser/extensions/<id>/<version>/;
// a folder stays where it is, so a developer's changes show.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { BrowserExtension, ExtensionSource, ExtensionsState } from '../../shared/browser.ts';
import { HttpError } from '../auth.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import { desktop } from '../desktop.ts';
import type { Deps } from '../features/types.ts';
import { BROWSER_DIR, unzip } from './chrome.ts';

const KEY = 'browser.extensions';
export const EXTENSIONS_DIR = path.join(BROWSER_DIR, 'extensions');
const ID_RE = /^[a-p]{32}$/;
/** The Chrome version the store is told we are (it sends the newest CRX that version can run). */
const CHROME_MAJOR = 140;
const MAX_CRX = 200 * 1024 * 1024;

/** What is kept for each: the extension as the pages see it, and the folder it loads from. */
type Stored = BrowserExtension & { dir: string };

// ---- the registry ---------------------------------------------------------------------------------------------

function readAll(db: DB): Stored[] {
  try {
    const v = JSON.parse(kvGet(db, KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => x && ID_RE.test(String(x.id)) && typeof x.dir === 'string') : [];
  } catch {
    return [];
  }
}
const writeAll = (db: DB, list: Stored[]) => kvSet(db, KEY, JSON.stringify(list));

const listeners = new Set<() => void>();
/** Calls `fn` after any install, removal or change. Returns what stops it. */
export function onExtensionsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
function changed() {
  for (const fn of [...listeners])
    try {
      fn();
    } catch {}
}

/** The enabled ones to load: in your own browsing every enabled one, in agents' browsers those you also marked for them. */
export function extensionsFor(db: DB, where: 'browsing' | 'agents'): { id: string; path: string }[] {
  return readAll(db)
    .filter((e) => e.enabled && (where === 'browsing' || e.agents) && fs.existsSync(path.join(e.dir, 'manifest.json')))
    .map((e) => ({ id: e.id, path: e.dir }));
}

const strip = ({ dir: _dir, ...e }: Stored): BrowserExtension => e;

// ---- ids ------------------------------------------------------------------------------------------------------

/** Chromium writes an id as letters: each nibble of the first 16 bytes of a SHA-256, 0 as a, 15 as p. */
function letters(bytes: Buffer): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(97 + (b >> 4), 97 + (b & 15));
  return s;
}
/** The id Chromium gives an extension with this public key (DER, base64 as a manifest's `key` has it, or raw). */
export function idFromKey(key: Buffer | string): string {
  const der = typeof key === 'string' ? Buffer.from(key.replace(/\s+/g, ''), 'base64') : key;
  return letters(crypto.createHash('sha256').update(der).digest().subarray(0, 16));
}
/** The id Chromium gives an unpacked folder without a key: from its absolute path (UTF-16 on Windows). */
export function idFromFolder(dir: string): string {
  const abs = path.resolve(dir);
  const bytes = Buffer.from(abs, process.platform === 'win32' ? 'utf16le' : 'utf8');
  return letters(crypto.createHash('sha256').update(bytes).digest().subarray(0, 16));
}

// ---- reading an extension folder ------------------------------------------------------------------------------

/**
 * What the desktop app's browser lacks, as the permission strings: anything not among the chrome.* APIs Electron has
 * (see the notes in desktop/browser.cjs), or that the app stands in for.
 */
const UNSUPPORTED = new Set(
  (
    'declarativeNetRequest declarativeNetRequestWithHostAccess declarativeNetRequestFeedback offscreen sidePanel identity identity.email cookies history ' +
    'bookmarks downloads downloads.open downloads.shelf downloads.ui tts ttsEngine proxy debugger nativeMessaging tabGroups topSites sessions readingList search ' +
    'fontSettings privacy contentSettings pageCapture desktopCapture tabCapture gcm webNavigation declarativeContent printing printingMetrics idle power ' +
    'browsingData dns processes vpnProvider wallpaper documentScan loginState certificateProvider platformKeys webAuthenticationProxy audio fileBrowserHandler ' +
    'fileSystemProvider networking.config accessibilityFeatures system.cpu system.display system.memory system.storage'
  ).split(' '),
);
const UNSUPPORTED_PREFIX = ['system.', 'enterprise.', 'platformKeys', 'networking.'];

export function unsupportedPermissions(manifest: Record<string, any>): string[] {
  const asked = new Set<string>();
  for (const list of [manifest.permissions, manifest.optional_permissions])
    if (Array.isArray(list)) for (const p of list) if (typeof p === 'string') asked.add(p);
  return [...asked].filter((p) => UNSUPPORTED.has(p) || UNSUPPORTED_PREFIX.some((x) => p.startsWith(x))).sort();
}

export function readManifest(dir: string): Record<string, any> {
  let text: string;
  try {
    text = fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8');
  } catch {
    throw new HttpError(400, 'There is no manifest.json in that folder, so it is not a Chrome extension');
  }
  try {
    const m = JSON.parse(text.replace(/^﻿/, ''));
    if (!m || typeof m !== 'object' || Array.isArray(m)) throw new Error();
    return m;
  } catch {
    throw new HttpError(400, 'The extension’s manifest.json is not valid');
  }
}

/** The messages of the extension's default language (or English), keys in lower case. */
function messagesOf(dir: string, manifest: Record<string, any>): Map<string, string> {
  const out = new Map<string, string>();
  const root = path.join(dir, '_locales');
  let have: string[] = [];
  try {
    have = fs.readdirSync(root);
  } catch {
    return out;
  }
  const wanted = [manifest.default_locale, 'en', 'en_US'].filter((x) => typeof x === 'string').map((x: string) => x.toLowerCase());
  for (const w of wanted) {
    const folder = have.find((h) => h.toLowerCase() === w);
    if (!folder) continue;
    try {
      const msgs = JSON.parse(fs.readFileSync(path.join(root, folder, 'messages.json'), 'utf8').replace(/^﻿/, ''));
      for (const [k, v] of Object.entries(msgs ?? {})) if (typeof (v as any)?.message === 'string') out.set(k.toLowerCase(), (v as any).message);
      return out;
    } catch {}
  }
  return out;
}

function localize(text: unknown, msgs: Map<string, string>): string | undefined {
  if (typeof text !== 'string') return undefined;
  const s = text.replace(/__MSG_([A-Za-z0-9_@]+)__/g, (all, k: string) => msgs.get(k.toLowerCase()) ?? all).trim();
  return s || undefined;
}

/** A path from a manifest, kept inside the extension's folder ('' when it points outside). */
function inside(dir: string, rel: string): string {
  const abs = path.resolve(dir, rel.replace(/^[/\\]+/, ''));
  return abs.startsWith(path.resolve(dir) + path.sep) ? abs : '';
}

/** The icon paths of a size → path map or a single path, best first: the largest up to 128 pixels, then smaller ones, then bigger ones. */
function iconCandidates(icons: unknown): string[] {
  if (typeof icons === 'string') return [icons];
  if (!icons || typeof icons !== 'object') return [];
  const sized = Object.entries(icons as Record<string, unknown>)
    .filter(([, p]) => typeof p === 'string')
    .map(([n, p]) => [Number(n) || 0, p as string] as const);
  const fit = sized.filter(([n]) => n <= 128).sort((x, y) => y[0] - x[0]);
  const big = sized.filter(([n]) => n > 128).sort((x, y) => x[0] - y[0]);
  return [...fit, ...big].map(([, p]) => p);
}

export interface Described {
  name: string;
  version: string;
  description?: string;
  action?: { title?: string; popup?: string };
  /** The icon's file, absolute, when there is one that exists. */
  iconFile?: string;
  options?: string;
  manifestVersion: number;
  unsupported?: string[];
}

/** What a folder's manifest says, as the pages show it. */
export function describe(dir: string, manifest = readManifest(dir)): Described {
  const msgs = messagesOf(dir, manifest);
  const name = localize(manifest.name, msgs);
  const version = typeof manifest.version === 'string' ? manifest.version.trim() : '';
  if (!name || !version) throw new HttpError(400, 'That is not a Chrome extension: its manifest has no name or version');
  const act = manifest.action ?? manifest.browser_action ?? manifest.page_action;
  let action: Described['action'];
  if (act && typeof act === 'object') {
    const title = localize(act.default_title, msgs);
    const popup = typeof act.default_popup === 'string' && act.default_popup ? act.default_popup.replace(/^[/\\]+/, '') : undefined;
    action = { ...(title ? { title } : {}), ...(popup ? { popup } : {}) };
  }
  let iconFile: string | undefined;
  for (const candidate of [...iconCandidates(manifest.icons), ...iconCandidates(act?.default_icon)]) {
    const f = inside(dir, candidate);
    if (f && fs.existsSync(f)) {
      iconFile = f;
      break;
    }
  }
  const options = [manifest.options_ui?.page, manifest.options_page].find((p) => typeof p === 'string' && p);
  const unsupported = unsupportedPermissions(manifest);
  return {
    name,
    version,
    description: localize(manifest.description, msgs),
    action,
    iconFile,
    options: options?.replace(/^[/\\]+/, ''),
    manifestVersion: Number(manifest.manifest_version) || 2,
    unsupported: unsupported.length ? unsupported : undefined,
  };
}

function entryFor(id: string, dir: string, info: Described, over: Partial<BrowserExtension> & Pick<BrowserExtension, 'source'>, old?: Stored): Stored {
  const e: Stored = {
    id,
    name: info.name,
    version: info.version,
    ...(info.description ? { description: info.description } : {}),
    ...over,
    enabled: old?.enabled ?? true,
    agents: old?.agents ?? false,
    ...(info.action ? { action: info.action } : {}),
    ...(info.iconFile ? { icon: true } : {}),
    ...(info.options ? { options: info.options } : {}),
    manifestVersion: info.manifestVersion,
    ...(info.unsupported ? { unsupported: info.unsupported } : {}),
    installedAt: Date.now(),
    dir,
  };
  return e;
}

// ---- keeping an extension --------------------------------------------------------------------------------------

const safeVersion = (v: string) => v.replace(/[^\w.+-]/g, '_').slice(0, 64) || '0';

/** Puts a new extension in the registry (replacing one with its id, which keeps its switches) and tells the listeners. */
function register(db: DB, e: Stored): Stored {
  const list = readAll(db);
  const i = list.findIndex((x) => x.id === e.id);
  if (i >= 0) {
    const old = list[i];
    e.enabled = old.enabled;
    e.agents = old.agents;
    list[i] = e;
    // The copy it had is no longer used when the new one is somewhere else.
    if (old.source !== 'folder' && old.dir !== e.dir) removeFiles(old);
  } else list.push(e);
  writeAll(db, list);
  changed();
  return e;
}

/** Deletes the files of one that was copied in: never a folder the user loaded, or anything outside our own folder. */
function removeFiles(e: Stored) {
  if (e.source === 'folder') return;
  const root = path.join(EXTENSIONS_DIR, e.id);
  if (e.dir === root || e.dir.startsWith(root + path.sep)) fs.rmSync(e.dir, { recursive: true, force: true });
}

/** Moves a freshly unpacked folder in as <id>/<version>, taking the other versions out. */
function settle(id: string, part: string, version: string): string {
  const base = path.join(EXTENSIONS_DIR, id);
  const dest = path.join(base, safeVersion(version));
  fs.rmSync(dest, { recursive: true, force: true });
  fs.renameSync(part, dest);
  for (const n of fs.readdirSync(base)) if (path.join(base, n) !== dest) fs.rmSync(path.join(base, n), { recursive: true, force: true });
  return dest;
}

const partFolder = (id: string) => {
  const base = path.join(EXTENSIONS_DIR, id);
  fs.mkdirSync(base, { recursive: true, mode: 0o700 });
  return fs.mkdtempSync(path.join(base, '.part-'));
};

// ---- the CRX file ----------------------------------------------------------------------------------------------

/** A protobuf message's fields: only varints and length-delimited ones matter here; the rest are skipped. */
function fields(buf: Buffer): { no: number; bytes?: Buffer; num?: number }[] {
  const out: { no: number; bytes?: Buffer; num?: number }[] = [];
  let p = 0;
  const varint = () => {
    let v = 0;
    for (let shift = 0; ; shift += 7) {
      if (p >= buf.length || shift > 49) throw new Error('Damaged header');
      const b = buf[p++];
      v += (b & 0x7f) * 2 ** shift;
      if (!(b & 0x80)) return v;
    }
  };
  while (p < buf.length) {
    const tag = varint();
    const no = Math.floor(tag / 8);
    const wire = tag % 8;
    if (wire === 0) out.push({ no, num: varint() });
    else if (wire === 2) {
      const n = varint();
      if (p + n > buf.length) throw new Error('Damaged header');
      out.push({ no, bytes: buf.subarray(p, p + n) });
      p += n;
    } else if (wire === 1) p += 8;
    else if (wire === 5) p += 4;
    else throw new Error('Damaged header');
  }
  return out;
}

export interface CrxInfo {
  /** Where the zip starts in the file. */
  zipStart: number;
  /** The id the file says it is for, from the public key that signed it. */
  id: string;
  /** That key, DER. */
  key: Buffer;
}

/** Reads a CRX file's header (version 2 or 3) and finds the key of its id. */
export function readCrx(file: string): CrxInfo {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(16);
    const got = fs.readSync(fd, head, 0, 16, 0);
    if (got < 12 || head.toString('latin1', 0, 4) !== 'Cr24') throw new HttpError(400, 'That is not a Chrome extension file');
    const version = head.readUInt32LE(4);
    if (version === 2) {
      const keyLen = head.readUInt32LE(8);
      const sigLen = head.readUInt32LE(12);
      if (keyLen > 10_000 || sigLen > 10_000) throw new HttpError(400, 'The extension file is damaged');
      const key = Buffer.alloc(keyLen);
      fs.readSync(fd, key, 0, keyLen, 16);
      return { zipStart: 16 + keyLen + sigLen, id: idFromKey(key), key };
    }
    if (version !== 3) throw new HttpError(400, `This extension file’s format (${version}) is not supported`);
    const len = head.readUInt32LE(8);
    if (len > 1_000_000) throw new HttpError(400, 'The extension file is damaged');
    const header = Buffer.alloc(len);
    fs.readSync(fd, header, 0, len, 12);
    let top;
    let crxId: Buffer | undefined;
    const keys: Buffer[] = [];
    try {
      top = fields(header);
      for (const f of top) {
        if ((f.no === 2 || f.no === 3) && f.bytes) {
          const k = fields(f.bytes).find((x) => x.no === 1)?.bytes;
          if (k) keys.push(k);
        } else if (f.no === 10000 && f.bytes) crxId = fields(f.bytes).find((x) => x.no === 1)?.bytes;
      }
    } catch {
      throw new HttpError(400, 'The extension file is damaged');
    }
    if (!crxId || crxId.length !== 16) throw new HttpError(400, 'The extension file says nothing of its id');
    const want = letters(crxId);
    const key = keys.find((k) => idFromKey(k) === want);
    if (!key) throw new HttpError(400, 'The extension file’s id does not match its key');
    return { zipStart: 12 + len, id: want, key };
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Unpacks a CRX file as the extension with `id` (refusing a file made for another), writing its public key into the
 * manifest so the browser gives it that same id.
 */
export function installCrxFile(db: DB, file: string, id: string): Promise<BrowserExtension> {
  return (async () => {
    if (!ID_RE.test(id)) throw new HttpError(400, 'That is not an extension id: it is 32 letters from a to p');
    const crx = readCrx(file);
    if (crx.id !== id) throw new HttpError(400, 'That file is for a different extension than the one asked for');
    const part = partFolder(id);
    const zip = path.join(part, '.crx.zip');
    try {
      await pipeline(fs.createReadStream(file, { start: crx.zipStart }), fs.createWriteStream(zip, { mode: 0o600 }));
      const out = path.join(part, 'files');
      try {
        await unzip(zip, out);
      } catch (e) {
        throw new HttpError(400, `The extension file could not be unpacked: ${(e as Error).message}`);
      }
      fs.rmSync(zip, { force: true });
      const manifest = readManifest(out);
      manifest.key = crx.key.toString('base64');
      fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
      const info = describe(out, manifest);
      const dest = settle(id, out, info.version);
      return strip(register(db, entryFor(id, dest, info, { source: 'store' }, readAll(db).find((x) => x.id === id))));
    } finally {
      fs.rmSync(part, { recursive: true, force: true });
    }
  })();
}

/** The extension id in a Chrome Web Store address or a bare id. */
export function storeId(input: string): string | null {
  const s = String(input ?? '').trim();
  if (ID_RE.test(s)) return s;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || !['chromewebstore.google.com', 'chrome.google.com'].includes(u.hostname)) return null;
  return u.pathname.split('/').find((x) => ID_RE.test(x)) ?? null;
}

export const crxUrl = (id: string) =>
  `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=${CHROME_MAJOR}.0.0.0&acceptformat=crx2,crx3&x=${encodeURIComponent(`id=${id}&uc`)}`;

/** Downloads an extension from the Chrome Web Store and installs it. */
export async function installFromStore(db: DB, input: string, fetcher: typeof fetch = (...a) => fetch(...a)): Promise<BrowserExtension> {
  const id = storeId(input);
  if (!id) throw new HttpError(400, 'Give the extension’s Chrome Web Store address, or its id (32 letters from a to p)');
  fs.mkdirSync(EXTENSIONS_DIR, { recursive: true, mode: 0o700 });
  const file = path.join(EXTENSIONS_DIR, `.download-${process.pid}-${Date.now()}.crx`);
  try {
    let r: Response;
    try {
      r = await fetcher(crxUrl(id), { redirect: 'follow', signal: AbortSignal.timeout(60_000) });
    } catch {
      throw new HttpError(502, 'Could not reach the Chrome Web Store');
    }
    if (r.status === 204 || r.status === 404) throw new HttpError(404, 'The Chrome Web Store has no extension with that id');
    if (!r.ok || !r.body) throw new HttpError(502, `The Chrome Web Store did not give the extension (${r.status})`);
    if (Number(r.headers.get('content-length')) > MAX_CRX) throw new HttpError(400, 'That extension is too big');
    let size = 0;
    const body = Readable.fromWeb(r.body as any);
    body.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_CRX) body.destroy(new HttpError(400, 'That extension is too big'));
    });
    try {
      await pipeline(body, fs.createWriteStream(file, { mode: 0o600 }));
    } catch (e) {
      throw e instanceof HttpError ? e : new HttpError(502, 'The download of the extension broke off');
    }
    if (!size) throw new HttpError(404, 'The Chrome Web Store has no extension with that id');
    return await installCrxFile(db, file, id);
  } finally {
    fs.rmSync(file, { force: true });
  }
}

// ---- a folder, and other browsers ------------------------------------------------------------------------------

/** Loads a folder in place: its manifest's key gives its id, else the folder's path does. */
export function installFolder(db: DB, input: string): BrowserExtension {
  let dir = path.resolve(String(input ?? '').trim());
  if (!String(input ?? '').trim()) throw new HttpError(400, 'Give the folder’s full path');
  if (path.basename(dir) === 'manifest.json' && fs.existsSync(dir) && fs.statSync(dir).isFile()) dir = path.dirname(dir);
  let real: string;
  try {
    real = fs.realpathSync(dir);
    if (!fs.statSync(real).isDirectory()) throw new Error();
  } catch {
    throw new HttpError(400, 'There is no such folder');
  }
  const manifest = readManifest(real);
  const info = describe(real, manifest);
  const id = typeof manifest.key === 'string' && manifest.key.trim() ? idFromKey(manifest.key) : idFromFolder(real);
  return strip(register(db, entryFor(id, real, info, { source: 'folder', from: real }, readAll(db).find((x) => x.id === id))));
}

/** The user data folders of the Chromium-family browsers here (some have no profile folders: `flat`). */
export function chromiumFolders(): { key: string; name: string; dir: string; flat?: boolean }[] {
  const home = os.homedir();
  const out: { key: string; name: string; dir: string; flat?: boolean }[] = [];
  const add = (key: string, name: string, dir: string, flat?: boolean) => out.push({ key, name, dir, flat });
  if (process.platform === 'darwin') {
    const s = path.join(home, 'Library/Application Support');
    add('chrome', 'Google Chrome', path.join(s, 'Google/Chrome'));
    add('chromium', 'Chromium', path.join(s, 'Chromium'));
    add('edge', 'Microsoft Edge', path.join(s, 'Microsoft Edge'));
    add('brave', 'Brave', path.join(s, 'BraveSoftware/Brave-Browser'));
    add('vivaldi', 'Vivaldi', path.join(s, 'Vivaldi'));
    add('opera', 'Opera', path.join(s, 'com.operasoftware.Opera'), true);
    add('arc', 'Arc', path.join(s, 'Arc/User Data'));
  } else if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA ?? path.join(home, 'AppData/Local');
    const roaming = process.env.APPDATA ?? path.join(home, 'AppData/Roaming');
    add('chrome', 'Google Chrome', path.join(local, 'Google/Chrome/User Data'));
    add('chromium', 'Chromium', path.join(local, 'Chromium/User Data'));
    add('edge', 'Microsoft Edge', path.join(local, 'Microsoft/Edge/User Data'));
    add('brave', 'Brave', path.join(local, 'BraveSoftware/Brave-Browser/User Data'));
    add('vivaldi', 'Vivaldi', path.join(local, 'Vivaldi/User Data'));
    add('opera', 'Opera', path.join(roaming, 'Opera Software/Opera Stable'), true);
  } else {
    const cfg = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
    const kinds: [string, string, string][] = [
      ['chrome', 'Google Chrome', 'google-chrome'],
      ['chrome-beta', 'Google Chrome Beta', 'google-chrome-beta'],
      ['chromium', 'Chromium', 'chromium'],
      ['edge', 'Microsoft Edge', 'microsoft-edge'],
      ['brave', 'Brave', 'BraveSoftware/Brave-Browser'],
      ['vivaldi', 'Vivaldi', 'vivaldi'],
      ['opera', 'Opera', 'opera'],
    ];
    for (const [key, name, rel] of kinds) add(key, name, path.join(cfg, rel), key === 'opera');
    add('chromium-snap', 'Chromium', path.join(home, 'snap/chromium/common/chromium'));
    for (const [key, name, app, rel] of [
      ['chrome-flatpak', 'Google Chrome', 'com.google.Chrome', 'google-chrome'],
      ['chromium-flatpak', 'Chromium', 'org.chromium.Chromium', 'chromium'],
      ['brave-flatpak', 'Brave', 'com.brave.Browser', 'BraveSoftware/Brave-Browser'],
      ['edge-flatpak', 'Microsoft Edge', 'com.microsoft.Edge', 'microsoft-edge'],
    ])
      add(key, name, path.join(home, '.var/app', app, 'config', rel));
  }
  return out;
}

const readJson = (file: string): any => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  } catch {
    return undefined;
  }
};

/** Built-in extensions and apps of Chrome that are not worth bringing in. */
const BUILT_IN = new Set(['ahfgeienlihckogmohjhadlkjgocpleb', 'mhjfbmdgcfjbbpaeojofohoefgiehjai', 'nmmhkkegccagdldgiimedpiccmgmieda', 'pkedcjkdefgpdelpbcmbmeomcjbeemfm']);

const versionParts = (n: string) => n.split(/[._-]/).map((x) => Number(x) || 0);
const newer = (a: string, b: string) => {
  const x = versionParts(a);
  const y = versionParts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
};

interface Found {
  source: ExtensionSource;
  dir: string;
}

/** The extensions of every profile of the browsers here, with the folder holding each one's files. */
function scanBrowsers(have: Set<string>): Found[] {
  const found: Found[] = [];
  for (const b of chromiumFolders()) {
    let profiles: { folder: string; dir: string; name?: string }[] = [];
    const local = readJson(path.join(b.dir, 'Local State'));
    const names = local?.profile?.info_cache ?? {};
    try {
      if (b.flat) profiles = [{ folder: '', dir: b.dir }];
      else
        profiles = fs
          .readdirSync(b.dir, { withFileTypes: true })
          .filter((e) => e.isDirectory() && /^(Default|Profile \d+)$/.test(e.name))
          .map((e) => ({ folder: e.name, dir: path.join(b.dir, e.name), name: typeof names[e.name]?.name === 'string' ? names[e.name].name : undefined }));
    } catch {
      continue;
    }
    const mine: Found[] = [];
    for (const p of profiles) {
      const settings = {
        ...(readJson(path.join(p.dir, 'Preferences'))?.extensions?.settings ?? {}),
      } as Record<string, any>;
      const secure = readJson(path.join(p.dir, 'Secure Preferences'))?.extensions?.settings ?? {};
      for (const [id, s] of Object.entries<any>(secure)) settings[id] = { ...settings[id], ...s };
      let ids: string[] = [];
      try {
        ids = fs.readdirSync(path.join(p.dir, 'Extensions')).filter((n) => ID_RE.test(n));
      } catch {}
      for (const id of ids) {
        if (BUILT_IN.has(id)) continue;
        const s = settings[id] ?? {};
        if ([5, 10].includes(Number(s.location))) continue;
        const versions = fs
          .readdirSync(path.join(p.dir, 'Extensions', id))
          .filter((n) => fs.existsSync(path.join(p.dir, 'Extensions', id, n, 'manifest.json')))
          .sort(newer);
        const v = versions[versions.length - 1];
        if (!v) continue;
        const dir = path.join(p.dir, 'Extensions', id, v);
        let info: Described;
        try {
          const m = readManifest(dir);
          if (m.app) continue;
          info = describe(dir, m);
        } catch {
          continue;
        }
        const reasons = s.disable_reasons;
        const off = s.state === 0 || (typeof reasons === 'number' && reasons > 0) || (Array.isArray(reasons) && reasons.length > 0);
        mine.push({
          dir,
          source: { id: `${b.key}:${p.folder}/${id}`, extensionId: id, browser: b.name, ...(p.name ? { profile: p.name } : {}), name: info.name, version: info.version, enabled: !off, have: have.has(id) },
        });
      }
    }
    // A profile's name is shown only where the browser has several with extensions, as for bookmarks.
    const profs = new Set(mine.map((m) => m.source.id.split('/')[0]));
    if (profs.size < 2) for (const m of mine) delete m.source.profile;
    found.push(...mine);
  }
  return found;
}

export const sourcesOf = (db: DB): ExtensionSource[] => scanBrowsers(new Set(readAll(db).map((e) => e.id))).map((f) => f.source);

/** Copies extensions of another browser here (by their source ids); the ones that could not come in are named in `failed`. */
export function importFrom(db: DB, ids: string[]): { added: BrowserExtension[]; failed: { id: string; error: string }[] } {
  const found = scanBrowsers(new Set());
  const added: BrowserExtension[] = [];
  const failed: { id: string; error: string }[] = [];
  for (const sid of ids) {
    const f = found.find((x) => x.source.id === sid);
    if (!f) {
      failed.push({ id: sid, error: 'That extension is no longer in the other browser' });
      continue;
    }
    const id = f.source.extensionId;
    let part = '';
    try {
      const info = describe(f.dir);
      part = partFolder(id);
      const out = path.join(part, 'files');
      fs.cpSync(f.dir, out, { recursive: true, filter: (s) => path.basename(s) !== '_metadata' });
      const dest = settle(id, out, info.version);
      added.push(strip(register(db, entryFor(id, dest, info, { source: 'import', from: f.source.browser }, readAll(db).find((x) => x.id === id)))));
    } catch (e) {
      failed.push({ id: sid, error: (e as Error).message });
    } finally {
      if (part) fs.rmSync(part, { recursive: true, force: true });
    }
  }
  return { added, failed };
}

// ---- the routes ------------------------------------------------------------------------------------------------

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

export function extensionState(db: DB): ExtensionsState {
  // A loaded folder may have changed since: show what its manifest says now.
  const list = readAll(db);
  let dirty = false;
  for (const e of list) {
    if (e.source !== 'folder') continue;
    try {
      const info = describe(e.dir);
      const next = entryFor(e.id, e.dir, info, { source: 'folder', from: e.from }, e);
      next.installedAt = e.installedAt;
      if (JSON.stringify(next) !== JSON.stringify(e)) {
        Object.assign(e, next);
        dirty = true;
      }
    } catch {}
  }
  if (dirty) writeAll(db, list);
  return { extensions: list.map(strip), sources: sourcesOf(db), runs: desktop !== null };
}

export function extensionRoutes(d: Deps) {
  const { app, db } = d;
  const body = (req: { body?: unknown }) => (req.body ?? {}) as Record<string, any>;
  const find = (id: string) => {
    const e = ID_RE.test(id) ? readAll(db).find((x) => x.id === id) : undefined;
    if (!e) throw new HttpError(404, 'There is no such extension');
    return e;
  };

  app.get('/api/browser/extensions', async () => extensionState(db));

  app.post('/api/browser/extensions/store', async (req) => {
    const b = body(req);
    const extension = await installFromStore(db, String(b.id ?? b.url ?? ''));
    return { extension, ...extensionState(db) };
  });

  app.post('/api/browser/extensions/folder', async (req) => {
    const extension = installFolder(db, String(body(req).path ?? ''));
    return { extension, ...extensionState(db) };
  });

  app.post('/api/browser/extensions/import', async (req) => {
    const ids = body(req).ids;
    if (!Array.isArray(ids) || !ids.length) throw new HttpError(400, 'Choose the extensions to bring in');
    const { added, failed } = importFrom(db, ids.map(String).slice(0, 200));
    if (!added.length && failed.length) throw new HttpError(400, failed[0].error);
    return { added, failed, ...extensionState(db) };
  });

  app.patch('/api/browser/extensions/:id', async (req) => {
    const id = (req.params as { id: string }).id;
    const cur = find(id);
    const b = body(req);
    const list = readAll(db);
    const e = list.find((x) => x.id === cur.id)!;
    if (b.enabled !== undefined) e.enabled = !!b.enabled;
    if (b.agents !== undefined) e.agents = !!b.agents;
    writeAll(db, list);
    changed();
    return { extension: strip(e), ...extensionState(db) };
  });

  app.delete('/api/browser/extensions/:id', async (req) => {
    const e = find((req.params as { id: string }).id);
    writeAll(db, readAll(db).filter((x) => x.id !== e.id));
    removeFiles(e);
    try {
      fs.rmdirSync(path.join(EXTENSIONS_DIR, e.id));
    } catch {}
    changed();
    return extensionState(db);
  });

  app.get('/api/browser/extensions/:id/icon', async (req, reply) => {
    const e = find((req.params as { id: string }).id);
    let file: string | undefined;
    try {
      file = describe(e.dir).iconFile;
    } catch {}
    if (!file) throw new HttpError(404, 'That extension has no icon');
    const type = MIME[path.extname(file).toLowerCase()];
    if (!type) throw new HttpError(404, 'That extension has no icon');
    reply.header('Cache-Control', 'private, max-age=3600');
    // An SVG from an extension must never run script in the app's own page.
    reply.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    return reply.type(type).send(fs.createReadStream(file));
  });
}
