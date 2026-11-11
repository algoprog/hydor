// Makes the cases of the checker: cases/<name>.in (the input) and cases/<name>.out (the answer). The answers of the small
// cases come from the brute force (brute.mjs); the large ones, and the few edge cases beyond the brute force's reach,
// come from the reference. Run once, from the task folder: node gen-cases.mjs <workdir with src/solve.mjs = the reference
// laid over the seed>. Before it writes anything it compares the reference with the brute force on every (N, K) with
// K^N up to LIMIT, and prints how many inputs that was.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bruteSolve } from './brute.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(process.argv[2]);
const { solve } = await import(pathToFileURL(path.join(dir, 'src/solve.mjs')).href);
const LIMIT = Number(process.env.LIMIT ?? 2.2e6);
const MOD = 998244353;

// The reference against the brute force on every pair the brute force can do.
const brute = new Map();
for (let K = 2; K <= LIMIT; K++) {
  if (K * K > LIMIT) break;
  for (let N = 2; K ** N <= LIMIT; N++) {
    const want = bruteSolve(N, K);
    brute.set(`${N} ${K}`, want);
    if (solve(`${N} ${K}\n`).trim() !== want) throw new Error(`the reference differs from the brute force at N=${N} K=${K}`);
  }
}
// N = 2 with any K: the score is 1 for the K(K-1) sequences whose elements differ, so the answer is K(K-1) mod p. A direct
// formula, checked on the pairs the brute force can reach and used for K it cannot.
const nTwo = (K) => String((BigInt(K) * BigInt(K - 1)) % BigInt(MOD));
for (const [key, want] of brute) {
  const [N, K] = key.split(' ').map(Number);
  if (N === 2 && nTwo(K) !== want) throw new Error(`K(K-1) is wrong at K=${K}`);
}
for (const K of [3, 1000, 123456789, 998244351, 998244352]) if (solve(`2 ${K}\n`).trim() !== nTwo(K)) throw new Error(`the reference gives the wrong answer at N=2 K=${K}`);
console.error(`the reference matches the brute force on ${brute.size} inputs (every N >= 2 with K^N <= ${LIMIT})`);

const samples = [['3 2', '8'], ['6 2', '126'], ['2 2', '2'], ['10 3', '145002'], ['100 998244352', '139448523']];
// [name, N, K] where the answer comes from the brute force.
const small = [];
const addSmall = (name, N, K) => {
  if (!brute.has(`${N} ${K}`)) throw new Error(`the brute force has no answer for ${N} ${K}`);
  small.push([name, N, K]);
};
for (const N of [3, 5, 6, 9, 12, 16, 19, 21]) addSmall(`two values, N = ${N}`, N, 2);
for (const N of [2, 4, 7, 10, 12]) addSmall(`three values, N = ${N}`, N, 3);
for (const N of [3, 5, 9]) addSmall(`four values, N = ${N}`, N, 4);
for (const N of [4, 7]) addSmall(`five values, N = ${N}`, N, 5);
for (const [N, K] of [[5, 8], [6, 10], [4, 20], [3, 100], [3, 1000]]) if (brute.has(`${N} ${K}`)) addSmall(`${K} values, N = ${N}`, N, K);

const cases = [];
const add = (name, N, K, answer) => cases.push([name, `${N} ${K}\n`, `${answer}\n`]);
samples.forEach(([input, out], i) => cases.push([`sample ${i + 1}`, `${input}\n`, `${out}\n`]));
for (const [name, N, K] of small) add(`small: ${name}`, N, K, brute.get(`${N} ${K}`));
// N = 2 has a formula, so it can be checked for any K.
for (const K of [1000, 123456789, 998244351, 998244352]) add(`edge: N = 2, K = ${K}`, 2, K, nTwo(K));
// Edge cases with no brute force: the reference only (it matches the brute force wherever the brute force can go).
for (const [N, K] of [[3, 998244352], [4, 998244351], [7, 998244352], [30, 2]]) add(`edge: N = ${N}, K = ${K} (reference only)`, N, K, solve(`${N} ${K}\n`).trim());
// Large: N at or near 100, with small K, K near the modulus, and K in between.
const large = [[100, 2], [100, 3], [100, 5], [100, 10], [100, 1000], [100, 123456789], [100, 998244351], [99, 2], [99, 998244340], [97, 3], [95, 998244352], [91, 7]];
for (const [N, K] of large) {
  const started = Date.now();
  const want = solve(`${N} ${K}\n`).trim();
  console.error(`large N=${N} K=${K}: ${Date.now() - started} ms`);
  add(`large: N = ${N}, K = ${K}`, N, K, want);
}

fs.rmSync(path.join(here, 'cases'), { recursive: true, force: true });
fs.mkdirSync(path.join(here, 'cases'));
let bytes = 0;
cases.forEach(([name, input, out], i) => {
  const stem = `${String(i).padStart(2, '0')}-${name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
  fs.writeFileSync(path.join(here, 'cases', `${stem}.in`), input);
  fs.writeFileSync(path.join(here, 'cases', `${stem}.out`), out);
  bytes += input.length + out.length;
});
console.error(`${cases.length} cases written (${bytes} bytes)`);
