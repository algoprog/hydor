// The maths of smart guides, one for every editor that places things (designs, diagrams): where a box being moved or
// sized lines up with the other parts (their edges and middles, the page's), where it sits in a row of equal gaps,
// where it is the same size as another part, and how far it is from the nearest part on each side. Plain functions of
// boxes, so each is tested on its own; what they find is drawn by each editor in the same way (thin pink lines, and
// small pink pills for distances and sizes).
//
// The design editor runs inside the design's own frame, which can import nothing: it is sent this file's function as
// text (`snapKit.toString()`). So everything here is inside `snapKit`, which uses only its arguments; the diagram
// editor and the tests call it directly (`SNAP`).

export interface SnapBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A line to draw: at `at` across (axis 'x': a vertical line at that x) from `from` to `to` along it. */
export interface SnapGuide {
  axis: 'x' | 'y';
  at: number;
  from: number;
  to: number;
}

/** A gap to mark: the stretch (x, y, w, h: one of w and h is 0) between two parts, and its length. */
export interface SnapGap {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Runs up and down (the parts are one above the other). */
  vertical: boolean;
  value: number;
}

export interface ResizeSnap {
  /** The box once snapped: edges on others', the same size as another, on the grid, in proportion if asked. */
  box: SnapBox;
  guides: SnapGuide[];
  /** The other parts that are now as wide (or as high) as the box, for the "=" marks. */
  sameW: SnapBox[];
  sameH: SnapBox[];
}

/** The pink of the guides and the pills, the same in every editor. */
export const GUIDE_COLOUR = '#ff3b8b';

export function snapKit() {
  type Box = { x: number; y: number; w: number; h: number };
  type Guide = { axis: 'x' | 'y'; at: number; from: number; to: number };
  type Gap = { x: number; y: number; w: number; h: number; vertical: boolean; value: number };
  type Line = { v: number; from: number; to: number };
  const near = (a: number, b: number) => Math.abs(a - b) < 0.5;

  /** The lines a part offers to line up with: its two edges and its middle, each with the stretch it covers. */
  const linesOf = (others: Box[], frame?: { w: number; h: number } | null) => {
    const xs: Line[] = [];
    const ys: Line[] = [];
    if (frame) {
      for (const v of [0, frame.w / 2, frame.w]) xs.push({ v, from: 0, to: frame.h });
      for (const v of [0, frame.h / 2, frame.h]) ys.push({ v, from: 0, to: frame.w });
    }
    for (const o of others) {
      for (const v of [o.x, o.x + o.w / 2, o.x + o.w]) xs.push({ v, from: o.y, to: o.y + o.h });
      for (const v of [o.y, o.y + o.h / 2, o.y + o.h]) ys.push({ v, from: o.x, to: o.x + o.w });
    }
    return { xs, ys };
  };

  /** Guides for lines of the others that these places of a box lie on (within half a pixel); lines on one place are one. */
  const guidesAt = (xsMine: number[], ysMine: number[], f: Box, cand: { xs: Line[]; ys: Line[] }): Guide[] => {
    const out: Guide[] = [];
    const add = (axis: 'x' | 'y', at: number, from: number, to: number) => {
      const same = out.find((g) => g.axis === axis && near(g.at, at));
      if (same) {
        same.from = Math.min(same.from, from);
        same.to = Math.max(same.to, to);
      } else out.push({ axis, at, from, to });
    };
    for (const c of cand.xs) if (xsMine.some((p) => near(c.v, p))) add('x', c.v, Math.min(c.from, f.y), Math.max(c.to, f.y + f.h));
    for (const c of cand.ys) if (ysMine.some((p) => near(c.v, p))) add('y', c.v, Math.min(c.from, f.x), Math.max(c.to, f.x + f.w));
    return out;
  };

  /**
   * Where a box being moved snaps: its edges and middle to the frame's (when there is one) and to the other parts',
   * within `tol`. The nudge to apply, and the lines to draw, run from the box (where it has snapped to) to every part it
   * lines up with. `x` and `y` say whether that axis snapped.
   */
  const snapMove = (m: Box, others: Box[], tol: number, frame?: { w: number; h: number } | null) => {
    const cand = linesOf(others, frame);
    const best = (mine: number[], cands: Line[]) => {
      let d: number | null = null;
      for (const c of cands)
        for (const p of mine) {
          const e = c.v - p;
          if (Math.abs(e) <= tol && (d === null || Math.abs(e) < Math.abs(d) - 0.01)) d = e;
        }
      return d;
    };
    const dx = best([m.x, m.x + m.w / 2, m.x + m.w], cand.xs);
    const dy = best([m.y, m.y + m.h / 2, m.y + m.h], cand.ys);
    const f = { x: m.x + (dx ?? 0), y: m.y + (dy ?? 0), w: m.w, h: m.h };
    const all = guidesAt(dx === null ? [] : [f.x, f.x + f.w / 2, f.x + f.w], dy === null ? [] : [f.y, f.y + f.h / 2, f.y + f.h], f, cand);
    return { dx: dx ?? 0, dy: dy ?? 0, x: dx !== null, y: dy !== null, guides: all };
  };

  /**
   * Where a box being moved sits between others at the same gap: in the row it is in (others beside it, overlapping it
   * top to bottom) and in its column, as the same gap as the last two neighbours have, or as much to the one side as to
   * the other. Only on an axis not already snapped to a line (`skipX`, `skipY`). The nudge, and the gaps to mark.
   */
  const snapEqual = (m: Box, others: Box[], tol: number, dx0: number, dy0: number, skipX: boolean, skipY: boolean) => {
    let dx = dx0;
    let dy = dy0;
    const gaps: Gap[] = [];
    const eq = (horizontal: boolean) => {
      const a0 = horizontal ? m.x + dx : m.y + dy;
      const size = horizontal ? m.w : m.h;
      const row = others.filter((o) => (horizontal ? o.y < m.y + dy + m.h && o.y + o.h > m.y + dy : o.x < m.x + dx + m.w && o.x + o.w > m.x + dx));
      const start = (o: Box) => (horizontal ? o.x : o.y);
      const len = (o: Box) => (horizontal ? o.w : o.h);
      const before = row.filter((o) => start(o) + len(o) <= a0 + tol).sort((p, q) => start(q) + len(q) - (start(p) + len(p)));
      const after = row.filter((o) => start(o) >= a0 + size - tol).sort((p, q) => start(p) - start(q));
      const cands: { pos: number; marks: [number, number][] }[] = [];
      const L1 = before[0];
      const R1 = after[0];
      if (L1 && R1) {
        const room = start(R1) - (start(L1) + len(L1));
        const g = (room - size) / 2;
        if (g > 0) cands.push({ pos: start(L1) + len(L1) + g, marks: [[start(L1) + len(L1), start(L1) + len(L1) + g], [start(L1) + len(L1) + g + size, start(R1)]] });
      }
      if (L1 && before[1]) {
        const g = start(L1) - (start(before[1]) + len(before[1]));
        if (g > 0) cands.push({ pos: start(L1) + len(L1) + g, marks: [[start(before[1]) + len(before[1]), start(L1)], [start(L1) + len(L1), start(L1) + len(L1) + g]] });
      }
      if (R1 && after[1]) {
        const g = start(after[1]) - (start(R1) + len(R1));
        if (g > 0) cands.push({ pos: start(R1) - g - size, marks: [[start(R1) + len(R1), start(after[1])], [start(R1) - g, start(R1)]] });
      }
      const hit = cands.filter((c) => Math.abs(c.pos - a0) <= tol).sort((p, q) => Math.abs(p.pos - a0) - Math.abs(q.pos - a0))[0];
      if (!hit) return;
      if (horizontal) dx += hit.pos - a0;
      else dy += hit.pos - a0;
      const mid = horizontal ? m.y + dy + m.h / 2 : m.x + dx + m.w / 2;
      for (const [p, q] of hit.marks) gaps.push(horizontal ? { x: p, y: mid, w: q - p, h: 0, vertical: false, value: q - p } : { x: mid, y: p, w: 0, h: q - p, vertical: true, value: q - p });
    };
    if (!skipX) eq(true);
    if (!skipY) eq(false);
    return { dx, dy, gaps };
  };

  /**
   * How far a box is from the nearest part on each side: the parts wholly beside it (and overlapping it the other way),
   * the nearest on each side; with a frame (a page), the page's edge where no part is. Gaps of nothing are left out.
   */
  const neighbourGaps = (f: Box, others: Box[], frame?: { w: number; h: number } | null): Gap[] => {
    const out: Gap[] = [];
    const overlapY = (o: Box) => o.y < f.y + f.h - 0.01 && o.y + o.h > f.y + 0.01;
    const overlapX = (o: Box) => o.x < f.x + f.w - 0.01 && o.x + o.w > f.x + 0.01;
    const midY = (o: Box) => (Math.max(f.y, o.y) + Math.min(f.y + f.h, o.y + o.h)) / 2;
    const midX = (o: Box) => (Math.max(f.x, o.x) + Math.min(f.x + f.w, o.x + o.w)) / 2;
    let L: Box | undefined;
    let R: Box | undefined;
    let T: Box | undefined;
    let B: Box | undefined;
    for (const o of others) {
      if (overlapY(o)) {
        if (o.x + o.w <= f.x + 0.5 && (!L || o.x + o.w > L.x + L.w)) L = o;
        if (o.x >= f.x + f.w - 0.5 && (!R || o.x < R.x)) R = o;
      }
      if (overlapX(o)) {
        if (o.y + o.h <= f.y + 0.5 && (!T || o.y + o.h > T.y + T.h)) T = o;
        if (o.y >= f.y + f.h - 0.5 && (!B || o.y < B.y)) B = o;
      }
    }
    const my = f.y + f.h / 2;
    const mx = f.x + f.w / 2;
    const h = (x0: number, x1: number, y: number) => x1 - x0 > 0.5 && out.push({ x: x0, y, w: x1 - x0, h: 0, vertical: false, value: x1 - x0 });
    const v = (y0: number, y1: number, x: number) => y1 - y0 > 0.5 && out.push({ x, y: y0, w: 0, h: y1 - y0, vertical: true, value: y1 - y0 });
    if (L) h(L.x + L.w, f.x, midY(L));
    else if (frame) h(0, f.x, my);
    if (R) h(f.x + f.w, R.x, midY(R));
    else if (frame) h(f.x + f.w, frame.w, my);
    if (T) v(T.y + T.h, f.y, midX(T));
    else if (frame) v(0, f.y, mx);
    if (B) v(f.y + f.h, B.y, midX(B));
    else if (frame) v(f.y + f.h, frame.h, mx);
    return out;
  };

  /**
   * Where a box being sized ends up. `box` is what the pointer asks for (unsnapped, in no proportion), `from` the box
   * as the drag began, `edges` the edges that move (a corner: two; a side: one). Each moving edge snaps to another
   * part's edge or middle (or the frame's) within `tol`, or makes the box as wide (or as high) as another part, the
   * nearest of those winning; else to the grid. With `ratio` (Shift, or a picture's corner) the box keeps the shape it
   * had: the edge that moved most (in proportion to its size) is snapped and the other side follows from it, about
   * the middle where its own edges do not move.
   */
  const snapResize = (o: { box: Box; from: Box; edges: { l: boolean; r: boolean; t: boolean; b: boolean }; others: Box[]; frame?: { w: number; h: number } | null; tol: number; grid?: number; ratio?: boolean; min?: number }): ResizeSnap => {
    const min = o.min ?? 4;
    const { l, r, t, b } = o.edges;
    const cand = linesOf(o.others, o.frame);
    const axis = (a0: number, a1: number, m0: boolean, m1: boolean, lines: Line[], sizes: number[]): [number, number] => {
      if (!m0 && !m1) return [a0, a1];
      const mv = m0 ? a0 : a1;
      let d: number | null = null;
      for (const c of lines) {
        const e = c.v - mv;
        if (Math.abs(e) <= o.tol && (d === null || Math.abs(e) < Math.abs(d) - 0.01)) d = e;
      }
      for (const s of sizes) {
        if (s < min) continue;
        const e = m1 ? a0 + s - a1 : a1 - s - a0;
        if (Math.abs(e) <= o.tol && (d === null || Math.abs(e) < Math.abs(d) - 0.01)) d = e;
      }
      if (d === null && o.grid) d = Math.round(mv / o.grid) * o.grid - mv;
      const e = d ?? 0;
      let n0 = a0 + (m0 ? e : 0);
      let n1 = a1 + (m1 ? e : 0);
      if (n1 - n0 < min) {
        if (m1) n1 = n0 + min;
        else n0 = n1 - min;
      }
      return [n0, n1];
    };
    const lx = cand.xs;
    const ly = cand.ys;
    let x0 = o.box.x;
    let x1 = o.box.x + o.box.w;
    let y0 = o.box.y;
    let y1 = o.box.y + o.box.h;
    const widths = o.tol > 0 ? o.others.map((p) => p.w) : [];
    const heights = o.tol > 0 ? o.others.map((p) => p.h) : [];
    if (o.ratio && (l || r || t || b)) {
      const ratio = o.from.w / Math.max(0.0001, o.from.h);
      const dw = l || r ? Math.abs(o.box.w - o.from.w) / Math.max(0.0001, o.from.w) : 0;
      const dh = t || b ? Math.abs(o.box.h - o.from.h) / Math.max(0.0001, o.from.h) : 0;
      if ((l || r) && (!(t || b) || dw >= dh)) {
        [x0, x1] = axis(x0, x1, l, r, lx, widths);
        const h = (x1 - x0) / ratio;
        if (t) y0 = o.from.y + o.from.h - h;
        else if (b) y0 = o.from.y;
        else y0 = o.from.y + o.from.h / 2 - h / 2;
        y1 = y0 + h;
      } else {
        [y0, y1] = axis(y0, y1, t, b, ly, heights);
        const w = (y1 - y0) * ratio;
        if (l) x0 = o.from.x + o.from.w - w;
        else if (r) x0 = o.from.x;
        else x0 = o.from.x + o.from.w / 2 - w / 2;
        x1 = x0 + w;
      }
    } else {
      [x0, x1] = axis(x0, x1, l, r, lx, widths);
      [y0, y1] = axis(y0, y1, t, b, ly, heights);
    }
    const box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    // What the moved edges lie on, drawn from the box as it ended up.
    const mine = { xs: [l ? x0 : null, r ? x1 : null].filter((v): v is number => v !== null), ys: [t ? y0 : null, b ? y1 : null].filter((v): v is number => v !== null) };
    const guides = o.tol > 0 ? guidesAt(mine.xs, mine.ys, box, cand) : [];
    const sameW = o.tol > 0 && (l || r) ? o.others.filter((p) => near(p.w, box.w)) : [];
    const sameH = o.tol > 0 && (t || b) ? o.others.filter((p) => near(p.h, box.h)) : [];
    return { box, guides, sameW, sameH };
  };

  return { snapMove, snapEqual, neighbourGaps, snapResize };
}

/** The smart-guide maths, ready to call. */
export const SNAP = snapKit();
