// Hidden checker for flaky-queue. Run: node check.mjs <workdir>
// 200 seeded scenarios on a virtual clock (the queue's `timers` option), in 20 groups of 10, plus CAUSE.md.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

if (!process.argv[2]) {
  console.error('usage: node check.mjs <workdir>');
  process.exit(1);
}
const dir = path.resolve(process.argv[2]);
const GROUPS = 20;
const PER_GROUP = 10;

// A small seeded PRNG (mulberry32).
function prng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  return { next, int, chance: (p) => next() < p };
}

// A virtual clock. Timers fire in order of time, then of creation.
function fakeTimers() {
  let now = 0;
  let seq = 0;
  const pending = new Map();
  return {
    now: () => now,
    setTimeout(fn, ms = 0) {
      const id = ++seq;
      pending.set(id, { id, at: now + Math.max(0, ms), fn });
      return id;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
    // Fires the next timer; false when there is none.
    step() {
      let best;
      for (const t of pending.values()) if (!best || t.at < best.at || (t.at === best.at && t.id < best.id)) best = t;
      if (!best) return false;
      pending.delete(best.id);
      now = Math.max(now, best.at);
      best.fn();
      return true;
    },
  };
}

const macrotask = () => new Promise((resolve) => setImmediate(resolve));
async function flush() {
  for (let i = 0; i < 3; i++) await macrotask();
}

// Builds one scenario from a seed: queue options and, for every job, what each attempt does.
function makeScenario(seed) {
  const r = prng(seed);
  const timeoutMs = r.chance(0.5) ? r.int(20, 40) : 0;
  const options = { concurrency: r.int(1, 4), retries: r.int(0, 3), backoffMs: r.int(0, 20), timeoutMs };
  const jobs = [];
  const count = r.int(1, 8);
  for (let i = 0; i < count; i++) {
    const attempts = [];
    for (let k = 0; k <= options.retries; k++) {
      const roll = r.next();
      if (roll < 0.02) attempts.push({ kind: 'reject', d: r.int(1, 15) });
      else if (roll < 0.025) attempts.push({ kind: 'throw', d: 0 });
      else if (roll < 0.03) attempts.push({ kind: 'rejectString', d: r.int(1, 15) });
      else if (roll < 0.05 && timeoutMs > 0) attempts.push({ kind: r.chance(0.3) ? 'hang' : 'late', d: timeoutMs + r.int(1, 30), lateOk: r.chance(0.5) });
      else if (roll < 0.10) attempts.push({ kind: 'sync', d: 0 });
      else attempts.push({ kind: 'ok', d: r.int(1, 15) });
    }
    jobs.push({ i, attempts });
  }
  return { options, jobs };
}

// What a correct queue must report for a job: how many attempts, and the outcome.
function expectedOutcome(job, timeoutMs) {
  for (let k = 0; k < job.attempts.length; k++) {
    const a = job.attempts[k];
    const timedOut = timeoutMs > 0 && (a.kind === 'late' || a.kind === 'hang');
    if (a.kind === 'ok' || a.kind === 'sync') return { runs: k + 1, ok: true, value: `job${job.i}#${k + 1}` };
    if (!timedOut && (a.kind === 'late' || a.kind === 'hang')) throw new Error('checker bug');
    if (k === job.attempts.length - 1) return { runs: k + 1, ok: false, kind: a.kind, k };
  }
}

async function runScenario(JobQueue, seed) {
  const { options, jobs } = makeScenario(seed);
  const timers = fakeTimers();
  const queue = new JobQueue({ ...options, timers });
  const log = []; // every attempt: { job, k, start, end }
  const reasons = new Map(); // what a failing attempt rejects with, by job and attempt
  const runs = jobs.map(() => 0);
  const state = jobs.map(() => ({ settled: false, ok: undefined, value: undefined, times: 0 }));

  const makeFn = (job) => () => {
    const k = runs[job.i]++;
    const a = job.attempts[k] ?? { kind: 'ok', d: 1 }; // more attempts than allowed: recorded below, scripted as ok
    const start = timers.now();
    const entry = { job: job.i, k, start, end: start + (a.kind === 'late' || a.kind === 'hang' ? options.timeoutMs : a.d) };
    log.push(entry);
    const value = `job${job.i}#${k + 1}`;
    const err = new Error(`fail ${job.i}#${k + 1}`);
    reasons.set(`${job.i}:${k}`, a.kind === 'rejectString' ? `str ${job.i}#${k + 1}` : err);
    switch (a.kind) {
      case 'sync':
        return value;
      case 'throw':
        throw err;
      case 'hang':
        return new Promise(() => {});
      case 'late':
        return new Promise((resolve, reject) => timers.setTimeout(() => (a.lateOk ? resolve('late value') : reject(new Error('late error'))), a.d));
      default:
        return new Promise((resolve, reject) => timers.setTimeout(() => (a.kind === 'ok' ? resolve(value) : reject(reasons.get(`${job.i}:${k}`))), a.d));
    }
  };

  const promises = jobs.map((job) =>
    queue.add(makeFn(job)).then(
      (value) => Object.assign(state[job.i], { settled: true, ok: true, value, times: state[job.i].times + 1 }),
      (reason) => Object.assign(state[job.i], { settled: true, ok: false, value: reason, times: state[job.i].times + 1 }),
    ),
  );

  let drainedAt; // what the world looked like when drain() resolved
  queue.drain().then(async () => {
    await flush();
    drainedAt = { time: timers.now(), settled: state.map((s) => s.settled) };
  });

  await flush();
  for (let steps = 0; steps < 5000; steps++) {
    if (!timers.step()) break;
    await flush();
  }
  await flush();

  const where = `seed ${seed}`;
  assert.ok(drainedAt, `${where}: drain() never resolved`);
  assert.ok(drainedAt.settled.every(Boolean), `${where}: drain() resolved while job(s) ${drainedAt.settled.map((s, i) => (s ? -1 : i)).filter((i) => i >= 0)} had not settled`);
  await Promise.all(promises);

  for (const job of jobs) {
    const want = expectedOutcome(job, options.timeoutMs);
    const got = state[job.i];
    assert.equal(got.times, 1, `${where}: job ${job.i} settled ${got.times} times`);
    assert.equal(runs[job.i], want.runs, `${where}: job ${job.i} ran ${runs[job.i]} time(s), expected ${want.runs} (retries ${options.retries})`);
    assert.ok(runs[job.i] <= options.retries + 1, `${where}: job ${job.i} ran more than retries + 1 times`);
    assert.equal(got.ok, want.ok, `${where}: job ${job.i} ${got.ok ? 'resolved' : 'rejected'}, expected the opposite`);
    if (want.ok) {
      assert.equal(got.value, want.value, `${where}: job ${job.i} resolved with ${got.value}`);
    } else if (want.kind === 'late' || want.kind === 'hang') {
      assert.ok(got.value instanceof Error && got.value.message === 'job timed out', `${where}: job ${job.i} should fail with 'job timed out'`);
    } else {
      assert.ok(Object.is(got.value, reasons.get(`${job.i}:${want.k}`)), `${where}: job ${job.i} rejected with something other than the last error`);
    }
  }

  // At most `concurrency` attempts at the same time (an attempt that timed out stops counting at once), and a retry
  // starts no sooner than backoffMs after the failed attempt ended.
  for (const a of log) {
    // Attempts that end the moment they start (a plain return, a throw) only hold their place for an instant.
    const overlapping = a.end === a.start ? 0 : log.filter((b) => b === a || (b.start <= a.start && b.end > a.start)).length;
    assert.ok(overlapping <= options.concurrency, `${where}: ${overlapping} attempts at time ${a.start}, concurrency is ${options.concurrency}`);
    const previous = log.find((b) => b.job === a.job && b.k === a.k - 1);
    if (previous) assert.ok(a.start >= previous.end + options.backoffMs, `${where}: job ${a.job} retried after ${a.start - previous.end} ms, backoff is ${options.backoffMs}`);
  }
}

const cases = [];
for (let g = 0; g < GROUPS; g++) {
  cases.push([
    `scenarios ${g * PER_GROUP + 1}-${(g + 1) * PER_GROUP}`,
    async () => {
      const { JobQueue } = await import(pathToFileURL(path.join(dir, 'src/queue.mjs')).href);
      const problems = [];
      for (let s = 0; s < PER_GROUP; s++) {
        try {
          await runScenario(JobQueue, 1000 + g * PER_GROUP + s);
        } catch (e) {
          problems.push(String(e?.message ?? e).split("\n")[0]);
        }
      }
      assert.deepEqual(problems, []);
    },
  ]);
}
cases.push([
  'CAUSE.md exists and says something',
  () => {
    const text = fs.readFileSync(path.join(dir, 'CAUSE.md'), 'utf8');
    assert.ok(text.trim().length > 0);
  },
]);

const failed = [];
for (const [name, fn] of cases) {
  try {
    await fn();
  } catch (e) {
    failed.push(name);
    if (process.env.CHECK_VERBOSE) console.error(`FAIL ${name}: ${String(e?.message ?? e).split('\n')[0]} ${JSON.stringify(e?.actual ?? '').slice(0, 300)}`);
  }
}
console.log(JSON.stringify({ passed: cases.length - failed.length, total: cases.length, failed }));
