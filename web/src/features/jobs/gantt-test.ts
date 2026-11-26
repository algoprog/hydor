// Script tests for where the Jobs page's timeline puts its bars (gantt.ts): running ones with and without an estimate,
// over their estimate; waiting ones at their start or after what they wait for; the ended ones that are waited for; the
// joins between them; and the axis's marks. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/jobs/gantt-test.ts && node dist/dev/gantt-test.js
import assert from 'node:assert/strict';
import type { JobEntry } from '@shared/jobs';
import { along, ganttOf, ticks } from './gantt';

const MIN = 60_000;
const NOW = 1_800_000_000_000;
const job = (id: string, more: Partial<JobEntry> = {}): JobEntry => ({ id, kind: 'job', state: 'running', name: id, ...more });
const est = (at: number) => ({ endsAt: NOW + at, source: 'progress' as const, confidence: 'high' as const });

{
  const running = [
    job('a', { startedAt: NOW - 20 * MIN, estimate: est(10 * MIN) }),
    job('b', { startedAt: NOW - 10 * MIN }),
    job('c', { startedAt: NOW - 5 * MIN, estimate: est(-MIN) }),
  ];
  const queued = [
    job('d', { state: 'queued', after: ['a', 'old'], startsAt: NOW + 10 * MIN, estimate: est(30 * MIN) }),
    job('e', { state: 'queued', after: ['b'] }),
    job('f', { state: 'queued', after: ['e'] }),
  ];
  const ended = [job('old', { state: 'done', startedAt: NOW - 30 * MIN, endedAt: NOW - 25 * MIN }), job('other', { state: 'done', startedAt: NOW - 300 * MIN, endedAt: NOW - 200 * MIN })];
  const g = ganttOf({ running, queued, ended }, NOW);
  assert.deepEqual(g.rows.map((r) => r.job.id), ['old', 'a', 'b', 'c', 'd', 'e', 'f'], 'an ended job only when one waited for it');
  const row = Object.fromEntries(g.rows.map((r) => [r.job.id, r]));
  assert.equal(g.from, NOW - 30 * MIN);
  assert.deepEqual([row.a.from, row.a.solidTo, row.a.estTo, row.a.to, row.a.open], [NOW - 20 * MIN, NOW, NOW + 10 * MIN, NOW + 10 * MIN, false]);
  assert.equal(row.b.open, true);
  assert.ok(row.b.to > NOW, 'a stretch that fades beyond now');
  assert.deepEqual([row.c.over, row.c.open, row.c.to], [true, false, NOW]);
  assert.deepEqual([row.d.from, row.d.to, row.d.unsure], [NOW + 10 * MIN, NOW + 30 * MIN, false]);
  assert.equal(row.e.from, row.b.to, 'unknown start: after what it waits for');
  assert.equal(row.e.unsure, true);
  assert.equal(row.f.from, row.e.to);
  assert.ok(g.to > row.f.to, 'room after the last bar');
  const names = g.links.map((l) => `${g.rows[l.a].job.id}>${g.rows[l.b].job.id}`).sort();
  assert.deepEqual(names, ['a>d', 'b>e', 'e>f', 'old>d']);
  assert.equal(along(g, g.from), 0);
  assert.equal(along(g, g.to), 100);
  assert.equal(along(g, g.from - MIN), 0);
}

// A queue without estimates: one after another; a start that is due shows at now.
{
  const g = ganttOf({ running: [job('a', { startedAt: NOW - 1000, queue: 'gpu' })], queued: [job('b', { state: 'queued', queue: 'gpu' }), job('c', { state: 'queued', startsAt: NOW - MIN })], ended: [] }, NOW);
  assert.equal(g.rows[1].from, g.rows[0].to);
  assert.equal(g.rows[2].from, NOW);
  assert.ok(g.to - g.from >= MIN, 'never a very short axis');
}

// Marks on round times.
{
  const t = ticks(NOW + 1234, NOW + 60 * MIN, 6);
  assert.equal(t.step, 10 * MIN);
  assert.ok(t.at.length >= 5 && t.at.length <= 6);
  assert.ok(t.at.every((x) => x % (10 * MIN) === 0));
  const india = 330 * MIN;
  assert.ok(ticks(NOW, NOW + 6 * 60 * MIN, 6, india).at.every((x) => (x + india) % (60 * MIN) === 0), 'on the local clock’s hours');
  assert.equal(ticks(NOW, NOW + 3 * 24 * 60 * MIN, 6).step, 12 * 60 * MIN);
}

console.log('ok');
