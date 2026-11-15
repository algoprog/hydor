// Script tests for the "A connected account" watcher, with fake accounts only (a small MCP server over HTTP here, and a
// local one over stdio): where the items are and which field tells them apart in different answers, {{now}} in the
// arguments, tools that act outside (or are on Ask first or Off) refused, the first look only taking note, one run per
// new item and never twice (across a restart too, and when a run cannot start), the cap of 10 with the rest in a line,
// errors that stop runs (an error answer, a refused sign-in, the tool gone, a changed answer), the starting points,
// and "Before each event": its timing, an event that moves, one cancelled, the evening before, the filters.
// Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/automations/account-watch-test.ts
//   DATA_DIR=/tmp/hydor-test-account-watch node dist/dev/account-watch-test.js
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AccountWatch, WatchSpec } from '../../shared/automations.ts';
import type { CatalogApp } from '../../shared/connections.ts';
import { onlyLooks } from '../../shared/outbox.ts';
import { appTables, patchConnection, saveConnection, setTested } from '../connections/apps.ts';
import { catalogApp } from '../connections/catalog.ts';
import { kvSet, openDb } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { Scheduler } from '../scheduler.ts';
import { setSessionExtra, sessionExtra } from '../sessionExtra.ts';
import type { SessionManager } from '../sessions.ts';
import { answerData, bestId, bestList, fillArgs, findLists, fireAt, hasOthers, itemFields, PRESETS, presetsFor, readAnswer, useAccountDeps, watchAccounts, type EventsState } from './account-watch.ts';
import { checkWatch, validWatch } from './watch.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-account-watch-test-')));
const db = openDb(path.join(tmp, 'test.db'));
appTables(db);
kvSet(db, 'user.tz', 'Europe/Athens');
const TZ = 'Europe/Athens';

let passed = 0;
const ok = async (name: string, f: () => void | Promise<void>) => {
  await f();
  passed++;
  console.log(`ok - ${name}`);
};
const H = 3600_000;
const M = 60_000;

// ---- finding the items -----------------------------------------------------------------------------------------

const find = (r: { structured?: unknown; parts?: string[]; text?: string }) => {
  const data = answerData({ text: '', ...r });
  const lists = findLists(data);
  const list = bestList(lists);
  const items = list === null ? [] : ((list ? list.split('.').reduce((v: any, k) => v?.[k], data) : data) as unknown[]);
  return { list, id: bestId(items, itemFields(items)), items };
};

await ok('the first list of records in structured content, told apart by its id', () => {
  const r = find({ structured: { total: 2, results: [{ id: 7, name: 'ACME deal', paid: true }, { id: 8, name: 'Globex', paid: true }] }, parts: ['{"total":2}'] });
  assert.deepEqual([r.list, r.id], ['results', 'id']);
});

await ok('JSON in the text: nested, a key, after a line of words in a code block', () => {
  assert.deepEqual([find({ parts: ['{"data":{"items":[{"key":"T-1","title":"a"},{"key":"T-2","title":"b"}]}}'] }).list, find({ parts: ['{"data":{"items":[{"key":"T-1"},{"key":"T-2"}]}}'] }).id], ['data.items', 'key']);
  const fenced = find({ parts: ['Found 2 files:\n```json\n[{"path_display":"/a.pdf","name":"a.pdf"},{"path_display":"/b.pdf","name":"b.pdf"}]\n```'] });
  assert.deepEqual([fenced.list, fenced.id], ['', 'path_display']);
});

await ok('an answer that is a list itself; one text part per item; plain names; an empty list before the records', () => {
  assert.deepEqual(Object.values(find({ parts: ['[{"url":"https://x/1","t":"a"},{"url":"https://x/2","t":"b"}]'] })).slice(0, 2), ['', 'url']);
  assert.deepEqual(Object.values(find({ parts: ['{"uid":"a","n":1}', '{"uid":"b","n":2}'] })).slice(0, 2), ['', 'uid']);
  assert.deepEqual(Object.values(find({ structured: { files: ['a.pdf', 'b.pdf'] } })).slice(0, 2), ['files', '*']);
  assert.deepEqual(Object.values(find({ structured: { meta: { tags: [] }, records: [{ ticketId: 'T1', paid: false }, { ticketId: 'T2', paid: true }] } })).slice(0, 2), ['records', 'ticketId']);
});

await ok('an id that ends in id, not a word that does (paid, valid); the whole item when nothing tells them apart', () => {
  assert.equal(find({ structured: { deals: [{ valid: true, deal_id: 'D1', stage: 'won' }, { valid: true, deal_id: 'D2', stage: 'won' }] } }).id, 'deal_id');
  assert.equal(find({ structured: { rows: [{ stage: 'won' }, { stage: 'lost' }, { stage: 'won' }] } }).id, '*');
  // Its structured content has no list: the JSON in its text does.
  assert.equal(find({ structured: { ok: true }, parts: ['{"issues":[{"identifier":"ENG-1"},{"identifier":"ENG-2"}]}'] }).list, 'issues');
});

await ok('an answer with no list in it, or a list gone since, fails the look instead of starting runs', () => {
  const w: AccountWatch = { kind: 'account', app: 'x', tool: 't' };
  assert.throws(() => readAnswer(w, 'CRM', { text: 'All good, nothing to show.' }, undefined, { now: 0, tz: TZ }), /no list of items/);
  assert.throws(() => readAnswer(w, 'CRM', { text: '', structured: { data: { other: 1 } } }, { list: 'results', id: 'id', seen: ['1'] }, { now: 0, tz: TZ }), /answer changed: there is no list at “results”/);
  assert.throws(() => readAnswer(w, 'CRM', { text: '', structured: { results: [{ name: 'no id' }] } }, { list: 'results', id: 'id', seen: ['1'] }, { now: 0, tz: TZ }), /an item has no “id” now/);
});

await ok('{{now}}, {{now+2d}}, {{now-1h}}, {{today}} and {{tomorrow}} are filled in at each check, in your time zone', () => {
  const now = Date.parse('2026-11-15T22:30:00Z'); // 00:30 on 16 November in Athens
  assert.deepEqual(fillArgs({ timeMin: '{{now}}', timeMax: '{{ now+2d }}', since: '{{now-1h}}', day: '{{today}}', next: 'from {{tomorrow}}', n: 5, nested: { a: ['{{today}}'] } }, now, TZ), {
    timeMin: '2026-11-15T22:30:00Z',
    timeMax: '2026-11-17T22:30:00Z',
    since: '2026-11-15T21:30:00Z',
    day: '2026-11-16',
    next: 'from 2026-11-17',
    n: 5,
    nested: { a: ['2026-11-16'] },
  });
});

await ok('a watcher calls only tools that look: not those that create, change, send, delete or pay', () => {
  const looks = ['list_deals', 'search_crm_objects', 'get_crm_object', 'whoami', 'gmail_message_get', 'order_status', 'fetch_page', 'listEvents', 'query_database'];
  const acts = ['create_deal', 'update_deal', 'send_email', 'delete_deal', 'mark_email', 'move_file', 'run_query', 'upload_file', 'archive_ticket', 'post_message', 'save_draft', 'tidy'];
  for (const n of looks) assert.equal(onlyLooks({ name: n }), true, n);
  for (const n of acts) assert.equal(onlyLooks({ name: n }), false, n);
  assert.equal(onlyLooks({ name: 'deals', description: 'Lists the deals in a pipeline.' }), true);
  assert.equal(onlyLooks({ name: 'deals', description: 'Returns the deals.' }), true);
  assert.equal(onlyLooks({ name: 'deals', description: 'Creates a deal.' }), false);
  assert.equal(onlyLooks({ name: 'do_thing', annotations: { readOnlyHint: true } }), true, 'MCP says it only reads');
  assert.equal(onlyLooks({ name: 'list_and_purge', annotations: { destructiveHint: true } }), false);
});

// ---- a fake account: a Streamable HTTP MCP server -------------------------------------------------------------

const TOOLS = [
  { name: 'list_deals', description: 'List deals, newest first.', annotations: { readOnlyHint: true }, inputSchema: { type: 'object', properties: { limit: { type: 'integer', maximum: 100 }, sort: { type: 'string', enum: ['created_asc', 'created_desc'] } } } },
  { name: 'search_crm_objects', description: 'Search CRM records.', inputSchema: { type: 'object', properties: { objectType: { type: 'string', enum: ['contacts', 'companies', 'deals', 'tickets'] }, query: { type: 'string' } }, required: ['objectType'] } },
  { name: 'list_deal_properties', description: 'The fields deals have.', inputSchema: { type: 'object', properties: {} } },
  { name: 'create_deal', description: 'Create a deal.', inputSchema: { type: 'object', properties: { name: { type: 'string' } } } },
  { name: 'send_deal_email', description: 'Send an email about a deal.', inputSchema: { type: 'object', properties: { to: { type: 'string' } } } },
  { name: 'delete_deal', description: 'Remove a deal.', annotations: { destructiveHint: true }, inputSchema: { type: 'object', properties: { id: { type: 'string' } } } },
  { name: 'get_pipeline_summary', description: 'A summary of the pipeline.', inputSchema: { type: 'object', properties: {} } },
  { name: 'list_events', description: 'Upcoming events.', annotations: { readOnlyHint: true }, inputSchema: { type: 'object', properties: { timeMin: { type: 'string' }, timeMax: { type: 'string' }, singleEvents: { type: 'boolean' } } } },
];

const fake = {
  deals: [] as { id: string; name: string; created: string }[],
  events: [] as Record<string, unknown>[],
  mode: 'ok' as 'ok' | 'error' | 'unauth' | 'changed',
  calls: [] as { name: string; arguments: any }[],
};
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
      fake.calls.push({ name: m.params.name, arguments: m.params.arguments });
      if (fake.mode === 'unauth') return void res.writeHead(401).end('{}');
      if (fake.mode === 'error') return reply({ content: [{ type: 'text', text: 'Token expired: sign in again' }], isError: true });
      if (m.params.name === 'list_events') return reply({ content: [{ type: 'text', text: JSON.stringify({ kind: 'calendar#events', items: fake.events }) }] });
      if (fake.mode === 'changed') return reply({ content: [{ type: 'text', text: '{"message":"moved to v2"}' }], structuredContent: { message: 'moved to v2' } });
      // Newest first, as many APIs list them.
      const results = [...fake.deals].reverse();
      return reply({ content: [{ type: 'text', text: JSON.stringify({ results }) }], structuredContent: { total: results.length, results } });
    }
    res.writeHead(202).end();
  });
});
await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r));
const port = (upstream.address() as { port: number }).port;
const entry = (id: string, name: string, category = 'sales'): CatalogApp =>
  ({ id, name, description: 'A fake account.', category, icon: 'list', homepage: 'https://example.com', server: { transport: 'http', url: `http://127.0.0.1:${port}/mcp` }, auth: { type: 'none' }, verified: null }) as unknown as CatalogApp;
saveConnection(db, entry('fakecrm', 'Fake CRM'), {});
setTested(db, 'fakecrm', TOOLS);
saveConnection(db, entry('fakecal', 'Fake Calendar', 'calendar'), {});
setTested(db, 'fakecal', TOOLS);

// ---- a stand-in for the session manager (the scheduler starts runs in it) --------------------------------------

class Sessions extends EventEmitter {
  created: { prompt: string; extra?: any }[] = [];
  failCreate = '';
  resumeLookup?: unknown;
  noticeGate?: unknown;
  async create(o: any) {
    if (this.failCreate) throw new Error(this.failCreate);
    this.created.push(o);
    const key = `claude:${crypto.randomUUID()}`;
    if (o.extra) setSessionExtra(db, key, o.extra);
    return key;
  }
  summary(key: string): any {
    return { key, agent: 'claude', title: 'Run', cwd: tmp, stats: { costUsd: 0 }, live: { status: 'working' }, extra: sessionExtra(db, key) };
  }
  async deliverOrQueue() {}
  queueSummary() {}
  async timeline() {
    return { parser: { items: [] } };
  }
  async beforeResume() {
    return false;
  }
  limitLiftsAt() {
    return undefined;
  }
  lives() {
    return true;
  }
  stoppedAtLimit() {
    return false;
  }
}
const sessions = new Sessions();
const d = { db, sessions: sessions as unknown as SessionManager, broadcast: () => {}, toSubscribers: () => {}, publicBase: () => 'http://test.local' } as unknown as Deps;
useAccountDeps(d);

// ---- which tools a watcher may call ----------------------------------------------------------------------------

await ok('a tool that sends, changes, deletes or pays is refused; so is one on Ask first or Off, or one the account does not have', () => {
  const w = (tool: string, app = 'fakecrm') => validWatch({ kind: 'account', app, tool });
  assert.throws(() => w('send_deal_email'), /sends, changes or deletes things/);
  assert.throws(() => w('delete_deal'), /sends, changes or deletes things/);
  assert.throws(() => w('create_deal'), /sends, changes or deletes things/, 'it makes things, even if they stay the account’s');
  assert.throws(() => w('no_such_tool'), /has no tool no_such_tool/);
  assert.throws(() => w('list_deals', 'nobody'), /not a connected account/);
  assert.throws(() => validWatch({ kind: 'account', app: 'fakecrm' }), /Pick the tool/);
  patchConnection(db, 'fakecrm', { tools: { get_pipeline_summary: 'ask', search_crm_objects: false } });
  assert.throws(() => w('get_pipeline_summary'), /Ask first/);
  assert.throws(() => w('search_crm_objects'), /set to Off/);
  patchConnection(db, 'fakecrm', { tools: { get_pipeline_summary: true, search_crm_objects: true } });
  assert.deepEqual(validWatch({ kind: 'account', app: 'Fake CRM', tool: 'list_deals', args: { limit: 50 }, before: null }), { kind: 'account', app: 'fakecrm', name: 'Fake CRM', tool: 'list_deals', args: { limit: 50 } });
  assert.throws(() => validWatch({ kind: 'account', app: 'fakecal', tool: 'list_events', before: { minutes: 0 } }), /how long before each event/);
  assert.throws(() => validWatch({ kind: 'account', app: 'fakecal', tool: 'list_events', before: { evening: '25:00' } }), /a time like 18:00/);
});

await ok('the form’s accounts: only tools that look and are On, how many are left out, and starting points from the account’s own tools', () => {
  const a = watchAccounts().find((x) => x.id === 'fakecrm')!;
  assert.deepEqual(
    a.tools.map((t) => t.name),
    ['list_deals', 'search_crm_objects', 'list_deal_properties', 'get_pipeline_summary', 'list_events'],
  );
  assert.deepEqual(a.skipped, { outside: 3, notOn: 0 });
  assert.equal(a.calendar, false);
  assert.ok(watchAccounts().find((x) => x.id === 'fakecal')!.calendar);
  // As HubSpot (whose catalog entry names deals, contacts and tickets): its own tools fill them in.
  const usable = TOOLS.filter((t) => !['send_deal_email', 'delete_deal', 'create_deal'].includes(t.name)) as any;
  const p = presetsFor({ id: 'hubspot', tools: usable }, usable);
  assert.deepEqual(
    p.map((x) => [x.id, x.tool, x.args]),
    [
      ['contacts', 'search_crm_objects', { objectType: 'contacts' }],
      ['deals', 'list_deals', { limit: 50, sort: 'created_desc' }],
      ['tickets', 'search_crm_objects', { objectType: 'tickets' }],
    ],
    'a tool about the shape of deals (their properties) is not one',
  );
  // As Google Calendar: before each event, from now to two days on.
  const cal = presetsFor({ id: 'google-calendar', tools: usable }, usable).find((x) => x.id === 'before')!;
  assert.deepEqual([cal.tool, cal.args, cal.before], ['list_events', { timeMin: '{{now}}', timeMax: '{{now+2d}}', singleEvents: true }, true]);
  assert.deepEqual(presetsFor({ id: 'fakecrm', tools: usable }, usable), [], 'none for an account the catalog says nothing of');
});

await ok('each starting point is offered only for accounts whose catalog entry says they hold such things', () => {
  for (const p of PRESETS)
    for (const id of p.apps) {
      const e = catalogApp(id);
      assert.ok(e, `${p.id}: ${id} is in the catalog`);
      assert.match(`${e!.description} ${(e!.keywords ?? []).join(' ')}`, p.says, `${p.id}: ${id}'s entry says so`);
    }
});

// ---- new items start runs ---------------------------------------------------------------------------------------

const deal = (n: number, at = Date.parse('2026-11-15T08:00:00Z') + n * M) => ({ id: `D${n}`, name: `Deal ${n}`, created: new Date(at).toISOString() });
let scheduler = new Scheduler(db, sessions as unknown as SessionManager);
const watch: WatchSpec = { kind: 'account', app: 'fakecrm', tool: 'list_deals', args: { limit: 50, sort: 'created_desc' } };
const task = scheduler.save({ name: 'New deals', prompt: 'Write a first reply to each new deal.', agent: 'claude', cwd: tmp, schedule: { kind: 'watch', minutes: 15, watch } });
const row = () => db.prepare('select * from tasks where id = ?').get(task.id);
const check = () => (scheduler as any).check(row());
const state = () => JSON.parse((row() as any).watch_state ?? '{}');

await ok('the first look only takes note of what is there', async () => {
  fake.deals = [deal(1), deal(2)];
  await check();
  assert.equal(sessions.created.length, 0);
  const t = scheduler.task(task.id);
  assert.equal(t.check!.ok, true);
  assert.match(t.check!.note!, /2 items \(first look/);
  assert.deepEqual(state().data, { list: 'results', id: 'id', seen: ['D2', 'D1'] });
  assert.deepEqual(fake.calls.at(-1), { name: 'list_deals', arguments: { limit: 50, sort: 'created_desc' } });
});

await ok('each new item starts one run, oldest first, with the item quoted as outside data; nothing new starts none', async () => {
  fake.deals = [deal(1), deal(2), deal(3), deal(4)];
  await check();
  assert.equal(sessions.created.length, 2);
  const [a, b] = sessions.created.map((c) => c.prompt);
  assert.match(a, /started because its watcher saw a change/);
  assert.match(a, /a connected account's answer/);
  assert.match(a, /<watched-data from="account">\nA new item from Fake CRM \(its tool list_deals, in “results”; its id: D3\)\.\nDeal 3/);
  assert.match(b, /its id: D4/);
  assert.match(scheduler.task(task.id).check!.note!, /4 items, 2 new/);
  await check();
  assert.equal(sessions.created.length, 2, 'not again');
  assert.match(scheduler.task(task.id).check!.note!, /nothing new/);
});

await ok('after a restart, what it has seen still holds', async () => {
  scheduler = new Scheduler(db, sessions as unknown as SessionManager);
  fake.deals.push(deal(5));
  await check();
  assert.equal(sessions.created.length, 3);
  assert.match(sessions.created.at(-1)!.prompt, /its id: D5/);
  scheduler = new Scheduler(db, sessions as unknown as SessionManager);
  await check();
  assert.equal(sessions.created.length, 3);
});

await ok('a run that cannot start: the items after it wait for the next look, and the one before it never runs again', async () => {
  fake.deals.push(deal(6), deal(7), deal(8));
  let n = 0;
  const create = sessions.create.bind(sessions);
  sessions.create = async (o: any) => {
    if (++n === 2) throw new Error('No agent can start now');
    return create(o);
  };
  await check();
  sessions.create = create;
  assert.equal(sessions.created.length, 4);
  assert.match(sessions.created.at(-1)!.prompt, /its id: D6/);
  assert.equal(scheduler.task(task.id).check!.ok, false);
  assert.match(scheduler.task(task.id).check!.note!, /Could not start a run: No agent can start now/);
  await check();
  assert.deepEqual(
    sessions.created.slice(4).map((c) => /its id: (D\d+)/.exec(c.prompt)![1]),
    ['D7', 'D8'],
  );
});

await ok('at most 10 runs a check: the newest 10, the first naming the others in a line', async () => {
  const before = sessions.created.length;
  for (let i = 9; i <= 23; i++) fake.deals.push(deal(i));
  await check();
  const got = sessions.created.slice(before).map((c) => c.prompt);
  assert.equal(got.length, 10);
  assert.deepEqual(
    got.map((p) => /its id: (D\d+)/.exec(p)![1]),
    ['D14', 'D15', 'D16', 'D17', 'D18', 'D19', 'D20', 'D21', 'D22', 'D23'],
  );
  assert.match(got[0], /\(5 other new items came in too and start no run of their own: Deal 9 \(id: D9\); Deal 10/);
  await check();
  assert.equal(sessions.created.length, before + 10, 'the five named in a line do not run later');
});

await ok('an error answer, a refused sign-in, the tool gone and a changed answer fail the look and start nothing', async () => {
  const before = sessions.created.length;
  const seen = state().data;
  fake.deals.push(deal(30));
  fake.mode = 'error';
  await check();
  assert.match(scheduler.task(task.id).check!.note!, /Fake CRM answered with an error: Token expired/);
  fake.mode = 'unauth';
  await check();
  assert.match(scheduler.task(task.id).check!.note!, /refused the sign-in: connect it again/);
  fake.mode = 'changed';
  await check();
  assert.match(scheduler.task(task.id).check!.note!, /answer changed: there is no list at “results”/);
  fake.mode = 'ok';
  setTested(db, 'fakecrm', TOOLS.filter((t) => t.name !== 'list_deals'));
  await check();
  assert.match(scheduler.task(task.id).check!.note!, /has no tool list_deals/);
  assert.equal(scheduler.task(task.id).check!.ok, false);
  assert.equal(sessions.created.length, before, 'no run on what it could not read');
  assert.deepEqual(state().data, seen, 'what it had seen is kept');
  setTested(db, 'fakecrm', TOOLS);
  await check();
  assert.equal(sessions.created.length, before + 1, 'back: the item that came meanwhile runs once');
  assert.match(sessions.created.at(-1)!.prompt, /its id: D30/);
  scheduler.remove(task.id);
});

await ok('a local account is started for the check and stopped after it', async () => {
  const server = path.join(tmp, 'local-mcp.mjs');
  const pids = path.join(tmp, 'local-pids.log');
  fs.writeFileSync(
    server,
    `import fs from 'node:fs'; import rl from 'node:readline';
fs.appendFileSync(${JSON.stringify(pids)}, process.pid + '\\n');
const tools = [{ name: 'list_files', description: 'Files in the folder.', inputSchema: { type: 'object', properties: {} } }];
rl.createInterface({ input: process.stdin }).on('line', (l) => { const m = JSON.parse(l); const out = (result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result }) + '\\n');
  if (m.method === 'initialize') return out({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'local' } });
  if (m.method === 'tools/list') return out({ tools });
  if (m.method === 'tools/call') return out({ content: [{ type: 'text', text: 'a.pdf' }], structuredContent: { files: [{ name: 'a.pdf', path: '/docs/a.pdf' }, { name: 'b.pdf', path: '/docs/b.pdf' }] } }); });`,
  );
  saveConnection(db, { ...entry('localdrive', 'Local Drive', 'files'), server: { transport: 'stdio', command: process.execPath, args: [server] } } as unknown as CatalogApp, {});
  setTested(db, 'localdrive', [{ name: 'list_files', description: 'Files in the folder.' }]);
  const r = await checkWatch(validWatch({ kind: 'account', app: 'localdrive', tool: 'list_files' }), undefined, { cwd: tmp });
  assert.match(r.note, /2 items \(first look/);
  assert.deepEqual([r.find!.list, r.find!.id], ['files', 'path']);
  await new Promise((res) => setTimeout(res, 300));
  const pid = Number(fs.readFileSync(pids, 'utf8').trim().split('\n').at(-1));
  assert.throws(() => process.kill(pid, 0), 'its program has stopped');
});

// ---- before each event ------------------------------------------------------------------------------------------

const t0 = Date.parse('2026-11-16T07:00:00Z'); // 09:00 in Athens
const ev = (id: string, start: number, o: Record<string, unknown> = {}) => ({ id, summary: `Call ${id}`, start: { dateTime: new Date(start).toISOString(), timeZone: TZ }, end: { dateTime: new Date(start + H).toISOString() }, ...o });
const cal = (before: AccountWatch['before']): WatchSpec => validWatch({ kind: 'account', app: 'fakecal', tool: 'list_events', args: { timeMin: '{{now}}', timeMax: '{{now+2d}}' }, before });
/** A look at `now`, kept as the scheduler keeps it: the runs' reports and the state after them. */
const look = async (w: WatchSpec, prev: unknown, now: number) => {
  const r = await checkWatch(w, prev, { cwd: tmp, now });
  return { r, reports: (r.runs ?? []).map((x) => x.report), state: r.state as EventsState };
};

await ok('a run 30 minutes before each event; the first look only takes note; the next check comes at its moment', async () => {
  const w = cal({ minutes: 30 });
  fake.events = [ev('a', t0 + 2 * H), ev('b', t0 + 20 * M), ev('c', t0 - H)];
  const first = await look(w, undefined, t0);
  assert.deepEqual(first.reports, []);
  assert.match(first.r.note, /2 upcoming events \(first look: a run comes 30 min before each one/);
  assert.equal(first.r.nextAt, t0 + 90 * M, 'b’s moment had passed at the first look: a’s comes next');
  assert.deepEqual(fake.calls.at(-1)!.arguments, { timeMin: '2026-11-16T07:00:00Z', timeMax: '2026-11-18T07:00:00Z' });
  const early = await look(w, first.state, t0 + H);
  assert.deepEqual(early.reports, []);
  const due = await look(w, early.state, t0 + 90 * M);
  assert.equal(due.reports.length, 1);
  assert.match(due.reports[0], /^An event in Fake Calendar starts in 30 minutes, at .* \(Europe\/Athens\): “Call a” \(its id: a\)\./);
  assert.match(due.reports[0], /The event as the calendar gave it:/);
  assert.deepEqual((await look(w, due.state, t0 + 100 * M)).reports, [], 'once');
});

await ok('a moved event gets its run before its new time; a cancelled or deleted one gets none', async () => {
  const w = cal({ minutes: 30 });
  fake.events = [ev('m', t0 + 2 * H), ev('x', t0 + 3 * H), ev('y', t0 + 3 * H)];
  let s = (await look(w, undefined, t0)).state;
  // m moves an hour later before its moment; x is cancelled; y is deleted.
  fake.events = [ev('m', t0 + 3 * H), ev('x', t0 + 3 * H, { status: 'cancelled' })];
  let l = await look(w, s, t0 + 95 * M);
  assert.deepEqual(l.reports, [], 'not at its old moment');
  assert.equal(l.r.nextAt, t0 + 150 * M);
  l = await look(w, l.state, t0 + 150 * M);
  assert.equal(l.reports.length, 1);
  assert.match(l.reports[0], /“Call m”/);
  s = l.state;
  // Moved again after its run: by 10 minutes, no new run; to the next day, a new one before that.
  fake.events = [ev('m', t0 + 3 * H + 10 * M)];
  l = await look(w, s, t0 + 160 * M);
  assert.deepEqual(l.reports, []);
  fake.events = [ev('m', t0 + 27 * H)];
  l = await look(w, l.state, t0 + 170 * M);
  assert.deepEqual(l.reports, []);
  l = await look(w, l.state, t0 + 27 * H - 30 * M);
  assert.equal(l.reports.length, 1, 'before its new time');
  // An answer that leaves out an event that had its run (for a while) does not run it again when it comes back.
  fake.events = [];
  l = await look(w, l.state, t0 + 27 * H - 20 * M);
  fake.events = [ev('m', t0 + 27 * H)];
  assert.deepEqual((await look(w, l.state, t0 + 27 * H - 10 * M)).reports, []);
});

await ok('the evening before at a time, in your time zone', async () => {
  const w = cal({ evening: '18:00' });
  const tomorrow10 = Date.parse('2026-11-17T08:00:00Z'); // 10:00 on the 17th in Athens
  assert.equal(fireAt({ evening: '18:00' }, tomorrow10, TZ), Date.parse('2026-11-16T16:00:00Z'));
  fake.events = [ev('e', tomorrow10)];
  const first = await look(w, undefined, t0);
  assert.equal(first.r.nextAt, Date.parse('2026-11-16T16:00:00Z'));
  assert.deepEqual((await look(w, first.state, Date.parse('2026-11-16T15:59:00Z'))).reports, []);
  const l = await look(w, first.state, Date.parse('2026-11-16T16:00:00Z'));
  assert.equal(l.reports.length, 1);
  assert.match(l.reports[0], /starts at .*“Call e”/);
});

await ok('only events whose title has a text, or with other people', async () => {
  const people = [{ email: 'me@x.com', self: true }, { email: 'ann@client.com' }];
  assert.equal(hasOthers({ attendees: people }), true);
  assert.equal(hasOthers({ attendees: [{ email: 'me@x.com', self: true }] }), false);
  assert.equal(hasOthers({ attendees: [{ email: 'me@x.com' }] }), false);
  const w = cal({ minutes: 15, title: 'client', others: true });
  fake.events = [ev('p', t0 + H, { summary: 'Client call: ACME', attendees: people }), ev('q', t0 + H, { summary: 'Client prep (alone)' }), ev('r', t0 + H, { summary: 'Lunch', attendees: people })];
  const first = await look(w, undefined, t0);
  assert.match(first.r.note, /^1 upcoming event /);
  const l = await look(w, first.state, t0 + 45 * M);
  assert.equal(l.reports.length, 1);
  assert.match(l.reports[0], /“Client call: ACME”/);
  assert.match(l.reports[0], /With: me@x\.com, ann@client\.com/);
});

await ok('a calendar watcher brings the scheduler’s next look forward to the next event’s moment', async () => {
  const now = Date.now();
  fake.events = [ev('soon', now + 40 * M)];
  const t = scheduler.save({ name: 'Brief', prompt: 'Brief me.', agent: 'claude', cwd: tmp, schedule: { kind: 'watch', minutes: 60, watch: cal({ minutes: 30 }) } });
  await (scheduler as any).check(db.prepare('select * from tasks where id = ?').get(t.id));
  const next = (db.prepare('select next_at from tasks where id = ?').get(t.id) as { next_at: number }).next_at;
  assert.ok(Math.abs(next - (now + 10 * M)) < 5000, `next look at the event's moment, not in an hour (${new Date(next).toISOString()})`);
  scheduler.remove(t.id);
});

await ok('no start time: it says to pick the field; a start field gone fails the look', async () => {
  const w = { kind: 'account', app: 'fakecal', tool: 'list_events', before: { minutes: 30 } } as AccountWatch;
  assert.throws(() => readAnswer(w, 'Cal', { text: '', structured: { items: [{ id: '1', summary: 'x' }] } }, undefined, { now: t0, tz: TZ }), /which field holds each event's start/);
  const prev: EventsState = { list: 'items', id: 'id', start: 'start', ev: {} };
  assert.throws(() => readAnswer(w, 'Cal', { text: '', structured: { items: [{ id: '1', when: 'soon' }] } }, prev, { now: t0, tz: TZ }), /no event has a start time at “start”/);
  // An all-day event starts at midnight in your time zone.
  const all = readAnswer(w, 'Cal', { text: '', structured: { items: [{ id: '1', summary: 'Holiday', start: { date: '2026-11-18' } }] } }, undefined, { now: t0, tz: TZ });
  assert.equal((all.state as EventsState).ev['1'].s, Date.parse('2026-11-17T22:00:00Z'));
});

upstream.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed`);
process.exit(0);
