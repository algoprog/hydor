// Checks for `hydor connections` against a fake connection (test-kit.ts): list and show, services (the marketplace), connect for
// each way a service connects (nothing, a key typed hidden or from stdin, details, a sign-in in the browser whose flow is followed),
// keys never printed back, and disconnect asking first. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/tui/areas/connections-test.ts && DATA_DIR=/tmp/hydor-test-connections node dist/dev/connections-test.js
import assert from 'node:assert/strict';
import { fakeConn, run } from './test-kit.ts';
import { UsageError } from './kit.ts';
import { poll } from './connections.ts';

const DATA = process.env.DATA_DIR ?? '';
if (!DATA.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
process.env.CUDA_VISIBLE_DEVICES = '';
poll.ms = 1;

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const app = (id: string, name: string, auth: any, extra: any = {}) => ({
  id,
  name,
  description: `${name} for agents`,
  category: 'productivity',
  icon: id,
  homepage: `https://${id}.example`,
  server: { transport: 'http', url: `https://${id}.example/mcp` },
  auth,
  verified: null,
  ...extra,
});
const notion = app('notion', 'Notion', { type: 'oauth' });
const exa = app('exa', 'Exa Search', { type: 'api_key' }, { keywords: ['search'] });
const fsApp = app(
  'filesystem',
  'Filesystem',
  { type: 'none' },
  {
    server: { transport: 'stdio', command: 'npx' },
    fields: [
      { name: 'ROOT', label: 'Folder', help: 'a folder' },
      { name: 'MODE', label: 'Mode', optional: true, default: 'ro' },
    ],
  },
);
const db = app('postgres', 'Postgres', { type: 'api_key' }, { server: { transport: 'stdio', command: 'x' }, fields: [{ name: 'DATABASE_URL', label: 'Database address', secret: true }] });
const ping = app('ping', 'Ping', { type: 'none' });
const catalog = { apps: [notion, exa, fsApp, db, ping], categories: {} };
const conn = (a: any, o: any = {}) => ({ id: a.id, name: a.name, app: a, enabled: true, status: 'ok', fields: {}, secretFields: [], createdAt: 1, updatedAt: 1, ...o });
const mine = [
  conn(notion, {
    hint: 'chris@example.com',
    tools: [
      { name: 'search', description: 'Find pages', on: true },
      { name: 'delete', on: false },
    ],
    testedAt: Date.now() - 60_000,
  }),
  conn(exa, { status: 'error', error: 'Key refused', hint: '…f3a9', secretFields: ['KEY'], enabled: false }),
];
const routes = { 'GET /api/connections': { connections: mine, secrets: [] }, 'GET /api/connections/catalog': catalog };

test('list shows what is connected, how it is doing, and tools on', async () => {
  const { conn: c } = fakeConn(routes);
  const t = await run(c, ['connections']);
  assert.match(t.out, /Notion\s+notion\s+connected\s+1\/2 tools\s+chris@example\.com/);
  assert.match(t.out, /Exa Search\s+exa\s+error\s+off for sessions\s+…f3a9/);
  assert.deepEqual((await run(c, ['connections', 'list', '--json'])).json, [routes['GET /api/connections']]);
  assert.match((await run(fakeConn({ 'GET /api/connections': { connections: [], secrets: [] } }).conn, ['connections'])).out, /Nothing is connected yet/);
});

test('show prints the state, details, keys set (never their values) and tools', async () => {
  const withKey = [conn(db, { fields: { MODE: 'ro' }, secretFields: ['DATABASE_URL'], hint: '…db' }), ...mine];
  const { conn: c } = fakeConn({ ...routes, 'GET /api/connections': { connections: withKey } });
  const t = await run(c, ['connections', 'show', 'postgres']);
  assert.match(t.out, /Keys set\s+DATABASE_URL/);
  assert.match(t.out, /Details\s+MODE=ro/);
  const n = await run(c, ['connections', 'show', 'notion']);
  assert.match(n.out, /State\s+connected/);
  assert.match(n.out, /Connects with\s+a sign-in in your browser/);
  assert.match(n.out, /on\s+search\s+Find pages/);
  assert.match(n.out, /off\s+delete/);
  assert.match((await run(c, ['connections', 'show', 'exa'])).out, /State\s+error: Key refused/);
  await assert.rejects(run(c, ['connections', 'show', 'zzz']), (e) => e instanceof UsageError && /No connection “zzz”/.test((e as Error).message));
});

test('services lists the marketplace, with a mark on what is connected, and words narrow it', async () => {
  const { conn: c } = fakeConn(routes);
  const t = await run(c, ['connections', 'services']);
  assert.match(t.out, /●\s+Notion\s+notion\s+a sign-in in your browser/);
  assert.match(t.out, /·\s+Filesystem\s+filesystem\s+a few details/);
  assert.match(t.out, /Ping\s+ping\s+nothing to enter/);
  const s = await run(c, ['connections', 'services', 'search']);
  assert.match(s.out, /Exa Search/);
  assert.ok(!s.out.includes('Notion'));
  assert.match((await run(c, ['connections', 'services', 'zzz'])).out, /No service fits/);
});

test('connect: nothing to enter, details, and a key typed hidden or from stdin that is never printed', async () => {
  const KEY = 'exa-SECRET-KEY';
  const { conn: c, calls } = fakeConn({
    ...routes,
    'GET /api/connections': { connections: [] },
    'POST /api/connections/ping': { connection: conn(ping) },
    'POST /api/connections/filesystem': { connection: conn(fsApp, { status: 'untested' }) },
    'POST /api/connections/exa': { connection: conn(exa) },
    'POST /api/connections/postgres': { connection: conn(db, { status: 'untested' }) },
  });
  assert.equal((await run(c, ['connections', 'connect', 'ping'])).out, 'Ping is connected.\n');
  assert.deepEqual(calls.at(-1), { method: 'POST', path: '/api/connections/ping', body: { fields: {}, test: false } });
  const f = await run(c, ['connections', 'connect', 'filesystem', '--field', 'ROOT=/docs']);
  assert.deepEqual(calls.at(-1)?.body, { fields: { ROOT: '/docs', MODE: 'ro' }, test: true });
  assert.match(f.out, /Filesystem is connected \(testing it in the background\)/);
  await assert.rejects(run(c, ['connections', 'connect', 'filesystem']), (e) => e instanceof UsageError && /needs Folder \(ROOT\): add --field ROOT=<value>/.test((e as Error).message));
  await assert.rejects(run(c, ['connections', 'connect', 'filesystem', '--field', 'NOPE=1']), (e) => e instanceof UsageError && /no field NOPE: its fields are ROOT, MODE/.test((e as Error).message));
  const asked = await run(c, ['connections', 'connect', 'filesystem'], { interactive: true, typed: ['/data'] });
  assert.deepEqual(asked.typed, [{ question: 'Folder (a folder): ', hidden: false }]);
  assert.equal((calls.at(-1)!.body as any).fields.ROOT, '/data');
  const k = await run(c, ['connections', 'connect', 'exa', '--file', '-'], { files: { '-': `${KEY}\n` } });
  assert.deepEqual(calls.at(-1)?.body, { fields: {}, test: false, key: KEY });
  assert.ok(!k.out.includes('SECRET'));
  const h = await run(c, ['connections', 'connect', 'exa', '--json'], { interactive: true, typed: [KEY] });
  assert.deepEqual(h.typed, [{ question: 'Exa Search key (typed hidden): ', hidden: true }]);
  assert.ok(!JSON.stringify(h).includes('SECRET'));
  await assert.rejects(run(c, ['connections', 'connect', 'exa']), (e) => e instanceof UsageError && /--file -/.test((e as Error).message));
  await run(c, ['connections', 'connect', 'postgres'], { interactive: true, typed: ['postgres://u:p@h/db'] });
  assert.equal((calls.at(-1)!.body as any).fields.DATABASE_URL, 'postgres://u:p@h/db');
});

test('connect with a sign-in prints the address, follows the flow, and says when it is done', async () => {
  let looks = 0;
  const { conn: c, calls } = fakeConn({
    ...routes,
    'POST /api/connections/notion/oauth': { url: 'https://notion.example/auth?x=1', flow: 'fl1' },
    'GET /api/connections/flows/fl1': () => ({ result: ++looks < 3 ? null : { ok: true } }),
  });
  const t = await run(c, ['connections', 'connect', 'notion']);
  assert.match(t.out, /Sign in to Notion in your browser:\nhttps:\/\/notion\.example\/auth\?x=1\n/);
  assert.match(t.out, /Notion is connected\./);
  assert.ok(looks >= 3);
  assert.deepEqual(calls.find((x) => x.method === 'POST')!.body, { fields: {} });
  const bad = fakeConn({ ...routes, 'POST /api/connections/notion/oauth': { url: 'https://x', flow: 'fl2' }, 'GET /api/connections/flows/fl2': { result: { ok: false, error: 'Access denied' } } });
  await assert.rejects(run(bad.conn, ['connections', 'connect', 'notion']), (e) => e instanceof UsageError && /Signing in did not finish: Access denied/.test((e as Error).message));
  const own = fakeConn({ ...routes, 'POST /api/connections/notion/oauth': (b: any) => ({ connection: conn(notion), got: b }) });
  const o = await run(own.conn, ['connections', 'connect', 'notion', '--client-id', 'cid'], { interactive: true, typed: ['csecret'] });
  assert.deepEqual(own.calls.find((x) => x.method === 'POST')!.body, { fields: {}, clientId: 'cid', clientSecret: 'csecret' });
  assert.ok(!o.out.includes('csecret'));
  const slow = fakeConn({ ...routes, 'POST /api/connections/notion/oauth': { url: 'https://x', flow: 'fl3' }, 'GET /api/connections/flows/fl3': { result: null } });
  await assert.rejects(run(slow.conn, ['connections', 'connect', 'notion', '--wait', '0.01']), (e) => e instanceof UsageError && /Still waiting/.test((e as Error).message));
});

test('disconnect asks first', async () => {
  const { conn: c, calls } = fakeConn({ ...routes, 'DELETE /api/connections/exa': { ok: true } });
  await assert.rejects(run(c, ['connections', 'disconnect', 'exa']), (e) => e instanceof UsageError && /add -y/.test((e as Error).message));
  const no = await run(c, ['connections', 'disconnect', 'exa'], { interactive: true, confirm: false });
  assert.deepEqual(no.asked, ['Disconnect “Exa Search”? Its key or sign-in is deleted.']);
  assert.ok(!calls.some((x) => x.method === 'DELETE'));
  assert.equal((await run(c, ['connections', 'rm', 'exa', '-y'])).out, 'Disconnected “Exa Search”.\n');
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
