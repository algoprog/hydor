// Script tests for the activity stats (stats.ts): a week, month or year so far compared with the one before up to the
// same point, an earlier period compared with the whole period before it, the whole window without a period, the
// day's boundary in the viewer's time zone, and the period keys a page may ask for. Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/stats-test.ts
//   DATA_DIR=/tmp/hydor-test-stats node dist/dev/stats-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from './db.ts';
import { computeStats, periodKey } from './stats.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-stats-test-'));
const db = openDb(path.join(tmp, 'test.db'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

// Wednesday 18 Nov 2026, 15:30 UTC.
const NOW = Date.UTC(2026, 10, 18, 15, 30);
const at = (y: number, mo: number, d: number, h: number) => Math.floor(Date.UTC(y, mo - 1, d, h) / 3_600_000);

db.exec('delete from sessions');
db.prepare('insert or replace into sessions (key, agent, id, path, cwd, model, updated_at) values (?, ?, ?, ?, ?, ?, ?)').run('claude:a', 'claude', 'a', '/x/a', '/home/u/p1', 'claude-opus-5-5', NOW);
db.prepare('insert or replace into sessions (key, agent, id, path, cwd, model, updated_at) values (?, ?, ?, ?, ?, ?, ?)').run('codex:b', 'codex', 'b', '/x/b', '/home/u/p2', 'gpt-5.5', NOW);

const row = (key: string, hour: number, prompts: number) => {
  const agent = key.split(':')[0];
  db.prepare('insert into activity (key, root, agent, hour, prompts, tokens_out) values (?, ?, ?, ?, ?, ?)').run(key, key, agent, hour, prompts, prompts * 100);
};

const weekRows = () => {
  row('claude:a', at(2026, 11, 16, 10), 1);
  row('claude:a', at(2026, 11, 18, 15), 2);
  row('codex:b', at(2026, 11, 10, 9), 4);
  row('codex:b', at(2026, 11, 11, 15), 8);
  row('codex:b', at(2026, 11, 11, 16), 16);
  row('codex:b', at(2026, 11, 13, 12), 32);
  row('codex:b', at(2026, 11, 2, 8), 64);
};

test('a week so far, compared with last week up to the same hour', () => {
  db.exec('delete from activity');
  weekRows();
  const s = computeStats(db, { granularity: 'week', tz: 'UTC', period: 'current', now: NOW });
  assert.equal(s.period!.key, '2026-11-16');
  assert.equal(s.period!.current, true);
  assert.equal(s.totals.prompts, 3);
  assert.equal(s.previous.prompts, 12);
  assert.equal(s.window!.prompts, 127);
  assert.equal(s.buckets[s.buckets.length - 1].prompts, 3);
  assert.equal(s.buckets.find((b) => b.key === '2026-11-09')!.prompts, 60);
  assert.deepEqual(s.byModel.map((m) => m.model), ['claude-opus-5-5']);
  assert.deepEqual(s.agents.map((a) => a.id), ['claude']);
  assert.equal(s.totals.sessions, 1);
});

test('an earlier week, compared with the whole week before', () => {
  db.exec('delete from activity');
  weekRows();
  const s = computeStats(db, { granularity: 'week', tz: 'UTC', period: '2026-11-11', now: NOW });
  assert.equal(s.period!.key, '2026-11-09');
  assert.equal(s.period!.current, false);
  assert.equal(s.period!.label, 'Nov 9');
  assert.equal(s.totals.prompts, 60);
  assert.equal(s.previous.prompts, 64);
  assert.deepEqual(s.byModel.map((m) => m.model), ['gpt-5.5']);
  assert.deepEqual(s.agents.map((a) => a.id), ['codex']);
});

test('without a period, the window as before', () => {
  db.exec('delete from activity');
  weekRows();
  const s = computeStats(db, { granularity: 'week', tz: 'UTC', now: NOW });
  assert.equal(s.totals.prompts, 127);
  assert.equal(s.previous.prompts, 0);
  assert.equal(s.period, undefined);
  assert.equal(s.window, undefined);
  assert.deepEqual(s.byModel.map((m) => m.model).sort(), ['claude-opus-5-5', 'gpt-5.5']);
});

test('a month so far, an earlier month, and January after December', () => {
  db.exec('delete from activity');
  row('claude:a', at(2026, 11, 2, 8), 1);
  row('claude:a', at(2026, 11, 18, 15), 2);
  row('claude:a', at(2026, 10, 18, 15), 4);
  row('claude:a', at(2026, 10, 18, 16), 8);
  row('claude:a', at(2026, 10, 30, 12), 16);
  row('claude:a', at(2026, 9, 5, 10), 32);
  row('claude:a', at(2025, 12, 10, 10), 64);

  const cur = computeStats(db, { granularity: 'month', tz: 'UTC', period: 'current', now: NOW });
  assert.equal(cur.period!.key, '2026-11');
  assert.equal(cur.totals.prompts, 3);
  assert.equal(cur.previous.prompts, 4);
  assert.equal(cur.window!.prompts, 127);

  const oct = computeStats(db, { granularity: 'month', tz: 'UTC', period: '2026-10', now: NOW });
  assert.equal(oct.period!.current, false);
  assert.equal(oct.period!.label, 'Oct 2026');
  assert.equal(oct.totals.prompts, 28);
  assert.equal(oct.previous.prompts, 32);

  const jan = computeStats(db, { granularity: 'month', tz: 'UTC', period: '2026-01', now: NOW });
  assert.equal(jan.totals.prompts, 0);
  assert.equal(jan.previous.prompts, 64);
});

test('a year so far, compared with last year up to the same day and hour', () => {
  db.exec('delete from activity');
  row('claude:a', at(2026, 3, 1, 10), 1);
  row('claude:a', at(2025, 11, 18, 15), 2);
  row('claude:a', at(2025, 12, 1, 10), 4);
  const s = computeStats(db, { granularity: 'year', tz: 'UTC', period: 'current', now: NOW });
  assert.equal(s.period!.key, '2026');
  assert.equal(s.totals.prompts, 1);
  assert.equal(s.previous.prompts, 2);
  assert.equal(s.window!.prompts, 7);
  assert.deepEqual(s.buckets.map((b) => b.key), ['2025', '2026']);
});

test("today follows the viewer's time zone", () => {
  db.exec('delete from activity');
  row('claude:a', at(2026, 11, 18, 15), 1);
  row('claude:a', at(2026, 11, 18, 3), 2);
  row('claude:a', at(2026, 11, 17, 14), 4);
  row('claude:a', at(2026, 11, 17, 16), 8);

  const utc = computeStats(db, { granularity: 'day', tz: 'UTC', period: 'current', now: NOW });
  assert.equal(utc.period!.key, '2026-11-18');
  assert.equal(utc.totals.prompts, 3);
  assert.equal(utc.previous.prompts, 4);

  // New York is UTC-5 on this date: 10:30 on the 18th, so the 18th starts at 05:00 UTC.
  const ny = computeStats(db, { granularity: 'day', tz: 'America/New_York', period: 'current', now: NOW });
  assert.equal(ny.period!.key, '2026-11-18');
  assert.equal(ny.totals.prompts, 1);
  assert.equal(ny.previous.prompts, 4);
});

test('period keys', () => {
  assert.equal(periodKey('day', '2026-11-18'), '2026-11-18');
  assert.equal(periodKey('week', '2026-11-18'), '2026-11-16');
  assert.equal(periodKey('week', '2026-11-22'), '2026-11-16');
  assert.equal(periodKey('week', '2026-11-23'), '2026-11-23');
  assert.equal(periodKey('week', '2026-01-01'), '2025-12-29');
  assert.equal(periodKey('month', '2026-11'), '2026-11');
  assert.equal(periodKey('year', '2026'), '2026');
  assert.equal(periodKey('month', '2026-11-18'), null);
  assert.equal(periodKey('year', '2026-11'), null);
  assert.equal(periodKey('day', '2026-02-30'), null);
  assert.equal(periodKey('month', '2026-13'), null);
  assert.equal(periodKey('day', 'yesterday'), null);
  assert.equal(periodKey('day', '2026-11'), null);
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    console.error(`FAIL  ${name}\n${(e as Error).stack ?? e}`);
    process.exitCode = 1;
  }
}
console.log(`${passed}/${tests.length} passed`);
fs.rmSync(tmp, { recursive: true, force: true });
