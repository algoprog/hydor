// Script tests for before and after screenshots (ui_screenshot): where it looks (an address, an HTML file),
// the pictures it takes of a page served here before and after a change, how they pair (same session, label
// and size, the before taken first) and the routes that give them. Needs a Chromium; without one it says so.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/shots/shots-test.ts
//   DATA_DIR=/tmp/naget-test-shots node dist/dev/shots-test.js
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { canCapture, closeCapture } from '../capture/index.ts';
import { openDb } from '../db.ts';
import type { Deps, RunCtx, ToolOutput } from '../features/types.ts';
import { shots, whereTo } from './index.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};
const fails = (f: () => unknown, what: string) => {
  try {
    f();
    ok(false, what);
  } catch {
    ok(true, what);
  }
};

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'naget-shots-test-')));
fs.writeFileSync(path.join(tmp, 'index.html'), '<!doctype html><title>Local</title><h1>Hi</h1>');

// ---- where it looks -------------------------------------------------------------------------------------
ok(whereTo('http://localhost:5173/settings', tmp) === 'http://localhost:5173/settings', 'an address stays as it is');
ok(whereTo('localhost:3000/x', tmp) === 'http://localhost:3000/x', 'localhost without http gets it');
ok(whereTo('index.html', tmp) === `file://${tmp}/index.html`, 'an HTML file is found from the session’s folder');
fails(() => whereTo('notes.md', tmp), 'a file that is not HTML is refused');
fails(() => whereTo('javascript:alert(1)', tmp), 'other kinds of address are refused');
fails(() => whereTo('missing.html', tmp), 'a file that is not there is refused');

if (!canCapture()) {
  console.log('No Chromium here: the pictures are not tested.');
} else {
  // A page that changes between the before and the after.
  let version = 'before';
  const site = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><title>Shop ${version}</title><body style="margin:0;font:20px sans-serif;background:${version === 'before' ? '#fff' : '#ffe'}"><h1>The checkout, ${version}</h1>${'<p>line</p>'.repeat(version === 'before' ? 3 : 60)}</body>`);
  });
  await new Promise<void>((r) => site.listen(0, '127.0.0.1', () => r()));
  const url = `http://127.0.0.1:${(site.address() as { port: number }).port}/cart`;

  const db = openDb(path.join(tmp, 'test.db'));
  const app = Fastify();
  const events: { key?: string; data: unknown }[] = [];
  const deps = { app, db, toSubscribers: (key: string, e: { data: unknown }) => void events.push({ key, data: e.data }), broadcast() {}, publicBase: () => 'https://naget.example' } as unknown as Deps;
  shots.routes!(deps);
  await app.ready();
  const ctx = { runId: 'r1', key: 'claude:s1', agent: 'claude', cwd: tmp, deps } as RunCtx;
  const tool = shots.tools!(ctx).find((t) => t.name === 'ui_screenshot')!;
  const run = (a: Record<string, unknown>) => tool.run(a, ctx) as Promise<ToolOutput>;
  const ids = (t: string) => /\(shot ([a-f0-9, ]+)\)/.exec(t)?.[1].split(/,\s*/) ?? [];

  const b = await run({ url, phase: 'before', label: 'Checkout page', viewport: 'both' });
  const [bd, bp] = ids(b.text);
  ok(bd && bp && b.text.includes('"Shop before"'), 'a before picture is taken on a computer’s screen and a phone’s');
  ok(b.images?.length === 2 && b.images.every((i) => i.mimeType === 'image/jpeg' && i.data.length > 1000), 'the agent gets the pictures back to look at');
  version = 'after';
  const a = await run({ url, phase: 'after', label: 'checkout page', viewport: 'both', full_page: true });
  const [ad, ap] = ids(a.text);
  ok(ad && ap && a.text.includes('beside the before one'), 'an after picture says the user sees it beside the before one');
  const pair = (await app.inject({ url: `/api/shots/${ad}/pair` })).json();
  ok(pair.before?.id === bd && pair.shot.phase === 'after', 'the after pairs with its before, by label (any case) and size');
  ok((await app.inject({ url: `/api/shots/${ap}/pair` })).json().before?.id === bp, 'the phone’s pairs with the phone’s');
  ok(pair.shot.height > pair.before.height, 'the whole page is pictured when asked');
  const img = await app.inject({ url: `/api/shots/${ad}` });
  ok(img.statusCode === 200 && img.headers['content-type'] === 'image/webp' && img.rawPayload.subarray(0, 4).toString() === 'RIFF', 'the picture is served as WebP');
  ok((await app.inject({ url: '/api/shots/zzz' })).statusCode === 404, 'an unknown picture is not found');
  const lone = await run({ url, phase: 'after', label: 'Cart drawer' });
  ok(lone.text.includes('no "before" screenshot labelled "Cart drawer"'), 'an after without a before tells the agent to take one first next time');
  const list = (await app.inject({ url: '/api/shots?key=claude:s1' })).json().shots;
  ok(list.length === 5 && events.length === 3 && events[0].key === 'claude:s1', 'the session’s pictures are listed, and its pages hear of each');
  await app.close();
  site.close();
  closeCapture();
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
