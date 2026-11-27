// What runs may cost in GPU hours (a run's GPUs times the hours it runs; one without a GPU costs none), and what holds
// agents to it: the estimate said before a run starts (from its time limit, else from how long the same command took
// last), a budget a session was given once for a plan (experiment_budget), and the ceiling on agents' runs in any
// seven days on this computer (Where runs go). At the ceiling an agent's new run is taken but held until you let it
// go or the seven days leave room again; your own runs are never counted or held.
import { EventEmitter } from 'node:events';
import { ACTIVE, agentsUsedWords, gpuHoursWords, gpuNum, HELD_WHY, isTrialRun, type AgentsUse, type GpuHours, type JobSpec, type RunRecord } from '../../shared/experiments.ts';
import { HttpError } from '../auth.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { clock, nightZone } from './night.ts';
import { notice, placeOf, settingsOf, tellRuns, wake } from './queue.ts';
import { addEvent, getRun, listRuns, runsOfStarter, runsSince, spentKept, updateRun } from './records.ts';
import { commandSignature } from './trial.ts';

const HOUR = 3_600_000;
export const WEEK = 7 * 24 * HOUR;
const round = (h: number) => Math.round(h * 1000) / 1000;

// ---- who started it, and what it used -------------------------------------------------------------------------

/** Started by an agent: a session's (a scheduled task's and the agent on call's too), an app's step, a goal, an evolution an agent started, or an agent through the app's API. */
export const isAgentRun = (r: Pick<RunRecord, 'startedBy'>) => !!(r.startedBy?.session || r.startedBy?.app || r.startedBy?.agent);

/** On this computer's own GPUs (not a cluster's, not another machine's, whose copy is kept here). */
const here = (r: Pick<RunRecord, 'where' | 'remote'>) => !r.remote && placeOf(r.where).kind === 'local';

const gpusOf = (r: Pick<RunRecord, 'gpus' | 'gpuIds'>) => r.gpuIds?.length || r.gpus || 0;

/** GPU hours a run used between `from` and `now`: its GPUs times the hours it ran there (a night run's earlier starts included). */
export function usedHours(r: Pick<RunRecord, 'gpus' | 'gpuIds' | 'startedAt' | 'endedAt' | 'earlierSpans'>, from: number, now: number): number {
  const n = gpusOf(r);
  if (!n) return 0;
  let ms = 0;
  const spans: [number, number][] = [...(r.earlierSpans ?? []), ...(r.startedAt ? [[r.startedAt, r.endedAt ?? now] as [number, number]] : [])];
  for (const [a, b] of spans) ms += Math.max(0, Math.min(b, now) - Math.max(a, from));
  return (ms * n) / HOUR;
}

// ---- before a run starts: what it may use ----------------------------------------------------------------------

type Job = Pick<JobSpec, 'command' | 'cwd' | 'gpus' | 'hours' | 'where'>;


/** How long the last finished run of the same command in the same folder (and place) took, in hours. */
function lastTook(db: DB, j: Job): number | undefined {
  const sig = commandSignature(j.command, j.cwd);
  let last: RunRecord | undefined;
  for (const r of listRuns(db, { cwd: j.cwd, status: ['done'], limit: 500 })) {
    if (isTrialRun(r) || !r.startedAt || !r.endedAt || (r.where ?? 'local') !== (j.where ?? 'local') || commandSignature(r.command, r.cwd) !== sig) continue;
    if (!last || r.endedAt > last.endedAt!) last = r;
  }
  return last ? (last.endedAt! - last.startedAt!) / HOUR : undefined;
}

/** What `runs` runs of a job may use: at most (its time limit), about (its last run), or neither. */
export function gpuHoursOf(db: DB, j: Job, runs = 1): GpuHours {
  const g = j.gpus ?? 0;
  if (!g) return { atMost: 0 };
  // A time limit holds wherever it runs: here, on another machine, by SLURM and on a plain SSH computer.
  const limit = j.hours || undefined;
  if (limit) return { atMost: round(g * limit * runs) };
  const took = lastTook(db, j);
  return took !== undefined ? { about: round(g * took * runs) } : {};
}

const gpuCount = (n: number) => `${n} GPU${n === 1 ? '' : 's'}`;

/** The approval card's line for it; null for a run without a GPU. `time`: its limit in words, when it is not hours (a trial's seconds). */
export function costLine(h: GpuHours, o: { gpus: number; hours?: number; runs?: number; time?: string }): string | null {
  if (!o.gpus) return null;
  const many = o.runs !== undefined && o.runs !== 1;
  if (h.atMost !== undefined) return `At most ${gpuHoursWords(h.atMost)} (${many ? `${o.runs} runs × ` : ''}${gpuCount(o.gpus)} × ${o.time ?? `${gpuNum(o.hours ?? 0)} h`})`;
  if (h.about !== undefined) return `About ${gpuHoursWords(h.about)}, going by its last run`;
  return many ? 'No time limit: its runs go until they end' : 'No time limit: it runs until it ends';
}

// ---- a budget a session was given ----------------------------------------------------------------------------

export interface Budget {
  gpuHours: number;
  why: string;
  /** When it was given: what the session's runs use from then on counts. */
  at: number;
}

export interface BudgetNow extends Budget {
  /** GPU hours of the session's runs that ended since it was given. */
  used: number;
  /** The time limits of its runs still waiting or running. */
  reserved: number;
  left: number;
}

/** Kept in the app's data under the session's key (no route writes it: an agent cannot give itself one). */
export const budgetKey = (session: string) => `experiments_budget:${session}`;

function budgetOf(db: DB, session: string): Budget | null {
  try {
    const b = JSON.parse(kvGet(db, budgetKey(session)) ?? 'null') as Budget | null;
    return b && Number.isFinite(b.gpuHours) ? b : null;
  } catch {
    return null;
  }
}

/** The session's budget from now on, in place of the one before. */
export function giveBudget(db: DB, session: string, gpuHours: number, why: string) {
  kvSet(db, budgetKey(session), JSON.stringify({ gpuHours, why, at: clock.now() } satisfies Budget));
}

export function budgetNow(db: DB, session: string): BudgetNow | null {
  const b = budgetOf(db, session);
  if (!b) return null;
  const now = clock.now();
  let used = 0;
  let reserved = 0;
  for (const r of runsOfStarter(db, session)) {
    if (r.startedBy?.session !== session && r.startedBy?.for !== session) continue;
    if (!ACTIVE.includes(r.status)) {
      if ((r.endedAt ?? 0) >= b.at) used += usedHours(r, 0, now);
      continue;
    }
    // One still going counts its whole time limit; one without a limit, what it has used so far.
    reserved += r.hours ? gpusOf(r) * r.hours + usedHours({ ...r, startedAt: undefined }, 0, now) : usedHours(r, 0, now);
  }
  for (const s of spentKept(db)) if ((s.by.session === session || s.by.for === session) && s.endedAt >= b.at) used += usedHours(s, 0, now);
  return { ...b, used: round(used), reserved: round(reserved), left: round(Math.max(0, b.gpuHours - used - reserved)) };
}

/** The starts a budget covered, one at a time for each session: each is in line (and counts itself) before the next is looked at. */
const turns = new Map<string, Promise<void>>();

/**
 * Whether the session's budget covers a start of at most `atMost` GPU hours: null when it has none; when it does,
 * `release` (to call once its runs are in line: starts asked at once wait for it, so they share what is left); else
 * what is left.
 */
export async function claimBudget(db: DB, session: string, atMost: number): Promise<{ release: () => void } | { left: number; gpuHours: number } | null> {
  if (!budgetOf(db, session)) return null;
  const before = turns.get(session) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((resolve) => (release = resolve));
  const tail = before.then(() => mine);
  turns.set(session, tail);
  void tail.then(() => turns.get(session) === tail && turns.delete(session));
  await before;
  const b = budgetNow(db, session);
  if (b && !(atMost > 0 && b.used + b.reserved + atMost > b.gpuHours + 1e-6)) return { release };
  release();
  return b ? { left: b.left, gpuHours: b.gpuHours } : null;
}

export const overWords = (o: { left: number; gpuHours: number }) => `This session’s budget of ${gpuHoursWords(o.gpuHours)} has ${gpuNum(o.left, true)} left`;

// ---- the ceiling on agents' runs -----------------------------------------------------------------------------

/** What agents' runs used in the last seven days on this computer (running ones up to now), the ceiling, and how many are held. */
export function agentsUse(db: DB): AgentsUse {
  const ceiling = settingsOf(db).agentGpuHours;
  const now = clock.now();
  const from = now - WEEK;
  let used = 0;
  for (const r of runsSince(db, from)) if (isAgentRun(r) && here(r)) used += usedHours(r, from, now);
  // Records deleted since keep counting what they used.
  for (const s of spentKept(db)) if (isAgentRun({ startedBy: s.by }) && s.here) used += usedHours(s, from, now);
  // A copy of a run another machine holds is that machine's to count.
  const held = listRuns(db, { status: ['waiting'], limit: 5000 }).filter((r) => r.held && here(r)).length;
  return { ...(ceiling !== null ? { ceiling } : {}), used: Math.floor(used * 1000 + 1e-6) / 1000, held };
}

/** The same, added up only when a ceiling is set (what the queue and the pages that show nothing without one ask). */
export const ceilingUse = (db: DB): AgentsUse => (settingsOf(db).agentGpuHours === null ? { used: 0, held: 0 } : agentsUse(db));

export const reached = (u: AgentsUse): u is AgentsUse & { ceiling: number } => u.ceiling !== undefined && u.used >= u.ceiling - 1e-6;

/** A run the ceiling holds back when it is reached: an agent's (a score of its evolution or goal too), on this computer's GPUs, not let go. */
export const holdable = (r: RunRecord) => isAgentRun(r) && !!r.gpus && !r.letRun && here(r);

/** 'changed' (a run's id): it was held, its reason changed, or it was given its turn again (a search follows its scores by this). */
export const holds = new EventEmitter();
holds.setMaxListeners(50);

/**
 * A run in line: held (true) while the ceiling is reached, given its turn again once there is room. The queue asks
 * for each run that waits, and the tools right after they put one in line, so their answer says it.
 */
export function holdRun(d: Deps, r: RunRecord, use: AgentsUse): boolean {
  if (holdable(r) && reached(use)) {
    const why = `${HELD_WHY}${agentsUsedWords(use.used, use.ceiling)}`;
    if (!r.held || r.why !== why || r.status !== 'waiting') {
      updateRun(d.db, r.id, { status: 'waiting', why, info: { held: true, startsAbout: undefined, waitingSince: undefined } });
      if (!r.held) addEvent(d.db, r.id, { kind: 'waiting', text: why });
      tellRuns(d, [r.id]);
      holds.emit('changed', r.id);
    }
    Object.assign(r, { status: 'waiting', why, held: true });
    return true;
  }
  if (r.held) {
    // From now on it waits like any run: a long wait for a GPU is counted from here, not from when it was held.
    const freedAt = clock.now();
    updateRun(d.db, r.id, { info: { held: undefined, freedAt } });
    addEvent(d.db, r.id, { kind: 'note', text: 'There is room again under the limit: it takes its turn' });
    Object.assign(r, { held: undefined, freedAt });
    tellRuns(d, [r.id]);
    holds.emit('changed', r.id);
  }
  return false;
}

/** Holds a run just put in line when it has to be, and gives it as it is now. */
export function heldNow(d: Deps, r: RunRecord): RunRecord {
  if (r.status !== 'queued' || !holdable(r)) return r;
  const now = getRun(d.db, r.id);
  if (!now || now.status !== 'queued') return now ?? r;
  holdRun(d, now, ceilingUse(d.db));
  wake();
  return now;
}

const TOLD = 'experiments_ceiling_told';

/** One notice a day, the first time runs are held that day. */
export function tellHeld(d: Deps, held: RunRecord[], use: AgentsUse) {
  if (!held.length || use.ceiling === undefined) return;
  let day: string;
  try {
    day = new Intl.DateTimeFormat('en-CA', { timeZone: nightZone(d.db) }).format(clock.now());
  } catch {
    day = new Intl.DateTimeFormat('en-CA').format(clock.now());
  }
  if (kvGet(d.db, TOLD) === day) return;
  kvSet(d.db, TOLD, day);
  const n = held.length;
  notice(d, held[0], 'waiting', `Agents reached the ${gpuHoursWords(use.ceiling)} you allow in seven days: ${n === 1 ? '1 run waits' : `${n} runs wait`} for you`, { title: 'Experiments', url: '/experiments' });
}

/** Lets a held run (or one in line) go, beyond the ceiling: the person's alone. */
export function letRun(d: Deps, id: string): RunRecord {
  const r = getRun(d.db, id);
  if (!r) throw new HttpError(404, 'There is no such run');
  if (r.status !== 'queued' && r.status !== 'waiting') return r;
  const held = r.held;
  updateRun(d.db, id, { ...(held ? { status: 'queued' as const, why: null } : {}), info: { letRun: clock.now(), held: undefined, ...(held ? { freedAt: clock.now() } : {}) } });
  if (held) addEvent(d.db, id, { kind: 'note', text: 'You let it run beyond the limit on agents’ GPU hours' });
  tellRuns(d, [id]);
  if (held) holds.emit('changed', id);
  wake();
  return getRun(d.db, id)!;
}

/**
 * Refuses an agent's new score or evolution while the ceiling is reached (one already going has its runs held one by
 * one): only when its runs take a GPU of this computer.
 */
export function refuseAtCeiling(db: DB, job: Pick<JobSpec, 'gpus' | 'where'>) {
  if (!job.gpus || placeOf(job.where).kind !== 'local') return;
  const use = ceilingUse(db);
  if (reached(use)) throw new HttpError(409, `Not started: ${agentsUsedWords(use.used, use.ceiling)}. That is the limit the person set for agents’ runs: tell them. They can change it in Experiments → Where runs go (/experiments?places=1).`);
}
