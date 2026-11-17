// Script test for deleting a session (SessionManager.remove): it stays deleted. The methods that make a session's own
// row when it has none (marking it read, pinning, renaming, ordering, linking a pull request) used to bring a deleted
// session back to the list when they ran just after the delete (a page still open on it, a pull request check on its
// way); now they do nothing for a session that is not there, and still work for one that is.
// Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/sessions-delete-test.ts
//   DATA_DIR=/tmp/hydor-test-delete CLAUDE_CONFIG_DIR=/tmp/hydor-test-delete/claude CODEX_HOME=/tmp/hydor-test-delete/codex node dist/dev/sessions-delete-test.js
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from './db.ts';
import { SessionManager } from './sessions.ts';
import type { PullRequestInfo } from '../shared/types.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-delete-test-'));
const db = openDb(path.join(tmp, 'test.db'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

type Emitted = [string, ...unknown[]];

/** The manager's own methods on a real database, with a stand-in for the rest; transcripts live in the scratch folder. */
function manager() {
  const proto = SessionManager.prototype as any;
  const emitted: Emitted[] = [];
  const m: any = {
    db,
    lives: new Map(),
    external: { get: () => null },
    timelines: new Map(),
    queues: new Map(),
    loadQueues: () => {},
    dropQueued: () => {},
    queueSummary: () => {},
    // The sessions waiting on a project's memory question (none here).
    gates: new Map(),
    saveGates: () => {},
    emit: (...args: Emitted) => {
      emitted.push(args);
      return true;
    },
    codex: { deleteThread: async () => {}, setThreadName: async () => {} },
    // Not under any agent's own folder, so the app's kept link and the agents' temp folders are not involved.
    transcriptFor: (key: string) => path.join(tmp, 'transcripts', `${key.replace(/^\w+:/, '')}.jsonl`),
  };
  m.exists = proto.exists.bind(m);
  return {
    emitted,
    remove: proto.remove.bind(m) as SessionManager['remove'],
    markSeen: proto.markSeen.bind(m) as SessionManager['markSeen'],
    setFlags: proto.setFlags.bind(m) as SessionManager['setFlags'],
    rename: proto.rename.bind(m) as SessionManager['rename'],
    setOrder: proto.setOrder.bind(m) as SessionManager['setOrder'],
    setPr: proto.setPr.bind(m) as SessionManager['setPr'],
    lives: m.lives as Map<string, unknown>,
    transcriptFor: m.transcriptFor as (key: string) => string,
  };
}

const appRow = (key: string) => db.prepare('select * from app_sessions where key = ?').get(key) as Record<string, any> | undefined;
const indexedRow = (key: string) => db.prepare('select * from sessions where key = ?').get(key);

const pr: PullRequestInfo = { provider: 'github', url: 'https://github.com/o/r/pull/1', number: 1, title: 'A change', state: 'open', repo: 'o/r' };

/** A session started here: its app row and a transcript in the scratch folder. */
function startedHere(m: ReturnType<typeof manager>) {
  const key = `claude:${crypto.randomUUID()}`;
  db.prepare('insert into app_sessions (key, agent, cwd, created_at, updated_at) values (?, ?, ?, ?, ?)').run(key, 'claude', tmp, Date.now(), Date.now());
  const file = m.transcriptFor(key);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{"type":"user"}\n');
  return { key, file };
}

test('deleting a session started here removes its transcript and rows, and says so', async () => {
  const m = manager();
  const { key, file } = startedHere(m);
  assert.ok(fs.existsSync(file));
  await m.remove(key);
  assert.equal(fs.existsSync(file), false, 'transcript');
  assert.equal(appRow(key), undefined, 'app_sessions row');
  assert.equal(indexedRow(key), undefined, 'sessions row');
  const ev = m.emitted.find((e) => e[0] === 'sessions');
  assert.ok(ev, 'a sessions event');
  assert.ok((ev![2] as string[]).includes(key), 'with the key among the removed');
});

test('what arrives just after the delete does not bring the session back', async () => {
  const m = manager();
  const { key } = startedHere(m);
  await m.remove(key);
  const none = (what: string) => assert.equal(appRow(key), undefined, `${what} made a row`);
  m.markSeen(key);
  none('markSeen');
  m.setFlags(key, { pinned: true });
  none('setFlags');
  await m.rename(key, 'Back?');
  none('rename');
  m.setOrder([key]);
  none('setOrder');
  m.setPr(key, pr);
  none('setPr');
});

test('a session that is there still gets its row: indexed, or running', () => {
  const m = manager();
  const key = `claude:${crypto.randomUUID()}`;
  db.prepare('insert into sessions (key, agent, id, path) values (?, ?, ?, ?)').run(key, 'claude', key.slice(7), path.join(tmp, 'indexed.jsonl'));
  assert.equal(appRow(key), undefined);
  m.markSeen(key);
  assert.ok(appRow(key)?.seen_at, 'markSeen sets seen_at');
  db.prepare('delete from app_sessions where key = ?').run(key);
  m.setFlags(key, { pinned: true });
  assert.equal(appRow(key)?.pinned, 1, 'setFlags pins an indexed session');

  const live = `claude:${crypto.randomUUID()}`;
  m.lives.set(live, {});
  assert.equal(appRow(live), undefined);
  m.setFlags(live, { pinned: true });
  assert.equal(appRow(live)?.pinned, 1, 'setFlags pins a running one');
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
