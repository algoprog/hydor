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

// A test case as text from n and a list of [l, r] pairs.
const caseText = (n, pairs) => {
  const lines = [`${n} ${pairs.length}`];
  for (const [l, r] of pairs) lines.push(`${l} ${r}`);
  return lines.join('\n');
};
const inputText = (cases) => `${cases.length}\n${cases.join('\n')}\n`;

// m intervals that each hold exactly two of the given ones (sorted positions), so the answer is Yes by construction.
function plantedPairs(rng, n, ones, m) {
  const pairs = [];
  if (ones.length < 2) return pairs;
  const lastStart = ones[ones.length - 2];
  for (let i = 0; i < m; i++) {
    const l = rng.int(1, lastStart);
    let lo = 0;
    let hi = ones.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ones[mid] >= l) hi = mid;
      else lo = mid + 1;
    }
    const b = ones[lo + 1];
    const c = lo + 2 < ones.length ? ones[lo + 2] : n + 1;
    pairs.push([l, rng.int(b, c - 1)]);
  }
  return pairs;
}

// k distinct ones in 1..n, sorted.
function randomOnes(rng, n, k) {
  const set = new Set();
  while (set.size < Math.min(k, n)) set.add(rng.int(1, n));
  return [...set].sort((a, b) => a - b);
}

// Ones whose gaps are heavy-tailed: mostly 1-3 apart, now and then very far apart.
function heavyTailOnes(rng, n) {
  const ones = [];
  let p = rng.int(1, 3);
  while (p <= n) {
    ones.push(p);
    p += Math.max(1, Math.floor(1 / Math.pow(1 - rng.next(), 1.4)));
  }
  return ones;
}

const randomPair = (rng, n, maxLen = n) => {
  const l = rng.int(1, n - 1);
  return [l, Math.min(n, l + rng.int(1, maxLen))];
};

// Several independent pieces side by side (their intervals never overlap), each with its own planted ones.
function blocks(rng, parts, size, perBlock) {
  const pairs = [];
  for (let b = 0; b < parts; b++) {
    const ones = randomOnes(rng, size, rng.int(2, 40));
    for (const [l, r] of plantedPairs(rng, size, ones, perBlock)) pairs.push([l + b * size, r + b * size]);
  }
  return pairs;
}

// ---------- small inputs: `count` test cases of one kind, for brute-force checking ----------
export function smallInput(seed, mode, count) {
  const rng = prng(seed);
  const cases = [];
  for (let c = 0; c < count; c++) {
    let n;
    let pairs = [];
    if (mode === 'tiny') {
      n = rng.int(2, 6);
      for (let i = rng.int(1, 5); i > 0; i--) pairs.push(randomPair(rng, n));
    } else if (mode === 'planted' || mode === 'nearplanted') {
      n = rng.int(4, 16);
      const ones = randomOnes(rng, n, rng.int(2, Math.max(2, Math.min(n, 7))));
      pairs = plantedPairs(rng, n, ones, rng.int(1, 9));
      if (mode === 'nearplanted' && rng.next() < 0.7 && pairs.length > 0) pairs[rng.int(0, pairs.length - 1)] = randomPair(rng, n, 6);
    } else if (mode === 'dense') {
      n = rng.int(6, 14);
      for (let i = rng.int(4, 14); i > 0; i--) pairs.push(randomPair(rng, n, rng.int(2, 5)));
    } else if (mode === 'windows') {
      n = rng.int(6, 16);
      const len = rng.int(1, 5);
      for (let l = 1; l + len <= n; l++) pairs.push([l, l + len]);
      for (let i = rng.int(0, 2); i > 0; i--) pairs.push(randomPair(rng, n, len + 2));
    } else if (mode === 'nested') {
      n = rng.int(6, 16);
      let l = rng.int(1, Math.floor(n / 2));
      let r = n + 1 - l;
      while (l < r && pairs.length < 6) {
        pairs.push([l, r]);
        l += rng.int(0, 2);
        r -= rng.int(0, 2);
      }
      for (let i = rng.int(0, 2); i > 0; i--) pairs.push(randomPair(rng, n, 4));
    } else throw new Error(`unknown mode ${mode}`);
    pairs = pairs.filter(([l, r]) => l < r);
    if (pairs.length === 0) pairs.push([1, n]);
    // Shuffle the intervals, so that the order in the input says nothing.
    for (let i = pairs.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
    }
    cases.push(caseText(n, pairs));
  }
  return inputText(cases);
}

// ---------- middle-sized inputs (a few thousand places), built from a seed when the checker runs ----------
export const mid = [
  {
    name: 'mid: 60 ones, 3000 planted intervals (Yes)',
    build() {
      const rng = prng(201);
      return inputText([caseText(4000, plantedPairs(rng, 4000, randomOnes(rng, 4000, 60), 3000))]);
    },
  },
  {
    name: 'mid: heavy-tailed gaps, 3000 planted intervals (Yes)',
    build() {
      const rng = prng(202);
      return inputText([caseText(5000, plantedPairs(rng, 5000, heavyTailOnes(rng, 5000), 3000))]);
    },
  },
  ...[211, 212, 213, 214].map((seed, i) => ({
    name: `mid: planted, one interval replaced (${i + 1})`,
    build() {
      const rng = prng(seed);
      const pairs = plantedPairs(rng, 3000, randomOnes(rng, 3000, 25 + 10 * i), 2500);
      pairs[rng.int(0, pairs.length - 1)] = randomPair(rng, 3000, 60);
      return inputText([caseText(3000, pairs)]);
    },
  })),
  {
    name: 'mid: windows of 7, then one of 8 at the end',
    build() {
      const pairs = [];
      for (let l = 1; l + 6 <= 2000; l++) pairs.push([l, l + 6]);
      pairs.push([1990, 1997]);
      return inputText([caseText(2000, pairs)]);
    },
  },
  {
    name: 'mid: windows of 7 and 8 over a stretch (No)',
    build() {
      const pairs = [];
      for (let l = 1; l <= 900; l++) pairs.push([l, l + 6], [l, l + 7]);
      return inputText([caseText(2000, pairs)]);
    },
  },
  {
    name: 'mid: 20 independent blocks, one replaced interval',
    build() {
      const rng = prng(221);
      const pairs = blocks(rng, 20, 100, 150);
      pairs[rng.int(0, pairs.length - 1)] = [100 * 7 + 3, 100 * 7 + 9];
      return inputText([caseText(2000, pairs)]);
    },
  },
];

// ---------- large inputs, built from a seed when the checker runs ----------
const N = 500000;
export const large = [
  {
    name: 'big: 20 ones, 500000 planted intervals (Yes)',
    build() {
      const rng = prng(101);
      return inputText([caseText(N, plantedPairs(rng, N, randomOnes(rng, N, 20), 500000))]);
    },
  },
  {
    name: 'big: 2000 ones, 500000 planted intervals (Yes)',
    build() {
      const rng = prng(102);
      return inputText([caseText(N, plantedPairs(rng, N, randomOnes(rng, N, 2000), 500000))]);
    },
  },
  {
    name: 'big: ones every few places, 500000 planted intervals (Yes)',
    build() {
      const rng = prng(103);
      const ones = [];
      for (let p = rng.int(1, 3); p <= N; p += rng.int(2, 4)) ones.push(p);
      return inputText([caseText(N, plantedPairs(rng, N, ones, 500000))]);
    },
  },
  {
    name: 'big: heavy-tailed gaps between the ones (Yes)',
    build() {
      const rng = prng(104);
      return inputText([caseText(N, plantedPairs(rng, N, heavyTailOnes(rng, N), 500000))]);
    },
  },
  {
    name: 'big: 300 ones, 500000 planted intervals, one replaced at random',
    build() {
      const rng = prng(105);
      const pairs = plantedPairs(rng, N, randomOnes(rng, N, 300), 500000);
      pairs[rng.int(0, pairs.length - 1)] = randomPair(rng, N, 3000);
      return inputText([caseText(N, pairs)]);
    },
  },
  {
    name: 'big: 40 ones, 200000 planted intervals, 3 replaced by long ones',
    build() {
      const rng = prng(106);
      const pairs = plantedPairs(rng, N, randomOnes(rng, N, 40), 200000);
      for (let i = 0; i < 3; i++) pairs[rng.int(0, pairs.length - 1)] = randomPair(rng, N);
      return inputText([caseText(N, pairs)]);
    },
  },
  {
    name: 'big: windows of length 1000 at every start (Yes)',
    build() {
      const pairs = [];
      for (let l = 1; l + 999 <= N; l++) pairs.push([l, l + 999]);
      return inputText([caseText(N, pairs)]);
    },
  },
  {
    name: 'big: windows of two neighbouring lengths (No)',
    build() {
      const pairs = [];
      for (let l = 1; l <= 250000; l++) pairs.push([l, l + 999], [l, l + 1000]);
      return inputText([caseText(N, pairs)]);
    },
  },
  {
    name: 'big: 250000 nested intervals (Yes)',
    build() {
      const pairs = [];
      for (let i = 1; i <= 250000; i++) pairs.push([i, N + 1 - i]);
      return inputText([caseText(N, pairs)]);
    },
  },
  {
    name: 'big: nested intervals with a pair outside them (Yes)',
    build() {
      const pairs = [[100, 101]];
      for (let i = 1000; i <= 250000; i++) pairs.push([i, N + 1 - i]);
      return inputText([caseText(N, pairs)]);
    },
  },
  {
    name: 'big: nested intervals with a pair inside the outer ones (No)',
    build() {
      const pairs = [[100, 101]];
      for (let i = 1; i <= 250000; i++) pairs.push([i, N + 1 - i]);
      return inputText([caseText(N, pairs)]);
    },
  },
  {
    name: 'big: 500000 random wide intervals',
    build() {
      const rng = prng(112);
      const pairs = [];
      for (let i = 0; i < 500000; i++) {
        const a = rng.int(1, N);
        let b = rng.int(1, N);
        if (a === b) b = a === N ? 1 : a + 1;
        pairs.push(a < b ? [a, b] : [b, a]);
      }
      return inputText([caseText(N, pairs)]);
    },
  },
  {
    name: 'big: 12 independent blocks, all planted (Yes)',
    build() {
      const rng = prng(113);
      return inputText([caseText(12 * 40000, blocks(rng, 12, 40000, 40000))]);
    },
  },
  {
    name: 'big: 12 independent blocks, one with a replaced interval',
    build() {
      const rng = prng(114);
      const pairs = blocks(rng, 12, 40000, 40000);
      const at = rng.int(0, pairs.length - 1);
      const base = Math.floor(pairs[at][0] / 40000) * 40000;
      pairs[at] = [base + rng.int(1, 100), base + rng.int(101, 5000)];
      return inputText([caseText(12 * 40000, pairs)]);
    },
  },
  {
    name: 'big: 250000 test cases of 2 places',
    build() {
      const cases = [];
      for (let i = 0; i < 250000; i++) cases.push(caseText(2, [[1, 2]]));
      return inputText(cases);
    },
  },
  {
    name: 'big: 100000 test cases of 5 places, random intervals',
    build() {
      const rng = prng(116);
      const cases = [];
      for (let i = 0; i < 100000; i++) {
        const pairs = [];
        for (let j = 0; j < 5; j++) pairs.push(randomPair(rng, 5, rng.int(1, 4)));
        cases.push(caseText(5, pairs));
      }
      return inputText(cases);
    },
  },
  {
    name: 'big: 50000 test cases of 10 places, planted with a few replaced',
    build() {
      const rng = prng(117);
      const cases = [];
      for (let i = 0; i < 50000; i++) {
        const pairs = plantedPairs(rng, 10, randomOnes(rng, 10, rng.int(2, 5)), 10);
        if (rng.next() < 0.5) pairs[rng.int(0, 9)] = randomPair(rng, 10, 5);
        cases.push(caseText(10, pairs.filter(([l, r]) => l < r)));
      }
      return inputText(cases);
    },
  },
  {
    name: 'big: one interval over everything',
    build: () => inputText([caseText(N, [[1, N]])]),
  },
  {
    name: 'big: 500000 copies of the whole range',
    build() {
      const pairs = [];
      for (let i = 0; i < 500000; i++) pairs.push([1, N]);
      return inputText([caseText(N, pairs)]);
    },
  },
];
