// A second independent check for middle-sized inputs (where the brute force is too slow): count the lists of use
// counts c_1..c_N with 0 <= c_i <= 2 c_{i-1} + X_i directly, by dynamic programming over (last count, sum so far).
// It takes about N * K^2 steps, so it only suits K up to a few thousand.
const MOD = 998244353;

export function solve(input) {
  const tokens = input.split(/\s+/).filter(Boolean).map(Number);
  const n = tokens[0];
  const K = tokens[1];
  const x = tokens.slice(2, 2 + n);
  // f[c][s]: lists so far whose last count is c and whose sum is s (c <= s <= K).
  let f = Array.from({ length: K + 1 }, () => new Int32Array(K + 1));
  f[0][0] = 1; // the empty list: c_0 = 0
  for (let i = 0; i < n; i++) {
    // up[c][s]: lists with last count >= c, so the next count c' can follow when 2 c + X >= c', that is c >= ceil((c' - X) / 2).
    const up = Array.from({ length: K + 2 }, () => new Int32Array(K + 1));
    for (let c = K; c >= 0; c--) {
      for (let s = 0; s <= K; s++) {
        const v = up[c + 1][s] + f[c][s];
        up[c][s] = v >= MOD ? v - MOD : v;
      }
    }
    const g = Array.from({ length: K + 1 }, () => new Int32Array(K + 1));
    for (let c2 = 0; c2 <= K; c2++) {
      const from = Math.max(0, Math.ceil((c2 - x[i]) / 2));
      if (from > K) continue;
      for (let s = 0; s + c2 <= K; s++) g[c2][s + c2] = up[from][s];
    }
    f = g;
  }
  const answers = new Array(K).fill(0);
  for (let c = 0; c <= K; c++) for (let s = 1; s <= K; s++) answers[s - 1] = (answers[s - 1] + f[c][s]) % MOD;
  return answers.join(' ') + '\n';
}
