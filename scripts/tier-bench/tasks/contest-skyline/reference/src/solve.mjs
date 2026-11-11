// Counts the height sequences that give the visible counts C_1 .. C_{N-1}.
//
// The tallest building splits the row in two; a position's count is the count inside its own side plus one for the
// tallest. So with C_0 and C_N added (what is seen from the two ends), the counts of the N + 1 gaps are the depths of
// the leaves of a full binary tree whose N inner nodes are the buildings, and the leaves' depths must satisfy
// sum 2^-C = 1. A list of depths gives at most one such tree, found with a stack that joins two equal depths on
// top into one of depth - 1. The heights that give a tree number N! / (product of the inner nodes' subtree sizes).
// C_0 and C_N are not given, but 2^-C_0 + 2^-C_N = 1 - sum 2^-C_x has at most two solutions, found from the bits of
// that number (as an exact binary fraction, the depths go up to N).
const MOD = 998244353;

const mul = (a, b) => ((a * (b >>> 16)) % MOD * 65536 + a * (b & 65535)) % MOD;

export function solve(input) {
  const tokens = input.split(/\s+/).filter(Boolean);
  const N = Number(tokens[0]);
  const C = new Int32Array(N + 1);
  for (let i = 1; i < N; i++) C[i] = Number(tokens[i]);

  // The sum of 2^-C_x as a binary fraction: bit[j] is the coefficient of 2^-j, carried from the deepest up.
  const bit = new Int32Array(N + 2);
  for (let i = 1; i < N; i++) bit[C[i]]++;
  for (let j = N; j >= 1; j--) {
    bit[j - 1] += bit[j] >> 1;
    bit[j] &= 1;
  }
  if (bit[0] > 0) return '0\n';
  // 1 - sum: from the lowest set bit p upward the bits are flipped, and bit p stays.
  let p = N;
  while (p >= 1 && bit[p] === 0) p--;
  const ones = [];
  for (let j = 1; j <= p; j++) if (j === p ? true : bit[j] === 0) ones.push(j);
  if (ones.length > 2) return '0\n';

  const candidates = ones.length === 1 ? [[ones[0] + 1, ones[0] + 1]] : [[ones[0], ones[1]], [ones[1], ones[0]]];

  const inv = new Int32Array(N + 2);
  inv[1] = 1;
  for (let i = 2; i <= N; i++) inv[i] = mul(MOD - Math.floor(MOD / i), inv[MOD % i]);
  let fact = 1;
  for (let i = 2; i <= N; i++) fact = mul(fact, i);

  const depth = new Int32Array(N + 2);
  const size = new Int32Array(N + 2);
  let total = 0;
  for (const [a, b] of candidates) {
    C[0] = a;
    C[N] = b;
    let top = 0;
    let ways = fact;
    let ok = true;
    for (let i = 0; i <= N && ok; i++) {
      depth[top] = C[i];
      size[top++] = 0;
      while (top >= 2 && depth[top - 1] === depth[top - 2]) {
        if (depth[top - 1] === 0) {
          ok = false;
          break;
        }
        // Two sibling subtrees join under a new building: it is a subtree of their buildings plus itself.
        const s = size[top - 1] + size[top - 2] + 1;
        top--;
        depth[top - 1]--;
        size[top - 1] = s;
        ways = mul(ways, inv[s]);
      }
    }
    if (ok && top === 1 && depth[0] === 0) total = (total + ways) % MOD;
  }
  return `${total}\n`;
}
