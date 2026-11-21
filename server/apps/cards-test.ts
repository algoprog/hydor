// Script tests for cards in an app's answer (shared/app-cards.ts, the ui kind in shared/apps.ts): a card field's data
// checked against its UI's type, told to the agent with its type and an example, given by a model step's ui(<name>)
// output in a flow run end to end (a stand-in model), the run's JSON holding the card's data, and a CSV row, another
// agent and a chat's agent getting its text.
// Build and run with scratch folders:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/apps/cards-test.ts
//   DATA_DIR=/tmp/hydor-test-cards HYDOR_APPS_DIR=/tmp/hydor-test-cards-apps node dist/dev/cards-test.js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { answerSchema, checkAnswer, cleanAnswer, cleanRecipe, isActive, type AnswerField } from '../../shared/apps.ts';
import { cardFields, cardsAsText, cardText } from '../../shared/app-cards.ts';
import { answerUi } from '../../shared/answer-ui/index.ts';
import { uiBlocks, withoutUiBlocks } from '../../shared/answer-ui/blocks.ts';
import { cleanFlow } from '../../shared/app-manifest.ts';
import { HttpError } from '../auth.ts';
import { openDb } from '../db.ts';
import { Scheduler } from '../scheduler.ts';
import type { SessionManager } from '../sessions.ts';
import { registerFeatures } from '../features/registry.ts';
import type { Deps } from '../features/types.ts';
import { setHelperModel } from '../helper.ts';
import { AGENT_FILE } from '../models/config.ts';
import { batchCsv } from './batch.ts';
import { apps } from './index.ts';
import { fieldLine, runInstructions, startRuns, waitFor } from './runs.ts';
import * as store from './store.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/') || !process.env.HYDOR_APPS_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… and HYDOR_APPS_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-cards-test-'));
const db = openDb(path.join(tmp, 'test.db'));
store.ensureTables(db);
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

// ---- stand-ins -------------------------------------------------------------------------------------------

/** The session manager: nothing here starts a session (the flows have model steps only). */
class FakeSessions extends EventEmitter {
  async create() {
    throw new Error('no sessions in this test');
  }
  summary() {
    return null;
  }
  setFlags() {}
  liveSnapshot() {
    return { live: null, overlay: { items: [], patches: {}, approvals: [] } };
  }
}

/** A model server as Custom's models speak to theirs: answers from `model.answer`, keeps each call. */
const model = { calls: [] as { system: string; user: string }[], answer: (_system: string, _user: string, _n: number): string => '{}' };
const srv = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const b = JSON.parse(body || '{}');
    const system = String(b.messages?.find((m: any) => m.role === 'system')?.content ?? '');
    const user = String(b.messages?.find((m: any) => m.role === 'user')?.content ?? '');
    model.calls.push({ system, user });
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: model.answer(system, user, model.calls.length) }, finish_reason: 'stop' }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 120, completion_tokens: 30, cost: 0.001 } })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
});
await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
fs.mkdirSync(path.dirname(AGENT_FILE), { recursive: true });
fs.writeFileSync(AGENT_FILE, JSON.stringify({ models: [{ id: 'fake', label: 'Fake', provider: 'endpoint', baseUrl: `http://127.0.0.1:${(srv.address() as { port: number }).port}/v1`, model: 'fake-1', tools: 'native' }] }));

const sessions = new FakeSessions();
const http = Fastify();
await http.register(cookie);
http.setErrorHandler((err: Error, _req, reply) => {
  reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message });
});
const scheduler = new Scheduler(db, sessions as unknown as SessionManager);
const deps = { app: http, db, sessions: sessions as any, scheduler, models: null as any, broadcast: () => {}, toSubscribers: () => {}, publicBase: () => 'http://test.local' } as Deps;
apps.routes!(deps);
registerFeatures([], deps);
startRuns(deps);
await http.ready();
setHelperModel(db, 'fake');

const comparison = answerUi('comparison')!;
const card: AnswerField = { id: 'compare', label: 'Side by side', type: 'ui', ui: 'comparison', required: true };

// ---- the field ----------------------------------------------------------------------------------------------

test('a card field: its name as the catalog writes it, an unknown one kept as formatted text, A card among the kinds', () => {
  const [a, b, c] = cleanAnswer([
    { id: 'compare', label: 'Compare', type: 'ui', ui: 'Compare' },
    { id: 'trip', label: 'Trip', type: 'ui', ui: 'no-such-card' },
    { id: 'plain', label: 'Plain', type: 'text', ui: 'comparison' },
  ]);
  assert.deepEqual([a.type, a.ui], ['ui', 'comparison']);
  assert.deepEqual([b.type, b.ui], ['markdown', undefined]);
  assert.equal('ui' in c, false, 'only a card keeps a card’s name');
});

test('checkAnswer: a good card passes as it is (its JSON text too), a bad one says what to fix in words', () => {
  const good = checkAnswer([card], { compare: comparison.example });
  assert.ok(good.ok);
  assert.deepEqual(good.value.compare, comparison.example);
  const text = checkAnswer([card], { compare: JSON.stringify(comparison.example) });
  assert.ok(text.ok && (text.value.compare as any).items.length === 3);
  const bad = checkAnswer([card], { compare: { title: 'Phones', items: 'three of them' } });
  assert.ok(!bad.ok);
  assert.match(bad.errors[0], /^compare: its data does not fit the comparison card: .*items should be a list.*rows is missing/);
  assert.match(bad.errors[0], /its type is in your instructions/);
  assert.match((checkAnswer([card], { compare: 'a table of phones' }) as { errors: string[] }).errors[0], /compare: should be the comparison card's data: one JSON object/);
  // Needed: an empty object is no card; not needed, it is left empty.
  assert.match((checkAnswer([card], { compare: {} }) as { errors: string[] }).errors[0], /compare: missing \(a card\)/);
  assert.deepEqual(checkAnswer([{ ...card, required: undefined }], {}), { ok: true, value: { compare: null } });
  // A card that reads a spreadsheet is not offered in apps.
  const ref = checkAnswer([{ id: 'c', label: 'C', type: 'ui', ui: 'chart' }], { c: { from: { sheet: 'Shop' }, x: 'Month', y: 'Sales' } });
  assert.ok(!ref.ok && /holds its values itself/.test(ref.errors[0]));
});

test('what the agent is told: the card field in the list, then its type, a short example and that pictures must be real', () => {
  assert.match(fieldLine(card), /^- compare \(card: one JSON object, the comparison card's data \(its type below\), required\): Side by side$/);
  const told = runInstructions({ recipe: cleanRecipe({ name: 'Phones', prompt: 'Compare {{a}}', answer: [card] }), source: 'web', appName: 'Phones' });
  assert.ok(told.includes(comparison.shape.trim()), 'its type');
  assert.match(told, /compare: the comparison card \(Comparison table\)\. Its data:/);
  assert.match(told, /Example: \{"title":"E-readers/);
  assert.match(told, /Pictures \(image\) must be real: an address from a search, find_media or a page you read/);
  assert.equal((answerSchema([card]).properties as any).compare.type, 'object');
  // Without a card, nothing more.
  assert.doesNotMatch(runInstructions({ recipe: cleanRecipe({ name: 'P', prompt: 'x', answer: [{ id: 'a', label: 'A', type: 'text' }] }), source: 'web', appName: 'P' }), /card field/);
});

test('a step output ui(<name>): read as a card, its name checked', () => {
  const { flow, errors } = cleanFlow({ steps: [{ id: 'c', do: 'model', instructions: 'Compare', outputs: { compare: 'ui(compare)', trip: 'card(no-such)', none: 'ui' } }] });
  const outs = (flow!.steps[0] as any).outputs as AnswerField[];
  assert.deepEqual(outs.map((f) => [f.id, f.type, f.ui]), [['compare', 'ui', 'comparison']]);
  assert.ok(errors.some((e) => /there is no card called “no-such”/.test(e)), errors.join('\n'));
  assert.ok(errors.some((e) => /a card needs its name: ui\(comparison\)/.test(e)), errors.join('\n'));
});

test('saving an app: an unknown card is refused in words', async () => {
  const r = await http.inject({ method: 'POST', url: '/api/apps', payload: { recipe: { name: 'Bad card', prompt: 'x', answer: [{ id: 'c', label: 'C', type: 'ui', ui: 'nope' }] } } });
  assert.equal(r.statusCode, 400);
  assert.match(r.json().error, /Answer field c: there is no card called “nope”/);
  const none = await http.inject({ method: 'POST', url: '/api/apps', payload: { recipe: { name: 'No card', prompt: 'x', answer: [{ id: 'c', label: 'C', type: 'ui' }] } } });
  assert.match(none.json().error, /a card needs ui, the name of the card/);
});

// ---- a run ------------------------------------------------------------------------------------------------

test('a flow whose model step gives ui(comparison): asked again when it does not fit, then the run’s JSON holds the card', async () => {
  model.calls = [];
  // The first answer misses its rows; told what was wrong, the model gives the whole card.
  model.answer = (_s, _u, n) => (n === 1 ? JSON.stringify({ compare: { title: 'Phones', items: [{ name: 'A' }, { name: 'B' }] } }) : JSON.stringify({ compare: comparison.example }));
  const a = store.saveApp(db, {
    recipe: cleanRecipe({
      name: 'Compare phones',
      fields: [{ id: 'phones', label: 'Phones', type: 'text', required: true }],
      answer: [card],
      flow: { steps: [{ id: 'cmp', do: 'model', model: 'fake', instructions: 'Compare {{phones}}', outputs: { compare: 'ui(comparison)' } }] },
    }),
  });
  assert.equal(a.answer[0].ui, 'comparison');
  const { key } = store.createKey(db, a.id, 'Test');
  const body = (await http.inject({ method: 'POST', url: `/api/apps/${a.slug}/run`, headers: { authorization: `Bearer ${key}` }, payload: { inputs: { phones: 'Pixel, iPhone' }, wait: 30 } })).json();
  assert.equal(body.status, 'done', body.error);
  assert.deepEqual(body.result, { compare: comparison.example }, 'the API gives the card’s data as JSON');
  assert.equal(model.calls.length, 2);
  assert.ok(model.calls[0].system.includes(comparison.shape.trim()), 'the model is told the card’s type');
  assert.match(model.calls[1].user, /Your last answer did not fit:\n- compare: its data does not fit the comparison card: rows is missing/);
  // Its page's JSON too.
  const page = (await http.inject({ method: 'GET', url: `/api/apps/runs/${body.run}` })).json();
  assert.deepEqual(page.run.result.compare, comparison.example);
  const r = await waitFor(body.run, 1000);
  assert.ok(r && !isActive(r.status));
});

test('a CSV row gives a card’s text, and agents read it as Markdown', () => {
  const recipe = cleanRecipe({ name: 'Rows', prompt: 'Compare {{phones}}', fields: [{ id: 'phones', label: 'Phones', type: 'text' }], answer: [{ id: 'pick', label: 'Pick', type: 'text' }, card] });
  const app = store.saveApp(db, { recipe });
  const batch = store.insertBatch(db, { app: app.id, total: 1, concurrency: 1, name: 'rows.csv' });
  const run = store.insertRun(db, { app: app.id, appName: app.name, recipe, source: 'batch', inputs: { phones: 'e-readers' }, status: 'done', batch, row: 1 });
  store.updateRun(db, run.id, { result: { pick: 'Kobo', compare: comparison.example } });
  const csv = batchCsv(db, batch, recipe, (k) => k);
  const head = csv.split('\r\n')[0];
  assert.equal(head, 'Row,Phones,Pick,Side by side,Status,Error,Cost (USD),Session');
  assert.ok(csv.includes(JSON.stringify(cardText('comparison', comparison.example)).slice(1, 40)), 'the card’s text');
  assert.ok(csv.includes('E-readers for reading in bed'), 'its title');
  assert.ok(!csv.includes('"items"'), 'not its JSON');
  const read = cardsAsText(recipe.answer, { pick: 'Kobo', compare: comparison.example })!;
  assert.equal(read.pick, 'Kobo');
  assert.match(String(read.compare), /^\*\*E-readers for reading in bed and on the beach\*\*/);
  assert.match(String(read.compare), /\| Kindle Paperwhite \|/);
});

test('a reply’s cards: read as blocks with their places, the words left around them, and answer fields made of them', () => {
  const reply = `Here they are.\n\n\`\`\`ui compare\n${JSON.stringify(comparison.example)}\n\`\`\`\n\nAnd a second look:\n\n\`\`\`ui compare\n{"items":[{"name":"A"}],"rows":[]}\n\`\`\`\n\nPick the Libra.`;
  const blocks = uiBlocks(reply);
  assert.deepEqual(blocks.map((b) => b.name), ['compare', 'compare']);
  assert.ok(reply.slice(blocks[0].start, blocks[0].end).startsWith('```ui compare'));
  assert.equal(withoutUiBlocks(reply), 'Here they are.\n\nAnd a second look:\n\nPick the Libra.');
  const fields = cardFields(blocks.map((b) => ({ name: b.name, data: JSON.parse(b.body) })));
  assert.deepEqual(fields.map((f) => [f.id, f.type, f.ui, f.label]), [
    ['compare', 'ui', 'comparison', 'E-readers for reading in bed and on the beach'],
    ['compare_2', 'ui', 'comparison', 'Comparison table'],
  ]);
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
fs.rmSync(process.env.HYDOR_APPS_DIR!, { recursive: true, force: true });
process.exit(process.exitCode ?? 0);
