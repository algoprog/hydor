// Script tests for the sound editor's engine in the browser, the parts that are plain numbers: a sound's loudness at
// every scale, a track rendered from its clips (to the sample, at its gain and fades), reversed and pitched parts, a
// clip at a speed keeping its pitch, and the measuring Normalize and Loudness hear while editing.
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/mediaedit/audio/engine-test.ts && node dist/dev/engine-test.js
import './engine-test-env';
import assert from 'node:assert/strict';
import type { SoundRecipe, SoundTrack } from '@shared/mediaedit-audio';
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

console.log(`${passed} passed${process.exitCode ? ', some failed' : ''}`);
