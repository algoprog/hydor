// Script tests for Ask first and the Outbox: which tools act outside; the three states of a connected account's tools
// (accounts connected from now on start those that act outside on Ask first, older ones keep theirs); a call to a tool
// on Ask first held by the relay (the agent's answer at once, the stored call, the line in the session, the notice),
// sent later with its input changed to a fake account that records what it got, or dropped; the agent hearing the
// outcome with the next message; a test that sends nothing; On and Off as before; and a local account through the
// real bridge (built here), whose calls go to the gate first.
// Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/outbox/outbox-test.ts
//   DATA_DIR=/tmp/hydor-test-outbox node dist/dev/outbox-test.js
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import type { CatalogApp } from '../../shared/connections.ts';
import { actsOutside, heldShape } from '../../shared/outbox.ts';
import { migrateRuns, startRun, finishRun } from '../automations/runs.ts';
import { appTables, askOffer, connection, patchConnection, saveConnection, setTested, toolFilter, toolState, view } from '../connections/apps.ts';
import { relayRoutes } from '../connections/relay.ts';
import { openDb } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { runToken } from '../mcp.ts';
import { notesOf } from '../notes.ts';
import { dropHeld, heldCount, listHeld, outbox, outboxTables, outcomesFor, sendAll, sendHeld, sweepOld, KEEP_MS } from './index.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-outbox-test-')));
const db = openDb(path.join(tmp, 'test.db'));
appTables(db);
migrateRuns(db);
outboxTables(db);

let passed = 0;
const ok = async (name: string, f: () => void | Promise<void>) => {
  await f();
  passed++;
  console.log(`ok - ${name}`);
};

// ---- which tools act outside ------------------------------------------------------------------------------

await ok('tools that send, post, delete or pay act outside; those that look or keep things yours do not', () => {
  const outside = ['send_email', 'gmail_send_message', 'slack_post_message', 'postMessage', 'reply_to_thread', 'forward_email', 'create_issue', 'add_comment', 'delete_page', 'remove_member', 'invite_user', 'share_file', 'publish_post', 'create_payment', 'refund_charge', 'transfer_funds', 'merge_pull_request', 'send_draft', 'message_user', 'push_files', 'place_order', 'update_post'];
  const inside = ['search_email', 'read_email', 'get_message', 'list_posts', 'message_get', 'list_folders', 'create_page', 'update_page', 'save_draft', 'create_draft', 'add_label', 'mark_email', 'get_order_status', 'text_search', 'fetch_comments', 'export_csv', 'whoami'];
  for (const n of outside) assert.equal(actsOutside({ name: n }), true, n);
  for (const n of inside) assert.equal(actsOutside({ name: n }), false, n);
});

await ok("MCP's hints and a tool's description decide where its name says nothing", () => {
  assert.equal(actsOutside({ name: 'send_email', annotations: { readOnlyHint: true } }), false, 'read-only wins');
  assert.equal(actsOutside({ name: 'archive_thing', annotations: { destructiveHint: true } }), true, 'destructive');
  assert.equal(actsOutside({ name: 'fax', description: 'Sends a fax to a number.' }), true);
  assert.equal(actsOutside({ name: 'fax_status', description: 'Status of a fax.' }), false);
  assert.equal(actsOutside({ name: 'move_email', description: 'Moves a message to another folder.' }), false);
  assert.equal(actsOutside({ name: 'tidy', description: 'Deletes old files from the drive.' }), true);
});

await ok('a held call reads as an email, a chat message, a post, or its own fields', () => {
  assert.equal(heldShape('send_email', { to: ['a@b.c'], subject: 'Hi', text: 'x' }), 'email');
  assert.equal(heldShape('send_email', { to: 'a@b.c' }, { properties: { to: {}, subject: {}, body: {} } }), 'email');
  assert.equal(heldShape('post_message', { channel: '#a', text: 'x' }), 'message');
  assert.equal(heldShape('create_post', { text: 'x' }), 'post');
  assert.equal(heldShape('create_issue', { repo: 'a/b', title: 'x' }), 'fields');
});

// ---- a fake account: a Streamable HTTP MCP server that records the calls it gets --------------------------

const TOOLS = [
  { name: 'search_email', description: 'Search your mail.', inputSchema: { type: 'object', properties: { query: { type: 'string' } } }, annotations: { readOnlyHint: true } },
  { name: 'send_email', description: 'Send an email.', inputSchema: { type: 'object', properties: { to: { type: 'array' }, subject: { type: 'string' }, text: { type: 'string' } }, required: ['to', 'subject', 'text'] } },
  { name: 'delete_email', description: 'Move a message to the bin.', inputSchema: { type: 'object', properties: { id: { type: 'string' } } }, annotations: { destructiveHint: true } },
  { name: 'label_email', description: 'Label a message.', inputSchema: { type: 'object', properties: { id: { type: 'string' } } } },
];
const got: { name: string; arguments: any }[] = [];
const upstream = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (req.method === 'DELETE') return void res.writeHead(204).end();
    const m = JSON.parse(body || '{}');
    const reply = (result: unknown) => res.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': 'up-1' }).end(JSON.stringify({ jsonrpc: '2.0', id: m.id, result }));
    if (m.method === 'initialize') return reply({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'fake' } });
    if (m.method === 'tools/list') return reply({ tools: TOOLS });
    if (m.method === 'tools/call') {
      got.push({ name: m.params.name, arguments: m.params.arguments });
      return reply({ content: [{ type: 'text', text: `did ${m.params.name}` }] });
    }
    res.writeHead(202).end();
  });
});
await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r));
const upPort = (upstream.address() as { port: number }).port;

const entry = (id: string): CatalogApp =>
  ({ id, name: id === 'mailnew' ? 'New Mail' : 'Old Mail', description: 'x', category: 'communication', icon: 'mail', homepage: 'https://example.com', server: { transport: 'http', url: `http://127.0.0.1:${upPort}/mcp` }, auth: { type: 'none' }, verified: null }) as unknown as CatalogApp;

// An account connected before Ask first (its row predates the column: 0), and one connected now.
saveConnection(db, entry('mailold'), {});
db.prepare('update conn_apps set ask_default = 0 where id = ?').run('mailold');
saveConnection(db, entry('mailnew'), {});
for (const id of ['mailold', 'mailnew']) setTested(db, id, TOOLS);

await ok('an account connected now starts its tools that act outside on Ask first; an older one keeps them On', () => {
  const n = connection(db, 'mailnew')!;
  const o = connection(db, 'mailold')!;
  assert.deepEqual(TOOLS.map((t) => toolState(n, t.name)), ['on', 'ask', 'ask', 'on']);
  assert.deepEqual(TOOLS.map((t) => toolState(o, t.name)), ['on', 'on', 'on', 'on']);
  assert.deepEqual(askOffer(o), ['send_email', 'delete_email'], 'the older account is offered Ask first for the two');
  assert.deepEqual(askOffer(n), []);
  const v = view(o);
  assert.equal(v.tools!.find((t) => t.name === 'send_email')!.outside, true);
  assert.equal(v.tools!.find((t) => t.name === 'search_email')!.outside, false);
  assert.ok(n.tools!.find((t) => t.name === 'send_email')!.inputSchema, 'the schema is kept for the Outbox');
});

await ok('the person sets a tool On, Ask first or Off; Off and On filter the bridge as before', () => {
  patchConnection(db, 'mailold', { tools: { send_email: 'ask', label_email: false } });
  const o = connection(db, 'mailold')!;
  assert.equal(toolState(o, 'send_email'), 'ask');
  assert.equal(toolState(o, 'label_email'), 'off');
  assert.deepEqual(askOffer(o), ['delete_email'], 'one left to offer; the one chosen is not');
  assert.deepEqual(toolFilter(o), { only: null, skip: ['label_email'] }, 'Ask first is not skipped');
  patchConnection(db, 'mailold', { tools: { send_email: true, delete_email: true, label_email: true } });
  assert.equal(toolState(connection(db, 'mailold')!, 'send_email'), 'on');
  assert.deepEqual(askOffer(connection(db, 'mailold')!), [], 'chosen On: no longer offered');
  patchConnection(db, 'mailold', { tools: { label_email: false } });
});

// ---- the app around the relay -----------------------------------------------------------------------------

const app = Fastify();
const notices: any[] = [];
const events: any[] = [];
const sessions = Object.assign(new EventEmitter(), {
  liveByRun: (runId: string) => (runId === 'run-1' ? { key: 'claude:s1', agent: 'claude', cwd: tmp } : runId === 'run-2' ? { key: 'claude:s2', agent: 'claude', cwd: tmp } : null),
  summary: (key: string) => ({ key, title: `Session ${key}`, agent: 'claude', cwd: tmp }),
  timeline: async () => ({ parser: { items: [] } }),
  adapterByRun: () => null,
});
sessions.on('notify', (n) => notices.push(n));
const d = { app, db, sessions: sessions as any, scheduler: null as any, models: null as any, broadcast: (e: unknown) => events.push(e), toSubscribers: () => {}, publicBase: () => 'http://test.local' } as Deps;
relayRoutes(d);
outbox.routes!(d);
await app.listen({ port: 0, host: '127.0.0.1' });
const port = (app.server.address() as { port: number }).port;

let rid = 0;
/** One JSON-RPC request through the relay, as an agent of run `run` sends it. */
async function relay(appId: string, method: string, params: unknown, run = 'run-1') {
  const r = await app.inject({ method: 'POST', url: `/connections/mcp/${runToken(run)}/${appId}`, payload: { jsonrpc: '2.0', id: ++rid, method, params } });
  return JSON.parse(r.body);
}
const tick = () => new Promise((r) => setTimeout(r, 30));

await ok('On and Off are as before: an On tool is called as it is, an Off one is refused, only tools that are on are listed', async () => {
  const before = got.length;
  const r = await relay('mailold', 'tools/call', { name: 'send_email', arguments: { to: ['x@y.z'], subject: 'S', text: 'T' } });
  assert.equal(r.result.content[0].text, 'did send_email');
  assert.deepEqual(got.slice(before), [{ name: 'send_email', arguments: { to: ['x@y.z'], subject: 'S', text: 'T' } }]);
  const off = await relay('mailold', 'tools/call', { name: 'label_email', arguments: { id: '1' } });
  assert.equal(off.result.isError, true);
  assert.match(off.result.content[0].text, /turned off/);
  assert.equal(got.length, before + 1, 'the Off call never reached the account');
  const list = await relay('mailold', 'tools/list', {});
  assert.deepEqual(
    list.result.tools.map((t: any) => t.name),
    ['search_email', 'send_email', 'delete_email'],
  );
  assert.ok(!list.result.tools.some((t: any) => t._meta?.['hydor/askFirst']), 'nothing marked Ask first');
  assert.equal(heldCount(db), 0);
});

let heldId = '';
await ok('a call to a tool on Ask first is held: the agent hears so at once, and the call waits in the Outbox', async () => {
  const before = got.length;
  const list = await relay('mailnew', 'tools/list', {});
  const send = list.result.tools.find((t: any) => t.name === 'send_email');
  assert.equal(send._meta['hydor/askFirst'], true, 'marked in the list (Custom does not ask again)');
  assert.match(send.description, /Ask first/);
  const r = await relay('mailnew', 'tools/call', { name: 'send_email', arguments: { to: ['ann@example.com'], subject: 'Invoice 42', text: 'Hi Ann, a reminder.' } });
  assert.equal(r.result.isError, false);
  assert.match(r.result.content[0].text, /Held for the user's OK/);
  assert.match(r.result.content[0].text, /Do not call it again/);
  assert.equal(got.length, before, 'not made');
  const calls = listHeld(d);
  assert.equal(calls.length, 1);
  const c = calls[0];
  heldId = c.id;
  assert.equal(c.status, 'held');
  assert.equal(c.key, 'claude:s1');
  assert.equal(c.session, 'Session claude:s1');
  assert.equal(c.appName, 'New Mail');
  assert.equal(c.tool, 'send_email');
  assert.equal(c.shape, 'email');
  assert.deepEqual(c.input, { to: ['ann@example.com'], subject: 'Invoice 42', text: 'Hi Ann, a reminder.' });
  assert.deepEqual(c.schema?.required, ['to', 'subject', 'text']);
  await tick();
  const line = notesOf(db, 'claude:s1', 'outbox');
  assert.equal(line.length, 1, 'a line in the session');
  assert.equal((line[0].data as any).status, 'held');
  assert.equal(notices.length, 1);
  assert.equal(notices[0].kind, 'waiting');
  assert.equal(notices[0].url, '/inbox');
  assert.ok(events.some((e: any) => e.id === 'outbox' && e.data.held === 1), 'the pages hear the count');
  // In the Inbox, as a draft.
  const items = outbox.inbox!(d);
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, 'outbox');
  assert.equal(items[0].outbox?.id, c.id);
  // The read-only tool of the same account is not held.
  const s = await relay('mailnew', 'tools/call', { name: 'search_email', arguments: { query: 'ann' } });
  assert.equal(s.result.content[0].text, 'did search_email');
});

await ok('it waits over a restart: kept in the database, a call stuck on its way waits again', async () => {
  assert.equal(listHeld(d)[0].id, heldId);
  db.prepare(`update outbox_calls set status = 'sending' where id = ?`).run(heldId);
  outbox.start!(d);
  const c = listHeld(d)[0];
  assert.equal(c.status, 'failed');
  assert.match(c.result!, /may have gone or not/);
  db.prepare(`update outbox_calls set status = 'held', result = null where id = ?`).run(heldId);
});

await ok('Send makes the call with the input as changed, keeps the answer, and the agent hears it with the next message', async () => {
  const before = got.length;
  const r = await app.inject({ method: 'POST', url: `/api/outbox/${heldId}/send`, payload: { input: { to: ['ann@example.com', 'bob@example.com'], subject: 'Invoice 42 (second reminder)', text: 'Hi Ann, a second reminder.' } } });
  assert.equal(r.statusCode, 200, r.body);
  const c = JSON.parse(r.body).call;
  assert.equal(c.status, 'sent');
  assert.equal(c.result, 'did send_email');
  assert.deepEqual(got.slice(before), [{ name: 'send_email', arguments: { to: ['ann@example.com', 'bob@example.com'], subject: 'Invoice 42 (second reminder)', text: 'Hi Ann, a second reminder.' } }]);
  assert.equal(listHeld(d).length, 0, 'it leaves the Outbox');
  assert.equal((notesOf(db, 'claude:s1', 'outbox')[0].data as any).status, 'sent', 'the line says so');
  const told = outcomesFor(db, 'claude:s1');
  assert.match(told!, /sent your held call to New Mail's send_email\. It answered: did send_email/);
  assert.equal(outcomesFor(db, 'claude:s1'), null, 'once');
  const again = await app.inject({ method: 'POST', url: `/api/outbox/${heldId}/send`, payload: {} });
  assert.equal(again.statusCode, 409, 'not twice');
});

await ok('Drop: the call is never made', async () => {
  const before = got.length;
  await relay('mailnew', 'tools/call', { name: 'delete_email', arguments: { id: 'm-7' } });
  const c = listHeld(d)[0];
  assert.equal(c.tool, 'delete_email');
  const r = dropHeld(d, c.id);
  assert.equal(r.status, 'dropped');
  assert.equal(got.length, before);
  assert.equal(listHeld(d).length, 0);
  assert.match(outcomesFor(db, 'claude:s1')!, /dropped your held call to New Mail's delete_email/);
  assert.throws(() => dropHeld(d, c.id), /dropped already/);
});

await ok('Send all sends a session’s held calls, as they are', async () => {
  const before = got.length;
  await relay('mailnew', 'tools/call', { name: 'send_email', arguments: { to: ['a@x.y'], subject: 'One', text: '1' } }, 'run-2');
  await relay('mailnew', 'tools/call', { name: 'send_email', arguments: { to: ['b@x.y'], subject: 'Two', text: '2' } }, 'run-2');
  await relay('mailnew', 'tools/call', { name: 'send_email', arguments: { to: ['c@x.y'], subject: 'Other', text: '3' } });
  const r = await sendAll(d, { key: 'claude:s2' });
  assert.deepEqual(
    r.map((c) => c.status),
    ['sent', 'sent'],
  );
  assert.deepEqual(
    got.slice(before).map((g) => g.arguments.subject),
    ['One', 'Two'],
    'in the order they were held',
  );
  assert.equal(listHeld(d).length, 1, "the other session's call still waits");
  const sent = await sendHeld(d, listHeld(d)[0].id);
  assert.equal(sent.status, 'sent');
});

await ok('a test that sends nothing: calls that act outside are kept as "would have sent", never made, and nothing waits in the Outbox', async () => {
  const run = startRun(db, { taskId: '', trigger: 'test', input: 'x', dry: true });
  db.prepare('update task_runs set key = ? where id = ?').run('claude:s2', run);
  const before = got.length;
  // On for the older account: held all the same, as it sends; so is the one on Ask first.
  const a = await relay('mailold', 'tools/call', { name: 'send_email', arguments: { to: ['x@y.z'], subject: 'S', text: 'T' } }, 'run-2');
  assert.match(a.result.content[0].text, /test that sends nothing/);
  const b = await relay('mailnew', 'tools/call', { name: 'send_email', arguments: { to: ['x@y.z'], subject: 'S2', text: 'T' } }, 'run-2');
  assert.match(b.result.content[0].text, /test that sends nothing/);
  // Reading goes on as usual.
  const s = await relay('mailold', 'tools/call', { name: 'search_email', arguments: { query: 'q' } }, 'run-2');
  assert.equal(s.result.content[0].text, 'did search_email');
  assert.deepEqual(got.slice(before).map((g) => g.name), ['search_email']);
  assert.equal(listHeld(d).length, 0, 'nothing waits in the Outbox');
  const kept = listHeld(d, { run, all: true });
  assert.deepEqual(kept.map((c) => c.status), ['dry', 'dry']);
  assert.equal(notices.filter((n) => n.key === 'claude:s2').length, 2, 'no notice for those (only the two held earlier)');
  await assert.rejects(sendHeld(d, kept[0].id), /test that sends nothing/);
  // The run over: the session is a normal one again.
  finishRun(db, run, { status: 'done' });
  const after = await relay('mailold', 'tools/call', { name: 'send_email', arguments: { to: ['x@y.z'], subject: 'S3', text: 'T' } }, 'run-2');
  assert.equal(after.result.content[0].text, 'did send_email');
});

await ok('a local account goes through the bridge: each call to the gate first, Ask first held, On and Off as before', async () => {
  // The real bridge, built here, starting a small local MCP server.
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const bridge = path.join(tmp, 'connbridge.mjs');
  const { build } = await import('esbuild');
  await build({ entryPoints: [path.join(root, 'server/connections/bridge.ts')], outfile: bridge, bundle: true, platform: 'node', format: 'esm', target: 'node22', packages: 'external', logLevel: 'warning', absWorkingDir: root });
  const server = path.join(tmp, 'local-mcp.mjs');
  const log = path.join(tmp, 'local-calls.log');
  fs.writeFileSync(
    server,
    `import fs from 'node:fs'; import rl from 'node:readline';
const tools = ${JSON.stringify(TOOLS)};
rl.createInterface({ input: process.stdin }).on('line', (l) => { const m = JSON.parse(l); const out = (result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result }) + '\\n');
  if (m.method === 'initialize') return out({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'local' } });
  if (m.method === 'tools/list') return out({ tools });
  if (m.method === 'tools/call') { fs.appendFileSync(${JSON.stringify(log)}, m.params.name + ' ' + JSON.stringify(m.params.arguments) + '\\n'); return out({ content: [{ type: 'text', text: 'local did ' + m.params.name }] }); } });`,
  );
  const local = { ...entry('localmail'), name: 'Local Mail', server: { transport: 'stdio', command: process.execPath, args: [server] } } as unknown as CatalogApp;
  saveConnection(db, local, {});
  setTested(db, 'localmail', TOOLS);
  patchConnection(db, 'localmail', { tools: { label_email: false } });
  const p = spawn(process.execPath, [bridge, 'launch', `http://127.0.0.1:${port}/connections/launch/${runToken('run-1')}/localmail`], { stdio: ['pipe', 'pipe', 'inherit'] });
  const replies = new Map<number, any>();
  let buf = '';
  p.stdout.on('data', (x) => {
    buf += x;
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const m = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      replies.set(m.id, m);
    }
  });
  let n = 100;
  const ask = async (method: string, params: unknown) => {
    const id = ++n;
    p.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    for (let i = 0; i < 200 && !replies.has(id); i++) await new Promise((r) => setTimeout(r, 25));
    assert.ok(replies.has(id), `an answer to ${method}`);
    return replies.get(id);
  };
  try {
    await ask('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
    const list = await ask('tools/list', {});
    assert.deepEqual(list.result.tools.map((t: any) => t.name), ['search_email', 'send_email', 'delete_email'], 'Off left out');
    assert.equal(list.result.tools.find((t: any) => t.name === 'send_email')._meta['hydor/askFirst'], true);
    const held = await ask('tools/call', { name: 'send_email', arguments: { to: ['z@z.z'], subject: 'Local', text: 'x' } });
    assert.match(held.result.content[0].text, /Held for the user's OK/);
    const read = await ask('tools/call', { name: 'search_email', arguments: { query: 'q' } });
    assert.equal(read.result.content[0].text, 'local did search_email');
    const off = await ask('tools/call', { name: 'label_email', arguments: { id: '1' } });
    assert.match(off.result.content[0].text, /turned off/);
    const calls = fs.readFileSync(log, 'utf8').trim().split('\n');
    assert.deepEqual(calls, ['search_email {"query":"q"}'], 'only the On call reached the local server');
  } finally {
    p.kill();
  }
  // Sent from the Outbox: Hydor starts the local server for the call.
  const c = listHeld(d).find((x) => x.app === 'localmail')!;
  assert.equal(c.tool, 'send_email');
  const sent = await sendHeld(d, c.id, { ...c.input, subject: 'Local, changed' });
  assert.equal(sent.status, 'sent', sent.result);
  assert.equal(sent.result, 'local did send_email');
  assert.match(fs.readFileSync(log, 'utf8'), /send_email \{"to":\["z@z.z"\],"subject":"Local, changed","text":"x"\}/);
});

await ok('a call to an account no longer connected fails on its card, and waits to be dropped', async () => {
  await relay('mailnew', 'tools/call', { name: 'send_email', arguments: { to: ['q@q.q'], subject: 'Gone', text: 'x' } });
  const c = listHeld(d)[0];
  db.prepare('delete from conn_apps where id = ?').run('mailnew');
  const r = await sendHeld(d, c.id);
  assert.equal(r.status, 'failed');
  assert.match(r.result!, /no longer connected/);
  assert.equal(listHeld(d)[0].id, c.id, 'still in the Outbox');
  dropHeld(d, c.id);
});

await ok('calls older than 30 days go', () => {
  const n = (db.prepare('select count(*) as n from outbox_calls').get() as { n: number }).n;
  assert.ok(n > 0);
  assert.equal(sweepOld(db, Date.now() + KEEP_MS + 60_000), n);
  assert.equal((db.prepare('select count(*) as n from outbox_calls').get() as { n: number }).n, 0);
});

await app.close();
upstream.close();
db.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed`);
process.exit(0);
