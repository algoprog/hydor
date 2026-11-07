// Where a connector runs: its ends (at a fixed point of a shape, at the side of it that faces the other end, at its
// outline toward the other end, or free), then its course: at right angles (orthogonal: the fewest bends that keep clear
// of the shapes it joins, found on a sparse grid of the lines round them, or through the points it is given), straight
// from point to point, or curved (a smooth curve through its points, or out of one side and into the other). Also its
// arrowheads (drawn as paths of their own, so every viewer draws them alike), where its words go, and how near a point
// is to it (what a click picks).
import type { ArrowKind, DiagramEdge, DiagramShape } from './diagram.ts';
import { pageBox, perimeterPoint, portPoint, sidePoint, SIDE_DIR, sideOfDir, KINDS, type Box, type Pt, type Side } from './diagram-shapes.ts';

/** How far a connector runs straight out of a shape before it may turn. */
export const STUB = 18;

export interface EdgeGeom {
  /** Its course as points: an orthogonal or straight one's corners, a curved one's points (its curve through them). */
  pts: Pt[];
  /** The path to draw (its ends drawn short of the arrowheads that cover them). */
  d: string;
  /** Its course walked in short steps (for its words, and for picking). */
  walk: Pt[];
  /** Each end: its tip, and the way the line runs into it (toward the tip). */
  start: { p: Pt; dir: Pt };
  end: { p: Pt; dir: Pt };
  length: number;
}

type ShapeMap = Map<string, DiagramShape>;

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
const len = (a: Pt) => Math.hypot(a.x, a.y);
const unit = (a: Pt): Pt => {
  const l = len(a);
  return l < 1e-9 ? { x: 1, y: 0 } : { x: a.x / l, y: a.y / l };
};
const center = (b: Box): Pt => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const same = (a: Pt, b: Pt, e = 0.5) => Math.abs(a.x - b.x) < e && Math.abs(a.y - b.y) < e;

/** An end as it stands: the shape it is joined to (if it is there), a fixed point of it, or a free point. */
interface End {
  shape?: DiagramShape;
  port?: [number, number];
  free: Pt;
}
function endOf(e: DiagramEdge['from'], shapes: ShapeMap): End {
  const shape = e.id ? shapes.get(e.id) : undefined;
  return { shape, port: shape ? e.port : undefined, free: { x: e.x ?? 0, y: e.y ?? 0 } };
}
/** Where an end is, roughly: its fixed point, its shape's middle, or itself. */
function roughly(e: End): Pt {
  if (e.shape && e.port) return portPoint(e.shape, e.port).p;
  if (e.shape) return center(pageBox(e.shape));
  return e.free;
}

/**
 * Which sides two boxes are best joined by at right angles: across the larger gap between them (top to bottom when one
 * is over the other), the way the other lies.
 */
export function facingSides(a: Box, b: Box | Pt): [Side, Side] {
  const bb: Box = 'w' in b ? b : { x: b.x, y: b.y, w: 0, h: 0 };
  const gx = Math.max(bb.x - (a.x + a.w), a.x - (bb.x + bb.w));
  const gy = Math.max(bb.y - (a.y + a.h), a.y - (bb.y + bb.h));
  const ca = center(a);
  const cb = center(bb);
  if (gy >= gx) return cb.y >= ca.y ? ['s', 'n'] : ['n', 's'];
  return cb.x >= ca.x ? ['e', 'w'] : ['w', 'e'];
}

/** Whether a shape's outline runs straight along a side of its box (a rectangle's does; an ellipse's or a diamond's does not). */
const flatSides = (s: DiagramShape) => !s.rot && (KINDS[s.shape]?.boxy || ['rounded', 'terminator', 'note', 'card', 'sticky', 'document', 'cube', 'multi-document', 'loop-limit'].includes(s.shape));

/**
 * Where an orthogonal connector meets a side of a shape: the side's middle, or, when the shape at the other end lies
 * across from it with their sides overlapping, the middle of the overlap, so the connector runs straight.
 */
function sideAttach(s: DiagramShape, side: Side, other: Box | null): Pt {
  const mid = sidePoint(s, side);
  if (!other || !flatSides(s)) return mid;
  const b = pageBox(s);
  const r = 10;
  if (side === 'n' || side === 's') {
    const lo = Math.max(b.x + r, other.x + r);
    const hi = Math.min(b.x + b.w - r, other.x + other.w - r);
    if (lo <= hi && (mid.x < lo || mid.x > hi)) return { x: (lo + hi) / 2, y: side === 'n' ? b.y : b.y + b.h };
  } else {
    const lo = Math.max(b.y + r, other.y + r);
    const hi = Math.min(b.y + b.h - r, other.y + other.h - r);
    if (lo <= hi && (mid.y < lo || mid.y > hi)) return { x: side === 'w' ? b.x : b.x + b.w, y: (lo + hi) / 2 };
  }
  return mid;
}

// ---- right angles ---------------------------------------------------------------------------------------------------

/**
 * The course at right angles from `a` (leaving it its way, `da`) to `b` (arriving against `db`, the way out of b's side),
 * clear of the boxes given: the fewest bends, then the shortest, on the grid of the lines through the ends and round the
 * boxes. Null when there is none (the boxes overlap where it must go).
 */
function orthoRoute(a: Pt, da: Pt, b: Pt, db: Pt, boxes: Box[], m: number): Pt[] | null {
  const a1 = add(a, mul(da, m));
  const b1 = add(b, mul(db, m));
  const xs = new Set<number>([a1.x, b1.x, (a1.x + b1.x) / 2]);
  const ys = new Set<number>([a1.y, b1.y, (a1.y + b1.y) / 2]);
  for (const bx of boxes) {
    xs.add(bx.x - m);
    xs.add(bx.x + bx.w + m);
    ys.add(bx.y - m);
    ys.add(bx.y + bx.h + m);
  }
  // Between two boxes apart from each other: the line half way across the gap.
  if (boxes.length === 2) {
    const [p, q] = boxes;
    if (q.x > p.x + p.w) xs.add((p.x + p.w + q.x) / 2);
    if (p.x > q.x + q.w) xs.add((q.x + q.w + p.x) / 2);
    if (q.y > p.y + p.h) ys.add((p.y + p.h + q.y) / 2);
    if (p.y > q.y + q.h) ys.add((q.y + q.h + p.y) / 2);
  }
  const X = [...xs].sort((u, v) => u - v);
  const Y = [...ys].sort((u, v) => u - v);
  const blocked = (x: number, y: number) => boxes.some((bx) => x > bx.x - m + 0.5 && x < bx.x + bx.w + m - 0.5 && y > bx.y - m + 0.5 && y < bx.y + bx.h + m - 0.5);
  const crosses = (x1: number, y1: number, x2: number, y2: number) =>
    boxes.some((bx) => {
      const l = bx.x - m + 0.5;
      const r = bx.x + bx.w + m - 0.5;
      const t = bx.y - m + 0.5;
      const btm = bx.y + bx.h + m - 0.5;
      if (y1 === y2) return y1 > t && y1 < btm && Math.max(x1, x2) > l && Math.min(x1, x2) < r;
      return x1 > l && x1 < r && Math.max(y1, y2) > t && Math.min(y1, y2) < btm;
    });
  const xi = (x: number) => X.findIndex((v) => Math.abs(v - x) < 1e-6);
  const yi = (y: number) => Y.findIndex((v) => Math.abs(v - y) < 1e-6);
  const start = { i: xi(a1.x), j: yi(a1.y) };
  const goal = { i: xi(b1.x), j: yi(b1.y) };
  if (start.i < 0 || start.j < 0 || goal.i < 0 || goal.j < 0) return null;
  // Ways: 0 right, 1 down, 2 left, 3 up.
  const DIRS = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];
  const wayOf = (d: Pt) => (Math.abs(d.x) > Math.abs(d.y) ? (d.x > 0 ? 0 : 2) : d.y > 0 ? 1 : 3);
  const startWay = wayOf(da);
  const endWay = wayOf(mul(db, -1));
  const BEND = 60;
  const key = (i: number, j: number, w: number) => (i * Y.length + j) * 4 + w;
  const dist = new Map<number, number>();
  const prev = new Map<number, number>();
  // A small grid: a plain list stands in for a heap.
  const open: { k: number; c: number; i: number; j: number; w: number }[] = [];
  const h = (i: number, j: number) => Math.abs(X[i] - X[goal.i]) + Math.abs(Y[j] - Y[goal.j]);
  const k0 = key(start.i, start.j, startWay);
  dist.set(k0, 0);
  open.push({ k: k0, c: h(start.i, start.j), i: start.i, j: start.j, w: startWay });
  let found = -1;
  let guard = 0;
  while (open.length && guard++ < 20000) {
    let bi = 0;
    for (let n = 1; n < open.length; n++) if (open[n].c < open[bi].c) bi = n;
    const cur = open.splice(bi, 1)[0];
    const g = dist.get(cur.k)!;
    if (cur.i === goal.i && cur.j === goal.j) {
      if (cur.w === endWay) {
        found = cur.k;
        break;
      }
      // Arriving the wrong way: one more bend to come in right.
      const kk = key(cur.i, cur.j, endWay);
      const ng = g + BEND * (Math.abs(cur.w - endWay) === 2 ? 2 : 1);
      if (ng < (dist.get(kk) ?? Infinity)) {
        dist.set(kk, ng);
        prev.set(kk, cur.k);
        open.push({ k: kk, c: ng, i: cur.i, j: cur.j, w: endWay });
      }
      continue;
    }
    for (let w = 0; w < 4; w++) {
      if (Math.abs(w - cur.w) === 2) continue;
      const ni = cur.i + DIRS[w][0];
      const nj = cur.j + DIRS[w][1];
      if (ni < 0 || nj < 0 || ni >= X.length || nj >= Y.length) continue;
      if (blocked(X[ni], Y[nj]) && !(ni === goal.i && nj === goal.j)) continue;
      if (crosses(X[cur.i], Y[cur.j], X[ni], Y[nj])) continue;
      const step = Math.abs(X[ni] - X[cur.i]) + Math.abs(Y[nj] - Y[cur.j]);
      const ng = g + step + (w !== cur.w ? BEND : 0);
      const kk = key(ni, nj, w);
      if (ng < (dist.get(kk) ?? Infinity)) {
        dist.set(kk, ng);
        prev.set(kk, cur.k);
        open.push({ k: kk, c: ng + h(ni, nj), i: ni, j: nj, w });
      }
    }
  }
  if (found < 0) return null;
  const path: Pt[] = [];
  for (let k: number | undefined = found; k !== undefined; k = prev.get(k)) {
    const cell = Math.floor(k / 4);
    path.push({ x: X[Math.floor(cell / Y.length)], y: Y[cell % Y.length] });
  }
  path.reverse();
  return simplify([a, ...path, b]);
}

/** A course without points that change nothing (two in one place, or one in the middle of a straight run). */
export function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    if (out.length && same(out[out.length - 1], p, 0.01)) continue;
    out.push(p);
    while (out.length >= 3) {
      const [a, b, c] = out.slice(-3);
      const straight = (Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - c.x) < 0.01) || (Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01);
      if (!straight) break;
      out.splice(out.length - 2, 1);
    }
  }
  return out;
}

/** A plain course at right angles, for when no clear one is found: an elbow, or a run across half way between. */
function simpleOrtho(a: Pt, da: Pt, b: Pt, db: Pt): Pt[] {
  const aH = Math.abs(da.x) > Math.abs(da.y);
  const bH = Math.abs(db.x) > Math.abs(db.y);
  if (aH === bH) {
    // Facing each other, or the same way: across at the half way line, or round beyond both.
    const facing = da.x === -db.x && da.y === -db.y;
    if (aH) {
      const x = facing ? (a.x + b.x) / 2 : da.x > 0 ? Math.max(a.x, b.x) + STUB : Math.min(a.x, b.x) - STUB;
      return simplify([a, { x, y: a.y }, { x, y: b.y }, b]);
    }
    const y = facing ? (a.y + b.y) / 2 : da.y > 0 ? Math.max(a.y, b.y) + STUB : Math.min(a.y, b.y) - STUB;
    return simplify([a, { x: a.x, y }, { x: b.x, y }, b]);
  }
  return simplify([a, aH ? { x: b.x, y: a.y } : { x: a.x, y: b.y }, b]);
}

/** A course at right angles through given points: an elbow between two that are not in line, turning the way it went. */
function orthoThrough(a: Pt, da: Pt | null, pts: Pt[], b: Pt, db: Pt | null): Pt[] {
  const out: Pt[] = [a];
  let horiz = da ? Math.abs(da.x) > Math.abs(da.y) : true;
  const go = (p: Pt) => {
    const q = out[out.length - 1];
    if (Math.abs(q.x - p.x) > 0.5 && Math.abs(q.y - p.y) > 0.5) out.push(horiz ? { x: p.x, y: q.y } : { x: q.x, y: p.y });
    const r = out[out.length - 1];
    horiz = Math.abs(p.y - r.y) <= 0.5 ? true : Math.abs(p.x - r.x) <= 0.5 ? false : horiz;
    out.push(p);
  };
  // Leaving a shape: straight out first, unless the next point lies ahead.
  if (da && pts.length) {
    const ahead = (pts[0].x - a.x) * da.x + (pts[0].y - a.y) * da.y;
    if (ahead < STUB / 2) {
      out.push(add(a, mul(da, STUB)));
      horiz = !horiz;
    }
  }
  for (const p of pts) go(p);
  // Arriving: the last run into the shape along its side's way out.
  if (db) {
    const b1 = add(b, mul(db, STUB));
    const last = out[out.length - 1];
    const dbH = Math.abs(db.x) > Math.abs(db.y);
    if (dbH ? Math.abs(last.y - b.y) > 0.5 : Math.abs(last.x - b.x) > 0.5) {
      horiz = dbH ? false : true;
      go(b1);
    }
  }
  go(b);
  return simplify(out);
}

// ---- the course -------------------------------------------------------------------------------------------------------

/** A connector's course: its points, and whether it is drawn as a curve through them. */
export function edgeCourse(e: DiagramEdge, shapes: ShapeMap): { pts: Pt[]; curve: boolean; dirs: [Pt | null, Pt | null] } {
  const A = endOf(e.from, shapes);
  const B = endOf(e.to, shapes);
  const way = e.route ?? 'orthogonal';
  const pts = (e.points ?? []).map(([x, y]) => ({ x, y }));
  const nearA = pts[0] ?? roughly(B);
  const nearB = pts[pts.length - 1] ?? roughly(A);
  if (way === 'straight' || (way === 'curved' && pts.length)) {
    const a = A.shape ? (A.port ? portPoint(A.shape, A.port).p : perimeterPoint(A.shape, nearA)) : A.free;
    const b = B.shape ? (B.port ? portPoint(B.shape, B.port).p : perimeterPoint(B.shape, nearB)) : B.free;
    return { pts: [a, ...pts, b], curve: way === 'curved', dirs: [null, null] };
  }
  // Orthogonal, or curved with no points: each end at a side, leaving and arriving straight.
  const boxA = A.shape ? pageBox(A.shape) : null;
  const boxB = B.shape ? pageBox(B.shape) : null;
  let sa: Side | null = null;
  let sb: Side | null = null;
  let a: Pt | undefined;
  let b: Pt | undefined;
  if (A.shape && A.port) ({ p: a, side: sa } = portPoint(A.shape, A.port));
  if (B.shape && B.port) ({ p: b, side: sb } = portPoint(B.shape, B.port));
  const self = !!A.shape && A.shape === B.shape && !pts.length;
  if (A.shape && !A.port) {
    if (self) sa = 'e';
    else {
      const toward = pts.length ? nearA : B.shape && !B.port ? boxB! : roughly(B);
      sa = facingSides(boxA!, toward)[0];
    }
    a = sideAttach(A.shape, sa, !pts.length && B.shape && !B.port ? boxB : null);
  }
  if (B.shape && !B.port) {
    if (self) sb = 'n';
    else {
      const from = pts.length ? nearB : A.shape && !A.port ? boxA! : roughly(A);
      sb = facingSides(boxB!, from)[0];
    }
    b = sideAttach(B.shape, sb, !pts.length && A.shape && !A.port ? boxA : null);
  }
  const pa = a ?? A.free;
  const pb = b ?? B.free;
  // A free end leaves (or arrives) the way the other end lies.
  const da = sa ? SIDE_DIR[sa] : null;
  const db = sb ? SIDE_DIR[sb] : null;
  if (way === 'curved') return { pts: [pa, pb], curve: true, dirs: [da, db] };
  if (pts.length) return { pts: orthoThrough(pa, da, pts, pb, db), curve: false, dirs: [da, db] };
  const freeA = da ?? SIDE_DIR[sideOfDir(pb.x - pa.x, pb.y - pa.y)];
  const freeB = db ?? SIDE_DIR[sideOfDir(pa.x - pb.x, pa.y - pb.y)];
  const boxes = [boxA, boxB].filter((x): x is Box => !!x);
  // Two shapes over each other: no way round them both, so neither is kept clear of.
  const overlap = boxA && boxB && boxA.x < boxB.x + boxB.w && boxB.x < boxA.x + boxA.w && boxA.y < boxB.y + boxB.h && boxB.y < boxA.y + boxA.h;
  const keep = self ? [boxA!] : overlap ? [] : boxes;
  // Shapes close together leave too little room to run out of them in full: then a shorter run out.
  const route = orthoRoute(pa, freeA, pb, freeB, keep, STUB) ?? orthoRoute(pa, freeA, pb, freeB, keep, 6) ?? simpleOrtho(pa, freeA, pb, freeB);
  return { pts: route, curve: false, dirs: [da, db] };
}

// ---- drawing it -------------------------------------------------------------------------------------------------------

/** How far each arrowhead covers the line's end (so the line stops where the head begins), at a line width. */
function headInset(k: ArrowKind | undefined, w: number): number {
  const L = arrowLen(w);
  switch (k) {
    case 'arrow':
      return L * 0.7;
    case 'block':
      return L * 0.95;
    case 'triangle':
      return L;
    case 'diamond':
    case 'diamond-open':
      return L * 1.6;
    case 'circle':
    case 'circle-open':
      return L * 0.7;
    case 'open':
      return w / 2;
    default:
      return 0;
  }
}
export const arrowLen = (w: number) => 9 + w * 2;

const fmt = (v: number) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};
const P = (p: Pt) => `${fmt(p.x)} ${fmt(p.y)}`;

/** Points along a cubic curve. */
function cubicWalk(a: Pt, c1: Pt, c2: Pt, b: Pt, n = 24): Pt[] {
  const out: Pt[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push({ x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x, y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y });
  }
  return out;
}

/** A course drawn as a smooth curve through its points: its cubic pieces (Catmull-Rom's, made Bézier). */
function smoothPieces(pts: Pt[], dirs: [Pt | null, Pt | null]): [Pt, Pt, Pt, Pt][] {
  if (pts.length === 2) {
    const [a, b] = pts;
    const dist = len(sub(b, a));
    const k = Math.max(24, dist * 0.45);
    const da = dirs[0] ?? unit(sub(b, a));
    const db = dirs[1] ?? unit(sub(a, b));
    return [[a, add(a, mul(da, k)), add(b, mul(db, k)), b]];
  }
  const out: [Pt, Pt, Pt, Pt][] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    out.push([p1, add(p1, mul(sub(p2, p0), 1 / 6)), sub(p2, mul(sub(p3, p1), 1 / 6)), p2]);
  }
  return out;
}

/** A connector's whole drawing geometry: its course, the path to draw, its ends and its length. */
export function edgeGeom(e: DiagramEdge, shapes: ShapeMap): EdgeGeom {
  const { pts, curve, dirs } = edgeCourse(e, shapes);
  const w = e.style?.width ?? 1.5;
  const sArrow = e.style?.start ?? 'none';
  const eArrow = e.style?.end ?? 'arrow';
  let walk: Pt[];
  let d: string;
  let startDir: Pt;
  let endDir: Pt;
  if (curve) {
    const pieces = smoothPieces(pts, dirs);
    walk = [pts[0], ...pieces.flatMap(([a, c1, c2, b]) => cubicWalk(a, c1, c2, b))];
    const first = pieces[0];
    const last = pieces[pieces.length - 1];
    startDir = unit(sub(first[0], same(first[1], first[0]) ? first[2] : first[1]));
    endDir = unit(sub(last[3], same(last[2], last[3]) ? last[1] : last[2]));
    // The ends drawn short of their heads: the first and last pieces pulled in along their way.
    const i0 = headInset(sArrow, w);
    const i1 = headInset(eArrow, w);
    const parts = pieces.map((p) => [...p] as [Pt, Pt, Pt, Pt]);
    if (i0) parts[0][0] = add(parts[0][0], mul(startDir, -i0));
    if (i1) parts[parts.length - 1][3] = add(parts[parts.length - 1][3], mul(endDir, -i1));
    d = `M${P(parts[0][0])}` + parts.map(([, c1, c2, b]) => `C${P(c1)} ${P(c2)} ${P(b)}`).join('');
  } else {
    walk = pts;
    startDir = unit(sub(pts[0], pts[1] ?? add(pts[0], { x: -1, y: 0 })));
    endDir = unit(sub(pts[pts.length - 1], pts[pts.length - 2] ?? add(pts[0], { x: -1, y: 0 })));
    const drawn = pts.map((p) => ({ ...p }));
    const i0 = Math.min(headInset(sArrow, w), len(sub(pts[1] ?? pts[0], pts[0])) * 0.9);
    const i1 = Math.min(headInset(eArrow, w), len(sub(pts[pts.length - 1], pts[pts.length - 2] ?? pts[0])) * 0.9);
    if (drawn.length >= 2) {
      drawn[0] = add(drawn[0], mul(startDir, -i0));
      drawn[drawn.length - 1] = add(drawn[drawn.length - 1], mul(endDir, -i1));
    }
    const radius = e.route === 'straight' ? 0 : (e.style?.radius ?? 8);
    d = roundedPath(drawn, radius);
  }
  let length = 0;
  for (let i = 1; i < walk.length; i++) length += len(sub(walk[i], walk[i - 1]));
  return { pts, d, walk, start: { p: pts[0], dir: startDir }, end: { p: pts[pts.length - 1], dir: endDir }, length };
}

/** A course's path, its corners rounded to `r` (as much as its runs allow). */
export function roundedPath(pts: Pt[], r: number): string {
  if (pts.length < 2) return pts.length ? `M${P(pts[0])}` : '';
  let d = `M${P(pts[0])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const k = Math.min(r, len(sub(b, a)) / 2, len(sub(c, b)) / 2);
    if (k < 0.5) {
      d += `L${P(b)}`;
      continue;
    }
    const p1 = add(b, mul(unit(sub(a, b)), k));
    const p2 = add(b, mul(unit(sub(c, b)), k));
    d += `L${P(p1)}Q${P(b)} ${P(p2)}`;
  }
  return d + `L${P(pts[pts.length - 1])}`;
}

/** The point at a share of a walked course (0 its start, 1 its end), and the way it runs there. */
export function alongWalk(walk: Pt[], t: number): { p: Pt; dir: Pt } {
  if (walk.length < 2) return { p: walk[0] ?? { x: 0, y: 0 }, dir: { x: 1, y: 0 } };
  let total = 0;
  for (let i = 1; i < walk.length; i++) total += len(sub(walk[i], walk[i - 1]));
  let left = total * Math.min(1, Math.max(0, t));
  for (let i = 1; i < walk.length; i++) {
    const seg = len(sub(walk[i], walk[i - 1]));
    if (left <= seg || i === walk.length - 1) {
      const k = seg ? Math.min(1, left / seg) : 0;
      return { p: add(walk[i - 1], mul(sub(walk[i], walk[i - 1]), k)), dir: unit(sub(walk[i], walk[i - 1])) };
    }
    left -= seg;
  }
  return { p: walk[walk.length - 1], dir: { x: 1, y: 0 } };
}

/** The point so far from an end of a walked course (from its start, or with `fromEnd` its end). */
export function atDistance(walk: Pt[], dist: number, fromEnd = false): Pt {
  const w = fromEnd ? [...walk].reverse() : walk;
  let left = dist;
  for (let i = 1; i < w.length; i++) {
    const seg = len(sub(w[i], w[i - 1]));
    if (left <= seg) return add(w[i - 1], mul(sub(w[i], w[i - 1]), seg ? left / seg : 0));
    left -= seg;
  }
  return w[w.length - 1] ?? { x: 0, y: 0 };
}

/** How far a point is from a walked course. */
export function distanceTo(walk: Pt[], p: Pt): number {
  let best = Infinity;
  for (let i = 1; i < walk.length; i++) {
    const a = walk[i - 1];
    const b = walk[i];
    const ab = sub(b, a);
    const l2 = ab.x * ab.x + ab.y * ab.y;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / l2)) : 0;
    best = Math.min(best, len(sub(p, add(a, mul(ab, t)))));
  }
  return walk.length === 1 ? len(sub(p, walk[0])) : best;
}

/**
 * An arrowhead at a tip, the line running into it along `dir`: path data to fill (`solid`, in the line's colour), to
 * fill with the paper (`hollow`) and to line (`line`).
 */
export function arrowHead(kind: ArrowKind, tip: Pt, dir: Pt, w: number): { solid?: string; hollow?: string; line?: string } {
  if (kind === 'none') return {};
  const L = arrowLen(w);
  const u = unit(dir);
  const n = { x: -u.y, y: u.x };
  const at = (back: number, side: number) => add(tip, add(mul(u, -back), mul(n, side)));
  const polyD = (ps: Pt[]) => `M${ps.map(P).join('L')}Z`;
  const circle = (c: Pt, r: number) => `M${P({ x: c.x + r, y: c.y })}A${fmt(r)} ${fmt(r)} 0 1 1 ${P({ x: c.x - r, y: c.y })}A${fmt(r)} ${fmt(r)} 0 1 1 ${P({ x: c.x + r, y: c.y })}Z`;
  const bar = (back: number, half: number) => `M${P(at(back, -half))}L${P(at(back, half))}`;
  const foot = (back: number, spread: number) => `M${P(at(back, 0))}L${P(at(0, -spread))}M${P(at(back, 0))}L${P(at(0, spread))}M${P(at(back, 0))}L${P(tip)}`;
  switch (kind) {
    case 'arrow':
      return { solid: polyD([tip, at(L, -L * 0.42), at(L * 0.7, 0), at(L, L * 0.42)]) };
    case 'block':
      return { solid: polyD([tip, at(L, -L * 0.42), at(L, L * 0.42)]) };
    case 'triangle':
      return { hollow: polyD([tip, at(L, -L * 0.5), at(L, L * 0.5)]) };
    case 'open':
      return { line: `M${P(at(L, -L * 0.45))}L${P(tip)}L${P(at(L, L * 0.45))}` };
    case 'diamond':
      return { solid: polyD([tip, at(L * 0.8, -L * 0.42), at(L * 1.6, 0), at(L * 0.8, L * 0.42)]) };
    case 'diamond-open':
      return { hollow: polyD([tip, at(L * 0.8, -L * 0.42), at(L * 1.6, 0), at(L * 0.8, L * 0.42)]) };
    case 'circle':
      return { solid: circle(at(L * 0.35, 0), L * 0.35) };
    case 'circle-open':
      return { hollow: circle(at(L * 0.35, 0), L * 0.35) };
    case 'bar':
      return { line: bar(0.5, L * 0.55) };
    case 'cross':
      return { line: `M${P(at(L * 0.25, -L * 0.4))}L${P(at(L * 1.05, L * 0.4))}M${P(at(L * 0.25, L * 0.4))}L${P(at(L * 1.05, -L * 0.4))}` };
    case 'er-one':
      return { line: bar(10, 8) };
    case 'er-only-one':
      return { line: bar(9, 8) + bar(15, 8) };
    case 'er-zero-one':
      return { line: bar(9, 8), hollow: circle(at(20, 0), 5) };
    case 'er-many':
      return { line: foot(14, 8) };
    case 'er-one-many':
      return { line: foot(14, 8) + bar(18, 8) };
    case 'er-zero-many':
      return { line: foot(14, 8), hollow: circle(at(23, 0), 5) };
  }
  return {};
}
