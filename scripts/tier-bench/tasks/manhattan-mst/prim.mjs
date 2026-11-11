// The smallest total length of cable that connects the points, by Prim's algorithm over every pair (O(n^2)): the
// checker's own way of knowing the answer for the small cases. Plain typed arrays, so 3,000 points take milliseconds.
export function primTotal(points) {
  const n = points.length;
  if (n < 2) return 0;
  const xs = new Int32Array(n);
  const ys = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = points[i][0];
    ys[i] = points[i][1];
  }
  const best = new Float64Array(n).fill(Infinity);
  const done = new Uint8Array(n);
  best[0] = 0;
  let total = 0;
  for (let step = 0; step < n; step++) {
    let v = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (v < 0 || best[i] < best[v])) v = i;
    done[v] = 1;
    total += best[v];
    const vx = xs[v];
    const vy = ys[v];
    for (let i = 0; i < n; i++) {
      if (done[i]) continue;
      const d = Math.abs(xs[i] - vx) + Math.abs(ys[i] - vy);
      if (d < best[i]) best[i] = d;
    }
  }
  return total;
}

// Why these cables are not a spanning tree of the points whose lengths add up to total, or '' when they are.
export function treeProblem(points, answer) {
  if (!answer || typeof answer !== 'object') return `returned ${JSON.stringify(answer)}, not { total, cables }`;
  const { total, cables } = answer;
  const n = points.length;
  if (typeof total !== 'number' || !Number.isFinite(total)) return `total is ${JSON.stringify(total)}, not a number`;
  if (!Array.isArray(cables)) return 'cables is not an array';
  if (cables.length !== Math.max(0, n - 1)) return `${cables.length} cables for ${n} sensors, not ${Math.max(0, n - 1)}`;
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (v) => {
    while (parent[v] !== v) {
      parent[v] = parent[parent[v]];
      v = parent[v];
    }
    return v;
  };
  let sum = 0;
  for (const c of cables) {
    if (!Array.isArray(c) || c.length !== 2) return `a cable is ${JSON.stringify(c)}, not a pair [i, j]`;
    const [i, j] = c;
    if (!Number.isInteger(i) || !Number.isInteger(j) || i < 0 || j < 0 || i >= n || j >= n) return `a cable ${JSON.stringify(c)} names a sensor that does not exist`;
    const a = find(i);
    const b = find(j);
    if (a === b) return `the cable ${JSON.stringify(c)} joins sensors that are already connected`;
    parent[a] = b;
    sum += Math.abs(points[i][0] - points[j][0]) + Math.abs(points[i][1] - points[j][1]);
  }
  if (sum !== total) return `the cables add up to ${sum}, but total says ${total}`;
  return '';
}
