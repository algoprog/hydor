// Script tests for spaces: a new space gets a folder of its own (or uses one given), its fields are cleaned,
// its sessions are counted, it can leave the shared knowledge out, and a session in it is told its instructions. Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/spaces/spaces-test.ts
//   DATA_DIR=/tmp/naget-test-spaces node dist/dev/spaces-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setSettings } from '../assistants/store.ts';
import { openDb } from '../db.ts';
import { registerFeatures, spawnAdditions } from '../features/registry.ts';
import type { Deps } from '../features/types.ts';
import { setSessionExtra } from '../sessionExtra.ts';
import { createSpace, deleteSpace, sessionsIn, spaceById, spaces, spaceViews, updateSpace } from './index.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'naget-spaces-test-'));
const db = openDb(path.join(tmp, 'test.db'));
setSettings(db, { taskRoot: path.join(tmp, 'Naget') });
registerFeatures([spaces], { db, app: { get() {}, post() {}, patch() {}, delete() {} } } as unknown as Deps);
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

test('a new space gets a folder of its own, named for it, and the next colour', () => {
  const a = createSpace(db, { name: '  Taxes 2026 ', instructions: 'Amounts in EUR. I am self-employed in Greece.' });
  assert.equal(a.name, 'Taxes 2026');
  assert.equal(a.folder, path.join(tmp, 'Naget', 'Spaces', 'taxes-2026'));
  assert.ok(fs.statSync(a.folder).isDirectory());
  const b = createSpace(db, { name: 'Taxes 2026' });
  assert.equal(b.folder, path.join(tmp, 'Naget', 'Spaces', 'taxes-2026-2'));
  assert.notEqual(a.color, b.color);
  assert.throws(() => createSpace(db, { name: '   ' }), /Give the space a name/);
  assert.throws(() => createSpace(db, { name: 'X', folder: path.join(tmp, 'nowhere') }), /No folder at/);
  const own = createSpace(db, { name: 'Thesis', folder: tmp, color: 'violet' });
  assert.equal(own.folder, tmp);
  assert.equal(own.color, 'violet');
});

test('changing a space keeps what was not given; its sessions are counted, the last at work first', () => {
  const [a] = spaceViews(db);
  const next = updateSpace(db, a.id, { description: 'Receipts and the yearly return', assistant: 'researcher' });
  assert.equal(next.instructions, 'Amounts in EUR. I am self-employed in Greece.');
  assert.equal(next.assistant, 'researcher');
  assert.equal(updateSpace(db, a.id, { assistant: '' }).assistant, undefined);
  for (const [k, at] of [['claude:t1', 1], ['claude:t2', 3], ['codex:t3', 2]] as const) {
    db.prepare('insert into app_sessions (key, agent, created_at, updated_at) values (?, ?, ?, ?)').run(k, k.split(':')[0], at, at);
    setSessionExtra(db, k, { space: a.id });
    db.prepare('update app_sessions set updated_at = ? where key = ?').run(at, k);
  }
  assert.deepEqual(sessionsIn(db, a.id), ['claude:t2', 'codex:t3', 'claude:t1']);
  const v = spaceViews(db).find((x) => x.id === a.id)!;
  assert.equal(v.sessions, 3);
  assert.equal(v.lastAt, 3);
});

test('a space searches the shared knowledge too unless it leaves it out; changing something else keeps that', () => {
  const g = createSpace(db, { name: 'Garden' });
  assert.equal(g.sharedKnowledge, undefined);
  assert.equal(updateSpace(db, g.id, { sharedKnowledge: false }).sharedKnowledge, false);
  assert.equal(updateSpace(db, g.id, { description: 'Vegetables' }).sharedKnowledge, false);
  assert.equal(updateSpace(db, g.id, { sharedKnowledge: true }).sharedKnowledge, undefined);
  assert.equal(spaceViews(db).find((x) => x.id === g.id)!.docs, 0);
  deleteSpace(db, g.id);
});

test('a session in a space is told what it is, where its files go, and its instructions', async () => {
  const [a] = spaceViews(db);
  const add = await spawnAdditions({ agent: 'claude', key: 'claude:t9', cwd: a.folder, runId: 'r', resume: false, extra: { space: a.id } });
  const text = add.instructions.join('\n');
  assert.match(text, /^# Space: Taxes 2026\n/);
  assert.match(text, /\(Receipts and the yearly return\)/);
  assert.ok(text.includes(a.folder));
  assert.match(text, /Amounts in EUR/);
  assert.deepEqual((await spawnAdditions({ agent: 'claude', key: 'claude:x', cwd: tmp, runId: 'r', resume: false, extra: {} })).instructions, []);
});

test('deleting a space keeps its folder and sessions', () => {
  const [a] = spaceViews(db);
  deleteSpace(db, a.id);
  assert.equal(spaceById(db, a.id), null);
  assert.ok(fs.existsSync(a.folder));
  assert.equal(sessionsIn(db, a.id).length, 3);
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.log(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
}
console.log(`\n${passed}/${tests.length} passed`);
fs.rmSync(tmp, { recursive: true, force: true });
