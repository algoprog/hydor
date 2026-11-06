// What the picture editor's brushes work out without a canvas, tested on their own (picture-test.ts): where a stroke's
// dabs go (evenly spaced along the pointer's path, however fast it moved), and the spot healing brush's fill: a small
// spot's pixels taken from around it (spread inward, coarse to fine, so the colours and light carry across it), with
// fine grain like its surroundings' so the patch does not look flat.

/** Where a stroke is: its last dab, and how far the pointer has gone since (toward the next). */
export interface DabTrail {
  x: number;
  y: number;
  /** Distance moved since the last dab. */
  carry: number;
}

/**
 * The dabs from the trail's last one to (x, y), `spacing` pixels apart (the first stroke's dab is the press itself):
 * their points, and the trail moved on.
 */
export function dabsTo(t: DabTrail, x: number, y: number, spacing: number): { pts: number[]; trail: DabTrail } {
  const s = Math.max(0.5, spacing);
  const dx = x - t.x;
  const dy = y - t.y;
  const len = Math.hypot(dx, dy);
  const pts: number[] = [];
  if (len === 0) return { pts, trail: t };
  let d = s - t.carry;
  while (d <= len) {
    pts.push(t.x + (dx * d) / len, t.y + (dy * d) / len);
    d += s;
  }
  const last = pts.length ? Math.hypot(pts[pts.length - 2] - t.x, pts[pts.length - 1] - t.y) : 0;
  return { pts, trail: { x, y, carry: pts.length ? len - last : t.carry + len } };
}

const hash = (x: number, y: number) => {
  let s = (x * 73856093) ^ (y * 19349663);
  s = Math.imul(s ^ (s >>> 13), 1274126177);
  return (((s ^ (s >>> 16)) >>> 0) / 4294967295) * 2 - 1;
};

/**
 * A picture part's holes filled from around them, in place: RGBA pixels `w` × `h`, `hole` one byte a pixel (how much of
 * it is to be filled, 0 to 255). The colours spread inward from what is kept (averaged down to coarser and coarser
 * copies, then brought back up, each pixel taking the coarser copy as far as it is a hole), then fine grain like the
 * kept pixels' around the hole is added, and each pixel is mixed as much as it is a hole.
 */
export function healFill(px: Uint8ClampedArray, w: number, h: number, hole: Uint8Array): void {
  const n = w * h;
  if (!n) return;
  type Level = { w: number; h: number; v: Float32Array; k: Float32Array };
  const base: Level = { w, h, v: new Float32Array(n * 4), k: new Float32Array(n) };
  for (let i = 0; i < n; i++) {
    const keep = 1 - hole[i] / 255;
    base.k[i] = keep >= 0.98 ? 1 : keep <= 0.02 ? 0 : keep;
    for (let c = 0; c < 4; c++) base.v[i * 4 + c] = px[i * 4 + c];
  }
  // Down: each coarser pixel the kept average of the four under it, as sure as they were together.
  const levels: Level[] = [base];
  for (let L = base; L.w > 1 || L.h > 1; ) {
    const W2 = Math.max(1, Math.ceil(L.w / 2));
    const H2 = Math.max(1, Math.ceil(L.h / 2));
    const up: Level = { w: W2, h: H2, v: new Float32Array(W2 * H2 * 4), k: new Float32Array(W2 * H2) };
    let open = false;
    for (let y = 0; y < H2; y++)
      for (let x = 0; x < W2; x++) {
        let kk = 0;
        const acc = [0, 0, 0, 0];
        for (let dy = 0; dy < 2; dy++)
          for (let dx = 0; dx < 2; dx++) {
            const sx = Math.min(L.w - 1, x * 2 + dx);
            const sy = Math.min(L.h - 1, y * 2 + dy);
            const j = sy * L.w + sx;
            const kj = L.k[j];
            kk += kj;
            for (let c = 0; c < 4; c++) acc[c] += L.v[j * 4 + c] * kj;
          }
        const o = y * W2 + x;
        if (kk > 1e-6) for (let c = 0; c < 4; c++) up.v[o * 4 + c] = acc[c] / kk;
        up.k[o] = Math.min(1, kk);
        if (up.k[o] < 1) open = true;
      }
    levels.push(up);
    L = up;
    if (!open) break;
  }
  // Up: each pixel takes the coarser copy (smoothly between its pixels) as far as it is not sure of itself.
  for (let l = levels.length - 2; l >= 0; l--) {
    const L = levels[l];
    const C = levels[l + 1];
    for (let y = 0; y < L.h; y++) {
      const fy = Math.min(C.h - 1, Math.max(0, (y + 0.5) / 2 - 0.5));
      const y0 = Math.floor(fy);
      const y1 = Math.min(C.h - 1, y0 + 1);
      const ty = fy - y0;
      for (let x = 0; x < L.w; x++) {
        const i = y * L.w + x;
        const k = L.k[i];
        if (k >= 1) continue;
        const fx = Math.min(C.w - 1, Math.max(0, (x + 0.5) / 2 - 0.5));
        const x0 = Math.floor(fx);
        const x1 = Math.min(C.w - 1, x0 + 1);
        const tx = fx - x0;
        for (let c = 0; c < 4; c++) {
          const a = C.v[(y0 * C.w + x0) * 4 + c] + (C.v[(y0 * C.w + x1) * 4 + c] - C.v[(y0 * C.w + x0) * 4 + c]) * tx;
          const b = C.v[(y1 * C.w + x0) * 4 + c] + (C.v[(y1 * C.w + x1) * 4 + c] - C.v[(y1 * C.w + x0) * 4 + c]) * tx;
          const up = a + (b - a) * ty;
          L.v[i * 4 + c] = L.v[i * 4 + c] * k + up * (1 - k);
        }
        L.k[i] = 1;
      }
    }
  }
  // The grain of the kept pixels near the hole: how far each differs from its neighbours' average.
  let s2 = 0;
  let cnt = 0;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (hole[i] || !(hole[i - 1] || hole[i + 1] || hole[i - w] || hole[i + w] || hole[i - 2] || hole[i + 2])) continue;
      const lum = (j: number) => 0.3 * px[j * 4] + 0.59 * px[j * 4 + 1] + 0.11 * px[j * 4 + 2];
      const d = lum(i) - (lum(i - 1) + lum(i + 1) + lum(i - w) + lum(i + w)) / 4;
      s2 += d * d;
      cnt++;
    }
  const sigma = cnt > 8 ? Math.min(24, Math.sqrt(s2 / cnt) * 0.8) : 0;
  for (let i = 0; i < n; i++) {
    const a = hole[i] / 255;
    if (!a) continue;
    const g = sigma ? hash(i % w, (i / w) | 0) * sigma * 1.7 : 0;
    for (let c = 0; c < 3; c++) px[i * 4 + c] = px[i * 4 + c] * (1 - a) + (base.v[i * 4 + c] + g) * a;
    px[i * 4 + 3] = px[i * 4 + 3] * (1 - a) + base.v[i * 4 + 3] * a;
  }
}
