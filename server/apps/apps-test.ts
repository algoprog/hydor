// Script tests for Apps: filling the prompt, the form's checks, the answer fields' schema and
// submit_result, follow-ups that refine a result, API keys, rate limits and the public page's caps
// (through its routes, with a stand-in for the session manager), and CSV in and out with runs over rows.
// Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/apps/apps-test.ts
//   DATA_DIR=/tmp/hydor-test-apps-unit node dist/dev/apps-test.js
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import type { AppRecipe } from '../../shared/apps.ts';
import { answerSchema, checkAnswer, checkInputs, cleanRecipe, fillTemplate, parseCsv, placeholders, toCsv } from '../../shared/apps.ts';
import { allSteps, checkFlow, cleanExamples, cleanFlow, givesOf, readRule, refsIn } from '../../shared/app-manifest.ts';
import { checkUi, cleanUi } from '../../shared/app-ui.ts';
import { APP_ICONS } from '../../shared/apps.ts';
import { HttpError } from '../auth.ts';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { batchCsv, startBatch, startBatches } from './batch.ts';
import { apps } from './index.ts';
import { Limiter } from './limits.ts';
import { publicRoutes } from './public.ts';
import { publicRunOf, publicRunPrompt } from './publicRun.ts';
import { runInstructions, saveResult, startRun, startRuns } from './runs.ts';
import * as store from './store.ts';
import { TEMPLATES } from './templates.ts';
import { appForMessage, appHint, intake, usableApps, useNote } from './use.ts';
import { byWords, dropAppIndex, findApps, stem } from './search.ts';
import { addModels, modelStates, needModels, setModelsHere } from './models.ts';
import { missingSecrets, needSecrets, saveAppSecrets, secretsOf } from './secrets.ts';
import { providerModels } from '../../shared/app-models.ts';
import { notesOf } from '../notes.ts';
import { appSummary } from '../../shared/app-summary.ts';
import { madeForSessions } from '../../shared/apps.ts';
import type { ScheduledTask } from '../../shared/automations.ts';
import type { Scheduler } from '../scheduler.ts';
import { saveHome } from './home.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-apps-test-'));
const db = openDb(path.join(tmp, 'test.db'));
store.ensureTables(db);
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- a stand-in for the session manager: sessions start at once and "work" until told to stop ----

class FakeSessions extends EventEmitter {
  made: { key: string; o: any }[] = [];
  status = new Map<string, string>();
  replies = new Map<string, string[]>();
  archived = new Set<string>();
  sent: { key: string; text: string }[] = [];
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
  /** A whole conversation for a session, where a test gives one (messages, tool calls, replies). */
  items = new Map<string, any[]>();
  async timeline(key: string) {
    const said = this.replies.get(key) ?? [];
    return { parser: { items: this.items.get(key) ?? said.map((text, i) => ({ kind: 'assistant', id: `a${i}`, seq: i, text })) }, readMore: async () => {} } as any;
  }
  liveSnapshot() {
    return { live: null, overlay: { items: [], patches: {}, approvals: [] } };
  }
  async interrupt(key: string) {
    this.status.set(key, 'idle');
    this.emit('live', key);
  }
  async deliverOrQueue(key: string, text: string) {
    this.sent.push({ key, text });
    this.status.set(key, 'working');
  }
  enqueue(key: string, text: string) {
    this.sent.push({ key, text });
  }
  /** The cards shown in a session (an app's form), and how the user answers the next one. */
  cards: any[] = [];
  answerWith: ((card: any) => any) | null = null;
  adapterByRun(_runId: string) {
    return { ask: async (card: any) => (this.cards.push(card), this.answerWith ? this.answerWith(card) : null) } as any;
  }
  /** Ends a session's turn with a reply. */
  end(key: string, reply = 'All done.') {
    this.replies.set(key, [...(this.replies.get(key) ?? []), reply]);
    this.items.get(key)?.push({ kind: 'assistant', id: `a${this.items.get(key)!.length}`, seq: 0, text: reply });
    this.status.set(key, 'idle');
    this.emit('live', key);
  }
  /** Ends a run's session for good: again after the reminder to hand in the result, if one comes. */
  async endFully(key: string, reply = 'All done.') {
    this.end(key, reply);
    await sleep(2300);
    if (this.status.get(key) === 'working') {
      this.end(key, 'Done.');
      await sleep(2300);
    }
  }
}

const sessions = new FakeSessions();
const http = Fastify();
await http.register(cookie);
// As the app's server answers errors: their status, and the message in words.
http.setErrorHandler((err: Error, _req, reply) => {
  reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message });
});
const events: unknown[] = [];
const deps = { app: http, db, sessions: sessions as any, scheduler: null as any, models: null as any, broadcast: (e: unknown) => events.push(e), toSubscribers: () => {}, publicBase: () => 'http://test.local' } as Deps;
// The capability's routes (with the public page's) and its start: runs are followed from here on.
apps.routes!(deps);
startRuns(deps);
startBatches(db, (id) => store.getApp(db, id)?.slug);
await http.ready();

const recipe = (p: Partial<AppRecipe> = {}): AppRecipe =>
  cleanRecipe({
    name: 'Trip planner',
    agent: 'claude',
    prompt: 'Plan {{days}} days in {{city}}.{{#kids}} We travel with children.{{/kids}}{{^budget}} Any budget.{{/budget}}{{#budget}} Budget: {{budget}}.{{/budget}}',
    fields: [
      { id: 'city', label: 'City', type: 'text', required: true },
      { id: 'days', label: 'Days', type: 'number', required: true, default: '3' },
      { id: 'kids', label: 'Kids', type: 'yesno' },
      { id: 'budget', label: 'Budget', type: 'text' },
    ],
    answer: [
      { id: 'summary', label: 'Summary', type: 'markdown', required: true },
      { id: 'cost', label: 'Cost', type: 'number' },
      { id: 'days', label: 'Days', type: 'table', required: true, columns: [{ id: 'day', label: 'Day', type: 'number' }, { id: 'date', label: 'Date', type: 'date' }, { id: 'plan', label: 'Plan', type: 'text' }] },
    ],
    tools: ['web_search'],
    limits: {},
    // Test runs work in the scratch folder, not in ~/naget-apps.
    cwd: tmp,
    ...p,
  });

// ---- filling the prompt and checking the form ------------------------------------------------------

test('template: answers fill placeholders; sections keep text only when answered', () => {
  const tpl = recipe().prompt;
  assert.equal(fillTemplate(tpl, { city: 'Lisbon', days: '4', kids: 'Yes', budget: '' }), 'Plan 4 days in Lisbon. We travel with children. Any budget.');
  assert.equal(fillTemplate(tpl, { city: 'Porto', days: '2', kids: 'No', budget: '€800' }), 'Plan 2 days in Porto. Budget: €800.');
});

test('template: placeholders and sections naming no field stay, {{today}} is today, empty lines collapse', () => {
  const out = fillTemplate('Hi {{name}}\n\n\n\n{{#missing}}x{{/missing}}Use {{{{braces}}}} and {{other}} on {{today}}.', { name: 'Ana' }, { today: '2026-10-31' });
  assert.equal(out, 'Hi Ana\n\n{{#missing}}x{{/missing}}Use {{{{braces}}}} and {{other}} on 2026-10-31.');
  assert.deepEqual(placeholders('{{a}} {{#b}}{{c}}{{/b}} {{^d}}x{{/d}}').sort(), ['a', 'b', 'c', 'd']);
});

test('template: nested sections and spaces inside braces', () => {
  const out = fillTemplate('{{# a }}A{{#b}}B{{ b }}{{/b}}{{/a}}|{{^a}}none{{/a}}', { a: 'x', b: 'y' });
  assert.equal(out, 'ABy|');
});

test('form: defaults, numbers, dates, choices, yes/no and what to fix', () => {
  const fields = cleanRecipe({ fields: [
    { id: 'n', label: 'N', type: 'number', required: true },
    { id: 'd', label: 'When', type: 'date' },
    { id: 'c', label: 'Pace', type: 'choice', options: ['Slow', 'Fast'] },
    { id: 'y', label: 'Kids', type: 'yesno' },
    { id: 't', label: 'Name', type: 'text', default: 'Ana' },
  ], prompt: 'x' }).fields;
  const ok = checkInputs(fields, { n: '$1,250', d: '2026-11-03', c: 'fast', y: true });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.values, { n: '1250', d: '2026-11-03', c: 'Fast', y: 'Yes', t: 'Ana' });
  const bad = checkInputs(fields, { n: 'lots', d: '2026-02-30', c: 'Medium', y: 'perhaps' });
  assert.equal(bad.errors.length, 4);
  assert.match(bad.errors.join(' | '), /N: should be a number/);
  assert.match(bad.errors.join(' | '), /Pace: should be one of Slow, Fast/);
  assert.match(checkInputs(fields, {}).errors.join(), /N: needed/);
  assert.match(checkInputs(fields, { n: 1, t: 'x'.repeat(3000) }).errors.join(), /Name: too long/);
});

/** The ten ready-made tasks of before the apps for everyday things (templates-more.ts), each made of several kinds of step. */
const FIRST_TEN = ['deep-research', 'trip-planner', 'compare-products', 'document-qa', 'meeting-actions', 'cover-letter', 'lesson-plan', 'news-digest', 'explain-contract', 'small-web-app'];

test('templates: thirty-three tasks in steps, each checking out as a save checks it, using its needed fields, giving every answer field it needs, asking a person only when someone is there, its programs readable; five blocks, whose steps check out and use theirs', async () => {
  const tasks = TEMPLATES.filter((t) => !t.block);
  assert.equal(tasks.length, 33);
  assert.deepEqual(tasks.slice(0, 10).map((t) => t.id), FIRST_TEN, 'the first ten keep their place');
  const blocks = TEMPLATES.filter((t) => t.block);
  assert.equal(blocks.length, 5);
  for (const t of blocks) {
    assert.ok(t.flow && !checkFlow(t).errors.length, `${t.id}: its steps check out`);
    const used = new Set(refsIn(t.flow).map((r) => r.split(/[.[]/)[0]));
    for (const f of t.fields.filter((x) => x.required)) assert.ok(used.has(f.id), `${t.id}: ${f.id} unused`);
    assert.ok(t.answer.length >= 1 && t.description.length > 30, `${t.id}: written out`);
    assert.deepEqual(cleanRecipe(t).fields, t.fields, `${t.id}: tidy as written`);
  }
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const python = spawnSync('python3', ['--version']).status === 0;
  for (const t of tasks) {
    assert.ok(t.flow && !t.prompt, `${t.id}: works in steps, not one agent's task`);
    assert.deepEqual(cleanRecipe(t).fields, t.fields, `${t.id}: its form tidy as written`);
    assert.deepEqual(cleanRecipe(t).flow, t.flow, `${t.id}: its steps tidy as written`);
    assert.ok(t.answer.length >= 2 && t.description.length > 30, `${t.id}: written out`);
    // As a save checks it: nothing to fix; what may surprise is only a value that can be empty (a step skipped or failed, a path not taken), which the steps after it allow for.
    const checked = (await http.inject({ method: 'POST', url: '/api/apps/check', payload: { recipe: t } })).json();
    assert.deepEqual(checked.errors, [], `${t.id}: its steps check out`);
    assert.deepEqual(checked.warnings.filter((w: string) => !/, which is empty when /.test(w)), [], `${t.id}: nothing it uses is missing`);
    const steps = allSteps(t.flow!.steps);
    const used = new Set(refsIn(t.flow).map((r) => r.split(/[.[]/)[0]));
    for (const f of t.fields.filter((x) => x.required)) assert.ok(used.has(f.id), `${t.id}: ${f.id} unused`);
    // Every answer field comes from a step that gives it, so the result shows the same card as before.
    for (const f of t.answer) {
      const ref = /^\{\{\s*(\w+)\.(\w+)\s*\}\}$/.exec(t.flow!.outputs?.[f.id] ?? '');
      assert.ok(ref, `${t.id}: ${f.id} comes from one value of a step`);
      const from = steps.find((s) => s.id === ref[1]);
      assert.ok(from && (givesOf(from) ?? []).includes(ref[2]), `${t.id}: ${f.id} comes from {{${ref[1]}.${ref[2]}}}, which that step gives`);
    }
    assert.ok(new Set(steps.map((s) => s.do)).size >= (FIRST_TEN.includes(t.id) ? 4 : 2), `${t.id}: several kinds of step`);
    assert.ok(steps.every((s) => s.title), `${t.id}: each step says what it does`);
    // A person is asked only when the form says so and the run comes from the form, a test or a session (an agent ran it for them there): never the API, rows or a schedule; nobody answering does not stop it.
    for (const s of steps.filter((x) => x.do === 'ask')) {
      assert.match(s.if ?? '', /^\{\{(\w+)\}\} and \{\{run\.source\}\} = web or \{\{\1\}\} and \{\{run\.source\}\} = test or \{\{\1\}\} and \{\{run\.source\}\} = session$/, `${t.id}: ${s.id} asks only when someone is there`);
      const field = t.fields.find((f) => f.id === /^\{\{(\w+)\}\}/.exec(s.if!)![1]);
      assert.equal(field?.type, 'yesno', `${t.id}: ${s.id} asks when a yes/no on the form says so`);
      assert.equal(s.failed, 'skip', `${t.id}: ${s.id} goes on when nobody answers`);
    }
    for (const s of steps) {
      if (s.do !== 'code') continue;
      if (s.language === 'python') {
        if (!python) continue;
        const program = `def main(input, ctx):\n${s.code.split('\n').map((l) => `    ${l}`).join('\n')}\n    return None\n`;
        const p = spawnSync('python3', ['-I', '-c', 'import ast, sys; ast.parse(sys.stdin.read())'], { input: program });
        assert.equal(p.status, 0, `${t.id}: ${s.id} reads as Python: ${p.stderr}`);
      } else assert.doesNotThrow(() => new AsyncFunction('input', 'ctx', s.code), `${t.id}: ${s.id} reads as JavaScript`);
      // Where the sandbox cannot run, an agent does a program's work (one inside a round may go without instead).
      assert.ok(s.failed === 'agent' || (s.failed === 'skip' && steps.some((r) => r.do === 'repeat' && allSteps(r.steps).includes(s))), `${t.id}: ${s.id} says what happens when it cannot run`);
    }
  }
});

test('ready-made apps: each recipe, flow, view and set of examples cleans up without a word to fix; each example’s answers pass its form and its checks read; ids, icons and kinds are as the Apps page wants them', () => {
  const ids = new Set<string>();
  const kinds = new Set<string>();
  for (const t of TEMPLATES) {
    assert.ok(!ids.has(t.id) && /^[a-z][a-z0-9-]*$/.test(t.id), `${t.id}: an id of its own`);
    ids.add(t.id);
    assert.ok((APP_ICONS as readonly string[]).includes(t.icon), `${t.id}: its icon`);
    assert.ok(t.name.length <= 60 && t.description.length <= 300 && (t.category ?? '').length <= 30, `${t.id}: within bounds`);
    assert.deepEqual(cleanFlow(t.flow).errors, [], `${t.id}: its steps`);
    if (t.block) continue;
    kinds.add(t.category ?? '');
    assert.ok(t.ui, `${t.id}: a view`);
    assert.deepEqual(cleanUi(t.ui).errors, [], `${t.id}: its view`);
    assert.deepEqual(checkUi(t).errors, [], `${t.id}: its view against its answer`);
    assert.ok((t.examples ?? []).length >= (FIRST_TEN.includes(t.id) ? 1 : 2), `${t.id}: examples to try it with`);
    assert.deepEqual(cleanExamples(t.examples).errors, [], `${t.id}: its examples`);
    for (const e of t.examples ?? []) {
      assert.deepEqual(checkInputs(t.fields, e.inputs).errors, [], `${t.id}, example ${e.id}: its answers pass the form`);
      for (const f of t.fields.filter((x) => x.required)) assert.ok(e.inputs[f.id] !== undefined && e.inputs[f.id] !== '', `${t.id}, example ${e.id}: answers ${f.id}`);
      for (const c of e.checks ?? []) assert.ok(!('error' in readRule(c)), `${t.id}, example ${e.id}: its check “${c}” reads`);
      assert.ok((e.checks ?? []).length, `${t.id}, example ${e.id}: has a check`);
    }
    for (const f of t.answer) assert.ok((f.columns ?? []).length <= 16, `${t.id}: ${f.id} has at most sixteen columns`);
  }
  assert.ok(kinds.size <= 12, `at most twelve kinds of app, not ${[...kinds].join(', ')}`);
});

// ---- the answer fields ------------------------------------------------------------------------------

test('schema: one property per answer field, tables as arrays of objects, needed ones required', () => {
  const s = answerSchema(recipe().answer) as any;
  assert.equal(s.type, 'object');
  assert.deepEqual(s.required, ['summary', 'days']);
  assert.equal(s.properties.cost.type, 'number');
  assert.equal(s.properties.days.type, 'array');
  assert.deepEqual(s.properties.days.items.required, ['day', 'date', 'plan']);
  assert.equal(s.properties.days.items.properties.date.type, 'string');
});

test('check: plain forms kept, numbers and dates read, unknown keys dropped', () => {
  const r = checkAnswer(recipe().answer, { summary: ' Fine ', cost: '$1,200', days: [{ day: '1', date: 'Nov 3, 2026', plan: 'Old town' }], extra: 'x' });
  assert.ok(r.ok);
  assert.deepEqual(r.value, { summary: 'Fine', cost: 1200, days: [{ day: 1, date: '2026-11-03', plan: 'Old town' }] });
});

test('check: errors say what to fix, field by field', () => {
  const r = checkAnswer(recipe().answer, { cost: 'about thirty', days: [{ day: 'one', date: 'soon' }, 'x'] });
  assert.ok(!r.ok);
  const all = r.errors.join('\n');
  assert.match(all, /summary: missing/);
  assert.match(all, /cost: should be a number/);
  assert.match(all, /days row 1, day: should be a number/);
  assert.match(all, /days row 1, date: should be a date/);
  assert.match(all, /days row 2: should be an object/);
  assert.ok(!checkAnswer(recipe().answer, 'not json').ok);
});

test('check: lists from lines, JSON sent as text, links and yes/no', () => {
  const answer = cleanRecipe({ prompt: 'x', answer: [
    { id: 'tips', label: 'Tips', type: 'list' },
    { id: 'link', label: 'Link', type: 'url' },
    { id: 'ok', label: 'OK', type: 'yesno' },
    { id: 'rows', label: 'Rows', type: 'table', columns: [{ id: 'a', label: 'A', type: 'text' }] },
  ] }).answer;
  const r = checkAnswer(answer, JSON.stringify({ tips: '- one\n2. two\n', link: 'https://example.com/x', ok: 'yes', rows: '[{"a": 1}]' }));
  assert.ok(r.ok);
  assert.deepEqual(r.value, { tips: ['one', 'two'], link: 'https://example.com/x', ok: true, rows: [{ a: '1' }] });
  const bad = checkAnswer(answer, { link: 'javascript:alert(1)' });
  assert.ok(!bad.ok && /link: should start with https/.test(bad.errors.join()));
  assert.ok(!checkAnswer(answer, { tips: ['x'.repeat(500_000)] }).ok, 'too long');
});

test('submit_result: only on an app run, checks the fields, saves the result; tools follow the app', async () => {
  const app = store.saveApp(db, { recipe: recipe() });
  const run = startRun({ app: app.id, slug: app.slug, recipe: app, source: 'web', inputs: { city: 'Lisbon' } });
  await sleep(50);
  const key = store.getRun(db, run.id)!.key!;
  const mark = sessions.made.find((m) => m.key === key)!.o.extra.app;
  // The agent process starts: the capability notes its run id.
  const add = await apps.spawn!({ agent: 'claude', key, cwd: tmp, runId: 'agent-run-1', resume: false, extra: { app: mark } }, deps);
  assert.match(add!.instructions![0], /submit_result/);
  assert.match(add!.instructions![0], /- summary \(text, Markdown, required\)/);
  const ctx: RunCtx = { runId: 'agent-run-1', key, agent: 'claude', cwd: tmp, deps };
  const [tool] = apps.tools!(ctx);
  assert.equal(tool.name, 'submit_result');
  assert.deepEqual((tool.inputSchema as any).required, ['summary', 'days']);
  const bad = await tool.run({ summary: 'x' }, ctx);
  assert.ok(typeof bad === 'object' && bad.isError && /days: missing/.test(bad.text));
  assert.equal(store.getRun(db, run.id)!.result, undefined);
  const good = await tool.run({ result: { summary: 'A plan', days: [{ day: 1, date: '2026-11-03', plan: 'Walk' }] } }, ctx);
  assert.match(String(good), /Saved/);
  assert.deepEqual(store.getRun(db, run.id)!.result, { summary: 'A plan', cost: null, days: [{ day: 1, date: '2026-11-03', plan: 'Walk' }] });
  // The app allows web_search only (and its answer); other sessions are not its business.
  assert.equal(apps.allowTool!('web_search', ctx), true);
  assert.equal(apps.allowTool!('submit_result', ctx), true);
  assert.equal(apps.allowTool!('read_session', ctx), false);
  assert.equal(apps.allowTool!('read_session', { ...ctx, runId: 'other', key: 'claude:someone-else' }), true);
  // Another session hands in nothing: it gets what templates are built with.
  assert.deepEqual(apps.tools!({ ...ctx, runId: 'other', key: 'claude:someone-else' }).map((t) => t.name), ['app_get', 'app_save', 'app_try', 'app_screen', 'app_data', 'find_apps', 'use_app']);
  sessions.end(key, 'Here is the plan.');
  await sleep(2000);
  const done = store.getRun(db, run.id)!;
  assert.equal(done.status, 'done');
  assert.equal(done.reply, 'Here is the plan.');
  assert.ok(events.length > 0, 'the pages heard of it');
});

test('nudge: a run that ends without its result is reminded once, then ends', async () => {
  const app = store.saveApp(db, { recipe: recipe({ name: 'Nudged' }) });
  const run = startRun({ app: app.id, slug: app.slug, recipe: app, source: 'api', inputs: { city: 'Rome' } });
  await sleep(50);
  const key = store.getRun(db, run.id)!.key!;
  assert.ok(sessions.archived.has(key), 'runs from programs stay out of the session list');
  sessions.end(key, 'I wrote the plan in my reply instead.'.padEnd(320, '.'));
  await sleep(2200);
  assert.equal(sessions.sent.filter((s) => s.key === key).length, 1);
  assert.match(sessions.sent.find((s) => s.key === key)!.text, /submit_result/);
  assert.ok(store.getRun(db, run.id)!.nudged);
  sessions.end(key, 'Done.');
  await sleep(2200);
  const r = store.getRun(db, run.id)!;
  assert.equal(r.status, 'done');
  // The reply that reads like an answer, not the short one after the reminder.
  assert.match(r.reply!, /^I wrote the plan/);
  assert.equal(sessions.sent.filter((s) => s.key === key).length, 1, 'only one reminder');
});

// ---- follow-ups ----------------------------------------------------------------------------------------

/** What a transcript holds: a message, the answer handed in. */
const message = (text: string) => ({ kind: 'user', id: `u-${Math.random().toString(36).slice(2, 8)}`, seq: 0, ts: Date.now(), text });
const handedIn = () => ({ kind: 'tool', id: `t-${Math.random().toString(36).slice(2, 8)}`, seq: 0, tool: { name: 'mcp__hydor__submit_result', category: 'other', title: 'submit_result', status: 'ok' } });

test('follow-ups: one from the run’s page opens the run again; its new result and reply land, and the page lists it', async () => {
  const app = store.saveApp(db, { recipe: recipe({ name: 'Refined' }) });
  const run = startRun({ app: app.id, slug: app.slug, recipe: app, source: 'web', inputs: { city: 'Athens' } });
  await sleep(50);
  const key = store.getRun(db, run.id)!.key!;
  const mark = sessions.made.find((m) => m.key === key)!.o.extra.app;
  const add = await apps.spawn!({ agent: 'claude', key, cwd: tmp, runId: 'agent-run-fu', resume: false, extra: { app: mark } }, deps);
  assert.match(add!.instructions![0], /Later messages may ask you to change the result/);
  const ctx: RunCtx = { runId: 'agent-run-fu', key, agent: 'claude', cwd: tmp, deps };
  const [tool] = apps.tools!(ctx);
  sessions.items.set(key, [message('Plan 3 days in Athens.')]);
  await tool.run({ summary: 'Three days', days: [{ day: 1, plan: 'Acropolis' }] }, ctx);
  sessions.items.get(key)!.push(handedIn());
  sessions.end(key, 'Here is the plan.');
  await sleep(2100);
  assert.equal(store.getRun(db, run.id)!.status, 'done');
  // Asked on the run's page: it goes to the session, and the run works again.
  const res = await http.inject({ method: 'POST', url: `/api/apps/runs/${run.id}/ask`, payload: { text: 'Make day 1 lighter' } });
  assert.equal(res.statusCode, 200, res.body);
  assert.deepEqual(sessions.sent.at(-1), { key, text: 'Make day 1 lighter' });
  const open = store.getRun(db, run.id)!;
  assert.equal(open.status, 'running');
  assert.equal(open.endedAt, undefined);
  sessions.items.get(key)!.push(message('Make day 1 lighter'));
  await tool.run({ summary: 'Three easier days', days: [{ day: 1, plan: 'Acropolis Museum' }] }, ctx);
  sessions.items.get(key)!.push(handedIn());
  sessions.end(key, 'Day 1 is lighter now: the museum instead of the hill.');
  await sleep(2100);
  const r = store.getRun(db, run.id)!;
  assert.equal(r.status, 'done');
  assert.equal((r.result as Record<string, unknown>).summary, 'Three easier days');
  assert.equal(r.reply, 'Day 1 is lighter now: the museum instead of the hill.');
  assert.equal(sessions.sent.filter((s) => s.key === key).length, 1, 'no reminder: it handed in the new result');
  const page = (await http.inject({ method: 'GET', url: `/api/apps/runs/${run.id}` })).json();
  assert.equal(page.first, 'Here is the plan.');
  assert.deepEqual(
    page.asks.map((a: { text: string; updated: boolean; reply?: string }) => [a.text, a.updated, a.reply]),
    [['Make day 1 lighter', true, 'Day 1 is lighter now: the museum instead of the hill.']],
  );
  assert.equal(page.noAsks, undefined);
  assert.equal((await http.inject({ method: 'POST', url: `/api/apps/runs/${run.id}/ask`, payload: { text: ' ' } })).statusCode, 400);
});

test('follow-ups: one typed in the session opens the run too; a change only written out is reminded once, thanks are not', async () => {
  const app = store.saveApp(db, { recipe: recipe({ name: 'Chatted' }) });
  const run = startRun({ app: app.id, slug: app.slug, recipe: app, source: 'web', inputs: { city: 'Nafplio' } });
  await sleep(50);
  const key = store.getRun(db, run.id)!.key!;
  sessions.items.set(key, [message('Plan 3 days in Nafplio.')]);
  saveResult(run.id, { summary: 'A plan', cost: null, days: [] });
  sessions.items.get(key)!.push(handedIn());
  sessions.end(key, 'The plan is ready.');
  await sleep(2100);
  assert.equal(store.getRun(db, run.id)!.status, 'done');
  // The session's own message box: the session goes to work, and the run follows it.
  const work = (text: string) => {
    sessions.items.get(key)!.push(message(text));
    sessions.status.set(key, 'working');
    sessions.emit('live', key, { status: 'working' });
  };
  const sent = () => sessions.sent.filter((s) => s.key === key);
  work('Swap day 2 for a day on Spetses');
  await sleep(50);
  assert.equal(store.getRun(db, run.id)!.status, 'running');
  sessions.end(key, 'Here is the new day 2 on Spetses: '.padEnd(400, 'ferry, beach, lunch, '));
  await sleep(2300);
  assert.equal(sent().length, 1, 'one reminder to hand in the changed result');
  assert.match(sent()[0].text, /^The result card still shows the earlier version\. .*submit_result/);
  assert.equal(store.getRun(db, run.id)!.status, 'running');
  // It hands in the new result after the reminder.
  sessions.items.get(key)!.push(message(sent()[0].text));
  saveResult(run.id, { summary: 'A plan with Spetses', cost: null, days: [] });
  sessions.items.get(key)!.push(handedIn());
  sessions.end(key, 'Done.');
  await sleep(2300);
  let r = store.getRun(db, run.id)!;
  assert.equal(r.status, 'done');
  assert.equal((r.result as Record<string, unknown>).summary, 'A plan with Spetses');
  assert.match(r.reply!, /^Here is the new day 2/, 'the reply that reads like an answer, not "Done."');
  // Thanks: a short answer and no reminder.
  work('Thanks!');
  await sleep(50);
  sessions.end(key, 'Glad it helps!');
  await sleep(2300);
  r = store.getRun(db, run.id)!;
  assert.equal(r.status, 'done');
  assert.equal(r.reply, 'Glad it helps!');
  assert.equal(sent().length, 1, 'no reminder after thanks');
  const page = (await http.inject({ method: 'GET', url: `/api/apps/runs/${run.id}` })).json();
  assert.equal(page.first, 'The plan is ready.');
  // The app's reminder is not one of the person's follow-ups.
  assert.deepEqual(
    page.asks.map((a: { text: string; updated: boolean }) => [a.text, a.updated]),
    [
      ['Swap day 2 for a day on Spetses', true],
      ['Thanks!', false],
    ],
  );
});

test('follow-ups: a public page’s run takes none, and its session at work again leaves it ended', async () => {
  const r = store.insertRun(db, { app: 'pub', appName: 'Public', recipe: recipe(), source: 'public', inputs: {}, status: 'done' });
  store.updateRun(db, r.id, { key: 'acp:public-fu' });
  const res = await http.inject({ method: 'POST', url: `/api/apps/runs/${r.id}/ask`, payload: { text: 'More, please' } });
  assert.equal(res.statusCode, 409);
  assert.match(res.json().error, /public page/);
  sessions.status.set('acp:public-fu', 'working');
  sessions.emit('live', 'acp:public-fu', { status: 'working' });
  await sleep(50);
  assert.equal(store.getRun(db, r.id)!.status, 'done');
  sessions.status.delete('acp:public-fu');
  assert.doesNotMatch(runInstructions({ recipe: recipe(), source: 'public', appName: 'Public' }), /Later messages/);
});

// ---- API keys ----------------------------------------------------------------------------------------

test('keys: shown once, kept as a hash, open their own app only, revoked at once', async () => {
  const a = store.saveApp(db, { recipe: recipe({ name: 'Keyed' }) });
  const b = store.saveApp(db, { recipe: recipe({ name: 'Other' }) });
  const { id, key } = store.createKey(db, a.id, 'Script');
  assert.match(key, /^napp_[\w-]{32}$/);
  const raw = JSON.stringify(db.prepare('select * from app_keys').all());
  assert.ok(!raw.includes(key), 'the key itself is not stored');
  assert.deepEqual(store.appOfKey(db, key)?.app, a.id);
  assert.equal(store.appOfKey(db, `${key}x`), null);
  assert.equal(store.appOfKey(db, 'acm_something'), null);
  assert.ok(store.listKeys(db, a.id)[0].hint.startsWith('napp_'));
  assert.ok(!('hash' in store.listKeys(db, a.id)[0]));
  // Through the route: its own app runs, another app refuses it.
  const ok = await http.inject({ method: 'POST', url: `/api/apps/${a.slug}/run`, headers: { authorization: `Bearer ${key}` }, payload: { city: 'Oslo', wait: 0 } });
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal(ok.json().status, 'starting');
  const other = await http.inject({ method: 'POST', url: `/api/apps/${b.slug}/run`, headers: { authorization: `Bearer ${key}` }, payload: { city: 'Oslo' } });
  assert.equal(other.statusCode, 401);
  const poll = await http.inject({ method: 'GET', url: `/api/apps/${a.slug}/run/${ok.json().run}`, headers: { authorization: `Bearer ${key}` } });
  assert.equal(poll.statusCode, 200);
  assert.equal(poll.json().run, ok.json().run);
  assert.ok(store.revokeKey(db, a.id, id));
  const gone = await http.inject({ method: 'POST', url: `/api/apps/${a.slug}/run`, headers: { authorization: `Bearer ${key}` }, payload: { city: 'Oslo' } });
  assert.equal(gone.statusCode, 401);
});

test('API: a run waits for its answer: {status, result, reply, session}', async () => {
  const a = store.saveApp(db, { recipe: recipe({ name: 'Waited', answer: [] }) });
  const { key } = store.createKey(db, a.id, 'Wait');
  const pending = http.inject({ method: 'POST', url: `/api/apps/${a.slug}/run`, headers: { authorization: `Bearer ${key}` }, payload: { inputs: { city: 'Bergen' }, wait: 20 } });
  await sleep(300);
  const made = sessions.made[sessions.made.length - 1];
  assert.match(made.o.prompt, /Plan 3 days in Bergen/);
  sessions.end(made.key, 'Bergen in three days.');
  const res = await pending;
  const body = res.json();
  assert.equal(body.status, 'done');
  assert.equal(body.reply, 'Bergen in three days.');
  assert.equal(body.session.key, made.key);
  assert.equal(body.session.url, `http://test.local/s/${encodeURIComponent(made.key)}`);
});

// ---- rate limits and caps ----------------------------------------------------------------------------

test('limiter: so many in a window, then refused until it slides; undo gives one back', () => {
  let now = 1_000_000;
  const l = new Limiter(() => now);
  assert.ok(l.take('ip', 2, 60_000));
  now += 1000;
  assert.ok(l.take('ip', 2, 60_000));
  assert.ok(!l.take('ip', 2, 60_000));
  assert.equal(l.wait('ip', 2, 60_000), 59_000);
  l.undo('ip');
  assert.ok(l.take('ip', 2, 60_000));
  now += 60_001;
  assert.ok(l.take('ip', 2, 60_000));
  assert.ok(l.take('other', 1, 60_000));
});

test('public page: visitor sees the form only; runs use Custom without shell or files; per-visitor and daily caps', async () => {
  fs.mkdirSync(path.dirname(path.join(process.env.DATA_DIR!, 'models', 'agent.json')), { recursive: true });
  fs.writeFileSync(path.join(process.env.DATA_DIR!, 'models', 'agent.json'), JSON.stringify({ models: [{ id: 'm1', label: 'Fake', provider: 'endpoint', baseUrl: 'http://127.0.0.1:1/v1', model: 'fake', tools: 'native' }] }));
  const a = store.saveApp(db, { recipe: recipe({ name: 'Public trip', prompt: 'SECRET PROMPT {{city}}' }), public: { on: true, model: 'm1', perIpPerHour: 2, runsPerDay: 3, spendPerDay: 1, web: false } });
  const view = await http.inject({ method: 'GET', url: `/a-api/${a.slug}` });
  assert.equal(view.statusCode, 200);
  assert.ok(!view.body.includes('SECRET PROMPT') && !view.body.includes('"model"') && !view.body.includes('web_search'), 'no prompt, model or tools');
  const cookieA = String(view.headers['set-cookie']).split(';')[0];
  const go = (c: string, ip: string, city = 'Nice') => http.inject({ method: 'POST', url: `/a-api/${a.slug}/run`, headers: { cookie: c, 'cf-connecting-ip': ip, origin: 'http://localhost:8080', host: 'localhost:8080' }, payload: { inputs: { city } } });
  const r1 = await go(cookieA, '1.1.1.1');
  assert.equal(r1.statusCode, 200, r1.body);
  const made = sessions.made[sessions.made.length - 1];
  assert.equal(made.o.agent, 'acp');
  assert.equal(made.o.acpAgent, 'console');
  assert.equal(made.o.model, 'm1');
  assert.equal(made.o.mode, 'ask');
  assert.equal(made.o.extra.memory, false);
  assert.ok(made.o.extra.capUsd > 0 && made.o.extra.capUsd <= 1, 'at most what the page may spend in a day');
  assert.equal(made.o.extra.assistant, undefined);
  assert.ok(made.o.cwd.startsWith(os.tmpdir()), 'a throwaway folder');
  assert.match(made.o.prompt, /submit_result/, 'what it needs to know comes with the message');
  // Its agent gets the switch that takes away shell, files and the user's servers.
  const add = await apps.spawn!({ agent: 'acp', acpAgent: 'console', key: made.key, cwd: made.o.cwd, runId: 'pub-run', resume: false, extra: made.o.extra }, deps);
  assert.deepEqual(add, { env: { HYDOR_PUBLIC_RUN: '1' } });
  const ctx: RunCtx = { runId: 'pub-run', key: made.key, agent: 'acp', acpAgent: 'console', cwd: made.o.cwd, deps };
  for (const t of ['web_search', 'read_page', 'remember', 'read_session', 'http_request', 'show_html']) assert.equal(apps.allowTool!(t, ctx), false, t);
  assert.equal(apps.allowTool!('submit_result', ctx), true);
  // One run at a time per visitor.
  assert.equal((await go(cookieA, '1.1.1.1')).statusCode, 429);
  await sessions.endFully(made.key, 'Nice, done.');
  // Another visitor cannot open it.
  const theirs = await http.inject({ method: 'GET', url: `/a-api/${a.slug}/run/${r1.json().run.id}`, headers: { cookie: 'naget_visitor=someone-else-entirely-1234' } });
  assert.equal(theirs.statusCode, 404);
  const mine = await http.inject({ method: 'GET', url: `/a-api/${a.slug}/run/${r1.json().run.id}`, headers: { cookie: cookieA } });
  assert.equal(mine.json().run.status, 'done');
  assert.equal(mine.json().run.key, undefined, 'no session for visitors');
  // Two an hour from one address.
  const r2 = await go(cookieA, '1.1.1.1');
  assert.equal(r2.statusCode, 200);
  await sessions.endFully(sessions.made[sessions.made.length - 1].key);
  const r3 = await go(cookieA, '1.1.1.1');
  assert.equal(r3.statusCode, 429);
  assert.match(r3.json().error, /in an hour/);
  // Three a day for the page, whoever asks.
  const r4 = await go('naget_visitor=visitor-number-two-abcdef', '2.2.2.2');
  assert.equal(r4.statusCode, 200);
  await sessions.endFully(sessions.made[sessions.made.length - 1].key);
  const r5 = await go('naget_visitor=visitor-number-three-abcde', '3.3.3.3');
  assert.equal(r5.statusCode, 429);
  assert.match(r5.json().error, /today/);
  // And what they may spend in a day.
  const b = store.saveApp(db, { recipe: recipe({ name: 'Costly' }), public: { on: true, model: 'm1', perIpPerHour: 50, runsPerDay: 50, spendPerDay: 0.5, web: true } });
  const spent = store.insertRun(db, { app: b.id, appName: 'Costly', recipe: b, source: 'public', inputs: {}, status: 'done' });
  store.updateRun(db, spent.id, { costUsd: 0.6 });
  const r6 = await http.inject({ method: 'POST', url: `/a-api/${b.slug}/run`, headers: { 'cf-connecting-ip': '4.4.4.4' }, payload: { inputs: { city: 'x' } } });
  assert.equal(r6.statusCode, 429);
  // A form from another site is refused; a closed page is not there.
  const cross = await http.inject({ method: 'POST', url: `/a-api/${b.slug}/run`, headers: { origin: 'https://evil.example', host: 'localhost' }, payload: { inputs: { city: 'x' } } });
  assert.equal(cross.statusCode, 403);
  store.saveApp(db, { id: b.id, recipe: b, public: { on: false } });
  assert.equal((await http.inject({ method: 'GET', url: `/a-api/${b.slug}` })).statusCode, 404);
});

test('public run in Custom: only a plan, the catalog and (with the web) its page reader stay', () => {
  assert.equal(publicRunOf(undefined), null);
  assert.deepEqual([...publicRunOf('1')!.tools].sort(), ['find_tools', 'todo_write']);
  assert.ok(publicRunOf('web')!.tools.has('web_fetch'));
  for (const t of ['bash', 'read_file', 'write_file', 'edit_file', 'multi_edit', 'list_dir', 'glob', 'grep', 'skill', 'apply_patch', 'bash_output', 'bash_kill']) assert.ok(!publicRunOf('web')!.tools.has(t), t);
  const p = publicRunPrompt({ tools: ['submit_result'], small: false });
  assert.ok(!p.includes(os.homedir()) && !p.includes(os.type()), 'nothing about this computer');
  assert.match(p, /cannot browse the web/);
});

// ---- CSV and runs over rows ----------------------------------------------------------------------------

test('CSV: quotes, separators, new lines in cells, BOM and CRLF', () => {
  assert.deepEqual(parseCsv('﻿city,note\r\nLisbon,"sunny, warm"\r\n"Porto","say ""hi""\nthere"\r\n\r\n'), [
    ['city', 'note'],
    ['Lisbon', 'sunny, warm'],
    ['Porto', 'say "hi"\nthere'],
  ]);
  assert.deepEqual(parseCsv('a;b\n1;2,5'), [['a', 'b'], ['1', '2,5']]);
  assert.deepEqual(parseCsv('a\tb\n1\t2'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('only'), [['only']]);
});

test('CSV out: escaped, formulas kept from running, round trip', () => {
  const rows = [['name', 'formula', 'n'], ['a "b", c', '=HYPERLINK("x")', -5], [true, null, '+1']];
  const out = toCsv(rows);
  assert.equal(out, 'name,formula,n\r\n"a ""b"", c","\'=HYPERLINK(""x"")",-5\r\nYes,,\'+1\r\n');
  assert.deepEqual(parseCsv(out), [['name', 'formula', 'n'], ['a "b", c', '\'=HYPERLINK("x")', '-5'], ['Yes', '', "'+1"]]);
});

test('rows: queued, two at a time, a bad row fails at once, each end starts the next; CSV of results', async () => {
  const a = store.saveApp(db, { recipe: recipe({ name: 'Rows app' }) });
  const before = sessions.made.length;
  const b = startBatch(db, { app: a.id, slug: a.slug, recipe: a, rows: [{ city: 'A' }, { city: '' }, { city: 'C', days: 'x' }, { city: 'D' }, { city: 'E' }, { city: 'F' }], concurrency: 2, name: 'cities.csv' });
  assert.equal(b.total, 6);
  await sleep(100);
  const runs = () => store.listRuns(db, { batch: b.id });
  // Rows 2 (no city) and 3 (days not a number) fail with the reason.
  assert.equal(runs().filter((r) => r.status === 'failed').length, 2);
  assert.match(runs().find((r) => r.row === 2)!.error!, /City: needed/);
  assert.match(runs().find((r) => r.row === 3)!.error!, /Days: should be a number/);
  const going = () => runs().filter((r) => ['starting', 'running', 'waiting'].includes(r.status));
  assert.equal(going().length, 2);
  assert.equal(runs().filter((r) => r.status === 'queued').length, 2);
  assert.equal(sessions.made.length - before, 2);
  // Each one ending starts the next.
  for (let i = 0; i < 4; i++) {
    const r = going()[0];
    store.updateRun(db, r.id, { result: { summary: `Plan ${r.row}`, days: [] } });
    sessions.end(r.key!, `Row ${r.row}`);
    await sleep(2300);
    assert.ok(going().length <= 2);
  }
  assert.equal(runs().filter((r) => r.status === 'done').length, 4);
  assert.equal(store.getBatch(db, b.id)!.status, 'done');
  const csv = parseCsv(batchCsv(db, b.id, a, (k) => `http://x/s/${k}`));
  assert.deepEqual(csv[0], ['Row', 'City', 'Days', 'Kids', 'Budget', 'Summary', 'Cost', 'Days (answer)', 'Status', 'Error', 'Cost (USD)', 'Session']);
  assert.equal(csv.length, 7);
  assert.equal(csv[1][5], 'Plan 1');
  assert.equal(csv[2][8], 'failed');
});

test('rows: stopping ends those waiting and interrupts those running', async () => {
  const a = store.saveApp(db, { recipe: recipe({ name: 'Stopped rows' }) });
  const b = startBatch(db, { app: a.id, slug: a.slug, recipe: a, rows: [{ city: 'A' }, { city: 'B' }, { city: 'C' }], concurrency: 1 });
  await sleep(100);
  const { stopBatch } = await import('./batch.ts');
  await stopBatch(db, b.id);
  await sleep(3000);
  const all = store.listRuns(db, { batch: b.id });
  assert.equal(all.filter((r) => r.status === 'stopped').length, 3, JSON.stringify(all.map((r) => r.status)));
  assert.equal(store.getBatch(db, b.id)!.status, 'stopped');
});

// ---- views -------------------------------------------------------------------------------------------------------

const VIEWED = {
  pages: [{ id: 'main', title: 'Main', blocks: [{ element: 'day', data: 'result.days', each: true }] }, { id: 'home', title: 'Home', on: 'app', blocks: [{ element: 'form' }] }],
  elements: { day: { html: '<p data-event="tick">{{plan}}</p>' } },
  events: { tick: [{ do: 'toggle', name: 'done.@key', keep: true }, { do: 'again', inputs: { days: '{{inputs.days|plus:1}}' } }] },
};

test('view: a run’s page has its app’s view and what it keeps; a kept value stays, null removes it, names and sizes are checked, and it goes with the run', async () => {
  const a = store.saveApp(db, { recipe: recipe({ name: 'Viewed', ui: VIEWED as any }) });
  const r = store.insertRun(db, { app: a.id, appName: a.name, recipe: a, source: 'web', inputs: { city: 'Lisbon', days: '3' }, status: 'done' });
  const page = (await http.inject({ method: 'GET', url: `/api/apps/runs/${r.id}` })).json();
  assert.deepEqual(page.recipe.ui.pages.map((p: { id: string }) => p.id), ['main', 'home']);
  assert.deepEqual(page.view, {});
  const keep = (name: unknown, value: unknown) => http.inject({ method: 'PUT', url: `/api/apps/runs/${r.id}/view`, payload: { name, value } });
  assert.deepEqual((await keep('done.3', true)).json().view, { done: { '3': true } });
  assert.deepEqual((await keep('picked', { day: 2 })).json().view, { done: { '3': true }, picked: { day: 2 } });
  assert.deepEqual((await http.inject({ method: 'GET', url: `/api/apps/runs/${r.id}` })).json().view, { done: { '3': true }, picked: { day: 2 } });
  assert.deepEqual((await keep('done.3', null)).json().view, { done: {}, picked: { day: 2 } });
  assert.equal((await keep('not a name!', 1)).statusCode, 400);
  assert.equal((await keep('big', 'x'.repeat(70_000))).statusCode, 413);
  // The app's own page keeps its own.
  assert.deepEqual((await http.inject({ method: 'PUT', url: `/api/apps/${a.id}/view`, payload: { name: 'filter', value: 'open' } })).json().view, { filter: 'open' });
  assert.deepEqual((await http.inject({ method: 'GET', url: `/api/apps/${a.id}` })).json().view, { filter: 'open' });
  // A run removed takes what it kept with it.
  await http.inject({ method: 'DELETE', url: `/api/apps/runs/${r.id}` });
  assert.deepEqual(store.getView(db, `run:${r.id}`), {});
});

test('view: a ready-made app’s run shows in its view as it is now; a run of another flow shows its plain answer', async () => {
  const tpl = TEMPLATES.find((t) => t.id === 'trip-planner')!;
  const old = cleanRecipe({ ...tpl, ui: undefined });
  const r = store.insertRun(db, { app: 'tpl:trip-planner', appName: tpl.name, recipe: old, source: 'web', inputs: { destination: 'Lisbon' }, status: 'done' });
  const page = (await http.inject({ method: 'GET', url: `/api/apps/runs/${r.id}` })).json();
  assert.ok(page.recipe.ui?.elements?.['day-card'], 'the ready-made view, though the run was made before it had one');
  assert.equal(page.recipe.steps, true);
  const a = store.saveApp(db, { recipe: recipe({ name: 'Flows', ui: VIEWED as any, flows: { other: { steps: [{ id: 's', do: 'model', instructions: 'x' }] } } as any }) });
  const f = store.insertRun(db, { app: a.id, appName: a.name, recipe: a, source: 'screen', inputs: {}, flow: 'other', status: 'done' });
  assert.equal((await http.inject({ method: 'GET', url: `/api/apps/runs/${f.id}` })).json().recipe.ui, undefined);
});

test('view: again with changed answers starts a new run with the others as they were, its files along; questions it does not have are refused', async () => {
  const a = store.saveApp(db, { recipe: recipe({ name: 'Again', fields: [...recipe().fields, { id: 'doc', label: 'Doc', type: 'file' }], prompt: 'Plan {{days}} days in {{city}} from {{doc}}' }) });
  const old = store.insertRun(db, { app: a.id, appName: a.name, recipe: a, source: 'web', inputs: { city: 'Porto', days: '2', kids: 'No', budget: '', doc: 'notes.txt' }, status: 'done' });
  // Its file, where the run kept it (the app works in the scratch folder).
  fs.mkdirSync(path.join(tmp, 'uploads'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'uploads', 'notes.txt'), 'see the river');
  const made = sessions.made.length;
  const res = await http.inject({ method: 'POST', url: `/api/apps/runs/${old.id}/again`, payload: { inputs: { days: '4' } } });
  assert.equal(res.statusCode, 200, res.body);
  const next = store.getRun(db, res.json().run.id)!;
  assert.deepEqual([next.inputs.city, next.inputs.days, next.inputs.doc], ['Porto', '4', 'notes.txt']);
  await sleep(100);
  assert.equal(sessions.made.length, made + 1, 'its session started');
  assert.match(sessions.made.at(-1)!.o.prompt, /Plan 4 days in Porto/);
  assert.equal((await http.inject({ method: 'POST', url: `/api/apps/runs/${old.id}/again`, payload: { inputs: { weather: 'sun' } } })).statusCode, 400);
  fs.rmSync(path.join(tmp, 'uploads', 'notes.txt'));
  const gone = await http.inject({ method: 'POST', url: `/api/apps/runs/${old.id}/again`, payload: { inputs: {} } });
  assert.equal(gone.statusCode, 409);
  assert.match(gone.json().error, /is gone/);
  for (const k of sessions.made.slice(made)) await sessions.interrupt(k.key);
});

test('view: a save checks its view and says what to fix; a public page has its run pages, with only what a click does on the page', async () => {
  const bad = (await http.inject({ method: 'POST', url: '/api/apps/check', payload: { recipe: recipe({ ui: { pages: [{ id: 'main', title: 'M', blocks: [{ element: 'nope' }] }] } as any }) } })).json();
  assert.match(bad.errors.join(' | '), /there is no element “nope”/);
  const saved = await http.inject({ method: 'POST', url: '/api/apps', payload: { recipe: { ...recipe({ name: 'Bad view' }), ui: { pages: [{ id: 'main', title: 'M', blocks: [{ element: 'nope' }] }] } } } });
  assert.equal(saved.statusCode, 400);
  fs.mkdirSync(path.join(process.env.DATA_DIR!, 'models'), { recursive: true });
  fs.writeFileSync(path.join(process.env.DATA_DIR!, 'models', 'agent.json'), JSON.stringify({ models: [{ id: 'm1', label: 'Fake', provider: 'endpoint', baseUrl: 'http://127.0.0.1:1/v1', model: 'fake', tools: 'native' }] }));
  const a = store.saveApp(db, { recipe: recipe({ name: 'Public view', ui: VIEWED as any }), public: { on: true, model: 'm1', perIpPerHour: 2, runsPerDay: 3, spendPerDay: 1, web: false } });
  const pub = (await http.inject({ method: 'GET', url: `/a-api/${a.slug}` })).json();
  assert.deepEqual(pub.app.ui.pages.map((p: { id: string }) => p.id), ['main']);
  assert.deepEqual(pub.app.ui.events, { tick: [{ do: 'toggle', name: 'done.@key' }] });
});

// ---- ready-made apps installed, and agents in sessions running the user's apps ---------------------------

const call = async (method: 'GET' | 'POST' | 'PUT', url: string, body?: unknown) => {
  const r = await http.inject({ method, url, ...(body !== undefined ? { payload: body as any } : {}) });
  return { status: r.statusCode, body: r.json() as any };
};

test('ready-made apps: installed from the start; one uninstalled leaves your apps and runs no more until installed again, its runs kept', async () => {
  let g = await call('GET', '/api/apps');
  assert.ok(g.body.templates.length >= 15 && g.body.templates.every((t: any) => t.installed === true && t.agents === true));
  assert.equal((await call('POST', '/api/apps/tpl:trip-planner/uninstall')).status, 200);
  g = await call('GET', '/api/apps');
  assert.equal(g.body.templates.find((t: any) => t.id === 'trip-planner').installed, false);
  assert.equal((await call('GET', '/api/apps/tpl:trip-planner')).body.installed, false);
  const refused = await call('POST', '/api/apps/tpl:trip-planner/runs', { inputs: { destination: 'Lisbon', start: '2027-05-03', days: '4' } });
  assert.equal(refused.status, 409);
  assert.match(refused.body.error, /not installed/);
  assert.ok(!usableApps(db).some((u) => u.app === 'tpl:trip-planner'), 'agents no longer get it');
  assert.equal((await call('POST', '/api/apps/tpl:trip-planner/install')).status, 200);
  assert.equal((await call('GET', '/api/apps/tpl:trip-planner')).body.installed, true);
  // Named by its id, or as tpl:<id> while an app of yours has that address (the tests' own Trip planner).
  assert.ok(usableApps(db).some((u) => u.app === 'tpl:trip-planner' && /^(tpl:)?trip-planner$/.test(u.ref)));
  assert.equal((await call('POST', '/api/apps/tpl:no-such/install')).status, 404);
});

test('agents in sessions: every installed app made for it, yours first; the switch turns one off and on; blocks and apps for their own page stay out', async () => {
  const mine = store.saveApp(db, { recipe: recipe({ name: 'Packing list', cwd: undefined }) });
  const page = store.saveApp(db, { recipe: recipe({ name: 'Dashboard', sessions: false }) });
  const block = store.saveApp(db, { recipe: recipe({ name: 'A block', block: true }) });
  assert.equal(madeForSessions(page), false);
  assert.equal(madeForSessions(block), false);
  let list = usableApps(db);
  assert.ok(list.some((u) => u.app === mine.id && u.own));
  assert.ok(!list.some((u) => u.app === page.id || u.app === block.id));
  assert.ok(!list.some((u) => TEMPLATES.find((t) => `tpl:${t.id}` === u.app)?.block), 'ready-made blocks stay out');
  assert.ok(list.findIndex((u) => u.app === mine.id) < list.findIndex((u) => !u.own), 'yours come first');
  const before = store.getApp(db, mine.id)!.updatedAt;
  let r = await call('PUT', `/api/apps/${mine.id}/agents`, { on: false });
  assert.deepEqual(r.body, { agents: false, made: true });
  assert.equal(store.getApp(db, mine.id)!.agents, false);
  assert.equal(store.getApp(db, mine.id)!.updatedAt, before, 'the switch does not move it up the list');
  assert.ok(!usableApps(db).some((u) => u.app === mine.id));
  r = await call('PUT', '/api/apps/tpl:news-digest/agents', { on: false });
  assert.equal(r.body.agents, false);
  assert.equal((await call('GET', '/api/apps/tpl:news-digest')).body.agents, false);
  assert.ok(!usableApps(db).some((u) => u.app === 'tpl:news-digest'));
  await call('PUT', '/api/apps/tpl:news-digest/agents', { on: true });
  await call('PUT', `/api/apps/${mine.id}/agents`, { on: true });
  list = usableApps(db);
  assert.ok(list.some((u) => u.app === 'tpl:news-digest') && list.some((u) => u.app === mine.id));
  assert.equal((await call('PUT', `/api/apps/${mine.id}/agents`, { on: 'yes' })).status, 400);
  // What every session is told: past ten apps, how many there are, find_apps for them, and those run most (yours first among those never run).
  const note = useNote(db)!;
  assert.match(note, /use_app/);
  assert.match(note, /There are \d+: when a request might be one of their jobs, call find_apps/);
  assert.ok(note.split('\n').filter((l) => l.startsWith('- ')).length <= 6, 'six at most');
  assert.match(note, /"(tpl:)?trip-planner": Trip planner \(ready-made\) — A day-by-day plan/, 'one run lately');
  // Those it does not name, find_apps finds.
  assert.equal((await findApps(db, usableApps(db), 'packing list')).found[0].u.app, mine.id);
  for (const a of [mine, page, block]) store.deleteApp(db, a.id);
});

test('what an app is, in plain terms: its questions (optional ones marked), what you get, how it works, whether agents may run it', () => {
  const trip = appSummary(TEMPLATES.find((t) => t.id === 'trip-planner')!);
  assert.deepEqual(trip.asks.slice(0, 3), [
    { label: 'Where to', optional: false },
    { label: 'First day', optional: false },
    { label: 'How many days', optional: true },
  ]);
  assert.ok(trip.inView && trip.gets.length >= 3);
  assert.ok(trip.how.some((h) => h.kind === 'tool' && h.tool === 'web_search') && trip.how.some((h) => h.kind === 'model') && trip.how.some((h) => h.kind === 'ask'));
  assert.ok(trip.steps > 5 && trip.sessions && !trip.ownPage);
  const one = appSummary(recipe());
  assert.deepEqual(one.how, [{ kind: 'one' }]);
  assert.deepEqual(one.gets, ['Summary', 'Cost', 'Days']);
  assert.equal(one.inView, false);
});

test('use_app: answers in the form’s terms; a file by its path, a text as a file; a path that is no file is asked for', () => {
  const fields = cleanRecipe({ fields: [
    { id: 'city', label: 'City', type: 'text', required: true },
    { id: 'kids', label: 'Kids', type: 'yesno' },
    { id: 'pace', label: 'Pace', type: 'choice', options: ['Relaxed', 'Packed'] },
    { id: 'notes', label: 'Notes', type: 'file' },
    { id: 'more', label: 'More', type: 'file' },
    { id: 'gone', label: 'Gone', type: 'file' },
  ] }).fields;
  fs.writeFileSync(path.join(tmp, 'notes.md'), '# Notes');
  const got = intake(fields, { City: 'Lisbon', kids: true, pace: 'relaxed', notes: 'notes.md', more: 'Line one\nline two', gone: '/no/such/file.pdf', extra: 1 }, tmp);
  assert.deepEqual(got.values, { city: 'Lisbon', kids: 'Yes', pace: 'Relaxed', notes: 'notes.md', more: 'more.txt' });
  assert.equal(Buffer.from(got.files.notes.data, 'base64').toString(), '# Notes');
  assert.equal(Buffer.from(got.files.more.data, 'base64').toString(), 'Line one\nline two');
  assert.deepEqual(got.unread, ['gone']);
  assert.deepEqual(got.unknown, ['extra']);
});

test('models from a provider: an OpenRouter model asks for OpenRouter’s key with the app’s keys and is added by itself; one for Ollama is refused until set up', async () => {
  const flow = (model: string) => ({ steps: [{ id: 'draw', title: 'Draw it', do: 'model' as const, instructions: 'Describe {{city}}', model }] });
  const pic = cleanRecipe({ ...recipe({ name: 'Postcard maker' }), prompt: '', flow: flow('openrouter/google/gemini-2.5-flash-image') });
  assert.deepEqual(providerModels(pic), [{ as: 'openrouter/google/gemini-2.5-flash-image', provider: 'openrouter', model: 'google/gemini-2.5-flash-image', label: 'gemini-2.5-flash-image' }]);
  // What it needs says so too, with a name of its own and a label.
  const named = cleanRecipe({ ...pic, requires: { models: [{ as: 'openrouter/google/gemini-2.5-flash-image', agent: 'custom', provider: 'openrouter', model: 'google/gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image' }] } });
  assert.equal(providerModels(named)[0].label, 'Gemini 2.5 Flash Image');
  assert.deepEqual(providerModels(recipe()), [], 'an app of Claude Code’s needs none');
  // Settings → Models as the apps see it: no OpenRouter key yet, no models.
  let key: string | undefined;
  const pinned: string[] = [];
  setModelsHere({
    agentModels: () => (key ? pinned.map((m) => ({ id: `openrouter/${m}`, label: m, provider: 'openrouter' as const, baseUrl: '', model: m, tools: 'native' as const })) : []),
    hasOpenRouterKey: () => !!key,
    configure: async (p: { openrouterKey?: string | null; pin?: string }) => {
      if (p.openrouterKey !== undefined) key = p.openrouterKey ?? undefined;
      if (p.pin && !pinned.includes(p.pin)) pinned.push(p.pin);
      return {} as never;
    },
  });
  try {
    assert.equal(modelStates(named)[0].state, 'key');
    const k = secretsOf(db, named).find((x) => x.name === 'OPENROUTER_API_KEY')!;
    assert.ok(k && !k.have && k.provider === 'openrouter' && k.url === 'https://openrouter.ai/keys');
    assert.match(k.help!, /Gemini 2\.5 Flash Image through OpenRouter/);
    assert.deepEqual(missingSecrets(db, named).map((x) => x.name), ['OPENROUTER_API_KEY']);
    assert.throws(() => needSecrets(db, named), (e: HttpError) => e.status === 409 && /OpenRouter API key/.test(e.message));
    // Given on its form or card: kept with Settings → Models, not in the vault.
    assert.deepEqual(saveAppSecrets(db, named, { OPENROUTER_API_KEY: 'sk-or-test' }), ['OPENROUTER_API_KEY']);
    assert.equal(key, 'sk-or-test');
    assert.equal(missingSecrets(db, named).length, 0);
    assert.equal(modelStates(named)[0].state, 'add', 'added when it first runs');
    assert.deepEqual(await addModels(named), ['Gemini 2.5 Flash Image']);
    assert.deepEqual(pinned, ['google/gemini-2.5-flash-image']);
    assert.equal(modelStates(named)[0].state, 'ready');
    needModels(named);
    // One for Ollama is set up by hand: a run is refused, saying where.
    const local = cleanRecipe({ ...pic, name: 'Local notes', flow: flow('ollama/qwen3:8b') });
    assert.equal(modelStates(local)[0].state, 'setup');
    assert.throws(() => needModels(local), (e: HttpError) => e.status === 409 && /Settings → Models: qwen3:8b \(pull it into Ollama\)/.test(e.message));
    assert.ok(!secretsOf(db, local).some((x) => x.name === 'OPENROUTER_API_KEY'), 'no OpenRouter key for it');
  } finally {
    setModelsHere(null);
  }
});

/** The session's own MCP context, as its tools see it. */
const sessionCtx = (key: string): RunCtx => ({ runId: `run-${key}`, key, agent: 'claude', cwd: tmp, deps });
const useTool = (key: string) => apps.tools!(sessionCtx(key)).find((t) => t.name === 'use_app')!;
const findTool = (key: string) => apps.tools!(sessionCtx(key)).find((t) => t.name === 'find_apps')!;

test('find_apps: the best fits for a few words (by words while search by meaning is off), plurals and word starts matching; yours lifted; at most k; none matched gives the apps by use', async () => {
  const weather = store.saveApp(db, { recipe: recipe({ name: 'Rain or shine', description: 'The forecast for the coming days at a place: rain, wind and temperature, as charts', category: 'Weather' }) });
  const chef = store.saveApp(db, { recipe: recipe({ name: 'Fridge chef', description: 'Recipe ideas from what is in your fridge, with the steps and timings', category: 'Food' }) });
  dropAppIndex();
  const list = usableApps(db);
  assert.equal(stem('recipes'), 'recipe');
  assert.equal(stem('matches'), 'match');
  assert.equal(stem('movies'), 'movie');
  assert.equal(stem('glass'), 'glass');
  let r = await findApps(db, list, 'weather forecast for the weekend');
  assert.ok(r.matched);
  assert.equal(r.found[0].u.app, weather.id, 'its kind and description count');
  r = await findApps(db, list, 'recipes for dinner from my fridge');
  assert.equal(r.found[0].u.app, chef.id, 'a plural finds the singular');
  assert.equal((await findApps(db, list, 'forecasting'))?.found[0]?.u.app, weather.id, 'a longer word finds its start');
  // Among the ready-made ones alone (other tests leave apps of their own named Trip planner).
  r = await findApps(db, list.filter((u) => !u.own), 'plan a trip itinerary day by day');
  assert.equal(r.found[0].u.app, 'tpl:trip-planner');
  r = await findApps(db, list, 'report', 3);
  assert.ok(r.found.length <= 3);
  r = await findApps(db, list, 'zzqx vvbn');
  assert.equal(r.matched, false, 'nothing matched');
  assert.equal(r.found.length, Math.min(20, list.length), 'the apps by use instead');
  // The name counts most: an app named for it ranks over one that only mentions it.
  assert.equal(byWords(list, 'fridge')[0].u.app, chef.id);
  // The tool: each candidate with what its form asks; an empty query is refused.
  const said = String(await findTool('claude:finder').run({ query: 'rain forecast' }, sessionCtx('claude:finder')));
  assert.match(said, /best first/);
  assert.match(said, /"rain-or-shine": Rain or shine — The forecast/);
  assert.match(JSON.stringify(await findTool('claude:finder').run({ query: ' ' }, sessionCtx('claude:finder'))), /isError/);
  for (const a of [weather, chef]) store.deleteApp(db, a.id);
  dropAppIndex();
});

test('a message one app clearly does: the agent hears which, with its form; a close call, a command or a word or two gets nothing; every app is named while there are not too many', async () => {
  dropAppIndex();
  // Among the ready-made ones (other tests leave apps of their own behind).
  const own = usableApps(db).filter((u) => u.own);
  for (const u of own) store.deleteApp(db, u.app);
  dropAppIndex();
  assert.equal(appForMessage(db, 'best upcoming games for switch 2')?.app, 'tpl:game-finder');
  assert.equal(appForMessage(db, 'plan a 4 day trip to Lisbon')?.app, 'tpl:trip-planner');
  assert.equal(appForMessage(db, 'write a cover letter for this job')?.app, 'tpl:cover-letter');
  // Words alone would take these for another app (the Weekly news digest, Gift ideas): too close to call, so nothing.
  assert.equal(appForMessage(db, "what's the weather in Athens this week"), null);
  assert.equal(appForMessage(db, 'recipe ideas with chicken and rice'), null);
  assert.equal(appForMessage(db, 'fix the bug in server/index.ts'), null);
  assert.equal(appForMessage(db, 'thanks!'), null);
  assert.equal(appForMessage(db, '/goal best upcoming games for switch 2'), null);
  const hint = appHint(db, 'best upcoming games for switch 2')!;
  assert.match(hint, /^This message looks like a job for one of the user's apps: "game-finder": Game finder \(ready-made\) — /);
  assert.match(hint, /Asks likes\?: long text, platform\?: Any \| PC/);
  assert.match(hint, /run it with use_app/);
  // The start-up note: the few run most with what they do, then the others by name.
  const note = useNote(db)!;
  assert.match(note, /see whether one of their \d+ apps does it/);
  assert.match(note, /The others: .*"game-finder" \(Game finder\)|"game-finder": Game finder/);
});

test('use_app: what the request lacks is asked on the app’s own card (optional ones may stay empty); it runs with a card in the conversation and the call gives its answer', async () => {
  const a = store.saveApp(db, { recipe: recipe({ name: 'City break' }) });
  const key = 'claude:asker-1';
  sessions.items.set(key, [{ kind: 'user', id: 'u1', seq: 0, text: 'Plan a city break' }]);
  sessions.cards = [];
  // The user gives the city on the card and leaves the budget empty.
  sessions.answerWith = (card) => ({ decision: 'accept', form: { city: 'Porto', days: '2', kids: 'No', budget: '' } });
  const tool = useTool(key);
  assert.ok(tool, 'every session gets use_app');
  // With many apps, use_app does not list them: find_apps gives each with what its form asks.
  assert.match(tool.description, /find_apps/);
  const found = String(await findTool(key).run({ query: 'city break weekend' }, sessionCtx(key)));
  assert.match(found, /"city-break": City break\. Asks city: text, days\?: number, kids\?: yes\/no, budget\?: text\./);
  const going = tool.run({ app: 'city-break', inputs: { days: 2 } }, sessionCtx(key));
  await sleep(150);
  const card = sessions.cards[0];
  assert.equal(card.title, 'City break');
  assert.equal(card.app.id, a.id);
  assert.deepEqual(card.app.given, [{ label: 'Days', value: '2' }]);
  assert.deepEqual(card.form.fields.map((f: any) => f.id), ['city', 'kids', 'budget'], 'the questions left: the one it needs and the optional ones');
  const run = store.listRuns(db, { app: a.id, limit: 5 }).find((r) => r.source === 'session')!;
  assert.ok(run, 'it runs once the card is answered');
  assert.equal(run.askedBy, key);
  assert.deepEqual(run.inputs, { city: 'Porto', days: '2', kids: 'No', budget: '' });
  const note = notesOf(db, key, 'app-run')[0];
  assert.deepEqual({ run: (note.data as any).run, anchor: note.anchor }, { run: run.id, anchor: 'u1' });
  // Its agent hands in the answer; the call returns it.
  await sleep(100);
  const done = store.getRun(db, run.id)!;
  saveResult(done.id, { summary: 'Two days in Porto', days: [{ day: 1, date: '2027-05-03', plan: 'Ribeira' }] });
  await sessions.endFully(done.key!);
  const said = String(await going);
  assert.match(said, /City break is done/);
  assert.match(said, /Two days in Porto/);
  assert.equal(store.getRun(db, run.id)!.told, true);
  // Closing the card runs nothing.
  sessions.answerWith = () => ({ decision: 'decline' });
  const closed = String(await useTool(key).run({ app: 'city-break', inputs: {} }, sessionCtx(key)));
  assert.match(closed, /closed City break's card without running it/);
  assert.equal(store.listRuns(db, { app: a.id, limit: 9 }).filter((r) => r.source === 'session').length, 1);
  sessions.answerWith = null;
  store.deleteApp(db, a.id);
});

test('use_app: everything given runs at once; a run that outlasts the call comes to the session as a message when it ends', async () => {
  const a = store.saveApp(db, { recipe: recipe({ name: 'Day trip' }) });
  const key = 'claude:asker-2';
  sessions.cards = [];
  const said = String(await useTool(key).run({ app: 'day-trip', inputs: { city: 'Sintra', days: 1 }, wait: 1 }, sessionCtx(key)));
  assert.equal(sessions.cards.length, 0, 'nothing to ask');
  assert.match(said, /still running/);
  const run = store.listRuns(db, { app: a.id, limit: 5 })[0];
  assert.equal(run.told, false);
  const before = sessions.sent.length;
  saveResult(run.id, { summary: 'Sintra in a day', days: [] });
  await sessions.endFully(store.getRun(db, run.id)!.key!);
  await sleep(100);
  const msg = sessions.sent.slice(before).find((m) => m.key === key);
  assert.ok(msg, 'the asking session hears of it');
  assert.match(msg!.text, /^\[Day trip finished\]/);
  assert.match(msg!.text, /Sintra in a day/);
  assert.equal(store.getRun(db, run.id)!.told, true);
  // Waiting for it again by its run gives the answer; another session's run is not this one's.
  assert.match(String(await useTool(key).run({ run: run.id }, sessionCtx(key))), /Day trip is done/);
  assert.match(JSON.stringify(await useTool('claude:other').run({ run: run.id }, sessionCtx('claude:other'))), /No run with that id/);
  store.deleteApp(db, a.id);
});

// A run whose session failed to start ends as failed, with the reason.
test('a session that cannot start fails the run with the reason', async () => {
  const create = sessions.create;
  sessions.create = async () => {
    throw new Error('Claude Code did not start');
  };
  const a = store.saveApp(db, { recipe: recipe({ name: 'Broken' }) });
  const r = startRun({ app: a.id, slug: a.slug, recipe: a, source: 'web', inputs: { city: 'X' } });
  await sleep(100);
  sessions.create = create;
  const after = store.getRun(db, r.id)!;
  assert.equal(after.status, 'failed');
  assert.match(after.error!, /did not start/);
});

test('an app that opens on its own page (Explore): its settings there are its form’s answers, kept; what its page keeps; Update every day is a daily task that runs it with them', async () => {
  const ex = TEMPLATES.find((t) => t.id === 'explore')!;
  assert.equal(ex.sessions, false, 'it opens on its own page');
  assert.ok(!madeForSessions(ex), 'agents do not run it in sessions');
  let r = (await http.inject({ method: 'GET', url: '/api/apps/tpl:explore' })).json();
  assert.deepEqual(r.home, { inputs: { sessions: '1000', more: '', skip: '' }, daily: { on: false, time: '07:00' } });
  assert.deepEqual(r.view, {});
  r = (await http.inject({ method: 'PUT', url: '/api/apps/tpl:explore/home', payload: { inputs: { sessions: '300', nope: 'x' } } })).json();
  assert.deepEqual(r.home.inputs, { sessions: '300', more: '', skip: '' }, 'only its questions are kept');
  assert.equal((await http.inject({ method: 'PUT', url: '/api/apps/tpl:explore/home', payload: { daily: { on: true } } })).statusCode, 503, 'not without scheduled tasks');
  assert.equal((await http.inject({ method: 'PUT', url: '/api/apps/tpl:explore/home', payload: { daily: { time: '7am' } } })).statusCode, 400);
  assert.equal((await http.inject({ method: 'PUT', url: '/api/apps/tpl:deep-research/home', payload: {} })).statusCode, 400, 'an app without a page of its own has no settings there');
  // What its page keeps (the stories read), edition after edition.
  r = (await http.inject({ method: 'PUT', url: '/api/apps/tpl:explore/view', payload: { name: 'read.s1abc', value: true } })).json();
  assert.deepEqual(r.view, { read: { s1abc: true } });
  assert.deepEqual((await http.inject({ method: 'GET', url: '/api/apps/tpl:explore' })).json().view, { read: { s1abc: true } });
  assert.equal((await http.inject({ method: 'PUT', url: '/api/apps/tpl:trip-planner/view', payload: { name: 'x', value: 1 } })).statusCode, 400);
  // With scheduled tasks: on makes the daily task with its answers, a new time or new answers change it, off removes it.
  const tasks: ScheduledTask[] = [];
  const sched = {
    list: () => tasks,
    save: (input: Partial<ScheduledTask>, o: { origin?: string } = {}) => {
      const old = tasks.find((t) => t.id === input.id);
      const t = { ...input, id: input.id ?? `task${tasks.length + 1}`, origin: old?.origin ?? o.origin, enabled: input.enabled !== false } as ScheduledTask;
      if (old) tasks.splice(tasks.indexOf(old), 1, t);
      else tasks.push(t);
      return t;
    },
    remove: (id: string) => {
      const i = tasks.findIndex((t) => t.id === id);
      if (i >= 0) tasks.splice(i, 1);
    },
  } as unknown as Scheduler;
  let h = saveHome(db, sched, 'tpl:explore', ex, { daily: { on: true } });
  assert.deepEqual(h.daily, { on: true, time: '07:00' });
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].origin, 'daily:tpl:explore');
  assert.deepEqual(tasks[0].schedule, { kind: 'daily', time: '07:00' });
  assert.deepEqual(tasks[0].app, { id: 'tpl:explore', inputs: { sessions: '300', more: '', skip: '' } });
  h = saveHome(db, sched, 'tpl:explore', ex, { daily: { time: '06:30' }, inputs: { more: 'Formula 1' } });
  assert.equal(tasks.length, 1, 'the same task, changed');
  assert.deepEqual(tasks[0].schedule, { kind: 'daily', time: '06:30' });
  assert.equal(tasks[0].app?.inputs.more, 'Formula 1');
  assert.deepEqual(h.daily, { on: true, time: '06:30' });
  h = saveHome(db, sched, 'tpl:explore', ex, { daily: { on: false } });
  assert.equal(tasks.length, 0, 'off removes it');
  assert.equal(h.daily.on, false);
  assert.equal(h.inputs.more, 'Formula 1', 'its answers stay');
  // A question it needs left empty, or a file each time: it cannot update by itself.
  const needs = { name: 'Needs', fields: [{ id: 'city', label: 'City', type: 'text', required: true }] } as unknown as AppRecipe;
  assert.throws(() => saveHome(db, sched, 'needs', needs, { daily: { on: true } }), /Fill in “City” first/);
  assert.equal(saveHome(db, sched, 'needs', needs, { inputs: { city: 'Lisbon' }, daily: { on: true } }).daily.on, true);
  const file = { name: 'File', fields: [{ id: 'doc', label: 'Document', type: 'file', required: true }] } as unknown as AppRecipe;
  assert.throws(() => saveHome(db, sched, 'file', file, { daily: { on: true } }), /cannot update by itself/);
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
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(process.exitCode ?? 0);
