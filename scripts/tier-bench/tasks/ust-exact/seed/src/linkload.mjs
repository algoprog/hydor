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
// The estimate: draw SAMPLES random trees with Wilson's algorithm (random walks with their loops erased, each step
// taking a link with probability proportional to its quality) and count how often each link is in a tree.

const SAMPLES = 20000;

// A small seeded PRNG (mulberry32), so the same network always gives the same estimate.
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function linkProbabilities(nodes, links) {
  const index = new Map(nodes.map((id, i) => [id, i]));
  const n = nodes.length;

  // For each node, the links that leave it, with the running total of their qualities for choosing one.
  const leaving = Array.from({ length: n }, () => ({ link: [], to: [], total: [] }));
  const add = (from, link, to, quality) => {
    const l = leaving[from];
    l.link.push(link);
    l.to.push(to);
    l.total.push((l.total.length ? l.total[l.total.length - 1] : 0) + quality);
  };
  links.forEach((l, i) => {
    const a = index.get(l.a);
    const b = index.get(l.b);
    if (a === undefined || b === undefined) throw new Error(`link ${l.id} names a node that does not exist`);
    if (!(l.quality > 0)) throw new Error(`link ${l.id} has a quality that is not above 0`);
    add(a, i, b, l.quality);
    if (a !== b) add(b, i, a, l.quality);
  });

  // The link a walker standing on `node` takes next.
  const random = prng(12345);
  const step = (node) => {
    const { total } = leaving[node];
    const x = random() * total[total.length - 1];
    let lo = 0;
    let hi = total.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (total[mid] > x) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  };

  const counts = new Array(links.length).fill(0);
  const inTree = new Uint8Array(n);
  const nextLink = new Int32Array(n);
  const nextNode = new Int32Array(n);
  for (let s = 0; s < SAMPLES; s++) {
    inTree.fill(0);
    if (n > 0) inTree[0] = 1;
    for (let start = 1; start < n; start++) {
      // Walk until the tree is reached, remembering only the last link taken from each node (that erases the loops).
      let u = start;
      while (!inTree[u]) {
        const k = step(u);
        nextLink[u] = leaving[u].link[k];
        nextNode[u] = leaving[u].to[k];
        u = nextNode[u];
      }
      u = start;
      while (!inTree[u]) {
        inTree[u] = 1;
        counts[nextLink[u]]++;
        u = nextNode[u];
      }
    }
  }
  return counts.map((c) => c / SAMPLES);
}
