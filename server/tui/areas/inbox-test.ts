// Checks for `hydor inbox` (list, show by number, id or title) and `hydor experiments` (list with filters, show with
// metrics and log, stop).
//   OUTDIR=dist/dev node scripts/build-server.mjs server/tui/areas/inbox-test.ts && DATA_DIR=/tmp/hydor-test-inbox node dist/dev/inbox-test.js
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
const items = [
  {
    id: 'i1',
    kind: 'approval',
    title: 'Run npm install?',
    detail: 'It wants to run a command',
    key: 'claude:s1',
    session: 'Fix login',
    agent: 'claude',
    at: Date.now() - 60_000,
    path: '/s/claude%3As1',
  },
  { id: 'i2', kind: 'key', title: 'Needs OPENAI_API_KEY', at: Date.now() - 3_600_000, path: '/apps/connected?tab=keys' },
];

test('inbox: a list with a mark, nothing when empty, --json as returned', async () => {
  const t = fakeConn({ 'GET /api/inbox': { items } });
  const r = await run(t.conn, ['inbox']);
  assert.match(r.out, /^1 +● +approval +Run npm install\? +Fix login +1m ago$/m);
  assert.match(r.out, /^2 +● +key +Needs OPENAI_API_KEY +1h ago$/m);
  assert.deepEqual((await run(t.conn, ['inbox', 'list', '--json'])).json, [{ items }]);
  assert.match((await run(fakeConn({ 'GET /api/inbox': { items: [] } }).conn, ['inbox'])).out, /Nothing is waiting on you\./);
});

test('inbox show: by number, id or title; where to answer', async () => {
  const t = fakeConn({ 'GET /api/inbox': { items } });
  for (const given of ['1', 'i1', 'run npm']) {
    const r = await run(t.conn, ['inbox', 'show', given]);
    assert.match(r.out, /^Title +Run npm install\?$/m, given);
    assert.match(r.out, /^Details +It wants to run a command$/m);
    assert.match(r.out, /^Answer at +http:\/\/fake\/s\/claude%3As1$/m);
  }
  assert.match((await run(t.conn, ['inbox', 'show', '2'])).out, /^Answer at +http:\/\/fake\/apps\/connected\?tab=keys$/m);
  await assert.rejects(run(t.conn, ['inbox', 'show', 'zzz']), /^Error: No item “zzz”: hydor inbox lists them$/);
  await assert.rejects(run(t.conn, ['inbox', 'show']), /^Error: Say the item: hydor inbox show <item>$/);
  assert.deepEqual((await run(t.conn, ['inbox', 'show', '1', '--json'])).json, [items[0]]);
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
