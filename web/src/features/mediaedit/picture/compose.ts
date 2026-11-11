// The picture editor's layers put together into one picture, for the screen and for the file: a part of the canvas
// (`region`) at a scale, bottom layer first. Pixel layers are drawn by the canvas with their blend mode and opacity (the
// web's compositing, the same formulas as Photoshop's: shared/blend.ts), from a smaller copy when shown small; marks are
// drawn on a canvas of their own (turned about their middle) then laid on; a blurred or pixelated area hides what is
// under it; an adjustment layer works its look out on what is under it (shared/mediaedit's applyLook, the same code the
// server runs) and mixes it in as far as its mask, its opacity and (clipped) the layer under it say. While a stroke is
// painted, a layer is moved or turned, or words are written, `live` says so and they show as they will be.
import { blendOp } from '@shared/blend';
import { applyLookSettings, hasLook, hideArea, textReach, type Affine } from '@shared/mediaedit';
import { drawMarks, markBox } from '../render';
import { canvasOf, intersect, type AdjustLayer, type Doc, type Layer, type MarkLayer, type RasterLayer } from './doc';
import type { Box } from './mask';

export interface Live {
  /** A stroke being painted on a layer, over its pixels (`op`, at `alpha`; `keepAlpha`: the layer's own see-through parts stay). */
  stroke?: { layer: string; canvas: HTMLCanvasElement; op: GlobalCompositeOperation; alpha: number; keepAlpha?: boolean };
  /** A layer being moved, sized or turned: where its pixels go (from the canvas's pixels to the canvas's pixels). */
  transform?: { layer: string; m: Affine };
  /** Not drawn (words being written over it, shown by the box they are written in). */
  hide?: string;
}

const ctx = (c: HTMLCanvasElement, read = false) => c.getContext('2d', read ? { willReadFrequently: true } : undefined)!;
const isHide = (l: Layer) => l.kind === 'mark' && (l.mark.type === 'blur' || l.mark.type === 'pixelate');

/** A mark layer's box on the canvas, turned with it and with room for its line's width. */
export function markBounds(l: MarkLayer, m?: Affine): Box {
  const b = markBox(l.mark);
  const pad = 'width' in l.mark ? l.mark.width * 2 + 2 : l.mark.type === 'text' ? 4 + textReach(l.mark) : 4;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const t = (l.angle * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const pts = [
    [b.x - pad, b.y - pad],
    [b.x + b.w + pad, b.y - pad],
    [b.x - pad, b.y + b.h + pad],
    [b.x + b.w + pad, b.y + b.h + pad],
  ].map(([x, y]) => {
    let X = cx + (x - cx) * c - (y - cy) * s;
    let Y = cy + (x - cx) * s + (y - cy) * c;
    if (m) [X, Y] = [m[0] * X + m[2] * Y + m[4], m[1] * X + m[3] * Y + m[5]];
    return [X, Y];
  });
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x0 = Math.floor(Math.min(...xs));
  const y0 = Math.floor(Math.min(...ys));
  return { x: x0, y: y0, w: Math.ceil(Math.max(...xs)) - x0, h: Math.ceil(Math.max(...ys)) - y0 };
}

/** A mark drawn on a context whose transform takes the canvas's pixels to its own, turned about its middle. */
export function drawMarkLayer(g: CanvasRenderingContext2D, l: MarkLayer) {
  if (l.angle) {
    const b = markBox(l.mark);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    g.translate(cx, cy);
    g.rotate((l.angle * Math.PI) / 180);
    g.translate(-cx, -cy);
  }
  drawMarks(g, [l.mark]);
}

/** A layer's box on the canvas (null for an adjustment, which has none). */
export function layerBox(l: Layer): Box | null {
  if (l.kind === 'raster') return { x: l.x, y: l.y, w: l.px.w, h: l.px.h };
  if (l.kind === 'mark') return markBounds(l);
  return l.mask ? { x: l.mask.x, y: l.mask.y, w: l.mask.w, h: l.mask.h } : null;
}

/**
 * A layer's own box for lining things up: a pixel layer's pixels' box, a mark's ink turned with it (without the room its
 * line's width asks for: that is for picking), none for an adjustment without a mask.
 */
export function layerInk(l: Layer): Box | null {
  if (l.kind !== 'mark') return layerBox(l);
  const b = markBox(l.mark);
  if (!l.angle) return { x: b.x, y: b.y, w: b.w, h: b.h };
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const t = (l.angle * Math.PI) / 180;
  const pts = [
    [b.x, b.y],
    [b.x + b.w, b.y],
    [b.x, b.y + b.h],
    [b.x + b.w, b.y + b.h],
  ].map(([x, y]) => [cx + (x - cx) * Math.cos(t) - (y - cy) * Math.sin(t), cy + (x - cx) * Math.sin(t) + (y - cy) * Math.cos(t)]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

function drawRaster(g: CanvasRenderingContext2D, l: RasterLayer, R: Box, k: number, live?: Live) {
  const small = k <= 0.75;
  const src = l.px.at(small ? k : 1);
  const sk = small ? k : 1;
  g.save();
  g.globalAlpha = l.opacity;
  g.globalCompositeOperation = blendOp(l.blend);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  const t = live?.transform?.layer === l.id ? live.transform.m : null;
  if (t) {
    g.setTransform(k, 0, 0, k, -R.x * k, -R.y * k);
    g.transform(t[0], t[1], t[2], t[3], t[4], t[5]);
    g.drawImage(src, l.x, l.y, l.px.w, l.px.h);
    g.restore();
    return;
  }
  const vis = intersect({ x: l.x, y: l.y, w: l.px.w, h: l.px.h }, R);
  if (!vis) return void g.restore();
  const sx = (vis.x - l.x) * sk;
  const sy = (vis.y - l.y) * sk;
  const dx = (vis.x - R.x) * k;
  const dy = (vis.y - R.y) * k;
  const st = live?.stroke?.layer === l.id ? live.stroke : null;
  if (!st) {
    g.drawImage(src, sx, sy, vis.w * sk, vis.h * sk, dx, dy, vis.w * k, vis.h * k);
    return void g.restore();
  }
  // The stroke laid on the layer's visible part, then that laid on what is under it.
  const tmp = canvasOf(Math.ceil(vis.w * k), Math.ceil(vis.h * k));
  const tg = ctx(tmp);
  tg.imageSmoothingQuality = 'high';
  tg.drawImage(src, sx, sy, vis.w * sk, vis.h * sk, 0, 0, vis.w * k, vis.h * k);
  tg.globalAlpha = st.alpha;
  tg.globalCompositeOperation = st.op;
  tg.drawImage(st.canvas, vis.x - l.x, vis.y - l.y, vis.w, vis.h, 0, 0, vis.w * k, vis.h * k);
  if (st.keepAlpha) {
    tg.globalAlpha = 1;
    tg.globalCompositeOperation = 'destination-in';
    tg.drawImage(src, sx, sy, vis.w * sk, vis.h * sk, 0, 0, vis.w * k, vis.h * k);
  }
  g.drawImage(tmp, dx, dy);
  g.restore();
}

function drawMark(g: CanvasRenderingContext2D, l: MarkLayer, R: Box, k: number, live?: Live) {
  const t = live?.transform?.layer === l.id ? live.transform.m : undefined;
  const vis = intersect(markBounds(l, t), R);
  if (!vis) return;
  const tmp = canvasOf(Math.ceil(vis.w * k) + 1, Math.ceil(vis.h * k) + 1);
  const tg = ctx(tmp);
  tg.setTransform(k, 0, 0, k, -vis.x * k, -vis.y * k);
  if (t) tg.transform(t[0], t[1], t[2], t[3], t[4], t[5]);
  drawMarkLayer(tg, l);
  g.save();
  g.globalAlpha = l.opacity;
  g.globalCompositeOperation = blendOp(l.blend);
  g.drawImage(tmp, Math.floor((vis.x - R.x) * k), Math.floor((vis.y - R.y) * k));
  g.restore();
}

/** A blurred or pixelated area: what is under it hidden, as much as its opacity says. */
function hideUnder(g: CanvasRenderingContext2D, l: MarkLayer, R: Box, k: number, W: number, H: number) {
  const m = l.mark;
  if (m.type !== 'blur' && m.type !== 'pixelate') return;
  const x0 = Math.max(0, Math.floor((m.x - R.x) * k));
  const y0 = Math.max(0, Math.floor((m.y - R.y) * k));
  const x1 = Math.min(W, Math.ceil((m.x + m.w - R.x) * k));
  const y1 = Math.min(H, Math.ceil((m.y + m.h - R.y) * k));
  if (x1 <= x0 || y1 <= y0) return;
  const d = g.getImageData(x0, y0, x1 - x0, y1 - y0);
  const before = l.opacity < 1 ? new Uint8ClampedArray(d.data) : null;
  hideArea(d.data, d.width, d.height, { x: 0, y: 0, w: d.width, h: d.height }, m.type, m.strength);
  if (before) for (let i = 0; i < before.length; i++) d.data[i] = before[i] + (d.data[i] - before[i]) * l.opacity;
  g.putImageData(d, x0, y0);
}

/** An adjustment: its look worked out on what is under it, mixed in through its mask, its opacity and (clipped) the layer under it. */
function adjustUnder(g: CanvasRenderingContext2D, doc: Doc, i: number, l: AdjustLayer, R: Box, k: number, W: number, H: number, live?: Live) {
  if (!hasLook(l.look) || l.opacity <= 0) return;
  const d = g.getImageData(0, 0, W, H);
  const adj = new Uint8ClampedArray(d.data);
  applyLookSettings(adj, W, H, l.look, { W: doc.w * k, H: doc.h * k, x: R.x * k, y: R.y * k });
  const o = l.opacity;
  const mk = l.mask;
  let clip: Uint8ClampedArray | null = null;
  if (l.clip) {
    const below = [...doc.layers.slice(0, i)].reverse().find((x) => x.kind !== 'adjust');
    if (!below) return;
    const c = renderDoc(doc, { region: R, scale: k, only: below.id, live, out: canvasOf(W, H) });
    clip = ctx(c, true).getImageData(0, 0, W, H).data;
  }
  if (!mk && !clip && o >= 1) {
    for (let p = 0; p < adj.length; p += 4) {
      d.data[p] = adj[p];
      d.data[p + 1] = adj[p + 1];
      d.data[p + 2] = adj[p + 2];
    }
    return void g.putImageData(d, 0, 0);
  }
  // Each column's and row's place in the mask, worked out once.
  const mx = mk ? Int32Array.from({ length: W }, (_, x) => Math.floor(R.x + (x + 0.5) / k) - mk.x) : null;
  const my = mk ? Int32Array.from({ length: H }, (_, y) => Math.floor(R.y + (y + 0.5) / k) - mk.y) : null;
  for (let y = 0; y < H; y++) {
    const row = my ? my[y] : 0;
    const inRow = !mk || (row >= 0 && row < mk.h);
    for (let x = 0; x < W; x++) {
      let w = o;
      if (mk) {
        const col = mx![x];
        w *= inRow && col >= 0 && col < mk.w ? mk.data[row * mk.w + col] / 255 : 0;
      }
      const p = (y * W + x) * 4;
      if (clip) w *= clip[p + 3] / 255;
      if (w <= 0) continue;
      d.data[p] += (adj[p] - d.data[p]) * w;
      d.data[p + 1] += (adj[p + 1] - d.data[p + 1]) * w;
      d.data[p + 2] += (adj[p + 2] - d.data[p + 2]) * w;
    }
  }
  g.putImageData(d, 0, 0);
}

/**
 * The layers put together: the part `region` of the canvas (its pixels) at `scale`, into `out` when it is that size.
 * `only`: one layer alone; `upTo`: the layers up to and with that one.
 */
export function renderDoc(doc: Doc, o: { region: Box; scale: number; live?: Live; only?: string; upTo?: string; out?: HTMLCanvasElement }): HTMLCanvasElement {
  const R = o.region;
  const k = o.scale;
  const W = Math.max(1, Math.round(R.w * k));
  const H = Math.max(1, Math.round(R.h * k));
  const fx = doc.layers.some((l) => l.visible && (l.kind === 'adjust' || isHide(l)));
  const out = o.out && o.out.width === W && o.out.height === H ? o.out : canvasOf(W, H);
  const g = ctx(out, fx);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  const n = o.upTo ? doc.layers.findIndex((l) => l.id === o.upTo) + 1 : doc.layers.length;
  for (let i = 0; i < n; i++) {
    const l = doc.layers[i];
    if (!l.visible || l.id === o.live?.hide || (o.only && l.id !== o.only)) continue;
    if (l.kind === 'raster') drawRaster(g, l, R, k, o.live);
    else if (l.kind === 'adjust') adjustUnder(g, doc, i, l, R, k, W, H, o.live);
    else if (isHide(l)) hideUnder(g, l, R, k, W, H);
    else drawMark(g, l, R, k, o.live);
  }
  return out;
}

/** The whole picture at its full size: what is saved, and what the AI tools are given. */
export const flattenDoc = (doc: Doc, live?: Live) => renderDoc(doc, { region: { x: 0, y: 0, w: doc.w, h: doc.h }, scale: 1, live });

/** A layer's small picture for the Layers panel (`size` pixels at most), on nothing (see-through where it is). */
export function layerThumb(doc: Doc, l: Layer, size: number): HTMLCanvasElement | null {
  if (l.kind === 'adjust') return null;
  const k = Math.min(1, size / Math.max(doc.w, doc.h));
  const one = { ...doc, layers: [{ ...l, visible: true, opacity: 1, blend: 'normal' as const }] } as Doc;
  return renderDoc(one, { region: { x: 0, y: 0, w: doc.w, h: doc.h }, scale: k });
}
