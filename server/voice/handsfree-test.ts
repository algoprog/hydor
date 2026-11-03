// Script tests for hands-free: what the helper model decides is done (a session started with the start
// page's picks, a message sent, an approval answered, a session stopped, a reply read as its gist), plain
// words understood without a helper, and the answer in the user's language. Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/voice/handsfree-test.ts
//   DATA_DIR=/tmp/hydor-test-handsfree node dist/dev/handsfree-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ApprovalRequest, SessionSummary } from '../../shared/types.ts';
import { setSettings } from '../assistants/store.ts';
import { kvSet, openDb } from '../db.ts';
import type { Deps } from '../features/types.ts';
import type { HelperAsk } from '../helper.ts';
import type { CreateOpts } from '../sessions.ts';
import { updateStartSettings } from '../startSettings.ts';
import { handsFree } from './handsfree.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-handsfree-test-'));
const db = openDb(path.join(tmp, 'test.db'));
setSettings(db, { taskRoot: path.join(tmp, 'Naget') });
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const approval: ApprovalRequest = { id: 'ap1', kind: 'command', title: 'Run a command', detail: 'npm test', createdAt: 1, options: [{ id: 'allow', label: 'Allow', style: 'primary' }, { id: 'deny', label: 'Deny', style: 'danger' }] };
const summaries: Record<string, SessionSummary> = {
  'claude:a': { key: 'claude:a', agent: 'claude', id: 'a', title: 'Plan the Crete trip', stats: {} as any, live: { status: 'waiting', startedAt: 1, pendingApprovals: 1 }, updatedAt: Date.now() },
  'codex:b': { key: 'codex:b', agent: 'codex', id: 'b', title: 'Fix the login test', stats: {} as any, live: { status: 'idle', startedAt: 1, pendingApprovals: 0 }, updatedAt: Date.now() - 60_000 },
};
const did: string[] = [];
const created: CreateOpts[] = [];
const sessions = {
  list: () => ({ sessions: Object.values(summaries), total: 2 }),
  summary: (k: string) => summaries[k] ?? null,
  inbox: () => [{ id: 'approval:claude:a:ap1', kind: 'approval', title: 'Run a command', key: 'claude:a', at: 1, path: '/s/claude%3Aa', approval }],
  async create(o: CreateOpts) {
    created.push(o);
    return 'claude:new';
  },
  deliverOrQueue: async (k: string, t: string) => void did.push(`send ${k} ${t}`),
  answer: async (k: string, id: string, a: { decision: string }) => void did.push(`answer ${k} ${id} ${a.decision}`),
  interrupt: async (k: string) => void did.push(`stop ${k}`),
  timeline: async () => ({ parser: { items: [{ kind: 'user', id: 'u', seq: 0, text: 'go' }, { kind: 'assistant', id: 'r', seq: 1, text: `## Plan\n\n${'Day one: Chania old town. '.repeat(40)}` }] } }),
};
const d = { db, sessions } as unknown as Deps;
/** The helper model, answering as told, and keeping what it was asked. */
const asked: HelperAsk[] = [];
const helperSays = (...answers: string[]) => async (q: HelperAsk) => {
  asked.push(q);
  return answers.shift() ?? '';
};

test('start: a session with the start page’s agent, model and assistant, in a new task folder; it becomes the focus', async () => {
  updateStartSettings(db, { agent: 'codex', runs: { codex: { model: 'gpt-x', effort: 'high' } }, assistant: 'researcher', task: true });
  const r = await handsFree(d, 'start a session to find flights to Crete in May', undefined, helperSays('{"action":"start","session":null,"text":"Find flights to Crete in May","say":"On it."}'));
  assert.deepEqual(r, { say: 'On it.', focus: 'claude:new', did: 'started' });
  assert.equal(created[0].agent, 'codex');
  assert.equal(created[0].model, 'gpt-x');
  assert.equal(created[0].effort, 'high');
  assert.equal(created[0].prompt, 'Find flights to Crete in May');
  assert.deepEqual(created[0].extra, { assistant: 'researcher' });
  assert.ok(created[0].cwd.startsWith(path.join(tmp, 'Naget')), created[0].cwd);
  // The helper heard the sessions, busy first, with what one asks, and the focus.
  assert.match(asked[0].prompt, /claude:a · Claude Code · waiting \(asks: Run a command\) · "Plan the Crete trip"/);
});

test('send, approve, stop: each done on the session meant, "it" being the focus', async () => {
  await handsFree(d, 'tell it to prefer direct flights', 'claude:a', helperSays('{"action":"send","session":null,"text":"Prefer direct flights.","say":"Told it."}'));
  await handsFree(d, 'yes go ahead', undefined, helperSays('{"action":"approve","session":"claude:a","say":"Approved."}'));
  await handsFree(d, 'stop the login one', undefined, helperSays('{"action":"stop","session":"codex:b","say":"Stopped it."}'));
  assert.deepEqual(did, ['send claude:a Prefer direct flights.', 'answer claude:a ap1 allow', 'stop codex:b']);
});

test('read: a long reply comes as its gist, from the helper; a session that never answered says so', async () => {
  const r = await handsFree(d, 'what did the trip one say', undefined, helperSays('{"action":"read","session":"claude:a","say":""}', 'The plan starts in Chania.'));
  assert.deepEqual(r, { say: 'The plan starts in Chania.', focus: 'claude:a', did: 'read' });
  assert.match(asked.at(-1)!.system, /gist[\s\S]*in English/);
  assert.doesNotMatch(asked.at(-1)!.prompt, /##/);
});

test('without a helper model, plain words still work', async () => {
  did.length = 0;
  const down = async () => {
    throw new Error('no helper');
  };
  assert.equal((await handsFree(d, 'approve', 'claude:a', down)).did, 'approved');
  assert.equal((await handsFree(d, 'status please', undefined, down)).did, 'status');
  assert.equal((await handsFree(d, 'stop', 'codex:b', down)).did, 'stopped');
  assert.equal((await handsFree(d, 'use metric units', 'claude:a', down)).did, 'sent');
  assert.deepEqual(did, ['answer claude:a ap1 allow', 'stop codex:b', 'send claude:a use metric units']);
});

test('the answer is asked for in the language the user reads the app in', async () => {
  kvSet(db, 'ui.language', 'el');
  await handsFree(d, 'πώς πάνε οι συνεδρίες;', undefined, helperSays('{"action":"status","say":"Μία περιμένει εσένα."}'));
  assert.match(asked.at(-1)!.system, /in Greek/);
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
