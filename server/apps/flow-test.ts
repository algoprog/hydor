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
import { formatSearch } from '../../shared/search.ts';
import { checkFlow, cleanData, cleanFlow, cleanRequires, collapseSteps, evalRule, fillRefs, flowOf, readRule, valueOf, type Collapsed, type Scope } from '../../shared/app-manifest.ts';
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
import { folderOf, readFolder } from './folder.ts';
import { createPage, initPages, listPages, pageInfo, pageSource } from '../pages/store.ts';
import { setEmbedderForTests } from '../memory/embed.ts';
import * as vec from '../memory/vectors.ts';
import { envDir, envOf, envTesting } from './env.ts';
import { flowRunner, stepsOf as flowSteps } from './flow.ts';
import { apps } from './index.ts';
import { packageOf, zipPackage } from './package.ts';
import { defaultScreen } from './screens.ts';
import { MEMORY_MARK, runFolder, saveResult, startRun, startRuns, stopRun, waitFor, WORK_DIR } from './runs.ts';
import * as store from './store.ts';
import { templateById } from './templates.ts';

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

/** Two of the app's own tools: a search that answers JSON (or what `searchAs` gives, for a test), and a page reader that cannot read "broken" pages. */
const toolCalls: { tool: string; args: any }[] = [];
let searchAs: ((a: any) => string) | null = null;
const fakeTools: Feature = {
  id: 'fake-tools',
  tools: () => [
    {
      name: 'web_search',
      description: 'Searches the web.',
      inputSchema: { type: 'object' },
      async run(a) {
        toolCalls.push({ tool: 'web_search', args: a });
        if (searchAs) return searchAs(a);
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
  // Where its steps sit in the graph: places for steps that are there, groups of them, nothing else.
  const g = cleanRecipe({ ...r, graph: { at: { one: { x: 10.4, y: -5 }, gone: { x: 1, y: 1 }, bad: { x: 'a' } }, groups: [{ note: 'The start', steps: ['one', 'gone'] }, { note: 'Empty', steps: ['gone'] }] } }).graph;
  assert.deepEqual(g, { at: { one: { x: 10, y: -5 } }, groups: [{ id: 'g1', note: 'The start', steps: ['one'] }] });
  assert.equal(cleanRecipe({ ...r, graph: { at: { gone: { x: 1, y: 1 } } } }).graph, undefined);
  // Bends of a value's wire, by its ends: kept for steps that are there.
  assert.deepEqual(cleanRecipe({ ...r, graph: { bends: { 'one>one': { x: 4.6, y: 5 }, 'one>gone': { x: 1, y: 1 }, bad: { x: 1, y: 1 } } } }).graph, { bends: { 'one>one': { x: 5, y: 5 } } });
});

test('checks: a round of Repeat until sees the last round; one path of a Decide sees its own steps; the built-in values', () => {
  const fields = [{ id: 'topic', label: 'Topic', type: 'text' as const }];
  const loop = checkFlow({
    fields,
    answer: [],
    flow: {
      steps: [
        {
          id: 'again',
          do: 'repeat',
          until: '{{check.ok}} = yes',
          max: 3,
          steps: [
            { id: 'draft', do: 'model', instructions: 'Write about {{topic}}. Fix: {{check.issues}}', outputs: [{ id: 'text', label: 'Text', type: 'markdown' }] },
            { id: 'check', do: 'model', instructions: 'Check {{draft.text}}', outputs: [{ id: 'ok', label: 'OK', type: 'yesno' }, { id: 'issues', label: 'Issues', type: 'markdown' }] },
          ],
        },
      ],
    },
  });
  assert.deepEqual(loop.errors, []);
  assert.match(loop.warnings.join('\n'), /empty when it is the first round of “again”/);
  // Going through a list, each round is on its own: a later step's value is not there yet.
  const each = checkFlow({ fields, answer: [], flow: { steps: [{ id: 'each', do: 'repeat', over: '{{topic}}', steps: [{ id: 'x', do: 'model', instructions: '{{y.text}}' }, { id: 'y', do: 'model', instructions: 'y' }] }] } });
  assert.match(each.errors.join('\n'), /“y” comes later in the flow/);
  const path = checkFlow({
    fields,
    answer: [],
    flow: {
      steps: [
        { id: 'd', do: 'decide', rule: '{{topic}} = x', then: [{ id: 'a', do: 'model', instructions: 'A', outputs: [{ id: 'line', label: 'Line', type: 'text' }] }, { id: 'b', do: 'model', instructions: 'B {{a.line}}' }] },
        { id: 'after', do: 'model', instructions: 'After {{a.line}} on {{weekday}}, {{now}} ({{timezone}}), from {{run.source}}' },
      ],
    },
  });
  assert.deepEqual(path.errors, []);
  assert.deepEqual(path.warnings, ['Step “after” uses {{a.line}}, which is empty when the decision “d” goes the other way']);
  assert.match(checkFlow({ fields, answer: [], flow: { steps: [{ id: 's', do: 'model', instructions: '{{run.nope}}' }] } }).errors.join('\n'), /a run gives id and source/);
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

test('trying in the graph: a test run pauses before the steps asked, goes on a step at a time or to its end, and stops; frozen steps give what they gave in an earlier try', async () => {
  model.answer = (_system, user) => JSON.stringify({ line: `Re ${user}` });
  const a = app({
    name: 'Debug',
    answer: [{ id: 'line', label: 'Line', type: 'text', required: true }],
    flow: {
      steps: [
        { id: 'a', do: 'model', model: 'fake', instructions: 'A {{topic}}', outputs: { line: 'text' } },
        { id: 'b', title: 'B', do: 'model', model: 'fake', instructions: 'B {{a.line}}', outputs: { line: 'text' } },
        { id: 'c', title: 'C', do: 'model', model: 'fake', instructions: 'C {{b.line}}', outputs: { line: 'text' } },
      ],
    },
  });
  const until = async (f: () => boolean) => {
    for (let i = 0; i < 300 && !f(); i++) await sleep(20);
    assert.ok(f());
  };
  const run = (payload: Record<string, unknown>) => http.inject({ method: 'POST', url: `/api/apps/${a.id}/runs`, payload: { source: 'test', ...payload } }).then((r) => r.json().run as { id: string });
  const goOn = (id: string, step?: boolean) => http.inject({ method: 'POST', url: `/api/apps/runs/${id}/go`, payload: step ? { step } : {} });
  const progress = async (id: string) => (await http.inject({ method: 'GET', url: `/api/apps/runs/${id}` })).json().progress;
  const first = await run({ inputs: { topic: 'x' }, pause: ['b'] });
  await until(() => store.getRun(db, first.id)!.status === 'waiting');
  assert.deepEqual(stepsOf(first.id), ['a:done']);
  let p = await progress(first.id);
  assert.deepEqual(p.paused, ['b']);
  assert.equal(p.waiting, 'Paused before “B”');
  // One step: b runs, then it pauses before c.
  assert.equal((await goOn(first.id, true)).statusCode, 200);
  await until(() => stepsOf(first.id).includes('b:done') && store.getRun(db, first.id)!.status === 'waiting');
  p = await progress(first.id);
  assert.deepEqual(p.paused, ['c']);
  // To its end.
  await goOn(first.id);
  const done = await ended(first.id);
  assert.equal(done.status, 'done', done.error);
  assert.equal(done.result!.line, 'Re C Re B Re A x');
  assert.equal((await goOn(first.id)).statusCode, 409, 'it is not paused');
  // Frozen: a and b give what they gave in that try; only c runs.
  model.calls = [];
  const again = await run({ inputs: { topic: 'y' }, freeze: { from: first.id, steps: ['a', 'b'] } });
  assert.equal((await ended(again.id)).status, 'done');
  assert.deepEqual(model.calls.map((c) => c.user), ['C Re B Re A x']);
  assert.deepEqual(store.listSteps(db, again.id).filter((st) => st.reused).map((st) => st.id), ['a', 'b']);
  // Stopping a paused run stops it.
  const third = await run({ inputs: { topic: 'z' }, pause: ['a'] });
  await until(() => store.getRun(db, third.id)!.status === 'waiting');
  await http.inject({ method: 'POST', url: `/api/apps/runs/${third.id}/stop`, payload: {} });
  assert.equal((await ended(third.id)).status, 'stopped');
  // A run that is not a test does not pause.
  const plain = startRun({ app: a.id, slug: a.slug, recipe: a, source: 'web', inputs: { topic: 'w' }, pause: ['b'] });
  assert.equal((await ended(plain.id)).status, 'done');
});

test('Collapse to a block: steps that follow one another become a template of their own, called in their place; what they use is its form, what the steps after them use its answer', async () => {
  model.answer = (_system, user) => (user.startsWith('Sum ') ? JSON.stringify({ summary: `S(${user.slice(4)})` }) : JSON.stringify({ line: `L(${user})` }));
  const r = cleanRecipe({
    name: 'Long',
    agent: 'claude',
    fields: [{ id: 'url', label: 'Link', type: 'url', required: true }],
    answer: [
      { id: 'summary', label: 'Summary', type: 'markdown', required: true },
      { id: 'line', label: 'Line', type: 'text' },
    ],
    flow: {
      steps: [
        { id: 'read', do: 'tool', tool: 'read_page', with: { url: '{{url}}' } },
        { id: 'sum', do: 'model', model: 'fake', instructions: 'Sum {{read.text}}', outputs: { summary: 'long' } },
        { id: 'say', do: 'model', model: 'fake', instructions: 'Say {{sum.summary}} for {{url}}', outputs: { line: 'text' } },
      ],
      outputs: { summary: '{{sum.summary}}' },
    },
  });
  assert.match((collapseSteps(r, ['read', 'say'], { title: 'x', app: 'x' }) as { error: string }).error, /follow one another/);
  const c = collapseSteps(r, ['read', 'sum'], { title: 'Read and sum', app: 'read-and-sum' }) as Collapsed;
  assert.deepEqual(c.block.fields.map((f) => f.id), ['url']);
  assert.deepEqual(c.block.answer.map((f) => [f.id, f.type]), [['summary', 'markdown']]);
  assert.deepEqual(c.block.flow.outputs, { summary: '{{sum.summary}}' });
  assert.deepEqual(c.call, { id: 'read_and_sum', title: 'Read and sum', do: 'app', app: 'read-and-sum', with: { url: '{{url}}' } });
  assert.deepEqual(c.flows.flow!.steps.map((x) => x.id), ['read_and_sum', 'say']);
  assert.equal((c.flows.flow!.steps[1] as { instructions: string }).instructions, 'Say {{read_and_sum.summary}} for {{url}}');
  assert.deepEqual(c.flows.flow!.outputs, { summary: '{{read_and_sum.summary}}' });
  assert.equal((r.flow!.steps[1] as { instructions: string }).instructions, 'Sum {{read.text}}', 'the template it came from is as it was');
  // It runs: the block saved as a template, the template calling it.
  const block = store.saveApp(db, { slug: 'read-and-sum', recipe: cleanRecipe({ name: 'Read and sum', agent: 'claude', prompt: '', ...c.block }) });
  const parent = app({ ...r, ...c.flows });
  const run = startRun({ app: parent.id, slug: parent.slug, recipe: parent, source: 'web', inputs: { url: 'https://example.org/z' } });
  const done = await ended(run.id);
  assert.equal(done.status, 'done', done.error);
  assert.equal(block.slug, 'read-and-sum');
  assert.equal(done.result!.summary, 'S(The page at https://example.org/z says hello.)');
  assert.equal(done.result!.line, 'L(Say S(The page at https://example.org/z says hello.) for https://example.org/z)');
  // A value of a step before them is a question of its own; an answer field that came by name from them still does.
  const c2 = collapseSteps(r, ['sum', 'say'], { title: 'Sum and say', app: 'sum-and-say' }) as Collapsed;
  assert.deepEqual(c2.block.fields.map((f) => f.id), ['read_text', 'url']);
  assert.deepEqual(c2.call.with, { read_text: '{{read.text}}', url: '{{url}}' });
  assert.equal((c2.block.flow.steps[0] as { instructions: string }).instructions, 'Sum {{read_text}}');
  assert.deepEqual(c2.block.answer.map((f) => f.id), ['summary', 'line']);
  assert.deepEqual(c2.block.flow.outputs, { summary: '{{sum.summary}}', line: '{{say.line}}' });
});

test('versions: each save that changes what it does is one, saying who saved it and what changed; runs keep the version they ran, and its examples are counted for each', async () => {
  model.answer = (_system, user) => JSON.stringify({ line: `Re ${user}` });
  const a = app({
    name: 'Versioned',
    answer: [{ id: 'line', label: 'Line', type: 'text', required: true }],
    flow: { steps: [{ id: 'say', title: 'Say', do: 'model', model: 'fake', instructions: 'Say {{topic}}', outputs: { line: 'text' } }] },
    examples: [{ id: 'one', inputs: { topic: 'x' }, checks: ['{{answer.line}} = Re Say x'] }],
  });
  assert.deepEqual(store.listVersions(db, a.id).map((v) => [v.n, v.by, v.line]), [[1, 'you', 'Made it.']]);
  // Where its steps sit is no version.
  store.saveApp(db, { id: a.id, recipe: { ...cleanRecipe(a), graph: { at: { say: { x: 1, y: 2 } } } } });
  assert.equal(store.listVersions(db, a.id).length, 1);
  // Runs keep the version they ran.
  const tryIt = async (recipe?: unknown) => ended((await http.inject({ method: 'POST', url: `/api/apps/${a.id}/examples/run`, payload: recipe ? { recipe } : {} })).json().runs[0].run.id);
  assert.equal((await tryIt()).version, 1);
  // A change is a version that says what changed, and who changed it.
  const changed = { ...cleanRecipe(store.getApp(db, a.id)!), flow: { steps: [{ id: 'say', title: 'Say', do: 'model' as const, model: 'fake', instructions: 'Tell {{topic}}', outputs: [{ id: 'line', label: 'Line', type: 'text' as const }] }] } };
  store.saveApp(db, { id: a.id, recipe: changed, by: 'agent' });
  const vs = store.listVersions(db, a.id);
  assert.deepEqual(vs.map((v) => [v.n, v.by]), [[2, 'agent'], [1, 'you']]);
  assert.match(vs[0].line, /Changed the step “Say” \(say\)/);
  assert.equal((await tryIt()).version, 2);
  // A try of changes not saved runs no version.
  assert.equal((await tryIt({ ...changed, name: 'Changed here' })).version, undefined);
  // The versions, with how the examples went with each.
  const list = (await http.inject({ method: 'GET', url: `/api/apps/${a.id}/versions` })).json().versions;
  assert.deepEqual(list.map((v: any) => [v.n, v.examples?.tried, v.examples?.passed]), [[2, 1, 0], [1, 1, 1]]);
  // One brought back: its recipe as it was, saved again as the newest, saying so.
  const v1 = (await http.inject({ method: 'GET', url: `/api/apps/${a.id}/versions/1` })).json();
  assert.equal(v1.recipe.flow.steps[0].instructions, 'Say {{topic}}');
  const put = await http.inject({ method: 'PUT', url: `/api/apps/${a.id}`, payload: { recipe: v1.recipe, why: 'Brought back version 1' } });
  assert.equal(put.statusCode, 200, put.body);
  assert.deepEqual(store.listVersions(db, a.id).slice(0, 1).map((v) => [v.n, v.by, v.line]), [[3, 'you', 'Brought back version 1']]);
  assert.equal((await http.inject({ method: 'GET', url: `/api/apps/${a.id}/versions/9` })).statusCode, 404);
});

test('a template as a folder: its files written out and read back the same; a change saved there is a version by its folder, a mistake changes nothing, a save here writes it again', async () => {
  const a = app({
    name: 'Foldered',
    answer: [{ id: 'line', label: 'Line', type: 'text', required: true }],
    flow: {
      steps: [
        { id: 'say', title: 'Say', do: 'model', model: 'fake', instructions: 'Say {{topic}}\nin two lines', outputs: { line: 'text' } },
        { id: 'count', do: 'code', language: 'javascript', code: 'return { n: String(input.line).length };', with: { line: '{{say.line}}' } },
        { id: 'typed', do: 'code', language: 'typescript', code: "const said: string = await ctx.model('Again: {{n}}', { with: { n: input.n } }).then((r) => String(r.text));\nreturn { said };", with: { n: '{{count.n}}' } },
      ],
    },
    graph: { at: { say: { x: 3, y: 4 } } },
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'naget-folder-'));
  const made = await http.inject({ method: 'POST', url: `/api/apps/${a.id}/folder`, payload: { path: dir } });
  assert.equal(made.statusCode, 200, made.body);
  const file = (rel: string) => fs.readFileSync(path.join(dir, rel), 'utf8');
  const json = JSON.parse(file('app.json'));
  assert.equal(json.$schema, './.naget/app.schema.json');
  assert.deepEqual(json.flow.steps[0].instructions, { file: 'instructions/say.md' });
  assert.equal(file('instructions/say.md'), 'Say {{topic}}\nin two lines\n');
  assert.match(file('steps/count.js'), /export default async function step\(input, ctx\) \{\n {2}return \{ n: String\(input\.line\)\.length \};\n\}\n$/);
  assert.match(file('steps/typed.ts'), /^import type \{ Ctx, StepInput \} from '\.\.\/\.naget\/step';\n\nexport default async function step\(input: StepInput, ctx: Ctx\) \{\n {2}const said: string/m);
  assert.match(file('.naget/step.d.ts'), /export interface Ctx \{/);
  assert.deepEqual(JSON.parse(file('graph.json')), { at: { say: { x: 3, y: 4 } } });
  assert.ok(fs.existsSync(path.join(dir, '.naget/app.schema.json')) && fs.existsSync(path.join(dir, '.naget/step.d.ts')) && fs.existsSync(path.join(dir, 'README.md')));
  // Read back, it is the same template.
  const back = readFolder(dir);
  assert.deepEqual(back.errors, []);
  assert.equal(store.coreOf(cleanRecipe(back.recipe)), store.coreOf(store.getApp(db, a.id)!));
  const until = async (f: () => boolean) => {
    for (let i = 0; i < 150 && !f(); i++) await sleep(40);
    assert.ok(f());
  };
  const step = (n: number) => store.getApp(db, a.id)!.flow!.steps[n] as unknown as Record<string, string>;
  // A change saved in the folder is a version by its folder.
  fs.writeFileSync(path.join(dir, 'instructions/say.md'), 'Say {{topic}} warmly\n');
  await until(() => step(0).instructions === 'Say {{topic}} warmly');
  assert.equal(store.listVersions(db, a.id)[0].by, 'folder');
  fs.writeFileSync(path.join(dir, 'steps/count.js'), file('steps/count.js').replace('.length', '.length * 2'));
  await until(() => step(1).code === 'return { n: String(input.line).length * 2 };');
  // A mistake changes nothing, and says what it is.
  const before = store.getApp(db, a.id)!.updatedAt;
  fs.writeFileSync(path.join(dir, 'app.json'), '{ "name": ');
  await until(() => !!folderOf(store.getApp(db, a.id)!)?.error);
  assert.match(folderOf(store.getApp(db, a.id)!)!.error!, /^app\.json: /);
  assert.equal(store.getApp(db, a.id)!.updatedAt, before);
  // A save here writes the folder again, and the mistake is gone.
  const put = await http.inject({ method: 'PUT', url: `/api/apps/${a.id}`, payload: { recipe: { ...cleanRecipe(store.getApp(db, a.id)!), name: 'Foldered again' } } });
  assert.equal(put.statusCode, 200, put.body);
  assert.equal(JSON.parse(file('app.json')).name, 'Foldered again');
  assert.equal(folderOf(store.getApp(db, a.id)!)!.error, undefined);
  await sleep(700);
  assert.equal(store.listVersions(db, a.id)[0].by, 'you', 'its own write is no change from the folder');
  // A folder with other files in it is not taken.
  const busy = fs.mkdtempSync(path.join(os.tmpdir(), 'naget-folder-busy-'));
  fs.writeFileSync(path.join(busy, 'notes.txt'), 'mine');
  assert.match((await http.inject({ method: 'POST', url: `/api/apps/${a.id}/folder`, payload: { path: busy } })).json().error, /other files in it/);
  // Stopped: the files stay, and changes there come no more.
  await http.inject({ method: 'DELETE', url: `/api/apps/${a.id}/folder` });
  assert.equal(store.getApp(db, a.id)!.folder, undefined);
  fs.writeFileSync(path.join(dir, 'instructions/say.md'), 'Never mind\n');
  await sleep(700);
  assert.equal(step(0).instructions, 'Say {{topic}} warmly');
  // The schema an editor checks app.json with.
  assert.equal((await http.inject({ method: 'GET', url: '/api/apps/schema.json' })).json().title, 'A Naget Agent app (app.json)');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(busy, { recursive: true, force: true });
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
  assert.throws(() => scheduler.save({ name: 'Nope', schedule: { kind: 'daily', time: '09:00' }, app: { id: 'nope', inputs: {} } } as any), /no such app/);
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

test('a program as a flow: its ctx calls are steps of the run, kept, and replayed when it runs again after a restart; in JavaScript, TypeScript and Python', async () => {
  model.answer = (_system, user) => (user.startsWith('Sum up: ') ? JSON.stringify({ line: `S(${user.slice(8)})` }) : '{}');
  const program = [
    "const page = await ctx.tool('read_page', { url: input.url });",
    "const { line } = await ctx.model('Sum up: {{text}}', { with: { text: page.text }, outputs: { line: 'text' } });",
    "const kept = await ctx.data.add('items', { title: line });",
    "let failed = '';",
    "try { await ctx.tool('read_page', { url: 'https://broken.example/x' }); } catch (e) { failed = e.message; }",
    'return { line, failed, id: kept.id };',
  ].join('\n');
  const a = app({
    name: 'Programmed',
    fields: [{ id: 'url', label: 'Link', type: 'url', required: true }],
    data: { items: { title: 'text' } },
    answer: [{ id: 'line', label: 'Line', type: 'text', required: true }],
    flow: { steps: [{ id: 'main', do: 'code', language: 'javascript', code: program, with: { url: '{{url}}' }, outputs: { line: 'text', failed: 'text' } }], outputs: { line: '{{main.line}}' } },
  });
  assert.deepEqual(checkFlow(a).errors, []);
  const done = await ended(startRun({ app: a.id, slug: a.slug, recipe: a, source: 'web', inputs: { url: 'https://example.org/q' } }).id, 60_000);
  assert.equal(done.status, 'done', done.error);
  assert.equal(done.result!.line, 'S(The page at https://example.org/q says hello.)');
  const steps = store.listSteps(db, done.id);
  assert.deepEqual(
    steps.map((st) => [st.path, st.kind, st.status]),
    [
      ['main', 'code', 'done'],
      ['main/c1', 'tool', 'done'],
      ['main/c2', 'model', 'done'],
      ['main/c3', 'data', 'done'],
      ['main/c4', 'tool', 'failed'],
    ],
  );
  const main = steps[0].outputs!;
  assert.match(String(main.failed), /^read_page: That page could not be read/);
  assert.equal(findRecords(db, a.id, a.data, 'items').records.find((r) => r.id === main.id)?.title, done.result!.line);
  assert.equal(steps[2].title, 'Sum up: {{text}}');
  assert.ok((done.costUsd ?? 0) > 0, 'what its model call cost is the run’s');
  // After a restart it runs again: a call it made before gives what it gave then, the rest runs.
  const again = store.insertRun(db, { app: a.id, appName: a.name, recipe: a, source: 'web', inputs: { url: 'https://example.org/again' }, status: 'running' });
  store.saveStep(db, { run: again.id, path: 'main', id: 'main', kind: 'code', title: 'Main', status: 'running', startedAt: Date.now() - 5000 });
  store.saveStep(db, { run: again.id, path: 'main/c1', id: 'c1', kind: 'tool', title: 'read_page', status: 'done', outputs: { text: 'Kept from before the restart' }, startedAt: Date.now() - 4000, endedAt: Date.now() - 3000 });
  const calls = toolCalls.length;
  flowRunner.resume(store.getRun(db, again.id)!);
  const d2 = await ended(again.id, 60_000);
  assert.equal(d2.status, 'done', d2.error);
  assert.equal(d2.result!.line, 'S(Kept from before the restart)');
  assert.ok(!toolCalls.slice(calls).some((c) => c.args.url === 'https://example.org/again'), 'the call made before was not made again');
  // A call kept from before that is not the one it makes now: what was kept from there on goes, and it runs.
  const other = store.insertRun(db, { app: a.id, appName: a.name, recipe: a, source: 'web', inputs: { url: 'https://example.org/other' }, status: 'running' });
  store.saveStep(db, { run: other.id, path: 'main', id: 'main', kind: 'code', title: 'Main', status: 'running', startedAt: Date.now() });
  store.saveStep(db, { run: other.id, path: 'main/c1', id: 'c1', kind: 'model', title: 'Something else', status: 'done', outputs: { text: 'stale' }, startedAt: Date.now(), endedAt: Date.now() });
  store.saveStep(db, { run: other.id, path: 'main/c2', id: 'c2', kind: 'model', title: 'Sum up: {{text}}', status: 'done', outputs: { line: 'stale too' }, startedAt: Date.now(), endedAt: Date.now() });
  flowRunner.resume(store.getRun(db, other.id)!);
  const d3 = await ended(other.id, 60_000);
  assert.equal(d3.result!.line, 'S(The page at https://example.org/other says hello.)');
  // TypeScript, as it is; Python, each call waiting for its answer.
  const typed = app({
    name: 'Typed',
    fields: [],
    answer: [],
    flow: {
      steps: [
        { id: 'ts', do: 'code', language: 'typescript', code: "const n: number = Number(input.n);\nconst r = await ctx.tool('web_search', { query: `about ${n}` });\nreturn { found: (r.data as { results: unknown[] }).results.length, doubled: n * 2 };", with: { n: 21 } },
        { id: 'py', do: 'code', language: 'python', code: "r = ctx.model('Sum up: {{text}}', with_={'text': 'twice ' + str(input['n'])}, outputs={'line': 'text'})\nreturn {'line': r['line']}", with: { n: '{{ts.doubled}}' } },
      ],
    },
  });
  const d4 = await ended(startRun({ app: typed.id, slug: typed.slug, recipe: typed, source: 'web', inputs: {} }).id, 60_000);
  assert.equal(d4.status, 'done', d4.error);
  const outs = Object.fromEntries(store.listSteps(db, d4.id).map((st) => [st.path, st.outputs]));
  assert.deepEqual([outs.ts!.found, outs.ts!.doubled], [1, 42]);
  assert.equal(outs.py!.line, 'S(twice 42)');
  assert.ok(outs['py/c1'] && outs['ts/c1'], 'their calls are steps of the run');
});

test('Work out a value: the first or last, how many, a sum or average of a field, a field of each, joined, without repeats, sorted, a date some days later; at once, at no cost', async () => {
  const a = app({
    name: 'Worked',
    answer: [],
    flow: {
      steps: [
        { id: 'list', do: 'code', language: 'javascript', code: "return { items: [{ name: 'b', price: 3 }, { name: 'a', price: 5 }, { name: 'b', price: 3 }] };", outputs: { items: 'table(name: text, price: number)' } },
        { id: 'n', do: 'value', of: '{{list.items}}', op: 'count' },
        { id: 'total', do: 'value', of: '{{list.items}}', op: 'sum', arg: 'price' },
        { id: 'avg', do: 'value', of: '{{list.items}}', op: 'average', arg: 'price' },
        { id: 'names', do: 'value', of: '{{list.items}}', op: 'pick', arg: 'name' },
        { id: 'joined', do: 'value', of: '{{names.value}}', op: 'join', arg: ' + ' },
        { id: 'once', do: 'value', of: '{{names.value}}', op: 'unique' },
        { id: 'dear', do: 'value', of: '{{list.items}}', op: 'sort', arg: '-price' },
        { id: 'top', do: 'value', of: '{{dear.value}}', op: 'first' },
        { id: 'later', do: 'value', of: '2026-11-02', op: 'date', arg: '7' },
        { id: 'lines', do: 'value', of: 'one\ntwo\nthree', op: 'last' },
      ],
    },
  });
  assert.deepEqual(checkFlow(a).errors, []);
  const done = await ended(startRun({ app: a.id, slug: a.slug, recipe: a, source: 'web', inputs: { topic: 'x' } }).id, 60_000);
  assert.equal(done.status, 'done', done.error);
  const v = Object.fromEntries(store.listSteps(db, done.id).map((st) => [st.id, st.outputs?.value]));
  assert.deepEqual(
    [v.n, v.total, v.avg, v.names, v.joined, v.once, v.top, v.later, v.lines],
    [3, 11, 3.666667, ['b', 'a', 'b'], 'b + a + b', ['b', 'a'], { name: 'a', price: 5 }, '2026-11-09', 'three'],
  );
  assert.ok(store.listSteps(db, done.id).every((st) => st.kind !== 'value' || !st.costUsd), 'at no cost');
  assert.match(cleanFlow({ steps: [{ id: 'p', do: 'value', of: '{{x}}', op: 'pick' }] }).errors.join(), /which field of each it picks/);
  assert.match(cleanFlow({ steps: [{ id: 'p', do: 'value', of: '{{x}}', op: 'guess' }] }).errors.join(), /one of first, last, count/);
});

test('blocks: templates made to be steps of others; the ready-made ones check out, become yours, and run as a step of another', async () => {
  const g = (await http.inject({ method: 'GET', url: '/api/apps' })).json();
  const ready = g.templates.filter((t: { block?: boolean }) => t.block);
  assert.deepEqual(
    ready.map((t: { id: string }) => t.id),
    ['sum-up-page', 'translate', 'web-answer', 'sort-into-kinds', 'pull-out-facts'],
  );
  for (const t of ready) assert.deepEqual(checkFlow(t).errors, [], t.id);
  const made = (await http.inject({ method: 'POST', url: '/api/apps', payload: { recipe: ready.find((t: { id: string }) => t.id === 'sort-into-kinds'), template: 'sort-into-kinds' } })).json().app;
  assert.equal(made.block, true);
  model.answer = (_system, user) => (user.startsWith('Which one of these kinds') ? JSON.stringify({ kind: 'bug', why: 'It crashes.' }) : '{}');
  const caller = app({
    name: 'Triage by block',
    answer: [{ id: 'kind', label: 'Kind', type: 'text', required: true }],
    flow: { steps: [{ id: 'sorted', do: 'app', app: made.slug, with: { text: 'The app crashes on start', kinds: 'bug, question' } }], outputs: { kind: '{{sorted.kind}}' } },
  });
  const done = await ended(startRun({ app: caller.id, slug: caller.slug, recipe: caller, source: 'web', inputs: { topic: 'x' } }).id, 60_000);
  assert.equal(done.status, 'done', done.error);
  assert.equal(done.result!.kind, 'bug');
  // Agents see which of their templates are blocks.
  const ctx: RunCtx = { runId: 'blocks-1', key: 'acp:blocks-1', agent: 'acp', cwd: os.tmpdir(), deps };
  const get = Object.fromEntries(apps.tools!(ctx).map((x) => [x.name, x])).app_get;
  const list = JSON.parse(String(await get.run({}, ctx))).apps;
  assert.equal(list.find((x: { id: string }) => x.id === made.id).block, true);
});

test('Deep research, as it comes: its questions planned, searched three at a time, the results ranked and read four at a time, a question short of sources searched again, the report written by its agent and its citations numbered', async () => {
  // The search answers as the real one does, a numbered list. Question 3's best page cannot be read; its search in other words finds another.
  searchAs = (a) => {
    const q = String(a.query);
    const n = /\d/.exec(q)?.[0] ?? '0';
    const hits = q.startsWith('other')
      ? [{ title: `Found again ${n}`, url: `https://www.iea.org/report-${n}`, date: '2026-05-01', snippet: 'More on it.' }]
      : [
          { title: `Study ${n}`, url: n === '3' ? 'https://www.site3.gov/broken' : `https://www.site${n}.gov/study`, date: '2025-03-01', snippet: 'A study.' },
          { title: `Report ${n}`, url: `https://news${n}.example/report?utm_source=feed`, date: '2026-02-01', snippet: 'A report.' },
        ];
    return formatSearch({ query: q, provider: 'Test', hits });
  };
  model.answer = (_system, user) => {
    if (user.startsWith('Plan web research')) return JSON.stringify({ questions: [1, 2, 3].map((n) => ({ question: `Question ${n}?`, query: `query ${n}`, other: `other ${n}` })) });
    if (user.startsWith('Pull out of the page')) return JSON.stringify({ facts: [`What ${/^The page: .*?, (https:\S+)/m.exec(user)![1]} says`], publisher: 'Pub', date: '2026', useful: true });
    return '{}';
  };
  try {
    const calls = toolCalls.length;
    const res = await http.inject({ method: 'POST', url: '/api/apps/tpl:deep-research/runs', payload: { inputs: { topic: 'Heat pumps in the cold', depth: 'Quick overview' } } });
    assert.equal(res.statusCode, 200, res.body);
    const runId = res.json().run.id;
    // Its writer gets the evidence, each fact under its question with its source's number, and the sources in a list.
    const write = await agentAnswers(runId, 'write', {
      summary: 'They work [4].',
      key_findings: ['Cold is fine [4]', 'Costs vary [2]'],
      report: 'Intro [2]. More [4][1]. Mine [5]. A slip [9].',
      confidence: 'Medium: few sources',
      extra_sources: [{ title: 'Own find', publisher: 'Me', date: '2026', url: 'https://own.example/x' }],
    });
    const prompt = sessions.made.find((m) => m.key === write.key)!.o.prompt as string;
    assert.match(prompt, /### 1\. Question 1\?\n- What https:\/\/www\.site1\.gov\/study says \[1\]\n- What https:\/\/news1\.example\/report\?utm_source=feed says \[3\]/);
    assert.match(prompt, /### 3\. Question 3\?\n- What https:\/\/www\.iea\.org\/report-3 says \[4\]/);
    assert.match(prompt, /\[4\] Found again 3 \(Pub, 2026\) https:\/\/www\.iea\.org\/report-3/);
    assert.match(prompt, /Length: about 400 words/);
    const done = await ended(runId, 60_000);
    assert.equal(done.status, 'done', done.error);
    // The sources it cites, numbered as it first cites them (the one it found itself too); a number that names none goes.
    const result = done.result as any;
    assert.deepEqual(result.sources.map((s: any) => s.url), ['https://www.site2.gov/study', 'https://www.iea.org/report-3', 'https://www.site1.gov/study', 'https://own.example/x']);
    assert.match(result.report, /^Intro \[1\]\. More \[2\]\[3\]\. Mine \[4\]\. A slip\.\n\n## Sources\n\n1\. Study 2, Pub, 2026 — https:\/\/www\.site2\.gov\/study\n2\. Found again 3/);
    assert.equal(result.summary, 'They work [2].');
    assert.deepEqual(result.key_findings, ['Cold is fine [2]', 'Costs vary [1]']);
    assert.equal(result.confidence, 'Medium: few sources');
    // Each search at its depth, and each page read for its question; the one that cannot be read is gone without.
    const made = toolCalls.slice(calls);
    assert.deepEqual(made.filter((c) => c.tool === 'web_search').map((c) => [c.args.query, c.args.k]).sort(), [['other 3', 6], ['query 1', 6], ['query 2', 6], ['query 3', 6]]);
    assert.deepEqual(
      made.filter((c) => c.tool === 'read_page').map((c) => [c.args.url, c.args.question]).sort(),
      [
        ['https://news1.example/report?utm_source=feed', 'Question 1?'],
        ['https://www.iea.org/report-3', 'Question 3?'],
        ['https://www.site1.gov/study', 'Question 1?'],
        ['https://www.site2.gov/study', 'Question 2?'],
        ['https://www.site3.gov/broken', 'Question 3?'],
      ],
    );
    const st = Object.fromEntries(store.listSteps(db, runId).map((s) => [s.path, s.status]));
    assert.equal(st.check_plan, 'skipped', 'nobody asked to check the questions');
    assert.deepEqual(['search#1', 'search#2', 'search#3', 'read#1', 'read#2', 'read#3', 'read#4'].map((p) => st[p]), Array(7).fill('done'));
    assert.deepEqual([st['read#3/page'], st['read#3/facts']], ['failed', 'skipped'], 'a page that cannot be read is gone without');
    assert.deepEqual([st.more, st['search_more#1/find_more'], st.pick_more, st['read_more#1/facts_more']], ['done', 'done', 'done', 'done'], 'the question short of sources was searched again');
    for (const id of ['budget', 'queries', 'rank', 'coverage', 'evidence', 'finish']) assert.equal(st[id], 'done', `its program ${id} ran`);
    assert.ok((done.costUsd ?? 0) > 0, 'its model steps cost');
  } finally {
    searchAs = null;
  }
});

test('Trip planner, as it comes: its dates worked out, four branches of research side by side (the forecast only for a trip that is near), the plan on the trip’s own dates and its budget added up; it asks what you would like only when you are there', async () => {
  const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  model.answer = (_system, user) => {
    if (user.startsWith('From the search results below, list what is on')) return JSON.stringify({ events: [{ name: 'Jazz festival', date: 'Saturday', where: 'Belém', note: '' }], holidays: [], closures: ['The castle closes on Mondays'] });
    if (user.startsWith('Say what weather to expect')) return JSON.stringify({ summary: user.includes('The forecast:') ? 'Sunny, by the forecast' : 'Mild, as usual then', temperatures: '14–20 °C', rain: 'Some', pack: ['A light jacket'] });
    if (user.startsWith('From the search results below, pick the areas')) return JSON.stringify({ areas: [{ area: 'Alfama', why: 'The old town', good_for: 'Walkers' }], sights: [{ name: 'Castle', area: 'Alfama', hours: '9–21', book: 'A day ahead' }] });
    if (user.startsWith('From the search results below, say how visitors get')) return JSON.stringify({ arrival: 'The metro from the airport', around: 'A Viva Viagem card', currency: 'EUR' });
    return '{}';
  };
  const plan = {
    overview: 'Three easy days.',
    itinerary: [
      { day: 2, area: 'Alfama', morning: 'Castle', afternoon: 'Tram 28', evening: 'Fado' },
      { day: 1, area: 'Baixa', morning: 'Arrive', afternoon: 'A walk', evening: 'Dinner' },
      { day: 3, area: 'Belém', morning: 'The tower', afternoon: 'Jazz festival', evening: 'Pastéis' },
    ],
    book_ahead: ['The castle, a day ahead'],
    costs: [
      { item: 'Hotel, 2 nights', low: 300, high: 450 },
      { item: 'Food', low: 150, high: 200, note: 'two people' },
    ],
    currency: 'EUR',
    tips: ['Get a Viva Viagem card'],
  };
  const tpl = templateById('trip-planner')!;
  // From the API, nobody is there to answer: it does not ask, even when its form says to.
  const r = startRun({ app: 'tpl:trip-planner', slug: 'trip-planner', recipe: tpl, source: 'api', inputs: { destination: 'Lisbon', start: day(5), days: '3', choose: 'Yes' } });
  const agent = await agentAnswers(r.id, 'plan', plan);
  const prompt = sessions.made.find((m) => m.key === agent.key)!.o.prompt as string;
  assert.match(prompt, new RegExp(`\\| 1 \\| ${day(5)} \\| \\w+day \\|`), 'it plans on the days, each with its weekday');
  assert.match(prompt, /Weather: Sunny, by the forecast/, 'a trip five days off has a forecast');
  assert.match(prompt, /Jazz festival/);
  assert.doesNotMatch(prompt, /Where they want to stay/);
  const done = await ended(r.id, 60_000);
  assert.equal(done.status, 'done', done.error);
  const result = done.result as any;
  assert.deepEqual(result.days.map((d: any) => [d.day, d.date, d.area]), [[1, day(5), 'Baixa'], [2, day(6), 'Alfama'], [3, day(7), 'Belém']]);
  assert.deepEqual(result.budget, [
    { item: 'Hotel, 2 nights', estimate: '300–450 EUR' },
    { item: 'Food', estimate: '150–200 EUR (two people)' },
    { item: 'Total', estimate: '450–650 EUR' },
  ]);
  assert.equal(result.overview, 'Three easy days.');
  const st = store.listSteps(db, r.id);
  const status = Object.fromEntries(st.map((s) => [s.path, s.status]));
  assert.equal(status.choices, 'skipped', 'not asked: the run came from the API');
  for (const id of ['calendar', 'research', 'events_search', 'holidays_search', 'whats_on', 'climate_search', 'soon', 'forecast_search', 'weather', 'sights_search', 'areas_search', 'places', 'transport_search', 'transport', 'plan', 'assemble']) assert.equal(status[id], 'done', id);
  const at = Object.fromEntries(st.map((s) => [s.id, s]));
  const started = Math.max(...['events_search', 'climate_search', 'sights_search', 'transport_search'].map((id) => at[id].startedAt!));
  const ended1 = Math.min(...['whats_on', 'weather', 'places', 'transport'].map((id) => at[id].endedAt!));
  assert.ok(started <= ended1, 'the four branches ran side by side');
  // From its form, when the form says so, it asks; the plan follows the answer. A trip weeks off has no forecast.
  const w = startRun({ app: 'tpl:trip-planner', slug: 'trip-planner', recipe: tpl, source: 'web', inputs: { destination: 'Lisbon', start: day(40), days: '3', choose: 'Yes' } });
  let view: any = {};
  for (let i = 0; i < 400 && !view.question; i++) {
    view = (await http.inject({ method: 'GET', url: `/api/apps/runs/${w.id}` })).json();
    if (!view.question) await sleep(25);
  }
  assert.equal(view.question?.step, 'choices');
  assert.match(view.question.question, /Areas to stay in:[\s\S]*Alfama[\s\S]*Weather: Mild, as usual then/);
  assert.deepEqual(view.question.fields.map((f: any) => f.id), ['stay', 'must', 'skip']);
  assert.equal((await http.inject({ method: 'POST', url: `/api/apps/runs/${w.id}/answer`, payload: { values: { stay: 'Near the river' } } })).statusCode, 200);
  const agent2 = await agentAnswers(w.id, 'plan', plan);
  assert.match(sessions.made.find((m) => m.key === agent2.key)!.o.prompt, /Where they want to stay: Near the river/);
  const done2 = await ended(w.id, 60_000);
  assert.equal(done2.status, 'done', done2.error);
  const status2 = Object.fromEntries(store.listSteps(db, w.id).map((s) => [s.path, s.status]));
  assert.equal(status2.choices, 'done');
  assert.equal(status2.forecast_search, undefined, 'no forecast for a trip weeks off');
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
  assert.ok(JSON.parse(text(await tools.app_get.run({}, ctx))).apps.some((t: any) => t.id === id));
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
  // Where its steps sit is the user's: a whole recipe without it keeps theirs.
  store.saveApp(db, { id, recipe: { ...cleanRecipe(store.getApp(db, id)!), graph: { at: { save: { x: 5, y: 6 } } } } });
  text(await tools.app_get.run({ app: id }, ctx));
  text(await tools.app_save.run({ app: id, recipe: { ...cleanRecipe(store.getApp(db, id)!), graph: undefined, name: 'Built again' } }, ctx));
  assert.deepEqual(store.getApp(db, id)!.graph, { at: { save: { x: 5, y: 6 } } });
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
  assert.match(String(told), /changed an app you built/);
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
  assert.match(junk.json().error, /neither an app/);
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
  // An OpenRouter model this computer lacks is added to Settings → Models by itself when the app first runs (its key asked for with its keys).
  assert.deepEqual([by['custom:big-one'].status, by['custom:big-one'].use], ['provider', 'openrouter/example/big-1']);
  assert.deepEqual(by['custom:big-one'].options.map((o: any) => o.value), ['fake']);
  assert.equal(by['claude:opus'].status, 'missing', 'this stand-in has no catalog for Claude Code');
  assert.ok(!p.warnings.some((w: string) => /example\/big-1/.test(w)), p.warnings.join('\n'));
  // As it is, its step asks for the OpenRouter model by the name Settings → Models gives it.
  const kept = (await http.inject({ method: 'POST', url: '/api/apps/install', payload: { package: theirs, models: { 'claude:opus': '' } } })).json();
  assert.deepEqual(store.getApp(db, kept.app.id)!.flow!.steps.map((s: any) => s.model), ['fake', 'openrouter/example/big-1', undefined]);
  store.deleteApp(db, kept.app.id);
  // Or one picked here stands in.
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

test('a conversation on its screen: a message starts one with the template’s agent and later ones go on with it; its agent runs the template’s flows and waits for what they give', async () => {
  const a = app({
    name: 'Notes keeper',
    data: { notes: { title: 'text' } },
    answer: [],
    flow: { steps: [{ id: 'all', do: 'data', op: 'find', collection: 'notes' }] },
    flows: { add: { title: 'Add one', inputs: [{ id: 'title', label: 'Title', required: true }], steps: [{ id: 'keep', do: 'data', add: 'notes', with: { title: '{{inputs.title}}' } }], outputs: { added: '{{keep.record.title}}' } } },
  });
  assert.equal((await http.inject({ method: 'POST', url: `/api/apps/${a.id}/chats`, payload: { text: '  ' } })).statusCode, 400);
  const started = (await http.inject({ method: 'POST', url: `/api/apps/${a.id}/chats`, payload: { text: 'What do you keep?' } })).json().run;
  assert.equal(started.source, 'chat');
  assert.equal(started.inputs.message, 'What do you keep?');
  await sleep(100);
  const key = store.getRun(db, started.id)!.key!;
  const made = sessions.made.find((m) => m.key === key)!;
  assert.match(made.o.prompt, /What do you keep\?/);
  // Told it is a conversation, with nothing to hand in; it gets the template's records and flows.
  const add = await apps.spawn!({ agent: 'claude', key, cwd: tmp, runId: 'agent-chat-1', resume: false, extra: { app: made.o.extra.app } }, deps);
  assert.match(add!.instructions![0], /a conversation on the screen of the app "Notes keeper"/);
  assert.doesNotMatch(add!.instructions![0], /submit_result|Your last reply is the result/);
  const ctx: RunCtx = { runId: 'agent-chat-1', key, agent: 'claude', cwd: tmp, deps };
  assert.deepEqual(apps.tools!(ctx).map((t) => t.name), ['app_data', 'app_run']);
  assert.equal(apps.allowTool!('app_run', ctx), true);
  const runTool = apps.tools!(ctx).find((t) => t.name === 'app_run')!;
  assert.match(runTool.description, /run \(its main flow; inputs: topic: text, names\?: long\); add \(Add one; inputs: title: text\)/);
  const out = JSON.parse(String(await runTool.run({ flow: 'add', inputs: { title: 'Milk' }, wait: 20 }, ctx)));
  assert.equal(out.status, 'done', out.error);
  assert.equal(out.result.added, 'Milk');
  assert.equal(out.link, `/apps/runs/${out.run}`);
  const wrong = (await runTool.run({ flow: 'nope' }, ctx)) as { text: string; isError?: boolean };
  assert.ok(wrong.isError);
  assert.match(wrong.text, /no flow “nope”/);
  // Its turn ends: the conversation waits for the next message (done), listed among its conversations, not its runs.
  sessions.items.set(key, [{ kind: 'user', id: 'u1', seq: 0, text: 'What do you keep?' }]);
  sessions.end(key, 'I keep notes: one so far, Milk.');
  assert.equal((await ended(started.id)).status, 'done');
  const chats = (await http.inject({ method: 'GET', url: `/api/apps/${a.id}/chats` })).json().chats;
  assert.deepEqual([chats.length, chats[0].id, chats[0].first], [1, started.id, 'What do you keep?']);
  const runs = (await http.inject({ method: 'GET', url: `/api/apps/${a.id}/runs` })).json().runs;
  assert.ok(!runs.some((x: { id: string }) => x.id === started.id), 'a conversation is not one of its runs');
  assert.ok(runs.some((x: { source: string; flow?: string }) => x.source === 'screen' && x.flow === 'add'), 'the flow its agent ran is');
  const page = (await http.inject({ method: 'GET', url: `/api/apps/runs/${started.id}` })).json();
  assert.equal(page.first, 'I keep notes: one so far, Milk.');
  assert.equal(page.noAsks, undefined);
  // A later message goes on with it.
  const more = await http.inject({ method: 'POST', url: `/api/apps/runs/${started.id}/ask`, payload: { text: 'Thanks' } });
  assert.equal(more.statusCode, 200, more.body);
  assert.equal(more.json().run.status, 'running');
  sessions.end(key, 'You are welcome.');
  assert.equal((await ended(started.id)).status, 'done');
  // Only a conversation's agent runs flows: a run from the form gets no app_run.
  const r = startRun({ app: a.id, slug: a.slug, recipe: { ...a, prompt: 'Do {{topic}}', flow: undefined }, source: 'web', inputs: { topic: 'x' } });
  await sleep(100);
  const key2 = store.getRun(db, r.id)!.key!;
  await apps.spawn!({ agent: 'claude', key: key2, cwd: tmp, runId: 'agent-chat-2', resume: false, extra: { app: sessions.made.find((m) => m.key === key2)!.o.extra.app } }, deps);
  const ctx2: RunCtx = { runId: 'agent-chat-2', key: key2, agent: 'claude', cwd: tmp, deps };
  assert.ok(!apps.tools!(ctx2).some((t) => t.name === 'app_run'));
  assert.equal(apps.allowTool!('app_run', ctx2), false);
  sessions.end(key2, 'Done.');
  await ended(r.id);
  // A screen made from its parts has a conversation when it keeps data.
  assert.match(defaultScreen(a), /<h2>Ask its agent<\/h2>\n  <n-chat><\/n-chat>/);
  assert.doesNotMatch(defaultScreen({ ...a, data: undefined }), /n-chat/);
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
