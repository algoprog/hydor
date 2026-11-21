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
