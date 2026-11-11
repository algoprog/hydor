// What lines a part up while it is dragged or sized, as in PowerPoint, Google Slides and Keynote: the maths, with nothing
// drawn here (SlideCanvas draws what it gives back). A box being moved snaps its edges and its middle to the slide's
// edges and middle, to the other parts' edges and middles, to the guides and to the grid, within a few screen pixels, and
// gives back the lines to draw: each runs between the part moved and the part (or parts) it lines up with, with small
// ticks where they line up, or across the whole slide when it is the slide's own line (or a guide) that it lines up with.
// A line is given whenever the part IS lined up, also when it landed there exactly. It gives back the distances too:
// from the part to the nearest part on each side that it faces, or to the slide's edge when nothing is between, and the
// gaps as wide as those between other parts. A part being sized snaps the edges that move (a turned part by the box it
// shows, round its turned corners; a corner that keeps the shape snaps the edge that moves most and the other side
// follows), and to the same width or height as another part. Every box here is the box a part SHOWS (turned parts by
// their turned box), in the coordinates of the level they are on (the slide's, or a group's).

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What a box snaps to, in the coordinates of its level. */
export interface SnapSet {
  /** The other parts, each as it shows. */
  parts: Box[];
  /** The slide, when the level is the slide's own (nothing turned): its edges and middle are lines, and the guides' span. */
  frame?: Box;
  /** The guides the rulers hold (only with `frame`). */
  guides: { x: number[]; y: number[] };
  /** The grid: its size, and where its lines start in this level (the level's offset on the slide). */
  grid?: { size: number; ox: number; oy: number };
}

/** A line to draw: at `at` on its axis (axis 'x': a line down at that x), from `from` to `to` along the other. */
export interface GuideLine {
  axis: 'x' | 'y';
  at: number;
  from: number;
  to: number;
  /** Small marks across the line where the parts' edges are (none on the slide's own lines). */
  ticks: number[];
  /** A line of the slide itself or a guide: it spans the slide. */
  slide: boolean;
}

/** A distance (or a gap) to draw: a short line from (x1, y1) to (x2, y2), and the number it carries. */
export interface Gap {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  n: number;
}

export const unionOf = (boxes: Box[]): Box => {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
};

/** The box round a box turned by `rot` degrees about its middle (the same as the box a turned part shows). */
export function turned(b: Box, rot: number): Box {
  const a = (rot * Math.PI) / 180;
  if (!a) return b;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  const w = b.w * c + b.h * s;
  const h = b.w * s + b.h * c;
  return { x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w, h };
}

/** One line something can snap to: where it is, which part it comes from, and whether it is the slide's or a guide. */
interface Cand {
  v: number;
  box?: Box;
  slide?: boolean;
}

/** The lines on one axis a box can snap to: the slide's edges and middle, the guides, the other parts' edges and middles. */
function candidates(set: SnapSet, axis: 'x' | 'y'): Cand[] {
  const out: Cand[] = [];
  const f = set.frame;
  if (f) {
    const [p, n] = axis === 'x' ? [f.x, f.w] : [f.y, f.h];
    out.push({ v: p, slide: true }, { v: p + n / 2, slide: true }, { v: p + n, slide: true });
    for (const g of set.guides[axis]) out.push({ v: g, slide: true });
  }
  for (const b of set.parts) {
    const [p, n] = axis === 'x' ? [b.x, b.w] : [b.y, b.h];
    out.push({ v: p, box: b }, { v: p + n / 2, box: b }, { v: p + n, box: b });
  }
  return out;
}

/** The nearest of the lines to any of the values, within `tol`: how far to move, and the lines it then lands on. */
function nearest(vals: number[], lines: number[], tol: number): { d: number; at: number[] } {
  let best: { d: number; at: number[] } = { d: 0, at: [] };
  let bestAbs = tol + 1;
  for (const v of vals)
    for (const l of lines) {
      const d = l - v;
      if (Math.abs(d) < bestAbs - 0.01) {
        bestAbs = Math.abs(d);
        best = { d, at: [l] };
      } else if (Math.abs(Math.abs(d) - bestAbs) < 0.01 && !best.at.includes(l)) best.at.push(l);
    }
  return bestAbs <= tol ? best : { d: 0, at: [] };
}

/** The grid's lines around the values (one step either side of the nearest), for an axis whose lines start at `off`. */
function gridAround(vals: number[], size: number, off: number): number[] {
  const out: number[] = [];
  for (const v of vals) {
    const n = Math.round((v + off) / size) * size - off;
    out.push(n - size, n, n + size);
  }
  return out;
}

/** Snapping to the parts, slide and guides, or to the grid: whichever is nearer; the lines' own are the ones that are drawn. */
function snapAxis(vals: number[], cands: Cand[], grid: number[], tol: number): { d: number; snapped: boolean } {
  const a = nearest(vals, cands.map((c) => c.v), tol);
  const g = nearest(vals, grid, tol);
  if (!g.at.length || (a.at.length && Math.abs(a.d) <= Math.abs(g.d))) return { d: a.d, snapped: a.at.length > 0 };
  return { d: g.d, snapped: true };
}

/**
 * The lines to draw for a box where it is: for each of its edges (or middles) `vx`, `vy` that sits on a line of a part,
 * of the slide or of a guide (within half a pixel), a line between them. Lines at the same place join into one.
 */
export function alignedLines(b: Box, set: SnapSet, vx: number[], vy: number[], eps = 0.6): GuideLine[] {
  const out: GuideLine[] = [];
  for (const axis of ['x', 'y'] as const) {
    const X = axis === 'x';
    const vals = X ? vx : vy;
    if (!vals.length) continue;
    const own = X ? [b.y, b.y + b.h] : [b.x, b.x + b.w];
    for (const c of candidates(set, axis)) {
      if (!vals.some((v) => Math.abs(v - c.v) <= eps)) continue;
      let line = out.find((l) => l.axis === axis && Math.abs(l.at - c.v) < 0.01);
      if (!line) out.push((line = { axis, at: c.v, from: own[0], to: own[1], ticks: [...own], slide: false }));
      if (c.slide) line.slide = true;
      if (c.box) {
        const theirs = X ? [c.box.y, c.box.y + c.box.h] : [c.box.x, c.box.x + c.box.w];
        line.from = Math.min(line.from, theirs[0]);
        line.to = Math.max(line.to, theirs[1]);
        line.ticks.push(...theirs);
      }
    }
  }
  const f = set.frame;
  for (const l of out) {
    if (l.slide && f) {
      l.from = l.axis === 'x' ? f.y : f.x;
      l.to = l.axis === 'x' ? f.y + f.h : f.x + f.w;
      l.ticks = [];
    } else l.ticks = [...new Set(l.ticks.map((t) => Math.round(t * 100) / 100))];
  }
  return out;
}

/**
 * The distances from a box to what is next to it on each side: the nearest part that it faces (overlapping it across),
 * or the slide's edge when nothing is between. Each as a short line across the space, in the middle of what faces.
 */
export function distances(b: Box, parts: Box[], frame?: Box): Gap[] {
  const out: Gap[] = [];
  const add = (x1: number, y1: number, x2: number, y2: number) => {
    const n = Math.round(Math.hypot(x2 - x1, y2 - y1));
    if (n >= 1) out.push({ x1, y1, x2, y2, n });
  };
  const faces = (lo: number, hi: number, p0: number, p1: number) => Math.min(hi, p1) - Math.max(lo, p0) > 0.5;
  // Left and right: parts that overlap it down the slide.
  const level = parts.filter((p) => faces(b.y, b.y + b.h, p.y, p.y + p.h));
  const left = level.filter((p) => p.x + p.w <= b.x + 0.5).sort((p, q) => q.x + q.w - (p.x + p.w))[0];
  const right = level.filter((p) => p.x >= b.x + b.w - 0.5).sort((p, q) => p.x - q.x)[0];
  const midY = (p?: Box) => (p ? (Math.max(b.y, p.y) + Math.min(b.y + b.h, p.y + p.h)) / 2 : b.y + b.h / 2);
  if (left) add(left.x + left.w, midY(left), b.x, midY(left));
  else if (frame && b.x - frame.x >= 1) add(frame.x, midY(), b.x, midY());
  if (right) add(b.x + b.w, midY(right), right.x, midY(right));
  else if (frame && frame.x + frame.w - (b.x + b.w) >= 1) add(b.x + b.w, midY(), frame.x + frame.w, midY());
  // Above and below: parts that overlap it across the slide.
  const stacked = parts.filter((p) => faces(b.x, b.x + b.w, p.x, p.x + p.w));
  const above = stacked.filter((p) => p.y + p.h <= b.y + 0.5).sort((p, q) => q.y + q.h - (p.y + p.h))[0];
  const below = stacked.filter((p) => p.y >= b.y + b.h - 0.5).sort((p, q) => p.y - q.y)[0];
  const midX = (p?: Box) => (p ? (Math.max(b.x, p.x) + Math.min(b.x + b.w, p.x + p.w)) / 2 : b.x + b.w / 2);
  if (above) add(midX(above), above.y + above.h, midX(above), b.y);
  else if (frame && b.y - frame.y >= 1) add(midX(), frame.y, midX(), b.y);
  if (below) add(midX(below), b.y + b.h, midX(below), below.y);
  else if (frame && frame.y + frame.h - (b.y + b.h) >= 1) add(midX(), b.y + b.h, midX(), frame.y + frame.h);
  return out;
}

/**
 * Gaps as wide as those between other parts in the same row (or column): the box moved to make another such gap, or to
 * sit as far from the part on its one side as from the one on its other; and where the gaps are, to mark them.
 */
export function spacing(b: Box, parts: Box[], axis: 'x' | 'y', tol: number): { d: number; marks: { a: number; b: number; at: number }[] } | null {
  const X = axis === 'x';
  const pos = (r: Box) => (X ? r.x : r.y);
  const len = (r: Box) => (X ? r.w : r.h);
  const across = (r: Box) => (X ? [r.y, r.y + r.h] : [r.x, r.x + r.w]);
  const [m0, m1] = across(b);
  const row = parts
    .filter((r) => {
      const [a0, a1] = across(r);
      return a0 < m1 && a1 > m0;
    })
    .sort((p, q) => pos(p) - pos(q));
  if (row.length < 2) return null;
  const mid = (r: Box) => {
    const [a0, a1] = across(r);
    return (Math.max(a0, m0) + Math.min(a1, m1)) / 2;
  };
  let best: { d: number; marks: { a: number; b: number; at: number }[] } | null = null;
  const offer = (to: number, marks: { a: number; b: number; at: number }[]) => {
    const d = to - pos(b);
    if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, marks };
  };
  for (let i = 0; i < row.length - 1; i++) {
    const A = row[i];
    const B = row[i + 1];
    const gap = pos(B) - (pos(A) + len(A));
    if (gap <= 0) continue;
    // After B, and before A, with the gap they have.
    offer(pos(B) + len(B) + gap, [
      { a: pos(A) + len(A), b: pos(B), at: mid(A) },
      { a: pos(B) + len(B), b: pos(B) + len(B) + gap, at: mid(B) },
    ]);
    offer(pos(A) - gap - len(b), [
      { a: pos(A) - gap, b: pos(A), at: mid(A) },
      { a: pos(A) + len(A), b: pos(B), at: mid(B) },
    ]);
    // Between them, as far from each.
    const room = gap - len(b);
    if (room > 0)
      offer(pos(A) + len(A) + room / 2, [
        { a: pos(A) + len(A), b: pos(A) + len(A) + room / 2, at: mid(A) },
        { a: pos(B) - room / 2, b: pos(B), at: mid(B) },
      ]);
  }
  return best;
}

export interface MoveSnap {
  /** How far more the box moves to land on what it snapped to. */
  dx: number;
  dy: number;
  /** The lines of what it is lined up with, where it lands. */
  lines: GuideLine[];
  /** Gaps as wide as the ones between other parts. */
  gaps: Gap[];
  /** The distances to what is next to it. */
  dist: Gap[];
}

/**
 * A box being moved, where the pointer has it: snapped (a side that is not `free` is held, as Shift holds it straight; `on`
 * false, as Alt holds it: nothing snaps and nothing is drawn; a point has no `gaps` or `dist`), and what to draw. `set` empty of parts, slide and guides snaps to the grid alone (or nothing).
 */
export function snapMove(box: Box, set: SnapSet, tol: number, o: { free?: { x: boolean; y: boolean }; on?: boolean; gaps?: boolean; dist?: boolean } = {}): MoveSnap {
  const free = o.free ?? { x: true, y: true };
  const on = o.on ?? true;
  let dx = 0;
  let dy = 0;
  if (on) {
    const vx = [box.x, box.x + box.w / 2, box.x + box.w];
    const vy = [box.y, box.y + box.h / 2, box.y + box.h];
    if (free.x) {
      const r = snapAxis(vx, candidates(set, 'x'), set.grid ? gridAround(vx, set.grid.size, set.grid.ox) : [], tol);
      dx = r.d;
    }
    if (free.y) {
      const r = snapAxis(vy, candidates(set, 'y'), set.grid ? gridAround(vy, set.grid.size, set.grid.oy) : [], tol);
      dy = r.d;
    }
  }
  let moved = { ...box, x: box.x + dx, y: box.y + dy };
  const gaps: Gap[] = [];
  // Equal gaps, where no line was snapped to across (or down).
  if (on && o.gaps !== false && set.parts.length) {
    const lined = alignedLines(moved, set, [moved.x, moved.x + moved.w / 2, moved.x + moved.w], []);
    const hx = free.x && !lined.length ? spacing(moved, set.parts, 'x', tol) : null;
    if (hx) {
      dx += hx.d;
      moved = { ...moved, x: box.x + dx };
      for (const m of hx.marks) gaps.push({ x1: m.a, y1: m.at, x2: m.b, y2: m.at, n: Math.round(m.b - m.a) });
    }
    const linedY = alignedLines(moved, set, [], [moved.y, moved.y + moved.h / 2, moved.y + moved.h]);
    const vy = free.y && !linedY.length ? spacing(moved, set.parts, 'y', tol) : null;
    if (vy) {
      dy += vy.d;
      moved = { ...moved, y: box.y + dy };
      for (const m of vy.marks) gaps.push({ x1: m.at, y1: m.a, x2: m.at, y2: m.b, n: Math.round(m.b - m.a) });
    }
  }
  const lines = on ? alignedLines(moved, set, [moved.x, moved.x + moved.w / 2, moved.x + moved.w], [moved.y, moved.y + moved.h / 2, moved.y + moved.h]) : [];
  // The distances the gaps already say are not said twice.
  const dist = on && o.dist !== false ? distances(moved, set.parts, set.frame).filter((g) => !gaps.some((m) => Math.abs(m.x1 - g.x1) < 0.5 && Math.abs(m.y1 - g.y1) < 0.5 && Math.abs(m.x2 - g.x2) < 0.5 && Math.abs(m.y2 - g.y2) < 0.5)) : [];
  return { dx, dy, lines, gaps, dist };
}

/**
 * Where a part's box goes when it is sized to `nw` × `nh` from the handle (hx, hy: -1, 0 or 1 across and down): the side or
 * corner across from the handle stays where it is, as the part is turned by `rot` (so the box's middle moves along its turn).
 */
export function placeResize(box: Box, rot: number, hx: number, hy: number, nw: number, nh: number): Box {
  const r = (rot * Math.PI) / 180;
  const cxl = (hx * (nw - box.w)) / 2;
  const cyl = (hy * (nh - box.h)) / 2;
  const cx0 = box.x + box.w / 2 + cxl * Math.cos(r) - cyl * Math.sin(r);
  const cy0 = box.y + box.h / 2 + cxl * Math.sin(r) + cyl * Math.cos(r);
  return { x: cx0 - nw / 2, y: cy0 - nh / 2, w: nw, h: nh };
}

export interface ResizeSnap {
  /** The part's own box, sized (whole pixels, at least `min` across). */
  box: Box;
  lines: GuideLine[];
  /** The width or the height it now has in common with other parts: the boxes (as they show) to mark with "=". */
  equal: { w: Box[]; h: Box[] };
}

/**
 * A part being sized, snapped: the edges that move (as the part shows them, turned or not) to the lines of `set`, and its
 * width and height to those of other parts. `keep`: a corner that keeps the part's shape, so one number sizes it and the
 * edge that moves most (the nearest to a line of those that move) is the one to snap, the other side following. `nw`, `nh`
 * are the size the pointer asks for.
 */
export function snapResize(o: { box: Box; rot: number; hx: number; hy: number; nw: number; nh: number; keep: boolean; set: SnapSet; tol: number; on?: boolean; min?: number }): ResizeSnap {
  const { box, rot, hx, hy, keep, set, tol } = o;
  const min = o.min ?? 8;
  const on = o.on ?? true;
  const ratio = box.h / Math.max(1, box.w);
  let nw = Math.max(min, o.nw);
  let nh = Math.max(min, keep ? nw * ratio : o.nh);
  type V = 'w' | 'h';
  type P = 'x0' | 'x1' | 'y0' | 'y1' | 'vw' | 'vh';
  const props: P[] = ['x0', 'x1', 'y0', 'y1', 'vw', 'vh'];
  const numbers = (w: number, h: number): Record<P, number> => {
    const b = turned(placeResize(box, rot, hx, hy, w, h), rot);
    return { x0: b.x, x1: b.x + b.w, y0: b.y, y1: b.y + b.h, vw: b.w, vh: b.h };
  };
  // The sizing numbers: width and height (the ones whose handle is held), or the one that sizes the whole shape.
  const vars: V[] = keep ? ['w'] : [...(hx ? (['w'] as V[]) : []), ...(hy ? (['h'] as V[]) : [])];
  const apply = (v: V, to: number) => {
    if (keep) {
      nw = Math.max(min, to);
      nh = Math.max(min, nw * ratio);
    } else if (v === 'w') nw = Math.max(min, to);
    else nh = Math.max(min, to);
  };
  const num = (v: V) => (v === 'w' ? nw : nh);
  /** How each of the shown box's numbers changes for one more of the sizing number. */
  const slope = (v: V): Record<P, number> => {
    const a = numbers(nw, nh);
    const b = keep ? numbers(nw + 1, (nw + 1) * ratio) : v === 'w' ? numbers(nw + 1, nh) : numbers(nw, nh + 1);
    return Object.fromEntries(props.map((p) => [p, b[p] - a[p]])) as Record<P, number>;
  };
  const slopes = new Map(vars.map((v) => [v, slope(v)] as const));
  const moves = (p: P) => vars.some((v) => Math.abs(slopes.get(v)![p]) >= 0.1);
  const cands = { x: candidates(set, 'x'), y: candidates(set, 'y') };
  if (on && vars.length) {
    const used = new Set<V>();
    // The axes it snaps on: when the shape is kept, both at once (the nearest wins); else each with a sizing number of its own.
    for (const axes of keep ? [['x', 'y'] as const] : [['x'] as const, ['y'] as const]) {
      let best: { v: V; by: number; abs: number } | null = null;
      for (const v of vars.filter((q) => !used.has(q))) {
        const sl = slopes.get(v)!;
        const now = numbers(nw, nh);
        for (const a of axes) {
          const X = a === 'x';
          for (const e of (X ? ['x0', 'x1'] : ['y0', 'y1']) as P[]) {
            if (Math.abs(sl[e]) < 0.1) continue;
            const grid = set.grid ? gridAround([now[e]], set.grid.size, X ? set.grid.ox : set.grid.oy) : [];
            const r = snapAxis([now[e]], cands[a], grid, tol);
            if (r.snapped && (!best || Math.abs(r.d) < best.abs)) best = { v, by: r.d / sl[e], abs: Math.abs(r.d) };
          }
        }
      }
      // No line: the width (or the height) of another part.
      if (!best) {
        for (const v of vars.filter((q) => !used.has(q))) {
          const sl = slopes.get(v)!;
          const now = numbers(nw, nh);
          for (const a of axes) {
            const p: P = a === 'x' ? 'vw' : 'vh';
            if (Math.abs(sl[p]) < 0.1) continue;
            const near = nearest([now[p]], set.parts.map((b) => (a === 'x' ? b.w : b.h)), tol);
            if (near.at.length && (!best || Math.abs(near.d) < best.abs)) best = { v, by: near.d / sl[p], abs: Math.abs(near.d) };
          }
        }
      }
      if (best) {
        apply(best.v, num(best.v) + best.by);
        used.add(best.v);
      }
    }
  }
  const b = placeResize(box, rot, hx, hy, nw, nh);
  const out: Box = { x: Math.round(b.x), y: Math.round(b.y), w: Math.max(min, Math.round(b.w)), h: Math.max(min, Math.round(b.h)) };
  const vis = turned(out, rot);
  // The lines of the edges that moved.
  const edge = (p: P, v: number) => (moves(p) ? [v] : []);
  const lines = on ? alignedLines(vis, set, [...edge('x0', vis.x), ...edge('x1', vis.x + vis.w)], [...edge('y0', vis.y), ...edge('y1', vis.y + vis.h)]) : [];
  const same = (get: (q: Box) => number, mine: number, active: boolean) => (on && active ? set.parts.filter((q) => Math.abs(get(q) - mine) <= 0.6) : []);
  const wSame = same((q) => q.w, vis.w, moves('vw'));
  const hSame = same((q) => q.h, vis.h, moves('vh'));
  return { box: out, lines, equal: { w: wSame.length ? [vis, ...wSame] : [], h: hSame.length ? [vis, ...hSame] : [] } };
}
