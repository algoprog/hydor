// Everything that runs by itself, over a week (or a month): the runs that happened, from the tasks' run history,
// and the runs to come, from each schedule laid out over the days in the user's time zone. Agents' and apps'
// schedules are scheduled tasks too (an agent's carries extra.assistant, an app's its app or the origin of its
// Update automatically), so one table holds them all. What repeats every few minutes, watchers and webhooks come
// as one band a day rather than a block a run. No model, and no call to anything outside: it answers at once.
import { MAX_RANGE_DAYS, addDate, mondayOf, type ScheduleItem, type ScheduleSource, type ScheduleWeek, type WeekBand, type WeekDay, type WeekNext, type WeekRun } from '../../shared/schedules.ts';
import { scheduleText, type RunStatus, type RunTrigger, type ScheduledTask, type TaskSchedule } from '../../shared/automations.ts';
import { allAssistants } from '../assistants/store.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { cronDay, parseCron, wallAt, zonedTime, type Cron } from './schedule.ts';

const MIN = 60_000;
/** More runs than this in a day, and an item is drawn as a band. */
export const BAND_PER_DAY = 8;
/** The most runs to come drawn as blocks over a whole range; past it the rest are left out (and `capped` says so). */
const MAX_NEXT = 2500;
/** The most past runs read for a range. */
const MAX_RUNS = 6000;

const DATE = /^(\d{4})-(\d\d)-(\d\d)$/;

/** A YYYY-MM-DD day as its parts and weekday; null when it is not a real day. */
function dateParts(s: string): { y: number; mo: number; d: number; wd: number } | null {
  const m = DATE.exec(s);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return { y, mo, d, wd: t.getUTCDay() };
}

/** The day an instant falls on in a time zone, YYYY-MM-DD. */
export function dateIn(tz: string, at: number): string {
  const w = wallAt(tz, at);
  return `${w.y}-${String(w.mo).padStart(2, '0')}-${String(w.d).padStart(2, '0')}`;
}

/** What a task is for, the agent or app it belongs to, and where it is changed. */
function itemOf(t: ScheduledTask, agents: Map<string, { name: string; icon?: string }>, tz: string, band: boolean): ScheduleItem {
  const agentId = typeof t.extra?.assistant === 'string' ? t.extra.assistant : undefined;
  const agent = agentId ? agents.get(agentId) : undefined;
  const daily = t.origin?.startsWith('daily:') ? t.origin.slice('daily:'.length) : undefined;
  const appId = t.app?.id ?? daily;
  const source: ScheduleSource = agent ? 'agent' : appId ? 'app' : 'task';
  const appPage = (id: string) => (id.startsWith('tpl:') ? `/apps/t/${encodeURIComponent(id.slice(4))}` : `/apps/${encodeURIComponent(id)}`);
  // Where it is changed today: an agent's schedules on its page, an app's under its Runs (Update automatically in its
  // page's Settings), the rest in Settings → Scheduled tasks.
  const edit = agent ? `/agents/${encodeURIComponent(agentId!)}` : appId ? `${appPage(appId)}${daily ? '' : '?tab=runs'}` : `/settings?s=tasks&task=${encodeURIComponent(t.id)}`;
  return {
    id: t.id,
    name: t.name,
    source,
    kind: t.schedule.kind,
    when: scheduleText(t.schedule, tz),
    enabled: t.enabled,
    ...(t.pausedReason ? { pausedReason: t.pausedReason } : {}),
    ...(t.enabled && t.nextAt ? { nextAt: t.nextAt } : {}),
    ...(t.recent?.length ? { recent: t.recent } : {}),
    ...(t.lastStatus ? { lastStatus: t.lastStatus } : {}),
    ...(agent ? { agent: { id: agentId!, name: agent.name, ...(agent.icon ? { icon: agent.icon } : {}) } } : {}),
    ...(appId ? { app: { id: appId, ...(t.appName ? { name: t.appName } : {}), ...(daily ? { daily: true } : {}) } } : {}),
    edit,
    band,
  };
}

/** The minutes of one day a schedule that goes by the clock fires at (a time of day, a cron expression). */
function minutesOn(s: TaskSchedule, cron: Cron | null, day: { mo: number; d: number; wd: number }): number[] {
  if (s.kind === 'daily') {
    if (s.days?.length && !s.days.includes(day.wd)) return [];
    const [h, m] = s.time.split(':').map(Number);
    return [h * 60 + m];
  }
  if (s.kind === 'cron' && cron) {
    if (!cronDay(cron, day)) return [];
    const out: number[] = [];
    for (const h of cron.hour) for (const m of cron.minute) out.push(h * 60 + m);
    return out;
  }
  return [];
}

export interface WeekOptions {
  tz: string;
  now: number;
  /** The first day, YYYY-MM-DD in the time zone; when unset, this week's Monday (today for fewer than seven days). */
  start?: string;
  /** How many days (1 to 42); 7 when unset. */
  days?: number;
}

/**
 * The range's days with their totals, every item that runs by itself, the runs that happened in it (blocks, or bands
 * for what runs often) and the runs to come. Throws a 400 for a start that is not a day.
 */
export function scheduleWeek(db: DB, tasks: ScheduledTask[], o: WeekOptions): ScheduleWeek {
  const { tz, now } = o;
  const today = dateIn(tz, now);
  if (o.start !== undefined && !dateParts(o.start)) throw new HttpError(400, 'The start is a day written as YYYY-MM-DD');
  const n = Math.min(MAX_RANGE_DAYS, Math.max(1, Math.round(Number(o.days) || 7)));
  // Unset: this week from its Monday, or today for fewer days (a phone's day).
  const start = o.start ?? (n < 7 ? today : mondayOf(today));

  // The days, each from its midnight to the next (23 or 25 hours when the clocks change).
  const dates = Array.from({ length: n + 1 }, (_, i) => addDate(start, i));
  const parts = dates.map((d) => dateParts(d)!);
  const edges = parts.map((p) => zonedTime(tz, p.y, p.mo, p.d, 0, 0));
  const days: WeekDay[] = dates.slice(0, n).map((date, i) => ({ date, from: edges[i], to: edges[i + 1], wd: parts[i].wd, runs: 0, by: {}, costUsd: 0, planned: 0 }));
  const lo = edges[0];
  const hi = edges[n];
  const dayOf = (t: number) => {
    for (let i = 0; i < n; i++) if (t < edges[i + 1]) return i;
    return n - 1;
  };
  const minOf = (t: number) => {
    const w = wallAt(tz, t);
    return w.h * 60 + w.mi;
  };

  // Runs to come, by item and day: how many each day, and for the items drawn as blocks, when.
  const nowDay = now >= lo && now < hi ? dayOf(now) : -1;
  const nowMin = minOf(now);
  const planned = new Map<string, { count: number[]; at: number[][] }>();
  const plan = (t: ScheduledTask): { count: number[]; at: number[][]; band: boolean } => {
    const count = Array.from({ length: n }, () => 0);
    const at: number[][] = Array.from({ length: n }, () => []);
    const s = t.schedule;
    const on = t.enabled && !!t.nextAt;
    if (s.kind === 'watch' || s.kind === 'webhook') return { count, at, band: true };
    if (s.kind === 'once') {
      if (on && s.at > now && s.at >= lo && s.at < hi) (count[dayOf(s.at)]++, at[dayOf(s.at)].push(s.at));
      return { count, at, band: false };
    }
    if (s.kind === 'every') {
      const step = Math.max(5, s.minutes) * MIN;
      const band = Math.ceil((1440 * MIN) / step) > BAND_PER_DAY;
      if (!on) return { count, at, band };
      let x = Math.max(t.nextAt!, now);
      if (x < lo) x += Math.ceil((lo - x) / step) * step;
      for (let i = 0; i < n; i++) {
        const a = Math.max(edges[i], x);
        const b = edges[i + 1];
        if (b <= a) continue;
        // The first run at or after a, and how many fit before b.
        const first = x + Math.ceil((a - x) / step) * step;
        count[i] = first < b ? Math.ceil((b - first) / step) : 0;
        if (!band) for (let y = first; y < b; y += step) at[i].push(y);
      }
      return { count, at, band };
    }
    // A time of day or a cron expression: the minutes it fires at on each day, by the clock.
    let cron: Cron | null = null;
    if (s.kind === 'cron') {
      try {
        cron = parseCron(s.expr);
      } catch {
        return { count, at, band: false };
      }
    }
    const mins = parts.slice(0, n).map((p) => minutesOn(s, cron, p));
    // How often it fires on a day, whether or not it is on, decides a band.
    const band = mins.some((m) => m.length > BAND_PER_DAY);
    if (!on) return { count, at, band };
    for (let i = 0; i < n; i++) {
      if (edges[i + 1] <= now) continue;
      if (band) {
        count[i] = i === nowDay ? mins[i].filter((m) => m > nowMin).length : mins[i].length;
        continue;
      }
      for (const m of mins[i]) {
        const x = zonedTime(tz, parts[i].y, parts[i].mo, parts[i].d, Math.floor(m / 60), m % 60);
        // A time the clocks skip moves past the change; keep each run on its own day.
        if (x > now && x >= edges[i] && x < edges[i + 1]) (count[i]++, at[i].push(x));
      }
    }
    return { count, at, band };
  };

  const agents = new Map(allAssistants(db).map((a) => [a.id, { name: a.name, icon: a.icon }]));
  const items: ScheduleItem[] = [];
  for (const t of tasks) {
    const p = plan(t);
    planned.set(t.id, p);
    items.push(itemOf(t, agents, tz, p.band));
  }
  const byId = new Map(items.map((it) => [it.id, it]));

  // Each item's latest run, for the list (whenever it was).
  const latest = db
    .prepare(
      `select task_id, status, started_at, summary, key, app_run from (select *, row_number() over (partition by task_id order by started_at desc, rowid desc) as n from task_runs where task_id != '') where n = 1`,
    )
    .all() as { task_id: string; status: RunStatus; started_at: number; summary: string | null; key: string | null; app_run: string | null }[];
  for (const r of latest) {
    const it = byId.get(r.task_id);
    if (it) it.last = { status: r.status, at: r.started_at, ...(r.summary ? { summary: r.summary } : {}), ...(r.key ? { key: r.key } : {}), ...(r.app_run ? { appRun: r.app_run } : {}) };
  }

  // The runs in the range: blocks, or counted into their item's band.
  const rows = db
    .prepare(`select id, task_id, trigger, started_at, ended_at, status, summary, cost_usd, key, app_run from task_runs where task_id != '' and started_at >= ? and started_at < ? order by started_at, rowid limit ${MAX_RUNS}`)
    .all(lo, hi) as {
    id: string;
    task_id: string;
    trigger: RunTrigger;
    started_at: number;
    ended_at: number | null;
    status: RunStatus;
    summary: string | null;
    cost_usd: number | null;
    key: string | null;
    app_run: string | null;
  }[];
  const runs: WeekRun[] = [];
  const bands = new Map<string, WeekBand>();
  const bandOf = (task: string, day: number) => {
    const k = `${task}\n${day}`;
    let b = bands.get(k);
    if (!b) bands.set(k, (b = { task, day, runs: 0, by: {}, costUsd: 0, planned: 0 }));
    return b;
  };
  const cents = (x: number) => Math.round(x * 1e6) / 1e6;
  for (const r of rows) {
    const it = byId.get(r.task_id);
    if (!it) continue;
    const day = dayOf(r.started_at);
    const d = days[day];
    d.runs++;
    d.by[r.status] = (d.by[r.status] ?? 0) + 1;
    d.costUsd = cents(d.costUsd + (r.cost_usd ?? 0));
    if (it.band) {
      const b = bandOf(it.id, day);
      b.runs++;
      b.by[r.status] = (b.by[r.status] ?? 0) + 1;
      b.costUsd = cents(b.costUsd + (r.cost_usd ?? 0));
      continue;
    }
    runs.push({
      id: r.id,
      task: r.task_id,
      at: r.started_at,
      ...(r.ended_at ? { endedAt: r.ended_at } : {}),
      day,
      min: minOf(r.started_at),
      mins: Math.max(0, Math.round(((r.ended_at ?? (r.status === 'running' ? now : r.started_at)) - r.started_at) / MIN)),
      status: r.status,
      trigger: r.trigger,
      ...(r.summary ? { summary: r.summary } : {}),
      ...(r.cost_usd ? { costUsd: r.cost_usd } : {}),
      ...(r.key ? { key: r.key } : {}),
      ...(r.app_run ? { appRun: r.app_run } : {}),
    });
  }

  // The runs to come: blocks up to a cap, the bands' as counts.
  const next: WeekNext[] = [];
  let capped = false;
  for (const it of items) {
    const { count, at } = planned.get(it.id)!;
    for (let day = 0; day < n; day++) {
      if (!count[day]) continue;
      days[day].planned += count[day];
      if (it.band) {
        bandOf(it.id, day).planned += count[day];
        continue;
      }
      for (const x of at[day]) {
        if (next.length >= MAX_NEXT) {
          capped = true;
          break;
        }
        next.push({ task: it.id, at: x, day, min: minOf(x) });
      }
    }
  }
  next.sort((a, b) => a.at - b.at);

  // The list: what runs next first, then what waits for something (watchers, webhooks), then what is paused.
  const rank = (it: ScheduleItem) => (!it.enabled ? 2 : it.nextAt && it.kind !== 'watch' ? 0 : 1);
  items.sort((a, b) => rank(a) - rank(b) || (a.nextAt ?? 0) - (b.nextAt ?? 0) || a.name.localeCompare(b.name));
  return {
    tz,
    now,
    today,
    start,
    days,
    items,
    runs,
    next,
    bands: [...bands.values()].sort((a, b) => a.day - b.day),
    ...(capped ? { capped: true } : {}),
  };
}
