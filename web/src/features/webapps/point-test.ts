// Pointing: only a message from the frame's own origin counts, and what it says is cleaned. Run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/webapps/point-test.ts && DATA_DIR=<scratch> node dist/dev/point-test.js
import assert from 'node:assert/strict';
import { pointNote, readFrameMessage } from './point.ts';

const url = 'http://shop.localhost:8792/__hydor/open?t=x&to=%2F';
const good = { hydor: 'hydor-webapp-point', path: '/customers?page=2', text: '  Add   customer\n', kind: 'button', tag: 'button' };

assert.deepEqual(readFrameMessage(good, 'http://shop.localhost:8792', url), { type: 'point', pointed: { path: '/customers?page=2', text: 'Add customer', kind: 'button', tag: 'button' } });
// Another origin (another site's frame, a page of Hydor's own, an opaque origin) is not the app.
for (const origin of ['http://evil.localhost:8792', 'http://localhost:8790', 'null', 'https://shop.localhost:8792', '']) assert.equal(readFrameMessage(good, origin, url), null, origin);
// No frame address yet, or a broken one.
assert.equal(readFrameMessage(good, 'http://shop.localhost:8792', ''), null);
assert.equal(readFrameMessage(good, 'http://shop.localhost:8792', 'not a url'), null);
// Messages of other kinds, and paths that leave the app.
assert.equal(readFrameMessage({ ...good, hydor: 'something-else' }, 'http://shop.localhost:8792', url), null);
for (const path of ['//evil.test', 'https://evil.test/', 'customers', 7, undefined, '/a\nb']) assert.equal(readFrameMessage({ ...good, path }, 'http://shop.localhost:8792', url), null, String(path));
assert.deepEqual(readFrameMessage({ hydor: 'hydor-webapp-path', path: '/jobs' }, 'http://shop.localhost:8792', url), { type: 'path', path: '/jobs' });
// The words are cut, the kind is one of the known, the tag a plain name.
const long = readFrameMessage({ ...good, text: 'x'.repeat(500), kind: 'rm -rf', tag: '<script>' }, 'http://shop.localhost:8792', url);
assert.equal(long?.type === 'point' && long.pointed.text.length, 120);
assert.equal(long?.type === 'point' && long.pointed.kind, 'text');
assert.equal(long?.type === 'point' && long.pointed.tag, '');
// The reference in the message box.
assert.equal(pointNote({ path: '/customers', text: 'Add customer', kind: 'button', tag: 'button' }), 'About the button “Add customer” on /customers:');
assert.equal(pointNote({ path: '/', text: '', kind: 'image', tag: 'img' }), 'About the image on /:');
console.log('point-test: ok');
