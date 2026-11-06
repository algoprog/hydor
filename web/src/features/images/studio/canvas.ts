// Painting on a picture, and putting a change in where it was painted. The strokes are kept in the picture's own
// pixels; a mask is made of them for the routes (white where to change or erase, black where the picture stays), and
// a model's whole new picture is put in only where the mask is white, its edge softened, the rest as it was.
import { hasAlpha, loadImage } from './pictures';

/** A stroke of the brush: its width and the points it went through, in the picture's own pixels. */
export interface Stroke {
  size: number;
  pts: number[];
}

export const canvasOf = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
};

/** Strokes drawn at `k` times the picture's size, in the colour set on `g`. */
export function paint(g: CanvasRenderingContext2D, strokes: Stroke[], k: number) {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const s of strokes) {
    const p = s.pts;
    if (p.length < 2) continue;
    g.lineWidth = Math.max(1, s.size * k);
    if (p.length === 2) {
      g.beginPath();
      g.arc(p[0] * k, p[1] * k, Math.max(0.5, (s.size * k) / 2), 0, Math.PI * 2);
      g.fill();
      continue;
    }
    g.beginPath();
    g.moveTo(p[0] * k, p[1] * k);
    for (let i = 2; i < p.length; i += 2) g.lineTo(p[i] * k, p[i + 1] * k);
    g.stroke();
  }
}

/** The mask the routes take: the picture's shape (no side over `max`), white where painted, black elsewhere, as a PNG data: address. */
export function maskData(strokes: Stroke[], w: number, h: number, max = 2048): string {
  const k = Math.min(1, max / Math.max(w, h));
  const c = canvasOf(w * k, h * k);
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  paint(g, strokes, k);
  return c.toDataURL('image/png');
}

/** Whether anything is painted. */
export const painted = (strokes: Stroke[]) => strokes.some((s) => s.pts.length >= 2);

/**
 * Where the strokes are, as see-through (nothing) to solid (painted), at the picture's size, with an edge a few pixels
 * soft: drawn small and brought back up smoothly (which every browser does the same; a blur filter some cannot).
 */
function softMask(strokes: Stroke[], w: number, h: number): HTMLCanvasElement {
  const f = Math.max(2, Math.round(Math.max(w, h) / 220));
  const small = canvasOf(Math.ceil(w / f), Math.ceil(h / f));
  const sg = small.getContext('2d')!;
  sg.fillStyle = '#fff';
  sg.strokeStyle = '#fff';
  paint(sg, strokes, 1 / f);
  const big = canvasOf(w, h);
  const bg = big.getContext('2d')!;
  bg.imageSmoothingEnabled = true;
  bg.imageSmoothingQuality = 'high';
  bg.drawImage(small, 0, 0, w, h);
  return big;
}

/** A picture the tools take only as pixels (a drawing, a GIF): a PNG data: address at its size, a small drawing made 1024 pixels across. */
export async function asPng(url: string, w: number, h: number): Promise<string> {
  const img = await loadImage(url);
  const k = Math.max(1, Math.min(4, 1024 / Math.max(w, h, 1)));
  const c = canvasOf(w * k, h * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

/** The largest side a picture put together here keeps. */
const MAX_SIDE = 4096;

/**
 * A model's whole picture (`after`, any size: it is fitted to the original's) put into the original (`before`) only
 * where it was painted, its edge softened: a data: address, a PNG where the original has see-through parts, else a JPEG.
 */
export async function putInPainted(before: string, after: string, strokes: Stroke[], w: number, h: number): Promise<string> {
  const [a, b] = await Promise.all([loadImage(before), loadImage(after)]);
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  const W = Math.round(w * k);
  const H = Math.round(h * k);
  const out = canvasOf(W, H);
  const g = out.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(a, 0, 0, W, H);
  const part = canvasOf(W, H);
  const pg = part.getContext('2d')!;
  pg.imageSmoothingQuality = 'high';
  pg.drawImage(b, 0, 0, W, H);
  pg.globalCompositeOperation = 'destination-in';
  pg.drawImage(
    softMask(
      strokes.map((s) => ({ size: s.size * k, pts: s.pts.map((v) => v * k) })),
      W,
      H,
    ),
    0,
    0,
  );
  g.drawImage(part, 0, 0);
  return hasAlpha(a, a.naturalWidth || W, a.naturalHeight || H) ? out.toDataURL('image/png') : out.toDataURL('image/jpeg', 0.92);
}
