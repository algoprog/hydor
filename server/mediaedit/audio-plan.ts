// A sound's edit (shared/mediaedit-audio.ts) as one ffmpeg command: each track's clips cut from their sounds (each
// sound read once a track, from its first part used to its last, or again where a track goes back in it), played at
// their speed with their pitch kept, made louder or quieter and faded, laid end to end with silence between; then the
// track's effects in the rack's order, each on all of it or on its part of the timeline (cut out, changed and put back
// in place, its length kept to the sample); the track's volume and pan; the tracks mixed; the whole sound's effects;
// and the file written (MP3, M4A, Ogg Opus, WAV or FLAC), mono or stereo. Normalize and Loudness need to know how loud
// what comes to them is: a pass that ends there measures it first (`measure`), and the gain it finds is given back in
// `gains`. Pure: it only plans (audio.ts runs it), so it can be tested without ffmpeg.
//
// The filter graph is built from parts and checked before it runs: only the filters below, values that are numbers,
// times, gains and pan matrices, nothing that could close a quote or start another filter. The command reads only the
// sounds it was given and the reverb's room (a file the job wrote), and writes only its output.
import path from 'node:path';
import {
  activeEffects,
  audibleTracks,
  clipEnd,
  clipLength,
  echoTaps,
  effectParams,
  panMatrix,
  roomResponse,
  soundLength,
  type SoundEffect,
  type SoundOutput,
  type SoundRecipe,
  type SoundTrack,
} from '../../shared/mediaedit-audio.ts';
import { n, tempos } from './video-plan.ts';

/** The filters a sound's edit uses: none that reads a file or an address, runs commands, or listens for them. */
export const SOUND_FILTERS = new Set([
  'atrim',
  'asetpts',
  'aresample',
  'aformat',
  'pan',
  'concat',
  'asplit',
  'amix',
  'volume',
  'afade',
  'apad',
  'anullsrc',
  'areverse',
  'atempo',
  'asetrate',
  'rubberband',
  'afftdn',
  'highpass',
  'lowpass',
  'lowshelf',
  'highshelf',
  'equalizer',
  'acompressor',
  'alimiter',
  'aecho',
  'afir',
  'anull',
  'ebur128',
]);

type Value = string | number;

export interface AFilter {
  name: string;
  args?: [string, Value][];
  /** A value without a name (pan's channels: "stereo|c0=1*c0|c1=1*c1"). */
  pos?: string;
}

export interface AChain {
  ins: string[];
  filters: AFilter[];
  outs: string[];
}

const LABEL = /^(?:\d{1,3}:a|[a-z][a-z0-9_]{0,23})$/;
const KEY = /^[a-z_]{1,20}$/;
/** Numbers, times, flags and lists of numbers; nothing that closes a quote or starts a filter. */
const PLAIN = /^[A-Za-z0-9_.+\-|' ]{0,240}$/;
/** pan's channels: a layout and, for each channel, a sum of the input's channels each times a number. */
const PAN = /^(?:mono|stereo)(?:\|c[01]=-?\d+(?:\.\d+)?\*c[01](?:\+-?\d+(?:\.\d+)?\*c[01])*)+$/;

/** Throws when a chain is not one the plan may run. */
export function checkAudioChain(c: AChain): void {
  for (const l of [...c.ins, ...c.outs]) if (!LABEL.test(l)) throw new Error(`A label the plan may not use: ${l}`);
  if (!c.filters.length) throw new Error('A chain without filters');
  for (const f of c.filters) {
    if (!SOUND_FILTERS.has(f.name)) throw new Error(`A filter the plan may not use: ${f.name}`);
    if (f.pos !== undefined && (f.name !== 'pan' || !PAN.test(f.pos))) throw new Error(`${f.name} has a value the plan may not use`);
    for (const [k, v] of f.args ?? []) {
      if (!KEY.test(k)) throw new Error(`An option the plan may not use: ${k}`);
      if (typeof v === 'number') {
        if (!Number.isFinite(v)) throw new Error(`${f.name} ${k} is not a number`);
      } else if (!PLAIN.test(v) || (v.includes("'") && !/^'[0-9. ]+'$/.test(v))) throw new Error(`${f.name} ${k} has a value the plan may not use`);
    }
  }
}

const val = (v: Value) => (typeof v === 'number' ? n(v, 6) : v);

/** The filter graph's text, its chains checked first. */
export function audioGraphText(chains: AChain[]): string {
  return chains
    .map((c) => {
      checkAudioChain(c);
      const fs = c.filters.map((f) => (f.pos !== undefined ? `${f.name}=${f.pos}` : f.args?.length ? `${f.name}=${f.args.map(([k, v]) => `${k}=${val(v)}`).join(':')}` : f.name)).join(',');
      return `${c.ins.map((l) => `[${l}]`).join('')}${fs}${c.outs.map((l) => `[${l}]`).join('')}`;
    })
    .join(';');
}

// ---- what ffmpeg is asked for ------------------------------------------------------------------------------------

/** A sound the plan reads: its file, its length, samples a second and channels. */
export interface PlanSource {
  file: string;
  duration: number;
  rate: number;
  channels: number;
}

/** What this ffmpeg can do, asked once (audio.ts). */
export interface SoundCaps {
  rubberband: boolean;
  /** How afir is told not to change the room's loudness: irnorm=-1 (newer), gtype=none (older). */
  afirPlain: 'irnorm' | 'gtype' | null;
  /** alimiter keeps the sound in time (it waits for its look-ahead otherwise). */
  limiterLatency: boolean;
  encoders: { mp3: boolean; aac: boolean; opus: boolean; vorbis: boolean; flac: boolean };
}

export interface SoundPlanInput {
  recipe: SoundRecipe;
  /** The sounds the clips play, by their src ("" the one being edited). */
  sources: Map<string, PlanSource>;
  out: SoundOutput;
  /** The job's folder (the command runs there, and the rooms' files are written there). */
  dir: string;
  /** Where it is written (in the job's folder). */
  output: string;
  caps: SoundCaps;
  /** Normalize and Loudness: the gain each was measured to need, in dB, by the effect's id. */
  gains?: Record<string, number>;
  /** Loudness effects whose peaks would go over −1 dB with their gain: a limiter goes after them. */
  limit?: string[];
  /** A pass that measures: it ends where this effect takes the sound in, and measures what comes to it. */
  measure?: string;
}

export interface SoundPlan {
  args: string[];
  inputs: string[];
  /** Where it writes; "-" for a pass that only measures. */
  output: string;
  /** Files to write in the job's folder first (the rooms), by name. */
  files: Record<string, Buffer>;
  /** How long what it goes through is, in seconds (what progress is counted against). */
  seconds: number;
  graph: string;
  rate: number;
  channels: 1 | 2;
}

/** The rate the edit is made at: as asked, else the sound's own (8 to 48 kHz); Opus only at its own rates. */
export function workingRate(sources: Map<string, PlanSource>, out: SoundOutput): number {
  const main = sources.get('')?.rate ?? [...sources.values()][0]?.rate ?? 48_000;
  let r = out.rate ?? main;
  r = Math.round(Math.min(48_000, Math.max(8_000, r)));
  if (out.format === 'ogg' && ![48_000, 24_000, 16_000, 12_000, 8_000].includes(r)) r = r > 24_000 ? 48_000 : r > 16_000 ? 24_000 : 16_000;
  return r;
}

/** The channels the result has: as asked, else stereo when any sound heard is (or a pan or a reverb makes it so). */
export function outChannels(r: SoundRecipe, sources: Map<string, PlanSource>, out: SoundOutput): 1 | 2 {
  if (out.channels) return out.channels;
  const tracks = audibleTracks(r);
  if (tracks.some((t) => t.clips.some((c) => (sources.get(c.src)?.channels ?? 2) > 1))) return 2;
  if (tracks.some((t) => t.pan)) return 2;
  if ((r.effects ?? []).some((e) => !e.bypass && (e.type === 'reverb' || e.type === 'echo'))) return 2;
  return 1;
}

/** A name for a room's file in the job's folder. */
export const roomFile = (room: number, rate: number) => `room${room}-${rate}.wav`;

/** A room's sound as a WAV file (32-bit float, stereo), for afir. */
export function roomWav(h: [Float32Array, Float32Array], rate: number): Buffer {
  const nb = h[0].length * 8;
  const b = Buffer.alloc(44 + nb);
  b.write('RIFF', 0, 'latin1');
  b.writeUInt32LE(36 + nb, 4);
  b.write('WAVEfmt ', 8, 'latin1');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(3, 20);
  b.writeUInt16LE(2, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 8, 28);
  b.writeUInt16LE(8, 32);
  b.writeUInt16LE(32, 34);
  b.write('data', 36, 'latin1');
  b.writeUInt32LE(nb, 40);
  for (let i = 0; i < h[0].length; i++) {
    b.writeFloatLE(h[0][i], 44 + i * 8);
    b.writeFloatLE(h[1][i], 48 + i * 8);
  }
  return b;
}

const panPos = (m: [number, number, number, number]) => {
  const term = (k: number, ch: string) => `${n(k, 6)}*${ch}`;
  const side = (a: number, b: number) => [a ? term(a, 'c0') : '', b ? term(b, 'c1') : ''].filter(Boolean).join('+') || '0*c0';
  return `stereo|c0=${side(m[0], m[1])}|c1=${side(m[2], m[3])}`;
};

/** "-3.5dB"-free: a gain in dB as volume takes it. */
const dbArg = (d: number) => `${n(d, 3)}dB`;

/** The filters of one effect (the gains found by measuring given), for a part `seconds` long. */
export function effectFilters(e: SoundEffect, o: { seconds: number; rate: number; ranged: boolean; caps: SoundCaps; gains?: Record<string, number>; limit?: string[]; room?: string }): AFilter[] {
  const p = effectParams(e);
  switch (e.type) {
    case 'gain':
      return [{ name: 'volume', args: [['volume', dbArg(p.db)]] }];
    case 'fadeIn':
    case 'fadeOut': {
      const d = Math.max(0.001, Math.min(o.seconds, o.ranged ? o.seconds : p.seconds));
      const st = e.type === 'fadeIn' ? 0 : Math.max(0, o.seconds - d);
      return [
        {
          name: 'afade',
          args: [
            ['t', e.type === 'fadeIn' ? 'in' : 'out'],
            ['st', st],
            ['d', d],
            ['curve', p.curve ? 'hsin' : 'tri'],
          ],
        },
      ];
    }
    case 'normalize':
    case 'loudness': {
      const g = o.gains?.[e.id];
      const out: AFilter[] = [];
      if (g !== undefined && Math.abs(g) >= 0.01) out.push({ name: 'volume', args: [['volume', dbArg(g)]] });
      if (e.type === 'loudness' && o.limit?.includes(e.id)) out.push(limiter(-1, 50, o.caps));
      return out.length ? out : [{ name: 'anull' }];
    }
    case 'denoise':
      return [
        {
          name: 'afftdn',
          args: [
            ['nr', p.amount],
            ['nf', -50],
            ['tn', 1],
          ],
        },
      ];
    case 'eq': {
      const out: AFilter[] = [];
      if (p.lowCut > 0) out.push(pass('highpass', p.lowCut));
      if (p.highCut > 0) out.push(pass('lowpass', Math.min(p.highCut, o.rate * 0.45)));
      if (p.bass) out.push(shelf('lowshelf', 100, p.bass));
      if (p.mid)
        out.push({
          name: 'equalizer',
          args: [
            ['f', 1500],
            ['t', 'q'],
            ['w', 0.8],
            ['g', p.mid],
          ],
        });
      if (p.treble) out.push(shelf('highshelf', Math.min(6000, o.rate * 0.4), p.treble));
      return out.length ? out : [{ name: 'anull' }];
    }
    case 'highpass':
      return [pass('highpass', p.hz)];
    case 'lowpass':
      return [pass('lowpass', Math.min(p.hz, o.rate * 0.45))];
    case 'compressor':
      return [
        {
          name: 'acompressor',
          args: [
            ['threshold', Math.max(0.000976563, Math.pow(10, p.threshold / 20))],
            ['ratio', p.ratio],
            ['attack', p.attack],
            ['release', p.release],
            ['makeup', Math.min(64, Math.max(1, Math.pow(10, p.makeup / 20)))],
            ['knee', 2.82843],
          ],
        },
      ];
    case 'limiter':
      return [limiter(p.ceiling, p.release, o.caps)];
    case 'pitch': {
      const k = Math.pow(2, p.semitones / 12);
      if (Math.abs(k - 1) < 0.0001) return [{ name: 'anull' }];
      if (o.caps.rubberband) return [{ name: 'rubberband', args: [['pitch', n(k, 6)]] }];
      // Played faster (higher), then slowed back to its length with its new pitch kept.
      return [{ name: 'asetrate', args: [['r', Math.round(o.rate * k)]] }, { name: 'aresample', args: [['osr', o.rate]] }, ...tempos(1 / k).map((x) => ({ name: 'atempo', args: [['tempo', n(x, 6)]] as [string, Value][] }))];
    }
    case 'reverse':
      return [{ name: 'areverse' }];
    case 'echo': {
      const taps = echoTaps(p.delay, p.decay);
      if (!taps.length) return [{ name: 'anull' }];
      return [
        {
          name: 'aecho',
          args: [
            ['in_gain', 1],
            ['out_gain', 1],
            ['delays', taps.map((t) => t.ms).join('|')],
            ['decays', taps.map((t) => n(t.gain, 4)).join('|')],
          ],
        },
      ];
    }
    case 'mono':
      return [{ name: 'pan', pos: 'stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1' }];
    case 'reverb':
      // Made in reverbChain (it takes the room as a second input).
      return [{ name: 'anull' }];
  }
}

const pass = (name: 'highpass' | 'lowpass', hz: number): AFilter => ({
  name,
  args: [
    ['f', Math.round(hz)],
    ['t', 'q'],
    ['w', 0.7071],
  ],
});
const shelf = (name: 'lowshelf' | 'highshelf', hz: number, g: number): AFilter => ({
  name,
  args: [
    ['f', Math.round(hz)],
    ['t', 's'],
    ['w', 1],
    ['g', g],
  ],
});
function limiter(ceiling: number, release: number, caps: SoundCaps): AFilter {
  return {
    name: 'alimiter',
    args: [
      ['limit', Math.min(1, Math.max(0.0625, Math.pow(10, ceiling / 20)))],
      ['attack', 5],
      ['release', release],
      ['level', 0],
      ['asc', 0],
      ...(caps.limiterLatency ? ([['latency', 1]] as [string, Value][]) : []),
    ],
  };
}

const FMT = (rate: number): AFilter => ({
  name: 'aformat',
  args: [
    ['sample_fmts', 'fltp'],
    ['sample_rates', rate],
    ['channel_layouts', 'stereo'],
  ],
});
/** Exactly `samples` long: padded with silence, or cut. */
const exact = (samples: number): AFilter[] => [
  { name: 'apad', args: [['whole_len', samples]] },
  { name: 'atrim', args: [['end_sample', samples]] },
];

/** The ffmpeg command for an edit, or for a pass that measures (`measure`). Throws, in words a person can act on, for what cannot be made. */
export function planSound(p: SoundPlanInput): SoundPlan {
  const r = p.recipe;
  const R = workingRate(p.sources, p.out);
  const S = (t: number) => Math.round(t * R);
  const chains: AChain[] = [];
  const files: Record<string, Buffer> = {};
  const inputs: string[] = [];
  const args = ['-hide_banner', '-nostdin', '-y', '-v', p.measure ? 'info' : 'error', '-progress', 'pipe:1', '-nostats'];
  let k = 0;
  const label = (pre: string) => `${pre}${++k}`;
  const input = (file: string, o: { ss?: number; t?: number } = {}) => {
    const i = inputs.length;
    inputs.push(file);
    args.push('-protocol_whitelist', 'file', ...(o.ss ? ['-ss', n(o.ss, 6)] : []), ...(o.t ? ['-t', n(o.t, 6)] : []), '-i', `file:${file}`);
    return i;
  };
  const total = soundLength(r);
  const L = S(total);
  const measured = p.measure ? (r.effects ?? []).find((e) => e.id === p.measure) : undefined;
  if (p.measure && !measured) throw new Error('No such effect to measure');

  /** Silence `samples` long. */
  const silence = (samples: number) => {
    const out = label('z');
    chains.push({
      ins: [],
      filters: [
        {
          name: 'anullsrc',
          args: [
            ['r', R],
            ['cl', 'stereo'],
          ],
        },
        { name: 'atrim', args: [['end_sample', samples]] },
        FMT(R),
      ],
      outs: [out],
    });
    return out;
  };

  /** One effect on `cur` (`samples` long): on all of it, or on its range (cut out, changed, put back). The output's label. */
  const applyEffect = (cur: string, samples: number, e: SoundEffect): string => {
    const a = e.range ? Math.max(0, Math.min(samples, S(e.range[0]))) : 0;
    const b = e.range ? Math.max(a, Math.min(samples, S(e.range[1]))) : samples;
    if (b - a < 1) return cur;
    const seconds = (b - a) / R;
    const make = (from: string): string => {
      const out = label('e');
      if (e.type === 'reverb') {
        const pr = effectParams(e);
        const name = roomFile(pr.room, R);
        if (!files[name]) files[name] = roomWav(roomResponse(pr.room, R), R);
        const idx = input(path.join(p.dir, name));
        const [dry, wet, rv] = [label('d'), label('w'), label('v')];
        chains.push({ ins: [from], filters: [{ name: 'asplit', args: [['outputs', 2]] }], outs: [dry, wet] });
        const plain: [string, Value][] = p.caps.afirPlain === 'irnorm' ? [['irnorm', -1]] : p.caps.afirPlain === 'gtype' ? [['gtype', 'none']] : [];
        chains.push({ ins: [wet, `${idx}:a`], filters: [{ name: 'afir', args: plain }, FMT(R)], outs: [rv] });
        chains.push({
          ins: [dry, rv],
          filters: [
            {
              name: 'amix',
              args: [
                ['inputs', 2],
                ['weights', `'1 ${n(pr.mix, 4)}'`],
                ['normalize', 0],
                ['duration', 'first'],
              ],
            },
            FMT(R),
            ...exact(b - a),
          ],
          outs: [out],
        });
        return out;
      }
      chains.push({ ins: [from], filters: [...effectFilters(e, { seconds, rate: R, ranged: !!e.range, caps: p.caps, gains: p.gains, limit: p.limit }), FMT(R), ...exact(b - a)], outs: [out] });
      return out;
    };
    if (a === 0 && b === samples) return make(cur);
    const parts: string[] = [];
    const n3 = (a > 0 ? 1 : 0) + 1 + (b < samples ? 1 : 0);
    const outs = Array.from({ length: n3 }, () => label('s'));
    chains.push({ ins: [cur], filters: [{ name: 'asplit', args: [['outputs', n3]] }], outs });
    let i = 0;
    if (a > 0) {
      const pre = label('p');
      chains.push({ ins: [outs[i++]], filters: [{ name: 'atrim', args: [['end_sample', a]] }], outs: [pre] });
      parts.push(pre);
    }
    const mid = label('m');
    chains.push({
      ins: [outs[i++]],
      filters: [
        {
          name: 'atrim',
          args: [
            ['start_sample', a],
            ['end_sample', b],
          ],
        },
        { name: 'asetpts', args: [['expr', 'PTS-STARTPTS']] },
      ],
      outs: [mid],
    });
    parts.push(make(mid));
    if (b < samples) {
      const post = label('q');
      chains.push({
        ins: [outs[i++]],
        filters: [
          { name: 'atrim', args: [['start_sample', b]] },
          { name: 'asetpts', args: [['expr', 'PTS-STARTPTS']] },
        ],
        outs: [post],
      });
      parts.push(post);
    }
    const joined = label('j');
    chains.push({
      ins: parts,
      filters: [
        {
          name: 'concat',
          args: [
            ['n', parts.length],
            ['v', 0],
            ['a', 1],
          ],
        },
      ],
      outs: [joined],
    });
    return joined;
  };

  /** The part a measuring pass takes in: what comes to the effect (its range of it). */
  const measureAt = (cur: string, samples: number, e: SoundEffect): string => {
    const a = e.range ? Math.max(0, Math.min(samples, S(e.range[0]))) : 0;
    const b = e.range ? Math.max(a, Math.min(samples, S(e.range[1]))) : samples;
    const out = label('x');
    chains.push({
      ins: [cur],
      filters: [
        ...(a > 0 || b < samples
          ? [
              {
                name: 'atrim',
                args: [
                  ['start_sample', a],
                  ['end_sample', Math.max(a + 1, b)],
                ] as [string, Value][],
              },
            ]
          : []),
        {
          name: 'ebur128',
          args: [
            ['peak', 'sample+true'],
            ['framelog', 'quiet'],
          ],
        },
      ],
      outs: [out],
    });
    return out;
  };

  /** A track: its clips end to end with silence between, `samples` long; then its effects (up to the one measured). */
  const trackChain = (t: SoundTrack, samples: number): { label: string; measuring?: boolean } => {
    const segs: string[] = [];
    let at = 0;
    // Each sound read once a track while the track goes on in it; read again where it goes back.
    const reads = new Map<string, { idx: number; base: number; end: number; outs: string[]; used: number }[]>();
    const plan: { c: (typeof t.clips)[number]; read: { idx: number; base: number; end: number; outs: string[]; used: number } }[] = [];
    for (const c of t.clips) {
      const src = p.sources.get(c.src);
      if (!src) throw new Error(`A clip’s sound is missing: ${c.src || 'the sound edited'}`);
      const list = reads.get(c.src) ?? [];
      let read = list.find((x) => c.from >= x.end - 1e-6);
      if (read) read.end = c.to;
      else {
        read = { idx: -1, base: c.from, end: c.to, outs: [], used: 0 };
        list.push(read);
      }
      reads.set(c.src, list);
      plan.push({ c, read });
    }
    // The inputs, each from its first part to its last.
    for (const [src, list] of reads)
      for (const read of list) {
        const s = p.sources.get(src)!;
        read.idx = input(s.file, { ss: read.base > 0.0005 ? read.base : undefined, t: read.end - read.base + 0.25 });
        const count = plan.filter((x) => x.read === read).length;
        read.outs = Array.from({ length: count }, () => label('r'));
        chains.push({ ins: [`${read.idx}:a`], filters: count > 1 ? [{ name: 'asplit', args: [['outputs', count]] }] : [{ name: 'anull' }], outs: read.outs });
      }
    for (const { c, read } of plan) {
      const a = S(c.at);
      const b = S(clipEnd(c));
      if (a > at) segs.push(silence(a - at));
      const src = p.sources.get(c.src)!;
      const f: AFilter[] = [
        {
          name: 'atrim',
          args: [
            ['start', n(Math.max(0, c.from - read.base), 6)],
            ['end', n(c.to - read.base, 6)],
          ],
        },
        { name: 'asetpts', args: [['expr', 'PTS-STARTPTS']] },
        { name: 'aresample', args: [['osr', R]] },
      ];
      if (src.channels === 1) f.push({ name: 'pan', pos: 'stereo|c0=1*c0|c1=1*c0' });
      f.push(FMT(R));
      if (c.speed) for (const x of tempos(c.speed)) f.push({ name: 'atempo', args: [['tempo', n(x, 6)]] });
      if (c.gain) f.push({ name: 'volume', args: [['volume', dbArg(c.gain)]] });
      const len = clipLength(c);
      if (c.fadeIn)
        f.push({
          name: 'afade',
          args: [
            ['t', 'in'],
            ['st', 0],
            ['d', Math.min(len, c.fadeIn)],
          ],
        });
      if (c.fadeOut)
        f.push({
          name: 'afade',
          args: [
            ['t', 'out'],
            ['st', Math.max(0, len - c.fadeOut)],
            ['d', Math.min(len, c.fadeOut)],
          ],
        });
      f.push(...exact(Math.max(1, b - Math.max(a, at))));
      const out = label('c');
      chains.push({ ins: [read.outs[read.used++]], filters: f, outs: [out] });
      segs.push(out);
      at = Math.max(at, b);
    }
    if (at < samples) segs.push(silence(samples - at));
    let cur = label('t');
    if (segs.length === 1) chains.push({ ins: segs, filters: [{ name: 'anull' }], outs: [cur] });
    else
      chains.push({
        ins: segs,
        filters: [
          {
            name: 'concat',
            args: [
              ['n', segs.length],
              ['v', 0],
              ['a', 1],
            ],
          },
        ],
        outs: [cur],
      });
    for (const e of activeEffects(r, t.id)) {
      if (measured?.id === e.id) return { label: measureAt(cur, samples, e), measuring: true };
      cur = applyEffect(cur, samples, e);
    }
    return { label: cur };
  };

  let final: string;
  let seconds = total;
  if (measured?.track) {
    const t = r.tracks.find((x) => x.id === measured.track);
    if (!t) throw new Error('The track of the effect measured is gone');
    final = trackChain(t, S(trackLengthOf(t, r))).label;
    const range = measured.range;
    seconds = range ? range[1] : trackLengthOf(t, r);
  } else {
    // The tracks heard, each as long as the whole, at its volume and place, mixed.
    const heard = audibleTracks(r).filter((t) => t.clips.length);
    const mixed: string[] = [];
    for (const t of heard) {
      let cur = trackChain(t, L).label;
      const post: AFilter[] = [];
      if (t.volume) post.push({ name: 'volume', args: [['volume', dbArg(t.volume)]] });
      if (t.pan) post.push({ name: 'pan', pos: panPos(panMatrix(t.pan)) });
      if (post.length) {
        const out = label('g');
        chains.push({ ins: [cur], filters: [...post, FMT(R)], outs: [out] });
        cur = out;
      }
      mixed.push(cur);
    }
    let mix = label('mix');
    if (!mixed.length) mix = silence(Math.max(1, L));
    else if (mixed.length === 1) chains.push({ ins: mixed, filters: [{ name: 'anull' }], outs: [mix] });
    else
      chains.push({
        ins: mixed,
        filters: [
          {
            name: 'amix',
            args: [
              ['inputs', mixed.length],
              ['duration', 'longest'],
              ['dropout_transition', 0],
              ['normalize', 0],
            ],
          },
          FMT(R),
          ...exact(Math.max(1, L)),
        ],
        outs: [mix],
      });
    let cur = mix;
    for (const e of activeEffects(r, null)) {
      if (measured?.id === e.id) {
        cur = measureAt(cur, Math.max(1, L), e);
        seconds = e.range ? e.range[1] : total;
        break;
      }
      cur = applyEffect(cur, Math.max(1, L), e);
    }
    final = cur;
  }

  const channels = outChannels(r, p.sources, p.out);
  if (p.measure) {
    const graph = audioGraphText(chains);
    args.push('-filter_complex', graph, '-map', `[${final}]`, '-f', 'null', '-');
    return { args, inputs, output: '-', files, seconds, graph, rate: R, channels };
  }
  // ---- the file -------------------------------------------------------------------------------------------------
  const end: AFilter[] = [];
  if (channels === 1) end.push({ name: 'pan', pos: 'mono|c0=0.5*c0+0.5*c1' });
  const out = label('out');
  chains.push({ ins: [final], filters: end.length ? end : [{ name: 'anull' }], outs: [out] });
  const graph = audioGraphText(chains);
  args.push('-filter_complex', graph, '-map', `[${out}]`, '-ar', String(R), '-ac', String(channels));
  const fmt = p.out.format;
  const kbps = (d: number) => `${Math.round(p.out.kbps ?? d)}k`;
  if (fmt === 'mp3') {
    if (!p.caps.encoders.mp3) throw new Error('This ffmpeg cannot make MP3 files (it has no MP3 encoder): save it as M4A, WAV or FLAC');
    args.push('-c:a', 'libmp3lame', '-b:a', kbps(192), '-f', 'mp3');
  } else if (fmt === 'm4a') {
    if (!p.caps.encoders.aac) throw new Error('This ffmpeg cannot make M4A files: save it as MP3, WAV or FLAC');
    args.push('-c:a', 'aac', '-b:a', kbps(192), '-movflags', '+faststart', '-f', 'mp4');
  } else if (fmt === 'ogg') {
    if (p.caps.encoders.opus) args.push('-c:a', 'libopus', '-b:a', kbps(96), '-f', 'ogg');
    else if (p.caps.encoders.vorbis) args.push('-c:a', 'libvorbis', '-b:a', kbps(128), '-f', 'ogg');
    else throw new Error('This ffmpeg cannot make Ogg files: save it as MP3, M4A, WAV or FLAC');
  } else if (fmt === 'wav') args.push('-c:a', p.out.bits === 24 ? 'pcm_s24le' : 'pcm_s16le', '-f', 'wav');
  else {
    if (!p.caps.encoders.flac) throw new Error('This ffmpeg cannot make FLAC files: save it as WAV');
    args.push('-c:a', 'flac', ...(p.out.bits === 24 ? ['-sample_fmt', 's32', '-bits_per_raw_sample', '24'] : ['-sample_fmt', 's16']), '-f', 'flac');
  }
  args.push(`file:${p.output}`);
  return { args, inputs, output: p.output, files, seconds: total, graph, rate: R, channels };
}

/** How long a track is made: the whole sound's length (its effects' ranges are the timeline's). */
const trackLengthOf = (_t: SoundTrack, r: SoundRecipe) => Math.max(1 / 48_000, soundLength(r));

/** Throws unless a plan reads only its inputs and writes only its output (each named once, as a file), or measures into nothing. */
export function checkSoundPlan(plan: SoundPlan): void {
  const read: string[] = [];
  for (let i = 0; i < plan.args.length; i++) if (plan.args[i] === '-i') read.push(plan.args[++i]);
  if (read.length !== plan.inputs.length || read.some((x, i) => x !== `file:${plan.inputs[i]}`)) throw new Error('The command reads something it was not given');
  const last = plan.args[plan.args.length - 1];
  if (plan.output === '-' ? last !== '-' || plan.args[plan.args.length - 2] !== 'null' : last !== `file:${plan.output}`) throw new Error('The command writes somewhere it was not told');
  const named = plan.args.filter((x) => x.startsWith('file:'));
  if (named.length !== plan.inputs.length + (plan.output === '-' ? 0 : 1)) throw new Error('The command names a file it was not given');
}

/** What a measuring pass found (ebur128's summary): the integrated loudness, and the sample and true peaks, in dB. */
export function readLoudness(text: string): { lufs?: number; peak?: number; truePeak?: number } {
  const at = text.lastIndexOf('Summary:');
  const s = at >= 0 ? text.slice(at) : text;
  const num = (re: RegExp) => {
    const m = re.exec(s);
    const v = m ? Number(m[1]) : NaN;
    return Number.isFinite(v) ? v : m && /-inf/i.test(m[0]) ? -Infinity : undefined;
  };
  return {
    lufs: num(/Integrated loudness:\s*\n\s*I:\s*(-?[\d.]+|-inf)\s*LUFS/),
    peak: num(/Sample peak:\s*\n\s*Peak:\s*(-?[\d.]+|-inf)\s*dBFS/),
    truePeak: num(/True peak:\s*\n\s*Peak:\s*(-?[\d.]+|-inf)\s*dBFS/),
  };
}

/** The gain an effect needs from what was measured coming to it (dB, at most +40), and whether a limiter must follow. */
export function gainFor(e: SoundEffect, m: { lufs?: number; peak?: number; truePeak?: number }): { gain: number; limit: boolean } {
  const p = effectParams(e);
  if (e.type === 'normalize') {
    if (m.peak === undefined || !Number.isFinite(m.peak) || m.peak < -90) return { gain: 0, limit: false };
    return { gain: Math.min(40, p.peak - m.peak), limit: false };
  }
  if (m.lufs === undefined || !Number.isFinite(m.lufs) || m.lufs <= -69.5) return { gain: 0, limit: false };
  const gain = Math.min(40, p.lufs - m.lufs);
  const peak = m.truePeak ?? m.peak;
  return { gain, limit: peak !== undefined && Number.isFinite(peak) && peak + gain > -1 };
}
