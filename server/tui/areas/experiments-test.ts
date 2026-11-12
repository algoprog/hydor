// Checks for `hydor experiments`: the list and its filters (sent to the server as the page sends them), one run with
// its metrics, events and log, naming runs, and stopping one.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/tui/areas/experiments-test.ts && DATA_DIR=/tmp/hydor-test-experiments node dist/dev/experiments-test.js
import assert from 'node:assert/strict';
import { fakeConn, run } from './test-kit.ts';
const DATA = process.env.DATA_DIR ?? '';
if (!DATA.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
process.env.CUDA_VISIBLE_DEVICES = '';

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const r1 = {
  id: 'r-aaaa11',
  name: 'bm25 baseline',
  group: 'bm25-sweep',
  command: 'python eval.py --k 10',
  cwd: '/home/u/ir',
  status: 'done',
  createdAt: Date.now() - 7_200_000,
  startedAt: Date.now() - 7_000_000,
  endedAt: Date.now() - 3_400_000,
  exitCode: 0,
  gpus: 1,
  commit: 'abcdef1234567',
  branch: 'main',
  metrics: { last: { ndcg: 0.4123456, step: 100 }, best: { ndcg: 0.43 } },
  events: [{ at: Date.now() - 3_400_000, kind: 'done', text: 'finished' }],
};
const r2 = { id: 'r-bbbb22', command: 'python train.py', cwd: '/home/u/ir', status: 'running', createdAt: Date.now() - 600_000, startedAt: Date.now() - 500_000 };
const r3 = { id: 'r-cccc33', name: 'broken', command: 'python x.py', cwd: '/home/u/ir', status: 'failed', createdAt: Date.now() - 1_000_000 };

test('experiments: the list with marks, filters sent along, --json as returned', async () => {
  const t = fakeConn({ 'GET /api/experiments/runs?limit=25': { runs: [r2, r1, r3] }, 'GET /api/experiments/runs?limit=10&status=active&group=bm25-sweep&q=eval': { runs: [r2] } });
  const r = await run(t.conn, ['experiments']);
  assert.match(r.out, /^ +ID +RUN +EXPERIMENT +STATE +WHEN$/m);
  assert.match(r.out, /^● +r-bbbb22 +python train\.py +running/m);
  assert.match(r.out, /^✓ +r-aaaa11 +bm25 baseline +bm25-sweep +done/m);
  assert.match(r.out, /^✗ +r-cccc33 +broken +failed/m);
  await run(t.conn, ['experiments', '--status', 'active', '--group', 'bm25-sweep', '--query', 'eval', '-n', '10']);
  assert.equal(t.calls.at(-1)!.path, '/api/experiments/runs?limit=10&status=active&group=bm25-sweep&q=eval');
  assert.deepEqual((await run(t.conn, ['experiments', '--json'])).json, [{ runs: [r2, r1, r3] }]);
  assert.match((await run(fakeConn({ 'GET /api/experiments/runs?limit=25': { runs: [] } }).conn, ['experiments'])).out, /No runs\./);
});

test('experiments show: fields, metrics, events; --log adds the log; names by id, name or command', async () => {
  const t = fakeConn({
    'GET /api/experiments/runs?limit=1000': { runs: [r1, r2, r3] },
    'GET /api/experiments/runs/r-aaaa11?lines=40&log=0': { run: r1 },
    'GET /api/experiments/runs/r-aaaa11?lines=5&log=1': { run: r1, log: 'step 1\nstep 2\n' },
  });
  const r = await run(t.conn, ['experiments', 'show', 'bm25']);
  assert.match(r.out, /^✓ bm25 baseline$/m);
  assert.match(r.out, /^Command +python eval\.py --k 10$/m);
  assert.match(r.out, /^Folder +~\/ir$/m);
  assert.match(r.out, /^State +done$/m);
  assert.match(r.out, /^Metrics +ndcg=0\.4123 +step=100$/m);
  assert.match(r.out, /^Best +ndcg=0\.43$/m);
  assert.match(r.out, /^Commit +abcdef1234 on main$/m);
  assert.match(r.out, /done finished/);
  assert.ok(!r.out.includes('step 1'));
  const l = await run(t.conn, ['experiments', 'show', 'r-aaaa', '--log', '--lines', '5']);
  assert.match(l.out, /^Log$/m);
  assert.match(l.out, /^step 2$/m);
  await assert.rejects(run(t.conn, ['experiments', 'show', 'r-']), /fits 3 runs/);
  await assert.rejects(run(t.conn, ['experiments', 'show', 'zzz']), /^Error: No run “zzz”: hydor experiments lists them$/);
});

test('experiments stop: posts the reason', async () => {
  const t = fakeConn({ 'GET /api/experiments/runs?limit=1000': { runs: [r1, r2, r3] }, 'POST /api/experiments/runs/r-bbbb22/stop': { run: { ...r2, stopping: 'x' } } });
  const r = await run(t.conn, ['experiments', 'stop', 'r-bbbb', '--why', 'wrong learning rate']);
  assert.deepEqual(t.calls.at(-1), { method: 'POST', path: '/api/experiments/runs/r-bbbb22/stop', body: { why: 'wrong learning rate' } });
  assert.match(r.out, /^Stopping “python train\.py”\.$/m);
  await run(t.conn, ['experiments', 'stop', 'r-bbbb']);
  assert.deepEqual(t.calls.at(-1)!.body, {});
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
}
console.log(`${passed}/${tests.length} passed`);
process.exit(process.exitCode ?? 0);
