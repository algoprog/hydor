// Script tests for templates with steps (flow.ts and shared/app-manifest.ts), the data templates keep
// (data.ts), a template's own memory, and templates as files (package.ts): the format tidied and checked
// in words, values in text, rules, and flows run end to end through the routes, with stand-ins for the
// session manager (agent steps), a model server (model steps) and the tools.
// Build and run with scratch folders:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/apps/flow-test.ts
//   DATA_DIR=/tmp/naget-test-flow NAGET_APPS_DIR=/tmp/naget-test-flow-apps node dist/dev/flow-test.js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { cleanRecipe, isActive } from '../../shared/apps.ts';
import { checkFlow, cleanData, cleanFlow, cleanRequires, evalRule, fillRefs, flowOf, readRule, valueOf, type Scope } from '../../shared/app-manifest.ts';
import { HttpError } from '../auth.ts';
import { automations } from '../automations/index.ts';
import { listRuns as listTaskRuns } from '../automations/runs.ts';
import { kvSet, openDb } from '../db.ts';
import { Scheduler } from '../scheduler.ts';
import type { SessionManager } from '../sessions.ts';
import { registerFeatures } from '../features/registry.ts';
import type { Deps, Feature, RunCtx } from '../features/types.ts';
import { setHelperModel } from '../helper.ts';
import { repoRoot } from '../memory/store.ts';
import { AGENT_FILE } from '../models/config.ts';
import { findRecords } from './data.ts';
import { createPage, initPages, listPages, pageInfo, pageSource } from '../pages/store.ts';
import { setEmbedderForTests } from '../memory/embed.ts';
import * as vec from '../memory/vectors.ts';
import { envDir, envOf, envTesting } from './env.ts';
import { flowRunner, stepsOf as flowSteps } from './flow.ts';
import { apps } from './index.ts';
import { packageOf, zipPackage } from './package.ts';
import { MEMORY_MARK, runFolder, saveResult, startRun, startRuns, stopRun, waitFor, WORK_DIR } from './runs.ts';
import * as store from './store.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/') || !process.env.NAGET_APPS_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… and NAGET_APPS_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'naget-flow-test-'));
const db = openDb(path.join(tmp, 'test.db'));
store.ensureTables(db);
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- stand-ins -------------------------------------------------------------------------------------------

/** The session manager: sessions start at once and work until a test ends their turn. */
class FakeSessions extends EventEmitter {
  made: { key: string; o: any }[] = [];
  status = new Map<string, string>();
  replies = new Map<string, string[]>();
  /** What each session's transcript shows before its replies: the user's message, the tools it called. */
  items = new Map<string, unknown[]>();
  archived = new Set<string>();
  interrupted: string[] = [];
  async create(o: any) {
    const key = `acp:fake-${this.made.length + 1}-${Math.random().toString(36).slice(2, 8)}`;
    this.made.push({ key, o });
    this.status.set(key, 'working');
    return key;
  }
  setFlags(key: string, f: { archived?: boolean }) {
    if (f.archived) this.archived.add(key);
  }
  summary(key: string) {
    const st = this.status.get(key);
    return st ? ({ key, agent: 'acp', stats: { tokensIn: 0, tokensOut: 0, tokensCached: 0 }, live: { status: st } } as any) : null;
  }
  async timeline(key: string) {
    const said = this.replies.get(key) ?? [];
    return { parser: { items: [...(this.items.get(key) ?? []), ...said.map((text, i) => ({ kind: 'assistant', id: `a${i}`, seq: i, text }))] }, readMore: async () => {} } as any;
  }
  liveSnapshot() {
    return { live: null, overlay: { items: [], patches: {}, approvals: [] } };
  }
  async interrupt(key: string) {
    this.interrupted.push(key);
    this.status.set(key, 'idle');
    this.emit('live', key);
  }
  async deliverOrQueue(key: string) {
    this.status.set(key, 'working');
  }
  end(key: string, reply = 'All done.') {
    this.replies.set(key, [...(this.replies.get(key) ?? []), reply]);
    this.status.set(key, 'idle');
    this.emit('live', key);
  }
}

/** A model server as Custom's models speak to theirs (chat completions, streamed): answers from `model.answer`, keeps each call. */
const model = { calls: [] as { system: string; user: string }[], answer: (_system: string, _user: string): string => '{}' };
const srv = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const b = JSON.parse(body || '{}');
    const system = String(b.messages?.find((m: any) => m.role === 'system')?.content ?? '');
    const user = String(b.messages?.find((m: any) => m.role === 'user')?.content ?? '');
    model.calls.push({ system, user });
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: model.answer(system, user) }, finish_reason: 'stop' }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 120, completion_tokens: 30, cost: 0.001 } })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
});
await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
fs.mkdirSync(path.dirname(AGENT_FILE), { recursive: true });
fs.writeFileSync(AGENT_FILE, JSON.stringify({ models: [{ id: 'fake', label: 'Fake', provider: 'endpoint', baseUrl: `http://127.0.0.1:${(srv.address() as { port: number }).port}/v1`, model: 'fake-1', tools: 'native' }] }));

/** Two of the app's own tools: a search that answers JSON, and a page reader that cannot read "broken" pages. */
const toolCalls: { tool: string; args: any }[] = [];
const fakeTools: Feature = {
  id: 'fake-tools',
  tools: () => [
    {
      name: 'web_search',
      description: 'Searches the web.',
      inputSchema: { type: 'object' },
      async run(a) {
        toolCalls.push({ tool: 'web_search', args: a });
        return JSON.stringify({ results: [{ title: `About ${a.query}`, url: 'https://example.com/1' }] });
      },
    },
    {
      name: 'read_page',
      description: 'Reads a page.',
      inputSchema: { type: 'object' },
      async run(a) {
        toolCalls.push({ tool: 'read_page', args: a });
        if (String(a.url).includes('broken')) return { text: 'That page could not be read', isError: true };
        return `The page at ${a.url} says hello.`;
      },
    },
  ],
};

initPages(db);
const sessions = new FakeSessions();
const http = Fastify();
await http.register(cookie);
http.setErrorHandler((err: Error, _req, reply) => {
  reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message });
});
const scheduler = new Scheduler(db, sessions as unknown as SessionManager);
const deps = { app: http, db, sessions: sessions as any, scheduler, models: null as any, broadcast: () => {}, toSubscribers: () => {}, publicBase: () => 'http://test.local' } as Deps;
apps.routes!(deps);
registerFeatures([fakeTools, automations], deps);
startRuns(deps);
await http.ready();
setHelperModel(db, 'fake');

const app = (p: Record<string, unknown>) =>
  store.saveApp(db, {
    recipe: cleanRecipe({ name: 'Flow', agent: 'claude', fields: [{ id: 'topic', label: 'Topic', type: 'text', required: true }, { id: 'names', label: 'Names', type: 'long' }], answer: [], tools: null, limits: {}, ...p }),
  });

/** Waits for a run to end. */
async function ended(id: string, ms = 30_000) {
  const r = await waitFor(id, ms);
  assert.ok(r && !isActive(r.status), `run ${id} ended (it is ${r?.status})`);
  return r!;
}

/** An agent step's run, once its session is there; it hands in `result` and ends its turn. */
async function agentAnswers(parent: string, step: string, result: Record<string, unknown> | null, reply = 'Done.') {
  let child: store.RunRecord | undefined;
  for (let i = 0; i < 200 && !(child = store.listRuns(db, { parent }).find((r) => r.step === step && r.key)); i++) await sleep(25);
  assert.ok(child, `the step ${step} started its run`);
  if (result) saveResult(child.id, result);
  sessions.end(child.key!, reply);
  return child;
}

const stepsOf = (id: string) => store.listSteps(db, id).map((s) => `${s.path}:${s.status}`);

// ---- the format -----------------------------------------------------------------------------------------

test('format: steps tidied from what an agent writes (ids from titles, kinds in short), mistakes said in words', () => {
  const { flow, errors } = cleanFlow({
    steps: [
      { do: 'model', title: 'Sum it up', instructions: 'Sum up {{topic}}', outputs: { title: 'text', tags: 'list(text)', rows: 'table(name: text, price: number)', notes: 'long' } },
      { do: 'data', add: 'items', with: { title: '{{sum_it_up.title}}' } },
      { do: 'nonsense' },
      { id: 'sum_it_up', do: 'agent' },
      { id: 'x', do: 'model', instructions: 'y', outputs: { a: 'colour' } },
    ],
  });
  const [sum, add] = flow!.steps as any[];
  assert.equal(sum.id, 'sum_it_up');
  assert.deepEqual(
    sum.outputs.map((f: any) => [f.id, f.type, f.columns?.map((c: any) => `${c.id}:${c.type}`).join(',')]),
    [
      ['title', 'text', undefined],
      ['tags', 'list', undefined],
      ['rows', 'table', 'name:text,price:number'],
      ['notes', 'markdown', undefined],
    ],
  );
  assert.deepEqual([add.do, add.op, add.collection], ['data', 'add', 'items']);
  assert.ok(errors.some((e) => /“nonsense” is not a kind of step/.test(e)), errors.join('\n'));
  assert.ok(errors.some((e) => /Two steps are called “sum_it_up”/.test(e)));
  assert.ok(errors.some((e) => /write what the agent is asked to do/.test(e)));
  assert.ok(errors.some((e) => /“colour” is not a kind of value/.test(e)));
});

test('format: a recipe without steps is one agent step; flows, data and memory survive tidying', () => {
  const r = cleanRecipe({ name: 'X', prompt: 'Do {{topic}}', answer: [{ id: 'a', label: 'A', type: 'text' }], data: { items: { title: 'text', done: 'yesno' }, notes: {} }, memory: true, flow: [{ id: 'one', do: 'model', instructions: 'Hi' }] });
  assert.equal(r.flow!.steps[0].id, 'one');
  assert.deepEqual(Object.keys(r.data!), ['items', 'notes']);
  assert.deepEqual(r.data!.items.fields!.map((f) => f.type), ['text', 'yesno']);
  assert.equal(r.memory, true);
  const plain = cleanRecipe({ name: 'Y', prompt: 'Do it', answer: [{ id: 'a', label: 'A', type: 'text' }] });
  assert.equal(plain.flow, undefined);
  const one = flowOf(plain).steps[0] as any;
  assert.deepEqual([one.do, one.instructions, one.outputs[0].id], ['agent', 'Do it', 'a']);
  assert.ok(cleanData({ items: { id: 'text' } }).errors.some((e) => /a record's own/.test(e)));
});

test('checks: values from later steps, from inside a Repeat, from another branch; rules, tools and what it keeps', () => {
  const r = cleanRecipe({
    name: 'x',
    prompt: '',
    fields: [{ id: 'topic', label: 'Topic' }],
    answer: [{ id: 'summary', label: 'Summary', type: 'markdown', required: true }],
    data: { items: { title: 'text', done: 'yesno' } },
    flow: {
      steps: [
        { id: 'a', do: 'model', instructions: '{{b.text}} {{inputs.nope}} {{loopstep.text}}' },
        { id: 'b', do: 'tool', tool: 'web_search', with: { query: '{{topic}}' } },
        { id: 'c', do: 'tool', tool: 'bash' },
        { id: 'd', do: 'decide', rule: '{{b.text}} ~~ x', then: [{ id: 'e', do: 'model', instructions: 'x' }] },
        { id: 'f', do: 'model', instructions: '{{e.text}} {{a.titel}}', outputs: { summary: 'long' } },
        { id: 'loop', do: 'repeat', over: '{{b.data.results}}', until: '{{index}} > 3', steps: [{ id: 'loopstep', do: 'model', instructions: '{{item.title}} #{{index}}' }] },
        { id: 'par', do: 'parallel', branches: [[{ id: 'p1', do: 'model', instructions: '{{p2.text}}' }], [{ id: 'p2', do: 'model', instructions: 'x' }]] },
        { id: 'g', do: 'data', op: 'add', collection: 'things', with: { title: 'x' } },
        { id: 'h', do: 'data', op: 'add', collection: 'items', with: { titel: 'x' } },
      ],
    },
  });
  const { errors, warnings } = checkFlow(r);
  const has = (re: RegExp) => assert.ok(errors.some((e) => re.test(e)), `${re}\n${errors.join('\n')}`);
  has(/Step “a” uses \{\{b\.text\}\}, but “b” comes later/);
  has(/no question “nope”/);
  has(/“loopstep” runs once for each round of “loop”/);
  has(/bash cannot run as a step on its own/);
  has(/could not be read/);
  has(/\{\{a\.titel\}\}: “a” gives text/);
  has(/“p2” runs at the same time, in another branch/);
  has(/keeps no collection “things”/);
  has(/no field “titel”/);
  assert.ok(warnings.some((w) => /\{\{e\.text\}\}, which is empty when the decision “d” goes the other way/.test(w)), warnings.join('\n'));
  assert.ok(!errors.some((e) => /index/.test(e)) && !warnings.some((w) => /\{\{index\}\}/.test(w)), 'a round knows its index');
});

test('values: text, tables and lists; one value alone keeps its kind; sections; rules in words', () => {
  const s: Scope = { inputs: { topic: 'vLLM', days: '4' }, steps: { find: { results: [{ title: 'A', price: 3 }, { title: 'B|x', price: 5 }], tags: ['a', 'b'] }, gone: null }, vars: { item: { name: 'Z' }, index: 2 } };
  assert.equal(fillRefs('About {{topic}} ({{inputs.days}} days), {{find.results[1].title}}, last {{find.results[-1].price}}, item {{item.name}} #{{index}}', s), 'About vLLM (4 days), B|x, last 5, item Z #2');
  assert.equal(fillRefs('{{find.results}}', s), '| title | price |\n| --- | --- |\n| A | 3 |\n| B\\|x | 5 |');
  assert.equal(fillRefs('{{find.tags}}', s), '- a\n- b');
  assert.equal(fillRefs('{{#gone.text}}yes{{/gone.text}}{{^gone.text}}none{{/gone.text}} {{nobody.x}}', s), 'none {{nobody.x}}');
  assert.deepEqual(valueOf({ q: '{{find.tags}}', t: 'on {{topic}}', n: 3 }, s), { q: ['a', 'b'], t: 'on vLLM', n: 3 });
  assert.equal(evalRule('{{inputs.days}} > 3 and {{topic}} = vllm', s), true);
  assert.equal(evalRule('{{find.tags}} contains b or {{topic}} is empty', s), true);
  assert.equal(evalRule('{{gone.text}} is not empty', s), false);
  assert.equal(evalRule('"2026-11-03" < "2026-12-01"', s), true);
  assert.equal(evalRule('{{find.tags}}', s), true);
  assert.equal(evalRule('{{topic}} = "vllm" and {{inputs.days}} != 4', s), false);
  assert.ok('error' in readRule('{{a}} >'));
  assert.throws(() => evalRule('', s), /could not be read/);
});

// ---- running ------------------------------------------------------------------------------------------------

test('a flow from the API: a model step, then an agent step that uses its values; each step shown, the answer by name', async () => {
  model.answer = (system) => (system.includes('angle') ? JSON.stringify({ angle: 'Throughput on one GPU', questions: ['How fast?', 'How cheap?'] }) : '{}');
  const a = app({
    name: 'Brief',
    answer: [
      { id: 'brief', label: 'Brief', type: 'markdown', required: true },
      { id: 'angle', label: 'Angle', type: 'text' },
    ],
    flow: {
      steps: [
        { id: 'plan', do: 'model', model: 'fake', instructions: 'Find an angle on {{topic}}', outputs: { angle: 'text', questions: 'list' } },
        { id: 'write', do: 'agent', instructions: 'Write a brief on {{topic}} from the angle {{plan.angle}}. Answer:\n{{plan.questions}}', outputs: [{ id: 'brief', label: 'Brief', type: 'markdown', required: true }] },
      ],
    },
  });
  const { key } = store.createKey(db, a.id, 'Test');
  const pending = http.inject({ method: 'POST', url: `/api/apps/${a.slug}/run`, headers: { authorization: `Bearer ${key}` }, payload: { inputs: { topic: 'vLLM' }, wait: 30 } });
  await sleep(200);
  const runId = store.listRuns(db, { app: a.id, limit: 1 })[0].id;
  const child = await agentAnswers(runId, 'write', { brief: 'vLLM is fast.' }, 'Wrote it.');
  assert.match(sessions.made.find((m) => m.key === child.key)!.o.prompt, /from the angle Throughput on one GPU\. Answer:\n- How fast\?\n- How cheap\?/);
  const body = (await pending).json();
  assert.equal(body.status, 'done', body.error);
  assert.deepEqual(body.result, { brief: 'vLLM is fast.', angle: 'Throughput on one GPU' });
  assert.equal(body.reply, 'Wrote it.');
  assert.equal(body.session, null);
  assert.equal(body.costUsd, 0.001);
  assert.deepEqual(body.steps.map((s: any) => [s.step, s.status]), [['plan', 'done'], ['write', 'done']]);
  assert.ok(sessions.archived.has(child.key!), 'agent steps stay out of the session list');
  assert.equal(child.source, 'step');
  // The run's page: each step with what it gave, the agent step's session, what the model step cost.
  const page = (await http.inject({ method: 'GET', url: `/api/apps/runs/${runId}` })).json();
  assert.equal(page.steps[1].session, child.key);
  assert.equal(page.steps[0].values.angle, 'Throughput on one GPU');
  assert.equal(page.steps[0].costUsd, 0.001);
  assert.match(page.noAsks, /takes no follow-ups/);
  // The template's runs: one, as is its count for the day; its agent step's run is part of it.
  const runs = (await http.inject({ method: 'GET', url: `/api/apps/${a.id}/runs` })).json().runs;
  assert.deepEqual(runs.map((r: any) => r.id), [runId]);
  assert.equal(store.usageSince(db, a.id, 0).runs, 1);
});

test('Decide, Repeat and a step that fails: a rule picks the path, rounds go through a list, a failure goes its own way', async () => {
  model.answer = (_system, user) => {
    const m = /Item (\w+)/.exec(user);
    return m ? JSON.stringify({ line: `Seen ${m[1]}` }) : '{}';
  };
  const a = app({
    name: 'Loops',
    answer: [
      { id: 'lines', label: 'Lines', type: 'table', required: true, columns: [{ id: 'line', label: 'Line', type: 'text' }] },
      { id: 'path', label: 'Path', type: 'text' },
    ],
    flow: {
      steps: [
        { id: 'find', do: 'tool', tool: 'web_search', with: { query: 'about {{topic}}' } },
        { id: 'big', do: 'decide', rule: '{{find.data.results}} is not empty', then: [{ id: 'yes', do: 'model', instructions: 'Say Item yes', outputs: { line: 'text' } }], else: [{ id: 'no', do: 'model', instructions: 'Say Item no', outputs: { line: 'text' } }] },
        { id: 'each', do: 'repeat', over: '{{inputs.names}}', atOnce: 2, steps: [{ id: 'one', do: 'model', instructions: 'Item {{item}} at {{index}}', outputs: { line: 'text' } }] },
        { id: 'read', do: 'tool', tool: 'read_page', with: { url: 'https://broken.example' }, failed: [{ id: 'sorry', do: 'model', instructions: 'Item failed because {{error}}', outputs: { line: 'text' } }] },
        { id: 'maybe', do: 'model', if: '{{topic}} = never', instructions: 'Item never', outputs: { line: 'text' } },
        { id: 'quiet', do: 'tool', tool: 'read_page', with: { url: 'https://broken.example/2' }, failed: 'skip' },
      ],
      outputs: { lines: '{{each.items}}', path: '{{yes.line}}' },
    },
  });
  model.calls = [];
  const r = startRun({ app: a.id, slug: a.slug, recipe: a, source: 'web', inputs: { topic: 'GPUs', names: 'a\nb\nc' } });
  const done = await ended(r.id);
  assert.equal(done.status, 'done', done.error);
  assert.deepEqual(done.result, { lines: [{ line: 'Seen a' }, { line: 'Seen b' }, { line: 'Seen c' }], path: 'Seen yes' });
  assert.deepEqual(stepsOf(r.id).sort(), ['big:done', 'each#1/one:done', 'each#1:done', 'each#2/one:done', 'each#2:done', 'each#3/one:done', 'each#3:done', 'each:done', 'find:done', 'maybe:skipped', 'quiet:failed', 'read:failed', 'sorry:done', 'yes:done'].sort());
  assert.ok(model.calls.some((c) => c.user === 'Item failed because That page could not be read'), 'the failure says why');
  assert.deepEqual(toolCalls.find((t) => t.tool === 'web_search')!.args, { query: 'about GPUs' });
  assert.ok(!model.calls.some((c) => c.user.includes('never')), 'a rule that does not hold skips its step');
});

test('If it fails, an agent tries: it gets what the step was given and why it failed, hands in what the flow uses of it, and the run goes on', async () => {
  model.answer = (_system, user) => (user.startsWith('Sum ') ? JSON.stringify({ line: `Summed: ${user.slice(4)}` }) : '{}');
  const a = app({
    name: 'Rescue',
    answer: [{ id: 'line', label: 'Line', type: 'text', required: true }],
    flow: {
      steps: [
        { id: 'read', do: 'tool', tool: 'read_page', with: { url: 'https://broken.example/{{topic}}' }, failed: 'agent' },
        { id: 'sum', do: 'model', model: 'fake', instructions: 'Sum {{read.text}}', outputs: { line: 'text' } },
      ],
    },
  });
  const r = startRun({ app: a.id, slug: a.slug, recipe: a, source: 'web', inputs: { topic: 'gpus' } });
  const child = await agentAnswers(r.id, 'read', { text: 'GPUs are fast.' }, 'Read it another way.');
  const prompt = sessions.made.find((m) => m.key === child.key)!.o.prompt as string;
  assert.match(prompt, /It calls the tool read_page with:\n.*https:\/\/broken\.example\/gpus/);
  assert.match(prompt, /It failed: That page could not be read/);
  assert.match(prompt, /hand in what it would have given: text\./);
  assert.deepEqual(child.recipe.answer.map((f) => f.id), ['text']);
  const done = await ended(r.id);
  assert.equal(done.status, 'done', done.error);
  assert.equal(done.result!.line, 'Summed: GPUs are fast.');
  const read = flowSteps(r.id).find((st) => st.id === 'read')!;
  assert.deepEqual([read.status, read.rescued, read.error, read.session], ['done', true, 'That page could not be read', child.key]);
  // Only a step that is not an agent's, or a person's, hands its work to an agent.
  assert.match(cleanFlow({ steps: [{ id: 'w', do: 'agent', instructions: 'x', failed: 'agent' }] }).errors.join(), /only a tool, model, code, data or app step can hand its work to an agent/);
  assert.deepEqual(checkFlow({ fields: a.fields, answer: a.answer, flow: a.flow }).warnings, [], 'its values are there all the same');
  // When the agent cannot do it either, the run stops and says both.
  const r2 = startRun({ app: a.id, slug: a.slug, recipe: a, source: 'web', inputs: { topic: 'cpus' } });
  const c2 = await agentAnswers(r2.id, 'read', null, 'I could not read it either.');
  await sleep(2200);
  sessions.end(c2.key!, 'Still nothing.');
  const d2 = await ended(r2.id);
  assert.equal(d2.status, 'failed');
  assert.match(d2.error!, /That page could not be read \(and the agent in its place: it did not hand in text\)/);
});

/** A tool call as a transcript shows it. */
const called = (name: string, input: unknown) => ({ kind: 'tool', id: `t-${Math.random().toString(36).slice(2, 8)}`, seq: 0, tool: { name, category: 'other', title: name, status: 'ok', input } });

test('advice: a step an agent had to do the work of, and an agent step that did the same each time, with the steps that could do it (Firm it up)', async () => {
  const a = app({
    name: 'Summer',
    fields: [{ id: 'url', label: 'Link', type: 'url', required: true }],
    answer: [{ id: 'summary', label: 'Summary', type: 'markdown', required: true }],
    flow: { steps: [{ id: 'sum', do: 'agent', instructions: 'Read the page at {{url}} and sum it up.', outputs: [{ id: 'summary', label: 'Summary', type: 'markdown', required: true }] }] },
  });
  for (const url of ['https://a.example/1', 'https://b.example/2', 'https://c.example/3']) {
    const r = startRun({ app: a.id, slug: a.slug, recipe: a, source: 'web', inputs: { url } });
    let child: store.RunRecord | undefined;
    for (let i = 0; i < 200 && !(child = store.listRuns(db, { parent: r.id }).find((x) => x.key)); i++) await sleep(25);
    sessions.items.set(child!.key!, [called('ToolSearch', { query: 'select:read_page' }), called(url.includes('c.') ? 'WebFetch' : 'mcp__naget-agent__read_page', { url }), called('mcp__naget-agent__submit_result', {})]);
    await agentAnswers(r.id, 'sum', { summary: `About ${url}` });
    assert.equal((await ended(r.id)).status, 'done');
  }
  const advice = (await http.inject({ method: 'GET', url: `/api/apps/${a.id}/advice` })).json();
  assert.deepEqual(advice.rescued, []);
  const f = advice.firm[0];
  assert.equal(advice.firm.length, 1);
  assert.deepEqual([f.step, f.runs, f.calls], ['sum', 3, ['read_page']]);
  assert.deepEqual(
    f.steps.map((x: any) => [x.id, x.do, x.with, x.failed]),
    [
      ['sum_read_page', 'tool', { url: '{{url}}' }, 'agent'],
      ['sum', 'model', undefined, undefined],
    ],
  );
  assert.equal(f.steps[1].instructions, 'Read the page at {{url}} and sum it up.\n\nWhat read_page gave:\n{{sum_read_page.text}}');
  assert.deepEqual(f.steps[1].outputs.map((o: any) => o.id), ['summary']);
  assert.equal(f.inputs.length, 3);
  // In its place, the steps do the work without an agent.
  model.answer = (_system, user) => (user.includes('What read_page gave:\nThe page at https://d.example/4 says hello.') ? JSON.stringify({ summary: 'Short.' }) : '{}');
  const made = sessions.made.length;
  const r = startRun({ app: a.id, slug: a.slug, recipe: cleanRecipe({ ...a, flow: { steps: f.steps } }), source: 'test', inputs: { url: 'https://d.example/4' } });
  const done = await ended(r.id);
  assert.equal(done.status, 'done', done.error);
  assert.equal(done.result!.summary, 'Short.');
  assert.equal(sessions.made.length, made, 'no agent');
  // An agent step that used a tool no step can call (a shell) is left to its agent.
  const b = app({ name: 'Shell', flow: { steps: [{ id: 'look', do: 'agent', instructions: 'Look at {{topic}}.' }] } });
  for (const topic of ['x', 'y', 'z']) {
    const rb = startRun({ app: b.id, slug: b.slug, recipe: b, source: 'web', inputs: { topic } });
    let child: store.RunRecord | undefined;
    for (let i = 0; i < 200 && !(child = store.listRuns(db, { parent: rb.id }).find((x) => x.key)); i++) await sleep(25);
    sessions.items.set(child!.key!, [called('Bash', { command: `ls ${topic}` })]);
    await agentAnswers(rb.id, 'look', null);
    await ended(rb.id);
  }
  assert.deepEqual((await http.inject({ method: 'GET', url: `/api/apps/${b.id}/advice` })).json().firm, []);
  // A step that failed and had an agent do its work, with why.
  const c = app({ name: 'Fragile', flow: { steps: [{ id: 'read', do: 'tool', tool: 'read_page', with: { url: 'https://broken.example' }, failed: 'agent' }] } });
  const rc = startRun({ app: c.id, slug: c.slug, recipe: c, source: 'web', inputs: { topic: 'x' } });
  await agentAnswers(rc.id, 'read', { text: 'Read it.' });
  await ended(rc.id);
  const adv2 = (await http.inject({ method: 'GET', url: `/api/apps/${c.id}/advice` })).json();
  assert.deepEqual(adv2.rescued.map((x: any) => [x.step, x.runs, x.of, x.error, x.run]), [['read', 1, 1, 'That page could not be read', rc.id]]);
  // Trying a change on the examples is not their last try.
  const e = store.saveApp(db, { recipe: cleanRecipe({ ...a, examples: [{ id: 'one', inputs: { url: 'https://d.example/4' }, checks: ['{{answer.summary}} = Short.'] }] }), id: a.id });
  const tried = (await http.inject({ method: 'POST', url: `/api/apps/${e.id}/examples/run`, payload: { recipe: { ...cleanRecipe(e), flow: { steps: f.steps } }, trial: true } })).json();
  const t = await ended(tried.runs[0].run.id);
  assert.equal(t.example, 'trial:one');
  await sleep(50);
  assert.deepEqual(store.getRun(db, t.id)!.checks, [{ rule: '{{answer.summary}} = Short.', ok: true }]);
  assert.equal(store.lastExampleRuns(db, e.id).get('one'), undefined);
});

test('Save as template drafts steps from the tools the session called; steps that do not check out are left out, the task for one agent staying', async () => {
  const key = await sessions.create({});
  sessions.items.set(key, [{ kind: 'user', id: 'u1', seq: 0, text: 'Read https://example.org/solar and sum it up in three lines.' }, called('Bash', { command: 'date' }), called('mcp__naget-agent__read_page', { url: 'https://example.org/solar' })]);
  sessions.end(key, 'Solar roofs last longer than promised.');
  const draft = {
    name: 'Page summary',
    description: 'Sums up a page.',
    icon: 'sparkles',
    color: 'blue',
    fields: [{ id: 'url', label: 'Link', type: 'url', required: true }],
    prompt: 'Read {{url}} and sum it up in three lines.',
    answer: [{ id: 'summary', label: 'Summary', type: 'markdown', required: true }],
    flow: {
      steps: [
        { id: 'read', title: 'Read the page', do: 'tool', tool: 'read_page', with: { url: '{{url}}' } },
        { id: 'sum', title: 'Sum it up', do: 'model', instructions: 'Sum up in three lines:\n{{read.text}}', outputs: { summary: 'long' } },
      ],
    },
  };
  model.calls = [];
  model.answer = () => JSON.stringify(draft);
  const r = (await http.inject({ method: 'POST', url: '/api/apps/draft', payload: { key } })).json();
  const asked = model.calls.at(-1)!;
  assert.match(asked.user, /<calls>\n1\. read_page \{"url":"https:\/\/example\.org\/solar"\}\n<\/calls>\nIt also used: Bash \(1\)\./);
  assert.match(asked.system, /"do": "tool", "tool": one of web_search, read_page/);
  assert.deepEqual(r.recipe.flow.steps.map((x: any) => [x.id, x.do]), [['read', 'tool'], ['sum', 'model']]);
  assert.equal(r.recipe.prompt, 'Read {{url}} and sum it up in three lines.');
  assert.match(r.note, /^Its steps come from the tools the session called/);
  // Steps that do not check out: the task for one agent, and why.
  model.answer = () => JSON.stringify({ ...draft, flow: { steps: [draft.flow.steps[1], { ...draft.flow.steps[1] }] } });
  const r2 = (await http.inject({ method: 'POST', url: '/api/apps/draft', payload: { key } })).json();
  assert.equal(r2.recipe.flow, undefined);
  assert.equal(r2.recipe.prompt, 'Read {{url}} and sum it up in three lines.');
  assert.match(r2.note, /^Its steps could not be drafted \(Two steps are called “sum”/);
  // A session that called no tool a step can: no steps asked for, none kept.
  const plain = await sessions.create({});
  sessions.items.set(plain, [{ kind: 'user', id: 'u2', seq: 0, text: 'Write a haiku about rain.' }]);
  sessions.end(plain, 'Rain on the roof.');
  const r3 = (await http.inject({ method: 'POST', url: '/api/apps/draft', payload: { key: plain } })).json();
  assert.doesNotMatch(model.calls.at(-1)!.system, /"flow"/);
  assert.equal(r3.recipe.flow, undefined);
  assert.equal(r3.note, undefined);
});

test('At the same time, and Repeat until: branches meet after the join; rounds go on until the rule holds, seeing the last round', async () => {
  model.answer = (_system, user) => JSON.stringify({ line: `Re: ${user}` });
  const a = app({
    name: 'Branches',
    answer: [{ id: 'line', label: 'Line', type: 'text', required: true }],
    flow: {
      steps: [
        { id: 'both', do: 'parallel', branches: [[{ id: 'left', do: 'model', instructions: 'L', outputs: { line: 'text' } }], [{ id: 'right', do: 'model', instructions: 'R', outputs: { line: 'text' } }]] },
        { id: 'again', do: 'repeat', until: '{{index}} >= 3', steps: [{ id: 'draft', do: 'model', instructions: 'Draft {{index}} after {{draft.line}}', outputs: { line: 'text' } }] },
        { id: 'join', do: 'model', instructions: '{{left.line}} + {{right.line}} + {{draft.line}} + {{again.count}}', outputs: { line: 'text' } },
      ],
    },
  });
  const r = startRun({ app: a.id, slug: a.slug, recipe: a, source: 'web', inputs: { topic: 'x' } });
  const done = await ended(r.id);
  assert.equal(done.status, 'done', done.error);
  assert.equal(done.result!.line, 'Re: Re: L + Re: R + Re: Draft 3 after Re: Draft 2 after Re: Draft 1 after + 3');
});

test('Keep data: steps add, find, change and remove records; fields are checked; programs reach the data through routes', async () => {
  const a = app({
    name: 'Reading list',
    data: { items: { title: 'text', score: 'number', read: 'yesno' } },
    answer: [{ id: 'count', label: 'Count', type: 'number', required: true }],
    flow: {
      steps: [
        { id: 'save', do: 'data', add: 'items', with: { title: '{{topic}}', score: '7', read: 'no' } },
        { id: 'more', do: 'data', add: 'items', with: { title: 'Second', score: 3 } },
        { id: 'mark', do: 'data', op: 'update', collection: 'items', record: '{{save.id}}', with: { read: true } },
        { id: 'unread', do: 'data', op: 'find', collection: 'items', where: { read: { '!=': true } } },
        { id: 'high', do: 'data', op: 'find', collection: 'items', where: { score: { '>': 5 } }, sort: '-score' },
        { id: 'drop', do: 'data', op: 'remove', collection: 'items', where: { title: 'Second' } },
      ],
      outputs: { count: '{{high.count}}' },
    },
  });
  const r = startRun({ app: a.id, slug: a.slug, recipe: a, source: 'web', inputs: { topic: 'First' } });
  const done = await ended(r.id);
  assert.equal(done.status, 'done', done.error);
  assert.equal(done.result!.count, 1);
  const steps = Object.fromEntries(store.listSteps(db, r.id).map((s) => [s.id, s.outputs]));
  assert.equal((steps.save as any).record.score, 7, 'a number field takes "7" as 7');
  assert.equal((steps.mark as any).records[0].read, true);
  assert.deepEqual((steps.unread as any).records.map((x: any) => x.title), ['Second']);
  assert.equal((steps.drop as any).count, 1);
  // Through the routes: the collections, a record added, found by a where, changed, removed.
  const cols = (await http.inject({ method: 'GET', url: `/api/apps/${a.id}/data` })).json();
  assert.deepEqual(cols.collections.map((c: any) => [c.name, c.count]), [['items', 1]]);
  const added = await http.inject({ method: 'POST', url: `/api/apps/${a.id}/data/items`, payload: { record: { title: 'Third', score: '2.5' } } });
  assert.equal(added.json().record.score, 2.5);
  const bad = await http.inject({ method: 'POST', url: `/api/apps/${a.id}/data/items`, payload: { record: { titel: 'x' } } });
  assert.equal(bad.statusCode, 400);
  assert.match(bad.json().error, /no field titel/);
  const found = (await http.inject({ method: 'GET', url: `/api/apps/${a.id}/data/items?where=${encodeURIComponent(JSON.stringify({ score: { '<': 3 } }))}` })).json();
  assert.deepEqual(found.records.map((x: any) => x.title), ['Third']);
  const id = found.records[0].id;
  const changed = (await http.inject({ method: 'PATCH', url: `/api/apps/${a.id}/data/items/${id}`, payload: { set: { read: 'yes' } } })).json();
  assert.equal(changed.record.read, true);
  assert.equal((await http.inject({ method: 'DELETE', url: `/api/apps/${a.id}/data/items/${id}` })).json().removed, 1);
  assert.equal((await http.inject({ method: 'GET', url: `/api/apps/${a.id}/data/things` })).statusCode, 404);
});

test('the answer: fields its outputs name come from there, the rest by name, from the last step that gave one', async () => {
  const a = app({
    name: 'Half mapped',
    data: { items: { title: 'text' } },
    answer: [
      { id: 'title', label: 'Title', type: 'text', required: true },
      { id: 'count', label: 'Count', type: 'number', required: true },
    ],
    flow: {
      steps: [
        { id: 'save', do: 'data', add: 'items', with: { title: '{{topic}}' } },
        { id: 'all', do: 'data', op: 'find', collection: 'items' },
      ],
      outputs: { title: '{{save.record.title}}' },
    },
  });
  const done = await ended(startRun({ app: a.id, slug: a.slug, recipe: a, source: 'web', inputs: { topic: 'Mapped' } }).id);
  assert.equal(done.status, 'done', done.error);
  assert.deepEqual(done.result, { title: 'Mapped', count: 1 });
});

test('scheduled tasks run a template: its answers set or filled from a webhook call; the task’s run ends with the template’s, and runs again with the same answers', async () => {
  const a = app({
    name: 'Logged',
    data: { items: { title: 'text' } },
    answer: [{ id: 'count', label: 'Count', type: 'number', required: true }],
    flow: { steps: [{ id: 'save', do: 'data', add: 'items', with: { title: '{{topic}}' } }, { id: 'all', do: 'data', op: 'find', collection: 'items' }], outputs: { count: '{{all.count}}' } },
  });
  assert.throws(() => scheduler.save({ name: 'Nope', schedule: { kind: 'daily', time: '09:00' }, app: { id: 'nope', inputs: {} } } as any), /no such template/);
  const t = scheduler.save({ name: 'Log it', schedule: { kind: 'daily', time: '09:00' }, app: { id: a.id, inputs: { topic: 'From the timer', empty: '' } } } as any);
  assert.equal(t.appName, 'Logged');
  assert.deepEqual(t.app, { id: a.id, inputs: { topic: 'From the timer' } });
  const notices: any[] = [];
  sessions.on('notify', (n) => notices.push(n));
  /** The task's newest run, once it has ended. */
  const lastRun = async (taskId: string) => {
    const r = listTaskRuns(db, taskId)[0];
    assert.ok(r?.appRun, 'its run started a template run');
    const run = await ended(r.appRun!);
    assert.equal(run.source, 'task');
    return { task: (await scheduler.waitRun(r.id, 5000))!, run };
  };
  await scheduler.runNow(t.id);
  const first = await lastRun(t.id);
  assert.equal(first.run.inputs.topic, 'From the timer');
  assert.equal(first.task.status, 'done');
  assert.equal(first.task.summary, '1');
  assert.ok(notices.some((n) => n.title === 'Log it' && n.kind === 'done' && n.url === `/apps/runs/${first.run.id}`), 'its notice opens the run');
  // A webhook's call fills its answers.
  const h = scheduler.save({ name: 'Hook', schedule: { kind: 'webhook' }, app: { id: a.id, inputs: { topic: 'Called: {{body.title}}' } } } as any);
  const out = await scheduler.webhook(h.hookPath!.split('/').pop()!, { body: { title: 'a call' }, raw: Buffer.from('{}'), headers: {}, query: {} });
  assert.equal(out.status, 'started');
  const hooked = await lastRun(h.id);
  assert.equal(hooked.run.inputs.topic, 'Called: a call');
  assert.equal(hooked.task.summary, '2');
  // Run again: the answers it had then.
  await scheduler.rerun(first.task.id);
  const again = await lastRun(t.id);
  assert.equal(again.run.inputs.topic, 'From the timer');
  assert.equal(again.task.rerunOf, first.task.id);
  // A run that fails fails its task's run, with why.
  const broken = app({ name: 'Broken', flow: { steps: [{ id: 'x', do: 'data', op: 'get', collection: 'nothing', record: 'r' }] }, data: { other: {} } });
  const b = scheduler.save({ name: 'Breaks', schedule: { kind: 'daily', time: '09:00' }, app: { id: broken.id, inputs: { topic: 'x' } } } as any);
  await scheduler.runNow(b.id);
  const fail = await lastRun(b.id);
  assert.equal(fail.task.status, 'failed');
  assert.ok(fail.task.summary);
  for (const x of [t, h, b]) scheduler.remove(x.id);
});

test('run again from a step: the steps before it give what they gave, the rest run as the template is now (or as the builder sends it)', async () => {
  const flow = (prefix: string) => ({
    steps: [
      { id: 'search', do: 'tool', tool: 'web_search', with: { query: '{{topic}}' } },
      { id: 'keep', do: 'data', op: 'add', collection: 'items', with: { title: `${prefix}{{search.data.results[0].title}}` } },
    ],
    outputs: { note: '{{keep.record.title}}' },
  });
  const a = app({ name: 'Again', data: { items: { title: 'text' } }, answer: [{ id: 'note', label: 'Note', type: 'text', required: true }], flow: flow('') });
  const calls = () => toolCalls.filter((c) => c.tool === 'web_search').length;
  const first = await ended(startRun({ app: a.id, slug: a.slug, recipe: a, source: 'web', inputs: { topic: 'tides' } }).id);
  assert.equal(first.status, 'done', first.error);
  assert.equal(first.result!.note, 'About tides');
  const searched = calls();
  const again = async (body: Record<string, unknown>) => {
    const res = await http.inject({ method: 'POST', url: `/api/apps/runs/${first.id}/again`, payload: body });
    assert.equal(res.statusCode, 200, res.body);
    return ended(res.json().run.id);
  };
  const second = await again({ from: 'keep' });
  assert.equal(second.status, 'done', second.error);
  assert.equal(second.result!.note, 'About tides');
  assert.equal(calls(), searched, 'the search was not run again');
  const views = Object.fromEntries(flowSteps(second.id).map((s) => [s.id, s]));
  assert.equal(views.search.reused, true);
  assert.equal(views.keep.reused, undefined);
  // From the builder: the recipe on screen, tried with the first step as it was.
  const tried = await again({ from: 'keep', recipe: { ...a, flow: flow('Edited: ') } });
  assert.equal(tried.source, 'test');
  assert.equal(tried.result!.note, 'Edited: About tides');
  assert.equal(calls(), searched);
  // From the start: everything runs again.
  await again({});
  assert.equal(calls(), searched + 1);
  const missing = await http.inject({ method: 'POST', url: `/api/apps/runs/${first.id}/again`, payload: { from: 'nope' } });
  assert.equal(missing.statusCode, 400);
});

test('Ask a person: the run waits for the answer (its page, the inbox, a notice), goes on with it, asks the same after a restart, and fails when nobody answers in time', async () => {
  const notices: any[] = [];
  const on = (n: unknown) => notices.push(n);
  sessions.on('notify', on);
  try {
    const a = app({
      name: 'Asks',
      data: { items: { title: 'text' } },
      answer: [{ id: 'note', label: 'Note', type: 'text', required: true }],
      flow: {
        steps: [
          { id: 'ok', do: 'ask', question: 'Keep {{topic}}?' },
          { id: 'how', do: 'ask', question: 'Under what name?', fields: [{ id: 'name', label: 'Name', type: 'text', required: true }], if: '{{ok.yes}}' },
          { id: 'keep', do: 'data', op: 'add', collection: 'items', with: { title: '{{how.name}}' } },
        ],
        outputs: { note: '{{keep.record.title}}' },
      },
    });
    const asked = async (id: string, path: string, question?: string) => {
      for (let i = 0; i < 200; i++) {
        const d = (await http.inject({ method: 'GET', url: `/api/apps/runs/${id}` })).json();
        if (d.question?.step === path && (!question || d.question.question === question)) return d;
        await sleep(25);
      }
      throw new Error(`it never asked at ${path}`);
    };
    const r = startRun({ app: a.id, slug: a.slug, recipe: a, source: 'web', inputs: { topic: 'tides' } });
    const answer = (payload: Record<string, unknown>) => http.inject({ method: 'POST', url: `/api/apps/runs/${r.id}/answer`, payload });
    const d1 = await asked(r.id, 'ok');
    assert.equal(d1.run.status, 'waiting');
    assert.equal(d1.question.question, 'Keep tides?');
    assert.ok(notices.some((n) => n.kind === 'waiting' && n.url === `/apps/runs/${r.id}` && n.body === 'Keep tides?'), 'a notice opens the run');
    assert.ok(apps.inbox!(deps).some((it) => it.id === `app-ask:${r.id}:ok` && it.kind === 'question'), 'the inbox lists it');
    assert.equal((await answer({ values: {} })).statusCode, 400);
    assert.equal((await answer({ step: 'ok', yes: true })).statusCode, 200);
    const d2 = await asked(r.id, 'how');
    assert.deepEqual(d2.question.fields.map((f: any) => f.id), ['name']);
    assert.equal((await answer({ values: {} })).statusCode, 400, 'its form is checked');
    assert.equal((await answer({ values: { name: 'Tide tables' } })).statusCode, 200);
    const done = await ended(r.id);
    assert.equal(done.status, 'done', done.error);
    assert.equal(done.result!.note, 'Tide tables');
    // As the server left another: waiting on its question since almost an hour, its limit.
    const later = store.insertRun(db, { app: a.id, appName: a.name, recipe: { ...a, answer: [], flow: { steps: [{ id: 'ok', do: 'ask', question: 'Changed since?', waitHours: 1 }] } } as any, source: 'api', inputs: { topic: 'x' }, status: 'waiting' });
    store.saveStep(db, { run: later.id, path: 'ok', id: 'ok', kind: 'ask', title: 'Ok', status: 'waiting', outputs: { question: 'Asked before the restart' }, startedAt: Date.now() - 3_600_000 + 1500 });
    const seen = notices.length;
    flowRunner.resume(store.getRun(db, later.id)!);
    await asked(later.id, 'ok', 'Asked before the restart');
    assert.equal(notices.length, seen, 'no second notice for the same question');
    const gaveUp = await ended(later.id);
    assert.equal(gaveUp.status, 'failed');
    assert.match(gaveUp.error ?? '', /Nobody answered in time/);
  } finally {
    sessions.off('notify', on);
  }
});

test('Run code: a program in JavaScript or Python gets its input and returns the step’s values, in a sandbox with no network and none of this computer’s files', async () => {
  const a = app({
    name: 'Coder',
    answer: [{ id: 'total', label: 'Total', type: 'number', required: true }],
    flow: {
      steps: [
        { id: 'js', do: 'code', language: 'javascript', code: "console.log('adding');\nreturn { sum: input.a + input.b, words: input.text.split(' ').length };", with: { a: 2, b: 3, text: 'about {{topic}}' } },
        { id: 'py', do: 'code', language: 'python', code: "print('doubling')\nreturn {'total': input['sum'] * 2}", with: { sum: '{{js.sum}}' } },
      ],
      outputs: { total: '{{py.total}}' },
    },
  });
  const done = await ended(startRun({ app: a.id, slug: a.slug, recipe: a, source: 'web', inputs: { topic: 'two words' } }).id, 60_000);
  assert.equal(done.status, 'done', done.error);
  assert.equal(done.result!.total, 10);
  const outs = Object.fromEntries(store.listSteps(db, done.id).map((s) => [s.id, s.outputs]));
  assert.equal(outs.js!.words, 3);
  assert.match(String(outs.js!.printed), /adding/);
  assert.match(String(outs.py!.printed), /doubling/);
  // The sandbox: no network, no home folder, and a time limit.
  const probe = app({
    name: 'Probe',
    flow: {
      steps: [
        { id: 'net', do: 'code', language: 'javascript', code: "try { await fetch('https://example.com', { signal: AbortSignal.timeout(4000) }); return { net: 'yes' }; } catch { return { net: 'no' }; }" },
        { id: 'home', do: 'code', language: 'python', code: `import os\nreturn {'home': os.path.exists(${JSON.stringify(os.homedir())})}` },
        { id: 'slow', do: 'code', language: 'javascript', code: 'while (true) {}', seconds: 2, failed: 'skip' },
      ],
    },
  });
  const pr = await ended(startRun({ app: probe.id, slug: probe.slug, recipe: probe, source: 'web', inputs: { topic: 'x' } }).id, 60_000);
  const ps = Object.fromEntries(store.listSteps(db, pr.id).map((s) => [s.id, s]));
  assert.equal(ps.net.outputs!.net, 'no');
  assert.equal(ps.home.outputs!.home, false);
  assert.equal(ps.slow.status, 'failed');
  assert.match(ps.slow.error ?? '', /past its 2 seconds/);
});

test('examples: saved inputs with checks; trying them runs each as a test, and its checks are read against what it gave', async () => {
  const a = app({
    name: 'Counted',
    data: { items: { title: 'text' } },
    answer: [{ id: 'count', label: 'Count', type: 'number', required: true }],
    flow: { steps: [{ id: 'save', do: 'data', add: 'items', with: { title: '{{topic}}' } }, { id: 'all', do: 'data', op: 'find', collection: 'items' }], outputs: { count: '{{all.count}}' } },
    examples: [
      { name: 'One', inputs: { topic: 'first' }, checks: ['{{answer.count}} > 0', '{{save.record.title}} = first'] },
      { name: 'Wrong', inputs: { topic: 'second' }, checks: ['{{answer.count}} > 99'] },
    ],
  });
  assert.deepEqual(a.examples!.map((e) => e.id), ['one', 'wrong']);
  const bad = (await http.inject({ method: 'POST', url: '/api/apps/check', payload: { recipe: { ...a, examples: [{ inputs: {}, checks: ['{{x}} >'] }] } } })).json();
  assert.ok(bad.errors.some((e: string) => /its check/.test(e)), bad.errors.join('\n'));
  const res = await http.inject({ method: 'POST', url: `/api/apps/${a.id}/examples/run`, payload: {} });
  assert.equal(res.statusCode, 200, res.body);
  const runs = res.json().runs;
  assert.deepEqual(runs.map((x: any) => x.example), ['one', 'wrong']);
  for (const x of runs) await ended(x.run.id);
  await sleep(50);
  const list = (await http.inject({ method: 'GET', url: `/api/apps/${a.id}/examples` })).json().examples;
  const one = list.find((e: any) => e.id === 'one');
  assert.equal(one.last.status, 'done');
  assert.deepEqual(one.last.checks.map((c: any) => c.ok), [true, true]);
  const wrong = list.find((e: any) => e.id === 'wrong');
  assert.equal(wrong.last.checks[0].ok, false);
  assert.match(wrong.last.checks[0].why, /answer\.count is \d/);
  // The builder's recipe, not saved yet, and only the example named.
  const tried = (await http.inject({ method: 'POST', url: `/api/apps/${a.id}/examples/run`, payload: { recipe: { ...a, examples: [{ id: 'one', inputs: { topic: 'x' }, checks: ['{{answer.count}} > 0'] }, { id: 'two', inputs: { topic: 'y' } }] }, only: ['one'] } })).json().runs;
  assert.equal(tried.length, 1);
  assert.equal(tried[0].run.source, 'test');
  assert.equal((await ended(tried[0].run.id)).status, 'done');
});

test('the builder’s tools: app_save makes and changes a template (whole, a patch, one step), checked first; app_get reads it; app_try runs its examples and waits; app_screen gives it a screen', async () => {
  const ctx: RunCtx = { runId: 'builder-1', key: 'acp:builder-1', agent: 'acp', cwd: os.tmpdir(), deps };
  const tools = Object.fromEntries(apps.tools!(ctx).map((t) => [t.name, t]));
  assert.ok(tools.app_save && tools.app_get && tools.app_try && tools.app_screen && tools.app_data);
  assert.ok(!tools.submit_result, 'a session that is not a run hands in nothing');
  const text = (out: unknown) => (typeof out === 'string' ? out : (out as { text: string }).text);
  const bad = (await tools.app_save.run({ recipe: { name: 'Broken', flow: { steps: [{ id: 'x', do: 'tool', tool: 'bash' }] } } }, ctx)) as { text: string; isError?: boolean };
  assert.equal(bad.isError, true);
  assert.match(bad.text, /Not saved[\s\S]*bash cannot run as a step/);
  const made = text(
    await tools.app_save.run(
      {
        recipe: {
          name: 'Built',
          fields: [{ id: 'topic', label: 'Topic', type: 'text', required: true }],
          data: { items: { title: 'text' } },
          answer: [{ id: 'title', label: 'Title', type: 'text', required: true }],
          flow: { steps: [{ id: 'save', do: 'data', add: 'items', with: { title: '{{topic}}' } }], outputs: { title: '{{save.record.title}}' } },
          examples: [{ name: 'First', inputs: { topic: 'alpha' }, checks: ['{{answer.title}} = alpha'] }],
        },
        why: 'A first version',
      },
      ctx,
    ),
  );
  const id = /\(id ([a-z0-9]+)/.exec(made)![1];
  assert.match(made, /Made “Built”/);
  const got = JSON.parse(text(await tools.app_get.run({ app: id }, ctx)));
  assert.equal(got.recipe.flow.steps.length, 1);
  assert.ok(JSON.parse(text(await tools.app_get.run({}, ctx))).templates.some((t: any) => t.id === id));
  // One step added after another, then a patch: a new answer field and where it comes from.
  text(await tools.app_save.run({ app: id, step: { id: 'count', do: 'data', op: 'find', collection: 'items', after: 'save' } }, ctx));
  const patched = text(await tools.app_save.run({ app: id, patch: { name: 'Built and counted', answer: [{ id: 'title', label: 'Title', type: 'text', required: true }, { id: 'count', label: 'Count', type: 'number' }], flow: { outputs: { count: '{{count.count}}' } } } }, ctx));
  assert.match(patched, /Saved “Built and counted”.*2 steps/);
  const saved = store.getApp(db, id)!;
  assert.deepEqual(saved.flow!.steps.map((s) => s.id), ['save', 'count']);
  assert.deepEqual(saved.flow!.outputs, { title: '{{save.record.title}}', count: '{{count.count}}' });
  // Its examples, tried and waited for; then one set of answers.
  const tried = JSON.parse(text(await tools.app_try.run({ app: id, examples: true, wait: 60 }, ctx)));
  assert.equal(tried.runs[0].status, 'done');
  assert.deepEqual(tried.runs[0].checks, [{ rule: '{{answer.title}} = alpha', ok: true }]);
  assert.deepEqual(tried.runs[0].steps.map((s: any) => s.step), ['save', 'count']);
  const once = JSON.parse(text(await tools.app_try.run({ app: id, inputs: { topic: 'beta' }, wait: 60 }, ctx)));
  assert.equal(once.runs[0].status, 'done');
  assert.ok(once.runs[0].result.count >= 2);
  assert.match(text(await tools.app_screen.run({ app: id }, ctx)), /the screen “main”, made from its parts/);
  assert.ok(store.getApp(db, id)!.screens?.main);
  // Its records: its lists, what its runs kept, one added; changing or removing them is not the builder's.
  assert.deepEqual(JSON.parse(text(await tools.app_data.run({ app: id, op: 'lists' }, ctx))).lists.map((l: any) => [l.name, l.count]), [['items', 2]]);
  assert.deepEqual(JSON.parse(text(await tools.app_data.run({ app: id, op: 'find', collection: 'items', sort: 'title' }, ctx))).records.map((r: any) => r.title), ['alpha', 'beta']);
  const added = JSON.parse(text(await tools.app_data.run({ app: id, op: 'add', collection: 'items', record: { title: 'gamma' } }, ctx)));
  assert.equal(added.record.title, 'gamma');
  assert.equal(findRecords(db, id, store.getApp(db, id)!.data, 'items').count, 3);
  assert.match(text(await tools.app_data.run({ app: id, op: 'remove', collection: 'items', where: {} }, ctx)), /op is find, search, get, add/);
  assert.match(text(await tools.app_data.run({ app: id, op: 'find', collection: 'nothing' }, ctx)), /keeps no list “nothing”: its lists are items/);
  // A step another one names, removed: saved, with a warning.
  const removed = text(await tools.app_save.run({ app: id, step: { id: 'count', remove: true } }, ctx));
  assert.match(removed, /To look at:[\s\S]*count/);
  assert.ok(store.getApp(db, id)!.screens?.main, 'its screen stays');
});

test('the user’s changes reach the agent that built a template: told once with its next message, and its next app_save reads them first', async () => {
  const ctx: RunCtx = { runId: 'builder-2', key: 'acp:builder-2', agent: 'acp', cwd: os.tmpdir(), deps };
  const tools = Object.fromEntries(apps.tools!(ctx).map((t) => [t.name, t]));
  const text = (out: unknown) => (typeof out === 'string' ? out : (out as { text: string }).text);
  const made = text(await tools.app_save.run({ recipe: { name: 'Shared', prompt: 'Plan {{topic}}', fields: [{ id: 'topic', label: 'Topic', type: 'text', required: true }] } }, ctx));
  const id = /\(id ([a-z0-9]+)/.exec(made)![1];
  await sleep(5);
  // The user changes it in its editor (the page, not an agent through the API).
  const app = store.getApp(db, id)!;
  const put = await http.inject({ method: 'PUT', url: `/api/apps/${id}`, payload: { recipe: { ...app, name: 'Shared by two', fields: [...app.fields, { id: 'budget', label: 'Budget', type: 'number' }] } } });
  assert.equal(put.statusCode, 200, put.body);
  const told = await apps.beforeMessage!('acp:builder-2', deps);
  assert.match(String(told), /changed a template you built/);
  assert.match(String(told), /Its name: “Shared” → “Shared by two”/);
  assert.match(String(told), /The form: added “Budget” \(budget\)/);
  assert.equal(await apps.beforeMessage!('acp:builder-2', deps), null, 'told once');
  assert.equal(await apps.beforeMessage!('acp:someone-else', deps), null, 'only the agents that built it');
  // Its next save reads their version first, unless it means to write over it.
  const refused = (await tools.app_save.run({ app: id, patch: { description: 'Mine' } }, ctx)) as { text: string; isError?: boolean };
  assert.equal(refused.isError, true);
  assert.match(refused.text, /changed “Shared by two” in its editor since you last saved or read it/);
  await tools.app_get.run({ app: id }, ctx);
  assert.match(text(await tools.app_save.run({ app: id, patch: { description: 'Mine' } }, ctx)), /Saved “Shared by two”/);
  assert.equal(store.getApp(db, id)!.fields.length, 2, 'their field stays');
  await sleep(5);
  const again = store.getApp(db, id)!;
  await http.inject({ method: 'PUT', url: `/api/apps/${id}`, payload: { recipe: { ...again, name: 'Theirs' } } });
  assert.match(text(await tools.app_save.run({ app: id, patch: { name: 'Mine after all' }, force: true }, ctx)), /Saved “Mine after all”/);
  assert.equal(await apps.beforeMessage!('acp:builder-2', deps), null, 'written over on purpose: nothing to tell');
});

test('notify_user: a step tells you something now, and its notice opens the run', async () => {
  const notices: any[] = [];
  const on = (n: unknown) => notices.push(n);
  sessions.on('notify', on);
  const a = app({ name: 'Notifier', flow: { steps: [{ id: 'tell', do: 'tool', tool: 'notify_user', with: { message: 'Found {{topic}}' } }] } });
  const done = await ended(startRun({ app: a.id, slug: a.slug, recipe: a, source: 'web', inputs: { topic: 'it' } }).id);
  sessions.off('notify', on);
  assert.equal(done.status, 'done', done.error);
  const n = notices.find((x) => x.body === 'Found it');
  assert.ok(n, 'a notice went out');
  assert.equal(n.title, 'Notifier');
  assert.equal(n.url, `/apps/runs/${done.id}`);
});

test('app_data: the agents of a template that keeps data find and add its records; a public run gets no such tool', async () => {
  const a = app({ name: 'Keeper', prompt: 'Keep {{topic}}', data: { notes: {} }, answer: [] });
  const r = startRun({ app: a.id, slug: a.slug, recipe: a, source: 'web', inputs: { topic: 'this' } });
  await sleep(100);
  const key = store.getRun(db, r.id)!.key!;
  const mark = sessions.made.find((m) => m.key === key)!.o.extra.app;
  const add = await apps.spawn!({ agent: 'claude', key, cwd: tmp, runId: 'agent-data-1', resume: false, extra: { app: mark } }, deps);
  assert.match(add!.instructions![0], /keeps data between its runs.*notes \(any fields\)/);
  const ctx: RunCtx = { runId: 'agent-data-1', key, agent: 'claude', cwd: tmp, deps };
  const tool = apps.tools!(ctx).find((t) => t.name === 'app_data')!;
  assert.ok(tool, 'the app_data tool');
  const made = JSON.parse(String(await tool.run({ op: 'add', collection: 'notes', record: { text: 'Remember the milk', tags: ['home'] } }, ctx)));
  assert.equal(made.record.text, 'Remember the milk');
  const found = JSON.parse(String(await tool.run({ op: 'find', collection: 'notes', search: 'milk' }, ctx)));
  assert.equal(found.count, 1);
  const err = await tool.run({ op: 'find', collection: 'nope' }, ctx);
  assert.ok(typeof err === 'object' && err.isError);
  assert.equal(apps.allowTool!('app_data', ctx), true);
  sessions.end(key, 'Kept.');
  await ended(r.id);
  assert.equal(findRecords(db, a.id, a.data, 'notes').count, 1);
});

test('another template as a step: its form filled from values, its answer the step’s values; apps calling apps stop three deep', async () => {
  const inner = app({ name: 'Verdict', prompt: 'Judge {{topic}}', answer: [{ id: 'verdict', label: 'Verdict', type: 'text', required: true }] });
  const outer = app({
    name: 'Asks another',
    answer: [{ id: 'verdict', label: 'Verdict', type: 'text', required: true }],
    flow: { steps: [{ id: 'judge', do: 'app', app: inner.slug, with: { topic: 'the {{topic}}' } }] },
  });
  const r = startRun({ app: outer.id, slug: outer.slug, recipe: outer, source: 'web', inputs: { topic: 'plan' } });
  const child = await agentAnswers(r.id, 'judge', { verdict: 'Good' }, 'It is good.');
  assert.equal(child.app, inner.id);
  assert.equal(child.source, 'app');
  assert.equal(child.inputs.topic, 'the plan');
  const done = await ended(r.id);
  assert.equal(done.status, 'done', done.error);
  assert.equal(done.result!.verdict, 'Good');
  // A template that calls itself: three levels, then no further.
  const loop = app({ name: 'Ouroboros', answer: [], flow: { steps: [{ id: 'again', do: 'app', app: 'ouroboros', with: { topic: '{{topic}}' } }] } });
  assert.equal(loop.slug, 'ouroboros');
  const deep = await ended(startRun({ app: loop.id, slug: loop.slug, recipe: loop, source: 'web', inputs: { topic: 'x' } }).id);
  assert.equal(deep.status, 'failed');
  assert.match(deep.error!, /too deep/);
});

test('stopping a flow stops the agent at work, and the run ends as stopped', async () => {
  const a = app({ name: 'Stoppable', answer: [], flow: { steps: [{ id: 'long', do: 'agent', instructions: 'Work long on {{topic}}' }, { id: 'after', do: 'model', instructions: 'never' }] } });
  const r = startRun({ app: a.id, slug: a.slug, recipe: a, source: 'web', inputs: { topic: 'x' } });
  let child: store.RunRecord | undefined;
  for (let i = 0; i < 200 && !(child = store.listRuns(db, { parent: r.id })[0])?.key; i++) await sleep(25);
  await stopRun(r.id);
  const done = await ended(r.id);
  assert.equal(done.status, 'stopped');
  assert.ok(sessions.interrupted.includes(child!.key!), 'its agent was interrupted');
  assert.ok(!store.getStep(db, r.id, 'after'), 'nothing after it ran');
});

test('after a restart a flow carries on: the steps that ended stand, the rest runs', async () => {
  const a = app({ name: 'Resumed', answer: [{ id: 'line', label: 'Line', type: 'text', required: true }], flow: { steps: [{ id: 'first', do: 'model', instructions: 'First', outputs: { line: 'text' } }, { id: 'second', do: 'model', instructions: 'Second after {{first.line}}', outputs: { line: 'text' } }] } });
  // As the server left it: running, its first step done.
  const r = store.insertRun(db, { app: a.id, appName: a.name, recipe: a, source: 'api', inputs: { topic: 'x' }, status: 'running' });
  store.saveStep(db, { run: r.id, path: 'first', id: 'first', kind: 'model', title: 'First', status: 'done', outputs: { line: 'kept from before' }, startedAt: 1, endedAt: 2 });
  model.calls = [];
  model.answer = (_system, user) => JSON.stringify({ line: `Re: ${user}` });
  flowRunner.resume(store.getRun(db, r.id)!);
  const done = await ended(r.id);
  assert.equal(done.status, 'done', done.error);
  assert.equal(done.result!.line, 'Re: Second after kept from before');
  assert.deepEqual(model.calls.map((c) => c.user), ['Second after kept from before'], 'the first step did not run again');
});

test('a public page’s flow: its agent steps run in Custom with the page’s model, and the data stays out of its reach', async () => {
  const a = app({ name: 'Public flow', answer: [], data: { secrets: {} }, flow: { steps: [{ id: 'think', do: 'agent', instructions: 'Think about {{topic}}' }, { id: 'peek', do: 'data', op: 'find', collection: 'secrets' }] } });
  const r = startRun({ app: a.id, slug: a.slug, recipe: a, source: 'public', inputs: { topic: 'x' }, public: { model: 'fake', web: false, capUsd: 0.5 } });
  const child = await agentAnswers(r.id, 'think', null, 'Thought.');
  const o = sessions.made.find((m) => m.key === child.key)!.o;
  assert.deepEqual([o.agent, o.acpAgent, o.model, o.mode, o.extra.memory, o.extra.capUsd], ['acp', 'console', 'fake', 'ask', false, 0.5]);
  const done = await ended(r.id);
  assert.equal(done.status, 'failed');
  assert.match(done.error!, /cannot use the data/);
});

// ---- memory -------------------------------------------------------------------------------------------------

test('a template that remembers: its runs share a project memory of its own; turned off, they no longer do', async () => {
  const a = app({ name: 'Rememberer', prompt: 'Do {{topic}}', answer: [], memory: true });
  const r = startRun({ app: a.id, slug: a.slug, recipe: a, source: 'web', inputs: { topic: 'x' } });
  await sleep(100);
  const home = path.join(WORK_DIR, a.slug);
  assert.ok(fs.existsSync(path.join(home, MEMORY_MARK)), 'its folder is marked');
  const folder = runFolder(store.getRun(db, r.id)!, a.slug);
  assert.equal(repoRoot(folder), home, 'memory files its notes under the template, not the run');
  const key = store.getRun(db, r.id)!.key!;
  const mark = sessions.made.find((m) => m.key === key)!.o.extra.app;
  const add = await apps.spawn!({ agent: 'claude', key, cwd: folder, runId: 'agent-mem-1', resume: false, extra: { app: mark } }, deps);
  assert.match(add!.instructions![0], /remembers across its runs/);
  sessions.end(key, 'Done.');
  await ended(r.id);
  const off = store.saveApp(db, { id: a.id, recipe: cleanRecipe({ ...a, memory: false }) });
  const r2 = startRun({ app: off.id, slug: off.slug, recipe: off, source: 'web', inputs: { topic: 'y' } });
  await sleep(100);
  assert.ok(!fs.existsSync(path.join(home, MEMORY_MARK)), 'the mark is gone');
  sessions.end(store.getRun(db, r2.id)!.key!, 'Done.');
  await ended(r2.id);
});

// ---- as a file ----------------------------------------------------------------------------------------------

test('a template as a file: .naget-app and .json round trips with its records; installing says what changes; what cannot work stops it', async () => {
  const a = app({
    name: 'Shared list',
    cwd: tmp,
    mode: 'bypassPermissions',
    assistant: 'nobody-here',
    memory: true,
    data: { items: { title: 'text', score: 'number' } },
    answer: [{ id: 'count', label: 'Count', type: 'number', required: true }],
    flow: { steps: [{ id: 'all', do: 'data', op: 'find', collection: 'items' }], outputs: { count: '{{all.count}}' } },
  });
  await http.inject({ method: 'POST', url: `/api/apps/${a.id}/data/items`, payload: { record: { id: 'r1', title: 'One', score: 1 } } });
  await http.inject({ method: 'POST', url: `/api/apps/${a.id}/data/items`, payload: { record: { id: 'r2', title: 'Two', score: 2 } } });
  const zip = await http.inject({ method: 'GET', url: `/api/apps/${a.id}/export?data=1` });
  assert.equal(zip.headers['content-type'], 'application/zip');
  assert.match(String(zip.headers['content-disposition']), /shared-list\.naget-app/);
  const file = { name: 'shared-list.naget-app', data: zip.rawPayload.toString('base64') };
  const check = await http.inject({ method: 'POST', url: '/api/apps/install/check', payload: { file } });
  const p = check.json().preview;
  assert.deepEqual([p.name, p.steps, p.memory, p.data], ['Shared list', 1, true, [{ name: 'items', records: 2 }]]);
  assert.ok(p.notes.some((n: string) => /every step allowed \(bypassPermissions\)/.test(n)), p.notes.join('\n'));
  assert.ok(p.notes.some((n: string) => /assistant “nobody-here”, which is not here/.test(n)));
  assert.ok(p.notes.some((n: string) => /installs beside it/.test(n)));
  const got = (await http.inject({ method: 'POST', url: '/api/apps/install', payload: { file } })).json();
  assert.equal(got.records, 2);
  const b = store.getApp(db, got.app.id)!;
  assert.notEqual(b.slug, a.slug);
  assert.deepEqual([b.cwd, b.mode, b.assistant, b.memory, b.public.on], [undefined, undefined, undefined, true, false]);
  assert.deepEqual(findRecords(db, b.id, b.data, 'items').records.map((x) => [x.id, x.title]), [['r1', 'One'], ['r2', 'Two']]);
  const ran = await ended(startRun({ app: b.id, slug: b.slug, recipe: b, source: 'web', inputs: { topic: 'x' } }).id);
  assert.equal(ran.result!.count, 2);
  // As .json, without records; a bare recipe installs too.
  const json = (await http.inject({ method: 'GET', url: `/api/apps/${a.id}/export?as=json` })).json();
  assert.equal(json.naget, 'app');
  assert.equal(json.records, undefined);
  assert.equal(json.app.cwd, undefined);
  const bare = (await http.inject({ method: 'POST', url: '/api/apps/install', payload: { package: { name: 'Bare', prompt: 'Do {{x}}', fields: [{ id: 'x', label: 'X' }], cwd: '/somewhere/else' } } })).json();
  assert.equal(bare.app.name, 'Bare');
  assert.equal(bare.app.cwd, undefined);
  assert.ok(bare.notes.some((n: string) => /worked in the folder \/somewhere\/else/.test(n)), 'a folder from elsewhere is left out, and said so');
  // A zip written here reads back; what is not a template, is newer, or cannot run is refused in words.
  const back = await http.inject({ method: 'POST', url: '/api/apps/install/check', payload: { file: { name: 'x.zip', data: zipPackage(packageOf(db, a, false)).toString('base64') } } });
  assert.equal(back.statusCode, 200);
  const junk = await http.inject({ method: 'POST', url: '/api/apps/install', payload: { file: { name: 'x.json', data: Buffer.from('hello').toString('base64') } } });
  assert.equal(junk.statusCode, 400);
  assert.match(junk.json().error, /neither a template/);
  const newer = await http.inject({ method: 'POST', url: '/api/apps/install', payload: { package: { naget: 'app', format: 99, app: { name: 'N', prompt: 'x' } } } });
  assert.match(newer.json().error, /newer Naget Agent/);
  const broken = await http.inject({ method: 'POST', url: '/api/apps/install', payload: { package: { naget: 'app', format: 1, app: { name: 'B', flow: { steps: [{ id: 'a', do: 'model', instructions: '{{b.text}}' }, { id: 'b', do: 'model', instructions: 'x' }] } } } } });
  assert.equal(broken.statusCode, 400);
  assert.match(broken.json().error, /comes later/);
});

test('what a template needs: packages by name and version only, installed in a folder of its own before its runs; its agents get them first on PATH', async () => {
  const bad = cleanRequires({ node: { lodash: 'git+https://example.com/x.git', '-x': '1' }, python: ['pandas>=2', '--index-url http://evil.example', 'x @ https://example.com/x.whl'], commands: ['ffmpeg', 'rm -rf'] });
  assert.equal(bad.errors.length, 5, bad.errors.join('\n'));
  assert.deepEqual(bad.requires, { python: ['pandas>=2'], commands: ['ffmpeg'] });
  assert.deepEqual(cleanRequires({ node: ['cheerio'], python: ['requests[socks]', 'numpy>=1.26,<3'], pythonVersion: '3.12' }).requires, { node: { cheerio: 'latest' }, python: ['requests[socks]', 'numpy>=1.26,<3'], pythonVersion: '3.12' });
  const ran: string[][] = [];
  let failing = false;
  envTesting.run = async (cmd, args) => {
    ran.push([cmd, ...args]);
    await sleep(150);
    return failing && cmd === 'uv' && args[0] === 'pip' ? { code: 1, out: 'No solution found: pandas>=99' } : { code: 0, out: 'ok' };
  };
  try {
    const a = app({ name: 'Needy', prompt: 'Do {{topic}}', answer: [], requires: { node: { cheerio: '^1.0.0' }, python: ['pandas>=2'], commands: ['surely-not-a-command-here'] } });
    assert.deepEqual(envOf(a, a.slug).missing, ['surely-not-a-command-here']);
    const r = startRun({ app: a.id, slug: a.slug, recipe: a, source: 'web', inputs: { topic: 'x' } });
    await sleep(60);
    assert.equal(store.getRun(db, r.id)!.key, undefined, 'the run waits while its packages install');
    assert.equal(envOf(a, a.slug).state, 'installing');
    let key: string | undefined;
    for (let i = 0; i < 200 && !(key = store.getRun(db, r.id)!.key); i++) await sleep(25);
    assert.ok(key, 'then it starts');
    const dir = envDir(a.slug);
    assert.deepEqual(ran.map((x) => x.slice(0, 3).join(' ')), ['npm install --ignore-scripts', 'uv venv --allow-existing', 'uv pip install']);
    assert.deepEqual(ran[2].slice(-3), ['--python', path.join(dir, '.venv', 'bin', 'python'), 'pandas>=2']);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).dependencies.cheerio, '^1.0.0');
    assert.equal(envOf(a, a.slug).state, 'ready');
    const mark = sessions.made.find((m) => m.key === key)!.o.extra.app;
    const add = await apps.spawn!({ agent: 'claude', key: key!, cwd: tmp, runId: 'agent-env-1', resume: false, extra: { app: mark } }, deps);
    assert.ok(add!.env!.PATH.startsWith(`${path.join(dir, '.venv', 'bin')}${path.delimiter}${path.join(dir, 'node_modules', '.bin')}${path.delimiter}`));
    assert.equal(add!.env!.VIRTUAL_ENV, path.join(dir, '.venv'));
    assert.match(add!.instructions![0], /packages are installed for you/);
    sessions.end(key!, 'Done.');
    await ended(r.id);
    // Ready stays ready; new needs install again, and one that cannot install fails the run, saying why.
    ran.length = 0;
    const r2 = startRun({ app: a.id, slug: a.slug, recipe: a, source: 'web', inputs: { topic: 'y' } });
    for (let i = 0; i < 100 && !store.getRun(db, r2.id)!.key; i++) await sleep(20);
    assert.equal(ran.length, 0, 'nothing installs twice');
    sessions.end(store.getRun(db, r2.id)!.key!, 'Done.');
    await ended(r2.id);
    failing = true;
    const changed = (await http.inject({ method: 'PUT', url: `/api/apps/${a.id}`, payload: { recipe: { ...a, requires: { python: ['pandas>=99'] } } } })).json().app;
    const r3 = await ended(startRun({ app: changed.id, slug: changed.slug, recipe: changed, source: 'web', inputs: { topic: 'z' } }).id);
    assert.equal(r3.status, 'failed');
    assert.match(r3.error!, /What it needs could not be installed: Installing its Python packages failed/);
    const env = (await http.inject({ method: 'GET', url: `/api/apps/${a.id}/env` })).json().env;
    assert.equal(env.state, 'failed');
    assert.match(env.log, /No solution found/);
  } finally {
    envTesting.run = null;
  }
});

test('a template with the templates it calls: they come in its file, install first (or the same one you have is used), and its steps call them where they landed', async () => {
  const helper = app({ name: 'Helper step', prompt: 'Help with {{topic}}', answer: [{ id: 'v', label: 'V', type: 'text' }] });
  const main = app({ name: 'Uses helper', answer: [], flow: { steps: [{ id: 'h', do: 'app', app: helper.slug, with: { topic: '{{topic}}' } }] } });
  const pkg = packageOf(db, main, false);
  assert.deepEqual(pkg.apps!.map((x) => x.slug), [helper.slug]);
  // The same one is here: used again.
  const same = (await http.inject({ method: 'POST', url: '/api/apps/install', payload: { package: pkg } })).json();
  assert.deepEqual(same.bundled, [{ name: 'Helper step', slug: helper.slug, reused: true }]);
  assert.equal((store.getApp(db, same.app.id)!.flow!.steps[0] as any).app, helper.slug);
  // Yours changed since: the one in the file installs beside it, and the new template's step calls that one.
  store.saveApp(db, { id: helper.id, recipe: cleanRecipe({ ...helper, prompt: 'Changed {{topic}}' }) });
  const file = { name: 'uses-helper.naget-app', data: zipPackage(pkg).toString('base64') };
  const p = (await http.inject({ method: 'POST', url: '/api/apps/install/check', payload: { file } })).json().preview;
  assert.deepEqual(p.bundled, [{ name: 'Helper step', from: helper.slug, installs: 'new' }]);
  const beside = (await http.inject({ method: 'POST', url: '/api/apps/install', payload: { file } })).json();
  assert.equal(beside.bundled[0].reused, false);
  assert.notEqual(beside.bundled[0].slug, helper.slug);
  assert.equal((store.getApp(db, beside.app.id)!.flow!.steps[0] as any).app, beside.bundled[0].slug);
  assert.match(store.getApp(db, beside.bundled[0].slug)!.prompt, /^Help with/);
});

test('the models a template asks for: said portably in its file, found here by provider and name, or one picked to stand in; a run names a missing one', async () => {
  const a = app({ name: 'Model user', answer: [], flow: { steps: [{ id: 'think', do: 'model', model: 'fake', instructions: 'Hi' }] } });
  const pkg = packageOf(db, a, false);
  assert.deepEqual((pkg.app as any).requires.models, [{ as: 'fake', agent: 'custom', provider: 'endpoint', model: 'fake-1', label: 'Fake' }]);
  // From another computer: the same model under its own name there, one this computer lacks, and Claude Code's.
  const theirs = {
    naget: 'app',
    format: 1,
    app: {
      name: 'Their models',
      agent: 'claude',
      model: 'opus',
      answer: [],
      requires: { models: [{ as: 'their-fake', agent: 'custom', provider: 'endpoint', model: 'fake-1' }, { as: 'big-one', agent: 'custom', provider: 'openrouter', model: 'example/big-1' }] },
      flow: { steps: [{ id: 'one', do: 'model', model: 'their-fake', instructions: 'x' }, { id: 'two', do: 'model', model: 'big-one', instructions: 'y' }, { id: 'three', do: 'agent', instructions: 'z' }] },
    },
  };
  const p = (await http.inject({ method: 'POST', url: '/api/apps/install/check', payload: { package: theirs } })).json().preview;
  const by = Object.fromEntries(p.models.map((m: any) => [`${m.agent}:${m.as}`, m]));
  assert.deepEqual([by['custom:their-fake'].status, by['custom:their-fake'].use], ['matched', 'fake']);
  assert.equal(by['custom:big-one'].status, 'missing');
  assert.deepEqual(by['custom:big-one'].options.map((o: any) => o.value), ['fake']);
  assert.equal(by['claude:opus'].status, 'missing', 'this stand-in has no catalog for Claude Code');
  assert.ok(p.warnings.some((w: string) => /example\/big-1 \(OpenRouter\), which is not set up here/.test(w)), p.warnings.join('\n'));
  const got = (await http.inject({ method: 'POST', url: '/api/apps/install', payload: { package: theirs, models: { 'custom:big-one': 'fake', 'claude:opus': '' } } })).json();
  const b = store.getApp(db, got.app.id)!;
  assert.deepEqual(b.flow!.steps.map((s: any) => s.model), ['fake', 'fake', undefined]);
  assert.equal(b.model, undefined, 'Claude Code with its default model');
  assert.equal(b.requires, undefined, 'its steps name this computer\'s models now');
  // A step asking for a model this computer lacks says so.
  const lost = app({ name: 'Lost model', answer: [], flow: { steps: [{ id: 'q', do: 'model', model: 'nowhere', instructions: 'x' }] } });
  const r = await ended(startRun({ app: lost.id, slug: lost.slug, recipe: lost, source: 'web', inputs: { topic: 'x' } }).id);
  assert.equal(r.status, 'failed');
  assert.match(r.error!, /model “nowhere”, which is not set up here/);
});

/** A stand-in for the embedding model: each word a direction of its own (words of one meaning share one), a text their sum. */
const SAME: Record<string, string> = { graphics: 'gpu', cards: 'gpu', gpus: 'gpu', gpu: 'gpu', bread: 'baking', loaf: 'baking', sourdough: 'baking' };
function direction(c: string): Float32Array {
  let s = 0;
  for (const ch of c) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = (i: number) => {
    let h = (s ^ Math.imul(i + 1, 0x9e3779b9)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32 - 0.5;
  };
  return new Float32Array(vec.DIM).map((_, i) => rnd(3 * i) + rnd(3 * i + 1) + rnd(3 * i + 2));
}
function fakeVector(text: string): Float32Array {
  const v = new Float32Array(vec.DIM);
  for (const w of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    if (['title', 'body'].includes(w)) continue;
    const d = direction(SAME[w] ?? w);
    for (let i = 0; i < vec.DIM; i++) v[i] += d[i];
  }
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}

test('searching what a template keeps: by words and by meaning, best first, the same from a step, its agents and programs', async () => {
  vec.setCodebookForTests(new Float32Array(vec.DIM * 16).map((_, i) => -0.12 + ((i % 16) * 0.24) / 15));
  setEmbedderForTests(async (texts) => texts.map(fakeVector));
  try {
    const a = app({
      name: 'Notes kept',
      data: { notes: { title: 'text', body: 'long' } },
      answer: [{ id: 'best', label: 'Best', type: 'text', required: true }],
      flow: { steps: [{ id: 'ask', do: 'data', op: 'search', collection: 'notes', query: '{{topic}}', limit: 2 }], outputs: { best: '{{ask.first.title}}' } },
    });
    for (const [title, body] of [
      ['Serving', 'vllm serves models on gpus with paged attention'],
      ['Sourdough', 'flour water salt and a long rise'],
      ['Quantizing', 'int4 weights make models smaller'],
    ])
      await http.inject({ method: 'POST', url: `/api/apps/${a.id}/data/notes`, payload: { record: { title, body } } });
    const vectors = () => (db.prepare('select count(*) as n from app_data_vec where app_id = ?').get(a.id) as { n: number }).n;
    for (let i = 0; i < 100 && vectors() < 3; i++) await sleep(50);
    assert.equal(vectors(), 3, 'each record got its vector, a moment after it was kept');
    const ask = async (q: string, mode = 'auto') => (await http.inject({ method: 'GET', url: `/api/apps/${a.id}/data/notes?ask=${encodeURIComponent(q)}&mode=${mode}` })).json();
    // Words alone: "flour" is in one record; "graphics cards" is in none.
    assert.deepEqual((await ask('flour', 'words')).records.map((r: any) => r.title), ['Sourdough']);
    assert.equal((await ask('graphics cards', 'words')).count, 0);
    // By meaning, "graphics cards" is about the GPUs record; and both ways at once, it comes first.
    const m = await ask('graphics cards');
    assert.equal(m.meaning, true);
    assert.equal(m.records[0].title, 'Serving');
    assert.ok(m.records[0].score > 0);
    // A step asks the same way; so does an agent of the template.
    const r = await ended(startRun({ app: a.id, slug: a.slug, recipe: a, source: 'web', inputs: { topic: 'a loaf of bread' } }).id);
    assert.equal(r.status, 'done', r.error);
    assert.equal(r.result!.best, 'Sourdough');
    // A record changed is found by its new words and meaning.
    const sour = (await ask('flour', 'words')).records[0];
    await http.inject({ method: 'PATCH', url: `/api/apps/${a.id}/data/notes/${sour.id}`, payload: { set: { body: 'a croissant needs butter' } } });
    for (let i = 0; i < 100 && vectors() < 3; i++) await sleep(50);
    assert.equal((await ask('flour', 'words')).count, 0);
    assert.deepEqual((await ask('butter', 'words')).records.map((x: any) => x.title), ['Sourdough']);
    // Removed, it is found no more.
    await http.inject({ method: 'DELETE', url: `/api/apps/${a.id}/data/notes/${sour.id}` });
    assert.equal((await ask('butter', 'words')).count, 0);
    assert.equal(vectors(), 2);
  } finally {
    setEmbedderForTests(null);
  }
});

test('flows beside the main one: a screen’s flow runs with its own inputs and gives back its outputs by name', async () => {
  const a = app({
    name: 'Two flows',
    data: { items: { title: 'text' } },
    answer: [],
    flow: { steps: [{ id: 'all', do: 'data', op: 'find', collection: 'items' }] },
    flows: { add: { title: 'Add one', inputs: [{ id: 'title', label: 'Title', required: true }], steps: [{ id: 'keep', do: 'data', add: 'items', with: { title: '{{inputs.title}}' } }], outputs: { added: '{{keep.record.title}}', id: '{{keep.id}}' } } },
  });
  assert.deepEqual(Object.keys(a.flows!), ['add']);
  const bad = await http.inject({ method: 'POST', url: `/api/apps/${a.id}/runs`, payload: { flow: 'add', inputs: {} } });
  assert.equal(bad.statusCode, 400);
  assert.match(bad.json().error, /Title: needed/);
  const none = await http.inject({ method: 'POST', url: `/api/apps/${a.id}/runs`, payload: { flow: 'nope' } });
  assert.match(none.json().error, /no flow “nope” \(it has add\)/);
  const started = (await http.inject({ method: 'POST', url: `/api/apps/${a.id}/runs`, payload: { flow: 'add', inputs: { title: 'From the screen' }, source: 'screen' } })).json().run;
  assert.equal(started.flow, 'add');
  assert.equal(started.source, 'screen');
  const done = await ended(started.id);
  assert.equal(done.status, 'done', done.error);
  assert.deepEqual(Object.keys(done.result!), ['added', 'id']);
  assert.equal(done.result!.added, 'From the screen');
  // A flow beside the main one is checked like it, in its own words.
  const wrong = await http.inject({ method: 'POST', url: '/api/apps/check', payload: { recipe: { name: 'W', prompt: 'x', flows: { add: { steps: [{ id: 'a', do: 'model', instructions: '{{inputs.nope}}' }] } } } } });
  assert.ok(wrong.json().errors.some((e: string) => /Flow “add”: .*no question “nope”/.test(e)), wrong.body);
});

test('screens: made from its parts or written, pages of the template’s own (not the library’s), changed by agents, carried in its file, gone with it', async () => {
  const a = app({ name: 'With a screen', prompt: 'Do {{topic}}', data: { notes: {} }, answer: [{ id: 'summary', label: 'Summary', type: 'markdown' }] });
  const made = (await http.inject({ method: 'POST', url: `/api/apps/${a.id}/screens`, payload: {} })).json();
  assert.equal(made.screen.name, 'main');
  const html = pageSource(db, made.screen.page)!.text;
  for (const part of ['<n-form flow="run">', '<n-result flow="run">', '<n-table data="notes" search remove>', '<n-runs flow="run" limit="5">']) assert.ok(html.includes(part), part);
  assert.equal(pageInfo(db, made.screen.page)!.app, a.id);
  assert.ok(!listPages(db).some((p) => p.id === made.screen.page), 'not in the Pages library');
  assert.equal(store.getApp(db, a.id)!.screens!.main.page, made.screen.page);
  const again = await http.inject({ method: 'POST', url: `/api/apps/${a.id}/screens`, payload: {} });
  assert.equal(again.statusCode, 409);
  // Its screens change only by their routes: saving its recipe keeps them, a page of another never becomes one, and a new template starts without.
  const saved = store.getApp(db, a.id)!;
  const other = createPage(db, { title: 'Mine', html: '<!doctype html><p>mine</p>', by: 'made' });
  for (const screens of [{ main: { page: other.id } }, undefined]) {
    const put = await http.inject({ method: 'PUT', url: `/api/apps/${a.id}`, payload: { recipe: { ...saved, screens } } });
    assert.equal(put.statusCode, 200, put.body);
    assert.equal(store.getApp(db, a.id)!.screens!.main.page, made.screen.page);
  }
  const copy = (await http.inject({ method: 'POST', url: '/api/apps', payload: { recipe: { ...saved, name: 'A copy' } } })).json().app;
  assert.equal(copy.screens, undefined);
  assert.ok(pageInfo(db, other.id), 'the other page stays');
  // An agent writes another screen, and changes it.
  const own = (await http.inject({ method: 'POST', url: `/api/apps/${a.id}/screens`, payload: { name: 'board', html: '<!doctype html><h1>Board</h1><n-count data="notes"></n-count>' } })).json();
  const changed = (await http.inject({ method: 'PUT', url: `/api/apps/${a.id}/screens/board`, payload: { html: '<!doctype html><h1>Board 2</h1>' } })).json().screen;
  assert.equal(changed.version, 2);
  assert.match((await http.inject({ method: 'GET', url: `/api/apps/${a.id}/screens/board` })).json().screen.html, /Board 2/);
  assert.deepEqual((await http.inject({ method: 'GET', url: `/api/apps/${a.id}/screens` })).json().screens.map((x: any) => x.name), ['main', 'board']);
  // In its file, its screens are their HTML; installed, they are pages of the new template.
  const pkg = packageOf(db, store.getApp(db, a.id)!, false);
  assert.match((pkg.app as any).screens.board.html, /Board 2/);
  const got = (await http.inject({ method: 'POST', url: '/api/apps/install', payload: { package: pkg } })).json();
  const b = store.getApp(db, got.app.id)!;
  assert.deepEqual(Object.keys(b.screens!), ['main', 'board']);
  assert.equal(pageInfo(db, b.screens!.board.page)!.app, b.id);
  assert.notEqual(b.screens!.main.page, made.screen.page);
  // A screen made while the app is read in Chinese has its headings in Chinese.
  kvSet(db, 'ui.language', 'zh');
  try {
    const zh = app({ name: '读书清单', prompt: 'Do {{topic}}' });
    const page = (await http.inject({ method: 'POST', url: `/api/apps/${zh.id}/screens`, payload: {} })).json().screen.page;
    const text = pageSource(db, page)!.text;
    for (const part of ['<html lang="zh">', '<h2>答案</h2>', '<h2>之前的运行</h2>']) assert.ok(text.includes(part), part);
  } finally {
    kvSet(db, 'ui.language', 'en');
  }
  // Removing a screen, and deleting the template, take their pages.
  await http.inject({ method: 'DELETE', url: `/api/apps/${a.id}/screens/board` });
  assert.equal(pageInfo(db, own.screen.page), null);
  await http.inject({ method: 'DELETE', url: `/api/apps/${a.id}` });
  assert.equal(pageInfo(db, made.screen.page), null);
});

test('saving checks a flow: what must change refuses it in words, what may surprise comes back as warnings', async () => {
  const bad = await http.inject({ method: 'POST', url: '/api/apps', payload: { recipe: { name: 'Bad', flow: { steps: [{ id: 'a', do: 'tool', tool: 'bash' }] } } } });
  assert.equal(bad.statusCode, 400);
  assert.match(bad.json().error, /bash cannot run as a step/);
  const ok = await http.inject({
    method: 'POST',
    url: '/api/apps',
    payload: { recipe: { name: 'Warned', fields: [{ id: 'topic', label: 'Topic' }], flow: { steps: [{ id: 'd', do: 'decide', rule: '{{topic}} = x', then: [{ id: 'e', do: 'model', instructions: 'x' }] }, { id: 'f', do: 'model', instructions: '{{e.text}}' }] } } },
  });
  assert.equal(ok.statusCode, 200, ok.body);
  assert.match(ok.json().warnings.join('\n'), /empty when the decision “d” goes the other way/);
  const checked = (await http.inject({ method: 'POST', url: '/api/apps/check', payload: { recipe: { name: 'C', flow: [{ id: 'a', do: 'repeat', steps: [] }] } } })).json();
  assert.ok(checked.errors.some((e: string) => /what to go through/.test(e)), checked.errors.join('\n'));
});

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
console.log(`\n${passed} of ${tests.length} passed`);
srv.close();
fs.rmSync(tmp, { recursive: true, force: true });
fs.rmSync(process.env.NAGET_APPS_DIR!, { recursive: true, force: true });
process.exit(process.exitCode ?? 0);
