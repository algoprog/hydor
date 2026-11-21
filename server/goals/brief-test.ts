// Checks for what the goal loop tells the agent (brief.ts), on made-up goals: every message's head (which the
// conversation recognises) and its last line; the draft and its reminder (no work yet, how to propose, then stop); the
// round message's parts in their order (the goal, Holds and Not yet from where the files stand, the last round and
// where the files are, the failing checks' output within its limits, what was dropped, the user's rules, note and way
// first, the paths not to change, a new approach after rounds without progress, the closing instructions); the
// message that asks which way next; a message sent again after a restart cut its turn; Last round after the person went
// another way from a round; and what is left to put right once every check holds. Nothing here touches files.
// Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/goals/brief-test.ts
//   DATA_DIR=/tmp/hydor-test-goal-brief PRICES_URL= node dist/dev/brief-test.js
import assert from 'node:assert/strict';
import { goalMessageOf, type GoalCheck, type GoalResult, type GoalRound, type GoalState } from '../../shared/goals.ts';
import { askMessage, DETAIL_ALL, DETAIL_EACH, draftMessage, draftNotes, GOAL_FOOT, reminderMessage, RESTARTED, restartedMessage, roundMessage, whereItStands } from './brief.ts';

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const CHECKS: GoalCheck[] = [
  { id: 'c1', kind: 'command', label: 'Tests pass', run: 'npm test' },
  { id: 'c2', kind: 'command', label: 'Types check', run: 'npm run typecheck' },
  { id: 'c3', kind: 'measure', label: 'Speed', run: 'bench', target: { op: '<=', value: 300 }, unit: 'ms' },
  { id: 'c4', kind: 'review', label: 'Errors are explained', claim: 'Every error message says what to do' },
];
const res = (id: string, holds: boolean, o: Partial<GoalResult> = {}): GoalResult => ({ id, holds, closeness: holds ? 1 : 0, ms: 1, ...o });
const round = (n: number, results: GoalResult[], outcome: GoalRound['outcome'], o: Partial<GoalRound> = {}): GoalRound => ({ n, startedAt: 0, endedAt: 0, results, score: 0, outcome, usd: 0, ...o });

type G = Pick<GoalState, 'contract' | 'rounds' | 'best' | 'dropped' | 'rules'>;
const goal = (o: Partial<G> = {}): G => ({
  contract: { objective: 'Make checkout fast and keep its tests green', checks: CHECKS, protect: ['tests/', 'bench/data.json'], limits: { rounds: 12 } },
  rounds: [round(0, [res('c1', false, { detail: 'FAIL order total' }), res('c2', true), res('c3', false, { value: 910 }), res('c4', false, { detail: 'Two errors say only "failed".' })], 'start')],
  best: 0,
  dropped: [],
  rules: [],
  ...o,
});

const lines = (s: string) => s.split('\n');

test('every message starts with its head and ends saying the app sent it', () => {
  const msgs = [draftMessage('Ship it'), reminderMessage('Ship it'), roundMessage(goal(), { n: 1 }), askMessage(goal(), 'Why.')];
  const heads = msgs.map((m) => goalMessageOf(m)?.head);
  assert.deepEqual(heads, ['agree the checks', 'agree the checks', 'round 1 of 12', 'which way next']);
  for (const m of msgs) {
    assert.match(lines(m)[0], /^\[Goal · [^\]]+\]$/, 'the head is a line of its own');
    assert.equal(lines(m).at(-1), GOAL_FOOT);
  }
  assert.equal(GOAL_FOOT, '(This message is from the app’s goal loop, not typed by the user.)');
});

test('the draft: the goal quoted, no work yet, 3 to 7 checks of the project’s own commands, the paths it must not change, limits, then stop', () => {
  const m = draftMessage('All tests pass and checkout takes under 300 ms');
  assert.match(m, /The user set this goal:\n“All tests pass and checkout takes under 300 ms”/);
  assert.match(m, /Do no work on it yet\./);
  assert.match(m, /goal_propose/);
  assert.match(m, /3 to 7 checks/);
  assert.match(m, /test, type-check, build and benchmark commands/);
  assert.match(m, /A review check .* only for what no command can show/);
  assert.match(m, /kind you only for what the user alone can judge/);
  assert.match(m, /the paths you must not change: the tests, the test data, the checks’ own scripts/);
  assert.match(m, /limits that fit the size of the job/);
  assert.match(m, /Then stop\. The app measures where things stand and shows the user, and nothing starts before they agree\./);
  // For a session started with the goal: the same ask, for the message that follows (no footer: it is a note, not a message).
  const n = draftNotes();
  assert.equal(goalMessageOf(n)?.head, 'agree the checks');
  assert.match(n, /The user’s message below is a goal/);
  assert.match(n, /goal_propose/);
  assert.ok(!n.includes(GOAL_FOOT));
});

test('the reminder: still no checks, propose now, or the app proposes a reviewer’s check', () => {
  const m = reminderMessage('Ship it');
  assert.match(m, /still has no checks/);
  assert.match(m, /call goal_propose now/);
  assert.match(m, /a reviewer reads the change against the goal/);
  assert.match(m, /The goal: “Ship it”/);
});

test('the round: its parts in order', () => {
  const g = goal({
    rounds: [
      round(0, [res('c1', false), res('c2', true), res('c3', false, { value: 910 }), res('c4', false)], 'start'),
      round(1, [res('c1', true), res('c2', true), res('c3', false, { value: 365, detail: 'p95 365 ms' }), res('c4', false, { detail: 'Two errors say only "failed".' })], 'kept'),
      round(2, [res('c1', true), res('c2', true), res('c3', false, { value: 910 }), res('c4', false)], 'undone', { why: 'Speed fell far behind its best (365 → 910 ms)' }),
    ],
    best: 1,
    dropped: [{ text: 'Caching the whole cart: stale prices' }, { text: 'Rewrite in Rust', by: 'you' }],
    rules: [{ id: 'r1', text: 'No new dependencies', at: 1 }],
  });
  const m = roundMessage(g, { n: 3, way: { name: 'Index the orders table', why: 'the query scans it', expects: 'Speed −200 ms' }, note: 'Keep the API the same.' });
  const order = [
    '[Goal · round 3 of 12]',
    'The goal: “Make checkout fast and keep its tests green”',
    'Holds: Tests pass; Types check\nNot yet: Speed 365 ms (needs ≤ 300 ms); Errors are explained',
    'Last round: undone. Speed fell far behind its best (365 → 910 ms). The files are back as they were after round 1.',
    'What the checks that do not hold said',
    'Tried and dropped:\n- Caching the whole cart: stale prices\n- Rewrite in Rust (the user)',
    'From the user (follow these first):\n- No new dependencies\n- Keep the API the same.',
    'The way to follow this round: Index the orders table (the query scans it). Expected: Speed −200 ms',
    'Do not change: tests/, bench/data.json',
    'The app runs the checks itself when your turn ends. You cannot end the goal, and saying it is done changes nothing.',
    'call goal_report (what you did, what remains) and end your turn.',
    GOAL_FOOT,
  ];
  let at = -1;
  for (const part of order) {
    const i = m.indexOf(part);
    assert.ok(i > at, `"${part.slice(0, 50)}" in its place`);
    at = i;
  }
  // Holds and Not yet are where the files stand (round 1, the best), not the undone round 2.
  assert.ok(!m.includes('Speed 910'));
  assert.match(m, /Speed:\np95 365 ms/);
  // A way was given: no change of approach on top of it.
  assert.ok(!m.includes('take a clearly different approach'));
});

test('the round: the first one, without a last round, rules or way; the start’s files and other outcomes', () => {
  const m = roundMessage(goal(), { n: 1 });
  assert.ok(!m.includes('Last round:'));
  assert.ok(!m.includes('From the user'));
  assert.ok(!m.includes('The way to follow'));
  assert.ok(!m.includes('Tried and dropped'));
  assert.match(m, /Holds: Types check/);
  assert.match(m, /Not yet: Tests pass; Speed 910 ms \(needs ≤ 300 ms\); Errors are explained/);
  const undoneToStart = roundMessage(goal({ rounds: [...goal().rounds, round(1, [], 'undone', { why: 'No gain' })], best: 0 }), { n: 2 });
  assert.match(undoneToStart, /Last round: undone\. No gain\. The files are back as they were at the start\./);
  const kept = roundMessage(goal({ rounds: [...goal().rounds, round(1, goal().rounds[0].results, 'kept', { why: 'Tests pass now holds' })], best: 1 }), { n: 2 });
  assert.match(kept, /Last round: kept\. Tests pass now holds\./);
  const stays = roundMessage(goal({ rounds: [...goal().rounds, round(1, goal().rounds[0].results, 'stays', { why: 'Types check stopped holding' })], best: 1 }), { n: 2 });
  assert.match(stays, /Last round: not better, and it stays \(nothing can be put back here\)\. Types check stopped holding\./);
  const byYou = roundMessage(goal({ rounds: [...goal().rounds, round(1, goal().rounds[0].results, 'undone', { by: 'you', reason: 'Too hacky', why: 'No gain' })], best: 0 }), { n: 2 });
  assert.match(byYou, /Last round: undone by the user\. Too hacky\./);
  const err = roundMessage(goal({ rounds: [round(0, [res('c1', false, { error: 'The command was not found' })], 'start')] }), { n: 1 });
  assert.match(err, /Tests pass \(could not run: The command was not found\)/);
  const none = roundMessage(goal({ rounds: [] }), { n: 1 });
  assert.match(none, /Tests pass \(not measured yet\)/);
});

test('the round: the person’s note, the round they went back to, a way of the agent’s own, and no protected paths', () => {
  const g = goal({ contract: { ...goal().contract, protect: [] } });
  const m = roundMessage(g, { n: 4, from: 2, way: { name: 'Batch the queries' } });
  assert.match(m, /Last round: the user took the files back to round 2, to go on from there another way: the files stand as they were after round 2\. Go another way from there\./);
  assert.match(m, /The way to follow this round: Batch the queries/);
  assert.ok(!m.includes('Do not change'));
  const start = roundMessage(g, { n: 4, from: 0 });
  assert.match(start, /took the files back to the start, to go on from there another way: the files stand as they were at the start\./);
  const way = roundMessage(g, { n: 4, way: { name: 'Profile first' } });
  assert.ok(!way.includes('From the user'), 'a way alone (its own pick, by the clock) has no "From the user" heading');
});

test('the round: a clearly different approach when the last rounds made no progress and no way was given', () => {
  const m = roundMessage(goal(), { n: 3, changeApproach: true });
  assert.match(m, /The last rounds made no progress: take a clearly different approach than before\./);
  assert.ok(m.indexOf('take a clearly different approach') < m.indexOf('The app runs the checks itself'));
});

test('the round: each failing check’s output is its end, at most 1200 characters, 4000 in all', () => {
  const long = (c: string) => `${'x'.repeat(5000)}${c}`;
  const g = goal({
    contract: { ...goal().contract, checks: [1, 2, 3, 4, 5].map((i) => ({ id: `c${i}`, kind: 'command' as const, label: `Check ${i}`, run: 'x' })) },
    rounds: [round(0, [1, 2, 3, 4, 5].map((i) => res(`c${i}`, false, { detail: long(`END${i}`) })), 'start')],
  });
  const w = whereItStands(g);
  assert.ok(w.details.length < 5, 'the fifth no longer fits');
  const sizes = w.details.map((d) => d.slice(d.indexOf('\n') + 1).length);
  assert.ok(sizes.every((s) => s <= DETAIL_EACH));
  assert.ok(sizes.reduce((a, b) => a + b, 0) <= DETAIL_ALL);
  assert.ok(w.details[0].endsWith('END1'), 'the end of the output is kept');
  const m = roundMessage(g, { n: 1 });
  assert.ok(m.includes('END1') && m.includes('END3'));
});

test('asking which way: where things stand, no work, 2 to 4 ways with why, expects, cost and a pick, then end the turn', () => {
  const g = goal({ dropped: [{ text: 'Caching the whole cart' }], rules: [{ id: 'r1', text: 'No new dependencies', at: 1 }] });
  const m = askMessage(g, 'The last 2 rounds were not kept: this is a turning point.');
  assert.match(m, /The goal: “Make checkout fast/);
  assert.match(m, /Holds: Types check/);
  assert.match(m, /Not yet: Tests pass; Speed 910 ms/);
  assert.match(m, /Tried and dropped:\n- Caching the whole cart/);
  assert.match(m, /No new dependencies/);
  assert.match(m, /The last 2 rounds were not kept: this is a turning point\. Do not work now\. Call goal_ask with 2 to 4 clearly different ways/);
  assert.match(m, /each with why, what it should bring on the checks \(expects\) and what it costs, and your own pick; then end your turn\./);
  assert.ok(!m.includes('What the checks that do not hold said'), 'no outputs: it is not to work now');
});

test('after the person went another way from a round: Last round says where the files stand and why, and what the rounds after it tried', () => {
  const r = (n: number, o: Partial<GoalRound>) => round(n, goal().rounds[0].results, o.outcome ?? 'undone', o);
  const g = goal({
    rounds: [...goal().rounds, r(1, { outcome: 'kept', why: 'Tests pass now holds' }), r(2, { way: 'Cache the totals', why: 'No gain' }), r(3, { did: 'Rewrote the query with a join. Then added an index.', why: 'Speed fell far behind its best (600 → 910 ms)', cause: 'behind' }), r(4, { by: 'you', reason: 'Too hacky', why: 'No gain' })],
    best: 1,
  });
  const m = roundMessage(g, { n: 5, from: 1 });
  assert.match(
    m,
    /Last round: the user took the files back to round 1, to go on from there another way: the files stand as they were after round 1\. What the rounds after it tried \(go another way, do not repeat these\):\n- Round 2: Cache the totals \(undone: No gain\)\n- Round 3: Rewrote the query with a join\. \(undone: Speed fell far behind its best \(600 → 910 ms\)\)\n- Round 4: no report of what it did \(undone: Too hacky\)/,
  );
  assert.ok(!m.includes('Last round: undone'), 'not the last round as such');
  assert.ok(!m.includes('From the user'), 'said once, under Last round');
});

test('every check holds but the work is not done: what the final check found, or the person’s “Not yet”, comes first and the closing says to put it right', () => {
  const all = goal({ rounds: [round(0, CHECKS.map((c) => res(c.id, true)), 'start')], best: 0 });
  const m = roundMessage(all, { n: 3, fix: { by: 'final', reason: 'The tests were made to skip the slow case.' } });
  const goalLine = m.indexOf('The goal:');
  const found = m.indexOf('Every check holds, but the final check did not pass: The tests were made to skip the slow case. Put that right; the checks and the final check run again when your turn ends.');
  assert.ok(goalLine >= 0 && found > goalLine && found < m.indexOf('Holds:'), 'right after the goal');
  assert.match(m, /Put right what the final check found, check your work as you go, then call goal_report/);
  assert.ok(!m.includes('Work on what does not hold yet'));
  const yours = roundMessage(all, { n: 3, fix: { by: 'you', label: 'It reads well', note: 'Too formal' } });
  assert.match(yours, /Every other check holds, but the user says “It reads well” does not hold yet: Too formal\. Put that right; the checks run again when your turn ends, and the user is asked again\./);
  assert.match(yours, /Put right what the user says/);
  assert.match(roundMessage(all, { n: 3, fix: { by: 'you', label: 'It reads well' } }), /does not hold yet\. Put that right/);
  assert.match(roundMessage(goal(), { n: 2 }), /Work on what does not hold yet/, 'otherwise as before');
});

test('a reason from a model or a person that ends with a full stop gets no second one', () => {
  const kept = roundMessage(goal({ rounds: [...goal().rounds, round(1, goal().rounds[0].results, 'kept', { why: 'Tests pass now holds. The final check: the reply never says the word yes.' })], best: 1 }), { n: 2 });
  assert.match(kept, /Last round: kept\. Tests pass now holds\. The final check: the reply never says the word yes\.\n/);
  const undone = roundMessage(goal({ rounds: [...goal().rounds, round(1, [], 'undone', { why: 'It broke a rule of yours: “No new files”: It added a file!' })], best: 0 }), { n: 2 });
  assert.match(undone, /It added a file\. The files are back/);
  const fix = roundMessage(goal(), { n: 2, fix: { by: 'final', reason: 'It says yes...' } });
  assert.match(fix, /did not pass: It says yes\. Put that right/);
  for (const m of [kept, undone, fix]) assert.ok(!/[.!?]\.(\s|$)/.test(m.replace(/…/g, '')), m);
});

test('sent again after a restart cut the turn short: the same message, its head first, then a line that says why', () => {
  const draft = draftMessage('Ship the export');
  const again = restartedMessage(draft);
  const m = goalMessageOf(again)!;
  assert.equal(m.head, 'agree the checks', 'still drawn as the loop’s message');
  assert.ok(m.body.startsWith(`${RESTARTED}\n\n`), 'the line right under the head');
  assert.match(RESTARTED, /The app restarted/);
  assert.ok(again.endsWith(GOAL_FOOT), 'and all of the message after it');
  assert.ok(again.includes('“Ship the export”'));
  assert.equal(restartedMessage('plain text'), `${RESTARTED}\n\nplain text`);
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
