// Listing a folder's files for a bundle or a sync round, with what stays out and why. Nothing is read: only names and
// stats. Symbolic links are never followed (a link that stays inside is carried as a link, one that leads out is left
// out). A copy carries a repository's .git; a sync does not, and in a Git repository leaves out what Git ignores.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { LeftOut } from '../../../shared/transfer.ts';
import { isSafeRel, isTemporary, linkStaysInside } from './safe.ts';

/** Folders a command makes again: left out unless asked to carry them. */
export const REBUILT_DIRS = new Set(['node_modules', '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache', '.tox', '.nox', '.next', '.nuxt', '.turbo', '.parcel-cache', '.gradle', '.ipynb_checkpoints']);
export const REBUILT_FILES = new Set(['.DS_Store', 'Thumbs.db']);

/** The most files a sync keeps in step in one area. */
export const SYNC_FILE_LIMIT = 200_000;
/** How many left-out entries a walk lists (the largest first); all of them are summed up. */
export const LEFT_OUT_LISTED = 20;

export interface WalkRules {
  /** Leave out what can be made again (rebuilt folders, .DS_Store, Thumbs.db). Default true. */
  leaveOut?: boolean;
  /** `copy` carries a repository's .git; `sync` does not, and leaves out what Git ignores. Default copy. */
  mode?: 'copy' | 'sync';
  /** Relative folders that are skipped without a word (another area has them). */
  skip?: string[];
  /** Refuse (throw) over this many files: a sync's limit. */
  maxFiles?: number;
}

export interface WalkFile {
  path: string;
  size: number;
  mtime: number;
  mode: number;
}
export interface WalkDir {
  path: string;
  mtime: number;
  mode: number;
}
export interface WalkLink {
  path: string;
  target: string;
}

export interface WalkResult {
  files: WalkFile[];
  dirs: WalkDir[];
  links: WalkLink[];
  /** What was left out, the largest first (at most LEFT_OUT_LISTED). */
  leftOut: LeftOut[];
  /** All that was left out, summed up. */
  leftOutTotal: { files: number; bytes: number };
  /** The files that go and their bytes. */
  totals: { files: number; bytes: number };
  /** A .git folder is among what goes. */
  git: boolean;
}

/** Runs git in a folder and returns what it printed; null when it fails. */
function git(cwd: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, maxBuffer: 512 * 1024 * 1024, encoding: 'utf8', timeout: 120_000 }, (err, out) => resolve(err ? null : out));
  });
}

const joinRel = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);

/** Files and bytes under a folder, for what is left out (not following links). */
async function measure(abs: string): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  const go = async (dir: string) => {
    let list: fs.Dirent[];
    try {
      list = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of list) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await go(p);
      else {
        files++;
        if (e.isFile()) bytes += (await fs.promises.lstat(p).catch(() => null))?.size ?? 0;
      }
    }
  };
  await go(abs);
  return { files, bytes };
}

/**
 * The files of `root` (which must be a folder) with what stays out. Paths are relative with '/' between parts, on every
 * system. Throws when the root is not a folder, or (a sync) when it has too many files.
 */
export async function walk(root: string, rules: WalkRules = {}): Promise<WalkResult> {
  const leaveOut = rules.leaveOut !== false;
  const sync = rules.mode === 'sync';
  const skip = new Set(rules.skip ?? []);
  const maxFiles = rules.maxFiles ?? (sync ? SYNC_FILE_LIMIT : Infinity);
  const rootStat = await fs.promises.stat(root);
  if (!rootStat.isDirectory()) throw new Error(`${root} is not a folder`);

  const out: WalkResult = { files: [], dirs: [], links: [], leftOut: [], leftOutTotal: { files: 0, bytes: 0 }, totals: { files: 0, bytes: 0 }, git: false };
  const left: LeftOut[] = [];
  const out_ = (path_: string, files: number, bytes: number, why: LeftOut['why']) => {
    left.push({ path: path_, files, bytes, why });
    out.leftOutTotal.files += files;
    out.leftOutTotal.bytes += bytes;
  };
  const addFile = (rel: string, st: fs.Stats) => {
    if (out.files.length >= maxFiles) throw new Error(`There are over ${maxFiles.toLocaleString('en-US')} files here: too many to keep in step. Use Git for this folder, or copy it once instead.`);
    out.files.push({ path: rel, size: st.size, mtime: Math.round(st.mtimeMs), mode: st.mode & 0o777 });
    out.totals.files++;
    out.totals.bytes += st.size;
  };

  /** One entry below `dir` (relative `rel`), by the rules; returns after listing a folder's whole subtree. */
  const entry = async (abs: string, rel: string, name: string, st: fs.Stats): Promise<void> => {
    if (isTemporary(name)) return;
    // A name that cannot travel in a bundle (a backslash, bytes that are not text, a drive letter first).
    if (!isSafeRel(rel) || rel.includes('�')) {
      const m = st.isDirectory() ? await measure(abs) : { files: 1, bytes: st.isFile() ? st.size : 0 };
      return out_(rel, m.files, m.bytes, 'name');
    }
    if (st.isSymbolicLink()) {
      if (name === '.git') return out_(rel, 1, 0, 'worktree');
      let target: string;
      try {
        target = await fs.promises.readlink(abs);
      } catch {
        return out_(rel, 1, 0, 'link');
      }
      // Slashes the way bundles have them; a link that is absolute or leads out of the folder is left out.
      const t = target.split(path.sep).join('/');
      if (!linkStaysInside(rel, t)) return out_(rel, 1, 0, 'link');
      out.links.push({ path: rel, target: t });
      return;
    }
    if (st.isDirectory()) {
      if (skip.has(rel)) return;
      if (name === '.git') {
        if (sync) return;
        if (rel === '.git') out.git = true;
      } else if (leaveOut && REBUILT_DIRS.has(name)) {
        const m = await measure(abs);
        return out_(rel, m.files, m.bytes, 'rebuilt');
      } else if (leaveOut && fs.existsSync(path.join(abs, 'pyvenv.cfg'))) {
        const m = await measure(abs);
        return out_(rel, m.files, m.bytes, 'rebuilt');
      }
      out.dirs.push({ path: rel, mtime: Math.round(st.mtimeMs), mode: st.mode & 0o777 });
      return list(abs, rel);
    }
    if (st.isFile()) {
      // A .git that is a file points at a worktree's repository somewhere else: it cannot go.
      if (name === '.git') return out_(rel, 1, st.size, 'worktree');
      if (leaveOut && REBUILT_FILES.has(name)) return out_(rel, 1, st.size, 'rebuilt');
      return addFile(rel, st);
    }
    // A socket, a FIFO, a device.
    out_(rel, 1, 0, 'special');
  };

  const list = async (abs: string, rel: string): Promise<void> => {
    let names: string[];
    try {
      names = (await fs.promises.readdir(abs)).sort();
    } catch {
      if (rel) out_(rel, 0, 0, 'special');
      return;
    }
    for (const name of names) {
      const p = path.join(abs, name);
      let st: fs.Stats;
      try {
        st = await fs.promises.lstat(p);
      } catch {
        // Gone while the walk ran, or a name that is not text (lstat of the replaced name fails).
        if (name.includes('�')) out_(joinRel(rel, name), 1, 0, 'name');
        continue;
      }
      await entry(p, joinRel(rel, name), name, st);
    }
  };

  // A sync in a Git repository: what Git lists (tracked, and untracked but not ignored); folders it lists (nested
  // repositories) are walked with the plain rules.
  let listed: string[] | null = null;
  if (sync && fs.existsSync(path.join(root, '.git'))) {
    const text = await git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
    if (text !== null) listed = [...new Set(text.split('\0').filter(Boolean))];
  }
  if (listed) {
    const dirsMade = new Set<string>();
    // A folder with a pyvenv.cfg at its top is a Python environment, as in the plain walk (looked at once per folder).
    const venvs = new Map<string, boolean>();
    const isVenv = (dir: string) => {
      let v = venvs.get(dir);
      if (v === undefined) venvs.set(dir, (v = fs.existsSync(path.join(root, dir, 'pyvenv.cfg'))));
      return v;
    };
    const inVenv = (parts: string[]) => parts.slice(0, -1).some((_, i) => isVenv(parts.slice(0, i + 1).join('/')));
    for (const rel of listed) {
      const parts = rel.replace(/\/$/, '').split('/');
      const clean = parts.join('/');
      if (parts.some((p) => isTemporary(p) || p === '.git') || (leaveOut && (parts.some((p, i) => (i < parts.length - 1 ? REBUILT_DIRS.has(p) : REBUILT_FILES.has(p))) || inVenv(parts)))) continue;
      if ([...skip].some((s) => clean === s || clean.startsWith(`${s}/`))) continue;
      let st: fs.Stats;
      try {
        st = await fs.promises.lstat(path.join(root, clean));
      } catch {
        // Tracked, but removed on disk.
        continue;
      }
      // A nested repository or submodule is a folder: walked with the plain rules (its own .git stays out).
      if (st.isDirectory()) {
        if (!dirsMade.has(clean)) {
          dirsMade.add(clean);
          await entry(path.join(root, clean), clean, parts[parts.length - 1], st);
        }
      } else await entry(path.join(root, clean), clean, parts[parts.length - 1], st);
    }
  } else await list(root, '');

  const byPath = (a: { path: string }, b: { path: string }) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  out.files.sort(byPath);
  out.dirs.sort(byPath);
  out.links.sort(byPath);
  out.leftOut = left.sort((a, b) => b.bytes - a.bytes || b.files - a.files || (a.path < b.path ? -1 : 1)).slice(0, LEFT_OUT_LISTED);
  return out;
}
