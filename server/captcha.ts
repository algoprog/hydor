// The picture the sign-in page asks people to read after a few wrong passwords (server/auth.ts): five characters
// drawn stroke by stroke, each tilted, slanted, sized and placed a little differently along a wavy line, with two
// thin threads and some specks across them, made into a PNG right here: no fonts, no libraries, no outside service,
// and no text in the page for a script to read. The ink is in the alpha channel only, so the page colours it to its
// theme. Look-alikes are left out (0 O Q D, 1 I L, 5 S, 8 B, Z, G, U), and a few typed for the ones kept still count.
import crypto from 'node:crypto';
import zlib from 'node:zlib';

type Pt = [number, number];

/** Points along an ellipse from one angle to another, in degrees (0 is to the right, 90 down, as y grows down). */
function arc(cx: number, cy: number, rx: number, ry: number, from: number, to: number): Pt[] {
  const n = Math.max(2, Math.ceil(Math.abs(to - from) / 12));
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = ((from + ((to - from) * i) / n) * Math.PI) / 180;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as Pt;
  });
}

/** Each character as strokes in a box 10 wide and 14 high. */
const P: Pt[] = [[0.6, 13.8], [0.6, 0.4], [5.6, 0.4], ...arc(5.6, 4.1, 3.8, 3.7, 270, 450), [0.6, 7.8]];
const GLYPHS: Record<string, Pt[][]> = {
  '2': [[...arc(5, 4.4, 4.4, 4.2, 200, 380), [0.6, 13.6], [9.6, 13.6]]],
  '3': [arc(5, 3.6, 4.1, 3.4, 205, 450), arc(5, 10.2, 4.5, 3.6, 275, 520)],
  '4': [[[7.2, 13.8], [7.2, 0.2], [0.4, 9.8], [9.8, 9.8]]],
  '6': [arc(5, 9.4, 4.4, 4.3, 0, 360), arc(9.6, 9.4, 9, 9, 180, 262)],
  '7': [[[0.4, 0.4], [9.6, 0.4], [3.6, 13.8]]],
  '9': [arc(5, 4.6, 4.4, 4.3, 0, 360), arc(0.4, 4.6, 9, 9, 0, 82)],
  A: [[[0.4, 13.8], [5, 0.2], [9.6, 13.8]], [[2.2, 9], [7.8, 9]]],
  C: [arc(5.4, 7, 5, 6.8, 320, 40)],
  E: [[[9.4, 0.4], [0.6, 0.4], [0.6, 13.6], [9.4, 13.6]], [[0.6, 7], [7.6, 7]]],
  F: [[[9.4, 0.4], [0.6, 0.4], [0.6, 13.8]], [[0.6, 7], [7.6, 7]]],
  H: [[[0.6, 0.2], [0.6, 13.8]], [[9.4, 0.2], [9.4, 13.8]], [[0.6, 7], [9.4, 7]]],
  J: [[[9, 0.2], ...arc(5, 9.6, 4, 4, 0, 165)]],
  K: [[[0.6, 0.2], [0.6, 13.8]], [[9.4, 0.2], [0.6, 8.2]], [[3.6, 5.6], [9.6, 13.8]]],
  M: [[[0.4, 13.8], [0.8, 0.2], [5, 9], [9.2, 0.2], [9.6, 13.8]]],
  N: [[[0.6, 13.8], [0.6, 0.2], [9.4, 13.8], [9.4, 0.2]]],
  P: [P],
  R: [P, [[5, 7.8], [9.6, 13.8]]],
  T: [[[0.2, 0.4], [9.8, 0.4]], [[5, 0.4], [5, 13.8]]],
  V: [[[0.4, 0.2], [5, 13.8], [9.6, 0.2]]],
  W: [[[0, 0.2], [2.5, 13.8], [5, 4], [7.5, 13.8], [10, 0.2]]],
  X: [[[0.6, 0.2], [9.4, 13.8]], [[9.4, 0.2], [0.6, 13.8]]],
  Y: [[[0.4, 0.2], [5, 7.2], [9.6, 0.2]], [[5, 7.2], [5, 13.8]]],
};
export const CAPTCHA_CHARS = Object.keys(GLYPHS).join('');

/** Characters people may type for one that is in the picture. */
const READS_AS: Record<string, string> = { G: '6', Z: '2', U: 'V' };

/** What someone typed, as the characters it stands for. */
export function captchaText(typed: unknown): string {
  return String(typed ?? '')
    .toUpperCase()
    .replace(/[\s-]+/g, '')
    .replace(/[GZU]/g, (c) => READS_AS[c]);
}

/** Whether what was typed reads as the picture's characters. */
export function sameCaptcha(typed: unknown, text: string): boolean {
  const a = Buffer.from(captchaText(typed));
  const b = Buffer.from(text);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** The picture's size in pixels, twice what the page shows. */
export const CAPTCHA_SIZE = { width: 440, height: 136 };

const r = (a: number, b: number) => a + Math.random() * (b - a);

/** A new picture: its characters, and the PNG. */
export function drawCaptcha(text?: string): { text: string; png: Buffer } {
  const chars = text ?? Array.from({ length: 5 }, () => CAPTCHA_CHARS[crypto.randomInt(CAPTCHA_CHARS.length)]).join('');
  const { width: W, height: H } = CAPTCHA_SIZE;
  const ink = new Float32Array(W * H);

  // A thick line with round ends: each pixel takes how much of it the line covers, smoothed over one pixel.
  const line = (ax: number, ay: number, bx: number, by: number, half: number) => {
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - half - 1));
    const x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + half + 1));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - half - 1));
    const y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + half + 1));
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5 - ax;
        const py = y + 0.5 - ay;
        const t = Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
        const ex = px - t * dx;
        const ey = py - t * dy;
        const c = half + 0.5 - Math.sqrt(ex * ex + ey * ey);
        if (c > 0) ink[y * W + x] = Math.max(ink[y * W + x], Math.min(1, c));
      }
    }
  };

  // The whole picture bends along two waves, one across and one down.
  const wa = r(4, 8), wl = r(170, 260), wp = r(0, 2 * Math.PI);
  const va = r(2, 4), vl = r(50, 90), vp = r(0, 2 * Math.PI);
  const bend = (x: number, y: number): Pt => [x + va * Math.sin((2 * Math.PI * y) / vl + vp), y + wa * Math.sin((2 * Math.PI * x) / wl + wp)];
  // A stroke drawn as short pieces, so the bend curves it too.
  const stroke = (pts: Pt[], half: number) => {
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1];
      const [bx, by] = pts[i];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 3));
      let prev = bend(ax, ay);
      for (let k = 1; k <= n; k++) {
        const next = bend(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n);
        line(prev[0], prev[1], next[0], next[1], half);
        prev = next;
      }
    }
  };

  const half = r(3, 3.8);
  const step = r(64, 70);
  const left = (W - step * chars.length) / 2 + r(-14, 14);
  const mid = H / 2 + r(-6, 6);
  [...chars].forEach((ch, i) => {
    const s = (68 / 14) * r(0.9, 1.1);
    const sx = r(0.8, 1.02);
    const turn = r(-0.26, 0.26);
    const slant = r(-0.18, 0.18);
    const cx = left + step * (i + 0.5) + r(-3, 3);
    const cy = mid + r(-7, 7);
    const place = ([gx, gy]: Pt): Pt => {
      const v = (gy - 7) * s;
      const u = (gx - 5) * s * sx + slant * v;
      return [cx + u * Math.cos(turn) - v * Math.sin(turn), cy + u * Math.sin(turn) + v * Math.cos(turn)];
    };
    for (const g of GLYPHS[ch] ?? []) stroke(g.map(place), half);
  });

  // Two thin threads across the characters, and specks.
  for (let k = 0; k < 2; k++) {
    const y0 = r(H * 0.3, H * 0.7), a1 = r(8, 20), l1 = r(180, 400), p1 = r(0, 2 * Math.PI), a2 = r(2, 6), l2 = r(40, 80), p2 = r(0, 2 * Math.PI);
    const pts: Pt[] = [];
    for (let x = r(4, 30); x < W - r(4, 30); x += 4) pts.push([x, y0 + a1 * Math.sin((2 * Math.PI * x) / l1 + p1) + a2 * Math.sin((2 * Math.PI * x) / l2 + p2)]);
    stroke(pts, r(0.9, 1.3));
  }
  for (let k = 0; k < 60; k++) {
    const x = r(0, W), y = r(0, H);
    line(x, y, x, y, r(0.8, 1.6));
  }

  return { text: chars, png: png(W, H, ink) };
}

/** A PNG of grey and alpha, 8 bits each: the grey is black, the alpha is the ink. */
function png(W: number, H: number, ink: Float32Array): Buffer {
  const raw = Buffer.alloc(H * (1 + W * 2));
  for (let y = 0; y < H; y++) {
    const row = y * (1 + W * 2);
    for (let x = 0; x < W; x++) raw[row + 2 + x * 2] = Math.round(ink[y * W + x] * 255);
  }
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'latin1');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bits per channel
  ihdr[9] = 4; // grey and alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
