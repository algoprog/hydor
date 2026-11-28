// Script tests for the endpoint routes of sending a project, over real HTTP with the server's own settings that matter here
// (compression on, a small body limit, application/octet-stream left a stream): the plan, the arrival place (not shadowed by
// /api/projects/:id), the bundle download (not compressed again), arriving from an upload bigger than the body limit, a
// bundle that is broken or cut off by the sender leaving nothing behind, and leaving. Build and run with a scratch folder:
//   OUTDIR=dist/dev-engine node scripts/build-server.mjs server/spaces/transfer/routes-test.ts
//   HOME=/tmp/eng-home DATA_DIR=/tmp/eng-data node dist/dev-engine/routes-test.js
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import compress from '@fastify/compress';
import Fastify from 'fastify';
import { setSettings } from '../../assistants/store.ts';
import { openDb } from '../../db.ts';
import type { Deps } from '../../features/types.ts';
import { initMedia } from '../../media/store.ts';
import { initPages } from '../../pages/store.ts';
import { allSpaces, createSpace, spaces, spaceById } from '../index.ts';
import { projectTransfer } from './routes.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/') || !process.env.HOME?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… and HOME=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
fs.rmSync(process.env.HOME, { recursive: true, force: true });
fs.mkdirSync(process.env.HOME, { recursive: true });
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-routes-test-')));
const db = openDb(path.join(tmp, 'test.db'));
initPages(db);
initMedia(db);
setSettings(db, { taskRoot: path.join(tmp, 'Naget') });

// As server/index.ts has it, but for the body limit, which is small here so an upload over it shows it does not apply.
const app = Fastify({ bodyLimit: 1024 * 1024, forceCloseConnections: true, rewriteUrl: (req) => (req.url ?? '/').replace(/^\/api\/spaces(?=[/?]|$)/, '/api/projects') });
await app.register(compress, { global: true, threshold: 2048, encodings: ['br', 'gzip'] });
app.addContentTypeParser('application/octet-stream', (_req, payload, done) => done(null, payload));
app.removeContentTypeParser('application/json');
app.addContentTypeParser('application/json', { parseAs: 'string' }, (_r, b, done) => {
  try {
    done(null, String(b).trim() ? JSON.parse(String(b)) : {});
  } catch (e) {
    done(e as Error, undefined);
  }
});
app.setErrorHandler((err: Error & { status?: number; statusCode?: number }, _req, reply) => reply.code(err.status ?? err.statusCode ?? 500).send({ error: err.message }));
const told: any[] = [];
const d = { app, db, broadcast: (e: any) => told.push(e), sessions: { queueSummary() {}, deliverOrQueue: async () => {}, on() {} } } as unknown as Deps;
spaces.routes!(d);
projectTransfer.routes!(d);
await app.listen({ port: 0, host: '127.0.0.1' });
const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;

let passed = 0;
const tests: [string, () => Promise<void>][] = [];
const test = (name: string, fn: () => Promise<void>) => tests.push([name, fn]);

const folder = path.join(tmp, 'proj');
fs.mkdirSync(folder, { recursive: true });
const big = crypto.randomBytes(6 * 1024 * 1024);
fs.writeFileSync(path.join(folder, 'big.bin'), big);
fs.writeFileSync(path.join(folder, 'note.txt'), 'hello');
const id = createSpace(db, { name: 'Routes', folder }).id;
const leftovers = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.startsWith('.hydor-')) : []);

test('the plan route, and the arrival place that /api/projects/:id does not shadow', async () => {
  const plan = await (await fetch(`${base}/api/projects/${id}/carry`)).json();
  assert.equal(plan.project.name, 'Routes');
  assert.equal(plan.files.count, 2);
  const a = await (await fetch(`${base}/api/projects/arrival?name=Routes`)).json();
  assert.equal(a.folder, path.join(tmp, 'Naget', 'Projects', 'routes'));
  assert.equal(a.home, process.env.HOME);
  assert.ok(a.version && a.platform);
  const withRel = await (await fetch(`${base}/api/projects/arrival?rel=work/x&also=${encodeURIComponent(JSON.stringify(['work/y']))}`)).json();
  assert.deepEqual([withRel.folder, withRel.also], [path.join(process.env.HOME!, 'work/x'), [path.join(process.env.HOME!, 'work/y')]]);
  assert.equal((await fetch(`${base}/api/projects/arrival?rel=..%2Fx`)).status, 400);
  assert.equal((await fetch(`${base}/api/projects/spnone/carry`)).status, 404);
  const g = createSpace(db, { name: 'G', members: [id] });
  const refused = await fetch(`${base}/api/projects/${g.id}/carry`);
  assert.equal(refused.status, 400);
  assert.match((await refused.json()).error, /A group can’t be sent/);
  // The old /api/spaces address still works for the new routes.
  assert.equal((await fetch(`${base}/api/spaces/${id}/carry`)).status, 200);
});

test('the bundle is not compressed again, and an upload over the body limit arrives whole', async () => {
  const res = await fetch(`${base}/api/projects/${id}/carry/bundle`, { headers: { 'accept-encoding': 'gzip, br' } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/x-hydor-bundle');
  assert.equal(res.headers.get('content-encoding'), null);
  const bundle = Buffer.from(await res.arrayBuffer());
  assert.ok(bundle.length > 5 * 1024 * 1024, 'random data does not compress');
  const dest = path.join(tmp, 'remote', 'routes');
  const up = await fetch(`${base}/api/projects/arrive?folder=${encodeURIComponent(dest)}&how=copy&from=${encodeURIComponent('GPU box')}`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: bundle });
  assert.equal(up.status, 200, await up.clone().text());
  const arrived = await up.json();
  assert.equal(arrived.project.folder, dest);
  assert.equal(arrived.files, 2);
  assert.ok(fs.readFileSync(path.join(dest, 'big.bin')).equals(big));
  assert.equal(spaceById(db, arrived.project.id)!.came?.from, 'GPU box');
  assert.deepEqual(leftovers(path.dirname(dest)), []);
});

test('a bundle streamed straight from one request to the other (as the hub pipes it)', async () => {
  const res = await fetch(`${base}/api/projects/${id}/carry/bundle`);
  const dest = path.join(tmp, 'piped', 'routes');
  const url = new URL(`${base}/api/projects/arrive`);
  url.searchParams.set('folder', dest);
  url.searchParams.set('how', 'move');
  const out = await new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = http.request(url, { method: 'POST', headers: { 'content-type': 'application/octet-stream' } }, (r) => {
      const parts: Buffer[] = [];
      r.on('data', (c) => parts.push(c));
      r.on('end', () => resolve({ status: r.statusCode!, body: Buffer.concat(parts).toString() }));
    });
    req.on('error', reject);
    Readable.fromWeb(res.body as any).pipe(req);
  });
  assert.equal(out.status, 200, out.body);
  assert.ok(fs.readFileSync(path.join(dest, 'big.bin')).equals(big));
  assert.equal(spaceById(db, JSON.parse(out.body).project.id)!.came?.how, 'move');
});

test('a broken bundle is a 400 with the reason, and a taken folder a 409; nothing stays', async () => {
  const bundle = Buffer.from(await (await fetch(`${base}/api/projects/${id}/carry/bundle`)).arrayBuffer());
  const spacesBefore = allSpaces(db).length;
  const dest = path.join(tmp, 'broken', 'routes');
  const bad = Buffer.from(bundle);
  bad[bad.length - 20] ^= 0xff;
  const r = await fetch(`${base}/api/projects/arrive?folder=${encodeURIComponent(dest)}&how=copy`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: bad });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /The bundle is broken/);
  assert.equal(fs.existsSync(path.join(tmp, 'broken')), false);
  const taken = path.join(tmp, 'taken');
  fs.mkdirSync(taken);
  fs.writeFileSync(path.join(taken, 'x'), 'x');
  const t = await fetch(`${base}/api/projects/arrive?folder=${encodeURIComponent(taken)}&how=copy`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: bundle });
  assert.equal(t.status, 409);
  assert.match((await t.json()).error, /There are files at .* already: pick a new or empty folder/);
  const json = await fetch(`${base}/api/projects/arrive?folder=${encodeURIComponent(dest)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(json.status, 415);
  assert.equal(allSpaces(db).length, spacesBefore);
});

test('a sender that goes away mid-upload leaves nothing', async () => {
  const bundle = Buffer.from(await (await fetch(`${base}/api/projects/${id}/carry/bundle`)).arrayBuffer());
  const dest = path.join(tmp, 'gone', 'routes');
  const spacesBefore = allSpaces(db).length;
  const url = new URL(`${base}/api/projects/arrive`);
  url.searchParams.set('folder', dest);
  await new Promise<void>((resolve) => {
    const req = http.request(url, { method: 'POST', headers: { 'content-type': 'application/octet-stream' } });
    req.on('error', () => resolve());
    req.on('close', () => resolve());
    req.write(bundle.subarray(0, Math.floor(bundle.length / 2)));
    setTimeout(() => req.destroy(), 200);
  });
  // The server notices and undoes it.
  for (let i = 0; i < 100 && (fs.existsSync(path.join(tmp, 'gone')) || leftovers(process.env.DATA_DIR!).length); i++) await new Promise((r) => setTimeout(r, 50));
  assert.equal(fs.existsSync(path.join(tmp, 'gone')), false, 'no folder, no staging beside it');
  assert.deepEqual(leftovers(process.env.DATA_DIR!), []);
  assert.equal(allSpaces(db).length, spacesBefore);
});

test('leaving over HTTP', async () => {
  const r = await fetch(`${base}/api/projects/${id}/leave`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to: 'GPU box' }) });
  assert.equal(r.status, 200);
  const out = await r.json();
  assert.equal(out.ok, true);
  assert.ok(out.trashed && fs.existsSync(out.trashed));
  assert.equal(spaceById(db, id), null);
  assert.equal((await fetch(`${base}/api/projects/${id}/leave`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 404);
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n`, e);
    process.exit(1);
  }
}
await app.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed}/${tests.length} route tests passed`);
process.exit(0);
