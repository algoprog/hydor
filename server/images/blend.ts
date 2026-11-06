// A picture changed only where a mask says: a model's answer (the whole picture, redrawn) laid into the original
// where the mask is white, its edge softened over a few pixels so the change fades in, every pixel farther out the
// original's own. PNG in and out (server/signatures/png.ts reads and writes them); the answer may be another size of
// the same shape (models make their own sizes), and is fitted first.
import { readPng, resize, writePng, type Rgba } from '../signatures/png.ts';

/** The picture at w×h: averaged when smaller, bilinear when larger, so neither grows blocky. */
export function resample(img: Rgba, w: number, h: number): Rgba {
  if (img.width === w && img.height === h) return img;
  if (img.width >= w && img.height >= h) return resize(img, w, h);
  const { width: W, height: H, data } = img;
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const fy = Math.max(0, Math.min(H - 1, ((y + 0.5) * H) / h - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(H - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.max(0, Math.min(W - 1, ((x + 0.5) * W) / w - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(W - 1, x0 + 1);
      const tx = fx - x0;
      const o = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) {
        const top = data[(y0 * W + x0) * 4 + c] * (1 - tx) + data[(y0 * W + x1) * 4 + c] * tx;
        const bottom = data[(y1 * W + x0) * 4 + c] * (1 - tx) + data[(y1 * W + x1) * 4 + c] * tx;
        out[o + c] = Math.round(top * (1 - ty) + bottom * ty);
      }
    }
  }
  return { width: w, height: h, data: out };
}

/** How much each pixel of a w×h picture may change, 0 to 1: the mask's brightness where it is opaque (see-through is black). */
export function weights(mask: Rgba, w: number, h: number): Float32Array {
  const m = resample(mask, w, h).data;
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = ((m[i * 4] + m[i * 4 + 1] + m[i * 4 + 2]) / 765) * (m[i * 4 + 3] / 255);
  return out;
}

/** One box blur of radius r across rows (`across`) or down columns, in place through `tmp`. */
function boxBlur(src: Float32Array, dst: Float32Array, w: number, h: number, r: number, across: boolean) {
  const [lines, len] = across ? [h, w] : [w, h];
  const at = (line: number, i: number) => (across ? line * w + i : i * w + line);
  for (let line = 0; line < lines; line++) {
    let sum = 0;
    // The edges held: past them, the picture's last pixel goes on.
    for (let i = -r; i <= r; i++) sum += src[at(line, Math.max(0, Math.min(len - 1, i)))];
    for (let i = 0; i < len; i++) {
      dst[at(line, i)] = sum / (2 * r + 1);
      sum += src[at(line, Math.min(len - 1, i + r + 1))] - src[at(line, Math.max(0, i - r))];
    }
  }
}

/** The weights softened over about r pixels: two box blurs each way, near enough a Gaussian's. */
export function soften(m: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return m;
  const half = Math.max(1, Math.round(r / 2));
  const a = new Float32Array(m);
  const b = new Float32Array(m.length);
  for (let pass = 0; pass < 2; pass++) {
    boxBlur(a, b, w, h, half, true);
    boxBlur(b, a, w, h, half, false);
  }
  return a;
}

/** The original with the answer in it as much as the weights say, pixel by pixel (what a blur leaves next to nothing counts as nothing). */
export function blend(orig: Rgba, ans: Rgba, m: Float32Array): Rgba {
  const out = new Uint8Array(orig.data.length);
  for (let i = 0; i < m.length; i++) {
    const t = m[i];
    for (let c = 0; c < 4; c++) {
      const o = orig.data[i * 4 + c];
      out[i * 4 + c] = t < 0.001 ? o : t > 0.999 ? ans.data[i * 4 + c] : Math.round(o + (ans.data[i * 4 + c] - o) * t);
    }
  }
  return { width: orig.width, height: orig.height, data: out };
}

/** About how far the edge fades: a few pixels, more on a large picture. */
export const featherOf = (w: number, h: number) => Math.max(2, Math.round(Math.max(w, h) / 300));

/** Two shapes the same, near enough (models round their sizes). */
export const sameShape = (a: { width: number; height: number }, b: { width: number; height: number }) => Math.abs(Math.log(a.width / a.height / (b.width / b.height))) < 0.02;

/**
 * The answer put into the original where the mask is white, as a PNG the original's size; null when it cannot be done
 * here (the answer is not a PNG, or not the original's shape), and the editor puts it in instead.
 */
export function putTogether(original: Buffer, answer: Buffer, mask: Buffer): Buffer | null {
  let o: Rgba;
  let a: Rgba;
  let m: Rgba;
  try {
    o = readPng(original);
    a = readPng(answer);
    m = readPng(mask);
  } catch {
    return null;
  }
  if (!sameShape(o, a) || !sameShape(o, m)) return null;
  const w = soften(weights(m, o.width, o.height), o.width, o.height, featherOf(o.width, o.height));
  return writePng(blend(o, resample(a, o.width, o.height), w));
}
