// The records of experiments' runs and the results tables made from them, as the rest of the app reads them (the
// pre-submission check traces a paper's numbers to them; apps' steps list them), and as the queue keeps them. A run
// is a row: its job (the spec as given, JSON), its status and why, and what it recorded (commit, patch, environment,
// GPUs, exit code…, JSON); its events, its metrics' series, the tables, the sweeps and the waits of app steps each
// have a table of their own. The tables are made on first use, so any part of the app can read with just the db.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ExperimentInfo, JobSpec, MetricSeries, ResultsTable, ResultsTableSpec, RunEvent, RunRecord, RunStatus, SweepSpec } from '../../shared/experiments.ts';
import { config } from '../config.ts';
import type { DB } from '../db.ts';
import { makeTable, readScores } from './tables.ts';

export interface RunQuery {
  /** Runs started in this folder or under it. */
  cwd?: string;
  group?: string;
  tag?: string;
  status?: RunStatus[];
  project?: string;
  limit?: number;
  /** The runs of a sweep. */
  sweep?: string;
  /** The night runs of one night (the date it began on). */
  night?: string;
  /** Words in the name, group, command or id. */
  q?: string;
  /** Oldest first (the queue's order), instead of newest first. */
  oldest?: boolean;
  /** Leave out the runs that score an evaluation (what lists experiments does). */
  plain?: boolean;
}

/** A run the app made to score an evaluation: its tag, and the variable that names the evaluation. */
export const isScoringRun = (r: Pick<RunRecord, 'tags' | 'env'>) => !!r.tags?.includes('evaluation') && r.env?.HYDOR_EVALUATION !== undefined;
/** A run of a final test: only the person reads it. */
export const isFinalRun = (r: Pick<RunRecord, 'tags' | 'env'>) => isScoringRun(r) && r.env?.HYDOR_EVAL_KIND === 'final';

/** Where every run keeps its folder (log, patch, exit code, metrics, scores). */
export const RUNS_ROOT = path.join(config.dataDir, 'experiments');
export const runFolder = (id: string) => path.join(RUNS_ROOT, id);

const ID = /^[a-z0-9]{4,32}$/;
export const okId = (id: string) => ID.test(id);

let idCount = 0;
/**
 * A new id: a letter for its kind, then the time, a count and a little chance, so ids sort by when they were made. The
 * count keeps ids made in the same millisecond apart (a score starts a run for each seed at once): chance alone met
 * itself now and then.
 */
export const newId = (kind: 'r' | 't' | 's' | 'e' | 'c') => {
  idCount = (idCount + 1) % 1296;
  return `${kind}${Date.now().toString(36)}${idCount.toString(36).padStart(2, '0')}${crypto.randomBytes(2).toString('hex')}`;
};

const made = new WeakSet<DB>();
/** Makes the tables on first use (evaluations.ts has its own among them). */
export function tables(db: DB) {
  if (made.has(db)) return;
  db.exec(`
    create table if not exists exp_runs (
      id text primary key, status text not null, why text, name text, grp text, sweep text, project text,
      cwd text not null, place text not null default 'local', priority integer not null default 0,
      created_at integer not null, started_at integer, ended_at integer,
      spec text not null, info text, metrics text,
      log_offset integer not null default 0, file_offset integer not null default 0
    );
    create index if not exists exp_runs_created on exp_runs(created_at desc);
    create index if not exists exp_runs_status on exp_runs(status);
    create index if not exists exp_runs_grp on exp_runs(grp);
    create table if not exists exp_events (id integer primary key autoincrement, run text not null, at integer not null, kind text not null, text text not null, session text);
    create index if not exists exp_events_run on exp_events(run, id);
    create table if not exists exp_series (run text not null, metric text not null, points text not null, primary key (run, metric)) without rowid;
    create table if not exists exp_tables (id text primary key, spec text not null, data text not null, made_at integer not null);
    create table if not exists exp_sweeps (id text primary key, grp text not null, spec text not null, created_at integer not null);
    create table if not exists exp_waits (key text primary key, started_at integer not null);
    create table if not exists exp_groups (name text primary key, title text, description text, category text, by text, runs integer, at integer);
    create table if not exists exp_evals (id text primary key, cwd text not null, name text not null, spec text not null, seal text not null, state text not null, baseline text, finals integer not null default 0, created_at integer not null, updated_at integer not null);
    create table if not exists exp_eval_files (eval text not null, seal integer not null, path text not null, sha text not null, size integer not null, mtime_ms real not null, ctime_ms real not null, mode integer not null default 0, link text, copied integer not null default 0, primary key (eval, seal, path)) without rowid;
    create table if not exists exp_scores (id text primary key, eval text not null, seal integer not null, kind text not null, status text not null, info text not null, created_at integer not null, ended_at integer);
    create index if not exists exp_scores_eval on exp_scores(eval, created_at desc);
    create index if not exists exp_scores_status on exp_scores(status);
  `);
  made.add(db);
}

interface Row {
  id: string;
  status: RunStatus;
  why: string | null;
  cwd: string;
  created_at: number;
  started_at: number | null;
  ended_at: number | null;
  spec: string;
  info: string | null;
  metrics: string | null;
  log_offset: number;
  file_offset: number;
}

const parse = <T>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

/** What a run recorded besides its job: the record's other fields. */
export type RunInfo = Omit<RunRecord, keyof JobSpec | 'id' | 'status' | 'why' | 'createdAt' | 'startedAt' | 'endedAt' | 'metrics' | 'events'>;

function toRecord(r: Row): RunRecord {
  const spec = parse<JobSpec>(r.spec, { command: '', cwd: r.cwd });
  const info = parse<RunInfo>(r.info, {});
  const metrics = parse<RunRecord['metrics'] | null>(r.metrics, null);
  return {
    ...spec,
    ...info,
    id: r.id,
    status: r.status,
    ...(r.why ? { why: r.why } : {}),
    createdAt: r.created_at,
    ...(r.started_at ? { startedAt: r.started_at } : {}),
    ...(r.ended_at ? { endedAt: r.ended_at } : {}),
    ...(metrics ? { metrics } : {}),
  };
}

/** Runs, newest first. */
export function listRuns(db: DB, q: RunQuery = {}): RunRecord[] {
  tables(db);
  const where: string[] = [];
  const args: unknown[] = [];
  if (q.cwd) {
    const c = q.cwd.replace(/[\\/]+$/, '') || '/';
    where.push(`(cwd = ? or substr(cwd, 1, ?) = ?)`);
    args.push(c, c.length + 1, `${c === '/' ? '' : c}/`);
  }
  if (q.group) {
    where.push('grp = ?');
    args.push(q.group);
  }
  if (q.sweep) {
    where.push('sweep = ?');
    args.push(q.sweep);
  }
  if (q.project) {
    where.push('project = ?');
    args.push(q.project);
  }
  if (q.status?.length) {
    where.push(`status in (${q.status.map(() => '?').join(', ')})`);
    args.push(...q.status);
  }
  // The job as given is JSON: a variable's name followed by a colon is only found where it is one of its variables.
  if (q.plain) where.push(`not (instr(spec, '"HYDOR_EVALUATION":') > 0 and instr(spec, '"evaluation"') > 0)`);
  const limit = Math.min(Math.max(Math.round(q.limit ?? 200), 1), 5000);
  // Tags and words are looked for in the job itself; more rows are read so the limit still fills.
  const loose = !!q.tag || !!q.night || !!q.q?.trim();
  const sql = `select * from exp_runs ${where.length ? `where ${where.join(' and ')}` : ''} order by created_at ${q.oldest ? 'asc' : 'desc'}, id ${q.oldest ? 'asc' : 'desc'} limit ?`;
  let runs = (db.prepare(sql).all(...args, loose ? limit * 20 : limit) as Row[]).map(toRecord);
  if (q.tag) runs = runs.filter((r) => r.tags?.includes(q.tag!));
  if (q.night) runs = runs.filter((r) => r.nights?.includes(q.night!));
  const words = q.q?.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words?.length) runs = runs.filter((r) => words.every((w) => [r.id, r.name, r.group, r.command, ...(r.tags ?? [])].some((x) => x?.toLowerCase().includes(w))));
  return runs.slice(0, limit);
}

export function getRun(db: DB, id: string): RunRecord | null {
  tables(db);
  const r = db.prepare('select * from exp_runs where id = ?').get(id) as Row | undefined;
  return r ? toRecord(r) : null;
}

/** A run with its events (newest last). */
export function getRunWithEvents(db: DB, id: string): RunRecord | null {
  const r = getRun(db, id);
  return r ? { ...r, events: eventsOf(db, id) } : null;
}

/** Where the queue left off reading a run's log and metrics file. */
export function offsetsOf(db: DB, id: string): { log: number; file: number } {
  tables(db);
  const r = db.prepare('select log_offset, file_offset from exp_runs where id = ?').get(id) as { log_offset: number; file_offset: number } | undefined;
  return { log: r?.log_offset ?? 0, file: r?.file_offset ?? 0 };
}

const SPEC_KEYS: (keyof JobSpec)[] = [
  'name',
  'group',
  'command',
  'cwd',
  'where',
  'gpus',
  'gpuMemGb',
  'cpus',
  'memGb',
  'hours',
  'partition',
  'env',
  'params',
  'seed',
  'tags',
  'priority',
  'when',
  'metricsFile',
  'onCall',
  'notify',
  'sweep',
  'project',
  'better',
  'scoresFile',
  'report',
];

/** The job part of a record. */
export function specOf(r: Partial<RunRecord>): JobSpec {
  const out: Record<string, unknown> = {};
  for (const k of SPEC_KEYS) if (r[k] !== undefined) out[k] = r[k];
  return out as unknown as JobSpec;
}

export function insertRun(db: DB, r: { id: string; spec: JobSpec; status: RunStatus; why?: string; info?: RunInfo; createdAt?: number }) {
  tables(db);
  db.prepare('insert into exp_runs (id, status, why, name, grp, sweep, project, cwd, place, priority, created_at, spec, info) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    r.id,
    r.status,
    r.why ?? null,
    r.spec.name ?? null,
    r.spec.group ?? null,
    r.spec.sweep ?? null,
    r.spec.project ?? null,
    r.spec.cwd,
    r.spec.where ?? 'local',
    r.spec.priority ?? 0,
    r.createdAt ?? Date.now(),
    JSON.stringify(specOf(r.spec)),
    JSON.stringify(r.info ?? {}),
  );
}

/** Changes a run: its status and why (null clears it), times, what it recorded (merged), its metrics, the offsets. */
export function updateRun(
  db: DB,
  id: string,
  p: { status?: RunStatus; why?: string | null; startedAt?: number; endedAt?: number; info?: Partial<RunInfo>; metrics?: RunRecord['metrics']; logOffset?: number; fileOffset?: number; spec?: Partial<JobSpec> },
) {
  tables(db);
  const sets: string[] = [];
  const args: unknown[] = [];
  const set = (col: string, v: unknown) => {
    sets.push(`${col} = ?`);
    args.push(v);
  };
  if (p.status) set('status', p.status);
  if (p.why !== undefined) set('why', p.why);
  if (p.startedAt !== undefined) set('started_at', p.startedAt);
  if (p.endedAt !== undefined) set('ended_at', p.endedAt);
  if (p.metrics) set('metrics', JSON.stringify(p.metrics));
  if (p.logOffset !== undefined) set('log_offset', p.logOffset);
  if (p.fileOffset !== undefined) set('file_offset', p.fileOffset);
  if (p.info || p.spec) {
    const row = db.prepare('select info, spec from exp_runs where id = ?').get(id) as { info: string | null; spec: string } | undefined;
    if (!row) return;
    if (p.info) set('info', JSON.stringify({ ...parse<RunInfo>(row.info, {}), ...p.info }));
    if (p.spec) {
      const spec = { ...parse<JobSpec>(row.spec, { command: '', cwd: '' }), ...p.spec };
      set('spec', JSON.stringify(specOf(spec)));
      set('name', spec.name ?? null);
      set('grp', spec.group ?? null);
    }
  }
  if (!sets.length) return;
  db.prepare(`update exp_runs set ${sets.join(', ')} where id = ?`).run(...args, id);
}

/** Puts a run back to wait, to start again from the beginning: what its last start recorded goes (its events stay). */
export function resetRun(db: DB, id: string, why: string) {
  tables(db);
  const row = db.prepare('select info from exp_runs where id = ?').get(id) as { info: string | null } | undefined;
  if (!row) return;
  const { gpuIds: _g, outputAt: _o, stopping: _s, nightStop: _n, exitCode: _e, patchPath: _p, kept: _k, notKept: _nk, environment: _v, sealed: _se, scores: _sc, ...info } = parse<RunInfo>(row.info, {});
  db.transaction(() => {
    db.prepare("update exp_runs set status = 'waiting', why = ?, started_at = null, ended_at = null, metrics = null, log_offset = 0, file_offset = 0, info = ? where id = ?").run(why, JSON.stringify(info), id);
    db.prepare('delete from exp_series where run = ?').run(id);
  })();
}

/** Deletes a run's record, its events and series, and its own folder (never the job's files). */
export function deleteRun(db: DB, id: string) {
  tables(db);
  db.transaction(() => {
    db.prepare('delete from exp_runs where id = ?').run(id);
    db.prepare('delete from exp_events where run = ?').run(id);
    db.prepare('delete from exp_series where run = ?').run(id);
  })();
  if (!okId(id)) return;
  const dir = runFolder(id);
  // Only a folder of this app's own, under its experiments folder.
  if (path.dirname(dir) === RUNS_ROOT) fs.rmSync(dir, { recursive: true, force: true });
}

// ---- events ------------------------------------------------------------------------------------------------

export function addEvent(db: DB, run: string, e: Omit<RunEvent, 'at'> & { at?: number }): RunEvent {
  tables(db);
  const at = e.at ?? Date.now();
  db.prepare('insert into exp_events (run, at, kind, text, session) values (?, ?, ?, ?, ?)').run(run, at, e.kind, e.text.slice(0, 2000), e.session ?? null);
  return { at, kind: e.kind, text: e.text.slice(0, 2000), ...(e.session ? { session: e.session } : {}) };
}

export function eventsOf(db: DB, run: string, limit = 200): RunEvent[] {
  tables(db);
  const rows = db.prepare('select at, kind, text, session from exp_events where run = ? order by id desc limit ?').all(run, limit) as { at: number; kind: RunEvent['kind']; text: string; session: string | null }[];
  return rows.reverse().map((r) => ({ at: r.at, kind: r.kind, text: r.text, ...(r.session ? { session: r.session } : {}) }));
}

/** Events of a kind since a moment, across runs (how many agents went on call in the last hour). */
export function eventsSince(db: DB, kind: RunEvent['kind'], since: number): (RunEvent & { run: string })[] {
  tables(db);
  return (db.prepare('select run, at, kind, text, session from exp_events where kind = ? and at >= ? order by id').all(kind, since) as { run: string; at: number; kind: RunEvent['kind']; text: string; session: string | null }[]).map((r) => ({
    run: r.run,
    at: r.at,
    kind: r.kind,
    text: r.text,
    ...(r.session ? { session: r.session } : {}),
  }));
}

// ---- metrics' series ---------------------------------------------------------------------------------------

/** Writes a run's series; the rows of metrics no longer in it (given up for others) go. */
export function saveSeries(db: DB, run: string, series: MetricSeries) {
  tables(db);
  const put = db.prepare('insert into exp_series (run, metric, points) values (?, ?, ?) on conflict(run, metric) do update set points = excluded.points');
  const drop = db.prepare('delete from exp_series where run = ? and metric = ?');
  db.transaction(() => {
    for (const [k, pts] of Object.entries(series)) put.run(run, k, JSON.stringify(pts));
    for (const r of db.prepare('select metric from exp_series where run = ?').all(run) as { metric: string }[]) if (!(r.metric in series)) drop.run(run, r.metric);
  })();
}

export function seriesOf(db: DB, run: string): MetricSeries {
  tables(db);
  const out: MetricSeries = {};
  for (const r of db.prepare('select metric, points from exp_series where run = ?').all(run) as { metric: string; points: string }[]) out[r.metric] = parse(r.points, []);
  return out;
}

// ---- results tables --------------------------------------------------------------------------------------------

/** A results table as it was made. */
export function getTable(db: DB, id: string): ResultsTable | null {
  tables(db);
  const r = db.prepare('select data from exp_tables where id = ?').get(id) as { data: string } | undefined;
  return r ? parse<ResultsTable | null>(r.data, null) : null;
}

export function saveTable(db: DB, t: ResultsTable) {
  tables(db);
  db.prepare('insert into exp_tables (id, spec, data, made_at) values (?, ?, ?, ?) on conflict(id) do update set spec = excluded.spec, data = excluded.data, made_at = excluded.made_at').run(t.id, JSON.stringify(t.spec), JSON.stringify(t), t.madeAt);
}

export function listTables(db: DB, limit = 100): ResultsTable[] {
  tables(db);
  return (db.prepare('select data from exp_tables order by made_at desc limit ?').all(limit) as { data: string }[]).map((r) => parse<ResultsTable | null>(r.data, null)).filter((t): t is ResultsTable => !!t);
}

export function deleteTable(db: DB, id: string) {
  tables(db);
  db.prepare('delete from exp_tables where id = ?').run(id);
}

/** The runs a table's spec names: its runs by id (those still kept), or every finished run of its group. */
export function runsOfSpec(db: DB, spec: ResultsTableSpec): RunRecord[] {
  if (spec.runs?.length) return spec.runs.map((id) => getRun(db, id)).filter((r): r is RunRecord => !!r);
  // A final test's numbers come into a table only when its run is named.
  if (spec.group) return listRuns(db, { group: spec.group, status: ['done'], limit: 2000, oldest: true }).filter((r) => !isFinalRun(r));
  return [];
}

/** Makes a table from its spec and the runs as they are now (kept under `id` when given, else a new one: not saved). */
export function workOut(db: DB, spec: ResultsTableSpec, id = newId('t')): ResultsTable {
  return makeTable(spec, runsOfSpec(db, spec), { id, scores: readScores });
}

/** The same table worked out again from its runs as they are now (null when it is gone). */
export function recomputeTable(db: DB, id: string): ResultsTable | null {
  const t = getTable(db, id);
  return t ? workOut(db, t.spec, id) : null;
}

// ---- sweeps ------------------------------------------------------------------------------------------------

export function saveSweep(db: DB, s: SweepSpec) {
  tables(db);
  db.prepare('insert or replace into exp_sweeps (id, grp, spec, created_at) values (?, ?, ?, ?)').run(s.id, s.group, JSON.stringify(s), s.createdAt);
}

export function getSweep(db: DB, id: string): SweepSpec | null {
  tables(db);
  const r = db.prepare('select spec from exp_sweeps where id = ?').get(id) as { spec: string } | undefined;
  return r ? parse<SweepSpec | null>(r.spec, null) : null;
}

export function listSweeps(db: DB, limit = 50): SweepSpec[] {
  tables(db);
  return (db.prepare('select spec from exp_sweeps order by created_at desc limit ?').all(limit) as { spec: string }[]).map((r) => parse<SweepSpec | null>(r.spec, null)).filter((s): s is SweepSpec => !!s);
}

// ---- app steps waiting for runs ------------------------------------------------------------------------------

/** When a wait by this key began (now, the first time): a step that runs again after a restart waits out the rest. */
export function waitStarted(db: DB, key: string): number {
  tables(db);
  db.prepare('insert or ignore into exp_waits (key, started_at) values (?, ?)').run(key, Date.now());
  return (db.prepare('select started_at from exp_waits where key = ?').get(key) as { started_at: number }).started_at;
}

export function waitDone(db: DB, key: string) {
  tables(db);
  db.prepare('delete from exp_waits where key = ?').run(key);
}

// ---- what an experiment is: its title, description and category ---------------------------------------------------

/** The longest each part of an experiment's info may be, in characters. */
export const INFO_MAX = { title: 80, description: 500, category: 40 } as const;

/** An experiment's info as kept: also how many runs it had when the helper wrote it (what growth is measured from). */
export interface StoredInfo extends ExperimentInfo {
  runs: number;
}

interface InfoRow {
  name: string;
  title: string | null;
  description: string | null;
  category: string | null;
  by: string | null;
  runs: number | null;
  at: number | null;
}

const toInfo = (r: InfoRow): StoredInfo => ({
  name: r.name,
  ...(r.title ? { title: r.title } : {}),
  ...(r.description ? { description: r.description } : {}),
  ...(r.category ? { category: r.category } : {}),
  ...(r.by === 'helper' || r.by === 'agent' || r.by === 'user' ? { by: r.by } : {}),
  ...(r.at ? { at: r.at } : {}),
  runs: r.runs ?? 0,
});

/** Text for one of the three fields: tidy (quotes and markdown marks around it gone, spaces and a one-line title and category) and cut to its limit. */
export function cleanInfoField(field: keyof typeof INFO_MAX, v: unknown): string {
  let t = typeof v === 'string' ? v.replace(/\r/g, '') : '';
  t = field === 'description' ? t.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n') : t.replace(/\s+/g, ' ');
  t = t.trim().replace(/^["“”'`*_#\s]+|["“”'`*_\s]+$/g, '').trim();
  return t.slice(0, INFO_MAX[field]).trim();
}

/** What is kept of an experiment (its group's name), or null when nothing is. */
export function getInfo(db: DB, name: string): StoredInfo | null {
  tables(db);
  const r = db.prepare('select * from exp_groups where name = ?').get(name) as InfoRow | undefined;
  return r ? toInfo(r) : null;
}

/** Every experiment that has info, by name. */
export function listInfo(db: DB): Map<string, StoredInfo> {
  tables(db);
  return new Map((db.prepare('select * from exp_groups').all() as InfoRow[]).map((r) => [r.name, toInfo(r)]));
}

/**
 * Keeps what `by` wrote of an experiment: the fields given replace the old ones ('' clears one, undefined leaves it);
 * `runs` is how many runs it has now when the helper wrote it. The info as kept.
 */
export function saveInfo(db: DB, name: string, p: { title?: string; description?: string; category?: string }, by: 'helper' | 'agent' | 'user', o: { runs?: number; at?: number } = {}): StoredInfo {
  tables(db);
  const old = getInfo(db, name);
  const pick = (k: keyof typeof INFO_MAX) => (p[k] === undefined ? old?.[k] ?? null : cleanInfoField(k, p[k]) || null);
  // A person who cleared all three: nothing is kept (an empty row would keep the helper from writing them again).
  if (by === 'user' && !pick('title') && !pick('description') && !pick('category')) {
    deleteInfo(db, name);
    return { name, runs: old?.runs ?? 0 };
  }
  db.prepare(
    'insert into exp_groups (name, title, description, category, by, runs, at) values (?, ?, ?, ?, ?, ?, ?) on conflict(name) do update set title = excluded.title, description = excluded.description, category = excluded.category, by = excluded.by, runs = excluded.runs, at = excluded.at',
  ).run(name, pick('title'), pick('description'), pick('category'), by, o.runs ?? old?.runs ?? 0, o.at ?? Date.now());
  return getInfo(db, name)!;
}

/** Forgets what is kept of an experiment (its group's name). */
export function deleteInfo(db: DB, name: string) {
  tables(db);
  db.prepare('delete from exp_groups where name = ?').run(name);
}

/** The categories experiments have, the most used first. */
export function categoriesInUse(db: DB): string[] {
  const n = new Map<string, number>();
  for (const i of listInfo(db).values()) if (i.category) n.set(i.category, (n.get(i.category) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}
