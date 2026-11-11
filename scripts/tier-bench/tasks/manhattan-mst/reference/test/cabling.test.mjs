import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planCables } from '../src/cabling.mjs';

// A small seeded PRNG (mulberry32).
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dist = (p, q) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]);

// The smallest total by Prim's algorithm over every pair.
function prim(points) {
  const n = points.length;
  if (n < 2) return 0;
  const best = new Array(n).fill(Infinity);
  const done = new Array(n).fill(false);
  best[0] = 0;
  let total = 0;
  for (let step = 0; step < n; step++) {
    let v = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (v < 0 || best[i] < best[v])) v = i;
    done[v] = true;
    total += best[v];
    for (let i = 0; i < n; i++) if (!done[i]) best[i] = Math.min(best[i], dist(points[v], points[i]));
  }
  return total;
}

// Fails unless the cables join every point into one tree and their lengths add up to total.
function assertTree(points, { total, cables }) {
  const n = points.length;
  assert.equal(cables.length, Math.max(0, n - 1));
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (v) => (parent[v] === v ? v : (parent[v] = find(parent[v])));
  let sum = 0;
  for (const [i, j] of cables) {
    assert.ok(Number.isInteger(i) && Number.isInteger(j) && i >= 0 && j >= 0 && i < n && j < n);
    const a = find(i);
    const b = find(j);
    assert.notEqual(a, b, 'a cable that closes a loop');
    parent[a] = b;
    sum += dist(points[i], points[j]);
  }
  assert.equal(sum, total);
}

function check(points) {
  const result = planCables(points);
  assertTree(points, result);
  assert.equal(result.total, prim(points));
}

test('no sensors, one, and two in one place', () => {
  assert.deepEqual(planCables([]), { total: 0, cables: [] });
  assert.deepEqual(planCables([[3, 4]]), { total: 0, cables: [] });
  check([[3, 4], [3, 4]]);
});

test('the examples in the old tests', () => {
  check([[0, 0], [3, 4]]);
  check([[0, 0], [10, 0], [4, 0]]);
  check([[0, 0], [0, 5], [5, 5], [5, 0]]);
});

test('random sensors, from tens to hundreds', () => {
  const r = prng(1);
  for (let round = 0; round < 60; round++) {
    const n = 2 + Math.floor(r() * 120);
    const size = [5, 30, 1000, 1000000][round % 4];
    check(Array.from({ length: n }, () => [Math.floor(r() * (size + 1)), Math.floor(r() * (size + 1))]));
  }
});

test('many in the same places and on a coarse grid, where distances tie', () => {
  const r = prng(2);
  for (let round = 0; round < 40; round++) {
    const n = 10 + Math.floor(r() * 100);
    const step = [1, 3, 1000][round % 3];
    const side = 2 + Math.floor(r() * 6);
    check(Array.from({ length: n }, () => [Math.floor(r() * side) * step, Math.floor(r() * side) * step]));
  }
});

test('far apart groups, long lines and a chain of groups', () => {
  const r = prng(3);
  for (let round = 0; round < 30; round++) {
    const points = [];
    const groups = 2 + Math.floor(r() * 4);
    for (let g = 0; g < groups; g++) {
      const cx = Math.floor(r() * 900000);
      const cy = Math.floor(r() * 900000);
      const spread = [3, 40, 2000][round % 3];
      const size = 5 + Math.floor(r() * 25);
      for (let k = 0; k < size; k++) points.push([cx + Math.floor(r() * spread), cy + Math.floor(r() * spread)]);
      if (round % 2 === 0) for (let k = 0; k < 4; k++) points.push([cx + k * 100000, cy + (k % 2) * 7]);
    }
    for (let k = 0; k < 15; k++) {
      const t = Math.floor(r() * 1000000);
      points.push(round % 3 === 0 ? [t, 500000] : round % 3 === 1 ? [250000, t] : [t, t]);
    }
    check(points);
  }
});

test('powers of two as coordinates', () => {
  const points = [];
  for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j += 3) points.push([2 ** i, 2 ** j]);
  check(points);
});
