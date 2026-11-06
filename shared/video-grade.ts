// A clip's colour, as the video editor's Colour page sets it (DaVinci Resolve's Color page, simpler): white balance
// (temperature, tint), exposure, brightness, contrast, highlights, shadows, saturation and vibrance; colour wheels for
// the shadows (lift), the midtones (gamma), the highlights (gain) and everything (offset); curves for all three colours
// and each one; a look (teal and orange, black and white…) with its strength; and effects that are more than colour
// (a vignette, sharpening, denoising, film grain).
//
// The colour part is one function of a pixel's red, green and blue (gradeFunction), sampled into a table 33 a side (a
// 3D LUT): the server writes it as a .cube file for ffmpeg's lut3d (server/mediaedit/video-plan.ts), and the editor's
// preview samples the same table in WebGL, both between its points the same way (trilinear), so what you see is what is
// made. The effects are ffmpeg's own filters (vignette, unsharp, hqdn3d, noise), done alike in the preview's shader.

/** A colour wheel: the colour it pushes towards (x, y in the wheel, its edge 1 away; red to the right, green up-left, blue down-left) and its brightness (-1 to 1). */
export interface VideoWheel {
  x: number;
  y: number;
  level: number;
}

/** A curve's points: [in, out], each 0 to 1, in order of `in`. Black (0, 0) and white (1, 1) are where they are unless moved. */
export type VideoCurve = [number, number][];

export interface VideoCurves {
  /** All three colours. */
  master?: VideoCurve;
  r?: VideoCurve;
  g?: VideoCurve;
  b?: VideoCurve;
}

export const VIDEO_LOOKS = [
  { id: 'cinematic', label: 'Cinematic (teal and orange)' },
  { id: 'warm', label: 'Warm' },
  { id: 'cool', label: 'Cool' },
  { id: 'bw', label: 'Black and white' },
  { id: 'vintage', label: 'Vintage' },
  { id: 'bleach', label: 'Bleach bypass' },
  { id: 'faded', label: 'Faded film' },
  { id: 'vivid', label: 'Vivid' },
  { id: 'noir', label: 'Noir' },
  { id: 'golden', label: 'Golden hour' },
  { id: 'matte', label: 'Matte' },
  { id: 'night', label: 'Day for night' },
] as const;
export type VideoLookId = (typeof VIDEO_LOOKS)[number]['id'];

/** A clip's colour and effects. Every part is left out when it changes nothing. */
export interface VideoGrade {
  /** -1 to 1: two stops darker to two stops brighter. */
  exposure?: number;
  /** -1 (cooler, bluer) to 1 (warmer, more orange). */
  temperature?: number;
  /** -1 (greener) to 1 (more magenta). */
  tint?: number;
  /** -1 to 1, as the browser's brightness() (0.4 to 1.6): what the editor's first colour sliders did. */
  brightness?: number;
  /** -1 to 1, as the browser's contrast() (0.4 to 1.6). */
  contrast?: number;
  /** -1 (darker) to 1 (brighter) highlights, and shadows. */
  highlights?: number;
  shadows?: number;
  /** -1 (black and white) to 1 (twice as colourful), as the browser's saturate(). */
  saturation?: number;
  /** -1 to 1: more colour where there is little (skin stays as it is), ffmpeg's vibrance. */
  vibrance?: number;
  lift?: VideoWheel;
  gamma?: VideoWheel;
  gain?: VideoWheel;
  offset?: VideoWheel;
  curves?: VideoCurves;
  look?: VideoLookId;
  /** How much of the look, 0 to 1 (1 when left out). */
  lookStrength?: number;
  /** 0 to 1 each. */
  vignette?: number;
  sharpen?: number;
  denoise?: number;
  grain?: number;
}

/** The sliders of the primaries, in the order the Colour page shows them. */
export const GRADE_SLIDERS = ['exposure', 'temperature', 'tint', 'contrast', 'brightness', 'highlights', 'shadows', 'saturation', 'vibrance'] as const;
export type GradeSlider = (typeof GRADE_SLIDERS)[number];
export const GRADE_EFFECTS = ['vignette', 'sharpen', 'denoise', 'grain'] as const;
export type GradeEffect = (typeof GRADE_EFFECTS)[number];
export const GRADE_WHEELS = ['lift', 'gamma', 'gain', 'offset'] as const;
export type GradeWheel = (typeof GRADE_WHEELS)[number];

/** Points a table of the colour has on each side: Resolve's own size. */
export const LUT_SIZE = 33;

const LUMA = [0.2126, 0.7152, 0.0722] as const;

const num = (v: unknown, lo: number, hi: number): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : undefined;
};
const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

function wheelOf(v: unknown): VideoWheel | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const w = v as Record<string, unknown>;
  let x = num(w.x, -1, 1) ?? 0;
  let y = num(w.y, -1, 1) ?? 0;
  const d = Math.hypot(x, y);
  if (d > 1) [x, y] = [x / d, y / d];
  const level = num(w.level, -1, 1) ?? 0;
  if (Math.abs(x) < 0.002 && Math.abs(y) < 0.002 && Math.abs(level) < 0.002) return undefined;
  return { x: r3(x), y: r3(y), level: r3(level) };
}

function curveOf(v: unknown): VideoCurve | undefined {
  if (!Array.isArray(v)) return undefined;
  const pts: VideoCurve = [];
  for (const p of v) {
    if (!Array.isArray(p) || p.length !== 2) continue;
    const x = num(p[0], 0, 1);
    const y = num(p[1], 0, 1);
    if (x === undefined || y === undefined) continue;
    pts.push([r3(x), r3(y)]);
  }
  pts.sort((a, b) => a[0] - b[0]);
  const out: VideoCurve = [];
  for (const p of pts) if (!out.length || p[0] - out[out.length - 1][0] >= 0.01) out.push(p);
  if (out.length > 16) out.length = 16;
  // A curve that leaves every value where it is is no curve.
  return out.every(([x, y]) => Math.abs(x - y) < 0.002) ? undefined : out.length ? out : undefined;
}

/** A grade as it can be made: every value in its range, what changes nothing left out; undefined when nothing is left. */
export function normalizeGrade(raw: unknown): VideoGrade | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const g = raw as Record<string, unknown>;
  const out: VideoGrade = {};
  for (const k of GRADE_SLIDERS) {
    const n = num(g[k], -1, 1);
    if (n !== undefined && Math.abs(n) >= 0.005) out[k] = r2(n);
  }
  for (const k of GRADE_WHEELS) {
    const w = wheelOf(g[k]);
    if (w) out[k] = w;
  }
  if (g.curves && typeof g.curves === 'object') {
    const c = g.curves as Record<string, unknown>;
    const curves: VideoCurves = {};
    for (const k of ['master', 'r', 'g', 'b'] as const) {
      const cv = curveOf(c[k]);
      if (cv) curves[k] = cv;
    }
    if (Object.keys(curves).length) out.curves = curves;
  }
  if (typeof g.look === 'string' && VIDEO_LOOKS.some((l) => l.id === g.look)) {
    const s = num(g.lookStrength, 0, 1) ?? 1;
    if (s >= 0.01) {
      out.look = g.look as VideoLookId;
      if (s < 0.995) out.lookStrength = r2(s);
    }
  }
  for (const k of GRADE_EFFECTS) {
    const n = num(g[k], 0, 1);
    if (n !== undefined && n >= 0.005) out[k] = r2(n);
  }
  return Object.keys(out).length ? out : undefined;
}

/** Whether a grade changes the colour (the table), as opposed to only its effects. */
export const gradeHasColour = (g?: VideoGrade) => !!g && Object.keys(g).some((k) => !(GRADE_EFFECTS as readonly string[]).includes(k));

// ---- the colour, as one function ---------------------------------------------------------------------------------

/** A curve's points as a function from 0–1 to 0–1: piecewise cubic through them, never overshooting (Fritsch–Carlson). */
export function curveFunction(points: VideoCurve): (x: number) => number {
  const p = [...points].sort((a, b) => a[0] - b[0]);
  if (!p.length || p[0][0] > 0.001) p.unshift([0, p.length && p[0][0] <= 0.001 ? p[0][1] : 0]);
  if (p[p.length - 1][0] < 0.999) p.push([1, 1]);
  const n = p.length;
  const xs = p.map((q) => q[0]);
  const ys = p.map((q) => q[1]);
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / Math.max(1e-6, xs[i + 1] - xs[i]));
  const m: number[] = new Array(n).fill(0);
  m[0] = d[0] ?? 0;
  m[n - 1] = d[n - 2] ?? 0;
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(d[i]) < 1e-9) {
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
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

/** The colour a wheel pushes towards, as red, green and blue shifts that leave the brightness as it is (each -1 to 1), as far as the puck is out. */
export function wheelPush(w?: Pick<VideoWheel, 'x' | 'y'>): [number, number, number] {
  if (!w || (!w.x && !w.y)) return [0, 0, 0];
  const rho = Math.min(1, Math.hypot(w.x, w.y));
  // The hue the puck points at: red to the right (0°), green at 120°, blue at 240°, counter-clockwise.
  const h = (((Math.atan2(w.y, w.x) * 180) / Math.PI) % 360 + 360) % 360;
  const f = (k: number) => {
    const t = (k + h / 60) % 6;
    return 1 - Math.max(0, Math.min(t, 4 - t, 1));
  };
  const c = [f(5), f(3), f(1)];
  const l = LUMA[0] * c[0] + LUMA[1] * c[1] + LUMA[2] * c[2];
  const t = c.map((x) => x - l);
  const most = Math.max(...t.map(Math.abs)) || 1;
  return [(t[0] / most) * rho, (t[1] / most) * rho, (t[2] / most) * rho];
}

/** The looks, each a grade of its own laid over the clip's (as much of it as the strength says). */
export const LOOK_GRADES: Record<VideoLookId, VideoGrade> = (() => {
  const at = (deg: number, r: number) => ({ x: r3(Math.cos((deg * Math.PI) / 180) * r), y: r3(Math.sin((deg * Math.PI) / 180) * r) });
  return {
    cinematic: { contrast: 0.15, saturation: 0.08, lift: { ...at(195, 0.55), level: -0.05 }, gain: { ...at(32, 0.5), level: 0.02 }, highlights: -0.1 },
    warm: { temperature: 0.4, tint: 0.05, saturation: 0.06 },
    cool: { temperature: -0.4, tint: -0.03, saturation: -0.04 },
    bw: { saturation: -1, contrast: 0.12 },
    vintage: { saturation: -0.3, contrast: -0.12, temperature: 0.2, lift: { ...at(60, 0.35), level: 0.3 }, gain: { ...at(35, 0.25), level: -0.06 } },
    bleach: { saturation: -0.55, contrast: 0.38, highlights: -0.12, shadows: -0.1 },
    faded: { contrast: -0.18, saturation: -0.22, lift: { ...at(210, 0.15), level: 0.4 }, gain: { x: 0, y: 0, level: -0.08 } },
    vivid: { vibrance: 0.5, saturation: 0.12, contrast: 0.1 },
    noir: { saturation: -1, contrast: 0.45, shadows: -0.25, lift: { x: 0, y: 0, level: -0.12 } },
    golden: { temperature: 0.5, tint: 0.12, highlights: 0.12, saturation: 0.1, gain: { ...at(30, 0.35), level: 0.03 } },
    matte: { contrast: -0.06, saturation: -0.12, lift: { x: 0, y: 0, level: 0.35 }, gain: { x: 0, y: 0, level: -0.12 } },
    night: { exposure: -0.45, temperature: -0.65, saturation: -0.45, gain: { ...at(240, 0.35), level: -0.1 }, contrast: 0.1 },
  };
})();

type Fn = (r: number, g: number, b: number) => [number, number, number];

/** A grade's colour (its sliders, wheels and curves; not its look) as a function of red, green and blue, each 0 to 1. */
function colourOf(g: VideoGrade): Fn {
  const t = g.temperature ?? 0;
  const m = g.tint ?? 0;
  // White balance as gains, the brightness kept: warmer is more red and less blue, magenta less green.
  let wr = 1 + 0.25 * t + 0.08 * m;
  let wg = 1 - 0.18 * m;
  let wb = 1 - 0.25 * t + 0.08 * m;
  const wl = LUMA[0] * wr + LUMA[1] * wg + LUMA[2] * wb;
  wr /= wl;
  wg /= wl;
  wb /= wl;
  // Exposure is a gain on the light: in the picture's own (gamma 2.2) values, a power of it.
  const ex = Math.pow(2, (2 * (g.exposure ?? 0)) / 2.2);
  const br = 1 + 0.6 * (g.brightness ?? 0);
  const ct = 1 + 0.6 * (g.contrast ?? 0);
  const hi = g.highlights ?? 0;
  const sh = g.shadows ?? 0;
  const s = 1 + (g.saturation ?? 0);
  // The browser's saturate() matrix: greys stay grey.
  const S = [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s];
  const vib = g.vibrance ?? 0;
  const lp = wheelPush(g.lift);
  const gp = wheelPush(g.gamma);
  const hp = wheelPush(g.gain);
  const op = wheelPush(g.offset);
  const L = [0, 1, 2].map((c) => 0.25 * (g.lift?.level ?? 0) + 0.2 * lp[c]);
  const G = [0, 1, 2].map((c) => 1 + 0.5 * (g.gain?.level ?? 0) + 0.3 * hp[c]);
  const E = [0, 1, 2].map((c) => Math.pow(2, -(0.8 * (g.gamma?.level ?? 0) + 0.5 * gp[c])));
  const O = [0, 1, 2].map((c) => 0.2 * (g.offset?.level ?? 0) + 0.12 * op[c]);
  const wheels = !!(g.lift || g.gamma || g.gain || g.offset);
  const master = g.curves?.master ? curveFunction(g.curves.master) : null;
  const per = (['r', 'g', 'b'] as const).map((k) => (g.curves?.[k] ? curveFunction(g.curves[k]!) : null));
  const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
  // Shadows and highlights move their part of the tones, black and white staying where they are.
  const tone = (v: number) => {
    const x = clamp01(v);
    return v + 0.3 * (sh * 6.75 * x * (1 - x) * (1 - x) + hi * 6.75 * x * x * (1 - x));
  };
  return (r0, g0, b0) => {
    let r = r0 * wr * ex * br;
    let gg = g0 * wg * ex * br;
    let b = b0 * wb * ex * br;
    if (ct !== 1) {
      r = (r - 0.5) * ct + 0.5;
      gg = (gg - 0.5) * ct + 0.5;
      b = (b - 0.5) * ct + 0.5;
    }
    if (hi || sh) {
      r = tone(r);
      gg = tone(gg);
      b = tone(b);
    }
    if (s !== 1) [r, gg, b] = [S[0] * r + S[1] * gg + S[2] * b, S[3] * r + S[4] * gg + S[5] * b, S[6] * r + S[7] * gg + S[8] * b];
    if (vib) {
      const mx = Math.max(r, gg, b);
      const mn = Math.min(r, gg, b);
      const l = LUMA[0] * r + LUMA[1] * gg + LUMA[2] * b;
      const c = 1 + vib * (1 - Math.sign(vib) * (mx - mn));
      r = l + (r - l) * c;
      gg = l + (gg - l) * c;
      b = l + (b - l) * c;
    }
    if (wheels) {
      const v = [r, gg, b];
      for (let c = 0; c < 3; c++) {
        let x = G[c] * (v[c] + L[c] * (1 - v[c]));
        x = x > 0 ? Math.pow(x, E[c]) : x;
        v[c] = x + O[c];
      }
      [r, gg, b] = v;
    }
    if (master) {
      r = master(clamp01(r));
      gg = master(clamp01(gg));
      b = master(clamp01(b));
    }
    if (per[0]) r = per[0](clamp01(r));
    if (per[1]) gg = per[1](clamp01(gg));
    if (per[2]) b = per[2](clamp01(b));
    return [r, gg, b];
  };
}

/** A grade's whole colour (with its look) as a function of red, green and blue, each 0 to 1; out 0 to 1. */
export function gradeFunction(g: VideoGrade): Fn {
  const base = colourOf(g);
  const look = g.look ? colourOf(LOOK_GRADES[g.look]) : null;
  const k = g.lookStrength ?? 1;
  const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
  return (r, gg, b) => {
    let [x, y, z] = base(r, gg, b);
    if (look) {
      const [lx, ly, lz] = look(clamp01(x), clamp01(y), clamp01(z));
      x += (lx - x) * k;
      y += (ly - y) * k;
      z += (lz - z) * k;
    }
    return [clamp01(x), clamp01(y), clamp01(z)];
  };
}

/** The grade's colour sampled `n` a side, as a .cube file lists it: red changing fastest, then green, then blue. */
export function gradeLut(g: VideoGrade, n = LUT_SIZE): Float32Array {
  const f = gradeFunction(g);
  const out = new Float32Array(n * n * n * 3);
  let i = 0;
  for (let b = 0; b < n; b++)
    for (let gg = 0; gg < n; gg++)
      for (let r = 0; r < n; r++) {
        const [x, y, z] = f(r / (n - 1), gg / (n - 1), b / (n - 1));
        out[i++] = x;
        out[i++] = y;
        out[i++] = z;
      }
  return out;
}

/** The table as a .cube file, which ffmpeg's lut3d reads. */
export function cubeText(lut: Float32Array, n = LUT_SIZE): string {
  const lines = [`TITLE "Hydor grade"`, `LUT_3D_SIZE ${n}`, 'DOMAIN_MIN 0 0 0', 'DOMAIN_MAX 1 1 1'];
  for (let i = 0; i < lut.length; i += 3) lines.push(`${lut[i].toFixed(5)} ${lut[i + 1].toFixed(5)} ${lut[i + 2].toFixed(5)}`);
  return lines.join('\n') + '\n';
}

/** A grade's colour at a point of the table, trilinear between its points, as ffmpeg's lut3d (interp=trilinear) and the preview's 3D texture read it. */
export function lutAt(lut: Float32Array, n: number, r: number, g: number, b: number): [number, number, number] {
  const at = (v: number) => Math.min(n - 1, Math.max(0, v * (n - 1)));
  const x = at(r);
  const y = at(g);
  const z = at(b);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const x1 = Math.min(n - 1, x0 + 1);
  const y1 = Math.min(n - 1, y0 + 1);
  const z1 = Math.min(n - 1, z0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const fz = z - z0;
  const out: [number, number, number] = [0, 0, 0];
  const idx = (i: number, j: number, k: number) => ((k * n + j) * n + i) * 3;
  for (let c = 0; c < 3; c++) {
    const v = (i: number, j: number, k: number) => lut[idx(i, j, k) + c];
    const c00 = v(x0, y0, z0) * (1 - fx) + v(x1, y0, z0) * fx;
    const c10 = v(x0, y1, z0) * (1 - fx) + v(x1, y1, z0) * fx;
    const c01 = v(x0, y0, z1) * (1 - fx) + v(x1, y0, z1) * fx;
    const c11 = v(x0, y1, z1) * (1 - fx) + v(x1, y1, z1) * fx;
    out[c] = (c00 * (1 - fy) + c10 * fy) * (1 - fz) + (c01 * (1 - fy) + c11 * fy) * fz;
  }
  return out;
}

// ---- the effects, as ffmpeg makes them -----------------------------------------------------------------------------

/** The vignette's angle (ffmpeg's vignette: the corners darkened by cos(angle × distance)⁴), from 0 to 1. */
export const vignetteAngle = (v: number) => r3(v * 0.9);
/** How much is added back of what a 5×5 blur takes away (ffmpeg's unsharp la). */
export const sharpenAmount = (v: number) => r2(v * 1.6);
/** hqdn3d's spatial and temporal strengths for the luma (chroma at three quarters). */
export const denoiseStrength = (v: number) => ({ spatial: r2(1 + v * 7), temporal: r2(1.5 + v * 9) });
/** ffmpeg's noise strength (0 to 100) on the brightness, changing every frame. */
export const grainStrength = (v: number) => Math.round(v * 28);
