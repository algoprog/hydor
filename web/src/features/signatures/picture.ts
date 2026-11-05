// A signature's picture, however it was made: strokes drawn again at print resolution, a typed name written in
// handwriting, or a photo of one with its paper made see-through. Each comes out as a PNG cropped to its ink with a
// small margin, its background clear, about 1600 pixels across its longer side (300 dpi for a signature 13 cm wide).
import { cropPixels, inkBox, padBox, paperToClear, hasClearBackground } from '@shared/signatures';
import { drawStroke, inkBounds, type Stroke } from './ink';
import type { HandStyle } from './handwriting';

/** A signature's picture: the PNG as base64 (no data: prefix), and its size in pixels. */
export interface SignaturePicture {
  png: string;
  width: number;
  height: number;
}

const LONG = 1600;

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** The canvas cropped to its ink, with a margin of a fiftieth of its longer side, as a PNG; null when it has no ink. */
async function cropped(c: HTMLCanvasElement): Promise<SignaturePicture | null> {
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const box = inkBox(img.data, c.width, c.height);
  if (!box) return null;
  const b = padBox(box, Math.round(Math.max(box.w, box.h) / 50) + 2, c.width, c.height);
  const out = canvas(b.w, b.h);
  out.getContext('2d')!.putImageData(new ImageData(cropPixels(img.data, c.width, b), b.w, b.h), 0, 0);
  const blob = await new Promise<Blob | null>((ok) => out.toBlob(ok, 'image/png'));
  if (!blob) return null;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { png: btoa(s), width: b.w, height: b.h };
}

/** Strokes drawn on the pad, drawn again large. */
export async function strokesPicture(strokes: Stroke[]): Promise<SignaturePicture | null> {
  const b = inkBounds(strokes);
  if (!b) return null;
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  const k = Math.min(8, LONG / Math.max(w, h, 1));
  const m = 8;
  const c = canvas(w * k + 2 * m, h * k + 2 * m);
  const ctx = c.getContext('2d')!;
  ctx.translate(m - b.x0 * k, m - b.y0 * k);
  for (const s of strokes) drawStroke(ctx, s, k);
  return cropped(c);
}

/** A name written in a handwriting style, in `color`. */
export async function typedPicture(text: string, style: HandStyle, color: string): Promise<SignaturePicture | null> {
  const t = text.trim();
  if (!t) return null;
  const size = 220 * style.scale;
  const probe = canvas(10, 10).getContext('2d')!;
  probe.font = `${size}px ${style.family}`;
  const m = probe.measureText(t);
  // Handwriting reaches past its advance (a flourish, a slant): room on every side, then cropped to the ink.
  const w = Math.ceil(m.width + size * 1.2);
  const h = Math.ceil(size * 2.2);
  const k = Math.min(1, (LONG * 1.4) / w);
  const c = canvas(w * k, h * k);
  const ctx = c.getContext('2d')!;
  ctx.scale(k, k);
  ctx.font = `${size}px ${style.family}`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(t, size * 0.6, size * 1.45);
  return cropped(c);
}

/** A photo or scan of a signature: made no larger than it needs, its paper see-through (unless it was already). */
export async function uploadedPicture(file: Blob): Promise<SignaturePicture | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fail(new Error('That file is not a picture this browser can show'));
      i.src = url;
    });
    const k = Math.min(1, 2000 / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const c = canvas((img.naturalWidth || 1) * k, (img.naturalHeight || 1) * k);
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const data = ctx.getImageData(0, 0, c.width, c.height);
    if (!hasClearBackground(data.data, c.width, c.height)) {
      paperToClear(data.data, c.width, c.height);
      ctx.putImageData(data, 0, 0);
    }
    return cropped(c);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A data: address of a picture, to show it. */
export const pictureUrl = (p: SignaturePicture) => `data:image/png;base64,${p.png}`;
