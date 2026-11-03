// Commits an agent made: when a turn ends, the commands it ran are read for the line git prints as it
// makes a commit ("[main 1a2b3c4] Fix the login"), each commit is looked up in its repository (one the
// turn later amended or rebased away is left out), and they show as a note under the turn's reply. A
// click opens a commit to its message and diff (GET /api/commits/:key/show).
import path from 'node:path';
import type { CommitsNote, TurnCommit } from '../../shared/commits.ts';
import type { TimelineItem } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import type { Feature } from '../features/types.ts';
import { git, GitRepos } from '../git.ts';
import { addNote, notesOf, updateNote } from '../notes.ts';
import { lastTurn } from '../opinion/turns.ts';

/** What git prints for a commit it made: by commit, cherry-pick, revert, merge --squash, rebase's picks. */
const MADE = /^\[(.+?) (?:\(root-commit\) )?([0-9a-f]{7,40})\] (.*)$/gm;

/** A command's text, whichever way the agent gave it (Codex: an argument list). */
function commandOf(input: unknown, title: string): string {
  const c = (input as { command?: unknown; cmd?: unknown } | null)?.command ?? (input as { cmd?: unknown } | null)?.cmd;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map(String).join(' ');
  return title;
}

const unquote = (s: string) => s.replace(/^(['"])(.*)\1$/, '$2');

/** The folders a command ran git in: its `cd` and `git -C`, as written. */
function dirsIn(cmd: string): string[] {
  const out: string[] = [];
  for (const m of cmd.matchAll(/(?:^|[;&|(]\s*)cd\s+("[^"]+"|'[^']+'|[^\s;&|)]+)/g)) out.push(unquote(m[1]));
  for (const m of cmd.matchAll(/\bgit\s+-C\s+("[^"]+"|'[^']+'|\S+)/g)) out.push(unquote(m[1]));
  return out;
}

export interface Made {
  hash: string;
  branch: string;
  subject: string;
  /** Where to look for it, likeliest first. */
  dirs: string[];
}

/** The commits a turn's commands said they made, oldest first, with where each may be. */
export function commitsMade(items: TimelineItem[], cwd: string): Made[] {
  const out: Made[] = [];
  let here = cwd;
  const abs = (d: string, from: string) => (d.startsWith('~') ? d : path.resolve(from, d));
  for (const it of items) {
    if (it.kind !== 'tool' || it.tool.category !== 'command') continue;
    const t = it.tool;
    const cmd = commandOf(t.input, t.title);
    const from = t.cwd || here;
    const dirs = dirsIn(cmd)
      .filter((d) => !d.startsWith('~') && !d.includes('$'))
      .map((d) => abs(d, from));
    // Claude Code's shell stays where a command cd'd to.
    const cd = cmd.match(/^\s*cd\s+("[^"]+"|'[^']+'|[^\s;&|]+)\s*(?:&&|;|$)/);
    if (cd && !cd[1].includes('$') && !cd[1].startsWith('~')) here = abs(unquote(cd[1]), from);
    if (!/\bgit\b/.test(cmd) || !t.output) continue;
    for (const m of t.output.matchAll(MADE)) {
      if (out.some((o) => o.hash === m[2])) continue;
      out.push({ hash: m[2], branch: m[1], subject: m[3].trim(), dirs: [...new Set([...dirs.reverse(), from, cwd])] });
    }
  }
  return out;
}

/** A command that may make a commit: `git commit`, cherry-pick, revert, merge, am, rebase. */
const COMMITS = /\bgit\b(?:\s+-C\s+\S+|\s+-c\s+\S+|\s+--?[\w-]+(?:=\S+)?)*\s+(?:commit|cherry-pick|revert|merge|am|rebase|pull)\b/;

const flat = (s: string) => s.replace(/\\(.)/g, '$1').replace(/\s+/g, ' ');

/**
 * Commits a turn made that git printed no line for (`git commit -q`, or output cut short): in each folder a
 * committing command ran in, those made since the turn began whose subject the turn's commands wrote out
 * (`-m`, a heredoc, a message file it wrote). Another session committing in the same folder meanwhile wrote
 * its message elsewhere, so it is left out (a hash a later `git log` prints is no sign: it lists others' too).
 */
async function quietCommits(items: TimelineItem[], cwd: string, since: number, known: Set<string>): Promise<Made[]> {
  const committing: string[][] = [];
  let here = cwd;
  const abs = (d: string, from: string) => path.resolve(from, d);
  /** What the turn wrote: its commands, and files it wrote (a message for `git commit -F`). */
  let written = '';
  for (const it of items) {
    if (it.kind !== 'tool') continue;
    if (it.tool.category !== 'command') {
      if (it.tool.input) written += `${flat(JSON.stringify(it.tool.input).replace(/\\n/g, ' '))}\n`;
      continue;
    }
    const cmd = commandOf(it.tool.input, it.tool.title);
    written += `${flat(cmd)}\n`;
    const from = it.tool.cwd || here;
    const dirs = dirsIn(cmd)
      .filter((d) => !d.startsWith('~') && !d.includes('$'))
      .map((d) => abs(d, from));
    const cd = cmd.match(/^\s*cd\s+("[^"]+"|'[^']+'|[^\s;&|]+)\s*(?:&&|;|$)/);
    if (cd && !cd[1].includes('$') && !cd[1].startsWith('~')) here = abs(unquote(cd[1]), from);
    if (COMMITS.test(cmd)) committing.push([...new Set([...dirs.reverse(), from, cwd])]);
  }
  if (!committing.length) return [];
  const repos = new Map<string, string>();
  for (const dir of new Set(committing.flat())) {
    const top = await git(dir, ['rev-parse', '--show-toplevel'], 5000);
    if (top.ok && !repos.has(top.out.trim())) repos.set(top.out.trim(), dir);
  }
  const out: Made[] = [];
  for (const [repo] of repos) {
    // A minute's slack for a clock read late; commits dated earlier were there before the turn.
    const log = await git(repo, ['log', '--all', '-n', '50', `--since=@${Math.floor(since / 1000) - 60}`, `--format=%H${SEP}%s`, '--reverse'], 5000);
    if (!log.ok) continue;
    const head = (await git(repo, ['rev-parse', '--abbrev-ref', 'HEAD'], 5000)).out.trim();
    for (const line of log.out.split('\n')) {
      const [hash, subject = ''] = line.split(SEP);
      if (!hash || known.has(hash) || [...known].some((k) => hash.startsWith(k))) continue;
      const s = flat(subject).trim();
      if (s.length < 4 || !written.includes(s.slice(0, 60))) continue;
      out.push({ hash, branch: head === 'HEAD' ? 'detached HEAD' : head, subject, dirs: [repo] });
      known.add(hash);
    }
  }
  return out;
}

const SEP = '\x1f';

/** A commit as the note shows it, from the first of its folders that has it; null when none does or nothing points to it any more. */
async function lookUp(m: Made, own: string | null): Promise<TurnCommit | null> {
  for (const dir of m.dirs) {
    const top = await git(dir, ['rev-parse', '--show-toplevel'], 5000);
    if (!top.ok) continue;
    const repo = top.out.trim();
    const meta = await git(repo, ['show', '-s', `--format=%H${SEP}%s${SEP}%an${SEP}%ct`, `${m.hash}^{commit}`, '--'], 5000);
    if (!meta.ok) continue;
    const [hash, subject, author, ct] = meta.out.trim().split(SEP);
    // Amended, rebased or reset away in the same turn: no branch, tag or HEAD has it.
    const [refs, head] = await Promise.all([
      git(repo, ['for-each-ref', '--contains', hash, '--count=1', '--format=%(refname)'], 5000),
      git(repo, ['merge-base', '--is-ancestor', hash, 'HEAD'], 5000),
    ]);
    if (!refs.out.trim() && !head.ok) return null;
    const stat = await git(repo, ['show', '-m', '--first-parent', '--numstat', '--format=', hash, '--'], 10_000);
    let files = 0;
    let added = 0;
    let removed = 0;
    for (const l of stat.out.split('\n')) {
      const [a, r] = l.split('\t');
      if (r === undefined) continue;
      files++;
      added += Number(a) || 0;
      removed += Number(r) || 0;
    }
    return { hash, subject: subject || m.subject, branch: m.branch, repo, own: repo === own || undefined, author, at: Number(ct) * 1000, files, added, removed };
  }
  return null;
}

/** Where the note goes: under the turn's end, else its last word. */
function anchorOf(items: TimelineItem[], last: TimelineItem): string {
  const end = items.findLast((i) => i.kind === 'turn');
  const said = items.findLast((i) => i.kind === 'assistant');
  return (end ?? said ?? last).id;
}

export const commits: Feature = {
  id: 'commits',
  async turnEnd(t, d) {
    const cwd = t.cwd ?? d.sessions.summary(t.key)?.cwd;
    if (!cwd) return;
    let items: TimelineItem[] = [];
    try {
      items = (await d.sessions.timeline(t.key)).parser.items;
    } catch {
      return;
    }
    const turn = lastTurn(items);
    if (!turn) return;
    const made = commitsMade(turn.items, cwd);
    // Agents often commit with -q, which prints no line: look for those in the repositories too.
    // When the turn began: its items' times, else what the session watcher saw (late for a quick turn, so
    // a few hours back; the subject still has to be in the turn's commands, and earlier turns' commits are known).
    const stamped = Math.min(...[turn.prompt, ...turn.items].map((i) => i?.ts ?? Infinity));
    const began = Number.isFinite(stamped) ? Math.min(stamped, t.startedAt || stamped) : Math.min(t.startedAt || Infinity, t.endedAt - 3 * 3600_000);
    // Commits earlier turns showed are theirs; this turn's own note, told again, is made afresh.
    const anchor = anchorOf(turn.items, turn.last);
    const earlier = notesOf(d.db, t.key, 'commits').filter((n) => n.anchor !== anchor);
    const known = new Set([...made.map((m) => m.hash), ...earlier.flatMap((n) => ((n.data as CommitsNote | null)?.commits ?? []).map((c) => c.hash))]);
    made.push(...(await quietCommits(turn.items, cwd, began, known)));
    if (!made.length) return;
    const own = (await git(cwd, ['rev-parse', '--show-toplevel'], 5000)).out.trim() || null;
    const found = (await Promise.all(made.map((m) => lookUp(m, own)))).filter((c): c is TurnCommit => !!c);
    if (!found.length) return;
    const data: CommitsNote = { commits: found };
    // Told twice of the same turn: the note it has is brought up to date.
    const had = notesOf(d.db, t.key, 'commits').find((n) => n.anchor === anchor);
    if (had) updateNote(d.db, had.id, data);
    else addNote(d.db, { key: t.key, kind: 'commits', anchor, data });
  },
  routes(d) {
    const repos = new GitRepos(d.db);
    /** A commit from one of the session's commit notes: its message and each file it changed with its diff. */
    d.app.get('/api/commits/:key/show', async (req) => {
      const key = (req.params as { key: string }).key;
      const q = req.query as Record<string, string | undefined>;
      const hash = String(q.hash ?? '');
      const c = notesOf(d.db, key, 'commits')
        .flatMap((n) => (n.data as CommitsNote | null)?.commits ?? [])
        .find((x) => x.hash === hash);
      if (!c) throw new HttpError(404, 'That commit is not in this session');
      return repos.commitDetail(c.repo, c.hash, true);
    });
  },
};
