// Checks for what the goal loop tells the agent (brief.ts), on made-up goals: every message's head (which the
// conversation recognises) and its last line; the draft and its reminder (no work yet, how to propose, then stop); the
// round message's parts in their order (the goal, Holds and Not yet from where the files stand, the last round and
// where the files are, the failing checks' output within its limits, what was dropped, the user's rules, note and way
// first, the paths not to change, a new approach after rounds without progress, the closing instructions); the
// message that asks which way next; a message sent again after a restart cut its turn; Last round after the person went
// another way from a round; and what is left to put right once every check holds; and a score check: how it stands
// against its baseline, and that evaluation_score lets the agent score its work. Nothing here touches files.
// Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/goals/brief-test.ts
//   DATA_DIR=/tmp/hydor-test-goal-brief PRICES_URL= node dist/dev/brief-test.js
import assert from 'node:assert/strict';
import { goalMessageOf, type GoalCheck, type GoalResult, type GoalRound, type GoalState } from '../../shared/goals.ts';
import { askMessage, DEAD_ENDS, DETAIL_ALL, DETAIL_EACH, draftMessage, draftNotes, GOAL_FOOT, MEMBERS_NAMED, reminderMessage, RESTARTED, restartedMessage, roundMessage, scoresNote, whereItStands } from './brief.ts';
import { checkItem } from './review.ts';

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

test('the round: the dead ends from where it starts are named, so none is walked into twice', () => {
  const rs = [res('c1', true), res('c2', true), res('c3', false, { value: 365 }), res('c4', false)];
  const g = goal({
    rounds: [
      round(0, rs, 'start'),
      round(1, rs, 'kept', { parent: 0 }),
      round(2, rs, 'undone', { parent: 1, way: 'Cache the whole cart', why: 'Stale prices' }),
      round(3, rs, 'kept', { parent: 1, way: 'Index the order lines' }),
      round(4, rs, 'undone', { parent: 3, did: 'Added a second cache. Then more.', why: 'No gain' }),
      round(5, rs, 'undone', { parent: 3, way: 'Rewrite in Rust', why: 'Tests failed', reason: 'Too much', by: 'you' }),
    ],
    best: 3,
  });
  const m = roundMessage(g, { n: 6, parent: 3 });
  assert.ok(
    m.includes('From here (after round 3), these were tried and undone; do not try them again:\n- Round 4: Added a second cache. (undone: No gain)\n- Round 5: Rewrite in Rust (undone: Too much)\n\n'),
    m,
  );
  assert.doesNotMatch(m, /Cache the whole cart/, 'a dead end from another round is not from here');
  assert.ok(m.indexOf('Last round:') < m.indexOf('From here'), 'after how the last round ended');
  // Another way from here on round 1: what Last round lists after it is not listed a second time.
  const back = roundMessage({ ...g, best: 1 }, { n: 6, parent: 1, from: 1 });
  assert.equal(back.match(/Cache the whole cart/g)!.length, 1);
  assert.doesNotMatch(back, /From here/);
  // A goal stored before rounds recorded where they started: read from the outcomes.
  const old = goal({ rounds: [round(0, rs, 'start'), round(1, rs, 'kept'), round(2, rs, 'undone', { way: 'Cache the whole cart' })], best: 1 });
  assert.match(roundMessage(old, { n: 3, parent: 1 }), /From here \(after round 1\), .*\n- Round 2: Cache the whole cart \(undone\)/);
  // From the start, and nothing without a dead end.
  const first = goal({ rounds: [round(0, rs, 'start'), round(1, rs, 'undone', { parent: 0, way: 'Guess' })] });
  assert.match(roundMessage(first, { n: 2, parent: 0 }), /From here \(the start\), /);
  assert.doesNotMatch(roundMessage(g, { n: 6, parent: 5 }), /From here/);
});

test('the dead ends stay within the message’s room: the newest few, each cut short, taken from what the failing checks said', () => {
  const long = 'x'.repeat(DETAIL_EACH * 2);
  const rs = [res('c1', false, { detail: long }), res('c2', false, { detail: long }), res('c3', false, { value: 910, detail: long }), res('c4', false, { detail: long })];
  const rounds = [round(0, rs, 'start'), ...Array.from({ length: 20 }, (_, i) => round(i + 1, rs, 'undone', { parent: 0, way: `Way ${i + 1} ${long}`, why: long }))];
  const g = goal({ rounds });
  // The same message without them (no parent given): with them it is no longer.
  const without = roundMessage(g, { n: 21 });
  const m = roundMessage(g, { n: 21, parent: 0 });
  assert.equal(m.match(/^- Round /gm)!.length, DEAD_ENDS);
  assert.doesNotMatch(m, /- Round 14:/);
  assert.match(m, /- Round 20: Way 20 /);
  assert.ok(m.length <= without.length + 2, `${m.length} against ${without.length}`);
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

test('S2.3, S2.4: a swarm lead’s round message ends with the swarm’s paragraphs and its members (at most 8 by name), after an undone round with its sentence; its draft says the members wait; a plain session’s are as they were', () => {
  const crew = Array.from({ length: 10 }, (_, i) => ({ title: `Angle ${i + 1}`, state: i === 0 ? 'working' : i === 1 ? 'stopped' : 'waiting for you', ...(i === 2 ? { last: 'Found the slow query.' } : {}) }));
  const g = goal({ rounds: [...goal().rounds, round(1, [res('c1', true)], 'undone')] });
  const m = roundMessage(g, { n: 2, swarm: { members: crew } });
  const plain = roundMessage(g, { n: 2 });
  const close = 'The app runs the checks itself when your turn ends. You cannot end the goal, and saying it is done changes nothing. Work on what does not hold yet, check your work as you go, then call goal_report (what you did, what remains) and end your turn.';
  assert.ok(plain.includes(close));
  assert.ok(!m.includes(close), 'in place of the usual closing paragraph');
  const tail = m.slice(m.indexOf('You lead a swarm'));
  assert.equal(
    tail,
    [
      'You lead a swarm in this goal. Put your members on what does not hold yet: one angle or one check each, and tell each which files are its own, because they all work in this folder (give none a worktree or folder of its own: the app checks this folder, and can only undo a round whose work is all here). Pass on what the user asked for above and what must not change.',
      'Last round was undone: what your members changed in it is gone from this folder; say so to those you put to work again. Members from earlier rounds are still there and remember their work: give them their next step with message_child, start a new member only for a new angle, and stop one whose angle is used up with swarm_stop.',
      [
        'Your members now:',
        '- “Angle 1” (working)',
        '- “Angle 2” (stopped)',
        '- “Angle 3” (waiting for you): Found the slow query.',
        ...Array.from({ length: MEMBERS_NAMED - 3 }, (_, i) => `- “Angle ${i + 4}” (waiting for you)`),
        '- and 2 more',
      ].join('\n'),
      'Call goal_report (what the swarm did, what remains) once your members have reported, not when you start them. The round is over when every member’s turn and yours have ended: then the app runs the checks on this folder. Do not conclude, and do not stop members because you think it is solved: you cannot end the goal, only the checks do.',
      GOAL_FOOT,
    ].join('\n\n'),
  );
  // No member yet, and a last round that was kept: no undone sentence.
  const first = roundMessage(goal({ rounds: [...goal().rounds, round(1, [res('c1', true)], 'kept')] }), { n: 2, swarm: { members: [] } });
  assert.match(first, /\n\nYou have no members yet: start one per angle with start_child_session\.\n\n/);
  assert.doesNotMatch(first, /Last round was undone/);
  assert.match(first, /\n\nMembers from earlier rounds are still there/);
  // The draft, its notes and its reminder: the members wait for the first round; a plain session's say nothing of them.
  for (const text of [draftMessage('Make it fast', { swarm: true }), draftNotes({ swarm: true }), reminderMessage('Make it fast', { swarm: true })]) assert.ok(text.includes('Do not start your swarm’s members yet: they come with the first round.'), text);
  for (const text of [draftMessage('Make it fast'), draftNotes(), reminderMessage('Make it fast')]) assert.ok(!text.includes('swarm'), text);
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

test('a score check: Holds and Not yet say its mean and what it needs beyond the noise; the round message says how it stands, that evaluation_score scores the work, and to leave its files and final test alone; the final reviewer reads it as the app’s run', () => {
  const S: GoalCheck = { id: 'c5', kind: 'score', label: 'Beats the baseline', evaluation: 'e7', gain: 0.02, target: { op: '>=', value: 0.432 }, baseline: { score: 's1', mean: 0.412, seal: 2, name: 'Relevance', metric: 'nDCG@10' } };
  const g = goal({
    contract: { objective: 'Beat the baseline', checks: [CHECKS[0], S], protect: ['eval/score.py'], limits: { rounds: 10 } },
    rounds: [round(0, [res('c1', true), res('c5', false, { value: 0.431, verdict: 'same', detail: '0.431 against 0.412: within the noise of 3 seeds (p = 0.21).' })], 'start')],
  });
  const m = roundMessage(g, { n: 1 });
  assert.match(m, /Not yet: Beats the baseline 0\.431 \(needs ≥ 0\.432, beyond the noise\)/);
  assert.match(m, /Beats the baseline:\n0\.431 against 0\.412: within the noise of 3 seeds/);
  const note = scoresNote(g);
  assert.equal(
    note,
    'Scored by the project’s evaluation, which the app runs itself when your turn ends (its runs may wait in the queue):\n- Beats the baseline: the nDCG@10 of the evaluation “Relevance” (id e7), 0.431 where the files stand; its baseline is 0.412, and it holds at ≥ 0.432, beyond the noise of its seeds.\nScore your work while you go with evaluation_score (the same sealed way, in your folder, with how it compares with the baseline). Never change the files it protects (its score is refused while they differ, and the round is undone), and never run or read its final test: that is the user’s.',
  );
  assert.ok(m.includes(note), 'in the round message');
  assert.ok(m.indexOf(note) < m.indexOf('What the checks that do not hold said'), 'before the failing checks’ output');
  assert.equal(scoresNote(goal()), '', 'nothing without a score check');
  assert.match(scoresNote({ ...g, rounds: [round(0, [res('c1', true)], 'start')] }), /not scored yet where the files stand/);
  assert.equal(checkItem(S), '- Beats the baseline (score: the nDCG@10 of the sealed evaluation “Relevance”, run by the app, >= 0.432: its baseline 0.412 + 0.02, beyond the noise of its seeds)');
  assert.equal(checkItem(CHECKS[2]), '- Speed (measure: bench, <= 300 ms)');
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
