// Checks for `hydor machines` against a fake connection (test-kit.ts): list, add (by address or SSH, the token typed hidden or
// from stdin and never printed), remove asking first. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/tui/areas/machines-test.ts && DATA_DIR=/tmp/hydor-test-machines node dist/dev/machines-test.js
import assert from 'node:assert/strict';
import { fakeConn, run } from './test-kit.ts';
import { UsageError } from './kit.ts';

const DATA = process.env.DATA_DIR ?? '';
if (!DATA.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
process.env.CUDA_VISIBLE_DEVICES = '';

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const lab = { id: 'm1', name: 'Lab', via: 'url', url: 'https://lab.example.com', status: { state: 'online', host: 'labbox', version: '0.55.0', waiting: 1, working: 2 } };
const gpu = { id: 'm2', name: 'Gpu', via: 'ssh', ssh: 'gpu-box', port: 8790, status: { state: 'offline', error: 'Connection refused', waiting: 0, working: 0 } };
const routes = { 'GET /api/machines': { self: { host: 'here', version: '0.55.2', home: '/home/u', platform: 'linux', user: 'u' }, machines: [lab, gpu] } };

test('list shows this machine and the others, and whether they answer', async () => {
  const { conn } = fakeConn(routes);
  const t = await run(conn, ['machines']);
  assert.match(t.out, /This machine: here \(u, linux\), Hydor 0\.55\.2/);
  assert.match(t.out, /●\s+Lab\s+m1\s+https:\/\/lab\.example\.com\s+labbox · Hydor 0\.55\.0 · 1 waiting · 2 working/);
  assert.match(t.out, /·|✗/);
  assert.match(t.out, /Gpu\s+m2\s+ssh gpu-box:8790\s+Connection refused/);
  assert.deepEqual((await run(conn, ['machines', 'list', '--json'])).json, [routes['GET /api/machines']]);
  assert.match((await run(fakeConn({ 'GET /api/machines': { machines: [] } }).conn, ['machines'])).out, /No other machines yet/);
});

test('add by address or SSH, with the token typed hidden or from stdin, never printed', async () => {
  const TOKEN = 'acm_SECRETTOKEN';
  const { conn, calls } = fakeConn({ ...routes, 'POST /api/machines': (b: any) => ({ machine: { ...lab, id: 'm3', name: b.name } }) });
  const t = await run(conn, ['machines', 'add', 'Lab', 'two', '--url', 'https://lab2.example.com', '--file', '-'], { files: { '-': `${TOKEN}\n` } });
  assert.deepEqual(calls.at(-1)?.body, { name: 'Lab two', via: 'url', ssh: undefined, port: undefined, url: 'https://lab2.example.com', token: TOKEN });
  assert.match(t.out, /^Added “Lab two” \(m3\): online, Hydor 0\.55\.0\. Its pages are http:\/\/fake\/m\/m3\/…/);
  assert.ok(!t.out.includes('SECRET'));
  const h = await run(conn, ['machines', 'add', 'Box', '--ssh', 'user@box', '--port', '9000'], { interactive: true, typed: [TOKEN] });
  assert.deepEqual(h.typed, [{ question: 'Its access token (typed hidden): ', hidden: true }]);
  assert.deepEqual(calls.at(-1)?.body, { name: 'Box', via: 'ssh', ssh: 'user@box', port: 9000, url: undefined, token: TOKEN });
  assert.ok(!JSON.stringify(h).includes('SECRET'));
  const bad = (words: string[], re: RegExp, a = {}) => assert.rejects(run(conn, ['machines', 'add', ...words], a), (e) => e instanceof UsageError && re.test((e as Error).message), words.join(' '));
  await bad(['Box'], /--url <address> or --ssh <host>/);
  await bad(['Box', '--url', 'https://x', '--ssh', 'h'], /one of them/);
  await bad(['--url', 'https://x'], /Say the name/);
  await bad(['Box', '--url', 'https://x'], /on stdin with --file -/);
  assert.equal(calls.filter((c) => c.method === 'POST').length, 2);
});

test('remove asks first', async () => {
  const { conn, calls } = fakeConn({ ...routes, 'DELETE /api/machines/m1': { ok: true } });
  await assert.rejects(run(conn, ['machines', 'remove', 'lab']), (e) => e instanceof UsageError && /add -y/.test((e as Error).message));
  const no = await run(conn, ['machines', 'remove', 'lab'], { interactive: true, confirm: false });
  assert.deepEqual(no.asked, ['Stop using “Lab”? Its sessions stay on it.']);
  assert.ok(!calls.some((c) => c.method === 'DELETE'));
  assert.equal((await run(conn, ['machines', 'rm', 'lab', '-y'])).out, 'Removed “Lab”.\n');
  await assert.rejects(run(conn, ['machines', 'remove', 'nope', '-y']), (e) => e instanceof UsageError && /No machine “nope”/.test((e as Error).message));
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
