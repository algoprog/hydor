// Builds cases.json, the checker's cases: node make-cases.mjs. The small cases keep their input and get the expected
// output from brute.mjs (the definition, tried on every set of edges). The large ones are described by a seed and a list
// of tree shapes (gen.mjs builds the same input again in the checker) and keep the SHA-256 of the reference's output,
// which prove.mjs has checked against brute.mjs on thousands of small trees. Also prints the reference's CPU time on them.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brute } from './brute.mjs';
import { buildInput } from './gen.mjs';
import { solve } from './reference/src/solve.mjs';
import { prng, tree, render } from './gen.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const cases = [];

// A small case: its input is stored, its expected output comes from the brute force.
const small = (name, input) => cases.push({ name, input, expected: brute(input).trim() });
// A large case: only its spec is stored.
const large = (name, spec) => cases.push({ name, spec, sha: null });

// ---------- small ----------
const sample = fs.readFileSync(path.join(here, 'seed/PROBLEM.md'), 'utf8').match(/## Sample 1\n\nInput:\n\n```\n([\s\S]*?)```/)[1];
small('sample', sample);
small('one edge', '1\n2\n1 2\n');
small('many trees of two vertices', render(Array.from({ length: 50 }, () => [2, [[1, 2]]])));
small('every tree on 3 vertices', '2\n3\n1 2\n2 3\n3\n1 2\n1 3\n');

// Every labelled tree on n vertices where vertex i hangs on an earlier one (all shapes of that size appear), n = 5..8.
for (const n of [5, 6, 7, 8]) {
  const parent = new Array(n + 1).fill(1);
  const trees = [];
  const rec = (i) => {
    if (i > n) {
      trees.push([n, Array.from({ length: n - 1 }, (_, j) => [parent[j + 2], j + 2])]);
      return;
    }
    for (let p = 1; p < i; p++) {
      parent[i] = p;
      rec(i + 1);
    }
  };
  rec(2);
  small(`every recursive tree on ${n} vertices`, render(trees));
}

// Small trees of each shape, on vertices numbered at random, several per input.
const smallShapes = [
  ['paths of 2 to 14 vertices', 'path', {}],
  ['stars of 2 to 14 vertices', 'star', {}],
  ['random trees of 8 to 16 vertices', 'random', {}],
  ['thin deep trees of 8 to 16 vertices', 'deep', { window: 3 }],
  ['trees with a few big hubs', 'hubs', {}],
  ['caterpillars with 2 leaves per spine vertex', 'caterpillar', { legs: 2 }],
  ['caterpillars with 4 leaves per spine vertex', 'caterpillar', { legs: 4 }],
  ['complete binary trees', 'kary', { k: 2 }],
  ['complete ternary trees', 'kary', { k: 3 }],
  ['binomial trees of 8 and 16 vertices with extra leaves', 'binomial', { k: 3 }],
  ['binomial tree of 16 vertices with extra leaves on its root', 'binomial', { k: 4, onRoot: true }],
  ['a hub with a binomial tree and leaves', 'hubBig', { k: 3 }],
  ['a hub with binomial trees of every size', 'hubBinomials', { kmax: 3 }],
  ['a path of binomial trees', 'spineBinomials', { kmax: 3 }],
  ['trees grown like special ones, up to 3 children numbers', 'special', { maxJ: 3 }],
  ['trees grown like special ones, up to 6 children numbers', 'special', { maxJ: 6 }],
];
smallShapes.forEach(([name, shape, opts], idx) => {
  const r = prng(1000 + idx);
  const trees = [];
  for (let i = 0; i < 24; i++) {
    const n = shape === 'path' || shape === 'star' ? r.int(2, 14) : shape === 'binomial' && opts.k === 4 ? 16 : r.int(8, 16);
    trees.push([n, tree(shape, n, r, { ...opts, rootFirst: i % 3 === 0 })]);
  }
  small(name, render(trees));
});

// The largest sizes the brute force can do: 17 to 19 vertices, the trees with the biggest labels.
{
  const r = prng(77);
  const trees = [];
  for (const shape of ['special', 'binomial', 'random', 'hubs']) for (let i = 0; i < 3; i++) trees.push([19, tree(shape, 19, r, { k: 4, maxJ: 5, rootFirst: i === 0 })]);
  small('trees of 19 vertices, the biggest the definition can do', render(trees));
}
{
  // The sizes 2..4 with every numbering of the same shape, in one input.
  const r = prng(78);
  const trees = [];
  for (let i = 0; i < 60; i++) {
    const n = r.int(2, 6);
    trees.push([n, tree('random', n, r, {})]);
  }
  small('60 tiny random trees', render(trees));
}

// ---------- large: [shape, n or [lo, hi], options, count] per group ----------
const N = 300000;
large('path of 300000 vertices', { seed: 1, groups: [['path', N, {}, 1]] });
large('star of 300000 vertices', { seed: 2, groups: [['star', N, {}, 1]] });
large('random tree of 300000 vertices', { seed: 3, groups: [['random', N, {}, 1]] });
large('thin deep tree of 300000 vertices', { seed: 4, groups: [['deep', N, { window: 4 }, 1]] });
large('preferential attachment tree, a few huge hubs', { seed: 5, groups: [['hubs', N, {}, 1]] });
large('caterpillar, 150000 spine vertices with a leaf each', { seed: 6, groups: [['caterpillar', N, { legs: 2 }, 1]] });
large('caterpillar, 300 hubs of about 1000 leaves', { seed: 7, groups: [['caterpillar', N, { legs: 1000 }, 1]] });
large('caterpillar, 6000 hubs of about 50 leaves', { seed: 8, groups: [['caterpillar', N, { legs: 50 }, 1]] });
large('complete binary tree of 300000 vertices', { seed: 9, groups: [['kary', N, { k: 2 }, 1]] });
large('complete 7-ary tree of 300000 vertices', { seed: 10, groups: [['kary', N, { k: 7 }, 1]] });
large('binomial tree of 262144 vertices with random leaves, numbered at random', { seed: 11, groups: [['binomial', N, { k: 18 }, 1]] });
large('binomial tree of 262144 vertices, vertex 1 its root, leaves on random vertices', { seed: 12, groups: [['binomial', N, { k: 18, rootFirst: true }, 1]] });
large('binomial tree of 131072 vertices with 169000 leaves on its root', { seed: 13, groups: [['binomial', N, { k: 17, onRoot: true, rootFirst: true }, 1]] });
large('hub with one binomial tree of 32768 vertices and 267000 leaves', { seed: 14, groups: [['hubBig', N, { k: 15, rootFirst: true }, 1]] });
large('hub with one binomial tree of 131072 vertices and 169000 leaves', { seed: 15, groups: [['hubBig', N, { k: 17, rootFirst: true }, 1]] });
large('hub with binomial trees of every size up to 131072 and leaves', { seed: 16, groups: [['hubBinomials', N, { kmax: 17, rootFirst: true }, 1]] });
large('hub with 20 binomial trees of each size up to 2048', { seed: 17, groups: [['hubBinomials', N, { kmax: 11, times: 20, rootFirst: true }, 1]] });
large('path of binomial trees of random sizes up to 4096', { seed: 18, groups: [['spineBinomials', N, { kmax: 12 }, 1]] });
large('path of binomial trees of random sizes up to 64', { seed: 19, groups: [['spineBinomials', N, { kmax: 6 }, 1]] });
large('tree grown like special ones, up to 4 children numbers', { seed: 20, groups: [['special', N, { maxJ: 4 }, 1]] });
large('tree grown like special ones, up to 12 children numbers', { seed: 21, groups: [['special', N, { maxJ: 12, rootFirst: true }, 1]] });
large('100000 trees of 3 vertices', { seed: 22, groups: [['random', 3, {}, 100000]] });
large('99000 tiny trees of 2 to 4 vertices', { seed: 27, groups: [['random', [2, 4], {}, 99000]] });
large('10000 random trees of 30 vertices', { seed: 23, groups: [['random', 30, {}, 10000]] });
large('3000 binomial and special trees of 100 vertices', { seed: 24, groups: [['binomial', 100, { k: 6 }, 1000], ['special', 100, { maxJ: 6 }, 1000], ['hubs', 100, {}, 1000]] });
large('300 random trees of 1000 vertices, mixed shapes', { seed: 25, groups: [['random', 1000, {}, 100], ['special', 1000, { maxJ: 8 }, 100], ['deep', 1000, { window: 5 }, 100]] });
large('3 trees of 100000 vertices', { seed: 26, groups: [['special', 100000, { maxJ: 5 }, 1], ['binomial', 100000, { k: 16 }, 1], ['hubs', 100000, {}, 1]] });

// Fill in the large cases' expected hashes from the reference, timing it.
let worst = 0;
for (const c of cases) {
  if (!c.spec) continue;
  const input = buildInput(c.spec);
  const t0 = process.cpuUsage();
  const out = solve(input);
  const used = process.cpuUsage(t0);
  const ms = (used.user + used.system) / 1000;
  worst = Math.max(worst, ms);
  c.sha = sha(out.trimEnd());
  console.log(`${String(Math.round(ms)).padStart(6)} ms  ${c.name}`);
}
console.log('worst reference CPU time (ms):', Math.round(worst));
fs.writeFileSync(path.join(here, 'cases.json'), JSON.stringify(cases));
console.log('cases', cases.length, 'small', cases.filter((c) => !c.spec).length, 'bytes', fs.statSync(path.join(here, 'cases.json')).size);
