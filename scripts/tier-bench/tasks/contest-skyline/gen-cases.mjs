// Makes the small cases of the checker: cases/<name>.in (the input) and cases/<name>.out (the answer), where the answers
// come from the brute force (brute.mjs), and expected.json, the SHA-256 of the reference's answers on the large cases.
// Run once, from the task folder: node gen-cases.mjs <workdir with src/solve.mjs = the reference laid over the seed>.
// Before it writes anything it checks that the reference gives the brute force's answer on every small case, and that
// each small case is of the kind its name says (found without the reference's method: every pair (C_0, C_N) is tried).
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { solve as bruteSolve } from './brute.mjs';
import { countsOf, large, prng } from './cases.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(process.argv[2]);
const { solve } = await import(pathToFileURL(path.join(dir, 'src/solve.mjs')).href);
const r = prng(2026);

// Whether the whole list of counts C_0 .. C_N comes from a tree of buildings: join two equal depths on a stack.
const valid = (full) => {
  const st = [];
  for (const v of full) {
    st.push(v);
    while (st.length >= 2 && st[st.length - 1] === st[st.length - 2]) {
      if (st[st.length - 1] === 0) return false;
      st.pop();
      st[st.length - 1]--;
    }
  }
  return st.length === 1 && st[0] === 0;
};
// The pairs (C_0, C_N) that make the counts valid, and whether the sum 2^-C_x is below 1 (exactly, in BigInt).
const pairs = (N, mid) => {
  const list = [];
  for (let a = 1; a <= N; a++) for (let b = 1; b <= N; b++) if (valid([a, ...mid, b])) list.push([a, b]);
  return list;
};
const sumBelowOne = (N, mid) => mid.reduce((s, c) => s + (1n << BigInt(N - c)), 0n) < 1n << BigInt(N);
// Whether some pair (a, b) makes the sum of 2^-C over all N + 1 counts exactly 1.
const sumFits = (N, mid) => {
  const rest = (1n << BigInt(N)) - mid.reduce((s, c) => s + (1n << BigInt(N - c)), 0n);
  for (let a = 1; a <= N; a++) for (let b = 1; b <= N; b++) if ((1n << BigInt(N - a)) + (1n << BigInt(N - b)) === rest) return true;
  return false;
};

const randomRow = (N) => {
  const H = Array.from({ length: N }, (_, i) => i + 1);
  for (let i = N - 1; i > 0; i--) {
    const j = r.int(0, i);
    [H[i], H[j]] = [H[j], H[i]];
  }
  return H;
};
const fromRow = (N) => countsOf(randomRow(N));
const perturb = (N, mid) => {
  const C = mid.slice();
  const i = r.int(0, N - 2);
  if (r.next() < 0.5) C[i] = Math.max(1, Math.min(N, C[i] + (r.next() < 0.5 ? -1 : 1)));
  else {
    const j = r.int(0, N - 2);
    [C[i], C[j]] = [C[j], C[i]];
  }
  return C;
};

// A list of counts of size N (N - 1 counts) satisfying the predicate, made by the maker, tried until it fits.
const find = (N, maker, ok) => {
  for (let t = 0; t < 200000; t++) {
    const mid = maker(N);
    if (ok(N, mid)) return mid;
  }
  throw new Error(`no counts found for N = ${N}`);
};
const kinds = {
  // Both (C_0, C_N) and (C_N, C_0) give a tree, with C_0 != C_N: two sets of rows are counted.
  'two trees': [fromRow, (N, m) => { const p = pairs(N, m); return p.length === 2 && p[0][0] === p[1][1] && p[0][0] !== p[0][1]; }],
  // Only one order of the two end counts gives a tree, and the other order is not valid.
  'one tree, the ends differ': [(N) => perturb(N, fromRow(N)), (N, m) => { const p = pairs(N, m); return p.length === 1 && p[0][0] !== p[0][1] && sumFits(N, m); }],
  'one tree, the ends equal': [fromRow, (N, m) => { const p = pairs(N, m); return p.length === 1 && p[0][0] === p[0][1]; }],
  // The sum of 2^-C leaves room for two end counts, but no tree is possible.
  'the sum fits but no tree': [(N) => perturb(N, fromRow(N)), (N, m) => pairs(N, m).length === 0 && sumFits(N, m)],
  'the sum is 1 or more': [(N) => Array.from({ length: N - 1 }, () => r.int(1, 3)), (N, m) => !sumBelowOne(N, m)],
  'the sum leaves no two end counts': [(N) => Array.from({ length: N - 1 }, () => r.int(2, N)), (N, m) => sumBelowOne(N, m) && !sumFits(N, m)],
};

// Inputs already chosen, so that no two cases are the same.
const taken = new Set();
const keyOf = (N, mid) => `${N}:${mid.join(' ')}`;
const sample = (N, kind) => {
  const [maker, ok] = kinds[kind];
  const mid = find(N, maker, (n, m) => !taken.has(keyOf(n, m)) && ok(n, m));
  taken.add(keyOf(N, mid));
  return mid;
};
const small = [
  ['N = 2, count 2', 2, [2]],
  ['N = 2, count 1', 2, [1]],
  ['N = 3, counts 3 3 (two trees)', 3, [3, 3]],
  ['N = 3, counts 2 2', 3, [2, 2]],
  ['N = 4, counts 3 3 3', 4, [3, 3, 3]],
  ['N = 4, counts 1 1 1', 4, [1, 1, 1]],
  ['N = 5, counts 4 3 3 2 (increasing but one)', 5, [4, 3, 2, 2]],
  ['N = 9, increasing heights', 9, countsOf([1, 2, 3, 4, 5, 6, 7, 8, 9])],
  ['N = 9, decreasing heights', 9, countsOf([9, 8, 7, 6, 5, 4, 3, 2, 1])],
  ['N = 9, tallest at one end, next at the other, inward', 9, countsOf([9, 7, 5, 3, 1, 2, 4, 6, 8])],
  ['N = 9, increasing then decreasing', 9, countsOf([1, 3, 5, 7, 9, 8, 6, 4, 2])],
  ['N = 7, perfectly balanced', 7, countsOf([1, 6, 2, 7, 3, 5, 4])],
];
const byKind = [
  ['two trees', [4, 5, 6, 7, 8, 9]],
  ['one tree, the ends differ', [4, 6, 7, 8, 9]],
  ['one tree, the ends equal', [4, 6, 8, 9]],
  ['the sum fits but no tree', [5, 7, 9]],
  ['the sum is 1 or more', [4, 8]],
  ['the sum leaves no two end counts', [6, 9]],
];
for (const [, N, mid] of small) taken.add(keyOf(N, mid));
for (const [kind, sizes] of byKind) for (const N of sizes) small.push([`N = ${N}, ${kind}`, N, sample(N, kind)]);
// A few of size 10, where the brute force takes a few seconds.
small.push(['N = 10, a random row', 10, fromRow(10)]);
small.push(['N = 10, one tree, the ends differ', 10, sample(10, 'one tree, the ends differ')]);

fs.rmSync(path.join(here, 'cases'), { recursive: true, force: true });
fs.mkdirSync(path.join(here, 'cases'));
let bytes = 0;
let index = 0;
let nonzero = 0;
const seen = new Set();
for (const [name, N, mid] of small) {
  const input = `${N}\n${mid.join(' ')}\n`;
  if (seen.has(input)) throw new Error(`"${name}" repeats an earlier input`);
  seen.add(input);
  const want = bruteSolve(input);
  if (want !== '0\n') nonzero++;
  if (solve(input) !== want) throw new Error(`the reference differs from the brute force on "${name}": ${JSON.stringify(input)}`);
  const stem = `${String(++index).padStart(2, '0')}-${name.replace(/[^A-Za-z0-9]+/g, '-').replace(/-+$/, '')}`;
  fs.writeFileSync(path.join(here, 'cases', `${stem}.in`), input);
  fs.writeFileSync(path.join(here, 'cases', `${stem}.out`), want);
  bytes += input.length + want.length;
}
console.error(`${small.length} small cases written (${bytes} bytes, ${nonzero} with a nonzero answer); the reference matches the brute force on all of them`);

// The samples, from the statement.
for (const [name, input, want] of [['sample-1', '4\n2 2 3\n', '3\n'], ['sample-2', '3\n2 1\n', '0\n'], ['sample-3', '7\n3 3 3 3 4 4\n', '85\n']]) {
  if (solve(input) !== want || bruteSolve(input) !== want) throw new Error(`a sample fails: ${input}`);
  fs.writeFileSync(path.join(here, 'cases', `00-${name}.in`), input);
  fs.writeFileSync(path.join(here, 'cases', `00-${name}.out`), want);
}

// The large cases: the reference's answers.
const expected = {};
for (const c of large) {
  const input = c.build();
  const started = Date.now();
  const out = solve(input);
  console.error(`${c.name}: answer ${out.trim()}, reference ${Date.now() - started} ms`);
  expected[c.name] = createHash('sha256').update(out.trimEnd()).digest('hex');
}
fs.writeFileSync(path.join(here, 'expected.json'), JSON.stringify(expected, null, 1) + '\n');
