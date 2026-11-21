// Script test for the sixteen everyday ready-made apps (templates-more.ts) and what the person's record and language do to
// them: every question that starts from About you or from its last answer is a real field of it (and none sits on the
// subject of a run that changes every time); every app answers in the person's language; a fridge list in Greek reaches the
// recipe database as English names; the week of the meal plan, what's on's days, the months of a timeline and the money of a
// savings plan are written by Intl in the person's language; Wikipedia is asked in it first and in English when it has
// nothing; the price of a game is in US dollars and, for a person whose currency is another, in theirs too (a stand-in
// rate; none when the call fails); numbers with a decimal comma and dates in Greek are read; and the Weather outlook and
// the Quiz run whole in Greek, with stand-in services and a stand-in model that answers in Greek, with nothing breaking.
// Every program is a code step of a template as the flow runs it, in the sandbox, with stand-ins for what it reaches
// through ctx (no network, no real model).
// Build and run with scratch folders:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/apps/everyday-test.ts
//   DATA_DIR=/tmp/hydor-test-everyday HYDOR_APPS_DIR=/tmp/hydor-test-everyday-apps node dist/dev/everyday-test.js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { allSteps, type CodeStep } from '../../shared/app-manifest.ts';
import { FROM_FIELDS, fromField, startFrom } from '../../shared/app-me.ts';
import { HttpError } from '../auth.ts';
import { openDb } from '../db.ts';
import { registerFeatures } from '../features/registry.ts';
import type { Deps, Feature, RunTool } from '../features/types.ts';
import { setHelperModel } from '../helper.ts';
import { AGENT_FILE } from '../models/config.ts';
import { Scheduler } from '../scheduler.ts';
import type { SessionManager } from '../sessions.ts';
import { runCode } from './code.ts';
import { apps } from './index.ts';
import { startRun, startRuns, waitFor } from './runs.ts';
import * as store from './store.ts';
import { templateById } from './templates.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/') || !process.env.HYDOR_APPS_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… and HYDOR_APPS_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-everyday-test-'));
const db = openDb(path.join(tmp, 'test.db'));
store.ensureTables(db);
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

// ---- the stand-ins -------------------------------------------------------------------------------------------------------

/** What http_request gives: its status line, a blank line, the body. */
const answer = (url: string, body: string) => ({ text: `HTTP 200 OK  ·  ${new URL(url).host}  ·  ${body.length} bytes\n\n${body}` });

/** What each service answers; a route returns the body, or null when it does not answer (as a 502 does). */
type Route = (url: URL, a: Record<string, unknown>) => string | null;
let routes: Route[] = [];
const asked: { url: URL; a: Record<string, unknown> }[] = [];
async function http(a: Record<string, unknown>): Promise<{ text: string }> {
  const url = new URL(String(a.url));
  asked.push({ url, a });
  for (const route of routes) {
    const got = route(url, a);
    if (got !== null) return answer(url.href, got);
  }
  throw new Error(`http_request: HTTP 502 Bad Gateway  ·  ${url.host}`);
}
const host = (h: string, body: unknown): Route => (u) => (u.host === h ? (typeof body === 'string' ? body : JSON.stringify(body)) : null);

type Locale = { lang: string; language: string; country: string; timeZone: string; currency: string; units: string };
const EL: Locale = { lang: 'el', language: 'Greek', country: 'GR', timeZone: 'Europe/Athens', currency: 'EUR', units: 'metric' };
const EN: Locale = { lang: 'en', language: 'English', country: '', timeZone: 'UTC', currency: '', units: '' };

/** The model's calls from programs (ctx.model), by what they asked: each question kept. */
const models: string[] = [];
let model: (instructions: string, a: Record<string, unknown>) => Record<string, unknown> = () => {
  throw new Error('no model here');
};

/** A template's code step, run in the sandbox on the input given, in a person's language, with its ctx calls going to the stand-ins. */
async function program(app: string, step: string, input: Record<string, unknown>, locale: Locale = EN): Promise<Record<string, unknown>> {
  const t = templateById(app)!;
  const s = allSteps(t.flow!.steps).find((x) => x.id === step) as CodeStep | undefined;
  assert.ok(s && s.do === 'code', `${app} has a program “${step}”`);
  const out = await runCode({
    language: s.language,
    code: s.code,
    input,
    locale,
    slug: app,
    seconds: s.seconds ?? 20,
    onCall: async (kind, args) => {
      if (kind === 'tool' && args.tool === 'http_request') return http((args.with ?? {}) as Record<string, unknown>);
      if (kind === 'model') {
        models.push(String(args.instructions));
        return model(String(args.instructions), args);
      }
      throw new Error(`ctx has no ${kind} here`);
    },
  });
  return out.values;
}
const rows = (v: unknown) => v as Record<string, any>[];

// ---- what each question starts from ----------------------------------------------------------------------------------------

const EVERYDAY = ['weather-outlook', 'best-time-to-visit', 'team-tracker', 'match-preview', 'fridge-recipes', 'meal-planner', 'gift-ideas', 'what-to-watch', 'game-finder', 'quiz', 'book-finder', 'whats-on', 'savings-plan', 'chart-my-data', 'topic-timeline', 'place-explorer'];

/** [app, question, what it starts from]: a field of About you, or "remember" (its last answer). */
const STARTS: [string, string, string][] = [
  ['weather-outlook', 'place', 'me.home'],
  ['weather-outlook', 'days', 'remember'],
  ['weather-outlook', 'units', 'me.units'],
  ['best-time-to-visit', 'units', 'me.units'],
  ['team-tracker', 'team', 'me.teams'],
  ['match-preview', 'team', 'me.teams'],
  ['fridge-recipes', 'diet', 'me.diet'],
  ['fridge-recipes', 'time', 'remember'],
  ['meal-planner', 'days', 'remember'],
  ['meal-planner', 'people', 'me.household'],
  ['meal-planner', 'diet', 'me.diet'],
  ['meal-planner', 'likes', 'remember'],
  ['gift-ideas', 'region', 'me.home'],
  ['what-to-watch', 'kind', 'remember'],
  ['what-to-watch', 'services', 'me.services'],
  ['what-to-watch', 'country', 'me.country'],
  ['game-finder', 'likes', 'remember'],
  ['game-finder', 'platform', 'remember'],
  ['game-finder', 'budget', 'remember'],
  ['quiz', 'level', 'remember'],
  ['quiz', 'count', 'remember'],
  ['book-finder', 'kind', 'remember'],
  ['book-finder', 'length', 'remember'],
  ['whats-on', 'city', 'me.home'],
  ['whats-on', 'likes', 'remember'],
  ['savings-plan', 'rate', 'remember'],
  ['savings-plan', 'currency', 'me.currency'],
  ['topic-timeline', 'detail', 'remember'],
  ['place-explorer', 'radius', 'remember'],
];

test('every question that starts from About you or its last answer is a real field of it, and none is on the subject of a run that changes every time', () => {
  for (const [app, question, from] of STARTS) {
    const f = templateById(app)!.fields.find((x) => x.id === question);
    assert.ok(f, `${app} has a question “${question}”`);
    if (from === 'remember') {
      assert.equal(f.remember, true, `${app}.${question} remembers its last answer`);
      assert.equal(f.from, undefined, `${app}.${question}: remember or from, not both`);
    } else {
      const id = fromField(from);
      assert.ok(id && FROM_FIELDS.some((x) => x.id === id), `${from} is a field of About you`);
      assert.equal(f.from, from, `${app}.${question} starts from ${from}`);
      assert.notEqual(f.remember, true);
    }
    assert.notEqual(f.type, 'file');
  }
  // The questions that start from something are exactly these: none was left out of the table, none is on a subject.
  for (const id of EVERYDAY) {
    const t = templateById(id)!;
    for (const f of t.fields)
      if (f.from || f.remember) assert.ok(STARTS.some(([a, q]) => a === id && q === f.id), `${id}.${f.id} is in the table of what questions start from`);
  }
  for (const [app, question] of [['quiz', 'topic'], ['gift-ideas', 'who'], ['match-preview', 'opponent'], ['fridge-recipes', 'have'], ['topic-timeline', 'topic'], ['book-finder', 'likes'], ['weather-outlook', 'plans']]) {
    const f = templateById(app)!.fields.find((x) => x.id === question)!;
    assert.ok(!f.from && !f.remember, `${app}.${question} changes every run: it starts from nothing`);
  }
  // Each app answers in the person's language.
  for (const id of EVERYDAY) assert.equal(templateById(id)!.language, 'person', `${id} answers in the person's language`);
});

test('a choice starts from the record in the app’s own words: metric and imperial, a diet, a number of people', () => {
  const units = templateById('weather-outlook')!.fields.find((f) => f.id === 'units')!;
  assert.equal(startFrom(units, 'units', { units: 'metric' }), 'Metric');
  assert.equal(startFrom(units, 'units', { units: 'imperial' }), 'Imperial');
  const diet = templateById('meal-planner')!.fields.find((f) => f.id === 'diet')!;
  assert.equal(startFrom(diet, 'diet', { diet: 'vegetarian' }), 'Vegetarian');
  assert.equal(startFrom(diet, 'diet', { diet: 'no spicy food' }), undefined, 'a diet the app does not know leaves the default');
  const fridge = templateById('fridge-recipes')!.fields.find((f) => f.id === 'diet')!;
  assert.equal(startFrom(fridge, 'diet', { diet: 'Pescatarian' }), 'Pescatarian');
  assert.equal(startFrom(templateById('meal-planner')!.fields.find((f) => f.id === 'people')!, 'household', { household: 3 }), '3');
  assert.equal(startFrom(templateById('what-to-watch')!.fields.find((f) => f.id === 'services')!, 'services', { services: ['Netflix', 'Disney+'] }), 'Netflix, Disney+');
});

// ---- Cook with what you have ---------------------------------------------------------------------------------------------

test('Cook with what you have: a list in Greek is turned into English names for the recipe database, and the recipes show it back in the person’s words', async () => {
  models.length = 0;
  model = () => ({ names: [{ english: 'chicken', own: 'κοτόπουλο' }, { english: 'rice', own: 'ρύζι' }, { english: 'lemon', own: 'λεμόνι' }] });
  const out = await program('fridge-recipes', 'items', { have: 'κοτόπουλο, ρύζι και ένα λεμόνι', diet: 'Anything' }, EL);
  assert.equal(models.length, 1, 'one model call, to name them in English');
  assert.match(models[0], /English/);
  assert.deepEqual(out.have, ['chicken', 'rice', 'lemon']);
  const urls = rows(out.items).map((i) => decodeURIComponent(String(i.url)));
  assert.ok(urls.some((u) => u.endsWith('filter.php?i=chicken')) && urls.some((u) => u.endsWith('filter.php?i=chickens')), 'each in the singular and the plural');
  assert.ok(urls.every((u) => !/[^\x00-\x7f]/.test(u)), 'nothing but English reaches the database');
  assert.deepEqual(rows(out.own).map((o) => [o.have, o.own]), [['chicken', 'κοτόπουλο'], ['rice', 'ρύζι'], ['lemon', 'λεμόνι']]);
  // The recipes name what they use of theirs in the words the person wrote.
  const ranked = await program('fridge-recipes', 'rank', {
    found: [answer('https://www.themealdb.com/api/json/v1/1/lookup.php?i=1', JSON.stringify({ meals: [{ idMeal: '1', strMeal: 'Lemon Chicken', strCategory: 'Chicken', strArea: 'Greek', strInstructions: 'Cook.', strMealThumb: '', strIngredient1: 'Chicken Breast', strMeasure1: '2', strIngredient2: 'Lemon', strMeasure2: '1', strIngredient3: 'Rice', strMeasure3: '1 cup' }] }))],
    have: out.have,
    own: out.own,
    diet: 'Anything',
    basics: 'Yes',
  }, EL);
  assert.equal(rows(ranked.recipes)[0].uses_list, 'κοτόπουλο, λεμόνι, ρύζι');
  assert.equal(rows(ranked.recipes)[0].missing, 0);
});

test('Cook with what you have: an English list in an English run is read as it was, with no model asked', async () => {
  models.length = 0;
  const out = await program('fridge-recipes', 'items', { have: 'chicken, eggs and rice', diet: 'Anything' });
  assert.equal(models.length, 0);
  assert.deepEqual(out.have, ['chicken', 'egg', 'rice']);
  assert.deepEqual(out.own, []);
  // In Greek letters but with the model down, nothing is found: it is said, not guessed.
  model = () => {
    throw new Error('no model');
  };
  await assert.rejects(program('fridge-recipes', 'items', { have: 'κοτόπουλο', diet: 'Anything' }, EL), /Say what you have/);
});

// ---- Meal plan, What's on, Timeline, Savings ---------------------------------------------------------------------------------

test('Meal plan: the week’s weekdays are in the person’s language (Greek), and in English as before', async () => {
  const el = await program('meal-planner', 'plan', { days: 3, diet: 'Anything', start: '2026-11-23', today: '2026-11-21' }, EL);
  assert.deepEqual(rows(el.dates).map((d) => d.weekday), ['Δευτέρα', 'Τρίτη', 'Τετάρτη']);
  assert.deepEqual(rows(el.dates).map((d) => d.date), ['2026-11-23', '2026-11-24', '2026-11-25']);
  const en = await program('meal-planner', 'plan', { days: 3, diet: 'Anything', start: '2026-11-23', today: '2026-11-21' });
  assert.deepEqual(rows(en.dates).map((d) => d.weekday), ['Monday', 'Tuesday', 'Wednesday']);
  const ja = await program('meal-planner', 'plan', { days: 1, diet: 'Vegan', start: '2026-11-23', today: '2026-11-21' }, { ...EL, lang: 'ja', language: 'Japanese' });
  assert.equal(rows(ja.dates)[0].weekday, '月曜日');
});

test('Meal plan: what they do not want, said in Greek, is read by a model into English words that leave recipes out', async () => {
  const kinds = [{ kind: 'Chicken', url: 'https://www.themealdb.com/api/json/v1/1/filter.php?c=Chicken' }];
  const found = [answer('https://x.example/', JSON.stringify({ meals: [{ idMeal: '1', strMeal: 'Mushroom Chicken' }, { idMeal: '2', strMeal: 'Lemon Chicken' }, { idMeal: '3', strMeal: 'Onion Chicken Pie' }] }))];
  model = (_instructions, a) => {
    assert.match(String((a.with as Record<string, unknown>).likes), /μανιτάρια/);
    return { avoid: ['mushrooms', 'Μανιτάρι', 'onion'] };
  };
  const out = await program('meal-planner', 'pool', { kinds, found, likes: 'Χωρίς μανιτάρια και κρεμμύδια', seed: 'a' }, EL);
  assert.deepEqual(rows(out.items).map((i) => i.meal), ['Lemon Chicken'], 'mushroom and onion dishes are left out');
  // In English the words are read by the program itself: no model.
  models.length = 0;
  const en = await program('meal-planner', 'pool', { kinds, found, likes: 'no mushrooms', seed: 'a' });
  assert.equal(models.length, 0);
  assert.deepEqual(rows(en.items).map((i) => i.meal).sort(), ['Lemon Chicken', 'Onion Chicken Pie']);
});

test('What’s on: the days are written in the person’s language, and the search is for the days asked, not “this weekend”', async () => {
  const given = { from: '2026-11-23', to: '2026-11-25', today: '2026-11-21' };
  const el = await program('whats-on', 'dates', given, EL);
  assert.equal(el.label, '23–25 Νοεμβρίου 2026');
  assert.equal(el.month, 'Νοέμβριος 2026');
  assert.equal(el.when, el.label, 'what is searched for is the days asked');
  const en = await program('whats-on', 'dates', given);
  assert.equal(en.label, '23 November to 25 November 2026');
  assert.equal(en.month, 'November 2026');
  assert.equal(en.when, en.label);
  // One day.
  assert.equal((await program('whats-on', 'dates', { from: '2026-11-23', to: '2026-11-23', today: '2026-11-21' }, EL)).label, '23 Νοεμβρίου 2026');
  // No days given (a Saturday): the coming weekend, which the searches for listings call so.
  const weekend = await program('whats-on', 'dates', { today: '2026-11-21' }, EL);
  assert.equal(weekend.from, '2026-11-21');
  assert.equal(weekend.when, 'this weekend Νοέμβριος 2026');
  assert.equal((await program('whats-on', 'dates', { today: '2026-11-21' })).when, 'this weekend November 2026');
  const t = templateById('whats-on')!;
  const guide = allSteps(t.flow!.steps).find((s) => s.id === 'guide_search') as unknown as { with: { query: string } };
  assert.match(guide.with.query, /\{\{dates\.when\}\}/);
  assert.ok(!/this weekend/.test(guide.with.query), 'no “this weekend” of its own');
});

test('A topic as a timeline: a year before the common era is written in the person’s language (BCE in English)', async () => {
  const events = [
    { year: -44, date: '15 Μαρτίου 44 π.Χ.', title: 'Δολοφονία του Καίσαρα', what: 'x', kind: 'Πολιτική', importance: 3 },
    { year: 476, date: '476', title: 'Πτώση', what: 'y', kind: 'Πολιτική', importance: 3 },
  ];
  const el = await program('topic-timeline', 'order', { events, eras: [] }, EL);
  assert.equal(el.span, '44 π.Χ.–476');
  assert.equal((await program('topic-timeline', 'order', { events, eras: [] })).span, '44 BCE–476');
  assert.equal((await program('topic-timeline', 'order', { events, eras: [] }, { ...EL, lang: 'ja' })).span, '紀元前44年–476');
});

test('Savings plan: money is written the way the person’s language writes it, by their currency as a code or a symbol', async () => {
  const input = { target: 20000, by: '2031-01-01', saved: 2000, monthly: '', rate: 3, currency: 'EUR', today: '2026-11-21' };
  const el = await program('savings-plan', 'project', input, EL);
  assert.equal(String(el.target_text).replace(/\s/g, ' '), '20.000 €');
  assert.match(String(el.needed_text), /^\d+,\d\d\s€$/);
  assert.match(String(rows(el.scenarios)[0].monthly_text), /€$/);
  const en = await program('savings-plan', 'project', { ...input, currency: '€' });
  assert.equal(en.target_text, '€20,000');
  assert.match(String(en.needed_text), /^€\d[\d,]*\.\d\d$/);
  assert.equal(el.needed, en.needed, 'the sums are the same');
  // A currency it does not know stays as the person wrote it; none, plain numbers.
  assert.equal((await program('savings-plan', 'project', { ...input, currency: 'kr' })).target_text, 'kr20,000');
  assert.equal((await program('savings-plan', 'project', { ...input, currency: '' })).target_text, '20,000');
});

// ---- Game finder -------------------------------------------------------------------------------------------------------------

const GAMES = [
  { title: 'Stardew Valley', year: 2016, out: '', coming: false, genre: 'Farming', platforms: 'PC', hours: 50, why: 'Cozy.', free: false },
  { title: 'Hollow Knight: Silksong', year: 2026, out: 'Feb 2027', coming: true, genre: 'Action', platforms: 'PC', hours: 20, why: 'Hunted.', free: false },
];
const DEALS = [{ title: 'Stardew Valley', found: true, price: 9.99, lowest: 4.99, store: 'Steam', deal: 'https://www.cheapshark.com/redirect?dealID=1', picture: null }, { title: 'Hollow Knight: Silksong', found: false }];

test('Game finder: the price is in US dollars and, for a person whose currency is another, in theirs too at the rate of the day (one call)', async () => {
  asked.length = 0;
  routes = [host('api.frankfurter.dev', { date: '2026-11-20', base: 'USD', quote: 'EUR', rate: 0.92 })];
  const el = await program('game-finder', 'final', { games: GAMES, deals: DEALS, media: { items: [] }, budget: 'Any price', summary: 'Δύο παιχνίδια.' }, EL);
  assert.equal(asked.length, 1, 'one call for the rate');
  assert.equal(asked[0].url.href, 'https://api.frankfurter.dev/v2/rate/usd/eur');
  const g = rows(el.games)[0];
  assert.equal(g.price, 9.99);
  assert.equal(String(g.price_text).replace(/\s/g, ' '), '9,99 US$ (≈ 9,19 €)');
  assert.equal(rows(el.games)[1].price_text, '', 'no price, no text');
  assert.match(String(el.rate), /^1 US\$ = 0,92\s*€ \(2026-11-20\)$/);
  const en = await program('game-finder', 'final', { games: GAMES, deals: DEALS, media: { items: [] }, budget: 'Any price', summary: 'Two games.' }, { ...EL, lang: 'en', language: 'English' });
  assert.equal(rows(en.games)[0].price_text, 'US$9.99 (≈ €9.19)');
});

test('Game finder: when the rate call fails the price is in dollars alone; for a person with dollars, or none, no call is made', async () => {
  asked.length = 0;
  routes = [];
  const out = await program('game-finder', 'final', { games: GAMES, deals: DEALS, media: { items: [] }, budget: 'Any price', summary: 'Two games.' }, EL);
  assert.equal(asked.length, 1, 'tried once (the engine tries again)');
  assert.match(String(rows(out.games)[0].price_text), /^9,99\sUS\$$/);
  assert.equal(out.rate, '');
  assert.ok(rows(out.games)[0].price > 0 && rows(out.games)[0].lowest > 0, 'the numbers are still there');
  asked.length = 0;
  routes = [host('api.frankfurter.dev', { rate: 1 })];
  const usd = await program('game-finder', 'final', { games: GAMES, deals: DEALS, media: { items: [] }, budget: 'Any price', summary: 'Two games.' }, { ...EL, lang: 'en', language: 'English', currency: 'USD' });
  assert.equal(asked.length, 0);
  assert.equal(rows(usd.games)[0].price_text, '$9.99', 'a person with dollars sees plain dollars');
  const unknown = await program('game-finder', 'final', { games: GAMES, deals: DEALS, media: { items: [] }, budget: 'Any price', summary: 'Two games.' }, EN);
  assert.equal(asked.length, 0);
  assert.equal(rows(unknown.games)[0].price_text, 'US$9.99');
});

// ---- Chart my data -----------------------------------------------------------------------------------------------------------

test('Chart my data: numbers with a decimal comma, a thousands mark and a currency sign are read the way their column writes them', async () => {
  const el = await program('chart-my-data', 'parse', { file: '', pasted: 'Μήνας;Πωλήσεις;Κόστος\nΙαν;12,5;1.234,5 €\nΦεβ;13,25;2.000\nΜαρ;9;1.500,75' }, EL);
  const cols = rows(el.columns);
  assert.deepEqual(cols.map((c) => c.kind), ['date', 'number', 'number']);
  assert.equal(cols[1].total, 34.75);
  assert.equal(cols[2].total, 4735.25);
  assert.deepEqual(rows(el.records).map((r) => r['Πωλήσεις']), [12.5, 13.25, 9]);
  assert.deepEqual(rows(el.records).map((r) => r['Κόστος']), [1234.5, 2000, 1500.75]);
  // English: a comma is a thousands mark, a point the decimal, as before.
  const en = await program('chart-my-data', 'parse', { file: '', pasted: 'Month\tSales\nJan\t1,234\nFeb\t1,500.5\nMar\t12.5' });
  assert.deepEqual(rows(en.records).map((r) => r.Sales), [1234, 1500.5, 12.5]);
  // A column of "1,234" and "1,5": the comma is the decimal one, in both.
  const mixed = await program('chart-my-data', 'parse', { file: '', pasted: 'a;b\nx;1,234\ny;1,5\nz;2,25' }, EL);
  assert.deepEqual(rows(mixed.records).map((r) => r.b), [1.234, 1.5, 2.25]);
});

test('Chart my data: dates are read the way the column writes them: month names in Greek, English or Japanese, dotted days, quarters', async () => {
  const kind = async (values: string[], locale: Locale = EL) => rows((await program('chart-my-data', 'parse', { file: '', pasted: 'when;n\n' + values.map((v, i) => `${v};${i + 1}`).join('\n') }, locale)).columns)[0].kind;
  assert.equal(await kind(['Ιανουάριος', 'Φεβρουάριος 2026', '5 Μαρτίου 2026']), 'date', ['Ιανουάριος', 'Φεβρουάριος 2026', '5 Μαρτίου 2026'].join(' | '));
  assert.equal(await kind(['Ιαν', 'Φεβ', 'Μαρ']), 'date', ['Ιαν', 'Φεβ', 'Μαρ'].join(' | '));
  assert.equal(await kind(['Jan 2026', 'Feb 2026', 'March']), 'date', 'English names are read in any language');
  assert.equal(await kind(['20.11.2026', '21.11.2026']), 'date', ['20.11.2026', '21.11.2026'].join(' | '));
  assert.equal(await kind(['2026/11/20', '2026/11/21']), 'date', ['2026/11/20', '2026/11/21'].join(' | '));
  assert.equal(await kind(['1月', '2月', '3月'], { ...EL, lang: 'ja' }), 'date', ['1月', '2月', '3月'].join(' | '));
  assert.equal(await kind(['2026年11月20日', '2026年11月21日'], { ...EL, lang: 'ja' }), 'date', ['2026年11月20日', '2026年11月21日'].join(' | '));
  assert.equal(await kind(['Q1 2026', 'Q2 2026']), 'date', ['Q1 2026', 'Q2 2026'].join(' | '));
  assert.equal(await kind(['alpha', 'beta']), 'text', ['alpha', 'beta'].join(' | '));
  assert.equal(await kind(['12.5', '13.5']), 'number', ['12.5', '13.5'].join(' | '));
});

// ---- Team tracker, What to watch ------------------------------------------------------------------------------------------------

test('Team tracker and Match preview: a question that started from several teams looks up the first', async () => {
  for (const app of ['team-tracker', 'match-preview']) {
    assert.equal((await program(app, 'mine', { team: 'Olympiacos, Arsenal' })).team, 'Olympiacos');
    assert.equal((await program(app, 'mine', { team: 'Boston Celtics' })).team, 'Boston Celtics');
    assert.equal((await program(app, 'mine', { team: '' })).team, '');
  }
});

test('What to watch: About you’s two-letter country becomes its name; a film is looked for at the person’s Wikipedia, then the English one', async () => {
  const picks = [{ title: 'Knives Out', year: 2019, kind: 'Film' }, { title: 'Severance', year: 2022, kind: 'Show' }];
  const el = await program('what-to-watch', 'urls', { picks, country: 'GR' }, EL);
  assert.equal(el.country, 'Greece');
  const [film, show] = rows(el.items);
  assert.match(String(film.info), /^https:\/\/el\.wikipedia\.org\//);
  assert.match(String(film.info_en), /^https:\/\/en\.wikipedia\.org\/.*Knives%20Out%202019%20film$/);
  assert.match(String(film.query), /where to watch streaming Greece$/);
  assert.match(String(show.info), /^https:\/\/api\.tvmaze\.com\/singlesearch\/shows\?q=Severance/);
  assert.equal(show.info_en, '');
  const en = await program('what-to-watch', 'urls', { picks, country: 'United Kingdom' });
  assert.equal(en.country, 'United Kingdom', 'a name as written stays');
  assert.match(String(rows(en.items)[0].info), /^https:\/\/en\.wikipedia\.org\/.*Knives%20Out%202019%20film$/);
  assert.equal(rows(en.items)[0].info_en, '');
  // The merge step: the person's Wikipedia has no page, the English one is asked.
  const merge = allSteps(templateById('what-to-watch')!.flow!.steps).find((s) => s.id === 'merge') as CodeStep;
  assert.ok(merge);
  asked.length = 0;
  routes = [host('en.wikipedia.org', { query: { pages: [{ title: 'Knives Out', fullurl: 'https://en.wikipedia.org/wiki/Knives_Out', thumbnail: { source: 'https://upload.wikimedia.org/ko.jpg' } }] } })];
  const out = await runCode({
    language: 'javascript',
    code: merge.code,
    input: { info: answer('https://el.wikipedia.org/w/api.php', '{"batchcomplete":true}'), where: '', title: 'Knives Out', info_en: String(film.info_en) },
    locale: EL,
    slug: 'what-to-watch',
    seconds: 20,
    onCall: async (kind, args) => {
      assert.equal(kind, 'tool');
      return http((args.with ?? {}) as Record<string, unknown>);
    },
  });
  assert.equal(asked.length, 1);
  assert.equal(out.values.link, 'https://en.wikipedia.org/wiki/Knives_Out');
  assert.equal(out.values.picture, 'https://upload.wikimedia.org/ko.jpg');
});

// ---- Explore a place ----------------------------------------------------------------------------------------------------------

test('Explore a place: in Greek the place is looked up in Greek, Wikidata and Wikipedia are asked for Greek names with the English descriptions to sort by', async () => {
  asked.length = 0;
  routes = [host('nominatim.openstreetmap.org', [{ lat: '40.6264', lon: '22.9486', name: 'Λευκός Πύργος', display_name: 'Λευκός Πύργος, Θεσσαλονίκη, Ελλάδα', importance: 0.6 }])];
  const spot = await program('place-explorer', 'spot', { found: '', place: 'Λευκός Πύργος', radius: 'Nearby (3 km)' }, EL);
  assert.equal(asked[0].url.searchParams.get('accept-language'), 'el');
  const sparql = String(new URL(String(spot.wikidata)).searchParams.get('query'));
  assert.match(sparql, /wikibase:language "el,en,mul"/);
  assert.match(sparql, /isPartOf <https:\/\/el\.wikipedia\.org\/>/);
  assert.match(sparql, /FILTER\(LANG\(\?descEn\) = "en"\)/);
  assert.match(String(spot.url), /^https:\/\/el\.wikipedia\.org\/.*generator=geosearch.*pageprops/);
  assert.match(String(spot.url_en), /^https:\/\/en\.wikipedia\.org\//);
  // In English nothing of that: the query and the address are as they were.
  const en = await program('place-explorer', 'spot', { found: '', place: 'Λευκός Πύργος', radius: 'Nearby (3 km)' });
  assert.equal(asked[1].url.searchParams.get('accept-language'), 'en');
  assert.ok(!/descEn|el\.wikipedia/.test(String(new URL(String(en.wikidata)).searchParams.get('query'))));
  assert.equal(en.url_en, '');
});

test('Explore a place: Greek descriptions do not let areas and events through, because the English ones decide; the English Wikipedia answers when the Greek has nothing', async () => {
  const binding = (qid: string, label: string, desc: string, en: string, lng: number, lat: number, links: number, article = '') => ({
    item: { value: 'http://www.wikidata.org/entity/' + qid },
    itemLabel: { value: label },
    itemDescription: { value: desc },
    descEn: { value: en },
    loc: { value: `Point(${lng} ${lat})` },
    links: { value: String(links) },
    ...(article ? { article: { value: article } } : {}),
  });
  const famous = JSON.stringify({
    results: {
      bindings: [
        binding('Q1', 'Λευκός Πύργος', 'μνημείο', 'tower in Thessaloniki', 22.9486, 40.6264, 40, 'https://el.wikipedia.org/wiki/Λευκός_Πύργος'),
        binding('Q2', 'Δήμος Θεσσαλονίκης', 'δήμος της Ελλάδας', 'municipality of Greece', 22.94, 40.63, 60),
        binding('Q9', 'Πολιορκία', 'γεγονός', '1430 siege', 22.94, 40.63, 30),
      ],
    },
  });
  const local = JSON.stringify({
    query: {
      pages: [
        { title: 'Ροτόντα', description: 'ναός', pageprops: { wikibase_item: 'Q3' }, coordinates: [{ lat: 40.6329, lon: 22.9517, type: 'landmark' }], length: 9000, fullurl: 'https://el.wikipedia.org/wiki/Ροτόντα', thumbnail: { source: 'https://upload.wikimedia.org/rotonda.jpg' } },
        { title: 'Νομός Θεσσαλονίκης', description: 'νομός', pageprops: { wikibase_item: 'Q4' }, coordinates: [{ lat: 40.64, lon: 22.94, type: 'landmark' }], length: 9000, fullurl: 'https://el.wikipedia.org/wiki/Νομός_Θεσσαλονίκης' },
      ],
    },
  });
  asked.length = 0;
  routes = [host('www.wikidata.org', { entities: { Q3: { descriptions: { en: { value: 'Roman rotunda in Thessaloniki' } } }, Q4: { descriptions: { en: { value: 'province of Greece' } } } } })];
  const input = { famous, found: local, found_en: 'https://en.wikipedia.org/w/api.php?generator=geosearch', osm: [], name: 'Θεσσαλονίκη', lat: 40.6264, lng: 22.9486 };
  const out = await program('place-explorer', 'sort', input, EL);
  const places = rows(out.places);
  assert.deepEqual(places.map((p) => p.name).sort(), ['Λευκός Πύργος', 'Ροτόντα'].sort(), 'names in Greek; the municipality, the regional unit and the siege are left out');
  assert.equal(places.find((p) => p.name === 'Ροτόντα')!.kind, 'Religious site', 'read from the English description');
  assert.equal(places.find((p) => p.name === 'Ροτόντα')!.about, 'ναός', 'what is shown is Greek');
  assert.ok(places.every((p) => !('aboutEn' in p)));
  assert.equal(places.find((p) => p.name === 'Λευκός Πύργος')!.about, 'μνημείο');
  assert.equal(asked.filter((x) => x.url.host === 'www.wikidata.org').length, 1, 'their English descriptions in one call');
  assert.ok(!asked.some((x) => x.url.host === 'en.wikipedia.org' && x.url.searchParams.get('generator')), 'the English Wikipedia is not asked for articles when the Greek one has some');
  // The Greek Wikipedia has nothing around it: the English one's articles come in.
  asked.length = 0;
  routes = [host('en.wikipedia.org', { query: { pages: [{ title: 'Rotunda of Galerius', description: 'Roman rotunda', coordinates: [{ lat: 40.6329, lon: 22.9517, type: 'landmark' }], length: 9000, fullurl: 'https://en.wikipedia.org/wiki/Rotunda_of_Galerius' }] } })];
  const fallback = await program('place-explorer', 'sort', { ...input, famous: '', found: '{"batchcomplete":true}' }, EL);
  assert.deepEqual(rows(fallback.places).map((p) => p.name), ['Rotunda of Galerius']);
  assert.ok(asked.some((x) => x.url.host === 'en.wikipedia.org'));
});

// ---- the whole runs, in Greek ---------------------------------------------------------------------------------------------------

class FakeSessions extends EventEmitter {
  async create() {
    return 'acp:none';
  }
  summary() {
    return null;
  }
  setFlags() {}
  liveSnapshot() {
    return { live: null, overlay: { items: [], patches: {}, approvals: [] } };
  }
  async timeline() {
    return { parser: { items: [] }, readMore: async () => {} } as any;
  }
}

/** The step model's questions, kept; its answers, by what was asked, in Greek. */
const questions: string[] = [];
const SKY_EL: Record<string, string> = { Overcast: 'Συννεφιά', 'Light rain': 'Ελαφριά βροχή', Thunderstorm: 'Καταιγίδα', Clear: 'Αίθριος', 'Partly cloudy': 'Λίγα σύννεφα' };
const srv = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const b = JSON.parse(body || '{}');
    const user = String(b.messages?.find((m: { role: string }) => m.role === 'user')?.content ?? '');
    questions.push(user);
    let reply: unknown = {};
    if (/Say each of these weather descriptions/.test(user)) {
      const phrases = user.split('\n\n')[1].split('\n').map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean);
      reply = { skies: phrases.map((sky) => ({ sky, words: SKY_EL[sky] ?? 'Άγνωστος' })) };
    } else if (/Read this weather forecast/.test(user)) {
      reply = { summary: 'Συννεφιά με βροχή την Τρίτη· η καλύτερη μέρα είναι η Δευτέρα.', best: [{ date: '2026-11-23', why: 'Στεγνή και ήπια' }], wear: ['Αδιάβροχο', 'Ζακέτα'], alerts: ['Καταιγίδα την Τετάρτη'] };
    } else if (/quiz of/.test(user)) {
      // The right letters in Greek capitals (Alpha and Beta look like A and B), in Latin, and in lower case.
      reply = {
        intro: 'Το ηλιακό σύστημα έχει οκτώ πλανήτες.',
        questions: [
          { question: 'Ποιος πλανήτης είναι ο μεγαλύτερος;', a: 'Δίας', b: 'Κρόνος', c: 'Άρης', d: 'Γη', answer: 'Α', explain: 'Ο Δίας είναι ο μεγαλύτερος.' },
          { question: 'Ποιος πλανήτης είναι κόκκινος;', a: 'Ερμής', b: 'Άρης', c: 'Αφροδίτη', d: 'Ουρανός', answer: 'Β', explain: 'Ο Άρης.' },
          { question: 'Πόσοι είναι οι πλανήτες;', a: '7', b: '9', c: '8', d: '10', answer: 'C', explain: 'Οκτώ.' },
          { question: 'Ποιο είναι το κοντινότερο άστρο;', a: 'Σείριος', b: 'Ήλιος', c: 'Βέγας', d: 'Αρκτούρος', answer: 'β', explain: 'Ο Ήλιος.' },
          { question: 'Ποιος έχει δακτυλίους;', a: 'Κρόνος', b: 'Άρης', c: 'Γη', d: 'Ερμής', answer: 'Δ', explain: 'Λάθος γράμμα: η Δέλτα είναι η τέταρτη απάντηση (Ερμής).' },
        ],
      };
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(reply) }, finish_reason: 'stop' }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.001 } })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
});
await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
fs.mkdirSync(path.dirname(AGENT_FILE), { recursive: true });
fs.writeFileSync(AGENT_FILE, JSON.stringify({ models: [{ id: 'fake', label: 'Fake', provider: 'endpoint', baseUrl: `http://127.0.0.1:${(srv.address() as { port: number }).port}/v1`, model: 'fake-1', tools: 'native' }] }));

const stepTool = (name: string, run: RunTool['run']): RunTool => ({ name, description: name, inputSchema: { type: 'object' }, run });
const services: Feature = {
  id: 'everyday-services',
  tools: (ctx) => (ctx.step ? [stepTool('http_request', (a) => http(a)), stepTool('read_page', async () => ({ text: 'Το ηλιακό σύστημα: ο Δίας είναι ο μεγαλύτερος πλανήτης.' }))] : []),
};
const app = Fastify();
await app.register(cookie);
app.setErrorHandler((err: Error, _req, res) => {
  res.code(err instanceof HttpError ? err.status : 500).send({ error: err.message });
});
const sessions = new FakeSessions();
const scheduler = new Scheduler(db, sessions as unknown as SessionManager);
const deps = { app, db, sessions: sessions as any, scheduler, models: null as any, broadcast: () => {}, toSubscribers: () => {}, publicBase: () => 'http://test.local' } as Deps;
apps.routes!(deps);
registerFeatures([services], deps);
startRuns(deps);
await app.ready();
setHelperModel(db, 'fake');

const run = async (id: string, inputs: Record<string, string>, lang: string) => {
  const r = (await waitFor(startRun({ app: 'tpl:' + id, slug: id, recipe: templateById(id)!, source: 'test', inputs, lang }).id, 120_000))!;
  return { r, res: r.result as Record<string, any>, steps: store.listSteps(db, r.id) };
};

test('Weather outlook, whole, in Greek: the place is looked up in Greek, the skies are said in Greek, and nothing breaks on a Greek answer', async () => {
  questions.length = 0;
  asked.length = 0;
  const day = (n: number) => `2026-11-${String(23 + n)}`;
  routes = [
    host('geocoding-api.open-meteo.com', { results: [{ name: 'Θεσσαλονίκη', latitude: 40.64, longitude: 22.94, country: 'Ελλάδα', country_code: 'GR', admin1: 'Κεντρική Μακεδονία', population: 800000, feature_code: 'PPLA' }] }),
    host('api.open-meteo.com', {
      current: { temperature_2m: 12.1, apparent_temperature: 10.2, weather_code: 3, wind_speed_10m: 14, relative_humidity_2m: 70 },
      hourly: { time: ['2026-11-21T12:00', '2026-11-21T13:00'], temperature_2m: [12, 13], precipitation_probability: [10, 20], weather_code: [3, 61] },
      daily: {
        time: [day(0), day(1), day(2)],
        weather_code: [3, 61, 95],
        temperature_2m_max: [14, 12, 11],
        temperature_2m_min: [8, 7, 6],
        precipitation_sum: [0, 4, 12],
        precipitation_probability_max: [10, 70, 90],
        wind_speed_10m_max: [15, 25, 40],
        uv_index_max: [2, 1, 1],
        sunrise: [day(0) + 'T07:10', day(1) + 'T07:11', day(2) + 'T07:12'],
        sunset: [day(0) + 'T17:00', day(1) + 'T16:59', day(2) + 'T16:58'],
      },
    }),
  ];
  const { r, res, steps } = await run('weather-outlook', { place: 'Θεσσαλονίκη', days: '3 days', plans: 'Βόλτα στην παραλία', units: 'Metric' }, 'el');
  assert.equal(r.status, 'done', r.error);
  assert.equal(r.lang, 'el');
  assert.ok(asked[0].url.searchParams.get('language') === 'el', 'the place is looked up in Greek');
  assert.equal(res.place, 'Θεσσαλονίκη, Ελλάδα');
  assert.equal(res.unit, '°C');
  const days = res.days as { sky: string; icon: string; date: string }[];
  assert.deepEqual(days.map((d) => d.sky), ['Συννεφιά', 'Ελαφριά βροχή', 'Καταιγίδα'], 'the skies in words, in Greek');
  assert.equal(res.now_sky, 'Συννεφιά');
  assert.deepEqual(days.map((d) => d.icon), ['☁️', '🌦️', '⛈️'], 'the pictures are the same');
  assert.match(String(res.summary), /Συννεφιά/);
  assert.equal((res.best as { date: string }[])[0].date, '2026-11-23');
  assert.deepEqual(res.wear, ['Αδιάβροχο', 'Ζακέτα']);
  assert.equal(steps.find((s) => s.id === 'skies')?.status, 'done');
  assert.ok(questions.some((q) => /Write everything people will read in Greek/.test(q)), 'the model steps are told to write in Greek');
  assert.ok(!steps.some((s) => s.status === 'failed'));
  // In English the sky words are as they were and no model says them.
  questions.length = 0;
  const en = await run('weather-outlook', { place: 'Thessaloniki', days: '3 days', units: 'Metric' }, 'en');
  assert.equal(en.r.status, 'done', en.r.error);
  assert.equal(en.steps.find((s) => s.id === 'skies')?.status, 'skipped');
  assert.deepEqual((en.res.days as { sky: string }[]).map((d) => d.sky), ['Overcast', 'Light rain', 'Thunderstorm']);
  assert.ok(!questions.some((q) => /Say each of these weather descriptions/.test(q)));
});

test('Weather outlook: Fahrenheit still means imperial, so a saved Fahrenheit run, schedule or API call is read as it was', async () => {
  routes = [
    host('geocoding-api.open-meteo.com', { results: [{ name: 'Austin', latitude: 30.27, longitude: -97.74, country: 'United States', country_code: 'US', population: 900000 }] }),
    host('api.open-meteo.com', { daily: { time: ['2026-11-23'], weather_code: [0], temperature_2m_max: [70], temperature_2m_min: [50] } }),
  ];
  asked.length = 0;
  const spot = await program('weather-outlook', 'spot', { found: JSON.stringify({ results: [{ name: 'Austin', latitude: 30.27, longitude: -97.74, country: 'United States', population: 9 }] }), place: 'Austin', days: '3 days', units: 'Fahrenheit' });
  assert.match(String(spot.url), /temperature_unit=fahrenheit/);
  const metric = await program('weather-outlook', 'spot', { found: JSON.stringify({ results: [{ name: 'Austin', latitude: 30.27, longitude: -97.74, country: 'United States', population: 9 }] }), place: 'Austin', days: '3 days', units: 'Metric' });
  assert.ok(!/fahrenheit/.test(String(metric.url)));
});

test('Quiz, whole, in Greek: Wikipedia is asked in Greek, and a right answer written as a Greek letter is still the right one', async () => {
  questions.length = 0;
  asked.length = 0;
  routes = [host('el.wikipedia.org', { query: { search: [{ title: 'Ηλιακό Σύστημα' }] } })];
  const { r, res } = await run('quiz', { topic: 'Το ηλιακό σύστημα', level: 'Easy', count: '5' }, 'el');
  assert.equal(r.status, 'done', r.error);
  assert.ok(asked.some((x) => x.url.host === 'el.wikipedia.org' && /list=search/.test(x.url.search)), 'asked at the Greek Wikipedia');
  assert.ok(!asked.some((x) => x.url.host === 'en.wikipedia.org'), 'the English one is not asked when the Greek has a page');
  assert.equal(res.title, 'Ηλιακό Σύστημα');
  assert.equal(res.source, 'https://el.wikipedia.org/wiki/%CE%97%CE%BB%CE%B9%CE%B1%CE%BA%CF%8C_%CE%A3%CF%8D%CF%83%CF%84%CE%B7%CE%BC%CE%B1');
  const qs = res.questions as { n: number; question: string; a: string; b: string; c: string; d: string; answer: string }[];
  assert.equal(qs.length, 5, 'every question is kept: Greek Α, Β and Δ are read as A, B and D');
  for (const q of qs) {
    assert.match(q.answer, /^[ABCD]$/, 'a Latin letter');
    assert.ok(q.question && q.a && q.b && q.c && q.d);
  }
  // The right answer is still the one it was, wherever the shuffle put it.
  const right = (q: (typeof qs)[number]) => (q as unknown as Record<string, string>)[q.answer.toLowerCase()];
  assert.deepEqual(qs.map(right), ['Δίας', 'Άρης', '8', 'Ήλιος', 'Ερμής']);
  assert.ok(questions.some((q) => /Write everything people will read in Greek/.test(q)));
  // No page at the Greek Wikipedia: the English one is asked, and the quiz still comes out.
  asked.length = 0;
  routes = [host('el.wikipedia.org', { query: { search: [] } }), host('en.wikipedia.org', { query: { search: [{ title: 'Solar System' }] } })];
  const fallback = await run('quiz', { topic: 'Ο γαλαξίας μας', level: 'Easy', count: '5' }, 'el');
  assert.equal(fallback.r.status, 'done', fallback.r.error);
  assert.equal(fallback.res.source, 'https://en.wikipedia.org/wiki/Solar_System');
  assert.equal(fallback.res.title, 'Solar System');
});

// ---- run ---------------------------------------------------------------------------------------------------------------------

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
process.exit(process.exitCode ?? 0);
