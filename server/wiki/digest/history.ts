// What an article said before the helper rewrote it: a copy of its text in the wiki's hidden history folder
// (`.history/<article path>/<time>.md`), and, when statements were replaced, why (`<time>.json` beside it). Hidden
// folders are never reachable through the wiki tools, never indexed and never listed; the copies are for people (and
// for restoring an article by hand). Nothing here deletes a copy.
import fs from 'node:fs';
import path from 'node:path';
import { wikiHash } from '../core.ts';

export interface Removed {
  /** The statement as the article said it. */
  text: string;
  /** Why it went: `superseded by <source>`, `moved to <path>`, `no longer true as of <date or commit>`. */
  why: string;
}

export interface SnapshotNote {
  /** What the rewrite came from (a document or conversation title, or the code changes). */
  source?: string;
  removed?: Removed[];
}

const HISTORY = '.history';

/** A directory of the wiki, made when missing, never through a symbolic link. */
function ensureDir(root: string, parts: string[]): string {
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    try {
      fs.mkdirSync(current, { mode: 0o700 });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
    const st = fs.lstatSync(current);
    if (st.isSymbolicLink() || !st.isDirectory()) throw new Error('Unsafe wiki history folder');
  }
  return current;
}

/** A file name from a moment: the ISO time with the characters some systems refuse as dashes. */
const stamp = (at: number) => new Date(at).toISOString().replace(/[:.]/g, '-');

/** The article path's folders under .history (wiki/a.md → .history/wiki/a.md/), refusing any other kind of path. */
function folderOf(rel: string): string[] {
  const parts = rel.split('/');
  if (!/^wiki\/(?:[^/\0\\]+\/)*[^/\0\\]+\.md$/.test(rel) || parts.some((p) => !p || p.startsWith('.') || p === '..')) throw new Error(`Not an article path: ${rel}`);
  return [HISTORY, ...parts];
}

/** The snapshots of an article, oldest first: path (relative to the wiki) and the moment in its name. */
export function snapshotsOf(root: string, rel: string): { path: string; time: string }[] {
  const dir = path.join(root, ...folderOf(rel));
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((n) => n.endsWith('.md'))
    .sort()
    .map((n) => ({ path: [HISTORY, ...rel.split('/'), n].join('/'), time: n.slice(0, -3) }));
}

/** The text of a snapshot (a path as snapshotsOf gives it). */
export const readSnapshot = (root: string, rel: string): string => fs.readFileSync(path.join(root, ...rel.split('/')), 'utf8');

/**
 * Keeps `content` (an article's whole file as it is now) before it is rewritten. A copy of the very same text that is
 * the latest one already is reused, not made again (a rewrite tried twice leaves one copy). Returns the copy's path
 * relative to the wiki.
 */
export function snapshotArticle(root: string, rel: string, content: string, at: number, note: SnapshotNote = {}): string {
  const dir = ensureDir(root, folderOf(rel));
  const have = snapshotsOf(root, rel);
  const last = have[have.length - 1];
  if (last && wikiHash(readSnapshot(root, last.path)) === wikiHash(content)) {
    if (note.removed?.length) writeWhy(dir, last.time, note);
    return last.path;
  }
  let name = stamp(at);
  for (let n = 2; fs.existsSync(path.join(dir, `${name}.md`)); n++) name = `${stamp(at)}-${n}`;
  fs.writeFileSync(path.join(dir, `${name}.md`), content, { flag: 'wx', mode: 0o600 });
  if (note.removed?.length) writeWhy(dir, name, note);
  prune(root, rel, dir, name);
  return [HISTORY, ...rel.split('/'), `${name}.md`].join('/');
}

/** Snapshots kept for each article: the newest ones; older ones (and their reasons) go when a new one is taken. */
export const KEEP_SNAPSHOTS = 20;

/** Deletes the snapshots of an article beyond the newest KEEP_SNAPSHOTS, with their `.json` files; never the one just made. */
function prune(root: string, rel: string, dir: string, newest: string) {
  const all = snapshotsOf(root, rel);
  const keep = new Set([newest, ...all.filter((x) => x.time !== newest).slice(-(KEEP_SNAPSHOTS - 1)).map((x) => x.time)]);
  for (const x of all) {
    if (keep.has(x.time)) continue;
    for (const ext of ['md', 'json']) fs.rmSync(path.join(dir, `${x.time}.${ext}`), { force: true });
  }
}

function writeWhy(dir: string, name: string, note: SnapshotNote) {
  const file = path.join(dir, `${name}.json`);
  const before = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as { removed?: Removed[] }).removed ?? [] : [];
  fs.writeFileSync(file, `${JSON.stringify({ source: note.source ?? null, removed: [...before, ...(note.removed ?? [])] }, null, 2)}\n`, { mode: 0o600 });
}

/** What a snapshot's rewrite replaced and why (empty when nothing was listed). */
export function readWhy(root: string, snapshot: string): { source: string | null; removed: Removed[] } {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, ...snapshot.replace(/\.md$/, '.json').split('/')), 'utf8'));
  } catch {
    return { source: null, removed: [] };
  }
}
