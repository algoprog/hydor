// Input generators for the checker, the stress test and the cases/ folder. Everything is seeded, so the same call
// always gives the same input.

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
  const int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)); // both ends included
  return { next, int };
}

const text = (k, x) => `${x.length} ${k}\n${x.join(' ')}\n`;

// ---------- small inputs, for brute-force checking: a few size regimes ----------
export function smallInput(seed, mode) {
  const rng = prng(seed);
  let n;
  let k;
  let x;
  if (mode === 'tiny') {
    n = rng.int(1, 3);
    k = rng.int(1, 8);
    x = Array.from({ length: n }, () => rng.int(0, 3));
  } else if (mode === 'zeros') {
    // Mostly empty positions: counts have to be built up by the doubling, so long chains matter.
    n = rng.int(2, 8);
    k = rng.int(1, 14);
    x = Array.from({ length: n }, () => (rng.next() < 0.7 ? 0 : rng.int(1, 2)));
  } else if (mode === 'longk') {
    // More operations than any one position holds: the later positions get used.
    n = rng.int(2, 5);
    k = rng.int(6, 16);
    x = Array.from({ length: n }, () => rng.int(0, 2));
  } else if (mode === 'wide') {
    n = rng.int(1, 4);
    k = rng.int(1, 12);
    x = Array.from({ length: n }, () => rng.int(0, 9));
  } else if (mode === 'long') {
    // Many positions and few operations.
    n = rng.int(8, 14);
    k = rng.int(1, 9);
    x = Array.from({ length: n }, () => (rng.next() < 0.5 ? 0 : rng.int(1, 2)));
  } else if (mode === 'front') {
    // Everything in the first position, as in the doubling chain of the statement.
    n = rng.int(2, 6);
    k = rng.int(4, 18);
    x = Array.from({ length: n }, (_, i) => (i === 0 ? rng.int(1, 4) : 0));
  } else throw new Error(`unknown mode ${mode}`);
  return text(k, x);
}

// ---------- middle-sized inputs, for checking against the slow polynomial DP in stress.mjs ----------
export function midInput(seed) {
  const rng = prng(seed);
  const n = rng.int(1, 20);
  const k = rng.int(20, 400);
  const kind = rng.int(0, 3);
  const x = Array.from({ length: n }, () => (kind === 0 ? rng.int(0, 3) : kind === 1 ? rng.int(0, 60) : kind === 2 ? (rng.next() < 0.8 ? 0 : rng.int(1, 400)) : rng.int(0, 400)));
  return text(k, x);
}

// ---------- large inputs, built from a seed when the checker runs ----------
const MAXV = 250000;
const randomX = (rng, n, hi, zeroShare = 0) => Array.from({ length: n }, () => (rng.next() < zeroShare ? 0 : rng.int(0, hi)));
export const large = [
  { name: 'big: N=20, K=250000, every X at its largest', build: () => text(250000, Array(20).fill(MAXV)) },
  { name: 'big: N=20, K=250000, X all zero but the first is 1', build: () => text(250000, [1, ...Array(19).fill(0)]) },
  { name: 'big: N=20, K=250000, X all zero but the first is 250000', build: () => text(250000, [MAXV, ...Array(19).fill(0)]) },
  { name: 'big: N=20, K=250000, X all zero', build: () => text(250000, Array(20).fill(0)) },
  { name: 'big: N=20, K=250000, X all small (0 to 3)', build: () => text(250000, randomX(prng(301), 20, 3)) },
  { name: 'big: N=20, K=250000, X random up to 250000', build: () => text(250000, randomX(prng(302), 20, MAXV)) },
  { name: 'big: N=20, K=250000, X mostly zero, a few large ones', build: () => text(250000, randomX(prng(303), 20, MAXV, 0.8)) },
  { name: 'big: N=20, K=250000, X mostly 0 or 1', build: () => text(250000, randomX(prng(304), 20, 1)) },
  { name: 'big: N=1, K=250000, X=250000', build: () => text(250000, [MAXV]) },
  { name: 'big: N=1, K=250000, X=100000', build: () => text(250000, [100000]) },
  { name: 'big: N=2, K=250000, X=(0, 250000)', build: () => text(250000, [0, MAXV]) },
  { name: 'big: N=20, K=131071 (a weight 2^j-1 equals K), X small', build: () => text(131071, randomX(prng(305), 20, 2)) },
  { name: 'big: N=20, K=131072 (one past a weight), X small', build: () => text(131072, randomX(prng(306), 20, 2)) },
  { name: 'big: N=20, K=65535, X mostly 0, one 1 at the start', build: () => text(65535, [1, ...randomX(prng(307), 19, 1, 0.9)]) },
  { name: 'big: N=7, K=250000, X random up to 250000', build: () => text(250000, randomX(prng(308), 7, MAXV)) },
  { name: 'big: N=20, K=250000, X small and the last two large', build: () => text(250000, [...randomX(prng(309), 18, 2), 200000, MAXV]) },
];

// ---------- middle-sized inputs (K of a few hundred to two thousand), also checked against dp.mjs ----------
const MID_SIZES = [
  ['N=20, K=1000, X all zero but the first is 1000', () => text(1000, [1000, ...Array(19).fill(0)])],
  ['N=20, K=2000, X small (0 to 3)', () => text(2000, randomX(prng(401), 20, 3))],
  ['N=12, K=1500, X random up to 1500', () => text(1500, randomX(prng(402), 12, 1500))],
  ['N=20, K=1023, X mostly zero, the first is 1', () => text(1023, [1, ...randomX(prng(403), 19, 1, 0.8)])],
  ['N=20, K=1024, X mostly zero, the first is 1', () => text(1024, [1, ...randomX(prng(404), 19, 1, 0.8)])],
  ['N=5, K=1200, X random up to 250000', () => text(1200, randomX(prng(405), 5, MAXV))],
];
export const mid = MID_SIZES.map(([name, build]) => ({ name: `mid: ${name}`, build }));
