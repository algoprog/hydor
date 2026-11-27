// Custom's own MCP servers and the browser sign-ins of HTTP servers: adding, listing, changing and removing one
// (no program is run), a name kept by Hydor winning over a program's, and a fake OAuth-protected MCP server on this
// machine that Custom signs in to with dynamic registration, calls with the token the app adds, renews when the token
// ends, and asks to sign in again only when renewing is refused. No network beyond 127.0.0.1, no claude or codex.
//
//   OUTDIR=dist/dev node scripts/build-server.mjs server/mcpservers/mcpservers-test.ts
//   DATA_DIR=/tmp/hydor-test-mcpservers node dist/dev/mcpservers-test.js
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import Fastify from 'fastify';
import { McpClient, mcpServers } from '../agent/mcp.ts';
import { config } from '../config.ts';
import { redact } from '../connections/vault.ts';
import { openDb } from '../db.ts';
import { registerFeatures } from '../features/registry.ts';
import { connections } from '../connections/index.ts';
import type { Deps } from '../features/types.ts';
import { runToken } from '../mcp.ts';
import type { SessionManager } from '../sessions.ts';
import { addMcp } from '../setup.ts';
import { customStatus, customStore, listCustom, mcpServersFeature, removeCustom, removingTheirs, signOut, updateCustom } from './index.ts';
import { readStore } from './store.ts';

// A home of its own: Claude Code's and Codex's settings are read from it. The programs would leave a mark if run.
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpservers-home-'));
process.env.HOME = home;
process.env.CODEX_HOME = path.join(home, '.codex');
const ran = path.join(home, 'a-program-ran');
const program = path.join(home, 'program.sh');
fs.writeFileSync(program, `#!/bin/sh\ntouch '${ran}'\n`, { mode: 0o755 });
config.claudeBin = program;
config.codexBin = program;
config.home = home;
fs.mkdirSync(config.dataDir, { recursive: true });
fs.rmSync(customStore(), { force: true });

// ---- a fake MCP server behind a fake sign-in server ----------------------------------------------------

const fake = {
  access: new Set<string>(),
  refresh: new Set<string>(),
  codes: new Map<string, { client: string; challenge: string; redirect: string }>(),
  registered: 0,
  refreshed: 0,
  refuseRefresh: false,
  expiresIn: 3600,
  /** The Authorization header of every tools/call. */
  calls: [] as string[],
  headers: [] as http.IncomingHttpHeaders[],
};
let base = '';
const issue = () => {
  const access = `at_${crypto.randomBytes(12).toString('hex')}`;
  const refresh = `rt_${crypto.randomBytes(12).toString('hex')}`;
  fake.access.add(access);
  fake.refresh.add(refresh);
  return { access_token: access, refresh_token: refresh, token_type: 'Bearer', expires_in: fake.expiresIn };
};
const read = (req: http.IncomingMessage) =>
  new Promise<string>((r) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => r(b));
  });
const json = (res: http.ServerResponse, status: number, v: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(v));
};
const mcpReply = (m: any, auth: string) => {
  if (m.method === 'initialize') return { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'shop', version: '1' } };
  if (m.method === 'tools/list') return { tools: [{ name: 'whoami', description: 'Who is asking.', inputSchema: { type: 'object', properties: {} } }] };
  return { content: [{ type: 'text', text: `asked with ${auth}` }] };
};
const sse = new Map<string, http.ServerResponse>();

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url!, base);
  const body = await read(req);
  if (u.pathname.startsWith('/.well-known/oauth-protected-resource'))
    return u.pathname.endsWith('/mcp') ? json(res, 200, { resource: `${base}/mcp`, authorization_servers: [`${base}/as`], scopes_supported: ['shop'] }) : json(res, 404, {});
  if (u.pathname === '/.well-known/oauth-authorization-server/as')
    return json(res, 200, { issuer: `${base}/as`, authorization_endpoint: `${base}/as/authorize`, token_endpoint: `${base}/as/token`, registration_endpoint: `${base}/as/register`, code_challenge_methods_supported: ['S256'] });
  if (u.pathname === '/as/register') return json(res, 201, { client_id: `client_${++fake.registered}`, token_endpoint_auth_method: 'none' });
  if (u.pathname === '/as/authorize') {
    const code = crypto.randomBytes(8).toString('hex');
    const q = u.searchParams;
    fake.codes.set(code, { client: q.get('client_id')!, challenge: q.get('code_challenge')!, redirect: q.get('redirect_uri')! });
    res.writeHead(302, { location: `${q.get('redirect_uri')}?code=${code}&state=${q.get('state')}` });
    return res.end();
  }
  if (u.pathname === '/as/token') {
    const q = new URLSearchParams(body);
    if (q.get('grant_type') === 'authorization_code') {
      const c = fake.codes.get(q.get('code')!);
      const ok = c && c.client === q.get('client_id') && c.redirect === q.get('redirect_uri') && crypto.createHash('sha256').update(q.get('code_verifier')!).digest('base64url') === c.challenge;
      return ok ? json(res, 200, issue()) : json(res, 400, { error: 'invalid_grant' });
    }
    if (fake.refuseRefresh || !fake.refresh.delete(q.get('refresh_token')!)) return json(res, 400, { error: 'invalid_grant' });
    fake.refreshed++;
    return json(res, 200, issue());
  }
  const auth = String(req.headers.authorization ?? '');
  const m = body ? JSON.parse(body) : {};
  if (u.pathname === '/mcp') {
    fake.headers.push(req.headers);
    if (!fake.access.has(auth.replace(/^Bearer /, ''))) return json(res, 401, {}, { 'www-authenticate': `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"` });
    if (m.id === undefined) return void res.writeHead(202).end();
    if (m.method === 'tools/call') fake.calls.push(auth);
    return json(res, 200, { jsonrpc: '2.0', id: m.id, result: mcpReply(m, auth) }, { 'mcp-session-id': 's1' });
  }
  // A server that wants a key and offers no sign-in; one that takes anyone.
  if (u.pathname === '/keyed' && req.headers['x-key'] !== 'right') return json(res, 401, {});
  if (u.pathname === '/keyed' || u.pathname === '/open') return m.id === undefined ? void res.writeHead(202).end() : json(res, 200, { jsonrpc: '2.0', id: m.id, result: mcpReply(m, auth) });
  // The older transport: a stream that says where to post, the answers coming on it.
  if (u.pathname === '/sse' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    sse.set('1', res);
    return void res.write('event: endpoint\ndata: /sse/post\n\n');
  }
  if (u.pathname === '/sse/post') {
    res.writeHead(202).end();
    if (m.id !== undefined) sse.get('1')!.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: m.id, result: mcpReply(m, String(req.headers['x-key'] ?? '')) })}\n\n`);
    return;
  }
  json(res, 404, {});
});

// A local command server: it answers on stdio and lists its environment's TOKEN as a tool.
const script = path.join(home, 'stdio-server.cjs');
fs.writeFileSync(
  script,
  `require('readline').createInterface({ input: process.stdin }).on('line', (l) => {
  const m = JSON.parse(l);
  if (m.id === undefined) return;
  const result = m.method === 'initialize' ? { protocolVersion: '2025-06-18', capabilities: {} } : { tools: [{ name: 'tok_' + (process.env.TOKEN || 'none') }] };
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result }) + '\\n');
});`,
);

await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

// ---- the app -------------------------------------------------------------------------------------------

const db = openDb(path.join(config.dataDir, 'mcpservers-test.db'));
const RUN = 'run0mcpservers';
const KEY = 'acp:mcpservers-session';
const sessions = { liveByRun: (id: string) => (id === RUN ? { key: KEY, agent: 'acp', cwd: home } : null) } as unknown as SessionManager;
const app = Fastify();
const events: unknown[] = [];
let origin = '';
const deps: Deps = { app, db, sessions, scheduler: {} as Deps['scheduler'], models: {} as Deps['models'], broadcast: (e) => void events.push(e), toSubscribers: () => {}, publicBase: () => origin };
registerFeatures([connections, mcpServersFeature], deps);
await app.listen({ port: 0, host: '127.0.0.1' });
origin = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
db.prepare('delete from conn_mcp').run();
const relay = () => `${origin}/agent/run/${runToken(RUN)}/mcp`;
/** The server of this name as a session of Custom loads it. */
const def = (name: string) => mcpServers(home, [], { store: customStore(), relay: relay() }).find((d) => d.name === name)!;
const signal = () => new AbortController().signal;

const post = async (url: string, payload: unknown) => {
  const r = await app.inject({ method: 'POST', url, payload: payload as object, headers: { origin } });
  return { status: r.statusCode, body: r.json() };
};

/** Presses Sign in and plays the browser: to the sign-in server, which sends it back to the app. */
async function signIn(name: string) {
  const r = await post('/api/setup/mcp/signin', { name, cwd: home });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const au = new URL(r.body.url);
  assert.equal(au.pathname, '/as/authorize');
  assert.equal(au.searchParams.get('redirect_uri'), `${origin}/connections/callback`);
  assert.equal(au.searchParams.get('resource'), `${base}/mcp`);
  const back = await fetch(au, { redirect: 'manual' });
  const callback = new URL(back.headers.get('location')!);
  const done = await app.inject({ method: 'GET', url: callback.pathname + callback.search });
  assert.equal(done.statusCode, 302);
  assert.equal(done.headers.location, `/settings?s=mcp&flow=${r.body.flow}`);
  const flow = (await app.inject({ method: 'GET', url: `/api/connections/flows/${r.body.flow}` })).json();
  assert.equal(flow.result.ok, true, JSON.stringify(flow));
}

after(async () => {
  for (const r of sse.values()) r.end();
  server.closeAllConnections();
  server.close();
  await app.close();
  db.close();
  fs.rmSync(home, { recursive: true, force: true });
});

test('a Custom server is added, listed, changed and removed in Hydor’s own file, with no program run', async () => {
  const added = await addMcp({ agents: ['custom'], name: 'local', transport: 'stdio', command: process.execPath, args: [script], env: { TOKEN: 'sekret' } });
  assert.deepEqual(added, [{ agent: 'custom', ok: true, output: 'Added local' }]);
  await addMcp({ agents: ['custom'], name: 'api', transport: 'http', url: `${base}/keyed`, headers: { 'X-Key': 'right' } });
  assert.equal(fs.statSync(customStore()).mode & 0o777, 0o600);
  const list = listCustom(db, home);
  assert.deepEqual(
    list.map((s) => [s.agent, s.name, s.transport, s.envKeys, s.headerKeys]),
    [
      ['custom', 'local', 'stdio', ['TOKEN'], undefined],
      ['custom', 'api', 'http', undefined, ['X-Key']],
    ],
  );
  assert.ok(!JSON.stringify(list).includes('sekret') && !JSON.stringify(list).includes('right'), 'values never leave the server');
  assert.equal((await addMcp({ agents: ['custom'], name: 'local', transport: 'stdio', command: 'x' }))[0].ok, false, 'a name is taken once');
  assert.equal((await addMcp({ agents: ['custom'], name: 'hydor', transport: 'stdio', command: 'x' }))[0].ok, false);

  // Checked the way a session starts them.
  const st = Object.fromEntries((await customStatus(db, home)).map((s) => [s.name, s]));
  assert.deepEqual([st.local.state, st.local.tools, st.api.state, st.api.tools], ['connected', 1, 'connected', 1]);
  const c = new McpClient(def('local'));
  await c.connect();
  assert.equal(c.tools[0].name, 'tok_sekret', 'its environment reaches it');
  c.close();

  // Changed: an empty value keeps the saved one, only while it goes where it went.
  updateCustom(db, 'api', { agents: ['custom'], name: 'api', transport: 'http', url: `${base}/keyed?v=2`, headers: { 'X-Key': '', 'X-More': 'm' } });
  assert.deepEqual(readStore(customStore()).servers.api.headers, { 'X-Key': 'right', 'X-More': 'm' });
  assert.throws(() => updateCustom(db, 'api', { agents: ['custom'], name: 'api', transport: 'http', url: 'https://elsewhere.example.com/mcp', headers: { 'X-Key': '' } }), /Enter the value of X-Key again: the address changed/);
  assert.throws(() => updateCustom(db, 'local', { agents: ['custom'], name: 'local', transport: 'stdio', command: 'other', env: { TOKEN: '' } }), /the command changed/);
  assert.throws(() => updateCustom(db, 'none', { agents: ['custom'], name: 'none', transport: 'stdio', command: 'x' }), /no server named none/);
  // A header with no right value: refused, and no sign-in is offered where there is no OAuth.
  updateCustom(db, 'api', { agents: ['custom'], name: 'api', transport: 'http', url: `${base}/keyed`, headers: { 'X-Key': 'wrong' } });
  const refused = (await customStatus(db, home)).find((s) => s.name === 'api')!;
  assert.equal(refused.state, 'failed');
  assert.match(refused.error!, /401/);

  assert.deepEqual(removeCustom(db, 'api'), { ok: true, output: 'Removed api' });
  assert.equal(removeCustom(db, 'api').ok, false);
  removeCustom(db, 'local');
  assert.deepEqual(listCustom(db, home), []);
  assert.ok(!fs.existsSync(ran), 'neither claude nor codex ran');
});

test('Custom’s servers join the programs’ ones, and a name kept by Hydor wins', async () => {
  fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ mcpServers: { same: { type: 'http', url: `${base}/claude` }, theirs: { type: 'sse', url: `${base}/sse` } } }));
  fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
  fs.writeFileSync(path.join(home, '.codex', 'config.toml'), '[mcp_servers.codexy]\ncommand = "nothing"\n');
  await addMcp({ agents: ['custom'], name: 'same', transport: 'http', url: `${base}/open` });
  await addMcp({ agents: ['custom'], name: 'codexy', transport: 'sse', url: `${base}/sse`, headers: { 'X-Key': 'k1' } });
  const all = mcpServers(home, [], { store: customStore() });
  assert.deepEqual(
    all.map((d) => [d.name, d.from, d.type, d.url]),
    [
      ['same', 'custom', 'http', `${base}/open`],
      ['theirs', 'claude', 'sse', `${base}/sse`],
      ['codexy', 'custom', 'sse', `${base}/sse`],
    ],
  );
  // What the app passes still wins over both.
  assert.equal(mcpServers(home, [{ name: 'same', type: 'http', url: `${base}/app` }], { store: customStore() }).find((d) => d.name === 'same')!.from, 'app');
  // SSE servers connect, with their headers.
  const c = new McpClient(def('codexy'));
  await c.connect();
  assert.equal((await c.call('whoami', {}, signal())).text, 'asked with k1');
  c.close();
  removeCustom(db, 'same');
  removeCustom(db, 'codexy');
  fs.rmSync(path.join(home, '.claude.json'));
  fs.rmSync(path.join(home, '.codex'), { recursive: true });
});

test('a server that wants a sign-in: signed in with dynamic registration, called with the token, renewed', async () => {
  await addMcp({ agents: ['custom'], name: 'shop', transport: 'http', url: `${base}/mcp`, headers: { 'X-Tenant': 't1' } });
  let st = (await customStatus(db, home)).find((s) => s.name === 'shop')!;
  assert.equal(st.state, 'auth');
  assert.ok(!st.again);
  // A session started before the sign-in: its request goes to the app on the 401, which says it needs one.
  const early = new McpClient(def('shop'));
  await assert.rejects(early.connect(), /shop: .*sign in/);

  await signIn('shop');
  assert.equal(fake.registered, 1);
  assert.deepEqual(listCustom(db, home).map((s) => [s.name, s.signedIn, s.again]), [['shop', true, undefined]]);
  assert.deepEqual(readStore(customStore()).signedIn, [`${base}/mcp`]);
  const token = [...fake.access][0];
  assert.ok(!fs.readFileSync(customStore(), 'utf8').includes(token), 'no token in the file the agent reads');
  const bytes = ['', '-wal'].map((s) => `${path.join(config.dataDir, 'mcpservers-test.db')}${s}`).filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f));
  assert.ok(!Buffer.concat(bytes).includes(token), 'sealed in the vault');
  assert.equal(redact(`x ${token}`), 'x [shop sign-in]');
  st = (await customStatus(db, home)).find((s) => s.name === 'shop')!;
  assert.deepEqual([st.state, st.tools, st.signedIn], ['connected', 1, true]);

  // A session of Custom: through the app, which adds the token (the agent never has it) and keeps its headers.
  assert.equal(def('shop').signedIn, true);
  const c = new McpClient(def('shop'));
  await c.connect();
  assert.deepEqual(c.tools.map((t) => t.fullName), ['mcp__shop__whoami']);
  const said = await c.call('whoami', {}, signal());
  assert.equal(fake.calls.at(-1), `Bearer ${token}`);
  assert.equal(said.text, 'asked with Bearer [shop sign-in]', 'a token in an answer is masked');
  assert.equal(fake.headers.at(-1)!['x-tenant'], 't1');

  // The server no longer takes the token: renewed and asked again, nothing to do for the person.
  fake.access.clear();
  await c.call('whoami', {}, signal());
  assert.equal(fake.refreshed, 1);
  assert.notEqual(fake.calls.at(-1), `Bearer ${token}`);
  assert.ok(!listCustom(db, home)[0].again);

  // About to end: renewed before the request.
  fake.expiresIn = 30;
  fake.access.clear();
  await c.call('whoami', {}, signal());
  const before = fake.refreshed;
  fake.expiresIn = 3600;
  await c.call('whoami', {}, signal());
  assert.equal(fake.refreshed, before + 1, 'renewed ahead of its end');

  // Renewing refused: now it asks to sign in again, and says so.
  fake.access.clear();
  fake.refuseRefresh = true;
  await assert.rejects(c.call('whoami', {}, signal()), /Sign in again/);
  assert.deepEqual(listCustom(db, home).map((s) => [s.signedIn, s.again]), [[true, true]]);
  st = (await customStatus(db, home)).find((s) => s.name === 'shop')!;
  assert.deepEqual([st.state, st.again], ['auth', true]);
  fake.refuseRefresh = false;
  await signIn('shop');
  assert.equal(fake.registered, 1, 'the registered client is used again');
  await c.call('whoami', {}, signal());
  c.close();

  signOut(db, home, 'shop');
  assert.deepEqual(readStore(customStore()).signedIn, []);
  await assert.rejects(new McpClient(def('shop')).connect(), /sign in/);
  // Removing a server forgets its sign-in.
  await signIn('shop');
  removeCustom(db, 'shop');
  assert.equal((db.prepare('select count(*) as n from conn_mcp').get() as { n: number }).n, 0);
  assert.ok(!fs.existsSync(ran), 'neither claude nor codex ran');
});

test('a server Custom reads from a program’s settings signs in the same way', async () => {
  fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ mcpServers: { work: { type: 'http', url: `${base}/mcp` } } }));
  assert.deepEqual(listCustom(db, home), [], 'listed in Claude Code’s group until it is signed in');
  const st = await customStatus(db, home);
  assert.deepEqual(st.map((s) => [s.name, s.from, s.state]), [['work', 'claude', 'auth']]);
  await signIn('work');
  assert.deepEqual(listCustom(db, home).map((s) => [s.name, s.from, s.signedIn]), [['work', 'claude', true]]);
  const c = new McpClient(def('work'));
  await c.connect();
  await c.call('whoami', {}, signal());
  c.close();
  // Removed from Claude Code: its sign-in goes with it.
  await removingTheirs(db, 'work', home, async () => fs.rmSync(path.join(home, '.claude.json')));
  assert.equal((db.prepare('select count(*) as n from conn_mcp').get() as { n: number }).n, 0);
  assert.deepEqual(readStore(customStore()).signedIn, []);
});

test('the relay answers only a running session, and gives a token only to the address signed in to', async () => {
  const msg = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
  const bad = await app.inject({ method: 'POST', url: `/agent/run/${runToken('another')}/mcp`, payload: msg, headers: { 'x-hydor-mcp-url': `${base}/mcp` } });
  assert.equal(bad.statusCode, 403);
  const other = await app.inject({ method: 'POST', url: `/agent/run/${runToken(RUN)}/mcp`, payload: msg, headers: { 'x-hydor-mcp-url': `${base}/open` } });
  assert.equal(other.statusCode, 401);
});
