// Script tests for apps' views (shared/app-ui.ts): the template engine (values escaped, sections, formats, an
// item's key, Markdown that stays safe), tidying a view and checking it against its app, the words to translate,
// what a public page keeps of a view, a view in an app's folder, the frame's sources, and the ready-made apps'
// views (each checks out, and every name it uses is there in an answer of its app's shape).
// Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/apps/ui-test.ts
//   DATA_DIR=/tmp/hydor-test-ui node dist/dev/ui-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AnswerField, AppRecipe } from '../../shared/apps.ts';
import { cleanRecipe } from '../../shared/apps.ts';
import { checkUi, cleanUi, defaultUi, localUi, missingIn, translateUi, uiEngine, uiTexts, type AppUi, type UiScope } from '../../shared/app-ui.ts';
import { openDb } from '../db.ts';
import { ENGINE_SRC, UI_SRC } from '../pages/ui-kit.ts';
import { changesOf } from './edits.ts';
import { filesOf, readFolder } from './folder.ts';
import * as store from './store.ts';
import { TEMPLATES } from './templates.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const E = uiEngine();
const scope = (root: Record<string, unknown>, stack: UiScope['stack'] = []): UiScope => ({ root, stack, lang: 'en-US' });

// ---- the engine ----------------------------------------------------------------------------------------------------

test('engine: values are escaped, in text and in attributes; |markdown escapes what it is given before it formats it', () => {
  const s = scope({ result: { title: '<img src=x onerror=alert(1)>', note: 'a "quote" & <b>', md: '**bold** <script>x</script> [link](javascript:alert(1)) [ok](https://example.com/?a=1&b=2)' } });
  assert.equal(E.render('<h1 title="{{result.note}}">{{result.title}}</h1>', s), '<h1 title="a &quot;quote&quot; &amp; &lt;b&gt;">&lt;img src=x onerror=alert(1)&gt;</h1>');
  const md = E.render('{{result.md|markdown}}', s);
  assert.match(md, /<strong>bold<\/strong>/);
  assert.ok(!md.includes('<script>') && md.includes('&lt;script&gt;'), 'no script');
  assert.ok(!/href="javascript/i.test(md), 'no script link');
  assert.match(md, /<a href="https:\/\/example\.com\/\?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">ok<\/a>/);
});

test('engine: sections draw for each item, once for a record or a value, and only when empty with ^; an item’s fields come before the view’s names', () => {
  const s = scope({ result: { days: [{ day: 1, area: 'Alfama' }, { day: 2, area: '' }], who: { name: 'Ana' }, ok: 'Yes', none: [] }, area: 'outside' });
  assert.equal(E.render('{{#result.days}}[{{@number}}:{{day}} {{area}}{{^area}}free{{/area}}]{{/result.days}}', s), '[1:1 Alfama][2:2 free]');
  assert.equal(E.render('{{#result.who}}Hi {{name}}{{/result.who}}{{#result.ok}} ok{{/result.ok}}{{^result.none}} none{{/result.none}}', s), 'Hi Ana ok none');
  assert.equal(E.render('{{#result.days}}{{#@first}}first {{/@first}}{{#@last}}last{{/@last}}{{/result.days}}', s), 'first last');
  // A name outside the item is the view's: {{item}} is what the block drew the element for.
  assert.equal(E.render('{{area}}|{{item.area}}', scope({ area: 'outside' }, [{ v: { area: 'inside' }, item: true }])), 'inside|inside');
});

test('engine: @key is an item’s id, else its place in the list as it came; state.done.@key reads what was kept for it', () => {
  const s = scope({ state: { done: { a1: true, '1': true } }, result: { rows: [{ id: 'a1' }, { id: 'b2' }], plain: ['x', 'y'] } });
  assert.equal(E.render('{{#result.rows}}{{@key}}={{#state.done.@key}}✓{{/state.done.@key}}{{^state.done.@key}}·{{/state.done.@key}} {{/result.rows}}', s), 'a1=✓ b2=· ');
  assert.equal(E.render('{{#result.plain}}{{@key}}{{#state.done.@key}}✓{{/state.done.@key}} {{/result.plain}}', s), '0 1✓ ');
});

test('engine: formats', () => {
  const s = scope({
    d: '2026-11-20',
    n: 1250.5,
    t: 'Very High',
    list: [{ k: 'a', v: '10 EUR' }, { k: 'b', v: '25 EUR' }, { k: 'a', v: '5 EUR' }],
    words: 'one; two\nthree',
    url: 'https://www.example.com/a/b',
    empty: '',
    state: { pick: 'b' },
  });
  const f = (x: string) => E.fill(`{{${x}}}`, s);
  assert.equal(f('d|date'), 'Fri, Nov 20, 2026');
  assert.equal(f('d|weekday'), 'Friday');
  assert.equal(f('d|shortdate'), 'Nov 20');
  assert.equal(f('d|longdate'), 'November 20, 2026');
  assert.equal(f('n|number'), '1,250.5');
  assert.equal(f('n|plus:1'), '1251.5');
  assert.equal(f('t|slug'), 'very-high');
  assert.equal(f('t|initials'), 'VH');
  assert.equal(f('t|upper'), 'VERY HIGH');
  assert.equal(f('t|short:6'), 'Very…');
  assert.equal(f('url|host'), 'example.com');
  assert.equal(f('t|url'), 'Very%20High');
  assert.equal(f('list|count'), '3');
  assert.equal(f('list|unique:k|join: / '), 'a / b');
  assert.equal(f('list|where:k=a|count'), '2');
  assert.equal(f('list|where:k=$state.pick|first|json'), '{"k":"b","v":"25 EUR"}');
  assert.equal(f('list|sum:v'), '40');
  assert.equal(f('list|sort:-v|first|json'), '{"k":"b","v":"25 EUR"}');
  assert.equal(f('words|split|count'), '3');
  assert.equal(f('empty|or:nothing'), 'nothing');
  assert.equal(E.fill('{{#t|has:high}}yes{{/t}}{{#n|over:1000}} big{{/n}}{{#t|is:very high}} same{{/t}}{{^t|not:Very High}} not-not{{/t}}', s), 'yes big same not-not');
  // A list's where with an empty value to match keeps them all (a filter not picked yet).
  assert.equal(f('list|where:k=$state.none|count'), '3');
});

test('engine: mistakes in a template are said; text for a message keeps lists as lines; a value alone keeps its kind', () => {
  assert.match(E.parse('{{#a}}x{{/b}}').error!, /closes \{\{#a\}\}/);
  assert.match(E.parse('{{#a}}x').error!, /never closed/);
  assert.match(E.parse('{{a b}}').error!, /not a value's name/);
  const s = scope({ result: { qs: ['One?', 'Two?'], n: 3 }, inputs: { days: '4' } });
  assert.equal(E.fill('Ask:\n{{result.qs}}', s), 'Ask:\n- One?\n- Two?');
  assert.deepEqual(E.valueOf({ list: '{{result.qs}}', n: '{{result.n}}', days: '{{inputs.days|plus:1}}', text: 'Day {{inputs.days}}' }, s), { list: ['One?', 'Two?'], n: 3, days: 5, text: 'Day 4' });
  assert.equal(E.test('result.qs|count|over:1', s), true);
  assert.equal(E.test('!result.qs', s), false);
  assert.equal(E.test('result.nothing', s), false);
});

test('engine: values put in order as numbers, dates and text', () => {
  assert.ok(E.order('2026-11-10', '2026-11-12') < 0 && E.order('2026-11-14', '2026-11-11') > 0, 'dates');
  assert.ok(E.order(9, 10) < 0 && E.order('€120', '€90') > 0, 'numbers, and the numbers in text');
  assert.ok(E.order('apple', 'banana') < 0, 'text');
});

// ---- tidying and checking a view ---------------------------------------------------------------------------------------

const recipe = (p: Partial<AppRecipe> = {}): AppRecipe =>
  cleanRecipe({
    name: 'Trips',
    prompt: 'Plan {{days}} days in {{city}}',
    fields: [
      { id: 'city', label: 'City', type: 'text', required: true },
      { id: 'days', label: 'Days', type: 'number' },
    ],
    answer: [
      { id: 'summary', label: 'Summary', type: 'markdown' },
      { id: 'days', label: 'Days', type: 'table', columns: [{ id: 'day', label: 'Day', type: 'number' }, { id: 'plan', label: 'Plan', type: 'text' }] },
    ],
    ...p,
  });

const VIEW = {
  pages: [
    { id: 'main', title: 'Your trip', blocks: [{ title: 'Days', element: 'day', data: 'result.days', each: true }, { text: '{{result.summary}}' }] },
    { id: 'day', title: 'Day', tab: false, blocks: [{ element: 'day', data: 'page.item' }] },
  ],
  elements: { day: { html: '<article><h3>Day {{day}}</h3><p>{{plan}}</p><button data-event="open">Open</button><button data-event="again">Two more days</button></article>', css: 'h3 { margin: 0 }' } },
  events: { open: [{ do: 'page', page: 'day', item: '{{item}}' }], again: [{ do: 'again', inputs: { days: '{{inputs.days|plus:2}}' } }] },
};

test('a view: tidied, kept by a recipe, and its mistakes said in words', () => {
  const r = recipe({ ui: VIEW as unknown as AppUi });
  assert.deepEqual(r.ui!.pages.map((p) => p.id), ['main', 'day']);
  assert.equal(r.ui!.elements!.day.css, 'h3 { margin: 0 }');
  assert.deepEqual(checkUi(r), { errors: [], warnings: [] });
  const bad = cleanUi({ pages: [{ id: '1x', title: 'A', blocks: [{ element: 'x', html: '<p>' }, {}] }], elements: { Day: { html: '<p>' }, table: { html: '<p>' } }, events: { go: [{ do: 'fly' }] } });
  const said = bad.errors.join(' | ');
  for (const re of [/an id is a letter/, /one of element, html or text, not more/, /say what it draws/, /small letters, digits and -/, /built-in element's/, /“fly” is not an action/]) assert.match(said, re);
  assert.deepEqual(cleanUi({ pages: [] }).errors, ['Its view needs pages: [{ "id": "main", "title": "…", "blocks": [...] }]']);
});

test('a view checked against its app: elements, pages, flows and lists it names, answers and questions it uses, events', () => {
  const r = recipe({
    ui: {
      pages: [{ id: 'main', title: 'Main', blocks: [{ element: 'nope' }, { text: '{{result.missing}} {{inputs.nope}}' }, { element: 'card', data: 'data.items', each: true }, { element: 'form' }] }],
      elements: { card: { html: '<p data-event="go">{{x}}</p><p data-event="silent">y</p>' }, spare: { html: '<p>' } },
      events: { go: [{ do: 'page', page: 'elsewhere' }, { do: 'run', flow: 'other' }, { do: 'data', op: 'add', collection: 'items', record: { a: 1 } }, { do: 'again', inputs: { zone: 1 } }], unused: [{ do: 'say', text: 'hi' }], asks: [{ do: 'ask', text: 'more' }] },
    } as unknown as AppUi,
    flow: { steps: [{ id: 'one', do: 'model', instructions: 'Plan {{city}}' }] },
  });
  const { errors, warnings } = checkUi(r);
  const e = errors.join(' | ');
  const w = warnings.join(' | ');
  for (const re of [/there is no element “nope”/, /it keeps no list “items”/, /there is no page “elsewhere”/, /it has no flow “other”/, /its form has no question “zone”/]) assert.match(e, re);
  for (const re of [/its answer has no field “missing”/, /its form has no question “nope”/, /Element “spare” is on no page/, /the event “silent”, which does nothing/, /Event “unused”: no element sends it/, /a run with steps takes no follow-ups/, /a form shows on the app's own page only/]) assert.match(w, re);
});

test('a view and a run: the names it uses that a run’s answer did not give', () => {
  const ui = recipe({ ui: VIEW as unknown as AppUi }).ui!;
  assert.deepEqual(missingIn(ui, { result: { summary: 'x', days: [{ day: 1, plan: 'Walk' }] }, inputs: { city: 'Lisbon' } }), []);
  assert.deepEqual(missingIn(ui, { result: { days: [{ day: 1 }] }, inputs: {} }), ['main: {{plan}}', 'main: {{result.summary}}']);
});

test('a view’s words, for the dictionaries, and the view in another language with its values kept', () => {
  const ui = recipe({ ui: VIEW as unknown as AppUi }).ui!;
  assert.deepEqual(uiTexts(ui), ['Your trip', 'Day', 'Days', 'Day {0}', 'Open', 'Two more days']);
  const el = translateUi(ui, (t) => ({ 'Day {0}': 'Μέρα {0}', 'Your trip': 'Το ταξίδι σου', Open: 'Άνοιγμα' })[t] ?? t);
  assert.equal(el.pages[0].title, 'Το ταξίδι σου');
  assert.equal(el.elements!.day.html, '<article><h3>Μέρα {{day}}</h3><p>{{plan}}</p><button data-event="open">Άνοιγμα</button><button data-event="again">Two more days</button></article>');
});

test('a public page keeps a run’s pages, and of its events only what happens on the page itself (nothing kept)', () => {
  const ui = cleanUi({
    pages: [{ id: 'main', title: 'Main', blocks: [{ text: 'x' }] }, { id: 'home', title: 'Home', on: 'app', blocks: [{ element: 'form' }] }],
    events: { tick: [{ do: 'toggle', name: 'done.@key', keep: true }], again: [{ do: 'again' }], mix: [{ do: 'copy', text: 'x' }, { do: 'start', app: 'tpl:x' }] },
  }).ui!;
  const pub = localUi(ui)!;
  assert.deepEqual(pub.pages.map((p) => p.id), ['main']);
  assert.deepEqual(pub.events, { tick: [{ do: 'toggle', name: 'done.@key' }], mix: [{ do: 'copy', text: 'x' }] });
  assert.equal(localUi(cleanUi({ pages: [{ id: 'home', title: 'Home', on: 'app', blocks: [{ text: 'x' }] }] }).ui), undefined);
});

test('a view to start from: a block for each answer field, in the built-in elements', () => {
  const ui = defaultUi(recipe());
  assert.deepEqual(ui.pages[0].blocks, [
    { title: 'Summary', element: 'markdown', data: 'result.summary' },
    { title: 'Days', element: 'table', data: 'result.days' },
  ]);
  assert.deepEqual(checkUi(recipe({ ui })), { errors: [], warnings: [] });
});

test('a version says what changed in a view', () => {
  const a = recipe();
  const b = recipe({ ui: VIEW as unknown as AppUi });
  assert.match(changesOf(a, b).join(' '), /It has a view of its own now/);
  const c = recipe({ ui: { ...VIEW, elements: { day: { html: '<p>{{day}}</p>' } } } as unknown as AppUi });
  assert.match(changesOf(b, c).join(' '), /Its view changed \(the element day\)/);
  assert.match(changesOf(b, a).join(' '), /Its view was removed/);
});

test('a view in an app’s folder: each element as HTML and CSS of its own, read back as it was', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-ui-test-'));
  const db = openDb(path.join(tmp, 'test.db'));
  store.ensureTables(db);
  const a = store.saveApp(db, { recipe: recipe({ ui: { ...VIEW, style: '.x { color: red }' } as unknown as AppUi }) });
  const files = filesOf(db, a);
  assert.equal(files['ui/day.html'], `${VIEW.elements.day.html}\n`);
  assert.equal(files['ui/day.css'], 'h3 { margin: 0 }\n');
  assert.equal(files['ui/style.css'], '.x { color: red }\n');
  const json = JSON.parse(files['app.json']);
  assert.deepEqual(json.ui.elements.day, { html: { file: 'ui/day.html' }, css: { file: 'ui/day.css' } });
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(tmp, 'app', rel)), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'app', rel), text);
  }
  const back = readFolder(path.join(tmp, 'app'));
  assert.deepEqual(back.errors, []);
  assert.deepEqual(cleanRecipe(back.recipe).ui, a.ui);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('the frame’s sources: the view’s kit and the engine run as the text sent', () => {
  const engine = new Function(`return (${ENGINE_SRC})()`)();
  assert.equal(engine.render('<b>{{x|upper}}</b>', { root: { x: 'hi' }, stack: [] }), '<b>HI</b>');
  assert.equal(typeof new Function(`return (${UI_SRC})`)(), 'function');
  assert.ok(!/<\/script/i.test(UI_SRC + ENGINE_SRC), 'nothing ends the script element');
});

// ---- the ready-made apps' views ------------------------------------------------------------------------------------------

/** An answer in the shape of its fields, every field there. */
function answerOf(answer: AnswerField[]): Record<string, unknown> {
  const cell = (type: string, n: number): unknown => (type === 'number' ? n : type === 'yesno' ? true : type === 'date' ? `2026-11-2${n}` : type === 'url' ? `https://example.com/${n}` : `text ${n}`);
  return Object.fromEntries(
    answer.map((f) => [f.id, f.type === 'table' ? [1, 2].map((n) => Object.fromEntries((f.columns ?? []).map((c) => [c.id, cell(c.type, n)]))) : f.type === 'list' ? ['one', 'two'] : f.type === 'media' ? [{ src: 'https://example.com/1.jpg', kind: 'image' }] : cell(f.type, 1)]),
  );
}

test('ready-made apps: each of the twenty-seven has a view of pages and elements of its own that checks out, uses only what its answer and form give, and has events', () => {
  const tasks = TEMPLATES.filter((t) => !t.block);
  assert.equal(tasks.length, 27);
  for (const t of tasks) {
    assert.ok(t.ui, `${t.id}: a view`);
    assert.ok(t.ui!.pages.filter((p) => p.tab !== false).length >= 2, `${t.id}: pages`);
    assert.ok(Object.keys(t.ui!.elements ?? {}).length >= 3, `${t.id}: elements of its own`);
    assert.ok(Object.keys(t.ui!.events ?? {}).length >= 1, `${t.id}: events`);
    assert.deepEqual(checkUi(t), { errors: [], warnings: [] }, `${t.id}: checks out`);
    const inputs = Object.fromEntries(t.fields.map((f) => [f.id, f.options?.[0] ?? (f.type === 'number' ? '3' : f.type === 'date' ? '2026-11-20' : 'x')]));
    assert.deepEqual(missingIn(t.ui!, { result: answerOf(t.answer), inputs }), [], `${t.id}: every name it uses is given`);
    for (const el of Object.values(t.ui!.elements ?? {})) assert.equal(E.parse(el.html).error, undefined);
    assert.ok(uiTexts(t.ui).length > 5, `${t.id}: words to translate`);
  }
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
