// The records of experiments' runs and the results tables made from them, as the rest of the app reads them (the
// pre-submission check traces a paper's numbers to them; apps' steps list them), and as the queue keeps them. A run
// is a row: its job (the spec as given, JSON), its status and why, and what it recorded (commit, patch, environment,
// GPUs, exit code…, JSON); its events, its metrics' series, the tables, the sweeps and the waits of app steps each
// have a table of their own. The tables are made on first use, so any part of the app can read with just the db.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { attemptsOf, standingsOf } from '../../shared/experiment-attempts.ts';
import { isTrialRun, type ExperimentInfo, type JobSpec, type MetricSeries, type ResultsTable, type ResultsTableSpec, type RunEvent, type RunFiles, type RunRecord, type RunStatus, type SweepSpec } from '../../shared/experiments.ts';
import { config } from '../config.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
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
  /** Leave out the runs that score an evaluation, and trials (what lists experiments does). */
  plain?: boolean;
}

export { isTrialRun };

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
    create table if not exists exp_archived (name text primary key, at integer not null);
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
  if (q.plain) where.push(`not (instr(spec, '"HYDOR_EVALUATION":') > 0 and instr(spec, '"evaluation"') > 0)`, `not (instr(spec, '"HYDOR_TRY":') > 0 and instr(spec, '"try"') > 0)`);
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
  'alone',
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
  'seedTemplate',
  'resume',
  'grace',
  'code',
];

/** The folder a run really runs in: its copy of the code as queued when it runs from one. */
export const ranIn = (r: Pick<RunRecord, 'cwd' | 'codeDir'>) => r.codeDir ?? r.cwd;

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

/**
 * Puts a run back to wait for another start: what its last start recorded goes (its events stay). `carry`: it goes on
 * from its checkpoint, so its curves and numbers so far stay, and its metrics file is read on from where it was.
 */
export function resetRun(db: DB, id: string, why: string, o: { carry?: boolean } = {}) {
  tables(db);
  const row = db.prepare('select info, metrics from exp_runs where id = ?').get(id) as { info: string | null; metrics: string | null } | undefined;
  if (!row) return;
  const was = parse<RunInfo>(row.info, {});
  const { gpuIds: _g, shared: _sh, startsAbout: _sa, waitingSince: _w, outputAt: _o, stopping: _s, nightStop: _n, exitCode: _e, patchPath, kept, notKept, codeAt: _ca, codeChanged: _cc, codeDir: _cd, codeRemoved: _cr, codeView: _cv, leftInCopy: _lc, ranAs: _ra, environment: _v, sealed: _se, scores: _sc, peak: _pk, gpuTotalGb: _gt, others: _ot, memoryLimitGb: _ml, memoryLow: _mw, firstError: _fe, tried: _tr, hardStopAt: _h, carriesOn: _c, ranResume: _rr, ...rest } = was;
  // The code kept when it was queued stays: it starts from that again.
  const info: RunInfo = { ...(was.queuedCode ? { ...rest, patchPath, kept, notKept } : rest), ...(o.carry ? { carriesOn: true } : {}) };
  const metrics = o.carry ? parse<RunRecord['metrics'] | null>(row.metrics, null) : null;
  // How far the last start had got says nothing of this one.
  if (metrics) delete metrics.progress;
  db.transaction(() => {
    db.prepare(`update exp_runs set status = 'waiting', why = ?, started_at = null, ended_at = null, metrics = ?, log_offset = 0${o.carry ? '' : ', file_offset = 0'}, info = ? where id = ?`).run(why, metrics ? JSON.stringify(metrics) : null, JSON.stringify(info), id);
    if (!o.carry) db.prepare('delete from exp_series where run = ?').run(id);
  })();
}

// ---- chains of attempts, and what was put aside ---------------------------------------------------------------

/** Every run kept here of the experiments of these runs (and, when one has none, those without), with its place in its chain. */
function chainsFor(db: DB, runs: Pick<RunRecord, 'group'>[]): RunRecord[] {
  tables(db);
  const groups = [...new Set(runs.map((r) => r.group).filter((g): g is string => !!g))];
  const none = runs.some((r) => !r.group);
  const where = [...(groups.length ? [`grp in (${groups.map(() => '?').join(', ')})`] : []), ...(none ? ['grp is null'] : [])];
  if (!where.length) return [];
  const all = (db.prepare(`select id, status, why, cwd, created_at, started_at, ended_at, spec, info from exp_runs where ${where.join(' or ')}`).all(...groups) as Row[]).map(toRecord);
  return marked(all);
}

/** These runs with their chains' marks worked out among themselves (all the runs of their experiments, kept here). */
export function marked(all: RunRecord[]): RunRecord[] {
  const at = attemptsOf(all);
  return all.map((r) => (at.has(r.id) ? { ...r, ...at.get(r.id) } : r));
}

/** The runs given (kept here) with their chains' marks: which one each is another attempt at, and which took its place. */
export function withAttempts(db: DB, runs: RunRecord[]): RunRecord[] {
  const at = new Map(chainsFor(db, runs).map((r) => [r.id, r]));
  return runs.map((r) => {
    const m = at.get(r.id);
    return m?.retryOf || m?.replacedBy ? { ...r, ...(m.retryOf ? { retryOf: m.retryOf } : {}), ...(m.replacedBy ? { replacedBy: m.replacedBy } : {}), ...(m.attempt ? { attempt: m.attempt } : {}) } : r;
  });
}

/** The experiments archived, by name, and when: those no run was added to since. */
export function archivedGroups(db: DB): Map<string, number> {
  tables(db);
  const rows = db.prepare('select name, at from exp_archived a where not exists (select 1 from exp_runs r where r.grp = a.name and r.created_at > a.at)').all() as { name: string; at: number }[];
  return new Map(rows.map((r) => [r.name, r.at]));
}

export function setGroupArchived(db: DB, name: string, on: boolean) {
  tables(db);
  if (on) db.prepare('insert into exp_archived (name, at) values (?, ?) on conflict(name) do update set at = excluded.at').run(name, Date.now());
  else db.prepare('delete from exp_archived where name = ?').run(name);
}

/** Every run put aside (itself, an earlier attempt of an archived one, or of an archived experiment): what lists and counts shown to a person leave out. */
export function awayIds(db: DB): Set<string> {
  tables(db);
  const marked = db.prepare(`select grp from exp_runs where instr(info, '"archivedAt":') > 0`).all() as { grp: string | null }[];
  const gone = [...archivedGroups(db).keys()];
  const out = new Set<string>();
  if (marked.length) for (const r of standingsOf(chainsFor(db, marked.map((r) => ({ group: r.grp ?? undefined })))).archived) out.add(r.id);
  if (gone.length) for (const r of db.prepare(`select id from exp_runs where grp in (${gone.map(() => '?').join(', ')})`).all(...gone) as { id: string }[]) out.add(r.id);
  return out;
}

/**
 * Of these runs, the failed ones (and those lost that the app started again itself) whose place a later attempt took
 * that finished: nothing is left to look at.
 */
export function madeGood(db: DB, runs: RunRecord[]): Set<string> {
  const failed = runs.filter((r) => r.status === 'failed' || (r.status === 'lost' && r.restartedAs));
  const all = new Map(chainsFor(db, failed).map((r) => [r.id, r]));
  const out = new Set<string>();
  for (const f of failed) {
    let r = all.get(f.id);
    // A chain only goes forward in time, so this ends.
    while (r?.replacedBy) r = all.get(r.replacedBy);
    if (r && r.id !== f.id && r.status === 'done') out.add(f.id);
  }
  return out;
}

/** Which of these runs were put aside: archived themselves, or an earlier attempt of one that is; with `groups`, those of an archived experiment too. */
export function putAway(db: DB, runs: RunRecord[], groups = false): Set<string> {
  const out = new Set(standingsOf(chainsFor(db, runs)).archived.map((r) => r.id));
  if (groups) {
    const gone = archivedGroups(db);
    for (const r of runs) if (r.group && gone.has(r.group)) out.add(r.id);
  }
  return out;
}

/** A run's note, star and archiving: what is given changes ('' clears the note), the rest stays. */
export function markRun(db: DB, id: string, p: { note?: string; by?: 'user' | 'agent'; starred?: boolean; archived?: boolean }) {
  const r = getRun(db, id);
  if (!r) return;
  const info: Partial<RunInfo> = {};
  if (p.note !== undefined) Object.assign(info, { note: p.note || undefined, noteBy: p.note ? (p.by ?? 'user') : undefined });
  if (p.starred !== undefined) info.starredAt = p.starred ? (r.starredAt ?? Date.now()) : undefined;
  if (p.archived !== undefined) info.archivedAt = p.archived ? (r.archivedAt ?? Date.now()) : undefined;
  if (Object.keys(info).length) updateRun(db, id, { info });
}

// ---- what a run wrote into its own folder --------------------------------------------------------------------

/** What the app itself writes into a run's folder (its log, command, patch, exit code, process id, metrics, kept copies, copies of its code): part of its record. */
const OWN_FILES = /^(log\.txt|log-before-\d+\.txt|command\.sh|run\.sh|changes\.patch|exit|exit\.tmp|pid|metrics\.json|untracked|code-before-\d+|code-files|code\.json|code-laid\.json|code-left\.json|code-making|code-used|code-view-making|code-view-used)$/;

/** Whether a name in a run's folder is the app's own: code/ and code-view/ only when the app made them (a run may write one itself). */
const ownFile = (dir: string, name: string) => OWN_FILES.test(name) || ((name === 'code' || name === 'code-view') && [`${name}-used`, `${name}-making`].some((f) => fs.existsSync(path.join(dir, f))));

/**
 * What stayed in the run's copies of its code (code-left.json): the run wrote it, so it counts among its files. Only
 * paths in a copy, with no link on the way.
 */
function leftInCopies(dir: string): string[] {
  let list: unknown;
  try {
    list = JSON.parse(fs.readFileSync(path.join(dir, 'code-left.json'), 'utf8'));
  } catch {
    return [];
  }
  return (Array.isArray(list) ? list : []).filter((p): p is string => {
    if (typeof p !== 'string' || !/^code(-before-\d+)?\//.test(p) || p.split('/').includes('..')) return false;
    return p.split('/').every((_, i, parts) => !fs.lstatSync(path.join(dir, ...parts.slice(0, i + 1)), { throwIfNoEntry: false })?.isSymbolicLink());
  });
}

/** Where the files kept of deleted runs go: kept-runs/<run id>/, beside the experiments folder. */
export const KEPT_ROOT = path.join(config.dataDir, 'kept-runs');

/** The files these runs' own folders hold besides the app's own: how many, their size, and the largest three. */
export async function runFiles(ids: string[]): Promise<RunFiles> {
  let count = 0;
  let bytes = 0;
  let largest: { name: string; size: number }[] = [];
  const walk = async (dir: string, under: string) => {
    const list = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of list) {
      if (!under && ownFile(dir, e.name)) continue;
      const name = under ? `${under}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(path.join(dir, e.name), name);
      else if (e.isFile()) {
        const size = (await fs.promises.stat(path.join(dir, e.name)).catch(() => null))?.size ?? 0;
        count++;
        bytes += size;
        largest = [...largest, { name, size }].sort((a, b) => b.size - a.size || a.name.localeCompare(b.name)).slice(0, 3);
      }
    }
  };
  for (const id of ids) {
    if (!okId(id)) continue;
    const dir = runFolder(id);
    await walk(dir, '');
    for (const name of leftInCopies(dir)) {
      const st = await fs.promises.lstat(path.join(dir, name)).catch(() => null);
      if (st?.isDirectory()) await walk(path.join(dir, name), name);
      else if (st?.isFile()) {
        count++;
        bytes += st.size;
        largest = [...largest, { name, size: st.size }].sort((a, b) => b.size - a.size || a.name.localeCompare(b.name)).slice(0, 3);
      }
    }
  }
  return { count, bytes, names: largest.map((f) => f.name) };
}

/**
 * Moves what these runs wrote into their own folders to kept-runs/<run id>/, before they are deleted. Where they
 * went (one run's folder there, or kept-runs for several), or undefined when there was nothing to keep.
 */
export function keepRunFiles(ids: string[]): string | undefined {
  const moved: string[] = [];
  for (const id of ids) {
    if (!okId(id)) continue;
    const from = runFolder(id);
    let names: string[];
    try {
      names = fs.readdirSync(from).filter((n) => !ownFile(from, n));
    } catch {
      continue;
    }
    names.push(...leftInCopies(from));
    if (!names.length) continue;
    const to = path.join(KEPT_ROOT, id);
    fs.mkdirSync(to, { recursive: true, mode: 0o700 });
    for (const n of names) {
      fs.mkdirSync(path.dirname(path.join(to, n)), { recursive: true, mode: 0o700 });
      try {
        fs.renameSync(path.join(from, n), path.join(to, n));
      } catch (e) {
        // A folder of it on another disk (a mount): copied, then removed.
        if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e;
        fs.cpSync(path.join(from, n), path.join(to, n), { recursive: true, verbatimSymlinks: true });
        fs.rmSync(path.join(from, n), { recursive: true, force: true });
      }
    }
    moved.push(to);
  }
  return moved.length > 1 ? KEPT_ROOT : moved[0];
}

// ---- GPU hours of records deleted since --------------------------------------------------------------------------

/** What a deleted run had used, so the limits on agents' GPU hours still count it (budget.ts). */
export interface Spent {
  by: NonNullable<RunRecord['startedBy']>;
  /** It ran on this computer. */
  here: boolean;
  gpus: number;
  startedAt?: number;
  endedAt: number;
  earlierSpans?: [number, number][];
}

const SPENT = 'experiments_spent';
const SPENT_KEPT_MS = 32 * 86_400_000;

export const spentKept = (db: DB): Spent[] => parse<Spent[]>(kvGet(db, SPENT), []);

function keepSpent(db: DB, r: RunRecord) {
  const gpus = r.gpuIds?.length || r.gpus || 0;
  if (!r.startedBy || r.startedBy.page || !gpus || (!r.startedAt && !r.earlierSpans)) return;
  const old = Date.now() - SPENT_KEPT_MS;
  const entry: Spent = { by: r.startedBy, here: !r.remote && (r.where ?? 'local') === 'local', gpus, ...(r.startedAt ? { startedAt: r.startedAt } : {}), endedAt: r.endedAt ?? Date.now(), ...(r.earlierSpans ? { earlierSpans: r.earlierSpans } : {}) };
  kvSet(db, SPENT, JSON.stringify([...spentKept(db).filter((s) => s.endedAt >= old), entry].slice(-2000)));
}

/** Runs that ran at some time since `from`: still going, ended after it, or with an earlier start of their own. */
export function runsSince(db: DB, from: number): RunRecord[] {
  tables(db);
  return (db.prepare(`select * from exp_runs where (started_at is not null and (ended_at is null or ended_at >= ?)) or instr(info, '"earlierSpans":') > 0`).all(from) as Row[]).map(toRecord);
}

/** The runs a session started (or an evolution of its did). */
export function runsOfStarter(db: DB, session: string): RunRecord[] {
  tables(db);
  return (db.prepare('select * from exp_runs where instr(info, ?) > 0').all(JSON.stringify(session)) as Row[]).map(toRecord);
}

/** Deletes a run's record, its events and series, and its own folder with what is in it (never the job's files elsewhere). */
export function deleteRun(db: DB, id: string) {
  tables(db);
  const gone = getRun(db, id);
  // What it used still counts toward the limits on agents' GPU hours.
  if (gone) keepSpent(db, gone);
  // An attempt in the middle of a chain goes: the ones started from it follow the one before it, so the chain holds.
  const before = gone ? withAttempts(db, [gone])[0].retryOf : undefined;
  if (before) for (const next of db.prepare("select id from exp_runs where json_extract(info, '$.from') = ?").all(id) as { id: string }[]) updateRun(db, next.id, { info: { from: before } });
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

/**
 * What a run used over time (usage.ts) is kept beside its metrics' series, each name behind a character no metric
 * read from output has, so a run's own "system/…" never meets them.
 */
const SYSTEM = '\u0001';

export function saveSystem(db: DB, run: string, series: MetricSeries) {
  tables(db);
  const put = db.prepare('insert into exp_series (run, metric, points) values (?, ?, ?) on conflict(run, metric) do update set points = excluded.points');
  db.transaction(() => {
    for (const [k, pts] of Object.entries(series)) put.run(run, SYSTEM + k, JSON.stringify(pts));
  })();
}

export function systemSeriesOf(db: DB, run: string): MetricSeries {
  tables(db);
  const out: MetricSeries = {};
  for (const r of db.prepare('select metric, points from exp_series where run = ? and substr(metric, 1, 1) = ?').all(run, SYSTEM) as { metric: string; points: string }[]) out[r.metric.slice(1)] = parse(r.points, []);
  return out;
}

/** Writes a run's series; the rows of metrics no longer in it (given up for others) go. */
export function saveSeries(db: DB, run: string, series: MetricSeries) {
  tables(db);
  const put = db.prepare('insert into exp_series (run, metric, points) values (?, ?, ?) on conflict(run, metric) do update set points = excluded.points');
  const drop = db.prepare('delete from exp_series where run = ? and metric = ?');
  db.transaction(() => {
    for (const [k, pts] of Object.entries(series)) put.run(run, k, JSON.stringify(pts));
    for (const r of db.prepare('select metric from exp_series where run = ?').all(run) as { metric: string }[]) if (!(r.metric in series) && !r.metric.startsWith(SYSTEM)) drop.run(run, r.metric);
  })();
}

export function seriesOf(db: DB, run: string): MetricSeries {
  tables(db);
  const out: MetricSeries = {};
  for (const r of db.prepare('select metric, points from exp_series where run = ?').all(run) as { metric: string; points: string }[]) if (!r.metric.startsWith(SYSTEM)) out[r.metric] = parse(r.points, []);
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

/**
 * The runs a table's spec names: its runs by id (those still kept), or every finished run of its group but those
 * archived. `had`: the runs the table counted before, which stay in it when they are archived later.
 */
export function runsOfSpec(db: DB, spec: ResultsTableSpec, had?: Set<string>): RunRecord[] {
  if (spec.runs?.length) return spec.runs.map((id) => getRun(db, id)).filter((r): r is RunRecord => !!r);
  // A final test's numbers come into a table only when its run is named.
  if (!spec.group) return [];
  const all = listRuns(db, { group: spec.group, status: ['done'], limit: 2000, oldest: true }).filter((r) => !isFinalRun(r));
  const away = putAway(db, all);
  return all.filter((r) => !away.has(r.id) || had?.has(r.id));
}

/** The runs of a group's table that did not finish, which it leaves out (none when the runs were named one by one). */
function unfinishedOfSpec(db: DB, spec: ResultsTableSpec): RunRecord[] {
  if (spec.runs?.length || !spec.group) return [];
  const all = listRuns(db, { group: spec.group, status: ['stopped', 'failed', 'lost'], limit: 2000, oldest: true }).filter((r) => !isFinalRun(r));
  const away = putAway(db, all);
  return all.filter((r) => !away.has(r.id));
}

/** Makes a table from its spec and the runs as they are now (kept under `id` when given, else a new one: not saved). */
export function workOut(db: DB, spec: ResultsTableSpec, id = newId('t'), had?: Set<string>): ResultsTable {
  return makeTable(spec, runsOfSpec(db, spec, had), { id, scores: readScores, unfinished: unfinishedOfSpec(db, spec) });
}

/** The same table worked out again from its runs as they are now (null when it is gone). */
export function recomputeTable(db: DB, id: string): ResultsTable | null {
  const t = getTable(db, id);
  return t ? workOut(db, t.spec, id, new Set(t.rows.flatMap((r) => r.runs))) : null;
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
