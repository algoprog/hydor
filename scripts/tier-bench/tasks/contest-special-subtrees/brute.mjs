// The definition itself, for small trees (up to about 20 vertices): node brute.mjs < input. For every set of edges of the
// tree it decides by the operation's own rules whether all of them can be deleted (a set is deletable when some edge in it
// joins two vertices of equal degree in that set and the set without that edge is deletable), and counts the connected
// non-empty sets, plus one per vertex for the subtrees of a single vertex.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export function bruteOne(n, edges) {
  const m = edges.length;
  const ok = new Uint8Array(1 << m);
  ok[0] = 1;
  const deg = new Int32Array(n + 1);
  let count = n;
  for (let mask = 1; mask < 1 << m; mask++) {
    deg.fill(0);
    let touched = 0;
    for (let i = 0; i < m; i++)
      if (mask & (1 << i)) {
        if (deg[edges[i][0]]++ === 0) touched++;
        if (deg[edges[i][1]]++ === 0) touched++;
      }
    let good = 0;
    for (let i = 0; i < m && !good; i++)
      if (mask & (1 << i) && deg[edges[i][0]] === deg[edges[i][1]] && ok[mask ^ (1 << i)]) good = 1;
    ok[mask] = good;
    // A set of edges of a tree is connected when it touches one vertex more than it has edges.
    let size = 0;
    for (let x = mask; x; x &= x - 1) size++;
    if (good && touched === size + 1) count++;
  }
  return count;
}

export function brute(input) {
  const nums = input.split(/\s+/).filter(Boolean).map(Number);
  let p = 0;
  const t = nums[p++];
  const out = [];
  for (let c = 0; c < t; c++) {
    const n = nums[p++];
    const edges = [];
    for (let i = 0; i < n - 1; i++) edges.push([nums[p++], nums[p++]]);
    out.push(bruteOne(n, edges));
  }
  return out.join('\n') + '\n';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.stdout.write(brute(fs.readFileSync(0, 'utf8')));
