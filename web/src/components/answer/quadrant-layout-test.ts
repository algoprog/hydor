// Script test for the quadrant chart's layout (quadrant-layout.ts): dots pushed apart, the quadrants' names in their cells, names wrapped, and each point's name placed or refused.
// Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/components/answer/quadrant-layout-test.ts && node dist/dev/quadrant-layout-test.js
import assert from 'node:assert/strict';
import { dotsAndCorners, overlaps, placeCorners, placeLabels, quadrantOf, spread, wrapName, type Box } from './quadrant-layout';

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

const width = (s: string) => s.length * 6.4;
const place = (list: [string, number, number][], plot: Box) => list.map(([name, x, y]) => ({ name, px: plot.x0 + (x / 100) * (plot.x1 - plot.x0), py: plot.y1 - (y / 100) * (plot.y1 - plot.y0) }));

test('twelve long names on a phone-sized plot: the labels are refused (the points get numbers)', () => {
  const plot = { x0: 24, x1: 322, y0: 4, y1: 244 };
  const pts = place(
    [
      ['Let Max keep searching', 20, 92],
      ['Follow named leads, answer instead of abstaining', 42, 78],
      ["Fix GLM-5.3's empty answers", 10, 58],
      ['Filter junk from live results', 28, 66],
      ['Rank Web Index hits above live hits', 34, 60],
      ['Query-matched snippets for index hits', 44, 50],
      ['Make site:, quotes and filetype work', 48, 38],
      ['Context filter guards', 18, 44],
      ['Citation-following tool for related work', 72, 58],
      ['Topic split for related work', 55, 48],
      ['Check arXiv IDs against the evidence', 12, 24],
      ['Keep DuckDuckGo and Brave working under load', 66, 32],
    ],
    plot,
  );
  const wrapped = pts.map((p) => wrapName(p.name, 125, width));
  if (wrapped.some((l) => l === null)) return;
  const dots = spread(pts.map((p) => ({ x: p.px, y: p.py })), 6, plot);
  const items = dots.map((d, i) => ({ x: d.x, y: d.y, lines: wrapped[i]!, w: Math.max(...wrapped[i]!.map(width)) + 4 }));
  assert.equal(placeLabels(items, 6, plot, []), null);
});

test('the eight points of the spec example fit beside their dots on a desktop plot, clear of everything', () => {
  const plot = { x0: 24, x1: 724, y0: 4, y1: 424 };
  const pts = place(
    [
      ['Saved carts', 22, 80],
      ['One-click reorder', 36, 68],
      ['Gift cards', 30, 42],
      ['Dark mode', 14, 16],
      ['Loyalty points', 64, 72],
      ['Mobile app', 88, 58],
      ['New checkout', 80, 30],
      ['Live chat', 58, 22],
    ],
    plot,
  );
  const dots = spread(pts.map((p) => ({ x: p.px, y: p.py })), 6, plot);
  const corners = placeCorners(['Quick wins', 'Big bets', 'Fill-ins', 'Money pits'], dots, 6, plot, width);
  const cornerBoxes = corners.map((c) => c!.box);
  const items = dots.map((d, i) => ({ x: d.x, y: d.y, lines: [pts[i].name], w: width(pts[i].name) + 4 }));
  const placed = placeLabels(items, 6, plot, cornerBoxes);
  assert.ok(placed);
  placed.forEach((p, i) => {
    assert.ok(p, `label ${i} placed`);
    const b = p.box;
    assert.ok(b.x0 >= plot.x0 + 3 && b.x1 <= plot.x1 - 3 && b.y0 >= plot.y0 + 3 && b.y1 <= plot.y1 - 3, `label ${i} inside the plot`);
    placed.forEach((q, j) => j !== i && assert.ok(!overlaps(b, q!.box), `labels ${i} and ${j} apart`));
    dots.forEach((d, j) => assert.ok(!overlaps(b, { x0: d.x - 8, x1: d.x + 8, y0: d.y - 8, y1: d.y + 8 }), `label ${i} clear of dot ${j}`));
    cornerBoxes.forEach((c, j) => assert.ok(!overlaps(b, c), `label ${i} clear of corner ${j}`));
  });
});

test('spread: coincident points end 2r+2 apart inside the plot; separated ones stay put', () => {
  const plot = { x0: 24, x1: 322, y0: 4, y1: 244 };
  const [a, b] = spread([{ x: 100, y: 100 }, { x: 100, y: 100 }], 6, plot);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 14 - 0.5);
  for (const p of [a, b]) assert.ok(p.x >= plot.x0 + 7 && p.x <= plot.x1 - 7 && p.y >= plot.y0 + 7 && p.y <= plot.y1 - 7);
  const apart = [{ x: 50, y: 50 }, { x: 120, y: 50 }, { x: 200, y: 180 }];
  const input = JSON.parse(JSON.stringify(apart));
  assert.deepEqual(spread(apart, 6, plot), apart);
  assert.deepEqual(apart, input);
  const corner = spread([{ x: 24, y: 4 }, { x: 24, y: 4 }], 6, plot);
  assert.ok(Math.hypot(corner[0].x - corner[1].x, corner[0].y - corner[1].y) >= 14 - 0.5);
});

test('placeCorners: a dot on the top-left corner moves the first name away; with no dots every name takes its outer corner', () => {
  const plot = { x0: 24, x1: 724, y0: 4, y1: 424 };
  const names = ['Quick wins', 'Big bets', 'Fill-ins', 'Money pits'];
  const dot = { x: 24 + 8 + 20, y: 4 + 15 - 4 };
  const c = placeCorners(names, [dot], 6, plot, width)[0]!;
  assert.ok(!(c.x === 32 && c.y === 19));
  // Clear of the dot by the 2px placeCorners keeps around each one (r 6).
  assert.ok(!overlaps(c.box, { x0: dot.x - 8, x1: dot.x + 8, y0: dot.y - 8, y1: dot.y + 8 }));
  assert.equal(c.y, 19);
  const free = placeCorners(names, [], 6, plot, width);
  assert.deepEqual(free.map((k) => [k!.x, k!.y, k!.anchor]), [[32, 19, 'start'], [716, 19, 'end'], [32, 415, 'start'], [716, 415, 'end']]);
  assert.deepEqual(placeCorners(['', 'B', '', ''], [], 6, plot, width).map((k) => k !== null), [false, true, false, false]);
  assert.deepEqual([quadrantOf(10, 90), quadrantOf(50, 50), quadrantOf(10, 10), quadrantOf(70, 20)], [0, 1, 2, 3]);
});

test('names and dots on a crowded phone plot: no dot under a name, each name on its outer edge in its cell, dots moved little', () => {
  const plot = { x0: 24, x1: 322, y0: 4, y1: 244 };
  const pts = place(
    [
      ['a', 20, 92],
      ['b', 42, 78],
      ['c', 10, 58],
      ['d', 28, 66],
      ['e', 34, 60],
      ['f', 44, 50],
      ['g', 48, 38],
      ['h', 18, 44],
      ['i', 72, 58],
      ['j', 55, 48],
      ['k', 12, 24],
      ['l', 66, 32],
    ],
    plot,
  );
  const raw = pts.map((p) => ({ x: p.px, y: p.py }));
  // The names drawn as the chart draws them: bold capitals, about 7.5px a letter at 11px.
  const { dots, corners } = dotsAndCorners(raw, ['Quick wins', 'Big bets', 'Fill-ins', 'Later'], 9, plot, (s) => s.length * 7.5);
  const mx = (plot.x0 + plot.x1) / 2;
  corners.forEach((c, k) => {
    assert.ok(c, `name ${k} placed`);
    assert.equal(c.y, k < 2 ? 19 : 235, `name ${k} on its outer edge`);
    assert.ok(k % 2 ? c.box.x0 >= mx && c.box.x1 <= plot.x1 : c.box.x0 >= plot.x0 && c.box.x1 <= mx, `name ${k} stays in its cell`);
    for (const d of dots) assert.ok(!overlaps(c.box, { x0: d.x - 9, x1: d.x + 9, y0: d.y - 9, y1: d.y + 9 }), `name ${k} clear of the dot at ${d.x},${d.y}`);
  });
  dots.forEach((d, i) => assert.ok(Math.hypot(d.x - raw[i].x, d.y - raw[i].y) <= 16, `dot ${i} moved ${Math.hypot(d.x - raw[i].x, d.y - raw[i].y).toFixed(1)}px`));
  for (let i = 0; i < dots.length; i++) for (let j = i + 1; j < dots.length; j++) assert.ok(Math.hypot(dots[i].x - dots[j].x, dots[i].y - dots[j].y) >= 20 - 0.5, `dots ${i} and ${j} apart`);
});

test('spread keeps dots out of a name: one under it moves just clear, towards the middle; the rest stay', () => {
  const plot = { x0: 24, x1: 724, y0: 4, y1: 424 };
  const name = { x0: 32, x1: 110, y0: 9, y1: 23 };
  const [under, away] = spread([{ x: 60, y: 20 }, { x: 300, y: 200 }], 6, plot, [name]);
  assert.equal(under.x, 60);
  assert.ok(under.y - 6 >= name.y1 && under.y - 6 <= name.y1 + 2, `moved to ${under.y}`);
  assert.deepEqual(away, { x: 300, y: 200 });
  const [low] = spread([{ x: 60, y: 410 }], 6, plot, [{ x0: 32, x1: 110, y0: 405, y1: 419 }]);
  assert.ok(low.y + 6 <= 405 && low.y + 6 >= 403, `moved up to ${low.y}`);
});

test('wrapName: one line if it fits, two balanced lines if it must, null if three would be needed', () => {
  assert.deepEqual(wrapName('Gift cards', 125, width), ['Gift cards']);
  assert.deepEqual(wrapName('', 125, width), ['']);
  const two = wrapName('Citation-following tool for related work', 150, width)!;
  assert.equal(two.length, 2);
  assert.ok(two.every((l) => width(l) <= 150));
  assert.equal(two.join(' '), 'Citation-following tool for related work');
  assert.equal(wrapName('Follow named leads, answer instead of abstaining now', 100, width), null);
  assert.equal(wrapName('Supercalifragilisticexpialidocious', 100, width), null);
});

console.log(`${passed}/${total} passed`);
