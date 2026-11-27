// The queue: a loop (every few seconds while anything waits or runs; quiet otherwise) that starts jobs by priority
// then age when what they need is free (GPUs with enough free memory that no other run of yours holds, or with room
// beside runs of yours that said what they need; a place among the jobs without a GPU), says when a waiting one may
// start (forecast.ts) and keeps a long-waiting one from being overtaken for ever, follows the runs (their output and metrics as they grow, their end), and watches them
// for the agent on call: NaN, out of memory, a stall, a crash or a dead process, divergence. On one it notes an
// event and, as the job asked, tells you or starts an agent session with a brief. Runs on clusters go through their
// queue over SSH; runs on another machine are kept there and followed from here. When a run ends it tells you (as
// the job asked; a sweep once, at its end), and the session that started it when it asked to hear.
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ACTIVE, betterOf, GRACE, isTrialRun, trySecondsOf, tryUpWhy, type ExperimentsSettings, type JobSpec, type MetricSeries, type QueueNow, type RunEvent, type RunRecord, type SweepSpec, type WatchKind } from '../../shared/experiments.ts';
import type { Agent, NotifyEvent } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import { agentBaseEnv } from '../env.ts';
import { agentsUse, ceilingUse, holdable, holdRun, isAgentRun, reached, tellHeld } from './budget.ts';
import type { Deps } from '../features/types.ts';
import { pathDirs, WIN } from '../platform.ts';
import { startSettings } from '../startSettings.ts';
import { captureEnvironment, captureGit, keepUntracked, localShell, q, type Shell } from './capture.ts';
import { bringBack, codeReader, copyKept, differences, enough, forCopy, identityOf, keepNewlyNamed, loadManifest, makeCopy, manifestOf, NoCopy, pruneCopy, ranAs, takeCode, underGit, type CodeReader, type Manifest } from './code.ts';
import { endOfSlurm, getCluster, guessWords, hoursSaid, listClusters, parseSbatch, parseSqueue, reasonWords, remoteDir, rq, runSsh, sacctState, sbatchScript, slurmEnded, slurmTells, slurmTime, sshWhy, testOnly } from './clusters.ts';
import { describeAfterSubmit } from './describe.ts';
import { stampRun } from './evaluations.ts';
import { KILLED_WHY, memoryNearLimit, oomWords, scanLog } from './failures.ts';
import { askOf, chooseGpus, gpuList, gpusVia, othersOn, readGpus, roomOn, type GpuReading, type Others } from './gpus.ts';
import { endsBy, estimateWords, forecast, freeBy, gpuCountWords, NEXT_AFTER_MS, TELL_AFTER_MS, waitedWords, whenWords, type Ending, type Forecast, type GpuState, type Holder, type Want } from './forecast.ts';
import { projectFor } from './project.ts';
import { endUsage, sampleRuns, startUsage } from './usage.ts';
import { aliveLocal, exitOf, files, startLocal, stopLocal, wrapperScript } from './local.ts';
import { nanText, oomText, parseLine, readFrom, tailLines, Tracker } from './metrics.ts';
import { clock, clockTime, endedAtNight, isNightAgain, morningDue, NIGHT_AGAIN, NIGHT_BEHIND, NIGHT_CARRY, NIGHT_CLUSTER, nightAt, nightWhy, nightZone, watchNight } from './night.ts';
import { addEvent, eventsOf, eventsSince, getInfo, getRun, getSweep, insertRun, isScoringRun, listRuns, listSweeps, listTables, newId, offsetsOf, ranIn, resetRun, runFolder, saveSeries, seriesOf, specOf, updateRun, waitDone, waitStarted, type RunInfo } from './records.ts';
import { repairRecord, repairRecordSoon } from './repair.ts';
import { remoteMachine, type RemoteRun } from './remote.ts';
import { fmt, spread, tellEnded } from './notices.ts';
import { earlyStop, fillCommand, paramsOf, runFile, settingsLine, type Value } from './sweeps.ts';
import { keyNumbers } from '../../shared/metric-rank.ts';
import { defaultProgram } from '../agents/programs.ts';

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

/** Jobs without a GPU at once, unless set: half the processor's cores, from 1 to 16. */
export const defaultSlots = (cores = os.cpus().length) => Math.max(1, Math.min(16, Math.floor(cores / 2)));

/** The settings as saved: only those that were set, so a default that depends on the computer stays one. */
function savedSettings(db: DB): Partial<ExperimentsSettings> {
  try {
    return JSON.parse(kvGet(db, 'experiments_settings') ?? '{}') ?? {};
  } catch {
    return {};
  }
}

export function settingsOf(db: DB): ExperimentsSettings {
  const s = savedSettings(db);
  const n = Number(s.cpuSlots);
  return {
    cpuSlots: Number.isInteger(n) && n >= 1 && n <= 64 ? n : defaultSlots(),
    nightFrom: clockTime(s.nightFrom) ?? '23:00',
    nightTo: clockTime(s.nightTo) ?? '07:00',
    nightEnds: s.nightEnds === 'stop' ? 'stop' : 'finish',
    shareGpus: s.shareGpus !== false,
    agentGpuHours: typeof s.agentGpuHours === 'number' && s.agentGpuHours >= 0 ? s.agentGpuHours : null,
  };
}

export function setSettings(db: DB, b: Partial<ExperimentsSettings>): ExperimentsSettings {
  const given: Partial<ExperimentsSettings> = {};
  if (b.cpuSlots !== undefined) {
    const n = Math.round(Number(b.cpuSlots));
    if (!Number.isInteger(n) || n < 1 || n > 64) throw new HttpError(400, 'Jobs without a GPU at once: a number from 1 to 64');
    given.cpuSlots = n;
  }
  for (const [k, what, like] of [
    ['nightFrom', 'Night from', '23:00'],
    ['nightTo', 'Night to', '07:00'],
  ] as const) {
    if (b[k] === undefined) continue;
    const t = clockTime(b[k]);
    if (!t) throw new HttpError(400, `${what}: a time on the 24-hour clock, like ${like}`);
    given[k] = t;
  }
  if (b.nightEnds !== undefined) {
    if (b.nightEnds !== 'finish' && b.nightEnds !== 'stop') throw new HttpError(400, 'When the night ends: "finish" (let running ones finish) or "stop" (stop them and start them again the next night)');
    given.nightEnds = b.nightEnds;
  }
  if (b.shareGpus !== undefined) {
    if (typeof b.shareGpus !== 'boolean') throw new HttpError(400, 'Runs share a GPU when their memory fits: true or false');
    given.shareGpus = b.shareGpus;
  }
  if (b.agentGpuHours !== undefined) given.agentGpuHours = agentLimit(b.agentGpuHours);
  if (!Object.keys(given).length) throw new HttpError(400, 'Say what to change: cpuSlots, nightFrom, nightTo, nightEnds, shareGpus or agentGpuHours');
  kvSet(db, 'experiments_settings', JSON.stringify({ ...savedSettings(db), ...given }));
  wake();
  return settingsOf(db);
}

/** The ceiling on agents' GPU hours as given: a number, or null (or nothing) for no limit. */
function agentLimit(v: unknown): number | null {
  if (v === null || v === '') return null;
  const n = typeof v === 'number' || typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) throw new HttpError(400, 'Agents’ runs in seven days: a number of GPU hours from 0, or nothing for no limit');
  return Math.round(n * 100) / 100;
}

// ---- where a run goes ------------------------------------------------------------------------------------------

export type Place = { kind: 'local' } | { kind: 'cluster'; id: string } | { kind: 'machine'; id: string };

export function placeOf(where: string | undefined): Place {
  const w = (where ?? 'local').trim();
  if (w.startsWith('c:')) return { kind: 'cluster', id: w.slice(2) };
  if (w.startsWith('m:')) return { kind: 'machine', id: w.slice(2) };
  return { kind: 'local' };
}

/** Where a run is, in words for agents: "local (this computer: box), GPU 0" ("local" as the tools call this computer), "Unity", "Lab box". */
export function whereWords(db: DB, r: RunRecord): string {
  const p = placeOf(r.where);
  if (p.kind === 'cluster') return getCluster(db, p.id)?.name ?? p.id;
  if (p.kind === 'machine') return r.machine?.name ?? remoteMachine(p.id)?.name ?? p.id;
  return `local (this computer: ${r.host ?? os.hostname()})${r.gpuIds?.length ? `, ${gpuList(r.gpuIds)}` : ''}`;
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
  // night: it waits for the night of the computer it runs on. "now" is the ordinary way (to run a night run again by day).
  const when = str(b.when, 20);
  if (when && when !== 'night' && when !== 'now') throw new HttpError(400, 'when: "night" for a run that waits for the night, or leave it out');
  if (when === 'night') {
    if (place.kind === 'cluster') throw new HttpError(400, NIGHT_CLUSTER);
    spec.when = 'night';
  }
  // Which code runs when the folder changes while it waits: as queued unless said otherwise.
  const code = str(b.code, 20);
  if (code && code !== 'queued' && code !== 'now') throw new HttpError(400, 'code: "queued" (the code as it is now, even if files change while it waits; the default) or "now" (the folder as it is when it starts)');
  if (code === 'now') spec.code = 'now';
  const name = str(b.name, 120);
  if (name) spec.name = name;
  const group = str(b.group, 120);
  if (group) spec.group = group;
  const gpus = num(b.gpus, 0, 16, 'GPUs');
  spec.gpus = gpus !== undefined ? Math.round(gpus) : place.kind === 'local' ? ((await hasGpus()) ? 1 : 0) : 0;
  const mem = num(b.gpuMemGb, 0, 1024, 'Free memory per GPU (GB)');
  if (mem) spec.gpuMemGb = mem;
  if (b.alone === true) spec.alone = true;
  const cpus = num(b.cpus, 1, 1024, 'Processors');
  if (cpus) spec.cpus = Math.round(cpus);
  const memGb = num(b.memGb, 0, 100_000, 'Memory (GB)');
  if (memGb) spec.memGb = memGb;
  const hours = num(b.hours, 0, 24 * 60, 'Hours');
  if (hours) spec.hours = hours;
  const grace = num(b.grace, GRACE.min, GRACE.max, 'Seconds of warning before a stop');
  if (grace !== undefined) spec.grace = Math.round(grace);
  if (typeof b.resume === 'string' && b.resume.trim().length > 20_000) throw new HttpError(400, 'The command to carry on is at most 20,000 characters: put a long script in a file and run that');
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
    for (const [k, v] of Object.entries(b.params as Record<string, unknown>).slice(0, 100))
      if (/^[\w.@/-]{1,80}$/.test(k) && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) given[k] = typeof v === 'string' ? v.slice(0, 500) : v;
  const seed = num(b.seed, -(2 ** 31), 2 ** 32, 'Seed');
  if (seed !== undefined) spec.seed = Math.round(seed);
  // {name} placeholders filled from the settings and the seed: the record keeps the command as it runs.
  spec.command = fillCommand(command, { ...given, ...(spec.seed !== undefined ? { seed: spec.seed } : {}) });
  const carry = typeof b.resume === 'string' ? b.resume.trim() : '';
  if (carry) spec.resume = fillCommand(carry, { ...given, ...(spec.seed !== undefined ? { seed: spec.seed } : {}) });
  // And, when it was written with {seed}, the command with that left in (or as whoever filled the seed in gives it).
  const { seed: _seed, ...others } = given;
  const template = command.includes('{seed}') ? fillCommand(command, others) : str(b.seedTemplate, 20_000);
  const params = { ...paramsOf(spec.command), ...given };
  if (Object.keys(params).length) spec.params = params;
  if (spec.seed === undefined) {
    const s = params.seed ?? params.random_seed;
    if (typeof s === 'number' && Number.isInteger(s)) spec.seed = s;
  }
  if (spec.seed !== undefined && template.includes('{seed}') && fillCommand(template, { seed: spec.seed }) === spec.command) spec.seedTemplate = template;
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
  const script =
    words
      .find((w) => /\.(py|sh|jl|r|lua|js|ts)$/i.test(w))
      ?.split('/')
      .pop() ??
    words
      .find((w) => !/^[A-Za-z_]\w*=/.test(w))
      ?.split('/')
      .pop() ??
    'run';
  return script.slice(0, 60);
}

// ---- the code, taken when it is queued -------------------------------------------------------------------------

/** Runs whose code is being read: they do not start before it is. */
const taking = new Map<string, Promise<void>>();
/** Resolves when a run's code has been read. */
export const codeTaken = (id: string): Promise<void> => taking.get(id) ?? Promise.resolve();
/** Submitting waits this long for the code to be read before it answers; reading goes on. */
const TAKE_WAIT_MS = 1500;

/** Whether a run's code is kept when it is queued: this computer's, but not a score's or a trial's. */
export const takesCode = (r: Pick<JobSpec, 'where' | 'tags' | 'env'>) => !WIN && placeOf(r.where).kind === 'local' && !isScoringRun(r) && !isTrialRun(r);

/** What a run's record says of the code kept in its folder. */
function recordOfCode(m: Manifest, folder: string): Partial<RunInfo> {
  return {
    commit: m.commit,
    branch: m.branch,
    dirty: m.dirty,
    untracked: m.untracked,
    patchPath: m.patch ? files(folder).patch : undefined,
    kept: m.kept.length ? m.kept : undefined,
    notKept: m.notKept.length ? m.notKept : undefined,
  };
}

/** Reads the code of a run just put in line, into its folder. */
function takeFor(d: Deps, id: string, spec: JobSpec, read: CodeReader): Promise<void> {
  const folder = runFolder(id);
  const p = (async () => {
    try {
      const m = await takeCode(read, spec, id, folder);
      // Deleted meanwhile: nothing of it stays.
      if (!getRun(d.db, id)) return fs.rmSync(folder, { recursive: true, force: true });
      updateRun(d.db, id, { info: { codePending: undefined, ...(m ? { queuedCode: identityOf(m), ...recordOfCode(m, folder) } : {}) } });
    } catch (e) {
      updateRun(d.db, id, { info: { codePending: undefined } });
      addEvent(d.db, id, { kind: 'note', text: `Its code could not be read when it was queued (${(e as Error).message}): it runs the folder as it is when it starts` });
    }
  })().finally(() => {
    taking.delete(id);
    tellRuns(d, [id]);
    wake();
  });
  taking.set(id, p);
  return p;
}

/**
 * Puts a job in line (or sends it to its machine); the queue takes it from there. Every way of starting a run comes
 * through here, so a run that names no project gets one here (project.ts). `projectFrom`: whose project it is, when
 * that is not the starter's and the run's folder (a score runs in a copy or for an evolution a session started).
 * `code`: reads the folder once for several runs (a sweep). `own`: the code kept of an earlier run, instead of the folder's.
 */
export async function submit(
  d: Deps,
  given: JobSpec,
  o: {
    startedBy?: RunInfo['startedBy'];
    from?: string;
    projectFrom?: { session?: string; folder?: string };
    code?: CodeReader;
    own?: { run: string; manifest: Manifest; folder: string };
    evolution?: string;
    letRun?: boolean;
    /** Its first start runs `resume`, from a checkpoint; `autoResumes`: how often the app has started the chain again. */
    carryOn?: boolean;
    autoResumes?: number;
    /** On another machine: the run there it carries on from, so that machine runs it with that run's code. */
    theirs?: string;
  } = {},
): Promise<RunRecord> {
  if (o.carryOn && !given.resume) throw new HttpError(400, 'It has no command to carry on with: give resume, or leave carrying on out');
  const carries: Partial<RunInfo> = { ...(o.carryOn ? { carriesOn: true } : {}), ...(o.autoResumes ? { autoResumes: o.autoResumes } : {}) };
  let read: Promise<void> | undefined;
  const id = newId('r');
  const place = placeOf(given.where);
  const project = projectFor(d.db, { given: given.project, session: o.projectFrom?.session ?? o.startedBy?.session, folder: o.projectFrom?.folder ?? given.cwd });
  const { project: _p, ...rest } = given;
  const spec: JobSpec = { ...rest, ...(project ? { project } : {}) };
  if (place.kind === 'machine') {
    const m = remoteMachine(place.id);
    if (!m) throw new HttpError(400, `There is no machine "${place.id}" in Settings → Machines`);
    // Kept there (its agent on call and notices are that machine's); here a copy follows it. A project is this
    // computer's: that machine gives the run one of its own.
    // An agent's run counts as one there too, under that machine's ceiling. One carried on from a run there is asked of
    // that run (Run again there), which gives it that run's code.
    const job = { ...rest, where: 'local', report: false, ...(o.startedBy && isAgentRun(o) ? { agent: true } : {}), ...(o.carryOn && o.theirs ? { carryOn: true } : {}) };
    const there = await m.call<{ run: RunRecord }>('POST', o.carryOn && o.theirs ? `/api/experiments/runs/${o.theirs}/again` : '/api/experiments/jobs', 30_000, job).catch((e) => {
      throw new HttpError(502, `${m.name} did not take it: ${(e as Error).message}`);
    });
    // A Hydor from before night runs would start it by day: it is stopped there, and said.
    if (spec.when === 'night' && there.run.when !== 'night') {
      await m.call('POST', `/api/experiments/runs/${there.run.id}/stop`, 20_000, { why: 'Stopped: this Hydor cannot keep it for the night' }).catch(() => {});
      throw new HttpError(502, `${m.name} runs an older Hydor that does not know night runs, so it was stopped there: update it, or send the run without “Tonight”`);
    }
    insertRun(d.db, {
      id,
      spec: { ...spec, name: spec.name ?? there.run.name },
      status: there.run.status,
      why: there.run.why,
      info: { remote: { machine: place.id, id: there.run.id }, ...(there.run.queuedCode ? { queuedCode: there.run.queuedCode } : {}), ...(o.startedBy ? { startedBy: o.startedBy } : {}), ...(o.from ? { from: o.from } : {}) },
    });
  } else {
    const folder = runFolder(id);
    let own: Partial<RunInfo> | undefined;
    if (o.own) {
      copyKept(o.own.manifest, o.own.folder, folder);
      own = { codeFrom: o.own.run, queuedCode: identityOf(o.own.manifest), ...recordOfCode(o.own.manifest, folder) };
    }
    const take = !o.own && takesCode(spec) && underGit(spec.cwd);
    // A score of an evolution says which one; one you let run beyond the limit on agents' GPU hours is never held.
    const evolved = { ...(o.evolution ? { evolution: o.evolution } : {}), ...(o.letRun ? { letRun: Date.now() } : {}) };
    insertRun(d.db, { id, spec: { ...spec, name: spec.name ?? nameFor(spec) }, status: 'queued', info: { folder, ...(o.startedBy ? { startedBy: o.startedBy } : {}), ...(o.from ? { from: o.from } : {}), ...own, ...(take ? { codePending: true } : {}), ...evolved, ...carries } });
    addEvent(d.db, id, { kind: 'queued', text: `In line${place.kind === 'cluster' ? ` for ${getCluster(d.db, place.id)?.name ?? place.id}` : ''}${o.own ? `, with the code of ${o.own.run}` : ''}` });
    // Before the queue can look at it: it does not start until its code is read.
    if (take) read = takeFor(d, id, spec, o.code ?? codeReader());
  }
  tellRuns(d, [id]);
  wake();
  // A new experiment (or one that has grown) gets its title and description written soon.
  describeAfterSubmit(d, spec.group);
  if (read) {
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([read, new Promise<void>((resolve) => (timer = setTimeout(resolve, TAKE_WAIT_MS)))]);
    clearTimeout(timer);
  }
  return getRun(d.db, id)!;
}

/** Runs it again, as it was or with changes. `own`: with the code it ran, not the folder's as it is now. */
export async function runAgain(d: Deps, id: string, changes: Record<string, unknown> = {}, startedBy?: RunInfo['startedBy'], o: { own?: boolean } = {}): Promise<RunRecord> {
  const r = getRun(d.db, id);
  if (!r) throw new HttpError(404, 'There is no such run');
  // A run of a score is not run again on its own: it would not count, and a final test is run from its evaluation.
  if (isScoringRun(r)) throw new HttpError(400, 'This run scored an evaluation: score it again from the evaluation');
  const base = specOf(r);
  // Carry on from its checkpoint (carryOn, or resume: true), or from the beginning; resume as words changes the command that does it.
  const { carryOn: asked, ...given } = changes;
  let carryOn = asked === true;
  if (typeof given.resume === 'boolean') {
    carryOn = given.resume;
    delete given.resume;
  }
  const job: Record<string, unknown> = { ...base, ...(r.remote ? { where: `m:${r.remote.machine}` } : {}), ...given, sweep: undefined };
  // A trial run again is the real run: without what made it a trial, and told of as any run.
  if (isTrialRun(r)) {
    job.env = Object.fromEntries(Object.entries((job.env ?? {}) as Record<string, string>).filter(([k]) => !k.startsWith('HYDOR_TRY')));
    job.tags = ((job.tags ?? []) as string[]).filter((t) => t !== 'try');
    if (!changes.notify) delete job.notify;
    if (String(job.name ?? '').startsWith('Try: ')) delete job.name;
  }
  // A training must not change code between its checkpoints: carrying on runs the code it ran, where it was kept.
  const own = !!o.own || (carryOn && keptCode(r));
  if (own) delete job.code;
  const spec = await cleanJob(d.db, job);
  if (!own) return submit(d, spec, { startedBy, from: r.id, carryOn, theirs: r.remote?.id });
  const folder = r.folder ?? runFolder(r.id);
  const manifest = !r.remote && takesCode({ where: r.where }) ? await manifestOf(r, folder) : null;
  if (!manifest) throw new HttpError(400, carryOn ? 'Its own code was not kept, so it cannot carry on with it: start over, with the folder as it is now' : 'Its own code was not kept: run it again with the folder as it is now');
  if (!takesCode(spec) || path.resolve(spec.cwd) !== path.resolve(r.cwd))
    throw new HttpError(400, carryOn ? 'Carrying on runs its own code, which belongs to its folder on this computer: leave the folder and where it runs as they were, or start over' : 'Its own code belongs to its folder on this computer: leave the folder and where it runs as they were, or run the folder as it is now');
  await enough(manifest).catch((e) => {
    throw new HttpError(400, carryOn ? `Its own code cannot be put back as it was (${(e as Error).message}), so it cannot carry on with it: start over, with the folder as it is now` : `Its own code cannot be put back as it was (${(e as Error).message}): run it again with the folder as it is now`);
  });
  return submit(d, spec, { startedBy, from: r.id, own: { run: r.id, manifest, folder }, carryOn });
}

/** How many times in a chain the app starts a run again by itself: one lost, or one the cluster preempted. */
const AUTO_AGAIN = 2;

const cutOff = (r: RunRecord) => !!r.resume && !r.remote && !isTrialRun(r) && !isScoringRun(r) && (r.autoResumes ?? 0) < AUTO_AGAIN;

/** Whether a run on this computer kept the code it ran (a git repository), so that one carrying on from it can run the same. */
const keptCode = (r: RunRecord) => !r.remote && takesCode(r) && !!(r.commit || r.queuedCode);

/**
 * A run cut off through no fault of its own that says how to carry on is started again, as a new run that names it (so
 * the two show as attempts at one thing), in line like any run, with the code it was running. It is the same person's or
 * agent's run (the limit on agents' GPU hours holds it as it would have, and one you let run beyond it stays let).
 * Its id, or null when it could not be started.
 */
async function takeUpAgain(d: Deps, r: RunRecord, why: string): Promise<string | null> {
  try {
    let own: { run: string; manifest: Manifest; folder: string } | undefined;
    if (keptCode(r)) {
      const folder = r.folder ?? runFolder(r.id);
      const manifest = await manifestOf(r, folder);
      if (!manifest) throw new Error('its code was not kept');
      await enough(manifest);
      own = { run: r.id, manifest, folder };
    }
    const { code: _folderAsItIs, ...spec } = specOf(r);
    const next = await submit(d, spec, { startedBy: r.startedBy, from: r.id, carryOn: true, autoResumes: (r.autoResumes ?? 0) + 1, own, letRun: !!r.letRun });
    updateRun(d.db, r.id, { info: { restartedAs: next.id } });
    addEvent(d.db, r.id, { kind: 'note', text: `Started again to carry on from its checkpoint, as ${next.id}` });
    addEvent(d.db, next.id, { kind: 'note', text: `Started again by the app to carry on from the checkpoint of ${r.id}: ${why}` });
    return next.id;
  } catch (e) {
    addEvent(d.db, r.id, { kind: 'note', text: `It could not be started again to carry on: ${(e as Error).message}` });
    return null;
  }
}

/** Whether its next start carries on from a checkpoint, and the command a start of it runs. */
const carriesOn = (r: Pick<RunRecord, 'resume' | 'carriesOn'>) => !!(r.carriesOn && r.resume);
const commandOf = (r: Pick<RunRecord, 'command' | 'resume' | 'carriesOn'>) => (carriesOn(r) ? r.resume! : r.command);

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
  /** New metrics the pages have not heard of. */
  fresh: boolean;
  savedAt: number;
  toldAt: number;
  when: boolean;
  goneAt: number;
  polledAt: number;
  judgedAt: number;
  /** A warned stop whose seconds were up has been made hard. */
  forced?: boolean;
  /** SLURM: one more look was taken for the accounting to catch up with a job that left the queue. */
  lagged?: boolean;
  /** SLURM: the accounting had its end while it was still COMPLETING at the last look. */
  closing?: boolean;
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

let afterPass: (() => void)[] = [];

/** Waits until the queue has looked once more (at most `ms`): what a run just put in line waits for is known then. */
export function lookedAt(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    afterPass.push(() => {
      clearTimeout(t);
      resolve();
    });
    wake();
  });
}

/**
 * Waits (at most `ms`) until a cluster run has been sent to its cluster, or could not be: what the cluster refuses, and
 * when it expects to start it, are known then.
 */
export async function sentToCluster(d: Deps, id: string, ms: number, signal?: AbortSignal): Promise<void> {
  const until = Date.now() + ms;
  for (;;) {
    const r = getRun(d.db, id);
    // (A run that waits and says why with no job yet could not reach the cluster: it is tried again later.)
    if (!r || r.status !== 'queued' || Date.now() >= until || signal?.aborted) return;
    wake();
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
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
    for (const done of afterPass.splice(0)) done();
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
  const settings = settingsOf(d.db);
  // The night's hours are the person's own (their browser's time zone), not a server's UTC.
  const night = nightAt(clock.now(), settings, nightZone(d.db));
  watchNight(d, night, active, settings);
  if (!active.length && !busy.size && !morningDue(d.db)) return sleepLoop();
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
  // What those running here use (nothing is read when none runs); not waited for.
  void sampleRuns(d.db, active);
  await startWaiting(d, night, settings);
}

function liveOf(d: Deps, r: RunRecord): Live {
  let L = live.get(r.id);
  if (!L) {
    const off = offsetsOf(d.db, r.id);
    // A record made when the first metrics to come were the ones kept is fixed once, here.
    let fixed: Tracker | null = null;
    try {
      fixed = repairRecord(d.db, r, !r.remote && placeOf(r.where).kind === 'local');
    } catch (e) {
      console.error(`[experiments] ${r.id}: its metrics could not be fixed:`, (e as Error)?.message ?? e);
    }
    L = {
      tracker: fixed ?? new Tracker(r.better, { metrics: r.metrics, series: seriesOf(d.db, r.id) }),
      log: off.log,
      file: off.file,
      carry: '',
      fileCarry: '',
      outputAt: r.outputAt ?? r.startedAt ?? Date.now(),
      fired: new Set(eventsOfThisStart(d.db, r.id).flatMap((e) => (WATCH_ALL.includes(e.kind as WatchKind) && e.kind !== 'stall' ? [e.kind as WatchKind] : []))),
      stalls: 0,
      stalled: false,
      dirty: false,
      fresh: false,
      savedAt: Date.now(),
      toldAt: 0,
      when: eventsOfThisStart(d.db, r.id).some((e) => e.kind === 'note' && e.text.startsWith('Crossed')),
      goneAt: 0,
      polledAt: 0,
      judgedAt: 0,
    };
    live.set(r.id, L);
  }
  return L;
}

/** A run's events since it last went back to wait at a night's end (all of them for any other run). */
function eventsOfThisStart(db: DB, id: string): RunEvent[] {
  const all = eventsOf(db, id);
  const back = all.map((e) => e.kind === 'waiting' && isNightAgain(e.text)).lastIndexOf(true);
  return back < 0 ? all : all.slice(back + 1);
}

/** Output as it comes: lines into metrics, and the words the agent on call watches for. */
function consume(L: Live, text: string, which: 'log' | 'file') {
  const carry = which === 'log' ? L.carry : L.fileCarry;
  const lines = (carry + text).split('\n');
  let rest = lines.pop() ?? '';
  for (const line of lines) {
    const r = parseLine(line);
    if (r && L.tracker.add(r)) L.dirty = L.fresh = true;
    if (which === 'log') {
      if (!L.oomLine && oomText(line)) L.oomLine = line.trim().slice(0, 300);
      if (!L.nanLine && nanText(line)) L.nanLine = line.trim().slice(0, 300);
    }
  }
  // A progress bar redraws itself on one line (\r) that ends only when the bar does: how far it is now is in its
  // last whole redraw, read for the progress alone (its numbers come with the finished line).
  const cr = rest.lastIndexOf('\r');
  if (cr > 0) {
    const bar = parseLine(rest.slice(rest.lastIndexOf('\r', cr - 1) + 1, cr));
    if (bar?.progress && L.tracker.add({ values: {}, progress: bar.progress })) L.dirty = L.fresh = true;
  }
  if (rest.length > 64 * 1024) rest = '';
  if (which === 'log') L.carry = rest;
  else L.fileCarry = rest;
  L.outputAt = Date.now();
}

/** The most of a run's per-example scores kept. */
const MAX_SCORES = 50 * 1024 * 1024;

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
    const file = path.resolve(ranIn(r), runFile(r, r.metricsFile, folder));
    for (let i = 0; i < (all ? 50 : 1); i++) {
      const { text, next } = readFrom(file, L.file);
      if (!text) break;
      L.file = next;
      consume(L, text, 'file');
    }
  }
}

/**
 * The metrics of a run going here, with its log and metrics file read to where they end now (the record's are written
 * every ten seconds), so that they agree with the end of its log. Any other run's are its record's.
 */
export function metricsNow(d: Deps, r: RunRecord): RunRecord['metrics'] {
  if (r.status !== 'running' || r.remote || placeOf(r.where).kind !== 'local') return r.metrics;
  const L = liveOf(d, r);
  readLocal(r, L, true);
  const now = L.tracker.snapshot();
  return r.metrics || Object.keys(now.last).length || now.progress ? now : undefined;
}

/**
 * Before a run going here is read: when it has ended meanwhile (it left its exit code), the queue is waited for to
 * close its record (at most `ms`), so that what is read says so.
 */
export async function catchUp(d: Deps, id: string, ms = 10_000): Promise<void> {
  const until = Date.now() + ms;
  for (;;) {
    const r = getRun(d.db, id);
    if (!r || r.remote || r.status !== 'running' || placeOf(r.where).kind !== 'local' || exitOf(r.folder ?? runFolder(r.id)) === null || Date.now() >= until) return;
    await lookedAt(until - Date.now());
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
  if (L.fresh && t - L.toldAt > TELL_MS) {
    L.toldAt = t;
    L.fresh = false;
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
  // Its night ended and night runs are to be stopped then: unless it has just ended, or is stopping for something else.
  if (r.nightStop && exitOf(folder) === null && !getRun(d.db, r.id)?.stopping) await stopRun(d, r.id, r.resume ? NIGHT_CARRY : NIGHT_AGAIN, { app: true });
  // Its warning's seconds are long up and it still goes (the app restarted meanwhile, so nothing else stops it hard).
  if (r.stopping && r.hardStopAt && !L.forced && Date.now() > r.hardStopAt + 12_000 && exitOf(folder) === null) {
    L.forced = true;
    await stopLocal(r.id, folder, 0);
  }
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
  if (!L.fired.has('nan') && (t.nan.length || L.nanLine))
    await fire(d, r, L, 'nan', t.nan.length ? `${t.nan.join(', ')} became ${Number.isNaN(t.last[t.nan[0]]) ? 'NaN' : 'infinite'}${t.step !== undefined ? ` at step ${t.step}` : ''}` : `NaN in its log: “${L.nanLine}”`);
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
  // A trial: how far it got is kept for its estimate, and it is stopped when its time is up. Nothing else is watched.
  if (isTrialRun(r)) {
    if (t.progress && t.progress.done !== r.tried?.last?.done) updateRun(d.db, r.id, { info: { tried: { first: r.tried?.first ?? { ...t.progress }, last: { ...t.progress } } } });
    const seconds = trySecondsOf(r);
    if (r.startedAt && now - r.startedAt >= seconds * 1000 && !r.stopping) await stopRun(d, r.id, tryUpWhy(seconds));
    return;
  }
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
  if (r.hours && r.startedAt && now - r.startedAt > r.hours * 3_600_000 && !r.stopping && keepsLimit(d, r)) await stopRun(d, r.id, `It reached its time limit of ${hoursSaid(r.hours)} h`, { app: true });
  if (r.sweep && now - L.judgedAt > 15_000 && !r.stopping) {
    L.judgedAt = now;
    const rule = getSweep(d.db, r.sweep)?.earlyStop;
    if (rule) await stopIfBehind(d, r, t.series, rule);
  }
}

/**
 * A sweep's early stop for one of its runs, judged where the sweep is kept: here, whether it runs here or on another
 * machine (whose series come as it is followed, and are kept with its copy).
 */
async function stopIfBehind(d: Deps, r: RunRecord, own: MetricSeries, rule: NonNullable<SweepSpec['earlyStop']>) {
  const others = listRuns(d.db, { sweep: r.sweep, limit: 1000 })
    .filter((x) => x.id !== r.id)
    // A copy's live tracker reads nothing: its series are the ones kept.
    .map((x) => (x.remote ? seriesOf(d.db, x.id) : (live.get(x.id)?.tracker.series ?? seriesOf(d.db, x.id))));
  const e = earlyStop(own, others, rule);
  if (e.stop) await stopRun(d, r.id, `Stopped early: ${rule.metric} was ${fmt(e.value)} at step ${e.step}, worse than the median of the other ${e.others} runs then (${fmt(e.median)})`, { app: true });
}

/** Whether the app itself keeps its time limit: here, and on a plain SSH machine (SLURM keeps its own, as --time). */
function keepsLimit(d: Deps, r: RunRecord): boolean {
  const p = placeOf(r.where);
  return p.kind === 'local' || (p.kind === 'cluster' && getCluster(d.db, p.id)?.kind === 'ssh');
}

/**
 * Something the agent on call watches for happened: an event always; then, when the job has the agent on call for
 * it, a notice or an agent session. Returns whether you heard of it (so the end's own notice is not doubled).
 */
async function fire(d: Deps, r: RunRecord, L: Live | null, kind: WatchKind, text: string): Promise<boolean> {
  L?.fired.add(kind);
  addEvent(d.db, r.id, { kind, text });
  tellRuns(d, [r.id]);
  const oc = r.onCall;
  // Whether it is a loss that is NaN: by the metric that became so, else by what its log's words say.
  if (!oc?.on) tellWrong(d, r, kind, text, !!L && (L.tracker.nan.length ? L.tracker.nan.some((k) => /loss/i.test(k)) : /loss/i.test(L.nanLine ?? '')));
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

/**
 * Without the agent on call, a NaN, a stall or a divergence in a run still going is told all the same: to the session
 * that asked to hear how it went (each once), and a stall or a NaN loss to you (one notice a run).
 */
function tellWrong(d: Deps, r: RunRecord, kind: WatchKind, text: string, lossNan: boolean) {
  if ((kind !== 'nan' && kind !== 'stall' && kind !== 'diverge') || r.status !== 'running' || isScoringRun(r) || isTrialRun(r)) return;
  // One that has just ended is told of by its end, not as still running.
  if (placeOf(r.where).kind === 'local' && !r.remote && exitOf(r.folder ?? runFolder(r.id)) !== null) return;
  const told = getRun(d.db, r.id)?.told ?? [];
  const now: string[] = [];
  if (r.report && r.startedBy?.session && !told.includes(kind)) {
    tellEnded(d, r.startedBy.session, { runs: [r.id], line: `“${r.name ?? r.id}” (${r.id}) is still running: ${text}.`, at: Date.now(), wrong: true, ...experimentOf(d.db, r.group) });
    now.push(kind);
  }
  if ((kind === 'stall' || (kind === 'nan' && lossNan)) && !told.includes('you')) {
    notice(d, r, 'waiting', `${text}. It is still running.`);
    now.push('you');
  }
  if (now.length) updateRun(d.db, r.id, { info: { told: [...told, ...now] } });
}

// ---- the agent on call -------------------------------------------------------------------------------------------

export const DEFAULT_RULES =
  'Read the log and the code. If a fix is clear and safe, run it again with experiment_run (from the last checkpoint if there is one), changing as little as possible. Never delete files or checkpoints. Then tell the user in a few lines what happened and what you did.';

const WHAT: Record<WatchKind, string> = { nan: 'NaN', oom: 'out of memory', stall: 'stalled', crash: 'crashed', diverge: 'diverging' };

/** The brief an agent on call starts with: what happened, the run's record, the end of its log, the rules. */
export function onCallBrief(d: Deps, r: RunRecord, kind: WatchKind, text: string): string {
  const log = tailLines(files(r.folder ?? runFolder(r.id)).log, 80, 64 * 1024).text.slice(-8000);
  const env = r.environment
    ? Object.entries(r.environment)
        .map(([k, v]) => `${k} ${v}`)
        .join(', ')
    : '';
  const metrics = r.metrics?.last
    ? Object.entries(r.metrics.last)
        .slice(0, 12)
        .map(([k, v]) => `${k}=${fmt(v)}`)
        .join(', ')
    : '';
  const place = placeOf(r.where);
  return [
    `[Experiments · agent on call] The run “${r.name ?? r.id}” (${r.id}) ${kind === 'crash' ? 'crashed' : kind === 'stall' ? 'stalled' : kind === 'oom' ? 'ran out of memory' : kind === 'nan' ? 'has NaN in it' : 'is diverging'}.`,
    '',
    `What happened: ${text}.`,
    `Command: ${r.command}`,
    r.resume ? `To carry on from its last checkpoint: ${r.resume} (experiment_run with again and carryOn: true runs that)` : '',
    `Folder: ${r.cwd}${place.kind === 'cluster' ? ` (on the cluster ${whereWords(d.db, r)}, reached with ssh ${getCluster(d.db, place.id)?.host ?? ''})` : ''}`,
    r.codeDir
      ? `${r.codeFrom ? 'It ran its own code, as the run it repeats ran it, from a copy, as the folder differs' : 'The folder had changed since it was queued, so it ran from a copy of the code as queued'}: ${r.codeRemoved ? 'the copy was removed when it ended' : r.codeDir} (the paths in its log are the copy’s; to run it again with experiment_run, give code "own" for what it ran or "now" for the folder as it is).`
      : '',
    r.ranAs ? `Run as: ${r.ranAs}` : '',
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
  const named = r.onCall?.agent || st.agent;
  const fallback = named ? null : await defaultProgram();
  const agentKey = named || (fallback!.acpAgent ? `acp:${fallback!.acpAgent}` : fallback!.agent);
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
export function notice(d: Deps, r: RunRecord, kind: NotifyEvent['kind'], body: string, o: { title?: string; url?: string; ownWords?: boolean } = {}) {
  const now = Date.now();
  while (sent.length && sent[0] < now - 10 * 60_000) sent.shift();
  if (sent.length >= NOTICES) {
    held++;
    heldTimer ??= setTimeout(() => {
      heldTimer = null;
      const n = held;
      held = 0;
      if (n)
        d.sessions.emit('notify', {
          key: 'experiments',
          kind: 'done',
          title: 'Experiments',
          body: `${n} more notice${n === 1 ? '' : 's'} about your runs: see Experiments`,
          agent: 'claude',
          at: Date.now(),
          url: '/experiments',
        } satisfies NotifyEvent);
    }, 10 * 60_000).unref();
    return;
  }
  sent.push(now);
  d.sessions.emit('notify', { key: `experiment:${r.id}`, kind, title: o.title ?? r.name ?? 'Experiment', body: body.slice(0, 300), agent: 'claude', at: now, url: o.url ?? `/experiments/${r.id}`, ...(o.ownWords ? { ownWords: true } : {}) } satisfies NotifyEvent);
}

const took = (r: RunRecord) => {
  if (!r.startedAt) return '';
  const m = Math.round(((r.endedAt ?? Date.now()) - r.startedAt) / 60_000);
  return m < 1 ? 'under a minute' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
};

/** The metrics a run, or its experiment, names as the ones that count: `better`, what it watches for, an early stop's, an earlier results table's. */
function namedMetrics(db: DB, r: RunRecord): string[] {
  const out = Object.keys(r.better ?? {});
  if (r.notify?.when) out.push(r.notify.when.metric);
  const stop = r.sweep ? getSweep(db, r.sweep)?.earlyStop?.metric : undefined;
  if (stop) out.push(stop);
  if (r.group) {
    for (const s of listSweeps(db, 50)) if (s.group === r.group && s.earlyStop) out.push(s.earlyStop.metric);
    for (const t of listTables(db, 30)) {
      const ofIt = t.spec.group === r.group || (!t.spec.rows?.startsWith('param:') && t.rows.some((x) => x.key === r.group));
      if (ofIt) out.push(...t.spec.columns.map((c) => c.metric));
    }
  }
  return out;
}

/** The names of a run's numbers, the ones that matter most first, `n` at most (shared/metric-rank.ts keyNumbers). */
const numbersOf = (db: DB, r: RunRecord, n?: number) => keyNumbers(Object.keys(r.metrics?.last ?? {}), { named: namedMetrics(db, r), repeated: r.metrics?.repeated, settings: Object.keys(r.params ?? {}), n });

/** The run's key numbers in a line: their last values, the best where it differs. */
export function metricsLine(db: DB, r: RunRecord, n = 6): string {
  const last = r.metrics?.last ?? {};
  return numbersOf(db, r, n)
    .map((k) => {
      const b = r.metrics?.best?.[k];
      return `${k} ${fmt(last[k])}${b !== undefined && b !== last[k] ? ` (best ${fmt(b)})` : ''}`;
    })
    .join(', ');
}

/** How a run ended, in a line. */
export function endLine(db: DB, r: RunRecord): string {
  const m = metricsLine(db, r);
  if (r.status === 'done') return `Done in ${took(r)}${m ? `: ${m}` : ''}`;
  if (r.status === 'stopped') return `${r.why ?? 'Stopped'}${m ? `. ${m}` : ''}`;
  return `${r.why ?? 'Failed'}${took(r) ? ` (after ${took(r)})` : ''}`;
}

/** How long a run took, when that is worth saying: a minute or more. */
const tookLong = (r: RunRecord) => (r.startedAt && (r.endedAt ?? Date.now()) - r.startedAt >= 60_000 ? took(r) : '');

/** The experiment a message about a run lists it under. */
const experimentOf = (db: DB, group?: string) => (group ? { group, title: getInfo(db, group)?.title } : {});

/** What the session that started a run is told of its end. */
function reportOf(db: DB, r: RunRecord) {
  const long = tookLong(r);
  const m = metricsLine(db, r);
  const how = r.status === 'done' ? `Done${long ? ` in ${long}` : ''}${m ? `: ${m}` : ''}` : endLine(db, r);
  const run = { record: r, names: numbersOf(db, r, 6), took: r.status === 'failed' || r.status === 'lost' ? took(r) : long };
  return { runs: [r.id], line: `“${r.name ?? r.id}” (${r.id}) ended. ${how}`, at: r.endedAt ?? Date.now(), ...experimentOf(db, r.group), run };
}

/** A run ended: tell you (as it asked; a sweep's runs once, when the sweep ends) and the session that asked to hear. */
async function ending(d: Deps, r: RunRecord, toldAlready: boolean) {
  // A trial answers whoever waits for it; no one else is told.
  if (isTrialRun(r)) return;
  // A night run that ends in its night is told of in the morning: no "done" notice of its own.
  const morning = endedAtNight(d.db, r);
  if (r.sweep) return sweepEnding(d, r.sweep, morning);
  const want = r.status === 'done' ? r.notify?.done !== false && !morning : r.status === 'failed' || r.status === 'lost' ? r.notify?.failed !== false : false;
  if (want && !toldAlready && !r.remote) notice(d, r, r.status === 'done' ? 'done' : 'failed', endLine(d.db, r));
  if (r.report && r.startedBy?.session) tellEnded(d, r.startedBy.session, reportOf(d.db, r));
}

/**
 * What a sweep found, in a sentence: its best setting by `metric`, its seeds averaged (a seed is no setting to pick);
 * when the runs differ only in their seeds, or all gave the same number, that instead.
 */
function bestOf(sw: ReturnType<typeof getSweep>, runs: RunRecord[], metric: string): string {
  const scored = runs.filter((x) => typeof x.metrics?.best?.[metric] === 'number');
  if (!scored.length) return '';
  const values = scored.map((x) => x.metrics!.best![metric]);
  if (values.length > 1 && values.every((v) => fmt(v) === fmt(values[0]))) return ` All ${values.length}${values.length < runs.length ? ' with a number' : ''} gave ${metric} ${fmt(values[0])}.`;
  const names = Object.keys(sw?.params ?? {});
  const own = names.filter((k) => k !== 'seed' && k !== 'random_seed');
  if (names.length && !own.length) return ` ${metric} ${spread(values)}${values.length > 1 ? ` over ${values.length} seeds` : ''}.`;
  const settings = new Map<string, RunRecord[]>();
  for (const x of scored) {
    // Runs with seeds among the sweep's values are one setting; any other run is a setting of its own.
    const key = own.length < names.length && x.params ? JSON.stringify(own.map((k) => x.params![k])) : x.id;
    settings.set(key, [...(settings.get(key) ?? []), x]);
  }
  const way = sw?.earlyStop?.better ?? betterOf(metric, runs[0].better);
  const ranked = [...settings.values()].map((xs) => ({ xs, value: xs.reduce((a, x) => a + x.metrics!.best![metric], 0) / xs.length }));
  ranked.sort((a, b) => (way === 'min' ? a.value - b.value : b.value - a.value));
  const { xs, value } = ranked[0];
  const said = xs[0].params ? settingsLine(Object.fromEntries(Object.entries(xs[0].params).filter(([k]) => own.includes(k)))) : xs[0].name;
  return ` Best ${metric} ${fmt(value)}${xs.length > 1 ? ` (mean of ${xs.length} seeds)` : ''}: ${said}.`;
}

/** A sweep's run ended: when it was the last, one notice for the sweep, with its best run. */
async function sweepEnding(d: Deps, sweep: string, morning = false) {
  // One the app took up again is counted once, as the run that took its place.
  const runs = listRuns(d.db, { sweep, limit: 1000 }).filter((x) => !x.restartedAs);
  if (!runs.length || runs.some((x) => ACTIVE.includes(x.status))) return;
  const sw = getSweep(d.db, sweep);
  const count = (s: RunRecord['status']) => runs.filter((x) => x.status === s).length;
  const early = runs.filter((x) => x.status === 'stopped' && x.why?.startsWith('Stopped early')).length;
  const parts = [`${count('done')} done`, count('failed') + count('lost') ? `${count('failed') + count('lost')} failed` : '', early ? `${early} stopped early` : '', count('stopped') - early ? `${count('stopped') - early} stopped` : ''].filter(
    Boolean,
  );
  const done = runs.find((x) => x.status === 'done');
  const metric = sw?.earlyStop?.metric ?? (done ? numbersOf(d.db, done, 1)[0] : undefined);
  const best = metric ? bestOf(sw, runs, metric) : '';
  const first = runs[runs.length - 1];
  const line = `${parts.join(', ')}.${best}`;
  // A night sweep that ends in its night (or on another machine, whose morning tells it) is only told here when some failed.
  const quiet = first.when === 'night' && (morning || !!first.remote);
  if ((first.notify?.done !== false && !quiet) || (count('failed') && first.notify?.failed !== false))
    notice(d, first, count('done') ? 'done' : 'failed', line, { title: `Sweep ${sw?.group ?? first.group ?? ''}`.trim(), url: `/experiments?sweep=${sweep}` });
  if (first.report && first.startedBy?.session)
    tellEnded(d, first.startedBy.session, {
      runs: runs.map((x) => x.id),
      line: `The sweep ${sw?.group ?? sweep} (${sweep}) ended: ${line} experiment_list with group "${sw?.group ?? first.group}" lists its runs; experiment_table compares them.`,
      at: Date.now(),
      ...experimentOf(d.db, sw?.group ?? first.group),
    });
}

// ---- the end of a run ----------------------------------------------------------------------------------------------

/** A run ended (with its exit code; null: it went missing). Its last output is read, its metrics kept, you told. */
async function finish(d: Deps, r: RunRecord, L: Live, code: number | null, o: { missing?: string; why?: string; oom?: boolean; preempted?: boolean; noExitCode?: boolean } = {}) {
  // Its log and its metrics file to their ends, a last line without a newline too, before the record is closed.
  if (placeOf(r.where).kind === 'local') readLocal(r, L, true);
  if (L.carry) consume(L, '\n', 'log');
  if (L.fileCarry) consume(L, '\n', 'file');
  // What its last output said (NaN, divergence) is noticed before its end is.
  await watchOutput(d, { ...r, status: 'done' }, L);
  await endUsage(d.db, r);
  // Where it first went wrong, read from its whole log (only when it did not end well).
  const scan = code === 0 ? null : await scanLog(files(r.folder ?? runFolder(r.id)).log);
  const cur = getRun(d.db, r.id) ?? r;
  if (stoppedHard(cur, code)) addEvent(d.db, r.id, { kind: 'note', text: `It had not left ${cur.grace ?? GRACE.default} seconds after the warning, so it was stopped hard` });
  if (isNightAgain(cur.stopping)) {
    await fromCopy(d, cur);
    return backToWaiting(d, cur, L);
  }
  const now = Date.now();
  let status: RunRecord['status'];
  let why: string | null = null;
  // Out of memory only when it was: its log says so at the end, or the kernel killed it and memory was near its limit
  // (or the log says memory ran out).
  const killed = code === 137;
  const oom = !!o.oom || (!!scan && (scan.oom || (killed && (memoryNearLimit(cur) || !!scan.oomLine))));
  if (cur.stopping) {
    status = 'stopped';
    why = cur.stopping;
  } else if (code === null) {
    status = 'lost';
    why = o.missing ?? 'Its process went missing';
  } else if (code === 0) status = 'done';
  else {
    status = 'failed';
    why = o.why ?? (oom ? oomWords(cur, scan?.oom ? scan.oomLine : undefined, killed) : killed ? KILLED_WHY : `Its command ended with exit code ${code}`);
  }
  const folder = cur.folder ?? runFolder(r.id);
  // Lost here or on a plain SSH machine (its process gone: the computer restarted, tmux died), or preempted on a cluster:
  // one that says how to carry on is started again. A SLURM job that only went missing from the accounting is not.
  const place = placeOf(r.where);
  const takeUp = cutOff(cur) && ((status === 'lost' && (place.kind === 'local' || (place.kind === 'cluster' && getCluster(d.db, place.id)?.kind === 'ssh'))) || (!!o.preempted && status === 'failed'));
  if (takeUp && o.preempted) why = 'The cluster took its place back (preempted): it was sent again to carry on from its checkpoint';
  // What it leaves in its folder: its metrics, and the per-example scores it wrote.
  let scores = false;
  if (placeOf(r.where).kind === 'local') {
    const own = path.join(folder, 'scores.jsonl');
    if (cur.scoresFile) {
      const from = path.resolve(ranIn(cur), runFile(cur, cur.scoresFile, folder));
      try {
        if (fs.statSync(from).size <= MAX_SCORES) {
          if (from !== own) fs.copyFileSync(from, own);
          scores = true;
        }
      } catch {}
    }
    // A run that writes scores.jsonl into its own folder ($HYDOR_RUN_DIR) need not name it.
    if (!scores)
      try {
        const st = fs.statSync(own);
        scores = st.isFile() && st.size > 0 && st.size <= MAX_SCORES;
      } catch {}
  }
  const leftInCopy = await fromCopy(d, cur);
  updateRun(d.db, r.id, {
    status,
    why,
    endedAt: now,
    metrics: L.tracker.snapshot(),
    logOffset: L.log,
    fileOffset: L.file,
    info: {
      // (A job SLURM ended without its command leaving a code has none to show.)
      exitCode: o.noExitCode ? undefined : code,
      outputAt: L.outputAt,
      stopping: undefined,
      nightStop: undefined,
      hardStopAt: undefined,
      ...(leftInCopy.length ? { leftInCopy: leftInCopy.slice(0, 100) } : {}),
      ...(scores ? { scores: true } : {}),
      ...((status === 'failed' || status === 'lost') && scan?.firstError ? { firstError: scan.firstError } : {}),
      ...(isTrialRun(cur) && L.tracker.progress ? { tried: { first: cur.tried?.first ?? { ...L.tracker.progress }, last: { ...L.tracker.progress } } } : {}),
    },
  });
  saveSeries(d.db, r.id, L.tracker.series);
  try {
    fs.writeFileSync(path.join(folder, 'metrics.json'), JSON.stringify({ ...L.tracker.snapshot(), series: L.tracker.series }, null, 1));
  } catch {}
  addEvent(d.db, r.id, { kind: status === 'done' ? 'done' : status === 'stopped' ? 'stopped' : 'failed', text: status === 'done' ? `Done in ${took({ ...cur, endedAt: now })}` : (why ?? status) });
  live.delete(r.id);
  const rec = getRun(d.db, r.id)!;
  // Taken up again: nothing to tell yet. The run that carries on is told of when it ends.
  if (takeUp) {
    if (await takeUpAgain(d, rec, why ?? status)) {
      tellRuns(d, [r.id]);
      ended.emit('ended', r.id);
      return;
    }
    if (o.preempted) updateRun(d.db, r.id, { why: (why = o.why ?? why) });
  }
  let told = false;
  if (status === 'failed' || status === 'lost') {
    const kind: WatchKind = oom ? 'oom' : 'crash';
    told = L.fired.has(kind) ? !!rec.onCall?.on : await fire(d, rec, null, kind, why ?? 'It failed');
  }
  await ending(d, rec, told);
  tellRuns(d, [r.id]);
  ended.emit('ended', r.id);
}

/** Whether a warned stop had to be made hard: it was still going when its seconds were up. */
function stoppedHard(r: RunRecord, code: number | null): boolean {
  if (!r.stopping || !r.hardStopAt || Date.now() < r.hardStopAt) return false;
  // On SLURM it is said when the app cancels the job (followCluster); on a plain SSH machine only its end is seen:
  // killed, or ended by a signal.
  if (r.clusterJob) return false;
  if (placeOf(r.where).kind !== 'local') return code === null || code >= 128;
  try {
    // (A file's time can lag the clock by a few milliseconds.)
    return fs.statSync(files(r.folder ?? runFolder(r.id)).exit).mtimeMs >= r.hardStopAt - 100;
  } catch {
    return true;
  }
}

/**
 * A run in a copy of its code ended: what it made there goes to its folder, where nothing is in the way, and the copy
 * is taken down to what stayed.
 */
async function fromCopy(d: Deps, r: RunRecord): Promise<string[]> {
  if (!r.codeDir || r.remote) return [];
  const folder = r.folder ?? runFolder(r.id);
  let left: string[] = [];
  try {
    left = await bringBack(folder);
    await pruneCopy(folder, left);
  } catch (e) {
    addEvent(d.db, r.id, { kind: 'note', text: `Its copy could not be tidied after it ran (${(e as Error).message}): what it made stays there` });
  }
  if (left.length) addEvent(d.db, r.id, { kind: 'note', text: `Left in its copy, as its folder has its own: ${left.slice(0, 5).join(', ')}${left.length > 5 ? ` and ${left.length - 5} more` : ''}` });
  // Nothing stayed: the record says the copy it names is no longer there.
  if (!fs.existsSync(r.codeDir)) updateRun(d.db, r.id, { info: { codeRemoved: true } });
  return left;
}

/**
 * A night run stopped because its night ended waits for the next one; its log so far is set aside. It starts from the
 * beginning, or, when it says how to carry on, from its checkpoint, keeping its curves (`L`: what was read of it as it
 * went; none for one stopped before it started). Either way it runs the code kept in its folder.
 */
function backToWaiting(d: Deps, r: RunRecord, L?: Live) {
  // The GPU hours of the start that ends here are still its own.
  if (r.startedAt) updateRun(d.db, r.id, { info: { earlierSpans: [...(r.earlierSpans ?? []), [r.startedAt, Date.now()]] } });
  const folder = r.folder ?? runFolder(r.id);
  const carry = r.stopping === NIGHT_CARRY;
  const why = carry ? NIGHT_CARRY : NIGHT_AGAIN;
  if (carry && L) {
    updateRun(d.db, r.id, { metrics: L.tracker.snapshot(), fileOffset: L.file });
    saveSeries(d.db, r.id, L.tracker.series);
  }
  const f = files(folder);
  try {
    fs.renameSync(f.log, path.join(folder, `log-before-${Date.now()}.txt`));
  } catch {}
  // Its last exit code must not be taken for the next start's.
  fs.rmSync(f.exit, { force: true });
  fs.rmSync(f.pid, { force: true });
  resetRun(d.db, r.id, why, { carry });
  addEvent(d.db, r.id, { kind: 'waiting', text: why });
  live.delete(r.id);
  tellRuns(d, [r.id]);
  wake();
}

// ---- waiting and failing ----------------------------------------------------------------------------------------

/** A run waits: why (`event`: as its events say it, without the estimate), when it may start, and since when a night run has waited. */
function setWaiting(d: Deps, r: RunRecord, why: string, o: { startsAbout?: number; waitingSince?: number; event?: string } = {}) {
  if (r.status === 'waiting' && r.why === why && r.startsAbout === o.startsAbout && r.waitingSince === o.waitingSince) return;
  updateRun(d.db, r.id, { status: 'waiting', why, info: { startsAbout: o.startsAbout, waitingSince: o.waitingSince } });
  if (r.status !== 'waiting') addEvent(d.db, r.id, { kind: 'waiting', text: o.event ?? why });
  tellRuns(d, [r.id]);
}

function fail(d: Deps, r: RunRecord, why: string) {
  updateRun(d.db, r.id, { status: 'failed', why, endedAt: Date.now(), info: { startsAbout: undefined } });
  addEvent(d.db, r.id, { kind: 'failed', text: why });
  const rec = getRun(d.db, r.id)!;
  void ending(d, rec, false);
  tellRuns(d, [r.id]);
  ended.emit('ended', r.id);
}

// ---- what waits: when it may start, and a long wait ------------------------------------------------------------

/** A run's estimate is worked out again at most this often. */
const ESTIMATE_MS = 60_000;
const estimates = new Map<string, { madeAt: number; f: Forecast }>();

/**
 * The GPUs last kept for a long-waiting run. When too few look usable for a moment (memory a run that just ended has
 * not given back yet), they stay kept this long, so nothing slips in through the gap.
 */
const lastKept = new Map<string, { at: number; gpus: Set<number> }>();
const KEEP_MS = 2 * 60_000;

/** A run this pass found has to wait: why, and for a GPU or a slot (an estimate follows) since when. */
interface Wait {
  r: RunRecord;
  why: string;
  for?: 'gpu' | 'slot';
  since?: number;
}

/** Since when a run has waited: since it was made (or since it was last held); a night run, since it first found no room in the night. */
const waitingSince = (r: RunRecord, now: number) => (r.when === 'night' ? (r.waitingSince ?? now) : Math.max(r.createdAt, r.freedAt ?? 0));

const wantOf = (r: RunRecord, since?: number): Want => ({ id: r.id, name: r.name ?? r.id, gpus: r.gpus ?? 0, gpuMemGb: r.gpuMemGb, alone: r.alone, hours: r.hours, since });

/** Writes down what each waiting run waits for, with about when it may start, and tells you of one that has waited long. */
function sayWaits(d: Deps, waits: Wait[], work: (queue: Want[]) => Map<string, Forecast>) {
  const now = clock.now();
  const tz = nightZone(d.db);
  const inLine = waits.filter((w) => w.for);
  const stale = inLine.filter((w) => now - (estimates.get(w.r.id)?.madeAt ?? -Infinity) >= ESTIMATE_MS);
  if (stale.length) {
    const all = work(inLine.map((w) => wantOf(w.r, w.for === 'gpu' ? w.since : undefined)));
    for (const w of stale) estimates.set(w.r.id, { madeAt: now, f: all.get(w.r.id) ?? {} });
  }
  const waiting = new Set(inLine.map((w) => w.r.id));
  for (const id of estimates.keys()) if (!waiting.has(id)) estimates.delete(id);
  for (const id of lastKept.keys()) if (!waiting.has(id)) lastKept.delete(id);
  for (const w of waits) {
    // It may have been stopped while this pass was starting others.
    const r = getRun(d.db, w.r.id);
    if (!r || (r.status !== 'queued' && r.status !== 'waiting')) continue;
    const f = w.for ? estimates.get(r.id)?.f : undefined;
    setWaiting(d, r, `${w.why}${estimateWords(f, now, tz)}`, { startsAbout: f?.at, waitingSince: r.when === 'night' && w.for ? w.since : undefined, event: w.why });
    if (w.since !== undefined && now - w.since >= TELL_AFTER_MS && !r.waitTold) {
      // A sweep tells of its long wait once, not once for each of its runs.
      const told = !!r.sweep && listRuns(d.db, { sweep: r.sweep, limit: 1000 }).some((x) => x.waitTold);
      updateRun(d.db, r.id, { info: { waitTold: true } });
      if (told) continue;
      const what = r.gpus ? gpuCountWords(r.gpus) : 'a place among the runs without a GPU';
      notice(d, r, 'waiting', `“${r.name ?? r.id}” has waited ${Math.floor((now - w.since) / 3_600_000)} hours for ${what}`, { ownWords: true });
    }
  }
}

// ---- starting runs ------------------------------------------------------------------------------------------------

/**
 * The runs here that wait: each takes what it needs while it is free, by priority then age. Night runs come after all
 * the others, whatever their priorities: they start only in the night (`night`) and while no other run waits. A run
 * that has waited long for GPUs keeps them from those behind it, unless they are sure to be gone before it could start.
 */
async function startWaiting(d: Deps, night: string | null, settings: ExperimentsSettings) {
  const all = listRuns(d.db, { status: ['queued', 'waiting', 'starting', 'running'], limit: 5000, oldest: true }).filter((r) => !r.remote && placeOf(r.where).kind === 'local');
  // A run whose code is still to be read waits for it (after a restart it is read now).
  for (const r of all) if (r.codePending && !taking.has(r.id) && (r.status === 'queued' || r.status === 'waiting')) void takeFor(d, r.id, r, codeReader());
  const waiting = all.filter((r) => (r.status === 'queued' || r.status === 'waiting') && !busy.has(r.id) && !taking.has(r.id));
  if (!waiting.length) return estimates.clear();
  const last = (r: RunRecord) => (r.when === 'night' ? 1 : 0);
  waiting.sort((a, b) => last(a) - last(b) || (b.priority ?? 0) - (a.priority ?? 0) || a.createdAt - b.createdAt);
  const going = all.filter((r) => r.status === 'starting' || r.status === 'running' || busy.has(r.id));
  const now = clock.now();
  const sharing = settings.shareGpus;
  // Your runs on each GPU, and those without one, each with when it should end.
  const on = new Map<number, Holder[]>();
  const cpu: Ending[] = [];
  const takes = (r: RunRecord, ids: number[], { end, atLimit }: { end: number; atLimit: boolean }) => {
    for (const i of ids) on.set(i, [...(on.get(i) ?? []), { id: r.id, ask: askOf(r), end, atLimit, name: r.name ?? r.id }]);
    if (!r.gpus) cpu.push({ end, atLimit, name: r.name ?? r.id });
  };
  for (const r of going) takes(r, r.gpuIds ?? [], endsBy(r, now));
  const onAtFirst = new Map(on);
  const goingIds = new Set(going.map((r) => r.id));
  const endIfStarted = (r: RunRecord) => (r.hours ? now + r.hours * 3_600_000 : Infinity);
  const started = (r: RunRecord) => ({ end: endIfStarted(r), atLimit: !!r.hours });
  const slots = settings.cpuSlots;
  let free = slots - going.filter((r) => !r.gpus).length;
  let reading: GpuReading | null = null;
  // What other programs hold on the GPUs, looked at when a run has to wait for one.
  let others: Map<number, Others> | null = null;
  const states = (): GpuState[] => (reading?.gpus ?? []).map((g) => ({ gpu: g, others: others?.get(g.index)?.mem ?? 0, on: on.get(g.index) ?? [] }));
  // GPUs kept for runs that have waited long for them, and by when each of those could have its own.
  const kept: { r: RunRecord; gpus: Set<number>; at: number }[] = [];
  const waits: Wait[] = [];
  // An ordinary run that waits holds back the night runs that want what it wants: a GPU, or a processor slot. (One
  // stuck waiting for a GPU that never frees does not keep a night run that needs none from starting.)
  const othersWait = { gpu: false, cpu: false };
  const wait = (r: RunRecord, why: string, forWhat?: Wait['for']) => {
    waits.push({ r, why, ...(forWhat ? { for: forWhat, since: waitingSince(r, now) } : {}) });
    if (r.when !== 'night') othersWait[r.gpus ? 'gpu' : 'cpu'] = true;
  };
  const seen = new Set(waiting.map((r) => r.id));
  // At the ceiling on agents' GPU hours, their runs are held: they wait for you, not for a GPU, and hold nobody back.
  // Counted again after each start: it is decided as a run is about to start, by what agents' runs have used by then.
  let use = ceilingUse(d.db);
  const held: RunRecord[] = [];
  // One that came in while this pass was at its GPUs or starting others goes first too (looked for again after each).
  let came: boolean | null = null;
  const cameIn = () => (came ??= listRuns(d.db, { status: ['queued'], limit: 5000 }).some((r) => !seen.has(r.id) && r.when !== 'night' && !r.remote && placeOf(r.where).kind === 'local'));
  for (const r of waiting) {
    if (r.held || (reached(use) && holdable(r))) {
      // Looked up again: it may have been let go or stopped while this pass was starting others.
      const x = getRun(d.db, r.id);
      if (!x || (x.status !== 'queued' && x.status !== 'waiting')) continue;
      if (holdRun(d, x, use)) {
        held.push(x);
        continue;
      }
      Object.assign(r, { held: x.held, letRun: x.letRun, freedAt: x.freedAt });
    }
    if (r.when === 'night' && (!night || othersWait[r.gpus ? 'gpu' : 'cpu'] || cameIn())) {
      wait(r, night ? NIGHT_BEHIND : nightWhy(r, settings));
      continue;
    }
    const need = r.gpus ?? 0;
    if (!need) {
      if (free > 0) {
        free--;
        takes(r, [], started(r));
        await begin(d, r, []);
        came = null;
        use = ceilingUse(d.db);
      } else wait(r, `Waiting for one of your runs without a GPU to end (${slots} at most at once: Where runs go changes that)`, 'slot');
      continue;
    }
    reading ??= await readGpus().catch((): GpuReading => ({ gpus: [], error: 'failed' }));
    if (reading.error === 'missing' && !reading.gpus.length) {
      fail(d, r, 'This computer has no NVIDIA GPU that nvidia-smi can see: run it with 0 GPUs, or on another machine or cluster');
      continue;
    }
    if (!reading.gpus.length) {
      wait(r, 'Waiting: the GPUs could not be read just now (nvidia-smi failed); trying again');
      continue;
    }
    if (need > reading.gpus.length) {
      fail(d, r, `It asks for ${need} GPUs, and this computer has ${reading.gpus.length}`);
      continue;
    }
    const taken = new Set(sharing ? [] : on.keys());
    const how = { on: sharing ? on : undefined, alone: r.alone };
    // The GPUs kept for runs ahead of it, unless it is sure to be gone before they could start.
    const against = kept.filter((k) => !(r.hours && Number.isFinite(k.at) && endIfStarted(r) <= k.at));
    const pick = chooseGpus(reading.gpus, need, r.gpuMemGb, new Set([...taken, ...against.flatMap((k) => [...k.gpus])]), how);
    if ('ids' in pick) {
      const shared = pick.ids.flatMap((gpu) => (on.get(gpu)?.length ? [{ gpu, runs: on.get(gpu)!.map((h) => h.id) }] : []));
      takes(r, pick.ids, started(r));
      await begin(d, r, pick.ids, reading, shared);
      came = null;
      use = ceilingUse(d.db);
      continue;
    }
    if (!others) {
      const apps = (await readGpus({ apps: true }).catch(() => null))?.apps;
      others = othersOn({ ...reading, apps }, onAtFirst, goingIds);
    }
    const open = chooseGpus(reading.gpus, need, r.gpuMemGb, taken, { ...how, others });
    // It would start, were it not for runs ahead of it: which of them, and by when they could have theirs.
    const behind = 'ids' in open ? against.filter((k) => open.ids.some((i) => k.gpus.has(i))) : [];
    if ('why' in open) wait(r, open.why, 'gpu');
    else {
      const first = (behind[0] ?? against[0]).r;
      wait(r, `Waiting behind “${first.name ?? first.id}”, which needs ${gpuCountWords(first.gpus!)} and has waited ${waitedWords(now - waitingSince(first, now))}`, 'gpu');
    }
    if (now - waitingSince(r, now) >= NEXT_AFTER_MS) {
      const fitsNow = new Set(reading.gpus.filter((g) => !taken.has(g.index) && roomOn(g, r.gpuMemGb, r.alone, how.on?.get(g.index)) !== null).map((g) => g.index));
      const x = freeBy(states(), wantOf(r), sharing, now, fitsNow);
      const before = lastKept.get(r.id);
      if (x) {
        lastKept.set(r.id, { at: now, gpus: x.gpus });
        kept.push({ r, gpus: x.gpus, at: Math.max(x.at, ...behind.map((k) => k.at)) });
      } else if (before && now - before.at < KEEP_MS) kept.push({ r, gpus: before.gpus, at: Infinity });
    }
  }
  tellHeld(d, held, use);
  sayWaits(d, waits, (queue) => forecast({ now, gpus: states(), sharing, cpu, slots, queue }));
}

/** The run's own variables: its id and folder, Python's output unbuffered (so the log follows), its seed, its GPUs. */
function runEnv(r: RunRecord, folder: string, gpuIds: number[] | null): Record<string, string> {
  const env: Record<string, string> = { PYTHONUNBUFFERED: '1', ...r.env, HYDOR_RUN: r.id, HYDOR_RUN_DIR: folder, HYDOR_GRACE_SECONDS: String(r.grace ?? GRACE.default) };
  // Where its code is and where its project is: the same folder, unless it runs from a copy (on a cluster, unset).
  if (placeOf(r.where).kind === 'local') env.HYDOR_CODE_DIR = env.HYDOR_PROJECT_DIR = r.cwd;
  if (r.seed !== undefined) env.HYDOR_SEED = String(r.seed);
  // The GPUs it was given; none for a job without a GPU, unless it set them itself.
  if (gpuIds?.length) env.CUDA_VISIBLE_DEVICES = gpuIds.join(',');
  else if (gpuIds && r.env?.CUDA_VISIBLE_DEVICES === undefined) env.CUDA_VISIBLE_DEVICES = '';
  return env;
}

/** Starts a run here: its code (as queued, or as the folder has it), its wrapper in tmux, then its environment in the background. */
async function begin(d: Deps, r: RunRecord, gpuIds: number[], reading?: GpuReading, shared: NonNullable<RunRecord['shared']> = []) {
  busy.add(r.id);
  const folder = runFolder(r.id);
  const done = () => {
    busy.delete(r.id);
    tellRuns(d, [r.id]);
  };
  const broke = async (e: unknown) => {
    // A copy made for it that never ran is taken down.
    const made = getRun(d.db, r.id);
    if (made) await fromCopy(d, made);
    const why = (e as Error).message;
    if (!(e instanceof NoCopy)) return fail(d, r, `It could not start: ${why}`);
    fail(d, r, e.large ? 'Its code changed while it waited and was too large to keep as queued: run it again' : `Its code changed while it waited and could not be put back as it was queued (${why}): run it again`);
  };
  try {
    updateRun(d.db, r.id, { status: 'starting', why: null, startedAt: Date.now(), info: { host: os.hostname(), gpuIds, folder, logPath: files(folder).log, shared: shared.length ? shared : undefined, startsAbout: undefined, waitingSince: undefined } });
    startUsage(d.db, r.id, gpuIds, reading?.gpus ?? []);
    tellRuns(d, [r.id]);
    if (!fs.existsSync(r.cwd)) throw new Error(`The folder ${r.cwd} is not there`);
    fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
    const base = agentBaseEnv();
    // The code kept when it was queued, and what the folder no longer has of it.
    const code = takesCode(r) ? loadManifest(folder) : null;
    const changed = code ? await differences(code, r.cwd, { ...base, ...r.env }) : [];
    const rest = launch(d, r, { gpuIds, reading, code, changed }).catch(broke).finally(done);
    // A copy can take a while to make: the queue goes on meanwhile.
    if (!changed.length || (r.code === 'now' && !carriesOn(r))) await rest;
  } catch (e) {
    await broke(e);
    done();
  }
}

async function launch(d: Deps, r: RunRecord, o: { gpuIds: number[]; reading?: GpuReading; code: Manifest | null; changed: string[] }) {
  const { gpuIds, reading, code, changed } = o;
  const folder = runFolder(r.id);
  const base = agentBaseEnv();
  let env = runEnv(r, folder, gpuIds);
  let cwd = r.cwd;
  let command = commandOf(r);
  let copy: { top: string; cwd: string } | undefined;
  const differ = { codeChanged: changed.length ? changed.slice(0, 20) : undefined };
  // One that carries on runs the code kept with it, whatever it was queued to do: never new code between checkpoints.
  if (code && changed.length && (r.code !== 'now' || carriesOn(r))) {
    copy = await makeCopy(code, folder, { link: true, env: { ...base, ...r.env } });
    const there = forCopy(code, copy, folder, { ...r, command: commandOf(r) });
    ({ command } = there);
    cwd = copy.cwd;
    env = { ...env, ...there.env, HYDOR_CODE_DIR: copy.cwd };
    updateRun(d.db, r.id, { info: { ...recordOfCode(code, folder), ...differ, codeAt: 'queued', codeDir: copy.cwd, ranAs: ranAs(commandOf(r), there) } });
    addEvent(d.db, r.id, { kind: 'note', text: r.codeFrom ? 'It runs its own code, as the run it repeats ran it: the folder has changed since' : 'The folder had changed since it was queued: it runs a copy of the code as it was queued' });
  } else if (code && !changed.length) {
    const kept = await keepNewlyNamed(code, r, folder).catch(() => code);
    updateRun(d.db, r.id, { info: { ...recordOfCode(kept, folder), codeAt: 'queued' } });
  } else if (code) {
    // code: "now": the folder as it is, kept as it is now.
    const now = await takeCode(codeReader(), r, r.id, folder);
    updateRun(d.db, r.id, { info: { ...(now ? recordOfCode(now, folder) : {}), ...differ, codeAt: 'start' } });
  }
  const sh = localShell(cwd, { ...base, ...r.env });
  // Without code kept when it was queued: read now (a score's, a trial's, a run from before this was done).
  if (!code) {
    const git = await captureGit(sh).catch(() => ({}) as Awaited<ReturnType<typeof captureGit>>);
    const info: Partial<RunInfo> = { commit: git.commit, branch: git.branch, dirty: git.dirty, untracked: git.untracked };
    if (git.patch) {
      fs.writeFileSync(files(folder).patch, git.cut ? `${git.patch}\n# Hydor: the patch was cut at 2 MB.\n` : git.patch, { mode: 0o600 });
      info.patchPath = files(folder).patch;
    }
    // What the command names that git does not have is kept before it runs (a score's files are sealed with its evaluation).
    if (!isScoringRun(r)) {
      const named = await keepUntracked(sh, r.command, r.cwd, path.join(folder, 'untracked')).catch(() => null);
      if (named?.kept.length) info.kept = named.kept;
      if (named?.notKept.length) info.notKept = named.notKept;
    }
    updateRun(d.db, r.id, { info });
  }
  // The evaluations of this folder: a scoring run does not start on changed files, any other is marked.
  await stampRun(d, r, copy ? { top: code!.top, copy: copy.top } : undefined);
  // Stopped while its code was being made ready: it does not start.
  const asked = getRun(d.db, r.id);
  if (asked?.stopping) return stoppedBeforeStart(d, r, asked.stopping);
  await startLocal({ id: r.id, folder, cwd, command, env });
  const now = Date.now();
  updateRun(d.db, r.id, { status: 'running', info: { outputAt: now, ranResume: carriesOn(r) || undefined } });
  addEvent(d.db, r.id, { kind: 'started', text: `Started on ${os.hostname()}${gpuIds.length ? `, ${gpuList(gpuIds)}` : ''}${carriesOn(r) ? ', to carry on from its checkpoint' : ''}` });
  live.delete(r.id);
  // Asked to stop as it started.
  const asking = getRun(d.db, r.id);
  if (asking?.stopping) await stopLocal(r.id, folder, asking.hardStopAt ? Math.max(0, asking.hardStopAt - Date.now()) : undefined);
  const names = gpuIds.map((i) => reading?.gpus.find((g) => g.index === i)?.name ?? '').filter(Boolean);
  void captureEnvironment(sh, { command, cwd, pathDirs: pathDirs({ ...base, ...r.env }), gpus: gpuIds.length > 0, gpuNames: names })
    .then((environment) => {
      updateRun(d.db, r.id, { info: { environment } });
      tellRuns(d, [r.id]);
    })
    .catch(() => {});
}

async function stoppedBeforeStart(d: Deps, r: RunRecord, why: string) {
  await fromCopy(d, getRun(d.db, r.id)!);
  if (isNightAgain(why)) {
    // Never started, so there is no checkpoint of its own to carry on from: unless it was carrying on already.
    if (why === NIGHT_CARRY && !carriesOn(r)) updateRun(d.db, r.id, { info: { stopping: NIGHT_AGAIN } });
    return backToWaiting(d, getRun(d.db, r.id)!);
  }
  updateRun(d.db, r.id, { status: 'stopped', why, endedAt: Date.now(), info: { stopping: undefined, hardStopAt: undefined } });
  addEvent(d.db, r.id, { kind: 'stopped', text: why });
  ended.emit('ended', r.id);
  void ending(d, getRun(d.db, r.id)!, true);
}

// ---- stopping ------------------------------------------------------------------------------------------------

/**
 * Stops a run: one in line at once; one running is asked to stop (Ctrl-C, then harder) and ends as stopped. A stop the
 * app decides itself (`app`: its time limit, the night's end, an early stop) warns it first and gives it its grace to
 * save a checkpoint and leave; the person's does so only for a run that asked for a grace.
 */
export async function stopRun(d: Deps, id: string, why = 'Stopped by you', o: { app?: boolean } = {}): Promise<RunRecord> {
  const r = getRun(d.db, id);
  if (!r) throw new HttpError(404, 'There is no such run');
  if (!ACTIVE.includes(r.status)) return r;
  if (r.remote) {
    const m = remoteMachine(r.remote.machine);
    if (!m) throw new HttpError(502, 'Its machine is no longer in Settings → Machines');
    const there = await m.call<{ run: RemoteRun }>('POST', `/api/experiments/runs/${r.remote.id}/stop`, 20_000, { why, ...(o.app ? { warn: true } : {}) });
    copyRemote(d, r, there.run);
    return getRun(d.db, id)!;
  }
  const place = placeOf(r.where);
  if (r.status === 'queued' || (r.status === 'waiting' && !(place.kind === 'cluster' && r.clusterJob))) {
    updateRun(d.db, id, { status: 'stopped', why, endedAt: Date.now(), info: { startsAbout: undefined, held: undefined } });
    addEvent(d.db, id, { kind: 'stopped', text: why });
    tellRuns(d, [id]);
    ended.emit('ended', id);
    void ending(d, getRun(d.db, id)!, true);
    return getRun(d.db, id)!;
  }
  const c = place.kind === 'cluster' ? getCluster(d.db, place.id) : null;
  // A job still waiting in SLURM's queue has nothing to warn.
  const grace = c?.kind === 'slurm' && r.status !== 'running' ? undefined : o.app ? (r.grace ?? GRACE.default) : r.grace;
  const hardStopAt = grace === undefined ? undefined : Math.min(Date.now() + grace * 1000, r.hardStopAt ?? Infinity);
  updateRun(d.db, id, { info: { stopping: why, hardStopAt } });
  addEvent(d.db, id, { kind: 'note', text: `Stopping: ${why}${grace === undefined ? '' : `. Warned with Ctrl-C: it has ${grace} seconds to save a checkpoint and leave`}` });
  if (place.kind === 'cluster') {
    if (c?.kind === 'slurm' && r.clusterJob) {
      // The warning to every program of the job; the hard stop comes when its seconds are up (followCluster).
      const warned = grace === undefined ? null : await runSsh(c.host, `scancel --signal=INT --full ${r.clusterJob}`, { timeoutMs: 30_000 });
      if (warned?.code !== 0) await runSsh(c.host, `scancel ${r.clusterJob}`, { timeoutMs: 30_000 });
    } else if (c && r.remoteDir) {
      const pid = `$(cat ${q(`${r.remoteDir}/pid`)} 2>/dev/null)`;
      await runSsh(c.host, `p=${pid}; [ -n "$p" ] && { kill -INT -- -$p 2>/dev/null; nohup sh -c "sleep ${grace ?? 10}; kill -TERM -- -$p 2>/dev/null; sleep 10; kill -KILL -- -$p 2>/dev/null" >/dev/null 2>&1 & }`, { timeoutMs: 30_000 });
    }
  } else await stopLocal(r.id, r.folder ?? runFolder(r.id), grace === undefined ? undefined : grace * 1000);
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
      const held = new Set(
        listRuns(d.db, { status: ['starting', 'running'], limit: 5000 })
          .filter((x) => x.where === r.where && x.id !== r.id)
          .flatMap((x) => x.gpuIds ?? []),
      );
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
    const put = await runSsh(c.host, `cat > ${q(`${dir}/command.sh`)}`, { input: `${commandOf(r)}\n`, timeoutMs: 30_000 });
    if (put.code !== 0) return setWaiting(d, r, `Waiting: could not write to ${c.name} (${sshWhy(put)}); trying again`);
    info.ranResume = carriesOn(r) || undefined;
    if (c.kind === 'slurm') {
      const script = sbatchScript({ run: r, cluster: c, dir, cwd: r.cwd || undefined, env });
      // Asked first: what it refuses is said at once, and when it would start.
      const asked = await testOnly(c.host, dir, script);
      if (asked.refused) {
        updateRun(d.db, r.id, { info });
        return fail(d, r, asked.refused);
      }
      const sb = await runSsh(c.host, `cat > ${q(`${dir}/job.sbatch`)} && sbatch --parsable ${q(`${dir}/job.sbatch`)}`, { input: script, timeoutMs: 60_000 });
      const job = parseSbatch(sb.out);
      if (!job) return fail(d, r, `sbatch did not take it: ${(sb.err || sb.out).trim().split('\n').pop() || `exit code ${sb.code}`}`);
      // Its guess is said, not kept as when it will start: squeue's own estimate is (followCluster).
      const why = asked.startsAbout === undefined ? 'In the cluster’s queue' : `In the cluster’s queue. ${guessWords(whenWords(asked.startsAbout, Date.now(), nightZone(d.db)))}`;
      updateRun(d.db, r.id, { status: 'waiting', why, info: { ...info, clusterJob: job, startsGuess: asked.startsAbout } });
      addEvent(d.db, r.id, { kind: 'waiting', text: `Submitted to ${c.name} as job ${job}` });
    } else {
      const wrapper = wrapperScript({ id: r.id, folder: dir, cwd: r.cwd || dir, env });
      // set -m: without it a program started in the background here would ignore Ctrl-C, the warning before a stop.
      const go = await runSsh(
        c.host,
        `cat > ${q(`${dir}/run.sh`)} && rm -f ${q(`${dir}/exit`)} && if command -v tmux >/dev/null; then tmux new-session -d -s x${r.id} ${q(`bash ${q(`${dir}/run.sh`)}`)}; else set -m; nohup setsid bash ${q(`${dir}/run.sh`)} >/dev/null 2>&1 & fi`,
        { input: wrapper, timeoutMs: 45_000 },
      );
      if (go.code !== 0) return fail(d, r, `It could not start on ${c.name}: ${sshWhy(go)}`);
      updateRun(d.db, r.id, { status: 'running', why: null, startedAt: Date.now(), info: { ...info, outputAt: Date.now() } });
      addEvent(d.db, r.id, { kind: 'started', text: `Started on ${c.name}${env.CUDA_VISIBLE_DEVICES ? `, ${gpuList(env.CUDA_VISIBLE_DEVICES.split(',').map(Number))}` : ''}${info.ranResume ? ', to carry on from its checkpoint' : ''}` });
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
  // A warned stop whose seconds are up is looked at without waiting for the next turn, and made hard if it still goes.
  // (On a plain SSH machine the stop sent there does it itself: this is for when that did not arrive.)
  const hardDue = !!r.stopping && !!r.hardStopAt && !L.forced && now >= r.hardStopAt + (c.kind === 'slurm' ? 0 : 15_000);
  if (now - L.polledAt < timing.cluster && !hardDue) return;
  L.polledAt = now;
  const dir = r.remoteDir!;
  let state: { ended: false; status: 'waiting' | 'running'; why?: string; startsAbout?: number } | { ended: true; code: number | null; slurm?: ReturnType<typeof endOfSlurm> };
  // SLURM keeps a job in COMPLETING while it cleans up after it, which on a real cluster took most of a minute.
  let completing = false;
  // Whether the command left an exit code of its own (sacct's, beside a signal, is not one).
  let leftCode = false;
  if (c.kind === 'slurm') {
    const s = await runSsh(
      c.host,
      `squeue -h -j ${r.clusterJob} -o '%i|%T|%r|%M|%N|%S' 2>/dev/null; echo @@; cat ${q(`${dir}/exit`)} 2>/dev/null; echo @@; sacct -j ${r.clusterJob} --format=State,ExitCode,Elapsed -P -n 2>/dev/null | head -n 3; echo @@; date +%z`,
      { timeoutMs: 45_000 },
    );
    if (s.code !== 0) return setWhy(d, r, `Could not reach ${c.name} just now (${sshWhy(s)}); trying again`);
    const [sq, ex, sa, zone] = s.out.split('@@\n');
    const inQueue = parseSqueue(sq ?? '').get(r.clusterJob!);
    const code = /^-?\d+$/.test((ex ?? '').trim()) ? Number(ex.trim()) : null;
    leftCode = code !== null;
    const acct = sacctState(sa ?? '');
    const told = acct && slurmEnded(acct.state) && slurmTells(acct.state) ? endOfSlurm(acct, r) : undefined;
    completing = !!inQueue && /^COMPLETING/i.test(inQueue.state);
    // Over already when its command has left its exit code, or when the accounting had its end at the last look too (one
    // look more, as a command stopped at its limit may still be saving).
    const over = completing && (code !== null || (!!L.closing && !!acct && slurmEnded(acct.state)));
    if (completing && !!acct && slurmEnded(acct.state)) L.closing = true;
    if (inQueue && !slurmEnded(inQueue.state) && !over) {
      if (/^PENDING/i.test(inQueue.state)) {
        // About when it starts, once squeue says: what was said stands until its estimate moves by more than ten
        // minutes. Until then --test-only's cautious guess is said, while it is still to come.
        const estimate = slurmTime(inQueue.start, zone);
        let about = r.startsAbout;
        if (estimate !== undefined && (about === undefined || Math.abs(estimate - about) > 10 * 60_000)) about = estimate;
        if (about !== undefined && about <= Date.now() - 60_000) about = undefined;
        const when = (at: number) => whenWords(at, Date.now(), nightZone(d.db));
        const head = inQueue.reason ? `In the cluster’s queue: ${reasonWords(inQueue.reason)}` : 'In the cluster’s queue';
        const more = about !== undefined ? `. It expects to start about ${when(about)}` : r.startsGuess && r.startsGuess > Date.now() ? `. ${guessWords(when(r.startsGuess))}` : '';
        state = { ended: false, status: 'waiting', why: `${head}${more}`, startsAbout: about };
      } else state = { ended: false, status: 'running' };
    } else if (code !== null && acct && !slurmEnded(acct.state) && !L.lagged) {
      // The job left the queue but the accounting still has it going: one more look, so why it ended can be said.
      L.lagged = true;
      return;
    }
    // (A program that saves and leaves with 0 when SLURM takes its place back, or its time is up, did not finish.)
    else if (code !== null) state = { ended: true, code, slurm: code !== 0 || /^(PREEMPTED|TIMEOUT)/i.test(acct?.state ?? '') ? told : undefined };
    else if (acct && slurmEnded(acct.state)) state = { ended: true, code: acct.exitCode ?? null, slurm: endOfSlurm(acct, r) };
    else if (acct) state = { ended: false, status: /^PENDING/i.test(acct.state) ? 'waiting' : 'running' };
    else state = { ended: true, code: null };
  } else {
    // (`; true`: kill -0 fails once the process is gone, which is an answer, not a failed call.)
    const s = await runSsh(c.host, `cat ${q(`${dir}/exit`)} 2>/dev/null; echo @@; p=$(cat ${q(`${dir}/pid`)} 2>/dev/null); [ -n "$p" ] && kill -0 $p 2>/dev/null && echo ALIVE; true`, { timeoutMs: 45_000 });
    if (s.code !== 0) return setWhy(d, r, `Could not reach ${c.name} just now (${sshWhy(s)}); trying again`);
    const [ex, alive] = s.out.split('@@\n');
    const code = /^-?\d+$/.test((ex ?? '').trim()) ? Number(ex.trim()) : null;
    state = code !== null ? { ended: true, code } : alive?.includes('ALIVE') ? { ended: false, status: 'running' } : { ended: true, code: null };
  }
  if (hardDue && !state.ended && !completing) {
    const x =
      c.kind === 'slurm'
        ? await runSsh(c.host, `scancel ${r.clusterJob}`, { timeoutMs: 30_000 })
        : await runSsh(c.host, `p=$(cat ${q(`${dir}/pid`)} 2>/dev/null); [ -n "$p" ] && { kill -TERM -- -$p 2>/dev/null; sleep 2; kill -KILL -- -$p 2>/dev/null; }; true`, { timeoutMs: 30_000 });
    if (x.code === 0) {
      L.forced = true;
      // (A plain SSH machine's end tells it: finish.)
      if (c.kind === 'slurm') addEvent(d.db, r.id, { kind: 'note', text: `It had not left ${r.grace ?? GRACE.default} seconds after the warning, so it was stopped hard` });
    }
  }
  let more = await readThere(d, r, c.host, L, state.ended);
  // One that ended is read to the end of its log and its metrics file, however much is left.
  for (let i = 0; state.ended && more && i < 50; i++) more = await readThere(d, r, c.host, L, true);
  if (!state.ended) {
    if (state.status === 'running' && r.status !== 'running') {
      updateRun(d.db, r.id, { status: 'running', why: null, startedAt: Date.now(), info: { startsAbout: undefined, startsGuess: undefined } });
      addEvent(d.db, r.id, { kind: 'started', text: `Running on ${c.name}` });
      L.outputAt = Date.now();
    } else if (state.status === 'waiting' && state.why && (state.why !== r.why || state.startsAbout !== r.startsAbout)) {
      updateRun(d.db, r.id, { why: state.why, info: { startsAbout: state.startsAbout } });
      tellRuns(d, [r.id]);
    }
    if (state.status === 'running') await watch(d, getRun(d.db, r.id)!, L);
    return save(d, r, L);
  }
  // Its scores come however it ended, as a run's here do.
  await fetchScores(c.host, r);
  if (state.slurm) {
    const s = state.slurm;
    if (s.status === 'stopped' && !getRun(d.db, r.id)?.stopping) updateRun(d.db, r.id, { info: { stopping: s.why ?? 'Cancelled' } });
    return finish(d, getRun(d.db, r.id)!, L, s.status === 'done' ? 0 : state.code || 1, { why: s.why, oom: /memory/.test(s.why ?? ''), preempted: s.preempted, noExitCode: !leftCode && s.status !== 'done' });
  }
  return finish(d, getRun(d.db, r.id)!, L, state.code, state.code === null ? { missing: `It is no longer in ${c.name}’s queue and left no exit code` } : {});
}

/** A chunk of a file read in pieces, without a UTF-8 character cut at its end (it waits for the next look). */
function wholeChars(buf: Buffer): Buffer {
  let end = buf.length;
  for (let k = 1; k <= 3 && end - k >= 0; k++) {
    const b = buf[end - k];
    if ((b & 0xc0) === 0x80) continue;
    if (b >= 0xc0 && k < (b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : 2)) end -= k;
    break;
  }
  return buf.subarray(0, end);
}

/**
 * A run's new output on a cluster, in one call: its log from where the last look stopped (copied here as it comes) and,
 * when it names a metrics file, that file's new part (from its start again if it became shorter). A file that is not
 * there is nothing new. True when a piece came full, so that more may follow.
 */
async function readThere(d: Deps, r: RunRecord, host: string, L: Live, ended: boolean): Promise<boolean> {
  const dir = r.remoteDir!;
  const most = ended ? 8 << 20 : 1 << 20;
  let script = `tail -c +${L.log + 1} ${q(`${dir}/log.txt`)} 2>/dev/null | head -c ${most} | base64 | tr -d '\\n'`;
  if (r.metricsFile) {
    const file = rq(runFile(r, r.metricsFile, dir));
    script += `; echo; echo @@; cd ${rq(r.cwd || dir)} 2>/dev/null && [ -f ${file} ] && { size=$(($(wc -c < ${file}))); from=${L.file}; [ "$size" -lt "$from" ] && from=0; echo "$from"; tail -c +$((from + 1)) ${file} | head -c ${most} | base64 | tr -d '\\n'; }; true`;
  }
  const got = await runSsh(host, script, { timeoutMs: 60_000 });
  const [log, metrics] = got.out.split('@@\n');
  // A call cut short could leave half a chunk: only a whole answer is taken.
  if (got.code !== 0) return false;
  let full = false;
  if (log?.trim()) {
    const chunk = wholeChars(Buffer.from(log.trim(), 'base64'));
    full = chunk.length >= most - 3;
    try {
      fs.mkdirSync(r.folder ?? runFolder(r.id), { recursive: true });
      fs.appendFileSync(files(r.folder ?? runFolder(r.id)).log, chunk);
    } catch {}
    L.log += chunk.length;
    consume(L, chunk.toString('utf8'), 'log');
  }
  const m = /^(\d+)\n([\s\S]*)$/.exec(metrics ?? '');
  if (!m) return full;
  const from = Number(m[1]);
  if (from < L.file) L.fileCarry = '';
  const chunk = wholeChars(Buffer.from(m[2].trim(), 'base64'));
  L.file = from + chunk.length;
  if (chunk.length) consume(L, chunk.toString('utf8'), 'file');
  return full || chunk.length >= most - 3;
}

/** A cluster run's per-example scores (the file it named, else scores.jsonl in its folder there), copied here when it ends. */
async function fetchScores(host: string, r: RunRecord) {
  const dir = r.remoteDir!;
  const own = rq(`${dir}/scores.jsonl`);
  const pick = r.scoresFile ? `f=${rq(runFile(r, r.scoresFile, dir))}; [ -f "$f" ] || f=${own}` : `f=${own}`;
  const got = await runSsh(host, `cd ${rq(r.cwd || dir)} && { ${pick}; [ -f "$f" ] && head -c ${MAX_SCORES} "$f"; }`, { timeoutMs: 120_000 });
  if (got.code !== 0 || !got.out.trim()) return;
  try {
    fs.writeFileSync(path.join(r.folder ?? runFolder(r.id), 'scores.jsonl'), got.out);
    updateRun(deps!.db, r.id, { info: { scores: true } });
  } catch {}
}

function setWhy(d: Deps, r: RunRecord, why: string) {
  if (r.why === why) return;
  updateRun(d.db, r.id, { why });
  tellRuns(d, [r.id]);
}

// ---- other machines -------------------------------------------------------------------------------------------------

/** Copies what another machine says of a run it keeps into the copy here; tells you of its end the way the job asked. */
function copyRemote(d: Deps, r: RunRecord, there: RemoteRun) {
  // Put back to wait at the end of that machine's night: the copy drops what its last start recorded, too.
  if (isNightAgain(there.why) && !isNightAgain(r.why)) resetRun(d.db, r.id, there.why, { carry: there.why === NIGHT_CARRY });
  const info: Partial<RunInfo> = {};
  for (const k of ['ranResume', 'hardStopAt', 'held', 'letRun', 'host', 'gpuIds', 'startsAbout', 'startsGuess', 'exitCode', 'commit', 'branch', 'dirty', 'untracked', 'kept', 'notKept', 'environment', 'outputAt', 'scores', 'queuedCode', 'codeAt', 'codeChanged', 'leftInCopy', 'ranAs', 'stopping', 'peak', 'gpuTotalGb', 'others', 'memoryLimitGb', 'memoryLow', 'firstError'] as const) (info as Record<string, unknown>)[k] = there[k];
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
    const there = await m.call<{ run: RemoteRun; series?: MetricSeries }>('GET', `/api/experiments/runs/${r.remote!.id}?log=0`, 10_000);
    // The sweep is kept here, not there: so its early stop is judged here, by the series read from there.
    const rule = r.sweep ? getSweep(d.db, r.sweep)?.earlyStop : undefined;
    if (rule && there.series) saveSeries(d.db, r.id, there.series);
    copyRemote(d, r, there.run);
    const now = getRun(d.db, r.id);
    if (rule && there.series && now?.status === 'running' && !now.stopping) await stopIfBehind(d, now, there.series, rule);
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
  if (listRuns(d.db, { status: ACTIVE, limit: 1 }).length || morningDue(d.db)) wake();
  // The records of runs that ended under an older rule for their metrics are fixed in the background, a little later.
  const t = setTimeout(() => void repairEnded(d), 5000);
  t.unref?.();
}

let repairing = false;

/** Fixes the ended runs' metrics made under the old rule (see repair.ts), one at a time; tells the pages of those it changed. */
export async function repairEnded(d: Deps) {
  if (repairing) return;
  repairing = true;
  const changed: string[] = [];
  try {
    const ended = listRuns(d.db, { status: ['done', 'failed', 'stopped', 'lost'], limit: 5000, oldest: true }).filter((r) => r.metrics && !r.metrics.repeated && !r.remote);
    for (const r of ended) {
      try {
        if (live.has(r.id) || busy.has(r.id)) continue;
        if (await repairRecordSoon(d.db, r, placeOf(r.where).kind === 'local')) changed.push(r.id);
      } catch (e) {
        console.error(`[experiments] ${r.id}: its metrics could not be fixed:`, (e as Error)?.message ?? e);
      }
      await new Promise((resolve) => setImmediate(resolve));
    }
  } catch (e) {
    console.error('[experiments] fixing metrics:', (e as Error)?.message ?? e);
  } finally {
    repairing = false;
  }
  if (changed.length) tellRuns(d, changed);
}

/** The queue now: how many run and wait, this computer's GPUs (and which run holds each), the jobs without a GPU. */
export async function queueNow(d: Deps): Promise<QueueNow> {
  const runs = listRuns(d.db, { status: ACTIVE, limit: 5000 });
  const here = runs.filter((r) => !r.remote && placeOf(r.where).kind === 'local');
  const going = here.filter((r) => r.status === 'starting' || r.status === 'running');
  const reading = await readGpus().catch((): GpuReading => ({ gpus: [], error: 'failed' }));
  // The runs on each GPU, the longest there first.
  const holders = new Map<number, string[]>();
  for (const r of [...going].reverse()) for (const g of r.gpuIds ?? []) holders.set(g, [...(holders.get(g) ?? []), r.id]);
  return {
    running: runs.filter((r) => r.status === 'running' || r.status === 'starting').length,
    waiting: runs.filter((r) => r.status === 'queued' || r.status === 'waiting').length,
    gpus: reading.gpus.map((g) => {
      const ids = holders.get(g.index);
      return ids ? { ...g, run: ids[0], ...(ids.length > 1 ? { runs: ids } : {}) } : g;
    }),
    ...(reading.error === 'missing' ? { gpuNote: 'No NVIDIA GPU here' } : reading.error === 'failed' ? { gpuNote: 'The GPUs could not be read just now' } : {}),
    cpuRunning: going.filter((r) => !r.gpus).length,
    cpuSlots: settingsOf(d.db).cpuSlots,
    ...(settingsOf(d.db).agentGpuHours !== null ? { agents: agentsUse(d.db) } : {}),
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
  // One the app took up again is followed to the run that took its place (its `from` names the one asked for).
  const latest = (r: RunRecord | null): RunRecord | null => (r?.restartedAs ? (latest(getRun(db, r.restartedAs)) ?? r) : r);
  if (w.ids?.length) return w.ids.map((id) => latest(getRun(db, id))).filter((r): r is RunRecord => !!r);
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
  estimates.clear();
  lastKept.clear();
}

export type { RunEvent };
