// The picture editor's pieces of drawing in the browser: a picture loaded to work on (from wherever it is: kept by the
// app, a Library item, a file, the web), made smaller only when the device cannot hold it; marks (words, shapes, lines,
// arrows, emoji, hidden areas) measured, drawn and found under a point, as the server draws them (server/mediaedit/
// raster.ts); and a canvas as a data: address. The layers are put together in picture/compose.ts.
import { arrowHead, fontOf, textFont, textMetrics, textReach, textWeight, type Mark } from '@shared/mediaedit';
import { mu } from '../../lib/machine';
import { parseBlank } from './picture/newpicture';

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
  // A new, blank picture (File → New): made here, nothing to read.
  const blank = parseBlank(src);
  if (blank) {
    const c = canvasOf(blank.w, blank.h);
    if (blank.fill) {
      const g = ctx2d(c);
      g.fillStyle = blank.fill;
      g.fillRect(0, 0, blank.w, blank.h);
    }
    return { canvas: c, w: blank.w, h: blank.h, mime: 'image/png' };
  }
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

// ---- marks --------------------------------------------------------------------------------------------------

const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const fontCss = (m: Extract<Mark, { type: 'text' }>) => textFont(m);

// ---- fonts -----------------------------------------------------------------------------------------------------

const asked = new Map<string, Promise<void>>();

/**
 * A font made ready to draw with: the Google font a mark names is loaded (its stylesheet, once, and the weights asked),
 * the app's and the computer's own are there already. Resolves when it can be drawn; never fails (a font that cannot be
 * loaded is drawn in the nearest the browser has).
 */
export function loadFont(m: { font?: string; bold?: boolean; italic?: boolean }): Promise<void> {
  const f = fontOf(m.font);
  if (!f.google) return Promise.resolve();
  const weight = textWeight(m);
  const key = `${f.id}:${weight}:${m.italic ? 'i' : 'n'}`;
  let p = asked.get(key);
  if (!p) {
    const id = `n-font-${f.id}`;
    if (!document.getElementById(id)) {
      const l = document.createElement('link');
      l.id = id;
      l.rel = 'stylesheet';
      const w = [...new Set([400, weight])].sort();
      l.href = `https://fonts.googleapis.com/css2?family=${f.google.replace(/ /g, '+')}:ital,wght@${w.map((x) => `0,${x}`).concat(m.italic ? w.map((x) => `1,${x}`) : []).join(';')}&display=swap`;
      document.head.append(l);
    }
    p = Promise.race([document.fonts.load(`${m.italic ? 'italic ' : ''}${weight} 16px ${f.css}`).then(() => undefined), new Promise<void>((ok) => setTimeout(ok, 6000))]).catch(() => undefined);
    asked.set(key, p);
  }
  return p;
}

/** Every font the words in these marks need, made ready. */
export const loadFonts = (marks: Mark[]) => Promise.all(marks.flatMap((m) => (m.type === 'text' ? [loadFont(m)] : []))).then(() => undefined);

/** The computer's own fonts' families, where the browser lets a page ask (Chromium does, after the person allows it). */
export async function localFamilies(): Promise<string[] | null> {
  const q = (window as unknown as { queryLocalFonts?: () => Promise<{ family: string }[]> }).queryLocalFonts;
  if (!q) return null;
  try {
    return [...new Set((await q.call(window)).map((x) => x.family))].sort((a, b) => a.localeCompare(b));
  } catch {
    return null;
  }
}

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
      const { line, pad } = textMetrics(m.size, m.lineHeight);
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

/**
 * A text mark's letters: each line against the left, middle or right of the widest, with the shadow under them and the
 * outline round them. A shadow is made the same at every zoom: its offset and softness are the picture's pixels, so it is
 * drawn on a canvas of its own at the screen's scale (a soft one blurred there) and laid under the words.
 */
function drawWords(g: CanvasRenderingContext2D, m: Extract<Mark, { type: 'text' }>, box: { x: number; y: number; w: number; h: number }, line: number, pad: number) {
  const lines = m.text.split('\n');
  const inner = box.w - 2 * pad;
  const at = (l: string) => m.x + pad + (m.align === 'centre' ? (inner - g.measureText(l).width) / 2 : m.align === 'right' ? inner - g.measureText(l).width : 0);
  const paint = (color: string, dx = 0, dy = 0, stroke = m.outline?.color) => {
    g.fillStyle = color;
    if (stroke && m.outline) {
      g.strokeStyle = stroke;
      g.lineWidth = m.outline.width * 2;
      g.lineJoin = 'round';
      g.miterLimit = 2;
      lines.forEach((l, i) => g.strokeText(l, at(l) + dx, m.y + pad + i * line + dy));
    }
    lines.forEach((l, i) => g.fillText(l, at(l) + dx, m.y + pad + i * line + dy));
  };
  const sh = m.shadow;
  if (sh && sh.blur > 0) {
    const t = g.getTransform();
    const s = Math.hypot(t.a, t.b) || 1;
    const room = Math.ceil(sh.blur * 2 + (m.outline?.width ?? 0) + 2);
    const W = Math.max(1, Math.ceil((box.w + 2 * room) * s));
    const H = Math.max(1, Math.ceil((box.h + 2 * room) * s));
    if (W * H <= 24_000_000) {
      const tmp = canvasOf(W, H);
      const tg = ctx2d(tmp);
      tg.setTransform(s, 0, 0, s, (room - box.x) * s, (room - box.y) * s);
      tg.font = g.font;
      tg.textBaseline = 'top';
      tg.filter = `blur(${sh.blur * s}px)`;
      tg.fillStyle = sh.color;
      if (m.outline) {
        tg.strokeStyle = sh.color;
        tg.lineWidth = m.outline.width * 2;
        tg.lineJoin = 'round';
        lines.forEach((l, i) => tg.strokeText(l, at(l), m.y + pad + i * line));
      }
      lines.forEach((l, i) => tg.fillText(l, at(l), m.y + pad + i * line));
      g.drawImage(tmp, box.x - room + sh.x, box.y - room + sh.y, W / s, H / s);
    }
  } else if (sh) paint(sh.color, sh.x, sh.y, sh.color);
  paint(m.color);
}

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
        const { line, pad } = textMetrics(m.size, m.lineHeight);
        const box = markBox(m);
        if (m.bg) {
          g.fillStyle = m.bg;
          roundRect(g, box.x, box.y, box.w, box.h, pad * 0.7);
          g.fill();
        }
        g.font = fontCss(m);
        g.textBaseline = 'top';
        drawWords(g, m, box, line, pad);
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

// ---- files -------------------------------------------------------------------------------------------------

export const blobData = (b: Blob): Promise<string> =>
  new Promise((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => fail(new Error('The picture could not be read'));
    r.readAsDataURL(b);
  });

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
