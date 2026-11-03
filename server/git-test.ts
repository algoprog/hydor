// Script tests for the Git page's server side, on repositories made for the test in a temp folder: adding a
// folder (and starting a repository in one), commits of picked files and amending, Sync (publish, bring in,
// send up, and the two ways to put diverged branches together), merges and rebases that stop on conflicts
// (continued once settled, or stopped), the history with parents, branches and tags and its search, branches
// (rename, merge, compare, what deleting one loses), revert and undo, stashes, putting back one part of a
// file's changes, ignoring a file, and which addresses a clone takes. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/git-test.ts && DATA_DIR=/tmp/hydor-test-git node dist/dev/git-test.js
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from './config.ts';
import { openDb } from './db.ts';
import { cloneName, cloneUrlOk, GitRepos, parseRefs, redactUrl } from './git.ts';

if (!config.dataDir.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so the test touches no real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-git-test-'));
const db = openDb(path.join(tmp, 'test.db'));
const repos = new GitRepos(db);

const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Bea', GIT_AUTHOR_EMAIL: 'bea@example.com', GIT_COMMITTER_NAME: 'Bea', GIT_COMMITTER_EMAIL: 'bea@example.com' };
const sh = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
const w = (p: string, t: string) => (fs.mkdirSync(path.dirname(p), { recursive: true }), fs.writeFileSync(p, t));
const local = (r: string) => {
  for (const [k, v] of [
    ['user.name', 'Alex Rivera'],
    ['user.email', 'alex@example.com'],
    ['commit.gpgsign', 'false'],
    ['tag.gpgsign', 'false'],
    ['core.hooksPath', '/dev/null'],
  ])
    sh(r, 'config', k, v);
};

let passed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (e) {
    console.error(`not ok - ${name}`);
    console.error(e);
    process.exitCode = 1;
  }
}

// A remote (bare), Alex's copy the page works on, and Bea's copy that changes the remote behind Alex's back.
const remote = path.join(tmp, 'remote.git');
sh(tmp, 'init', '-q', '--bare', '-b', 'main', remote);
const a = path.join(tmp, 'shop');
sh(tmp, 'clone', '-q', remote, a);
local(a);
w(path.join(a, 'README.md'), '# Shop\n');
w(path.join(a, 'src/total.ts'), 'one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\neleven\ntwelve\n');
sh(a, 'add', '-A');
sh(a, 'commit', '-q', '-m', 'First version');
const b = path.join(tmp, 'bea');
const beaCommit = (file: string, text: string, msg: string) => {
  sh(b, 'pull', '-q', '--ff-only');
  w(path.join(b, file), text);
  sh(b, 'add', '-A');
  sh(b, 'commit', '-q', '-m', msg);
  sh(b, 'push', '-q');
};

await test('a folder on this computer: its repository joins the list; a folder in none is offered a new one', async () => {
  await assert.rejects(repos.detail(a), /Not a repository/);
  const added = await repos.add(path.join(a, 'src'));
  assert.equal(added.path, a, 'a folder inside a repository adds the repository');
  assert.equal(added.repo?.manual, true);
  const list = await repos.list(true);
  assert.ok(list.some((r) => r.path === a && r.manual));
  const plain = path.join(tmp, 'notes');
  w(path.join(plain, 'todo.md'), 'milk\n');
  const r = await repos.add(plain);
  assert.equal(r.notRepo, true);
  assert.equal(r.repo, undefined);
  const made = await repos.add(plain, true);
  assert.equal(made.path, plain);
  assert.ok(fs.existsSync(path.join(plain, '.git')));
  const d = await repos.detail(plain);
  assert.equal(d.head, null, 'no commits yet');
  assert.deepEqual(
    d.files.map((f) => [f.path, f.code, f.added]),
    [['todo.md', '??', 1]],
  );
  repos.remove(plain);
  await assert.rejects(repos.detail(plain), /Not a repository/);
  await assert.rejects(repos.add('relative/path'), /Which folder/);
  await assert.rejects(repos.add(path.join(tmp, 'nothing-here')), /No folder/);
  if (!fs.existsSync(path.join(os.homedir(), '.git'))) await assert.rejects(repos.add(os.homedir(), true), /not the whole home folder/);
});

await test('Sync publishes a branch the remote lacks', async () => {
  const before = await repos.detail(a);
  assert.equal(before.upstream, null);
  assert.equal(before.remote, 'origin');
  assert.equal(before.headPushed, false);
  await assert.rejects(repos.sync(a, { push: false }), /publish it first/);
  const r = await repos.sync(a, { push: true });
  assert.ok(r.ok, r.output);
  assert.equal(r.published, true);
  assert.equal(r.repo.upstream, 'origin/main');
  assert.equal(r.repo.headPushed, true);
  sh(tmp, 'clone', '-q', remote, b);
  local(b);
});

await test('changes: line counts, committing only the picked files, amending until pushed', async () => {
  w(path.join(a, 'src/total.ts'), 'one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\neleven\ntwelve\nthirteen\n');
  w(path.join(a, 'notes.txt'), 'a\nb\nc\n');
  w(path.join(a, 'README.md'), '# Shop\n\nCarts and checkout.\n');
  let d = await repos.detail(a);
  const by = Object.fromEntries(d.files.map((f) => [f.path, f]));
  assert.equal(by['src/total.ts'].added, 1);
  assert.equal(by['src/total.ts'].removed, 0);
  assert.equal(by['notes.txt'].code, '??');
  assert.equal(by['notes.txt'].added, 3, 'a new file counts its lines');
  const r = await repos.commit(a, ['src/total.ts', 'notes.txt'], 'Thirteen, and notes', false);
  assert.ok(r.ok, r.output);
  assert.deepEqual(
    r.repo.files.map((f) => f.path),
    ['README.md'],
    'only the picked files went in',
  );
  assert.equal(r.repo.ahead, 1);
  assert.equal(r.repo.headPushed, false);
  const amended = await repos.commit(a, [], 'Thirteen lines, and notes', false, true);
  assert.ok(amended.ok, amended.output);
  assert.equal(sh(a, 'log', '-1', '--format=%s'), 'Thirteen lines, and notes');
  assert.equal(sh(a, 'rev-list', '--count', 'HEAD'), '2', 'amended, not a new commit');
  const withFile = await repos.commit(a, ['README.md'], 'Thirteen lines, notes and the README', false, true);
  assert.ok(withFile.ok);
  assert.deepEqual(withFile.repo.files, []);
  assert.equal(sh(a, 'show', '--name-only', '--format=', 'HEAD').split('\n').sort().join(','), 'README.md,notes.txt,src/total.ts');
  d = (await repos.sync(a, { push: true })).repo;
  assert.equal(d.ahead, 0);
  assert.equal(d.headPushed, true);
  await assert.rejects(repos.commit(a, [], 'Rewrite it', false, true), /on the remote already/);
  await assert.rejects(repos.commit(a, [], '  ', false), /Write a commit message/);
  await assert.rejects(repos.commit(a, ['../outside.txt'], 'x', false), /Not a file in this repository/);
});

await test('Sync brings in what is new, and sends up what is yours', async () => {
  beaCommit('docs/ship.md', 'Ship it\n', 'Docs: shipping');
  let r = await repos.sync(a, { push: true });
  assert.ok(r.ok, r.output);
  assert.equal(r.pulled, 1);
  assert.equal(r.pushed, 0);
  assert.ok(fs.existsSync(path.join(a, 'docs/ship.md')));
  w(path.join(a, 'docs/ship.md'), 'Ship it on Fridays\n');
  await repos.commit(a, ['docs/ship.md'], 'Docs: when', false);
  r = await repos.sync(a, { push: true });
  assert.ok(r.ok, r.output);
  assert.equal(r.pushed, 1);
  assert.equal(sh(remote, 'log', '-1', '--format=%s', 'main'), 'Docs: when');
});

await test('diverged: Sync asks first, then puts my commits on top, or merges', async () => {
  beaCommit('bea.txt', 'from Bea\n', 'Bea: a file');
  w(path.join(a, 'alex.txt'), 'from Alex\n');
  await repos.commit(a, ['alex.txt'], 'Alex: a file', false);
  const asked = await repos.sync(a, { push: true });
  assert.equal(asked.ok, false);
  assert.deepEqual(asked.diverged, { ahead: 1, behind: 1 });
  assert.equal(sh(a, 'log', '-1', '--format=%s'), 'Alex: a file', 'nothing changed yet');
  const top = await repos.sync(a, { push: true, mode: 'rebase' });
  assert.ok(top.ok, top.output);
  assert.equal(top.pushed, 1);
  assert.equal(sh(a, 'log', '-3', '--format=%s'), 'Alex: a file\nBea: a file\nDocs: when', 'one line of history, mine on top');
  beaCommit('bea2.txt', 'more\n', 'Bea: another');
  w(path.join(a, 'alex2.txt'), 'more\n');
  await repos.commit(a, ['alex2.txt'], 'Alex: another', false);
  const merged = await repos.sync(a, { push: true, mode: 'merge' });
  assert.ok(merged.ok, merged.output);
  assert.equal(sh(a, 'log', '-1', '--format=%P').split(' ').length, 2, 'a merge commit');
  assert.equal(merged.repo.ahead, 0);
});

await test('a merge that stops on conflicts: settle the files, then continue; a rebase stopped goes back as it was', async () => {
  beaCommit('src/total.ts', 'one\nTWO (Bea)\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\neleven\ntwelve\nthirteen\n', 'Bea: two');
  w(path.join(a, 'src/total.ts'), 'one\ntwo (Alex)\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\neleven\ntwelve\nthirteen\n');
  await repos.commit(a, ['src/total.ts'], 'Alex: two', false);
  const stopped = await repos.sync(a, { push: true, mode: 'merge' });
  assert.equal(stopped.ok, false);
  assert.equal(stopped.failed, 'pull');
  assert.equal(stopped.conflicts, true);
  assert.equal(stopped.repo.op?.kind, 'merge');
  assert.equal(stopped.repo.op?.onto, 'origin/main');
  assert.deepEqual(stopped.repo.op?.conflicts, [{ path: 'src/total.ts', resolved: false }]);
  assert.equal(stopped.repo.operation, 'merge');
  assert.ok(stopped.repo.files.find((f) => f.path === 'src/total.ts')?.conflict);
  await assert.rejects(repos.continueOp(a), /Still to settle: src\/total\.ts/);
  await assert.rejects(repos.sync(a, { push: true }), /Finish or stop/);
  await assert.rejects(repos.commit(a, ['src/total.ts'], 'x', false), /Finish or stop/);
  w(path.join(a, 'src/total.ts'), 'one\ntwo (Alex and Bea)\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\neleven\ntwelve\nthirteen\n');
  const settled = await repos.detail(a);
  assert.deepEqual(settled.op?.conflicts, [{ path: 'src/total.ts', resolved: true }]);
  const done = await repos.continueOp(a);
  assert.ok(done.ok, done.output);
  assert.equal(done.repo.op, null);
  assert.equal(sh(a, 'log', '-1', '--format=%B'), "Merge remote-tracking branch 'origin/main'", 'git’s message, without its comment lines');
  assert.ok((await repos.sync(a, { push: true })).ok);

  beaCommit('src/total.ts', 'one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\neleven\ntwelve\nthirteen (Bea)\n', 'Bea: thirteen');
  w(path.join(a, 'src/total.ts'), 'one\ntwo (Alex and Bea)\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\neleven\ntwelve\nthirteen (Alex)\n');
  await repos.commit(a, ['src/total.ts'], 'Alex: thirteen', false);
  const before = sh(a, 'rev-parse', 'HEAD');
  const rb = await repos.sync(a, { push: true, mode: 'rebase' });
  assert.equal(rb.conflicts, true);
  assert.equal(rb.repo.op?.kind, 'rebase');
  assert.equal(rb.repo.op?.onto, 'origin/main');
  assert.equal(rb.repo.op?.stoppedAt?.subject, 'Alex: thirteen');
  assert.equal(rb.repo.op?.step, 1);
  assert.equal(rb.repo.op?.steps, 1);
  const back = await repos.abortOp(a);
  assert.ok(back.ok, back.output);
  assert.equal(back.repo.op, null);
  assert.equal(sh(a, 'rev-parse', 'HEAD'), before, 'as it was before');
  await assert.rejects(repos.abortOp(a), /Nothing to stop/);
  // Settled the other way: take theirs, then the rebase finishes.
  await repos.sync(a, { push: false, mode: 'rebase' });
  sh(a, 'checkout', '--theirs', 'src/total.ts');
  const fin = await repos.continueOp(a);
  assert.ok(fin.ok, fin.output);
  assert.equal(fin.repo.op, null);
  assert.ok((await repos.sync(a, { push: true })).ok);
});

await test('the history: parents, branches and tags for the graph, pages, and a search by words, author or hash', async () => {
  sh(a, 'tag', 'v1.0', 'HEAD~2');
  const first = await repos.log(a, { limit: 3 });
  assert.equal(first.commits.length, 3);
  assert.equal(first.more, true);
  const head = first.commits[0];
  assert.equal(head.head, true);
  assert.ok(head.refs.some((r) => r.kind === 'branch' && r.name === 'main' && r.current));
  assert.ok(head.refs.some((r) => r.kind === 'remote' && r.name === 'origin/main'));
  assert.ok(first.commits[2].refs.some((r) => r.kind === 'tag' && r.name === 'v1.0'));
  for (const c of first.commits) assert.ok(c.parents.length >= 1 && c.parents.every((p) => /^[0-9a-f]{40}$/.test(p)));
  const next = await repos.log(a, { skip: 3, limit: 500 });
  assert.equal(next.more, false);
  assert.ok(!next.commits.some((c) => first.commits.some((f) => f.hash === c.hash)), 'the next page goes on from the first');
  assert.equal(next.commits.at(-1)?.subject, 'First version');
  assert.equal(next.commits.at(-1)?.parents.length, 0);
  const merges = [...first.commits, ...next.commits].filter((c) => c.parents.length === 2);
  assert.ok(merges.length >= 2, 'the merges have two parents');
  const words = await repos.log(a, { q: 'BEA:' });
  assert.ok(words.commits.length >= 4 && words.commits.every((c) => /bea/i.test(c.subject) || /bea/i.test(c.author)));
  const author = await repos.log(a, { q: 'bea@example' });
  assert.ok(author.commits.length >= 4 && author.commits.every((c) => c.author === 'Bea'));
  const byHash = await repos.log(a, { q: head.hash.slice(0, 8) });
  assert.equal(byHash.commits[0].hash, head.hash);
  assert.deepEqual((await repos.log(a, { q: 'no commit says this' })).commits, []);
  const detail = await repos.commitDetail(a, merges[0].hash);
  assert.equal(detail.parents.length, 2);
  assert.equal(detail.pushed, true);
  const shown = await repos.commitDetail(a, next.commits.at(-1)!.hash);
  assert.deepEqual(
    shown.files.map((f) => [f.path, f.status, f.added]),
    [
      ['README.md', 'A', 1],
      ['src/total.ts', 'A', 12],
    ],
  );
  assert.ok(shown.files[1].diff.includes('+twelve'));
  await assert.rejects(repos.commitDetail(a, '--all'), /Not a commit/);
  assert.deepEqual(parseRefs('HEAD -> refs/heads/main, refs/remotes/origin/main, refs/remotes/origin/HEAD, tag: refs/tags/v1').refs, [
    { name: 'main', kind: 'branch', current: true },
    { name: 'origin/main', kind: 'remote' },
    { name: 'v1', kind: 'tag' },
  ]);
});

await test('branches: new from here, publish, rename, compare, merge in, and what deleting one would lose', async () => {
  let r = await repos.switchBranch(a, 'feature/cart', true);
  assert.ok(r.ok, r.output);
  assert.equal(r.repo.branch, 'feature/cart');
  w(path.join(a, 'src/cart.ts'), 'export const cart = [];\n');
  await repos.commit(a, ['src/cart.ts'], 'Cart: a start', false);
  r = await repos.push(a, true);
  assert.ok(r.ok, r.output);
  assert.equal(r.repo.upstream, 'origin/feature/cart');
  w(path.join(a, 'src/cart.ts'), 'export const cart: string[] = [];\n');
  await repos.commit(a, ['src/cart.ts'], 'Cart: typed', false);
  r = await repos.renameBranch(a, 'feature/cart', 'cart');
  assert.ok(r.ok, r.output);
  assert.equal(r.repo.branch, 'cart');
  await assert.rejects(repos.renameBranch(a, 'cart', 'bad..name'), /Not a valid branch name/);
  await assert.rejects(repos.switchBranch(a, '-f', true), /Not a valid branch name/);
  r = await repos.switchBranch(a, 'main', false);
  assert.equal(r.repo.branch, 'main');
  const list = await repos.branches(a);
  assert.equal(list.current, 'main');
  const cart = list.branches.find((x) => x.name === 'cart')!;
  assert.equal(cart.merged, false);
  assert.equal(cart.upstream, 'origin/feature/cart');
  assert.equal(cart.ahead, 1);
  assert.ok(list.remotes.some((x) => x.name === 'origin/feature/cart' && x.local === 'cart'));
  const cmp = await repos.compare(a, 'cart');
  assert.equal(cmp.base, 'main');
  assert.deepEqual(
    cmp.ahead.map((c) => c.subject),
    ['Cart: typed', 'Cart: a start'],
  );
  assert.deepEqual(cmp.behind, []);
  assert.deepEqual(
    (await repos.branchOnly(a, 'cart')).commits.map((c) => c.subject),
    ['Cart: typed'],
    'the commit no other branch (or remote) has',
  );
  const refused = await repos.deleteBranch(a, 'cart');
  assert.equal(refused.ok, false, 'git keeps an unmerged branch');
  const m = await repos.merge(a, 'cart');
  assert.ok(m.ok, m.output);
  assert.ok(fs.existsSync(path.join(a, 'src/cart.ts')));
  const gone = await repos.deleteBranch(a, 'cart');
  assert.ok(gone.ok, gone.output);
  r = await repos.switchBranch(a, 'origin/feature/cart', false, { track: true });
  assert.ok(r.ok, r.output);
  assert.equal(r.repo.branch, 'feature/cart');
  assert.equal(r.repo.upstream, 'origin/feature/cart');
  await repos.switchBranch(a, 'main', false);
  assert.ok((await repos.deleteBranch(a, 'feature/cart', true)).ok, 'forced');
  await assert.rejects(repos.switchBranch(a, 'origin/nothing', false, { track: true }), /No such remote branch/);
  await assert.rejects(repos.merge(a, '--abort'), /No such branch/);
  const old = sh(a, 'rev-parse', 'HEAD~3');
  r = await repos.switchBranch(a, 'from-old', true, { from: old });
  assert.equal(sh(a, 'rev-parse', 'HEAD'), old, 'a new branch from a commit');
  await repos.switchBranch(a, 'main', false);
  await repos.deleteBranch(a, 'from-old');
  assert.ok((await repos.sync(a, { push: true })).ok);
});

await test('revert a commit, and undo the last one while no remote has it', async () => {
  w(path.join(a, 'oops.txt'), 'oops\n');
  await repos.commit(a, ['oops.txt'], 'Oops', false);
  const head = sh(a, 'rev-parse', 'HEAD');
  await assert.rejects(repos.undoCommit(a, sh(a, 'rev-parse', 'HEAD~1')), /Only the last commit/);
  const undone = await repos.undoCommit(a, head.slice(0, 10));
  assert.ok(undone.ok, undone.output);
  assert.notEqual(sh(a, 'rev-parse', 'HEAD'), head);
  assert.ok(undone.repo.files.some((f) => f.path === 'oops.txt'), 'its changes stay');
  await repos.discard(a, ['oops.txt']);
  assert.ok(!fs.existsSync(path.join(a, 'oops.txt')));
  await assert.rejects(repos.undoCommit(a, sh(a, 'rev-parse', 'HEAD')), /on the remote already/);
  const target = sh(a, 'log', '--format=%H', '--grep=Bea: another');
  const r = await repos.revert(a, target);
  assert.ok(r.ok, r.output);
  assert.equal(sh(a, 'log', '-1', '--format=%s'), 'Revert "Bea: another"');
  assert.ok(!fs.existsSync(path.join(a, 'bea2.txt')));
  // A file changed again since: the revert stops on it, and can be stopped.
  const clash = await repos.revert(a, sh(a, 'log', '--format=%H', '--grep=Docs: shipping'));
  assert.equal(clash.ok, false);
  assert.equal(clash.repo.op?.kind, 'revert');
  assert.equal(clash.repo.op?.stoppedAt?.subject, 'Docs: shipping');
  assert.deepEqual(clash.repo.op?.conflicts.map((c) => c.path), ['docs/ship.md']);
  const stop = await repos.abortOp(a);
  assert.ok(stop.ok, stop.output);
  assert.equal(stop.repo.op, null);
  assert.deepEqual(stop.repo.files, []);
});

await test('tags: tag a commit, with a message or without, and send tags up', async () => {
  const head = sh(a, 'rev-parse', 'HEAD');
  let r = await repos.tag(a, 'v1.1', head, 'The cart');
  assert.ok(r.ok, r.output);
  assert.equal(sh(a, 'cat-file', '-t', 'v1.1'), 'tag', 'with a message: an annotated tag');
  r = await repos.tag(a, 'light', head);
  assert.equal(sh(a, 'cat-file', '-t', 'light'), 'commit');
  await assert.rejects(repos.tag(a, '-d', head), /Not a valid tag name/);
  await assert.rejects(repos.tag(a, 'v 2', head), /Not a valid tag name/);
  r = await repos.pushTags(a, 'v1.1');
  assert.ok(r.ok, r.output);
  assert.equal(sh(remote, 'tag', '--list', 'v1.1'), 'v1.1');
  assert.equal(sh(remote, 'tag', '--list', 'light'), '', 'only the one asked');
  assert.equal(r.repo.tags, 3);
});

await test('stashes: put aside with new files or without, look inside, apply, apply and remove, drop', async () => {
  w(path.join(a, 'README.md'), '# Shop\n\nCarts, checkout and orders.\n');
  w(path.join(a, 'new.txt'), 'new\n');
  let r = await repos.stash(a, 'Half done', false);
  assert.ok(r.ok, r.output);
  assert.deepEqual(
    r.repo.files.map((f) => f.path),
    ['new.txt'],
    'without new files: the new file stays',
  );
  r = await repos.stash(a, 'The new file', true);
  assert.deepEqual(r.repo.files, []);
  assert.deepEqual(
    r.repo.stashes.map((s) => [s.ref, s.message, s.branch, s.files]),
    [
      ['stash@{0}', 'The new file', 'main', 1],
      ['stash@{1}', 'Half done', 'main', 1],
    ],
  );
  const show = await repos.stashShow(a, 'stash@{0}');
  assert.deepEqual(
    show.files.map((f) => [f.path, f.added]),
    [['new.txt', 1]],
  );
  assert.ok(show.files[0].diff.includes('+new'));
  r = await repos.stashAction(a, 'stash@{1}', 'apply');
  assert.equal(r.repo.stashes.length, 2, 'applied, kept');
  assert.ok(r.repo.files.some((f) => f.path === 'README.md'));
  r = await repos.stashAction(a, 'stash@{0}', 'pop');
  assert.equal(r.repo.stashes.length, 1, 'applied and removed');
  assert.ok(fs.existsSync(path.join(a, 'new.txt')));
  r = await repos.stashAction(a, 'stash@{0}', 'drop');
  assert.deepEqual(r.repo.stashes, []);
  await assert.rejects(repos.stashAction(a, 'HEAD', 'drop'), /Not a stash/);
  await repos.discard(a, ['README.md', 'new.txt']);
});

await test('put back one part of a file’s changes; ignore a file (and stop tracking one)', async () => {
  const lines = fs.readFileSync(path.join(a, 'src/total.ts'), 'utf8').split('\n');
  lines[0] = 'ONE';
  lines[11] = 'TWELVE';
  fs.writeFileSync(path.join(a, 'src/total.ts'), lines.join('\n'));
  const { diff } = await repos.fileDiff(a, 'src/total.ts');
  const hunks = diff.slice(diff.search(/^@@ /m)).split(/^(?=@@ )/m);
  assert.equal(hunks.length, 2, 'two parts');
  const r = await repos.discardHunk(a, 'src/total.ts', hunks[0]);
  assert.ok(r.ok, r.output);
  const now = fs.readFileSync(path.join(a, 'src/total.ts'), 'utf8');
  assert.ok(now.startsWith('one\n'), 'the first part went back');
  assert.ok(now.includes('TWELVE'), 'the second stays');
  await assert.rejects(repos.discardHunk(a, 'src/total.ts', hunks[0]), /changed since/);
  await repos.discard(a, ['src/total.ts']);

  w(path.join(a, 'debug.log'), 'noise\n');
  let ig = await repos.ignore(a, 'debug.log');
  assert.ok(ig.ok);
  assert.ok(fs.readFileSync(path.join(a, '.gitignore'), 'utf8').includes('/debug.log\n'));
  assert.ok(!ig.repo.files.some((f) => f.path === 'debug.log'));
  ig = await repos.ignore(a, 'notes.txt');
  assert.ok(ig.ok, ig.output);
  assert.ok(fs.existsSync(path.join(a, 'notes.txt')), 'the file stays on disk');
  assert.ok(ig.repo.files.some((f) => f.path === 'notes.txt' && f.code[0] === 'D'), 'to be taken out of the repository in the next commit');
  await assert.rejects(repos.ignore(a, '.git/config'), /Not a file to ignore/);
});

await test('clones: only https, ssh and git addresses, into a folder of its own; a clone that fails says so', async () => {
  for (const ok of ['https://github.com/acme/shop.git', 'ssh://git@github.com/acme/shop.git', 'git@github.com:acme/shop.git', 'git://example.com/shop.git', 'https://user:token@git.example.com:8443/acme/shop'])
    assert.ok(cloneUrlOk(ok), ok);
  for (const bad of ['/home/alex/shop', 'file:///etc', 'ext::sh -c touch% /tmp/pwned', '-uhelp', 'https://github.com', 'http://example.com/x.git', 'https://exa mple.com/x', 'fd::17', 'C:\\shop', 'git@github.com://x'])
    assert.ok(!cloneUrlOk(bad), bad);
  assert.equal(cloneName('https://github.com/acme/shop-api.git'), 'shop-api');
  assert.equal(cloneName('git@github.com:acme/blog'), 'blog');
  assert.equal(redactUrl('https://alex:s3cret@git.example.com/x.git'), 'https://alex:•••@git.example.com/x.git');
  assert.throws(() => repos.clone(remote, path.join(tmp, 'c1')), /https/);
  assert.throws(() => repos.clone('ext::sh -c id', path.join(tmp, 'c1')), /https/);
  assert.throws(() => repos.clone('https://example.com/x.git', a), /not empty/);
  assert.throws(() => repos.clone('https://example.com/x.git', 'relative'), /Where/);
  const job = repos.clone('https://127.0.0.1:9/nothing.git', path.join(tmp, 'c2'));
  assert.equal(job.state, 'running');
  for (let i = 0; i < 100 && repos.cloneJob(job.id).state === 'running'; i++) await new Promise((r) => setTimeout(r, 100));
  const end = repos.cloneJob(job.id);
  assert.equal(end.state, 'failed');
  assert.ok(end.output);
  assert.ok(!fs.existsSync(path.join(tmp, 'c2')), 'nothing left behind');
  assert.throws(() => repos.cloneJob('nope'), /No such clone/);
});

await test('remotes: add one, by a name and an address a clone would take', async () => {
  await assert.rejects(repos.addRemote(a, '-x', 'https://example.com/x.git'), /name/);
  await assert.rejects(repos.addRemote(a, 'backup', '/srv/backup.git'), /https/);
  const r = await repos.addRemote(a, 'backup', 'https://alex:tok@example.com/backup.git');
  assert.ok(r.ok, r.output);
  assert.deepEqual(
    r.repo.remotes.map((x) => [x.name, x.url]),
    [
      ['backup', 'https://alex:•••@example.com/backup.git'],
      ['origin', remote],
    ],
  );
  assert.equal(r.repo.remote, 'origin', 'origin stays the one to sync with');
});

repos.remove(a);
await assert.rejects(repos.detail(a), /Not a repository/);
db.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed`);
