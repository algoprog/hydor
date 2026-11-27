// Script tests for what lets an app depend on Hydor plugins and work in a project: what an app needs
// (requires.plugins), the check before a run (and what the app's page, the gallery and agents are told), tool steps
// that call a plugin's MCP tool (a tiny plugin in a temp folder, its server a minimal stdio MCP script), an agent
// step's plugin tools and skills, and a project question scoping a run's folder and knowledge.
// Build and run with scratch folders:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/apps/plugins-test.ts
//   DATA_DIR=/tmp/hydor-test-apps-plugins HYDOR_APPS_DIR=/tmp/hydor-test-apps-plugins-runs node dist/dev/plugins-test.js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cookie from '@fastify/cookie';
import { buildSync } from 'esbuild';
import Fastify from 'fastify';
import { checkInputs, cleanRecipe, inputsLine, isActive } from '../../shared/apps.ts';
import { appPrograms, checkFlow, cleanRequires, pluginStepTool } from '../../shared/app-manifest.ts';
import { AGENT_PLUGINS_MCP_SCHEMA, AGENT_PLUGINS_SCHEMA, type PluginJob, type PluginNeed } from '../../shared/plugins.ts';
import { setSettings } from '../assistants/store.ts';
import { HttpError } from '../auth.ts';
import { APP_ROOT } from '../config.ts';
import { vaultTables } from '../connections/vault.ts';
import { openDb } from '../db.ts';
import { registerFeatures, runTools, spawnAdditions } from '../features/registry.ts';
import type { Deps, Feature, RunCtx } from '../features/types.ts';
import { scanSoon } from '../knowledge/indexer.ts';
import { createBase, docsOf, filesDir } from '../knowledge/store.ts';
import { knowledgeTools } from '../knowledge/tools.ts';
import { initPages } from '../pages/store.ts';
import { plugins, setPluginRoots } from '../plugins/index.ts';
import { Scheduler } from '../scheduler.ts';
import { sessionExtra, setSessionExtra } from '../sessionExtra.ts';
import type { SessionManager } from '../sessions.ts';
import { librarySkills, setFolders } from '../skillpack/library.ts';
import { createSpace } from '../spaces/index.ts';
import { apps, problemsOf } from './index.ts';
import { startRun, startRuns, saveResult, waitFor, WORK_DIR } from './runs.ts';
import { setPluginIdle } from './plugins.ts';
import * as store from './store.ts';
import { useAppTool } from './use.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/') || !process.env.HYDOR_APPS_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… and HYDOR_APPS_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-apps-plugins-'));
const db = openDb(path.join(tmp, 'test.db'));
store.ensureTables(db);
vaultTables(db);
initPages(db);
setSettings(db, { taskRoot: path.join(tmp, 'projects') });
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;

// ---- a tiny plugin: a skill, and a stdio MCP server that logs when it starts --------------------------

const BUILTIN = path.join(tmp, 'builtin');
const launcher = path.join(tmp, 'pluginlaunch.js');
buildSync({ entryPoints: [path.join(APP_ROOT, 'server/plugins/launch.ts')], outfile: launcher, bundle: true, platform: 'node', format: 'esm', target: 'node22', logLevel: 'warning' });
setFolders({ bundled: path.join(tmp, 'bundled'), learned: path.join(tmp, 'learned'), view: path.join(tmp, 'skillview', 'naget') });
setPluginRoots({ builtin: BUILTIN, base: path.join(tmp, 'plugins-data'), launcher });

const SERVER = `
import fs from 'node:fs';
import path from 'node:path';
fs.mkdirSync(process.env.PLUGIN_DATA, { recursive: true });
fs.appendFileSync(path.join(process.env.PLUGIN_DATA, 'starts.log'), process.pid + '\\n');
const send = (m) => process.stdout.write(JSON.stringify(m) + '\\n');
const TOOLS = [
  { name: 'say', description: 'Writes the words to a file and says where.', inputSchema: { type: 'object', properties: { text: { type: 'string' }, out: { type: 'string' } } } },
  { name: 'count', description: 'Counts letters.', inputSchema: { type: 'object', properties: { text: { type: 'string' } } }, annotations: { readOnlyHint: true } },
  { name: 'refuse', description: 'Always fails.', inputSchema: { type: 'object' } },
  { name: 'quit', description: 'Ends the server.', inputSchema: { type: 'object' } },
  { name: 'slow', description: 'Answers after a while.', inputSchema: { type: 'object', properties: { ms: { type: 'number' } } } },
];
const call = (name, a) => {
  if (name === 'say') {
    fs.writeFileSync(a.out, a.text);
    return { content: [{ type: 'text', text: JSON.stringify({ path: a.out, words: a.text, pid: process.pid }) }] };
  }
  if (name === 'count') return { content: [{ type: 'text', text: 'It has ' + a.text.length + ' letters.' }], structuredContent: { letters: a.text.length } };
  if (name === 'quit') process.exit(1);
  return { content: [{ type: 'text', text: 'It will not.' }], isError: true };
};
let buf = '';
process.stdin.on('data', (d) => {
  buf += d;
  for (let i = buf.indexOf('\\n'); i >= 0; i = buf.indexOf('\\n')) {
    const m = JSON.parse(buf.slice(0, i));
    buf = buf.slice(i + 1);
    if (m.id === undefined) continue;
    if (m.method === 'initialize') send({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'fakevoice', version: '1' } } });
    else if (m.method === 'tools/list') send({ jsonrpc: '2.0', id: m.id, result: { tools: TOOLS } });
    else if (m.method === 'tools/call' && m.params.name === 'slow') setTimeout(() => send({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: 'Done after a while.' }] } }), m.params.arguments.ms);
    else if (m.method === 'tools/call') send({ jsonrpc: '2.0', id: m.id, result: call(m.params.name, m.params.arguments) });
    else send({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'no' } });
  }
});
process.stdin.on('end', () => process.exit(0));
`;
const plugin = (name: string, title: string, ext: Record<string, unknown> = {}) => {
  write(path.join(BUILTIN, name, 'plugin.json'), json({ $schema: AGENT_PLUGINS_SCHEMA, name, version: '1.0.0', description: `The ${name} plugin`, extensions: { 'com.naget.agent': { title, ...ext } } }));
};
plugin('fake-voice', 'Fake voice');
write(path.join(BUILTIN, 'fake-voice', 'mcp.json'), json({ $schema: AGENT_PLUGINS_MCP_SCHEMA, mcpServers: { fakevoice: { type: 'stdio', command: 'node', args: ['${PLUGIN_ROOT}/server.mjs'] } } }));
write(path.join(BUILTIN, 'fake-voice', 'server.mjs'), SERVER);
write(path.join(BUILTIN, 'fake-voice', 'skills', 'voice-script', 'SKILL.md'), '---\nname: voice-script\ndescription: Use when writing a script for two voices.\n---\n\n# Voice script\n\nWrite it as turns.\n');
plugin('claude-only', 'Claude only', { agents: ['claude'] });
plugin('on-top', 'On top', { requires: { plugins: { 'fake-voice': '*' } } });
const starts = () => {
  try {
    return fs.readFileSync(path.join(tmp, 'plugins-data', 'data', 'fake-voice', 'starts.log'), 'utf8').trim().split('\n').map(Number);
  } catch {
    return [];
  }
};
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

// ---- stand-ins -------------------------------------------------------------------------------------------

/** The session manager: sessions start at once and work until a test ends their turn. */
class FakeSessions extends EventEmitter {
  made: { key: string; o: any }[] = [];
  status = new Map<string, string>();
  async create(o: any) {
    const key = `acp:fake-${this.made.length + 1}-${Math.random().toString(36).slice(2, 8)}`;
    this.made.push({ key, o });
    this.status.set(key, 'working');
    if (o.extra && Object.keys(o.extra).length) setSessionExtra(db, key, o.extra);
    return key;
  }
  setFlags() {}
  summary(key: string) {
    const st = this.status.get(key);
    return st ? ({ key, agent: 'acp', stats: { tokensIn: 0, tokensOut: 0, tokensCached: 0 }, live: { status: st } } as any) : null;
  }
  async timeline() {
    return { parser: { items: [{ kind: 'assistant', id: 'a', seq: 0, text: 'Done.' }] }, readMore: async () => {} } as any;
  }
  liveSnapshot() {
    return { live: null, overlay: { items: [], patches: {}, approvals: [] } };
  }
  async interrupt(key: string) {
    this.end(key);
  }
  async deliverOrQueue(key: string) {
    this.status.set(key, 'working');
  }
  end(key: string) {
    this.status.set(key, 'idle');
    this.emit('live', key);
  }
}

const knowledgeOnly: Feature = { id: 'knowledge-tools', tools: () => knowledgeTools() };
const sessions = new FakeSessions();
const http = Fastify();
await http.register(cookie);
http.setErrorHandler((err: Error & { extra?: Record<string, unknown> }, _req, reply) => {
  reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message, ...(err.extra ?? {}) });
});
const scheduler = new Scheduler(db, sessions as unknown as SessionManager);
const deps = { app: http, db, sessions: sessions as any, scheduler, models: null as any, broadcast: () => {}, toSubscribers: () => {}, publicBase: () => 'http://test.local' } as Deps;
registerFeatures([knowledgeOnly, plugins, apps], deps);
startRuns(deps);
await http.ready();

const call = async <T = any>(method: 'GET' | 'POST', url: string, payload?: unknown): Promise<{ status: number; body: T }> => {
  const r = await http.inject({ method, url, payload: payload as never });
  return { status: r.statusCode, body: r.json() as T };
};
const jobDone = async (job: PluginJob) => {
  for (let i = 0; i < 400; i++) {
    const j = (await call<{ job: PluginJob }>('GET', `/api/plugins/jobs/${job.id}`)).body.job;
    if (j.state !== 'running') return assert.equal(j.state, 'done', j.error);
    await sleep(25);
  }
  throw new Error('the job did not end');
};
const install = async (name: string) => jobDone((await call<{ job: PluginJob }>('POST', '/api/plugins/install', { name })).body.job);

const app = (p: Record<string, unknown>) =>
  store.saveApp(db, { recipe: cleanRecipe({ name: 'Audio', agent: 'claude', prompt: '', fields: [{ id: 'topic', label: 'Topic', type: 'text' }], answer: [], tools: null, limits: {}, ...p }) });

async function ended(id: string, ms = 30_000) {
  const r = await waitFor(id, ms);
  assert.ok(r && !isActive(r.status), `run ${id} ended (it is ${r?.status})`);
  return r!;
}
/** An agent step's run, once its session is there; it hands in `result` and ends its turn. */
async function agentAnswers(parent: string, step: string, result: Record<string, unknown>) {
  let child: store.RunRecord | undefined;
  for (let i = 0; i < 400 && !(child = store.listRuns(db, { parent }).find((r) => r.step === step && r.key)); i++) await sleep(25);
  assert.ok(child, `the step ${step} started its run`);
  saveResult(child.id, result);
  sessions.end(child.key!);
  return child;
}
const refusal = (fn: () => unknown): HttpError => {
  try {
    fn();
  } catch (e) {
    return e as HttpError;
  }
  throw new Error('it started');
};
const stepValues = (run: string, step: string) => store.listSteps(db, run).find((s) => s.path === step)?.outputs as Record<string, any>;

const flowApp = (steps: unknown[], extra: Record<string, unknown> = {}) => app({ flow: { steps }, requires: { plugins: ['fake-voice'] }, ...extra });
const start = (a: ReturnType<typeof app>, inputs: Record<string, unknown> = {}) => startRun({ app: a.id, slug: a.slug, recipe: a, source: 'web', inputs });

// ---- what an app needs ------------------------------------------------------------------------------------

test('requires.plugins: plugin names, each once; mistakes said in words', () => {
  assert.deepEqual(cleanRequires({ plugins: ['media-tools', 'ocr', 'media-tools'] }), { requires: { plugins: ['media-tools', 'ocr'] }, errors: [] });
  const bad = cleanRequires({ plugins: ['Media Tools', '../x', 'ok-one'], commands: ['ffmpeg'] });
  assert.deepEqual(bad.requires, { plugins: ['ok-one'], commands: ['ffmpeg'] });
  assert.equal(bad.errors.length, 2);
  assert.match(bad.errors[0], /“Media Tools” is not a plugin's name/);
  assert.match(cleanRequires({ plugins: 'ocr' }).errors[0], /"plugins" is a list/);
  assert.deepEqual(cleanRecipe({ name: 'A', requires: { plugins: ['ocr'] } }).requires, { plugins: ['ocr'] });
});

test('a plugin tool step: named as plugin:<plugin>/<tool>, and its plugin among what the app needs', () => {
  assert.deepEqual(pluginStepTool('plugin:media-tools/probe'), { plugin: 'media-tools', tool: 'probe' });
  for (const t of ['plugin:media-tools', 'plugin:/probe', 'plugin:A/b', 'web_search', 'fn:x_y', undefined]) assert.equal(pluginStepTool(t), null, String(t));
  const recipe = (tool: string, requires?: unknown) => cleanRecipe({ name: 'A', flow: { steps: [{ id: 'a', do: 'tool', tool }] }, requires });
  assert.deepEqual(checkFlow(recipe('plugin:fake-voice/say', { plugins: ['fake-voice'] })).errors, []);
  assert.match(checkFlow(recipe('plugin:fake-voice/say')).errors.join(), /name the plugin in what it needs/);
  assert.match(checkFlow(recipe('plugin:fake-voice')).errors.join(), /"plugin:<plugin>\/<tool>"/);
  // A flow beside the main one goes by the app's own needs.
  const beside = cleanRecipe({ name: 'A', prompt: 'x', requires: { plugins: ['fake-voice'] }, flows: { more: { steps: [{ id: 'a', do: 'tool', tool: 'plugin:fake-voice/say' }] } } });
  assert.deepEqual(checkFlow(beside).errors, []);
  // A long name stays whole.
  const long = `plugin:${'p'.repeat(60)}/${'t'.repeat(100)}`;
  assert.equal((recipe(long).flow!.steps[0] as { tool: string }).tool, long);
  assert.deepEqual(appPrograms(cleanRecipe({ name: 'A', agent: 'codex', prompt: 'x' })), ['codex']);
  assert.deepEqual(appPrograms(cleanRecipe({ name: 'A', agent: 'claude', flow: { steps: [{ id: 'a', do: 'agent', instructions: 'x' }, { id: 'b', do: 'agent', agent: 'acp', instructions: 'y' }] } })), ['claude', 'custom']);
  assert.deepEqual(appPrograms(recipe('web_search')), []);
});

// ---- the check before a run -------------------------------------------------------------------------------

test('a run does not start while its plugin is not added or off, and says what to do; on, it starts', async () => {
  const a = app({ prompt: 'Say {{topic}}', requires: { plugins: ['fake-voice'] } });
  let e = refusal(() => start(a));
  assert.equal(e.status, 409);
  assert.equal(e.message, 'This app needs the Fake voice plugin (fake-voice), which is not installed. Add it in Settings → Plugins, then run it again.');
  assert.deepEqual((e.extra!.plugins as PluginNeed[]).map((p) => [p.name, p.state, p.action?.do]), [['fake-voice', 'missing', 'install']]);
  assert.equal(sessions.made.length, 0);
  // The page, the gallery and a save say it too.
  let page = (await call<{ plugins: PluginNeed[] }>('GET', `/api/apps/${a.id}`)).body;
  assert.deepEqual(page.plugins.map((p) => [p.title, p.state, p.action?.do]), [['Fake voice', 'missing', 'install']]);
  const listed = async () => (await call<{ apps: { id: string; needsPlugin?: string[] }[] }>('GET', '/api/apps')).body.apps.find((x) => x.id === a.id)!.needsPlugin;
  assert.deepEqual(await listed(), ['Fake voice']);
  assert.match(problemsOf(db, a).warnings.join('\n'), /It needs the Fake voice plugin, which is not installed/);
  const tried = await call('POST', `/api/apps/${a.id}/runs`, { inputs: {} });
  assert.equal(tried.status, 409);
  assert.match((tried.body as { error: string }).error, /needs the Fake voice plugin/);

  await install('fake-voice');
  assert.equal(await listed(), undefined);
  const r = start(a, { topic: 'x' });
  for (let i = 0; i < 200 && !store.getRun(db, r.id)!.key; i++) await sleep(25);
  sessions.end(store.getRun(db, r.id)!.key!);
  const first = await ended(r.id);
  assert.equal(first.status, 'done', first.error);

  await call('POST', '/api/plugins/fake-voice/disable');
  e = refusal(() => start(a));
  assert.match(e.message, /Fake voice plugin \(fake-voice\), which is turned off\. Turn it on in Settings → Plugins, then run it again\./);
  page = (await call<{ plugins: PluginNeed[] }>('GET', `/api/apps/${a.id}`)).body;
  assert.deepEqual([page.plugins[0].state, page.plugins[0].action?.do], ['off', 'enable']);
  await call('POST', '/api/plugins/fake-voice/enable');
  assert.equal((await call<{ plugins: PluginNeed[] }>('GET', `/api/apps/${a.id}`)).body.plugins[0].state, 'on');

  // One that is not here and not built in; one that does not work with the app's agent; one whose own plugin is off.
  assert.match(refusal(() => start(app({ prompt: 'x', requires: { plugins: ['no-such'] } }))).message, /the no-such plugin, which is not installed here\. Add it in Settings → Plugins/);
  await install('claude-only');
  assert.match(refusal(() => start(app({ prompt: 'x', agent: 'codex', requires: { plugins: ['claude-only'] } }))).message, /Claude only plugin \(claude-only\), which does not work with Codex\. Pick another agent for the app/);
  await install('on-top');
  await call('POST', '/api/plugins/fake-voice/disable');
  assert.match(refusal(() => start(app({ prompt: 'x', requires: { plugins: ['on-top'] } }))).message, /On top plugin \(on-top\), which is turned off/);
  await call('POST', '/api/plugins/on-top/enable');
  // A public run gets none of your plugins.
  assert.match(refusal(() => startRun({ app: a.id, slug: a.slug, recipe: a, source: 'public', inputs: {}, public: { model: 'm', web: false, capUsd: 1 } })).message, /public page cannot use/);
});

test('use_app and a run in line say the same', async () => {
  await call('POST', '/api/plugins/fake-voice/disable');
  const a = app({ name: 'Overview maker', prompt: 'x', requires: { plugins: ['fake-voice'] } });
  const ctx: RunCtx = { runId: 'r1', key: 'claude:s1', agent: 'claude', cwd: tmp, deps };
  const out = (await useAppTool(ctx)!.run({ app: a.slug }, ctx)) as { text: string; isError: boolean };
  assert.equal(out.isError, true);
  assert.match(out.text, /^Overview maker could not start: This app needs the Fake voice plugin \(fake-voice\), which is turned off\. Turn it on in Settings → Plugins/);
  const rows = await call<{ error: string }>('POST', `/api/apps/${a.id}/batches`, { rows: [{ topic: 'x' }] });
  assert.deepEqual([rows.status, /which is turned off/.test(rows.body.error), store.listRuns(db, { app: a.id }).length], [409, true, 0]);
  await call('POST', '/api/plugins/fake-voice/enable');
});

// ---- tool steps -------------------------------------------------------------------------------------------

test('tool steps call the plugin’s tools: one server for the run, stopped when it ends; its answers as values', async () => {
  const before = starts().length;
  const a = flowApp([
    { id: 'say', do: 'tool', tool: 'plugin:fake-voice/say', with: { text: 'Hello {{topic}}', out: '{{run.folder}}/said.txt' } },
    { id: 'count', do: 'tool', tool: 'plugin:fake-voice/count', with: { text: '{{say.data.words}}' } },
    { id: 'code', do: 'code', code: 'const r = await ctx.tool("plugin:fake-voice/count", { text: "abc" }); return { n: r.data.letters, said: input.s };', with: { s: '{{count.text}}' } },
  ]);
  assert.deepEqual(problemsOf(db, a).errors, []);
  const r = await ended(start(a, { topic: 'there' }).id);
  assert.equal(r.status, 'done', r.error);
  const said = stepValues(r.id, 'say');
  assert.equal(said.data.words, 'Hello there');
  assert.equal(fs.readFileSync(said.data.path, 'utf8'), 'Hello there');
  assert.ok(said.data.path.startsWith(WORK_DIR), said.data.path);
  // Text that is not JSON: {{id.data}} is the structured content.
  assert.match(stepValues(r.id, 'count').text, /^It has 11 letters\./);
  assert.deepEqual(stepValues(r.id, 'count').data, { letters: 11 });
  assert.equal(stepValues(r.id, 'code').n, 3);
  assert.equal(starts().length, before + 1, 'one server for the whole run');
  for (let i = 0; i < 200 && alive(said.data.pid); i++) await sleep(25);
  assert.equal(alive(said.data.pid), false, 'the server stopped with the run');
});

test('a plugin tool step fails in words: the tool’s own error, no such tool, a server that ended, the plugin off', async () => {
  const run = async (steps: unknown[]) => ended(start(flowApp(steps)).id);
  let r = await run([{ id: 'no', do: 'tool', tool: 'plugin:fake-voice/refuse' }]);
  assert.equal(r.status, 'failed');
  assert.match(r.error!, /It will not\./);
  r = await run([{ id: 'no', do: 'tool', tool: 'plugin:fake-voice/sing' }]);
  assert.match(r.error!, /The plugin fake-voice has no tool “sing” \(it has say, count, refuse, quit, slow\)/);
  // A server that ended is started again for the next step.
  const before = starts().length;
  r = await run([
    { id: 'quit', do: 'tool', tool: 'plugin:fake-voice/quit', failed: 'skip' },
    { id: 'count', do: 'tool', tool: 'plugin:fake-voice/count', with: { text: 'ab' } },
  ]);
  assert.equal(r.status, 'done', r.error);
  assert.equal(starts().length, before + 2);
  // Turned off while the run waited in line, or between its start and a step.
  const a = flowApp([{ id: 'wait', do: 'agent', instructions: 'x' }, { id: 'count', do: 'tool', tool: 'plugin:fake-voice/count', with: { text: 'ab' } }]);
  const started = start(a);
  await sleep(100);
  await call('POST', '/api/plugins/fake-voice/disable');
  await agentAnswers(started.id, 'wait', {});
  r = await ended(started.id);
  assert.match(r.error!, /The step needs the Fake voice plugin \(fake-voice\), which is turned off/);
  await call('POST', '/api/plugins/fake-voice/enable');
});

/** No server of the fake plugin is running (given a moment to end). */
async function noneAlive(why: string) {
  for (let i = 0; i < 200 && starts().some(alive); i++) await sleep(25);
  assert.deepEqual(starts().filter(alive), [], why);
}
const until = async (what: () => unknown, why: string) => {
  for (let i = 0; i < 400 && !what(); i++) await sleep(25);
  assert.ok(what(), why);
};
const stepOf = (run: string, path: string) => store.listSteps(db, run).find((s) => s.path === path);

test('a run that waits for the person keeps no plugin server; the next step starts it again', async () => {
  await noneAlive('before');
  const before = starts().length;
  const a = flowApp([
    { id: 'one', do: 'tool', tool: 'plugin:fake-voice/count', with: { text: 'a' } },
    { id: 'ok', do: 'ask', question: 'Go on?' },
    { id: 'two', do: 'tool', tool: 'plugin:fake-voice/count', with: { text: 'ab' } },
  ]);
  const r = start(a);
  await until(() => store.getRun(db, r.id)!.status === 'waiting', 'it asks');
  assert.equal(starts().length, before + 1, 'the first step started it');
  await noneAlive('while it waits');
  const answered = await call('POST', `/api/apps/runs/${r.id}/answer`, { step: 'ok', yes: true });
  assert.equal(answered.status, 200, JSON.stringify(answered.body));
  const done = await ended(r.id);
  assert.equal(done.status, 'done', done.error);
  assert.equal(starts().length, before + 2, 'the step after the wait started it again');
  await noneAlive('after the run');
});

test('a call in hand is not stopped by another branch’s wait: its server stops when it ends', async () => {
  const a = flowApp([
    {
      id: 'both',
      do: 'parallel',
      branches: [[{ id: 'ok', do: 'ask', question: 'Go on?' }], [{ id: 'long', do: 'tool', tool: 'plugin:fake-voice/slow', with: { ms: 700 } }]],
    },
  ]);
  const r = start(a);
  await until(() => store.getRun(db, r.id)!.status === 'waiting', 'it asks');
  const long = () => store.listSteps(db, r.id).find((s) => s.path.endsWith('long'));
  await until(() => long()?.status === 'done', `the call ends: ${long()?.error}`);
  assert.equal((long()!.outputs as { text: string }).text, 'Done after a while.');
  await noneAlive('after the call, while the run still waits');
  const ask = store.listSteps(db, r.id).find((s) => s.kind === 'ask')!;
  await call('POST', `/api/apps/runs/${r.id}/answer`, { step: ask.path, yes: true });
  assert.equal((await ended(r.id)).status, 'done');
});

test('a server with no call for a while is stopped inside the run, and started again; a long call is left to end', async () => {
  setPluginIdle(300);
  try {
    const before = starts().length;
    const a = flowApp([
      // Longer than the idle time: a call in hand is never stopped for it.
      { id: 'one', do: 'tool', tool: 'plugin:fake-voice/slow', with: { ms: 800 } },
      { id: 'work', do: 'agent', instructions: 'x' },
      { id: 'two', do: 'tool', tool: 'plugin:fake-voice/count', with: { text: 'ab' } },
    ]);
    const r = start(a);
    await until(() => stepOf(r.id, 'work')?.status === 'running', 'the agent step is at work');
    assert.equal(stepOf(r.id, 'one')!.status, 'done', stepOf(r.id, 'one')!.error);
    await noneAlive('idle');
    assert.equal(store.getRun(db, r.id)!.status, 'running', 'the run is not waiting: only idle');
    await agentAnswers(r.id, 'work', {});
    const done = await ended(r.id);
    assert.equal(done.status, 'done', done.error);
    assert.equal(starts().length, before + 2);
    assert.equal(starts().length - before, 2);
  } finally {
    setPluginIdle(10 * 60_000);
  }
});

test('an agent step of an app that needs a plugin gets its MCP server, its skills and a word about it', async () => {
  const a = flowApp([{ id: 'script', do: 'agent', instructions: 'Write a script about {{topic}}', outputs: { script: 'text' } }]);
  const r = start(a, { topic: 'tides' });
  let made: { key: string; o: any } | undefined;
  for (let i = 0; i < 200 && !(made = sessions.made.find((m) => m.o.extra?.app && store.getRun(db, m.o.extra.app.run)?.parent === r.id)); i++) await sleep(25);
  assert.ok(made);
  for (const [agent, acpAgent] of [['claude', undefined], ['codex', undefined], ['acp', 'console']] as const) {
    const add = await spawnAdditions({ agent, acpAgent, key: made.key, cwd: made.o.cwd, runId: `s-${agent}`, resume: false, extra: sessionExtra(db, made.key) });
    assert.ok(add.mcpServers.fakevoice, `${agent} gets the plugin's server`);
    assert.match(add.instructions.join('\n'), /The app needs the plugin Fake voice \(fake-voice\): its tools and skills are among yours/);
  }
  // Its skills are in the view every agent's skills come from.
  assert.ok(librarySkills().some((s) => s.name === 'voice-script'), 'the plugin’s skill is in the library view');
  await agentAnswers(r.id, 'script', { script: 'A: Tides.' });
  assert.equal((await ended(r.id)).status, 'done');
});

// ---- a project question -----------------------------------------------------------------------------------

test('a project question: the run works in that project, its folder and its knowledge', async () => {
  const tides = createSpace(db, { name: 'Tides' });
  const bees = createSpace(db, { name: 'Bees' });
  for (const [s, text] of [[tides, 'The spring tide at the harbour rose four metres.'], [bees, 'The hive by the harbour made forty jars of honey.']] as const) {
    const base = createBase(db, { name: `${s.name} notes`, space: s.id });
    write(path.join(filesDir(base.id), `${s.name.toLowerCase()}.md`), `# Notes\n\n${text}\n`);
    scanSoon(db, base.id);
    for (let i = 0; i < 200 && !docsOf(db, base.id).some((d) => d.status === 'indexed'); i++) await sleep(25);
  }
  const a = app({
    fields: [
      { id: 'sources', label: 'Project', type: 'project', required: true },
      { id: 'page', label: 'A file', type: 'file' },
    ],
    flow: {
      steps: [
        { id: 'find', do: 'tool', tool: 'knowledge_search', with: { query: 'harbour', mode: 'words' } },
        { id: 'where', do: 'code', code: 'return { name: input.n, folder: input.f, id: input.id, file: input.file };', with: { n: '{{project_name}}', f: '{{project_folder}}', id: '{{sources}}', file: '{{page}}' } },
        { id: 'script', do: 'agent', instructions: 'Write about {{project_name}}', outputs: { script: 'text' } },
      ],
    },
  });
  assert.equal(a.fields[0].type, 'project');
  assert.deepEqual(problemsOf(db, a).errors, []);
  assert.match(refusal(() => start(a, {})).message, /Project: needed/);
  assert.match(refusal(() => start(a, { sources: 'Whales' })).message, /there is no project “Whales” \(you have Tides, Bees\)/);

  // By its name, as an agent or a program may give it: the value is its id.
  const started = startRun({ app: a.id, slug: a.slug, recipe: a, source: 'web', inputs: { sources: 'tides' }, files: { page: { name: 'page.txt', data: Buffer.from('p').toString('base64') } } });
  assert.equal(started.inputs.sources, tides.id);
  assert.deepEqual(started.project, { id: tides.id, name: 'Tides', folder: tides.folder });
  assert.equal(inputsLine(a.fields, started.inputs, 60, started.project), 'Tides');
  const child = await agentAnswers(started.id, 'script', { script: 'ok' });
  const r = await ended(started.id);
  assert.equal(r.status, 'done', r.error);
  const found = stepValues(r.id, 'find').text as string;
  assert.match(found, /tides\.md/);
  assert.doesNotMatch(found, /bees\.md/);
  const where = stepValues(r.id, 'where');
  assert.deepEqual([where.name, where.folder, where.id], ['Tides', tides.folder, tides.id]);
  // Files sent with the form stay out of the project's folder.
  assert.ok(String(where.file).startsWith(path.join(WORK_DIR, 'uploads', r.id)), where.file);
  assert.equal(fs.readFileSync(where.file, 'utf8'), 'p');
  assert.deepEqual(fs.readdirSync(tides.folder).filter((n) => !n.startsWith('.')), []);
  // The agent step's session: in the project's folder, as one of the project's.
  const made = sessions.made.find((m) => m.key === child.key)!;
  assert.equal(made.o.cwd, tides.folder);
  assert.equal(made.o.extra.space, tides.id);
  assert.deepEqual(child.project, r.project);
  // Its knowledge_search is the project's too.
  const agentCtx: RunCtx = { runId: 's-know', key: child.key!, agent: 'claude', cwd: tides.folder, deps };
  const theirs = String(await runTools(agentCtx).find((t) => t.name === 'knowledge_search')!.run({ query: 'harbour', mode: 'words' }, agentCtx));
  assert.match(theirs, /tides\.md/);
  assert.doesNotMatch(theirs, /bees\.md/);

  // A one-task app too: its session in the project's folder.
  const one = app({ prompt: 'About {{project_name}} ({{sources}}) in {{project_folder}}', fields: [{ id: 'sources', label: 'Project', type: 'project' }] });
  const s = start(one, { sources: bees.id });
  for (let i = 0; i < 200 && !store.getRun(db, s.id)!.key; i++) await sleep(25);
  const session = sessions.made.find((m) => m.key === store.getRun(db, s.id)!.key)!;
  assert.deepEqual([session.o.cwd, session.o.extra.space, session.o.title], [bees.folder, bees.id, 'Audio · Bees']);
  assert.equal(session.o.prompt, `About Bees (${bees.id}) in ${bees.folder}`);
  sessions.end(session.key);
  await ended(s.id);

  // Left unanswered: no project, a folder of its own, the shared knowledge alone.
  const none = start(one, {});
  assert.equal(none.project, undefined);
  for (let i = 0; i < 200 && !store.getRun(db, none.id)!.key; i++) await sleep(25);
  const plain = sessions.made.find((m) => m.key === store.getRun(db, none.id)!.key)!;
  assert.ok(plain.o.cwd.startsWith(WORK_DIR));
  assert.equal(plain.o.extra.space, undefined);
  sessions.end(plain.key);
  await ended(none.id);

  // Run again from its view: the files sent with it come along from where they were kept.
  const again = await call<{ run: { id: string } }>('POST', `/api/apps/runs/${r.id}/again`, { inputs: {} });
  assert.equal(again.status, 200, JSON.stringify(again.body));
  await agentAnswers(again.body.run.id, 'script', { script: 'ok' });
  const second = await ended(again.body.run.id);
  assert.equal(second.status, 'done', second.error);
  assert.equal(fs.readFileSync(stepValues(second.id, 'where').file, 'utf8'), 'p');
  assert.equal(second.project?.id, tides.id);

  // Rows of a CSV: one that names a project that is not here fails like any other; a program's key hears no names.
  const batch = await call<{ batch: { id: string } }>('POST', `/api/apps/${one.id}/batches`, { rows: [{ sources: 'Whales' }, { sources: 'Bees' }], concurrency: 1 });
  assert.equal(batch.status, 200, JSON.stringify(batch.body));
  const rows = store.listRuns(db, { batch: batch.body.batch.id }).sort((x, y) => x.row! - y.row!);
  assert.match(rows[0].error!, /there is no project “Whales”/);
  assert.equal(rows[1].project?.id, bees.id);
  for (let i = 0; i < 200 && !store.getRun(db, rows[1].id)!.key; i++) await sleep(25);
  sessions.end(store.getRun(db, rows[1].id)!.key!);
  await ended(rows[1].id);

  assert.deepEqual(checkInputs(a.fields, { sources: tides.id }).errors, []);
  assert.match(problemsOf(db, { ...a, fields: [{ id: 'sources', label: 'Project', type: 'project', from: 'me.units' }] }).errors.join(), /About you has no project/);
});

test('only the person chooses a project: others get the one the app sets, or none', async () => {
  const open = createSpace(db, { name: 'Open shelf' });
  const secret = createSpace(db, { name: 'Private diary' });
  const form = (extra: Record<string, unknown> = {}) => [{ id: 'where', label: 'Where', type: 'project', ...extra }, { id: 'note', label: 'Note', type: 'text' }];
  const one = (extra: Record<string, unknown> = {}, p: Record<string, unknown> = {}) => app({ name: 'Notes', prompt: 'In {{project_name}}: {{note}}', fields: form(extra), ...p });
  const plain = one();
  const set = one({ default: open.id, remember: true });
  const must = one({ required: true });
  const opens = async (r: store.RunRecord) => {
    await until(() => store.getRun(db, r.id)!.key, 'its session');
    const made = sessions.made.find((m) => m.key === store.getRun(db, r.id)!.key)!;
    sessions.end(made.key);
    await ended(r.id);
    return { project: r.project?.name, cwd: made.o.cwd as string, space: made.o.extra.space as string | undefined, prompt: made.o.prompt as string };
  };
  const as = (a: ReturnType<typeof app>, source: 'api' | 'web' | 'session' | 'task' | 'mcp', inputs: Record<string, unknown>, o: Record<string, unknown> = {}) => startRun({ app: a.id, slug: a.slug, recipe: a, source, inputs, ...o });
  const refused = (fn: () => unknown, why = /a run started this way cannot choose a project/) => {
    const e = refusal(fn);
    assert.equal(e.status, 403, e.message);
    assert.match(e.message, why);
    for (const name of ['Open shelf', 'Private diary', 'Tides', 'Bees', open.id, secret.id, secret.folder]) assert.ok(!e.message.includes(name), `names nothing: ${e.message}`);
    return e.message;
  };

  // The person: their pages, their sessions, their schedules, their own tokens.
  for (const [source, o] of [['web', {}], ['session', {}], ['task', {}], ['mcp', {}], ['api', { signedIn: true }]] as const)
    assert.equal((await opens(as(set, source, { where: 'Private diary' }, o))).project, 'Private diary', source);

  // An app's key (the route the web apps and programs use), with a real key.
  const { key } = store.createKey(db, set.id, 'a web app');
  const byKey = async (a: ReturnType<typeof app>, k: string, inputs: Record<string, unknown>) => {
    const res = await http.inject({ method: 'POST', url: `/api/apps/${a.slug}/run`, headers: { authorization: `Bearer ${k}` }, payload: { inputs } });
    return { status: res.statusCode, body: res.json() as { id: string; error?: string } };
  };
  const saidById = (await byKey(set, key, { where: secret.id })).body.error!;
  for (const where of [secret.id, 'Private diary', 'Nothing like it']) {
    const res = await byKey(set, key, { where });
    assert.deepEqual([res.status, res.body.error], [403, saidById], 'the same words whether there is such a project or not');
  }
  assert.ok(!/Private|Open shelf|diary/.test(saidById), saidById);
  // The person's last answer is not taken for it: left out, it is the app's own.
  as(set, 'web', { where: secret.id });
  const left = await byKey(set, key, { note: 'x' });
  assert.equal(left.status, 200, left.body.error);
  assert.equal(store.getRun(db, left.body.id)!.project?.id, open.id);
  assert.equal((await opens(store.getRun(db, left.body.id)!)).cwd, open.folder);
  // The default itself, by its id or name: fine. None at all: a folder of its own.
  assert.equal((await opens(as(set, 'api', { where: open.id }))).project, 'Open shelf');
  assert.equal((await opens(as(set, 'api', { where: 'open shelf' }))).project, 'Open shelf');
  const none = await opens(as(plain, 'api', {}));
  assert.deepEqual([none.project, none.space], [undefined, undefined]);
  assert.ok(none.cwd.startsWith(WORK_DIR));
  refused(() => as(plain, 'api', { where: open.id }));
  // A question that is needed, and the app sets none: nothing a key can send starts it.
  assert.match(refusal(() => as(must, 'api', {})).message, /Where: needed/);
  refused(() => as(must, 'api', { where: open.id }));
  // Not even by the person's last answer, where the question remembers one.
  const remembers = one({ required: true, remember: true });
  as(remembers, 'web', { where: secret.id });
  refused(() => as(remembers, 'api', {}), /the app sets none/);
  // A default that is not a project here (deleted, or from another computer) is none, for anyone.
  const gone = one({ default: 'spgone' });
  assert.equal((await opens(as(gone, 'api', {}))).project, undefined);
  assert.equal((await opens(as(gone, 'web', {}))).project, undefined);
  refused(() => as(gone, 'api', { where: secret.id }));

  // A public page: the default or nothing, and it works in no project at all.
  const pub = (a: ReturnType<typeof app>, inputs: Record<string, unknown>) => startRun({ app: a.id, slug: a.slug, recipe: a, source: 'public', inputs, public: { model: 'm', web: false, capUsd: 1 } });
  refused(() => pub(set, { where: secret.id }));
  refused(() => pub(plain, { where: open.id }));
  for (const inputs of [{}, { where: open.id }]) {
    const r = pub(set, inputs);
    assert.equal(r.project, undefined);
    const o = await opens(r);
    assert.deepEqual([o.space, o.cwd === open.folder], [undefined, false]);
    assert.ok(!o.prompt.startsWith('In Open shelf'), o.prompt);
  }

  // A scheduled task whose answer a webhook call fills: the caller's, not the person's. (A literal one is the person's.)
  const hook = scheduler.save({ name: 'Hook', schedule: { kind: 'webhook' }, app: { id: plain.id, inputs: { where: '{{body.where}}' } } } as any);
  const send = (where: string) => scheduler.webhook(hook.hookPath!.split('/').pop()!, { body: { where }, raw: Buffer.from(where), headers: {}, query: {} });
  await send(secret.id).catch(() => {});
  await sleep(300);
  assert.equal(store.listRuns(db, { app: plain.id, source: 'task' }).filter((r) => r.project).length, 0, 'no run of the task reached it');
  const literal = scheduler.save({ name: 'Mine', schedule: { kind: 'daily', time: '09:00' }, app: { id: plain.id, inputs: { where: secret.id } } } as any);
  await scheduler.runNow(literal.id);
  await until(() => store.listRuns(db, { app: plain.id, source: 'task' }).some((r) => r.project?.id === secret.id), 'the person’s schedule chooses');
  for (const r of store.listRuns(db, { app: plain.id, source: 'task' })) await opens(r);
  refused(() => as(plain, 'task', { where: secret.id }, { outside: ['where'] }));
  // A text answer from outside goes with the run to what it calls.
  assert.equal((await opens(as(set, 'task', { note: 'x' }, { outside: ['note'] }))).project, 'Open shelf');
  // Left out in a webhook's run: the app's own, not the person's last answer (which their own schedule takes).
  as(set, 'web', { where: secret.id });
  assert.equal((await opens(as(set, 'task', {}))).project, 'Private diary');
  as(set, 'web', { where: secret.id });
  const bare = scheduler.save({ name: 'Bare hook', schedule: { kind: 'webhook' }, app: { id: set.id, inputs: { note: 'x' } } } as any);
  await scheduler.webhook(bare.hookPath!.split('/').pop()!, { body: {}, raw: Buffer.from('bare'), headers: {}, query: {} });
  await until(() => store.listRuns(db, { app: set.id, source: 'task' }).some((r) => r.inputs.note === 'x' && r.status !== 'done'), 'the webhook’s run');
  const hooked = store.listRuns(db, { app: set.id, source: 'task' }).find((r) => r.inputs.note === 'x' && r.status !== 'done')!;
  assert.equal(hooked.project?.id, open.id);
  await opens(hooked);

  // A run of someone else's that calls another app: held the same way, but may pass on the project it works in.
  const inner = one({}, { name: 'Inner' });
  const outer = (given: string) => app({ name: 'Outer', fields: form({ default: open.id }), flow: { steps: [{ id: 'call', do: 'app', app: inner.slug, with: { where: given } }] } });
  const reach = await ended(as(outer('{{note}}'), 'api', { note: secret.id }).id);
  assert.equal(reach.status, 'failed');
  assert.match(reach.error!, /a run started this way cannot choose a project/);
  const passing = as(outer('{{where}}'), 'api', {});
  await until(() => store.listRuns(db, { parent: passing.id }).some((r) => r.key), 'the called app runs');
  const called = store.listRuns(db, { parent: passing.id })[0];
  assert.equal(called.project?.id, open.id);
  sessions.end(called.key!);
  assert.equal((await ended(passing.id)).status, 'done');
  // The same call from a run of the person's own chooses freely.
  const mine = as(outer('{{note}}'), 'web', { note: secret.id });
  await until(() => store.listRuns(db, { parent: mine.id }).some((r) => r.key), 'the called app runs');
  const child = store.listRuns(db, { parent: mine.id })[0];
  assert.equal(child.project?.id, secret.id);
  sessions.end(child.key!);
  await ended(mine.id);

  // A file of an app never brings a project with it.
  const exported = await http.inject({ method: 'GET', url: `/api/apps/${set.id}/export?as=json` });
  assert.ok(!exported.body.includes(open.id), 'the export leaves it out');
  const file = JSON.parse(exported.body);
  file.app.fields[0].default = 'Private diary';
  const installed = await call<{ app: { id: string; fields: { default?: string }[] }; error?: string }>('POST', '/api/apps/install', { package: file });
  assert.equal(installed.status, 200, installed.body.error);
  assert.equal(installed.body.app.fields[0].default, undefined);
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    console.log(`  FAIL ${name}\n       ${(e as Error).stack?.split('\n').slice(0, 8).join('\n       ')}`);
    process.exitCode = 1;
  }
}
console.log(`${passed}/${tests.length} passed`);
await http.close();
fs.rmSync(tmp, { recursive: true, force: true });
process.exit();
