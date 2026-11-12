// Checks for `hydor accounts` against a fake connection (test-kit.ts): list shows each program's own sign-in and the added
// accounts and which one new sessions use; add makes an account and signs it in; sign-in follows the page's flow (a link, then a
// pasted code or address for Claude Code and Codex's browser sign-in, or a one-time code noticed on the event socket for Codex's
// device sign-in) and cancels it when it is given up; sign-out and remove ask first; use sets what new sessions start with.
// Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/tui/areas/accounts-test.ts && DATA_DIR=/tmp/hydor-test-accounts node dist/dev/accounts-test.js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { Conn, Events } from '../client.ts';
import { atWidths, fakeConn, run } from './test-kit.ts';
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

const usage = {
  claude: { agent: 'claude', ok: true, fetchedAt: 1, account: { email: 'me@work.example', plan: 'Max' }, windows: [{ id: 'five', label: '5-hour', usedPercent: 40, resetsAt: Date.now() + 3_600_000 }, { id: 'week', label: 'Week', usedPercent: 92 }] },
  codex: { agent: 'codex', ok: false, fetchedAt: 1, error: 'Not signed in', windows: [] },
  accounts: { acc1: { agent: 'claude', ok: true, fetchedAt: 1, windows: [{ id: 'five', label: '5-hour', usedPercent: 10 }], limited: { label: 'Week', resetsAt: Date.now() + 86_400_000 * 2 } } },
};

test('show: the program, who is signed in, whether new sessions use it, usage, the API key (never its value), the switches at a limit', async () => {
  const { conn, calls } = fakeConn({ ...routes, 'GET /api/usage': usage, 'GET /api/app-settings': { autoResume: true, autoSwitch: true, apiCredit: false } });
  const t = await run(conn, ['accounts', 'show', 'claude']);
  assert.deepEqual(calls.map((c) => c.path).sort(), ['/api/accounts', '/api/app-settings', '/api/bootstrap', '/api/usage']);
  assert.match(t.out, /^Claude Code$/m);
  assert.match(t.out, /^Program +Claude Code$/m);
  assert.match(t.out, /^Sign-in +the program’s own$/m);
  assert.match(t.out, /^State +signed in$/m);
  assert.match(t.out, /^Who +me@work\.example$/m);
  assert.match(t.out, /^Plan +Max$/m);
  assert.match(t.out, /^Signed in with +claudeai$/m);
  assert.match(t.out, /^New sessions +do not start with it \(hydor accounts use claude\)$/m);
  assert.match(t.out, /^API key +saved \(API credit/m);
  assert.match(t.out, /^At a limit +carries on with another account/m);
  assert.match(t.out, /^API credit +off$/m);
  assert.match(t.out, /^Usage$/m);
  assert.match(t.out, /^ +5-hour +████████░░░░░░░░░░░░ 40% +resets in /m);
  assert.match(t.out, /^ +Week +.* 92%/m);
  assert.doesNotMatch(t.out, /sk-ant/);
  // An added account: its own usage (at a limit), the one new sessions start with, no API key.
  const a = await run(conn, ['accounts', 'show', 'claude:personal']);
  assert.match(a.out, /^Personal · Claude Code$/m);
  assert.match(a.out, /^Sign-in +an account you added$/m);
  assert.match(a.out, /^New sessions +● start with it$/m);
  assert.match(a.out, /^API key +none$/m);
  assert.match(a.out, /At its limit \(Week\), lifts in 2 days/);
  // Codex has no API key; the usage that cannot be read says so.
  const c = await run(conn, ['accounts', 'info', 'codex']);
  assert.match(c.out, /^State +Not signed in$/m);
  assert.match(c.out, /^API key +not used by Codex$/m);
  assert.doesNotMatch(c.out, /^API credit/m);
  assert.match(c.out, /Not signed in/);
  // By id, by email, picked on a terminal; --json has it all.
  assert.match((await run(conn, ['accounts', 'show', 'acc1'])).out, /^Personal · Claude Code$/m);
  assert.match((await run(conn, ['accounts', 'show', 'me@work.example'])).out, /^Claude Code$/m);
  const picked = await run(conn, ['accounts', 'show'], { interactive: true, pick: 'acc2' });
  assert.deepEqual(picked.picked, ['Which account?']);
  await assert.rejects(run(conn, ['accounts', 'show']), (e) => e instanceof UsageError && /Say which account: hydor accounts show <account>/.test((e as Error).message));
  const j = (await run(conn, ['accounts', 'show', 'claude', '--json'])).json[0] as any;
  assert.equal(j.apiKey, true);
  assert.equal(j.usage.windows.length, 2);
  assert.equal(j.autoSwitch, true);
  assert.equal(j.newSessions, false);
});

test('show: with the usage and the settings out of reach it still says what it knows', async () => {
  const { conn } = fakeConn({ ...routes });
  const t = await run(conn, ['accounts', 'show', 'claude']);
  assert.match(t.out, /^Who +me@work\.example$/m);
  assert.match(t.out, /^No usage to show\.$/m);
  assert.doesNotMatch(t.out, /^At a limit/m);
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

test('list on a narrow terminal: the API key note goes whole, then the id', async () => {
  const w = await atWidths(fakeConn(routes).conn, ['accounts']);
  for (const [n, lines] of Object.entries(w)) assert.ok(lines.slice(0, -1).every((l) => [...l].length <= Number(n) - 1), `${n} columns`);
  assert.match(w[100][1], /API key saved$/);
  assert.match(w[100][0], /^ +ACCOUNT +ID +PROGRAM +STATE$/);
  assert.match(w[60][0], /^ +ACCOUNT +PROGRAM +STATE$/, 'the API key note and the id went whole, not the sign-in cut to a stub');
  assert.match(w[60][1], /me@work\.example · Max · claud…$/);
  assert.match(w[40][0], /^ +ACCOUNT +PROGRAM +STATE$/);
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
