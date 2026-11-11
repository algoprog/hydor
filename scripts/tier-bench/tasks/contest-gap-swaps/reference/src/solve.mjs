// Reads N and the permutation from the input text and returns the least cost as text. The answer is the total
// distance sum of |i - P_i| minus the number of inversions: an operation can lower that difference by 1 at most, and
// there is always one that lowers it by exactly 1. Both parts are summed in O(N log N) (the inversions with a
// Fenwick tree); they stay below 1.3e11, so ordinary numbers hold them exactly.
export function solve(input) {
  const text = String(input);
  const len = text.length;
  let pos = 0;
  const nextInt = () => {
    while (pos < len && (text.charCodeAt(pos) < 48 || text.charCodeAt(pos) > 57)) pos++;
    let v = 0;
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c < 48 || c > 57) break;
      v = v * 10 + (c - 48);
      pos++;
    }
    return v;
  };
  const n = nextInt();
  const tree = new Int32Array(n + 1);
  let distance = 0;
  let inversions = 0;
  for (let i = 1; i <= n; i++) {
    const p = nextInt();
    distance += p > i ? p - i : i - p;
    // Count the earlier values larger than p: i - 1 earlier values in all, minus those not larger than p.
    let notLarger = 0;
    for (let k = p; k > 0; k -= k & -k) notLarger += tree[k];
    inversions += i - 1 - notLarger;
    for (let k = p; k <= n; k += k & -k) tree[k]++;
  }
  return `${distance - inversions}\n`;
}
