// How likely each link of the mesh network is to be part of the spanning tree the routing protocol uses.
//
// linkProbabilities(nodes, links) returns an array with one number per link, in the order of `links`: the
// probability that the link is in the tree. The protocol picks a random spanning tree with probability
// proportional to the product of the qualities of its links.
//
// - `nodes` is an array of distinct string ids.
// - A link is { id, a, b, quality }: `a` and `b` are node ids and `quality` is a number above 0.
// - The network is connected. There can be several links between the same two nodes, and a link from a node to
//   itself (no spanning tree contains one).
// - It throws an Error for a link that names a node that is not in `nodes`, or has a quality that is not above 0.
//
// The answer is exact (up to rounding). A link is in a random spanning tree with probability quality times the
// effective resistance between its ends, reading the qualities as conductances (Kirchhoff). One inverse of the
// weighted Laplacian with a node grounded gives the resistance between every pair: R(a, b) = X[a][a] + X[b][b] -
// 2 X[a][b]. A bridge gets 1 and a link from a node to itself gets 0.

export function linkProbabilities(nodes, links) {
  const index = new Map(nodes.map((id, i) => [id, i]));
  const n = nodes.length;
  const ends = links.map((l) => {
    const a = index.get(l.a);
    const b = index.get(l.b);
    if (a === undefined || b === undefined) throw new Error(`link ${l.id} names a node that does not exist`);
    if (!(l.quality > 0)) throw new Error(`link ${l.id} has a quality that is not above 0`);
    return [a, b];
  });
  if (links.length === 0) return [];

  // The Laplacian without its last row and column (the last node is grounded), as one flat array. Qualities are
  // scaled so that the average is 1: the answer does not change, and the numbers stay in a comfortable range.
  const m = n - 1;
  let mean = 0;
  for (const l of links) mean += l.quality;
  mean /= links.length;
  const L = new Float64Array(m * m);
  links.forEach((l, i) => {
    const [a, b] = ends[i];
    if (a === b) return;
    const w = l.quality / mean;
    if (a < m) L[a * m + a] += w;
    if (b < m) L[b * m + b] += w;
    if (a < m && b < m) {
      L[a * m + b] -= w;
      L[b * m + a] -= w;
    }
  });

  // Cholesky: L = C C^T, with C lower triangular, kept in the lower triangle of the same array.
  for (let j = 0; j < m; j++) {
    const rowJ = j * m;
    let d = L[rowJ + j];
    for (let k = 0; k < j; k++) d -= L[rowJ + k] * L[rowJ + k];
    if (!(d > 0)) throw new Error('the network is not connected');
    const diag = Math.sqrt(d);
    L[rowJ + j] = diag;
    for (let i = j + 1; i < m; i++) {
      const rowI = i * m;
      let s = L[rowI + j];
      for (let k = 0; k < j; k++) s -= L[rowI + k] * L[rowJ + k];
      L[rowI + j] = s / diag;
    }
  }

  // The inverse of C (also lower triangular), then X = C^-T C^-1.
  const inv = new Float64Array(m * m);
  for (let j = 0; j < m; j++) {
    inv[j * m + j] = 1 / L[j * m + j];
    for (let i = j + 1; i < m; i++) {
      let s = 0;
      const rowI = i * m;
      for (let k = j; k < i; k++) s += L[rowI + k] * inv[k * m + j];
      inv[rowI + j] = -s / L[rowI + i];
    }
  }
  const X = new Float64Array(m * m);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j <= i; j++) {
      let s = 0;
      for (let k = i; k < m; k++) s += inv[k * m + i] * inv[k * m + j];
      X[i * m + j] = s;
      X[j * m + i] = s;
    }
  }

  const x = (a, b) => (a < m && b < m ? X[a * m + b] : 0);
  return links.map((l, i) => {
    const [a, b] = ends[i];
    if (a === b) return 0;
    const resistance = x(a, a) + x(b, b) - 2 * x(a, b);
    return Math.min(1, (l.quality / mean) * resistance);
  });
}
