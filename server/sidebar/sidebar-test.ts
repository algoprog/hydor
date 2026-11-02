// Script tests for the order of the sidebar's tools: the tools named first, the rest after them in their usual
// order; a name it does not know refused; the usual order kept as none; the routes, and the news to open pages.
// Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/sidebar/sidebar-test.ts
//   DATA_DIR=/tmp/naget-test-sidebar node dist/dev/sidebar-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SIDEBAR_TOOLS, toolOrder, usualOrder } from '../../shared/sidebar.ts';
import type { ServerEvent } from '../../shared/types.ts';
import { kvGet, openDb } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { setSidebarTools, sidebar, sidebarTools } from './index.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'naget-sidebar-test-'));
const db = openDb(path.join(tmp, 'test.db'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const usual = [...SIDEBAR_TOOLS];

test('an order: the tools named first, then the rest in their usual order', () => {
  assert.deepEqual(toolOrder([]), usual);
  assert.deepEqual(toolOrder(undefined), usual);
  assert.deepEqual(toolOrder('settings'), usual, 'not a list: the usual order');
  assert.deepEqual(toolOrder(['settings', 'help']), ['settings', 'help', ...usual.filter((t) => t !== 'settings' && t !== 'help')]);
  assert.deepEqual(toolOrder(['help', 'gone', 'help', 3, 'files']), ['help', 'files', ...usual.filter((t) => t !== 'help' && t !== 'files')], 'unknown names and repeats skipped');
  const reversed = [...usual].reverse();
  assert.deepEqual(toolOrder(reversed), reversed);
  assert.ok(usualOrder(toolOrder([])));
  assert.ok(!usualOrder(reversed));
});

test('kept: every device reads the same; the usual order is kept as none', () => {
  assert.deepEqual(sidebarTools(db), usual, 'nothing kept yet');
  const mine = ['settings', 'files', 'terminal', 'git', ...usual.filter((t) => !['settings', 'files', 'terminal', 'git'].includes(t))];
  assert.deepEqual(setSidebarTools(db, mine), mine);
  assert.deepEqual(sidebarTools(db), mine);
  assert.deepEqual(setSidebarTools(db, ['help']), ['help', ...usual.filter((t) => t !== 'help')], 'an agent naming one tool puts it first');
  assert.deepEqual(setSidebarTools(db, []), usual);
  assert.equal(kvGet(db, 'sidebar.tools'), '[]');
  setSidebarTools(db, mine);
  assert.deepEqual(setSidebarTools(db, usual), usual, 'dragged back into the usual order');
  assert.equal(kvGet(db, 'sidebar.tools'), '[]');
});

test('a name it does not know is refused, and changes nothing', () => {
  setSidebarTools(db, ['git']);
  assert.throws(() => setSidebarTools(db, ['git', 'setings']), (e: Error & { status?: number }) => e.status === 400 && /setings/.test(e.message) && /settings/.test(e.message));
  assert.throws(() => setSidebarTools(db, 'git'), /first to last/);
  assert.throws(() => setSidebarTools(db, undefined), /first to last/);
  assert.equal(sidebarTools(db)[0], 'git');
  // Kept by an older or a hand-edited copy: what it no longer knows is left out.
  db.prepare("insert or replace into kv (k, v) values ('sidebar.tools', ?)").run(JSON.stringify(['notebook', 'help']));
  assert.deepEqual(sidebarTools(db), ['help', ...usual.filter((t) => t !== 'help')]);
  db.prepare("insert or replace into kv (k, v) values ('sidebar.tools', 'not json')").run();
  assert.deepEqual(sidebarTools(db), usual);
});

test('the routes: GET reads it, PUT keeps it and tells every open page', async () => {
  const handlers = new Map<string, (req: { body?: unknown }) => Promise<unknown>>();
  const app = {
    get: (p: string, h: (req: { body?: unknown }) => Promise<unknown>) => handlers.set(`GET ${p}`, h),
    put: (p: string, h: (req: { body?: unknown }) => Promise<unknown>) => handlers.set(`PUT ${p}`, h),
  };
  const sent: ServerEvent[] = [];
  sidebar.routes!({ app, db, broadcast: (e: ServerEvent) => sent.push(e) } as unknown as Deps);
  const order = ['search', 'help', ...usual.filter((t) => t !== 'search' && t !== 'help')];
  assert.deepEqual(await handlers.get('PUT /api/sidebar')!({ body: { tools: ['search', 'help'] } }), { tools: order });
  assert.deepEqual(sent, [{ t: 'feature', id: 'sidebar', data: { tools: order } }]);
  assert.deepEqual(await handlers.get('GET /api/sidebar')!({}), { tools: order });
  await assert.rejects(() => handlers.get('PUT /api/sidebar')!({ body: { tools: ['inbox'] } }), /inbox/);
  await assert.rejects(() => handlers.get('PUT /api/sidebar')!({}), /first to last/);
  assert.equal(sent.length, 1, 'a refused change tells nobody');
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
fs.rmSync(tmp, { recursive: true, force: true });
