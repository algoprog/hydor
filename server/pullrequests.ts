// Pull requests on GitHub and Gitea, from a session's branch. Accounts and their tokens stay on the
// server (Settings → Source control); the browser only learns who is signed in. A draft is worked out
// from the repository, a model can write the description and a guide to reading the changes, and open
// requests are checked every few minutes so the sidebar shows their state and checks.
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { PullRequestInfo, WorktreeInfo } from '../shared/types.ts';
import { HttpError } from './auth.ts';
import { kvGet, kvSet, type DB } from './db.ts';
import { agentBaseEnv } from './env.ts';
import { git } from './git.ts';
import { oneShotJson } from './oneshot.ts';

export type Provider = 'github' | 'gitea';

interface Account {
  id: string;
  provider: Provider;
  /** The web address: https://github.com, or the Gitea server's root. */
  web: string;
  /** API token; none when GitHub goes through the gh CLI's login. */
  token?: string;
  useGh?: boolean;
  login?: string;
}

/** An account as the browser sees it: no token. */
export interface AccountView {
  id: string;
  provider: Provider;
  web: string;
  login?: string;
  useGh?: boolean;
}

const NAME: Record<Provider, string> = { github: 'GitHub', gitea: 'Gitea' };

// ---- accounts ----------------------------------------------------------------------------------

function accounts(db: DB): Account[] {
  try {
    return JSON.parse(kvGet(db, 'scm_accounts') ?? '[]');
  } catch {
    return [];
  }
}

export function accountViews(db: DB): AccountView[] {
  return accounts(db).map(({ id, provider, web, login, useGh }) => ({ id, provider, web, login, useGh }));
}

let ghCache: { at: number; token: string | null } | null = null;

/** The GitHub CLI's token, when it is installed and signed in. */
export function ghToken(): Promise<string | null> {
  if (ghCache && Date.now() - ghCache.at < 60_000) return Promise.resolve(ghCache.token);
  return new Promise((resolve) =>
    execFile('gh', ['auth', 'token'], { env: agentBaseEnv(), timeout: 8000 }, (err, out) => {
      const token = err ? null : String(out).trim() || null;
      ghCache = { at: Date.now(), token };
      resolve(token);
    }),
  );
}

/** Checks the token by asking who it belongs to, then keeps the account (replacing one for the same server). */
export async function saveAccount(db: DB, o: { provider: Provider; web?: string; token?: string; useGh?: boolean }): Promise<AccountView> {
  if (o.provider !== 'github' && o.provider !== 'gitea') throw new HttpError(400, 'Pick GitHub or Gitea');
  let web = (o.web || (o.provider === 'github' ? 'https://github.com' : '')).trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/]+/.test(web)) throw new HttpError(400, 'Enter the server address, like https://gitea.example.com');
  web = new URL(web).origin + new URL(web).pathname.replace(/\/+$/, '');
  const useGh = o.provider === 'github' && !!o.useGh;
  const token = useGh ? undefined : o.token?.trim();
  if (!useGh && !token) throw new HttpError(400, 'Paste an access token');
  const acc: Account = { id: crypto.randomBytes(4).toString('hex'), provider: o.provider, web, token, useGh };
  const me = await call(acc, 'GET', '/user');
  acc.login = String(me?.login ?? me?.username ?? '');
  const rest = accounts(db).filter((a) => !(a.provider === acc.provider && a.web === acc.web));
  kvSet(db, 'scm_accounts', JSON.stringify([...rest, acc]));
  return { id: acc.id, provider: acc.provider, web: acc.web, login: acc.login, useGh: acc.useGh };
}

export function removeAccount(db: DB, id: string) {
  kvSet(db, 'scm_accounts', JSON.stringify(accounts(db).filter((a) => a.id !== id)));
}

async function call(acc: Account, method: string, p: string, body?: unknown): Promise<any> {
  const token = acc.useGh ? await ghToken() : acc.token;
  if (!token) throw new HttpError(400, acc.useGh ? 'The GitHub CLI is not signed in: run gh auth login' : `No token for ${acc.web}`);
  const host = new URL(acc.web).hostname;
  const base = acc.provider === 'gitea' ? `${acc.web}/api/v1` : host === 'github.com' ? 'https://api.github.com' : `${acc.web}/api/v3`;
  const headers: Record<string, string> =
    acc.provider === 'github'
      ? { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
      : { Authorization: `token ${token}`, Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  headers['User-Agent'] = 'naget-agent';
  let r: Response;
  try {
    r = await fetch(base + p, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20_000) });
  } catch (e) {
    throw new HttpError(502, `Could not reach ${NAME[acc.provider]} at ${acc.web}: ${(e as Error).message}`);
  }
  const text = await r.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {}
  if (!r.ok) {
    const why = data?.message ?? (data?.errors?.[0]?.message || r.statusText);
    throw new HttpError(r.status === 401 || r.status === 403 || r.status === 422 || r.status === 404 ? 400 : 502, `${NAME[acc.provider]}: ${why} (${r.status})`);
  }
  return data;
}

// ---- where a repository lives ------------------------------------------------------------------

interface Remote {
  name: string;
  url: string;
}

interface Hosted {
  account: Account;
  owner: string;
  repo: string;
}

/** The remote a branch would go to: its upstream's, else origin, else the only one. */
async function remoteOf(dir: string, branch: string): Promise<Remote | null> {
  const names = (await git(dir, ['remote'])).out.split('\n').filter(Boolean);
  if (!names.length) return null;
  const up = (await git(dir, ['config', '--get', `branch.${branch}.remote`])).out.trim();
  const name = names.includes(up) ? up : names.includes('origin') ? 'origin' : names[0];
  // The URL as written in the config: insteadOf rules (which rewrite where git connects) do not change which server it is.
  const url = (await git(dir, ['config', '--get', `remote.${name}.url`])).out.trim();
  return url ? { name, url } : null;
}

const sshHosts = new Map<string, string>();

/** An ssh host alias ("gitea" in ~/.ssh/config) to the machine it names. */
function sshHostName(alias: string): Promise<string> {
  const hit = sshHosts.get(alias);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve) =>
    execFile('ssh', ['-G', alias], { env: agentBaseEnv(), timeout: 5000 }, (err, out) => {
      const host = (!err && /^hostname (\S+)$/m.exec(String(out))?.[1]) || alias;
      sshHosts.set(alias, host);
      resolve(host);
    }),
  );
}

/** Which account's server holds the remote, and the repository's owner and name there. */
async function hostedAt(db: DB, url: string): Promise<Hosted | null> {
  const list = accounts(db);
  const strip = (s: string) => s.replace(/\.git\/?$/, '').replace(/\/+$/, '');
  if (/^https?:\/\//.test(url)) {
    const clean = url.replace(/^(https?:\/\/)[^@/]+@/, '$1');
    for (const a of list) {
      if (!clean.startsWith(a.web + '/')) continue;
      const [owner, repo] = strip(clean.slice(a.web.length + 1)).split('/');
      if (owner && repo) return { account: a, owner, repo };
    }
    return null;
  }
  // ssh://git@host:22/owner/repo.git, or git@host:owner/repo.git
  const m = /^ssh:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/.exec(url) ?? /^(?:[^@/]+@)?([^/:]+):(.+)$/.exec(url);
  if (!m) return null;
  const host = await sshHostName(m[1]);
  const [owner, repo] = strip(m[2]).split('/').slice(-2);
  for (const a of list) {
    const h = new URL(a.web).hostname;
    if ((h === host || h === m[1]) && owner && repo) return { account: a, owner, repo };
  }
  return null;
}

async function defaultBranch(dir: string, remote: string): Promise<string> {
  const head = (await git(dir, ['symbolic-ref', '--short', `refs/remotes/${remote}/HEAD`])).out.trim();
  if (head.startsWith(`${remote}/`)) return head.slice(remote.length + 1);
  for (const b of ['main', 'master', 'trunk', 'develop']) if ((await git(dir, ['rev-parse', '--verify', '--quiet', `refs/remotes/${remote}/${b}`])).ok) return b;
  for (const b of ['main', 'master']) if ((await git(dir, ['rev-parse', '--verify', '--quiet', `refs/heads/${b}`])).ok) return b;
  return 'main';
}

/** The base as the remote has it when it does (what a pull request compares with), else the local branch. */
async function baseRef(dir: string, remote: string | undefined, base: string): Promise<string> {
  if (remote && (await git(dir, ['rev-parse', '--verify', '--quiet', `refs/remotes/${remote}/${base}`])).ok) return `${remote}/${base}`;
  return base;
}

// ---- drafting and opening a pull request -------------------------------------------------------

export interface PrDraft {
  dir: string;
  head: string;
  base: string;
  remote: string;
  /** The server, owner and name; missing when no account in Settings covers the remote. */
  host?: { provider: Provider; web: string; owner: string; repo: string; login?: string };
  commits: { sha: string; subject: string }[];
  stat: { files: number; added: number; removed: number };
  /** Changed files not committed: they are not part of a pull request. */
  dirty: number;
  /** The branch is on the remote as it is here. */
  pushed: boolean;
  /** A pull request already open for this branch. */
  existing?: PullRequestInfo;
}

async function topOf(dir: string): Promise<string> {
  const top = await git(dir, ['rev-parse', '--show-toplevel']);
  if (!top.ok) throw new HttpError(400, 'The session’s folder is not in a git repository');
  return top.out.trim();
}

export async function prDraft(db: DB, cwd: string, wt?: WorktreeInfo): Promise<PrDraft> {
  const dir = await topOf(wt && fs.existsSync(wt.path) ? wt.path : cwd);
  const head = (await git(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])).out.trim();
  if (!head || head === 'HEAD') throw new HttpError(400, 'The repository is not on a branch (detached HEAD): check one out first');
  const remote = await remoteOf(dir, head);
  if (!remote) throw new HttpError(400, 'The repository has no remote to push the branch to');
  const base = wt?.base && wt.base !== head ? wt.base : await defaultBranch(dir, remote.name);
  if (head === base) throw new HttpError(400, `The session works on ${base} itself. A pull request needs its own branch: start the session in a worktree, or check out a new branch.`);
  const ref = await baseRef(dir, remote.name, base);
  const [log, short, st, local, onRemote, hosted] = await Promise.all([
    git(dir, ['log', '-50', '--format=%h%x09%s', `${ref}..HEAD`]),
    git(dir, ['diff', '--shortstat', `${ref}...HEAD`]),
    git(dir, ['status', '--porcelain']),
    git(dir, ['rev-parse', 'HEAD']),
    git(dir, ['rev-parse', '--verify', '--quiet', `refs/remotes/${remote.name}/${head}`]),
    hostedAt(db, remote.url),
  ]);
  const num = (re: RegExp) => Number(re.exec(short.out)?.[1] ?? 0);
  const draft: PrDraft = {
    dir,
    head,
    base,
    remote: remote.name,
    host: hosted ? { provider: hosted.account.provider, web: hosted.account.web, owner: hosted.owner, repo: hosted.repo, login: hosted.account.login } : undefined,
    commits: log.out
      .split('\n')
      .filter(Boolean)
      .map((l) => ({ sha: l.split('\t')[0], subject: l.split('\t').slice(1).join('\t') })),
    stat: { files: num(/(\d+) files? changed/), added: num(/(\d+) insertions?/), removed: num(/(\d+) deletions?/) },
    dirty: st.out.split('\n').filter(Boolean).length,
    pushed: onRemote.ok && onRemote.out.trim() === local.out.trim(),
  };
  if (hosted) draft.existing = (await openPrFor(hosted, head).catch(() => null)) ?? undefined;
  return draft;
}

async function openPrFor(h: Hosted, head: string): Promise<PullRequestInfo | null> {
  if (h.account.provider === 'github') {
    const list = await call(h.account, 'GET', `/repos/${h.owner}/${h.repo}/pulls?state=open&head=${encodeURIComponent(`${h.owner}:${head}`)}`);
    return Array.isArray(list) && list[0] ? toInfo(h, list[0]) : null;
  }
  const list = await call(h.account, 'GET', `/repos/${h.owner}/${h.repo}/pulls?state=open&limit=50`);
  const pr = Array.isArray(list) ? list.find((p: any) => p?.head?.ref === head) : null;
  return pr ? toInfo(h, pr) : null;
}

function toInfo(h: Hosted, p: any): PullRequestInfo {
  const merged = !!(p.merged_at || p.merged);
  const wip = h.account.provider === 'gitea' && /^\s*(WIP:|\[WIP\])/i.test(String(p.title ?? ''));
  return {
    provider: h.account.provider,
    url: String(p.html_url ?? p.url),
    number: Number(p.number),
    title: String(p.title ?? ''),
    state: merged ? 'merged' : p.state === 'closed' ? 'closed' : p.draft || wip ? 'draft' : 'open',
    repo: `${h.owner}/${h.repo}`,
    updatedAt: p.updated_at ? Date.parse(p.updated_at) : Date.now(),
  };
}

const DESCRIBE = [
  'You write the title and description of a pull request from its commits and diff.',
  'Reply with JSON only, no code fences: {"title":"...","body":"..."}.',
  'title: under 70 characters, imperative mood, no trailing period.',
  'body: Markdown. One or two sentences on what changes and why. Then "## Changes" with short bullets, grouped by area.',
  'Add "## Testing" only for tests the commits or diff show were added or run. Claim nothing the material does not show. Plain words, no filler, no emoji.',
].join(' ');

/** A title and description written by a model from the branch's commits and diff (and the task the session was given). */
export async function prDescribe(draft: PrDraft, context: { task?: string }, codexModel?: string): Promise<{ title: string; body: string }> {
  const ref = await baseRef(draft.dir, draft.remote, draft.base);
  const [stat, diff] = await Promise.all([git(draft.dir, ['diff', '--stat=120', `${ref}...HEAD`]), git(draft.dir, ['diff', '--no-color', '--no-ext-diff', `${ref}...HEAD`], 30_000)]);
  if (!draft.commits.length) throw new HttpError(400, `There are no commits on ${draft.head} beyond ${draft.base} yet`);
  const prompt = [
    `Branch ${draft.head} into ${draft.base}${draft.host ? ` of ${draft.host.owner}/${draft.host.repo}` : ''}.`,
    context.task ? `The task the coding agent was given:\n${context.task.slice(0, 2000)}` : '',
    `Commits (newest first):\n${draft.commits.map((c) => `- ${c.subject}`).join('\n')}`,
    `Files:\n${stat.out.slice(0, 6000)}`,
    `Diff${diff.out.length > 40_000 ? ' (cut)' : ''}:\n${diff.out.slice(0, 40_000)}`,
  ]
    .filter(Boolean)
    .join('\n\n');
  const r = await oneShotJson<{ title?: string; body?: string }>({ system: DESCRIBE, prompt, model: 'sonnet', codexModel, timeoutMs: 150_000 }, 'a description');
  return { title: String(r.title ?? '').slice(0, 200), body: String(r.body ?? '') };
}

/** Commits the changes (when asked), pushes the branch and opens the pull request. */
export async function createPr(db: DB, cwd: string, wt: WorktreeInfo | undefined, o: { title: string; body: string; draft: boolean; commitAll: boolean }): Promise<PullRequestInfo> {
  const title = o.title.trim();
  if (!title) throw new HttpError(400, 'Give it a title');
  const d = await prDraft(db, cwd, wt);
  if (!d.host) throw new HttpError(400, 'No account for this repository’s server: add one in Settings → Source control');
  const remote = await remoteOf(d.dir, d.head);
  const hosted = remote && (await hostedAt(db, remote.url));
  if (!hosted) throw new HttpError(400, 'No account for this repository’s server');
  if (o.commitAll && d.dirty) {
    const add = await git(d.dir, ['add', '-A'], 60_000);
    const commit = add.ok ? await git(d.dir, ['commit', '-m', title], 60_000) : add;
    if (!commit.ok) throw new HttpError(500, `Could not commit the changes: ${lastLine(commit.err)}`);
  }
  const ahead = await git(d.dir, ['rev-list', '--count', `${await baseRef(d.dir, d.remote, d.base)}..HEAD`]);
  if (Number(ahead.out.trim()) === 0) throw new HttpError(400, `There are no commits on ${d.head} beyond ${d.base} to propose`);
  const push = await git(d.dir, ['push', '--set-upstream', d.remote, d.head], 180_000);
  if (!push.ok) throw new HttpError(500, `Could not push ${d.head}: ${lastLine(push.err)}`);
  const gitea = hosted.account.provider === 'gitea';
  const pr = await call(hosted.account, 'POST', `/repos/${hosted.owner}/${hosted.repo}/pulls`, {
    // Gitea marks a draft by the title.
    title: gitea && o.draft ? `WIP: ${title}` : title,
    body: o.body,
    head: d.head,
    base: d.base,
    ...(gitea ? {} : { draft: o.draft }),
  });
  return toInfo(hosted, pr);
}

/** A pull request someone opened already (on the host, or by the agent), linked by its address. */
export async function prFromUrl(db: DB, url: string): Promise<PullRequestInfo> {
  const m = /^(https?:\/\/.+)\/([^/]+)\/([^/]+)\/(?:pull|pulls)\/(\d+)\/?$/.exec(url.trim());
  if (!m) throw new HttpError(400, 'That is not a pull request address');
  const acc = accounts(db).find((a) => m[1] === a.web);
  if (!acc) throw new HttpError(400, 'No account for that server: add one in Settings → Source control');
  const h = { account: acc, owner: m[2], repo: m[3] };
  return toInfo(h, await call(acc, 'GET', `/repos/${h.owner}/${h.repo}/pulls/${m[4]}`));
}

/** The pull request's state now, and how its checks stand. */
export async function refreshPr(db: DB, pr: PullRequestInfo): Promise<PullRequestInfo> {
  const acc = accounts(db).find((a) => a.provider === pr.provider && pr.url.startsWith(a.web + '/'));
  if (!acc) return pr;
  const [owner, repo] = pr.repo.split('/');
  const h = { account: acc, owner, repo };
  const p = await call(acc, 'GET', `/repos/${owner}/${repo}/pulls/${pr.number}`);
  const next = toInfo(h, p);
  const sha = p?.head?.sha;
  if (sha && next.state !== 'merged' && next.state !== 'closed') next.checks = await checksOf(h, sha).catch(() => pr.checks);
  return next;
}

async function checksOf(h: Hosted, sha: string): Promise<PullRequestInfo['checks']> {
  const st = await call(h.account, 'GET', `/repos/${h.owner}/${h.repo}/commits/${sha}/status`);
  const states: string[] = (st?.statuses ?? []).map((s: any) => String(s.state ?? s.status));
  if (h.account.provider === 'github') {
    const runs = await call(h.account, 'GET', `/repos/${h.owner}/${h.repo}/commits/${sha}/check-runs?per_page=100`).catch(() => null);
    for (const r of runs?.check_runs ?? []) states.push(r.status !== 'completed' ? 'pending' : ['success', 'neutral', 'skipped'].includes(r.conclusion) ? 'success' : 'failure');
  }
  if (!states.length) return undefined;
  if (states.some((s) => s === 'failure' || s === 'error')) return 'failure';
  if (states.some((s) => s === 'pending' || s === 'warning')) return 'pending';
  return 'success';
}

// ---- reviewing the changes ---------------------------------------------------------------------

export interface ReviewFile {
  path: string;
  oldPath?: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  added: number;
  removed: number;
  diff: string;
  binary?: boolean;
  /** Not committed yet. */
  uncommitted?: boolean;
  /** Changes when the file's changes do, so a "viewed" mark lapses. */
  hash: string;
}

export interface Review {
  dir: string;
  head: string;
  base: string;
  files: ReviewFile[];
  /** Files with changes not committed yet. */
  uncommitted: number;
  /** A reading guide written for exactly these changes, when there is one. */
  guide?: Guide;
  /** Key of the changes, for the guide. */
  digest: string;
}

export interface Guide {
  summary: string;
  steps: { path: string; note: string }[];
}

const MAX_FILE_DIFF = 300_000;

/** Everything the branch changes since it left its base: commits and uncommitted work, untracked files too. */
export async function reviewChanges(db: DB, cwd: string, wt?: WorktreeInfo): Promise<Review> {
  const dir = await topOf(wt && fs.existsSync(wt.path) ? wt.path : cwd);
  const head = (await git(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])).out.trim();
  const remote = head && head !== 'HEAD' ? await remoteOf(dir, head) : null;
  const base = wt?.base && wt.base !== head ? wt.base : remote ? await defaultBranch(dir, remote.name) : 'main';
  const ref = await baseRef(dir, remote?.name, base);
  const mb = (await git(dir, ['merge-base', ref, 'HEAD'])).out.trim() || 'HEAD';
  const [full, numstat, dirtyNames, untracked] = await Promise.all([
    git(dir, ['diff', '-M', '--no-color', '--no-ext-diff', mb], 60_000),
    git(dir, ['diff', '-M', '--numstat', mb], 60_000),
    git(dir, ['diff', '--name-only', 'HEAD']),
    git(dir, ['ls-files', '--others', '--exclude-standard']),
  ]);
  const counts = new Map<string, [number, number, boolean]>();
  for (const l of numstat.out.split('\n').filter(Boolean)) {
    const [a, r, ...rest] = l.split('\t');
    const p = rest.join('\t').replace(/^(.*)\{(.*) => (.*)\}(.*)$/, '$1$3$4').replace(/^.* => /, '');
    counts.set(p, [Number(a) || 0, Number(r) || 0, a === '-']);
  }
  const dirty = new Set(dirtyNames.out.split('\n').filter(Boolean));
  const files: ReviewFile[] = [];
  for (const chunk of full.out.split(/^(?=diff --git )/m)) {
    const hm = /^diff --git a\/(.+?) b\/(.+)$/m.exec(chunk);
    if (!hm) continue;
    const renamed = /^rename from (.+)$/m.exec(chunk);
    const p = /^rename to (.+)$/m.exec(chunk)?.[1] ?? hm[2];
    const c = counts.get(p) ?? [0, 0, /^Binary files/m.test(chunk)];
    files.push({
      path: p,
      oldPath: renamed ? renamed[1] : undefined,
      status: /^new file mode/m.test(chunk) ? 'added' : /^deleted file mode/m.test(chunk) ? 'deleted' : renamed ? 'renamed' : 'modified',
      added: c[0],
      removed: c[1],
      binary: c[2] || undefined,
      // From the first hunk: the header lines (modes, index, rename) are said by status and oldPath.
      diff: hunks(chunk).slice(0, MAX_FILE_DIFF),
      uncommitted: dirty.has(p) || undefined,
      hash: crypto.createHash('sha1').update(hunks(chunk)).digest('hex').slice(0, 12),
    });
  }
  // New files git does not track yet, shown as added (small text files only).
  for (const p of untracked.out.split('\n').filter(Boolean).slice(0, 60)) {
    let text: string;
    try {
      const abs = path.join(dir, p);
      if (fs.statSync(abs).size > 200_000) continue;
      text = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    if (text.includes('\u0000')) continue;
    const lines = text.split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    const diff = `@@ -0,0 +1,${lines.length} @@\n${lines.map((l) => `+${l}`).join('\n')}\n`;
    files.push({ path: p, status: 'added', added: lines.length, removed: 0, diff, uncommitted: true, hash: crypto.createHash('sha1').update(diff).digest('hex').slice(0, 12) });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  const digest = crypto
    .createHash('sha1')
    .update(files.map((f) => `${f.path}:${f.hash}`).join('\n'))
    .digest('hex')
    .slice(0, 16);
  let guide: Guide | undefined;
  try {
    guide = JSON.parse(kvGet(db, `review_guide:${digest}`) ?? 'null') ?? undefined;
  } catch {}
  return { dir, head, base, files, uncommitted: files.filter((f) => f.uncommitted).length, guide, digest };
}

const GUIDE = [
  'You help a person review a set of code changes. Reply with JSON only, no code fences:',
  '{"summary":"...","steps":[{"path":"...","note":"..."}]}.',
  'summary: two or three plain sentences on what the changes do as a whole.',
  'steps: every changed file once, in the order that is easiest to read (the core idea first, then what uses it, tests and docs last).',
  'note: one or two sentences on what changed in that file and what to look at closely (risks, edge cases). Use the exact paths given.',
].join(' ');

/** A reading order for the changes with a note per file, written by a model and kept for these exact changes. */
export async function writeGuide(db: DB, review: Review, codexModel?: string): Promise<Guide> {
  if (!review.files.length) throw new HttpError(400, 'There are no changes to guide you through');
  const budget = 50_000;
  const per = Math.max(1500, Math.floor(budget / review.files.length));
  const body = review.files.map((f) => `### ${f.path} (${f.status}, +${f.added} −${f.removed})\n${f.binary ? '(binary)' : f.diff.slice(0, per)}`).join('\n\n');
  const g = await oneShotJson<{ summary?: string; steps?: { path?: string; note?: string }[] }>(
    { system: GUIDE, prompt: `Branch ${review.head} against ${review.base}.\n\n${body.slice(0, 80_000)}`, model: 'sonnet', codexModel, timeoutMs: 150_000 },
    'a guide',
  );
  const known = new Set(review.files.map((f) => f.path));
  const steps = (g.steps ?? []).filter((s) => s?.path && known.has(s.path)).map((s) => ({ path: String(s.path), note: String(s.note ?? '') }));
  // Files the model left out go at the end, so the guide still covers everything.
  for (const f of review.files) if (!steps.some((s) => s.path === f.path)) steps.push({ path: f.path, note: '' });
  const guide = { summary: String(g.summary ?? ''), steps };
  kvSet(db, `review_guide:${review.digest}`, JSON.stringify(guide));
  return guide;
}

function hunks(chunk: string) {
  const at = chunk.search(/^@@/m);
  return at < 0 ? '' : chunk.slice(at);
}

function lastLine(s: string) {
  return s.trim().split('\n').pop() ?? '';
}
