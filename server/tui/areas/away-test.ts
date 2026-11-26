// Checks for `hydor away` (the folded line, the rows most important first, what runs next, nothing new, --json) and
// `hydor away seen` (Mark all as seen, up to what was listed).
//   OUTDIR=dist/dev node scripts/build-server.mjs server/tui/areas/away-test.ts && DATA_DIR=/tmp/hydor-test-tui-away node dist/dev/away-test.js
import assert from 'node:assert/strict';
import type { AwaySummary } from '../../../shared/away.ts';
import { awayLine, sinceWords } from './away.ts';
import { fakeConn, run } from './test-kit.ts';

const DATA = process.env.DATA_DIR ?? '';
if (!DATA.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
process.env.CUDA_VISIBLE_DEVICES = '';

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const now = Date.now();
const H = 3_600_000;
// What it asks for: up to your midnight, for what runs next today.
const midnight = new Date(now);
midnight.setHours(24, 0, 0, 0);
const AWAY = `/api/away?until=${midnight.getTime()}`;
const sum: AwaySummary = {
  now,
  since: now - 30 * 60_000,
  rows: [
    { id: 'approval:a', group: 'needs', outcome: 'waiting', title: 'Run a command', session: 'Fix the tests', at: now - 20 * 60_000, path: '/s/claude%3Ax' },
    { id: 'session:claude:d', group: 'finished', outcome: 'failed', title: 'Deploy the website', line: 'API Error: 529 overloaded', at: now - 10 * 60_000, path: '/s/claude%3Ad' },
    { id: 'run:r1', group: 'ran', outcome: 'done', title: 'Morning brief', line: 'Three stories', at: now - 5 * 60_000, path: '/s/claude%3Ab', costUsd: 0.12, by: 'task' },
    { id: 'run:r2', group: 'ran', outcome: 'quiet', title: 'Price watch', at: now - 4 * 60_000, path: '/settings?s=tasks', by: 'agent', byName: 'Researcher' },
  ],
  counts: { needs: 1, done: 1, failed: 1, quiet: 1 },
  next: [{ id: 't1', name: 'Lunch reminder', at: now + H, path: '/settings?s=tasks', by: 'task' }],
};

test('since: today, yesterday, this week, before', () => {
  const base = new Date(2026, 10, 16, 9, 0).getTime();
  assert.match(sinceWords(base - 30 * 60_000, base), /^Since \d\d?:\d\d/);
  assert.match(sinceWords(base - 14 * H, base), /^Since yesterday \d\d?:\d\d/);
  assert.match(sinceWords(base - 3 * 24 * H, base), /^Since \S+ \d\d?:\d\d/);
  assert.match(sinceWords(base - 30 * 24 * H, base), /^Since \S+ \S+$/);
});

test('away: the folded line, the rows most important first, next today, where to open them', async () => {
  const t = fakeConn({ [AWAY]: sum });
  const r = await run(t.conn, ['away']);
  const lines = r.out.split('\n');
  assert.equal(lines[0], awayLine(sum));
  assert.match(lines[0], /^1 needs you · 1 failed · 1 done · 1 with nothing new · next: Lunch reminder at .+ · Since .+$/);
  assert.match(r.out, /^1 +● +needs you +Run a command +Fix the tests +20m ago$/m);
  assert.match(r.out, /^2 +✗ +failed +Deploy the website +API Error: 529 overloaded +10m ago$/m);
  assert.match(r.out, /^3 +✓ +done +Morning brief +Three stories +\$0\.12 +5m ago$/m);
  assert.match(r.out, /^4 +· +nothing new +Price watch +Researcher +4m ago$/m);
  assert.match(r.out, /^Next today: Lunch reminder /m);
  assert.match(r.out, /Open one at http:\/\/fake\/s\/claude%3Ax/);
  assert.deepEqual((await run(t.conn, ['away', '--json'])).json, [sum]);
});

test('away: nothing new says so', async () => {
  const quiet: AwaySummary = { ...sum, rows: [sum.rows[3]], counts: { needs: 0, done: 0, failed: 0, quiet: 1 } };
  const r = await run(fakeConn({ [AWAY]: quiet }).conn, ['away']);
  // In the half hour after midnight the time it counts from is yesterday's ("since yesterday 11:35 PM").
  assert.match(r.out, /^Nothing new since (yesterday )?\d\d?:\d\d/);
});

test('away seen: marks what was listed as seen', async () => {
  const t = fakeConn({ [AWAY]: sum, 'POST /api/away/seen': { ok: true } });
  const r = await run(t.conn, ['away', 'seen']);
  assert.match(r.out, /Marked all as seen\./);
  assert.deepEqual(t.calls.at(-1), { method: 'POST', path: '/api/away/seen', body: { at: now } });
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
}
console.log(`\n${passed}/${tests.length} passed`);
