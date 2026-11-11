import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addMinutes, minutesBetween, nowLocal, parseLocal } from '../src/zone.mjs';

test('reads a local time', () => {
  assert.deepEqual(parseLocal('2025-05-02T09:30'), { year: 2025, month: 5, day: 2, hour: 9, minute: 30 });
});

test('refuses text that is not a real local time', () => {
  for (const text of ['2025-05-02', '2025-05-02 09:30', '2025-02-30T09:00', '2025-05-02T24:00', '2025-05-02T09:60']) {
    assert.throws(() => parseLocal(text), /local time|real date/, text);
  }
});

test('counts minutes on an ordinary day', () => {
  assert.equal(minutesBetween('2025-05-02T09:00', '2025-05-02T17:30'), 510);
  assert.equal(minutesBetween('2025-05-02T22:00', '2025-05-03T06:00'), 480);
  assert.equal(addMinutes('2025-05-02T23:30', 45), '2025-05-03T00:15');
});

test('the local time now is in the time zone it is asked for', () => {
  const at = Date.UTC(2025, 4, 2, 21, 30);
  assert.equal(nowLocal('Europe/Athens', at), '2025-05-03T00:30');
  assert.equal(nowLocal('America/New_York', at), '2025-05-02T17:30');
});
