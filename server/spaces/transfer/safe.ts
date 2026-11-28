// What keeps a project's files safe while they travel between machines: relative paths that stay where they belong,
// names another system cannot have, files written whole (to a name beside theirs, then renamed), and the staging
// folders a project arrives in before it is placed. Used by the bundle stream, the walk and the arrival.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** A path or header the bundle should not have carried: the whole bundle fails. */
export class BundleError extends Error {
  override name = 'BundleError';
}

/** Hydor's own temporary names: left out of every walk. */
export const ARRIVING = '.hydor-arriving-';
export const SYNCING = '.hydor-sync-';
export const isTemporary = (name: string) => name.startsWith(ARRIVING) || name.startsWith(SYNCING);

/**
 * The parts of a relative path as bundles write it ('/' between parts): no empty, '.' or '..' part, no NUL, not absolute
 * (no leading '/', no drive, no backslash separator tricks). Throws a BundleError otherwise.
 */
export function relParts(p: unknown): string[] {
  if (typeof p !== 'string' || !p) throw new BundleError('A path in the bundle is empty');
  if (p.length > 4096) throw new BundleError(`A path in the bundle is too long: ${p.slice(0, 60)}…`);
  if (p.includes('\0')) throw new BundleError('A path in the bundle has a NUL in it');
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p) || p.includes('\\')) throw new BundleError(`A path in the bundle is not relative: ${p}`);
  const parts = p.split('/');
  for (const part of parts) if (!part || part === '.' || part === '..') throw new BundleError(`A path in the bundle goes somewhere else: ${p}`);
  return parts;
}

/** Whether `p` is a safe relative path (relParts without throwing). */
export function isSafeRel(p: unknown): p is string {
  try {
    relParts(p);
    return true;
  } catch {
    return false;
  }
}

/** The area names a bundle may have: folder, skills, wiki, media, assets, also/<n> and knowledge/<base>. */
export function checkArea(area: unknown): string {
  if (typeof area !== 'string' || !/^(folder|skills|wiki|media|assets|also\/\d{1,3}|knowledge\/[a-z0-9]{1,40})$/.test(area)) throw new BundleError(`A part of the bundle has a name it should not: ${String(area).slice(0, 60)}`);
  return area;
}

/**
 * A symbolic link's target as a bundle carries it: relative, and staying inside its area from the link's own place
 * (`at`, the link's path in the area): never up past the top.
 */
export function checkLinkTarget(at: string, target: unknown): string {
  if (typeof target !== 'string' || !target || target.includes('\0') || target.startsWith('/') || /^[A-Za-z]:/.test(target) || target.includes('\\')) throw new BundleError(`A link in the bundle is not relative: ${String(target).slice(0, 80)}`);
  let depth = relParts(at).length - 1;
  for (const part of target.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (--depth < 0) throw new BundleError(`A link in the bundle leads out of its folder: ${at} → ${target}`);
    } else depth++;
  }
  return target;
}

/** Whether a symbolic link at `at` (path in its area) pointing to `target` stays inside the area (and is relative). */
export function linkStaysInside(at: string, target: string): boolean {
  try {
    checkLinkTarget(at, target);
    return true;
  } catch {
    return false;
  }
}

/** `rel` below `root` as a real path; throws when it would end up elsewhere (it cannot, after relParts, but this makes it certain). */
export function joinSafe(root: string, rel: string): string {
  const parts = relParts(rel);
  const out = path.join(root, ...parts);
  const back = path.relative(root, out);
  if (!back || back.startsWith('..') || path.isAbsolute(back)) throw new BundleError(`A path in the bundle goes somewhere else: ${rel}`);
  return out;
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(\..*)?$/i;

/**
 * Why a file or folder name cannot be had on a system (`platform`, as process.platform says), or null. Windows has no
 * `<>:"|?*` or control characters, no names that end in a space or a dot, and reserved names (CON, NUL, COM1…).
 */
export function nameProblem(name: string, platform: string = process.platform): string | null {
  if (!name || name.includes('/') || name.includes('\0')) return 'its name is not one this system can have';
  if (platform !== 'win32') return null;
  if (/[<>:"|?*\\]/.test(name) || /[\u0000-\u001f]/.test(name)) return 'its name has a character Windows does not allow';
  if (/[ .]$/.test(name)) return 'its name ends in a space or a dot, which Windows does not allow';
  if (WINDOWS_RESERVED.test(name)) return 'its name is one Windows keeps for itself';
  return null;
}

/** Whether a folder's disk tells `A` from `a`: tried with a file made and looked for by another case. `dir` must exist. */
export function caseInsensitive(dir: string): boolean {
  const name = `.hydor-case-${crypto.randomBytes(4).toString('hex')}`;
  const file = path.join(dir, name);
  try {
    fs.writeFileSync(file, '');
    return fs.existsSync(path.join(dir, name.toUpperCase()));
  } catch {
    return process.platform === 'darwin' || process.platform === 'win32';
  } finally {
    fs.rmSync(file, { force: true });
  }
}

/** A staging folder's name beside a place. */
export const stagingName = (kind: 'arriving' | 'sync' = 'arriving') => `${kind === 'arriving' ? ARRIVING : SYNCING}${crypto.randomBytes(5).toString('hex')}`;

/** A temporary name for a file beside its place (the same folder, so it can be renamed over it). */
export const tempBeside = (file: string) => path.join(path.dirname(file), `${SYNCING}${crypto.randomBytes(5).toString('hex')}`);

/** Writes a file whole: to a temporary name beside it, then renamed into place. */
export async function writeAtomic(file: string, data: string | Buffer, mode?: number): Promise<void> {
  const tmp = tempBeside(file);
  try {
    await fs.promises.writeFile(tmp, data, mode === undefined ? undefined : { mode });
    await fs.promises.rename(tmp, file);
  } finally {
    await fs.promises.rm(tmp, { force: true }).catch(() => {});
  }
}

/** The nearest folder at or above `p` that exists. */
export function nearestExisting(p: string): string {
  let at = path.resolve(p);
  for (;;) {
    try {
      if (fs.statSync(at).isDirectory()) return at;
    } catch {}
    const up = path.dirname(at);
    if (up === at) return at;
    at = up;
  }
}

/** Free bytes on the disk `p` is (or would be) on; null when it cannot be said. */
export function freeSpace(p: string): number | null {
  try {
    const s = fs.statfsSync(nearestExisting(p));
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

/** A size in words: 1.9 GB. */
export function sizeWords(n: number): string {
  if (n < 1000) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = -1;
  do {
    v /= 1000;
    i++;
  } while (v >= 1000 && i < units.length - 1);
  return `${v >= 100 ? Math.round(v) : Math.round(v * 10) / 10} ${units[i]}`;
}

/** Whether `p` is a folder with nothing in it. */
export function isEmptyDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory() && fs.readdirSync(p).length === 0;
  } catch {
    return false;
  }
}

/** Whether a place is free for a project to arrive in: not there yet, or an empty folder. */
export function isFreePlace(p: string): boolean {
  return !fs.lstatSync(p, { throwIfNoEntry: false }) || isEmptyDir(p);
}

/**
 * Moves a folder to a place (renamed; copied and removed when it is on another disk). The place must not be there, or be
 * an empty folder.
 */
export async function moveDir(from: string, to: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(to), { recursive: true });
  if (isEmptyDir(to)) await fs.promises.rmdir(to);
  try {
    await fs.promises.rename(from, to);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e;
    await fs.promises.cp(from, to, { recursive: true, preserveTimestamps: true, verbatimSymlinks: true, errorOnExist: true, force: false });
    await fs.promises.rm(from, { recursive: true, force: true });
  }
}

/** The user's home folder as a real path (it is where a project's own folders can go too). */
export const homeDir = () => path.resolve(os.homedir());

/** `p` relative to `root` with '/' between parts, or null when it is not inside it. */
export function relativeTo(root: string, p: string): string | null {
  const rel = path.relative(root, p);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/');
}
