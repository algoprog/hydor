// Script tests for the Library's All overview of your own browsing (overview.ts): an empty database, bookmarks in the
// Library's order (duplicates dropped, the most used first, the address with or without its slash), Read later (read
// pages left out, the newest first, the limit), history (the latest, and with words the likeliest and the count of what
// matches), downloads and highlights (newest first, the limits, words), the route answering as browsingOverview does, and
// agents refused its route.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/browser/overview-test.ts
//   DATA_DIR=/tmp/hydor-test-overview node dist/dev/overview-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import type { BookmarkNode } from '../../shared/browser.ts';
import { HttpError } from '../auth.ts';
import { kvSet, openDb, type DB } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { ruleFor } from '../guide/api.ts';
import { addBookmark } from './bookmarks.ts';
import { addDownload } from './downloads.ts';
import { addHighlight } from './highlights.ts';
import { addVisit } from './history.ts';
import { addLater, loadLater, markLater } from './later.ts';
import { browsingOverview, OVERVIEW, overviewRoutes } from './overview.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-overview-test-'));
let n = 0;
/** A database of its own, in the scratch home. */
const fresh = (): DB => openDb(path.join(home, `test-${n++}.db`));

const BASE = 1_700_000_000_000;
const DAY = 86_400_000;

/** Puts the Read later pages' times as given (the store's own adds all happen in the same millisecond). */
function setAdded(db: DB, times: Record<string, number>) {
  const list = loadLater(db).map((x) => ({ ...x, addedAt: times[x.url] ?? x.addedAt }));
  kvSet(db, 'browser.later', JSON.stringify(list));
}

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

test('an empty database: every count 0 and every list empty', () => {
  const db = fresh();
  const o = browsingOverview(db, { now: BASE });
  assert.deepEqual(o, {
    bookmarks: { count: 0, items: [] },
    later: { count: 0, items: [] },
    history: { count: 0, items: [] },
    downloads: { count: 0, items: [] },
    highlights: { count: 0, items: [] },
  });
  assert.deepEqual(browsingOverview(db, { q: 'anything', now: BASE }).history, { count: 0, items: [] });
});

test('bookmarks in the Library order, duplicates dropped, the most used first', () => {
  const db = fresh();
  addBookmark(db, { title: 'A', url: 'https://a.example/' });
  const f = addBookmark(db, { title: 'F', parent: 'bar' }).node;
  addBookmark(db, { title: 'B', url: 'https://b.example/', parent: f.id });
  addBookmark(db, { title: 'C', url: 'https://c.example/', parent: 'other' });
  addBookmark(db, { title: 'D', url: 'https://a.example', parent: 'other' });
  let b = browsingOverview(db, { now: BASE }).bookmarks;
  assert.equal(b.count, 4, 'counted as the Bookmarks list shows them, D too');
  assert.deepEqual(b.items.map((x: BookmarkNode) => x.title), ['A', 'B', 'C'], 'D is A’s address again');
  // A match is never hidden by an earlier bookmark of the same page that does not match.
  const d = browsingOverview(db, { q: 'd', now: BASE }).bookmarks;
  assert.deepEqual([d.count, d.items.map((x: BookmarkNode) => x.title)], [1, ['D']]);

  for (let i = 0; i < 3; i++) addVisit(db, 'https://c.example/', 'C', false, BASE - i * 1000);
  b = browsingOverview(db, { now: BASE }).bookmarks;
  assert.deepEqual(b.items.map((x: BookmarkNode) => x.title), ['C', 'A', 'B'], 'C has visits, the others none');
});

test('a bookmark is ranked by its page’s history, with or without the slash', () => {
  const db = fresh();
  addBookmark(db, { title: 'Y', url: 'https://y.example/' });
  addBookmark(db, { title: 'X', url: 'https://x.example' });
  addVisit(db, 'https://x.example/', 'X', true, BASE);
  const b = browsingOverview(db, { now: BASE }).bookmarks;
  assert.deepEqual(b.items.map((x: BookmarkNode) => x.title), ['X', 'Y']);
});

test('bookmarks with words: only those with all of them, counted', () => {
  const db = fresh();
  addBookmark(db, { title: 'Pasta recipes', url: 'https://food.example/pasta' });
  addBookmark(db, { title: 'Bread', url: 'https://food.example/bread-recipe' });
  addBookmark(db, { title: 'Garden', url: 'https://plants.example/' });
  const o = browsingOverview(db, { q: 'RECIPE  food', now: BASE }).bookmarks;
  assert.equal(o.count, 2, 'both have the words in their title or address');
  assert.deepEqual(o.items.map((x: BookmarkNode) => x.title), ['Pasta recipes', 'Bread']);
  const pasta = browsingOverview(db, { q: 'pasta', now: BASE }).bookmarks;
  assert.deepEqual(pasta.items.map((x: BookmarkNode) => x.title), ['Pasta recipes']);
  assert.equal(pasta.count, 1);
});

test('read later: read pages left out, newest added first, at most 4', async () => {
  const db = fresh();
  const urls = ['https://a.example/', 'https://b.example/', 'https://c.example/', 'https://d.example/', 'https://e.example/', 'https://f.example/', 'https://g.example/'];
  for (const url of urls) addLater(db, { url, title: url.slice(8, 9).toUpperCase() });
  markLater(db, loadLater(db).find((x) => x.url === urls[2])!.id, true);
  setAdded(db, Object.fromEntries(urls.map((u, i) => [u, BASE + i])));
  const o = browsingOverview(db, { now: BASE }).later;
  assert.equal(o.count, 6, 'the read one is not counted');
  assert.deepEqual(o.items.map((x) => x.url), [urls[6], urls[5], urls[4], urls[3]]);
  assert.equal(OVERVIEW.later, 4);
  const words = browsingOverview(db, { q: 'e.example', now: BASE }).later;
  assert.deepEqual(words.items.map((x) => x.url), ['https://e.example/']);
});

test('history: the latest 6 with their count, and with words the matching pages', () => {
  const db = fresh();
  for (let i = 0; i < 8; i++) addVisit(db, `https://h${i}.example/`, i % 2 ? `Recipe number ${i}` : `Garden number ${i}`, false, BASE + i * 1000);
  const h = browsingOverview(db, { now: BASE + 8000 }).history;
  assert.equal(h.count, 8);
  assert.deepEqual(h.items.map((x) => x.url), ['https://h7.example/', 'https://h6.example/', 'https://h5.example/', 'https://h4.example/', 'https://h3.example/', 'https://h2.example/']);
  assert.equal(OVERVIEW.history, 6);

  const w = browsingOverview(db, { q: 'recipe', now: BASE + 8000 }).history;
  assert.equal(w.count, 4);
  assert.deepEqual(w.items.map((x) => x.url), ['https://h7.example/', 'https://h5.example/', 'https://h3.example/', 'https://h1.example/']);
});

test('downloads: newest first, at most 4, counts, words filter them', () => {
  const db = fresh();
  for (let i = 0; i < 6; i++) addDownload(db, { name: i < 3 ? `report-${i}.pdf` : `photo-${i}.jpg`, path: `/home/u/Downloads/f${i}`, url: `https://d.example/f${i}`, at: BASE + i });
  const d = browsingOverview(db, { now: BASE }).downloads;
  assert.equal(d.count, 6);
  assert.deepEqual(d.items.map((x) => x.name), ['photo-5.jpg', 'photo-4.jpg', 'photo-3.jpg', 'report-2.pdf']);
  assert.equal(OVERVIEW.downloads, 4);
  const r = browsingOverview(db, { q: 'REPORT', now: BASE }).downloads;
  assert.equal(r.count, 3);
  assert.deepEqual(r.items.map((x) => x.name), ['report-2.pdf', 'report-1.pdf', 'report-0.pdf']);
});

test('highlights: newest first, at most 3, counts, words filter them', () => {
  const db = fresh();
  for (let i = 0; i < 5; i++) addHighlight(db, { url: 'https://p.example/a', title: 'Page', text: `alpha ${i}` }, BASE + i);
  const h = browsingOverview(db, { now: BASE }).highlights;
  assert.equal(h.count, 5);
  assert.deepEqual(h.items.map((x) => x.text), ['alpha 4', 'alpha 3', 'alpha 2']);
  assert.equal(OVERVIEW.highlights, 3);
  const w = browsingOverview(db, { q: '3', now: BASE }).highlights;
  assert.equal(w.count, 1);
  assert.deepEqual(w.items.map((x) => x.text), ['alpha 3']);
});

test('the route answers as browsingOverview does, and agents are refused it', async () => {
  const db = fresh();
  addBookmark(db, { title: 'A', url: 'https://a.example/' });
  addVisit(db, 'https://a.example/', 'A', false, BASE);
  addDownload(db, { name: 'recipe.pdf', path: '/x/recipe.pdf', url: 'https://d.example/recipe.pdf', at: BASE });
  const app = Fastify();
  app.setErrorHandler((err: Error, _req, reply) => {
    reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message });
  });
  overviewRoutes({ app, db } as unknown as Deps);
  for (const q of ['', 'recipe']) {
    const r = await app.inject({ method: 'GET', url: `/api/browser/browsing/overview?q=${q}` });
    assert.equal(r.statusCode, 200);
    assert.deepEqual(r.json(), JSON.parse(JSON.stringify(browsingOverview(db, { q }))), `q=${q}`);
  }
  assert.equal(ruleFor('GET', '/api/browser/browsing/overview').level, 'refuse');
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n${(e as Error).stack}`);
  }
}
fs.rmSync(home, { recursive: true, force: true });
console.log(`${passed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
