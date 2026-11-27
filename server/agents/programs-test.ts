// Checks for whether Claude Code and Codex are signed in (programs.ts, with account() faked: no program is started):
// the answer from the main and added accounts, kept a minute, read again after a sign-in or sign-out; a check that
// cannot be made; what is refused; and what runs a session nobody picked a program for (shared/programs.ts).
// Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/agents/programs-test.ts
//   DATA_DIR=/tmp/hydor-test-programs node dist/dev/programs-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { agentToOpen, firstUsableProgram, programUsable, type Program, type ProgramStatus } from '../../shared/programs.ts';
import type { AccountStatus } from '../../shared/types.ts';
import { openDb, type DB } from '../db.ts';
import { defaultProgram, initPrograms, notePrograms, programRefusal, programsChanged, programsNow, programsSoon, programStatus, resetPrograms, signedInBefore, startRefusal } from './programs.ts';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-programs-test-'));
let n = 0;

/** What each account answers now, by "claude" or "claude:work"; a missing one is signed out. */
let answers: Record<string, Partial<AccountStatus> | Error> = {};
let asked: string[] = [];
let added: Partial<Record<Program, string[]>> = {};
let heard: ProgramStatus[] = [];
let db: DB;

function start(a: typeof answers = {}, more: typeof added = {}) {
  resetPrograms();
  db = openDb(path.join(tmp, `${++n}.db`));
  answers = a;
  added = more;
  asked = [];
  heard = [];
  initPrograms({
    db,
    accounts: (p) => [undefined, ...(added[p] ?? [])],
    account: async (p, id) => {
      const key = id ? `${p}:${id}` : p;
      asked.push(key);
      const x = answers[key];
      if (x instanceof Error) throw x;
      return { agent: p, loggedIn: false, ...x };
    },
    changed: (s) => heard.push(s),
  });
}

const used = (agent: Program, tokensOut: number) =>
  db.prepare('insert into sessions (key, agent, id, path, tokens_out) values (?, ?, ?, ?, ?)').run(`${agent}:${tokensOut}`, agent, String(tokensOut), `/x/${agent}-${tokensOut}`, tokensOut);

const tests: [string, () => Promise<void> | void][] = [];
const test = (name: string, fn: () => Promise<void> | void) => tests.push([name, fn]);

test('before it is set up (a test of something else), both count as signed in and nothing is refused', async () => {
  resetPrograms();
  assert.deepEqual(await programStatus(), { claude: true, codex: true });
  assert.equal(await programRefusal('claude'), null);
  assert.equal(await startRefusal('codex'), null);
  assert.equal(programsNow(), null);
});

test('the programs’ own sign-ins answer, kept a minute; the added accounts are asked only when the main one says no', async () => {
  start({ claude: { loggedIn: true }, 'codex:work': { loggedIn: true } }, { claude: ['spare'], codex: ['work'] });
  assert.deepEqual(await programStatus(), { claude: true, codex: true });
  assert.deepEqual(asked.sort(), ['claude', 'codex', 'codex:work']);
  assert.deepEqual(await programStatus(), { claude: true, codex: true });
  assert.equal(asked.length, 3, 'not asked again within the minute');
  assert.deepEqual(heard, [{ claude: true, codex: true }]);
});

test('a sign-out or a sign-in through Hydor is read at once, and the pages hear what changed', async () => {
  start({ claude: { loggedIn: true } });
  assert.deepEqual(await programStatus(), { claude: true, codex: false });
  answers = { codex: { loggedIn: true } };
  programsChanged();
  assert.deepEqual(await programStatus(), { claude: false, codex: true });
  assert.deepEqual(heard.at(-1), { claude: false, codex: true });
  assert.equal(signedInBefore('claude'), true, 'seen signed in before');
});

test('a Codex that asks for no OpenAI sign-in works signed out', async () => {
  start({ codex: { noSignInNeeded: true } });
  assert.deepEqual(await programStatus(), { claude: false, codex: true });
});

test('a check that cannot be made keeps the last answer; with none, only a program signed in here before counts', async () => {
  start({ claude: new Error('timed out'), codex: { error: 'not installed' } });
  used('claude', 500);
  // A refused session ("Not logged in") used no tokens: no proof of a sign-in.
  used('codex', 0);
  assert.deepEqual(await programStatus(), { claude: true, codex: false });
  answers = { claude: { loggedIn: false }, codex: { loggedIn: true } };
  assert.deepEqual(await programStatus({ fresh: true }), { claude: false, codex: true });
  answers = { claude: new Error('timed out'), codex: new Error('timed out') };
  assert.deepEqual(await programStatus({ fresh: true }), { claude: false, codex: true });
});

test('refusals: asked afresh first; a new session is refused only for a program never signed in here', async () => {
  start();
  assert.match((await programRefusal('claude'))!, /^Claude Code is not signed in here/);
  assert.equal(await programRefusal('acp'), null);
  assert.match((await startRefusal('codex'))!, /^Codex is not signed in here/);
  // Signed in from a terminal since the last answer: seen before anything is refused.
  answers = { claude: { loggedIn: true } };
  assert.equal(await programRefusal('claude'), null);
  // Signed out since: subagents and pickers pass over it, while a session may start and ask to sign in again.
  answers = {};
  programsChanged();
  assert.match((await programRefusal('claude'))!, /Settings → Agents → Accounts/);
  assert.equal(await startRefusal('claude'), null);
});

test('what the Accounts page read is kept, and the first page waits for a first answer', async () => {
  start({ claude: { loggedIn: true } });
  assert.deepEqual(await programsSoon(), { claude: true, codex: false });
  notePrograms({ claude: [{ agent: 'claude', loggedIn: false }], codex: [{ agent: 'codex', loggedIn: true }] });
  assert.deepEqual(programsNow(), { claude: false, codex: true });
  assert.equal(asked.length, 2);
});

test('nobody picked: the first signed in of Claude Code and Codex, else Custom', async () => {
  assert.deepEqual(firstUsableProgram(undefined), { agent: 'claude', acp: null });
  assert.deepEqual(firstUsableProgram({ claude: true, codex: true }), { agent: 'claude', acp: null });
  assert.deepEqual(firstUsableProgram({ claude: false, codex: true }), { agent: 'codex', acp: null });
  assert.deepEqual(firstUsableProgram({ claude: false, codex: false }), { agent: 'acp', acp: 'console' });
  start();
  assert.deepEqual(await defaultProgram(), { agent: 'acp', acpAgent: 'console' });
  assert.equal(programUsable({ claude: false, codex: false }, 'acp'), true);
});

test('the start page’s default: a saved pick is kept, signed in or not; the first time, or with its agent gone, the first usable', () => {
  const none = { claude: false, codex: false };
  const codexOnly = { claude: false, codex: true };
  assert.deepEqual(agentToOpen(undefined, [], codexOnly), { agent: 'codex', acp: null });
  assert.deepEqual(agentToOpen(undefined, [], none), { agent: 'acp', acp: 'console' });
  assert.deepEqual(agentToOpen('claude', [], none), { agent: 'claude', acp: null });
  assert.deepEqual(agentToOpen('acp:gemini', [{ id: 'gemini' }], codexOnly), { agent: 'acp', acp: 'gemini' });
  assert.deepEqual(agentToOpen('acp:gone', [{ id: 'console' }], none), { agent: 'acp', acp: 'console' });
  assert.deepEqual(agentToOpen('acp:gone', undefined, codexOnly), { agent: 'acp', acp: 'gone' }, 'the agents not known yet');
});

let passed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
}
console.log(`${passed}/${tests.length} passed`);
resetPrograms();
fs.rmSync(tmp, { recursive: true, force: true });
