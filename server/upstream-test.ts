// How a copy of the app from git follows its upstream (upstream.ts, and install.sh in shell) when upstream's history was
// rewritten: every commit made again under a new id, with the same author, committer and dates but other file content
// (LICENSE), and force-pushed, so that `git pull --ff-only` cannot fast-forward any more. A copy with nothing of its own
// moves to the new upstream (git reset --keep); a copy with commits of its own, or with changes that the move would
// overwrite, is left as it is with an error; a pull that failed for another reason is none of its business. Every case
// runs on real git repositories in a temporary folder (a bare origin, the work repo that rewrites it, and clones made
// with file:// URLs, which --depth needs), with git isolated from the user's own configuration.
// Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/upstream-test.ts && DATA_DIR=/tmp/hydor-test-upstream node dist/dev/upstream-test.js
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
process.env.CUDA_VISIBLE_DEVICES = '';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-upstream-'));
process.on('exit', () => fs.rmSync(root, { recursive: true, force: true }));
// git sees nothing of the user's configuration: the children (gitIn's too) inherit this.
const home = path.join(root, 'home');
fs.mkdirSync(home);
const gitconfig = path.join(root, 'gitconfig');
fs.writeFileSync(gitconfig, '[user]\n\tname = Test Author\n\temail = test@example.com\n[init]\n\tdefaultBranch = main\n');
process.env.GIT_CONFIG_GLOBAL = gitconfig;
process.env.GIT_CONFIG_NOSYSTEM = '1';
process.env.HOME = home;

const { commitsBehind, followRewrite, gitIn } = await import('./upstream.ts');

const { APP_ROOT } = await import('./config.ts');
const installSh = path.join(APP_ROOT, 'install.sh');
const origin = path.join(root, 'origin.git');
const originUrl = `file://${origin}`;
const work = path.join(root, 'work');

let clock = 1_700_000_000;
/** Every commit gets its own date, a minute after the one before. */
const nextDate = () => `@${(clock += 60)} +0000`;
const git = (cwd: string, args: string[], env: Record<string, string> = {}, input?: string) =>
  execFileSync('git', args, { cwd, env: { ...process.env, ...env }, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
/** git that is expected to fail: its result, with both outputs. */
const gitFails = (cwd: string, args: string[]) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { status: r.status, out: r.stdout, err: r.stderr };
};
const commit = (cwd: string, message: string) => {
  const d = nextDate();
  git(cwd, ['add', '-A']);
  git(cwd, ['commit', '-m', message], { GIT_AUTHOR_DATE: d, GIT_COMMITTER_DATE: d });
  return git(cwd, ['rev-parse', 'HEAD']);
};
const write = (dir: string, file: string, text: string) => fs.writeFileSync(path.join(dir, file), text);
const read = (dir: string, file: string) => fs.readFileSync(path.join(dir, file), 'utf8');
const head = (dir: string) => git(dir, ['rev-parse', 'HEAD']);
const originMain = (dir: string) => git(dir, ['rev-parse', 'origin/main']);

// The original history, C1..C5, with origin's main at C3 while the shallow clone is made.
fs.mkdirSync(work);
git(root, ['init', '--bare', origin]);
git(work, ['init']);
write(work, 'LICENSE', 'MIT\n');
write(work, 'package.json', '{ "name": "hydor" }\n');
write(work, 'app.txt', 'one\n');
write(work, 'notes.txt', 'notes\n');
const C: string[] = [commit(work, 'C1: first')];
write(work, 'app.txt', 'two\n');
C.push(commit(work, 'C2: second'));
write(work, 'app.txt', 'three\n');
C.push(commit(work, 'C3: third'));
git(work, ['remote', 'add', 'origin', originUrl]);
git(work, ['push', 'origin', 'main']);
git(root, ['--git-dir', origin, 'symbolic-ref', 'HEAD', 'refs/heads/main']);
const shallow = path.join(root, 'shallow');
git(root, ['clone', '--depth', '1', originUrl, shallow]);
assert.equal(fs.existsSync(path.join(shallow, '.git', 'shallow')), true, 'the clone is shallow');
write(work, 'app.txt', 'four\n');
C.push(commit(work, 'C4: fourth'));
write(work, 'app.txt', 'five\n');
C.push(commit(work, 'C5: fifth'));
git(work, ['push', 'origin', 'main']);

/** A clone of origin at C3 (the install that has not updated), made before the rewrite. */
const cloneAtC3 = (name: string) => {
  const dir = path.join(root, name);
  git(root, ['clone', originUrl, dir]);
  git(dir, ['reset', '--hard', C[2]]);
  return dir;
};

let passed = 0;
let skipped = 0;
const test = async (name: string, fn: () => void | Promise<void>) => {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
};

// Before the rewrite.
await test('before: a clone at C3 is 2 commits behind', async () => {
  const d = cloneAtC3('b-behind');
  assert.equal(await commitsBehind(gitIn(d)), 2);
  git(d, ['pull', '--ff-only']);
  assert.equal(head(d), C[4], 'it fast-forwards');
  assert.equal(await commitsBehind(gitIn(d)), 0);
});

await test('before: a clone at C5 with a commit of its own pulls fine, and is not a rewrite', async () => {
  const d = path.join(root, 'b-own');
  git(root, ['clone', originUrl, d]);
  write(d, 'mine.txt', 'mine\n');
  const mine = commit(d, 'B1: mine');
  assert.match(git(d, ['pull', '--ff-only']), /Already up to date/);
  assert.deepEqual(await followRewrite(gitIn(d)), { moved: false });
  assert.equal(head(d), mine);
});

await test('before: a clone at C3 with an uncommitted edit to app.txt fails to pull, and that is not a rewrite', async () => {
  const d = cloneAtC3('b-dirty');
  write(d, 'app.txt', 'my edit\n');
  const r = gitFails(d, ['pull', '--ff-only']);
  assert.notEqual(r.status, 0);
  assert.match(r.err, /app\.txt/);
  assert.deepEqual(await followRewrite(gitIn(d)), { moved: false });
  assert.equal(head(d), C[2]);
  assert.equal(read(d, 'app.txt'), 'my edit\n');
});

// The clones that live through the rewrite, made now.
const full = cloneAtC3('a-full');
const own = cloneAtC3('a-own');
write(own, 'mine.txt', 'mine\n');
const B1 = commit(own, 'B1: mine');
// Upstream's C4 put on a commit of its own with C4's dates kept (git am --committer-date-is-author-date, say): its
// last commit has the times of C4' after the rewrite, but what comes before it does not.
const replayed = cloneAtC3('a-replayed');
write(replayed, 'mine.txt', 'mine\n');
commit(replayed, 'B1: mine');
write(replayed, 'app.txt', 'four\n');
git(replayed, ['add', '-A']);
const [c4at, c4ct] = git(work, ['log', '-1', '--format=%at %ct', C[3]]).split(' ');
git(replayed, ['commit', '-m', 'C4: fourth'], { GIT_AUTHOR_DATE: `@${c4at} +0000`, GIT_COMMITTER_DATE: `@${c4ct} +0000` });
const L = head(replayed);
const dirtyLicense = cloneAtC3('a-license');
write(dirtyLicense, 'LICENSE', 'MY OWN LICENSE\n');
const dirtyNotes = cloneAtC3('a-notes');
write(dirtyNotes, 'notes.txt', 'my notes\n');
const viaInstaller = cloneAtC3('i-clean');
const viaInstallerOwn = cloneAtC3('i-own');
write(viaInstallerOwn, 'mine.txt', 'mine\n');
const B2 = commit(viaInstallerOwn, 'B2: mine');

// The rewrite: C1'..C5' with LICENSE changed and everything else kept, then two new commits, force-pushed.
const fmt = (c: string, f: string) => git(work, ['log', '-1', `--format=${f}`, c]);
const idx = path.join(root, 'rewrite-index');
const C2: string[] = [];
for (const [i, c] of C.entries()) {
  const env = { GIT_INDEX_FILE: idx };
  fs.rmSync(idx, { force: true });
  git(work, ['read-tree', fmt(c, '%T')], env);
  const blob = git(work, ['hash-object', '-w', '--stdin'], {}, 'AGPL\n');
  git(work, ['update-index', '--cacheinfo', `100644,${blob},LICENSE`], env);
  const tree = git(work, ['write-tree'], env);
  const meta = {
    GIT_AUTHOR_NAME: fmt(c, '%an'),
    GIT_AUTHOR_EMAIL: fmt(c, '%ae'),
    GIT_AUTHOR_DATE: git(work, ['log', '-1', '--format=%at +0000', c]),
    GIT_COMMITTER_NAME: fmt(c, '%cn'),
    GIT_COMMITTER_EMAIL: fmt(c, '%ce'),
    GIT_COMMITTER_DATE: git(work, ['log', '-1', '--format=%ct +0000', c]),
  };
  const args = ['commit-tree', tree, ...(i ? ['-p', C2[i - 1]] : []), '-F', '-'];
  C2.push(git(work, args, meta, git(work, ['log', '-1', '--format=%B', c]) + '\n'));
}
fs.rmSync(idx, { force: true });
git(work, ['reset', '--hard', C2[4]]);
assert.equal(read(work, 'LICENSE'), 'AGPL\n');
write(work, 'app.txt', 'six\n');
commit(work, 'C6: sixth');
write(work, 'app.txt', 'seven\n');
const C7 = commit(work, 'C7: seventh');
git(work, ['push', '--force', 'origin', 'main']);
for (const [i, c] of C.entries()) assert.equal(git(work, ['log', '-1', '--format=%at %ct', C2[i]]), git(work, ['log', '-1', '--format=%at %ct', c]), `C${i + 1}' keeps the dates`);
assert.notEqual(C2[2], C[2]);

/** The pull that cannot fast-forward any more. */
const pullFails = (d: string) => {
  const r = gitFails(d, ['pull', '--ff-only']);
  assert.notEqual(r.status, 0, 'git pull --ff-only fails');
  assert.match(r.err, /Not possible to fast-forward/);
};

await test('after: a full clone at C3 is 4 behind (from its twin, not the whole history), and follows the rewrite', async () => {
  pullFails(full);
  assert.equal(await commitsBehind(gitIn(full)), 4);
  assert.deepEqual(await followRewrite(gitIn(full)), { moved: true });
  assert.equal(head(full), originMain(full));
  assert.equal(head(full), C7);
  assert.equal(read(full, 'LICENSE').trim(), 'AGPL');
  assert.equal(await commitsBehind(gitIn(full)), 0);
});

await test('after: the shallow clone made at C3 follows the rewrite', async () => {
  pullFails(shallow);
  assert.deepEqual(await followRewrite(gitIn(shallow)), { moved: true });
  assert.equal(head(shallow), originMain(shallow));
  assert.equal(head(shallow), C7);
});

await test('after: a clone with a commit of its own is refused, with its commit still there', async () => {
  pullFails(own);
  const r = await followRewrite(gitIn(own));
  assert.equal(r.moved, false);
  assert.match(r.error ?? '', /commits of its own/);
  assert.equal(head(own), B1);
  assert.equal(read(own, 'mine.txt'), 'mine\n');
});

await test("after: a patch of upstream's put on a commit of its own with its dates kept is not taken for its twin", async () => {
  pullFails(replayed);
  assert.equal(git(replayed, ['log', '-1', '--format=%at %ct', 'HEAD']), git(replayed, ['log', '-1', '--format=%at %ct', C2[3]]), "it has C4''s times");
  const r = await followRewrite(gitIn(replayed));
  assert.equal(r.moved, false);
  assert.match(r.error ?? '', /commits of its own/);
  assert.equal(head(replayed), L);
});

await test('after: an uncommitted change to LICENSE (which the rewrite changes) stops the move, and stays', async () => {
  pullFails(dirtyLicense);
  const before = head(dirtyLicense);
  const r = await followRewrite(gitIn(dirtyLicense));
  assert.equal(r.moved, false);
  assert.match(r.error ?? '', /LICENSE/);
  assert.equal(head(dirtyLicense), before);
  assert.equal(before, C[2]);
  assert.equal(read(dirtyLicense, 'LICENSE'), 'MY OWN LICENSE\n');
});

await test('after: an uncommitted change to notes.txt (untouched upstream) is kept through the move', async () => {
  pullFails(dirtyNotes);
  assert.deepEqual(await followRewrite(gitIn(dirtyNotes)), { moved: true });
  assert.equal(head(dirtyNotes), originMain(dirtyNotes));
  assert.equal(read(dirtyNotes, 'notes.txt'), 'my notes\n');
  assert.equal(read(dirtyNotes, 'LICENSE').trim(), 'AGPL');
});

// install.sh does the same in bash, run the way `curl … | bash` runs it.
const install = (dir: string) => {
  const stubs = path.join(root, 'stubs');
  fs.mkdirSync(stubs, { recursive: true });
  for (const n of ['npm', 'tmux', 'make', 'g++', 'python3']) fs.writeFileSync(path.join(stubs, n), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const r = spawnSync('bash', ['-s'], {
    input: fs.readFileSync(installSh),
    cwd: root,
    encoding: 'utf8',
    timeout: 120_000,
    env: { ...process.env, HOME: home, HYDOR_DIR: dir, NO_SERVICE: '1', PATH: `${stubs}:${process.env.PATH}` },
  });
  return { status: r.status, text: `${r.stdout}\n${r.stderr}` };
};

if (process.platform !== 'linux') {
  skipped += 3;
  console.log('  skip  install.sh: the installer is for Linux only');
} else {
  await test('install.sh: a clone at C3 moves to the rewritten upstream, and the install goes on', () => {
    assert.equal(head(viaInstaller), C[2]);
    const r = install(viaInstaller);
    assert.equal(r.status, 0, r.text);
    assert.equal(head(viaInstaller), originMain(viaInstaller));
    assert.equal(head(viaInstaller), C7);
    assert.match(r.text, /moving .* to it/i);
  });

  await test('install.sh: a clone with a commit of its own stops, saying so, and stays', () => {
    const r = install(viaInstallerOwn);
    assert.notEqual(r.status, 0, r.text);
    assert.match(r.text, /commits of your own/);
    assert.equal(head(viaInstallerOwn), B2);
  });

  await test("install.sh: a patch of upstream's put on a commit of its own with its dates kept is not taken for its twin", () => {
    const r = install(replayed);
    assert.notEqual(r.status, 0, r.text);
    assert.match(r.text, /commits of your own/);
    assert.equal(head(replayed), L);
  });
}

console.log(`${passed} passed${skipped ? `, ${skipped} skipped` : ''}`);
