// Settings → Browser (kept in the app's key-value store), named profiles, and each session's own
// browser settings (in its settings, as `browser`).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { BrowserProfile, BrowserSettings, SessionBrowserOptions } from '../../shared/browser.ts';
import { HttpError } from '../auth.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import { sessionExtra, setSessionExtra } from '../sessionExtra.ts';
import { BROWSER_DIR, pickChrome } from './chrome.ts';

const KEY = 'browser.settings';
const PROFILES = 'browser.profiles';
export const PROFILE_DIR = path.join(BROWSER_DIR, 'profiles');

const DEFAULTS: BrowserSettings = { chrome: '', headless: true, blockPrivate: true, screenshots: true, allow: [], block: [] };

function read<T>(db: DB, k: string, fallback: T): T {
  try {
    return JSON.parse(kvGet(db, k) ?? '') ?? fallback;
  } catch {
    return fallback;
  }
}

export function browserSettings(db: DB): BrowserSettings & { enabled: boolean } {
  const s = { ...DEFAULTS, ...read<Partial<BrowserSettings>>(db, KEY, {}) };
  return { ...s, enabled: s.enabled ?? !!pickChrome(s.chrome) };
}

/** Site names as the lists keep them: "example.com", without a scheme, path or "www.". */
export function cleanSites(v: unknown): string[] {
  const list = Array.isArray(v) ? v : String(v ?? '').split(/[\s,]+/);
  const out = new Set<string>();
  for (const x of list) {
    let s = String(x ?? '')
      .trim()
      .toLowerCase();
    if (!s) continue;
    s = s.replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '').replace(/^\*\./, '').replace(/^www\./, '');
    if (/^[a-z0-9.-]+(:\d+)?$/.test(s) && s.length <= 253) out.add(s);
  }
  return [...out].slice(0, 500);
}

export function setBrowserSettings(db: DB, patch: Partial<BrowserSettings>): BrowserSettings & { enabled: boolean } {
  const cur = read<Partial<BrowserSettings>>(db, KEY, {});
  const next: Partial<BrowserSettings> = { ...cur };
  if (patch.enabled !== undefined) next.enabled = !!patch.enabled;
  if (patch.chrome !== undefined) next.chrome = String(patch.chrome);
  if (patch.headless !== undefined) next.headless = !!patch.headless;
  if (patch.blockPrivate !== undefined) next.blockPrivate = !!patch.blockPrivate;
  if (patch.screenshots !== undefined) next.screenshots = !!patch.screenshots;
  if (patch.allow !== undefined) next.allow = cleanSites(patch.allow);
  if (patch.block !== undefined) next.block = cleanSites(patch.block);
  kvSet(db, KEY, JSON.stringify(next));
  return browserSettings(db);
}

// ---- named profiles -------------------------------------------------------------------------------

export const profiles = (db: DB): BrowserProfile[] => read<BrowserProfile[]>(db, PROFILES, []);
export const profileDir = (id: string) => path.join(PROFILE_DIR, id.replace(/[^a-z0-9]/g, ''));

export function addProfile(db: DB, name: string): BrowserProfile {
  const n = name.trim().slice(0, 40);
  if (!n) throw new HttpError(400, 'Give the profile a name');
  const list = profiles(db);
  if (list.some((p) => p.name.toLowerCase() === n.toLowerCase())) throw new HttpError(409, 'A profile has that name already');
  const p: BrowserProfile = { id: crypto.randomBytes(5).toString('hex'), name: n, createdAt: Date.now() };
  fs.mkdirSync(profileDir(p.id), { recursive: true, mode: 0o700 });
  kvSet(db, PROFILES, JSON.stringify([...list, p]));
  return p;
}

export function renameProfile(db: DB, id: string, name: string) {
  const n = name.trim().slice(0, 40);
  if (!n) throw new HttpError(400, 'Give the profile a name');
  kvSet(db, PROFILES, JSON.stringify(profiles(db).map((p) => (p.id === id ? { ...p, name: n } : p))));
}

/** Forgets a profile and deletes its folder (its logins with it). */
export function removeProfile(db: DB, id: string) {
  kvSet(db, PROFILES, JSON.stringify(profiles(db).filter((p) => p.id !== id)));
  fs.rmSync(profileDir(id), { recursive: true, force: true });
}

// ---- a session's own -----------------------------------------------------------------------------

export function sessionOptions(db: DB, key: string): SessionBrowserOptions {
  const b = sessionExtra(db, key).browser;
  return b && typeof b === 'object' ? (b as SessionBrowserOptions) : {};
}

export function setSessionOptions(db: DB, key: string, patch: Partial<SessionBrowserOptions>): SessionBrowserOptions {
  const next: SessionBrowserOptions = { ...sessionOptions(db, key) };
  if ('profile' in patch) {
    if (patch.profile && !profiles(db).some((p) => p.id === patch.profile)) throw new HttpError(400, 'No such profile');
    if (patch.profile) next.profile = patch.profile;
    else delete next.profile;
  }
  if (patch.allow !== undefined) next.allow = cleanSites(patch.allow);
  if (patch.block !== undefined) next.block = cleanSites(patch.block);
  if (patch.local !== undefined) next.local = [...new Set(patch.local.map((s) => String(s).toLowerCase()))].slice(0, 50);
  for (const k of ['allow', 'block', 'local'] as const) if (!next[k]?.length) delete next[k];
  setSessionExtra(db, key, { browser: Object.keys(next).length ? next : null });
  return next;
}
