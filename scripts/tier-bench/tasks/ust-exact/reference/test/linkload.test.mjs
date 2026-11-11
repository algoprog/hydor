import assert from 'node:assert/strict';
import { test } from 'node:test';
import { linkProbabilities } from '../src/linkload.mjs';

const link = (id, a, b, quality) => ({ id, a, b, quality });
const close = (actual, expected, tolerance = 1e-10) => {
  assert.equal(actual.length, expected.length);
  actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) <= tolerance, `link ${i}: ${v}, expected ${expected[i]}`));
};

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

// The exact answer by listing every set of n - 1 links that forms a tree and adding up their weights.
function byEnumeration(nodes, links) {
  const n = nodes.length;
  const at = new Map(nodes.map((id, i) => [id, i]));
  const total = new Array(links.length).fill(0);
  let all = 0;
  const chosen = [];
  const go = (from) => {
    if (chosen.length === n - 1) {
      const parent = Array.from({ length: n }, (_, i) => i);
      const root = (x) => (parent[x] === x ? x : (parent[x] = root(parent[x])));
      let weight = 1;
      for (const k of chosen) {
        const a = root(at.get(links[k].a));
        const b = root(at.get(links[k].b));
        if (a === b) return;
        parent[a] = b;
        weight *= links[k].quality;
      }
      all += weight;
      for (const k of chosen) total[k] += weight;
      return;
    }
    for (let k = from; k < links.length; k++) {
      chosen.push(k);
      go(k + 1);
      chosen.pop();
    }
  };
  go(0);
  return total.map((t) => t / all);
}

test('a triangle with equal qualities: each link is in two of the three trees', () => {
  close(linkProbabilities(['x', 'y', 'z'], [link('1', 'x', 'y', 1), link('2', 'y', 'z', 1), link('3', 'z', 'x', 1)]), [2 / 3, 2 / 3, 2 / 3]);
});

test('a triangle with qualities 1, 2 and 3', () => {
  close(linkProbabilities(['x', 'y', 'z'], [link('1', 'x', 'y', 1), link('2', 'y', 'z', 2), link('3', 'z', 'x', 3)]), [5 / 11, 8 / 11, 9 / 11]);
});

test('a path: every link is in the only tree', () => {
  close(linkProbabilities(['x', 'y', 'z'], [link('1', 'x', 'y', 4), link('2', 'y', 'z', 0.5)]), [1, 1]);
});

test('two links between the same nodes share the tree by their qualities', () => {
  close(linkProbabilities(['x', 'y'], [link('1', 'x', 'y', 1), link('2', 'y', 'x', 3)]), [0.25, 0.75]);
});

test('a link from a node to itself is in no tree', () => {
  close(linkProbabilities(['x', 'y'], [link('1', 'x', 'x', 5), link('2', 'x', 'y', 2)]), [0, 1]);
});

test('a single node, and no nodes', () => {
  close(linkProbabilities(['x'], []), []);
  close(linkProbabilities(['x'], [link('1', 'x', 'x', 2)]), [0]);
  close(linkProbabilities([], []), []);
});

test('a cycle of n links: each is in (n - 1) / n of the trees', () => {
  const nodes = Array.from({ length: 12 }, (_, i) => `n${i}`);
  const links = nodes.map((id, i) => link(`l${i}`, id, nodes[(i + 1) % 12], 3));
  close(linkProbabilities(nodes, links), links.map(() => 11 / 12));
});

test('a complete graph of n nodes with equal qualities: 2 / n', () => {
  const nodes = Array.from({ length: 9 }, (_, i) => `n${i}`);
  const links = [];
  for (let i = 0; i < 9; i++) for (let j = i + 1; j < 9; j++) links.push(link(`l${i}-${j}`, nodes[i], nodes[j], 0.7));
  close(linkProbabilities(nodes, links), links.map(() => 2 / 9));
});

test('the answer does not change when every quality is scaled', () => {
  const nodes = ['a', 'b', 'c', 'd'];
  const links = [link('1', 'a', 'b', 1.5), link('2', 'b', 'c', 2), link('3', 'c', 'd', 0.25), link('4', 'd', 'a', 4), link('5', 'a', 'c', 1)];
  const base = linkProbabilities(nodes, links);
  for (const scale of [1e-6, 1e6]) close(linkProbabilities(nodes, links.map((l) => ({ ...l, quality: l.quality * scale }))), base);
});

test('random small networks, with parallel links and links from a node to itself, against listing every tree', () => {
  const random = prng(7);
  for (let round = 0; round < 40; round++) {
    const n = 2 + Math.floor(random() * 5);
    const nodes = Array.from({ length: n }, (_, i) => `n${i}`);
    const links = [];
    for (let i = 1; i < n; i++) links.push(link(`t${i}`, nodes[i], nodes[Math.floor(random() * i)], 0.1 + random() * 10));
    const extra = Math.floor(random() * 6);
    for (let k = 0; k < extra; k++) links.push(link(`e${k}`, nodes[Math.floor(random() * n)], nodes[Math.floor(random() * n)], 0.1 + random() * 10));
    close(linkProbabilities(nodes, links), byEnumeration(nodes, links), 1e-12);
  }
});

test('the probabilities add up to n - 1 on a larger network', () => {
  const random = prng(11);
  const n = 120;
  const nodes = Array.from({ length: n }, (_, i) => `n${i}`);
  const links = [];
  for (let i = 1; i < n; i++) links.push(link(`t${i}`, nodes[i], nodes[Math.floor(random() * i)], 0.05 + random() * 20));
  for (let k = 0; k < 600; k++) links.push(link(`e${k}`, nodes[Math.floor(random() * n)], nodes[Math.floor(random() * n)], 0.05 + random() * 20));
  const p = linkProbabilities(nodes, links);
  assert.ok(Math.abs(p.reduce((s, v) => s + v, 0) - (n - 1)) < 1e-9);
  assert.ok(p.every((v) => v >= 0 && v <= 1));
});

test('a link that names a node that does not exist, or a quality that is not above 0, throws', () => {
  assert.throws(() => linkProbabilities(['x'], [link('1', 'x', 'q', 1)]), /does not exist/);
  assert.throws(() => linkProbabilities(['x', 'y'], [link('1', 'x', 'y', 0)]), /quality/);
  assert.throws(() => linkProbabilities(['x', 'y'], [link('1', 'x', 'y', -1)]), /quality/);
});

test('400 nodes and 4,000 links take well under two seconds', () => {
  const random = prng(3);
  const n = 400;
  const nodes = Array.from({ length: n }, (_, i) => `n${i}`);
  const links = [];
  for (let i = 1; i < n; i++) links.push(link(`t${i}`, nodes[i], nodes[Math.floor(random() * i)], 0.05 + random() * 20));
  while (links.length < 4000) links.push(link(`e${links.length}`, nodes[Math.floor(random() * n)], nodes[Math.floor(random() * n)], 0.05 + random() * 20));
  const start = process.cpuUsage();
  linkProbabilities(nodes, links);
  const used = process.cpuUsage(start);
  assert.ok((used.user + used.system) / 1000 < 1500);
});
