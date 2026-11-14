// Script test for the ready-made app "Compare products" (templates.ts): its steps check out, its question offers the
// options a run found as choices, and its programs give the right values on canned inputs. The products to compare
// are only ever products' names (a run once compared one "product" called "all, including chinese phones", the words
// a person typed when asked which to compare); a review of the very model comes before a page about something else;
// and the weighing leaves out what the research found nothing on, keeps to the budget and to one currency, and gives
// a runner-up and each product's score on each criterion.
// Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/apps/compare-test.ts
//   DATA_DIR=/tmp/hydor-test-compare HYDOR_APPS_DIR=/tmp/hydor-test-compare-apps node dist/dev/compare-test.js
import assert from 'node:assert/strict';
import { allSteps, cleanFlow, type AskStep, type CodeStep, type Scope } from '../../shared/app-manifest.ts';
import { askFields } from './flow.ts';
import { templateById } from './templates.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tests: [string, () => unknown][] = [];
const test = (name: string, fn: () => unknown) => void tests.push([name, fn]);
let passed = 0;

const T = templateById('compare-products')!;
const steps = allSteps(T.flow!.steps);
const stepOf = (id: string) => {
  const s = steps.find((x) => x.id === id);
  assert.ok(s, `a step called ${id}`);
  return s!;
};
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
/** A step's program as the sandbox runs it: its input through JSON. */
const program = async (id: string, input: Record<string, unknown>): Promise<any> => {
  const s = stepOf(id) as CodeStep;
  assert.equal(s.do, 'code', `${id} is a program`);
  return new AsyncFunction('input', 'ctx', s.code)(JSON.parse(JSON.stringify(input)), {});
};

const PHONES = ['Apple iPhone 18 Pro Max', 'Samsung Galaxy S26 Ultra', 'Google Pixel 11 Pro XL'];

test('its steps check out, and its question offers the options found as choices, all of them ticked', () => {
  assert.deepEqual(cleanFlow(T.flow).errors, []);
  const pick = stepOf('pick') as AskStep;
  const scope: Scope = {
    inputs: { products: 'The best smartphones', needs: 'good camera, high performance', choose: 'Yes' },
    steps: { options: { products: PHONES, why: PHONES.map((p) => ({ product: p, why: 'Rated well' })) } },
    vars: {},
  };
  const [products, more] = askFields(pick.fields, scope)!;
  assert.equal(products.type, 'choice');
  assert.equal(products.multi, true);
  assert.deepEqual(products.options, PHONES);
  assert.equal(products.default, PHONES.join('\n'), 'every option starts ticked');
  assert.equal(more.type, 'text', 'and a line for what to add or change');
});

test('the shortlist: never the words a person typed, only products’ names', async () => {
  // What made a run compare one "product" called "all, including chinese phones": now the options found are kept.
  let v = await program('shortlist', { named: 'No', products: [], options: PHONES, picked: 'all, including chinese phones', wanted: '', more: '', text: 'The best smartphones' });
  assert.deepEqual(v.items, PHONES);
  // Their words read by the model: the ones kept, with those of the kind they asked for added.
  v = await program('shortlist', { named: 'No', options: PHONES, picked: PHONES.join('\n'), wanted: PHONES, more: ['Xiaomi 17 Ultra', 'vivo X300 Pro'], text: '' });
  assert.deepEqual(v.items, [...PHONES, 'Xiaomi 17 Ultra', 'vivo X300 Pro']);
  assert.equal(v.count, 5);
  // Some unticked, nothing written.
  v = await program('shortlist', { named: 'No', options: PHONES, picked: 'Samsung Galaxy S26 Ultra\nGoogle Pixel 11 Pro XL', wanted: '', more: '' });
  assert.deepEqual(v.items, ['Samsung Galaxy S26 Ultra', 'Google Pixel 11 Pro XL']);
  // None ticked: all of the options.
  v = await program('shortlist', { named: 'No', options: PHONES, picked: '', wanted: '', more: '' });
  assert.deepEqual(v.items, PHONES);
  // Products named: each once (case and spaces aside), eight at most, names in any script kept apart.
  v = await program('shortlist', { named: 'Yes', products: ['Sony WH-1000XM5', 'sony wh-1000xm5 ', 'Bose QuietComfort Ultra'] });
  assert.deepEqual(v.items, ['Sony WH-1000XM5', 'Bose QuietComfort Ultra']);
  v = await program('shortlist', { named: 'Yes', products: ['小米 17 Ultra', '华为 Pura 80 Ultra'] });
  assert.equal(v.count, 2);
  v = await program('shortlist', { named: 'Yes', products: Array.from({ length: 12 }, (_, i) => `Phone ${i + 1}`) });
  assert.equal(v.count, 8);
  // A need with nothing found is an error, not the need's own words compared as a product.
  await assert.rejects(program('shortlist', { named: 'No', options: [], picked: '', wanted: '', more: '', text: 'The best smartphones available now' }), /No products were found/);
});

const results = (hits: [string, string, string][]) => ({ text: hits.map(([title, url, snippet], i) => `[${i + 1}] ${title}\n    ${url} (2026-11-10, article)\n    ${snippet}`).join('\n\n') });

test('a review of the very model, from a tester, before a page about something else; prices with their dates', async () => {
  const v = await program('best', {
    product: 'Samsung Galaxy S26 Ultra',
    reviews: results([
      ['Is it really worse to have a Chinese phone?', 'https://linustechtips.com/topic/1635628-is-it-really-worse/', 'Chinese devices…'],
      ['Galaxy S26 Ultra', 'https://www.samsung.com/us/smartphones/galaxy-s26-ultra/', 'The maker’s page'],
      ['Samsung Galaxy S26 Ultra review: the zoom king', 'https://www.gsmarena.com/samsung_galaxy_s26_ultra-review-2900.php', 'Our verdict…'],
    ]),
    prices: results([['Galaxy S26 Ultra 256GB', 'https://www.bestbuy.com/site/galaxy-s26-ultra/123.p', '$1,299.99']]),
  });
  assert.equal(v.url, 'https://www.gsmarena.com/samsung_galaxy_s26_ultra-review-2900.php');
  assert.match(v.shops, /^- Galaxy S26 Ultra 256GB \(bestbuy\.com, https:\/\/www\.bestbuy\.com\/site\/galaxy-s26-ultra\/123\.p, 2026-11-10\): \$1,299\.99$/);
});

const CRITERIA = [
  { criterion: 'Camera quality', weight: 5, good: 'Top-tier' },
  { criterion: 'Performance', weight: 5, good: 'Fast' },
  { criterion: 'Battery life', weight: 2, good: 'A full day' },
];
const fact = (product: string, price: string, s: number[], more: Record<string, unknown> = {}) => ({
  found: 'Yes',
  product,
  price,
  shop: 'A shop, 12 Nov 2026',
  link: `https://shop.example/${product.length}`,
  strengths: 'Great zoom\nFast chip',
  weaknesses: 'Heavy',
  problems: '',
  status: 'On sale now',
  best_for: 'Photographers',
  scores: CRITERIA.map((c, i) => ({ criterion: c.criterion, score: s[i], why: `${c.criterion} is fine` })),
  ...more,
});

test('weighing them up: what nothing was found on left out, the runner-up cheaper and nearly as good, each one’s scores', async () => {
  const names = ['Phone A', 'Phone B', 'Phone C', 'Phone D'];
  const facts = [
    fact('Phone A', '$1,199', [5, 5, 4], { problems: 'Green line on the screen' }),
    fact('Phone B', '$999', [5, 4, 4]),
    { found: 'No', product: 'Phone C' },
    fact('Phone D', '€699', [3, 3, 3]),
  ];
  const media = { items: names.map((n) => ({ item: n, picture: `https://img.example/${n.replace(' ', '')}.jpg` })) };
  const v = await program('score', { criteria: CRITERIA, facts, products: names, media, budget: '' });
  assert.deepEqual(
    v.comparison.map((r: any) => [r.product, r.score]),
    [
      ['Phone A', 97],
      ['Phone B', 88],
      ['Phone D', 60],
    ],
  );
  assert.equal(v.pick, 'Phone A');
  assert.equal(v.runner_up, 'Phone B');
  assert.equal(v.runner_up_why, 'cheaper, and nearly as good');
  assert.equal(v.missing, 'Phone C');
  assert.equal(v.several, true);
  assert.equal(v.count, 3);
  const a = v.comparison[0];
  assert.equal(a.picture, 'https://img.example/PhoneA.jpg', 'each keeps its own picture, by where it was in the list');
  assert.equal(a.weaknesses, 'Heavy\nKnown problem: Green line on the screen');
  assert.equal(a.scores.split('\n')[0], 'Camera quality: 5/5 — Camera quality is fine');
  assert.equal(a.shop, 'A shop, 12 Nov 2026');
  assert.match(v.matrix, /^\| Product \| Camera quality \(×5\) \| Performance \(×5\) \| Battery life \(×2\) \| Score \|\n\| --- \| --- \| --- \| --- \| --- \|\n\| Phone A \| 5 \| 5 \| 4 \| 97 \|/);
});

test('weighing them up: a score not found is no zero, but the middle of the others’, shown as “?”', async () => {
  const names = ['Phone A', 'Phone B', 'Phone C'];
  const facts = [fact('Phone A', '$1,199', [4, 4, 0]), fact('Phone B', '$999', [4, 3, 5]), fact('Phone C', '$899', [5, 3, 2])];
  facts[0].scores[2] = { criterion: 'Battery life', score: null, why: 'No battery test found' } as any;
  const v = await program('score', { criteria: CRITERIA, facts, products: names, media: {}, budget: '' });
  // A: 4·5 + 4·5 + 3.5·2 (the middle of 5 and 2) = 47 of 60.
  assert.equal(v.comparison.find((r: any) => r.product === 'Phone A').score, 78);
  assert.match(v.matrix, /\| Phone A \| 4 \| 4 \| \? \| 78 \|/);
  assert.match(v.matrix, /\n\n\? Not found: counted as the middle of the others’ scores\.$/);
  assert.equal(v.comparison.find((r: any) => r.product === 'Phone A').scores.split('\n')[2], 'Battery life: not found — No battery test found');
});

test('weighing them up: the budget, one currency at a time, a long price, and a single product', async () => {
  const names = ['Phone A', 'Phone B', 'Phone D'];
  const facts = [fact('Phone A', '$1,199', [5, 5, 4]), fact('Phone B', '$999', [5, 4, 4]), fact('Phone D', '€699', [3, 3, 3])];
  // Over the budget (by more than a tenth) goes last, and says so; a price in euros is not weighed against dollars.
  let v = await program('score', { criteria: CRITERIA, facts, products: names, media: {}, budget: 'under $1,000' });
  assert.deepEqual(
    v.comparison.map((r: any) => r.product),
    ['Phone B', 'Phone D', 'Phone A'],
  );
  assert.equal(v.runner_up, 'Phone D');
  assert.equal(v.runner_up_why, 'the next best overall');
  assert.match(v.comparison[2].weaknesses, /^Over your budget\n/);
  // A price written as a sentence is cut to its amount.
  v = await program('score', {
    criteria: CRITERIA,
    facts: [fact('Apple iPhone 17 Pro Max', 'CNY 8,381 (aggregator listing at mobile57.com, updated November 2026; not checked against a live shop)', [5, 5, 4])],
    products: ['x'],
    media: {},
    budget: '',
  });
  assert.equal(v.comparison[0].price, 'CNY 8,381');
  assert.equal(v.several, false, 'one product: no runner-up, and the call says it was the only one');
  assert.equal(v.runner_up, '');
  // Nothing found on any of them: they are still shown, rather than nothing.
  v = await program('score', {
    criteria: CRITERIA,
    facts: [
      { found: 'No', product: 'Phone A' },
      { found: 'No', product: 'Phone B' },
    ],
    products: ['Phone A', 'Phone B'],
    media: {},
    budget: '',
  });
  assert.equal(v.count, 2);
  assert.equal(v.missing, '');
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
process.exit(process.exitCode ?? 0);
