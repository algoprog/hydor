// The life of a job run with the `job` command: registered, waiting for the jobs it depends on and its turn in its
// queue, started, ended; stopped when asked; and given up on when its `job` process is gone.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { commandSig, lastLine, readProgress } from '../../shared/job-progress.ts';
import type { JobRegister, JobReport, JobState } from '../../shared/jobs.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import type { DB } from '../db.ts';
import { WIN } from '../platform.ts';
import { readTail } from '../tasklog.ts';
import { isForeign, mayReadLog, startFromProc, startFromPs, stillTaskOutput, taskOutputOf } from './adopt.ts';
import { activeRegistered, entryId, getRegistered, isEnded, jobKey, newestNamed, saveRegistered, type Registered } from './store.ts';

export const logFile = (id: string) => path.join(config.dataDir, 'jobs', `${id}.log`);

// ---- processes ----------------------------------------------------------------------------------------------------------

/** A process's state and start time from /proc (Linux), which tell a zombie and a reused number apart. */
function procStat(pid: number): { state: string; start: string } | null {
  try {
    const s = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const f = s.slice(s.lastIndexOf(')') + 2).split(' ');
    return { state: f[0], start: f[19] };
  } catch {
    return null;
  }
}

function signalable(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Whether the process that was `pid` when `start` was read still lives. */
export function processAlive(pid: number, start?: string): boolean {
  if (!signalable(pid)) return false;
  const now = procStat(pid);
  return !now || (now.state !== 'Z' && (!start || now.start === start));
}

/** Never the app itself, its process group, or the system's first process. */
const safePid = (pid: unknown): pid is number => typeof pid === 'number' && Number.isInteger(pid) && pid > 1 && pid !== process.pid;

/** Signals a command's whole process group, which it leads; on Windows, which has none, the process alone. */
function signalGroup(pid: number, signal: NodeJS.Signals | 0): boolean {
  try {
    process.kill(WIN ? pid : -pid, signal);
    return true;
  } catch {
    return false;
  }
}

/** Asks a command to end, and kills it if it is still there after `graceMs`. */
export function terminate(pid: number, graceMs: number) {
  if (!safePid(pid) || !signalGroup(pid, 'SIGTERM')) return;
  setTimeout(() => {
    if (signalGroup(pid, 0)) signalGroup(pid, 'SIGKILL');
  }, graceMs).unref();
}

/** Asks one process (an adopted one, not a group) to end, and kills it if it is still that process after `graceMs`. */
function terminateOne(pid: number, start: string | undefined, graceMs: number) {
  const signal = (s: NodeJS.Signals) => {
    if (!safePid(pid) || !processAlive(pid, start)) return;
    try {
      process.kill(pid, s);
    } catch {
      // Gone meanwhile.
    }
  };
  signal('SIGTERM');
  setTimeout(() => signal('SIGKILL'), graceMs).unref();
}

// ---- registering ----------------------------------------------------------------------------------------------------------

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** The job another waits for: an id, or the newest job with that name. */
function dependency(db: DB, ref: string): string {
  const found = getRegistered(db, entryId(ref)) ?? newestNamed(db, ref);
  if (!found) throw new HttpError(400, `There is no job called "${ref}" to wait for`);
  return jobKey(found.id);
}

function cleanPattern(v: unknown): string | undefined {
  const p = text(v, 300);
  if (!p) return undefined;
  try {
    new RegExp(p);
  } catch {
    throw new HttpError(400, `"${p}" is not a regular expression`);
  }
  return p;
}

function newId(db: DB): string {
  for (;;) {
    const id = `j-${crypto.randomBytes(3).toString('hex')}`;
    if (!getRegistered(db, jobKey(id))) return id;
  }
}

/** A job whose end nobody saw says nothing about how long its command takes. */
export const save = (db: DB, j: Registered) => saveRegistered(db, j, j.exitUnknown ? '' : commandSig(j.command));

/** The file a job's output is read from now, if any: its own log, or an adopted job's file while it may be read. */
export function logOfJob(j: Registered): string | undefined {
  if (!j.adopted) return j.log;
  const may = j.log === j.taskOutput ? stillTaskOutput : mayReadLog;
  return j.log && may(j.log) ? j.log : undefined;
}

const etaOf = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : undefined);

/** The job at work that a process already belongs to: adopted before, or one of `job run`'s. */
function jobOfProcess(db: DB, pid: number): Registered | undefined {
  return activeRegistered(db).find((j) => (j.pid === pid && processAlive(pid, j.pidStart)) || (j.commandPid === pid && j.state === 'running'));
}

/** `job adopt`: a process that runs already, shown as a running job from when it started. */
export function adopt(db: DB, b: Partial<JobRegister>, who: { session?: string; runId?: string }, now: number): Registered {
  if ((Array.isArray(b.after) && b.after.length) || text(b.queue, 100)) throw new HttpError(400, 'An adopted job runs already: it cannot wait for other jobs or in a queue');
  const pid = b.adoptPid;
  if (!safePid(pid)) throw new HttpError(400, 'Which process should be adopted?');
  if (!processAlive(pid)) throw new HttpError(400, `There is no running process with pid ${pid}`);
  const had = jobOfProcess(db, pid);
  if (had) return had;
  const command = text(b.command, 20_000) || `process ${pid}`;
  const logFileGiven = text(b.logFile, 4000);
  // A file not written yet is read once it is there; one that is there must be one that may be read.
  if (logFileGiven && (!path.isAbsolute(logFileGiven) || (fs.existsSync(logFileGiven) && !mayReadLog(logFileGiven)))) throw new HttpError(400, `${logFileGiven} cannot be read as a log`);
  const stat = procStat(pid);
  const taskOutput = taskOutputOf(pid);
  const job: Registered = {
    id: newId(db),
    state: 'running',
    name: text(b.name, 200) || command.slice(0, 80),
    command,
    cwd: text(b.cwd, 4000),
    pid,
    pidStart: stat?.start,
    // Without --log, a process that writes into a session task's output is read there: that task is no longer shown.
    log: logFileGiven || taskOutput || '',
    etaMs: etaOf(b.etaMs),
    after: [],
    progressPattern: cleanPattern(b.progress),
    session: who.session,
    runId: who.runId,
    adopted: true,
    taskOutput,
    foreign: isForeign(pid) || undefined,
    queuedAt: now,
    startedAt: Math.min(now, startFromProc(stat?.start) ?? startFromPs(pid) ?? now),
  };
  save(db, job);
  return job;
}

/** Takes a job in, queued; `schedule` then says whether it starts. */
export function register(db: DB, b: Partial<JobRegister>, who: { session?: string; runId?: string }, now: number): Registered {
  const command = text(b.command, 20_000);
  const name = text(b.name, 200) || command.slice(0, 80);
  const cwd = text(b.cwd, 4000);
  if (!command || !cwd) throw new HttpError(400, 'A job needs a command and the folder it runs in');
  if (!safePid(b.pid)) throw new HttpError(400, 'A job needs the process id of its job command');
  const after = Array.isArray(b.after) ? b.after.map((a) => text(a, 200)).filter(Boolean) : [];
  if (after.length > 50) throw new HttpError(400, 'A job can wait for 50 jobs at most');
  const deps = [...new Set(after.map((a) => dependency(db, a)))];
  const id = newId(db);
  const job: Registered = {
    id,
    state: 'queued',
    name,
    command,
    cwd,
    pid: b.pid,
    pidStart: procStat(b.pid)?.start,
    log: logFile(id),
    etaMs: etaOf(b.etaMs),
    after: deps,
    queue: text(b.queue, 100) || undefined,
    progressPattern: cleanPattern(b.progress),
    session: who.session,
    runId: who.runId,
    queuedAt: now,
  };
  fs.mkdirSync(path.dirname(job.log), { recursive: true });
  fs.writeFileSync(job.log, '', { mode: 0o600 });
  save(db, job);
  return job;
}

// ---- waiting and starting ----------------------------------------------------------------------------------------------------

/** The jobs it still waits for to end, as they are. */
export function pendingDeps(db: DB, j: Registered): Registered[] {
  return j.after.map((a) => getRegistered(db, a)).filter((d): d is Registered => !!d && !isEnded(d.state));
}

/** What a queued job waits for, in words. */
export function waitingWords(db: DB, j: Registered): string {
  const deps = pendingDeps(db, j);
  if (deps.length) return deps.map((d) => d.name).join(', ');
  return j.queue ? `its turn in queue ${j.queue}` : 'its start';
}

const HOW: Partial<Record<JobState, string>> = { failed: 'failed', stopped: 'was stopped', cancelled: 'never started' };

/** Ends a registered job, keeping what its output said last. */
export function end(db: DB, j: Registered, state: JobState, now: number, o: { reason?: string; exitCode?: number } = {}) {
  j.state = state;
  j.endedAt = now;
  if (o.reason) j.reason = o.reason;
  if (o.exitCode !== undefined) j.exitCode = o.exitCode;
  try {
    const tail = readTail(logOfJob(j)!, 64 << 10).text;
    j.lastLine = lastLine(tail);
    const r = readProgress(tail, j.progressPattern);
    if (r) j.progress = { fraction: r.fraction, text: r.text, at: now };
  } catch {
    // No log: it never ran.
  }
  save(db, j);
}

/**
 * Starts every queued job whose dependencies ended well and whose queue is free (one at a time, in the order they were
 * registered), and cancels those a dependency failed. Returns the ids that changed.
 */
export function schedule(db: DB, now: number): string[] {
  const active = activeRegistered(db);
  // The queues that are taken: by a running job, or by an earlier one still waiting its turn.
  const taken = new Set(active.filter((j) => j.state === 'running' && j.queue).map((j) => j.queue!));
  const changed: string[] = [];
  for (const j of active) {
    if (j.state !== 'queued') continue;
    const deps = j.after.map((a) => getRegistered(db, a));
    const bad = deps.find((d) => d && isEnded(d.state) && d.state !== 'done');
    if (bad) {
      end(db, j, 'cancelled', now, { reason: `Waited for ${bad.name}, which ${HOW[bad.state]}` });
      changed.push(jobKey(j.id));
      continue;
    }
    const free = !j.queue || !taken.has(j.queue);
    if (j.queue) taken.add(j.queue);
    if (!free || deps.some((d) => d && d.state !== 'done')) continue;
    j.state = 'running';
    j.startedAt = now;
    save(db, j);
    changed.push(jobKey(j.id));
  }
  return changed;
}

// ---- reports, stopping, and runners that are gone ---------------------------------------------------------------------------

/** What the `job` command says of its job: its command started, or ended. */
export function report(db: DB, j: Registered, r: JobReport, now: number, graceMs: number) {
  if (j.adopted) throw new HttpError(400, 'An adopted job ends when its process does');
  if (r.state === 'running') {
    if (!safePid(r.pid)) throw new HttpError(400, 'Which process runs it?');
    // Started although it was cancelled or stopped meanwhile: it ends.
    if (isEnded(j.state)) {
      if (j.stopAsked) terminate(r.pid, graceMs);
      return;
    }
    if (!j.commandPid) j.startedAt = now;
    j.state = 'running';
    j.commandPid = r.pid;
    save(db, j);
    if (j.stopAsked) terminate(r.pid, graceMs);
    return;
  }
  if (!['done', 'failed', 'stopped'].includes(r.state)) throw new HttpError(400, 'A job ends done, failed or stopped');
  if (isEnded(j.state)) return;
  const exitCode = typeof r.exitCode === 'number' ? r.exitCode : undefined;
  // A command that answered a stop by exiting with an error was still stopped.
  const state: JobState = j.stopAsked && r.state === 'failed' ? 'stopped' : r.state;
  if (j.state === 'queued' && state === 'stopped') return end(db, j, 'cancelled', now, { reason: 'Stopped while it waited' });
  const reason = state === 'failed' ? (r.signal ? `Ended by ${String(r.signal).slice(0, 20)}` : exitCode !== undefined ? `Exit code ${exitCode}` : undefined) : state === 'stopped' ? 'Stopped' : undefined;
  end(db, j, state, now, { reason, exitCode });
}

/**
 * Stops a registered job: one that waits is cancelled at once; a running command's process group is asked to end, an
 * adopted job's process alone.
 */
export function stopRegistered(db: DB, j: Registered, now: number, graceMs: number) {
  if (j.foreign) throw new HttpError(409, 'It runs as another user: it cannot be stopped from here');
  j.stopAsked = now;
  if (j.adopted) {
    save(db, j);
    return terminateOne(j.pid, j.pidStart, graceMs);
  }
  if (j.state === 'queued') return end(db, j, 'cancelled', now, { reason: 'Stopped while it waited' });
  save(db, j);
  // Not yet started: it is ended as soon as it says which process it is.
  if (j.commandPid) terminate(j.commandPid, graceMs);
  if (!processAlive(j.pid, j.pidStart)) end(db, j, 'stopped', now, { reason: 'Stopped' });
}

/** Ends the jobs whose `job` process is gone without having said how they ended, and the adopted ones whose process is. */
export function checkRunners(db: DB, now: number): string[] {
  const gone: string[] = [];
  for (const j of activeRegistered(db)) {
    if (processAlive(j.pid, j.pidStart)) continue;
    if (j.stopAsked) end(db, j, 'stopped', now, { reason: 'Stopped' });
    else if (j.adopted) {
      // Gone, and nobody was its parent: it counts as done, for what waits for it, and says that how is not known.
      j.exitUnknown = true;
      end(db, j, 'done', now);
    } else end(db, j, 'failed', now, { reason: 'Its job command ended without a word' });
    gone.push(jobKey(j.id));
  }
  return gone;
}
