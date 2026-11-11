// Proves the reference: node prove.mjs. It compares it with brute.mjs on every (H, W, M) with M^(H*W) up to 2e6, with the
// plain triple sum on 2,500 random inputs (M above and below H*W+1), and with itself on swapped H and W.
import { solve } from './reference/src/solve.mjs';
import { brute } from './brute.mjs';
const P = 998244353n;
const pw = (a, e) => { let r = 1n; a %= P; if (a<0n) a+=P; let E = BigInt(e); while (E > 0n) { if (E & 1n) r = r * a % P; a = a * a % P; E >>= 1n; } return r; };
// Binomials
const C = (n, k) => { let r = 1n; for (let i = 0; i < k; i++) r = r * BigInt(n - i) / BigInt(i + 1); return r; };
function formula(H, W, M) { // the triple sum of the editorial, directly, M up to a few hundred
  let s = 0n;
  for (let h = 1; h <= H; h++) for (let w = 1; w <= W; w++) {
    let t = 0n;
    for (let m = 1; m <= M; m++) t += pw(BigInt(m), h * (W - w)) * pw(BigInt(M + 1 - m), (H - h) * w) % P;
    t = t % P * pw(BigInt(M), (H - h) * (W - w)) % P * (C(H, h) * C(W, w) % P) % P;
    s += (h + w) % 2 ? -t : t;
  }
  return String(((s % P) + P) % P);
}
let seed = 12345; const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return Math.floor(seed / 2147483648 * n); };
let nb = 0, nf = 0, bad = 0;
// every (H, W, M) whose M^(H*W) is at most 2e6
for (let H = 1; H <= 21; H++) for (let W = 1; W <= 21; W++) for (let M = 1; M <= 2000; M++) {
  if (H * W * Math.log(M) > Math.log(2e6)) break;
  nb++; const a = solve(`${H} ${W} ${M}`), b = String(brute(H, W, M));
  if (a !== b) { bad++; console.log('BRUTE MISMATCH', H, W, M, a, b); }
}
console.log('brute comparisons', nb);
// formula vs reference: both branches of M vs H*W+1
for (let it = 0; it < 2500; it++) {
  const H = 1 + rnd(10), W = 1 + rnd(10), M = 1 + rnd(it % 2 ? 40 : 120);
  nf++; const a = solve(`${H} ${W} ${M}`), b = formula(H, W, M);
  if (a !== b) { bad++; console.log('FORMULA MISMATCH', H, W, M, a, b); }
}
// symmetry
for (let it = 0; it < 100; it++) {
  const H = 1 + rnd(30), W = 1 + rnd(30), M = 1 + rnd(1e8);
  if (solve(`${H} ${W} ${M}`) !== solve(`${W} ${H} ${M}`)) { bad++; console.log('ASYM', H, W, M); }
}
console.log('formula comparisons', nf, 'bad', bad);
