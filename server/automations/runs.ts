// Each run of a task, kept with how it went: what started it, when, the outcome its agent reported
// (or the app saw), a one-line summary, the cost, the session it ran in, and its input so it can
// run again the same way. Also the webhook deliveries already seen, so a retried one runs once.
import crypto from 'node:crypto';
import type { RunOutcome, RunStatus, RunTrigger, TaskRun } from '../../shared/automations.ts';
import type { DB } from '../db.ts';

export interface RunRow {
  id: string;
  task_id: string;
  trigger: RunTrigger;
  started_at: number;
  ended_at: number | null;
  status: RunStatus;
  /** What its agent reported (report_outcome), before the run ends. */
  outcome: RunOutcome | null;
  summary: string | null;
  reply: string | null;
  cost_usd: number | null;
  /** The session's cost when the run began (a run that posts into a session pays only its own part). */
  cost_base: number;
  key: string | null;
  input: string | null;
  /** The message as sent, to find it in the session's queue. */
  sent: string | null;
  /** 1: it waits behind a turn already under way; 2: it went out when that turn ended. */
  queued: number;
  notified: number;
  error: string | null;
  rerun_of: string | null;
  /** The template run it started (a task that runs a template). */
  app_run: string | null;
}

/** Runs kept per task. */
const KEEP = 100;
const MAX_INPUT = 100_000;

export function migrateRuns(db: DB) {
  db.exec(`create table if not exists task_runs (
    id text primary key, task_id text not null, trigger text not null, started_at integer not null, ended_at integer,
    status text not null, outcome text, summary text, reply text, cost_usd real, cost_base real not null default 0, key text,
    input text, sent text, queued integer not null default 0, notified integer not null default 0, error text, rerun_of text
  );
  create index if not exists task_runs_task on task_runs(task_id, started_at);
  create index if not exists task_runs_key on task_runs(key, started_at);
  create table if not exists hook_deliveries (task_id text not null, delivery text not null, run_id text, at integer not null, primary key (task_id, delivery));`);
  const cols = new Set((db.prepare('pragma table_info(task_runs)').all() as { name: string }[]).map((c) => c.name));
  if (!cols.has('app_run')) db.exec('alter table task_runs add column app_run text');
  db.exec('create index if not exists task_runs_app on task_runs(app_run)');
}

export function toRun(r: RunRow): TaskRun {
  return {
    id: r.id,
    taskId: r.task_id,
    trigger: r.trigger,
    startedAt: r.started_at,
    endedAt: r.ended_at ?? undefined,
    status: r.status,
    summary: r.summary ?? undefined,
    reply: r.reply ?? undefined,
    costUsd: r.cost_usd ?? undefined,
    key: r.key ?? undefined,
    error: r.error ?? undefined,
    rerunOf: r.rerun_of ?? undefined,
    hasInput: !!r.input,
    ...(r.app_run ? { appRun: r.app_run } : {}),
  };
}

export function startRun(db: DB, r: { taskId: string; trigger: RunTrigger; input: string; rerunOf?: string }): string {
  const id = crypto.randomBytes(8).toString('hex');
  db.prepare(`insert into task_runs (id, task_id, trigger, started_at, status, input, rerun_of) values (?, ?, ?, ?, 'running', ?, ?)`).run(
    id,
    r.taskId,
    r.trigger,
    Date.now(),
    r.input.slice(0, MAX_INPUT),
    r.rerunOf ?? null,
  );
  if (r.taskId) {
    // The oldest go once a task has many.
    db.prepare(`delete from task_runs where task_id = ? and id not in (select id from task_runs where task_id = ? order by started_at desc limit ${KEEP})`).run(r.taskId, r.taskId);
  }
  return id;
}

type Fields = Partial<Pick<RunRow, 'key' | 'cost_base' | 'sent' | 'queued' | 'outcome' | 'summary' | 'notified' | 'cost_usd' | 'error' | 'app_run'>>;

/** The task run that started a template run. */
export function runOfApp(db: DB, appRun: string): RunRow | undefined {
  return db.prepare('select * from task_runs where app_run = ?').get(appRun) as RunRow | undefined;
}

export function setRun(db: DB, id: string, f: Fields) {
  const keys = Object.keys(f) as (keyof Fields)[];
  if (!keys.length) return;
  db.prepare(`update task_runs set ${keys.map((k) => `${k} = @${k}`).join(', ')} where id = @id`).run({ ...f, id });
}

/** Ends a run still going; false when it had already ended. */
export function finishRun(db: DB, id: string, f: { status: RunStatus; summary?: string | null; reply?: string | null; costUsd?: number | null; error?: string | null; at?: number }): boolean {
  const r = db
    .prepare(`update task_runs set status = ?, ended_at = ?, summary = coalesce(?, summary), reply = ?, cost_usd = ?, error = ? where id = ? and status = 'running'`)
    .run(f.status, f.at ?? Date.now(), f.summary ?? null, f.reply?.slice(0, 20_000) ?? null, f.costUsd ?? null, f.error ?? null, id);
  return r.changes > 0;
}

export const getRun = (db: DB, id: string) => db.prepare('select * from task_runs where id = ?').get(id) as RunRow | undefined;

/** The run going on in a session now, if one is. */
export const openRunIn = (db: DB, key: string) => db.prepare(`select * from task_runs where key = ? and status = 'running' order by started_at desc, rowid desc limit 1`).get(key) as RunRow | undefined;

/** The latest run in a session that is going on or ended within `ms`. */
export const recentRunIn = (db: DB, key: string, ms: number) =>
  db.prepare(`select * from task_runs where key = ? and (status = 'running' or ended_at > ?) order by started_at desc, rowid desc limit 1`).get(key, Date.now() - ms) as RunRow | undefined;

/** A task's run still going that one of its triggers started lately. */
export const openRunOf = (db: DB, taskId: string, trigger: RunTrigger, ms: number) =>
  db.prepare(`select * from task_runs where task_id = ? and trigger = ? and status = 'running' and started_at > ? limit 1`).get(taskId, trigger, Date.now() - ms) as RunRow | undefined;

export const openRuns = (db: DB) => db.prepare(`select * from task_runs where status = 'running'`).all() as RunRow[];

export function listRuns(db: DB, taskId: string, limit = 30): TaskRun[] {
  return (db.prepare('select * from task_runs where task_id = ? order by started_at desc, rowid desc limit ?').all(taskId, limit) as RunRow[]).map(toRun);
}

/** The latest outcomes of every task, newest first, for the task list. */
export function recentByTask(db: DB, n = 6): Map<string, { status: RunStatus; at: number }[]> {
  const out = new Map<string, { status: RunStatus; at: number }[]>();
  const rows = db
    .prepare(`select task_id, status, started_at, k from (select task_id, status, started_at, rowid as k, row_number() over (partition by task_id order by started_at desc, rowid desc) as n from task_runs where task_id != '') where n <= ?`)
    .all(n) as { task_id: string; status: RunStatus; started_at: number; k: number }[];
  for (const r of rows.sort((a, b) => b.started_at - a.started_at || b.k - a.k)) {
    const list = out.get(r.task_id) ?? [];
    list.push({ status: r.status, at: r.started_at });
    out.set(r.task_id, list);
  }
  return out;
}

export function dropRuns(db: DB, taskId: string) {
  db.prepare('delete from task_runs where task_id = ?').run(taskId);
  db.prepare('delete from hook_deliveries where task_id = ?').run(taskId);
}

/**
 * Notes a webhook delivery by its id: true the first time; false for one seen within a week (a
 * retry), with the run it started.
 */
export function firstDelivery(db: DB, taskId: string, delivery: string): { first: true } | { first: false; runId: string | null } {
  db.prepare('delete from hook_deliveries where at < ?').run(Date.now() - 7 * 86_400_000);
  const r = db.prepare('insert into hook_deliveries (task_id, delivery, at) values (?, ?, ?) on conflict do nothing').run(taskId, delivery.slice(0, 200), Date.now());
  if (r.changes) return { first: true };
  const seen = db.prepare('select run_id from hook_deliveries where task_id = ? and delivery = ?').get(taskId, delivery.slice(0, 200)) as { run_id: string | null } | undefined;
  return { first: false, runId: seen?.run_id ?? null };
}

export function deliveryRun(db: DB, taskId: string, delivery: string, runId: string | null) {
  if (runId) db.prepare('update hook_deliveries set run_id = ? where task_id = ? and delivery = ?').run(runId, taskId, delivery.slice(0, 200));
  // A delivery that did not start a run may come again.
  else db.prepare('delete from hook_deliveries where task_id = ? and delivery = ?').run(taskId, delivery.slice(0, 200));
}
