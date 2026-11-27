// Checks for what is said of runs and how they are listed: the chains of attempts (what was said, the same job started
// again, a finished run repeated, a chain of four, no cycles), what each run shows as, notes (their length and who
// wrote them), stars, archiving a run and an experiment and bringing them back (the counts and the lists), several
// runs at once, the findings an experiment shows, results tables over archived runs, and the agents' tools. Records
// are put in directly: no job runs. Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/experiments/marks-test.ts
//   DATA_DIR="$(mktemp -d)" CUDA_VISIBLE_DEVICES= node dist/dev/marks-test.js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { attemptsOf, standingsOf } from '../../shared/experiment-attempts.ts';
import type { ExperimentGroup, RunRecord, RunStatus } from '../../shared/experiments.ts';
import { HttpError } from '../auth.ts';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { internalHeaders } from '../internal.ts';
import { recordFinding } from '../memory/findings.ts';
import { repoRoot } from '../memory/store.ts';
import { createSpace } from '../spaces/index.ts';
import { experiments } from './index.ts';
import { getRun, insertRun, recomputeTable, runFolder, saveTable, updateRun, workOut } from './records.ts';
import { experimentTools } from './tools.ts';

if (!process.env.DATA_DIR?.startsWith(os.tmpdir() + path.sep)) {
  console.error('Run with DATA_DIR in the temporary folder, so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-marks-test-'));
const db = openDb(path.join(tmp, 'test.db'));
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const sessions = Object.assign(new EventEmitter(), { summary: () => null, adapterByRun: () => null, deliverOrQueue: async () => {} });
const http = Fastify();
http.setErrorHandler((err: Error, _req, reply) => reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message }));
const deps = { app: http, db, sessions: sessions as any, scheduler: null as any, models: null as any, broadcast: () => {}, toSubscribers: () => {}, publicBase: () => 'http://test.local' } as unknown as Deps;
experiments.routes!(deps);
await http.ready();

let clock = 1_000_000;
interface Made {
  id: string;
  status?: RunStatus;
  group?: string;
  command?: string;
  from?: string;
  why?: string;
  seed?: number;
  env?: Record<string, string>;
  tags?: string[];
  at?: number;
  ended?: number;
  last?: Record<string, number>;
}
/** A record as if it had been run: each is made later than the one before, and ends before the next is made. */
function made(m: Made): string {
  const at = m.at ?? (clock += 100);
  const status = m.status ?? 'done';
  insertRun(db, { id: m.id, status, why: m.why, createdAt: at, info: { folder: runFolder(m.id), ...(m.from ? { from: m.from } : {}) }, spec: { command: m.command ?? `python train.py --run ${m.id}`, cwd: tmp, group: m.group, name: m.id, seed: m.seed, env: m.env, tags: m.tags } });
  const over = !['queued', 'waiting', 'starting', 'running'].includes(status);
  updateRun(db, m.id, { startedAt: at + 1, ...(over ? { endedAt: m.ended ?? at + 50 } : {}), ...(m.last ? { metrics: { last: m.last } } : {}) });
  return m.id;
}
const list = async (q: string): Promise<RunRecord[]> => (await http.inject({ method: 'GET', url: `/api/experiments/runs?${q}` })).json().runs;
const byId = async (group: string) => new Map((await list(`group=${group}`)).map((r) => [r.id, r]));
const groupOf = async (name: string): Promise<ExperimentGroup> => (await http.inject({ method: 'GET', url: '/api/experiments/groups' })).json().groups.find((g: ExperimentGroup) => g.name === name);
const patch = (id: string, payload: Record<string, unknown>, headers: Record<string, string> = {}) => http.inject({ method: 'PATCH', url: `/api/experiments/runs/${id}`, payload, headers });
const bulk = (payload: Record<string, unknown>) => http.inject({ method: 'POST', url: '/api/experiments/runs/bulk', payload });
const ctx = { runId: 'run1', key: 'claude:s1', agent: 'claude', cwd: tmp, deps } as RunCtx;
const call = async (name: string, a: Record<string, unknown>) => {
  const out = await experimentTools(ctx)
    .find((t) => t.name === name)!
    .run(a, ctx);
  return typeof out === 'string' ? { text: out, isError: false } : { text: out.text, isError: !!out.isError };
};

// ---- chains --------------------------------------------------------------------------------------------------------

test('a chain of four: each failed or stopped run is replaced by the one started from it; the latest is the 4th attempt', async () => {
  made({ id: 'ca11', group: 'chain', status: 'failed', why: 'It ran out of memory' });
  made({ id: 'ca22', group: 'chain', status: 'lost', from: 'ca11' });
  made({ id: 'ca33', group: 'chain', status: 'stopped', from: 'ca22' });
  made({ id: 'ca44', group: 'chain', status: 'done', from: 'ca33' });
  const r = await byId('chain');
  assert.deepEqual(['ca11', 'ca22', 'ca33', 'ca44'].map((id) => [r.get(id)!.retryOf, r.get(id)!.replacedBy, r.get(id)!.attempt]), [
    [undefined, 'ca22', undefined],
    ['ca11', 'ca33', 2],
    ['ca22', 'ca44', 3],
    ['ca33', undefined, 4],
  ]);
  const stand = standingsOf([...r.values()]);
  assert.deepEqual(stand.rows.map((x) => x.id), ['ca44']);
  assert.deepEqual(stand.earlier.get(':ca44')!.map((x) => x.id), ['ca33', 'ca22', 'ca11'], 'the one before first');
  assert.equal(stand.folded.length, 3);
  const g = await groupOf('chain');
  assert.deepEqual([g.runs, g.shown, g.earlier, g.archived, g.done], [4, 1, 3, 0, 1]);
  // A filter by status leaves the marks as they are: they are worked out from every run of the experiment.
  assert.equal((await list('group=chain&status=failed'))[0].replacedBy, 'ca22');
  const view = (await http.inject({ method: 'GET', url: '/api/experiments/runs/ca44?lines=0' })).json();
  assert.equal(view.chain.attempt, 4);
  assert.deepEqual([view.chain.previous.id, view.chain.previous.status, view.chain.next], ['ca33', 'stopped', undefined]);
  const first = (await http.inject({ method: 'GET', url: '/api/experiments/runs/ca11?lines=0' })).json();
  assert.deepEqual([first.chain.attempt, first.chain.next.id, first.chain.previous], [1, 'ca22', undefined]);
});

test('a finished run run again is a repeat, not another attempt; a retry in another experiment is not one either', async () => {
  made({ id: 're11', group: 'repeat', status: 'done' });
  made({ id: 're22', group: 'repeat', status: 'done', from: 're11' });
  made({ id: 're33', group: 'repeat', status: 'failed' });
  made({ id: 're44', group: 'elsewhere', status: 'done', from: 're33' });
  const r = await byId('repeat');
  for (const x of r.values()) assert.deepEqual([x.retryOf, x.replacedBy], [undefined, undefined], x.id);
});

test('the same job started again after a failure is linked without being told; a different one is not', async () => {
  const command = 'python train.py --lr 3e-4 --seed 1';
  made({ id: 'au11', group: 'auto', status: 'failed', command, seed: 1 });
  made({ id: 'au22', group: 'auto', status: 'failed', command, seed: 1 });
  made({ id: 'au33', group: 'auto', status: 'done', command, seed: 1 });
  // Another number, another seed, other variables: other runs.
  made({ id: 'au44', group: 'auto', status: 'failed', command: 'python train.py --lr 1e-4 --seed 1', seed: 1 });
  made({ id: 'au55', group: 'auto', status: 'done', command: 'python train.py --lr 5e-4 --seed 1', seed: 1 });
  made({ id: 'au66', group: 'auto', status: 'done', command: 'python train.py --lr 3e-4 --seed 2', seed: 2 });
  made({ id: 'au77', group: 'auto', status: 'done', command: 'python train.py --lr 1e-4 --seed 1', seed: 1, env: { MODE: 'b' } });
  // Once it has finished, starting it once more is a repeat.
  made({ id: 'au88', group: 'auto', status: 'done', command, seed: 1 });
  const r = await byId('auto');
  assert.deepEqual([r.get('au11')!.replacedBy, r.get('au22')!.replacedBy, r.get('au33')!.retryOf, r.get('au33')!.attempt], ['au22', 'au33', 'au22', 3]);
  for (const id of ['au44', 'au55', 'au66', 'au77', 'au88']) assert.deepEqual([r.get(id)!.retryOf, r.get(id)!.replacedBy], [undefined, undefined], id);
  // Queued before the earlier one had ended: both stand (a sweep's twin, say).
  made({ id: 'au90', group: 'both', status: 'failed', command, at: 5000, ended: 9000 });
  made({ id: 'au91', group: 'both', status: 'done', command, at: 6000, ended: 7000 });
  assert.equal((await byId('both')).get('au90')!.replacedBy, undefined);
  // Runs without an experiment are linked only when it is said.
  made({ id: 'au92', status: 'failed', command: 'echo x' });
  made({ id: 'au93', status: 'done', command: 'echo x' });
  assert.equal((await list('q=au92'))[0].replacedBy, undefined);
});

test('two attempts at one run: the later takes it; no chain closes on itself; trials are in none', () => {
  const run = (id: string, o: Partial<RunRecord> = {}): RunRecord => ({ id, status: 'failed', command: `x ${id}`, cwd: '/p', createdAt: 0, group: 'g', ...o });
  const two = attemptsOf([run('a', { createdAt: 1 }), run('b', { createdAt: 2, from: 'a' }), run('c', { createdAt: 3, from: 'a' })]);
  assert.equal(two.get('a')!.replacedBy, 'c');
  assert.equal(two.get('b'), undefined);
  const loop = attemptsOf([run('a', { createdAt: 1, from: 'b' }), run('b', { createdAt: 2, from: 'a' }), run('c', { createdAt: 3, from: 'c' })]);
  assert.deepEqual([loop.get('a')!.replacedBy, loop.get('a')!.retryOf, loop.get('b')!.replacedBy, loop.get('c')], ['b', undefined, undefined, undefined]);
  // Standings stay finite even for marks that go round.
  const round = standingsOf([run('a', { replacedBy: 'b' }), run('b', { replacedBy: 'a' })]);
  assert.equal(round.rows.length + round.folded.length, 2);
  const tried = attemptsOf([run('t', { createdAt: 1, tags: ['try'], env: { HYDOR_TRY: '1' } }), run('r', { createdAt: 2, from: 't' })]);
  assert.equal(tried.size, 0);
});

test('deleting an attempt in the middle leaves the chain whole', async () => {
  made({ id: 'de11', group: 'dele', status: 'failed' });
  made({ id: 'de22', group: 'dele', status: 'failed', from: 'de11' });
  made({ id: 'de33', group: 'dele', status: 'done', from: 'de22' });
  assert.equal((await http.inject({ method: 'DELETE', url: '/api/experiments/runs/de22' })).statusCode, 200);
  const r = await byId('dele');
  assert.deepEqual([r.get('de11')!.replacedBy, r.get('de33')!.retryOf, r.get('de33')!.attempt], ['de33', 'de11', 2]);
});

// ---- notes, stars, archive -------------------------------------------------------------------------------------------

test('a note is one line of at most 500 characters, says who wrote it, and an agent does not write over the person’s', async () => {
  made({ id: 'no11', group: 'notes' });
  assert.equal((await patch('no11', { note: '  the tokenizer bug\nwas still in  this one ' })).json().run.note, 'the tokenizer bug was still in this one');
  assert.equal(getRun(db, 'no11')!.noteBy, 'user');
  assert.equal((await patch('no11', { note: 'x'.repeat(501) })).statusCode, 400);
  assert.equal((await patch('no11', { note: 'x'.repeat(500) })).statusCode, 200);
  assert.equal((await patch('no11', { note: 5 })).statusCode, 400);
  const kept = await call('experiment_note', { id: 'no11', note: 'mine now' });
  assert.ok(kept.isError && /theirs/.test(kept.text), kept.text);
  await patch('no11', { note: '' });
  assert.deepEqual([getRun(db, 'no11')!.note, getRun(db, 'no11')!.noteBy], [undefined, undefined]);
  assert.ok(!(await call('experiment_note', { id: 'no11', note: 'ran on the old split' })).isError);
  assert.deepEqual([getRun(db, 'no11')!.note, getRun(db, 'no11')!.noteBy], ['ran on the old split', 'agent']);
  assert.ok(!(await call('experiment_note', { id: 'no11', note: 'ran on the old split of May' })).isError, 'its own it may change');
  assert.ok((await call('experiment_note', { id: 'nope', note: 'x' })).isError);
  const listed = JSON.parse((await call('experiment_list', { group: 'notes' })).text).runs[0];
  assert.deepEqual([listed.note, listed.noteBy], ['ran on the old split of May', 'agent']);
  assert.equal(JSON.parse((await call('experiment_get', { id: 'no11' })).text).run.note, 'ran on the old split of May');
  // A call from inside the app is an agent's.
  made({ id: 'no22', group: 'notes' });
  assert.equal((await patch('no22', { note: 'by app_api' }, internalHeaders())).json().run.noteBy, 'agent');
});

test('stars keep when they were given; archived runs leave the counts and the tools’ lists and come back', async () => {
  made({ id: 'ar11', group: 'arch', status: 'failed' });
  made({ id: 'ar22', group: 'arch', status: 'done', from: 'ar11' });
  made({ id: 'ar33', group: 'arch', status: 'done' });
  made({ id: 'ar44', group: 'arch', status: 'running' });
  const at = (await patch('ar33', { starred: true })).json().run.starredAt;
  assert.ok(at);
  assert.equal((await patch('ar33', { starred: true })).json().run.starredAt, at);
  assert.equal((await patch('ar33', { starred: false })).json().run.starredAt, undefined);
  assert.equal((await patch('ar44', { archived: true })).statusCode, 409, 'one still going stays');
  assert.equal((await patch('ar33', { archived: true }, internalHeaders())).statusCode, 403, 'only the person archives');
  // The row's run archived: its earlier attempts go with it.
  assert.equal((await patch('ar22', { archived: true })).statusCode, 200);
  let g = await groupOf('arch');
  assert.deepEqual([g.runs, g.shown, g.earlier, g.archived, g.done], [4, 2, 0, 2, 1]);
  const some = JSON.parse((await call('experiment_list', { group: 'arch' })).text);
  assert.deepEqual(some.runs.map((r: { id: string }) => r.id).sort(), ['ar33', 'ar44']);
  assert.match(some.note, /2 archived runs are left out/);
  const every = JSON.parse((await call('experiment_list', { group: 'arch', archived: true })).text).runs;
  assert.deepEqual(every.filter((r: { archived?: boolean }) => r.archived).map((r: { id: string }) => r.id).sort(), ['ar11', 'ar22']);
  assert.equal((await list('group=arch')).length, 4, 'nothing is deleted');
  await patch('ar22', { archived: false });
  g = await groupOf('arch');
  assert.deepEqual([g.shown, g.earlier, g.archived], [3, 1, 0]);
});

test('several at once: stars, archiving (those still going left, and counted), stopping those that wait', async () => {
  made({ id: 'bu11', group: 'bulk', status: 'done' });
  made({ id: 'bu22', group: 'bulk', status: 'failed' });
  made({ id: 'bu33', group: 'bulk', status: 'queued' });
  assert.equal((await bulk({ ids: [] , starred: true })).statusCode, 400);
  assert.equal((await bulk({ ids: ['bu11'] })).statusCode, 400, 'nothing to do');
  assert.equal((await bulk({ ids: ['bu11'], archived: true }).then((r) => r)).statusCode, 200);
  await bulk({ ids: ['bu11'], archived: false });
  const a = (await bulk({ ids: ['bu11', 'bu22', 'bu33', 'gone'], starred: true, archived: true })).json();
  assert.equal(a.skipped, 1);
  assert.equal(a.runs.length, 3);
  assert.ok(getRun(db, 'bu11')!.archivedAt && getRun(db, 'bu22')!.archivedAt && !getRun(db, 'bu33')!.archivedAt && getRun(db, 'bu33')!.starredAt);
  const s = (await bulk({ ids: ['bu11', 'bu33'], stop: true })).json();
  assert.equal(s.stopped, 1);
  assert.equal(getRun(db, 'bu33')!.status, 'stopped');
  assert.equal(getRun(db, 'bu11')!.status, 'done');
});

test('a whole experiment: archived it leaves the lists, a run made after brings it back, and so does asking', async () => {
  made({ id: 'ex11', group: 'whole', status: 'done' });
  made({ id: 'ex22', group: 'whole', status: 'running' });
  const put = (payload: Record<string, unknown>, headers: Record<string, string> = {}) => http.inject({ method: 'PUT', url: '/api/experiments/groups', payload: { name: 'whole', ...payload }, headers });
  assert.equal((await put({ archived: true })).statusCode, 409, 'not while a run of it goes');
  updateRun(db, 'ex22', { status: 'done', endedAt: clock });
  assert.equal((await put({ archived: true }, internalHeaders())).statusCode, 403);
  assert.equal((await put({ archived: true })).statusCode, 200);
  const g = await groupOf('whole');
  assert.ok(g.archivedAt);
  assert.equal(g.by, undefined, 'archiving writes nothing of the experiment');
  assert.equal(JSON.parse((await call('experiment_list', { group: 'whole' })).text).runs.length, 0);
  assert.equal(JSON.parse((await call('experiment_list', { group: 'whole', archived: true })).text).runs.length, 2);
  await put({ archived: false });
  assert.equal((await groupOf('whole')).archivedAt, undefined);
  await put({ archived: true });
  made({ id: 'ex33', group: 'whole', status: 'queued', at: Date.now() + 1000 });
  assert.equal((await groupOf('whole')).archivedAt, undefined, 'a run made since');
  assert.equal((await http.inject({ method: 'PUT', url: '/api/experiments/groups', payload: { name: 'no-such', archived: true } })).statusCode, 404);
});

test('a results table keeps the runs it counted when they are archived; a new one of the experiment leaves them out', async () => {
  made({ id: 'tb11', group: 'tables', last: { acc: 0.5 } });
  made({ id: 'tb22', group: 'tables', last: { acc: 0.7 } });
  const spec = { group: 'tables', columns: [{ metric: 'acc', better: 'max' as const }] };
  const t = workOut(db, spec, 'tmade');
  saveTable(db, t);
  assert.deepEqual(t.rows[0].runs.sort(), ['tb11', 'tb22']);
  await patch('tb22', { archived: true });
  assert.deepEqual(recomputeTable(db, 'tmade')!.rows[0].runs.sort(), ['tb11', 'tb22']);
  assert.deepEqual(workOut(db, spec).rows[0].runs, ['tb11']);
  assert.deepEqual(workOut(db, { runs: ['tb11', 'tb22'], columns: spec.columns }).rows[0].runs.sort(), ['tb11', 'tb22'], 'named runs are taken as given');
});

test('?archived=0 leaves out what was put aside, earlier attempts of an archived run and archived experiments too, and still fills the limit', async () => {
  made({ id: 'li11', group: 'listed', status: 'done' });
  made({ id: 'li22', group: 'listed', status: 'failed' });
  made({ id: 'li33', group: 'listed', status: 'done', from: 'li22' });
  made({ id: 'li44', group: 'listed-aside', status: 'done' });
  await patch('li33', { archived: true });
  await http.inject({ method: 'PUT', url: '/api/experiments/groups', payload: { name: 'listed-aside', archived: true } });
  assert.deepEqual((await list('group=listed&archived=0')).map((r) => r.id), ['li11']);
  assert.deepEqual((await list('group=listed&archived=0&limit=1')).map((r) => r.id), ['li11']);
  assert.deepEqual(await list('group=listed-aside&archived=0'), []);
  assert.equal((await list('group=listed')).length, 3);
});

// ---- findings ---------------------------------------------------------------------------------------------------------

test('an experiment shows the findings whose evidence names its runs or its tables, newest first; replaced ones not', async () => {
  const folder = path.join(tmp, 'project');
  fs.mkdirSync(path.join(folder, '.git'), { recursive: true });
  const space = createSpace(db, { name: 'Project', folder });
  const root = repoRoot(folder)!;
  made({ id: 'fi11', group: 'found', last: { acc: 0.9 } });
  made({ id: 'fi22', group: 'found', last: { acc: 0.8 } });
  made({ id: 'fi33', group: 'other' });
  saveTable(db, workOut(db, { runs: ['fi11', 'fi22'], columns: [{ metric: 'acc', better: 'max' }] }, 'tfound'));
  const by = { source: 'agent' as const };
  const old = await recordFinding(db, root, { statement: 'The wider model wins', verdict: 'unclear', evidence: [{ kind: 'run', ref: 'fi11' }] }, by);
  await recordFinding(db, root, { statement: 'The wider model wins', verdict: 'supported', learned: 'It held over both runs', evidence: [{ kind: 'run', ref: '/experiments/fi22' }], replaces: old.entry.id }, by);
  await recordFinding(db, root, { statement: 'Dropout does not matter', verdict: 'refuted', evidence: [{ kind: 'table', ref: 'tfound' }] }, by);
  await recordFinding(db, root, { statement: 'About another experiment', verdict: 'supported', evidence: [{ kind: 'run', ref: 'fi33' }] }, by);
  await recordFinding(db, root, { statement: 'About no run', verdict: 'open' }, by);
  const got = (await http.inject({ method: 'GET', url: '/api/experiments/findings?group=found' })).json();
  assert.deepEqual(got.findings.map((f: { statement: string }) => f.statement), ['Dropout does not matter', 'The wider model wins']);
  assert.deepEqual([got.findings[1].verdict, got.findings[1].learned, got.findings[1].project], ['supported', 'It held over both runs', space.id]);
  assert.equal((await groupOf('found')).verdict, 'refuted', 'the newest');
  assert.equal((await groupOf('chain')).verdict, undefined);
  assert.equal((await http.inject({ method: 'GET', url: '/api/experiments/findings' })).statusCode, 400);
});

// ---- run ----------------------------------------------------------------------------------------------------------------

let passed = 0;
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
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failedTests} failed`);
process.exit(failedTests ? 1 : 0);
