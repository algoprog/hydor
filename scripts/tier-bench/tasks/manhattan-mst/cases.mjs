// The cases of the checker for manhattan-mst: each is a name, a size class and a function that builds its points
// (integer [x, y] from 0 to 1,000,000) from a seeded generator, so a case is the same on every run. Shared by check.mjs
// and gen-expected.mjs, which finds the smallest totals of the large cases once and stores them in expected.json.

export const MAX = 1000000;

// A small seeded PRNG (mulberry32).
export function prng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  const gauss = () => Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next());
  return { next, int, gauss, chance: (p) => next() < p };
}

const clamp = (v) => Math.min(MAX, Math.max(0, Math.round(v)));
const P = (x, y) => [clamp(x), clamp(y)];

// n points spread evenly over a square of the given side with its corner at (x0, y0).
const box = (r, n, x0, y0, side) => Array.from({ length: n }, () => P(x0 + r.int(0, side), y0 + r.int(0, side)));
// n points in a round-ish blob (a normal spread) around a centre.
const blob = (r, n, cx, cy, sigma) => Array.from({ length: n }, () => P(cx + r.gauss() * sigma, cy + r.gauss() * sigma));
// n points along the segment from (x0, y0) to (x1, y1), at random places on it.
const along = (r, n, x0, y0, x1, y1) =>
  Array.from({ length: n }, () => {
    const t = r.next();
    return P(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
  });
// Every point repeated: `places` distinct places each made `copies` times.
const repeated = (places, copies) => places.flatMap((p) => Array.from({ length: copies }, () => [p[0], p[1]]));
// The points in a random order, as a list would come.
function shuffled(r, points) {
  const a = points.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = r.int(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// A random place anywhere.
const anywhere = (r) => P(r.int(0, MAX), r.int(0, MAX));

// ---------- small cases (up to 3,000 points): the smallest total comes from Prim's algorithm in the checker ----------

export const small = [];
const S = (name, build) => small.push({ name, build });

S('no sensors', () => []);
S('one sensor', () => [[500, 500]]);
S('two sensors far apart', () => [[0, 0], [MAX, MAX]]);
S('two sensors in the same place', () => [[42, 42], [42, 42]]);
S('three sensors in a row, listed out of order', () => [[7, 3], [100, 3], [50, 3]]);
S('the four corners of the whole area and the middle', () => [[0, 0], [MAX, MAX], [0, MAX], [MAX, 0], [500000, 500000]]);
S('500 sensors all in one place', () => repeated([[123456, 654321]], 500));
S('the corners of a square', () => [[0, 0], [0, 5], [5, 5], [5, 0]]);

S('random, 10 sensors', () => box(prng(1), 10, 0, 0, MAX));
S('random, 100 sensors', () => box(prng(2), 100, 0, 0, MAX));
S('random, 1,000 sensors', () => box(prng(3), 1000, 0, 0, MAX));
S('random, 3,000 sensors', () => box(prng(4), 3000, 0, 0, MAX));
S('random, 2,000 sensors in a 40 by 40 square, many in the same place', () => box(prng(5), 2000, 0, 0, 40));
S('random, 2,000 sensors in a 1,000 by 1,000 square', () => box(prng(6), 2000, 0, 0, 1000));
S('random, 1,500 sensors in a strip four wide', () => { const r = prng(7); return Array.from({ length: 1500 }, () => P(r.int(0, MAX), r.int(0, 3))); });

S('two dense clusters in opposite corners', () => {
  const r = prng(10);
  return shuffled(r, [...box(r, 1500, 0, 0, 50), ...box(r, 1500, MAX - 50, MAX - 50, 50)]);
});
S('two dense clusters side by side, a million apart in one direction only', () => {
  const r = prng(11);
  return shuffled(r, [...box(r, 1000, 0, 500000, 200), ...box(r, 1000, MAX - 200, 500000, 200)]);
});
S('two very tight clusters (a few places each) far apart', () => {
  const r = prng(12);
  return shuffled(r, [...box(r, 1200, 100, 100, 5), ...box(r, 1200, 900000, 700000, 5)]);
});
S('three clusters of different sizes and spreads', () => {
  const r = prng(13);
  return shuffled(r, [...blob(r, 2000, 200000, 200000, 300), ...blob(r, 500, 800000, 300000, 3000), ...box(r, 5, 500000, 900000, 100)]);
});
S('eight small clusters spread over the area', () => {
  const r = prng(14);
  const centres = Array.from({ length: 8 }, () => anywhere(r));
  return shuffled(r, centres.flatMap(([cx, cy]) => blob(r, 200, cx, cy, 20)));
});
S('twelve clusters of 100 on a coarse grid of centres', () => {
  const r = prng(15);
  const points = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) points.push(...blob(r, 100, 100000 + i * 250000, 100000 + j * 350000, 400));
  return shuffled(r, points);
});
S('a dense cluster, a sparse background and five far outliers', () => {
  const r = prng(16);
  return shuffled(r, [...blob(r, 1800, 500000, 500000, 80), ...box(r, 100, 0, 0, MAX), ...[[0, 0], [MAX, 0], [0, MAX], [MAX, MAX], [999000, 1000]]]);
});
S('five places with 400 sensors each', () => {
  const r = prng(17);
  return shuffled(r, repeated(Array.from({ length: 5 }, () => anywhere(r)), 400));
});
S('thirty places with 60 sensors each, some of them side by side', () => {
  const r = prng(18);
  const places = Array.from({ length: 15 }, () => anywhere(r));
  return shuffled(r, repeated([...places, ...places.map(([x, y]) => P(x + 1, y))], 60));
});
S('200 places with 1 to 15 sensors each', () => {
  const r = prng(19);
  return shuffled(r, Array.from({ length: 200 }, () => repeated([anywhere(r)], r.int(1, 15))).flat());
});

S('three long horizontal lines', () => {
  const r = prng(20);
  return shuffled(r, [...along(r, 700, 0, 100000, MAX, 100000), ...along(r, 700, 0, 500000, MAX, 500000), ...along(r, 700, 0, 900000, MAX, 900000)]);
});
S('three long vertical lines', () => {
  const r = prng(21);
  return shuffled(r, [...along(r, 700, 150000, 0, 150000, MAX), ...along(r, 700, 600000, 0, 600000, MAX), ...along(r, 700, 650000, 0, 650000, MAX)]);
});
S('two diagonal lines crossing', () => {
  const r = prng(22);
  return shuffled(r, [...along(r, 1000, 0, 0, MAX, MAX), ...along(r, 1000, 0, MAX, MAX, 0)]);
});
S('parallel diagonal lines a million apart in total', () => {
  const r = prng(23);
  return shuffled(r, [...along(r, 800, 0, 0, 400000, 400000), ...along(r, 800, 600000, 0, MAX, 400000), ...along(r, 800, 300000, 600000, 700000, MAX)]);
});
S('horizontal, vertical and diagonal lines mixed', () => {
  const r = prng(24);
  return shuffled(r, [...along(r, 400, 0, 250000, MAX, 250000), ...along(r, 400, 750000, 0, 750000, MAX), ...along(r, 400, 0, 0, MAX, MAX), ...along(r, 400, 100000, MAX, 700000, 400000)]);
});
S('a cross through the middle', () => {
  const r = prng(25);
  return shuffled(r, [...along(r, 1000, 0, 500000, MAX, 500000), ...along(r, 1000, 500000, 0, 500000, MAX)]);
});
S('two dense lines a million apart', () => [
  ...Array.from({ length: 1000 }, (_, i) => [i, 0]),
  ...Array.from({ length: 1000 }, (_, i) => [i, MAX]),
]);
S('two dense parallel lines side by side with a gap of 50,000 along them', () => [
  ...Array.from({ length: 800 }, (_, i) => [i, 10]),
  ...Array.from({ length: 800 }, (_, i) => [i + 50000, 10 + (i % 2)]),
]);
S('the edge of a diamond (a ring in this distance)', () => {
  const r = prng(26);
  const R = 400000;
  const c = 500000;
  const points = [];
  for (let i = 0; i < 2000; i++) {
    const t = r.int(0, R);
    const side = i % 4;
    points.push(side === 0 ? [c + t, c + R - t] : side === 1 ? [c + R - t, c - t] : side === 2 ? [c - t, c - R + t] : [c - R + t, c + t]);
  }
  return shuffled(r, points);
});
S('the edge of a square', () => {
  const r = prng(27);
  return shuffled(r, [...along(r, 500, 100000, 100000, 900000, 100000), ...along(r, 500, 900000, 100000, 900000, 900000), ...along(r, 500, 900000, 900000, 100000, 900000), ...along(r, 500, 100000, 900000, 100000, 100000)]);
});
S('a round ring, plus a few sensors in its middle', () => {
  const r = prng(28);
  const ring = Array.from({ length: 1500 }, () => {
    const a = r.next() * 2 * Math.PI;
    return P(500000 + 400000 * Math.cos(a), 500000 + 400000 * Math.sin(a));
  });
  return shuffled(r, [...ring, ...box(r, 10, 495000, 495000, 10000)]);
});
S('2,000 sensors on one horizontal line', () => shuffled(prng(29), along(prng(29), 2000, 0, 321, MAX, 321)));
S('2,000 sensors on one vertical line', () => shuffled(prng(30), along(prng(30), 2000, 777, 0, 777, MAX)));
S('2,000 sensors on one diagonal line', () => shuffled(prng(31), along(prng(31), 2000, 0, 0, MAX, MAX)));
S('2,000 sensors on one anti-diagonal line, some in the same place', () => shuffled(prng(32), along(prng(32), 2000, MAX, 0, 0, MAX).map(([x, y]) => [Math.round(x / 50) * 50, MAX - Math.round(x / 50) * 50])));

S('a 40 by 40 grid, spacing 1,000: many equal distances', () => {
  const points = [];
  for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) points.push([i * 1000, j * 1000]);
  return shuffled(prng(33), points);
});
S('a 50 by 50 grid with spacing 1', () => {
  const points = [];
  for (let i = 0; i < 50; i++) for (let j = 0; j < 50; j++) points.push([i, j]);
  return shuffled(prng(34), points);
});
S('a grid with spacing 1 one way and 1,000 the other', () => {
  const points = [];
  for (let i = 0; i < 60; i++) for (let j = 0; j < 30; j++) points.push([i, j * 1000]);
  return shuffled(prng(35), points);
});
S('a grid with every point twice', () => {
  const points = [];
  for (let i = 0; i < 30; i++) for (let j = 0; j < 30; j++) points.push([i * 7, j * 7], [i * 7, j * 7]);
  return shuffled(prng(36), points);
});
S('a staircase of points a little off the diagonal', () => shuffled(prng(37), Array.from({ length: 2000 }, (_, i) => [i * 10, i * 10 + (i % 2)])));

S('coordinates that are powers of two, in a grid', () => {
  const points = [];
  for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) points.push([2 ** i, 2 ** j]);
  return shuffled(prng(38), points);
});
S('powers of two across, random up', () => {
  const r = prng(39);
  return Array.from({ length: 1500 }, () => [2 ** r.int(0, 19), r.int(0, MAX)]);
});
S('points on a curve whose gaps double', () => Array.from({ length: 20 }, (_, i) => [2 ** i - 1, 2 ** (19 - i)]).flatMap((p) => [p, [p[0] + 1, p[1]], [p[0], p[1] + 3]]));
S('dense near a corner, thinning out geometrically', () => {
  const r = prng(40);
  return Array.from({ length: 3000 }, () => P(MAX * r.next() ** 6, MAX * r.next() ** 6));
});

S('five clusters of 200 joined by a sparse chain of single sensors', () => {
  const r = prng(41);
  const centres = [[100000, 100000], [350000, 150000], [550000, 600000], [800000, 500000], [900000, 900000]];
  const points = centres.flatMap(([cx, cy]) => blob(r, 200, cx, cy, 30));
  for (let k = 0; k + 1 < centres.length; k++) points.push(...along(r, 6, centres[k][0], centres[k][1], centres[k + 1][0], centres[k + 1][1]));
  return shuffled(r, points);
});
S('ten clusters in a zigzag, a chain between them', () => {
  const r = prng(42);
  const centres = Array.from({ length: 10 }, (_, i) => [50000 + i * 95000, i % 2 ? 800000 : 200000]);
  const points = centres.flatMap(([cx, cy]) => box(r, 100, cx, cy, 40));
  for (let k = 0; k + 1 < centres.length; k++) points.push(...along(r, 8, centres[k][0], centres[k][1], centres[k + 1][0], centres[k + 1][1]));
  return shuffled(r, points);
});
S('a spiral of single sensors with growing gaps, and a cluster in the middle', () => {
  const r = prng(43);
  const points = blob(r, 300, 500000, 500000, 15);
  for (let k = 1; k < 400; k++) {
    const a = k * 0.25;
    const rad = 200 * 1.02 ** k;
    points.push(P(500000 + rad * Math.cos(a), 500000 + rad * Math.sin(a)));
  }
  return shuffled(r, points);
});
S('clusters that sit on long lines', () => {
  const r = prng(44);
  const points = [...along(r, 300, 0, 400000, MAX, 400000), ...along(r, 300, 200000, 0, 200000, MAX)];
  for (const [cx, cy] of [[100000, 400000], [900000, 400000], [200000, 100000], [200000, 900000]]) points.push(...blob(r, 300, cx, cy, 25));
  return shuffled(r, points);
});
S('clusters, lines and dust together, 3,000 sensors', () => {
  const r = prng(45);
  const points = [];
  for (let k = 0; k < 6; k++) points.push(...blob(r, 250, ...anywhere(r), 10 + 300 * k));
  for (let k = 0; k < 4; k++) points.push(...along(r, 250, ...anywhere(r), ...anywhere(r)));
  points.push(...box(r, 500, 0, 0, MAX));
  return shuffled(r, points);
});
S('clusters, lines and dust together, another 3,000 sensors', () => {
  const r = prng(46);
  const points = [];
  for (let k = 0; k < 10; k++) points.push(...blob(r, 150, ...anywhere(r), 5 + 80 * k));
  for (let k = 0; k < 6; k++) {
    const [x, y] = anywhere(r);
    points.push(...along(r, 200, x, y, x, r.int(0, MAX)), ...along(r, 100, x, y, r.int(0, MAX), y));
  }
  return shuffled(r, points);
});
S('2,500 random sensors, sorted by x as a list might come', () => box(prng(47), 2500, 0, 0, MAX).sort((a, b) => a[0] - b[0] || a[1] - b[1]));
S('3,000 random sensors, sorted by y, largest first', () => box(prng(48), 3000, 0, 0, MAX).sort((a, b) => b[1] - a[1] || b[0] - a[0]));

// ---------- large cases (20,000 to 200,000 points): the smallest totals are stored in expected.json ----------

export const large = [];
const L = (name, n, build) => large.push({ name, n, build });

L('20,000 random sensors', 20000, () => box(prng(100), 20000, 0, 0, MAX));
L('50,000 random sensors', 50000, () => box(prng(101), 50000, 0, 0, MAX));
L('20,000 sensors in 40 clusters of different sizes and spreads', 20000, () => {
  const r = prng(102);
  const points = [];
  for (let k = 0; k < 40; k++) points.push(...blob(r, 100 + 80 * (k % 10), ...anywhere(r), 5 + 400 * (k % 7)));
  points.push(...box(r, 20000 - points.length, 0, 0, MAX));
  return shuffled(r, points);
});
L('50,000 sensors: clusters, long lines and dust', 50000, () => {
  const r = prng(103);
  const points = [];
  for (let k = 0; k < 12; k++) points.push(...blob(r, 1500, ...anywhere(r), 10 + 150 * k));
  for (let k = 0; k < 10; k++) points.push(...along(r, 1500, ...anywhere(r), ...anywhere(r)));
  for (let k = 0; k < 4; k++) {
    const [x, y] = anywhere(r);
    points.push(...along(r, 1500, x, y, x, r.int(0, MAX)), ...along(r, 1500, x, y, r.int(0, MAX), y));
  }
  while (points.length < 50000) points.push(anywhere(r));
  return shuffled(r, points);
});

L('200,000 random sensors', 200000, () => box(prng(200), 200000, 0, 0, MAX));
L('200,000 sensors in 12 clusters from 100 to 40,800 sensors', 200000, () => {
  const r = prng(201);
  const sizes = [100, 300, 800, 2000, 5000, 9000, 14000, 20000, 30000, 38000, 40000, 40800];
  return shuffled(r, sizes.flatMap((size, k) => blob(r, size, ...anywhere(r), 10 + 1700 * k)));
});
L('200,000 sensors on 30 long lines, horizontal, vertical and diagonal', 200000, () => {
  const r = prng(202);
  const points = [];
  for (let k = 0; k < 30; k++) {
    const [x, y] = anywhere(r);
    const kind = k % 3;
    points.push(...(kind === 0 ? along(r, 6666, 0, y, MAX, y) : kind === 1 ? along(r, 6666, x, 0, x, MAX) : along(r, 6666, 0, y, MAX, MAX - y)));
  }
  while (points.length < 200000) points.push(...along(r, 1, 0, 0, MAX, MAX));
  return shuffled(r, points);
});
L('200,000 sensors: clusters, long lines and a sparse background', 200000, () => {
  const r = prng(203);
  const points = [];
  for (let k = 0; k < 20; k++) points.push(...blob(r, 4000, ...anywhere(r), 5 + 120 * k));
  for (let k = 0; k < 12; k++) points.push(...along(r, 4000, ...anywhere(r), ...anywhere(r)));
  for (let k = 0; k < 6; k++) {
    const [x, y] = anywhere(r);
    points.push(...along(r, 3000, x, y, x, r.int(0, MAX)), ...along(r, 2000, x, y, r.int(0, MAX), y));
  }
  points.push(...box(r, 200000 - points.length, 0, 0, MAX));
  return shuffled(r, points);
});
L('200,000 sensors at 5,000 places, 40 at each', 200000, () => {
  const r = prng(204);
  return shuffled(r, repeated(Array.from({ length: 5000 }, () => anywhere(r)), 40));
});
L('200,000 sensors on a 447 by 447 grid, spacing 2,000', 200000, () => {
  const r = prng(205);
  const points = [];
  for (let i = 0; i < 447; i++) for (let j = 0; j < 447; j++) points.push([i * 2000, j * 2000]);
  while (points.length < 200000) points.push([r.int(0, 446) * 2000, r.int(0, 446) * 2000]);
  return shuffled(r, points.slice(0, 200000));
});
L('200,000 sensors in a 1,000 by 1,000 square, many in the same place', 200000, () => box(prng(206), 200000, 400000, 400000, 999));
L('200,000 sensors in two tight clusters at opposite corners', 200000, () => {
  const r = prng(207);
  return shuffled(r, [...box(r, 100000, 0, 0, 300), ...box(r, 100000, MAX - 300, MAX - 300, 300)]);
});
L('200,000 sensors on one diagonal, many in the same place', 200000, () => {
  const r = prng(208);
  return shuffled(r, Array.from({ length: 200000 }, () => { const t = r.int(0, 100000) * 10; return [t, t]; }));
});
L('200,000 sensors, dense near a corner, thinning out geometrically', 200000, () => {
  const r = prng(209);
  return Array.from({ length: 200000 }, () => P(MAX * r.next() ** 5, MAX * r.next() ** 5));
});
L('200,000 sensors on a diamond, a cross and a square, with dust', 200000, () => {
  const r = prng(210);
  const points = [];
  const c = 500000;
  const R = 450000;
  for (let i = 0; i < 40000; i++) {
    const t = r.int(0, R);
    const side = i % 4;
    points.push(side === 0 ? [c + t, c + R - t] : side === 1 ? [c + R - t, c - t] : side === 2 ? [c - t, c - R + t] : [c - R + t, c + t]);
  }
  points.push(...along(r, 40000, 0, c, MAX, c), ...along(r, 40000, c, 0, c, MAX));
  points.push(...along(r, 20000, 50000, 50000, 950000, 50000), ...along(r, 20000, 950000, 50000, 950000, 950000));
  points.push(...box(r, 200000 - points.length, 0, 0, MAX));
  return shuffled(r, points);
});
