// The picture editor's document: a stack of layers over a canvas of a size, and what is selected. Layers are pixels
// (a photo, a picture added, paint: a canvas at a place), marks (words, shapes, lines and arrows, freehand lines,
// emoji, and blurred or pixelated areas, as the Markup tools made them, each its own layer, movable and turnable until
// the picture is saved) and adjustments (a look laid over everything under it, or only the layer under it, through a
// mask when it was made with a selection). Each layer shows or hides, has an opacity, a blend mode, a lock and a name.
//
// A document is plain and never changed once made: each change makes a new one (sharing what did not change), so the
// history is a list of documents. Pixels are the one thing changed in place, by painting: those changes are kept as
// patches (the tiles a stroke touched, as they were), swapped back and forth by Undo and Redo. History keeps up to 60
// steps, and drops the oldest when what it holds passes its memory budget.
import type { BlendMode } from '@shared/blend';
import type { LookSettings, Mark } from '@shared/mediaedit';
import type { Box, Mask } from './mask';

export type Sel = Mask;

interface LayerBase {
  id: string;
  name: string;
  visible: boolean;
  /** 0 to 1. */
  opacity: number;
  blend: BlendMode;
  locked: boolean;
}

export interface RasterLayer extends LayerBase {
  kind: 'raster';
  px: Pixels;
  /** Where its top left is on the canvas. */
  x: number;
  y: number;
}

export interface MarkLayer extends LayerBase {
  kind: 'mark';
  /** In the canvas's pixels. */
  mark: Mark;
  /** Turned this many degrees (clockwise) about its box's middle. */
  angle: number;
}

export interface AdjustLayer extends LayerBase {
  kind: 'adjust';
  look: LookSettings;
  /** Where it applies (made from the selection), or everywhere. */
  mask: Sel | null;
  /** Only to the layer under it. */
  clip: boolean;
}

export type Layer = RasterLayer | MarkLayer | AdjustLayer;

export interface Doc {
  w: number;
  h: number;
  /** Bottom first. */
  layers: Layer[];
  active: string | null;
  sel: Sel | null;
}

// ---- pixels ----------------------------------------------------------------------------------------------------------

let pxIds = 0;

export const canvasOf = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
};

/** A layer's pixels: a canvas, changed in place only by painting (each change counted, so what shows it knows). */
export class Pixels {
  readonly id = ++pxIds;
  version = 0;
  /** Smaller copies (for the screen, the layers' thumbnails, the histogram), each with the part of it to draw again. */
  private smalls: { k: number; c: HTMLCanvasElement; version: number; dirty: Box | null }[] = [];
  constructor(public canvas: HTMLCanvasElement) {}
  get w() {
    return this.canvas.width;
  }
  get h() {
    return this.canvas.height;
  }
  get bytes() {
    return this.canvas.width * this.canvas.height * 4;
  }
  ctx(): CanvasRenderingContext2D {
    return this.canvas.getContext('2d')!;
  }
  /** Changed (in `r`, or all of it). */
  touch(r?: Box) {
    this.version++;
    if (!r) this.smalls = [];
    else for (const s of this.smalls) s.dirty = s.dirty ? union(s.dirty, r) : r;
  }
  /** A copy `k` times its size (itself at 1 or more), kept (a few sizes at once) and brought up to date where it changed. */
  at(k: number): HTMLCanvasElement {
    if (k >= 0.999) return this.canvas;
    const i = this.smalls.findIndex((x) => Math.abs(x.k - k) < 1e-6);
    const s = i >= 0 ? this.smalls[i] : null;
    if (s) {
      if (s.version === this.version) return s.c;
      if (s.dirty) {
        const d = s.dirty;
        const x0 = Math.max(0, Math.floor(d.x * k) - 1);
        const y0 = Math.max(0, Math.floor(d.y * k) - 1);
        const x1 = Math.min(s.c.width, Math.ceil((d.x + d.w) * k) + 1);
        const y1 = Math.min(s.c.height, Math.ceil((d.y + d.h) * k) + 1);
        const g = s.c.getContext('2d')!;
        g.clearRect(x0, y0, x1 - x0, y1 - y0);
        g.imageSmoothingQuality = 'high';
        g.drawImage(this.canvas, x0 / k, y0 / k, (x1 - x0) / k, (y1 - y0) / k, x0, y0, x1 - x0, y1 - y0);
        s.version = this.version;
        s.dirty = null;
        return s.c;
      }
    }
    const made = { k, c: shrinkTo(this.canvas, k), version: this.version, dirty: null };
    this.smalls = [made, ...this.smalls.filter((x) => x !== s)].slice(0, 4);
    return made.c;
  }
}

export const union = (a: Box, b: Box): Box => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

export const intersect = (a: Box, b: Box): Box | null => {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  return x1 > x && y1 > y ? { x, y, w: x1 - x, h: y1 - y } : null;
};

/** A canvas made `k` times its size, halved step by step so a much smaller copy stays smooth. */
export function shrinkTo(c: HTMLCanvasElement, k: number): HTMLCanvasElement {
  let cur = c;
  while (cur.width * 0.5 > c.width * k * 1.01) {
    const half = canvasOf(cur.width / 2, cur.height / 2);
    const g = half.getContext('2d')!;
    g.imageSmoothingQuality = 'high';
    g.drawImage(cur, 0, 0, half.width, half.height);
    cur = half;
  }
  const out = canvasOf(c.width * k, c.height * k);
  const g = out.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(cur, 0, 0, out.width, out.height);
  return out;
}

/** A copy of a canvas (or a part of it). */
export function copyCanvas(c: HTMLCanvasElement, r?: Box): HTMLCanvasElement {
  const b = r ?? { x: 0, y: 0, w: c.width, h: c.height };
  const out = canvasOf(b.w, b.h);
  out.getContext('2d')!.drawImage(c, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
  return out;
}

// ---- layers ----------------------------------------------------------------------------------------------------------

let layerIds = 0;
export const newLayerId = () => `l${Date.now().toString(36)}${(++layerIds).toString(36)}`;

const base = (name: string): LayerBase => ({ id: newLayerId(), name, visible: true, opacity: 1, blend: 'normal', locked: false });

export const rasterLayer = (name: string, px: Pixels, x = 0, y = 0): RasterLayer => ({ ...base(name), kind: 'raster', px, x, y });
export const markLayer = (name: string, mark: Mark): MarkLayer => ({ ...base(name), kind: 'mark', mark, angle: 0 });
export const adjustLayer = (name: string, look: LookSettings, mask: Sel | null): AdjustLayer => ({ ...base(name), kind: 'adjust', look, mask, clip: false });

/** A name not yet used by a layer: "Layer 2", "Adjustments 3". */
export function freshName(doc: Doc, stem: string): string {
  const used = new Set(doc.layers.map((l) => l.name));
  if (!used.has(stem) && stem !== 'Layer') return stem;
  for (let i = 1; ; i++) if (!used.has(`${stem} ${i}`)) return `${stem} ${i}`;
}

export const layerOf = (doc: Doc, id: string | null | undefined) => (id ? (doc.layers.find((l) => l.id === id) ?? null) : null);
export const activeLayer = (doc: Doc) => layerOf(doc, doc.active);
export const indexOf = (doc: Doc, id: string) => doc.layers.findIndex((l) => l.id === id);

/** The document with one layer changed. */
export const withLayer = (doc: Doc, id: string, f: (l: Layer) => Layer): Doc => ({ ...doc, layers: doc.layers.map((l) => (l.id === id ? f(l) : l)) });

/** A raster layer's box on the canvas. */
export const rasterBox = (l: RasterLayer): Box => ({ x: l.x, y: l.y, w: l.px.w, h: l.px.h });

// ---- history ---------------------------------------------------------------------------------------------------------

/** A tile of a layer's pixels as they were before a step (swapped with what is there by Undo and Redo). */
export interface Patch {
  px: Pixels;
  x: number;
  y: number;
  data: ImageData;
}

export interface Step {
  label: string;
  doc: Doc;
  patches?: Patch[];
  /** Memory this step holds alone (its patches, pixels it made, its selection). */
  bytes: number;
}

const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
export const HISTORY_STEPS = 60;
export const HISTORY_BYTES = (COARSE ? 320 : 900) * 1024 * 1024;

/** Swaps a patch with what its pixels hold now (Undo and Redo both). */
function swap(p: Patch) {
  const g = p.px.ctx();
  const now = g.getImageData(p.x, p.y, p.data.width, p.data.height);
  g.putImageData(p.data, p.x, p.y);
  p.data = now;
  p.px.touch({ x: p.x, y: p.y, w: now.width, h: now.height });
}

export class History {
  steps: Step[];
  at = 0;
  constructor(doc: Doc) {
    this.steps = [{ label: 'Opened', doc, bytes: 0 }];
  }
  get doc(): Doc {
    return this.steps[this.at].doc;
  }
  get canUndo() {
    return this.at > 0;
  }
  get canRedo() {
    return this.at < this.steps.length - 1;
  }
  /** A step done: what comes after the one shown is dropped, and the oldest go when there are too many or too much. */
  push(label: string, doc: Doc, o: { patches?: Patch[]; bytes?: number } = {}) {
    this.steps = this.steps.slice(0, this.at + 1);
    const bytes = (o.bytes ?? 0) + (o.patches ?? []).reduce((n, p) => n + p.data.data.length, 0);
    this.steps.push({ label, doc, patches: o.patches, bytes });
    this.at = this.steps.length - 1;
    let total = this.steps.reduce((n, s) => n + s.bytes, 0);
    while (this.steps.length > 2 && (this.steps.length > HISTORY_STEPS || total > HISTORY_BYTES)) {
      total -= this.steps[0].bytes;
      this.steps.shift();
      // The first step left is where Undo stops: what took the picture there is no longer needed.
      total -= this.steps[0].bytes;
      this.steps[0] = { ...this.steps[0], patches: undefined, bytes: 0 };
      this.at--;
    }
  }
  /** The last step done made again in place (a slider still moving, a layer being dragged): no new step. */
  replace(doc: Doc) {
    this.steps[this.at] = { ...this.steps[this.at], doc };
  }
  /** Goes to step `i`, undoing or redoing the pixels' patches on the way. */
  goTo(i: number) {
    const to = Math.max(0, Math.min(this.steps.length - 1, i));
    while (this.at > to) {
      const s = this.steps[this.at];
      for (const p of [...(s.patches ?? [])].reverse()) swap(p);
      this.at--;
    }
    while (this.at < to) {
      this.at++;
      for (const p of this.steps[this.at].patches ?? []) swap(p);
    }
  }
}

// ---- tiles -------------------------------------------------------------------------------------------------------------

export const TILE = 256;

/** The tiles (TILE pixels square, inside the canvas) a box touches, as keys "tx,ty". */
export function tilesOf(r: Box, w: number, h: number, into = new Set<string>()): Set<string> {
  const x0 = Math.max(0, Math.floor(r.x / TILE));
  const y0 = Math.max(0, Math.floor(r.y / TILE));
  const x1 = Math.min(Math.ceil(w / TILE) - 1, Math.floor((r.x + r.w) / TILE));
  const y1 = Math.min(Math.ceil(h / TILE) - 1, Math.floor((r.y + r.h) / TILE));
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) into.add(`${tx},${ty}`);
  return into;
}

/** The patches holding the tiles as they are now: taken just before the pixels change. */
export function patchesOf(px: Pixels, tiles: Set<string>): Patch[] {
  const g = px.ctx();
  const out: Patch[] = [];
  for (const k of tiles) {
    const [tx, ty] = k.split(',').map(Number);
    const x = tx * TILE;
    const y = ty * TILE;
    const w = Math.min(TILE, px.w - x);
    const h = Math.min(TILE, px.h - y);
    if (w > 0 && h > 0) out.push({ px, x, y, data: g.getImageData(x, y, w, h) });
  }
  return out;
}
