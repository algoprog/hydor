// Script tests for the words of the Jobs page (words.ts): what a job is, durations and running clocks, the time left
// and when it is over its estimate, when a waiting one starts, its place in a queue, what it waits for and what waits
// for it, how an ended one ended, and when all of it should be done. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/jobs/words-test.ts && node dist/dev/words-test.js
import assert from 'node:assert/strict';
import type { JobEntry } from '@shared/jobs';

// words.ts takes the kinds' words from lib/work, which reaches the page's own modules: some look at the address when they load.
const g = globalThis as any;
g.location ??= { pathname: '/', search: '', hash: '', origin: 'http://localhost', host: 'localhost', href: 'http://localhost/' };
g.window ??= g;
g.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const W = await import('./words');

const MIN = 60_000;
const HOUR = 60 * MIN;
const NOW = 1_800_000_000_000;
const job = (more: Partial<JobEntry> = {}): JobEntry => ({ id: 'job:j-1', kind: 'job', state: 'running', name: 'Build the index', startedAt: NOW - 5 * MIN, ...more });
const est = (left: number, source: 'progress' | 'output' | 'agent' | 'history' = 'progress', confidence: 'high' | 'medium' | 'low' = 'high') => ({ endsAt: NOW + left, source, confidence });

// ---- what a job is
{
  assert.equal(W.kindLabel('command'), 'Command');
  assert.equal(W.kindLabel('monitor'), 'Monitor');
  assert.equal(W.kindLabel('subagent', 'Claude Code'), 'Claude Code subagent');
  assert.equal(W.kindLabel('subagent'), 'Subagent');
  assert.equal(W.kindLabel('hydor-subagent'), 'Hydor subagent');
  assert.equal(W.kindLabel('experiment'), 'Experiment run');
  assert.equal(W.kindLabel('job'), 'Job');
  assert.equal(W.kindLabel('task'), 'Background task');
}

// ---- durations
{
  assert.equal(W.span(0), 'less than a minute');
  assert.equal(W.span(59_000), 'less than a minute');
  assert.equal(W.span(40 * MIN), '40 min');
  assert.equal(W.span(2 * HOUR + 3 * MIN), '2 h 03 min');
  assert.equal(W.span(HOUR - 10_000), '1 h 00 min', 'rounded up to the hour, not "60 min"');
  assert.equal(W.span(76 * HOUR), '3 days 4 h');
  assert.equal(W.runClock(-5000), '0 s', 'a clock a little ahead of the server’s');
  assert.equal(W.runClock(45_400), '45 s');
  assert.equal(W.runClock(12 * MIN + 5000), '12 min 05 s');
  assert.equal(W.runClock(2 * HOUR + 3 * MIN + 59_000), '2 h 03 min');
  assert.equal(W.tookTime(200), 'under a second');
  assert.equal(W.tookTime(12_300), '12 s');
  assert.equal(W.tookTime(90 * MIN), '1 h 30 min');
}

// ---- the time left
{
  assert.equal(W.timeLeft(job(), NOW), null, 'no estimate, nothing said');
  assert.equal(W.timeLeft(job({ state: 'queued', estimate: est(HOUR) }), NOW), null, 'a waiting job has not time left but a start');
  const a = W.timeLeft(job({ estimate: est(HOUR + 12 * MIN) }), NOW)!;
  assert.deepEqual([a.text, a.guess, a.over], ['about 1 h 12 min left', false, false]);
  assert.equal(W.timeLeft(job({ estimate: est(26 * MIN) }), NOW)!.text, 'about 26 min left');
  assert.equal(W.timeLeft(job({ estimate: est(HOUR - 10_000) }), NOW)!.text, 'about 1 h 00 min left');
  assert.equal(W.timeLeft(job({ estimate: est(76 * HOUR) }), NOW)!.text, 'about 3 days 4 h left');
  assert.equal(W.timeLeft(job({ estimate: est(300 * 24 * HOUR) }), NOW)!.text, 'about 300 days 0 h left');
  assert.equal(W.timeLeft(job({ estimate: est(2 * 365 * 24 * HOUR) }), NOW), null, 'more than a year away says nothing');
  assert.equal(W.timeLeft(job({ estimate: est(1.5e29) }), NOW), null, 'nor a number of days in the 10^21');
  assert.equal(W.timeLeft(job({ estimate: est(10 * MIN, 'history', 'low') }), NOW)!.guess, true);
  assert.equal(W.timeLeft(job({ estimate: est(10 * MIN, 'progress', 'medium') }), NOW)!.guess, false);
  assert.equal(W.timeLeft(job({ estimate: est(30_000) }), NOW)!.text, 'less than a minute left');
  assert.equal(W.timeLeft(job({ estimate: est(-5000, 'agent', 'low') }), NOW)!.text, 'over its estimate');
  assert.equal(W.timeLeft(job({ estimate: est(-5000, 'agent', 'low') }), NOW)!.guess, false);
  assert.equal(W.timeLeft(job({ estimate: est(-5000, 'history', 'low') }), NOW)!.over, true);
  assert.equal(W.timeLeft(job({ estimate: est(-5000, 'output') }), NOW)!.text, 'less than a minute left', 'between two readings of its own output');
  assert.equal(W.timeLeft(job({ estimate: est(-2 * MIN, 'output') }), NOW)!.text, 'over its estimate');
  assert.equal(W.timeLeft(job({ estimate: est(HOUR, 'agent', 'low') }), NOW)!.source, W.SOURCE_WORDS.agent);
}

// ---- waiting
{
  const q = (more: Partial<JobEntry> = {}) => job({ id: 'job:j-2', state: 'queued', startedAt: undefined, ...more });
  assert.equal(W.startsIn(q(), NOW), null);
  assert.equal(W.startsIn(q({ startsAt: NOW + 40 * MIN }), NOW), 'starts in about 40 min');
  assert.equal(W.startsIn(q({ startsAt: NOW - 1000 }), NOW), 'starts in under a minute');
  assert.equal(W.startsIn(job({ startsAt: NOW + HOUR }), NOW), null, 'it runs already');

  const place = (position: number) => W.queuePlace(q({ queue: 'gpu', position }));
  assert.equal(place(1), 'Next in queue gpu');
  assert.deepEqual([2, 3, 4, 11, 12, 13, 21, 22, 23].map(place), ['2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd'].map((n) => `${n} in queue gpu`));
  assert.equal(W.queuePlace(q({ queue: 'gpu' })), null);
  assert.equal(W.queuePlace(job({ queue: 'gpu', position: 1 })), null);

  const index = job({ id: 'job:j-a' });
  const done = job({ id: 'job:j-b', state: 'done' });
  const waiting = q({ after: ['job:j-a', 'job:j-b', 'job:gone'] });
  const byId = new Map([index, done, waiting].map((j) => [j.id, j]));
  assert.deepEqual(W.waitsFor(waiting, byId).map((j) => j.id), ['job:j-a'], 'only what still runs or waits');
  assert.deepEqual(W.waitedBy(index, [waiting]).map((j) => j.id), ['job:j-2']);
  assert.deepEqual(W.waitedBy(done, [q({ after: ['job:j-b'] })]), [], 'an ended job has no "Then"');

  assert.equal(W.waitingWords(q({ waitingFor: 'a free GPU' }), 0), 'Waiting for a free GPU');
  assert.equal(W.waitingWords(q({ waitingFor: 'a free GPU' }), 2), 'Waiting for a free GPU', 'beside the jobs it names');
  assert.equal(W.waitingWords(waiting, 1), null, 'the jobs are named already');
  assert.equal(W.waitingWords(q({ queue: 'gpu', position: 1, waitingFor: 'its turn in queue gpu' }), 0), null, 'its place says it');
  assert.equal(W.waitingWords(q({ waitingFor: 'Build the index' }), 0), 'Waits for Build the index');
  assert.equal(W.waitingWords(q({ waitingFor: 'Waiting for 2 GPUs' }), 0), 'Waiting for 2 GPUs');
  assert.equal(W.waitingWords(q(), 0), 'Waiting to start');
  assert.equal(W.waitingWords(q({ waitingFor: 'its start' }), 0), 'Waiting to start');
  assert.equal(W.waitingWords(q({ waitingFor: 'a free slot' }), 0), 'Waiting for a free slot');
  assert.equal(W.waitingWords(job({ waitingFor: 'a free GPU' }), 0), null);
}

// ---- how it ended
{
  const ended = (more: Partial<JobEntry>) => job({ endedAt: NOW, ...more });
  assert.equal(W.endedWords(ended({ state: 'done' })), 'Done');
  assert.equal(W.endedWords(ended({ state: 'done', exitUnknown: true })), 'Ended', 'nobody saw how it ended');
  assert.equal(W.endedReason(ended({ state: 'done', exitUnknown: true, reason: 'Its process is gone' })), 'Its process is gone');
  assert.equal(W.endedWords(ended({ state: 'failed', exitCode: 2 })), 'Failed (exit code 2)');
  assert.equal(W.endedWords(ended({ state: 'failed' })), 'Failed');
  assert.equal(W.endedWords(ended({ state: 'stopped' })), 'Stopped');
  assert.equal(W.endedWords(ended({ state: 'cancelled' })), 'Never started');
  assert.equal(W.endedReason(ended({ state: 'failed', exitCode: 1, reason: 'Exit code 1' })), null, 'said already');
  assert.equal(W.endedReason(ended({ state: 'failed', exitCode: 1, reason: 'Its job command ended without a word' })), 'Its job command ended without a word');
  assert.equal(W.endedReason(ended({ state: 'stopped', reason: 'Stopped' })), null);
  assert.equal(W.endedReason(ended({ state: 'cancelled', reason: 'Waited for Build index, which failed' })), 'Waited for Build index, which failed');
  assert.equal(W.endedReason(ended({ state: 'done', reason: 'fine' })), null);
  assert.equal(W.stateWords(job()), 'Running');
  assert.equal(W.stateWords(job({ state: 'queued' })), 'Queued');
}

// ---- when it should all be done, and how much of a group runs
{
  assert.equal(W.allDoneWords(undefined, NOW), null, 'no end known');
  assert.equal(W.allDoneWords(NOW - 1000, NOW), null, 'past its estimate: nothing said of the end');
  assert.equal(W.allDoneWords(NOW + 20_000, NOW), 'in under a minute');
  assert.equal(W.allDoneWords(NOW + 26 * MIN, NOW), 'in about 26 min');
  assert.equal(W.allDoneWords(NOW + 2 * HOUR + 10 * MIN, NOW), 'in about 2 h 10 min');
  assert.equal(W.allDoneWords(NOW + 76 * HOUR, NOW), 'in about 3 days 4 h');
  assert.equal(W.allDoneWords(NOW + 2 * 365 * 24 * HOUR, NOW), null, 'more than a year away says nothing');
  assert.equal(W.groupDoneWords(undefined, NOW), null);
  assert.equal(W.groupDoneWords(NOW + 20_000, NOW), 'done in under a minute');
  assert.equal(W.groupDoneWords(NOW + 34 * MIN, NOW), 'done in about 34 min');
  assert.equal(W.groupDoneWords(NOW + HOUR - 10_000, NOW), 'done in about 1 h 00 min');
  assert.equal(W.countWords(3, 1), '3 running · 1 queued');
  assert.equal(W.countWords(0, 2), '2 queued');
  assert.equal(W.countWords(1, 0), '1 running');
}

// ---- progress
{
  const p = (fraction?: number, text?: string) => job({ progress: { fraction, text, at: NOW } });
  assert.equal(W.percent(job()), null);
  assert.equal(W.percent(p(undefined, 'epoch 3')), null);
  assert.equal(W.percent(p(0.29)), 29);
  assert.equal(W.percent(p(0.999)), 99, 'not 100% before the end');
  assert.equal(W.percent(p(1.4)), 100);
  assert.equal(W.progressText(p(0.45, '450/1000')), '450/1000');
  assert.equal(W.progressText(p(0.42, '42%')), null, 'the percent says it already');
  assert.equal(W.progressText(p(undefined, '42%')), '42%');
}

console.log('ok');
