// Snapping and smart guides for the picture editor, as pure maths (nothing here touches the screen): where a box being
// moved lines up with the canvas's edges and middle, the guides pulled out of the rulers and the other layers' boxes,
// within a few screen pixels; the pink lines to draw for what it lined up with; the gaps (distances) to the nearest
// neighbours or the canvas's edges, drawn as small pills; and the same snapping for a guide being dragged. Also what
// Align does (a layer's box against the canvas) and where a part that was copied goes when pasted at a point. The View
// draws what these return, the Move tool and the free transform feed them.
import type { Box } from './mask';

/** What a box can line up with. The canvas's own edges and middle are always there. */
export interface SnapTargets {
  /** The canvas. */
  w: number;
  h: number;
  /** Guides: x of the vertical ones, y of the horizontal ones. */
  guidesV: number[];
  guidesH: number[];
  /** The other visible layers' boxes. */
  boxes: Box[];
}

/** A pink line: `axis` 'v' is a vertical line at x = `pos` from `from` to `to` (y); 'h' the other way. */
export interface SnapLine {
  axis: 'v' | 'h';
  pos: number;
  from: number;
  to: number;
}

/** A distance shown: the span from (x1, y1) to (x2, y2) with its number in a pill in the middle. */
export interface SnapGap {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  text: string;
}

export interface SnapResult {
  /** The move to make instead (whole pixels when snapped to whole ones). */
  dx: number;
  dy: number;
  lines: SnapLine[];
  gaps: SnapGap[];
  /** Which axes lined up. */
  x: boolean;
  y: boolean;
}

export interface SnapOpts {
  /** How near counts as near, in canvas pixels (a few screen pixels over the zoom). */
  tol: number;
  /** Straight: a move on one axis only (Shift): the other does not move or snap. */
  lock?: 'x' | 'y' | null;
}

const NEAR = 0.5;

const xsOf = (b: Box) => [b.x, b.x + b.w / 2, b.x + b.w];
const ysOf = (b: Box) => [b.y, b.y + b.h / 2, b.y + b.h];

/** The move kept to the longer way (Shift held while dragging): which axis is locked, from how far it went each way. */
export function straightLock(dx: number, dy: number): 'x' | 'y' {
  return Math.abs(dx) >= Math.abs(dy) ? 'y' : 'x';
}

/**
 * The best line-up on one axis: of a box's three lines (`mine`: near edge, middle, far edge) against every target line
 * (`at`, each with where it came from: 'canvas', 'guide' or the box's index), the shift that closes the smallest gap
 * within `tol`, and every target that lines up there. null when none is near.
 */
function bestFit(mine: number[], at: { pos: number; from: 'canvas' | 'guide' | number }[], tol: number): { shift: number; pos: number; from: ('canvas' | 'guide' | number)[] } | null {
  let best: { shift: number; pos: number } | null = null;
  for (const m of mine)
    for (const a of at) {
      const d = a.pos - m;
      if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.shift) - 1e-9)) best = { shift: d, pos: a.pos };
    }
  if (!best) return null;
  const pos = best.pos;
  return { shift: best.shift, pos, from: at.filter((a) => Math.abs(a.pos - pos) < NEAR).map((a) => a.from) };
}

/** Every line a box can line up with on one axis. */
function lineTargets(t: SnapTargets, axis: 'x' | 'y'): { pos: number; from: 'canvas' | 'guide' | number }[] {
  const size = axis === 'x' ? t.w : t.h;
  const out: { pos: number; from: 'canvas' | 'guide' | number }[] = [0, size / 2, size].map((pos) => ({ pos, from: 'canvas' as const }));
  for (const g of axis === 'x' ? t.guidesV : t.guidesH) out.push({ pos: g, from: 'guide' });
  t.boxes.forEach((b, i) => {
    for (const pos of axis === 'x' ? xsOf(b) : ysOf(b)) out.push({ pos, from: i });
  });
  return out;
}

/** The gap from a moved box to what is nearest on one side (a box that overlaps it across, else the canvas's edge). */
function gapOf(m: Box, t: SnapTargets, side: 'l' | 'r' | 't' | 'b'): SnapGap | null {
  const horizontal = side === 'l' || side === 'r';
  // The moved box's span across (the way the gap does not run), to find neighbours that face it.
  const a0 = horizontal ? m.y : m.x;
  const a1 = horizontal ? m.y + m.h : m.x + m.w;
  const near = horizontal ? (side === 'l' ? m.x : m.x + m.w) : side === 't' ? m.y : m.y + m.h;
  let edge = side === 'l' || side === 't' ? 0 : horizontal ? t.w : t.h;
  // The canvas's edge is the neighbour unless the box is out past it.
  if (side === 'l' || side === 't' ? near < edge : near > edge) return null;
  for (const b of t.boxes) {
    const b0 = horizontal ? b.y : b.x;
    const b1 = horizontal ? b.y + b.h : b.x + b.w;
    if (b1 <= a0 || b0 >= a1) continue;
    const far = horizontal ? (side === 'l' ? b.x + b.w : b.x) : side === 't' ? b.y + b.h : b.y;
    if (side === 'l' || side === 't' ? far <= near && far > edge : far >= near && far < edge) edge = far;
  }
  const gap = Math.abs(near - edge);
  if (gap < 1) return null;
  const mid = (Math.max(a0, 0) + Math.min(a1, horizontal ? t.h : t.w)) / 2;
  const across = Number.isFinite(mid) ? mid : (a0 + a1) / 2;
  const text = String(Math.round(gap));
  return horizontal ? { x1: edge, y1: across, x2: near, y2: across, text } : { x1: across, y1: edge, x2: across, y2: near, text };
}

/**
 * A box moved by (dx, dy), snapped: its edges and middle drawn to the canvas's edges and middle, the guides and the other
 * boxes' edges and middles, within `tol`. Returns the move to make, the lines for what it lined up with and, on each
 * axis that lined up, the gaps to its neighbours on both sides.
 */
export function snapMove(b: Box, dx: number, dy: number, t: SnapTargets, o: SnapOpts): SnapResult {
  let mx = o.lock === 'x' ? 0 : dx;
  let my = o.lock === 'y' ? 0 : dy;
  const lines: SnapLine[] = [];
  const fx = o.lock === 'x' ? null : bestFit(xsOf({ ...b, x: b.x + mx }), lineTargets(t, 'x'), o.tol);
  const fy = o.lock === 'y' ? null : bestFit(ysOf({ ...b, y: b.y + my }), lineTargets(t, 'y'), o.tol);
  if (fx) mx += fx.shift;
  if (fy) my += fy.shift;
  const m: Box = { x: b.x + mx, y: b.y + my, w: b.w, h: b.h };
  const span = (from: ('canvas' | 'guide' | number)[], axis: 'v' | 'h'): [number, number] => {
    // A line to the canvas or a guide runs the whole canvas; to a box it joins the two boxes.
    let lo = axis === 'v' ? m.y : m.x;
    let hi = axis === 'v' ? m.y + m.h : m.x + m.w;
    for (const f of from) {
      if (typeof f !== 'number') return axis === 'v' ? [0, t.h] : [0, t.w];
      const bb = t.boxes[f];
      lo = Math.min(lo, axis === 'v' ? bb.y : bb.x);
      hi = Math.max(hi, axis === 'v' ? bb.y + bb.h : bb.x + bb.w);
    }
    return [lo, hi];
  };
  if (fx) lines.push({ axis: 'v', pos: fx.pos, from: span(fx.from, 'v')[0], to: span(fx.from, 'v')[1] });
  if (fy) lines.push({ axis: 'h', pos: fy.pos, from: span(fy.from, 'h')[0], to: span(fy.from, 'h')[1] });
  const gaps: SnapGap[] = [];
  const add = (g: SnapGap | null) => g && gaps.push(g);
  if (fx) (add(gapOf(m, t, 'l')), add(gapOf(m, t, 'r')));
  if (fy) (add(gapOf(m, t, 't')), add(gapOf(m, t, 'b')));
  return { dx: mx, dy: my, lines, gaps, x: !!fx, y: !!fy };
}

/** A guide's position snapped to the canvas's edges and middle, the other guides and the layers' edges and middles, within `tol`. */
export function snapGuide(pos: number, axis: 'v' | 'h', t: SnapTargets, tol: number, skip = -1): number {
  const at = lineTargets({ ...t, guidesV: axis === 'v' ? t.guidesV.filter((_, i) => i !== skip) : t.guidesV, guidesH: axis === 'h' ? t.guidesH.filter((_, i) => i !== skip) : t.guidesH }, axis === 'v' ? 'x' : 'y');
  const f = bestFit([pos], at, tol);
  return f ? f.pos : pos;
}

/** What Align can do against the canvas. */
export type AlignHow = 'left' | 'centre' | 'right' | 'top' | 'middle' | 'bottom';

/** The move that puts a box on the canvas's left, middle, right, top, centre or bottom (whole pixels), the other way 0. */
export function alignDelta(b: Box, how: AlignHow, w: number, h: number): { dx: number; dy: number } {
  switch (how) {
    case 'left':
      return { dx: Math.round(-b.x), dy: 0 };
    case 'centre':
      return { dx: Math.round((w - b.w) / 2 - b.x), dy: 0 };
    case 'right':
      return { dx: Math.round(w - b.w - b.x), dy: 0 };
    case 'top':
      return { dx: 0, dy: Math.round(-b.y) };
    case 'middle':
      return { dx: 0, dy: Math.round((h - b.h) / 2 - b.y) };
    case 'bottom':
      return { dx: 0, dy: Math.round(h - b.h - b.y) };
  }
}

/** Where something `w` × `h` goes to have its middle at (x, y), kept whole on the canvas when it fits (whole pixels). */
export function centredAt(x: number, y: number, w: number, h: number, W: number, H: number): { x: number; y: number } {
  const clamp = (v: number, size: number, room: number) => (size >= room ? Math.round((room - size) / 2) : Math.max(0, Math.min(room - size, Math.round(v - size / 2))));
  return { x: clamp(x, w, W), y: clamp(y, h, H) };
}
