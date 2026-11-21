// Checks for the outcome rules of a goal's rounds (verdict.ts), on made-up checks and results: closeness from the start,
// the score, each reason a round is undone and their order, kept where nothing can be undone ("stays"), a check's own
// slack, a value that still meets its target, room behind a best of 0, the rounds after a failed final check, rounds
// without progress, every limit, and new targets judged again (Keep anyway). Nothing here touches files.
// Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/goals/verdict-test.ts
//   DATA_DIR=/tmp/hydor-test-goal-verdict PRICES_URL= node dist/dev/verdict-test.js
import assert from 'node:assert/strict';
import type { GoalCheck, GoalResult, GoalRound, GoalState } from '../../shared/goals.ts';
import { allButYouHold, duration, limitReason, num, reckon, relaxed, scoreOf, scored, stalled } from './verdict.ts';

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const TESTS: GoalCheck = { id: 'c1', kind: 'command', label: 'Tests pass', run: 'npm test' };
const TYPES: GoalCheck = { id: 'c2', kind: 'command', label: 'Types check', run: 'npm run typecheck' };
const SPEED: GoalCheck = { id: 'c3', kind: 'measure', label: 'Speed', run: 'bench', target: { op: '<=', value: 300 }, unit: 'ms' };
const REL: GoalCheck = { id: 'c4', kind: 'measure', label: 'Relevance', run: 'eval', target: { op: '>=', value: 0.8 } };
const YOU: GoalCheck = { id: 'c5', kind: 'you', label: 'It reads well' };
const CHECKS = [TESTS, TYPES, SPEED, REL];

const res = (id: string, holds: boolean, value?: number): GoalResult => ({ id, holds, closeness: holds ? 1 : 0, ms: 1, ...(value != null ? { value } : {}) });
const round = (n: number, results: GoalResult[], outcome: GoalRound['outcome'] = 'kept'): GoalRound => ({ n, startedAt: 0, endedAt: 0, results, score: 0, outcome, usd: 0 });

// Where things started: tests fail, types pass, speed 900 ms, relevance 0.6.
const START = round(0, [res('c1', false), res('c2', true), res('c3', false, 900), res('c4', false, 0.6)], 'start');

test('closeness counts from the start towards the target, and the score is its mean over every check', () => {
  const now = [res('c1', false), res('c2', true), res('c3', false, 600), res('c4', false, 0.7)];
  const s = scored(CHECKS, now, START);
  assert.equal(s.find((r) => r.id === 'c2')!.closeness, 1);
  assert.equal(s.find((r) => r.id === 'c1')!.closeness, 0);
  assert.ok(Math.abs(s.find((r) => r.id === 'c3')!.closeness - 0.5) < 1e-9, 'speed went half the way from 900 to 300');
  assert.ok(Math.abs(s.find((r) => r.id === 'c4')!.closeness - 0.5) < 1e-9, 'relevance went half the way from 0.6 to 0.8');
  assert.ok(Math.abs(scoreOf(CHECKS, now, START) - (0 + 1 + 0.5 + 0.5) / 4) < 1e-9);
  // Worse than at the start counts nothing, never below 0; short of holding stays under 1.
  assert.equal(scored([SPEED], [res('c3', false, 1200)], START)[0].closeness, 0);
  assert.ok(scored([SPEED], [res('c3', false, 301)], START)[0].closeness < 1);
  assert.equal(scoreOf([], [], START), 0);
  // A check without a result counts 0.
  assert.ok(Math.abs(scoreOf(CHECKS, [res('c2', true)], START) - 0.25) < 1e-9);
});

test('kept when the score rises and nothing that held broke, with what got better', () => {
  const v = reckon({ checks: CHECKS, results: [res('c1', true), res('c2', true), res('c3', false, 900), res('c4', false, 0.6)], start: START, best: START, undo: true });
  assert.equal(v.outcome, 'kept');
  assert.equal(v.why, 'Tests pass now holds');
  assert.equal(v.cause, undefined, 'a kept round has no cause');
  assert.ok(v.score > 0.49 && v.score < 0.51);
  assert.equal(v.results.find((r) => r.id === 'c1')!.closeness, 1);
  const m = reckon({ checks: CHECKS, results: [res('c1', false), res('c2', true), res('c3', false, 600), res('c4', false, 0.6)], start: START, best: START, undo: true });
  assert.equal(m.outcome, 'kept');
  assert.equal(m.why, 'Speed 900 → 600 ms');
});

test('undone for a protected path first, then a broken rule, then a check that stopped holding, then a value far behind, then no gain; each with its cause', () => {
  const better = [res('c1', true), res('c2', true), res('c3', false, 600), res('c4', false, 0.7)];
  const base = { checks: CHECKS, start: START, best: START, undo: true };
  const p = reckon({ ...base, results: better, protectedHit: ['tests/order.test.ts'], ruleBroken: 'no new dependencies' });
  assert.equal(p.outcome, 'undone');
  assert.equal(p.why, 'It changed files it may not change: tests/order.test.ts');
  assert.equal(p.cause, 'protected');
  const many = reckon({ ...base, results: better, protectedHit: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] });
  assert.equal(many.why, 'It changed files it may not change: a, b, c, d, e and 2 more');
  const r = reckon({ ...base, results: better, ruleBroken: '“No new dependencies”: it added lodash' });
  assert.equal(r.why, 'It broke a rule of yours: “No new dependencies”: it added lodash');
  assert.equal(r.cause, 'rule');
  // Types held at the best round and broke now, though tests began to pass: undone.
  const broke = reckon({ ...base, results: [res('c1', true), res('c2', false), res('c3', false, 600), res('c4', false, 0.7)] });
  assert.equal(broke.outcome, 'undone');
  assert.equal(broke.why, 'Types check stopped holding');
  assert.equal(broke.cause, 'broke');
  // A check that could not run counts as not holding.
  const err = reckon({ ...base, results: [res('c1', true), { id: 'c2', holds: false, closeness: 0, error: 'The command was not found', ms: 1 }, res('c3', false, 600), res('c4', false, 0.7)] });
  assert.equal(err.why, 'Types check stopped holding');
  assert.equal(err.cause, 'broke');
  // Speed was 365 at its best; 910 is far behind (more than 10% of 365), even though relevance rose.
  const best = round(2, [res('c1', true), res('c2', true), res('c3', false, 365), res('c4', false, 0.65)]);
  const far = reckon({ ...base, best, results: [res('c1', true), res('c2', true), res('c3', false, 910), res('c4', false, 0.75)] });
  assert.equal(far.outcome, 'undone');
  assert.equal(far.why, 'Speed fell far behind its best (365 → 910 ms)');
  assert.equal(far.cause, 'behind');
  // Relevance (>=) falling far behind too.
  const relBest = round(2, [res('c1', true), res('c2', true), res('c3', false, 400), res('c4', false, 0.7)]);
  const relFar = reckon({ ...base, best: relBest, results: [res('c1', true), res('c2', true), res('c3', true, 280), res('c4', false, 0.62)] });
  assert.equal(relFar.why, 'Relevance fell far behind its best (0.7 → 0.62)');
  assert.equal(relFar.cause, 'behind');
  // Within the slack it is no reason by itself; no gain then decides.
  const near = reckon({ ...base, best, results: [res('c1', true), res('c2', true), res('c3', false, 380), res('c4', false, 0.65)] });
  assert.equal(near.why, 'No gain');
  assert.equal(near.cause, 'none');
  const same = reckon({ ...base, results: START.results });
  assert.equal(same.outcome, 'undone');
  assert.equal(same.why, 'No gain');
  assert.equal(same.cause, 'none');
});

test('a gain of 0.005 or less is no gain', () => {
  // Relevance from 0.6 by 0.003 of 0.2: closeness 0.015, score +0.00375 over four checks.
  const tiny = reckon({ checks: CHECKS, results: [res('c1', false), res('c2', true), res('c3', false, 900), res('c4', false, 0.603)], start: START, best: START, undo: true });
  assert.equal(tiny.outcome, 'undone');
  assert.equal(tiny.why, 'No gain');
  assert.equal(tiny.cause, 'none');
  const enough = reckon({ checks: CHECKS, results: [res('c1', false), res('c2', true), res('c3', false, 900), res('c4', false, 0.606)], start: START, best: START, undo: true });
  assert.equal(enough.outcome, 'kept');
  assert.equal(enough.cause, undefined);
});

test('a check’s own slack', () => {
  const tight: GoalCheck = { ...SPEED, slack: 0.01 };
  const best = round(1, [res('c3', false, 400)]);
  const v = reckon({ checks: [tight], results: [res('c3', false, 410)], start: round(0, [res('c3', false, 900)], 'start'), best, undo: true });
  assert.equal(v.why, 'Speed fell far behind its best (400 → 410 ms)');
  const loose: GoalCheck = { ...SPEED, slack: 0.5 };
  const w = reckon({ checks: [loose], results: [res('c3', false, 550)], start: round(0, [res('c3', false, 900)], 'start'), best, undo: true });
  assert.equal(w.why, 'No gain');
});

test('a measured value that still meets its target is never behind its best; a best of 0 still leaves room (slack of the way from start to target)', () => {
  // Speed may be at most 300 ms: from 200 at best to 280 it is 40% worse, but it still meets its target.
  const fast = reckon({ checks: [SPEED], results: [res('c3', true, 280)], start: round(0, [res('c3', false, 900)], 'start'), best: round(1, [res('c3', true, 200)]), undo: true });
  assert.notEqual(fast.cause, 'behind');
  assert.equal(fast.why, 'No gain');
  // A balance that must reach 100, started at 0 and still 0 at its best: 10% of its best is nothing, 10% of the way is 10.
  const BAL: GoalCheck = { id: 'c6', kind: 'measure', label: 'Balance', run: 'bal', target: { op: '>=', value: 100 } };
  const s0 = round(0, [res('c6', false, 0)], 'start');
  const dip = reckon({ checks: [BAL], results: [res('c6', false, -1)], start: s0, best: s0, undo: true });
  assert.equal(dip.why, 'No gain', 'a dip of 1 is within 10 of the way');
  const fall = reckon({ checks: [BAL], results: [res('c6', false, -20)], start: s0, best: s0, undo: true });
  assert.equal(fall.why, 'Balance fell far behind its best (0 → -20)');
  assert.equal(fall.cause, 'behind');
});

test('after a failed final check: a round that changed the files and broke nothing is kept, one that changed nothing is undone as No change', () => {
  const all = [res('c1', true), res('c2', true)];
  const s0 = round(0, [res('c1', false), res('c2', true)], 'start');
  const base = { checks: [TESTS, TYPES], results: all, start: s0, best: round(3, all), undo: true };
  const same = reckon({ ...base, afterFinal: { changed: false } });
  assert.equal(same.outcome, 'undone');
  assert.equal(same.why, 'No change');
  assert.equal(same.cause, 'none');
  const moved = reckon({ ...base, afterFinal: { changed: true } });
  assert.equal(moved.outcome, 'kept');
  assert.equal(moved.cause, undefined);
  assert.equal(moved.why, 'Nothing that held broke, and the files changed: the final check looks again');
  // Without checkpoints nothing says whether the files changed: kept when nothing broke.
  assert.equal(reckon({ ...base, undo: false, afterFinal: {} }).outcome, 'kept');
  // Something that held broke: undone as ever.
  const broke = reckon({ ...base, results: [res('c1', true), res('c2', false)], afterFinal: { changed: true } });
  assert.equal(broke.outcome, 'undone');
  assert.equal(broke.cause, 'broke');
  // Not after a final check: no gain is no gain.
  assert.equal(reckon(base).why, 'No gain');
});

test('where nothing can be undone, a round that would be undone stays, with the same reason', () => {
  const v = reckon({ checks: CHECKS, results: [res('c1', true), res('c2', false), res('c3', false, 600), res('c4', false, 0.7)], start: START, best: START, undo: false });
  assert.equal(v.outcome, 'stays');
  assert.equal(v.why, 'Types check stopped holding');
  assert.equal(v.cause, 'broke', 'a round that stays says why too');
  const k = reckon({ checks: CHECKS, results: [res('c1', true), res('c2', true), res('c3', false, 900), res('c4', false, 0.6)], start: START, best: START, undo: false });
  assert.equal(k.outcome, 'kept');
  assert.equal(k.cause, undefined);
});

test('the best round’s score is reckoned with the checks as they are now', () => {
  // A check added after the best round: its missing result counts 0 there, so a round that makes it hold is a gain.
  const best = round(1, [res('c1', true), res('c2', true)]);
  const v = reckon({ checks: [TESTS, TYPES, YOU], results: [res('c1', true), res('c2', true), res('c5', true)], start: round(0, [res('c1', false), res('c2', true)], 'start'), best, undo: true });
  assert.equal(v.outcome, 'kept');
});

test('stalled: the last rounds (two unless told) exist and none was kept', () => {
  const r = (outcomes: GoalRound['outcome'][]) => outcomes.map((o, i) => ({ n: i, outcome: o }));
  assert.equal(stalled(r(['start'])), false);
  assert.equal(stalled(r(['start', 'undone'])), false, 'one round is not enough');
  assert.equal(stalled(r(['start', 'undone', 'undone'])), true);
  assert.equal(stalled(r(['start', 'undone', 'stays'])), true, 'stays is not kept');
  assert.equal(stalled(r(['start', 'undone', 'kept'])), false);
  assert.equal(stalled(r(['start', 'kept', 'undone', 'undone'])), true);
  assert.equal(stalled(r(['start', 'undone', 'undone', 'kept'])), false);
  assert.equal(stalled(r(['start', 'undone', 'undone']), 3), false);
  assert.equal(stalled(r(['start', 'undone', 'undone', 'undone']), 3), true);
  assert.equal(stalled(r(['start', 'undone']), 0), false);
});

test('all but the person’s checks hold', () => {
  assert.equal(allButYouHold([TESTS, YOU], [res('c1', true)]), true);
  assert.equal(allButYouHold([TESTS, YOU], [res('c1', false), res('c5', true)]), false);
  assert.equal(allButYouHold([TESTS, TYPES], [res('c1', true)]), false, 'a check without a result does not hold');
});

test('limits: rounds, money and time, each in a sentence; a running round leaves the rounds out', () => {
  const g = (rounds: number, limits: GoalState['contract']['limits'], spentUsd = 0) =>
    ({ rounds: [START, ...Array.from({ length: rounds }, (_, i) => round(i + 1, []))], contract: { objective: 'x', checks: [], protect: [], limits }, spentUsd }) as Pick<GoalState, 'rounds' | 'contract' | 'spentUsd'>;
  assert.equal(limitReason(g(11, { rounds: 12 }), 0), null);
  assert.equal(limitReason(g(12, { rounds: 12 }), 0), 'It ran its 12 rounds');
  assert.equal(limitReason(g(1, { rounds: 1 }), 0), 'It ran its 1 round');
  assert.equal(limitReason(g(12, { rounds: 12 }), 0, { rounds: false }), null);
  assert.equal(limitReason(g(2, { rounds: 12, usd: 10 }, 9.99), 0), null);
  assert.equal(limitReason(g(2, { rounds: 12, usd: 10 }, 10.04), 0), 'It spent $10.04 of its $10.00');
  assert.equal(limitReason(g(2, { rounds: 12, minutes: 180 }), 179 * 60_000), null);
  assert.equal(limitReason(g(2, { rounds: 12, minutes: 180 }), 180 * 60_000), 'It worked 3 h of its 3 h');
  assert.equal(limitReason(g(2, { rounds: 12, minutes: 90 }), 91 * 60_000), 'It worked 1 h 31 min of its 1 h 30 min');
});

test('numbers and durations as people read them', () => {
  assert.equal(num(365), '365');
  assert.equal(num(0.61234), '0.6123');
  assert.equal(num(12345.678), '12350');
  assert.equal(duration(30_000), 'under a minute');
  assert.equal(duration(45 * 60_000), '45 min');
  assert.equal(duration(71 * 60_000), '1 h 11 min');
});

test('new targets for measured checks: every round’s results are judged again', () => {
  const g = { contract: { objective: 'x', checks: [SPEED, TESTS], protect: [], limits: { rounds: 5 } }, rounds: [round(0, [res('c3', false, 900), res('c1', false)], 'start'), round(1, [res('c3', false, 420), res('c1', true)], 'undone')] };
  const r = relaxed(g, { c3: 450 });
  assert.equal(r.contract.checks[0].target!.value, 450);
  assert.equal(r.contract.checks[1], TESTS);
  assert.equal(r.rounds[1].results.find((x) => x.id === 'c3')!.holds, true);
  assert.equal(r.rounds[1].results.find((x) => x.id === 'c3')!.closeness, 1);
  assert.equal(r.rounds[0].results.find((x) => x.id === 'c3')!.holds, false);
  assert.equal(r.rounds[1].score, 1);
  // The original is left as it was.
  assert.equal(g.contract.checks[0].target!.value, 300);
});

// ---- run ---------------------------------------------------------------------------------------------

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
}
console.log(`${passed}/${tests.length} passed`);
process.exit();
