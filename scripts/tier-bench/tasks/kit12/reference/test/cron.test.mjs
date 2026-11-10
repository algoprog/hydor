import test from 'node:test';
import assert from 'node:assert/strict';
import { nextRun } from '../src/cron.mjs';

const at = (s) => new Date(s);

test('nextRun', () => {
  assert.equal(nextRun('*/15 * * * *', at('2024-01-01T10:07:30Z')).toISOString(), '2024-01-01T10:15:00.000Z');
  assert.equal(nextRun('0 0 * * *', at('2024-01-01T00:00:00Z')).toISOString(), '2024-01-02T00:00:00.000Z');
  assert.equal(nextRun('0 9 * * 1', at('2024-01-03T12:00:00Z')).toISOString(), '2024-01-08T09:00:00.000Z');
  assert.equal(nextRun('0 12 13 * 5', at('2024-01-01T00:00:00Z')).toISOString(), '2024-01-05T12:00:00.000Z');
});

test('nextRun errors', () => {
  assert.throws(() => nextRun('* * * *', at('2024-01-01T00:00:00Z')), RangeError);
  assert.throws(() => nextRun('0 0 30 2 *', at('2024-01-01T00:00:00Z')), RangeError);
});
