// Script tests for the email tools' arguments and how they are offered (tools.ts, mcp.ts): each tool's checks and the
// plain message for each mistake, addresses and file names, the names and hints that say which tools send or delete,
// the MCP server's answers (introduction, the tool list naming the accounts, calls refused before any connection), and
// files to attach kept to the session's folder. No mail server is reached. Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/mail/tools-test.ts
//   DATA_DIR=/tmp/hydor-test-mail-tools node dist/dev/tools-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appTables } from '../connections/apps.ts';
import type { Conn } from '../connections/apps.ts';
import { catalogApp } from '../connections/catalog.ts';
import { useMaskDb, vaultTables } from '../connections/vault.ts';
import { openDb } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { accountViews, findAccount, mailTables, removeAccount, saveAccount } from './accounts.ts';
import { callBuiltin, viaBuiltin } from './mcp.ts';
import { addressList } from './send.ts';
import { checkMailArgs, mailToolInfos, runMailTool, safeName, writeAttachments } from './tools.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

let passed = 0;
const ok = async (name: string, f: () => void | Promise<void>) => {
  await f();
  passed++;
  console.log(`ok - ${name}`);
};

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-mail-tools-test-')));
const db = openDb(path.join(tmp, 'test.db'));
vaultTables(db);
appTables(db);
mailTables(db);
useMaskDb(db);

const bad = (tool: string, args: Record<string, unknown>, why: RegExp) => assert.throws(() => checkMailArgs(tool, args), why, `${tool} ${JSON.stringify(args)}`);

await ok('ids: one or several, as search_email gives them', () => {
  assert.deepEqual(checkMailArgs('read_email', { id: 'INBOX:42' }), { account: undefined, id: { folder: 'INBOX', uid: 42 }, max: 6000 });
  assert.deepEqual((checkMailArgs('mark_email', { ids: ['[Gmail]/All Mail:7', 'INBOX:3'], read: true }) as { ids: unknown }).ids, [
    { folder: '[Gmail]/All Mail', uid: 7 },
    { folder: 'INBOX', uid: 3 },
  ]);
  bad('read_email', {}, /ids: the emails/);
  bad('read_email', { id: '42' }, /not an email id/);
  bad('read_email', { id: 'INBOX:abc' }, /not an email id/);
  bad('delete_email', { ids: Array.from({ length: 101 }, (_, i) => `INBOX:${i + 1}`) }, /at most 100/);
});

await ok('search: dates, limits and yes-or-no checked', () => {
  const a = checkMailArgs('search_email', { from: 'anna', since: '2026-11-01', unread: true, limit: 500 }) as { since: Date; limit: number; unread: boolean };
  assert.equal(a.since.toISOString().slice(0, 10), '2026-11-01');
  assert.equal(a.limit, 100);
  assert.equal(a.unread, true);
  assert.equal((checkMailArgs('search_email', {}) as { limit: number }).limit, 20);
  bad('search_email', { since: 'last week' }, /since: a date like 2026-11-01/);
  bad('search_email', { since: '2026-02-30' }, /since: a date/);
  bad('search_email', { since: '2026-11-10', before: '2026-11-01' }, /since must be before before/);
  bad('search_email', { unread: 'maybe' }, /unread: true or false/);
});

await ok('mark, move and save: what each needs', () => {
  bad('mark_email', { ids: ['INBOX:1'] }, /Say what to mark/);
  bad('move_email', { ids: ['INBOX:1'] }, /to: the folder/);
  bad('save_attachments', { id: 'INBOX:1', folder: '../outside' }, /inside the session’s folder/);
  bad('save_attachments', { id: 'INBOX:1', folder: '/etc' }, /inside the session’s folder/);
  assert.equal((checkMailArgs('save_attachments', { id: 'INBOX:1' }) as { folder: string }).folder, 'email-attachments');
});

await ok('send_email: who to, a subject and a text; a reply needs neither who nor subject', () => {
  bad('send_email', { subject: 'Hi', text: 'Hello' }, /to: who it goes to/);
  bad('send_email', { to: 'anna@example.org', text: 'Hello' }, /subject/);
  bad('send_email', { to: 'anna@example.org', subject: 'Hi' }, /text: what the email says/);
  bad('send_email', { to: 'not an address', subject: 'Hi', text: 'x' }, /is not an email address/);
  bad('send_email', { to: 'a@x.com', subject: 'Hi', text: 'x', reply_all: true }, /reply_all goes with reply_to/);
  bad('send_email', { to: 'a@x.com\r\nBcc: evil@x.com', subject: 'Hi', text: 'x' }, /not an email address/);
  const r = checkMailArgs('send_email', { reply_to: 'INBOX:9', text: 'Thanks!' }) as { replyTo: unknown; to: string[] };
  assert.deepEqual(r.replyTo, { folder: 'INBOX', uid: 9 });
  assert.deepEqual(r.to, []);
  // A draft may be unfinished.
  assert.doesNotThrow(() => checkMailArgs('save_draft', { text: 'Notes for later' }));
});

await ok('addresses: lists, names with commas, and nothing else', () => {
  assert.deepEqual(addressList('anna@x.com, "Lee, Kim" <kim@y.org>; bo@z.net'), ['anna@x.com', '"Lee, Kim" <kim@y.org>', 'bo@z.net']);
  assert.deepEqual(addressList(['Anna <anna@x.com>']), ['Anna <anna@x.com>']);
  assert.deepEqual(addressList(undefined), []);
  assert.throws(() => addressList('anna@'), /not an email address/);
});

await ok('the tools that send or delete say so in their names, descriptions and hints', () => {
  const infos = mailToolInfos();
  const by = Object.fromEntries(infos.map((t) => [t.name, t]));
  assert.deepEqual(infos.map((t) => t.name), ['list_folders', 'search_email', 'read_email', 'save_attachments', 'mark_email', 'move_email', 'save_draft', 'send_email', 'delete_email']);
  for (const n of ['list_folders', 'search_email', 'read_email']) assert.equal(by[n].annotations.readOnlyHint, true, n);
  assert.equal(by.send_email.annotations.openWorldHint, true);
  assert.match(by.send_email.description, /^Sends an email now/);
  assert.equal(by.delete_email.annotations.destructiveHint, true);
  assert.match(by.delete_email.description, /^Deletes emails/);
  assert.match(by.save_draft.description, /Nothing is sent/);
  assert.match(by.move_email.description, /does not move to the bin/);
  for (const t of infos) assert.equal((t.inputSchema as { type: string }).type, 'object');
});

await ok('file names from an email cannot leave their folder', () => {
  assert.equal(safeName('../../etc/passwd'), 'passwd');
  assert.equal(safeName('C:\\Users\\x\\a<b>.pdf'), 'a_b_.pdf');
  assert.equal(safeName('.hidden'), '_hidden');
  assert.equal(safeName(''), 'attachment');
  const dir = path.join(tmp, 'att');
  const [a] = writeAttachments(dir, [{ filename: 'r.pdf', content: Buffer.from('1') }]);
  const [b] = writeAttachments(dir, [{ filename: 'r.pdf', content: Buffer.from('2') }]);
  assert.equal(path.basename(a), 'r.pdf');
  assert.equal(path.basename(b), 'r (2).pdf');
  assert.equal(fs.readFileSync(a, 'utf8'), '1');
});

// ---- the MCP server, with an account saved (its servers are never reached here) ----
const entry = catalogApp('email');
assert.ok(entry, 'catalog/connections/email.json is in the catalog');
saveAccount(db, { address: 'me@example.com', username: 'me@example.com', imap: { host: '127.0.0.1', port: 9, security: 'none' }, smtp: { host: '127.0.0.1', port: 9, security: 'none' } }, 'an-app-password-1234');
const conn = { id: 'email', entry: entry!, enabled: true, status: 'ok', fields: {}, hasCred: true, prefs: {}, createdAt: 0, updatedAt: 0 } as unknown as Conn;
const sessionDir = path.join(tmp, 'session');
fs.mkdirSync(sessionDir);
fs.writeFileSync(path.join(sessionDir, 'note.txt'), 'hi');
const deps = { db, sessions: { summary: (k: string) => (k === 'k1' ? { cwd: sessionDir } : undefined) } } as unknown as Deps;

await ok('accounts: found by address, id or name; the password sealed, shown masked', () => {
  const [v] = accountViews(db);
  assert.equal(v.address, 'me@example.com');
  assert.match(v.hint, /1234$/);
  assert.ok(!JSON.stringify(v).includes('an-app-password'));
  assert.equal(findAccount(db).address, 'me@example.com');
  assert.equal(findAccount(db, 'ME@example.com').id, v.id);
  assert.throws(() => findAccount(db, 'other@example.com'), /no connected mail account “other@example.com”.*me@example\.com/);
  const raw = JSON.stringify(db.prepare('select * from conn_apps').all());
  assert.ok(!raw.includes('an-app-password'), 'the password is not stored in the clear');
});

await ok('the MCP server introduces itself and lists the tools, naming the accounts', async () => {
  const r = await viaBuiltin(deps, conn, { runId: 'r1', key: 'k1' }, [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'nope' },
  ]);
  assert.equal(r.replies.length, 3);
  assert.equal(r.replies[0].result.protocolVersion, '2025-03-26');
  const tools = r.replies[1].result.tools as { name: string; inputSchema: { properties: { account?: { description: string } } } }[];
  assert.equal(tools.length, 9);
  assert.match(tools.find((t) => t.name === 'send_email')!.inputSchema.properties.account!.description, /me@example\.com/);
  assert.equal(r.replies[2].error!.code, -32601);
});

await ok('calls with bad arguments are refused in plain words before anything is reached', async () => {
  const r = await callBuiltin(deps, conn, 'send_email', { to: 'nobody', subject: 'x', text: 'y' }, { key: 'k1' });
  assert.equal(r.isError, true);
  assert.match((r.content[0] as { text: string }).text, /“nobody” in to is not an email address/);
  const u = await callBuiltin(deps, conn, 'format_disk', {}, { key: 'k1' });
  assert.match((u.content[0] as { text: string }).text, /There is no email tool format_disk/);
});

await ok('files to attach must be in the session’s folder', async () => {
  const outside = path.join(tmp, 'secret.txt');
  fs.writeFileSync(outside, 'secret');
  const r = await runMailTool({ db, cwd: sessionDir }, 'send_email', { to: 'a@example.org', subject: 's', text: 't', attachments: [outside] });
  assert.equal(r.isError, true);
  assert.match(r.text, /must be in the session’s folder/);
  const missing = await runMailTool({ db, cwd: sessionDir }, 'save_draft', { text: 't', attachments: ['nope.pdf'] });
  assert.match(missing.text, /There is no file nope\.pdf/);
});

await ok('removing the last account takes the connection with it', () => {
  removeAccount(db, findAccount(db).id);
  assert.equal(accountViews(db).length, 0);
  assert.equal((db.prepare("select count(*) as n from conn_apps where id = 'email'").get() as { n: number }).n, 0);
  assert.throws(() => findAccount(db), /No mail account is connected/);
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed`);
