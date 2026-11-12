// Checks for `hydor mcp`: servers listed and checked, added to one or both agents, edited (removed, then added again; values asked for again), removed.
// Against a fake connection (test-kit.ts). Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/tui/areas/mcp-test.ts && DATA_DIR=/tmp/hydor-test-mcp node dist/dev/mcp-test.js
import assert from 'node:assert/strict';
import { ApiError } from '../client.ts';
import { UsageError } from './kit.ts';
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

const gh = { agent: 'claude', name: 'github', scope: 'user', transport: 'stdio', command: 'npx', args: ['-y', 'gh-mcp'], envKeys: ['GITHUB_TOKEN'] };
const docs = { agent: 'claude', name: 'docs', scope: 'user', transport: 'http', url: 'https://x.dev/mcp' };
const local = { agent: 'claude', name: 'db', scope: 'local', transport: 'stdio', command: 'uvx', args: ['sqlite'] };
const cgh = { agent: 'codex', name: 'github', scope: 'user', transport: 'stdio', command: 'npx', args: ['gh'], enabled: false };
const servers = [gh, docs, local, cgh];

const routes = (extra: Record<string, Answer> = {}): Record<string, Answer> => ({ 'GET /api/setup/mcp': { servers }, ...extra });
const refused = (p: Promise<unknown>, re: RegExp, kind: typeof UsageError | typeof ApiError = UsageError) => assert.rejects(p, (e: Error) => e instanceof kind && re.test(e.message), String(re));
const ok = (agent: string) => ({ agent, ok: true, output: '' });

test('list: a table with the keys’ names (never values); --agent, --scope, --folder; --json', async () => {
  const { conn, calls } = fakeConn(routes());
  const r = await run(conn, ['mcp']);
  assert.deepEqual(calls, [{ method: 'GET', path: '/api/setup/mcp' }]);
  assert.match(r.out, /^ *SERVER +AGENT +SCOPE +TYPE +COMMAND OR ADDRESS +KEYS/m);
  assert.match(r.out, /^● +github +Claude Code +user +stdio +npx -y gh-mcp +GITHUB_TOKEN$/m);
  assert.match(r.out, /^● +docs +Claude Code +user +http +https:\/\/x\.dev\/mcp/m);
  assert.match(r.out, /^· +github +Codex +user +stdio +npx gh/m);
  assert.doesNotMatch((await run(fakeConn(routes()).conn, ['mcp', '--agent', 'codex'])).out, /docs/);
  assert.doesNotMatch((await run(fakeConn(routes()).conn, ['mcp', '--scope', 'user'])).out, / db /);
  const f = fakeConn(routes({ 'GET /api/setup/mcp?cwd=%2Fcode%2Fapp': { servers: [local] } }));
  await run(f.conn, ['mcp', '--folder', '/code/app']);
  assert.equal(f.calls[0].path, '/api/setup/mcp?cwd=%2Fcode%2Fapp');
  assert.deepEqual((await run(fakeConn(routes()).conn, ['mcp', '--json'])).json, [{ servers }]);
  assert.match((await run(fakeConn({ 'GET /api/setup/mcp': { servers: [] } }).conn, ['mcp'])).out, /No MCP servers: hydor mcp add <name> <command…> adds one\./);
  await refused(run(conn, ['mcp', '--agent', 'x']), /--agent takes claude or codex/);
});

test('status: each agent’s servers started, one after the other; --agent; --json', async () => {
  const st = (agent: string) => ({
    servers: [
      { name: 'github', state: 'connected', tools: 12 },
      { name: 'bad', state: 'failed', error: 'spawn ENOENT' },
    ],
    agent,
  });
  const { conn, calls } = fakeConn(routes({ 'POST /api/setup/mcp/status': (b: unknown) => st((b as { agent: string }).agent) }));
  const r = await run(conn, ['mcp', 'status']);
  assert.deepEqual(
    calls.map((c) => c.body),
    [{ agent: 'claude' }, { agent: 'codex' }],
  );
  assert.match(r.out, /^● +github +Claude Code +connected · 12 tools$/m);
  assert.match(r.out, /^✗ +bad +Codex +failed +spawn ENOENT$/m);
  const one = await run(conn, ['mcp', 'status', '--agent', 'claude', '--folder', '/code/app', '--json']);
  assert.deepEqual(calls.at(-1)?.body, { agent: 'claude', cwd: '/code/app' });
  assert.deepEqual(one.json, [st('claude')]);
});

test('add: a command server to both agents; a remote one; env hidden; what each agent said', async () => {
  const { conn, calls } = fakeConn(routes({ 'POST /api/setup/mcp': { results: [ok('claude'), { agent: 'codex', ok: false, output: 'codex: no such flag' }] } }));
  const r = await run(conn, ['mcp', 'add', 'github', '--env', 'GITHUB_TOKEN=abc', '--', 'npx', '-y', 'gh-mcp']);
  assert.deepEqual(calls.at(-1), {
    method: 'POST',
    path: '/api/setup/mcp',
    body: { agents: ['claude', 'codex'], name: 'github', transport: 'stdio', command: 'npx', args: ['-y', 'gh-mcp'], env: { GITHUB_TOKEN: 'abc' } },
  });
  assert.match(r.out, /^✓ Added “github” to Claude Code\.$/m);
  assert.match(r.out, /^✗ Codex would not add “github”: codex: no such flag$/m);
  assert.equal(r.code, 1, 'one agent refused');
  const good = fakeConn(routes({ 'POST /api/setup/mcp': { results: [ok('claude')] } }));
  const d = await run(good.conn, ['mcp', 'add', 'docs', '--url', 'https://x.dev/mcp', '--agent', 'claude', '--header', 'Authorization: Bearer t', '--scope', 'local', '--folder', '/code/app']);
  assert.deepEqual(good.calls.at(-1)?.body, {
    agents: ['claude'],
    name: 'docs',
    transport: 'http',
    url: 'https://x.dev/mcp',
    headers: { Authorization: 'Bearer t' },
    scope: 'local',
    cwd: '/code/app',
  });
  assert.equal(d.code, 0);
  await run(good.conn, ['mcp', 'add', 'db', '--command', 'uvx "my server" ~/x']);
  assert.deepEqual(good.calls.at(-1)?.body, { agents: ['claude', 'codex'], name: 'db', transport: 'stdio', command: 'uvx', args: ['my server', '/home/u/x'] });
  await run(good.conn, ['mcp', 'add', 'sse1', '--transport', 'sse', '--url', 'https://x.dev/sse']);
  assert.deepEqual((good.calls.at(-1)?.body as { agents: string[] }).agents, ['claude'], 'Codex has no SSE');
  await run(good.conn, ['mcp', 'add', 'b', '--url', 'https://x.dev/m', '--bearer-env', 'TOKEN_VAR']);
  assert.equal((good.calls.at(-1)?.body as { bearerEnv: string }).bearerEnv, 'TOKEN_VAR');
  // A KEY alone is asked for hidden; with nobody to ask it is an error that says how.
  const hidden = await run(good.conn, ['mcp', 'add', 'h', '--env', 'API_KEY', '--', 'srv'], { interactive: true, secret: 'typed-secret' });
  assert.deepEqual((good.calls.at(-1)?.body as { env: object }).env, { API_KEY: 'typed-secret' });
  assert.deepEqual(hidden.secretAsked, ['Environment variable API_KEY: ']);
  assert.doesNotMatch(hidden.out, /typed-secret/);
  await refused(run(good.conn, ['mcp', 'add', 'h', '--env', 'API_KEY', '--', 'srv']), /Environment variable API_KEY has no value: write API_KEY=<value>/);
  await refused(run(good.conn, ['mcp', 'add', 'x']), /Say what starts it: hydor mcp add x <command…> \(or --url for a remote one\)/);
  await refused(run(good.conn, ['mcp', 'add', 'x', '--url', 'ftp://x']), /Give its http\(s\) address with --url/);
  await refused(run(good.conn, ['mcp', 'add', 'x', '--url', 'https://x.dev', '--env', 'A=b']), /--env is for a command server/);
  await refused(run(good.conn, ['mcp', 'add', 'x', '--transport', 'sse', '--url', 'https://x.dev', '--agent', 'codex']), /SSE is Claude Code’s only/);
  await refused(run(good.conn, ['mcp', 'add', 'x', '--transport', 'pipe']), /--transport takes stdio, http or sse/);
  const j = await run(good.conn, ['mcp', 'add', 'docs', '--url', 'https://x.dev/mcp', '--json']);
  assert.deepEqual(j.json, [{ results: [ok('claude')] }]);
});

test('edit: removed, then added again with what is kept; values asked for again; put back when it fails', async () => {
  const { conn, calls } = fakeConn(routes({ 'POST /api/setup/mcp/remove': { ok: true, output: '' }, 'POST /api/setup/mcp': { results: [ok('claude')] } }));
  await refused(run(conn, ['mcp', 'edit', 'docs']), /^Say what to change: --command, --url, --env, --header, --bearer-env/);
  await refused(
    run(conn, ['mcp', 'edit', 'github', '--agent', 'claude', '--command', 'npx -y other']),
    /has GITHUB_TOKEN, whose values are never returned to Hydor: give them again \(--env GITHUB_TOKEN=<value>\)/,
  );
  await refused(run(conn, ['mcp', 'edit', 'github', '--url', 'https://x.dev']), /fits 2 MCP servers: github \(claude:user:github\), github \(codex:user:github\)/);
  await refused(run(conn, ['mcp', 'edit', 'docs', '--url', 'https://x.dev/v2'], {}), /nobody to ask here, so add -y/);
  assert.ok(!calls.some((c) => c.path === '/api/setup/mcp/remove'));
  const r = await run(conn, ['mcp', 'edit', 'docs', '--url', 'https://x.dev/v2', '-y']);
  assert.deepEqual(
    calls.filter((c) => c.method === 'POST').map((c) => [c.path, c.body]),
    [
      ['/api/setup/mcp/remove', { agent: 'claude', name: 'docs', scope: 'user' }],
      ['/api/setup/mcp', { agents: ['claude'], name: 'docs', transport: 'http', url: 'https://x.dev/v2', scope: 'user' }],
    ],
  );
  assert.match(r.out, /^Changed “docs” for Claude Code\.$/m);
  await run(conn, ['mcp', 'edit', 'claude:user:github', '--command', 'npx -y other', '--env', 'GITHUB_TOKEN=n', '-y']);
  assert.deepEqual(calls.at(-1)?.body, { agents: ['claude'], name: 'github', transport: 'stdio', command: 'npx', args: ['-y', 'other'], env: { GITHUB_TOKEN: 'n' }, scope: 'user' });
  await run(conn, ['mcp', 'edit', 'db', '--env', 'X=1', '-y']);
  assert.equal((calls.at(-1)?.body as { scope: string }).scope, 'local', 'it stays where it was');
  assert.deepEqual((calls.at(-1)?.body as { args: string[] }).args, ['sqlite'], 'its command is kept');
  // The add fails: a server with nothing secret is put back.
  let adds = 0;
  const bad = fakeConn(
    routes({
      'POST /api/setup/mcp/remove': { ok: true },
      'POST /api/setup/mcp': () => (++adds === 1 ? { results: [{ agent: 'claude', ok: false, output: 'bad url' }] } : { results: [ok('claude')] }),
    }),
  );
  await refused(run(bad.conn, ['mcp', 'edit', 'docs', '--url', 'https://x.dev/new', '-y']), /Claude Code would not take the change to “docs”: bad url\nIt is back as it was\./, ApiError);
  assert.deepEqual(bad.calls.at(-1)?.body, { agents: ['claude'], name: 'docs', transport: 'http', url: 'https://x.dev/mcp', scope: 'user' });
  adds = 0;
  const secret = fakeConn(routes({ 'POST /api/setup/mcp/remove': { ok: true }, 'POST /api/setup/mcp': { results: [{ agent: 'claude', ok: false, output: 'no' }] } }));
  await refused(run(secret.conn, ['mcp', 'edit', 'claude:user:github', '--env', 'GITHUB_TOKEN=n', '-y']), /It is removed: add it again with hydor mcp add\./, ApiError);
  const stuck = fakeConn(routes({ 'POST /api/setup/mcp/remove': { ok: false, output: 'in use' } }));
  await refused(run(stuck.conn, ['mcp', 'edit', 'docs', '--url', 'https://x.dev/v3', '-y']), /Claude Code would not remove “docs”: in use/, ApiError);
});

test('remove: asks, names the agent, an agent’s refusal is an error', async () => {
  const { conn, calls } = fakeConn(routes({ 'POST /api/setup/mcp/remove': { ok: true, output: '' }, 'GET /api/setup/mcp?cwd=%2Fcode%2Fapp': { servers: [local] } }));
  await refused(run(conn, ['mcp', 'remove', 'docs']), /nobody to ask here, so add -y/);
  let r = await run(conn, ['mcp', 'remove', 'docs'], { interactive: true, confirm: false });
  assert.deepEqual(r.asked, ['Remove “docs” from Claude Code?']);
  assert.match(r.out, /^Not removed\.$/m);
  r = await run(conn, ['mcp', 'rm', 'db', '-y', '--folder', '/code/app']);
  assert.equal(calls.at(-1)?.path, '/api/setup/mcp/remove');
  r = await run(conn, ['mcp', 'remove', 'github', '--agent', 'codex', '-y']);
  assert.deepEqual(calls.at(-1)?.body, { agent: 'codex', name: 'github', scope: 'user' });
  assert.match(r.out, /^Removed “github” from Codex\.$/m);
  await refused(run(conn, ['mcp', 'remove', 'github', '-y']), /fits 2 MCP servers/);
  await refused(run(conn, ['mcp', 'remove', 'nothing', '-y']), /^No MCP server “nothing”: hydor mcp lists them$/);
  const no = fakeConn(routes({ 'POST /api/setup/mcp/remove': { ok: false, output: 'not found' } }));
  await refused(run(no.conn, ['mcp', 'remove', 'docs', '-y']), /Claude Code would not remove “docs”: not found/, ApiError);
  const picked = await run(fakeConn(routes({ 'POST /api/setup/mcp/remove': { ok: true } })).conn, ['mcp', 'remove'], { interactive: true, pick: 'claude:user:docs', confirm: true });
  assert.deepEqual(picked.picked, ['Which MCP server?']);
  assert.match(picked.out, /^Removed “docs”/m);
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
