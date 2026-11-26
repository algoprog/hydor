// The Jobs section (/jobs): long work that sessions run in the background, all in one place (shared/jobs.ts). This
// capability gathers it, follows its progress, estimates the time left, keeps what ended for a week, decides when a job
// run with the `job` command may start, serves the page (/api/jobs) and the command (/agent/jobs), sorts the work by its
// tags, and gives every session's shell the command's address and token.
import fs from 'node:fs';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { commandSig } from '../../shared/job-progress.ts';
import { JOB_ENDED, JOBS_ENV, normalTags, type JobCounts, type JobEntry, type JobGo, type JobLog, type JobRegister, type JobRegistered, type JobReport, type JobsList, type JobsQuery, type JobTagsSet } from '../../shared/jobs.ts';
import { AuthManager, HttpError } from '../auth.ts';
import { config } from '../config.ts';
import { files } from '../experiments/local.ts';
import { runView } from '../experiments/api.ts';
import { stopRun } from '../experiments/queue.ts';
import { getRun, runFolder } from '../experiments/records.ts';
import type { Deps, Feature } from '../features/types.ts';
import { allSpaces } from '../spaces/index.ts';
import { plain, readTail, readTaskLog, taskOutputPath } from '../tasklog.ts';
import { jobsRunOf, jobsToken, signedIn } from './auth.ts';
import { cut, Gatherer, sessionHref, sessionInfo, type Observed, type Seen } from './gather.ts';
import { doneAt, folderProjects, onlyProjects, projectIds, withProject } from './projects.ts';
import { adopt, checkRunners, logOfJob, pendingDeps, register, report, save, schedule, stopRegistered, waitingWords } from './schedule.ts';
import { activeRegistered, countTags, endedRows, entryId, forgetItemTags, forgetSeen, getRegistered, getSeen, hideEnded, historyMs, isEnded, itemTags, jobKey, jobsSchema, prune, saveSeen, setItemTags, tagKnown, tagsInUse, withTags, type Registered } from './store.ts';
import { confidentialSession, HelperTags, helperTagger, type TagWork } from './tags.ts';
import { estimateRunning, Watcher } from './watch.ts';

const LOG_BYTES = 64 << 10;
const PRUNE_EVERY_MS = 3600_000;
/** Sessions change often while agents work: however often, they are looked at once in this long. */
const POKE_MS = 1000;
const NO_OUTPUT = 'This job has no output to show.';
/** How many tags in use a list holds, and a registration names. */
const LISTED_TAGS = 50;
const NAMED_TAGS = 12;

export interface JobsOptions {
  /** Between looks while something runs or waits, and while nothing does. */
  tickMs?: number;
  idleMs?: number;
  /** The longest GET /agent/jobs/:id/go holds its answer. */
  pollMs?: number;
  /** From asking a command to end to killing it. */
  killMs?: number;
  /** Picks tags for work that has none (default: the helper model). */
  tagWork?: TagWork;
}

export interface Jobs extends Feature {
  /** Looks once: runners gone, jobs to start, what runs and what ended; tells the pages new counts. */
  tick(now?: number): Observed;
  list(ended?: number, now?: number): JobsList;
  stop(): void;
}

/** Who a request to /agent/jobs is: a session's run (`live` while its agent process is there), or someone signed in. */
interface Caller {
  session?: string;
  runId?: string;
  live: boolean;
}

/** The capability; a function so a test can give it deps and times of its own. */
export function createJobs(o: JobsOptions = {}): Jobs {
  const tickMs = o.tickMs ?? 5000;
  const idleMs = o.idleMs ?? 30_000;
  const pollMs = o.pollMs ?? 25_000;
  const killMs = o.killMs ?? 10_000;
  let d: Deps;
  let gather: Gatherer;
  let helperTags: HelperTags;
  const watcher = new Watcher();
  /** What was at work at the last look, to notice what ended without saying so. */
  let before = new Map<string, Seen>();
  /** Hydor subagents stopped from here, by session. */
  const stoppedChildren = new Set<string>();
  /** The `job` commands waiting to hear whether to start. */
  const waiters = new Map<string, Set<() => void>>();
  let counts: JobCounts = { running: 0, queued: 0 };
  /** By session: its jobs and runs of Experiments that wait or run, beside its own background tasks (SessionSummary.jobs). */
  let bySession = new Map<string, number>();
  let timer: NodeJS.Timeout | null = null;
  let poking: NodeJS.Timeout | null = null;
  let started = false;
  let prunedAt = 0;

  const wake = (id: string) => {
    for (const fn of waiters.get(id) ?? []) fn();
  };

  // ---- looking -----------------------------------------------------------------------------------------------------------

  /** Keeps something that ended, with what its output said last. */
  function record(s: Seen, now: number) {
    const id = s.entry.id;
    const read = s.file ? watcher.read(id, s.file, now) : watcher.get(id);
    const entry: JobEntry = { ...s.entry, stoppable: undefined, endedAt: s.entry.endedAt ?? now, progress: s.progress ?? read?.progress, lastLine: read?.lastLine };
    saveSeen(d.db, entry, s.sig);
  }

  /** How something that was at work at the last look, and is neither at work nor listed as ended, ended. */
  function vanished(was: Seen, seen: Observed, now: number) {
    const { id, kind } = was.entry;
    if (kind === 'experiment') {
      const run = gather.runEnded(id);
      if (run) record(run, now);
    } else if (kind === 'hydor-subagent') {
      const key = id.slice('child:'.length);
      record(gather.childEnded(was, seen.work, stoppedChildren.delete(key), now), now);
    } else if (was.task && !seen.hidden.has(id)) {
      const there = was.task.external || seen.work.some((w) => w.key === was.task!.key && w.status !== 'exited' && w.status !== 'error');
      // Without a word of how it went, it says nothing about how long the command takes.
      const entry: JobEntry = { ...was.entry, state: there ? 'done' : 'stopped', ...(there ? { exitUnknown: true } : {}), reason: there ? 'It ended; how is not known' : 'Its session’s agent stopped', endedAt: now };
      record({ ...was, entry, sig: undefined }, now);
    }
  }

  function follow(seen: Observed, jobs: Registered[], now: number) {
    for (const s of seen.running) {
      if (s.entry.kind === 'experiment') {
        watcher.note(s.entry.id, s.progress, now);
        if (s.file) {
          // Its record says how far it is; its log only what it said last.
          const read = watcher.read(`${s.entry.id}:log`, s.file, now);
          const own = watcher.get(s.entry.id)!;
          own.lastLine = read.lastLine;
        }
      } else watcher.read(s.entry.id, s.file, now);
    }
    for (const j of jobs) if (j.state === 'running') watcher.read(jobKey(j.id), logOfJob(j), now, j.progressPattern, j.progressTotal);
    const keep = new Set([...seen.running.flatMap((s) => [s.entry.id, `${s.entry.id}:log`]), ...jobs.map((j) => jobKey(j.id))]);
    watcher.keepOnly(keep);
  }

  /**
   * What each session still has at work here that its own summary does not count: its registered jobs queued or running
   * and the runs of Experiments it started that wait or run, less its own background tasks that run one of those jobs
   * (seen.hidden: those count among its background tasks already). A session whose count changed is listed again, and
   * so shows Working, or its held "Finished" notice goes out, as its work ends.
   */
  function perSession(seen: Observed, jobs: Registered[]) {
    const next = new Map<string, number>();
    const add = (key: string | undefined, n: number) => {
      if (key) next.set(key, (next.get(key) ?? 0) + n);
    };
    for (const j of jobs) add(j.session, 1);
    for (const s of [...seen.running, ...seen.queued]) if (s.entry.kind === 'experiment') add(s.entry.session?.key, 1);
    for (const w of seen.work) for (const t of w.running) if (seen.hidden.has(`task:${w.key}:${t.id}`) && next.has(w.key)) add(w.key, -1);
    for (const [k, n] of next) if (n <= 0) next.delete(k);
    const was = bySession;
    bySession = next;
    for (const k of new Set([...was.keys(), ...next.keys()])) if (was.get(k) !== next.get(k)) d.sessions.queueSummary(k);
  }

  function tell(now: JobCounts) {
    if (now.running === counts.running && now.queued === counts.queued) return;
    const idle = !(counts.running + counts.queued);
    counts = now;
    d.broadcast({ t: 'jobs', ...now });
    // Something runs where nothing did: looked at often from now on.
    if (started && idle) next();
  }

  function tick(now = Date.now()): Observed {
    if (now - prunedAt >= PRUNE_EVERY_MS) {
      prunedAt = now;
      prune(d.db, now);
    }
    for (const id of [...checkRunners(d.db, now), ...schedule(d.db, now)]) wake(id);
    const seen = gather.observe(now);
    for (const s of seen.ended) record(s, now);
    const at = new Map([...seen.running, ...seen.queued].map((s) => [s.entry.id, s]));
    const listed = new Set(seen.ended.map((s) => s.entry.id));
    for (const [id, was] of before) if (!at.has(id) && !listed.has(id)) vanished(was, seen, now);
    // A task taken for ended that is there again, and one that turned out to be a job, are not in the Finished list.
    for (const id of [...at.keys(), ...seen.hidden]) forgetSeen(d.db, id);
    before = at;
    const jobs = activeRegistered(d.db);
    follow(seen, jobs, now);
    perSession(seen, jobs);
    // Servers run until stopped: they are not counted with the jobs that run.
    const work = seen.running.filter((s) => s.entry.kind !== 'server').length;
    tell({ running: work + jobs.filter((j) => j.state === 'running').length, queued: seen.queued.length + jobs.filter((j) => j.state === 'queued').length });
    return seen;
  }

  function safeTick() {
    try {
      tick();
    } catch (e) {
      console.error(`[jobs] ${(e as Error).message}`);
    }
  }

  function next() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(
      () => {
        safeTick();
        next();
      },
      counts.running + counts.queued ? tickMs : idleMs,
    );
    timer.unref();
  }

  /** Something changed: looked at in a moment. */
  function poke() {
    if (!started || poking) return;
    poking = setTimeout(() => {
      poking = null;
      safeTick();
    }, POKE_MS);
    poking.unref();
  }

  // ---- entries -----------------------------------------------------------------------------------------------------------

  function registeredEntry(j: Registered, sessions: Map<string, JobEntry['session']>): JobEntry {
    if (j.session && !sessions.has(j.session)) sessions.set(j.session, sessionInfo(d, j.session));
    const id = jobKey(j.id);
    const active = !isEnded(j.state);
    const read = active ? watcher.get(id) : undefined;
    return {
      id,
      kind: 'job',
      state: j.state,
      name: j.name,
      command: cut(j.command, 500),
      cwd: j.cwd || undefined,
      session: j.session ? sessions.get(j.session) : undefined,
      // An adopted job never waited: it was at work before it was a job.
      queuedAt: j.adopted ? undefined : j.queuedAt,
      startedAt: j.startedAt,
      endedAt: j.endedAt,
      exitCode: j.exitCode,
      exitUnknown: j.exitUnknown,
      after: j.after.length ? j.after : undefined,
      queue: j.queue,
      tags: j.tags,
      tagsFrom: j.tags ? (j.tagsBy ?? 'agent') : undefined,
      progress: read?.progress ?? j.progress,
      lastLine: read?.lastLine ?? j.lastLine,
      reason: j.reason,
      output: j.log ? { kind: 'job' } : undefined,
      href: j.session ? sessionHref(j.session) : undefined,
      stoppable: active && !j.stopAsked && !j.foreign ? true : undefined,
    };
  }

  function runningEntry(s: Seen, now: number): JobEntry {
    const read = watcher.get(s.entry.id);
    const estimate = estimateRunning({ reading: read, samples: watcher.samples(s.entry.id), startedAt: s.entry.startedAt, historyMs: historyMs(d.db, s.sig, s.entry.cwd), now });
    return { ...s.entry, progress: s.progress ?? read?.progress, lastLine: read?.lastLine, estimate };
  }

  /**
   * The registered jobs at work: running ones with their time left; queued ones, in the order they were registered, with
   * when they should start (when everything before them should end) and end, and their place in their queue.
   */
  function registeredNow(sessions: Map<string, JobEntry['session']>, now: number): { running: JobEntry[]; queued: JobEntry[] } {
    const jobs = activeRegistered(d.db);
    const ends = new Map<string, number | undefined>();
    /** The job ahead in each queue, and how many wait in it. */
    const ahead = new Map<string, string>();
    const places = new Map<string, number>();
    const running = jobs
      .filter((j) => j.state === 'running')
      .map((j) => {
        const id = jobKey(j.id);
        const history = historyMs(d.db, commandSig(j.command), j.cwd);
        const estimate = estimateRunning({ reading: watcher.get(id), samples: watcher.samples(id), startedAt: j.startedAt, etaMs: j.etaMs, historyMs: history, now });
        ends.set(id, estimate?.endsAt);
        if (j.queue) ahead.set(j.queue, id);
        return { ...registeredEntry(j, sessions), estimate };
      });
    const queued = jobs
      .filter((j) => j.state === 'queued')
      .map((j) => {
        const id = jobKey(j.id);
        const entry: JobEntry = { ...registeredEntry(j, sessions), waitingFor: waitingWords(d.db, j) };
        const blockers = pendingDeps(d.db, j).map((x) => jobKey(x.id));
        if (j.queue) {
          const front = ahead.get(j.queue);
          if (front) blockers.push(front);
          ahead.set(j.queue, id);
          places.set(j.queue, (places.get(j.queue) ?? 0) + 1);
          entry.position = places.get(j.queue);
        }
        const until = blockers.map((b) => ends.get(b));
        // One that is over its estimate says nothing about when it will end.
        if (until.every((t): t is number => t !== undefined && t > now)) {
          entry.startsAt = Math.max(now, ...(until as number[]));
          const history = historyMs(d.db, commandSig(j.command), j.cwd);
          const takes = j.etaMs ?? history;
          if (takes) entry.estimate = { endsAt: entry.startsAt + takes, source: j.etaMs ? 'agent' : 'history', confidence: 'low' };
        }
        ends.set(id, entry.estimate?.endsAt);
        return entry;
      });
    return { running, queued };
  }

  /** The list as it is now, each entry with its tags (store.ts withTags). */
  function gathered(limit: number, now: number): JobsList {
    const seen = tick(now);
    const sessions = new Map<string, JobEntry['session']>();
    const mine = registeredNow(sessions, now);
    const live = [...mine.running, ...seen.running.map((s) => runningEntry(s, now))].sort((a, b) => (a.startedAt ?? a.queuedAt ?? now) - (b.startedAt ?? b.queuedAt ?? now));
    const running = live.filter((e) => e.kind !== 'server');
    const servers = live.filter((e) => e.kind === 'server');
    const queued = [...mine.queued, ...seen.queued.map((s) => s.entry)].sort((a, b) => (a.startsAt ?? Infinity) - (b.startsAt ?? Infinity) || (a.queuedAt ?? 0) - (b.queuedAt ?? 0));
    const at = new Set([...live, ...queued].map((e) => e.id));
    const ended = endedRows(d.db, now, limit, at).map((r) => ('job' in r ? registeredEntry(r.job, sessions) : r.entry));
    const allDoneAt = doneAt([...running, ...queued], now);
    const items = itemTags(d.db);
    const byFolder = folderProjects(allSpaces(d.db));
    const tagged = (entries: JobEntry[]) => entries.map((e) => withProject(withTags(e, items), byFolder));
    return { running: tagged(running), queued: tagged(queued), servers: tagged(servers), ended: tagged(ended), allDoneAt, tags: tagsInUse(d.db, LISTED_TAGS), at: now };
  }

  /** The list for someone who asked for it: work with no tags is then put to the helper model, in the background. */
  function list(limit = 100, now = Date.now(), project?: string): JobsList {
    const l = gathered(limit, now);
    helperTags.ask([...l.running, ...l.queued, ...l.servers, ...l.ended], now);
    return project ? onlyProjects(l, projectIds(project, allSpaces(d.db))) : l;
  }

  /** One job by its id, wherever it is in the list; also one cleared from the Finished list. */
  function find(id: string): JobEntry | null {
    const now = gathered(500, Date.now());
    const listed = [...now.running, ...now.queued, ...now.servers, ...now.ended].find((e) => e.id === id);
    if (listed) return listed;
    const j = getRegistered(d.db, id);
    const e = j ? registeredEntry(j, new Map()) : getSeen(d.db, id);
    return e && withProject(withTags(e, itemTags(d.db)), folderProjects(allSpaces(d.db)));
  }

  function mustFind(id: string): JobEntry {
    const e = find(entryId(id));
    if (!e) throw new HttpError(404, 'There is no such job');
    return e;
  }

  // ---- tags -----------------------------------------------------------------------------------------------------------------

  /** Counts tags given into those in use; a confidential session's words stay out of them, which others are told. */
  function count(session: string | undefined, tags: string[], now: number) {
    if (!session || !confidentialSession(d.db, session)) countTags(d.db, tags, now);
  }

  /** Tags given on the page or by `job tag`, for any entry: a `job` job's own; for other work, those kept for it. None clears them. */
  function setTags(id: string, b: Partial<JobTagsSet> | null | undefined, by: 'person' | 'agent'): { job: JobEntry } {
    if (!Array.isArray(b?.tags)) throw new HttpError(400, 'Which tags? A list of them, empty to clear them');
    const e = mustFind(id);
    const tags = normalTags(b.tags);
    const now = Date.now();
    const job = getRegistered(d.db, e.id);
    if (job) {
      job.tags = tags.length ? tags : undefined;
      job.tagsBy = tags.length ? by : undefined;
      save(d.db, job);
    } else if (tags.length) setItemTags(d.db, e.id, tags, by, now);
    else forgetItemTags(d.db, e.id);
    count(e.session?.key, tags, now);
    d.broadcast({ t: 'jobs', ...counts });
    return { job: mustFind(id) };
  }

  // ---- stopping, clearing, output ----------------------------------------------------------------------------------------

  async function stopJob(id: string) {
    const e = mustFind(id);
    if (JOB_ENDED.includes(e.state)) throw new HttpError(409, 'It has already ended');
    const job = getRegistered(d.db, e.id);
    if (job) {
      stopRegistered(d.db, job, Date.now(), killMs);
      wake(e.id);
    } else if (e.kind === 'experiment') await stopRun(d, e.id.slice('run:'.length));
    else if (e.kind === 'hydor-subagent') {
      const key = e.id.slice('child:'.length);
      stoppedChildren.add(key);
      await d.sessions.stop(key);
    } else {
      const task = before.get(e.id)?.task;
      if (!task || !e.stoppable) throw new HttpError(409, 'It cannot be stopped from here');
      await d.sessions.stopTask(task.key, task.id);
    }
    safeTick();
  }

  function clearOne(id: string) {
    const e = mustFind(id);
    if (!JOB_ENDED.includes(e.state)) throw new HttpError(409, 'It has not ended yet');
    hideEnded(d.db, e.id);
  }

  const logOf = (file: string): JobLog => {
    const t = readTail(file, LOG_BYTES);
    return { text: plain(t.text), size: t.size, truncated: t.truncated, updatedAt: fs.statSync(file).mtimeMs };
  };

  /** The end of a job's output as plain text; an agent's task gives its steps, one a line. */
  async function log(id: string): Promise<JobLog> {
    const e = mustFind(id);
    const out = e.output;
    if (out?.kind === 'job') {
      const j = getRegistered(d.db, e.id);
      const file = j ? logOfJob(j) : undefined;
      if (file && fs.existsSync(file)) return logOf(file);
    } else if (out?.kind === 'task') {
      const s = d.sessions.summary(out.sessionKey);
      const file = s?.agent === 'claude' ? taskOutputPath(s.id, out.taskId) : null;
      if (file && fs.existsSync(file)) {
        const t = readTaskLog(file);
        const text = t.kind === 'agent' ? (t.entries ?? []).map((x) => [x.tool, x.text].filter(Boolean).join(': ')).join('\n') : (t.text ?? '');
        return { text, size: t.size, truncated: t.truncated, updatedAt: t.updatedAt };
      }
    } else if (out?.kind === 'run') {
      const r = getRun(d.db, out.runId);
      if (r?.remote) return { text: plain((await runView(d, r.id, 300)).log), updatedAt: r.outputAt ?? Date.now() };
      const file = r ? files(r.folder ?? runFolder(r.id)).log : null;
      if (file && fs.existsSync(file)) return logOf(file);
    }
    throw new HttpError(404, NO_OUTPUT);
  }

  // ---- the `job` command ---------------------------------------------------------------------------------------------------

  function registerJob(b: Partial<JobRegister>, who: Caller): JobRegistered {
    const now = Date.now();
    // The app's own sign-in may say whose work it is (a person, or an agent adopting another session's); a run is its own.
    const named = typeof b.session === 'string' ? b.session.trim() : '';
    if (named && !who.runId) {
      if (!d.sessions.summary(named)) throw new HttpError(400, `There is no session ${named}`);
      who = { ...who, session: named };
    }
    const job = b.adoptPid === undefined ? register(d.db, b, who, now) : adopt(d.db, b, who, now);
    // Whether one of its tags is new is asked before they are counted.
    const given = normalTags(b.tags);
    const newTag = given.some((t) => !tagKnown(d.db, t));
    count(job.session, given, now);
    const tags = job.tags ?? [];
    // The tags in use, then the broad ones not used yet.
    const others = () =>
      tagsInUse(d.db, NAMED_TAGS + tags.length)
        .map((t) => t.name)
        .filter((t) => !tags.includes(t))
        .slice(0, NAMED_TAGS);
    const tagged = { ...(tags.length ? { tags } : {}), ...(!tags.length || newTag ? { tagsInUse: others() } : {}) };
    const id = jobKey(job.id);
    for (const changed of schedule(d.db, now)) wake(changed);
    const after = getRegistered(d.db, id)!;
    safeTick();
    const waitingFor = after.state === 'queued' ? waitingWords(d.db, after) : after.reason;
    return { id: job.id, log: job.log, start: after.state === 'running', ...(after.state === 'running' ? {} : { waitingFor }), ...tagged };
  }

  function goNow(id: string): JobGo | null {
    const j = getRegistered(d.db, id);
    if (!j) return { cancel: 'There is no such job' };
    if (j.state === 'running') return { start: true };
    return isEnded(j.state) ? { cancel: j.reason ?? 'It has ended' } : null;
  }

  /** Holds the answer until the job may start or never will, `pollMs` at most. */
  async function go(id: string, reply: FastifyReply): Promise<JobGo> {
    safeTick();
    const now = goNow(id);
    if (now) return now;
    await new Promise<void>((resolve) => {
      const set = waiters.get(id) ?? new Set<() => void>();
      waiters.set(id, set);
      const done = () => {
        clearTimeout(t);
        reply.raw.off('close', done);
        set.delete(done);
        if (!set.size) waiters.delete(id);
        resolve();
      };
      const t = setTimeout(done, pollMs);
      set.add(done);
      reply.raw.on('close', done);
    });
    const j = getRegistered(d.db, id);
    return goNow(id) ?? { wait: waitingWords(d.db, j!) };
  }

  function caller(auth: AuthManager, req: FastifyRequest): Caller | null {
    const bearer = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization ?? ''))?.[1];
    const runId = bearer ? jobsRunOf(bearer) : null;
    if (runId) {
      const live = d.sessions.liveByRun(runId);
      return { runId, session: live?.key, live: !!live };
    }
    return signedIn(d.db, auth, req) ? { live: true } : null;
  }

  function agentRoutes() {
    const auth = new AuthManager(d.db);
    /** The caller; a run whose agent process has ended may still speak for the jobs it registered (`own`). */
    const who = (req: FastifyRequest, own?: string): Caller => {
      const c = caller(auth, req);
      if (!c || (!c.live && !(own && getRegistered(d.db, own)?.runId === c.runId))) throw new HttpError(401, 'Not a running session of Hydor, and not signed in');
      return c;
    };
    const idOf = (req: FastifyRequest) => entryId((req.params as { id: string }).id);
    const mine = (id: string): Registered => {
      const j = getRegistered(d.db, id);
      if (!j) throw new HttpError(404, 'There is no such job');
      return j;
    };
    const { app } = d;
    app.post('/agent/jobs', { bodyLimit: 64 * 1024 }, async (req) => registerJob((req.body ?? {}) as Partial<JobRegister>, who(req)));
    app.get('/agent/jobs', async (req) => {
      who(req);
      return list(limitOf(req), Date.now(), projectOf(req));
    });
    app.get('/agent/jobs/:id', async (req) => {
      who(req, idOf(req));
      return { job: mustFind(idOf(req)) };
    });
    app.get('/agent/jobs/:id/go', async (req, reply) => {
      const id = idOf(req);
      who(req, id);
      mine(id);
      return go(id, reply);
    });
    app.post('/agent/jobs/:id', { bodyLimit: 16 * 1024 }, async (req) => {
      const id = idOf(req);
      who(req, id);
      report(d.db, mine(id), (req.body ?? {}) as JobReport, Date.now(), killMs);
      for (const changed of [id, ...schedule(d.db, Date.now())]) wake(changed);
      safeTick();
      return { ok: true };
    });
    app.post('/agent/jobs/:id/stop', async (req) => {
      who(req, idOf(req));
      await stopJob(idOf(req));
      return { ok: true };
    });
    app.put('/agent/jobs/:id/tags', { bodyLimit: 16 * 1024 }, async (req) => {
      who(req, idOf(req));
      return setTags(idOf(req), req.body as Partial<JobTagsSet>, 'agent');
    });
  }

  const limitOf = (req: FastifyRequest) => {
    const n = Number((req.query as JobsQuery).ended ?? 100);
    return Number.isFinite(n) ? Math.min(500, Math.max(0, Math.floor(n))) : 100;
  };
  const projectOf = (req: FastifyRequest) => {
    const p = (req.query as JobsQuery).project;
    return typeof p === 'string' && p.trim() ? p.trim() : undefined;
  };

  return {
    id: 'jobs',
    routes(deps: Deps) {
      d = deps;
      jobsSchema(d.db);
      gather = new Gatherer(d);
      helperTags = new HelperTags(d, o.tagWork ?? helperTagger(d.db), () => d.broadcast({ t: 'jobs', ...counts }));
      d.sessions.jobsAtWork = (key) => bySession.get(key) ?? 0;
      const idOf = (req: FastifyRequest) => (req.params as { id: string }).id;
      d.app.get('/api/jobs', async (req) => list(limitOf(req), Date.now(), projectOf(req)));
      d.app.get('/api/jobs/:id/log', async (req) => log(idOf(req)));
      d.app.post('/api/jobs/:id/stop', async (req) => {
        await stopJob(idOf(req));
        return { ok: true };
      });
      d.app.put('/api/jobs/:id/tags', { bodyLimit: 16 * 1024 }, async (req) => setTags(idOf(req), req.body as Partial<JobTagsSet>, 'person'));
      d.app.delete('/api/jobs/ended', async () => {
        hideEnded(d.db);
        return { ok: true };
      });
      d.app.delete('/api/jobs/:id', async (req) => {
        clearOne(idOf(req));
        return { ok: true };
      });
      agentRoutes();
    },
    spawn(s) {
      // A public app's run takes input from anyone, and a browser-only session has no shell: neither gets the command's key.
      const extra = s.extra as { app?: { public?: boolean }; browserOnly?: boolean } | undefined;
      if (extra?.app?.public || extra?.browserOnly) return undefined;
      return { env: { [JOBS_ENV.url]: `http://127.0.0.1:${config.port}/agent/jobs`, [JOBS_ENV.token]: jobsToken(s.runId) } };
    },
    event(e) {
      if (e.t === 'sessions' || (e.t === 'feature' && e.id === 'experiments')) poke();
    },
    start() {
      started = true;
      safeTick();
      next();
    },
    stop() {
      started = false;
      if (timer) clearTimeout(timer);
      if (poking) clearTimeout(poking);
      timer = poking = null;
      for (const set of [...waiters.values()]) for (const fn of [...set]) fn();
    },
    tick,
    list,
  };
}

export const jobs = createJobs();
