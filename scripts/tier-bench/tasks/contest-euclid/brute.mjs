// The direct way to answer the problem, for small N only: run the statement's pseudocode as it is, and count the calls
// of f(n, m). Two forms, which agree (gen-cases.mjs checks that): literalCount follows the pseudocode for one (N, n, m);
// countTable gets the number of calls of every f(i, j) at once for one N, by passing the number of times each f(i, j)
// is started down the chain, which is quadratic in N and makes the checker's small cases cheap to build.
// Used on its own, solve(input) is the slow solution that the checker is expected to fail on the large cases.

const MOD = 998244353n;

/** The number of times f(n, m) is called when f(i, j) is run for every 0 <= i <= j <= N (the statement's program). */
export function literalCount(N, n, m) {
  let answer = 0;
  for (let i0 = 0; i0 <= N; i0++) {
    for (let j0 = i0; j0 <= N; j0++) {
      let i = i0;
      let j = j0;
      for (;;) {
        if (i === n && j === m) answer++;
        if (i === 0) break;
        const r = j % i;
        j = i;
        i = r;
      }
    }
  }
  return answer;
}

/** A function (n, m) => the number of calls of f(n, m), for every 0 <= n <= m <= N, from one pass over all pairs. */
export function countTable(N) {
  const w = N + 1;
  const calls = new Float64Array(w * w).fill(0);
  for (let i = 0; i <= N; i++) for (let j = i; j <= N; j++) calls[i * w + j] = 1;
  // f(i, j) with i > 0 makes one call f(j mod i, i): its second argument is smaller than j, except for i = j, where
  // the first argument gets smaller instead, so going down in j and then down in i handles every call before it is used.
  for (let j = N; j >= 1; j--) {
    for (let i = j; i >= 1; i--) {
      const c = calls[i * w + j];
      if (c) calls[(j % i) * w + i] += c;
    }
  }
  return (n, m) => calls[n * w + m];
}

/** The whole output for an input in the problem's format, by running the pseudocode for every test case. */
export function solve(input) {
  const tokens = input.split(/\s+/).filter(Boolean);
  const T = Number(tokens[0]);
  const out = [];
  for (let t = 0; t < T; t++) {
    const N = Number(tokens[1 + 3 * t]);
    const n = Number(tokens[2 + 3 * t]);
    const m = Number(tokens[3 + 3 * t]);
    out.push(String(BigInt(literalCount(N, n, m)) % MOD));
  }
  return out.join('\n') + '\n';
}
