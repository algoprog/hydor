// Script tests for how far an update from git has got (server/update-progress.ts): the three parsers on lines as git, npm
// and the web build print them, the tracker that turns them into the share and time left the pages show (with the
// guesses when nothing is kept), and the streamed commands that carry the lines (a real git pull). Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/update-progress-test.ts
//   DATA_DIR=/tmp/hydor-test-update-progress node dist/dev/update-progress-test.js
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const { addedPackages, buildLine, DEFAULT_MODULES, dueToTell, Lines, lockPackages, npmPackage, pullShare, tookOf, UpdateTracker } = await import('./update-progress.ts');
const { runStreamed } = await import('./stream-run.ts');
const { gitStream } = await import('./git.ts');
const { planOf } = await import('../shared/update-progress.ts');

let passed = 0;
const test = async (name: string, fn: () => void | Promise<void>) => {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
};
const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b}`);
const lines = (text: string) => {
  const out: string[] = [];
  const l = new Lines();
  l.push(text, (x) => out.push(x));
  l.flush((x) => out.push(x));
  return out;
};

await test('git: receiving objects is 80% of the pull and resolving deltas the rest, from \\r-separated progress', () => {
  const chunk =
    'remote: Enumerating objects: 1203, done.\nremote: Counting objects: 100% (1203/1203), done.\n' +
    'Receiving objects:   0% (1/1203)\rReceiving objects:  45% (542/1203), 1.20 MiB | 2.00 MiB/s\rReceiving objects: 100% (1203/1203), 3.4 MiB | 2.10 MiB/s, done.\n' +
    'Resolving deltas:   0% (0/700)\rResolving deltas:  30% (210/700)\rResolving deltas: 100% (700/700), done.\n';
  const shares = lines(chunk).map(pullShare);
  assert.deepEqual(shares.map((s) => s != null), [false, false, true, true, true, true, true, true]);
  near(shares[2]!, 0.8 * 0.0);
  near(shares[3]!, 0.8 * 0.45);
  near(shares[4]!, 0.8);
  near(shares[5]!, 0.8);
  near(shares[6]!, 0.8 + 0.2 * 0.3);
  near(shares[7]!, 1);
  assert.equal(pullShare('Updating a1b2c3d..e4f5a6b'), null);
  assert.equal(pullShare('Receiving objects: 250%'), 0.8, 'nonsense is held at the end');
});

await test('lines split at \\r and \\n, and a line cut between two pieces is joined', () => {
  const out: string[] = [];
  const l = new Lines();
  l.push('Receiving objects:  1', (x) => out.push(x));
  l.push('0%\rReceiving objects: 2', (x) => out.push(x));
  l.push('0%\r\n\nlast', (x) => out.push(x));
  assert.deepEqual(out, ['Receiving objects:  10%', 'Receiving objects: 20%']);
  l.flush((x) => out.push(x));
  assert.equal(out[2], 'last');
});

await test('npm: a package is counted once, whether it was fetched and then read from the cache, or only read', () => {
  const miss = 'npm http fetch GET 200 https://registry.npmjs.org/unist-util-position/-/unist-util-position-5.0.0.tgz 389ms (cache miss)';
  const then = 'npm http cache unist-util-position@https://registry.npmjs.org/unist-util-position/-/unist-util-position-5.0.0.tgz 0ms (cache hit)';
  const hit = 'npm http cache zwitch@https://registry.npmjs.org/zwitch/-/zwitch-2.0.4.tgz 0ms (cache hit)';
  const scoped = 'npm http cache @antfu/install-pkg@https://registry.npmjs.org/@antfu/install-pkg/-/install-pkg-2.1.0.tgz 0ms (cache hit)';
  assert.equal(npmPackage(miss), npmPackage(then));
  assert.equal(npmPackage(hit), 'https://registry.npmjs.org/zwitch/-/zwitch-2.0.4.tgz');
  assert.equal(npmPackage(scoped), 'https://registry.npmjs.org/@antfu/install-pkg/-/install-pkg-2.1.0.tgz');
  assert.equal(npmPackage('npm http fetch GET 200 https://registry.npmjs.org/npm 547ms'), null, 'the registry asked about npm itself');
  assert.equal(npmPackage('npm notice New major version of npm available! 10.9.8 -> 11.0.0'), null);
  assert.equal(npmPackage('added 537 packages in 4s'), null);
});

await test('npm: how many packages the last install added, and how many a lock file will install', () => {
  assert.equal(addedPackages('\nadded 537 packages in 4s\n'), 537);
  assert.equal(addedPackages('added 1 package in 1s'), 1);
  assert.equal(addedPackages('up to date in 1s'), null);
  const lock = JSON.stringify({
    packages: {
      '': { name: 'hydor' },
      'node_modules/a': {},
      'node_modules/b': { optional: true },
      'node_modules/c': { dev: true },
      'node_modules/d': { link: true },
      'node_modules/a/node_modules/e': {},
      'packages/x': {},
    },
  });
  assert.equal(lockPackages(lock), 3);
  assert.equal(lockPackages('not json'), null);
  assert.equal(lockPackages('{}'), null);
});

await test('build: modules read, all read, files written, and the web part starting', () => {
  assert.deepEqual(buildLine('hydor-build-progress 300'), { modules: 300 });
  assert.deepEqual(buildLine('hydor-build-progress done 5339'), { done: 5339 });
  assert.deepEqual(buildLine('hydor-build-progress written'), { written: true });
  assert.deepEqual(buildLine('> hydor@0.98.0 build:web'), { web: true });
  assert.deepEqual(buildLine('> @scope/hydor@0.98.0 build:web'), { web: true });
  assert.equal(buildLine('> hydor@0.98.0 build:server'), null);
  assert.equal(buildLine('✓ 5340 modules transformed.'), null);
  assert.equal(buildLine('vite v8.0.0 building for production...'), null);
});

await test('what was kept: only sound numbers', () => {
  assert.deepEqual(tookOf(JSON.stringify({ pull: 4000, install: 60000, build: 80000, packages: 537, modules: 5339 })), { pull: 4000, install: 60000, build: 80000, packages: 537, modules: 5339 });
  assert.deepEqual(tookOf(JSON.stringify({ pull: 'x', build: -1, install: 7 })), { install: 7 });
  assert.deepEqual(tookOf('{{'), {});
  assert.deepEqual(tookOf(undefined), {});
});

await test('telling the pages: not within 500 ms, when it moved 0.005 or the step or slowness changed, and at least every 2 s', () => {
  const last = { at: 10_000, share: 0.3, step: 2, steps: 3, slow: false };
  const p = { share: 0.3, step: 2, steps: 3 };
  assert.equal(dueToTell(null, p, 0), true, 'the first');
  assert.equal(dueToTell(last, { ...p, share: 0.9 }, 10_400), false, 'too soon, however far it moved');
  assert.equal(dueToTell(last, p, 10_600), false, 'nothing moved');
  assert.equal(dueToTell(last, { ...p, share: 0.303 }, 10_600), false, 'moved too little');
  assert.equal(dueToTell(last, { ...p, share: 0.306 }, 10_600), true);
  assert.equal(dueToTell(last, { ...p, step: 3 }, 10_600), true);
  assert.equal(dueToTell(last, { ...p, steps: 2 }, 10_600), true, 'the plan changed');
  assert.equal(dueToTell(last, { ...p, slow: true }, 10_600), true);
  assert.equal(dueToTell(last, p, 12_000), true, 'every 2 s so that the time left stays fresh');
});

await test('a tracker with nothing kept: the guesses, and the clock alone while the output says nothing', () => {
  const T = 1_000_000;
  const t = new UpdateTracker(planOf(false, true), {}, T);
  const a = t.view(T);
  assert.deepEqual([a.share, a.step, a.steps, a.left], [0, 1, 3, 175_000]);
  t.begin('build', T + 10_000);
  const b = t.view(T + 10_000);
  near(b.share, 10 / 175);
  assert.equal(b.left, 165_000);
  const c = t.view(T + 10_000 + 75_000);
  near(c.share, (10_000 + 75_000) / 175_000);
  assert.equal(c.left, 75_000 + 15_000);
  const slow = t.view(T + 10_000 + 250_000);
  assert.equal(slow.slow, true);
  assert.equal(slow.left, undefined);
  assert.ok(slow.share < 0.99);
});

await test('the pull: git\'s percentage is the step\'s share, and the time left follows its rate', () => {
  const T = 0;
  const t = new UpdateTracker(planOf(false, true), {}, T);
  t.line('Receiving objects:  40% (40/100)', T + 2_000);
  const v = t.view(T + 4_000);
  near(v.share, (0.8 * 0.4 * 10_000) / 175_000);
  // 4 s for 32% of the step: 8.5 s more of the pull, then build and restart
  near(v.left!, (4_000 * 0.68) / 0.32 + 165_000, 1);
  assert.equal(v.slow, undefined);
  // Quiet for long, it is not "slow": git's own percentage says where it is.
  t.line('Resolving deltas:  50% (5/10)', T + 60_000);
  assert.equal(t.view(T + 60_000).slow, undefined);
});

await test('the install: packages counted against the last install, a tail by the clock, and the steps after', () => {
  const T = 0;
  const t = new UpdateTracker(planOf(true, true), { install: 60_000, packages: 500, pull: 5_000, build: 40_000 }, T);
  t.expectPackages(999);
  t.begin('install', T + 5_000);
  assert.equal(t.view(T + 5_000).step, 2);
  for (let i = 0; i < 250; i++) t.line(`npm http cache pkg${i}@https://registry.npmjs.org/pkg${i}/-/pkg${i}-1.0.0.tgz 0ms (cache hit)`, T + 5_000 + i * 100);
  // The same packages said twice (fetched, then read from the cache) count once.
  for (let i = 0; i < 250; i++) t.line(`npm http fetch GET 200 https://registry.npmjs.org/pkg${i}/-/pkg${i}-1.0.0.tgz 30ms (cache miss)`, T + 30_000);
  const v = t.view(T + 30_000);
  const total = 5_000 + 60_000 + 40_000 + 15_000;
  near(v.share, (5_000 + 60_000 * 0.45) / total, 1e-9);
  // 25 s so far for half of the fetching: 25 s more, a tail of 6 s (a tenth of the step), the build and the restart
  near(v.left!, 25_000 + 6_000 + 40_000 + 15_000, 1);
  for (let i = 250; i < 520; i++) t.line(`npm http cache pkg${i}@https://registry.npmjs.org/pkg${i}/-/pkg${i}-1.0.0.tgz 0ms (cache hit)`, T + 50_000);
  const w = t.view(T + 50_000);
  near(w.share, (5_000 + 60_000 * 0.9 + 0 * 1) / total + (60_000 * 0.08 * 0) / total, 0.02);
  const later = t.view(T + 50_000 + 3_000);
  assert.ok(later.share > w.share, 'the tail moves by the clock');
  assert.ok(later.share < (5_000 + 60_000 * 0.98) / total + 1e-9, 'not past 0.98 of the step');
  assert.equal(later.slow, undefined);
  assert.deepEqual(t.counts(500), { packages: 500 });
});

await test('the install without a count to go by (a quiet npm): the clock', () => {
  const t = new UpdateTracker(planOf(true, false), {}, 0);
  t.begin('install', 10_000);
  const v = t.view(10_000 + 45_000);
  near(v.share, (10_000 + 45_000) / 250_000);
  assert.equal(v.steps, 3);
  // A lock file's count stands in for the last install's when there was none.
  const u = new UpdateTracker(planOf(true, false), {}, 0);
  u.expectPackages(400);
  u.begin('install', 0);
  for (let i = 0; i < 100; i++) u.line(`npm http cache p${i}@https://r/p${i}/-/p${i}-1.tgz 0ms (cache hit)`, 1000);
  near(u.view(1000).share, (10_000 + 90_000 * 0.9 * 0.25) / 250_000);
});

await test('the build: the clock until the plugin speaks, then modules against the last build\'s count, then the tail', () => {
  const T = 0;
  const t = new UpdateTracker(planOf(false, true), { build: 100_000, pull: 5_000, modules: 4000 }, T);
  t.begin('build', 5_000);
  t.line('> hydor@0.98.0 build:server', 6_000);
  const quiet = new UpdateTracker(planOf(false, true), { build: 100_000, pull: 5_000, modules: 4000 }, T);
  quiet.begin('build', 5_000);
  near(quiet.view(5_000 + 50_000).share, (5_000 + 50_000) / 120_000, 1e-9);
  t.line('> hydor@0.98.0 build:web', 20_000);
  t.line('hydor-build-progress 1000', 25_000);
  const a = t.view(25_000);
  const total = 5_000 + 100_000 + 15_000;
  near(a.share, (5_000 + 100_000 * (0.1 + 0.75 * 0.25)) / total, 1e-9);
  // 5 s on the web part for a quarter of its modules: 15 s more, then the tail of 15% of the build, then the restart
  near(a.left!, 15_000 + 15_000 + 15_000, 1);
  t.line('hydor-build-progress 2000', 30_000);
  assert.ok(t.view(30_000).share > a.share);
  t.line('hydor-build-progress 3900', 40_000);
  t.line('hydor-build-progress 4100', 41_000);
  assert.ok(t.view(41_000).share < (5_000 + 100_000 * 0.85) / total, 'more modules than last time: held before the end of the module part');
  t.line('hydor-build-progress done 4150', 42_000);
  near(t.view(42_000).share, (5_000 + 100_000 * 0.85) / total, 1e-9);
  const at42 = t.view(42_000).share;
  assert.ok(t.view(46_000).share > at42);
  t.line('hydor-build-progress written', 50_000);
  near(t.view(50_000).share, (5_000 + 100_000 * 0.99) / total, 1e-9);
  assert.deepEqual(t.counts(null), { modules: 4150 });
  const took = t.times(51_000);
  assert.equal(took.build, 46_000);
});

await test('the build with no modules count kept: the measured default', () => {
  assert.equal(DEFAULT_MODULES, 5300);
  const t = new UpdateTracker(planOf(false, false), {}, 0);
  t.begin('build', 10_000);
  t.line('hydor-build-progress 2650', 40_000);
  near(t.view(40_000).share, (10_000 + 150_000 * (0.1 + 0.75 * (2650 / 5300))) / 160_000, 1e-9);
});

await test('the share never goes back, even when the steps are planned again', () => {
  const t = new UpdateTracker(planOf(true, true), {}, 0);
  t.begin('build', 100_000);
  const a = t.view(100_000 + 60_000);
  t.setPlan(planOf(false, true));
  assert.ok(t.view(100_000 + 60_001).share >= a.share);
  assert.equal(t.view(100_000 + 60_001).steps, 3);
  // Output that makes no sense changes nothing.
  assert.doesNotThrow(() => t.line('hydor-build-progress 99999999999999999999', 160_000));
  assert.ok(t.view(160_000).share <= 0.99);
});

await test('streamed commands end as execFile ends them: by their exit code, with both streams kept, and a timeout stops them', async () => {
  const env = { PATH: process.env.PATH ?? '' };
  const heard: string[] = [];
  const ok = await runStreamed(process.execPath, ['-e', 'console.log("a\\nb"); console.error("c\\rd")'], { cwd: os.tmpdir(), env, timeout: 10_000, onData: (t, s) => heard.push(`${s}:${t}`) });
  assert.deepEqual([ok.ok, ok.out.trim(), ok.err.trim()], [true, 'a\nb', 'c\rd']);
  assert.ok(heard.some((h) => h.startsWith('out:')) && heard.some((h) => h.startsWith('err:')));
  const bad = await runStreamed(process.execPath, ['-e', 'console.error("npm error nope"); process.exit(3)'], { cwd: os.tmpdir(), env, timeout: 10_000 });
  assert.deepEqual([bad.ok, bad.err.trim()], [false, 'npm error nope']);
  const thrown = await runStreamed(process.execPath, ['-e', 'console.log("x")'], {
    cwd: os.tmpdir(),
    env,
    timeout: 10_000,
    onData: () => {
      throw new Error('a bad reader');
    },
  });
  assert.equal(thrown.ok, true, 'a reader that throws does not fail the step');
  const missing = await runStreamed('hydor-no-such-command', [], { cwd: os.tmpdir(), env, timeout: 10_000 });
  assert.equal(missing.ok, false);
  const t0 = Date.now();
  const slow = await runStreamed(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { cwd: os.tmpdir(), env, timeout: 300 });
  assert.equal(slow.ok, false);
  assert.ok(Date.now() - t0 < 5000);
});

await test('a real pull, streamed: progress comes through, the pull still works, and its error text has no progress in it', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-test-update-progress-git-'));
  try {
    const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd, stdio: 'pipe', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' } });
    const origin = path.join(dir, 'origin');
    fs.mkdirSync(origin);
    git(origin, 'init', '-q', '-b', 'main');
    fs.writeFileSync(path.join(origin, 'a.txt'), 'one\n');
    git(origin, 'add', '.');
    git(origin, 'commit', '-q', '-m', 'one');
    const copy = path.join(dir, 'copy');
    git(dir, 'clone', '-q', `file://${origin}`, copy);
    // Enough objects for git to show progress (it keeps quiet for a small pull).
    for (let i = 0; i < 2500; i++) fs.writeFileSync(path.join(origin, `f${i}.txt`), `${i}\n${randomBytes(1500).toString('base64')}\n`);
    git(origin, 'add', '.');
    git(origin, 'commit', '-q', '-m', 'two');
    const seen: number[] = [];
    const l = new Lines();
    const r = await gitStream(copy, ['pull', '--ff-only', '--progress'], 60_000, (text, stream) => {
      if (stream === 'err') l.push(text, (line) => void (pullShare(line) != null && seen.push(pullShare(line)!)));
    });
    assert.equal(r.ok, true, r.err);
    assert.ok(fs.existsSync(path.join(copy, 'f2499.txt')));
    assert.ok(seen.length > 0, 'git printed progress');
    assert.ok(seen.every((s, i) => i === 0 || s >= seen[i - 1]!), 'it only goes forward');
    assert.ok(seen[seen.length - 1]! >= 0.8, 'ends with the objects in');
    assert.ok(!r.err.includes('\r'));
    // A pull that cannot go ahead says why, in plain lines.
    fs.writeFileSync(path.join(origin, 'a.txt'), 'two\n');
    git(origin, 'commit', '-q', '-am', 'three');
    fs.writeFileSync(path.join(copy, 'a.txt'), 'mine\n');
    git(copy, 'commit', '-q', '-am', 'mine');
    const bad = await gitStream(copy, ['pull', '--ff-only', '--progress'], 60_000, () => {});
    assert.equal(bad.ok, false);
    assert.match(bad.err, /fast-forward/i);
    assert.ok(!bad.err.includes('\r'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

console.log(`${passed} passed`);
