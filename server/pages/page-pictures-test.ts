// Script tests for the pictures an agent puts in a page it saves (page-pictures.ts): a file of its folder named as an
// img's src, a video's poster or in CSS url() goes inside the page as a data: address, once however often it is named;
// the app's kept pictures too; the web's addresses, data: ones and the page's own anchors stay; a file that is not a
// picture, or not there, stays as written and is said; a page too large with its pictures is refused in words. Build
// and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/pages/page-pictures-test.ts
//   DATA_DIR=/tmp/hydor-test-page-pictures node dist/dev/page-pictures-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../db.ts';
import { initAssets, putAsset } from './assets.ts';
import { pagePictures } from './page-pictures.ts';
import { MAX_PAGE } from './store.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-page-pictures-test-')));
const db = openDb(path.join(tmp, 'test.db'));
initAssets(db);
const cwd = path.join(tmp, 'session');
fs.mkdirSync(path.join(cwd, 'images'), { recursive: true });

// A 2×2 PNG, an SVG and a text file.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP8z8DwnwEJMDGgASwEABDvAf8Kp4C6AAAAAElFTkSuQmCC', 'base64');
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#f80"/></svg>');
fs.writeFileSync(path.join(cwd, 'images/dot.png'), PNG);
fs.writeFileSync(path.join(cwd, 'images/sun.svg'), SVG);
fs.writeFileSync(path.join(cwd, 'notes.txt'), 'not a picture');
const kept = 'naget-asset:' + putAsset(db, PNG);

let passed = 0;
const ok = (name: string, f: () => void) => {
  f();
  passed++;
  console.log(`ok - ${name}`);
};

ok('files of the folder, by src, poster and url(), go inside once each', () => {
  const html = `<!doctype html><html><head><style>.hero{background:url('images/sun.svg') no-repeat}</style></head><body>
<img src="images/dot.png" alt="a dot"><img src='images/dot.png'><video poster="images/dot.png"></video>
<div style="background-image: url(images/sun.svg)"></div><img src="${kept}"></body></html>`;
  const r = pagePictures(db, html, cwd);
  assert.equal((r.html.match(/data:image\/png;base64,/g) ?? []).length, 4, 'three PNGs of the folder and the kept one');
  assert.equal((r.html.match(/data:image\/svg\+xml;base64,/g) ?? []).length, 2, 'the SVG, in a style block and an attribute');
  assert.ok(!r.html.includes('images/dot.png') && !r.html.includes(kept));
  assert.match(r.notes[0], /^3 pictures from your folder went inside the page\./, 'each picture once, however often it is named');
  assert.ok(r.html.includes(`url('data:image/svg+xml;base64,`), 'url() keeps its quotes');
});

ok('the web, data:, anchors and the app’s routes stay as they are', () => {
  const html = '<img src="https://example.com/a.png"><img src="data:image/png;base64,AAAA"><a href="#top">top</a><img src="//cdn.example.com/b.png"><img src="/api/pages/assets/abc">';
  const r = pagePictures(db, html, cwd);
  assert.equal(r.html, html);
  assert.deepEqual(r.notes, []);
});

ok('a missing picture and a file that is not one stay as written, and are said', () => {
  const r = pagePictures(db, '<img src="images/gone.png"><img src="notes.txt"><script src="app.js"></script>', cwd);
  assert.ok(r.html.includes('src="images/gone.png"') && r.html.includes('src="notes.txt"') && r.html.includes('src="app.js"'));
  assert.ok(r.notes.some((n) => n.startsWith('images/gone.png: no such picture')));
  assert.ok(r.notes.some((n) => n.startsWith('notes.txt is not a PNG')));
  assert.ok(!r.notes.some((n) => n.includes('app.js')), 'a script that is no file says nothing');
});

ok('a page over the limit with its pictures is refused in words', () => {
  // A picture that cannot be made smaller here (an SVG) and is larger than a page may be.
  const big = Buffer.concat([Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><!--'), Buffer.alloc(MAX_PAGE, 'x'), Buffer.from('--></svg>')]);
  fs.writeFileSync(path.join(cwd, 'images/big.svg'), big);
  assert.throws(() => pagePictures(db, '<img src="images/big.svg">', cwd), /over the 2 MB a page may be/);
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed`);
