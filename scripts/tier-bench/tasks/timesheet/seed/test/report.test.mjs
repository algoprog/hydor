import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildReport, renderReport } from '../src/report.mjs';

const data = {
  timeZone: 'Europe/Athens',
  currency: 'USD',
  rates: { acme: 6000 },
  entries: [
    { id: 1, project: 'acme', start: '2025-05-05T09:00', end: '2025-05-05T11:00', note: '' },
    { id: 2, project: 'acme', start: '2025-05-07T09:00', end: '2025-05-07T09:30', note: '' },
    { id: 3, project: 'misc', start: '2025-05-12T09:00', end: '2025-05-12T10:00', note: '' },
  ],
};

test('days in the range, their total and the projects', () => {
  const r = buildReport(data, { from: '2025-05-05', to: '2025-05-11' });
  assert.equal(r.days.length, 7);
  assert.deepEqual(r.days.map((d) => d.minutes), [120, 0, 30, 0, 0, 0, 0]);
  assert.equal(r.total, 150);
  assert.deepEqual(r.projects, [{ name: 'acme', minutes: 150, amount: '$150.00' }]);
});

test('an entry counts on the day it starts, whatever its end', () => {
  const night = { ...data, entries: [{ id: 1, project: 'acme', start: '2025-05-05T22:00', end: '2025-05-06T02:00', note: '' }] };
  const r = buildReport(night, { from: '2025-05-05', to: '2025-05-06' });
  assert.deepEqual(r.days.map((d) => d.minutes), [240, 0]);
});

test('a report with nothing in it ends at the total', () => {
  const text = renderReport('Report', buildReport(data, { from: '2025-06-01', to: '2025-06-01' }));
  assert.equal(text, 'Report\nSun 2025-06-01    0:00\nTotal             0:00\n');
});
