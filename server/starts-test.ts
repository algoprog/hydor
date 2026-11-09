// Script test for starts sent from the page (SessionManager.startOnce): one session per start, however often the
// start is sent (its answer lost on the way, a phone that slept), and what the page is told when it asks after one.
// Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/starts-test.ts
//   DATA_DIR=/tmp/hydor-test-starts node dist/dev/starts-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from './db.ts';
import { SessionManager } from './sessions.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-starts-test-'));
const db = openDb(path.join(tmp, 'test.db'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

/** The manager's start bookkeeping alone, on a real database: making a session is `make`'s part. */
type Starts = Pick<SessionManager, 'startOnce' | 'startState'>;
function manager(): Starts {
  const proto = SessionManager.prototype as any;
  const m: any = { db, starts: new Map(), startedBy: proto.startedBy };
  return { startOnce: proto.startOnce.bind(m), startState: proto.startState.bind(m) };
}

let n = 0;
/** Makes a session as create() does (its row), after `ms`; `fail` makes it fail instead. */
function maker(o: { ms?: number; fail?: string } = {}) {
  const made: string[] = [];
  const make = async () => {
    await new Promise((r) => setTimeout(r, o.ms ?? 5));
    if (o.fail) throw new Error(o.fail);
    const key = `claude:test-${++n}`;
    db.prepare('insert into app_sessions (key, agent, cwd, created_at, updated_at) values (?, ?, ?, ?, ?)').run(key, 'claude', tmp, Date.now(), Date.now());
    made.push(key);
    return key;
  };
  return { make, made };
}

test('the database has the start column and its index', () => {
  const cols = (db.prepare('pragma table_info(app_sessions)').all() as { name: string }[]).map((c) => c.name);
  assert.ok(cols.includes('start_id'));
  const plan = db.prepare("explain query plan select key from app_sessions where start_id = 'new-abcdefgh'").all() as { detail: string }[];
  assert.ok(plan.some((p) => /app_sessions_start_id/.test(p.detail)), JSON.stringify(plan));
});

test('a start sent once makes one session, and is known after', async () => {
  const m = manager();
  const { make, made } = maker();
  assert.deepEqual(m.startState('new-once0001'), { key: null, starting: false });
  const going = m.startOnce('new-once0001', make);
  assert.deepEqual(m.startState('new-once0001'), { key: null, starting: true });
  const key = await going;
  assert.deepEqual(made, [key]);
  assert.deepEqual(m.startState('new-once0001'), { key, starting: false });
});

test('the same start sent again while it is being made waits for the same session', async () => {
  const m = manager();
  const { make, made } = maker({ ms: 40 });
  const [a, b, c] = await Promise.all([m.startOnce('new-twice001', make), m.startOnce('new-twice001', make), m.startOnce('new-twice001', make)]);
  assert.equal(made.length, 1);
  assert.equal(a, made[0]);
  assert.equal(b, a);
  assert.equal(c, a);
});

test('the same start sent again after it was made gets that session', async () => {
  const m = manager();
  const { make, made } = maker();
  const first = await m.startOnce('new-after001', make);
  const again = await m.startOnce('new-after001', make);
  assert.equal(again, first);
  assert.equal(made.length, 1);
});

test('a server restarted since still knows the start (it is kept with the session)', async () => {
  const { make, made } = maker();
  const first = await manager().startOnce('new-restart1', make);
  const later = manager();
  assert.deepEqual(later.startState('new-restart1'), { key: first, starting: false });
  assert.equal(await later.startOnce('new-restart1', make), first);
  assert.equal(made.length, 1);
});

test('a start that failed can be sent again, and both waiting on it hear why', async () => {
  const m = manager();
  const bad = maker({ ms: 20, fail: 'No such folder' });
  const tries = [m.startOnce('new-failed01', bad.make), m.startOnce('new-failed01', bad.make)];
  for (const t of tries) await assert.rejects(t, /No such folder/);
  assert.deepEqual(m.startState('new-failed01'), { key: null, starting: false });
  const good = maker();
  const key = await m.startOnce('new-failed01', good.make);
  assert.deepEqual(good.made, [key]);
});

test('different starts make different sessions, and none without an id is kept', async () => {
  const m = manager();
  const { make, made } = maker();
  const a = await m.startOnce('new-differ01', make);
  const b = await m.startOnce('new-differ02', make);
  const c = await m.startOnce(undefined, make);
  const d = await m.startOnce(undefined, make);
  assert.equal(new Set([a, b, c, d]).size, 4);
  assert.equal(made.length, 4);
  const kept = db.prepare('select count(*) as n from app_sessions where key in (?, ?) and start_id is not null').get(c, d) as { n: number };
  assert.equal(kept.n, 0);
});

test('a message sent again with its id goes once, whether the first is still going or went; a failed one can be sent again', async () => {
  const proto = SessionManager.prototype as any;
  const m: any = { sends: new Map() };
  const sendOnce: SessionManager['sendOnce'] = proto.sendOnce.bind(m);
  let sent = 0;
  const send = async () => {
    await new Promise((r) => setTimeout(r, 5));
    sent++;
  };
  await Promise.all([sendOnce('send-same0001', send), sendOnce('send-same0001', send)]);
  await sendOnce('send-same0001', send);
  assert.equal(sent, 1, 'once');
  await sendOnce('send-other001', send);
  await sendOnce(undefined, send);
  await sendOnce(undefined, send);
  assert.equal(sent, 4, 'other ids and none each go');
  await assert.rejects(sendOnce('send-failed01', () => Promise.reject(new Error('cap reached'))), /cap reached/);
  await sendOnce('send-failed01', send);
  assert.equal(sent, 5, 'a failed one goes when sent again');
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n`, e);
    process.exitCode = 1;
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed}/${tests.length} passed`);
