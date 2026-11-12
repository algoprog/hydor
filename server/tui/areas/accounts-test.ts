// Checks for `hydor accounts` against a fake connection (test-kit.ts): list shows each program's own sign-in and the added
// accounts and which one new sessions use; add makes an account and signs it in; sign-in follows the page's flow (a link, then a
// pasted code or address for Claude Code and Codex's browser sign-in, or a one-time code noticed on the event socket for Codex's
// device sign-in) and cancels it when it is given up; sign-out and remove ask first; use sets what new sessions start with.
// Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/tui/areas/accounts-test.ts && DATA_DIR=/tmp/hydor-test-accounts node dist/dev/accounts-test.js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { Conn, Events } from '../client.ts';
import { fakeConn, run } from './test-kit.ts';
import { UsageError } from './kit.ts';
import { wait } from './accounts.ts';

const DATA = process.env.DATA_DIR ?? '';
if (!DATA.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
process.env.CUDA_VISIBLE_DEVICES = '';
wait.ms = 5;

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const accountsAnswer = {
  claude: { agent: 'claude', loggedIn: true, email: 'me@work.example', plan: 'Max', method: 'claudeai' },
  codex: { agent: 'codex', loggedIn: false, error: 'Not signed in' },
  extra: [
    { id: 'acc1', agent: 'claude', name: 'Personal', status: { agent: 'claude', loggedIn: true, email: 'me@home.example' } },
    { id: 'acc2', agent: 'codex', name: 'Personal', status: { agent: 'codex', loggedIn: false } },
  ],
  apiKeys: { main: true, acc1: false },
};
const routes = { 'GET /api/accounts': accountsAnswer, 'GET /api/bootstrap': { start: { runs: { claude: { account: 'acc1' }, codex: { account: '' } } } } };

/** An event socket that the test feeds (`push`) with what the server would send. */
function withEvents(conn: Conn) {
  const ev = new EventEmitter() as EventEmitter & { ready: () => Promise<boolean> };
  ev.ready = async () => true;
  conn.events = () => ev as unknown as Events;
  return { push: (flow: object) => ev.emit('event', { t: 'login', flow }) };
}

test('list shows the sign-ins and which one new sessions start with', async () => {
  const { conn } = fakeConn(routes);
  const t = await run(conn, ['accounts']);
  assert.match(t.out, /·\s+Claude Code\s+its own sign-in\s+Claude Code\s+me@work\.example · Max · claudeai\s+API key saved/);
  assert.match(t.out, /●\s+Codex\s+its own sign-in\s+Codex\s+Not signed in/);
  assert.match(t.out, /●\s+Personal\s+acc1\s+Claude Code\s+me@home\.example/);
  assert.match(t.out, /·\s+Personal\s+acc2\s+Codex\s+not signed in/);
  assert.deepEqual((await run(conn, ['accounts', 'list', '--json'])).json, [accountsAnswer]);
});

test('add makes the account, and with --no-sign-in stops there', async () => {
  const { conn, calls } = fakeConn({ ...routes, 'POST /api/agent-accounts': (b: any) => ({ id: 'acc3', ...b }) });
  const t = await run(conn, ['accounts', 'add', 'codex', 'Lab', 'box', '--no-sign-in']);
  assert.deepEqual(calls.at(-1), { method: 'POST', path: '/api/agent-accounts', body: { agent: 'codex', name: 'Lab box' } });
  assert.match(t.out, /Added “Lab box” \(acc3\) for Codex\.\nIt is not signed in yet: hydor accounts sign-in acc3/);
  await assert.rejects(run(conn, ['accounts', 'add', 'gemini', 'x']), (e) => e instanceof UsageError && /claude or codex/.test((e as Error).message));
  await assert.rejects(run(conn, ['accounts', 'add', 'claude']), (e) => e instanceof UsageError && /Say the name/.test((e as Error).message));
});

test('sign-in for Claude Code: the link, then the code pasted back', async () => {
  const { conn, calls } = fakeConn({
    ...routes,
    'POST /api/accounts/claude/login': { id: 'fl1', agent: 'claude', method: 'claudeai', state: 'starting' },
    'POST /api/accounts/claude/login/fl1': { id: 'fl1', agent: 'claude', method: 'claudeai', state: 'done' },
  });
  const ev = withEvents(conn);
  const p = run(conn, ['accounts', 'sign-in', 'claude', '-y'], { interactive: true, typed: ['CODE-123'] });
  setTimeout(() => ev.push({ id: 'fl1', agent: 'claude', method: 'claudeai', state: 'waiting', url: 'https://claude.example/auth', needsInput: 'code' }), 10);
  const t = await p;
  assert.match(t.out, /1\. Open this link and sign in:\n\s+https:\/\/claude\.example\/auth/);
  assert.deepEqual(t.typed, [{ question: 'Paste the code your browser shows: ', hidden: false }]);
  assert.deepEqual(
    calls.filter((c) => c.method === 'POST').map((c) => [c.path, c.body]),
    [
      ['/api/accounts/claude/login', { method: 'claudeai' }],
      ['/api/accounts/claude/login/fl1', { code: 'CODE-123' }],
    ],
  );
  assert.match(t.out, /Claude Code is signed in\./);
  assert.ok(!calls.some((c) => c.method === 'DELETE'), 'a finished sign-in is not cancelled');
});

test('sign-in for an added Codex account, device code: noticed on the event socket', async () => {
  const { conn, calls } = fakeConn({
    ...routes,
    'POST /api/accounts/codex/login?account=acc2': { id: 'fl2', agent: 'codex', method: 'device', state: 'waiting', url: 'https://openai.example/device', code: 'ABCD-EFGH' },
  });
  const ev = withEvents(conn);
  setTimeout(() => ev.push({ id: 'fl2', agent: 'codex', method: 'device', state: 'done' }), 15);
  const t = await run(conn, ['accounts', 'sign-in', 'codex:personal']);
  assert.match(t.out, /sign in to “Personal”:\n\s+https:\/\/openai\.example\/device/);
  assert.match(t.out, /2\. Enter this code there: ABCD-EFGH/);
  assert.match(t.out, /Personal is signed in\./);
  assert.deepEqual(calls.find((c) => c.method === 'POST')!.body, { method: 'device' });
});

test('sign-in with Codex’s browser method asks for the address; failing or backing out cancels the flow', async () => {
  const mk = (post: object) => {
    const f = fakeConn({
      ...routes,
      'POST /api/accounts/codex/login': { id: 'fl3', agent: 'codex', method: 'browser', state: 'waiting', url: 'https://openai.example/b', needsInput: 'url' },
      'POST /api/accounts/codex/login/fl3': post,
      'DELETE /api/accounts/codex/login/fl3': { ok: true },
    });
    withEvents(f.conn);
    return f;
  };
  const ok = mk({ id: 'fl3', agent: 'codex', method: 'browser', state: 'done' });
  const t = await run(ok.conn, ['accounts', 'sign-in', 'codex', '--method', 'browser'], { interactive: true, typed: ['http://localhost:1455/cb?code=x'] });
  assert.deepEqual(ok.calls.find((c) => c.path.endsWith('/fl3'))!.body, { url: 'http://localhost:1455/cb?code=x' });
  assert.equal(t.typed[0].question, 'Paste the address your browser ended on (it starts with http://localhost): ');
  const bad = mk({ id: 'fl3', agent: 'codex', method: 'browser', state: 'failed', error: 'That code is wrong' });
  await assert.rejects(
    run(bad.conn, ['accounts', 'sign-in', 'codex'], { interactive: true, typed: ['x'] }),
    (e) => e instanceof UsageError && /Signing in failed: That code is wrong/.test((e as Error).message),
  );
  const back = mk({});
  await assert.rejects(run(back.conn, ['accounts', 'sign-in', 'codex'], { interactive: true, typed: [] }), /./);
  assert.ok(
    back.calls.some((c) => c.method === 'DELETE' && c.path === '/api/accounts/codex/login/fl3'),
    'it is cancelled there',
  );
  const piped = mk({});
  await assert.rejects(run(piped.conn, ['accounts', 'sign-in', 'codex']), (e) => e instanceof UsageError && /no terminal/.test((e as Error).message));
  assert.ok(piped.calls.some((c) => c.method === 'DELETE'));
});

test('sign-out and remove ask first; the program’s own sign-in is not removed', async () => {
  const { conn, calls } = fakeConn({
    ...routes,
    'POST /api/accounts/claude/logout?account=acc1': { ok: true },
    'DELETE /api/agent-accounts/acc1': { ok: true },
    'DELETE /api/agent-accounts/acc1?wipe=1': { ok: true },
    'DELETE /api/agent-accounts/acc2': { ok: true },
  });
  await assert.rejects(run(conn, ['accounts', 'sign-out', 'claude:personal']), (e) => e instanceof UsageError && /add -y/.test((e as Error).message));
  const no = await run(conn, ['accounts', 'sign-out', 'claude:personal'], { interactive: true, confirm: false });
  assert.deepEqual(no.asked, ['Sign out of Claude Code (Personal)?']);
  assert.ok(!calls.some((c) => c.method === 'POST'));
  assert.equal((await run(conn, ['accounts', 'logout', 'claude:personal', '-y'])).out, 'Signed out of Personal.\n');
  assert.equal(calls.filter((c) => c.method === 'POST').length, 1);
  await assert.rejects(run(conn, ['accounts', 'remove', 'claude', '-y']), (e) => e instanceof UsageError && /own sign-in cannot be removed/.test((e as Error).message));
  const r = await run(conn, ['accounts', 'remove', 'claude:personal', '--wipe'], { interactive: true, confirm: true });
  assert.match(r.asked[0], /Its sign-in and its sessions’ history are deleted for good/);
  assert.equal((await run(conn, ['accounts', 'rm', 'codex:personal', '-y'])).out, 'Removed “Personal”.\n');
  assert.deepEqual(calls.at(-1), { method: 'DELETE', path: '/api/agent-accounts/acc2' }, 'acc2 was not the one new sessions used');
  await run(conn, ['accounts', 'rm', 'claude:personal', '-y']);
  assert.deepEqual(
    calls.slice(-2).map((c) => [c.method, c.path]),
    [
      ['DELETE', '/api/agent-accounts/acc1'],
      ['PUT', '/api/start'],
    ],
    'it was the one new sessions used: back to its own',
  );
  await assert.rejects(run(conn, ['accounts', 'remove', 'personal', '-y']), (e) => e instanceof UsageError && /fits 2 accounts/.test((e as Error).message));
});

test('use sets the account new sessions start with', async () => {
  const { conn, calls } = fakeConn({ ...routes, 'PUT /api/start': { ok: true } });
  assert.equal((await run(conn, ['accounts', 'use', 'claude'])).out, 'New Claude Code sessions start with its own sign-in.\n');
  assert.deepEqual(calls.at(-1), { method: 'PUT', path: '/api/start', body: { runs: { claude: { account: '' } } } });
  assert.equal((await run(conn, ['accounts', 'switch', 'claude:personal'])).out, 'New Claude Code sessions start with “Personal”.\n');
  assert.deepEqual(calls.at(-1)?.body, { runs: { claude: { account: 'acc1' } } });
  const out = await run(conn, ['accounts', 'use', 'codex:personal'], { interactive: true, confirm: false });
  assert.deepEqual(out.asked, ['“Personal” is not signed in. Use it anyway?']);
  await assert.rejects(run(conn, ['accounts', 'use']), (e) => e instanceof UsageError && /Say which account/.test((e as Error).message));
  const picked = await run(conn, ['accounts', 'use'], { interactive: true, pick: 'acc1' });
  assert.deepEqual(picked.picked, ['Which account?']);
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
