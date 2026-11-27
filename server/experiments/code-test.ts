// Checks for the code a run is queued with (code.ts): in scratch git repositories, runs of tiny shell commands
// through the queue (tmux, no GPU). The same folder runs in place, with no copy; a tracked file, a kept untracked
// file or a new commit of other content changed means a copy of the code as queued (the commit, the patch, the kept
// files, a subfolder as the working folder, everything git does not track linked in); what the run creates in the copy
// is moved back where nothing is, never over anything; code: "now"; a code too large to keep; Run again with its own
// code; the copy made to look at; a sweep reading its folder once; what deleting a run counts.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/experiments/code-test.ts
//   DATA_DIR=/tmp/hydor-test-code CUDA_VISIBLE_DEVICES= node dist/dev/code-test.js
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import type { RunRecord } from '../../shared/experiments.ts';
import { HttpError } from '../auth.ts';
import { kvSet, openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { startSweep } from './api.ts';
import { commandOutputs, commandWords, KEEP_FILE, MAX_PATCH } from './capture.ts';
import { codeReader, counts, differences, forCopy, isCode, loadManifest, makeCopy, outputsOf, takeCode } from './code.ts';
import { createEvaluation } from './evaluations.ts';
import { experiments } from './index.ts';
import { stopTmuxServer } from './local.ts';
import { cleanJob, forgetLive, stopRun, submit, tick, useDeps } from './queue.ts';
import { deleteRun, getRun, getRunWithEvents, keepRunFiles, listRuns, resetRun, runFiles, runFolder } from './records.ts';
import { experimentTools } from './tools.ts';
import { setUsageReader } from './usage.ts';
import { setGpuReader } from './gpus.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
if (process.env.CUDA_VISIBLE_DEVICES !== '') {
  console.error('Run with CUDA_VISIBLE_DEVICES= (empty): these tests never use a GPU.');
  process.exit(2);
}

setGpuReader(async () => ({ gpus: [] }));
setUsageReader({ gpus: async () => [], apps: async () => [], processes: () => null, memory: () => null });

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-code-test-')));
const db = openDb(path.join(tmp, 'test.db'));
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Sessions extends EventEmitter {
  summary() {
    return null;
  }
  async deliverOrQueue() {}
  adapterByRun() {
    return null;
  }
}
const http = Fastify();
http.setErrorHandler((err: Error, _req, reply) => {
  reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message });
});
const deps = { app: http, db, sessions: new Sessions() as any, scheduler: null as any, models: null as any, broadcast: () => {}, toSubscribers: () => {}, publicBase: () => 'http://test.local' } as Deps;
experiments.routes!(deps);
useDeps(deps);

async function until(fn: () => boolean, what = 'it', ms = 30_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await tick();
    if (fn()) return;
    await sleep(120);
  }
  assert.fail(`timed out waiting for ${what}`);
}
const over = (id: string) => () => ['done', 'failed', 'stopped', 'lost'].includes(getRun(db, id)!.status);

/** The files and links under a folder, by their paths. */
const tree = (dir: string, under = ''): string[] =>
  fs
    .readdirSync(path.join(dir, under), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? tree(dir, path.join(under, e.name)) : [path.join(under, e.name)]))
    .sort();

const write = (dir: string, file: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), text);
};
const read = (...p: string[]) => fs.readFileSync(path.join(...p), 'utf8');
const gitIn = (dir: string) => (...a: string[]) => execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=T', ...a], { cwd: dir, stdio: 'pipe' }).toString();

/** A scratch repository with these files committed. */
function repository(files: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(tmp, 'repo-'));
  const git = gitIn(dir);
  git('init', '-q', '-b', 'main');
  for (const [f, text] of Object.entries(files)) write(dir, f, text);
  git('add', '-A');
  git('commit', '-q', '-m', 'first');
  return { dir, git, head: () => git('rev-parse', 'HEAD').trim() };
}

const submitJob = async (command: string, cwd: string, o: Record<string, unknown> = {}) => submit(deps, await cleanJob(db, { command, cwd, gpus: 0, ...o }));

/** What a run printed. */
const log = (r: RunRecord) => read(runFolder(r.id), 'log.txt');

/** Puts a run in line that waits (for a night that never comes) until runNow: the folder can change meanwhile. */
const queued = (command: string, cwd: string, o: Record<string, unknown> = {}) => submitJob(command, cwd, { ...o, when: 'night' });
const release = (id: string) => db.prepare("update exp_runs set spec = json_remove(spec, '$.when') where id = ?").run(id);
async function runNow(r: RunRecord) {
  release(r.id);
  await until(over(r.id), `the run ${r.id}`);
  return getRun(db, r.id)!;
}
// No night while these tests run, so a run asked for tonight only waits.
kvSet(db, 'experiments_settings', JSON.stringify({ nightFrom: '00:00', nightTo: '00:00', cpuSlots: 8 }));

const SCRIPT = 'echo version=1\ncat settings.yaml\n';
const project = () => {
  const p = repository({ '.gitignore': 'data/\noutputs/\n*.ckpt\n', 'train.sh': SCRIPT, 'settings.yaml': 'lr: 1\n', 'sub/run.sh': 'echo sub\n' });
  write(p.dir, 'data/train.csv', 'a,b\n');
  write(p.dir, 'outputs/old.txt', 'old\n');
  return p;
};

test('the same folder: its code is kept when queued, and it runs in place with no copy', async () => {
  const p = project();
  write(p.dir, 'train.sh', 'echo version=2\n');
  write(p.dir, 'extra.py', 'x = 1\n');
  write(p.dir, 'notes.md', 'not code\n');
  write(p.dir, '.env', 'TOKEN=1\n');
  write(p.dir, 'env/lib/python3.11/site-packages/dep.py', 'not mine\n');
  const r = await queued('sh train.sh; echo "code=$HYDOR_CODE_DIR project=$HYDOR_PROJECT_DIR"', p.dir);
  const q = r.queuedCode!;
  assert.deepEqual([q.commit, q.whole, q.changed, Object.keys(q.files)], [p.head(), true, 1, ['extra.py']], 'the code-like untracked file, not the notes or .env');
  assert.ok(q.patch);
  assert.match(read(r.patchPath!), /version=2/);
  assert.equal(r.commit, p.head());
  assert.equal(read(runFolder(r.id), 'code-files/extra.py'), 'x = 1\n');
  // A new file git does not track is no change of what was queued; nor is committing exactly what was queued.
  write(p.dir, 'later.py', 'y = 2\n');
  p.git('add', 'train.sh');
  p.git('commit', '-q', '-m', 'as queued');
  assert.deepEqual(await differences(loadManifest(runFolder(r.id))!, p.dir), []);
  const done = await runNow(r);
  assert.equal(done.status, 'done', done.why);
  assert.deepEqual([done.codeAt, done.codeChanged, done.codeDir, done.commit], ['queued', undefined, undefined, q.commit]);
  assert.ok(!fs.existsSync(path.join(runFolder(r.id), 'code')), 'no copy');
  assert.match(log(done), new RegExp(`version=2\\ncode=${p.dir} project=${p.dir}`));
});

test('what counts as changed: a tracked file, a kept untracked file, a deleted one, a new commit of other content', async () => {
  const p = project();
  write(p.dir, 'extra.py', 'x = 1\n');
  const r = await queued('sh train.sh', p.dir);
  const m = loadManifest(runFolder(r.id))!;
  assert.deepEqual(await differences(m, p.dir), []);
  write(p.dir, 'train.sh', 'echo changed\n');
  assert.deepEqual(await differences(m, p.dir), ['train.sh']);
  p.git('checkout', '--', 'train.sh');
  write(p.dir, 'extra.py', 'x = 2\n');
  assert.deepEqual(await differences(m, p.dir), ['extra.py']);
  write(p.dir, 'extra.py', 'x = 1\n');
  fs.rmSync(path.join(p.dir, 'settings.yaml'));
  assert.deepEqual(await differences(m, p.dir), ['settings.yaml']);
  p.git('checkout', '--', 'settings.yaml');
  write(p.dir, 'sub/run.sh', 'echo another\n');
  p.git('commit', '-q', '-am', 'another');
  assert.deepEqual(await differences(m, p.dir), ['sub/run.sh']);
  await stopRun(deps, r.id);
});

test('changed while it waited: it runs a copy of the code as queued, with the rest linked in, and its outputs end up in the folder', async () => {
  const p = project();
  write(p.dir, 'train.sh', 'echo version=2\n');
  write(p.dir, 'sub/model.py', 'queued model\n');
  write(p.dir, 'run.sh', 'echo queued-untracked\n');
  const command = [
    'sh ../run.sh',
    'sh ../train.sh',
    'cat model.py ../data/train.csv',
    'echo "code=$HYDOR_CODE_DIR project=$HYDOR_PROJECT_DIR"',
    'echo "head=$(git rev-parse HEAD) branch=$(git rev-parse --abbrev-ref HEAD)"',
    'echo through-link > ../outputs/new.txt',
    `echo absolute > ${p.dir}/outputs/absolute.txt`,
    'mkdir -p ../results/deep && echo made > ../results/deep/r.txt && echo here > here.log',
    'mkdir -p __pycache__ ../results/__pycache__ && echo c > __pycache__/m.pyc && echo c > ../results/x.pyc',
  ].join(' && ');
  const r = await queued(command, path.join(p.dir, 'sub'));
  const head = p.head();
  // The next experiment's work, meanwhile.
  write(p.dir, 'train.sh', 'echo version=3\n');
  write(p.dir, 'sub/model.py', 'next model\n');
  write(p.dir, 'run.sh', 'echo next-untracked\n');
  p.git('add', 'train.sh');
  p.git('commit', '-q', '-m', 'next');
  const now = p.head();
  const done = await runNow(r);
  assert.equal(done.status, 'done', `${done.why} ${log(done)}`);
  const code = path.join(runFolder(r.id), 'code');
  assert.deepEqual([done.codeAt, done.codeDir], ['queued', path.join(code, 'sub')]);
  assert.deepEqual(done.codeChanged, ['run.sh', 'sub/model.py', 'train.sh']);
  const out = log(done);
  assert.match(out, /queued-untracked\nversion=2\nqueued model\na,b\n/);
  assert.match(out, new RegExp(`code=${code}/sub project=${p.dir}/sub\n`));
  assert.match(out, new RegExp(`head=${head} branch=main`));
  // Through a linked folder it went straight to the original; what it made in the copy was moved there.
  assert.equal(read(p.dir, 'outputs/new.txt'), 'through-link\n');
  assert.equal(read(p.dir, 'outputs/absolute.txt'), 'absolute\n');
  assert.equal(read(p.dir, 'results/deep/r.txt'), 'made\n');
  assert.equal(read(p.dir, 'sub/here.log'), 'here\n');
  assert.ok(!fs.existsSync(path.join(p.dir, 'sub/__pycache__')) && !fs.existsSync(path.join(p.dir, 'results/x.pyc')), 'caches are left out');
  assert.equal(done.leftInCopy, undefined);
  assert.ok(!fs.existsSync(code), 'nothing stayed: the copy is gone');
  // The person's repository is as they left it.
  assert.equal(p.head(), now);
  assert.equal(read(p.dir, 'train.sh'), 'echo version=3\n');
  assert.equal(read(p.dir, 'sub/model.py'), 'next model\n');
  assert.equal(p.git('worktree', 'list').trim().split('\n').length, 1);
});

test('bringing back never overwrites: what is there stays, and the run’s version stays in the copy and is listed', async () => {
  const p = project();
  write(p.dir, 'table.yaml', 'committed\n');
  const away = fs.mkdtempSync(path.join(tmp, 'away-'));
  write(away, 'keep.txt', 'elsewhere\n');
  // In a script, so that the command names nothing it writes.
  write(
    p.dir,
    'work.sh',
    [
      'set -e',
      'echo ran > started',
      'sleep 1',
      'echo mine > made.txt',
      'echo mine > clash.txt',
      'mkdir -p merged && echo mine > merged/new.txt && echo mine > merged/clash.txt',
      'sed -i s/committed/rewritten/ table.yaml',
      `ln -s ${away} outlink`,
      'rm data && mkdir data && echo mine > data/train.csv',
      'echo mine > later-dir-is-a-link',
      '',
    ].join('\n'),
  );
  p.git('add', 'table.yaml', 'work.sh');
  p.git('commit', '-q', '-m', 'work');
  const r = await queued('sh work.sh && sh train.sh', p.dir);
  write(p.dir, 'train.sh', 'echo version=3\n');
  // These appear in the folder while it runs (there before it started, they would be linked into the copy).
  release(r.id);
  await until(() => fs.existsSync(path.join(runFolder(r.id), 'code/started')) || over(r.id)(), 'it to start');
  write(p.dir, 'clash.txt', 'theirs\n');
  write(p.dir, 'merged/clash.txt', 'theirs\n');
  fs.symlinkSync(away, path.join(p.dir, 'later-dir-is-a-link'));
  await until(over(r.id), 'the run');
  const done = getRun(db, r.id)!;
  assert.equal(done.status, 'done', `${done.why} ${log(done)}`);
  assert.equal(read(p.dir, 'made.txt'), 'mine\n');
  assert.equal(read(p.dir, 'clash.txt'), 'theirs\n');
  assert.equal(read(p.dir, 'merged/clash.txt'), 'theirs\n');
  assert.equal(read(p.dir, 'merged/new.txt'), 'mine\n');
  assert.equal(read(p.dir, 'table.yaml'), 'committed\n');
  assert.equal(read(p.dir, 'data/train.csv'), 'a,b\n', 'a link the run replaced does not replace the original');
  assert.equal(fs.readlinkSync(path.join(p.dir, 'outlink')), away, 'a link the run made is moved as a link');
  assert.deepEqual(fs.readdirSync(away), ['keep.txt'], 'nothing is written through a link');
  assert.deepEqual(done.leftInCopy, ['clash.txt', 'data/train.csv', 'later-dir-is-a-link', 'merged/clash.txt', 'table.yaml']);
  const code = path.join(runFolder(r.id), 'code');
  assert.equal(read(code, 'clash.txt'), 'mine\n');
  assert.equal(read(code, 'table.yaml'), 'rewritten\n');
  // The copy holds only what stayed: no checkout, no links, no .git.
  assert.deepEqual(tree(code), ['clash.txt', 'data/train.csv', 'later-dir-is-a-link', 'merged/clash.txt', 'table.yaml']);
  // Open its code gives the code as queued again, beside what stayed.
  const opened = (await http.inject({ method: 'POST', url: `/api/experiments/runs/${r.id}/code` })).json().dir as string;
  assert.equal(opened, path.join(runFolder(r.id), 'code-view'));
  assert.equal(read(opened, 'table.yaml'), 'committed\n');
  assert.equal(read(opened, 'train.sh'), SCRIPT);
  assert.equal(read(opened, 'work.sh'), read(p.dir, 'work.sh'));
  assert.equal(read(code, 'table.yaml'), 'rewritten\n', 'what stayed is as the run left it');

  // What deleting it counts: what it left in the copy, not the copy.
  const f = await runFiles([r.id]);
  assert.equal(f.count, 5, f.names.join(', '));
  assert.ok(f.names.every((n) => n.startsWith('code/')));
  // Keep those files: they are moved aside; the copy and its links go, never what they lead to.
  const kept = keepRunFiles([r.id])!;
  assert.ok(!fs.existsSync(path.join(kept, 'code-view')));
  assert.equal(read(kept, 'code/clash.txt'), 'mine\n');
  assert.equal(read(kept, 'code/data/train.csv'), 'mine\n');
  deleteRun(db, r.id);
  assert.ok(!fs.existsSync(runFolder(r.id)));
  assert.equal(read(p.dir, 'data/train.csv'), 'a,b\n');
  assert.equal(read(p.dir, 'outputs/old.txt'), 'old\n');
});

test('deleting a run with a copy leaves what its links lead to; the copy is not counted among its files', async () => {
  const p = project();
  const r = await queued('sh train.sh && echo x > "$HYDOR_RUN_DIR/scores.jsonl"', p.dir);
  write(p.dir, 'settings.yaml', 'lr: 2\n');
  const done = await runNow(r);
  assert.equal(done.status, 'done', `${done.why} ${log(done)}`);
  assert.ok(done.codeDir);
  const f = await runFiles([r.id]);
  assert.deepEqual(f.names, ['scores.jsonl']);
  deleteRun(db, r.id);
  assert.ok(!fs.existsSync(runFolder(r.id)));
  assert.equal(read(p.dir, 'data/train.csv'), 'a,b\n');
});

test('a code folder the run wrote itself is never touched: it is the run’s file, and no copy is made over it', async () => {
  const p = project();
  const done = await runNow(await queued('mkdir "$HYDOR_RUN_DIR/code" && echo mine > "$HYDOR_RUN_DIR/code/mine.txt"', p.dir));
  assert.equal(done.status, 'done', `${done.why}`);
  const res = await http.inject({ method: 'POST', url: `/api/experiments/runs/${done.id}/code` });
  assert.equal(res.json().dir, path.join(runFolder(done.id), 'code-view'), res.body);
  assert.equal(read(runFolder(done.id), 'code/mine.txt'), 'mine\n');
  assert.deepEqual((await runFiles([done.id])).names, ['code/mine.txt']);
});

test('code or data, decided when the run is queued', () => {
  const code = (command: string, file: string, how: { tracked?: boolean } = {}) => {
    const outputs = outputsOf({ command, cwd: tmp }, tmp, 'rtable', path.join(tmp, 'a-run'));
    const named = commandWords(command).some((w) => w === file || w.endsWith(`=${file}`));
    return isCode({ path: file, named, ...how }, outputs) ? 'code' : 'data';
  };
  const table: [string, string, 'code' | 'data', { tracked?: boolean }?][] = [
    ['python train.py --config cfg.json', 'cfg.json', 'code'],
    ['python train.py --config=cfg.json', 'cfg.json', 'code'],
    ['python train.py --out results.json', 'results.json', 'data'],
    ['python train.py --output=results.json', 'results.json', 'data'],
    ['python train.py -o results.json', 'results.json', 'data'],
    ['python train.py --save_path best.yaml', 'best.yaml', 'data'],
    ['python train.py --checkpoint-file state.json', 'state.json', 'data'],
    ['python train.py > log.txt', 'log.txt', 'data'],
    ['python train.py >> notes.yaml', 'notes.yaml', 'data'],
    ['python train.py 2> err.txt', 'err.txt', 'data'],
    ['python train.py &> all.yaml', 'all.yaml', 'data'],
    ['python train.py 2>&1 | tee -a seen.yaml', 'seen.yaml', 'data'],
    ['python train.py data/train.csv', 'data/train.csv', 'data'],
    ['python train.py', 'results.csv', 'data', { tracked: true }],
    ['python train.py', 'config.yaml', 'code', { tracked: true }],
    ['python train.py', 'results.json', 'code', { tracked: true }],
    ['python train.py --out results.json', 'results.json', 'data', { tracked: true }],
    ['python train.py', 'utils.py', 'code'],
    ['python train.py', 'notes.txt', 'data'],
    ['python train.py', 'results.json', 'data'],
    // In a folder the command writes to, what is no program's source is data; sources stay code.
    ['python train.py --output_dir runs/', 'runs/metrics.json', 'data', { tracked: true }],
    ['python train.py --output_dir runs/', 'runs/plot.py', 'code', { tracked: true }],
    ['python train.py --log_dir .', 'config.yaml', 'code', { tracked: true }],
  ];
  assert.deepEqual(
    table.map(([command, file, , how]) => [command, file, code(command, file, how)]),
    table.map(([command, file, want]) => [command, file, want]),
  );
  assert.deepEqual(commandOutputs('a -o x --out=y z > w 2>>v | tee u t; b q'), ['x', 'y', 'w', 'v', 'u', 't']);
});

test('outputs are not code: runs that rewrite a results file run in place, and their rows stay in the folder', async () => {
  const p = repository({ 'append.sh': 'echo "{\\"run\\": $1}" > results.json\necho "row$1" >> results.csv\n', 'results.csv': 'run\n', 'config.yaml': 'lr: 1\n' });
  write(p.dir, 'results.json', '{}\n');
  const three = [await queued('sh append.sh 1', p.dir), await queued('sh append.sh 2', p.dir), await queued('sh append.sh 3', p.dir)];
  assert.deepEqual(three[0].queuedCode!.files, {}, 'results.json is not code');
  for (const r of three) {
    const done = await runNow(r);
    assert.deepEqual([done.status, done.codeAt, done.codeDir, done.codeChanged], ['done', 'queued', undefined, undefined], done.why);
  }
  assert.equal(read(p.dir, 'results.csv'), 'run\nrow1\nrow2\nrow3\n');

  // From copies: the tracked results file and a new one named as output are the folder's own there too.
  const copies = [await queued('sh append.sh 4; sh -c "echo a >> new.csv"; true --out new.csv', p.dir), await queued('sh append.sh 5; true --out new.csv; sh -c "echo b >> new.csv"', p.dir)];
  write(p.dir, 'config.yaml', 'lr: 2\n');
  for (const r of copies) {
    const done = await runNow(r);
    assert.equal(done.status, 'done', `${done.why} ${log(done)}`);
    assert.ok(done.codeDir);
    assert.equal(done.leftInCopy, undefined);
    assert.ok(!fs.existsSync(path.join(runFolder(r.id), 'code')), 'nothing stayed');
  }
  assert.equal(read(p.dir, 'results.csv'), 'run\nrow1\nrow2\nrow3\nrow4\nrow5\n');
  assert.equal(read(p.dir, 'results.json'), '{"run": 5}\n');
  assert.equal(read(p.dir, 'new.csv'), 'a\nb\n');
});

test('tracked data in a copy: a link to the original, with the checked-out file where the original has it no more; uncommitted changes to it are never code', async () => {
  const p = repository({ 'run.sh': 'cat table.csv gone.csv\n', 'table.csv': 'old\n', 'gone.csv': 'committed\n' });
  write(p.dir, 'table.csv', `${'x'.repeat(MAX_PATCH)}\n`);
  const r = await queued('sh run.sh | head -c 100; cat gone.csv', p.dir);
  assert.deepEqual([r.queuedCode!.whole, r.queuedCode!.changed], [true, 0], 'a large change of data does not make the code incomplete');
  write(p.dir, 'table.csv', 'now\n');
  fs.rmSync(path.join(p.dir, 'gone.csv'));
  assert.deepEqual(await differences(loadManifest(runFolder(r.id))!, p.dir), []);
  write(p.dir, 'run.sh', 'echo other\n');
  const done = await runNow(r);
  assert.equal(done.status, 'done', `${done.why} ${log(done)}`);
  assert.ok(done.codeDir);
  assert.equal(log(done), 'now\ncommitted\ncommitted\n');
});

test('the command as it ran is kept when it was pointed at the copy, and said by experiment_get', async () => {
  const p = project();
  const command = `sh ${p.dir}/train.sh`;
  const same = await runNow(await queued(command, p.dir));
  assert.equal(same.ranAs, undefined);
  const r = await queued(command, p.dir, { env: { DATA: `${p.dir}/data` } });
  const plain = await queued('sh train.sh', p.dir);
  write(p.dir, 'train.sh', 'echo changed\n');
  const done = await runNow(r);
  const code = path.join(runFolder(r.id), 'code');
  assert.equal(done.ranAs, `DATA=${code}/data sh ${code}/train.sh`);
  assert.equal(log(done), 'version=1\nlr: 1\n');
  assert.equal((await runNow(plain)).ranAs, undefined, 'nothing pointed elsewhere');
  const ctx = { runId: 'flow-as', key: 'acp:flow-as', agent: 'acp', cwd: p.dir, deps, step: true } as RunCtx;
  const out = await experimentTools(ctx).find((t) => t.name === 'experiment_get')!.run({ id: r.id }, ctx);
  const got = JSON.parse(typeof out === 'string' ? out : out.text);
  assert.deepEqual([got.run.command, got.run.ranAs], [command, done.ranAs]);
});

test('a copy made for a run that is stopped before it starts is taken down', async () => {
  const p = project();
  const r = await queued('sh train.sh', p.dir);
  write(p.dir, 'train.sh', 'echo changed\n');
  release(r.id);
  await tick();
  await stopRun(deps, r.id);
  await until(over(r.id), 'it to stop');
  assert.ok(!fs.existsSync(path.join(runFolder(r.id), 'code')), 'no checkout left');
  assert.equal(read(p.dir, 'data/train.csv'), 'a,b\n');
});

test('code: "now" runs the folder as it is when it starts, and says so', async () => {
  const p = project();
  const r = await queued('sh train.sh', p.dir, { code: 'now' });
  assert.equal(r.code, 'now');
  write(p.dir, 'train.sh', 'echo version=9\n');
  const done = await runNow(r);
  assert.equal(done.status, 'done', done.why);
  assert.deepEqual([done.codeAt, done.codeChanged, done.codeDir], ['start', ['train.sh'], undefined]);
  assert.equal(log(done), 'version=9\n');
  assert.match(read(done.patchPath!), /version=9/, 'the record keeps what ran');
  await assert.rejects(cleanJob(db, { command: 'true', cwd: p.dir, code: 'later' }), /code: "queued"/);
});

test('too large to keep: it fails before starting once something changed, unless the folder is the same or code: "now"', async () => {
  const p = project();
  // A patch past 2 MB.
  write(p.dir, 'train.sh', `echo big\n${'# x\n'.repeat(MAX_PATCH / 3)}`);
  const same = await queued('sh train.sh', p.dir);
  assert.equal(same.queuedCode!.whole, false);
  assert.equal((await runNow(same)).status, 'done', 'the same folder: it runs');

  const r = await queued('sh train.sh', p.dir);
  const now = await queued('sh train.sh', p.dir, { code: 'now' });
  write(p.dir, 'settings.yaml', 'lr: 2\n');
  const failed = await runNow(r);
  assert.deepEqual([failed.status, failed.why], ['failed', 'Its code changed while it waited and was too large to keep as queued: run it again']);
  assert.ok(!fs.existsSync(path.join(runFolder(r.id), 'log.txt')), 'nothing ran');
  assert.equal((await runNow(now)).status, 'done');

  // Large settings that git does not track: as good as kept while unchanged; changed, there is no copy to make.
  p.git('checkout', '--', '.');
  write(p.dir, 'large.json', 'x'.repeat(KEEP_FILE + 1));
  write(p.dir, 'model.ckpt', 'y'.repeat(KEEP_FILE + 1));
  const linked = await queued('sh train.sh; wc -c < large.json; wc -c < model.ckpt', p.dir);
  assert.equal(linked.queuedCode!.whole, false);
  const lost = await queued('sh train.sh --config large.json', p.dir);
  write(p.dir, 'train.sh', 'echo version=3\n');
  const ran = await runNow(linked);
  assert.equal(ran.status, 'done', `${ran.why}`);
  assert.ok(ran.codeDir);
  assert.match(log(ran), new RegExp(`version=1[\\s\\S]*${KEEP_FILE + 1}`));
  write(p.dir, 'large.json', 'z'.repeat(KEEP_FILE + 2));
  assert.equal((await runNow(lost)).why, 'Its code changed while it waited and was too large to keep as queued: run it again');

  // A large checkpoint the command names is data: it does not make the code incomplete.
  const data = await queued('sh train.sh --ckpt model.ckpt', p.dir);
  // (A checkpoint named by its flag is not listed at all; one named plainly is.)
  assert.deepEqual([data.queuedCode!.whole, data.notKept, data.kept], [true, undefined, undefined]);
  const plain = await queued('sh train.sh model.ckpt', p.dir);
  assert.deepEqual([plain.queuedCode!.whole, plain.notKept], [true, ['model.ckpt']]);
  await stopRun(deps, data.id);
});

test('a copy that cannot be put back as queued: it does not start', async () => {
  const p = project();
  write(p.dir, 'train.sh', 'echo version=2\n');
  const r = await queued('sh train.sh', p.dir);
  fs.rmSync(path.join(runFolder(r.id), 'changes.patch'));
  write(p.dir, 'train.sh', 'echo version=3\n');
  const failed = await runNow(r);
  assert.equal(failed.status, 'failed');
  assert.match(failed.why!, /^Its code changed while it waited and could not be put back as it was queued \(.*\): run it again$/);
  assert.ok(!fs.existsSync(path.join(runFolder(r.id), 'code')));
});

test('binary changes, which the patch leaves out, are kept and put back', async () => {
  const p = repository({ 'run.sh': 'od -An -tx1 blob.bin\n' });
  fs.writeFileSync(path.join(p.dir, 'blob.bin'), Buffer.from([0, 1, 2]));
  p.git('add', '-A');
  p.git('commit', '-q', '-m', 'blob');
  fs.writeFileSync(path.join(p.dir, 'blob.bin'), Buffer.from([0, 7, 7]));
  const r = await queued('sh run.sh', p.dir);
  fs.writeFileSync(path.join(p.dir, 'blob.bin'), Buffer.from([0, 9, 9]));
  const done = await runNow(r);
  assert.equal(done.status, 'done', `${done.why}`);
  assert.equal(log(done).trim(), '00 07 07');
});

test('Run again with its own code after the folder moved on; as the folder is now otherwise', async () => {
  const p = project();
  write(p.dir, 'train.sh', 'echo version=2\n');
  const first = await runNow(await queued('sh train.sh', p.dir));
  const same = (await http.inject({ method: 'GET', url: `/api/experiments/runs/${first.id}/code` })).json();
  assert.deepEqual(same, { own: true, differs: false, changed: [] });
  write(p.dir, 'train.sh', 'echo version=3\n');
  p.git('commit', '-q', '-am', 'on');
  const differs = (await http.inject({ method: 'GET', url: `/api/experiments/runs/${first.id}/code` })).json();
  assert.deepEqual(differs, { own: true, differs: true, changed: ['train.sh'] });

  const again = async (body: object) => {
    const res = await http.inject({ method: 'POST', url: `/api/experiments/runs/${first.id}/again`, payload: body });
    assert.equal(res.statusCode, 200, res.body);
    const id = res.json().run.id as string;
    await until(over(id), 'the run again');
    return getRun(db, id)!;
  };
  const own = await again({ code: 'own' });
  assert.equal(own.status, 'done', `${own.why}`);
  assert.deepEqual([own.codeFrom, own.from, own.codeAt, own.commit], [first.id, first.id, 'queued', first.commit]);
  assert.equal(log(own), 'version=2\n');
  const now = await again({ code: 'now' });
  assert.equal(log(now), 'version=3\n');
  assert.equal(now.codeDir, undefined);
  assert.equal(log(await again({})), 'version=3\n', 'left out: the folder as it is now');
  const bad = await http.inject({ method: 'POST', url: `/api/experiments/runs/${first.id}/again`, payload: { code: 'own', cwd: tmp } });
  assert.equal(bad.statusCode, 400);
  assert.equal((await http.inject({ method: 'POST', url: `/api/experiments/runs/${first.id}/again`, payload: { code: 'mine' } })).statusCode, 400);

  // A run from before code was kept at queue time: its own is made from its record.
  fs.rmSync(path.join(runFolder(first.id), 'code.json'));
  const old = await again({ code: 'own' });
  assert.equal(log(old), 'version=2\n', `${old.why}`);
});

test('Open its code: the copy it ran from, or one made from what was kept, once', async () => {
  const p = project();
  write(p.dir, 'train.sh', 'echo version=2\n');
  write(p.dir, 'extra.py', 'x = 1\n');
  const waiting = await queued('sh train.sh', p.dir);
  assert.equal((await http.inject({ method: 'POST', url: `/api/experiments/runs/${waiting.id}/code` })).statusCode, 409);
  const done = await runNow(waiting);
  write(p.dir, 'train.sh', 'echo version=3\n');
  const open = async () => (await http.inject({ method: 'POST', url: `/api/experiments/runs/${done.id}/code` })).json().dir as string;
  const [dir, twice] = await Promise.all([open(), open()]);
  assert.equal(dir, twice);
  assert.equal(dir, path.join(runFolder(done.id), 'code-view'));
  assert.equal(read(dir, 'train.sh'), 'echo version=2\n');
  assert.equal(read(dir, 'extra.py'), 'x = 1\n');
  assert.ok(!fs.existsSync(path.join(dir, 'data')), 'only the code: nothing linked');
  write(dir, 'extra.py', 'looked\n');
  assert.equal(await open(), dir);
  assert.equal(read(dir, 'extra.py'), 'looked\n', 'made once');
  assert.deepEqual((await runFiles([done.id])).count, 0);
});

test('a sweep reads its folder once, and every run has its own named files', async () => {
  const p = project();
  write(p.dir, 'a.cfg', 'a\n');
  write(p.dir, 'b.cfg', 'b\n');
  write(p.dir, 'c.cfg', 'c\n');
  const before = counts.reads;
  const s = await startSweep(deps, { group: 'once', command: 'cat {c}.cfg', params: { c: ['a', 'b', 'c'] }, cwd: p.dir, gpus: 0, when: 'night' });
  assert.equal(counts.reads - before, 1);
  assert.deepEqual(s.runs.map((r) => getRun(db, r.id)!.kept), [['a.cfg'], ['b.cfg'], ['c.cfg']]);
  write(p.dir, 'train.sh', 'changed\n');
  for (const r of s.runs) release(r.id);
  await until(() => s.runs.every((r) => over(r.id)()), 'the sweep');
  assert.deepEqual(s.runs.map((r) => log(getRun(db, r.id)!)), ['a\n', 'b\n', 'c\n']);
});

test('a night run put back to wait keeps its queued code; what stayed in a copy it ran in is set aside', async () => {
  const p = project();
  write(p.dir, 'work.sh', 'sed -i s/lr/rate/ settings.yaml\nsleep 30\n');
  p.git('add', 'work.sh');
  p.git('commit', '-q', '-m', 'work');
  const r = await queued('sh train.sh; sh work.sh', p.dir);
  write(p.dir, 'train.sh', 'echo version=3\n');
  release(r.id);
  await until(() => getRun(db, r.id)!.status === 'running', 'it to run');
  assert.ok(getRun(db, r.id)!.codeDir);
  await until(() => read(runFolder(r.id), 'code/settings.yaml').startsWith('rate'), 'it to write');
  await stopRun(deps, r.id);
  await until(over(r.id), 'it to stop');
  assert.deepEqual(tree(path.join(runFolder(r.id), 'code')), ['settings.yaml']);
  resetRun(db, r.id, 'again');
  const back = getRun(db, r.id)!;
  assert.deepEqual([back.codeAt, back.codeDir, !!back.queuedCode, back.commit], [undefined, undefined, true, p.head()]);
  forgetLive();
  await until(() => getRun(db, r.id)!.status === 'running', 'it to run again');
  assert.ok(getRun(db, r.id)!.codeDir);
  const aside = fs.readdirSync(runFolder(r.id)).find((n) => /^code-before-\d+$/.test(n))!;
  assert.equal(read(runFolder(r.id), aside, 'settings.yaml'), 'rate: 1\n');
  await stopRun(deps, r.id);
  await until(over(r.id), 'it to stop');
});

test('no code is kept outside git, for a trial or for a cluster’s run; a run still being read does not start', async () => {
  const plain = fs.mkdtempSync(path.join(tmp, 'plain-'));
  const r = await submitJob('echo hi', plain);
  await until(over(r.id), 'the run');
  assert.deepEqual([getRun(db, r.id)!.queuedCode, getRun(db, r.id)!.codeAt, getRun(db, r.id)!.codePending], [undefined, undefined, undefined]);
  const p = project();
  const trial = await submit(deps, await cleanJob(db, { command: 'true', cwd: p.dir, gpus: 0, tags: ['try'], env: { HYDOR_TRY: '1' } }));
  assert.equal(trial.queuedCode, undefined);
  await until(over(trial.id), 'the trial');
});

test('in the copy: absolute paths, ~ and editable installs lead to the copy; a path out of the repository still leads there', async () => {
  const p = repository({ 'src/pkg/__init__.py': '', 'run.sh': 'true\n' });
  write(p.dir, '.venv/lib/python3.11/site-packages/pkg.pth', `${p.dir}/src\n`);
  write(tmp, 'shared.cfg', 'x\n');
  write(tmp, 'shared.cfg2', 'x\n');
  const spec = { command: `sh ${p.dir}/run.sh --out=${p.dir} --cfg ../shared.cfg --second ../shared.cfg2x --other ${p.dir}-other`, cwd: p.dir, env: { DATA: `${p.dir}/data`, PYTHONPATH: `${p.dir}/src:/opt/x` } };
  const folder = path.join(tmp, 'a-run');
  const m = (await takeCode(codeReader(), spec, 'rtest', folder))!;
  const copy = await makeCopy(m, folder, { link: true });
  const there = forCopy(m, copy, folder, spec);
  assert.equal(there.command, `sh ${copy.top}/run.sh --out=${copy.top} --cfg ${path.join(tmp, 'shared.cfg')} --second ../shared.cfg2x --other ${p.dir}-other`);
  assert.equal(there.env.DATA, `${copy.top}/data`);
  assert.equal(there.env.PYTHONPATH, `${copy.top}/src:/opt/x`);
  assert.equal(there.env.UV_NO_SYNC, '1');
});

test('an evaluation’s seal is judged by the folder the run really runs in', async () => {
  const p = repository({ 'score.sh': 'echo acc=1\n', 'run.sh': 'true\n', '.gitignore': 'data/\n' });
  write(p.dir, 'data/test.csv', '1\n');
  await createEvaluation(deps, { name: 'Seal', cwd: p.dir, command: 'sh score.sh', metric: 'acc', better: 'higher', protect: ['score.sh', 'data/test.csv'], gpus: 0 });
  const r = await queued('sh run.sh', p.dir);
  // The scorer is edited while it waits: the run's copy has the one as sealed.
  write(p.dir, 'score.sh', 'echo acc=2\n');
  const done = await runNow(r);
  assert.ok(done.codeDir);
  assert.deepEqual(done.sealed?.map((s) => [s.ok, s.changed]), [[true, undefined]]);
  const second = await queued('sh run.sh', p.dir);
  write(p.dir, 'run.sh', 'false\n');
  write(p.dir, 'data/test.csv', '2\n');
  const linked = await runNow(second);
  assert.equal(linked.sealed?.[0].ok, false, 'its data is the folder’s, through the link');
});

test('the tools say what was kept, and experiment_get what ran', async () => {
  const p = project();
  write(p.dir, 'train.sh', 'echo version=2\n');
  write(p.dir, 'extra.py', 'x = 1\n');
  const ctx: RunCtx = { runId: 'flow-code', key: 'acp:flow-code', agent: 'acp', cwd: p.dir, deps, step: true } as RunCtx;
  const call = async (name: string, a: Record<string, unknown>) => {
    const t = experimentTools(ctx).find((x) => x.name === name)!;
    const out = await t.run(a, ctx);
    return JSON.parse(typeof out === 'string' ? out : out.text);
  };
  const run = await call('experiment_run', { command: 'sh train.sh', gpus: 0, when: 'night' });
  assert.equal(run.code, `commit ${p.head().slice(0, 7)} with 1 changed file (train.sh) and 1 file not in git (extra.py)`);
  write(p.dir, 'train.sh', 'echo version=3\n');
  await runNow(getRun(db, run.id)!);
  const got = await call('experiment_get', { id: run.id });
  assert.deepEqual([got.run.codeAt, got.run.codeChanged, got.run.queuedCode], ['queued', ['train.sh'], run.code]);
  assert.ok(getRunWithEvents(db, run.id)!.events!.some((e) => /runs a copy of the code as it was queued/.test(e.text)));
});

/** A session's tools in a folder, as a step has them (no card). */
const toolsIn = (cwd: string) => {
  const ctx: RunCtx = { runId: 'flow-again', key: 'acp:flow-again', agent: 'acp', cwd, deps, step: true } as RunCtx;
  const of = (name: string) => experimentTools(ctx).find((x) => x.name === name)!;
  const call = async (name: string, a: Record<string, unknown>) => {
    const out = await of(name).run(a, ctx);
    const text = typeof out === 'string' ? out : out.text;
    return typeof out !== 'string' && out.isError ? { refused: text } : JSON.parse(text);
  };
  return { of, call };
};

test('running a run again says which code when the folder has changed: never guessed', async () => {
  const p = project();
  const { of, call } = toolsIn(p.dir);
  const first = await call('experiment_run', { command: 'sh train.sh', gpus: 0, group: 'again-code' });
  await until(over(first.id), 'the first');
  const short = p.head().slice(0, 7);
  // Unchanged: nothing to say, and the list tells the rerun from the run.
  const same = await call('experiment_run', { again: first.id });
  assert.equal(same.code, `the folder as it is now: commit ${short}`);
  await until(over(same.id), 'the same again');
  write(p.dir, 'train.sh', 'echo version=2\ncat settings.yaml\n');
  write(p.dir, 'settings.yaml', 'lr: 2\n');
  const sentence = 'That run’s own code differs from the folder now (settings.yaml and 1 more): give code "own" to run what it ran, or "now" to run the folder as it is.';
  const before = listRuns(db, { group: 'again-code' }).length;
  assert.equal((await call('experiment_run', { again: first.id })).refused, sentence);
  assert.equal((await call('experiment_run', { again: first.id, code: 'queued' })).refused, sentence);
  assert.equal(listRuns(db, { group: 'again-code' }).length, before, 'nothing started');
  const own = await call('experiment_run', { again: first.id, code: 'own' });
  assert.equal(own.code, `its own: commit ${short}`);
  await until(over(own.id), 'its own code');
  assert.match(log(getRun(db, own.id)!), /version=1\nlr: 1/);
  const events = getRunWithEvents(db, own.id)!.events!.map((e) => e.text);
  assert.ok(events.includes('It runs its own code, as the run it repeats ran it: the folder has changed since'), events.join('\n'));
  assert.ok(!events.some((e) => /had changed since it was queued/.test(e)), events.join('\n'));
  const now = await call('experiment_run', { again: first.id, code: 'now' });
  assert.equal(now.code, `the folder as it is now: commit ${short} with 2 changed files (settings.yaml, train.sh)`);
  await until(over(now.id), 'the folder as it is');
  assert.match(log(getRun(db, now.id)!), /version=2\nlr: 2/);
  const listed = (await call('experiment_list', { group: 'again-code' })).runs as { id: string; againOf?: string; code?: string }[];
  const row = (id: string) => listed.find((r) => r.id === id)!;
  assert.deepEqual([row(first.id).againOf, row(same.id).againOf, row(own.id).againOf, row(now.id).againOf], [undefined, first.id, first.id, first.id]);
  assert.deepEqual([row(first.id).code, row(own.id).code, row(now.id).code], [short, short, `${short} + 2 changed`]);
  // The same folder named another way is still the same folder; another one has no own code to ask about.
  assert.equal((await call('experiment_run', { again: first.id, cwd: `${p.dir}/sub/..` })).refused, sentence);
  const other = project();
  assert.equal((await call('experiment_run', { again: first.id, cwd: other.dir })).refused, undefined);
  const said = of('experiment_run');
  assert.match((said.inputSchema as any).properties.code.description, /With again .*"own" .*or "now".*a new file git does not track does not count|a new file git does not track does not count.*With again .*"own"/s);
  assert.deepEqual((said.inputSchema as any).properties.code.enum, ['queued', 'now', 'own']);

  // The copy it ran from is gone once slimmed away: the record says so, and Open its code makes it again.
  await until(() => !!getRun(db, own.id)!.codeRemoved, 'the copy to be said gone');
  const got = await call('experiment_get', { id: own.id });
  assert.deepEqual([got.run.codeRemoved, got.run.codeDir], [true, undefined]);
  assert.match(of('experiment_get').description, /codeRemoved true instead, and Open its code on the run’s page makes it again/);
  const opened = (await http.inject({ method: 'POST', url: `/api/experiments/runs/${own.id}/code` })).json();
  assert.match(read(opened.dir, 'train.sh'), /version=1/);
});

test('what a command writes, and its checkpoints, are not kept with the run as files it needs', async () => {
  const p = project();
  write(p.dir, 'results/wait/result.json', '{}\n');
  write(p.dir, 'results/wait/ckpt.json', '{}\n');
  write(p.dir, 'results/wait/log.txt', 'old\n');
  write(p.dir, 'needed.json', '{}\n');
  const { call } = toolsIn(p.dir);
  const run = await call('experiment_run', { command: 'sh train.sh needed.json --out results/wait/result.json --ckpt results/wait/ckpt.json | tee results/wait/log.txt', gpus: 0, resume: 'sh train.sh --resume results/wait/ckpt.json' });
  assert.equal(run.note, 'Not in git, kept with the run: needed.json');
  await until(over(run.id), 'it');
  assert.deepEqual(getRun(db, run.id)!.kept, ['needed.json']);
  assert.equal((await call('experiment_get', { id: run.id })).kept, 'Not in git, kept with the run: needed.json');
});

test('experiment_get: as many lines as asked, and one that has just ended is closed before it is read', async () => {
  const p = project();
  const { call } = toolsIn(p.dir);
  const counted = await submitJob('for i in 1 2 3 4 5 6 7 8 9 10; do echo "step=$i loss=0.$i"; done', p.dir);
  await until(over(counted.id), 'it');
  const lines = async (n: number) => (await call('experiment_get', { id: counted.id, lines: n })).log;
  assert.equal(await lines(1), 'step=10 loss=0.10\n');
  assert.equal((await lines(8)).trimEnd().split('\n').length, 8);
  // It ends without the queue having looked: what is read says how it ended, with all its steps.
  const r = await submitJob('echo "step=11 loss=0.5"; while [ ! -e go ]; do sleep 0.05; done; echo "step=20 loss=0.2"', p.dir);
  await until(() => getRun(db, r.id)!.status === 'running' && /step=11/.test(log(r)), 'it to be going');
  write(p.dir, 'go', '');
  for (let i = 0; i < 200 && !fs.existsSync(path.join(runFolder(r.id), 'exit')); i++) await sleep(25);
  const got = await call('experiment_get', { id: r.id });
  assert.deepEqual([got.run.status, got.run.metrics.step, got.run.metrics.last.loss], ['done', 20, 0.2]);
  assert.match(got.log, /step=20/);
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`✗ ${name}\n  ${(e as Error).stack ?? e}`);
  }
}
await stopTmuxServer().catch(() => {});
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${tests.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
