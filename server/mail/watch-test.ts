// Script tests for the New email watcher (watch.ts) over a fake mailbox: its first look only takes note; new mail starts
// one run per email, in order, never twice (also when what it kept is read back as JSON, as after a restart); filters
// count; at most ten runs a look with the older rest summed up in a line; a renumbered folder starts afresh; mail that
// fails to start is found again; attachments go to the task's folder under safe names. Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/mail/watch-test.ts
//   DATA_DIR=/tmp/hydor-test-mail-watch node dist/dev/watch-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkBox, MAX_RUNS, type EmailData, type MailWatchSpec, type MailWatchState, type WatchBox } from './watch.ts';

let passed = 0;
const ok = async (name: string, f: () => void | Promise<void>) => {
  await f();
  passed++;
  console.log(`ok - ${name}`);
};

interface FakeMail extends EmailData {
  uid: number;
  seen?: boolean;
}

/** A folder held in memory, numbered as IMAP numbers it. */
class FakeBox implements WatchBox {
  mails: FakeMail[] = [];
  uidValidity = '1700000001';
  uidNext = 1;
  asked: { after: number; w: MailWatchSpec }[] = [];
  add(m: Partial<FakeMail> = {}) {
    const uid = this.uidNext++;
    this.mails.push({ uid, from: m.from ?? `Sender ${uid} <s${uid}@example.org>`, to: 'me@example.com', subject: m.subject ?? `Message ${uid}`, text: m.text ?? `Hello ${uid}`, attachments: m.attachments ?? [], date: new Date(2026, 10, 15, 9, uid % 60), seen: m.seen });
    return uid;
  }
  async status() {
    return { uidValidity: this.uidValidity, uidNext: this.uidNext, exists: this.mails.length };
  }
  private match(m: FakeMail, w: MailWatchSpec) {
    return (!w.from || m.from.toLowerCase().includes(w.from.toLowerCase())) && (!w.subject || m.subject.toLowerCase().includes(w.subject.toLowerCase())) && (!w.unread || !m.seen);
  }
  async newUids(after: number, w: MailWatchSpec) {
    this.asked.push({ after, w });
    // As IMAP answers "n:*": the highest message even when none is above n.
    const hits = this.mails.filter((m) => m.uid > after && this.match(m, w)).map((m) => m.uid);
    return hits.length ? hits : this.mails.length ? [this.mails[this.mails.length - 1].uid] : [];
  }
  async email(uid: number) {
    return this.mails.find((m) => m.uid === uid) ?? null;
  }
  async latest(n: number, w: MailWatchSpec) {
    return this.mails.filter((m) => this.match(m, w)).slice(-n).reverse().map((m) => `[INBOX:${m.uid}] ${m.subject}`);
  }
}

const w: MailWatchSpec = { kind: 'mail', account: 'me@example.com' };
const roundTrip = (s: MailWatchState) => JSON.parse(JSON.stringify(s)) as MailWatchState;
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-mail-watch-test-')));

await ok('the first look only takes note of where the folder is', async () => {
  const box = new FakeBox();
  for (let i = 0; i < 5; i++) box.add();
  const r = await checkBox(box, w, undefined, { folder: 'INBOX' });
  assert.equal(r.changed, false);
  assert.equal(r.runs.length, 0);
  assert.deepEqual(r.state, { v: '1700000001', last: 5 });
  assert.match(r.note, /first look/);
  assert.match(r.sample, /Message 5/);
});

await ok('new mail starts one run per email, in order, and never twice', async () => {
  const box = new FakeBox();
  box.add();
  let st = (await checkBox(box, w, undefined, { folder: 'INBOX' })).state;
  const a = box.add({ subject: 'Invoice 1042', from: 'Billing <billing@shop.example>' });
  const b = box.add({ subject: 'Lunch?' });
  const r = await checkBox(box, w, roundTrip(st), { folder: 'INBOX' });
  assert.equal(r.changed, true);
  assert.equal(r.runs.length, 2);
  assert.match(r.runs[0].report, /Invoice 1042/);
  assert.match(r.runs[0].report, new RegExp(`INBOX:${a}`));
  assert.match(r.runs[0].report, /From: Billing <billing@shop\.example>/);
  assert.match(r.runs[1].report, /Lunch\?/);
  // Each run's state moves past its own email only, so a restart mid-way starts the rest, not these.
  assert.deepEqual(r.runs.map((x) => x.state.last), [a, b]);
  st = r.state;
  assert.equal(st.last, b);
  // The next look, and one after a restart (the state read back), find nothing new.
  const again = await checkBox(box, w, roundTrip(st), { folder: 'INBOX' });
  assert.equal(again.runs.length, 0);
  assert.equal(again.changed, false);
  assert.match(again.note, /nothing new/);
  assert.equal(box.asked.at(-1)!.after, b);
});

await ok('a run that could not start leaves its email to the next look', async () => {
  const box = new FakeBox();
  const st = (await checkBox(box, w, undefined, { folder: 'INBOX' })).state;
  box.add();
  box.add();
  const r = await checkBox(box, w, st, { folder: 'INBOX' });
  // The scheduler keeps the first run's state when the second fails to start.
  const kept = r.runs[0].state;
  const next = await checkBox(box, w, roundTrip(kept), { folder: 'INBOX' });
  assert.equal(next.runs.length, 1);
  assert.match(next.runs[0].report, /Message 2/);
});

await ok('filters: from, subject and unread are asked of the server and only matching mail starts runs', async () => {
  const box = new FakeBox();
  const f: MailWatchSpec = { ...w, from: 'shop.example', subject: 'invoice', unread: true };
  const st = (await checkBox(box, f, undefined, { folder: 'INBOX' })).state;
  box.add({ from: 'Billing <billing@shop.example>', subject: 'Invoice 1', seen: true });
  box.add({ from: 'Friend <f@example.org>', subject: 'Invoice from me' });
  const hit = box.add({ from: 'Billing <billing@shop.example>', subject: 'Your invoice 2' });
  const r = await checkBox(box, f, st, { folder: 'INBOX' });
  assert.equal(r.runs.length, 1);
  assert.match(r.runs[0].report, new RegExp(`INBOX:${hit}`));
  assert.deepEqual(box.asked.at(-1)!.w, f);
  // Mail that did not match is passed over for good: the state moves past it.
  assert.equal(r.state.last, hit);
});

await ok(`at most ${MAX_RUNS} runs a look: the newest, the older rest summed up in a line`, async () => {
  const box = new FakeBox();
  const st = (await checkBox(box, w, undefined, { folder: 'INBOX' })).state;
  for (let i = 0; i < MAX_RUNS + 4; i++) box.add();
  const r = await checkBox(box, w, st, { folder: 'INBOX' });
  assert.equal(r.runs.length, MAX_RUNS);
  assert.match(r.runs[0].report, /Message 5\b/);
  assert.match(r.runs[0].report, /4 older new emails came in too/);
  assert.match(r.runs[0].report, /INBOX:1 from/);
  assert.match(r.runs.at(-1)!.report, /Message 14\b/);
  assert.equal(r.state.last, MAX_RUNS + 4);
  assert.match(r.note, /14 new emails: a run for each of the newest 10, the 4 older summed up/);
  // None of them comes back.
  assert.equal((await checkBox(box, w, r.state, { folder: 'INBOX' })).runs.length, 0);
});

await ok('a folder the server renumbered (new UIDVALIDITY) starts afresh without runs', async () => {
  const box = new FakeBox();
  box.add();
  const st = (await checkBox(box, w, undefined, { folder: 'INBOX' })).state;
  box.uidValidity = '1800000000';
  box.add();
  const r = await checkBox(box, w, st, { folder: 'INBOX' });
  assert.equal(r.runs.length, 0);
  assert.match(r.note, /renumbered/);
  assert.deepEqual(r.state, { v: '1800000000', last: 2 });
});

await ok('attachments are saved in the task’s folder, under safe names, never over a file', async () => {
  const box = new FakeBox();
  const st = (await checkBox(box, w, undefined, { folder: 'INBOX' })).state;
  box.add({ subject: 'Scan: report/Q3', attachments: [{ filename: '../../evil.sh', content: Buffer.from('x'), size: 1 }, { filename: 'report.pdf', content: Buffer.from('%PDF'), size: 4 }] });
  const r = await checkBox(box, w, st, { folder: 'INBOX', cwd: tmp });
  const dir = path.join(tmp, 'email-attachments');
  const [sub] = fs.readdirSync(dir);
  assert.match(sub, /Scan_ report_Q3 \(1\)$/);
  assert.deepEqual(fs.readdirSync(path.join(dir, sub)).sort(), ['evil.sh', 'report.pdf']);
  assert.match(r.runs[0].report, new RegExp(`report\\.pdf \\(4 B\\), saved as ${path.join(dir, sub, 'report.pdf').replace(/[.()]/g, '\\$&')}`));
  // A Test (no folder given) saves nothing.
  const box2 = new FakeBox();
  const st2 = (await checkBox(box2, w, undefined, { folder: 'INBOX' })).state;
  box2.add({ attachments: [{ filename: 'a.txt', content: Buffer.from('a'), size: 1 }] });
  const r2 = await checkBox(box2, w, st2, { folder: 'INBOX' });
  assert.match(r2.runs[0].report, /Attachments: a\.txt \(1 B\)$/m);
});

await ok('a long email is cut, and says where the rest is', async () => {
  const box = new FakeBox();
  const st = (await checkBox(box, w, undefined, { folder: 'INBOX' })).state;
  box.add({ text: 'x'.repeat(20_000) });
  const r = await checkBox(box, w, st, { folder: 'INBOX' });
  assert.ok(r.runs[0].report.length < 9000);
  assert.match(r.runs[0].report, /12000 more characters: read_email gives the rest/);
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed`);
