// Marks drawn into a picture's pixels on the server, as the editor's canvas draws them (web/src/features/mediaedit/
// render.ts): pen and highlighter strokes, lines and arrows (the same head, shared/mediaedit.ts arrowHead), boxes and
// ovals with their outline and fill, each with soft edges. Words are drawn by ffmpeg or Pillow (image.ts); emoji need a
// colour font, which the server does not have, so they are left to the editor.
import { arrowHead, type Mark } from '../../shared/mediaedit.ts';

/** A colour as RGBA, 0 to 255 (#rgb, #rgba, #rrggbb or #rrggbbaa). */
export function rgbaOf(c: string): [number, number, number, number] {
  const h = c.replace('#', '');
  const x = h.length <= 4 ? [...h].map((d) => d + d).join('') : h;
  const n = (i: number) => parseInt(x.slice(i, i + 2), 16);
  return [n(0) || 0, n(2) || 0, n(4) || 0, x.length >= 8 ? n(6) : 255];
}

/** Coverage of a part of the picture: 0 to 1 for each pixel of a box. */
interface Cover {
  x0: number;
  y0: number;
  w: number;
  h: number;
  a: Float32Array;
}

function cover(W: number, H: number, x0: number, y0: number, x1: number, y1: number): Cover | null {
  const bx0 = Math.max(0, Math.floor(x0));
  const by0 = Math.max(0, Math.floor(y0));
  const bx1 = Math.min(W, Math.ceil(x1));
  const by1 = Math.min(H, Math.ceil(y1));
  if (bx1 <= bx0 || by1 <= by0) return null;
  return { x0: bx0, y0: by0, w: bx1 - bx0, h: by1 - by0, a: new Float32Array((bx1 - bx0) * (by1 - by0)) };
}

/** The colour laid over the pixels as much as each is covered (`alpha`: how see-through the mark is). */
function blend(px: Uint8ClampedArray, W: number, c: Cover, rgba: [number, number, number, number], alpha = 1) {
  const [r, g, b, a0] = rgba;
  const base = (a0 / 255) * alpha;
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const k = c.a[y * c.w + x] * base;
      if (k <= 0) continue;
      const i = ((c.y0 + y) * W + c.x0 + x) * 4;
      const da = px[i + 3] / 255;
      const oa = k + da * (1 - k);
      if (oa <= 0) continue;
      px[i] = (r * k + px[i] * da * (1 - k)) / oa;
      px[i + 1] = (g * k + px[i + 1] * da * (1 - k)) / oa;
      px[i + 2] = (b * k + px[i + 2] * da * (1 - k)) / oa;
      px[i + 3] = oa * 255;
    }
  }
}

/** A thick line between points (round ends and joins) into a coverage, the most of any of its pieces. */
function strokeInto(c: Cover, pts: number[], width: number) {
  const r = width / 2;
  for (let i = 0; i + 1 < pts.length; i += 2) {
    const ax = pts[i];
    const ay = pts[i + 1];
    const bx = i + 3 < pts.length ? pts[i + 2] : ax;
    const by = i + 3 < pts.length ? pts[i + 3] : ay;
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy;
    const x0 = Math.max(c.x0, Math.floor(Math.min(ax, bx) - r - 1));
    const x1 = Math.min(c.x0 + c.w, Math.ceil(Math.max(ax, bx) + r + 1));
    const y0 = Math.max(c.y0, Math.floor(Math.min(ay, by) - r - 1));
    const y1 = Math.min(c.y0 + c.h, Math.ceil(Math.max(ay, by) + r + 1));
    for (let y = y0; y < y1; y++) {
      const py = y + 0.5;
      for (let x = x0; x < x1; x++) {
        const px = x + 0.5;
        const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
        const d = Math.hypot(px - ax - t * dx, py - ay - t * dy);
        const k = Math.max(0, Math.min(1, r - d + 0.5));
        const j = (y - c.y0) * c.w + (x - c.x0);
        if (k > c.a[j]) c.a[j] = k;
      }
    }
  }
}

/** A filled triangle into a coverage, its edges smoothed (four by four samples a pixel). */
function triangleInto(c: Cover, p: [number, number][]) {
  const [a, b, d] = p;
  const side = (x: number, y: number, u: [number, number], v: [number, number]) => (v[0] - u[0]) * (y - u[1]) - (v[1] - u[1]) * (x - u[0]);
  const area = side(d[0], d[1], a, b);
  const x0 = Math.max(c.x0, Math.floor(Math.min(a[0], b[0], d[0])));
  const x1 = Math.min(c.x0 + c.w, Math.ceil(Math.max(a[0], b[0], d[0])));
  const y0 = Math.max(c.y0, Math.floor(Math.min(a[1], b[1], d[1])));
  const y1 = Math.min(c.y0 + c.h, Math.ceil(Math.max(a[1], b[1], d[1])));
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      let n = 0;
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++) {
          const qx = x + (sx + 0.5) / 4;
          const qy = y + (sy + 0.5) / 4;
          const s1 = side(qx, qy, a, b) * area;
          const s2 = side(qx, qy, b, d) * area;
          const s3 = side(qx, qy, d, a) * area;
          if (s1 >= 0 && s2 >= 0 && s3 >= 0) n++;
        }
      const j = (y - c.y0) * c.w + (x - c.x0);
      const k = n / 16;
      if (k > c.a[j]) c.a[j] = k;
    }
}

/**
 * A box's outline (sharp corners, as a canvas strokes it) or its inside, into a coverage: by each pixel's distance to
 * its edge, measured squarely.
 */
function boxInto(c: Cover, m: { x: number; y: number; w: number; h: number }, width: number, fill: boolean) {
  const cx = m.x + m.w / 2;
  const cy = m.y + m.h / 2;
  const hx = m.w / 2;
  const hy = m.h / 2;
  for (let y = 0; y < c.h; y++)
    for (let x = 0; x < c.w; x++) {
      const qx = Math.abs(c.x0 + x + 0.5 - cx) - hx;
      const qy = Math.abs(c.y0 + y + 0.5 - cy) - hy;
      const d = Math.max(qx, qy);
      const k = fill ? Math.max(0, Math.min(1, 0.5 - d)) : Math.max(0, Math.min(1, width / 2 - Math.abs(d) + 0.5));
      const j = y * c.w + x;
      if (k > c.a[j]) c.a[j] = k;
    }
}

/** An oval's outline or inside, into a coverage: by how far each pixel is from its edge, nearly. */
function ovalInto(c: Cover, m: { x: number; y: number; w: number; h: number }, width: number, fill: boolean) {
  const cx = m.x + m.w / 2;
  const cy = m.y + m.h / 2;
  const a = Math.max(0.5, m.w / 2);
  const b = Math.max(0.5, m.h / 2);
  for (let y = 0; y < c.h; y++)
    for (let x = 0; x < c.w; x++) {
      const dx = c.x0 + x + 0.5 - cx;
      const dy = c.y0 + y + 0.5 - cy;
      const g = Math.sqrt((dx / a) ** 2 + (dy / b) ** 2);
      // The distance to the edge, to a first step: how far off it is, over how fast that changes.
      const grad = g > 1e-6 ? Math.sqrt((dx / (a * a)) ** 2 + (dy / (b * b)) ** 2) / g : 1 / Math.min(a, b);
      const d = (g - 1) / grad;
      const k = fill ? Math.max(0, Math.min(1, 0.5 - d)) : Math.max(0, Math.min(1, width / 2 - Math.abs(d) + 0.5));
      const j = y * c.w + x;
      if (k > c.a[j]) c.a[j] = k;
    }
}

/**
 * The marks drawn into RGBA pixels (`W` × `H`), the frame's point `at` at their top left (the crop's corner). Words,
 * emoji and hidden areas are not drawn here; they are left out.
 */
export function drawShapes(px: Uint8ClampedArray, W: number, H: number, marks: Mark[], at: { x: number; y: number }) {
  for (const m0 of marks) {
    const sh = (x: number, y: number): [number, number] => [x - at.x, y - at.y];
    switch (m0.type) {
      case 'pen':
      case 'highlighter': {
        const pts: number[] = [];
        for (let i = 0; i + 1 < m0.pts.length; i += 2) pts.push(...sh(m0.pts[i], m0.pts[i + 1]));
        let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
        for (let i = 0; i + 1 < pts.length; i += 2) {
          x0 = Math.min(x0, pts[i]);
          x1 = Math.max(x1, pts[i]);
          y0 = Math.min(y0, pts[i + 1]);
          y1 = Math.max(y1, pts[i + 1]);
        }
        const r = m0.width / 2 + 1;
        const c = cover(W, H, x0 - r, y0 - r, x1 + r, y1 + r);
        if (!c) break;
        strokeInto(c, pts, m0.width);
        blend(px, W, c, rgbaOf(m0.color), m0.type === 'highlighter' ? 0.4 : 1);
        break;
      }
      case 'line':
      case 'arrow': {
        const [x1, y1] = sh(m0.x1, m0.y1);
        const [x2, y2] = sh(m0.x2, m0.y2);
        const pad = m0.width * 3 + 2;
        const c = cover(W, H, Math.min(x1, x2) - pad, Math.min(y1, y2) - pad, Math.max(x1, x2) + pad, Math.max(y1, y2) + pad);
        if (!c) break;
        if (m0.type === 'line') strokeInto(c, [x1, y1, x2, y2], m0.width);
        else {
          const a = arrowHead(x1, y1, x2, y2, m0.width);
          strokeInto(c, [x1, y1, a.neck[0], a.neck[1]], m0.width);
          triangleInto(c, [a.tip, a.left, a.right]);
        }
        blend(px, W, c, rgbaOf(m0.color));
        break;
      }
      case 'rect':
      case 'ellipse': {
        const [x, y] = sh(m0.x, m0.y);
        const b = { x, y, w: m0.w, h: m0.h };
        const pad = m0.width / 2 + 2;
        const into = m0.type === 'rect' ? boxInto : ovalInto;
        if (m0.fill) {
          const f = cover(W, H, x - 1, y - 1, x + m0.w + 1, y + m0.h + 1);
          if (f) {
            into(f, b, 0, true);
            blend(px, W, f, rgbaOf(m0.fill));
          }
        }
        const c = cover(W, H, x - pad, y - pad, x + m0.w + pad, y + m0.h + pad);
        if (!c) break;
        into(c, b, m0.width, false);
        blend(px, W, c, rgbaOf(m0.color));
        break;
      }
    }
  }
}
