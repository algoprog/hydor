// Git repositories the sessions worked in: their state against the upstream, and fetch,
// pull (fast-forward only) and push from the browser.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { GitActionResult, GitBranch, GitCommit, GitCommitDetail, GitFileStatus, GitRepo, GitRepoDetail, GitStash } from '../shared/types.ts';
import { oneShot } from './oneshot.ts';
import { HttpError } from './auth.ts';
import type { DB } from './db.ts';
import { agentBaseEnv } from './env.ts';

let env: Record<string, string> | null = null;
// ssh never asks for anything (git's own prompts are off too) and gives up on a dead host.
const BATCH = '-o BatchMode=yes -o ConnectTimeout=15';
function gitEnv() {
  // Never wait for a password prompt, and never take locks the agents' own git commands need.
  env ??= { ...agentBaseEnv(), GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: `ssh ${BATCH}`, SSH_ASKPASS_REQUIRE: 'never', GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' };
  return env;
}

function run(cwd: string, args: string[], timeout: number, e: Record<string, string>): Promise<{ ok: boolean; out: string; err: string }> {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, env: e, timeout, maxBuffer: 16 << 20 }, (err, stdout, stderr) =>
      resolve({ ok: !err, out: String(stdout ?? ''), err: String(stderr || (err as Error | null)?.message || '') }),
    );
  });
}

/** Commands that reach a remote. */
const NETWORK = new Set(['fetch', 'pull', 'push', 'ls-remote', 'clone', 'remote', 'submodule']);

export async function git(cwd: string, args: string[], timeout = 15_000, extraEnv?: Record<string, string>): Promise<{ ok: boolean; out: string; err: string }> {
  let e = extraEnv ? { ...gitEnv(), ...extraEnv } : gitEnv();
  const sub = args.find((a, i) => !a.startsWith('-') && args[i - 1] !== '-c');
  if (sub && NETWORK.has(sub) && !extraEnv?.GIT_SSH_COMMAND) {
    // GIT_SSH_COMMAND overrides a repository's own ssh command (core.sshCommand, often how it picks
    // its key): use that one, in batch mode too.
    const own = (await run(cwd, ['config', '--get', 'core.sshCommand'], 5000, gitEnv())).out.trim();
    if (own) e = { ...e, GIT_SSH_COMMAND: `${own} ${BATCH}` };
  }
  return run(cwd, args, timeout, e);
}

// Folders the agents used only for throwaway work.
const SKIP = [/^\/tmp\//, /^\/var\/tmp\//, /\/scratchpad(\/|$)/, /\/\.cache\//, /\/node_modules\//, /\/\.(claude|codex)\/worktrees\//];

/** The repository a folder belongs to, found by walking up to the nearest .git. */
const tops = new Map<string, string | null>();
function toplevel(dir: string): string | null {
  const seen: string[] = [];
  let d = dir;
  let found: string | null = null;
  for (;;) {
    if (tops.has(d)) {
      found = tops.get(d)!;
      break;
    }
    seen.push(d);
    if (fs.existsSync(path.join(d, '.git'))) {
      found = d;
      break;
    }
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  for (const s of seen) tops.set(s, found);
  return found;
}

const SEP = '\x1f';
const LOG_FORMAT = ['%H', '%s', '%an', '%ct'].join(SEP);
function parseLog(out: string): GitCommit[] {
  return out
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [hash, subject, author, ct] = l.split(SEP);
      return { hash, subject, author, ts: Number(ct) * 1000 };
    });
}

/** `git status --porcelain=v2 --branch -z`: branch, upstream, ahead/behind and files in one call. */
async function status(repo: string, withFiles: boolean) {
  const r = await git(repo, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=normal'], 10_000);
  let branch: string | null = null;
  let upstream: string | null = null;
  let ahead = 0;
  let behind = 0;
  const files: GitFileStatus[] = [];
  let changed = 0;
  if (!r.ok) return { ok: false as const, err: r.err.trim() || 'git status failed', branch, upstream, ahead, behind, files, changed: -1 };
  const parts = r.out.split('\0');
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!p) continue;
    if (p.startsWith('# branch.head ')) branch = p.slice(14) === '(detached)' ? null : p.slice(14);
    else if (p.startsWith('# branch.upstream ')) upstream = p.slice(18);
    else if (p.startsWith('# branch.ab ')) {
      const m = /\+(\d+) -(\d+)/.exec(p);
      if (m) [ahead, behind] = [Number(m[1]), Number(m[2])];
    } else if (p[0] === '1' || p[0] === '2' || p[0] === 'u' || p[0] === '?') {
      changed++;
      if (!withFiles) {
        if (p[0] === '2') i++;
        continue;
      }
      if (p[0] === '?') files.push({ path: p.slice(2), code: '??' });
      else if (p[0] === '1') files.push({ path: p.split(' ').slice(8).join(' '), code: p.slice(2, 4) });
      else if (p[0] === '2') files.push({ path: p.split(' ').slice(9).join(' '), code: p.slice(2, 4), from: parts[++i] });
      else files.push({ path: p.split(' ').slice(10).join(' '), code: 'UU' });
    }
  }
  return { ok: true as const, err: '', branch, upstream, ahead, behind, files, changed };
}

export class GitRepos {
  private cache: { at: number; list: GitRepo[] } | null = null;

  constructor(private db: DB) {}

  /** Repositories behind session folders and the files sessions edited, most recently used first. */
  private candidates(): Map<string, { sessions: Set<string>; lastUsed: number }> {
    const repos = new Map<string, { sessions: Set<string>; lastUsed: number }>();
    const add = (dir: string, key: string, ts: number) => {
      if (!dir || SKIP.some((re) => re.test(dir + '/'))) return;
      const top = toplevel(dir);
      if (!top || top === os.homedir() || SKIP.some((re) => re.test(top + '/'))) return;
      const r = repos.get(top) ?? { sessions: new Set<string>(), lastUsed: 0 };
      r.sessions.add(key);
      r.lastUsed = Math.max(r.lastUsed, ts);
      repos.set(top, r);
    };
    const cwds = this.db.prepare('select key, cwd, updated_at as t from sessions where cwd is not null and hidden = 0').all() as { key: string; cwd: string; t: number }[];
    for (const c of cwds) add(c.cwd, c.key, c.t ?? 0);
    const edits = this.db.prepare("select text as p, key, max(ts) as t from chunk_text where kind = 'file' group by text, key").all() as { p: string; key: string; t: number }[];
    for (const e of edits) if (e.p.startsWith('/')) add(path.dirname(e.p), e.key, e.t ?? 0);
    return repos;
  }

  private async summarize(repoPath: string, sessions: number, lastUsed: number): Promise<GitRepo> {
    const [st, last, remotes, fetch] = await Promise.all([
      status(repoPath, false),
      git(repoPath, ['log', '-1', `--format=${LOG_FORMAT}`]),
      git(repoPath, ['remote']),
      git(repoPath, ['rev-parse', '--git-path', 'FETCH_HEAD']),
    ]);
    let fetchedAt: number | undefined;
    try {
      fetchedAt = fs.statSync(path.resolve(repoPath, fetch.out.trim())).mtimeMs;
    } catch {}
    return {
      path: repoPath,
      name: path.basename(repoPath),
      branch: st.branch,
      upstream: st.upstream,
      ahead: st.ahead,
      behind: st.behind,
      changed: st.changed,
      remote: remotes.out.split('\n').filter(Boolean)[0] ?? null,
      lastCommit: parseLog(last.out)[0],
      fetchedAt,
      sessions,
      lastUsed: lastUsed || undefined,
      error: st.ok ? undefined : st.err,
    };
  }

  async list(force = false): Promise<GitRepo[]> {
    if (!force && this.cache && Date.now() - this.cache.at < 15_000) return this.cache.list;
    const cands = [...this.candidates()].sort((a, b) => b[1].lastUsed - a[1].lastUsed);
    const out: GitRepo[] = [];
    // A few at a time: big repositories take a moment each.
    for (let i = 0; i < cands.length; i += 6) {
      out.push(...(await Promise.all(cands.slice(i, i + 6).map(([p, c]) => this.summarize(p, c.sessions.size, c.lastUsed)))));
    }
    this.cache = { at: Date.now(), list: out };
    return out;
  }

  /** Only repositories the sessions used, by their top folder. */
  private async known(repoPath: string): Promise<GitRepo> {
    const list = await this.list();
    const r = list.find((x) => x.path === repoPath);
    if (!r) throw new HttpError(404, 'Not a repository from your sessions');
    return r;
  }

  async detail(repoPath: string): Promise<GitRepoDetail> {
    const base = await this.known(repoPath);
    const [st, remotes, recent, stashes] = await Promise.all([
      status(repoPath, true),
      git(repoPath, ['remote', '-v']),
      git(repoPath, ['log', '-15', `--format=${LOG_FORMAT}`]),
      git(repoPath, ['stash', 'list', `--format=%gd${SEP}%s${SEP}%ct`]),
    ]);
    const summary = await this.summarize(repoPath, base.sessions, base.lastUsed ?? 0);
    const up = summary.upstream;
    const [push, pull] = up
      ? await Promise.all([git(repoPath, ['log', '-100', `--format=${LOG_FORMAT}`, `${up}..HEAD`]), git(repoPath, ['log', '-100', `--format=${LOG_FORMAT}`, `HEAD..${up}`])])
      : [{ out: '' }, { out: '' }];
    const rem = new Map<string, string>();
    for (const l of remotes.out.split('\n')) {
      const m = /^(\S+)\s+(\S+)\s+\(fetch\)/.exec(l);
      if (m) rem.set(m[1], m[2]);
    }
    this.patch(summary);
    return {
      ...summary,
      remotes: [...rem].map(([name, url]) => ({ name, url })),
      toPush: parseLog(push.out),
      toPull: parseLog(pull.out),
      files: st.files,
      recent: parseLog(recent.out),
      stashes: stashes.out
        .split('\n')
        .filter(Boolean)
        .map((l): GitStash => {
          const [ref, message, ct] = l.split(SEP);
          return { ref, message, ts: Number(ct) * 1000 };
        }),
    };
  }

  /** Keep the cached list in step after looking at or changing one repository. */
  private patch(r: GitRepo) {
    if (!this.cache) return;
    this.cache.list = this.cache.list.map((x) => (x.path === r.path ? r : x));
  }

  private async act(repoPath: string, args: string[], timeout: number): Promise<GitActionResult> {
    await this.known(repoPath);
    const r = await git(repoPath, args, timeout);
    return { ok: r.ok, output: (r.out + (r.err ? (r.out ? '\n' : '') + r.err : '')).trim(), repo: await this.detail(repoPath) };
  }

  fetch(repoPath: string) {
    return this.act(repoPath, ['fetch', '--prune'], 120_000);
  }

  /** Fast-forward only: never makes a merge commit; a diverged branch is left for a terminal. */
  pull(repoPath: string) {
    return this.act(repoPath, ['pull', '--ff-only'], 180_000);
  }

  async push(repoPath: string, publish: boolean) {
    const r = await this.known(repoPath);
    if (publish) {
      if (!r.remote || !r.branch) throw new HttpError(400, 'No remote or branch to publish to');
      return this.act(repoPath, ['push', '--set-upstream', r.remote, r.branch], 180_000);
    }
    return this.act(repoPath, ['push'], 180_000);
  }

  // ---- working on the repository from the app ------------------------------------------------------

  /** A path in the repository, relative to its top (refusing one outside it). */
  private rel(repoPath: string, file: string): string {
    const abs = path.resolve(repoPath, file);
    if (abs !== repoPath && !abs.startsWith(repoPath + path.sep)) throw new HttpError(400, 'Not a file in this repository');
    return path.relative(repoPath, abs) || '.';
  }

  private async result(repoPath: string, r: { ok: boolean; out: string; err: string }): Promise<GitActionResult> {
    return { ok: r.ok, output: (r.out + (r.err ? (r.out ? '\n' : '') + r.err : '')).trim(), repo: await this.detail(repoPath) };
  }

  private tracked = async (repoPath: string, rel: string) => (await git(repoPath, ['ls-files', '--error-unmatch', '--', rel])).ok;

  /** A file's changes since the last commit; a new file counts as added whole. */
  async fileDiff(repoPath: string, file: string): Promise<{ diff: string }> {
    await this.known(repoPath);
    const rel = this.rel(repoPath, file);
    let r = (await this.tracked(repoPath, rel))
      ? await git(repoPath, ['diff', '--no-color', '--no-ext-diff', 'HEAD', '--', rel], 20_000)
      : await git(repoPath, ['diff', '--no-color', '--no-ext-diff', '--no-index', '--', '/dev/null', rel], 20_000);
    // A repository without commits yet has no HEAD to compare with.
    if (!r.out && !r.ok) r = await git(repoPath, ['diff', '--no-color', '--cached', '--', rel], 20_000);
    return { diff: r.out.slice(0, 600_000) };
  }

  /** A commit's message, and each file it changed with its diff. */
  async commitDetail(repoPath: string, hash: string): Promise<GitCommitDetail> {
    await this.known(repoPath);
    if (!/^[0-9a-f]{4,40}$/i.test(hash)) throw new HttpError(400, 'Not a commit');
    const [meta, stat, patch] = await Promise.all([
      git(repoPath, ['show', '-s', `--format=%H${SEP}%an${SEP}%ct${SEP}%B`, hash]),
      git(repoPath, ['show', '--numstat', '--format=', hash]),
      git(repoPath, ['show', '--no-color', '--no-ext-diff', '--format=', '--patch', hash], 20_000),
    ]);
    if (!meta.ok) throw new HttpError(404, 'No such commit');
    const [full, author, ct, message] = meta.out.split(SEP);
    // The patch, cut into one diff per file.
    const diffs = new Map<string, string>();
    for (const part of patch.out.slice(0, 2_000_000).split(/^(?=diff --git )/m)) {
      const m = /^diff --git a\/(.+?) b\/(.+)$/m.exec(part);
      if (m) diffs.set(m[2], part);
    }
    const files = stat.out
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [a, d, ...p] = l.split('\t');
        const name = p.join('\t').replace(/^(.*)\{(.*) => (.*)\}(.*)$/, '$1$3$4').replace(/^.* => /, '');
        return { path: name, added: Number(a) || 0, removed: Number(d) || 0, diff: (diffs.get(name) ?? '').slice(0, 300_000) };
      });
    return { hash: full, author, ts: Number(ct) * 1000, message: message.trim(), files };
  }

  /** Commits just these files (others staged stay out), then pushes when asked. */
  async commit(repoPath: string, files: string[], message: string, push: boolean): Promise<GitActionResult> {
    await this.known(repoPath);
    if (!message.trim()) throw new HttpError(400, 'Write a commit message');
    if (!files.length) throw new HttpError(400, 'Pick the files to commit');
    const rels = files.map((f) => this.rel(repoPath, f));
    const add = await git(repoPath, ['add', '-A', '--', ...rels], 60_000);
    if (!add.ok) return this.result(repoPath, add);
    const c = await git(repoPath, ['commit', '--only', '-m', message.trim(), '--', ...rels], 120_000);
    if (!c.ok || !push) return this.result(repoPath, c);
    const branch = (await git(repoPath, ['branch', '--show-current'])).out.trim();
    const up = (await git(repoPath, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])).ok;
    const remote = (await git(repoPath, ['remote'])).out.split('\n').filter(Boolean)[0];
    const p = await git(repoPath, up ? ['push'] : ['push', '--set-upstream', remote ?? 'origin', branch], 180_000);
    return this.result(repoPath, { ok: p.ok, out: `${c.out}\n${p.out}`.trim(), err: p.err });
  }

  /** A commit message for these files' changes, in the style of the repository's recent ones. */
  async suggestMessage(repoPath: string, files: string[]): Promise<{ message: string }> {
    await this.known(repoPath);
    const rels = files.map((f) => this.rel(repoPath, f));
    const parts: string[] = [];
    let size = 0;
    for (const rel of rels) {
      if (size > 60_000) break;
      const d = (await this.fileDiff(repoPath, rel)).diff.slice(0, 20_000);
      size += d.length;
      parts.push(d);
    }
    const recent = (await git(repoPath, ['log', '-12', '--format=%s'])).out.trim();
    const out = await oneShot({
      system: [
        'You write git commit messages. Given a change, write one that says what it does and why it was needed.',
        'A summary line under 72 characters, then (when the change is not obvious from it) a blank line and a short body wrapped at about 72 columns.',
        'Match the style of the repository’s recent messages. Reply with the message only: no quotes, no code fences, no preamble.',
      ].join('\n'),
      prompt: `Recent commit messages in this repository:\n${recent || '(none yet)'}\n\nThe change:\n${parts.join('\n')}`,
      timeoutMs: 90_000,
    });
    return { message: out.trim().replace(/^```\w*\n?|```$/g, '').trim() };
  }

  /** Puts a file back as it was in the last commit; a new file is deleted. */
  async discard(repoPath: string, file: string): Promise<GitActionResult> {
    await this.known(repoPath);
    const rel = this.rel(repoPath, file);
    if (await this.tracked(repoPath, rel)) return this.result(repoPath, await git(repoPath, ['restore', '--source=HEAD', '--staged', '--worktree', '--', rel], 30_000));
    if (rel === '.') throw new HttpError(400, 'Not a file');
    fs.rmSync(path.join(repoPath, rel), { recursive: true, force: true });
    return this.result(repoPath, { ok: true, out: '', err: '' });
  }

  async branches(repoPath: string): Promise<{ current: string | null; branches: GitBranch[] }> {
    await this.known(repoPath);
    const [list, cur, merged] = await Promise.all([
      git(repoPath, ['for-each-ref', '--sort=-committerdate', `--format=%(refname:short)${SEP}%(committerdate:unix)${SEP}%(upstream:short)${SEP}%(upstream:track,nobracket)${SEP}%(subject)`, 'refs/heads'], 15_000),
      git(repoPath, ['branch', '--show-current']),
      git(repoPath, ['branch', '--merged', 'HEAD', '--format=%(refname:short)']),
    ]);
    const current = cur.out.trim() || null;
    const done = new Set(merged.out.split('\n').map((x) => x.trim()));
    return {
      current,
      branches: list.out
        .split('\n')
        .filter(Boolean)
        .map((l): GitBranch => {
          const [name, ct, upstream, track, subject] = l.split(SEP);
          return { name, ts: Number(ct) * 1000, upstream: upstream || undefined, track: track || undefined, subject, merged: done.has(name) && name !== current };
        }),
    };
  }

  /** Switches branch (git refuses when that would overwrite changes here), or makes a new one first. */
  async switchBranch(repoPath: string, branch: string, create: boolean): Promise<GitActionResult> {
    await this.known(repoPath);
    if (!(await git(repoPath, ['check-ref-format', '--branch', branch])).ok || branch.startsWith('-')) throw new HttpError(400, 'Not a valid branch name');
    return this.result(repoPath, await git(repoPath, create ? ['switch', '-c', branch] : ['switch', branch], 60_000));
  }

  /** Deletes a branch already merged into this one (git keeps one that is not). */
  async deleteBranch(repoPath: string, branch: string): Promise<GitActionResult> {
    await this.known(repoPath);
    if (branch.startsWith('-')) throw new HttpError(400, 'Not a branch');
    return this.result(repoPath, await git(repoPath, ['branch', '-d', '--', branch], 30_000));
  }

  async stash(repoPath: string, message: string): Promise<GitActionResult> {
    await this.known(repoPath);
    return this.result(repoPath, await git(repoPath, ['stash', 'push', '--include-untracked', ...(message.trim() ? ['-m', message.trim()] : [])], 60_000));
  }

  async stashAction(repoPath: string, ref: string, action: 'apply' | 'pop' | 'drop'): Promise<GitActionResult> {
    await this.known(repoPath);
    if (!/^stash@\{\d+\}$/.test(ref)) throw new HttpError(400, 'Not a stash');
    return this.result(repoPath, await git(repoPath, ['stash', action, ref], 60_000));
  }

  async fetchAll(): Promise<GitRepo[]> {
    const list = await this.list();
    const withRemote = list.filter((r) => r.remote);
    for (let i = 0; i < withRemote.length; i += 4) await Promise.all(withRemote.slice(i, i + 4).map((r) => git(r.path, ['fetch', '--prune'], 120_000)));
    return this.list(true);
  }
}
