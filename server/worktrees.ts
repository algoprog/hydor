// A worktree per session: the agent works on its own branch in its own folder, so several agents can
// change one repository at once without stepping on each other. Worktrees live in the app's data folder,
// next to nothing else, and go when you remove them (their branch stays unless you ask).
//
// Sessions in a worktree also get checkpoints: a snapshot of the folder each time you send a message,
// so "Edit from here" can put the files back as they were.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { WorktreeInfo } from '../shared/types.ts';
import { HttpError } from './auth.ts';
import { config } from './config.ts';
import { git } from './git.ts';

/** Where the app makes worktrees for sessions. */
export const WORKTREES_ROOT = process.env.WORKTREES_DIR ?? path.join(config.dataDir, 'worktrees');

/** The repository a folder is in, and the branch checked out there; null outside git. */
export async function repoInfo(dir: string): Promise<{ repo: string; branch: string; sub: string } | null> {
  const top = await git(dir, ['rev-parse', '--show-toplevel']);
  if (!top.ok) return null;
  const repo = top.out.trim();
  const br = await git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const branch = br.ok ? br.out.trim() : 'HEAD';
  return { repo, branch, sub: path.relative(repo, fs.realpathSync(dir)) };
}

/** A short branch-safe name from a task's first words: "fix the flaky upload test" → "fix-flaky-upload-test". */
export function slugFrom(text: string): string {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !['the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'with', 'please'].includes(w))
    .slice(0, 5);
  return (words.join('-').slice(0, 40).replace(/-+$/, '') || 'task') + '-' + crypto.randomBytes(2).toString('hex');
}

/** Makes a worktree of the repository `dir` is in, on a new branch from the one checked out there. */
export async function createWorktree(dir: string, hint: string): Promise<{ info: WorktreeInfo; cwd: string }> {
  const r = await repoInfo(dir);
  if (!r) throw new HttpError(400, 'That folder is not in a git repository');
  const slug = slugFrom(hint);
  const branch = `agent/${slug}`;
  const wt = path.join(WORKTREES_ROOT, path.basename(r.repo), slug);
  fs.mkdirSync(path.dirname(wt), { recursive: true, mode: 0o700 });
  // A detached HEAD starts from that commit; a branch from its tip.
  const base = r.branch === 'HEAD' ? (await git(r.repo, ['rev-parse', 'HEAD'])).out.trim() : r.branch;
  const add = await git(r.repo, ['worktree', 'add', '-b', branch, wt, base], 120_000);
  if (!add.ok) throw new HttpError(500, `Could not make the worktree: ${add.err.trim().split('\n').pop()}`);
  return { info: { path: wt, branch, base, repo: r.repo }, cwd: r.sub ? path.join(wt, r.sub) : wt };
}

export interface WorktreeState {
  exists: boolean;
  /** Files changed and not committed. */
  dirty: number;
  /** Commits on the branch that its base lacks, and the other way round. */
  ahead: number;
  behind: number;
}

export async function worktreeState(w: WorktreeInfo): Promise<WorktreeState> {
  if (!fs.existsSync(w.path)) return { exists: false, dirty: 0, ahead: 0, behind: 0 };
  const [st, counts] = await Promise.all([git(w.path, ['status', '--porcelain']), git(w.repo, ['rev-list', '--left-right', '--count', `${w.base}...${w.branch}`])]);
  const [behind, ahead] = counts.ok ? counts.out.trim().split(/\s+/).map(Number) : [0, 0];
  return { exists: true, dirty: st.ok ? st.out.split('\n').filter(Boolean).length : 0, ahead: ahead || 0, behind: behind || 0 };
}

/** Removes the worktree's folder; its branch too when asked (or when it holds nothing new). */
export async function removeWorktree(w: WorktreeInfo, o: { force?: boolean; deleteBranch?: boolean } = {}): Promise<{ branchKept: boolean }> {
  const st = await worktreeState(w);
  if (st.exists) {
    if (st.dirty && !o.force) throw new HttpError(409, `The worktree has ${st.dirty} uncommitted change${st.dirty === 1 ? '' : 's'}`);
    const rm = await git(w.repo, ['worktree', 'remove', ...(o.force ? ['--force'] : []), w.path], 120_000);
    if (!rm.ok) throw new HttpError(500, `Could not remove the worktree: ${rm.err.trim().split('\n').pop()}`);
  } else await git(w.repo, ['worktree', 'prune']);
  const refs = await git(w.repo, ['for-each-ref', '--format=%(refname)', ...['hydor', 'naget-agent', 'agent-console'].map((ns) => `refs/${ns}/checkpoints/${path.basename(w.path)}/`)]);
  for (const ref of refs.out.split('\n').filter(Boolean)) await git(w.repo, ['update-ref', '-d', ref]);
  const drop = o.deleteBranch || st.ahead === 0;
  if (drop) {
    const del = await git(w.repo, ['branch', o.deleteBranch ? '-D' : '-d', w.branch]);
    return { branchKept: !del.ok };
  }
  return { branchKept: true };
}

// ---- checkpoints ------------------------------------------------------------------------------

/**
 * A snapshot of the worktree as it is now (committed or not, untracked files too, ignored ones not),
 * kept as a commit under refs/hydor so git does not collect it. Returns its id.
 */
export async function checkpoint(w: WorktreeInfo): Promise<string | null> {
  if (!fs.existsSync(w.path)) return null;
  const index = path.join(os.tmpdir(), `wa-ckpt-${crypto.randomBytes(6).toString('hex')}`);
  const envIdx = { GIT_INDEX_FILE: index };
  try {
    const head = (await git(w.path, ['rev-parse', 'HEAD'])).out.trim();
    if (!head) return null;
    await gitWith(w.path, ['read-tree', 'HEAD'], envIdx);
    await gitWith(w.path, ['add', '-A', '.'], envIdx);
    const tree = (await gitWith(w.path, ['write-tree'], envIdx)).out.trim();
    if (!tree) return null;
    const commit = (await git(w.path, ['commit-tree', tree, '-p', head, '-m', 'hydor checkpoint'])).out.trim();
    if (!commit) return null;
    await git(w.path, ['update-ref', `refs/hydor/checkpoints/${path.basename(w.path)}/${Date.now()}`, commit]);
    return commit;
  } finally {
    fs.rmSync(index, { force: true });
  }
}

/** Puts the worktree's files back as they were in a checkpoint: the commit it was on, and the changes on top. */
export async function restoreCheckpoint(w: WorktreeInfo, commit: string) {
  const parent = (await git(w.path, ['rev-parse', `${commit}^`])).out.trim();
  if (!parent) throw new HttpError(404, 'That checkpoint is gone');
  const steps: string[][] = [
    ['reset', '--hard', parent],
    ['clean', '-fd'],
    ['checkout', commit, '--', '.'],
    ['reset', '--mixed', parent],
  ];
  for (const s of steps) {
    const r = await git(w.path, s, 120_000);
    if (!r.ok) throw new HttpError(500, `Could not restore the files: ${r.err.trim().split('\n').pop()}`);
  }
}

/** git with a temporary index, so the real one (and the agent's staged work) stays untouched. */
function gitWith(cwd: string, args: string[], extra: Record<string, string>) {
  return git(cwd, args, 60_000, extra);
}
