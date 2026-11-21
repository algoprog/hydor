// Script tests for About you (shared/app-me.ts, server/apps/me.ts) and the language runs write in: what is worked out
// (the country from the time zone, units and currency from the country, the language from the app's), the record's
// routes, questions that start from it (from) or from their last answer (remember) through checkInputs, the API, the
// form and use_app, {{me.…}} and {{language}} in a flow and in a one-task prompt (none of About you for a public run),
// the line on the language only with language: "person" and not in English, and ctx.locale in a code step. With
// stand-ins for the session manager and a model server, as flow-test.ts has them.
// Build and run with scratch folders:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/apps/me-test.ts
//   DATA_DIR=/tmp/hydor-test-me HYDOR_APPS_DIR=/tmp/hydor-test-me-apps node dist/dev/me-test.js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { checkInputs, cleanFields, cleanRecipe, fillTemplate, isActive, placeholders, TASK_VALUES } from '../../shared/apps.ts';
import { changeMe, cleanMe, countryOfTimezone, currencyOfCountry, fromField, langOf, languageLine, languageName, meOf, meVars, startFrom, unitsOfCountry } from '../../shared/app-me.ts';
import { checkFlow, lookup } from '../../shared/app-manifest.ts';
import { HttpError } from '../auth.ts';
import { kvSet, openDb } from '../db.ts';
import type { SessionManager } from '../sessions.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { setHelperModel } from '../helper.ts';
import { AGENT_FILE } from '../models/config.ts';
import { sandboxAvailable } from '../agent/sandbox.ts';
import { Scheduler } from '../scheduler.ts';
import { allowApp } from './allowed.ts';
import { apps } from './index.ts';
import { lastAnswers } from './me.ts';
import { startRun, startRuns, waitFor } from './runs.ts';
import * as store from './store.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/') || !process.env.HYDOR_APPS_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… and HYDOR_APPS_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-me-test-'));
const db = openDb(path.join(tmp, 'test.db'));
store.ensureTables(db);
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- stand-ins -------------------------------------------------------------------------------------------

/** The session manager: sessions start at once and stay at work; their first message is kept. */
class FakeSessions extends EventEmitter {
  made: { key: string; o: any }[] = [];
  status = new Map<string, string>();
  cards: any[] = [];
  answerWith: ((card: any) => any) | null = null;
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
  enqueue() {}
  adapterByRun() {
    return { ask: async (card: any) => (this.cards.push(card), this.answerWith ? this.answerWith(card) : null) } as any;
  }
}

/** A model server as Custom's models speak to theirs: answers from `model.answer`, keeps each call. */
const model = { calls: [] as { system: string; user: string }[], answer: (): string => '{}' };
const srv = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const b = JSON.parse(body || '{}');
    const system = String(b.messages?.find((m: any) => m.role === 'system')?.content ?? '');
    const user = String(b.messages?.find((m: any) => m.role === 'user')?.content ?? '');
    model.calls.push({ system, user });
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: model.answer() }, finish_reason: 'stop' }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.0001 } })}\n\n`);
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
startRuns(deps);
await http.ready();
setHelperModel(db, 'fake');

const call = async (method: 'GET' | 'PUT' | 'POST', url: string, payload?: unknown) => {
  const r = await http.inject({ method, url, ...(payload !== undefined ? { payload: payload as any } : {}) });
  return { status: r.statusCode, body: r.json() as any };
};

/** Where the person is: Athens's time zone, the app used in Greek last. */
kvSet(db, 'user.tz', 'Europe/Athens');
kvSet(db, 'ui.language', 'el');

async function ended(id: string, ms = 20_000) {
  const r = await waitFor(id, ms);
  assert.ok(r && !isActive(r.status), `run ${id} ended (it is ${r?.status})`);
  return r!;
}

// ---- what is worked out -------------------------------------------------------------------------------------

test('worked out: the country from the time zone (older names too), currency and units from the country, a language by its name', () => {
  assert.equal(countryOfTimezone('Europe/Athens'), 'GR');
  assert.equal(countryOfTimezone('Asia/Calcutta'), 'IN', 'an older name a browser still gives');
  assert.equal(countryOfTimezone('America/Indiana/Indianapolis'), 'US');
  assert.equal(countryOfTimezone('Etc/UTC'), undefined);
  assert.equal(countryOfTimezone(undefined), undefined);
  assert.equal(currencyOfCountry('GR'), 'EUR');
  assert.equal(currencyOfCountry('jp'), 'JPY');
  assert.equal(currencyOfCountry('GB'), 'GBP');
  assert.equal(currencyOfCountry('ZZ'), undefined);
  assert.equal(unitsOfCountry('US'), 'imperial');
  assert.equal(unitsOfCountry('GR'), 'metric');
  assert.equal(unitsOfCountry(undefined), undefined);
  assert.equal(languageName('el'), 'Greek');
  assert.equal(languageName('pt'), 'Portuguese (Brazil)', 'the app’s own name for its Portuguese');
  assert.equal(languageName('it'), 'Italian');
  assert.equal(languageName('nonsense!'), 'English');
  assert.equal(langOf('Greek'), 'el');
  assert.equal(langOf('Ελληνικά'), 'el');
  assert.equal(langOf('pt_br'), 'pt-BR');
  assert.equal(langOf('Klingon please'), undefined);
});

test('the record: only its fields, each within bounds; a change touches only what it names, null clears; meOf fills what it can and says from where', () => {
  const me = cleanMe({ home: '  Thessaloniki,   Greece ', units: 'Imperial', currency: 'eur', household: '3', services: 'Netflix, Disney+, netflix', author: 'Ada Lovelace', other: 'x', country: 'Germany' });
  assert.deepEqual(me, { home: 'Thessaloniki, Greece', units: 'imperial', currency: 'EUR', household: 3, services: ['Netflix', 'Disney+'], author: { name: 'Ada Lovelace' } }, 'a country is its two letters, never a name cut short');
  assert.deepEqual(cleanMe({ country: 'gr', currency: 'euros', household: 0, language: 'Greek' }), { country: 'GR', language: 'el' });
  const next = changeMe(me, { units: null, diet: 'vegetarian', author: { name: 'Ada Lovelace', id: '0000-0002-1825-0097' } });
  assert.equal(next.units, undefined);
  assert.equal(next.diet, 'vegetarian');
  assert.equal(next.home, 'Thessaloniki, Greece', 'what it does not name stays');
  assert.equal(next.author?.id, '0000-0002-1825-0097');
  const { values, derived } = meOf({ home: 'Athens' }, { timezone: 'Europe/Athens', lastLanguage: 'el' });
  assert.deepEqual([values.country, values.units, values.currency, values.language], ['GR', 'metric', 'EUR', 'el']);
  assert.deepEqual(derived, { country: 'timezone', units: 'country', currency: 'country', language: 'app' });
  // What is set wins, and what follows from it follows it.
  const set = meOf({ country: 'US', language: 'en' }, { timezone: 'Europe/Athens', lastLanguage: 'el' });
  assert.deepEqual([set.values.country, set.values.units, set.values.currency, set.values.language], ['US', 'imperial', 'USD', 'en']);
  assert.deepEqual(set.derived, { units: 'country', currency: 'country' });
  // {{me.…}}: lists as lists, empty when there is nothing.
  const v = meVars({ services: ['Netflix'], author: { name: 'Ada', id: 'A123' } });
  assert.deepEqual([v.services, v.teams, v.author, v.author_id, v.home], [['Netflix'], [], 'Ada', 'A123', '']);
});

test('the line on the language: none in English; names the language and what stays as written', () => {
  assert.equal(languageLine('en'), '');
  assert.equal(languageLine('en-GB'), '');
  assert.equal(languageLine(undefined), '');
  assert.match(languageLine('el'), /in Greek\. Keep the names of fields, the choices you were given, codes and numbers exactly as they are written/);
});

// ---- the form ---------------------------------------------------------------------------------------------

test('a question: from names a field of About you (not the language, not for a file), remember is for what it has none; one or the other', () => {
  const f = cleanFields([
    { id: 'units', label: 'Units', type: 'choice', options: ['Metric', 'Imperial'], from: 'me.units' },
    { id: 'lang', label: 'Language', type: 'text', from: 'me.language' },
    { id: 'pdf', label: 'PDF', type: 'file', from: 'me.home', remember: true },
    { id: 'style', label: 'Style', type: 'text', remember: true },
    { id: 'both', label: 'Both', type: 'text', from: 'me.diet', remember: true },
    { id: 'bad', label: 'Bad', type: 'text', from: 'units' },
  ]);
  assert.deepEqual(
    f.map((x) => [x.id, x.from, x.remember]),
    [
      ['units', 'me.units', undefined],
      ['lang', undefined, undefined],
      ['pdf', undefined, undefined],
      ['style', undefined, true],
      ['both', 'me.diet', undefined],
      ['bad', undefined, undefined],
    ],
  );
  assert.equal(fromField('me.services'), 'services');
  assert.equal(fromField('me.language'), undefined);
  // What a question takes from the record: a choice as its option, several as those it has, a list as a line.
  const me = { units: 'metric' as const, services: ['Netflix', 'Mubi'], household: 2, author: { name: 'Ada' } };
  assert.equal(startFrom({ type: 'choice', options: ['Metric', 'Imperial'] }, 'units', me), 'Metric');
  assert.equal(startFrom({ type: 'choice', options: ['°C', '°F'] }, 'units', me), undefined, 'nothing it can take');
  assert.equal(startFrom({ type: 'choice', multi: true, options: ['Netflix', 'Disney+', 'Mubi'] }, 'services', me), 'Netflix\nMubi');
  assert.equal(startFrom({ type: 'text' }, 'services', me), 'Netflix, Mubi');
  assert.equal(startFrom({ type: 'number' }, 'household', me), '2');
  assert.equal(startFrom({ type: 'text' }, 'author', me), 'Ada');
  assert.equal(startFrom({ type: 'date' }, 'household', me), undefined);
});

test('checkInputs: a question left unanswered takes what it starts from before its default; one answered, even empty, keeps its answer', () => {
  const fields = cleanFields([
    { id: 'units', label: 'Units', type: 'choice', options: ['Metric', 'Imperial'], default: 'Imperial', from: 'me.units' },
    { id: 'style', label: 'Style', type: 'text', remember: true, default: 'plain' },
    { id: 'city', label: 'City', type: 'text', required: true, from: 'me.home' },
  ]);
  const starts = { units: 'Metric', style: 'bold', city: 'Athens' };
  assert.deepEqual(checkInputs(fields, {}, { starts }).values, { units: 'Metric', style: 'bold', city: 'Athens' });
  assert.deepEqual(checkInputs(fields, { units: 'Imperial', style: '' }, { starts }).values, { units: 'Imperial', style: '', city: 'Athens' });
  assert.deepEqual(checkInputs(fields, {}).values, { units: 'Imperial', style: 'plain', city: '' });
  assert.deepEqual(checkInputs(fields, {}).errors, ['City: needed'], 'with nothing to start from, a needed one is still needed');
});

test('a task fills {{me.…}}, {{language}} and {{lang}}; a question of the app’s own by such a name is its own', () => {
  const vars = { language: 'Greek', lang: 'el', 'me.home': 'Athens', 'me.services': ['Netflix', 'Mubi'], 'me.diet': '' };
  assert.equal(fillTemplate('In {{language}} ({{lang}}), near {{me.home}}: {{me.services}}.{{#me.diet}} Diet: {{me.diet}}.{{/me.diet}}', {}, { vars }), 'In Greek (el), near Athens: Netflix, Mubi.');
  assert.equal(fillTemplate('Into {{language}}', { language: 'French' }, { known: ['language'], vars }), 'Into French');
  assert.deepEqual(placeholders('{{me.units}} {{#me.diet}}x{{/me.diet}} {{topic}}').sort(), ['me.diet', 'me.units', 'topic']);
  assert.ok(['me.units', 'me.author_id', 'language', 'lang', 'today'].every((n) => TASK_VALUES.includes(n)));
});

test('steps: {{me.…}} is checked against About you’s fields; a step or question named me or language is the app’s own', () => {
  const bad = checkFlow({ fields: [], answer: [], flow: { steps: [{ id: 'a', do: 'model', instructions: 'Use {{me.units}}, {{language}}, {{lang}} and {{me.shoe_size}}' }] } } as any);
  assert.ok(bad.errors.some((e) => /me\.shoe_size.*About you gives home, country, units/.test(e)), bad.errors.join('\n'));
  assert.equal(bad.errors.length, 1, bad.errors.join('\n'));
  // The research app's step "me" reads the profile, and Translate's question "language" is the language to translate into.
  const own = checkFlow({ fields: [{ id: 'language', label: 'Into', type: 'text' }], answer: [], flow: { steps: [{ id: 'me', do: 'tool', tool: 'user_profile', with: {} }, { id: 'b', do: 'model', instructions: 'For {{me.text}}, into {{language}}' }] } } as any);
  assert.deepEqual(own.errors, []);
  const scope = { inputs: { language: 'French' }, steps: { me: { text: 'a profile' } }, vars: { language: 'Greek', me: { units: 'metric' } } };
  assert.equal(lookup('language', scope).value, 'French');
  assert.equal(lookup('me.text', scope).value, 'a profile');
  assert.equal(lookup('me.units', { inputs: {}, steps: {}, vars: scope.vars }).value, 'metric');
});

// ---- runs -------------------------------------------------------------------------------------------------

test('routes: About you as set and worked out; a change names only its fields; null clears; agents ask first', async () => {
  let r = await call('GET', '/api/apps/me');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.me, {});
  assert.deepEqual([r.body.values.country, r.body.values.units, r.body.values.currency, r.body.values.language], ['GR', 'metric', 'EUR', 'el']);
  assert.equal(r.body.derived.country, 'timezone');
  r = await call('PUT', '/api/apps/me', { home: 'Thessaloniki, Greece', services: ['Netflix', 'Mubi'], fields: 'IR, NLP', author: { name: 'Ada', id: 'A5023888391' } });
  assert.equal(r.body.me.home, 'Thessaloniki, Greece');
  assert.deepEqual(r.body.me.fields, ['IR', 'NLP']);
  r = await call('PUT', '/api/apps/me', { currency: 'USD', fields: null });
  assert.equal(r.body.me.currency, 'USD');
  assert.equal(r.body.derived.currency, undefined, 'set: no longer worked out');
  assert.equal(r.body.me.fields, undefined);
  assert.equal(r.body.me.home, 'Thessaloniki, Greece');
  assert.equal((await call('PUT', '/api/apps/me', [1])).status, 400);
  await call('PUT', '/api/apps/me', { currency: null });
});

const flowApp = (p: Record<string, unknown> = {}) =>
  store.saveApp(db, {
    recipe: cleanRecipe({
      name: 'Plan',
      agent: 'claude',
      fields: [
        { id: 'topic', label: 'Topic', type: 'text', required: true },
        { id: 'units', label: 'Units', type: 'choice', options: ['Metric', 'Imperial'], from: 'me.units' },
        { id: 'tone', label: 'Tone', type: 'text', remember: true },
      ],
      answer: [{ id: 'text', label: 'Text', type: 'text' }],
      tools: null,
      limits: {},
      flow: { steps: [{ id: 'say', do: 'model', instructions: 'About {{topic}} near {{me.home}} for {{me.services}}, in {{units}} and {{me.currency}}; write in {{language}} ({{lang}}).', outputs: [{ id: 'text', label: 'Text', type: 'text' }] }] },
      ...p,
    }),
  });

test('a flow: {{me.…}} and {{language}} filled; the line on the language only with language: "person" and not in English; a public run gets no About you', async () => {
  model.answer = () => '{"text":"ok"}';
  const own = flowApp({ language: 'person' });
  model.calls = [];
  let r = await call('POST', `/api/apps/${own.id}/runs`, { inputs: { topic: 'Hiking' }, lang: 'el' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  let run = await ended(r.body.run.id);
  assert.equal(run.status, 'done', run.error);
  assert.equal(run.lang, 'el');
  const said = model.calls.at(-1)!.user;
  assert.match(said, /About Hiking near Thessaloniki, Greece for - Netflix\n- Mubi, in Metric and EUR; write in Greek \(el\)\./);
  assert.match(said, /Write everything people will read in Greek\./);
  // Without language: "person", nothing is said of the language.
  const plain = flowApp();
  model.calls = [];
  run = await ended((await call('POST', `/api/apps/${plain.id}/runs`, { inputs: { topic: 'Hiking' }, lang: 'el' })).body.run.id);
  assert.doesNotMatch(model.calls.at(-1)!.user, /Write everything people will read/);
  // In English, nothing either.
  model.calls = [];
  run = await ended((await call('POST', `/api/apps/${own.id}/runs`, { inputs: { topic: 'Hiking' }, lang: 'en' })).body.run.id);
  assert.match(model.calls.at(-1)!.user, /write in English \(en\)\./);
  assert.doesNotMatch(model.calls.at(-1)!.user, /Write everything people will read/);
  // A run that says no language writes in About you's (here worked out from the app's: Greek).
  run = await ended((await call('POST', `/api/apps/${own.id}/runs`, { inputs: { topic: 'Hiking' } })).body.run.id);
  assert.equal(run.lang, 'el');
  // A public page's run: the visitor's language, nothing of the owner's.
  model.calls = [];
  const pub = startRun({ app: own.id, slug: own.slug, recipe: own, source: 'public', inputs: { topic: 'Hiking' }, public: { model: 'fake', web: false, capUsd: 1 }, lang: 'de' });
  run = await ended(pub.id);
  assert.equal(run.status, 'done', run.error);
  assert.equal(run.lang, 'de');
  assert.equal(run.inputs.units, '', 'its form starts from nothing of the owner’s');
  const pubSaid = model.calls.at(-1)!.user;
  assert.match(pubSaid, /About Hiking near  for , in  and ; write in German \(de\)\./);
  assert.match(pubSaid, /Write everything people will read in German\./);
  // Run again from here writes in the language it wrote in.
  const again = await call('POST', `/api/apps/runs/${r.body.run.id}/again`, { from: 'say' });
  assert.equal(again.status, 200, JSON.stringify(again.body));
  assert.equal((await ended(again.body.run.id)).lang, 'el');
  store.deleteApp(db, own.id);
  store.deleteApp(db, plain.id);
});

test('from and remember: the API takes About you and the last answer for what it leaves out; the form’s own answers are remembered for the next run; the app’s page has them', async () => {
  const a = flowApp();
  // The app's page: what its questions start from.
  let page = await call('GET', `/api/apps/${a.id}`);
  assert.deepEqual(page.body.starts, { units: 'Metric' });
  // A run from the form: its answer to the question that remembers is kept for the app.
  let r = await call('POST', `/api/apps/${a.id}/runs`, { inputs: { topic: 'A', units: 'Imperial', tone: 'Dry' }, lang: 'en' });
  await ended(r.body.run.id);
  assert.deepEqual(lastAnswers(db, a.id), { tone: 'Dry' });
  page = await call('GET', `/api/apps/${a.id}`);
  assert.deepEqual(page.body.starts, { units: 'Metric', tone: 'Dry' });
  // From the API: what it leaves out starts from About you and the last answer (and the API's own answers are not remembered).
  r = await call('POST', `/api/apps/${a.id}/runs`, { inputs: { topic: 'B' }, source: 'api' });
  let run = await ended(r.body.run.id);
  assert.deepEqual([run.inputs.units, run.inputs.tone], ['Metric', 'Dry']);
  const api = startRun({ app: a.id, slug: a.slug, recipe: a, source: 'api', inputs: { topic: 'C', tone: 'Warm' } });
  await ended(api.id);
  assert.deepEqual(lastAnswers(db, a.id), { tone: 'Dry' }, 'a program’s answers are not the person’s');
  // A row of a CSV and a schedule's run start the same way.
  const row = startRun({ app: a.id, slug: a.slug, recipe: a, source: 'batch', inputs: { topic: 'D' } });
  assert.deepEqual([(await ended(row.id)).inputs.units, row.inputs.tone], ['Metric', 'Dry']);
  // An empty answer stays empty.
  run = await ended(startRun({ app: a.id, slug: a.slug, recipe: a, source: 'task', inputs: { topic: 'E', units: '' } }).id);
  assert.equal(run.inputs.units, '');
  // Gone with the app.
  await call('POST', `/api/apps/${a.id}/runs`, { inputs: { topic: 'F' } });
  await http.inject({ method: 'DELETE', url: `/api/apps/${a.id}` });
  assert.deepEqual(lastAnswers(db, a.id), {});
});

test('app_save’s checks: from names a field of About you; a file starts empty; from or remember, not both', async () => {
  const r = await call('POST', '/api/apps/check', {
    recipe: {
      name: 'X',
      prompt: 'Do {{a}}',
      fields: [
        { id: 'a', label: 'A', type: 'text', from: 'me.shoe_size' },
        { id: 'b', label: 'B', type: 'file', remember: true },
        { id: 'c', label: 'C', type: 'text', from: 'me.units', remember: true },
      ],
    },
  });
  const errors: string[] = r.body.errors ?? [];
  assert.ok(errors.some((e) => /^A: from names a field of About you: me\.home, me\.country/.test(e)), errors.join('\n'));
  assert.ok(errors.some((e) => /^B: a file question starts empty/.test(e)), errors.join('\n'));
  assert.ok(errors.some((e) => /^C: from or remember, not both/.test(e)), errors.join('\n'));
});

test('a one-task app: its prompt gets {{me.…}} and {{language}}, and the line after it with language: "person"; a public run gets neither About you nor the owner’s language', async () => {
  const a = store.saveApp(db, { recipe: cleanRecipe({ name: 'Trip', agent: 'claude', prompt: 'Plan {{topic}} from {{me.home}} in {{me.units}}, for {{me.household}}; answer in {{language}}.', fields: [{ id: 'topic', label: 'Topic', type: 'text', required: true }], answer: [], tools: null, limits: {}, language: 'person' }) });
  await call('PUT', '/api/apps/me', { household: 2 });
  const r = startRun({ app: a.id, slug: a.slug, recipe: a, source: 'web', inputs: { topic: 'Lisbon' }, lang: 'el' });
  for (let i = 0; i < 100 && !sessions.made.some((m) => m.o.title?.startsWith('Trip')); i++) await sleep(20);
  const made = sessions.made.find((m) => m.o.title?.startsWith('Trip'))!;
  assert.equal(made.o.prompt, 'Plan Lisbon from Thessaloniki, Greece in metric, for 2; answer in Greek.\n\nWrite everything people will read in Greek. Keep the names of fields, the choices you were given, codes and numbers exactly as they are written.');
  assert.equal(store.getRun(db, r.id)!.lang, 'el');
  // In English, the prompt alone.
  const en = startRun({ app: a.id, slug: a.slug, recipe: a, source: 'web', inputs: { topic: 'Porto' }, lang: 'en' });
  for (let i = 0; i < 100 && !sessions.made.some((m) => m.o.title?.includes('Porto')); i++) await sleep(20);
  assert.equal(sessions.made.find((m) => m.o.title?.includes('Porto'))!.o.prompt, 'Plan Porto from Thessaloniki, Greece in metric, for 2; answer in English.');
  // A public page's run.
  const pub = startRun({ app: a.id, slug: a.slug, recipe: a, source: 'public', inputs: { topic: 'Faro' }, public: { model: 'fake', web: false, capUsd: 1 }, lang: 'fr-FR' });
  for (let i = 0; i < 100 && !sessions.made.some((m) => m.o.title?.includes('Faro')); i++) await sleep(20);
  const p = sessions.made.find((m) => m.o.title?.includes('Faro'))!.o.prompt as string;
  assert.match(p, /^Plan Faro from  in , for ; answer in French \(France\)\.\n\nWrite everything people will read in French \(France\)\./);
  assert.equal(store.getRun(db, pub.id)!.lang, 'fr-FR');
  for (const id of [r.id, en.id, pub.id]) await http.inject({ method: 'POST', url: `/api/apps/runs/${id}/stop` });
  store.deleteApp(db, a.id);
});

const sessionCtx = (key: string): RunCtx => ({ runId: `run-${key}`, key, agent: 'claude', cwd: tmp, deps });
const useTool = (key: string) => apps.tools!(sessionCtx(key)).find((t) => t.name === 'use_app')!;

test('use_app: what the agent leaves out starts from About you (no card for an app always run), in the language it gives; the card shows it filled in', async () => {
  const a = flowApp({ name: 'Walks' });
  allowApp(db, a.id, true);
  sessions.cards = [];
  await useTool('claude:me-1').run({ app: 'walks', inputs: { topic: 'Olympus' }, language: 'Greek', wait: 1 }, sessionCtx('claude:me-1'));
  assert.equal(sessions.cards.length, 0, 'nothing to ask');
  let run = store.listRuns(db, { app: a.id, limit: 5 })[0];
  assert.deepEqual([run.inputs.units, run.source, run.lang], ['Metric', 'session', 'el']);
  await ended(run.id);
  // Asked first: the card has the question filled in from About you, and the answer given there runs (and is remembered).
  allowApp(db, a.id, false);
  sessions.answerWith = (card) => ({ decision: 'accept', form: { units: card.form.fields.find((f: any) => f.id === 'units').default, tone: 'Calm' } });
  await useTool('claude:me-2').run({ app: 'walks', inputs: { topic: 'Pelion' }, wait: 1 }, sessionCtx('claude:me-2'));
  const card = sessions.cards.at(-1);
  assert.equal(card.form.fields.find((f: any) => f.id === 'units').default, 'Metric');
  run = store.listRuns(db, { app: a.id, limit: 5 })[0];
  assert.deepEqual([run.inputs.units, run.inputs.tone], ['Metric', 'Calm']);
  assert.deepEqual(lastAnswers(db, a.id), { tone: 'Calm' });
  // Cleared on the card, it stays empty.
  sessions.answerWith = () => ({ decision: 'accept', form: { units: '', tone: '' } });
  await useTool('claude:me-3').run({ app: 'walks', inputs: { topic: 'Athos' }, wait: 1 }, sessionCtx('claude:me-3'));
  run = store.listRuns(db, { app: a.id, limit: 5 })[0];
  assert.equal(run.inputs.units, '');
  sessions.answerWith = null;
  await ended(run.id);
  store.deleteApp(db, a.id);
});

test('a code step gets ctx.locale: the run’s language and where the person is (a public visitor: the language alone)', async () => {
  if (sandboxAvailable()?.kind !== 'bwrap') return void console.log('     (skipped: no bubblewrap here)');
  const a = store.saveApp(db, {
    recipe: cleanRecipe({
      name: 'Locale',
      agent: 'claude',
      fields: [],
      answer: [],
      tools: null,
      limits: {},
      flow: {
        steps: [
          { id: 'js', do: 'code', language: 'javascript', code: "return { ...ctx.locale, day: new Intl.DateTimeFormat(ctx.locale.lang, { weekday: 'long', timeZone: 'UTC' }).format(new Date('2026-11-20T12:00:00Z')) };" },
          { id: 'py', do: 'code', language: 'python', code: "return {'lang': ctx.locale.lang, 'units': ctx.locale['units']}" },
        ],
        outputs: { locale: '{{js}}', py: '{{py}}' },
      },
    }),
  });
  const run = await ended(startRun({ app: a.id, slug: a.slug, recipe: a, source: 'web', inputs: {}, lang: 'el' }).id);
  assert.equal(run.status, 'done', run.error);
  const js = store.listSteps(db, run.id).find((s) => s.id === 'js')!.outputs as Record<string, unknown>;
  assert.deepEqual([js.lang, js.language, js.country, js.timeZone, js.currency, js.units, js.day], ['el', 'Greek', 'GR', 'Europe/Athens', 'EUR', 'metric', 'Παρασκευή']);
  const py = store.listSteps(db, run.id).find((s) => s.id === 'py')!.outputs as Record<string, unknown>;
  assert.deepEqual([py.lang, py.units], ['el', 'metric']);
  const pub = await ended(startRun({ app: a.id, slug: a.slug, recipe: a, source: 'public', inputs: {}, public: { model: 'fake', web: false, capUsd: 1 }, lang: 'ja' }).id);
  const pjs = store.listSteps(db, pub.id).find((s) => s.id === 'js')!.outputs as Record<string, unknown>;
  assert.deepEqual([pjs.lang, pjs.country, pjs.timeZone, pjs.currency], ['ja', '', 'UTC', '']);
  store.deleteApp(db, a.id);
});

// ---- run them ----------------------------------------------------------------------------------------------

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    console.error(`  FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
}
console.log(`\n${passed} of ${tests.length} passed`);
srv.close();
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(process.exitCode ?? 0);
