// Script tests for the taskbar badge (desktop/badge.cjs): the text for a count ('' for none, '1' to '9', '9+' from 10),
// the pixels of the badge (transparent corners, a red circle with anti-aliased edges, white text on top, premultiplied
// alpha), and that a bigger count sets more of the text's pixels. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/desktop-badge-test.ts && node dist/dev/desktop-badge-test.js
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

interface Bitmap {
  width: number;
  height: number;
  data: Buffer;
}
const { badgeBitmap, badgeText } = createRequire(import.meta.url)('../../desktop/badge.cjs') as { badgeBitmap: (count: number, size?: number) => Bitmap | null; badgeText: (count: number) => string };

/** The badge for a count, which must have one. */
function bitmap(count: number, size = 32): Bitmap {
  const b = badgeBitmap(count, size);
  assert.ok(b, `a badge for ${count}`);
  return b;
}

/** The four bytes of a pixel, in the order B, G, R, A. */
function px(b: Bitmap, x: number, y: number): number[] {
  const i = (y * b.width + x) * 4;
  return [...b.data.subarray(i, i + 4)];
}

/** How many pixels are opaque white. */
function whites(b: Bitmap): number {
  let n = 0;
  for (let i = 0; i < b.data.length; i += 4) {
    if (b.data.subarray(i, i + 4).every((v) => v === 255)) n++;
  }
  return n;
}

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

test('badgeText: nothing below one, the digit for 1 to 9 (fractions floored), and 9+ from 10 up', () => {
  assert.equal(badgeText(0), '');
  assert.equal(badgeText(-1), '');
  assert.equal(badgeText(NaN), '');
  assert.equal(badgeText(1), '1');
  assert.equal(badgeText(9), '9');
  assert.equal(badgeText(9.7), '9');
  assert.equal(badgeText(10), '9+');
  assert.equal(badgeText(250), '9+');
});

test('badgeBitmap: null for no count; for a count, a square of size × size pixels, size × size × 4 bytes', () => {
  assert.equal(badgeBitmap(0), null);
  const b = bitmap(3, 32);
  assert.equal(b.width, 32);
  assert.equal(b.height, 32);
  assert.equal(b.data.length, 4096);
});

test('badgeBitmap(1, 32): the corner is transparent, the edge is red, the text is white, and every colour is within its alpha', () => {
  const b = bitmap(1, 32);
  assert.deepEqual(px(b, 0, 0), [0, 0, 0, 0]);
  const edge = px(b, 16, 1);
  assert.ok(edge[3] > 0, 'the edge pixel is drawn');
  assert.ok(edge[2] > edge[1], 'the edge pixel is red (R above G)');
  assert.ok(whites(b) >= 1, 'some pixel is opaque white');
  for (let y = 0; y < b.height; y++) {
    for (let x = 0; x < b.width; x++) {
      const [bl, g, r, a] = px(b, x, y);
      assert.ok(bl <= a && g <= a && r <= a, `pixel ${x},${y} is premultiplied`);
    }
  }
});

test('badgeBitmap(12, 32) sets more white pixels than badgeBitmap(1, 32)', () => {
  assert.ok(whites(bitmap(12, 32)) > whites(bitmap(1, 32)));
});

test('badgeBitmap(5, 16): a 16 × 16 badge with some white text', () => {
  const b = bitmap(5, 16);
  assert.equal(b.width, 16);
  assert.equal(b.height, 16);
  assert.equal(b.data.length, 1024);
  assert.ok(whites(b) >= 1);
});

let passed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.log(`FAIL ${name}\n     ${(e as Error).message.split('\n').join('\n     ')}`);
  }
}
console.log(`\n${passed}/${tests.length} passed`);
if (passed !== tests.length) process.exit(1);
