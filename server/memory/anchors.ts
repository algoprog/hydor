// Anchors: the files and folders a project note, topic or profile names, so memory knows which code a note is
// about. When a note is added or changed (and once for every note there already is), the paths in its text are
// resolved against the project's tracked files and kept in memory_anchors (repo-relative, POSIX; a folder ends in
// "/"), with the repository's commit at the time (anchor_commit). drift.ts then flags the notes whose files changed
// since. All of it happens in the background after a save: nothing here is waited for on a request, git runs with
// execFile and a time limit, its answers are kept for a while, and a folder that is not a git repository (or has no
// commit yet) simply gets no anchors. (drift.ts builds on this file, never the other way round.)
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { findingOf } from '../../shared/findings.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import { memorySchema, onEntriesChanged } from './store.ts';

/** Anchors a note keeps at most. */
export const MAX_ANCHORS = 12;
/** How long a project's tracked files, and its HEAD, are kept before git is asked again. */
const FILES_TTL = 5 * 60_000;
const HEAD_TTL = 10_000;
const GIT_TIMEOUT = 10_000;

/** Runs git in `root`; its output, or null when git is missing, the folder is no repository, or it took too long. */
export function git(root: string, args: string[], o: { timeout?: number; maxBuffer?: number } = {}): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      execFile(
        'git',
        ['-C', root, ...args],
        { timeout: o.timeout ?? GIT_TIMEOUT, maxBuffer: o.maxBuffer ?? 32 * 1024 * 1024, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' } },
        (err, stdout) => resolve(err ? null : stdout),
      );
    } catch {
      resolve(null);
    }
  });
}

interface Tracked {
  files: Set<string>;
  byBase: Map<string, string[]>;
  dirs: Set<string>;
}
const tracked = new Map<string, { at: number; v: Promise<Tracked | null> }>();
const heads = new Map<string, { at: number; v: Promise<string | null> }>();

/** Forgets what was kept of git's answers (the tests change repositories under it). */
export function clearGitCache() {
  tracked.clear();
  heads.clear();
}

/** A repository's commit now (its HEAD), kept for a few seconds; null outside git, or before the first commit. */
export function gitHead(root: string): Promise<string | null> {
  const kept = heads.get(root);
  if (kept && Date.now() - kept.at < HEAD_TTL) return kept.v;
  const v = git(root, ['rev-parse', '--verify', '-q', 'HEAD'], { timeout: 5000 }).then((o) => (o && /^[0-9a-f]{7,64}$/.test(o.trim()) ? o.trim() : null));
  heads.set(root, { at: Date.now(), v });
  return v;
}

/** The commit a repository had at a time (the last one made before it), else null. */
export async function commitAt(root: string, at: number): Promise<string | null> {
  const o = await git(root, ['rev-list', '-1', `--before=@${Math.floor(at / 1000)}`, 'HEAD'], { timeout: 5000 });
  const c = o?.trim();
  return c && /^[0-9a-f]{7,64}$/.test(c) ? c : null;
}

/** A repository's tracked files, as sets to look paths up in; kept for FILES_TTL (a list that failed is asked for again). */
function trackedFiles(root: string): Promise<Tracked | null> {
  const kept = tracked.get(root);
  if (kept && Date.now() - kept.at < FILES_TTL) return kept.v;
  const v = git(root, ['ls-files', '-z']).then((o) => {
    if (o == null) {
      if (tracked.get(root)?.v === v) tracked.delete(root);
      return null;
    }
    const files = new Set<string>();
    const byBase = new Map<string, string[]>();
    const dirs = new Set<string>();
    for (const f of o.split('\0')) {
      if (!f) continue;
      files.add(f);
      const base = f.slice(f.lastIndexOf('/') + 1);
      const same = byBase.get(base);
      if (same) same.push(f);
      else byBase.set(base, [f]);
      for (let i = f.indexOf('/'); i >= 0; i = f.indexOf('/', i + 1)) dirs.add(f.slice(0, i + 1));
    }
    return { files, byBase, dirs };
  });
  tracked.set(root, { at: Date.now(), v });
  return v;
}

/** Words that may be paths: runs of name characters joined by "/", a trailing "/" kept (it says a folder). */
const TOKEN = /[\w@.+-]+(?:\/[\w@.+-]+)*\/?/g;
/** A file name with an extension. */
const EXT = /\.[A-Za-z][A-Za-z0-9]{0,7}$/;
/** A relative path with a file name (web/src/App.tsx), ending a word or a sentence. */
export const PATH = /(?:^|[\s(`'"])((?:[\w.-]+\/)+[\w.-]+\.[a-z0-9]{1,6})(?=$|[\s)`'",;:]|\.(?:\s|$))/gi;

/**
 * The tracked files and folders of a repository that a text names: a path from the repository's root, a path ending
 * in the one tracked path that does (`memory/store.ts`), a bare file name when one tracked file has it
 * (`TurnDocs.tsx`), and a folder written with a trailing slash (`server/memory/`). Anything ambiguous or unknown is
 * left out, and a folder that is not a repository gives nothing. At most `max` (a wiki article keeps more than a note).
 */
export async function resolvePaths(root: string, text: string, max = MAX_ANCHORS): Promise<string[]> {
  const t = await trackedFiles(root);
  if (!t) return [];
  const out = new Set<string>();
  const prefix = root.replace(/[\\/]+$/, '') + '/';
  const body = text.split(prefix).join('');
  for (const m of body.matchAll(TOKEN)) {
    const isDir = m[0].endsWith('/');
    const tok = m[0]
      .replace(/\/+$/, '')
      .replace(/^(\.\/)+/, '')
      .replace(/[.+-]+$/, '');
    if (!tok || tok.startsWith('../')) continue;
    if (isDir) {
      if (t.dirs.has(`${tok}/`)) out.add(`${tok}/`);
      continue;
    }
    if (t.files.has(tok)) {
      out.add(tok);
      continue;
    }
    const slash = tok.includes('/');
    if (!slash && !EXT.test(tok)) continue;
    const hits = (t.byBase.get(tok.slice(tok.lastIndexOf('/') + 1)) ?? []).filter((f) => !slash || f.endsWith(`/${tok}`));
    if (hits.length === 1) out.add(hits[0]);
    if (out.size >= max) break;
  }
  return [...out].slice(0, max);
}

/** Is a path (a file, or a folder ending in "/") one of these changed files, or does one lie in it? */
export const touches = (anchor: string, changed: string) => (anchor.endsWith('/') ? changed.startsWith(anchor) : changed === anchor);

// ---- taking them ----------------------------------------------------------------------------------

/** A note changed this recently was written against the code as it is now; an older one, against the code of its day. */
const FRESH_MS = 15 * 60_000;
const BATCH = 100;

interface Pending {
  id: number;
  scopeKey: string;
  text: string;
  title: string | null;
  updatedAt: number;
  finding?: string | null;
}

/** The files a finding gives as evidence ("path" or "path:line"), as text the paths are resolved in. */
function evidenceFiles(json: string): string {
  try {
    const f = findingOf(JSON.parse(json));
    return (f?.evidence ?? []).flatMap((e) => (e.kind === 'file' ? [e.ref.replace(/:\d+(-\d+)?$/, '')] : [])).join('\n');
  } catch {
    return '';
  }
}

/** Project notes, topics, profiles and findings whose anchors were never taken, or whose text changed since. */
function pending(db: DB, limit: number): Pending[] {
  return db
    .prepare(
      `select id, scope_key as scopeKey, text, title, finding, updated_at as updatedAt from memory_entries
       where scope = 'repo' and status = 'active' and kind in ('note', 'topic', 'profile', 'finding') and (anchored_at is null or anchored_at < updated_at) order by updated_at desc limit ?`,
    )
    .all(limit) as Pending[];
}

/** Takes the anchors of one entry (replacing the old ones), the commit they were taken at, and clears its drift. */
async function anchorOne(db: DB, e: Pending, now: number): Promise<boolean> {
  let paths: string[] = [];
  let commit: string | null = null;
  if (fs.existsSync(e.scopeKey)) {
    // A finding is about the code its evidence names, not about what its words happen to mention.
    paths = await resolvePaths(e.scopeKey, e.finding ? evidenceFiles(e.finding) : e.text);
    if (paths.length) {
      const head = await gitHead(e.scopeKey);
      commit = head && now - e.updatedAt > FRESH_MS ? ((await commitAt(e.scopeKey, e.updatedAt)) ?? head) : head;
    }
  }
  db.transaction(() => {
    db.prepare('delete from memory_anchors where entry = ?').run(e.id);
    const put = db.prepare('insert or ignore into memory_anchors (entry, path) values (?, ?)');
    for (const p of paths) put.run(e.id, p);
    // Only if it still is the text the anchors were taken from; else the next pass takes them again.
    db.prepare('update memory_entries set anchor_commit = ?, drift = null, anchored_at = ? where id = ? and updated_at = ?').run(commit, e.updatedAt, e.id, e.updatedAt);
  })();
  return !!commit;
}

/** Takes the anchors of one entry now (the tidy-up does this after it rewrote a note). */
export async function anchorEntry(db: DB, id: number, now = Date.now()): Promise<void> {
  memorySchema(db);
  const r = db
    .prepare("select id, scope_key as scopeKey, text, title, finding, updated_at as updatedAt from memory_entries where id = ? and scope = 'repo' and kind in ('note', 'topic', 'profile', 'finding')")
    .get(id) as Pending | undefined;
  if (r) await anchorOne(db, r, now);
}

let running = false;
let again = false;

/**
 * Takes the anchors of every entry that needs them, a hundred at a time (the rest in the next round), so a long list
 * never holds the process. Returns how many it did. One run at a time: a change meanwhile asks for another round.
 */
export async function anchorPending(db: DB, now = Date.now()): Promise<number> {
  memorySchema(db);
  if (running) {
    again = true;
    return 0;
  }
  running = true;
  let done = 0;
  try {
    do {
      again = false;
      for (let list = pending(db, BATCH); list.length; list = pending(db, BATCH)) {
        for (const e of list) {
          try {
            await anchorOne(db, e, now);
          } catch (err) {
            console.warn(`[memory] anchors of #${e.id}: ${(err as Error).message}`);
            db.prepare('update memory_entries set anchored_at = ? where id = ?').run(e.updatedAt, e.id);
          }
          done++;
        }
        // Notes anchored at an older commit than HEAD need a look at what changed since.
        for (const root of new Set(list.map((e) => e.scopeKey))) kvSet(db, `memory.drift.head:${root}`, '');
        await new Promise((r) => setImmediate(r));
      }
    } while (again);
  } finally {
    running = false;
  }
  return done;
}

/** Every project note there is gets its anchors, once (the flag), the commit of each being the one at its last change. */
export async function backfillAnchors(db: DB): Promise<number> {
  if (kvGet(db, 'memory.anchors.backfilled') === '1') return 0;
  const n = await anchorPending(db);
  kvSet(db, 'memory.anchors.backfilled', '1');
  return n;
}

/** The files and folders an entry is anchored to. */
export function anchorsOf(db: DB, id: number): string[] {
  memorySchema(db);
  return (db.prepare('select path from memory_anchors where entry = ? order by path').all(id) as { path: string }[]).map((r) => r.path);
}

const started = new WeakSet<DB>();
const timers = new Map<DB, NodeJS.Timeout>();

/** Asks for a round soon (a save in a hurry waits a moment, so a burst of notes is one round). */
function soon(db: DB) {
  clearTimeout(timers.get(db));
  const t = setTimeout(() => {
    timers.delete(db);
    anchorPending(db).catch((e) => console.warn(`[memory] anchors: ${(e as Error).message}`));
  }, 3000);
  t.unref?.();
  timers.set(db, t);
}

/**
 * Anchors in the background: taken for notes as they are added or changed, and the one-time backfill soon after the app
 * starts. Nothing here runs on a request. (upkeep.ts starts this with the drift check.)
 */
export function watchAnchors(db: DB) {
  if (started.has(db)) return;
  started.add(db);
  memorySchema(db);
  onEntriesChanged((d, place) => {
    if (d === db && (!place || place.scope === 'repo')) soon(db);
  });
  setTimeout(() => void backfillAnchors(db).catch((e) => console.warn(`[memory] anchors: ${(e as Error).message}`)), 20_000).unref?.();
}
