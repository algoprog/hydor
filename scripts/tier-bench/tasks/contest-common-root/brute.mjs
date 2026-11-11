// The most direct method, for small N (up to 8): try every permutation Q, compute its powers by the definition
// (start from the identity and apply Q again and again until the identity comes back), and see whether every given
// permutation is among them. Independent of the reference.
export function solve(input) {
  const tokens = input.split(/\s+/).filter(Boolean).map(Number);
  let pos = 0;
  const t = tokens[pos++];
  const cache = new Map(); // n -> list of { q, powers: Set of strings }
  const allQ = (n) => {
    if (cache.has(n)) return cache.get(n);
    const list = [];
    const used = new Array(n + 1).fill(false);
    const cur = [];
    const rec = () => {
      if (cur.length === n) {
        const q = cur.slice();
        const powers = new Set();
        let r = q.map((_, i) => i + 1);
        do {
          powers.add(r.join(','));
          r = r.map((x) => q[x - 1]);
        } while (r.some((x, i) => x !== i + 1));
        list.push({ q, powers });
        return;
      }
      for (let v = 1; v <= n; v++) {
        if (used[v]) continue;
        used[v] = true;
        cur.push(v);
        rec();
        cur.pop();
        used[v] = false;
      }
    };
    rec();
    cache.set(n, list);
    return list;
  };
  const out = [];
  for (let c = 0; c < t; c++) {
    const n = tokens[pos++];
    const m = tokens[pos++];
    const keys = [];
    for (let i = 0; i < m; i++) {
      keys.push(tokens.slice(pos, pos + n).join(','));
      pos += n;
    }
    const found = allQ(n).find(({ powers }) => keys.every((k) => powers.has(k)));
    out.push(found ? found.q.join(' ') : '-1');
  }
  return out.join('\n') + '\n';
}
