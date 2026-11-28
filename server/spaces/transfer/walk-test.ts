// Script tests for walking a folder for a bundle: what stays out and why (rebuilt folders, a Python environment,
// .DS_Store, special files, links that are absolute or lead out, a .git file against a .git folder, names that cannot
// travel), the copy and sync variants (a sync leaves out .git and what Git ignores), sizes. Build and run with a scratch folder:
//   OUTDIR=dist/dev-engine node scripts/build-server.mjs server/spaces/transfer/walk-test.ts
//   HOME=/tmp/eng-home DATA_DIR=/tmp/eng-data node dist/dev-engine/walk-test.js
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { walk } from './walk.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-walk-test-')));
let passed = 0;
const tests: [string, () => Promise<void>][] = [];
const test = (name: string, fn: () => Promise<void>) => tests.push([name, fn]);
const put = (root: string, rel: string, text = 'x') => {
  const f = path.join(root, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
};

const root = path.join(tmp, 'proj');
fs.mkdirSync(root);
put(root, 'a.txt', 'hello');
put(root, 'src/b.ts', 'bbbb');
put(root, 'src/deep/c.md', 'c');
fs.mkdirSync(path.join(root, 'empty'));
put(root, 'node_modules/pkg/index.js', 'x'.repeat(100));
put(root, 'node_modules/pkg/more.js', 'x'.repeat(50));
put(root, 'src/__pycache__/x.pyc', 'xx');
put(root, '.next/cache/y', 'y');
put(root, 'venv/pyvenv.cfg', 'home = /usr');
put(root, 'venv/lib/z.py', 'zzz');
put(root, 'notvenv/other.txt', 'ok');
put(root, '.DS_Store', 'junk');
put(root, 'src/Thumbs.db', 'junk');
put(root, '.hydor-arriving-abc/x', 'temp');
put(root, '.hydor-sync-abc', 'temp');
put(root, '.git/HEAD', 'ref: refs/heads/main');
put(root, '.git/objects/ab', 'obj');
fs.symlinkSync('a.txt', path.join(root, 'ln-in'));
fs.symlinkSync('../src/b.ts', path.join(root, 'empty', 'ln-up-in'));
fs.symlinkSync('/etc/passwd', path.join(root, 'ln-abs'));
fs.symlinkSync('../outside.txt', path.join(root, 'ln-out'));
fs.symlinkSync('../../nowhere', path.join(root, 'src', 'ln-out2'));
// A sub-project that is a worktree: its .git is a file.
put(root, 'wt/.git', 'gitdir: /somewhere/else/.git/worktrees/wt');
put(root, 'wt/file.txt', 'in a worktree');
// A name that cannot travel.
put(root, 'back\\slash.txt', 'bs');
// A socket.
const sock = path.join(root, 's.sock');
const srv = net.createServer();
await new Promise<void>((r) => srv.listen(sock, r));
try {
  execFileSync('mkfifo', [path.join(root, 'fifo')]);
} catch {}

test('a copy lists what goes, with sizes, folders and links; and what is left out with why', async () => {
  const w = await walk(root);
  const paths = w.files.map((f) => f.path);
  assert.deepEqual(
    paths,
    ['.git/HEAD', '.git/objects/ab', 'a.txt', 'notvenv/other.txt', 'src/b.ts', 'src/deep/c.md', 'wt/file.txt'],
    'sorted, with .git',
  );
  assert.equal(w.git, true);
  assert.equal(w.files.find((f) => f.path === 'a.txt')!.size, 5);
  assert.equal(w.totals.files, 7);
  assert.equal(w.totals.bytes, 20 + 3 + 5 + 2 + 4 + 1 + 13);
});

test('sizes add up to the files listed', async () => {
  const w = await walk(root);
  assert.equal(
    w.totals.bytes,
    w.files.reduce((n, f) => n + f.size, 0),
  );
  assert.equal(w.totals.files, w.files.length);
  assert.ok(w.files.every((f) => typeof f.mtime === 'number' && f.mtime > 0 && f.mode > 0));
});

test('rebuilt folders, a Python environment, .DS_Store and Thumbs.db are left out with their size', async () => {
  const w = await walk(root);
  const by = Object.fromEntries(w.leftOut.map((l) => [l.path, l]));
  assert.deepEqual(by['node_modules'], { path: 'node_modules', files: 2, bytes: 150, why: 'rebuilt' });
  assert.equal(by['src/__pycache__'].why, 'rebuilt');
  assert.equal(by['.next'].why, 'rebuilt');
  assert.deepEqual(by['venv'], { path: 'venv', files: 2, bytes: 14, why: 'rebuilt' });
  assert.equal(by['.DS_Store'].why, 'rebuilt');
  assert.equal(by['src/Thumbs.db'].why, 'rebuilt');
  assert.ok(!('notvenv' in by), 'a folder without pyvenv.cfg is carried');
  // Largest first.
  const sizes = w.leftOut.map((l) => l.bytes);
  assert.deepEqual(sizes, [...sizes].sort((a, b) => b - a));
});

test('without leaving out, rebuilt folders go (and special files and bad links still do not)', async () => {
  const w = await walk(root, { leaveOut: false });
  const paths = w.files.map((f) => f.path);
  assert.ok(paths.includes('node_modules/pkg/index.js'));
  assert.ok(paths.includes('venv/pyvenv.cfg'));
  assert.ok(paths.includes('.DS_Store'));
  assert.ok(!w.leftOut.some((l) => l.why === 'rebuilt'));
  assert.ok(w.leftOut.some((l) => l.path === 's.sock' && l.why === 'special'));
});

test('special files, links that are absolute or lead out, and worktree pointers are always out', async () => {
  const w = await walk(root);
  const by = Object.fromEntries(w.leftOut.map((l) => [l.path, l.why]));
  assert.equal(by['s.sock'], 'special');
  if (fs.lstatSync(path.join(root, 'fifo'), { throwIfNoEntry: false })) assert.equal(by['fifo'], 'special');
  assert.equal(by['ln-abs'], 'link');
  assert.equal(by['ln-out'], 'link');
  assert.equal(by['src/ln-out2'], 'link');
  assert.equal(by['wt/.git'], 'worktree');
  assert.equal(by['back\\slash.txt'], 'name');
  // Hydor's own temporary names are not listed at all.
  assert.ok(!w.leftOut.some((l) => l.path.includes('.hydor-')) && !w.files.some((f) => f.path.includes('.hydor-')));
  // node_modules 2, __pycache__ 1, .next 1, venv 2, .DS_Store 1, Thumbs.db 1, the socket, the FIFO, three links, the worktree pointer, the name.
  assert.equal(w.leftOutTotal.files, 2 + 1 + 1 + 2 + 1 + 1 + 1 + (fs.existsSync(path.join(root, 'fifo')) ? 1 : 0) + 3 + 1 + 1, 'leftOutTotal sums everything');
});

test('links that stay inside are carried as links (relative, with / between parts)', async () => {
  const w = await walk(root);
  assert.deepEqual(w.links, [
    { path: 'empty/ln-up-in', target: '../src/b.ts' },
    { path: 'ln-in', target: 'a.txt' },
  ]);
});

test('a .git folder goes with a copy, a .git file (a worktree) does not', async () => {
  const w = await walk(root);
  assert.ok(w.files.some((f) => f.path === '.git/HEAD'));
  assert.ok(!w.files.some((f) => f.path === 'wt/.git'));
  assert.ok(w.files.some((f) => f.path === 'wt/file.txt'));
  assert.ok(w.dirs.some((d) => d.path === 'empty'), 'empty folders are listed');
  assert.ok(w.dirs.some((d) => d.path === '.git'));
});

test('skipped folders (another area has them) are not listed and not counted as left out', async () => {
  const w = await walk(root, { skip: ['src/deep'] });
  assert.ok(!w.files.some((f) => f.path.startsWith('src/deep')));
  assert.ok(!w.leftOut.some((l) => l.path.startsWith('src/deep')));
});

test('a sync leaves out .git; in a Git repository it leaves out what Git ignores too', async () => {
  // Plain folder, no repository: the plain walk without .git.
  const plain = await walk(root, { mode: 'sync' });
  assert.ok(!plain.files.some((f) => f.path.startsWith('.git/')));
  assert.ok(plain.files.some((f) => f.path === 'a.txt'));
  assert.equal(plain.git, false);

  const repo = path.join(tmp, 'repo');
  fs.mkdirSync(repo);
  const run = (...a: string[]) => execFileSync('git', a, { cwd: repo, stdio: 'ignore', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  run('init', '-q');
  put(repo, '.gitignore', 'build/\n*.log\n');
  put(repo, 'main.py', 'print(1)');
  put(repo, 'build/out.bin', 'binary');
  put(repo, 'run.log', 'log');
  put(repo, 'notes/idea.md', 'new, untracked, not ignored');
  put(repo, 'tracked.txt', 'tracked');
  run('add', 'main.py', 'tracked.txt', '.gitignore');
  run('commit', '-q', '-m', 'one');
  fs.rmSync(path.join(repo, 'tracked.txt'));
  // A nested repository (untracked): walked with the plain rules.
  put(repo, 'nested/.git/HEAD', 'ref');
  put(repo, 'nested/code.js', 'js');
  put(repo, 'nested/node_modules/n.js', 'n');
  // A Python environment Git does not ignore (no .gitignore line for it), at the top and deeper: left out all the same.
  put(repo, '.venv/pyvenv.cfg', 'home = /usr/bin');
  put(repo, '.venv/lib/site.py', 'x');
  put(repo, 'tools/env/pyvenv.cfg', 'home = /usr/bin');
  put(repo, 'tools/env/bin/python', 'x');
  const w = await walk(repo, { mode: 'sync' });
  assert.deepEqual(
    w.files.map((f) => f.path),
    ['.gitignore', 'main.py', 'nested/code.js', 'notes/idea.md'],
  );
  assert.ok(!w.files.some((f) => f.path.includes('.git/')), 'no .git');
  // A copy of the same folder carries everything but rebuilt folders, history included.
  const c = await walk(repo);
  assert.ok(c.files.some((f) => f.path === 'build/out.bin') && c.files.some((f) => f.path === 'run.log'));
  assert.ok(c.files.some((f) => f.path.startsWith('.git/')));
  assert.equal(c.git, true);
});

test('a sync refuses a folder with too many files', async () => {
  const many = path.join(tmp, 'many');
  fs.mkdirSync(many);
  for (let i = 0; i < 30; i++) fs.writeFileSync(path.join(many, `f${i}`), '');
  await assert.rejects(walk(many, { mode: 'sync', maxFiles: 10 }), /too many to keep in step/);
  assert.equal((await walk(many, { maxFiles: 100 })).files.length, 30);
});

test('a symbolic link to a folder is listed as the link and never followed (inside, outside, and in a sync of a repository)', async () => {
  const base = path.join(tmp, 'linked');
  const outside = path.join(tmp, 'linked-outside');
  put(outside, 'secret.txt', 'outside the project');
  put(base, 'real/inner.txt', 'inside');
  fs.symlinkSync('real', path.join(base, 'to-real'));
  fs.symlinkSync(outside, path.join(base, 'to-outside'));
  fs.symlinkSync('../linked-outside', path.join(base, 'to-outside-rel'));
  for (const rules of [{}, { leaveOut: false }, { mode: 'sync' as const }]) {
    const w = await walk(base, rules);
    assert.deepEqual(w.files.map((f) => f.path), ['real/inner.txt']);
    assert.deepEqual(w.links, [{ path: 'to-real', target: 'real' }]);
    assert.deepEqual(w.leftOut.map((l) => [l.path, l.why]).sort(), [['to-outside', 'link'], ['to-outside-rel', 'link']]);
    assert.ok(!w.dirs.some((x) => x.path.startsWith('to-')));
  }
  // The same in a Git repository's sync.
  const run = (...a: string[]) => execFileSync('git', a, { cwd: base, stdio: 'ignore', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  run('init', '-q');
  run('add', '.');
  run('commit', '-q', '-m', 'x');
  const w = await walk(base, { mode: 'sync' });
  assert.deepEqual(w.files.map((f) => f.path), ['real/inner.txt']);
  assert.ok(!w.files.some((f) => f.path.includes('secret')));
});

test('a file is not a folder', async () => {
  await assert.rejects(walk(path.join(root, 'a.txt')), /not a folder|ENOTDIR/);
  await assert.rejects(walk(path.join(root, 'missing')), /ENOENT/);
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n`, e);
    fs.rmSync(tmp, { recursive: true, force: true });
    process.exit(1);
  }
}
srv.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed}/${tests.length} walk tests passed`);
