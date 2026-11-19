// Script tests for how far an update has got (shared/update-progress.ts): the guesses when nothing is kept, the curve of
// a step measured by the clock, the whole update's share and time left, and what a page makes of a machine that sends none.
// Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs shared/update-progress-test.ts
//   DATA_DIR=/tmp/hydor-test-update-progress-shared node dist/dev/update-progress-test.js
import assert from 'node:assert/strict';
import { combine, estimate, estimateRemote, expectedOf, GUESS, isSlow, newRemoteRun, planOf, timeLeft, timeShare } from './update-progress.ts';

let passed = 0;
const test = (name: string, fn: () => void) => {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
};
const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b}`);

test('nothing kept: the guesses are 10 s to pull, 90 s to install, 150 s to build, 15 s to restart', () => {
  assert.deepEqual(expectedOf(), { pull: 10_000, install: 90_000, build: 150_000, restart: 15_000 });
  assert.deepEqual(expectedOf(null), GUESS);
  assert.deepEqual(expectedOf({}), GUESS);
  assert.equal(expectedOf({ build: 40_000 }).build, 40_000, 'what the last build took');
  assert.equal(expectedOf({ build: 40_000 }).install, 90_000, 'the rest still guessed');
  assert.equal(expectedOf({ build: -5, install: NaN, pull: 0 }).build, GUESS.build, 'nonsense is not kept');
});

test('the steps: installing only when packages changed, restarting only when the server can', () => {
  assert.deepEqual(planOf(true, true), ['pull', 'install', 'build', 'restart']);
  assert.deepEqual(planOf(false, true), ['pull', 'build', 'restart']);
  assert.deepEqual(planOf(false, false), ['pull', 'build']);
});

test('the clock curve: in step with it to 90% of the expected time, then slower, never still and never at the end', () => {
  const E = 100_000;
  assert.equal(timeShare(0, E), 0);
  near(timeShare(45_000, E), 0.45);
  near(timeShare(90_000, E), 0.9);
  near(timeShare(100_000, E), 0.95);
  assert.ok(timeShare(100_000, E) > timeShare(90_000, E));
  let last = 0.9;
  for (const t of [95, 100, 120, 150, 300, 1000, 10_000].map((s) => s * 1000)) {
    const s = timeShare(t, E);
    assert.ok(s > last, `moves at ${t}`);
    assert.ok(s < 1, `not done at ${t}`);
    last = s;
  }
  // The slope is the same each side of the knee: no jump in speed.
  near(timeShare(90_001, E) - timeShare(90_000, E), 1 / E, 1e-8);
  assert.equal(timeShare(-5, E), 0);
  assert.equal(timeShare(5, 0), 0);
});

test('left of a step by the clock is what its share leaves; slow after 1.5 times the expected time', () => {
  near(timeLeft(0, 60_000), 60_000);
  near(timeLeft(30_000, 60_000), 30_000);
  assert.ok(timeLeft(70_000, 60_000) < 5_000);
  assert.equal(isSlow(89_000, 60_000), false);
  assert.equal(isSlow(91_000, 60_000), true);
});

test('the whole update: finished steps count in full, the share goes by expected time, left adds the steps to come', () => {
  const plan = planOf(true, true);
  const exp = expectedOf();
  const total = 10_000 + 90_000 + 150_000 + 15_000;
  const a = combine(plan, exp, 'pull', 0, 10_000);
  assert.deepEqual([a.share, a.step, a.steps, a.left], [0, 1, 4, 265_000]);
  const b = combine(plan, exp, 'install', 0.5, 45_000);
  near(b.share, (10_000 + 45_000) / total);
  assert.deepEqual([b.step, b.steps], [2, 4]);
  assert.equal(b.left, 45_000 + 150_000 + 15_000);
  const c = combine(plan, exp, 'build', 0.5, 75_000);
  near(c.share, (100_000 + 75_000) / total);
  assert.equal(c.left, 75_000 + 15_000);
  assert.equal(c.slow, undefined);
});

test('the share stays under 0.99 until the restart, and under 1 in it', () => {
  const plan = planOf(false, true);
  near(combine(plan, expectedOf(), 'build', 1, 0).share, 160_000 / 175_000);
  assert.ok(combine(plan, expectedOf(), 'build', 1, 0).share < 0.99, 'the restart still to come');
  assert.equal(combine(planOf(false, false), expectedOf(), 'build', 1, 0).share, 0.99, 'no restart: the build is the end');
  assert.ok(combine(plan, expectedOf(), 'restart', 1, 0).share < 1);
});

test('a slow step has no time left, and the update none either', () => {
  const p = estimate(planOf(false, true), expectedOf(), 'build', 300_000);
  assert.equal(p.slow, true);
  assert.equal(p.left, undefined);
  assert.ok(p.share > 0.9 * 0.5 && p.share < 0.99);
  const q = estimate(planOf(false, true), expectedOf(), 'build', 100_000);
  assert.equal(q.slow, undefined);
  assert.ok(q.left! > 60_000 && q.left! < 70_000);
});

test('what was kept sets the weights: a quick build on this machine counts for little', () => {
  const exp = expectedOf({ build: 20_000, install: 30_000, pull: 5_000 });
  const p = combine(planOf(true, true), exp, 'build', 0, 20_000);
  near(p.share, 35_000 / 70_000);
  assert.equal(p.left, 35_000);
});

test('a machine that sends nothing: the phase and when it began make the estimate, and it never goes back', () => {
  const mem = newRemoteRun();
  const T = 1_000_000;
  const a = estimateRemote(mem, { phase: 'pull', since: T }, true, T + 2_000)!;
  assert.deepEqual([a.step, a.steps], [1, 3], 'install not counted until it is seen');
  const b = estimateRemote(mem, { phase: 'install', since: T + 8_000 }, true, T + 40_000)!;
  assert.deepEqual([b.step, b.steps], [2, 4], 'it is seen now');
  assert.ok(b.share > a.share);
  assert.ok(b.left! > 0);
  const c = estimateRemote(mem, { phase: 'build', since: T + 100_000 }, true, T + 100_000)!;
  assert.deepEqual([c.step, c.steps], [3, 4]);
  assert.ok(c.share >= b.share);
  // Without installing it would have stood further back: held where it was.
  const mem2 = newRemoteRun();
  const x = estimateRemote(mem2, { phase: 'build', since: T }, true, T + 100_000)!;
  const y = estimateRemote(mem2, { phase: 'build', since: T }, true, T + 100_001)!;
  assert.ok(y.share >= x.share);
  assert.equal(estimateRemote(mem, { phase: 'download', since: T }, true, T), null, 'a download is not a step');
  assert.equal(estimateRemote(mem, { phase: 'build', since: T }, false, T + 1)!.steps, 3, 'installing was seen: still counted, restarting not');
});

test('a machine whose clock is ahead: the page counts from when it first saw the step', () => {
  const mem = newRemoteRun();
  const now = 5_000_000;
  const ahead = now + 60_000;
  const a = estimateRemote(mem, { phase: 'pull', since: ahead }, true, now)!;
  assert.equal(a.share, 0);
  const b = estimateRemote(mem, { phase: 'pull', since: ahead }, true, now + 5_000)!;
  assert.ok(b.share > 0 && b.share < 0.4, 'five seconds into the pull of three steps');
  // A clock behind or equal counts from the machine's own start.
  const mem2 = newRemoteRun();
  const c = estimateRemote(mem2, { phase: 'build', since: now - 75_000 }, true, now)!;
  assert.ok(c.share > 0.4, 'half the build is behind it');
});

test('a new update is told from the one before it by its start', () => {
  const mem = newRemoteRun();
  const T = 9_000_000;
  estimateRemote(mem, { phase: 'pull', since: T }, true, T);
  estimateRemote(mem, { phase: 'install', since: T + 5_000 }, true, T + 5_000);
  const next = estimateRemote(mem, { phase: 'pull', since: T + 1_000_000 }, true, T + 1_000_000)!;
  assert.equal(next.steps, 3, 'installing is not carried over');
  assert.equal(next.share, 0, 'nor the share');
});

console.log(`${passed} passed`);
