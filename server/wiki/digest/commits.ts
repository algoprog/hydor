// Wiki memory from a project's commits: once a day, for a project whose folder is a Git repository and whose wiki
// memory is on (and Learn from conversations), the commit messages since the last time (subject and body, not the code) go to the helper as one
// source, `Commits <from>–<to>`, as a conversation does: it keeps what lasts (decisions and why, conventions, pitfalls
// and their fixes, results), nothing else. At most MAX_COMMITS commits and MAX_CHARS characters a day. Commit messages
// are what people wrote into a repository: secrets are cut out of them before the helper sees them, and the helper
// reads them as data. All its state is in the database: when it last ran, and the commit it read up to.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { kvGet, kvSet, type DB } from '../../db.ts';
import { learnOn, memoryOn } from '../../memory/store.ts';
import { redactSecrets } from '../../memory/secrets.ts';
import { allSpaces } from '../../spaces/index.ts';
import { wikiHash } from '../core.ts';
import { wikiMemoryOn } from '../roots.ts';
import { jobRunning } from '../areas/jobs.ts';
import { digestText } from './digest.ts';
import { helperDigestAsk, type DigestAsk } from './plan.ts';
import { digested } from './store.ts';

export const MAX_COMMITS = 60;
export const MAX_COMMIT_CHARS = 12_000;
/** The most commits a build reads (the newest ones). */
export const BUILD_MAX_COMMITS = 1200;
/** The most of one commit's body that is kept. */
const BODY_CHARS = 800;
/** A project's commits are read when the last time was this long ago; the first time looks back this far. */
export const COMMITS_EVERY_MS = 20 * 3600_000;
const FIRST_DAYS = 14;

const kvAt = (space: string) => `wiki.commits.at.${space}`;
const kvSha = (space: string) => `wiki.commits.sha.${space}`;

/** Runs git in a folder: its output, or null when it fails (not a repository, git missing, too slow). */
export function git(folder: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('git', ['-C', folder, '-c', 'core.quotepath=off', ...args], { timeout: 15_000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' } }, (err, stdout) => resolve(err ? null : stdout));
  });
}

export interface CommitRead {
  /** The repository's HEAD now. */
  head: string;
  from: string;
  to: string;
  /** What the helper reads. */
  text: string;
  count: number;
}

const TRAILER = /^(?:co-authored-by|signed-off-by|reviewed-by|acked-by|tested-by|reported-by|cc):/i;

/** One commit's message as it is kept: no trailers naming people, no e-mail addresses, its body cut. */
function cleanMessage(subject: string, body: string): string {
  const lines = body
    .split('\n')
    .filter((l) => !TRAILER.test(l.trim()))
    .join('\n')
    .replace(/<[^<>\s]+@[^<>\s]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return `${subject.trim()}${lines ? `\n${lines.length > BODY_CHARS ? `${lines.slice(0, BODY_CHARS - 1)}…` : lines}` : ''}`;
}

/** The format `git log` is asked for: a record for each commit, its fields apart. */
export const COMMIT_FORMAT = '--format=%x1e%h%x1f%ad%x1f%s%x1f%b';

export interface Commit {
  sha: string;
  date: string;
  message: string;
}

/** The commits in `git log` output made with COMMIT_FORMAT (newest first, as git gives them), messages cleaned. */
export function parseCommits(out: string): Commit[] {
  return out
    .split('\x1e')
    .map((r) => r.split('\x1f'))
    .filter((p) => p.length >= 3 && p[2].trim())
    .map((p) => ({ sha: p[0].trim(), date: p[1].trim(), message: cleanMessage(p[2], p.slice(3).join('\x1f')) }));
}

export interface CommitBatch {
  from: string;
  to: string;
  /** What the helper reads (secrets cut out). */
  text: string;
  count: number;
}

const COMMITS_INTRO = 'These are the git commit messages of the project (newest first), not a conversation: keep what lasts from them (decisions and why, conventions, pitfalls and their fixes, results), not what each commit changed.';

/**
 * One batch from the start of `commits` (newest first): as many as fit in MAX_COMMITS and MAX_COMMIT_CHARS. `left`: how many of
 * the older ones are said to be left out (the daily pass reads the newest only); the commits are cut, never the batch's lines.
 * Null when none fits.
 */
export function commitBatch(commits: Commit[], o: { left?: number } = {}): CommitBatch | null {
  const kept: string[] = [];
  let used = 0;
  for (const c of commits.slice(0, MAX_COMMITS)) {
    const line = `${c.date} ${c.sha}: ${c.message}`;
    if (used + line.length + 2 > MAX_COMMIT_CHARS) break;
    kept.push(line);
    used += line.length + 2;
  }
  if (!kept.length) return null;
  const shown = commits.slice(0, kept.length);
  const left = o.left ?? 0;
  const text = redactSecrets(`${COMMITS_INTRO}\n\n${kept.join('\n\n')}${left ? `\n\n(${left} older commits left out)` : ''}`);
  return { from: shown[shown.length - 1].date, to: shown[0].date, text, count: kept.length };
}

/** All of `commits` (newest first) in batches, each as commitBatch makes one, newest first. */
export function commitBatches(commits: Commit[]): CommitBatch[] {
  const out: CommitBatch[] = [];
  for (let rest = commits; rest.length; ) {
    const b = commitBatch(rest);
    // A single commit longer than a batch holds cannot be cut here: it is dropped, so the loop ends.
    rest = rest.slice(Math.max(1, b?.count ?? 1));
    if (b) out.push(b);
  }
  return out;
}

/** `git log` arguments that keep to the project's own folder when it is inside a larger repository. */
async function folderScope(folder: string): Promise<string[]> {
  const inside = ((await git(folder, ['rev-parse', '--show-prefix'])) ?? '').trim() !== '';
  return inside ? ['--', '.'] : [];
}

/**
 * The commit messages of a folder's repository since the commit read last (`sha`), else since `since` (ms), newest first,
 * without merges, at most MAX_COMMITS and MAX_COMMIT_CHARS, secrets cut out. Null when the folder is not a repository
 * with commits, or there is nothing new.
 */
export async function readCommits(folder: string, o: { sha?: string; since: number }): Promise<CommitRead | null> {
  if (!fs.existsSync(folder)) return null;
  const head = (await git(folder, ['rev-parse', '--verify', '-q', 'HEAD']))?.trim();
  if (!head || head === o.sha) return null;
  const known = o.sha ? await git(folder, ['cat-file', '-e', `${o.sha}^{commit}`]) : null;
  const range = o.sha && known !== null ? [`${o.sha}..HEAD`] : [`--since=@${Math.floor(o.since / 1000)}`];
  // A project in a folder inside a larger repository reads the commits that touch its folder.
  const out = await git(folder, ['log', '--no-merges', `--max-count=${MAX_COMMITS}`, '--date=short', COMMIT_FORMAT, ...range, ...(await folderScope(folder))]);
  if (!out) return null;
  const commits = parseCommits(out);
  const first = commitBatch(commits, { left: 0 });
  if (!first) return null;
  const b = commitBatch(commits, { left: commits.length - first.count })!;
  return { head, from: b.from, to: b.to, text: b.text, count: b.count };
}

/** The newest BUILD_MAX_COMMITS commits of a folder's repository, newest first: HEAD and their batches. Null when it is not a repository with commits. */
export async function readHistory(folder: string, max = BUILD_MAX_COMMITS): Promise<{ head: string; commits: number; batches: CommitBatch[] } | null> {
  if (!fs.existsSync(folder)) return null;
  const head = (await git(folder, ['rev-parse', '--verify', '-q', 'HEAD']))?.trim();
  if (!head) return null;
  const out = await git(folder, ['log', '--no-merges', `--max-count=${max}`, '--date=short', COMMIT_FORMAT, 'HEAD', ...(await folderScope(folder))]);
  if (!out) return null;
  const commits = parseCommits(out);
  const batches = commitBatches(commits);
  return batches.length ? { head, commits: batches.reduce((n, b) => n + b.count, 0), batches } : null;
}

/** How many commits a build would read (the newest BUILD_MAX_COMMITS, no merges) and in how many batches, made as the build makes them; kept for a minute for each HEAD. */
const counted = new Map<string, { at: number; head: string; commits: number; batches: number }>();
/** Forgets the counts kept for a minute (a new commit is counted at once). */
export const forgetCommitCounts = () => counted.clear();
export async function countHistory(folder: string, now = Date.now()): Promise<{ commits: number; batches: number }> {
  if (!fs.existsSync(folder)) return { commits: 0, batches: 0 };
  const head = (await git(folder, ['rev-parse', '--verify', '-q', 'HEAD']))?.trim() ?? '';
  const hit = counted.get(folder);
  if (hit && hit.head === head && now - hit.at < 60_000) return hit;
  // One `git log` of at most BUILD_MAX_COMMITS messages is fast; the batches are exactly what a build will read.
  const h = head ? await readHistory(folder) : null;
  const r = { at: now, head, commits: h?.commits ?? 0, batches: h?.batches.length ?? 0 };
  counted.set(folder, r);
  return r;
}

/** A build has read the project's commits up to `head`: the daily pass goes on from there (and not before the usual time). */
export function markCommitsRead(db: DB, space: string, head: string, now = Date.now()): void {
  kvSet(db, kvSha(space), head);
  kvSet(db, kvAt(space), String(now));
}

let running = false;

/** Reads one project's commits since the last time (or the first FIRST_DAYS days); whether the helper read any. Never throws. */
async function commitsOf(db: DB, ask: DigestAsk | undefined, space: { id: string; name: string; folder: string }, now: number, onUpdate?: (space: string | null) => void): Promise<boolean> {
  const last = Number(kvGet(db, kvAt(space.id))) || 0;
  try {
    const c = await readCommits(space.folder, { sha: kvGet(db, kvSha(space.id)) || undefined, since: last || now - FIRST_DAYS * 86400_000 });
    kvSet(db, kvAt(space.id), String(now));
    if (!c) return false;
    const hash = wikiHash(c.text);
    let read = false;
    if (!digested(db, space.id, hash)) {
      const title = `Commits ${c.from}–${c.to}`;
      const ok = await digestText(db, ask ?? helperDigestAsk(db), { space: space.id, base: 'commits', title, path: `commits:${c.head.slice(0, 12)}`, origin: `commits:${space.name} · ${c.from}–${c.to}`, text: c.text, cut: false, kind: 'conversation', notes: false, hash, now: () => now, onUpdate });
      if (!ok) {
        // The helper failed: tried again in about an hour, from the same commits.
        kvSet(db, kvAt(space.id), String(now - COMMITS_EVERY_MS + 3600_000));
        return false;
      }
      read = true;
    }
    kvSet(db, kvSha(space.id), c.head);
    return read;
  } catch (e) {
    console.warn(`[wiki] commits of ${space.name}: ${(e as Error).message}`);
    return false;
  }
}

/**
 * One project's new commits now, whatever the time since the last read (Update now): whether there were any to read.
 * Memory, Learn from conversations and the project's wiki memory must be on, as for the daily read.
 */
export async function digestCommitsNow(db: DB, ask: DigestAsk | undefined, spaceId: string, now = Date.now(), onUpdate?: (space: string | null) => void): Promise<boolean> {
  if (running || !memoryOn(db) || !learnOn(db) || !wikiMemoryOn(db, spaceId)) return false;
  const space = allSpaces(db).find((s) => s.id === spaceId);
  if (!space) return false;
  running = true;
  try {
    return await commitsOf(db, ask, space, now, onUpdate);
  } finally {
    running = false;
  }
}

/**
 * Reads the commits of every project whose turn it is: memory on, wiki memory on for it, a Git repository for a folder,
 * the last time at least COMMITS_EVERY_MS ago. Returns how many projects it read commits for. Never throws.
 */
export async function digestCommitsDue(db: DB, ask: DigestAsk | undefined, now = Date.now(), onUpdate?: (space: string | null) => void): Promise<number> {
  if (running) return 0;
  running = true;
  let read = 0;
  try {
    // Part of learning from the project's work: it stops with Learn from conversations, as the daily pass does.
    if (!memoryOn(db) || !learnOn(db)) return 0;
    for (const space of allSpaces(db)) {
      // A build, rebuild or update on the project's wiki reads its commits itself.
      if (!wikiMemoryOn(db, space.id) || jobRunning(space.id)) continue;
      const last = Number(kvGet(db, kvAt(space.id))) || 0;
      if (now - last < COMMITS_EVERY_MS) continue;
      if (await commitsOf(db, ask, space, now, onUpdate)) read++;
    }
    return read;
  } catch (e) {
    console.warn(`[wiki] reading commits: ${(e as Error).message}`);
    return read;
  } finally {
    running = false;
  }
}
