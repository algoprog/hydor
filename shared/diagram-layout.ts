// Laying a diagram's shapes out from the edges between them, as draw.io's Arrange → Layout and Graphviz do, so that an
// agent (or a person) gives only what joins what: in layers (a flowchart, down, right, up or left: cycles broken, layers
// assigned and pulled together, crossings few by sweeps of medians and swaps, each shape put over the middle of what it
// joins, long edges run through the gaps), as a tree (an org chart), a mind map (the root in the middle, its branches to
// either side), rings round a root, a circle or a grid. Shapes in containers are laid out inside them first, and each
// container then sized to hold them and laid out with the rest as one shape. Nothing here knows SVG: it gives places.
import type { LayoutKind } from './diagram-spec.ts';

export interface LNode {
  id: string;
  w: number;
  h: number;
  /** The container it is in (one of the nodes). */
  parent?: string;
  /** Room a container keeps round what it holds: its title band at the top (or the left), and its sides. */
  pad?: { top: number; left: number; right: number; bottom: number };
}
export interface LEdge {
  from: string;
  to: string;
  /** The size of its words, which the gap it crosses must hold. */
  label?: { w: number; h: number };
}
export interface LayoutOut {
  /** Each node's place (its top left) and size (a container's grows to hold what is in it). */
  pos: Map<string, { x: number; y: number; w: number; h: number }>;
  /** Points a long edge runs through, by its place in the list of edges. */
  bends: Map<number, { x: number; y: number }[]>;
  /** Edges that run back against the flow (a loop): the sides they leave and meet their shapes at, and their points. */
  back: Map<number, { from: [number, number]; to: [number, number]; points: { x: number; y: number }[] }>;
  /** The sides each edge should leave and meet its shapes at (a mind map's and a tree's), by its place in the list. */
  ports: Map<number, { from: [number, number]; to: [number, number] }>;
}

type Dir = 'down' | 'right' | 'up' | 'left';
const GAP = { cross: 44, along: 64 };

interface Box {
  w: number;
  h: number;
}

// ---- in layers --------------------------------------------------------------------------------------------------------

/** Pool adjacent violators: the closest non-decreasing values to `t` (weighted least squares). */
function isotonic(t: number[], w: number[]): number[] {
  const blocks: { v: number; w: number; n: number }[] = [];
  for (let i = 0; i < t.length; i++) {
    blocks.push({ v: t[i], w: w[i], n: 1 });
    while (blocks.length > 1 && blocks[blocks.length - 2].v > blocks[blocks.length - 1].v) {
      const b = blocks.pop()!;
      const a = blocks[blocks.length - 1];
      const ww = a.w + b.w;
      a.v = ww > 0 ? (a.v * a.w + b.v * b.w) / ww : (a.v + b.v) / 2;
      a.w = ww;
      a.n += b.n;
    }
  }
  const out: number[] = [];
  for (const b of blocks) for (let k = 0; k < b.n; k++) out.push(b.v);
  return out;
}

/** Places a row of boxes, in order, as near as it can to where each wants to be, never closer than they must be. */
function placeRow(want: number[], weight: number[], widths: number[], gap: number): number[] {
  const off: number[] = [0];
  for (let i = 1; i < want.length; i++) off.push(off[i - 1] + (widths[i - 1] + widths[i]) / 2 + gap);
  const y = isotonic(
    want.map((d, i) => d - off[i]),
    weight,
  );
  return y.map((v, i) => v + off[i]);
}

/** How many times the edges between two rows cross, the rows' orders given. */
function crossings(pairs: [number, number][]): number {
  if (pairs.length < 2) return 0;
  const s = [...pairs].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const max = Math.max(...s.map((p) => p[1])) + 2;
  const tree = new Array(max + 1).fill(0);
  let count = 0;
  let seen = 0;
  for (const [, v] of s) {
    // Those seen already that end after this one cross it.
    let le = 0;
    for (let i = v + 1; i > 0; i -= i & -i) le += tree[i];
    count += seen - le;
    for (let i = v + 1; i <= max; i += i & -i) tree[i]++;
    seen++;
  }
  return count;
}

/**
 * Layers: `nodes` in the order given (which breaks ties: the first is the start), `edges` between them by index. Gives
 * each node's middle, along the flow (y for down) and across it (x), as if the flow ran down; and the points long edges
 * run through, and which edges were turned back to break a cycle.
 */
function layered(sizes: Box[], edges: [number, number][], gap: { cross: number; along: number }, labelAlong: number[]): { cx: number[]; cy: number[]; bends: Map<number, { x: number; y: number }[]>; reversed: Set<number>; rank: number[]; layerTop: number[]; layerH: number[] } {
  const n = sizes.length;
  const out = new Map<number, number[]>();
  const into = new Map<number, number[]>();
  edges.forEach(([u, v], i) => {
    if (u === v) return;
    out.set(u, [...(out.get(u) ?? []), i]);
    into.set(v, [...(into.get(v) ?? []), i]);
  });
  // Cycles broken: a walk from the starts in the order given; an edge back to a node still being walked is turned round.
  const reversed = new Set<number>();
  const state = new Array(n).fill(0);
  const order = [...Array(n).keys()].sort((a, b) => ((into.get(a)?.length ?? 0) === 0 ? 0 : 1) - ((into.get(b)?.length ?? 0) === 0 ? 0 : 1) || a - b);
  for (const s of order) {
    if (state[s]) continue;
    const stack: { v: number; k: number }[] = [{ v: s, k: 0 }];
    state[s] = 1;
    while (stack.length) {
      const top = stack[stack.length - 1];
      const list = out.get(top.v) ?? [];
      if (top.k >= list.length) {
        state[top.v] = 2;
        stack.pop();
        continue;
      }
      const ei = list[top.k++];
      const w = edges[ei][1];
      if (state[w] === 1) reversed.add(ei);
      else if (state[w] === 0) {
        state[w] = 1;
        stack.push({ v: w, k: 0 });
      }
    }
  }
  const dag = edges.map(([u, v], i) => (reversed.has(i) ? [v, u] : [u, v]) as [number, number]);
  const succ: number[][] = Array.from({ length: n }, () => []);
  const pred: number[][] = Array.from({ length: n }, () => []);
  dag.forEach(([u, v]) => {
    if (u === v) return;
    succ[u].push(v);
    pred[v].push(u);
  });
  // Layers: the longest way from a start, then each node pulled down to just above what it leads to.
  const indeg = pred.map((p) => p.length);
  const topo: number[] = [];
  const queue = [...Array(n).keys()].filter((v) => indeg[v] === 0);
  while (queue.length) {
    const v = queue.shift()!;
    topo.push(v);
    for (const w of succ[v]) if (--indeg[w] === 0) queue.push(w);
  }
  const rank = new Array(n).fill(0);
  for (const v of topo) for (const w of succ[v]) rank[w] = Math.max(rank[w], rank[v] + 1);
  for (let i = topo.length - 1; i >= 0; i--) {
    const v = topo[i];
    if (!succ[v].length || !pred[v].length) {
      if (succ[v].length && !pred[v].length) rank[v] = Math.min(...succ[v].map((w) => rank[w])) - 1;
      continue;
    }
    const lo = Math.min(...succ[v].map((w) => rank[w])) - 1;
    if (lo > rank[v]) rank[v] = lo;
  }
  // Nodes joined to nothing go in the first layer, after the others.
  const lone = [...Array(n).keys()].filter((v) => !succ[v].length && !pred[v].length);
  for (const v of lone) rank[v] = 0;
  const minRank = Math.min(0, ...rank);
  for (let v = 0; v < n; v++) rank[v] -= minRank;
  const L = Math.max(0, ...rank) + 1;
  // Long edges run through stand-ins, one in each layer they cross.
  type V = { id: number; w: number; h: number; dummy: boolean; edge?: number };
  const verts: V[] = sizes.map((s, i) => ({ id: i, w: s.w, h: s.h, dummy: false }));
  const vRank = [...rank];
  const links: [number, number, number][] = [];
  dag.forEach(([u, v], ei) => {
    // An edge turned back goes round the side (see layLevel): it neither orders nor places the nodes.
    if (u === v || reversed.has(ei)) return;
    let prev = u;
    for (let r = rank[u] + 1; r < rank[v]; r++) {
      const d = verts.length;
      verts.push({ id: d, w: 12, h: 0, dummy: true, edge: ei });
      vRank.push(r);
      links.push([prev, d, ei]);
      prev = d;
    }
    links.push([prev, v, ei]);
  });
  const N = verts.length;
  const up: number[][] = Array.from({ length: N }, () => []);
  const down: number[][] = Array.from({ length: N }, () => []);
  for (const [a, b] of links) {
    down[a].push(b);
    up[b].push(a);
  }
  // A first order: as a walk from the starts meets them.
  const layers: number[][] = Array.from({ length: L }, () => []);
  const seen = new Array(N).fill(false);
  const visit = (s: number) => {
    const st = [s];
    while (st.length) {
      const v = st.pop()!;
      if (seen[v]) continue;
      seen[v] = true;
      layers[vRank[v]].push(v);
      for (let k = down[v].length - 1; k >= 0; k--) if (!seen[down[v][k]]) st.push(down[v][k]);
    }
  };
  for (const v of [...Array(n).keys()].filter((v) => !up[v].length && !lone.includes(v))) visit(v);
  for (let v = 0; v < N; v++) if (!seen[v] && !lone.includes(v)) visit(v);
  for (const v of lone) if (!seen[v]) visit(v);
  const posOf = new Array(N).fill(0);
  const index = () => layers.forEach((row) => row.forEach((v, i) => (posOf[v] = i)));
  index();
  const total = () => {
    let c = 0;
    for (let r = 0; r < L - 1; r++) {
      const pairs: [number, number][] = [];
      for (const v of layers[r]) for (const w of down[v]) pairs.push([posOf[v], posOf[w]]);
      c += crossings(pairs);
    }
    return c;
  };
  let best = layers.map((r) => [...r]);
  let bestC = total();
  const median = (v: number, nb: number[]) => {
    if (!nb.length) return -1;
    const p = nb.map((w) => posOf[w]).sort((a, b) => a - b);
    const m = Math.floor(p.length / 2);
    return p.length % 2 ? p[m] : (p[m - 1] + p[m]) / 2;
  };
  for (let it = 0; it < 24 && bestC > 0; it++) {
    const downward = it % 2 === 0;
    const rows = downward ? [...Array(L).keys()].slice(1) : [...Array(L).keys()].reverse().slice(1);
    for (const r of rows) {
      const row = layers[r];
      const key = new Map(row.map((v) => [v, median(v, downward ? up[v] : down[v])]));
      // Those joined to nothing on that side keep their place.
      const fixed = row.map((v, i) => (key.get(v)! < 0 ? i : -1));
      const movable = row.filter((v) => key.get(v)! >= 0).sort((a, b) => key.get(a)! - key.get(b)! || posOf[a] - posOf[b]);
      const next: number[] = [];
      let k = 0;
      for (let i = 0; i < row.length; i++) next.push(fixed[i] >= 0 ? row[i] : movable[k++]);
      layers[r] = next;
      layers[r].forEach((v, i) => (posOf[v] = i));
    }
    // Neighbours swapped where that crosses less.
    for (let r = 0; r < L; r++) {
      let improved = true;
      let guard = 0;
      while (improved && guard++ < 8) {
        improved = false;
        for (let i = 0; i < layers[r].length - 1; i++) {
          const a = layers[r][i];
          const b = layers[r][i + 1];
          const cross = (x: number, y: number) => {
            let c = 0;
            for (const nb of [up, down]) for (const p of nb[x]) for (const q of nb[y]) if (posOf[p] > posOf[q] && vRank[p] === vRank[q]) c++;
            return c;
          };
          if (cross(a, b) > cross(b, a)) {
            layers[r][i] = b;
            layers[r][i + 1] = a;
            posOf[a] = i + 1;
            posOf[b] = i;
            improved = true;
          }
        }
      }
    }
    const c = total();
    if (c < bestC) {
      bestC = c;
      best = layers.map((r) => [...r]);
    }
  }
  for (let r = 0; r < L; r++) layers[r] = best[r];
  index();
  // Across: packed, then each node drawn toward the middle of what it joins, up and down in turn.
  const x = new Array(N).fill(0);
  for (const row of layers) {
    let at = 0;
    row.forEach((v, i) => {
      if (i) at += (verts[row[i - 1]].w + verts[v].w) / 2 + gap.cross;
      x[v] = at;
    });
  }
  const pass = (rows: number[], nbOf: (v: number) => number[]) => {
    for (const r of rows) {
      const row = layers[r];
      if (!row.length) continue;
      const want = row.map((v) => {
        const nb = nbOf(v);
        return nb.length ? nb.reduce((a, w) => a + x[w], 0) / nb.length : x[v];
      });
      const weight = row.map((v) => (nbOf(v).length ? (verts[v].dummy ? 6 : 1 + nbOf(v).length * 0.5) : 0.05));
      const placed = placeRow(
        want,
        weight,
        row.map((v) => verts[v].w),
        gap.cross,
      );
      row.forEach((v, i) => (x[v] = placed[i]));
    }
  };
  const rowsDown = [...Array(L).keys()];
  const rowsUp = [...rowsDown].reverse();
  for (let it = 0; it < 10; it++) {
    pass(rowsDown.slice(1), (v) => up[v]);
    pass(rowsUp.slice(1), (v) => down[v]);
  }
  pass(rowsDown, (v) => [...up[v], ...down[v]]);
  const minX = Math.min(...layers.flat().map((v) => x[v] - verts[v].w / 2));
  for (let v = 0; v < N; v++) x[v] -= minX;
  // Along: each layer as deep as its deepest node, the gap after it as wide as the words on its edges need.
  const layerH = layers.map((row) => Math.max(0, ...row.map((v) => verts[v].h)));
  const gapAfter = new Array(L).fill(gap.along);
  edges.forEach(([u, v], i) => {
    if (u === v) return;
    const r = Math.min(rank[u], rank[v]);
    if (labelAlong[i]) gapAfter[r] = Math.max(gapAfter[r], labelAlong[i] + 36);
  });
  const layerTop: number[] = [];
  let top = 0;
  for (let r = 0; r < L; r++) {
    layerTop.push(top);
    top += layerH[r] + gapAfter[r];
  }
  const cy = verts.map((_, v) => layerTop[vRank[v]] + layerH[vRank[v]] / 2);
  const bends = new Map<number, { x: number; y: number }[]>();
  for (let v = n; v < N; v++) {
    const ei = verts[v].edge!;
    bends.set(ei, [...(bends.get(ei) ?? []), { x: x[v], y: cy[v] }]);
  }
  for (const [ei, pts] of bends) {
    pts.sort((a, b) => a.y - b.y);
    if (reversed.has(ei)) pts.reverse();
  }
  return { cx: x.slice(0, n), cy: cy.slice(0, n), bends, reversed, rank: rank.slice(0, n), layerTop, layerH };
}

// ---- trees ------------------------------------------------------------------------------------------------------------

/** A tree from edges: each node's parent (the first edge into it that makes no cycle), and the roots in the order given. */
function treeOf(n: number, edges: [number, number][]): { kids: number[][]; roots: number[]; parent: number[] } {
  const parent = new Array(n).fill(-1);
  const kids: number[][] = Array.from({ length: n }, () => []);
  const isAncestor = (a: number, b: number) => {
    for (let p = b, guard = 0; p >= 0 && guard < n + 1; p = parent[p], guard++) if (p === a) return true;
    return false;
  };
  for (const [u, v] of edges) {
    if (u === v || parent[v] >= 0 || isAncestor(v, u)) continue;
    parent[v] = u;
    kids[u].push(v);
  }
  const roots = [...Array(n).keys()].filter((v) => parent[v] < 0);
  return { kids, roots, parent };
}

/** A tree down the page: each parent over the middle of its children, each subtree as wide as it needs. Gives middles. */
function tidyTree(sizes: Box[], edges: [number, number][], gap: { cross: number; along: number }): { cx: number[]; cy: number[]; parent: number[] } {
  const n = sizes.length;
  const { kids, roots, parent } = treeOf(n, edges);
  const depth = new Array(n).fill(0);
  const order: number[] = [];
  const walk = (v: number, d: number) => {
    depth[v] = d;
    order.push(v);
    for (const k of kids[v]) walk(k, d + 1);
  };
  for (const r of roots) walk(r, 0);
  const D = Math.max(0, ...depth) + 1;
  const rowH = new Array(D).fill(0);
  for (let v = 0; v < n; v++) rowH[depth[v]] = Math.max(rowH[depth[v]], sizes[v].h);
  const rowTop: number[] = [];
  let t = 0;
  for (let d = 0; d < D; d++) {
    rowTop.push(t);
    t += rowH[d] + gap.along;
  }
  const cx = new Array(n).fill(0);
  // Each subtree laid out from its left edge; its width given back.
  const place = (v: number, left: number): number => {
    if (!kids[v].length) {
      cx[v] = left + sizes[v].w / 2;
      return sizes[v].w;
    }
    let at = left;
    const spans: number[] = [];
    for (const k of kids[v]) {
      const w = place(k, at);
      spans.push(w);
      at += w + gap.cross;
    }
    const kidsW = at - gap.cross - left;
    const mid = (cx[kids[v][0]] + cx[kids[v][kids[v].length - 1]]) / 2;
    if (sizes[v].w > kidsW) {
      // A parent wider than its children: they move under its middle.
      const shift = (sizes[v].w - kidsW) / 2;
      const move = (u: number) => {
        cx[u] += shift;
        for (const k of kids[u]) move(k);
      };
      for (const k of kids[v]) move(k);
      cx[v] = left + sizes[v].w / 2;
      return sizes[v].w;
    }
    cx[v] = mid;
    return kidsW;
  };
  let left = 0;
  for (const r of roots) left += place(r, left) + gap.cross * 1.5;
  const cy = [...Array(n).keys()].map((v) => rowTop[depth[v]] + rowH[depth[v]] / 2);
  void order;
  return { cx, cy, parent };
}

/** A mind map: the root in the middle, its branches to the right and the left in turn, each a tree across. */
function mindMap(sizes: Box[], edges: [number, number][], gap: { cross: number; along: number }): { cx: number[]; cy: number[]; side: number[]; parent: number[] } {
  const n = sizes.length;
  const { kids, roots, parent } = treeOf(n, edges);
  const cx = new Array(n).fill(0);
  const cy = new Array(n).fill(0);
  const side = new Array(n).fill(0);
  if (!n) return { cx, cy, side, parent };
  const root = roots[0];
  // How tall each subtree is when its children stand one under another.
  const tall = new Array(n).fill(0);
  const measure = (v: number): number => {
    const k = kids[v];
    tall[v] = k.length ? Math.max(sizes[v].h, k.reduce((a, c) => a + measure(c), 0) + gap.cross * 0.45 * (k.length - 1)) : sizes[v].h;
    return tall[v];
  };
  for (const r of roots) measure(r);
  // Branches to either side, as even in height as their order allows: the first ones right.
  const branches = kids[root];
  const all = branches.reduce((a, b) => a + tall[b], 0);
  const right: number[] = [];
  const left: number[] = [];
  let acc = 0;
  for (const b of branches) {
    if (!right.length || acc + tall[b] / 2 <= all / 2) {
      right.push(b);
      acc += tall[b];
    } else left.push(b);
  }
  // Round the clock: down the right side, then up the left.
  left.reverse();
  const lay = (v: number, x: number, top: number, dir: 1 | -1) => {
    // x: the near edge of v (its left on the right side, its right on the left side).
    cx[v] = x + (dir * sizes[v].w) / 2;
    side[v] = dir;
    const k = kids[v];
    if (!k.length) {
      cy[v] = top + tall[v] / 2;
      return;
    }
    const kidsH = k.reduce((a, c) => a + tall[c], 0) + gap.cross * 0.45 * (k.length - 1);
    let at = top + (tall[v] - kidsH) / 2;
    const nx = x + dir * (sizes[v].w + gap.along * 0.9);
    for (const c of k) {
      lay(c, nx, at, dir);
      at += tall[c] + gap.cross * 0.45;
    }
    cy[v] = (cy[k[0]] + cy[k[k.length - 1]]) / 2;
  };
  const column = (list: number[], dir: 1 | -1) => {
    const h = list.reduce((a, b) => a + tall[b], 0) + gap.cross * 0.6 * Math.max(0, list.length - 1);
    let at = -h / 2;
    for (const b of list) {
      lay(b, dir * (sizes[root].w / 2 + gap.along * 1.3), at, dir);
      at += tall[b] + gap.cross * 0.6;
    }
  };
  column(right, 1);
  column(left, -1);
  cx[root] = 0;
  cy[root] = 0;
  // Other roots (parts joined to nothing) go under it all.
  let below = Math.max(0, ...[...Array(n).keys()].filter((v) => side[v] || v === root).map((v) => cy[v] + sizes[v].h / 2)) + gap.along;
  for (const r of roots.slice(1)) {
    const k = [r];
    lay(r, -sizes[r].w / 2, below, 1);
    below += tall[r] + gap.along;
    void k;
  }
  return { cx, cy, side, parent };
}

/** Rings round the root: each layer of the tree on a circle further out, each subtree an arc as wide as its leaves. */
function radial(sizes: Box[], edges: [number, number][], gap: { cross: number; along: number }): { cx: number[]; cy: number[] } {
  const n = sizes.length;
  const { kids, roots } = treeOf(n, edges);
  const cx = new Array(n).fill(0);
  const cy = new Array(n).fill(0);
  const leaves = new Array(n).fill(1);
  const count = (v: number): number => (leaves[v] = kids[v].length ? kids[v].reduce((a, k) => a + count(k), 0) : 1);
  const big = Math.max(...sizes.map((s) => Math.max(s.w, s.h)), 40);
  const ringGap = big + gap.along;
  const root = roots[0] ?? 0;
  const total = roots.reduce((a, r) => a + count(r), 0);
  const place = (v: number, a0: number, a1: number, d: number) => {
    const a = (a0 + a1) / 2;
    const r = d * ringGap * (d > 0 ? Math.max(1, Math.sqrt(total) / 2.2) : 0);
    cx[v] = Math.cos(a) * r;
    cy[v] = Math.sin(a) * r;
    let at = a0;
    for (const k of kids[v]) {
      const span = ((a1 - a0) * leaves[k]) / Math.max(1, leaves[v]);
      place(k, at, at + span, d + 1);
      at += span;
    }
  };
  if (roots.length === 1) place(root, -Math.PI / 2, (3 * Math.PI) / 2, 0);
  else {
    // Several roots: around an empty middle.
    let at = -Math.PI / 2;
    for (const r of roots) {
      const span = (2 * Math.PI * leaves[r]) / total;
      place(r, at, at + span, 1);
      at += span;
    }
  }
  return { cx, cy };
}

// ---- the whole ------------------------------------------------------------------------------------------------------

const SIDE: Record<'n' | 'e' | 's' | 'w', [number, number]> = { n: [0.5, 0], e: [1, 0.5], s: [0.5, 1], w: [0, 0.5] };

/**
 * Lays out the nodes of one container (or of the page): their middles, given their sizes and the edges between them.
 * Points of long edges and back edges' sides and points, in the same frame.
 */
function layLevel(
  sizes: Box[],
  edges: [number, number][],
  labels: ({ w: number; h: number } | undefined)[],
  kind: LayoutKind,
  spacing: number | undefined,
): { cx: number[]; cy: number[]; bends: Map<number, { x: number; y: number }[]>; back: LayoutOut['back']; ports: LayoutOut['ports'] } {
  const n = sizes.length;
  const bends = new Map<number, { x: number; y: number }[]>();
  const back: LayoutOut['back'] = new Map();
  const ports: LayoutOut['ports'] = new Map();
  const gap = { cross: spacing ?? GAP.cross, along: (spacing ?? GAP.cross) * (GAP.along / GAP.cross) };
  if (!n) return { cx: [], cy: [], bends, back, ports };
  if (kind === 'grid' || kind === 'circle' || (kind !== 'none' && !edges.length && n > 1 && kind !== 'mindmap' && kind !== 'radial')) {
    if (kind === 'circle') {
      const big = Math.max(...sizes.map((s) => Math.hypot(s.w, s.h)));
      const r = Math.max(big, ((big + gap.cross * 0.5) * n) / (2 * Math.PI));
      return { cx: sizes.map((_, i) => Math.cos(-Math.PI / 2 + (2 * Math.PI * i) / n) * r), cy: sizes.map((_, i) => Math.sin(-Math.PI / 2 + (2 * Math.PI * i) / n) * r), bends, back, ports };
    }
    const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.4)));
    const cw = Math.max(...sizes.map((s) => s.w)) + gap.cross;
    const ch = Math.max(...sizes.map((s) => s.h)) + gap.cross;
    return { cx: sizes.map((_, i) => (i % cols) * cw), cy: sizes.map((_, i) => Math.floor(i / cols) * ch), bends, back, ports };
  }
  if (kind === 'mindmap') {
    const m = mindMap(sizes, edges, gap);
    edges.forEach(([u, v], i) => {
      if (m.parent[v] === u) ports.set(i, m.side[v] >= 0 ? { from: SIDE.e, to: SIDE.w } : { from: SIDE.w, to: SIDE.e });
    });
    return { cx: m.cx, cy: m.cy, bends, back, ports };
  }
  if (kind === 'radial') {
    const r = radial(sizes, edges, gap);
    return { ...r, bends, back, ports };
  }
  const dir: Dir = kind === 'right' || kind === 'tree-right' ? 'right' : kind === 'up' ? 'up' : kind === 'left' ? 'left' : 'down';
  const across = dir === 'right' || dir === 'left';
  // Laid out as if down the page, with widths and heights swapped for a flow across it.
  const flowSizes = sizes.map((s) => (across ? { w: s.h, h: s.w } : s));
  let cx: number[];
  let cy: number[];
  if (kind === 'tree' || kind === 'tree-right') {
    const t = tidyTree(flowSizes, edges, { cross: gap.cross * 0.7, along: gap.along });
    cx = t.cx;
    cy = t.cy;
    edges.forEach(([u, v], i) => {
      if (t.parent[v] === u) ports.set(i, across ? { from: SIDE.e, to: SIDE.w } : { from: SIDE.s, to: SIDE.n });
    });
  } else {
    const labelAlong = labels.map((l) => (l ? (across ? l.w : l.h) : 0));
    const r = layered(flowSizes, edges, gap, labelAlong);
    cx = r.cx;
    cy = r.cy;
    for (const [ei, pts] of r.bends) if (!r.reversed.has(ei)) bends.set(ei, pts);
    // An edge back against the flow goes round the side, beyond everything between its ends.
    for (const ei of r.reversed) {
      const [u, v] = edges[ei];
      const lo = Math.min(cy[u], cy[v]);
      const hi = Math.max(cy[u], cy[v]);
      let far = Math.max(cx[u] + flowSizes[u].w / 2, cx[v] + flowSizes[v].w / 2);
      for (let k = 0; k < n; k++) if (cy[k] + flowSizes[k].h / 2 >= lo && cy[k] - flowSizes[k].h / 2 <= hi) far = Math.max(far, cx[k] + flowSizes[k].w / 2);
      const x = far + 28 + (back.size % 4) * 12;
      back.set(ei, { from: SIDE.e, to: SIDE.e, points: [{ x, y: cy[u] }, { x, y: cy[v] }] });
    }
  }
  // Turned to the flow asked for.
  const map = (x: number, y: number): { x: number; y: number } => (dir === 'down' ? { x, y } : dir === 'up' ? { x, y: -y } : dir === 'right' ? { x: y, y: x } : { x: -y, y: x });
  const sideMap = (p: [number, number]): [number, number] => (dir === 'down' ? p : dir === 'up' ? [p[0], 1 - p[1]] : dir === 'right' ? [p[1], p[0]] : [1 - p[1], p[0]]);
  const outX: number[] = [];
  const outY: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = map(cx[i], cy[i]);
    outX.push(p.x);
    outY.push(p.y);
  }
  for (const [k, pts] of bends) bends.set(k, pts.map((p) => map(p.x, p.y)));
  for (const [k, b] of back) back.set(k, { from: sideMap(b.from), to: sideMap(b.to), points: b.points.map((p) => map(p.x, p.y)) });
  for (const [k, p] of ports) ports.set(k, { from: sideMap(p.from), to: sideMap(p.to) });
  return { cx: outX, cy: outY, bends, back, ports };
}

/** Lays out a page's nodes (containers' contents first, from the inside out). */
export function layout(nodes: LNode[], edges: LEdge[], kind: LayoutKind, o: { spacing?: number } = {}): LayoutOut {
  const pos = new Map<string, { x: number; y: number; w: number; h: number }>();
  const bendsOut = new Map<number, { x: number; y: number }[]>();
  const backOut: LayoutOut['back'] = new Map();
  const portsOut: LayoutOut['ports'] = new Map();
  const byId = new Map(nodes.map((nd) => [nd.id, nd]));
  const kids = new Map<string | undefined, LNode[]>();
  for (const nd of nodes) {
    const p = nd.parent && byId.has(nd.parent) && nd.parent !== nd.id ? nd.parent : undefined;
    kids.set(p, [...(kids.get(p) ?? []), nd]);
  }
  // The child of `of` (or of the page) that holds a node: an edge between two nodes is laid out between those.
  const levelOf = (id: string, of: string | undefined): string | null => {
    let cur: string | undefined = id;
    for (let guard = 0; cur && guard < 64; guard++) {
      const nd = byId.get(cur);
      const p = nd?.parent && byId.has(nd.parent) ? nd.parent : undefined;
      if (p === of) return cur;
      cur = p;
    }
    return null;
  };
  // Each container: what is in it laid out (relative to its corner), then sized to hold it.
  const rel = new Map<string, { x: number; y: number }>();
  const size = new Map<string, Box>(nodes.map((nd) => [nd.id, { w: nd.w, h: nd.h }]));
  const relBends = new Map<string | undefined, { level: Map<number, { x: number; y: number }[]>; back: LayoutOut['back'] }>();
  const doLevel = (of: string | undefined) => {
    const list = kids.get(of) ?? [];
    for (const nd of list) if (kids.has(nd.id)) doLevel(nd.id);
    const idx = new Map(list.map((nd, i) => [nd.id, i]));
    const lvlEdges: [number, number][] = [];
    const lvlLabels: ({ w: number; h: number } | undefined)[] = [];
    const which: number[] = [];
    const seenPair = new Set<string>();
    edges.forEach((e, ei) => {
      const a = levelOf(e.from, of);
      const b = levelOf(e.to, of);
      if (!a || !b) return;
      const u = idx.get(a)!;
      const v = idx.get(b)!;
      if (u === v) return;
      const direct = a === e.from && b === e.to;
      const key = `${u}>${v}`;
      // Between shapes inside two containers: one edge for the two containers, enough to place them.
      if (!direct && seenPair.has(key)) return;
      seenPair.add(key);
      lvlEdges.push([u, v]);
      lvlLabels.push(e.label);
      which.push(direct ? ei : -1);
    });
    const sizes = list.map((nd) => size.get(nd.id)!);
    const r = layLevel(sizes, lvlEdges, lvlLabels, kind, o.spacing);
    // From middles to corners, the whole moved so its top left is at 0, 0.
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    list.forEach((nd, i) => {
      const s = sizes[i];
      x0 = Math.min(x0, r.cx[i] - s.w / 2);
      y0 = Math.min(y0, r.cy[i] - s.h / 2);
      x1 = Math.max(x1, r.cx[i] + s.w / 2);
      y1 = Math.max(y1, r.cy[i] + s.h / 2);
    });
    for (const pts of [...r.bends.values(), ...[...r.back.values()].map((b) => b.points)])
      for (const p of pts) {
        x0 = Math.min(x0, p.x - 10);
        x1 = Math.max(x1, p.x + 10);
        y0 = Math.min(y0, p.y - 10);
        y1 = Math.max(y1, p.y + 10);
      }
    if (!list.length) [x0, y0, x1, y1] = [0, 0, 0, 0];
    list.forEach((nd, i) => rel.set(nd.id, { x: r.cx[i] - sizes[i].w / 2 - x0, y: r.cy[i] - sizes[i].h / 2 - y0 }));
    const lvl = new Map<number, { x: number; y: number }[]>();
    for (const [k, pts] of r.bends) if (which[k] >= 0) lvl.set(which[k], pts.map((p) => ({ x: p.x - x0, y: p.y - y0 })));
    const bk: LayoutOut['back'] = new Map();
    for (const [k, b] of r.back) if (which[k] >= 0) bk.set(which[k], { ...b, points: b.points.map((p) => ({ x: p.x - x0, y: p.y - y0 })) });
    for (const [k, p] of r.ports) if (which[k] >= 0) portsOut.set(which[k], p);
    relBends.set(of, { level: lvl, back: bk });
    if (of !== undefined) {
      const c = byId.get(of)!;
      const pad = c.pad ?? { top: 40, left: 20, right: 20, bottom: 20 };
      const s = size.get(of)!;
      const inner = { w: x1 - x0, h: y1 - y0 };
      size.set(of, list.length ? { w: Math.max(s.w, inner.w + pad.left + pad.right), h: Math.max(s.h, inner.h + pad.top + pad.bottom) } : s);
      // What it holds sits inside its padding, in the middle across if it is wider.
      const room = size.get(of)!.w - pad.left - pad.right - inner.w;
      for (const nd of list) {
        const q = rel.get(nd.id)!;
        rel.set(nd.id, { x: q.x + pad.left + Math.max(0, room / 2), y: q.y + pad.top });
      }
      for (const pts of lvl.values()) for (const p of pts) ((p.x += pad.left + Math.max(0, room / 2)), (p.y += pad.top));
      for (const b of bk.values()) for (const p of b.points) ((p.x += pad.left + Math.max(0, room / 2)), (p.y += pad.top));
    }
  };
  doLevel(undefined);
  // Down from the page: each node's place is its container's plus its own within it.
  const place = (of: string | undefined, ox: number, oy: number) => {
    for (const nd of kids.get(of) ?? []) {
      const q = rel.get(nd.id) ?? { x: 0, y: 0 };
      const s = size.get(nd.id)!;
      pos.set(nd.id, { x: Math.round(ox + q.x), y: Math.round(oy + q.y), w: Math.round(s.w), h: Math.round(s.h) });
      if (kids.has(nd.id)) place(nd.id, ox + q.x, oy + q.y);
    }
    const rb = relBends.get(of);
    if (rb) {
      for (const [k, pts] of rb.level) bendsOut.set(k, pts.map((p) => ({ x: Math.round(ox + p.x), y: Math.round(oy + p.y) })));
      for (const [k, b] of rb.back) backOut.set(k, { ...b, points: b.points.map((p) => ({ x: Math.round(ox + p.x), y: Math.round(oy + p.y) })) });
    }
  };
  place(undefined, 40, 40);
  return { pos, bends: bendsOut, back: backOut, ports: portsOut };
}
