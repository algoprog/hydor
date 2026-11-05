// The queue: a loop (every few seconds while anything waits or runs; quiet otherwise) that starts jobs by priority
// then age when what they need is free (GPUs with enough free memory that no other run of yours holds; a place among
// the jobs without a GPU), follows the runs (their output and metrics as they grow, their end), and watches them
// for the agent on call: NaN, out of memory, a stall, a crash or a dead process, divergence. On one it notes an
// event and, as the job asked, tells you or starts an agent session with a brief. Runs on clusters go through their
// queue over SSH; runs on another machine are kept there and followed from here. When a run ends it tells you (as
// the job asked; a sweep once, at its end), and the session that started it when it asked to hear.
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ACTIVE, betterOf, type ExperimentsSettings, type JobSpec, type QueueNow, type RunEvent, type RunRecord, type WatchKind } from '../../shared/experiments.ts';
import type { Agent, NotifyEvent } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import { agentBaseEnv } from '../env.ts';
import type { Deps } from '../features/types.ts';
import { pathDirs } from '../platform.ts';
import { startSettings } from '../startSettings.ts';
import { captureEnvironment, captureGit, localShell, q, type Shell } from './capture.ts';
import { endOfSlurm, getCluster, listClusters, parseSacct, parseSbatch, parseSqueue, reasonWords, remoteDir, rq, runSsh, sbatchScript, slurmEnded, sshWhy } from './clusters.ts';
import { chooseGpus, gpuList, gpusVia, readGpus, type GpuReading } from './gpus.ts';
import { aliveLocal, exitOf, files, startLocal, stopLocal, wrapperScript } from './local.ts';
import { nanText, oomText, parseLine, readFrom, tailLines, Tracker } from './metrics.ts';
import {
  addEvent,
  eventsOf,
  eventsSince,
  getRun,
  getSweep,
  insertRun,
  listRuns,
  newId,
  offsetsOf,
  runFolder,
  saveSeries,
  seriesOf,
  specOf,
  updateRun,
  waitDone,
  waitStarted,
  type RunInfo,
} from './records.ts';
import { remoteMachine, type RemoteRun } from './remote.ts';
import { earlyStop, fillCommand, paramsOf, settingsLine, type Value } from './sweeps.ts';

const TICK_MS = 3000;
/** Clusters are asked about their runs at most this often, other machines too (the tests make them short). */
export const timing = { cluster: 20_000, remote: 15_000 };
/** Metrics and series are written down at most this often while a run goes (and when it ends). */
const SAVE_MS = 10_000;
/** The page hears of a run's new metrics at most this often. */
const TELL_MS = 2000;
/** Agents on call in an hour, all runs together. */
const AGENTS_PER_HOUR = 3;
const WATCH_ALL: WatchKind[] = ['nan', 'oom', 'stall', 'crash', 'diverge'];

let deps: Deps | null = null;
export const useDeps = (d: Deps) => void (deps = d);
export const depsOf = () => deps;

/** Runs ending, for experiment_wait. */
export const ended = new EventEmitter();
ended.setMaxListeners(200);

// ---- settings ----------------------------------------------------------------------------------------------

const defaultSlots = () => Math.max(1, Math.min(4, Math.floor(os.cpus().length / 4)));

export function settingsOf(db: DB): ExperimentsSettings {
  let s: Partial<ExperimentsSettings> = {};
  try {
    s = JSON.parse(kvGet(db, 'experiments_settings') ?? '{}');
  } catch {}
  const n = Number(s.cpuSlots);
  return { cpuSlots: Number.isInteger(n) && n >= 1 && n <= 64 ? n : defaultSlots() };
}

export function setSettings(db: DB, b: Partial<ExperimentsSettings>): ExperimentsSettings {
  const n = Math.round(Number(b.cpuSlots));
  if (!Number.isInteger(n) || n < 1 || n > 64) throw new HttpError(400, 'Jobs without a GPU at once: a number from 1 to 64');
  kvSet(db, 'experiments_settings', JSON.stringify({ ...settingsOf(db), cpuSlots: n }));
  wake();
  return settingsOf(db);
}

// ---- where a run goes ------------------------------------------------------------------------------------------

export type Place = { kind: 'local' } | { kind: 'cluster'; id: string } | { kind: 'machine'; id: string };

export function placeOf(where: string | undefined): Place {
  const w = (where ?? 'local').trim();
  if (w.startsWith('c:')) return { kind: 'cluster', id: w.slice(2) };
  if (w.startsWith('m:')) return { kind: 'machine', id: w.slice(2) };
  return { kind: 'local' };
}

/** Where a run is, in words: "this computer, GPU 0", "Unity (SLURM)", "Lab box". */
export function whereWords(db: DB, r: RunRecord): string {
  const p = placeOf(r.where);
  if (p.kind === 'cluster') return getCluster(db, p.id)?.name ?? p.id;
  if (p.kind === 'machine') return r.machine?.name ?? remoteMachine(p.id)?.name ?? p.id;
  return `${r.host ?? os.hostname()}${r.gpuIds?.length ? `, ${gpuList(r.gpuIds)}` : ''}`;
}

// ---- a new job -------------------------------------------------------------------------------------------------

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : typeof v === 'number' ? String(v) : '');
const num = (v: unknown, lo: number, hi: number, what: string): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < lo || n > hi) throw new HttpError(400, `${what}: a number from ${lo} to ${hi}`);
  return n;
};

let gpuCount: number | null = null;
/** Whether this computer has NVIDIA GPUs (read once, then kept): a job that does not say asks for one when it has. */
async function hasGpus(): Promise<boolean> {
  if (gpuCount === null) gpuCount = (await readGpus().catch(() => ({ gpus: [] }) as GpuReading)).gpus.length;
  return gpuCount > 0;
}

/** A job as given, checked and tidied: a folder that is there, numbers in range, the settings read from the command. */
export async function cleanJob(db: DB, b: Record<string, any>, o: { cwd?: string } = {}): Promise<JobSpec> {
  const command = typeof b.command === 'string' ? b.command.trim() : '';
  if (!command) throw new HttpError(400, 'Give the command to run, like python train.py --lr 3e-4');
  if (command.length > 20_000) throw new HttpError(400, 'The command is at most 20,000 characters: put a long script in a file and run that');
  const where = str(b.where, 80) || 'local';
  const place = placeOf(where);
  if (place.kind === 'cluster' && !getCluster(db, place.id)) throw new HttpError(400, `There is no cluster "${place.id}": add it on the Experiments page (Where runs go → Add a cluster)`);
  if (place.kind === 'machine' && !remoteMachine(place.id)) throw new HttpError(400, `There is no machine "${place.id}" in Settings → Machines`);
  let cwd = str(b.cwd, 4000) || o.cwd || (place.kind === 'local' ? config.defaultCwd : '');
  if (place.kind === 'local') {
    cwd = path.resolve(cwd.replace(/^~(?=$|\/)/, config.home));
    if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw new HttpError(400, `The folder ${cwd} is not there`);
  }
  const spec: JobSpec = { command, cwd, where };
  const name = str(b.name, 120);
  if (name) spec.name = name;
  const group = str(b.group, 120);
  if (group) spec.group = group;
  const gpus = num(b.gpus, 0, 16, 'GPUs');
  spec.gpus = gpus !== undefined ? Math.round(gpus) : place.kind === 'local' ? ((await hasGpus()) ? 1 : 0) : 0;
  const mem = num(b.gpuMemGb, 0, 1024, 'Free memory per GPU (GB)');
  if (mem) spec.gpuMemGb = mem;
  const cpus = num(b.cpus, 1, 1024, 'Processors');
  if (cpus) spec.cpus = Math.round(cpus);
  const memGb = num(b.memGb, 0, 100_000, 'Memory (GB)');
  if (memGb) spec.memGb = memGb;
  const hours = num(b.hours, 0, 24 * 60, 'Hours');
  if (hours) spec.hours = hours;
  const part = str(b.partition, 100);
  if (part) {
    if (!/^[\w.,:@+-]+$/.test(part)) throw new HttpError(400, 'The partition is one word, as SLURM writes it');
    spec.partition = part;
  }
  if (b.env && typeof b.env === 'object') {
    const env = Object.fromEntries(
      Object.entries(b.env as Record<string, unknown>)
        .filter(([k, v]) => /^[A-Za-z_][A-Za-z0-9_]{0,99}$/.test(k) && (typeof v === 'string' || typeof v === 'number'))
        .slice(0, 50)
        .map(([k, v]) => [k, String(v).slice(0, 4000)]),
    );
    if (Object.keys(env).length) spec.env = env;
  }
  const given: Record<string, Value> = {};
  if (b.params && typeof b.params === 'object')
    for (const [k, v] of Object.entries(b.params as Record<string, unknown>).slice(0, 100)) if (/^[\w.@/-]{1,80}$/.test(k) && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) given[k] = typeof v === 'string' ? v.slice(0, 500) : v;
  const seed = num(b.seed, -(2 ** 31), 2 ** 32, 'Seed');
  if (seed !== undefined) spec.seed = Math.round(seed);
  // {name} placeholders filled from the settings and the seed: the record keeps the command as it runs.
  spec.command = fillCommand(command, { ...given, ...(spec.seed !== undefined ? { seed: spec.seed } : {}) });
  const params = { ...paramsOf(spec.command), ...given };
  if (Object.keys(params).length) spec.params = params;
  if (spec.seed === undefined) {
    const s = params.seed ?? params.random_seed;
    if (typeof s === 'number' && Number.isInteger(s)) spec.seed = s;
  }
  if (Array.isArray(b.tags)) {
    const tags = [...new Set(b.tags.map((t: unknown) => str(t, 40)).filter(Boolean))].slice(0, 20);
    if (tags.length) spec.tags = tags;
  }
  const pr = num(b.priority, -100, 100, 'Priority');
  if (pr) spec.priority = Math.round(pr);
  for (const k of ['metricsFile', 'scoresFile'] as const) {
    const f = str(b[k], 500);
    if (f) spec[k] = f;
  }
  if (b.onCall && typeof b.onCall === 'object') {
    const c = b.onCall as Record<string, unknown>;
    const watch = Array.isArray(c.watch) ? WATCH_ALL.filter((w) => (c.watch as unknown[]).includes(w)) : undefined;
    const stall = num(c.stallMinutes, 0.01, 7 * 24 * 60, 'Minutes without output that count as a stall');
    spec.onCall = {
      on: c.on !== false,
      ...(watch ? { watch } : {}),
      ...(stall ? { stallMinutes: stall } : {}),
      act: c.act === 'agent' ? 'agent' : 'tell',
      ...(str(c.rules, 4000) ? { rules: str(c.rules, 4000) } : {}),
      ...(str(c.agent, 100) ? { agent: str(c.agent, 100) } : {}),
      ...(str(c.model, 200) ? { model: str(c.model, 200) } : {}),
    };
  }
  if (b.notify && typeof b.notify === 'object') {
    const n = b.notify as Record<string, any>;
    spec.notify = {};
    if (typeof n.done === 'boolean') spec.notify.done = n.done;
    if (typeof n.failed === 'boolean') spec.notify.failed = n.failed;
    if (n.when && typeof n.when === 'object' && str(n.when.metric, 100) && ['>', '<', '>=', '<='].includes(n.when.op) && Number.isFinite(Number(n.when.value)))
      spec.notify.when = { metric: str(n.when.metric, 100), op: n.when.op, value: Number(n.when.value) };
  }
  if (b.better && typeof b.better === 'object') {
    const better = Object.fromEntries(Object.entries(b.better as Record<string, unknown>).filter(([k, v]) => k.length <= 100 && (v === 'max' || v === 'min'))) as Record<string, 'max' | 'min'>;
    if (Object.keys(better).length) spec.better = better;
  }
  if (b.report === true) spec.report = true;
  const project = str(b.project, 40);
  if (project) spec.project = project;
  if (typeof b.sweep === 'string' && /^[a-z0-9]{4,32}$/.test(b.sweep)) spec.sweep = b.sweep;
  return spec;
}

/** A name for a run that has none: the script it runs and the settings that tell it apart. */
export function nameFor(spec: JobSpec): string {
  const words = spec.command.split(/\s+/);
  const script = words.find((w) => /\.(py|sh|jl|r|lua|js|ts)$/i.test(w))?.split('/').pop() ?? words.find((w) => !/^[A-Za-z_]\w*=/.test(w))?.split('/').pop() ?? 'run';
  return script.slice(0, 60);
}

/** Puts a job in line (or sends it to its machine); the queue takes it from there. */
export async function submit(d: Deps, spec: JobSpec, o: { startedBy?: RunInfo['startedBy']; from?: string } = {}): Promise<RunRecord> {
  const id = newId('r');
  const place = placeOf(spec.where);
  if (place.kind === 'machine') {
    const m = remoteMachine(place.id);
    if (!m) throw new HttpError(400, `There is no machine "${place.id}" in Settings → Machines`);
    // Kept there (its agent on call and notices are that machine's); here a copy follows it.
    const there = await m.call<{ run: RunRecord }>('POST', '/api/experiments/jobs', 30_000, { ...spec, where: 'local', report: false }).catch((e) => {
      throw new HttpError(502, `${m.name} did not take it: ${(e as Error).message}`);
    });
    insertRun(d.db, { id, spec: { ...spec, name: spec.name ?? there.run.name }, status: there.run.status, why: there.run.why, info: { remote: { machine: place.id, id: there.run.id }, ...(o.startedBy ? { startedBy: o.startedBy } : {}), ...(o.from ? { from: o.from } : {}) } });
  } else {
    insertRun(d.db, { id, spec: { ...spec, name: spec.name ?? nameFor(spec) }, status: 'queued', info: { folder: runFolder(id), ...(o.startedBy ? { startedBy: o.startedBy } : {}), ...(o.from ? { from: o.from } : {}) } });
    addEvent(d.db, id, { kind: 'queued', text: `In line${place.kind === 'cluster' ? ` for ${getCluster(d.db, place.id)?.name ?? place.id}` : ''}` });
  }
  tellRuns(d, [id]);
  wake();
  return getRun(d.db, id)!;
}

/** Runs it again, as it was or with changes. */
export async function runAgain(d: Deps, id: string, changes: Record<string, unknown> = {}, startedBy?: RunInfo['startedBy']): Promise<RunRecord> {
  const r = getRun(d.db, id);
  if (!r) throw new HttpError(404, 'There is no such run');
  const base = specOf(r);
  const spec = await cleanJob(d.db, { ...base, ...(r.remote ? { where: `m:${r.remote.machine}` } : {}), ...changes, sweep: undefined });
  return submit(d, spec, { startedBy, from: r.id });
}

// ---- the loop ----------------------------------------------------------------------------------------------------

interface Live {
  tracker: Tracker;
  log: number;
  file: number;
  carry: string;
  fileCarry: string;
  outputAt: number;
  fired: Set<WatchKind>;
  stalls: number;
  stalled: boolean;
  oomLine?: string;
  nanLine?: string;
  dirty: boolean;
  savedAt: number;
  toldAt: number;
  when: boolean;
  goneAt: number;
  polledAt: number;
  judgedAt: number;
}

const live = new Map<string, Live>();
/** Runs being started or stopped just now: the loop leaves them alone meanwhile. */
const busy = new Set<string>();
let timer: NodeJS.Timeout | null = null;
let ticking = false;
let again = false;

export function wake() {
  if (!deps) return;
  if (!timer) {
    timer = setInterval(() => void tick(), TICK_MS);
    timer.unref?.();
  }
  setImmediate(() => void tick());
}

/** One pass now, awaited (the tests step the queue by hand). */
export async function tick() {
  if (ticking) {
    again = true;
    return;
  }
  ticking = true;
  try {
    do {
      again = false;
      await pass();
    } while (again);
  } catch (e) {
    console.error('[experiments]', (e as Error)?.message ?? e);
  } finally {
    ticking = false;
  }
}

function sleepLoop() {
  if (timer) clearInterval(timer);
  timer = null;
}

async function pass() {
  const d = deps;
  if (!d) return;
  const active = listRuns(d.db, { status: ACTIVE, limit: 5000, oldest: true });
  if (!active.length && !busy.size) return sleepLoop();
  for (const r of active) {
    if (busy.has(r.id)) continue;
    try {
      if (r.remote) await followRemote(d, r);
      else if (placeOf(r.where).kind === 'cluster') await followCluster(d, r);
      else if (r.status === 'running' || r.status === 'starting') await followLocal(d, r);
    } catch (e) {
      console.error(`[experiments] ${r.id}:`, (e as Error)?.message ?? e);
    }
  }
  await startWaiting(d);
}

function liveOf(d: Deps, r: RunRecord): Live {
  let L = live.get(r.id);
  if (!L) {
    const off = offsetsOf(d.db, r.id);
    L = {
      tracker: new Tracker(r.better, { metrics: r.metrics, series: seriesOf(d.db, r.id) }),
      log: off.log,
      file: off.file,
      carry: '',
      fileCarry: '',
      outputAt: r.outputAt ?? r.startedAt ?? Date.now(),
      fired: new Set(eventsOf(d.db, r.id).flatMap((e) => (WATCH_ALL.includes(e.kind as WatchKind) && e.kind !== 'stall' ? [e.kind as WatchKind] : []))),
      stalls: 0,
      stalled: false,
      dirty: false,
      savedAt: Date.now(),
      toldAt: 0,
      when: eventsOf(d.db, r.id).some((e) => e.kind === 'note' && e.text.startsWith('Crossed')),
      goneAt: 0,
      polledAt: 0,
      judgedAt: 0,
    };
    live.set(r.id, L);
  }
  return L;
}

/** Output as it comes: lines into metrics, and the words the agent on call watches for. */
function consume(L: Live, text: string, which: 'log' | 'file') {
  const carry = which === 'log' ? L.carry : L.fileCarry;
  const lines = (carry + text).split('\n');
  let rest = lines.pop() ?? '';
  if (rest.length > 64 * 1024) rest = '';
  if (which === 'log') L.carry = rest;
  else L.fileCarry = rest;
  for (const line of lines) {
    const r = parseLine(line);
    if (r && L.tracker.add(r)) L.dirty = true;
    if (which === 'log') {
      if (!L.oomLine && oomText(line)) L.oomLine = line.trim().slice(0, 300);
      if (!L.nanLine && nanText(line)) L.nanLine = line.trim().slice(0, 300);
    }
  }
  L.outputAt = Date.now();
}

/** New output of a local run: its log and its metrics file. */
function readLocal(r: RunRecord, L: Live, all = false) {
  const folder = r.folder ?? runFolder(r.id);
  for (let i = 0; i < (all ? 50 : 1); i++) {
    const { text, next } = readFrom(files(folder).log, L.log);
    if (!text) break;
    L.log = next;
    consume(L, text, 'log');
  }
  if (r.metricsFile) {
    const file = path.resolve(r.cwd, r.metricsFile);
    for (let i = 0; i < (all ? 50 : 1); i++) {
      const { text, next } = readFrom(file, L.file);
      if (!text) break;
      L.file = next;
      consume(L, text, 'file');
    }
  }
}

/** Writes down a run's metrics and where its reading got to, when due (or now), and tells the pages. */
function save(d: Deps, r: RunRecord, L: Live, now = false) {
  const t = Date.now();
  if (L.dirty && (now || t - L.savedAt > SAVE_MS)) {
    updateRun(d.db, r.id, { metrics: L.tracker.snapshot(), logOffset: L.log, fileOffset: L.file, info: { outputAt: L.outputAt } });
    saveSeries(d.db, r.id, L.tracker.series);
    L.dirty = false;
    L.savedAt = t;
  } else if (now || t - L.savedAt > SAVE_MS) {
    updateRun(d.db, r.id, { logOffset: L.log, fileOffset: L.file, info: { outputAt: L.outputAt } });
    L.savedAt = t;
  }
  if (t - L.toldAt > TELL_MS) {
    L.toldAt = t;
    tellRuns(d, [r.id]);
  }
}

async function followLocal(d: Deps, r: RunRecord) {
  const folder = r.folder ?? runFolder(r.id);
  if (r.status === 'starting') {
    // The server stopped while starting it: going on if it got going, else back in line.
    if (aliveLocal(r.id, folder) || exitOf(folder) !== null) updateRun(d.db, r.id, { status: 'running' });
    else {
      updateRun(d.db, r.id, { status: 'queued', why: null });
      tellRuns(d, [r.id]);
    }
    return;
  }
  const L = liveOf(d, r);
  readLocal(r, L);
  await watch(d, r, L);
  const code = exitOf(folder);
  if (code !== null) return finish(d, r, L, code);
  if (!aliveLocal(r.id, folder)) {
    // Its wrapper may be writing its exit code this moment: a second look first.
    if (!L.goneAt) L.goneAt = Date.now();
    else if (Date.now() - L.goneAt > 4000) return finish(d, r, L, null, { missing: 'Its process went missing without an exit code: the computer may have restarted, or something killed it' });
  } else L.goneAt = 0;
  save(d, r, L);
}

/** NaN and divergence in its metrics (or NaN in its log's words), out of memory in its log. */
async function watchOutput(d: Deps, r: RunRecord, L: Live) {
  const t = L.tracker;
  if (!L.fired.has('nan') && (t.nan.length || L.nanLine)) await fire(d, r, L, 'nan', t.nan.length ? `${t.nan.join(', ')} became ${Number.isNaN(t.last[t.nan[0]]) ? 'NaN' : 'infinite'}${t.step !== undefined ? ` at step ${t.step}` : ''}` : `NaN in its log: “${L.nanLine}”`);
  if (!L.fired.has('diverge') && t.diverged.length) {
    const k = t.diverged[0];
    await fire(d, r, L, 'diverge', `${k} went over twice its best (${fmt(t.best[k])}) and stayed there: ${fmt(t.last[k])} now`);
  }
  if (!L.fired.has('oom') && L.oomLine && ACTIVE.includes(r.status)) await fire(d, r, L, 'oom', `Out of memory in its log: “${L.oomLine}”`);
}

const minutes = (ms: number) => (ms < 90_000 ? 'about a minute' : ms < 90 * 60_000 ? `${Math.round(ms / 60_000)} minutes` : `${Math.round(ms / 3_600_000)} hours`);

/** What the agent on call watches for while a run goes; and the early stop, the time limit, a metric crossing a value. */
async function watch(d: Deps, r: RunRecord, L: Live) {
  const now = Date.now();
  const t = L.tracker;
  await watchOutput(d, r, L);
  const stallMs = (r.onCall?.stallMinutes ?? 30) * 60_000;
  if (now - L.outputAt > stallMs) {
    if (!L.stalled && L.stalls < 3) {
      L.stalled = true;
      L.stalls++;
      await fire(d, r, L, 'stall', `No new output for ${minutes(now - L.outputAt)}`);
    }
  } else L.stalled = false;
  const w = r.notify?.when;
  if (w && !L.when) {
    const v = t.last[w.metric];
    const hit = typeof v === 'number' && Number.isFinite(v) && (w.op === '>' ? v > w.value : w.op === '<' ? v < w.value : w.op === '>=' ? v >= w.value : v <= w.value);
    if (hit) {
      L.when = true;
      addEvent(d.db, r.id, { kind: 'note', text: `Crossed: ${w.metric} ${w.op} ${w.value} (${fmt(v)} now)` });
      notice(d, r, 'waiting', `${w.metric} is ${fmt(v)}, ${w.op === '>' || w.op === '>=' ? 'over' : 'under'} ${w.value}`);
    }
  }
  if (r.hours && r.startedAt && now - r.startedAt > r.hours * 3_600_000 && !r.stopping && placeOf(r.where).kind === 'local') await stopRun(d, r.id, `It reached its time limit of ${r.hours} h`);
  if (r.sweep && now - L.judgedAt > 15_000 && !r.stopping) {
    L.judgedAt = now;
    const sw = getSweep(d.db, r.sweep);
    if (sw?.earlyStop) {
      const others = listRuns(d.db, { sweep: r.sweep, limit: 1000 })
        .filter((x) => x.id !== r.id)
        .map((x) => live.get(x.id)?.tracker.series ?? seriesOf(d.db, x.id));
      const e = earlyStop(t.series, others, sw.earlyStop);
      if (e.stop) await stopRun(d, r.id, `Stopped early: ${sw.earlyStop.metric} was ${fmt(e.value)} at step ${e.step}, worse than the median of the other ${e.others} runs then (${fmt(e.median)})`);
    }
  }
}

const fmt = (v: number | undefined) => (v === undefined ? '?' : Number.isNaN(v) ? 'NaN' : Math.abs(v) >= 1000 || (Math.abs(v) < 0.001 && v !== 0) ? v.toExponential(2) : String(Math.round(v * 10_000) / 10_000));

/**
 * Something the agent on call watches for happened: an event always; then, when the job has the agent on call for
 * it, a notice or an agent session. Returns whether you heard of it (so the end's own notice is not doubled).
 */
async function fire(d: Deps, r: RunRecord, L: Live | null, kind: WatchKind, text: string): Promise<boolean> {
  L?.fired.add(kind);
  addEvent(d.db, r.id, { kind, text });
  tellRuns(d, [r.id]);
  const oc = r.onCall;
  if (!oc?.on || !(oc.watch ?? WATCH_ALL).includes(kind)) return false;
  const status = kind === 'crash' || (kind === 'oom' && ACTIVE.indexOf(r.status) < 0) ? 'failed' : 'waiting';
  if (oc.act === 'agent') {
    const key = await onCallAgent(d, r, kind, text).catch((e) => {
      addEvent(d.db, r.id, { kind: 'note', text: `The agent on call could not start: ${(e as Error).message}` });
      return null;
    });
    if (key) {
      notice(d, r, status, `${text}. An agent is looking into it.`);
      return true;
    }
  }
  notice(d, r, status, text);
  return true;
}

// ---- the agent on call -------------------------------------------------------------------------------------------

export const DEFAULT_RULES =
  'Read the log and the code. If a fix is clear and safe, run it again with experiment_run (from the last checkpoint if there is one), changing as little as possible. Never delete files or checkpoints. Then tell the user in a few lines what happened and what you did.';

const WHAT: Record<WatchKind, string> = { nan: 'NaN', oom: 'out of memory', stall: 'stalled', crash: 'crashed', diverge: 'diverging' };

/** The brief an agent on call starts with: what happened, the run's record, the end of its log, the rules. */
export function onCallBrief(d: Deps, r: RunRecord, kind: WatchKind, text: string): string {
  const log = tailLines(files(r.folder ?? runFolder(r.id)).log, 80, 64 * 1024).text.slice(-8000);
  const env = r.environment ? Object.entries(r.environment).map(([k, v]) => `${k} ${v}`).join(', ') : '';
  const metrics = r.metrics?.last ? Object.entries(r.metrics.last).slice(0, 12).map(([k, v]) => `${k}=${fmt(v)}`).join(', ') : '';
  const place = placeOf(r.where);
  return [
    `[Experiments · agent on call] The run “${r.name ?? r.id}” (${r.id}) ${kind === 'crash' ? 'crashed' : kind === 'stall' ? 'stalled' : kind === 'oom' ? 'ran out of memory' : kind === 'nan' ? 'has NaN in it' : 'is diverging'}.`,
    '',
    `What happened: ${text}.`,
    `Command: ${r.command}`,
    `Folder: ${r.cwd}${place.kind === 'cluster' ? ` (on the cluster ${whereWords(d.db, r)}, reached with ssh ${getCluster(d.db, place.id)?.host ?? ''})` : ''}`,
    `Where: ${whereWords(d.db, r)}${r.gpus ? `; it asked for ${r.gpus} GPU${r.gpus === 1 ? '' : 's'}${r.gpuMemGb ? ` with ${r.gpuMemGb} GB free each` : ''}` : ''}`,
    `Status: ${r.status}${r.why ? ` (${r.why})` : ''}${r.startedAt ? `; started ${new Date(r.startedAt).toISOString()}` : ''}${r.exitCode !== undefined && r.exitCode !== null ? `; exit code ${r.exitCode}` : ''}`,
    r.commit ? `Code: commit ${r.commit.slice(0, 12)}${r.branch ? ` on ${r.branch}` : ''}${r.dirty ? `, with changes not committed (the patch: ${r.patchPath})` : ''}` : '',
    r.params && Object.keys(r.params).length ? `Settings: ${settingsLine(r.params)}${r.seed !== undefined ? `; seed ${r.seed}` : ''}` : r.seed !== undefined ? `Seed: ${r.seed}` : '',
    env ? `Environment: ${env}` : '',
    metrics ? `Last metrics${r.metrics?.step !== undefined ? ` (step ${r.metrics.step})` : ''}: ${metrics}` : '',
    `Its folder (log.txt, the patch, metrics): ${r.folder ?? runFolder(r.id)}`,
    '',
    'The end of its log:',
    '```',
    log || '(empty)',
    '```',
    '',
    'What you may do (the user’s rules for this run):',
    r.onCall?.rules?.trim() || DEFAULT_RULES,
    '',
    `experiment_get reads this run (and more of its log); experiment_run with again: "${r.id}" starts it again with the changes you give; experiment_stop stops a run.`,
  ]
    .filter((l) => l !== '')
    .join('\n')
    .replace(/\n(The end of its log:|What you may do)/g, '\n\n$1');
}

const BUSY = new Set(['starting', 'working', 'waiting']);

/** Starts the agent on call in a session of its own: one per run at a time, a few an hour at most. Its key, or null. */
async function onCallAgent(d: Deps, r: RunRecord, kind: WatchKind, text: string): Promise<string | null> {
  const last = eventsOf(d.db, r.id)
    .filter((e) => e.kind === 'agent' && e.session)
    .pop();
  if (last?.session && BUSY.has(d.sessions.summary(last.session)?.live?.status ?? '')) {
    addEvent(d.db, r.id, { kind: 'note', text: 'The agent on call is still at work on the last one: it was not started again.' });
    return last.session;
  }
  if (eventsSince(d.db, 'agent', Date.now() - 3_600_000).length >= AGENTS_PER_HOUR) {
    addEvent(d.db, r.id, { kind: 'note', text: `${AGENTS_PER_HOUR} agents went on call in the last hour, the most: you were told instead.` });
    return null;
  }
  const st = startSettings(d.db);
  const agentKey = r.onCall?.agent || st.agent || 'claude';
  const agent: Agent = agentKey.startsWith('acp') ? 'acp' : agentKey === 'codex' ? 'codex' : 'claude';
  const acpAgent = agent === 'acp' ? agentKey.slice(4) || undefined : undefined;
  const pick = st.runs?.[agentKey] ?? {};
  const cwd = placeOf(r.where).kind === 'local' && fs.existsSync(r.cwd) ? r.cwd : (r.folder ?? runFolder(r.id));
  fs.mkdirSync(cwd, { recursive: true });
  const key = await d.sessions.create({
    agent,
    acpAgent,
    cwd,
    prompt: onCallBrief(d, r, kind, text),
    model: r.onCall?.model ?? pick.model ?? undefined,
    effort: agent === 'acp' ? undefined : (pick.effort ?? undefined),
    mode: pick.mode ?? undefined,
    title: `On call: ${r.name ?? r.id} · ${WHAT[kind]}`,
    remember: false,
    extra: r.project ? { space: r.project } : {},
  });
  addEvent(d.db, r.id, { kind: 'agent', text: `An agent is looking into it (${WHAT[kind]})`, session: key });
  return key;
}

/** Sessions of agents on call (they may start and stop runs without asking: the user's rules let them). */
export function onCallSession(db: DB, key: string): boolean {
  return eventsSince(db, 'agent', Date.now() - 7 * 24 * 3_600_000).some((e) => e.session === key);
}

// ---- telling you ------------------------------------------------------------------------------------------------

const sent: number[] = [];
let held = 0;
let heldTimer: NodeJS.Timeout | null = null;
/** Notices in ten minutes, at most; past that, one that counts the rest. */
const NOTICES = 8;

/** For the tests: the notices sent lately are forgotten. */
export function forgetNotices() {
  sent.length = 0;
}

/** A notice about a run (at most 8 in 10 minutes; past that, one that counts the rest). */
export function notice(d: Deps, r: RunRecord, kind: NotifyEvent['kind'], body: string, o: { title?: string; url?: string } = {}) {
  const now = Date.now();
  while (sent.length && sent[0] < now - 10 * 60_000) sent.shift();
  if (sent.length >= NOTICES) {
    held++;
    heldTimer ??= setTimeout(
      () => {
        heldTimer = null;
        const n = held;
        held = 0;
        if (n) d.sessions.emit('notify', { key: 'experiments', kind: 'done', title: 'Experiments', body: `${n} more notice${n === 1 ? '' : 's'} about your runs: see Experiments`, agent: 'claude', at: Date.now(), url: '/system/experiments' } satisfies NotifyEvent);
      },
      10 * 60_000,
    ).unref();
    return;
  }
  sent.push(now);
  d.sessions.emit('notify', { key: `experiment:${r.id}`, kind, title: o.title ?? r.name ?? 'Experiment', body: body.slice(0, 300), agent: 'claude', at: now, url: o.url ?? `/system/experiments/${r.id}` } satisfies NotifyEvent);
}

const took = (r: RunRecord) => {
  if (!r.startedAt) return '';
  const m = Math.round(((r.endedAt ?? Date.now()) - r.startedAt) / 60_000);
  return m < 1 ? 'under a minute' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
};

/** The run's key numbers in a line: the job's metrics' last values, the best where it differs. */
export function metricsLine(r: RunRecord, n = 4): string {
  const last = r.metrics?.last ?? {};
  return Object.keys(last)
    .slice(0, n)
    .map((k) => {
      const b = r.metrics?.best?.[k];
      return `${k} ${fmt(last[k])}${b !== undefined && b !== last[k] ? ` (best ${fmt(b)})` : ''}`;
    })
    .join(', ');
}

/** How a run ended, in a line. */
export function endLine(r: RunRecord): string {
  const m = metricsLine(r);
  if (r.status === 'done') return `Done in ${took(r)}${m ? `: ${m}` : ''}`;
  if (r.status === 'stopped') return `${r.why ?? 'Stopped'}${m ? `. ${m}` : ''}`;
  return `${r.why ?? 'Failed'}${took(r) ? ` (after ${took(r)})` : ''}`;
}

/** A run ended: tell you (as it asked; a sweep's runs once, when the sweep ends) and the session that asked to hear. */
async function ending(d: Deps, r: RunRecord, toldAlready: boolean) {
  if (r.sweep) return sweepEnding(d, r.sweep);
  const want = r.status === 'done' ? r.notify?.done !== false : r.status === 'failed' || r.status === 'lost' ? r.notify?.failed !== false : false;
  if (want && !toldAlready && !r.remote) notice(d, r, r.status === 'done' ? 'done' : 'failed', endLine(r));
  if (r.report && r.startedBy?.session) await report(d, r.startedBy.session, `[Experiments] The run “${r.name ?? r.id}” (${r.id}) ended. ${endLine(r)}. experiment_get reads its record and the end of its log.`);
}

async function report(d: Deps, key: string, text: string) {
  if (!d.sessions.summary(key)) return;
  await d.sessions.deliverOrQueue(key, text).catch(() => {});
}

/** A sweep's run ended: when it was the last, one notice for the sweep, with its best run. */
async function sweepEnding(d: Deps, sweep: string) {
  const runs = listRuns(d.db, { sweep, limit: 1000 });
  if (!runs.length || runs.some((x) => ACTIVE.includes(x.status))) return;
  const sw = getSweep(d.db, sweep);
  const count = (s: RunRecord['status']) => runs.filter((x) => x.status === s).length;
  const early = runs.filter((x) => x.status === 'stopped' && x.why?.startsWith('Stopped early')).length;
  const parts = [`${count('done')} done`, count('failed') + count('lost') ? `${count('failed') + count('lost')} failed` : '', early ? `${early} stopped early` : '', count('stopped') - early ? `${count('stopped') - early} stopped` : ''].filter(Boolean);
  const metric = sw?.earlyStop?.metric ?? Object.keys(runs.find((x) => x.status === 'done')?.metrics?.last ?? {})[0];
  let best = '';
  if (metric) {
    const way = sw?.earlyStop?.better ?? betterOf(metric, runs[0].better);
    const scored = runs.filter((x) => typeof x.metrics?.best?.[metric] === 'number');
    scored.sort((a, b) => (way === 'min' ? a.metrics!.best![metric] - b.metrics!.best![metric] : b.metrics!.best![metric] - a.metrics!.best![metric]));
    if (scored[0]) best = ` Best ${metric} ${fmt(scored[0].metrics!.best![metric])}: ${scored[0].params ? settingsLine(Object.fromEntries(Object.entries(scored[0].params).filter(([k]) => k in (sw?.params ?? {})))) : scored[0].name}.`;
  }
  const first = runs[runs.length - 1];
  const line = `${parts.join(', ')}.${best}`;
  if (first.notify?.done !== false || (count('failed') && first.notify?.failed !== false)) notice(d, first, count('done') ? 'done' : 'failed', line, { title: `Sweep ${sw?.group ?? first.group ?? ''}`.trim(), url: `/system/experiments?sweep=${sweep}` });
  if (first.report && first.startedBy?.session) await report(d, first.startedBy.session, `[Experiments] The sweep ${sw?.group ?? sweep} (${sweep}) ended: ${line} experiment_list with group "${sw?.group ?? first.group}" lists its runs; experiment_table compares them.`);
}

// ---- the end of a run ----------------------------------------------------------------------------------------------

/** A run ended (with its exit code; null: it went missing). Its last output is read, its metrics kept, you told. */
async function finish(d: Deps, r: RunRecord, L: Live, code: number | null, o: { missing?: string; why?: string; oom?: boolean } = {}) {
  if (placeOf(r.where).kind === 'local') readLocal(r, L, true);
  if (L.carry) consume(L, '\n', 'log');
  // What its last output said (NaN, divergence) is noticed before its end is.
  await watchOutput(d, { ...r, status: 'done' }, L);
  const cur = getRun(d.db, r.id) ?? r;
  const now = Date.now();
  let status: RunRecord['status'];
  let why: string | null = null;
  const oom = !!L.oomLine || code === 137 || !!o.oom;
  if (cur.stopping) {
    status = 'stopped';
    why = cur.stopping;
  } else if (code === null) {
    status = 'lost';
    why = o.missing ?? 'Its process went missing';
  } else if (code === 0) status = 'done';
  else {
    status = 'failed';
    why = o.why ?? (oom ? `It ran out of memory${code === 137 ? ' (it was killed: exit code 137)' : ''}` : `Its command ended with exit code ${code}`);
  }
  const folder = cur.folder ?? runFolder(r.id);
  // What it leaves in its folder: its metrics, and the per-example scores it wrote.
  let scores = false;
  if (cur.scoresFile && placeOf(r.where).kind === 'local') {
    const from = path.resolve(cur.cwd, fillCommand(cur.scoresFile, { ...(cur.params ?? {}), ...(cur.seed !== undefined ? { seed: cur.seed } : {}) }).replace(/^'|'$/g, ''));
    try {
      if (fs.statSync(from).size <= 50 * 1024 * 1024) {
        fs.copyFileSync(from, path.join(folder, 'scores.jsonl'));
        scores = true;
      }
    } catch {}
  }
  updateRun(d.db, r.id, {
    status,
    why,
    endedAt: now,
    metrics: L.tracker.snapshot(),
    logOffset: L.log,
    fileOffset: L.file,
    info: { exitCode: code, outputAt: L.outputAt, stopping: undefined, ...(scores ? { scores: true } : {}) },
  });
  saveSeries(d.db, r.id, L.tracker.series);
  try {
    fs.writeFileSync(path.join(folder, 'metrics.json'), JSON.stringify({ ...L.tracker.snapshot(), series: L.tracker.series }, null, 1));
  } catch {}
  addEvent(d.db, r.id, { kind: status === 'done' ? 'done' : status === 'stopped' ? 'stopped' : 'failed', text: status === 'done' ? `Done in ${took({ ...cur, endedAt: now })}` : (why ?? status) });
  live.delete(r.id);
  const rec = getRun(d.db, r.id)!;
  let told = false;
  if (status === 'failed' || status === 'lost') {
    const kind: WatchKind = oom ? 'oom' : 'crash';
    told = L.fired.has(kind) ? !!rec.onCall?.on : await fire(d, rec, null, kind, why ?? 'It failed');
  }
  await ending(d, rec, told);
  tellRuns(d, [r.id]);
  ended.emit('ended', r.id);
}

// ---- starting runs ------------------------------------------------------------------------------------------------

function setWaiting(d: Deps, r: RunRecord, why: string) {
  if (r.status === 'waiting' && r.why === why) return;
  updateRun(d.db, r.id, { status: 'waiting', why });
  if (r.status !== 'waiting') addEvent(d.db, r.id, { kind: 'waiting', text: why });
  tellRuns(d, [r.id]);
}

function fail(d: Deps, r: RunRecord, why: string) {
  updateRun(d.db, r.id, { status: 'failed', why, endedAt: Date.now() });
  addEvent(d.db, r.id, { kind: 'failed', text: why });
  const rec = getRun(d.db, r.id)!;
  void ending(d, rec, false);
  tellRuns(d, [r.id]);
  ended.emit('ended', r.id);
}

/** The runs here that wait: each takes what it needs while it is free, by priority then age. */
async function startWaiting(d: Deps) {
  const all = listRuns(d.db, { status: ['queued', 'waiting', 'starting', 'running'], limit: 5000, oldest: true }).filter((r) => !r.remote && placeOf(r.where).kind === 'local');
  const waiting = all.filter((r) => (r.status === 'queued' || r.status === 'waiting') && !busy.has(r.id));
  if (!waiting.length) return;
  waiting.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.createdAt - b.createdAt);
  const going = all.filter((r) => r.status === 'starting' || r.status === 'running' || busy.has(r.id));
  const held = new Set(going.flatMap((r) => r.gpuIds ?? []));
  const slots = settingsOf(d.db).cpuSlots;
  let free = slots - going.filter((r) => !r.gpus).length;
  let reading: GpuReading | null = null;
  for (const r of waiting) {
    const need = r.gpus ?? 0;
    if (!need) {
      if (free > 0) {
        free--;
        await begin(d, r, []);
      } else setWaiting(d, r, `Waiting for one of your runs without a GPU to end (${slots} at most at once)`);
      continue;
    }
    reading ??= await readGpus().catch((): GpuReading => ({ gpus: [], error: 'failed' }));
    if (reading.error === 'missing' && !reading.gpus.length) {
      fail(d, r, 'This computer has no NVIDIA GPU that nvidia-smi can see: run it with 0 GPUs, or on another machine or cluster');
      continue;
    }
    if (!reading.gpus.length) {
      setWaiting(d, r, 'Waiting: the GPUs could not be read just now (nvidia-smi failed); trying again');
      continue;
    }
    if (need > reading.gpus.length) {
      fail(d, r, `It asks for ${need} GPUs, and this computer has ${reading.gpus.length}`);
      continue;
    }
    const pick = chooseGpus(reading.gpus, need, r.gpuMemGb, held);
    if ('why' in pick) {
      setWaiting(d, r, pick.why);
      continue;
    }
    for (const i of pick.ids) held.add(i);
    await begin(d, r, pick.ids, reading);
  }
}

/** The run's own variables: its id and folder, Python's output unbuffered (so the log follows), its seed, its GPUs. */
function runEnv(r: RunRecord, folder: string, gpuIds: number[] | null): Record<string, string> {
  const env: Record<string, string> = { PYTHONUNBUFFERED: '1', ...r.env, HYDOR_RUN: r.id, HYDOR_RUN_DIR: folder };
  if (r.seed !== undefined) env.HYDOR_SEED = String(r.seed);
  // The GPUs it was given; none for a job without a GPU, unless it set them itself.
  if (gpuIds?.length) env.CUDA_VISIBLE_DEVICES = gpuIds.join(',');
  else if (gpuIds && r.env?.CUDA_VISIBLE_DEVICES === undefined) env.CUDA_VISIBLE_DEVICES = '';
  return env;
}

/** Starts a run here: its record (commit, patch), its wrapper in tmux, then its environment in the background. */
async function begin(d: Deps, r: RunRecord, gpuIds: number[], reading?: GpuReading) {
  busy.add(r.id);
  const folder = runFolder(r.id);
  try {
    updateRun(d.db, r.id, { status: 'starting', why: null, startedAt: Date.now(), info: { host: os.hostname(), gpuIds, folder, logPath: files(folder).log } });
    tellRuns(d, [r.id]);
    if (!fs.existsSync(r.cwd)) throw new Error(`The folder ${r.cwd} is not there`);
    fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
    const env = runEnv(r, folder, gpuIds);
    const base = agentBaseEnv();
    const sh = localShell(r.cwd, { ...base, ...r.env });
    const git = await captureGit(sh).catch(() => ({}) as Awaited<ReturnType<typeof captureGit>>);
    const info: Partial<RunInfo> = { commit: git.commit, branch: git.branch, dirty: git.dirty, untracked: git.untracked };
    if (git.patch) {
      fs.writeFileSync(files(folder).patch, git.cut ? `${git.patch}\n# Hydor: the patch was cut at 2 MB.\n` : git.patch, { mode: 0o600 });
      info.patchPath = files(folder).patch;
    }
    updateRun(d.db, r.id, { info });
    await startLocal({ id: r.id, folder, cwd: r.cwd, command: r.command, env });
    const now = Date.now();
    updateRun(d.db, r.id, { status: 'running', info: { outputAt: now } });
    addEvent(d.db, r.id, { kind: 'started', text: `Started on ${os.hostname()}${gpuIds.length ? `, ${gpuList(gpuIds)}` : ''}` });
    live.delete(r.id);
    const names = gpuIds.map((i) => reading?.gpus.find((g) => g.index === i)?.name ?? '').filter(Boolean);
    void captureEnvironment(sh, { command: r.command, cwd: r.cwd, pathDirs: pathDirs({ ...base, ...r.env }), gpus: gpuIds.length > 0, gpuNames: names })
      .then((environment) => {
        updateRun(d.db, r.id, { info: { environment } });
        tellRuns(d, [r.id]);
      })
      .catch(() => {});
  } catch (e) {
    fail(d, r, `It could not start: ${(e as Error).message}`);
  } finally {
    busy.delete(r.id);
    tellRuns(d, [r.id]);
  }
}

// ---- stopping ------------------------------------------------------------------------------------------------

/** Stops a run: one in line at once; one running is asked to stop (Ctrl-C, then harder) and ends as stopped. */
export async function stopRun(d: Deps, id: string, why = 'Stopped by you'): Promise<RunRecord> {
  const r = getRun(d.db, id);
  if (!r) throw new HttpError(404, 'There is no such run');
  if (!ACTIVE.includes(r.status)) return r;
  if (r.remote) {
    const m = remoteMachine(r.remote.machine);
    if (!m) throw new HttpError(502, 'Its machine is no longer in Settings → Machines');
    const there = await m.call<{ run: RemoteRun }>('POST', `/api/experiments/runs/${r.remote.id}/stop`, 20_000, {});
    copyRemote(d, r, there.run);
    return getRun(d.db, id)!;
  }
  const place = placeOf(r.where);
  if (r.status === 'queued' || (r.status === 'waiting' && !(place.kind === 'cluster' && r.clusterJob))) {
    updateRun(d.db, id, { status: 'stopped', why, endedAt: Date.now() });
    addEvent(d.db, id, { kind: 'stopped', text: why });
    tellRuns(d, [id]);
    ended.emit('ended', id);
    void ending(d, getRun(d.db, id)!, true);
    return getRun(d.db, id)!;
  }
  updateRun(d.db, id, { info: { stopping: why } });
  addEvent(d.db, id, { kind: 'note', text: `Stopping: ${why}` });
  if (place.kind === 'cluster') {
    const c = getCluster(d.db, place.id);
    if (c?.kind === 'slurm' && r.clusterJob) await runSsh(c.host, `scancel ${r.clusterJob}`, { timeoutMs: 30_000 });
    else if (c && r.remoteDir) {
      const pid = `$(cat ${q(`${r.remoteDir}/pid`)} 2>/dev/null)`;
      await runSsh(c.host, `p=${pid}; [ -n "$p" ] && { kill -INT -- -$p 2>/dev/null; nohup sh -c "sleep 10; kill -TERM -- -$p 2>/dev/null; sleep 10; kill -KILL -- -$p 2>/dev/null" >/dev/null 2>&1 & }`, { timeoutMs: 30_000 });
    }
  } else await stopLocal(r.id, r.folder ?? runFolder(r.id));
  tellRuns(d, [id]);
  wake();
  return getRun(d.db, id)!;
}

// ---- clusters ---------------------------------------------------------------------------------------------------------

/** A shell in the job's folder on a cluster. */
const clusterShell =
  (host: string, cwd: string): Shell =>
  async (script, o = {}) => {
    const env = Object.entries(o.env ?? {})
      .map(([k, v]) => `${k}=${q(v)}`)
      .join(' ');
    const r = await runSsh(host, `cd ${rq(cwd)} 2>/dev/null || exit 3; ${env ? `export ${env}; ` : ''}${script}`, { timeoutMs: o.timeoutMs ?? 30_000 });
    return { code: r.code, out: r.out };
  };

/** Sends a run to its cluster: its folder there, its record, then sbatch (SLURM) or tmux (plain SSH, once GPUs are free). */
async function submitCluster(d: Deps, r: RunRecord, c: NonNullable<ReturnType<typeof getCluster>>) {
  busy.add(r.id);
  try {
    const mk = await runSsh(c.host, `mkdir -p ${rq(remoteDir(c, r.id))} && cd ${rq(remoteDir(c, r.id))} && pwd`, { timeoutMs: 45_000 });
    if (mk.code !== 0) return setWaiting(d, r, `Waiting: could not reach ${c.name} just now (${sshWhy(mk)}); trying again`);
    const dir = mk.out.trim().split('\n').pop()!;
    const env = runEnv(r, dir, null);
    if (c.kind === 'ssh' && r.gpus) {
      // GPUs there, chosen as here: free enough, and not held by your other runs there.
      const reading = await gpusVia(async (cmd, args) => {
        const x = await runSsh(c.host, [cmd, ...args.map(q)].join(' '), { timeoutMs: 30_000 });
        return { out: x.out, code: x.code === 0 ? null : x.code };
      });
      if (!reading.gpus.length) return fail(d, r, `${c.name} has no NVIDIA GPU that nvidia-smi can see`);
      const held = new Set(listRuns(d.db, { status: ['starting', 'running'], limit: 5000 }).filter((x) => x.where === r.where && x.id !== r.id).flatMap((x) => x.gpuIds ?? []));
      const pick = chooseGpus(reading.gpus, r.gpus, r.gpuMemGb, held);
      if ('why' in pick) return setWaiting(d, r, `${pick.why} (on ${c.name})`);
      env.CUDA_VISIBLE_DEVICES = pick.ids.join(',');
      updateRun(d.db, r.id, { info: { gpuIds: pick.ids } });
    }
    const sh = clusterShell(c.host, r.cwd || dir);
    const git = r.cwd ? await captureGit(sh).catch(() => ({}) as Awaited<ReturnType<typeof captureGit>>) : {};
    const folder = runFolder(r.id);
    fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
    const info: Partial<RunInfo> = { host: c.host, remoteDir: dir, folder, logPath: files(folder).log, commit: git.commit, branch: git.branch, dirty: git.dirty, untracked: git.untracked };
    if (git.patch) {
      fs.writeFileSync(files(folder).patch, git.patch, { mode: 0o600 });
      info.patchPath = files(folder).patch;
    }
    const put = await runSsh(c.host, `cat > ${q(`${dir}/command.sh`)}`, { input: `${r.command}\n`, timeoutMs: 30_000 });
    if (put.code !== 0) return setWaiting(d, r, `Waiting: could not write to ${c.name} (${sshWhy(put)}); trying again`);
    if (c.kind === 'slurm') {
      const script = sbatchScript({ run: r, cluster: c, dir, cwd: r.cwd || undefined, env });
      const sb = await runSsh(c.host, `cat > ${q(`${dir}/job.sbatch`)} && sbatch --parsable ${q(`${dir}/job.sbatch`)}`, { input: script, timeoutMs: 60_000 });
      const job = parseSbatch(sb.out);
      if (!job) return fail(d, r, `sbatch did not take it: ${(sb.err || sb.out).trim().split('\n').pop() || `exit code ${sb.code}`}`);
      updateRun(d.db, r.id, { status: 'waiting', why: 'In the cluster’s queue', info: { ...info, clusterJob: job } });
      addEvent(d.db, r.id, { kind: 'waiting', text: `Submitted to ${c.name} as job ${job}` });
    } else {
      const wrapper = wrapperScript({ id: r.id, folder: dir, cwd: r.cwd || dir, env });
      const go = await runSsh(
        c.host,
        `cat > ${q(`${dir}/run.sh`)} && rm -f ${q(`${dir}/exit`)} && if command -v tmux >/dev/null; then tmux new-session -d -s x${r.id} ${q(`bash ${q(`${dir}/run.sh`)}`)}; else nohup setsid bash ${q(`${dir}/run.sh`)} >/dev/null 2>&1 & fi`,
        { input: wrapper, timeoutMs: 45_000 },
      );
      if (go.code !== 0) return fail(d, r, `It could not start on ${c.name}: ${sshWhy(go)}`);
      updateRun(d.db, r.id, { status: 'running', why: null, startedAt: Date.now(), info: { ...info, outputAt: Date.now() } });
      addEvent(d.db, r.id, { kind: 'started', text: `Started on ${c.name}${env.CUDA_VISIBLE_DEVICES ? `, ${gpuList(env.CUDA_VISIBLE_DEVICES.split(',').map(Number))}` : ''}` });
    }
    void captureEnvironment(sh, { command: r.command, cwd: r.cwd, pathDirs: null, gpus: !!r.gpus, host: c.host })
      .then((environment) => updateRun(d.db, r.id, { info: { environment } }))
      .catch(() => {});
  } finally {
    busy.delete(r.id);
    tellRuns(d, [r.id]);
  }
}

async function followCluster(d: Deps, r: RunRecord) {
  const p = placeOf(r.where);
  const c = p.kind === 'cluster' ? getCluster(d.db, p.id) : null;
  if (!c) return fail(d, r, 'Its cluster is no longer in Where runs go');
  const L = liveOf(d, r);
  const now = Date.now();
  const started = !!r.clusterJob || (c.kind === 'ssh' && r.status === 'running');
  if (!started) {
    if (now - L.polledAt < (r.status === 'queued' ? 0 : timing.cluster)) return;
    L.polledAt = now;
    return submitCluster(d, r, c);
  }
  if (now - L.polledAt < timing.cluster) return;
  L.polledAt = now;
  const dir = r.remoteDir!;
  let state: { ended: false; status: 'waiting' | 'running'; why?: string } | { ended: true; code: number | null; slurm?: ReturnType<typeof endOfSlurm> };
  if (c.kind === 'slurm') {
    const s = await runSsh(c.host, `squeue -h -j ${r.clusterJob} -o '%i|%T|%r|%M|%N' 2>/dev/null; echo @@; cat ${q(`${dir}/exit`)} 2>/dev/null; echo @@; sacct -j ${r.clusterJob} --format=State,ExitCode,Elapsed -P -n 2>/dev/null | head -n 3`, { timeoutMs: 45_000 });
    if (s.code !== 0) return setWhy(d, r, `Could not reach ${c.name} just now (${sshWhy(s)}); trying again`);
    const [sq, ex, sa] = s.out.split('@@\n');
    const inQueue = parseSqueue(sq ?? '').get(r.clusterJob!);
    const code = /^-?\d+$/.test((ex ?? '').trim()) ? Number(ex.trim()) : null;
    const acct = parseSacct(sa ?? '');
    if (inQueue && !slurmEnded(inQueue.state)) state = /^PENDING/i.test(inQueue.state) ? { ended: false, status: 'waiting', why: `In the cluster’s queue: ${reasonWords(inQueue.reason)}` } : { ended: false, status: 'running' };
    else if (code !== null) state = { ended: true, code };
    else if (acct && slurmEnded(acct.state)) state = { ended: true, code: acct.exitCode ?? null, slurm: endOfSlurm(acct) };
    else if (acct) state = { ended: false, status: /^PENDING/i.test(acct.state) ? 'waiting' : 'running' };
    else state = { ended: true, code: null };
  } else {
    const s = await runSsh(c.host, `cat ${q(`${dir}/exit`)} 2>/dev/null; echo @@; p=$(cat ${q(`${dir}/pid`)} 2>/dev/null); [ -n "$p" ] && kill -0 $p 2>/dev/null && echo ALIVE`, { timeoutMs: 45_000 });
    if (s.code !== 0) return setWhy(d, r, `Could not reach ${c.name} just now (${sshWhy(s)}); trying again`);
    const [ex, alive] = s.out.split('@@\n');
    const code = /^-?\d+$/.test((ex ?? '').trim()) ? Number(ex.trim()) : null;
    state = code !== null ? { ended: true, code } : alive?.includes('ALIVE') ? { ended: false, status: 'running' } : { ended: true, code: null };
  }
  // Its log, from where the last look stopped, copied here as it comes.
  const tail = await runSsh(c.host, `tail -c +${L.log + 1} ${q(`${dir}/log.txt`)} 2>/dev/null | head -c ${state.ended ? 8 << 20 : 1 << 20} | base64 | tr -d '\\n'`, { timeoutMs: 60_000 });
  if (tail.code === 0 && tail.out.trim()) {
    const buf = Buffer.from(tail.out.trim(), 'base64');
    let end = buf.length;
    // A UTF-8 character cut at the end waits for the next look.
    for (let k = 1; k <= 3 && end - k >= 0; k++) {
      const b = buf[end - k];
      if ((b & 0xc0) === 0x80) continue;
      if (b >= 0xc0 && k < (b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : 2)) end -= k;
      break;
    }
    const chunk = buf.subarray(0, end);
    try {
      fs.mkdirSync(r.folder ?? runFolder(r.id), { recursive: true });
      fs.appendFileSync(files(r.folder ?? runFolder(r.id)).log, chunk);
    } catch {}
    L.log += chunk.length;
    consume(L, chunk.toString('utf8'), 'log');
  }
  if (!state.ended) {
    if (state.status === 'running' && r.status !== 'running') {
      updateRun(d.db, r.id, { status: 'running', why: null, startedAt: Date.now() });
      addEvent(d.db, r.id, { kind: 'started', text: `Running on ${c.name}` });
      L.outputAt = Date.now();
    } else if (state.status === 'waiting' && state.why && state.why !== r.why) setWhy(d, r, state.why);
    if (state.status === 'running') await watch(d, getRun(d.db, r.id)!, L);
    return save(d, r, L);
  }
  if (state.slurm && state.code === null) {
    const s = state.slurm;
    if (s.status === 'stopped' && !getRun(d.db, r.id)?.stopping) updateRun(d.db, r.id, { info: { stopping: s.why ?? 'Cancelled' } });
    return finish(d, getRun(d.db, r.id)!, L, s.status === 'done' ? 0 : 1, { why: s.why, oom: /memory/.test(s.why ?? '') });
  }
  return finish(d, getRun(d.db, r.id)!, L, state.code, state.code === null ? { missing: `It is no longer in ${c.name}’s queue and left no exit code` } : {});
}

function setWhy(d: Deps, r: RunRecord, why: string) {
  if (r.why === why) return;
  updateRun(d.db, r.id, { why });
  tellRuns(d, [r.id]);
}

// ---- other machines -------------------------------------------------------------------------------------------------

/** Copies what another machine says of a run it keeps into the copy here; tells you of its end the way the job asked. */
function copyRemote(d: Deps, r: RunRecord, there: RemoteRun) {
  const info: Partial<RunInfo> = {};
  for (const k of ['host', 'gpuIds', 'exitCode', 'commit', 'branch', 'dirty', 'untracked', 'environment', 'outputAt', 'scores', 'stopping'] as const) (info as Record<string, unknown>)[k] = there[k];
  updateRun(d.db, r.id, { status: there.status, why: there.why ?? null, ...(there.startedAt ? { startedAt: there.startedAt } : {}), ...(there.endedAt ? { endedAt: there.endedAt } : {}), info, ...(there.metrics ? { metrics: there.metrics } : {}) });
  if (there.status !== r.status) {
    tellRuns(d, [r.id]);
    if (!ACTIVE.includes(there.status)) {
      ended.emit('ended', r.id);
      void ending(d, getRun(d.db, r.id)!, true);
    }
  }
}

async function followRemote(d: Deps, r: RunRecord) {
  const L = liveOf(d, r);
  if (Date.now() - L.polledAt < timing.remote) return;
  L.polledAt = Date.now();
  const m = remoteMachine(r.remote!.machine);
  if (!m) return setWhy(d, r, 'Its machine is no longer in Settings → Machines');
  try {
    const there = await m.call<{ run: RemoteRun }>('GET', `/api/experiments/runs/${r.remote!.id}?log=0`, 10_000);
    copyRemote(d, r, there.run);
  } catch (e) {
    setWhy(d, r, `${m.name} did not answer just now (${(e as Error).message})`);
  }
}

// ---- the pages hear of changes ---------------------------------------------------------------------------------------

const pending = new Set<string>();
let tellTimer: NodeJS.Timeout | null = null;

/** Tells the open pages which runs changed (gathered for a moment, so a burst is one message). */
export function tellRuns(d: Deps, ids: string[]) {
  for (const id of ids) pending.add(id);
  tellTimer ??= setTimeout(() => {
    tellTimer = null;
    const runs = [...pending];
    pending.clear();
    if (runs.length) d.broadcast({ t: 'feature', id: 'experiments', data: { runs } });
  }, 250);
}

// ---- after a restart, and the queue now ----------------------------------------------------------------------------------

/** On start-up: the runs that were going are found again (the loop sees whether each still runs). */
export function resume(d: Deps) {
  useDeps(d);
  if (listRuns(d.db, { status: ACTIVE, limit: 1 }).length) wake();
}

/** The queue now: how many run and wait, this computer's GPUs (and which run holds each), the jobs without a GPU. */
export async function queueNow(d: Deps): Promise<QueueNow> {
  const runs = listRuns(d.db, { status: ACTIVE, limit: 5000 });
  const here = runs.filter((r) => !r.remote && placeOf(r.where).kind === 'local');
  const going = here.filter((r) => r.status === 'starting' || r.status === 'running');
  const reading = await readGpus().catch((): GpuReading => ({ gpus: [], error: 'failed' }));
  const holder = new Map(going.flatMap((r) => (r.gpuIds ?? []).map((g) => [g, r.id] as const)));
  return {
    running: runs.filter((r) => r.status === 'running' || r.status === 'starting').length,
    waiting: runs.filter((r) => r.status === 'queued' || r.status === 'waiting').length,
    gpus: reading.gpus.map((g) => (holder.has(g.index) ? { ...g, run: holder.get(g.index) } : g)),
    ...(reading.error === 'missing' ? { gpuNote: 'No NVIDIA GPU here' } : reading.error === 'failed' ? { gpuNote: 'The GPUs could not be read just now' } : {}),
    cpuRunning: going.filter((r) => !r.gpus).length,
    cpuSlots: settingsOf(d.db).cpuSlots,
  };
}

/** A run's series: live while it runs here, else as kept. */
export function seriesNow(d: Deps, id: string) {
  return live.get(id)?.tracker.series ?? seriesOf(d.db, id);
}

/** The clusters, for the tools' descriptions: "c:unity (Unity, SLURM)". */
export function placesLine(db: DB): string {
  const cs = listClusters(db).map((c) => `"c:${c.id}" (${c.name}, ${c.kind === 'slurm' ? 'SLURM' : 'SSH'})`);
  return cs.join(', ');
}

// ---- waiting for runs (app steps) ---------------------------------------------------------------------------------------

export interface WaitFor {
  ids?: string[];
  group?: string;
  tag?: string;
}

function chosen(db: DB, w: WaitFor): RunRecord[] {
  if (w.ids?.length) return w.ids.map((id) => getRun(db, id)).filter((r): r is RunRecord => !!r);
  return listRuns(db, { group: w.group, tag: w.tag, limit: 2000 });
}

/**
 * Waits until the runs have all ended, or the hours are up, holding nothing meanwhile. `key` keeps when the wait
 * began, so a step run again after a restart waits only for what is left.
 */
export async function waitRuns(d: Deps, w: WaitFor, o: { hours: number; key: string; signal?: AbortSignal }): Promise<{ runs: RunRecord[]; ended: boolean }> {
  const began = waitStarted(d.db, o.key);
  const deadline = began + o.hours * 3_600_000;
  for (;;) {
    const runs = chosen(d.db, w);
    const open = runs.filter((r) => ACTIVE.includes(r.status));
    if (!open.length || Date.now() >= deadline) {
      waitDone(d.db, o.key);
      return { runs, ended: !open.length };
    }
    if (o.signal?.aborted) throw new Error('Stopped');
    wake();
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(t);
        ended.off('ended', onEnd);
        o.signal?.removeEventListener('abort', done);
        resolve();
      };
      const onEnd = (id: string) => open.some((r) => r.id === id) && done();
      const t = setTimeout(done, Math.min(60_000, Math.max(1000, deadline - Date.now())));
      ended.on('ended', onEnd);
      o.signal?.addEventListener('abort', done, { once: true });
    });
  }
}

/** For the tests: the loop's memory of runs goes (as after a restart). */
export function forgetLive() {
  live.clear();
}

export type { RunEvent };
