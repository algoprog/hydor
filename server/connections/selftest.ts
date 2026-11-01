// Script tests for Connections, against fake servers on this machine (an OAuth sign-in server with an MCP
// server behind it, an echo server, a local MCP command) and a throwaway data folder:
//
//   OUTDIR=dist/selftest node scripts/build-server.mjs server/connections/selftest.ts
//   DATA_DIR=/tmp/naget-conn-selftest PORT=18877 node dist/selftest/selftest.js
//
// The vault (sealing, rotating a key's value and the vault key), signing in (discovery, registration,
// PKCE, the one-use state, renewal), what each kind of agent gets, the relay, http_request's host
// checks and masking, the request_secret card's round trip, and the bridge.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import Fastify from 'fastify';
import type { CatalogApp } from '../../shared/connections.ts';
import { APP_ROOT, config } from '../config.ts';
import { openDb } from '../db.ts';
import { registerFeatures, runTools } from '../features/registry.ts';
import type { Deps, Feature, RunCtx } from '../features/types.ts';
import { runToken } from '../mcp.ts';
import type { SessionManager } from '../sessions.ts';
import { setSessionExtra } from '../sessionExtra.ts';
import { authHeaders, connection, patchConnection, readCred, renewSoon, saveConnection, toolOn } from './apps.ts';
import { catalog, problem } from './catalog.ts';
import { finishOAuth, startOAuth, testConnection } from './connect.ts';
import { connections } from './index.ts';
import { testHooks } from './tools.ts';
import { listSecrets, readSecret, redact, rotateVaultKey, saveSecret, seal, unseal } from './vault.ts';

if (!/naget-conn-selftest/.test(config.dataDir)) {
  console.error('Run with DATA_DIR=/tmp/naget-conn-selftest (it is wiped first).');
  process.exit(2);
}
fs.rmSync(config.dataDir, { recursive: true, force: true });
fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });

let failed = 0;
let passed = 0;
function check(name: string, ok: unknown, detail?: unknown) {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${!ok && detail !== undefined ? `\n         ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
}
const section = (s: string) => console.log(`\n${s}`);
const listen = (s: http.Server) => new Promise<number>((r) => s.listen(0, '127.0.0.1', () => r((s.address() as { port: number }).port)));
const body = (req: http.IncomingMessage) => new Promise<string>((r) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => r(b));
});
const json = (res: http.ServerResponse, status: number, v: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(v));
};

// ---- a fake sign-in server, with an MCP server behind it ------------------------------------------------

const as = { calls: [] as string[], keysSeen: [] as string[], forget: false, inits: 0, initCaps: undefined as any, formStream: null as null | { res: http.ServerResponse; id: unknown }, clients: new Map<string, string[]>(), codes: new Map<string, { client: string; challenge: string; redirect: string; resource: string }>(), access: new Set<string>(), refresh: new Set<string>(), registered: 0, refreshed: 0, refuseRefresh: false, resources: [] as string[], expiresIn: 3600 };
let asBase = '';
const sse = { streams: new Map<string, { res: http.ServerResponse; initialized: boolean }>(), opened: 0 };
const issue = () => {
  const a = `at_${crypto.randomBytes(12).toString('hex')}`;
  const r = `rt_${crypto.randomBytes(12).toString('hex')}`;
  as.access.add(a);
  as.refresh.add(r);
  return { access_token: a, refresh_token: r, token_type: 'Bearer', expires_in: as.expiresIn };
};
const fakeAs = http.createServer(async (req, res) => {
  const u = new URL(req.url!, asBase);
  if (u.pathname === '/.well-known/oauth-protected-resource/mcp') return json(res, 200, { resource: `${asBase}/mcp`, authorization_servers: [`${asBase}/as`], scopes_supported: ['read', 'write'] });
  // A server that names another service's resource, and one whose sign-in server speaks for another.
  if (u.pathname === '/.well-known/oauth-protected-resource/evil') return json(res, 200, { resource: 'https://victim.example/mcp', authorization_servers: [`${asBase}/as`] });
  if (u.pathname === '/.well-known/oauth-protected-resource/mixup') return json(res, 200, { resource: `${asBase}/mixup`, authorization_servers: [`${asBase}/as2`] });
  if (u.pathname === '/.well-known/oauth-authorization-server/as2') return json(res, 200, { issuer: 'https://other-issuer.example', authorization_endpoint: `${asBase}/as/authorize`, token_endpoint: `${asBase}/as/token`, registration_endpoint: `${asBase}/as/register` });
  if (u.pathname === '/evil' || u.pathname === '/mixup') return json(res, 401, { error: 'unauthorized' });
  // A server that sends the request elsewhere (another origin).
  if (u.pathname === '/hop') {
    res.writeHead(307, { location: `http://localhost:${(fakeAs.address() as { port: number }).port}/keyed` });
    return res.end();
  }
  if (u.pathname === '/keyed') {
    as.keysSeen.push(String(req.headers['x-api-key'] ?? ''));
    return json(res, 200, { jsonrpc: '2.0', id: 1, result: {} });
  }
  if (u.pathname === '/.well-known/oauth-authorization-server/as')
    return json(res, 200, { issuer: `${asBase}/as`, authorization_endpoint: `${asBase}/as/authorize`, token_endpoint: `${asBase}/as/token`, registration_endpoint: `${asBase}/as/register`, code_challenge_methods_supported: ['S256'] });
  if (u.pathname === '/as/register' && req.method === 'POST') {
    const b = JSON.parse(await body(req));
    as.registered++;
    const id = `client_${as.registered}`;
    as.clients.set(id, b.redirect_uris);
    return json(res, 201, { client_id: id, token_endpoint_auth_method: 'none' });
  }
  if (u.pathname === '/as/authorize') {
    const q = u.searchParams;
    const redirects = as.clients.get(q.get('client_id') ?? '');
    if (!redirects?.includes(q.get('redirect_uri') ?? '') || q.get('code_challenge_method') !== 'S256' || !q.get('code_challenge') || !q.get('resource')) return json(res, 400, { error: 'invalid_request' });
    const code = crypto.randomBytes(10).toString('hex');
    as.codes.set(code, { client: q.get('client_id')!, challenge: q.get('code_challenge')!, redirect: q.get('redirect_uri')!, resource: q.get('resource')! });
    res.writeHead(302, { location: `${q.get('redirect_uri')}?code=${code}&state=${encodeURIComponent(q.get('state')!)}&iss=${encodeURIComponent(`${asBase}/as`)}` });
    return res.end();
  }
  if (u.pathname === '/as/token' && req.method === 'POST') {
    const p = new URLSearchParams(await body(req));
    as.resources.push(p.get('resource') ?? '');
    if (p.get('grant_type') === 'authorization_code') {
      const c = as.codes.get(p.get('code') ?? '');
      as.codes.delete(p.get('code') ?? '');
      const ok = c && c.client === p.get('client_id') && c.redirect === p.get('redirect_uri') && crypto.createHash('sha256').update(p.get('code_verifier') ?? '').digest('base64url') === c.challenge;
      return ok ? json(res, 200, issue()) : json(res, 400, { error: 'invalid_grant', error_description: 'bad code or verifier' });
    }
    if (p.get('grant_type') === 'refresh_token') {
      as.refreshed++;
      const r = p.get('refresh_token') ?? '';
      if (as.refuseRefresh || !as.refresh.has(r)) return json(res, 400, { error: 'invalid_grant' });
      // Refresh tokens are used once (rotated).
      as.refresh.delete(r);
      return json(res, 200, issue());
    }
    return json(res, 400, { error: 'unsupported_grant_type' });
  }
  // The older transport: a stream that names where to post; answers come on the stream.
  if (u.pathname === '/sse' || u.pathname === '/messages') {
    const token = /^Bearer (.+)$/.exec(String(req.headers.authorization ?? ''))?.[1];
    if (!token || !as.access.has(token)) return json(res, 401, { error: 'unauthorized' }, { 'www-authenticate': `Bearer resource_metadata="${asBase}/.well-known/oauth-protected-resource/mcp"` });
    if (u.pathname === '/sse') {
      const sid = crypto.randomBytes(6).toString('hex');
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      res.write(`event: endpoint\ndata: /messages?sid=${sid}\n\n`);
      sse.streams.set(sid, { res, initialized: false });
      sse.opened++;
      req.on('close', () => sse.streams.delete(sid));
      return;
    }
    const st = sse.streams.get(u.searchParams.get('sid') ?? '');
    if (!st) return json(res, 404, { error: 'no such stream' });
    const m = JSON.parse(await body(req));
    res.writeHead(202);
    res.end();
    if (m.method === 'initialize') st.initialized = true;
    if (m.id === undefined) return;
    const result = !st.initialized
      ? null
      : m.method === 'initialize'
        ? { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'fake-sse', version: '1' } }
        : m.method === 'tools/list'
          ? { tools: [{ name: 'find', inputSchema: { type: 'object' } }, { name: 'whoami', inputSchema: { type: 'object' } }] }
          : { content: [{ type: 'text', text: m.params?.name === 'whoami' ? `sse token ${token}` : `ran ${m.params?.name}` }] };
    st.res.write(`event: message\ndata: ${JSON.stringify(result ? { jsonrpc: '2.0', id: m.id, result } : { jsonrpc: '2.0', id: m.id, error: { code: -32002, message: 'not initialized' } })}\n\n`);
    return;
  }
  if (u.pathname === '/mcp') {
    const token = /^Bearer (.+)$/.exec(String(req.headers.authorization ?? ''))?.[1];
    if (!token || !as.access.has(token)) return json(res, 401, { error: 'unauthorized' }, { 'www-authenticate': `Bearer resource_metadata="${asBase}/.well-known/oauth-protected-resource/mcp"` });
    if (req.method !== 'POST') return json(res, 405, {});
    const m = JSON.parse(await body(req));
    if (m.method === 'tools/call') as.calls.push(m.params?.name);
    if (m.method === 'initialize') {
      as.inits++;
      as.initCaps = m.params?.capabilities;
    }
    // The client's answer to a form this server asked for, mid-call: the call finishes with it.
    if (m.id === 'form-1' && !m.method && as.formStream) {
      const st = as.formStream;
      as.formStream = null;
      st.res.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: st.id, result: { content: [{ type: 'text', text: `form ${JSON.stringify(m.result)}` }] } })}\n\n`);
      return (res.writeHead(202), res.end());
    }
    if (m.method === 'tools/call' && m.params?.name === 'book_table') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'mcp-session-id': 'sess-1' });
      as.formStream = { res, id: m.id };
      const requestedSchema = { type: 'object', properties: { guests: { type: 'integer', title: 'Guests', minimum: 1, maximum: 8 }, time: { type: 'string', enum: ['19:00', '20:00'], enumNames: ['7 pm', '8 pm'] }, outside: { type: 'boolean' } }, required: ['guests', 'time'] };
      res.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: 'form-1', method: 'elicitation/create', params: { message: 'How many, and when?', requestedSchema } })}\n\n`);
      return;
    }
    // The server forgot its sessions (it restarted).
    if (as.forget && req.headers['mcp-session-id'] === 'sess-1') {
      as.forget = false;
      return json(res, 404, { error: 'unknown session' });
    }
    if (m.id === undefined) return (res.writeHead(202), res.end());
    const tools = [
      { name: 'search', description: 'Searches.', inputSchema: { type: 'object' } },
      { name: 'delete_everything', description: 'Deletes all.', inputSchema: { type: 'object' } },
      { name: 'whoami', description: 'Says which token it got.', inputSchema: { type: 'object' } },
    ];
    const result =
      m.method === 'initialize'
        ? { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'fake', version: '1' } }
        : m.method === 'tools/list'
          ? { tools }
          : m.method === 'tools/call'
            ? { content: [{ type: 'text', text: m.params.name === 'whoami' ? `your token is ${token}` : `ran ${m.params.name}` }] }
            : {};
    // Answers as an event stream, as many servers do.
    res.writeHead(200, { 'content-type': 'text/event-stream', 'mcp-session-id': 'sess-1' });
    return res.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: m.id, result })}\n\n`);
  }
  json(res, 404, {});
});

// ---- an echo server for http_request --------------------------------------------------------------------

const seen: { host?: string; auth?: string; url: string }[] = [];
const echo = http.createServer((req, res) => {
  seen.push({ host: req.headers.host, auth: req.headers.authorization, url: req.url! });
  if (req.url!.startsWith('/redirect')) {
    res.writeHead(302, { location: `http://elsewhere.evil.test:${(echo.address() as { port: number }).port}/echo` });
    return res.end();
  }
  json(res, 200, { host: req.headers.host, authorization: req.headers.authorization ?? null, url: req.url });
});

// ---- the test -------------------------------------------------------------------------------------------

const db = openDb(path.join(config.dataDir, 'test.db'));
const delivered: { key: string; text: string }[] = [];
const events: unknown[] = [];
const KEY = 'claude:selftest-session';
const RUN = 'run0selftest';
/** The cards a connected app's forms showed, and how "the user" answers the next one. */
const cards: any[] = [];
let userAnswers: { decision: string; form?: Record<string, string> }[] = [];
const fakeAdapter = {
  async ask(card: any, o: { check?: (a: any) => string | null } = {}) {
    cards.push(card);
    // The user's first try may be wrong: the card says what to fix and stays, as the real one does.
    for (const a of userAnswers) if (!o.check?.(a)) return a;
    return null;
  },
};
const sessions = {
  liveByRun: (id: string) => (id === RUN ? { key: KEY, agent: 'claude', cwd: config.dataDir } : null),
  adapterByRun: (id: string) => (id === RUN ? fakeAdapter : null),
  deliverOrQueue: async (key: string, text: string) => void delivered.push({ key, text }),
  queueSummary: () => {},
} as unknown as SessionManager;
const app = Fastify();
const deps: Deps = { app, db, sessions, scheduler: {} as Deps['scheduler'], models: {} as Deps['models'], broadcast: (e) => void events.push(e), toSubscribers: (_k, e) => void events.push(e), publicBase: () => `http://127.0.0.1:${config.port}` };
// A capability whose tool returns whatever it is given: to see the masking every tool's output passes.
const parrot: Feature = { id: 'parrot', tools: () => [{ name: 'parrot', description: '', inputSchema: {}, run: async (a) => String(a.say) }] };
registerFeatures([connections, parrot], deps);
await app.listen({ port: config.port, host: '127.0.0.1' });
const asPort = await listen(fakeAs);
asBase = `http://127.0.0.1:${asPort}`;
const echoPort = await listen(echo);
const ctx: RunCtx = { runId: RUN, key: KEY, agent: 'claude', cwd: config.dataDir, deps };
const tool = (name: string) => runTools(ctx).find((t) => t.name === name)!;
const text = (r: string | { text: string }) => (typeof r === 'string' ? r : r.text);
const dbBytes = () => Buffer.concat(['', '-wal'].map((s) => (fs.existsSync(path.join(config.dataDir, `test.db${s}`)) ? fs.readFileSync(path.join(config.dataDir, `test.db${s}`)) : Buffer.alloc(0))));

try {
  section('Catalog');
  const all = catalog();
  const files = fs.readdirSync(path.join(APP_ROOT, 'catalog/connections')).filter((f) => f.endsWith('.json'));
  check(`the server reads all ${files.length} catalog files`, all.length === files.length, all.length);
  check('a broken entry is refused', problem({ id: 'x', name: 'X', description: 'Does things well.', homepage: 'https://x', category: 'dev', icon: 'x', server: { transport: 'stdio', command: 'npx', args: ['{{KEY}}'] }, auth: { type: 'api_key' }, fields: [{ name: 'KEY', label: 'Key', secret: true }], verified: null }) !== null);

  section('Vault');
  const sealed = seal('hello secret', 'secret:A');
  check('sealed values open with their own label', unseal(sealed, 'secret:A') === 'hello secret');
  let threw = false;
  try {
    unseal(sealed, 'secret:B');
  } catch {
    threw = true;
  }
  check('a sealed value moved to another row does not open', threw);
  threw = false;
  try {
    const p = sealed.split('.');
    p[4] = Buffer.from('tampered!!').toString('base64url');
    unseal(p.join('.'), 'secret:A');
  } catch {
    threw = true;
  }
  check('a changed value does not open', threw);
  const keyFile = path.join(config.dataDir, 'vault.key');
  check('the key file is there with mode 0600', (fs.statSync(keyFile).mode & 0o777) === 0o600, (fs.statSync(keyFile).mode & 0o777).toString(8));
  const V1 = 'sk-live-first-value-0123456789abcdef';
  const V2 = 'sk-live-second-value-fedcba9876543210';
  const s1 = saveSecret(db, { name: 'WEATHER_KEY', value: V1, domains: 'https://api.weather.test/v1, weather.test', note: 'For the forecast' });
  check('a key is listed with a hint, never its value', s1.hint === 'sk-…cdef' && !JSON.stringify(listSecrets(db)).includes(V1), s1);
  check('allowed hosts are cleaned', JSON.stringify(s1.domains) === '["api.weather.test","weather.test"]', s1.domains);
  check('the value is not in the database file as text', !dbBytes().includes(V1));
  saveSecret(db, { name: 'WEATHER_KEY', value: V2 });
  const r2 = readSecret(db, 'WEATHER_KEY');
  check('rotating replaces the value, keeping hosts and note', r2?.value === V2 && r2.view.note === 'For the forecast' && r2.view.domains.length === 2 && r2.view.hint === 'sk-…3210');
  check('masking hides the current value', redact(`x ${V2} y ${encodeURIComponent(V2)}`) === 'x [secret WEATHER_KEY] y [secret WEATHER_KEY]', redact(`x ${V2}`));
  const TILDE = 'abc~def ghi!(xyz)123';
  saveSecret(db, { name: 'TILDE_KEY', value: TILDE });
  check('masking covers a value as an address writes it (both encodings)', redact(`${encodeURIComponent(TILDE)} ${new URLSearchParams({ v: TILDE }).toString().slice(2)}`) === '[secret TILDE_KEY] [secret TILDE_KEY]');
  const before = (db.prepare('select value from conn_secrets where name = ?').get('WEATHER_KEY') as { value: string }).value;
  const rot = rotateVaultKey(db);
  const after = (db.prepare('select value from conn_secrets where name = ?').get('WEATHER_KEY') as { value: string }).value;
  check('a new vault key seals everything again', rot.sealed >= 1 && before.split('.')[1] !== after.split('.')[1] && readSecret(db, 'WEATHER_KEY')?.value === V2, rot);
  check('the old vault key is gone', !fs.existsSync(`${keyFile}.old`) && !fs.existsSync(`${keyFile}.next`) && (fs.statSync(keyFile).mode & 0o777) === 0o600);

  section('Signing in (OAuth)');
  const entry: CatalogApp = { id: 'fakeapp', name: 'Fake App', description: 'A fake app for tests.', category: 'dev', icon: 'fakeapp', homepage: 'https://example.com', server: { transport: 'http', url: `${asBase}/mcp` }, auth: { type: 'oauth' }, verified: null };
  const origin = 'https://agent.example.org';
  const started = await startOAuth(db, entry, { origin });
  const au = new URL(started.url!);
  check('discovery found the sign-in server from the 401', au.origin + au.pathname === `${asBase}/as/authorize`, started.url);
  check('the client registered itself (DCR)', as.registered === 1 && au.searchParams.get('client_id') === 'client_1');
  check('PKCE S256, the state, the resource and the callback are in the address', au.searchParams.get('code_challenge_method') === 'S256' && (au.searchParams.get('code_challenge') ?? '').length === 43 && (au.searchParams.get('state') ?? '').length >= 40 && au.searchParams.get('resource') === `${asBase}/mcp` && au.searchParams.get('redirect_uri') === `${origin}/connections/callback`);
  check('the scopes come from the server’s metadata', au.searchParams.get('scope') === 'read write', au.searchParams.get('scope'));
  // The browser: the sign-in server sends it back to the callback.
  const back = await fetch(started.url!, { redirect: 'manual' });
  const loc = new URL(back.headers.get('location')!);
  const q = Object.fromEntries(loc.searchParams);
  check('a forged state is refused', !(await finishOAuth(db, { ...q, state: 'forged' })).ok);
  const done = await finishOAuth(db, q);
  check('the code is exchanged (verifier checked by the server)', done.ok && done.flow === started.flow, done);
  check('the state works once only', !(await finishOAuth(db, q)).ok);
  let refusedWhy = '';
  await startOAuth(db, { ...entry, id: 'evilapp', server: { transport: 'http', url: `${asBase}/evil` } }, { origin }).catch((e) => (refusedWhy = (e as Error).message));
  check('a server naming another service’s resource is refused', /another service/.test(refusedWhy), refusedWhy);
  refusedWhy = '';
  await startOAuth(db, { ...entry, id: 'mixapp', server: { transport: 'http', url: `${asBase}/mixup` } }, { origin }).catch((e) => (refusedWhy = (e as Error).message));
  check('sign-in details speaking for another issuer are refused', /name another server/.test(refusedWhy), refusedWhy);
  check('the token request named the resource', as.resources.at(-1) === `${asBase}/mcp`);
  const c0 = connection(db, 'fakeapp')!;
  const cred0 = readCred(db, 'fakeapp').oauth!;
  check('tokens are kept sealed, not as text', !!cred0.access_token && !dbBytes().includes(cred0.access_token) && !dbBytes().includes(cred0.refresh_token!));
  const tested = await testConnection(db, c0);
  check('Test lists the tools', tested.tools.map((t) => t.name).join() === 'search,delete_everything,whoami' && connection(db, 'fakeapp')!.status === 'ok', tested);
  const again = await startOAuth(db, entry, { origin });
  check('the registered client is used again, not registered twice', as.registered === 1 && new URL(again.url!).searchParams.get('client_id') === 'client_1');
  // That sign-in never comes back (the server forgot the client?): the next one registers anew.
  const retry = await startOAuth(db, entry, { origin });
  check('after a sign-in that never came back, the next one registers again', as.registered === 2 && new URL(retry.url!).searchParams.get('client_id') === 'client_2');
  // Renewal: tokens about to end are renewed once, even when asked for twice at the same time.
  as.expiresIn = 30;
  const s0 = readCred(db, 'fakeapp');
  saveConnection(db, entry, { cred: { oauth: { ...s0.oauth!, expires_at: Date.now() + 20_000 } } });
  const n0 = as.refreshed;
  const [h1, h2] = await Promise.all([authHeaders(db, connection(db, 'fakeapp')!), authHeaders(db, connection(db, 'fakeapp')!)]);
  check('a token ending within a minute is renewed, once for two callers', as.refreshed === n0 + 1 && h1.Authorization === h2.Authorization && h1.Authorization !== `Bearer ${cred0.access_token}`, { refreshed: as.refreshed - n0 });
  check('the new refresh token replaced the used one', readCred(db, 'fakeapp').oauth!.refresh_token !== cred0.refresh_token && as.refresh.has(readCred(db, 'fakeapp').oauth!.refresh_token!));
  const renewed = await renewSoon(db, 60_000);
  check('the background renewal picks up tokens about to end', renewed.includes('fakeapp'), renewed);
  as.expiresIn = 3600;
  await renewSoon(db, 60_000);

  section('What each agent gets (spawn)');
  saveSecret(db, { name: 'IGNORED', value: 'not-used-anywhere-123' });
  const local: CatalogApp = { id: 'localtool', name: 'Local tool', description: 'A local fake server.', category: 'local', icon: 'terminal', homepage: 'https://example.com', server: { transport: 'stdio', command: process.execPath, args: [path.join(config.dataDir, 'fake-stdio.mjs')], env: { FAKE_TOKEN: '{{FAKE_TOKEN}}' } }, auth: { type: 'api_key' }, fields: [{ name: 'FAKE_TOKEN', label: 'Token', secret: true }], verified: null };
  const LOCAL_SECRET = 'local-secret-value-998877';
  saveConnection(db, local, { cred: { secrets: { FAKE_TOKEN: LOCAL_SECRET } } });
  const plain: CatalogApp = { id: 'plaintool', name: 'Plain tool', description: 'A local server with nothing secret.', category: 'local', icon: 'clock', homepage: 'https://example.com', server: { transport: 'stdio', command: 'uvx', args: ['mcp-server-time'] }, auth: { type: 'none' }, verified: null };
  saveConnection(db, plain, {});
  const token = cred0.access_token;
  const spawnFor = async (agent: 'claude' | 'codex' | 'acp', acpAgent?: string, extra = {}) => (await connections.spawn!({ agent, acpAgent, key: KEY, cwd: '/tmp', runId: RUN, resume: false, extra }, deps))!;
  const relayUrl = `http://127.0.0.1:${config.port}/connections/mcp/${runToken(RUN)}/fakeapp`;
  for (const [agent, acp] of [['claude'], ['codex'], ['acp', 'console']] as const) {
    const sp = await spawnFor(agent, acp);
    const m = sp.mcpServers!;
    check(`${acp ? 'Custom' : agent}: the remote app at the relay, over HTTP, no token in it`, m.fakeapp?.type === 'http' && m.fakeapp.url === relayUrl && !JSON.stringify(sp).includes(token) && !JSON.stringify(sp).includes('Bearer'), m.fakeapp);
    check(`${acp ? 'Custom' : agent}: the local app with a key starts through the bridge, its key not in the settings`, m.localtool?.type === 'stdio' && m.localtool.args?.[1] === 'launch' && !JSON.stringify(sp).includes(LOCAL_SECRET), m.localtool);
    check(`${acp ? 'Custom' : agent}: a local app with nothing secret starts through the bridge too (its forms reach the session)`, m.plaintool?.type === 'stdio' && m.plaintool.args?.[1] === 'launch', m.plaintool);
  }
  const gem = await spawnFor('acp', 'gemini');
  check('another ACP agent reaches the remote app through the bridge (stdio relay)', gem.mcpServers!.fakeapp?.type === 'stdio' && (gem.mcpServers!.fakeapp as { args: string[] }).args.slice(1).join(' ') === `relay ${relayUrl}`, gem.mcpServers!.fakeapp);
  check('the instructions name the apps and the key tools', /fakeapp \(Fake App\)/.test(gem.instructions!.join()) && /request_secret/.test(gem.instructions!.join()) && /http_request/.test(gem.instructions!.join()));
  const off = await spawnFor('claude', undefined, { connections: { fakeapp: false } });
  check('an app turned off for the session is left out', !off.mcpServers!.fakeapp && !!off.mcpServers!.localtool);
  patchConnection(db, 'plaintool', { enabled: false });
  const on = await spawnFor('codex', undefined, { connections: { plaintool: true } });
  check('an app off for all can be turned on for one session', !!on.mcpServers!.plaintool && !(await spawnFor('codex')).mcpServers!.plaintool);

  section('The relay');
  const rpc = async (m: unknown, h: Record<string, string> = {}) => {
    const r = await fetch(relayUrl, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(m) });
    return { status: r.status, session: r.headers.get('mcp-session-id'), body: r.status === 202 ? null : await r.json() };
  };
  const init = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  check('initialize goes through, signed by the relay', init.body?.result?.serverInfo?.name === 'fake' && init.session === 'sess-1', init);
  check('a notification is accepted', (await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' })).status === 202);
  patchConnection(db, 'fakeapp', { tools: { delete_everything: false } });
  const listed = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, { 'mcp-session-id': 'sess-1' });
  check('only the tools that are on are listed', listed.body?.result?.tools?.map((t: { name: string }) => t.name).join() === 'search,whoami', listed.body);
  const refused = await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'delete_everything', arguments: {} } });
  check('a call to a tool that is off is refused here', refused.body?.result?.isError === true && /turned off/.test(refused.body.result.content[0].text), refused.body);
  const calls0 = as.calls.length;
  const quiet = await rpc({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'delete_everything', arguments: {} } });
  check('a call without an id to a tool that is off is dropped too', quiet.status === 202 && as.calls.length === calls0, as.calls);
  const strict = { ...connection(db, 'fakeapp')!, entry: { ...entry, defaultTools: ['search'] }, prefs: {} };
  check('a tool named like an object property is not on by accident', !toolOn(strict, 'constructor') && !toolOn(strict, 'toString') && toolOn(strict, 'search'));
  const who = await rpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'whoami', arguments: {} } });
  check('the token is masked in what comes back', /\[fakeapp sign-in\]/.test(JSON.stringify(who.body)) && !JSON.stringify(who.body).includes(readCred(db, 'fakeapp').oauth!.access_token), who.body);
  // The app forgets the token (it ended early): the relay renews it and tries again.
  as.access.clear();
  const n1 = as.refreshed;
  const retried = await rpc({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'search', arguments: {} } });
  check('a refused token is renewed and the call tried again', retried.body?.result?.content?.[0]?.text === 'ran search' && as.refreshed === n1 + 1, retried.body);
  check('the app hears that its client takes forms', !!as.initCaps?.elicitation?.form, as.initCaps);
  cards.length = 0;
  // The first try is out of range: the card says so and waits for a right one.
  userAnswers = [
    { decision: 'accept', form: { guests: '12', time: '8 pm', outside: 'Yes' } },
    { decision: 'accept', form: { guests: '2', time: '8 pm', outside: 'Yes' } },
  ];
  const booked = await rpc({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'book_table', arguments: {} } }, { 'mcp-session-id': 'sess-1' });
  const card = cards[0];
  check('a form the app asks for mid-call shows as a card with its fields', card?.title === 'Fake App asks you to fill in a form' && card.detail === 'How many, and when?' && card.form.fields.map((f: { label: string; type: string }) => `${f.label}:${f.type}`).join() === 'Guests:number,Time:choice,Outside:yesno' && card.form.fields[1].options.join() === '7 pm,8 pm', card);
  check('the answer goes back in the schema’s own types, and the call finishes', booked.body?.result?.content?.[0]?.text === 'form {"action":"accept","content":{"guests":2,"time":"20:00","outside":true}}', booked.body);
  userAnswers = [{ decision: 'decline' }];
  const declined = await rpc({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'book_table', arguments: {} } }, { 'mcp-session-id': 'sess-1' });
  check('declining is told to the app', declined.body?.result?.content?.[0]?.text === 'form {"action":"decline"}', declined.body);
  setSessionExtra(db, KEY, { connections: { fakeapp: false } });
  const offNow = await rpc({ jsonrpc: '2.0', id: 6, method: 'tools/list' });
  check('turning the app off for the session stops it at once', /turned off for this session/.test(offNow.body?.error?.message ?? ''), offNow.body);
  setSessionExtra(db, KEY, { connections: null });
  const stranger = await fetch(`http://127.0.0.1:${config.port}/connections/mcp/${RUN}.forged/fakeapp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' });
  check('a forged run address is refused', stranger.status === 404);

  section('Catalog changes and redirects');
  const real = catalog().find((a) => a.id === 'deepwiki')!;
  saveConnection(db, { ...real, server: { transport: 'http', url: 'https://old-address.example/mcp' } }, {});
  const moved = connection(db, 'deepwiki')!;
  check('a catalog entry whose server changed keeps the old one until connected again', moved.catalogChanged === true && (moved.entry.server as { url: string }).url === 'https://old-address.example/mcp');
  saveConnection(db, real, {});
  check('connecting again moves to the catalog’s current entry', !connection(db, 'deepwiki')!.catalogChanged && (connection(db, 'deepwiki')!.entry.server as { url: string }).url === (real.server as { url: string }).url);
  const keyed: CatalogApp = { ...entry, id: 'keyedapp', server: { transport: 'http', url: `${asBase}/hop` }, auth: { type: 'api_key', header: 'X-Api-Key' } };
  saveConnection(db, keyed, { cred: { key: 'keyed-secret-value-123456' } });
  let hopWhy = '';
  await testConnection(db, connection(db, 'keyedapp')!).catch((e) => (hopWhy = (e as Error).message));
  check('a signed request is not followed to another origin', /redirected to localhost/.test(hopWhy) && !as.keysSeen.includes('keyed-secret-value-123456'), { hopWhy, seen: as.keysSeen });

  section('The older SSE transport');
  const sseEntry: CatalogApp = { ...entry, id: 'sseapp', name: 'SSE App', server: { transport: 'sse', url: `${asBase}/sse` } };
  saveConnection(db, sseEntry, { cred: { oauth: readCred(db, 'fakeapp').oauth! } });
  const sseTested = await testConnection(db, connection(db, 'sseapp')!);
  check('Test lists its tools over SSE', sseTested.tools.map((t) => t.name).join() === 'find,whoami', sseTested);
  const sseUrl = `http://127.0.0.1:${config.port}/connections/mcp/${runToken(RUN)}/sseapp`;
  const srpc = async (m: unknown, h: Record<string, string> = {}) => {
    const r = await fetch(sseUrl, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(m) });
    return { status: r.status, session: r.headers.get('mcp-session-id'), body: r.status === 202 ? null : await r.json() };
  };
  const si = await srpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
  check('the relay speaks SSE to the app and plain JSON to the agent', si.body?.result?.serverInfo?.name === 'fake-sse' && !!si.session, si);
  await srpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, { 'mcp-session-id': si.session! });
  const sw = await srpc({ jsonrpc: '2.0', id: 'w', method: 'tools/call', params: { name: 'whoami', arguments: {} } }, { 'mcp-session-id': si.session! });
  check('answers come back from the stream, the token masked', /sse token \[(sseapp|fakeapp) sign-in\]/.test(JSON.stringify(sw.body)) && sw.body?.id === 'w', sw.body);
  // The app ends the stream: the relay opens a new one and introduces the agent again.
  for (const st of sse.streams.values()) st.res.end();
  await new Promise((r) => setTimeout(r, 300));
  const opened = sse.opened;
  const sf = await srpc({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'find', arguments: {} } }, { 'mcp-session-id': si.session! });
  check('a dropped stream is reopened, with initialize sent again', sf.body?.result?.content?.[0]?.text === 'ran find' && sse.opened === opened + 1, sf.body);

  section('The bridge');
  fs.writeFileSync(
    path.join(config.dataDir, 'fake-stdio.mjs'),
    `let b='';let asked=null;let caps=null;const out=o=>process.stdout.write(JSON.stringify(o)+'\\n');process.stdin.on('data',d=>{b+=d;let i;while((i=b.indexOf('\\n'))>=0){const m=JSON.parse(b.slice(0,i));b=b.slice(i+1);if(m.id===undefined)continue;if(m.id==='q1'&&!m.method){out({jsonrpc:'2.0',id:asked,result:{content:[{type:'text',text:'form '+JSON.stringify(m.result)+' caps '+JSON.stringify(caps)}]}});continue}if(m.method==='tools/call'&&m.params.name==='ask'){asked=m.id;out({jsonrpc:'2.0',id:'q1',method:'elicitation/create',params:{message:'Your name?',requestedSchema:{type:'object',properties:{name:{type:'string',title:'Name'}},required:['name']}}});continue}if(m.method==='initialize')caps=m.params.capabilities;const r=m.method==='initialize'?{protocolVersion:'2025-06-18',capabilities:{},serverInfo:{name:'fake-stdio',version:'1'}}:m.method==='tools/list'?{tools:[{name:'a',inputSchema:{}},{name:'b',inputSchema:{}},{name:'leak',inputSchema:{}},{name:'ask',inputSchema:{}}]}:{content:[{type:'text',text:m.params.name==='leak'?'env token '+process.env.FAKE_TOKEN:'ran '+m.params.name}]};out({jsonrpc:'2.0',id:m.id,result:r})}});`,
  );
  patchConnection(db, 'localtool', { tools: { b: false } });
  const sp = await spawnFor('claude');
  const launch = sp.mcpServers!.localtool as { command: string; args: string[] };
  const sock = path.join(config.dataDir, 'conn.sock');
  check('a local app’s keys come over the owner-only socket', launch.args[2] === `unix:${sock}` && (fs.statSync(sock).mode & 0o777) === 0o600, launch.args);
  const tcp = await fetch(`http://127.0.0.1:${config.port}/connections/launch/${runToken(RUN)}/localtool`);
  check('the HTTP launch address is closed while the socket works', tcp.status === 404);
  const talk = (cmd: string, args: string[], msgs: unknown[]) =>
    new Promise<any[]>((resolve) => {
      const p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
      const out: any[] = [];
      let buf = '';
      p.stdout.on('data', (d) => {
        buf += d;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          out.push(JSON.parse(buf.slice(0, i)));
          buf = buf.slice(i + 1);
          if (out.length === msgs.flat().filter((m: any) => m.id !== undefined).length) (p.kill(), resolve(out));
        }
      });
      setTimeout(() => (p.kill(), resolve(out)), 15_000);
      for (const m of msgs) p.stdin.write(`${JSON.stringify(m)}\n`);
    });
  const lo = await talk(launch.command, launch.args, [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'b' } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'leak' } },
  ]);
  const byId = (l: any[], id: number) => l.find((m) => m.id === id);
  check('launch: the local app starts with its key from the app', byId(lo, 1)?.result?.serverInfo?.name === 'fake-stdio', lo);
  check('launch: only the tools that are on are listed', byId(lo, 2)?.result?.tools?.map((t: { name: string }) => t.name).join() === 'a,leak,ask', byId(lo, 2));
  check('launch: a tool that is off is refused', byId(lo, 3)?.result?.isError === true);
  check('launch: the key is masked in what comes back', byId(lo, 4)?.result?.content?.[0]?.text === 'env token [hidden]', byId(lo, 4));
  const batch = await talk(launch.command, launch.args, [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    [
      { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'b' } },
      { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'a' } },
    ],
  ]);
  check('launch: a batch is filtered item by item', byId(batch, 5)?.result?.isError === true && byId(batch, 6)?.result?.content?.[0]?.text === 'ran a', batch);
  cards.length = 0;
  userAnswers = [{ decision: 'accept', form: { name: 'Ada' } }];
  const formed = await talk(launch.command, launch.args, [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { capabilities: { roots: {} } } },
    { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'ask' } },
  ]);
  const said = String(byId(formed, 7)?.result?.content?.[0]?.text ?? '');
  check('launch: a form the app asks for is a card in the session, never a message to the agent', cards.length === 1 && cards[0].title === 'Local tool asks you to fill in a form' && cards[0].form?.fields?.[0]?.label === 'Name' && !formed.some((m) => m.method), { cards, formed });
  check('launch: the answer goes back to the app, which was told forms are taken', said.startsWith('form {"action":"accept","content":{"name":"Ada"}}') && /"elicitation":\{"form":\{\},"url":\{\}\}/.test(said) && /"roots"/.test(said), said);
  const re = await talk(process.execPath, [path.join(APP_ROOT, 'dist/server/connbridge.js'), 'relay', relayUrl], [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
  ]);
  check('relay: an agent on stdio reaches the remote app', byId(re, 1)?.result?.serverInfo?.name === 'fake' && byId(re, 2)?.result?.tools?.length === 2, re);
  // The app forgets the session: the bridge introduces the agent again and the call goes through.
  const inits0 = as.inits;
  const re2 = await new Promise<any[]>((resolve) => {
    const p = spawn(process.execPath, [path.join(APP_ROOT, 'dist/server/connbridge.js'), 'relay', relayUrl], { stdio: ['pipe', 'pipe', 'pipe'] });
    const got: any[] = [];
    let buf = '';
    p.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const m = JSON.parse(buf.slice(0, i));
        buf = buf.slice(i + 1);
        got.push(m);
        if (m.id === 1) {
          as.forget = true;
          p.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`);
        }
        if (m.id === 2) (p.kill(), resolve(got));
      }
    });
    setTimeout(() => (p.kill(), resolve(got)), 15_000);
    p.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })}\n`);
  });
  check('relay: after the app forgets the session, the agent is introduced again', byId(re2, 2)?.result?.tools?.length === 2 && as.inits === inits0 + 2, { re2, inits: as.inits - inits0 });

  section('http_request');
  testHooks.allowPrivate = true;
  testHooks.lookup = (host: string, o: any, cb: any) => (/example\.test$|evil\.test$/.test(host) ? cb(null, [{ address: '127.0.0.1', family: 4 }]) : cb(new Error('not found')));
  const KEYV = 'sk-echo-0123456789-abcdefghij';
  saveSecret(db, { name: 'ECHO_KEY', value: KEYV, domains: ['example.test'] });
  const H = tool('http_request');
  const at = (host: string, p = '/echo') => `http://${host}:${echoPort}${p}`;
  let out = text(await H.run({ url: at('api.example.test'), auth: 'ECHO_KEY' }, ctx));
  check('the key is sent to an allowed host (a subdomain)', seen.at(-1)?.auth === `Bearer ${KEYV}`, seen.at(-1));
  check('the answer comes back with the key masked', out.includes('HTTP 200') && out.includes('[secret ECHO_KEY]') && !out.includes(KEYV), out);
  const n = seen.length;
  out = text(await H.run({ url: at('other.example.org'), auth: 'ECHO_KEY' }, ctx));
  check('another host is refused before anything is sent', /may only be sent to example\.test/.test(out) && seen.length === n, out);
  out = text(await H.run({ url: at('evil-example.test'), auth: 'ECHO_KEY' }, ctx));
  check('a look-alike host is refused', /may only be sent/.test(out) && seen.length === n, out);
  out = text(await H.run({ url: at('example.test.evil.test'), auth: 'ECHO_KEY' }, ctx));
  check('a host that only starts like an allowed one is refused', /may only be sent/.test(out) && seen.length === n, out);
  out = text(await H.run({ url: at('api.example.test', '/redirect'), auth: 'ECHO_KEY' }, ctx));
  check('a redirect to another host is not followed with the key', /not followed: it leads to elsewhere\.evil\.test/.test(out) && !seen.some((s) => s.host?.startsWith('elsewhere.evil.test')), out);
  out = text(await H.run({ url: at('api.example.test', '/echo?x=1'), auth: 'ECHO_KEY', auth_query: 'api_key' }, ctx));
  check('the key can go in a query parameter, masked on the way back', seen.at(-1)!.url.includes(`api_key=${KEYV}`) && !out.includes(KEYV) && out.includes('[secret ECHO_KEY]'), out);
  out = text(await H.run({ url: at('api.example.test'), auth: 'NO_SUCH_KEY' }, ctx));
  check('a missing key points the agent at request_secret', /request_secret/.test(out), out);
  testHooks.allowPrivate = false;
  out = text(await H.run({ url: `http://127.0.0.1:${echoPort}/echo` }, ctx));
  check('this machine is refused', /on this machine or its network/.test(out), out);
  out = text(await H.run({ url: at('api.example.test') }, ctx));
  check('a name that resolves to this machine is refused when connecting', /on this machine or its network/.test(out), out);
  const sneaky = ['[::ffff:7f00:1]', '[::ffff:127.0.0.1]', '[::7f00:1]', '[64:ff9b::7f00:1]', '[::1]', '0x7f000001', '2130706433', '127.1'];
  const through: string[] = [];
  for (const h of sneaky) if (!/on this machine or its network/.test(text(await H.run({ url: `http://${h}:${echoPort}/echo` }, ctx)))) through.push(h);
  check('other spellings of this machine are refused too', !through.length, through);
  testHooks.allowPrivate = true;
  out = text(await tool('parrot').run({ say: `oops ${KEYV} and ${V2}` }, ctx));
  check('every tool of the app has known secrets masked', out === 'oops [secret ECHO_KEY] and [secret WEATHER_KEY]', out);
  const lc = text(await tool('list_connections').run({}, ctx));
  check('list_connections names apps and keys, never values', /fakeapp: Fake App/.test(lc) && /ECHO_KEY: for example\.test/.test(lc) && !lc.includes(KEYV) && !lc.includes(V2), lc);

  section('request_secret, with its card');
  const asked = text(await tool('request_secret').run({ name: 'github token', why: 'To open the pull request.', domains: ['https://api.github.com/'] }, ctx));
  check('the tool returns at once, saying a card asks for it', /card in the conversation asks the user for GITHUB_TOKEN/.test(asked), asked);
  const look = await app.inject({ method: 'GET', url: `/api/connections/requests?key=${encodeURIComponent(KEY)}&name=GITHUB_TOKEN` });
  const reqv = look.json().request;
  check('the card finds its request', reqv?.state === 'pending' && reqv.domains[0] === 'api.github.com' && reqv.why === 'To open the pull request.', reqv);
  check('the pages showing the session were told', events.some((e: any) => e.t === 'feature' && e.key === KEY && e.data?.changed === 'request'));
  const GH = 'ghp_fakeTokenValue0123456789ABCDEFGHIJ';
  const saved = await app.inject({ method: 'POST', url: `/api/connections/requests/${reqv.id}`, payload: { value: GH, domains: 'api.github.com' } });
  check('saving it from the card works', saved.statusCode === 200 && saved.json().request.state === 'saved' && saved.json().request.hint === 'ghp…GHIJ', saved.body);
  check('the value went to the vault', readSecret(db, 'GITHUB_TOKEN')?.value === GH);
  check('the agent got a message naming it, never the value', delivered.at(-1)?.key === KEY && /GITHUB_TOKEN is saved/.test(delivered.at(-1)!.text) && !delivered.at(-1)!.text.includes(GH), delivered.at(-1));
  const pages = (await app.inject({ method: 'GET', url: '/api/connections' })).body + look.body + saved.body;
  check('no answer to the pages carries the value', !pages.includes(GH) && !pages.includes(KEYV));
  check('the value is not in the database as text', !dbBytes().includes(GH));
  const twice = text(await tool('request_secret').run({ name: 'GITHUB_TOKEN', why: 'Again.' }, ctx));
  check('asking for a key already saved says so instead', /already in the vault/.test(twice), twice);
  await tool('request_secret').run({ name: 'GITHUB_TOKEN', why: 'It stopped working.', domains: ['evil.test'], replace: true }, ctx);
  const again2 = (await app.inject({ method: 'GET', url: `/api/connections/requests?key=${encodeURIComponent(KEY)}&name=GITHUB_TOKEN` })).json().request;
  check('asking again for a saved key keeps its hosts, not the agent’s', again2.state === 'pending' && again2.domains.join() === 'api.github.com', again2.domains);
  text(await tool('request_secret').run({ name: 'SLACK_TOKEN', why: 'To post.' }, ctx));
  const sl = (await app.inject({ method: 'GET', url: `/api/connections/requests?key=${encodeURIComponent(KEY)}&name=SLACK_TOKEN` })).json().request;
  const dis = await app.inject({ method: 'POST', url: `/api/connections/requests/${sl.id}/dismiss` });
  check('"Not now" settles it and tells the agent', dis.json().request.state === 'dismissed' && /rather not give SLACK_TOKEN/.test(delivered.at(-1)!.text));
} catch (e) {
  failed++;
  console.log(`  FAIL the test stopped: ${(e as Error).stack}`);
} finally {
  await app.close();
  fakeAs.close();
  echo.close();
  db.close();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
