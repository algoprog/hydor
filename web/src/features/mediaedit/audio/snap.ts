// How the sound editor's edges find their place, as plain numbers (so they are tested without a browser): the nearest
// zero crossing of a waveform (cutting where the wave passes through silence does not click), a time grid (every so
// many seconds, or every beat at a tempo, its lines for the lanes to draw and for a drag to snap to), the moments a
// drag snaps to, and the hop to the previous or next marker or clip edge.
import { clipEnd, sourceTime, timelineTime, type SoundRecipe, type SoundTrack } from '@shared/mediaedit-audio';

// ---- zero crossings ------------------------------------------------------------------------------------------------

/**
 * The moment nearest `t` (seconds of the sound) within `window` seconds either way where the wave crosses zero (both
 * channels together), or `t` when it does not. Of the two samples either side of a crossing, the one nearer zero.
 */
export function zeroCrossing(ch: ArrayLike<number>[], rate: number, t: number, window: number): number {
  if (!ch.length || !(rate > 0)) return t;
  const n = ch[0].length;
  const at = (i: number) => {
    if (i < 0 || i >= n) return 0;
    let s = 0;
    for (const c of ch) s += c[i] ?? 0;
    return s / ch.length;
  };
  const i0 = Math.round(t * rate);
  const reach = Math.max(1, Math.round(window * rate));
  /** The sample next to a crossing between `i - 1` and `i`, or -1. */
  const crossing = (i: number) => {
    if (i < 1 || i >= n) return -1;
    const a = at(i - 1);
    const b = at(i);
    if (a === 0) return i - 1;
    if ((a < 0 && b >= 0) || (a > 0 && b <= 0)) return Math.abs(a) <= Math.abs(b) ? i - 1 : i;
    return -1;
  };
  for (let d = 0; d <= reach; d++) {
    const up = crossing(i0 + d);
    const down = d ? crossing(i0 - d) : -1;
    if (up >= 0 && down >= 0) return (Math.abs(up - i0) <= Math.abs(down - i0) ? up : down) / rate;
    if (up >= 0) return up / rate;
    if (down >= 0) return down / rate;
  }
  return t;
}

/**
 * The nearest zero crossing of what a track plays at `t` (seconds of the timeline), within `window` seconds, on the clip
 * that is there (at its speed): `t` when no clip is there, its sound is not read yet or the wave does not cross.
 */
export function zeroOnTrack(track: SoundTrack, get: (src: string) => { ch: ArrayLike<number>[]; rate: number } | undefined, t: number, window: number): number {
  const c = track.clips.find((x) => t >= x.at && t <= clipEnd(x));
  const d = c && get(c.src);
  if (!c || !d) return t;
  const z = zeroCrossing(d.ch, d.rate, sourceTime(c, t), window * (c.speed ?? 1));
  return Math.min(clipEnd(c), Math.max(c.at, timelineTime(c, z)));
}

// ---- the grid -------------------------------------------------------------------------------------------------------

/** No grid, lines at whole seconds (finer as the view is zoomed in), or at every beat of a tempo (beats a minute). */
export type Grid = { kind: 'off' } | { kind: 'seconds' } | { kind: 'beats'; bpm: number };

export const TEMPO = { min: 30, max: 300, default: 120 };

/** A tempo made one a grid may have (a whole number of beats a minute, in range). */
export const cleanTempo = (v: number) => Math.round(Math.min(TEMPO.max, Math.max(TEMPO.min, Number.isFinite(v) ? v : TEMPO.default)));

const SECOND_STEPS = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];

/**
 * The distance between a grid's lines, in seconds, and how many of them make a heavier line (a bar of four beats), for a
 * view of `pps` pixels a second: lines never closer than about 28 pixels. Beats are halved (and halved again) when
 * there is room and joined into two, four… beats when there is not.
 */
export function gridStep(g: Grid, pps: number): { step: number; every: number } | null {
  if (g.kind === 'off' || !(pps > 0)) return null;
  const min = 28 / pps;
  if (g.kind === 'seconds') {
    const step = SECOND_STEPS.find((s) => s >= min) ?? 3600;
    return { step, every: step < 1 ? 10 : 5 };
  }
  const beat = 60 / cleanTempo(g.bpm);
  const mult = [0.125, 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256].find((m) => m * beat >= min) ?? 256;
  return { step: mult * beat, every: Math.max(1, Math.round(4 / mult)) };
}

/** The grid's lines from `t0` to `t1` (seconds), each with whether it is a heavier one. */
export function gridLines(g: Grid, pps: number, t0: number, t1: number): { t: number; major: boolean }[] {
  const s = gridStep(g, pps);
  if (!s) return [];
  const out: { t: number; major: boolean }[] = [];
  const first = Math.max(0, Math.floor(t0 / s.step));
  for (let i = first; i * s.step <= t1 + s.step && out.length < 2000; i++) out.push({ t: i * s.step, major: i % s.every === 0 });
  return out;
}

/** The grid line nearest `t` (null with no grid). */
export function nearestGrid(g: Grid, pps: number, t: number): number | null {
  const s = gridStep(g, pps);
  if (!s) return null;
  return Math.max(0, Math.round(t / s.step) * s.step);
}

// ---- where a drag lands --------------------------------------------------------------------------------------------

export interface SnapOptions {
  /** On and off: what to snap to is the clips' edges, the markers, the playhead, the part picked, and the grid. */
  on: boolean;
  points: number[];
  /** How near, in seconds (a few pixels). */
  tol: number;
  grid?: { t: number } | null;
  /** The nearest zero crossing of what is cut, for a part's edge or a split (null: none to find). */
  zero?: ((t: number) => number) | null;
  /** Moments left out (the ones the dragged thing is at now). */
  except?: number[];
}

/**
 * Where `t` lands: on the nearest point (a clip's edge, a marker…) within `tol`; else on the grid line within `tol`; else
 * (for an edge of a part picked, or a split, `zero` given) on the nearest zero crossing. Left where it is when nothing is near.
 */
export function snapTime(t: number, o: SnapOptions): number {
  if (o.on) {
    let best = t;
    let d = o.tol;
    for (const s of o.points) if (!o.except?.includes(s) && Math.abs(s - t) < d) [best, d] = [s, Math.abs(s - t)];
    if (best !== t) return best;
    if (o.grid && Math.abs(o.grid.t - t) < o.tol) return o.grid.t;
  }
  return o.zero ? o.zero(t) : t;
}

/** The moments a drag snaps to: the timeline's start, the playhead, the markers, the ends of clips and the part picked. */
export function snapPointsOf(r: SoundRecipe, playhead: number, markers: number[], sel: { a: number; b: number } | null): number[] {
  const out = [0, playhead, ...markers];
  for (const t of r.tracks) for (const c of t.clips) out.push(c.at, clipEnd(c));
  if (sel) out.push(sel.a, sel.b);
  return out;
}

/** The marker or clip edge before (`dir` −1) or after (1) `t`, or null when there is none that way. */
export function hop(r: SoundRecipe, markers: number[], t: number, dir: -1 | 1, length: number): number | null {
  const all = new Set<number>([0, length, ...markers]);
  for (const tr of r.tracks) for (const c of tr.clips) (all.add(c.at), all.add(clipEnd(c)));
  const eps = 1e-4;
  const list = [...all].filter((x) => (dir > 0 ? x > t + eps : x < t - eps));
  if (!list.length) return null;
  return dir > 0 ? Math.min(...list) : Math.max(...list);
}
