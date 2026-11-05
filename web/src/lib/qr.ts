// A QR code of a short text (a link), drawn by the app itself: byte mode, error correction level M (a code still reads
// with about a seventh of it smudged), the smallest version the text fits, and the mask that reads best. Written from
// the QR code standard (ISO/IEC 18004): the data and its Reed–Solomon check words split into blocks and interleaved,
// laid in the zigzag around the finder, timing and alignment patterns, then the format (and version) bits.

/** Check words per block, and blocks, at level M, by version (index 0 unused). */
const ECC_M = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
const BLOCKS_M = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];
/** Level M's two format bits. */
const FORMAT_M = 0;

const bit = (x: number, i: number) => ((x >>> i) & 1) !== 0;

/** How many modules of a version hold data and check words (all but the patterns and the format and version bits). */
function rawModules(ver: number): number {
  let n = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const align = Math.floor(ver / 7) + 2;
    n -= (25 * align - 10) * align - 55;
    if (ver >= 7) n -= 36;
  }
  return n;
}

const dataWords = (ver: number) => Math.floor(rawModules(ver) / 8) - ECC_M[ver] * BLOCKS_M[ver];

// ---- Reed–Solomon over GF(256), x^8 + x^4 + x^3 + x^2 + 1 ------------------------------------------------------

function mul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function divisor(degree: number): number[] {
  const out = new Array<number>(degree).fill(0);
  out[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < out.length; j++) {
      out[j] = mul(out[j], root);
      if (j + 1 < out.length) out[j] ^= out[j + 1];
    }
    root = mul(root, 0x02);
  }
  return out;
}

function remainder(data: number[], div: number[]): number[] {
  const out = div.map(() => 0);
  for (const b of data) {
    const f = b ^ out.shift()!;
    out.push(0);
    div.forEach((c, i) => (out[i] ^= mul(c, f)));
  }
  return out;
}

// ---- the code ---------------------------------------------------------------------------------------------------------

export interface QrCode {
  size: number;
  /** Row by row: true is dark. */
  modules: boolean[][];
  version: number;
  mask: number;
}

/** The QR code of a text (UTF-8, byte mode, level M); `mask` forces one (0–7), as tests compare. Throws when the text is too long for any version. */
export function qrCode(text: string, mask?: number): QrCode {
  const bytes = [...new TextEncoder().encode(text)];
  let ver = 1;
  for (; ver <= 40; ver++) if (4 + (ver < 10 ? 8 : 16) + bytes.length * 8 <= dataWords(ver) * 8) break;
  if (ver > 40) throw new Error('Too long for a QR code');
  const capacity = dataWords(ver) * 8;

  // The bits: byte mode, the count, the bytes, the end, padding.
  const bits: number[] = [];
  const put = (v: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, ver < 10 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  put(0, Math.min(4, capacity - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));

  // In blocks, each with its check words, then interleaved.
  const blocks = BLOCKS_M[ver];
  const eccLen = ECC_M[ver];
  const raw = Math.floor(rawModules(ver) / 8);
  const short = blocks - (raw % blocks);
  const shortLen = Math.floor(raw / blocks);
  const div = divisor(eccLen);
  const parts: number[][] = [];
  for (let i = 0, k = 0; i < blocks; i++) {
    const d = data.slice(k, k + shortLen - eccLen + (i < short ? 0 : 1));
    k += d.length;
    const ecc = remainder(d, div);
    if (i < short) d.push(0);
    parts.push([...d, ...ecc]);
  }
  const words: number[] = [];
  for (let i = 0; i < parts[0].length; i++) parts.forEach((p, j) => (i !== shortLen - eccLen || j >= short) && words.push(p[i]));

  // The patterns.
  const size = ver * 4 + 17;
  const grid = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fixed = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => {
    grid[y][x] = dark;
    fixed[y][x] = true;
  };
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
      }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);
  if (ver > 1) {
    const n = Math.floor(ver / 7) + 2;
    const step = Math.floor((ver * 8 + n * 3 + 5) / (n * 4 - 4)) * 2;
    const at = [6];
    for (let p = size - 7; at.length < n; p -= step) at.splice(1, 0, p);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(at[i] + dx, at[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
  }
  const format = (m: number) => {
    const d = (FORMAT_M << 3) | m;
    let r = d;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const b = ((d << 10) | r) ^ 0x5412;
    for (let i = 0; i <= 5; i++) set(8, i, bit(b, i));
    set(8, 7, bit(b, 6));
    set(8, 8, bit(b, 7));
    set(7, 8, bit(b, 8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(b, i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(b, i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(b, i));
    set(8, size - 8, true);
  };
  format(0);
  if (ver >= 7) {
    let r = ver;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const b = (ver << 12) | r;
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3);
      const c = Math.floor(i / 3);
      set(a, c, bit(b, i));
      set(c, a, bit(b, i));
    }
  }

  // The words, two columns at a time, up and down from the right.
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < size; v++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? size - 1 - v : v;
        if (!fixed[y][x] && i < words.length * 8) {
          grid[y][x] = bit(words[i >>> 3], 7 - (i & 7));
          i++;
        }
      }
  }

  const masked = (m: number) => {
    const g = grid.map((row) => [...row]);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        if (fixed[y][x]) continue;
        const flip = [(x + y) % 2 === 0, y % 2 === 0, x % 3 === 0, (x + y) % 3 === 0, (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, ((x * y) % 2) + ((x * y) % 3) === 0, (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (((x + y) % 2) + ((x * y) % 3)) % 2 === 0][m];
        if (flip) g[y][x] = !g[y][x];
      }
    return g;
  };
  let best = mask ?? 0;
  if (mask === undefined) {
    let low = Infinity;
    for (let m = 0; m < 8; m++) {
      format(m);
      const p = penalty(masked(m));
      if (p < low) {
        low = p;
        best = m;
      }
    }
  }
  format(best);
  return { size, modules: masked(best), version: ver, mask: best };
}

/** How badly a masked code reads, as the standard scores it: long runs, blocks, finder look-alikes and too much of one colour. */
function penalty(g: boolean[][]): number {
  const n = g.length;
  let score = 0;
  const lines: boolean[][] = [...g, ...g[0].map((_, x) => g.map((row) => row[x]))];
  const LOOK = [true, false, true, true, true, false, true];
  for (const line of lines) {
    let run = 1;
    for (let i = 1; i <= n; i++) {
      if (i < n && line[i] === line[i - 1]) run++;
      else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
    for (let i = 0; i + 7 <= n; i++) {
      if (!LOOK.every((v, k) => line[i + k] === v)) continue;
      const before = i >= 4 && [1, 2, 3, 4].every((k) => !line[i - k]);
      const after = i + 11 <= n && [7, 8, 9, 10].every((k) => !line[i + k]);
      if (before || after) score += 40;
    }
  }
  let dark = 0;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (g[y][x]) dark++;
      if (y + 1 < n && x + 1 < n && g[y][x] === g[y][x + 1] && g[y][x] === g[y + 1][x] && g[y][x] === g[y + 1][x + 1]) score += 3;
    }
  const total = n * n;
  score += Math.max(0, Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
}

/** The dark modules as one SVG path, one unit each, in a square `size` wide (draw it with a light quiet zone of 4 around). */
export function qrPath(code: QrCode): string {
  const out: string[] = [];
  code.modules.forEach((row, y) => row.forEach((dark, x) => dark && out.push(`M${x} ${y}h1v1h-1z`)));
  return out.join('');
}
