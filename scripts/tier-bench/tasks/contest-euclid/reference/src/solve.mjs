// Counts the calls of f(n, m) for every test case of the input (see PROBLEM.md).
//
// Going back along the Euclidean algorithm from f(n, m), every call f(i, j) that leads to f(n, m) can be written
// (i, j) = (a n + b m, c n + d m) with a 2 by 2 matrix [[a, b], [c, d]] that starts as the identity and, one step back,
// goes from rows (r1, r2) to (r2, k r2 + r1). Along the way the determinant stays +1 or -1, 1 <= c <= d and
// gcd(c, d) = 1 (after the first step), and 0 <= a <= c, 1 <= b <= d. Each such (c, d) other than (1, 1) has exactly two
// matrices: one with determinant 1 and one with determinant -1, and a <= c, b <= d make i <= N follow from j <= N.
// So for n >= 1 the answer is
//   1 (f(n, m) itself) + [n + m <= N] ((c, d) = (1, 1), with (a, b) = (0, 1))
//   + 2 * #{ (c, d) != (1, 1) : 1 <= c <= d, gcd(c, d) = 1, c n + d m <= N }.
// With S the number of coprime pairs (c, d) in all, (1, 1) included, that is 1 + 2 S - [n + m <= N].
// To count them, d goes from 1 to floor(N / m) (the sum of these is at most 1e6): for each d the c are the integers up
// to x = min(d, floor((N - d m) / n)) that share no prime with d, which inclusion-exclusion over d's primes counts.
// For d with d (n + m) <= N, x = d and the count is Euler's phi(d), from a running sum.
// For n = 0, f(0, m) is called by (0, m) and by every pair whose greatest common divisor is m: 1 + the sum of phi(j)
// for j up to floor(N / m).

const MOD = 998244353n;

/** The output for the whole input: one line per test case. */
export function solve(input) {
  const tokens = input.split(/\s+/).filter(Boolean);
  const T = Number(tokens[0]);
  const cases = [];
  let maxK = 1;
  for (let t = 0; t < T; t++) {
    const N = BigInt(tokens[1 + 3 * t]);
    const n = BigInt(tokens[2 + 3 * t]);
    const m = BigInt(tokens[3 + 3 * t]);
    const K = Number(N / m);
    if (K > maxK) maxK = K;
    cases.push([N, n, m, K]);
  }

  // The smallest prime factor of every number up to maxK, and the prefix sums of Euler's phi.
  const spf = new Int32Array(maxK + 1);
  const phi = new Int32Array(maxK + 1);
  const primes = [];
  phi[1] = 1;
  for (let i = 2; i <= maxK; i++) {
    if (spf[i] === 0) {
      spf[i] = i;
      phi[i] = i - 1;
      primes.push(i);
    }
    for (const p of primes) {
      const v = i * p;
      if (p > spf[i] || v > maxK) break;
      spf[v] = p;
      phi[v] = i % p === 0 ? phi[i] * p : phi[i] * (p - 1);
    }
  }
  const phiSum = new Float64Array(maxK + 1);
  for (let i = 1; i <= maxK; i++) phiSum[i] = phiSum[i - 1] + phi[i];

  // How many of 1..x share no prime with d, given d's distinct primes in ps (at most 7 of them).
  const ps = new Int32Array(8);
  const coprimeUpTo = (x, d) => {
    let k = 0;
    for (let v = d; v > 1; ) {
      const p = spf[v];
      ps[k++] = p;
      while (v % p === 0) v = v / p;
    }
    let total = 0;
    for (let mask = 0; mask < 1 << k; mask++) {
      let prod = 1;
      let sign = 1;
      for (let b = 0; b < k; b++) {
        if (mask & (1 << b)) {
          prod *= ps[b];
          sign = -sign;
        }
      }
      total += sign * Math.floor(x / prod);
    }
    return total;
  };

  const out = new Array(T);
  for (let t = 0; t < T; t++) {
    const [N, n, m, K] = cases[t];
    if (n === 0n) {
      out[t] = String((1n + BigInt(phiSum[K])) % MOD);
      continue;
    }
    // The d with d (n + m) <= N have x = d; for the rest x = floor((N - d m) / n), which is below d.
    const full = Math.min(K, Number(N / (n + m)));
    let S = phiSum[full];
    for (let d = full + 1; d <= K; d++) {
      const x = Number((N - BigInt(d) * m) / n);
      if (x >= 1) S += coprimeUpTo(x, d);
    }
    const extra = n + m <= N ? 1n : 0n;
    out[t] = String((1n + 2n * BigInt(S) - extra) % MOD);
  }
  return out.join('\n') + '\n';
}
