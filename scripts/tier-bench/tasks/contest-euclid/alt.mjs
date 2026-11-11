// A second way to the same answers, used only by gen-expected.mjs to check the reference on inputs too large for the brute
// force: count the coprime pairs (c, d), 1 <= c <= d, c n + d m <= N by Moebius inversion over their common divisor g, where
// each term is a lattice-point count that a floor sum gives (in BigInt, as N goes to 1e18). That is slower than the
// reference, by a good deal on the largest inputs, but shares nothing with it except the count of what the pairs are.

const MOD = 998244353n;

/** The sum of floor((a i + b) / m) for i from 0 to n - 1, for non-negative BigInt n, m, a, b. */
function floorSum(n, m, a, b) {
  let ans = 0n;
  for (;;) {
    if (a >= m) {
      ans += (n * (n - 1n) / 2n) * (a / m);
      a %= m;
    }
    if (b >= m) {
      ans += n * (b / m);
      b %= m;
    }
    const yMax = a * n + b;
    if (yMax < m) break;
    n = yMax / m;
    b = yMax % m;
    [m, a] = [a, m];
  }
  return ans;
}

/** The number of (c, e) with c >= 1, e >= 0 and c (n + m) + e m <= M. */
function lattice(M, n, m) {
  const s = n + m;
  const C = M / s;
  if (C === 0n) return 0n;
  return C + floorSum(C, m, s, M - C * s);
}

export function solve(input) {
  const tokens = input.split(/\s+/).filter(Boolean);
  const T = Number(tokens[0]);
  const out = [];
  let mu = [0, 1];
  for (let t = 0; t < T; t++) {
    const N = BigInt(tokens[1 + 3 * t]);
    const n = BigInt(tokens[2 + 3 * t]);
    const m = BigInt(tokens[3 + 3 * t]);
    const G = Number(N / (n + m));
    while (mu.length <= G) {
      // The Moebius function, extended by trial division when more is needed (the inputs here are modest).
      const x = mu.length;
      let v = x;
      let sign = 1;
      for (let p = 2; p * p <= v; p++) {
        if (v % p === 0) {
          v /= p;
          if (v % p === 0) {
            sign = 0;
            break;
          }
          sign = -sign;
        }
      }
      if (sign !== 0 && v > 1) sign = -sign;
      mu.push(sign);
    }
    let S = 0n;
    for (let g = 1; g <= G; g++) if (mu[g] !== 0) S += BigInt(mu[g]) * lattice(N / BigInt(g), n, m);
    const answer = n === 0n ? 1n + S : 1n + 2n * S - (n + m <= N ? 1n : 0n);
    out.push(String(answer % MOD));
  }
  return out.join('\n') + '\n';
}
