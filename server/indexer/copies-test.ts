// Checks for the copies of a session (copies.ts): a session's name as the index has it, and that of its copies in
// several account folders only the one the index has (or the one written last) is read, with the Codex rollouts that
// name no session kept as they are.
// Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/indexer/copies-test.ts && node dist/dev/copies-test.js
import assert from 'node:assert/strict';
import { onePerSession, sessionKeyOf } from './copies.ts';

let passed = 0;
const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

type File = { path: string; agent: string; mtime: number };
const file = (path: string, agent: string, mtime: number): File => ({ path, agent, mtime });
const never = (): string | undefined => {
  throw new Error('indexed should not be called');
};

const CLAUDE_UUID = '0123abcd-0000-4000-8000-000000000001';
const CODEX_UUID = '0123abcd-0000-4000-8000-000000000002';

test('the session of each kind of transcript, as the index names it', () => {
  assert.equal(sessionKeyOf({ path: `/h/.claude/projects/-p/${CLAUDE_UUID}.jsonl`, agent: 'claude' }), `claude:${CLAUDE_UUID}`);
  assert.equal(sessionKeyOf({ path: `/h/.claude/projects/-p/${CLAUDE_UUID}/subagents/agent-a1b2c3.jsonl`, agent: 'claude' }), 'claude:agent-a1b2c3');
  assert.equal(sessionKeyOf({ path: '/d/acp/xyz.jsonl', agent: 'acp' }), 'acp:xyz');
  assert.equal(
    sessionKeyOf({ path: `/h/.codex/sessions/2026/11/18/rollout-2026-11-18T10-00-00-${CODEX_UUID}.jsonl`, agent: 'codex' }),
    `codex:${CODEX_UUID}`,
  );
  assert.equal(sessionKeyOf({ path: '/h/.codex/sessions/2026/11/18/rollout-2026-11-18T10-00-00.jsonl', agent: 'codex' }), null);
});

test('two copies of one Claude transcript: the one the index has is kept, in either order', () => {
  const a = file(`/h/acct1/.claude/projects/-p/${CLAUDE_UUID}.jsonl`, 'claude', 1000);
  const b = file(`/h/acct2/.claude/projects/-p/${CLAUDE_UUID}.jsonl`, 'claude', 1000);
  const key = `claude:${CLAUDE_UUID}`;
  assert.deepEqual(onePerSession([a, b], (k) => (k === key ? b.path : undefined)), [b]);
  assert.deepEqual(onePerSession([b, a], (k) => (k === key ? a.path : undefined)), [a]);
});

test('two copies with the same time and none indexed: the first listed is kept', () => {
  const a = file(`/h/acct1/.claude/projects/-p/${CLAUDE_UUID}.jsonl`, 'claude', 1000);
  const b = file(`/h/acct2/.claude/projects/-p/${CLAUDE_UUID}.jsonl`, 'claude', 1000);
  assert.deepEqual(onePerSession([a, b], () => undefined), [a]);
  assert.deepEqual(onePerSession([b, a], () => undefined), [b]);
});

test('two copies at different times: the newer is kept even when the index has the older', () => {
  const older = file(`/h/acct1/.claude/projects/-p/${CLAUDE_UUID}.jsonl`, 'claude', 1000);
  const newer = file(`/h/acct2/.claude/projects/-p/${CLAUDE_UUID}.jsonl`, 'claude', 2000);
  assert.deepEqual(onePerSession([older, newer], () => older.path), [newer]);
  assert.deepEqual(onePerSession([newer, older], () => older.path), [newer]);
});

test('two copies of a subagent transcript under two account folders are reduced to one', () => {
  const a = file(`/h/acct1/.claude/projects/-p/${CLAUDE_UUID}/subagents/agent-a1b2c3.jsonl`, 'claude', 1000);
  const b = file(`/h/acct2/.claude/projects/-p/${CLAUDE_UUID}/subagents/agent-a1b2c3.jsonl`, 'claude', 1000);
  const kept = onePerSession([a, b], () => b.path);
  assert.deepEqual(kept, [b]);
});

test('Codex rollouts that name no session are all kept, and different sessions are all kept, in input order', () => {
  const a = file('/h/.codex/sessions/2026/11/18/rollout-2026-11-18T10-00-00.jsonl', 'codex', 1000);
  const c = file('/h/.codex/sessions/2026/11/18/rollout-2026-11-18T11-00-00.jsonl', 'codex', 1000);
  const d = file('/h/.codex/sessions/2026/11/18/rollout-2026-11-18T12-00-00.jsonl', 'codex', 1000);
  assert.deepEqual(onePerSession([a, c, d], () => undefined), [a, c, d]);

  const b = file(`/h/acct1/.codex/sessions/rollout-x-${CODEX_UUID}.jsonl`, 'codex', 1000);
  const dupOfB = file(`/h/acct2/.codex/sessions/rollout-x-${CODEX_UUID}.jsonl`, 'codex', 500);
  const bNewer = { ...b, mtime: 2000 };
  assert.deepEqual(onePerSession([a, dupOfB, c, bNewer], () => undefined), [a, c, bNewer]);
  assert.deepEqual(onePerSession([a, bNewer, c, dupOfB], () => undefined), [a, bNewer, c]);
});

test('nothing is asked of the index when no session has more than one copy', () => {
  const files = [
    file(`/h/acct1/.claude/projects/-p/${CLAUDE_UUID}.jsonl`, 'claude', 1000),
    file('/d/acp/xyz.jsonl', 'acp', 1000),
    file(`/h/.codex/sessions/rollout-${CODEX_UUID}.jsonl`, 'codex', 1000),
    file('/h/.codex/sessions/rollout-no-id.jsonl', 'codex', 1000),
  ];
  assert.deepEqual(onePerSession(files, never), files);
});

for (const [name, fn] of tests) {
  try {
    fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.log(`FAIL ${name}\n     ${(e as Error).message}`);
  }
}
console.log(`\n${passed}/${tests.length} passed`);
process.exit(passed === tests.length ? 0 : 1);
