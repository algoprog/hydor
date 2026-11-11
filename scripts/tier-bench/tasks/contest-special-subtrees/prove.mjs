// Proves the reference against brute.mjs: node prove.mjs. Many small random trees of every shape and size from 2 to 18
// vertices (several trees per input), every tree on up to 9 vertices (as every parent list), the shapes at each size, and the
// sample. Prints how many trees were compared.
import fs from 'node:fs';
import { solve } from './reference/src/solve.mjs';
import { brute, bruteOne } from './brute.mjs';
import { prng, tree, render, SHAPES } from './gen.mjs';

const r = prng(2024);
let compared = 0;
let bad = 0;
const check = (input, label) => {
  const a = solve(input);
  const b = brute(input);
  compared += a.trim().split('\n').length;
  if (a !== b) {
    bad++;
    console.log('MISMATCH', label, JSON.stringify(input.slice(0, 200)), a.slice(0, 80), b.slice(0, 80));
  }
};

// The sample (its trees have 6 and 10 and 2 vertices).
check(fs.readFileSync(new URL('./seed/PROBLEM.md', import.meta.url), 'utf8').match(/## Sample 1\n\nInput:\n\n```\n([\s\S]*?)```/)[1], 'sample');

// Small random trees: sizes 2..17, every shape (with its options), several per input.
const optionSets = {
  deep: [{ window: 2 }, { window: 3 }, { window: 6 }],
  caterpillar: [{ legs: 2 }, { legs: 3 }, { legs: 5 }],
  kary: [{ k: 2 }, { k: 3 }, { k: 4 }],
  binomial: [{ k: 2 }, { k: 3 }, { k: 4, onRoot: true }, { k: 4 }],
  hubBig: [{ k: 2 }, { k: 3 }],
  hubBinomials: [{ kmax: 3, times: 1 }, { kmax: 2, times: 2 }],
  spineBinomials: [{ kmax: 2 }, { kmax: 3 }],
  special: [{ maxJ: 3 }, { maxJ: 5 }, { maxJ: 8 }],
};
for (let round = 0; round < 3000; round++) {
  const trees = [];
  const count = r.int(1, 6);
  for (let i = 0; i < count; i++) {
    const shape = SHAPES[r.int(0, SHAPES.length - 1)];
    const sets = optionSets[shape] ?? [{}];
    const opts = { ...sets[r.int(0, sets.length - 1)], rootFirst: r.next() < 0.5 };
    const n = r.int(2, round % 10 === 0 ? 18 : 12);
    trees.push([n, tree(shape, n, r, opts)]);
  }
  check(render(trees), `round ${round}`);
}

// Every shape at every size from 2 to 17, five numberings each.
for (const shape of SHAPES)
  for (let n = 2; n <= 17; n++)
    for (const opts of optionSets[shape] ?? [{}]) {
      const trees = [];
      for (let i = 0; i < 5; i++) trees.push([n, tree(shape, n, r, { ...opts, rootFirst: i % 2 === 0 })]);
      check(render(trees), `${shape} ${n}`);
    }

// Every tree on up to 9 vertices (each tree given by a parent list: vertex i hangs on any of 1..i-1).
let all = 0;
for (let n = 2; n <= 9; n++) {
  const parent = new Array(n + 1).fill(1);
  const trees = [];
  const rec = (i) => {
    if (i > n) {
      const edges = [];
      for (let v = 2; v <= n; v++) edges.push([parent[v], v]);
      trees.push([n, edges]);
      return;
    }
    for (let p = 1; p < i; p++) { parent[i] = p; rec(i + 1); }
  };
  rec(2);
  // 8! = 40320 labelled recursive trees at 9 vertices: in chunks of a thousand.
  for (let s = 0; s < trees.length; s += 1000) check(render(trees.slice(s, s + 1000)), `all ${n}`);
  all += trees.length;
}

// A few sizes where labels up to 5 appear (a binomial tree of 16 vertices rooted anywhere), and 19-20 vertices.
for (let i = 0; i < 40; i++) check(render([[16, tree('binomial', 16, r, { k: 4, rootFirst: i % 2 === 0 })]]), `B4 ${i}`);
for (let i = 0; i < 60; i++) {
  const shape = ['random', 'special', 'hubs', 'binomial'][i % 4];
  const n = 19 + (i % 2);
  check(render([[n, tree(shape, n, r, { k: 4, maxJ: 6, rootFirst: i % 3 === 0 })]]), `big ${i}`);
}
console.log('trees compared', compared, '(of which every recursive tree up to 9 vertices:', all, ') mismatches', bad);
process.exit(bad ? 1 : 0);
