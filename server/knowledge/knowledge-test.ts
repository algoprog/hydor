// Script tests for knowledge bases: passages that keep their page or heading, reading a folder (and reading it
// again when it changes), search by words, by meaning (a stand-in embedder) and for exact text, the agent's
// tools with their citations, a space's own bases beside the shared ones, and deleting. Build and run with a
// scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/knowledge/knowledge-test.ts
//   DATA_DIR=/tmp/hydor-test-knowledge node dist/dev/knowledge-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setSettings } from '../assistants/store.ts';
import { openDb, kvSet } from '../db.ts';
import type { RunCtx } from '../features/types.ts';
import { setEmbedderForTests } from '../memory/embed.ts';
import { words } from '../memory/store.ts';
import * as vec from '../memory/vectors.ts';
import { setSessionExtra } from '../sessionExtra.ts';
import { createSpace, deleteSpace, updateSpace } from '../spaces/index.ts';
import { fillVectors, filesUnder, passages, progress, scanSoon } from './indexer.ts';
import { basesFor } from './scope.ts';
import { searchKnowledge } from './search.ts';
import { addSource, baseRow, baseRows, baseView, createBase, deleteBase, docsOf, filesDir } from './store.ts';
import { knowledgeInstructions, knowledgeTools } from './tools.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-knowledge-test-'));
const db = openDb(path.join(tmp, 'test.db'));
setSettings(db, { taskRoot: path.join(tmp, 'Naget') });
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

// A made-up embedder, as memory's tests have: each word a fixed random direction (synonyms share one).
const SAME: Record<string, string> = { holiday: 'leave', vacation: 'leave', reimbursed: 'expenses', refund: 'expenses' };
function direction(c: string): Float32Array {
  let s = 0;
  for (const ch of c) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = (i: number) => {
    let h = (s ^ Math.imul(i + 1, 0x9e3779b9)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32 - 0.5;
  };
  return new Float32Array(vec.DIM).map((_, i) => rnd(3 * i) + rnd(3 * i + 1) + rnd(3 * i + 2));
}
const fake = (text: string) => {
  const v = new Float32Array(vec.DIM);
  for (const w of words(text)) {
    const d = direction(SAME[w] ?? w);
    for (let i = 0; i < vec.DIM; i++) v[i] += d[i];
  }
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
};
vec.setCodebookForTests(new Float32Array(vec.DIM * 16).map((_, i) => -0.12 + ((i % 16) * 0.24) / 15));

const folder = path.join(tmp, 'Handbook');
fs.mkdirSync(path.join(folder, 'policies'), { recursive: true });
fs.mkdirSync(path.join(folder, 'node_modules', 'x'), { recursive: true });
fs.mkdirSync(path.join(folder, '.git'), { recursive: true });
fs.writeFileSync(
  path.join(folder, 'policies', 'leave.md'),
  '# Leave policy\n\nEveryone gets 25 paid leave days a year.\n\n## Carrying over\n\nUp to five unused leave days carry over to the next year, until March 31.\n\n## Sick leave\n\nSick leave needs a doctor’s note after three days.',
);
fs.writeFileSync(path.join(folder, 'expenses.txt'), 'Expenses are reimbursed within 14 days. Keep every receipt; claims over 500 EUR need a manager’s approval. Order number format: EXP-2026-0042.');
fs.writeFileSync(path.join(folder, 'office.html'), '<html><head><title>Office</title><style>p{}</style></head><body><h1>The office</h1><p>The office opens at 8:30 and the coffee machine is on the second floor.</p></body></html>');
fs.writeFileSync(path.join(folder, 'node_modules', 'x', 'readme.md'), 'leave days in a dependency, never read');
fs.writeFileSync(path.join(folder, '.git', 'notes.md'), 'leave days in version control, never read');
fs.writeFileSync(path.join(folder, 'photo.jpg'), 'not text');

const ctx = { runId: 'r', key: 'claude:k', agent: 'claude', cwd: tmp, deps: { db } } as unknown as RunCtx;
const tool = (name: string) => knowledgeTools().find((t) => t.name === name)!;
const run = async (name: string, a: Record<string, unknown>) => String(await tool(name).run(a, ctx));
const settle = async () => {
  for (let i = 0; i < 200 && (progress.size || (await Promise.resolve(false))); i++) await new Promise((r) => setTimeout(r, 20));
  await new Promise((r) => setTimeout(r, 50));
};

test('passages keep the page, slide, sheet or heading they are in, and long text is cut with some overlap', () => {
  const p = passages('# Guide\n\nIntro.\n\n## Setup\n\nInstall it.\n\n### On a Mac\n\nUse brew.\n\n## Page 3\n\nA PDF page.');
  assert.deepEqual(
    p.map((x) => x.part),
    ['Guide', 'Guide › Setup', 'Guide › Setup › On a Mac', 'Page 3'],
  );
  assert.match(p[2].text, /^### On a Mac\n\nUse brew\.$/);
  const long = passages(Array.from({ length: 40 }, (_, i) => `Paragraph ${i} says something worth keeping, in a few words more.`).join('\n\n'));
  assert.ok(long.length >= 2 && long.every((x) => x.text.length <= 1600), `${long.length} passages`);
  // The second passage opens with the end of the first.
  assert.ok(long[0].text.slice(-200).includes(long[1].text.split('\n\n')[0].slice(0, 40)), 'overlap');
  assert.equal(passages('## Sheet: Budget (first 2000 rows of about 9000)\n\n| a |')[0].part, 'sheet Budget');
});

test('a folder: documents and text files, never dependencies, version control or pictures', () => {
  const files = filesUnder(folder).map((f) => path.relative(folder, f));
  assert.deepEqual(files, ['expenses.txt', 'office.html', 'policies/leave.md']);
});

test('reading a base: every document, its passages indexed by words at once', async () => {
  const b = createBase(db, { name: 'Handbook' });
  addSource(db, b.id, 'folder', folder);
  scanSoon(db, b.id);
  await settle();
  const docs = docsOf(db, b.id);
  assert.deepEqual(docs.map((d) => [d.title, d.status]), [['expenses.txt', 'indexed'], ['office.html', 'indexed'], ['leave.md', 'indexed']]);
  const v = baseView(db, baseRow(db, b.id));
  assert.equal(v.docs, 3);
  assert.equal(v.passages, 5);
  assert.equal(v.sources.length, 2);
  assert.equal(v.sources[0].kind, 'files');
  assert.match(knowledgeInstructions(db) ?? '', /Handbook \(3 documents\)[\s\S]*knowledge_search/);
});

test('by words: the passage that says it first, with its part', async () => {
  const r = await searchKnowledge(db, { query: 'how many unused leave days carry over', mode: 'words' });
  assert.equal(r.hits[0].title, 'leave.md');
  assert.equal(r.hits[0].part, 'Leave policy › Carrying over');
  assert.deepEqual(r.hits[0].by, ['words']);
  assert.equal(r.meaning, false);
  // HTML is read without its markup.
  const o = await searchKnowledge(db, { query: 'coffee machine' });
  assert.equal(o.hits[0].title, 'office.html');
  assert.doesNotMatch(o.hits[0].text, /<p>|p\{\}/);
});

test('exact text, as grep would: a phrase in quotes, an order number, a /pattern/', async () => {
  const q = await searchKnowledge(db, { query: '"manager’s approval"' });
  assert.equal(q.hits.length, 1);
  assert.deepEqual(q.hits[0].by, ['exact']);
  assert.equal((await searchKnowledge(db, { query: 'exp-2026-0042', mode: 'exact' })).hits[0].title, 'expenses.txt');
  const re = await searchKnowledge(db, { query: '/\\d+ paid leave days/' });
  assert.equal(re.hits.length, 1);
  assert.equal(re.hits[0].part, 'Leave policy');
  assert.equal((await searchKnowledge(db, { query: '"not anywhere at all"' })).hits.length, 0);
});

test('by meaning: in other words, once the passages have vectors; words and meaning together', async () => {
  kvSet(db, 'memory.meaning', '1');
  setEmbedderForTests(async (texts) => texts.map(fake));
  const made = await fillVectors(db);
  assert.equal(made, 5);
  assert.equal(baseView(db, baseRows(db)[0]).embedded, 5);
  // "vacation" is not in the handbook; "leave" is, and means the same here.
  const r = await searchKnowledge(db, { query: 'vacation carry over', mode: 'meaning' });
  assert.equal(r.meaning, true);
  assert.equal(r.hits[0].part, 'Leave policy › Carrying over');
  const both = await searchKnowledge(db, { query: 'how soon will my refund come' });
  assert.equal(both.hits[0].title, 'expenses.txt');
  assert.ok(both.hits[0].by.includes('meaning'));
});

test('the tools: passages with what to cite, more of a document around one, and what is in the bases', async () => {
  const out = await run('knowledge_search', { query: 'sick leave doctor' });
  assert.match(out, /^\d+ passages? from the user's knowledge bases\. Cite each one/);
  assert.match(out, /\[1\] leave\.md, Leave policy › Sick leave · Handbook · kb:\d+\n.*policies\/leave\.md\n## Sick leave/);
  const ref = /kb:\d+/.exec(out)![0];
  const read = await run('knowledge_read', { ref });
  assert.match(read, /^leave\.md \(.*leave\.md\), passages 2–3 of 3:/);
  assert.match(read, /\[2 · Leave policy › Carrying over\]/);
  const whole = await run('knowledge_read', { path: path.join(folder, 'policies', 'leave.md'), count: 1 });
  assert.match(whole, /passages 1–1 of 3[\s\S]*More from passage 2/);
  assert.match(await run('knowledge_list', {}), /- Handbook: 3 documents, 5 passages; folders: .*Handbook/);
  assert.match(await run('knowledge_list', { base: 'handbook' }), /Handbook: 3 documents\n- .*expenses\.txt \(1 passages\)/);
  await assert.rejects(() => run('knowledge_read', { ref: 'kb:999999' }), /No such passage/);
});

test('spaces: a space’s own base is searched by its sessions alone, the shared ones by every session unless a space leaves them out', async () => {
  const thesis = createSpace(db, { name: 'Thesis' });
  const papers = createBase(db, { name: 'Papers', space: thesis.id });
  fs.writeFileSync(path.join(filesDir(papers.id), 'notes.md'), '# Notes\n\nThe cohort study followed 412 dairy farmers for six years.');
  scanSoon(db, papers.id);
  await settle();
  const inThesis = 'claude:thesis1';
  setSessionExtra(db, inThesis, { space: thesis.id });
  // A child session searches as the session that started it.
  setSessionExtra(db, 'claude:thesis-child', { parent: inThesis });
  const search = async (key: string, query: string) => String(await tool('knowledge_search').run({ query, mode: 'words' }, { ...ctx, key }));
  assert.match(await search(inThesis, 'dairy farmers cohort'), /notes\.md, Notes · Papers · kb:\d+/);
  assert.match(await search('claude:thesis-child', 'dairy farmers cohort'), /notes\.md, Notes · Papers/);
  assert.match(await search(inThesis, 'sick leave doctor'), /leave\.md, Leave policy › Sick leave · Handbook/);
  assert.match(await search('claude:k', 'dairy farmers cohort'), /^Nothing in the knowledge bases matches/);
  // What agents are told: in the space, whose each base is; elsewhere, the shared ones alone.
  assert.match(knowledgeInstructions(db, thesis.id) ?? '', /Handbook \(3 documents, shared\), Papers \(1 document, this project’s own\)\./);
  assert.doesNotMatch(knowledgeInstructions(db) ?? '', /Papers/);
  // Another session cannot read the space's documents, by passage or by path.
  const ref = /kb:\d+/.exec(await search(inThesis, 'dairy farmers cohort'))![0];
  assert.match(String(await tool('knowledge_read').run({ ref }, { ...ctx, key: inThesis })), /The cohort study/);
  await assert.rejects(async () => tool('knowledge_read').run({ ref }, ctx), /not in a knowledge base this session searches/);
  await assert.rejects(async () => tool('knowledge_read').run({ path: path.join(filesDir(papers.id), 'notes.md') }, ctx), /not in a knowledge base this session searches/);
  assert.doesNotMatch(String(await tool('knowledge_list').run({}, ctx)), /Papers/);
  // The space leaves the shared knowledge out: its sessions search their own alone.
  updateSpace(db, thesis.id, { sharedKnowledge: false });
  assert.deepEqual(basesFor(db, thesis.id).map((b) => b.name), ['Papers']);
  assert.match(await search(inThesis, 'sick leave doctor'), /^Nothing in the knowledge bases matches/);
  assert.deepEqual(basesFor(db, null).map((b) => b.name), ['Handbook']);
  // A group that brings the space in searches its documents too, saying where they come from.
  const group = createSpace(db, { name: 'Research', members: [thesis.id] });
  setSessionExtra(db, 'claude:group1', { space: group.id });
  assert.match(await search('claude:group1', 'dairy farmers cohort'), /notes\.md, Notes · Papers/);
  assert.match(knowledgeInstructions(db, group.id) ?? '', /Papers \(1 document, from the Thesis project\)/);
  deleteSpace(db, group.id);
  // Deleting the space keeps its base, shared now.
  deleteSpace(db, thesis.id);
  assert.equal(baseRow(db, papers.id).space, null);
  assert.match(await search('claude:k', 'dairy farmers cohort'), /notes\.md, Notes · Papers/);
  deleteBase(db, papers.id);
});

test('reading again: a changed file is read anew, a deleted one leaves; deleting the base takes everything', async () => {
  const b = baseRows(db)[0];
  fs.writeFileSync(path.join(folder, 'expenses.txt'), 'Expenses are now reimbursed within 7 days.');
  fs.utimesSync(path.join(folder, 'expenses.txt'), new Date(), new Date(Date.now() + 5000));
  fs.rmSync(path.join(folder, 'office.html'));
  scanSoon(db, b.id);
  await settle();
  assert.deepEqual(docsOf(db, b.id).map((d) => d.title), ['expenses.txt', 'leave.md']);
  assert.equal((await searchKnowledge(db, { query: '"within 7 days"' })).hits.length, 1);
  assert.equal((await searchKnowledge(db, { query: '"within 14 days"' })).hits.length, 0);
  deleteBase(db, b.id);
  assert.equal(baseRows(db).length, 0);
  assert.equal((db.prepare('select count(*) as n from kb_chunks').get() as { n: number }).n, 0);
  assert.equal((db.prepare('select count(*) as n from kb_vectors').get() as { n: number }).n, 0);
  assert.equal(knowledgeInstructions(db), null);
  assert.ok(fs.existsSync(folder), 'the folder itself stays');
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.log(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
}
console.log(`\n${passed}/${tests.length} passed`);
setEmbedderForTests(null);
fs.rmSync(tmp, { recursive: true, force: true });
