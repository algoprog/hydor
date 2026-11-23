// Checks for the copies of a session (copies.ts): a session's name as the index has it, and that of its copies in
// several account folders only the one the index has (or the one written last) is read, with the Codex rollouts that
// name no session kept as they are; and which index rows are gone (goneRows), where a row whose session is listed at
// another path (it moved to another account) is neither gone nor put back where it was.
// Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/indexer/copies-test.ts && node dist/dev/copies-test.js
import assert from 'node:assert/strict';
import { goneRows, onePerSession, sessionKeyOf } from './copies.ts';

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

// ---- goneRows ------------------------------------------------------------------------------

type Row = { key: string; path: string };
const absent = () => false;
/** goneRows with the calls to putBack recorded; `back` says which paths it puts back. */
function gone(rows: Row[], files: { path: string; agent: string }[], opts: { back?: (p: string) => boolean; exists?: (p: string) => boolean } = {}) {
  const putBack: string[] = [];
  const result = goneRows(rows, files, (p) => (putBack.push(p), opts.back ? opts.back(p) : false), opts.exists ?? absent);
  return { result, putBack };
}

test('a row whose transcript is listed is not gone, and nothing is put back', () => {
  const p = `/h/acct1/.claude/projects/-p/${CLAUDE_UUID}.jsonl`;
  const { result, putBack } = gone([{ key: `claude:${CLAUDE_UUID}`, path: p }], [{ path: p, agent: 'claude' }]);
  assert.deepEqual(result, []);
  assert.deepEqual(putBack, []);
});

test('a row whose transcript exists now (put there since the listing) is not gone, and nothing is put back', () => {
  const p = `/h/acct1/.claude/projects/-p/${CLAUDE_UUID}.jsonl`;
  const { result, putBack } = gone([{ key: `claude:${CLAUDE_UUID}`, path: p }], [], { exists: (x) => x === p });
  assert.deepEqual(result, []);
  assert.deepEqual(putBack, []);
});

test('a session that moved to another account is neither gone nor put back at its old place', () => {
  const old = `/h/acct1/.claude/projects/-p/${CLAUDE_UUID}.jsonl`;
  const moved = `/h/acct2/.claude/projects/-p/${CLAUDE_UUID}.jsonl`;
  // The app's kept link would restore the old place (back says yes): that would leave a second copy behind.
  const { result, putBack } = gone([{ key: `claude:${CLAUDE_UUID}`, path: old }], [{ path: moved, agent: 'claude' }], { back: () => true });
  assert.deepEqual(result, [], 'not gone');
  assert.deepEqual(putBack, [], 'not put back at the old place');
});

test('a subagent that moved to another account with its session is neither gone nor put back', () => {
  const old = `/h/acct1/.claude/projects/-p/${CLAUDE_UUID}/subagents/agent-abc.jsonl`;
  const moved = `/h/acct2/.claude/projects/-p/${CLAUDE_UUID}/subagents/agent-abc.jsonl`;
  const { result, putBack } = gone([{ key: 'claude:agent-abc', path: old }], [{ path: moved, agent: 'claude' }], { back: () => true });
  assert.deepEqual(result, []);
  assert.deepEqual(putBack, []);
});

test('a Codex thread whose rollout is listed in another account’s folder is not gone', () => {
  const name = `rollout-2026-01-01T00-00-00-${CODEX_UUID}.jsonl`;
  const old = `/h/acct1/.codex/sessions/2026/01/01/${name}`;
  const moved = `/h/acct2/.codex/sessions/2026/01/01/${name}`;
  const { result, putBack } = gone([{ key: `codex:${CODEX_UUID}`, path: old }], [{ path: moved, agent: 'codex' }], { back: () => true });
  assert.deepEqual(result, []);
  assert.deepEqual(putBack, []);
});

test('a row listed nowhere and not there: put back from the kept link when it can be, else gone', () => {
  const p = `/h/acct1/.claude/projects/-p/${CLAUDE_UUID}.jsonl`;
  const row = { key: `claude:${CLAUDE_UUID}`, path: p };
  const other = { path: `/h/acct1/.claude/projects/-p/${CODEX_UUID}.jsonl`, agent: 'claude' };
  const lost = gone([row], [other], { back: () => false });
  assert.deepEqual(lost.putBack, [p], 'put back is tried with the row’s path');
  assert.deepEqual(lost.result, [row], 'gone when nothing could put it back');
  const kept = gone([row], [other], { back: () => true });
  assert.deepEqual(kept.putBack, [p]);
  assert.deepEqual(kept.result, [], 'not gone when it was put back');
});

test('only the rows that are gone come back, in order', () => {
  const p1 = `/h/a/.claude/projects/-p/${CLAUDE_UUID}.jsonl`;
  const p2 = `/h/a/.claude/projects/-p/${CODEX_UUID}.jsonl`;
  const p3 = '/h/a/.claude/projects/-p/0123abcd-0000-4000-8000-000000000003.jsonl';
  const rows = [
    { key: `claude:${CLAUDE_UUID}`, path: p1 },
    { key: `claude:${CODEX_UUID}`, path: p2 },
    { key: 'claude:0123abcd-0000-4000-8000-000000000003', path: p3 },
  ];
  const { result } = gone(rows, [{ path: p2, agent: 'claude' }]);
  assert.deepEqual(result, [rows[0], rows[2]]);
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
