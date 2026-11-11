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
