// The direct method, for small inputs: try every 0/1 sequence (depth first, left to right) and test the definition.
// A branch stops as soon as some interval already holds more than two 1s, or has no room left to reach two.
export function solve(input) {
  const tokens = input.split(/\s+/).filter(Boolean).map(Number);
  let at = 0;
  const t = tokens[at++];
  const out = [];
  for (let tc = 0; tc < t; tc++) {
    const n = tokens[at++];
    const m = tokens[at++];
    const ls = [];
    const rs = [];
    for (let i = 0; i < m; i++) {
      ls.push(tokens[at++]);
      rs.push(tokens[at++]);
    }
    out.push(exists(n, ls, rs) ? 'Yes' : 'No');
  }
  return out.join('\n') + '\n';
}

function exists(n, ls, rs) {
  const x = new Array(n + 1).fill(0);
  const prefix = new Array(n + 1).fill(0);
  const m = ls.length;
  const go = (p) => {
    if (p > n) return true;
    for (const bit of [0, 1]) {
      x[p] = bit;
      prefix[p] = prefix[p - 1] + bit;
      let ok = true;
      for (let i = 0; i < m && ok; i++) {
        if (ls[i] > p) continue;
        const sofar = prefix[Math.min(p, rs[i])] - prefix[ls[i] - 1];
        const room = rs[i] - Math.min(p, rs[i]);
        if (sofar > 2 || sofar + room < 2) ok = false;
      }
      if (ok && go(p + 1)) return true;
    }
    return false;
  };
  return go(1);
}
