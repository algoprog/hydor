// Script tests for fixes to ready-made apps whose programs can be run alone, in the sandbox, with stand-ins for the
// services they reach through ctx (nothing here asks the network or a model): Meal plan and shopping list (amounts
// scaled to the people, dinners that do not suit the diet swapped), Game finder (a price only for the game asked for),
// Weekly news digest (every topic with stories keeps one), and the examples' checks of Match preview. Each program is the
// code step of a template, as the flow runs it.
// Build and run with scratch folders:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/apps/ready-made-test.ts
//   DATA_DIR=/tmp/hydor-test-ready node dist/dev/ready-made-test.js
import assert from 'node:assert/strict';
import { allSteps, evalRule, type CodeStep } from '../../shared/app-manifest.ts';
import { fromField, type RunLocale } from '../../shared/app-me.ts';
import { runCode } from './code.ts';
import { TEMPLATES, templateById } from './templates.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

/** What http_request gives: its status line, a blank line, the body. */
const answer = (url: string, body: string) => ({ text: `HTTP 200 OK  ·  ${new URL(url).host}  ·  ${body.length} bytes\n\n${body}` });

/** A template's code step, run in the sandbox on the input given; its ctx calls go to `tools`. */
async function program(app: string, step: string, input: Record<string, unknown>, tools: (tool: string, a: Record<string, unknown>) => unknown = () => null, locale?: RunLocale): Promise<Record<string, unknown>> {
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
      if (kind !== 'tool' && kind !== 'model') throw new Error(`ctx has no ${kind} here`);
      // A model call goes to the stand-in as the tool "model", with its `with` values (and its instructions).
      const got = tools(kind === 'model' ? 'model' : String(args.tool), { ...((args.with ?? {}) as Record<string, unknown>), ...(kind === 'model' ? { instructions: args.instructions } : {}) });
      if (got instanceof Error) throw got;
      return got;
    },
  });
  return out.values;
}

// ---- Meal plan and shopping list ---------------------------------------------------------------------------------

/** A recipe as TheMealDB gives it: each ingredient with its measure. */
function meal(id: string, name: string, category: string, ings: [string, string][]): Record<string, string> {
  const m: Record<string, string> = { idMeal: id, strMeal: name, strCategory: category, strArea: 'Test', strInstructions: 'Cook it.', strMealThumb: `https://img.example/${id}.jpg`, strYoutube: '', strSource: '' };
  ings.forEach(([item, amount], i) => {
    m[`strIngredient${i + 1}`] = item;
    m[`strMeasure${i + 1}`] = amount;
  });
  return m;
}
const found = (m: Record<string, string>) => answer('https://www.themealdb.com/api/json/v1/1/lookup.php?i=' + m.idMeal, JSON.stringify({ meals: [m] }));
const dates = (n: number) => Array.from({ length: n }, (_, i) => ({ day: i + 1, date: `2026-11-${String(23 + i).padStart(2, '0')}`, weekday: 'Monday' }));

const CHICKEN = meal('1', 'Lemon chicken', 'Chicken', [['Chicken Breast', '200g'], ['Eggs', '2 large'], ['Flour', '1 ½ cups'], ['Paprika', '1/2 tsp'], ['Salt', 'Pinch'], ['Water', '2-3 tbsp'], ['Garlic', '4 cloves']]);
const CURRY = meal('2', 'Chickpea curry', 'Vegetarian', [['Chickpeas', '400g'], ['Onion', '1'], ['Paprika', '1/2 tsp']]);

test('Meal plan: the amounts are scaled from recipes for four to the people, rounded; what cannot be read stays as written; the note says so once', async () => {
  const run = (people: number) => program('meal-planner', 'assemble', { found: [found(CHICKEN), found(CURRY)], picked: [{ why: 'a' }, { why: 'b' }], dates: dates(2), diet: 'Anything', people, pool: [] });
  const two = await run(2);
  const list2 = Object.fromEntries((two.shopping as Record<string, string>[]).map((x) => [x.item, x.amount]));
  assert.equal(list2['Chicken Breast'], '100 g');
  assert.equal(list2['Eggs'], '1 large', '“2 large” scaled by its leading number');
  assert.equal(list2['Flour'], '¾ cup', '“1 ½ cups”');
  assert.equal(list2['Paprika'], '½ tsp', '¼ + ¼ teaspoon');
  assert.equal(list2['Salt'], 'Pinch', 'no number: as written');
  assert.equal(list2['Water'], '2-3 tbsp', 'a range: as written');
  assert.equal(list2['Garlic'], '2 clove');
  assert.equal(list2['Chickpeas'], '200 g');
  assert.match(String(two.note), /for four.*scaled for 2 people/);
  const six = await run(6);
  const list6 = Object.fromEntries((six.shopping as Record<string, string>[]).map((x) => [x.item, x.amount]));
  assert.equal(list6['Chicken Breast'], '300 g');
  assert.equal(list6['Eggs'], '3 large');
  assert.equal(list6['Flour'], '2 ¼ cup');
  assert.equal(list6['Paprika'], '1 ½ tsp');
  assert.equal(list6['Garlic'], '6 clove');
  assert.match(String(six.note), /scaled for 6 people/);
  const four = await run(4);
  const list4 = Object.fromEntries((four.shopping as Record<string, string>[]).map((x) => [x.item, x.amount]));
  assert.equal(list4['Chicken Breast'], '200 g', 'for four: as the recipes have it');
  assert.equal(list4['Paprika'], '1 tsp');
  assert.match(String(four.note), /which are for four/);
  assert.equal((two.days as unknown[]).length, 2);
  assert.ok(!('ings' in (two.days as Record<string, unknown>[])[0]), 'the days carry no working fields');
});

test('Meal plan: a vegetarian week in which the model picked a meat dish gets a fitting one from the choices; only what nothing could replace is listed', async () => {
  const SPARE_MEAT = meal('3', 'Beef stew', 'Beef', [['Beef', '500g']]);
  const SPARE_VEG = meal('4', 'Spinach pie', 'Vegetarian', [['Spinach', '300g'], ['Feta', '100g']]);
  const SPARE_VEG2 = meal('5', 'Mushroom risotto', 'Vegetarian', [['Rice', '300g']]);
  const pool = [{ n: 1, id: '1', meal: 'Lemon chicken' }, { n: 2, id: '2', meal: 'Chickpea curry' }, { n: 3, id: '3', meal: 'Beef stew' }, { n: 4, id: '4', meal: 'Spinach pie' }, { n: 5, id: '5', meal: 'Mushroom risotto' }];
  const asked: string[] = [];
  const tools = (tool: string, a: Record<string, unknown>) => {
    assert.equal(tool, 'http_request');
    const id = new URL(String(a.url)).searchParams.get('i')!;
    asked.push(id);
    const m = { '3': SPARE_MEAT, '4': SPARE_VEG, '5': SPARE_VEG2 }[id];
    return m ? found(m) : new Error('HTTP 404');
  };
  const v = await program('meal-planner', 'assemble', { found: [found(CHICKEN), found(CURRY)], picked: [{ why: 'rich' }, { why: 'light' }], dates: dates(2), diet: 'Vegetarian', people: 4, pool }, tools);
  const days = v.days as Record<string, string>[];
  assert.deepEqual(days.map((d) => d.meal), ['Spinach pie', 'Chickpea curry'], 'the meat dish is swapped for a vegetarian one, on its day');
  assert.equal(days[0].day as unknown, 1);
  assert.match(days[0].why, /Swapped in for Lemon chicken/);
  assert.deepEqual(v.off, []);
  assert.ok(!(v.shopping as Record<string, string>[]).some((x) => /chicken|beef/i.test(x.item)), 'the list holds nothing of the dish that went');
  assert.ok((v.shopping as Record<string, string>[]).some((x) => x.item === 'Spinach'));
  // Nothing in the choices fits: the dinner stays and is listed.
  const none = await program('meal-planner', 'assemble', { found: [found(CHICKEN), found(CURRY)], picked: [{}, {}], dates: dates(2), diet: 'Vegetarian', people: 4, pool: [pool[2]] }, tools);
  assert.deepEqual((none.days as Record<string, string>[]).map((d) => d.meal), ['Lemon chicken', 'Chickpea curry']);
  assert.deepEqual(none.off, ['Lemon chicken']);
  // Two dinners to replace and one fitting choice: one is swapped, one is listed; a dish is not used twice.
  const CHICKEN2 = meal('6', 'Chicken pie', 'Chicken', [['Chicken', '200g']]);
  const some = await program('meal-planner', 'assemble', { found: [found(CHICKEN), found(CHICKEN2)], picked: [{}, {}], dates: dates(2), diet: 'Vegetarian', people: 4, pool: [pool[2], pool[3]] }, tools);
  assert.deepEqual((some.days as Record<string, string>[]).map((d) => d.meal), ['Spinach pie', 'Chicken pie']);
  assert.deepEqual(some.off, ['Chicken pie']);
  // With no diet, nothing is looked up.
  asked.length = 0;
  await program('meal-planner', 'assemble', { found: [found(CHICKEN)], picked: [{}], dates: dates(1), diet: 'Anything', people: 2, pool }, tools);
  assert.equal(asked.length, 0);
});

// ---- Trip planner --------------------------------------------------------------------------------------------------

const json = (url: string, body: unknown) => answer(url, JSON.stringify(body));
const meteo = (...results: Record<string, unknown>[]) => ({ results });
const place = (name: string, lat: number, lng: number, admin1: string, country: string) => ({ name, latitude: lat, longitude: lng, admin1, country });

test('Trip planner: each day’s area is looked up (Open-Meteo near the destination, then OpenStreetMap; the engine spaces its calls, the program waits for nothing), and what neither finds is left to the model', async () => {
  const stamps: [string, number][] = [];
  const tools = (tool: string, a: Record<string, unknown>) => {
    assert.equal(tool, 'http_request');
    const u = new URL(String(a.url));
    if (u.host === 'geocoding-api.open-meteo.com') {
      const name = u.searchParams.get('name');
      stamps.push(['meteo ' + name, Date.now()]);
      if (name === 'Lisbon') return json(String(a.url), meteo(place('Lisbon', 38.7167, -9.1333, 'Lisbon', 'Portugal'), place('Lisbon', 44.04, -70.1, 'Maine', 'United States')));
      if (name === 'Alfama') return json(String(a.url), meteo(place('Alfama', 38.711, -9.13, 'Lisbon', 'Portugal')));
      if (name === 'Baixa') return json(String(a.url), meteo(place('Baixa', -12.5, -40.2, 'Bahia', 'Brazil'), place('Baixa', 38.7105, -9.1393, 'Lisbon', 'Portugal')));
      return json(String(a.url), {});
    }
    assert.equal(u.host, 'nominatim.openstreetmap.org');
    assert.match(String((a.headers as Record<string, string>)['User-Agent']), /^Hydor/);
    stamps.push(['osm ' + u.searchParams.get('q'), Date.now()]);
    return u.searchParams.get('q') === 'Sintra, Lisbon' ? json(String(a.url), [{ lat: '38.8029', lon: '-9.3817', display_name: 'Sintra, Portugal' }]) : json(String(a.url), []);
  };
  const stops = [{ day: 1, area: 'Alfama', lat: 1, lng: 1 }, { day: 2, area: 'Baixa & Chiado' }, { day: 3, area: 'Sintra' }, { day: 4, area: 'Nowhereville' }, { day: 5, area: 'Alfama' }, { day: 6, area: '' }];
  const v = await program('trip-planner', 'geo', { stops, destination: 'Lisbon' }, tools);
  const at = (d: number) => (v.places as Record<string, unknown>[]).find((p) => p.day === d)!;
  assert.deepEqual([at(1).lat, at(1).lng, at(1).found], [38.711, -9.13, true], 'Open-Meteo’s result, not the model’s figure');
  assert.deepEqual([at(2).lat, at(2).lng], [38.7105, -9.1393], 'the Baixa near Lisbon, not the one in Bahia (the area’s first part is asked)');
  assert.deepEqual([at(3).lat, at(3).lng, at(3).found], [38.8029, -9.3817, true], 'OpenStreetMap, asked with the destination, when Open-Meteo has none');
  assert.deepEqual([at(4).lat, at(4).lng, at(4).found], [null, null, false], 'found by neither');
  assert.deepEqual([at(5).lat, at(5).found], [38.711, true], 'the same area once');
  assert.equal(at(6).found, false, 'a day with no area');
  assert.equal(v.found, 4);
  assert.equal(stamps.filter(([k]) => k === 'meteo Alfama').length, 1, 'an area is asked once');
  const osm = stamps.filter(([k]) => k.startsWith('osm'));
  assert.deepEqual(osm.map(([k]) => k), ['osm Sintra, Lisbon', 'osm Nowhereville, Lisbon']);
  assert.ok(osm[1][1] - osm[0][1] < 1000, 'the program leaves the spacing of OpenStreetMap’s calls to the engine');
  // A destination that names its region tells places apart: Paris in Texas, not in France.
  const paris = (name: string) =>
    name === 'Paris' ? meteo(place('Paris', 48.85, 2.35, 'Île-de-France', 'France'), place('Paris', 33.66, -95.55, 'Texas', 'United States')) : name === 'Downtown' ? meteo(place('Downtown', 48.86, 2.34, 'Île-de-France', 'France'), place('Downtown', 33.67, -95.56, 'Texas', 'United States')) : {};
  const tx = await program('trip-planner', 'geo', { stops: [{ day: 1, area: 'Downtown' }], destination: 'Paris, Texas' }, (_t, a) => json(String(a.url), paris(new URL(String(a.url)).searchParams.get('name') ?? '')));
  assert.deepEqual([(tx.places as Record<string, unknown>[])[0].lat, (tx.places as Record<string, unknown>[])[0].lng], [33.67, -95.56]);
  // Nothing answering at all: nothing found, and the step still gives its rows.
  const down = await program('trip-planner', 'geo', { stops: [{ day: 1, area: 'Alfama' }], destination: 'Lisbon' }, () => new Error('HTTP 502'));
  assert.deepEqual((down.places as Record<string, unknown>[]).map((p) => p.found), [false]);
});

test('Trip planner: the exchange rate comes from Frankfurter when the currencies differ, else from the plan, and the budget says whose day it is', async () => {
  const asked: string[] = [];
  const bank = (tool: string, a: Record<string, unknown>) => (asked.push(String(a.url)), json(String(a.url), { date: '2026-11-20', base: 'EUR', quote: 'USD', rate: 1.0812 }));
  const live = await program('trip-planner', 'fx', { currency: 'eur', home: 'USD', rate: 1.5 }, bank);
  assert.deepEqual([live.rate, live.date, live.source], [1.0812, '2026-11-20', 'Frankfurter']);
  assert.deepEqual(asked, ['https://api.frankfurter.dev/v2/rate/eur/usd']);
  asked.length = 0;
  const same = await program('trip-planner', 'fx', { currency: 'EUR', home: 'EUR', rate: 1 }, bank);
  assert.deepEqual([asked.length, same.source], [0, 'the plan']);
  const none = await program('trip-planner', 'fx', { currency: 'EUR', home: '', rate: '' }, bank);
  assert.deepEqual([asked.length, none.rate, none.source], [0, 0, '']);
  const down = await program('trip-planner', 'fx', { currency: 'EUR', home: 'USD', rate: 1.05 }, () => new Error('HTTP 404'));
  assert.deepEqual([down.rate, down.source], [1.05, 'the plan'], 'the model’s figure when the bank does not answer');
  const base = { dates: dates(2), itinerary: [], costs: [{ item: 'Hotel', low: 100, high: 200 }], currency: 'EUR', home: 'USD' };
  const a = await program('trip-planner', 'assemble', { ...base, rate: live.rate, rate_day: live.date, rate_from: live.source, geo: [] });
  assert.deepEqual((a.budget as Record<string, string>[]).pop(), { item: 'Total', estimate: '100–200 EUR (about 108–216 USD at 1 EUR = 1.0812 USD, the rate of 2026-11-20)' });
  const b = await program('trip-planner', 'assemble', { ...base, rate: 1.05, rate_day: '', rate_from: 'the plan', geo: [] });
  assert.match((b.budget as Record<string, string>[]).pop()!.estimate, /at 1 EUR = 1.05 USD, the planner’s own figure, not a live rate\)$/);
  const c = await program('trip-planner', 'assemble', { ...base, rate: 0, rate_day: '', rate_from: '', geo: [] });
  assert.equal((c.budget as Record<string, string>[]).pop()!.estimate, '100–200 EUR');
});

test('Trip planner: the map uses the look-up’s places, then the model’s where none was found; a road trip keeps its stops, and only a stop far from every other is left out', async () => {
  const dayRows = dates(5);
  // A road trip: five stops 350 km apart, as the model gave them: each is far from the middle, none is far from its neighbour.
  const road = dayRows.map((d, i) => ({ day: d.day, area: `Stop ${i + 1}`, lat: 36 + i * 3.15, lng: -5 }));
  const run = (itinerary: Record<string, unknown>[], geo: Record<string, unknown>[] = []) => program('trip-planner', 'assemble', { dates: dayRows, itinerary, costs: [], currency: '', home: '', rate: 0, geo });
  const kept = await run(road);
  assert.deepEqual((kept.stops as Record<string, unknown>[]).map((s) => s.day), [1, 2, 3, 4, 5]);
  // A stop on another continent (one the model got wrong) is dropped; one stop alone is kept.
  const stray = await run(road.map((r, i) => (i === 4 ? { ...r, lat: 40.7, lng: -74 } : r)));
  assert.deepEqual((stray.stops as Record<string, unknown>[]).map((s) => s.day), [1, 2, 3, 4]);
  const one = await run([{ day: 1, area: 'Alfama', lat: 38.7, lng: -9.1 }]);
  assert.equal((one.stops as unknown[]).length, 1);
  // The look-up wins over the model's figure for a day; where it found none the model's stays; none anywhere: no stop.
  const mixed = await run(
    [{ day: 1, area: 'A', lat: 10, lng: 10 }, { day: 2, area: 'B', lat: 38.7, lng: -9.1 }, { day: 3, area: 'C' }],
    [{ day: 1, area: 'A', lat: 38.71, lng: -9.13, found: true }, { day: 2, area: 'B', lat: null, lng: null, found: false }, { day: 3, area: 'C', lat: null, lng: null, found: false }],
  );
  assert.deepEqual((mixed.stops as Record<string, unknown>[]).map((s) => [s.day, s.lat, s.lng]), [[1, 38.71, -9.13], [2, 38.7, -9.1]]);
});

// ---- Game finder ---------------------------------------------------------------------------------------------------

test('Game finder: a price only for the game asked for: the same title once normalised, or with an edition word; another game’s is not shown', async () => {
  const shop = (hits: { gameID: string; external: string }[]) => (_t: string, a: Record<string, unknown>) => {
    const u = new URL(String(a.url));
    if (u.searchParams.get('id')) return json(String(a.url), { deals: [{ storeID: '1', price: '9.99', dealID: 'D1' }], cheapestPriceEver: { price: '4.99' } });
    return json(String(a.url), hits.map((h) => ({ ...h, thumb: 'https://img.example/t.jpg' })));
  };
  const price = (title: string, hits: { gameID: string; external: string }[]) => program('game-finder', 'price', { title, coming: false }, shop(hits));
  const ok = async (title: string, external: string) => assert.equal((await price(title, [{ gameID: '7', external }])).found, true, `${title} ~ ${external}`);
  const no = async (title: string, external: string) => assert.equal((await price(title, [{ gameID: '7', external }])).found, false, `${title} !~ ${external}`);
  await ok('Hades', 'HADES');
  await ok('Cyberpunk 2077', 'Cyberpunk 2077: Ultimate Edition');
  await ok('The Witcher 3: Wild Hunt', 'Witcher 3: Wild Hunt - Game of the Year Edition');
  await ok('Deus Ex: Human Revolution - Director’s Cut', 'Deus Ex: Human Revolution');
  await ok('Fallout 3', 'Fallout 3 Gold');
  await no('Portal', 'Portal 2');
  await no('Hades', 'Hades’ Star');
  await no('Doom', 'Doom Eternal');
  await no('Hollow Knight', 'Hollow Knight: Silksong');
  // The first hit is another game, a later one the right game: the right one's price.
  const both = await price('Portal', [{ gameID: '1', external: 'Portal 2' }, { gameID: '2', external: 'Portal' }]);
  assert.deepEqual([both.found, both.price, both.store], [true, 9.99, 'Steam']);
  // Nothing at all matches: a game without a deal, the rest of its card unchanged.
  const none = await price('Hades', []);
  assert.deepEqual([none.title, none.found], ['Hades', false]);
  const done = await program('game-finder', 'final', { games: [{ title: 'Hades', year: 2020, genre: 'Roguelike', platforms: 'PC' }], deals: [none], media: { items: [{ picture: 'https://img.example/h.jpg' }] }, budget: 'Any price', summary: 'One pick.' });
  const g = (done.games as Record<string, unknown>[])[0];
  assert.deepEqual([g.price, g.store, g.deal, g.picture], [null, '', null, 'https://img.example/h.jpg']);
});

// ---- Weekly news digest --------------------------------------------------------------------------------------------

test('News digest: with more topics than room (8 topics, the shortest length) every topic that has a story keeps one; only a topic with none is quiet', async () => {
  const topics = Array.from({ length: 8 }, (_, i) => ({ topic: `Topic ${i + 1}`, query: `Topic ${i + 1}` }));
  const names = ['solar', 'whales', 'tariffs', 'chips', 'vaccines', 'rockets', 'wine', 'chess'];
  // Each topic's search: two stories of its own, except topic 8, which found nothing.
  const searches = topics.map((t, i) => (i === 7 ? { data: { results: [] } } : { data: { results: [0, 1].map((k) => ({ title: `${names[i]} breakthrough number ${k} reported ${['alpha', 'bravo'][k]} ${names[i]}x`, url: `https://news${i}.example/${k}`, date: '2026-11-19' })) } }));
  const g = await program('news-digest', 'group', { searches, topics, since: '2026-11-14', today: '2026-11-21', skip: '', stories: 4 });
  const items = g.items as Record<string, unknown>[];
  assert.deepEqual([...new Set(items.map((x) => x.topic))], topics.slice(0, 7).map((t) => t.topic), 'every topic with a story has a candidate');
  assert.ok(items.length <= 18 && items.length >= 7, `${items.length} candidates`);
  assert.deepEqual(g.quiet, ['Topic 8']);
  // Each candidate is read and held up: the digest has room for all seven topics (more than its four), one each.
  const reads = items.map(() => ({ what: 'Something happened.', why: 'It matters.', date: '2026-11-19', this_week: true, original: true, source: 'News' }));
  const sel = await program('news-digest', 'select', { candidates: items, reads, quiet: g.quiet, topics, since: '2026-11-14', today: '2026-11-21', stories: 4 });
  const stories = sel.stories as Record<string, unknown>[];
  assert.deepEqual(stories.filter((x) => x.summary).map((x) => x.topic), topics.slice(0, 7).map((t) => t.topic));
  assert.deepEqual(sel.quiet, ['Topic 8'], 'quiet only when it truly had none');
  assert.equal(stories.filter((x) => !x.summary).length, 1);
  assert.equal(stories.find((x) => x.topic === 'Topic 8')!.title, 'No real news this week');
  assert.equal(sel.count, 7);
  // Two topics at the shortest length keep to the length (four stories).
  const two = await program('news-digest', 'select', {
    candidates: ['A', 'A', 'A', 'A', 'B', 'B', 'B'].map((t, i) => ({ topic: `Topic ${t}`, title: `Story ${i}`, url: `https://x.example/${i}`, date: '2026-11-19', coverage: 1 })),
    reads: Array.from({ length: 7 }, () => ({ what: 'w', why: 'y', date: '2026-11-19', this_week: true, original: true })),
    quiet: [], topics: [{ topic: 'Topic A' }, { topic: 'Topic B' }], since: '2026-11-14', today: '2026-11-21', stories: 4,
  });
  assert.equal(two.count, 4);
  // A topic whose stories were all read and found old is quiet: none held up.
  const old = await program('news-digest', 'select', {
    candidates: [{ topic: 'Topic A', title: 'Old', url: 'https://x.example/o', date: '2026-01-01', coverage: 1 }],
    reads: [{ what: 'w', date: '2026-01-01', this_week: false }], quiet: [], topics: [{ topic: 'Topic A' }], since: '2026-11-14', today: '2026-11-21', stories: 4,
  });
  assert.deepEqual(old.quiet, ['Topic A']);
});

// ---- Match preview's examples ----------------------------------------------------------------------------------------

test('Match preview: its examples’ checks test the chances (each from 0 to 100, adding up to 100), so wrong ones fail', async () => {
  const t = templateById('match-preview')!;
  const checks = t.examples![0].checks!;
  const odds = await program('match-preview', 'odds', { team: 'Arsenal', opponent: 'Chelsea', team_win: 45, draw: 25, opponent_win: 30, meetings: [], team_form: 'WWDLW', opponent_form: 'LDWWL' });
  const scope = (o: Record<string, unknown>, answer: Record<string, unknown>) => ({ inputs: {}, steps: { odds: o, answer }, vars: { reply: '', today: '2026-11-21' } });
  const good = { team_pct: odds.team_pct, draw_pct: odds.draw_pct, opponent_pct: odds.opponent_pct, summary: 'A close one.' };
  assert.deepEqual([odds.team_pct, odds.draw_pct, odds.opponent_pct, odds.total_pct], [45, 25, 30, 100]);
  for (const rule of checks) assert.equal(evalRule(rule, scope(odds, good)), true, rule);
  // Chances that are off (here, a percentage over 100, and a total that is not 100) no longer pass.
  const results = (o: Record<string, unknown>, a: Record<string, unknown>) => checks.map((rule) => evalRule(rule, scope(o, a)));
  assert.deepEqual(results(odds, { ...good, team_pct: 120 }).slice(1, 2), [false]);
  assert.deepEqual(results(odds, { ...good, draw_pct: -5 }).slice(1, 2), [false]);
  assert.deepEqual(results({ ...odds, total_pct: 90 }, good), [true, true, false]);
  const none = await program('match-preview', 'odds', { team: 'A', opponent: 'B', meetings: [] });
  assert.equal(none.total_pct, 0, 'no chances at all: the check fails');
  assert.equal(evalRule(checks[2], scope(none, good)), false);
  // The basketball example has no draw: nothing in a draw, the rest adds up.
  const nba = await program('match-preview', 'odds', { team: 'A', opponent: 'B', team_win: 60, draw: 0, opponent_win: 40, meetings: [] });
  for (const rule of t.examples![1].checks!) assert.equal(evalRule(rule, scope(nba, { draw_pct: nba.draw_pct })), true, rule);
});

// ---- Tiers ---------------------------------------------------------------------------------------------------------

test('Tiers: every ready-made app with an agent step thinks with a tier of its own (never max), and no step sets one that would override what the person picked on the page', () => {
  const withAgents: string[] = [];
  for (const t of TEMPLATES) {
    const steps = [...(t.flow ? allSteps(t.flow.steps) : []), ...Object.values(t.flows ?? {}).flatMap((f) => allSteps(f.steps))];
    assert.ok(steps.every((s) => !('tier' in s) || s.tier === undefined), `${t.id}: a step names a tier`);
    if (steps.some((s) => s.do === 'agent')) {
      withAgents.push(t.id);
      assert.ok(t.tier && ['quick', 'standard', 'best'].includes(t.tier), `${t.id}: tier ${t.tier}`);
    } else assert.equal(t.tier, undefined, `${t.id} has no agent step: nothing for a tier to do`);
  }
  assert.deepEqual(withAgents.sort(), ['deep-research', 'document-qa', 'explain-contract', 'figure-doctor', 'paper-to-talk', 'reproduce-paper', 'research-sprint', 'small-web-app', 'sweep-planner', 'trip-planner']);
});


// ---- the ten tasks and the person's language ----------------------------------------------------------------------

/** The locale a run in a language has (what runs.ts gives a code step), for the programs of the ten tasks. */
const locale = (lang: string, extra: Partial<RunLocale> = {}): RunLocale => ({ lang, language: lang, country: '', timeZone: 'UTC', currency: '', units: '', ...extra });
const GREEK = locale('el', { language: 'Greek', country: 'GR', timeZone: 'Europe/Athens', currency: 'EUR', units: 'metric' });

test('the ten tasks: each question that starts from About you or from the last answer is a real field, never both, never a file', () => {
  // [app, question, source]: from: "me.<field>" or remember.
  const table = [
    ['deep-research', 'depth', 'remember'], ['deep-research', 'audience', 'remember'], ['deep-research', 'review', 'remember'],
    ['trip-planner', 'travelers', 'remember'], ['trip-planner', 'interests', 'remember'], ['trip-planner', 'pace', 'remember'], ['trip-planner', 'choose', 'remember'],
    ['compare-products', 'region', 'me.country'], ['compare-products', 'choose', 'remember'],
    ['meeting-actions', 'attendees', 'remember'], ['meeting-actions', 'ask_owners', 'remember'],
    ['cover-letter', 'background', 'remember'], ['cover-letter', 'tone', 'remember'], ['cover-letter', 'length', 'remember'],
    ['lesson-plan', 'learners', 'remember'], ['lesson-plan', 'minutes', 'remember'], ['lesson-plan', 'setting', 'remember'], ['lesson-plan', 'materials', 'remember'], ['lesson-plan', 'taught_in', 'remember'],
    ['news-digest', 'topics', 'remember'], ['news-digest', 'region', 'me.country'], ['news-digest', 'skip', 'remember'], ['news-digest', 'length', 'remember'],
    ['explain-contract', 'side', 'remember'],
    ['small-web-app', 'users', 'remember'], ['small-web-app', 'style', 'remember'], ['small-web-app', 'review', 'remember'],
  ];
  const found: string[][] = [];
  for (const t of TEMPLATES.slice(0, 10)) {
    for (const f of t.fields) {
      if (!f.from && !f.remember) continue;
      assert.ok(!(f.from && f.remember), `${t.id}.${f.id}: from or remember, not both`);
      assert.notEqual(f.type, 'file', `${t.id}.${f.id}: not for files`);
      if (f.from) assert.ok(fromField(f.from), `${t.id}.${f.id}: ${f.from} is a field of About you`);
      found.push([t.id, f.id, f.from ?? 'remember']);
    }
  }
  assert.deepEqual(found, table);
  for (const id of ['deep-research', 'trip-planner', 'compare-products', 'document-qa', 'cover-letter', 'news-digest', 'explain-contract', 'small-web-app']) assert.equal(templateById(id)!.language, 'person', `${id} writes in the person’s language`);
  for (const id of ['meeting-actions', 'lesson-plan']) assert.equal(templateById(id)!.language, undefined, `${id} follows its notes’ or its lesson’s language, which it says itself`);
});

test('Document Q&A: the passage for a question is found in a Japanese document (no spaces), and in a Greek one with another accent', async () => {
  const lines = [
    '# 賃貸借契約書',
    '第1条 賃料は毎月末日までに前月分を支払うものとする。',
    '第2条 契約期間は二年間とし、期間満了の三ヶ月前までに解約の通知をしない限り自動的に更新される。',
    '第3条 借主は貸主の承諾なく本物件を転貸してはならない。',
    '第4条 敷金は契約終了時に原状回復費用を差し引いて返還する。',
  ];
  const filler = Array.from({ length: 40 }, (_, i) => `付則${i} 本契約に定めのない事項は、双方が誠意をもって協議し解決するものとする。${'あ'.repeat(30)}`);
  const text = '[doc · lines 1–50 of 50]\n' + [...lines, '', ...filler].map((l, i) => `${i + 1}\t${l}`).join('\n');
  const v = await program('document-qa', 'passages', { first: text, rest: [], questions: '契約期間はいつまでですか？\n敷金はいつ返還されますか？' }, () => null, locale('ja', { language: 'Japanese' }));
  const items = v.items as { question: string; context: string }[];
  assert.equal(items.length, 2);
  assert.match(items[0].context, /契約期間は二年間/, 'the term clause is found by 契約期間');
  assert.match(items[1].context, /敷金は契約終了時/, 'the deposit clause is found by 敷金');
  assert.doesNotMatch(items[0].context, /No part of the document shares words/);
  // A single line with two questions in full-width marks is two questions.
  const two = await program('document-qa', 'passages', { first: text, rest: [], questions: '契約期間はいつまでですか？敷金はいつ返還されますか？' });
  assert.equal((two.items as unknown[]).length, 2);
  // Greek: the question's accented words meet the document's (tonos stripped on both sides).
  const el = ['Άρθρο 1. Η διάρκεια της σύμβασης είναι δύο έτη.', 'Άρθρο 2. Η εγγύηση επιστρέφεται μετά τη λήξη.', ...Array.from({ length: 60 }, (_, i) => `Παράρτημα ${i}: λοιποί όροι και προϋποθέσεις που ισχύουν στην παρούσα συμφωνία.`)];
  const g = await program('document-qa', 'passages', { first: el.map((l, i) => `${i + 1}\t${l}`).join('\n'), rest: [], questions: 'Ποια είναι η ΔΙΑΡΚΕΙΑ της σύμβασης;' }, () => null, GREEK);
  assert.match((g.items as { context: string }[])[0].context, /δύο έτη/);
  // English still goes through its stop list: the same document question in English finds its passage.
  const en = await program('document-qa', 'passages', { first: ['1\tThe lease runs for two years.', ...Array.from({ length: 60 }, (_, i) => `${i + 2}\tOther terms and conditions apply to this agreement ${i}.`)].join('\n'), rest: [], questions: 'How long does the lease run?' });
  assert.match((en.items as { context: string }[])[0].context, /two years/);
});

test('Cover letter: its words are counted in any script, the English clichés are looked for only in an English letter, and the company may be named in either of its forms', async () => {
  const run = async (letter: string, company: string, forms: string[] = [], words = 350) => {
    const asked: string[] = [];
    const out = await program('cover-letter', 'polish', { letter, words, company, forms }, (tool, a) => {
      asked.push(String(a.problems ?? ''));
      return null;
    });
    return { out, asked };
  };
  // A Japanese letter of about 350 words is not one word long: nothing is said of its length.
  const ja = '拝啓　アクメ株式会社　採用ご担当者様。' + '私はデータ分析の仕事で三年間、毎週のレポートを作成し、チャーン予測モデルによって解約率を八パーセント下げました。'.repeat(14);
  const r = await run(ja, '株式会社アクメ', ['アクメ']);
  assert.deepEqual(r.out.left, [], 'a Japanese letter passes its length check and names the company');
  // Counted by spaces it would be one word: the old check asked for 350 and burned both revisions.
  assert.equal(r.out.rounds, 0);
  // In English the clichés are still found, and a letter far from its length is still caught.
  const en = 'I am writing to express my interest in the role at Acme. ' + 'I built the dashboards for the team and the reports for the managers. '.repeat(3);
  const e = await run(en, 'Acme', [], 350);
  assert.ok((e.out.left as string[]).some((p) => /is \d+ words long/.test(p)));
  assert.ok((e.out.left as string[]).some((p) => /i am writing to express/.test(p)), 'the cliché is found in English');
  // A German letter that happens to contain an English cliché in quotes is no English letter: not flagged.
  const de = 'Sehr geehrte Damen und Herren, ich bewerbe mich als Datenanalyst. Das Wort “team player” steht nicht in meinem Lebenslauf. ' + 'Ich habe Berichte und Dashboards für die Abteilung gebaut. '.repeat(3);
  const d = await run(de, 'Acme', ['アクメ'], 60);
  assert.ok(!(d.out.left as string[]).some((p) => /Say it without/.test(p)), 'no English clichés in a German letter');
  assert.ok((d.out.left as string[]).some((p) => /Name the company/.test(p)), 'but it does not name Acme in either form');
  // The company written in another script than the posting's: either form counts.
  const gr = await run('Αγαπητοί κύριοι, θέλω να εργαστώ στην Ακμή ως αναλυτής δεδομένων. ' + 'Έφτιαξα αναφορές για την ομάδα. '.repeat(12), 'Acme', ['Ακμή'], 60);
  assert.ok(!(gr.out.left as string[]).some((p) => /Name the company/.test(p)));
});

test('Meeting notes: due dates come as YYYY-MM-DD from a model reading Greek notes; the English parser still reads what is left as words', async () => {
  const parts = [{
    summary: 'Συζητήσαμε την κυκλοφορία.',
    decisions: ['Η κυκλοφορία μετατίθεται'],
    open_questions: [],
    actions: [
      { task: 'Ενημέρωση της σελίδας τιμών', owner: 'Μπεν', when: 'μέχρι την Παρασκευή', due: '2026-11-06' },
      { task: 'Έλεγχος από τη νομική υπηρεσία', owner: '', when: 'την επόμενη εβδομάδα', due: '' },
      { task: 'Report to the board', owner: 'Ana', when: 'next Friday', due: '' },
      { task: 'Αναφορά εξόδων', owner: 'Ανα', when: 'έως 15 Δεκεμβρίου', due: '2026-12-15' },
    ],
  }];
  const v = await program('meeting-actions', 'due', { parts, date: '2026-11-02', today: '2026-11-21' }, () => null, GREEK);
  const a = v.actions as Record<string, unknown>[];
  assert.equal(a[0].due, '2026-11-06', 'the model’s date for “μέχρι την Παρασκευή”');
  assert.equal(a[1].due, null, 'words the program cannot read stay as notes');
  assert.match(String(a[1].notes), /^\(Προθεσμία: την επόμενη εβδομάδα\)$/);
  assert.equal(a[2].due, '2026-11-13', 'English words are still read: next Friday after Monday 2 November');
  assert.equal(a[3].due, '2026-12-15');
  assert.equal(v.from, '2026-11-02');
  // The parts step gives the model the meeting’s day with its weekday.
  const p = await program('meeting-actions', 'parts', { notes: 'x', date: '2026-11-02', today: '2026-11-21' });
  assert.deepEqual([p.base, p.weekday], ['2026-11-02', 'Monday']);
  const q = await program('meeting-actions', 'parts', { notes: 'x', date: '', today: '2026-11-21' });
  assert.deepEqual([q.base, q.weekday], ['2026-11-21', 'Saturday'], 'no date: today');
});

test('Explain a contract: clauses start at §, “Άρθρο”, “Article”, “Artikel”, “第…条” and the usual numbers; a contract too long says so to the reader, in their language', async () => {
  const contract = (heads: string[]) => heads.flatMap((h) => [`${h} Titel`, 'x'.repeat(4000)]).join('\n');
  for (const heads of [['§ 1', '§ 2', '§ 3'], ['Άρθρο 1', 'Άρθρο 2', 'Άρθρο 3'], ['Article 1', 'Article 2', 'Article 3'], ['Artikel 1', 'Artikel 2', 'Artikel 3'], ['第1条', '第2条', '第3条'], ['1.', '2.', '3.'], ['Artículo 1', 'Artículo 2', 'Artículo 3']]) {
    const v = await program('explain-contract', 'clauses', { file: '', pasted: contract(heads) });
    const parts = v.items as { text: string }[];
    assert.equal(parts.length, 2, `${heads[0]}: 12,000 characters in clauses make two parts`);
    // Never in the middle of a clause: the second part starts at a heading.
    assert.ok(heads.some((h) => parts[1].text.startsWith(h)), `${heads[0]}: the second part starts at a clause`);
    assert.equal(v.cut, false);
    assert.equal(v.cut_note, '');
  }
  // Too long: ten parts are read, the rest is not, and the note says how much (in Greek here).
  const long = Array.from({ length: 14 }, (_, i) => `Άρθρο ${i + 1} Όροι\n${'y'.repeat(9000)}`).join('\n');
  const c = await program('explain-contract', 'clauses', { file: '', pasted: long }, () => null, GREEK);
  assert.equal(c.cut, true);
  assert.equal(c.count, 10);
  assert.match(String(c.cut_note), /^Διαβάστηκαν μόνο τα πρώτα 10 από 14 μέρη/);
  assert.match(String((await program('explain-contract', 'clauses', { file: '', pasted: long })).cut_note), /^Only the first 10 of 14 parts/);
  // Severity is kept as High, Medium or Low (the view filters by them), the clause word in the run’s language.
  const m = await program('explain-contract', 'merge', { parts: [{ terms: [], dates: [{ when: '2027-01-01', what: 'Λήξη', clause: '4' }], flags: [{ clause: '5', issue: 'Μονομερής λήξη', severity: 'high', ask: 'Αμοιβαία' }, { clause: '6', issue: 'Ποινή', severity: 'medium' }] }] }, () => null, GREEK);
  assert.equal((m.dates as { what: string }[])[0].what, 'Λήξη (όρος 4)');
  assert.deepEqual((m.flags as { severity: string }[]).map((f) => f.severity), ['High', 'Medium']);
  const f = await program('explain-contract', 'flags', { found: [], again: [{ clause: '1', issue: 'x', severity: 'serious' }, { clause: '2', issue: 'y', severity: 'low' }] });
  assert.deepEqual((f.red_flags as { severity: string }[]).map((x) => x.severity), ['High', 'Low']);
});

test('Trip planner: the days and the money are written in the run’s language (Intl), not in English constants', async () => {
  const el = await program('trip-planner', 'calendar', { start: '2026-11-23', days: 3, today: '2026-11-21' }, () => null, GREEK);
  assert.deepEqual((el.dates as { weekday: string }[]).map((d) => d.weekday), ['Δευτέρα', 'Τρίτη', 'Τετάρτη']);
  assert.equal(el.month, 'November', 'the month goes into English searches');
  const en = await program('trip-planner', 'calendar', { start: '2026-11-23', days: 2, today: '2026-11-21' });
  assert.deepEqual((en.dates as { weekday: string }[]).map((d) => d.weekday), ['Monday', 'Tuesday']);
  const ja = await program('trip-planner', 'calendar', { start: '2026-11-23', days: 1, today: '2026-11-21' }, () => null, locale('ja'));
  assert.equal((ja.dates as { weekday: string }[])[0].weekday, '月曜日');
  const plan = { dates: [{ day: 1, date: '2026-11-23' }], itinerary: [{ day: 1, area: 'Βαρκελώνη' }], media: {}, costs: [{ item: 'Ξενοδοχείο', low: 1200, high: 1500, note: '2 νύχτες' }, { item: 'Φαγητό', low: 300, high: 300 }], currency: 'EUR', home: 'USD', rate: 1.0812, rate_day: '2026-11-20', rate_from: 'Frankfurter', geo: [] };
  const v = await program('trip-planner', 'assemble', plan, () => null, GREEK);
  const budget = v.budget as { item: string; estimate: string }[];
  assert.equal(budget[0].estimate, '1.200–1.500 EUR (2 νύχτες)', 'Greek groups thousands with a dot');
  assert.equal(budget[2].item, 'Σύνολο');
  assert.equal(budget[2].estimate, '1.500–1.800 EUR (περίπου 1.622–1.946 USD με 1 EUR = 1,0812 USD, η ισοτιμία της 2026-11-20)');
  const e = await program('trip-planner', 'assemble', plan);
  const eb = (e.budget as { item: string; estimate: string }[])[2];
  assert.deepEqual([eb.item, eb.estimate], ['Total', '1,500–1,800 EUR (about 1,622–1,946 USD at 1 EUR = 1.0812 USD, the rate of 2026-11-20)']);
});

test('Compare products: a shop of the buyer’s country comes first among the prices, and the shops and testers of more countries are told apart', async () => {
  const hit = (n: number, title: string, url: string) => `[${n}] ${title}\n    ${url} (2026-11-10, article)\n    snippet`;
  const v = await program('compare-products', 'best', {
    product: 'Samsung Galaxy S26 Ultra',
    country: 'GR',
    reviews: { text: [hit(1, 'Samsung Galaxy S26 Ultra τιμή', 'https://www.skroutz.gr/s/123/samsung-galaxy-s26-ultra.html'), hit(2, 'Samsung Galaxy S26 Ultra review', 'https://www.insomnia.gr/reviews/samsung-galaxy-s26-ultra'), hit(3, 'Galaxy S26 Ultra', 'https://www.rakuten.co.jp/samsung-galaxy-s26-ultra/')].join('\n\n') },
    prices: { text: [hit(1, 'Galaxy S26 Ultra', 'https://www.amazon.com/dp/B0'), hit(2, 'Galaxy S26 Ultra 256GB', 'https://www.plaisio.gr/samsung-s26-ultra'), hit(3, 'Galaxy S26 Ultra', 'https://www.bestbuy.com/x')].join('\n\n') },
  });
  assert.equal(v.url, 'https://www.insomnia.gr/reviews/samsung-galaxy-s26-ultra', 'a Greek tester, not the Greek price-comparison site or a Japanese shop');
  assert.match(String(v.shops).split('\n')[0], /^- Galaxy S26 Ultra 256GB \(plaisio\.gr,/, 'the Greek shop first');
  const jp = await program('compare-products', 'best', { product: 'Sony WH-1000XM6', country: 'JP', reviews: { text: [hit(1, 'Sony WH-1000XM6 価格', 'https://kakaku.com/item/K0001/'), hit(2, 'Sony WH-1000XM6 レビュー', 'https://av.watch.impress.co.jp/docs/review/xm6.html')].join('\n\n') }, prices: { text: '' } });
  assert.equal(jp.url, 'https://av.watch.impress.co.jp/docs/review/xm6.html');
  // The words the weighing writes are in the run’s language.
  const names = ['A', 'B'];
  const facts = names.map((n, i) => ({ found: 'Yes', product: n, price: '€100', shop: 's', link: 'https://x.example', strengths: 's', weaknesses: 'w', problems: i ? 'p' : '', status: '', best_for: '', scores: [{ criterion: 'Ποιότητα', score: i ? null : 4, why: '' }] }));
  const w = await program('compare-products', 'score', { criteria: [{ criterion: 'Ποιότητα', weight: 3, good: '' }], facts, products: names, media: {}, budget: '' }, () => null, GREEK);
  assert.match(String(w.matrix), /^\| Προϊόν \| Ποιότητα \(×3\) \| Βαθμός \|/);
  assert.match(String(w.matrix), /\n\n\? Δεν βρέθηκε:/);
  assert.match(String((w.comparison as { weaknesses: string }[]).find((r: any) => r.product === 'B')!.weaknesses), /Γνωστό πρόβλημα: p/);
});

test('Quality of sources: other countries’ governments, universities, public broadcasters and agencies count as established; shops and social media do not', async () => {
  const tpl = templateById('deep-research')!;
  const rank = allSteps(tpl.flow!.steps).find((x) => x.id === 'rank') as CodeStep;
  const src = rank.code.slice(rank.code.indexOf('function quality'), rank.code.indexOf('\n}\n', rank.code.indexOf('function quality')) + 3);
  const quality = new Function(src + '\nreturn quality;')() as (site: string) => number;
  for (const site of ['statistics.gov.gr', 'insee.gouv.fr', 'ine.gob.es', 'mext.go.jp', 'ox.ac.uk', 'unsw.edu.au', 'uni-heidelberg.de', 'univ-paris1.fr', 'ethz.ch']) assert.equal(quality(site), 6, site);
  for (const site of ['nhk.or.jp', 'tagesschau.de', 'ert.gr', 'rtve.es', 'efe.com', 'ansa.it', 'bbc.com']) assert.equal(quality(site), 3, site);
  for (const site of ['facebook.com', 'amazon.de', 'youtube.com']) assert.equal(quality(site), -8, site);
  assert.equal(quality('someblog.example'), 0, 'nothing is taken from anyone else');
});

// ---- run -----------------------------------------------------------------------------------------------------------

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
process.exit(process.exitCode ?? 0);
