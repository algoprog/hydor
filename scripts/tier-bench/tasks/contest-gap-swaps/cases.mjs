// The cases of the checker for contest-gap-swaps: each has a name, a size class and a function that builds its input
// text (N, then the permutation) from a seeded generator, so a case is the same on every run. Shared by check.mjs and
// gen-expected.mjs, which finds each case's answer once and stores it in expected.json.

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
  return { next, int, chance: (p) => next() < p };
}

const text = (p) => `${p.length}\n${p.join(' ')}\n`;
const identity = (n) => Array.from({ length: n }, (_, i) => i + 1);
// Fisher-Yates on the given array, in place.
function shuffle(r, a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = r.int(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const random = (r, n) => shuffle(r, identity(n));
// Shuffles only the places for which keep(i) is false (1-based); the others stay fixed.
function shuffleSome(r, n, move) {
  const p = identity(n);
  const places = p.filter((i) => move(i));
  const values = shuffle(r, places.slice());
  places.forEach((place, k) => (p[place - 1] = values[k]));
  return p;
}
// Shuffles every block of w consecutive places among themselves.
function windows(r, n, w) {
  const p = identity(n);
  for (let s = 0; s < n; s += w) {
    const block = shuffle(r, p.slice(s, Math.min(n, s + w)));
    block.forEach((v, k) => (p[s + k] = v));
  }
  return p;
}
const swapRandom = (r, p, times) => {
  for (let t = 0; t < times; t++) {
    const i = r.int(0, p.length - 1);
    const j = r.int(0, p.length - 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  return p;
};

export const cases = [];
const add = (kind, name, build) => cases.push({ kind, name: `${kind}: ${name}`, build });

// ---------- small: N up to 9, answers from brute.mjs (the samples are in the statement) ----------
add('small', 'sample 1', () => '6\n6 2 3 5 4 1\n');
add('small', 'sample 2, already sorted', () => '3\n1 2 3\n');
add('small', 'N = 2 sorted', () => '2\n1 2\n');
add('small', 'N = 2 swapped', () => '2\n2 1\n');
add('small', 'N = 3, ends swapped over a fixed middle', () => '3\n3 2 1\n');
add('small', 'N = 3, rotated left', () => '3\n2 3 1\n');
add('small', 'N = 3, rotated right', () => '3\n3 1 2\n');
add('small', 'N = 5, one swap over three fixed places', () => '5\n5 2 3 4 1\n');
add('small', 'N = 9 reversed', () => text(identity(9).reverse()));
add('small', 'N = 9 rotated by 4', () => text(identity(9).map((_, i) => ((i + 4) % 9) + 1)));
add('small', 'N = 8, every pair of neighbours swapped', () => '8\n2 1 4 3 6 5 8 7\n');
add('small', 'N = 9, the two ends swapped over seven fixed places', () => '9\n9 2 3 4 5 6 7 8 1\n');
add('small', 'N = 9, a 3-cycle at each end around fixed places', () => '9\n2 3 1 4 5 6 8 9 7\n');
add('small', 'N = 9, evens then odds', () => '9\n2 4 6 8 1 3 5 7 9\n');
add('small', 'N = 8, two blocks reversed with fixed places between', () => '8\n3 2 1 4 5 8 7 6\n');
add('small', 'N = 9, nested gaps', () => '9\n4 3 2 1 5 9 8 7 6\n');
for (let t = 0; t < 8; t++) {
  const n = 5 + (t % 5);
  add('small', `random permutation ${t + 1} (N = ${n})`, () => text(random(prng(1000 + t), n)));
}
for (let t = 0; t < 5; t++) {
  const n = 6 + (t % 4);
  add('small', `mostly fixed places ${t + 1} (N = ${n})`, () => {
    const r = prng(2100 + t);
    return text(shuffleSome(r, n, () => r.chance(0.55)));
  });
}
for (let t = 0; t < 3; t++) {
  const n = 7 + (t % 3);
  add('small', `sorted with a few swaps ${t + 1} (N = ${n})`, () => text(swapRandom(prng(3100 + t), identity(n), 3)));
}

// ---------- medium: N up to a few thousand, answers from the reference (it matched brute.mjs on every small input, and
// gen-expected.mjs checks these against the formula summed the slow way) ----------
add('medium', 'random N = 2000', () => text(random(prng(4001), 2000)));
add('medium', 'reversed N = 3001', () => text(identity(3001).reverse()));
add('medium', 'rotated by 700, N = 3000', () => text(identity(3000).map((_, i) => ((i + 700) % 3000) + 1)));
add('medium', 'a few places moved, the rest fixed, N = 4000', () => {
  const r = prng(4004);
  return text(shuffleSome(r, 4000, () => r.chance(0.03)));
});
add('medium', 'blocks shuffled inside themselves, N = 3000', () => text(windows(prng(4005), 3000, 40)));
add('medium', 'both ends reversed around a fixed middle, N = 2500', () => {
  const n = 2500;
  return text(identity(n).map((v, i) => (i < 300 || i >= n - 300 ? n + 1 - v : v)));
});

// ---------- large: N up to 500,000 (answers up to about 6e10, past 32 bits), answers from the reference ----------
const N = 500000;
add('large', 'random N = 500000', () => text(random(prng(5001), N)));
add('large', 'random N = 499999', () => text(random(prng(5002), N - 1)));
add('large', 'random N = 200000', () => text(random(prng(5003), 200000)));
add('large', 'reversed', () => text(identity(N).reverse()));
add('large', 'already sorted', () => text(identity(N)));
add('large', 'rotated by half (distances and inversions both past 32 bits)', () => text(identity(N).map((_, i) => ((i + N / 2) % N) + 1)));
add('large', 'rotated left by one', () => text(identity(N).map((_, i) => (i + 1) % N + 1)));
add('large', 'rotated right by one', () => text(identity(N).map((_, i) => ((i + N - 1) % N) + 1)));
add('large', 'every pair of neighbours swapped', () => text(identity(N).map((v) => (v % 2 === 1 ? v + 1 : v - 1))));
add('large', '98 percent of the places fixed, the rest shuffled', () => {
  const r = prng(5009);
  return text(shuffleSome(r, N, () => r.chance(0.02)));
});
add('large', 'blocks of 1000 shuffled inside themselves', () => text(windows(prng(5010), N, 1000)));
add('large', 'both ends reversed around 400000 fixed places', () => {
  const k = 50000;
  return text(identity(N).map((v, i) => (i < k || i >= N - k ? N + 1 - v : v)));
});
add('large', 'reversed with 1000 random swaps', () => text(swapRandom(prng(5013), identity(N).reverse(), 1000)));
add('large', 'evens then odds', () => {
  const p = [];
  for (let v = 2; v <= N; v += 2) p.push(v);
  for (let v = 1; v <= N; v += 2) p.push(v);
  return text(p);
});
add('large', 'two interleaved descending runs', () => {
  const p = [];
  for (let i = 0; i < N / 2; i++) p.push(N / 2 - i, N - i);
  return text(p);
});
