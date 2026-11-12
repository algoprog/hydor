// Script tests for the tips after the tour: on until turned off, each tip shown once on every device, a tip it does
// not know refused, the tour's version read alongside, the routes and the news to open pages.
// Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/tips/tips-test.ts
//   DATA_DIR=/tmp/hydor-test-tips node dist/dev/tips-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TIP_GUIDE, TIP_IDS } from '../../shared/tips.ts';
import type { ServerEvent } from '../../shared/types.ts';
import { kvGet, kvSet, openDb } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { setTips, tips, tipsState } from './index.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-tips-test-'));
const db = openDb(path.join(tmp, 'test.db'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const status = (e: unknown) => (e as { status?: number }).status;

test('the list: ids once each, each with a place in the guide', () => {
  assert.equal(new Set(TIP_IDS).size, TIP_IDS.length);
  for (const id of TIP_IDS) assert.match(TIP_GUIDE[id], /^\/guide\/[a-z-]+#[a-z0-9-]+$/, id);
  assert.deepEqual(Object.keys(TIP_GUIDE).sort(), [...TIP_IDS].sort());
});

test('at first: on, nothing shown, the tour as POST /api/tour kept it', () => {
  assert.deepEqual(tipsState(db), { on: true, seen: [], tour: 0, explained: [] });
  kvSet(db, 'tour.seen', '2');
  assert.equal(tipsState(db).tour, 2);
});

test('shown tips are kept once each, in order; off and on keep them', () => {
  assert.deepEqual(setTips(db, { seen: ['search'] }).seen, ['search']);
  assert.deepEqual(setTips(db, { seen: ['details', 'search', 'details'] }).seen, ['search', 'details']);
  assert.deepEqual(setTips(db, { on: false }), { on: false, seen: ['search', 'details'], tour: 2, explained: [] });
  assert.deepEqual(tipsState(db), { on: false, seen: ['search', 'details'], tour: 2, explained: [] }, 'every device reads the same');
  assert.deepEqual(setTips(db, { on: true, seen: ['git'] }), { on: true, seen: ['search', 'details', 'git'], tour: 2, explained: [] });
  assert.deepEqual(setTips(db, { reset: true }).seen, [], 'reset shows every tip again');
  assert.deepEqual(setTips(db, { reset: true, seen: ['apps'] }).seen, ['apps'], 'reset comes before seen');
  assert.equal(kvGet(db, 'tips'), JSON.stringify({ seen: ['apps'] }), 'on is kept as nothing');
});

test('refused, changing nothing: a tip it does not know, and wrong kinds', () => {
  const before = tipsState(db);
  assert.throws(() => setTips(db, { seen: ['apps', 'serch'] }), (e: Error) => status(e) === 400 && /serch/.test(e.message) && /search/.test(e.message));
  assert.throws(() => setTips(db, { seen: 'apps' }), (e: Error) => status(e) === 400 && /seen/.test(e.message));
  assert.throws(() => setTips(db, { on: 'no' }), (e: Error) => status(e) === 400 && /on:/.test(e.message));
  assert.throws(() => setTips(db, { reset: 1 }), (e: Error) => status(e) === 400 && /reset/.test(e.message));
  assert.throws(() => setTips(db, {}), (e: Error) => status(e) === 400);
  assert.throws(() => setTips(db, undefined), (e: Error) => status(e) === 400);
  assert.deepEqual(tipsState(db), before);
});

test('kept by another version or by hand: what this one does not know is left out', () => {
  db.prepare("insert or replace into kv (k, v) values ('tips', ?)").run(JSON.stringify({ off: true, seen: ['gone', 'git', 'git', 4] }));
  assert.deepEqual(tipsState(db), { on: false, seen: ['git'], tour: 2, explained: [] });
  db.prepare("insert or replace into kv (k, v) values ('tips', 'not json')").run();
  assert.deepEqual(tipsState(db), { on: true, seen: [], tour: 2, explained: [] });
  db.prepare("insert or replace into kv (k, v) values ('tips', '[1]')").run();
  assert.deepEqual(tipsState(db), { on: true, seen: [], tour: 2, explained: [] });
});

test('costly modes explained: kept once each whether tips are on or off, refused when unknown, shown again by reset', () => {
  setTips(db, { on: false });
  assert.deepEqual(setTips(db, { explained: ['swarm'] }).explained, ['swarm']);
  assert.deepEqual(setTips(db, { explained: ['research', 'swarm'] }).explained, ['swarm', 'research']);
  assert.equal(tipsState(db).on, false, 'explaining a mode leaves tips off');
  assert.throws(() => setTips(db, { explained: ['swarn'] }), (e: Error) => status(e) === 400 && /swarn/.test(e.message) && /campaign/.test(e.message));
  assert.throws(() => setTips(db, { explained: 'swarm' }), (e: Error) => status(e) === 400 && /explained/.test(e.message));
  assert.deepEqual(tipsState(db).explained, ['swarm', 'research']);
  assert.deepEqual(setTips(db, { reset: true }).explained, [], 'reset explains them again');
});

test('the routes: GET reads it, PUT keeps it and tells every open page', async () => {
  const handlers = new Map<string, (req: { body?: unknown }) => Promise<unknown>>();
  const app = {
    get: (p: string, h: (req: { body?: unknown }) => Promise<unknown>) => handlers.set(`GET ${p}`, h),
    put: (p: string, h: (req: { body?: unknown }) => Promise<unknown>) => handlers.set(`PUT ${p}`, h),
  };
  const sent: ServerEvent[] = [];
  tips.routes!({ app, db, broadcast: (e: ServerEvent) => sent.push(e) } as unknown as Deps);
  const state = { on: false, seen: ['inbox'], tour: 2, explained: [] };
  assert.deepEqual(await handlers.get('PUT /api/tips')!({ body: { on: false, seen: ['inbox'] } }), state);
  assert.deepEqual(sent, [{ t: 'feature', id: 'tips', data: state }]);
  assert.deepEqual(await handlers.get('GET /api/tips')!({}), state);
  await assert.rejects(() => handlers.get('PUT /api/tips')!({ body: { seen: ['nope'] } }), /nope/);
  assert.equal(sent.length, 1, 'a refused change tells nobody');
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n`, e);
    process.exitCode = 1;
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed}/${tests.length} passed`);
