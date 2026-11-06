// The picture editor's drawing, in the browser: a picture loaded to work on (from wherever it is: kept by the app, a
// Library item, a file, the web), its upright frame (turned, flipped, straightened), its look and hidden areas
// (shared/mediaedit's applyLook and hideArea, the same code the server runs), its marks drawn over it, and the file
// made at the end, at its size and of its kind. The screen works on a smaller copy; the file is made from the whole.
import { applyLook, arrowHead, hideArea, MARK_FONTS, textMetrics, uprightMap, type ImageFormat, type ImageRecipe, type Mark } from '@shared/mediaedit';
import { mu } from '../../lib/machine';

/** A picture to work on: the whole of it, drawn once (its turn as the file says, for a photo). */
export interface Base {
  id: number;
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
  /** Kept by the app already ("naget-asset:…"), to send to the AI tools as it is. */
  src?: string;
}

let ids = 0;
export const newBaseId = () => ++ids;

export const canvasOf = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
};

const ctx2d = (c: HTMLCanvasElement, read = false) => c.getContext('2d', read ? { willReadFrequently: true } : undefined)!;

/** Touch screens (phones, tablets) hold smaller canvases: Safari's largest is about 16.7 million pixels. */
const MAX_PIXELS = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 16_000_000 : 40_000_000;
const MAX_SIDE = 8192;

/** The address a picture is read from, by what `src` is: kept by the app, the app's own address, the web, a file. */
export function sourceUrl(src: string): string {
  const s = src.trim();
  if (s.startsWith('naget-asset:')) return mu(`/api/pages/assets/${s.slice('naget-asset:'.length)}`);
  if (s.startsWith('data:') || s.startsWith('blob:')) return s;
  if (/^https?:\/\//i.test(s)) {
    try {
      if (new URL(s).origin === location.origin) return s;
    } catch {}
    // Read through the app, which keeps it: a picture from elsewhere could not be worked on here.
    return mu(`/api/pages/picture?url=${encodeURIComponent(s)}`);
  }
  // The app's own addresses (already for the machine shown), else a file on this computer.
  if (/^\/(?:api|m\/[a-z0-9-]{1,40}\/api|p-api|m\/[a-z0-9-]{1,40}\/p-api)\//.test(s)) return s;
  return mu(`/api/fs/raw?path=${encodeURIComponent(s)}`);
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => {
    const i = new Image();
    i.decoding = 'async';
    i.onload = () => ok(i);
    i.onerror = () => fail(new Error('The picture could not be read'));
    i.src = url;
  });
}

/**
 * A picture read to work on: drawn whole into a canvas (a photo turned as its file says), made smaller only when it is
 * larger than this device can hold (`note` says so); its kind of file, as it came.
 */
export async function loadSource(src: string): Promise<{ canvas: HTMLCanvasElement; w: number; h: number; mime: string; note?: string }> {
  const url = sourceUrl(src);
  const res = await fetch(url, { credentials: 'same-origin' }).catch(() => null);
  if (!res?.ok) throw new Error(res?.status === 404 ? 'That picture is not there any more' : 'That picture could not be read');
  const blob = await res.blob();
  const mime = (blob.type || res.headers.get('content-type') || '').split(';')[0];
  const obj = URL.createObjectURL(blob);
  try {
    const img = await loadImage(obj);
    // A drawing with no size of its own comes out 1024 pixels across.
    let w = img.naturalWidth || 1024;
    let h = img.naturalHeight || Math.round((1024 * 3) / 4);
    let note: string | undefined;
    const k = Math.min(1, MAX_SIDE / Math.max(w, h), Math.sqrt(MAX_PIXELS / (w * h)));
    if (k < 1) {
      note = `It is edited at ${Math.round(w * k)} × ${Math.round(h * k)} pixels: the picture is larger than this device can work on.`;
      w = Math.round(w * k);
      h = Math.round(h * k);
    }
    const c = canvasOf(w, h);
    const g = ctx2d(c);
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, w, h);
    return { canvas: c, w, h, mime, note };
  } finally {
    URL.revokeObjectURL(obj);
  }
}

/** A smaller copy of a canvas, at most `side` pixels on its longer side (itself when it is that small). */
export function shrink(c: HTMLCanvasElement, side: number): HTMLCanvasElement {
  const k = Math.min(1, side / Math.max(c.width, c.height));
  if (k >= 1) return c;
  // Halved step by step, so a much smaller copy stays smooth.
  let cur = c;
  while (cur.width * 0.5 > c.width * k * 1.01) {
    const half = canvasOf(cur.width / 2, cur.height / 2);
    const g = ctx2d(half);
    g.imageSmoothingQuality = 'high';
    g.drawImage(cur, 0, 0, half.width, half.height);
    cur = half;
  }
  const out = canvasOf(c.width * k, c.height * k);
  const g = ctx2d(out);
  g.imageSmoothingQuality = 'high';
  g.drawImage(cur, 0, 0, out.width, out.height);
  return out;
}

/**
 * The picture in its upright frame (turned, flipped, straightened), and with `crop` only the part kept, at `k` times
 * the whole picture's size. `src` may be a smaller copy of the picture: it is drawn as the whole picture's `w` × `h`.
 */
export function uprightCanvas(src: CanvasImageSource, w: number, h: number, r: ImageRecipe, k: number, crop: boolean): HTMLCanvasElement {
  const u = uprightMap(r, w, h, { crop });
  const c = canvasOf(u.w * k, u.h * k);
  const g = ctx2d(c, true);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  const m = u.map;
  g.setTransform(m[0] * k, m[1] * k, m[2] * k, m[3] * k, m[4] * k, m[5] * k);
  g.drawImage(src, 0, 0, w, h);
  return c;
}

/**
 * The look (adjustments, filter) and the hidden areas put on a canvas in place. `k`: its pixels per frame pixel;
 * `at`: the frame's point at its top left (the crop's corner), so the hidden areas land where they were drawn.
 */
export function putLook(c: HTMLCanvasElement, r: ImageRecipe, k: number, at: { x: number; y: number }) {
  const hidden = (r.marks ?? []).filter((m) => m.type === 'blur' || m.type === 'pixelate');
  if (!r.adjust && !r.filter && !hidden.length) return;
  const g = ctx2d(c, true);
  const d = g.getImageData(0, 0, c.width, c.height);
  applyLook(d.data, c.width, c.height, r.adjust, r.filter);
  for (const m of hidden) if (m.type === 'blur' || m.type === 'pixelate') hideArea(d.data, c.width, c.height, { x: (m.x - at.x) * k, y: (m.y - at.y) * k, w: m.w * k, h: m.h * k }, m.type, m.strength);
  g.putImageData(d, 0, 0);
}

// ---- marks --------------------------------------------------------------------------------------------------

const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const fontCss = (m: Extract<Mark, { type: 'text' }>) => {
  const f = MARK_FONTS.find((x) => x.id === (m.font ?? 'sans')) ?? MARK_FONTS[0];
  return `${f.id === 'heavy' ? 400 : 600} ${m.size}px ${f.css}`;
};

let measurer: CanvasRenderingContext2D | null = null;
const measure = () => (measurer ??= canvasOf(4, 4).getContext('2d')!);

/** A mark's box in the frame: where it is, for picking it and showing it picked. */
export function markBox(m: Mark): { x: number; y: number; w: number; h: number } {
  switch (m.type) {
    case 'pen':
    case 'highlighter': {
      let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
      for (let i = 0; i + 1 < m.pts.length; i += 2) {
        x0 = Math.min(x0, m.pts[i]);
        x1 = Math.max(x1, m.pts[i]);
        y0 = Math.min(y0, m.pts[i + 1]);
        y1 = Math.max(y1, m.pts[i + 1]);
      }
      const p = m.width / 2;
      return { x: x0 - p, y: y0 - p, w: x1 - x0 + 2 * p, h: y1 - y0 + 2 * p };
    }
    case 'line':
    case 'arrow': {
      const p = m.width * (m.type === 'arrow' ? 2.2 : 0.5);
      return { x: Math.min(m.x1, m.x2) - p, y: Math.min(m.y1, m.y2) - p, w: Math.abs(m.x2 - m.x1) + 2 * p, h: Math.abs(m.y2 - m.y1) + 2 * p };
    }
    case 'rect':
    case 'ellipse':
    case 'blur':
    case 'pixelate':
      return { x: m.x, y: m.y, w: m.w, h: m.h };
    case 'text': {
      const g = measure();
      g.font = fontCss(m);
      const { line, pad } = textMetrics(m.size);
      const lines = m.text.split('\n');
      const w = Math.max(...lines.map((l) => g.measureText(l).width), m.size * 0.3);
      return { x: m.x, y: m.y, w: w + 2 * pad, h: line * (lines.length - 1) + m.size * 1.12 + 2 * pad };
    }
    case 'emoji': {
      const g = measure();
      g.font = `${m.size}px ${EMOJI_FONT}`;
      return { x: m.x, y: m.y, w: Math.max(m.size, g.measureText(m.emoji).width), h: m.size * 1.18 };
    }
  }
}

/** The size of a mark's box (for words and emoji, which turn by their middle). */
export const markSize = (m: Mark) => (m.type === 'text' || m.type === 'emoji' ? markBox(m) : null);

const roundRect = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, r);
  else g.rect(x, y, w, h);
};

/**
 * Marks drawn on a context whose transform takes the frame's pixels to its own (hidden areas are not drawn: they are in
 * the picture). With `outline`, a hidden area shows its edge, so it can be seen and picked.
 */
export function drawMarks(g: CanvasRenderingContext2D, marks: Mark[], o: { outline?: boolean } = {}) {
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const m of marks) {
    g.globalAlpha = 1;
    switch (m.type) {
      case 'pen':
      case 'highlighter': {
        g.strokeStyle = m.color;
        g.fillStyle = m.color;
        g.lineWidth = m.width;
        if (m.type === 'highlighter') g.globalAlpha = 0.4;
        if (m.pts.length <= 2) {
          g.beginPath();
          g.arc(m.pts[0], m.pts[1], m.width / 2, 0, Math.PI * 2);
          g.fill();
          break;
        }
        g.beginPath();
        g.moveTo(m.pts[0], m.pts[1]);
        for (let i = 2; i + 1 < m.pts.length; i += 2) g.lineTo(m.pts[i], m.pts[i + 1]);
        g.stroke();
        break;
      }
      case 'line':
        g.strokeStyle = m.color;
        g.lineWidth = m.width;
        g.beginPath();
        g.moveTo(m.x1, m.y1);
        g.lineTo(m.x2, m.y2);
        g.stroke();
        break;
      case 'arrow': {
        const a = arrowHead(m.x1, m.y1, m.x2, m.y2, m.width);
        g.strokeStyle = m.color;
        g.fillStyle = m.color;
        g.lineWidth = m.width;
        g.beginPath();
        g.moveTo(m.x1, m.y1);
        g.lineTo(a.neck[0], a.neck[1]);
        g.stroke();
        g.beginPath();
        g.moveTo(a.tip[0], a.tip[1]);
        g.lineTo(a.left[0], a.left[1]);
        g.lineTo(a.right[0], a.right[1]);
        g.closePath();
        g.fill();
        break;
      }
      case 'rect':
      case 'ellipse':
        g.lineWidth = m.width;
        g.strokeStyle = m.color;
        g.beginPath();
        if (m.type === 'rect') g.rect(m.x, m.y, m.w, m.h);
        else g.ellipse(m.x + m.w / 2, m.y + m.h / 2, Math.max(0.5, m.w / 2), Math.max(0.5, m.h / 2), 0, 0, Math.PI * 2);
        if (m.fill) {
          g.fillStyle = m.fill;
          g.fill();
        }
        g.stroke();
        break;
      case 'text': {
        const { line, pad } = textMetrics(m.size);
        const box = markBox(m);
        if (m.bg) {
          g.fillStyle = m.bg;
          roundRect(g, box.x, box.y, box.w, box.h, pad * 0.7);
          g.fill();
        }
        g.font = fontCss(m);
        g.textBaseline = 'top';
        g.fillStyle = m.color;
        m.text.split('\n').forEach((l, i) => g.fillText(l, m.x + pad, m.y + pad + i * line));
        break;
      }
      case 'emoji':
        g.font = `${m.size}px ${EMOJI_FONT}`;
        g.textBaseline = 'top';
        g.fillText(m.emoji, m.x, m.y + m.size * 0.06);
        break;
      case 'blur':
      case 'pixelate':
        if (o.outline) {
          g.setLineDash([6 / Math.abs(g.getTransform().a || 1), 4 / Math.abs(g.getTransform().a || 1)]);
          g.lineWidth = 1.5 / Math.abs(g.getTransform().a || 1);
          g.strokeStyle = 'rgba(255,255,255,0.85)';
          g.strokeRect(m.x, m.y, m.w, m.h);
          g.setLineDash([]);
        }
        break;
    }
  }
  g.restore();
}

/** The mark under a point of the frame (the topmost), with a little room around thin ones (`slop`, frame pixels). */
export function markAt(marks: Mark[], x: number, y: number, slop: number): Mark | null {
  for (let i = marks.length - 1; i >= 0; i--) {
    const m = marks[i];
    if (m.type === 'pen' || m.type === 'highlighter') {
      const r = m.width / 2 + slop;
      for (let j = 0; j + 1 < m.pts.length; j += 2) {
        const [ax, ay] = [m.pts[j], m.pts[j + 1]];
        const [bx, by] = j + 3 < m.pts.length ? [m.pts[j + 2], m.pts[j + 3]] : [ax, ay];
        if (segDist(x, y, ax, ay, bx, by) <= r) return m;
      }
      continue;
    }
    if (m.type === 'line' || m.type === 'arrow') {
      if (segDist(x, y, m.x1, m.y1, m.x2, m.y2) <= m.width / 2 + slop * 1.5) return m;
      continue;
    }
    const b = markBox(m);
    // An outline's inside is the picture: a rectangle or oval with nothing in it is picked by its edge.
    if ((m.type === 'rect' || m.type === 'ellipse') && !m.fill) {
      const e = m.width / 2 + slop;
      const inner = x > b.x + e && x < b.x + b.w - e && y > b.y + e && y < b.y + b.h - e;
      if (x >= b.x - e && x <= b.x + b.w + e && y >= b.y - e && y <= b.y + b.h + e && !inner) return m;
      continue;
    }
    if (x >= b.x - slop && x <= b.x + b.w + slop && y >= b.y - slop && y <= b.y + b.h + slop) return m;
  }
  return null;
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

// ---- the file -------------------------------------------------------------------------------------------------

/** The picture as it is now, at its whole size, without its marks: what the AI tools are given (turned, cropped, its look and hidden areas in). */
export function flatten(base: Base, r: ImageRecipe): HTMLCanvasElement {
  const c = uprightCanvas(base.canvas, base.w, base.h, r, 1, true);
  putLook(c, r, 1, { x: r.crop?.x ?? 0, y: r.crop?.y ?? 0 });
  return c;
}

const MIME: Record<ImageFormat, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };

const toBlob = (c: HTMLCanvasElement, mime: string, quality?: number) => new Promise<Blob | null>((ok) => c.toBlob(ok, mime, quality));

export const blobData = (b: Blob): Promise<string> =>
  new Promise((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => fail(new Error('The picture could not be read'));
    r.readAsDataURL(b);
  });

/**
 * The file the recipe makes of the whole picture: turned and cropped, its look, its hidden areas and marks, at its size
 * (made smaller in halves, so it stays smooth), of its kind (a JPEG on white where the picture is see-through). A browser
 * that cannot make the kind asked (WebP, in some) makes a PNG, and says so (`made`).
 */
export async function makeFile(base: Base, r: ImageRecipe, format: ImageFormat, quality = 90): Promise<{ blob: Blob; w: number; h: number; mime: string; made: ImageFormat }> {
  let c = flatten(base, r);
  if (r.marks?.length) {
    const g = ctx2d(c);
    g.setTransform(1, 0, 0, 1, -(r.crop?.x ?? 0), -(r.crop?.y ?? 0));
    drawMarks(g, r.marks);
    g.setTransform(1, 0, 0, 1, 0, 0);
  }
  if (r.resize && (r.resize.w !== c.width || r.resize.h !== c.height)) {
    let cur = c;
    while (cur.width * 0.5 >= r.resize.w && cur.height * 0.5 >= r.resize.h) {
      const half = canvasOf(cur.width / 2, cur.height / 2);
      const g = ctx2d(half);
      g.imageSmoothingQuality = 'high';
      g.drawImage(cur, 0, 0, half.width, half.height);
      cur = half;
    }
    const out = canvasOf(r.resize.w, r.resize.h);
    const g = ctx2d(out);
    g.imageSmoothingQuality = 'high';
    g.drawImage(cur, 0, 0, out.width, out.height);
    c = out;
  }
  if (format === 'jpeg') {
    const white = canvasOf(c.width, c.height);
    const g = ctx2d(white);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, white.width, white.height);
    g.drawImage(c, 0, 0);
    c = white;
  }
  const mime = MIME[format];
  const blob = await toBlob(c, mime, format === 'png' ? undefined : Math.max(0.01, Math.min(1, quality / 100)));
  if (!blob) throw new Error('The picture could not be made: it may be too large for this browser');
  const made = blob.type === mime ? format : blob.type === 'image/jpeg' ? 'jpeg' : blob.type === 'image/webp' ? 'webp' : 'png';
  return { blob, w: c.width, h: c.height, mime: blob.type || mime, made };
}

/** Whether a canvas has see-through parts (looked at small, which is enough to tell). */
export function seeThrough(c: HTMLCanvasElement): boolean {
  const k = Math.min(1, 256 / Math.max(c.width, c.height));
  const s = canvasOf(c.width * k, c.height * k);
  const g = ctx2d(s, true);
  g.drawImage(c, 0, 0, s.width, s.height);
  const d = g.getImageData(0, 0, s.width, s.height).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
  return false;
}
