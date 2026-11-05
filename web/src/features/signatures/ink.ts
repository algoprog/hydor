// The signature pad's ink: strokes as the pointer gives them, each point with a width that follows a pen's pressure
// where the device reports it, and otherwise the hand's speed (quick strokes thin, slow ones full, as a fountain pen's
// ink flows), smoothed so it swells and thins gradually. Drawn as curves through the points' midpoints, each piece in
// small steps of their widths, so a stroke is round at its ends and smooth at any size: on the pad as it is drawn, and
// again at print resolution for the signature's picture.

export interface InkPoint {
  x: number;
  y: number;
  /** The stroke's width here, in the same units as x and y. */
  w: number;
}

export interface Stroke {
  color: string;
  pts: InkPoint[];
}

/** The inks: black, blue as a ballpoint's, and a dark blue. */
export const INKS: { color: string; label: string }[] = [
  { color: '#16181d', label: 'Black ink' },
  { color: '#1f45b5', label: 'Blue ink' },
  { color: '#14245c', label: 'Dark blue ink' },
];

/** How a stroke's width is worked out as points come in. */
export class Nib {
  private last: { x: number; y: number; t: number; w: number } | null = null;
  constructor(private base: number) {}

  /** The width at a new point: from `pressure` when the pen gives it (0–1), else from the speed since the last point. */
  width(x: number, y: number, t: number, pressure: number | null): number {
    const prev = this.last;
    let target: number;
    if (pressure !== null) target = this.base * (0.3 + 1.15 * Math.pow(Math.min(1, Math.max(0, pressure)), 0.8));
    else if (!prev) target = this.base * 0.9;
    else {
      const v = Math.hypot(x - prev.x, y - prev.y) / Math.max(1, t - prev.t);
      target = this.base * Math.min(1.3, Math.max(0.42, 1.32 - 0.36 * v));
    }
    // Gradually: a sudden change in speed or pressure swells or thins the line over a few points.
    const w = prev ? prev.w + (target - prev.w) * (pressure !== null ? 0.5 : 0.3) : target;
    this.last = { x, y, t, w };
    return w;
  }
}

const mid = (a: InkPoint, b: InkPoint): InkPoint => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, w: (a.w + b.w) / 2 });

/** One piece of a stroke from `a` to `b` (a curve bent towards `c` when given), in steps a fraction of a pixel long. */
function piece(ctx: CanvasRenderingContext2D, a: InkPoint, b: InkPoint, c: InkPoint | null, k: number) {
  const len = c ? Math.hypot(c.x - a.x, c.y - a.y) + Math.hypot(b.x - c.x, b.y - c.y) : Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil((len * k) / 0.7));
  let px = a.x;
  let py = a.y;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    let x: number;
    let y: number;
    if (c) {
      const u = 1 - t;
      x = u * u * a.x + 2 * u * t * c.x + t * t * b.x;
      y = u * u * a.y + 2 * u * t * c.y + t * t * b.y;
    } else {
      x = a.x + (b.x - a.x) * t;
      y = a.y + (b.y - a.y) * t;
    }
    ctx.lineWidth = Math.max(0.5, (a.w + (b.w - a.w) * t) * k);
    ctx.beginPath();
    ctx.moveTo(px * k, py * k);
    ctx.lineTo(x * k, y * k);
    ctx.stroke();
    px = x;
    py = y;
  }
}

function ready(ctx: CanvasRenderingContext2D, color: string) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

/** A dot: a stroke of one point (a tap). */
function dot(ctx: CanvasRenderingContext2D, p: InkPoint, k: number) {
  ctx.beginPath();
  ctx.arc(p.x * k, p.y * k, Math.max(0.5, (p.w * k) / 2), 0, Math.PI * 2);
  ctx.fill();
}

/**
 * The part of a stroke that its newest point settles: the curve ending at the middle of its last two points (drawn as
 * the pen moves). `done`: the stroke ended, so its last half piece goes on too.
 */
export function drawTail(ctx: CanvasRenderingContext2D, s: Stroke, k: number, done = false) {
  const p = s.pts;
  const n = p.length;
  ready(ctx, s.color);
  if (n === 1) {
    if (done) dot(ctx, p[0], k);
    return;
  }
  if (n === 2) piece(ctx, p[0], mid(p[0], p[1]), null, k);
  else piece(ctx, mid(p[n - 3], p[n - 2]), mid(p[n - 2], p[n - 1]), p[n - 2], k);
  if (done) piece(ctx, mid(p[n - 2], p[n - 1]), p[n - 1], null, k);
}

/** A whole stroke, at scale `k` (its units to the canvas's pixels). */
export function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, k: number) {
  const p = s.pts;
  ready(ctx, s.color);
  if (p.length === 1) return dot(ctx, p[0], k);
  piece(ctx, p[0], mid(p[0], p[1]), null, k);
  for (let i = 1; i < p.length - 1; i++) piece(ctx, mid(p[i - 1], p[i]), mid(p[i], p[i + 1]), p[i], k);
  piece(ctx, mid(p[p.length - 2], p[p.length - 1]), p[p.length - 1], null, k);
}

/** The box the strokes' ink covers, in their units. */
export function inkBounds(strokes: Stroke[]): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of strokes)
    for (const p of s.pts) {
      x0 = Math.min(x0, p.x - p.w);
      y0 = Math.min(y0, p.y - p.w);
      x1 = Math.max(x1, p.x + p.w);
      y1 = Math.max(y1, p.y + p.w);
    }
  return x1 > x0 ? { x0, y0, x1, y1 } : null;
}
