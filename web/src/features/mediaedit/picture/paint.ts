// Painting on a layer's pixels, as Photoshop's brushes do: a stroke is dabs of a round brush (its size, its hardness,
// how much each dab lays down: flow) gathered on a canvas of their own, so the stroke never goes past its opacity
// however often it crosses itself, and laid on the layer when the pointer lets go (Undo takes the tiles it touched back).
// The brush paints the foreground colour; the eraser takes away; the clone stamp paints what is at its source (Alt+click
// sets it, then it follows the brush); dodge lightens and burn darkens (by their exposure); the spot healing brush marks
// what to heal, then fills it from around it (heal.ts). A selection keeps every dab inside it. The gradient (linear or
// radial, the foreground colour to the background colour or to nothing) and the paint bucket (the colour's area, by
// tolerance) are here too.
import type { Live } from './compose';
import { canvasOf, patchesOf, tilesOf, union, type Patch, type RasterLayer } from './doc';
import { dabsTo, healFill, type DabTrail } from './heal';
import { floodMask, type Box, type Mask } from './mask';

export type StrokeKind = 'brush' | 'eraser' | 'clone' | 'dodge' | 'burn' | 'heal';

export interface BrushOpts {
  /** Across, in the canvas's pixels. */
  size: number;
  /** 0 to 100: a soft edge to a hard one. */
  hardness: number;
  /** 0 to 100: the most the stroke lays down. */
  opacity: number;
  /** 0 to 100: what each dab lays down. */
  flow: number;
  color: string;
}

/** The selection as a canvas (its coverage in alpha) and where it is on the canvas, to keep paint inside it. */
export interface SelClip {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
}

/** A selection's mask as a canvas: white, as covered as it is. */
export function selCanvas(m: Mask): HTMLCanvasElement {
  const c = canvasOf(m.w, m.h);
  const g = c.getContext('2d')!;
  const d = g.createImageData(m.w, m.h);
  for (let i = 0; i < m.data.length; i++) {
    const j = i * 4;
    d.data[j] = d.data[j + 1] = d.data[j + 2] = 255;
    d.data[j + 3] = m.data[i];
  }
  g.putImageData(d, 0, 0);
  return c;
}

/** A round brush's dab: full in its middle, fading to nothing at its edge from as far out as its hardness says. */
function stampOf(size: number, hardness: number, color: string): HTMLCanvasElement {
  const r = Math.max(0.5, size / 2);
  const d = Math.max(1, Math.ceil(r * 2) + 2);
  const c = canvasOf(d, d);
  const g = c.getContext('2d')!;
  const cx = d / 2;
  const h = Math.max(0, Math.min(1, hardness / 100));
  if (h >= 0.98 || r < 1.5) {
    g.fillStyle = color;
    g.beginPath();
    g.arc(cx, cx, r, 0, Math.PI * 2);
    g.fill();
    return c;
  }
  const grad = g.createRadialGradient(cx, cx, 0, cx, cx, r);
  grad.addColorStop(0, color);
  grad.addColorStop(Math.max(0.01, h * 0.98), color);
  grad.addColorStop(1, transparentOf(color));
  g.fillStyle = grad;
  g.fillRect(0, 0, d, d);
  return c;
}

const transparentOf = (c: string) => (c.startsWith('#') && c.length >= 7 ? `${c.slice(0, 7)}00` : 'rgba(0,0,0,0)');

/** One canvas for every stroke, as large as the largest layer painted (cleared after each stroke). */
let buffer: HTMLCanvasElement | null = null;
function bufferFor(w: number, h: number): HTMLCanvasElement {
  if (!buffer || buffer.width < w || buffer.height < h) buffer = canvasOf(Math.max(w, buffer?.width ?? 0), Math.max(h, buffer?.height ?? 0));
  return buffer;
}
/** The stroke buffer let go of (a large one takes memory). */
export const freeStrokeBuffer = () => (buffer = null);

export class Stroke {
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private stamp: HTMLCanvasElement;
  private trail: DabTrail | null = null;
  bbox: Box | null = null;
  readonly tiles = new Set<string>();
  private dab: HTMLCanvasElement | null = null;
  /** Dabs for a lighter press of a pen: the brush's own dab made smaller, by twentieths. */
  private lighter = new Map<number, HTMLCanvasElement>();
  constructor(
    readonly kind: StrokeKind,
    readonly layer: RasterLayer,
    readonly o: BrushOpts,
    private sel: SelClip | null,
    /** The clone stamp's source (in the layer's pixels, taken as the stroke began) and how far from the brush it is. */
    private source?: { canvas: HTMLCanvasElement; dx: number; dy: number },
  ) {
    this.canvas = bufferFor(layer.px.w, layer.px.h);
    this.g = this.canvas.getContext('2d')!;
    const color = kind === 'brush' ? o.color : kind === 'dodge' ? '#ffffff' : kind === 'heal' ? '#ff3b6b' : '#000000';
    this.stamp = stampOf(o.size, kind === 'heal' ? Math.max(o.hardness, 60) : o.hardness, kind === 'clone' ? '#000000' : color);
  }

  /** How it shows while it is painted, over its layer. */
  get live(): NonNullable<Live['stroke']> {
    const a = this.o.opacity / 100;
    switch (this.kind) {
      case 'eraser':
        return { layer: this.layer.id, canvas: this.canvas, op: 'destination-out', alpha: a };
      case 'dodge':
      case 'burn':
        return { layer: this.layer.id, canvas: this.canvas, op: 'soft-light', alpha: a, keepAlpha: true };
      case 'heal':
        return { layer: this.layer.id, canvas: this.canvas, op: 'source-over', alpha: 0.55 };
      default:
        return { layer: this.layer.id, canvas: this.canvas, op: 'source-over', alpha: a };
    }
  }

  /** The brush moved to (x, y), in the canvas's pixels: its dabs laid down; the part of the layer they changed. */
  to(X: number, Y: number, pressure = 1): Box | null {
    const x = X - this.layer.x;
    const y = Y - this.layer.y;
    // A pen pressed lightly paints smaller and fainter (a mouse always presses fully).
    const p = Math.max(0, Math.min(1, pressure));
    const step = p >= 1 ? 20 : Math.max(2, Math.round((0.1 + 0.9 * p) * 20));
    const stamp = step === 20 ? this.stamp : this.stampAt(step);
    const flow = p >= 1 ? this.o.flow : this.o.flow * (0.35 + 0.65 * p);
    const spacing = Math.max(0.5, this.o.size * 0.1 * (step / 20));
    let pts: number[];
    if (!this.trail) {
      pts = [x, y];
      this.trail = { x, y, carry: 0 };
    } else {
      const r = dabsTo(this.trail, x, y, spacing);
      pts = r.pts;
      this.trail = r.trail;
    }
    let changed: Box | null = null;
    for (let i = 0; i < pts.length; i += 2) {
      const b = this.dabAt(pts[i], pts[i + 1], stamp, flow);
      changed = changed ? union(changed, b) : b;
    }
    return changed;
  }

  private stampAt(step: number): HTMLCanvasElement {
    let c = this.lighter.get(step);
    if (!c) {
      const kind = this.kind;
      const color = kind === 'brush' ? this.o.color : kind === 'dodge' ? '#ffffff' : kind === 'heal' ? '#ff3b6b' : '#000000';
      c = stampOf((this.o.size * step) / 20, kind === 'heal' ? Math.max(this.o.hardness, 60) : this.o.hardness, kind === 'clone' ? '#000000' : color);
      this.lighter.set(step, c);
    }
    return c;
  }

  private dabAt(x: number, y: number, s: HTMLCanvasElement, flow: number): Box {
    const left = Math.round(x - s.width / 2);
    const top = Math.round(y - s.height / 2);
    const g = this.g;
    g.save();
    g.globalAlpha = this.kind === 'heal' ? 1 : flow / 100;
    if (this.kind === 'clone' && this.source) {
      // What is at the source, cut to the brush's shape.
      const d = (this.dab ??= canvasOf(s.width, s.height));
      if (d.width !== s.width || d.height !== s.height) [d.width, d.height] = [s.width, s.height];
      const dg = d.getContext('2d')!;
      dg.globalCompositeOperation = 'copy';
      dg.drawImage(this.source.canvas, left + this.source.dx, top + this.source.dy, s.width, s.height, 0, 0, s.width, s.height);
      dg.globalCompositeOperation = 'destination-in';
      dg.drawImage(s, 0, 0);
      g.drawImage(d, left, top);
    } else g.drawImage(s, left, top);
    g.restore();
    const box = { x: left, y: top, w: s.width, h: s.height };
    if (this.sel) {
      g.save();
      g.beginPath();
      g.rect(left, top, s.width, s.height);
      g.clip();
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(this.sel.canvas, this.sel.x - this.layer.x, this.sel.y - this.layer.y);
      g.restore();
    }
    const inside = { x: Math.max(0, left), y: Math.max(0, top), w: Math.min(this.layer.px.w, left + s.width) - Math.max(0, left), h: Math.min(this.layer.px.h, top + s.height) - Math.max(0, top) };
    if (inside.w > 0 && inside.h > 0) {
      this.bbox = this.bbox ? union(this.bbox, inside) : inside;
      tilesOf(inside, this.layer.px.w, this.layer.px.h, this.tiles);
    }
    return box;
  }

  /** The heal's area: as much of each pixel of `r` (in the layer's pixels) as was painted over. */
  holeIn(r: Box): Uint8Array {
    const d = this.g.getImageData(r.x, r.y, r.w, r.h).data;
    const out = new Uint8Array(r.w * r.h);
    for (let i = 0; i < out.length; i++) out[i] = d[i * 4 + 3];
    return out;
  }

  /** The stroke laid on its layer (or, for the healing brush, the spots filled): the patches Undo needs. */
  commit(): Patch[] {
    const b = this.bbox;
    if (!b) return this.clear();
    const px = this.layer.px;
    if (this.kind === 'heal') {
      // The painted part and a margin round it, to fill from.
      const m = Math.ceil(this.o.size);
      const r = { x: Math.max(0, b.x - m), y: Math.max(0, b.y - m), w: 0, h: 0 };
      r.w = Math.min(px.w, b.x + b.w + m) - r.x;
      r.h = Math.min(px.h, b.y + b.h + m) - r.y;
      const hole = this.holeIn(r);
      const patches = patchesOf(px, tilesOf(r, px.w, px.h));
      const g = px.ctx();
      const d = g.getImageData(r.x, r.y, r.w, r.h);
      healFill(d.data, r.w, r.h, hole);
      g.putImageData(d, r.x, r.y);
      px.touch(r);
      this.clear();
      return patches;
    }
    const patches = patchesOf(px, this.tiles);
    const g = px.ctx();
    g.save();
    g.globalAlpha = this.o.opacity / 100;
    if (this.kind === 'eraser') g.globalCompositeOperation = 'destination-out';
    else if (this.kind === 'dodge' || this.kind === 'burn') {
      const before = canvasOf(b.w, b.h);
      before.getContext('2d')!.drawImage(px.canvas, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
      g.globalCompositeOperation = 'soft-light';
      g.drawImage(this.canvas, b.x, b.y, b.w, b.h, b.x, b.y, b.w, b.h);
      // The layer's own see-through parts stay as they were.
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(before, b.x, b.y);
      g.restore();
      px.touch(b);
      this.clear();
      return patches;
    }
    g.drawImage(this.canvas, b.x, b.y, b.w, b.h, b.x, b.y, b.w, b.h);
    g.restore();
    px.touch(b);
    this.clear();
    return patches;
  }

  /** The stroke dropped (its canvas left clear for the next one). */
  clear(): Patch[] {
    const b = this.bbox;
    if (b) this.g.clearRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
    this.bbox = null;
    return [];
  }

  /** How much of the layer was painted over (to tell a spot from a larger area to heal). */
  get area(): number {
    return this.bbox ? this.bbox.w * this.bbox.h : 0;
  }
}

// ---- gradient and bucket ----------------------------------------------------------------------------------------------

export type GradientKind = 'linear' | 'radial';

/**
 * A gradient from (x0, y0) to (x1, y1) (the canvas's pixels) on a canvas the layer's size: the foreground colour to the
 * background colour (or to nothing), inside the selection when there is one.
 */
export function gradientCanvas(layer: RasterLayer, kind: GradientKind, a: [number, number], b: [number, number], from: string, to: string, sel: SelClip | null): HTMLCanvasElement {
  const c = bufferFor(layer.px.w, layer.px.h);
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);
  const ax = a[0] - layer.x;
  const ay = a[1] - layer.y;
  const bx = b[0] - layer.x;
  const by = b[1] - layer.y;
  const grad = kind === 'radial' ? g.createRadialGradient(ax, ay, 0, ax, ay, Math.max(1, Math.hypot(bx - ax, by - ay))) : g.createLinearGradient(ax, ay, bx, by);
  grad.addColorStop(0, from);
  grad.addColorStop(1, to);
  g.fillStyle = grad;
  g.fillRect(0, 0, layer.px.w, layer.px.h);
  if (sel) {
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(sel.canvas, sel.x - layer.x, sel.y - layer.y);
    // Beyond the selection's own box: nothing.
    g.globalCompositeOperation = 'source-over';
    const sx = sel.x - layer.x;
    const sy = sel.y - layer.y;
    g.clearRect(0, 0, layer.px.w, Math.max(0, sy));
    g.clearRect(0, sy + sel.canvas.height, layer.px.w, layer.px.h);
    g.clearRect(0, 0, Math.max(0, sx), layer.px.h);
    g.clearRect(sx + sel.canvas.width, 0, layer.px.w, layer.px.h);
  }
  return c;
}

/** A canvas laid on a layer (at `alpha`), within `area` of it: the patches Undo needs. */
export function layOn(layer: RasterLayer, c: HTMLCanvasElement, alpha: number, area?: Box): Patch[] {
  const px = layer.px;
  const r = area ?? { x: 0, y: 0, w: px.w, h: px.h };
  const patches = patchesOf(px, tilesOf(r, px.w, px.h));
  const g = px.ctx();
  g.save();
  g.globalAlpha = alpha;
  g.drawImage(c, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
  g.restore();
  px.touch(r);
  bufferFor(1, 1).getContext('2d')!.clearRect(0, 0, c.width, c.height);
  return patches;
}

/**
 * The paint bucket: the area of the colour at (x, y) on the layer (within `tolerance`, touching it or anywhere) filled
 * with `color` at `alpha`, inside the selection: the patches Undo needs, or null when nothing is there to fill.
 */
export function bucketFill(layer: RasterLayer, x: number, y: number, o: { tolerance: number; contiguous: boolean; color: string; alpha: number; sel: Mask | null }): Patch[] | null {
  const px = layer.px;
  const lx = Math.floor(x - layer.x);
  const ly = Math.floor(y - layer.y);
  if (lx < 0 || ly < 0 || lx >= px.w || ly >= px.h) return null;
  const g = px.ctx();
  const all = g.getImageData(0, 0, px.w, px.h);
  const m = floodMask(all.data, px.w, px.h, lx, ly, o.tolerance, o.contiguous);
  if (!m) return null;
  const r = { x: m.x, y: m.y, w: m.w, h: m.h };
  const patches = patchesOf(px, tilesOf(r, px.w, px.h));
  const [cr, cg, cb] = [1, 3, 5].map((i) => parseInt(o.color.slice(i, i + 2), 16) || 0);
  const d = g.getImageData(r.x, r.y, r.w, r.h);
  for (let yy = 0; yy < r.h; yy++)
    for (let xx = 0; xx < r.w; xx++) {
      let a = (m.data[yy * m.w + xx] / 255) * o.alpha;
      if (o.sel) {
        const sx = xx + r.x + layer.x - o.sel.x;
        const sy = yy + r.y + layer.y - o.sel.y;
        a *= sx >= 0 && sy >= 0 && sx < o.sel.w && sy < o.sel.h ? o.sel.data[sy * o.sel.w + sx] / 255 : 0;
      }
      if (a <= 0) continue;
      const i = (yy * r.w + xx) * 4;
      const da = d.data[i + 3] / 255;
      const oa = a + da * (1 - a);
      d.data[i] = (cr * a + d.data[i] * da * (1 - a)) / oa;
      d.data[i + 1] = (cg * a + d.data[i + 1] * da * (1 - a)) / oa;
      d.data[i + 2] = (cb * a + d.data[i + 2] * da * (1 - a)) / oa;
      d.data[i + 3] = oa * 255;
    }
  g.putImageData(d, r.x, r.y);
  px.touch(r);
  return patches;
}
