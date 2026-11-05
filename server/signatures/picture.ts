// A saved signature laid on a PNG picture (a scanned form, a photo of a page): at a spot given as shares of the picture
// (the signature's left end and the line it sits on), its width a share of the picture's; the picture keeps its own
// colours, and its see-through parts if it had any. A box stands in for the signature when an agent looks first.
import { boxPicture, composite, hasAlpha, readPng, resize, writePng, type Rgba } from './png.ts';

export interface PictureSpot {
  x: number;
  y: number;
  /** The signature's width, as a share of the picture's. */
  width: number;
}

/** Where it goes, in the picture's pixels. */
function box(base: Rgba, sig: { width: number; height: number }, s: PictureSpot) {
  const w = Math.max(4, Math.round(Math.min(1, Math.max(0.02, s.width)) * base.width));
  const h = Math.max(2, Math.round((w * sig.height) / Math.max(1, sig.width)));
  const x = Math.round(Math.min(1, Math.max(0, s.x)) * base.width);
  const y = Math.round(Math.min(1, Math.max(0, s.y)) * base.height - h * 0.85);
  return { x: Math.min(Math.max(0, x), Math.max(0, base.width - w)), y: Math.min(Math.max(0, y), Math.max(0, base.height - h)), w, h };
}

/** The picture read, or a plain-words error for what is not a PNG. */
export function readPicture(file: Buffer): Rgba {
  try {
    return readPng(file);
  } catch (e) {
    throw new Error(`Only PNG pictures can be signed here (${(e as Error).message}). A PDF or a Word file can be; a JPEG photo can be saved as PNG first.`);
  }
}

/** The picture signed: as PNG, RGB unless it had see-through parts. */
export function signPicture(base: Rgba, sig: Rgba, s: PictureSpot): Buffer {
  const b = box(base, sig, s);
  return writePng(composite(base, resize(sig, b.w, b.h), b.x, b.y), { alpha: hasAlpha(base) });
}

/** The picture with the signature (or, for an agent, a box where it would go), no wider than `max` pixels: to look at. */
export function pictureView(base: Rgba, sig: Rgba, s: PictureSpot, o: { box?: boolean; max?: number } = {}): Buffer {
  const b = box(base, sig, s);
  const top = o.box ? boxPicture(b.w, b.h) : resize(sig, b.w, b.h);
  // On white, as on paper: a see-through picture's clear parts would show black once its alpha is left out.
  const white = { width: base.width, height: base.height, data: new Uint8Array(base.width * base.height * 4).fill(255) };
  const out = composite(composite(white, base, 0, 0), top, b.x, b.y);
  const max = o.max ?? 1100;
  if (out.width <= max) return writePng(out, { alpha: false });
  return writePng(resize(out, max, Math.max(1, Math.round((out.height * max) / out.width))), { alpha: false });
}
