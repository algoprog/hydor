// Where a copy of the app from git stands against the branch it updates from (its upstream), for updating it: Update
// now in Settings (updates.ts) and `hydor update` (cli.ts); install.sh does the same in shell. Mostly upstream has only
// moved on, and the copy fast-forwards. When upstream's history was rewritten instead (Hydor's was with 0.78.0: every
// commit made again under a new id, with the same author and dates), a pull cannot fast-forward any more ("Not possible
// to fast-forward, aborting"). A copy whose last commit is still there under its new id has nothing of its own, so it
// moves to upstream, keeping the files changed in it (and stopping before it would overwrite one). A copy with commits
// of its own is left as it is, and the error says what to do.
import { execFile } from 'node:child_process';

export type Git = (args: string[]) => Promise<{ ok: boolean; out: string; err: string }>;

/** git in a folder, for callers without a git of their own (the CLI). */
export const gitIn =
  (cwd: string): Git =>
  (args) =>
    new Promise((resolve) =>
      execFile('git', args, { cwd, timeout: 60_000, maxBuffer: 64 << 20 }, (err, out, e) => resolve({ ok: !err, out: String(out ?? ''), err: String(e ?? '') })),
    );

/** A commit as a rewrite keeps it: when it was written and when it was committed, to the second. */
const WHEN = '%at %ct';

/** Whether HEAD is in upstream's history: upstream only moved on, or has nothing new. */
const inUpstream = async (git: Git) => (await git(['merge-base', '--is-ancestor', 'HEAD', '@{u}'])).ok;

/** The times of a commit and of those before it, along first parents (up to 20; fewer in a shallow clone). */
const chain = async (git: Git, rev: string) => {
  const r = await git(['log', '--first-parent', '-n', '20', `--format=${WHEN}`, rev]);
  return r.ok ? r.out.trim().split('\n').filter(Boolean) : [];
};

/**
 * The commit of upstream that is HEAD under another id, when upstream's history was rewritten under this copy: one with
 * HEAD's times whose commits before it have the times of HEAD's too (a patch of upstream's put on commits of this copy's
 * own with its dates kept is not its twin).
 */
async function twin(git: Git): Promise<string | undefined> {
  const [mine, up] = await Promise.all([chain(git, 'HEAD'), git(['log', `--format=%H ${WHEN}`, '@{u}'])]);
  if (!mine.length || !up.ok) return undefined;
  for (const line of up.out.split('\n')) {
    const sp = line.indexOf(' ');
    if (sp <= 0 || line.slice(sp + 1) !== mine[0]) continue;
    const theirs = await chain(git, line.slice(0, sp));
    if (theirs.length >= mine.length && mine.every((w, i) => w === theirs[i])) return line.slice(0, sp);
  }
  return undefined;
}

/**
 * How many commits upstream has that this copy does not: past HEAD, or past its twin when upstream's history was
 * rewritten under it (otherwise every commit would count).
 */
export async function commitsBehind(git: Git): Promise<number> {
  const from = (await inUpstream(git)) ? 'HEAD' : ((await twin(git)) ?? 'HEAD');
  return Number((await git(['rev-list', '--count', `${from}..@{u}`])).out.trim()) || 0;
}

/**
 * After a pull that could not fast-forward: moves a copy with nothing of its own to upstream's rewritten history
 * (`git reset --keep`). `moved` false without an error: that is not why the pull failed, and its own error says why;
 * with one: why the copy cannot move.
 */
export async function followRewrite(git: Git): Promise<{ moved: boolean; error?: string }> {
  const up = (await git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])).out.trim();
  // No upstream, nothing new there, or only commits of this copy's own on top of it: not a rewrite.
  if (!up || (await inUpstream(git)) || (await git(['merge-base', '--is-ancestor', '@{u}', 'HEAD'])).ok) return { moved: false };
  if (!(await twin(git)))
    return {
      moved: false,
      error: `This copy has commits of its own that ${up} does not have, so it cannot move ahead by itself: put them on top of ${up} (git rebase), or set them aside (git reset --keep ${up}), then update again.`,
    };
  const r = await git(['reset', '--keep', '@{u}']);
  if (r.ok) return { moved: true };
  const files = [...r.err.matchAll(/(?:Entry|file) '([^']+)'/g)].map((m) => m[1]);
  const said = r.err.split('\n').find((l) => /^(error|fatal):/.test(l.trim())) ?? r.err.trim();
  return {
    moved: false,
    error: files.length
      ? `Moving to ${up}'s rewritten history would overwrite files changed in this copy (${files.slice(0, 3).join(', ')}${files.length > 3 ? '…' : ''}): commit them or set them aside (git stash), then update again.`
      : `Could not move to ${up}'s rewritten history: ${said.replace(/^(error|fatal):\s*/, '').slice(0, 200)}`,
  };
}
