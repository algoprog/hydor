// Tree generators shared by make-cases.mjs, prove.mjs and check.mjs: every tree comes from a seeded PRNG, so the large
// inputs need not be stored. A tree is a list of edges [u, v] with u < v, in random order, on randomly numbered vertices
// (or with the first vertex of the shape numbered 1 when `rootFirst` is set: the shapes below start at their own root).

export function prng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)) };
}

// Each shape returns parent[i] for vertices 0..n-1 (parent[0] = -1, parent[i] < i).
const shapes = {
  path: (n) => Array.from({ length: n }, (_, i) => i - 1),
  star: (n) => Array.from({ length: n }, (_, i) => (i === 0 ? -1 : 0)),
  // Each new vertex hangs on a uniformly random earlier one.
  random: (n, r) => Array.from({ length: n }, (_, i) => (i === 0 ? -1 : r.int(0, i - 1))),
  // Each new vertex hangs on one of the last few: long and thin.
  deep: (n, r, o) => Array.from({ length: n }, (_, i) => (i === 0 ? -1 : r.int(Math.max(0, i - (o.window ?? 4)), i - 1))),
  // Each new vertex hangs on a vertex chosen by how many neighbours it has already: a few big hubs.
  hubs: (n, r) => {
    const parent = [-1];
    const ends = [0];
    for (let i = 1; i < n; i++) {
      const p = ends[r.int(0, ends.length - 1)];
      parent.push(p);
      ends.push(p, i);
    }
    return parent;
  },
  // A path with a few leaves on each of its vertices.
  caterpillar: (n, r, o) => {
    const spine = Math.max(1, Math.floor(n / (o.legs ?? 2)));
    return Array.from({ length: n }, (_, i) => (i === 0 ? -1 : i < spine ? i - 1 : r.int(0, spine - 1)));
  },
  // Every vertex has k children, level by level.
  kary: (n, r, o) => Array.from({ length: n }, (_, i) => (i === 0 ? -1 : Math.floor((i - 1) / (o.k ?? 2)))),
  // The binomial tree of 2^k vertices (vertex i hangs on i without its lowest bit), then the rest of the n vertices as
  // leaves on random vertices of it (or on its root when `onRoot`).
  binomial: (n, r, o) => {
    const size = 1 << o.k;
    return Array.from({ length: n }, (_, i) => (i === 0 ? -1 : i < size ? i & (i - 1) : o.onRoot ? 0 : r.int(0, size - 1)));
  },
  // A hub with one large binomial tree and then leaves on the hub: the children of the hub differ widely in size.
  hubBig: (n, r, o) => {
    const size = 1 << o.k;
    return Array.from({ length: n }, (_, i) => {
      if (i === 0) return -1;
      if (i > size) return 0;
      const j = i - 1;
      return j === 0 ? 0 : 1 + (j & (j - 1));
    });
  },
  // A hub whose children are binomial trees of the sizes 2^1, 2^2, ... (each size used `times` times), then leaves.
  hubBinomials: (n, r, o) => {
    const parent = [-1];
    const times = o.times ?? 1;
    outer: for (let round = 0; ; round++)
      for (let k = o.kmax; k >= 0; k--)
        for (let t = 0; t < times; t++) {
          const size = 1 << k;
          if (parent.length + size > n) break outer;
          const base = parent.length;
          for (let j = 0; j < size; j++) parent.push(j === 0 ? 0 : base + (j & (j - 1)));
        }
    while (parent.length < n) parent.push(0);
    return parent;
  },
  // A path whose vertices each carry a binomial tree of a random size up to 2^kmax.
  spineBinomials: (n, r, o) => {
    const parent = [-1];
    let spineEnd = 0;
    while (parent.length < n) {
      const k = r.int(0, o.kmax);
      const size = Math.min(1 << k, n - parent.length);
      const base = parent.length;
      for (let j = 0; j < size; j++) parent.push(j === 0 ? spineEnd : base + (j & (j - 1)));
      // The tree's root is the first pushed vertex; the next spine vertex hangs on it.
      spineEnd = base;
    }
    return parent;
  },
  // A random tree grown the way a special tree is built: a vertex under an edge numbered k gets children numbered
  // {1..j} without k for a random j >= k, as long as the budget lasts; the leftover vertices hang on random ones.
  special: (n, r, o) => {
    const parent = [-1];
    const queue = [{ v: 0, k: 0 }];
    let head = 0;
    while (head < queue.length && parent.length < n) {
      const { v, k } = queue[head++];
      const j = Math.max(k, k === 0 ? 2 : 0, r.int(0, o.maxJ ?? 6));
      for (let c = 1; c <= j; c++) {
        if (c === k || parent.length >= n) continue;
        parent.push(v);
        queue.push({ v: parent.length - 1, k: c });
      }
    }
    while (parent.length < n) parent.push(r.int(0, parent.length - 1));
    return parent;
  },
};

// Edges of a tree of `shape` on n vertices. `rootFirst` keeps vertex 1 as the shape's own root, otherwise the
// numbering is random. Returns [[u, v], ...] with u < v in random order.
export function tree(shape, n, r, opts = {}) {
  const parent = shapes[shape](n, r, opts);
  const label = Array.from({ length: n }, (_, i) => i + 1);
  if (!opts.rootFirst) for (let i = n - 1; i > 0; i--) { const j = r.int(0, i); [label[i], label[j]] = [label[j], label[i]]; }
  else for (let i = n - 1; i > 1; i--) { const j = r.int(1, i); [label[i], label[j]] = [label[j], label[i]]; }
  const edges = [];
  for (let i = 1; i < n; i++) {
    const a = label[i];
    const b = label[parent[i]];
    edges.push(a < b ? [a, b] : [b, a]);
  }
  for (let i = edges.length - 1; i > 0; i--) { const j = r.int(0, i); [edges[i], edges[j]] = [edges[j], edges[i]]; }
  return edges;
}

// The input text for a list of trees given as [n, edges].
export function render(trees) {
  const lines = [String(trees.length)];
  for (const [n, edges] of trees) {
    lines.push(String(n));
    for (const [u, v] of edges) lines.push(`${u} ${v}`);
  }
  return lines.join('\n') + '\n';
}

export const SHAPES = Object.keys(shapes);

// The input of a large case: spec = { seed, groups: [[shape, n or [lo, hi], options, count], ...] }.
export function buildInput(spec) {
  const r = prng(spec.seed);
  const trees = [];
  for (const [shape, size, opts, count] of spec.groups)
    for (let i = 0; i < count; i++) {
      const n = Array.isArray(size) ? r.int(size[0], size[1]) : size;
      trees.push([n, tree(shape, n, r, opts)]);
    }
  return render(trees);
}
