// Script tests for the picture editor's pure parts: selections as masks (a rectangle, an ellipse and a lasso's shape
// made masks with smooth edges, added, taken away, crossed and inverted, feathered, grown and shrunk, their outline for
// the marching ants), the magic wand's and the paint bucket's flood fill (by tolerance, touching or anywhere), where a
// stroke's dabs go, and the spot healing brush's fill. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/mediaedit/picture/picture-test.ts && node dist/dev/picture-test.js
import { dabsTo, healFill } from './heal';
import { allMask, combineMasks, coversAll, ellipseMask, featherMask, floodMask, growMask, invertMask, maskArea, maskAt, maskBounds, maskOutline, polygonMask, rectMask, shrinkMask, type Mask } from './mask';

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};
const close = (a: number, b: number, d: number) => Math.abs(a - b) <= d;
const box = (m: Mask | null) => (m ? JSON.stringify(maskBounds(m)) : 'none');

// ---- shapes ----------------------------------------------------------------------------------------------------------
{
  const r = rectMask({ x: 10, y: 5, w: 20, h: 10 }, 100, 50)!;
  ok(r.x === 10 && r.y === 5 && r.w === 20 && r.h === 10 && maskArea(r) === 200, `a rectangle on whole pixels: ${box(r)} ${maskArea(r)}`);
  const half = rectMask({ x: 10.5, y: 5, w: 20, h: 10 }, 100, 50)!;
  ok(maskAt(half, 10, 6) === 128 && maskAt(half, 11, 6) === 255 && maskAt(half, 30, 6) === 128 && close(maskArea(half), 200, 1), 'a rectangle between pixels: half a pixel at its edges');
  ok(rectMask({ x: -10, y: -10, w: 20, h: 20 }, 100, 50)!.x === 0 && rectMask({ x: 200, y: 0, w: 5, h: 5 }, 100, 50) === null, 'kept within the picture; outside it, nothing');
  const e = ellipseMask({ x: 0, y: 0, w: 40, h: 20 }, 100, 50)!;
  ok(close(maskArea(e), Math.PI * 20 * 10, 4) && maskAt(e, 20, 10) === 255 && maskAt(e, 0, 0) === 0, `an ellipse's area: ${maskArea(e).toFixed(1)} of ${(Math.PI * 200).toFixed(1)}`);
  const tri = polygonMask([0, 0, 40, 0, 0, 40], 100, 100)!;
  ok(close(maskArea(tri), 800, 3), `a lasso's triangle: ${maskArea(tri).toFixed(1)} of 800`);
  // A shape crossing itself: the middle of a figure 8 on its side… and a ring, filled by the even-odd rule.
  const ring = polygonMask([0, 0, 30, 0, 30, 30, 0, 30, 0, 0, 10, 10, 20, 10, 20, 20, 10, 20, 10, 10], 50, 50)!;
  ok(maskAt(ring, 15, 15) === 0 && maskAt(ring, 5, 5) === 255 && close(maskArea(ring), 900 - 100, 2), 'a lasso round a hole leaves the hole out');
  ok(polygonMask([0, 0, 5, 5], 10, 10) === null, 'two points are no shape');
}

// ---- together ----------------------------------------------------------------------------------------------------------
{
  const a = rectMask({ x: 0, y: 0, w: 20, h: 20 }, 100, 100)!;
  const b = rectMask({ x: 10, y: 10, w: 20, h: 20 }, 100, 100)!;
  const add = combineMasks(a, b, 'add')!;
  ok(maskArea(add) === 700 && box(add) === '{"x":0,"y":0,"w":30,"h":30}', `added: ${maskArea(add)}`);
  const sub = combineMasks(a, b, 'subtract')!;
  ok(maskArea(sub) === 300 && maskAt(sub, 15, 15) === 0 && maskAt(sub, 5, 5) === 255, `taken away: ${maskArea(sub)}`);
  const both = combineMasks(a, b, 'intersect')!;
  ok(maskArea(both) === 100 && box(both) === '{"x":10,"y":10,"w":10,"h":10}', 'crossed: only where both are');
  ok(combineMasks(a, rectMask({ x: 50, y: 50, w: 5, h: 5 }, 100, 100), 'intersect') === null, 'crossed with what it does not touch: nothing');
  ok(combineMasks(null, b, 'add') === b && combineMasks(a, b, 'replace') === b && combineMasks(null, b, 'subtract') === null, 'with no selection yet');
  const inv = invertMask(a, 100, 100)!;
  ok(maskArea(inv) === 10000 - 400 && maskAt(inv, 5, 5) === 0 && maskAt(inv, 50, 50) === 255, 'inverted: everything else');
  ok(invertMask(allMask(100, 100), 100, 100) === null && coversAll(allMask(30, 20), 30, 20) && !coversAll(a, 100, 100), 'the whole picture inverted is nothing');
  const twice = invertMask(inv, 100, 100)!;
  ok(maskArea(twice) === 400 && box(twice) === box(a), 'inverted twice, as it was');
}

// ---- feather, grow, shrink ----------------------------------------------------------------------------------------------
{
  const a = rectMask({ x: 30, y: 30, w: 40, h: 40 }, 100, 100)!;
  const f = featherMask(a, 8, 100, 100)!;
  ok(close(maskArea(f), 1600, 40) && maskAt(f, 50, 50) === 255 && maskAt(f, 30, 50) > 90 && maskAt(f, 30, 50) < 165 && maskAt(f, 26, 50) > 0 && maskAt(f, 26, 50) < maskAt(f, 30, 50), `feathered: a soft edge round the same area (${maskArea(f).toFixed(0)}, edge ${maskAt(f, 30, 50)})`);
  const g = growMask(a, 5, 100, 100)!;
  ok(box(g) === '{"x":25,"y":25,"w":50,"h":50}' && maskAt(g, 26, 50) === 255, `grown by 5 all round: ${box(g)}`);
  const s = shrinkMask(a, 5, 100, 100)!;
  ok(box(s) === '{"x":35,"y":35,"w":30,"h":30}', `shrunk by 5 all round: ${box(s)}`);
  const edge = rectMask({ x: 0, y: 0, w: 40, h: 40 }, 100, 100)!;
  const se = shrinkMask(edge, 5, 100, 100)!;
  ok(box(se) === '{"x":0,"y":0,"w":35,"h":35}', `along the picture's edges a selection does not draw back: ${box(se)}`);
  ok(shrinkMask(rectMask({ x: 10, y: 10, w: 6, h: 6 }, 100, 100)!, 5, 100, 100) === null, 'shrunk past its middle: nothing left');
  const gc = growMask(rectMask({ x: 50, y: 50, w: 1, h: 1 }, 100, 100)!, 10, 100, 100)!;
  ok(maskAt(gc, 50, 41) === 255 && maskAt(gc, 50, 39) === 0 && maskAt(gc, 43, 43) > 0 && maskAt(gc, 41, 41) === 0, 'grown round, not square');
}

// ---- the magic wand and the bucket --------------------------------------------------------------------------------------
{
  const w = 40;
  const h = 20;
  const px = new Uint8ClampedArray(w * h * 4);
  // Two blue squares apart, on white, with a slightly different blue in the second.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = x >= 2 && x < 12 && y >= 2 && y < 12 ? [20, 40, 200] : x >= 25 && x < 35 && y >= 5 && y < 15 ? [26, 44, 206] : [255, 255, 255];
      px.set([...c, 255], (y * w + x) * 4);
    }
  const one = floodMask(px, w, h, 5, 5, 10, true)!;
  ok(maskArea(one) === 100 && box(one) === '{"x":2,"y":2,"w":10,"h":10}', 'touching: only the square clicked');
  const all = floodMask(px, w, h, 5, 5, 10, false)!;
  ok(maskArea(all) === 200, 'anywhere: both squares, near enough in colour');
  const strict = floodMask(px, w, h, 5, 5, 3, false)!;
  ok(maskArea(strict) === 100, 'a smaller tolerance: only the same blue');
  const bg = floodMask(px, w, h, 0, 0, 0, true)!;
  ok(maskArea(bg) === w * h - 200 && maskAt(bg, 5, 5) === 0, 'the background, around the squares');
  ok(floodMask(px, w, h, -1, 5, 10, true) === null, 'outside the picture: nothing');
}

// ---- outlines (marching ants) -----------------------------------------------------------------------------------------
{
  const a = rectMask({ x: 10, y: 10, w: 20, h: 10 }, 100, 100)!;
  const lines = maskOutline(a);
  ok(lines.length === 1 && lines[0].length === 10, `a rectangle's outline: one closed line through its four corners: ${JSON.stringify(lines)}`);
  const xs = lines[0].filter((_, i) => i % 2 === 0);
  const ys = lines[0].filter((_, i) => i % 2 === 1);
  ok(Math.min(...xs) === 10 && Math.max(...xs) === 30 && Math.min(...ys) === 10 && Math.max(...ys) === 20 && lines[0][0] === lines[0][8] && lines[0][1] === lines[0][9], 'along its edges, ending where it began');
  const two = combineMasks(a, rectMask({ x: 50, y: 50, w: 5, h: 5 }, 100, 100), 'add')!;
  ok(maskOutline(two).length === 2, 'two parts, two lines');
  const holed = combineMasks(rectMask({ x: 0, y: 0, w: 30, h: 30 }, 100, 100), rectMask({ x: 10, y: 10, w: 10, h: 10 }, 100, 100), 'subtract')!;
  ok(maskOutline(holed).length === 2, 'a hole has its own line');
  ok(maskOutline(allMask(64, 64), 4).length === 1, 'looked at four pixels at a time, still one line');
}

// ---- dabs ---------------------------------------------------------------------------------------------------------------
{
  let t = { x: 0, y: 0, carry: 0 };
  const a = dabsTo(t, 10, 0, 4);
  ok(JSON.stringify(a.pts) === '[4,0,8,0]' && close(a.trail.carry, 2, 1e-9), `four apart along the way: ${JSON.stringify(a)}`);
  t = a.trail;
  const b = dabsTo(t, 10, 7, 4);
  ok(b.pts.length === 4 && close(b.pts[1], 2, 1e-9) && close(b.pts[3], 6, 1e-9), `going on from where the last one was: ${JSON.stringify(b.pts)}`);
  const c = dabsTo({ x: 0, y: 0, carry: 0 }, 1, 0, 4);
  ok(c.pts.length === 0 && c.trail.carry === 1, 'a small move: no dab yet, the distance kept');
  const d = dabsTo(c.trail, 3, 0, 4);
  ok(d.pts.length === 0 && d.trail.carry === 3 && dabsTo(d.trail, 5, 0, 4).pts.join() === '4,0', 'it adds up');
}

// ---- healing ------------------------------------------------------------------------------------------------------------
{
  const w = 30;
  const h = 20;
  const px = new Uint8ClampedArray(w * h * 4);
  // A left-to-right gradient with a dark spot in it.
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.set(x >= 13 && x < 17 && y >= 8 && y < 12 ? [0, 0, 0, 255] : [x * 8, 100, 200 - x * 4, 255], (y * w + x) * 4);
  const hole = new Uint8Array(w * h);
  for (let y = 7; y < 13; y++) for (let x = 12; x < 18; x++) hole[y * w + x] = 255;
  const before = new Uint8ClampedArray(px);
  healFill(px, w, h, hole);
  const at = (x: number, y: number) => [...px.subarray((y * w + x) * 4, (y * w + x) * 4 + 4)];
  ok(close(at(15, 10)[0], 15 * 8, 20) && close(at(15, 10)[1], 100, 8) && close(at(15, 10)[2], 200 - 60, 12), `the spot takes the gradient around it: ${at(15, 10)}`);
  let kept = true;
  for (let i = 0; i < w * h; i++) if (!hole[i]) for (let c = 0; c < 4; c++) if (px[i * 4 + c] !== before[i * 4 + c]) kept = false;
  ok(kept, 'every pixel outside the spot as it was');
  const flat = new Uint8ClampedArray(16 * 16 * 4).fill(90);
  for (let i = 3; i < flat.length; i += 4) flat[i] = 255;
  const fh = new Uint8Array(256);
  for (let i = 0; i < 256; i++) if (i % 16 > 5 && i % 16 < 10 && i >> 4 > 5 && i >> 4 < 10) fh[i] = 255;
  for (let i = 0; i < 256; i++) if (fh[i]) flat.set([255, 0, 0, 255], i * 4);
  healFill(flat, 16, 16, fh);
  ok(close(flat[(8 * 16 + 8) * 4], 90, 2) && close(flat[(8 * 16 + 8) * 4 + 1], 90, 2), 'on a plain colour, the plain colour');
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
