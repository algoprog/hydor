// Script tests for fixes to ready-made apps whose programs can be run alone, in the sandbox, with stand-ins for the
// services they reach through ctx (nothing here asks the network or a model): Meal plan and shopping list (amounts
// scaled to the people, dinners that do not suit the diet swapped), Game finder (a price only for the game asked for),
// Weekly news digest (every topic with stories keeps one), and the examples' checks of Match preview. Each program is the
// code step of a template, as the flow runs it.
// Build and run with scratch folders:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/apps/ready-made-test.ts
//   DATA_DIR=/tmp/hydor-test-ready node dist/dev/ready-made-test.js
import assert from 'node:assert/strict';
import { allSteps, type CodeStep } from '../../shared/app-manifest.ts';
import { runCode } from './code.ts';
import { templateById } from './templates.ts';

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
async function program(app: string, step: string, input: Record<string, unknown>, tools: (tool: string, a: Record<string, unknown>) => unknown = () => null): Promise<Record<string, unknown>> {
  const t = templateById(app)!;
  const s = allSteps(t.flow!.steps).find((x) => x.id === step) as CodeStep | undefined;
  assert.ok(s && s.do === 'code', `${app} has a program “${step}”`);
  const out = await runCode({
    language: s.language,
    code: s.code,
    input,
    slug: app,
    seconds: s.seconds ?? 20,
    onCall: async (kind, args) => {
      if (kind !== 'tool') throw new Error(`ctx has no ${kind} here`);
      const got = tools(String(args.tool), (args.with ?? {}) as Record<string, unknown>);
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

test('Trip planner: each day’s area is looked up (Open-Meteo near the destination, then OpenStreetMap a second apart), and what neither finds is left to the model', async () => {
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
  assert.ok(osm[1][1] - osm[0][1] >= 1000, 'OpenStreetMap is asked once a second');
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
  const bank = (tool: string, a: Record<string, unknown>) => (asked.push(String(a.url)), json(String(a.url), { amount: 1, base: 'EUR', date: '2026-11-20', rates: { USD: 1.0812 } }));
  const live = await program('trip-planner', 'fx', { currency: 'eur', home: 'USD', rate: 1.5 }, bank);
  assert.deepEqual([live.rate, live.date, live.source], [1.0812, '2026-11-20', 'Frankfurter']);
  assert.deepEqual(asked, ['https://api.frankfurter.app/latest?from=EUR&to=USD']);
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
