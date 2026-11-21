// Script tests for an app drafted from a turn of a session (draft.ts: Do this again…, Save as an app), with a stand-in
// helper model: the person's corrections reach the task, the reply's cards become card fields (its words beside them
// one more), the request comes back in pieces that join to it exactly, this request's answers are the first example and
// pass the form's checks, and a confidential session is still refused.
// Build and run with scratch folders:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/apps/draft-test.ts
//   DATA_DIR=/tmp/hydor-test-draft HYDOR_APPS_DIR=/tmp/hydor-test-draft-apps node dist/dev/draft-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { checkInputs } from '../../shared/apps.ts';
import { answerUi } from '../../shared/answer-ui/index.ts';
import { readRule } from '../../shared/app-manifest.ts';
import { HttpError } from '../auth.ts';
import { openDb } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { setHelperModel } from '../helper.ts';
import { AGENT_FILE } from '../models/config.ts';
import { draftFromSession } from './draft.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-draft-test-'));
const db = openDb(path.join(tmp, 'test.db'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

// ---- stand-ins -------------------------------------------------------------------------------------------

/** The helper model, as one of Custom's models on a server of its own: answers from `model.answer`, keeps each call. */
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
setHelperModel(db, 'fake');

const comparison = answerUi('comparison')!;
const card = (data: unknown) => `\`\`\`ui compare\n${JSON.stringify(data)}\n\`\`\``;
const euros = { ...comparison.example, rows: [{ label: 'Price', values: [150, 120, 205], prefix: '€', best: 'low' }] };

/** A session: an earlier task, then a comparison, a correction and the comparison again. */
const REQUEST = 'Compare the Kindle Paperwhite and the Kobo Clara BW for reading in bed, with prices.';
const items: any[] = [
  { kind: 'user', id: 'u0', seq: 0, text: 'Plan a weekend in Lisbon' },
  { kind: 'assistant', id: 'a0', seq: 1, text: 'Here is a plan.' },
  { kind: 'turn', id: 't0', seq: 2, status: 'completed' },
  { kind: 'user', id: 'u1', seq: 3, text: REQUEST },
  { kind: 'tool', id: 'x1', seq: 4, tool: { id: 'x1', name: 'mcp__hydor__web_search', input: { query: 'Kindle Paperwhite vs Kobo Clara BW' }, status: 'done' } },
  { kind: 'assistant', id: 'a1', seq: 5, text: `Here they are.\n\n${card(comparison.example)}` },
  { kind: 'turn', id: 't1', seq: 6, status: 'completed' },
  { kind: 'user', id: 'n1', seq: 7, meta: 'note', text: 'A note the app put in' },
  { kind: 'user', id: 'u2', seq: 8, text: 'in euros please' },
  { kind: 'assistant', id: 'a2', seq: 9, text: `Prices in euros now.\n\n${card(euros)}\n\nThe Clara is the lightest to hold in one hand.\nThe Libra has page-turn buttons.\nBoth last weeks on a charge.` },
  { kind: 'turn', id: 't2', seq: 10, status: 'completed' },
];

const summaries: Record<string, any> = {
  'claude:session-1': { key: 'claude:session-1', agent: 'claude', title: 'E-readers', extra: {} },
  'claude:secret-1': { key: 'claude:secret-1', agent: 'claude', title: 'Secret', extra: { confidential: true } },
};
const sessions = { summary: (k: string) => summaries[k] ?? null, timeline: async () => ({ parser: { items } }) };
const deps = { db, sessions } as unknown as Deps;

/** The helper's draft: the request is message 2 (of the Lisbon trip, the comparison, the correction). */
const helperSays = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    name: 'Compare e-readers',
    description: 'Compares two e-readers side by side.',
    icon: 'scale',
    color: 'teal',
    request: 2,
    fields: [
      { id: 'first', label: 'First e-reader', type: 'text', required: true },
      { id: 'second', label: 'Second e-reader', type: 'text', required: true },
      { id: 'for_what', label: 'For what', type: 'text' },
    ],
    prompt: 'Compare the {{first}} and the {{second}}{{#for_what}} for {{for_what}}{{/for_what}}, with prices.',
    answer: [{ id: 'verdict', label: 'Verdict', type: 'text' }],
    parts: [{ text: 'Compare the ' }, { field: 'first', text: 'Kindle Paperwhite' }, { text: ' and the ' }, { field: 'second', text: 'Kobo Clara BW' }, { text: ' for ' }, { field: 'for_what', text: 'reading in bed' }, { text: ', with prices.' }],
    example: { first: 'Kindle Paperwhite', second: 'Kobo Clara BW', for_what: 'reading in bed' },
    ...over,
  });

// ---- the draft --------------------------------------------------------------------------------------------

test('the helper reads the person’s messages up to the reply (not the app’s notes), the reply with its card, and the calls', async () => {
  model.calls = [];
  model.answer = () => helperSays();
  await draftFromSession(deps, 'claude:session-1', 9);
  const { system, user } = model.calls[0];
  assert.match(user, /<message n="1">\nPlan a weekend in Lisbon\n<\/message>\n<message n="2">\nCompare the Kindle/);
  assert.match(user, /<message n="3">\nin euros please\n<\/message>/);
  assert.doesNotMatch(user, /A note the app put in/);
  assert.match(user, /```ui compare\n\{"title":"E-readers/);
  assert.match(user, /1\. web_search \{"query":"Kindle Paperwhite vs Kobo Clara BW"\}/);
  assert.match(system, /- compare: the comparison card \(“E-readers for reading in bed and on the beach”\)/);
  assert.match(system, /- summary: markdown: the words beside the cards/);
  assert.match(system, /standing instructions, never as questions of the form/);
});

test('corrections reach the task; the reply’s cards and its words become the answer', async () => {
  model.answer = () => helperSays();
  const { recipe } = await draftFromSession(deps, 'claude:session-1', 9);
  assert.match(recipe.prompt, /^Compare the \{\{first\}\} and the \{\{second\}\}/);
  assert.match(recipe.prompt, /As the person asked along the way:\n- in euros please$/);
  assert.deepEqual(
    recipe.answer.map((f) => [f.id, f.type, f.ui, f.required]),
    [
      ['compare', 'ui', 'comparison', true],
      ['summary', 'markdown', undefined, undefined],
    ],
  );
  assert.equal(recipe.answer[0].label, 'E-readers for reading in bed and on the beach');
  // A correction the helper worked in is not added again.
  model.answer = () => helperSays({ prompt: 'Compare the {{first}} and the {{second}}, with prices in euros.' });
  assert.equal((await draftFromSession(deps, 'claude:session-1', 9)).recipe.prompt, 'Compare the {{first}} and the {{second}}, with prices in euros.');
});

test('the request in pieces: they join to it exactly, each question’s words marked; else found from the example', async () => {
  model.answer = () => helperSays();
  const { parts } = await draftFromSession(deps, 'claude:session-1', 9);
  assert.equal(parts!.map((p) => p.text).join(''), REQUEST);
  assert.deepEqual(parts!.filter((p) => p.field).map((p) => [p.field, p.text]), [
    ['first', 'Kindle Paperwhite'],
    ['second', 'Kobo Clara BW'],
    ['for_what', 'reading in bed'],
  ]);
  // Pieces that do not give the request back (a word changed, a field it lacks) are made again from the example's words.
  model.answer = () => helperSays({ parts: [{ text: 'Compare the ' }, { field: 'first', text: 'Kindle' }, { text: ' and the Kobo.' }, { field: 'nope', text: 'x' }] });
  const again = (await draftFromSession(deps, 'claude:session-1', 9)).parts!;
  assert.equal(again.map((p) => p.text).join(''), REQUEST);
  assert.deepEqual(again.filter((p) => p.field).map((p) => p.field), ['first', 'second', 'for_what']);
});

test('the session is its first example: this request’s answers, which pass the form’s checks, and checks from the reply', async () => {
  // A number the form asks, given as words: left out rather than failing the form.
  model.answer = () => helperSays({ fields: [...JSON.parse(helperSays()).fields, { id: 'budget', label: 'Budget', type: 'number' }], example: { first: 'Kindle Paperwhite', second: 'Kobo Clara BW', budget: 'not much' } });
  const { recipe } = await draftFromSession(deps, 'claude:session-1', 9);
  const ex = recipe.examples![0];
  assert.equal(ex.name, 'From the session');
  assert.deepEqual(ex.inputs, { first: 'Kindle Paperwhite', second: 'Kobo Clara BW', for_what: 'reading in bed' }, 'for_what from its words in the request');
  assert.deepEqual(checkInputs(recipe.fields, ex.inputs).errors, []);
  assert.deepEqual(ex.checks, ['{{answer.compare}} is not empty', '{{answer.compare.items[2]}} is not empty']);
  for (const c of ex.checks!) assert.ok(!('error' in readRule(c)), c);
});

test('the turn: an earlier reply drafts from its own turn; none, the latest; one not there is refused', async () => {
  model.calls = [];
  model.answer = () => helperSays({ request: 2 });
  const { recipe } = await draftFromSession(deps, 'claude:session-1', 5);
  assert.doesNotMatch(model.calls[0].user, /in euros/, 'later messages are not read');
  assert.doesNotMatch(recipe.prompt, /along the way/);
  assert.deepEqual(recipe.answer.map((f) => f.id), ['compare'], 'a short reply beside the card adds no words field');
  model.calls = [];
  await draftFromSession(deps, 'claude:session-1');
  assert.match(model.calls[0].user, /in euros please/);
  await assert.rejects(draftFromSession(deps, 'claude:session-1', 4), (e: unknown) => e instanceof HttpError && e.status === 404);
});

test('without cards the helper’s answer fields stay; without a helper, the request in one field', async () => {
  const plain = [
    { kind: 'user', id: 'u', seq: 0, text: 'Summarise this week’s AI news' },
    { kind: 'assistant', id: 'a', seq: 1, text: 'Three things happened.' },
  ];
  const one = { ...deps, sessions: { summary: () => summaries['claude:session-1'], timeline: async () => ({ parser: { items: plain } }) } } as unknown as Deps;
  model.answer = () => helperSays({ request: 1, fields: [], prompt: 'Summarise this week’s AI news', parts: [{ text: 'Summarise this week’s AI news' }], example: {} });
  const { recipe } = await draftFromSession(one, 'claude:session-1');
  assert.deepEqual(recipe.answer.map((f) => f.id), ['verdict']);
  // An answer that is no JSON is asked for again: a small model slips now and then, and the next answer holds.
  let asked = 0;
  model.answer = () => (++asked === 1 ? 'Here you go: {"name": "Half an ans' : helperSays({ request: 1, fields: [], prompt: 'Summarise this week’s AI news', parts: [{ text: 'Summarise this week’s AI news' }], example: {} }));
  const second = await draftFromSession(one, 'claude:session-1');
  assert.equal(asked, 2);
  assert.equal(second.recipe.prompt, 'Summarise this week’s AI news');
  assert.equal(second.note, undefined);
  // Three answers that are no JSON: the plain draft, the request as it was.
  asked = 0;
  model.answer = () => (asked++, 'no JSON here');
  const fallback = await draftFromSession(one, 'claude:session-1');
  assert.equal(asked, 3);
  assert.equal(fallback.recipe.prompt, '{{request}}');
  assert.equal(fallback.recipe.fields[0].default, 'Summarise this week’s AI news');
  assert.match(fallback.note!, /could not draft it/);
});

test('a confidential session is still refused', async () => {
  await assert.rejects(draftFromSession(deps, 'claude:secret-1', 9), (e: unknown) => e instanceof HttpError && e.status === 409);
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
process.exit(process.exitCode ?? 0);
