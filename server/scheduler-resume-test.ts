// Script tests for when a session waiting out a usage limit is continued (Scheduler.syncResumes, scheduler.ts): at the
// time its account's limit lifts, a minute after it; at once when the account has room (and held for EARLY_HOLD_MS
// after a continue the limit turned away again, unless usage came back by a reset); left alone when the limit's time is
// not known; and cancelled once the session's own turn got through. The sessions manager is a fake: only what the
// scheduler reads of it is there.
// Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/scheduler-resume-test.ts
//   DATA_DIR=/tmp/hydor-test-resume node dist/dev/scheduler-resume-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from './db.ts';
import { Scheduler } from './scheduler.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-resume-test-'));
const db = openDb(path.join(tmp, 'test.db'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const KEY = 'claude:00000000-0000-0000-0000-000000000002';
const HOUR = 3600_000;
const MINUTE = 60_000;
const TOLERANCE = 2_000;
/** Whether two times are within the tolerance (the scheduler reads the clock itself). */
const near = (a: number | undefined, b: number, what: string) => {
  assert.ok(a !== undefined, `${what}: no time set`);
  assert.ok(Math.abs(a - b) <= TOLERANCE, `${what}: ${a} is not within 2 s of ${b} (off by ${a - b} ms)`);
};

// What the scheduler reads of the sessions manager: one session, whose account's limit lifts when `lifts` says.
let lifts: number | null | undefined = null;
// The account kept for the sessions moved there lately, as the notice names it (undefined: none), and what a due
// continue answers (continueAfterLimit: 'goal', 'send' or 'wait').
let kept: { name: string; sessions: number } | undefined;
let next: 'goal' | 'send' | 'wait' = 'send';
const delivered: string[] = [];
const queued: string[] = [];
const adapter = { limitStopped: true };
const sessions = {
  lives: new Map([[KEY, { adapter }]]),
  on() {},
  summary: (key: string) => ({ key, agent: 'claude', title: 'A session', cwd: '/tmp' }),
  queueSummary: (key: string) => void queued.push(key),
  limitLiftsAt: () => lifts,
  limitKept: () => kept,
  continueAfterLimit: async () => next,
  beforeResume: async () => false,
  deliverOrQueue: async (_key: string, text: string) => void delivered.push(text),
};

// One scheduler for the whole run: each step below leaves the state the next one starts from.
const scheduler = new Scheduler(db, sessions as any);
const earlyResumes = () => (scheduler as any).earlyResumes as Map<string, number>;
const nextAt = () => scheduler.resumeFor(KEY)?.nextAt;

test('a session whose account has room is continued now, and counts as continued early', () => {
  const now = Date.now();
  lifts = null;
  scheduler.resumeAt(KEY, now + 3 * HOUR);
  scheduler.syncResumes();
  near(nextAt(), now + 5_000, 'continued now');
  assert.equal(earlyResumes().has(KEY), true, 'the early continue is held for a while');
});

test('a continue the limit turns away again waits out the hold, not the reset', () => {
  const now = Date.now();
  lifts = null;
  scheduler.resumeAt(KEY, now + 3 * HOUR);
  scheduler.syncResumes();
  assert.equal(nextAt(), earlyResumes().get(KEY)! + 15 * MINUTE, 'the early continue plus EARLY_HOLD_MS exactly, not the 3 h reset');
});

test('a resume already due sooner than the end of the hold is kept as it is', () => {
  const now = Date.now();
  lifts = null;
  scheduler.resumeAt(KEY, now + MINUTE);
  scheduler.syncResumes();
  near(nextAt(), now + MINUTE, 'the resume a minute away');
});

test('usage coming back clears the hold: the session is continued now', () => {
  const now = Date.now();
  lifts = null;
  scheduler.resumeAt(KEY, now + 3 * HOUR);
  scheduler.syncResumes({ usageBack: true });
  near(nextAt(), now + 5_000, 'continued now after usage came back');
  near(earlyResumes().get(KEY), now, 'the hold starts again from this continue');
});

test('an account whose limit lifts at a known time: the session waits for that time, a minute after it', () => {
  const now = Date.now();
  lifts = now + 2 * HOUR;
  scheduler.resumeAt(KEY, now + 5 * HOUR);
  scheduler.syncResumes();
  near(nextAt(), lifts + MINUTE, 'a minute after the limit lifts');
});

test('a limit whose time is not known leaves the resume where it is', () => {
  const now = Date.now();
  lifts = now + 2 * HOUR;
  scheduler.resumeAt(KEY, now + 5 * HOUR);
  scheduler.syncResumes();
  const before = nextAt();
  lifts = undefined;
  scheduler.syncResumes();
  assert.equal(nextAt(), before, 'unchanged when the limit time is unknown');
});

test('a turn that got through since the limit cancels the resume', () => {
  const now = Date.now();
  lifts = now + 2 * HOUR;
  scheduler.resumeAt(KEY, now + 5 * HOUR);
  adapter.limitStopped = false;
  try {
    scheduler.syncResumes();
    assert.equal(scheduler.resumeFor(KEY), undefined, 'the resume is gone');
  } finally {
    adapter.limitStopped = true;
  }
});

// ---- a due continue: what the session's answer (continueAfterLimit) makes of it ----------------------

/** Lets the session's resume fall due now and runs it as the scheduler does, with the answer `next` set. */
async function runDue(answer: 'goal' | 'send' | 'wait') {
  next = answer;
  delivered.length = 0;
  scheduler.resumeAt(KEY, Date.now() - 1000);
  const row = db.prepare('select * from tasks where resume = 1 and target = ?').get(KEY);
  await (scheduler as any).run(row, { trigger: 'schedule' });
  next = 'send';
}

test('a due continue that waits, with its account used up until a time, is set for a minute after that time, and nothing is sent', async () => {
  const now = Date.now();
  lifts = now + 2 * HOUR;
  await runDue('wait');
  assert.deepEqual(delivered, [], 'the message is not sent into the limit');
  near(nextAt(), lifts + MINUTE, 'a minute after the limit lifts');
});

test('a due continue that waits, with no account to take it and no time known for its limit, is set for 15 minutes and held', async () => {
  const now = Date.now();
  lifts = null;
  await runDue('wait');
  assert.deepEqual(delivered, []);
  near(nextAt(), now + 15 * MINUTE, 'the early hold: 15 minutes');
  assert.equal(earlyResumes().has(KEY), true, 'held like an early continue the limit turned away');
});

test('a due continue that waits, with the limit time unknown, sends its message as it would have', async () => {
  lifts = undefined;
  await runDue('wait');
  assert.equal(delivered.length, 1, 'delivered once');
  assert.equal(scheduler.resumeFor(KEY), undefined, 'no resume left');
});

test('a due continue that sends delivers its message once and leaves no resume', async () => {
  await runDue('send');
  assert.equal(delivered.length, 1);
  assert.equal(scheduler.resumeFor(KEY), undefined);
});

test('a due continue answered goal is not delivered (the goal carried over continues the session)', async () => {
  await runDue('goal');
  assert.equal(delivered.length, 0);
  assert.equal(scheduler.resumeFor(KEY), undefined);
});

test('syncResumes queues the summary of a waiting session when the account kept for it changes, and not again while it stays', () => {
  const now = Date.now();
  lifts = now + 2 * HOUR;
  scheduler.resumeAt(KEY, now + 5 * HOUR);
  kept = undefined;
  scheduler.syncResumes(); // the resume is moved to the limit's time, and the kept state recorded
  queued.length = 0;
  kept = { name: 'Work 3', sessions: 4 };
  scheduler.syncResumes();
  assert.deepEqual(queued, [KEY], 'the summary is queued once for the change');
  queued.length = 0;
  scheduler.syncResumes();
  assert.deepEqual(queued, [], 'the same kept account again: nothing queued');
  kept = undefined;
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n`, e);
    process.exitCode = 1;
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed}/${tests.length} passed`);
// The scheduler's timers are unref'd but still hold the process: end here.
process.exit(process.exitCode ?? 0);
