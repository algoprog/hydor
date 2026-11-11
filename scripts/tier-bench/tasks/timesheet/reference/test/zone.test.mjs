import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addMinutes, instantOf, minutesBetween, nowLocal, parseLocal } from '../src/zone.mjs';

const ATHENS = 'Europe/Athens';

test('reads a local time', () => {
  assert.deepEqual(parseLocal('2025-05-02T09:30'), { year: 2025, month: 5, day: 2, hour: 9, minute: 30 });
});

test('refuses text that is not a real local time', () => {
  for (const text of ['2025-05-02', '2025-05-02 09:30', '2025-02-30T09:00', '2025-05-02T24:00', '2025-05-02T09:60']) {
    assert.throws(() => parseLocal(text), /local time|real date/, text);
  }
});

test('counts minutes on an ordinary day', () => {
  assert.equal(minutesBetween('2025-05-02T09:00', '2025-05-02T17:30', ATHENS), 510);
  assert.equal(minutesBetween('2025-05-02T22:00', '2025-05-03T06:00', ATHENS), 480);
  assert.equal(addMinutes('2025-05-02T23:30', 45, ATHENS), '2025-05-03T00:15');
});

test('the night the clocks go back lasts an hour longer, the night they go forward an hour shorter', () => {
  assert.equal(minutesBetween('2025-10-25T22:00', '2025-10-26T06:00', ATHENS), 540);
  assert.equal(minutesBetween('2025-03-29T22:00', '2025-03-30T06:00', ATHENS), 420);
  assert.equal(minutesBetween('2025-11-01T22:00', '2025-11-02T06:00', 'America/New_York'), 540);
  assert.equal(minutesBetween('2025-04-05T22:00', '2025-04-06T06:00', 'Australia/Sydney'), 540);
  assert.equal(minutesBetween('2025-04-05T22:00', '2025-04-06T06:00', 'Australia/Lord_Howe'), 510);
});

test('a local time that happens twice is the first of the two', () => {
  // 03:30 in Athens on 26 October 2025 is 00:30 UTC (summer time) and again 01:30 UTC (winter time).
  assert.equal(instantOf('2025-10-26T03:30', ATHENS), Date.UTC(2025, 9, 26, 0, 30) / 60000);
});

test('a local time that does not exist is an error', () => {
  assert.throws(() => instantOf('2025-03-30T03:30', ATHENS), /no such time in Europe\/Athens: 2025-03-30T03:30/);
  assert.equal(minutesBetween('2025-03-30T02:59', '2025-03-30T04:00', ATHENS), 1);
});

test('adding minutes counts real time over a change', () => {
  assert.equal(addMinutes('2025-10-25T22:00', 540, ATHENS), '2025-10-26T06:00');
  assert.equal(addMinutes('2025-03-29T22:00', 420, ATHENS), '2025-03-30T06:00');
});

test('the local time now is in the time zone it is asked for', () => {
  const at = Date.UTC(2025, 4, 2, 21, 30);
  assert.equal(nowLocal(ATHENS, at), '2025-05-03T00:30');
  assert.equal(nowLocal('America/New_York', at), '2025-05-02T17:30');
});
