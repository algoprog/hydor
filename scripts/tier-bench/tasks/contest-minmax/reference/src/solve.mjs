// Counts the H x W matrices with entries in 1..M whose min over rows of the row maximum equals the max over columns of
// the column minimum, modulo 998244353.
//
// Method: inclusion-exclusion over the "saddle" rows and columns gives the answer as a sum over m = 1..M of f(m), where
//   f(m) = sum_{h=1..H} C(H,h) (-1)^h [ (m^h M^(H-h) - (M+1-m)^(H-h))^W - (m^h M^(H-h))^W ]
// and M inside f is a constant. The sum over m is a polynomial in its upper limit of degree at most H*W + 1, so we
// evaluate it at 0..H*W+1 and interpolate at M. The second part of f has a closed form by the binomial theorem.
const P = 998244353;

// Multiplication modulo P for numbers below P, exact in doubles by splitting the second factor into 15-bit halves.
function mul(a, b) {
  const t = a * (b >>> 15);
  let r = t - Math.floor(t / P) * P;
  if (r < 0) r += P;
  else if (r >= P) r -= P;
  const u = r * 32768 + a * (b & 32767);
  let s = u - Math.floor(u / P) * P;
  if (s < 0) s += P;
  else if (s >= P) s -= P;
  return s;
}

function pow(a, e) {
  let r = 1;
  a %= P;
  while (e > 0) {
    if (e & 1) r = mul(r, a);
    a = mul(a, a);
    e = Math.floor(e / 2);
  }
  return r;
}

const inv = (a) => pow(a, P - 2);

export function solve(input) {
  let [H, W, M] = input.trim().split(/\s+/).map(Number);
  // The problem is symmetric in H and W (transpose, and replace each entry x by M+1-x), so loop over the smaller one.
  if (H > W) [H, W] = [W, H];
  const degree = H * W + 1;
  const points = Math.min(M, degree);

  // Binomials C(H, h) with the sign (-1)^h.
  const coef = new Array(H + 1);
  {
    let c = 1;
    for (let h = 0; h <= H; h++) {
      coef[h] = h % 2 ? (P - c) % P : c;
      c = mul(mul(c, H - h), inv(h + 1));
    }
  }
  const mPow = new Array(H + 1); // M^k
  mPow[0] = 1;
  for (let k = 1; k <= H; k++) mPow[k] = mul(mPow[k - 1], M % P);
  const mW = pow(M, W);

  const powM = new Array(H + 1);
  const powQ = new Array(H + 1);
  // f(m) for one m.
  const f = (m) => {
    const q = (((M + 1 - m) % P) + P) % P;
    powM[0] = 1;
    powQ[0] = 1;
    for (let k = 1; k <= H; k++) {
      powM[k] = mul(powM[k - 1], m);
      powQ[k] = mul(powQ[k - 1], q);
    }
    let total = 0;
    for (let h = 1; h <= H; h++) {
      const a = mul(powM[h], mPow[H - h]);
      let d = a - powQ[H - h];
      if (d < 0) d += P;
      total = (total + mul(coef[h], pow(d, W))) % P;
    }
    // The part with (m^h M^(H-h))^W summed over h = 1..H is (Y - X)^H - Y^H with X = m^W and Y = M^W.
    const x = pow(m, W);
    let y = mW - x;
    if (y < 0) y += P;
    const closed = (pow(y, H) - pow(mW, H) + P) % P;
    return (total - closed + P) % P;
  };

  // F(0..points): prefix sums of f.
  const F = new Array(points + 1);
  F[0] = 0;
  for (let m = 1; m <= points; m++) F[m] = (F[m - 1] + f(m)) % P;
  if (M <= degree) return String(F[M]);

  // Lagrange interpolation through (i, F[i]), i = 0..degree, evaluated at M.
  const n = degree;
  const fact = new Array(n + 1);
  fact[0] = 1;
  for (let i = 1; i <= n; i++) fact[i] = mul(fact[i - 1], i);
  const ifact = new Array(n + 1);
  ifact[n] = inv(fact[n]);
  for (let i = n; i >= 1; i--) ifact[i - 1] = mul(ifact[i], i);
  const prefix = new Array(n + 2);
  const suffix = new Array(n + 2);
  prefix[0] = 1;
  for (let i = 0; i <= n; i++) prefix[i + 1] = mul(prefix[i], (M - i) % P);
  suffix[n + 1] = 1;
  for (let i = n; i >= 0; i--) suffix[i] = mul(suffix[i + 1], (M - i) % P);
  let answer = 0;
  for (let i = 0; i <= n; i++) {
    let term = mul(mul(F[i], mul(prefix[i], suffix[i + 1])), mul(ifact[i], ifact[n - i]));
    if ((n - i) % 2) term = (P - term) % P;
    answer = (answer + term) % P;
  }
  return String(answer);
}
