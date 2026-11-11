// What the sound editor draws on its canvases, in the theme's own colours: a track's clips (their name bar, both
// channels' waveforms as their gain and fades make them, or the spectrogram), the effects on parts of it, the words
// heard in it; and the time ruler with its markers.
import { clipEnd, clipFade, clipLength, dbGain, effectWords, envGainAt, type SoundEffect, type SoundTrack } from '@shared/mediaedit-audio';
import { minMax, type Decoded, type Get } from './engine';

export interface Palette {
  accent: string;
  accentSoft: string;
  fg: string;
  fg2: string;
  fg3: string;
  bg: string;
  bg1: string;
  bg2: string;
  bg3: string;
  line: string;
  line2: string;
  warn: string;
  info: string;
  panel: string;
}

export function palette(): Palette {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string, f: string) => s.getPropertyValue(n).trim() || f;
  return {
    accent: v('--accent', '#8aa8ff'),
    accentSoft: v('--accent-soft', 'rgba(138,168,255,0.14)'),
    fg: v('--fg', '#e9edf5'),
    fg2: v('--fg-2', '#bcc4d3'),
    fg3: v('--fg-3', '#8f99ab'),
    bg: v('--bg', '#000'),
    bg1: v('--bg-1', '#13161c'),
    bg2: v('--bg-2', '#1b1f27'),
    bg3: v('--bg-3', '#242a34'),
    line: v('--line', '#262b36'),
    line2: v('--line-2', '#3a4150'),
    warn: v('--warn', '#f2b468'),
    info: v('--info', '#5cc8e8'),
    panel: v('--panel', '#151820'),
  };
}

const parsed = new Map<string, [number, number, number]>();
/** A colour as its red, green and blue (read once, by a canvas). */
function rgbOf(color: string): [number, number, number] {
  let v = parsed.get(color);
  if (!v) {
    const c = document.createElement('canvas').getContext('2d')!;
    c.fillStyle = '#000';
    c.fillStyle = color;
    c.fillRect(0, 0, 1, 1);
    const d = c.getImageData(0, 0, 1, 1).data;
    v = [d[0], d[1], d[2]];
    parsed.set(color, v);
  }
  return v;
}

/** A colour of the theme, a little see-through. */
export function alpha(color: string, a: number): string {
  const [r, g, b] = rgbOf(color);
  return `rgba(${r},${g},${b},${a})`;
}

export interface View {
  /** Pixels a second, and the time at the left edge. */
  pps: number;
  x0: number;
}
export const xOf = (v: View, t: number) => (t - v.x0) * v.pps;
export const tOf = (v: View, x: number) => v.x0 + x / v.pps;

export const HEADER = 15;

/** The loudest a clip's volume line is drawn: its top edge is this multiple, its bottom is silence, and 1 (as it is) is the middle. */
export const ENV_TOP = 2;
/** Where a clip's body spans in a lane of height `h` (under its name bar, over the words along the bottom). */
export const bodyBox = (h: number, words: boolean) => ({ top: 1 + HEADER, bottom: h - 1 - (words ? 16 : 0) });
/** A volume line's volume as a height in the lane, and back. */
export const envY = (v: number, box: { top: number; bottom: number }) => box.bottom - (Math.min(ENV_TOP, Math.max(0, v)) / ENV_TOP) * (box.bottom - box.top);
export const envValue = (y: number, box: { top: number; bottom: number }) => Math.min(ENV_TOP, Math.max(0, ((box.bottom - y) / Math.max(1, box.bottom - box.top)) * ENV_TOP));

/** A track's lane: its clips, the effects on its parts, the words heard. `amp`: how much the waveforms are made taller. */
export function drawLane(
  c2: CanvasRenderingContext2D,
  o: {
    w: number;
    h: number;
    view: View;
    track: SoundTrack;
    get: Get;
    pal: Palette;
    amp: number;
    picked: string | null;
    mode: 'wave' | 'spectrum';
    effects: SoundEffect[];
    words?: { w: string; a: number; b: number }[];
    loading?: (src: string) => number | null;
    /** The time grid's lines. */
    grid?: { t: number; major: boolean }[];
  },
) {
  const { w, h, view, track, pal } = o;
  c2.clearRect(0, 0, w, h);
  // The time grid, under everything.
  for (const g of o.grid ?? []) {
    const x = Math.round(xOf(view, g.t)) + 0.5;
    if (x < 0 || x > w) continue;
    c2.fillStyle = alpha(pal.fg3, g.major ? 0.28 : 0.13);
    c2.fillRect(x, 0, 1, h);
  }
  const t0 = tOf(view, 0);
  const t1 = tOf(view, w);
  const wordsH = o.words?.length ? 16 : 0;
  for (const c of track.clips) {
    const end = clipEnd(c);
    if (end < t0 || c.at > t1) continue;
    const xa = Math.max(-2, xOf(view, c.at));
    const xb = Math.min(w + 2, xOf(view, end));
    const cw = Math.max(1, xb - xa);
    const on = o.picked === c.id;
    // The clip, its name bar, its edges.
    c2.fillStyle = alpha(pal.accent, on ? 0.16 : 0.09);
    c2.fillRect(xa, 1, cw, h - 2);
    c2.fillStyle = alpha(pal.accent, on ? 0.55 : 0.28);
    c2.fillRect(xa, 1, cw, HEADER);
    c2.strokeStyle = on ? pal.accent : alpha(pal.accent, 0.45);
    c2.lineWidth = on ? 1.5 : 1;
    c2.strokeRect(xa + 0.5, 1.5, cw - 1, h - 3);
    if (cw > 24) {
      c2.save();
      c2.beginPath();
      c2.rect(xa, 1, cw - 4, HEADER);
      c2.clip();
      c2.fillStyle = pal.fg;
      c2.font = '500 10.5px Inter Variable, ui-sans-serif, system-ui, sans-serif';
      c2.textBaseline = 'middle';
      const name = `${c.name ?? (c.src ? c.src.split(/[\\/]/).pop() : track.name ?? '')}${c.speed ? `  ${c.speed}×` : ''}${c.gain ? `  ${c.gain > 0 ? '+' : ''}${c.gain} dB` : ''}`;
      c2.fillText(name, Math.max(xa, 0) + 5, 1 + HEADER / 2 + 0.5);
      c2.restore();
    }
    const top = 1 + HEADER;
    const bottom = h - 1 - wordsH;
    const d = o.get(c.src);
    if (!d) {
      const f = o.loading?.(c.src);
      c2.fillStyle = pal.fg3;
      c2.font = '11px Inter Variable, ui-sans-serif, system-ui, sans-serif';
      c2.textBaseline = 'middle';
      c2.fillText(f === null || f === undefined ? 'Its sound cannot be read' : `Reading the sound${f > 0 ? ` · ${Math.round(f * 100)}%` : ''}`, Math.max(xa, 0) + 6, (top + bottom) / 2);
      continue;
    }
    c2.save();
    c2.beginPath();
    c2.rect(xa, top, cw, bottom - top);
    c2.clip();
    if (o.mode === 'spectrum') drawSpectrum(c2, { view, clip: c, d, xa: Math.max(0, xa), xb: Math.min(w, xb), top, bottom, pal });
    else drawWave(c2, { view, clip: c, d, xa: Math.max(0, xa), xb: Math.min(w, xb), top, bottom, pal, amp: o.amp });
    c2.restore();
    // The fades, as the lines they fall along.
    const len = clipLength(c);
    c2.strokeStyle = alpha(pal.fg, 0.55);
    c2.lineWidth = 1;
    // Straight, or along the half sine a smooth fade follows.
    const curve = (a: number, b: number, rising: boolean) => {
      c2.beginPath();
      const xa2 = xOf(view, a);
      const xb2 = xOf(view, b);
      const n = c.fadeSmooth ? Math.max(2, Math.min(24, Math.round((xb2 - xa2) / 4))) : 1;
      for (let i = 0; i <= n; i++) {
        const x = i / n;
        const v = clipFade(c, rising ? x : 1 - x);
        const px = xa2 + (xb2 - xa2) * x;
        const py = bottom - v * (bottom - top);
        if (i) c2.lineTo(px, py);
        else c2.moveTo(px, py);
      }
      c2.stroke();
    };
    if (c.fadeIn) curve(c.at, c.at + Math.min(len, c.fadeIn), true);
    if (c.fadeOut) curve(end - Math.min(len, c.fadeOut), end, false);
    drawEnv(c2, { view, clip: c, top, bottom, pal, on, w });
  }
  // The effects on a part of it: a slim bar each, along its top.
  let row = 0;
  for (const e of o.effects) {
    if (!e.range) continue;
    const xa = xOf(view, e.range[0]);
    const xb = xOf(view, e.range[1]);
    if (xb < 0 || xa > w) continue;
    const y = HEADER + 3 + (row++ % 3) * 7;
    c2.fillStyle = e.bypass ? alpha(pal.fg3, 0.35) : alpha(pal.warn, 0.75);
    c2.fillRect(xa, y, Math.max(2, xb - xa), 4);
    if (xb - xa > 60 && !e.bypass) {
      c2.fillStyle = pal.warn;
      c2.font = '9.5px Inter Variable, ui-sans-serif, system-ui, sans-serif';
      c2.textBaseline = 'top';
      c2.fillText(effectWords(e), Math.max(0, xa) + 3, y + 5);
    }
  }
  // The words heard, along its bottom.
  if (o.words?.length) {
    const y = h - wordsH;
    c2.fillStyle = alpha(pal.bg, 0.55);
    c2.fillRect(0, y, w, wordsH);
    c2.font = '10.5px Inter Variable, ui-sans-serif, system-ui, sans-serif';
    c2.textBaseline = 'middle';
    for (const wd of o.words) {
      const xa = xOf(view, wd.a);
      const xb = xOf(view, wd.b);
      if (xb < 0 || xa > w) continue;
      c2.fillStyle = alpha(pal.fg3, 0.18);
      c2.fillRect(xa, y + 1, Math.max(1, xb - xa - 1), wordsH - 2);
      if (xb - xa > 8) {
        c2.save();
        c2.beginPath();
        c2.rect(xa, y, xb - xa, wordsH);
        c2.clip();
        c2.fillStyle = pal.fg2;
        c2.fillText(wd.w, xa + 2, y + wordsH / 2);
        c2.restore();
      }
    }
  }
}

/** A clip's volume line: where it has one, or on the clip picked (a faint line as it is now, to click on and make one); its points show on the clip picked. */
function drawEnv(c2: CanvasRenderingContext2D, o: { view: View; clip: SoundTrack['clips'][number]; top: number; bottom: number; pal: Palette; on: boolean; w: number }) {
  const { view, clip: c, pal } = o;
  if (!c.env?.length && !o.on) return;
  const box = { top: o.top, bottom: o.bottom };
  const xa = xOf(view, c.at);
  const xb = xOf(view, clipEnd(c));
  c2.save();
  c2.beginPath();
  c2.rect(Math.max(0, xa), o.top - 2, Math.min(o.w, xb) - Math.max(0, xa), o.bottom - o.top + 4);
  c2.clip();
  c2.strokeStyle = c.env?.length ? pal.info : alpha(pal.info, 0.45);
  c2.lineWidth = c.env?.length ? 1.75 : 1;
  c2.setLineDash(c.env?.length ? [] : [4, 4]);
  c2.beginPath();
  const pts = c.env?.length ? c.env : [{ t: 0, v: 1 }];
  c2.moveTo(xa, envY(pts[0].v, box));
  for (const q of pts) c2.lineTo(xOf(view, c.at + q.t), envY(q.v, box));
  c2.lineTo(xb, envY(pts[pts.length - 1].v, box));
  c2.stroke();
  c2.setLineDash([]);
  if (o.on && c.env?.length)
    for (const q of c.env) {
      c2.beginPath();
      c2.arc(xOf(view, c.at + q.t), envY(q.v, box), 3.5, 0, Math.PI * 2);
      c2.fillStyle = pal.bg;
      c2.fill();
      c2.strokeStyle = pal.info;
      c2.lineWidth = 1.75;
      c2.stroke();
    }
  c2.restore();
}

/** A clip's waveform: each channel in its own half, as tall as its gain and fades make it. */
function drawWave(c2: CanvasRenderingContext2D, o: { view: View; clip: SoundTrack['clips'][number]; d: Decoded; xa: number; xb: number; top: number; bottom: number; pal: Palette; amp: number }) {
  const { view, clip: c, d } = o;
  const chans = d.ch.length;
  const hh = (o.bottom - o.top) / chans;
  const speed = c.speed ?? 1;
  const len = clipLength(c);
  const g = dbGain(c.gain ?? 0) * o.amp;
  for (let ch = 0; ch < chans; ch++) {
    const mid = o.top + hh * ch + hh / 2;
    c2.fillStyle = alpha(o.pal.fg3, 0.25);
    c2.fillRect(o.xa, Math.round(mid), o.xb - o.xa, 1);
    c2.fillStyle = o.pal.accent;
    for (let x = Math.floor(o.xa); x < o.xb; x++) {
      const ta = Math.max(c.at, (x - 0) / view.pps + view.x0);
      const tb = Math.min(c.at + len, (x + 1) / view.pps + view.x0);
      if (tb <= ta) continue;
      const sa = (c.from + (ta - c.at) * speed) * d.rate;
      const sb = (c.from + (tb - c.at) * speed) * d.rate;
      let [lo, hi] = minMax(d, ch, sa, Math.max(sa + 1, sb));
      const u = (ta + tb) / 2 - c.at;
      let e = g * envGainAt(c.env, u);
      if (c.fadeIn && u < c.fadeIn) e *= clipFade(c, u / c.fadeIn);
      if (c.fadeOut && u > len - c.fadeOut) e *= clipFade(c, Math.max(0, (len - u) / c.fadeOut));
      lo = Math.max(-1, lo * e);
      hi = Math.min(1, hi * e);
      const y0 = mid - hi * (hh / 2 - 1);
      const y1 = mid - lo * (hh / 2 - 1);
      c2.fillRect(x, y0, 1, Math.max(1, y1 - y0));
    }
  }
}

// ---- the spectrogram ---------------------------------------------------------------------------------------------

/** A radix-2 FFT in place (re, im of length a power of two). */
function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j;
        const b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

/** The theme's colours from quiet to loud: its background, the accent, then its text. */
function ramp(pal: Palette): [number, number, number][] {
  const a = rgbOf(pal.bg1);
  const b = rgbOf(pal.accent);
  const f = rgbOf(pal.fg);
  return Array.from({ length: 256 }, (_, i) => {
    const x = i / 255;
    const [p, q, k] = x < 0.6 ? [a, b, x / 0.6] : [b, f, (x - 0.6) / 0.4];
    return [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k];
  });
}
let ramped: { key: string; r: [number, number, number][] } | null = null;

/** A clip as a spectrogram: how loud each pitch is (low at the bottom, on a log scale) along its time. */
function drawSpectrum(c2: CanvasRenderingContext2D, o: { view: View; clip: SoundTrack['clips'][number]; d: Decoded; xa: number; xb: number; top: number; bottom: number; pal: Palette }) {
  const { view, clip: c, d } = o;
  const key = `${o.pal.bg1}${o.pal.accent}${o.pal.fg}`;
  if (ramped?.key !== key) ramped = { key, r: ramp(o.pal) };
  const colors = ramped.r;
  const N = d.rate > 30000 ? 1024 : 512;
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  const w = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const x0 = Math.floor(o.xa);
  const width = Math.max(1, Math.ceil(o.xb) - x0);
  const height = Math.max(1, Math.round(o.bottom - o.top));
  const img = c2.createImageData(width, height);
  const speed = c.speed ?? 1;
  const nyq = d.rate / 2;
  const fLo = 40;
  // Each row's bin, on a log scale from 40 Hz to the top.
  const rowBin = Array.from({ length: height }, (_, y) => Math.min(N / 2 - 1, Math.round((fLo * Math.pow(nyq / fLo, 1 - y / Math.max(1, height - 1)) * N) / d.rate)));
  const ch0 = d.ch[0];
  const ch1 = d.ch[1];
  for (let x = 0; x < width; x++) {
    const t = view.x0 + (x0 + x + 0.5) / view.pps;
    const s = Math.round((c.from + (t - c.at) * speed) * d.rate) - N / 2;
    for (let i = 0; i < N; i++) {
      const j = s + i;
      const v = j >= 0 && j < ch0.length ? (ch1 ? (ch0[j] + ch1[j]) / 2 : ch0[j]) : 0;
      re[i] = v * w[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let y = 0; y < height; y++) {
      const b = rowBin[y];
      const mag = Math.sqrt(re[b] * re[b] + im[b] * im[b]) / (N / 4);
      const dbv = 20 * Math.log10(mag + 1e-9);
      const k = Math.max(0, Math.min(255, Math.round(((dbv + 90) / 90) * 255)));
      const p = (y * width + x) * 4;
      const col = colors[k];
      img.data[p] = col[0];
      img.data[p + 1] = col[1];
      img.data[p + 2] = col[2];
      img.data[p + 3] = 255;
    }
  }
  c2.putImageData(img, x0, Math.round(o.top));
}

// ---- the ruler ---------------------------------------------------------------------------------------------------------

const STEPS = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];

/** "1:05", "1:05.5", "0.250": a ruler's label, as fine as its step needs. */
export function rulerLabel(t: number, step: number): string {
  const places = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  const ss = s.toFixed(places).padStart(places ? places + 3 : 2, '0');
  const h = Math.floor(m / 60);
  return h ? `${h}:${String(m % 60).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function drawRuler(c2: CanvasRenderingContext2D, o: { w: number; h: number; view: View; pal: Palette; length: number }) {
  const { w, h, view, pal } = o;
  c2.clearRect(0, 0, w, h);
  c2.fillStyle = pal.bg1;
  c2.fillRect(0, 0, w, h);
  // Beyond the end, darker.
  const xe = xOf(view, o.length);
  if (xe < w) {
    c2.fillStyle = alpha(pal.bg, 0.5);
    c2.fillRect(Math.max(0, xe), 0, w - Math.max(0, xe), h);
  }
  const step = STEPS.find((s) => s * view.pps >= 70) ?? 3600;
  const minor = STEPS[Math.max(0, STEPS.indexOf(step) - 2)] ?? step / 5;
  c2.fillStyle = pal.fg3;
  c2.font = '10.5px Inter Variable, ui-sans-serif, system-ui, sans-serif';
  c2.textBaseline = 'top';
  const t0 = Math.max(0, Math.floor(tOf(view, 0) / minor) * minor);
  for (let t = t0; t <= tOf(view, w) + minor; t += minor) {
    const x = Math.round(xOf(view, t)) + 0.5;
    const major = Math.abs(t / step - Math.round(t / step)) < 1e-6;
    c2.fillStyle = major ? pal.fg3 : alpha(pal.fg3, 0.5);
    c2.fillRect(x, major ? h - 9 : h - 4, 1, major ? 9 : 4);
    if (major) c2.fillText(rulerLabel(Math.round(t / step) * step, step), x + 3, 3);
  }
  c2.fillStyle = pal.line;
  c2.fillRect(0, h - 1, w, 1);
}
