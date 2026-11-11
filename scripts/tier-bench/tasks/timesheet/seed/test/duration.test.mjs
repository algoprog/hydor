import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDuration, parseDuration } from '../src/duration.mjs';

test('parses minutes, hours, hours and minutes, and decimal hours', () => {
  assert.equal(parseDuration('90m'), 90);
  assert.equal(parseDuration('2h'), 120);
  assert.equal(parseDuration('1h30m'), 90);
  assert.equal(parseDuration('1.5h'), 90);
  assert.equal(parseDuration('0.25h'), 15);
});

test('decimal hours round to the nearest minute', () => {
  assert.equal(parseDuration('1.333h'), 80);
  assert.equal(parseDuration('0.7h'), 42);
});

test('refuses what is not a duration', () => {
  for (const text of ['', 'abc', '90', '1h30', '-5m', '1h 30m']) assert.throws(() => parseDuration(text), /duration/, text);
});

test('shows h:mm with the hours as long as they need to be', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(5), '0:05');
  assert.equal(formatDuration(540), '9:00');
  assert.equal(formatDuration(26 * 60 + 30), '26:30');
});
