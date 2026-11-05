// Checks for Confidential sessions: which addresses count as this computer or your network (tricky hosts too), which
// models are local (Ollama's cloud ones are not) and which is the best, starting one (Custom and a local model only,
// memory off, no swarm, research or arena; a child of one confidential too), each message refused while its model is
// elsewhere, model switches, hand-offs and settings changes refused, the tools it keeps and the ones it loses (also
// before its settings are stored), what Custom is told, no MCP servers but the app's own, titles without the helper
// model (or with one on this computer), notices without its words, no share links, memory read but never written,
// child sessions told to stay local, second opinions only from local models, other agents (app_api, hands-free
// voice, the Library) kept away from it, and the sandbox's arguments carrying --unshare-net, with, where bwrap runs
// here, a real command that tries the network and fails. Sessions and models are stubs; nothing reaches the network.
// Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/confidential/confidential-test.ts
//   DATA_DIR=/tmp/hydor-test-confidential PRICES_URL= node dist/dev/confidential-test.js
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { CONFIDENTIAL_EXTRA, firstWordsTitle, isConfidential, isLocalAddress } from '../../shared/confidential.ts';
import type { SessionExtra } from '../../shared/features.ts';
import { noticeText } from '../../shared/notice.ts';
import type { Agent, AgentModel, NotifyEvent, SessionSummary } from '../../shared/types.ts';
import { netCutAvailable, netRefused, sandboxArgs, sandboxAvailable, sandboxShell } from '../agent/sandbox.ts';
import { CONSOLE_ID } from '../agents/acp.ts';
import { HttpError } from '../auth.ts';
import { children } from '../children/index.ts';
import { openDb } from '../db.ts';
import { kvSet } from '../db.ts';
import { registerFeatures, runTools, spawnAdditions } from '../features/registry.ts';
import type { Deps, Feature, RunCtx } from '../features/types.ts';
import { createGuestLink } from '../guests.ts';
import { appApi } from '../guide/api.ts';
import { localHelper } from '../helper.ts';
import { OFFLINE_PAGE_CSP, PAGE_CSP } from '../mcp.ts';
import { profileBlock } from '../memory/profile.ts';
import { memoryTools } from '../memory/tools.ts';
import { AGENT_FILE } from '../models/config.ts';
import { rankLocal } from '../models/manager.ts';
import { isCloudModel } from '../models/ollama.ts';
import { opinionOptions } from '../opinion/index.ts';
import type { CreateOpts } from '../sessions.ts';
import { sessionExtra, setSessionExtra } from '../sessionExtra.ts';
import { handsFree } from '../voice/handsfree.ts';
import {
  carriedExtra,
  checkExtraChange,
  checkHandoff,
  checkModelSwitch,
  confidential,
  CONFIDENTIAL_TOOLS,
  confidentialIn,
  confidentialInstructions,
  confidentialStart,
  confidentialTitle,
  localModel,
  NO_LOCAL_MODEL,
  privateHelper,
  privateNotice,
  withoutConfidential,
} from './index.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/') || process.env.PRICES_URL !== '') {
  console.error('Run with DATA_DIR=/tmp/… and PRICES_URL= (empty) so nothing touches real data or the network.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-confidential-test-'));
const db = openDb(path.join(tmp, 'test.db'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

/** An HttpError with this status, whose message matches. */
const refused = (status: number, re: RegExp) => (e: unknown) => e instanceof HttpError && e.status === status && re.test(e.message);

// ---- models: two here, one on the private network, two elsewhere ------------------------------------------

const MODELS: AgentModel[] = [
  { id: 'openrouter/anthropic/claude-sonnet', label: 'Claude Sonnet', provider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'anthropic/claude-sonnet', tools: 'native' },
  { id: 'ollama/qwen3:8b', label: 'qwen3:8b', provider: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen3:8b', tools: 'native', local: true },
  { id: 'ollama/llama3:70b', label: 'llama3:70b', provider: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1', model: 'llama3:70b', tools: 'text', local: true },
  { id: 'endpoint/lab/big', label: 'big (Lab server)', provider: 'endpoint', baseUrl: 'https://lab.example.com/v1', model: 'big', tools: 'native' },
  { id: 'endpoint/box/coder', label: 'coder (Box)', provider: 'endpoint', baseUrl: 'http://192.168.1.20:8000/v1', model: 'coder', tools: 'native', local: true },
];
const SIZES: Record<string, number> = { 'ollama/qwen3:8b': 5e9, 'ollama/llama3:70b': 40e9, 'endpoint/box/coder': 0 };
let installed = MODELS;
const models = {
  agentModels: () => installed,
  localModels: (prefer?: string | null) =>
    rankLocal(
      installed.filter((m) => m.local),
      (m) => SIZES[m.id] ?? 0,
      prefer,
    ),
};
// Custom's models as its process and the helper model read them.
fs.mkdirSync(path.dirname(AGENT_FILE), { recursive: true });
fs.writeFileSync(AGENT_FILE, JSON.stringify({ models: MODELS }));

// ---- sessions ----------------------------------------------------------------------------------------------------

interface Fake {
  agent: Agent;
  acpAgent?: string;
  title: string;
  model?: string;
  live?: string;
}
const fakes = new Map<string, Fake>();
function add(key: string, f: Fake, extra?: SessionExtra) {
  fakes.set(key, f);
  db.prepare('insert or ignore into app_sessions (key, agent, created_at, updated_at) values (?, ?, ?, ?)').run(key, f.agent, Date.now(), Date.now());
  if (extra) setSessionExtra(db, key, extra);
}
const summary = (key: string): SessionSummary | null => {
  const f = fakes.get(key);
  if (!f) return null;
  return {
    key,
    agent: f.agent,
    acpAgent: f.acpAgent,
    id: key,
    title: f.title,
    model: f.model,
    cwd: tmp,
    stats: {} as SessionSummary['stats'],
    live: f.live ? ({ status: f.live, startedAt: 1, pendingApprovals: 0, model: f.model } as SessionSummary['live']) : null,
    extra: sessionExtra(db, key),
    updatedAt: Date.now(),
  };
};
const said: string[] = [];
const sessions = {
  summary,
  list: () => ({ sessions: [...fakes.keys()].map((k) => summary(k)!), total: fakes.size }),
  inbox: () => [],
  timeline: async () => ({ parser: { items: [] }, readMore: async () => {} }),
  deliverOrQueue: async (key: string, text: string) => void said.push(`${key}: ${text}`),
  adapterByRun: () => null,
  liveByRun: (runId: string) => (runId.startsWith('run-') ? { key: runId.slice(4), agent: 'acp' as Agent, cwd: tmp, acpAgent: CONSOLE_ID } : null),
};

const SECRET = 'acp:secret-review';
const PLAIN = 'claude:plain-chat';
const CHILD_OF_SECRET = 'acp:secret-child';
add(SECRET, { agent: 'acp', acpAgent: CONSOLE_ID, title: 'Review of submission 4711', model: 'ollama/qwen3:8b', live: 'idle' }, { ...CONFIDENTIAL_EXTRA });
add(PLAIN, { agent: 'claude', title: 'Weekend trip to Lisbon', model: 'opus', live: 'idle' });
add(CHILD_OF_SECRET, { agent: 'acp', acpAgent: CONSOLE_ID, title: 'Check the proofs', model: 'ollama/qwen3:8b', live: 'idle' }, { ...CONFIDENTIAL_EXTRA, parent: SECRET });

const routes = new Map<string, (req: any, reply?: any) => unknown>();
const app = {
  get: (p: string, h: (req: any) => unknown) => void routes.set(`GET ${p}`, h),
  post: (p: string, h: (req: any) => unknown) => void routes.set(`POST ${p}`, h),
  put: (p: string, h: (req: any) => unknown) => void routes.set(`PUT ${p}`, h),
  delete: (p: string, h: (req: any) => unknown) => void routes.set(`DELETE ${p}`, h),
  // app_api calls the app in-process: here, the sessions list and a session's timeline.
  inject: async (o: { url: string }) => {
    const body = o.url.startsWith('/api/sessions?') || o.url === '/api/sessions' ? { sessions: [{ key: SECRET, title: 'Review of submission 4711' }, { key: PLAIN, title: 'Weekend trip to Lisbon' }], total: 2 } : { items: [] };
    return { statusCode: 200, headers: { 'content-type': 'application/json' }, json: () => body, body: JSON.stringify(body), rawPayload: Buffer.from('') };
  },
};
const deps = { app, db, sessions, models, broadcast: () => {}, toSubscribers: () => {}, publicBase: () => 'https://hydor.test' } as unknown as Deps;
// Another capability that gives every agent an MCP server and an instruction (as connected apps and plugins do).
const outside: Feature = { id: 'outside', spawn: () => ({ mcpServers: { mail: { type: 'http', url: 'https://mail.example.com/mcp' } }, instructions: ['Use the mail server.'] }), tools: () => [] };
registerFeatures([confidential, outside], deps);

let run = 0;
const ctxOf = (key: string, runId = `r${++run}`): RunCtx => ({ runId, key, agent: fakes.get(key)?.agent ?? 'acp', acpAgent: fakes.get(key)?.acpAgent, cwd: tmp, deps });

// ---- addresses ------------------------------------------------------------------------------------------------------

test('this computer and your private network count as local; the rest does not, tricky hosts included', () => {
  const local = [
    'localhost',
    'http://localhost:11434',
    'http://127.0.0.1:8000/v1',
    'http://127.5.6.7',
    '::1',
    'http://[::1]:8080/v1',
    'http://10.1.2.3:8000',
    'http://192.168.0.10/v1',
    'http://172.16.0.1',
    'http://172.31.255.255',
    'http://gpu-box.local:11434',
    'https://lab.gpu-box.local/v1',
    'http://0x7f000001/',
    'http://2130706433/',
    'http://[::ffff:127.0.0.1]/',
    'http://[::ffff:10.0.0.9]:8000',
    'http://[fd00::1]/v1',
    'http://0.0.0.0:8000',
    'HTTP://LOCALHOST:1234',
  ];
  const away = [
    'http://localhost.evil.com',
    'http://localhost.',
    'https://api.openai.com/v1',
    'http://8.8.8.8',
    'http://172.32.0.1',
    'http://172.15.0.1',
    'http://169.254.169.254',
    'http://100.64.0.1',
    'http://localhost@evil.com/',
    'http://evil.com#@localhost',
    'http://evil.com/?h=127.0.0.1',
    'http://127.0.0.1.nip.io',
    'http://10.0.0.1.evil.com',
    'http://[::ffff:8.8.8.8]',
    'http://[fe80::1]',
    'http://[2001:db8::1]',
    'http://local',
    'http://evil.local.com',
    '',
    'not a url',
  ];
  for (const a of local) assert.equal(isLocalAddress(a), true, a);
  for (const a of away) assert.equal(isLocalAddress(a), false, a);
});

test('Ollama’s cloud models are not local; the best local model leads, or the one picked last', () => {
  assert.equal(isCloudModel({ name: 'gpt-oss:120b-cloud' }), true);
  assert.equal(isCloudModel({ name: 'deepseek-v3.1:671b-cloud' }), true);
  assert.equal(isCloudModel({ name: 'kimi:cloud' }), true);
  assert.equal(isCloudModel({ name: 'some-model', remote_host: 'https://ollama.com:443' }), true);
  assert.equal(isCloudModel({ name: 'qwen3:8b' }), false);
  assert.equal(isCloudModel({ name: 'cloudy-llama:7b' }), false);
  // Tools first (native over text), then size: the big text-only model comes last.
  assert.deepEqual(
    models.localModels().map((m) => m.id),
    ['ollama/qwen3:8b', 'endpoint/box/coder', 'ollama/llama3:70b'],
  );
  assert.deepEqual(
    models.localModels('endpoint/box/coder').map((m) => m.id),
    ['endpoint/box/coder', 'ollama/qwen3:8b', 'ollama/llama3:70b'],
  );
  assert.equal(models.localModels('openrouter/anthropic/claude-sonnet')[0].id, 'ollama/qwen3:8b', 'a model elsewhere never leads');
});

// ---- starting one -----------------------------------------------------------------------------------------------------

const start = (o: Partial<CreateOpts>): CreateOpts => confidentialStart(db, { agent: 'acp', acpAgent: CONSOLE_ID, cwd: tmp, ...o } as CreateOpts, deps);

test('a confidential session starts on Custom with a local model (the best when none is named), memory off', () => {
  const o = start({ extra: { confidential: true } });
  assert.equal(o.model, 'ollama/qwen3:8b');
  assert.deepEqual(o.extra, { confidential: true, memory: false });
  assert.equal(start({ model: 'endpoint/box/coder', extra: { confidential: true } }).model, 'endpoint/box/coder', 'an endpoint on the private network');
  assert.throws(() => start({ model: 'openrouter/anthropic/claude-sonnet', extra: { confidential: true } }), refused(409, /runs through OpenRouter/));
  assert.throws(() => start({ model: 'endpoint/lab/big', extra: { confidential: true } }), refused(409, /at Lab server, outside your network/));
  assert.throws(() => start({ model: 'ollama/gone', extra: { confidential: true } }), refused(409, /not available now/));
  assert.throws(() => confidentialStart(db, { agent: 'claude', cwd: tmp, extra: { confidential: true } }, deps), refused(400, /runs on Custom/));
  assert.throws(() => confidentialStart(db, { agent: 'acp', acpAgent: 'gemini', cwd: tmp, extra: { confidential: true } }, deps), refused(400, /runs on Custom/));
  assert.throws(() => start({ extra: { confidential: true, swarm: true } }), refused(400, /Swarm is off/));
  assert.throws(() => start({ extra: { confidential: true, research: { breadth: 3 } as never } }), refused(400, /searches the web/));
  assert.throws(() => start({ extra: { confidential: true, arena: { models: ['x'] } as never } }), refused(400, /other models/));
  const plain = { agent: 'claude' as Agent, cwd: tmp, model: 'opus', extra: { memory: false } };
  assert.equal(confidentialStart(db, plain, deps), plain, 'other sessions start as they are');
  installed = MODELS.filter((m) => !m.local);
  assert.throws(() => start({ extra: { confidential: true } }), refused(409, new RegExp(NO_LOCAL_MODEL.slice(0, 40))));
  installed = MODELS;
});

test('a child of a confidential session is confidential too, on Custom with a local model', () => {
  const o = start({ prompt: 'Check lemma 3', extra: { parent: SECRET } });
  assert.equal(o.model, 'ollama/qwen3:8b');
  assert.equal(isConfidential(o.extra), true);
  assert.equal(o.extra?.memory, false);
  assert.equal(o.extra?.parent, SECRET);
  assert.throws(() => confidentialStart(db, { agent: 'claude', cwd: tmp, extra: { parent: SECRET } }, deps), refused(400, /child of a confidential session/));
  assert.throws(() => start({ model: 'openrouter/anthropic/claude-sonnet', extra: { parent: SECRET } }), refused(409, /OpenRouter/));
  const child = confidentialStart(db, { agent: 'claude', cwd: tmp, extra: { parent: PLAIN } }, deps);
  assert.equal(isConfidential(child.extra), false, 'a child of another session is not');
});

test('each message: refused while its model is elsewhere or gone, or its agent is not Custom', async () => {
  await confidential.beforeSend!(SECRET, deps);
  await confidential.beforeSend!(PLAIN, deps);
  fakes.get(SECRET)!.model = 'openrouter/anthropic/claude-sonnet';
  await assert.rejects(Promise.resolve(confidential.beforeSend!(SECRET, deps)), refused(409, /only models on this computer/));
  fakes.get(SECRET)!.model = 'ollama/llama3:70b';
  installed = MODELS.filter((m) => m.id !== 'ollama/llama3:70b');
  await assert.rejects(Promise.resolve(confidential.beforeSend!(SECRET, deps)), refused(409, /not available now/));
  installed = MODELS;
  await confidential.beforeSend!(SECRET, deps);
  fakes.get(SECRET)!.model = 'ollama/qwen3:8b';
  add('acp:odd', { agent: 'acp', acpAgent: 'gemini', title: 'odd', model: 'ollama/qwen3:8b' }, { confidential: true });
  await assert.rejects(Promise.resolve(confidential.beforeSend!('acp:odd', deps)), refused(409, /Only Custom/));
});

test('switching models, handing off, and changing its settings', () => {
  checkModelSwitch(db, SECRET, 'ollama/llama3:70b', deps);
  checkModelSwitch(db, SECRET, undefined, deps);
  assert.throws(() => checkModelSwitch(db, SECRET, 'openrouter/anthropic/claude-sonnet', deps), refused(409, /OpenRouter/));
  assert.throws(() => checkModelSwitch(db, SECRET, null, deps), refused(400, /keeps a model on this computer/));
  checkModelSwitch(db, PLAIN, 'sonnet', deps);
  assert.throws(() => checkHandoff(db, SECRET), refused(400, /can’t continue in another agent/));
  checkHandoff(db, PLAIN);
  assert.deepEqual(carriedExtra(db, SECRET), { confidential: true, memory: false }, 'forks and edits stay confidential');
  assert.equal(carriedExtra(db, PLAIN), undefined);
  assert.throws(() => checkExtraChange(db, SECRET, { confidential: null }), refused(400, /stays confidential/));
  assert.throws(() => checkExtraChange(db, SECRET, { memory: true }), refused(400, /Memory stays off/));
  assert.throws(() => checkExtraChange(db, SECRET, { memory: null }), refused(400, /Memory stays off/));
  assert.throws(() => checkExtraChange(db, SECRET, { swarm: true }), refused(400, /Swarm/));
  assert.throws(() => checkExtraChange(db, PLAIN, { confidential: true }), refused(400, /from its start/));
  checkExtraChange(db, SECRET, { guidelines: 'British spelling', confidential: true, memory: false });
  checkExtraChange(db, PLAIN, { memory: false, swarm: true });
});

// ---- tools ---------------------------------------------------------------------------------------------------------

/** Every tool the app gives agents (by name), and a few that capabilities may add later. */
const ALL_TOOLS = [
  'web_search', 'read_page', 'find_media', 'browser_open', 'browser_act', 'browser_read', 'browser_tabs', 'browser_upload', 'browser_ask_user', 'computer_screenshot', 'computer_act',
  'http_request', 'run_with_secrets', 'request_secret', 'list_connections', 'generate_image', 'generate_video', 'generate_audio', 'publish_site', 'use_app', 'find_apps', 'app_get', 'app_save',
  'app_try', 'app_screen', 'app_data', 'app_run', 'app_api', 'schedule_task', 'update_task', 'remember', 'forget', 'update_user_profile', 'skill_save', 'skill_patch', 'swarm_post', 'swarm_read',
  'swarm_stop', 'ui_screenshot', 'experiment_run', 'experiment_sweep', 'a_tool_added_next_year',
  'read_document', 'present_files', 'show_html', 'save_page', 'get_page', 'save_doc', 'save_sheet', 'save_slides', 'save_latex', 'save_notebook', 'export_page', 'knowledge_search', 'knowledge_read',
  'knowledge_list', 'recall', 'search_sessions', 'read_session', 'start_child_session', 'child_sessions', 'message_child', 'app_guide', 'ask_form', 'notify_user', 'list_tasks', 'experiment_list',
];
const OFF = ['export_page', 'web_search', 'read_page', 'find_media', 'browser_open', 'browser_act', 'computer_screenshot', 'http_request', 'run_with_secrets', 'request_secret', 'list_connections', 'generate_image', 'generate_video', 'generate_audio', 'publish_site', 'use_app', 'app_save', 'app_api', 'schedule_task', 'update_task', 'remember', 'forget', 'update_user_profile', 'skill_save', 'skill_patch', 'ui_screenshot', 'experiment_run', 'experiment_sweep', 'a_tool_added_next_year'];
const KEPT = ['read_document', 'present_files', 'show_html', 'save_page', 'get_page', 'save_doc', 'save_latex', 'knowledge_search', 'recall', 'search_sessions', 'read_session', 'start_child_session', 'child_sessions', 'message_child', 'app_guide', 'ask_form', 'notify_user'];

test('tools: a confidential session keeps those that work here and loses the rest, new ones too', () => {
  const ctx = ctxOf(SECRET);
  for (const t of OFF) assert.equal(confidential.allowTool!(t, ctx), false, `${t} is off`);
  for (const t of KEPT) assert.equal(confidential.allowTool!(t, ctx), true, `${t} stays`);
  for (const t of ALL_TOOLS) assert.equal(confidential.allowTool!(t, ctxOf(PLAIN)), true, `${t} stays in another session`);
  for (const t of CONFIDENTIAL_TOOLS) assert.ok(!OFF.includes(t));
});

test('tools: a new session started confidential loses them before its settings are stored', () => {
  const add = confidential.spawn!({ agent: 'acp', acpAgent: CONSOLE_ID, cwd: tmp, runId: 'early-run', resume: false, extra: { confidential: true } }, deps) as { env: Record<string, string> };
  assert.deepEqual(add.env, { HYDOR_CONFIDENTIAL: '1' }, 'Custom’s process hears it');
  const unstored = { runId: 'early-run', key: 'acp:not-stored-yet', agent: 'acp' as Agent, cwd: tmp, deps };
  assert.equal(confidential.allowTool!('web_search', unstored), false);
  assert.equal(confidential.allowTool!('read_document', unstored), true);
  assert.equal(confidential.spawn!({ agent: 'claude', cwd: tmp, runId: 'other', resume: false, extra: {} }, deps), undefined);
});

test('an agent starting confidential gets no MCP server from the capabilities; others do', async () => {
  const closed = await spawnAdditions({ agent: 'acp', acpAgent: CONSOLE_ID, cwd: tmp, runId: 'x1', resume: false, extra: { confidential: true } });
  assert.deepEqual(closed.mcpServers, {});
  assert.equal(closed.env.HYDOR_CONFIDENTIAL, '1');
  const open = await spawnAdditions({ agent: 'claude', cwd: tmp, runId: 'x2', resume: false, extra: {} });
  assert.deepEqual(Object.keys(open.mcpServers), ['mail']);
  assert.equal(open.env.HYDOR_CONFIDENTIAL, undefined);
});

test('runTools hides the tools that reach outside from a confidential run', () => {
  const tools = (key: string) => runTools(ctxOf(key)).map((t) => t.name);
  const kit: Feature = {
    id: 'kit',
    tools: () => ['web_search', 'read_document', 'http_request', 'save_doc'].map((name) => ({ name, description: name, inputSchema: { type: 'object' }, run: async () => 'ok' })),
  };
  registerFeatures([confidential, outside, kit], deps);
  assert.deepEqual(tools(SECRET), ['read_document', 'save_doc']);
  assert.deepEqual(tools(PLAIN), ['web_search', 'read_document', 'http_request', 'save_doc']);
  registerFeatures([confidential, outside], deps);
});

test('Custom is told what is off and what stays, and whether commands run without network here', async () => {
  const text = (await confidential.context!({ key: SECRET, cwd: tmp, extra: sessionExtra(db, SECRET) }, deps)) as string;
  assert.match(text, /^# A confidential session/);
  assert.match(text, /web search/);
  assert.match(text, /memory notes to read/);
  assert.equal(await confidential.context!({ key: PLAIN, cwd: tmp, extra: {} }, deps), null);
  assert.match(confidentialInstructions(true), /Your commands run without network/);
  assert.match(confidentialInstructions(false), /the user approves each one/);
});

// ---- nothing sent out about it ---------------------------------------------------------------------------------------

test('titles: from the first words without a helper model here, never asking one elsewhere', async () => {
  assert.equal(firstWordsTitle('Review this paper for NeurIPS please, with care and rigour, tonight'), 'Review this paper for NeurIPS please, with care…');
  assert.equal(firstWordsTitle('## Fix the **flaky** tests.'), 'Fix the flaky tests');
  assert.equal(firstWordsTitle('   \n\n'), null);
  assert.equal(firstWordsTitle(`A ${'very'.repeat(30)} long word`), `A…`);
  let asked = 0;
  const ask = async () => {
    asked++;
    return 'A title';
  };
  // The helper is "auto" (Claude's or Codex's, online): none is asked.
  assert.equal(localHelper(db), null);
  assert.equal(await confidentialTitle(db, 'Review the attached submission for ICLR', ask), 'Review the attached submission for ICLR');
  // An OpenRouter helper: not asked either.
  kvSet(db, 'helper.model', 'openrouter/anthropic/claude-sonnet');
  assert.equal(localHelper(db), null);
  assert.equal(await confidentialTitle(db, 'Review the attached submission for ICLR', ask), 'Review the attached submission for ICLR');
  assert.equal(asked, 0);
  // A helper model on this computer names it.
  kvSet(db, 'helper.model', 'ollama/qwen3:8b');
  assert.equal(localHelper(db), 'ollama/qwen3:8b');
  let model: string | undefined;
  const local = async (_db: unknown, q: { model?: string }) => ((model = q.model), '"Reviewing the ICLR submission."');
  assert.equal(await confidentialTitle(db, 'Review the attached submission for ICLR', local as never), 'Reviewing the ICLR submission');
  assert.equal(model, 'ollama/qwen3:8b');
  assert.equal(await confidentialTitle(db, 'Review the attached submission for ICLR', (async () => Promise.reject(new Error('down'))) as never), 'Review the attached submission for ICLR');
  kvSet(db, 'helper.model', 'auto');
});

test('checks and summaries use the helper model when it is here, else the session’s own model', () => {
  assert.equal(privateHelper(deps, SECRET), 'ollama/qwen3:8b', 'its own model');
  assert.equal(privateHelper(deps, SECRET, { sees: true }), null, 'its own model is no use for images it cannot see');
  kvSet(db, 'helper.model', 'ollama/llama3:70b');
  assert.equal(privateHelper(deps, SECRET), 'ollama/llama3:70b');
  kvSet(db, 'helper.model', 'auto');
});

test('notices: a confidential session’s say only that it finished, needs you or failed', () => {
  const n: NotifyEvent = { key: SECRET, kind: 'waiting', title: 'Review of submission 4711', body: 'Run python check.py', agent: 'acp', at: 1, approval: { id: 'a', title: 'Run python check.py', approve: { id: 'y', label: 'Allow' }, deny: { id: 'n', label: 'Deny' } } as never };
  const p = privateNotice(db, n);
  assert.deepEqual(noticeText(p), { title: 'A confidential session', body: 'Needs you' });
  assert.equal(p.approval, undefined, 'no buttons that answer a step it does not show');
  assert.equal(JSON.stringify(p).includes('4711'), false);
  assert.equal(JSON.stringify(p).includes('check.py'), false);
  assert.deepEqual(noticeText(privateNotice(db, { ...n, kind: 'done', body: 'The paper’s main claim holds.' })), { title: 'A confidential session', body: 'Finished' });
  assert.deepEqual(noticeText(privateNotice(db, { ...n, kind: 'failed', body: 'Error in 4711' })), { title: 'A confidential session', body: 'Failed' });
  const plain = { ...n, key: PLAIN };
  assert.equal(privateNotice(db, plain), plain);
});

test('its pages load nothing from anywhere, send no form and open no window', () => {
  assert.match(OFFLINE_PAGE_CSP, /^sandbox allow-scripts allow-modals;/);
  assert.match(OFFLINE_PAGE_CSP, /default-src 'none'/);
  assert.match(OFFLINE_PAGE_CSP, /img-src data: blob:;/);
  assert.match(OFFLINE_PAGE_CSP, /form-action 'none'/);
  // Not even through this app (its picture proxy fetches the web), nor a popup.
  const loads = OFFLINE_PAGE_CSP.replace(/frame-ancestors 'self'/, '');
  for (const bad of ["'self'", ' * ', 'https:', 'http:', 'allow-popups', 'allow-forms', 'connect-src']) assert.ok(!loads.includes(bad), bad);
  assert.match(PAGE_CSP, /default-src \*/, 'other sessions’ pages are as they were');
});

test('share links can’t be made for a confidential session', () => {
  assert.throws(() => createGuestLink(db, SECRET, 7), refused(409, /can’t be shared/));
  assert.ok(createGuestLink(db, PLAIN, 7).token);
});

test('memory: read, never written', () => {
  kvSet(db, 'memory.enabled', '1');
  assert.deepEqual(
    memoryTools(ctxOf(SECRET)).map((t) => t.name),
    ['recall', 'search_sessions', 'read_session'],
  );
  assert.deepEqual(
    memoryTools(ctxOf(PLAIN)).map((t) => t.name),
    ['remember', 'forget', 'recall', 'search_sessions', 'read_session'],
  );
  kvSet(db, 'memory.enabled', '0');
  assert.deepEqual(memoryTools(ctxOf(SECRET)), [], 'nothing when memory is off for all');
  kvSet(db, 'memory.enabled', '1');
  assert.match(profileBlock('Prefers British spelling.', true), /Prefers British spelling/);
  assert.doesNotMatch(profileBlock('Prefers British spelling.', true), /update_user_profile/);
  assert.match(profileBlock('Prefers British spelling.'), /update_user_profile/);
});

test('child sessions of a confidential session are told to stay here, with the local models', () => {
  const desc = children.tools!(ctxOf(SECRET)).find((t) => t.name === 'start_child_session')!.description;
  assert.match(desc, /This session is confidential, so a child runs here too/);
  const schema = JSON.stringify(children.tools!(ctxOf(SECRET)).find((t) => t.name === 'start_child_session')!.inputSchema);
  assert.match(schema, /ollama\/qwen3:8b/);
  assert.doesNotMatch(schema, /openrouter/);
  assert.match(JSON.stringify(children.tools!(ctxOf(PLAIN)).find((t) => t.name === 'start_child_session')!.inputSchema), /openrouter/);
});

test('second opinions: only from another maker’s model on this computer', async () => {
  // Its work is Qwen's (on Ollama): Claude and Codex are online, Claude Sonnet through OpenRouter too.
  const o = await opinionOptions(deps, SECRET);
  assert.deepEqual(
    o.reviewers.map((r) => r.id),
    ['ollama/llama3:70b', 'endpoint/box/coder'],
  );
  assert.ok((await opinionOptions(deps, PLAIN)).reviewers.some((r) => r.id === 'codex'));
});

// ---- other agents and other doors -------------------------------------------------------------------------------------

test('app_api: other sessions’ agents can’t reach a confidential session, and don’t see it in lists', async () => {
  const ctx = ctxOf(PLAIN);
  for (const p of [`/api/sessions/${encodeURIComponent(SECRET)}/timeline`, `/api/sessions/${SECRET}`, `/api/shots?key=${encodeURIComponent(SECRET)}`, `/api/opinion/${SECRET}`]) {
    const r = await appApi({ method: 'GET', path: p }, ctx);
    assert.equal(r.isError, true, p);
    assert.match(r.text, /That session is confidential/);
  }
  const list = await appApi({ method: 'GET', path: '/api/sessions' }, ctx);
  assert.equal(list.isError, undefined);
  assert.match(list.text, /Weekend trip to Lisbon/);
  assert.doesNotMatch(list.text, /4711/);
  assert.deepEqual(confidentialIn(db, `/api/x?a=${encodeURIComponent(SECRET)}&b=${PLAIN}`), [SECRET]);
  assert.deepEqual(withoutConfidential(db, { hits: [{ key: SECRET, snippet: 'secret' }, { sessionKey: PLAIN }], n: [1, { session_key: CHILD_OF_SECRET }] }), { hits: [{ sessionKey: PLAIN }], n: [1] });
});

test('hands-free voice: a confidential session is not talked about, and what is said to it goes to it alone', async () => {
  let asked = 0;
  const ask = async (q: { prompt: string }) => {
    asked++;
    assert.doesNotMatch(q.prompt, /4711/, 'the helper never reads its title');
    return JSON.stringify({ action: 'status', say: 'All quiet.' });
  };
  const d = { db, sessions } as unknown as Deps;
  assert.equal((await handsFree(d, 'how is everything?', undefined, ask as never)).say, 'All quiet.');
  assert.equal(asked, 1);
  const r = await handsFree(d, 'look at section three again', SECRET, ask as never);
  assert.equal(asked, 1, 'what is said to a confidential session goes to no helper model');
  assert.equal(r.did, 'sent');
  assert.equal(said.at(-1), `${SECRET}: look at section three again`);
  const read = await handsFree(d, 'read it', SECRET, ask as never);
  assert.match(read.say, /confidential: its replies stay on the screen/);
});

// ---- commands without network ---------------------------------------------------------------------------------------

test('the sandbox’s arguments: --unshare-net for a confidential session, in every mode', async () => {
  const cut = sandboxArgs(tmp, { walls: false, cut: true });
  assert.ok(cut.includes('--unshare-net'));
  assert.deepEqual(cut.slice(0, 3), ['--bind', '/', '/'], 'the files as the mode has them');
  const both = sandboxArgs(tmp, { walls: true, cut: true });
  assert.ok(both.includes('--unshare-net'));
  assert.deepEqual(both.slice(0, 3), ['--ro-bind', '/', '/']);
  assert.ok(!sandboxArgs(tmp, { walls: true, cut: false }).includes('--unshare-net'), 'other sessions keep the network');
  assert.equal(netRefused('curl: (6) Could not resolve host: example.com'), true);
  assert.equal(netRefused('npm ERR! code EAI_AGAIN'), true);
  assert.equal(netRefused('All 12 tests passed'), false);
  if (!sandboxAvailable()) return console.log('  (bwrap does not run here: the sandbox itself is not tried)');
  assert.equal(await sandboxShell(tmp, 'ask', false), undefined, 'Ask mode, not confidential: as it is');
  for (const mode of ['ask', 'edits', 'auto', 'full', 'plan']) {
    const sh = await sandboxShell(tmp, mode, true);
    assert.ok(sh, mode);
    assert.ok(sh!('true').args.includes('--unshare-net'), mode);
  }
});

test('a real command that tries the network fails in a confidential session’s sandbox (where bwrap runs)', async () => {
  if (!sandboxAvailable() || !netCutAvailable()) return console.log('  (bwrap cannot cut the network here: commands would ask each time instead)');
  // A server on this computer: reachable from an ordinary command, not from the sandbox's empty network.
  const server = net.createServer((c) => {
    c.on('error', () => {});
    c.end('hello\n');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as net.AddressInfo).port;
  const tryIt = `(exec 3<>/dev/tcp/127.0.0.1/${port} && head -c 5 <&3 && echo :reached) 2>/dev/null || echo :refused`;
  const plainRun = await new Promise<string>((resolve) => {
    const p = spawn('/bin/bash', ['-c', tryIt], { cwd: tmp });
    let out = '';
    p.stdout.on('data', (d: Buffer) => (out += d));
    p.on('close', () => resolve(out));
  });
  assert.match(plainRun, /hello:reached/, 'the server answers an ordinary command');
  const sh = (await sandboxShell(tmp, 'full', true))!(tryIt);
  const boxed = spawnSync(sh.cmd, sh.args, { cwd: tmp, encoding: 'utf8', env: { ...process.env, ...sh.env }, timeout: 20_000 });
  assert.match(boxed.stdout, /:refused/, `inside: ${boxed.stdout} ${boxed.stderr}`);
  const dns = spawnSync(sh.cmd, [...sh.args.slice(0, -1), 'getent hosts example.com || echo no-name'], { cwd: tmp, encoding: 'utf8', timeout: 20_000 });
  assert.match(dns.stdout, /no-name/, 'no names either');
  server.close();
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n${(e as Error).stack ?? e}`);
    process.exitCode = 1;
  }
}
console.log(`${passed}/${tests.length} passed`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(process.exitCode ?? 0);
