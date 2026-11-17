// Where the parts of a quadrant chart go: the dots pushed apart, the quadrants' names in their cells, and each point's name beside its dot.
// Pure arithmetic on pixels (no React, no DOM): the caller measures text and passes it as `width`.

export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
export type Anchor = 'start' | 'middle' | 'end';

/** Whether two boxes come closer than `gap` (0: they cross). */
export const overlaps = (a: Box, b: Box, gap = 0) => a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.y0 < b.y1 + gap && b.y0 < a.y1 + gap;

/**
 * The dots pushed apart until no two centres are closer than 2r+2, kept inside the plot and out of the `keepOut` boxes (the
 * quadrants' names: a dot under one moves up or down, towards the plot's middle, just clear of it). Those that touch
 * nothing stay where they are.
 */
export function spread(points: { x: number; y: number }[], r: number, plot: Box, keepOut: Box[] = [], rounds = 60): { x: number; y: number }[] {
  const p = points.map((q) => ({ x: q.x, y: q.y }));
  const min = 2 * r + 2;
  const clampTo = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  for (let round = 0; round < rounds; round++) {
    let moved = false;
    for (let i = 0; i < p.length; i++) {
      for (let j = i + 1; j < p.length; j++) {
        const dx = p[j].x - p[i].x;
        const dy = p[j].y - p[i].y;
        const d = Math.hypot(dx, dy);
        if (d >= min - 1e-9) continue;
        const ux = d > 1e-9 ? dx / d : Math.cos((i + j) * 2.39996);
        const uy = d > 1e-9 ? dy / d : Math.sin((i + j) * 2.39996);
        const push = (min - d) / 2;
        p[i].x -= ux * push;
        p[i].y -= uy * push;
        p[j].x += ux * push;
        p[j].y += uy * push;
        moved = true;
      }
    }
    const midY = (plot.y0 + plot.y1) / 2;
    for (const q of p) {
      for (const b of keepOut) {
        if (!overlaps(b, { x0: q.x - r, x1: q.x + r, y0: q.y - r, y1: q.y + r }, 1)) continue;
        q.y = (b.y0 + b.y1) / 2 < midY ? b.y1 + r + 1 : b.y0 - r - 1;
        moved = true;
      }
      const x = clampTo(q.x, plot.x0 + r + 1, plot.x1 - r - 1);
      const y = clampTo(q.y, plot.y0 + r + 1, plot.y1 - r - 1);
      if (x !== q.x || y !== q.y) moved = true;
      q.x = x;
      q.y = y;
    }
    if (!moved) break;
  }
  return p;
}

/** A name on one line if it fits, else on two (broken where the longer line is shortest), else null. */
export function wrapName(name: string, maxW: number, width: (s: string) => number): string[] | null {
  if (!name) return [''];
  if (width(name) <= maxW) return [name];
  let best: string[] | null = null;
  let bestW = Infinity;
  for (let i = 0; i < name.length; i++) {
    if (name[i] !== ' ') continue;
    const a = name.slice(0, i).trim();
    const b = name.slice(i + 1).trim();
    if (!a || !b) continue;
    const w = Math.max(width(a), width(b));
    if (w < bestW) {
      bestW = w;
      best = [a, b];
    }
  }
  return best && bestW <= maxW ? best : null;
}

/** Which quadrant a point is in, in the order of the spec's names: 0 top left, 1 top right, 2 bottom left, 3 bottom right. */
export const quadrantOf = (x: number, y: number) => (y >= 50 ? 0 : 2) + (x >= 50 ? 1 : 0);

export interface Corner {
  x: number;
  y: number;
  anchor: 'start' | 'end';
  box: Box;
}

/**
 * Where each quadrant's name goes in its cell: its outer corner, else slid along the plot's outer edge towards the middle
 * line to the first gap between the dots; with no gap, the outer corner still (`spread` with these boxes then moves the
 * dots under it just clear of it). Never by the middle line, where a name would seem to label the cell beyond it.
 */
export function placeCorners(names: string[], dots: { x: number; y: number }[], r: number, plot: Box, width: (s: string) => number): (Corner | null)[] {
  const mx = (plot.x0 + plot.x1) / 2;
  const dotBoxes = dots.map((d) => ({ x0: d.x - r - 2, x1: d.x + r + 2, y0: d.y - r - 2, y1: d.y + r + 2 }));
  return [0, 1, 2, 3].map((k) => {
    const name = names[k] ?? '';
    if (!name) return null;
    const right = k % 2 === 1;
    const bottom = k >= 2;
    const left = right ? mx : plot.x0;
    const rightEdge = right ? plot.x1 : mx;
    const w = width(name) + 4;
    const y = bottom ? plot.y1 - 9 : plot.y0 + 15;
    const at = (off: number): Corner => {
      const x = right ? rightEdge - 8 - off : left + 8 + off;
      return { x, y, anchor: right ? 'end' : 'start', box: { x0: right ? x - w : x, x1: right ? x : x + w, y0: y - 10, y1: y + 4 } };
    };
    // From 8px in from the plot's side to 4px short of the middle line, 2px at a time.
    const room = rightEdge - left - 12 - w;
    for (let off = 0; off <= room; off += 2) {
      const c = at(off);
      if (!dotBoxes.some((b) => overlaps(b, c.box))) return c;
    }
    return at(0);
  });
}

/** The dots and the quadrants' names together: the dots pushed apart, the names placed, and any dot under a name moved clear of it. */
export function dotsAndCorners(raw: { x: number; y: number }[], names: string[], r: number, plot: Box, width: (s: string) => number) {
  const corners = placeCorners(names, spread(raw, r, plot), r, plot, width);
  return { dots: spread(raw, r, plot, corners.flatMap((c) => (c ? [c.box] : []))), corners };
}

export interface Placed {
  x: number;
  anchor: Anchor;
  box: Box;
  lines: string[];
}

/** Where each point's name goes beside its dot, every one clear of the dots, the quadrants' names and each other; null if they cannot all fit. */
export function placeLabels(items: { x: number; y: number; lines: string[]; w: number }[], r: number, plot: Box, taken: Box[], lineH = 13.5): (Placed | null)[] | null {
  const dotBoxes = items.map((it) => ({ x0: it.x - r - 2, x1: it.x + r + 2, y0: it.y - r - 2, y1: it.y + r + 2 }));
  const inner: Box = { x0: plot.x0 + 3, x1: plot.x1 - 3, y0: plot.y0 + 3, y1: plot.y1 - 3 };
  const candidates = items.map((it) => {
    const h = it.lines.length * lineH;
    const { x: px, y: py, w } = it;
    const make = (anchor: Anchor, x0: number, y0: number): Placed => ({ x: anchor === 'start' ? x0 : anchor === 'end' ? x0 + w : x0 + w / 2, anchor, box: { x0, x1: x0 + w, y0, y1: y0 + h }, lines: it.lines });
    const list = [
      make('start', px + r + 4, py - h / 2),
      make('end', px - r - 4 - w, py - h / 2),
      make('middle', px - w / 2, py - r - 3 - h),
      make('middle', px - w / 2, py + r + 3),
      make('start', px + 4, py - r - 2 - h),
      make('start', px + 4, py + r + 2),
      make('end', px - 4 - w, py - r - 2 - h),
      make('end', px - 4 - w, py + r + 2),
    ];
    return list.filter((c) => c.box.x0 >= inner.x0 && c.box.x1 <= inner.x1 && c.box.y0 >= inner.y0 && c.box.y1 <= inner.y1 && !dotBoxes.some((b) => overlaps(b, c.box)) && !taken.some((b) => overlaps(b, c.box)));
  });
  const n = items.length;
  const index = Array.from({ length: n }, (_, i) => i);
  const orders = [[...index].sort((a, b) => candidates[a].length - candidates[b].length || a - b), index, [...index].sort((a, b) => items[a].x - items[b].x || a - b), [...index].sort((a, b) => items[b].x - items[a].x || a - b)];
  for (const order of orders) {
    const out: Placed[] = [];
    let ok = true;
    for (const i of order) {
      const c = candidates[i].find((cand) => !out.some((o) => overlaps(o.box, cand.box, 3)));
      if (!c) {
        ok = false;
        break;
      }
      out[i] = c;
    }
    if (ok) return index.map((i) => out[i]);
  }
  return null;
}
