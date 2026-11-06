// Script tests for asking for the OpenRouter key when a tool needs it (openrouter-key.ts): a run nobody watches gets no
// card; a watched one gets one (one at a time in a session) and waits; a key given lets the tools go on; skipped, they
// give up and the session is not asked again for a while; a run stopped stops waiting; the words the agent gets for each.
// Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/connections/openrouter-key-test.ts
//   DATA_DIR=/tmp/hydor-test-openrouter-key node dist/dev/openrouter-key-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../db.ts';
import type { RunCtx } from '../features/types.ts';
import { keyGiven, keySkipped, noKeyText, openRouterKey, OPENROUTER_REQUEST } from './openrouter-key.ts';
import { latestRequest, vaultTables } from './vault.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-openrouter-key-test-')));
const db = openDb(path.join(tmp, 'test.db'));
vaultTables(db);

const ctx = (key: string, watched = true, signal?: AbortSignal) =>
  ({ runId: `run-${key}`, key, cwd: tmp, signal, deps: { db, sessions: { adapterByRun: () => (watched ? {} : undefined) } } }) as unknown as RunCtx;
const tick = () => new Promise((r) => setTimeout(r, 20));

let passed = 0;
const ok = async (name: string, f: () => Promise<void>) => {
  await f();
  passed++;
  console.log(`ok - ${name}`);
};

await ok('a run nobody watches gets no card', async () => {
  assert.deepEqual(await openRouterKey(ctx('s0', false), { why: 'Pictures.' }), { key: null, why: 'nobody' });
  assert.equal(latestRequest(db, 's0', OPENROUTER_REQUEST), null);
});

await ok('a watched run gets one card, and a key given lets every waiting tool go on', async () => {
  const a = openRouterKey(ctx('s1'), { why: 'Pictures through OpenRouter: about $0.04 each.' });
  const b = openRouterKey(ctx('s1'), { why: 'A second tool.' });
  await tick();
  const r = latestRequest(db, 's1', OPENROUTER_REQUEST);
  assert.equal(r?.state, 'pending');
  assert.equal(r?.why, 'Pictures through OpenRouter: about $0.04 each.');
  assert.equal((db.prepare('select count(*) as n from conn_requests where key = ?').get('s1') as { n: number }).n, 1, 'one card for both');
  assert.equal(keyGiven('s1', 'sk-or-test'), true);
  assert.deepEqual(await a, { key: 'sk-or-test' });
  assert.deepEqual(await b, { key: 'sk-or-test' });
  assert.equal(keyGiven('s1', 'sk-or-test'), false, 'nothing waits any more');
});

await ok('skipped: the tools give up, and the session is not asked again', async () => {
  const a = openRouterKey(ctx('s2'), { why: 'A video.' });
  await tick();
  assert.equal(keySkipped('s2'), true);
  assert.deepEqual(await a, { key: null, why: 'skipped' });
  db.prepare("update conn_requests set state = 'dismissed' where key = ?").run('s2');
  assert.deepEqual(await openRouterKey(ctx('s2'), { why: 'Again.' }), { key: null, why: 'skipped-before' });
  assert.equal((db.prepare('select count(*) as n from conn_requests where key = ?').get('s2') as { n: number }).n, 1, 'no second card');
  // Another session is still asked.
  const c = openRouterKey(ctx('s3'), { why: 'A sound.' });
  await tick();
  assert.equal(latestRequest(db, 's3', OPENROUTER_REQUEST)?.state, 'pending');
  keySkipped('s3');
  await c;
});

await ok('a run stopped stops waiting; a run that waits too long says so', async () => {
  const stop = new AbortController();
  const a = openRouterKey(ctx('s4', true, stop.signal), { why: 'A drawing.' });
  await tick();
  stop.abort();
  assert.deepEqual(await a, { key: null, why: 'stopped' });
  assert.deepEqual(await openRouterKey(ctx('s5'), { why: 'A picture.', waitMs: 30 }), { key: null, why: 'timeout' });
});

await ok('what the agent is told', async () => {
  assert.match(noKeyText({ key: null, why: 'skipped' }, 'Seedream 5.0 Pro'), /^The user chose not to add an OpenRouter key, so Seedream 5\.0 Pro did not run: nothing was made and nothing was spent\. Do not ask for the key again/);
  assert.match(noKeyText({ key: null, why: 'nobody' }, 'The picture'), /no OpenRouter key is set\. Tell the user to add one in Settings → Models → OpenRouter/);
  assert.match(noKeyText({ key: null, why: 'timeout' }, 'the video'), /did not answer the card/);
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed`);
