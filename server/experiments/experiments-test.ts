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
// and experiment_wait; the routes.
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
import { betterOf, tableMarks, type RunRecord } from '../../shared/experiments.ts';
import type { NotifyEvent } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import type { CreateOpts } from '../sessions.ts';
import { captureGit, localShell, pythonOf } from './capture.ts';
import { endOfSlurm, parseSacct, parseSbatch, parseSqueue, reasonWords, saveCluster, sbatchScript, setSsh, type Ssh } from './clusters.ts';
import { chooseGpus, parseGpus, setGpuReader } from './gpus.ts';
import { experiments } from './index.ts';
import { stopTmuxServer } from './local.ts';
import { nanText, oomText, parseLine, Tracker } from './metrics.ts';
import { cleanJob, forgetLive, forgetNotices, onCallBrief, submit, tick, timing, useDeps, waitRuns } from './queue.ts';
import { addEvent, getRun, getRunWithEvents, getTable, insertRun, listRuns, recomputeTable, runFolder, saveTable, updateRun, waitStarted, workOut } from './records.ts';
import { useMachines } from './remote.ts';
import { holm, lgamma, pairedBootstrap, pairedT, tTwoSided, welch } from './stats.ts';
import { earlyStop, expandSweep, fillCommand, paramsOf, placeholders, shellWords } from './sweeps.ts';
import { insertTable, makeTable, parseScores } from './tables.ts';
import { experimentTools } from './tools.ts';

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
    return this.live.has(key) ? ({ key, title: key, live: { status: this.live.get(key) } } as any) : key.startsWith('claude:') ? ({ key, title: key, live: null } as any) : null;
  }
  async create(o: CreateOpts) {
    this.created.push(o);
    const key = `claude:oncall${this.created.length}`;
    this.live.set(key, 'working');
    return key;
  }
  async deliverOrQueue(key: string, text: string) {
    this.delivered.push({ key, text });
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
  assert.deepEqual(holm([0.01, 0.04, 0.03, 0.005]).map((p) => Math.round(p! * 1e6) / 1e6), [0.03, 0.06, 0.06, 0.02]);
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
  assert.deepEqual(t.snapshot(), { last: { loss: 0.7, acc: 0.6 }, best: { loss: 0.5, acc: 0.7 }, step: 3 });
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
  assert.deepEqual(x.metrics, { last: { loss: 0.4, acc: 0.8 }, best: { loss: 0.4, acc: 0.8 }, step: 2 });
  const log = fs.readFileSync(path.join(runFolder(r.id), 'log.txt'), 'utf8');
  assert.match(log, new RegExp(`hello from ${r.id} on \\[\\]`), 'its id in the environment, and no GPU for a job without one');
  assert.ok(fs.existsSync(path.join(runFolder(r.id), 'metrics.json')));
  assert.deepEqual(
    x.events!.map((e) => e.kind),
    ['queued', 'started', 'done'],
  );
  assert.equal(notices.length, 1);
  assert.match(notices[0].body, /^Done in under a minute: loss 0\.4, acc 0\.8$/);
  assert.equal(notices[0].url, `/system/experiments/${r.id}`);
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
  assert.equal(listRuns(db, { cwd: tmp }).some((y) => y.id === r.id), true, 'a run under a folder is listed for it');
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
  assert.ok(x.events!.some((e) => e.kind === 'crash'), 'a dead process is one the agent on call watches for');
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
  assert.ok(t.markdown.endsWith('† Better than base at p < 0.05 (Welch\'s t-test over 3 seeds, Holm-corrected).'));
  const csv = t.csv.split('\n');
  assert.equal(csv[0], 'row,label,acc_mean,acc_std,acc_n,acc_p,acc_p_holm,acc_significant,loss_mean,loss_std,loss_n,loss_p,loss_p_holm,loss_significant');
  assert.ok(csv[2].startsWith('ours,ours,83.3666666666666'), csv[2]);
  assert.deepEqual(tableMarks(`a\n% hydor:table tabc1234\nb\n  % hydor:table tx9\n`), ['tabc1234']);
});

test('tests pick themselves: paired over seeds when the rows share seeds, over examples when runs kept scores', () => {
  const t = workOut(db, { runs: ids, columns: cols }, 'tpair001');
  close(t.rows[1].cells[0].pAdj, 2 * 0.014812204724617634, 1e-8, 'paired acc, Holm');
  close(t.rows[1].cells[1].pAdj, 2 * 0.09378311079558353, 1e-8, 'paired loss, Holm');
  assert.equal(t.rows[1].cells[1].significant, false);
  assert.deepEqual(t.tests, ['paired t-test over 3 seeds', 'paired t-test over 3 seeds']);
  // Per-example scores: JSON lines, or trec_eval -q's lines.
  const scores = parseScores('{"id": "q1", "ndcg": 0.5}\n{"qid": "q2", "ndcg": 0.6}\nndcg q3 0.4\nndcg all 0.5\n');
  assert.deepEqual([...scores.get('ndcg')!.entries()], [
    ['q1', 0.5],
    ['q2', 0.6],
    ['q3', 0.4],
  ]);
  const base = [0.5, 0.6, 0.4, 0.7, 0.55, 0.65, 0.45, 0.35];
  const ours = [0.55, 0.62, 0.48, 0.71, 0.6, 0.7, 0.44, 0.42];
  const runs: RunRecord[] = [base, ours].map((xs, i) => ({ id: `ex${i}xxxx`, status: 'done', createdAt: i, command: 'x', cwd: tmp, group: i ? 'ours' : 'bm25', metrics: { last: { ndcg: xs.reduce((a, b) => a + b) / xs.length } }, scores: true, folder: `/s${i}` }));
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

test('rows by a setting, labels, runs not ended left out; recompute after a run changes', () => {
  doneRun('tlr1aaaa', 'lr', 1, { acc: 0.7 }, { params: { lr: 0.001 } });
  doneRun('tlr2aaaa', 'lr', 2, { acc: 0.72 }, { params: { lr: 0.001 } });
  doneRun('tlr3aaaa', 'lr', 1, { acc: 0.8 }, { params: { lr: 0.0003 } });
  insertRun(db, { id: 'tlr4aaaa', spec: { command: 'x', cwd: tmp, group: 'lr', params: { lr: 0.01 } }, status: 'running' });
  const spec = { group: 'lr', rows: 'param:lr' as const, columns: [{ metric: 'acc', better: 'max' as const }], labels: { '0.0003': 'Ours' }, test: 'none' as const };
  const t = workOut(db, spec, 'tlr00001');
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
  const others = [s([[100, 0.5], [200, 0.4]]), s([[100, 0.6], [200, 0.45]]), s([[100, 0.55], [200, 0.42], [300, 0.4]])];
  assert.deepEqual(earlyStop(s([[50, 0.9], [100, 0.8], [200, 0.7]]), others, { metric: 'loss', better: 'min' }), { stop: true, step: 200, value: 0.7, median: 0.42, others: 3 });
  assert.deepEqual(earlyStop(s([[50, 0.5], [100, 0.45], [200, 0.41]]), others, { metric: 'loss', better: 'min' }), { stop: false });
  assert.deepEqual(earlyStop(s([[50, 0.9], [100, 0.8], [200, 0.7]]), others, { metric: 'loss', better: 'min', afterSteps: 500 }), { stop: false }, 'not before afterSteps');
  assert.deepEqual(earlyStop(s([[50, 0.9], [100, 0.8], [400, 0.7]]), others, { metric: 'loss', better: 'min' }), { stop: false }, 'the others have not got there');
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
  assert.equal(notices.length, 1, 'one notice for the whole sweep');
  assert.match(notices[0].body, /^2 done\. Best loss 0\.25: lr=0\.25\.$/);
  assert.equal(notices[0].title, 'Sweep sw');
  const got = (await http.inject({ method: 'GET', url: `/api/experiments/sweeps/${res.sweep.id}` })).json();
  assert.equal(got.runs.length, 2);
});

// ---- SLURM and plain SSH clusters ------------------------------------------------------------------------------------------

test('SLURM: the batch script, and reading sbatch, squeue and sacct', () => {
  const c = { id: 'u', name: 'Unity', host: 'unity', kind: 'slurm' as const, workdir: '~/runs', setup: 'module load cuda/12.1\nsource ~/venv/bin/activate', partition: 'gpu', account: 'lab' };
  const s = sbatchScript({ run: { id: 'r1', name: 'BERT base', gpus: 2, cpus: 8, memGb: 32, hours: 2.5 }, cluster: c, dir: '/home/u/runs/r1', cwd: '~/code/bert', env: { HYDOR_RUN: 'r1', A: "it's" } });
  for (const l of ['#SBATCH --job-name=hydor-bert-base', '#SBATCH --output=/home/u/runs/r1/log.txt', '#SBATCH --gres=gpu:2', '#SBATCH --cpus-per-task=8', '#SBATCH --mem=32G', '#SBATCH --time=150', '#SBATCH --partition=gpu', '#SBATCH --account=lab', 'module load cuda/12.1', "cd -- ~/'code/bert' ||", "export A='it'\\''s'", "bash '/home/u/runs/r1/command.sh'", "echo $code > '/home/u/runs/r1/exit'"])
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
  await until(() => getRun(db, r.id)!.metrics?.last?.loss === 1.5 || fs.existsSync(path.join(runFolder(r.id), 'log.txt')) && fs.readFileSync(path.join(runFolder(r.id), 'log.txt'), 'utf8').includes('loss=1.5'), 60_000, 'its log');
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
  useMachines({ list: () => [{ id: 'lab', name: 'Lab box', via: 'url', status: { state: 'online', waiting: 0, working: 0 } }], get: (id: string) => (id === 'lab' ? lab : (() => { throw new HttpError(404, 'no'); })()) } as any);
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
  assert.ok(all.some((x) => x.id === 'rlab0002' && x.machine?.name === 'Lab box'), 'its own runs, marked with where they run');
  assert.ok(!all.some((x) => x.id === 'rlab0001'), 'a run copied here is listed once');
  await http.inject({ method: 'POST', url: `/api/experiments/runs/${r.id}/stop`, payload: {} });
  assert.equal(getRun(db, r.id)!.status, 'stopped');
  useMachines({ list: () => [], get: () => { throw new HttpError(404, 'no'); } } as any);
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
    ['experiment_run', 'experiment_sweep', 'experiment_list', 'experiment_get', 'experiment_stop', 'experiment_table', 'experiment_wait'],
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
  assert.ok(sessions.delivered.some((x) => x.key === 'claude:s1' && x.text.includes(`(${ok.id}) ended. Done in`)), 'report: the session hears how it went');
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
  assert.ok(told.some((e: any) => e.t === 'feature' && e.id === 'experiments'), 'open pages hear of changes');
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
