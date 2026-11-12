// Checks for `hydor guidelines`: every session's, a project's and a session's levels shown and changed (the editor,
// --file, stdin, --clear), and what is sent: only the level named.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/tui/areas/guidelines-test.ts && DATA_DIR=/tmp/hydor-test-guidelines node dist/dev/guidelines-test.js
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
const s1 = { id: 'aaaa1111-0000', key: 'claude:aaaa1111-0000', title: 'Fix the login bug', cwd: '/x', updatedAt: 1, createdAt: 1 };
const KEY = encodeURIComponent(s1.key);
const routes = () => ({
  'GET /api/guidelines': { global: 'Answer **briefly**.' },
  'GET /api/guidelines?space=sp1': { global: 'Answer briefly.', space: { id: 'sp1', name: 'Thesis', text: 'Cite everything.' } },
  [`GET /api/guidelines?key=${KEY}`]: { global: 'Answer briefly.', space: { id: 'sp1', name: 'Thesis', text: 'Cite everything.' }, session: { key: s1.key, text: 'Only touch the login code.' } },
  'PUT /api/guidelines': (b: unknown) => b,
  'GET /api/projects': { spaces: [{ id: 'sp1', name: 'Thesis' }] },
  'GET /api/sessions?limit=1000': { sessions: [s1] },
});

test('show: every session’s by default, a project’s, a session’s with the levels above it', async () => {
  const t = fakeConn(routes());
  let r = await run(t.conn, ['guidelines']);
  assert.match(r.out, /^Every session$/m);
  assert.match(r.out, /Answer briefly\./);
  r = await run(t.conn, ['guidelines', 'show', '--project', 'thesis']);
  assert.equal(t.calls.at(-1)!.path, '/api/guidelines?space=sp1');
  assert.match(r.out, /^In the project “Thesis”$/m);
  assert.match(r.out, /Cite everything\./);
  r = await run(t.conn, ['guidelines', 'show', '--session', 'fix the login']);
  assert.equal(t.calls.at(-1)!.path, `/api/guidelines?key=${KEY}`);
  assert.match(r.out, /^In the project “Thesis”$/m);
  assert.match(r.out, /^In the session “Fix the login bug”$/m);
  assert.match(r.out, /Only touch the login code\./);
  const j = await run(t.conn, ['guidelines', '--json']);
  assert.deepEqual(j.json, [{ global: 'Answer **briefly**.' }]);
  await assert.rejects(run(t.conn, ['guidelines', 'show', '--project', 'a', '--session', 'b']), /^Error: Pick one of --project and --session$/);
  await assert.rejects(run(t.conn, ['guidelines', 'show', '--project', 'zzz']), /No project “zzz”/);
});

test('edit: the editor holds the current text; only the level named is sent; unchanged sends nothing', async () => {
  const t = fakeConn(routes());
  let r = await run(t.conn, ['guidelines', 'edit'], { interactive: true, edit: 'Be terse.' });
  assert.deepEqual(r.edited, ['Answer **briefly**.']);
  assert.deepEqual(t.calls.at(-1), { method: 'PUT', path: '/api/guidelines', body: { global: 'Be terse.' } });
  assert.match(r.out, /^Changed the guidelines for every session\.$/m);
  r = await run(t.conn, ['guidelines', 'edit', '--project', 'Thesis'], { interactive: true, edit: 'New.' });
  assert.deepEqual(r.edited, ['Cite everything.']);
  assert.deepEqual(t.calls.at(-1)!.body, { space: { id: 'sp1', text: 'New.' } });
  r = await run(t.conn, ['guidelines', 'edit', '--session', 'fix the login'], { interactive: true, edit: 'Mine.' });
  assert.deepEqual(r.edited, ['Only touch the login code.']);
  assert.deepEqual(t.calls.at(-1)!.body, { session: { key: s1.key, text: 'Mine.' } });
  const n = t.calls.length;
  r = await run(t.conn, ['guidelines', 'edit'], { interactive: true, edit: null });
  assert.match(r.out, /Nothing changed\./);
  assert.ok(!t.calls.slice(n).some((c) => c.method === 'PUT'));
  await assert.rejects(run(t.conn, ['guidelines', 'edit']), /no terminal for the editor/);
});

test('edit: from a file, from stdin, cleared', async () => {
  const t = fakeConn(routes());
  await run(t.conn, ['guidelines', 'edit', '--file', 'g.md'], { files: { 'g.md': 'From a file' } });
  assert.deepEqual(t.calls.at(-1)!.body, { global: 'From a file' });
  await run(t.conn, ['guidelines', 'edit', '--project', 'thesis', '--file', '-'], { files: { '-': 'From stdin' } });
  assert.deepEqual(t.calls.at(-1)!.body, { space: { id: 'sp1', text: 'From stdin' } });
  const r = await run(t.conn, ['guidelines', 'edit', '--session', 'fix the login', '--clear']);
  assert.deepEqual(t.calls.at(-1)!.body, { session: { key: s1.key, text: '' } });
  assert.match(r.out, /Cleared the guidelines for the session/);
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
