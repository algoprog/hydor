// Script tests for the smart guides' maths (shared/snap.ts), which designs and diagrams share: a box moved lines up with
// the others (edges and middles, the guide drawn from where it ended up), sits at equal gaps, shows its distance to the
// nearest part on each side; a box sized snaps the edges that move (to edges and middles, to the same width or height
// as another, to the grid), keeps its shape under Shift (the edge that moved most is snapped, the other follows), and
// the editor that runs the maths inside a design's frame gets the same function as text. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs shared/snap-test.ts
//   DATA_DIR=/tmp/hydor-test-snap node dist/dev/snap-test.js
import { snapKit, SNAP, type SnapBox } from './snap.ts';

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};
const close = (a: number, b: number, eps = 0.01) => Math.abs(a - b) <= eps;
const B = (x: number, y: number, w: number, h: number): SnapBox => ({ x, y, w, h });

// ---- moving --------------------------------------------------------------------------------------------------------
{
  const others = [B(100, 100, 80, 40), B(300, 200, 60, 60)];
  const m = SNAP.snapMove(B(103, 400, 50, 30), others, 6);
  ok(m.x && close(m.dx, -3) && !m.y && m.dy === 0, 'a left edge near another’s is drawn to it, the other axis left alone');
  ok(m.guides.length === 1 && m.guides[0].axis === 'x' && close(m.guides[0].at, 100), 'one vertical guide at the edge');
  // The guide runs from the part it lines up with down to the box where it ended up (not where it was).
  ok(close(m.guides[0].from, 100) && close(m.guides[0].to, 430), `its guide reaches the box as it ended (${m.guides[0].from}–${m.guides[0].to})`);
  const mid = SNAP.snapMove(B(150, 98, 20, 30), [B(100, 300, 120, 50)], 6);
  ok(mid.x && close(mid.dx, 0) && !mid.y, 'a middle on a middle: already there');
  const both = SNAP.snapMove(B(104, 205, 50, 30), others, 6);
  ok(both.x && both.y && close(both.dx, -4) && close(both.dy, -5), 'both axes can snap at once');
  const far = SNAP.snapMove(B(220, 400, 50, 30), others, 6);
  ok(!far.x && !far.y && far.guides.length === 0, 'out of reach: nothing');
  // A guide's reach is the box where it ended up: snapped on the other axis too, it is that much shorter.
  const reach = SNAP.snapMove(B(103, 393, 50, 30), [B(100, 100, 80, 40), B(300, 420, 60, 60)], 6);
  const vg = reach.guides.find((g) => g.axis === 'x');
  ok(reach.x && reach.y && close(reach.dy, -3) && vg && close(vg.to, 420), `a vertical guide ends at the box as snapped (${vg?.to}, not 423)`);
  // The frame (a page) offers its edges and middle.
  const fr = SNAP.snapMove(B(497, 10, 10, 10), [], 6, { w: 1000, h: 600 });
  ok(fr.x && close(fr.dx, -2) && fr.guides[0].from === 0 && fr.guides[0].to === 600, 'the page’s middle, its guide the page’s height');
  const merged = SNAP.snapMove(B(101, 300, 40, 20), [B(100, 100, 50, 50), B(100, 500, 50, 50)], 6);
  ok(merged.guides.filter((g) => g.axis === 'x').length === 1 && close(merged.guides[0].from, 100) && close(merged.guides[0].to, 550), 'lines on one place are one guide, across them all');
}

// ---- equal gaps ----------------------------------------------------------------------------------------------------
{
  const row = [B(0, 0, 50, 50), B(200, 0, 50, 50)];
  const e = SNAP.snapEqual(B(98, 0, 50, 50), row, 6, 0, 0, false, false);
  ok(close(e.dx, 2) && e.gaps.length === 2 && e.gaps.every((g) => close(g.value, 50)), `between two: the same gap each side (${e.dx}, ${e.gaps.map((g) => g.value)})`);
  const same = SNAP.snapEqual(B(142, 0, 50, 50), [B(0, 0, 50, 50), B(70, 0, 50, 50)], 6, 0, 0, false, false);
  ok(close(same.dx, -2) && same.gaps.length === 2 && same.gaps.every((g) => close(g.value, 20)), `the gap of the last two kept (${same.dx}, ${same.gaps.map((g) => g.value)})`);
  const col = SNAP.snapEqual(B(0, 96, 50, 50), [B(0, 0, 50, 50), B(0, 200, 50, 50)], 6, 0, 0, false, false);
  ok(close(col.dy, 4) && col.gaps.length === 2 && col.gaps.every((g) => g.vertical && close(g.value, 50)), `in a column too (${col.dy})`);
  const skipped = SNAP.snapEqual(B(98, 0, 50, 50), row, 6, 0, 0, true, true);
  ok(skipped.gaps.length === 0 && skipped.dx === 0, 'an axis already snapped to a line is left alone');
  const out = SNAP.snapEqual(B(98, 300, 50, 50), row, 6, 0, 0, false, false);
  ok(out.gaps.length === 0, 'not in their row: no gap');
}

// ---- distances -----------------------------------------------------------------------------------------------------
{
  const f = B(100, 100, 50, 50);
  const g = SNAP.neighbourGaps(f, [B(10, 110, 40, 30), B(200, 90, 40, 70), B(120, 10, 20, 30), B(300, 300, 10, 10)]);
  ok(g.length === 3, `a gap to the nearest part on three sides, the far one left out (${g.length})`);
  const left = g.find((x) => !x.vertical && x.x < 100);
  ok(left && close(left.value, 50) && close(left.x, 50), 'left: 50, from the part’s right edge');
  const right = g.find((x) => !x.vertical && x.x >= 150);
  ok(right && close(right.value, 50), 'right: 50');
  const top = g.find((x) => x.vertical);
  ok(top && close(top.value, 60) && close(top.y, 40), 'above: 60');
  ok(SNAP.neighbourGaps(f, [B(0, 100, 100, 50)]).length === 0, 'touching: no gap to show');
  const edge = SNAP.neighbourGaps(B(100, 100, 50, 50), [], { w: 400, h: 300 });
  ok(edge.length === 4 && edge.some((x) => close(x.value, 100) && !x.vertical && x.x === 0) && edge.some((x) => close(x.value, 150) && x.vertical && close(x.y, 150)), 'with a page: the distance to its edges where no part is');
  const nearer = SNAP.neighbourGaps(f, [B(0, 100, 20, 50), B(60, 100, 30, 50)]);
  ok(nearer.find((x) => !x.vertical && x.x < 100 && close(x.value, 10)), 'the nearest of two on a side');
}

// ---- sizing --------------------------------------------------------------------------------------------------------
{
  const from = B(100, 100, 100, 60);
  const right = { l: false, r: true, t: false, b: false };
  const others = [B(300, 50, 80, 200), B(100, 400, 130, 40)];
  const a = SNAP.snapResize({ box: B(100, 100, 197, 60), from, edges: right, others, tol: 6 });
  ok(close(a.box.x + a.box.w, 300) && close(a.box.x, 100), `a right edge drawn to another’s left (${a.box.x + a.box.w})`);
  ok(a.guides.length === 1 && a.guides[0].axis === 'x' && close(a.guides[0].at, 300) && close(a.guides[0].from, 50) && close(a.guides[0].to, 250), 'its guide from the box to the part, as it ended');
  const w = SNAP.snapResize({ box: B(100, 100, 127, 60), from, edges: right, others, tol: 6 });
  ok(close(w.box.w, 130) && w.sameW.length === 1 && w.sameW[0].y === 400, `as wide as another part: ${w.box.w}, marked`);
  const lo = SNAP.snapResize({ box: B(100, 100, 100, 60), from, edges: { l: true, r: false, t: false, b: false }, others, tol: 6 });
  ok(close(lo.box.x, 100) && close(lo.box.w, 100), 'a left edge, nothing near: unchanged');
  const left = SNAP.snapResize({ box: B(297, 100, 86, 60), from: B(250, 100, 133, 60), edges: { l: true, r: false, t: false, b: false }, others: [B(300, 0, 10, 10)], tol: 6 });
  ok(close(left.box.x, 300) && close(left.box.x + left.box.w, 383), 'a left edge moves, the right stays');
  const mid = SNAP.snapResize({ box: B(100, 100, 47, 60), from, edges: right, others: [B(140, 300, 10, 2)], tol: 6 });
  ok(close(mid.box.x + mid.box.w, 145), 'an edge snaps to another’s middle');
  const grid = SNAP.snapResize({ box: B(100, 100, 123, 66), from, edges: { l: false, r: true, t: false, b: true }, others: [], tol: 6, grid: 10 });
  ok(close(grid.box.w, 120) && close(grid.box.h, 70), `no part near: its edges go to the grid (${grid.box.w} × ${grid.box.h})`);
  const nearPart = SNAP.snapResize({ box: B(100, 100, 197, 60), from, edges: right, others: [B(300, 0, 10, 10)], tol: 6, grid: 10 });
  ok(close(grid.box.x, 100) && close(nearPart.box.x + nearPart.box.w, 300), 'a part wins over the grid on its axis');
  const tiny = SNAP.snapResize({ box: B(100, 100, -20, 60), from, edges: right, others: [], tol: 6, min: 8 });
  ok(close(tiny.box.w, 8), 'never smaller than the least');
  // Shape kept (Shift, a picture’s corner).
  const f2 = B(100, 100, 100, 50);
  const se = { l: false, r: true, t: false, b: true };
  const k1 = SNAP.snapResize({ box: B(100, 100, 197, 60), from: f2, edges: se, others: [B(300, 0, 20, 20)], tol: 6, ratio: true });
  ok(close(k1.box.w, 200) && close(k1.box.h, 100), `wider than taller, it follows the width: the edge snaps to 300, the height from it (${k1.box.w} × ${k1.box.h})`);
  const k2 = SNAP.snapResize({ box: B(100, 100, 101, 148), from: f2, edges: se, others: [B(0, 250, 20, 20)], tol: 6, ratio: true });
  ok(close(k2.box.h, 150) && close(k2.box.w, 300), `moved most down, it follows the height: bottom to 250, the width from it (${k2.box.w} × ${k2.box.h})`);
  const nw = SNAP.snapResize({ box: B(60, 80, 140, 70), from: f2, edges: { l: true, r: false, t: true, b: false }, others: [], tol: 6, ratio: true });
  ok(close(nw.box.x + nw.box.w, 200) && close(nw.box.y + nw.box.h, 150) && close(nw.box.w / nw.box.h, 2), 'from the top left the bottom right stays, the shape too');
  const side = SNAP.snapResize({ box: B(100, 100, 150, 50), from: f2, edges: right, others: [], tol: 0, ratio: true });
  ok(close(side.box.w, 150) && close(side.box.h, 75) && close(side.box.y, 87.5), 'a side with the shape kept: the other way grows about its middle');
  const noSnap = SNAP.snapResize({ box: B(100, 100, 197, 60), from: f2, edges: se, others: [], tol: 0, ratio: true });
  ok(close(noSnap.box.w, 197) && close(noSnap.box.h, 98.5) && noSnap.guides.length === 0, 'with no snapping the shape is still kept');
  const grid2 = SNAP.snapResize({ box: B(100, 100, 123, 62), from: f2, edges: se, others: [], tol: 6, grid: 10, ratio: true });
  ok(close(grid2.box.w / grid2.box.h, 2) && close(grid2.box.w, 120), `the grid on the edge that leads, the shape kept (${grid2.box.w} × ${grid2.box.h})`);
}

// ---- inside a design's frame ---------------------------------------------------------------------------------------
{
  const sent = new Function(`return (${snapKit.toString()})()`)() as ReturnType<typeof snapKit>;
  const r = sent.snapResize({ box: B(100, 100, 197, 60), from: B(100, 100, 100, 60), edges: { l: false, r: true, t: false, b: false }, others: [B(300, 50, 80, 200)], tol: 6 });
  ok(close(r.box.x + r.box.w, 300), 'the function runs as text, alone, as the design’s frame runs it');
  ok(!/\bimport\b|\brequire\b/.test(snapKit.toString()), 'and uses nothing but its own');
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
