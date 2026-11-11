// Finds, for each test case, a permutation Q of which every given permutation is a power, or says there is none.
//
// If such a Q exists, one exists whose order is L, the lcm of the orders of the given permutations. For every prime
// power p^e that exactly divides L, some given permutation P_j has an order divisible by p^e, and raising P_j to the
// order divided by p^e gives a permutation R_p of order p^e. All of them are powers of that Q, so they commute, and
// their product is again a power of Q: one whose exponent is not divisible by any prime of L, so it generates the same
// powers as Q. So the product is the only candidate to build, and it is checked against every given permutation:
// each must rotate every cycle of the candidate by some amount, and the rotations must agree on one exponent k
// (a system of congruences k = s mod a, solved prime power by prime power).

const MAX_N = 500;

// Smallest prime factor of every number up to MAX_N.
const spf = new Int32Array(MAX_N + 1);
for (let i = 2; i <= MAX_N; i++) {
  if (spf[i] === 0) for (let j = i; j <= MAX_N; j += i) if (spf[j] === 0) spf[j] = i;
}

// Cycles of a permutation (0-indexed), as an array of arrays.
function cyclesOf(p, n, seen) {
  seen.fill(0, 0, n);
  const cycles = [];
  for (let s = 0; s < n; s++) {
    if (seen[s]) continue;
    const c = [];
    for (let x = s; !seen[x]; x = p[x]) {
      seen[x] = 1;
      c.push(x);
    }
    cycles.push(c);
  }
  return cycles;
}

function gcdBig(a, b) {
  while (b) [a, b] = [b, a % b];
  return a;
}

// p^k as a permutation: every cycle rotated by k (a BigInt) places.
function powerOf(p, n, k, seen) {
  const out = new Int32Array(n);
  for (const c of cyclesOf(p, n, seen)) {
    const a = c.length;
    const sh = Number(k % BigInt(a));
    for (let j = 0; j < a; j++) out[c[j]] = c[(j + sh) % a];
  }
  return out;
}

// Whether every permutation in perms is a power of q (a Int32Array, 0-indexed).
function allPowersOf(q, perms, n, seen) {
  const cycles = cyclesOf(q, n, seen);
  const cycleOf = new Int32Array(n);
  const posOf = new Int32Array(n);
  cycles.forEach((c, id) => c.forEach((x, j) => ((cycleOf[x] = id), (posOf[x] = j))));
  // For each prime, the longest prime power seen so far among the congruences and the residue it fixes.
  const bestExp = new Int32Array(MAX_N + 1);
  const bestRes = new Int32Array(MAX_N + 1);
  for (const p of perms) {
    const touched = [];
    for (let id = 0; id < cycles.length; id++) {
      const c = cycles[id];
      const a = c.length;
      const first = p[c[0]];
      if (cycleOf[first] !== id) return false;
      const sh = posOf[first];
      for (let j = 1; j < a; j++) if (p[c[j]] !== c[(j + sh) % a]) return false;
      // k = sh (mod a): split a into prime powers and merge each into the running constraints.
      let rest = a;
      while (rest > 1) {
        const q0 = spf[rest];
        let pe = 1;
        let e = 0;
        while (rest % q0 === 0) {
          rest /= q0;
          pe *= q0;
          e++;
        }
        const r = sh % pe;
        if (bestExp[q0] === 0) {
          bestExp[q0] = e;
          bestRes[q0] = r;
          touched.push(q0);
        } else if (bestExp[q0] >= e) {
          let m = 1;
          for (let t = 0; t < e; t++) m *= q0;
          if (bestRes[q0] % m !== r) return false;
        } else {
          let m = 1;
          for (let t = 0; t < bestExp[q0]; t++) m *= q0;
          if (r % m !== bestRes[q0]) return false;
          bestExp[q0] = e;
          bestRes[q0] = r;
        }
      }
    }
    for (const q0 of touched) bestExp[q0] = 0;
  }
  return true;
}

function solveCase(n, perms) {
  const seen = new Uint8Array(n);
  // For each prime, the largest exponent among the cycle lengths of any permutation, and which permutation has it.
  const topExp = new Int32Array(MAX_N + 1);
  const owner = new Int32Array(MAX_N + 1).fill(-1);
  const primes = new Set();
  for (let j = 0; j < perms.length; j++) {
    const exps = new Map();
    for (const c of cyclesOf(perms[j], n, seen)) {
      let a = c.length;
      while (a > 1) {
        const q = spf[a];
        let e = 0;
        while (a % q === 0) {
          a /= q;
          e++;
        }
        if ((exps.get(q) ?? 0) < e) exps.set(q, e);
      }
    }
    for (const [q, e] of exps) {
      if (e > topExp[q]) {
        topExp[q] = e;
        owner[q] = j;
        primes.add(q);
      }
    }
  }
  // The order of each permutation that owns a prime, as a BigInt (it can pass 2^64).
  const orders = new Map();
  const orderOf = (j) => {
    if (!orders.has(j)) {
      let l = 1n;
      for (const c of cyclesOf(perms[j], n, seen)) {
        const a = BigInt(c.length);
        l = (l / gcdBig(l, a)) * a;
      }
      orders.set(j, l);
    }
    return orders.get(j);
  };
  let cur = Int32Array.from({ length: n }, (_, i) => i);
  for (const q of primes) {
    const j = owner[q];
    let pe = 1n;
    for (let t = 0; t < topExp[q]; t++) pe *= BigInt(q);
    const r = powerOf(perms[j], n, orderOf(j) / pe, seen);
    const next = new Int32Array(n);
    for (let x = 0; x < n; x++) next[x] = r[cur[x]];
    cur = next;
  }
  return allPowersOf(cur, perms, n, seen) ? cur : null;
}

export function solve(input) {
  const tokens = input.split(/\s+/);
  let pos = tokens[0] === '' ? 1 : 0;
  const t = Number(tokens[pos++]);
  const out = [];
  for (let tc = 0; tc < t; tc++) {
    const n = Number(tokens[pos++]);
    const m = Number(tokens[pos++]);
    const perms = [];
    for (let i = 0; i < m; i++) {
      const p = new Int32Array(n);
      for (let j = 0; j < n; j++) p[j] = Number(tokens[pos++]) - 1;
      perms.push(p);
    }
    const q = solveCase(n, perms);
    out.push(q === null ? '-1' : Array.from(q, (x) => x + 1).join(' '));
  }
  return out.join('\n') + '\n';
}
