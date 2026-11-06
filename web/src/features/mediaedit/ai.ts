// The AI tools' pictures in the editor: what is sent (the picture as it is now, no larger than the models use, kept by
// the app first) and how an answer is put back at the picture's whole size: a cutout's see-through parts laid over the
// whole picture, an erased or changed part put in only where it was painted (its edge softened), a picture expanded with
// the whole original kept in its middle. So a 6000-pixel photo stays 6000 pixels after an AI tool has worked on it.
import { post } from '../../lib/api';
import { canvasOf, loadImage, seeThrough, sourceUrl } from './render';

/** A brush stroke over the picture: its width and the points it went through, in the picture's pixels. */
export interface Stroke {
  size: number;
  pts: number[];
}

/** The largest side sent to the AI tools: the models work smaller, and the answer is put back at the whole size. */
export const SEND_SIDE = 3072;

const ctx = (c: HTMLCanvasElement, read = false) => c.getContext('2d', read ? { willReadFrequently: true } : undefined)!;

/** A canvas drawn at `w` × `h`, smoothly. */
export function sized(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const c = canvasOf(w, h);
  const g = ctx(c);
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** A picture kept by the app ("naget-asset:…"), from a canvas: a PNG where it has see-through parts, else a JPEG. */
export async function keepCanvas(c: HTMLCanvasElement): Promise<string> {
  const data = seeThrough(c) ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.92);
  return (await post<{ src: string }>('/api/pages/assets', { data })).src;
}

/** The picture to send: no larger than SEND_SIDE, kept; with its size, and how much smaller than the whole it is. */
export async function sendable(full: HTMLCanvasElement): Promise<{ src: string; w: number; h: number; k: number }> {
  const k = Math.min(1, SEND_SIDE / Math.max(full.width, full.height));
  const c = k < 1 ? sized(full, full.width * k, full.height * k) : full;
  return { src: await keepCanvas(c), w: c.width, h: c.height, k };
}

/** A kept picture (an answer) read into a canvas. */
export async function readKept(src: string): Promise<HTMLCanvasElement> {
  const img = await loadImage(sourceUrl(src));
  return sized(img, img.naturalWidth || 1024, img.naturalHeight || 1024);
}

/** Strokes drawn, white on black, at `k` times their size: the mask the routes take. */
export function maskOf(strokes: Stroke[], w: number, h: number, k: number): string {
  const c = canvasOf(w * k, h * k);
  const g = ctx(c);
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  paintStrokes(g, strokes, k);
  return c.toDataURL('image/png');
}

function paintStrokes(g: CanvasRenderingContext2D, strokes: Stroke[], k: number) {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const s of strokes) {
    g.lineWidth = Math.max(1, s.size * k);
    g.beginPath();
    if (s.pts.length <= 2) {
      g.arc(s.pts[0] * k, s.pts[1] * k, Math.max(0.5, (s.size * k) / 2), 0, Math.PI * 2);
      g.fill();
      continue;
    }
    g.moveTo(s.pts[0] * k, s.pts[1] * k);
    for (let i = 2; i + 1 < s.pts.length; i += 2) g.lineTo(s.pts[i] * k, s.pts[i + 1] * k);
    g.stroke();
  }
}

/** A soft-edged copy of what `draw` makes, at `w` × `h`: drawn small and brought up smoothly (the same in every browser). */
function softened(w: number, h: number, draw: (g: CanvasRenderingContext2D, k: number) => void): HTMLCanvasElement {
  const f = Math.max(2, Math.round(Math.max(w, h) / 260));
  const small = canvasOf(Math.ceil(w / f), Math.ceil(h / f));
  const sg = ctx(small);
  sg.fillStyle = '#fff';
  sg.strokeStyle = '#fff';
  draw(sg, 1 / f);
  return sized(small, w, h);
}

/** `after` (any size: fitted to `before`'s) put into `before` only where it was painted, its edge soft: a new canvas. */
export function putInPainted(before: HTMLCanvasElement, after: CanvasImageSource, strokes: Stroke[]): HTMLCanvasElement {
  const W = before.width;
  const H = before.height;
  const out = sized(before, W, H);
  const part = sized(after, W, H);
  const pg = ctx(part);
  pg.globalCompositeOperation = 'destination-in';
  pg.drawImage(
    softened(W, H, (g, k) => paintStrokes(g, strokes, k)),
    0,
    0,
  );
  ctx(out).drawImage(part, 0, 0);
  return out;
}

/** A cutout's see-through parts laid over the whole picture: its own pixels kept, the cutout's alpha (fitted) taking the background away. */
export function withAlphaOf(full: HTMLCanvasElement, cut: CanvasImageSource): HTMLCanvasElement {
  const out = sized(full, full.width, full.height);
  const g = ctx(out);
  g.globalCompositeOperation = 'destination-in';
  g.imageSmoothingQuality = 'high';
  g.drawImage(cut, 0, 0, out.width, out.height);
  return out;
}

/** Where the picture sits in a larger one of shape `ratio` (width ÷ height): the larger one's size, and the picture's place. */
export function expandedSize(w: number, h: number, ratio: number | 'all'): { W: number; H: number; x: number; y: number } {
  let W = w;
  let H = h;
  if (ratio === 'all') {
    W = Math.round(w * 1.4);
    H = Math.round(h * 1.4);
  } else if (ratio > w / h) W = Math.round(h * ratio);
  else H = Math.round(w / ratio);
  return { W, H, x: Math.round((W - w) / 2), y: Math.round((H - h) / 2) };
}

/**
 * What an expansion is asked with: the larger picture (the original in its middle, the new part filled with a blurred
 * stretch of it, for the model to go on from) and the mask (white over the new part, reaching a little into the
 * original so the join is redrawn), both no larger than `side`.
 */
export function expansionAsk(full: HTMLCanvasElement, ratio: number | 'all', side: number): { picture: HTMLCanvasElement; mask: string; place: { W: number; H: number; x: number; y: number } } {
  const place = expandedSize(full.width, full.height, ratio);
  const k = Math.min(1, side / Math.max(place.W, place.H));
  const pic = canvasOf(place.W * k, place.H * k);
  const g = ctx(pic);
  // The stretch, blurred by drawing it tiny and bringing it back up.
  const tiny = sized(full, Math.max(2, full.width / 24), Math.max(2, full.height / 24));
  g.imageSmoothingQuality = 'high';
  g.drawImage(tiny, 0, 0, pic.width, pic.height);
  g.drawImage(full, place.x * k, place.y * k, full.width * k, full.height * k);
  const mask = canvasOf(pic.width, pic.height);
  const mg = ctx(mask);
  mg.fillStyle = '#fff';
  mg.fillRect(0, 0, mask.width, mask.height);
  // Only the sides that meet the new part reach into the original.
  const e = edges(full, place, Math.round(Math.min(full.width, full.height) * 0.03));
  mg.fillStyle = '#000';
  mg.fillRect((place.x + e.l) * k, (place.y + e.t) * k, (full.width - e.l - e.r) * k, (full.height - e.t - e.b) * k);
  return { picture: pic, mask: mask.toDataURL('image/png'), place };
}

/** An expansion's answer at the whole size: the model's picture brought up, the whole original put back in its middle with a soft edge. */
export function expansionResult(full: HTMLCanvasElement, answer: CanvasImageSource, place: { W: number; H: number; x: number; y: number }): HTMLCanvasElement {
  const out = sized(answer, place.W, place.H);
  const part = sized(full, full.width, full.height);
  const pg = ctx(part);
  const e = edges(full, place, Math.round(Math.min(full.width, full.height) * 0.02));
  pg.globalCompositeOperation = 'destination-in';
  pg.drawImage(
    softened(full.width, full.height, (g, k) => g.fillRect(e.l * k, e.t * k, (full.width - e.l - e.r) * k, (full.height - e.t - e.b) * k)),
    0,
    0,
  );
  ctx(out).drawImage(part, place.x, place.y);
  return out;
}

/** How far in from each side the original gives way to the new part: `d` where a side meets it, nothing at the picture's own edge. */
function edges(full: { width: number; height: number }, place: { W: number; H: number; x: number; y: number }, d: number) {
  return { l: place.x > 0 ? d : 0, t: place.y > 0 ? d : 0, r: place.x + full.width < place.W ? d : 0, b: place.y + full.height < place.H ? d : 0 };
}
