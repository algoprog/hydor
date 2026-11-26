// Checks for the Jobs section's server (server/jobs): the `job` command's routes and who may call them; a job's life
// (registered, started, reported, ended) with its progress, time left and log; waiting for other jobs and for a queue's
// turn; dependencies that fail; an unknown job to wait for; a `job` process that is gone; stopping (also a command that
// ignores it); adopting a process that already runs; how long the same command took before; and what else the section gathers: sessions' background tasks
// (the `job run` ones told apart), Hydor subagents and runs of Experiments, the counts the pages are sent, clearing the
// Finished list, a week's keeping, and what a session's environment gets.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/jobs/jobs-test.ts
//   DATA_DIR=/tmp/hydor-test-jobs CUDA_VISIBLE_DEVICES= node dist/dev/jobs-test.js
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import type { JobEntry, JobRegistered, JobsList } from '../../shared/jobs.ts';
import type { BackgroundTask, ServerEvent } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import { APP_ROOT } from '../config.ts';
import { openDb } from '../db.ts';
import { insertRun, updateRun } from '../experiments/records.ts';
import type { Deps, SpawnInfo } from '../features/types.ts';
import { INTERNAL_HEADER, internalHeaders } from '../internal.ts';
import { createAccessToken } from '../machines.ts';
import type { BackgroundWork } from '../sessions.ts';
import { createSpace } from '../spaces/index.ts';
import { startFromPs } from './adopt.ts';
import { jobsRunOf, jobsToken } from './auth.ts';
import { isJobTask, kindOf, runsJob } from './gather.ts';
import { createJobs } from './index.ts';
import { processAlive } from './schedule.ts';
import { historyMs, KEEP_MS, prune, saveRegistered, type Registered } from './store.ts';
import { estimateRunning } from './watch.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
process.env.CUDA_VISIBLE_DEVICES = '';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-jobs-test-'));
const db = openDb(path.join(tmp, 'test.db'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, what: string, ms = 5000) {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) assert.fail(`timed out waiting for ${what}`);
    await sleep(25);
  }
}

// ---- processes that stand in for the `job` command and what it runs --------------------------------------------------

const children: ChildProcess[] = [];
/** A process that stays until killed, leading its own group as a job's command does. */
function proc(script = 'sleep 60'): ChildProcess {
  const c = spawn('sh', ['-c', script], { detached: true, stdio: 'ignore' });
  children.push(c);
  return c;
}
const kill = (c: ChildProcess) =>
  new Promise<void>((resolve) => {
    if (c.exitCode !== null || c.signalCode !== null) return resolve();
    c.once('exit', () => resolve());
    try {
      process.kill(-c.pid!, 'SIGKILL');
    } catch {
      resolve();
    }
  });

// ---- the session manager, as much as Jobs uses of it -----------------------------------------------------------------

const work = new Map<string, BackgroundWork>();
const runs = new Map<string, string>();
const titles = new Map<string, { title: string; extra?: Record<string, unknown> }>();
const commands = new Map<string, string>();
const stopped: string[] = [];
const sessions = {
  backgroundWork: () => [...work.values()],
  summary(key: string) {
    const s = titles.get(key);
    return s ? { key, id: key.split(':')[1], agent: key.split(':')[0], title: s.title, cwd: tmp, extra: s.extra } : null;
  },
  liveByRun: (run: string) => (runs.has(run) ? { key: runs.get(run)!, agent: 'claude', cwd: tmp } : null),
  taskCommand: (_key: string, toolUseId: string) => commands.get(toolUseId),
  timeline: async () => null,
  async stopTask(key: string, id: string) {
    stopped.push(`task ${key} ${id}`);
  },
  async stop(key: string) {
    stopped.push(`session ${key}`);
    work.delete(key);
  },
};

const space = createSpace(db, { name: 'Search', folder: tmp });
function session(key: string, title: string, extra: Record<string, unknown> = {}, o: Partial<BackgroundWork> = {}): BackgroundWork {
  titles.set(key, { title, extra });
  db.prepare('insert or replace into app_sessions (key, agent, extra, created_at, updated_at) values (?, ?, ?, ?, ?)').run(key, key.split(':')[0], JSON.stringify(extra), Date.now(), Date.now());
  const w: BackgroundWork = { key, external: false, status: 'idle', running: [], ended: [], ...o };
  work.set(key, w);
  return w;
}

const told: ServerEvent[] = [];
const http = Fastify();
http.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
  reply.code(err instanceof HttpError ? err.status : (err.statusCode ?? 500)).send({ error: err.message });
});
const deps = { app: http, db, sessions: sessions as any, scheduler: null as any, models: null as any, broadcast: (e: ServerEvent) => void told.push(e), toSubscribers: () => {}, publicBase: () => 'http://test.local' } as Deps;
const jobs = createJobs({ pollMs: 400, killMs: 300 });
jobs.routes!(deps);
await http.ready();

const RUN = 'aaaabbbbcccc';
const KEY = 'claude:lead';
runs.set(RUN, KEY);
session(KEY, 'Index the corpus', { space: space.id });
work.get(KEY)!.status = 'working';

const bearer = (run = RUN) => ({ authorization: `Bearer ${jobsToken(run)}` });
const call = async (method: 'GET' | 'POST' | 'DELETE', url: string, body?: unknown, headers: Record<string, string> = bearer()) => {
  const r = await http.inject({ method, url, headers: url.startsWith('/api/') ? internalHeaders() : headers, ...(body ? { payload: body as object } : {}) });
  return { status: r.statusCode, body: r.json() as any };
};
const listed = async () => (await call('GET', '/api/jobs')).body as JobsList;
const entry = async (id: string) => (await call('GET', `/agent/jobs/${id}`)).body.job as JobEntry;

/** Registers a job whose `job` command is a live process; what the command would be given. */
async function register(name: string, o: Record<string, unknown> = {}) {
  const runner = proc();
  const r = await call('POST', '/agent/jobs', { name, command: `make ${name.replace(/\s+/g, '-')}`, cwd: tmp, pid: runner.pid, ...o });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { ...(r.body as JobRegistered), runner };
}
const finish = (id: string, state = 'done', exitCode = 0) => call('POST', `/agent/jobs/${id}`, { state, exitCode });

// ---- tests -------------------------------------------------------------------------------------------------------------

test('a token signed for a run, or the app’s sign-in, and nothing else', async () => {
  assert.equal(jobsRunOf(jobsToken(RUN)), RUN);
  assert.equal(jobsRunOf(`${RUN}.nonsense`), null);
  assert.equal((await call('GET', '/agent/jobs', undefined, {})).status, 401);
  assert.equal((await call('GET', '/agent/jobs', undefined, { authorization: `Bearer ${RUN}.AAAAAAAAAAAAAAAAAAAAAA` })).status, 401);
  assert.equal((await call('GET', '/agent/jobs', undefined, { authorization: 'Bearer acm_not-a-token' })).status, 401);
  assert.equal((await call('GET', '/agent/jobs')).status, 200);
  assert.equal((await call('GET', '/agent/jobs', undefined, internalHeaders())).status, 200);
  assert.ok(internalHeaders()[INTERNAL_HEADER]);
  // The command line's own token, and with it a job that belongs to no session.
  const cli = { authorization: `Bearer ${createAccessToken(db, 'This computer’s command line').token}` };
  const shell = proc();
  const own = await call('POST', '/agent/jobs', { name: 'by hand', command: 'true', cwd: tmp, pid: shell.pid }, cli);
  assert.equal(own.status, 200);
  assert.equal((await entry((own.body as JobRegistered).id)).session, undefined);
  await call('POST', `/agent/jobs/${own.body.id}`, { state: 'done', exitCode: 0 }, cli);
  // The app's own sign-in may say whose work it is; an unknown session is refused, and a session's run cannot say so.
  const named = await call('POST', '/agent/jobs', { name: 'for the lead', command: 'true', cwd: tmp, pid: shell.pid, session: KEY }, cli);
  assert.equal((await entry((named.body as JobRegistered).id)).session?.key, KEY);
  await call('POST', `/agent/jobs/${named.body.id}`, { state: 'done', exitCode: 0 }, cli);
  assert.equal((await call('POST', '/agent/jobs', { name: 'x', command: 'true', cwd: tmp, pid: shell.pid, session: 'claude:nobody' }, cli)).status, 400);
  // A run whose agent has ended speaks only for its own jobs.
  const gone = 'ddddeeeeffff';
  runs.set(gone, KEY);
  const runner = proc();
  const mine = (await call('POST', '/agent/jobs', { name: 'old', command: 'true', cwd: tmp, pid: runner.pid }, bearer(gone))).body as JobRegistered;
  const other = await register('someone else’s');
  runs.delete(gone);
  assert.equal((await call('GET', '/agent/jobs', undefined, bearer(gone))).status, 401);
  assert.equal((await call('GET', `/agent/jobs/${other.id}`, undefined, bearer(gone))).status, 401);
  assert.equal((await call('POST', `/agent/jobs/${mine.id}`, { state: 'done', exitCode: 0 }, bearer(gone))).status, 200);
  await finish(other.id);
});

test('a job is registered, runs with its progress, and ends', async () => {
  await call('DELETE', '/api/jobs/ended');
  const job = await register('Build the index', { etaMs: 3600_000 });
  assert.match(job.id, /^j-[0-9a-f]{6}$/);
  assert.equal(job.start, true);
  assert.equal(job.log, path.join(process.env.DATA_DIR!, 'jobs', `${job.id}.log`));
  assert.ok(fs.existsSync(job.log));
  const command = proc();
  assert.equal((await call('POST', `/agent/jobs/${job.id}`, { state: 'running', pid: command.pid })).status, 200);
  let l = await listed();
  const e = l.running.find((x) => x.id === `job:${job.id}`)!;
  assert.equal(e.kind, 'job');
  assert.equal(e.state, 'running');
  assert.deepEqual(e.session, { key: KEY, title: 'Index the corpus', project: { id: space.id, name: 'Search' } });
  assert.equal(e.href, `/s/${encodeURIComponent(KEY)}`);
  assert.equal(e.stoppable, true);
  assert.deepEqual(e.output, { kind: 'job' });
  assert.equal(e.estimate?.source, 'agent', 'the agent’s guess until the job says more');
  assert.equal(e.estimate!.endsAt, e.startedAt! + 3600_000);
  assert.equal(l.allDoneAt, e.estimate!.endsAt);
  assert.ok(l.at > 0);
  fs.writeFileSync(job.log, 'loading\n 50%|#####     | 5/10 [00:10<00:20,  2.00s/it]\n\x1b[32mshard 5 written\x1b[0m\n');
  l = await listed();
  const read = l.running.find((x) => x.id === e.id)!;
  assert.equal(read.progress?.fraction, 0.5);
  assert.equal(read.lastLine, 'shard 5 written');
  assert.equal(read.estimate?.source, 'output', 'its own time left comes first');
  assert.ok(Math.abs(read.estimate!.endsAt - (Date.now() + 20_000)) < 5000);
  const log = (await call('GET', `/api/jobs/${encodeURIComponent(e.id)}/log`)).body;
  assert.match(log.text, /shard 5 written/);
  assert.ok(!log.text.includes('\x1b'), 'plain text');
  assert.equal(log.truncated, false);
  assert.equal((await call('DELETE', `/api/jobs/${encodeURIComponent(e.id)}`)).status, 409, 'not while it runs');
  await finish(job.id);
  l = await listed();
  assert.ok(!l.running.some((x) => x.id === e.id));
  const done = l.ended.find((x) => x.id === e.id)!;
  assert.equal(done.state, 'done');
  assert.equal(done.exitCode, 0);
  assert.equal(done.lastLine, 'shard 5 written');
  assert.equal(done.progress?.fraction, 0.5);
  assert.equal(done.stoppable, undefined);
  assert.equal((await call('POST', `/api/jobs/${encodeURIComponent(e.id)}/stop`)).status, 409);
  assert.equal((await call('DELETE', `/api/jobs/${encodeURIComponent(e.id)}`)).status, 200);
  assert.ok(!(await listed()).ended.some((x) => x.id === e.id));
  assert.equal((await entry(job.id)).state, 'done', '`job status` still knows a cleared one');
  assert.equal((await call('GET', '/agent/jobs/j-ffffff')).status, 404);
  assert.deepEqual((await call('GET', '/agent/jobs/j-ffffff')).body, { error: 'There is no such job' });
});

test('a failed job says its exit code', async () => {
  const job = await register('breaks');
  await finish(job.id, 'failed', 2);
  const e = await entry(job.id);
  assert.equal(e.state, 'failed');
  assert.equal(e.reason, 'Exit code 2');
});

test('--after waits, and starts when the job it waits for is done', async () => {
  const first = await register('Fetch');
  const second = await register('Embed', { after: ['Fetch'], etaMs: 1000 });
  assert.equal(second.start, false);
  assert.equal(second.waitingFor, 'Fetch');
  const q = (await listed()).queued.find((x) => x.id === `job:${second.id}`)!;
  assert.deepEqual(q.after, [`job:${first.id}`]);
  assert.equal(q.waitingFor, 'Fetch');
  assert.equal(q.startsAt, undefined, 'Fetch has no estimate');
  assert.deepEqual((await call('GET', `/agent/jobs/${second.id}/go`)).body, { wait: 'Fetch' }, 'held, then still waiting');
  const go = call('GET', `/agent/jobs/${second.id}/go`);
  await sleep(100);
  const at = Date.now();
  await finish(first.id);
  assert.deepEqual((await go).body, { start: true });
  assert.ok(Date.now() - at < 300, 'told as soon as it may start');
  assert.equal((await entry(second.id)).state, 'running');
  // By id too, and one already done lets it start at once.
  const third = await register('Report', { after: [first.id] });
  assert.equal(third.start, true);
  await finish(second.id);
  await finish(third.id);
});

test('a dependency that fails or is stopped cancels what waits for it, and so on', async () => {
  const a = await register('Compile');
  const b = await register('Test', { after: [a.id] });
  const c = await register('Ship', { after: ['Test'] });
  const go = call('GET', `/agent/jobs/${c.id}/go`);
  await sleep(50);
  await finish(a.id, 'failed', 1);
  assert.deepEqual((await go).body, { cancel: 'Waited for Test, which never started' });
  assert.equal((await entry(b.id)).reason, 'Waited for Compile, which failed');
  assert.equal((await entry(b.id)).state, 'cancelled');
  assert.equal((await entry(c.id)).state, 'cancelled');
  const late = await register('Late', { after: ['Compile'] });
  assert.equal(late.start, false);
  assert.equal(late.waitingFor, 'Waited for Compile, which failed');
});

test('one at a time in a queue, in the order they came', async () => {
  const a = await register('one', { queue: 'gpu', etaMs: 60_000 });
  const b = await register('two', { queue: 'gpu', etaMs: 30_000 });
  const c = await register('three', { queue: 'gpu', etaMs: 10_000 });
  const other = await register('elsewhere', { queue: 'cpu', etaMs: 5000 });
  assert.deepEqual([a.start, b.start, c.start, other.start], [true, false, false, true]);
  assert.equal(b.waitingFor, 'its turn in queue gpu');
  const l = await listed();
  const [two, three] = l.queued.filter((x) => x.queue === 'gpu');
  assert.deepEqual([two.name, two.position, three.name, three.position], ['two', 1, 'three', 2]);
  const one = l.running.find((x) => x.name === 'one')!;
  assert.equal(two.startsAt, one.estimate!.endsAt);
  assert.equal(two.estimate!.endsAt, two.startsAt! + 30_000);
  assert.equal(three.startsAt, two.estimate!.endsAt);
  assert.equal(l.allDoneAt, three.estimate!.endsAt);
  await finish(a.id);
  assert.equal((await entry(b.id)).state, 'running');
  assert.equal((await entry(c.id)).state, 'queued');
  assert.equal((await entry(c.id)).position, 1);
  await finish(b.id, 'failed', 1);
  assert.equal((await entry(c.id)).state, 'running', 'a queue goes on after a failure');
  await finish(c.id);
  await finish(other.id);
});

test('an unknown job to wait for, or a bad progress pattern, is refused in words', async () => {
  const runner = proc();
  const r = await call('POST', '/agent/jobs', { name: 'x', command: 'true', cwd: tmp, pid: runner.pid, after: ['No such thing'] });
  assert.equal(r.status, 400);
  assert.deepEqual(r.body, { error: 'There is no job called "No such thing" to wait for' });
  assert.equal((await call('POST', '/agent/jobs', { name: 'x', command: 'true', cwd: tmp, pid: runner.pid, progress: '(' })).status, 400);
  assert.equal((await call('POST', '/agent/jobs', { name: 'x', command: 'true', cwd: tmp, pid: 1 })).status, 400);
});

test('a job whose job command is gone ends failed, or stopped when that was asked', async () => {
  const a = await register('orphan');
  const b = await register('waits', { after: [a.id] });
  await kill(a.runner);
  jobs.tick();
  assert.equal((await entry(a.id)).state, 'failed');
  assert.equal((await entry(a.id)).reason, 'Its job command ended without a word');
  assert.equal((await entry(b.id)).state, 'cancelled');
  const c = await register('asked');
  await call('POST', `/agent/jobs/${c.id}/stop`);
  assert.equal((await entry(c.id)).state, 'running', 'asked, and not yet ended');
  await kill(c.runner);
  jobs.tick();
  assert.equal((await entry(c.id)).state, 'stopped');
});

test('stopping one that waits cancels it at once', async () => {
  const a = await register('ahead', { queue: 'q' });
  const b = await register('behind', { queue: 'q' });
  const go = call('GET', `/agent/jobs/${b.id}/go`);
  await sleep(50);
  assert.equal((await call('POST', `/api/jobs/job:${b.id}/stop`)).status, 200);
  assert.deepEqual((await go).body, { cancel: 'Stopped while it waited' });
  assert.equal((await entry(b.id)).state, 'cancelled');
  await finish(a.id);
});

test('stopping a running one ends its command’s group, killing what ignores it', async () => {
  const job = await register('stubborn');
  const command = proc("trap '' TERM; sleep 60");
  await call('POST', `/agent/jobs/${job.id}`, { state: 'running', pid: command.pid });
  await sleep(100);
  assert.equal((await call('POST', `/agent/jobs/${job.id}/stop`)).status, 200);
  assert.equal((await entry(job.id)).stoppable, undefined, 'asked once');
  await until(() => command.signalCode === 'SIGKILL', 'the kill');
  assert.equal(processAlive(command.pid!), false);
  await call('POST', `/agent/jobs/${job.id}`, { state: 'failed', exitCode: 137 });
  assert.equal((await entry(job.id)).state, 'stopped', 'it was stopped, whatever its command said');
  // Stopped before its command said which process it is: ended when it does.
  const late = await register('late');
  await call('POST', `/agent/jobs/${late.id}/stop`);
  const c2 = proc();
  await call('POST', `/agent/jobs/${late.id}`, { state: 'running', pid: c2.pid });
  await until(() => c2.signalCode !== null, 'the stop of a late start');
  await finish(late.id, 'stopped', 143);
});

test('the same command in the same folder took this long before', async () => {
  const past = (id: string, ms: number, state: Registered['state'] = 'done') =>
    saveRegistered(db, { id, state, name: 'tune', command: 'make tune', cwd: tmp, pid: 99999, log: path.join(tmp, id), after: [], queuedAt: 1000, startedAt: Date.now() - 100_000 - ms, endedAt: Date.now() - 100_000 }, 'make tune');
  [10, 20, 30, 40, 50].forEach((m, i) => past(`j-h${i}`, m * 60_000));
  past('j-hf', 1000, 'failed');
  assert.equal(historyMs(db, 'make tune', tmp), 30 * 60_000);
  assert.equal(historyMs(db, 'make tune', '/elsewhere'), undefined);
  const job = await register('tune');
  const e = (await listed()).running.find((x) => x.id === `job:${job.id}`)!;
  assert.equal(e.estimate?.source, 'history');
  assert.equal(e.estimate!.endsAt, e.startedAt! + 30 * 60_000);
  await finish(job.id);
});

test('the estimate takes the job’s own figure, then its progress, the agent, history', () => {
  const now = 1_000_000;
  const samples = [{ at: now - 60_000, fraction: 0.25 }, { at: now, fraction: 0.5 }];
  const all = { samples, startedAt: now - 120_000, etaMs: 5000, historyMs: 7000, now };
  assert.deepEqual(estimateRunning({ ...all, reading: { leftMs: 3000, leftAt: now - 1000 } }), { endsAt: now + 2000, source: 'output', confidence: 'high' });
  assert.equal(estimateRunning(all)?.source, 'progress');
  assert.equal(estimateRunning(all)?.endsAt, now + 120_000);
  assert.deepEqual(estimateRunning({ ...all, samples: [] }), { endsAt: now - 115_000, source: 'agent', confidence: 'low' });
  assert.equal(estimateRunning({ ...all, samples: [], etaMs: undefined })?.source, 'history');
  assert.equal(estimateRunning({ ...all, samples: [], etaMs: undefined, historyMs: undefined }), undefined);
});

test('which background task is a `job run`', () => {
  assert.ok(runsJob('job run --name x -- make'));
  assert.ok(runsJob('cd a && job run -- make'));
  assert.ok(runsJob('/data/shelltools/bin/job run -- make'));
  assert.ok(!runsJob('job list'));
  assert.ok(!runsJob('cronjob run'));
  const j = { id: 'j-abc123', queuedAt: 10_000 } as Registered;
  const t: BackgroundTask = { id: 't', description: 'Train the model', status: 'running', startedAt: 9000 };
  assert.ok(isJobTask(t, 'job run -- train', [j], () => '', 20_000));
  assert.ok(isJobTask(t, undefined, [j], () => 'job j-abc123 started: Train\n', 20_000));
  assert.ok(!isJobTask(t, 'make', [j], () => 'ok', 20_000));
  assert.ok(!isJobTask({ ...t, description: 'job run tests' }, 'make check', [j], () => '', 20_000), 'the command is known: its words about itself do not count');
  assert.ok(isJobTask({ ...t, description: 'job run --name x -- make' }, undefined, [j], () => '', 20_000));
  assert.ok(!isJobTask({ ...t, kind: 'local_agent', description: 'Fix job run' }, undefined, [j], () => `job ${j.id} started`, 20_000), 'a subagent is never a job');
  assert.ok(!isJobTask(t, 'job run -- train', [], () => '', 20_000), 'no job registered: it is shown');
  assert.ok(!isJobTask({ ...t, startedAt: 100_000 }, 'job run -- x', [j], () => '', 200_000), 'another job’s time');
  assert.ok(!isJobTask(t, 'job run -- train && sleep 999', [{ ...j, endedAt: 20_000 }], () => '', 200_000), 'what runs on after its job is a task again');
  assert.equal(kindOf('local_bash'), 'command');
  assert.equal(kindOf('local_agent'), 'subagent');
  assert.equal(kindOf('monitor'), 'monitor');
  assert.equal(kindOf(undefined), 'task');
});

const taskFiles = path.join(os.tmpdir(), `claude-${os.userInfo().uid}`, 'jobs-test-project');
function taskOutput(sid: string, task: string, text: string) {
  const dir = path.join(taskFiles, sid, 'tasks');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${task}.output`), text);
}

test('sessions’ background tasks: followed, recorded when they end, cleared for good', async () => {
  const w = session('claude:jobstest-tasks', 'Serve the model');
  const started = Date.now() - 60_000;
  const t: BackgroundTask = { id: 'b1', description: 'Build the site', kind: 'local_bash', status: 'running', startedAt: started, toolUseId: 'use1' };
  commands.set('use1', 'npm run site');
  w.running = [t];
  taskOutput('jobstest-tasks', 'b1', 'page 30/120\n');
  let l = await listed();
  const id = 'task:claude:jobstest-tasks:b1';
  const e = l.running.find((x) => x.id === id)!;
  assert.deepEqual([e.kind, e.name, e.command, e.cwd, e.session?.title], ['command', 'Build the site', 'npm run site', tmp, 'Serve the model']);
  assert.equal(e.progress?.fraction, 0.25);
  assert.equal(e.lastLine, 'page 30/120');
  assert.equal(e.stoppable, true);
  assert.equal((await call('GET', `/api/jobs/${encodeURIComponent(id)}/log`)).body.text, 'page 30/120\n');
  assert.equal((await call('POST', `/api/jobs/${encodeURIComponent(id)}/stop`)).status, 200);
  assert.ok(stopped.includes('task claude:jobstest-tasks b1'));
  w.running = [];
  w.ended = [{ ...t, status: 'completed', endedAt: Date.now() }];
  l = await listed();
  assert.ok(!l.running.some((x) => x.id === id));
  const done = l.ended.find((x) => x.id === id)!;
  assert.deepEqual([done.state, done.lastLine, done.stoppable], ['done', 'page 30/120', undefined]);
  await call('DELETE', '/api/jobs/ended');
  assert.deepEqual((await listed()).ended, [], 'cleared, and still listed by the session: it stays cleared');
  // One that disappears without a word, its session still there.
  w.ended = [];
  w.running = [{ ...t, id: 'b2' }];
  jobs.tick();
  w.running = [];
  l = await listed();
  assert.equal(l.ended.find((x) => x.id === 'task:claude:jobstest-tasks:b2')!.reason, 'It ended; how is not known');
  assert.equal(l.ended.find((x) => x.id === 'task:claude:jobstest-tasks:b2')!.exitUnknown, true, 'the page says Ended, not Done');
  // And one whose session's agent stopped.
  w.running = [{ ...t, id: 'b3' }];
  jobs.tick();
  work.delete(w.key);
  l = await listed();
  assert.equal(l.ended.find((x) => x.id === 'task:claude:jobstest-tasks:b3')!.state, 'stopped');
  // Outside the app: shown, not stoppable.
  const ext = session('claude:jobstest-ext', 'In VS Code', {}, { external: true });
  ext.running = [{ id: 'x1', description: 'watch the log', kind: 'monitor', status: 'running' }];
  const x = (await listed()).running.find((y) => y.id === 'task:claude:jobstest-ext:x1')!;
  assert.deepEqual([x.kind, x.stoppable], ['monitor', undefined]);
  assert.equal((await call('POST', `/api/jobs/${encodeURIComponent(x.id)}/stop`)).status, 409);
  work.delete(ext.key);
});

test('a session’s `job run` task is the job, not a task beside it', async () => {
  const w = session(KEY, 'Index the corpus', { space: space.id }, { status: 'working' });
  const started = Date.now() - 1000;
  w.running = [
    { id: 'c1', description: 'Train in the background', kind: 'local_bash', status: 'running', startedAt: started, toolUseId: 'use2' },
    { id: 'c2', description: 'Another training', kind: 'local_bash', status: 'running', startedAt: started },
    { id: 'c3', description: 'Lint', kind: 'local_bash', status: 'running', startedAt: started },
  ];
  commands.set('use2', 'job run --name Train -- python train.py');
  const job = await register('Train');
  taskOutput('lead', 'c2', `job ${job.id} started: Train\nstep 1\n`);
  let l = await listed();
  const mine = l.running.filter((x) => x.session?.key === KEY).map((x) => x.id);
  assert.deepEqual(mine.sort(), [`job:${job.id}`, `task:${KEY}:c3`].sort());
  await finish(job.id);
  w.ended = w.running.slice(0, 2).map((t) => ({ ...t, status: 'completed', endedAt: Date.now() }));
  w.running = [];
  l = await listed();
  assert.ok(!l.ended.some((x) => x.id === `task:${KEY}:c1` || x.id === `task:${KEY}:c2`), 'nor in the Finished list');
  assert.ok(l.ended.some((x) => x.id === `job:${job.id}`));
  fs.rmSync(path.join(taskFiles, 'lead'), { recursive: true, force: true });
  work.get(KEY)!.ended = [];
  jobs.tick();
});

test('Hydor subagents while they work, and how they ended', async () => {
  const child = session('claude:child', 'Review the diff', { parent: KEY }, { status: 'working', turnStartedAt: Date.now() - 5000 });
  let l = await listed();
  const e = l.running.find((x) => x.id === 'child:claude:child')!;
  assert.deepEqual([e.kind, e.name, e.session?.key, e.href, e.stoppable], ['hydor-subagent', 'Review the diff', KEY, '/s/claude%3Achild', true]);
  child.status = 'idle';
  l = await listed();
  assert.equal(l.ended.find((x) => x.id === e.id)!.state, 'done');
  child.status = 'working';
  l = await listed();
  assert.ok(l.running.some((x) => x.id === e.id) && !l.ended.some((x) => x.id === e.id));
  assert.equal((await call('POST', `/api/jobs/${encodeURIComponent(e.id)}/stop`)).status, 200);
  assert.ok(stopped.includes('session claude:child'));
  assert.equal((await listed()).ended.find((x) => x.id === e.id)!.state, 'stopped');
});

test('runs of Experiments, waiting, running and ended', async () => {
  insertRun(db, { id: 'r-one', spec: { name: 'bm25', command: 'python eval.py', cwd: tmp, gpus: 1 }, status: 'waiting', why: 'Waiting for a free GPU', info: { startedBy: { session: KEY } } });
  insertRun(db, { id: 'r-two', spec: { name: 'dense', command: 'python eval.py --dense', cwd: tmp }, status: 'running' });
  updateRun(db, 'r-two', { startedAt: Date.now() - 10_000, metrics: { last: {}, progress: { done: 40, total: 100, at: Date.now() } } });
  let l = await listed();
  const q = l.queued.find((x) => x.id === 'run:r-one')!;
  assert.deepEqual([q.kind, q.waitingFor, q.href, q.session?.key], ['experiment', 'Waiting for a free GPU', '/experiments/r-one', KEY]);
  const r = l.running.find((x) => x.id === 'run:r-two')!;
  assert.deepEqual(r.progress && [r.progress.fraction, r.progress.text], [0.4, '40/100']);
  assert.equal(r.estimate?.source, 'progress');
  assert.equal(l.allDoneAt, undefined, 'one has no estimate');
  assert.equal((await call('POST', `/api/jobs/${encodeURIComponent('run:r-one')}/stop`)).status, 200);
  updateRun(db, 'r-two', { status: 'failed', endedAt: Date.now() });
  l = await listed();
  assert.equal(l.ended.find((x) => x.id === 'run:r-one')!.state, 'cancelled');
  assert.equal(l.ended.find((x) => x.id === 'run:r-two')!.state, 'failed');
});

test('the pages hear the counts when they change; the list is capped; a week is kept', async () => {
  jobs.tick();
  told.length = 0;
  const a = await register('count me');
  const b = await register('me too', { after: [a.id] });
  jobs.tick();
  const counts = told.filter((e) => e.t === 'jobs');
  assert.deepEqual(counts.at(-1), { t: 'jobs', running: 1, queued: 1 });
  assert.equal(counts.length, 2, 'only when they change');
  await finish(a.id);
  await finish(b.id);
  assert.equal(((await call('GET', '/api/jobs?ended=1')).body as JobsList).ended.length, 1);
  const newest = ((await call('GET', '/agent/jobs?ended=1')).body as JobsList).ended[0];
  assert.equal(newest.id, `job:${b.id}`, 'newest first');
  const log = b.log;
  assert.ok(prune(db, Date.now() + KEEP_MS + 1000) > 0);
  assert.ok(!fs.existsSync(log), 'its log goes with it');
});

test('a session’s environment has the command’s address and token', async () => {
  const s = { agent: 'claude', cwd: tmp, runId: RUN, resume: false, extra: {} } as SpawnInfo;
  const env = (await jobs.spawn!(s, deps))!.env!;
  assert.match(env.HYDOR_JOBS_URL, /^http:\/\/127\.0\.0\.1:\d+\/agent\/jobs$/);
  assert.equal(jobsRunOf(env.HYDOR_JOBS_TOKEN), RUN);
  assert.equal(await jobs.spawn!({ ...s, extra: { browserOnly: true } as any }, deps), undefined);
  assert.equal(await jobs.spawn!({ ...s, extra: { app: { public: true } } as any }, deps), undefined);
});

const adoptIt = (pid: number, o: Record<string, unknown> = {}) => call('POST', '/agent/jobs', { name: 'crawl', command: 'python crawl.py', cwd: tmp, pid, adoptPid: pid, ...o });

test('adopting a process that already runs: from its own start, with its log, until it is gone', async () => {
  const spawned = Date.now();
  const p = proc();
  await sleep(1200);
  const log = path.join(tmp, 'crawl.log');
  fs.writeFileSync(log, 'page 30/120\n');
  const r = await adoptIt(p.pid!, { logFile: log });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.start, r.body.log], [true, log]);
  const id = `job:${r.body.id}`;
  const e = (await listed()).running.find((x) => x.id === id)!;
  assert.ok(Math.abs(e.startedAt! - spawned) < 1500, `started ${e.startedAt! - spawned} ms from when it did`);
  assert.ok(startFromPs(p.pid!) !== undefined && Math.abs(startFromPs(p.pid!)! - spawned) < 2000, 'as ps tells it too');
  assert.deepEqual([e.kind, e.queuedAt, e.progress?.fraction, e.lastLine, e.stoppable, e.session?.key], ['job', undefined, 0.25, 'page 30/120', true, KEY]);
  assert.equal(e.estimate, undefined, 'one reading in its first seconds gives no estimate yet');
  assert.equal((await call('GET', `/api/jobs/${encodeURIComponent(id)}/log`)).body.text, 'page 30/120\n');
  assert.equal((await adoptIt(p.pid!)).body.id, r.body.id, 'the same pid again: the same job');
  assert.equal((await call('POST', `/agent/jobs/${r.body.id}`, { state: 'done', exitCode: 0 })).status, 400);
  const after = await register('after the crawl', { after: ['crawl'] });
  assert.equal(after.start, false);
  assert.equal(after.waitingFor, 'crawl');
  const go = call('GET', `/agent/jobs/${after.id}/go`);
  await kill(p);
  jobs.tick();
  const done = await entry(id);
  assert.deepEqual([done.state, done.exitUnknown, done.exitCode, done.reason], ['done', true, undefined, undefined]);
  assert.deepEqual((await go).body, { start: true }, 'gone counts as done for --after');
  await finish(after.id);
  assert.equal(historyMs(db, 'python crawl.py', tmp), undefined, 'how it ended is not known: not how long it takes');
  prune(db, Date.now() + KEEP_MS + 1000);
  assert.ok(fs.existsSync(log), 'the user’s file stays');
  assert.equal(fs.readFileSync(log, 'utf8'), 'page 30/120\n');
});

test('what cannot be adopted', async () => {
  const p = proc();
  assert.deepEqual((await adoptIt(p.pid!, { after: ['x'] })).status, 400);
  assert.equal((await adoptIt(p.pid!, { queue: 'gpu' })).status, 400);
  assert.equal((await adoptIt(p.pid!, { logFile: 'relative.log' })).status, 400);
  // Nothing of the app's own data, and nothing that is not an ordinary file.
  const secret = path.join(process.env.DATA_DIR!, 'links.key');
  assert.ok(fs.existsSync(secret));
  assert.equal((await adoptIt(p.pid!, { logFile: secret })).status, 400);
  assert.equal((await adoptIt(p.pid!, { logFile: tmp })).status, 400);
  // Nor through a link made after.
  const link = path.join(tmp, 'later.log');
  const r = await adoptIt(p.pid!, { logFile: link });
  assert.equal(r.status, 200);
  fs.symlinkSync(secret, link);
  jobs.tick();
  assert.equal((await call('GET', `/api/jobs/job%3A${r.body.id}/log`)).status, 404);
  assert.equal((await entry(r.body.id)).lastLine, undefined);
  await kill(p);
  const gone = await adoptIt(p.pid!);
  assert.equal(gone.status, 400);
  assert.deepEqual(gone.body, { error: `There is no running process with pid ${p.pid}` });
  assert.equal((await adoptIt(1)).status, 400);
  assert.equal((await adoptIt(process.pid)).status, 400);
});

test('stopping an adopted job signals that process alone, and kills it if it stays', async () => {
  const pidFile = path.join(tmp, 'child.pid');
  const parent = proc(`sleep 60 & echo $! > ${pidFile}; wait`);
  await until(() => fs.existsSync(pidFile) && !!fs.readFileSync(pidFile, 'utf8').trim(), 'the child');
  const child = Number(fs.readFileSync(pidFile, 'utf8'));
  const r = await adoptIt(parent.pid!);
  assert.equal((await call('POST', `/agent/jobs/${r.body.id}/stop`)).status, 200);
  await until(() => parent.signalCode === 'SIGTERM', 'its end');
  assert.ok(processAlive(child), 'not its group');
  process.kill(child, 'SIGKILL');
  jobs.tick();
  assert.deepEqual([(await entry(r.body.id)).state, (await entry(r.body.id)).exitUnknown], ['stopped', undefined]);
  const stubborn = proc("trap '' TERM; while :; do sleep 0.2; done");
  await sleep(100);
  const s = await adoptIt(stubborn.pid!);
  await call('POST', `/agent/jobs/${s.body.id}/stop`);
  await until(() => stubborn.signalCode === 'SIGKILL', 'the kill');
  jobs.tick();
  assert.equal((await entry(s.body.id)).state, 'stopped');
});

test('a session task whose process is adopted is shown once, as the job', async () => {
  const w = session('claude:jobstest-adopt', 'Crawl');
  taskOutput('jobstest-adopt', 'a1', '');
  const out = path.join(taskFiles, 'jobstest-adopt', 'tasks', 'a1.output');
  w.running = [{ id: 'a1', description: 'Crawl the archive', kind: 'local_bash', status: 'running', startedAt: Date.now() }];
  const id = 'task:claude:jobstest-adopt:a1';
  assert.ok((await listed()).running.some((x) => x.id === id));
  // As Claude Code runs it: the process's output is the task's file.
  const fd = fs.openSync(out, 'a');
  const p = spawn('sh', ['-c', 'echo "step 3/6"; exec sleep 60'], { detached: true, stdio: ['ignore', fd, fd] });
  children.push(p);
  fs.closeSync(fd);
  await until(() => fs.readFileSync(out, 'utf8').includes('step'), 'its line');
  const r = await adoptIt(p.pid!);
  let l = await listed();
  assert.ok(!l.running.some((x) => x.id === id) && !l.ended.some((x) => x.id === id));
  const e = l.running.find((x) => x.id === `job:${r.body.id}`)!;
  assert.deepEqual([e.progress?.fraction, e.lastLine], [0.5, 'step 3/6'], 'read from the task’s output when no log is named');
  await kill(p);
  w.running = [];
  w.ended = [{ id: 'a1', description: 'Crawl the archive', kind: 'local_bash', status: 'completed', startedAt: Date.now() - 1000, endedAt: Date.now() }];
  l = await listed();
  assert.ok(!l.ended.some((x) => x.id === id), 'nor once it is over');
  assert.equal(l.ended.find((x) => x.id === `job:${r.body.id}`)!.exitUnknown, true);
  work.delete(w.key);
});

test('the `job` command itself, against these routes', async () => {
  const run = 'eeeeffff0000';
  runs.set(run, KEY);
  const url = `${await http.listen({ host: '127.0.0.1', port: 0 })}/agent/jobs`;
  const bin = path.join(APP_ROOT, 'scripts', 'agent-tools', 'bin', 'job');
  const env = { ...process.env, HYDOR_JOBS_URL: url, HYDOR_JOBS_TOKEN: jobsToken(run), JOB_TEST_SPEEDUP: '20' };
  const job = (...args: string[]) => {
    const c = spawn(process.execPath, [bin, ...args], { cwd: tmp, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    c.stdout.on('data', (b) => (out += b));
    c.stderr.on('data', (b) => (out += b));
    const done = new Promise<number | null>((resolve) => c.on('close', resolve));
    return { out: () => out, done };
  };
  const first = job('run', '--name', 'e2e first', '--queue', 'e2e', '--', 'echo step 1/4; sleep 1.5');
  await until(() => first.out().includes('started'), 'the first to start', 15_000);
  const second = job('run', '--name', 'e2e second', '--after', 'e2e first', '--', 'echo second ran');
  await until(() => second.out().includes('waits'), 'the second to wait', 15_000);
  await until(() => jobs.list().running.find((e) => e.name === 'e2e first')?.progress?.fraction === 0.25, 'its progress', 10_000);
  assert.equal(jobs.list().queued.find((e) => e.name === 'e2e second')?.waitingFor, 'e2e first');
  assert.equal(await first.done, 0, first.out());
  assert.equal(await second.done, 0, second.out());
  assert.match(second.out(), /second ran/);
  const ended = jobs.list().ended.filter((e) => e.name.startsWith('e2e'));
  assert.deepEqual(ended.map((e) => [e.name, e.state]).sort(), [['e2e first', 'done'], ['e2e second', 'done']]);
  // Stopped from the app: the command ends, and `job` says so.
  const third = job('run', '--name', 'e2e stop', '--', 'sleep 60');
  await until(() => third.out().includes('started'), 'the third to start', 15_000);
  const id = jobs.list().running.find((e) => e.name === 'e2e stop')!.id;
  await sleep(300);
  assert.equal((await call('POST', `/api/jobs/${id}/stop`)).status, 200);
  assert.notEqual(await third.done, 0);
  assert.equal((await entry(id)).state, 'stopped');
  const seen = job('list', '--all');
  assert.equal(await seen.done, 0, seen.out());
  assert.match(seen.out(), /e2e stop/);
  const wait = job('wait', id.slice('job:'.length));
  assert.equal(await wait.done, 1, wait.out());
  // And adopting work that already runs.
  const running = proc('sleep 2');
  const adopted = job('adopt', '--pid', String(running.pid), '--name', 'e2e adopted');
  assert.equal(await adopted.done, 0, adopted.out());
  const short = /job (j-[0-9a-f]+) adopted: e2e adopted/.exec(adopted.out())![1];
  const over = job('wait', short);
  assert.equal(await over.done, 0, over.out());
  assert.match(over.out(), /exit code not known/);
});

// ---- run ------------------------------------------------------------------------------------------------------------------

let failed = 0;
try {
  for (const [name, fn] of tests) {
    try {
      await fn();
      passed++;
    } catch (e) {
      failed++;
      console.error(`✗ ${name}\n${(e as Error).stack}`);
    }
  }
} finally {
  jobs.stop();
  await Promise.all(children.map(kill));
  await http.close();
  fs.rmSync(taskFiles, { recursive: true, force: true });
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
