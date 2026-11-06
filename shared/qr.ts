// A QR code of a text (a link, or any words), made by the app itself, the same wherever one shows: in the app (a
// share link for a phone, the slideshow's phone remote, a slide's QR code), on the server (a picture of one for a
// PowerPoint file) and in a deck's own page. Written from the QR code standard (ISO/IEC 18004): the text in the most
// compact of its modes (digits; capitals, digits and a few signs; else its bytes in UTF-8), at the error correction
// level asked (L, M, Q or H: a code still reads with about 7, 15, 25 or 30 parts in a hundred of it smudged), raised
// when the text leaves room, in the smallest version (size) it fits; the data and its Reed–Solomon check words split
// into blocks and interleaved, laid in the zigzag around the finder, timing and alignment patterns, then the mask that
// reads best (as the standard scores them) and the format and version bits. qrCode uses nothing outside itself, so a
// page can carry its source.

/** How much of a code may be smudged and still read: L about 7 in 100 parts, M 15, Q 25, H 30 (enough for a small logo over its middle). */
export type QrLevel = 'L' | 'M' | 'Q' | 'H';

/** How the text is written into the code: digits only; capitals, digits and ` $%*+-./:`; or bytes (UTF-8, anything). */
export type QrMode = 'numeric' | 'alphanumeric' | 'byte';

export interface QrCode {
  /** Modules on a side: 21 for version 1, four more each version, 177 for version 40. */
  size: number;
  /** Row by row, from the top: true is dark. */
  modules: boolean[][];
  version: number;
  mask: number;
  /** The level it was made at (higher than asked when the text left room in the same size). */
  level: QrLevel;
  mode: QrMode;
}

export interface QrOptions {
  /** The error correction level (M when left out). */
  level?: QrLevel;
  /** Raise the level while the text still fits in the same size (on unless false). */
  boost?: boolean;
  /** The smallest version to use, 1–40 (a bigger code than the text needs). */
  minVersion?: number;
  /** A mask, 0–7, as tests compare codes (else the one that reads best). */
  mask?: number;
}

/** The QR code of a text. Throws when the text is too long for any version at the level asked. */
export function qrCode(text: string, o: QrOptions = {}): QrCode {
  // Check words per block, and blocks, by level and version (index 0 unused): the standard's table 9.
  const ECC: Record<QrLevel, number[]> = {
    L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  };
  const BLOCKS: Record<QrLevel, number[]> = {
    L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
  };
  /** Each level's two bits in the format information. */
  const LEVEL_BITS: Record<QrLevel, number> = { L: 1, M: 0, Q: 3, H: 2 };
  const LEVELS: QrLevel[] = ['L', 'M', 'Q', 'H'];
  const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
  const bit = (x: number, i: number) => ((x >>> i) & 1) !== 0;
  const put = (into: number[], v: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) into.push((v >>> i) & 1);
  };

  /** How many modules of a version hold data and check words (all but the patterns and the format and version bits). */
  const rawModules = (ver: number) => {
    let n = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const align = Math.floor(ver / 7) + 2;
      n -= (25 * align - 10) * align - 55;
      if (ver >= 7) n -= 36;
    }
    return n;
  };
  const dataWords = (ver: number, l: QrLevel) => Math.floor(rawModules(ver) / 8) - ECC[l][ver] * BLOCKS[l][ver];

  // ---- the text's bits, after its mode and count ----
  const level0: QrLevel = o.level && LEVELS.includes(o.level) ? o.level : 'M';
  const mode: QrMode = text && /^[0-9]*$/.test(text) ? 'numeric' : text && [...text].every((c) => ALNUM.includes(c)) ? 'alphanumeric' : 'byte';
  const body: number[] = [];
  let count = text.length;
  if (mode === 'numeric') {
    for (let i = 0; i < text.length; i += 3) {
      const g = text.slice(i, i + 3);
      put(body, Number(g), g.length * 3 + 1);
    }
  } else if (mode === 'alphanumeric') {
    for (let i = 0; i < text.length; i += 2) {
      const a = ALNUM.indexOf(text[i]);
      if (i + 1 < text.length) put(body, a * 45 + ALNUM.indexOf(text[i + 1]), 11);
      else put(body, a, 6);
    }
  } else {
    const bytes = new TextEncoder().encode(text);
    for (const b of bytes) put(body, b, 8);
    count = bytes.length;
  }
  const countBits = (ver: number) => {
    const k = ver < 10 ? 0 : ver < 27 ? 1 : 2;
    return (mode === 'numeric' ? [10, 12, 14] : mode === 'alphanumeric' ? [9, 11, 13] : [8, 16, 16])[k];
  };
  const fits = (ver: number, l: QrLevel) => 4 + countBits(ver) + body.length <= dataWords(ver, l) * 8;

  let ver = Math.max(1, Math.min(40, Math.floor(o.minVersion ?? 1) || 1));
  while (ver <= 40 && !fits(ver, level0)) ver++;
  if (ver > 40) throw new Error('Too long for a QR code');
  let level = level0;
  if (o.boost !== false) for (const l of LEVELS.slice(LEVELS.indexOf(level0) + 1)) if (fits(ver, l)) level = l;

  const capacity = dataWords(ver, level) * 8;
  const bits: number[] = [];
  put(bits, mode === 'numeric' ? 1 : mode === 'alphanumeric' ? 2 : 4, 4);
  put(bits, count, countBits(ver));
  for (const b of body) bits.push(b);
  put(bits, 0, Math.min(4, capacity - bits.length));
  put(bits, 0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) put(bits, pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let w = 0;
    for (let k = 0; k < 8; k++) w = (w << 1) | bits[i + k];
    data.push(w);
  }

  // ---- Reed–Solomon over GF(256), x^8 + x^4 + x^3 + x^2 + 1 ----
  const mul = (x: number, y: number) => {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  };
  const divisor = (degree: number) => {
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
  };
  const remainder = (words: number[], div: number[]) => {
    const out = div.map(() => 0);
    for (const b of words) {
      const f = b ^ out.shift()!;
      out.push(0);
      div.forEach((c, i) => (out[i] ^= mul(c, f)));
    }
    return out;
  };

  // In blocks, each with its check words (the short blocks first), then interleaved.
  const blocks = BLOCKS[level][ver];
  const eccLen = ECC[level][ver];
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

  // ---- the patterns ----
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
    const d = (LEVEL_BITS[level] << 3) | m;
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

  // ---- the words, two columns at a time, up and down from the right ----
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

  // ---- the mask ----
  const flips = (m: number, x: number, y: number) => {
    switch (m) {
      case 0:
        return (x + y) % 2 === 0;
      case 1:
        return y % 2 === 0;
      case 2:
        return x % 3 === 0;
      case 3:
        return (x + y) % 3 === 0;
      case 4:
        return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
      case 5:
        return ((x * y) % 2) + ((x * y) % 3) === 0;
      case 6:
        return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
      default:
        return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    }
  };
  const masked = (m: number) => grid.map((row, y) => row.map((dark, x) => (fixed[y][x] ? dark : dark !== flips(m, x, y))));
  /** How badly a masked code reads, as the standard scores it: long runs, blocks, finder look-alikes (the light around the code counting as light) and too much of one colour. */
  const penalty = (g: boolean[][]) => {
    const n = g.length;
    let score = 0;
    const LOOK = [true, false, true, true, true, false, true];
    const lines: boolean[][] = [...g, ...g[0].map((_, x) => g.map((row) => row[x]))];
    for (const line of lines) {
      let run = 1;
      for (let k = 1; k <= n; k++) {
        if (k < n && line[k] === line[k - 1]) run++;
        else {
          if (run >= 5) score += 3 + (run - 5);
          run = 1;
        }
      }
      const light = (k: number) => k < 0 || k >= n || !line[k];
      for (let k = 0; k + 7 <= n; k++) {
        if (!LOOK.every((on, q) => line[k + q] === on)) continue;
        if ([1, 2, 3, 4].every((q) => light(k - q)) || [7, 8, 9, 10].every((q) => light(k + q))) score += 40;
      }
    }
    let dark = 0;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        if (g[y][x]) dark++;
        if (y + 1 < n && x + 1 < n && g[y][x] === g[y][x + 1] && g[y][x] === g[y + 1][x] && g[y][x] === g[y + 1][x + 1]) score += 3;
      }
    const total = n * n;
    return score + Math.max(0, Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  };
  let best = typeof o.mask === 'number' && o.mask >= 0 && o.mask <= 7 ? Math.floor(o.mask) : -1;
  if (best < 0) {
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
  return { size, modules: masked(best), version: ver, mask: best, level, mode };
}

/** The dark modules as one SVG path, a unit each (runs along a row joined), in a square `size` wide: draw it with a light quiet zone of 4 around. */
export function qrPath(code: QrCode): string {
  let out = '';
  code.modules.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue;
      let w = 1;
      while (x + w < row.length && row[x + w]) w++;
      out += `M${x} ${y}h${w}v1h-${w}z`;
      x += w - 1;
    }
  });
  return out;
}

/**
 * A whole SVG picture of a code: its dark modules in `dark` on `light` ('transparent' for none), with a quiet zone of
 * `quiet` modules around (4 unless asked; readers need some). Colours other than #hex, rgb()/hsl() or a plain name are
 * left at black on white, so the picture holds nothing but the code.
 */
export function qrSvg(code: QrCode, o: { dark?: string; light?: string; quiet?: number; width?: number } = {}): string {
  const colour = (c: string | undefined, def: string) => (typeof c === 'string' && /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([\d.%\s,/+-]{3,60}\)|[a-z]{3,20})$/i.test(c) ? c : def);
  const q = Math.max(0, Math.min(10, Math.round(Number(o.quiet ?? 4)) || 0));
  const s = code.size + q * 2;
  const light = colour(o.light, '#ffffff');
  const w = typeof o.width === 'number' && o.width > 0 ? ` width="${Math.round(o.width)}" height="${Math.round(o.width)}"` : '';
  const bg = light.toLowerCase() === 'transparent' ? '' : `<rect x="${-q}" y="${-q}" width="${s}" height="${s}" fill="${light}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-q} ${-q} ${s} ${s}"${w} shape-rendering="crispEdges">${bg}<path d="${qrPath(code)}" fill="${colour(o.dark, '#000000')}"/></svg>`;
}
