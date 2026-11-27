// Checks for GPU hours (budget.ts): what a start may use (its time limit, its last run, neither) and the line the
// approval card says of it; a session's budget (what stays within it starts without a card, what would go over asks,
// a run without a time limit is refused, used and reserved add up as runs end, it survives the store being opened
// again); the ceiling on agents' runs in seven days (whose hours count, a held run and its reason, others still
// starting, Let it run, starting again when there is room, one notice a day, a sweep at the edge, new scores and
// evolutions refused, a search and a goal's score already going held, the morning's count), the routes and what
// app_api may do, and the Research tab's brief with and without a ceiling. Real tiny jobs through
// tmux with made-up GPUs: no GPU is used.
// Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/experiments/budget-test.ts
//   DATA_DIR=/tmp/hydor-test-budget CUDA_VISIBLE_DEVICES= node dist/dev/budget-test.js
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import type { AgentsUse, RunRecord } from '../../shared/experiments.ts';
import type { ApprovalRequest, NotifyEvent } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import { fixScores, scoreCheck } from '../goals/scores.ts';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { appApi, ruleFor } from '../guide/api.ts';
import { internalHeaders } from '../internal.ts';
import { researchBrief } from '../research/project.ts';
import { createSpace } from '../spaces/index.ts';
import { startSweep } from './api.ts';
import { agentsUse, budgetNow, costLine, gpuHoursOf, usedHours } from './budget.ts';
import { saveCluster } from './clusters.ts';
import { createEvaluation, startScore, waitScore } from './evaluations.ts';
import { candidatesOf, getEvolution, startEvolution, stopEvolution, useEvolveDeps } from './evolve.ts';
import { setGpuReader } from './gpus.ts';
import { experiments } from './index.ts';
import { pidOf, stopTmuxServer } from './local.ts';
import { clock, morningWords } from './night.ts';
import { cleanJob, forgetLive, forgetNotices, setSettings, settingsOf, stopRun, submit, tick, useDeps } from './queue.ts';
import { deleteRun, getRun, getRunWithEvents, insertRun, listRuns, runFolder, updateRun, type RunInfo } from './records.ts';
import { experimentTools, SPAWN_NOTE } from './tools.ts';
import { setUsageReader } from './usage.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
if (process.env.CUDA_VISIBLE_DEVICES !== '') {
  console.error('Run with CUDA_VISIBLE_DEVICES= (empty): these tests never use a GPU.');
  process.exit(2);
}

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-budget-test-')));
const dbFile = path.join(tmp, 'test.db');
const db = openDb(dbFile);
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// ---- stand-ins ----------------------------------------------------------------------------------------------------

class Sessions extends EventEmitter {
  mode = 'default';
  answer: string | null = 'accept';
  cards: ApprovalRequest[] = [];
  summary(key: string) {
    return key.startsWith('claude:') ? ({ key, title: key, queue: undefined, live: null } as any) : null;
  }
  inbox() {
    return [];
  }
  async create() {
    return 'claude:oncall';
  }
  async deliverOrQueue() {}
  editQueued() {}
  dropQueued() {}
  adapterByRun() {
    return {
      state: { mode: this.mode },
      ask: async (card: ApprovalRequest) => {
        this.cards.push(card);
        return this.answer ? { decision: this.answer } : null;
      },
    };
  }
}
const sessions = new Sessions();
const notices: NotifyEvent[] = [];
sessions.on('notify', (n: NotifyEvent) => notices.push(n));

const http = Fastify();
http.setErrorHandler((err: Error, _req, reply) => {
  reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message });
});
const deps = { app: http, db, sessions: sessions as any, scheduler: null as any, models: null as any, broadcast: () => {}, toSubscribers: () => {}, publicBase: () => 'http://test.local' } as Deps;
experiments.routes!(deps);
useDeps(deps);
await http.ready();

/** Four empty made-up GPUs. */
const fourGpus = async () => ({ gpus: [0, 1, 2, 3].map((index) => ({ index, name: 'Test GPU', memUsed: 0, memTotal: 24_576, util: 0 })) });
setGpuReader(fourGpus);
setUsageReader({ gpus: async () => [], apps: async () => [], processes: () => null, memory: () => null });

/** The clock the limits are read from: the real one, moved on by the test. */
let ahead = 0;
clock.now = () => Date.now() + ahead;

const ctxOf = (o: Partial<RunCtx> = {}): RunCtx => ({ runId: 'run1', key: 'claude:s1', agent: 'claude', cwd: tmp, deps, ...o }) as RunCtx;
async function call(name: string, args: Record<string, unknown>, ctx = ctxOf()): Promise<{ text: string; error: boolean; json: any }> {
  const t = experimentTools(ctx).find((x) => x.name === name);
  assert.ok(t, name);
  const out = await t.run(args, ctx);
  const text = typeof out === 'string' ? out : out.text;
  const error = typeof out !== 'string' && !!out.isError;
  return { text, error, json: error ? null : JSON.parse(text) };
}
const lastCard = () => sessions.cards.at(-1)!;
const cardLines = () => (lastCard().detail ?? '').split('\n');

let gates = 0;
/** A command that goes on until the test opens its gate. */
function gate() {
  const f = path.join(tmp, `gate-${++gates}`);
  return { command: `while [ ! -f ${f} ]; do sleep 0.1; done; echo acc=1`, open: () => fs.writeFileSync(f, '') };
}

let made = 0;
/** A run as if it had run: `hours` long on `gpus` GPUs, ended `ago` hours before now. */
function ran(o: { hours: number; gpus?: number; by?: RunInfo['startedBy']; ago?: number; command?: string; cwd?: string; where?: string; status?: RunRecord['status']; info?: Partial<RunInfo>; tags?: string[]; env?: Record<string, string> }): string {
  const id = `rpast${String(++made).padStart(4, '0')}`;
  const end = Date.now() - (o.ago ?? 0) * HOUR;
  const status = o.status ?? 'done';
  insertRun(db, {
    id,
    spec: { command: o.command ?? `python past${made}.py`, cwd: o.cwd ?? tmp, gpus: o.gpus ?? 1, where: o.where ?? 'local', ...(o.tags ? { tags: o.tags } : {}), ...(o.env ? { env: o.env } : {}) },
    status,
    info: { ...(o.by ? { startedBy: o.by } : {}), ...o.info },
  });
  updateRun(db, id, { startedAt: end - o.hours * HOUR, ...(status === 'running' ? {} : { endedAt: end }) });
  return id;
}
const forget = (...ids: string[]) => ids.forEach((id) => db.prepare('delete from exp_runs where id = ?').run(id));
const forgetAll = () => {
  db.prepare('delete from exp_runs').run();
  db.prepare("delete from kv where k in ('experiments_spent', 'experiments_ceiling_told')").run();
};

const status = (id: string) => getRun(db, id)!.status;
async function until(fn: () => boolean, ms = 20_000, what = 'it') {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await tick();
    if (fn()) return;
    await sleep(100);
  }
  assert.fail(`timed out waiting for ${what}`);
}
async function steps(n = 3) {
  for (let i = 0; i < n; i++) {
    await tick();
    await sleep(60);
  }
}
const local = () => listRuns(db, { status: ['queued', 'waiting', 'starting', 'running'], limit: 500 });
/** Stops what is left, those in line first, so the next test starts with nothing in line. */
async function clearQueue() {
  await steps();
  for (const r of local().sort((a, b) => Number(a.status !== 'waiting') - Number(b.status !== 'waiting'))) await stopRun(deps, r.id);
  await until(() => local().length === 0, 40_000, 'the runs to stop');
  ahead = 0;
}
const person = async (o: Record<string, unknown>) => submit(deps, await cleanJob(db, { cwd: tmp, ...o }), { startedBy: { page: true } });
const agent = async (o: Record<string, unknown>) => submit(deps, await cleanJob(db, { cwd: tmp, ...o }), { startedBy: { session: 'claude:s1' } });

/** A repository with a score command, a file to evolve and one commit. */
function makeRepo(name: string) {
  const dir = path.join(tmp, name);
  fs.mkdirSync(dir);
  const git = (...a: string[]) => execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=T', ...a], { cwd: dir, stdio: 'pipe' }).toString();
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 'T');
  fs.writeFileSync(path.join(dir, 'eval.sh'), 'echo score=1\n');
  fs.writeFileSync(path.join(dir, 'model.sh'), 'X=1\n');
  git('add', '.');
  git('commit', '-q', '-m', 'first');
  return dir;
}
const repo = makeRepo('repo');

// ---- what a start may use ------------------------------------------------------------------------------------------

test('GPU hours: from the time limit, else from the last finished run of the same command, else neither', () => {
  const job = { command: 'python train.py --lr 0.1', cwd: tmp, gpus: 4 };
  assert.deepEqual(gpuHoursOf(db, { ...job, hours: 6 }), { atMost: 24 });
  assert.deepEqual(gpuHoursOf(db, { ...job, gpus: 1, hours: 2 }, 12), { atMost: 24 }, 'a sweep: every run');
  assert.deepEqual(gpuHoursOf(db, job), {}, 'no limit and never run: neither');
  assert.deepEqual(gpuHoursOf(db, { ...job, gpus: 0, hours: 6 }), { atMost: 0 }, 'a run without a GPU costs none');
  assert.deepEqual(gpuHoursOf(db, { ...job, gpus: 0 }), { atMost: 0 });
  const ids = [
    ran({ command: 'python train.py --lr 0.3', hours: 5, ago: 40 }),
    ran({ command: 'python train.py --lr 0.2', hours: 1.5, ago: 10 }),
    // Not the last finished run of it: one that failed, a trial, another command, another folder.
    ran({ command: 'python train.py --lr 0.2', hours: 9, status: 'failed' }),
    ran({ command: 'python train.py --lr 0.2', hours: 0.02, tags: ['try'], env: { HYDOR_TRY: '1' } }),
    ran({ command: 'python other.py', hours: 9 }),
  ];
  assert.deepEqual(gpuHoursOf(db, { ...job, gpus: 2 }), { about: 3 }, 'its GPUs × how long it took last');
  assert.deepEqual(gpuHoursOf(db, { ...job, gpus: 1 }, 4), { about: 6 });
  assert.deepEqual(gpuHoursOf(db, { ...job, command: 'python train.py --lr {lr}', gpus: 1 }, 2), { about: 3 }, 'a sweep’s command is the same command');
  // The app stops a run at its time limit on a plain SSH computer too, so it counts there as anywhere.
  const ssh = saveCluster(db, { name: 'Box', host: 'me@box', kind: 'ssh' });
  assert.deepEqual(gpuHoursOf(db, { ...job, gpus: 1, command: 'python new.py', where: `c:${ssh.id}`, hours: 6 }), { atMost: 6 });
  forget(...ids);
});

test('the card’s line', () => {
  assert.equal(costLine({ atMost: 24 }, { gpus: 4, hours: 6 }), 'At most 24 GPU hours (4 GPUs × 6 h)');
  assert.equal(costLine({ atMost: 24 }, { gpus: 1, hours: 2, runs: 12 }), 'At most 24 GPU hours (12 runs × 1 GPU × 2 h)');
  assert.equal(costLine({ about: 3 }, { gpus: 1 }), 'About 3 GPU hours, going by its last run');
  assert.equal(costLine({}, { gpus: 1 }), 'No time limit: it runs until it ends');
  assert.equal(costLine({}, { gpus: 1, runs: 6 }), 'No time limit: its runs go until they end');
  assert.equal(costLine({ atMost: 1 }, { gpus: 1, hours: 1 }), 'At most 1 GPU hour (1 GPU × 1 h)');
  assert.equal(costLine({ atMost: 0 }, { gpus: 0, hours: 6 }), null);
});

test('the approval card says it, and the tools answer with it', async () => {
  sessions.answer = 'deny';
  await call('experiment_run', { command: 'python train.py', gpus: 4, hours: 6 });
  assert.ok(cardLines().includes('# At most 24 GPU hours (4 GPUs × 6 h)'), lastCard().detail);
  await call('experiment_sweep', { command: 'python train.py --lr {lr} --seed {s}', params: { lr: [1, 2, 3, 4], s: [1, 2, 3] }, group: 'g', gpus: 1, hours: 2 });
  assert.equal(lastCard().title, 'Start a sweep of 12 runs');
  assert.ok(cardLines().includes('# At most 24 GPU hours (12 runs × 1 GPU × 2 h)'), lastCard().detail);
  await call('experiment_run', { command: 'python train.py', gpus: 1 });
  assert.ok(cardLines().includes('# No time limit: it runs until it ends'), lastCard().detail);
  const last = ran({ command: 'python train.py', hours: 3 });
  await call('experiment_run', { command: 'python train.py', gpus: 1 });
  assert.ok(cardLines().includes('# About 3 GPU hours, going by its last run'), lastCard().detail);
  await call('experiment_run', { again: last });
  assert.ok(cardLines().includes('# About 3 GPU hours, going by its last run'), lastCard().detail);
  await call('experiment_run', { command: 'echo hi', gpus: 0 });
  assert.ok(!/GPU hour|No time limit/.test(lastCard().detail!), 'nothing to say of a run without a GPU');
  await call('experiment_try', { command: 'python train.py', gpus: 1 });
  assert.ok(cardLines().some((l) => /^# At most 0\.0\d GPU hours \(1 GPU × 90 seconds\)$/.test(l)), lastCard().detail);
  assert.equal(local().length, 0, 'every card said no');
  sessions.answer = 'accept';
  const one = (await call('experiment_run', { command: 'echo acc=1', gpus: 1, hours: 0.5 })).json;
  assert.deepEqual(one.gpuHours, { atMost: 0.5 });
  const cpu = (await call('experiment_run', { command: 'echo acc=1', gpus: 0 })).json;
  assert.deepEqual(cpu.gpuHours, { atMost: 0 });
  const sweep = (await call('experiment_sweep', { command: 'echo lr={lr}', params: { lr: [1, 2] }, group: 'g2', gpus: 1, hours: 0.25 })).json;
  assert.deepEqual(sweep.gpuHours, { atMost: 0.5 });
  await until(() => local().length === 0, 30_000, 'them to end');
  forgetAll();
  const props = (name: string) => (experimentTools(ctxOf()).find((t) => t.name === name)!.inputSchema as any).properties;
  assert.match(props('experiment_run').hours.description, /lets the person see what the run may cost/);
  assert.match(SPAWN_NOTE, /experiment_budget/);
});

// ---- a budget approved once ----------------------------------------------------------------------------------------

test('a budget: asked once, runs within it start without a card, one that would go over asks, one without hours is refused', async () => {
  const ctx = ctxOf({ key: 'claude:b' });
  const budget = (a: Record<string, unknown> = {}) => call('experiment_budget', a, ctx);
  assert.equal((await budget()).json.budget, null);
  assert.ok(!experimentTools(ctxOf({ step: true })).some((t) => t.name === 'experiment_budget'), 'a step asks nobody');
  sessions.answer = 'deny';
  const no = await budget({ gpuHours: 10, why: 'Three seeds of two settings.' });
  assert.ok(no.error && /said no/.test(no.text), no.text);
  assert.equal(lastCard().title, 'Allow 10 GPU hours of runs?');
  assert.match(lastCard().detail!, /^Three seeds of two settings\.\n\nThis session’s runs that stay within it start without asking you again\./);
  assert.deepEqual(lastCard().options.map((o) => o.label), ['Allow', 'Don’t']);
  assert.equal(budgetNow(db, 'claude:b'), null);
  assert.match((await budget({ gpuHours: 10 })).text, /Say why/);
  sessions.answer = 'accept';
  const yes = (await budget({ gpuHours: 10, why: 'Three seeds of two settings.' })).json;
  assert.deepEqual(yes.budget, { gpuHours: 10, used: 0, reserved: 0, left: 10 });
  assert.equal(local().length, 0, 'nothing starts by it');

  const cards = sessions.cards.length;
  const a = gate();
  const first = (await call('experiment_run', { command: a.command, gpus: 1, hours: 4 }, ctx)).json;
  assert.equal(sessions.cards.length, cards, 'within the budget: no card');
  assert.deepEqual((({ used, reserved, left }) => ({ used, reserved, left }))((await budget()).json.budget), { used: 0, reserved: 4, left: 6 });
  const bare = await call('experiment_run', { command: 'python train.py', gpus: 1 }, ctx);
  assert.ok(bare.error);
  assert.equal(bare.text, 'Give hours (its time limit): under this session’s budget every run needs one');
  assert.match((await call('experiment_sweep', { command: 'echo {x}', params: { x: [1, 2] }, group: 'b', gpus: 1 }, ctx)).text, /Give hours/);
  assert.equal(sessions.cards.length, cards);

  sessions.answer = 'deny';
  const over = await call('experiment_run', { command: 'echo over', gpus: 2, hours: 4 }, ctx);
  assert.ok(over.error && /said no/.test(over.text));
  assert.equal(sessions.cards.length, cards + 1);
  assert.deepEqual(cardLines().slice(-2), ['# At most 8 GPU hours (2 GPUs × 4 h)', '# This session’s budget of 10 GPU hours has 6 left']);
  // A run without a GPU costs none.
  await call('experiment_run', { command: 'echo cpu=1', gpus: 0 }, ctx);
  assert.equal(sessions.cards.length, cards + 1);
  // Another session has no budget.
  await call('experiment_run', { command: 'echo other', gpus: 1, hours: 1 }, ctxOf({ key: 'claude:other' }));
  assert.equal(sessions.cards.length, cards + 2);
  assert.ok(!/This session’s budget/.test(lastCard().detail!));
  // Stopping another's run still asks.
  const theirs = await person({ command: gate().command, gpus: 0 });
  await call('experiment_stop', { id: theirs.id }, ctx);
  assert.equal(sessions.cards.length, cards + 3);
  await stopRun(deps, theirs.id);

  // As runs end, what they used takes the place of what was reserved: it ran 2 hours of its 4.
  await until(() => status(first.id) === 'running', 20_000, 'it to run');
  updateRun(db, first.id, { startedAt: Date.now() - 2 * HOUR });
  a.open();
  await until(() => status(first.id) === 'done', 20_000, 'it to end');
  const b = (await budget()).json.budget;
  assert.ok(Math.abs(b.used - 2) < 0.05 && b.reserved === 0 && Math.abs(b.left - 8) < 0.05, JSON.stringify(b));

  // Asked at once, they share what is left: only one of two that fit alone is started without a card.
  const g1 = gate();
  const g2 = gate();
  const before = sessions.cards.length;
  const both = await Promise.all([call('experiment_run', { command: g1.command, gpus: 1, hours: 5 }, ctx), call('experiment_run', { command: g2.command, gpus: 1, hours: 5 }, ctx)]);
  assert.equal(both.filter((x) => !x.error).length, 1, 'one starts');
  assert.equal(sessions.cards.length, before + 1, 'the other asks');
  assert.equal(budgetNow(db, 'claude:b')!.reserved, 5, 'and the claim is let go once the run is in line');

  // It is kept in the app's data: the store opened again (as after a restart) has it.
  const again = openDb(dbFile);
  const kept = budgetNow(again, 'claude:b')!;
  again.close();
  assert.equal(kept.gpuHours, 10);
  assert.ok(Math.abs(kept.used - 2) < 0.05 && kept.reserved === 5);

  // Deleting an ended run's record does not give its hours back.
  deleteRun(db, first.id);
  assert.ok(Math.abs(budgetNow(db, 'claude:b')!.used - 2) < 0.05);

  // A second one asks anew and takes the first's place.
  sessions.answer = 'accept';
  await sleep(20);
  const second = (await budget({ gpuHours: 30, why: 'More seeds.' })).json.budget;
  assert.match(lastCard().detail!, /It replaces the budget of 10 GPU hours given before\./);
  assert.deepEqual(second, { gpuHours: 30, used: 0, reserved: 5, left: 25 });
  g1.open();
  g2.open();
  await clearQueue();

  // In a git repository a run's code is read after it is in line: two that fit together, asked at once, both start.
  const par = ctxOf({ key: 'claude:par', cwd: repo });
  await call('experiment_budget', { gpuHours: 10, why: 'Two runs.' }, par);
  const asked = sessions.cards.length;
  const g3 = gate();
  const g4 = gate();
  const two = await Promise.all([call('experiment_run', { command: g3.command, gpus: 1, hours: 4 }, par), call('experiment_run', { command: g4.command, gpus: 1, hours: 4 }, par)]);
  assert.deepEqual(two.map((x) => x.error), [false, false], two.map((x) => x.text).join());
  assert.equal(sessions.cards.length, asked, 'no card: 8 of 10');
  assert.equal(budgetNow(db, 'claude:par')!.reserved, 8);
  g3.open();
  g4.open();
  await clearQueue();

  // A session that asks nothing anyway needs none.
  sessions.mode = 'bypassPermissions';
  const n = sessions.cards.length;
  const full = (await call('experiment_budget', { gpuHours: 5, why: 'x' }, ctxOf({ key: 'claude:full' }))).json;
  assert.equal(full.budget, null);
  assert.equal(sessions.cards.length, n);
  sessions.mode = 'plan';
  assert.match((await call('experiment_budget', { gpuHours: 5, why: 'x' }, ctxOf({ key: 'claude:plan' }))).text, /only reads/);
  sessions.mode = 'default';
  forgetAll();
});

// ---- the ceiling on agents' runs ------------------------------------------------------------------------------------

test('what counts toward the ceiling: agents’ runs on this computer’s GPUs in the last seven days, running ones up to now', async () => {
  forgetAll();
  assert.equal(settingsOf(db).agentGpuHours, null, 'no limit unless set');
  assert.deepEqual(agentsUse(db), { used: 0, held: 0 });
  setSettings(db, { agentGpuHours: 100 });
  ran({ hours: 3, gpus: 2, by: { session: 'claude:s1' } }); // 6: a session's (a scheduled task's, the agent on call's)
  ran({ hours: 2, by: { app: 'app1' } }); // 2: an app's step
  ran({ hours: 1, by: { agent: true } }); // 1: through the app's API, an agent's evolution
  ran({ hours: 50, by: { page: true } }); // the person's
  ran({ hours: 50 }); // nobody said
  ran({ hours: 50, by: { session: 'claude:s1' }, ago: 8 * 24 }); // ended before the seven days
  ran({ hours: 4, by: { session: 'claude:s1' }, ago: 7 * 24 - 1 }); // 1: only its last hour is inside them
  ran({ hours: 50, by: { session: 'claude:s1' }, gpus: 0 }); // no GPU
  ran({ hours: 50, by: { session: 'claude:s1' }, where: 'c:somewhere' }); // a cluster's
  ran({ hours: 50, by: { session: 'claude:s1' }, info: { remote: { machine: 'm1', id: 'x' } } }); // another machine's
  const going = ran({ hours: 0.5, by: { session: 'claude:s1' }, status: 'running' }); // 0.5 so far
  // A night run's earlier start, stopped at the night's end, still counts.
  const night = ran({ hours: 1, by: { agent: true }, info: { earlierSpans: [[Date.now() - 5 * HOUR, Date.now() - 3 * HOUR]] } }); // 1 + 2
  assert.ok(Math.abs(agentsUse(db).used - 13.5) < 0.02, `${agentsUse(db).used}`);
  assert.equal(agentsUse(db).ceiling, 100);
  assert.equal(usedHours({ gpus: 2, startedAt: HOUR, endedAt: 2 * HOUR }, 0, 10 * HOUR), 2);
  // Deleting the record does not give the hours back.
  deleteRun(db, night);
  assert.ok(Math.abs(agentsUse(db).used - 13.5) < 0.02, `${agentsUse(db).used}`);
  forget(going);
  forgetAll();

  // Who the app's own ways of starting say started a run.
  const post = async (url: string, payload: Record<string, unknown>, internal = false) => (await http.inject({ method: 'POST', url, payload, headers: internal ? internalHeaders() : {} })).json();
  assert.deepEqual((await post('/api/experiments/jobs', { command: 'echo 1', cwd: tmp, gpus: 0 })).run.startedBy, { page: true });
  assert.deepEqual((await post('/api/experiments/jobs', { command: 'echo 1', cwd: tmp, gpus: 0 }, true)).run.startedBy, { agent: true }, 'app_api: an agent’s');
  assert.deepEqual((await post('/api/experiments/jobs', { command: 'echo 1', cwd: tmp, gpus: 0, agent: true })).run.startedBy, { agent: true }, 'sent by an agent on another machine');
  const sweep = await startSweep(deps, { command: 'echo {x}', params: { x: [1] }, group: 'who', gpus: 0 }, { cwd: tmp, startedBy: { session: 'claude:s1' } });
  assert.deepEqual(sweep.runs[0].startedBy, { session: 'claude:s1' });
  await until(() => local().length === 0, 30_000, 'them to end');
  forgetAll();
});

test('at the ceiling an agent’s run is held and holds nobody back; Let it run; one notice a day', async () => {
  forgetAll();
  forgetNotices();
  notices.length = 0;
  setSettings(db, { agentGpuHours: 10 });
  const past = ran({ hours: 9.5, by: { session: 'claude:s1' } });
  // Under it, agents' runs start as ever.
  const under = gate();
  const u = await agent({ command: under.command, gpus: 1 });
  await until(() => status(u.id) === 'running', 20_000, 'it to run');
  under.open();
  await until(() => status(u.id) === 'done', 20_000, 'it to end');

  updateRun(db, past, { startedAt: getRun(db, past)!.endedAt! - 10 * HOUR });
  sessions.mode = 'bypassPermissions';
  const g = gate();
  const answer = (await call('experiment_run', { command: g.command, gpus: 4, hours: 1, name: 'big' })).json;
  sessions.mode = 'default';
  assert.equal(answer.status, 'waiting', 'in full access too');
  assert.equal(answer.why, 'Waits for you: agents have used 10 of 10 GPU hours in the last seven days');
  assert.match(answer.note, /It is held, not started/);
  const big = answer.id as string;
  const g2 = gate();
  const second = await agent({ command: g2.command, gpus: 4, name: 'second' });
  // A trial is held too, and not waited for.
  const t0 = Date.now();
  sessions.answer = 'accept';
  const trial = (await call('experiment_try', { command: 'echo try', gpus: 1 })).json;
  assert.ok(Date.now() - t0 < 5000 && trial.status === 'waiting' && /It is held/.test(trial.note), JSON.stringify(trial));
  await stopRun(deps, trial.id);

  // Long after, others still start: a held run waits for the person, not for a GPU, so nothing is kept for it. (The held
  // ones are made 40 minutes older, the clock left alone: moved, it could pass midnight and be another day's notice.)
  db.prepare('update exp_runs set created_at = created_at - ? where id in (?, ?)').run(40 * 60_000, big, second.id);
  const mine = gate();
  const m = await person({ command: mine.command, gpus: 4, name: 'mine' });
  const cpu = await agent({ command: 'echo acc=1', gpus: 0, name: 'cpu' });
  await until(() => status(m.id) === 'running' && status(cpu.id) === 'done', 20_000, 'the person’s run and the agent’s without a GPU');
  assert.equal(status(big), 'waiting');
  assert.equal(getRun(db, big)!.held, true);
  assert.equal(status(second.id), 'waiting');
  assert.match(getRun(db, second.id)!.why!, /^Waits for you: agents have used 10 of 10 GPU hours/);
  assert.equal(getRunWithEvents(db, big)!.events!.filter((e) => e.kind === 'waiting').length, 1, 'said once');
  assert.deepEqual((await http.inject({ method: 'GET', url: '/api/experiments/budget' })).json(), { ceiling: 10, used: 10, held: 2 } satisfies AgentsUse);

  const told = () => notices.filter((n) => /^Agents reached/.test(n.body ?? ''));
  assert.equal(told().length, 1, 'one notice');
  assert.match(told()[0].body!, /^Agents reached the 10 GPU hours you allow in seven days: [12] runs? waits? for you$/);
  assert.equal(told()[0].url, '/experiments');
  await steps();
  assert.equal(told().length, 1);
  ahead = 25 * HOUR;
  await steps();
  assert.equal(told().length, 2, 'once more the next day');
  assert.match(told()[1].body!, /: 2 runs wait for you$/);
  ahead = 0;

  // Let it run: this run only, beyond the ceiling. Not an agent's to do.
  const let_ = (id: string, internal = false) => http.inject({ method: 'POST', url: `/api/experiments/runs/${id}/let-run`, payload: {}, headers: internal ? internalHeaders() : {} });
  assert.equal((await let_(big, true)).statusCode, 403);
  assert.equal(ruleFor('POST', `/api/experiments/runs/${big}/let-run`).level, 'refuse');
  assert.equal(getRun(db, big)!.held, true);
  mine.open();
  await until(() => status(m.id) === 'done', 20_000, 'the GPUs to be free');
  assert.equal((await let_(big)).statusCode, 200);
  await until(() => status(big) === 'running', 20_000, 'it to run');
  assert.equal(getRun(db, big)!.held, undefined);
  assert.ok(getRunWithEvents(db, big)!.events!.some((e) => e.text === 'You let it run beyond the limit on agents’ GPU hours'));
  assert.equal(status(second.id), 'waiting');
  assert.equal(getRun(db, second.id)!.held, true, 'only that one');
  g.open();
  g2.open();
  await clearQueue();
  forgetAll();
});

test('when the seven days leave room again, held runs start by themselves, the oldest first; a limit removed lets them go', async () => {
  forgetAll();
  setSettings(db, { agentGpuHours: 10 });
  const past = ran({ hours: 10, by: { session: 'claude:s1' } });
  assert.equal(agentsUse(db).used, 10);
  const a = gate();
  const b = gate();
  const older = await agent({ command: a.command, gpus: 4, name: 'older' });
  await sleep(10);
  const newer = await agent({ command: b.command, gpus: 4, name: 'newer' });
  await steps();
  assert.ok(getRun(db, older.id)!.held && getRun(db, newer.id)!.held);
  // Eight days on, as it were: what was used has left the seven days.
  updateRun(db, past, { startedAt: Date.now() - 8 * DAY - 10 * HOUR, endedAt: Date.now() - 8 * DAY });
  await until(() => status(older.id) === 'running', 20_000, 'the older one to start');
  assert.equal(getRun(db, older.id)!.held, undefined);
  assert.ok(getRunWithEvents(db, older.id)!.events!.some((e) => e.text === 'There is room again under the limit: it takes its turn'));
  // The other has its turn too: now it waits for a GPU, counted from now, not from when it was made.
  await steps();
  const waits = getRun(db, newer.id)!;
  assert.ok(!waits.held && waits.status === 'waiting' && /^Waiting for 4 GPUs/.test(waits.why!), `${waits.why}`);
  assert.ok(waits.freedAt! > waits.createdAt);
  a.open();
  b.open();
  await clearQueue();
  forgetAll();

  ran({ hours: 11, by: { session: 'claude:s1' } });
  const c = gate();
  const held = await agent({ command: c.command, gpus: 1, name: 'held' });
  await steps();
  assert.equal(getRun(db, held.id)!.why, 'Waits for you: agents have used 11 of 10 GPU hours in the last seven days');
  setSettings(db, { agentGpuHours: null });
  await until(() => status(held.id) === 'running', 20_000, 'it to start');
  c.open();
  await clearQueue();
  forgetAll();
});

test('evaluation_score and evolve_start: their cost on the card, refused at the ceiling, their runs counted', async () => {
  forgetAll();
  setSettings(db, { agentGpuHours: 10 });
  const ev = await createEvaluation(deps, { name: 'Score', cwd: repo, command: 'sh eval.sh {seed}', metric: 'score', better: 'higher', protect: ['eval.sh'], seeds: [1, 2, 3], gpus: 1, hours: 0.5 });
  const ctx = ctxOf({ cwd: repo, key: 'claude:ev' });
  const base = await startScore(deps, ev.id, { kind: 'baseline', by: { who: 'you' } });
  await waitScore(deps, base.id, 30_000);
  sessions.answer = 'deny';
  await call('evaluation_score', {}, ctx);
  assert.ok(cardLines().includes('# At most 1.5 GPU hours (3 runs × 1 GPU × 0.5 h)'), lastCard().detail);
  const asked = await call('evolve_start', { files: ['model.sh'], candidates: 20 }, ctx);
  assert.match(asked.text, /said no/);
  // The start with three seeds, then each of 20 changes with one and then with all three.
  assert.ok(cardLines().includes('# At most 41.5 GPU hours (83 runs × 1 GPU × 0.5 h)'), lastCard().detail);

  ran({ hours: 10, by: { session: 'claude:ev' } });
  const cards = sessions.cards.length;
  const said = /^Not started: agents have used 10 of 10 GPU hours in the last seven days\. That is the limit the person set for agents’ runs: tell them\./;
  for (const [name, args] of [
    ['evaluation_score', {}],
    ['evolve_start', { files: ['model.sh'] }],
  ] as const) {
    const r = await call(name, args, ctx);
    assert.ok(r.error && said.test(r.text), r.text);
    const inFull = await call(name, args, ctxOf({ cwd: repo, step: name === 'evaluation_score' }));
    assert.ok(inFull.error && said.test(inFull.text), inFull.text);
  }
  assert.equal(sessions.cards.length, cards, 'not asked about');
  // Through app_api too.
  const api = await http.inject({ method: 'POST', url: `/api/experiments/evaluations/${ev.id}/scores`, payload: {}, headers: internalHeaders() });
  assert.equal(api.statusCode, 409);
  assert.match(api.json().error, said);
  assert.equal(local().length, 0);
  // The person's score runs; so does an evolution's of the person's.
  const mine = await startScore(deps, ev.id, { kind: 'score', by: { who: 'you' } });
  await until(() => mine.runs.every((id) => status(id) === 'done'), 30_000, 'the person’s score');
  assert.deepEqual(getRun(db, mine.runs[0])!.startedBy, { page: true });
  // A score of an evolution an agent started, and of a goal: put in line, and held there like any agent's run.
  const theirs = await startScore(deps, ev.id, { kind: 'score', by: { who: 'evolve', evolution: 'v1', candidate: 'c1' }, agent: true, projectSession: 'claude:ev', seeds: [1] });
  const goals = await startScore(deps, ev.id, { kind: 'score', by: { who: 'goal', session: 'claude:goal' }, seeds: [1] });
  await until(() => [theirs, goals].every((x) => getRun(db, x.runs[0])!.held), 20_000, 'them to be held');
  assert.deepEqual(getRun(db, theirs.runs[0])!.startedBy, { agent: true, for: 'claude:ev' });
  assert.equal(getRun(db, theirs.runs[0])!.evolution, 'v1');
  for (const id of [theirs.runs[0], goals.runs[0]]) await stopRun(deps, id);
  const persons = await startScore(deps, ev.id, { kind: 'score', by: { who: 'evolve', evolution: 'v2', candidate: 'c1' }, seeds: [1] });
  await until(() => persons.runs.every((id) => status(id) === 'done'), 30_000, 'the person’s evolution’s score');
  assert.deepEqual(getRun(db, persons.runs[0])!.startedBy, { page: true });
  await clearQueue();
  sessions.answer = 'accept';
  forgetAll();
});

test('a sweep at the edge: held as each run is about to start, by what agents have used by then', async () => {
  forgetAll();
  setSettings(db, { agentGpuHours: 100 });
  setGpuReader(async () => ({ gpus: [{ index: 0, name: 'Test GPU', memUsed: 0, memTotal: 24_576, util: 0 }] }));
  ran({ hours: 99, by: { session: 'claude:s1' } });
  sessions.mode = 'bypassPermissions';
  const g = gate();
  const answer = (await call('experiment_sweep', { command: `X={x}; ${g.command}`, params: { x: [1, 2, 3] }, group: 'edge', gpus: 1, hours: 5 })).json;
  sessions.mode = 'default';
  assert.equal(answer.held, undefined, 'under the limit when it is put in line');
  const [first, ...rest] = answer.runs as string[];
  await until(() => status(first) === 'running' && rest.every((id) => status(id) === 'waiting'), 20_000, 'the first to run, the others to wait for the GPU');
  assert.ok(rest.every((id) => !getRun(db, id)!.held && /^Waiting for 1 GPU/.test(getRun(db, id)!.why!)));
  // The one running has used two more hours by now: 101 of 100.
  updateRun(db, first, { startedAt: Date.now() - 2 * HOUR });
  await until(() => rest.every((id) => getRun(db, id)!.held), 20_000, 'the rest to be held');
  assert.equal(status(first), 'running', 'what runs goes on');
  assert.equal(getRun(db, rest[0])!.why, 'Waits for you: agents have used 101 of 100 GPU hours in the last seven days');
  g.open();
  await until(() => status(first) === 'done', 20_000, 'the first to end');
  await steps();
  assert.ok(rest.every((id) => status(id) === 'waiting' && getRun(db, id)!.held), 'the GPU is free, and they do not start');
  setGpuReader(fourGpus);
  await clearQueue();
  forgetAll();
});

test('the morning counts a held night run as waiting for you, not for tonight', async () => {
  assert.equal(morningWords({ done: 0, failed: 0, stopped: 0, running: 0, waiting: 0, held: 3 }), 'Last night: 3 runs wait for you');
  assert.equal(morningWords({ done: 2, failed: 0, stopped: 0, running: 0, waiting: 1, held: 1 }), 'Last night: 2 runs done, 1 still waits for tonight, 1 waits for you');
  forgetAll();
  forgetNotices();
  const clockAt = (hours: number) => new Date(Date.now() + hours * HOUR).toTimeString().slice(0, 5);
  setSettings(db, { agentGpuHours: 10, nightFrom: clockAt(-1), nightTo: clockAt(1) });
  ran({ hours: 10, by: { session: 'claude:s1' } });
  // The person's night run waits for the GPUs another of theirs holds; three of an agent's are held.
  const block = gate();
  const going = await person({ command: block.command, gpus: 4 });
  await until(() => status(going.id) === 'running', 20_000, 'it to run');
  const mine = await person({ command: 'echo mine', gpus: 4, when: 'night' });
  const theirs: RunRecord[] = [];
  for (const n of [1, 2, 3]) theirs.push(await agent({ command: `echo ${n}`, gpus: 1, when: 'night' }));
  await until(() => theirs.every((r) => getRun(db, r.id)!.held) && status(mine.id) === 'waiting', 20_000, 'them to wait');
  await steps();
  notices.length = 0;
  // The night ends.
  setSettings(db, { nightFrom: clockAt(2), nightTo: clockAt(3) });
  await until(() => notices.some((n) => n.key === 'experiments:night'), 20_000, 'the morning’s notice');
  assert.equal(notices.find((n) => n.key === 'experiments:night')!.body, 'Last night: 1 run still waits for tonight, 3 wait for you');
  block.open();
  await clearQueue();
  setSettings(db, { nightFrom: '23:00', nightTo: '07:00' });
  forgetAll();
});

test('a search an agent started stops at the ceiling, says why, and Let it run lets the whole search go; a goal’s score waits too', async () => {
  forgetAll();
  const folder = makeRepo('search');
  const space = createSpace(db, { name: 'Search', folder });
  let tried = 0;
  useEvolveDeps({
    ask: async () => `SUMMARY: another X\n=== model.sh\n<<<<<<< SEARCH\nX=1\n=======\nX=${++tried + 1}\n>>>>>>> REPLACE\n`,
    seed: () => 7,
    now: () => Date.now(),
  });
  const ticker = setInterval(() => void tick(), 100);
  try {
    const ev = await createEvaluation(deps, { name: 'Search score', cwd: folder, command: 'sh eval.sh', metric: 'score', better: 'higher', protect: ['eval.sh'], gpus: 1, hours: 0.5 });
    await waitScore(deps, (await startScore(deps, ev.id, { kind: 'baseline', by: { who: 'you' } })).id, 30_000);
    setSettings(db, { agentGpuHours: 10 });
    const e = await startEvolution(deps, { evaluation: ev.id, from: folder, files: ['model.sh'], candidates: 40, atOnce: 1, stallAfter: 0 }, { who: 'agent', session: 'claude:s1' });
    const evo = () => getEvolution(db, e.id)!;
    await until(() => evo().status === 'running' && evo().tried >= 1, 60_000, 'it to try one');
    assert.equal(evo().waits, undefined);
    // Agents reach the ceiling meanwhile: the next score is held, and the search waits for it.
    ran({ hours: 10, by: { session: 'claude:other' } });
    await until(() => !!evo().waits, 60_000, 'the search to wait');
    assert.match(evo().waits!, /^Waits for you: agents have used 1\d(\.\d)? of 10 GPU hours in the last seven days$/);
    assert.equal(evo().status, 'running');
    const held = listRuns(db, { status: ['waiting'], limit: 50 }).filter((r) => r.evolution === e.id);
    assert.ok(held.length >= 1 && held.every((r) => r.held));
    const before = { tried: evo().tried, activeMs: evo().activeMs };
    await sleep(1500);
    assert.deepEqual({ tried: evo().tried, activeMs: evo().activeMs }, before, 'nothing more is tried, and its hours stand still');
    // The Research tab: a card of the search's own, and its line.
    const brief = await researchBrief(deps, space, { now: clock.now() });
    assert.equal(brief.waiting[0].kind, 'held-search', JSON.stringify(brief.waiting.map((w) => w.kind)));
    assert.ok(!brief.waiting.some((w) => w.kind === 'held'), 'its scores are not counted as runs of their own');
    assert.ok(brief.work.searches[0].waits?.startsWith('Waits for you: '));
    // The person's alone.
    const url = `/api/experiments/evolutions/${e.id}/let-run`;
    assert.equal((await http.inject({ method: 'POST', url, payload: {}, headers: internalHeaders() })).statusCode, 403);
    assert.equal(ruleFor('POST', url).level, 'refuse');
    assert.equal(evo().letRun, undefined);
    assert.equal((await http.inject({ method: 'POST', url, payload: {} })).statusCode, 200);
    assert.ok(evo().letRun);
    // The whole search goes on: several more, none held again.
    await until(() => evo().tried >= before.tried + 3, 90_000, 'it to go on');
    assert.equal(evo().waits, undefined);
    assert.ok(listRuns(db, { limit: 500 }).filter((r) => r.evolution === e.id && r.createdAt > evo().letRun!).every((r) => r.letRun && !r.held));
    await stopEvolution(deps, e.id);
    await clearQueue();

    // The person's own search is never held.
    const own = await startEvolution(deps, { evaluation: ev.id, from: folder, files: ['model.sh'], candidates: 40, atOnce: 1, stallAfter: 0 }, { who: 'you' });
    await until(() => getEvolution(db, own.id)!.tried >= 1, 60_000, 'the person’s search to try one');
    assert.equal(getEvolution(db, own.id)!.waits, undefined);
    assert.ok(candidatesOf(db, own.id).length >= 1);
    await stopEvolution(deps, own.id);
    await clearQueue();

    // A goal's score is held too, and the wait does not run out of its time while it is.
    const fx = await fixScores(deps, { key: 'claude:goal', cwd: folder, checks: [{ id: 'c1', kind: 'score', label: 'Beats it', evaluation: ev.id, gain: 0 }], who: 'you' });
    assert.deepEqual(fx.errors, []);
    const ids: string[] = [];
    let over = false;
    const check = scoreCheck(deps, fx.checks[0], { key: 'claude:goal', cwd: folder, timeoutS: 2, signal: new AbortController().signal, started: (id) => ids.push(id), progress: () => {} }).finally(() => (over = true));
    await sleep(4000);
    assert.equal(over, false, 'still waiting, past its two seconds');
    const runs = listRuns(db, { status: ['waiting'], limit: 50 });
    assert.ok(runs.length === 1 && runs[0].held, 'held, not refused');
    setSettings(db, { agentGpuHours: null });
    const r = await check;
    assert.equal(r.trouble, undefined, r.result.error);
    assert.ok(r.result.value !== undefined);
  } finally {
    clearInterval(ticker);
  }
  forgetAll();
});

// ---- the routes and app_api -----------------------------------------------------------------------------------------

test('the setting: empty for no limit, checked, and changed by an agent only on a card, in full access too', async () => {
  forgetAll();
  const put = (payload: Record<string, unknown>) => http.inject({ method: 'PUT', url: '/api/experiments/settings', payload });
  assert.equal((await put({ agentGpuHours: 100 })).json().agentGpuHours, 100);
  assert.equal((await put({ agentGpuHours: 0 })).json().agentGpuHours, 0, 'none at all is a limit too');
  assert.equal((await put({ agentGpuHours: '' })).json().agentGpuHours, null);
  assert.equal((await put({ agentGpuHours: 40 })).json().agentGpuHours, 40);
  assert.equal((await put({ agentGpuHours: null })).json().agentGpuHours, null);
  assert.equal((await put({ cpuSlots: 4 })).json().agentGpuHours, null);
  assert.equal((await put({ agentGpuHours: -1 })).statusCode, 400);
  assert.equal((await put({ agentGpuHours: 'much' })).statusCode, 400);
  assert.deepEqual((await http.inject({ method: 'GET', url: '/api/experiments/budget' })).json(), { used: 0, held: 0 });
  sessions.mode = 'bypassPermissions';
  sessions.answer = 'deny';
  const n = sessions.cards.length;
  await appApi({ method: 'PUT', path: '/api/experiments/settings', body: { agentGpuHours: 1000 } }, ctxOf());
  assert.equal(sessions.cards.length, n + 1);
  assert.equal(settingsOf(db).agentGpuHours, null);
  await appApi({ method: 'PUT', path: '/api/experiments/settings', body: { cpuSlots: 4 } }, ctxOf());
  assert.equal(sessions.cards.length, n + 1, 'the other settings as before');
  sessions.mode = 'default';
  sessions.answer = 'accept';
});

// ---- the Research tab -----------------------------------------------------------------------------------------------

test('the Research tab: the held runs first and the week against the ceiling; as before without one', async () => {
  forgetAll();
  const folder = path.join(tmp, 'project');
  fs.mkdirSync(folder);
  const space = createSpace(db, { name: 'Retriever', folder });
  ran({ hours: 2, cwd: folder, by: { page: true } });
  const brief = () => researchBrief(deps, space, { now: clock.now() });
  const before = await brief();
  assert.equal(before.week.agents, undefined);
  assert.equal(before.week.gpuHours, 2);
  assert.ok(!before.waiting.some((w) => w.kind === 'held'));

  setSettings(db, { agentGpuHours: 100 });
  // The whole computer's agents, not only this project's.
  ran({ hours: 61, by: { session: 'claude:s1' } });
  const under = await brief();
  assert.deepEqual(under.week.agents, { used: 61, ceiling: 100 });
  assert.ok(!under.waiting.some((w) => w.kind === 'held'));

  ran({ hours: 39, by: { app: 'a' } });
  const held = [await agent({ command: 'echo one', cwd: folder, gpus: 1 }), await agent({ command: 'echo two', cwd: folder, gpus: 1 })];
  await agent({ command: 'echo elsewhere', gpus: 1 });
  await steps();
  const full = await brief();
  assert.equal(full.waiting[0].kind, 'held', 'before the other cards');
  assert.deepEqual(full.waiting[0].kind === 'held' && { runs: full.waiting[0].runs, ceiling: full.waiting[0].ceiling }, { runs: held.map((r) => r.id), ceiling: 100 });
  assert.deepEqual(full.week.agents, { used: 100, ceiling: 100 });
  assert.deepEqual(
    full.work.runs.map((r) => r.why),
    held.map(() => 'Waits for you: agents have used 100 of 100 GPU hours in the last seven days'),
  );
  await clearQueue();
  setSettings(db, { agentGpuHours: null });
  assert.equal((await brief()).week.agents, undefined);
  forgetAll();
});

// ---- runs that carry on ----------------------------------------------------------------------------------------------

/** The processes of a run here go at once, as when the computer restarts. */
const killWhole = (id: string) => process.kill(-pidOf(runFolder(id))!, 'SIGKILL');
const printed = (id: string, word: string) => {
  try {
    return fs.readFileSync(path.join(runFolder(id), 'log.txt'), 'utf8').includes(word);
  } catch {
    return false;
  }
};

test('a run with a command to carry on: its card says its cost and that command; started again, it is the same agent’s under the limit', async () => {
  forgetAll();
  const a = await call('experiment_run', { command: 'echo up; sleep 60', resume: 'echo carried; sleep 60', gpus: 1, hours: 2 });
  assert.ok(!a.error, a.text);
  assert.deepEqual(cardLines().filter((l) => /carry on|GPU hour/.test(l)), ['# to carry on after a stop: echo carried; sleep 60', '# At most 2 GPU hours (1 GPU × 2 h)']);
  const let_ = await agent({ command: 'echo up; sleep 60', resume: 'echo carried; sleep 60', gpus: 1 });
  await until(() => printed(a.json.id, 'up') && printed(let_.id, 'up'), 30_000, 'them to run');
  // The limit is reached while they run; one of them the person had let run beyond it.
  updateRun(db, let_.id, { info: { letRun: clock.now() } });
  ran({ hours: 5, by: { session: 'claude:s1' } });
  setSettings(db, { agentGpuHours: 2 });
  forgetLive();
  killWhole(a.json.id);
  killWhole(let_.id);
  await until(() => [a.json.id, let_.id].every((id) => !!getRun(db, id)!.restartedAs), 30_000, 'both to be started again');
  const held = getRun(db, getRun(db, a.json.id)!.restartedAs!)!;
  const free = getRun(db, getRun(db, let_.id)!.restartedAs!)!;
  assert.deepEqual([held.startedBy, free.startedBy], [{ session: 'claude:s1' }, { session: 'claude:s1' }]);
  await until(() => !!getRun(db, held.id)!.held && status(free.id) === 'running', 30_000, 'one held, the other going');
  assert.match(getRun(db, held.id)!.why!, /^Waits for you: agents have used/);
  assert.ok(getRun(db, free.id)!.letRun);
  assert.equal(printed(held.id, 'carried'), false, 'a held run stays held');
  // Run again to carry on, by the agent: the card, again, with the command that will run and what it may cost.
  const again = await call('experiment_run', { again: a.json.id, carryOn: true });
  assert.ok(!again.error, again.text);
  assert.equal(cardLines()[0], 'echo carried; sleep 60');
  assert.ok(cardLines().includes('# At most 2 GPU hours (1 GPU × 2 h)'), cardLines().join('\n'));
  assert.equal(again.json.status, 'waiting');
  await clearQueue();
  setSettings(db, { agentGpuHours: null });
  forgetAll();
});

// ---- run ------------------------------------------------------------------------------------------------------------

let failedTests = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (e) {
    failedTests++;
    console.error(`✗ ${name}\n  ${(e as Error).stack ?? e}`);
    sessions.mode = 'default';
    sessions.answer = 'accept';
    setSettings(db, { agentGpuHours: null });
    await clearQueue().catch(() => {});
    forgetAll();
  }
}
await stopTmuxServer().catch(() => {});
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failedTests} failed`);
process.exit(failedTests ? 1 : 0);
