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
import { digestText } from './digest.ts';
import { helperDigestAsk, type DigestAsk } from './plan.ts';
import { digested } from './store.ts';

export const MAX_COMMITS = 60;
export const MAX_COMMIT_CHARS = 12_000;
/** The most of one commit's body that is kept. */
const BODY_CHARS = 800;
/** A project's commits are read when the last time was this long ago; the first time looks back this far. */
export const COMMITS_EVERY_MS = 20 * 3600_000;
const FIRST_DAYS = 14;

const kvAt = (space: string) => `wiki.commits.at.${space}`;
const kvSha = (space: string) => `wiki.commits.sha.${space}`;

/** Runs git in a folder: its output, or null when it fails (not a repository, git missing, too slow). */
function git(folder: string, args: string[]): Promise<string | null> {
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
  const inside = ((await git(folder, ['rev-parse', '--show-prefix'])) ?? '').trim() !== '';
  const out = await git(folder, ['log', '--no-merges', `--max-count=${MAX_COMMITS}`, '--date=short', '--format=%x1e%h%x1f%ad%x1f%s%x1f%b', ...range, ...(inside ? ['--', '.'] : [])]);
  if (!out) return null;
  const commits = out
    .split('\x1e')
    .map((r) => r.split('\x1f'))
    .filter((p) => p.length >= 3 && p[2].trim())
    .map((p) => ({ sha: p[0].trim(), date: p[1].trim(), message: cleanMessage(p[2], p.slice(3).join('\x1f')) }));
  if (!commits.length) return null;
  const kept: string[] = [];
  let used = 0;
  for (const c of commits) {
    const line = `${c.date} ${c.sha}: ${c.message}`;
    if (used + line.length + 2 > MAX_COMMIT_CHARS) break;
    kept.push(line);
    used += line.length + 2;
  }
  if (!kept.length) return null;
  const shown = commits.slice(0, kept.length);
  const from = shown[shown.length - 1].date;
  const to = shown[0].date;
  const left = commits.length - kept.length;
  const text = redactSecrets(`These are the git commit messages of the project (newest first), not a conversation: keep what lasts from them (decisions and why, conventions, pitfalls and their fixes, results), not what each commit changed.\n\n${kept.join('\n\n')}${left ? `\n\n(${left} older commits left out)` : ''}`);
  return { head, from, to, text, count: kept.length };
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
      if (!wikiMemoryOn(db, space.id)) continue;
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
