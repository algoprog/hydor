// Script tests for "While you were away": the visit rule (a minute in front starts a visit, a reload or a glance never
// moves "since", a gap of VISIT_GAP ends one, Mark all as seen caps it), the summary from a seeded database (what waits
// on you, sessions that finished Done or Failed with their line and files, what ran by itself with its outcome and
// cost, what runs next today; what is left out and why; the order and the counts), how a turn's ending is kept, the
// routes, and nothing to show.
// Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/away/away-test.ts
//   DATA_DIR=/tmp/hydor-test-away node dist/dev/away-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { AWAY_SHOWN, awayHasNews, awayOrder, type AwayRow, type AwaySummary } from '../../shared/away.ts';
import type { InboxItem } from '../../shared/inbox.ts';
import { ensureTables } from '../apps/store.ts';
import { openDb, kvSet } from '../db.ts';
import { migrateTasks } from '../scheduler.ts';
import { awaySummary, FIRST_LOOK, heard, plainLine, recordEnding, registerAway, sinceOf, visitsOf, VISIT_GAP, type Visits } from './index.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
process.env.CUDA_VISIBLE_DEVICES = '';
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-away-test-')));

let passed = 0;
const ok = async (name: string, f: () => void | Promise<void>) => {
  await f();
  passed++;
  console.log(`ok - ${name}`);
};

const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = Date.UTC(2026, 10, 16, 9, 0, 0);

// ---- the visit rule ------------------------------------------------------------------------------------------------

await ok('before any visit: since a day back; a visit under way keeps the end of the one before', () => {
  let v: Visits = {};
  assert.equal(sinceOf(v, T0), T0 - FIRST_LOOK);
  // The first minute in front: a visit begins, still with nothing before it.
  v = heard(v, T0);
  assert.equal(sinceOf(v, T0 + MIN), T0 - FIRST_LOOK);
  // It goes on minute by minute; then you leave.
  for (let m = 1; m <= 30; m++) v = heard(v, T0 + m * MIN);
  assert.equal(v.last, T0 + 30 * MIN);
  // Away: since the end of that visit, however often the page is opened or reloaded (nothing is said for a glance).
  assert.equal(sinceOf(v, T0 + 3 * HOUR), T0 + 30 * MIN);
  assert.equal(sinceOf(v, T0 + 3 * HOUR + 5_000), T0 + 30 * MIN);
  // Back for a minute: a new visit, and still since the end of the last one; not since a second ago.
  v = heard(v, T0 + 3 * HOUR + MIN);
  assert.equal(v.before, T0 + 30 * MIN);
  assert.equal(v.start, T0 + 3 * HOUR + MIN);
  assert.equal(sinceOf(v, T0 + 3 * HOUR + MIN + 1), T0 + 30 * MIN);
  assert.equal(sinceOf(v, T0 + 3 * HOUR + 10 * MIN), T0 + 30 * MIN);
});

await ok('a pause shorter than the gap is the same visit; a longer one ends it', () => {
  let v = heard({}, T0);
  v = heard(v, T0 + VISIT_GAP - 1);
  assert.equal(v.start, T0);
  assert.equal(v.before, undefined);
  v = heard(v, T0 + 2 * VISIT_GAP + 1);
  assert.equal(v.start, T0 + 2 * VISIT_GAP + 1);
  assert.equal(v.before, T0 + VISIT_GAP - 1);
});

await ok('Mark all as seen: never since before it', () => {
  const v: Visits = { ...heard(heard({}, T0), T0 + MIN), cleared: T0 + 5 * HOUR };
  assert.equal(sinceOf(v, T0 + 6 * HOUR), T0 + 5 * HOUR);
  assert.equal(sinceOf({ last: T0 + 7 * HOUR, start: T0 + 7 * HOUR, cleared: T0 + 5 * HOUR }, T0 + 9 * HOUR), T0 + 7 * HOUR);
});

await ok('a line: plain text, no code or Markdown, shortened', () => {
  assert.equal(plainLine('**Done.** I wrote [the report](report.md):\n\n```js\nx()\n```\nAll *good*'), 'Done. I wrote the report: All good');
  assert.equal(plainLine('x'.repeat(300)).length, 160);
  assert.equal(plainLine('[SILENT] nothing'), 'nothing');
});

// ---- the summary ---------------------------------------------------------------------------------------------------

const fresh = (name: string) => {
  const db = openDb(path.join(tmp, `${name}.db`));
  migrateTasks(db);
  ensureTables(db);
  return db;
};

await ok('nothing to show: no rows, no counts, no news', () => {
  const db = fresh('empty');
  const s = awaySummary({ db, inbox: () => [] }, { now: T0 });
  assert.deepEqual(s.rows, []);
  assert.deepEqual(s.counts, { needs: 0, done: 0, failed: 0, quiet: 0 });
  assert.deepEqual(s.next, []);
  assert.equal(s.since, T0 - FIRST_LOOK);
  assert.equal(awayHasNews(s), false);
  assert.equal(awayHasNews(null), false);
  // Runs with nothing new, and what runs next, are no reason to show it alone.
  assert.equal(awayHasNews({ counts: { needs: 0, done: 0, failed: 0, quiet: 3 } }), false);
});

// A seeded world: you were last here until 18:40 the day before; it is 09:00 now.
const db = fresh('world');
const NOW = T0;
const LEFT = NOW - 14 * HOUR - 20 * MIN;
kvSet(db, 'away.visits', JSON.stringify({ start: LEFT - HOUR, last: LEFT, before: LEFT - DAYS(1) }));
function DAYS(n: number) {
  return n * 24 * HOUR;
}
const session = (key: string, title: string, o: { parent?: string; hidden?: boolean; app?: Record<string, unknown> } = {}) => {
  db.prepare(`insert into sessions (key, agent, id, path, title, created_at, updated_at, parent_key, hidden) values (?, 'claude', ?, ?, ?, ?, ?, ?, ?)`).run(
    key,
    key.split(':')[1],
    `/x/${key}.jsonl`,
    title,
    NOW - DAYS(2),
    NOW - HOUR,
    o.parent ?? null,
    o.hidden ? 1 : 0,
  );
  const a = { done_at: null, seen_at: null, archived: 0, ...o.app };
  db.prepare(`insert into app_sessions (key, agent, done_at, seen_at, archived, created_at, updated_at) values (?, 'claude', ?, ?, ?, ?, ?)`).run(key, a.done_at, a.seen_at, a.archived, NOW - DAYS(2), NOW - HOUR);
};
const end = (key: string, ended: 'done' | 'failed' | 'stopped', at: number, line?: string, made: string[] = [], changed = 0) => recordEnding(db, key, 'claude', { ended, at, line, made, changed });

// Finished while you were away.
session('claude:report', 'Quarterly sales report');
end('claude:report', 'done', NOW - 2 * HOUR, '## Done\nThe **report** is in report.pdf, with three charts.', ['/home/a/report.pdf', '/home/a/charts.xlsx'], 1);
session('claude:deploy', 'Deploy the website');
end('claude:deploy', 'failed', NOW - HOUR, 'API Error: 529 overloaded');
// Before the upgrade: a turn kept only as done_at.
session('claude:older', 'Tidy the photos', { app: { done_at: NOW - 3 * HOUR } });
// Left out: opened since it ended; ended before you left; archived; stopped by you; a helper of another session; a hidden one.
session('claude:opened', 'Already read', { app: { seen_at: NOW - 30 * MIN } });
end('claude:opened', 'done', NOW - 40 * MIN, 'Read already');
session('claude:before', 'Seen yesterday');
end('claude:before', 'done', LEFT - HOUR, 'Old news');
session('claude:archived', 'Archived', { app: { archived: 1 } });
end('claude:archived', 'done', NOW - HOUR, 'Archived');
session('claude:stopped', 'Stopped by you');
end('claude:stopped', 'stopped', NOW - HOUR);
session('claude:helper', 'A helper', { parent: 'claude:report' });
end('claude:helper', 'done', NOW - HOUR, 'Helped');
session('claude:hidden', 'Hidden', { hidden: true });
end('claude:hidden', 'done', NOW - HOUR, 'Hidden');
// The sessions of runs: their run tells of them.
session('claude:brief', 'Morning brief run');
end('claude:brief', 'done', NOW - 90 * MIN, 'Your brief');
session('claude:appsession', 'An app run');
end('claude:appsession', 'done', NOW - 90 * MIN, 'App');
// A session ended only after now (the page asked a moment before): not yet.
session('claude:later', 'Later');
end('claude:later', 'done', NOW + MIN, 'Later');

// Tasks and their runs.
const task = (id: string, name: string, schedule: Record<string, unknown>, o: { next?: number; enabled?: boolean; extra?: Record<string, unknown> } = {}) =>
  db
    .prepare(`insert into tasks (id, name, schedule, prompt, agent, cwd, enabled, next_at, created_at, extra) values (?, ?, ?, 'p', 'claude', '/x', ?, ?, ?, ?)`)
    .run(id, name, JSON.stringify(schedule), o.enabled === false ? 0 : 1, o.next ?? null, NOW - DAYS(5), o.extra ? JSON.stringify(o.extra) : null);
const run = (id: string, taskId: string, status: string, endedAt: number, o: { summary?: string; error?: string; cost?: number; key?: string; trigger?: string; dry?: boolean; appRun?: string } = {}) =>
  db
    .prepare(`insert into task_runs (id, task_id, trigger, started_at, ended_at, status, summary, error, cost_usd, key, dry, app_run) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, taskId, o.trigger ?? 'schedule', endedAt - 5 * MIN, endedAt, status, o.summary ?? null, o.error ?? null, o.cost ?? null, o.key ?? null, o.dry ? 1 : null, o.appRun ?? null);
task('brief', 'Morning brief', { kind: 'daily', time: '07:30' }, { next: NOW + DAYS(1) - 90 * MIN });
task('prices', 'Price watch', { kind: 'every', minutes: 240 }, { next: NOW + 2 * HOUR });
task('papers', 'New papers', { kind: 'daily', time: '18:00' }, { next: NOW + 9 * HOUR, extra: { assistant: 'researcher' } });
task('hook', 'On each push', { kind: 'webhook' }, { next: NOW + HOUR });
task('off', 'Paused one', { kind: 'daily', time: '10:00' }, { next: NOW + HOUR, enabled: false });
task('noon', 'Lunch reminder', { kind: 'daily', time: '12:00' }, { next: NOW + 3 * HOUR });
task('tomorrow', 'Tomorrow only', { kind: 'once', at: NOW + DAYS(1) + HOUR }, { next: NOW + DAYS(1) + HOUR });
run('r-brief', 'brief', 'done', NOW - 90 * MIN, { summary: 'Three stories on **AI** and one on the markets', cost: 0.12, key: 'claude:brief' });
run('r-prices', 'prices', 'silent', NOW - 50 * MIN, { summary: 'No price changes', cost: 0.01 });
run('r-papers', 'papers', 'error', NOW - 4 * HOUR, { error: 'The agent could not start: no such folder', key: 'claude:papersrun' });
run('r-test', 'brief', 'done', NOW - 30 * MIN, { trigger: 'test', summary: 'A test' });
run('r-dry', 'brief', 'done', NOW - 20 * MIN, { dry: true, summary: 'Would have sent' });
run('r-old', 'brief', 'done', LEFT - HOUR, { summary: 'Yesterday' });
run('r-running', 'prices', 'running', NOW - 10 * MIN);

// Apps' runs.
const appRun = (id: string, name: string, source: string, status: string, endedAt: number, o: { reply?: string; error?: string; cost?: number; key?: string; parent?: string } = {}) =>
  db
    .prepare(`insert into app_runs (id, app_id, app_name, recipe, key, source, status, inputs, reply, error, cost_usd, created_at, started_at, ended_at, parent) values (?, 'app1', ?, '{}', ?, ?, ?, '{}', ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, name, o.key ?? null, source, status, o.reply ?? null, o.error ?? null, o.cost ?? null, endedAt - MIN, endedAt - MIN, endedAt, o.parent ?? null);
appRun('a-web', 'Trip planner', 'web', 'done', NOW - 5 * HOUR, { reply: 'A four-day plan for Lisbon', cost: 0.4, key: 'claude:appsession' });
appRun('a-public', 'Price check', 'public', 'failed', NOW - 6 * HOUR, { error: 'The page did not load' });
appRun('a-step', 'Inner step', 'step', 'done', NOW - HOUR, { parent: 'a-web' });
appRun('a-test', 'An example', 'test', 'done', NOW - HOUR);
appRun('a-session', 'Asked in a session', 'session', 'done', NOW - HOUR);
appRun('a-stopped', 'Stopped app', 'web', 'stopped', NOW - HOUR);

// What waits on you.
const inbox: InboxItem[] = [
  { id: 'approval:claude:x:1', kind: 'approval', title: 'Run a command', detail: '# Run the tests\nnpm test', key: 'claude:x', session: 'Fix the tests', agent: 'claude', at: NOW - 20 * MIN, path: '/s/claude%3Ax' },
  { id: 'outbox:o1', kind: 'outbox', title: 'Send an email to Ana', at: NOW - 3 * HOUR, path: '/inbox' },
];
const src = { db, inbox: () => inbox, acpName: () => undefined };

let s: AwaySummary;
await ok('the summary: since the end of your last visit; what waits, finished, ran, and next today', () => {
  s = awaySummary(src, { now: NOW, until: NOW + 12 * HOUR });
  assert.equal(s.since, LEFT);
  assert.equal(s.now, NOW);
  const ids = s.rows.map((r) => r.id);
  assert.deepEqual(ids, [
    // Waiting on you, the longest waiting first.
    'outbox:o1',
    'approval:claude:x:1',
    // Failed, newest first: a session, then a task's run, then an app's.
    'session:claude:deploy',
    'run:r-papers',
    'app:a-public',
    // Sessions done, newest first (the one kept as done_at alone too).
    'session:claude:report',
    'session:claude:older',
    // Runs done, then those with nothing new.
    'run:r-brief',
    'app:a-web',
    'run:r-prices',
  ]);
  assert.deepEqual(s.counts, { needs: 2, done: 4, failed: 3, quiet: 1 });
  assert.equal(awayHasNews(s), true);
});

await ok('a finished session: its title, the start of its last reply in plain words, its files, its link', () => {
  const r = s.rows.find((x) => x.id === 'session:claude:report')!;
  assert.equal(r.group, 'finished');
  assert.equal(r.outcome, 'done');
  assert.equal(r.title, 'Quarterly sales report');
  assert.equal(r.line, 'Done The report is in report.pdf, with three charts.');
  assert.deepEqual(r.files, ['/home/a/report.pdf', '/home/a/charts.xlsx']);
  assert.equal(r.fileCount, 3);
  assert.equal(r.path, '/s/claude%3Areport');
  assert.equal(r.agent, 'claude');
  const f = s.rows.find((x) => x.id === 'session:claude:deploy')!;
  assert.equal(f.outcome, 'failed');
  assert.equal(f.line, 'API Error: 529 overloaded');
  const older = s.rows.find((x) => x.id === 'session:claude:older')!;
  assert.equal(older.outcome, 'done');
  assert.equal(older.line, undefined);
});

await ok('what ran by itself: its outcome, line, cost, what ran it, and its link', () => {
  const brief = s.rows.find((x) => x.id === 'run:r-brief')!;
  assert.deepEqual(
    { group: brief.group, outcome: brief.outcome, title: brief.title, line: brief.line, cost: brief.costUsd, by: brief.by, path: brief.path },
    { group: 'ran', outcome: 'done', title: 'Morning brief', line: 'Three stories on AI and one on the markets', cost: 0.12, by: 'task', path: '/s/claude%3Abrief' },
  );
  const papers = s.rows.find((x) => x.id === 'run:r-papers')!;
  assert.equal(papers.outcome, 'failed');
  assert.equal(papers.by, 'agent');
  assert.equal(papers.byName, 'Researcher');
  assert.equal(papers.line, 'The agent could not start: no such folder');
  const prices = s.rows.find((x) => x.id === 'run:r-prices')!;
  assert.equal(prices.outcome, 'quiet');
  assert.equal(prices.path, '/settings?s=tasks');
  const web = s.rows.find((x) => x.id === 'app:a-web')!;
  assert.deepEqual({ by: web.by, title: web.title, path: web.path, cost: web.costUsd, line: web.line }, { by: 'app', title: 'Trip planner', path: '/apps/runs/a-web', cost: 0.4, line: 'A four-day plan for Lisbon' });
  assert.equal(s.rows.find((x) => x.id === 'app:a-public')!.line, 'The page did not load');
});

await ok('what waits on you: the inbox item itself, to answer in place', () => {
  const r = s.rows.find((x) => x.id === 'approval:claude:x:1')!;
  assert.equal(r.group, 'needs');
  assert.equal(r.outcome, 'waiting');
  assert.equal(r.line, 'Run the tests npm test');
  assert.equal(r.session, 'Fix the tests');
  assert.equal(r.item, inbox[0]);
});

await ok('next today: timed tasks due before the end of your day, soonest first, three at most', () => {
  assert.deepEqual(
    s.next.map((n) => [n.name, n.by, n.path]),
    [
      ['Price watch', 'task', '/settings?s=tasks'],
      ['Lunch reminder', 'task', '/settings?s=tasks'],
      ['New papers', 'agent', '/agents/researcher'],
    ],
  );
  // The page's own midnight, sooner: only what comes before it.
  assert.deepEqual(
    awaySummary(src, { now: NOW, until: NOW + 2 * HOUR }).next.map((n) => n.name),
    ['Price watch'],
  );
});

await ok('the order holds for rows given in any order; six show', () => {
  const shuffled = [...s.rows].reverse();
  assert.deepEqual(
    awayOrder(shuffled).map((r) => r.id),
    s.rows.map((r) => r.id),
  );
  assert.equal(AWAY_SHOWN, 6);
});

await ok('how a turn ended is kept: a later turn replaces it, and a stopped one leaves the list', () => {
  end('claude:report', 'stopped', NOW - 10 * MIN);
  const now = awaySummary(src, { now: NOW });
  assert.equal(now.rows.some((r) => r.id === 'session:claude:report'), false);
  end('claude:report', 'done', NOW - 5 * MIN, 'Updated', [], 0);
  const again = awaySummary(src, { now: NOW }).rows.find((r) => r.id === 'session:claude:report')!;
  assert.equal(again.line, 'Updated');
  assert.equal(again.files, undefined);
  assert.equal(again.fileCount, undefined);
});

// ---- the routes ----------------------------------------------------------------------------------------------------

await ok('routes: the summary, a visit going on, and Mark all as seen (the sessions in it count as opened)', async () => {
  const app = Fastify();
  const seen: string[] = [];
  registerAway(app, {
    ...src,
    markSeen: (key) => {
      seen.push(key);
      db.prepare('update app_sessions set seen_at = ? where key = ?').run(Date.now(), key);
    },
  });
  await app.ready();
  // The real clock now: the seeded world is in the past, so give it a visit that ended an hour ago, before it all.
  const real = Date.now();
  const shift = real - NOW;
  db.prepare('update app_sessions set ended_at = ended_at + ?, done_at = done_at + ?').run(shift, shift);
  db.prepare('update task_runs set ended_at = ended_at + ?').run(shift);
  db.prepare('update app_runs set ended_at = ended_at + ?').run(shift);
  db.prepare('update tasks set next_at = next_at + ?').run(shift);
  for (const it of inbox) it.at += shift;
  kvSet(db, 'away.visits', JSON.stringify({ start: LEFT + shift - HOUR, last: LEFT + shift }));

  const g = await app.inject({ method: 'GET', url: `/api/away?until=${real + 12 * HOUR}` });
  assert.equal(g.statusCode, 200);
  const sum = g.json() as AwaySummary;
  assert.equal(sum.since, LEFT + shift);
  assert.ok(sum.rows.some((r: AwayRow) => r.id === 'session:claude:deploy'));
  assert.equal(sum.next[0].name, 'Price watch');

  // A visit: the first minute in front starts one; since stays where it was.
  const h = await app.inject({ method: 'POST', url: '/api/away/here' });
  assert.equal(h.statusCode, 200);
  assert.equal((h.json() as { since: number }).since, LEFT + shift);
  assert.equal(visitsOf(db).before, LEFT + shift);

  // Mark all as seen, up to what the page showed.
  const m = await app.inject({ method: 'POST', url: '/api/away/seen', payload: { at: sum.now } });
  assert.equal(m.statusCode, 200);
  assert.deepEqual(seen.sort(), ['claude:deploy', 'claude:older', 'claude:report']);
  const after = (await app.inject({ method: 'GET', url: '/api/away' })).json() as AwaySummary;
  assert.deepEqual(after.rows, []);
  assert.equal(awayHasNews(after), false);
  // What waits from now on shows again.
  inbox.push({ id: 'question:new', kind: 'question', title: 'Which hotel?', at: Date.now() + 1000, path: '/s/claude%3Ay' });
  const later = (await app.inject({ method: 'GET', url: '/api/away' })).json() as AwaySummary;
  assert.deepEqual(
    later.rows.map((r) => r.id),
    ['question:new'],
  );
  await app.close();
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed`);
