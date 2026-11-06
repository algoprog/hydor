// Selections as the picture editor keeps them: a mask, one byte a pixel (0 outside, 255 inside, between at a soft
// edge) over the box of the picture it covers. Pure code, no canvas, so it runs anywhere and is tested on its own
// (picture-test.ts): a rectangle, an ellipse or a lasso's shape made a mask (smooth edged), masks added, taken away and
// crossed, inverted, feathered, grown and shrunk; the magic wand's and the paint bucket's flood fill (by tolerance,
// touching or anywhere in the picture); a mask's tight box; and its outline as lines, for the marching ants.

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Mask {
  x: number;
  y: number;
  w: number;
  h: number;
  data: Uint8Array;
}

export type MaskOp = 'replace' | 'add' | 'subtract' | 'intersect';

const clampI = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export const emptyMask = (x: number, y: number, w: number, h: number): Mask => ({ x, y, w: Math.max(0, w), h: Math.max(0, h), data: new Uint8Array(Math.max(0, w) * Math.max(0, h)) });

/** The coverage at a point of the picture (0 outside the mask's box). */
export function maskAt(m: Mask, X: number, Y: number): number {
  const x = Math.floor(X) - m.x;
  const y = Math.floor(Y) - m.y;
  return x < 0 || y < 0 || x >= m.w || y >= m.h ? 0 : m.data[y * m.w + x];
}

/** The box around what a mask covers at all, or null when it covers nothing. */
export function maskBounds(m: Mask, least = 1): Box | null {
  let x0 = m.w;
  let y0 = m.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < m.h; y++) {
    const row = y * m.w;
    for (let x = 0; x < m.w; x++)
      if (m.data[row + x] >= least) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
  }
  return x1 < 0 ? null : { x: m.x + x0, y: m.y + y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** The part of a mask in a box (outside it: nothing), as a new mask over that box. */
export function maskIn(m: Mask, b: Box): Mask {
  const out = emptyMask(b.x, b.y, b.w, b.h);
  const x0 = Math.max(b.x, m.x);
  const y0 = Math.max(b.y, m.y);
  const x1 = Math.min(b.x + b.w, m.x + m.w);
  const y1 = Math.min(b.y + b.h, m.y + m.h);
  for (let y = y0; y < y1; y++) {
    const src = (y - m.y) * m.w;
    const dst = (y - b.y) * b.w;
    out.data.set(m.data.subarray(src + x0 - m.x, src + x1 - m.x), dst + x0 - b.x);
  }
  return out;
}

/** A mask cut to the box of what it covers (null when it covers nothing): a small selection keeps little memory. */
export function trimMask(m: Mask): Mask | null {
  const b = maskBounds(m);
  if (!b) return null;
  return b.x === m.x && b.y === m.y && b.w === m.w && b.h === m.h ? m : maskIn(m, b);
}

/** Whether a mask covers all of a picture `W` × `H` fully. */
export function coversAll(m: Mask, W: number, H: number): boolean {
  if (m.x > 0 || m.y > 0 || m.x + m.w < W || m.y + m.h < H) return false;
  for (let y = 0; y < H; y++) {
    const row = (y - m.y) * m.w - m.x;
    for (let x = 0; x < W; x++) if (m.data[row + x] !== 255) return false;
  }
  return true;
}

/** The whole picture, selected. */
export function allMask(W: number, H: number): Mask {
  const m = emptyMask(0, 0, W, H);
  m.data.fill(255);
  return m;
}

/** A rectangle (its edges smoothed where they fall between pixels), within a picture `W` × `H`. */
export function rectMask(b: Box, W: number, H: number): Mask | null {
  const x0 = Math.max(0, Math.floor(b.x));
  const y0 = Math.max(0, Math.floor(b.y));
  const x1 = Math.min(W, Math.ceil(b.x + b.w));
  const y1 = Math.min(H, Math.ceil(b.y + b.h));
  if (x1 <= x0 || y1 <= y0) return null;
  const m = emptyMask(x0, y0, x1 - x0, y1 - y0);
  for (let y = y0; y < y1; y++) {
    const cy = Math.min(y + 1, b.y + b.h) - Math.max(y, b.y);
    for (let x = x0; x < x1; x++) {
      const cx = Math.min(x + 1, b.x + b.w) - Math.max(x, b.x);
      m.data[(y - y0) * m.w + x - x0] = Math.round(clampI(cx, 0, 1) * clampI(cy, 0, 1) * 255);
    }
  }
  return trimMask(m);
}

/** An ellipse in a box (four by four samples a pixel at its edge), within a picture `W` × `H`. */
export function ellipseMask(b: Box, W: number, H: number): Mask | null {
  const x0 = Math.max(0, Math.floor(b.x));
  const y0 = Math.max(0, Math.floor(b.y));
  const x1 = Math.min(W, Math.ceil(b.x + b.w));
  const y1 = Math.min(H, Math.ceil(b.y + b.h));
  if (x1 <= x0 || y1 <= y0 || b.w < 0.5 || b.h < 0.5) return null;
  const m = emptyMask(x0, y0, x1 - x0, y1 - y0);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const rx = b.w / 2;
  const ry = b.h / 2;
  const inside = (px: number, py: number) => ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const a = inside(x, y);
      // Every corner on the same side: the pixel is wholly in or out.
      if (a === inside(x + 1, y) && a === inside(x, y + 1) && a === inside(x + 1, y + 1) && Math.abs(x + 0.5 - cx) < rx && Math.abs(y + 0.5 - cy) < ry && a) {
        m.data[(y - y0) * m.w + x - x0] = 255;
        continue;
      }
      let n = 0;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) if (inside(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4)) n++;
      m.data[(y - y0) * m.w + x - x0] = Math.round((n / 16) * 255);
    }
  return trimMask(m);
}

/**
 * A closed shape through points (x, y, x, y…: a lasso's or a polygon's), filled by the even-odd rule, its edges
 * smoothed (four rows a pixel, each crossing's share of its pixel counted), within a picture `W` × `H`.
 */
export function polygonMask(pts: number[], W: number, H: number): Mask | null {
  const n = Math.floor(pts.length / 2);
  if (n < 3) return null;
  let bx0 = Infinity;
  let by0 = Infinity;
  let bx1 = -Infinity;
  let by1 = -Infinity;
  for (let i = 0; i < n; i++) {
    bx0 = Math.min(bx0, pts[i * 2]);
    bx1 = Math.max(bx1, pts[i * 2]);
    by0 = Math.min(by0, pts[i * 2 + 1]);
    by1 = Math.max(by1, pts[i * 2 + 1]);
  }
  const x0 = Math.max(0, Math.floor(bx0));
  const y0 = Math.max(0, Math.floor(by0));
  const x1 = Math.min(W, Math.ceil(bx1));
  const y1 = Math.min(H, Math.ceil(by1));
  if (x1 <= x0 || y1 <= y0) return null;
  const w = x1 - x0;
  const m = emptyMask(x0, y0, w, y1 - y0);
  const acc = new Float32Array(w + 1);
  const xs: number[] = [];
  const SUB = 4;
  for (let y = y0; y < y1; y++) {
    acc.fill(0);
    for (let s = 0; s < SUB; s++) {
      const sy = y + (s + 0.5) / SUB;
      xs.length = 0;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const ay = pts[i * 2 + 1];
        const by = pts[j * 2 + 1];
        if (ay > sy !== by > sy) xs.push(pts[i * 2] + ((sy - ay) * (pts[j * 2] - pts[i * 2])) / (by - ay));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const a = clampI(xs[k] - x0, 0, w);
        const b = clampI(xs[k + 1] - x0, 0, w);
        if (b <= a) continue;
        const ia = Math.floor(a);
        const ib = Math.floor(b);
        if (ia === ib) acc[ia] += b - a;
        else {
          acc[ia] += ia + 1 - a;
          for (let x = ia + 1; x < ib; x++) acc[x] += 1;
          if (ib < w) acc[ib] += b - ib;
        }
      }
    }
    const row = (y - y0) * w;
    for (let x = 0; x < w; x++) m.data[row + x] = Math.round(clampI(acc[x] / SUB, 0, 1) * 255);
  }
  return trimMask(m);
}

/** Two masks put together: `b` added to `a`, taken from it, crossed with it, or in its place. */
export function combineMasks(a: Mask | null, b: Mask | null, op: MaskOp): Mask | null {
  if (op === 'replace') return b;
  if (!a) return op === 'add' ? b : null;
  if (!b) return op === 'intersect' ? null : a;
  if (op === 'intersect') {
    const x0 = Math.max(a.x, b.x);
    const y0 = Math.max(a.y, b.y);
    const x1 = Math.min(a.x + a.w, b.x + b.w);
    const y1 = Math.min(a.y + a.h, b.y + b.h);
    if (x1 <= x0 || y1 <= y0) return null;
    const out = emptyMask(x0, y0, x1 - x0, y1 - y0);
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const va = a.data[(y - a.y) * a.w + x - a.x];
        const vb = b.data[(y - b.y) * b.w + x - b.x];
        out.data[(y - y0) * out.w + x - x0] = (va * vb + 127) / 255;
      }
    return trimMask(out);
  }
  if (op === 'subtract') {
    const out: Mask = { ...a, data: new Uint8Array(a.data) };
    const x0 = Math.max(a.x, b.x);
    const y0 = Math.max(a.y, b.y);
    const x1 = Math.min(a.x + a.w, b.x + b.w);
    const y1 = Math.min(a.y + a.h, b.y + b.h);
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = (y - a.y) * a.w + x - a.x;
        const vb = b.data[(y - b.y) * b.w + x - b.x];
        out.data[i] = (out.data[i] * (255 - vb) + 127) / 255;
      }
    return trimMask(out);
  }
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const out = emptyMask(x0, y0, Math.max(a.x + a.w, b.x + b.w) - x0, Math.max(a.y + a.h, b.y + b.h) - y0);
  const put = (m: Mask) => {
    for (let y = 0; y < m.h; y++) {
      const dst = (y + m.y - y0) * out.w + m.x - x0;
      const src = y * m.w;
      for (let x = 0; x < m.w; x++) {
        const v = m.data[src + x];
        const d = out.data[dst + x];
        // Screen: what either covers, and both together more.
        out.data[dst + x] = d + v - ((d * v + 127) / 255 | 0);
      }
    }
  };
  put(a);
  put(b);
  return out;
}

/** Everything not in the mask, over the whole picture `W` × `H`; null when that is nothing. */
export function invertMask(m: Mask | null, W: number, H: number): Mask | null {
  const out = allMask(W, H);
  if (!m) return out;
  for (let y = Math.max(0, m.y); y < Math.min(H, m.y + m.h); y++)
    for (let x = Math.max(0, m.x); x < Math.min(W, m.x + m.w); x++) out.data[y * W + x] = 255 - m.data[(y - m.y) * m.w + x - m.x];
  return trimMask(out);
}

/** A mask spread over a larger box (by `r` each way, within the picture), for what grows past its edge. */
function padded(m: Mask, r: number, W: number, H: number): Mask {
  const x0 = Math.max(0, m.x - r);
  const y0 = Math.max(0, m.y - r);
  const x1 = Math.min(W, m.x + m.w + r);
  const y1 = Math.min(H, m.y + m.h + r);
  return maskIn(m, { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) });
}

/** Box-blurs bytes in place along rows then columns, `passes` times (three come near a Gaussian). */
function blurBytes(d: Uint8Array, w: number, h: number, r: number, passes: number) {
  const tmp = new Float32Array(d.length);
  const src = new Float32Array(d);
  const line = (a: Float32Array, b: Float32Array, step: number, next: number, count: number, lines: number) => {
    const q = Math.min(r, count - 1);
    const div = 2 * q + 1;
    const last = count - 1;
    for (let l = 0; l < lines; l++) {
      const o = l * next;
      let sum = 0;
      for (let i = -q; i <= q; i++) sum += a[o + clampI(i, 0, last) * step];
      for (let i = 0; i < count; i++) {
        b[o + i * step] = sum / div;
        sum += a[o + Math.min(last, i + q + 1) * step] - a[o + Math.max(0, i - q) * step];
      }
    }
  };
  for (let p = 0; p < passes; p++) {
    line(src, tmp, 1, w, w, h);
    line(tmp, src, w, 1, h, w);
  }
  for (let i = 0; i < d.length; i++) d[i] = src[i] + 0.5;
}

/** A selection's edge softened over about `r` pixels (inside the picture `W` × `H`). */
export function featherMask(m: Mask, r: number, W: number, H: number): Mask | null {
  const rr = Math.max(0, Math.round(r));
  if (!rr) return m;
  const p = padded(m, rr * 2, W, H);
  // Three box blurs of a third of the radius each: about a Gaussian of that reach.
  blurBytes(p.data, p.w, p.h, Math.max(1, Math.round(rr / 1.7)), 3);
  return trimMask(p);
}

/**
 * How far each pixel is from the nearest one where `inside` holds (0 there): two passes of 3-4 chamfer distances
 * (close to the true distance, within 8%), in units of a third of a pixel; `edge` says what lies beyond the box.
 */
function chamfer(inside: (i: number) => boolean, w: number, h: number, edge: boolean): Uint32Array {
  const BIG = 1 << 30;
  const d = new Uint32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = inside(i) ? 0 : BIG;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? (edge ? 0 : BIG) : d[y * w + x]);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4);
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4);
    }
  return d;
}

/** The selection grown by `r` pixels all round (within the picture `W` × `H`). */
export function growMask(m: Mask, r: number, W: number, H: number): Mask | null {
  const rr = Math.max(0, Math.round(r));
  if (!rr) return m;
  const p = padded(m, rr + 1, W, H);
  const d = chamfer((i) => p.data[i] >= 128, p.w, p.h, false);
  for (let i = 0; i < d.length; i++) {
    // A smooth edge: the last third of a pixel fades.
    const v = rr * 3 + 1.5 - d[i];
    p.data[i] = Math.max(p.data[i], v >= 3 ? 255 : v <= 0 ? 0 : Math.round((v / 3) * 255));
  }
  return trimMask(p);
}

/** The selection shrunk by `r` pixels all round; its sides along the picture's edges stay where they are. */
export function shrinkMask(m: Mask, r: number, W: number, H: number): Mask | null {
  const rr = Math.max(0, Math.round(r));
  if (!rr) return m;
  const p = padded(m, 1, W, H);
  // Beyond the picture counts as selected, so a selection along its edge does not draw back from it.
  const touches = { l: p.x === 0, t: p.y === 0, r: p.x + p.w === W, b: p.y + p.h === H };
  const d = chamfer((i) => p.data[i] < 128, p.w, p.h, false);
  const outsideAt = (x: number, y: number) => (x < 0 ? !touches.l : y < 0 ? !touches.t : x >= p.w ? !touches.r : y >= p.h ? !touches.b : false);
  // Distances to the box's own border where it is not the picture's edge.
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const i = y * p.w + x;
      let e = d[i];
      if (outsideAt(-1, 0)) e = Math.min(e, (x + 1) * 3);
      if (outsideAt(0, -1)) e = Math.min(e, (y + 1) * 3);
      if (outsideAt(p.w, 0)) e = Math.min(e, (p.w - x) * 3);
      if (outsideAt(0, p.h)) e = Math.min(e, (p.h - y) * 3);
      const v = e - rr * 3 - 1.5;
      p.data[i] = Math.min(p.data[i], v >= 3 ? 255 : v <= 0 ? 0 : Math.round((v / 3) * 255));
    }
  return trimMask(p);
}

/**
 * The magic wand's and the paint bucket's fill: the pixels whose colour is within `tolerance` (0 to 255, on each of
 * red, green, blue and how see-through) of the one at (x, y); only those joined to it (`contiguous`, side by side), or
 * any in the picture. RGBA pixels `w` × `h`.
 */
export function floodMask(px: Uint8ClampedArray | Uint8Array, w: number, h: number, x: number, y: number, tolerance: number, contiguous: boolean): Mask | null {
  const sx = Math.floor(x);
  const sy = Math.floor(y);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return null;
  const o = (sy * w + sx) * 4;
  const r0 = px[o];
  const g0 = px[o + 1];
  const b0 = px[o + 2];
  const a0 = px[o + 3];
  const t = clampI(Math.round(tolerance), 0, 255);
  const near = (i: number) => {
    const j = i * 4;
    return Math.abs(px[j] - r0) <= t && Math.abs(px[j + 1] - g0) <= t && Math.abs(px[j + 2] - b0) <= t && Math.abs(px[j + 3] - a0) <= t;
  };
  const m = emptyMask(0, 0, w, h);
  if (!contiguous) {
    for (let i = 0; i < w * h; i++) if (near(i)) m.data[i] = 255;
    return trimMask(m);
  }
  // Row by row: a run is filled at once, and the rows above and below it are looked at for more.
  const stack: number[] = [sx, sy];
  while (stack.length) {
    const yy = stack.pop()!;
    const xx = stack.pop()!;
    const row = yy * w;
    if (m.data[row + xx] || !near(row + xx)) continue;
    let a = xx;
    let b = xx;
    while (a > 0 && !m.data[row + a - 1] && near(row + a - 1)) a--;
    while (b < w - 1 && !m.data[row + b + 1] && near(row + b + 1)) b++;
    m.data.fill(255, row + a, row + b + 1);
    for (const ny of [yy - 1, yy + 1]) {
      if (ny < 0 || ny >= h) continue;
      const nrow = ny * w;
      let open = false;
      for (let k = a; k <= b; k++) {
        const ok = !m.data[nrow + k] && near(nrow + k);
        if (ok && !open) stack.push(k, ny);
        open = ok;
      }
    }
  }
  return trimMask(m);
}

/** How much of the mask is covered: its pixels' coverage summed, in whole pixels. */
export function maskArea(m: Mask): number {
  let s = 0;
  for (let i = 0; i < m.data.length; i++) s += m.data[i];
  return s / 255;
}

/**
 * A mask's outline, where it crosses half coverage, as lines through the corners of pixels: each a list of points
 * (x, y, x, y…, in the picture's pixels), closed lines ending where they began. Looked at `step` pixels at a time
 * (a large mask shown small needs no finer outline).
 */
export function maskOutline(m: Mask, step = 1): number[][] {
  const s = Math.max(1, Math.round(step));
  const w = Math.ceil(m.w / s);
  const h = Math.ceil(m.h / s);
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && m.data[Math.min(m.h - 1, y * s) * m.w + Math.min(m.w - 1, x * s)] >= 128;
  // Edges between a cell in and one out, each from one grid corner to the next, the inside on its right.
  const next = new Map<number, number[]>();
  const key = (x: number, y: number) => y * (w + 2) + x;
  const add = (ax: number, ay: number, bx: number, by: number) => {
    const k = key(ax, ay);
    const l = next.get(k);
    if (l) l.push(key(bx, by));
    else next.set(k, [key(bx, by)]);
  };
  for (let y = 0; y <= h; y++)
    for (let x = 0; x <= w; x++) {
      const c = on(x, y);
      if (c !== on(x, y - 1)) (c ? add(x, y, x + 1, y) : add(x + 1, y, x, y));
      if (c !== on(x - 1, y)) (c ? add(x, y + 1, x, y) : add(x, y, x, y + 1));
    }
  const lines: number[][] = [];
  for (const [start] of next) {
    while (next.get(start)?.length) {
      const pts: number[] = [];
      let k = start;
      for (;;) {
        const l = next.get(k);
        if (!l?.length) break;
        const n = l.pop()!;
        if (!l.length) next.delete(k);
        const kx = k % (w + 2);
        const ky = (k - kx) / (w + 2);
        pts.push(m.x + Math.min(m.w, kx * s), m.y + Math.min(m.h, ky * s));
        k = n;
        if (k === start) break;
      }
      const kx = k % (w + 2);
      const ky = (k - kx) / (w + 2);
      pts.push(m.x + Math.min(m.w, kx * s), m.y + Math.min(m.h, ky * s));
      if (pts.length >= 4) lines.push(simplify(pts));
    }
  }
  return lines;
}

/** Points along straight runs dropped (only the turns kept). */
function simplify(pts: number[]): number[] {
  if (pts.length <= 6) return pts;
  const out = [pts[0], pts[1]];
  for (let i = 2; i + 2 < pts.length; i += 2) {
    const [ax, ay] = [out[out.length - 2], out[out.length - 1]];
    const [bx, by, cx, cy] = [pts[i], pts[i + 1], pts[i + 2], pts[i + 3]];
    if ((bx - ax) * (cy - by) - (by - ay) * (cx - bx) !== 0) out.push(bx, by);
  }
  out.push(pts[pts.length - 2], pts[pts.length - 1]);
  return out;
}

/** A mask moved by (dx, dy). */
export const moveMask = (m: Mask, dx: number, dy: number): Mask => ({ ...m, x: m.x + Math.round(dx), y: m.y + Math.round(dy) });

/** A mask's bytes, for memory counts. */
export const maskBytes = (m: Mask | null | undefined) => (m ? m.data.length : 0);
