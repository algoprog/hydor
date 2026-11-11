// Counts the sequences by how many operations they need, going backwards from the finished (all-equal) sequences.
//
// One operation keeps the first element and every element equal to the one before it. So the sequences T that one
// operation turns into a given sequence A are made like this: between two neighbours a, b of A put any number j >= 0 of
// new elements x_1..x_j, each different from the one before it (x_1 from a), and the last one equal to b (j = 0 needs
// a = b); after the last element of A put any number of new elements, each different from the one before it.
// So only whether neighbours are equal or different matters, and each pair of neighbours grows on its own: a pair
// becomes j "different" pairs and one "equal" pair, with as many ways as there are such x's.
// With polynomials in z (z counts pairs, so a sequence of length n has n - 1), after k backward steps:
//   X[k] = pairs grown from one equal pair, Y[k] = from one different pair (their value choices counted),
//   Z[k] = what grows after the last element (one element, with the extra elements at its end).
// Ways to go from a to b in j steps that change the value each time: (((K-1)^j + (K-1)(-1)^j)/K when a = b,
// ((K-1)^j - (-1)^j)/K otherwise), so the sums over j are rational functions of Y[k-1], found with series inverses.
// A sequence of length N finished after k operations is K choices of value, m - 1 equal pairs (any m >= 1) and the
// tail: [z^(N-1)] K Z[k] / (1 - X[k]). The answer is the sum over k < N of K^N minus that.
const P = 998244353;
const mul = (a, b) => (((a * (b >>> 16)) % P) * 65536 + a * (b & 65535)) % P;
const pow = (a, e) => {
  let r = 1;
  for (a %= P; e > 0; e >>= 1, a = mul(a, a)) if (e & 1) r = mul(r, a);
  return r;
};

// Product of two series, kept to degree < n.
function times(a, b, n) {
  const c = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (a[i] === 0) continue;
    for (let j = 0; i + j < n; j++) c[i + j] = (c[i + j] + mul(a[i], b[j])) % P;
  }
  return c;
}

// 1 / a as a series to degree < n (a[0] must not be 0).
function inverse(a, n) {
  const inv0 = pow(a[0], P - 2);
  const b = new Array(n).fill(0);
  b[0] = inv0;
  for (let i = 1; i < n; i++) {
    let s = 0;
    for (let j = 1; j <= i; j++) if (j < a.length) s = (s + mul(a[j], b[i - j])) % P;
    b[i] = mul((P - s) % P, inv0);
  }
  return b;
}

export function solve(input) {
  const [N, K] = input.trim().split(/\s+/).map(Number);
  const n = N; // series of degree < N: a sequence of length N has N - 1 pairs
  const invK = pow(K, P - 2);
  const K1 = (K - 1) % P;
  const one = (c) => [c, ...new Array(n - 1).fill(0)];
  const z = new Array(n).fill(0);
  z[1] = 1;
  let X = z.slice();
  let Y = z.slice();
  let Zt = one(1);
  const total = pow(K, N);
  let answer = 0;
  for (let k = 0; k < N; k++) {
    // Sequences of length N finished after k operations.
    const inv = inverse(X.map((c, i) => (i === 0 ? 1 : (P - c) % P)), n);
    const finished = mul(K, times(Zt, inv, n)[N - 1]);
    answer = (answer + total - finished + P) % P;
    // Step k -> k + 1.
    const g = inverse(Y.map((c, i) => (i === 0 ? 1 : mul(c, (P - K1) % P))), n); // 1 / (1 - (K-1) Y)
    const h = inverse(Y.map((c, i) => (i === 0 ? 1 : c)), n); // 1 / (1 + Y)
    const aE = new Array(n);
    const aD = new Array(n);
    for (let i = 0; i < n; i++) {
      aE[i] = mul(invK, (g[i] + mul(K1, h[i])) % P);
      aD[i] = mul(invK, (g[i] - h[i] + P) % P);
    }
    const nextX = times(X, aE, n);
    const nextY = times(X, aD, n);
    Zt = times(Zt, g, n);
    X = nextX;
    Y = nextY;
  }
  return `${answer}\n`;
}
