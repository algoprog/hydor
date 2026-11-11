// Script tests for what lines parts up in the slides editor (snap.ts): a part moved snaps its edges and middle to the
// slide, the other parts, the guides and the grid, and gives the lines between what it lines up with (also when it
// landed exactly), the distances to what is next to it and to the slide's edge, and the gaps as wide as others; a part
// sized snaps the edges that move, also from a corner that keeps its shape and when it is turned (by the box it shows),
// and to the width or height of another part. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/pages/slides/snap-test.ts && node dist/dev/snap-test.js
import { alignedLines, distances, placeResize, snapMove, snapResize, spacing, turned, unionOf, type Box, type SnapSet } from './snap';

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};
const close = (a: number, b: number, d = 0.01) => Math.abs(a - b) <= d;
const B = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h });
const frame = B(0, 0, 1280, 720);
const slideOnly: SnapSet = { parts: [], frame, guides: { x: [], y: [] } };

// ---- moving ----------------------------------------------------------------------------------------------------------
{
  // Near the slide's middle: it snaps there, and the line spans the whole slide.
  const r = snapMove(B(600, 100, 80, 40), slideOnly, 6);
  ok(close(r.dx, 0) && r.lines.some((l) => l.axis === 'x' && close(l.at, 640)), 'a box 600 to 680 is centred at 640 already: its line is there');
  const m = snapMove(B(603, 100, 80, 40), slideOnly, 6);
  ok(close(m.dx, -3), `snaps 3 px to centre: ${m.dx}`);
  const line = m.lines.find((l) => l.axis === 'x' && close(l.at, 640));
  ok(!!line && line.slide && close(line.from, 0) && close(line.to, 720) && line.ticks.length === 0, 'the slide’s own line spans the slide, with no ticks');
  const far = snapMove(B(500, 100, 80, 40), slideOnly, 6);
  ok(close(far.dx, 0) && !far.lines.some((l) => l.axis === 'x' && close(l.at, 640)), 'far from the middle: no snap, no line');
  // Exactly on a line: it is drawn too.
  const exact = snapMove(B(0, 0, 100, 100), slideOnly, 6);
  ok(exact.lines.some((l) => l.axis === 'x' && close(l.at, 0)) && exact.lines.some((l) => l.axis === 'y' && close(l.at, 0)), 'landed exactly on the slide’s edges: lines at 0');
}
{
  // Another part: the line runs between the two, with ticks at their ends, not across the slide.
  const other = B(100, 300, 200, 100);
  const set: SnapSet = { parts: [other], frame, guides: { x: [], y: [] } };
  const r = snapMove(B(102, 100, 60, 60), set, 6);
  ok(close(r.dx, -2), 'snaps its left to the other’s left');
  const l = r.lines.find((q) => q.axis === 'x' && close(q.at, 100));
  ok(!!l && !l.slide && close(l.from, 100) && close(l.to, 400), `the line spans both parts: ${JSON.stringify(l)}`);
  ok(!!l && [100, 160, 300, 400].every((t) => l.ticks.some((v) => close(v, t))), 'with ticks at the ends of both');
  // Distances: down to the other part, and to the slide's edges.
  const d = distances(B(100, 100, 60, 60), [other], frame);
  ok(d.some((g) => g.n === 140 && close(g.x1, 130) && close(g.y1, 160) && close(g.y2, 300)), `the gap to the part below: ${JSON.stringify(d)}`);
  ok(d.some((g) => g.n === 100 && close(g.y1, 100) === false && close(g.x2, 100)), 'to the slide’s left edge');
  ok(d.some((g) => g.n === 100 && g.y2 === 100), 'to the slide’s top edge');
  ok(d.some((g) => g.n === 1120 && close(g.x1, 160)), 'to the slide’s right edge, nothing between');
  ok(!d.some((g) => close(g.x1, 160) && close(g.y1, 160) && close(g.x2, 160)), 'no gap given where there is none');
  // A part beside it that does not face it down the slide is not a neighbour.
  const aside = distances(B(500, 100, 60, 60), [B(100, 300, 200, 100)], frame);
  ok(!aside.some((g) => g.n === 200 && g.y1 === g.y2), 'a part that does not face it is not a neighbour');
}
{
  // Held straight: the held side does not snap.
  const set: SnapSet = { parts: [B(100, 300, 200, 100)], frame, guides: { x: [], y: [] } };
  const r = snapMove(B(102, 297, 60, 60), set, 6, { free: { x: false, y: true } });
  ok(close(r.dx, 0) && close(r.dy, 3), `held x: no x snap, y snaps: ${r.dx}, ${r.dy}`);
}
{
  // The guides and the grid.
  const set: SnapSet = { parts: [], frame, guides: { x: [200], y: [] }, grid: { size: 40, ox: 0, oy: 0 } };
  const g = snapMove(B(203, 11, 50, 50), set, 6);
  ok(close(g.dx, -3) && g.lines.some((l) => l.axis === 'x' && close(l.at, 200) && l.slide), 'a guide is snapped to and drawn across the slide');
  const gr = snapMove(B(403, 83, 50, 50), { parts: [], guides: { x: [], y: [] }, grid: { size: 40, ox: 0, oy: 0 } }, 6);
  ok(close(gr.dx, -3) && close(gr.dy, -3), `the grid snaps (the box's left to 400, top to 80): ${gr.dx}, ${gr.dy}`);
  const off = snapMove(B(603, 100, 80, 40), slideOnly, 6, { on: false });
  ok(off.dx === 0 && off.dy === 0 && !off.lines.length && !off.dist.length, 'snapping off: nothing moves, nothing drawn');
}
{
  // Equal gaps between other parts.
  const row = [B(0, 100, 100, 50), B(200, 100, 100, 50)];
  const set: SnapSet = { parts: row, frame: undefined, guides: { x: [], y: [] } };
  const r = spacing(B(403, 100, 100, 50), row, 'x', 6);
  ok(!!r && close(r.d, -3) && r.marks.length === 2, `the gap of 100 repeated: ${JSON.stringify(r)}`);
  const m = snapMove(B(403, 100, 100, 50), set, 6);
  ok(close(m.dx, -3) && m.gaps.length === 2 && m.gaps.every((g) => g.n === 100), 'the move takes it and marks both gaps');
}
{
  // Aligned lines of a union of parts, joined at one place.
  const a = alignedLines(B(100, 100, 50, 50), { parts: [B(100, 300, 50, 50), B(100, 500, 20, 20)], guides: { x: [], y: [] } }, [100], []);
  ok(a.length === 1 && close(a[0].from, 100) && close(a[0].to, 520), 'two parts on one line make one line spanning all three');
  ok(close(unionOf([B(0, 0, 10, 10), B(20, 5, 10, 10)]).w, 30) && close(turned(B(0, 0, 100, 50), 90).w, 50), 'union and turned box');
}

// ---- sizing ----------------------------------------------------------------------------------------------------------
{
  const other = B(500, 300, 200, 100);
  const set: SnapSet = { parts: [other], frame, guides: { x: [], y: [] } };
  const base = B(100, 100, 100, 100);
  // The right edge near the other's left edge.
  const r = snapResize({ box: base, rot: 0, hx: 1, hy: 0, nw: 397, nh: 100, keep: false, set, tol: 6 });
  ok(r.box.w === 400 && r.box.x === 100, `the right edge snaps to 500: ${JSON.stringify(r.box)}`);
  ok(r.lines.some((l) => l.axis === 'x' && close(l.at, 500) && !l.slide), 'and its line is drawn');
  // Landing exactly: the line is still drawn.
  const e = snapResize({ box: base, rot: 0, hx: 1, hy: 0, nw: 400, nh: 100, keep: false, set, tol: 6 });
  ok(e.box.w === 400 && e.lines.some((l) => l.axis === 'x' && close(l.at, 500)), 'landed exactly: the line stays');
  // The side that does not move draws nothing.
  ok(!e.lines.some((l) => l.axis === 'x' && close(l.at, 100)), 'the fixed edge is not marked');
  // Width of another part.
  const w = snapResize({ box: base, rot: 0, hx: 1, hy: 0, nw: 197, nh: 100, keep: false, set, tol: 6 });
  ok(w.box.w === 200 && w.equal.w.length === 2, `same width as another part: ${w.box.w}, ${w.equal.w.length}`);
  // A corner that keeps its shape: the edge that moves most snaps, the other side follows.
  const k = snapResize({ box: base, rot: 0, hx: 1, hy: 1, nw: 397, nh: 397, keep: true, set, tol: 6 });
  ok(k.box.w === 400 && k.box.h === 400, `keep: the right edge snaps, the height follows: ${JSON.stringify(k.box)}`);
  const k2 = snapResize({ box: B(100, 100, 100, 50), rot: 0, hx: 1, hy: 1, nw: 300, nh: 150, keep: true, set: { parts: [B(0, 300, 50, 50)], guides: { x: [], y: [] } }, tol: 6 });
  ok(k2.box.w === 300 && k2.box.h === 150, `keep: a shape 2:1 stays so: ${JSON.stringify(k2.box)}`);
  // From the top-left corner the box's top-left moves and the bottom-right stays.
  const tl = snapResize({ box: B(300, 300, 100, 100), rot: 0, hx: -1, hy: -1, nw: 195, nh: 195, keep: true, set: { parts: [B(190, 0, 10, 10)], guides: { x: [], y: [] } }, tol: 6 });
  ok(close(tl.box.x + tl.box.w, 400) && close(tl.box.y + tl.box.h, 400) && tl.box.x === 200, `top-left corner, kept: ${JSON.stringify(tl.box)}`);
}
{
  // A turned part snaps by the box it shows: 100 × 50 turned 90° shows as 50 × 100.
  const box = B(100, 100, 100, 50);
  const set: SnapSet = { parts: [B(400, 0, 10, 10)], guides: { x: [], y: [] } };
  const place = placeResize(box, 90, 1, 0, 100, 50);
  ok(close(place.x, 100) && close(place.w, 100), 'unchanged size, unchanged box');
  const r = snapResize({ box, rot: 90, hx: 1, hy: 0, nw: 100, nh: 50, keep: false, set, tol: 6 });
  ok(r.box.w === 100, 'turned: sizes by its own width');
  // Stretching its width by handle hx=1 at 90°: its shown box grows downward (y), so y snaps.
  // Its handle drags the shown box's bottom edge down (from 175 to 272 here): it snaps to a part's top at 270.
  const y = snapResize({ box, rot: 90, hx: 1, hy: 0, nw: 197, nh: 50, keep: false, set: { parts: [B(0, 270, 10, 10)], guides: { x: [], y: [] } }, tol: 6 });
  const vis = turned(y.box, 90);
  ok(close(vis.y + vis.h, 270.5, 1) && close(vis.y, 75, 1), `turned 90°: the shown bottom edge lands on 270: ${JSON.stringify(vis)}`);
  ok(y.lines.some((l) => l.axis === 'y' && close(l.at, 270)), 'and its line is drawn');
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
