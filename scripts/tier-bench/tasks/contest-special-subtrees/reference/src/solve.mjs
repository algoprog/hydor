// Counts the special subtrees of each tree in the input (see PROBLEM.md), modulo 998244353.
//
// A tree is special exactly when each edge can be given the degree its ends have when it is deleted, and then the
// edges at a vertex of degree d carry the numbers 1..d, each once (and then the numbers are unique). Root the tree and
// let dp[v][k] be the number of ways to pick a subtree of v's subtree that contains v and the edge to its parent, with
// k on that edge. The children chosen at v carry distinct numbers, which together with k fill 1..(children + 1); a
// bitmask over the numbers used by the children counts them. An edge numbered k needs 2^(k-1) vertices below it, so
// the numbers stay below 20 and the masks stay small. Children are taken in order of their largest number so a mask
// is only as wide as the child being added needs.
const P = 998244353;

// a * b mod P for a, b below 2^30, using only exact double arithmetic.
function mul(a, b) {
  return ((((a * (b >>> 15)) % P) * 32768) + a * (b & 32767)) % P;
}

// The masks of the largest vertex fit in this (the numbers stay below 20), and it is reused for every vertex and tree.
const g = new Int32Array(1 << 21);

function solveOne(n, head, next, to) {
  // Order the vertices from the root 1 so that every parent comes before its children (no recursion: paths are deep).
  const parent = new Int32Array(n + 1);
  const order = new Int32Array(n);
  let qh = 0;
  let qt = 0;
  order[qt++] = 1;
  while (qh < qt) {
    const v = order[qh++];
    for (let e = head[v]; e !== -1; e = next[e]) {
      const u = to[e];
      if (u !== parent[v]) {
        parent[u] = v;
        order[qt++] = u;
      }
    }
  }
  const dp = new Array(n + 1).fill(null); // dp[v][k] for k = 1..M_v (index 0 unused)
  let answer = 0;
  const kids = [];
  for (let i = n - 1; i >= 0; i--) {
    const v = order[i];
    kids.length = 0;
    for (let e = head[v]; e !== -1; e = next[e]) if (to[e] !== parent[v]) kids.push(dp[to[e]]);
    kids.sort((a, b) => a.length - b.length);
    // g[mask] = ways for the chosen children so far to carry exactly the numbers in mask (bit k-1 is number k).
    let L = 0;
    g[0] = 1;
    for (const d of kids) {
      const M = d.length - 1;
      if (M > L) {
        g.fill(0, 1 << L, 1 << M);
        L = M;
      }
      for (let mask = (1 << L) - 1; mask >= 1; mask--) {
        let acc = g[mask];
        for (let m = mask; m !== 0; m &= m - 1) {
          const low = m & -m;
          const k = 32 - Math.clz32(low);
          const w = d[k];
          if (w !== 0) {
            const x = g[mask ^ low];
            if (x !== 0) acc = (acc + mul(x, w)) % P;
          }
        }
        g[mask] = acc;
      }
    }
    // The vertex as the top of a subtree: its children carry exactly 1..j.
    for (let j = 0; j <= L; j++) answer = (answer + g[(1 << j) - 1]) % P;
    // The vertex below an edge numbered k: its children carry 1..j except k, for some j >= k.
    const out = new Array(L + 2).fill(0);
    for (let k = 1; k <= L + 1; k++) {
      let s = k === L + 1 ? g[(1 << L) - 1] : 0;
      for (let j = k; j <= L; j++) s = (s + g[((1 << j) - 1) ^ (1 << (k - 1))]) % P;
      out[k] = s;
    }
    let top = L + 1;
    while (top > 1 && out[top] === 0) top--;
    out.length = top + 1;
    dp[v] = out;
    for (let e = head[v]; e !== -1; e = next[e]) if (to[e] !== parent[v]) dp[to[e]] = null;
  }
  return answer;
}

export function solve(input) {
  // Read all the numbers at once.
  const nums = [];
  let x = -1;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    if (c >= 48 && c <= 57) x = (x < 0 ? 0 : x * 10) + (c - 48);
    else if (x >= 0) {
      nums.push(x);
      x = -1;
    }
  }
  if (x >= 0) nums.push(x);
  let p = 0;
  const t = nums[p++];
  const out = [];
  for (let c = 0; c < t; c++) {
    const n = nums[p++];
    const head = new Int32Array(n + 1).fill(-1);
    const next = new Int32Array(2 * (n - 1));
    const to = new Int32Array(2 * (n - 1));
    for (let i = 0; i < n - 1; i++) {
      const u = nums[p++];
      const v = nums[p++];
      to[2 * i] = v;
      next[2 * i] = head[u];
      head[u] = 2 * i;
      to[2 * i + 1] = u;
      next[2 * i + 1] = head[v];
      head[v] = 2 * i + 1;
    }
    out.push(solveOne(n, head, next, to));
  }
  return out.join('\n') + '\n';
}
