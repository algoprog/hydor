// Builds cases.json, the checker's cases: node make-cases.mjs. Each case is one input ("H W M") with its expected output.
// The small ones get theirs from brute.mjs (every matrix tried), the closed-form edge cases from their formula, and
// the rest from the reference, which has been proved against brute.mjs and against the plain triple sum (prove.mjs does that).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { brute } from './brute.mjs';
import { solve } from './reference/src/solve.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const P = 998244353n;
const pw = (a, e) => {
  let r = 1n;
  let b = ((BigInt(a) % P) + P) % P;
  let x = BigInt(e);
  while (x > 0n) {
    if (x & 1n) r = (r * b) % P;
    b = (b * b) % P;
    x >>= 1n;
  }
  return r;
};

function prng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)) };
}
const r = prng(230);

// The triple sum over h, w, m written out with big integers (slow: for medium inputs, to double-check the reference).
function binom(n, k) {
  let x = 1n;
  for (let i = 0; i < k; i++) x = (x * BigInt(n - i)) / BigInt(i + 1);
  return x;
}
function formula(H, W, M) {
  let s = 0n;
  for (let h = 1; h <= H; h++)
    for (let w = 1; w <= W; w++) {
      let t = 0n;
      for (let m = 1; m <= M; m++) t += (pw(m, h * (W - w)) * pw(M + 1 - m, (H - h) * w)) % P;
      t = (((t % P) * pw(M, (H - h) * (W - w))) % P) * ((binom(H, h) * binom(W, w)) % P) % P;
      s += (h + w) % 2 ? -t : t;
    }
  return String(((s % P) + P) % P);
}

const cases = [];
const add = (name, H, W, M, how, expected) => {
  const input = `${H} ${W} ${M}\n`;
  let want;
  if (how === 'brute') want = String(brute(H, W, M));
  else if (how === 'formula') want = formula(H, W, M);
  else if (how === 'given') want = expected;
  else want = solve(input);
  if (how === 'formula' || how === 'given') {
    if (solve(input) !== want) throw new Error(`reference disagrees on ${name}: ${solve(input)} vs ${want}`);
  }
  cases.push({ name, input, expected: want });
};

// The samples.
add('sample 1: 2 x 2, values up to 3', 2, 2, 3, 'given', '67');
add('sample 2: 99 x 82, values up to 44353', 99, 82, 44353, 'given', '213254234');

// Edge cases with a known answer.
add('1 x 1 with one value', 1, 1, 1, 'given', '1');
add('1 x 1, values up to 100,000,000: every matrix works', 1, 1, 100000000, 'given', '100000000');
add('a single row of 200, values up to 100,000,000: M^W', 1, 200, 100000000, 'given', String(pw(100000000, 200)));
add('a single column of 200, values up to 100,000,000: M^H', 200, 1, 100000000, 'given', String(pw(100000000, 200)));
add('200 x 200, every entry must be 1', 200, 200, 1, 'given', '1');
add('1 x 5, values up to 4', 1, 5, 4, 'brute');
add('5 x 1, values up to 4', 5, 1, 4, 'brute');
add('2 x 2, values up to 2', 2, 2, 2, 'brute');
add('2 x 2, values up to 4', 2, 2, 4, 'brute');
add('3 x 3, values up to 2', 3, 3, 2, 'brute');
add('3 x 3, values up to 3', 3, 3, 3, 'brute');
add('2 x 3, values up to 5', 2, 3, 5, 'brute');
add('4 x 4, values up to 2', 4, 4, 2, 'brute');
add('2 x 6, values up to 3', 2, 6, 3, 'brute');
add('6 x 2, values up to 3', 6, 2, 3, 'brute');
add('1 x 20, values up to 2', 1, 20, 2, 'brute');
add('20 x 1, values up to 2', 20, 1, 2, 'brute');
add('4 x 5, values up to 2', 4, 5, 2, 'brute');
add('2 x 2, values up to 30 (brute force: 810,000 matrices)', 2, 2, 30, 'brute');

// Small random ones, checked against the brute force: sizes chosen so that M^(H*W) is at most about a million.
const regimes = [
  ['values 2, up to 18 cells', () => [r.int(2, 6), r.int(2, 6), 2], 18],
  ['values 3, up to 12 cells', () => [r.int(2, 6), r.int(2, 6), 3], 12],
  ['values 4, up to 9 cells', () => [r.int(1, 5), r.int(1, 5), 4], 9],
  ['values 5 to 7, up to 7 cells', () => [r.int(1, 4), r.int(1, 4), r.int(5, 7)], 7],
  ['values 8 to 30, up to 5 cells', () => [r.int(1, 3), r.int(1, 3), r.int(8, 30)], 5],
];
let nSmall = 0;
for (const [what, draw, maxCells] of regimes) {
  let made = 0;
  while (made < 3) {
    const [H, W, M] = draw();
    if (H * W > maxCells || H * W < 4) continue;
    add(`small random ${++nSmall}, ${H} x ${W}, ${what}`, H, W, M, 'brute');
    made++;
  }
}

// Medium ones: too many matrices to try, so the expected answer is the plain triple sum (small M) or the reference.
add('medium: 6 x 7, values up to 40 (below H*W+1, summed directly)', 6, 7, 40, 'formula');
add('medium: 6 x 7, values up to 43 (exactly H*W+1)', 6, 7, 43, 'formula');
add('medium: 6 x 7, values up to 44 (first value that needs more than H*W+1 points)', 6, 7, 44, 'formula');
add('medium: 7 x 9, values up to 150', 7, 9, 150, 'formula');
add('medium: 9 x 4, values up to 100', 9, 4, 100, 'formula');
add('medium: 12 x 3, values up to 120', 12, 3, 120, 'formula');
add('medium: 30 x 30, values up to 901 (exactly H*W+1)', 30, 30, 901, 'reference');
add('medium: 30 x 30, values up to 902 (the first needing interpolation)', 30, 30, 902, 'reference');
add('medium: 40 x 25, values up to 1,000,000', 40, 25, 1000000, 'reference');
add('medium: 60 x 17, values up to 99,999,999', 60, 17, 99999999, 'reference');
add('medium: 2 x 200, values up to 100,000,000', 2, 200, 100000000, 'reference');

// Large ones, at the limits.
add('large: 200 x 200, values up to 100,000,000', 200, 200, 100000000, 'reference');
add('large: 200 x 200, values up to 99,999,999', 200, 200, 99999999, 'reference');
add('large: 200 x 200, values up to 40,001 (exactly H*W+1)', 200, 200, 40001, 'reference');
add('large: 200 x 200, values up to 40,002', 200, 200, 40002, 'reference');
add('large: 200 x 200, values up to 7', 200, 200, 7, 'reference');
add('large: 200 x 199, values up to 98,765,432', 200, 199, 98765432, 'reference');
add('large: 199 x 200, values up to 98,765,432', 199, 200, 98765432, 'reference');
add('large: 200 x 100, values up to 100,000,000', 200, 100, 100000000, 'reference');
add('large: 100 x 200, values up to 100,000,000', 100, 200, 100000000, 'reference');
add('large: 200 x 2, values up to 100,000,000', 200, 2, 100000000, 'reference');
add('large: 150 x 197, values up to 12,345,678', 150, 197, 12345678, 'reference');

fs.writeFileSync(path.join(here, 'cases.json'), JSON.stringify(cases, null, 1) + '\n');
console.log(`${cases.length} cases written`);
