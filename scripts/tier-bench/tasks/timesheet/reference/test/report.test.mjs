import assert from 'node:assert/strict';
import { test } from 'node:test';
import { instantOf } from '../src/zone.mjs';
import { buildReport, renderReport } from '../src/report.mjs';

const ATHENS = 'Europe/Athens';
const entry = (id, project, start, end) => ({ id, project, start, end, note: '' });
const data = {
  timeZone: ATHENS,
  currency: 'USD',
  rates: { acme: 6000, globex: 7550 },
  entries: [
    entry(1, 'acme', '2025-05-05T09:00', '2025-05-05T11:00'),
    entry(2, 'acme', '2025-05-07T09:00', '2025-05-07T09:30'),
    entry(3, 'misc', '2025-05-12T09:00', '2025-05-12T10:00'),
  ],
};
const NOW = instantOf('2025-05-20T12:00', ATHENS);
const week = { from: '2025-05-05', to: '2025-05-11' };
const dayMinutes = (r) => r.days.map((d) => d.minutes);

test('days in the range, their total and the projects', () => {
  const r = buildReport(data, week, NOW);
  assert.equal(r.days.length, 7);
  assert.deepEqual(dayMinutes(r), [120, 0, 30, 0, 0, 0, 0]);
  assert.equal(r.total, 150);
  assert.deepEqual(r.projects, [{ name: 'acme', minutes: 150, amount: '$150.00' }]);
});

test('an entry counts on the day it starts, whatever its end', () => {
  const night = { ...data, entries: [entry(1, 'acme', '2025-05-05T22:00', '2025-05-06T02:00')] };
  assert.deepEqual(dayMinutes(buildReport(night, { from: '2025-05-05', to: '2025-05-06' }, NOW)), [240, 0]);
});

test('a night over the clocks going back lasts nine hours', () => {
  const night = { ...data, entries: [entry(1, 'acme', '2025-10-25T22:00', '2025-10-26T06:00')] };
  assert.deepEqual(dayMinutes(buildReport(night, { from: '2025-10-25', to: '2025-10-26' }, NOW)), [540, 0]);
});

test('time covered by several entries of a day counts once, in the day but not in the project', () => {
  const overlapping = {
    ...data,
    entries: [
      entry(1, 'acme', '2025-05-05T08:00', '2025-05-05T14:00'),
      entry(2, 'globex', '2025-05-05T09:00', '2025-05-05T13:00'),
      entry(3, 'acme', '2025-05-05T13:30', '2025-05-05T15:00'),
      entry(4, 'acme', '2025-05-05T15:00', '2025-05-05T16:00'),
      entry(5, 'acme', '2025-05-06T08:00', '2025-05-06T09:00'),
    ],
  };
  const r = buildReport(overlapping, week, NOW);
  assert.deepEqual(dayMinutes(r), [480, 60, 0, 0, 0, 0, 0]);
  assert.equal(r.total, 540);
  assert.deepEqual(r.projects.map((p) => p.minutes), [(360 + 90 + 60 + 60), 240]);
});

test('entries that start on different days are not merged', () => {
  const nights = {
    ...data,
    entries: [entry(1, 'acme', '2025-05-05T22:00', '2025-05-06T04:00'), entry(2, 'acme', '2025-05-06T01:00', '2025-05-06T03:00')],
  };
  assert.deepEqual(dayMinutes(buildReport(nights, week, NOW)), [360, 120, 0, 0, 0, 0, 0]);
});

test('a running entry counts up to now', () => {
  const running = { ...data, entries: [{ id: 1, project: 'acme', start: '2025-05-05T09:00', note: '' }] };
  const r = buildReport(running, week, instantOf('2025-05-05T10:30', ATHENS));
  assert.deepEqual(dayMinutes(r), [90, 0, 0, 0, 0, 0, 0]);
});

test('a project is rounded once, for its total', () => {
  const three = { ...data, entries: [20, 21, 22].map((m, i) => entry(i + 1, 'globex', `2025-05-0${5 + i}T09:00`, `2025-05-0${5 + i}T09:${m}`)) };
  assert.equal(buildReport(three, week, NOW).projects[0].amount, '$79.28'); // 63 minutes: 7927.5 cents, up
});

test('a report with nothing in it ends at the total', () => {
  const text = renderReport('Report', buildReport(data, { from: '2025-06-01', to: '2025-06-01' }, NOW));
  assert.equal(text, 'Report\nSun 2025-06-01    0:00\nTotal             0:00\n');
});
