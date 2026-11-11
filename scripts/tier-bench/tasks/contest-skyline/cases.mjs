// The large cases of the checker for contest-skyline: each is a name and a function that builds its input (a string in the
// problem's format) from a seeded generator, so a case is the same on every run and nothing big is stored. Shared by
// check.mjs and gen-cases.mjs, which finds the answers once with the reference and keeps a hash of each in expected.json.
// Most inputs are made from a row of heights H (so some answer exists) and then the counts C are read off it; the rest
// change those counts a little, which is where a method that is not exact goes wrong. Every input is held to the
// problem's constraints by checkInput when it is built.

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
  const int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  return { next, int };
}

/** The input text for N and the counts C_1 .. C_{N-1}; throws if any constraint of the problem is broken. */
export function checkInput(N, C) {
  if (!(N >= 2 && N <= 200000)) throw new Error(`N = ${N}`);
  if (C.length !== N - 1) throw new Error(`${C.length} counts for N = ${N}`);
  for (const c of C) if (!(Number.isInteger(c) && c >= 1 && c <= N)) throw new Error(`count out of range: ${c}`);
  return `${N}\n${C.join(' ')}\n`;
}

/** The counts C_1 .. C_{N-1} that the row of heights H (an array of N distinct heights) gives, from two monotone stacks. */
export function countsOf(H) {
  const N = H.length;
  // left[x] = how many buildings among the first x are visible looking left from just after x.
  const left = new Int32Array(N + 1);
  const stack = [];
  for (let i = 0; i < N; i++) {
    while (stack.length && stack[stack.length - 1] < H[i]) stack.pop();
    stack.push(H[i]);
    left[i + 1] = stack.length;
  }
  // right[x] = the same for the buildings from x to N, looking right from just before x.
  const right = new Int32Array(N + 2);
  stack.length = 0;
  for (let i = N - 1; i >= 0; i--) {
    while (stack.length && stack[stack.length - 1] < H[i]) stack.pop();
    stack.push(H[i]);
    right[i + 1] = stack.length;
  }
  const C = [];
  for (let x = 1; x < N; x++) C.push(left[x] + right[x + 1]);
  return C;
}

// Heights 1..N in the order of a ranking: rank[k] is the position that gets the (k+1)-th tallest height.
const fromTallestOrder = (order) => {
  const H = new Array(order.length);
  order.forEach((pos, k) => (H[pos] = order.length - k));
  return H;
};

const shuffle = (r, a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = r.int(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const increasing = (N) => Array.from({ length: N }, (_, i) => i + 1);
const randomRow = (r, N) => shuffle(r, increasing(N));

// Increasing up to the tallest, then decreasing: the tallest at position peak (0-based).
const mountain = (r, N, peak) => {
  const left = [];
  const right = [];
  const heights = shuffle(r, increasing(N - 1));
  for (const h of heights) (r.next() < 0.5 && left.length < peak) || right.length >= N - 1 - peak ? left.push(h) : right.push(h);
  left.sort((a, b) => a - b);
  right.sort((a, b) => b - a);
  return [...left, N, ...right];
};

// The tallest at the far left, the next at the far right, the next at the second from the left, and so on inward.
const zigzag = (N) => {
  const order = [];
  for (let lo = 0, hi = N - 1; lo <= hi; ) {
    order.push(lo++);
    if (lo <= hi) order.push(hi--);
  }
  return fromTallestOrder(order);
};

// A perfectly balanced tree on N = 2^k - 1 buildings: the tallest in the middle, then the middles of each half, and so on.
const balanced = (N) => {
  const order = [];
  const ctz = (v) => 31 - Math.clz32(v & -v);
  const positions = increasing(N);
  positions.sort((a, b) => ctz(b) - ctz(a) || a - b);
  for (const p of positions) order.push(p - 1);
  return fromTallestOrder(order);
};

// A tree made by splitting a range at a random place; skew > 1 makes the splits uneven so that the tree is deep.
const splitRow = (r, N, skew, edgeChance) => {
  const order = new Array(N);
  let next = 0;
  // The tallest of a range goes first, then its two halves, taken from a stack of ranges (no recursion).
  const ranges = [[0, N - 1]];
  while (ranges.length) {
    const [lo, hi] = ranges.pop();
    if (lo > hi) continue;
    let cut;
    if (r.next() < edgeChance) cut = r.next() < 0.5 ? lo : hi;
    else cut = lo + Math.floor(Math.pow(r.next(), skew) * (hi - lo + 1));
    if (cut > hi) cut = hi;
    order[next++] = cut;
    ranges.push([lo, cut - 1], [cut + 1, hi]);
  }
  return fromTallestOrder(order);
};

// Rows that are nearly sorted: each height is its place plus some noise, then ranked.
const nearlySorted = (r, N, noise) => {
  const keys = Array.from({ length: N }, (_, i) => i + r.next() * noise);
  const idx = increasing(N).map((_, i) => i).sort((a, b) => keys[a] - keys[b]);
  const H = new Array(N);
  idx.forEach((pos, k) => (H[pos] = k + 1));
  return H;
};

// Blocks that go up inside and down from block to block.
const blocks = (N, size) => {
  const H = new Array(N);
  const count = Math.ceil(N / size);
  let h = 1;
  for (let b = count - 1; b >= 0; b--) for (let i = b * size; i < Math.min(N, (b + 1) * size); i++) H[i] = h++;
  return H;
};

const rotate = (C) => [...C.slice(1), C[0]];

export const large = [
  { name: 'random order, N = 200,000', build: () => checkInput(200000, countsOf(randomRow(prng(101), 200000))) },
  { name: 'increasing heights, N = 200,000 (counts up to N)', build: () => { const N = 200000; return checkInput(N, countsOf(increasing(N))); } },
  { name: 'decreasing heights, N = 200,000', build: () => { const N = 200000; return checkInput(N, countsOf(increasing(N).reverse())); } },
  { name: 'increasing, but the first count is N - 1 (valid, differs from the sum at the 2^-N bit)', build: () => { const N = 200000; const C = countsOf(increasing(N)); C[0] = N - 1; return checkInput(N, C); } },
  { name: 'increasing, but the second count is one less (no row gives it)', build: () => { const N = 200000; const C = countsOf(increasing(N)); C[1]--; return checkInput(N, C); } },
  { name: 'increasing then decreasing, the tallest at about 0.3 N', build: () => { const r = prng(105); return checkInput(200000, countsOf(mountain(r, 200000, 61234))); } },
  { name: 'tallest at one end, the next at the other, and so on inward (depth N)', build: () => checkInput(199999, countsOf(zigzag(199999))) },
  { name: 'perfectly balanced, N = 2^17 - 1', build: () => checkInput(131071, countsOf(balanced(131071))) },
  { name: 'random uneven splits (deep), N = 200,000', build: () => checkInput(200000, countsOf(splitRow(prng(108), 200000, 3, 0))) },
  { name: 'random splits, half of them at an end, N = 200,000', build: () => checkInput(200000, countsOf(splitRow(prng(109), 200000, 1, 0.5))) },
  { name: 'nearly sorted with noise 3,000, N = 200,000', build: () => checkInput(200000, countsOf(nearlySorted(prng(120), 200000, 3000))) },
  { name: 'blocks of 447 going up, the blocks going down, N = 200,000', build: () => checkInput(200000, countsOf(blocks(200000, 447))) },
  { name: 'counts of a deep tree, moved one place along (same sum, no row)', build: () => { const N = 200000; return checkInput(N, rotate(countsOf(splitRow(prng(112), N, 3, 0)))); } },
  { name: 'all counts 17, N = 2^17 (sum is 1 - 2^-17)', build: () => checkInput(131072, new Array(131071).fill(17)) },
  { name: 'random counts from 30 to N (sum tiny, many bits)', build: () => { const r = prng(118); return checkInput(200000, Array.from({ length: 199999 }, () => r.int(30, 200000))); } },
];
