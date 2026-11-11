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

  const { from, to, weight, count } = candidateEdges(points);

  // Kruskal on the candidates: the shortest first, joining the groups that are still apart.
  const order = new Uint32Array(count);
  for (let i = 0; i < count; i++) order[i] = i;
  order.sort((a, b) => weight[a] - weight[b]);
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (v) => {
    while (parent[v] !== v) {
      parent[v] = parent[parent[v]];
      v = parent[v];
    }
    return v;
  };
  const cables = [];
  let total = 0;
  for (let k = 0; k < count && cables.length < n - 1; k++) {
    const e = order[k];
    const a = find(from[e]);
    const b = find(to[e]);
    if (a === b) continue;
    parent[a] = b;
    total += weight[e];
    cables.push([from[e], to[e]]);
  }
  return { total, cables };
}

// The edges that can be in a shortest tree. A sensor needs only a cable to the nearest sensor in each of the eight
// slices around it (cut at 45 degrees), so every pair of sensors is looked at from four directions, each one a sweep
// over the sensors in a transformed frame in which the slice is "right of me and above the diagonal through me".
function candidateEdges(points) {
  const n = points.length;
  const from = new Int32Array(4 * n);
  const to = new Int32Array(4 * n);
  const weight = new Float64Array(4 * n);
  let count = 0;

  const xs = new Int32Array(n);
  const ys = new Int32Array(n);
  const order = new Uint32Array(n);
  const diag = new Int32Array(n);
  const rank = new Int32Array(n);
  const treeKey = new Float64Array(n + 1);
  const treeId = new Int32Array(n + 1);

  // The four frames: each maps (x, y) to the coordinates in which the slice to look at is dx >= 0 and dy >= dx.
  const frames = [
    (x, y) => [x, y],
    (x, y) => [y, x],
    (x, y) => [-x, y],
    (x, y) => [-y, x],
  ];
  for (const frame of frames) {
    for (let i = 0; i < n; i++) {
      const [x, y] = frame(points[i][0], points[i][1]);
      xs[i] = x;
      ys[i] = y;
      diag[i] = y - x;
      order[i] = i;
    }
    // The ranks of y - x, equal values sharing one rank, the largest first.
    const byDiag = Array.from(order).sort((a, b) => diag[b] - diag[a]);
    let r = 0;
    for (let k = 0; k < n; k++) {
      if (k > 0 && diag[byDiag[k]] !== diag[byDiag[k - 1]]) r++;
      rank[byDiag[k]] = r + 1;
    }
    const ranks = r + 1;
    treeKey.fill(Infinity, 0, ranks + 1);
    treeId.fill(-1, 0, ranks + 1);

    // Sweep from the largest x down, and the largest y first among equal x, so that everything in the slice of a
    // sensor (right of it or straight above it, and above its diagonal) has been put in the tree when it comes.
    order.sort((a, b) => xs[b] - xs[a] || ys[b] - ys[a]);
    for (let k = 0; k < n; k++) {
      const i = order[k];
      // The smallest x + y among the sensors put in so far whose y - x is at least this one's: a prefix by rank.
      let bestKey = Infinity;
      let bestId = -1;
      for (let p = rank[i]; p > 0; p -= p & -p) {
        if (treeKey[p] < bestKey) {
          bestKey = treeKey[p];
          bestId = treeId[p];
        }
      }
      if (bestId >= 0) {
        from[count] = i;
        to[count] = bestId;
        weight[count] = bestKey - (xs[i] + ys[i]);
        count++;
      }
      const key = xs[i] + ys[i];
      for (let p = rank[i]; p <= ranks; p += p & -p) {
        if (key < treeKey[p]) {
          treeKey[p] = key;
          treeId[p] = i;
        }
      }
    }
  }
  return { from, to, weight, count };
}
