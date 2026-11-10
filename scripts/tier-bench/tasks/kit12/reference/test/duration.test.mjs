import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDuration, formatDuration } from '../src/duration.mjs';

test('parseDuration', () => {
  assert.equal(parseDuration('1h 30m'), 5400000);
  assert.equal(parseDuration('2d4h'), 187200000);
  assert.equal(parseDuration('1500'), 1500);
  assert.equal(parseDuration(' 2 H 5 M '), 7500000);
  for (const bad of ['', 'abc', '1x', 'h', '-5s', 5]) assert.throws(() => parseDuration(bad), RangeError);
});

test('formatDuration', () => {
  assert.equal(formatDuration(5400000), '1h 30m');
  assert.equal(formatDuration(1500), '1s 500ms');
  assert.equal(formatDuration(0), '0ms');
  assert.throws(() => formatDuration(-1), RangeError);
  assert.throws(() => formatDuration(Infinity), RangeError);
});
