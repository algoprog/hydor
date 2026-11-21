// Script test for where a card's picture loads from (picture.ts): through this server in the app, nothing from the web
// in a confidential session, and on an app's public page straight from an https address on the web, nothing else.
// Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/components/answer/picture-test.ts && node dist/dev/picture-test.js
import assert from 'node:assert/strict';
import { pictureAddress } from './picture';

let passed = 0;
let total = 0;
const test = (name: string, fn: () => void) => {
  total++;
  try {
    fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
};

/** This server's way, as Markdown.tsx's replyPicture goes (a picture on the web by its fetcher, a file by its path). */
const viaApp = (src: string, cwd?: string) => (/^https?:\/\//.test(src) ? `/api/pages/picture?url=${encodeURIComponent(src)}` : src.startsWith('/') ? `/api/fs/raw?path=${src}` : cwd ? `/api/fs/raw?path=${cwd}/${src}` : null);
const pic = 'https://upload.wikimedia.org/a/b.jpg';

test('in the app: through this server, as before (a file by its path, a relative one in its folder)', () => {
  assert.equal(pictureAddress(pic, {}, viaApp), `/api/pages/picture?url=${encodeURIComponent(pic)}`);
  assert.equal(pictureAddress(' /home/a/p.png ', {}, viaApp), '/api/fs/raw?path=/home/a/p.png');
  assert.equal(pictureAddress('p.png', { cwd: '/w' }, viaApp), '/api/fs/raw?path=/w/p.png');
  assert.equal(pictureAddress('', {}, viaApp), null);
});

test('in a confidential session: nothing from the web, a file of this computer still', () => {
  assert.equal(pictureAddress(pic, { offline: true }, viaApp), null);
  assert.equal(pictureAddress('/home/a/p.png', { offline: true }, viaApp), '/api/fs/raw?path=/home/a/p.png');
});

test('on a public page: an https address straight from the web; anything else no picture, never through this server', () => {
  assert.equal(pictureAddress(pic, { webOnly: true }, viaApp), pic);
  assert.equal(pictureAddress(` ${pic} `, { webOnly: true, cwd: '/w' }, viaApp), pic);
  for (const s of ['http://example.com/a.jpg', '/home/a/p.png', 'p.png', '~/p.png', 'file:///home/a/p.png', 'asset:cover.jpg', 'data:image/png;base64,iVBOR', 'javascript:alert(1)', 'https://user:pw@example.com/a.jpg', 'https:/a.jpg', ''])
    assert.equal(pictureAddress(s, { webOnly: true }, viaApp), null, s);
  // Even when a public page's card would be confidential: only the web, and only https.
  assert.equal(pictureAddress(pic, { webOnly: true, offline: true }, viaApp), pic);
});

console.log(`\n${passed} of ${total} passed`);
