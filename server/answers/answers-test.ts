// Script tests for answer UIs: the catalog is whole (each UI named once, in a group, with what it is for, the data it
// takes and an example that is JSON, a short enough text for its vector, and a view in the pages), other names lead to
// real UIs, find_ui finds the UI a few words ask for (by words; by meaning with a stand-in model) and says how to write it,
// and every agent is told about them. Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/answers/answers-test.ts
//   DATA_DIR=/tmp/hydor-test-answers node dist/dev/answers-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ANSWER_UI_ALIASES, ANSWER_UI_GROUPS, ANSWER_UIS, answerUi } from '../../shared/answer-ui/index.ts';
import { APP_ROOT } from '../config.ts';
import { kvSet, openDb } from '../db.ts';
import type { RunCtx } from '../features/types.ts';
import { hashOf, setShippedForTests } from '../find/index.ts';
import { answerUiText } from '../find/sources.ts';
import { FORMATTING } from '../formatting/index.ts';
import { setEmbedderForTests } from '../memory/embed.ts';
import * as store from '../memory/store.ts';
import * as vec from '../memory/vectors.ts';
import { allUiNames, describeUi, findUiTool } from './index.ts';
import { dropUiIndex, findUis, uisByWords } from './search.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-answers-test-'));
const db = openDb(path.join(tmp, 'test.db'));
const ctx = { runId: 'r1', key: 'claude:t', agent: 'claude', cwd: tmp, deps: { db } } as unknown as RunCtx;

const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

test('the catalog: each UI named once, in a group, described, with a type and an example that is JSON', () => {
  assert.ok(ANSWER_UIS.length >= 8, 'there are UIs');
  const ids = new Set<string>();
  const groups = new Set(ANSWER_UI_GROUPS.map((g) => g.id));
  for (const s of ANSWER_UIS) {
    assert.match(s.id, /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, `${s.id}: a name of lowercase words joined by dashes`);
    assert.ok(!ids.has(s.id), `${s.id}: named once`);
    ids.add(s.id);
    assert.ok(groups.has(s.group), `${s.id}: its group ${s.group} is one the gallery shows`);
    assert.ok(s.title.trim() && s.title.length <= 40, `${s.id}: a short title`);
    assert.ok(s.use.trim().length >= 30 && s.use.length <= 240, `${s.id}: says what it is for in a sentence (${s.use.length} characters)`);
    assert.ok(s.keywords.split(/\s+/).length >= 5, `${s.id}: words to be found by`);
    assert.ok(s.shape.trim().startsWith('{'), `${s.id}: its data's type is an object`);
    assert.ok(s.example && typeof s.example === 'object' && !Array.isArray(s.example), `${s.id}: an example object`);
    assert.deepEqual(JSON.parse(JSON.stringify(s.example)), s.example, `${s.id}: its example is plain JSON`);
    const text = [s.title, 'An answer UI', s.use, s.keywords].join('. ');
    assert.ok(text.length <= 400, `${s.id}: its text for search fits (${text.length} of 400 characters), so nothing of it is cut`);
    assert.equal(answerUiText(s), text.replace(/\s+/g, ' ').trim());
    const json = JSON.stringify(s.example);
    assert.ok(!/lorem ipsum/i.test(json), `${s.id}: a real example`);
    for (const m of json.matchAll(/"(?:image|src|cover|poster|avatar|logo|photo|thumbnail)":"([^"]*)"/g)) assert.match(m[1], /^https:\/\//, `${s.id}: its example's pictures are addresses on the web`);
  }
  for (const g of ANSWER_UI_GROUPS) assert.ok(ANSWER_UIS.some((s) => s.group === g.id) || ANSWER_UIS.length < 20, `group ${g.id} has UIs`);
});

test('every UI has a view in the pages, and every view a UI', () => {
  const dir = path.join(APP_ROOT, 'web/src/components/answer/uis');
  const views = new Set<string>();
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.tsx'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    const block = /_UIS: Record<string, AnswerUiView> = \{([\s\S]*?)\n\};/.exec(src)?.[1] ?? '';
    for (const m of block.matchAll(/^\s*(?:'([a-z][a-z0-9-]*)'|([a-z][a-z0-9]*))\s*:/gm)) views.add(m[1] ?? m[2]);
  }
  for (const s of ANSWER_UIS) assert.ok(views.has(s.id), `${s.id}: drawn by a view (web/src/components/answer/uis)`);
  for (const v of views) assert.ok(ANSWER_UIS.some((s) => s.id === v), `the view ${v} draws a UI of the catalog`);
});

test('other names agents write lead to real UIs, and names are read loosely', () => {
  for (const [alias, id] of Object.entries(ANSWER_UI_ALIASES)) {
    if (!ANSWER_UIS.some((s) => s.id === id)) continue; // a UI still to come
    assert.ok(!ANSWER_UIS.some((s) => s.id === alias), `${alias}: not also a UI's own name`);
    assert.equal(answerUi(alias)?.id, id);
  }
  assert.equal(answerUi('Key Points')?.id, 'key-points', 'spaces and capitals');
  assert.equal(answerUi('key_points')?.id, 'key-points', 'underscores');
  assert.equal(answerUi('recipes')?.id, 'recipe', 'a plural');
  assert.equal(answerUi('nothing-like-it'), undefined);
  assert.equal(answerUi(''), undefined);
});

/** What a few words ask for, and the UI that should come first (or among the first three). */
const ASKS: [string, string, 1 | 3][] = [
  ['compare three e-readers side by side by price and weight', 'comparison', 1],
  ['recipe with ingredients and steps', 'recipe', 1],
  ['weather forecast for the week', 'weather', 1],
  ['line chart of temperatures over the year', 'chart', 1],
  ['table of rows and columns sortable', 'table', 1],
  ['restaurants nearby on a map', 'places', 1],
  ['quiz me with multiple choice questions', 'quiz', 1],
  ['tldr summary of the main points', 'key-points', 1],
  ['flight options from Boston to Athens', 'flights', 3],
  ['monthly mortgage payment', 'loan', 3],
  ['moon phase and planets visible tonight', 'sky', 3],
  ['premier league table', 'standings', 3],
  ['test a regular expression', 'regex', 3],
  ['day by day trip plan', 'itinerary', 3],
  ['pros and cons', 'pros-cons', 1],
  ['flashcards to study vocabulary', 'flashcards', 3],
  ['shopping list of products with prices', 'products', 3],
  ['countdown to new year', 'countdown', 1],
  ['benchmark results of models on metrics', 'results', 3],
  ['email draft to send', 'email', 1],
  ['troubleshoot why my router will not connect', 'decision-tree', 3],
  ['spin a wheel to pick a restaurant at random', 'picker', 1],
  ['venn diagram of overlapping skills', 'venn', 1],
  ['weekly class timetable', 'week', 3],
  ['gantt chart of the project schedule', 'gantt', 1],
  ['pomodoro and tea timers', 'timers', 3],
  ['track my parcel delivery', 'tracking', 3],
  ['next train departures from the station', 'departures', 3],
  ['elevation profile of the hike', 'elevation', 1],
  ['apartments for rent', 'listings', 3],
  ['job openings for a data scientist', 'jobs', 3],
  ['invoice for my client', 'invoice', 1],
  ['code review findings by severity', 'issues', 3],
  ['action items from the meeting', 'action-items', 3],
  ['qr code for the wifi network', 'qr', 1],
  ['histogram of exam scores', 'distribution', 3],
  ['waterfall chart of profit changes', 'waterfall', 1],
  ['treemap of disk usage', 'treemap', 1],
  ['calendar heatmap of my runs this year', 'activity', 3],
  ['city populations on a map', 'map-values', 3],
  ['my investment portfolio', 'portfolio', 1],
  ['plot the function sin x', 'graph', 3],
  ['fill in the blanks exercise', 'fill-blanks', 1],
  ['match the pairs', 'matching', 3],
  ['put the events in order', 'ordering', 3],
  ['conjugate the verb', 'conjugation', 1],
  ['dialogue to practise ordering coffee in Spanish', 'dialogue', 3],
  ['grading rubric for an essay', 'rubric', 1],
  ['chess opening position', 'chess', 1],
  ['cite this paper in APA', 'citation', 3],
  ['label the parts of a bike in a picture', 'annotated-image', 3],
  ['before and after photos', 'before-after', 1],
  ['guitar chords for the song', 'chords', 1],
  ['font pairing for my website', 'fonts', 1],
  ['contact details of the plumber', 'contact', 3],
  ['knockout tournament bracket', 'bracket', 1],
  ['server error logs', 'logs', 3],
  ['what does this cron expression mean', 'cron', 1],
  ['suggest next questions to ask', 'follow-ups', 1],
  ['related questions I can tap', 'follow-ups', 1],
  ['is this claim true or false', 'fact-check', 1],
  ['debunk myths with sources', 'fact-check', 1],
  ['mark up my essay with corrections', 'annotated-text', 1],
  ['proofread this paragraph and show grammar mistakes', 'annotated-text', 1],
  ['practice problems with hints and a score', 'practice', 1],
  ['maths exercises to answer and check', 'practice', 1],
  ['a concept map of the ideas', 'network', 1],
  ['relationships between characters', 'network', 1],
];

test('find_ui by words: the UI a few words ask for comes first', async () => {
  setEmbedderForTests(null);
  dropUiIndex();
  for (const [q, id, within] of ASKS) {
    if (!answerUi(id)) continue; // a UI still to come
    const top = uisByWords(q).slice(0, within).map((h) => h.item.id);
    assert.ok(top.includes(id), `“${q}” finds ${id} ${within === 1 ? 'first' : 'among the first three'} (got ${top.join(', ') || 'nothing'})`);
  }
  const { found, meaning } = await findUis(db, 'compare laptops side by side', 3);
  assert.equal(meaning, false, 'search by meaning is off');
  assert.equal(found[0]?.spec.id, 'comparison');
  assert.ok(found.length <= 3, 'at most k');
  assert.deepEqual((await findUis(db, '   ', 3)).found, [], 'nothing for no words');
  assert.equal((await findUis(db, 'show me a card with some of the', 3)).found.length, 0, 'words that say nothing of a UI find none');
});

test('find_ui by meaning too: both lists fused, a UI found by its meaning alone', async () => {
  // A stand-in for the model: a word's direction, words of a kind sharing one.
  const SAME: Record<string, string> = { drizzle: 'rain', downpour: 'rain', forecast: 'rain', weather: 'rain' };
  const direction = (w: string) => {
    let h = 2166136261;
    for (const c of w) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    const v = new Float32Array(vec.DIM);
    for (let i = 0; i < vec.DIM; i++) {
      h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
      v[i] = ((h >>> 0) / 0xffffffff) * 2 - 1;
    }
    return v;
  };
  const fake = (text: string) => {
    const v = new Float32Array(vec.DIM);
    for (const w of store.words(text)) {
      const d = direction(SAME[w] ?? w);
      for (let i = 0; i < vec.DIM; i++) v[i] += d[i];
    }
    const n = Math.hypot(...v) || 1;
    return v.map((x) => x / n);
  };
  kvSet(db, 'memory.meaning', '1');
  setEmbedderForTests(async (texts) => texts.map(fake));
  vec.setCodebookForTests(new Float32Array(vec.DIM * 16).map((_, i) => -0.12 + ((i % 16) * 0.24) / 15));
  setShippedForTests(new Map(ANSWER_UIS.map((s) => [hashOf(answerUiText(s)), vec.quantize(fake(answerUiText(s)))])));
  const { found, meaning } = await findUis(db, 'drizzle downpour', 3);
  assert.equal(meaning, true, 'search by meaning answered');
  assert.equal(found[0]?.spec.id, 'weather', '“drizzle downpour” is about the weather, in other words');
  assert.ok(found[0].meaning! > 0.25 && found[0].wordRank === undefined, 'found by meaning alone');
  const both = await findUis(db, 'weather forecast', 3);
  assert.equal(both.found[0]?.spec.id, 'weather');
  assert.ok(both.found[0].wordRank === 1 && both.found[0].meaning !== undefined, 'found both ways, fused');
  kvSet(db, 'memory.meaning', '0');
  setEmbedderForTests(null);
});

test('the tool: the UIs that fit with their data and an example, by name too, and how to write one', async () => {
  const tool = findUiTool();
  assert.equal(tool.name, 'find_ui');
  assert.equal(tool.annotations?.readOnlyHint, true);
  const r = await tool.run({ query: 'compare products side by side', k: 2 }, ctx);
  const text = typeof r === 'string' ? r : r.text;
  assert.match(text, /^The answer UIs that fit “compare products side by side”/);
  assert.match(text, /```ui <name>/, 'says how to write one');
  assert.match(text, /## comparison: Comparison table/);
  assert.match(text, /```ui comparison\n\{/, 'with an example to copy the form of');
  assert.ok((text.match(/^## /gm) ?? []).length <= 2, 'k of them');
  const byName = await tool.run({ names: ['compare', 'Recipe', 'no-such-ui'] }, ctx);
  const t2 = typeof byName === 'string' ? byName : byName.text;
  assert.match(t2, /## comparison:/, 'another name');
  assert.match(t2, /## recipe:/);
  assert.match(t2, /No UI is called “no-such-ui”/);
  const none = await tool.run({ names: ['no-such-ui'] }, ctx);
  assert.ok(typeof none !== 'string' && none.isError && /The UIs:/.test(none.text), 'a name that is none: the UIs by group');
  const empty = await tool.run({ query: '  ' }, ctx);
  assert.ok(typeof empty !== 'string' && empty.isError);
  const nothing = await tool.run({ query: 'show me some of the' }, ctx);
  assert.match(typeof nothing === 'string' ? nothing : nothing.text, /No answer UI matched/);
  assert.match(allUiNames(), /Compare and decide: .*comparison \(comparison table\)/);
  assert.match(describeUi(ANSWER_UIS[0], false), /^## [a-z-]+: .+\n.+\nData:\n\{/);
  assert.ok(!describeUi(ANSWER_UIS[0], false).includes('Example:'));
});

test('several parts of one answer: the UIs that fit each, each described once, an example for each part’s best', async () => {
  const tool = findUiTool();
  const r = await tool.run({ queries: ['day by day trip plan', 'weather forecast for the week', 'packing checklist', 'weather forecast for the week'] }, ctx);
  const text = typeof r === 'string' ? r : r.text;
  assert.match(text, /^The answer UIs for each part of your answer/);
  assert.match(text, /- “day by day trip plan”: [a-z-]+/);
  assert.match(text, /- “packing checklist”: [a-z-]+/);
  assert.equal((text.match(/- “weather forecast for the week”/g) ?? []).length, 1, 'a part asked twice is looked for once');
  assert.match(text, /## weather: /);
  assert.match(text, /```ui weather\n\{/, 'the best for a part comes with an example');
  const ids = [...text.matchAll(/^## ([a-z-]+):/gm)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'each UI described once');
  assert.ok(ids.length <= 12, 'at most twelve');
  assert.ok((text.match(/^Example:$/gm) ?? []).length <= 3, 'examples only for each part’s best');
  assert.match(text, /several blocks/, 'and says an answer may hold several');
  assert.match(text, /every answer in the conversation/, 'in any turn');
  const one = await tool.run({ queries: ['weather forecast'] }, ctx);
  assert.match(typeof one === 'string' ? one : one.text, /^The answer UIs for each part/, 'one part given as queries');
});

test('names beside queries: the UIs named first with their examples, then what the queries find, none twice', async () => {
  const tool = findUiTool();
  const r = await tool.run({ names: ['comparison', 'no-such-ui'], queries: ['weather forecast for the week', 'compare products side by side'] }, ctx);
  const text = typeof r === 'string' ? r : r.text;
  assert.match(text, /^The UIs you named \(comparison\), then the answer UIs for each part of your answer/);
  assert.match(text, /No UI is called “no-such-ui”/);
  assert.match(text, /```ui comparison\n\{/, 'a named UI comes with its example');
  assert.match(text, /## weather: /, 'and the queries’ finds');
  const ids = [...text.matchAll(/^## ([a-z-]+):/gm)].map((m) => m[1]);
  assert.equal(ids[0], 'comparison', 'the named first');
  assert.equal(new Set(ids).size, ids.length, 'each UI described once');
  const single = await tool.run({ names: ['recipe'], query: 'weather forecast' }, ctx);
  const t2 = typeof single === 'string' ? single : single.text;
  assert.match(t2, /^The UIs you named \(recipe\), then the answer UIs that fit “weather forecast”/);
  assert.match(t2, /## recipe: [\s\S]*## weather: /);
  const onlyBad = await tool.run({ names: ['no-such-ui'], query: 'weather forecast' }, ctx);
  assert.match(typeof onlyBad === 'string' ? onlyBad : onlyBad.text, /## weather: /, 'an unknown name beside a query still finds what the query asks');
});

test('every agent hears of answer UIs when it starts', () => {
  assert.match(FORMATTING, /find_ui/);
  assert.match(FORMATTING, /```ui <name>/);
  assert.match(FORMATTING, /stay text/, 'and when not to use one');
  assert.match(FORMATTING, /one answer may hold several/, 'and that an answer may hold several');
  assert.match(FORMATTING, /every answer you give, the first and every later one/, 'in every turn of the conversation, not only the first');
  assert.match(findUiTool().description, /any turn of the conversation/);
  // The UIs it names by situation are real ones, so an agent can ask find_ui for them by name.
  // Its names: the words joined by dashes, and each item of a list that is one word (what is in brackets is prose).
  const lists = [...FORMATTING.matchAll(/^ {2}- [^:]+: (.+)$/gm)].map((m) => m[1].replace(/\([^)]*\)/g, ''));
  assert.ok(lists.length >= 8, 'by kind of answer');
  const named = new Set<string>();
  for (const l of lists) {
    for (const t of l.match(/\b[a-z]+(?:-[a-z]+)+\b/g) ?? []) named.add(t);
    for (const p of l.split(/[,;]/).flatMap((p) => (p.split(':').pop() ?? '').split(/ or /))) if (/^[a-z]+$/.test(p.trim())) named.add(p.trim());
  }
  assert.ok(named.size >= 40, `it names UIs for each kind of answer (${named.size})`);
  for (const n of named) assert.ok(ANSWER_UIS.some((s) => s.id === n), `${n}: the formatting rules name a UI that is in the catalog`);
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`✗ ${name}\n  ${(e as Error).message}`);
  }
}
db.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `${failed} of ${tests.length} failed` : `all ${tests.length} passed`);
process.exit(failed ? 1 : 0);
