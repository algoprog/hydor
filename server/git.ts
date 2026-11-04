// Git repositories the sessions worked in, and those added on the Git page (a folder on this computer, or one
// cloned from a link): where each stands against its remote, and working on them from the browser. Sync
// (fetch, then bring in what is new, then send up what is yours), commits of the files you pick (or amending
// the last one), the history with what a graph needs, branches (switch, merge, rename, publish, compare,
// delete), stashes, tags, and merges or rebases that stop on conflicts, to continue or stop.
//
// Every git command runs with arguments as a list (never a shell), never asks for anything (no password
// prompt, no editor) and gives up after a while; names and paths are checked before they reach git.
import { execFile, spawn } from 'node:child_process';
import { isAbsPath } from './platform.ts';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  GitActionResult,
  GitBranch,
  GitCloneJob,
  GitCommit,
  GitCommitDetail,
  GitFileStatus,
  GitLogCommit,
  GitOperation,
  GitOperationKind,
  GitRef,
  GitRepo,
  GitRepoDetail,
  GitStash,
  GitStashDetail,
  GitSyncResult,
} from '../shared/types.ts';
import { oneShot } from './oneshot.ts';
import { HttpError } from './auth.ts';
import { kvGet, kvSet, type DB } from './db.ts';
import { agentBaseEnv } from './env.ts';

let env: Record<string, string> | null = null;
// ssh never asks for anything (git's own prompts are off too) and gives up on a dead host.
const BATCH = '-o BatchMode=yes -o ConnectTimeout=15';
function gitEnv() {
  // Never wait for a password prompt or an editor, and never take locks the agents' own git commands need.
  env ??= {
    ...agentBaseEnv(),
    GIT_TERMINAL_PROMPT: '0',
    GIT_SSH_COMMAND: `ssh ${BATCH}`,
    SSH_ASKPASS_REQUIRE: 'never',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_EDITOR: 'true',
    GIT_SEQUENCE_EDITOR: 'true',
    GIT_MERGE_AUTOEDIT: 'no',
    LC_ALL: 'C',
  };
  return env;
}

function run(cwd: string, args: string[], timeout: number, e: Record<string, string>): Promise<{ ok: boolean; out: string; err: string }> {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, env: e, timeout, maxBuffer: 32 << 20 }, (err, stdout, stderr) =>
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

/** stdout and stderr together, as a failure shows them. */
const said = (r: { out: string; err: string }) => (r.out + (r.err ? (r.out ? '\n' : '') + r.err : '')).trim();

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
const REC = '\x1e';
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

/** The history's format: what a graph needs (parents) and the branches and tags on each commit. Use with --decorate=full. */
const GRAPH_FORMAT = `${REC}${['%H', '%P', '%an', '%ae', '%ct', '%D', '%s'].join(SEP)}`;
function parseGraphLog(out: string): GitLogCommit[] {
  return out
    .split(REC)
    .filter((s) => s.trim())
    .map((rec) => {
      const [hash, parents, author, email, ct, deco, ...subject] = rec.replace(/\n+$/, '').split(SEP);
      const { refs, head } = parseRefs(deco ?? '');
      return { hash, parents: parents ? parents.split(' ') : [], author, email, ts: Number(ct) * 1000, refs, head: head || undefined, subject: subject.join(SEP) };
    });
}

/** `%D` with full names ("HEAD -> refs/heads/main, refs/remotes/origin/main, tag: refs/tags/v1"): branches, remote branches, tags. */
export function parseRefs(d: string): { refs: GitRef[]; head: boolean } {
  const refs: GitRef[] = [];
  let head = false;
  for (let part of d.split(', ')) {
    part = part.trim();
    if (!part) continue;
    if (part === 'HEAD') {
      head = true;
      continue;
    }
    let current = false;
    if (part.startsWith('HEAD -> ')) {
      head = current = true;
      part = part.slice(8);
    }
    if (part.startsWith('tag: ')) part = part.slice(5);
    if (part.startsWith('refs/heads/')) refs.push(current ? { name: part.slice(11), kind: 'branch', current } : { name: part.slice(11), kind: 'branch' });
    else if (part.startsWith('refs/remotes/')) {
      if (!part.endsWith('/HEAD')) refs.push({ name: part.slice(13), kind: 'remote' });
    } else if (part.startsWith('refs/tags/')) refs.push({ name: part.slice(10), kind: 'tag' });
  }
  return { refs, head };
}

/** `git status --porcelain=v2 --branch -z`: branch, upstream, ahead/behind and files in one call. */
async function status(repo: string, withFiles: boolean) {
  const r = await git(repo, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=normal'], 10_000);
  let branch: string | null = null;
  let upstream: string | null = null;
  let ahead = 0;
  let behind = 0;
  let oid: string | null = null;
  const files: GitFileStatus[] = [];
  let changed = 0;
  let ab = false;
  if (!r.ok) return { ok: false as const, err: r.err.trim() || 'git status failed', branch, upstream, ahead, behind, oid, files, changed: -1, gone: false };
  const parts = r.out.split('\0');
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!p) continue;
    if (p.startsWith('# branch.oid ')) oid = p.slice(13) === '(initial)' ? null : p.slice(13);
    else if (p.startsWith('# branch.head ')) branch = p.slice(14) === '(detached)' ? null : p.slice(14);
    else if (p.startsWith('# branch.upstream ')) upstream = p.slice(18);
    else if (p.startsWith('# branch.ab ')) {
      ab = true;
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
      else files.push({ path: p.split(' ').slice(10).join(' '), code: p.slice(2, 4), conflict: true });
    }
  }
  // An upstream set but not on the remote (a clone of an empty repository, or deleted there): not on the remote.
  const gone = !!upstream && !ab;
  if (gone) upstream = null;
  return { ok: true as const, err: '', branch, upstream, ahead, behind, oid, files, changed, gone };
}

/** `--numstat -z` lines, by path (a rename: by its new path). */
function parseNumstat(out: string): Map<string, { added?: number; removed?: number; binary?: boolean }> {
  const m = new Map<string, { added?: number; removed?: number; binary?: boolean }>();
  const parts = out.split('\0');
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const t1 = p.indexOf('\t');
    const t2 = t1 < 0 ? -1 : p.indexOf('\t', t1 + 1);
    if (t2 < 0) continue;
    const [a, d] = [p.slice(0, t1), p.slice(t1 + 1, t2)];
    let file = p.slice(t2 + 1);
    if (!file) {
      file = parts[i + 2] ?? '';
      i += 2;
    }
    m.set(file, a === '-' ? { binary: true } : { added: Number(a) || 0, removed: Number(d) || 0 });
  }
  return m;
}

/** Lines in a new file (or that it is binary), for files up to 2 MB. */
async function countLines(abs: string): Promise<{ added?: number; removed?: number; binary?: boolean }> {
  try {
    const st = await fs.promises.stat(abs);
    if (!st.isFile() || st.size > 2 << 20) return {};
    const buf = await fs.promises.readFile(abs);
    if (buf.subarray(0, 8000).includes(0)) return { binary: true };
    let n = 0;
    for (const b of buf) if (b === 10) n++;
    if (buf.length && buf[buf.length - 1] !== 10) n++;
    return { added: n, removed: 0 };
  } catch {
    return {};
  }
}

/** Whether a file still holds conflict markers. */
async function hasMarkers(abs: string): Promise<boolean> {
  try {
    const st = await fs.promises.stat(abs);
    if (!st.isFile() || st.size > 8 << 20) return false;
    return /^(<{7}|>{7})( |$)/m.test(await fs.promises.readFile(abs, 'utf8'));
  } catch {
    return false;
  }
}

/** The git dir's files that say a merge, rebase, cherry-pick or revert is under way. */
async function operationKind(repo: string): Promise<{ kind: GitOperationKind; dir: string } | null> {
  const r = await git(repo, ['rev-parse', '--git-path', 'rebase-merge', '--git-path', 'rebase-apply', '--git-path', 'MERGE_HEAD', '--git-path', 'CHERRY_PICK_HEAD', '--git-path', 'REVERT_HEAD'], 5000);
  if (!r.ok) return null;
  const [rbm, rba, merge, pick, revert] = r.out.split('\n').map((p) => path.resolve(repo, p.trim()));
  if (fs.existsSync(rbm)) return { kind: 'rebase', dir: rbm };
  if (fs.existsSync(rba)) return { kind: 'rebase', dir: rba };
  if (fs.existsSync(merge)) return { kind: 'merge', dir: merge };
  if (fs.existsSync(pick)) return { kind: 'cherry-pick', dir: pick };
  if (fs.existsSync(revert)) return { kind: 'revert', dir: revert };
  return null;
}

const readText = (p: string) => {
  try {
    return fs.readFileSync(p, 'utf8').trim();
  } catch {
    return '';
  }
};

/** A name for a commit: a branch or tag on it ("origin/main"), else its short hash. */
async function nameOf(repo: string, hash: string): Promise<string> {
  if (!hash) return '';
  const r = await git(repo, ['for-each-ref', '--points-at', hash, '--format=%(refname:short)', 'refs/heads', 'refs/remotes', 'refs/tags'], 5000);
  const names = r.out.split('\n').filter((n) => n && !n.endsWith('/HEAD'));
  return names.find((n) => n.includes('/')) ?? names[0] ?? hash.slice(0, 7);
}

const isHash = (h: string) => /^[0-9a-f]{4,64}$/i.test(h);

/** Only https, ssh and git addresses (an scp-like git@host:path is ssh): never a file path, file:// or ext::. */
export function cloneUrlOk(url: string): boolean {
  const u = url.trim();
  if (!u || u.startsWith('-') || /\s/.test(u) || u.includes('::')) return false;
  if (/^(https|ssh|git):\/\/[^/@\s]+(@[^/\s]+)?(:\d+)?\/.+/i.test(u)) return true;
  return /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:(?!\/\/)[^\s]+$/.test(u);
}

/** An address as it may be shown: a password or token in it is hidden. */
export const redactUrl = (u: string) => u.replace(/^([a-z+]+:\/\/)([^/@:]+):[^/@]+@/i, '$1$2:•••@');

/** A clone's folder name from its address: …/shop-api.git → shop-api. */
export function cloneName(url: string): string {
  const last = url.trim().replace(/[/\\]+$/, '').split(/[/:]/).pop() ?? '';
  return last.replace(/\.git$/i, '') || 'repository';
}

/** Escapes a path for .gitignore: patterns' special characters, and a leading # or !. */
const ignoreLine = (rel: string) => `/${rel.replace(/[\\*?[\]]/g, '\\$&').replace(/^([#!])/, '\\$1').replace(/ $/, '\\ ')}`;

interface Manual {
  path: string;
  addedAt: number;
}
const MANUAL_KEY = 'git.repos';

interface CloneRun extends GitCloneJob {
  finished?: number;
}

export class GitRepos {
  private cache: { at: number; list: GitRepo[] } | null = null;
  private cands: { at: number; map: Map<string, { sessions: Set<string>; lastUsed: number }> } | null = null;
  private clones = new Map<string, CloneRun>();

  constructor(private db: DB) {}

  // ---- which repositories ---------------------------------------------------------------------------

  /** Repositories behind session folders and the files sessions edited, most recently used first. */
  private candidates(): Map<string, { sessions: Set<string>; lastUsed: number }> {
    if (this.cands && Date.now() - this.cands.at < 15_000) return this.cands.map;
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
    for (const e of edits) if (isAbsPath(e.p)) add(path.dirname(e.p), e.key, e.t ?? 0);
    this.cands = { at: Date.now(), map: repos };
    return repos;
  }

  /** The repositories added on the Git page. */
  private manual(): Manual[] {
    try {
      const v = JSON.parse(kvGet(this.db, MANUAL_KEY) ?? '[]');
      return Array.isArray(v) ? v.filter((x): x is Manual => typeof x?.path === 'string' && isAbsPath(x.path)) : [];
    } catch {
      return [];
    }
  }

  private setManual(list: Manual[]) {
    kvSet(this.db, MANUAL_KEY, JSON.stringify(list));
    this.cache = null;
  }

  private async summarize(repoPath: string, sessions: number, lastUsed: number, manual: boolean): Promise<GitRepo> {
    const [st, last, remotes, paths] = await Promise.all([
      status(repoPath, false),
      git(repoPath, ['log', '-1', `--format=${LOG_FORMAT}`]),
      git(repoPath, ['remote']),
      git(repoPath, ['rev-parse', '--git-path', 'FETCH_HEAD']),
    ]);
    let fetchedAt: number | undefined;
    try {
      fetchedAt = fs.statSync(path.resolve(repoPath, paths.out.trim())).mtimeMs;
    } catch {}
    const op = st.ok ? await operationKind(repoPath) : null;
    const names = remotes.out.split('\n').filter(Boolean);
    return {
      path: repoPath,
      name: path.basename(repoPath),
      branch: st.branch,
      upstream: st.upstream,
      ahead: st.ahead,
      behind: st.behind,
      changed: st.changed,
      remote: names.includes('origin') ? 'origin' : (names[0] ?? null),
      lastCommit: parseLog(last.out)[0],
      fetchedAt,
      sessions,
      lastUsed: lastUsed || undefined,
      manual: manual || undefined,
      upstreamGone: st.gone || undefined,
      operation: op?.kind,
      error: st.ok ? undefined : st.err,
    };
  }

  /** Every repository to list: the sessions' and those added here, with when each was last used. */
  private all(): Map<string, { sessions: number; lastUsed: number; manual: boolean }> {
    const out = new Map<string, { sessions: number; lastUsed: number; manual: boolean }>();
    for (const [p, c] of this.candidates()) out.set(p, { sessions: c.sessions.size, lastUsed: c.lastUsed, manual: false });
    for (const m of this.manual()) {
      if (!fs.existsSync(path.join(m.path, '.git'))) continue;
      const c = out.get(m.path);
      out.set(m.path, { sessions: c?.sessions ?? 0, lastUsed: Math.max(c?.lastUsed ?? 0, m.addedAt), manual: true });
    }
    return out;
  }

  async list(force = false): Promise<GitRepo[]> {
    if (!force && this.cache && Date.now() - this.cache.at < 15_000) return this.cache.list;
    if (force) this.cands = null;
    const cands = [...this.all()].sort((a, b) => b[1].lastUsed - a[1].lastUsed);
    const out: GitRepo[] = [];
    // A few at a time: big repositories take a moment each.
    for (let i = 0; i < cands.length; i += 6) {
      out.push(...(await Promise.all(cands.slice(i, i + 6).map(([p, c]) => this.summarize(p, c.sessions, c.lastUsed, c.manual)))));
    }
    this.cache = { at: Date.now(), list: out };
    return out;
  }

  /** Only repositories the sessions used (by their top folder) or that were added here. */
  private known(repoPath: string): { sessions: number; lastUsed: number; manual: boolean } {
    let r = this.all().get(repoPath);
    if (!r) {
      this.cands = null;
      r = this.all().get(repoPath);
    }
    if (!r) throw new HttpError(404, 'Not a repository from your sessions or the Git page');
    return r;
  }

  /**
   * Adds a folder on this computer: its repository (the folder or one it is in), or, with `init`, a new
   * repository started in it. A folder in no repository comes back as `notRepo` for the page to offer that.
   */
  async add(dir: string, init = false): Promise<{ repo?: GitRepo; notRepo?: boolean; path: string }> {
    if (!path.isAbsolute(dir)) throw new HttpError(400, 'Which folder?');
    const abs = path.resolve(dir);
    let st: fs.Stats;
    try {
      st = fs.statSync(abs);
    } catch {
      throw new HttpError(404, `No folder at ${abs}`);
    }
    if (!st.isDirectory()) throw new HttpError(400, `${abs} is not a folder`);
    for (const k of [...tops.keys()]) if (k === abs || k.startsWith(abs + '/') || abs.startsWith(k + '/')) tops.delete(k);
    let top = toplevel(abs);
    // A home folder kept in git (its dotfiles) holds every folder under it: that is not the repository meant.
    if (top === os.homedir() && abs !== top) top = null;
    if (!top) {
      if (!init) return { notRepo: true, path: abs };
      if (abs === os.homedir() || abs === '/') throw new HttpError(400, 'Start a repository in a project’s folder, not the whole home folder');
      const branch = (await git(abs, ['config', '--get', 'init.defaultBranch'])).out.trim();
      const r = await git(abs, ['init', ...(branch ? [] : ['--initial-branch=main'])], 30_000);
      if (!r.ok) throw new HttpError(400, said(r) || 'git init failed');
      tops.delete(abs);
      top = abs;
    }
    const list = this.manual().filter((m) => m.path !== top);
    this.setManual([...list, { path: top, addedAt: Date.now() }]);
    const k = this.known(top);
    return { repo: await this.summarize(top, k.sessions, k.lastUsed, true), path: top };
  }

  /** Takes a repository added here off the list (its folder stays as it is). */
  remove(repoPath: string) {
    this.setManual(this.manual().filter((m) => m.path !== repoPath));
  }

  // ---- one repository -------------------------------------------------------------------------------

  async detail(repoPath: string): Promise<GitRepoDetail> {
    const base = this.known(repoPath);
    const [st, remotes, stashes, tags, numstat] = await Promise.all([
      status(repoPath, true),
      git(repoPath, ['remote', '-v']),
      git(repoPath, ['stash', 'list', `--format=%gd${SEP}%s${SEP}%ct`]),
      git(repoPath, ['tag', '--list']),
      git(repoPath, ['diff', '--numstat', '-z', '--no-color', 'HEAD'], 20_000),
    ]);
    const summary = await this.summarize(repoPath, base.sessions, base.lastUsed, base.manual);
    const up = summary.upstream;
    const [push, pull] = up
      ? await Promise.all([git(repoPath, ['log', '-100', `--format=${LOG_FORMAT}`, `${up}..HEAD`]), git(repoPath, ['log', '-100', `--format=${LOG_FORMAT}`, `HEAD..${up}`])])
      : [{ out: '' }, { out: '' }];
    const rem = new Map<string, string>();
    for (const l of remotes.out.split('\n')) {
      const m = /^(\S+)\s+(\S+)\s+\(fetch\)/.exec(l);
      if (m) rem.set(m[1], redactUrl(m[2]));
    }
    // Lines added and removed in each file: against the last commit, or (none yet) what is staged; new files counted whole.
    const counts = numstat.ok ? parseNumstat(numstat.out) : parseNumstat((await git(repoPath, ['diff', '--cached', '--numstat', '-z'])).out);
    const files = await Promise.all(
      st.files.map(async (f, i) => {
        const c = counts.get(f.path) ?? (f.code === '??' && i < 300 && !f.path.endsWith('/') ? await countLines(path.join(repoPath, f.path)) : undefined);
        return c ? { ...f, ...c } : f;
      }),
    );
    // HEAD can be changed (amended, undone) while no remote has it.
    const head = st.oid;
    let headPushed = false;
    if (head && rem.size) {
      if (up) headPushed = (await git(repoPath, ['merge-base', '--is-ancestor', 'HEAD', up])).ok;
      if (!headPushed) headPushed = !!(await git(repoPath, ['branch', '-r', '--contains', 'HEAD', '--format=%(refname)'], 15_000)).out.trim();
    }
    const list = stashes.out
      .split('\n')
      .filter(Boolean)
      .map((l): GitStash => {
        const [ref, message, ct] = l.split(SEP);
        const m = /^(?:WIP on|On) ([^:]+): (.*)$/s.exec(message);
        return { ref, message: m ? m[2] : message, branch: m?.[1], ts: Number(ct) * 1000 };
      });
    await Promise.all(
      list.slice(0, 20).map(async (s) => {
        const r = await git(repoPath, ['stash', 'show', '--include-untracked', '--name-only', s.ref]);
        if (r.ok) s.files = r.out.split('\n').filter(Boolean).length;
      }),
    );
    this.patch(summary);
    return {
      ...summary,
      remotes: [...rem].map(([name, url]) => ({ name, url })),
      toPush: parseLog(push.out),
      toPull: parseLog(pull.out),
      files,
      stashes: list,
      head,
      headPushed,
      op: await this.operation(repoPath, files),
      tags: tags.out.split('\n').filter(Boolean).length,
    };
  }

  /** The merge, rebase, revert or cherry-pick under way: what it is, how far it got, and the files that clash. */
  private async operation(repoPath: string, files: GitFileStatus[]): Promise<GitOperation | null> {
    const op = await operationKind(repoPath);
    if (!op) return null;
    const conflicts = await Promise.all(
      files.filter((f) => f.conflict).map(async (f) => ({ path: f.path, resolved: !(await hasMarkers(path.join(repoPath, f.path))) })),
    );
    const out: GitOperation = { kind: op.kind, conflicts };
    if (op.kind === 'rebase') {
      const onto = readText(path.join(op.dir, 'onto'));
      out.onto = await nameOf(repoPath, onto);
      out.step = Number(readText(path.join(op.dir, 'msgnum')) || readText(path.join(op.dir, 'next'))) || undefined;
      out.steps = Number(readText(path.join(op.dir, 'end')) || readText(path.join(op.dir, 'last'))) || undefined;
      const stopped = readText(path.join(op.dir, 'stopped-sha')) || readText(path.join(op.dir, 'original-commit'));
      if (stopped && isHash(stopped)) out.stoppedAt = parseLog((await git(repoPath, ['log', '-1', `--format=${LOG_FORMAT}`, stopped])).out)[0];
    } else if (op.kind === 'merge') {
      const mm = (await git(repoPath, ['rev-parse', '--git-path', 'MERGE_MSG'])).out.trim();
      const msg = mm ? readText(path.resolve(repoPath, mm)) : '';
      out.onto = /^Merge (?:remote-tracking )?branch(?:es)? '([^']+)'/.exec(msg)?.[1] ?? (await nameOf(repoPath, readText(op.dir).split('\n')[0]));
    } else {
      const h = readText(op.dir).split('\n')[0];
      if (isHash(h)) out.stoppedAt = parseLog((await git(repoPath, ['log', '-1', `--format=${LOG_FORMAT}`, h])).out)[0];
    }
    return out;
  }

  /** Keep the cached list in step after looking at or changing one repository. */
  private patch(r: GitRepo) {
    if (!this.cache) return;
    this.cache.list = this.cache.list.map((x) => (x.path === r.path ? r : x));
  }

  private async result(repoPath: string, r: { ok: boolean; out: string; err: string }): Promise<GitActionResult> {
    return { ok: r.ok, output: said(r), repo: await this.detail(repoPath) };
  }

  private async act(repoPath: string, args: string[], timeout: number): Promise<GitActionResult> {
    this.known(repoPath);
    return this.result(repoPath, await git(repoPath, args, timeout));
  }

  // ---- the remote -----------------------------------------------------------------------------------

  fetch(repoPath: string) {
    return this.act(repoPath, ['fetch', '--prune'], 120_000);
  }

  /**
   * Gets what is new on the remote, brings it in (fast-forward; when both sides moved on, only with `mode`:
   * `rebase` puts this branch's commits on top, `merge` joins them with a merge commit), then, with `push`,
   * sends this branch's commits up. A branch not on the remote yet is published (with `push`).
   */
  async sync(repoPath: string, o: { mode?: 'rebase' | 'merge'; push?: boolean } = {}): Promise<GitSyncResult> {
    this.known(repoPath);
    const remotes = (await git(repoPath, ['remote'])).out.split('\n').filter(Boolean);
    if (!remotes.length) throw new HttpError(400, 'This repository has no remote to sync with: add one first');
    if (await operationKind(repoPath)) throw new HttpError(409, 'Finish or stop the merge or rebase first');
    let st = await status(repoPath, false);
    if (!st.branch) throw new HttpError(400, 'Not on a branch: switch to one first');
    const done = async (r: { ok: boolean; out: string; err: string }, extra: Partial<GitSyncResult>): Promise<GitSyncResult> => ({ ...(await this.result(repoPath, r)), ...extra });
    if (!st.upstream) {
      if (!o.push) throw new HttpError(400, 'This branch is not on the remote yet: publish it first');
      const remote = remotes.includes('origin') ? 'origin' : remotes[0];
      const p = await git(repoPath, ['push', '--set-upstream', remote, st.branch], 180_000);
      return done(p, p.ok ? { published: true } : { failed: 'push' });
    }
    const f = await git(repoPath, ['fetch', '--prune'], 120_000);
    if (!f.ok) return done(f, { failed: 'fetch' });
    st = await status(repoPath, false);
    const out: string[] = [said(f)];
    let pulled = 0;
    if (st.behind > 0) {
      if (st.ahead > 0 && !o.mode) return done({ ok: false, out: '', err: '' }, { diverged: { ahead: st.ahead, behind: st.behind } });
      // By its name (origin/main), which git writes in the conflict markers and the merge's message.
      const up = st.upstream ?? '@{u}';
      const args = st.ahead === 0 ? ['merge', '--ff-only', up] : o.mode === 'rebase' ? ['rebase', '--autostash', up] : ['merge', '--no-edit', up];
      const m = await git(repoPath, args, 180_000);
      out.push(said(m));
      if (!m.ok) return done({ ok: false, out: out.filter(Boolean).join('\n'), err: '' }, { failed: 'pull', conflicts: !!(await operationKind(repoPath)) });
      pulled = st.behind;
      st = await status(repoPath, false);
    }
    let pushed = 0;
    if (o.push && st.ahead > 0) {
      const p = await git(repoPath, ['push'], 180_000);
      out.push(said(p));
      if (!p.ok) return done({ ok: false, out: out.filter(Boolean).join('\n'), err: '' }, { failed: 'push', pulled });
      pushed = st.ahead;
    }
    return done({ ok: true, out: out.filter(Boolean).join('\n'), err: '' }, { pulled, pushed });
  }

  /** Sends a branch's commits up; `publish` puts a branch not on the remote there, as its upstream. */
  async push(repoPath: string, publish: boolean, branch?: string) {
    this.known(repoPath);
    if (!publish) return this.act(repoPath, ['push'], 180_000);
    const r = await this.summarize(repoPath, 0, 0, false);
    const b = branch || r.branch;
    if (!r.remote || !b) throw new HttpError(400, 'No remote or branch to publish to');
    await this.checkBranch(repoPath, b);
    return this.act(repoPath, ['push', '--set-upstream', r.remote, b], 180_000);
  }

  /** Adds a remote: its name and address (https, ssh or git, as for a clone). */
  async addRemote(repoPath: string, name: string, url: string): Promise<GitActionResult> {
    this.known(repoPath);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/.test(name)) throw new HttpError(400, 'A remote’s name is letters, digits, dots, dashes and underscores');
    if (!cloneUrlOk(url)) throw new HttpError(400, 'Use an https://, ssh:// or git@host:… address');
    return this.result(repoPath, await git(repoPath, ['remote', 'add', '--', name, url.trim()], 15_000));
  }

  async fetchAll(): Promise<GitRepo[]> {
    const list = await this.list();
    const withRemote = list.filter((r) => r.remote);
    for (let i = 0; i < withRemote.length; i += 4) await Promise.all(withRemote.slice(i, i + 4).map((r) => git(r.path, ['fetch', '--prune'], 120_000)));
    return this.list(true);
  }

  // ---- clone ----------------------------------------------------------------------------------------

  /**
   * Clones a repository from a link into a folder that doesn't exist yet (or is empty), in the background:
   * the page asks how it goes (cloneJob) and the repository joins the list when it is done.
   */
  clone(url: string, dest: string): GitCloneJob {
    const u = url.trim();
    if (!cloneUrlOk(u)) throw new HttpError(400, 'Use an https://, ssh:// or git@host:… address');
    if (!path.isAbsolute(dest)) throw new HttpError(400, 'Where should it go?');
    const abs = path.resolve(dest);
    if (abs === '/' || abs === os.homedir()) throw new HttpError(400, 'Clone into a folder of its own');
    if (fs.existsSync(abs)) {
      const st = fs.statSync(abs);
      if (!st.isDirectory() || fs.readdirSync(abs).length) throw new HttpError(400, `${abs} already exists and is not empty: pick another folder`);
    }
    if ([...this.clones.values()].some((j) => j.state === 'running' && j.dest === abs)) throw new HttpError(409, 'Already cloning into that folder');
    const id = crypto.randomBytes(6).toString('hex');
    const job: CloneRun = { id, url: redactUrl(u), dest: abs, state: 'running', phase: 'Starting' };
    this.clones.set(id, job);
    // Only https, ssh and git, for submodules too; never the file or ext transports.
    const e = { ...gitEnv(), GIT_ALLOW_PROTOCOL: 'https:ssh:git' };
    const child = spawn('git', ['clone', '--progress', '--', u, abs], { cwd: os.homedir(), env: e });
    let err = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), 30 * 60_000);
    child.stderr.on('data', (d: Buffer) => {
      err = (err + d.toString()).slice(-20_000);
      const lines = err.split(/[\r\n]+/).filter(Boolean);
      const m = /^(?:remote: )?([A-Z][A-Za-z ]+?):\s+(\d+)%/.exec(lines[lines.length - 1] ?? '');
      if (m) [job.phase, job.percent] = [m[1], Number(m[2])];
    });
    child.stdout.on('data', () => {});
    const finish = async (ok: boolean) => {
      clearTimeout(timer);
      job.finished = Date.now();
      job.output = redactUrl(err.split(/\r/).join('\n').split('\n').filter((l) => l.trim() && !/^\s*(Receiving|Resolving|Counting|Compressing|remote: (Counting|Compressing|Enumerating|Total))/.test(l)).slice(-12).join('\n'));
      if (!ok) {
        job.state = 'failed';
        return;
      }
      try {
        tops.delete(abs);
        const added = await this.add(abs);
        job.repo = added.repo;
        job.state = 'done';
      } catch (e) {
        job.state = 'failed';
        job.output = (e as Error).message;
      }
    };
    child.on('error', (e) => {
      err += `\n${e.message}`;
      void finish(false);
    });
    child.on('close', (code) => void finish(code === 0));
    // Finished clones are forgotten after a while.
    for (const [k, j] of this.clones) if (j.finished && Date.now() - j.finished > 30 * 60_000) this.clones.delete(k);
    return this.view(job);
  }

  private view(j: CloneRun): GitCloneJob {
    const { finished: _, ...rest } = j;
    return rest;
  }

  cloneJob(id: string): GitCloneJob {
    const j = this.clones.get(id);
    if (!j) throw new HttpError(404, 'No such clone');
    return this.view(j);
  }

  // ---- looking at changes and history --------------------------------------------------------------

  /** A path in the repository, relative to its top (refusing one outside it). */
  private rel(repoPath: string, file: string): string {
    const abs = path.resolve(repoPath, file);
    if (abs !== repoPath && !abs.startsWith(repoPath + path.sep)) throw new HttpError(400, 'Not a file in this repository');
    return path.relative(repoPath, abs) || '.';
  }

  private tracked = async (repoPath: string, rel: string) => (await git(repoPath, ['ls-files', '--error-unmatch', '--', rel])).ok;

  /** A file's changes since the last commit; a new file counts as added whole; a rename (`from`) shows as one. */
  async fileDiff(repoPath: string, file: string, from?: string): Promise<{ diff: string }> {
    this.known(repoPath);
    const rel = this.rel(repoPath, file);
    const old = from ? this.rel(repoPath, from) : null;
    let r = (await this.tracked(repoPath, rel))
      ? await git(repoPath, ['diff', '--no-color', '--no-ext-diff', '-M', 'HEAD', '--', ...(old ? [old] : []), rel], 20_000)
      : await git(repoPath, ['diff', '--no-color', '--no-ext-diff', '--no-index', '--', '/dev/null', rel], 20_000);
    // A repository without commits yet has no HEAD to compare with.
    if (!r.out && !r.ok) r = await git(repoPath, ['diff', '--no-color', '--cached', '--', rel], 20_000);
    return { diff: r.out.slice(0, 600_000) };
  }

  /** The patch of a commit or stash, cut into one diff per file. */
  private splitPatch(patch: string): Map<string, string> {
    const diffs = new Map<string, string>();
    for (const part of patch.slice(0, 2_000_000).split(/^(?=diff --git )/m)) {
      const m = /^diff --git a\/(.+?) b\/(.+)$/m.exec(part);
      if (m) diffs.set(m[2], part);
    }
    return diffs;
  }

  /** `--numstat` (not -z) lines with their diffs; renames by their new name. */
  private filesOf(stat: string, diffs: Map<string, string>, names?: Map<string, { status: string; from?: string }>) {
    return stat
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [a, d, ...p] = l.split('\t');
        const name = p.join('\t').replace(/^(.*)\{(.*) => (.*)\}(.*)$/, '$1$3$4').replace(/\/\//g, '/').replace(/^.* => /, '');
        const n = names?.get(name);
        return { path: name, added: Number(a) || 0, removed: Number(d) || 0, binary: a === '-' || undefined, status: n?.status, from: n?.from, diff: (diffs.get(name) ?? '').slice(0, 300_000) };
      });
  }

  /**
   * A commit's message, where it sits (parents, branches and tags on it, whether a remote has it), and each file it
   * changed with its diff. `trusted`: the caller vouches for the folder (a commit an agent made, in a worktree).
   */
  async commitDetail(repoPath: string, hash: string, trusted = false): Promise<GitCommitDetail> {
    if (!trusted) this.known(repoPath);
    if (!isHash(hash)) throw new HttpError(400, 'Not a commit');
    const [meta, stat, patch, names, head, remote] = await Promise.all([
      git(repoPath, ['show', '-s', '--decorate=full', `--format=%H${SEP}%P${SEP}%an${SEP}%ae${SEP}%ct${SEP}%D${SEP}%B`, hash, '--']),
      git(repoPath, ['show', '-m', '--first-parent', '-M', '--numstat', '--format=', hash, '--']),
      git(repoPath, ['show', '-m', '--first-parent', '-M', '--no-color', '--no-ext-diff', '--format=', '--patch', hash, '--'], 20_000),
      git(repoPath, ['show', '-m', '--first-parent', '-M', '-z', '--name-status', '--format=', hash, '--']),
      git(repoPath, ['rev-parse', '--verify', '-q', 'HEAD']),
      git(repoPath, ['branch', '-r', '--contains', hash, '--format=%(refname)'], 15_000),
    ]);
    if (!meta.ok) throw new HttpError(404, 'No such commit');
    const [full, parents, author, email, ct, deco, ...message] = meta.out.split(SEP);
    const st = new Map<string, { status: string; from?: string }>();
    const z = names.out.split('\0');
    for (let i = 0; i < z.length; i++) {
      const s = z[i];
      if (!s || !/^[ACDMRTUXB]/.test(s)) continue;
      if (s[0] === 'R' || s[0] === 'C') {
        st.set(z[i + 2], { status: s[0], from: z[i + 1] });
        i += 2;
      } else st.set(z[++i], { status: s[0] });
    }
    return {
      hash: full,
      author,
      email,
      ts: Number(ct) * 1000,
      message: message.join(SEP).trim(),
      parents: parents ? parents.split(' ') : [],
      refs: parseRefs(deco).refs,
      head: head.out.trim() === full,
      pushed: !!remote.out.trim(),
      files: this.filesOf(stat.out, this.splitPatch(patch.out), st),
    };
  }

  /**
   * The history, newest first in an order a graph can be drawn from (a commit before its parents), with each
   * commit's parents and the branches and tags on it: this branch's, or every branch's (`all`). `q` finds
   * commits by words in their message, their author or their hash.
   */
  async log(repoPath: string, o: { skip?: number; limit?: number; q?: string; all?: boolean } = {}): Promise<{ commits: GitLogCommit[]; more: boolean }> {
    this.known(repoPath);
    const skip = Math.max(0, Math.floor(o.skip ?? 0));
    const limit = Math.min(500, Math.max(1, Math.floor(o.limit ?? 100)));
    const hasHead = (await git(repoPath, ['rev-parse', '--verify', '-q', 'HEAD'])).ok;
    const revs = o.all ? ['--branches', '--remotes', '--tags', ...(hasHead ? ['HEAD'] : [])] : hasHead ? ['HEAD'] : [];
    if (!revs.length) return { commits: [], more: false };
    const base = ['log', '--date-order', '--decorate=full', `--format=${GRAPH_FORMAT}`];
    const q = (o.q ?? '').trim().slice(0, 200);
    if (!q) {
      const r = await git(repoPath, [...base, `--skip=${skip}`, `-n${limit + 1}`, ...revs, '--'], 30_000);
      const list = parseGraphLog(r.out);
      return { commits: list.slice(0, limit), more: list.length > limit };
    }
    // Words in the message, or in the author's name or address (git ANDs those two, so they are asked apart), or the hash.
    const n = `-n${skip + limit + 1}`;
    const [byMsg, byAuthor, byHash] = await Promise.all([
      git(repoPath, [...base, '-i', '-F', `--grep=${q}`, n, ...revs, '--'], 30_000),
      git(repoPath, [...base, '-i', '-F', `--author=${q}`, n, ...revs, '--'], 30_000),
      isHash(q) ? git(repoPath, [...base, '-1', '--no-walk', `${q}^{commit}`, '--']) : Promise.resolve({ ok: false, out: '', err: '' }),
    ]);
    const seen = new Set<string>();
    const merged = [...parseGraphLog(byMsg.out), ...parseGraphLog(byAuthor.out)].sort((a, b) => b.ts - a.ts);
    const list = [...(skip === 0 && byHash.ok ? parseGraphLog(byHash.out) : []), ...merged].filter((c) => !seen.has(c.hash) && seen.add(c.hash));
    return { commits: list.slice(skip, skip + limit), more: list.length > skip + limit };
  }

  // ---- committing -----------------------------------------------------------------------------------

  /** Commits just these files (others staged stay out), then pushes when asked. `amend` changes the last commit instead (only while no remote has it). */
  async commit(repoPath: string, files: string[], message: string, push: boolean, amend = false): Promise<GitActionResult> {
    this.known(repoPath);
    if (!message.trim()) throw new HttpError(400, 'Write a commit message');
    if (!files.length && !amend) throw new HttpError(400, 'Pick the files to commit');
    if (await operationKind(repoPath)) throw new HttpError(409, 'Finish or stop the merge or rebase first: Continue commits it');
    if (amend) await this.checkUnpushed(repoPath);
    const rels = files.map((f) => this.rel(repoPath, f));
    if (rels.length) {
      const add = await git(repoPath, ['add', '-A', '--', ...rels], 60_000);
      if (!add.ok) return this.result(repoPath, add);
    }
    const c = await git(repoPath, ['commit', ...(amend ? ['--amend'] : []), '--only', '-m', message.trim(), ...(rels.length ? ['--', ...rels] : [])], 120_000);
    if (!c.ok || !push) return this.result(repoPath, c);
    const branch = (await git(repoPath, ['branch', '--show-current'])).out.trim();
    const up = (await git(repoPath, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])).ok;
    const remotes = (await git(repoPath, ['remote'])).out.split('\n').filter(Boolean);
    const remote = remotes.includes('origin') ? 'origin' : remotes[0];
    const p = await git(repoPath, up ? ['push'] : ['push', '--set-upstream', remote ?? 'origin', branch], 180_000);
    return this.result(repoPath, { ok: p.ok, out: `${c.out}\n${p.out}`.trim(), err: p.err });
  }

  /** Refuses to rewrite a commit a remote has already. */
  private async checkUnpushed(repoPath: string) {
    const remote = await git(repoPath, ['branch', '-r', '--contains', 'HEAD', '--format=%(refname)'], 15_000);
    if (remote.out.trim()) throw new HttpError(409, 'The last commit is on the remote already: changing it would rewrite what others have');
  }

  /** A commit message for these files' changes, in the style of the repository's recent ones. */
  async suggestMessage(repoPath: string, files: string[]): Promise<{ message: string }> {
    this.known(repoPath);
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

  /** Puts files back as they were in the last commit; a new file is deleted. A rename gives both its paths. */
  async discard(repoPath: string, files: string[]): Promise<GitActionResult> {
    this.known(repoPath);
    const rels = files.map((f) => this.rel(repoPath, f));
    if (!rels.length || rels.includes('.')) throw new HttpError(400, 'Not a file');
    const tracked: string[] = [];
    for (const rel of rels) {
      if (await this.tracked(repoPath, rel)) tracked.push(rel);
      else fs.rmSync(path.join(repoPath, rel), { recursive: true, force: true });
    }
    if (!tracked.length) return this.result(repoPath, { ok: true, out: '', err: '' });
    const hasHead = (await git(repoPath, ['rev-parse', '--verify', '-q', 'HEAD'])).ok;
    // Without a commit yet, a staged file is only taken out of the index and deleted.
    if (!hasHead) {
      const r = await git(repoPath, ['rm', '-r', '-f', '-q', '--', ...tracked], 30_000);
      return this.result(repoPath, r);
    }
    return this.result(repoPath, await git(repoPath, ['restore', '--source=HEAD', '--staged', '--worktree', '--', ...tracked], 30_000));
  }

  /** Puts one part of a file's changes back (the hunk as the page showed it, from its @@ line); the rest stays. */
  async discardHunk(repoPath: string, file: string, hunk: string): Promise<GitActionResult> {
    this.known(repoPath);
    const rel = this.rel(repoPath, file);
    if (!(await this.tracked(repoPath, rel))) throw new HttpError(400, 'A new file has no earlier version to go back to: discard it whole');
    const d = await git(repoPath, ['diff', '--no-color', '--no-ext-diff', 'HEAD', '--', rel], 20_000);
    const at = d.out.search(/^@@ /m);
    if (at < 0) throw new HttpError(409, 'The file has no changes to put back');
    const header = d.out.slice(0, at);
    const want = hunk.replace(/\n+$/, '');
    const found = d.out
      .slice(at)
      .split(/^(?=@@ )/m)
      .find((h) => h.replace(/\n+$/, '') === want);
    if (!found) throw new HttpError(409, 'The file changed since you looked: look at its changes again');
    const tmp = path.join(os.tmpdir(), `hydor-hunk-${crypto.randomBytes(6).toString('hex')}.patch`);
    fs.writeFileSync(tmp, `${header}${found.replace(/\n*$/, '\n')}`);
    try {
      return this.result(repoPath, await git(repoPath, ['apply', '-R', '--whitespace=nowarn', '--', tmp], 20_000));
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }

  /** Adds a file (or folder) to .gitignore, and stops tracking it if git tracks it (it stays on disk). */
  async ignore(repoPath: string, file: string): Promise<GitActionResult> {
    this.known(repoPath);
    const rel = this.rel(repoPath, file);
    if (rel === '.' || rel === '.gitignore' || rel.split(path.sep)[0] === '.git') throw new HttpError(400, 'Not a file to ignore');
    const gi = path.join(repoPath, '.gitignore');
    const line = ignoreLine(rel.split(path.sep).join('/'));
    const cur = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
    if (!cur.split('\n').some((l) => l.trim() === line)) fs.appendFileSync(gi, `${cur && !cur.endsWith('\n') ? '\n' : ''}${line}\n`);
    if (await this.tracked(repoPath, rel)) return this.result(repoPath, await git(repoPath, ['rm', '-r', '--cached', '-q', '--', rel], 30_000));
    return this.result(repoPath, { ok: true, out: '', err: '' });
  }

  /** Makes a commit that undoes another (a merge: against its first parent). */
  async revert(repoPath: string, hash: string): Promise<GitActionResult> {
    this.known(repoPath);
    if (!isHash(hash)) throw new HttpError(400, 'Not a commit');
    if (await operationKind(repoPath)) throw new HttpError(409, 'Finish or stop the merge or rebase first');
    const parents = (await git(repoPath, ['show', '-s', '--format=%P', hash, '--'])).out.trim().split(' ').filter(Boolean);
    return this.result(repoPath, await git(repoPath, ['revert', '--no-edit', ...(parents.length > 1 ? ['-m', '1'] : []), hash], 120_000));
  }

  /** Takes the last commit back, keeping its changes (a soft reset): only HEAD itself, and only while no remote has it. */
  async undoCommit(repoPath: string, hash: string): Promise<GitActionResult> {
    this.known(repoPath);
    const head = (await git(repoPath, ['rev-parse', '--verify', '-q', 'HEAD'])).out.trim();
    if (!head || !isHash(hash) || !head.startsWith(hash.toLowerCase())) throw new HttpError(409, 'Only the last commit can be undone');
    if (await operationKind(repoPath)) throw new HttpError(409, 'Finish or stop the merge or rebase first');
    await this.checkUnpushed(repoPath);
    const hasParent = (await git(repoPath, ['rev-parse', '--verify', '-q', 'HEAD~1'])).ok;
    // The first commit has nothing before it: the branch goes back to having none, its files staged.
    return this.result(repoPath, await git(repoPath, hasParent ? ['reset', '--soft', 'HEAD~1'] : ['update-ref', '-d', 'HEAD'], 30_000));
  }

  /** Continues the merge, rebase, revert or cherry-pick once its files are settled (they are added for it). */
  async continueOp(repoPath: string): Promise<GitActionResult> {
    this.known(repoPath);
    const op = await operationKind(repoPath);
    if (!op) throw new HttpError(409, 'Nothing to continue');
    const st = await status(repoPath, true);
    const conflicted = st.files.filter((f) => f.conflict).map((f) => f.path);
    const left: string[] = [];
    for (const f of conflicted) if (await hasMarkers(path.join(repoPath, f))) left.push(f);
    if (left.length) throw new HttpError(409, `Still to settle: ${left.join(', ')} (each still has conflict markers)`);
    if (conflicted.length) {
      const add = await git(repoPath, ['add', '-A', '--', ...conflicted], 60_000);
      if (!add.ok) return this.result(repoPath, add);
    }
    // Git's message for the merge, without the comment lines it adds about the conflicts (an editor would drop them).
    if (op.kind === 'merge') return this.result(repoPath, await git(repoPath, ['commit', '--no-edit', '--cleanup=strip'], 120_000));
    let r = await git(repoPath, [op.kind, '--continue'], 120_000);
    // A commit the settled files made empty (the other side had the same change): skip it and go on.
    if (!r.ok && op.kind === 'rebase' && /nothing to commit|No changes|did you forget to use 'git add'/i.test(said(r))) r = await git(repoPath, ['rebase', '--skip'], 120_000);
    return this.result(repoPath, r);
  }

  /** Stops the merge, rebase, revert or cherry-pick: everything goes back to how it was before it began. */
  async abortOp(repoPath: string): Promise<GitActionResult> {
    this.known(repoPath);
    const op = await operationKind(repoPath);
    if (!op) throw new HttpError(409, 'Nothing to stop');
    return this.result(repoPath, await git(repoPath, [op.kind, '--abort'], 60_000));
  }

  // ---- branches -------------------------------------------------------------------------------------

  /** A valid branch name that doesn't read as an option. */
  private async checkBranch(repoPath: string, name: string) {
    if (!name || name.startsWith('-') || !(await git(repoPath, ['check-ref-format', '--branch', name])).ok) throw new HttpError(400, 'Not a valid branch name');
  }

  async branches(repoPath: string): Promise<{ current: string | null; branches: GitBranch[]; remotes: GitBranch[] }> {
    this.known(repoPath);
    const fmt = `--format=%(refname)${SEP}%(committerdate:unix)${SEP}%(upstream:short)${SEP}%(upstream:track,nobracket)${SEP}%(objectname)${SEP}%(authorname)${SEP}%(subject)`;
    const [list, cur, merged] = await Promise.all([
      git(repoPath, ['for-each-ref', '--sort=-committerdate', fmt, 'refs/heads', 'refs/remotes'], 15_000),
      git(repoPath, ['branch', '--show-current']),
      git(repoPath, ['branch', '--merged', 'HEAD', '--format=%(refname:short)']),
    ]);
    const current = cur.out.trim() || null;
    const done = new Set(merged.out.split('\n').map((x) => x.trim()));
    const branches: GitBranch[] = [];
    const remotes: GitBranch[] = [];
    for (const l of list.out.split('\n').filter(Boolean)) {
      const [ref, ct, upstream, track, hash, author, ...subject] = l.split(SEP);
      const b: GitBranch = { name: '', ts: Number(ct) * 1000, subject: subject.join(SEP), hash, author, merged: false };
      if (ref.startsWith('refs/heads/')) {
        b.name = ref.slice(11);
        b.merged = done.has(b.name) && b.name !== current;
        if (upstream) b.upstream = upstream;
        if (track) {
          b.track = track;
          b.gone = track === 'gone' || undefined;
          b.ahead = Number(/ahead (\d+)/.exec(track)?.[1] ?? 0) || undefined;
          b.behind = Number(/behind (\d+)/.exec(track)?.[1] ?? 0) || undefined;
        }
        branches.push(b);
      } else if (ref.startsWith('refs/remotes/') && !ref.endsWith('/HEAD')) {
        b.name = ref.slice(13);
        b.remote = true;
        remotes.push(b);
      }
    }
    for (const r of remotes) {
      const local = branches.find((b) => b.upstream === r.name) ?? branches.find((b) => b.name === r.name.slice(r.name.indexOf('/') + 1));
      if (local) r.local = local.name;
    }
    return { current, branches, remotes };
  }

  /**
   * Switches branch (git refuses when that would overwrite changes here), or makes a new one first (from
   * `from`, a commit or branch, else from here). A remote branch (`track`, as origin/name) gets a local
   * branch of the same name that tracks it.
   */
  async switchBranch(repoPath: string, branch: string, create: boolean, o: { from?: string; track?: boolean } = {}): Promise<GitActionResult> {
    this.known(repoPath);
    if (o.track) {
      if (branch.startsWith('-') || !(await git(repoPath, ['rev-parse', '--verify', '-q', `refs/remotes/${branch}`])).ok) throw new HttpError(400, 'No such remote branch');
      return this.result(repoPath, await git(repoPath, ['switch', '--track', branch], 60_000));
    }
    await this.checkBranch(repoPath, branch);
    if (o.from && (o.from.startsWith('-') || !(isHash(o.from) || (await git(repoPath, ['check-ref-format', '--allow-onelevel', `refs/heads/${o.from}`])).ok))) throw new HttpError(400, 'Not a commit');
    return this.result(repoPath, await git(repoPath, create ? ['switch', '-c', branch, ...(o.from ? [o.from] : [])] : ['switch', branch], 60_000));
  }

  /**
   * Deletes a branch: one merged into this one simply (git's own -d would also want it merged into its
   * remote branch); `force` one that is not, whose commits only it had are lost.
   */
  async deleteBranch(repoPath: string, branch: string, force = false): Promise<GitActionResult> {
    this.known(repoPath);
    await this.checkBranch(repoPath, branch);
    const merged = !force && (await git(repoPath, ['merge-base', '--is-ancestor', `refs/heads/${branch}`, 'HEAD'])).ok;
    return this.result(repoPath, await git(repoPath, ['branch', force || merged ? '-D' : '-d', '--', branch], 30_000));
  }

  async renameBranch(repoPath: string, from: string, to: string): Promise<GitActionResult> {
    this.known(repoPath);
    await this.checkBranch(repoPath, from);
    await this.checkBranch(repoPath, to);
    return this.result(repoPath, await git(repoPath, ['branch', '-m', from, to], 30_000));
  }

  /** Merges a branch (local or remote) into the current one; conflicts leave the merge under way. */
  async merge(repoPath: string, branch: string): Promise<GitActionResult> {
    this.known(repoPath);
    if (!branch || branch.startsWith('-') || !(await git(repoPath, ['rev-parse', '--verify', '-q', `${branch}^{commit}`])).ok) throw new HttpError(400, 'No such branch');
    if (await operationKind(repoPath)) throw new HttpError(409, 'Finish or stop the merge or rebase first');
    return this.result(repoPath, await git(repoPath, ['merge', '--no-edit', branch], 120_000));
  }

  /** What a branch has that the current one lacks (`ahead`), and the other way round (`behind`). */
  async compare(repoPath: string, branch: string): Promise<{ base: string; branch: string; ahead: GitCommit[]; behind: GitCommit[] }> {
    this.known(repoPath);
    if (!branch || branch.startsWith('-') || !(await git(repoPath, ['rev-parse', '--verify', '-q', `${branch}^{commit}`])).ok) throw new HttpError(400, 'No such branch');
    const [a, b, cur] = await Promise.all([
      git(repoPath, ['log', '-200', `--format=${LOG_FORMAT}`, `HEAD..${branch}`, '--'], 20_000),
      git(repoPath, ['log', '-200', `--format=${LOG_FORMAT}`, `${branch}..HEAD`, '--'], 20_000),
      git(repoPath, ['branch', '--show-current']),
    ]);
    return { base: cur.out.trim() || 'HEAD', branch, ahead: parseLog(a.out), behind: parseLog(b.out) };
  }

  /** The commits only this branch has (on no other branch, local or remote): what deleting it would lose. */
  async branchOnly(repoPath: string, branch: string): Promise<{ commits: GitCommit[] }> {
    this.known(repoPath);
    await this.checkBranch(repoPath, branch);
    const r = await git(repoPath, ['log', '-100', `--format=${LOG_FORMAT}`, `refs/heads/${branch}`, '--not', `--exclude=${branch}`, '--branches', '--remotes', '--'], 20_000);
    return { commits: parseLog(r.out) };
  }

  // ---- tags -----------------------------------------------------------------------------------------

  /** Tags a commit; with a message the tag keeps it (and who made it). */
  async tag(repoPath: string, name: string, hash: string, message?: string): Promise<GitActionResult> {
    this.known(repoPath);
    if (!name || name.startsWith('-') || !(await git(repoPath, ['check-ref-format', `refs/tags/${name}`])).ok) throw new HttpError(400, 'Not a valid tag name');
    if (!isHash(hash)) throw new HttpError(400, 'Not a commit');
    const m = message?.trim();
    return this.result(repoPath, await git(repoPath, ['tag', ...(m ? ['-a', '-m', m] : []), name, hash], 15_000));
  }

  /** Sends a tag up, or every tag. */
  async pushTags(repoPath: string, name?: string): Promise<GitActionResult> {
    this.known(repoPath);
    const remotes = (await git(repoPath, ['remote'])).out.split('\n').filter(Boolean);
    if (!remotes.length) throw new HttpError(400, 'This repository has no remote');
    const remote = remotes.includes('origin') ? 'origin' : remotes[0];
    if (name && (name.startsWith('-') || !(await git(repoPath, ['check-ref-format', `refs/tags/${name}`])).ok)) throw new HttpError(400, 'Not a valid tag name');
    return this.result(repoPath, await git(repoPath, ['push', remote, ...(name ? [`refs/tags/${name}`] : ['--tags'])], 180_000));
  }

  // ---- stashes --------------------------------------------------------------------------------------

  /** Puts the changes aside; `untracked` takes new files too. */
  async stash(repoPath: string, message: string, untracked = true): Promise<GitActionResult> {
    this.known(repoPath);
    return this.result(repoPath, await git(repoPath, ['stash', 'push', ...(untracked ? ['--include-untracked'] : []), ...(message.trim() ? ['-m', message.trim()] : [])], 60_000));
  }

  async stashAction(repoPath: string, ref: string, action: 'apply' | 'pop' | 'drop'): Promise<GitActionResult> {
    this.known(repoPath);
    if (!/^stash@\{\d+\}$/.test(ref)) throw new HttpError(400, 'Not a stash');
    return this.result(repoPath, await git(repoPath, ['stash', action, ref], 60_000));
  }

  /** What a stash holds: each file with its diff, new files included. */
  async stashShow(repoPath: string, ref: string): Promise<GitStashDetail> {
    this.known(repoPath);
    if (!/^stash@\{\d+\}$/.test(ref)) throw new HttpError(400, 'Not a stash');
    const [stat, patch] = await Promise.all([
      git(repoPath, ['stash', 'show', '--include-untracked', '--numstat', ref]),
      git(repoPath, ['stash', 'show', '--include-untracked', '--no-color', '--no-ext-diff', '-p', ref], 20_000),
    ]);
    if (!stat.ok) throw new HttpError(404, 'No such stash');
    return { ref, files: this.filesOf(stat.out, this.splitPatch(patch.out)) };
  }
}
