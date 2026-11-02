// Script tests for Apps: filling the prompt, the form's checks, the answer fields' schema and
// submit_result, follow-ups that refine a result, API keys, rate limits and the public page's caps
// (through its routes, with a stand-in for the session manager), and CSV in and out with runs over rows.
// Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/apps/apps-test.ts
//   DATA_DIR=/tmp/naget-test-apps-unit node dist/dev/apps-test.js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import type { AppRecipe } from '../../shared/apps.ts';
import { answerSchema, checkAnswer, checkInputs, cleanRecipe, fillTemplate, parseCsv, placeholders, toCsv } from '../../shared/apps.ts';
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

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'naget-apps-test-'));
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

test('templates: ten, each prompt fills with no leftover field placeholders, and uses its needed fields', () => {
  assert.equal(TEMPLATES.length, 10);
  for (const t of TEMPLATES) {
    const values = Object.fromEntries(t.fields.map((f) => [f.id, f.type === 'yesno' ? 'Yes' : `[${f.id}]`]));
    const out = fillTemplate(t.prompt, values, { known: t.fields.map((f) => f.id) });
    for (const f of t.fields) assert.ok(!out.includes(`{{${f.id}}}`), `${t.id}: {{${f.id}}} left over`);
    for (const f of t.fields.filter((x) => x.required)) assert.ok(placeholders(t.prompt).includes(f.id), `${t.id}: ${f.id} unused`);
    assert.ok(t.answer.length >= 2, `${t.id}: answer fields`);
    assert.ok(t.description.length > 30 && t.prompt.length > 300, `${t.id}: written out`);
    assert.deepEqual(cleanRecipe(t).fields, t.fields, `${t.id}: tidy as written`);
  }
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
  assert.deepEqual(apps.tools!({ ...ctx, runId: 'other', key: 'claude:someone-else' }).map((t) => t.name), ['app_get', 'app_save', 'app_try', 'app_screen', 'app_data']);
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
const handedIn = () => ({ kind: 'tool', id: `t-${Math.random().toString(36).slice(2, 8)}`, seq: 0, tool: { name: 'mcp__naget-agent__submit_result', category: 'other', title: 'submit_result', status: 'ok' } });

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
  assert.deepEqual(add, { env: { NAGET_AGENT_PUBLIC_RUN: '1' } });
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
