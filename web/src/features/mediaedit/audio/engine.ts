// The sound editor's engine, in the browser: each sound read into memory (at a lighter rate for long ones: what is
// heard while editing; the saved sound is made by ffmpeg from the files themselves), its loudness at every scale for the
// waveforms, and the edit played as it will be made. Playing renders the tracks a third of a second at a time just ahead
// of the speakers (each clip's part, at its speed with its pitch kept, its gain and fades; reversed and pitched parts),
// and runs them through the browser's sound: each effect of the rack where Web Audio can make it (volume, fades,
// equalizer, filters, compressor, limiter, echo, the same reverb rooms ffmpeg uses, mono), on its part of the timeline;
// each track at its volume and pan; then the whole sound's effects, and a meter of its peaks and loudness.
import {
  activeEffects,
  audibleTracks,
  clipEnd,
  clipFade,
  dbGain,
  echoTaps,
  envGainAt,
  effectParams,
  fadeCurve,
  roomResponse,
  soundLength,
  type SoundEffect,
  type SoundFacts,
  type SoundRecipe,
  type SoundTrack,
} from '@shared/mediaedit-audio';
import { soundBytesUrl } from './api';

// ---- reading sounds ---------------------------------------------------------------------------------------------

export interface Decoded {
  rate: number;
  /** One or two channels. */
  ch: Float32Array[];
  duration: number;
  /** Each channel's lowest and highest sample in each `per` samples, at a few scales. */
  peaks: { per: number; mins: Float32Array[]; maxs: Float32Array[] }[];
}

/** The rate a sound is read at in the browser, and whether as one channel: lighter for long ones. */
export function readRate(f: Pick<SoundFacts, 'duration' | 'rate'> | undefined): { rate: number; mono: boolean } {
  const d = f?.duration ?? 0;
  const own = Math.min(48_000, Math.max(8_000, f?.rate ?? 44_100));
  if (d <= 12 * 60) return { rate: own, mono: false };
  if (d <= 40 * 60) return { rate: Math.min(own, 24_000), mono: false };
  return { rate: 16_000, mono: true };
}

const LEVELS = [256, 2048, 16384];

/** The lowest and highest sample of each stretch, at each scale. */
export function makePeaks(ch: Float32Array[]): Decoded['peaks'] {
  const out: Decoded['peaks'] = [];
  let prev: { per: number; mins: Float32Array[]; maxs: Float32Array[] } | null = null;
  for (const per of LEVELS) {
    const mins: Float32Array[] = [];
    const maxs: Float32Array[] = [];
    for (let c = 0; c < ch.length; c++) {
      const n = Math.ceil(ch[c].length / per);
      const lo = new Float32Array(n);
      const hi = new Float32Array(n);
      if (!prev) {
        const x = ch[c];
        for (let i = 0; i < n; i++) {
          let a = 1;
          let b = -1;
          const end = Math.min(x.length, (i + 1) * per);
          for (let j = i * per; j < end; j++) {
            const v = x[j];
            if (v < a) a = v;
            if (v > b) b = v;
          }
          lo[i] = a > b ? 0 : a;
          hi[i] = a > b ? 0 : b;
        }
      } else {
        const k = per / prev.per;
        for (let i = 0; i < n; i++) {
          let a = 1;
          let b = -1;
          const end = Math.min(prev.mins[c].length, (i + 1) * k);
          for (let j = i * k; j < end; j++) {
            if (prev.mins[c][j] < a) a = prev.mins[c][j];
            if (prev.maxs[c][j] > b) b = prev.maxs[c][j];
          }
          lo[i] = a > b ? 0 : a;
          hi[i] = a > b ? 0 : b;
        }
      }
      mins.push(lo);
      maxs.push(hi);
    }
    prev = { per, mins, maxs };
    out.push(prev);
  }
  return out;
}

/** The lowest and highest sample of channel `c` from sample `s0` to `s1`. */
export function minMax(d: Decoded, c: number, s0: number, s1: number): [number, number] {
  const ch = Math.min(c, d.ch.length - 1);
  let a = Math.max(0, Math.floor(s0));
  const b = Math.min(d.ch[ch].length, Math.ceil(s1));
  if (b <= a) return [0, 0];
  let lo = 1;
  let hi = -1;
  const span = b - a;
  const level = [...d.peaks].reverse().find((l) => l.per * 2 <= span);
  if (!level) {
    const x = d.ch[ch];
    for (let i = a; i < b; i++) {
      if (x[i] < lo) lo = x[i];
      if (x[i] > hi) hi = x[i];
    }
    return lo > hi ? [0, 0] : [lo, hi];
  }
  const x = d.ch[ch];
  // The ragged ends sample by sample, the middle by the scale's stretches.
  const i0 = Math.ceil(a / level.per);
  const i1 = Math.floor(b / level.per);
  for (; a < Math.min(b, i0 * level.per); a++) {
    if (x[a] < lo) lo = x[a];
    if (x[a] > hi) hi = x[a];
  }
  for (let i = i0; i < i1; i++) {
    if (level.mins[ch][i] < lo) lo = level.mins[ch][i];
    if (level.maxs[ch][i] > hi) hi = level.maxs[ch][i];
  }
  for (let j = Math.max(a, i1 * level.per); j < b; j++) {
    if (x[j] < lo) lo = x[j];
    if (x[j] > hi) hi = x[j];
  }
  return lo > hi ? [0, 0] : [lo, hi];
}

/** Bytes fetched, telling how far it is. */
async function fetchBytes(url: string, onProgress?: (f: number) => void): Promise<ArrayBuffer> {
  const r = await fetch(url, { credentials: 'same-origin' });
  if (!r.ok) {
    const j = await r.json().catch(() => null);
    throw new Error(j?.error ?? `${r.status} ${r.statusText}`);
  }
  const total = Number(r.headers.get('content-length')) || 0;
  if (!r.body || !total || !onProgress) return r.arrayBuffer();
  const reader = r.body.getReader();
  const out = new Uint8Array(total);
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (n + value.length > out.length) return new Blob([out.subarray(0, n), value]).arrayBuffer();
    out.set(value, n);
    n += value.length;
    onProgress(n / total);
  }
  return out.buffer.slice(0, n);
}

/** Decoded samples into the editor's own shape (two channels at most, or one for a long sound). */
export function fromBuffer(buf: AudioBuffer, mono: boolean): Decoded {
  let ch: Float32Array[] = [];
  for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) ch.push(buf.getChannelData(c));
  if (buf.numberOfChannels > 2) {
    // More than two: what is left and right of them, as ffmpeg downmixes.
    const l = new Float32Array(buf.length);
    const r = new Float32Array(buf.length);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const x = buf.getChannelData(c);
      const to = c % 2 ? r : l;
      for (let i = 0; i < x.length; i++) to[i] += x[i] / Math.ceil(buf.numberOfChannels / 2);
    }
    ch = [l, r];
  }
  if (mono && ch.length > 1) {
    const m = new Float32Array(ch[0].length);
    for (let i = 0; i < m.length; i++) m[i] = (ch[0][i] + ch[1][i]) / 2;
    ch = [m];
  }
  return { rate: buf.sampleRate, ch, duration: buf.length / buf.sampleRate, peaks: makePeaks(ch) };
}

/** A sound read into memory (the server's M4A of it when the browser cannot read it as it is). */
export async function decodeSound(src: string, facts: SoundFacts | undefined, onProgress?: (f: number) => void): Promise<Decoded> {
  const { rate, mono } = readRate(facts);
  let last: unknown;
  for (const m4a of facts?.video ? [true] : [false, true]) {
    try {
      const bytes = await fetchBytes(soundBytesUrl(src, m4a), onProgress);
      const buf = await new OfflineAudioContext(1, 1, rate).decodeAudioData(bytes);
      return fromBuffer(buf, mono);
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error('This browser could not read the sound');
}

/** A recording (or a file from this device) read into memory as the editor reads sounds. */
export async function decodeBlob(b: Blob, rate = 48_000): Promise<Decoded> {
  const buf = await new OfflineAudioContext(1, 1, rate).decodeAudioData(await b.arrayBuffer());
  return fromBuffer(buf, false);
}

// ---- rendering a track ------------------------------------------------------------------------------------------------

export type Get = (src: string) => Decoded | undefined;
type Stereo = [Float32Array, Float32Array];

const stereo = (n: number): Stereo => [new Float32Array(n), new Float32Array(n)];

/** Channel `c` of a sound at a fractional sample position (between samples, a straight line). */
function sampleAt(x: Float32Array, pos: number): number {
  const i = Math.floor(pos);
  if (i < 0 || i >= x.length) return 0;
  const f = pos - i;
  return f && i + 1 < x.length ? x[i] + (x[i + 1] - x[i]) * f : x[i];
}

const hann = (() => {
  const cache = new Map<number, Float32Array>();
  return (n: number) => {
    let w = cache.get(n);
    if (!w) {
      w = new Float32Array(n);
      for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
      cache.set(n, w);
    }
    return w;
  };
})();

/**
 * A clip at a speed, its pitch kept (for listening while editing): frames of its sound laid half over each other, each
 * moved a little to line up with what the frame before it would go on with. Each frame is worked out on its own, from
 * where it falls, so any stretch of it renders alike, a part at a time.
 */
function stretched(d: Decoded, from: number, speed: number, u0: number, n: number, R: number): Stereo {
  const out = stereo(n);
  const N = Math.max(256, Math.round(R * 0.04));
  const H = N >> 1;
  const w = hann(N);
  const k = d.rate / R;
  const tol = Math.round(d.rate * 0.008);
  const ref = d.ch[0];
  const i0 = Math.round(u0 * R);
  const f0 = Math.max(0, Math.floor(i0 / H) - 1);
  const f1 = Math.ceil((i0 + n) / H);
  for (let f = f0; f <= f1; f++) {
    const start = f * H;
    // Where it naturally reads, and where the frame before it would go on (both in the sound's samples).
    const p = (from + (start / R) * speed) * d.rate;
    const prevGoesOn = (from + (((f - 1) * H) / R) * speed) * d.rate + H * k;
    let best = 0;
    let bestScore = -Infinity;
    if (f > 0) {
      for (let delta = -tol; delta <= tol; delta += 2) {
        let s = 0;
        for (let j = 0; j < N * k; j += 4) s += sampleAt(ref, p + delta + j) * sampleAt(ref, prevGoesOn + j);
        if (s > bestScore) {
          bestScore = s;
          best = delta;
        }
      }
    }
    const a = Math.max(start, i0);
    const b = Math.min(start + N, i0 + n);
    for (let c = 0; c < 2; c++) {
      const x = d.ch[Math.min(c, d.ch.length - 1)];
      const o = out[c];
      for (let i = a; i < b; i++) o[i - i0] += w[i - start] * sampleAt(x, p + best + (i - start) * k);
    }
  }
  return out;
}

/** A track's clips from `t0`, `n` samples at `R`: each clip's part (at its speed), its gain and fades. */
export function renderClips(t: SoundTrack, t0: number, n: number, R: number, get: Get): Stereo {
  const out = stereo(n);
  const t1 = t0 + n / R;
  for (const c of t.clips) {
    const end = clipEnd(c);
    if (end <= t0 || c.at >= t1) continue;
    const d = get(c.src);
    if (!d) continue;
    const i0 = Math.max(0, Math.ceil((c.at - t0) * R - 1e-9));
    const i1 = Math.min(n, Math.ceil((end - t0) * R - 1e-9));
    if (i1 <= i0) continue;
    const speed = c.speed ?? 1;
    let part: Stereo | null = null;
    if (speed !== 1) part = stretched(d, c.from, speed, t0 + i0 / R - c.at, i1 - i0, R);
    const g = dbGain(c.gain ?? 0);
    const len = end - c.at;
    for (let ch = 0; ch < 2; ch++) {
      const x = d.ch[Math.min(ch, d.ch.length - 1)];
      const o = out[ch];
      for (let i = i0; i < i1; i++) {
        const t = t0 + i / R;
        const u = t - c.at;
        let v = part ? part[ch][i - i0] : sampleAt(x, (c.from + u) * d.rate);
        let e = g;
        if (c.env) e *= envGainAt(c.env, u);
        if (c.fadeIn && u < c.fadeIn) e *= clipFade(c, u / c.fadeIn);
        if (c.fadeOut && u > len - c.fadeOut) e *= clipFade(c, Math.max(0, (len - u) / c.fadeOut));
        v *= e;
        o[i] += v;
      }
    }
  }
  return out;
}

/** A part reversed or pitched, on a track (its time-changing effects, applied in the rack's order). */
interface TimeFx {
  kind: 'reverse' | 'pitch';
  a: number;
  b: number;
  k: number;
}

/** The time-changing effects heard on a track: its own, then the whole sound's (applied to each track alike). */
export function timeEffects(r: SoundRecipe, t: SoundTrack): TimeFx[] {
  const L = soundLength(r);
  const of = (e: SoundEffect): TimeFx | null => {
    if (e.type !== 'reverse' && e.type !== 'pitch') return null;
    const [a, b] = e.range ?? [0, L];
    return { kind: e.type, a, b, k: e.type === 'pitch' ? Math.pow(2, effectParams(e).semitones / 12) : 1 };
  };
  return [...activeEffects(r, t.id), ...activeEffects(r, null)].map(of).filter((x): x is TimeFx => !!x);
}

/** A track from `t0`, `n` samples at `R`, as heard before the rack's other effects: its clips, then its reversed and pitched parts. */
export function renderTrack(t: SoundTrack, fx: TimeFx[], t0: number, n: number, R: number, get: Get): Stereo {
  if (n <= 0) return stereo(0);
  if (!fx.length) return renderClips(t, t0, n, R, get);
  const e = fx[fx.length - 1];
  const rest = fx.slice(0, -1);
  const t1 = t0 + n / R;
  if (e.b <= t0 || e.a >= t1 || (e.kind === 'pitch' && Math.abs(e.k - 1) < 1e-4)) return renderTrack(t, rest, t0, n, R, get);
  const out = stereo(n);
  const ia = Math.max(0, Math.min(n, Math.round((e.a - t0) * R)));
  const ib = Math.max(ia, Math.min(n, Math.round((e.b - t0) * R)));
  const put = (x: Stereo, at: number) => {
    out[0].set(x[0], at);
    out[1].set(x[1], at);
  };
  if (ia > 0) put(renderTrack(t, rest, t0, ia, R, get), 0);
  if (ib < n) put(renderTrack(t, rest, t0 + ib / R, n - ib, R, get), ib);
  const m = ib - ia;
  if (m <= 0) return out;
  const ta = t0 + ia / R;
  if (e.kind === 'reverse') {
    const x = renderTrack(t, rest, e.a + e.b - (ta + m / R), m, R, get);
    x[0].reverse();
    x[1].reverse();
    put(x, ia);
    return out;
  }
  // Pitched: grains of what is there, each read faster or slower about its middle, laid half over each other where they were.
  const N = Math.max(256, Math.round(R * 0.05));
  const H = N >> 1;
  const w = hann(N);
  const g0 = Math.floor(((ta - e.a) * R) / H) - 1;
  const g1 = Math.ceil(((ta - e.a) * R + m) / H);
  const reach = (N / 2) * e.k + 2;
  const sa = e.a + (g0 * H + N / 2) / R - reach / R;
  const sn = Math.ceil((g1 - g0) * H + 2 * reach + N);
  const src = renderTrack(t, rest, sa, sn, R, get);
  for (let g = g0; g <= g1; g++) {
    const gs = Math.round((e.a - t0) * R) + g * H;
    const center = gs + N / 2;
    const centerIn = (e.a + (g * H + N / 2) / R - sa) * R;
    const a = Math.max(gs, ia);
    const b = Math.min(gs + N, ib);
    for (let c = 0; c < 2; c++)
      for (let i = a; i < b; i++) out[c][i] += w[i - gs] * sampleAt(src[c], centerIn + (i - center) * e.k);
  }
  return out;
}

// ---- measuring, for Normalize and Loudness while editing ------------------------------------------------------------

/** How loud the tracks are together from `a` to `b` (as heard before the rack's effects): their loudest peak and loudness (gated, unweighted). */
export function measure(tracks: SoundTrack[], r: SoundRecipe, a: number, b: number, get: Get, R: number): { peak: number; lufs: number } {
  const step = Math.max(1, Math.round(R / 8000));
  const block = Math.round(0.4 * R);
  let peak = 0;
  const blocks: number[] = [];
  for (let t = a; t < b; t += block / R) {
    const n = Math.min(block, Math.ceil((b - t) * R));
    const sum = stereo(n);
    for (const tr of tracks) {
      const x = renderTrack(tr, timeEffects(r, tr), t, n, R, get);
      const g = dbGain(tr.volume ?? 0);
      for (let i = 0; i < n; i += step) {
        sum[0][i] += x[0][i] * g;
        sum[1][i] += x[1][i] * g;
      }
    }
    let ms = 0;
    let cnt = 0;
    for (let i = 0; i < n; i += step) {
      const l = sum[0][i];
      const rr = sum[1][i];
      peak = Math.max(peak, Math.abs(l), Math.abs(rr));
      ms += l * l + rr * rr;
      cnt++;
    }
    if (cnt) blocks.push(ms / cnt);
  }
  const lufsOf = (ms: number) => -0.691 + 10 * Math.log10(Math.max(1e-12, ms));
  const above = blocks.filter((x) => lufsOf(x) > -70);
  const rel = above.length ? lufsOf(above.reduce((s, x) => s + x, 0) / above.length) - 10 : -70;
  const gated = above.filter((x) => lufsOf(x) > rel);
  return { peak: peak > 0 ? 20 * Math.log10(peak) : -Infinity, lufs: gated.length ? lufsOf(gated.reduce((s, x) => s + x, 0) / gated.length) : -70 };
}

// ---- playing ----------------------------------------------------------------------------------------------------------

/** A gain along the timeline: straight lines between points, the first and last values kept beyond them. */
type Env = { t: number; v: number }[];
const envAt = (e: Env, t: number) => {
  if (!e.length) return 1;
  if (t <= e[0].t) return e[0].v;
  for (let i = 1; i < e.length; i++) if (t <= e[i].t) return e[i - 1].v + ((e[i].v - e[i - 1].v) * (t - e[i - 1].t)) / Math.max(1e-9, e[i].t - e[i - 1].t);
  return e[e.length - 1].v;
};
/** 1 between `a` and `b`, else 0, with a few milliseconds each way so it does not click. */
const maskEnv = (a: number, b: number): Env => [
  { t: a - 0.003, v: 0 },
  { t: a, v: 1 },
  { t: b, v: 1 },
  { t: b + 0.003, v: 0 },
];

/**
 * An automation along the timeline from `t0`, played from the context's `c0` at rate `k` (1: as it is, 2: twice as fast,
 * negative: backwards, towards `t1`): the value at `t0`, then each point on the way.
 */
function schedule(p: AudioParam, e: Env, t0: number, t1: number, c0: number, k = 1) {
  p.cancelScheduledValues(c0);
  p.setValueAtTime(envAt(e, t0), c0);
  if (k > 0) {
    for (const x of e) if (x.t > t0 && x.t < t1) p.linearRampToValueAtTime(x.v, c0 + (x.t - t0) / k);
  } else if (k < 0) {
    for (let i = e.length - 1; i >= 0; i--) if (e[i].t < t0 && e[i].t > t1) p.linearRampToValueAtTime(e[i].v, c0 + (t0 - e[i].t) / -k);
  }
}

interface Stage {
  input: AudioNode;
  output: AudioNode;
  /** Its automation for the timeline from `t0` to `t1`, played from the context's `c0` at rate `k` (negative: backwards). */
  at(t0: number, t1: number, c0: number, k?: number): void;
  /**
   * Its settings changed to those of `e` (the same effect, its settings moved) while it plays: true when it could be done
   * without making it again (a slider moved heard at once), false when it has to be made again (a room's other
   * sound, an equalizer band switched on).
   */
  update(e: SoundEffect, range: [number, number], gain: number | undefined): boolean;
}

/** The browser's compressor makes its sound louder by itself: how much (dB), to take back. */
const autoMakeup = (threshold: number, ratio: number) => -0.6 * (threshold + (0 - threshold) / ratio);

/** An effect's gain along the timeline (for the effects that are a gain: its volume, normalized, a fade), on `range`. */
function gainEnv(e: SoundEffect, range: [number, number], gain: number | undefined): Env {
  const p = effectParams(e);
  const [a, b] = range;
  const ranged = !!e.range;
  switch (e.type) {
    case 'gain':
      return ranged ? [{ t: a - 0.002, v: 1 }, { t: a, v: dbGain(p.db) }, { t: b, v: dbGain(p.db) }, { t: b + 0.002, v: 1 }] : [{ t: 0, v: dbGain(p.db) }];
    case 'normalize':
    case 'loudness': {
      const g = dbGain(gain ?? 0);
      return ranged ? [{ t: a - 0.002, v: 1 }, { t: a, v: g }, { t: b, v: g }, { t: b + 0.002, v: 1 }] : [{ t: 0, v: g }];
    }
    default: {
      const [fa, fb] = ranged ? [a, b] : e.type === 'fadeIn' ? [0, Math.min(p.seconds, b)] : [Math.max(0, b - p.seconds), b];
      const pts: Env = [{ t: fa - 0.0005, v: 1 }];
      for (let i = 0; i <= 24; i++) {
        const x = i / 24;
        const v = fadeCurve(x, !!p.curve);
        pts.push({ t: fa + (fb - fa) * x, v: e.type === 'fadeIn' ? v : 1 - v });
      }
      pts.push({ t: fb + 0.0005, v: 1 });
      return pts;
    }
  }
}

/** An effect in Web Audio, on `range` of the timeline (its gain worked out from `gain` for Normalize and Loudness). */
function stageOf(ctx: BaseAudioContext, e: SoundEffect, range: [number, number], gain: number | undefined): Stage | null {
  let p = effectParams(e);
  let [a, b] = range;
  const ranged = !!e.range;
  /** What the stage reads when settings move: the same effect, in the same place on the timeline. */
  const sameKind = (x: SoundEffect) => x.type === e.type && !!x.range === ranged && !x.bypass;
  const take = (x: SoundEffect, r: [number, number]) => {
    p = effectParams(x);
    [a, b] = r;
  };
  const gainStage = (): Stage => {
    const g = ctx.createGain();
    let env = gainEnv(e, range, gain);
    return {
      input: g,
      output: g,
      at: (t0, t1, c0, k) => schedule(g.gain, env, t0, t1, c0, k),
      update(x, r, gn) {
        if (!sameKind(x)) return false;
        env = gainEnv(x, r, gn);
        return true;
      },
    };
  };
  const rangeEnv = (): Env => (ranged ? maskEnv(a, b) : [{ t: 0, v: 1 }]);
  /** Nodes made only on the range: what goes through them there, what goes past them elsewhere. */
  const masked = (inp: AudioNode, out: AudioNode, change: (x: SoundEffect) => boolean = () => true): Stage => {
    const input = ctx.createGain();
    const output = ctx.createGain();
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    input.connect(dry).connect(output);
    input.connect(inp);
    out.connect(wet).connect(output);
    return {
      input,
      output,
      at(t0, t1, c0, k) {
        const env = rangeEnv();
        schedule(wet.gain, env, t0, t1, c0, k);
        schedule(dry.gain, env.map((x) => ({ t: x.t, v: 1 - x.v })), t0, t1, c0, k);
      },
      update(x, r) {
        if (!sameKind(x)) return false;
        take(x, r);
        return change(x);
      },
    };
  };
  /** A sound added to what is there (echo, reverb), only from the range's sound and only on it. */
  const added = (inp: AudioNode, out: AudioNode, level: () => number, change: (x: SoundEffect) => boolean): Stage => {
    const input = ctx.createGain();
    const output = ctx.createGain();
    const send = ctx.createGain();
    const back = ctx.createGain();
    input.connect(output);
    input.connect(send).connect(inp);
    out.connect(back).connect(output);
    return {
      input,
      output,
      at(t0, t1, c0, k) {
        const env = rangeEnv();
        schedule(send.gain, env, t0, t1, c0, k);
        schedule(
          back.gain,
          env.map((x) => ({ t: x.t, v: x.v * level() })),
          t0,
          t1,
          c0,
          k,
        );
      },
      update(x, r) {
        if (!sameKind(x)) return false;
        take(x, r);
        return change(x);
      },
    };
  };
  const biquad = (type: BiquadFilterType, f: number, o: { q?: number; gain?: number } = {}) => {
    const n = ctx.createBiquadFilter();
    n.type = type;
    n.frequency.value = Math.min(f, ctx.sampleRate * 0.45);
    // Low- and high-pass take their Q in dB: −3 dB is the usual 0.707.
    if (o.q !== undefined) n.Q.value = o.q;
    if (o.gain !== undefined) n.gain.value = o.gain;
    return n;
  };
  const hz = (n: BiquadFilterNode, f: number) => (n.frequency.value = Math.min(f, ctx.sampleRate * 0.45));
  const chain = (nodes: AudioNode[]) => {
    for (let i = 1; i < nodes.length; i++) nodes[i - 1].connect(nodes[i]);
    return [nodes[0], nodes[nodes.length - 1]] as const;
  };
  switch (e.type) {
    case 'gain':
    case 'normalize':
    case 'loudness':
    case 'fadeIn':
    case 'fadeOut':
      return gainStage();
    case 'eq': {
      // Each band is a node made only when it is on: moving a band's amount is heard at once, switching one on or off makes it again.
      const bands = { lowCut: biquad('highpass', p.lowCut, { q: -3.0103 }), highCut: biquad('lowpass', p.highCut, { q: -3.0103 }), bass: biquad('lowshelf', 100, { gain: p.bass }), mid: biquad('peaking', 1500, { q: 0.8, gain: p.mid }), treble: biquad('highshelf', 6000, { gain: p.treble }) };
      const on = { lowCut: p.lowCut > 0, highCut: p.highCut > 0, bass: !!p.bass, mid: !!p.mid, treble: !!p.treble };
      const nodes = (Object.keys(bands) as (keyof typeof bands)[]).filter((k) => on[k]).map((k) => bands[k]);
      if (!nodes.length) return null;
      const [i, o] = chain(nodes);
      return masked(i, o, () => {
        const now = { lowCut: p.lowCut > 0, highCut: p.highCut > 0, bass: !!p.bass, mid: !!p.mid, treble: !!p.treble };
        if ((Object.keys(on) as (keyof typeof on)[]).some((k) => on[k] !== now[k])) return false;
        hz(bands.lowCut, p.lowCut || 20);
        hz(bands.highCut, p.highCut || 20000);
        bands.bass.gain.value = p.bass;
        bands.mid.gain.value = p.mid;
        bands.treble.gain.value = p.treble;
        return true;
      });
    }
    case 'highpass':
    case 'lowpass': {
      const n = biquad(e.type, p.hz, { q: -3.0103 });
      return masked(n, n, () => (hz(n, p.hz), true));
    }
    case 'compressor':
    case 'limiter': {
      const c = ctx.createDynamicsCompressor();
      const lim = e.type === 'limiter';
      const make = ctx.createGain();
      const set = () => {
        c.threshold.value = lim ? p.ceiling : p.threshold;
        c.ratio.value = lim ? 20 : p.ratio;
        c.knee.value = lim ? 0 : 6;
        c.attack.value = lim ? 0.002 : p.attack / 1000;
        c.release.value = Math.min(1, p.release / 1000);
        make.gain.value = dbGain((lim ? 0 : p.makeup) - autoMakeup(c.threshold.value, c.ratio.value));
      };
      set();
      c.connect(make);
      return masked(c, make, () => (set(), true));
    }
    case 'echo': {
      const taps = echoTaps(p.delay, p.decay);
      if (!taps.length) return null;
      const room = Math.max(1, (p.delay / 1000) * 1.1);
      const dl = ctx.createDelay(room);
      const fb = ctx.createGain();
      const out = ctx.createGain();
      const set = () => {
        dl.delayTime.value = p.delay / 1000;
        fb.gain.value = p.decay;
        out.gain.value = p.decay;
      };
      set();
      dl.connect(fb).connect(dl);
      dl.connect(out);
      // A delay longer than the node was made for, or one with no echoes, is made again.
      return added(dl, out, () => 1, () => p.delay / 1000 <= room && echoTaps(p.delay, p.decay).length > 0 && (set(), true));
    }
    case 'reverb': {
      const conv = ctx.createConvolver();
      conv.normalize = false;
      const h = roomResponse(p.room, ctx.sampleRate);
      const buf = ctx.createBuffer(2, h[0].length, ctx.sampleRate);
      buf.copyToChannel(h[0] as Float32Array<ArrayBuffer>, 0);
      buf.copyToChannel(h[1] as Float32Array<ArrayBuffer>, 1);
      conv.buffer = buf;
      const room = p.room;
      return added(conv, conv, () => p.mix, () => p.room === room);
    }
    case 'mono': {
      const split = ctx.createChannelSplitter(2);
      const merge = ctx.createChannelMerger(2);
      const half = ctx.createGain();
      half.gain.value = 0.5;
      split.connect(half, 0);
      split.connect(half, 1);
      half.connect(merge, 0, 0);
      half.connect(merge, 0, 1);
      return masked(split, merge);
    }
    default:
      // Noise reduction is heard once it is saved; pitch and reverse are rendered with the tracks.
      return null;
  }
}

export interface PlayOptions {
  from: number;
  /** How fast and which way: 1 as it is, 2 twice as fast, −1 backwards (J, K and L; like a tape, its pitch follows). */
  rate?: number;
  /** Where it stops (the end of the sound when left out). */
  to?: number;
  /** Play this part again and again. */
  loop?: [number, number];
}

/** What the meter shows: each side's peak now and held, and the loudness of the last 0.4 s. */
export interface Levels {
  peak: [number, number];
  hold: [number, number];
  lufs: number;
}

const AHEAD = 0.6;
const CHUNK = 0.3;

/** Plays an edit in the browser: start, stop, where it is, and its levels. */
export class SoundPlayer {
  ctx: AudioContext | null = null;
  private stopFn: (() => void) | null = null;
  /** Where on the timeline each stretch played starts, and when in the context's time. */
  private segs: { c: number; t: number; t1: number; k: number }[] = [];
  private analysers: AnalyserNode[] = [];
  private kAnalysers: AnalyserNode[] = [];
  private held: [number, number] = [-Infinity, -Infinity];
  private heldAt = 0;
  playing = false;
  onEnd: (() => void) | null = null;
  /** What is playing, to change its settings in place: the edit, its stages by effect, its tracks' volume and pan, the Normalize and Loudness gains it has. */
  private live: { r: SoundRecipe; stages: Map<string, Stage>; tracks: Map<string, { vol: GainNode; pan: StereoPannerNode }>; gains: Record<string, number> } | null = null;

  /** The browser's sound, made on the first press of play (browsers start sound only then). */
  context(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext({ latencyHint: 'interactive' });
    return this.ctx;
  }

  /** Where it is on the timeline now (null when it is not playing). */
  time(): number | null {
    if (!this.playing || !this.ctx) return null;
    const now = this.ctx.currentTime - (this.ctx.outputLatency || 0);
    let seg = this.segs[0];
    for (const s of this.segs) if (s.c <= now) seg = s;
    if (!seg) return null;
    const x = seg.t + Math.max(0, now - seg.c) * seg.k;
    return seg.k < 0 ? Math.max(seg.t1, x) : Math.min(seg.t1, x);
  }

  stop() {
    this.stopFn?.();
    this.stopFn = null;
    this.playing = false;
    this.live = null;
  }

  /**
   * The edit changed while it plays: if only settings moved (an effect's slider, a track's volume or pan) they are
   * changed in the running sound, which goes on without a break, and this says true. Anything else (clips, a track
   * muted, an effect added, taken out, bypassed or moved, pitch and reverse, a room's other sound) says false, and the
   * caller plays it again from where it is.
   */
  refresh(r: SoundRecipe, gains: Record<string, number>): boolean {
    const live = this.live;
    const ctx = this.ctx;
    if (!live || !ctx || !this.playing) return false;
    const was = live.r;
    if (was === r) return true;
    if (was.length !== r.length || was.tracks.length !== r.tracks.length) return false;
    for (let i = 0; i < r.tracks.length; i++) {
      const x = was.tracks[i];
      const y = r.tracks[i];
      if (x.id !== y.id || x.clips !== y.clips || !!x.mute !== !!y.mute || !!x.solo !== !!y.solo) return false;
    }
    const fx = r.effects ?? [];
    const old = was.effects ?? [];
    if (fx.length !== old.length) return false;
    const changed: Stage[] = [];
    for (let i = 0; i < fx.length; i++) {
      const x = old[i];
      const y = fx[i];
      if (x === y) continue;
      if (x.id !== y.id || x.type !== y.type || x.track !== y.track || !!x.bypass !== !!y.bypass) return false;
      const same = JSON.stringify([x.p, x.range]) === JSON.stringify([y.p, y.range]);
      if (x.type === 'reverse' || x.type === 'pitch') {
        if (!same) return false;
        continue;
      }
      if (x.bypass) continue;
      const st = live.stages.get(y.id);
      if (!st) {
        if (!same) return false;
        continue;
      }
      if (!same || gains[y.id] !== live.gains[y.id]) {
        if (!st.update(y, y.range ?? [0, soundLength(r)], gains[y.id])) return false;
        changed.push(st);
      }
    }
    // Normalize and Loudness gains that moved with an edit of something else are heard through their stages.
    for (const e of fx) {
      if (e.bypass || gains[e.id] === live.gains[e.id] || changed.some((c) => live.stages.get(e.id) === c)) continue;
      const st = live.stages.get(e.id);
      if (st && !st.update(e, e.range ?? [0, soundLength(r)], gains[e.id])) return false;
      if (st) changed.push(st);
    }
    for (const t of r.tracks) {
      const n = live.tracks.get(t.id);
      const old2 = was.tracks.find((k) => k.id === t.id)!;
      if (!n) continue;
      if (t.volume !== old2.volume) n.vol.gain.setTargetAtTime(dbGain(t.volume ?? 0), ctx.currentTime, 0.01);
      if (t.pan !== old2.pan) n.pan.pan.setTargetAtTime(t.pan ?? 0, ctx.currentTime, 0.01);
    }
    // What the changed stages do from here on, along the stretch playing now.
    const now = ctx.currentTime;
    let seg = this.segs[0];
    for (const s of this.segs) if (s.c <= now) seg = s;
    if (seg) {
      const t0 = seg.t + Math.max(0, now - seg.c) * seg.k;
      for (const st of changed) st.at(seg.k < 0 ? Math.max(seg.t1, t0) : Math.min(seg.t1, t0), seg.t1, now, seg.k);
    }
    this.live = { ...live, r, gains };
    return true;
  }

  /**
   * Plays `r` from `o.from` (to `o.to`, or round `o.loop`). `get` gives each sound's samples; `R` the rate it renders at;
   * `gains` Normalize's and Loudness's gains as measured here.
   */
  async play(r: SoundRecipe, get: Get, R: number, o: PlayOptions, gains: Record<string, number>) {
    this.stop();
    const ctx = this.context();
    await ctx.resume().catch(() => {});
    const L = soundLength(r);
    const end = Math.min(L, o.to ?? L);
    const rate = o.rate && Math.abs(o.rate) !== 1 ? Math.max(-8, Math.min(8, o.rate)) : (o.rate ?? 1) < 0 ? -1 : 1;
    const back = rate < 0;
    const speed = Math.abs(rate);
    // Shuttling plays straight through, once.
    const loop = rate === 1 && o.loop && o.loop[1] - o.loop[0] > 0.05 ? o.loop : null;
    let t = Math.max(0, Math.min(o.from, loop ? loop[1] : end));
    if (!loop && (back ? t <= 0.01 : t >= end - 0.01)) return;
    const master = ctx.createGain();
    const mix = ctx.createGain();
    const stages: Stage[] = [];
    const byId = new Map<string, Stage>();
    const keep: AudioNode[] = [master, mix];
    // The whole sound's effects, after the tracks are mixed.
    let cur: AudioNode = mix;
    for (const e of activeEffects(r, null)) {
      const s = stageOf(ctx, e, e.range ?? [0, L], gains[e.id]);
      if (!s) continue;
      cur.connect(s.input);
      cur = s.output;
      stages.push(s);
      byId.set(e.id, s);
    }
    cur.connect(master);
    master.connect(ctx.destination);
    // The meter: each side's peak, and the loudness (roughly weighted as people hear it).
    const split = ctx.createChannelSplitter(2);
    master.connect(split);
    this.analysers = [0, 1].map((c) => {
      const an = ctx.createAnalyser();
      an.fftSize = 2048;
      split.connect(an, c);
      return an;
    });
    const shelf = ctx.createBiquadFilter();
    shelf.type = 'highshelf';
    shelf.frequency.value = 1681;
    shelf.gain.value = 4;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 38;
    hp.Q.value = -3.0103;
    const ksplit = ctx.createChannelSplitter(2);
    master.connect(shelf).connect(hp).connect(ksplit);
    this.kAnalysers = [0, 1].map((c) => {
      const an = ctx.createAnalyser();
      an.fftSize = 32768;
      ksplit.connect(an, c);
      return an;
    });
    this.held = [-Infinity, -Infinity];
    // Each track: its rendered sound, its own effects, its volume and pan.
    const tracks = audibleTracks(r).filter((x) => x.clips.length);
    const ins = new Map<string, AudioNode>();
    const trackNodes = new Map<string, { vol: GainNode; pan: StereoPannerNode }>();
    for (const tr of tracks) {
      const input = ctx.createGain();
      let tc: AudioNode = input;
      for (const e of activeEffects(r, tr.id)) {
        const s = stageOf(ctx, e, e.range ?? [0, L], gains[e.id]);
        if (!s) continue;
        tc.connect(s.input);
        tc = s.output;
        stages.push(s);
        byId.set(e.id, s);
      }
      const vol = ctx.createGain();
      vol.gain.value = dbGain(tr.volume ?? 0);
      const pan = ctx.createStereoPanner();
      pan.pan.value = tr.pan ?? 0;
      tc.connect(vol).connect(pan).connect(mix);
      trackNodes.set(tr.id, { vol, pan });
      ins.set(tr.id, input);
      keep.push(input, vol, pan);
    }
    const fx = new Map(tracks.map((x) => [x.id, timeEffects(r, x)]));
    let c = ctx.currentTime + 0.08;
    this.segs = [];
    const segStart = (t0: number, t1: number, c0: number) => {
      this.segs.push({ c: c0, t: t0, t1, k: rate });
      if (this.segs.length > 8) this.segs.shift();
      for (const s of stages) s.at(t0, t1, c0, rate);
    };
    let segEnd = loop ? loop[1] : back ? 0 : end;
    if (loop && (t < loop[0] || t >= loop[1])) t = loop[0];
    segStart(t, segEnd, c);
    const sources: AudioBufferSourceNode[] = [];
    let ended = false;
    const pump = () => {
      while (!ended && c < ctx.currentTime + AHEAD) {
        if (back ? t <= segEnd + 1e-6 : t >= segEnd - 1e-6) {
          if (!loop) {
            ended = true;
            const at = c;
            const left = Math.max(0, at - ctx.currentTime);
            const timer = setTimeout(() => {
              if (this.stopFn === stopper) {
                this.stop();
                this.onEnd?.();
              }
            }, left * 1000 + 60);
            timers.push(timer);
            break;
          }
          t = loop[0];
          segEnd = loop[1];
          segStart(t, segEnd, c);
        }
        // A chunk of the timeline (more of it the faster it plays), going back from `t` when playing backwards.
        const len = back ? Math.min(CHUNK * speed, t - segEnd) : Math.min(CHUNK * speed, segEnd - t);
        const n = Math.max(1, Math.round(len * R));
        for (const tr of tracks) {
          const x = renderTrack(tr, fx.get(tr.id) ?? [], back ? t - n / R : t, n, R, get);
          if (back) {
            x[0].reverse();
            x[1].reverse();
          }
          let silent = true;
          for (let i = 0; i < n && silent; i += 64) if (x[0][i] !== 0 || x[1][i] !== 0) silent = false;
          if (silent) continue;
          const buf = ctx.createBuffer(2, n, R);
          buf.copyToChannel(x[0] as Float32Array<ArrayBuffer>, 0);
          buf.copyToChannel(x[1] as Float32Array<ArrayBuffer>, 1);
          const s = ctx.createBufferSource();
          s.buffer = buf;
          if (speed !== 1) s.playbackRate.value = speed;
          s.connect(ins.get(tr.id)!);
          s.start(c);
          sources.push(s);
          s.onended = () => sources.splice(sources.indexOf(s), 1);
        }
        t += (back ? -n : n) / R;
        c += n / R / speed;
      }
    };
    const timers: ReturnType<typeof setTimeout>[] = [];
    pump();
    const iv = setInterval(pump, 100);
    const stopper = () => {
      clearInterval(iv);
      for (const x of timers) clearTimeout(x);
      for (const s of [...sources]) {
        try {
          s.stop();
        } catch {}
      }
      try {
        master.disconnect();
        mix.disconnect();
        for (const n of ins.values()) n.disconnect();
      } catch {}
      this.analysers = [];
      this.kAnalysers = [];
    };
    this.stopFn = stopper;
    this.playing = true;
    this.live = { r, stages: byId, tracks: trackNodes, gains };
  }

  /** The meter's levels now, in dB (−∞ when nothing plays). */
  levels(): Levels {
    const peak: [number, number] = [-Infinity, -Infinity];
    const buf = new Float32Array(2048);
    this.analysers.forEach((an, c) => {
      an.getFloatTimeDomainData(buf);
      let m = 0;
      for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i]));
      peak[c] = m > 0 ? 20 * Math.log10(m) : -Infinity;
    });
    const now = performance.now();
    if (now - this.heldAt > 1500) this.held = [-Infinity, -Infinity];
    for (const c of [0, 1])
      if (peak[c] >= this.held[c]) {
        this.held[c] = peak[c];
        this.heldAt = now;
      }
    let ms = 0;
    if (this.kAnalysers.length && this.ctx) {
      const n = Math.min(32768, Math.round(this.ctx.sampleRate * 0.4));
      const k = new Float32Array(32768);
      for (const an of this.kAnalysers) {
        an.getFloatTimeDomainData(k);
        let s = 0;
        for (let i = k.length - n; i < k.length; i++) s += k[i] * k[i];
        ms += s / n;
      }
    }
    return { peak, hold: [...this.held] as [number, number], lufs: ms > 0 ? -0.691 + 10 * Math.log10(ms) : -Infinity };
  }

  close() {
    this.stop();
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
