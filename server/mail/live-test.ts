// Script tests for email against a real mail server on this computer (GreenMail, a throwaway test server): signing in
// (and the plain words for a wrong password or a closed port), sending with an attachment and a copy in Sent, every
// tool, a reply that joins its thread, and the New email watcher (first look, one run per email, never twice). Not part
// of `npm test` (it needs the server); start one, then run this:
//   docker run -d --rm --name hydor-mail-test -p 127.0.0.1:3893:3993 -p 127.0.0.1:3865:3465 \
//     -e GREENMAIL_OPTS='-Dgreenmail.setup.test.all -Dgreenmail.hostname=0.0.0.0 -Dgreenmail.users.login=email
//       -Dgreenmail.users=me:app-pass-1234@example.com,anna:anna-pass-5678@example.org' greenmail/standalone:2.1.3
//   MAIL_TEST=127.0.0.1:3893:3865 node scripts/test.mjs mail/live      (then: docker stop hydor-mail-test)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appTables } from '../connections/apps.ts';
import { useMaskDb, vaultTables } from '../connections/vault.ts';
import { openDb } from '../db.ts';
import { findAccount, mailTables, saveAccount, type AccountInput } from './accounts.ts';
import { closeAll, testImap, withImap } from './imap.ts';
import { sendMail, testSmtp } from './send.ts';
import { runMailTool } from './tools.ts';
import { checkMail, type MailWatchState } from './watch.ts';

const spec = process.env.MAIL_TEST;
if (!spec) {
  console.error('Needs a test mail server: see the top of server/mail/live-test.ts (MAIL_TEST=host:imapsPort:smtpsPort).');
  process.exit(1);
}
const [host, imapPort, smtpPort] = spec.split(':');

let passed = 0;
const ok = async (name: string, f: () => void | Promise<void>) => {
  await f();
  passed++;
  console.log(`ok - ${name}`);
};

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-mail-live-test-')));
const db = openDb(path.join(tmp, 'test.db'));
vaultTables(db);
appTables(db);
mailTables(db);
useMaskDb(db);
const session = path.join(tmp, 'session');
const taskDir = path.join(tmp, 'task');
fs.mkdirSync(session);
fs.mkdirSync(taskDir);
fs.writeFileSync(path.join(session, 'report.txt'), 'The weekly report.\n');

const servers = (user: string): AccountInput => ({
  address: user,
  username: user,
  imap: { host, port: Number(imapPort), security: 'tls' },
  smtp: { host, port: Number(smtpPort), security: 'tls' },
});
const ctx = { db, cwd: session };
const tool = async (name: string, args: Record<string, unknown>) => {
  const r = await runMailTool(ctx, name, args);
  if (r.isError) throw new Error(`${name}: ${r.text}`);
  return r.text;
};
const first = (text: string, folder = 'INBOX') => new RegExp(`\\[(${folder.replace(/[[\]]/g, '\\$&')}:\\d+)\\]`).exec(text)?.[1] ?? '';

await ok('signing in: a wrong password and a closed port in plain words, the right one works both ways', async () => {
  const me = { id: 't', ...servers('me@example.com'), status: 'untested' as const, createdAt: 0, updatedAt: 0 };
  await assert.rejects(testImap(me, 'wrong'), /Wrong password or user name/);
  await assert.rejects(testSmtp(me, 'wrong'), /Wrong password or user name|did not accept/);
  await assert.rejects(testImap({ ...me, imap: { host, port: 1, security: 'tls' } }, 'x'), /refused the connection/);
  assert.ok((await testImap(me, 'app-pass-1234')) >= 1);
  await testSmtp(me, 'app-pass-1234');
});

saveAccount(db, { ...servers('me@example.com'), name: 'Me Myself' }, 'app-pass-1234');
saveAccount(db, servers('anna@example.org'), 'anna-pass-5678');
const me = findAccount(db, 'me@example.com');
const anna = findAccount(db, 'anna@example.org');
for (const a of [me, anna])
  await withImap(db, a, async (c) => {
    for (const f of ['Sent', 'Drafts', 'Trash', 'Archive']) await c.mailboxCreate(f).catch(() => {});
  });

let watch: MailWatchState;
const w = { kind: 'mail' as const, account: 'me@example.com' };

await ok('the watcher’s first look only takes note', async () => {
  const r = await checkMail(db, w, undefined, { cwd: taskDir });
  assert.equal(r.runs.length, 0);
  assert.match(r.note, /first look/);
  watch = r.state;
});

await ok('sendMail sends with an attachment and keeps a copy in Sent', async () => {
  const r = await sendMail('anna@example.org', { to: 'Me <me@example.com>', subject: 'Invoice 1042', text: 'Please find the invoice attached.\nAnna', attachments: [{ filename: 'invoice.pdf', content: Buffer.from('%PDF-1.4 fake') }] }, { db });
  assert.deepEqual(r.accepted, ['me@example.com']);
  assert.equal(r.savedTo, 'Sent');
  await new Promise((res) => setTimeout(res, 800));
  const sent = await runMailTool({ db }, 'search_email', { account: 'anna@example.org', folder: 'Sent' });
  assert.match(sent.text, /Invoice 1042/);
});

await ok('the watcher starts one run for the new email, with its attachment saved, and not again', async () => {
  const r = await checkMail(db, w, JSON.parse(JSON.stringify(watch)), { cwd: taskDir });
  assert.equal(r.runs.length, 1);
  assert.match(r.runs[0].report, /From: anna@example\.org/);
  assert.match(r.runs[0].report, /Subject: Invoice 1042/);
  assert.match(r.runs[0].report, /Please find the invoice attached/);
  assert.match(r.runs[0].report, /invoice\.pdf \(\d+ B\), saved as .*email-attachments/);
  const saved = fs.readdirSync(path.join(taskDir, 'email-attachments'));
  assert.equal(saved.length, 1);
  assert.equal(fs.readFileSync(path.join(taskDir, 'email-attachments', saved[0], 'invoice.pdf'), 'utf8'), '%PDF-1.4 fake');
  watch = r.state;
  const again = await checkMail(db, w, JSON.parse(JSON.stringify(watch)), { cwd: taskDir });
  assert.equal(again.runs.length, 0);
});

let id = '';
await ok('folders, search and read (it stays unread)', async () => {
  assert.match(await tool('list_folders', {}), /INBOX: 1 email, 1 unread/);
  // GreenMail matches whole addresses only (real servers match any part, as IMAP says).
  const found = await tool('search_email', { from: 'anna@example.org', has_attachments: true });
  id = first(found);
  assert.ok(id, found);
  assert.match(found, /unread, 1 attachment/);
  const read = await tool('read_email', { id });
  assert.match(read, /Subject: Invoice 1042/);
  assert.match(read, /Attachments \(1\): invoice\.pdf \(application\/pdf/);
  assert.match(read, /<email-text>\nPlease find the invoice attached/);
  assert.match(await tool('search_email', { unread: true }), /Invoice 1042/);
  assert.match(await tool('search_email', { subject: 'nothing like this' }), /No email in INBOX matches subject/);
});

await ok('save the attachments into the session’s folder', async () => {
  const r = await tool('save_attachments', { id });
  assert.match(r, /Saved 1 attachment/);
  assert.equal(fs.readFileSync(path.join(session, 'email-attachments', 'invoice.pdf'), 'utf8'), '%PDF-1.4 fake');
});

await ok('mark read and flagged', async () => {
  assert.match(await tool('mark_email', { ids: [id], read: true, flagged: true }), /Marked 1 email as read and flagged/);
  assert.match(await tool('search_email', { flagged: true }), /Invoice 1042 · flagged/);
  assert.match(await tool('search_email', { unread: true }), /No email/);
});

await ok('a reply joins the thread, goes to the sender, and the email is marked replied', async () => {
  const r = await tool('send_email', { reply_to: id, text: 'Thanks, paid today.', attachments: ['report.txt'] });
  assert.match(r, /Sent from me@example\.com to anna@example\.org: “Re: Invoice 1042”, 1 attachment\. A copy is in Sent\./);
  await new Promise((res) => setTimeout(res, 800));
  const inAnna = await runMailTool({ db }, 'search_email', { account: 'anna@example.org', subject: 'Re: Invoice' });
  const replyId = first(inAnna.text);
  assert.ok(replyId, inAnna.text);
  const raw = await withImap(db, anna, async (c) => {
    const lock = await c.getMailboxLock('INBOX', { readOnly: true });
    try {
      const m = await c.fetchOne(replyId.split(':')[1], { source: true }, { uid: true });
      return m ? m.source!.toString() : '';
    } finally {
      lock.release();
    }
  });
  assert.match(raw, /In-Reply-To: <[^>]+@example\.org>/);
  assert.match(raw, /From: "?Me Myself"? <me@example\.com>/);
  assert.match(await tool('search_email', {}), /Invoice 1042 · flagged, replied/);
});

await ok('a draft goes to Drafts, nothing sent', async () => {
  assert.match(await tool('save_draft', { to: 'anna@example.org', subject: 'Later', text: 'Draft text' }), /Saved a draft in Drafts of me@example\.com .*Nothing was sent/);
  assert.match(await tool('search_email', { folder: 'Drafts' }), /Later/);
});

await ok('move to a folder; never to the bin', async () => {
  const moved = await tool('move_email', { ids: [id], to: 'archive' });
  assert.match(moved, /Moved 1 email to Archive/);
  await assert.rejects(runMailTool(ctx, 'move_email', { ids: ['Archive:1'], to: 'Trash' }).then((r) => (r.isError ? Promise.reject(new Error(r.text)) : r)), /delete_email does that/);
  id = first(await tool('search_email', { folder: 'Archive' }), 'Archive');
  assert.ok(id);
});

await ok('delete: to the bin first, then for good', async () => {
  assert.match(await tool('delete_email', { ids: [id] }), /Moved 1 email to Trash/);
  const inTrash = first(await tool('search_email', { folder: 'Trash' }), 'Trash');
  assert.match(await tool('delete_email', { ids: [inTrash] }), /Deleted 1 email for good/);
  assert.match(await tool('search_email', { folder: 'Trash' }), /No email in Trash/);
});

await ok('a password never shows in what tools say', async () => {
  const r = await runMailTool(ctx, 'list_folders', { account: 'nobody@example.com' });
  assert.ok(!r.text.includes('app-pass-1234'));
});

closeAll();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed`);
setTimeout(() => process.exit(0), 200).unref();
