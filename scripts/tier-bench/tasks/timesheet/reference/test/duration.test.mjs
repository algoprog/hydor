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

test('decimal hours round to the nearest minute, halves up', () => {
  assert.equal(parseDuration('1.333h'), 80);
  assert.equal(parseDuration('0.7h'), 42);
  assert.equal(parseDuration('0.025h'), 2); // 1.5 minutes
  assert.equal(parseDuration('1.025h'), 62); // 61.5 minutes
  assert.equal(parseDuration('0.008h'), 0);
});

test('hours and minutes with a colon: the minutes are two digits below 60', () => {
  assert.equal(parseDuration('1:30'), 90);
  assert.equal(parseDuration('1:05'), 65);
  assert.equal(parseDuration('0:45'), 45);
  assert.equal(parseDuration('12:00'), 720);
  for (const text of ['1:5', '1:60', '1:', ':30', '1:123']) assert.throws(() => parseDuration(text), /duration/, text);
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
