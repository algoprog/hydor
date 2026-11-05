// PNG pictures read and written with Node's zlib alone: a signature checked and cleaned as it comes in (read, then
// written again, so nothing but its pixels is kept), a signature laid on a picture the user signs, and a box drawn on
// a picture to show an agent where a signature would go. Reads every kind of PNG (grey, colour, a palette; with or
// without see-through parts; 1 to 16 bits; interlaced or not) into 8-bit RGBA, and writes RGBA or RGB.
import zlib from 'node:zlib';

/** A picture's pixels: 4 bytes each (red, green, blue, alpha), row after row. */
export interface Rgba {
  width: number;
  height: number;
  data: Uint8Array;
}

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export const isPng = (b: Buffer) => b.length > 8 && b.subarray(0, 8).equals(SIGNATURE);

/** The size a PNG says it is, from its header alone; null when it is not a PNG. */
export function pngSize(b: Buffer): { width: number; height: number } | null {
  if (!isPng(b) || b.length < 24 || b.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const DEPTHS: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
/** Adam7's passes: where each starts and how far apart its pixels are. */
const PASSES: [number, number, number, number][] = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
];

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Rows of `stride` bytes after their filter bytes, from `src` at `at`, unfiltered. */
function unfilter(src: Buffer, at: number, rows: number, stride: number, bpp: number): Uint8Array {
  const out = new Uint8Array(rows * stride);
  for (let y = 0; y < rows; y++) {
    const f = src[at++];
    const o = y * stride;
    const up = o - stride;
    for (let i = 0; i < stride; i++) {
      const x = src[at + i];
      const a = i >= bpp ? out[o + i - bpp] : 0;
      const b = y > 0 ? out[up + i] : 0;
      let v: number;
      if (f === 0) v = x;
      else if (f === 1) v = x + a;
      else if (f === 2) v = x + b;
      else if (f === 3) v = x + ((a + b) >> 1);
      else if (f === 4) v = x + paeth(a, b, i >= bpp && y > 0 ? out[up + i - bpp] : 0);
      else throw new Error('The PNG picture is damaged (an unknown row filter)');
      out[o + i] = v & 255;
    }
    at += stride;
  }
  return out;
}

/**
 * A PNG's pixels as 8-bit RGBA. Throws, in plain words, for what is not a PNG, is damaged, or is larger than
 * `maxPixels` (40 million unless told).
 */
export function readPng(b: Buffer, o: { maxPixels?: number } = {}): Rgba {
  if (!isPng(b)) throw new Error('It is not a PNG picture');
  let p = 8;
  let ihdr: Buffer | null = null;
  let plte: Buffer | null = null;
  let trns: Buffer | null = null;
  const idat: Buffer[] = [];
  while (p + 8 <= b.length) {
    const len = b.readUInt32BE(p);
    const type = b.toString('latin1', p + 4, p + 8);
    if (p + 12 + len > b.length) throw new Error('The PNG picture is cut short');
    const data = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') ihdr = data;
    else if (type === 'PLTE') plte = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (!ihdr || ihdr.length < 13) throw new Error('The PNG picture has no header');
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const depth = ihdr[8];
  const color = ihdr[9];
  const interlaced = ihdr[12] === 1;
  const channels = CHANNELS[color];
  if (!channels || !DEPTHS[color].includes(depth) || ihdr[10] !== 0 || ihdr[11] !== 0 || ihdr[12] > 1) throw new Error('The PNG picture is of a kind this cannot read');
  if (!width || !height) throw new Error('The PNG picture is empty');
  if (width * height > (o.maxPixels ?? 40_000_000)) throw new Error('The picture is too large');
  if (color === 3 && !plte) throw new Error('The PNG picture is damaged (no palette)');
  if (!idat.length) throw new Error('The PNG picture has no pixels');

  const bits = channels * depth;
  const bpp = Math.max(1, bits >> 3);
  const passes = interlaced ? PASSES.map(([x0, y0, dx, dy]) => ({ x0, y0, dx, dy, w: Math.ceil(Math.max(0, width - x0) / dx), h: Math.ceil(Math.max(0, height - y0) / dy) })) : [{ x0: 0, y0: 0, dx: 1, dy: 1, w: width, h: height }];
  const want = passes.reduce((s, q) => s + (q.w && q.h ? q.h * (1 + Math.ceil((q.w * bits) / 8)) : 0), 0);
  let raw: Buffer;
  try {
    raw = zlib.inflateSync(Buffer.concat(idat), { maxOutputLength: want + 4096 });
  } catch {
    throw new Error('The PNG picture is damaged');
  }
  if (raw.length < want) throw new Error('The PNG picture is cut short');

  const out = new Uint8Array(width * height * 4);
  const max = (1 << depth) - 1;
  // A colour kept see-through by tRNS (grey or RGB): the sample values as they are written.
  const clearGrey = color === 0 && trns && trns.length >= 2 ? trns.readUInt16BE(0) : -1;
  const clearRgb = color === 2 && trns && trns.length >= 6 ? [trns.readUInt16BE(0), trns.readUInt16BE(2), trns.readUInt16BE(4)] : null;
  let at = 0;
  for (const q of passes) {
    if (!q.w || !q.h) continue;
    const stride = Math.ceil((q.w * bits) / 8);
    const rows = unfilter(raw, at, q.h, stride, bpp);
    at += q.h * (1 + stride);
    for (let y = 0; y < q.h; y++) {
      const row = y * stride;
      for (let x = 0; x < q.w; x++) {
        // The pixel's samples as written (up to 16 bits each).
        const sample = (c: number): number => {
          if (depth === 8) return rows[row + x * channels + c];
          if (depth === 16) return (rows[row + (x * channels + c) * 2] << 8) | rows[row + (x * channels + c) * 2 + 1];
          const bit = (x * channels + c) * depth;
          return (rows[row + (bit >> 3)] >> (8 - depth - (bit & 7))) & max;
        };
        const to8 = (v: number) => (depth === 16 ? v >> 8 : depth === 8 ? v : Math.round((v * 255) / max));
        const o4 = ((q.y0 + y * q.dy) * width + (q.x0 + x * q.dx)) * 4;
        if (color === 3) {
          const i = sample(0);
          out[o4] = plte![i * 3] ?? 0;
          out[o4 + 1] = plte![i * 3 + 1] ?? 0;
          out[o4 + 2] = plte![i * 3 + 2] ?? 0;
          out[o4 + 3] = trns && i < trns.length ? trns[i] : 255;
        } else if (color === 0 || color === 4) {
          const g = sample(0);
          out[o4] = out[o4 + 1] = out[o4 + 2] = to8(g);
          out[o4 + 3] = color === 4 ? to8(sample(1)) : g === clearGrey ? 0 : 255;
        } else {
          const r = sample(0);
          const g = sample(1);
          const bl = sample(2);
          out[o4] = to8(r);
          out[o4 + 1] = to8(g);
          out[o4 + 2] = to8(bl);
          out[o4 + 3] = color === 6 ? to8(sample(3)) : clearRgb && r === clearRgb[0] && g === clearRgb[1] && bl === clearRgb[2] ? 0 : 255;
        }
      }
    }
  }
  return { width, height, data: out };
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

/**
 * The picture as a PNG: RGBA, or RGB when `alpha` is false (every pixel is taken as it is, its alpha left out). Each row
 * gets the filter that leaves the smallest differences, as most writers choose.
 */
export function writePng(img: Rgba, o: { alpha?: boolean } = {}): Buffer {
  const alpha = o.alpha !== false;
  const { width, height, data } = img;
  const ch = alpha ? 4 : 3;
  const stride = width * ch;
  const rows = Buffer.alloc(height * (stride + 1));
  const cur = new Uint8Array(stride);
  const prev = new Uint8Array(stride);
  const cand = [0, 1, 2, 3, 4].map(() => new Uint8Array(stride));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) for (let c = 0; c < ch; c++) cur[x * ch + c] = data[(y * width + x) * 4 + c];
    let best = 0;
    let bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      const t = cand[f];
      let sum = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= ch ? cur[i - ch] : 0;
        const b = y > 0 ? prev[i] : 0;
        const c = i >= ch && y > 0 ? prev[i - ch] : 0;
        const v = (cur[i] - (f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c))) & 255;
        t[i] = v;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) {
        bestSum = sum;
        best = f;
      }
    }
    const at = y * (stride + 1);
    rows[at] = best;
    rows.set(cand[best], at + 1);
    prev.set(cur);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = alpha ? 6 : 2;
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** Whether any pixel is less than whole (the picture has see-through parts). */
export function hasAlpha(img: Rgba): boolean {
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] < 255) return true;
  return false;
}

/**
 * The picture made `w`×`h` pixels: each new pixel the average of the old ones under it (area averaging, so a large
 * signature made small stays smooth), weighted by alpha so see-through pixels lend no colour.
 */
export function resize(img: Rgba, w: number, h: number): Rgba {
  const { width: W, height: H, data } = img;
  const out = new Uint8Array(w * h * 4);
  const sx = W / w;
  const sy = H / h;
  for (let y = 0; y < h; y++) {
    const y0 = y * sy;
    const y1 = Math.min(H, (y + 1) * sy);
    for (let x = 0; x < w; x++) {
      const x0 = x * sx;
      const x1 = Math.min(W, (x + 1) * sx);
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let area = 0;
      for (let yy = Math.floor(y0); yy < Math.ceil(y1); yy++) {
        const wy = Math.min(yy + 1, y1) - Math.max(yy, y0);
        if (wy <= 0) continue;
        for (let xx = Math.floor(x0); xx < Math.ceil(x1); xx++) {
          const wx = Math.min(xx + 1, x1) - Math.max(xx, x0);
          if (wx <= 0) continue;
          const k = wx * wy;
          const i = (yy * W + xx) * 4;
          const al = data[i + 3] * k;
          r += data[i] * al;
          g += data[i + 1] * al;
          b += data[i + 2] * al;
          a += al;
          area += k;
        }
      }
      const o = (y * w + x) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
      }
      out[o + 3] = area > 0 ? Math.round(a / area) : 0;
    }
  }
  return { width: w, height: h, data: out };
}

/** `top` laid over `base` with its top-left corner at (x, y), its see-through parts showing what is under them. */
export function composite(base: Rgba, top: Rgba, x: number, y: number): Rgba {
  const out = { width: base.width, height: base.height, data: base.data.slice() };
  for (let ty = 0; ty < top.height; ty++) {
    const by = y + ty;
    if (by < 0 || by >= base.height) continue;
    for (let tx = 0; tx < top.width; tx++) {
      const bx = x + tx;
      if (bx < 0 || bx >= base.width) continue;
      const t = (ty * top.width + tx) * 4;
      const a = top.data[t + 3] / 255;
      if (a <= 0) continue;
      const o = (by * base.width + bx) * 4;
      const ba = out.data[o + 3] / 255;
      const oa = a + ba * (1 - a);
      for (let c = 0; c < 3; c++) out.data[o + c] = Math.round((top.data[t + c] * a + out.data[o + c] * ba * (1 - a)) / oa);
      out.data[o + 3] = Math.round(oa * 255);
    }
  }
  return out;
}

/** A see-through picture of a box: a light blue fill, a darker dashed border and its two diagonals (where a signature would go). */
export function boxPicture(w: number, h: number): Rgba {
  const W = Math.max(8, Math.round(w));
  const H = Math.max(8, Math.round(h));
  const data = new Uint8Array(W * H * 4);
  const line = Math.max(2, Math.round(Math.min(W, H) / 40));
  const put = (x: number, y: number, a: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    data[o] = 37;
    data[o + 1] = 99;
    data[o + 2] = 235;
    data[o + 3] = Math.max(data[o + 3], a);
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, 40);
  const dash = line * 4;
  for (let x = 0; x < W; x++) if (Math.floor(x / dash) % 2 === 0) for (let t = 0; t < line; t++) (put(x, t, 230), put(x, H - 1 - t, 230));
  for (let y = 0; y < H; y++) if (Math.floor(y / dash) % 2 === 0) for (let t = 0; t < line; t++) (put(t, y, 230), put(W - 1 - t, y, 230));
  const steps = Math.max(W, H) * 2;
  for (let i = 0; i <= steps; i++) {
    const x = Math.round((i / steps) * (W - 1));
    const y = Math.round((i / steps) * (H - 1));
    for (let t = 0; t < Math.max(1, line >> 1); t++) (put(x + t, y, 150), put(x + t, H - 1 - y, 150));
  }
  return { width: W, height: H, data };
}
