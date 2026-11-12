// Checks for `hydor sessions <verb>`: naming a session (key, id start, title), each verb's endpoint and body, the
// snooze times, queue, goal and share, and that nothing is deleted or archived without its flag or a yes. Against a fake
// connection. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/tui/areas/sessions-test.ts && DATA_DIR=/tmp/hydor-test-sessions node dist/dev/sessions-test.js
import assert from 'node:assert/strict';
import { ApiError } from '../client.ts';
import { Cancelled, UsageError } from './kit.ts';
import { boldMatches, parseUntil } from './sessions.ts';
import { fakeConn, run, type Answer } from './test-kit.ts';

const DATA = process.env.DATA_DIR ?? '';
if (!DATA.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
process.env.CUDA_VISIBLE_DEVICES = '';

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const mk = (id: string, title: string, extra: object = {}) => ({ id, key: `claude:${id}`, title, agent: 'claude', cwd: '/home/u/proj', updatedAt: Date.now() - 60_000, createdAt: 1, ...extra });
const a = mk('aaaa1111-0000-4000-8000-000000000001', 'Fix the login bug');
const b = mk('bbbb2222-0000-4000-8000-000000000002', 'Fix the logout bug');
const c = mk('cccc3333-0000-4000-8000-000000000003', 'Write the report', {
  queue: [
    { id: 'q1', text: 'first waiting', at: Date.now() - 5000 },
    { id: 'q2', text: 'second waiting', at: Date.now() - 4000 },
  ],
  queueHeld: true,
});
const helper = mk('dddd4444-0000-4000-8000-000000000004', 'A helper', { extra: { parent: 'claude:aaaa1111-0000-4000-8000-000000000001' } });
const old = mk('eeee5555-0000-4000-8000-000000000005', 'Archived thing', { archived: true });

const routes = (extra: Record<string, Answer> = {}): Record<string, Answer> => ({
  'GET /api/sessions?limit=1000': { sessions: [a, b, c, helper] },
  'GET /api/sessions?limit=1000&archived=1': { sessions: [old] },
  [`GET /api/sessions/${encodeURIComponent(a.key)}`]: { summary: a, live: { goal: { objective: 'All tests pass', status: 'active', turns: 2, reason: 'one fails' } } },
  [`GET /api/sessions/${encodeURIComponent(c.key)}`]: { summary: c, live: null },
  ...extra,
});
const path = (s: { key: string }, rest = '') => `/api/sessions/${encodeURIComponent(s.key)}${rest}`;
const refused = (p: Promise<unknown>, re: RegExp, kind: typeof UsageError | typeof ApiError = UsageError) => assert.rejects(p, (e: Error) => e instanceof kind && re.test(e.message), String(re));

test('naming a session: id start, title, full key; ambiguity and none', async () => {
  const t = fakeConn(routes({ [path(a, '/flags')]: { ok: true }, [path(helper, '/flags')]: { ok: true } }));
  for (const given of ['aaaa1111', 'aaaa', 'fix the login bug', 'FIX THE LOGIN', 'claude:aaaa1111-0000-4000-8000-000000000001']) {
    t.calls.length = 0;
    await run(t.conn, ['sessions', 'pin', given]);
    assert.deepEqual(t.calls.at(-1), { method: 'POST', path: path(a, '/flags'), body: { pinned: true } }, given);
  }
  await refused(run(t.conn, ['sessions', 'pin', 'fix']), /^“fix” fits 2 sessions: Fix the login bug .*Fix the logout bug/);
  await refused(run(t.conn, ['sessions', 'pin', 'zzz']), /^No session “zzz”: hydor sessions lists them$/);
  await refused(run(t.conn, ['sessions', 'pin', 'dddd4444']), /No session/, UsageError);
  await run(t.conn, ['sessions', 'pin', 'dddd4444', '--all']);
  await refused(run(t.conn, ['sessions', 'pin']), /^Say which session: hydor sessions pin <session>$/);
  const picked = await run(t.conn, ['sessions', 'pin'], { interactive: true, pick: a.id });
  assert.deepEqual(picked.picked, ['Which session?']);
  await assert.rejects(run(t.conn, ['sessions', 'pin'], { interactive: true, pick: null }), Cancelled);
});

test('flags: archive, unarchive (from the archived), pin, unpin, read', async () => {
  const t = fakeConn(routes({ [path(a, '/flags')]: { ok: true }, [path(old, '/flags')]: { ok: true }, [path(a, '/seen')]: { ok: true } }));
  let r = await run(t.conn, ['sessions', 'archive', 'fix the login']);
  assert.deepEqual(t.calls.at(-1)!.body, { archived: true });
  assert.match(r.out, /^Archived “Fix the login bug”\.$/m);
  await run(t.conn, ['sessions', 'unpin', 'fix the login']);
  assert.deepEqual(t.calls.at(-1)!.body, { pinned: false });
  r = await run(t.conn, ['sessions', 'unarchive', 'Archived']);
  assert.deepEqual(t.calls.at(-1), { method: 'POST', path: path(old, '/flags'), body: { archived: false } });
  assert.match(r.out, /is back in the list/);
  await run(t.conn, ['sessions', 'read', 'fix the login']);
  assert.deepEqual(t.calls.at(-1), { method: 'POST', path: path(a, '/seen'), body: {} });
  const j = await run(t.conn, ['sessions', 'archive', 'fix the login', '--json']);
  assert.deepEqual(j.json, [{ ok: true, key: a.key }]);
  assert.equal(j.out, '');
});

test('rename: the title, or back to the agent’s own', async () => {
  const t = fakeConn(routes({ [path(a, '/rename')]: { ok: true } }));
  const r = await run(t.conn, ['sessions', 'rename', 'fix the login', 'Login', 'is', 'fixed']);
  assert.deepEqual(t.calls.at(-1)!.body, { title: 'Login is fixed' });
  assert.match(r.out, /is now “Login is fixed”/);
  await run(t.conn, ['sessions', 'rename', 'fix the login', '--reset']);
  assert.deepEqual(t.calls.at(-1)!.body, { title: '' });
  await refused(run(t.conn, ['sessions', 'rename', 'fix the login']), /^Give the new title \(or --reset\)/);
});

test('snooze: times in several forms, off, and a mistake', async () => {
  const now = new Date(2026, 10, 12, 10, 0, 0).getTime();
  assert.equal(parseUntil('30m', now), now + 30 * 60_000);
  assert.equal(parseUntil('2h', now), now + 2 * 3_600_000);
  assert.equal(parseUntil('3 days', now), now + 3 * 86_400_000);
  assert.equal(parseUntil('1w', now), now + 7 * 86_400_000);
  assert.equal(parseUntil('tomorrow', now), new Date(2026, 10, 13, 8, 0).getTime());
  assert.equal(parseUntil('18:30', now), new Date(2026, 10, 12, 18, 30).getTime());
  assert.equal(parseUntil('9:00', now), new Date(2026, 10, 13, 9, 0).getTime(), 'a time past today is tomorrow’s');
  assert.equal(parseUntil('tomorrow 9:00', now), new Date(2026, 10, 13, 9, 0).getTime());
  assert.equal(parseUntil('2026-12-01', now), new Date('2026-12-01T08:00:00').getTime());
  assert.equal(parseUntil('2026-12-01 09:30', now), new Date('2026-12-01T09:30').getTime());
  assert.equal(parseUntil('2020-01-01', now), null, 'past');
  assert.equal(parseUntil('soon', now), null);
  const t = fakeConn(routes({ [path(a, '/flags')]: { ok: true } }));
  let r = await run(t.conn, ['sessions', 'snooze', 'fix the login', '2h']);
  const at = (t.calls.at(-1)!.body as { snoozedUntil: number }).snoozedUntil;
  assert.ok(Math.abs(at - (Date.now() + 2 * 3_600_000)) < 5000);
  assert.match(r.out, /is out of the list until /);
  r = await run(t.conn, ['sessions', 'snooze', 'fix the login', 'off']);
  assert.deepEqual(t.calls.at(-1)!.body, { snoozedUntil: null });
  assert.match(r.out, /is back\./);
  await refused(run(t.conn, ['sessions', 'snooze', 'fix the login', 'whenever']), /“whenever” is not a time to wait until/);
  await refused(run(t.conn, ['sessions', 'snooze', 'fix the login']), /^Say the until: /);
});

test('move: into a project, or out of one', async () => {
  const t = fakeConn(
    routes({
      'GET /api/projects': {
        spaces: [
          { id: 'sp1', name: 'Thesis' },
          { id: 'sp2', name: 'Notes' },
        ],
      },
      [path(a, '/extra')]: { extra: {} },
    }),
  );
  const r = await run(t.conn, ['sessions', 'move', 'fix the login', 'thesis']);
  assert.deepEqual(t.calls.at(-1), { method: 'PATCH', path: path(a, '/extra'), body: { space: 'sp1' } });
  assert.match(r.out, /is in “Thesis” now/);
  await run(t.conn, ['sessions', 'move', 'fix the login', 'none']);
  assert.deepEqual(t.calls.at(-1)!.body, { space: null });
  await refused(run(t.conn, ['sessions', 'move', 'fix the login', 'nope']), /^No project “nope”/);
});

test('fork: a message, or the default; the new address', async () => {
  const t = fakeConn(routes({ [path(a, '/fork')]: { key: 'claude:new-1' } }));
  let r = await run(t.conn, ['sessions', 'fork', 'fix the login', 'try', 'a', 'cache']);
  assert.deepEqual(t.calls.at(-1)!.body, { text: 'try a cache' });
  assert.match(r.out, /Forked “Fix the login bug”: http:\/\/fake\/s\/claude:new-1/);
  await run(t.conn, ['sessions', 'fork', 'fix the login']);
  assert.deepEqual(t.calls.at(-1)!.body, { text: 'Carry on from here.' });
});

test('goal: see it, set it, pause, resume, clear; one at a time', async () => {
  const t = fakeConn(routes({ [path(a, '/goal')]: { ok: true } }));
  let r = await run(t.conn, ['sessions', 'goal', 'fix the login']);
  assert.match(r.out, /^Goal +All tests pass$/m);
  assert.match(r.out, /^State +active$/m);
  assert.match(r.out, /^Why not yet +one fails$/m);
  assert.match((await run(t.conn, ['sessions', 'goal', 'Write'])).out, /has no goal/);
  r = await run(t.conn, ['sessions', 'goal', 'fix the login', 'tests', 'pass', 'and', 'PR', 'open']);
  assert.deepEqual(t.calls.at(-1)!.body, { action: 'set', objective: 'tests pass and PR open' });
  await run(t.conn, ['sessions', 'goal', 'fix the login', '--pause']);
  assert.deepEqual(t.calls.at(-1)!.body, { action: 'pause' });
  await run(t.conn, ['sessions', 'goal', 'fix the login', '--resume']);
  assert.deepEqual(t.calls.at(-1)!.body, { action: 'resume' });
  r = await run(t.conn, ['sessions', 'goal', 'fix the login', '--clear']);
  assert.deepEqual(t.calls.at(-1)!.body, { action: 'clear' });
  assert.match(r.out, /Goal cleared/);
  await refused(run(t.conn, ['sessions', 'goal', 'fix the login', '--clear', '--pause']), /^Pick one/);
  await refused(run(t.conn, ['sessions', 'goal', 'fix the login', 'words', '--clear']), /^Pick one/);
});

test('share: make a link, list, turn off', async () => {
  const links = path(a, '/guest-links');
  const t = fakeConn(routes({ [`POST ${links}`]: { id: 'g1', token: 'tok123' }, [`GET ${links}`]: { links: [{ id: 'g1', token: 'tok123', expiresAt: null }] }, '/api/guest-links/g1': { ok: true } }));
  let r = await run(t.conn, ['sessions', 'share', 'fix the login', '--days', '7']);
  assert.deepEqual(t.calls.at(-1), { method: 'POST', path: links, body: { days: 7 } });
  assert.match(r.out, /^http:\/\/fake\/g\/tok123$/m);
  assert.match(r.out, /for 7 days/);
  await run(t.conn, ['sessions', 'share', 'fix the login']);
  assert.deepEqual(t.calls.at(-1)!.body, { days: null });
  r = await run(t.conn, ['sessions', 'share', 'fix the login', '--list']);
  assert.match(r.out, /g1 +http:\/\/fake\/g\/tok123 +until turned off/);
  await run(t.conn, ['sessions', 'share', 'fix the login', '--stop', 'g1']);
  assert.deepEqual(t.calls.at(-1), { method: 'DELETE', path: '/api/guest-links/g1' });
  await refused(run(t.conn, ['sessions', 'share', 'fix the login', '--days', 'many']), /--days takes a number/);
});

test('changes and commands: tables', async () => {
  const t = fakeConn(
    routes({
      [path(a, '/changes')]: { files: [{ path: '/home/u/proj/a.ts', added: 5, removed: 1, edits: [{}, {}] }] },
      [path(a, '/commands')]: {
        commands: [
          { ts: Date.now(), tool: { title: 'npm test', status: 'done', exitCode: 0 } },
          { ts: Date.now(), tool: { title: 'npm run build', status: 'error', exitCode: 2 } },
        ],
      },
    }),
  );
  assert.match((await run(t.conn, ['sessions', 'changes', 'fix the login'])).out, /^\+5 +-1 +2 edits +~\/proj\/a\.ts$/m);
  const r = await run(t.conn, ['sessions', 'commands', 'fix the login']);
  assert.match(r.out, /^✓ +npm test/m);
  assert.match(r.out, /^✗ +npm run build +exit 2/m);
  assert.match((await run(fakeConn(routes({ [path(a, '/changes')]: { files: [] } })).conn, ['sessions', 'changes', 'fix the login'])).out, /changed no files/);
});

test('queue: list, remove one by number or text, clear after a yes', async () => {
  const t = fakeConn(routes({ [path(c, '/queue/q1/delete')]: { ok: true }, [path(c, '/queue/q2/delete')]: { ok: true } }));
  let r = await run(t.conn, ['sessions', 'queue', 'write the report']);
  assert.match(r.out, /^1 +first waiting/m);
  assert.match(r.out, /^2 +second waiting/m);
  assert.match(r.out, /Held: the queue goes out when the agent runs again\./);
  assert.match((await run(t.conn, ['sessions', 'queue', 'fix the login'])).out, /Nothing is waiting/);
  await run(t.conn, ['sessions', 'queue', 'remove', 'write the report', '2']);
  assert.deepEqual(t.calls.at(-1), { method: 'POST', path: path(c, '/queue/q2/delete'), body: {} });
  await run(t.conn, ['sessions', 'queue', 'remove', 'write the report', 'first']);
  assert.deepEqual(t.calls.at(-1)!.path, path(c, '/queue/q1/delete'));
  const n = t.calls.length;
  await refused(run(t.conn, ['sessions', 'queue', 'clear', 'write the report']), /nobody to ask here, so add -y/);
  r = await run(t.conn, ['sessions', 'queue', 'clear', 'write the report'], { interactive: true, confirm: false });
  assert.match(r.out, /Not removed/);
  assert.ok(!t.calls.slice(n).some((x) => x.method === 'POST' && x.path.includes('/queue/')), 'no is no');
  r = await run(t.conn, ['sessions', 'queue', 'clear', 'write the report', '-y']);
  assert.deepEqual(
    t.calls.slice(-2).map((x) => x.path),
    [path(c, '/queue/q1/delete'), path(c, '/queue/q2/delete')],
  );
  assert.match(r.out, /Took 2 messages off the queue/);
});

test('delete: only after a yes, naming the session', async () => {
  const t = fakeConn(routes({ [`DELETE ${path(a)}`]: { ok: true } }));
  await refused(
    run(t.conn, ['sessions', 'delete', 'fix the login']),
    /^Delete “Fix the login bug” and its history\? This cannot be undone\. \[hydor sessions archive keeps it\]: nobody to ask here|nobody to ask here, so add -y/,
  );
  assert.ok(!t.calls.some((x) => x.method === 'DELETE'));
  let r = await run(t.conn, ['sessions', 'delete', 'fix the login'], { interactive: true, confirm: false });
  assert.match(r.out, /Not deleted/);
  assert.ok(!t.calls.some((x) => x.method === 'DELETE'));
  r = await run(t.conn, ['sessions', 'rm', 'fix the login', '-y']);
  assert.deepEqual(t.calls.at(-1), { method: 'DELETE', path: path(a) });
  assert.match(r.out, /Deleted “Fix the login bug”/);
});

test('list, search, show, send, stop as verbs', async () => {
  const hit = { key: a.key, title: a.title, cwd: '/home/u/proj', updatedAt: Date.now(), kind: 'message', snippet: 'we fixed the \u0001login\u0002 bug' };
  const t = fakeConn(
    routes({
      'GET /api/sessions?limit=75': { sessions: [a, b, c, helper], total: 4 },
      'GET /api/search?q=login': { hits: [hit] },
      [path(a, '/interrupt')]: { ok: true },
      [path(a, '/message')]: { ok: true },
      [path(a, '/queue')]: { ok: true },
    }),
  );
  let r = await run(t.conn, ['sessions', 'list']);
  assert.match(r.out, /^aaaa1111 +· +Fix the login bug/m);
  assert.ok(!r.out.includes('A helper'), 'helpers left out');
  assert.equal(JSON.stringify((await run(t.conn, ['sessions', 'list', '--json'])).json).includes('A helper'), false);
  r = await run(t.conn, ['sessions', 'search', 'login']);
  assert.match(r.out, /^aaaa1111 +Fix the login bug +~\/proj/m);
  assert.match(r.out, /we fixed the login bug/);
  assert.equal(
    boldMatches('a \u0001b\u0002 c', (s) => `*${s}*`),
    'a *b* c',
  );
  r = await run(t.conn, ['sessions', 'send', 'fix the login', 'and', 'add', 'a', 'test']);
  assert.deepEqual(t.calls.at(-1), { method: 'POST', path: path(a, '/message'), body: { text: 'and add a test' } });
  assert.match(r.out, /^Sent\.$/m);
  await refused(run(t.conn, ['sessions', 'send', 'fix the login'], { files: { '-': '' } }), /^Give the message: hydor sessions send <session> \[message…\]$/);
  r = await run(t.conn, ['sessions', 'stop', 'fix the login']);
  assert.match(r.out, /Stopped its turn/);
  const busy = fakeConn(routes({ [path(a, '/interrupt')]: new ApiError(409, 'not running') }));
  assert.match((await run(busy.conn, ['sessions', 'stop', 'fix the login'])).out, /It is not working\./);
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
