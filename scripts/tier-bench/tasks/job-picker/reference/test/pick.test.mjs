import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pickJobs } from '../src/pick.mjs';

const job = (id, minutes, due, profit) => ({ id, minutes, due, profit });

// A small seeded PRNG (mulberry32).
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The best profit by trying every subset, each run in due order.
function brute(jobs) {
  let best = 0;
  for (let mask = 0; mask < 1 << jobs.length; mask++) {
    const chosen = jobs.filter((_, i) => mask & (1 << i)).sort((a, b) => a.due - b.due);
    let time = 0;
    let profit = 0;
    let ok = true;
    for (const j of chosen) {
      time += j.minutes;
      profit += j.profit;
      if (time > j.due) ok = false;
    }
    if (ok && profit > best) best = profit;
  }
  return best;
}

// The answer is valid: every id once, every job on time, and the profit is the sum of theirs.
function assertValid(jobs, { profit, order }) {
  const byId = new Map(jobs.map((j) => [j.id, j]));
  assert.equal(new Set(order).size, order.length);
  let time = 0;
  let sum = 0;
  for (const id of order) {
    const j = byId.get(id);
    assert.ok(j, `unknown id ${id}`);
    time += j.minutes;
    sum += j.profit;
    assert.ok(time <= j.due, `${id} ends at ${time}, after ${j.due}`);
  }
  assert.equal(sum, profit);
}

test('no jobs', () => {
  assert.deepEqual(pickJobs([]), { profit: 0, order: [] });
});

test('a long profitable job that crowds out cheaper ones that earn more together', () => {
  const jobs = [job('big', 10, 10, 10), job('a', 2, 10, 3), job('b', 3, 10, 3), job('c', 2, 10, 3), job('d', 3, 10, 3)];
  const r = pickJobs(jobs);
  assert.equal(r.profit, 12);
  assertValid(jobs, r);
});

test('jobs listed latest due first', () => {
  const jobs = [job('a', 5, 20, 9), job('b', 5, 10, 8), job('c', 5, 5, 7), job('d', 5, 15, 6)];
  const r = pickJobs(jobs);
  assert.deepEqual(r, { profit: 30, order: ['c', 'b', 'd', 'a'] });
});

test('zero-minute jobs, jobs due at 0, and profits of zero or less', () => {
  const jobs = [job('a', 0, 0, 4), job('b', 1, 0, 100), job('c', 0, 0, 3), job('d', 2, 5, 1), job('e', 1, 9, -4), job('f', 1, 9, 0)];
  const r = pickJobs(jobs);
  assert.equal(r.profit, 8);
  assertValid(jobs, r);
});

test('a due time far beyond the work', () => {
  const jobs = [job('a', 5, 1e9, 3), job('b', 7, 1e9, 4), job('c', 1, 2, 1)];
  const r = pickJobs(jobs);
  assert.equal(r.profit, 8);
  assertValid(jobs, r);
});

test('profits too big for 32 bits', () => {
  const jobs = Array.from({ length: 10 }, (_, i) => job(`j${i}`, 1, 100, 2e9));
  assert.equal(pickJobs(jobs).profit, 2e10);
});

test('does not change the jobs it is given', () => {
  const jobs = [job('b', 5, 9, 1), job('a', 3, 4, 2)];
  const copy = structuredClone(jobs);
  pickJobs(jobs);
  assert.deepEqual(jobs, copy);
});

test('agrees with trying every subset on random small inputs', () => {
  const rand = prng(7);
  const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  for (let round = 0; round < 300; round++) {
    const dueMax = int(0, 40);
    const jobs = Array.from({ length: int(0, 12) }, (_, i) => job(`j${i}`, int(0, 12), int(0, dueMax), int(-3, 12)));
    const r = pickJobs(jobs);
    assert.equal(r.profit, brute(jobs), JSON.stringify(jobs));
    assertValid(jobs, r);
  }
});

test('2,000 jobs in a moment', () => {
  const rand = prng(11);
  const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const jobs = Array.from({ length: 2000 }, (_, i) => job(`j${i}`, int(0, 600), int(0, 20000), int(-50, 500)));
  const started = Date.now();
  const r = pickJobs(jobs);
  assert.ok(Date.now() - started < 2000);
  assertValid(jobs, r);
});
