// Which program an app runs with (shared/app-run-with.ts, runwith.ts), through the app's routes, with a stand-in for the
// session manager and for the sign-ins (no claude or codex is started and no model asked): the order of a ready-made
// app's choices (this run, the one kept for it, the setting, its own), Automatic with neither program signed in (Custom,
// with the app's tier as Custom's table has it), a kept choice for a scheduled run, an app of the person's own on a
// program not signed in (refused before the run), new apps' program, and use_app's refusal.
// Build and run with scratch folders (Run with HOME under the temporary folder: runs make folders there):
//   OUTDIR=dist/dev node scripts/build-server.mjs server/apps/runwith-test.ts
//   HOME=/tmp/hydor-test-runwith-home DATA_DIR=/tmp/hydor-test-runwith node dist/dev/runwith-test.js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { defaultPick, programsOf, resolvePick, samePick, type OwnPick } from '../../shared/app-run-with.ts';
import { cleanRecipe, type AppRecipe } from '../../shared/apps.ts';
import { initPrograms, programsChanged, programStatus } from '../agents/programs.ts';
import { HttpError } from '../auth.ts';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { AGENT_FILE } from '../models/config.ts';
import type { AppRunner, Scheduler } from '../scheduler.ts';
import { apps } from './index.ts';
import { keptPick, runWithSetting } from './runwith.ts';
import { startRuns, stopRun } from './runs.ts';
import * as store from './store.ts';
import { TEMPLATES, templateById } from './templates.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-runwith-test-'));
const db = openDb(path.join(tmp, 'test.db'));
store.ensureTables(db);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

// Custom's models: OpenRouter's, so its tiers have a Haiku, a Sonnet and an Opus with neither program signed in.
fs.mkdirSync(path.dirname(AGENT_FILE), { recursive: true });
fs.writeFileSync(
  AGENT_FILE,
  JSON.stringify({ models: ['haiku', 'sonnet', 'opus'].map((n) => ({ id: `openrouter/claude-${n}-4.5`, label: `Claude ${n[0].toUpperCase()}${n.slice(1)} 4.5`, provider: 'openrouter', model: `anthropic/claude-${n}-4.5` })) }),
);

class FakeSessions extends EventEmitter {
  made: { key: string; o: any }[] = [];
  status = new Map<string, string>();
  async create(o: any) {
    const key = `acp:fake-${this.made.length + 1}`;
    this.made.push({ key, o });
    this.status.set(key, 'working');
    return key;
  }
  setFlags() {}
  summary(key: string) {
    const st = this.status.get(key);
    return st ? ({ key, agent: 'acp', stats: { tokensIn: 0, tokensOut: 0, tokensCached: 0 }, live: { status: st } } as any) : null;
  }
  async timeline() {
    return { parser: { items: [] }, readMore: async () => {} } as any;
  }
  liveSnapshot() {
    return { live: null, overlay: { items: [], patches: {}, approvals: [] } };
  }
  async interrupt(key: string) {
    this.status.set(key, 'idle');
    this.emit('live', key);
  }
  async deliverOrQueue() {}
  adapterByRun() {
    return { ask: async () => null } as any;
  }
}

const sessions = new FakeSessions();
const http = Fastify();
await http.register(cookie);
http.setErrorHandler((err: Error, _req, reply) => {
  reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message });
});
let runner: AppRunner;
const scheduler = { useApps: (a: AppRunner) => (runner = a), appRunEnded: () => {}, list: () => [] } as unknown as Scheduler;
const deps = { app: http, db, sessions: sessions as any, scheduler, models: null as any, broadcast: () => {}, toSubscribers: () => {}, publicBase: () => 'http://test.local' } as Deps;

// The sign-ins, faked: nothing asks the real programs.
const signed = { claude: true, codex: true };
initPrograms({ db, accounts: () => [undefined], account: async (p) => ({ agent: p, loggedIn: signed[p] }) });
async function signIns(claude: boolean, codex: boolean) {
  Object.assign(signed, { claude, codex });
  programsChanged();
  await programStatus({ fresh: true });
}

apps.routes!(deps);
startRuns(deps);
await http.ready();

const call = async (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) => {
  const r = await http.inject({ method, url, ...(payload ? { payload } : {}) });
  return { status: r.statusCode, body: r.json() };
};

/** Figure doctor: a program, then one agent step with the app's tier (standard), so its session shows what was settled. */
const APP = 'tpl:figure-doctor';
const inputs = { plots: path.join(tmp, 'plot.png') };

/** Waits for the session its agent step starts, and gives what it was started with; then stops the run. */
async function agentSession(runId: string, before: number): Promise<any> {
  for (let i = 0; i < 400 && sessions.made.length === before; i++) await sleep(25);
  const made = sessions.made[before];
  assert.ok(made, `the agent step started a session (run: ${store.getRun(db, runId)?.status} ${store.getRun(db, runId)?.error ?? ''})`);
  await stopRun(runId);
  return made.o;
}

/** Runs the ready-made app from its page's route and gives the run's settled recipe and its agent's session. */
async function run(body: object = {}) {
  const before = sessions.made.length;
  const r = await call('POST', `/api/apps/${APP}/runs`, { inputs, ...body });
  assert.equal(r.status, 200, r.body.error);
  const o = await agentSession(r.body.run.id, before);
  return { recipe: store.getRun(db, r.body.run.id)!.recipe, o };
}

test('the order: this run’s pick, the choice kept, the setting, the app’s own; a model by name stays with its program', () => {
  const own: OwnPick = { agent: 'claude', tier: 'standard' };
  const both = { claude: true, codex: true };
  const kept = { agent: 'codex' as const, tier: 'best' as const };
  assert.deepEqual(resolvePick(own, { setting: 'auto', status: both }), { pick: { agent: 'claude', tier: 'standard' }, from: 'auto' });
  assert.deepEqual(resolvePick(own, { setting: 'custom', status: both }), { pick: { agent: 'acp', acpAgent: 'console', tier: 'standard' }, from: 'setting' });
  assert.deepEqual(resolvePick(own, { setting: 'custom', kept, status: both }), { pick: kept, from: 'kept' });
  assert.deepEqual(resolvePick(own, { setting: 'custom', kept, sent: { agent: 'claude', model: null, tier: 'max' }, status: both }), { pick: { agent: 'claude', tier: 'max' }, from: 'run' });
  // A model: null is the program's own default; neither said is the app's tier; no program named changes only what is said.
  assert.deepEqual(resolvePick(own, { setting: 'auto', sent: { agent: 'codex', model: null }, status: both }).pick, { agent: 'codex' });
  assert.deepEqual(resolvePick(own, { setting: 'auto', sent: { agent: 'codex' }, status: both }).pick, { agent: 'codex', tier: 'standard' });
  assert.deepEqual(resolvePick(own, { setting: 'auto', kept, sent: { model: 'gpt-x' }, status: both }).pick, { agent: 'codex', model: 'gpt-x' });
  // Automatic takes the first signed in.
  assert.equal(defaultPick(own, 'auto', { claude: false, codex: true }).agent, 'codex');
  assert.equal(defaultPick(own, 'auto', { claude: false, codex: false }).agent, 'acp');
  // A model named by name for one program is replaced by the app's tier on another.
  const named: OwnPick = { agent: 'claude', model: 'opus', tier: 'best', effort: 'high' };
  assert.deepEqual(defaultPick(named, 'auto', both), { agent: 'claude', model: 'opus', effort: 'high' });
  assert.deepEqual(defaultPick(named, 'codex', both), { agent: 'codex', tier: 'best' });
  assert.ok(samePick({ agent: 'claude' }, { agent: 'claude', mode: 'auto' }));
  assert.ok(!samePick({ agent: 'claude', tier: 'best' }, { agent: 'claude', tier: 'max' }));
});

test('ready-made apps name no program or model in a step (a model would be one program’s)', () => {
  for (const t of TEMPLATES) {
    assert.equal(t.model, undefined, t.id);
    for (const flow of [t.flow, ...Object.values(t.flows ?? {})]) {
      const walk = (v: unknown): void => {
        if (!v || typeof v !== 'object') return;
        const s = v as { do?: string; agent?: string; model?: string };
        if (s.do === 'agent') assert.ok(!s.agent && !s.model, `${t.id}: an agent step names no program or model`);
        Object.values(v).forEach(walk);
      };
      walk(flow);
    }
  }
});

test('the programs a run needs: its agent’s, its agent steps’ and ctx.agent’s; model and tool steps need none', () => {
  const r = (flow: object) => cleanRecipe({ agent: 'claude', prompt: 'x', flow });
  assert.deepEqual(programsOf(cleanRecipe({ agent: 'codex', prompt: 'x' })).map((p) => p.agent), ['codex']);
  assert.deepEqual(programsOf(r({ steps: [{ id: 'a', do: 'model', instructions: 'x' }] })), []);
  assert.deepEqual(programsOf(r({ steps: [{ id: 'a', do: 'agent', instructions: 'x', agent: 'codex' }] })).map((p) => [p.agent, p.step]), [['codex', true]]);
  assert.deepEqual(programsOf(r({ steps: [{ id: 'a', do: 'code', code: 'return await ctx.agent("x")' }] })).map((p) => p.agent), ['claude']);
});

test('Automatic with neither program signed in: Custom, with the app’s tier as Custom’s table has it', async () => {
  await signIns(false, false);
  const page = (await call('GET', `/api/apps/${APP}`)).body;
  assert.deepEqual(page.runsWith, { pick: { agent: 'acp', acpAgent: 'console', tier: templateById('figure-doctor')!.tier }, from: 'auto' });
  const { recipe, o } = await run();
  assert.equal(recipe.agent, 'acp');
  assert.equal(o.agent, 'acp');
  assert.equal(o.acpAgent, 'console');
  assert.equal(o.model, 'openrouter/claude-sonnet-4.5');
  await signIns(true, true);
});

test('the setting, a kept choice over it and this run’s pick over both; back to default', async () => {
  assert.equal((await run()).o.agent, 'claude', 'Automatic: Claude Code, signed in');
  assert.equal((await call('PUT', '/api/apps/run-with', { value: 'nope' })).status, 400);
  assert.equal((await call('PUT', '/api/apps/run-with', { value: 'codex' })).body.value, 'codex');
  assert.equal((await run()).o.agent, 'codex');
  const kept = await call('PUT', `/api/apps/${APP}/run-with`, { agent: 'acp', acpAgent: 'console', model: null, tier: 'best', effort: 'high' });
  assert.deepEqual(kept.body.runsWith, { pick: { agent: 'acp', acpAgent: 'console', tier: 'best', effort: 'high' }, from: 'kept' });
  const k = await run();
  assert.equal(k.o.agent, 'acp');
  assert.equal(k.o.model, 'openrouter/claude-opus-4.5');
  assert.equal(k.o.effort, 'high');
  assert.equal((await run({ agent: 'claude', model: 'my-model' })).o.model, 'my-model', 'this run’s pick');
  assert.equal(keptPick(db, 'figure-doctor')!.agent, 'acp', 'a run’s pick is not kept');
  const back = await call('DELETE', `/api/apps/${APP}/run-with`);
  assert.deepEqual(back.body.runsWith, { pick: { agent: 'codex', tier: 'standard' }, from: 'setting' });
  await call('PUT', '/api/apps/run-with', { value: 'auto' });
  assert.equal(runWithSetting(db), 'auto');
});

test('a kept choice applies to a scheduled run', async () => {
  await call('PUT', `/api/apps/${APP}/run-with`, { agent: 'codex' });
  const before = sessions.made.length;
  const started = await runner.start({ app: APP, inputs, test: false });
  const o = await agentSession(started.id, before);
  assert.equal(o.agent, 'codex');
  assert.equal(store.getRun(db, started.id)!.source, 'task');
  await call('DELETE', `/api/apps/${APP}/run-with`);
});

test('a program not signed in is refused before the run, with where to change it; no other takes its place', async () => {
  await call('PUT', `/api/apps/${APP}/run-with`, { agent: 'codex' });
  await signIns(true, false);
  const n = store.listRuns(db, { limit: 200 }).length;
  let r = await call('POST', `/api/apps/${APP}/runs`, { inputs });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /is kept to run with Codex.*not signed in.*Settings → Agents → Accounts.*app’s page/);
  await assert.rejects(async () => runner.start({ app: APP, inputs, test: false }), /Codex is not signed in/);
  assert.equal((await call('PUT', `/api/apps/${APP}/run-with`, { agent: 'codex' })).status, 409, 'nor kept again');
  await call('DELETE', `/api/apps/${APP}/run-with`);
  assert.equal((await call('PUT', '/api/apps/run-with', { value: 'codex' })).status, 409, 'nor set');
  const shown = (await call('GET', '/api/apps/run-with')).body;
  assert.deepEqual(shown.options.map((o: { value: string; usable: boolean }) => [o.value, o.usable]), [['auto', true], ['claude', true], ['codex', false], ['custom', true]]);
  r = await call('POST', `/api/apps/${APP}/runs`, { inputs, agent: 'codex' });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /^Codex is not signed in here.*pick another program for this run/);
  // The setting chosen while it was signed in.
  await signIns(true, true);
  await call('PUT', '/api/apps/run-with', { value: 'codex' });
  await signIns(true, false);
  r = await call('POST', `/api/apps/${APP}/runs`, { inputs });
  assert.match(r.body.error, /Ready-made apps are set to run with Codex.*Settings → Capabilities → Apps → Ready-made apps run with/);
  assert.equal(store.listRuns(db, { limit: 200 }).length, n, 'no run was made');
  // use_app says so before its card asks anything.
  const ctx = { runId: 'tool', key: 'claude:someone', agent: 'claude', cwd: tmp, deps } as unknown as RunCtx;
  const use = apps.tools!(ctx).find((t) => t.name === 'use_app')!;
  const said = (await use.run({ app: APP, inputs }, ctx)) as { text: string; isError?: boolean };
  assert.ok(said.isError, JSON.stringify(said));
  assert.match(said.text, /could not start: Ready-made apps are set to run with Codex/);
  await signIns(true, true);
  await call('PUT', '/api/apps/run-with', { value: 'auto' });
});

const own = (p: Partial<AppRecipe> = {}) => ({ name: 'Mine', prompt: 'Do it.', fields: [], answer: [], tools: null, limits: {}, cwd: tmp, ...p });

test('an app of your own on a program not signed in is refused with the message; one with no agent step runs', async () => {
  const made = (await call('POST', '/api/apps', { recipe: own({ agent: 'claude' }) })).body.app;
  const flow = (await call('POST', '/api/apps', { recipe: own({ name: 'Sums', agent: 'claude', prompt: '', flow: { steps: [{ id: 'a', do: 'code', code: 'return { n: 1 }' }] } as any }) })).body.app;
  await signIns(false, true);
  const r = await call('POST', `/api/apps/${made.id}/runs`, { inputs: {} });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /“Mine” runs with Claude Code, and Claude Code is not signed in here.*Edit → Settings → Who does it/);
  await assert.rejects(async () => runner.start({ app: made.id, inputs: {}, test: false }), /runs with Claude Code/);
  assert.equal((await call('POST', `/api/apps/${made.id}/batches`, { rows: [{}] })).status, 409);
  assert.equal(store.listRuns(db, { app: made.id }).length, 0);
  assert.equal((await call('POST', `/api/apps/${flow.id}/runs`, { inputs: {} })).status, 200, 'no agent at work: no program needed');
  await signIns(true, true);
});

test('a new app takes the first program signed in; a saved one keeps its own when a change names none', async () => {
  await signIns(false, false);
  const made = (await call('POST', '/api/apps', { recipe: own({ name: 'New' }) })).body.app;
  assert.equal(made.agent, 'acp');
  assert.equal(made.acpAgent, 'console');
  await signIns(false, true);
  assert.equal((await call('POST', '/api/apps', { recipe: own({ name: 'Newer' }) })).body.app.agent, 'codex');
  const changed = (await call('PUT', `/api/apps/${made.id}`, { recipe: own({ name: 'New', prompt: 'Do it well.' }) })).body.app;
  assert.equal(changed.agent, 'acp');
  await signIns(true, true);
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n`, e);
    process.exitCode = 1;
  }
}
console.log(`${passed}/${tests.length} passed`);
await http.close();
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(process.exitCode ?? 0);
