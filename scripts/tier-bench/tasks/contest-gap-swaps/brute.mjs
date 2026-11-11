// The definition itself, for small inputs: a breadth-first search from the given permutation over every permutation one
// operation away, until the sorted one is reached. Only for N up to about 9 (it keeps every permutation seen).
// Exports solve(input) like the task asks.
export function solve(input) {
  const tokens = String(input).split(/\s+/).filter(Boolean).map(Number);
  const n = tokens[0];
  const start = tokens.slice(1, 1 + n);
  const key = (p) => p.join(',');
  const goal = key(Array.from({ length: n }, (_, i) => i + 1));
  const seen = new Set([key(start)]);
  let frontier = [start];
  for (let cost = 0; ; cost++) {
    const next = [];
    for (const p of frontier) {
      if (key(p) === goal) return `${cost}\n`;
      for (let i = 0; i < n; i++) {
        // j may go on past i + 1 only while the places between are fixed: P_k = k (1-based, so p[k] === k + 1).
        for (let j = i + 1; j < n; j++) {
          const q = p.slice();
          q[i] = p[j];
          q[j] = p[i];
          const k = key(q);
          if (!seen.has(k)) {
            seen.add(k);
            next.push(q);
          }
          if (p[j] !== j + 1) break;
        }
      }
    }
    frontier = next;
  }
}
