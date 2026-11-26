// Checks for evaluations: the verdict against a baseline; what a spec may say; sealing and checking (changed,
// missing, added, wildcards, links, the limits); which folders may be scored and what is lent to a git worktree;
// real scores end to end through tmux (a tiny shell script printing a number, no GPU): seeds, a command without
// {seed}, a number not printed, a failed run, files changed before and during a run, the baseline and the final
// test (the person's alone); putting files back; edits that seal again; the mark on every other run; scoring runs
// kept out of the experiments list; the routes (an agent's calls through app_api included) and the agents' tools.
// Build and run with a scratch data folder (no GPU is used):
//   OUTDIR=dist/dev node scripts/build-server.mjs server/experiments/evaluations-test.ts
//   DATA_DIR=/tmp/hydor-test-evaluations CUDA_VISIBLE_DEVICES= node dist/dev/evaluations-test.js
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import type { EvalScore, Evaluation } from '../../shared/evaluations.ts';
import { CONFIDENTIAL_TOOLS } from '../confidential/index.ts';
import { STEP_TOOLS } from '../../shared/app-manifest.ts';
import { HttpError } from '../auth.ts';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { ruleFor } from '../guide/api.ts';
import { internalHeaders } from '../internal.ts';
import { allowedFolder, changesOf, check, cleanSpec, createEvaluation, getEvaluation, getScore, limits, listScores, resumeScores, rootFor, startScore, updateEvaluation, verdictOf, waitScore } from './evaluations.ts';
import { experiments } from './index.ts';
import { stopTmuxServer } from './local.ts';
import { forgetNotices, setSettings, submit, tick, cleanJob, useDeps } from './queue.ts';
import { getRun, listRuns } from './records.ts';
import { experimentTools, SPAWN_NOTE } from './tools.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
if (process.env.CUDA_VISIBLE_DEVICES !== '') {
  console.error('Run with CUDA_VISIBLE_DEVICES= (empty): these tests never use a GPU.');
  process.exit(2);
}

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-eval-test-')));
const db = openDb(path.join(tmp, 'test.db'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const near = (a: number | undefined, b: number, what = '') => assert.ok(a !== undefined && Math.abs(a - b) < 1e-9, `${what} ${a} ≈ ${b}`);

class Sessions extends EventEmitter {
  mode = 'default';
  answer: string | null = 'accept';
  cards: { title: string; detail?: string; options: { id: string; label: string }[] }[] = [];
  summary() {
    return null;
  }
  async deliverOrQueue() {}
  adapterByRun(_runId: string) {
    return {
      state: { mode: this.mode },
      ask: async (card: Sessions['cards'][number]) => {
        this.cards.push(card);
        return this.answer ? { decision: this.answer } : null;
      },
    };
  }
}
const sessions = new Sessions();
const told: any[] = [];

const http = Fastify();
http.setErrorHandler((err: Error, _req, reply) => {
  reply.code(err instanceof HttpError ? err.status : 500).send({ ...(err instanceof HttpError ? err.extra : undefined), error: err.message });
});
const deps = { app: http, db, sessions: sessions as any, scheduler: null as any, models: null as any, broadcast: (e: unknown) => told.push(e), toSubscribers: () => {}, publicBase: () => 'http://test.local' } as Deps;
experiments.routes!(deps);
useDeps(deps);
await http.ready();

type Reply = { status: number; body: any };
async function call(method: string, url: string, body?: unknown, agent = false): Promise<Reply> {
  const r = await http.inject({ method: method as 'GET', url, headers: { ...(agent ? internalHeaders() : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, payload: body ? JSON.stringify(body) : undefined });
  return { status: r.statusCode, body: r.json() };
}

async function until(fn: () => boolean, ms = 30_000, what = 'it') {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await tick();
    if (fn()) return;
    await sleep(100);
  }
  assert.fail(`timed out waiting for ${what}`);
}
const OPEN = ['waiting', 'running'];
async function over(id: string): Promise<EvalScore> {
  await until(() => !OPEN.includes(getScore(db, id)!.status), 30_000, `score ${id}`);
  return getScore(db, id)!;
}
const runOver = (id: string) => until(() => ['done', 'failed', 'stopped', 'lost'].includes(getRun(db, id)!.status), 30_000, `run ${id}`);
const you = { who: 'you' as const };
const scoreNow = async (id: string, o: { folder?: string; kind?: 'score' | 'baseline' | 'final' } = {}) => over((await startScore(deps, id, { kind: o.kind ?? 'score', folder: o.folder, by: you })).id);

const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const gitIn = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=T', ...a], { cwd, stdio: 'pipe' }).toString();

// A project: the scorer and its helpers tracked, the test data not; the model (what an agent changes) tracked.
const repo = path.join(tmp, 'repo');
const SCORER = 'm=$(cat model.txt)\ntest -f data/test.csv || exit 7\necho "acc=0.$m$1"\n';
write(path.join(repo, 'eval.sh'), SCORER);
write(path.join(repo, 'model.txt'), '5\n');
write(path.join(repo, 'tests', 'check.py'), 'ok = True\n');
write(path.join(repo, 'final.sh'), 'cat "$HYDOR_HELD_OUT/answers.txt"\n');
write(path.join(repo, '.gitignore'), 'data/\n__pycache__/\n');
write(path.join(repo, 'data', 'test.csv'), 'a,1\nb,2\n');
gitIn(repo, 'init', '-q', '-b', 'main');
gitIn(repo, 'add', '.');
gitIn(repo, 'commit', '-q', '-m', 'first');
const head = gitIn(repo, 'rev-parse', 'HEAD').trim();
// A worktree of it with a better model: it has no data/, which git does not track.
const work = path.join(tmp, 'work');
gitIn(repo, 'worktree', 'add', '-q', '-b', 'better', work);
write(path.join(work, 'model.txt'), '9\n');
const foreign = path.join(tmp, 'foreign');
write(path.join(foreign, 'eval.sh'), SCORER);
const held = path.join(tmp, 'held');
write(path.join(held, 'answers.txt'), 'acc=0.77\n');

const SPEC = { name: 'Accuracy', cwd: repo, command: 'sh eval.sh {seed}', metric: 'acc', better: 'higher', protect: ['eval.sh', 'data', 'tests/*.py'], final: { command: 'sh final.sh', heldOut: held }, gpus: 0 };
let main: Evaluation;

// ---- the verdict, and the spec ---------------------------------------------------------------------------------

test('the verdict: Welch’s test with 3 values on both sides, else the sign of the difference', () => {
  const clear = verdictOf([0.91, 0.92, 0.93], [0.51, 0.52, 0.53], 'higher');
  assert.equal(clear.verdict, 'better');
  assert.ok(clear.p! < 0.05);
  near(clear.delta, 0.4);
  assert.equal(verdictOf([0.91, 0.92, 0.93], [0.51, 0.52, 0.53], 'lower').verdict, 'worse');
  assert.equal(verdictOf([0.5, 0.6, 0.7], [0.52, 0.61, 0.69], 'higher').verdict, 'same', 'a difference within the spread');
  assert.deepEqual(verdictOf([0.6, 0.7], [0.5, 0.5, 0.5], 'higher').p, null);
  assert.equal(verdictOf([0.6, 0.7], [0.5, 0.5, 0.5], 'higher').verdict, 'better');
  assert.equal(verdictOf([2], [1], 'lower').verdict, 'worse');
  assert.equal(verdictOf([1], [2], 'lower').verdict, 'better');
  assert.deepEqual(verdictOf([1], [1], 'higher'), { delta: 0, p: null, verdict: 'same' });
  assert.equal(verdictOf([0.1, 0.2, 0.3], [0.3, 0.2, 0.1], 'higher').verdict, 'same', 'rounding is no difference');
  assert.equal(verdictOf([1, 1, 1], [2, 2, 2], 'higher').verdict, 'worse', 'no spread, different means');
});

test('a spec is checked and tidied, in plain words', () => {
  const s = cleanSpec(SPEC);
  assert.deepEqual(s.seeds, [1, 2, 3]);
  assert.deepEqual(s.protect, ['eval.sh', 'data/', 'tests/*.py'], 'a folder gets its slash');
  const bad = (change: Record<string, unknown>, words: RegExp) => assert.throws(() => cleanSpec({ ...SPEC, ...change }), words);
  bad({ name: ' ' }, /Give the evaluation a name/);
  bad({ cwd: path.join(tmp, 'nowhere') }, /is not there/);
  bad({ command: '' }, /command that prints the number/);
  bad({ metric: 'step' }, /bookkeeping/);
  bad({ better: 'max' }, /higher or lower/);
  bad({ seeds: [1.5] }, /Seeds/);
  bad({ seeds: Array.from({ length: 11 }, (_, i) => i) }, /Seeds/);
  bad({ protect: [] }, /at least one file or folder/);
  bad({ protect: ['../foreign/eval.sh'] }, /not a file or folder inside/);
  bad({ protect: ['/etc/hosts'] }, /not a file or folder inside/);
  bad({ final: { command: 'sh final.sh', heldOut: path.join(repo, 'data') } }, /outside/);
  bad({ final: { command: '', heldOut: held } }, /final test’s command/);
  bad({ where: 'c:unity' }, /on this computer/);
  assert.deepEqual(cleanSpec({ ...SPEC, env: { A: 'b', HYDOR_HELD_OUT: '/x' } }).env, { A: 'b' });
});

// ---- sealing and checking -----------------------------------------------------------------------------------------

test('sealing and checking: changed, missing and added, with wildcards and links, and what Python leaves aside', async () => {
  const dir = path.join(tmp, 'seal');
  write(path.join(dir, 'score.py'), 'print(1)\n');
  write(path.join(dir, 'data', 'a', 'x.csv'), 'x\n');
  write(path.join(dir, 'data', 'a', 'notes.txt'), 'n\n');
  write(path.join(dir, 'lib', 'util.py'), 'u\n');
  write(path.join(dir, 'outside.txt'), 'o\n');
  fs.symlinkSync(held, path.join(dir, 'lib', 'link'));
  const ev = await createEvaluation(deps, { name: 'Seal', cwd: dir, command: 'true', metric: 'acc', better: 'higher', protect: ['score.py', 'data/**/*.csv', 'lib/'] });
  assert.equal(ev.seal.n, 1);
  assert.equal(ev.seal.files, 4, 'score.py, x.csv, util.py and the link, not followed');
  assert.ok(ev.state.ok);
  assert.ok((await check(db, ev, dir)).ok);
  write(path.join(dir, 'data', 'a', 'notes.txt'), 'changed, but not protected\n');
  write(path.join(dir, 'lib', '__pycache__', 'util.pyc'), 'compiled');
  assert.ok((await check(db, ev, dir)).ok, 'unprotected and compiled files are no change');
  write(path.join(dir, 'score.py'), 'print(2)\n');
  fs.rmSync(path.join(dir, 'data', 'a', 'x.csv'));
  write(path.join(dir, 'data', 'b', 'new.csv'), 'new\n');
  write(path.join(dir, 'lib', 'extra.py'), 'e\n');
  const state = await check(db, ev, dir);
  assert.equal(state.ok, false);
  assert.deepEqual(
    state.changed.map((c) => `${c.what} ${c.path}`).sort(),
    ['added data/b/new.csv', 'added lib/extra.py', 'changed score.py', 'missing data/a/x.csv'],
  );
  fs.rmSync(path.join(dir, 'lib', 'link'));
  fs.symlinkSync(foreign, path.join(dir, 'lib', 'link'));
  assert.ok((await check(db, ev, dir)).changed.some((c) => c.path === 'lib/link' && c.what === 'changed'), 'a link sent elsewhere');
  // Same size and time as before is still read again: the file's change time differs.
  const file = path.join(dir, 'lib', 'util.py');
  const at = fs.statSync(file);
  await sleep(20);
  fs.writeFileSync(file, 'v\n');
  fs.utimesSync(file, at.atime, at.mtime);
  assert.ok((await check(db, ev, dir)).changed.some((c) => c.path === 'lib/util.py'));
  const diffs = await changesOf(db, ev.id);
  const score = diffs.changes.find((c) => c.path === 'score.py')!;
  assert.match(score.diff!, /^--- sealed\/score\.py\n\+\+\+ now\/score\.py\n@@/);
  assert.match(score.diff!, /\n-print\(1\)\n\+print\(2\)/);
  assert.ok(!score.diff!.includes(tmp), 'a diff names no folder of this computer');
  assert.equal((await call('DELETE', `/api/experiments/evaluations/${ev.id}`)).status, 200);
  assert.equal(getEvaluation(db, ev.id), null);
});

// A disk elsewhere, and projects whose data is a link to it, as data very often is.
const OUTSIDE = 'It is outside the folder, behind a link: put it back by hand';
function linkedProject(name: string) {
  const dir = path.join(tmp, name);
  const disk = path.join(tmp, `${name}-disk`);
  write(path.join(disk, 'data', 'test.csv'), 'a,1\n');
  write(path.join(disk, 'data', 'sub', 'more.csv'), 'b,2\n');
  fs.symlinkSync('test.csv', path.join(disk, 'data', 'latest'));
  write(path.join(disk, 'labels.txt'), 'yes\n');
  write(path.join(dir, 'score.sh'), 'grep -q a data/test.csv && grep -q yes labels.txt && echo acc=1\n');
  write(path.join(dir, 'lib', 'util.py'), 'u = 1\n');
  fs.symlinkSync(path.join(disk, 'data'), path.join(dir, 'data'));
  fs.symlinkSync(path.join(disk, 'labels.txt'), path.join(dir, 'labels.txt'));
  return { dir, disk };
}
const words = (state: { changed: { path: string; what: string }[] }) => state.changed.map((c) => `${c.what} ${c.path}`).sort();

test('a protected path that is a link out of the folder is sealed by what is behind it, and never written through', async () => {
  const { dir, disk } = linkedProject('linked');
  const behind = path.join(disk, 'data', 'test.csv');
  const ev = await createEvaluation(deps, { name: 'Linked', cwd: dir, command: 'sh score.sh', metric: 'acc', better: 'higher', protect: ['score.sh', 'data', 'labels.txt', 'lib/'], gpus: 0 });
  assert.deepEqual(ev.protect, ['score.sh', 'data/', 'labels.txt', 'lib/']);
  assert.equal(ev.seal.files, 6, 'score.sh, util.py, labels.txt, the two files behind data/ and the link inside it, not followed');
  const now = async () => words(await check(db, ev, dir));
  const restore = async () => (await call('POST', `/api/experiments/evaluations/${ev.id}/restore`, {})).body;
  assert.deepEqual(await now(), []);
  assert.equal((await scoreNow(ev.id)).status, 'done');

  // A change behind the link is seen, and putting back does not write there.
  write(behind, 'a,1,easier\n');
  write(path.join(disk, 'data', 'new.csv'), 'c\n');
  fs.rmSync(path.join(disk, 'data', 'sub', 'more.csv'));
  write(path.join(disk, 'labels.txt'), 'yes, all\n');
  assert.deepEqual(await now(), ['added data/new.csv', 'changed data/test.csv', 'changed labels.txt', 'missing data/sub/more.csv']);
  assert.equal((await call('POST', `/api/experiments/evaluations/${ev.id}/scores`, {})).status, 409);
  const diffs = (await changesOf(db, ev.id)).changes;
  assert.match(diffs.find((c) => c.path === 'labels.txt')!.diff!, /\n-yes\n\+yes, all/);
  assert.match(diffs.find((c) => c.path === 'data/test.csv')!.diff!, /\+a,1,easier/);
  const back = await restore();
  assert.deepEqual(back.restored, []);
  assert.deepEqual(
    Object.fromEntries(back.left.map((x: { path: string; why: string }) => [x.path, x.why])),
    { 'data/sub/more.csv': OUTSIDE, 'data/test.csv': OUTSIDE, 'labels.txt': OUTSIDE, 'data/new.csv': 'It was added since, outside the folder, behind a link: remove it by hand if it should not be there' },
  );
  assert.equal(fs.readFileSync(behind, 'utf8'), 'a,1,easier\n');
  assert.equal(fs.readFileSync(path.join(disk, 'labels.txt'), 'utf8'), 'yes, all\n');
  assert.ok(!fs.existsSync(path.join(disk, 'data', 'sub', 'more.csv')));
  write(behind, 'a,1\n');
  write(path.join(disk, 'data', 'sub', 'more.csv'), 'b,2\n');
  write(path.join(disk, 'labels.txt'), 'yes\n');
  fs.rmSync(path.join(disk, 'data', 'new.csv'));
  assert.deepEqual(await now(), []);

  // The link sent elsewhere shows, even to the same content; the link itself, in the folder, is put back.
  const copy = path.join(tmp, 'linked-copy');
  fs.cpSync(disk, copy, { recursive: true, verbatimSymlinks: true });
  const point = (name: string, to: string) => {
    fs.rmSync(path.join(dir, name), { recursive: true, force: true });
    fs.symlinkSync(to, path.join(dir, name));
  };
  point('data', path.join(copy, 'data'));
  point('labels.txt', path.join(copy, 'labels.txt'));
  assert.deepEqual(await now(), ['changed data', 'changed labels.txt']);
  const moved = (await changesOf(db, ev.id)).changes.find((c) => c.path === 'data')!;
  assert.ok(moved.diff!.includes(`-a link to ${path.join(disk, 'data')}\n+a link to ${path.join(copy, 'data')}`));
  write(path.join(copy, 'data', 'test.csv'), 'a,other\n');
  const home = await restore();
  assert.deepEqual([home.restored.sort(), home.left, home.state.ok], [['data', 'labels.txt'], [], true]);
  assert.equal(fs.readlinkSync(path.join(dir, 'data')), path.join(disk, 'data'));
  assert.equal(fs.readFileSync(path.join(copy, 'data', 'test.csv'), 'utf8'), 'a,other\n', 'nothing written where it was sent');

  // The link gone: it is made again, and no folder is made in its place.
  fs.rmSync(path.join(dir, 'data'));
  assert.ok((await now()).includes('missing data'));
  assert.deepEqual((await restore()).restored, ['data']);
  assert.ok(fs.lstatSync(path.join(dir, 'data')).isSymbolicLink());
  assert.deepEqual(await now(), []);

  // A real folder where the link was is left as it is, and so is what the link led to.
  fs.rmSync(path.join(dir, 'data'));
  write(path.join(dir, 'data', 'test.csv'), 'mine\n');
  const kept = await restore();
  assert.deepEqual(kept.restored, []);
  assert.equal(kept.left.find((x: { path: string }) => x.path === 'data').why, 'There is a folder where the link was');
  assert.equal(kept.left.find((x: { path: string }) => x.path === 'data/test.csv').why, OUTSIDE);
  assert.equal(fs.readFileSync(path.join(dir, 'data', 'test.csv'), 'utf8'), 'mine\n');
  point('data', path.join(disk, 'data'));

  // A link where a folder was.
  fs.cpSync(path.join(dir, 'lib'), path.join(copy, 'lib'), { recursive: true });
  point('lib', path.join(copy, 'lib'));
  assert.deepEqual(await now(), ['changed lib']);
  write(path.join(copy, 'lib', 'util.py'), 'u = 2\n');
  const lib = await restore();
  assert.deepEqual(lib.restored, []);
  assert.match(lib.left.find((x: { path: string }) => x.path === 'lib').why, /was not when it was sealed/);
  assert.equal(fs.readFileSync(path.join(copy, 'lib', 'util.py'), 'utf8'), 'u = 2\n');
  await call('DELETE', `/api/experiments/evaluations/${ev.id}`);
  assert.equal(fs.readFileSync(behind, 'utf8'), 'a,1\n', 'removing it leaves what is behind the links');

  // A link with nothing behind it protects nothing.
  point('data', path.join(tmp, 'unplugged'));
  await assert.rejects(createEvaluation(deps, { ...ev, protect: ['data'] }), /link out of the folder with nothing behind it/);
});

test('a link out of the folder is checked the same way in a worktree, lent or tracked', async () => {
  for (const tracked of [false, true]) {
    const { dir, disk } = linkedProject(tracked ? 'tracked' : 'lent');
    if (!tracked) write(path.join(dir, '.gitignore'), 'data\nlabels.txt\n');
    gitIn(dir, 'init', '-q', '-b', 'main');
    gitIn(dir, 'add', '.');
    gitIn(dir, 'commit', '-q', '-m', 'first');
    const tree = `${dir}-tree`;
    gitIn(dir, 'worktree', 'add', '-q', '-b', 'other', tree);
    // One protected through the link, one that is the link itself.
    const ev = await createEvaluation(deps, { name: 'Tree', cwd: dir, command: 'sh score.sh', metric: 'acc', better: 'higher', protect: ['score.sh', 'data/test.csv', 'labels.txt'], gpus: 0 });
    assert.equal(ev.seal.files, 3);
    assert.ok((await check(db, ev, tree, { absentOk: true })).ok);
    const s = await scoreNow(ev.id, { folder: tree });
    assert.equal(s.status, 'done', s.why);
    assert.deepEqual(s.lent, tracked ? undefined : ['data', 'labels.txt'], 'the link itself is lent');
    if (!tracked) assert.equal(fs.readlinkSync(path.join(tree, 'data')), path.join(dir, 'data'));
    write(path.join(disk, 'data', 'test.csv'), 'a,changed\n');
    await assert.rejects(startScore(deps, ev.id, { kind: 'score', folder: tree, by: you }), /changed since it was sealed: data\/test\.csv/);
    write(path.join(disk, 'data', 'test.csv'), 'a,1\n');
    // Sent elsewhere: in the worktree when it has its own link, else at home, where the lent one leads.
    const where = tracked ? tree : dir;
    fs.cpSync(disk, `${disk}-copy`, { recursive: true, verbatimSymlinks: true });
    fs.rmSync(path.join(where, 'data'));
    fs.symlinkSync(path.join(`${disk}-copy`, 'data'), path.join(where, 'data'));
    await assert.rejects(startScore(deps, ev.id, { kind: 'score', folder: tree, by: you }), /changed since it was sealed: data$/);
    const back = (await call('POST', `/api/experiments/evaluations/${ev.id}/restore`, { folder: tree })).body;
    assert.deepEqual([back.restored, back.left, back.state.ok], [['data'], [], true]);
    assert.equal(fs.readlinkSync(path.join(where, 'data')), path.join(disk, 'data'));
    await call('DELETE', `/api/experiments/evaluations/${ev.id}`);
  }
});

test('a protected path must match, and too much to seal is refused in words', async () => {
  await assert.rejects(createEvaluation(deps, { ...SPEC, protect: ['nothing.py'] }), /Nothing in the folder matches “nothing\.py”/);
  const before = { ...limits };
  try {
    limits.files = 2;
    await assert.rejects(createEvaluation(deps, SPEC), (e: HttpError) => e.status === 400 && /too much to seal.*name fewer or smaller folders/.test(e.message));
    limits.files = before.files;
    limits.bytes = 5;
    await assert.rejects(createEvaluation(deps, SPEC), /too much to seal/);
  } finally {
    Object.assign(limits, before);
  }
  assert.equal((await call('GET', '/api/experiments/evaluations')).body.evaluations.length, 0);
});

// ---- routes and folders --------------------------------------------------------------------------------------------

test('the person creates one; its folders are its home and its worktrees, and a foreign folder is refused', async () => {
  const refused = await call('POST', '/api/experiments/evaluations', SPEC, true);
  assert.equal(refused.status, 403);
  assert.match(refused.body.error, /Only the person creates and seals/);
  const made = await call('POST', '/api/experiments/evaluations', SPEC);
  assert.equal(made.status, 200, JSON.stringify(made.body));
  main = made.body.evaluation;
  assert.equal(main.seal.n, 1);
  assert.equal(main.seal.files, 4, 'eval.sh, data/test.csv, tests/check.py and the held-out answers');
  assert.equal(main.finals, 0);
  assert.ok(told.some((e) => e.data?.evals?.includes(main.id)));
  const one = (await call('GET', `/api/experiments/evaluations/${main.id}`)).body;
  assert.deepEqual(one.folders, [
    { path: repo, branch: 'main', home: true },
    { path: work, branch: 'better', home: false },
  ]);
  assert.equal(one.evaluation.final.heldOut, held);
  const asAgent = (await call('GET', `/api/experiments/evaluations/${main.id}`, undefined, true)).body;
  assert.deepEqual(asAgent.evaluation.final, { command: 'sh final.sh' }, 'where the held-out data is stays out');
  for (const cwd of [repo, work, path.join(repo, 'tests'), tmp]) assert.equal((await call('GET', `/api/experiments/evaluations?cwd=${encodeURIComponent(cwd)}`)).body.evaluations.length, 1, cwd);
  assert.equal((await call('GET', `/api/experiments/evaluations?cwd=${encodeURIComponent(foreign)}`)).body.evaluations.length, 0);
  const no = await call('POST', `/api/experiments/evaluations/${main.id}/scores`, { folder: foreign });
  assert.equal(no.status, 400);
  assert.match(no.body.error, /cannot be scored.*git worktree of the same repository/);
  assert.equal((await rootFor(main, path.join(repo, 'tests')))!, repo, 'a subfolder without the scorer stands for the home');
  assert.equal(await rootFor(main, path.join(work, 'tests')), work);
  assert.equal(await rootFor(main, foreign), null);
  // Another folder of the same checkout is not a worktree.
  const side = path.join(repo, 'side');
  write(path.join(side, 'eval', 's.sh'), 'echo acc=1\n');
  const nested = await createEvaluation(deps, { name: 'Nested', cwd: path.join(side, 'eval'), command: 'sh s.sh', metric: 'acc', better: 'higher', protect: ['s.sh'], gpus: 0 });
  await assert.rejects(allowedFolder(nested, path.join(repo, 'tests')), /cannot be scored/);
  assert.equal(await allowedFolder(nested, work), work, 'a worktree’s top, without the part, stands as it is');
  await call('DELETE', `/api/experiments/evaluations/${nested.id}`);
  fs.rmSync(side, { recursive: true });
});

// ---- scores ------------------------------------------------------------------------------------------------------

let homeScore: EvalScore;

test('a score over three seeds: one run each, the number read by the app, mean and std', async () => {
  const r = await call('POST', `/api/experiments/evaluations/${main.id}/scores`, {});
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.score.runs.length, 3);
  assert.deepEqual(r.body.score.seeds, [1, 2, 3]);
  homeScore = await over(r.body.score.id);
  assert.equal(homeScore.status, 'done', homeScore.why);
  assert.deepEqual(homeScore.values, [0.51, 0.52, 0.53]);
  near(homeScore.mean, 0.52, 'mean');
  near(homeScore.std, 0.01, 'std');
  assert.equal(homeScore.commit, head);
  assert.equal(homeScore.branch, 'main');
  assert.deepEqual(homeScore.by, { who: 'you' });
  const run = getRun(db, homeScore.runs[1])!;
  assert.equal(run.name, 'Accuracy · seed 2');
  assert.equal(run.command, 'sh eval.sh 2');
  assert.equal(run.seed, 2);
  assert.equal(run.group, `eval-${main.id}`);
  assert.deepEqual(run.tags, ['evaluation']);
  assert.equal(run.env!.HYDOR_EVALUATION, main.id);
  assert.equal(run.env!.HYDOR_EVAL_KIND, 'score');
  assert.equal(run.env!.HYDOR_HELD_OUT, undefined);
  assert.deepEqual(run.sealed, [{ evaluation: main.id, name: 'Accuracy', ok: true }]);
  const listed = (await call('GET', '/api/experiments/evaluations')).body.evaluations[0];
  assert.equal(listed.last.id, homeScore.id);
  assert.equal(listed.baselineScore, undefined);
});

test('a worktree is lent the data git does not track, and the score says so', async () => {
  assert.ok(!fs.existsSync(path.join(work, 'data')));
  const s = await scoreNow(main.id, { folder: work });
  assert.equal(s.status, 'done', s.why);
  assert.deepEqual(s.lent, ['data']);
  assert.equal(fs.readlinkSync(path.join(work, 'data')), path.join(repo, 'data'));
  assert.deepEqual(s.values, [0.91, 0.92, 0.93]);
  assert.equal(s.branch, 'better');
  assert.equal(s.dirty, true);
  const again = await scoreNow(main.id, { folder: work });
  assert.deepEqual(again.lent, ['data'], 'what is read from the home is said each time');
});

test('a tracked file that is missing in a worktree stays missing: 409 with the paths, and nothing runs', async () => {
  fs.rmSync(path.join(work, 'tests', 'check.py'));
  const n = listRuns(db).length;
  const r = await call('POST', `/api/experiments/evaluations/${main.id}/scores`, { folder: work });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /The scorer or its data changed since it was sealed: tests\/check\.py \(missing\)/);
  assert.deepEqual(r.body.changed, [{ path: 'tests/check.py', what: 'missing' }]);
  assert.equal(listRuns(db).length, n);
  const back = await call('POST', `/api/experiments/evaluations/${main.id}/restore`, { folder: work }, true);
  assert.deepEqual(back.body.restored, ['tests/check.py']);
  assert.ok(back.body.state.ok);
});

test('a command without {seed} runs once; a number not printed and a failed run fail the score', async () => {
  const dir = path.join(tmp, 'plain');
  write(path.join(dir, 'a.sh'), 'echo "loss=0.5 f1=0.25"\n');
  const base = { cwd: dir, better: 'higher', protect: ['a.sh'], gpus: 0 };
  const once = await createEvaluation(deps, { ...base, name: 'Once', command: 'sh a.sh', metric: 'F1' });
  const s = await scoreNow(once.id);
  assert.equal(s.status, 'done', s.why);
  assert.deepEqual([s.runs.length, s.seeds, s.values, s.std], [1, [], [0.25], 0], 'the name is found, case aside');
  assert.equal(getRun(db, s.runs[0])!.name, 'Once');

  const none = await createEvaluation(deps, { ...base, name: 'None', command: 'sh a.sh', metric: 'accuracy' });
  const n = await scoreNow(none.id);
  assert.equal(n.status, 'failed');
  assert.equal(n.why, 'It printed no number called “accuracy”');
  assert.deepEqual(n.printed, ['loss', 'f1']);
  assert.equal(n.failedRun, n.runs[0]);

  const bad = await createEvaluation(deps, { ...base, name: 'Bad', command: 'echo "f1=0.9"; exit 3', metric: 'f1' });
  const b = await scoreNow(bad.id);
  assert.equal(b.status, 'failed');
  assert.match(b.why!, /The run “Bad” failed: Its command ended with exit code 3/);
  assert.equal(b.values.length, 0, 'a number printed by a run that failed does not count');

  const nan = await createEvaluation(deps, { ...base, name: 'NaN', command: 'echo "f1=nan"', metric: 'f1' });
  assert.match((await scoreNow(nan.id)).why!, /not a real number/);
  for (const e of [once, none, bad, nan]) await call('DELETE', `/api/experiments/evaluations/${e.id}`);
  assert.equal(listRuns(db, { group: `eval-${once.id}` }).length, 0, 'removing it takes its runs’ records');
});

test('files changed after a score was asked for, or by the run itself, give no number', async () => {
  setSettings(db, { cpuSlots: 1 });
  const wait = await submit(deps, await cleanJob(db, { command: 'sleep 1.5', cwd: foreign, gpus: 0 }));
  await until(() => getRun(db, wait.id)!.status === 'running');
  const asked = await startScore(deps, main.id, { kind: 'score', by: you });
  assert.equal(asked.status, 'waiting');
  write(path.join(repo, 'eval.sh'), 'echo "acc=1.0"\n');
  const s = await over(asked.id);
  setSettings(db, { cpuSlots: 4 });
  assert.equal(s.status, 'failed');
  assert.match(s.why!, /changed after the score was asked for: eval\.sh/);
  assert.match(getRun(db, s.runs[0])!.why!, /It could not start: The scorer or its data changed since it was sealed: eval\.sh/);
  write(path.join(repo, 'eval.sh'), SCORER);

  const dir = path.join(tmp, 'self');
  write(path.join(dir, 'data.txt'), '1\n');
  const self = await createEvaluation(deps, { name: 'Self', cwd: dir, command: 'echo 2 >> data.txt; echo acc=1', metric: 'acc', better: 'higher', protect: ['data.txt'], gpus: 0 });
  const t = await scoreNow(self.id);
  assert.equal(t.status, 'failed');
  assert.match(t.why!, /changed while it was being scored: data\.txt/);
  await call('DELETE', `/api/experiments/evaluations/${self.id}`);
});

// ---- the baseline and the final test ---------------------------------------------------------------------------------

let baseId = '';

test('the baseline is the person’s; scores are compared with it', async () => {
  await assert.rejects(startScore(deps, main.id, { kind: 'baseline', by: { who: 'agent' } }), /Only the person sets the baseline/);
  assert.equal((await call('POST', `/api/experiments/evaluations/${main.id}/baseline`, {}, true)).status, 403);
  assert.equal((await call('POST', `/api/experiments/evaluations/${main.id}/baseline`, { score: homeScore.id }, true)).status, 403);
  const measured = await call('POST', `/api/experiments/evaluations/${main.id}/baseline`, {});
  assert.equal(measured.status, 200, JSON.stringify(measured.body));
  const base = await over(measured.body.score.id);
  assert.equal(base.kind, 'baseline');
  assert.equal(base.against, undefined);
  baseId = base.id;
  assert.equal(getEvaluation(db, main.id)!.baseline, base.id);
  const better = await scoreNow(main.id, { folder: work });
  assert.equal(better.against!.baseline, base.id);
  assert.equal(better.against!.verdict, 'better');
  near(better.against!.delta, 0.4);
  assert.ok(better.against!.p! < 0.05);
  assert.equal(getScore(db, homeScore.id)!.against!.verdict, 'same', 'an earlier score is compared with it too');
  const used = await call('POST', `/api/experiments/evaluations/${main.id}/baseline`, { score: homeScore.id });
  assert.equal(used.body.evaluation.baseline, homeScore.id);
  assert.equal(getScore(db, homeScore.id)!.against, undefined, 'not against itself');
  await call('POST', `/api/experiments/evaluations/${main.id}/baseline`, { score: base.id });
  assert.equal((await call('GET', '/api/experiments/evaluations')).body.evaluations[0].baselineScore.id, base.id);
});

let finalScore: EvalScore;

test('the final test is the person’s: its command reads the held-out folder, and agents never see its numbers', async () => {
  await assert.rejects(startScore(deps, main.id, { kind: 'final', by: { who: 'agent' } }), /Only the person runs the final test/);
  await assert.rejects(startScore(deps, main.id, { kind: 'final', by: { who: 'app' } }), /Only the person/);
  await assert.rejects(startScore(deps, main.id, { kind: 'final', by: { who: 'goal', session: 'claude:a-goal' } }), /Only the person runs the final test/, 'a goal never runs it');
  await assert.rejects(startScore(deps, main.id, { kind: 'baseline', by: { who: 'goal', session: 'claude:a-goal' } }), /Only the person sets the baseline/);
  for (const [method, body] of [['POST', {}], ['GET', undefined]] as const) assert.equal((await call(method, `/api/experiments/evaluations/${main.id}/final`, body, true)).status, 403, method);
  const r = await call('POST', `/api/experiments/evaluations/${main.id}/final`, {});
  assert.equal(r.status, 200, JSON.stringify(r.body));
  finalScore = await over(r.body.score.id);
  assert.equal(finalScore.status, 'done', finalScore.why);
  assert.deepEqual(finalScore.values, [0.77]);
  assert.equal(finalScore.against, undefined);
  assert.equal(getRun(db, finalScore.runs[0])!.env!.HYDOR_HELD_OUT, held);
  assert.equal(getEvaluation(db, main.id)!.finals, 1);
  assert.deepEqual((await call('GET', `/api/experiments/evaluations/${main.id}/final`)).body.scores.map((s: EvalScore) => s.id), [finalScore.id]);
  const one = (await call('GET', `/api/experiments/evaluations/${main.id}`)).body;
  assert.ok(one.scores.length && one.scores.every((s: EvalScore) => s.kind !== 'final'));
  assert.ok(!JSON.stringify(one).includes('0.77'));
  assert.ok(!JSON.stringify((await call('GET', '/api/experiments/evaluations')).body).includes('0.77'));
  assert.equal((await call('GET', `/api/experiments/evaluations/scores/${finalScore.id}`)).status, 404);
  // Its run, through app_api.
  const run = finalScore.runs[0];
  for (const url of [`/api/experiments/runs/${run}`, `/api/experiments/runs/${run}/log`, `/api/experiments/runs/${run}/patch`]) {
    assert.equal((await call('GET', url, undefined, true)).status, 403, url);
    assert.equal((await call('GET', url)).status, 200, url);
  }
  assert.ok(!(await call('GET', `/api/experiments/runs?group=eval-${main.id}`, undefined, true)).body.runs.some((x: { id: string }) => x.id === run));
  assert.deepEqual((await call('GET', `/api/experiments/series?runs=${run}`, undefined, true)).body.series, {});
  assert.equal((await call('POST', '/api/experiments/tables/preview', { runs: [run], columns: ['acc'] }, true)).status, 403);
  assert.ok(!JSON.stringify((await call('POST', '/api/experiments/tables/preview', { group: `eval-${main.id}`, columns: ['acc'] }, true)).body).includes(run), 'a group’s table leaves it out');
  assert.equal((await call('POST', `/api/experiments/runs/${run}/again`, {})).status, 400, 'not run again on its own');
});

test('what an agent may do through app_api: read, ask for a score, put files back; nothing else', () => {
  const e = '/api/experiments/evaluations';
  const level = (m: string, p: string) => ruleFor(m, p).level;
  for (const p of [e, `${e}/e1abc`, `${e}/e1abc/changes`, `${e}/scores/c1abc`]) assert.equal(level('GET', p), 'free', p);
  assert.equal(level('POST', `${e}/e1abc/scores`), 'always');
  assert.equal(level('POST', `${e}/e1abc/restore`), 'always');
  for (const [m, p] of [
    ['POST', e],
    ['PUT', `${e}/e1abc`],
    ['DELETE', `${e}/e1abc`],
    ['DELETE', `${e}/scores/c1abc`],
    ['POST', `${e}/e1abc/seal`],
    ['POST', `${e}/e1abc/baseline`],
    ['POST', `${e}/e1abc/final`],
    ['GET', `${e}/e1abc/final`],
  ]) {
    assert.equal(level(m, p), 'refuse', `${m} ${p}`);
    assert.match(ruleFor(m, p).why!, /Only the person/);
  }
});

// ---- putting files back, and edits -------------------------------------------------------------------------------

test('changed files refuse a score with a 409 naming them; put back, the same score passes', async () => {
  write(path.join(repo, 'eval.sh'), 'echo "acc=0.99"\n');
  write(path.join(repo, 'data', 'test.csv'), 'easier\n');
  write(path.join(repo, 'tests', 'extra.py'), 'x = 1\n');
  write(path.join(held, 'answers.txt'), 'acc=1.0\n');
  const r = await call('POST', `/api/experiments/evaluations/${main.id}/scores`, {}, true);
  assert.equal(r.status, 409);
  assert.deepEqual(r.body.changed.map((c: { path: string; what: string }) => `${c.what} ${c.path}`).sort(), ['added tests/extra.py', 'changed data/test.csv', 'changed eval.sh', 'changed held-out:answers.txt']);
  assert.match(r.body.error, /answers\.txt in the held-out folder/);
  assert.equal((await call('GET', `/api/experiments/evaluations/${main.id}`)).body.evaluation.state.ok, false);
  const mine = (await call('GET', `/api/experiments/evaluations/${main.id}/changes`)).body.changes;
  assert.match(mine.find((c: { path: string }) => c.path === 'held-out:answers.txt').diff, /acc=0\.77/);
  const theirs = (await call('GET', `/api/experiments/evaluations/${main.id}/changes`, undefined, true)).body.changes;
  assert.equal(theirs.find((c: { path: string }) => c.path === 'held-out:answers.txt').diff, undefined, 'no held-out data in an agent’s diff');
  assert.ok(theirs.find((c: { path: string }) => c.path === 'eval.sh').diff);
  const back = (await call('POST', `/api/experiments/evaluations/${main.id}/restore`, {})).body;
  assert.deepEqual(back.restored.sort(), ['data/test.csv', 'eval.sh', 'held-out:answers.txt']);
  assert.deepEqual(back.left.map((x: { path: string }) => x.path), ['tests/extra.py']);
  assert.equal(back.state.ok, false, 'what was added stays until it is removed');
  assert.equal(fs.readFileSync(path.join(repo, 'eval.sh'), 'utf8'), SCORER);
  fs.rmSync(path.join(repo, 'tests', 'extra.py'));
  const s = await scoreNow(main.id);
  assert.equal(s.status, 'done', s.why);
  assert.deepEqual(s.values, [0.51, 0.52, 0.53]);
  assert.equal((await call('POST', `/api/experiments/evaluations/${main.id}/scores`, { seeds: [7] }, true)).status, 403, 'an agent does not pick the seeds');
});

test('an edit seals again only when what is scored changed: the number goes up and the baseline goes', async () => {
  assert.equal((await call('PUT', `/api/experiments/evaluations/${main.id}`, { name: 'x' }, true)).status, 403);
  const renamed = (await call('PUT', `/api/experiments/evaluations/${main.id}`, { name: 'Accuracy on test', hours: 1 })).body;
  assert.deepEqual([renamed.sealed, renamed.evaluation.seal.n, renamed.evaluation.baseline, renamed.evaluation.finals, renamed.evaluation.name], [false, 1, baseId, 1, 'Accuracy on test']);
  assert.equal((await call('PUT', `/api/experiments/evaluations/${main.id}`, { protect: ['eval.sh', 'data', 'tests/*.py'] })).body.sealed, false);
  assert.equal((await call('POST', `/api/experiments/evaluations/${main.id}/seal`, {}, true)).status, 403);
  const edited = await updateEvaluation(deps, main.id, { seeds: [1, 2] });
  assert.deepEqual([edited.sealed, edited.evaluation.seal.n, edited.evaluation.baseline, edited.evaluation.finals], [true, 2, undefined, 0]);
  assert.equal(getScore(db, homeScore.id)!.seal, 1, 'older scores stay, marked by their seal');
  assert.equal((await call('POST', `/api/experiments/evaluations/${main.id}/baseline`, { score: homeScore.id })).status, 400);
  assert.equal((await call('GET', '/api/experiments/evaluations')).body.evaluations[0].last, undefined);
  const again = (await call('POST', `/api/experiments/evaluations/${main.id}/seal`, {})).body.evaluation;
  assert.equal(again.seal.n, 3);
  assert.equal((await updateEvaluation(deps, main.id, { seeds: [1, 2, 3] })).evaluation.seal.n, 4);
  assert.deepEqual(fs.readdirSync(path.join(process.env.DATA_DIR!, 'experiments', 'evals', main.id)), ['4'], 'the older copies go');
  // A variable can change the number (a split’s name): it seals again, like the command; the same ones do not.
  const env = async (value: Record<string, string> | null) => {
    const r = await updateEvaluation(deps, main.id, { env: value });
    return [r.sealed, r.evaluation.seal.n];
  };
  assert.deepEqual(await env({ SPLIT: 'test', LANG_SET: 'en' }), [true, 5]);
  assert.deepEqual(await env({ LANG_SET: 'en', SPLIT: 'test' }), [false, 5]);
  await call('POST', `/api/experiments/evaluations/${main.id}/baseline`, {}).then((r) => over(r.body.score.id));
  assert.deepEqual(await env({ SPLIT: 'dev', LANG_SET: 'en' }), [true, 6]);
  assert.equal(getEvaluation(db, main.id)!.baseline, undefined);
  assert.deepEqual(await env(null), [true, 7]);
  assert.deepEqual(await env({}), [false, 7]);
});

// ---- other runs --------------------------------------------------------------------------------------------------

let plainOk = '';
let plainChanged = '';

test('every other run in its folders is marked with whether the sealed files were as sealed', async () => {
  const job = async (cwd: string) => {
    const r = await submit(deps, await cleanJob(db, { command: 'echo loss=1', cwd, gpus: 0, group: 'training' }));
    await runOver(r.id);
    assert.equal(getRun(db, r.id)!.status, 'done', 'marking never fails a run');
    return getRun(db, r.id)!;
  };
  const ok = await job(path.join(repo, 'tests'));
  plainOk = ok.id;
  assert.deepEqual(ok.sealed, [{ evaluation: main.id, name: 'Accuracy on test', ok: true }]);
  // A fresh worktree without the untracked data is not a change.
  const fresh = path.join(tmp, 'fresh');
  gitIn(repo, 'worktree', 'add', '-q', '-b', 'fresh', fresh);
  assert.equal((await job(fresh)).sealed![0].ok, true);
  write(path.join(fresh, 'eval.sh'), 'echo acc=1\n');
  const bad = await job(fresh);
  plainChanged = bad.id;
  assert.deepEqual(bad.sealed, [{ evaluation: main.id, name: 'Accuracy on test', ok: false, changed: ['eval.sh'] }]);
  assert.equal((await job(foreign)).sealed, undefined);
});

test('scoring runs are left out of what lists experiments, unless asked for', async () => {
  const ids = async (query: string) => (await call('GET', `/api/experiments/runs?limit=1000${query}`)).body.runs.map((r: { id: string }) => r.id) as string[];
  const plain = await ids('');
  assert.ok(plain.includes(plainOk));
  assert.ok(!plain.includes(finalScore.runs[0]));
  assert.ok(!plain.some((id) => getRun(db, id)!.tags?.includes('evaluation')));
  assert.ok((await ids(`&group=eval-${main.id}`)).includes(finalScore.runs[0]));
  assert.ok((await ids('&evaluation=1')).includes(finalScore.runs[0]));
  const groups = async (query: string) => (await call('GET', `/api/experiments/groups${query}`)).body.groups.map((g: { name: string }) => g.name);
  assert.deepEqual(await groups(''), ['training']);
  assert.ok((await groups('?evaluation=1')).includes(`eval-${main.id}`));
  // A run of one's own that is only tagged so is an experiment like any other.
  const own = await submit(deps, await cleanJob(db, { command: 'true', cwd: foreign, gpus: 0, tags: ['evaluation'] }));
  assert.ok((await ids('')).includes(own.id));
  await runOver(own.id);
  // One running shows in the list of what runs now.
  const dir = path.join(tmp, 'slow');
  write(path.join(dir, 's.sh'), 'sleep 20; echo acc=1\n');
  const slow = await createEvaluation(deps, { name: 'Slow', cwd: dir, command: 'sh s.sh', metric: 'acc', better: 'higher', protect: ['s.sh'], gpus: 0 });
  const s = await startScore(deps, slow.id, { kind: 'score', by: you });
  await until(() => getRun(db, s.runs[0])!.status === 'running');
  assert.equal(getScore(db, s.id)!.status, 'running');
  assert.ok((await ids('&status=active')).includes(s.runs[0]));
  assert.equal((await call('DELETE', `/api/experiments/evaluations/scores/${s.id}`)).status, 409);
  assert.equal((await call('POST', `/api/experiments/evaluations/scores/${s.id}/stop`, {})).status, 200);
  const stopped = await over(s.id);
  assert.equal(stopped.status, 'stopped');
  assert.match(stopped.why!, /was stopped: Stopped by you/);
  assert.equal((await call('DELETE', `/api/experiments/evaluations/scores/${s.id}`, undefined, true)).status, 403);
  assert.equal((await call('DELETE', `/api/experiments/evaluations/scores/${s.id}`)).status, 200);
  assert.equal(getRun(db, s.runs[0]), null);
  const going = await startScore(deps, slow.id, { kind: 'score', by: you });
  await until(() => getRun(db, going.runs[0])!.status === 'running');
  assert.equal((await call('DELETE', `/api/experiments/evaluations/${slow.id}`)).status, 200, 'removing stops what runs');
  assert.equal(getRun(db, going.runs[0]), null);
  assert.equal(getScore(db, going.id), null);
});

test('a score whose runs ended while the app was not running is worked out when it starts again', async () => {
  const s = await scoreNow(main.id);
  db.prepare("update exp_scores set status = 'waiting', ended_at = null where id = ?").run(s.id);
  await resumeScores(deps);
  assert.equal(getScore(db, s.id)!.status, 'done');
  assert.equal((await waitScore(deps, s.id, 1000))!.status, 'done');
  assert.deepEqual(listScores(db, main.id, ['score'], 1).map((x) => x.id), [s.id]);
});

// ---- the tools ------------------------------------------------------------------------------------------------------

const ctx = (over: Partial<RunCtx> = {}): RunCtx => ({ runId: 'run-1', key: 'claude:abc', agent: 'claude', cwd: work, deps, ...over }) as RunCtx;
async function tool(name: string, args: Record<string, unknown>, c = ctx()): Promise<{ text: string; error: boolean; json: any }> {
  const t = experimentTools(c).find((x) => x.name === name);
  assert.ok(t, name);
  const out = await t.run(args, c);
  const text = typeof out === 'string' ? out : out.text;
  const error = typeof out !== 'string' && !!out.isError;
  return { text, error, json: error ? null : JSON.parse(text) };
}

test('evaluation_get reads the folder’s evaluations, and never a final test’s numbers', async () => {
  await call('POST', `/api/experiments/evaluations/${main.id}/baseline`, {}).then((r) => over(r.body.score.id));
  const f = await over((await startScore(deps, main.id, { kind: 'final', by: you })).id);
  const got = await tool('evaluation_get', {});
  const [ev] = got.json.evaluations;
  assert.equal(ev.id, main.id);
  assert.deepEqual([ev.command, ev.metric, ev.better, ev.seeds], ['sh eval.sh {seed}', 'acc', 'higher', [1, 2, 3]]);
  assert.deepEqual(ev.protect, ['eval.sh', 'data/', 'tests/*.py']);
  assert.equal(ev.sealed.ok, true);
  assert.equal(ev.sealed.folder, work);
  assert.equal(ev.baseline.n, 3);
  near(ev.baseline.mean, 0.52);
  assert.ok(ev.scores.length >= 1 && ev.scores.length <= 5);
  assert.deepEqual(ev.finalTest, { set: true, runs: 1 });
  assert.ok(!got.text.includes('0.77') && !got.text.includes('final.sh') && !got.text.includes(held));
  assert.match((await tool('evaluation_get', { score: f.id })).text, /final test/);
  assert.equal((await tool('evaluation_get', { score: ev.scores[0].id })).json.id, ev.scores[0].id);
  assert.match((await tool('evaluation_get', {}, ctx({ cwd: foreign }))).json.note, /evaluation_propose/);
  // The experiments' tools keep the final test's runs to the person too.
  const run = f.runs[0];
  assert.match((await tool('experiment_get', { id: run })).text, /final test/);
  assert.ok(!(await tool('experiment_list', { group: `eval-${main.id}` })).json.runs.some((r: { id: string }) => r.id === run));
  assert.match((await tool('experiment_table', { runs: [run], columns: [{ metric: 'acc' }] })).text, /final test/);
  assert.match((await tool('experiment_run', { again: run })).text, /scored an evaluation/);
  assert.match((await tool('experiment_stop', { id: run })).text, /final test/);
});

test('experiment_get and experiment_list mark a run that started on changed files', async () => {
  assert.equal((await tool('experiment_get', { id: plainChanged })).json.run.sealChanged, true);
  assert.equal((await tool('experiment_get', { id: plainOk })).json.run.sealChanged, undefined);
  const listed = (await tool('experiment_list', { group: 'training', limit: 50 })).json.runs;
  assert.equal(listed.find((r: { id: string }) => r.id === plainChanged).sealChanged, true);
  assert.equal(listed.find((r: { id: string }) => r.id === plainOk).sealChanged, undefined);
});

test('evaluation_score asks as experiment_run does, scores the session’s folder and waits', async () => {
  const cards = sessions.cards.length;
  sessions.answer = 'deny';
  const no = await tool('evaluation_score', {});
  assert.ok(no.error);
  assert.match(no.text, /said no.*Nothing started/);
  assert.match(sessions.cards[cards].title, /Score “Accuracy on test”/);
  sessions.mode = 'plan';
  assert.match((await tool('evaluation_score', {})).text, /Plan mode/);
  sessions.mode = 'default';
  sessions.answer = 'accept';
  const s = (await tool('evaluation_score', { wait: 1 })).json;
  assert.equal(s.status, 'done', s.why);
  near(s.mean, 0.92);
  assert.equal(s.against.verdict, 'better');
  assert.equal(s.folder, work);
  assert.equal(s.runs.length, 3);
  assert.match(s.page, /^\/experiments\?evaluation=e/);
  assert.deepEqual(getScore(db, s.id)!.by, { who: 'agent', session: 'claude:abc' });
  const now = (await tool('evaluation_score', { id: main.id, wait: 0 })).json;
  assert.ok(['waiting', 'running'].includes(now.status));
  assert.match(now.note, /evaluation_get/);
  await over(now.id);
  assert.match((await tool('evaluation_score', { id: main.id, cwd: foreign })).text, /cannot be scored/);
  assert.match((await tool('evaluation_score', {}, ctx({ cwd: foreign }))).text, /no evaluation/);
  write(path.join(work, 'eval.sh'), 'echo acc=1\n');
  const changed = await tool('evaluation_score', {});
  assert.ok(changed.error);
  assert.match(changed.text, /changed since it was sealed: eval\.sh\. Nothing ran\. Put them back .*restore.*seal the evaluation again/s);
  write(path.join(work, 'eval.sh'), SCORER);
});

test('evaluation_propose asks the person on a card with every field, and creates it only when they say yes', async () => {
  assert.ok(!experimentTools(ctx({ step: true })).some((t) => t.name === 'evaluation_propose'), 'a step cannot ask');
  const dir = path.join(tmp, 'proposed');
  write(path.join(dir, 'score.sh'), 'echo err=0.1\n');
  const args = { name: 'Error rate', cwd: dir, command: 'sh score.sh --seed {seed}', metric: 'err', better: 'lower', seeds: [4, 5], protect: ['score.sh'], final: { command: 'sh score.sh --final', heldOut: held }, gpus: 0, hours: 2, why: 'It is the paper’s number.' };
  const count = () => (db.prepare('select count(*) n from exp_evals').get() as { n: number }).n;
  const before = count();
  // Full access asks too: only the person creates one.
  sessions.mode = 'bypassPermissions';
  sessions.answer = 'deny';
  const no = await tool('evaluation_propose', args);
  assert.ok(no.error);
  assert.match(no.text, /said no/);
  assert.equal(count(), before);
  const card = sessions.cards.at(-1)!;
  assert.match(card.title, /Create and seal the evaluation “Error rate”\?/);
  assert.deepEqual(
    card.options.map((o) => o.id),
    ['accept', 'deny'],
    'no allowing it for the session',
  );
  for (const words of ['Error rate', dir, 'sh score.sh --seed {seed}', '`err`, lower is better', '4, 5', '`score.sh`', '2 files', 'sh score.sh --final', held, '0 GPUs, at most 2 hours', 'It is the paper’s number.']) assert.ok(card.detail!.includes(words), words);
  sessions.answer = 'accept';
  const yes = await tool('evaluation_propose', args);
  assert.equal(yes.json.created, true, yes.text);
  assert.equal(count(), before + 1);
  assert.equal(getEvaluation(db, yes.json.id)!.seal.n, 1);
  assert.match((await tool('evaluation_propose', { ...args, protect: ['nothing'] })).text, /Nothing in the folder matches/);
  sessions.mode = 'plan';
  assert.match((await tool('evaluation_propose', args)).text, /only reads/);
  sessions.mode = 'default';
  await call('DELETE', `/api/experiments/evaluations/${yes.json.id}`);
});

test('steps may read and score, a confidential session may only read, and agents are told', async () => {
  assert.ok(STEP_TOOLS.includes('evaluation_get') && STEP_TOOLS.includes('evaluation_score'));
  assert.ok(!STEP_TOOLS.includes('evaluation_propose'));
  assert.ok(CONFIDENTIAL_TOOLS.has('evaluation_get') && !CONFIDENTIAL_TOOLS.has('evaluation_score'));
  assert.match(SPAWN_NOTE, /Experiments → Evaluations.*evaluation_score.*evaluation_propose.*break-the-result/);
  const step = (await tool('evaluation_score', { wait: 1 }, ctx({ step: true, key: 'acp:flow-1', runId: 'flow-1', agent: 'acp' }))).json;
  assert.equal(step.status, 'done', step.why);
  assert.deepEqual(getScore(db, step.id)!.by, { who: 'app' });
});

// ---- run ------------------------------------------------------------------------------------------------------

let failed = 0;
for (const [name, fn] of tests) {
  forgetNotices();
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}`);
    console.error(e);
  }
}
await stopTmuxServer();
await http.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} of ${tests.length} tests passed`);
process.exit(failed ? 1 : 0);
