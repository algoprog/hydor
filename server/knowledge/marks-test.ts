// Script tests for what knowledge remembers of a document beyond its text: the pin for wiki memory (a route, and the
// pin shown in the documents list) and the count of how often agents used it (knowledge_search and knowledge_read, not
// the page's own search box).
//   OUTDIR=dist/dev node scripts/build-server.mjs server/knowledge/marks-test.ts
//   DATA_DIR=/tmp/hydor-test-marks node dist/dev/marks-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { setSettings } from '../assistants/store.ts';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { setWikiSettings } from '../wiki/settings/settings.ts';
import { ensureWikiKnowledge } from '../wiki/knowledge/bindings.ts';
import { wikiRoot } from '../wiki/roots.ts';
import { setSessionExtra } from '../sessionExtra.ts';
import { createSpace } from '../spaces/index.ts';
import { documentsToRead, wikiReads } from '../wiki/digest/limit.ts';
import { knowledge } from './index.ts';
import { knowledgeEvents, type IndexedDoc } from './events.ts';
import { countUses, marksOf, setWikiPin } from './marks.ts';
import { createBase, docsOf, saveDoc } from './store.ts';
import { knowledgeTools } from './tools.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-marks-test-')));
const db = openDb(path.join(tmp, 'test.db'));
setSettings(db, { taskRoot: path.join(tmp, 'Naget') });
setWikiSettings(db, { enabled: true, hubPath: path.join(tmp, 'hub') });
const app = Fastify();
app.setErrorHandler((error, _request, reply) => reply.code((error as { status?: number }).status ?? 500).send({ error: (error as Error).message }));
knowledge.routes!({ app, db, broadcast: () => {} } as unknown as Deps);

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const folder = path.join(tmp, 'proj');
fs.mkdirSync(folder);
const proj = createSpace(db, { name: 'Proj', folder });
const base = createBase(db, { name: 'Proj docs', space: proj.id });
setSessionExtra(db, 'claude:k', { space: proj.id });
/** A document of the base, as the indexer would save it: older numbers are older files. */
const put = (name: string, age: number, text = `The ${name} document explains the zebrafish protocol in detail.`) =>
  saveDoc(db, { base: base.id, source: 's', path: `/d/${name}.md`, title: name, format: 'md', size: 100, mtime: 1_700_000_000_000 - age * 1000, status: 'indexed', chunks: [{ text }, { text: `${text} More of ${name}.` }] });
for (const [i, n] of ['a', 'b', 'c', 'd', 'e'].entries()) put(n, i * 10);
const id = (name: string) => docsOf(db, base.id).find((d) => d.path === `/d/${name}.md`)!.id;
const ctx = { runId: 'r', key: 'claude:k', agent: 'claude', cwd: folder, deps: { db } } as unknown as RunCtx;
const tool = (name: string) => knowledgeTools().find((t) => t.name === name)!;
const uses = (name: string) => marksOf(db, base.id).get(`/d/${name}.md`)?.uses ?? 0;
const rank = () => (documentsToRead(db, proj.id) ?? []).map((d) => path.basename(d.path, '.md'));
const docsRoute = async () => (await app.inject({ method: 'GET', url: `/api/knowledge/${base.id}/docs` })).json().docs as { id: number; path: string; wikiPin?: boolean }[];

test('marks: a pin and a count of uses, by base and path', () => {
  setWikiPin(db, base.id, '/d/a.md', true, 500);
  countUses(db, [{ base: base.id, path: '/d/b.md' }, { base: base.id, path: '/d/b.md' }, { base: base.id, path: '/d/c.md' }], 900);
  const m = marksOf(db, base.id);
  assert.deepEqual(m.get('/d/a.md'), { pinnedAt: 500, uses: 0, usedAt: 0 });
  assert.deepEqual(m.get('/d/b.md'), { pinnedAt: 0, uses: 1, usedAt: 900 }, 'a document counts once however many passages came');
  assert.equal(m.get('/d/d.md'), undefined);
  setWikiPin(db, base.id, '/d/a.md', false);
  assert.equal(marksOf(db, base.id).get('/d/a.md')!.pinnedAt, 0);
  setWikiPin(db, base.id, '/d/a.md', true, 600);
  countUses(db, [{ base: base.id, path: '/d/b.md' }], 1000);
  assert.equal(uses('b'), 2);
  assert.equal(marksOf(db, base.id).get('/d/b.md')!.usedAt, 1000);
});

test('marks stay with the document when it is read again after a change', () => {
  const before = id('a');
  put('a', 0, 'A new text about the zebrafish protocol, changed.');
  assert.notEqual(id('a'), before, 'a new row');
  assert.equal(marksOf(db, base.id).get('/d/a.md')!.pinnedAt, 600);
});

test('agents count: knowledge_search once for each document found, knowledge_read for the document; the page’s search box does not', async () => {
  const n = uses('b');
  const found = await tool('knowledge_search').run({ query: 'zebrafish protocol', mode: 'words', limit: 25 }, ctx);
  assert.match(String(found), /passage/);
  for (const name of ['a', 'b', 'c', 'd', 'e']) assert.ok(uses(name) >= 1, name);
  assert.equal(uses('b'), n + 1, 'two passages of b came back, one use');
  const r = await tool('knowledge_search').run({ query: 'nothing matches this zzzz', mode: 'words' }, ctx);
  assert.match(String(r), /Nothing/);
  const before = uses('e');
  await tool('knowledge_read').run({ path: '/d/e.md' }, ctx);
  assert.equal(uses('e'), before + 1);
  const page = await app.inject({ method: 'POST', url: '/api/knowledge/search', payload: { query: 'zebrafish protocol', mode: 'words' } });
  assert.equal(page.statusCode, 200);
  assert.ok(page.json().hits.length >= 1);
  assert.equal(uses('e'), before + 1, 'the page’s own search counts for nothing');
  assert.equal(uses('b'), n + 1);
});

test('a wiki’s own articles are not counted', async () => {
  const root = wikiRoot(db, proj.id, { create: true })!;
  const own = ensureWikiKnowledge(db, { root, space: proj.id });
  saveDoc(db, { base: own.base, source: 's', path: `${root}/wiki/z.md`, title: 'z', format: 'md', size: 10, mtime: 1, status: 'indexed', chunks: [{ text: 'zebrafish protocol article of the wiki' }] });
  assert.equal(marksOf(db, own.base).size, 0);
  const r = await tool('knowledge_search').run({ query: 'zebrafish protocol', mode: 'words', limit: 25 }, ctx);
  assert.ok(String(r).length > 0);
  assert.equal(marksOf(db, own.base).size, 0);
});

test('the pin route: pins and lets go, is listed with the documents, and tells the wiki to read it', async () => {
  const seen: IndexedDoc[] = [];
  const on = (d: IndexedDoc) => void seen.push(d);
  knowledgeEvents.on('indexed', on);
  const url = (n: string) => `/api/knowledge/documents/${id(n)}/wiki-pin`;
  const pinned = await app.inject({ method: 'PUT', url: url('d'), payload: { pin: true } });
  assert.deepEqual(pinned.json(), { id: id('d'), pinned: true });
  assert.deepEqual(seen.map((d) => d.path), ['/d/d.md']);
  assert.deepEqual((await docsRoute()).filter((d) => d.wikiPin).map((d) => path.basename(d.path, '.md')).sort(), ['a', 'd']);
  const off = await app.inject({ method: 'PUT', url: url('d'), payload: { pin: false } });
  assert.deepEqual(off.json(), { id: id('d'), pinned: false });
  assert.equal(seen.length, 1, 'letting go reads nothing');
  assert.deepEqual((await docsRoute()).filter((d) => d.wikiPin).map((d) => path.basename(d.path, '.md')), ['a']);
  knowledgeEvents.off('indexed', on);
  assert.equal((await app.inject({ method: 'PUT', url: url('d'), payload: { pin: 'yes' } })).statusCode, 400);
  assert.equal((await app.inject({ method: 'PUT', url: '/api/knowledge/documents/99999/wiki-pin', payload: { pin: true } })).statusCode, 404);
  const own = docsOf(db, ensureWikiKnowledge(db, { root: wikiRoot(db, proj.id)!, space: proj.id }).base)[0];
  assert.equal((await app.inject({ method: 'PUT', url: `/api/knowledge/documents/${own.id}/wiki-pin`, payload: { pin: true } })).statusCode, 404, 'a wiki’s own article is not a document to read');
});

test('over the limit the wiki reads the pinned, then the most used, then the newest, never more than the limit', () => {
  setWikiSettings(db, { documentLimit: 100 });
  assert.equal(documentsToRead(db, proj.id), null, 'within the limit: everything is read');
  assert.ok(wikiReads(db, proj.id, base.id, '/d/e.md'));
  setWikiSettings(db, { documentLimit: 3 });
  // a is pinned; b was used most (3), c once, d and e never; d is newer than e.
  assert.deepEqual(rank(), ['a', 'b', 'c']);
  assert.ok(uses('b') > uses('c'));
  assert.ok(wikiReads(db, proj.id, base.id, '/d/a.md') && !wikiReads(db, proj.id, base.id, '/d/e.md'));
  // A pin outranks use; the latest pin comes first.
  setWikiPin(db, base.id, '/d/e.md', true, 2000);
  assert.deepEqual(rank(), ['e', 'a', 'b']);
  setWikiPin(db, base.id, '/d/e.md', false);
  setWikiSettings(db, { documentLimit: 1 });
  assert.deepEqual(rank(), ['a']);
  // Used equally: the newest first. Without any mark, the newest.
  db.prepare('delete from kb_doc_marks').run();
  setWikiSettings(db, { documentLimit: 2 });
  assert.deepEqual(rank(), ['a', 'b'], 'a is the newest (mtime), then b');
  setWikiSettings(db, { documentLimit: 0 });
  assert.deepEqual(rank(), [], 'a limit of 0 reads none');
  setWikiSettings(db, { documentLimit: 100 });
});

(async () => {
  for (const [name, fn] of tests) {
    try {
      await fn();
      passed++;
      console.log(`ok  ${name}`);
    } catch (e) {
      console.error(`FAIL ${name}\n${(e as Error).stack}`);
      await app.close();
      db.close();
      fs.rmSync(tmp, { recursive: true, force: true });
      process.exit(1);
    }
  }
  console.log(`Knowledge marks: ${passed} tests passed`);
  await app.close();
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(0);
})();
