// Reads "N K" and the N numbers X_1..X_N, and returns, for k = 1..K, how many distinct sequences k operations can
// give, modulo 998244353, on one line.
//
// Method: a sequence is fixed by how many times each position was used, c_1..c_N, and these counts are possible
// exactly when 0 <= c_i <= 2 c_{i-1} + X_i (with c_0 = 0). So the answer for k is the number of such count lists with
// sum k. Let H(i, m) be the series, up to degree K, of z^(c_1 + ... + c_{i-1} + m c_i) over the valid c_1..c_i. Summing
// the choices of c_i (a geometric series) gives
//   H(i, m) = (H(i-1, 1) - z^(m (X_i + 1)) H(i-1, 2m + 1)) / (1 - z^m),
// so the weights m that appear are 1, 3, 7, ..., 2^j - 1, and only those up to K matter: a larger weight allows only
// c_i = 0, which makes H(i, m) = H(i-1, 1) there. Dividing by 1 - z^m is a running sum with step m, so no
// multiplication is needed and the whole work is N * log K * K additions.
const MOD = 998244353;

export function solve(input) {
  const tokens = input.split(/\s+/).filter(Boolean).map(Number);
  const n = tokens[0];
  const K = tokens[1];
  const x = tokens.slice(2, 2 + n);

  const weights = [];
  for (let m = 1; m <= K; m = 2 * m + 1) weights.push(m);
  const levels = weights.length;

  const one = () => {
    const a = new Int32Array(K + 1);
    a[0] = 1;
    return a;
  };
  // Layer i-1 for every weight, and the plain series (weight 1) of layer i-2.
  let prev = weights.map(one);
  let beforePrev = one();
  let next = weights.map(() => new Int32Array(K + 1));

  for (let i = 1; i <= n; i++) {
    for (let j = 0; j < levels; j++) {
      const m = weights[j];
      const base = prev[0];
      const sub = j + 1 < levels ? prev[j + 1] : beforePrev;
      const shift = m * (x[i - 1] + 1);
      const out = next[j];
      for (let d = 0; d <= K; d++) {
        let v = base[d];
        if (d >= shift) {
          v -= sub[d - shift];
          if (v < 0) v += MOD;
        }
        if (d >= m) {
          v += out[d - m];
          if (v >= MOD) v -= MOD;
        }
        out[d] = v;
      }
    }
    beforePrev = prev[0].slice(); // a copy: the arrays of layer i-1 are reused for layer i+1
    const free = prev;
    prev = next;
    next = free;
  }

  const answers = new Array(K);
  for (let k = 1; k <= K; k++) answers[k - 1] = prev[0][k];
  return answers.join(' ') + '\n';
}
