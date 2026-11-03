// Script tests for deep research: what the lead and its researchers are told (and the agents' own web search
// turned off), the search budget kept across the research through the tool hook, rounds as researchers
// start, and the breadth as the most researchers at once. Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/research/research-test.ts
//   DATA_DIR=/tmp/hydor-test-research node dist/dev/research-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SessionSummary } from '../../shared/types.ts';
import { maxFor } from '../children/index.ts';
import { kvSet, openDb } from '../db.ts';
import { registerFeatures, runTools, spawnAdditions } from '../features/registry.ts';
import type { Deps, Feature, RunCtx } from '../features/types.ts';
import { setSessionExtra } from '../sessionExtra.ts';
import { research, researchState } from './index.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-research-test-'));
const db = openDb(path.join(tmp, 'test.db'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const LEAD = 'claude:lead';
const session = (key: string, extra: Record<string, unknown>) => {
  db.prepare('insert or ignore into app_sessions (key, agent, created_at, updated_at) values (?, ?, ?, ?)').run(key, key.split(':')[0], Date.now(), Date.now());
  setSessionExtra(db, key, extra);
};
session(LEAD, { research: { breadth: 2, depth: 2, queries: 10, format: 'document' } });
session('codex:r1', { parent: LEAD });
session('codex:r2', { parent: LEAD });
session('claude:plain', {});

const status = new Map<string, string>();
const told: unknown[] = [];
const deps = {
  db,
  sessions: { summary: (k: string) => ({ key: k, live: status.has(k) ? { status: status.get(k) } : null }) as unknown as SessionSummary },
  toSubscribers: (_k: string, e: unknown) => void told.push(e),
  broadcast: () => {},
  app: { get: () => {} },
} as unknown as Deps;
// Stand-ins for the tools research keeps count of.
const fakeTools: Feature = {
  id: 'fake',
  tools: () => [
    { name: 'web_search', description: '', inputSchema: {}, run: async () => 'results' },
    { name: 'start_child_session', description: '', inputSchema: {}, run: async () => ({ text: 'started' }) },
    { name: 'read_page', description: '', inputSchema: {}, run: async () => 'page' },
  ],
};
registerFeatures([fakeTools, research], deps);
// Researchers are the lead's children: the family table says so.
db.prepare('insert into sessions (key, agent, id, path, parent_key, hidden) values (?, ?, ?, ?, ?, 0)').run('codex:r1', 'codex', 'r1', '/tmp/r1', null);
const ctx = (key: string): RunCtx => ({ runId: `run-${key}`, key, agent: key.startsWith('codex') ? 'codex' : 'claude', cwd: tmp, deps });
const call = async (key: string, name: string) => {
  const t = runTools(ctx(key)).find((x) => x.name === name)!;
  const r = await t.run({}, ctx(key));
  return typeof r === 'string' ? { text: r, isError: false } : { text: r.text, isError: !!r.isError };
};

test('the lead gets the method with its budget, a researcher its own part; their own web search is off', async () => {
  const lead = await spawnAdditions({ agent: 'claude', key: LEAD, cwd: tmp, runId: 'r', resume: false, extra: { research: { breadth: 2, depth: 2, queries: 10, format: 'document' } } });
  const text = lead.instructions.join('\n');
  assert.match(text, /^Deep research mode:/);
  assert.match(text, /at most 10 web searches in all[\s\S]*2 rounds of research[\s\S]*2 researchers at a time/);
  assert.match(text, /Word document \(\.docx\)[\s\S]*present_files/);
  assert.deepEqual(lead.disallowedTools, ['WebSearch']);
  // A new Codex thread (no key yet) that is one of the lead's researchers.
  const r = await spawnAdditions({ agent: 'codex', cwd: tmp, runId: 'r2', resume: false, extra: { parent: LEAD } });
  assert.match(r.instructions.join('\n'), /^Researcher: you research one part/);
  assert.deepEqual(r.codexConfig, { web_search: 'disabled' });
  const page = await spawnAdditions({ agent: 'claude', key: 'claude:x', cwd: tmp, runId: 'r3', resume: false, extra: { research: { breadth: 1, depth: 1, queries: 20, format: 'page' } } });
  assert.match(page.instructions.join('\n'), /save_page/);
  const none = await spawnAdditions({ agent: 'claude', key: 'claude:plain', cwd: tmp, runId: 'r4', resume: false, extra: {} });
  assert.deepEqual(none.instructions, []);
  assert.deepEqual(none.disallowedTools, []);
});

test('searches count across the research, say what is left, and stop at the budget for lead and researchers alike', async () => {
  const a = await call(LEAD, 'web_search');
  assert.deepEqual(a, { text: 'results\n\n(9 of 10 searches left in this research.)', isError: false });
  assert.match((await call('codex:r1', 'web_search')).text, /\(8 of 10 searches left/);
  kvSet(db, `research.used.${LEAD}`, '9');
  assert.match((await call('codex:r2', 'web_search')).text, /\(0 of 10 searches left/);
  const lead = await call(LEAD, 'web_search');
  assert.equal(lead.isError, true);
  assert.match(lead.text, /search budget is spent \(10 searches\)[\s\S]*write the report/);
  const r = await call('codex:r1', 'web_search');
  assert.match(r.text, /end your turn now with your report/);
  // Reading pages is not counted; nor is a session outside the research.
  assert.equal((await call(LEAD, 'read_page')).text, 'page');
  assert.equal((await call('claude:plain', 'web_search')).text, 'results');
  assert.equal(researchState(deps, LEAD)?.used, 10);
  assert.ok(told.length > 0);
});

test('rounds: a researcher started while none works begins one; past the rounds and a checking one, no more', async () => {
  assert.equal((await call(LEAD, 'start_child_session')).text, 'started');
  assert.equal(researchState(deps, LEAD)?.rounds, 1);
  // One is at work: more of the same round.
  status.set('codex:r1', 'working');
  assert.equal((await call(LEAD, 'start_child_session')).text, 'started');
  assert.equal(researchState(deps, LEAD)?.rounds, 1);
  status.set('codex:r1', 'idle');
  await call(LEAD, 'start_child_session');
  await call(LEAD, 'start_child_session');
  assert.equal(researchState(deps, LEAD)?.rounds, 3);
  const no = await call(LEAD, 'start_child_session');
  assert.equal(no.isError, true);
  assert.match(no.text, /had its 2 rounds of research and a checking round/);
  // A researcher's own calls are not the lead's rounds.
  assert.equal((await call('codex:r1', 'start_child_session')).text, 'started');
});

test('breadth: the most researchers at work at once', () => {
  assert.equal(maxFor(db, { key: LEAD }), 2);
  assert.equal(maxFor(db, { key: 'claude:plain' }) > 0, true);
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
