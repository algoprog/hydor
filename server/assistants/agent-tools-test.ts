// Script tests for list_agents, save_agent and delete_agent: any agent making, changing and deleting the user's own agents
// and their schedules through the app's own API, with the user confirming on one card; the built-ins left alone, Plan
// mode and a scheduled run refused, and a declined card changing nothing. Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/assistants/agent-tools-test.ts
//   DATA_DIR=/tmp/hydor-test-agent-tools node dist/dev/agent-tools-test.js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import type { ApprovalRequest } from '../../shared/types.ts';
import type { ApprovalAnswer } from '../agents/live.ts';
import { noteSpawn } from '../automations/tools.ts';
import { HttpError } from '../auth.ts';
import { kvSet, openDb } from '../db.ts';
import type { Deps, RunCtx, RunTool, ToolOutput } from '../features/types.ts';
import { forgetAllowed } from '../guide/api.ts';
import { isInternal } from '../internal.ts';
import { Scheduler } from '../scheduler.ts';
import type { SessionManager } from '../sessions.ts';
import { setSessionExtra } from '../sessionExtra.ts';
import { createSpace } from '../spaces/index.ts';
import { assistants } from './index.ts';
import { agentVersions } from './versions.ts';
import { agentTools } from './tools.ts';
import { allAssistants, findAssistant, saveAssistant } from './store.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-agent-tools-test-'));
const db = openDb(path.join(tmp, 'test.db'));
kvSet(db, 'user.tz', 'Europe/Athens');
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

// ---- the app, with the routes the tools call ---------------------------------------------------------------

class Sessions extends EventEmitter {
  resumeLookup?: unknown;
  noticeGate?: unknown;
}
const sessions = new Sessions() as unknown as SessionManager;
const scheduler = new Scheduler(db, sessions);
const app = Fastify();
app.addHook('onRequest', async (req, reply) => {
  if (!isInternal(req)) return reply.code(401).send({ error: 'Sign in required' });
});
app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
  const status = err instanceof HttpError ? err.status : err.statusCode && err.statusCode < 600 ? err.statusCode : 500;
  reply.code(status).send({ error: err.message || 'Error' });
});
const deps = { app, db, sessions, scheduler, models: null, broadcast: () => {}, toSubscribers: () => {}, publicBase: () => 'https://agent.example' } as unknown as Deps;
assistants.routes!(deps);
// As the server has them (server/index.ts).
app.get('/api/tasks', async () => ({ tasks: scheduler.list() }));
app.post('/api/tasks', async (req) => ({ task: scheduler.save((req.body ?? {}) as never) }));
app.delete('/api/tasks/:id', async (req) => {
  scheduler.remove((req.params as { id: string }).id);
  return { ok: true };
});
await app.ready();

// ---- a session whose agent shows cards -----------------------------------------------------------------------

let n = 0;
function session(mode: string | undefined, answer: (c: ApprovalRequest) => ApprovalAnswer | null = () => ({ decision: 'accept' })) {
  const cards: ApprovalRequest[] = [];
  const adapter = {
    state: { mode, status: 'idle' as const },
    ask: async (card: ApprovalRequest) => {
      cards.push(card);
      return answer(card);
    },
  };
  const key = `claude:s${++n}`;
  const runId = `run${n}`;
  const ctx = { runId, key, agent: 'claude', cwd: tmp, deps: { ...deps, sessions: Object.assign(Object.create(sessions), { adapterByRun: () => adapter }) } } as unknown as RunCtx;
  const tools = Object.fromEntries(agentTools(ctx).map((t) => [t.name, t])) as Record<'list_agents' | 'save_agent' | 'delete_agent', RunTool>;
  const run = async (tool: keyof typeof tools, args: Record<string, unknown>): Promise<ToolOutput> => {
    const r = await tools[tool].run(args, ctx);
    return typeof r === 'string' ? { text: r } : r;
  };
  return { ctx, cards, run, tools };
}

const base = { name: 'Morning scout', description: 'Reads the news every morning', instructions: 'You read the news and summarize it in five lines.' };
const idOf = (text: string) => /\(id ([\w-]+)\)/.exec(text)![1];
const daily = { kind: 'daily', time: '08:00', days: [1, 2, 3, 4, 5] };
const tasksOf = (agent: string) => scheduler.list().filter((t) => t.extra?.assistant === agent);

// ---- making ----------------------------------------------------------------------------------------------------

test('a new agent with a schedule: the agent and a task that runs as it, on one card', async () => {
  forgetAllowed();
  const s = session('default');
  const r = await s.run('save_agent', { ...base, tier: 'quick', schedules: [{ prompt: 'Read the news and summarize it for me.', schedule: daily }] });
  assert.equal(r.isError, undefined, r.text);
  assert.equal(s.cards.length, 1);
  const card = s.cards[0];
  assert.equal(card.title, 'Make the agent “Morning scout”');
  assert.equal(card.options[0].label, 'Create agent');
  assert.ok(!card.options.some((o) => o.id === 'always'), 'a call that adds schedules asks every time');
  assert.match(card.detail!, /\*\*Morning scout\*\*: Reads the news every morning/);
  assert.match(card.detail!, /- Works: everywhere/);
  assert.match(card.detail!, /- Thinks with: Quick/);
  assert.match(card.detail!, /> You read the news/);
  assert.match(card.detail!, /Adds “Morning scout”: weekdays at 08:00, first run .* \(Europe\/Athens\)/);
  const id = idOf(r.text);
  const a = findAssistant(db, id)!;
  assert.equal(a.name, 'Morning scout');
  assert.equal(a.tier, 'quick');
  assert.equal(a.tools, undefined, 'a new agent gets everything');
  assert.match(r.text, new RegExp(`/agents/${id}`));
  const [t] = tasksOf(id);
  assert.ok(t, 'its schedule is a task that runs as it');
  assert.equal(t.name, 'Morning scout');
  assert.equal(t.agent, 'claude');
  assert.equal(t.mode, 'default');
  assert.equal(t.enabled, true);
  assert.equal(t.prompt, 'Read the news and summarize it for me.');
  assert.deepEqual(t.schedule, { kind: 'daily', time: '08:00', days: [1, 2, 3, 4, 5] });
  assert.match(r.text, new RegExp(`task ${t.id}`));
  assert.equal(agentVersions(db, id)[0].by, 'agent');
});

test('a new agent without schedules asks once and may be allowed for the session; a project’s name is found; a copy starts from its source', async () => {
  forgetAllowed();
  fs.mkdirSync(path.join(tmp, 'thesis'), { recursive: true });
  const sp = createSpace(db, { name: 'Thesis', folder: path.join(tmp, 'thesis') });
  const s = session('default', () => ({ decision: 'always' }));
  const r = await s.run('save_agent', { name: 'Thesis helper', projects: ['thesis'], budgetUsd: 4, tools: ['read', 'web'], program: 'codex', model: 'gpt-x', schedules: [] });
  assert.equal(r.isError, undefined, r.text);
  assert.ok(s.cards[0].options.some((o) => o.id === 'always'));
  assert.match(s.cards[0].detail!, /- Works: Thesis/);
  assert.match(s.cards[0].detail!, /- May use: read files, use the web/);
  assert.match(s.cards[0].detail!, /- Budget: \$4 a month/);
  assert.match(s.cards[0].detail!, /- Program: Codex, model gpt-x/);
  const a = findAssistant(db, idOf(r.text))!;
  assert.deepEqual(a.projects, [sp.id]);
  assert.equal(a.agent, 'codex');
  // Allowed for the session: the next change goes without a card.
  await s.run('save_agent', { id: a.id, description: 'Helps with the thesis' });
  assert.equal(s.cards.length, 1);
  // An agent of a project with one folder: its schedule runs there.
  const r2 = await s.run('save_agent', { id: a.id, schedules: [{ prompt: 'Check the references.', schedule: { kind: 'every', minutes: 60 }, paused: true }] });
  assert.equal(r2.isError, undefined, r2.text);
  const [t] = tasksOf(a.id);
  assert.equal(t.cwd, sp.folder);
  assert.equal(t.agent, 'codex');
  assert.equal(t.mode, 'auto');
  assert.equal(t.model, 'gpt-x');
  assert.equal(t.enabled, false);
  // An unknown project is an error that lists them; nothing is made.
  const before = allAssistants(db).length;
  await assert.rejects(() => s.run('save_agent', { name: 'Lost', projects: ['Nowhere'] }), /There is no project “Nowhere”.*Thesis/);
  assert.equal(allAssistants(db).length, before);
  // A copy of a built-in.
  const c = await s.run('save_agent', { from: 'researcher' });
  const copy = findAssistant(db, idOf(c.text))!;
  assert.equal(copy.name, 'Researcher (copy)');
  assert.equal(copy.builtin, undefined);
  assert.equal(copy.instructions, findAssistant(db, 'researcher')!.instructions);
});

test('an agent that never asks is asked for every time, Full access and an allowed session too; its card says where results go', async () => {
  forgetAllowed();
  // Allowed for the session by an earlier card: a plain change goes without one, a freer mode still asks.
  const s = session('default', () => ({ decision: 'always' }));
  const r = await s.run('save_agent', { name: 'Mailer', output: { to: [{ kind: 'email', to: ['anna@example.org'] }] } });
  assert.equal(r.isError, undefined, r.text);
  assert.match(s.cards[0].detail!, /- Its results go to: .*anna@example\.org/);
  const id = idOf(r.text);
  await s.run('save_agent', { id, mode: 'full' });
  assert.equal(s.cards.length, 2, 'never asks: a card even though changes were allowed for the session');
  assert.ok(!s.cards[1].options.some((o) => o.id === 'always'));
  assert.match(s.cards[1].detail!, /never ask before they act/);
  assert.equal(findAssistant(db, id)!.mode, 'full');
  // Full access: no card for a plain new agent, but one for an agent that never asks.
  const f = session('bypassPermissions');
  await f.run('save_agent', { name: 'Quiet one' });
  assert.equal(f.cards.length, 0);
  await f.run('save_agent', { name: 'Bold one', mode: 'full' });
  assert.equal(f.cards.length, 1);
  assert.match(f.cards[0].detail!, /- Permissions: Full access, never asks/);
});

// ---- changing ------------------------------------------------------------------------------------------------

test('a change keeps every field not given, and its version is by an agent', async () => {
  forgetAllowed();
  const helper = saveAssistant(db, { name: 'Helper', instructions: 'Help.' });
  const a = saveAssistant(db, {
    name: 'Reporter',
    icon: 'newspaper',
    description: 'Weekly reports',
    instructions: 'You write the weekly report.',
    tier: 'best',
    helperMax: 'standard',
    tools: ['read', 'web'],
    budgetUsd: 5,
    canAsk: [helper.id],
    standing: true,
    skills: ['report'],
    source: '/home/u/.claude/agents/reporter.md',
    examples: [{ id: 'one', message: 'Report on May', checks: ['It has a title'] }],
  });
  const s = session('default');
  const r = await s.run('save_agent', { id: a.id, description: 'Reports every Friday', why: 'The user wants it described better.' });
  assert.equal(r.isError, undefined, r.text);
  const now = findAssistant(db, a.id)!;
  assert.deepEqual({ ...now, description: a.description }, a, 'only the description changed (examples and source stay)');
  assert.equal(now.description, 'Reports every Friday');
  const card = s.cards[0];
  assert.equal(card.title, 'Change “Reporter”');
  assert.equal(card.options[0].label, 'Save');
  assert.match(card.detail!, /- Its line is now “Reports every Friday”\./);
  assert.ok(card.options.some((o) => o.id === 'always'));
  const v = agentVersions(db, a.id)[0];
  assert.equal(v.by, 'agent');
  assert.equal(v.line, 'The user wants it described better.');
  // The words for fields, and clearing: Automatic, any tier, no budget, everywhere, no program.
  const names = await s.run('save_agent', { id: a.id, tier: 'auto', helperMax: 'any', budgetUsd: 0, canAsk: [], askable: false, mode: 'full', program: 'claude', model: 'opus' });
  assert.equal(names.isError, undefined, names.text);
  const x = findAssistant(db, a.id)!;
  for (const k of ['tier', 'helperMax', 'budgetUsd', 'canAsk'] as const) assert.equal(x[k], undefined, k);
  assert.equal(x.askable, false);
  assert.equal(x.mode, 'full');
  assert.equal(x.agent, 'claude');
  assert.equal(x.model, 'opus');
  assert.deepEqual(x.tools, ['read', 'web']);
  assert.equal(x.standing, true);
  assert.equal(x.examples?.length, 1);
  assert.match(s.cards[1].detail!, /It thinks with Automatic now \(it was Best\)\./);
  assert.match(s.cards[1].detail!, /It has no monthly budget now\./);
  assert.match(s.cards[1].detail!, /It no longer hands work to Helper\./);
  // Nothing to change; a mistake: both errors, no card.
  const cards = s.cards.length;
  await assert.rejects(() => s.run('save_agent', { id: a.id, tier: 'auto' }), /That changes nothing/);
  await assert.rejects(() => s.run('save_agent', { id: a.id, tier: 'fast' }), /tier is quick/);
  await assert.rejects(() => s.run('save_agent', { id: 'nope', name: 'x' }), /list_agents/);
  assert.equal(s.cards.length, cards);
});

test('schedule changes and removals are limited to the agent’s own schedules', async () => {
  forgetAllowed();
  const mine = saveAssistant(db, { name: 'Owner' });
  const other = saveAssistant(db, { name: 'Other' });
  const task = (name: string, assistant?: string) => scheduler.save({ name, prompt: 'Do it', agent: 'claude', cwd: tmp, schedule: { kind: 'daily', time: '09:00' }, ...(assistant ? { extra: { assistant } } : {}) });
  const own = task('Own run', mine.id);
  const theirs = task('Their run', other.id);
  const plain = task('Plain task');
  const s = session('default');
  const versions = agentVersions(db, mine.id).length;
  for (const t of [theirs, plain]) {
    await assert.rejects(() => s.run('save_agent', { id: mine.id, schedules: [{ id: t.id, prompt: 'Taken over' }] }), /not one of Owner’s schedules/);
    await assert.rejects(() => s.run('save_agent', { id: mine.id, schedules: [{ id: t.id, remove: true }] }), /not one of Owner’s schedules/);
  }
  assert.equal(s.cards.length, 0);
  assert.equal(scheduler.task(theirs.id).prompt, 'Do it');
  // One of its own: changed whole (what is not given stays), then removed.
  const r = await s.run('save_agent', { id: mine.id, schedules: [{ id: own.id, prompt: 'Do it better', schedule: { kind: 'daily', time: '10:30', days: [1] }, paused: true }] });
  assert.equal(r.isError, undefined, r.text);
  const t = scheduler.task(own.id);
  assert.equal(t.prompt, 'Do it better');
  assert.equal(t.name, 'Own run');
  assert.equal(t.enabled, false);
  assert.deepEqual(t.schedule, { kind: 'daily', time: '10:30', days: [1] });
  assert.deepEqual(t.extra, { assistant: mine.id });
  assert.equal(findAssistant(db, mine.id)!.name, 'Owner', 'the agent itself was not saved again');
  assert.equal(agentVersions(db, mine.id).length, versions, 'the agent itself was not saved again');
  assert.match(s.cards[0].detail!, /Changes “Own run”: it runs Mon at 10:30 \(it was daily at 09:00\); its prompt changes; it is paused/);
  assert.equal(s.cards[0].options.some((o) => o.id === 'always'), false);
  const gone = await s.run('save_agent', { id: mine.id, schedules: [{ id: own.id, remove: true }] });
  assert.equal(gone.isError, undefined, gone.text);
  assert.match(s.cards[1].detail!, /Deletes “Own run” \(Mon at 10:30\)/);
  assert.equal(tasksOf(mine.id).length, 0);
  assert.ok(scheduler.task(theirs.id) && scheduler.task(plain.id));
  // A schedule that does not check out comes back as an error before a card shows.
  const cards = s.cards.length;
  await assert.rejects(() => s.run('save_agent', { id: mine.id, schedules: [{ prompt: 'Often', schedule: { kind: 'every', minutes: 1 } }] }), /at least every 5 minutes/);
  await assert.rejects(() => s.run('save_agent', { id: mine.id, schedules: [{ schedule: daily }] }), /prompt/);
  assert.equal(s.cards.length, cards);
});

// ---- deleting ------------------------------------------------------------------------------------------------

test('delete_agent removes the agent and its schedules, and the route says how many', async () => {
  forgetAllowed();
  const a = saveAssistant(db, { name: 'Doomed' });
  const keep = saveAssistant(db, { name: 'Kept' });
  const mk = (name: string, assistant: string) => scheduler.save({ name, prompt: 'Run', agent: 'claude', cwd: tmp, schedule: { kind: 'daily', time: '07:00' }, extra: { assistant } });
  mk('First', a.id);
  mk('Second', a.id);
  const safe = mk('Safe', keep.id);
  const s = session('default');
  const r = await s.run('delete_agent', { id: a.id });
  assert.equal(r.isError, undefined, r.text);
  assert.equal(r.text, 'Deleted Doomed and its 2 schedules.');
  const card = s.cards[0];
  assert.equal(card.title, 'Delete “Doomed”');
  assert.equal(card.options[0].label, 'Delete');
  assert.equal(card.options[0].style, 'danger');
  assert.ok(!card.options.some((o) => o.id === 'always'));
  assert.match(card.detail!, /Sessions started as it keep going without its instructions\./);
  assert.match(card.detail!, /- “First”: daily at 07:00/);
  assert.match(card.detail!, /Its history of results goes; the pages and spreadsheets it filled stay\./);
  assert.equal(findAssistant(db, a.id), null);
  assert.equal(tasksOf(a.id).length, 0);
  assert.equal(scheduler.task(safe.id).name, 'Safe');
  // The route itself: how many went.
  const b = saveAssistant(db, { name: 'Gone too' });
  mk('Only', b.id);
  const { internalHeaders } = await import('../internal.ts');
  const res = await app.inject({ method: 'DELETE', url: `/api/assistants/${b.id}`, headers: internalHeaders() });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().schedules, 1);
  assert.equal(tasksOf(b.id).length, 0);
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/assistants/${keep.id}`, headers: internalHeaders() })).json().schedules, 1);
  // One schedule: singular.
  const c = saveAssistant(db, { name: 'Solo' });
  mk('Just one', c.id);
  assert.equal((await s.run('delete_agent', { id: c.id })).text, 'Deleted Solo and its 1 schedule.');
});

// ---- what is refused ----------------------------------------------------------------------------------------------

test('built-in agents are refused, to change and to delete; an unknown id points to list_agents', async () => {
  const s = session('default');
  await assert.rejects(() => s.run('save_agent', { id: 'general', name: 'Mine' }), /built in.*from/);
  await assert.rejects(() => s.run('delete_agent', { id: 'general' }), /built in/);
  await assert.rejects(() => s.run('delete_agent', { id: 'nobody' }), /list_agents/);
  await assert.rejects(() => s.run('save_agent', { from: 'nobody' }), /list_agents/);
  await assert.rejects(() => s.run('save_agent', { id: 'x', from: 'general' }), /leave out id/);
  assert.equal(s.cards.length, 0);
});

test('Plan mode only reads: nothing is changed and no card shows', async () => {
  forgetAllowed();
  const a = saveAssistant(db, { name: 'Planned' });
  const s = session('plan');
  const made = await s.run('save_agent', { name: 'Not made' });
  assert.equal(made.isError, true);
  assert.match(made.text, /only reads/);
  assert.equal((await s.run('save_agent', { id: a.id, description: 'Changed' })).isError, true);
  const del = await s.run('delete_agent', { id: a.id });
  assert.equal(del.isError, true);
  assert.equal(s.cards.length, 0);
  assert.equal(findAssistant(db, a.id)!.description, '');
  assert.equal(allAssistants(db).some((x) => x.name === 'Not made'), false);
  // Listing is reading.
  assert.match((await s.run('list_agents', {})).text, /Planned/);
});

test('a declined card changes nothing, and says what the user said', async () => {
  forgetAllowed();
  const a = saveAssistant(db, { name: 'Undecided' });
  const t = scheduler.save({ name: 'Its run', prompt: 'Run', agent: 'claude', cwd: tmp, schedule: { kind: 'daily', time: '07:00' }, extra: { assistant: a.id } });
  const s = session('default', () => ({ decision: 'deny', message: 'Not now' }));
  const before = allAssistants(db).length;
  const made = await s.run('save_agent', { name: 'Declined', schedules: [{ prompt: 'Never', schedule: daily }] });
  assert.equal(made.isError, true);
  assert.match(made.text, /said no: “Not now”/);
  assert.equal(allAssistants(db).length, before);
  assert.equal(scheduler.list().some((x) => x.prompt === 'Never'), false);
  assert.equal((await s.run('save_agent', { id: a.id, description: 'Changed', schedules: [{ id: t.id, remove: true }] })).isError, true);
  assert.equal(findAssistant(db, a.id)!.description, '');
  assert.equal(scheduler.task(t.id).name, 'Its run');
  assert.equal((await s.run('delete_agent', { id: a.id })).isError, true);
  assert.ok(findAssistant(db, a.id));
  assert.equal(tasksOf(a.id).length, 1);
  assert.equal(s.cards.length, 3);
});

test('the tools refuse in a scheduled run, and in a try of an example', async () => {
  const a = saveAssistant(db, { name: 'Busy' });
  const s = session('default');
  noteSpawn(s.ctx.runId, { automations: { run: 'r1', task: 't1' } });
  for (const [tool, args] of [
    ['save_agent', { name: 'No' }],
    ['save_agent', { id: a.id, description: 'No' }],
    ['delete_agent', { id: a.id }],
  ] as const)
    await assert.rejects(() => s.run(tool, args), /scheduled run cannot/);
  assert.equal(s.cards.length, 0);
  assert.ok(findAssistant(db, a.id));
  // Reading is still fine there.
  assert.match((await s.run('list_agents', {})).text, /Busy/);
  const e = session('default');
  setSessionExtra(db, e.ctx.key, { agentExample: { agent: a.id, run: 'x', example: 'y' } });
  await assert.rejects(() => e.run('save_agent', { name: 'No' }), /try of an agent’s examples/);
});

// ---- list_agents -----------------------------------------------------------------------------------------------

test('list_agents: one line for each agent with its schedules, the built-ins named, and one agent in full', async () => {
  fs.mkdirSync(path.join(tmp, 'atlas'), { recursive: true });
  const sp = createSpace(db, { name: 'Atlas', folder: path.join(tmp, 'atlas') });
  const a = saveAssistant(db, { name: 'Lister', description: 'Lists things', tier: 'standard', budgetUsd: 3, projects: [sp.id] });
  const t = scheduler.save({ name: 'List run', prompt: `Do the list. ${'x'.repeat(2000)}`, agent: 'claude', cwd: tmp, schedule: daily as never, extra: { assistant: a.id }, enabled: true });
  const paused = scheduler.save({ name: 'Paused run', prompt: 'Later', agent: 'claude', cwd: tmp, schedule: { kind: 'every', minutes: 60 }, extra: { assistant: a.id }, enabled: false });
  const s = session('default');
  const text = (await s.run('list_agents', {})).text;
  const line = text.split('\n').find((l) => l.startsWith(`- ${a.id} ·`))!;
  assert.match(line, /Lister — Lists things · works in Atlas · tier: Standard · budget \$3 a month, \$0 spent this month/);
  assert.match(text, new RegExp(`  - schedule ${t.id} · List run · Weekdays at 08:00 · next `));
  assert.match(text, new RegExp(`schedule ${paused.id} · Paused run · Every hour · paused`));
  assert.match(text, /Built-in agents \(they cannot be changed, but save_agent with from copies one\): general · General, researcher · Researcher/);
  assert.match(text, /Times are in Europe\/Athens\./);
  assert.equal(text.match(/Europe\/Athens/g)!.length, 1, 'the zone is named once');
  const full = (await s.run('list_agents', { id: a.id })).text;
  assert.match(full, /Settings \(0 examples left out\):/);
  assert.match(full, /"tier": "standard"/);
  assert.doesNotMatch(full, /"examples"/);
  assert.match(full, new RegExp(`- ${t.id} · List run · .* · on · last: not run yet`));
  assert.match(full, /- .* · Paused run · .* · off · /);
  const prompt = /prompt: (Do the list\. x+…)/.exec(full)![1];
  assert.ok(prompt.length < 1530);
  await assert.rejects(() => s.run('list_agents', { id: 'nope' }), /list_agents/);
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
await app.close();
db.close();
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(process.exitCode ?? 0);
