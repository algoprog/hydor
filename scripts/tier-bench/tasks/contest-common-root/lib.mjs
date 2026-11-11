// Shared by the checker, the case builder and the stress test: a seeded PRNG, test-case text, and the judge that says
// whether a printed Q is valid. Permutations here are 0-indexed arrays; the text uses 1..N.

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
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = int(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  return { next, int, shuffle };
}

// Input text from a list of tests { n, perms: [Int array 0-indexed, ...] }.
export function inputText(tests) {
  const lines = [String(tests.length)];
  for (const { n, perms } of tests) {
    lines.push(`${n} ${perms.length}`);
    for (const p of perms) lines.push(p.map((x) => x + 1).join(' '));
  }
  return lines.join('\n') + '\n';
}

// The tests back from their text (used by the judge, which has the input as text only).
export function parseInput(text) {
  const tok = text.split(/\s+/).filter(Boolean).map(Number);
  let pos = 0;
  const t = tok[pos++];
  const tests = [];
  for (let c = 0; c < t; c++) {
    const n = tok[pos++];
    const m = tok[pos++];
    const perms = [];
    for (let i = 0; i < m; i++) {
      perms.push(tok.slice(pos, pos + n).map((x) => x - 1));
      pos += n;
    }
    tests.push({ n, perms });
  }
  return tests;
}

const gcdBig = (a, b) => {
  while (b) [a, b] = [b, a % b];
  return a;
};
const modInv = (a, m) => {
  // a is invertible modulo m here; extended Euclid on BigInts.
  let [r0, r1, s0, s1] = [((a % m) + m) % m, m, 1n, 0n];
  while (r1) {
    const q = r0 / r1;
    [r0, r1] = [r1, r0 - q * r1];
    [s0, s1] = [s1, s0 - q * s1];
  }
  return ((s0 % m) + m) % m;
};

// Whether the permutation p is q^k for some k >= 0, for the permutation q: each cycle of q must be mapped onto
// itself by p as a rotation of some s places, and the congruences k = s (mod length) must have a common solution
// (merged one by one, with BigInt, so the lcm of the lengths may be huge).
export function isPower(q, p) {
  const n = q.length;
  const seen = new Uint8Array(n);
  let r = 0n;
  let m = 1n;
  for (let s = 0; s < n; s++) {
    if (seen[s]) continue;
    const cyc = [];
    for (let x = s; !seen[x]; x = q[x]) {
      seen[x] = 1;
      cyc.push(x);
    }
    const a = cyc.length;
    const index = new Map(cyc.map((x, i) => [x, i]));
    const shift = index.get(p[cyc[0]]);
    if (shift === undefined) return false;
    for (let i = 0; i < a; i++) if (p[cyc[i]] !== cyc[(i + shift) % a]) return false;
    // merge k = shift (mod a) into k = r (mod m)
    const A = BigInt(a);
    const g = gcdBig(m, A);
    const diff = BigInt(shift) - r;
    if (diff % g !== 0n) return false;
    const mg = m / g;
    const step = (((diff / g) % (A / g)) * modInv(mg, A / g)) % (A / g);
    r = r + m * ((step + A / g) % (A / g));
    m = (m / g) * A;
    r = ((r % m) + m) % m;
  }
  return true;
}

// The reason a printed line is not a valid answer for the test, or '' when it is. expectYes says whether a Q exists.
export function judgeLine(line, test, expectYes) {
  const text = line.trim();
  if (!expectYes) return text === '-1' ? '' : `printed a Q, but none exists (expected -1)`;
  if (text === '-1') return 'printed -1, but a Q exists';
  const parts = text.split(/\s+/);
  if (parts.length !== test.n || !parts.every((s) => /^[0-9]+$/.test(s))) return `the answer is not ${test.n} integers`;
  const q = parts.map((s) => Number(s) - 1);
  const seen = new Uint8Array(test.n);
  for (const x of q) {
    if (x < 0 || x >= test.n || seen[x]) return 'the answer is not a permutation of 1..N';
    seen[x] = 1;
  }
  for (let i = 0; i < test.perms.length; i++) if (!isPower(q, test.perms[i])) return `permutation ${i + 1} is not a power of the printed Q`;
  return '';
}

// ---------- building blocks for the generators ----------

// A uniformly random permutation of 0..n-1.
export const randomPerm = (rng, n) => rng.shuffle(Array.from({ length: n }, (_, i) => i));

// A permutation of n elements whose cycles have the given lengths (summing to at most n; the rest are fixed points),
// placed on random elements. Returns { perm, cycles }.
export function permWithCycles(rng, n, lengths) {
  const order = randomPerm(rng, n);
  const perm = Array.from({ length: n }, (_, i) => i);
  const cycles = [];
  let at = 0;
  for (const len of lengths) {
    const c = order.slice(at, at + len);
    at += len;
    for (let j = 0; j < len; j++) perm[c[j]] = c[(j + 1) % len];
    cycles.push(c);
  }
  return { perm, cycles };
}

// perm^k for the permutation perm, k a BigInt or Number >= 0.
export function powerPerm(perm, k) {
  const n = perm.length;
  const K = BigInt(k);
  const seen = new Uint8Array(n);
  const out = new Array(n);
  for (let s = 0; s < n; s++) {
    if (seen[s]) continue;
    const c = [];
    for (let x = s; !seen[x]; x = perm[x]) {
      seen[x] = 1;
      c.push(x);
    }
    const sh = Number(K % BigInt(c.length));
    for (let j = 0; j < c.length; j++) out[c[j]] = c[(j + sh) % c.length];
  }
  return out;
}

// The order of a permutation, as a BigInt.
export function orderOf(perm) {
  const n = perm.length;
  const seen = new Uint8Array(n);
  let l = 1n;
  for (let s = 0; s < n; s++) {
    if (seen[s]) continue;
    let len = 0;
    for (let x = s; !seen[x]; x = perm[x]) {
      seen[x] = 1;
      len++;
    }
    l = (l / gcdBig(l, BigInt(len))) * BigInt(len);
  }
  return l;
}

// A random BigInt below 2^bits.
export function randomBig(rng, bits) {
  let v = 0n;
  for (let i = 0; i < bits; i += 24) v = (v << 24n) | BigInt(rng.int(0, (1 << 24) - 1));
  return v & ((1n << BigInt(bits)) - 1n);
}
