// Checks for Schedules, the week of everything that runs by itself (server/automations/week.ts): runs that happened
// from a seeded history and runs to come from each kind of schedule (a daily task, weekdays only, every five
// minutes as a band, a paused one, a watcher, a webhook, a cron expression, once, an agent's and an app's), the
// week's edges in the user's time zone, other time zones, the days the clocks change, the cap, and the route.
//
//   OUTDIR=dist/dev node scripts/build-server.mjs server/automations/week-test.ts && DATA_DIR=/tmp/hydor-test-week node dist/dev/week-test.js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import type { RunStatus, ScheduledTask, TaskSchedule } from '../../shared/automations.ts';
import { addDate, mondayOf, type ScheduleWeek } from '../../shared/schedules.ts';
import { saveAssistant } from '../assistants/store.ts';
import { kvSet, openDb } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { migrateTasks, Scheduler } from '../scheduler.ts';
import type { SessionManager } from '../sessions.ts';
import { automations } from './index.ts';
import { nextRun, zonedTime } from './schedule.ts';
import { BAND_PER_DAY, dateIn, scheduleWeek } from './week.ts';

let passed = 0;
const failures: string[] = [];
async function test(name: string, fn: () => unknown) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`  FAIL ${name}\n       ${(e as Error).stack?.split('\n').slice(0, 5).join('\n       ')}`);
  }
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-week-'));
const db = openDb(path.join(root, 'test.db'));
migrateTasks(db);

const TZ = 'Europe/Athens';
/** A wall-clock time in Athens (UTC+2 in November). */
const ath = (date: string, h: number, m = 0) => {
  const [y, mo, d] = date.split('-').map(Number);
  return zonedTime(TZ, y, mo, d, h, m);
};
/** Wednesday 18 November 2026, 10:00 in Athens. */
const NOW = ath('2026-11-18', 10);
const MIN = 60_000;

/** A task as the scheduler lists it, its next run as the scheduler would have it. */
function task(p: Partial<ScheduledTask> & { id: string; name: string; schedule: TaskSchedule }, now = NOW, tz = TZ): ScheduledTask {
  const enabled = p.enabled !== false;
  const next = p.schedule.kind === 'watch' ? now + p.schedule.minutes * MIN : nextRun(p.schedule, now, tz);
  return { prompt: 'Do it', agent: 'claude', cwd: root, createdAt: 0, ...p, enabled, nextAt: enabled ? (next ?? undefined) : undefined };
}

let runSeq = 0;
function seed(taskId: string, at: number, status: RunStatus, o: { mins?: number; cost?: number; summary?: string; key?: string; trigger?: string; appRun?: string } = {}) {
  db.prepare(
    `insert into task_runs (id, task_id, trigger, started_at, ended_at, status, summary, cost_usd, key, app_run) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(`r${++runSeq}`, taskId, o.trigger ?? 'schedule', at, status === 'running' ? null : at + (o.mins ?? 2) * MIN, status, o.summary ?? null, o.cost ?? null, o.key ?? null, o.appRun ?? null);
}

const scout = saveAssistant(db, { name: 'Paper scout', instructions: 'Find new papers.', icon: 'book-open' });

const tasks: ScheduledTask[] = [
  task({ id: 'brief', name: 'Morning brief', schedule: { kind: 'daily', time: '07:30' } }),
  task({ id: 'standup', name: 'Standup notes', schedule: { kind: 'daily', time: '09:00', days: [1, 2, 3, 4, 5] } }),
  task({ id: 'sweep', name: 'Inbox sweep', schedule: { kind: 'every', minutes: 5 } }),
  task({ id: 'hourly', name: 'Hourly check', schedule: { kind: 'every', minutes: 180 } }),
  task({ id: 'old', name: 'Old report', schedule: { kind: 'daily', time: '18:00' }, enabled: false, pausedReason: 'Paused after 3 failed runs in a row.' }),
  task({ id: 'price', name: 'Price watch', schedule: { kind: 'watch', minutes: 15, watch: { kind: 'page', url: 'https://shop.example/camera' } } }),
  task({ id: 'hook', name: 'Review pull requests', schedule: { kind: 'webhook' } }),
  task({ id: 'cron-often', name: 'Every two hours', schedule: { kind: 'cron', expr: '0 */2 * * *' } }),
  task({ id: 'cron-twice', name: 'Twice on weekdays', schedule: { kind: 'cron', expr: '0 9,17 * * 1-5' } }),
  task({ id: 'once', name: 'Call the dentist', schedule: { kind: 'once', at: ath('2026-11-21', 12) } }),
  task({ id: 'scout', name: 'Paper scout', schedule: { kind: 'daily', time: '08:00', days: [1, 2, 3, 4, 5] }, extra: { assistant: scout.id } }),
  task({ id: 'explore', name: 'Explore', schedule: { kind: 'daily', time: '07:00' }, origin: 'daily:tpl:explore', app: { id: 'tpl:explore', inputs: {} }, appName: 'Explore' }),
  task({ id: 'myapp', name: 'Reading list from the feed', schedule: { kind: 'daily', time: '06:00' }, app: { id: 'app-123', inputs: {} }, appName: 'Reading list' }),
];

// The history: the brief each morning so far, the sweep's many runs, a run of the paused one, the watcher's finds,
// and runs right at the week's edges.
seed('brief', ath('2026-11-16', 7, 30), 'done', { cost: 0.1, summary: 'Rain later; three AI stories.', key: 'claude:k1', mins: 4 });
seed('brief', ath('2026-11-17', 7, 30), 'failed', { cost: 0.05, summary: 'The weather site did not answer.', key: 'claude:k2' });
seed('brief', ath('2026-11-18', 7, 30), 'silent', { cost: 0.02, key: 'claude:k3' });
const sweepStatuses: RunStatus[] = ['done', 'silent', 'silent', 'failed'];
for (let i = 0; i < 30; i++) seed('sweep', ath('2026-11-17', 8) + i * 5 * MIN, sweepStatuses[i % 4], { cost: 0.01 });
seed('old', ath('2026-11-16', 18), 'blocked', { summary: 'It needs a sign-in.' });
seed('price', ath('2026-11-16', 11, 15), 'done', { cost: 0.03 });
seed('price', ath('2026-11-16', 15, 45), 'partial', { cost: 0.04 });
seed('standup', ath('2026-11-15', 23, 59), 'done', { trigger: 'manual' }); // the Sunday before: not this week
seed('standup', ath('2026-11-16', 0, 0), 'done', { trigger: 'manual' }); // Monday's first minute
seed('standup', ath('2026-11-22', 23, 59), 'done', { trigger: 'manual' }); // Sunday's last minute
seed('standup', ath('2026-11-23', 0, 0), 'done', { trigger: 'manual' }); // the next Monday: not this week
seed('explore', ath('2026-11-18', 7), 'running', { appRun: 'run-9' });
seed('', ath('2026-11-17', 12), 'done'); // a test of a task never saved: not anyone's run

const week = (o: Partial<Parameters<typeof scheduleWeek>[2]> = {}, list = tasks) => scheduleWeek(db, list, { tz: TZ, now: NOW, ...o });
const itemOf = (w: ScheduleWeek, id: string) => w.items.find((it) => it.id === id)!;
const nextOf = (w: ScheduleWeek, id: string) => w.next.filter((x) => x.task === id);
const runsOf = (w: ScheduleWeek, id: string) => w.runs.filter((x) => x.task === id);
const bandsOf = (w: ScheduleWeek, id: string) => w.bands.filter((x) => x.task === id);

console.log('The week');

await test('the week starts on the Monday of today, in the user’s time zone, and runs seven days', () => {
  const w = week();
  assert.equal(w.today, '2026-11-18');
  assert.equal(w.start, '2026-11-16');
  assert.deepEqual(
    w.days.map((d) => d.date),
    ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'],
  );
  assert.equal(w.days[0].from, ath('2026-11-16', 0));
  assert.equal(w.days[6].to, ath('2026-11-23', 0));
  assert.equal(w.days[0].wd, 1);
  assert.equal(w.days[6].wd, 0);
  assert.equal(w.tz, TZ);
});

await test('a daily task: its runs so far with how each went, and one to come each day left', () => {
  const w = week();
  const runs = runsOf(w, 'brief');
  assert.deepEqual(
    runs.map((r) => [r.day, r.min, r.status]),
    [
      [0, 450, 'done'],
      [1, 450, 'failed'],
      [2, 450, 'silent'],
    ],
  );
  assert.equal(runs[0].summary, 'Rain later; three AI stories.');
  assert.equal(runs[0].key, 'claude:k1');
  assert.equal(runs[0].mins, 4);
  assert.equal(runs[0].costUsd, 0.1);
  const next = nextOf(w, 'brief');
  assert.deepEqual(
    next.map((x) => [x.day, x.min]),
    [
      [3, 450],
      [4, 450],
      [5, 450],
      [6, 450],
    ],
  );
  // The first one to come is the scheduler's own next run.
  assert.equal(next[0].at, itemOf(w, 'brief').nextAt);
  assert.equal(itemOf(w, 'brief').band, false);
  assert.equal(itemOf(w, 'brief').last?.status, 'silent');
  assert.equal(itemOf(w, 'brief').when, 'Daily at 07:30');
  assert.equal(itemOf(w, 'brief').edit, '/settings?s=tasks&task=brief');
  assert.equal(itemOf(w, 'brief').source, 'task');
});

await test('weekdays only: none at the weekend, none earlier today once its time has passed', () => {
  const w = week();
  assert.deepEqual(
    nextOf(w, 'standup').map((x) => [x.day, x.min]),
    [
      [3, 540],
      [4, 540],
    ],
  );
  assert.equal(itemOf(w, 'standup').when, 'Weekdays at 09:00');
});

await test('the week’s edges: Monday’s first minute and Sunday’s last are in, the minutes either side are not', () => {
  const w = week();
  const manual = runsOf(w, 'standup');
  assert.deepEqual(
    manual.map((r) => [r.day, r.min, r.trigger]),
    [
      [0, 0, 'manual'],
      [6, 1439, 'manual'],
    ],
  );
  // The week before has the Sunday one, the week after its Monday.
  assert.deepEqual(
    runsOf(week({ start: '2026-11-09' }), 'standup').map((r) => [r.day, r.min]),
    [[6, 1439]],
  );
  assert.deepEqual(
    runsOf(week({ start: '2026-11-23' }), 'standup').map((r) => [r.day, r.min]),
    [[0, 0]],
  );
});

await test('every five minutes: one band a day, its runs counted by how they went, and how many more are planned', () => {
  const w = week();
  const it = itemOf(w, 'sweep');
  assert.equal(it.band, true);
  assert.equal(runsOf(w, 'sweep').length, 0, 'no block for each run');
  assert.equal(nextOf(w, 'sweep').length, 0, 'no block for each run to come');
  const bands = bandsOf(w, 'sweep');
  const tue = bands.find((b) => b.day === 1)!;
  assert.equal(tue.runs, 30);
  assert.deepEqual(tue.by, { done: 8, silent: 15, failed: 7 });
  assert.equal(Math.round(tue.costUsd * 100), 30);
  assert.equal(tue.planned, 0, 'nothing more to come on a day gone by');
  // Today from 10:05 to midnight, then every day in full.
  assert.equal(bands.find((b) => b.day === 2)!.planned, Math.ceil((24 * 60 - (10 * 60 + 5)) / 5));
  for (const d of [3, 4, 5, 6]) assert.equal(bands.find((b) => b.day === d)!.planned, 288);
  assert.equal(it.when, 'Every 5 min');
});

await test('every three hours is eight a day: still blocks, on the scheduler’s own beat', () => {
  const w = week();
  assert.equal(itemOf(w, 'hourly').band, false);
  const next = nextOf(w, 'hourly');
  assert.equal(next[0].at, NOW + 180 * MIN);
  assert.ok(next.every((x, i) => i === 0 || x.at - next[i - 1].at === 180 * MIN));
  assert.ok(next.length > 0 && next.length <= BAND_PER_DAY * 5);
});

await test('a paused task: its past runs show, nothing to come, and why it paused', () => {
  const w = week();
  const it = itemOf(w, 'old');
  assert.equal(it.enabled, false);
  assert.equal(it.nextAt, undefined);
  assert.equal(it.pausedReason, 'Paused after 3 failed runs in a row.');
  assert.equal(nextOf(w, 'old').length, 0);
  assert.deepEqual(
    runsOf(w, 'old').map((r) => [r.day, r.status]),
    [[0, 'blocked']],
  );
  // Paused ones come last in the list.
  assert.equal(w.items.at(-1)!.id, 'old');
});

await test('a watcher and a webhook are bands: what they found counted, nothing planned', () => {
  const w = week();
  assert.equal(itemOf(w, 'price').band, true);
  assert.equal(itemOf(w, 'hook').band, true);
  assert.deepEqual(
    bandsOf(w, 'price').map((b) => [b.day, b.runs, b.planned]),
    [[0, 2, 0]],
  );
  assert.deepEqual(bandsOf(w, 'price')[0].by, { done: 1, partial: 1 });
  assert.equal(bandsOf(w, 'hook').length, 0);
  assert.equal(nextOf(w, 'price').length, 0);
  assert.equal(itemOf(w, 'hook').when, 'When its webhook is called');
});

await test('cron: more than eight a day is a band, fewer are blocks', () => {
  const w = week();
  assert.equal(itemOf(w, 'cron-often').band, true);
  const often = bandsOf(w, 'cron-often');
  // Today: 12:00, 14:00 … 22:00 are still to come; then twelve a day.
  assert.equal(often.find((b) => b.day === 2)!.planned, 6);
  assert.equal(often.find((b) => b.day === 6)!.planned, 12);
  assert.equal(itemOf(w, 'cron-twice').band, false);
  assert.deepEqual(
    nextOf(w, 'cron-twice').map((x) => [x.day, x.min]),
    [
      [2, 1020],
      [3, 540],
      [3, 1020],
      [4, 540],
      [4, 1020],
    ],
  );
  assert.equal(nextOf(w, 'cron-twice')[0].at, itemOf(w, 'cron-twice').nextAt);
});

await test('once: on its day, and gone from the weeks after', () => {
  assert.deepEqual(
    nextOf(week(), 'once').map((x) => [x.day, x.min]),
    [[5, 720]],
  );
  assert.equal(nextOf(week({ start: '2026-11-23' }), 'once').length, 0);
});

await test('an agent’s schedule opens its agent, an app’s its app', () => {
  const w = week();
  const a = itemOf(w, 'scout');
  assert.equal(a.source, 'agent');
  assert.deepEqual(a.agent, { id: scout.id, name: 'Paper scout', icon: 'book-open' });
  assert.equal(a.edit, `/agents/${encodeURIComponent(scout.id)}`);
  const e = itemOf(w, 'explore');
  assert.equal(e.source, 'app');
  assert.deepEqual(e.app, { id: 'tpl:explore', name: 'Explore', daily: true });
  assert.equal(e.edit, '/apps/t/explore');
  // Its run goes on: it opens the app's run.
  const r = runsOf(w, 'explore')[0];
  assert.equal(r.status, 'running');
  assert.equal(r.appRun, 'run-9');
  assert.equal(r.mins, 180);
  const mine = itemOf(w, 'myapp');
  assert.equal(mine.source, 'app');
  assert.equal(mine.edit, '/apps/app-123?tab=runs');
  // An agent that is gone: its schedule stays, as a plain task.
  const orphan = week({}, [task({ id: 'orphan', name: 'Orphan', schedule: { kind: 'daily', time: '10:00' }, extra: { assistant: 'gone-1234' } })]);
  assert.equal(orphan.items[0].source, 'task');
});

await test('each day’s totals: every run, the bands’ too, what they cost, and how many are to come', () => {
  const w = week();
  const mon = w.days[0];
  // The brief, the paused one, the watcher’s two and the first-minute run.
  assert.equal(mon.runs, 5);
  assert.deepEqual(mon.by, { done: 3, blocked: 1, partial: 1 });
  assert.equal(Math.round(mon.costUsd * 100), 17);
  assert.equal(mon.planned, 0);
  const tue = w.days[1];
  assert.equal(tue.runs, 31, 'the brief and the sweep’s thirty; not the unsaved task’s test');
  assert.equal(w.days[6].planned > 288, true);
});

await test('the list: what runs next first, then watchers and webhooks, then what is paused', () => {
  const w = week();
  const order = w.items.map((it) => it.id);
  assert.equal(order[0], 'sweep', 'the next to run (in five minutes)');
  assert.ok(order.indexOf('price') > order.indexOf('brief'));
  assert.ok(order.indexOf('hook') > order.indexOf('once'));
  assert.equal(order.at(-1), 'old');
});

await test('a day, a month, and a start that is not a day', () => {
  const one = week({ start: '2026-11-18', days: 1 });
  assert.equal(one.days.length, 1);
  assert.deepEqual(
    runsOf(one, 'brief').map((r) => r.day),
    [0],
  );
  assert.equal(nextOf(one, 'brief').length, 0);
  const month = week({ start: mondayOf('2026-11-01'), days: 42 });
  assert.equal(month.days.length, 42);
  assert.equal(month.start, '2026-10-26');
  assert.equal(month.days[41].date, addDate('2026-10-26', 41));
  assert.equal(week({ days: 400 }).days.length, 42);
  // A day of its own (a phone's) is today unless it says.
  assert.equal(week({ days: 1 }).start, '2026-11-18');
  assert.throws(() => week({ start: '2026-02-30' }), /YYYY-MM-DD/);
  assert.throws(() => week({ start: 'next week' }), /YYYY-MM-DD/);
});

console.log('Time zones and clock changes');

await test('the same runs in another time zone fall on that zone’s days and hours', () => {
  const la = 'America/Los_Angeles';
  const w = scheduleWeek(db, tasks, { tz: la, now: NOW });
  // 10:00 in Athens on Wednesday is midnight in Los Angeles: still Wednesday.
  assert.equal(w.today, '2026-11-18');
  assert.equal(dateIn(la, NOW), '2026-11-18');
  // Monday's 07:30 in Athens is Sunday 21:30 there, the week before; Tuesday's is Monday 21:30.
  assert.deepEqual(
    runsOf(w, 'brief').map((r) => [r.day, r.min]),
    [
      [0, 21 * 60 + 30],
      [1, 21 * 60 + 30],
    ],
  );
  // Times of day go by that zone's clock.
  const lt = scheduleWeek(db, [task({ id: 'brief', name: 'Morning brief', schedule: { kind: 'daily', time: '07:30' } }, NOW, la)], { tz: la, now: NOW });
  assert.deepEqual(
    nextOf(lt, 'brief').map((x) => [x.day, x.min]),
    [
      [2, 450],
      [3, 450],
      [4, 450],
      [5, 450],
      [6, 450],
    ],
  );
});

await test('the week the clocks go back (New York, 1 November 2026): a 25-hour Sunday, runs at the same time of day', () => {
  const ny = 'America/New_York';
  const now = zonedTime(ny, 2026, 10, 26, 6, 0);
  const t = task({ id: 'ny', name: 'Morning', schedule: { kind: 'daily', time: '09:00' } }, now, ny);
  const w = scheduleWeek(db, [t], { tz: ny, now });
  assert.equal(w.start, '2026-10-26');
  assert.equal(w.days[6].date, '2026-11-01');
  assert.equal(w.days[6].to - w.days[6].from, 25 * 3600_000);
  assert.equal(w.days[5].to - w.days[5].from, 24 * 3600_000);
  const next = nextOf(w, 'ny');
  assert.equal(next.length, 7);
  assert.ok(next.every((x, i) => x.day === i && x.min === 540));
  // 09:00 is 13:00 UTC before the change and 14:00 after.
  assert.equal(new Date(next[5].at).toISOString().slice(11, 16), '13:00');
  assert.equal(new Date(next[6].at).toISOString().slice(11, 16), '14:00');
  assert.equal(next[0].at, t.nextAt);
});

await test('the week the clocks go forward (Athens, 28 March 2027): a 23-hour Sunday, a skipped time moves past the change', () => {
  const now = ath('2027-03-22', 1);
  const t = task({ id: 'early', name: 'Early', schedule: { kind: 'daily', time: '03:30' } }, now);
  const w = scheduleWeek(db, [t], { tz: TZ, now });
  assert.equal(w.days[6].date, '2027-03-28');
  assert.equal(w.days[6].to - w.days[6].from, 23 * 3600_000);
  const next = nextOf(w, 'early');
  assert.equal(next.length, 7);
  assert.equal(next[6].day, 6);
  // 03:30 does not happen that night: the run is at 04:30, as the scheduler would start it.
  assert.equal(next[6].min, 4 * 60 + 30);
  assert.equal(next[6].at, nextRun(t.schedule, next[5].at, TZ));
});

await test('runs to come stop at a cap, and say so', () => {
  const many = Array.from({ length: 10 }, (_, i) => task({ id: `m${i}`, name: `Many ${i}`, schedule: { kind: 'cron', expr: '0 0,3,6,9,12,15,18,21 * * *' } }));
  const w = scheduleWeek(db, many, { tz: TZ, now: NOW, start: '2026-11-16', days: 42 });
  assert.equal(itemOf(w, 'm0').band, false);
  assert.equal(w.capped, true);
  assert.equal(w.next.length, 2500);
  // A day's count still has every one.
  assert.equal(w.days[41].planned, 80);
  assert.equal(week().capped, undefined);
});

await test('a month of every task answers quickly', () => {
  const t0 = performance.now();
  for (let i = 0; i < 5; i++) week({ start: '2026-11-02', days: 42 });
  const ms = (performance.now() - t0) / 5;
  assert.ok(ms < 400, `${ms.toFixed(0)} ms`);
});

console.log('The route');

await test('GET /api/automations/week and the pause switch, on the scheduler’s own tasks', async () => {
  kvSet(db, 'user.tz', TZ);
  class Sessions extends EventEmitter {
    resumeLookup?: unknown;
    noticeGate?: unknown;
  }
  const scheduler = new Scheduler(db, new Sessions() as unknown as SessionManager);
  const app = Fastify();
  automations.routes!({ app, db, scheduler, sessions: new Sessions() as unknown as SessionManager, broadcast: () => {}, toSubscribers: () => {}, publicBase: () => '' } as unknown as Deps);
  await app.ready();
  const saved = scheduler.save({ name: 'Weekly report', prompt: 'Write it', agent: 'claude', cwd: root, schedule: { kind: 'daily', time: '16:00', days: [5] }, extra: { assistant: scout.id } });
  const r = await app.inject({ method: 'GET', url: `/api/automations/week?start=${mondayOf(dateIn(TZ, Date.now()))}` });
  assert.equal(r.statusCode, 200);
  const w = r.json() as ScheduleWeek;
  assert.equal(w.days.length, 7);
  const it = w.items.find((x) => x.id === saved.id)!;
  assert.equal(it.source, 'agent');
  assert.equal(it.when, 'Fri at 16:00');
  assert.ok(w.next.filter((x) => x.task === saved.id).length <= 1);
  assert.equal((await app.inject({ method: 'GET', url: '/api/automations/week?start=yesterday' })).statusCode, 400);
  assert.equal((await app.inject({ method: 'GET', url: '/api/automations/week?days=1' })).json().days.length, 1);
  // Paused from the list, then on again.
  const off = await app.inject({ method: 'POST', url: `/api/automations/tasks/${saved.id}/enabled`, payload: { on: false } });
  assert.equal(off.statusCode, 200);
  assert.equal(off.json().task.enabled, false);
  assert.equal(scheduler.task(saved.id).enabled, false);
  const on = await app.inject({ method: 'POST', url: `/api/automations/tasks/${saved.id}/enabled`, payload: { on: true } });
  assert.equal(on.json().task.enabled, true);
  assert.ok(scheduler.task(saved.id).nextAt);
  assert.equal((await app.inject({ method: 'POST', url: '/api/automations/tasks/nope/enabled', payload: { on: true } })).statusCode, 404);
  await app.close();
});

console.log(`\n${passed} passed, ${failures.length} failed`);
fs.rmSync(root, { recursive: true, force: true });
if (failures.length) {
  console.log(`Failed: ${failures.join('; ')}`);
  process.exit(1);
}
process.exit(0);
