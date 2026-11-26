// Checks for the reckoning the server, the screens and the CLI share (goals.ts): where each round started from — as it
// recorded it, or, for a goal stored before rounds did, read from how the rounds ended. Nothing here touches files.
// Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs shared/goals-test.ts && node dist/dev/goals-test.js
import assert from 'node:assert/strict';
import { roundParents, type GoalOutcome, type GoalRound } from './goals.ts';

let passed = 0;
let total = 0;
const test = (name: string, fn: () => void) => {
  total++;
  try {
    fn();
    passed++;
  } catch (e) {
    console.log(`✗ ${name}\n${(e as Error).stack ?? e}`);
  }
};

const rounds = (...outcomes: (GoalOutcome | [GoalOutcome, number])[]): Pick<GoalRound, 'n' | 'outcome' | 'parent'>[] =>
  [{ n: 0, outcome: 'start' as const }, ...outcomes.map((o, i) => (typeof o === 'string' ? { n: i + 1, outcome: o } : { n: i + 1, outcome: o[0], parent: o[1] }))];
/** The parents of rounds 1, 2, 3… */
const parents = (rs: Pick<GoalRound, 'n' | 'outcome' | 'parent'>[]) => [...roundParents(rs)].sort((a, b) => a[0] - b[0]).map((x) => x[1]);

test('a goal stored before rounds recorded it: a line of kept rounds, and the start has no parent', () => {
  assert.deepEqual(parents(rounds('kept', 'kept', 'kept')), [0, 1, 2]);
  assert.equal(roundParents(rounds('kept')).has(0), false);
  assert.deepEqual(parents(rounds()), []);
  assert.deepEqual(parents([]), []);
});

test('from the outcomes: an undone round is nobody’s parent', () => {
  assert.deepEqual(parents(rounds('undone', 'undone', 'kept', 'undone', 'undone', 'kept')), [0, 0, 0, 3, 3, 3]);
});

test('from the outcomes: a round left as it is keeps its files, so the next starts from it', () => {
  assert.deepEqual(parents(rounds('kept', 'stays', 'stays', 'kept')), [0, 1, 2, 3]);
});

test('from the outcomes: a round you undid is passed over, and one you kept anyway is a parent', () => {
  // Round 2 was kept and then undone by you: the next ones start from round 1.
  assert.deepEqual(parents(rounds('kept', 'undone', 'kept')), [0, 1, 1]);
  // Round 2 was undone and then kept anyway: it is kept now.
  assert.deepEqual(parents(rounds('kept', 'kept', 'kept')), [0, 1, 2]);
});

test('what a round recorded wins: Another way from an earlier round, the start, a round left aside', () => {
  // 1, 2 kept; 3 from 2; then Another way from here on 1 (4), then from the start (5), and on from there (6).
  assert.deepEqual(parents(rounds(['kept', 0], ['kept', 1], ['kept', 2], ['undone', 1], ['kept', 0], ['kept', 5])), [0, 1, 2, 1, 0, 5]);
  // Recorded and unrecorded rounds side by side (a goal that went on after an update): each by what it has.
  assert.deepEqual(parents(rounds('kept', 'kept', ['kept', 1], 'kept')), [0, 1, 1, 3]);
});

test('a recorded parent that cannot be one is read from the outcomes instead; the rounds’ order does not matter', () => {
  assert.deepEqual(parents(rounds(['kept', 1], ['kept', 5], ['kept', -1])), [0, 1, 2]);
  const rs = rounds('kept', 'undone', 'kept');
  assert.deepEqual(parents([rs[3], rs[1], rs[0], rs[2]]), [0, 1, 1]);
});

console.log(`${passed}/${total} passed`);
if (passed !== total) process.exit(1);
