// Where apps keep things: the apps themselves, every run (with the recipe it followed, so a template
// or an app changed mid-run still checks the answer it started with), the steps of runs with steps,
// API keys (hashed) and runs over the rows of a CSV. What apps keep for themselves is in data.ts.
import crypto from 'node:crypto';
import type { AppBatch, AppDef, AppRecipe, AppRun, PublicSettings, RunSource, RunStatus, StepStatus } from '../../shared/apps.ts';
import type { CheckResult } from '../../shared/app-manifest.ts';
import { cleanPublic, cleanRecipe, DEFAULT_PUBLIC, RESERVED_SLUGS, slugify } from '../../shared/apps.ts';
import type { DB } from '../db.ts';

export const newId = (n = 8) => crypto.randomBytes(n).toString('hex');

export function ensureTables(db: DB) {
  db.exec(`
    create table if not exists apps (
      id text primary key,
      slug text not null unique,
      data text not null,
      created_at integer not null,
      updated_at integer not null
    );
    create table if not exists app_runs (
      id text primary key,
      app_id text not null,
      app_name text not null,
      recipe text not null,
      key text,
      source text not null,
      status text not null,
      inputs text not null,
      result text,
      reply text,
      error text,
      cost_usd real,
      visitor text,
      ip text,
      batch_id text,
      row_no integer,
      nudged integer not null default 0,
      created_at integer not null,
      started_at integer,
      ended_at integer
    );
    create index if not exists app_runs_app on app_runs (app_id, created_at desc);
    create index if not exists app_runs_key on app_runs (key);
    create index if not exists app_runs_batch on app_runs (batch_id, row_no);
    create index if not exists app_runs_status on app_runs (status);
    create table if not exists app_keys (
      id text primary key,
      app_id text not null,
      name text not null,
      hash text not null unique,
      hint text not null,
      created_at integer not null,
      last_used integer
    );
    create table if not exists app_batches (
      id text primary key,
      app_id text not null,
      name text,
      concurrency integer not null,
      status text not null,
      total integer not null,
      created_at integer not null,
      ended_at integer
    );
    create table if not exists app_steps (
      run_id text not null,
      path text not null,
      step_id text not null,
      kind text not null,
      title text not null,
      status text not null,
      outputs text,
      child_run text,
      cost_usd real,
      error text,
      started_at integer,
      ended_at integer,
      primary key (run_id, path)
    );
  `);
  // Runs that are a step of another (an agent step, an app a step called).
  const cols = new Set((db.prepare('pragma table_info(app_runs)').all() as { name: string }[]).map((c) => c.name));
  if (!cols.has('parent')) db.exec('alter table app_runs add column parent text');
  if (!cols.has('step')) db.exec('alter table app_runs add column step text');
  // Which of its flows a run ran, when not the main one.
  if (!cols.has('flow')) db.exec('alter table app_runs add column flow text');
  // The example a run tried, and how its checks went.
  if (!cols.has('example')) db.exec('alter table app_runs add column example text');
  if (!cols.has('checks')) db.exec('alter table app_runs add column checks text');
  db.exec('create index if not exists app_runs_parent on app_runs (parent)');
  // Steps a run took over from an earlier one (Run again from here).
  const stepCols = new Set((db.prepare('pragma table_info(app_steps)').all() as { name: string }[]).map((c) => c.name));
  if (!stepCols.has('reused')) db.exec('alter table app_steps add column reused integer not null default 0');
}

// ---- apps --------------------------------------------------------------------------------------------

interface AppRow {
  id: string;
  slug: string;
  data: string;
  created_at: number;
  updated_at: number;
}

function toApp(r: AppRow): AppDef {
  const d = JSON.parse(r.data);
  return { ...cleanRecipe(d), id: r.id, slug: r.slug, mcp: d.mcp !== false, public: cleanPublic(d.public, DEFAULT_PUBLIC), template: d.template || undefined, createdAt: r.created_at, updatedAt: r.updated_at };
}

export function listApps(db: DB): AppDef[] {
  return (db.prepare('select * from apps order by updated_at desc').all() as AppRow[]).map(toApp);
}

export function getApp(db: DB, idOrSlug: string): AppDef | null {
  const r = db.prepare('select * from apps where id = ? or slug = ?').get(idOrSlug, idOrSlug) as AppRow | undefined;
  return r ? toApp(r) : null;
}

/** A free address for an app named `name` (its own counts as free). */
function freeSlug(db: DB, want: string, own?: string): string {
  const base = slugify(want);
  for (let n = 1; ; n++) {
    const s = n === 1 ? base : `${base}-${n}`;
    if (RESERVED_SLUGS.has(s)) continue;
    const r = db.prepare('select id from apps where slug = ?').get(s) as { id: string } | undefined;
    if (!r || r.id === own) return s;
  }
}

export function saveApp(db: DB, input: { id?: string; slug?: string; recipe: AppRecipe; mcp?: boolean; public?: Partial<PublicSettings>; template?: string }): AppDef {
  const now = Date.now();
  const prev = input.id ? getApp(db, input.id) : null;
  const id = prev?.id ?? newId(6);
  const slug = freeSlug(db, input.slug || prev?.slug || input.recipe.name, id);
  const data = {
    ...cleanRecipe(input.recipe),
    mcp: input.mcp ?? prev?.mcp ?? true,
    public: cleanPublic(input.public ?? {}, prev?.public ?? DEFAULT_PUBLIC),
    template: input.template ?? prev?.template,
  };
  if (prev) db.prepare('update apps set slug = ?, data = ?, updated_at = ? where id = ?').run(slug, JSON.stringify(data), now, id);
  else db.prepare('insert into apps (id, slug, data, created_at, updated_at) values (?, ?, ?, ?, ?)').run(id, slug, JSON.stringify(data), now, now);
  return getApp(db, id)!;
}

export function deleteApp(db: DB, id: string) {
  db.prepare('delete from apps where id = ?').run(id);
  db.prepare('delete from app_keys where app_id = ?').run(id);
}

// ---- runs --------------------------------------------------------------------------------------------

interface RunRow {
  id: string;
  app_id: string;
  app_name: string;
  recipe: string;
  key: string | null;
  source: string;
  status: string;
  inputs: string;
  result: string | null;
  reply: string | null;
  error: string | null;
  cost_usd: number | null;
  visitor: string | null;
  ip: string | null;
  batch_id: string | null;
  row_no: number | null;
  parent: string | null;
  step: string | null;
  flow: string | null;
  example: string | null;
  checks: string | null;
  nudged: number;
  created_at: number;
  started_at: number | null;
  ended_at: number | null;
}

/** A run as the server keeps it: the public view plus what only the server needs. */
export interface RunRecord extends AppRun {
  recipe: AppRecipe;
  visitor?: string;
  ip?: string;
  nudged: boolean;
}

const parse = <T>(s: string | null, d: T): T => {
  if (!s) return d;
  try {
    return JSON.parse(s) as T;
  } catch {
    return d;
  }
};

function toRun(r: RunRow): RunRecord {
  const recipe = cleanRecipe(parse(r.recipe, {}));
  return {
    id: r.id,
    app: r.app_id,
    appName: r.app_name,
    recipe,
    key: r.key ?? undefined,
    source: r.source as RunSource,
    status: r.status as RunStatus,
    inputs: parse(r.inputs, {}),
    result: r.result ? parse(r.result, null) : undefined,
    reply: r.reply ?? undefined,
    error: r.error ?? undefined,
    costUsd: r.cost_usd ?? undefined,
    agent: recipe.agent,
    model: recipe.model,
    visitor: r.visitor ?? undefined,
    ip: r.ip ?? undefined,
    batch: r.batch_id ?? undefined,
    row: r.row_no ?? undefined,
    parent: r.parent ?? undefined,
    step: r.step ?? undefined,
    flow: r.flow ?? undefined,
    example: r.example ?? undefined,
    checks: r.checks ? parse<CheckResult[]>(r.checks, []) : undefined,
    nudged: !!r.nudged,
    createdAt: r.created_at,
    startedAt: r.started_at ?? undefined,
    endedAt: r.ended_at ?? undefined,
  };
}

/** What the pages see of a run (no recipe, no visitor). */
export function runView(r: RunRecord): AppRun {
  const { recipe: _r, visitor: _v, ip: _i, nudged: _n, ...view } = r;
  return view;
}

export function insertRun(db: DB, r: { app: string; appName: string; recipe: AppRecipe; source: RunSource; inputs: Record<string, string>; status?: RunStatus; visitor?: string; ip?: string; batch?: string; row?: number; parent?: string; step?: string; flow?: string; example?: string }): RunRecord {
  const id = newId(8);
  db.prepare(
    `insert into app_runs (id, app_id, app_name, recipe, source, status, inputs, visitor, ip, batch_id, row_no, parent, step, flow, example, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, r.app, r.appName, JSON.stringify(r.recipe), r.source, r.status ?? 'starting', JSON.stringify(r.inputs), r.visitor ?? null, r.ip ?? null, r.batch ?? null, r.row ?? null, r.parent ?? null, r.step ?? null, r.flow ?? null, r.example ?? null, Date.now());
  return getRun(db, id)!;
}

/** Each example's latest run, of a template (by the example's id). */
export function lastExampleRuns(db: DB, app: string): Map<string, RunRecord> {
  const out = new Map<string, RunRecord>();
  for (const r of db.prepare('select * from app_runs where app_id = ? and example is not null order by created_at desc limit 400').all(app) as RunRow[]) if (!out.has(r.example!)) out.set(r.example!, toRun(r));
  return out;
}

export function getRun(db: DB, id: string): RunRecord | null {
  const r = db.prepare('select * from app_runs where id = ?').get(id) as RunRow | undefined;
  return r ? toRun(r) : null;
}

export function runByKey(db: DB, key: string): RunRecord | null {
  const r = db.prepare('select * from app_runs where key = ? order by created_at desc limit 1').get(key) as RunRow | undefined;
  return r ? toRun(r) : null;
}

/** The run a session belongs to, by id only (it is asked often). */
export function runIdByKey(db: DB, key: string): string | null {
  const r = db.prepare('select id from app_runs where key = ? order by created_at desc limit 1').get(key) as { id: string } | undefined;
  return r?.id ?? null;
}

export function updateRun(db: DB, id: string, p: Partial<{ key: string; status: RunStatus; result: Record<string, unknown> | null; reply: string; error: string | null; costUsd: number; nudged: boolean; startedAt: number; endedAt: number | null; checks: CheckResult[] }>) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  const put = (col: string, v: unknown) => {
    sets.push(`${col} = ?`);
    vals.push(v);
  };
  if (p.key !== undefined) put('key', p.key);
  if (p.status !== undefined) put('status', p.status);
  if (p.result !== undefined) put('result', p.result === null ? null : JSON.stringify(p.result));
  if (p.reply !== undefined) put('reply', p.reply);
  if (p.error !== undefined) put('error', p.error);
  if (p.costUsd !== undefined) put('cost_usd', p.costUsd);
  if (p.nudged !== undefined) put('nudged', p.nudged ? 1 : 0);
  if (p.startedAt !== undefined) put('started_at', p.startedAt);
  if (p.endedAt !== undefined) put('ended_at', p.endedAt);
  if (p.checks !== undefined) put('checks', JSON.stringify(p.checks));
  if (!sets.length) return;
  db.prepare(`update app_runs set ${sets.join(', ')} where id = ?`).run(...vals, id);
}

/**
 * Runs, newest first (a CSV's rows in order). The runs of a run's agent steps are part of that run, so
 * they are left out unless `steps` asks for them.
 */
export function listRuns(db: DB, o: { app?: string; batch?: string; visitor?: string; status?: RunStatus[]; limit?: number; before?: number; steps?: boolean; parent?: string }): RunRecord[] {
  const where: string[] = [];
  const vals: unknown[] = [];
  if (!o.steps && !o.parent) where.push("source != 'step'");
  if (o.parent) (where.push('parent = ?'), vals.push(o.parent));
  if (o.app) (where.push('app_id = ?'), vals.push(o.app));
  if (o.batch) (where.push('batch_id = ?'), vals.push(o.batch));
  if (o.visitor) (where.push('visitor = ?'), vals.push(o.visitor));
  if (o.status?.length) (where.push(`status in (${o.status.map(() => '?').join(', ')})`), vals.push(...o.status));
  if (o.before) (where.push('created_at < ?'), vals.push(o.before));
  const order = o.batch ? 'row_no asc' : 'created_at desc';
  const rows = db.prepare(`select * from app_runs ${where.length ? `where ${where.join(' and ')}` : ''} order by ${order} limit ?`).all(...vals, Math.min(o.limit ?? 100, 5000)) as RunRow[];
  return rows.map(toRun);
}

/** Runs of an app since a moment (all sources, or one), and what they spent. */
export function usageSince(db: DB, app: string, since: number, source?: RunSource): { runs: number; spent: number } {
  const r = db
    .prepare(`select count(*) as n, coalesce(sum(cost_usd), 0) as s from app_runs where app_id = ? and created_at >= ? and status != 'queued' and source != 'step' ${source ? 'and source = ?' : ''}`)
    .get(...([app, since, source].filter((x) => x !== undefined) as unknown[])) as { n: number; s: number };
  return { runs: r.n, spent: r.s };
}

export function deleteRuns(db: DB, app: string) {
  db.prepare('delete from app_steps where run_id in (select id from app_runs where app_id = ?)').run(app);
  db.prepare('delete from app_runs where app_id = ?').run(app);
  db.prepare('delete from app_batches where app_id = ?').run(app);
}

/** Removes one run, with its steps and the runs of its agent steps (their sessions stay). */
export function deleteRun(db: DB, id: string) {
  for (const c of db.prepare("select id from app_runs where parent = ? and source = 'step'").all(id) as { id: string }[]) deleteRun(db, c.id);
  db.prepare('delete from app_steps where run_id = ?').run(id);
  db.prepare('delete from app_runs where id = ?').run(id);
}

// ---- the steps of runs with steps ----------------------------------------------------------------------

/** One step of a run as the server keeps it: how it stands, what it gave, the run behind it. */
export interface StepRecord {
  run: string;
  path: string;
  id: string;
  kind: string;
  title: string;
  status: StepStatus;
  outputs?: Record<string, unknown> | null;
  childRun?: string;
  costUsd?: number;
  error?: string;
  startedAt?: number;
  endedAt?: number;
  /** Taken over from an earlier run (Run again from here): what it gave then, not run again. */
  reused?: boolean;
}

interface StepRow {
  run_id: string;
  path: string;
  step_id: string;
  kind: string;
  title: string;
  status: string;
  outputs: string | null;
  child_run: string | null;
  cost_usd: number | null;
  error: string | null;
  started_at: number | null;
  ended_at: number | null;
  reused: number | null;
}

const toStep = (r: StepRow): StepRecord => ({
  run: r.run_id,
  path: r.path,
  id: r.step_id,
  kind: r.kind,
  title: r.title,
  status: r.status as StepStatus,
  outputs: r.outputs ? parse<Record<string, unknown> | null>(r.outputs, null) : undefined,
  childRun: r.child_run ?? undefined,
  costUsd: r.cost_usd ?? undefined,
  error: r.error ?? undefined,
  startedAt: r.started_at ?? undefined,
  endedAt: r.ended_at ?? undefined,
  ...(r.reused ? { reused: true } : {}),
});

export function getStep(db: DB, run: string, path: string): StepRecord | null {
  const r = db.prepare('select * from app_steps where run_id = ? and path = ?').get(run, path) as StepRow | undefined;
  return r ? toStep(r) : null;
}

/** Writes a step's whole record (callers start from the one there). */
export function saveStep(db: DB, s: StepRecord) {
  db.prepare(
    `insert or replace into app_steps (run_id, path, step_id, kind, title, status, outputs, child_run, cost_usd, error, started_at, ended_at, reused)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(s.run, s.path, s.id, s.kind, s.title, s.status, s.outputs === undefined || s.outputs === null ? null : JSON.stringify(s.outputs), s.childRun ?? null, s.costUsd ?? null, s.error ?? null, s.startedAt ?? null, s.endedAt ?? null, s.reused ? 1 : 0);
}

/** An earlier run's steps (these, by id, and the steps inside them) as another's, taken over: they replay what they gave, at no cost. */
export function reuseSteps(db: DB, from: string, to: string, ids: string[]) {
  for (const st of listSteps(db, from)) {
    if (!ids.includes(st.path.split(/[/#]/)[0]) || st.status === 'running' || st.status === 'waiting' || st.status === 'stopped') continue;
    saveStep(db, { ...st, run: to, costUsd: undefined, reused: true });
  }
}

/** A run's steps in the order they started. */
export function listSteps(db: DB, run: string): StepRecord[] {
  return (db.prepare('select * from app_steps where run_id = ? order by coalesce(started_at, 0), rowid').all(run) as StepRow[]).map(toStep);
}

/** The start of today, local time. */
export function dayStart(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// ---- API keys ----------------------------------------------------------------------------------------

export interface AppKeyView {
  id: string;
  name: string;
  /** The first and last characters, to tell keys apart. */
  hint: string;
  createdAt: number;
  lastUsed?: number;
}

const hashOf = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

/** App keys start with this, so the server can tell them from other tokens. */
export const KEY_PREFIX = 'napp_';

/** A new key for an app: its value is returned once; only its hash is kept. */
export function createKey(db: DB, app: string, name: string): { id: string; key: string } {
  const key = `${KEY_PREFIX}${crypto.randomBytes(24).toString('base64url')}`;
  const id = newId(4);
  db.prepare('insert into app_keys (id, app_id, name, hash, hint, created_at) values (?, ?, ?, ?, ?, ?)').run(id, app, name.trim().slice(0, 60) || 'Key', hashOf(key), `${key.slice(0, 9)}…${key.slice(-4)}`, Date.now());
  return { id, key };
}

export function listKeys(db: DB, app: string): AppKeyView[] {
  return (db.prepare('select id, name, hint, created_at, last_used from app_keys where app_id = ? order by created_at').all(app) as { id: string; name: string; hint: string; created_at: number; last_used: number | null }[]).map((r) => ({
    id: r.id,
    name: r.name,
    hint: r.hint,
    createdAt: r.created_at,
    lastUsed: r.last_used ?? undefined,
  }));
}

export function revokeKey(db: DB, app: string, id: string): boolean {
  return db.prepare('delete from app_keys where app_id = ? and id = ?').run(app, id).changes > 0;
}

/** The app a key opens, or null; notes its use (at most once a minute). */
export function appOfKey(db: DB, key: string): { app: string; id: string } | null {
  if (!key.startsWith(KEY_PREFIX)) return null;
  const r = db.prepare('select id, app_id, last_used from app_keys where hash = ?').get(hashOf(key)) as { id: string; app_id: string; last_used: number | null } | undefined;
  if (!r) return null;
  if (!r.last_used || Date.now() - r.last_used > 60_000) db.prepare('update app_keys set last_used = ? where id = ?').run(Date.now(), r.id);
  return { app: r.app_id, id: r.id };
}

// ---- runs over rows ------------------------------------------------------------------------------------

interface BatchRow {
  id: string;
  app_id: string;
  name: string | null;
  concurrency: number;
  status: string;
  total: number;
  created_at: number;
  ended_at: number | null;
}

export function insertBatch(db: DB, b: { app: string; name?: string; concurrency: number; total: number }): string {
  const id = newId(6);
  db.prepare('insert into app_batches (id, app_id, name, concurrency, status, total, created_at) values (?, ?, ?, ?, ?, ?, ?)').run(id, b.app, b.name ?? null, b.concurrency, 'running', b.total, Date.now());
  return id;
}

export function getBatch(db: DB, id: string): AppBatch | null {
  const r = db.prepare('select * from app_batches where id = ?').get(id) as BatchRow | undefined;
  if (!r) return null;
  const c = db.prepare(`select sum(status = 'done') as done, sum(status in ('failed', 'stopped')) as failed from app_runs where batch_id = ?`).get(id) as { done: number | null; failed: number | null };
  return { id: r.id, app: r.app_id, name: r.name ?? undefined, concurrency: r.concurrency, status: r.status as AppBatch['status'], total: r.total, done: c.done ?? 0, failed: c.failed ?? 0, createdAt: r.created_at, endedAt: r.ended_at ?? undefined };
}

export function listBatches(db: DB, app: string): AppBatch[] {
  return (db.prepare('select id from app_batches where app_id = ? order by created_at desc limit 30').all(app) as { id: string }[]).map((r) => getBatch(db, r.id)!).filter(Boolean);
}

export function setBatchStatus(db: DB, id: string, status: AppBatch['status']) {
  db.prepare('update app_batches set status = ?, ended_at = ? where id = ?').run(status, status === 'running' ? null : Date.now(), id);
}

export function runningBatches(db: DB): string[] {
  return (db.prepare(`select id from app_batches where status = 'running'`).all() as { id: string }[]).map((r) => r.id);
}
