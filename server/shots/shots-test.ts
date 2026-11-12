// Script tests for before and after screenshots (ui_screenshot): where it looks (an address, an HTML file),
// the pictures it takes of a page served here before and after a change, how they pair (same session, label
// and size, the before taken first) and the routes that give them. Needs a Chromium; without one it says so.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/shots/shots-test.ts
//   DATA_DIR=/tmp/hydor-test-shots node dist/dev/shots-test.js
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { canCapture, closeCapture, withTab } from '../capture/index.ts';
import { openDb } from '../db.ts';
import type { Deps, RunCtx, ToolOutput } from '../features/types.ts';
import { kitPage, kitScript, pathOf, shots, whereTo } from './index.ts';

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

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-shots-test-')));
fs.writeFileSync(path.join(tmp, 'index.html'), '<!doctype html><title>Local</title><h1>Hi</h1>');

// ---- where it looks -------------------------------------------------------------------------------------
ok(whereTo('http://localhost:5173/settings', tmp) === 'http://localhost:5173/settings', 'an address stays as it is');
ok(whereTo('localhost:3000/x', tmp) === 'http://localhost:3000/x', 'localhost without http gets it');
ok(whereTo('index.html', tmp) === `file://${tmp}/index.html`, 'an HTML file is found from the session’s folder');
fails(() => whereTo('notes.md', tmp), 'a file that is not HTML is refused');
fails(() => whereTo('javascript:alert(1)', tmp), 'other kinds of address are refused');
fails(() => whereTo('missing.html', tmp), 'a file that is not there is refused');

// ---- a page made with the page kit, shown as the app shows it -----------------------------------------------
// Colours a page names after the kit's at its top, as agents often write them: in the dark they must be the dark ones.
const kitFile = path.join(tmp, 'menu mockup.html');
fs.writeFileSync(kitFile, '<!doctype html><title>Menu</title><style>:root{--card:var(--n-card,#123456);--text:var(--n-fg,#000)}.menu{background:var(--card);color:var(--text)}</style><body class="n-page"><div class="menu">web-agent</div></body>');
const ownFile = path.join(tmp, 'own.html');
fs.writeFileSync(ownFile, '<!doctype html><title>Own</title><style>:root{--n-card:#abcdef;--card:var(--n-card)}.menu{background:var(--card)}</style><body class="n-page"><div class="menu">web-agent</div></body>');
ok(kitPage(kitFile) && !kitPage(path.join(tmp, 'index.html')) && !kitPage(path.join(tmp, 'missing.html')), 'a page made with the kit is told from one of its own');
ok(pathOf(whereTo('menu mockup.html', tmp)) === kitFile && pathOf('file://' + encodeURI(kitFile)) === kitFile, 'the file of a file address is found, its path as given or encoded');
ok(kitScript('dark').includes('"dark"') && kitScript('light').includes('"light"') && kitScript('dark').includes('--n-card'), 'the kit goes in with the theme asked for');

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

  // A page made with the kit, in the app's dark and light: what the page names after the kit's colours follows them.
  const look = (file: string, theme: 'dark' | 'light') =>
    withTab({ url: `file://${file}`, width: 400, height: 300, colorScheme: theme, firstScript: kitScript(theme) }, ({ evaluate }) =>
      evaluate<string>("JSON.stringify((s => [s.backgroundColor, s.color])(getComputedStyle(document.querySelector('.menu'))).concat(matchMedia('(prefers-color-scheme: dark)').matches))"),
    ).then((j) => JSON.parse(j) as [string, string, boolean]);
  const [dBg, dFg, dDark] = await look(kitFile, 'dark');
  ok(dBg === 'rgb(21, 24, 32)' && dFg === 'rgb(233, 237, 245)' && dDark, `in the dark, a page's own names for the kit's colours are the dark ones (${dBg}, ${dFg})`);
  const [lBg, lFg, lDark] = await look(kitFile, 'light');
  ok(lBg === 'rgb(255, 255, 255)' && lFg === 'rgb(27, 25, 21)' && !lDark, `in the light, the light ones (${lBg}, ${lFg})`);
  ok((await look(ownFile, 'dark'))[0] === 'rgb(171, 205, 239)', 'a page’s own colour for the kit’s, at its top, still wins in the dark');
  const kd = await run({ url: kitFile, phase: 'check', label: 'Menu mockup' });
  ok(kd.text.includes('with the page kit, in the dark theme') && kd.text.includes('theme "light"'), 'a kit page is pictured as the app shows it, in the dark unless asked');
  const kl = await run({ url: kitFile, phase: 'check', label: 'Menu mockup', theme: 'light' });
  ok(kl.text.includes('in the light theme') && !kl.text.includes('theme "light" for'), 'and in the light when asked');
  const sd = await run({ url, phase: 'check', label: 'Checkout page', theme: 'dark' });
  ok(sd.text.includes('told the device prefers dark') && !sd.text.includes('page kit'), 'another page is told the theme asked for, without the kit');
  await app.close();
  site.close();
  closeCapture();
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
