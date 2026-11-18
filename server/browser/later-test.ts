// Script tests for your Read later list (later.ts): setting a page aside (a web page only, the same one once), marking it as
// read and back, removing it, the list's limit, and that agents are refused its routes.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/browser/later-test.ts
//   DATA_DIR=/tmp/hydor-test-later node dist/dev/later-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import type { LaterItem } from '../../shared/browser.ts';
import { HttpError } from '../auth.ts';
import { kvSet, openDb } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { ruleFor } from '../guide/api.ts';
import { laterRoutes, loadLater, MAX_LATER } from './later.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-later-test-'));
const db = openDb(path.join(home, 'test.db'));
const app = Fastify();
app.setErrorHandler((err: Error, _req, reply) => {
  reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message });
});
laterRoutes({ app, db } as unknown as Deps);

async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown) {
  const r = await app.inject({ method, url, payload: body as object | undefined });
  return { status: r.statusCode, body: r.json() as Record<string, any> };
}

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const wipe = () => db.prepare("delete from kv where k = 'browser.later'").run();

test('a page is set aside, newest last, with its title tidied', async () => {
  wipe();
  assert.deepEqual((await call('GET', '/api/browser/browsing/later')).body.items, []);
  const a = await call('POST', '/api/browser/browsing/later', { url: 'https://a.example/post', title: '  A \n post  ' });
  assert.equal(a.status, 200);
  assert.equal(a.body.item.title, 'A post');
  assert.equal(a.body.existed, false);
  await call('POST', '/api/browser/browsing/later', { url: 'http://b.example/' });
  const list = (await call('GET', '/api/browser/browsing/later')).body.items as LaterItem[];
  assert.deepEqual(list.map((n) => n.url), ['https://a.example/post', 'http://b.example/']);
  assert.equal(list[1].title, 'http://b.example/', 'without a title, its address');
});

test('only web pages are set aside', async () => {
  wipe();
  for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'about:blank', 'chrome://settings', 'data:text/html,hi', '', 'nope', 'https://x.example/' + 'a'.repeat(4000)]) {
    const r = await call('POST', '/api/browser/browsing/later', { url });
    assert.equal(r.status, 400, url.slice(0, 40));
  }
  assert.equal(loadLater(db).length, 0);
});

test('the same page twice is one, back at the end and waiting again', async () => {
  wipe();
  const a = (await call('POST', '/api/browser/browsing/later', { url: 'https://a.example/', title: 'A' })).body.item as LaterItem;
  await call('POST', '/api/browser/browsing/later', { url: 'https://b.example/', title: 'B' });
  await call('PATCH', `/api/browser/browsing/later/${a.id}`, { read: true });
  const again = await call('POST', '/api/browser/browsing/later', { url: 'https://a.example/', title: 'A, new title' });
  assert.equal(again.body.existed, true);
  assert.equal(again.body.item.id, a.id);
  const list = loadLater(db);
  assert.deepEqual(list.map((n) => n.title), ['B', 'A, new title']);
  assert.equal(list[1].readAt, undefined);
});

test('marking as read keeps the page, and marking it back puts it to wait', async () => {
  wipe();
  const a = (await call('POST', '/api/browser/browsing/later', { url: 'https://a.example/', title: 'A' })).body.item as LaterItem;
  const read = await call('PATCH', `/api/browser/browsing/later/${a.id}`, { read: true });
  assert.ok(typeof read.body.items[0].readAt === 'number');
  assert.equal(loadLater(db).length, 1);
  const back = await call('PATCH', `/api/browser/browsing/later/${a.id}`, { read: false });
  assert.equal(back.body.items[0].readAt, undefined);
  assert.equal((await call('PATCH', `/api/browser/browsing/later/${a.id}`, { read: 'yes' })).status, 400);
  assert.equal((await call('PATCH', '/api/browser/browsing/later/nope', { read: true })).status, 404);
});

test('removing forgets the page', async () => {
  wipe();
  const a = (await call('POST', '/api/browser/browsing/later', { url: 'https://a.example/' })).body.item as LaterItem;
  await call('POST', '/api/browser/browsing/later', { url: 'https://b.example/' });
  const r = await call('DELETE', `/api/browser/browsing/later/${a.id}`);
  assert.deepEqual(r.body.items.map((n: LaterItem) => n.url), ['https://b.example/']);
  assert.equal((await call('DELETE', `/api/browser/browsing/later/${a.id}`)).status, 404);
});

test('past the limit the oldest read page goes first', async () => {
  wipe();
  const items: LaterItem[] = Array.from({ length: MAX_LATER }, (_, i) => ({ id: `i${i}`, url: `https://x.example/${i}`, title: `T${i}`, addedAt: i, ...(i === 5 ? { readAt: 1 } : {}) }));
  kvSet(db, 'browser.later', JSON.stringify(items));
  await call('POST', '/api/browser/browsing/later', { url: 'https://new.example/' });
  const list = loadLater(db);
  assert.equal(list.length, MAX_LATER);
  assert.ok(!list.some((n) => n.id === 'i5'), 'the read one went');
  assert.ok(list.some((n) => n.id === 'i0'));
});

test('agents may not use the list', () => {
  for (const [method, url] of [['GET', '/api/browser/browsing/later'], ['POST', '/api/browser/browsing/later'], ['PATCH', '/api/browser/browsing/later/ab12'], ['DELETE', '/api/browser/browsing/later/ab12']] as const) {
    assert.equal(ruleFor(method, url).level, 'refuse', `${method} ${url}`);
  }
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
