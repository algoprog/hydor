// Script test for the pictures the capture browser takes (server/capture/index.ts): a page whose left and right halves
// differ, with a black block at its top left, taken as ui_screenshot takes it (the picture you see, a WebP, and the
// agent's smaller JPEG, on a computer and a phone), as a JPEG at full size, and as a Library thumbnail. Each comes back
// at its size with the page's colours where they belong, read through the capture browser itself (no copy of the block
// in the top-right quarter); and each JPEG is one interleaved scan with its components numbered from 1, as every
// decoder expects. The full Chromium's own JPEGs are one scan per component, numbered from 0: models were shown those
// as two half-width copies with the text shredded (browser/jpeg.ts). Needs a Chromium; without one it says so.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/capture/capture-test.ts
//   DATA_DIR=/tmp/hydor-test-capture node dist/dev/capture-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pickChrome } from '../browser/chrome.ts';
import { jpegLayout } from '../browser/jpeg.ts';
import { canCapture, capture, closeCapture, withTab, type Captured } from './index.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

/** Red left half with a black block at its top left, blue right half: what is where is plain in any picture of it. */
const PAGE = `<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>
html, body { margin: 0; height: 100%; }
body { display: grid; grid-template-columns: 1fr 1fr; }
.l { background: #e00000; position: relative; } .r { background: #0000e0; }
.k { position: absolute; left: 0; top: 0; width: 30%; height: 25%; background: #000; }
</style></head><body><div class="l"><div class="k"></div></div><div class="r"></div></body></html>`;

/** Points as fractions of the picture, and the colour each must have: the block, the red half, the top-right quarter, the blue half. */
const POINTS: [number, number, number[]][] = [
  [0.04, 0.05, [0, 0, 0]],
  [0.3, 0.6, [224, 0, 0]],
  [0.04 + 0.5, 0.05, [0, 0, 224]],
  [0.6, 0.05, [0, 0, 224]],
  [0.95, 0.95, [0, 0, 224]],
  [0.75, 0.6, [0, 0, 224]],
];

/** What a picture holds, read with the capture browser's own decoder: its size and the colour at each point. */
async function read(img: Buffer, mime: string): Promise<{ w: number; h: number; c: number[][] }> {
  const html = `<!doctype html><body style="margin:0"><img id="i" src="data:${mime};base64,${img.toString('base64')}"></body>`;
  const pts = POINTS.map(([x, y]) => [x, y]);
  return withTab({ html, width: 400, height: 300, settleMs: 50 }, (tab) =>
    tab.evaluate(
      `(async () => { const i = document.getElementById('i'); await i.decode(); const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; const g = c.getContext('2d'); g.drawImage(i, 0, 0); return { w: c.width, h: c.height, c: ${JSON.stringify(pts)}.map(([x, y]) => Array.from(g.getImageData(Math.floor(x * c.width), Math.floor(y * c.height), 1, 1).data).slice(0, 3)) }; })()`,
    ),
  );
}

async function looksRight(img: Buffer, mime: string, w: number, h: number, what: string) {
  const r = await read(img, mime);
  assert.deepEqual([r.w, r.h], [w, h], `${what}: its size`);
  r.c.forEach((c, k) => {
    const [x, y, want] = POINTS[k];
    assert.ok(
      c.every((v, j) => Math.abs(v - want[j]) < 48),
      `${what}: at (${x}, ${y}) ${JSON.stringify(c)}, not ${JSON.stringify(want)}${k === 2 ? ' (a copy of the top-left block in the top-right quarter: the picture is garbled)' : ''}`,
    );
  });
}

function interleaved(jpeg: Buffer, what: string) {
  const l = jpegLayout(jpeg);
  assert.deepEqual(l.frame, [1, 2, 3], `${what}: its components numbered 1 to 3`);
  assert.deepEqual(l.scans, [[1, 2, 3]], `${what}: one scan with all three components`);
}

const tests: [string, () => Promise<void>][] = [];
const test = (name: string, fn: () => Promise<void>) => tests.push([name, fn]);

test('the jpegLayout reader tells an interleaved JPEG from one scan per component', async () => {
  // The headers of the full Chromium's JPEG (three scans, components 0–2) and of an interleaved one (one scan).
  const seg = (m: number, body: number[]) => [0xff, m, (body.length + 2) >> 8, (body.length + 2) & 255, ...body];
  const frame = (ids: number[]) => seg(0xc0, [8, 0, 8, 0, 8, ids.length, ...ids.flatMap((id, k) => [id, k ? 0x11 : 0x22, k ? 1 : 0])]);
  const scan = (ids: number[]) => [...seg(0xda, [ids.length, ...ids.flatMap((id) => [id, 0]), 0, 63, 0]), 0x12, 0x34];
  const own = Buffer.from([0xff, 0xd8, ...frame([0, 1, 2]), ...scan([0]), ...scan([1]), ...scan([2]), 0xff, 0xd9]);
  assert.throws(() => jpegLayout(Buffer.from('not a picture')), /not a JPEG/);
  const good = Buffer.from([0xff, 0xd8, ...frame([1, 2, 3]), ...scan([1, 2, 3]), 0xff, 0xd9]);
  assert.deepEqual(jpegLayout(own), { frame: [0, 1, 2], scans: [[0], [1], [2]] });
  assert.throws(() => interleaved(own, 'Chromium’s own'));
  interleaved(good, 'an interleaved one');
});

test('ui_screenshot on a computer: the picture you see and the agent’s smaller JPEG both come back right', async () => {
  for (let n = 0; n < 3; n++) {
    const shot: Captured = await capture({ html: PAGE, width: 1280, height: 800, scale: 1, settleMs: 200, format: 'webp', quality: 82, alt: { format: 'jpeg', quality: 68, outWidth: 1024 } });
    assert.deepEqual([shot.width, shot.height], [1280, 800]);
    await looksRight(shot.data, 'image/webp', 1280, 800, `the picture (${n})`);
    assert.ok(shot.alt, 'the agent’s copy');
    interleaved(shot.alt!, `the agent’s copy (${n})`);
    await looksRight(shot.alt!, 'image/jpeg', 1024, 640, `the agent’s copy (${n})`);
  }
});

test('ui_screenshot on a phone: twice the pixels for you, the agent’s copy at 390 wide', async () => {
  const shot = await capture({ html: PAGE, width: 390, height: 844, scale: 2, mobile: true, settleMs: 200, format: 'webp', quality: 82, alt: { format: 'jpeg', quality: 68, outWidth: 390 } });
  await looksRight(shot.data, 'image/webp', 780, 1688, 'the picture');
  interleaved(shot.alt!, 'the agent’s copy');
  await looksRight(shot.alt!, 'image/jpeg', 390, 844, 'the agent’s copy');
});

test('a JPEG at full size, and a whole page taller than the window', async () => {
  const shot = await capture({ html: PAGE, width: 800, height: 500, settleMs: 100, format: 'jpeg', quality: 80 });
  interleaved(shot.data, 'the JPEG');
  await looksRight(shot.data, 'image/jpeg', 800, 500, 'the JPEG');
  const tall = PAGE.replace('height: 100%;', 'height: 1500px;');
  const full = await capture({ html: tall, width: 800, height: 500, settleMs: 100, format: 'jpeg', quality: 80, fullPage: true, outWidth: 400 });
  interleaved(full.data, 'the whole page');
  await looksRight(full.data, 'image/jpeg', 400, 750, 'the whole page');
});

test('a Library thumbnail (a WebP, 528 wide)', async () => {
  const shot = await capture({ html: PAGE, width: 880, height: 550, outWidth: 528, format: 'webp', quality: 74, settleMs: 100, blockPrivate: true });
  await looksRight(shot.data, 'image/webp', 528, 330, 'the thumbnail');
});

if (!canCapture()) {
  console.log('No Chromium here: the pictures are not tested.');
  process.exit(0);
}
console.log(`with ${pickChrome('')?.path}`);
let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}\n${(e as Error).stack}`);
  }
}
closeCapture();
console.log(failed ? `${failed} of ${tests.length} failed` : `all ${tests.length} passed`);
process.exit(failed ? 1 : 0);
