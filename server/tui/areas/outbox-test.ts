// Checks for `hydor outbox`: the list, one call by number or tool, send as it is or with fields changed (asked first,
// -y skips), what it says when it did not go, and drop.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/tui/areas/outbox-test.ts && DATA_DIR=/tmp/hydor-test-outbox-cli node dist/dev/outbox-test.js
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
const calls = [
  {
    id: 'h1',
    status: 'held',
    key: 'claude:s1',
    session: 'Chase invoices',
    agent: 'claude',
    app: 'gmail',
    appName: 'Gmail',
    tool: 'send_email',
    input: { to: ['ann@example.com'], subject: 'Invoice 42', text: 'Hi Ann' },
    shape: 'email',
    at: Date.now() - 120_000,
  },
  { id: 'h2', status: 'failed', app: 'slack', appName: 'Slack', tool: 'post_message', input: { channel: '#ops', text: 'Done' }, shape: 'message', result: 'channel_not_found', at: Date.now() - 3_600_000 },
];

test('outbox: the list, nothing when empty, --json as returned', async () => {
  const t = fakeConn({ 'GET /api/outbox': { calls, held: 2 } });
  const r = await run(t.conn, ['outbox']);
  assert.match(r.out, /^1 +● +Gmail · send_email to ann@example\.com “Invoice 42” +Chase invoices +2m ago$/m);
  assert.match(r.out, /^2 +. +Slack · post_message to #ops “Done” +1h ago$/m);
  assert.deepEqual((await run(t.conn, ['outbox', '--json'])).json, [{ calls }]);
  assert.match((await run(fakeConn({ 'GET /api/outbox': { calls: [], held: 0 } }).conn, ['outbox'])).out, /Nothing waits in the Outbox\./);
});

test('outbox show: by number or tool, with its input', async () => {
  const t = fakeConn({ 'GET /api/outbox': { calls, held: 2 } });
  for (const given of ['1', 'h1', 'send_email']) {
    const r = await run(t.conn, ['outbox', 'show', given]);
    assert.match(r.out, /^Call +Gmail · send_email$/m, given);
    assert.match(r.out, /"subject": "Invoice 42"/);
  }
  assert.match((await run(t.conn, ['outbox', 'show', '2'])).out, /^Status +did not go: channel_not_found$/m);
});

test('outbox send: asked first, then as it is or with fields changed', async () => {
  const sent = { call: { ...calls[0], status: 'sent', result: 'Message sent' } };
  const t = fakeConn({ 'GET /api/outbox': { calls, held: 2 }, 'POST /api/outbox/h1/send': sent });
  const r = await run(t.conn, ['outbox', 'send', '1', '-y']);
  assert.match(r.out, /^Sent: Gmail · send_email to ann@example\.com “Invoice 42”$/m);
  assert.deepEqual(t.calls.find((c) => c.path === '/api/outbox/h1/send')?.body, {});
  const t2 = fakeConn({ 'GET /api/outbox': { calls, held: 2 }, 'POST /api/outbox/h1/send': sent });
  await run(t2.conn, ['outbox', 'send', '1', '--set', 'subject=Invoice 42, again', '--set', 'to=["ann@example.com","bob@example.com"]', '-y']);
  assert.deepEqual(t2.calls.find((c) => c.path === '/api/outbox/h1/send')?.body, { input: { to: ['ann@example.com', 'bob@example.com'], subject: 'Invoice 42, again', text: 'Hi Ann' } });
  // Without -y and nobody there to say yes: nothing is sent.
  const t3 = fakeConn({ 'GET /api/outbox': { calls, held: 2 } });
  await assert.rejects(run(t3.conn, ['outbox', 'send', '1'], { confirm: false }));
  assert.ok(!t3.calls.some((c) => c.method === 'POST'));
});

test('outbox send: when it did not go, it says so and fails', async () => {
  const t = fakeConn({ 'GET /api/outbox': { calls, held: 2 }, 'POST /api/outbox/h2/send': { call: { ...calls[1], result: 'channel_not_found' } } });
  const r = await run(t.conn, ['outbox', 'send', '2', '-y']);
  assert.equal(r.code, 1);
  assert.match(r.out, /It did not go: channel_not_found\. It waits in the Outbox again\./);
});

test('outbox drop', async () => {
  const t = fakeConn({ 'GET /api/outbox': { calls, held: 2 }, 'POST /api/outbox/h2/drop': { call: { ...calls[1], status: 'dropped' } } });
  const r = await run(t.conn, ['outbox', 'drop', 'post_message', '-y']);
  assert.match(r.out, /^Dropped: Slack · post_message to #ops “Done”$/m);
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n${(e as Error).stack}`);
  }
}
console.log(`\n${passed} of ${tests.length} passed`);
process.exit(passed === tests.length ? 0 : 1);
