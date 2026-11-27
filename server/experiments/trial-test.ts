// Checks for what a run used and for trying a command first: sampling with stand-ins for nvidia-smi and /proc (series
// and peaks, nothing read when nothing runs, how often, a reader that fails), real tiny jobs through tmux with made-up
// GPUs (no GPU is used): a trial that gets going (peaks, the time for a step, the estimate, what to ask for), one that
// fails at once, one that does not say how far it has to go, trials kept out of lists and notices, the peak remembered
// for the same command; the out-of-memory label end to end; a stall and a NaN told without the agent on call.
// Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/experiments/trial-test.ts
//   DATA_DIR=<a scratch folder> CUDA_VISIBLE_DEVICES= node dist/dev/trial-test.js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { experimentNoticeOf, tryUpWhy, type RunRecord } from '../../shared/experiments.ts';
import type { NotifyEvent } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { setGpuReader } from './gpus.ts';
import { experiments } from './index.ts';
import { pidOf, stopTmuxServer } from './local.ts';
import { gather } from './notices.ts';
import { cleanJob, forgetNotices, runAgain, submit, tick, useDeps } from './queue.ts';
import { getRun, getRunWithEvents, insertRun, listRuns, resetRun, runFolder, saveSeries, seriesOf, systemSeriesOf, updateRun } from './records.ts';
import { experimentTools } from './tools.ts';
import { askGb, askHours, barRate, commandSignature, lastPeak, trialAnswer } from './trial.ts';
import { forgetUsage, parseGpuApps, parseGpuUse, parseStat, sampleRuns, setUsageReader, treeOf, type ProcessUse, type UsageReader } from './usage.ts';

if (!process.env.DATA_DIR || !path.resolve(process.env.DATA_DIR).startsWith(path.join(os.tmpdir(), path.sep))) {
  console.error('Run with DATA_DIR set to a scratch folder under the temporary folder, so nothing touches real data.');
  process.exit(2);
}
if (process.env.CUDA_VISIBLE_DEVICES !== '') {
  console.error('Run with CUDA_VISIBLE_DEVICES= (empty): these tests never use a GPU.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-trial-test-'));
const db = openDb(path.join(tmp, 'test.db'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Sessions extends EventEmitter {
  delivered: { key: string; text: string }[] = [];
  summary(key: string) {
    return key.startsWith('claude:') ? ({ key, title: key, queue: undefined, live: null } as any) : null;
  }
  async create() {
    return 'claude:oncall';
  }
  async deliverOrQueue(key: string, text: string) {
    this.delivered.push({ key, text });
  }
  editQueued() {}
  dropQueued() {}
  adapterByRun() {
    return { state: { mode: 'full' }, ask: async () => ({ decision: 'accept' }) };
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
gather.ms = 50;
await http.ready();

// ---- stand-ins ---------------------------------------------------------------------------------------------------

const MiB = 1024;
/** GPU 0 has another program on it holding 9.1 GB; GPU 1 is free. */
const two = async () => ({
  gpus: [
    { index: 0, name: 'Test GPU', memUsed: Math.round(9.1 * MiB), memTotal: 24 * MiB, util: 40 },
    { index: 1, name: 'Test GPU', memUsed: 100, memTotal: 24 * MiB, util: 0 },
  ],
});
setGpuReader(two);

/** What each run's processes hold, by its name's start (GB of GPU memory); the sampler reads it through these. */
let gpuHeld = 9.4;
let cpuSeconds = 0;
let calls = { gpus: 0, apps: 0, processes: 0 };
let failing = false;
const roots = () => listRuns(db, { status: ['running'], limit: 100 }).flatMap((r) => (pidOf(r.folder ?? runFolder(r.id)) ? [{ r, pid: pidOf(r.folder ?? runFolder(r.id))! }] : []));
const childOf = (pid: number) => pid + 5_000_000;
const standIn: UsageReader = {
  async gpus() {
    calls.gpus++;
    if (failing) throw new Error('nvidia-smi is broken');
    return [0, 1].map((i) => ({ index: i, uuid: `GPU-${i}`, memUsed: Math.round((9.1 + (i === 0 ? gpuHeld : 0)) * MiB), memTotal: 24 * MiB, util: 77 }));
  },
  async apps() {
    calls.apps++;
    if (failing) throw new Error('nvidia-smi is broken');
    return [
      // Another program's, which no run's.
      { pid: 999, uuid: 'GPU-0', usedMib: Math.round(9.1 * MiB) },
      ...roots().flatMap(({ r, pid }) => (r.gpuIds ?? []).map((g) => ({ pid: childOf(pid), uuid: `GPU-${g}`, usedMib: Math.round(gpuHeld * MiB) }))),
    ];
  },
  processes(tree) {
    calls.processes++;
    if (failing) throw new Error('no /proc');
    cpuSeconds += 5;
    const all: ProcessUse[] = roots().flatMap(({ pid }) => [
      { pid, ppid: 1, session: pid, cpuSeconds: 0, rssBytes: 0 },
      { pid: childOf(pid), ppid: pid, session: pid, cpuSeconds, rssBytes: 0 },
    ]);
    return tree([...all, { pid: 999, ppid: 1, session: 999, cpuSeconds: 100, rssBytes: 0 }]).map((p) => ({ ...p, rssBytes: p.ppid === 1 ? 0 : 3 * 1024 ** 3 }));
  },
  memory: () => ({ totalBytes: 64 * 1024 ** 3, availableBytes: 30 * 1024 ** 3 }),
};
setUsageReader(standIn);

async function until(fn: () => boolean, ms = 25_000, what = 'it') {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await tick();
    if (fn()) return;
    await sleep(150);
  }
  assert.fail(`timed out waiting for ${what}`);
}
const ended = (id: string) => () => ['done', 'failed', 'stopped', 'lost'].includes(getRun(db, id)!.status);
const job = async (o: Record<string, unknown>, startedBy?: { session: string }) => submit(deps, await cleanJob(db, { cwd: tmp, gpus: 0, ...o }), startedBy ? { startedBy } : {});
/** The trial's time is made to be up. */
const timeUp = (id: string, seconds = 90) => updateRun(db, id, { startedAt: getRun(db, id)!.startedAt! - seconds * 1000 });
const ctxOf = (over: Partial<RunCtx> = {}): RunCtx => ({ deps, key: 'claude:s1', runId: 'run1', cwd: tmp, agent: 'claude', ...over }) as RunCtx;
const call = async (name: string, args: Record<string, unknown>, ctx = ctxOf()) => experimentTools(ctx).find((t) => t.name === name)!.run(args, ctx) as Promise<any>;
const textOf = (x: any) => (typeof x === 'string' ? x : x.text);

// ---- sampling ----------------------------------------------------------------------------------------------------

test('reading nvidia-smi’s two lists and /proc’s stat; a run’s processes are those under its wrapper', () => {
  assert.deepEqual(parseGpuUse('0, GPU-aa, 1200, 24564, 3\n'), [{ index: 0, uuid: 'GPU-aa', memUsed: 1200, memTotal: 24564, util: 3 }]);
  assert.deepEqual(parseGpuApps('4242, 900, GPU-aa\n[Not Supported]\n'), [{ pid: 4242, usedMib: 900, uuid: 'GPU-aa' }]);
  assert.deepEqual(parseStat('77 (a (b) c) S 5 77 77 0 -1 4194304 1 0 0 0 150 50 25 25 20 0 1 0 100 0 0'), { pid: 77, ppid: 5, session: 77, cpuSeconds: 2.5 });
  assert.equal(parseStat('nonsense'), null);
  const p = (pid: number, ppid: number, session = 1) => ({ pid, ppid, session, cpuSeconds: 0, rssBytes: 0 });
  assert.deepEqual(treeOf(10, [p(10, 1), p(11, 10), p(12, 11), p(13, 1, 10), p(20, 1)]).map((x) => x.pid).sort(), [10, 11, 12, 13]);
});

test('sampling: series and peaks beside the metrics, one reading for all runs, nothing when none runs, a reader that fails harms nothing', async () => {
  forgetUsage();
  const t0 = Date.now();
  const make = (id: string, gpuIds: number[], pid: number) => {
    insertRun(db, { id, spec: { command: 'sleep 1', cwd: tmp }, status: 'running', info: { folder: runFolder(id), gpuIds } });
    updateRun(db, id, { startedAt: t0, info: { others: { start: gpuIds.map(() => 9.1) } } });
    fs.mkdirSync(runFolder(id), { recursive: true });
    fs.writeFileSync(path.join(runFolder(id), 'pid'), String(pid));
    return getRun(db, id)!;
  };
  calls = { gpus: 0, apps: 0, processes: 0 };
  await sampleRuns(db, [], t0);
  assert.deepEqual(calls, { gpus: 0, apps: 0, processes: 0 }, 'nothing when nothing runs');
  const a = make('rsample1', [0], 31001);
  const b = make('rsample2', [1], 31002);
  const both = () => [getRun(db, a.id)!, getRun(db, b.id)!];
  gpuHeld = 4;
  await sampleRuns(db, both(), t0 + 10_000);
  assert.deepEqual(calls, { gpus: 1, apps: 1, processes: 1 }, 'one reading for both');
  gpuHeld = 6;
  await sampleRuns(db, both(), t0 + 13_000);
  assert.equal(calls.gpus, 1, 'not again before ten seconds');
  await sampleRuns(db, both(), t0 + 20_000);
  gpuHeld = 5;
  await sampleRuns(db, both(), t0 + 30_000);
  const x = getRun(db, a.id)!;
  assert.deepEqual(x.peak, { gpuMemGb: [6], ramGb: 3 });
  assert.deepEqual(x.others, { start: [9.1], end: [9.1] }, 'what others hold: the whole less its own');
  assert.deepEqual(x.gpuTotalGb, [24]);
  assert.equal(x.memoryLimitGb, 64);
  const s = systemSeriesOf(db, a.id);
  assert.deepEqual(Object.keys(s).sort(), ['system/cpu', 'system/gpu_mem_gb', 'system/gpu_util', 'system/ram_gb']);
  assert.deepEqual(s['system/gpu_mem_gb'].map((p) => p[1]), [4, 6, 5]);
  assert.equal(s['system/ram_gb'].length, 3);
  assert.ok(s['system/cpu'].length === 2 && s['system/cpu'][0][1] > 0, JSON.stringify(s['system/cpu']));
  // A run's own metrics never meet them.
  saveSeries(db, a.id, { loss: [[1, 2]], 'system/cpu': [[1, 99]] });
  assert.deepEqual(Object.keys(seriesOf(db, a.id)).sort(), ['loss', 'system/cpu']);
  assert.equal(systemSeriesOf(db, a.id)['system/cpu'].length, 2);
  const view = (await http.inject({ method: 'GET', url: `/api/experiments/runs/${a.id}` })).json();
  assert.equal(view.system['system/gpu_mem_gb'].length, 3);
  // After ten minutes, every thirty seconds.
  const old = () => both().map((r) => ({ ...r, startedAt: t0 - 11 * 60_000 }));
  calls = { gpus: 0, apps: 0, processes: 0 };
  await sampleRuns(db, old(), t0 + 40_000);
  assert.equal(calls.gpus, 0);
  await sampleRuns(db, old(), t0 + 61_000);
  assert.equal(calls.gpus, 1);
  // A reader that fails loses only that reading.
  failing = true;
  const before = getRun(db, a.id)!.peak;
  await sampleRuns(db, old(), t0 + 100_000);
  failing = false;
  assert.equal(getRun(db, a.id)!.status, 'running');
  assert.deepEqual(getRun(db, a.id)!.peak, before);
  assert.equal(systemSeriesOf(db, a.id)['system/gpu_mem_gb'].length, 4);
  // A run put back to wait starts again with none.
  resetRun(db, a.id, 'again');
  assert.deepEqual(systemSeriesOf(db, a.id), {});
  assert.equal(getRun(db, a.id)!.peak, undefined);
  for (const r of [a, b]) updateRun(db, r.id, { status: 'stopped' });
  gpuHeld = 9.4;
});

// ---- trials ------------------------------------------------------------------------------------------------------

test('a trial’s answer: the time for a step, the estimate and what to ask for', () => {
  assert.equal(askGb(9.4), 11);
  assert.equal(askGb(10), 11);
  assert.equal(askGb(0.2), 1);
  assert.equal(askHours(10 / 3), 4.2);
  assert.equal(askHours(0.01), 0.1);
  assert.equal(barRate('Training:  4%|4         | 200/5000 [00:10<04:00, 20.0it/s]\n'), 0.05);
  assert.equal(barRate('train:  4%|4 | 20/500 [00:50<20:00,  2.50s/it]'), 2.5);
  assert.equal(barRate('Downloading: 4%|4 | 20/500 [00:50<20:00, 3.0it/s]'), undefined, 'a download’s bar is not the training’s');
  const t = 1_000_000;
  const r = {
    id: 'r1',
    status: 'stopped',
    why: tryUpWhy(90),
    tags: ['try'],
    env: { HYDOR_TRY: '1', HYDOR_TRY_SECONDS: '90' },
    command: 'x',
    cwd: tmp,
    createdAt: t,
    startedAt: t,
    endedAt: t + 91_000,
    gpuIds: [0],
    peak: { gpuMemGb: [9.4], ramGb: 3.14 },
    tried: { first: { done: 10, total: 5000, at: t + 30_000 }, last: { done: 40, total: 5000, at: t + 90_000 } },
  } as RunRecord;
  const a = trialAnswer(r);
  assert.equal(a.ok, true);
  assert.equal(a.over, true);
  assert.equal(a.stepSeconds, 2);
  // 10 s to start (30 s less ten steps of 2 s) and 5000 steps of 2 s.
  assert.ok(Math.abs(a.estimateHours! - 10_010 / 3600) < 0.01, String(a.estimateHours));
  assert.deepEqual(a.ask, { gpuMemGb: 11, hours: 3.5 });
  assert.equal(a.said, 'It got going. It peaked at 9.4 GB of GPU memory and 3.1 GB of memory. A step takes about 2 s, and the whole run about 2 h 47 min. Ask for gpuMemGb 11 and hours 3.5.');
  const quiet = trialAnswer({ ...r, tried: undefined });
  assert.equal(quiet.estimateHours, undefined);
  assert.match(quiet.said, /It did not say how far it has to go\./);
  assert.deepEqual(quiet.ask, { gpuMemGb: 11 });
  // One that ran to its end: the whole run takes about as long, with a quarter more to ask for.
  const done = trialAnswer({ ...r, status: 'done', why: undefined, endedAt: t + 61_000, tried: { last: { done: 20, total: 20, at: t + 20_000 } } });
  assert.equal(done.finished, true);
  assert.ok(Math.abs(done.estimateHours! - 61 / 3600) < 1e-4, String(done.estimateHours));
  assert.deepEqual(done.ask, { gpuMemGb: 11, hours: 0.1 });
  assert.equal(done.said, 'It ran to its end in 61 s: the whole run takes about that long, unless your script shortens itself when it sees HYDOR_TRY. It peaked at 9.4 GB of GPU memory and 3.1 GB of memory. Ask for gpuMemGb 11 and hours 0.1.');
  const long = trialAnswer({ ...r, status: 'done', why: undefined, endedAt: t + 480_000, tried: undefined, peak: undefined });
  assert.deepEqual([long.estimateHours, long.ask], [0.133, { hours: 0.2 }], '8 minutes and a quarter more, up to a tenth of an hour');
  // One that ended by itself with steps left: by its steps, not by how long it took.
  const short = trialAnswer({ ...r, status: 'done', why: undefined });
  assert.ok(Math.abs(short.estimateHours! - 10_010 / 3600) < 0.01, String(short.estimateHours));
  assert.match(short.said, /^It ran to its end in 91 s\. .*A step takes about 2 s, and the whole run about 2 h 47 min\./);
  const failed = trialAnswer({ ...r, status: 'failed', why: 'Its command ended with exit code 1', firstError: { line: 3, text: 'KeyError: x', lines: [], from: 1, offset: 0 } });
  assert.equal(failed.ok, false);
  assert.equal(failed.ask, undefined);
  assert.match(failed.said, /^It failed after 91 s: Its command ended with exit code 1\. Where it first went wrong \(line 3 of its log\): KeyError: x$/);
});

let tried: RunRecord;
test('a trial that gets going: stopped when its time is up (no failure), with its peaks, step time, estimate and what to ask for', async () => {
  forgetUsage();
  notices.length = 0;
  forgetNotices();
  const script = path.join(tmp, 'train.sh');
  fs.writeFileSync(script, 'echo "try=$HYDOR_TRY seconds=$HYDOR_TRY_SECONDS lr=$2"; for i in $(seq 1 600); do echo "step $i/5000 loss=1.0"; sleep 0.1; done\n');
  const res = await http.inject({ method: 'POST', url: '/api/experiments/try', payload: { command: 'sh train.sh --lr {lr}', cwd: tmp, gpus: 1, gpuMemGb: 5, params: { lr: [0.01, 0.001] } } });
  assert.equal(res.statusCode, 200, res.body);
  const { run, trial } = res.json();
  assert.equal(trial.over, false);
  assert.equal(run.command, 'sh train.sh --lr 0.01', 'a sweep’s first combination');
  assert.equal(run.env.HYDOR_TRY_SECONDS, '90');
  assert.equal(run.name, 'Try: train.sh');
  await until(() => { const r = getRun(db, run.id)!; return !!r.peak?.gpuMemGb[0] && !!r.tried?.first && !!r.tried.last && r.tried.last.at - r.tried.first.at > 2500; }, 30_000, 'it to sample and read progress');
  timeUp(run.id);
  await until(ended(run.id), 30_000, 'the trial to stop');
  const r = getRun(db, run.id)!;
  tried = r;
  assert.equal(r.status, 'stopped', r.why);
  assert.equal(r.why, 'Tried for 90 seconds, then stopped');
  assert.match(fs.readFileSync(path.join(runFolder(r.id), 'log.txt'), 'utf8'), /try=1 seconds=90 lr=0\.01/);
  const a = (await http.inject({ method: 'GET', url: `/api/experiments/try/${r.id}` })).json().trial;
  assert.equal(a.ok, true, a.said);
  assert.equal(a.gpuMemGb, 9.4);
  assert.equal(a.ramGb, 3);
  assert.equal(a.steps.total, 5000);
  assert.ok(a.stepSeconds > 0.05 && a.stepSeconds < 0.5, `step ${a.stepSeconds}`);
  assert.equal(a.ask.gpuMemGb, 11);
  assert.ok(a.ask.hours >= 0.1, String(a.ask.hours));
  assert.equal(notices.length, 0, 'no one is told of a trial');
});

test('a trial that fails at once gives its first error; one with no total says so; seconds are kept between 30 and 600', async () => {
  const fail = JSON.parse(textOf(await call('experiment_try', { command: 'echo "Traceback (most recent call last):"; echo "  File x"; echo "ModuleNotFoundError: No module named \'torch\'"; exit 1', gpus: 0, seconds: 5 })));
  assert.equal(fail.over, true, JSON.stringify(fail));
  assert.equal(fail.ok, false);
  assert.equal(fail.seconds, 30);
  assert.equal(fail.firstError.text, "ModuleNotFoundError: No module named 'torch'");
  assert.match(fail.said, /It failed after \d+ s: Its command ended with exit code 1\. Where it first went wrong \(line 1 of its log\): ModuleNotFoundError/);
  assert.equal(fail.page, `/experiments/${fail.id}`);
  const quiet = JSON.parse(textOf(await call('experiment_try', { command: 'echo "loss=1"', gpus: 0, seconds: 9999 })));
  assert.equal(quiet.seconds, 600);
  assert.equal(quiet.finished, true);
  assert.ok(quiet.estimateHours < 0.01, String(quiet.estimateHours));
  assert.equal(quiet.ask.hours, 0.1);
  assert.match(quiet.said, /^It ran to its end in \d+ s: the whole run takes about that long, unless your script shortens itself when it sees HYDOR_TRY\./);
  assert.match(experimentTools(ctxOf()).find((x) => x.name === 'experiment_try')!.description, /A trial is the real command in the real folder, so it writes the command’s real output and checkpoint files: point them elsewhere/);
  const long = await job({ command: 'sleep 20', gpus: 0 });
  assert.equal((await http.inject({ method: 'GET', url: `/api/experiments/try/${long.id}` })).statusCode, 400);
  await http.inject({ method: 'POST', url: `/api/experiments/runs/${long.id}/stop`, payload: {} });
  await until(ended(long.id), 30_000);
  const bad = await call('experiment_try', { gpus: 0 });
  assert.ok(bad.isError && /Give the command/.test(bad.text), textOf(bad));
});

test('trials stay out of experiments’ lists, groups and the tool’s list; Run again makes the real run', async () => {
  const list = (url: string) => http.inject({ method: 'GET', url }).then((x) => x.json().runs as RunRecord[]);
  assert.ok(!(await list('/api/experiments/runs?limit=500')).some((r) => r.id === tried.id));
  assert.ok((await list('/api/experiments/runs?tag=try')).some((r) => r.id === tried.id));
  assert.ok(!(await http.inject({ method: 'GET', url: '/api/experiments/groups' })).json().groups.some((g: { name: string }) => g.name.startsWith('Try')));
  const tool = JSON.parse(textOf(await call('experiment_list', { limit: 500 })));
  assert.ok(!tool.runs.some((r: { id: string }) => r.id === tried.id));
  assert.ok(JSON.parse(textOf(await call('experiment_list', { tag: 'try' }))).runs.some((r: { id: string }) => r.id === tried.id));
  const real = await runAgain(deps, tried.id);
  assert.equal(real.env?.HYDOR_TRY, undefined);
  assert.ok(!real.tags?.includes('try'));
  assert.equal(real.name, 'train.sh');
  assert.equal(real.notify, undefined);
  await until(() => getRun(db, real.id)!.status === 'running', 30_000);
  await sleep(300);
  await http.inject({ method: 'POST', url: `/api/experiments/runs/${real.id}/stop`, payload: {} });
  await until(ended(real.id), 30_000);
});

test('the peak is remembered for the same command with other numbers, and not for another', async () => {
  assert.equal(commandSignature('python t.py --lr 3e-4 --batch=32 --seed 1 epochs=3', '/w'), commandSignature('python t.py --lr 1e-3 --batch=64 --seed abc epochs=9', '/w/'));
  assert.notEqual(commandSignature('python t.py --opt adam', '/w'), commandSignature('python t.py --opt sgd', '/w'));
  assert.notEqual(commandSignature('python t.py', '/w'), commandSignature('python t.py', '/other'));
  assert.equal(lastPeak(db, 'sh train.sh --lr 5', tmp), 9.4);
  assert.equal(lastPeak(db, 'sh other.sh --lr 5', tmp), undefined);
  assert.equal(lastPeak(db, 'sh train.sh --lr 5', os.tmpdir()), undefined);
  const got = (await http.inject({ method: 'GET', url: `/api/experiments/last-peak?command=${encodeURIComponent('sh train.sh --lr 0.5')}&cwd=${encodeURIComponent(tmp)}` })).json();
  assert.deepEqual(got, { peakGb: 9.4, askGb: 11 });
  const noted = JSON.parse(textOf(await call('experiment_run', { command: 'sh train.sh --lr 0.5', gpus: 1 })));
  assert.match(noted.note, /it peaked at 9\.4 GB last time/);
  assert.match(noted.note, /gpuMemGb 11/);
  const asked = JSON.parse(textOf(await call('experiment_run', { command: 'sh train.sh --lr 0.5', gpus: 1, gpuMemGb: 8 })));
  assert.equal(asked.note, undefined);
  await until(() => [noted, asked].every((x) => getRun(db, x.id)!.status !== 'starting'), 30_000);
  await sleep(300);
  for (const x of [noted, asked]) await http.inject({ method: 'POST', url: `/api/experiments/runs/${x.id}/stop`, payload: {} });
  await until(() => ended(noted.id)() && ended(asked.id)(), 30_000);
});

// ---- failures ------------------------------------------------------------------------------------------------------

test('out of memory only when it was: caught earlier, a bare 137, and a true one with what the GPU held', async () => {
  const caught = await job({ command: 'echo "CUDA out of memory"; for i in $(seq 1 80); do echo "step $i"; done; echo "Traceback (most recent call last):"; echo "  File x"; echo "KeyError: \'y\'"; exit 1' });
  // Killed as a shell says it, with nothing to say it was memory.
  const bare = await job({ command: 'echo working; echo Killed; exit 137' });
  await until(() => ended(caught.id)() && ended(bare.id)(), 30_000);
  assert.equal(getRun(db, caught.id)!.why, 'Its command ended with exit code 1');
  assert.equal(getRun(db, caught.id)!.firstError!.line, 1);
  assert.equal(getRun(db, bare.id)!.why, 'It was killed (exit code 137): by the system or by someone, perhaps for memory');
  assert.ok(getRunWithEvents(db, bare.id)!.events!.some((e) => e.kind === 'crash'));
  forgetUsage();
  gpuHeld = 12;
  // Each of the two waits for a file made once a reading of it is there: under load a fixed sleep can end before the first.
  const go = (name: string) => path.join(tmp, `go-${name}`);
  const read = (id: string) => () => !!getRun(db, id)?.peak?.gpuMemGb?.length;
  const oom = await job({ command: `echo started; while [ ! -e ${go('oom')} ]; do sleep 0.2; done; echo "torch.OutOfMemoryError: CUDA out of memory. GPU 0 has a total capacity of 23.65 GiB"; exit 1`, gpus: 1, gpuMemGb: 14 });
  await until(read(oom.id), 60_000, 'a reading of the out of memory run');
  fs.writeFileSync(go('oom'), '');
  await until(ended(oom.id), 40_000, 'the out of memory');
  gpuHeld = 9.4;
  const o = getRun(db, oom.id)!;
  assert.deepEqual(o.gpuIds, [1], 'GPU 1 had the room');
  assert.match(o.why!, /^It ran out of memory on GPU 1: it had reached 12 of 24 GB/, o.why);
  assert.deepEqual(o.others!.start, [0.1]);
  assert.equal(o.firstError!.line, 2);
  // One GPU, with another program on it.
  setGpuReader(async () => ({ gpus: [{ index: 0, name: 'Test GPU', memUsed: Math.round(9.1 * MiB), memTotal: 24 * MiB, util: 40 }] }));
  const shared = await job({ command: `echo "step 1"; while [ ! -e ${go('shared')} ]; do sleep 0.2; done; echo "CUDA out of memory"; exit 1`, gpus: 1, gpuMemGb: 2 });
  await until(read(shared.id), 60_000, 'a reading of the shared run');
  fs.writeFileSync(go('shared'), '');
  await until(ended(shared.id), 40_000);
  setGpuReader(two);
  const b = getRun(db, shared.id)!;
  assert.deepEqual(b.gpuIds, [0]);
  assert.equal(b.why, 'It ran out of memory on GPU 0: it had reached 9.4 of 24 GB, and another program held 9.1 GB there when it started');
  assert.deepEqual(b.others, { start: [9.1], end: [9.1] });
});

test('a stall and a NaN are told once without the agent on call: to the session that asked, and one notice a run', async () => {
  notices.length = 0;
  forgetNotices();
  sessions.delivered.length = 0;
  const r = await job({ command: 'echo "step=1 loss=0.5"; echo "step=2 loss=nan"; sleep 4', report: true, onCall: { on: false, stallMinutes: 0.02 }, name: 'sick' }, { session: 'claude:s1' });
  const told = () => sessions.delivered.filter((x) => x.key === 'claude:s1').map((x) => x.text);
  await until(() => told().some((t) => /No new output/.test(t)) && told().some((t) => /NaN/.test(t)), 20_000, 'the session to hear');
  for (const t of told()) {
    assert.ok(experimentNoticeOf(t)?.wrong, t);
    assert.match(t, /^\[Experiments · a run needs a look\]\n/);
    assert.match(t, new RegExp(`“sick” \\(${r.id}\\) is still running: `));
  }
  assert.equal(notices.length, 1, notices.map((n) => n.body).join('|'));
  assert.match(notices[0].body, /loss became NaN at step 2\. It is still running\./);
  await until(ended(r.id), 20_000);
  const all = told().join('\n');
  assert.equal(all.match(/is still running: loss became NaN/g)?.length, 1, all);
  assert.equal(all.match(/is still running: No new output/g)?.length, 1, all);
  await sleep(300);
  assert.ok(told().some((t) => /ended\. Done/.test(t) && !experimentNoticeOf(t)!.wrong), told().join('\n'));
  assert.equal(notices.filter((n) => n.kind === 'waiting').length, 1);
  // Not asked to hear: only the notice; and a NaN that is not a loss tells no one.
  notices.length = 0;
  forgetNotices();
  sessions.delivered.length = 0;
  const other = await job({ command: 'echo "step=1 acc=0.5 loss=0.1"; echo "step=2 acc=nan loss=0.1"; sleep 2', notify: { done: false } }, { session: 'claude:s1' });
  await until(ended(other.id), 20_000);
  await sleep(300);
  assert.equal(notices.length, 0, notices.map((n) => n.body).join('|'));
  assert.equal(sessions.delivered.length, 0);
});

// ---- run ----------------------------------------------------------------------------------------------------------

let failedTests = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (e) {
    failedTests++;
    console.error(`✗ ${name}\n  ${(e as Error).stack ?? e}`);
  }
}
for (const r of listRuns(db, { status: ['running', 'starting', 'queued', 'waiting'], limit: 100 })) await http.inject({ method: 'POST', url: `/api/experiments/runs/${r.id}/stop`, payload: {} });
await stopTmuxServer().catch(() => {});
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failedTests} failed`);
process.exit(failedTests ? 1 : 0);
