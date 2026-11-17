// Script tests for browser-only sessions (handoff.ts): the tools a run keeps, what each agent program is given to hold it
// to the browser, what the agent is told, and what a browser-only session can't do (change agent, turn it off), against a
// normal session.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/browser/handoff-test.ts
//   DATA_DIR=/tmp/hydor-test-handoff node dist/dev/handoff-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../db.ts';
import { registerFeatures, runTools, spawnAdditions, featureContext } from '../features/registry.ts';
import type { Deps, Feature, RunCtx, RunTool } from '../features/types.ts';
import { setSessionExtra } from '../sessionExtra.ts';
import {
  BROWSER_ONLY_INSTRUCTIONS,
  BROWSER_ONLY_KINDS,
  browserHandoff,
  browserOnlyAgent,
  browserOnlyKinds,
  carriedBrowserOnly,
  checkBrowserOnlyChange,
  checkBrowserOnlyHandoff,
  CLAUDE_OFF,
  CODEX_OFF,
} from './handoff.ts';
import { browserTools } from './tools.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-handoff-test-'));
const db = openDb(path.join(dir, 'test.db'));
const summaries: Record<string, { agent: string; acpAgent?: string }> = {
  'claude:only': { agent: 'claude' },
  'claude:plain': { agent: 'claude' },
  'acp:other': { agent: 'acp', acpAgent: 'gemini' },
  'acp:console': { agent: 'acp', acpAgent: 'console' },
};
const deps = { db, sessions: { summary: (k: string) => summaries[k] ?? null } } as unknown as Deps;
setSessionExtra(db, 'claude:only', { browserOnly: true, browserHandoff: { tab: 't1' } });
setSessionExtra(db, 'claude:plain', { memory: true });
setSessionExtra(db, 'acp:other', { browserOnly: true });
setSessionExtra(db, 'acp:console', { browserOnly: true });

const ctx = (key: string, runId = `run-${key}`): RunCtx => ({ runId, key, agent: 'claude', cwd: dir, deps });
const browserNames = browserTools(ctx('claude:only')).map((t) => t.name);
const other = ['web_search', 'read_page', 'http_request', 'read_document', 'start_child_session', 'message_child', 'remember', 'recall', 'app_api', 'list_connections', 'run_with_secrets', 'request_secret', 'generate_image', 'schedule_task', 'save_page', 'notify_user', 'show_html', 'app_guide'];
const tool = (name: string): RunTool => ({ name, description: name, inputSchema: { type: 'object' }, run: async () => name });
const stand: Feature = { id: 'stand-in', tools: () => [...browserNames, ...other].map(tool) };
registerFeatures([stand, browserHandoff], deps);

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

test('the browser has six tools and all are named browser_…', () => {
  assert.deepEqual(browserNames.sort(), ['browser_act', 'browser_ask_user', 'browser_open', 'browser_read', 'browser_tabs', 'browser_upload']);
});

test('a browser-only run has the browser tools and no other tool of the app', () => {
  const names = runTools(ctx('claude:only')).map((t) => t.name);
  assert.deepEqual([...names].sort(), [...browserNames].sort());
});

test('a normal session keeps every tool', () => {
  const names = runTools(ctx('claude:plain')).map((t) => t.name);
  assert.equal(names.length, browserNames.length + other.length);
  assert.ok(names.includes('web_search') && names.includes('start_child_session'));
});

test('a run started browser-only is known before its settings are stored', async () => {
  assert.equal(runTools(ctx('claude:new', 'run-new')).length, browserNames.length + other.length);
  await spawnAdditions({ agent: 'claude', key: 'claude:new', cwd: dir, runId: 'run-new', resume: false, extra: { browserOnly: true } });
  assert.deepEqual(runTools(ctx('claude:new', 'run-new')).map((t) => t.name).sort(), [...browserNames].sort());
});

test('Claude Code: every built-in tool off, only the app’s MCP servers, and the agent is told', async () => {
  const a = await spawnAdditions({ agent: 'claude', key: 'claude:only', cwd: dir, runId: 'r1', resume: false, extra: { browserOnly: true, browserHandoff: { tab: 't1' } } });
  for (const t of ['Bash', 'BashOutput', 'KillShell', 'Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Task', 'Agent', 'Skill']) assert.ok(a.disallowedTools.includes(t), t);
  assert.equal(a.strictMcp, true);
  assert.ok(a.instructions.some((i) => i === BROWSER_ONLY_INSTRUCTIONS));
  assert.ok(CLAUDE_OFF.every((t) => !t.startsWith('mcp__')), 'the app’s own browser tools stay on');
});

test('a normal Claude Code session is given none of it', async () => {
  const a = await spawnAdditions({ agent: 'claude', key: 'claude:plain', cwd: dir, runId: 'r2', resume: false, extra: {} });
  assert.deepEqual(a.disallowedTools, []);
  assert.equal(a.strictMcp, false);
  assert.ok(!a.instructions.some((i) => i.includes('browser-only')));
});

test('Codex: its shell, patching and file viewing and its web search are off, as dotted keys', async () => {
  const a = await spawnAdditions({ agent: 'codex', cwd: dir, runId: 'r3', resume: false, extra: { browserOnly: true } });
  assert.equal(a.codexConfig['features.shell_tool'], false);
  assert.equal(a.codexConfig['features.unified_exec'], false);
  assert.equal(a.codexConfig.web_search, 'disabled');
  assert.deepEqual(a.codexConfig, CODEX_OFF);
  assert.deepEqual(a.disallowedTools, []);
  assert.ok(a.instructions.includes(BROWSER_ONLY_INSTRUCTIONS));
});

test('Custom reads its instructions as context, and only a browser-only session’s', async () => {
  const on = await featureContext({ key: 'acp:console', cwd: dir, extra: { browserOnly: true }, runId: 'r4' });
  assert.ok(on.parts.some((p) => p.id === 'browser-handoff' && p.text === BROWSER_ONLY_INSTRUCTIONS));
  const off = await featureContext({ key: 'acp:console', cwd: dir, extra: {}, runId: 'r5' });
  assert.ok(!off.parts.some((p) => p.id === 'browser-handoff'));
  const a = await spawnAdditions({ agent: 'acp', acpAgent: 'console', cwd: dir, runId: 'r6', resume: false, extra: { browserOnly: true } });
  assert.deepEqual(a.disallowedTools, [], 'Custom’s tools are cut by kind (BROWSER_ONLY_KINDS), not by this list');
  assert.deepEqual(browserOnlyKinds(db, 'acp:console'), BROWSER_ONLY_KINDS);
  assert.deepEqual(BROWSER_ONLY_KINDS, ['browser']);
  assert.equal(browserOnlyKinds(db, 'claude:plain'), null);
});

test('the agent is told its limits in plain words', () => {
  for (const w of ['one tab', 'sign-ins', 'browser_ask_user', 'subagents', 'kept to this tab’s site', 'sends, posts, publishes, deletes or transfers']) assert.ok(BROWSER_ONLY_INSTRUCTIONS.includes(w), w);
});

test('only agents that can be held to the browser may run one', async () => {
  assert.equal(browserOnlyAgent('claude'), true);
  assert.equal(browserOnlyAgent('codex'), true);
  assert.equal(browserOnlyAgent('acp', 'console'), true);
  assert.equal(browserOnlyAgent('acp', 'gemini'), false);
  await browserHandoff.beforeSend!('claude:only', deps);
  await browserHandoff.beforeSend!('acp:console', deps);
  await browserHandoff.beforeSend!('claude:plain', deps);
  await assert.rejects(async () => browserHandoff.beforeSend!('acp:other', deps), /Only Claude Code, Codex and Custom/);
});

test('a browser-only session can’t continue in another agent, can’t be switched off, and stays one in a fork', () => {
  assert.throws(() => checkBrowserOnlyHandoff(db, 'claude:only'), /can’t continue in another agent/);
  checkBrowserOnlyHandoff(db, 'claude:plain');
  assert.throws(() => checkBrowserOnlyChange(db, 'claude:only', { browserOnly: false }), /stays that way/);
  assert.throws(() => checkBrowserOnlyChange(db, 'claude:plain', { browserOnly: true }), /from its start/);
  checkBrowserOnlyChange(db, 'claude:only', { browserOnly: true });
  checkBrowserOnlyChange(db, 'claude:plain', { memory: false });
  assert.deepEqual(carriedBrowserOnly(db, 'claude:only'), { browserOnly: true });
  assert.equal(carriedBrowserOnly(db, 'claude:plain'), undefined);
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n${(e as Error).stack}`);
  }
}
fs.rmSync(dir, { recursive: true, force: true });
console.log(`${passed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
