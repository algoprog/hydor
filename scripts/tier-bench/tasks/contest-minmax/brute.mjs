// The definition itself: tries every matrix with entries in 1..M and counts those where the smallest row maximum
// equals the largest column minimum. Only for tiny inputs (M^(H*W) matrices). Used by the checker's expected answers
// and by the proof that the reference is right.
export function brute(H, W, M) {
  const n = H * W;
  const a = new Array(n).fill(1);
  let count = 0;
  for (;;) {
    let minOfMax = Infinity;
    for (let i = 0; i < H; i++) {
      let mx = 0;
      for (let j = 0; j < W; j++) if (a[i * W + j] > mx) mx = a[i * W + j];
      if (mx < minOfMax) minOfMax = mx;
    }
    let maxOfMin = 0;
    for (let j = 0; j < W; j++) {
      let mn = Infinity;
      for (let i = 0; i < H; i++) if (a[i * W + j] < mn) mn = a[i * W + j];
      if (mn > maxOfMin) maxOfMin = mn;
    }
    if (minOfMax === maxOfMin) count++;
    // Next matrix, like adding one to a number written in base M.
    let k = 0;
    while (k < n && a[k] === M) a[k++] = 1;
    if (k === n) break;
    a[k]++;
  }
  return count % 998244353;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  const [H, W, M] = text.trim().split(/\s+/).map(Number);
  console.log(String(brute(H, W, M)));
}
