// What the Jobs section keeps in the app's database (shared/jobs.ts): the jobs run with the `job` command, from the moment
// they are registered, and what else was seen to end (sessions' background tasks, runs of Experiments, Hydor
// subagents), for the Finished list and for how long the same thing took before. Ended ones are kept a week. Also the
// tags: those in use, and those that a person, an agent or the helper model gave to one piece of work.
import fs from 'node:fs';
import { BROAD_TAGS, JOB_ENDED, type JobEntry, type JobState, type JobTag } from '../../shared/jobs.ts';
import type { DB } from '../db.ts';

export const KEEP_MS = 7 * 24 * 3600_000;
/** A tag in use is forgotten this long after it was last given. */
export const TAG_KEEP_MS = 180 * 24 * 3600_000;
/** The tags given to one entry (not a registered job's own) are kept this long: entries live a week. */
export const ITEM_TAG_KEEP_MS = 8 * 24 * 3600_000;
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
  /** Its own tags (`--tag`, `job tag`, or given on the page); none: the helper model may tag it. */
  tags?: string[];
  /** Who gave them: an agent (the default), or a person on the page. */
  tagsBy?: 'agent' | 'person';
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
    create table if not exists bg_job_tags (name text primary key, uses integer not null, last_at integer not null);
    create table if not exists bg_job_item_tags (id text primary key, tags text not null, "by" text not null, at integer not null);
    drop table if exists bg_job_session_tags;
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

// ---- tags ------------------------------------------------------------------------------------------------------------------

/** Counts tags as given once more, now. */
export function countTags(db: DB, tags: string[], now: number) {
  const add = db.prepare('insert into bg_job_tags (name, uses, last_at) values (?, 1, ?) on conflict(name) do update set uses = uses + 1, last_at = excluded.last_at');
  for (const t of tags) add.run(t, now);
}

/** Whether a tag is known: in use, or one of the broad ones (known even while unused). */
export const tagKnown = (db: DB, name: string): boolean => BROAD_TAGS.some((t) => t.name === name) || !!db.prepare('select 1 from bg_job_tags where name = ?').get(name);

const coversOf = (name: string) => BROAD_TAGS.find((t) => t.name === name)?.covers;

/** The tags in use (up to `limit`), the one used last first, then the broad tags not in use yet, in their order. */
export function tagsInUse(db: DB, limit: number): JobTag[] {
  const used = (db.prepare('select name, uses, last_at as lastAt from bg_job_tags order by last_at desc, rowid desc limit ?').all(limit) as JobTag[]).map((t) => {
    const covers = coversOf(t.name);
    return covers ? { ...t, covers } : t;
  });
  const names = new Set((db.prepare('select name from bg_job_tags').all() as { name: string }[]).map((r) => r.name));
  return [...used, ...BROAD_TAGS.filter((t) => !names.has(t.name)).map((t) => ({ name: t.name, uses: 0, lastAt: 0, covers: t.covers }))];
}

/** The tags given most often (up to `limit`), for the helper model to pick from. */
export function topTags(db: DB, limit: number): { name: string; uses: number }[] {
  return db.prepare('select name, uses from bg_job_tags order by uses desc, last_at desc limit ?').all(limit) as { name: string; uses: number }[];
}

/** The tags kept for one entry (a registered job's own are on it): who gave them. */
export interface ItemTags {
  tags: string[];
  by: 'person' | 'agent' | 'helper';
}

/** Every entry's kept tags, by entry id. */
export function itemTags(db: DB): Map<string, ItemTags> {
  const rows = db.prepare('select id, tags, "by" from bg_job_item_tags').all() as { id: string; tags: string; by: ItemTags['by'] }[];
  return new Map(rows.map((r) => [r.id, { tags: JSON.parse(r.tags) as string[], by: r.by }]));
}

/** Keeps what a person or an agent gave one entry, over whatever was there. */
export function setItemTags(db: DB, id: string, tags: string[], by: 'person' | 'agent', now: number) {
  db.prepare(
    `insert into bg_job_item_tags (id, tags, "by", at) values (?, ?, ?, ?)
     on conflict(id) do update set tags = excluded.tags, "by" = excluded."by", at = excluded.at`,
  ).run(id, JSON.stringify(tags), by, now);
}

export function forgetItemTags(db: DB, id: string) {
  db.prepare('delete from bg_job_item_tags where id = ?').run(id);
}

/** Keeps the helper model's pick for an entry, never over a person's or an agent's (set perhaps while the model was thinking); false when theirs stays. */
export function setHelperTag(db: DB, id: string, tag: string, now: number): boolean {
  return (
    db
      .prepare(
        `insert into bg_job_item_tags (id, tags, "by", at) values (?, ?, 'helper', ?)
         on conflict(id) do update set tags = excluded.tags, at = excluded.at where "by" = 'helper'`,
      )
      .run(id, JSON.stringify([tag]), now).changes > 0
  );
}

/**
 * An entry with its tags, resolved each time it is listed and never stored: its own (a registered job's), else those a
 * person or an agent gave it, else experiments for a run of Experiments, else the helper model's pick, else none.
 */
export function withTags(e: JobEntry, items: Map<string, ItemTags>): JobEntry {
  if (e.tags?.length) return { ...e, tagsFrom: e.tagsFrom ?? 'agent' };
  const row = items.get(e.id);
  if (row && row.by !== 'helper') return { ...e, tags: row.tags, tagsFrom: row.by };
  if (e.kind === 'experiment') return { ...e, tags: ['experiments'], tagsFrom: 'kind' };
  if (row) return { ...e, tags: row.tags, tagsFrom: 'helper' };
  return e;
}

// ---- keeping ---------------------------------------------------------------------------------------------------------------

/**
 * Removes what ended more than a week ago, with its log file (a job something still waits for is kept), and the tags
 * that are too old.
 */
export function prune(db: DB, now: number): number {
  db.prepare('delete from bg_job_tags where last_at < ?').run(now - TAG_KEEP_MS);
  db.prepare('delete from bg_job_item_tags where at < ?').run(now - ITEM_TAG_KEEP_MS);
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
