// What runs in the background besides the `job` command's own jobs: sessions' background tasks (here and in VS Code or
// a terminal), Hydor subagents at work, and runs of Experiments; and which of them has ended. A background task that is
// a `job run` is the job, not a task of its own.
import fs from 'node:fs';
import { commandSig, looksLikeServer } from '../../shared/job-progress.ts';
import { ACTIVE, type RunRecord, type RunStatus } from '../../shared/experiments.ts';
import type { JobEntry, JobKind, JobProgress, JobState } from '../../shared/jobs.ts';
import type { BackgroundTask } from '../../shared/types.ts';
import { isRunningStatus, parentOf, workStatus } from '../children/family.ts';
import type { DB } from '../db.ts';
import { files } from '../experiments/local.ts';
import { getRun, listRuns, runFolder } from '../experiments/records.ts';
import type { Deps } from '../features/types.ts';
import { sessionExtra } from '../sessionExtra.ts';
import type { BackgroundWork } from '../sessions.ts';
import { spaceById } from '../spaces/index.ts';
import { taskOutputPath } from '../tasklog.ts';
import { adoptedTasks, KEEP_MS, sessionRegistered, type Registered } from './store.ts';
import { headOf } from './watch.ts';

/** Something seen at work, or ended, with what is needed to follow it. */
export interface Seen {
  entry: JobEntry;
  /** What command it ran, for "the same job took this long before". */
  sig?: string;
  /** Its output file, while there is one to read. */
  file?: string | null;
  /** A progress its record gives (a run of Experiments). */
  progress?: JobProgress;
  /** A background task: its session, its own id, and whether the session runs outside the app. */
  task?: { key: string; id: string; external: boolean };
}

export interface Observed {
  running: Seen[];
  queued: Seen[];
  ended: Seen[];
  /** Background tasks that are a `job` job: neither shown nor recorded. */
  hidden: Set<string>;
  work: BackgroundWork[];
}

export const cut = (s: string | undefined, max: number) => (s && s.length > max ? `${s.slice(0, max - 1)}…` : s);
export const sessionHref = (key: string) => `/s/${encodeURIComponent(key)}`;

export function kindOf(kind?: string): JobKind {
  // As the page's work tray reads it (web/src/lib/activity.ts taskKindOf); a workflow is "any other task" here.
  const k = (kind ?? '').toLowerCase();
  if (k.includes('bash') || k.includes('shell') || k === 'command') return 'command';
  if (k.includes('agent')) return 'subagent';
  return k.includes('monitor') ? 'monitor' : 'task';
}

const stateOfTask = (status: string): JobState => (status === 'failed' ? 'failed' : status === 'stopped' || status === 'killed' ? 'stopped' : 'done');

/** What a session is called, and its project: read once for each gathering. */
export function sessionInfo(d: Deps, key: string): JobEntry['session'] {
  const s = d.sessions.summary(key);
  if (!s) return undefined;
  const space = typeof s.extra?.space === 'string' ? spaceById(d.db, s.extra.space) : null;
  return { key, title: s.title, ...(space ? { project: { id: space.id, name: space.name } } : {}) };
}

// ---- `job run` tasks ------------------------------------------------------------------------------------------------------

/** Whether a command line runs `job run`. */
export const runsJob = (command: string) => /(^|[;&|(\s/\\])job(\.cmd)?\s+run(\s|$)/.test(command);

/** How long after its job ended a task that ran it may still be listed. */
const LAG_MS = 60_000;

/** Whether a task is the work of an adopted process: that process writes into the task's output file. */
function isAdoptedTask(t: BackgroundTask, file: string, adopted: Registered[], now: number): boolean {
  const until = t.status === 'running' ? now : (t.endedAt ?? now);
  const mine = adopted.filter((j) => !j.endedAt || j.endedAt >= until - LAG_MS);
  if (!mine.length) return false;
  try {
    const at = fs.realpathSync(file);
    return mine.some((j) => j.taskOutput === at);
  } catch {
    return false;
  }
}

/**
 * Whether a background task is the `job run` of one of its session's registered jobs: a command, with a job registered
 * while it ran and not long over before it ended, which its command (or, while that is not known, its description) or
 * the first lines of its output name.
 */
export function isJobTask(t: BackgroundTask, command: string | undefined, jobs: Registered[], head: () => string, now: number): boolean {
  // Never a subagent or a monitor, whatever its words say.
  if (kindOf(t.kind) !== 'command' && kindOf(t.kind) !== 'task') return false;
  const until = t.status === 'running' ? now : (t.endedAt ?? now);
  const near = jobs.filter((j) => (!t.startedAt || j.queuedAt >= t.startedAt - 5000) && j.queuedAt <= until + 5000 && (!j.endedAt || j.endedAt >= until - LAG_MS));
  if (!near.length) return false;
  if (command ? runsJob(command) : runsJob(t.description) || /^job\s/.test(t.description)) return true;
  const text = head();
  return near.some((j) => text.includes(`job ${j.id} `));
}

// ---- sessions' background tasks ----------------------------------------------------------------------------------------------

export class Gatherer {
  /** Output files and commands found, so each is looked for once. */
  private found = new Map<string, { file?: string; command?: string }>();
  /** When each Hydor subagent now at work was first seen working. */
  private childSince = new Map<string, number>();

  constructor(private d: Deps) {}

  private get db(): DB {
    return this.d.db;
  }

  private taskParts(w: BackgroundWork, t: BackgroundTask, agent: string, sessionId: string): { file: string | null; command?: string } {
    const id = `task:${w.key}:${t.id}`;
    const known = this.found.get(id) ?? {};
    this.found.set(id, known);
    if (!known.file && agent === 'claude') known.file = taskOutputPath(sessionId, t.id) ?? undefined;
    // Codex's description of a command is the command.
    if (!known.command) known.command = agent === 'codex' ? t.description : t.toolUseId ? this.d.sessions.taskCommand(w.key, t.toolUseId) : undefined;
    return { file: known.file ?? null, command: known.command };
  }

  /** One session's tasks, running and lately ended. */
  private tasks(w: BackgroundWork, adopted: Registered[], out: Observed, now: number) {
    // Those ended and already kept need nothing more.
    const kept = this.db.prepare('select ended_at from bg_jobs where id = ?');
    const fresh = w.ended.filter((t) => (t.endedAt ?? 0) >= now - KEEP_MS && (kept.get(`task:${w.key}:${t.id}`) as { ended_at: number } | undefined)?.ended_at !== t.endedAt);
    if (!w.running.length && !fresh.length) return;
    const s = this.d.sessions.summary(w.key);
    if (!s) return;
    const session = sessionInfo(this.d, w.key);
    const jobs = sessionRegistered(this.db, w.key, now - KEEP_MS);
    for (const t of [...w.running, ...fresh]) {
      const id = `task:${w.key}:${t.id}`;
      const running = t.status === 'running';
      const { file, command } = this.taskParts(w, t, s.agent, s.id);
      if ((file && isAdoptedTask(t, file, adopted, now)) || (jobs.length && isJobTask(t, command, jobs, () => (file ? headOf(file) : ''), now))) {
        out.hidden.add(id);
        continue;
      }
      // The transcript says which command it was once it has been read: asked for, for the next look.
      if (jobs.length && !command && s.agent === 'claude' && !w.external) void this.d.sessions.timeline(w.key).catch(() => {});
      // A command that serves (a dev server, an API) runs until it is stopped: it is listed apart, with no end to wait for.
      const kind = kindOf(t.kind) === 'command' && looksLikeServer(command, t.description) ? 'server' : kindOf(t.kind);
      const entry: JobEntry = {
        id,
        kind,
        state: running ? 'running' : stateOfTask(t.status),
        name: cut(t.description || command || t.id, 200)!,
        command: cut(command, 500),
        cwd: s.cwd,
        session,
        startedAt: t.startedAt,
        endedAt: running ? undefined : t.endedAt,
        output: s.agent === 'claude' ? { kind: 'task', sessionKey: w.key, taskId: t.id } : undefined,
        href: sessionHref(w.key),
        // Only a session this app runs can be told to stop one; Codex lets none be stopped.
        stoppable: running && !w.external && s.agent !== 'codex' ? true : undefined,
      };
      // Only a command says by its words that it is the same job again.
      const sig = kind === 'command' ? commandSig(command ?? t.description) : undefined;
      (running ? out.running : out.ended).push({ entry, sig, file, task: { key: w.key, id: t.id, external: w.external } });
    }
  }

  // ---- Hydor subagents ---------------------------------------------------------------------------------------------------

  private child(w: BackgroundWork, out: Observed, now: number) {
    if (w.external) return;
    const parent = parentOf(this.db, w.key);
    if (!parent || !isRunningStatus(workStatus({ status: w.status as any, backgroundTasks: w.running }))) return;
    const s = this.d.sessions.summary(w.key);
    if (!s) return;
    const since = this.childSince.get(w.key) ?? w.turnStartedAt ?? w.startedAt ?? now;
    this.childSince.set(w.key, since);
    out.running.push({
      entry: { id: `child:${w.key}`, kind: 'hydor-subagent', state: 'running', name: cut(s.title, 200)!, cwd: s.cwd, session: sessionInfo(this.d, parent), startedAt: since, href: sessionHref(w.key), stoppable: true },
    });
  }

  /** How a Hydor subagent that stopped working ended: its entry as it was, closed. */
  childEnded(was: Seen, work: BackgroundWork[], stoppedHere: boolean, now: number): Seen {
    const key = was.entry.id.slice('child:'.length);
    this.childSince.delete(key);
    const w = work.find((x) => x.key === key);
    const extra = sessionExtra(this.db, key);
    const since = was.entry.startedAt ?? now;
    const stopped = stoppedHere || Math.max(Number(extra.stoppedAll) || 0, Number(extra.stoppedWithParent) || 0) >= since;
    const state: JobState = stopped ? 'stopped' : w?.status === 'error' ? 'failed' : 'done';
    return { entry: { ...was.entry, state, endedAt: now, stoppable: undefined, reason: state === 'failed' ? cut(w?.error, 300) : state === 'stopped' ? 'Stopped' : undefined } };
  }

  // ---- runs of Experiments --------------------------------------------------------------------------------------------------

  run(r: RunRecord, sessions: Map<string, JobEntry['session']>): Seen {
    const state: JobState = r.status === 'queued' || r.status === 'waiting' ? 'queued' : r.status === 'starting' || r.status === 'running' ? 'running' : r.status === 'done' ? 'done' : r.status === 'stopped' ? (r.startedAt ? 'stopped' : 'cancelled') : 'failed';
    const by = r.startedBy?.session;
    if (by && !sessions.has(by)) sessions.set(by, sessionInfo(this.d, by));
    const p = r.metrics?.progress;
    const live = ACTIVE.includes(r.status);
    return {
      entry: {
        id: `run:${r.id}`,
        kind: 'experiment',
        state,
        name: cut(r.name || r.group || r.command, 200)!,
        command: cut(r.command, 500),
        cwd: r.cwd,
        session: by ? sessions.get(by) : undefined,
        queuedAt: r.createdAt,
        startedAt: r.startedAt,
        endedAt: r.endedAt,
        exitCode: r.exitCode ?? undefined,
        waitingFor: state === 'queued' ? (r.why ?? (r.gpus ? 'a free GPU' : 'a free slot')) : undefined,
        reason: live ? undefined : r.why,
        output: { kind: 'run', runId: r.id },
        href: `/experiments/${encodeURIComponent(r.id)}`,
        stoppable: live && !r.stopping ? true : undefined,
      },
      sig: commandSig(r.command),
      // A run kept on another machine has its log there.
      file: r.remote ? null : files(r.folder ?? runFolder(r.id)).log,
      progress: p && p.total > 0 ? { fraction: Math.min(1, p.done / p.total), text: `${p.done}/${p.total}`, at: p.at } : undefined,
    };
  }

  /** A run that was seen and is over, as it ended. */
  runEnded(id: string): Seen | null {
    const r = getRun(this.db, id.slice('run:'.length));
    return r && !ACTIVE.includes(r.status) ? this.run(r, new Map()) : null;
  }

  private runs(out: Observed, now: number) {
    const sessions = new Map<string, JobEntry['session']>();
    for (const r of listRuns(this.db, { status: ACTIVE, limit: 500, oldest: true })) {
      const seen = this.run(r, sessions);
      (seen.entry.state === 'queued' ? out.queued : out.running).push(seen);
    }
    const over: RunStatus[] = ['done', 'failed', 'stopped', 'lost'];
    const kept = this.db.prepare('select ended_at from bg_jobs where id = ?');
    for (const r of listRuns(this.db, { status: over, limit: 100 })) {
      if ((r.endedAt ?? 0) < now - KEEP_MS || (kept.get(`run:${r.id}`) as { ended_at: number } | undefined)?.ended_at === r.endedAt) continue;
      out.ended.push(this.run(r, sessions));
    }
  }

  observe(now: number): Observed {
    const work = this.d.sessions.backgroundWork();
    const out: Observed = { running: [], queued: [], ended: [], hidden: new Set(), work };
    const adopted = adoptedTasks(this.db, now - KEEP_MS);
    for (const w of work) {
      try {
        this.tasks(w, adopted, out, now);
        this.child(w, out, now);
      } catch (e) {
        console.error(`[jobs] ${w.key}: ${(e as Error).message}`);
      }
    }
    this.runs(out, now);
    // What is no longer there is looked for again if it comes back.
    const there = new Set(work.flatMap((w) => [...w.running, ...w.ended].map((t) => `task:${w.key}:${t.id}`)));
    for (const id of this.found.keys()) if (!there.has(id)) this.found.delete(id);
    return out;
  }
}
