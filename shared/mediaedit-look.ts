// The picture editor's further adjustments, pixel by pixel, as the browser and the server both run them (applyLook in
// mediaedit.ts calls them): Curves (RGB and each channel, through points), Levels (input black, grey and white, then
// output black and white, for RGB and each channel), hue, saturation and lightness by colour range (reds, oranges,
// yellows, greens, aquas, blues, purples, magentas, and all of them), colour balance (shadows, midtones, highlights),
// invert, posterize and threshold; and those that look at a pixel's neighbours: noise reduction, dehaze, clarity and
// grain. Sizes (a blur's reach, grain's size) go by the whole picture's long side, so a small copy, or a part of the
// picture worked on alone (`LookFrame`), looks as the whole picture will.

/** A curve: its points (x in, y out, each 0 to 255), left to right; the line from (0, 0) to (255, 255) changes nothing. */
export type CurvePoints = [number, number][];
export type Channel = 'rgb' | 'r' | 'g' | 'b';
export type Curves = Partial<Record<Channel, CurvePoints>>;

/** Levels of one channel: input black and white (0 to 255), grey (the middle's gamma, 0.1 to 9.99), output black and white. */
export interface LevelsOne {
  black?: number;
  white?: number;
  gamma?: number;
  outBlack?: number;
  outWhite?: number;
}
export type Levels = Partial<Record<Channel, LevelsOne>>;

/** The colour ranges hue, saturation and lightness change by (their hue's middle, in degrees). */
export const HSL_RANGES = [
  { id: 'reds', label: 'Reds', hue: 0 },
  { id: 'oranges', label: 'Oranges', hue: 30 },
  { id: 'yellows', label: 'Yellows', hue: 60 },
  { id: 'greens', label: 'Greens', hue: 120 },
  { id: 'aquas', label: 'Aquas', hue: 180 },
  { id: 'blues', label: 'Blues', hue: 225 },
  { id: 'purples', label: 'Purples', hue: 270 },
  { id: 'magentas', label: 'Magentas', hue: 315 },
] as const;
export type HslRange = (typeof HSL_RANGES)[number]['id'];
/** Hue, saturation and lightness moved, each −100 to 100. */
export interface HslShift {
  h?: number;
  s?: number;
  l?: number;
}
export type Hsl = Partial<Record<HslRange | 'all', HslShift>>;

export type Tone = 'shadows' | 'midtones' | 'highlights';
export const TONES: { id: Tone; label: string }[] = [
  { id: 'shadows', label: 'Shadows' },
  { id: 'midtones', label: 'Midtones' },
  { id: 'highlights', label: 'Highlights' },
];
/** Colour balance: for each tone, cyan to red, magenta to green and yellow to blue, each −100 to 100; `keepLight`: each pixel as light as it was. */
export type Balance = Partial<Record<Tone, [number, number, number]>> & { keepLight?: boolean };

/** What a look adds to the adjustments and the filter (mediaedit.ts): all of it plain data. */
export interface LookMore {
  curves?: Curves;
  levels?: Levels;
  hsl?: Hsl;
  balance?: Balance;
  invert?: boolean;
  /** Levels a channel keeps, 2 to 32. */
  posterize?: number;
  /** Black below it, white from it: 1 to 255. */
  threshold?: number;
}

/** A buffer that is part of a larger picture: the whole one's size (in the buffer's pixels) and where the buffer's top left is in it. */
export interface LookFrame {
  W: number;
  H: number;
  x: number;
  y: number;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const smooth = (a: number, b: number, x: number) => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

// ---- checking -----------------------------------------------------------------------------------------------------

const CHANNELS: Channel[] = ['rgb', 'r', 'g', 'b'];

/** A curve's points made safe: within 0 to 255, left to right, one per x, 2 to 16 of them; null when it is the straight line. */
export function curveOf(v: unknown): CurvePoints | null {
  if (!Array.isArray(v)) return null;
  const pts: CurvePoints = [];
  for (const p of v.slice(0, 32)) {
    const x = num(Array.isArray(p) ? p[0] : (p as { x?: unknown })?.x);
    const y = num(Array.isArray(p) ? p[1] : (p as { y?: unknown })?.y);
    if (x === null || y === null) continue;
    pts.push([Math.round(clamp(x, 0, 255)), Math.round(clamp(y, 0, 255))]);
  }
  pts.sort((a, b) => a[0] - b[0]);
  const out: CurvePoints = [];
  for (const p of pts) if (!out.length || out[out.length - 1][0] !== p[0]) out.push(p);
  if (out.length < 2) return null;
  const kept = out.slice(0, 16);
  return kept.every(([x, y]) => x === y) && kept[0][0] === 0 && kept[kept.length - 1][0] === 255 ? null : kept;
}

function levelsOneOf(v: unknown): LevelsOne | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const black = Math.round(clamp(num(o.black) ?? 0, 0, 253));
  const white = Math.round(clamp(num(o.white) ?? 255, black + 2, 255));
  const gamma = Math.round(clamp(num(o.gamma) ?? 1, 0.1, 9.99) * 100) / 100;
  const outBlack = Math.round(clamp(num(o.outBlack) ?? 0, 0, 255));
  const outWhite = Math.round(clamp(num(o.outWhite) ?? 255, 0, 255));
  const l: LevelsOne = {};
  if (black) l.black = black;
  if (white !== 255) l.white = white;
  if (gamma !== 1) l.gamma = gamma;
  if (outBlack) l.outBlack = outBlack;
  if (outWhite !== 255) l.outWhite = outWhite;
  return Object.keys(l).length ? l : null;
}

const shiftOf = (v: unknown): HslShift | null => {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const s: HslShift = {};
  for (const k of ['h', 's', 'l'] as const) {
    const n = Math.round(clamp(num(o[k]) ?? 0, -100, 100));
    if (n) s[k] = n;
  }
  return Object.keys(s).length ? s : null;
};

/** What a look adds, made safe and plain: numbers within their limits, what changes nothing left out. */
export function normalizeMore(raw: unknown): LookMore {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const out: LookMore = {};
  if (r.curves && typeof r.curves === 'object') {
    const c: Curves = {};
    for (const ch of CHANNELS) {
      const p = curveOf(r.curves[ch]);
      if (p) c[ch] = p;
    }
    if (Object.keys(c).length) out.curves = c;
  }
  if (r.levels && typeof r.levels === 'object') {
    const l: Levels = {};
    for (const ch of CHANNELS) {
      const v = levelsOneOf(r.levels[ch]);
      if (v) l[ch] = v;
    }
    if (Object.keys(l).length) out.levels = l;
  }
  if (r.hsl && typeof r.hsl === 'object') {
    const h: Hsl = {};
    for (const k of ['all', ...HSL_RANGES.map((x) => x.id)] as (HslRange | 'all')[]) {
      const v = shiftOf(r.hsl[k]);
      if (v) h[k] = v;
    }
    if (Object.keys(h).length) out.hsl = h;
  }
  if (r.balance && typeof r.balance === 'object') {
    const b: Balance = {};
    for (const t of TONES) {
      const v = r.balance[t.id];
      if (!Array.isArray(v)) continue;
      const three = [0, 1, 2].map((i) => Math.round(clamp(num(v[i]) ?? 0, -100, 100))) as [number, number, number];
      if (three.some((x) => x)) b[t.id] = three;
    }
    if (Object.keys(b).length) {
      if (r.balance.keepLight !== false) b.keepLight = true;
      out.balance = b;
    }
  }
  if (r.invert === true) out.invert = true;
  const p = num(r.posterize);
  if (p !== null && p >= 2) out.posterize = Math.round(clamp(p, 2, 32));
  const t = num(r.threshold);
  if (t !== null && t >= 1) out.threshold = Math.round(clamp(t, 1, 255));
  return out;
}

export const hasMore = (m: LookMore | null | undefined) => !!m && !!(m.curves || m.levels || m.hsl || m.balance || m.invert || m.posterize || m.threshold);

// ---- tables -------------------------------------------------------------------------------------------------------

/**
 * A curve as a table of 256 values: a smooth line through its points that never turns back on itself (monotone
 * cubic, as Fritsch and Carlson make it), flat before its first point and after its last.
 */
export function curveTable(points: CurvePoints): Uint8Array {
  const out = new Uint8Array(256);
  const p = points.length >= 2 ? points : [[0, 0] as [number, number], [255, 255] as [number, number]];
  const n = p.length;
  const xs = p.map((q) => q[0]);
  const ys = p.map((q) => q[1]);
  // The slopes between points, then at each point (zero where the line turns, limited so it does not overshoot).
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / Math.max(1e-6, xs[i + 1] - xs[i]));
  const m: number[] = new Array(n).fill(0);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  let seg = 0;
  for (let x = 0; x < 256; x++) {
    let y: number;
    if (x <= xs[0]) y = ys[0];
    else if (x >= xs[n - 1]) y = ys[n - 1];
    else {
      while (seg < n - 2 && x > xs[seg + 1]) seg++;
      const h = xs[seg + 1] - xs[seg];
      const t = (x - xs[seg]) / h;
      const t2 = t * t;
      const t3 = t2 * t;
      y = (2 * t3 - 3 * t2 + 1) * ys[seg] + (t3 - 2 * t2 + t) * h * m[seg] + (-2 * t3 + 3 * t2) * ys[seg + 1] + (t3 - t2) * h * m[seg + 1];
    }
    out[x] = Math.round(clamp(y, 0, 255));
  }
  return out;
}

/** Levels as a table of 256 values. */
export function levelsTable(l: LevelsOne): Uint8Array {
  const out = new Uint8Array(256);
  const black = l.black ?? 0;
  const white = Math.max(black + 1, l.white ?? 255);
  const g = 1 / clamp(l.gamma ?? 1, 0.1, 9.99);
  const ob = l.outBlack ?? 0;
  const ow = l.outWhite ?? 255;
  for (let v = 0; v < 256; v++) {
    const t = clamp((v - black) / (white - black), 0, 1);
    out[v] = Math.round(clamp(ob + Math.pow(t, g) * (ow - ob), 0, 255));
  }
  return out;
}

/** Levels then curves, each channel's own then RGB's, as one table a channel. */
export function channelTables(m: LookMore): [Uint8Array, Uint8Array, Uint8Array] | null {
  if (!m.curves && !m.levels) return null;
  const chain: Uint8Array[][] = [[], [], []];
  const add = (ch: Channel, t: Uint8Array) => {
    if (ch === 'rgb') for (const c of chain) c.push(t);
    else chain[ch === 'r' ? 0 : ch === 'g' ? 1 : 2].push(t);
  };
  for (const ch of ['r', 'g', 'b', 'rgb'] as Channel[]) if (m.levels?.[ch]) add(ch, levelsTable(m.levels[ch]!));
  for (const ch of ['r', 'g', 'b', 'rgb'] as Channel[]) if (m.curves?.[ch]) add(ch, curveTable(m.curves[ch]!));
  return chain.map((ts) => {
    const out = new Uint8Array(256);
    for (let v = 0; v < 256; v++) {
      let x = v;
      for (const t of ts) x = t[x];
      out[v] = x;
    }
    return out;
  }) as [Uint8Array, Uint8Array, Uint8Array];
}

// ---- pixel by pixel ----------------------------------------------------------------------------------------------

export interface CompiledMore {
  tables: [Uint8Array, Uint8Array, Uint8Array] | null;
  /** Per range: hue (degrees), saturation and lightness (fractions); then all's. */
  hsl: { h: Float32Array; s: Float32Array; l: Float32Array; ah: number; as: number; al: number } | null;
  balance: { lo: [number, number, number]; mid: [number, number, number]; hi: [number, number, number]; keep: boolean } | null;
  invert: boolean;
  posterize: number;
  threshold: number;
}

const RANGE_HUES = HSL_RANGES.map((r) => r.hue);

export function compileMore(m: LookMore | null | undefined): CompiledMore | null {
  if (!hasMore(m)) return null;
  const more = m!;
  let hsl: CompiledMore['hsl'] = null;
  if (more.hsl) {
    const n = HSL_RANGES.length;
    const h = new Float32Array(n);
    const s = new Float32Array(n);
    const l = new Float32Array(n);
    HSL_RANGES.forEach((r, i) => {
      const v = more.hsl![r.id];
      h[i] = ((v?.h ?? 0) / 100) * 30;
      s[i] = (v?.s ?? 0) / 100;
      l[i] = (v?.l ?? 0) / 100;
    });
    const a = more.hsl.all;
    hsl = { h, s, l, ah: ((a?.h ?? 0) / 100) * 180, as: (a?.s ?? 0) / 100, al: (a?.l ?? 0) / 100 };
  }
  let balance: CompiledMore['balance'] = null;
  if (more.balance) {
    const t = (x?: [number, number, number]) => (x ? (x.map((v) => (v / 100) * 0.22) as [number, number, number]) : ([0, 0, 0] as [number, number, number]));
    balance = { lo: t(more.balance.shadows), mid: t(more.balance.midtones), hi: t(more.balance.highlights), keep: more.balance.keepLight !== false };
  }
  return { tables: channelTables(more), hsl, balance, invert: !!more.invert, posterize: more.posterize ?? 0, threshold: more.threshold ?? 0 };
}

/** Which ranges a hue (0 to 360) belongs to, and how much: the two whose middles are either side of it. */
function rangeOf(h: number): [number, number, number] {
  const n = RANGE_HUES.length;
  for (let i = 0; i < n; i++) {
    const a = RANGE_HUES[i];
    const b = i + 1 < n ? RANGE_HUES[i + 1] : 360;
    if (h >= a && h < b) return [i, (i + 1) % n, (h - a) / (b - a)];
  }
  return [0, 1, 0];
}

/**
 * One pixel (0 to 1 each, in `rgb`, changed in place) through what a look adds: levels and curves, hue, saturation and
 * lightness by range, colour balance, then invert, posterize and threshold.
 */
export function shadeMore(c: CompiledMore, rgb: Float32Array) {
  let r = rgb[0];
  let g = rgb[1];
  let b = rgb[2];
  if (c.tables) {
    r = c.tables[0][(clamp(r, 0, 1) * 255 + 0.5) | 0] / 255;
    g = c.tables[1][(clamp(g, 0, 1) * 255 + 0.5) | 0] / 255;
    b = c.tables[2][(clamp(b, 0, 1) * 255 + 0.5) | 0] / 255;
  }
  if (c.hsl) {
    const mx = r > g ? (r > b ? r : b) : g > b ? g : b;
    const mn = r < g ? (r < b ? r : b) : g < b ? g : b;
    let l = (mx + mn) / 2;
    const d = mx - mn;
    let s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1) || 1);
    let h = 0;
    if (d !== 0) {
      if (mx === r) h = 60 * (((g - b) / d) % 6);
      else if (mx === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
      if (h < 0) h += 360;
    }
    const [i, j, t] = rangeOf(h);
    const H = c.hsl;
    // A range's change counts as much as the pixel has colour: greys stay grey.
    const k = Math.min(1, s * 2.2) * Math.min(1, d * 6);
    const dh = (H.h[i] * (1 - t) + H.h[j] * t) * k + H.ah;
    const ds = (H.s[i] * (1 - t) + H.s[j] * t) * k + H.as;
    const dl = (H.l[i] * (1 - t) + H.l[j] * t) * k * 0.5 + H.al;
    h = (((h + dh) % 360) + 360) % 360;
    s = clamp(s * (1 + ds), 0, 1);
    l = dl > 0 ? l + (1 - l) * dl : l + l * dl;
    const q = (1 - Math.abs(2 * l - 1)) * s;
    const x = q * (1 - Math.abs(((h / 60) % 2) - 1));
    const m0 = l - q / 2;
    const seg = (h / 60) | 0;
    [r, g, b] = seg === 0 ? [q, x, 0] : seg === 1 ? [x, q, 0] : seg === 2 ? [0, q, x] : seg === 3 ? [0, x, q] : seg === 4 ? [x, 0, q] : [q, 0, x];
    r += m0;
    g += m0;
    b += m0;
  }
  if (c.balance) {
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const ws = 1 - smooth(0, 0.55, L);
    const wh = smooth(0.45, 1, L);
    const wm = Math.max(0, 1 - ws - wh);
    const B = c.balance;
    r += B.lo[0] * ws + B.mid[0] * wm + B.hi[0] * wh;
    g += B.lo[1] * ws + B.mid[1] * wm + B.hi[1] * wh;
    b += B.lo[2] * ws + B.mid[2] * wm + B.hi[2] * wh;
    if (B.keep) {
      const d = L - (0.2126 * r + 0.7152 * g + 0.0722 * b);
      r += d;
      g += d;
      b += d;
    }
  }
  if (c.invert) {
    r = 1 - r;
    g = 1 - g;
    b = 1 - b;
  }
  if (c.posterize) {
    const n = c.posterize - 1;
    r = Math.round(clamp(r, 0, 1) * n) / n;
    g = Math.round(clamp(g, 0, 1) * n) / n;
    b = Math.round(clamp(b, 0, 1) * n) / n;
  }
  if (c.threshold) {
    const v = 0.2126 * r + 0.7152 * g + 0.0722 * b >= c.threshold / 255 ? 1 : 0;
    r = g = b = v;
  }
  rgb[0] = r;
  rgb[1] = g;
  rgb[2] = b;
}

// ---- neighbours ---------------------------------------------------------------------------------------------------

/** A plane of numbers blurred in place: box blurs `passes` times over (three come near a Gaussian), `r` each way. */
export function blurPlane(p: Float32Array, w: number, h: number, r: number, passes = 3) {
  const rr = Math.max(1, Math.round(r));
  if (w < 2 || h < 2) return;
  const tmp = new Float32Array(p.length);
  const line = (src: Float32Array, dst: Float32Array, step: number, next: number, count: number, lines: number) => {
    const q = Math.min(rr, count - 1);
    const div = 2 * q + 1;
    const last = count - 1;
    for (let l = 0; l < lines; l++) {
      const o = l * next;
      let sum = 0;
      for (let i = -q; i <= q; i++) sum += src[o + (i < 0 ? 0 : i > last ? last : i) * step];
      for (let i = 0; i < count; i++) {
        dst[o + i * step] = sum / div;
        const add = i + q + 1;
        const sub = i - q;
        sum += src[o + (add > last ? last : add) * step] - src[o + (sub < 0 ? 0 : sub) * step];
      }
    }
  };
  for (let k = 0; k < passes; k++) {
    line(p, tmp, 1, w, w, h);
    line(tmp, p, w, 1, h, w);
  }
}

const lumaPlane = (px: Uint8ClampedArray, n: number) => {
  const L = new Float32Array(n);
  for (let i = 0, j = 0; j < n; i += 4, j++) L[j] = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
  return L;
};

/**
 * Noise taken out (0 to 100): each pixel moved toward its neighbourhood's average as much as it is near it, so speckle
 * goes and edges stay.
 */
export function reduceNoise(px: Uint8ClampedArray, w: number, h: number, amount: number, long: number) {
  const a = clamp(amount, 0, 100) / 100;
  if (!a) return;
  const n = w * h;
  const r = Math.max(1, Math.round((long / 1400) * (1 + a * 1.5)));
  const sigma = 10 + a * 26;
  const k2 = 1 / (2 * sigma * sigma);
  for (let ch = 0; ch < 3; ch++) {
    const p = new Float32Array(n);
    for (let i = 0; i < n; i++) p[i] = px[i * 4 + ch];
    const soft = new Float32Array(p);
    blurPlane(soft, w, h, r, 2);
    for (let i = 0; i < n; i++) {
      const d = soft[i] - p[i];
      const wgt = a * Math.exp(-d * d * k2);
      px[i * 4 + ch] = p[i] + d * wgt;
    }
  }
}

/**
 * Haze taken away (amount > 0) or added (< 0): the haze over each part is guessed from how bright its darkest colour is
 * around it (the dark channel), and taken off toward the colour of the haze, the picture's brightest.
 */
export function dehaze(px: Uint8ClampedArray, w: number, h: number, amount: number, long: number) {
  const a = clamp(amount, -100, 100) / 100;
  if (!a) return;
  const n = w * h;
  if (a < 0) {
    // Haze added: toward a pale grey, most where the picture is far (its top, a little), evenly enough.
    const k = -a * 0.55;
    for (let i = 0; i < n * 4; i += 4) {
      px[i] = px[i] + (214 - px[i]) * k;
      px[i + 1] = px[i + 1] + (218 - px[i + 1]) * k;
      px[i + 2] = px[i + 2] + (224 - px[i + 2]) * k;
    }
    return;
  }
  const dark = new Float32Array(n);
  let air = 0;
  for (let i = 0, j = 0; j < n; i += 4, j++) {
    const m = Math.min(px[i], px[i + 1], px[i + 2]) / 255;
    dark[j] = m;
  }
  // The haze's colour: the brightest of the darkest colours (a high percentile, not one stray pixel).
  const hist = new Uint32Array(256);
  for (let j = 0; j < n; j++) hist[(dark[j] * 255) | 0]++;
  let seen = 0;
  for (let v = 255; v >= 0; v--) {
    seen += hist[v];
    if (seen >= n * 0.002) {
      air = Math.max(0.55, v / 255);
      break;
    }
  }
  blurPlane(dark, w, h, Math.max(2, long * 0.02), 2);
  for (let i = 0, j = 0; j < n; i += 4, j++) {
    const t = Math.max(0.25, 1 - a * 0.9 * (dark[j] / air));
    for (let c = 0; c < 3; c++) {
      const v = px[i + c] / 255;
      px[i + c] = clamp((v - air) / t + air, 0, 1) * 255;
    }
  }
}

/** Clarity: midtones' local contrast raised (> 0) or softened (< 0), each pixel against its wide neighbourhood. */
export function clarity(px: Uint8ClampedArray, w: number, h: number, amount: number, long: number) {
  const a = clamp(amount, -100, 100) / 100;
  if (!a) return;
  const n = w * h;
  const L = lumaPlane(px, n);
  const soft = new Float32Array(L);
  blurPlane(soft, w, h, Math.max(2, long * 0.018), 3);
  for (let i = 0, j = 0; j < n; i += 4, j++) {
    const l = L[j];
    const mid = 1 - (2 * l - 1) * (2 * l - 1);
    const d = (l - soft[j]) * a * 1.6 * mid * 255;
    px[i] += d;
    px[i + 1] += d;
    px[i + 2] += d;
  }
}

/** A repeatable number between −1 and 1 for a cell of the grain. */
const hash = (x: number, y: number) => {
  let s = (x * 374761393 + y * 668265263) | 0;
  s = Math.imul(s ^ (s >>> 13), 1274126177);
  return (((s ^ (s >>> 16)) >>> 0) / 4294967295) * 2 - 1;
};

/**
 * Film grain (0 to 100): light and dark specks the size of a thousandth of the picture's long side, the same wherever
 * the picture is worked on (a part of it, or a small copy), strongest in the midtones.
 */
export function grain(px: Uint8ClampedArray, w: number, h: number, amount: number, f: LookFrame) {
  const a = clamp(amount, 0, 100) / 100;
  if (!a) return;
  const cell = Math.max(0.6, Math.max(f.W, f.H) / 900);
  // Specks smaller than a pixel average out: weaker as they shrink.
  const amp = a * 0.16 * 255 * Math.min(1, cell);
  for (let y = 0; y < h; y++) {
    const gy = (y + f.y) / cell;
    const y0 = Math.floor(gy);
    const ty = gy - y0;
    const sy = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < w; x++) {
      const gx = (x + f.x) / cell;
      const x0 = Math.floor(gx);
      const tx = gx - x0;
      const sx = tx * tx * (3 - 2 * tx);
      const top = hash(x0, y0) + (hash(x0 + 1, y0) - hash(x0, y0)) * sx;
      const bot = hash(x0, y0 + 1) + (hash(x0 + 1, y0 + 1) - hash(x0, y0 + 1)) * sx;
      const v = top + (bot - top) * sy;
      const i = (y * w + x) * 4;
      const l = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
      const d = v * amp * (1 - Math.abs(2 * l - 1) * 0.6);
      px[i] += d;
      px[i + 1] += d;
      px[i + 2] += d;
    }
  }
}

// ---- what a picture's colours are ---------------------------------------------------------------------------------

/** A picture's histogram: how many pixels have each value of red, green, blue and lightness (see-through ones left out). */
export interface Histogram {
  r: Uint32Array;
  g: Uint32Array;
  b: Uint32Array;
  l: Uint32Array;
  count: number;
}

export function histogramOf(px: Uint8ClampedArray, step = 1): Histogram {
  const hs: Histogram = { r: new Uint32Array(256), g: new Uint32Array(256), b: new Uint32Array(256), l: new Uint32Array(256), count: 0 };
  const s = Math.max(1, Math.round(step)) * 4;
  for (let i = 0; i < px.length; i += s) {
    if (px[i + 3] < 8) continue;
    hs.r[px[i]]++;
    hs.g[px[i + 1]]++;
    hs.b[px[i + 2]]++;
    hs.l[Math.round(0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2])]++;
    hs.count++;
  }
  return hs;
}

/** The value below which `share` of the counted pixels are (from the dark end), and the one above which `share` are. */
export function clipPoints(h: Uint32Array, total: number, share: number): [number, number] {
  const want = total * share;
  let lo = 0;
  let seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += h[v];
    if (seen > want) {
      lo = v;
      break;
    }
  }
  let hi = 255;
  seen = 0;
  for (let v = 255; v >= 0; v--) {
    seen += h[v];
    if (seen > want) {
      hi = v;
      break;
    }
  }
  return [lo, Math.max(lo + 1, hi)];
}

/**
 * Levels that stretch each channel to the full range (its darkest and lightest 0.3% let go), as Auto does; a channel
 * already spanning the range is left as it is.
 */
export function autoLevels(h: Histogram, share = 0.003): Levels {
  const out: Levels = {};
  if (!h.count) return out;
  for (const ch of ['r', 'g', 'b'] as const) {
    const [lo, hi] = clipPoints(h[ch], h.count, share);
    const l: LevelsOne = {};
    if (lo > 2) l.black = Math.min(lo, 120);
    if (hi < 253) l.white = Math.max(hi, (l.black ?? 0) + 40);
    if (Object.keys(l).length) out[ch] = l;
  }
  return out;
}

/**
 * Auto enhance, in one go: each channel stretched (as Auto levels), the middle grey moved so the picture is neither too
 * dark nor too light, and a little more colour where it has little.
 */
export function autoEnhance(h: Histogram): { levels?: Levels; vibrance: number; contrast: number } {
  const levels = autoLevels(h, 0.004);
  if (!h.count) return { vibrance: 0, contrast: 0 };
  let sum = 0;
  for (let v = 0; v < 256; v++) sum += v * h.l[v];
  const mean = sum / h.count / 255;
  // The middle grey: lighter for a dark picture, darker for a light one, gently.
  const gamma = Math.round(clamp(Math.log(0.5) / Math.log(clamp(mean, 0.08, 0.92)), 0.7, 1.45) * 100) / 100;
  if (Math.abs(gamma - 1) >= 0.04) levels.rgb = { gamma: Math.round((1 / gamma) * 100) / 100 };
  const [lo, hi] = clipPoints(h.l, h.count, 0.01);
  const span = (hi - lo) / 255;
  return { ...(Object.keys(levels).length ? { levels } : {}), vibrance: 18, contrast: span < 0.75 ? 10 : 0 };
}
