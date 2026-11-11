// Test generators for the checker, the case builder and the stress test. Everything is seeded (mulberry32), so the same
// call always gives the same tests. A test is { n, perms }, with 0-indexed permutations (see lib.mjs).
import { inputText, orderOf, permWithCycles, powerPerm, prng, randomBig, randomPerm } from './lib.mjs';

const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97];

// Cycle lengths for a planted Q on n elements, by style:
//  'partition'  a random partition of n into parts of at most n
//  'small'      random parts between 1 and 6
//  'primes'     the first primes that fit, so the order is as large as it gets
//  'composite'  parts with many shared factors (4, 6, 8, 9, 10, 12, 18, 20, 30, ...)
//  'single'     one cycle of length n
//  'powers'     prime powers 256, 81, 125, then primes that still fit
export function lengthsFor(rng, n, style) {
  const out = [];
  let left = n;
  if (style === 'single') return [n];
  if (style === 'primes') {
    for (const p of PRIMES) {
      if (p <= left) {
        out.push(p);
        left -= p;
      }
    }
    return rng.shuffle(out);
  }
  if (style === 'powers') {
    for (const p of [256, 81, 125, 49, 7, 11, 13, 17, 19, 23, 29]) {
      if (p <= left) {
        out.push(p);
        left -= p;
      }
    }
    return rng.shuffle(out);
  }
  const pool = style === 'composite' ? [4, 6, 8, 9, 10, 12, 12, 18, 20, 30, 36, 2, 3] : null;
  while (left > 0) {
    let len;
    if (style === 'small') len = rng.int(1, Math.min(6, left));
    else if (pool) len = pool[rng.int(0, pool.length - 1)];
    else len = rng.int(1, left);
    if (len > left) len = left;
    out.push(len);
    left -= len;
  }
  return out;
}

// A planted Q with the given cycle lengths. Returns { q, cycles, order }.
export function plantedQ(rng, n, lengths) {
  const { perm, cycles } = permWithCycles(rng, n, lengths);
  return { q: perm, cycles, order: orderOf(perm) };
}

// A random exponent for q: a big one, or one that keeps only one prime power of the order (so the power on its own
// does not say what the cycles are), or 0 or 1.
function exponent(rng, order, kind) {
  if (kind === 0) return 0n;
  if (kind === 1) return 1n;
  if (kind === 'big') return randomBig(rng, 70) % (order * 3n + 1n);
  // kind 'piece': order / p^e times a number, for a random prime power p^e dividing the order exactly
  let rest = order;
  const pe = [];
  for (let p = 2n; p * p <= rest || rest > 1n; p++) {
    if (rest === 1n) break;
    if (p * p > rest) {
      pe.push(rest);
      break;
    }
    if (rest % p === 0n) {
      let q = 1n;
      while (rest % p === 0n) {
        rest /= p;
        q *= p;
      }
      pe.push(q);
    }
  }
  if (pe.length === 0) return 0n;
  const chosen = pe[rng.int(0, pe.length - 1)];
  return (order / chosen) * BigInt(rng.int(1, 5));
}

// m permutations that are all powers of a planted q (so the answer is Yes). pieceShare is the share of them that keep
// one prime power only.
export function plantedPerms(rng, q, order, m, pieceShare) {
  const perms = [];
  for (let i = 0; i < m; i++) {
    const r = rng.next();
    let kind;
    if (r < pieceShare) kind = 'piece';
    else if (r < pieceShare + 0.1) kind = rng.int(0, 1);
    else kind = 'big';
    perms.push(powerPerm(q, exponent(rng, order, kind)));
  }
  return perms;
}

// A random transposition applied to the values of a permutation.
function swapTwo(rng, p) {
  const out = p.slice();
  if (out.length < 2) return out;
  const i = rng.int(0, out.length - 1);
  let j = rng.int(0, out.length - 2);
  if (j >= i) j++;
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

// A power of q whose cycles are rotated by amounts that do not come from one exponent: each cycle gets its own shift.
function independentShifts(rng, q, cycles) {
  const p = new Array(q.length);
  for (let i = 0; i < q.length; i++) p[i] = i;
  for (const c of cycles) {
    const sh = rng.int(0, c.length - 1);
    for (let j = 0; j < c.length; j++) p[c[j]] = c[(j + sh) % c.length];
  }
  return p;
}

// One test of n elements and up to m permutations, in the given mode (see the modes below).
export function makeTest(rng, n, m, mode, style = 'partition') {
  const lengths = lengthsFor(rng, n, style);
  const { q, cycles, order } = plantedQ(rng, n, lengths);
  const at = () => rng.int(0, m - 1);
  switch (mode) {
    case 'random':
      return { n, perms: Array.from({ length: m }, () => randomPerm(rng, n)) };
    case 'planted':
      return { n, perms: plantedPerms(rng, q, order, m, 0.2) };
    case 'pieces':
      return { n, perms: plantedPerms(rng, q, order, m, 0.9) };
    case 'swapped': {
      const perms = plantedPerms(rng, q, order, m, 0.3);
      const i = at();
      perms[i] = swapTwo(rng, perms[i]);
      return { n, perms };
    }
    case 'otherRoot': {
      // most are powers of q, one is a power of another permutation of the same cycle type
      const other = plantedQ(rng, n, lengths);
      const perms = plantedPerms(rng, q, order, m, 0.3);
      perms[at()] = powerPerm(other.q, exponent(rng, order, 'big'));
      return { n, perms };
    }
    case 'shifts': {
      // one permutation rotates every cycle of q by its own amount: usually not a power of q
      const perms = plantedPerms(rng, q, order, m, 0.3);
      perms[at()] = independentShifts(rng, q, cycles);
      return { n, perms };
    }
    case 'twoRoots': {
      // half of them powers of one q, half powers of a different one with the same cycles but another arrangement
      const other = plantedQ(rng, n, lengths);
      const perms = [];
      for (let i = 0; i < m; i++) perms.push(powerPerm(i % 2 ? other.q : q, exponent(rng, order, rng.next() < 0.5 ? 'piece' : 'big')));
      return { n, perms };
    }
    default:
      throw new Error(`unknown mode ${mode}`);
  }
}

export const MODES = ['random', 'planted', 'pieces', 'swapped', 'otherRoot', 'shifts', 'twoRoots'];

// count tests of n in [nLo, nHi] and m in [mLo, mHi], each in a mode picked from modes with the weights given by
// repeating entries, as one input text.
export function mixed(seed, count, [nLo, nHi], [mLo, mHi], modes, style) {
  const rng = prng(seed);
  const tests = [];
  for (let i = 0; i < count; i++) {
    const n = rng.int(nLo, nHi);
    const m = rng.int(mLo, mHi);
    const mode = modes[rng.int(0, modes.length - 1)];
    const st = typeof style === 'function' ? style(rng) : style;
    tests.push(makeTest(rng, n, m, mode, st));
  }
  return tests;
}

const STYLES_SMALL = ['partition', 'small', 'single', 'composite', 'partition'];
export const randomStyle = (rng) => STYLES_SMALL[rng.int(0, STYLES_SMALL.length - 1)];

// Whole inputs as text for the stress test: tiny random tests of every mode.
export function smallInput(seed, count = 60, maxN = 7) {
  return inputText(mixed(seed, count, [1, maxN], [1, 4], MODES, randomStyle));
}

// ---------- the cases ----------

// Powers of one big cycle that never reach a generator: every exponent is a multiple of 2 or of 5, so no given
// permutation has order 500 on its own, yet one Q of order 500 has them all as powers.
function singleCycleNoGenerator(rng, n, m) {
  const { q } = plantedQ(rng, n, [n]);
  const perms = [];
  for (let i = 0; i < m; i++) perms.push(powerPerm(q, BigInt(rng.int(1, 10 ** 9)) * (i % 2 ? 2n : 5n)));
  return { n, perms };
}

const identityTest = (n, m) => ({ n, perms: Array.from({ length: m }, () => Array.from({ length: n }, (_, i) => i)) });
const ALL_MODES = MODES;
const NO_RANDOM = MODES.filter((m) => m !== 'random');

// The large cases (each sum of n*m is at most 250000). build() gives the tests.
export const large = [
  { name: 'large: 500x500 powers of a Q whose cycle lengths are the first primes', build: () => mixed(101, 1, [500, 500], [500, 500], ['planted'], 'primes') },
  { name: 'large: 500x500 each permutation keeps one prime power of the order', build: () => mixed(102, 1, [500, 500], [500, 500], ['pieces'], 'primes') },
  { name: 'large: 500x500 prime powers 256, 81, 125 in the cycle lengths', build: () => mixed(103, 1, [500, 500], [500, 500], ['pieces'], 'powers') },
  { name: 'large: 500x500 one permutation is a power of a different Q (primes)', build: () => mixed(104, 1, [500, 500], [500, 500], ['otherRoot'], 'primes') },
  { name: 'large: 500x500 one permutation rotates each cycle by its own amount (shared factors)', build: () => mixed(105, 1, [500, 500], [500, 500], ['shifts'], 'composite') },
  { name: 'large: 500x500 powers of a Q with many shared factors in its cycle lengths', build: () => mixed(106, 1, [500, 500], [500, 500], ['planted'], 'composite') },
  { name: 'large: 500x500 powers of one 500-cycle, none a generator', build: () => [singleCycleNoGenerator(prng(107), 500, 500)] },
  { name: 'large: 500x500 half the permutations are powers of one Q, half of another', build: () => mixed(108, 1, [500, 500], [500, 500], ['twoRoots'], 'primes') },
  { name: 'large: 500x500 every permutation is the identity', build: () => [identityTest(500, 500)] },
  { name: 'large: 500x500 random permutations', build: () => mixed(110, 1, [500, 500], [500, 500], ['random'], 'primes') },
  { name: 'large: 500x1 a single random permutation, 500 times', build: () => mixed(111, 500, [500, 500], [1, 1], ['random'], 'primes') },
  { name: 'large: 250000 tests of 1x1', build: () => Array.from({ length: 250000 }, () => identityTest(1, 1)) },
  { name: 'large: 41666 tests of 3x2, every mode', build: () => mixed(113, 41666, [3, 3], [2, 2], ALL_MODES, 'partition') },
  { name: 'large: 25000 tests of 5x2, every mode', build: () => mixed(114, 25000, [5, 5], [2, 2], ALL_MODES, randomStyle) },
  { name: 'large: 2500 tests of 10x10, planted and spoiled', build: () => mixed(115, 2500, [10, 10], [10, 10], NO_RANDOM, randomStyle) },
  { name: 'large: 500 tests of 50x10, planted and spoiled', build: () => mixed(116, 500, [50, 50], [10, 10], NO_RANDOM, 'composite') },
  { name: 'large: 250 tests of 100x10, long cycle lengths', build: () => mixed(117, 250, [100, 100], [10, 10], NO_RANDOM, 'primes') },
  { name: 'large: 125 tests of 500x2, rotations of cycles that cannot share one exponent', build: () => mixed(119, 125, [500, 500], [2, 2], ['shifts', 'planted'], 'composite') },
  { name: 'large: 5000 tests of 25x2, rotations of cycles that cannot share one exponent', build: () => mixed(120, 5000, [25, 25], [2, 2], ['shifts', 'planted', 'shifts'], 'composite') },
  { name: 'large: 100 tests of 500x5, planted and spoiled', build: () => mixed(118, 100, [500, 500], [5, 5], NO_RANDOM, (r) => ['primes', 'composite', 'powers', 'partition'][r.int(0, 3)]) },
];

// The small cases: themes of random tests, whose answers come from brute.mjs. [name, seed, count, [nLo, nHi], [mLo, mHi], modes, style]
export const smallThemes = [];
for (const [label, nr, count] of [['n4-5', [4, 5], 80], ['n6', [6, 6], 80], ['n7', [7, 7], 25]]) {
  for (const mode of MODES) {
    const style = mode === 'shifts' || mode === 'pieces' ? 'composite' : randomStyle;
    smallThemes.push([`${mode}-${label}`, 1000 + smallThemes.length, count, nr, [1, 4], [mode], style]);
  }
}
smallThemes.push(['crt-n8', 2003, 8, [8, 8], [2, 3], ['shifts'], 'composite']);
smallThemes.push(['crt-n7-8-small-cycles', 2004, 8, [7, 8], [2, 2], ['shifts', 'planted'], 'small']);
smallThemes.push(['mixed-n8', 2000, 8, [8, 8], [1, 3], MODES, randomStyle]);
smallThemes.push(['mixed-n8-composite', 2001, 8, [8, 8], [2, 3], NO_RANDOM, 'composite']);
smallThemes.push(['mixed-n1-3', 2002, 60, [1, 3], [1, 5], MODES, randomStyle]);

// The small cases made by hand: [name, tests].
export function smallHand() {
  const rng = prng(3000);
  const ident = (n) => Array.from({ length: n }, (_, i) => i);
  const cases = [];
  cases.push(['edge-n1', [{ n: 1, perms: [[0]] }, { n: 1, perms: [[0], [0]] }, { n: 1, perms: [[0], [0], [0]] }]]);
  cases.push(['edge-identities-only', [1, 2, 3, 4, 5, 6, 7, 6, 5].map((n, i) => identityTest(n, (i % 3) + 1))]);
  cases.push(['edge-m1-random-perm', Array.from({ length: 40 }, () => ({ n: rng.int(2, 7), perms: [null] })).map((t) => ({ n: t.n, perms: [randomPerm(rng, t.n)] }))]);
  cases.push(['edge-the-same-permutation-twice', Array.from({ length: 30 }, () => rng.int(2, 7)).map((n) => { const p = randomPerm(rng, n); return { n, perms: [p, p.slice()] }; })]);
  cases.push(['edge-identity-and-one-permutation', Array.from({ length: 30 }, () => rng.int(2, 7)).map((n) => ({ n, perms: [ident(n), randomPerm(rng, n)] }))]);
  // every pair of permutations of n elements (one permutation twice covers M = 1)
  for (const n of [3, 4, 5]) {
    const all = [];
    const rec = (cur, used) => {
      if (cur.length === n) return all.push(cur.slice());
      for (let v = 0; v < n; v++) if (!used[v]) { used[v] = true; cur.push(v); rec(cur, used); cur.pop(); used[v] = false; }
    };
    rec([], []);
    const tests = [];
    for (let i = 0; i < all.length; i++) for (let j = i; j < all.length; j++) tests.push({ n, perms: [all[i], all[j]] });
    cases.push([`every-pair-n${n}`, tests]);
  }
  // none of the permutations generates the Q: a 6-cycle with its square and cube, and 4-and-2 cycles with the like
  const c6 = [1, 2, 3, 4, 5, 0];
  cases.push(['trap-square-and-cube-of-a-6-cycle', [{ n: 6, perms: [powerPerm(c6, 2), powerPerm(c6, 3)] }, { n: 6, perms: [powerPerm(c6, 2), powerPerm(c6, 3), powerPerm(c6, 4)] }]]);
  cases.push(['trap-two-pieces-on-disjoint-cycles', [{ n: 5, perms: [[1, 2, 0, 3, 4], [0, 1, 2, 4, 3]] }, { n: 7, perms: [[1, 2, 0, 3, 4, 5, 6], [0, 1, 2, 4, 3, 5, 6], [0, 1, 2, 3, 4, 6, 5]] }]]);
  cases.push(['trap-two-cycles-need-the-same-exponent', [{ n: 6, perms: [[1, 0, 3, 4, 5, 2], [0, 1, 3, 4, 5, 2]] }, { n: 6, perms: [[1, 0, 3, 4, 5, 2], [1, 0, 4, 5, 2, 3]] }, { n: 7, perms: [[1, 2, 3, 0, 5, 6, 4], [3, 0, 1, 2, 5, 6, 4]] }, { n: 8, perms: [[1, 2, 3, 0, 5, 6, 7, 4], [3, 0, 1, 2, 5, 6, 7, 4]] }, { n: 8, perms: [[1, 2, 3, 0, 5, 6, 7, 4], [1, 2, 3, 0, 6, 7, 4, 5]] }]]);
  // single tests where each cycle of the one candidate is rotated by a different amount (k = s mod a must agree)
  const rot = (cycles, shifts, n) => {
    const p = Array.from({ length: n }, (_, i) => i);
    cycles.forEach((c, i) => c.forEach((x, j) => (p[x] = c[(j + shifts[i]) % c.length])));
    return p;
  };
  const crt = (name, cycles, n, shifts) => cases.push([name, [{ n, perms: [rot(cycles, cycles.map(() => 1), n), rot(cycles, shifts, n)] }]]);
  crt('crt-2-and-4-cycle', [[0, 1], [2, 3, 4, 5]], 6, [1, 0]);
  crt('crt-two-3-cycles', [[0, 1, 2], [3, 4, 5]], 6, [1, 2]);
  crt('crt-three-2-cycles-ok', [[0, 1], [2, 3], [4, 5]], 6, [1, 1, 1]);
  crt('crt-4-and-4-cycle', [[0, 1, 2, 3], [4, 5, 6, 7]], 8, [1, 3]);
  crt('crt-2-and-6-cycle', [[0, 1], [2, 3, 4, 5, 6, 7]], 8, [1, 2]);
  crt('crt-2-and-6-cycle-ok', [[0, 1], [2, 3, 4, 5, 6, 7]], 8, [1, 3]);
  return cases;
}

export const sample = {
  text: `6
3 2
2 3 1
3 1 2
3 2
2 3 1
1 3 2
5 2
1 5 2 4 3
4 2 3 1 5
5 1
4 2 5 1 3
9 4
2 9 7 5 4 3 8 1 6
3 7 2 5 4 1 9 6 8
3 7 2 4 5 1 9 6 8
7 8 9 4 5 2 6 3 1
10 4
9 2 1 4 5 6 8 3 7 10
7 4 9 5 10 2 3 1 8 6
3 4 8 5 10 2 9 7 1 6
1 10 3 6 2 5 7 8 9 4
`,
  verdicts: ['yes', 'no', 'yes', 'yes', 'yes', 'no'],
};
