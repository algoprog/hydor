// What the Jobs section keeps in the app's database (shared/jobs.ts): the jobs run with the `job` command, from the moment
// they are registered, and what else was seen to end (sessions' background tasks, runs of Experiments, Hydor
// subagents), for the Finished list and for how long the same thing took before. Ended ones are kept a week.
import fs from 'node:fs';
import { JOB_ENDED, type JobEntry, type JobState } from '../../shared/jobs.ts';
import type { DB } from '../db.ts';

export const KEEP_MS = 7 * 24 * 3600_000;
/** How many earlier runs of the same command an estimate takes the middle of. */
const HISTORY_RUNS = 5;

export const isEnded = (state: JobState) => JOB_ENDED.includes(state);

/** A job run with the `job` command. */
export interface Registered {
  /** j-xxxxxxxx; its entry's id is "job:" and this. */
  id: string;
  state: JobState;
  name: string;
  command: string;
  cwd: string;
  /** The `job` process, and when it started (Linux: to tell a later process with the same number apart). */
  pid: number;
  pidStart?: string;
  /** The command's own process, which leads its process group. */
  commandPid?: number;
  log: string;
  etaMs?: number;
  /** The jobs it waits for, as entry ids. */
  after: string[];
  queue?: string;
  progressPattern?: string;
  /** What its progress count goes up to (`--total`). */
  progressTotal?: number;
  /** The session that registered it, and the run of its agent (none: a person's own shell or a script). */
  session?: string;
  runId?: string;
  queuedAt: number;
  startedAt?: number;
  endedAt?: number;
  exitCode?: number;
  /** When a stop was asked. */
  stopAsked?: number;
  reason?: string;
  /**
   * `job adopt`: a process that was running already (`pid`), not a command of ours. `log` is then a file of the user's
   * (or none, ''), which is only ever read.
   */
  adopted?: boolean;
  /** The session task's output file that process writes to, when it is one: that task is this job. */
  taskOutput?: string;
  /** Another user's process, which cannot be stopped from here. */
  foreign?: boolean;
  /** An adopted process that is gone: how it ended, nobody saw. */
  exitUnknown?: boolean;
  /** What its output said last, kept when it ended. */
  progress?: JobEntry['progress'];
  lastLine?: string;
}

export const jobKey = (id: string) => `job:${id}`;
/** An entry's id, given it or a registered job's own short id (j-…), which the `job` command uses. */
export const entryId = (id: string) => (/^j-[a-z0-9]+$/.test(id) ? jobKey(id) : id);

export function jobsSchema(db: DB) {
  db.exec(`
    create table if not exists bg_jobs (
      id text primary key, mine integer not null, state text not null, name text not null, sig text, cwd text,
      queued_at integer, started_at integer, ended_at integer, hidden integer not null default 0, data text not null
    );
    create index if not exists bg_jobs_ended on bg_jobs (ended_at);
    create index if not exists bg_jobs_sig on bg_jobs (sig, cwd, ended_at);
  `);
}

interface Row {
  id: string;
  mine: number;
  state: JobState;
  ended_at: number | null;
  hidden: number;
  data: string;
}

const registered = (r: Row) => JSON.parse(r.data) as Registered;

export function saveRegistered(db: DB, j: Registered, sig: string) {
  db.prepare(
    `insert into bg_jobs (id, mine, state, name, sig, cwd, queued_at, started_at, ended_at, data) values (?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
     on conflict(id) do update set state = excluded.state, sig = excluded.sig, started_at = excluded.started_at, ended_at = excluded.ended_at, data = excluded.data`,
  ).run(jobKey(j.id), j.state, j.name, sig || null, j.cwd, j.queuedAt, j.startedAt ?? null, j.endedAt ?? null, JSON.stringify(j));
}

export function getRegistered(db: DB, key: string): Registered | null {
  const r = db.prepare('select * from bg_jobs where id = ? and mine = 1').get(key) as Row | undefined;
  return r ? registered(r) : null;
}

/** The registered jobs still queued or running, in the order they were registered. */
export function activeRegistered(db: DB): Registered[] {
  return (db.prepare(`select * from bg_jobs where mine = 1 and ended_at is null order by queued_at, rowid`).all() as Row[]).map(registered);
}

/** The registered jobs at work or ended since `since`. */
function recentRegistered(db: DB, since: number): Registered[] {
  return (db.prepare(`select * from bg_jobs where mine = 1 and (ended_at is null or ended_at >= ?)`).all(since) as Row[]).map(registered);
}

/** A session's `job run` jobs, ended ones too: its `job run` tasks are told apart by them. */
export function sessionRegistered(db: DB, session: string, since: number): Registered[] {
  return recentRegistered(db, since).filter((j) => j.session === session && !j.adopted);
}

/** Adopted processes that are a session task's own, whichever session adopted them. */
export function adoptedTasks(db: DB, since: number): Registered[] {
  return recentRegistered(db, since).filter((j) => j.adopted && j.taskOutput);
}

/** The newest job with exactly this name. */
export function newestNamed(db: DB, name: string): Registered | null {
  const r = db.prepare(`select * from bg_jobs where mine = 1 and name = ? order by queued_at desc, rowid desc limit 1`).get(name) as Row | undefined;
  return r ? registered(r) : null;
}

/**
 * Keeps something that was seen to end (not a registered job). The same end seen again changes nothing, so one the user
 * cleared stays cleared; a later end of the same thing (a subagent's next turn) shows again.
 */
export function saveSeen(db: DB, entry: JobEntry, sig: string | undefined) {
  const had = db.prepare('select ended_at from bg_jobs where id = ?').get(entry.id) as { ended_at: number | null } | undefined;
  if (had && had.ended_at === (entry.endedAt ?? null)) return false;
  db.prepare(
    `insert into bg_jobs (id, mine, state, name, sig, cwd, queued_at, started_at, ended_at, hidden, data) values (?, 0, ?, ?, ?, ?, ?, ?, ?, 0, ?)
     on conflict(id) do update set state = excluded.state, name = excluded.name, sig = excluded.sig, cwd = excluded.cwd, started_at = excluded.started_at,
       ended_at = excluded.ended_at, hidden = 0, data = excluded.data`,
  ).run(entry.id, entry.state, entry.name, sig || null, entry.cwd ?? null, entry.queuedAt ?? null, entry.startedAt ?? null, entry.endedAt ?? null, JSON.stringify(entry));
  return true;
}

/** Something seen before to end, unless it is a `job` job. */
export function getSeen(db: DB, id: string): JobEntry | null {
  const r = db.prepare('select data from bg_jobs where id = ? and mine = 0').get(id) as { data: string } | undefined;
  return r ? (JSON.parse(r.data) as JobEntry) : null;
}

export function forgetSeen(db: DB, id: string) {
  db.prepare('delete from bg_jobs where id = ? and mine = 0').run(id);
}

export type EndedRow = { job: Registered } | { entry: JobEntry };

/** What ended in the last week and was not cleared, newest first. `skip`: ids that run again now. */
export function endedRows(db: DB, now: number, limit: number, skip: Set<string>): EndedRow[] {
  const rows = db.prepare('select * from bg_jobs where ended_at is not null and ended_at >= ? and hidden = 0 order by ended_at desc, rowid desc').iterate(now - KEEP_MS) as Iterable<Row>;
  const out: EndedRow[] = [];
  for (const r of rows) {
    if (out.length >= limit) break;
    if (skip.has(r.id)) continue;
    out.push(r.mine ? { job: registered(r) } : { entry: JSON.parse(r.data) as JobEntry });
  }
  return out;
}

/** Takes one ended job, or all of them, out of the Finished list; the rows stay for the estimates and `job wait`. */
export function hideEnded(db: DB, id?: string): number {
  return id
    ? db.prepare('update bg_jobs set hidden = 1 where id = ? and ended_at is not null').run(id).changes
    : db.prepare('update bg_jobs set hidden = 1 where ended_at is not null').run().changes;
}

/** How long the same command in the same folder took before, when it finished well: the middle of the last few. */
export function historyMs(db: DB, sig: string | undefined, cwd: string | undefined): number | undefined {
  if (!sig || !cwd) return undefined;
  const rows = db
    .prepare(`select ended_at - started_at as ms from bg_jobs where sig = ? and cwd = ? and state = 'done' and started_at is not null and ended_at > started_at order by ended_at desc limit ?`)
    .all(sig, cwd, HISTORY_RUNS) as { ms: number }[];
  if (!rows.length) return undefined;
  const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
  const mid = ms.length >> 1;
  return ms.length % 2 ? ms[mid] : Math.round((ms[mid - 1] + ms[mid]) / 2);
}

/** Removes what ended more than a week ago, with its log file; a job something still waits for is kept. */
export function prune(db: DB, now: number): number {
  const waited = new Set(activeRegistered(db).flatMap((j) => j.after));
  const rows = db.prepare('select * from bg_jobs where ended_at is not null and ended_at < ?').all(now - KEEP_MS) as Row[];
  const drop = db.prepare('delete from bg_jobs where id = ?');
  let n = 0;
  for (const r of rows) {
    if (waited.has(r.id)) continue;
    // Only a log of the app's own making: an adopted job's is the user's file.
    const job = r.mine ? registered(r) : null;
    if (job && !job.adopted) fs.rmSync(job.log, { force: true });
    drop.run(r.id);
    n++;
  }
  return n;
}
