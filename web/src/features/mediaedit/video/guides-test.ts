// Script tests for the guides in the video editor's viewer (guides.ts): a box moved snaps its edges and middle to the
// frame, the safe area and the other parts, stays on a line with Shift, snaps to nothing with Alt but still gives the
// distances; a box sized about its middle lines an edge up with a line of the frame or another part, or becomes as wide
// as one, and says its size. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/mediaedit/video/guides-test.ts && node dist/dev/guides-test.js
import { moveBox, NO_MARKS, pullOf, safeBox, sizeBox } from './guides';

let passed = 0;
let failed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};
const close = (a: number, b: number, d = 0.01) => Math.abs(a - b) <= d;
const B = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const out = { w: 1920, h: 1080 };

// ---- moving ----------------------------------------------------------------------------------------------------------
{
  // Words 400 wide, their middle 4 pixels left of the frame's: pulled to the middle, with the vertical line there.
  const m = moveBox(B(756, 300, 400, 80), 0, 0, [], out, { tol: 8 });
  ok(close(m.dx, 4), `snaps to the frame's middle: ${m.dx}`);
  ok(m.marks.guides.some((g) => g.axis === 'x' && close(g.at, 960)), 'the vertical line is at the frame’s middle');
  ok(close(m.dy, 0), 'nothing to snap to in y');
  // Far from any line: unchanged, no guides.
  const far = moveBox(B(700, 300, 200, 80), 33, 20, [], out, { tol: 8 });
  ok(close(far.dx, 33) && close(far.dy, 20) && far.marks.guides.length === 0, 'nothing near: the pointer’s move as it is');
}
{
  // Its left edge near the safe area's (96 px in): it goes there.
  const safe = safeBox(out);
  ok(close(safe.x, 96) && close(safe.w, 1728), 'the safe area is 5% in');
  const m = moveBox(B(100, 300, 200, 80), 0, 0, [], out, { tol: 8 });
  ok(close(m.dx, -4), `the safe area’s edge pulls: ${m.dx}`);
  // Its right edge to the frame's edge.
  const r = moveBox(B(1700, 300, 216, 80), 0, 0, [], out, { tol: 8 });
  ok(close(r.dx, 4), `its right edge goes to the frame's: ${r.dx}`);
}
{
  // Another part: lined up on its top edge and, with the equal gap, its distance marked.
  const other = B(200, 500, 300, 100);
  const m = moveBox(B(800, 503, 200, 60), 0, 0, [other], out, { tol: 8 });
  ok(close(m.dy, -3), `its top lines up with the other's: ${m.dy}`);
  ok(m.marks.guides.some((g) => g.axis === 'y' && close(g.at, 500)), 'the line is on the other’s top');
  ok(m.marks.gaps.some((g) => !g.vertical && close(g.value, 300)), `the distance to it is marked (500 - 800): ${JSON.stringify(m.marks.gaps)}`);
}
{
  // Shift: the move stays on the line it mostly goes along, and snaps along that only.
  const s = moveBox(B(700, 300, 200, 80), 80, 12, [], out, { tol: 8, shift: true });
  ok(close(s.dy, 0), 'straight: no move in y');
  ok(s.dx > 70, 'straight: the move along x is kept');
  const v = moveBox(B(700, 300, 200, 80), 5, 90, [], out, { tol: 8, shift: true });
  ok(close(v.dx, 0), 'straight the other way');
}
{
  // Alt: no snapping, no lines; the distances still show.
  const n = moveBox(B(756, 300, 400, 80), 0, 0, [B(100, 300, 100, 80)], out, { tol: 8, noSnap: true });
  ok(close(n.dx, 0) && close(n.dy, 0) && n.marks.guides.length === 0, 'Alt: nothing snaps');
  ok(n.marks.gaps.length > 0, 'Alt: the distance to the part beside it still shows');
}
ok(NO_MARKS.guides.length === 0 && pullOf(0.5) === 12 && pullOf(1) === 6, 'the pull is six screen pixels');

// ---- sizing ----------------------------------------------------------------------------------------------------------
{
  // A 400×225 overlay centred at 960,540 sized to about 1900 wide: its edges meet the frame's at 1920.
  const b = B(760, 427.5, 400, 225);
  const s = sizeBox(b, 1904, [], out, { tol: 12, k: 0.5 });
  ok(close(s.w, 1920), `the width that fills the frame: ${s.w}`);
  ok(s.marks.pills.length === 1 && s.marks.pills[0].text === '1920 × 1080', `the pill says its size: ${s.marks.pills[0]?.text}`);
  ok(s.marks.guides.some((g) => g.axis === 'x' && close(g.at, 0)) && s.marks.guides.some((g) => g.axis === 'x' && close(g.at, 1920)), 'lines on both edges');
}
{
  // As wide as another part.
  const other = B(100, 100, 500, 100);
  const s = sizeBox(B(760, 427.5, 400, 225), 494, [other], out, { tol: 10, k: 1 });
  ok(close(s.w, 500), `as wide as the other part: ${s.w}`);
  // Nothing near: the width asked for.
  const f = sizeBox(B(760, 427.5, 400, 225), 777, [], out, { tol: 4, k: 1 });
  ok(close(f.w, 777) && !f.marks.guides.some((g) => g.axis === 'x' && !close(g.at, 960)), 'nothing near: as asked, no line on its edges');
  // Alt: as asked, and the pill still says the size.
  const n = sizeBox(B(760, 427.5, 400, 225), 1904, [], out, { tol: 12, k: 1, noSnap: true });
  ok(close(n.w, 1904) && n.marks.pills.length === 1, 'Alt: as asked');
  // Never smaller than a few pixels.
  ok(sizeBox(B(760, 427.5, 400, 225), -50, [], out, { tol: 4, k: 1 }).w >= 8, 'a smallest size');
}

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
