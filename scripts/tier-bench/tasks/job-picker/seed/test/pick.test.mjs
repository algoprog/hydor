import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pickJobs } from '../src/pick.mjs';

const job = (id, minutes, due, profit) => ({ id, minutes, due, profit });

test('no jobs', () => {
  assert.deepEqual(pickJobs([]), { profit: 0, order: [] });
});

test('every job fits', () => {
  const r = pickJobs([job('a', 30, 100, 5), job('b', 20, 50, 7)]);
  assert.equal(r.profit, 12);
  assert.deepEqual(r.order, ['b', 'a']);
});

test('a job that cannot end by its due time is left out', () => {
  const r = pickJobs([job('a', 60, 30, 100), job('b', 10, 30, 1)]);
  assert.deepEqual(r, { profit: 1, order: ['b'] });
});

test('the more profitable of two jobs that cannot both be on time', () => {
  const r = pickJobs([job('a', 40, 50, 3), job('b', 40, 50, 9)]);
  assert.deepEqual(r, { profit: 9, order: ['b'] });
});
