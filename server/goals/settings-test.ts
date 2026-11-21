// Checks for what a new goal starts from (settings.ts): the defaults, the fallback to the old Custom number, the
// validation, and the two routes' shapes. Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/goals/settings-test.ts
//   DATA_DIR=/tmp/hydor-test-goal-settings node dist/dev/settings-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GOAL_ROUNDS, GOAL_SETTINGS } from '../../shared/goals.ts';
import { HttpError } from '../auth.ts';
import { kvGet, kvSet, openDb } from '../db.ts';
import { customSettings, setCustomSettings } from '../custom/settings.ts';
import { goalDefaults, setGoalDefaults } from './settings.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-goal-settings-test-'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const fresh = () => openDb(path.join(tmp, `${tests.length}-${Math.random().toString(36).slice(2)}.db`));
const refused = (fn: () => unknown, re: RegExp) => assert.throws(fn, (e) => e instanceof HttpError && e.status === 400 && re.test(e.message));

test('nothing set: 30 rounds, asks at turning points, goes on with its pick after 10 minutes', () => {
  const db = fresh();
  assert.deepEqual(goalDefaults(db), { rounds: 30, asks: 'forks', noAnswerMin: 10 });
  assert.equal(GOAL_ROUNDS, 30);
  assert.deepEqual({ asks: GOAL_SETTINGS.asks, noAnswerMin: GOAL_SETTINGS.noAnswerMin }, { asks: 'forks', noAnswerMin: 10 });
});

test('the rounds fall back to the old Custom number until they are set here', () => {
  const db = fresh();
  kvSet(db, 'custom.goalRounds', '100');
  assert.equal(goalDefaults(db).rounds, 100);
  assert.equal(customSettings(db).goalRounds, 100);
  // Set here, the new number wins, and the old key stays where it was.
  assert.equal(setGoalDefaults(db, { rounds: 10 }).rounds, 10);
  assert.equal(goalDefaults(db).rounds, 10);
  assert.equal(kvGet(db, 'custom.goalRounds'), '100');
  // An old key that is no number of rounds is not a fallback.
  const other = fresh();
  kvSet(other, 'custom.goalRounds', '9000');
  assert.equal(goalDefaults(other).rounds, 30);
});

test('any of the three can be set alone, and are kept under goals.*', () => {
  const db = fresh();
  assert.deepEqual(setGoalDefaults(db, { asks: 'every' }), { rounds: 30, asks: 'every', noAnswerMin: 10 });
  assert.deepEqual(setGoalDefaults(db, { noAnswerMin: 0 }), { rounds: 30, asks: 'every', noAnswerMin: 0 });
  assert.deepEqual(setGoalDefaults(db, { rounds: 500, asks: 'own', noAnswerMin: 1440 }), { rounds: 500, asks: 'own', noAnswerMin: 1440 });
  assert.deepEqual([kvGet(db, 'goals.rounds'), kvGet(db, 'goals.asks'), kvGet(db, 'goals.noAnswerMin')], ['500', 'own', '1440']);
  assert.deepEqual(setGoalDefaults(db, {}), { rounds: 500, asks: 'own', noAnswerMin: 1440 });
  // 0 minutes is a value, not "unset".
  setGoalDefaults(db, { noAnswerMin: 0 });
  assert.equal(goalDefaults(db).noAnswerMin, 0);
});

test('what is not valid is a 400 with a sentence, and nothing changes', () => {
  const db = fresh();
  setGoalDefaults(db, { rounds: 20, asks: 'own', noAnswerMin: 5 });
  for (const rounds of [0, 501, 2.5, '30', null, NaN]) refused(() => setGoalDefaults(db, { rounds, asks: 'every' }), /Rounds a goal may run: a whole number from 1 to 500/);
  for (const asks of ['sometimes', '', 3, null]) refused(() => setGoalDefaults(db, { asks, rounds: 40 }), /How much a goal asks: own, forks or every/);
  for (const noAnswerMin of [-1, 1441, 1.5, '10', null]) refused(() => setGoalDefaults(db, { noAnswerMin, rounds: 40 }), /a whole number from 0 to 1440/);
  for (const body of [null, 'x', [1], 7]) refused(() => setGoalDefaults(db, body), /Send rounds/);
  assert.deepEqual(goalDefaults(db), { rounds: 20, asks: 'own', noAnswerMin: 5 });
});

test('a stored value that is not valid reads as the default', () => {
  const db = fresh();
  kvSet(db, 'goals.rounds', 'many');
  kvSet(db, 'goals.asks', 'whenever');
  kvSet(db, 'goals.noAnswerMin', '-3');
  assert.deepEqual(goalDefaults(db), { rounds: 30, asks: 'forks', noAnswerMin: 10 });
});

test('Custom’s settings no longer take the rounds', () => {
  const db = fresh();
  setCustomSettings(db, { sandbox: false, goalRounds: 77 } as never);
  assert.equal(customSettings(db).sandbox, false);
  assert.equal(kvGet(db, 'custom.goalRounds'), undefined);
  assert.equal(goalDefaults(db).rounds, 30);
});

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
fs.rmSync(tmp, { recursive: true, force: true });
