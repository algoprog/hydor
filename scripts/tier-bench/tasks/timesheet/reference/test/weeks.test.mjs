import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays, dayName, mondayOf, weekOf, weekRange } from '../src/weeks.mjs';

test('a week in the middle of the year runs Monday to Sunday', () => {
  assert.deepEqual(weekRange('2025-W43'), { from: '2025-10-20', to: '2025-10-26' });
  assert.deepEqual(weekRange('2024-W10'), { from: '2024-03-04', to: '2024-03-10' });
});

test('the week of a date in the middle of the year', () => {
  assert.equal(weekOf('2025-10-22'), '2025-W43');
  assert.equal(weekOf('2024-07-01'), '2024-W27');
});

test('week 1 is the week with 4 January in it', () => {
  assert.deepEqual(weekRange('2025-W01'), { from: '2024-12-30', to: '2025-01-05' });
  assert.deepEqual(weekRange('2026-W01'), { from: '2025-12-29', to: '2026-01-04' });
  assert.deepEqual(weekRange('2021-W01'), { from: '2021-01-04', to: '2021-01-10' });
  assert.deepEqual(weekRange('2023-W01'), { from: '2023-01-02', to: '2023-01-08' });
});

test('around New Year a date can be in the week of the year before or after', () => {
  assert.equal(weekOf('2024-12-30'), '2025-W01');
  assert.equal(weekOf('2025-12-31'), '2026-W01');
  assert.equal(weekOf('2021-01-01'), '2020-W53');
  assert.equal(weekOf('2027-01-03'), '2026-W53');
  assert.equal(weekOf('2027-01-04'), '2027-W01');
  assert.equal(weekOf('2016-01-03'), '2015-W53');
});

test('some years have a week 53', () => {
  assert.deepEqual(weekRange('2020-W53'), { from: '2020-12-28', to: '2021-01-03' });
  assert.deepEqual(weekRange('2026-W53'), { from: '2026-12-28', to: '2027-01-03' });
  for (const id of ['2021-W53', '2025-W53', '2024-W53', '2025-W00']) assert.throws(() => weekRange(id), /no week/, id);
});

test('dates: names of days, adding days, the Monday of a week', () => {
  assert.equal(dayName('2025-10-26'), 'Sun');
  assert.equal(dayName('2025-10-20'), 'Mon');
  assert.equal(addDays('2025-02-27', 2), '2025-03-01');
  assert.equal(mondayOf('2025-10-26'), '2025-10-20');
});

test('refuses weeks and dates that are not real', () => {
  assert.throws(() => weekRange('2025-43'), /week/);
  assert.throws(() => weekRange('2025-W99'), /no week/);
  assert.throws(() => addDays('2025-02-30', 1), /real date/);
});
