// A sound's edit, as the sound editor keeps it and edit_audio asks for it: tracks of clips on a timeline (each clip a
// part of a sound, at a place, played faster or slower with its pitch kept, louder or quieter, faded in and out), each
// track with its volume, pan, mute and solo, and a rack of effects, each on one track or on the whole sound (all the
// tracks mixed), on all of it or on a part of the timeline, which can be bypassed. The server makes it with ffmpeg
// (server/mediaedit/audio-plan.ts); the editor plays the same in the browser while it is being edited. Nothing of the
// sounds themselves changes: an edit is a recipe, made into a new file when it is saved.
//
// Times are seconds of the timeline (where a clip is, where an effect starts and ends) or of a clip's sound (the part
// of it a clip plays). The edits people make (cut, paste, delete, silence, insert silence, change the speed) are
// worked out here (the ops below) so the editor and edit_audio make them alike: a deletion closes the gap on the tracks
// it is made on ("ripple"), and the effects and the clips after it move with it. For a video's sound the timeline keeps
// its length: a deletion leaves silence, a paste goes over what is there, and nothing changes its speed.

// ---- what is made -------------------------------------------------------------------------------------------------

export type SoundFormat = 'mp3' | 'wav' | 'm4a' | 'ogg' | 'flac';

export interface SoundFormatInfo {
  id: SoundFormat;
  label: string;
  ext: string;
  mime: string;
  /** Kilobits a second it may be made at (lossy kinds), and the one it is made at unless asked. */
  kbps?: number[];
  kbpsDefault?: number;
  /** What it is good for, in a few words. */
  note: string;
}

export const SOUND_FORMATS: SoundFormatInfo[] = [
  { id: 'mp3', label: 'MP3', ext: 'mp3', mime: 'audio/mpeg', kbps: [96, 128, 192, 256, 320], kbpsDefault: 192, note: 'Plays everywhere' },
  { id: 'm4a', label: 'M4A (AAC)', ext: 'm4a', mime: 'audio/mp4', kbps: [96, 128, 192, 256], kbpsDefault: 192, note: 'Small, good quality; for Apple devices and video' },
  { id: 'ogg', label: 'OGG (Opus)', ext: 'ogg', mime: 'audio/ogg', kbps: [48, 64, 96, 128, 160], kbpsDefault: 96, note: 'The smallest at its quality, for the web' },
  { id: 'wav', label: 'WAV', ext: 'wav', mime: 'audio/wav', note: 'Every sample as it is: large' },
  { id: 'flac', label: 'FLAC', ext: 'flac', mime: 'audio/flac', note: 'Every sample as it is, at about half the size of WAV' },
];

export const soundFormat = (f: SoundFormat) => SOUND_FORMATS.find((x) => x.id === f)!;

/** The kind of file a name says (".mp3" → mp3; ".opus" and ".oga" are Ogg), or null for one this editor does not make. */
export function soundFormatOfName(name: string): SoundFormat | null {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  if (ext === 'mp3' || ext === 'wav' || ext === 'flac' || ext === 'm4a') return ext;
  if (ext === 'aac' || ext === 'mp4') return 'm4a';
  if (ext === 'ogg' || ext === 'oga' || ext === 'opus') return 'ogg';
  return null;
}

/** How it is saved: the kind of file, its quality, its channels and its sample rate. */
export interface SoundOutput {
  format: SoundFormat;
  /** Lossy kinds: kilobits a second. */
  kbps?: number;
  /** WAV and FLAC: 16 or 24 bits a sample. */
  bits?: 16 | 24;
  /** Left out: as the sounds are (stereo when any of them is). */
  channels?: 1 | 2;
  /** Samples a second (8,000 to 48,000); left out: the edited sound's own. */
  rate?: number;
}

export const SOUND_RATES = [48_000, 44_100, 32_000, 24_000, 22_050, 16_000];

// ---- the edit ------------------------------------------------------------------------------------------------------

/** A part of a sound, placed on a track. */
export interface SoundClip {
  /** Its own id (the editor picks and moves clips by it). */
  id: string;
  /**
   * The sound it plays: "" for the sound being edited; else a sound of the Library ("media:<id>"), one the editor keeps
   * (a recording, a sound made with AI, one from this device: "naget-sound:<sha>"), or a file's path (a sound, or a
   * video's sound).
   */
  src: string;
  /** Its name, to show (another sound's title, "Recording 2"). */
  name?: string;
  /** Where it starts on the timeline, in seconds. */
  at: number;
  /** The part of its sound it plays, in seconds of that sound. */
  from: number;
  to: number;
  /** How fast it plays, its pitch kept: 0.25 to 4 (left out: 1). */
  speed?: number;
  /** Louder or quieter, in dB (−40 to 24; left out: 0). */
  gain?: number;
  /** Seconds at its start coming in from silence, and at its end going out to it. */
  fadeIn?: number;
  fadeOut?: number;
  /** Its fades along a half sine instead of a straight line (as the Fade effect's "Smooth"). */
  fadeSmooth?: boolean;
  /**
   * Its volume line: points along the clip (seconds from where it starts on the timeline, and the volume there as a
   * multiple of what it is, 1 as it is, 0 silent, 2 twice as loud), with straight lines between them and the first
   * and last volumes kept beyond them. Left out: the volume does not change along it.
   */
  env?: EnvPoint[];
}

/** A point of a clip's volume line. */
export interface EnvPoint {
  t: number;
  v: number;
}

/** A track: clips one after another (never over each other), with its volume and place between the speakers. */
export interface SoundTrack {
  id: string;
  name?: string;
  clips: SoundClip[];
  /** In dB, −60 to 12 (left out: 0). */
  volume?: number;
  /** −1 (left) to 1 (right) (left out: the middle). */
  pan?: number;
  mute?: boolean;
  solo?: boolean;
}

export type SoundEffectType =
  | 'gain'
  | 'fadeIn'
  | 'fadeOut'
  | 'normalize'
  | 'loudness'
  | 'denoise'
  | 'eq'
  | 'highpass'
  | 'lowpass'
  | 'compressor'
  | 'limiter'
  | 'pitch'
  | 'reverse'
  | 'echo'
  | 'reverb'
  | 'mono';

/** One effect of the rack. */
export interface SoundEffect {
  id: string;
  type: SoundEffectType;
  /** Its settings by name (EFFECTS says which, and their ranges); left out: their defaults. */
  p?: Record<string, number>;
  /** Kept in the rack, but off. */
  bypass?: boolean;
  /** On this track only (its id); left out, on the whole sound (all the tracks mixed). */
  track?: string;
  /** On this part of the timeline only, in seconds; left out, on all of it. */
  range?: [number, number];
}

export interface SoundRecipe {
  tracks: SoundTrack[];
  /** The rack, in the order the effects are made: each track's own first, then the whole sound's. */
  effects?: SoundEffect[];
  /** A video's sound: it is this long (seconds), whatever is cut or moved; left out, as long as its clips reach. */
  length?: number;
}

// ---- the effects ---------------------------------------------------------------------------------------------------

export interface EffectParam {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  /** "dB", "Hz", "ms", "s", "LUFS", "%" (the value is 0 to 1, shown as a percentage), "st" (semitones), ":1" (a ratio). */
  unit?: string;
  /** A choice among a few, by number. */
  choices?: { value: number; label: string }[];
  /** 0 means it is off (a low cut of 0 Hz); on, it is at least `least`. */
  offAt0?: boolean;
  least?: number;
}

export interface EffectInfo {
  label: string;
  /** Where the Effects menu lists it. */
  group: 'Volume' | 'Clean up' | 'Tone' | 'Dynamics' | 'Time and pitch' | 'Space' | 'Channels';
  /** What it does, in a sentence. */
  hint: string;
  params: EffectParam[];
  presets?: { label: string; p: Record<string, number> }[];
  /** How the browser plays it while editing: as it will be, close to it, or not at all (heard once saved). */
  preview: 'exact' | 'close' | 'saved';
}

const db = (id: string, label: string, min: number, max: number, def: number, step = 0.5): EffectParam => ({ id, label, min, max, step, default: def, unit: 'dB' });

/** The reverb's rooms: how long each rings (seconds to fall 60 dB), how far off its first echo is (ms), how dark it is. */
export const ROOMS = [
  { label: 'Small room', rt60: 0.45, pre: 4, damp: 0.35 },
  { label: 'Room', rt60: 0.9, pre: 10, damp: 0.45 },
  { label: 'Hall', rt60: 1.9, pre: 22, damp: 0.55 },
  { label: 'Cathedral', rt60: 3.4, pre: 35, damp: 0.62 },
];

export const EFFECTS: Record<SoundEffectType, EffectInfo> = {
  gain: { label: 'Volume', group: 'Volume', hint: 'Makes it louder or quieter.', params: [db('db', 'Change', -40, 24, 3)], preview: 'exact' },
  fadeIn: {
    label: 'Fade in',
    group: 'Volume',
    hint: 'Comes in from silence: over the part picked, or the first seconds of all of it.',
    params: [
      { id: 'seconds', label: 'Length', min: 0.1, max: 30, step: 0.1, default: 2, unit: 's' },
      {
        id: 'curve',
        label: 'Curve',
        min: 0,
        max: 1,
        step: 1,
        default: 0,
        choices: [
          { value: 0, label: 'Straight' },
          { value: 1, label: 'Smooth' },
        ],
      },
    ],
    preview: 'exact',
  },
  fadeOut: {
    label: 'Fade out',
    group: 'Volume',
    hint: 'Goes out to silence: over the part picked, or the last seconds of all of it.',
    params: [
      { id: 'seconds', label: 'Length', min: 0.1, max: 30, step: 0.1, default: 3, unit: 's' },
      {
        id: 'curve',
        label: 'Curve',
        min: 0,
        max: 1,
        step: 1,
        default: 0,
        choices: [
          { value: 0, label: 'Straight' },
          { value: 1, label: 'Smooth' },
        ],
      },
    ],
    preview: 'exact',
  },
  normalize: { label: 'Normalize', group: 'Volume', hint: 'Makes its loudest peak this loud.', params: [db('peak', 'Loudest peak', -12, 0, -1, 0.1)], preview: 'close' },
  loudness: {
    label: 'Loudness',
    group: 'Volume',
    hint: 'Makes it as loud as podcasts, streaming or broadcast want, its peaks kept under −1 dB.',
    params: [{ id: 'lufs', label: 'Target', min: -30, max: -10, step: 0.5, default: -16, unit: 'LUFS' }],
    presets: [
      { label: 'Podcast (−16 LUFS)', p: { lufs: -16 } },
      { label: 'Streaming (−14 LUFS)', p: { lufs: -14 } },
      { label: 'Broadcast (−23 LUFS)', p: { lufs: -23 } },
    ],
    preview: 'close',
  },
  denoise: {
    label: 'Noise reduction',
    group: 'Clean up',
    hint: 'Takes out steady noise: hiss, hum, a fan, traffic.',
    params: [db('amount', 'Reduction', 4, 40, 12, 1)],
    presets: [
      { label: 'Gentle', p: { amount: 8 } },
      { label: 'Medium', p: { amount: 14 } },
      { label: 'Strong', p: { amount: 24 } },
    ],
    preview: 'saved',
  },
  eq: {
    label: 'Equalizer',
    group: 'Tone',
    hint: 'Changes its bass, middle and treble.',
    params: [
      db('bass', 'Bass', -15, 15, 0),
      db('mid', 'Middle', -15, 15, 0),
      db('treble', 'Treble', -15, 15, 0),
      { id: 'lowCut', label: 'Low cut', min: 0, max: 500, step: 5, default: 0, unit: 'Hz', offAt0: true, least: 20 },
      { id: 'highCut', label: 'High cut', min: 0, max: 20000, step: 100, default: 0, unit: 'Hz', offAt0: true, least: 1000 },
    ],
    presets: [
      { label: 'Clearer voice', p: { bass: -2, mid: 3, treble: 3, lowCut: 80, highCut: 0 } },
      { label: 'Telephone', p: { bass: -6, mid: 6, treble: -6, lowCut: 300, highCut: 3400 } },
      { label: 'Radio', p: { bass: -3, mid: 4, treble: -2, lowCut: 120, highCut: 7000 } },
      { label: 'Warmer', p: { bass: 4, mid: 0, treble: -2, lowCut: 0, highCut: 0 } },
      { label: 'Brighter', p: { bass: 0, mid: 1, treble: 5, lowCut: 0, highCut: 0 } },
      { label: 'Less boomy', p: { bass: -6, mid: 0, treble: 0, lowCut: 100, highCut: 0 } },
      { label: 'More bass', p: { bass: 6, mid: 0, treble: 0, lowCut: 0, highCut: 0 } },
    ],
    preview: 'exact',
  },
  highpass: { label: 'High-pass', group: 'Tone', hint: 'Takes out what is lower than this: rumble, hum, wind.', params: [{ id: 'hz', label: 'Below', min: 20, max: 2000, step: 5, default: 80, unit: 'Hz' }], preview: 'exact' },
  lowpass: { label: 'Low-pass', group: 'Tone', hint: 'Takes out what is higher than this: hiss, harshness.', params: [{ id: 'hz', label: 'Above', min: 500, max: 20000, step: 50, default: 8000, unit: 'Hz' }], preview: 'exact' },
  compressor: {
    label: 'Compressor',
    group: 'Dynamics',
    hint: 'Evens out loud and quiet parts.',
    params: [
      db('threshold', 'Threshold', -60, 0, -20, 1),
      { id: 'ratio', label: 'Ratio', min: 1, max: 20, step: 0.5, default: 4, unit: ':1' },
      { id: 'attack', label: 'Attack', min: 0.1, max: 200, step: 0.1, default: 10, unit: 'ms' },
      { id: 'release', label: 'Release', min: 10, max: 2000, step: 5, default: 150, unit: 'ms' },
      db('makeup', 'Make-up gain', 0, 24, 4),
    ],
    presets: [
      { label: 'Gentle', p: { threshold: -18, ratio: 2, attack: 10, release: 200, makeup: 2 } },
      { label: 'Voice', p: { threshold: -24, ratio: 4, attack: 5, release: 120, makeup: 6 } },
      { label: 'Strong', p: { threshold: -30, ratio: 8, attack: 3, release: 100, makeup: 10 } },
      { label: 'Music', p: { threshold: -14, ratio: 2, attack: 30, release: 300, makeup: 2 } },
    ],
    preview: 'close',
  },
  limiter: {
    label: 'Limiter',
    group: 'Dynamics',
    hint: 'Keeps its peaks under a ceiling, without changing the rest.',
    params: [db('ceiling', 'Ceiling', -12, 0, -1, 0.1), { id: 'release', label: 'Release', min: 10, max: 500, step: 5, default: 60, unit: 'ms' }],
    preview: 'close',
  },
  pitch: { label: 'Pitch', group: 'Time and pitch', hint: 'Higher or lower, at the same speed.', params: [{ id: 'semitones', label: 'Change', min: -12, max: 12, step: 0.5, default: 2, unit: 'st' }], preview: 'close' },
  reverse: { label: 'Reverse', group: 'Time and pitch', hint: 'Plays it backwards.', params: [], preview: 'exact' },
  echo: {
    label: 'Echo',
    group: 'Space',
    hint: 'Repeats it, each time quieter.',
    params: [
      { id: 'delay', label: 'Delay', min: 20, max: 2000, step: 5, default: 300, unit: 'ms' },
      { id: 'decay', label: 'Each repeat', min: 0.05, max: 0.9, step: 0.01, default: 0.4, unit: '%' },
    ],
    preview: 'exact',
  },
  reverb: {
    label: 'Reverb',
    group: 'Space',
    hint: 'As if it were played in a room or a hall.',
    params: [
      { id: 'room', label: 'Room', min: 0, max: ROOMS.length - 1, step: 1, default: 1, choices: ROOMS.map((r, i) => ({ value: i, label: r.label })) },
      { id: 'mix', label: 'Amount', min: 0, max: 1, step: 0.01, default: 0.25, unit: '%' },
    ],
    preview: 'exact',
  },
  mono: { label: 'To mono', group: 'Channels', hint: 'The same sound in both speakers.', params: [], preview: 'exact' },
};

export const EFFECT_TYPES = Object.keys(EFFECTS) as SoundEffectType[];

/** An effect's settings, each in its range (its default where it is left out). */
export function effectParams(e: Pick<SoundEffect, 'type' | 'p'>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const q of EFFECTS[e.type].params) {
    const v = Number(e.p?.[q.id]);
    out[q.id] = Number.isFinite(v) ? Math.min(q.max, Math.max(q.min, q.offAt0 && q.least && v > 0 && v < q.least ? q.least : v)) : q.default;
    if (q.choices) out[q.id] = Math.round(out[q.id]);
  }
  return out;
}

/** An effect in words ("Equalizer: Clearer voice", "Volume +3 dB"), for the History and edit_audio's answer. */
export function effectWords(e: Pick<SoundEffect, 'type' | 'p'>): string {
  const info = EFFECTS[e.type];
  const p = effectParams(e);
  const preset = info.presets?.find((x) => Object.entries(x.p).every(([k, v]) => p[k] === v));
  if (preset) return `${info.label}: ${preset.label}`;
  if (e.type === 'gain') return `${info.label} ${p.db > 0 ? '+' : ''}${p.db} dB`;
  if (e.type === 'pitch') return `${info.label} ${p.semitones > 0 ? '+' : ''}${p.semitones} st`;
  if (e.type === 'normalize') return `${info.label} to ${p.peak} dB`;
  if (e.type === 'loudness') return `${info.label} ${p.lufs} LUFS`;
  if (e.type === 'reverb') return `${info.label}: ${ROOMS[p.room].label}`;
  return info.label;
}

// ---- limits ----------------------------------------------------------------------------------------------------------

export const LIMITS = {
  tracks: 16,
  clips: 2000,
  effects: 64,
  /** The longest timeline made, in seconds. */
  seconds: 4 * 3600,
  /** The longest part reversed at once (it is held whole in memory). */
  reverse: 20 * 60,
  /** The shortest clip or part kept, in seconds. */
  part: 0.005,
};

export const MIN_SPEED = 0.25;
export const MAX_SPEED = 4;

// ---- numbers and times -----------------------------------------------------------------------------------------------

const num = (v: unknown, lo: number, hi: number): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : undefined;
};
/** Seconds to the microsecond (a sample at 48 kHz is about 21). */
export const us = (n: number) => Math.round(n * 1e6) / 1e6;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** A short id for a clip, a track, an effect or a marker. */
export function newId(): string {
  return Math.random().toString(36).slice(2, 10).padEnd(8, '0');
}

/** How long a clip plays on the timeline, in seconds. */
export const clipLength = (c: Pick<SoundClip, 'from' | 'to' | 'speed'>) => (c.to - c.from) / (c.speed ?? 1);
export const clipEnd = (c: Pick<SoundClip, 'at' | 'from' | 'to' | 'speed'>) => c.at + clipLength(c);
/** Where a moment of the timeline is in a clip's sound. */
export const sourceTime = (c: Pick<SoundClip, 'at' | 'from' | 'speed'>, t: number) => c.from + (t - c.at) * (c.speed ?? 1);
/** Where a moment of a clip's sound is on the timeline. */
export const timelineTime = (c: Pick<SoundClip, 'at' | 'from' | 'speed'>, s: number) => c.at + (s - c.from) / (c.speed ?? 1);

export const trackEnd = (t: SoundTrack) => t.clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0);

/** How long the edited sound is: as long as its clips reach, or (a video's) the length it keeps. */
export const soundLength = (r: SoundRecipe) => r.length ?? r.tracks.reduce((m, t) => Math.max(m, trackEnd(t)), 0);

/** The tracks heard: the soloed ones when any is, else the ones not muted. */
export function audibleTracks(r: SoundRecipe): SoundTrack[] {
  const solo = r.tracks.some((t) => t.solo);
  return r.tracks.filter((t) => (solo ? t.solo : !t.mute));
}

/** "1:05.250" for 65.25 seconds; "1:02:03.500" past an hour. `places` 1 to 3. */
export function soundClock(s: number, places = 3): string {
  const t = Math.max(0, s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  let sec = (t % 60).toFixed(places);
  // 59.9996 rounds up to 60.000: carry it.
  if (Number(sec) >= 60) return soundClock(Math.ceil(t), places);
  sec = sec.padStart(places ? places + 3 : 2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** "1:05.3", "65.3", "1:02:03" or "1:05,3" as seconds; null for anything else. */
export function readSoundClock(s: string): number | null {
  const parts = s.trim().split(':');
  if (!parts.length || parts.length > 3 || parts.some((x) => !/^\d+(?:[.,]\d+)?$/.test(x))) return null;
  return parts.reduce((n, x) => n * 60 + Number(x.replace(',', '.')), 0);
}

// ---- checking an edit ------------------------------------------------------------------------------------------------

const SRC = /^(?:|media:[a-f0-9]{10}|naget-sound:[a-f0-9]{16,64}|naget-video:[a-f0-9]{16,64}|[^\u0000-\u001f]{1,4096})$/;
const ID = /^[A-Za-z0-9_-]{1,40}$/;

// ---- a clip's volume line ------------------------------------------------------------------------------------------

/** The most points a volume line has, and the loudest it goes (a multiple: 4 is +12 dB). */
export const ENV_POINTS = 64;
export const ENV_MAX = 4;

/** The volume of a line at `u` seconds from the clip's start (1 where there is no line). */
export function envGainAt(env: readonly EnvPoint[] | undefined, u: number): number {
  if (!env?.length) return 1;
  if (u <= env[0].t) return env[0].v;
  const last = env[env.length - 1];
  if (u >= last.t) return last.v;
  let lo = 0;
  let hi = env.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (env[mid].t <= u) lo = mid;
    else hi = mid;
  }
  const a = env[lo];
  const b = env[hi];
  return a.v + ((b.v - a.v) * (u - a.t)) / Math.max(1e-9, b.t - a.t);
}

/** A line with nothing in it to hear (every point at 1, or no points) is no line. */
const plainEnv = (env: EnvPoint[]) => !env.length || env.every((p) => Math.abs(p.v - 1) < 5e-4);

/** A line cleaned up: its points in order along [0, `len`], not closer than a millisecond, in range; undefined when it changes nothing. */
export function cleanEnv(raw: unknown, len: number): EnvPoint[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const pts: EnvPoint[] = [];
  for (const q of raw) {
    if (!q || typeof q !== 'object') continue;
    const t = Number((q as EnvPoint).t);
    const v = Number((q as EnvPoint).v);
    if (!Number.isFinite(t) || !Number.isFinite(v)) continue;
    pts.push({ t: Math.min(len, Math.max(0, t)), v: Math.min(ENV_MAX, Math.max(0, v)) });
  }
  pts.sort((a, b) => a.t - b.t);
  const out: EnvPoint[] = [];
  for (const q of pts) {
    const prev = out[out.length - 1];
    if (prev && q.t - prev.t < 0.001) out[out.length - 1] = q;
    else out.push(q);
    if (out.length >= ENV_POINTS) break;
  }
  const rounded = out.map((q) => ({ t: r3(q.t), v: Math.round(q.v * 1000) / 1000 }));
  return plainEnv(rounded) ? undefined : rounded;
}

/** The part of a line from `u0` to `u1` (seconds from the clip's start; either may lie outside it), as the line of a clip that starts at `u0`. */
export function envSlice(env: readonly EnvPoint[] | undefined, u0: number, u1: number): EnvPoint[] | undefined {
  if (!env?.length || u1 - u0 < 1e-6) return undefined;
  const inner = env.filter((q) => q.t > u0 + 1e-6 && q.t < u1 - 1e-6).map((q) => ({ t: us(q.t - u0), v: q.v }));
  const out = [{ t: 0, v: envGainAt(env, u0) }, ...inner, { t: us(u1 - u0), v: envGainAt(env, u1) }];
  return plainEnv(out) ? undefined : out;
}

/** A line stretched in time by `k` (a clip played at another speed lasts 1/speed as long). */
export const envScale = (env: readonly EnvPoint[] | undefined, k: number): EnvPoint[] | undefined => (env?.length ? env.map((q) => ({ t: us(q.t * k), v: q.v })) : undefined);

/** A point added to a line at `u` (its volume there, or as the line has it), the others where they were. Returns the line and the new point's place in it. */
export function envAdd(env: readonly EnvPoint[] | undefined, u: number, len: number, v?: number): { env: EnvPoint[]; at: number } {
  const t = r3(Math.min(len, Math.max(0, u)));
  const vv = Math.min(ENV_MAX, Math.max(0, v ?? envGainAt(env, t)));
  // A first point holds the volume it was: the line starts out straight, at 1 along all of the clip's length.
  const base: EnvPoint[] = env?.length ? [...env] : [];
  const next = [...base.filter((q) => Math.abs(q.t - t) >= 0.001), { t, v: vv }].sort((a, b) => a.t - b.t).slice(0, ENV_POINTS);
  return { env: next, at: next.findIndex((q) => q.t === t) };
}

/** A point of a line moved to `u` and volume `v`, kept between its neighbours (a line keeps its points in order). */
export function envMove(env: readonly EnvPoint[], i: number, u: number, v: number, len: number): EnvPoint[] {
  if (i < 0 || i >= env.length) return [...env];
  const lo = i > 0 ? env[i - 1].t + 0.002 : 0;
  const hi = i < env.length - 1 ? env[i + 1].t - 0.002 : len;
  const t = r3(Math.min(Math.max(lo, hi), Math.max(Math.min(lo, hi), u)));
  return env.map((q, k) => (k === i ? { t, v: Math.round(Math.min(ENV_MAX, Math.max(0, v)) * 1000) / 1000 } : q));
}

/** A line without its `i`th point (undefined when none is left). */
export function envRemove(env: readonly EnvPoint[], i: number): EnvPoint[] | undefined {
  const out = env.filter((_, k) => k !== i);
  return out.length ? out : undefined;
}

/** How a clip's fade is shaped at `x` (0 to 1 of the way along it). */
export const clipFade = (c: Pick<SoundClip, 'fadeSmooth'>, x: number) => fadeCurve(x, !!c.fadeSmooth);

/** A clip's volume at `u` seconds from its start: its gain, its volume line and its fades (the clip as heard). */
export function clipGainAt(c: SoundClip, u: number): number {
  const len = clipLength(c);
  let e = dbGain(c.gain ?? 0) * envGainAt(c.env, u);
  if (c.fadeIn && u < c.fadeIn) e *= clipFade(c, u / c.fadeIn);
  if (c.fadeOut && u > len - c.fadeOut) e *= clipFade(c, Math.max(0, (len - u) / c.fadeOut));
  return e;
}

/**
 * An edit as it can be made: every value in its range, clips inside their sounds (`length` says how long each sound
 * is; one it does not know is taken as it is), in order on their tracks and never over each other, effects with known
 * settings and ranges inside the timeline, and what changes nothing left out. Throws when nothing would be heard.
 */
export function normalizeSoundRecipe(raw: unknown, o: { length: (src: string) => number | undefined; video?: boolean }): SoundRecipe {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const seen = new Set<string>();
  const idOf = (v: unknown) => {
    let id = typeof v === 'string' && ID.test(v) && !seen.has(v) ? v : newId();
    while (seen.has(id)) id = newId();
    seen.add(id);
    return id;
  };
  const tracks: SoundTrack[] = [];
  for (const t of Array.isArray(r.tracks) ? r.tracks.slice(0, LIMITS.tracks) : []) {
    if (!t || typeof t !== 'object') continue;
    const clips: SoundClip[] = [];
    for (const c of Array.isArray(t.clips) ? t.clips : []) {
      if (!c || typeof c !== 'object') continue;
      const src = typeof c.src === 'string' ? c.src.trim() : '';
      if (!SRC.test(src)) continue;
      const len = o.length(src);
      const top = len !== undefined ? len : LIMITS.seconds;
      const from = num(c.from, 0, top) ?? 0;
      const to = num(c.to, 0, top) ?? top;
      if (to - from < LIMITS.part) continue;
      const speed = o.video ? undefined : num(c.speed, MIN_SPEED, MAX_SPEED);
      const gain = num(c.gain, -40, 24);
      const clip: SoundClip = { id: idOf(c.id), src, at: us(num(c.at, 0, LIMITS.seconds) ?? 0), from: us(from), to: us(to) };
      if (typeof c.name === 'string' && c.name.trim()) clip.name = c.name.trim().slice(0, 120);
      if (speed !== undefined && Math.abs(speed - 1) > 0.0005) clip.speed = Math.round(speed * 1000) / 1000;
      if (gain !== undefined && Math.abs(gain) >= 0.05) clip.gain = Math.round(gain * 10) / 10;
      const most = clipLength(clip) / 2;
      const fi = num(c.fadeIn, 0, most);
      const fo = num(c.fadeOut, 0, most);
      if (fi !== undefined && fi >= 0.005) clip.fadeIn = r3(fi);
      if (fo !== undefined && fo >= 0.005) clip.fadeOut = r3(fo);
      if (c.fadeSmooth === true && (clip.fadeIn || clip.fadeOut)) clip.fadeSmooth = true;
      const env = cleanEnv(c.env, clipLength(clip));
      if (env) clip.env = env;
      clips.push(clip);
      if (clips.length >= LIMITS.clips) break;
    }
    clips.sort((a, b) => a.at - b.at);
    // One after another: a clip that starts before the one before it ends loses its start.
    const kept: SoundClip[] = [];
    for (const c of clips) {
      const prev = kept[kept.length - 1];
      const end = prev ? clipEnd(prev) : 0;
      if (prev && c.at < end - 1e-6) {
        const cut = (end - c.at) * (c.speed ?? 1);
        if (c.to - c.from - cut < LIMITS.part) continue;
        const was = c.at;
        c.from = us(c.from + cut);
        c.at = us(end);
        if (c.env) {
          const e = envSlice(c.env, c.at - was, clipEnd(c) - was);
          if (e) c.env = e;
          else delete c.env;
        }
      }
      kept.push(c);
    }
    const track: SoundTrack = { id: idOf(t.id), clips: kept };
    if (typeof t.name === 'string' && t.name.trim()) track.name = t.name.trim().slice(0, 80);
    const vol = num(t.volume, -60, 12);
    if (vol !== undefined && Math.abs(vol) >= 0.05) track.volume = Math.round(vol * 10) / 10;
    const pan = num(t.pan, -1, 1);
    if (pan !== undefined && Math.abs(pan) >= 0.005) track.pan = Math.round(pan * 100) / 100;
    if (t.mute === true) track.mute = true;
    if (t.solo === true) track.solo = true;
    tracks.push(track);
  }
  const out: SoundRecipe = { tracks };
  if (o.video) {
    const len = num(r.length, LIMITS.part, LIMITS.seconds);
    if (len === undefined) throw new Error('A video’s sound keeps the video’s length: length is missing');
    out.length = us(len);
  }
  const total = soundLength(out);
  if (total > LIMITS.seconds) throw new Error(`The edited sound would be over ${LIMITS.seconds / 3600} hours long: make it shorter`);
  if (!audibleTracks(out).some((t) => t.clips.length) && !o.video) throw new Error('Nothing would be heard: keep a part of it');
  const ids = new Set(tracks.map((t) => t.id));
  const effects: SoundEffect[] = [];
  for (const e of Array.isArray(r.effects) ? r.effects : []) {
    if (!e || typeof e !== 'object' || !EFFECT_TYPES.includes(e.type)) continue;
    const fx: SoundEffect = { id: idOf(e.id), type: e.type };
    if (typeof e.track === 'string') {
      if (!ids.has(e.track)) continue;
      fx.track = e.track;
    }
    if (Array.isArray(e.range) && e.range.length === 2) {
      const a = num(e.range[0], 0, total);
      const b = num(e.range[1], 0, total);
      if (a === undefined || b === undefined || b - a < LIMITS.part) continue;
      if (a > 1e-6 || b < total - 1e-6) fx.range = [us(a), us(b)];
    }
    const p = effectParams({ type: fx.type, p: e.p && typeof e.p === 'object' ? e.p : undefined });
    if (Object.keys(p).length) fx.p = p;
    if (e.bypass === true) fx.bypass = true;
    if (fx.type === 'reverse') {
      const span = fx.range ? fx.range[1] - fx.range[0] : total;
      if (span > LIMITS.reverse) throw new Error(`Reverse takes at most ${LIMITS.reverse / 60} minutes at a time: pick a shorter part`);
    }
    effects.push(fx);
    if (effects.length >= LIMITS.effects) break;
  }
  // Each track's effects first (in the rack's order), then the whole sound's: the order they are made in.
  const ordered = [...effects.filter((e) => e.track), ...effects.filter((e) => !e.track)];
  if (ordered.length) out.effects = ordered;
  return out;
}

/** The effects that are on, in the order they are made: a track's, or the whole sound's (`track` null). */
export const activeEffects = (r: SoundRecipe, track: string | null) => (r.effects ?? []).filter((e) => !e.bypass && (track === null ? !e.track : e.track === track));

// ---- edits ------------------------------------------------------------------------------------------------------------
//
// Each takes the tracks it is made on (their ids) and gives a new recipe. `ripple`: what is taken out closes up, what
// is put in moves the rest along (off for a video's sound, whose length stays: a deletion leaves silence instead).
// The effects of the tracks edited move with them, and the whole sound's when every track is edited.

/** What an edit does to the moments after it (for the effects, the markers and the playhead). */
export type TimeMap = (t: number) => number;
const same: TimeMap = (t) => t;

export interface Edited {
  recipe: SoundRecipe;
  /** Where a moment of the whole timeline goes (moves only when every track was edited). */
  map: TimeMap;
}

const allOf = (r: SoundRecipe, tracks: string[]) => r.tracks.every((t) => tracks.includes(t.id));

/**
 * A clip's part from `a` to `b` of the timeline (inside it), as a clip of its own. Fades stay at the clip's own ends: the
 * first part keeps its fade in, the last its fade out (each at most half of it); where it is cut there is none.
 */
function piece(c: SoundClip, a: number, b: number, id = newId()): SoundClip {
  const out: SoundClip = { ...c, id, at: us(a), from: us(sourceTime(c, a)), to: us(sourceTime(c, b)) };
  delete out.fadeIn;
  delete out.fadeOut;
  delete out.env;
  const env = envSlice(c.env, a - c.at, b - c.at);
  if (env) out.env = env;
  const half = (b - a) / 2;
  if (c.fadeIn && Math.abs(a - c.at) < 1e-6) out.fadeIn = r3(Math.min(c.fadeIn, half));
  if (c.fadeOut && Math.abs(b - clipEnd(c)) < 1e-6) out.fadeOut = r3(Math.min(c.fadeOut, half));
  return out;
}

/** The clips of a track split at `t` (a clip `t` falls inside becomes two). */
function splitClips(clips: SoundClip[], t: number): SoundClip[] {
  return clips.flatMap((c) => (t > c.at + LIMITS.part && t < clipEnd(c) - LIMITS.part ? [piece(c, c.at, t, c.id), piece(c, t, clipEnd(c))] : [c]));
}

const onTracks = (r: SoundRecipe, tracks: string[], f: (t: SoundTrack) => SoundTrack): SoundRecipe => ({ ...r, tracks: r.tracks.map((t) => (tracks.includes(t.id) ? f(t) : t)) });

/** The effects of the tracks edited (and the whole sound's, when every track was) moved by `map`; ranges left with no length go. */
function moveEffects(r: SoundRecipe, tracks: string[], map: TimeMap): SoundEffect[] | undefined {
  if (!r.effects) return undefined;
  const all = allOf(r, tracks);
  const out = r.effects
    .map((e) => {
      if (!e.range || !(e.track ? tracks.includes(e.track) : all)) return e;
      const a = map(e.range[0]);
      const b = map(e.range[1]);
      return b - a < LIMITS.part ? null : { ...e, range: [us(a), us(b)] as [number, number] };
    })
    .filter((e): e is SoundEffect => !!e);
  return out.length ? out : undefined;
}

const withEffects = (r: SoundRecipe, effects: SoundEffect[] | undefined): SoundRecipe => {
  const out = { ...r, effects };
  if (!effects) delete out.effects;
  return out;
};

/**
 * The tracks an edit that moves what follows is made on: with `inStep` (the editor's "Keep the tracks in step", as
 * Audacity's sync-lock) every track, so a deletion or an insertion closes or opens the same time on all of them and
 * what is placed on the timeline (the other tracks' clips, the markers) stays in step; else the tracks given.
 */
export const rippleTracks = (r: SoundRecipe, tracks: string[], inStep: boolean): string[] => (inStep ? r.tracks.map((t) => t.id) : tracks);

/** Split the clips at `t` on these tracks. */
export function splitAt(r: SoundRecipe, tracks: string[], t: number): SoundRecipe {
  return onTracks(r, tracks, (x) => ({ ...x, clips: splitClips(x.clips, t) }));
}

/** Take the sound from `a` to `b` out of these tracks, leaving silence (nothing moves). */
export function clearRange(r: SoundRecipe, tracks: string[], a: number, b: number): SoundRecipe {
  if (b - a < LIMITS.part) return r;
  return onTracks(r, tracks, (x) => ({ ...x, clips: splitClips(splitClips(x.clips, a), b).filter((c) => clipEnd(c) <= a + 1e-6 || c.at >= b - 1e-6) }));
}

/** Delete from `a` to `b` on these tracks: with `ripple`, what comes after moves back to close the gap. */
export function deleteRange(r: SoundRecipe, tracks: string[], a: number, b: number, ripple: boolean): Edited {
  const cleared = clearRange(r, tracks, a, b);
  if (!ripple) return { recipe: cleared, map: same };
  const len = b - a;
  const map: TimeMap = (t) => (t <= a ? t : t >= b ? t - len : a);
  const moved = onTracks(cleared, tracks, (x) => ({ ...x, clips: x.clips.map((c) => (c.at >= b - 1e-6 ? { ...c, at: us(Math.max(a, c.at - len)) } : c)) }));
  return { recipe: withEffects(moved, moveEffects(r, tracks, map)), map: allOf(r, tracks) ? map : same };
}

/** Several parts deleted (or silenced) at once: from the last, so the others stay where they are until their turn. */
export function deleteRanges(r: SoundRecipe, tracks: string[], ranges: [number, number][], ripple: boolean): Edited {
  const merged = mergeRanges(ranges);
  let out = r;
  const maps: TimeMap[] = [];
  for (const [a, b] of [...merged].reverse()) {
    const e = deleteRange(out, tracks, a, b, ripple);
    out = e.recipe;
    maps.push(e.map);
  }
  return { recipe: out, map: (t) => maps.reduce((x, m) => m(x), t) };
}

/** Ranges in order, those that touch or overlap made one. */
export function mergeRanges(ranges: [number, number][], gap = 0): [number, number][] {
  const out: [number, number][] = [];
  for (const [a, b] of [...ranges].filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0])) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + gap) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** Open a gap of `len` seconds at `t` on these tracks: what is at `t` or after moves on. */
export function insertGap(r: SoundRecipe, tracks: string[], t: number, len: number): Edited {
  if (len < LIMITS.part) return { recipe: r, map: same };
  const map: TimeMap = (x) => (x < t ? x : x + len);
  const split = splitAt(r, tracks, t);
  const moved = onTracks(split, tracks, (x) => ({ ...x, clips: x.clips.map((c) => (c.at >= t - 1e-6 ? { ...c, at: us(c.at + len) } : c)) }));
  // An effect over the place keeps covering what was there, and what goes in too.
  const fx = moveEffects(r, tracks, (x) => (x < t ? x : x + len));
  return { recipe: withEffects(moved, fx), map: allOf(r, tracks) ? map : same };
}

/** What was copied: each track's clips, from the start of the part copied, and how long it is. */
export interface SoundClipboard {
  length: number;
  tracks: { name?: string; clips: SoundClip[] }[];
  /** The sound being edited when it was copied ("" in its clips stands for it). */
  from: string;
}

/** The part from `a` to `b` of these tracks, to paste. */
export function copyRange(r: SoundRecipe, tracks: string[], a: number, b: number, from: string): SoundClipboard {
  return {
    length: us(b - a),
    from,
    tracks: r.tracks
      .filter((t) => tracks.includes(t.id))
      .map((t) => ({
        ...(t.name ? { name: t.name } : {}),
        clips: t.clips
          .filter((c) => clipEnd(c) > a + LIMITS.part && c.at < b - LIMITS.part)
          .map((c) => {
            const p = piece(c, Math.max(a, c.at), Math.min(b, clipEnd(c)));
            return { ...p, at: us(p.at - a) };
          }),
      })),
  };
}

/**
 * What was copied, put in at `t` on these tracks (the first copied track on the first of them, and so on; more copied
 * tracks than given go on new tracks): with `ripple` the rest moves on to make room (with `inStep`, on every track),
 * without it (a video's sound) it goes over what is there, and what reaches past the end is left out.
 */
export function pasteAt(r: SoundRecipe, tracks: string[], t: number, clip: SoundClipboard, ripple: boolean, src: string, inStep = false): Edited & { tracks: string[] } {
  let out = r;
  const targets = [...tracks];
  while (targets.length < clip.tracks.length && out.tracks.length < LIMITS.tracks) {
    const nt: SoundTrack = { id: newId(), name: clip.tracks[targets.length]?.name ?? `Track ${out.tracks.length + 1}`, clips: [] };
    out = { ...out, tracks: [...out.tracks, nt] };
    targets.push(nt.id);
  }
  const used = targets.slice(0, clip.tracks.length);
  let map: TimeMap = same;
  if (ripple) {
    // `inStep`: the tracks that are not pasted into open the same gap, so every track stays in step (and the markers go with them).
    const e = insertGap(out, inStep ? out.tracks.map((x) => x.id) : used, t, clip.length);
    out = e.recipe;
    map = e.map;
  } else out = clearRange(out, used, t, t + clip.length);
  const end = r.length;
  // A clip of the sound being edited stays its; one of another sound being edited names that sound.
  const srcOf = (s: string) => (s === '' ? (clip.from === src ? '' : clip.from) : s === src ? '' : s);
  out = {
    ...out,
    tracks: out.tracks.map((x) => {
      const i = used.indexOf(x.id);
      if (i < 0) return x;
      const add = clip.tracks[i].clips
        .map((c) => ({ ...c, id: newId(), src: srcOf(c.src), at: us(c.at + t) }))
        .flatMap((c) => (end === undefined || clipEnd(c) <= end + 1e-6 ? [c] : c.at < end - LIMITS.part ? [piece(c, c.at, end)] : []));
      return { ...x, clips: [...x.clips, ...add].sort((a, b) => a.at - b.at) };
    }),
  };
  return { recipe: out, map, tracks: used };
}

/** Keep only `a` to `b` on every track; with `ripple` it then starts at 0 (a video's sound keeps its place, silent around it). */
export function trimTo(r: SoundRecipe, a: number, b: number, ripple: boolean): Edited {
  const all = r.tracks.map((t) => t.id);
  const end = Math.max(soundLength(r), b);
  const after = deleteRange(r, all, b, end, ripple);
  const before = deleteRange(after.recipe, all, 0, a, ripple);
  // The whole sound's effects that were all of it stay so; ranges past the end are gone with it.
  return { recipe: before.recipe, map: (t) => before.map(after.map(t)) };
}

/** Change the speed of `a` to `b` on these tracks by `factor` (the clips' own speed times it): the rest moves to fit. */
export function changeSpeed(r: SoundRecipe, tracks: string[], a: number, b: number, factor: number): Edited {
  if (!(factor > 0) || Math.abs(factor - 1) < 0.0005 || b - a < LIMITS.part) return { recipe: r, map: same };
  const split = splitAt(splitAt(r, tracks, a), tracks, b);
  const k = 1 / factor;
  const map: TimeMap = (t) => (t <= a ? t : t >= b ? t - (b - a) * (1 - k) : a + (t - a) * k);
  const moved = onTracks(split, tracks, (x) => ({
    ...x,
    clips: x.clips.map((c) => {
      if (c.at >= b - 1e-6) return { ...c, at: us(map(c.at)) };
      if (c.at < a - 1e-6) return c;
      const speed = Math.min(MAX_SPEED, Math.max(MIN_SPEED, (c.speed ?? 1) * factor));
      const out: SoundClip = { ...c, at: us(map(c.at)), speed: Math.round(speed * 1000) / 1000 };
      if (Math.abs(out.speed! - 1) < 0.0005) delete out.speed;
      if (out.fadeIn) out.fadeIn = r3(out.fadeIn * k);
      if (out.fadeOut) out.fadeOut = r3(out.fadeOut * k);
      if (out.env) out.env = envScale(out.env, k);
      return out;
    }),
  }));
  return { recipe: withEffects(moved, moveEffects(r, tracks, map)), map: allOf(r, tracks) ? map : same };
}

/** Where a clip may go on a track: between the clips before and after `at` (it moves as far as there is room). */
export function placeClip(clips: SoundClip[], c: SoundClip, at: number, end?: number): number {
  const len = clipLength(c);
  const others = clips.filter((x) => x.id !== c.id);
  let lo = 0;
  let hi = end !== undefined ? end - len : Infinity;
  // The gap around where it is dropped: after the last clip that starts before its middle, before the next.
  const mid = at + len / 2;
  for (const x of others) {
    const xm = (x.at + clipEnd(x)) / 2;
    if (xm <= mid) lo = Math.max(lo, clipEnd(x));
    else hi = Math.min(hi, x.at - len);
  }
  if (hi < lo) return Number.NaN;
  return us(Math.min(hi, Math.max(lo, at)));
}

/** A clip moved to `at` on `toTrack` (where there is room): the recipe, or null when it does not fit there. */
export function moveClip(r: SoundRecipe, fromTrack: string, clipId: string, toTrack: string, at: number): SoundRecipe | null {
  const src = r.tracks.find((t) => t.id === fromTrack);
  const c = src?.clips.find((x) => x.id === clipId);
  const dest = r.tracks.find((t) => t.id === toTrack);
  if (!c || !dest) return null;
  const where = placeClip(dest.clips, c, at, r.length);
  if (!Number.isFinite(where)) return null;
  const moved = { ...c, at: where };
  return {
    ...r,
    tracks: r.tracks.map((t) => {
      if (t.id === fromTrack && t.id === toTrack) return { ...t, clips: t.clips.map((x) => (x.id === clipId ? moved : x)).sort((a, b) => a.at - b.at) };
      if (t.id === fromTrack) return { ...t, clips: t.clips.filter((x) => x.id !== clipId) };
      if (t.id === toTrack) return { ...t, clips: [...t.clips, moved].sort((a, b) => a.at - b.at) };
      return t;
    }),
  };
}

/** A clip's start or end dragged to the timeline's `t` (its sound's part follows), kept inside its sound and its neighbours. */
export function trimClip(r: SoundRecipe, track: string, clipId: string, edge: 'start' | 'end', t: number, srcLength: number | undefined): SoundRecipe {
  return onTracks(r, [track], (x) => {
    const i = x.clips.findIndex((c) => c.id === clipId);
    if (i < 0) return x;
    const c = x.clips[i];
    const s = c.speed ?? 1;
    const prevEnd = i > 0 ? clipEnd(x.clips[i - 1]) : 0;
    const nextAt = i < x.clips.length - 1 ? x.clips[i + 1].at : (r.length ?? Infinity);
    let next: SoundClip;
    if (edge === 'start') {
      const lo = Math.max(prevEnd, c.at - c.from / s);
      const at = Math.min(clipEnd(c) - LIMITS.part * 4, Math.max(lo, t));
      next = { ...c, at: us(at), from: us(c.from + (at - c.at) * s) };
    } else {
      const hi = Math.min(nextAt, srcLength !== undefined ? c.at + (srcLength - c.from) / s : Infinity);
      const end = Math.max(c.at + LIMITS.part * 4, Math.min(hi, t));
      next = { ...c, to: us(c.from + (end - c.at) * s) };
    }
    const half = clipLength(next) / 2;
    // Its volume line follows the sound: what is cut off goes, what is let in has the line's first or last volume.
    const env = envSlice(c.env, next.at - c.at, clipEnd(next) - c.at);
    delete next.env;
    if (env) next.env = env;
    if (next.fadeIn && next.fadeIn > half) next.fadeIn = r3(half);
    if (next.fadeOut && next.fadeOut > half) next.fadeOut = r3(half);
    return { ...x, clips: x.clips.map((y) => (y.id === clipId ? next : y)) };
  });
}

/**
 * Long pauses made short: each silence (start and end on the timeline, as found) longer than `longer` keeps `keep`
 * seconds, half at each end, and the rest is taken out, the rest moving back (with `ripple`) or left silent.
 */
export function shortenPauses(r: SoundRecipe, tracks: string[], silences: [number, number][], o: { longer: number; keep: number; ripple: boolean }): Edited & { removed: number; count: number } {
  const cut: [number, number][] = [];
  for (const [a, b] of silences) if (b - a > o.longer && b - a > o.keep) cut.push([a + o.keep / 2, b - o.keep / 2]);
  const e = deleteRanges(r, tracks, cut, o.ripple);
  return { ...e, removed: cut.reduce((n, [a, b]) => n + b - a, 0), count: cut.length };
}

/**
 * The silent stretches of a sound from its loudness along it (`levels`: the loudest sample of each slice, 0 to 1,
 * `perSecond` slices a second): where it stays under `threshold` dB for at least `min` seconds.
 */
export function silencesIn(levels: ArrayLike<number>, perSecond: number, o: { threshold: number; min: number; start?: number }): [number, number][] {
  const lim = Math.pow(10, o.threshold / 20);
  const out: [number, number][] = [];
  let from = -1;
  const at = (i: number) => (o.start ?? 0) + i / perSecond;
  for (let i = 0; i <= levels.length; i++) {
    const quiet = i < levels.length && levels[i] < lim;
    if (quiet && from < 0) from = i;
    if (!quiet && from >= 0) {
      if ((i - from) / perSecond >= o.min) out.push([at(from), at(i)]);
      from = -1;
    }
  }
  return out;
}

// ---- words ------------------------------------------------------------------------------------------------------------

/** A word of a sound, as speech recognition heard it: its text, and where it is in that sound (seconds). */
export interface SoundWord {
  w: string;
  a: number;
  b: number;
}

/** Words said to fill a pause ("um", "uh", "ähm", "εεε", "嗯"), by how they are written in the languages the app speaks and a few more. */
const FILLERS = new Set([
  'um',
  'umm',
  'ummm',
  'uh',
  'uhh',
  'uhm',
  'uhmm',
  'erm',
  'er',
  'err',
  'ah',
  'ahh',
  'eh',
  'ehm',
  'hm',
  'hmm',
  'hmmm',
  'mm',
  'mmm',
  'mhm',
  'äh',
  'ähm',
  'öhm',
  'euh',
  'eeh',
  'ehh',
  'εε',
  'εεε',
  'εμ',
  'εμμ',
  'μμ',
  'αα',
  '嗯',
  '呃',
  '额',
  '唔',
  '啊',
]);

/** Whether a word is one said only to fill a pause. */
export const isFiller = (w: string) => FILLERS.has(w.toLowerCase().replace(/[\s.,!?;:…"'“”‘’()\-–—]+/g, ''));

/** The words heard in a track, on the timeline: each clip's words of its sound, where the clip plays them. */
export function wordsOnTrack(t: SoundTrack, words: (src: string) => SoundWord[] | undefined): (SoundWord & { clip: string })[] {
  const out: (SoundWord & { clip: string })[] = [];
  for (const c of t.clips) {
    const list = words(c.src);
    if (!list) continue;
    for (const w of list) {
      // A word half in the clip counts when most of it is.
      const a = Math.max(w.a, c.from);
      const b = Math.min(w.b, c.to);
      if (b - a < (w.b - w.a) / 2 || b <= a) continue;
      out.push({ w: w.w, a: us(timelineTime(c, a)), b: us(timelineTime(c, b)), clip: c.id });
    }
  }
  return out.sort((x, y) => x.a - y.a);
}

// ---- the reverb's rooms and the echo's repeats, made alike in the browser and by ffmpeg ------------------------------

/** A small random number maker that always gives the same numbers for the same seed. */
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A room's sound as a reverb hears it (an impulse response): noise falling 60 dB in the room's time, darker as it
 * goes, a little different in each ear; its energy 1 a channel, so its sound is about as loud as what goes in.
 */
export function roomResponse(room: number, rate: number): [Float32Array, Float32Array] {
  const r = ROOMS[Math.max(0, Math.min(ROOMS.length - 1, Math.round(room)))];
  const n = Math.max(16, Math.round(rate * Math.min(5, r.rt60 * 1.15)));
  const pre = Math.round((rate * r.pre) / 1000);
  const out: [Float32Array, Float32Array] = [new Float32Array(n), new Float32Array(n)];
  for (let ch = 0; ch < 2; ch++) {
    const rnd = mulberry(7919 * (room + 1) + ch * 104729);
    const h = out[ch];
    let lp = 0;
    let energy = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / rate;
      const env = Math.exp((-6.907755 * t) / r.rt60);
      // Darker as it rings: a low-pass that closes over time.
      const k = Math.min(0.97, r.damp * (0.4 + (t / r.rt60) * 1.2));
      lp = lp * k + (rnd() * 2 - 1) * (1 - k);
      // A few milliseconds to come in, so it starts without a click.
      const attack = Math.min(1, (i - pre) / Math.max(1, rate * 0.002));
      h[i] = lp * env * attack;
      energy += h[i] * h[i];
    }
    const k = energy > 0 ? 1 / Math.sqrt(energy) : 0;
    for (let i = 0; i < n; i++) h[i] *= k;
  }
  return out;
}

/** The echo's repeats: each `delay` ms after the last, `decay` as loud, until they are under 1% (at most 12, at most 20 s on). */
export function echoTaps(delayMs: number, decay: number): { ms: number; gain: number }[] {
  const out: { ms: number; gain: number }[] = [];
  let g = decay;
  for (let k = 1; k <= 12 && g >= 0.01 && k * delayMs <= 20_000; k++) {
    out.push({ ms: Math.round(k * delayMs), gain: Math.round(g * 10000) / 10000 });
    g *= decay;
  }
  return out;
}

/**
 * How a track's pan puts its left and right in each speaker, as the browser's StereoPannerNode does it (so the editor
 * and the saved sound agree): [left from left, left from right, right from left, right from right].
 */
export function panMatrix(pan: number): [number, number, number, number] {
  const p = Math.max(-1, Math.min(1, pan));
  const x = p <= 0 ? p + 1 : p;
  const gl = Math.cos((x * Math.PI) / 2);
  const gr = Math.sin((x * Math.PI) / 2);
  return p <= 0 ? [1, gl, 0, gr] : [gl, 0, gr, 1];
}

/** dB as a gain (−∞ below −120). */
export const dbGain = (d: number) => (d <= -120 ? 0 : Math.pow(10, d / 20));
export const gainDb = (g: number) => (g <= 0 ? -Infinity : 20 * Math.log10(g));

/** A fade's level at `x` (0 to 1 of the way): straight, or smooth (a half sine). */
export const fadeCurve = (x: number, smooth: boolean) => {
  const v = Math.min(1, Math.max(0, x));
  return smooth ? 0.5 - 0.5 * Math.cos(Math.PI * v) : v;
};

// ---- asks and answers -------------------------------------------------------------------------------------------------

/**
 * Where the result goes: a sound kept for a video ("naget-sound:<sha>"), a Library sound's file replaced or a new one
 * beside it, a new one in the Library (from a session's sound: that session's), a file written over (the old one to the
 * Trash) or a copy beside it.
 */
export type SoundSaveTo = { sound: true } | { media: string; as: 'replace' | 'copy' } | { library: true; session?: string; title?: string } | { file: string; as: 'replace' | 'copy' };

/** POST /api/mediaedit/audio. */
export interface SoundEditAsk {
  /** The sound being edited: a Library sound ("media:<id>" or its /api/media/<id>/file), a kept one, or a file's path (a sound, or a video whose sound it is). */
  src: string;
  recipe: SoundRecipe;
  out: SoundOutput;
  to: SoundSaveTo;
  /** A name for what is made, when it is new ("Interview (edited)"). */
  name?: string;
}

/** An edit being made, and then what it made (GET /api/mediaedit/audio/:job). */
export interface SoundEditJob {
  job: string;
  status: 'queued' | 'running' | 'done' | 'failed' | 'stopped';
  /** How far it is, 0 to 1, and what it is doing ("Measuring its loudness", "Making it"). */
  progress?: number;
  step?: string;
  format: SoundFormat;
  /** Done: a kept sound ("naget-sound:…"), the Library item it went to, or the file it was written to. */
  src?: string;
  media?: string;
  path?: string;
  seconds?: number;
  bytes?: number;
  error?: string;
  startedAt: number;
  endedAt?: number;
}

/** What the editor learns of a sound before editing it (GET /api/mediaedit/audio/info). */
export interface SoundFacts {
  /** ffmpeg is here; without it, why, in words a person can act on. */
  ffmpeg: boolean;
  why?: string;
  duration?: number;
  /** Samples a second, and channels (1 or 2; more are heard as 2). */
  rate?: number;
  channels?: number;
  /** The kind of sound in it ("mp3", "aac", "opus"…), and its kind of file. */
  codec?: string;
  format?: SoundFormat | null;
  /** It is a video's sound. */
  video?: boolean;
  bytes?: number;
  /** What to call it. */
  name?: string;
}

/** A sound the editor keeps (a recording, a file from this device, a sound made with AI): POST /api/mediaedit/audio/sounds. */
export interface KeptSound {
  src: string;
  duration: number;
  rate?: number;
  channels?: number;
  name?: string;
}
