// Script tests for screenshots shown to the user. show_screenshots (no Chromium needed): pictures copied from files
// and served with their own type, kept when the file is gone, size and theme guessed or given, groups and notes,
// before pictures that pair, files refused and listed, an old table that gets its new columns. ui_screenshot: where
// it looks (an address, an HTML file), the pictures it takes of a page served here before and after a change, how
// they pair (same session, label and size, the before taken first) and the routes that give them. The last needs
// a Chromium; without one it says so.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/shots/shots-test.ts
//   DATA_DIR=/tmp/hydor-test-shots node dist/dev/shots-test.js
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { canCapture, closeCapture, withTab } from '../capture/index.ts';
import { openDb } from '../db.ts';
import type { UiShot } from '../../shared/shots.ts';
import type { Deps, RunCtx, ToolOutput } from '../features/types.ts';
import { initShots, kitPage, kitScript, pairOf, pathOf, shotOf, shots, whereTo } from './index.ts';

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

// ---- show_screenshots: pictures that are files already -------------------------------------------------------------
// Tiny pictures with a true header (imageSize reads it) and some bytes after it, so what is stored can be told apart.
const png = (w: number, h: number, tag: string) => {
  const b = Buffer.alloc(40 + tag.length);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  b.write(tag, 40, 'latin1');
  return b;
};
const webp = (w: number, h: number, tag: string) => {
  const b = Buffer.alloc(40 + tag.length);
  b.write('RIFF', 0, 'latin1');
  b.writeUInt32LE(b.length - 8, 4);
  b.write('WEBPVP8X', 8, 'latin1');
  b.writeUInt32LE(10, 16);
  b.writeUIntLE(w - 1, 24, 3);
  b.writeUIntLE(h - 1, 27, 3);
  b.write(tag, 40, 'latin1');
  return b;
};
const jpeg = (w: number, h: number) => {
  const b = Buffer.alloc(20);
  b.writeUInt16BE(0xffd8, 0);
  b.writeUInt16BE(0xffc0, 2);
  b.writeUInt16BE(11, 4);
  b[6] = 8;
  b.writeUInt16BE(h, 7);
  b.writeUInt16BE(w, 9);
  return b;
};
const gif = (w: number, h: number) => {
  const b = Buffer.alloc(20);
  b.write('GIF89a', 0, 'latin1');
  b.writeUInt16LE(w, 6);
  b.writeUInt16LE(h, 8);
  return b;
};

{
  const pics = path.join(tmp, 'pics');
  fs.mkdirSync(pics);
  const put = (name: string, data: Buffer | string) => {
    fs.writeFileSync(path.join(pics, name), data);
    return path.join(pics, name);
  };
  const phonePng = put('cart-dark-phone.png', png(780, 1688, 'PHONE-PNG'));
  const deskWebp = put('cart.webp', webp(1440, 900, 'DESK-WEBP'));
  const lightJpg = put('cart_light.jpg', jpeg(1440, 900));
  const gifFile = put('spinner.gif', gif(64, 64));
  const beforePng = path.join(tmp, 'old.png');
  const afterPng = path.join(tmp, 'new.png');
  fs.writeFileSync(beforePng, png(1440, 900, 'BEFORE-PNG'));
  fs.writeFileSync(afterPng, png(1440, 900, 'AFTER-PNG'));
  const darkish = put('darkroom.png', png(1440, 900, 'DARKROOM'));

  const db = openDb(path.join(tmp, 'shows.db'));
  const app = Fastify();
  const events: { key?: string; data: unknown }[] = [];
  const deps = { app, db, toSubscribers: (key: string, e: { data: unknown }) => void events.push({ key, data: e.data }), broadcast() {}, publicBase: () => 'https://naget.example' } as unknown as Deps;
  shots.routes!(deps);
  await app.ready();
  const ctx = { runId: 'r2', key: 'claude:show', agent: 'claude', cwd: pics, deps } as RunCtx;
  const show = shots.tools!(ctx).find((t) => t.name === 'show_screenshots')!;
  const call = (list: Record<string, unknown>[]) => show.run({ shots: list }, ctx) as Promise<ToolOutput>;
  const idsOf = (t: string) => /\(shot ([a-f0-9, ]+)\)/.exec(t)?.[1].split(/,\s*/) ?? [];
  const get = (id: string) => shotOf(db, id)!;

  ok(show.annotations?.readOnlyHint === true && shots.tools!(ctx).some((t) => t.name === 'ui_screenshot'), 'both tools are given, show_screenshots read-only');
  ok(show.description.startsWith('Show the user screenshots you already have as files') && show.description.endsWith('PNG, JPEG, WebP or GIF; up to 120 pictures.'), 'its description is the one agents are told');

  const r1 = await call([
    { file: phonePng, label: '  Cart   page ', group: 'Shopping' },
    { file: 'cart.webp', label: 'Cart page', group: 'Shopping', theme: 'light', note: 'The   desktop one' },
    { file: lightJpg, label: 'Cart page', group: 'Shopping' },
    { file: gifFile, label: 'Spinner', viewport: 'phone' },
    { file: darkish, label: 'Dark room' },
    { file: 'file://' + encodeURI(deskWebp), label: 'Cart page again', group: 'Shopping' },
  ]);
  const [pPhone, pDesk, pJpg, pGif, pRoom, pUrl] = idsOf(r1.text);
  ok(!r1.isError && idsOf(r1.text).length === 6, `the answer lists the ids the card reads (${r1.text})`);
  ok(r1.text.startsWith('Showed the user 4 screens (6 pictures) in one card (shot ') && r1.text.includes('They are kept with this session, so they stay after you remove your copies.') && !r1.images, 'the answer counts screens (a label with its versions is one) and pictures, with no images');
  ok(events.length === 1 && events[0].key === 'claude:show' && JSON.stringify(events[0].data) === JSON.stringify({ what: 'shot', ids: idsOf(r1.text) }), 'the session’s pages hear of the new pictures');

  const served = await app.inject({ url: `/api/shots/${pPhone}` });
  ok(served.statusCode === 200 && served.headers['content-type'] === 'image/png' && served.rawPayload.equals(fs.readFileSync(phonePng)), 'a PNG is copied and served as PNG');
  const servedW = await app.inject({ url: `/api/shots/${pDesk}` });
  ok(servedW.headers['content-type'] === 'image/webp' && servedW.rawPayload.equals(fs.readFileSync(deskWebp)), 'a WebP is served as WebP');
  ok((await app.inject({ url: `/api/shots/${pJpg}` })).headers['content-type'] === 'image/jpeg' && (await app.inject({ url: `/api/shots/${pGif}` })).headers['content-type'] === 'image/gif', 'a JPEG and a GIF are served with their own types');
  const shotsDir = path.join(process.env.DATA_DIR!, 'shots');
  ok(fs.existsSync(path.join(shotsDir, `${pPhone}.png`)) && fs.existsSync(path.join(shotsDir, `${pJpg}.jpg`)) && fs.existsSync(path.join(shotsDir, `${pGif}.gif`)) && fs.existsSync(path.join(shotsDir, `${pDesk}.webp`)), 'the files are kept as .png, .jpg, .gif and .webp');
  fs.rmSync(pics, { recursive: true, force: true });
  const after = await app.inject({ url: `/api/shots/${pPhone}` });
  ok(after.statusCode === 200 && after.rawPayload.subarray(40).toString() === 'PHONE-PNG', 'with the source file deleted the picture is still served');

  ok(get(pPhone).viewport === 'phone' && get(pPhone).width === 780 && get(pPhone).height === 1688, 'a 780×1688 picture is a phone’s');
  ok(get(pDesk).viewport === 'desktop' && get(pDesk).width === 1440 && get(pDesk).height === 900, 'a 1440×900 one is a computer’s');
  ok(get(pGif).viewport === 'phone' && get(pRoom).viewport === 'desktop', 'a viewport given wins, and a wide picture is a computer’s');
  ok(get(pPhone).theme === 'dark' && get(pJpg).theme === 'light', 'the theme comes from the file’s name (…-dark-…, …_light.…)');
  ok(get(pDesk).theme === 'light' && !('theme' in get(pGif)) && !('theme' in get(pRoom)), 'a theme given wins, none is left out, and “darkroom” is no dark theme');
  const g = get(pDesk);
  ok(g.section === 'Shopping' && g.note === 'The desktop one' && g.label === 'Cart page' && g.source === 'file' && g.phase === 'check', 'group, note and label round trip, collapsed, from a file');
  ok(get(pPhone).label === 'Cart page' && g.url === `file://${deskWebp}` && g.title === '' && get(pUrl).url === `file://${deskWebp}`, 'its address is the file’s, also from a file:// address');
  ok(!('section' in get(pRoom)) && !('note' in get(pRoom)), 'no group or note are left out');
  const listed = (await app.inject({ url: '/api/shots?key=claude:show' })).json().shots as UiShot[];
  ok(listed.length === 6 && listed.map((x) => x.id).join() === idsOf(r1.text).join(), 'they are listed in the order given');

  // Before and after, with a slider.
  const r2 = await call([{ file: afterPng, label: 'Checkout', group: 'Pay', before: beforePng }]);
  const [aid] = idsOf(r2.text);
  ok(idsOf(r2.text).length === 1 && r2.text.includes('1 screen (1 picture)'), 'a before picture is not a screen of its own');
  const a = get(aid);
  const bf = pairOf(db, a);
  ok(a.phase === 'after' && bf?.phase === 'before' && bf.label === 'Checkout' && bf.section === 'Pay' && bf.viewport === a.viewport && bf.createdAt < a.createdAt, 'before makes a before and an after, a millisecond apart or more');
  ok(pairOf(db, get(pDesk)) === null, 'a picture without a before has no pair');
  const ev = events[events.length - 1].data as { ids: string[] };
  ok(ev.ids.length === 2 && ev.ids[0] === bf?.id && ev.ids[1] === aid, 'the pages hear of the before one too');
  const beforeBytes = await app.inject({ url: `/api/shots/${bf!.id}` });
  ok(beforeBytes.rawPayload.subarray(40).toString() === 'BEFORE-PNG', 'the before picture is the before file’s');
  const route = (await app.inject({ url: `/api/shots/pairs?ids=${aid},${pPhone},nothing,${'0'.repeat(12)},${pDesk}` })).json();
  ok(route.pairs.length === 3 && route.pairs[0].shot.id === aid && route.pairs[0].before?.id === bf?.id && route.pairs[1].shot.id === pPhone && route.pairs[1].before === null && route.pairs[2].shot.id === pDesk, '/api/shots/pairs gives the pairs in the order asked, leaving out what is unknown');
  const one = (await app.inject({ url: `/api/shots/${aid}/pair` })).json();
  ok(one.before?.id === bf?.id && one.shot.id === aid, 'and /api/shots/:id/pair still works');
  const many = (await app.inject({ url: `/api/shots/pairs?ids=${Array(400).fill(aid).join(',')}` })).json();
  ok(many.pairs.length === 300, 'at most 300 are answered');

  // pairOf's rules: the theme (equal, or either unknown), the size, the heading.
  const insert = (label: string, phase: string, o: { viewport?: string; theme?: string; section?: string; at: number }) => {
    const id = Math.random().toString(16).slice(2, 14).padEnd(12, '0');
    db.prepare("insert into ui_shots (id, key, label, phase, viewport, url, width, height, bytes, created_at, theme, section) values (?, 'k', ?, ?, ?, 'u', 1, 1, 1, ?, ?, ?)").run(id, label, phase, o.viewport ?? 'desktop', o.at, o.theme ?? '', o.section ?? '');
    return get(id);
  };
  const bDark = insert('P', 'before', { theme: 'dark', at: 10 });
  const bAny = insert('p', 'before', { at: 20 });
  const aDark = insert('P', 'after', { theme: 'dark', at: 30 });
  const aLight = insert('P', 'after', { theme: 'light', at: 30 });
  ok(pairOf(db, aDark)?.id === bAny.id, 'the latest before of the same theme or of none');
  ok(pairOf(db, aLight)?.id === bAny.id && pairOf(db, insert('P', 'after', { at: 30 }))?.id === bAny.id, 'a theme not known on one side pairs with any');
  const bLight = insert('P', 'before', { theme: 'light', at: 25 });
  ok(pairOf(db, aDark)?.id === bAny.id && pairOf(db, aLight)?.id === bLight.id && bDark.id !== bLight.id, 'a before of another theme is passed over');
  ok(pairOf(db, insert('P', 'after', { theme: 'dark', at: 5 })) === null, 'never one taken later');
  ok(pairOf(db, insert('P', 'after', { viewport: 'phone', theme: 'dark', at: 30 })) === null && pairOf(db, insert('P', 'after', { section: 'Other', at: 30 })) === null, 'nor of another size or heading');

  // What cannot be shown is listed; the rest is shown.
  const r3 = await call([
    { file: path.join(tmp, 'index.html'), label: 'Page' },
    { file: path.join(tmp, 'nothing.png'), label: 'Missing' },
    { file: path.join(pics, 'cart.webp'), label: 'Back again' },
  ]);
  ok(r3.isError === true && r3.text.includes('index.html: not a PNG') && r3.text.includes(path.join(pics, 'cart.webp')), 'a call whose files are gone or no pictures shows none');
  const keep = path.join(tmp, 'keep.png');
  fs.writeFileSync(keep, png(500, 400, 'KEEP'));
  const notes2 = path.join(tmp, 'notes.txt');
  fs.writeFileSync(notes2, 'plain text, long enough to be more than a header of anything');
  const bigFile = path.join(tmp, 'big.png');
  fs.writeFileSync(bigFile, Buffer.concat([png(10, 10, ''), Buffer.alloc(25 * 1024 * 1024)]));
  const r4 = await call([
    { file: notes2, label: 'Text' },
    { file: path.join(tmp, 'nothing.png'), label: 'Missing' },
    { file: bigFile, label: 'Big' },
    { file: keep, label: 'Kept' },
    { file: keep, label: 'Kept with a missing before', before: path.join(tmp, 'no-before.png') },
  ]);
  ok(!r4.isError && idsOf(r4.text).length === 2 && r4.text.includes('Showed the user 2 screens (2 pictures)'), 'the pictures that can be shown are, though others cannot');
  ok(r4.text.includes(`\n- ${notes2}: not a PNG, JPEG, WebP or GIF picture`) && r4.text.includes(`\n- ${path.join(tmp, 'nothing.png')}: no such file`) && r4.text.includes(`\n- ${bigFile}: larger than 25 MB`), 'a text file, a missing file and a big one are listed with their paths');
  ok(r4.text.includes('no-before.png (the before picture of "Kept with a missing before"): no such file') && get(idsOf(r4.text)[1]).phase === 'check', 'a missing before leaves the picture without one, and says so');
  const r5 = await call([{ file: notes2, label: 'Text' }, { file: path.join(tmp, 'nothing.png'), label: 'Missing' }]);
  ok(r5.isError === true && r5.text.includes(notes2) && r5.text.includes('nothing.png') && !/\(shot /.test(r5.text), 'when none can be shown it is an error with the list');
  ok(((await show.run({ shots: [] }, ctx)) as ToolOutput).isError === true, 'an empty list is an error');
  const before = db.prepare('select count(*) as n from ui_shots').get() as { n: number };
  await call([{ file: notes2, label: 'Text' }]);
  ok((db.prepare('select count(*) as n from ui_shots').get() as { n: number }).n === before.n, 'refused files are not stored');

  // The tools' instructions.
  const spawn = shots.spawn!({ agent: 'claude', cwd: tmp, runId: 'x', resume: false, extra: {} }, deps) as { instructions: string[] } | undefined;
  ok(!!spawn?.instructions.some((t) => t.includes('show_screenshots') && t.includes('instead of pictures in your reply')), 'agents are always told of show_screenshots');
  ok(canCapture() ? spawn!.instructions.length === 2 : spawn!.instructions.length === 1, 'and of ui_screenshot only when a Chromium is here');
  ok(shots.tools!(ctx).length === 2, 'the feature gives two tools');
  // A session that is removed takes its pictures, whatever their type, and not another's.
  const sessions = new EventEmitter();
  shots.start!({ db, sessions } as unknown as Deps);
  const own = (db.prepare("select id, mime from ui_shots where key = 'claude:show'").all() as { id: string; mime: string }[]);
  const ext: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
  ok(own.length > 8 && own.every((r) => fs.existsSync(path.join(shotsDir, `${r.id}.${ext[r.mime]}`))), 'every picture of the session has its file');
  const others = (db.prepare("select count(*) as n from ui_shots where key = 'k'").get() as { n: number }).n;
  sessions.emit('sessions', [], ['claude:show']);
  ok(own.every((r) => !fs.existsSync(path.join(shotsDir, `${r.id}.${ext[r.mime]}`))) && (db.prepare("select count(*) as n from ui_shots where key = 'claude:show'").get() as { n: number }).n === 0, 'a removed session takes its pictures, of every type');
  ok((db.prepare("select count(*) as n from ui_shots where key = 'k'").get() as { n: number }).n === others && others > 0, 'and not another session’s');
  await app.close();

  // A table from before the new columns gets them, and its rows read as captures.
  const old = openDb(path.join(tmp, 'old.db'));
  old.exec(`drop table if exists ui_shots; create table ui_shots (id text primary key, key text not null, label text not null, phase text not null, viewport text not null, url text not null, title text not null default '', width integer not null, height integer not null, bytes integer not null, created_at integer not null);
    insert into ui_shots values ('aaaaaaaaaaaa', 'k', 'L', 'after', 'desktop', 'http://x/', 'T', 10, 20, 5, 1);`);
  initShots(old);
  initShots(old);
  const cols = (old.prepare('pragma table_info(ui_shots)').all() as { name: string }[]).map((c) => c.name);
  ok(['theme', 'section', 'note', 'mime', 'source'].every((c) => cols.includes(c)), 'an old table gets the new columns');
  const o = shotOf(old, 'aaaaaaaaaaaa')!;
  ok(o.source === 'capture' && !o.theme && !o.section && !o.note && o.label === 'L', 'and its rows are captures with none of the new things');
  const mime = old.prepare('select mime from ui_shots').get() as { mime: string };
  ok(mime.mime === 'image/webp', 'whose pictures are WebP');
}

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
  // Chromium's helper processes may still write to its profile for a moment after it is closed; the test runner then
  // removes this test's data folder, which fails while they do.
  await new Promise((r) => setTimeout(r, 1500));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
