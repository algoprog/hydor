// planCables(points) plans the cables that connect the sensors of a warehouse.
//
// `points` is an array of [x, y] integer coordinates from 0 to 1,000,000, one per sensor (two sensors may share a
// place). A cable between two sensors runs along the aisles, so its length is |dx| + |dy|.
//
// It returns { total, cables }: `cables` is n - 1 pairs [i, j] of indices into `points` that connect all the
// sensors, and `total` is the sum of their lengths, the smallest total any set of cables that connects them can have.
// For 0 or 1 sensors it returns { total: 0, cables: [] }.
export function planCables(points) {
  const n = points.length;
  if (n < 2) return { total: 0, cables: [] };
  // Grow one tree from sensor 0, always adding the sensor closest to the tree.
  const inTree = new Array(n).fill(false);
  const best = new Array(n).fill(Infinity);
  const from = new Array(n).fill(0);
  const cables = [];
  let total = 0;
  let current = 0;
  inTree[0] = true;
  for (let step = 1; step < n; step++) {
    const [cx, cy] = points[current];
    let next = -1;
    for (let i = 0; i < n; i++) {
      if (inTree[i]) continue;
      const d = Math.abs(points[i][0] - cx) + Math.abs(points[i][1] - cy);
      if (d < best[i]) {
        best[i] = d;
        from[i] = current;
      }
      if (next === -1 || best[i] < best[next]) next = i;
    }
    inTree[next] = true;
    total += best[next];
    cables.push([from[next], next]);
    current = next;
  }
  return { total, cables };
}
