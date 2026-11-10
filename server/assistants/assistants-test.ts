// Script tests for assistants: the instructions each agent gets (and the limits Claude Code's flags and
// Codex's settings enforce, through the real adapters), reading .claude/agents files, task folder names,
// the store and routes, and Custom's tool limits: the classification, and a run of the built Custom
// agent against a fake runtime, a fake model and fake MCP servers. Build and run with a scratch data folder:
//   npm run build:server   (Custom's agent.js, for the last test)
//   OUTDIR=dist/dev node scripts/build-server.mjs server/assistants/assistants-test.ts
//   DATA_DIR=/tmp/hydor-test-asst-unit node dist/dev/assistants-test.js
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { agentMode, assistantExtra, toolAllowed, toolKind, type Assistant } from '../../shared/assistants.ts';
import { AcpLive } from '../agents/acp.ts';
import { claudeSpec } from '../agents/claude.ts';
import { CodexLive } from '../agents/codex.ts';
import { APP_ROOT } from '../config.ts';
import { openDb } from '../db.ts';
import { pages } from '../pages/index.ts';
import { beforeSend, messageNotes, registerFeatures, spawnAdditions } from '../features/registry.ts';
import type { Deps, Feature, SpawnInfo } from '../features/types.ts';
import { runToken } from '../mcp.ts';
import type { SessionManager } from '../sessions.ts';
import { sessionExtra, setSessionExtra } from '../sessionExtra.ts';
import { BUILTINS } from './builtins.ts';
import { assistants, assistantById, assistantStart, listAssistants } from './index.ts';
import { findAgentFiles, parseAgentFile, parseFrontmatter } from './importer.ts';
import { instructionsFor, spawnFor, switchNote } from './instructions.ts';
import { cleanAssistant, cleanUpOn, removeAssistant, saveAssistant, setSettings, taskRoot, toneOf } from './store.ts';
import { cleanup } from '../cleanup/index.ts';
import { dayIn, makeTaskFolder, slugOf, taskFolderName } from './taskFolder.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-asst-test-'));
const db = openDb(path.join(tmp, 'test.db'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

// ---- fixtures ------------------------------------------------------------------------------------

const researcher = BUILTINS.find((a) => a.id === 'researcher')!;
/** Reads files and the web; nothing else. */
const reader: Assistant = { id: 'reader-0001', name: 'Reader', icon: 'book-open', description: 'Reads', instructions: 'Summarize what you read.', tools: ['read', 'web'], skills: ['summaries'] };
/** Reads files only: no web, no commands, no edits, no other tools. */
const offline: Assistant = { id: 'offline-0001', name: 'Offline', icon: 'shield', description: 'Stays offline', instructions: 'Work only from the files.', tools: ['read'] };

const claude = { agent: 'claude' as const };
const codex = { agent: 'codex' as const };
const custom = { agent: 'acp' as const, acpAgent: 'console' };
const appTools = ['mcp__hydor__show_html', 'mcp__hydor__web_search', 'mcp__hydor__read_page', 'mcp__hydor__remember', 'mcp__hydor__http_request'];

// ---- instructions per agent ------------------------------------------------------------------------

test('a built-in assistant with the tone: the same block for every agent, no limits', () => {
  const tone = 'plain English, short answers, explain jargon';
  for (const t of [claude, codex, custom]) {
    const s = instructionsFor(researcher, tone, t);
    assert.match(s, /^# Agent: Researcher\n/);
    assert.ok(s.includes(researcher.instructions));
    assert.match(s, /web_search categories/);
    assert.match(s, /# How to talk to the user\nIn their own words: plain English, short answers, explain jargon/);
    assert.doesNotMatch(s, /Limits:/);
  }
});

test('no assistant and no tone: nothing; the tone alone for every session', () => {
  assert.equal(instructionsFor(null, '  ', claude), '');
  const s = instructionsFor(null, 'Be brief.\n  No emoji.', codex);
  assert.equal(s, '# How to talk to the user\nIn their own words: Be brief. No emoji.\nKeep to this in every reply, unless they ask for something else in the conversation.');
  assert.deepEqual(spawnFor(null, '', claude, appTools), { instructions: [] });
});

test('limits: switched off for Claude Code and Custom, asked of Codex, which keeps its shell to read', () => {
  const c = instructionsFor(reader, '', claude);
  assert.match(c, /Limits: in this session you cannot create or change files, run commands or programs or use other tools .*; those tools are switched off\./);
  assert.equal(instructionsFor(reader, '', custom).match(/Limits:.*/)?.[0], c.match(/Limits:.*/)?.[0]);
  const x = instructionsFor(reader, '', codex);
  assert.match(x, /Limits: in this session do not create or change files or use other tools/);
  assert.match(x, /Use the shell only to read and search files/);
  assert.doesNotMatch(x, /do not .*run commands/);
  // Without reading too, Codex is asked not to run commands at all.
  const none: Assistant = { ...offline, tools: [] };
  assert.match(instructionsFor(none, '', codex), /do not read files, create or change files, run commands or programs, use the web or use other tools/);
});

test('skills to favor, worded for each agent', () => {
  assert.match(instructionsFor(reader, '', claude), /Skills to favor: summaries\. When one of them fits the task, load it with the Skill tool before you start/);
  assert.match(instructionsFor(reader, '', custom), /load it with the skill tool/);
  assert.match(instructionsFor(reader, '', codex), /read its SKILL\.md/);
});

test('Claude Code: --disallowedTools for what is off (the app’s web tools too), --strict-mcp-config without other tools', () => {
  const a = spawnFor(reader, '', claude, appTools);
  assert.deepEqual(a.disallowedTools, ['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash', 'BashOutput', 'KillShell', 'KillBash', 'PowerShell']);
  assert.equal(a.strictMcp, true);
  const b = spawnFor(offline, '', claude, appTools);
  assert.ok(b.disallowedTools!.includes('WebFetch') && b.disallowedTools!.includes('WebSearch'));
  assert.ok(b.disallowedTools!.includes('mcp__hydor__web_search') && b.disallowedTools!.includes('mcp__hydor__read_page') && b.disallowedTools!.includes('mcp__hydor__http_request'));
  assert.ok(!b.disallowedTools!.includes('mcp__hydor__show_html') && !b.disallowedTools!.includes('mcp__hydor__remember'));
  assert.equal(b.codexConfig, undefined);
});

test('Codex: web_search "disabled" and the app’s web tools off, only without the web', () => {
  const a = spawnFor(offline, '', codex, appTools);
  assert.deepEqual(a.codexConfig, { web_search: 'disabled' });
  assert.deepEqual(a.disallowedTools, ['mcp__hydor__web_search', 'mcp__hydor__read_page', 'mcp__hydor__http_request']);
  assert.equal(a.strictMcp, undefined);
  const b = spawnFor(reader, '', codex, appTools);
  assert.equal(b.codexConfig, undefined);
  assert.equal(b.disallowedTools, undefined);
});

// ---- through the registry and the real adapters ------------------------------------------------------

const fakeApp = Fastify();
const live = new Map<string, { key: string; agent: 'claude' | 'codex' | 'acp'; cwd: string; acpAgent?: string }>();
const fakeSearch: Feature = {
  id: 'fake-search',
  tools: () =>
    ['web_search', 'read_page'].map((name) => ({ name, description: name, inputSchema: { type: 'object', properties: {} }, run: async () => 'ok' })),
};
const deps = {
  app: fakeApp,
  db,
  sessions: { liveByRun: (runId: string) => live.get(runId) ?? null } as unknown as SessionManager,
  broadcast: () => {},
  toSubscribers: () => {},
  publicBase: () => 'http://127.0.0.1',
} as unknown as Deps;
registerFeatures([pages, fakeSearch, assistants], deps);
const info = (agent: SpawnInfo['agent'], extra: Record<string, unknown>, acpAgent?: string): SpawnInfo => ({ agent, acpAgent, key: `${agent}:k1`, cwd: tmp, runId: 'run1', resume: false, extra });

test('the feature through the registry: Claude Code’s command line', async () => {
  const mine = saveAssistant(db, { ...offline, id: undefined });
  const add = await spawnAdditions(info('claude', { assistant: mine.id }));
  // The assistant's block, beside the capabilities' own notes (Pages').
  const own = add.instructions.filter((t) => t.startsWith('# Agent:'));
  assert.equal(own.length, 1);
  assert.match(own[0], /# Agent: Offline/);
  assert.ok(add.instructions.some((t) => t.startsWith('Pages:')));
  assert.ok(add.disallowedTools.includes('mcp__hydor__web_search') && add.disallowedTools.includes('mcp__hydor__read_page'));
  const spec = claudeSpec({ cwd: tmp, sessionId: '00000000-0000-4000-8000-000000000001', pageServer: 'http://127.0.0.1:1/mcp/run/x', add }, {});
  const at = spec.args.indexOf('--disallowedTools');
  assert.ok(at > 0, 'has --disallowedTools');
  assert.deepEqual(spec.args[at + 1].split(','), add.disallowedTools);
  assert.ok(spec.args.includes('--strict-mcp-config'));
  // Claude Code would give up on the app's own tools after a minute (a video takes several).
  const mcp = JSON.parse(fs.readFileSync(spec.args[spec.args.indexOf('--mcp-config') + 1], 'utf8'));
  assert.equal(mcp.mcpServers.hydor.timeout, 600_000);
  assert.match(spec.args[spec.args.indexOf('--append-system-prompt') + 1], /# Agent: Offline/);
  // No assistant and no tone: no limits, and only the capabilities' notes in the instructions.
  const plain = claudeSpec({ cwd: tmp, sessionId: '00000000-0000-4000-8000-000000000002', add: await spawnAdditions(info('claude', {})) }, {});
  assert.ok(!plain.args.includes('--disallowedTools') && !plain.args.includes('--strict-mcp-config'));
  const prompt = plain.args[plain.args.indexOf('--append-system-prompt') + 1];
  assert.match(prompt, /^Pages:/);
  assert.doesNotMatch(prompt, /# Agent:/);
});

/** Answers Codex's app-server requests like the real one would, keeping what was asked. */
class FakeRunner extends EventEmitter {
  calls: { method: string; params: any }[] = [];
  writeLine(o: any) {
    if (o.id == null || !o.method) return;
    this.calls.push({ method: o.method, params: o.params });
    const result = o.method === 'thread/start' ? { thread: { id: 'thread-1' } } : {};
    setImmediate(() => this.emit('line', JSON.stringify({ jsonrpc: '2.0', id: o.id, result }), false));
  }
}

test('the feature through the registry: what Codex’s thread starts with', async () => {
  const mine = listAssistants(db).find((a) => a.name === 'Offline')!;
  const add = await spawnAdditions(info('codex', { assistant: mine.id }));
  const runner = new FakeRunner();
  const lv = new CodexLive(runner as any, { cwd: tmp, pageServer: 'http://127.0.0.1:1/mcp/run/x', mode: 'auto', add });
  await lv.boot();
  const start = runner.calls.find((c) => c.method === 'thread/start')!.params;
  assert.equal(start.config.web_search, 'disabled');
  assert.deepEqual(start.config.mcp_servers.hydor.disabled_tools, ['web_search', 'read_page']);
  assert.equal(start.config.mcp_servers.hydor.default_tools_approval_mode, 'approve');
  assert.match(start.config.developer_instructions, /# Agent: Offline[\s\S]*Use the shell only to read/);
  // An assistant that allows everything changes nothing in Codex's settings.
  const r2 = new FakeRunner();
  await new CodexLive(r2 as any, { cwd: tmp, pageServer: 'http://127.0.0.1:1/mcp/run/x', add: await spawnAdditions(info('codex', { assistant: 'writer' })) }).boot();
  const s2 = r2.calls.find((c) => c.method === 'thread/start')!.params;
  assert.equal(s2.config.web_search, undefined);
  assert.equal(s2.config.mcp_servers.hydor.disabled_tools, undefined);
});

test('Custom: nothing at its start (it reads the context before each turn), the same block there', async () => {
  const add = await spawnAdditions(info('acp', { assistant: 'tutor' }, 'console'));
  assert.ok(!add.instructions.some((t) => t.includes('# Agent:')));
  const text = await assistants.context!({ key: 'acp:k1', cwd: tmp, extra: { assistant: 'tutor' } }, deps);
  assert.match(String(text), /^# Agent: Tutor\n/);
});

/** Answers like an ACP agent would (initialize, session/new, session/prompt), keeping what was asked. */
let acpSessions = 0;
class FakeAcpRunner extends EventEmitter {
  meta = { runId: 'run-acp' };
  calls: { method: string; params: any }[] = [];
  writeLine(o: any) {
    if (o.id == null || !o.method) return;
    this.calls.push({ method: o.method, params: o.params });
    const result = o.method === 'initialize' ? { protocolVersion: 1, agentCapabilities: {} } : o.method === 'session/new' ? { sessionId: `acp-${++acpSessions}` } : o.method === 'session/prompt' ? { stopReason: 'end_turn' } : o.method === '_hydor/message' ? { accepted: true } : {};
    setImmediate(() => this.emit('line', JSON.stringify({ jsonrpc: '2.0', id: o.id, result }), false));
  }
}

test('another ACP agent: the instructions go with the first message of each ACP session, not into the transcript', async () => {
  const add = await spawnAdditions(info('acp', { assistant: 'tutor' }, 'gemini'));
  assert.ok(add.instructions.some((t) => t.startsWith('# Agent: Tutor')));
  const transcript = path.join(tmp, 'acp-brief.jsonl');
  fs.writeFileSync(transcript, JSON.stringify({ t: 'meta', agent: 'gemini' }) + '\n');
  const def = { id: 'gemini', name: 'Gemini CLI', command: 'gemini', args: [] };
  const prompts = (r: FakeAcpRunner) => r.calls.filter((c) => c.method === 'session/prompt').map((c) => c.params.prompt.map((b: any) => b.text));
  const turn = async (lv: AcpLive, text: string) => {
    await lv.sendMessage(text, []);
    for (let i = 0; i < 50 && lv.state.status !== 'idle'; i++) await new Promise((r) => setTimeout(r, 5));
  };
  const runner = new FakeAcpRunner();
  const lv = new AcpLive(runner as any, { cwd: tmp, id: 'acp-brief', def, transcript, add });
  await lv.boot(false);
  await turn(lv, 'Hello');
  await turn(lv, 'And then?');
  const [first, second] = prompts(runner);
  assert.equal(first.length, 2);
  assert.match(first[0], /^<naget-instructions>\n[\s\S]*# Agent: Tutor[\s\S]*<\/naget-instructions>$/);
  assert.equal(first[1], 'Hello');
  assert.deepEqual(second, ['And then?']);
  // The transcript has the user's words alone.
  const lines = fs.readFileSync(transcript, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(lines.filter((l) => l.t === 'prompt').map((l) => l.text), ['Hello', 'And then?']);
  // The app restarted (a new adapter on the same run): the session had them already.
  const again = new AcpLive(runner as any, { cwd: tmp, id: 'acp-brief', def, transcript, add, acpSession: 'acp-1' });
  await turn(again, 'Still there?');
  assert.deepEqual(prompts(runner)[2], ['Still there?']);
  // A new ACP session (the agent could not reopen the old one) gets them again; Custom never does.
  const fresh = new AcpLive(new FakeAcpRunner() as any, { cwd: tmp, id: 'acp-brief', def, transcript, add });
  await fresh.boot(true);
  await turn(fresh, 'Back again');
  assert.equal(prompts((fresh as any).runner)[0].length, 2);
  const customRunner = new FakeAcpRunner();
  const own = new AcpLive(customRunner as any, { cwd: tmp, id: 'acp-own', def: { ...def, id: 'console', name: 'Custom' }, transcript: path.join(tmp, 'acp-own.jsonl'), add });
  await own.boot(false);
  await turn(own, 'Hi');
  assert.deepEqual(prompts(customRunner)[0], ['Hi']);
});

test('an ACP agent that takes MCP servers only as commands gets the app’s servers through a bridge; one that refuses them is asked again without', async () => {
  const def = { id: 'hermes', name: 'Hermes Agent', command: 'hermes', args: ['acp'] };
  const add: any = { instructions: [], env: {}, notes: [], mcpServers: { files: { type: 'http', url: 'http://127.0.0.1:1/files', headers: { Authorization: 'Bearer x' } }, tools: { command: 'tool-server', args: ['--stdio'] } } };
  const sent = (r: FakeAcpRunner) => r.calls.find((c) => c.method === 'session/new')!.params.mcpServers as any[];
  // No HTTP in its handshake: every server goes as a command, the app's own through the bridge.
  const plain = new FakeAcpRunner();
  const a = new AcpLive(plain as any, { cwd: tmp, id: 'acp-bridge', def, transcript: path.join(tmp, 'acp-bridge.jsonl'), pageServer: 'http://127.0.0.1:1/mcp/run/r', add });
  await a.boot(false);
  const servers = sent(plain);
  assert.deepEqual(servers.map((x) => x.name), ['files', 'tools', 'hydor']);
  assert.ok(servers.every((x) => !x.type && x.command), 'commands only');
  assert.match(servers[2].args[0], /mcpbridge\.js$/);
  assert.equal(servers[2].args[1], 'http://127.0.0.1:1/mcp/run/r');
  assert.deepEqual(servers[0].env, [{ name: 'HYDOR_MCP_HEADERS', value: JSON.stringify({ Authorization: 'Bearer x' }) }], 'headers travel in the environment');
  assert.deepEqual(servers[1], { name: 'tools', command: 'tool-server', args: ['--stdio'], env: [] });
  // HTTP in its handshake: by address, as before.
  class HttpRunner extends FakeAcpRunner {
    override writeLine(o: any) {
      if (o.method === 'initialize') {
        this.calls.push({ method: o.method, params: o.params });
        return setImmediate(() => this.emit('line', JSON.stringify({ jsonrpc: '2.0', id: o.id, result: { protocolVersion: 1, agentCapabilities: { mcpCapabilities: { http: true } } } }), false));
      }
      super.writeLine(o);
    }
  }
  const web = new HttpRunner();
  await new AcpLive(web as any, { cwd: tmp, id: 'acp-http', def, transcript: path.join(tmp, 'acp-http.jsonl'), pageServer: 'http://127.0.0.1:1/mcp/run/r', add }).boot(false);
  assert.deepEqual(sent(web).map((x) => [x.type, x.name]), [['http', 'files'], [undefined, 'tools'], ['http', 'hydor']]);
  // OpenClaw's bridge refuses MCP servers: asked again with none, and the transcript says so.
  class Refuses extends FakeAcpRunner {
    override writeLine(o: any) {
      if (o.method === 'session/new' && o.params.mcpServers.length) {
        this.calls.push({ method: o.method, params: o.params });
        return setImmediate(() => this.emit('line', JSON.stringify({ jsonrpc: '2.0', id: o.id, error: { code: -32603, message: 'ACP bridge mode does not support per-session MCP servers.' } }), false));
      }
      super.writeLine(o);
    }
  }
  const refusing = new Refuses();
  const transcript = path.join(tmp, 'acp-refuse.jsonl');
  const r = new AcpLive(refusing as any, { cwd: tmp, id: 'acp-refuse', def: { ...def, id: 'openclaw', name: 'OpenClaw' }, transcript, pageServer: 'http://127.0.0.1:1/mcp/run/r', add });
  await r.boot(false);
  const opened = refusing.calls.filter((c) => c.method === 'session/new');
  assert.equal(opened.length, 2);
  assert.deepEqual(opened[1].params.mcpServers, []);
  assert.match(fs.readFileSync(transcript, 'utf8'), /OpenClaw does not take MCP servers from the app/);
  assert.equal(r.state.status, 'idle', 'and the session is open');
});

test('permission requests become approval cards: Hermes’s five options, Pi’s dialogs without their plumbing', async () => {
  const runner = new FakeAcpRunner();
  const lv = new AcpLive(runner as any, { cwd: tmp, id: 'acp-perm', def: { id: 'pi', name: 'Pi', command: 'pi-acp', args: [] }, transcript: path.join(tmp, 'acp-perm.jsonl') });
  await lv.boot(false);
  const ask = (id: number, params: object) => runner.emit('line', JSON.stringify({ jsonrpc: '2.0', id, method: 'session/request_permission', params: { sessionId: 'acp-1', ...params } }), false);
  ask(7, {
    toolCall: { toolCallId: 'pi-ui-1', title: 'Dangerous command: rm -rf x\nAllow?', kind: 'other', rawInput: { method: 'select', title: 'Dangerous command: rm -rf x', options: ['Yes', 'No'] } },
    options: [
      { optionId: 'choice-0', name: 'Yes', kind: 'allow_once' },
      { optionId: 'choice-1', name: 'No', kind: 'allow_once' },
    ],
  });
  ask(8, {
    toolCall: { toolCallId: 'perm-check-1', title: 'delete in root path: rm -rf x', kind: 'execute', rawInput: { command: 'rm -rf x' } },
    options: [
      { optionId: 'allow_once', name: 'Allow once', kind: 'allow_once' },
      { optionId: 'allow_session', name: 'Allow for session', kind: 'allow_always' },
      { optionId: 'deny', name: 'Deny', kind: 'reject_once' },
    ],
  });
  const cards = [...lv.approvals.values()];
  assert.equal(lv.state.status, 'waiting');
  assert.equal(cards.length, 2);
  assert.equal(cards[0].detail, '', 'a dialog’s title says it all');
  assert.deepEqual(cards[0].options.map((o) => o.style), ['primary', 'danger'], 'a plain No is not a primary button');
  assert.equal(cards[1].kind, 'command');
  assert.equal(cards[1].detail, 'rm -rf x');
  assert.deepEqual(cards[1].options.map((o) => o.id), ['allow_once', 'allow_session', 'deny']);
  await lv.answer('8', { decision: 'deny' });
  await lv.answer('7', { decision: 'choice-0' });
  assert.equal(lv.approvals.size, 0);
});

test('Custom accepts a follow-up while prompting without ending the running turn', async () => {
  class BusyRunner extends FakeAcpRunner {
    promptId?: string;
    override writeLine(o: any) {
      if (o.method === 'session/prompt') {
        this.promptId = o.id;
        this.calls.push({ method: o.method, params: o.params });
      } else super.writeLine(o);
    }
  }
  const runner = new BusyRunner();
  const transcript = path.join(tmp, 'acp-follow.jsonl');
  const lv = new AcpLive(runner as any, { cwd: tmp, id: 'follow', def: { id: 'console', name: 'Custom', command: '', args: [] }, transcript });
  await lv.boot(false);
  await lv.sendMessage('First task', []);
  try {
    await lv.sendMessage('Use this correction', [{ mediaType: 'image/png', data: 'aW1hZ2U=' }]);
    assert.equal(lv.state.status, 'working');
    assert.equal(runner.calls.filter((c) => c.method === 'session/prompt').length, 1);
    const follow = runner.calls.find((c) => c.method === '_hydor/message');
    assert.ok(follow);
    assert.equal(follow.params.prompt[0].text, 'Use this correction');
    const records = fs.readFileSync(transcript, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.deepEqual(records.filter((l) => l.t === 'prompt').map((l) => l.text), ['First task', 'Use this correction']);
    assert.ok(!records.some((l) => l.t === 'end'));
  } finally {
    runner.emit('line', JSON.stringify({ id: runner.promptId, result: { stopReason: 'end_turn' } }), false);
  }
});

// ---- .claude/agents files ---------------------------------------------------------------------------

test('an agent file: frontmatter fields, comma tools, a model, the body as the prompt', () => {
  const a = parseAgentFile(
    [
      '---',
      'name: code-reviewer',
      'description: Expert code review specialist. Use proactively after writing code.',
      'tools: Read, Grep, Glob, Bash',
      'model: sonnet',
      'color: blue',
      '---',
      '',
      'You are a senior code reviewer.',
      '',
      'When invoked: run git diff.',
    ].join('\n'),
    '/home/x/.claude/agents/code-reviewer.md',
  );
  assert.equal(a.name, 'Code reviewer');
  assert.equal(a.description, 'Expert code review specialist.');
  assert.equal(a.instructions, 'You are a senior code reviewer.\n\nWhen invoked: run git diff.');
  assert.deepEqual(a.tools, ['read', 'run']);
  assert.equal(a.agent, 'claude');
  assert.equal(a.model, 'sonnet');
  assert.equal(a.icon, 'code');
  assert.equal(a.folder, 'project');
  assert.equal(a.source, '/home/x/.claude/agents/code-reviewer.md');
});

test('an agent file: a quoted description with examples and escapes, list tools, inherit, mode and skills', () => {
  const src = [
    '---',
    'name: "Research Helper"',
    'description: "Use this agent when you need to dig into a topic, e.g. a market.\\n\\n<example>\\nContext: x\\n</example>"',
    'model: inherit',
    'tools:',
    '  - WebSearch',
    '  - WebFetch',
    '  - Read',
    '  - TodoWrite',
    '  - mcp__notion__search',
    'permissionMode: acceptEdits',
    'skills: deep-research, citations',
    '---',
    'Find sources.',
  ].join('\n');
  const a = parseAgentFile(src);
  assert.equal(a.name, 'Research Helper');
  assert.equal(a.description, 'Use this agent when you need to dig into a topic, e.g. a market.');
  assert.equal(a.agent, undefined);
  assert.equal(a.model, undefined);
  assert.deepEqual(a.tools, ['read', 'web', 'mcp']);
  assert.equal(a.mode, 'edits');
  assert.deepEqual(a.skills, ['deep-research', 'citations']);
  assert.equal(a.icon, 'telescope');
});

test('an agent file: block descriptions, inline lists, no tools (everything), a name from the file', () => {
  const { data } = parseFrontmatter('---\ndescription: >\n  Folds these\n  lines.\nnotes: |\n  kept\n  as is\ntools: [Edit, "Write"]\n---\nbody');
  assert.equal(data.description, 'Folds these lines.');
  assert.equal(data.notes, 'kept\nas is');
  assert.deepEqual(data.tools, ['Edit', 'Write']);
  const a = parseAgentFile('---\ndescription: Plans releases\n---\nPlan.', '/p/.claude/agents/release_planner.md');
  assert.equal(a.name, 'Release planner');
  assert.equal(a.tools, undefined);
  assert.equal(a.icon, 'calendar-check');
  assert.equal(parseAgentFile('No frontmatter here.', 'notes.md').instructions, 'No frontmatter here.');
  assert.deepEqual(parseAgentFile('---\nname: x\ntools: Bash(git *), Read\n---\n').tools, ['read', 'run']);
  assert.throws(() => parseAgentFile('---\ndescription: nameless\n---\n'), /no name/);
});

test('agent files are found in ~/.claude/agents and the folder’s .claude/agents', () => {
  const home = path.join(tmp, 'claude-home');
  const proj = path.join(tmp, 'proj');
  fs.mkdirSync(path.join(home, 'agents'), { recursive: true });
  fs.mkdirSync(path.join(proj, '.claude', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(home, 'agents', 'writer.md'), '---\nname: writer\ndescription: Writes well.\n---\nWrite.');
  fs.writeFileSync(path.join(proj, '.claude', 'agents', 'tester.md'), '---\nname: tester\ndescription: Runs the tests.\n---\nTest.');
  fs.writeFileSync(path.join(proj, '.claude', 'agents', 'README.txt'), 'not an agent');
  const before = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = home;
  try {
    const found = findAgentFiles(proj);
    assert.deepEqual(
      found.map((f) => [f.scope, f.name, f.description]),
      [
        ['user', 'Writer', 'Writes well.'],
        ['project', 'Tester', 'Runs the tests.'],
      ],
    );
  } finally {
    if (before === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = before;
  }
});

// ---- task folders -----------------------------------------------------------------------------------

test('task folder names: the day, then a few words of the prompt', () => {
  assert.equal(taskFolderName('Plan a trip to Lisbon for 4 days in May', '2026-10-31'), '2026-10-31-plan-trip-lisbon-4-days');
  assert.equal(slugOf('Can you help me write a cover letter?'), 'write-cover-letter');
  assert.equal(slugOf('Résumé für Müller: übersetzen'), 'resume-fur-muller-ubersetzen');
  assert.equal(slugOf('Σχέδιο για ταξίδι στη Λισαβόνα'), 'σχεδιο-για-ταξιδι-στη-λισαβονα');
  assert.equal(slugOf('Summarize https://example.com/very/long/path?x=1 please'), 'summarize');
  assert.equal(slugOf('/goal make the tests pass'), 'tests-pass');
  assert.equal(slugOf('🙂 !!!'), 'task');
  assert.equal(slugOf(''), 'task');
  assert.equal(slugOf('Supercalifragilisticexpialidocious-and-then-some-more words'), 'supercalifragilisticexpialidocious-then');
  assert.ok([...slugOf('a'.repeat(80))].length === 40);
  assert.match(dayIn('UTC', Date.UTC(2026, 9, 31, 23, 30)), /^2026-10-31$/);
  assert.equal(dayIn('Asia/Tokyo', Date.UTC(2026, 9, 31, 23, 30)), '2026-11-01');
});

test('task folders are made under the root, -2 when the name is taken', () => {
  const root = path.join(tmp, 'Naget');
  const a = makeTaskFolder(root, 'Plan a party', '2026-10-31');
  const b = makeTaskFolder(root, 'Plan a party', '2026-10-31');
  assert.equal(a, path.join(root, '2026-10-31-plan-party'));
  assert.equal(b, path.join(root, '2026-10-31-plan-party-2'));
  assert.ok(fs.statSync(a).isDirectory() && fs.statSync(b).isDirectory());
});

// ---- store, settings and the API for other capabilities ------------------------------------------

test('the store: built-ins first and fixed, the user’s own saved, changed and deleted', () => {
  const ids = listAssistants(db).map((a) => a.id);
  assert.deepEqual(ids.slice(0, 7), ['general', 'researcher', 'writer', 'coder', 'tutor', 'planner', 'analyst']);
  assert.throws(() => saveAssistant(db, { id: 'writer', name: 'Mine now' }), /duplicate one/);
  const made = saveAssistant(db, { name: 'Bookkeeper', icon: 'wallet', instructions: 'Keep the books.', agent: 'acp', acpAgent: 'console', model: 'qwen3', tools: ['read', 'edit', 'run', 'web', 'mcp'], connections: ['gmail', 'gmail', ''], mode: 'edits' });
  assert.match(made.id, /^bookkeeper-[0-9a-f]{4}$/);
  assert.equal(made.tools, undefined, 'every kind is the same as no limit');
  assert.deepEqual(made.connections, ['gmail']);
  assert.equal(assistantById(made.id, db)?.name, 'Bookkeeper');
  const changed = saveAssistant(db, { ...made, name: 'Books', tools: [] });
  assert.equal(changed.id, made.id);
  assert.deepEqual(assistantById(made.id, db)?.tools, [], 'nothing allowed is kept as such');
  assert.equal(assistantById('nope', db), null);
  assert.equal(assistantById(undefined, db), null);
  const gone = saveAssistant(db, { name: 'Short-lived' });
  removeAssistant(db, gone.id);
  assert.equal(assistantById(gone.id, db), null);
  assert.throws(() => removeAssistant(db, 'general'), /cannot be deleted/);
});

test('cleaning what the pages send', () => {
  assert.throws(() => cleanAssistant({ name: '  ' }), /name/);
  assert.throws(() => cleanAssistant({ name: 'X', agent: 'acp' }), /which agent/);
  const c = cleanAssistant({ name: 'X'.repeat(100), icon: 'nope', tools: ['read', 'fly'], mode: 'yolo', model: 'm', folder: 'elsewhere' });
  assert.equal(c.name.length, 60);
  assert.equal(c.icon, 'bot');
  assert.deepEqual(c.tools, ['read']);
  assert.equal(c.mode, undefined);
  assert.equal(c.model, undefined, 'a model only with an agent');
  assert.equal(c.folder, 'task');
});

test('assistantStart: the suggested agent, model and mode in the agent’s own names, and the session settings', () => {
  const books = listAssistants(db).find((a) => a.name === 'Books')!;
  saveAssistant(db, { ...books, tools: undefined });
  const s = assistantStart(books.id, {}, db)!;
  assert.deepEqual(s, { agent: 'acp', acpAgent: 'console', model: 'qwen3', mode: 'edits', extra: { assistant: books.id, connections: { gmail: true } } });
  const c = assistantStart(books.id, { agent: 'claude' }, db)!;
  assert.deepEqual(c, { agent: 'claude', acpAgent: undefined, model: undefined, mode: 'acceptEdits', extra: { assistant: books.id, connections: { gmail: true } } });
  assert.deepEqual(assistantStart('writer', {}, db), { agent: undefined, acpAgent: undefined, model: undefined, mode: undefined, extra: { assistant: 'writer' } });
  assert.equal(assistantStart('gone', {}, db), null);
  assert.equal(agentMode('full', 'codex'), 'full');
  assert.equal(agentMode('ask', 'codex'), 'read-only');
  assert.equal(agentMode('plan', 'acp', 'gemini'), undefined);
  assert.deepEqual(assistantExtra({ id: 'x', connections: [] }), { assistant: 'x' });
});

test('settings: the tone (trimmed, capped) and the task root (~ read as home)', () => {
  assert.equal(toneOf(db), '');
  setSettings(db, { tone: '  plain English  ', taskRoot: '~/Tasks' });
  assert.equal(toneOf(db), 'plain English');
  assert.equal(taskRoot(db), path.join(os.homedir(), 'Tasks'));
  assert.throws(() => setSettings(db, { taskRoot: 'relative/path' }), /full path/);
  setSettings(db, { taskRoot: '', tone: 'x'.repeat(2000) });
  assert.equal(taskRoot(db), path.join(os.homedir(), 'Naget'));
  assert.equal(toneOf(db).length, 600);
  setSettings(db, { tone: '' });
});

test('settings: cleaning up after a task is on until turned off, and every agent hears of it then', async () => {
  assert.equal(cleanUpOn(db), true);
  const spawnOf = () => cleanup.spawn!({ agent: 'claude', cwd: tmp, runId: 'r', resume: false, extra: {} }, { db } as never);
  assert.match((spawnOf() as { instructions: string[] }).instructions[0], /^Cleaning up: when a task is done/);
  setSettings(db, { cleanUp: false });
  assert.equal(cleanUpOn(db), false);
  assert.equal(spawnOf(), undefined);
  // Anything but a yes or no leaves it as it is.
  setSettings(db, { cleanUp: 'yes' });
  assert.equal(cleanUpOn(db), false);
  setSettings(db, { cleanUp: true });
  assert.equal(cleanUpOn(db), true);
});

test('routes: the list, a task folder, an import, and Custom’s runtime question', async () => {
  await fakeApp.ready();
  const list = await fakeApp.inject({ method: 'GET', url: '/api/assistants' });
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().assistants[0].id, 'general');
  setSettings(db, { taskRoot: path.join(tmp, 'tasks') });
  const tf = await fakeApp.inject({ method: 'POST', url: '/api/assistants/task-folder', payload: { prompt: 'Compare three laptops' } });
  assert.equal(tf.statusCode, 200);
  assert.match(tf.json().path, new RegExp(`^${path.join(tmp, 'tasks')}/\\d{4}-\\d{2}-\\d{2}-compare-three-laptops$`));
  assert.ok(fs.statSync(tf.json().path).isDirectory());
  const file = path.join(tmp, 'proj', '.claude', 'agents', 'tester.md');
  const im = await fakeApp.inject({ method: 'POST', url: '/api/assistants/import', payload: { path: file } });
  assert.equal(im.statusCode, 200);
  const again = await fakeApp.inject({ method: 'POST', url: '/api/assistants/import', payload: { path: file } });
  assert.equal(again.json().assistant.id, im.json().assistant.id, 'importing again updates it');
  assert.equal(listAssistants(db).filter((a) => a.source === file).length, 1);
  const bad = await fakeApp.inject({ method: 'POST', url: '/api/assistants/import', payload: { path: path.join(tmp, 'test.db') } });
  assert.equal(bad.statusCode, 400);
  // Custom asks which tools its assistant allows, with its run's token.
  const mine = listAssistants(db).find((a) => a.name === 'Offline')!;
  live.set('run-custom', { key: 'acp:s1', agent: 'acp', cwd: tmp, acpAgent: 'console' });
  setSessionExtra(db, 'acp:s1', { assistant: mine.id });
  const ok = await fakeApp.inject({ method: 'GET', url: `/agent/run/${runToken('run-custom')}/assistant` });
  assert.deepEqual(ok.json(), { tools: ['read'] });
  setSessionExtra(db, 'acp:s1', { assistant: 'writer' });
  assert.deepEqual((await fakeApp.inject({ method: 'GET', url: `/agent/run/${runToken('run-custom')}/assistant` })).json(), { tools: null });
  const forged = await fakeApp.inject({ method: 'GET', url: '/agent/run/run-custom.forged/assistant' });
  assert.equal(forged.statusCode, 403);
});

// ---- switching a session's assistant ---------------------------------------------------------------------

test('the note after a switch: the switch alone when the agent has the new instructions, else the new block too', () => {
  const writer = BUILTINS.find((a) => a.id === 'writer')!;
  assert.equal(
    switchNote(researcher, writer, claude, true),
    'The user switched this session\'s agent from Researcher to Writer. Its instructions ("# Agent: Writer") are now in yours: work that way from here on.',
  );
  const full = switchNote(researcher, writer, claude, false);
  assert.match(full, /^The user switched this session's agent from Researcher to Writer\. From here on, work as below; this takes the place of the agent instructions you had before\.\n\n# Agent: Writer\nThe user picked this agent for this session\./);
  assert.ok(full.includes(writer.instructions));
  assert.match(switchNote(null, offline, codex, false), /^The user picked the Offline agent for this session\. From here on, work as below\.\n\n# Agent: Offline\n[\s\S]*Limits: in this session do not/);
});

test('switching a session’s assistant: its settings, connections, model and mode; a fresh agent before the next message; the note once', async () => {
  const key = 'claude:switch-1';
  const calls = { configure: [] as unknown[], recycled: [] as string[], summaries: [] as string[] };
  const run = new Map<string, string>();
  const state = { status: 'idle' } as { status: string; goal?: unknown; backgroundTasks?: unknown[] };
  Object.assign(deps.sessions, {
    summary: (k: string) => (k === key ? { key, agent: 'claude' } : k === 'acp:switch-2' ? { key: k, agent: 'acp', acpAgent: 'console' } : null),
    configure: async (k: string, cfg: unknown) => void calls.configure.push([k, cfg]),
    queueSummary: (k: string) => void calls.summaries.push(k),
    runOf: (k: string) => run.get(k),
    adapterByRun: () => ({ state }),
    recycle: async (k: string) => void calls.recycled.push(k),
  });
  /** The agent's process started (or started afresh) with the session's assistant as it is now. */
  const started = async (runId: string) => {
    run.set(key, runId);
    live.set(runId, { key, agent: 'claude', cwd: tmp });
    await spawnAdditions({ agent: 'claude', key, cwd: tmp, runId, resume: true, extra: sessionExtra(db, key) });
  };
  const put = (id: string, k = key) => fakeApp.inject({ method: 'PUT', url: `/api/assistants/session/${encodeURIComponent(k)}`, payload: { id } });
  const mailer = saveAssistant(db, { name: 'Mailer', icon: 'mail', description: 'Answers mail', instructions: 'Answer the mail.', connections: ['gmail'], mode: 'plan', agent: 'claude', model: 'sonnet' });
  setSessionExtra(db, key, { assistant: 'researcher', connections: { slack: false } });
  await started('run-s1');

  // To Mailer: its connections on beside the session's own choices, its model and mode set on the session.
  const r = await put(mailer.id);
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json(), { extra: { assistant: mailer.id, connections: { slack: false, gmail: true } }, model: 'sonnet', mode: 'plan' });
  assert.deepEqual(sessionExtra(db, key), { assistant: mailer.id, connections: { slack: false, gmail: true } });
  assert.deepEqual(calls.configure, [[key, { mode: 'plan', model: 'sonnet' }]]);
  assert.deepEqual(calls.summaries, [key]);

  // A message mid-turn: nothing starts afresh, so the note carries Mailer's block; it is said once.
  state.status = 'working';
  await beforeSend(key);
  assert.deepEqual(calls.recycled, []);
  const note = await messageNotes(key);
  assert.match(note, /^The user switched this session's agent from Researcher to Mailer\. From here on, work as below[\s\S]*# Agent: Mailer\n[\s\S]*Answer the mail\./);
  assert.equal(await messageNotes(key), '');
  // Idle, the agent still has Researcher's instructions: it starts afresh before the next message.
  state.status = 'idle';
  await beforeSend(key);
  assert.deepEqual(calls.recycled, [key]);
  await started('run-s2');
  // Once it has Mailer's, nothing more starts afresh.
  calls.recycled.length = 0;
  await beforeSend(key);
  assert.deepEqual(calls.recycled, []);

  // To Writer while idle: started afresh first, so the note is the switch alone. Mailer's connection goes; the session's own stays.
  assert.deepEqual((await put('writer')).json(), { extra: { assistant: 'writer', connections: { slack: false } } });
  assert.equal(calls.configure.length, 1, 'Writer suggests no model or mode');
  state.goal = { objective: 'x' };
  await beforeSend(key);
  assert.deepEqual(calls.recycled, [], 'not with a goal');
  state.goal = undefined;
  state.backgroundTasks = [{ id: 't1' }];
  await beforeSend(key);
  assert.deepEqual(calls.recycled, [], 'not with work in the background');
  state.backgroundTasks = [];
  await beforeSend(key);
  assert.deepEqual(calls.recycled, [key]);
  await started('run-s3');
  assert.equal(await messageNotes(key), 'The user switched this session\'s agent from Mailer to Writer. Its instructions ("# Agent: Writer") are now in yours: work that way from here on.');

  // Away and back before a message: nothing to say, nothing to start afresh.
  await put('tutor');
  await put('writer');
  calls.recycled.length = 0;
  await beforeSend(key);
  assert.deepEqual(calls.recycled, []);
  assert.equal(await messageNotes(key), '');

  // Custom reads its instructions before each turn: never started afresh, and the switch alone.
  const custom = 'acp:switch-2';
  setSessionExtra(db, custom, { assistant: 'general' });
  run.set(custom, 'run-c1');
  live.set('run-c1', { key: custom, agent: 'acp', cwd: tmp, acpAgent: 'console' });
  await put('planner', custom);
  await beforeSend(custom);
  assert.deepEqual(calls.recycled, []);
  assert.match(await messageNotes(custom), /^The user switched this session's agent from General to Planner\. Its instructions/);

  // No such assistant, no such session.
  assert.equal((await put('nobody')).statusCode, 404);
  assert.equal((await put('writer', 'claude:nowhere')).statusCode, 404);
  assert.equal(sessionExtra(db, 'claude:nowhere').assistant, undefined);
});

// ---- Custom's tool limits -------------------------------------------------------------------------------

test('tool kinds: Custom’s own, the app’s (by name, both spellings), given servers, the user’s', () => {
  const given = ['naget-agent', 'my-notion'];
  const k = (n: string) => toolKind(n, given);
  assert.deepEqual(['read_file', 'list_dir', 'glob', 'grep', 'write_file', 'edit_file', 'bash', 'web_fetch', 'todo_write', 'skill'].map(k), ['read', 'read', 'read', 'read', 'edit', 'edit', 'run', 'web', null, null]);
  assert.deepEqual(['multi_edit', 'apply_patch', 'bash_output', 'bash_kill', 'find_tools'].map(k), ['edit', 'edit', 'run', 'run', null]);
  assert.equal(k('mcp__naget_agent__web_search'), 'web');
  assert.equal(k('mcp__hydor__read_page'), 'web');
  assert.equal(k('mcp__naget_agent__http_request'), 'web');
  assert.equal(k('mcp__naget_agent__show_html'), null);
  assert.equal(k('mcp__naget_agent__remember'), null);
  // Custom calls the app's own tools by their short names.
  assert.deepEqual(['web_search', 'read_page', 'browser_open', 'read_document', 'show_html', 'remember', 'generate_image'].map(k), ['web', 'web', 'web', 'read', null, null, null]);
  assert.equal(k('mcp__my_notion__search_pages'), null, 'a connected app the app gave the session');
  assert.equal(k('mcp__filesystem__read'), 'mcp', 'the user’s own server');
  assert.equal(toolAllowed('bash', null), true);
  assert.equal(toolAllowed('bash', ['read']), false);
  assert.equal(toolAllowed('todo_write', []), true);
  assert.equal(toolAllowed('mcp__filesystem__read', ['read', 'web']), false);
  assert.equal(toolAllowed('mcp__filesystem__read', ['mcp']), true);
});

/** A fake MCP server over Streamable HTTP with these tools. */
const mcpHandler = (tools: string[]) => (body: any) =>
  body.method === 'initialize'
    ? { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'fake', version: '1' } }
    : body.method === 'tools/list'
      ? { tools: tools.map((name) => ({ name, description: name, inputSchema: { type: 'object', properties: {} } })) }
      : {};

test('Custom offers the model only the tools its assistant allows (a real run of agent.js)', async () => {
  const agentJs = path.join(APP_ROOT, 'dist/server/agent.js');
  if (!fs.existsSync(agentJs)) throw new Error(`${agentJs} is missing: npm run build:server first`);
  let offered: string[] | null = null;
  let allowed: string[] | null = ['read'];
  let holdReply: ((release: () => void) => void) | undefined;
  let lastMessages: any[] = [];
  let nextDelta: any;
  let holdTool: ((release: () => void) => void) | undefined;
  const servers: Record<string, (b: any) => unknown> = {
    hydor: mcpHandler(['show_html', 'web_search', 'read_page', 'remember']),
    notion: mcpHandler(['search_pages']),
    mine: mcpHandler(['do_thing']),
  };
  const srv = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => (raw += d));
    req.on('end', () => {
      const url = req.url ?? '';
      const json = (code: number, v: unknown) => (res.writeHead(code, { 'content-type': 'application/json' }), res.end(JSON.stringify(v)));
      if (url === '/agent/run/tok/context') return json(200, { text: '' });
      if (url === '/agent/run/tok/assistant') return json(200, { tools: allowed });
      const mcp = /^\/mcp\/([\w-]+)$/.exec(url);
      if (mcp && servers[mcp[1]]) {
        const body = JSON.parse(raw || '{}');
        if (body.id == null) return res.writeHead(202).end();
        const reply = () => json(200, { jsonrpc: '2.0', id: body.id, result: servers[mcp[1]](body) });
        if (body.method === 'tools/call' && holdTool) {
          const hold = holdTool;
          holdTool = undefined;
          return hold(reply);
        }
        return reply();
      }
      if (url === '/v1/chat/completions') {
        const body = JSON.parse(raw);
        offered = (body.tools ?? []).map((t: any) => t.function.name);
        lastMessages = body.messages;
        const delta = nextDelta ?? { content: 'Done.' };
        nextDelta = undefined;
        const reply = () => {
          res.writeHead(200, { 'content-type': 'text/event-stream' });
          res.write(`data: ${JSON.stringify({ choices: [{ delta, finish_reason: delta.tool_calls ? 'tool_calls' : 'stop' }] })}\n\n`);
          res.end('data: [DONE]\n\n');
        };
        if (holdReply) {
          const hold = holdReply;
          holdReply = undefined;
          return hold(reply);
        }
        return reply();
      }
      json(404, {});
    });
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  const port = (srv.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  // A home of its own: the user's own MCP server ("mine") in Claude Code's settings, no real ones.
  const home = path.join(tmp, 'custom-home');
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ mcpServers: { mine: { type: 'http', url: `${base}/mcp/mine` } } }));
  const models = path.join(tmp, 'models.json');
  fs.writeFileSync(models, JSON.stringify({ models: [{ id: 'fake', label: 'Fake', provider: 'openai', baseUrl: `${base}/v1`, model: 'fake', tools: 'native', contextLength: 65536 }] }));
  const p = spawn(process.execPath, [agentJs], {
    env: { PATH: process.env.PATH, HOME: home, CODEX_HOME: path.join(home, '.codex'), HYDOR_MODELS: models, HYDOR_STATE: path.join(tmp, 'custom-state'), HYDOR_RUNTIME: `${base}/agent/run/tok` },
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const waiting = new Map<number, (m: any) => void>();
  let buf = '';
  p.stdout.on('data', (d) => {
    buf += d;
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const m = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      if (m.id != null && waiting.has(m.id)) waiting.get(m.id)!(m);
    }
  });
  let seq = 0;
  const call = (method: string, params: unknown) =>
    new Promise<any>((resolve, reject) => {
      const id = ++seq;
      const t = setTimeout(() => reject(new Error(`${method} took too long`)), 30_000);
      waiting.set(id, (m) => (clearTimeout(t), m.error ? reject(new Error(m.error.message)) : resolve(m.result)));
      p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  try {
    await call('initialize', { protocolVersion: 1 });
    const given = [
      { type: 'http', name: 'hydor', url: `${base}/mcp/hydor`, headers: [] },
      { type: 'http', name: 'notion', url: `${base}/mcp/notion`, headers: [] },
    ];
    const { sessionId } = await call('session/new', { cwd: tmp, mcpServers: given });
    const prompt = (text: string) => call('session/prompt', { sessionId, prompt: [{ type: 'text', text }] });
    assert.equal((await prompt('Read the notes.')).stopReason, 'end_turn');
    assert.deepEqual(
      [...offered!].sort(),
      ['glob', 'grep', 'list_dir', 'mcp__notion__search_pages', 'read_file', 'remember', 'show_html', 'skill', 'todo_write'],
      'reading, the plan, skills, the app’s pages and memory, and the connected app; no edits, commands, web or the user’s own server',
    );
    // The next turn asks again: no limits now.
    allowed = null;
    await prompt('Now anything.');
    for (const t of ['bash', 'write_file', 'edit_file', 'web_fetch', 'web_search', 'read_page', 'mcp__mine__do_thing']) assert.ok(offered!.includes(t), `${t} is offered`);
    allowed = ['read', 'web', 'mcp'];
    await prompt('Web and other tools.');
    assert.ok(offered!.includes('web_fetch') && offered!.includes('web_search') && offered!.includes('mcp__mine__do_thing'));
    assert.ok(!offered!.includes('bash') && !offered!.includes('write_file'));
    // A correction sent during a final answer is included in the next model step, in the same turn.
    const held = new Promise<() => void>((resolve) => { holdReply = resolve; });
    const running = call('session/prompt', { sessionId, prompt: [{ type: 'text', text: 'Initial request' }], _meta: { promptId: 'initial' } });
    const release = await held;
    try {
      assert.deepEqual(await call('_hydor/message', { sessionId, prompt: [{ type: 'text', text: 'Correction while working' }], promptId: 'correction' }), { accepted: true });
      assert.deepEqual(await call('_hydor/message', { sessionId, prompt: [{ type: 'text', text: 'One more detail' }], promptId: 'detail' }), { accepted: true });
    } finally {
      release();
    }
    assert.equal((await running).stopReason, 'end_turn');
    const contents = lastMessages.map((m: any) => m.content);
    assert.ok(contents.some((c) => typeof c === 'string' && c.includes('Correction while working')));
    assert.ok(contents.some((c) => typeof c === 'string' && c.includes('One more detail')));
    const state = JSON.parse(fs.readFileSync(path.join(tmp, 'custom-state', `${sessionId}.json`), 'utf8'));
    assert.deepEqual(state.turnLog.ends.slice(-3).map((e: any) => e.id), ['initial', 'correction', 'detail']);
    assert.deepEqual(await call('_hydor/message', { sessionId, prompt: [] }), { accepted: false }, 'an idle agent asks the adapter to start a normal turn');
    // A follow-up during a tool must not split the assistant/tool-result pair or cancel the tool.
    nextDelta = { tool_calls: [{ index: 0, id: 'slow-tool', type: 'function', function: { name: 'remember', arguments: '{}' } }] };
    const toolHeld = new Promise<() => void>((resolve) => { holdTool = resolve; });
    const toolTurn = prompt('Run a tool');
    const releaseTool = await toolHeld;
    try {
      assert.deepEqual(await call('_hydor/message', { sessionId, prompt: [{ type: 'text', text: 'Correction during tool' }], promptId: 'tool-correction' }), { accepted: true });
    } finally {
      releaseTool();
    }
    assert.equal((await toolTurn).stopReason, 'end_turn');
    const toolAt = lastMessages.findIndex((m) => m.tool_calls?.some((c: any) => c.id === 'slow-tool'));
    assert.ok(toolAt >= 0);
    assert.equal(lastMessages[toolAt + 1].role, 'tool');
    assert.equal(lastMessages[toolAt + 1].tool_call_id, 'slow-tool');
    assert.match(lastMessages[toolAt + 2].content, /Correction during tool/);
  } finally {
    p.kill();
    srv.close();
  }
});

// ---- run ----------------------------------------------------------------------------------------------

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.log(`FAIL ${name}`);
    console.log(e);
    process.exitCode = 1;
  }
}
console.log(`\n${passed}/${tests.length} passed`);
await fakeApp.close();
db.close();
fs.rmSync(tmp, { recursive: true, force: true });
