// Script tests for the sound editor's engine in the browser, the parts that are plain numbers: a sound's loudness at
// every scale, a track rendered from its clips (to the sample, at its gain and fades), reversed and pitched parts, a
// clip at a speed keeping its pitch, and the measuring Normalize and Loudness hear while editing.
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/mediaedit/audio/engine-test.ts && node dist/dev/engine-test.js
import './engine-test-env';
import assert from 'node:assert/strict';
import type { SoundRecipe, SoundTrack } from '@shared/mediaedit-audio';
import { cleanTempo, gridLines, gridStep, hop, nearestGrid, snapPointsOf, snapTime, zeroCrossing, zeroOnTrack } from './snap';
import { makePeaks, measure, minMax, renderClips, renderTrack, timeEffects, type Decoded } from './engine';

let passed = 0;
const test = (name: string, f: () => void) => {
  try {
    f();
    passed++;
  } catch (e) {
    console.log(`FAIL ${name}: ${(e as Error).message}`);
    process.exitCode = 1;
  }
};

const R = 8000;
const sine = (hz: number, seconds: number, amp = 1) => Float32Array.from({ length: Math.round(seconds * R) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / R));
const sound = (ch: Float32Array[]): Decoded => ({ rate: R, ch, duration: ch[0].length / R, peaks: makePeaks(ch) });
/** How many times a signal crosses zero going up, a second (its pitch, for a plain tone). */
const pitchOf = (x: Float32Array) => {
  let n = 0;
  for (let i = 1; i < x.length; i++) if (x[i - 1] < 0 && x[i] >= 0) n++;
  return n / (x.length / R);
};
const ramp = Float32Array.from({ length: 4 * R }, (_, i) => (i % 1000) / 1000 - 0.5);
const src = sound([ramp, ramp.map((v) => -v)]);
const get = (s: string) => (s === '' ? src : undefined);
const track = (clips: SoundTrack['clips']): SoundTrack => ({ id: 't', clips });

test('a sound’s lowest and highest, at any scale, as sample by sample', () => {
  for (const [a, b] of [
    [0, 10],
    [5, 3000],
    [1234, 20000],
    [0, ramp.length],
  ]) {
    let lo = 1;
    let hi = -1;
    for (let i = a; i < b; i++) [lo, hi] = [Math.min(lo, ramp[i]), Math.max(hi, ramp[i])];
    assert.deepEqual(minMax(src, 0, a, b), [lo, hi]);
  }
});

test('a clip renders its part of its sound, to the sample, silence around it', () => {
  const out = renderClips(track([{ id: 'c', src: '', at: 1, from: 0.5, to: 1.5 }]), 0, 3 * R, R, get);
  for (let i = 0; i < R; i++) assert.equal(out[0][i], 0);
  for (let i = 0; i < R; i++) assert.ok(Math.abs(out[0][R + i] - ramp[R / 2 + i]) < 1e-6, `sample ${i}`);
  for (let i = 0; i < R; i++) assert.ok(Math.abs(out[1][R + i] + ramp[R / 2 + i]) < 1e-6);
  for (let i = 2 * R; i < 3 * R; i++) assert.equal(out[0][i], 0);
});

test('its gain and fades', () => {
  const g = renderClips(track([{ id: 'c', src: '', at: 0, from: 0, to: 1, gain: -6 }]), 0, R, R, get);
  assert.ok(Math.abs(g[0][500] - ramp[500] * Math.pow(10, -6 / 20)) < 1e-6);
  const f = renderClips(track([{ id: 'c', src: '', at: 0, from: 0, to: 2, fadeIn: 1, fadeOut: 0.5 }]), 0, 2 * R, R, get);
  assert.ok(Math.abs(f[0][R / 2] - ramp[R / 2] * 0.5) < 1e-3, 'halfway into the fade in');
  assert.ok(Math.abs(f[0][Math.round(1.75 * R)] - ramp[Math.round(1.75 * R)] * 0.5) < 1e-3, 'halfway into the fade out');
});

test('rendered a part at a time, it is the same as at once', () => {
  const t = track([
    { id: 'a', src: '', at: 0.3, from: 0, to: 1.2 },
    { id: 'b', src: '', at: 1.5, from: 2, to: 3 },
  ]);
  const whole = renderClips(t, 0, 3 * R, R, get);
  for (let s = 0; s < 3 * R; s += 1000) {
    const part = renderClips(t, s / R, 1000, R, get);
    for (let i = 0; i < 1000; i++) assert.ok(Math.abs(part[0][i] - whole[0][s + i]) < 1e-6);
  }
});

test('a reversed part plays its samples backwards', () => {
  const t = track([{ id: 'c', src: '', at: 0, from: 0, to: 3 }]);
  const r: SoundRecipe = { tracks: [t], effects: [{ id: 'r', type: 'reverse', track: 't', range: [1, 2] }] };
  const out = renderTrack(t, timeEffects(r, t), 0, 3 * R, R, get);
  assert.ok(Math.abs(out[0][R / 2] - ramp[R / 2]) < 1e-6, 'before it, as it was');
  for (const i of [0, 100, 4000, 7999]) assert.ok(Math.abs(out[0][R + i] - ramp[2 * R - 1 - i]) < 1e-3, `sample ${i}`);
});

test('a clip twice as fast keeps its pitch, and is half as long', () => {
  const tone = sound([sine(200, 4)]);
  const t = track([{ id: 'c', src: '', at: 0, from: 0, to: 4, speed: 2 }]);
  const out = renderClips(t, 0, 2 * R, R, () => tone);
  assert.ok(Math.abs(pitchOf(out[0].subarray(800, 15000)) - 200) < 12, `pitch ${pitchOf(out[0])}`);
  const after = renderClips(t, 2.05, R, R, () => tone);
  assert.ok(after[0].every((v) => v === 0), 'nothing after it');
});

test('a part an octave higher, its length kept', () => {
  const tone = sound([sine(200, 3)]);
  const t = track([{ id: 'c', src: '', at: 0, from: 0, to: 3 }]);
  const r: SoundRecipe = { tracks: [t], effects: [{ id: 'p', type: 'pitch', track: 't', p: { semitones: 12 } }] };
  const out = renderTrack(t, timeEffects(r, t), 0.5, 2 * R, R, () => tone);
  assert.ok(Math.abs(pitchOf(out[0]) - 400) < 25, `pitch ${pitchOf(out[0])}`);
});

test('measured as Normalize and Loudness hear it', () => {
  const tone = sound([sine(500, 2, 0.5), sine(500, 2, 0.5)]);
  const t = track([{ id: 'c', src: '', at: 0, from: 0, to: 2 }]);
  const m = measure([t], { tracks: [t] }, 0, 2, () => tone, R);
  assert.ok(Math.abs(m.peak - -6.02) < 0.2, `peak ${m.peak}`);
  assert.ok(Math.abs(m.lufs - (-0.691 + 10 * Math.log10(0.25))) < 0.3, `loudness ${m.lufs}`);
});

test('a volume line and smooth fades are heard as they are drawn', () => {
  // Down to silence in the middle, back up at the end (straight lines, to the sample).
  const e = renderClips(track([{ id: 'c', src: '', at: 0, from: 0, to: 2, env: [{ t: 0, v: 1 }, { t: 1, v: 0 }, { t: 2, v: 1 }] }]), 0, 2 * R, R, get);
  assert.ok(Math.abs(e[0][R / 2] - ramp[R / 2] * 0.5) < 1e-3, 'halfway down');
  assert.ok(Math.abs(e[0][R]) < 1e-3, 'silent at the bottom');
  assert.ok(Math.abs(e[0][Math.round(1.5 * R)] - ramp[Math.round(1.5 * R)] * 0.5) < 1e-3, 'halfway back up');
  // Its first and last volumes are kept beyond its points.
  const k = renderClips(track([{ id: 'c', src: '', at: 0, from: 0, to: 2, env: [{ t: 0.5, v: 0.5 }] }]), 0, 2 * R, R, get);
  assert.ok(Math.abs(k[0][100] - ramp[100] * 0.5) < 1e-6 && Math.abs(k[0][R + 100] - ramp[R + 100] * 0.5) < 1e-6, 'one point: a steady volume');
  // A smooth fade is a half sine: a quarter of the way in, 0.146 of the volume, not 0.25.
  const f = renderClips(track([{ id: 'c', src: '', at: 0, from: 0, to: 2, fadeIn: 1, fadeSmooth: true }]), 0, 2 * R, R, get);
  assert.ok(Math.abs(f[0][R / 4] - ramp[R / 4] * (0.5 - 0.5 * Math.cos(Math.PI / 4))) < 1e-3, 'smooth, a quarter in');
  assert.ok(Math.abs(f[0][R / 2] - ramp[R / 2] * 0.5) < 1e-3, 'halfway, as a straight fade');
});

test('the nearest zero crossing', () => {
  const x = sine(100, 1);
  // A 100 Hz sine at 8 kHz crosses zero every 40 samples (5 ms).
  const t = zeroCrossing([x], R, 0.0123, 0.01);
  assert.ok(Math.abs(t * 100 * 2 - Math.round(t * 100 * 2)) < 0.05, `at a crossing: ${t}`);
  assert.ok(Math.abs(t - 0.0123) <= 0.0026, `the nearest: ${t}`);
  assert.equal(zeroCrossing([x], R, 0.0123, 0.0001), 0.0123, 'none within the window: where it was');
  assert.equal(zeroCrossing([Float32Array.from({ length: 100 }, () => 0.5)], R, 0.005, 0.005), 0.005, 'a wave that never crosses');
  // Both channels together: left alone crosses, but together they do not.
  const both = zeroCrossing([Float32Array.from([1, 1, -1, -1]), Float32Array.from([1, 1, 3, 3])], 1, 2, 2);
  assert.equal(both, 2, 'the channels averaged');
  assert.equal(zeroCrossing([x], R, 0, 0.01) , 0, 'at the very start');
});

test('the zero crossing of what a track plays, on its clip, at its speed', () => {
  const x = sine(100, 2);
  const d = { ch: [x], rate: R };
  const t = track([{ id: 'c', src: '', at: 10, from: 0, to: 2 }]);
  const z = zeroOnTrack(t, () => d, 10.0123, 0.01);
  // The clip starts at 10 s, so the crossings are 5 ms apart from there.
  assert.ok(Math.abs((z - 10) * 200 - Math.round((z - 10) * 200)) < 0.05 && Math.abs(z - 10.0123) <= 0.0026, `at ${z}`);
  assert.equal(zeroOnTrack(t, () => d, 5, 0.01), 5, 'no clip there: where it was');
  assert.equal(zeroOnTrack(t, () => undefined, 10.0123, 0.01), 10.0123, 'its sound not read yet');
  const fast = track([{ id: 'c', src: '', at: 0, from: 0, to: 2, speed: 2 }]);
  const zf = zeroOnTrack(fast, () => d, 0.3, 0.01);
  assert.ok(Math.abs(zf * 2 * 200 - Math.round(zf * 2 * 200)) < 0.05, `at twice the speed ${zf}`);
});

test('the grid', () => {
  assert.deepEqual(gridStep({ kind: 'off' }, 100), null);
  // Lines never closer than 28 pixels: at 100 px a second, a line every 0.5 s.
  assert.deepEqual(gridStep({ kind: 'seconds' }, 100), { step: 0.5, every: 10 });
  assert.deepEqual(gridStep({ kind: 'seconds' }, 10), { step: 5, every: 5 });
  // At 120 beats a minute a beat is half a second: 100 px a second keeps a line a beat; zoomed out they join, zoomed in they split.
  assert.deepEqual(gridStep({ kind: 'beats', bpm: 120 }, 100), { step: 0.5, every: 4 });
  assert.deepEqual(gridStep({ kind: 'beats', bpm: 120 }, 400), { step: 0.125, every: 16 });
  assert.deepEqual(gridStep({ kind: 'beats', bpm: 120 }, 20), { step: 2, every: 1 });
  assert.equal(cleanTempo(5), 30);
  assert.equal(cleanTempo(NaN), 120);
  const lines = gridLines({ kind: 'beats', bpm: 120 }, 100, 1, 3);
  assert.deepEqual(lines.map((l) => l.t).slice(0, 5), [1, 1.5, 2, 2.5, 3]);
  assert.deepEqual(lines.filter((l) => l.major).map((l) => l.t), [2]);
  assert.equal(nearestGrid({ kind: 'beats', bpm: 120 }, 100, 1.4), 1.5);
  assert.equal(nearestGrid({ kind: 'off' }, 100, 1.4), null);
});

test('where a drag lands: a point, then the grid, then a zero crossing', () => {
  const o = { on: true, tol: 0.05, points: [0, 2, 5] };
  assert.equal(snapTime(2.03, o), 2, 'a clip’s edge');
  assert.equal(snapTime(2.2, o), 2.2, 'nothing near');
  assert.equal(snapTime(2.03, { ...o, except: [2] }), 2.03, 'not to where it is now');
  assert.equal(snapTime(3.02, { ...o, grid: { t: 3 } }), 3, 'the grid');
  assert.equal(snapTime(2.03, { ...o, grid: { t: 2.01 } }), 2, 'a point before the grid');
  assert.equal(snapTime(3.02, { ...o, zero: (t) => t + 0.001 }), 3.021, 'a zero crossing when nothing else is near');
  assert.equal(snapTime(2.03, { ...o, zero: () => 9 }), 2, 'not to a crossing from a point');
  assert.equal(snapTime(2.03, { ...o, on: false }), 2.03, 'snapping off');
  assert.equal(snapTime(2.03, { ...o, on: false, zero: () => 2.04 }), 2.04, 'the crossing does not need snapping on');
  const r: SoundRecipe = { tracks: [{ id: 'a', clips: [{ id: '1', src: '', at: 1, from: 0, to: 2 }] }, { id: 'b', clips: [{ id: '2', src: '', at: 4, from: 0, to: 1 }] }] };
  assert.deepEqual([...new Set(snapPointsOf(r, 2.5, [7], { a: 1.5, b: 2 }))].sort((a, b) => a - b), [0, 1, 1.5, 2, 2.5, 3, 4, 5, 7]);
});

test('hopping to the next marker or clip edge', () => {
  const r: SoundRecipe = { tracks: [{ id: 'a', clips: [{ id: '1', src: '', at: 1, from: 0, to: 2 }] }, { id: 'b', clips: [{ id: '2', src: '', at: 4, from: 0, to: 1 }] }] };
  assert.equal(hop(r, [6], 0, 1, 7), 1);
  assert.equal(hop(r, [6], 1, 1, 7), 3);
  assert.equal(hop(r, [6], 5, 1, 7), 6);
  assert.equal(hop(r, [6], 7, 1, 7), null);
  assert.equal(hop(r, [6], 4.5, -1, 7), 4);
  assert.equal(hop(r, [6], 0, -1, 7), null);
});

console.log(`${passed} passed${process.exitCode ? ', some failed' : ''}`);
