// OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/goal/words-test.ts && node dist/dev/words-test.js
import assert from 'node:assert/strict';
import { holding, tally, type GoalState } from '../../../../shared/goals.ts';
import { canSetGoal, leadsTeam } from './can.ts';
import { samples, sampleOf, STATUSES } from './samples.ts';
import {
  agreementHead,
  asksChip,
  atMost,
  biggestMove,
  changeText,
  clockTick,
  clockWords,
  firstSentence,
  giveMore,
  limitsOf,
  limitsProblem,
  GO_ON,
  goLabel,
  limitMinutes,
  markTitle,
  moneyText,
  needsPerson,
  needsText,
  noAnswerWords,
  nowText,
  num,
  outcomeLabel,
  pillValue,
  pauseButton,
  pauseWait,
  PAUSE_WAIT,
  PAUSING_WAIT,
  pendingNote,
  placesOf,
  plural,
  reportLine,
  resultText,
  roundBroke,
  roundCost,
  roundName,
  roundNo,
  sinceTitle,
  spanText,
  startCellText,
  startResultText,
  startAnyway,
  startLabel,
  statusWords,
  timeText,
  unmeasured,
  UNMEASURED_NOTE,
  valueText,
} from './words.ts';

let passed = 0;
let total = 0;
const test = (name: string, fn: () => void) => {
  total++;
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`FAIL ${name}\n`, e);
  }
};

const NOW = Date.UTC(2026, 10, 20, 12, 0, 0);
const all = samples(NOW);
const g = (id: string): GoalState => sampleOf(id, NOW);
const round = (goal: GoalState, n: number) => goal.rounds.find((r) => r.n === n)!;

test('there is a sample for every status, and for each with and without undo', () => {
  for (const s of STATUSES) assert.ok(all.some((x) => x.goal.status === s), `no sample for ${s}`);
  assert.ok(all.some((x) => x.goal.question?.kind === 'way'));
  assert.ok(all.some((x) => x.goal.question?.kind === 'yours'));
  assert.ok(all.some((x) => x.goal.question?.kind === 'blocked'));
  assert.equal(new Set(all.map((x) => x.id)).size, all.length);
  assert.ok(all.some((x) => x.goal.undo) && all.some((x) => !x.goal.undo));
});

test('the status words say what the goal is doing', () => {
  assert.equal(statusWords(g('drafting')), 'working out the checks');
  assert.equal(statusWords(g('agreeing')), 'the checks wait for you');
  assert.equal(statusWords(g('measuring')), 'measuring where things stand');
  assert.equal(statusWords(g('working')), 'round 7 of 12 · working');
  assert.equal(statusWords(g('checking')), 'round 7 of 12 · running the checks');
  assert.equal(statusWords(g('asking')), 'round 7 of 12 · asking you');
  assert.equal(statusWords(g('paused')), 'round 7 of 12 · paused');
  assert.equal(statusWords(g('needs-you')), 'needs you');
  assert.equal(statusWords(g('reached')), 'reached');
  assert.equal(statusWords(g('limit')), 'stopped at its limit');
  assert.equal(statusWords(g('stopped')), 'stopped');
});

test('a pause that waits for the round that runs is in the words, and its button takes the pause back', () => {
  const w = g('working-pausing');
  assert.equal(w.pausing, true);
  assert.equal(statusWords(w), 'round 7 of 12 · working · pausing after this round');
  assert.equal(statusWords({ ...w, status: 'checking' }), 'round 7 of 12 · running the checks · pausing after this round');
  // Without a pause pressed the words are as they were; the flag means nothing once the goal is paused.
  assert.equal(statusWords(g('working')), 'round 7 of 12 · working');
  assert.equal(statusWords({ ...g('paused'), pausing: true }), 'round 7 of 12 · paused');
  assert.deepEqual(pauseButton(g('working')), { label: 'Pause', action: 'pause' });
  assert.deepEqual(pauseButton(w), { label: 'Resume', action: 'resume' });
  assert.equal(pauseWait(g('working')), PAUSE_WAIT);
  assert.equal(pauseWait(w), PAUSING_WAIT);
  assert.equal(PAUSING_WAIT, 'It pauses once this round has been checked');
});

test('a goal paused before any round says only "paused"; the round in progress is the next number when none is set', () => {
  const p = { ...g('paused'), rounds: [], round: undefined };
  assert.equal(statusWords(p), 'paused');
  assert.equal(roundNo(g('asking-waits')), 7);
  assert.equal(roundNo({ rounds: g('reached').rounds }), 8);
});

test('a goal waits for the person when it is amber', () => {
  assert.equal(needsPerson('asking'), true);
  assert.equal(needsPerson('agreeing'), true);
  assert.equal(needsPerson('working'), false);
});

test('the rounds say what they changed: the biggest move of a measured check', () => {
  const goal = g('working');
  assert.equal(changeText(goal, round(goal, 0)), '3 of 5 hold');
  assert.equal(changeText(goal, round(goal, 1)), 'Relevance 0.61 → 0.68');
  assert.equal(changeText(goal, round(goal, 2)), 'Relevance 0.68 → 0.73');
  assert.equal(biggestMove(goal, round(goal, 4)), 'Speed 365 → 208 ms');
});

test('an undone round shows the number that moved, one without gain says "No gain", a broken one says why, and the comparison is with the best at the time', () => {
  const goal = g('working');
  assert.equal(changeText(goal, round(goal, 3)), 'Speed 365 → 910 ms');
  assert.equal(changeText(goal, round(goal, 5)), 'No gain');
  assert.match(changeText(goal, round(goal, 6)), /^A check that held \(Tests pass\) stopped holding/);
  // Round 5 is compared with round 4 (kept), not with round 3 (undone).
  assert.equal(biggestMove(goal, round(goal, 5)), 'Speed 208 → 205 ms');
});

test('an undone round that broke something is marked as broken; one that only did not help is not', () => {
  const goal = g('working');
  assert.equal(roundBroke(goal, round(goal, 6)), true);
  assert.equal(roundBroke(goal, round(goal, 3)), false);
  assert.equal(roundBroke(goal, round(goal, 5)), false);
  assert.equal(roundBroke(goal, round(goal, 4)), false);
});

test('the server’s cause marks a round red or "No gain"; the sentence is read only without one', () => {
  const goal = g('working');
  const r6 = round(goal, 6);
  const r5 = round(goal, 5);
  for (const cause of ['broke', 'protected', 'rule'] as const) assert.equal(roundBroke(goal, { ...r5, cause }), true, cause);
  for (const cause of ['behind', 'none'] as const) assert.equal(roundBroke(goal, { ...r6, cause }), false, cause);
  // A cause wins over the sentence and over the results.
  assert.equal(changeText(goal, { ...r5, cause: 'none', why: 'Something else' }), 'No gain');
  assert.equal(changeText(goal, { ...r5, cause: 'behind', why: 'No gain' }), biggestMove(goal, r5));
  assert.equal(changeText(goal, { ...r6, cause: 'rule', why: 'It broke the rule “no new dependencies”' }), 'It broke the rule “no new dependencies”');
  // Without one, the old reading holds.
  assert.equal(changeText(goal, { ...r5, cause: undefined, why: 'No gain' }), 'No gain');
  assert.equal(roundBroke(goal, { ...r6, cause: undefined }), true);
});

test('rounds are named by their way, else by the first sentence of what they did', () => {
  const goal = g('working');
  assert.equal(roundName(round(goal, 0)), 'Where things stand');
  assert.equal(roundName(round(goal, 1)), 'Weighted fields: title ×3, brand ×2');
  assert.equal(roundName({ ...round(goal, 1), way: undefined }), 'Weighted the title and brand fields in the index.');
  assert.equal(firstSentence('It added a boost. Then it ran tests.'), 'It added a boost.');
  assert.equal(firstSentence(undefined), '');
});

test('the outcome chip: Kept, Undone, by you, and left as it is where nothing can be undone', () => {
  const goal = g('working');
  assert.equal(outcomeLabel(round(goal, 1)), 'Kept');
  assert.equal(outcomeLabel(round(goal, 3)), 'Undone');
  assert.equal(outcomeLabel({ ...round(goal, 3), by: 'you', outcome: 'kept' }), 'Kept by you');
  assert.equal(outcomeLabel({ ...round(goal, 4), by: 'you', outcome: 'undone' }), 'Undone by you');
  assert.equal(outcomeLabel(round(g('working-no-undo'), 3)), 'Left as it is');
  assert.equal(outcomeLabel(round(goal, 0)), '');
});

test('a round shows what it cost and how long it took', () => {
  const goal = g('working');
  assert.equal(roundCost(round(goal, 1)), '$0.52 · 8m 0s');
  assert.equal(roundCost(round(goal, 0)), '$0.08 · 2m 0s');
});

test('the tally and what holds, as the bar and the report say them', () => {
  const goal = g('working');
  assert.deepEqual(tally(goal), { rounds: 6, kept: 3, undone: 3 });
  assert.deepEqual(holding(goal), { holds: 3, of: 5 });
  assert.equal(reportLine(g('reached')), '7 rounds · $5.92 of $10.00 · 1h 24m');
});

test('durations, money and limits', () => {
  assert.equal(spanText(45000), '45 s');
  assert.equal(spanText(8 * 60000), '8m 0s');
  assert.equal(spanText(71 * 60000), '1h 11m');
  assert.equal(spanText(180 * 60000), '3h 0m');
  assert.equal(limitMinutes(180), '3 hours');
  assert.equal(limitMinutes(60), '1 hour');
  assert.equal(limitMinutes(90), '90 minutes');
  assert.equal(plural(1, 'round'), '1 round');
  assert.equal(plural(12, 'round'), '12 rounds');
  const goal = g('working');
  assert.equal(moneyText(goal), '$3.26 of $10.00');
  assert.equal(timeText(goal), '58m 0s of 3h 0m');
  assert.equal(moneyText({ ...goal, contract: { ...goal.contract, limits: { rounds: 12 } } }), '$3.26');
  assert.equal(timeText({ ...goal, contract: { ...goal.contract, limits: { rounds: 12 } } }), '58m 0s');
  assert.equal(atMost(goal), 'At most $10.00 and 3 hours');
  assert.equal(atMost({ contract: { ...goal.contract, limits: { rounds: 12 } } }), '');
  assert.equal(num(0.8), '0.8');
  // A measured check's numbers share their decimals: the most its target and the values shown have, at most four.
  const rel = goal.contract.checks[2];
  assert.equal(valueText(rel, 0.73), '0.73');
  assert.equal(valueText(rel, 0.8), '0.8');
  assert.equal(needsText(rel), '≥ 0.8');
  assert.equal(needsText(rel, 0.73), '≥ 0.80');
  assert.equal(placesOf(rel, 0.123456), 4);
  assert.equal(placesOf(goal.contract.checks[3], 187), 0);
  assert.equal(num(208), '208');
});

test('the question’s clock counts down by the minute, then by the second, and waits for you without one', () => {
  const at = (ms: number) => clockWords(NOW + ms, NOW);
  assert.equal(at(9 * 60000), 'goes on with its pick in 9 min');
  assert.equal(at(8.2 * 60000), 'goes on with its pick in 9 min');
  assert.equal(at(61000), 'goes on with its pick in 2 min');
  assert.equal(at(60000), 'goes on with its pick in 60 s');
  assert.equal(at(45000), 'goes on with its pick in 45 s');
  assert.equal(at(1200), 'goes on with its pick in 2 s');
  assert.equal(at(-1), 'going on with its pick');
  assert.equal(clockWords(undefined, NOW), 'waits for you');
  assert.equal(clockWords(g('asking').question?.expiresAt, NOW), 'goes on with its pick in 9 min');
  assert.equal(clockWords(g('asking-waits').question?.expiresAt, NOW), 'waits for you');
  assert.equal(clockTick(NOW + 9 * 60000, NOW), 10000);
  assert.equal(clockTick(NOW + 50000, NOW), 1000);
});

test('the main button reads "Go this way" for one way and "Follow these 2, in this order" for several', () => {
  assert.equal(goLabel(0), 'Go this way');
  assert.equal(goLabel(1), 'Go this way');
  assert.equal(goLabel(2), 'Follow these 2, in this order');
  assert.equal(goLabel(3), 'Follow these 3, in this order');
});

test('how much it asks, as the chip and its fallback say it', () => {
  assert.equal(asksChip(g('working').settings), 'Asks at turning points');
  assert.equal(asksChip({ asks: 'own', noAnswerMin: 10 }), 'Works on its own');
  assert.equal(asksChip({ asks: 'every', noAnswerMin: 0 }), 'Asks every round');
  assert.equal(noAnswerWords(g('working').settings), 'Goes on with its pick after 10 min');
  assert.equal(noAnswerWords({ asks: 'forks', noAnswerMin: 0 }), 'Waits for you');
});

test('what a check needs, and what its result says', () => {
  const goal = g('working');
  const [tests, , rel, speed, page] = goal.contract.checks;
  assert.deepEqual([tests, rel, speed, page].map((c) => needsText(c)), ['pass', '≥ 0.8', '≤ 200 ms', 'looks right']);
  const last = round(goal, 6);
  const res = (id: string) => last.results.find((r) => r.id === id);
  assert.equal(nowText(tests, res('c1')), 'fails');
  assert.equal(nowText(rel, res('c3')), '0.74 now');
  assert.equal(nowText(page, res('c5')), 'holds');
  assert.equal(resultText(tests, res('c1')), 'fails');
  assert.equal(resultText(rel, res('c3')), '0.74, needs 0.80');
  assert.equal(resultText(speed, res('c4')), '214 ms, needs 200 ms');
  assert.equal(pillValue(speed, res('c4')!), '214 / 200 ms');
  assert.equal(pillValue(tests, res('c1')!), '');
});

test('a check that could not run says so, and counts as not holding', () => {
  const goal = g('agreeing');
  const page = goal.contract.checks[4];
  const r = round(goal, 0).results.find((x) => x.id === 'c5');
  assert.equal(nowText(page, r), 'No screenshot tool on this computer');
  assert.equal(resultText(page, r), 'could not run');
  assert.deepEqual(holding(goal), { holds: 2, of: 5 });
});

test('an agreement that was not measured says so, and the first Start that finds a check unable to run becomes Start anyway', () => {
  const fresh = g('agreeing-unmeasured');
  assert.equal(fresh.status, 'agreeing');
  assert.equal(fresh.rounds.length, 0);
  assert.equal(unmeasured(fresh), true);
  assert.equal(agreementHead(fresh, '3m ago'), 'not measured yet');
  assert.equal(UNMEASURED_NOTE, 'The checks run for the first time when you press Start.');
  assert.equal(startLabel(fresh), 'Start');
  // No value shows beside a check that was not measured.
  assert.equal(nowText(fresh.contract.checks[2], undefined), '');
  assert.deepEqual(holding(fresh), { holds: 0, of: 5 });
  // Measured, with a check that could not run and the server's reason: Start anyway, and the head counts what holds.
  const back = g('agreeing');
  assert.equal(unmeasured(back), false);
  assert.equal(agreementHead(back, '3m ago'), 'measured 3m ago · 2 of 5 hold');
  assert.equal(startAnyway(back), true);
  assert.equal(startLabel(back), 'Start anyway');
  // Measured with every check run, or without the reason: plain Start.
  assert.equal(startLabel({ ...back, reason: undefined }), 'Start');
  assert.equal(startLabel({ ...g('working'), status: 'agreeing' }), 'Start');
});

test('only a goal that stopped at a limit can be given more', () => {
  assert.equal(giveMore(g('limit')), 'Give it more…');
  assert.equal(giveMore(g('reached')), '');
  assert.equal(giveMore(g('stopped')), '');
  assert.equal(giveMore(g('working')), '');
  assert.equal(GO_ON, 'Go on');
  // The limits it had fill the fields, and they are checked as the checks editor's limits are.
  const l = g('limit').contract.limits;
  assert.deepEqual(l, { rounds: 6, usd: 10, minutes: 180 });
  assert.equal(limitsProblem(l), null);
  assert.equal(limitsProblem({ rounds: 0 }), 'It needs at least one round');
  assert.equal(limitsProblem({ rounds: 12, usd: 0 }), 'The money limit must be more than zero, or empty');
  assert.equal(limitsProblem({ rounds: 12, minutes: -5 }), 'The time limit must be more than zero, or empty');
  assert.deepEqual(limitsOf({ rounds: 12.4, usd: 15, minutes: undefined }), { rounds: 12, usd: 15 });
});

test('a change of the checks made while a round runs says it takes effect after the round', () => {
  const p = g('working-pending');
  assert.equal(pendingNote(p), 'Your change to the checks takes effect after this round.');
  assert.equal(pendingNote({ pending: { protect: ['src/'] } }), 'Your change to the checks takes effect after this round.');
  assert.equal(pendingNote(g('working')), '');
  assert.equal(pendingNote({ pending: {} }), '');
  // The pills keep the checks the round runs with: the goal's own checks are unchanged.
  assert.equal(p.contract.checks[3].target?.value, 200);
});

test('a check changed after the start shows a dash with its round, not a value at the start', () => {
  const goal = g('reached-changed');
  const speed = goal.contract.checks[3];
  const start = round(goal, 0).results.find((r) => r.id === 'c4');
  const rel = goal.contract.checks[2];
  const relStart = round(goal, 0).results.find((r) => r.id === 'c3');
  assert.equal(start?.since, 3);
  assert.equal(startCellText(speed, start), '—');
  assert.equal(startResultText(speed, start), '—');
  assert.equal(sinceTitle(start), 'Changed after round 3');
  // The others show their value at the start as before.
  assert.equal(startCellText(rel, relStart), '0.61');
  assert.equal(startResultText(rel, relStart), '0.61, needs 0.80');
  assert.equal(sinceTitle(relStart), undefined);
  assert.equal(sinceTitle(undefined), undefined);
  assert.equal(startCellText(speed, undefined), '');
});

test('Set a goal is not offered to a session that leads a team, or that cannot have one', () => {
  const s = { goal: undefined, external: undefined, subagentOf: undefined, extra: undefined };
  assert.equal(canSetGoal(s), true);
  for (const extra of [{ swarm: true }, { swarm: 'campaign' }, { research: { searches: 20 } }, { arena: { with: [{ agent: 'codex' }] } }]) {
    assert.equal(leadsTeam(extra as never), true, JSON.stringify(extra));
    assert.equal(canSetGoal({ ...s, extra: extra as never }), false, JSON.stringify(extra));
  }
  assert.equal(leadsTeam({ memory: false } as never), false);
  assert.equal(canSetGoal({ ...s, extra: { parent: 'claude:lead' } }), false);
  assert.equal(canSetGoal({ ...s, external: 'open' as never }), false);
  assert.equal(canSetGoal({ ...s, subagentOf: 'claude:x' } as never), false);
  assert.equal(canSetGoal({ ...s, goal: { objective: 'x', status: 'active' } }), false);
});

test('the sidebar’s mark says the round and what holds', () => {
  assert.equal(markTitle('Make search faster'), 'Goal: Make search faster');
  assert.equal(markTitle('Make search faster', { state: 'working', round: 7, rounds: 12, holds: 3, of: 5 }), 'Goal · round 7 of 12 · working · 3 of 5 hold\nMake search faster');
  assert.equal(markTitle('Make search faster', { state: 'agreeing', rounds: 12, holds: 3, of: 5 }), 'Goal · the checks wait for you · 3 of 5 hold\nMake search faster');
});

console.log(`${passed}/${total} passed`);
if (passed !== total) process.exit(1);
