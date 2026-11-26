// Checks for Experiments: the statistics against scipy's values; reading metrics from output (key=value, JSON,
// Python's dicts, Keras' lines, progress bars) and keeping them (best by name, series thinned, NaN, divergence);
// choosing GPUs with a stand-in for nvidia-smi and the queue's choices (priority, GPUs held, jobs without a GPU,
// why a job waits); real jobs end to end through tmux (a tiny shell command printing metrics, no GPU): the record
// (commit, branch, patch), the log, metrics, the exit code, what you are told; the agent on call's triggers (NaN,
// out-of-memory text, exit codes, a stall with a short timeout) and its session's brief and limits; stopping; a
// restart finding its runs again; results tables (means, stds, best, Welch, paired and Holm against scipy, LaTeX,
// Markdown, CSV, per-example scores, recompute after a run changes, putting one in a LaTeX file); sweeps
// (expansion, placeholders, the early stop); SLURM (the batch script, sbatch, squeue and sacct with canned output,
// a whole run through a stand-in ssh); another machine's runs; the tools (in a step, in Plan mode, asking the user)
// and experiment_wait; the routes; the batch series route; experiments' titles, descriptions and categories (the
// routes, the helper's writing with a stand-in model, when it happens by itself) and experiment_describe; runs that
// wait for the night, with the clock set by the test (the hours, ordinary runs first, the night's end both ways, the
// morning's notice, clusters and other machines, the tools).
// Build and run with a scratch data folder (no GPU is used):
//   OUTDIR=dist/dev node scripts/build-server.mjs server/experiments/experiments-test.ts
//   DATA_DIR=/tmp/hydor-test-experiments CUDA_VISIBLE_DEVICES= node dist/dev/experiments-test.js
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { betterOf, experimentNoticeOf, tableMarks, type RunRecord } from '../../shared/experiments.ts';
import { keyNumbers } from '../../shared/metric-rank.ts';
import { gather, noticeText, sawEnded, tellEnded } from './notices.ts';
import type { NotifyEvent } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import { openDb } from '../db.ts';
import { CONFIDENTIAL_EXTRA } from '../../shared/confidential.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import type { CreateOpts } from '../sessions.ts';
import { commandWords, captureGit, KEEP_FILE, keepUntracked, localShell, pythonOf } from './capture.ts';
import { endOfSlurm, parseSacct, parseSbatch, parseSqueue, reasonWords, saveCluster, sbatchScript, setSsh, type Ssh } from './clusters.ts';
import { chooseGpus, parseGpus, setGpuReader } from './gpus.ts';
import { describeGroup, enableExperimentDescriptions, firstObject, redactCommand, redactSetting, timing as describeTiming } from './describe.ts';
import { experiments } from './index.ts';
import { stopTmuxServer } from './local.ts';
import { MAX_METRICS, nanText, oomText, parseLine, Tracker } from './metrics.ts';
import { cleanJob, endLine, forgetLive, forgetNotices, onCallBrief, repairEnded, setSettings, submit, tick, timing, useDeps, waitRuns } from './queue.ts';
import { clock, morningAlso, morningWords, NIGHT_AGAIN, NIGHT_BEHIND, nightAt, tonightMore } from './night.ts';
import { addEvent, getInfo, getRun, getRunWithEvents, getTable, insertRun, listRuns, recomputeTable, runFolder, saveInfo, saveSeries, saveTable, seriesOf, updateRun, waitStarted, workOut } from './records.ts';
import { useMachines } from './remote.ts';
import { holm, lgamma, pairedBootstrap, pairedT, tTwoSided, welch } from './stats.ts';
import { earlyStop, expandSweep, fillCommand, paramsOf, placeholders, runFile, shellWords } from './sweeps.ts';
import { insertTable, makeTable, parseScores } from './tables.ts';
import { startSweep } from './api.ts';
import { setSessionExtra } from '../sessionExtra.ts';
import { experimentTools, SPAWN_NOTE } from './tools.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
if (process.env.CUDA_VISIBLE_DEVICES !== '') {
  console.error('Run with CUDA_VISIBLE_DEVICES= (empty): these tests never use a GPU.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-exp-test-'));
const db = openDb(path.join(tmp, 'test.db'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const close = (a: number | null | undefined, b: number, eps = 1e-9, what = '') => assert.ok(a !== null && a !== undefined && Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${what} ${a} ≈ ${b}`);

// ---- the session manager, as much as Experiments uses of it --------------------------------------------------

class Sessions extends EventEmitter {
  created: CreateOpts[] = [];
  delivered: { key: string; text: string }[] = [];
  live = new Map<string, string>();
  mode = 'default';
  answer: string | null = 'accept';
  cards: { title: string; detail?: string }[] = [];
  summary(key: string) {
    const queue = this.queued?.get(key);
    return this.live.has(key) ? ({ key, title: key, queue, live: { status: this.live.get(key) } } as any) : key.startsWith('claude:') ? ({ key, title: key, queue, live: null } as any) : null;
  }
  async create(o: CreateOpts) {
    this.created.push(o);
    const key = `claude:oncall${this.created.length}`;
    this.live.set(key, 'working');
    return key;
  }
  /** What waits for a session at work (one `live` says is working), as the app's queue keeps it. */
  queued = new Map<string, { id: string; text: string; at: number }[]>();
  private n = 0;
  async deliverOrQueue(key: string, text: string) {
    if (this.live.get(key) === 'working') this.queued.set(key, [...(this.queued.get(key) ?? []), { id: `q${++this.n}`, text, at: Date.now() }]);
    else this.delivered.push({ key, text });
  }
  editQueued(key: string, id: string, o: { text: string }) {
    const m = this.queued.get(key)?.find((x) => x.id === id);
    if (!m) throw new HttpError(404, 'That message already went out');
    m.text = o.text;
  }
  dropQueued(key: string, id: string) {
    this.queued.set(key, (this.queued.get(key) ?? []).filter((x) => x.id !== id));
  }
  adapterByRun(_runId: string) {
    return {
      state: { mode: this.mode },
      ask: async (card: { title: string; detail?: string }) => {
        this.cards.push(card);
        return this.answer ? { decision: this.answer } : null;
      },
    };
  }
}
const sessions = new Sessions();
const notices: NotifyEvent[] = [];
sessions.on('notify', (n: NotifyEvent) => notices.push(n));
const told: unknown[] = [];

const http = Fastify();
http.setErrorHandler((err: Error, _req, reply) => {
  reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message });
});
const deps = { app: http, db, sessions: sessions as any, scheduler: null as any, models: null as any, broadcast: (e: unknown) => told.push(e), toSubscribers: () => {}, publicBase: () => 'http://test.local' } as Deps;
experiments.routes!(deps);
useDeps(deps);
timing.cluster = 300;
timing.remote = 300;
gather.ms = 100;
await http.ready();

/** Steps the queue until `fn` holds (or fails after `ms`). */
async function until(fn: () => boolean, ms = 20_000, what = 'it') {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await tick();
    if (fn()) return;
    await sleep(150);
  }
  assert.fail(`timed out waiting for ${what}`);
}
const ended = (id: string) => () => ['done', 'failed', 'stopped', 'lost'].includes(getRun(db, id)!.status);

// A folder with a git repository: one commit, then a change not committed and a file git does not track.
const repo = path.join(tmp, 'repo');
fs.mkdirSync(repo);
const git = (...a: string[]) => execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=T', ...a], { cwd: repo, stdio: 'pipe' }).toString();
git('init', '-q', '-b', 'main');
fs.writeFileSync(path.join(repo, 'train.sh'), 'echo training\n');
git('add', '.');
git('commit', '-q', '-m', 'first');
const head = git('rev-parse', 'HEAD').trim();
fs.writeFileSync(path.join(repo, 'train.sh'), 'echo training harder\n');
fs.writeFileSync(path.join(repo, 'notes.txt'), 'not tracked\n');

// No GPU here: a stand-in nvidia-smi with four made-up ones.
let gpus = [
  { index: 0, name: 'Test GPU', memUsed: 23_000, memTotal: 24_000, util: 90 },
  { index: 1, name: 'Test GPU', memUsed: 4_000, memTotal: 24_000, util: 10 },
  { index: 2, name: 'Test GPU', memUsed: 500, memTotal: 24_000, util: 0 },
  { index: 3, name: 'Test GPU', memUsed: 12_000, memTotal: 24_000, util: 50 },
];
setGpuReader(async () => ({ gpus }));

// ---- statistics ----------------------------------------------------------------------------------------------

test('the t distribution and the tests give scipy’s values', () => {
  close(lgamma(0.5), 0.5723649429247, 1e-12, 'lgamma(0.5)');
  close(lgamma(7.3), 7.147892523022248, 1e-12, 'lgamma(7.3)');
  close(tTwoSided(2.0, 3), 0.13932596855884305, 1e-10);
  close(tTwoSided(1.0, 1), 0.5, 1e-10);
  close(tTwoSided(0.5, 10), 0.627893605742973, 1e-10);
  close(tTwoSided(3.5, 2.5), 0.052345546960320344, 1e-9);
  close(tTwoSided(10, 4), 0.000562003622715991, 1e-9);
  close(tTwoSided(0, 5), 1, 1e-12);
  close(welch([83.1, 83.6, 83.4], [81.2, 80.9, 81.5]).p, 0.0007646786864562137, 1e-8, 'welch');
  close(welch([0.53, 0.541, 0.528, 0.55], [0.512, 0.498, 0.505, 0.52]).p, 0.006492617618813581, 1e-8, 'welch 2');
  close(welch([0.53, 0.541, 0.528, 0.55], [0.512, 0.498, 0.505, 0.52]).df, 5.959394471227101, 1e-9, 'welch df');
  close(pairedT([0.53, 0.541, 0.528, 0.55], [0.512, 0.498, 0.505, 0.52]).p, 0.013425015975632408, 1e-8, 'paired');
  close(pairedT([1.5, 2.1, 3.9, 4.2, 5.8], [1, 2, 3, 4, 5]).p, 0.03410942316740959, 1e-8, 'paired 2');
  assert.equal(welch([1], [2, 3]).p, null, 'one value is too few');
  assert.equal(welch([1, 1, 1], [2, 2, 2]).p, 0, 'no spread, different means');
  assert.deepEqual(
    holm([0.01, 0.04, 0.03, 0.005]).map((p) => Math.round(p! * 1e6) / 1e6),
    [0.03, 0.06, 0.06, 0.02],
  );
  assert.deepEqual(holm([0.2, null, 0.01]), [0.2, null, 0.02]);
  const ours = [0.55, 0.62, 0.48, 0.71, 0.6, 0.7, 0.44, 0.42];
  const base = [0.5, 0.6, 0.4, 0.7, 0.55, 0.65, 0.45, 0.35];
  close(pairedT(ours, base).p, 0.007812808075189104, 1e-8, 'paired over examples');
  const b1 = pairedBootstrap(ours, base);
  assert.ok(b1.p! < 0.05 && b1.p! > 0, `bootstrap p ${b1.p}`);
  assert.equal(pairedBootstrap(ours, base).p, b1.p, 'the bootstrap is seeded: the same p each time');
});

// ---- metrics ---------------------------------------------------------------------------------------------------

test('metrics are read from key=value, JSON, Python dicts, Keras and progress bars', () => {
  assert.deepEqual(parseLine('step=100 loss=0.42 acc=0.91'), { values: { loss: 0.42, acc: 0.91 }, step: 100 });
  assert.deepEqual(parseLine('{"step": 200, "loss": 0.3, "eval": {"f1": 0.8}}'), { values: { loss: 0.3, 'eval/f1': 0.8 }, step: 200 });
  assert.deepEqual(parseLine("{'loss': 0.6931, 'learning_rate': 5e-05, 'epoch': 0.01}"), { values: { loss: 0.6931, learning_rate: 5e-5 }, step: 0.01 });
  assert.deepEqual(parseLine('Epoch 1/10 - 3s - loss: 0.4123 - accuracy: 0.8734 - val_loss: 0.5'), { values: { loss: 0.4123, accuracy: 0.8734, val_loss: 0.5 }, step: 1 });
  assert.deepEqual(parseLine('Epoch 0:  10%|█  | 1/10 [00:01<00:09]\rEpoch 0: 20%|██ | 2/10 [00:02<00:08, loss=0.5, v_num=0]'), { values: { loss: 0.5 }, step: 0 });
  assert.equal(parseLine('INFO: 3 files found'), null, 'one "name: number" is not a metric line');
  assert.equal(parseLine('Downloading model.bin'), null);
  assert.deepEqual(parseLine('train/loss=nan'), { values: { 'train/loss': NaN } });
  assert.deepEqual(parseLine("{'loss': tensor(0.25), 'ok': True}"), { values: { loss: 0.25 } });
  assert.ok(nanText('Loss is nan, stopping training'));
  assert.ok(nanText('grad_norm: inf'));
  assert.ok(!nanText('Filled 3 NaN values with the mean'), 'NaN in data cleaning is not a NaN loss');
  assert.ok(oomText('torch.OutOfMemoryError: CUDA out of memory. Tried to allocate 2.00 GiB'));
  assert.ok(oomText('Killed'));
  assert.ok(!oomText('Killed 3 stale workers in the pool'));
  assert.equal(betterOf('val_loss'), 'min');
  assert.equal(betterOf('test_wer'), 'min');
  assert.equal(betterOf('eval_ppl'), 'min');
  assert.equal(betterOf('accuracy'), 'max');
  assert.equal(betterOf('bleu', { bleu: 'min' }), 'min');
});

test('a run’s metrics: best by name, steps going forward, series thinned, NaN and divergence noticed', () => {
  const t = new Tracker();
  t.add({ values: { loss: 1.0, acc: 0.5 }, step: 1 });
  t.add({ values: { loss: 0.5, acc: 0.7 }, step: 2 });
  t.add({ values: { loss: 0.7, acc: 0.6 }, step: 3 });
  assert.deepEqual(t.snapshot(), { last: { loss: 0.7, acc: 0.6 }, best: { loss: 0.5, acc: 0.7 }, step: 3, repeated: ['loss', 'acc'] });
  // A step counted per epoch starts again from 0: the series goes on.
  t.add({ values: { loss: 0.4 }, step: 1 });
  assert.deepEqual(t.series.loss.at(-1), [4, 0.4]);
  for (let i = 0; i < 1000; i++) t.add({ values: { lr: i } });
  assert.ok(t.series.lr.length <= 600 && t.series.lr.at(-1)![1] === 999, `thinned to ${t.series.lr.length}, the last kept`);
  const d = new Tracker();
  for (let i = 0; i < 10; i++) d.add({ values: { loss: 1 - i * 0.05 }, step: i });
  for (let i = 0; i < 5; i++) d.add({ values: { loss: 5 }, step: 10 + i });
  assert.deepEqual(d.diverged, ['loss']);
  d.add({ values: { loss: NaN }, step: 20 });
  assert.deepEqual(d.nan, ['loss']);
  assert.equal(d.best.loss, 0.55, 'NaN never becomes the best');
});

test('metrics read more than once take the place of the latest ones read once, when the 100 are full', () => {
  const ones: Record<string, number> = {};
  for (let i = 0; i < 120; i++) ones[`k${i}`] = i;
  const t = new Tracker();
  t.add({ values: ones });
  assert.equal(Object.keys(t.last).length, 100);
  assert.ok(!('k100' in t.last), 'the first 100 one-off numbers are kept');
  for (let i = 1; i <= 30; i++) t.add({ values: { loss: 5 - i * 0.1, lr: 0.001 / i }, step: i * 10 });
  const kept = Object.keys(t.last);
  assert.equal(kept.length, 100);
  assert.ok(t.series.loss.length >= 2 && t.series.lr.length >= 2, 'both are charted');
  assert.equal(t.series.loss.length, 30, 'with the reading that was left out first too');
  assert.deepEqual(t.series.loss[0], [10, 4.9]);
  close(t.best.loss, 2);
  assert.deepEqual(t.snapshot().repeated, ['loss', 'lr']);
  // The latest one-offs gave their places: k99 to loss, k98 to lr.
  assert.ok(!('k99' in t.last) && !('k98' in t.last) && !('k99' in t.series), 'the evicted ones are gone');
  assert.ok('k0' in t.last && 'k97' in t.last, 'the first ones stay');
  // Read once and the cap full: left out, as before.
  const u = new Tracker();
  u.add({ values: ones });
  u.add({ values: { a1: 1, a2: 2, a3: 3, a4: 4, a5: 5 }, step: 1 });
  assert.equal(Object.keys(u.last).length, 100);
  assert.ok(!('a1' in u.last), 'one-off numbers after the first 100 are not kept');
  assert.deepEqual(u.snapshot().repeated, []);
  // What is kept and repeated survives a restart; the plan comes back from its metric.
  const back = new Tracker(undefined, { metrics: t.snapshot(), series: t.series });
  assert.deepEqual(back.snapshot().repeated, ['loss', 'lr']);
  back.add({ values: { loss: 1 }, step: 400 });
  assert.equal(back.series.loss.length, 31);
  assert.equal(MAX_METRICS, 100);
});

test('progress: a training bar, "step 120/1000", a plan in the output; a new phase forgets it', () => {
  assert.deepEqual(parseLine(' 45%|████▌     | 4500/10000 [12:34<15:20,  5.96it/s]'), { values: {}, progress: { done: 4500, total: 10000 } });
  assert.deepEqual(parseLine('Training:  10%|█  | 100/1000 [00:10<01:30]'), { values: {}, progress: { done: 100, total: 1000 } });
  assert.equal(parseLine('Loading checkpoint shards: 100%|██| 4/4 [00:02<00:00'), null);
  assert.equal(parseLine('Epoch 0:  45%|████▌| 450/1000 ['), null);
  assert.equal(parseLine('Training:  10%|█  | 5/8 [00:10<01:30]'), null, 'a short bar is not the training');
  assert.deepEqual(parseLine('step 120/1000 loss=0.5'), { values: { loss: 0.5 }, step: 120, progress: { done: 120, total: 1000 } });
  assert.deepEqual(parseLine('epoch 3/10 loss=0.5'), { values: { loss: 0.5 }, step: 3 });
  assert.deepEqual(parseLine('{"plan_steps": 10878}'), { values: { plan_steps: 10878 }, plan: 10878 });
  const t = new Tracker();
  assert.ok(t.add({ values: { plan_steps: 10878 }, plan: 10878 }, 1000));
  assert.equal(t.snapshot().progress, undefined, 'no step yet');
  assert.ok(t.add({ values: { train_loss: 4.1 }, step: 5900 }, 2000));
  assert.deepEqual(t.snapshot().progress, { done: 5900, total: 10878, at: 2000 });
  assert.deepEqual(new Tracker(undefined, { metrics: t.snapshot() }).plan, 10878, 'the plan comes back with the record');
  assert.ok(t.add({ values: { loss: 1 }, step: 10 }, 3000));
  assert.equal(t.snapshot().progress, undefined, 'a step going back starts a phase of unknown length');
  assert.equal(t.plan, undefined);
  t.add({ values: {}, progress: { done: 100, total: 1000 } }, 4000);
  assert.deepEqual(t.snapshot().progress, { done: 100, total: 1000, at: 4000 });
  t.add({ values: {}, progress: { done: 1000, total: 1000 } }, 5000);
  assert.equal(t.snapshot().progress, undefined, 'a phase that is done shows none');
});

test('saving a series drops the rows of metrics that are no longer kept', () => {
  insertRun(db, { id: 'rser0001', spec: { command: 'true', cwd: tmp }, status: 'done' });
  saveSeries(db, 'rser0001', { a: [[1, 1]], b: [[1, 2]] });
  assert.deepEqual(Object.keys(seriesOf(db, 'rser0001')).sort(), ['a', 'b']);
  saveSeries(db, 'rser0001', { a: [[1, 1], [2, 3]] });
  assert.deepEqual(seriesOf(db, 'rser0001'), { a: [[1, 1], [2, 3]] });
});

// ---- GPUs and the queue's choices ---------------------------------------------------------------------------------

test('GPUs are chosen freest first, never one another run holds, and a wait says why', () => {
  assert.deepEqual(parseGpus('0, NVIDIA RTX 4090, 1200, 24564, 3\n1, NVIDIA RTX 4090, 20000, 24564, 99\n'), [
    { index: 0, name: 'NVIDIA RTX 4090', memUsed: 1200, memTotal: 24564, util: 3 },
    { index: 1, name: 'NVIDIA RTX 4090', memUsed: 20000, memTotal: 24564, util: 99 },
  ]);
  assert.deepEqual(chooseGpus(gpus, 1, 15, new Set()), { ids: [2] });
  assert.deepEqual(chooseGpus(gpus, 2, 15, new Set()), { ids: [2, 1] });
  assert.deepEqual(chooseGpus(gpus, 1, undefined, new Set()), { ids: [2] }, 'with no memory given, a GPU almost all free');
  const w = chooseGpus(gpus, 1, 30, new Set([2]));
  assert.ok('why' in w && w.why === 'Waiting for 1 GPU with 30 GB free: the most free now is 19.5 GB, on GPU 1; your other runs hold GPU 2', 'why' in w ? w.why : '');
  const w2 = chooseGpus(gpus, 3, 15, new Set());
  assert.ok('why' in w2 && w2.why.startsWith('Waiting for 3 GPUs with 15 GB free each: 2 have that (GPUs 2 and 1) now'), 'why' in w2 ? w2.why : '');
});

test('the queue: GPU jobs take free GPUs by priority, the rest wait with why; jobs without a GPU wait for a place', async () => {
  // Long jobs (they sleep), stopped at the end.
  const job = (o: Record<string, unknown>) => cleanJob(db, { command: 'sleep 30', cwd: tmp, ...o }).then((s) => submit(deps, s));
  const low = await job({ name: 'low', gpus: 1, gpuMemGb: 20 });
  const high = await job({ name: 'high', gpus: 1, gpuMemGb: 20, priority: 5 });
  const cpu: RunRecord[] = [];
  for (let i = 0; i < 4; i++) cpu.push(await job({ name: `cpu${i}`, gpus: 0 }));
  await until(() => getRun(db, high.id)!.status === 'running' && getRun(db, low.id)!.status === 'waiting', 20_000, 'the queue to choose');
  assert.deepEqual(getRun(db, high.id)!.gpuIds, [2], 'the higher priority took the free GPU');
  assert.equal(getRun(db, low.id)!.why, 'Waiting for 1 GPU with 20 GB free: the most free now is 19.5 GB, on GPU 1; your other runs hold GPU 2');
  const slots = (await http.inject({ method: 'GET', url: '/api/experiments/settings' })).json().cpuSlots;
  const going = cpu.filter((r) => ['starting', 'running'].includes(getRun(db, r.id)!.status));
  assert.equal(going.length, Math.min(slots, 4), `${slots} jobs without a GPU at once`);
  if (slots < 4) assert.match(getRun(db, cpu[3].id)!.why!, /Waiting for one of your runs without a GPU to end/);
  // A GPU frees up: the waiting job takes it.
  gpus = gpus.map((g) => (g.index === 1 ? { ...g, memUsed: 100 } : g));
  await until(() => getRun(db, low.id)!.status === 'running', 20_000, 'the low job to start');
  assert.deepEqual(getRun(db, low.id)!.gpuIds, [1]);
  // GPUs it can never have: it fails at once, in words.
  const big = await job({ name: 'big', gpus: 9 });
  await until(ended(big.id), 10_000, 'the big job to fail');
  assert.equal(getRun(db, big.id)!.why, 'It asks for 9 GPUs, and this computer has 4');
  const q = (await http.inject({ method: 'GET', url: '/api/experiments/queue' })).json();
  assert.equal(q.gpus.find((g: { index: number }) => g.index === 2).run, high.id, 'the queue says which run holds a GPU');
  for (const r of [low, high, ...cpu]) await http.inject({ method: 'POST', url: `/api/experiments/runs/${r.id}/stop`, payload: {} });
  await until(() => [low, high, ...cpu].every((r) => ended(r.id)()), 40_000, 'them all to stop');
  assert.ok([low, high, ...cpu].every((r) => getRun(db, r.id)!.status === 'stopped'));
  assert.equal(getRun(db, high.id)!.why, 'Stopped by you');
  gpus = gpus.map((g) => (g.index === 1 ? { ...g, memUsed: 4000 } : g));
});

// ---- a real job, end to end ---------------------------------------------------------------------------------------

test('a job runs in tmux and is recorded: commit, branch, patch, settings, seed, log, metrics, exit code', async () => {
  notices.length = 0;
  forgetNotices();
  const spec = await cleanJob(db, {
    command: 'sh train.sh --lr 0.01; echo "step=1 loss=0.9 acc=0.5"; echo \'{"step": 2, "loss": 0.4, "acc": 0.8}\'; echo "hello from $HYDOR_RUN on [$CUDA_VISIBLE_DEVICES]"',
    cwd: repo,
    gpus: 0,
    seed: 7,
    group: 'demo',
    tags: ['smoke'],
  });
  assert.deepEqual(spec.params, { lr: 0.01 }, 'settings read from the command');
  const r = await submit(deps, spec, { startedBy: { session: 'claude:abc' } });
  await until(ended(r.id), 20_000, 'the job to end');
  const x = getRunWithEvents(db, r.id)!;
  assert.equal(x.status, 'done', x.why);
  assert.equal(x.exitCode, 0);
  assert.equal(x.commit, head);
  assert.equal(x.branch, 'main');
  assert.equal(x.dirty, true);
  assert.equal(x.untracked, 1);
  assert.match(fs.readFileSync(x.patchPath!, 'utf8'), /\+echo training harder/);
  assert.equal(x.seed, 7);
  assert.deepEqual(x.metrics, { last: { loss: 0.4, acc: 0.8 }, best: { loss: 0.4, acc: 0.8 }, step: 2, repeated: ['loss', 'acc'] });
  const log = fs.readFileSync(path.join(runFolder(r.id), 'log.txt'), 'utf8');
  assert.match(log, new RegExp(`hello from ${r.id} on \\[\\]`), 'its id in the environment, and no GPU for a job without one');
  assert.ok(fs.existsSync(path.join(runFolder(r.id), 'metrics.json')));
  assert.deepEqual(
    x.events!.map((e) => e.kind),
    ['queued', 'started', 'done'],
  );
  assert.equal(notices.length, 1);
  assert.match(notices[0].body, /^Done in under a minute: loss 0\.4, acc 0\.8$/);
  assert.equal(notices[0].url, `/experiments/${r.id}`);
  // Its environment comes a moment later.
  await until(() => !!getRun(db, r.id)!.environment?.host, 10_000, 'the environment');
  const view = (await http.inject({ method: 'GET', url: `/api/experiments/runs/${r.id}` })).json();
  assert.equal(view.run.id, r.id);
  assert.deepEqual(view.series.loss, [
    [1, 0.9],
    [2, 0.4],
  ]);
  assert.match(view.log, /hello from/);
  const after = (await http.inject({ method: 'GET', url: `/api/experiments/runs/${r.id}/log?from=${view.logSize - 10}` })).json();
  assert.equal(after.text.length, 10);
  assert.match((await http.inject({ method: 'GET', url: `/api/experiments/runs/${r.id}/patch` })).json().patch, /training harder/);
  assert.equal(listRuns(db, { tag: 'smoke' })[0].id, r.id);
  assert.equal(
    listRuns(db, { cwd: tmp }).some((y) => y.id === r.id),
    true,
    'a run under a folder is listed for it',
  );
});

test('a crash, out-of-memory text and NaN are noticed; the agent on call gets a brief, one per run at a time', async () => {
  notices.length = 0;
  forgetNotices();
  sessions.created.length = 0;
  const crash = await submit(deps, await cleanJob(db, { command: 'echo "step=5 loss=0.7"; echo "Traceback: boom" >&2; exit 3', cwd: tmp, gpus: 0, name: 'crasher', onCall: { on: true, act: 'agent', rules: 'Only read; never run anything.' } }));
  await until(ended(crash.id), 20_000, 'the crash');
  const c = getRunWithEvents(db, crash.id)!;
  assert.equal(c.status, 'failed');
  assert.equal(c.why, 'Its command ended with exit code 3');
  assert.deepEqual(
    c.events!.map((e) => e.kind),
    ['queued', 'started', 'failed', 'crash', 'agent'],
  );
  assert.equal(sessions.created.length, 1);
  const brief = sessions.created[0].prompt!;
  assert.match(brief, /crashed/);
  assert.match(brief, /Traceback: boom/, 'the end of its log');
  assert.match(brief, /Only read; never run anything\./, 'the user’s rules');
  assert.equal(sessions.created[0].cwd, tmp);
  assert.equal(sessions.created[0].title, 'On call: crasher · crashed');
  assert.equal(c.events!.find((e) => e.kind === 'agent')!.session, 'claude:oncall1');
  assert.equal(notices.length, 1, 'one notice: the failure, with the agent looking into it');
  assert.match(notices[0].body, /exit code 3\. An agent is looking into it\./);
  // Out of memory in the text, then NaN, in one run: the agent is still at work on the first.
  const oom = await submit(deps, await cleanJob(db, { command: 'echo "torch.OutOfMemoryError: CUDA out of memory"; echo "loss=nan"; sleep 1; exit 1', cwd: tmp, gpus: 0, onCall: { on: true, act: 'agent' } }));
  await until(ended(oom.id), 20_000, 'the out-of-memory run');
  const o = getRunWithEvents(db, oom.id)!;
  assert.equal(o.why, 'It ran out of memory');
  assert.ok(o.events!.some((e) => e.kind === 'oom') && o.events!.some((e) => e.kind === 'nan'), o.events!.map((e) => e.kind).join(','));
  assert.equal(o.events!.filter((e) => e.kind === 'agent').length, 1, 'one agent per run at a time');
  assert.ok(o.events!.some((e) => e.kind === 'note' && /still at work/.test(e.text)));
  // A third agent this hour would be one too many past three: they tell you instead.
  addEvent(db, 'rother', { kind: 'agent', text: 'An agent', session: 'claude:x' });
  const third = await submit(deps, await cleanJob(db, { command: 'exit 2', cwd: tmp, gpus: 0, onCall: { on: true, act: 'agent' } }));
  await until(ended(third.id), 20_000, 'the third crash');
  assert.ok(getRunWithEvents(db, third.id)!.events!.some((e) => e.kind === 'note' && /went on call in the last hour/.test(e.text)));
  // Without the agent on call, the end is told as the job asks: a failure, here not at all.
  notices.length = 0;
  forgetNotices();
  const quiet = await submit(deps, await cleanJob(db, { command: 'exit 1', cwd: tmp, gpus: 0, notify: { failed: false } }));
  await until(ended(quiet.id), 20_000, 'the quiet failure');
  assert.equal(notices.length, 0);
});

test('a stall (no output for a while) is noticed; a run stopped is stopped whole', async () => {
  notices.length = 0;
  forgetNotices();
  const spec = await cleanJob(db, { command: 'echo started; sleep 60', cwd: tmp, gpus: 0, onCall: { on: true, act: 'tell', stallMinutes: 0.02 } });
  const r = await submit(deps, spec);
  await until(() => getRunWithEvents(db, r.id)!.events!.some((e) => e.kind === 'stall'), 20_000, 'the stall');
  assert.ok(notices.some((n) => n.kind === 'waiting' && /No new output for/.test(n.body)));
  const stopped = (await http.inject({ method: 'POST', url: `/api/experiments/runs/${r.id}/stop`, payload: {} })).json().run;
  assert.equal(stopped.stopping, 'Stopped by you');
  await until(ended(r.id), 30_000, 'the stop');
  const x = getRun(db, r.id)!;
  assert.equal(x.status, 'stopped');
  assert.ok(x.exitCode !== 0, `exit code ${x.exitCode}`);
  assert.equal(x.stopping, undefined);
});

test('after a restart: a run still going is followed again, one whose process vanished is lost', async () => {
  const r = await submit(deps, await cleanJob(db, { command: 'sleep 2; echo "loss=0.25"', cwd: tmp, gpus: 0 }));
  await until(() => getRun(db, r.id)!.status === 'running', 20_000, 'it to run');
  forgetLive();
  await until(ended(r.id), 20_000, 'it to end after the "restart"');
  assert.equal(getRun(db, r.id)!.status, 'done');
  assert.equal(getRun(db, r.id)!.metrics?.last.loss, 0.25);
  // A run that says it runs, with no process and no exit code.
  const id = 'rgone0001';
  insertRun(db, { id, spec: { command: 'true', cwd: tmp, gpus: 0 }, status: 'running', info: { folder: runFolder(id) } });
  fs.mkdirSync(runFolder(id), { recursive: true });
  fs.writeFileSync(path.join(runFolder(id), 'pid'), '999999');
  await until(ended(id), 20_000, 'it to be lost');
  const x = getRunWithEvents(db, id)!;
  assert.equal(x.status, 'lost');
  assert.match(x.why!, /went missing/);
  assert.ok(
    x.events!.some((e) => e.kind === 'crash'),
    'a dead process is one the agent on call watches for',
  );
});

// ---- the record's parts ---------------------------------------------------------------------------------------------

test('the record: git’s state, a cut patch, the Python a command uses, settings from a command', async () => {
  const g = await captureGit(localShell(repo, process.env as Record<string, string>));
  assert.equal(g.commit, head);
  assert.equal(g.dirty, true);
  assert.equal((await captureGit(localShell(tmp, process.env as Record<string, string>))).commit, undefined, 'outside a repository: nothing');
  assert.equal(pythonOf('CUDA_VISIBLE_DEVICES=1 .venv/bin/python train.py', [], tmp), '.venv/bin/python');
  assert.equal(pythonOf('python3.11 -m torch.distributed.run x.py', [], tmp), 'python3.11');
  const bin = path.join(tmp, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'torchrun'), '#!/opt/env/bin/python3.12\nimport sys\n', { mode: 0o755 });
  assert.equal(pythonOf('torchrun --nproc_per_node 2 train.py', [bin], tmp), '/opt/env/bin/python3.12');
  assert.equal(pythonOf('torchrun train.py', null, tmp), null, 'elsewhere, only a python word says it');
  assert.deepEqual(paramsOf('CUDA_VISIBLE_DEVICES=0 python train.py --lr 3e-4 --epochs=10 --fp16 --name "my run" model.depth=12 --warmup -1'), { lr: 0.0003, epochs: 10, fp16: true, name: 'my run', 'model.depth': 12, warmup: -1 });
  assert.deepEqual(shellWords("python a.py --x 'a b' && echo no"), ['python', 'a.py', '--x', 'a b']);
});

// ---- results tables ---------------------------------------------------------------------------------------------------

/** A finished run with metrics, as the queue would leave it. */
function doneRun(id: string, group: string, seed: number, last: Record<string, number>, extra: Partial<RunRecord> = {}) {
  insertRun(db, { id, spec: { command: 'true', cwd: tmp, group, seed, params: { seed, ...(extra.params ?? {}) } }, status: 'done', info: { folder: runFolder(id), ...(extra.scores ? { scores: true } : {}) } });
  updateRun(db, id, { metrics: { last, best: last }, endedAt: Date.now() });
}
const A = [81.2, 80.9, 81.5];
const B = [83.1, 83.6, 83.4];
const C = [81.0, 81.6, 81.3];
const AL = [0.52, 0.55, 0.5];
const BL = [0.45, 0.44, 0.47];
const CL = [0.53, 0.51, 0.52];
for (let i = 0; i < 3; i++) {
  doneRun(`ta${i}aaaa`, 'base', i + 1, { acc: A[i], loss: AL[i] });
  doneRun(`tb${i}bbbb`, 'ours', i + 1, { acc: B[i], loss: BL[i] });
  doneRun(`tc${i}cccc`, 'other', i + 1, { acc: C[i], loss: CL[i] });
}
const ids = ['ta0aaaa', 'ta1aaaa', 'ta2aaaa', 'tb0bbbb', 'tb1bbbb', 'tb2bbbb', 'tc0cccc', 'tc1cccc', 'tc2cccc'];
const cols = [
  { metric: 'acc', better: 'max' as const, label: 'Accuracy' },
  { metric: 'loss', better: 'min' as const },
];

test('a results table: mean ± std, the best in bold, Welch with Holm against scipy, LaTeX, Markdown, CSV', () => {
  const t = workOut(db, { runs: ids, columns: cols, test: 'welch', baseline: 'base', caption: 'Results on the dev set.' }, 'tabc1234');
  assert.deepEqual(
    t.rows.map((r) => r.key),
    ['base', 'ours', 'other'],
  );
  const [base, ours, other] = t.rows;
  close(base.cells[0].mean, 81.2, 1e-12);
  close(base.cells[0].std, 0.3, 1e-9);
  close(ours.cells[0].mean, 83.36666666666666, 1e-12);
  close(ours.cells[0].std, 0.2516611478423591, 1e-9);
  assert.equal(ours.cells[0].best, true);
  assert.equal(ours.cells[1].best, true, 'lower loss is better');
  assert.equal(base.cells[0].best, undefined);
  close(ours.cells[0].p, 0.0007646786864562137, 1e-8, 'p acc');
  close(ours.cells[0].pAdj, 2 * 0.0007646786864562137, 1e-8, 'Holm acc');
  close(other.cells[0].pAdj, 0.7040000000000132, 1e-8, 'Holm acc other');
  close(ours.cells[1].pAdj, 2 * 0.021576010269378092, 1e-8, 'Holm loss');
  assert.equal(ours.cells[0].significant, true);
  assert.equal(ours.cells[1].significant, true);
  assert.equal(other.cells[0].significant, false);
  assert.equal(base.cells[0].p, undefined, 'the baseline is not tested against itself');
  assert.deepEqual(t.tests, ["Welch's t-test over 3 seeds", "Welch's t-test over 3 seeds"]);
  assert.match(t.latex, /\\begin\{tabular\}\{lcc\}/);
  assert.ok(t.latex.includes('% hydor:table tabc1234\n\\begin{tabular}'), 'the marker just above the tabular');
  assert.ok(t.latex.includes('\\toprule') && t.latex.includes('\\midrule') && t.latex.includes('\\bottomrule'));
  assert.ok(t.latex.includes('ours & \\textbf{83.37} $\\pm$ 0.25$^\\dagger$ & \\textbf{0.453} $\\pm$ 0.015$^\\dagger$ \\\\'), t.latex);
  assert.ok(t.latex.includes('Method & Accuracy $\\uparrow$ & loss $\\downarrow$ \\\\'));
  assert.match(t.latex, /\\caption\{Results on the dev set\. Mean \$\\pm\$ standard deviation over 3 seeds; the best in bold\. \$\^\\dagger\$ Better than base at \$p < 0\.05\$ \(Welch's \$t\$-test over 3 seeds, Holm-corrected\)\.\}/);
  assert.ok(t.markdown.includes('| ours | **83.37** ± 0.25 † | **0.453** ± 0.015 † |'), t.markdown);
  assert.ok(t.markdown.endsWith("† Better than base at p < 0.05 (Welch's t-test over 3 seeds, Holm-corrected)."));
  const csv = t.csv.split('\n');
  assert.equal(csv[0], 'row,label,acc_mean,acc_std,acc_n,acc_p,acc_p_holm,acc_verdict,loss_mean,loss_std,loss_n,loss_p,loss_p_holm,loss_verdict');
  assert.deepEqual([ours.cells[0].verdict, other.cells[0].verdict, base.cells[0].verdict], ['better', 'same', undefined]);
  assert.ok(csv[2].startsWith('ours,ours,83.3666666666666'), csv[2]);
  assert.deepEqual(tableMarks(`a\n% hydor:table tabc1234\nb\n  % hydor:table tx9\n`), ['tabc1234']);
});

test('worse than the baseline is marked apart from no difference, and the caption says the mark once', () => {
  const mk = (id: string, group: string, seed: number, acc: number, loss: number) => ({ id, status: 'done', createdAt: seed, command: 'x', cwd: tmp, group, seed, metrics: { last: { acc, loss } } }) as RunRecord;
  const runs = [80, 81, 82].flatMap((v, i) => [mk(`wb${i}`, 'base', i, v, 1 + i / 10), mk(`wu${i}`, 'up', i, v + 5 + i / 10, 0.2 + i / 20), mk(`wd${i}`, 'down', i, v - 5 - i / 10, 3 + i / 9), mk(`we${i}`, 'even', i, v + (i - 1) / 2, 1 + (2 - i) / 10)]);
  const t = makeTable({ runs: runs.map((r) => r.id), columns: [{ metric: 'acc', better: 'max' }, { metric: 'loss', better: 'min' }], test: 'welch', correction: 'none', baseline: 'base', caption: 'Accuracy and loss, mean ± std over seeds 1-3.' }, runs, { id: 'tworse01', scores: () => null });
  const wide = makeTable({ runs: runs.map((r) => r.id), columns: [{ metric: 'acc', better: 'max' }], test: 'paired', baseline: 'base', correction: 'none' }, runs, { id: 'tworse02', scores: () => null });
  assert.deepEqual(['up', 'down', 'even'].map((k) => wide.rows.find((r) => r.key === k)!.cells[0].verdict), ['better', 'worse', 'same']);
  assert.ok(wide.latex.includes('$^\\dagger$ \\\\') && wide.latex.includes('$^\\ddagger$ \\\\'), wide.latex);
  assert.match(wide.latex, /\$\^\\ddagger\$ Worse than base, by the same test\./);
  assert.match(wide.markdown, /\| down \|[^\n]* ‡ \|/);
  assert.ok(wide.footnote!.endsWith('‡ Worse than base, by the same test.'));
  assert.match(wide.csv, /\ndown,down,[^\n]*,worse\n/);
  assert.match(wide.csv, /\nup,up,[^\n]*,better\n/);
  assert.match(wide.csv, /\neven,even,[^\n]*,same\n/);
  assert.ok(!/significant|,yes,|,no,/.test(wide.csv), wide.csv);
  // Where lower is better, lower is the better verdict.
  assert.equal(t.rows.find((r) => r.key === 'down')!.cells[1].verdict, 'worse');
  assert.equal(t.rows.find((r) => r.key === 'up')!.cells[1].verdict, 'better');
  // The writer's caption already says what the numbers are: not said twice.
  assert.equal(/\\caption\{[^\n]*/.exec(t.latex)![0].match(/mean/gi)!.length, 1, t.latex);
  assert.equal(t.markdown.match(/mean|Mean/g)!.length, 1, t.markdown);
  assert.match(t.markdown, /over seeds 1-3\. The best in bold\./);
});

test('seeds that barely change a number are not tested over seeds, and the table says why; per example they are', () => {
  // As a real trial had it: one side comes out the same for every seed, the other varies a little.
  const note = 'BM25, nDCG@10: The seeds barely change this number, so a test over seeds says little: compare per example (give the runs a scores file)';
  const mk = (id: string, group: string, seed: number, ndcg: number, scores?: boolean) => ({ id, status: 'done', createdAt: seed, command: 'x', cwd: tmp, group, seed, metrics: { last: { ndcg } }, ...(scores ? { scores: true, folder: `/${id}` } : {}) }) as RunRecord;
  const values = { counts: [0.9027, 0.9014, 0.8987], BM25: [0.9696, 0.9696, 0.9696000000000001] };
  const runs = (scores: boolean) => Object.entries(values).flatMap(([g, vs]) => vs.map((v, i) => mk(`${g}${i}`, g, i, v, scores)));
  const spec = { columns: [{ metric: 'ndcg', better: 'max' as const, label: 'nDCG@10' }], baseline: 'counts' };
  for (const test of [undefined, 'welch', 'paired'] as const) {
    const t = makeTable({ ...spec, test }, runs(false), { id: 'tflat001', scores: () => null });
    const cell = t.rows.find((r) => r.key === 'BM25')!.cells[0];
    assert.deepEqual([cell.p, cell.pAdj, cell.significant, cell.verdict, cell.best], [undefined, undefined, undefined, undefined, true], String(test));
    assert.deepEqual(t.notes, [note]);
    assert.equal(t.footnote, undefined);
    assert.ok(!t.latex.includes('dagger') && !t.markdown.includes('†'));
    assert.ok(t.latex.includes(`% hydor:table tflat001\n% ${note}\n\\begin{tabular}`), t.latex);
    assert.ok(t.markdown.endsWith(`<!-- ${note} -->`), t.markdown);
    // Put into a paper and made again, the comment stays one line under its marker.
    const placed = insertTable(insertTable('\\end{document}', t).text, t);
    assert.equal(placed.text.split(note).length, 2);
  }
  // Under a thousandth of the mean is next to nothing too; more is a spread a test can use.
  const near = (spread: number) => makeTable(spec, [0, 1, 2].flatMap((i) => [mk(`c${i}`, 'counts', i, 0.9 + i * 0.01), mk(`n${i}`, 'BM25', i, 0.95 + (i - 1) * spread)]), { id: 'tflat002', scores: () => null });
  assert.equal(near(0.0005).rows[1].cells[0].verdict, undefined);
  assert.ok(near(0.003).rows[1].cells[0].verdict);
  // With per-example scores the test is over examples, as before, and marked.
  const per = (r: RunRecord) => new Map([['ndcg', new Map([0, 1, 2, 3, 4, 5].map((k) => [`q${k}`, r.group === 'BM25' ? 0.9 + k / 100 : 0.8 + k / 90]))]]);
  const e = makeTable(spec, runs(true), { id: 'tflat003', scores: per });
  assert.deepEqual(e.tests, ['paired t-test over 6 examples']);
  assert.equal(e.rows.find((r) => r.key === 'BM25')!.cells[0].verdict, 'better');
  assert.equal(e.notes, undefined);
});

test('per-example scores the same on every example read as the same, and say so; a row of runs without the setting is named so', async () => {
  const mk = (id: string, seed: number, ndcg: number, params?: Record<string, string>) => ({ id, status: 'done', createdAt: seed, command: 'x', cwd: tmp, group: 'toy-ranker', seed, params, metrics: { last: { ndcg } }, scores: true, folder: `/${id}` }) as RunRecord;
  // As the trial had it: the unchanged ranker (no setting), one variant that scores each query the same, one that differs.
  const runs = [0, 1, 2].flatMap((i) => [mk(`none${i}`, i, 0.7), mk(`bm25l${i}`, i, 0.7, { ranker: 'bm25l' }), mk(`cos${i}`, i, 0.8, { ranker: 'cosine' })]);
  const per = (r: RunRecord) => new Map([['ndcg', new Map([0, 1, 2, 3, 4].map((k) => [`q${k}`, (r.params?.ranker === 'cosine' ? 0.8 : 0.7) + (k - 2) / 10 + (r.params?.ranker === 'cosine' ? k / 100 - 0.02 : 0)]))]]);
  const note = 'ranker = bm25l, ndcg: identical to ranker not set on every example';
  for (const test of [undefined, 'paired', 'bootstrap'] as const) {
    const t = makeTable({ rows: 'param:ranker', columns: [{ metric: 'ndcg', better: 'max' }], baseline: '—', test }, runs, { id: 'tident01', scores: per });
    assert.deepEqual(t.rows.map((r) => r.label).sort(), ['ranker = bm25l', 'ranker = cosine', 'ranker not set']);
    const cell = t.rows.find((r) => r.key === 'bm25l')!.cells[0];
    assert.deepEqual([cell.p, cell.pAdj, cell.significant, cell.verdict], [null, null, false, 'same'], String(test));
    assert.deepEqual(t.notes, [note]);
    assert.ok(t.latex.includes(`% hydor:table tident01\n% ${note}\n\\begin{tabular}`), t.latex);
    assert.ok(t.markdown.endsWith(`<!-- ${note} -->`), t.markdown);
    assert.match(t.csv, /\nbm25l,ranker = bm25l,[^\n]*,,,same\n/);
  }
  // The tool's answer gives each cell's verdict and p, never `significant`; the table kept still has it, for its marks.
  for (const r of runs) {
    insertRun(db, { id: r.id, status: 'done', spec: { command: 'x', cwd: tmp, group: 'identical', params: r.params, seed: r.seed } });
    updateRun(db, r.id, { metrics: { last: { ndcg: r.metrics!.last.ndcg + r.seed! / 50 } } });
  }
  const step = ctxOf({ step: true, runId: 'flow-tab', key: 'acp:flow-tab', agent: 'acp' });
  const answer = JSON.parse((await call('experiment_table', { group: 'identical', rows: 'param:ranker', columns: [{ metric: 'ndcg', better: 'max' }] }, step)).text);
  const cells = answer.rows.flatMap((r: { cells: Record<string, unknown>[] }) => r.cells);
  assert.ok(cells.every((c: Record<string, unknown>) => !('significant' in c)) && cells.some((c: Record<string, unknown>) => c.verdict && 'p' in c), JSON.stringify(cells));
  assert.ok(!answer.csv.includes('significant'));
  assert.ok(getTable(db, answer.id)!.rows.some((r) => r.cells[0].significant !== undefined));
  const tools = experimentTools(step);
  assert.match(tools.find((t) => t.name === 'experiment_table')!.description, /verdict, to be read with its p/);
  // A sweep's tool takes what its description names.
  const props = (tools.find((t) => t.name === 'experiment_sweep')!.inputSchema as { properties: Record<string, unknown> }).properties;
  for (const k of ['tags', 'name', 'scoresFile', 'metricsFile']) assert.ok(props[k], k);
});

test('tests pick themselves: paired over seeds when the rows share seeds, over examples when runs kept scores', () => {
  const t = workOut(db, { runs: ids, columns: cols }, 'tpair001');
  close(t.rows[1].cells[0].pAdj, 2 * 0.014812204724617634, 1e-8, 'paired acc, Holm');
  close(t.rows[1].cells[1].pAdj, 2 * 0.09378311079558353, 1e-8, 'paired loss, Holm');
  assert.equal(t.rows[1].cells[1].significant, false);
  assert.deepEqual(t.tests, ['paired t-test over 3 seeds', 'paired t-test over 3 seeds']);
  // Per-example scores: JSON lines, or trec_eval -q's lines.
  const scores = parseScores('{"id": "q1", "ndcg": 0.5}\n{"qid": "q2", "ndcg": 0.6}\nndcg q3 0.4\nndcg all 0.5\n');
  assert.deepEqual(
    [...scores.get('ndcg')!.entries()],
    [
      ['q1', 0.5],
      ['q2', 0.6],
      ['q3', 0.4],
    ],
  );
  const base = [0.5, 0.6, 0.4, 0.7, 0.55, 0.65, 0.45, 0.35];
  const ours = [0.55, 0.62, 0.48, 0.71, 0.6, 0.7, 0.44, 0.42];
  const runs: RunRecord[] = [base, ours].map((xs, i) => ({
    id: `ex${i}xxxx`,
    status: 'done',
    createdAt: i,
    command: 'x',
    cwd: tmp,
    group: i ? 'ours' : 'bm25',
    metrics: { last: { ndcg: xs.reduce((a, b) => a + b) / xs.length } },
    scores: true,
    folder: `/s${i}`,
  }));
  const read = (r: RunRecord) => new Map([['ndcg', new Map((r.id === 'ex0xxxx' ? base : ours).map((v, k) => [`q${k}`, v]))]]);
  const e = makeTable({ runs: runs.map((r) => r.id), columns: [{ metric: 'ndcg', better: 'max' }] }, runs, { id: 'tex00001', scores: read });
  close(e.rows[1].cells[0].p, 0.007812808075189104, 1e-8, 'paired over examples');
  assert.deepEqual(e.tests, ['paired t-test over 8 examples']);
  assert.equal(e.rows[1].cells[0].significant, true);
  const bs = makeTable({ runs: runs.map((r) => r.id), columns: [{ metric: 'ndcg', better: 'max' }], test: 'bootstrap' }, runs, { id: 'tex00002', scores: read });
  assert.deepEqual(bs.tests, ['paired bootstrap over 8 examples']);
  assert.ok(bs.rows[1].cells[0].p! < 0.05);
  assert.match(e.notes?.join(' ') ?? '', /^$/, 'nothing left out');
});

test('per-example scores a run writes are kept with it and pair its table; a metric crossing a value is told', async () => {
  notices.length = 0;
  forgetNotices();
  const write = (group: string, base: number, seed: number) =>
    cleanJob(db, {
      command: `for q in 1 2 3 4 5 6; do echo "{\\"id\\": \\"q$q\\", \\"ndcg\\": $(echo "${base} + $q / 100" | bc -l)}"; done > scores-${group}-{seed}.jsonl; echo "ndcg=${base}"`,
      cwd: tmp,
      gpus: 0,
      group,
      seed,
      scoresFile: `scores-${group}-{seed}.jsonl`,
      notify: { when: { metric: 'ndcg', op: '>', value: 0.6 } },
    }).then((sp) => submit(deps, sp));
  const a = await write('bm25', 0.5, 1);
  const b = await write('dense', 0.7, 1);
  await until(() => ended(a.id)() && ended(b.id)(), 20_000, 'both runs');
  assert.equal(getRun(db, a.id)!.scores, true, getRun(db, a.id)!.why);
  assert.ok(fs.readFileSync(path.join(runFolder(a.id), 'scores.jsonl'), 'utf8').includes('"q6"'));
  const t = workOut(db, { runs: [a.id, b.id], columns: [{ metric: 'ndcg', better: 'max' }] }, 'tscores1');
  assert.deepEqual(t.tests, ['paired t-test over 6 examples']);
  assert.ok(getRunWithEvents(db, b.id)!.events!.some((e) => e.kind === 'note' && e.text.startsWith('Crossed: ndcg > 0.6')));
  assert.ok(notices.some((n) => n.kind === 'waiting' && n.body === 'ndcg is 0.7, over 0.6'));
  assert.ok(!getRunWithEvents(db, a.id)!.events!.some((e) => e.text.startsWith('Crossed')), 'one under the value is not told');
});

test('rows by a setting, labels, runs not ended left out; recompute after a run changes', () => {
  doneRun('tlr1aaaa', 'lr', 1, { acc: 0.7 }, { params: { lr: 0.001 } });
  doneRun('tlr2aaaa', 'lr', 2, { acc: 0.72 }, { params: { lr: 0.001 } });
  doneRun('tlr3aaaa', 'lr', 1, { acc: 0.8 }, { params: { lr: 0.0003 } });
  insertRun(db, { id: 'tlr4aaaa', spec: { command: 'x', cwd: tmp, group: 'lr', params: { lr: 0.01 } }, status: 'running' });
  const spec = { group: 'lr', rows: 'param:lr' as const, columns: [{ metric: 'acc', better: 'max' as const }], labels: { '0.0003': 'Ours' }, test: 'none' as const };
  const t = workOut(db, spec, 'tlr00001');
  // Rows by a setting no run has are one row of everything: the table says so, and names the settings there are.
  const lost = workOut(db, { ...spec, rows: 'param:command' as const, labels: undefined }, 'tlost001');
  assert.equal(lost.rows.length, 1);
  assert.match((lost.notes ?? []).join(' '), /No run has a setting called “command”, so all \d+ runs are one row and its spread is over runs, not seeds\. Their settings are: .*lr/);
  assert.deepEqual(
    t.rows.map((r) => [r.key, r.label]),
    [
      ['0.0003', 'Ours'],
      ['0.001', 'lr = 0.001'],
    ],
  );
  assert.ok(t.latex.includes('\\begin{tabular}{lc}') && t.latex.includes('lr & acc'));
  saveTable(db, t);
  const byIds = workOut(db, { runs: ['tlr1aaaa', 'tlr4aaaa'], columns: spec.columns }, 'tlr00002');
  assert.match(byIds.notes!.join(' '), /1 run has not ended/);
  // A run's numbers change (a mistake fixed): worked out again, the table says so; as it was made, it stays.
  updateRun(db, 'tlr3aaaa', { metrics: { last: { acc: 0.85 } } });
  const again = recomputeTable(db, 'tlr00001')!;
  close(again.rows[0].cells[0].mean, 0.85, 1e-12);
  close(getTable(db, 'tlr00001')!.rows[0].cells[0].mean, 0.8, 1e-12);
  assert.equal(recomputeTable(db, 'tnothere'), null);
});

test('a table goes into a LaTeX file: before \\end{document}, then in place of itself', () => {
  const t = workOut(db, { runs: ids, columns: cols, test: 'welch' }, 'tins0001');
  const doc = '\\documentclass{article}\n\\begin{document}\nHello.\n\\end{document}\n';
  const one = insertTable(doc, t);
  assert.equal(one.replaced, false);
  assert.ok(one.text.indexOf('% hydor:table tins0001') < one.text.indexOf('\\end{document}'));
  // The author changed the caption; the table's numbers change: its tabular is replaced, the caption kept.
  const edited = one.text.replace(/\\caption\{[^\n]*\}/, '\\caption{My own caption.}');
  updateRun(db, 'tb0bbbb', { metrics: { last: { acc: 90, loss: 0.45 } } });
  const t2 = workOut(db, t.spec, 'tins0001');
  const two = insertTable(edited, t2);
  assert.equal(two.replaced, true);
  assert.ok(two.text.includes('\\caption{My own caption.}'));
  assert.equal(two.text.split('% hydor:table tins0001').length, 2, 'still one table');
  assert.ok(two.text.includes('\\textbf{85.67}'), 'the new numbers');
  updateRun(db, 'tb0bbbb', { metrics: { last: { acc: 83.1, loss: 0.45 } } });
  assert.equal(insertTable('Notes', t).text.startsWith('Notes\n\n\\begin{table}'), true, 'a file without \\end{document}: at its end');
});

// ---- sweeps ----------------------------------------------------------------------------------------------------------

test('sweeps: every combination or a sample, placeholders filled and quoted, the median early stop', () => {
  assert.deepEqual(expandSweep({ lr: [1, 2], bs: [8, 16, 32] }), [
    { lr: 1, bs: 8 },
    { lr: 1, bs: 16 },
    { lr: 1, bs: 32 },
    { lr: 2, bs: 8 },
    { lr: 2, bs: 16 },
    { lr: 2, bs: 32 },
  ]);
  assert.throws(() => expandSweep({ a: [1, 2, 3, 4, 5], b: [1, 2, 3, 4, 5] }, 'grid', 10), /25 runs, more than 10/);
  const r = expandSweep({ a: [1, 2, 3, 4, 5], b: [1, 2, 3, 4, 5] }, 'random', 10, 42);
  assert.equal(r.length, 10);
  assert.equal(new Set(r.map((x) => JSON.stringify(x))).size, 10, 'no combination twice');
  assert.deepEqual(expandSweep({ a: [1, 2, 3, 4, 5], b: [1, 2, 3, 4, 5] }, 'random', 10, 42), r, 'the same seed, the same sample');
  assert.equal(fillCommand('python t.py --lr {lr} --name {name} ${HOME} {other}', { lr: 0.001, name: 'my run' }), "python t.py --lr 0.001 --name 'my run' ${HOME} {other}");
  assert.deepEqual(placeholders('x {a} ${b} {c} {a}'), ['a', 'c']);
  const s = (pts: [number, number][]) => ({ loss: pts });
  const others = [
    s([
      [100, 0.5],
      [200, 0.4],
    ]),
    s([
      [100, 0.6],
      [200, 0.45],
    ]),
    s([
      [100, 0.55],
      [200, 0.42],
      [300, 0.4],
    ]),
  ];
  assert.deepEqual(
    earlyStop(
      s([
        [50, 0.9],
        [100, 0.8],
        [200, 0.7],
      ]),
      others,
      { metric: 'loss', better: 'min' },
    ),
    { stop: true, step: 200, value: 0.7, median: 0.42, others: 3 },
  );
  assert.deepEqual(
    earlyStop(
      s([
        [50, 0.5],
        [100, 0.45],
        [200, 0.41],
      ]),
      others,
      { metric: 'loss', better: 'min' },
    ),
    { stop: false },
  );
  assert.deepEqual(
    earlyStop(
      s([
        [50, 0.9],
        [100, 0.8],
        [200, 0.7],
      ]),
      others,
      { metric: 'loss', better: 'min', afterSteps: 500 },
    ),
    { stop: false },
    'not before afterSteps',
  );
  assert.deepEqual(
    earlyStop(
      s([
        [50, 0.9],
        [100, 0.8],
        [400, 0.7],
      ]),
      others,
      { metric: 'loss', better: 'min' },
    ),
    { stop: false },
    'the others have not got there',
  );
});

test('a sweep through the route: runs of one group, each with its settings; mistakes start none', async () => {
  const bad = await http.inject({ method: 'POST', url: '/api/experiments/sweeps', payload: { group: 'sw', command: 'echo {lr}', params: { lr: [1, 2], bs: [1] }, cwd: tmp, gpus: 0 } });
  assert.equal(bad.statusCode, 400);
  assert.match(bad.json().error, /has no \{bs\}/);
  const before = listRuns(db, { limit: 5000 }).length;
  const res = (await http.inject({ method: 'POST', url: '/api/experiments/sweeps', payload: { group: 'sw', command: "sh -c 'echo loss={lr}'", params: { lr: [0.5, 0.25] }, cwd: tmp, gpus: 0, earlyStop: { metric: 'loss' } } })).json();
  assert.equal(res.runs.length, 2);
  assert.equal(listRuns(db, { limit: 5000 }).length, before + 2);
  assert.deepEqual(
    res.runs.map((r: RunRecord) => [r.name, r.command, r.params, r.group]),
    [
      ['sw · lr=0.5', "sh -c 'echo loss=0.5'", { lr: 0.5 }, 'sw'],
      ['sw · lr=0.25', "sh -c 'echo loss=0.25'", { lr: 0.25 }, 'sw'],
    ],
  );
  assert.equal(res.sweep.earlyStop.better, 'min', 'which way is better, from the metric’s name');
  notices.length = 0;
  forgetNotices();
  await until(() => res.runs.every((r: RunRecord) => ended(r.id)()), 20_000, 'the sweep');
  // Earlier tests may finish runs asynchronously: count only this sweep and its runs.
  const sweepUrls = new Set([`/experiments?sweep=${res.sweep.id}`, ...res.runs.map((r: RunRecord) => `/experiments/${r.id}`)]);
  const sweepNotices = notices.filter((n) => sweepUrls.has(n.url ?? ''));
  assert.equal(sweepNotices.length, 1, 'one notice for the whole sweep, none for individual runs');
  assert.equal(sweepNotices[0].url, `/experiments?sweep=${res.sweep.id}`);
  assert.match(sweepNotices[0].body, /^2 done\. Best loss 0\.25: lr=0\.25\.$/);
  assert.equal(sweepNotices[0].title, 'Sweep sw');
  const got = (await http.inject({ method: 'GET', url: `/api/experiments/sweeps/${res.sweep.id}` })).json();
  assert.equal(got.runs.length, 2);
});

// ---- SLURM and plain SSH clusters ------------------------------------------------------------------------------------------

test('SLURM: the batch script, and reading sbatch, squeue and sacct', () => {
  const c = { id: 'u', name: 'Unity', host: 'unity', kind: 'slurm' as const, workdir: '~/runs', setup: 'module load cuda/12.1\nsource ~/venv/bin/activate', partition: 'gpu', account: 'lab' };
  const s = sbatchScript({ run: { id: 'r1', name: 'BERT base', gpus: 2, cpus: 8, memGb: 32, hours: 2.5 }, cluster: c, dir: '/home/u/runs/r1', cwd: '~/code/bert', env: { HYDOR_RUN: 'r1', A: "it's" } });
  for (const l of [
    '#SBATCH --job-name=hydor-bert-base',
    '#SBATCH --output=/home/u/runs/r1/log.txt',
    '#SBATCH --gres=gpu:2',
    '#SBATCH --cpus-per-task=8',
    '#SBATCH --mem=32G',
    '#SBATCH --time=150',
    '#SBATCH --partition=gpu',
    '#SBATCH --account=lab',
    'module load cuda/12.1',
    "cd -- ~/'code/bert' ||",
    "export A='it'\\''s'",
    "bash '/home/u/runs/r1/command.sh'",
    "echo $code > '/home/u/runs/r1/exit'",
  ])
    assert.ok(s.includes(l), `${l} in:\n${s}`);
  assert.ok(s.indexOf('module load') < s.indexOf('cd --'), 'setup lines first');
  assert.equal(parseSbatch('12345\n'), '12345');
  assert.equal(parseSbatch('678;cluster2'), '678');
  assert.equal(parseSbatch('sbatch: error: Batch job submission failed'), null);
  const q = parseSqueue('12345|PENDING|Priority|0:00|\n12346|RUNNING|None|1:02:03|gpu-node7\n');
  assert.deepEqual(q.get('12345'), { state: 'PENDING', reason: 'Priority', elapsed: '0:00', nodes: undefined });
  assert.deepEqual(q.get('12346'), { state: 'RUNNING', reason: undefined, elapsed: '1:02:03', nodes: 'gpu-node7' });
  assert.deepEqual(parseSacct('COMPLETED|0:0|00:10:00\nCOMPLETED|0:0|00:10:00\n'), { state: 'COMPLETED', exitCode: 0, elapsed: '00:10:00' });
  assert.deepEqual(parseSacct('CANCELLED by 1234|0:15|00:00:30\n'), { state: 'CANCELLED', exitCode: 0, signal: 15, elapsed: '00:00:30' });
  assert.deepEqual(endOfSlurm({ state: 'TIMEOUT', exitCode: 0 }), { status: 'failed', why: 'It ran out of the time it asked for (hours)' });
  assert.equal(endOfSlurm({ state: 'COMPLETED', exitCode: 0 }).status, 'done');
  assert.equal(endOfSlurm({ state: 'CANCELLED' }).status, 'stopped');
  assert.equal(reasonWords('Resources'), 'the cluster waits for the resources it asks for to be free (Resources)');
  assert.equal(reasonWords('QOSMaxJobsPerUserLimit'), 'you have as many jobs running as the cluster allows (QOSMaxJobsPerUserLimit)');
});

test('a SLURM run through a stand-in ssh: submitted, waiting with the queue’s reason, running, its log copied, done', async () => {
  const state = { phase: 'PENDING', log: '', exit: '' as string, scripts: [] as string[], inputs: [] as string[] };
  const fake: Ssh = async (_host, script, o) => {
    state.scripts.push(script);
    if (o?.input !== undefined) state.inputs.push(o.input);
    if (script.startsWith('mkdir -p')) return { code: 0, out: '/home/u/runs/RID\n', err: '' };
    if (script.includes('sbatch --parsable')) return { code: 0, out: '4242\n', err: '' };
    if (script.startsWith('cd ') && script.includes('git rev-parse')) return { code: 3, out: '', err: '' };
    if (script.startsWith('squeue')) {
      const sq = state.phase === 'DONE' ? '' : `4242|${state.phase}|${state.phase === 'PENDING' ? 'Resources' : 'None'}|0:01|n1\n`;
      return { code: 0, out: `${sq}@@\n${state.exit}\n@@\n${state.phase === 'DONE' ? 'COMPLETED|0:0|00:00:05\n' : ''}`, err: '' };
    }
    if (script.startsWith('tail -c')) {
      const from = Number(/tail -c \+(\d+)/.exec(script)![1]) - 1;
      return { code: 0, out: Buffer.from(state.log.slice(from)).toString('base64'), err: '' };
    }
    return { code: 0, out: '', err: '' };
  };
  setSsh(fake);
  const c = saveCluster(db, { name: 'Unity', host: 'unity', kind: 'slurm', partition: 'gpu' });
  const r = await submit(deps, await cleanJob(db, { command: 'python train.py --lr 0.1', cwd: '~/code', where: `c:${c.id}`, gpus: 1, hours: 1 }));
  await until(() => getRun(db, r.id)!.status === 'waiting' && /Resources/.test(getRun(db, r.id)!.why ?? ''), 60_000, 'it to wait in the queue');
  const w = getRun(db, r.id)!;
  assert.equal(w.clusterJob, '4242');
  assert.match(w.why!, /^In the cluster’s queue: the cluster waits for the resources/);
  const script = state.inputs.find((x) => x.includes('#SBATCH'))!;
  assert.ok(script.includes('#SBATCH --gres=gpu:1') && script.includes('#SBATCH --partition=gpu') && script.includes('#SBATCH --time=60'));
  assert.ok(state.inputs.includes('python train.py --lr 0.1\n'), 'its command written there');
  state.phase = 'RUNNING';
  state.log = 'step=1 loss=2.0\nstep=2 loss=1.5\n';
  await until(() => getRun(db, r.id)!.status === 'running', 60_000, 'it to run');
  await until(() => getRun(db, r.id)!.metrics?.last?.loss === 1.5 || (fs.existsSync(path.join(runFolder(r.id), 'log.txt')) && fs.readFileSync(path.join(runFolder(r.id), 'log.txt'), 'utf8').includes('loss=1.5')), 60_000, 'its log');
  state.log += 'step=3 loss=1.0\n';
  state.phase = 'DONE';
  state.exit = '0';
  await until(ended(r.id), 60_000, 'it to end');
  const x = getRun(db, r.id)!;
  assert.equal(x.status, 'done', x.why);
  assert.equal(x.metrics?.last.loss, 1.0);
  assert.equal(fs.readFileSync(path.join(runFolder(r.id), 'log.txt'), 'utf8'), state.log, 'the whole log, copied here');
  assert.equal((await http.inject({ method: 'POST', url: '/api/experiments/clusters/check', payload: { id: c.id } })).json().ok, true);
});

// ---- other machines ------------------------------------------------------------------------------------------------------

test('another machine: a job sent there is followed from here; its own runs are listed, marked', async () => {
  const there = new Map<string, RunRecord>();
  const calls: { method: string; p: string; body?: unknown }[] = [];
  const lab = {
    def: { name: 'Lab box' },
    async call<T>(method: string, p: string, _t?: number, body?: unknown): Promise<T> {
      calls.push({ method, p, body });
      if (method === 'POST' && p === '/api/experiments/jobs') {
        const r = { ...(body as RunRecord), id: 'rlab0001', status: 'queued' as const, createdAt: Date.now(), name: 'train.py' };
        there.set(r.id, r);
        return { run: r } as T;
      }
      const m = /^\/api\/experiments\/runs\/(\w+)(\/stop)?/.exec(p);
      if (m && m[2]) {
        there.set(m[1], { ...there.get(m[1])!, status: 'stopped', why: 'Stopped by you', endedAt: Date.now() });
        return { run: there.get(m[1]) } as T;
      }
      if (m) return { run: there.get(m[1]), series: {}, log: 'from the lab', logSize: 12 } as T;
      if (p.startsWith('/api/experiments/runs')) return { runs: [...there.values(), { id: 'rlab0002', status: 'done', createdAt: 1, command: 'x', cwd: '/', name: 'its own' }] } as T;
      throw new Error(`unexpected ${method} ${p}`);
    },
  };
  useMachines({
    list: () => [{ id: 'lab', name: 'Lab box', via: 'url', status: { state: 'online', waiting: 0, working: 0 } }],
    get: (id: string) =>
      id === 'lab'
        ? lab
        : (() => {
            throw new HttpError(404, 'no');
          })(),
  } as any);
  const r = await submit(deps, await cleanJob(db, { command: 'python train.py', cwd: '/data/code', where: 'm:lab', gpus: 1 }));
  assert.deepEqual(r.remote, { machine: 'lab', id: 'rlab0001' });
  assert.equal((calls[0].body as RunRecord).where, 'local', 'it runs there as there’s own');
  there.set('rlab0001', { ...there.get('rlab0001')!, status: 'running', startedAt: Date.now(), metrics: { last: { loss: 0.3 } } });
  await until(() => getRun(db, r.id)!.status === 'running', 30_000, 'the copy to follow');
  assert.equal(getRun(db, r.id)!.metrics?.last.loss, 0.3);
  const v = (await http.inject({ method: 'GET', url: `/api/experiments/runs/${r.id}` })).json();
  assert.equal(v.log, 'from the lab');
  assert.equal(v.run.id, r.id);
  const all = (await http.inject({ method: 'GET', url: '/api/experiments/runs?everywhere=1&limit=500' })).json().runs as RunRecord[];
  assert.ok(
    all.some((x) => x.id === 'rlab0002' && x.machine?.name === 'Lab box'),
    'its own runs, marked with where they run',
  );
  assert.ok(!all.some((x) => x.id === 'rlab0001'), 'a run copied here is listed once');
  await http.inject({ method: 'POST', url: `/api/experiments/runs/${r.id}/stop`, payload: {} });
  assert.equal(getRun(db, r.id)!.status, 'stopped');
  useMachines({
    list: () => [],
    get: () => {
      throw new HttpError(404, 'no');
    },
  } as any);
});

// ---- the tools ------------------------------------------------------------------------------------------------------------

const ctxOf = (o: Partial<RunCtx> = {}): RunCtx => ({ runId: 'run1', key: 'claude:s1', agent: 'claude', cwd: tmp, deps, ...o });
const toolOf = (name: string, ctx: RunCtx) => experimentTools(ctx).find((t) => t.name === name)!;
const call = async (name: string, a: Record<string, unknown>, ctx: RunCtx) => {
  const out = await toolOf(name, ctx).run(a, ctx);
  return typeof out === 'string' ? { text: out, isError: false } : { text: out.text, isError: !!out.isError };
};

test('the tools: JSON answers; a step runs without asking, Plan mode refuses, a session asks the user', async () => {
  const step = ctxOf({ step: true, runId: 'flow-app1', key: 'acp:flow-app1', agent: 'acp' });
  assert.deepEqual(
    experimentTools(step).map((t) => t.name),
    ['experiment_run', 'experiment_sweep', 'experiment_list', 'experiment_get', 'experiment_stop', 'experiment_table', 'experiment_describe', 'evaluation_get', 'evaluation_score', 'experiment_wait'],
  );
  assert.ok(!experimentTools(ctxOf()).some((t) => t.name === 'experiment_wait'), 'waiting hours is for steps');
  const run = await call('experiment_run', { command: 'echo "f1=0.5"', gpus: 0, group: 'tools', report: true }, step);
  const { id, status } = JSON.parse(run.text);
  assert.ok(id && status === 'queued', run.text);
  assert.deepEqual(getRun(db, id)!.startedBy, { app: 'app1' });
  const waited = JSON.parse((await call('experiment_wait', { ids: [id], hours: 1 }, step)).text);
  assert.equal(waited.ended, true);
  assert.equal(waited.runs[0].metrics.last.f1, 0.5);
  sessions.mode = 'plan';
  const refused = await call('experiment_run', { command: 'echo hi', gpus: 0 }, ctxOf());
  assert.ok(refused.isError && /only reads/.test(refused.text));
  sessions.mode = 'default';
  sessions.answer = 'deny';
  const denied = await call('experiment_run', { command: 'echo hi', gpus: 0 }, ctxOf());
  assert.ok(denied.isError && /said no/.test(denied.text));
  assert.equal(sessions.cards.at(-1)!.title, 'Run a job');
  sessions.answer = 'always';
  sessions.delivered.length = 0;
  const ok = JSON.parse((await call('experiment_run', { command: 'echo "acc=1"', gpus: 0, report: true }, ctxOf())).text);
  const n = sessions.cards.length;
  const again = JSON.parse((await call('experiment_run', { again: ok.id, seed: 3 }, ctxOf())).text);
  assert.equal(sessions.cards.length, n, 'allowed for the rest of the session: no card');
  assert.equal(getRun(db, again.id)!.from, ok.id);
  assert.equal(getRun(db, again.id)!.seed, 3);
  sessions.answer = 'accept';
  await until(() => ended(ok.id)() && ended(again.id)(), 20_000, 'the session’s runs');
  const heard = () => sessions.delivered.some((x) => x.key === 'claude:s1' && x.text.includes(`(${ok.id}) ended. Done: acc 1`));
  await until(heard, 5000, 'report: the session to hear how it went');
  const said = sessions.delivered.find((x) => x.key === 'claude:s1')!.text;
  assert.ok(experimentNoticeOf(said), said);
  assert.match(said, /\(This notice is from Experiments, not typed by the user\./);
  const list = JSON.parse((await call('experiment_list', { group: 'tools' }, ctxOf())).text);
  assert.equal(list.runs[0].id, id);
  assert.ok('metrics' in list.runs[0] && 'startedAt' in list.runs[0] && 'endedAt' in list.runs[0]);
  const got = JSON.parse((await call('experiment_get', { id, lines: 5 }, ctxOf())).text);
  assert.equal(got.run.id, id);
  assert.match(got.log, /f1=0\.5/);
  const table = JSON.parse((await call('experiment_table', { runs: ids, columns: [{ metric: 'acc' }], test: 'welch' }, ctxOf())).text);
  assert.ok(table.id && table.latex.includes(`% hydor:table ${table.id}`) && getTable(db, table.id), 'the table is kept by its id');
  assert.equal(table.spec.columns[0].better, 'max', 'which way is better, from the name');
  const bad = await call('experiment_run', { command: 'echo', cwd: '/no/such/folder', gpus: 0 }, step);
  assert.ok(bad.isError && /is not there/.test(bad.text));
  // The agent on call's brief names the tools and the default rules.
  const brief = onCallBrief(deps, getRun(db, id)!, 'stall', 'No new output for 31 minutes');
  assert.match(brief, /Never delete files or checkpoints\./);
  assert.match(brief, new RegExp(`experiment_run with again: "${id}"`));
});

// ---- the message when runs end ---------------------------------------------------------------------------------------

test('the numbers in the line: those named first, then results printed once before curves, never bookkeeping', () => {
  const run = (more: Partial<RunRecord>, last: Record<string, number>, repeated: string[] = []) => ({ id: 'rline0001', status: 'done', createdAt: 0, command: 'x', cwd: tmp, startedAt: Date.now(), endedAt: Date.now(), metrics: { last, repeated }, ...more }) as RunRecord;
  const last = { queries: 60, docs: 1000, k1: 1.2, elapsed_s: 3, loss: 0.2, lr: 0.001, 'ndcg@10': 0.41, mrr: 0.33, p_value: 0.5 };
  assert.deepEqual(keyNumbers(Object.keys(last), { repeated: ['loss', 'lr'], settings: ['k1'] }), ['ndcg@10', 'mrr', 'loss', 'p_value', 'lr']);
  assert.equal(endLine(db, run({ params: { k1: 1.2 } }, last, ['loss', 'lr'])), 'Done in under a minute: ndcg@10 0.41, mrr 0.33, loss 0.2, p_value 0.5, lr 0.001');
  assert.match(endLine(db, run({ better: { queries: 'max' } }, last, ['loss'])), /: queries 60, ndcg@10 0\.41,/, 'named as one that counts: first, whatever it is');
  assert.equal(keyNumbers(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']).length, 6, 'six at most');
  assert.deepEqual(keyNumbers(['loss', 'depth'], { settings: ['loss', 'depth'] }), ['loss'], 'a loss beside a --loss setting is still its result');
  // An earlier results table of the experiment says which count.
  doneRun('tline001a', 'lined', 1, { zeta: 1, acc: 0.5 });
  saveTable(db, workOut(db, { group: 'lined', columns: [{ metric: 'zeta', better: 'max' }] }, 'tlinetab1'));
  assert.match(endLine(db, run({ group: 'lined' }, { acc: 0.9, other: 2, zeta: 3 })), /: zeta 3, acc 0\.9, other 2$/);
});

test('runs that end close together are told in one message; one waiting is added to; a run read since is left out', async () => {
  const key = 'claude:told';
  sessions.delivered.length = 0;
  const mine = () => sessions.delivered.filter((x) => x.key === key);
  const e = (id: string, at: number) => ({ runs: [id], line: `“${id}” (${id}) ended. Done`, at });
  // At rest: gathered for a moment.
  tellEnded(deps, key, e('rb', 2));
  tellEnded(deps, key, e('ra', 1));
  assert.equal(mine().length, 0, 'not at once');
  await sleep(300);
  assert.equal(mine().length, 1);
  assert.deepEqual(mine()[0].text.split('\n').filter((l) => l.startsWith('- ')), ['- “ra” (ra) ended. Done', '- “rb” (rb) ended. Done'], 'the latest last');
  assert.ok(experimentNoticeOf(mine()[0].text));
  // At work: into the queue at once, and the next ones added to the message that waits.
  sessions.live.set(key, 'working');
  tellEnded(deps, key, e('rc', 3));
  await sleep(50);
  assert.equal(sessions.queued.get(key)?.length, 1);
  tellEnded(deps, key, e('rd', 4));
  await sleep(50);
  assert.equal(sessions.queued.get(key)!.length, 1, 'one message');
  assert.match(sessions.queued.get(key)![0].text, /\(rc\)[^]*\(rd\)/);
  // Read since it ended: gone from the waiting message, and not told at all when it comes after.
  sawEnded(deps, key, ['rc']);
  assert.ok(!sessions.queued.get(key)![0].text.includes('(rc)') && sessions.queued.get(key)![0].text.includes('(rd)'));
  sawEnded(deps, key, ['rd', 're']);
  assert.equal(sessions.queued.get(key)!.length, 0, 'nothing left to tell: the message is taken off');
  tellEnded(deps, key, e('re', 5));
  await sleep(50);
  assert.equal(sessions.queued.get(key)!.length, 0);
  // The waiting message went out: the next end starts a new one.
  tellEnded(deps, key, e('rf', 6));
  await sleep(50);
  sessions.queued.set(key, []);
  tellEnded(deps, key, e('rg', 7));
  await sleep(50);
  assert.equal(sessions.queued.get(key)!.length, 1);
  assert.ok(!sessions.queued.get(key)![0].text.includes('(rf)'));
  const many = noticeText(Array.from({ length: 23 }, (_, i) => e(`r${i}`, i)));
  assert.equal(many.split('\n').filter((l) => l.startsWith('- ')).length, 20);
  assert.match(many, /\nand 3 more in no experiment \(experiment_list lists them\)\n/);
  sessions.live.delete(key);
  sessions.queued.delete(key);
});

test('a run read with experiment_get before the message goes is not told; the others of the moment are', async () => {
  const key = 'claude:reads';
  sessions.delivered.length = 0;
  const was = gather.ms;
  gather.ms = 1500;
  const start = async (name: string) => (await submit(deps, await cleanJob(db, { command: `echo "queries=60"; echo "ndcg@10=0.5"`, cwd: tmp, gpus: 0, name, report: true }), { startedBy: { session: key } })).id;
  const a = await start('read');
  const b = await start('unread');
  await until(() => ended(a)() && ended(b)(), 20_000, 'both');
  await call('experiment_get', { id: a }, ctxOf({ key }));
  await until(() => sessions.delivered.some((x) => x.key === key), 5000, 'the message');
  gather.ms = was;
  const text = sessions.delivered.filter((x) => x.key === key).map((x) => x.text).join('\n');
  assert.ok(text.includes(`(${b}) ended. Done: ndcg@10 0.5\n`) && !text.includes(`(${a})`), text);
});

test('thirty runs of ten settings over three seeds: a line a setting with the mean and spread, under their experiments, nothing hidden', async () => {
  const key = 'claude:thirty';
  sessions.delivered.length = 0;
  sessions.live.set(key, 'working');
  const dir = path.join(tmp, 'toy-ranker');
  fs.mkdirSync(dir, { recursive: true });
  const names = ['bm25', 'bm25l', 'bm25plus', 'cosine', 'jaccard', 'dirichlet', 'jm', 'pl2'];
  const settings = [...names.map((n) => ['toy-ranker', n] as const), ['toy-ranker-controls', 'shuffled'] as const, ['toy-ranker-controls', 'idf-only'] as const];
  const ids = new Map<string, string[]>();
  saveInfo(db, 'toy-ranker', { title: 'Ranking variants on the toy set' }, 'agent');
  for (const [group, ranker] of settings)
    for (const seed of [0, 1, 2]) {
      // A seed of one setting fails; the scores go to a file named for each seed.
      const command = `echo "queries=60"; echo "ndcg@10=0.955$HYDOR_SEED"; echo --ranker {ranker} --seed {seed} --out out_{seed}.json > said-{seed}.txt; test {ranker} != jm || test "$HYDOR_SEED" != 1`;
      const r = await submit(deps, await cleanJob(db, { command, params: { ranker }, seed, cwd: dir, gpus: 0, group, name: `${ranker} seed ${seed}`, report: true }), { startedBy: { session: key } });
      ids.set(ranker, [...(ids.get(ranker) ?? []), r.id]);
    }
  await until(() => [...ids.values()].flat().every((id) => ended(id)()), 90_000, 'thirty runs');
  await until(() => [...ids.values()].flat().every((id) => sessions.queued.get(key)?.[0]?.text.includes(id)), 10_000, 'the message').catch((e) => assert.fail(`${e.message}: ${JSON.stringify(sessions.queued.get(key))}`));
  assert.equal(sessions.queued.get(key)!.length, 1, 'one message');
  const text = sessions.queued.get(key)![0].text;
  const lines = text.split('\n');
  const rows = lines.filter((l) => l.startsWith('- '));
  assert.equal(rows.length, 10, text);
  assert.ok(lines.includes('Ranking variants on the toy set:') && lines.includes('toy-ranker-controls:'), text);
  assert.ok(lines.indexOf('Ranking variants on the toy set:') < lines.indexOf('toy-ranker-controls:'), 'the experiment whose first run ended first, first');
  assert.ok(rows.includes(`- bm25l (3 seeds): ndcg@10 0.9551 ± ${'1.00e-4'} (${ids.get('bm25l')!.join(', ')})`), text);
  assert.ok(rows.includes(`- jm (3 seeds, 1 failed): ndcg@10 0.9551 ± ${'1.41e-4'}. Seed 1 failed after under a minute: Its command ended with exit code 1 (${ids.get('jm')!.join(', ')})`), text);
  assert.ok(!/Done in|more/.test(rows.join('\n')), 'under a minute is not said');
  sessions.live.delete(key);
  sessions.queued.delete(key);
});

test('what is one line over seeds, what is not; the rest past twenty lines counted by experiment', () => {
  const run = (id: string, command: string, params: Record<string, string | number>, seed: number, more: Partial<RunRecord> = {}) => ({ id, command, params, seed, status: 'done', createdAt: 0, cwd: tmp, group: 'g', name: `v seed ${seed}`, startedAt: 0, endedAt: 1000, metrics: { last: { acc: 0.5 } }, ...more }) as RunRecord;
  const e = (r: RunRecord, at: number) => ({ runs: [r.id], line: `“${r.name}” (${r.id}) ended. Done`, at, group: r.group, run: { record: r, names: ['acc'], took: (r.endedAt! - r.startedAt!) >= 60_000 ? `${Math.round((r.endedAt! - r.startedAt!) / 60_000)} min` : '' } });
  const rows = (...runs: RunRecord[]) => noticeText(runs.map((r, i) => e(r, i))).split('\n').filter((l) => l.startsWith('- '));
  // The seed however the command takes it.
  assert.deepEqual(rows(run('a', 'py x.py --seed 1', { seed: 1 }, 1), run('b', 'py x.py --seed 2', { seed: 2 }, 2)), ['- v (2 seeds): acc 0.5 ± 0 (a, b)']);
  assert.equal(rows(run('a', 'py x.py 1', {}, 1), run('b', 'py x.py 2', {}, 2)).length, 1, 'a bare {seed}');
  assert.equal(rows(run('a', 'SEED=1 py x.py --out out/1.json', { out: 'out/1.json' }, 1), run('b', 'SEED=2 py x.py --out out/2.json', { out: 'out/2.json' }, 2)).length, 1);
  // A setting that happens to equal the seed is still a setting.
  assert.equal(rows(run('a', 'py x.py --k 1 --seed 1', { k: 1, seed: 1 }, 1), run('b', 'py x.py --k 2 --seed 2', { k: 2, seed: 2 }, 2)).length, 2);
  assert.equal(rows(run('a', 'py x.py --dropout 1', { dropout: 1 }, 1), run('b', 'py x.py --dropout 2', { dropout: 2 }, 2)).length, 2);
  // Another folder (the unchanged code beside a worktree's) is not another seed, nor is the same seed run again.
  assert.equal(rows(run('a', 'py x.py', {}, 1), run('b', 'py x.py', {}, 2, { cwd: '/elsewhere' })).length, 2);
  assert.equal(rows(run('a', 'py x.py', {}, 1), run('b', 'py x.py', {}, 1)).length, 2);
  // A minute or more is said.
  assert.match(rows(run('a', 'py x.py', {}, 1, { endedAt: 5 * 60_000 }), run('b', 'py x.py', {}, 2))[0], /\. Done in up to 5 min \(a, b\)$/);
  const many = noticeText([...Array.from({ length: 22 }, (_, i) => e(run(`a${i}`, `py x.py --k ${i}`, { k: i }, 0), i)), ...[1, 2, 3, 4].map((i) => e(run(`c${i}`, `py c.py --k ${i}`, { k: i }, 0, { group: 'toy-ranker-controls' }), 30 + i))]);
  assert.equal(many.split('\n').filter((l) => l.startsWith('- ')).length, 20);
  assert.match(many, /\nand 2 more in g, 4 more in toy-ranker-controls \(experiment_list lists them\)\n/);
});

test('a sweep’s end says its best setting without the seed, or what all its runs gave', async () => {
  const key = 'claude:sweeps';
  sessions.delivered.length = 0;
  sessions.live.set(key, 'working');
  const go = async (group: string, command: string, params: Record<string, unknown[]>) => {
    const s = await startSweep(deps, { command, params, group, cwd: tmp, gpus: 0, report: true }, { startedBy: { session: key } });
    await until(() => s.runs.every((r) => ended(r.id)()), 30_000, group);
    await until(() => !!sessions.queued.get(key)?.[0]?.text.includes(`(${s.sweep.id}) ended`), 10_000, 'the message');
    return sessions.queued.get(key)![0].text.split('\n').find((l) => l.includes(`(${s.sweep.id}) ended`))!;
  };
  assert.match(await go('flat', 'echo "acc=0.9696" --seed {seed}', { seed: [0, 1, 2] }), /ended: 3 done\. All 3 gave acc 0\.9696\. experiment_list/);
  assert.match(await go('seeds', 'echo "acc=0.{seed}"', { seed: [4, 5, 6] }), /ended: 3 done\. acc 0\.5 ± 0\.1 over 3 seeds\. /);
  assert.match(await go('both', 'echo "acc=0.{k}{seed}"', { k: [1, 2], seed: [0, 2] }), /ended: 4 done\. Best acc 0\.21 \(mean of 2 seeds\): k=2\. /);
  assert.match(await go('same', 'echo "acc=0.5" --k {k}', { k: [1, 2] }), /ended: 2 done\. All 2 gave acc 0\.5\. /);
  assert.match(await go('one', 'echo "acc=0.7" --seed {seed}', { seed: [3] }), /ended: 1 done\. acc 0\.7\. /);
  sessions.live.delete(key);
  sessions.queued.delete(key);
});

// ---- files git does not track, and files of a run's own ----------------------------------------------------------------

test('the files a command names that git does not track are kept with the run, within limits, never a secret or a link out', async () => {
  const dir = path.join(tmp, 'untracked-repo');
  fs.mkdirSync(path.join(dir, 'controls'), { recursive: true });
  const g = (...a: string[]) => execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=T', ...a], { cwd: dir, stdio: 'pipe' });
  g('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(dir, 'tracked.sh'), 'true\n');
  fs.writeFileSync(path.join(dir, '.gitignore'), 'ignored.cfg\n');
  g('add', '.');
  g('commit', '-q', '-m', 'first');
  fs.writeFileSync(path.join(dir, 'controls/control.sh'), 'echo "token=tokenizer.eos_token"; echo "acc=1"\n');
  fs.writeFileSync(path.join(dir, 'ignored.cfg'), 'depth: 3\n');
  fs.writeFileSync(path.join(dir, 'big.bin'), Buffer.alloc(KEEP_FILE + 1));
  fs.writeFileSync(path.join(dir, '.env'), 'A=1\n');
  fs.writeFileSync(path.join(dir, 'keys.py'), `KEY = "hf_${'a'.repeat(34)}"\n`);
  fs.writeFileSync(path.join(dir, 'out.txt'), 'an old output\n');
  fs.writeFileSync(path.join(tmp, 'outside.txt'), 'outside\n');
  fs.symlinkSync(path.join(tmp, 'outside.txt'), path.join(dir, 'link.txt'));
  fs.symlinkSync(path.join(dir, '.env'), path.join(dir, 'settings.txt'));
  const command = 'sh controls/control.sh --config=ignored.cfg; true tracked.sh big.bin .env keys.py link.txt settings.txt ../outside.txt missing.py > out.txt # notes.txt';
  assert.deepEqual(commandWords('a "b c" d>e 2>&1 | f <g # h'), ['a', 'b c', 'd', '2', 'f', 'g']);
  const listed = await keepUntracked(localShell(dir, process.env as Record<string, string>), command, dir, null);
  // outside.txt is named by a path with .. too: kept as the command gave it (the link to it is left alone).
  assert.deepEqual(listed, { kept: ['controls/control.sh', 'ignored.cfg', '../outside.txt'], notKept: ['big.bin'] });
  // Five megabytes in all.
  const many = Array.from({ length: 7 }, (_, i) => `part${i}.dat`);
  for (const f of many) fs.writeFileSync(path.join(dir, f), Buffer.alloc(KEEP_FILE));
  const some = await keepUntracked(localShell(dir, process.env as Record<string, string>), `true ${many.join(' ')}`, dir, null);
  assert.deepEqual([some.kept.length, some.notKept.length], [5, 2]);
  assert.deepEqual(await keepUntracked(localShell(tmp, process.env as Record<string, string>), 'sh outside.txt', tmp, null), { kept: [], notKept: [] }, 'outside a repository: nothing');
  const step = ctxOf({ step: true, runId: 'flow-keep', key: 'acp:flow-keep', agent: 'acp' });
  const run = JSON.parse((await call('experiment_run', { command, cwd: dir, gpus: 0 }, step)).text);
  const words = 'Not in git, kept with the run: controls/control.sh, ignored.cfg, ../outside.txt. Not in git and too large to keep: big.bin';
  assert.equal(run.note, words);
  await until(ended(run.id), 20_000, 'the run');
  const r = getRun(db, run.id)!;
  assert.deepEqual([r.kept, r.notKept], [['controls/control.sh', 'ignored.cfg', '../outside.txt'], ['big.bin']]);
  assert.equal(fs.readFileSync(path.join(runFolder(r.id), 'untracked/controls/control.sh'), 'utf8'), fs.readFileSync(path.join(dir, 'controls/control.sh'), 'utf8'));
  assert.deepEqual(fs.readdirSync(path.join(runFolder(r.id), 'untracked')).sort(), ['controls', 'ignored.cfg', 'outside']);
  const got = JSON.parse((await call('experiment_get', { id: run.id }, step)).text);
  assert.equal(got.note, words);
  assert.equal(got.run.where, `local (this computer: ${os.hostname()})`, 'the tools call this computer "local"');
});

test('files outside the run’s folder are kept too: from a worktree by an absolute path, a path with .. or ~; not what git has, a system’s, a package’s or a secret', async () => {
  const base = path.join(tmp, 'away');
  const main = path.join(base, 'main');
  const wt = path.join(base, 'wt');
  const other = path.join(base, 'other');
  const home = path.join(base, 'home');
  const put = (file: string, text: string | Buffer = `echo ${path.basename(file)}\n`) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    return file;
  };
  const g = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=T', ...a], { cwd, stdio: 'pipe' });
  fs.mkdirSync(main, { recursive: true });
  g(main, 'init', '-q', '-b', 'main');
  const same = put(path.join(main, 'scripts/same.sh'), 'true\n');
  const changed = put(path.join(main, 'scripts/changed.sh'), 'true\n');
  g(main, 'add', '.');
  g(main, 'commit', '-q', '-m', 'first');
  g(main, 'worktree', 'add', '-q', '-b', 'try', wt);
  // The main checkout moves on: one file committed after the run's commit, one changed, one never in git.
  const later = put(path.join(main, 'scripts/later.sh'));
  g(main, 'add', 'scripts/later.sh');
  g(main, 'commit', '-q', '-m', 'later');
  fs.writeFileSync(changed, 'echo changed\n');
  const script = put(path.join(main, 'scripts/run.sh'), 'echo "acc=1"\n');
  put(path.join(home, 'helper.sh'));
  put(path.join(other, 'x.sh'));
  const twin = put(path.join(other, 'run.sh'), 'echo twin\n');
  const big = put(path.join(other, 'big.bin'), Buffer.alloc(KEEP_FILE + 1));
  put(path.join(other, 'venv/pyvenv.cfg'), 'home = /usr/bin\n');
  const left = [
    put(path.join(other, 'venv/bin/tool')),
    put(path.join(other, 'node_modules/pkg/cli.js')),
    put(path.join(other, 'lib/python3/site-packages/mod.py')),
    put(path.join(other, '.env'), 'A=1\n'),
    put(path.join(other, 'keys.py'), `KEY = "hf_${'a'.repeat(34)}"\n`),
    put(path.join(process.env.DATA_DIR!, 'private-notes.txt')),
    '/bin/sh',
    '/dev/null',
    '/etc/hostname',
  ];
  const command = `sh ${script} ${same} ${changed} ${later} ~/helper.sh ../other/x.sh --also=${twin} ${big} ${left.join(' ')} > ${path.join(other, 'x.sh')}.out`;
  const wanted = [script, changed, later, '~/helper.sh', '../other/x.sh', twin];
  const was = process.env.HOME;
  process.env.HOME = home;
  try {
    const sh = localShell(wt, process.env as Record<string, string>);
    assert.deepEqual(await keepUntracked(sh, command, wt, null), { kept: wanted, notKept: [big] });
    // From the main checkout itself: what it tracks is not copied (the patch has the changes), the untracked is.
    assert.deepEqual(await keepUntracked(localShell(path.join(main, 'scripts'), process.env as Record<string, string>), `sh ${same} ${changed} run.sh`, path.join(main, 'scripts'), null), { kept: ['run.sh'], notKept: [] });
    const step = ctxOf({ step: true, runId: 'flow-away', key: 'acp:flow-away', agent: 'acp' });
    const run = JSON.parse((await call('experiment_run', { command: `sh ${script} ${same} ../other/x.sh --also=${twin}`, cwd: wt, gpus: 0 }, step)).text);
    const words = `Not in git, kept with the run: ${script}, ../other/x.sh, ${twin}`;
    assert.equal(run.note, words);
    await until(ended(run.id), 20_000, 'the run');
    const r = getRun(db, run.id)!;
    assert.deepEqual([r.status, r.kept, r.notKept, r.untracked], ['done', [script, '../other/x.sh', twin], undefined, 0], r.why);
    const under = path.join(runFolder(r.id), 'untracked/outside');
    assert.deepEqual(fs.readdirSync(under).sort(), ['run-2.sh', 'run.sh', 'x.sh']);
    assert.equal(fs.readFileSync(path.join(under, 'run.sh'), 'utf8'), 'echo "acc=1"\n');
    assert.equal(fs.readFileSync(path.join(under, 'run-2.sh'), 'utf8'), 'echo twin\n');
    assert.equal(JSON.parse((await call('experiment_get', { id: r.id }, step)).text).note, words);
  } finally {
    process.env.HOME = was;
  }
});

test('scores of a run’s own: scores.jsonl in $HYDOR_RUN_DIR, {run} and $HYDOR_RUN_DIR in the files, and a sweep’s names and tags', async () => {
  const line = (n: string) => `echo "{\\"id\\": \\"${n}\\", \\"ndcg\\": 0.5}"`;
  const go = async (more: Record<string, unknown>) => {
    const r = await submit(deps, await cleanJob(db, { cwd: tmp, gpus: 0, ...more }));
    await until(ended(r.id), 20_000, 'the run');
    return getRun(db, r.id)!;
  };
  const unnamed = await go({ command: `${line('q1')} > "$HYDOR_RUN_DIR/scores.jsonl"` });
  assert.equal(unnamed.scores, true, unnamed.why);
  const none = await go({ command: 'true' });
  assert.ok(!none.scores);
  const byRun = await go({ command: `${line('q2')} > per-$HYDOR_RUN.jsonl; echo '{"step": 1, "seen": 7}' > m-$HYDOR_RUN.jsonl`, scoresFile: 'per-{run}.jsonl', metricsFile: 'm-{run}.jsonl' });
  assert.match(fs.readFileSync(path.join(runFolder(byRun.id), 'scores.jsonl'), 'utf8'), /q2/);
  assert.equal(byRun.metrics?.last.seen, 7);
  const own = await go({ command: `${line('q3')} > "$HYDOR_RUN_DIR/mine.jsonl"; echo '{"step": 1, "seen": 8}' > "$HYDOR_RUN_DIR/m.jsonl"`, scoresFile: '$HYDOR_RUN_DIR/mine.jsonl', metricsFile: '${HYDOR_RUN_DIR}/m.jsonl' });
  assert.match(fs.readFileSync(path.join(runFolder(own.id), 'scores.jsonl'), 'utf8'), /q3/);
  assert.equal(own.metrics?.last.seen, 8);
  assert.equal(runFile({ id: 'r1', params: { k: 2 }, seed: 3 }, '$HYDOR_RUN_DIR/{run}-{k}-{seed}.jsonl', '/own'), '/own/r1-2-3.jsonl');
  assert.equal(runFile({ id: 'r1' }, 'a/$HYDOR_RUN_DIR', '/own'), 'a/$HYDOR_RUN_DIR', 'only at the start');
  const step = ctxOf({ step: true, runId: 'flow-sw', key: 'acp:flow-sw', agent: 'acp' });
  const sw = JSON.parse((await call('experiment_sweep', { command: `echo "k={k}" > s-{k}.jsonl`, params: { k: [1, 2] }, group: 'named', cwd: tmp, gpus: 0, name: 'bm25 k={k}', tags: ['control'], scoresFile: 's-{k}.jsonl', metricsFile: 'none-{run}.jsonl' }, step)).text);
  await until(() => sw.runs.every((id: string) => ended(id)()), 20_000, 'the sweep');
  const runs = sw.runs.map((id: string) => getRun(db, id)!) as RunRecord[];
  assert.deepEqual(
    runs.map((r) => [r.name, r.tags, r.scoresFile, r.metricsFile, r.scores]),
    [1, 2].map((k) => [`bm25 k=${k}`, ['control'], 's-{k}.jsonl', 'none-{run}.jsonl', true]),
  );
  assert.match(fs.readFileSync(path.join(runFolder(runs[1].id), 'scores.jsonl'), 'utf8'), /k=2/);
});

test('experiment_wait after a restart waits only for what is left of its hours', async () => {
  const r = await submit(deps, await cleanJob(db, { command: 'sleep 20', cwd: tmp, gpus: 0 }));
  // The wait began two hours ago (before a restart): one hour asked for is over, so it gives up at once.
  db.prepare('insert into exp_waits (key, started_at) values (?, ?)').run('flow-x:abc', Date.now() - 2 * 3_600_000);
  const t0 = Date.now();
  const w = await waitRuns(deps, { ids: [r.id] }, { hours: 1, key: 'flow-x:abc' });
  assert.equal(w.ended, false);
  assert.ok(Date.now() - t0 < 2000);
  assert.ok(waitStarted(db, 'flow-x:abc') > t0 - 1000, 'a finished wait is forgotten');
  await http.inject({ method: 'POST', url: `/api/experiments/runs/${r.id}/stop`, payload: {} });
  await until(ended(r.id), 30_000, 'the stop');
});

test('the routes: a job’s mistakes in words, clusters added and refused, records deleted with their folder', async () => {
  const bad = await http.inject({ method: 'POST', url: '/api/experiments/jobs', payload: { command: '', cwd: tmp } });
  assert.equal(bad.statusCode, 400);
  assert.match(bad.json().error, /Give the command/);
  assert.equal((await http.inject({ method: 'POST', url: '/api/experiments/jobs', payload: { command: 'x', cwd: tmp, where: 'c:nope' } })).statusCode, 400);
  assert.equal((await http.inject({ method: 'POST', url: '/api/experiments/clusters', payload: { name: 'X', host: '-oProxyCommand=evil' } })).statusCode, 400);
  const c = (await http.inject({ method: 'POST', url: '/api/experiments/clusters', payload: { name: 'Lab GPUs', host: 'me@lab', kind: 'ssh' } })).json().cluster;
  assert.equal(c.id, 'lab-gpus');
  assert.equal(c.workdir, '~/hydor-runs');
  assert.equal((await http.inject({ method: 'GET', url: '/api/experiments/clusters' })).json().clusters.length, 2);
  assert.equal((await http.inject({ method: 'DELETE', url: `/api/experiments/clusters/${c.id}` })).json().ok, true);
  const r = await submit(deps, await cleanJob(db, { command: 'echo bye', cwd: tmp, gpus: 0 }));
  await until(ended(r.id), 20_000, 'it to end');
  assert.ok(fs.existsSync(runFolder(r.id)));
  assert.equal((await http.inject({ method: 'DELETE', url: `/api/experiments/runs/${r.id}` })).json().ok, true);
  assert.equal(getRun(db, r.id), null);
  assert.ok(!fs.existsSync(runFolder(r.id)), 'its folder went');
  assert.ok(fs.existsSync(tmp), 'the job’s own folder stays');
  const prev = (await http.inject({ method: 'POST', url: '/api/experiments/tables/preview', payload: { runs: ids, columns: ['acc'] } })).json().table;
  assert.equal(prev.id, 'preview');
  assert.equal((await http.inject({ method: 'GET', url: '/api/experiments/tables/preview' })).statusCode, 404, 'a preview is not kept');
  const groups = (await http.inject({ method: 'GET', url: '/api/experiments/groups' })).json().groups;
  assert.ok(groups.some((g: { name: string; runs: number }) => g.name === 'base' && g.runs === 3));
  const s = (await http.inject({ method: 'PUT', url: '/api/experiments/settings', payload: { cpuSlots: 3 } })).json();
  assert.equal(s.cpuSlots, 3);
  assert.equal((await http.inject({ method: 'PUT', url: '/api/experiments/settings', payload: { cpuSlots: 0 } })).statusCode, 400);
  assert.ok(
    told.some((e: any) => e.t === 'feature' && e.id === 'experiments'),
    'open pages hear of changes',
  );
});

// ---- the batch series, and what an experiment is -----------------------------------------------------------------------

test('the series of many runs in one call: local runs, bad ids ignored, unknown ones left out', async () => {
  saveSeries(db, 'rbat0001', { loss: [[1, 2], [2, 1]] });
  insertRun(db, { id: 'rbat0001', spec: { command: 'true', cwd: tmp }, status: 'done' });
  insertRun(db, { id: 'rbat0002', spec: { command: 'true', cwd: tmp }, status: 'done' });
  saveSeries(db, 'rbat0002', { acc: [[10, 0.5]] });
  // A copy of a run of a machine that is not connected: nothing to read there, so its series is empty.
  insertRun(db, { id: 'rbat0003', spec: { command: 'true', cwd: tmp }, status: 'done', info: { remote: { machine: 'gone', id: 'x1234' } } });
  const r = await http.inject({ method: 'GET', url: '/api/experiments/series?runs=rbat0001,rbat0002,,BAD!id,nosuchrun,rbat0001,rbat0003' });
  assert.equal(r.statusCode, 200);
  const { series } = r.json();
  assert.deepEqual(Object.keys(series).sort(), ['rbat0001', 'rbat0002', 'rbat0003']);
  assert.deepEqual(series.rbat0001.loss, [[1, 2], [2, 1]]);
  assert.deepEqual(series.rbat0002.acc, [[10, 0.5]]);
  assert.deepEqual(series.rbat0003, {});
  assert.deepEqual((await http.inject({ method: 'GET', url: '/api/experiments/series' })).json(), { series: {} });
  // ?runs=a&runs=b (an array) reads as ?runs=a,b.
  const arr = await http.inject({ method: 'GET', url: '/api/experiments/series?runs=rbat0001&runs=rbat0002' });
  assert.equal(arr.statusCode, 200);
  assert.deepEqual(Object.keys(arr.json().series).sort(), ['rbat0001', 'rbat0002']);
  // At most 100 ids are read.
  const many = Array.from({ length: 130 }, (_, i) => `rm${String(i).padStart(4, '0')}`);
  for (const id of many) insertRun(db, { id, spec: { command: 'true', cwd: tmp }, status: 'done' });
  const big = (await http.inject({ method: 'GET', url: `/api/experiments/series?runs=${many.join(',')}` })).json().series;
  assert.equal(Object.keys(big).length, 100);
  for (const id of many) deleteRunRow(id);
});
const deleteRunRow = (id: string) => db.prepare('delete from exp_runs where id = ?').run(id);

test('an experiment’s title, description and category: PUT keeps them as the user’s, GET lists them with the runs', async () => {
  const put = (payload: unknown) => http.inject({ method: 'PUT', url: '/api/experiments/groups', payload: payload as any });
  assert.equal((await put({ title: 'No name' })).statusCode, 400);
  assert.equal((await put({ name: 'base', title: 5 })).statusCode, 400);
  told.length = 0;
  const a = await put({ name: 'base', title: '  “Baseline\n  runs”  ', description: 'The reference.\n\n\n\nNo changes.', category: 'Retrieval' });
  assert.equal(a.statusCode, 200);
  assert.equal(a.json().group.title, 'Baseline runs', 'quotes gone, one line');
  assert.equal(a.json().group.description, 'The reference.\n\nNo changes.');
  assert.equal(a.json().group.by, 'user');
  assert.ok(told.some((e: any) => e.t === 'feature' && e.id === 'experiments' && e.data?.groups?.[0] === 'base'), 'pages hear of it');
  // Caps: 80, 500 and 40 characters.
  const b = (await put({ name: 'other', title: 'T'.repeat(200), description: 'd '.repeat(400), category: 'C'.repeat(90) })).json().group;
  assert.equal(b.title.length, 80);
  assert.ok(b.description.length <= 500 && b.description.length > 400);
  assert.equal(b.category.length, 40);
  // The name is cut to 120 characters; a user who clears all three leaves nothing kept.
  assert.equal((await put({ name: 'n'.repeat(200), title: 'Long' })).json().group.name.length, 120);
  db.prepare('delete from exp_groups where name = ?').run('n'.repeat(120));
  assert.ok(getInfo(db, 'other'));
  assert.ok(!('title' in (await put({ name: 'other', title: '', description: '', category: '' })).json().group));
  assert.equal(getInfo(db, 'other'), null, 'all three cleared: the row is gone, so the helper may write them');
  // The fields given replace; '' clears one; the rest stay.
  const c = (await put({ name: 'base', title: '', category: 'Ranking' })).json().group;
  assert.ok(!('title' in c));
  assert.equal(c.category, 'Ranking');
  assert.equal(c.description, 'The reference.\n\nNo changes.');
  assert.equal((await put({ name: 'base', category: 'Retrieval', title: 'Baseline runs' })).statusCode, 200);
  const groups = (await http.inject({ method: 'GET', url: '/api/experiments/groups' })).json().groups;
  const base = groups.find((g: { name: string }) => g.name === 'base');
  assert.deepEqual({ runs: base.runs, title: base.title, category: base.category, by: base.by }, { runs: 3, title: 'Baseline runs', category: 'Retrieval', by: 'user' });
  assert.ok(!('title' in groups.find((g: { name: string }) => g.name === 'ours')), 'one without info is listed as before');
});

test('the helper writes an experiment now: its runs and the categories in use are in the prompt, the answer is parsed and capped, a non-answer saves nothing', async () => {
  assert.deepEqual(firstObject('Sure: ```json\n{"a": "x}y", "b": {"c": 1}}\n``` bye'), { a: 'x}y', b: { c: 1 } });
  assert.equal(firstObject('no object here'), null);
  const prompts: { system: string; prompt: string; task?: string; model?: string }[] = [];
  let answer = '';
  enableExperimentDescriptions(async (_db, q) => {
    prompts.push(q);
    return answer;
  });
  describeTiming.soon = 30;
  describeTiming.retry = 60_000;
  const post = (name: string) => http.inject({ method: 'POST', url: '/api/experiments/groups/describe', payload: { name } });
  assert.equal((await post('no-such-group')).statusCode, 404);
  assert.equal((await http.inject({ method: 'POST', url: '/api/experiments/groups/describe', payload: {} })).statusCode, 400);
  // A group of runs with settings and metrics.
  for (let i = 0; i < 3; i++) doneRun(`tz${i}zzzz`, 'zeta-e7', i, { dev_nll: 3 - i, step_time: 1, acc: 0.5 }, { params: { lr: 0.001 * (i + 1) } });
  updateRun(db, 'tz0zzzz', { spec: { name: 'zeta-lr1', command: 'python train.py --lr 0.001 --data wiki ' + 'q'.repeat(400) } });
  answer = 'Here it is:\n```json\n{"title": "“Zeta pretraining (E7)”", "description": "' + 'It compares learning rates. '.repeat(40) + '", "category": "Language modelling"}\n```';
  const ok = await post('zeta-e7');
  assert.equal(ok.statusCode, 200, ok.body);
  const g = ok.json().group;
  assert.equal(g.title, 'Zeta pretraining (E7)');
  assert.equal(g.description.length <= 500, true);
  assert.equal(g.category, 'Language modelling');
  assert.equal(g.by, 'helper');
  assert.ok(!('runs' in g));
  assert.equal(getInfo(db, 'zeta-e7')!.runs, 3, 'its runs then are kept, for growth');
  const q = prompts.at(-1)!;
  assert.equal(q.task, 'describing an experiment');
  assert.match(q.system, /JSON/);
  assert.match(q.prompt, /The experiment: zeta-e7/);
  assert.match(q.prompt, /zeta-lr1 \(done\)/, 'a run’s name and status');
  assert.match(q.prompt, /settings: seed=0, lr=0\.001/);
  assert.match(q.prompt, /metrics: dev_nll, acc, step_time/, 'quality names first');
  assert.ok(q.prompt.includes('--data wiki ' + 'q'.repeat(150)) && !q.prompt.includes('q'.repeat(241)), 'a command is cut to 240 characters');
  assert.match(q.prompt, /Categories already in use: .*Retrieval/, 'the categories in use are given to reuse');
  assert.ok(q.prompt.includes(tmp), 'the runs’ folder');
  // Not JSON: nothing is saved (and the route says so); an answer of empty fields neither.
  doneRun('tn0nnnn', 'nojson', 1, { acc: 1 });
  answer = 'I am sorry, I cannot do that.';
  assert.equal((await post('nojson')).statusCode, 502);
  answer = '{"title": " ", "description": "", "category": 3}';
  assert.equal((await post('nojson')).statusCode, 502);
  assert.equal(getInfo(db, 'nojson'), null);
  // Without any run there is nothing to read; nothing is asked.
  const n = prompts.length;
  assert.equal(await describeGroup(deps, 'empty-group', {}), null);
  assert.equal(prompts.length, n);
  // Its own words are what the user asked for: the page's Write them again goes over a user's text, the helper by itself never does.
  assert.equal(getInfo(db, 'base')!.by, 'user');
  answer = '{"title": "Machine title"}';
  assert.equal(await describeGroup(deps, 'base', {}), null, 'never over the user’s text by itself');
  assert.equal(prompts.length, n);
  assert.equal(getInfo(db, 'base')!.title, 'Baseline runs');
  const again = (await post('base')).json().group;
  assert.equal(again.title, 'Machine title');
  assert.equal(again.description, 'The reference.\n\nNo changes.', 'what the answer left out stays');
  assert.equal(again.by, 'helper');
});

test('what the helper is shown has no secrets: tokens, keys, passwords in a command and among the settings are left out', () => {
  assert.equal(redactCommand('HF_TOKEN=hf_abc123 python train.py --lr 0.1'), 'HF_TOKEN=… python train.py --lr 0.1');
  assert.equal(redactCommand('CUDA_VISIBLE_DEVICES=0 API_KEY="a b c" MY_Secret=\'x y\' python t.py'), 'CUDA_VISIBLE_DEVICES=0 API_KEY=… MY_Secret=… python t.py');
  assert.equal(redactCommand('python t.py --api-key sk-123 --hf-token=hf_9 --password hunter2 --data wiki --epochs 3'), 'python t.py --api-key … --hf-token=… --password … --data wiki --epochs 3');
  assert.equal(redactCommand('python t.py --use-auth --lr 1 --Passwd "p q" -k abc'), 'python t.py --use-auth --lr 1 --Passwd … -k abc');
  assert.equal(redactCommand('export WANDB_API_KEY=abc && python t.py --lr=1e-3'), 'export WANDB_API_KEY=… && python t.py --lr=1e-3');
  assert.equal(redactSetting('lr', 0.1), '0.1');
  assert.equal(redactSetting('hf_token', 'hf_abc'), '…');
  assert.equal(redactSetting('Auth', 'x'), '…');
  assert.equal(redactSetting('pwd', 'x'), '…');
});

test('the helper’s prompt carries the redacted command and settings', async () => {
  let seen = '';
  enableExperimentDescriptions(async (_db, q) => {
    seen = q.prompt;
    return '{"title": "Secrets test"}';
  });
  doneRun('tsec0sec', 'redact-g', 1, { acc: 1 }, { params: { hf_token: 'hf_topsecret', lr: 0.5 } });
  updateRun(db, 'tsec0sec', { spec: { name: 'sec', command: 'API_KEY=sk-topsecret python t.py --password hunter2 --lr 0.5' } });
  const r = await http.inject({ method: 'POST', url: '/api/experiments/groups/describe', payload: { name: 'redact-g' } });
  assert.equal(r.statusCode, 200, r.body);
  assert.ok(!/topsecret|hunter2/.test(seen), seen);
  assert.match(seen, /command: API_KEY=… python t\.py --password … --lr 0\.5/);
  assert.match(seen, /hf_token=…, lr=0\.5|lr=0\.5, hf_token=…/);
});

test('deleting the last run of an experiment deletes its title and description too', async () => {
  doneRun('tdel0del', 'gone-g', 1, { acc: 1 });
  doneRun('tdel1del', 'gone-g', 2, { acc: 1 });
  await http.inject({ method: 'PUT', url: '/api/experiments/groups', payload: { name: 'gone-g', title: 'Soon gone' } });
  assert.equal((await http.inject({ method: 'DELETE', url: '/api/experiments/runs/tdel0del' })).statusCode, 200);
  assert.ok(getInfo(db, 'gone-g'), 'a run is left: it stays');
  assert.equal((await http.inject({ method: 'DELETE', url: '/api/experiments/runs/tdel1del' })).statusCode, 200);
  assert.equal(getInfo(db, 'gone-g'), null);
});

test('an experiment’s info is written by itself: once for a new group, again only when it has doubled, never over an agent’s or a user’s; a confidential one only by a local helper', async () => {
  const asked: string[] = [];
  let answer = '{"title": "Auto title", "description": "Auto.", "category": "Vision"}';
  enableExperimentDescriptions(async (_db, q) => {
    asked.push(/The experiment: (.*)/.exec(q.prompt)![1]);
    return answer;
  });
  const count = (g: string) => asked.filter((x) => x === g).length;
  const job = (group: string) => cleanJob(db, { command: 'true', cwd: tmp, gpus: 0, group });
  // Two runs submitted to a new group: it is written once, after the wait.
  const r1 = await submit(deps, await job('auto1'));
  const r2 = await submit(deps, await job('auto1'));
  assert.equal(count('auto1'), 0, 'not at once');
  await until(() => !!getInfo(db, 'auto1'), 20_000, 'the helper’s writing');
  assert.equal(count('auto1'), 1, 'once, not once per run');
  assert.deepEqual({ title: getInfo(db, 'auto1')!.title, by: getInfo(db, 'auto1')!.by, runs: getInfo(db, 'auto1')!.runs }, { title: 'Auto title', by: 'helper', runs: 2 });
  assert.ok(told.some((e: any) => e.t === 'feature' && e.data?.groups?.[0] === 'auto1'));
  // Another run: it has not doubled (and has under 4): nothing.
  const r3 = await submit(deps, await job('auto1'));
  await sleep(150);
  assert.equal(count('auto1'), 1);
  // Doubled and 4+ runs, but written under 6 hours ago: nothing; after that: again, once.
  doneRun('tg0gggg', 'auto1', 1, { acc: 1 });
  const r4 = await submit(deps, await job('auto1'));
  await sleep(150);
  assert.equal(count('auto1'), 1, 'not within 6 hours');
  db.prepare('update exp_groups set at = ? where name = ?').run(Date.now() - 7 * 3_600_000, 'auto1');
  const r5 = await submit(deps, await job('auto1'));
  await until(() => count('auto1') === 2, 20_000, 'the second writing');
  await sleep(150);
  assert.equal(count('auto1'), 2);
  assert.equal(getInfo(db, 'auto1')!.runs, listRuns(db, { group: 'auto1', limit: 100 }).length, 'what it has grown from is now');
  // An agent’s or a user’s text stays, even when the group has grown a lot.
  const own = await submit(deps, await job('auto2'));
  await until(() => !!getInfo(db, 'auto2'), 20_000, 'the first writing');
  db.prepare('update exp_groups set by = ?, at = ? where name = ?').run('agent', Date.now() - 7 * 3_600_000, 'auto2');
  for (let i = 0; i < 6; i++) doneRun(`th${i}hhhh`, 'auto2', i, { acc: 1 });
  const own2 = await submit(deps, await job('auto2'));
  await sleep(200);
  assert.equal(count('auto2'), 1);
  // One the agent describes before the helper does: the helper leaves it.
  const early = await submit(deps, await job('auto3'));
  const said = await call('experiment_describe', { group: 'auto3', title: 'By the agent' }, ctxOf());
  assert.ok(!said.isError, said.text);
  await sleep(200);
  assert.equal(count('auto3'), 0);
  assert.equal(getInfo(db, 'auto3')!.title, 'By the agent');
  // A helper that gives nothing usable: asked once, then left alone for a while.
  answer = 'no json';
  const bad1 = await submit(deps, await job('auto4'));
  await until(() => count('auto4') === 1, 20_000, 'the asking');
  await sleep(100);
  const bad2 = await submit(deps, await job('auto4'));
  await sleep(200);
  assert.equal(count('auto4'), 1);
  assert.equal(getInfo(db, 'auto4'), null);
  // A confidential session’s runs are read only by a helper on this computer: none here, so nothing is asked.
  answer = '{"title": "Secret"}';
  db.prepare("insert into app_sessions (key, agent, cwd) values ('claude:secret1', 'claude', ?)").run(tmp);
  setSessionExtra(db, 'claude:secret1', { ...CONFIDENTIAL_EXTRA });
  const sec = await submit(deps, { ...(await job('secret-g')), name: 'secret-run' }, { startedBy: { session: 'claude:secret1' } });
  await sleep(200);
  assert.equal(count('secret-g'), 0);
  assert.equal(await describeGroup(deps, 'secret-g', {}), null);
  await assert.rejects(describeGroup(deps, 'secret-g', { force: true }), /only a helper model on this computer/);
  assert.equal(getInfo(db, 'secret-g'), null);
  const forced = await http.inject({ method: 'POST', url: '/api/experiments/groups/describe', payload: { name: 'secret-g' } });
  assert.equal(forced.statusCode, 409);
  await until(() => [r1, r2, r3, r4, r5, own, own2, early, bad1, bad2, sec].every((r) => ended(r.id)()), 30_000, 'the runs');
});

test('experiment_describe: an agent’s title, description and category are kept as the agent’s; experiment_list tells each run’s experiment title', async () => {
  const none = await call('experiment_describe', { group: 'tools' }, ctxOf());
  assert.ok(none.isError && /at least one/.test(none.text));
  assert.ok((await call('experiment_describe', { title: 'x' }, ctxOf())).isError, 'the group is required');
  const first = JSON.parse((await call('experiment_describe', { group: 'tools', title: 'Tool runs', description: 'Runs the tools test starts.', category: 'Testing' }, ctxOf())).text);
  assert.deepEqual(first, { name: 'tools', title: 'Tool runs', description: 'Runs the tools test starts.', category: 'Testing', by: 'agent', at: first.at });
  const second = JSON.parse((await call('experiment_describe', { group: 'tools', description: 'Changed.', category: '' }, ctxOf())).text);
  assert.equal(second.title, 'Tool runs', 'the fields left out stay');
  assert.equal(second.description, 'Changed.');
  assert.ok(!('category' in second), 'an empty one clears');
  const list = JSON.parse((await call('experiment_list', { group: 'tools' }, ctxOf())).text);
  assert.ok(list.runs.length && list.runs.every((r: { experiment_title?: string }) => r.experiment_title === 'Tool runs'));
  const other = JSON.parse((await call('experiment_list', { group: 'base' }, ctxOf())).text);
  assert.ok(other.runs.every((r: { experiment_title?: string }) => r.experiment_title === 'Baseline runs' || r.experiment_title === 'Machine title'));
  const plain = JSON.parse((await call('experiment_list', { group: 'ours' }, ctxOf())).text);
  assert.ok(plain.runs.length && plain.runs.every((r: object) => !('experiment_title' in r)), 'no title, no field');
  assert.ok(experimentTools(ctxOf()).find((t) => t.name === 'experiment_describe')!.description.includes('title'));
});

// Last: it fixes the metrics of every ended run of the others above.
test('records made under the old rule are fixed once: from the series, or the log when at the cap', async () => {
  // At the cap: 100 one-off numbers kept, and the log has them and then the curves.
  const one: Record<string, number> = {};
  for (let i = 0; i < 120; i++) one[`k${i}`] = i;
  const id = 'rfix0001';
  insertRun(db, { id, spec: { command: 'true', cwd: tmp }, status: 'done', info: { folder: runFolder(id) } });
  fs.mkdirSync(runFolder(id), { recursive: true });
  let log = JSON.stringify(one) + '\n';
  for (let i = 1; i <= 30; i++) log += JSON.stringify({ step: i * 10, loss: 5 - i * 0.1, lr: 0.001 / i }) + '\n';
  fs.writeFileSync(path.join(runFolder(id), 'log.txt'), log);
  const kept = Object.fromEntries(Object.entries(one).slice(0, 100));
  updateRun(db, id, { metrics: { last: kept, best: kept }, logOffset: Buffer.byteLength(log), endedAt: Date.now() });
  saveSeries(db, id, Object.fromEntries(Object.entries(kept).map(([k, v]) => [k, [[1, v]] as [number, number][]])));
  // Under the cap: repeated comes from the series.
  const small = 'rfix0002';
  insertRun(db, { id: small, spec: { command: 'true', cwd: tmp }, status: 'done' });
  updateRun(db, small, { metrics: { last: { a: 2, b: 1 }, best: { a: 2, b: 1 } } });
  saveSeries(db, small, { a: [[1, 1], [2, 2]], b: [[1, 1]] });
  // Already fixed (has `repeated`) and one with no metrics: left alone.
  const fixed = 'rfix0003';
  insertRun(db, { id: fixed, spec: { command: 'true', cwd: tmp }, status: 'done' });
  updateRun(db, fixed, { metrics: { last: { a: 2 }, repeated: [] } });
  await repairEnded(deps);
  const m = getRun(db, id)!.metrics!;
  assert.deepEqual(m.repeated, ['loss', 'lr']);
  assert.equal(Object.keys(m.last).length, 100);
  assert.ok(m.last.loss === 2 && 'k0' in m.last && !('k99' in m.last));
  assert.equal(seriesOf(db, id).loss.length, 30);
  assert.ok(!('k99' in seriesOf(db, id)), 'the rows of what was given up are gone');
  assert.deepEqual(getRun(db, small)!.metrics!.repeated, ['a']);
  assert.deepEqual(getRun(db, fixed)!.metrics!.repeated, []);
  // Once: a second pass changes nothing.
  const before = JSON.stringify(getRun(db, id)!.metrics);
  await repairEnded(deps);
  assert.equal(JSON.stringify(getRun(db, id)!.metrics), before);
});

// ---- runs that wait for the night ------------------------------------------------------------------------------------

/** A time on the computer's own clock, in January 2026: each test takes days of its own. */
const at = (day: number, h: number, m = 0) => new Date(2026, 0, day, h, m).getTime();
let now = at(1, 12);
const setNight = (o: Record<string, unknown> = {}) => setSettings(db, { cpuSlots: 4, nightFrom: '23:00', nightTo: '07:00', nightEnds: 'finish', ...o });
/** The clock set by the test, the night's settings as given, and the notices forgotten. */
function nightTest(o: Record<string, unknown> = {}) {
  clock.now = () => now;
  setNight(o);
  forgetNotices();
  notices.length = 0;
}
const job = async (command: string, o: Record<string, unknown> = {}) => submit(deps, await cleanJob(db, { command, cwd: tmp, gpus: 0, ...o }));
const nightJob = (command: string, o: Record<string, unknown> = {}) => job(command, { when: 'night', ...o });
let gates = 0;
/** A command that goes on until the test opens its gate. */
function gate(before = '', after = 'echo acc=1') {
  const f = path.join(tmp, `gate-${++gates}`);
  return { command: `${before}while [ ! -f ${f} ]; do sleep 0.1; done; ${after}`, open: () => fs.writeFileSync(f, '') };
}
const status = (r: RunRecord) => getRun(db, r.id)!.status;
const why = (r: RunRecord) => getRun(db, r.id)!.why;
const mornings = () => notices.filter((n) => n.key === 'experiments:night');
const noticesOf = (r: RunRecord) => notices.filter((n) => n.key === `experiment:${r.id}`);
const stop = (r: RunRecord) => http.inject({ method: 'POST', url: `/api/experiments/runs/${r.id}/stop`, payload: {} });
async function steps(n = 3) {
  for (let i = 0; i < n; i++) {
    await tick();
    await sleep(60);
  }
}

test('night hours: the night an hour is in, across midnight; the settings and what is wrong with them in words', async () => {
  const h = { nightFrom: '23:00', nightTo: '07:00' };
  assert.equal(nightAt(at(5, 22, 59), h), null);
  assert.equal(nightAt(at(5, 23), h), '2026-01-05');
  assert.equal(nightAt(at(6, 3), h), '2026-01-05', 'the early hours belong to the evening before');
  assert.equal(nightAt(at(6, 6, 59), h), '2026-01-05');
  assert.equal(nightAt(at(6, 7), h), null);
  assert.equal(nightAt(new Date(2026, 1, 1, 2).getTime(), h), '2026-01-31', 'across a month');
  assert.equal(nightAt(at(5, 0, 59), { nightFrom: '01:00', nightTo: '05:00' }), null);
  assert.equal(nightAt(at(5, 1), { nightFrom: '01:00', nightTo: '05:00' }), '2026-01-05', 'a night after midnight');
  assert.equal(nightAt(at(5, 3), { nightFrom: '03:00', nightTo: '03:00' }), null, 'no night');
  // The hours are the person's, in their time zone: on a server whose clock is UTC, 04:30 UTC is 23:30 in New York.
  const utc = (day: number, hour: number, min = 0) => Date.UTC(2026, 0, day, hour, min);
  assert.equal(nightAt(utc(5, 4, 30), h, 'America/New_York'), '2026-01-04', '23:30 the evening before, there');
  assert.equal(nightAt(utc(5, 23, 30), h, 'America/New_York'), null, '18:30 there: still day');
  assert.equal(nightAt(utc(5, 11, 59), h, 'America/New_York'), '2026-01-04', '06:59 there');
  assert.equal(nightAt(utc(5, 12), h, 'America/New_York'), null, '07:00 there: the night is over');
  assert.equal(nightAt(utc(1, 3), h, 'Asia/Tokyo'), null, 'noon in Tokyo');
  assert.equal(nightAt(utc(1, 15), h, 'Asia/Tokyo'), '2026-01-01', 'midnight in Tokyo, the 2nd there already: the night that began on the 1st');
  assert.equal(nightAt(utc(5, 4, 30), h, 'Not/AZone'), nightAt(utc(5, 4, 30), h), 'a zone that is none: this computer’s clock');
  // What an agent is told beside "It will start tonight…": how long, whose hours, which code.
  assert.equal(tonightMore(h, { tz: 'America/New_York', at: utc(5, 19, 29) }), 'The hours are in America/New_York time. That is in about 9 hours. It runs the code as its folder has it when it starts, so leave that folder and its branch as they should run.');
  assert.match(tonightMore(h, { tz: 'America/New_York', at: utc(5, 4, 30) }), /^The hours are in America\/New_York time\. It is night now, so it starts as soon as nothing else waits\./);
  assert.match(tonightMore(h, { tz: 'America/New_York', at: utc(5, 3, 20) }), /That is in about 40 minutes\./);
  assert.equal(tonightMore({ nightFrom: '03:00', nightTo: '03:00' }), '');

  assert.equal(morningWords({ done: 5, failed: 1, stopped: 0, running: 0, waiting: 2 }), 'Last night: 5 runs done, 1 failed, 2 still wait for tonight');
  assert.equal(morningWords({ done: 1, failed: 0, stopped: 0, running: 1, waiting: 1 }), 'Last night: 1 run done, 1 still running, 1 still waits for tonight');
  assert.equal(morningWords({ done: 0, failed: 2, stopped: 1, running: 0, waiting: 0 }), 'Last night: 2 runs failed, 1 stopped');

  const get = async () => (await http.inject({ method: 'GET', url: '/api/experiments/settings' })).json();
  const put = async (payload: Record<string, unknown>) => http.inject({ method: 'PUT', url: '/api/experiments/settings', payload });
  const first = await get();
  assert.deepEqual([first.nightFrom, first.nightTo, first.nightEnds], ['23:00', '07:00', 'finish']);
  for (const [payload, words] of [
    [{ nightFrom: '25:00' }, /^Night from: a time on the 24-hour clock/],
    [{ nightTo: 'soon' }, /^Night to: a time/],
    [{ nightEnds: 'kill' }, /^When the night ends: "finish".*or "stop"/],
    [{}, /^Say what to change/],
    [{ nightFrom: '22:00', cpuSlots: 0 }, /number from 1 to 64/],
  ] as const) {
    const r = await put(payload);
    assert.equal(r.statusCode, 400, JSON.stringify(payload));
    assert.match(r.json().error, words);
  }
  assert.equal((await get()).nightFrom, '23:00', 'a mistake changes nothing');
  const set = (await put({ nightFrom: '7:30', nightEnds: 'stop' })).json();
  assert.deepEqual([set.nightFrom, set.nightTo, set.nightEnds, set.cpuSlots], ['07:30', '07:00', 'stop', first.cpuSlots]);
  setNight();
});

test('a night run waits by day with when it starts, and starts at night; every ordinary run goes first, whatever the priorities', async () => {
  assert.ok(!listRuns(db, { status: ['queued', 'waiting'], limit: 100 }).some((r) => (r.where ?? 'local') === 'local' && !r.remote), 'nothing waits from before');
  now = at(2, 14);
  nightTest({ cpuSlots: 1 });
  const gn = gate();
  const n = await nightJob(gn.command, { priority: 50 });
  await steps();
  assert.equal(status(n), 'waiting');
  assert.equal(why(n), 'Waits for the night (from 23:00)');
  assert.equal(getRun(db, n.id)!.when, 'night');
  // By day an ordinary run takes the one slot, and at night the next ordinary one still comes before the night run.
  const ga = gate();
  const gb = gate();
  const a = await job(ga.command);
  await until(() => status(a) === 'running', 20_000, 'the ordinary run by day');
  now = at(2, 23, 30);
  const b = await job(gb.command);
  await steps();
  assert.equal(status(b), 'waiting');
  assert.equal(why(n), NIGHT_BEHIND);
  ga.open();
  await until(() => status(b) === 'running', 20_000, 'the ordinary run to take the slot');
  await steps();
  assert.equal(status(n), 'waiting');
  assert.match(why(n)!, /^Waiting for one of your runs without a GPU to end/, 'no ordinary run waits now: it waits as any run does');
  gb.open();
  await until(() => status(n) === 'running', 20_000, 'the night run');
  gn.open();
  await until(ended(n.id), 20_000, 'it to end');
  // An ordinary run that waits for a GPU holds back the night runs that want a GPU too, and not one that needs none:
  // a run stuck waiting for a card that never frees does not keep the night's processor-only runs from starting.
  setNight();
  const big = await job('echo big', { gpus: 1, gpuMemGb: 1000 });
  const held = await nightJob('echo held', { gpus: 1, gpuMemGb: 1 });
  const free = await nightJob('echo free');
  await steps();
  assert.equal(status(big), 'waiting');
  assert.equal(why(held), NIGHT_BEHIND);
  await until(ended(free.id), 20_000, 'the night run that needs no GPU');
  await stop(big);
  await until(() => why(held) !== NIGHT_BEHIND, 20_000, 'the night run with a GPU, the other gone');
  await stop(held);
  now = at(3, 7);
  await steps();
});

test('from equal to to is no night: night runs wait and say so; a night that crosses midnight is still on at 03:00', async () => {
  now = at(4, 3);
  nightTest({ nightFrom: '23:00', nightTo: '23:00' });
  const r = await nightJob('echo late');
  await steps();
  assert.equal(status(r), 'waiting');
  assert.equal(why(r), 'Waits for the night: none is set. Give Night two different times in Where runs go');
  setNight();
  await until(ended(r.id), 20_000, 'it to run once there is a night');
  assert.equal(status(r), 'done');
  assert.deepEqual(getRun(db, r.id)!.nights, ['2026-01-03'], 'the night that began the evening before');
  now = at(4, 7);
  await steps();
});

test('the night ends with "let running ones finish": it runs on; no "done" notice for what the morning tells; one morning notice, once', async () => {
  now = at(10, 23, 30);
  nightTest();
  const ok = await nightJob('echo acc=0.9');
  const bad = await nightJob('exit 3');
  const g = gate();
  const long = await nightJob(g.command);
  const plain = await job('echo ordinary');
  await until(() => [ok, bad, plain].every((r) => ended(r.id)()) && status(long) === 'running', 20_000, 'the night’s runs');
  assert.equal(noticesOf(ok).length, 0, 'told in the morning, not on its own');
  assert.equal(noticesOf(plain)[0]?.kind, 'done', 'an ordinary run is told as ever');
  assert.equal(noticesOf(bad)[0]?.kind, 'failed', 'a failure is told as ever');
  assert.equal(mornings().length, 0, 'not before the night ends');
  now = at(11, 7);
  await steps();
  assert.equal(status(long), 'running');
  assert.equal(getRun(db, long.id)!.stopping, undefined);
  assert.equal(mornings().length, 1);
  assert.equal(mornings()[0].body, 'Last night: 1 run done, 1 failed, 1 still running');
  assert.equal(mornings()[0].title, 'Experiments');
  assert.equal(mornings()[0].url, '/experiments?night=2026-01-10');
  const of = (await http.inject({ method: 'GET', url: '/api/experiments/runs?night=2026-01-10&everywhere=1' })).json().runs as RunRecord[];
  assert.deepEqual(of.map((r) => r.id).sort(), [ok.id, bad.id, long.id].sort(), 'the night’s runs, which the notice opens');
  now = at(11, 15);
  await steps();
  assert.equal(mornings().length, 1, 'once');
  g.open();
  await until(ended(long.id), 20_000, 'it to finish by day');
  assert.equal(noticesOf(long)[0]?.kind, 'done', 'what ends after the morning is told on its own');
});

test('the night ends with "stop": stopped, waiting again, and started from the beginning the next night', async () => {
  now = at(12, 23, 30);
  nightTest({ nightEnds: 'stop' });
  const g = gate('echo start; echo loss=2; ', 'echo acc=1');
  const r = await nightJob(g.command, { report: true });
  const log = () => fs.readFileSync(path.join(runFolder(r.id), 'log.txt'), 'utf8');
  await until(() => status(r) === 'running' && getRun(db, r.id)!.metrics?.last.loss === 2, 30_000, 'it to run and print');
  // The app restarts in the night, and is back when it has ended: the night is still closed properly.
  forgetLive();
  now = at(13, 7, 30);
  await until(() => status(r) === 'waiting', 40_000, 'it to be stopped and wait again');
  const x = getRunWithEvents(db, r.id)!;
  assert.equal(x.why, NIGHT_AGAIN);
  assert.equal(x.why, 'The night ended: it starts again tonight');
  assert.deepEqual([x.startedAt, x.endedAt, x.metrics, x.gpuIds, x.stopping, x.exitCode, x.nightStop], [undefined, undefined, undefined, undefined, undefined, undefined, undefined]);
  assert.deepEqual(seriesOf(db, r.id), {});
  assert.ok(x.events!.some((e) => e.kind === 'waiting' && e.text === NIGHT_AGAIN));
  assert.ok(!x.events!.some((e) => e.kind === 'crash' || e.kind === 'failed' || e.kind === 'stopped'), 'not a failure, nor an end');
  assert.equal(noticesOf(r).length, 0);
  assert.equal(mornings().length, 1);
  assert.equal(mornings()[0].body, 'Last night: 1 run still waits for tonight');
  now = at(13, 14);
  await steps();
  assert.equal(status(r), 'waiting', 'not by day');
  assert.equal(why(r), NIGHT_AGAIN, 'it keeps saying why');
  now = at(13, 23);
  await until(() => status(r) === 'running' && getRun(db, r.id)!.metrics?.last.loss === 2, 40_000, 'it to start again');
  assert.equal(log().match(/^start$/gm)?.length, 1, 'from the beginning, with a log of its own');
  assert.ok(fs.readdirSync(runFolder(r.id)).some((f) => /^log-before-\d+\.txt$/.test(f)), 'the first night’s log is kept');
  g.open();
  await until(ended(r.id), 20_000, 'it to end');
  assert.equal(status(r), 'done');
  assert.equal(getRun(db, r.id)!.metrics!.last.acc, 1);
  assert.deepEqual(getRun(db, r.id)!.nights, ['2026-01-12', '2026-01-13']);
  assert.equal(noticesOf(r).length, 0);
  now = at(14, 7);
  await steps();
  assert.equal(mornings().length, 2);
  assert.equal(mornings()[1].body, 'Last night: 1 run done');
});

test('a sweep of night runs waits whole, and is told by the morning rather than by itself', async () => {
  now = at(15, 12);
  nightTest();
  const s = (await http.inject({ method: 'POST', url: '/api/experiments/sweeps', payload: { command: 'echo acc={a}', params: { a: [1, 2] }, group: 'night sweep', cwd: tmp, gpus: 0, when: 'night' } })).json();
  const runs = s.runs as RunRecord[];
  assert.ok(runs.length === 2 && runs.every((r) => r.when === 'night'));
  await steps();
  assert.ok(runs.every((r) => status(r) === 'waiting' && why(r) === 'Waits for the night (from 23:00)'));
  now = at(15, 23);
  await until(() => runs.every((r) => ended(r.id)()), 20_000, 'the sweep');
  await steps();
  assert.equal(notices.length, 0, 'no notice of the sweep’s own');
  now = at(16, 7);
  await steps();
  assert.deepEqual(
    notices.map((n) => n.body),
    ['Last night: 2 runs done'],
  );
});

test('no morning notice when nothing ran and nothing waits: no night runs, or only one you stopped', async () => {
  now = at(20, 23, 30);
  nightTest();
  const plain = await job('echo ordinary');
  await until(ended(plain.id), 20_000, 'the ordinary one');
  now = at(21, 7);
  await steps();
  assert.equal(mornings().length, 0);
  now = at(21, 23, 30);
  const g = gate();
  const r = await nightJob(g.command);
  await until(() => status(r) === 'running', 20_000, 'it to run');
  await stop(r);
  await until(ended(r.id), 40_000, 'it to stop');
  now = at(22, 7);
  await steps();
  assert.equal(mornings().length, 0);
});

test('hours changed so another night begins on the same date: it has its own morning, of what ended in it', async () => {
  // A night after midnight is over by 06:00; the hours then change so that tonight begins on the same date.
  now = at(26, 1);
  nightTest({ nightFrom: '00:00', nightTo: '06:00' });
  const a = await nightJob('echo a');
  await until(ended(a.id), 20_000, 'the first night’s run');
  now = at(26, 6);
  await steps();
  assert.deepEqual(
    mornings().map((n) => n.body),
    ['Last night: 1 run done'],
  );
  await sleep(20);
  setNight({ nightFrom: '22:00', nightTo: '06:00' });
  now = at(26, 22);
  const b = await nightJob('echo b');
  const c = await nightJob('echo c');
  await until(() => [b, c].every((r) => ended(r.id)()), 20_000, 'the second night’s runs');
  assert.equal(noticesOf(b).length, 0);
  now = at(27, 6);
  await steps();
  assert.deepEqual(
    mornings().map((n) => n.body),
    ['Last night: 1 run done', 'Last night: 2 runs done'],
  );
});

test('the morning does not count runs that score an evaluation; what else worked says its own sentence in the one notice', async () => {
  const evolves = morningAlso.of;
  const scoring = () => nightJob('echo s=1', { tags: ['evaluation'], env: { HYDOR_EVALUATION: 'e1none' } });
  let also = [
    { line: 'The search “one” tried 3 more versions and found nothing better than its best so far', url: '/experiments?evolution=v1one' },
    { line: 'The search “two” tried 1 more version and found nothing better than its best so far', url: '/experiments?evolution=v1two' },
  ];
  let since = 0;
  morningAlso.of = (_db, from) => ((since = from), also);
  try {
    // Scores alone: nothing of the runs, and the notice opens the first search.
    now = at(28, 23);
    nightTest();
    const s = await scoring();
    await until(ended(s.id), 20_000, 'the score’s run');
    now = at(29, 7);
    await steps();
    assert.deepEqual(
      mornings().map((n) => [n.body, n.url, n.kind]),
      [[`${also[0].line}. ${also[1].line}`, '/experiments?evolution=v1one', 'done']],
    );
    assert.ok(since > 0 && since <= Date.now(), 'asked for what worked since the night was first watched');

    // Runs beside them: one notice, the runs first, and it opens the night's runs.
    now = at(29, 23);
    notices.length = 0;
    also = also.slice(0, 1);
    const s2 = await scoring();
    const r = await nightJob('echo mine');
    await until(() => [s2, r].every((x) => ended(x.id)()), 20_000, 'both');
    now = at(30, 7);
    await steps();
    assert.deepEqual(
      mornings().map((n) => [n.body, n.url]),
      [[`Last night: 1 run done. ${also[0].line}`, '/experiments?night=2026-01-29']],
    );

    // Nothing else worked, or telling of it fails: as ever, and nothing for scores alone.
    notices.length = 0;
    morningAlso.of = () => {
      throw new Error('no');
    };
    now = at(30, 23);
    const s3 = await scoring();
    await until(ended(s3.id), 20_000, 'the score’s run');
    now = at(31, 7);
    await steps();
    assert.equal(mornings().length, 0);
  } finally {
    morningAlso.of = evolves;
  }
});

test('a cluster refuses a night run in words; run again keeps when; the tools’ card says when it starts', async () => {
  now = at(23, 14);
  nightTest();
  const c = saveCluster(db, { name: 'Night cluster', host: 'nightly', kind: 'ssh' });
  await assert.rejects(cleanJob(db, { command: 'x', cwd: '/data', where: `c:${c.id}`, when: 'night' }), /A run on a cluster cannot wait for the night: the cluster has its own queue/);
  const refused = await http.inject({ method: 'POST', url: '/api/experiments/jobs', payload: { command: 'x', where: `c:${c.id}`, when: 'night' } });
  assert.equal(refused.statusCode, 400);
  assert.match(refused.json().error, /cannot wait for the night/);
  await assert.rejects(cleanJob(db, { command: 'x', cwd: tmp, when: 'later' }), /when: "night"/);
  assert.equal((await cleanJob(db, { command: 'x', cwd: tmp, when: 'now' })).when, undefined);

  const first = await nightJob('echo hi');
  const again = (await http.inject({ method: 'POST', url: `/api/experiments/runs/${first.id}/again`, payload: {} })).json().run as RunRecord;
  assert.equal(again.when, 'night', 'run again keeps it');
  const atOnce = (await http.inject({ method: 'POST', url: `/api/experiments/runs/${first.id}/again`, payload: { when: 'now' } })).json().run as RunRecord;
  assert.equal(atOnce.when, undefined);
  await until(ended(atOnce.id), 20_000, 'the one run at once');
  assert.equal(status(again), 'waiting');

  sessions.mode = 'default';
  sessions.answer = 'accept';
  const ctx = ctxOf({ key: 'claude:night' });
  const sentence = 'It will start tonight, between 23:00 and 07:00';
  const props = toolOf('experiment_run', ctx).inputSchema as any;
  assert.deepEqual(props.properties.when.enum, ['night', 'now']);
  assert.ok((toolOf('experiment_sweep', ctx).inputSchema as any).properties.when);
  const out = JSON.parse((await call('experiment_run', { command: 'echo tool', gpus: 0, when: 'night' }, ctx)).text);
  assert.ok(sessions.cards.at(-1)!.detail!.includes(sentence), sessions.cards.at(-1)!.detail);
  assert.deepEqual([out.when, out.starts], ['night', sentence]);
  const rerun = JSON.parse((await call('experiment_run', { again: out.id }, ctx)).text);
  assert.ok(sessions.cards.at(-1)!.detail!.includes(sentence));
  assert.equal(getRun(db, rerun.id)!.when, 'night');
  await call('experiment_run', { again: out.id, when: 'now' }, ctx);
  assert.ok(!sessions.cards.at(-1)!.detail!.includes('tonight'));
  const sweep = JSON.parse((await call('experiment_sweep', { command: 'echo {a}', params: { a: [1] }, group: 'tool night', gpus: 0, when: 'night' }, ctx)).text);
  assert.ok(sessions.cards.at(-1)!.detail!.includes(sentence));
  assert.equal(sweep.starts, sentence);
  const cards = sessions.cards.length;
  for (const [name, a] of [
    ['experiment_run', { command: 'x', where: `c:${c.id}`, when: 'night' }],
    ['experiment_sweep', { command: 'echo {a}', params: { a: [1] }, group: 'g', where: `c:${c.id}`, when: 'night' }],
    ['experiment_run', { again: out.id, where: `c:${c.id}` }],
  ] as const) {
    const no = await call(name, a, ctx);
    assert.ok(no.isError && /cannot wait for the night/.test(no.text), no.text);
  }
  assert.equal(sessions.cards.length, cards, 'refused before anyone is asked');
  const listed = JSON.parse((await call('experiment_list', { group: 'tool night' }, ctx)).text);
  assert.equal(listed.runs[0].when, 'night');
  assert.match(SPAWN_NOTE, /go to the night with when: "night"/);
  assert.match(SPAWN_NOTE, /what you need them to decide, as choices/);
  for (const r of listRuns(db, { status: ['queued', 'waiting'], limit: 100 }).filter((r) => r.when === 'night')) await stop(r);
  await http.inject({ method: 'DELETE', url: `/api/experiments/clusters/${c.id}` });
});

test('another machine keeps when, for its own night; one from before night runs is not left to run by day', async () => {
  nightTest();
  const calls: { method: string; p: string; body?: any }[] = [];
  let knows = true;
  let kept: RunRecord | null = null;
  const lab = {
    def: { name: 'Lab box' },
    async call<T>(method: string, p: string, _t?: number, body?: any): Promise<T> {
      calls.push({ method, p, body });
      if (method === 'POST' && p === '/api/experiments/jobs') {
        const { when, ...rest } = body;
        kept = { ...rest, ...(knows ? { when } : {}), id: `rlabn00${calls.length}`, status: 'waiting', why: 'Waits for the night (from 22:00)', createdAt: Date.now(), name: 'train.py' };
        return { run: kept } as T;
      }
      return { run: kept } as T;
    },
  };
  useMachines({ list: () => [{ id: 'lab', name: 'Lab box', via: 'url', status: { state: 'online', waiting: 0, working: 0 } }], get: () => lab } as any);
  const r = await submit(deps, await cleanJob(db, { command: 'python train.py', cwd: '/data/code', where: 'm:lab', gpus: 1, when: 'night' }));
  assert.equal(calls[0].body.when, 'night');
  assert.equal(r.when, 'night');
  assert.equal(r.why, 'Waits for the night (from 22:00)', 'that machine’s night');
  const sessionCtx = ctxOf({ key: 'claude:nightlab' });
  await call('experiment_run', { command: 'python train.py', where: 'm:lab', cwd: '/data/code', gpus: 1, when: 'night' }, sessionCtx);
  assert.ok(sessions.cards.at(-1)!.detail!.includes('It will start tonight, in the night hours set on Lab box'));
  const before = listRuns(db, { limit: 5000 }).length;
  knows = false;
  await assert.rejects(submit(deps, await cleanJob(db, { command: 'python train.py', cwd: '/data/code', where: 'm:lab', gpus: 1, when: 'night' })), /Lab box runs an older Hydor that does not know night runs/);
  assert.ok(calls.at(-1)!.p.endsWith('/stop'), 'stopped there');
  assert.equal(listRuns(db, { limit: 5000 }).length, before, 'nothing kept here');
  for (const x of listRuns(db, { status: ['queued', 'waiting'], limit: 100 }).filter((x) => x.remote)) updateRun(db, x.id, { status: 'stopped' });
  useMachines({
    list: () => [],
    get: () => {
      throw new HttpError(404, 'no');
    },
  } as any);
  now = Date.now();
  clock.now = () => Date.now();
  setNight();
});

// ---- run ------------------------------------------------------------------------------------------------------------------

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
await stopTmuxServer().catch(() => {});
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failedTests} failed`);
process.exit(failedTests ? 1 : 0);
