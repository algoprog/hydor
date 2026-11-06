// A video's edit, as the video editor keeps it and edit_video asks for it: a timeline. Its main track holds clips one
// after another (videos, each a part of its source, and pictures, each shown for a while with a slow zoom and pan),
// each with its own speed, sound, crop and turn, colour (shared/video-grade.ts) and effects, and a transition into the
// next; tracks over it hold overlays (a logo, a watermark, a video in a corner, a green screen) and words (titles and
// captions); tracks under it hold music and a voice-over. The output has a shape (the first clip's, or 16:9, 9:16, 1:1,
// 4:5), each clip fitted or filling it, and fades from and to black. The server makes it with ffmpeg as one checked
// filter graph (server/mediaedit/video-plan.ts); the editor shows the same in the browser while it is being made.
//
// Times of clips are seconds of their own source (the part kept); everything else is seconds of the timeline (the
// edited video), where clips follow one another and a transition overlaps the two clips it joins by its length.
//
// The first recipes edited one video (a trim, cuts, a speed, a crop, colour, music…): they are read still, as a
// timeline of the parts that video keeps (normalizeVideoRecipe).
//
// A clip's picture is turned first, then mirrored, then cropped: the crop is in the "upright frame" (its pixels once
// turned and mirrored), as the picture editor's is (shared/mediaedit.ts).
import { normalizeGrade, type VideoGrade } from './video-grade.ts';

export type { VideoGrade } from './video-grade.ts';

/** Turned clockwise, in degrees. */
export type VideoTurn = 0 | 90 | 180 | 270;

export interface VideoCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A title or caption over the video. */
export interface VideoText {
  /** The editor's own name for it (to pick it). */
  id?: string;
  text: string;
  /** When it shows, in seconds of the timeline. */
  from: number;
  to: number;
  /** Where its middle is: a share of the picture's width and height (0.5, 0.5 is the middle). */
  x: number;
  y: number;
  /** How tall its letters are: a share of the picture's height (0.07 a caption, 0.12 a title). */
  size: number;
  /** Its colour, "#rrggbb". */
  color: string;
  /** A box behind it, "#rrggbb" or "#rrggbbaa" (with how solid it is); none when left out. */
  background?: string;
  /** An edge around its letters, "#rrggbb". */
  outline?: string;
  bold?: boolean;
  /** Made from what is said (captions): kept together, styled together, saved as .srt. */
  caption?: boolean;
}

/** The ways one clip goes into the next (ffmpeg's xfade, and acrossfade for their sound). */
export const VIDEO_TRANSITIONS = [
  { id: 'dissolve', label: 'Cross dissolve', ff: 'fade' },
  { id: 'black', label: 'Fade through black', ff: 'fadeblack' },
  { id: 'white', label: 'Fade through white', ff: 'fadewhite' },
  { id: 'wipeleft', label: 'Wipe left', ff: 'wipeleft' },
  { id: 'wiperight', label: 'Wipe right', ff: 'wiperight' },
  { id: 'wipeup', label: 'Wipe up', ff: 'wipeup' },
  { id: 'wipedown', label: 'Wipe down', ff: 'wipedown' },
  { id: 'slideleft', label: 'Slide left', ff: 'slideleft' },
  { id: 'slideright', label: 'Slide right', ff: 'slideright' },
  { id: 'slideup', label: 'Slide up', ff: 'slideup' },
  { id: 'slidedown', label: 'Slide down', ff: 'slidedown' },
  { id: 'circleopen', label: 'Circle open', ff: 'circleopen' },
  { id: 'circleclose', label: 'Circle close', ff: 'circleclose' },
  { id: 'zoomin', label: 'Zoom in', ff: 'zoomin' },
] as const;
export type VideoTransitionKind = (typeof VIDEO_TRANSITIONS)[number]['id'];

export interface VideoTransition {
  kind: VideoTransitionKind;
  /** Seconds the two clips overlap: at most half of the shorter. */
  length: number;
}

/** Where a picture is looked at: how near (1 the whole of it, up to 4), and the middle of what shows (a share of its width and height). */
export interface VideoView {
  zoom: number;
  x: number;
  y: number;
}

/** A slow zoom and pan over a picture (Ken Burns): from one view to another over its length. */
export interface VideoMotion {
  from: VideoView;
  to: VideoView;
}

/** One clip of the main track. */
export interface VideoClip {
  /** The editor's own name for it (to pick it, and to find its sound and frames). */
  id?: string;
  /** Its video or picture: a deck's ("naget-video:…", "naget-asset:…"), a Library item ("media:<id>"), a sound-less file's path; none: the video being edited. */
  src?: string;
  /** Its name, to show. */
  name?: string;
  /** A picture, shown for `length` seconds. */
  picture?: boolean;
  /** A frame of the video held still: the moment (seconds of the source), shown for `length` seconds. */
  still?: number;
  /** The part of the video kept, in seconds of the source (all of it when left out). */
  trim?: [number, number];
  /** How long a picture or a held frame shows, in seconds. */
  length?: number;
  /** How fast it plays, 0.25 to 4. */
  speed?: number;
  /** false: its sound's pitch goes up and down with its speed (as a tape would); kept in tune otherwise. */
  keepPitch?: false;
  /** Played backwards, picture and sound. */
  reverse?: boolean;
  /** Steadied (ffmpeg's deshake). */
  stabilize?: boolean;
  rotate?: VideoTurn;
  flipH?: boolean;
  flipV?: boolean;
  /** The part of the picture kept, in its upright frame. */
  crop?: VideoCrop;
  /** In the output's shape: fitted inside it (bars where the shapes differ), or filling it (its edges cut off). */
  fit?: 'fill';
  /** A picture's (or a held frame's) slow zoom and pan. */
  motion?: VideoMotion;
  /** Its sound: how loud, 0 to 4 (1 as it is: up to +12 dB), or none at all. */
  volume?: number;
  mute?: boolean;
  /** Its sound's channels, volume line, silenced parts and fixes (in seconds of the clip on the timeline). */
  channels?: SoundChannels;
  levels?: [number, number][];
  silence?: [number, number][];
  clean?: number;
  even?: boolean;
  /** Seconds its sound fades in and out (its picture does not). */
  soundFadeIn?: number;
  soundFadeOut?: number;
  /**
   * A sound in place of its own (a Library sound "media:<id>", "naget-sound:…" or a sound file), with the same timing:
   * its second t stands for the source's second t, so the clip's trim, speed and direction apply to it too.
   */
  sound?: string;
  grade?: VideoGrade;
  /** How it goes into the next clip; none: a cut. */
  transition?: VideoTransition;
}

/** A picture or a video over the main track (V2, V3): a logo, a watermark, a video in a corner, a green screen. */
export interface VideoOverlay {
  id?: string;
  src: string;
  name?: string;
  picture?: boolean;
  /** Its track, 2 or 3: a higher one shows over a lower one. */
  track?: number;
  /** When it starts, in seconds of the timeline. */
  start: number;
  /** A picture's length in seconds (a video's comes from its trim). */
  length?: number;
  /** A video's part kept, in seconds of its source. */
  trim?: [number, number];
  /** Where its middle is, and how wide it is: shares of the output's width and height. */
  x: number;
  y: number;
  w: number;
  /** 0 to 1. */
  opacity?: number;
  /** A colour taken out (green screen): how near a colour must be to go, and how softly its edges go. */
  key?: { color: string; similarity: number; blend: number };
  /** Seconds it fades in and out. */
  fadeIn?: number;
  fadeOut?: number;
}

/** Music (A2) or a voice-over (A3): a sound placed on the timeline. */
export interface VideoAudio {
  id?: string;
  /** A Library sound ("media:<id>"), a sound kept by the editor ("naget-sound:…") or a sound file's path. */
  src: string;
  name?: string;
  track: 'music' | 'voice';
  /** When it starts, in seconds of the timeline. */
  start: number;
  /** The part of it kept, in seconds of the sound. */
  trim?: [number, number];
  /** 0 to 4 (1 as it is: up to +12 dB). */
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
  /** Its channels, volume line, silenced parts and fixes (in seconds of it on the timeline). */
  channels?: SoundChannels;
  levels?: [number, number][];
  silence?: [number, number][];
  clean?: number;
  even?: boolean;
  /** The clip whose own sound it was (detached), to put it back. */
  clip?: string;
}

/** Which channels a sound is heard from, and where: a lapel microphone on one channel is the usual case. */
export const SOUND_CHANNELS = [
  { id: 'stereo', label: 'Stereo', badge: '' },
  { id: 'left', label: 'Left only', badge: 'L' },
  { id: 'right', label: 'Right only', badge: 'R' },
  { id: 'left-both', label: 'Left on both sides', badge: 'LL' },
  { id: 'right-both', label: 'Right on both sides', badge: 'RR' },
  { id: 'mono', label: 'Mix to mono', badge: 'M' },
  { id: 'swap', label: 'Swap left and right', badge: 'RL' },
] as const;
export type SoundChannels = Exclude<(typeof SOUND_CHANNELS)[number]['id'], 'stereo'>;

/** Each way as ffmpeg's pan filter mixes it (the only values the plan lets pan have). */
export const PAN_LAYOUTS: Record<SoundChannels, string> = {
  left: 'stereo|c0=c0|c1=0*c1',
  right: 'stereo|c0=0*c0|c1=c1',
  'left-both': 'stereo|c0=c0|c1=c0',
  'right-both': 'stereo|c0=c1|c1=c1',
  mono: 'stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1',
  swap: 'stereo|c0=c1|c1=c0',
};

/** The same as how much of the left (l) and the right (r) goes to each side: [ll, rl, lr, rr] (from-to). */
export const CHANNEL_MATRIX: Record<SoundChannels | 'stereo', [number, number, number, number]> = {
  stereo: [1, 0, 0, 1],
  left: [1, 0, 0, 0],
  right: [0, 0, 0, 1],
  'left-both': [1, 0, 1, 0],
  'right-both': [0, 1, 0, 1],
  mono: [0.5, 0.5, 0.5, 0.5],
  swap: [0, 1, 1, 0],
};

/** The lowest and highest a volume line goes, in dB. */
export const LEVEL_MIN = -60;
export const LEVEL_MAX = 12;

/** A volume line's dB at `t` seconds into it: flat before its first point and after its last, straight between. */
export function levelAt(levels: [number, number][] | undefined, t: number): number {
  if (!levels?.length) return 0;
  if (t <= levels[0][0]) return levels[0][1];
  for (let i = 0; i < levels.length - 1; i++) {
    const [t0, d0] = levels[i];
    const [t1, d1] = levels[i + 1];
    if (t < t1) return d0 + ((d1 - d0) * (t - t0)) / Math.max(1e-6, t1 - t0);
  }
  return levels[levels.length - 1][1];
}

/** Whether `t` seconds into a sound is in a part silenced. */
export const silencedAt = (silence: [number, number][] | undefined, t: number) => !!silence?.some(([a, b]) => t >= a && t <= b);

const exprNum = (x: number) => {
  const v = Math.round(x * 1000) / 1000;
  return v < 0 ? `(0-${-v})` : String(v);
};

/**
 * ffmpeg's volume expression (eval=frame) for a volume line and the parts silenced: the dB straight between the points,
 * as a gain; times the silenced parts' zero. null when there is neither.
 */
export function volumeExpr(levels: [number, number][] | undefined, silence: [number, number][] | undefined): string | null {
  const parts: string[] = [];
  if (levels?.length) {
    let e = exprNum(levels[levels.length - 1][1]);
    for (let i = levels.length - 2; i >= 0; i--) {
      const [t0, d0] = levels[i];
      const [t1, d1] = levels[i + 1];
      const seg = Math.abs(d1 - d0) < 1e-6 ? exprNum(d0) : `${exprNum(d0)}+${exprNum(d1 - d0)}*(t-${exprNum(t0)})/${exprNum(Math.max(0.001, t1 - t0))}`;
      e = `if(lt(t,${exprNum(t1)}),${seg},${e})`;
    }
    e = `if(lt(t,${exprNum(levels[0][0])}),${exprNum(levels[0][1])},${e})`;
    parts.push(`pow(10,(${e})/20)`);
  }
  for (const [a, b] of silence ?? []) parts.push(`(1-between(t,${exprNum(a)},${exprNum(b)}))`);
  return parts.length ? parts.join('*') : null;
}

/** The fades the overlap of two sounds on one track makes (a crossfade): each sound's id and its fade in and out, in seconds. */
export function overlapFades(items: VideoAudio[], lengthOf: (a: VideoAudio) => number): Map<string, { in: number; out: number }> {
  const out = new Map<string, { in: number; out: number }>();
  for (const track of ['music', 'voice'] as const) {
    const xs = items.filter((a) => a.track === track).sort((a, b) => a.start - b.start);
    for (let i = 0; i < xs.length; i++)
      for (let j = i + 1; j < xs.length; j++) {
        const a = xs[i];
        const b = xs[j];
        const over = a.start + lengthOf(a) - b.start;
        if (over <= 0.01) continue;
        const d = Math.min(over, lengthOf(b) / 2, lengthOf(a) / 2);
        const ka = a.id ?? String(i);
        const kb = b.id ?? String(j);
        out.set(ka, { in: out.get(ka)?.in ?? 0, out: Math.max(out.get(ka)?.out ?? 0, d) });
        out.set(kb, { in: Math.max(out.get(kb)?.in ?? 0, d), out: out.get(kb)?.out ?? 0 });
      }
  }
  return out;
}

/** The tracks, as the timeline names them: V1 the clips, V2 and V3 overlays, T1 words, A1 the clips' sound, A2 music, A3 voice. */
export const VIDEO_TRACKS = ['t1', 'v3', 'v2', 'v1', 'a1', 'a2', 'a3'] as const;
export type VideoTrackId = (typeof VIDEO_TRACKS)[number];

/** A track as the output has it: hidden (a video track), muted or soloed, its level (0 to 2) and where it sits left to right (-1 to 1). */
export interface VideoTrackMix {
  hidden?: boolean;
  mute?: boolean;
  solo?: boolean;
  volume?: number;
  pan?: number;
}

/** Quick sound fixes for the whole video. */
export interface VideoFixes {
  /** Clean up the voices (the clips' own sound and the voice-over): noise reduced, rumble cut, 0 to 1. */
  voice?: number;
  /** Even out the loudness: for the web (-14 LUFS) or for broadcast (-23). */
  loudness?: 'web' | 'broadcast';
  /** Lower the music under speech, 0 to 1. */
  duck?: number;
}

/** The shapes the output takes (none: the first clip's). */
export const VIDEO_OUT_SHAPES = ['16:9', '9:16', '1:1', '4:5'] as const;
export type VideoOutShape = (typeof VIDEO_OUT_SHAPES)[number];

/** A video's edit. Every part is left out when it changes nothing. */
export interface VideoRecipe {
  clips?: VideoClip[];
  overlays?: VideoOverlay[];
  audio?: VideoAudio[];
  texts?: VideoText[];
  /** The output's shape; none: the first clip's. */
  shape?: VideoOutShape;
  /** Seconds at the start coming in from black and silence, and at the end going back to them. */
  fadeIn?: number;
  fadeOut?: number;
  tracks?: Partial<Record<VideoTrackId, VideoTrackMix>>;
  fixes?: VideoFixes;
  // ---- the first recipes' (one video): read into clips by normalizeVideoRecipe -------------------------------------
  trim?: [number, number];
  cuts?: [number, number][];
  speed?: number;
  rotate?: VideoTurn;
  flipH?: boolean;
  flipV?: boolean;
  crop?: VideoCrop;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  volume?: number;
  mute?: boolean;
  music?: { src: string; name?: string; volume?: number; start?: number };
}

/** What an edit makes: a video (MP4, MOV or WebM), a GIF, a picture of one frame; `wav` only the sound (for captions). */
export type VideoOut = 'mp4' | 'webm' | 'mov' | 'gif' | 'jpg' | 'png' | 'wav';

export const VIDEO_CODECS = [
  { id: 'h264', label: 'H.264' },
  { id: 'h265', label: 'H.265' },
  { id: 'av1', label: 'AV1' },
] as const;
export type VideoCodec = (typeof VIDEO_CODECS)[number]['id'];

export const VIDEO_QUALITIES = [
  { id: 'small', label: 'Smaller file' },
  { id: 'standard', label: 'Standard' },
  { id: 'high', label: 'High' },
] as const;
export type VideoQuality = (typeof VIDEO_QUALITIES)[number]['id'];

/** Frames a second offered (none: the first video clip's own, at most 60). */
export const VIDEO_FPS = [24, 25, 30, 50, 60] as const;

/** Ready-made export settings: a shape, a size and a kind of file. */
export const VIDEO_PRESETS = [
  { id: 'youtube', label: 'YouTube 1080p', shape: '16:9', size: 1080, codec: 'h264' },
  { id: 'youtube4k', label: 'YouTube 4K', shape: '16:9', size: 2160, codec: 'h264' },
  { id: 'reels', label: 'Reels, TikTok and Shorts', shape: '9:16', size: 1080, codec: 'h264' },
  { id: 'square', label: 'Square post', shape: '1:1', size: 1080, codec: 'h264' },
  { id: 'portrait', label: 'Portrait post (4:5)', shape: '4:5', size: 1080, codec: 'h264' },
] as const;

/**
 * Where the result goes: kept as a deck's video ("naget-video:<sha>", with its first frame as a kept picture), as a
 * deck's picture ("naget-asset:<sha>": a frame, a GIF), a Library item's file replaced or a new item beside it, a new
 * item in the Library (from a session's video: that session's), or a file written over (the old one to the Trash) or a
 * copy beside it.
 */
export type VideoSaveTo = { video: true } | { asset: true } | { media: string; as: 'replace' | 'copy' } | { library: true; session?: string } | { file: string; as: 'replace' | 'copy' };

/** POST /api/mediaedit/video. */
export interface VideoEditAsk {
  /** The video being edited: "naget-video:<sha>", a Library item ("media:<id>" or its /api/media/<id>/file), or a file's path. Clips without a src are of it. */
  src: string;
  recipe: VideoRecipe;
  /** What to make (mp4 when left out). */
  format?: VideoOut;
  /** A picture of this moment instead, in seconds of the timeline (format jpg or png). */
  frame?: number;
  /** Only this part of the timeline, in seconds (the In and Out marks). */
  range?: [number, number];
  /** The output's shorter side at most, in pixels (2160, 1080, 720, 480). */
  size?: number;
  /** The shorter side exactly `size`, larger than the clips if need be (the editor's sizes and ready-made settings). */
  exactSize?: boolean;
  /** Frames a second (none: the first video clip's, at most 60). */
  fps?: number;
  /** MP4's and MOV's codec (H.264 when left out). */
  codec?: VideoCodec;
  quality?: VideoQuality;
  /** 'cpu': made on the processor even with a graphics card that could. */
  encoder?: 'auto' | 'cpu';
  /** A deck's video: its still taken at this moment (seconds of the timeline) rather than at its start. */
  still?: number;
  to: VideoSaveTo;
  /** The editor's texts as it draws them: a PNG (a data: address) for each of the recipe's texts, in its order, at the output's size. */
  drawn?: string[];
}

/** An edit being made, and then what it made (GET /api/mediaedit/video/:job). */
export interface VideoEditJob {
  job: string;
  status: 'queued' | 'running' | 'done' | 'failed' | 'stopped';
  /** How far it is, 0 to 1. */
  progress?: number;
  format: VideoOut;
  /** What makes it: the graphics card (`gpu`, and which way: "NVIDIA NVENC") or the processor. */
  made?: { gpu: boolean; by: string };
  /** Something to know of how it was made ("The graphics card could not make it, so the processor did"). */
  note?: string;
  /** Done: a kept video or picture ("naget-video:…", "naget-asset:…"), and a video's first frame (a kept picture). */
  src?: string;
  poster?: string;
  /** Done: the Library item it went to, by id, or the file it was written to. */
  media?: string;
  path?: string;
  w?: number;
  h?: number;
  seconds?: number;
  bytes?: number;
  error?: string;
  startedAt: number;
  endedAt?: number;
}

/** What the editor learns of a video, a picture or a sound before using it (GET /api/mediaedit/video/info). */
export interface VideoFacts {
  /** ffmpeg is here (this computer's or the picture tools' own); without it, why, in words a person can act on. */
  ffmpeg: boolean;
  why?: string;
  /** A picture, or a sound (no picture at all). */
  picture?: boolean;
  sound?: boolean;
  duration?: number;
  /** As it shows (a phone's video turned upright). */
  width?: number;
  height?: number;
  audio?: boolean;
  fps?: number;
}

/** A clip's source as the timeline needs it. `duration` is 0 for a picture. */
export interface VideoSize {
  duration: number;
  width: number;
  height: number;
  picture?: boolean;
  audio?: boolean;
  fps?: number;
}

/** The facts of each source by its src (none: the video being edited); undefined when it is not known. */
export type VideoFactsOf = (src: string | undefined) => VideoSize | undefined;

export const VIDEO_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
/** The shapes the editor crops to ('free': any). */
export const VIDEO_SHAPES = ['free', '16:9', '9:16', '1:1', '4:5'] as const;
export type VideoShape = (typeof VIDEO_SHAPES)[number];

/** The shortest part kept, in seconds (shorter ones are left out), and the most of each thing an edit carries. */
export const MIN_PART = 0.05;
export const MAX_TEXTS = 300;
export const MAX_CLIPS = 200;
export const MAX_OVERLAYS = 20;
export const MAX_AUDIO = 40;
/** How long a picture shows when put in, in seconds. */
export const PICTURE_SECONDS = 4;
/** The longest GIF made, in seconds of the edited video: longer ones are files too large to share. */
export const MAX_GIF_SECONDS = 60;
/** The longest transition, in seconds. */
export const MAX_TRANSITION = 5;

const HEX = /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i;
const ID = /^[A-Za-z0-9_-]{1,24}$/;

const num = (v: unknown, lo: number, hi: number): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : undefined;
};
/** Seconds to the thousandth. */
const ms = (n: number) => Math.round(n * 1000) / 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);
const obj = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);

/** A short id for a new clip, text or sound. */
export const videoId = () => Math.random().toString(36).slice(2, 10);

/** A colour as the recipe keeps it ("#rrggbb", "#rrggbbaa"), from "#rgb" too; undefined for anything else. */
export function hexColor(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  let s = v.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(s)) s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return HEX.test(s) ? s : undefined;
}

/** A shape's width over its height ("16:9" → 1.78); NaN for 'free' or anything else. */
export function shapeRatio(shape: string): number {
  const m = /^(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)$/.exec(shape.trim());
  return m && Number(m[1]) > 0 && Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : NaN;
}

/** The size of the picture `w`×`h` turned by `rotate`. */
export const turnedSize = (w: number, h: number, rotate?: VideoTurn) => (rotate === 90 || rotate === 270 ? { w: h, h: w } : { w, h });

/** A clip's picture size: its crop's, or the whole picture's turned. */
export function editedSize(r: Pick<VideoClip, 'crop' | 'rotate'>, w: number, h: number): { w: number; h: number } {
  return r.crop ? { w: r.crop.w, h: r.crop.h } : turnedSize(w, h, r.rotate);
}

type Turning = Pick<VideoClip, 'rotate' | 'flipH' | 'flipV'>;

/** A point of the picture as given (`w`×`h`), in the upright frame (turned and mirrored). */
export function shownPoint(x: number, y: number, w: number, h: number, t: Turning): [number, number] {
  let [px, py] = t.rotate === 90 ? [h - y, x] : t.rotate === 180 ? [w - x, h - y] : t.rotate === 270 ? [y, w - x] : [x, y];
  const s = turnedSize(w, h, t.rotate);
  if (t.flipH) px = s.w - px;
  if (t.flipV) py = s.h - py;
  return [px, py];
}

/** A point of the upright frame, back in the picture as given (`w`×`h`). */
export function originalPoint(px: number, py: number, w: number, h: number, t: Turning): [number, number] {
  const s = turnedSize(w, h, t.rotate);
  if (t.flipH) px = s.w - px;
  if (t.flipV) py = s.h - py;
  return t.rotate === 90 ? [py, h - px] : t.rotate === 180 ? [w - px, h - py] : t.rotate === 270 ? [w - py, px] : [px, py];
}

const box = (a: [number, number], b: [number, number]): VideoCrop => ({ x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) });

/** A part of the picture as given, in the upright frame. */
export const shownRect = (c: VideoCrop, w: number, h: number, t: Turning) => box(shownPoint(c.x, c.y, w, h, t), shownPoint(c.x + c.w, c.y + c.h, w, h, t));
/** A part of the upright frame, in the picture as given. */
export const originalRect = (c: VideoCrop, w: number, h: number, t: Turning) => box(originalPoint(c.x, c.y, w, h, t), originalPoint(c.x + c.w, c.y + c.h, w, h, t));

/** The largest part in the middle of the picture `w`×`h` (turned by `rotate`) that has this shape ("9:16"), in the upright frame; null for 'free'. */
export function cropToShape(shape: string, w: number, h: number, rotate?: VideoTurn): VideoCrop | null {
  const ratio = shapeRatio(shape);
  if (!Number.isFinite(ratio)) return null;
  const u = turnedSize(w, h, rotate);
  let cw = u.w;
  let ch = u.w / ratio;
  if (ch > u.h) [cw, ch] = [u.h * ratio, u.h];
  cw = Math.min(u.w, even(cw));
  ch = Math.min(u.h, even(ch));
  return { x: Math.floor((u.w - cw) / 4) * 2, y: Math.floor((u.h - ch) / 4) * 2, w: cw, h: ch };
}

// ---- the first recipes' time: the parts one video keeps -------------------------------------------------------------

/** The parts of the original kept, in order: the trim less the cuts, each at least MIN_PART long. */
export function keptParts(r: Pick<VideoRecipe, 'trim' | 'cuts'>, duration: number): [number, number][] {
  const [a, b] = r.trim ?? [0, duration];
  let parts: [number, number][] = [[Math.max(0, a), Math.min(duration, b)]];
  for (const [s, e] of r.cuts ?? []) parts = parts.flatMap(([x, y]): [number, number][] => (e <= x || s >= y ? [[x, y]] : [...(s > x ? [[x, s] as [number, number]] : []), ...(e < y ? [[e, y] as [number, number]] : [])]));
  return parts.filter(([x, y]) => y - x >= MIN_PART);
}

/** How long one video is once trimmed, cut and sped up, in seconds. */
export function editedLength(r: Pick<VideoRecipe, 'trim' | 'cuts' | 'speed'>, duration: number): number {
  return keptParts(r, duration).reduce((n, [x, y]) => n + y - x, 0) / (r.speed ?? 1);
}

/** A moment of the original, in the edited video's time (a moment cut out: where the next part kept begins). */
export function toEdited(t: number, parts: [number, number][], speed = 1): number {
  let had = 0;
  for (const [x, y] of parts) {
    if (t < x) return had / speed;
    if (t <= y) return (had + t - x) / speed;
    had += y - x;
  }
  return had / speed;
}

/** A moment of the edited video, in the original's time. */
export function toOriginal(e: number, parts: [number, number][], speed = 1): number {
  let left = Math.max(0, e * speed);
  for (const [x, y] of parts) {
    if (left <= y - x) return x + left;
    left -= y - x;
  }
  return parts.length ? parts[parts.length - 1][1] : 0;
}

/** Whether a moment of the original is kept (in the trim and in no cut). */
export const isKept = (t: number, parts: [number, number][]) => parts.some(([x, y]) => t >= x && t < y);

// ---- the timeline ---------------------------------------------------------------------------------------------------

/** A clip's facts: its own source's, or the video being edited's. */
export const factsOfClip = (c: Pick<VideoClip, 'src'>, factsOf: VideoFactsOf) => factsOf(c.src);

/** Whether a clip shows one picture for a while (a picture, or a frame held). */
export const isStill = (c: Pick<VideoClip, 'picture' | 'still'>) => !!c.picture || c.still !== undefined;

/** How long a clip is on the timeline, in seconds. */
export function clipLength(c: VideoClip, f: VideoSize | undefined): number {
  if (isStill(c) || f?.picture) return c.length ?? PICTURE_SECONDS;
  const [a, b] = c.trim ?? [0, f?.duration ?? 0];
  return Math.max(0, b - a) / (c.speed ?? 1);
}

/** Where a clip is on the timeline: its start and length, and the transitions into it and out of it (their lengths). */
export interface ClipSpan {
  start: number;
  length: number;
  end: number;
  tin: number;
  tout: number;
}

/** Where each clip is on the timeline (a transition overlaps the two clips it joins), and the timeline's length. */
export function clipSpans(clips: VideoClip[], factsOf: VideoFactsOf): { spans: ClipSpan[]; length: number } {
  const spans: ClipSpan[] = [];
  let at = 0;
  let tin = 0;
  clips.forEach((c, i) => {
    const length = clipLength(c, factsOf(c.src));
    const tout = i < clips.length - 1 ? (c.transition?.length ?? 0) : 0;
    spans.push({ start: at, length, end: at + length, tin, tout });
    at += length - tout;
    tin = tout;
  });
  return { spans, length: spans.length ? spans[spans.length - 1].end : 0 };
}

/** How long the edited video is, in seconds. */
export const timelineLength = (r: VideoRecipe, factsOf: VideoFactsOf) => clipSpans(r.clips ?? [], factsOf).length;

/** The moment of a clip's source shown `u` seconds into the clip (its trim, speed and direction; a picture's is 0). */
export function sourceAt(c: VideoClip, f: VideoSize | undefined, u: number): number {
  if (c.still !== undefined) return c.still;
  if (c.picture || f?.picture) return 0;
  const [a, b] = c.trim ?? [0, f?.duration ?? 0];
  const s = c.speed ?? 1;
  return c.reverse ? Math.max(a, b - u * s) : Math.min(b, a + u * s);
}

/** The clips showing at a moment of the timeline: the one, or the two a transition joins (the outgoing first). */
export function clipsAt(spans: ClipSpan[], t: number): number[] {
  const out: number[] = [];
  spans.forEach((s, i) => {
    if (t >= s.start - 1e-6 && t < s.end - 1e-6) out.push(i);
  });
  if (!out.length && spans.length && t >= spans[spans.length - 1].end - 1e-6) out.push(spans.length - 1);
  return out.slice(0, 2);
}

/** The views of a slow zoom and pan, by name, as the editor offers them. */
export const VIDEO_MOTIONS = [
  { id: 'none', label: 'Still' },
  { id: 'in', label: 'Zoom in' },
  { id: 'out', label: 'Zoom out' },
  { id: 'left', label: 'Pan left' },
  { id: 'right', label: 'Pan right' },
  { id: 'up', label: 'Pan up' },
  { id: 'down', label: 'Pan down' },
] as const;
export type VideoMotionId = (typeof VIDEO_MOTIONS)[number]['id'];

/** A named zoom and pan, `amount` (0 to 1) of the way it can go: undefined for none. */
export function motionPreset(id: VideoMotionId, amount = 0.5): VideoMotion | undefined {
  const z = 1 + 0.6 * Math.max(0.05, Math.min(1, amount));
  const half = 0.5 - 1 / (2 * z);
  const mid = { zoom: 1, x: 0.5, y: 0.5 };
  switch (id) {
    case 'in':
      return { from: mid, to: { zoom: r3(z), x: 0.5, y: 0.5 } };
    case 'out':
      return { from: { zoom: r3(z), x: 0.5, y: 0.5 }, to: mid };
    case 'left':
      return { from: { zoom: r3(z), x: r3(0.5 + half), y: 0.5 }, to: { zoom: r3(z), x: r3(0.5 - half), y: 0.5 } };
    case 'right':
      return { from: { zoom: r3(z), x: r3(0.5 - half), y: 0.5 }, to: { zoom: r3(z), x: r3(0.5 + half), y: 0.5 } };
    case 'up':
      return { from: { zoom: r3(z), x: 0.5, y: r3(0.5 + half) }, to: { zoom: r3(z), x: 0.5, y: r3(0.5 - half) } };
    case 'down':
      return { from: { zoom: r3(z), x: 0.5, y: r3(0.5 - half) }, to: { zoom: r3(z), x: 0.5, y: r3(0.5 + half) } };
    default:
      return undefined;
  }
}

/** Which named motion a clip's is, if any. */
export function motionId(m?: VideoMotion): VideoMotionId {
  if (!m) return 'none';
  const dz = m.to.zoom - m.from.zoom;
  if (Math.abs(dz) > 0.01) return dz > 0 ? 'in' : 'out';
  const dx = m.to.x - m.from.x;
  const dy = m.to.y - m.from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}

/** A view kept inside the picture: its middle no nearer the edge than half of what shows. */
export function clampView(v: VideoView): VideoView {
  const zoom = Math.min(4, Math.max(1, v.zoom));
  const h = 1 / (2 * zoom);
  return { zoom: r3(zoom), x: r3(Math.min(1 - h, Math.max(h, v.x))), y: r3(Math.min(1 - h, Math.max(h, v.y))) };
}

/** Where a slow zoom and pan is `u` seconds into a clip `length` long (moving evenly, as ffmpeg's zoompan makes it). */
export function viewAt(m: VideoMotion | undefined, u: number, length: number): VideoView {
  if (!m) return { zoom: 1, x: 0.5, y: 0.5 };
  const p = length > 0 ? Math.min(1, Math.max(0, u / length)) : 0;
  return { zoom: m.from.zoom + (m.to.zoom - m.from.zoom) * p, x: m.from.x + (m.to.x - m.from.x) * p, y: m.from.y + (m.to.y - m.from.y) * p };
}

/** The output's size: its shape, the first clip's shorter side (at most 4K), no larger than `size` on its shorter side; even. */
export function outputSize(r: Pick<VideoRecipe, 'clips' | 'shape'>, factsOf: VideoFactsOf, o: { size?: number; exact?: boolean } = {}): { w: number; h: number } {
  const c = r.clips?.[0];
  const f = c ? factsOf(c.src) : undefined;
  let base = c && f ? editedSize(c, f.width, f.height) : { w: 1920, h: 1080 };
  const k0 = Math.min(1, 3840 / Math.max(base.w, base.h), 2160 / Math.min(base.w, base.h));
  base = { w: base.w * k0, h: base.h * k0 };
  let w = base.w;
  let h = base.h;
  const ratio = r.shape ? shapeRatio(r.shape) : NaN;
  if (Number.isFinite(ratio)) {
    const short = Math.min(base.w, base.h);
    [w, h] = ratio >= 1 ? [short * ratio, short] : [short, short / ratio];
  }
  if (o.size && (o.exact || Math.min(w, h) > o.size)) {
    const k = o.size / Math.min(w, h);
    w *= k;
    h *= k;
  }
  return { w: even(Math.round(w)), h: even(Math.round(h)) };
}

/** Where a picture `w`×`h` sits in the output `W`×`H`: fitted inside it, or filling it (centred, its edges cut off); even sides. */
export function fitBox(w: number, h: number, W: number, H: number, fill?: boolean): { x: number; y: number; w: number; h: number } {
  const k = fill ? Math.max(W / w, H / h) : Math.min(W / w, H / h);
  const bw = even(Math.round(w * k));
  const bh = even(Math.round(h * k));
  return { x: Math.round((W - bw) / 2), y: Math.round((H - bh) / 2), w: bw, h: bh };
}

/** The tracks heard: a muted track not, and with any soloed, only those. */
export function heard(r: Pick<VideoRecipe, 'tracks'>, id: 'a1' | 'a2' | 'a3'): boolean {
  const t = r.tracks ?? {};
  if (t[id]?.mute) return false;
  const solo = (['a1', 'a2', 'a3'] as const).some((k) => t[k]?.solo);
  return !solo || !!t[id]?.solo;
}

/** An audio item's length on the timeline, in seconds. */
export function audioLength(a: VideoAudio, f: VideoSize | undefined): number {
  const [x, y] = a.trim ?? [0, f?.duration ?? 0];
  return Math.max(0, y - x);
}

/** An overlay's length on the timeline, in seconds. */
export function overlayLength(o: VideoOverlay, f: VideoSize | undefined): number {
  if (o.picture || f?.picture) return o.length ?? PICTURE_SECONDS;
  const [x, y] = o.trim ?? [0, f?.duration ?? 0];
  return Math.max(0, y - x);
}

// ---- reading and checking an edit -------------------------------------------------------------------------------------

/** A sound's channels, volume line, silenced parts and fixes, made to fit a sound `len` seconds long. */
function soundShapeOf(raw: Record<string, any>, len: number): Pick<VideoAudio, 'channels' | 'levels' | 'silence' | 'clean' | 'even'> {
  const out: Pick<VideoAudio, 'channels' | 'levels' | 'silence' | 'clean' | 'even'> = {};
  if (typeof raw.channels === 'string' && raw.channels !== 'stereo' && raw.channels in PAN_LAYOUTS) out.channels = raw.channels as SoundChannels;
  const pts: [number, number][] = [];
  for (const p of Array.isArray(raw.levels) ? raw.levels : []) {
    if (!Array.isArray(p) || p.length !== 2) continue;
    const t = num(p[0], 0, len);
    const d = num(p[1], LEVEL_MIN, LEVEL_MAX);
    if (t !== undefined && d !== undefined) pts.push([ms(t), Math.round(d * 10) / 10]);
  }
  pts.sort((a, b) => a[0] - b[0]);
  const levels = pts.filter((p, i) => !i || p[0] - pts[i - 1][0] >= 0.01).slice(0, 64);
  if (levels.some(([, d]) => Math.abs(d) >= 0.05)) out.levels = levels;
  const sil = (Array.isArray(raw.silence) ? raw.silence : [])
    .map((p: unknown) => pairIn(p, 0, len))
    .filter((p: [number, number] | null): p is [number, number] => !!p)
    .sort((a: [number, number], b: [number, number]) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [a, b] of sil) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1] + 0.001) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  if (merged.length) out.silence = merged.slice(0, 100);
  const clean = num(raw.clean, 0, 1);
  if (clean !== undefined && clean >= 0.01) out.clean = r2(clean);
  if (raw.even === true) out.even = true;
  return out;
}

function pairIn(p: unknown, lo: number, hi: number): [number, number] | null {
  if (!Array.isArray(p) || p.length !== 2) return null;
  const a = num(p[0], lo, hi);
  const b = num(p[1], lo, hi);
  return a === undefined || b === undefined || b - a < MIN_PART ? null : [ms(a), ms(b)];
}

function viewOf(v: unknown): VideoView | null {
  const o = obj(v);
  const zoom = num(o.zoom, 1, 4);
  const x = num(o.x, 0, 1);
  const y = num(o.y, 0, 1);
  if (zoom === undefined && x === undefined && y === undefined) return null;
  return clampView({ zoom: zoom ?? 1, x: x ?? 0.5, y: y ?? 0.5 });
}

/** A clip's turn, mirroring and crop, against its picture `w`×`h`. */
function framing(c: Record<string, any>, w: number, h: number): Pick<VideoClip, 'rotate' | 'flipH' | 'flipV' | 'crop'> {
  const out: Pick<VideoClip, 'rotate' | 'flipH' | 'flipV' | 'crop'> = {};
  const rot = Number(c.rotate);
  const turn = (((Math.round(rot / 90) * 90) % 360) + 360) % 360;
  if (Number.isFinite(rot) && turn) out.rotate = turn as VideoTurn;
  if (c.flipH === true) out.flipH = true;
  if (c.flipV === true) out.flipV = true;
  // The crop in the upright frame: its size as asked (even, as H.264 needs), moved inside where it reaches past an edge.
  const u = turnedSize(w, h, out.rotate);
  if (c.crop && typeof c.crop === 'object' && u.w >= 16 && u.h >= 16) {
    const cw = Math.min(even(u.w), even(num(c.crop.w, 16, u.w) ?? u.w));
    const ch = Math.min(even(u.h), even(num(c.crop.h, 16, u.h) ?? u.h));
    const x = Math.max(0, Math.min(u.w - cw, Math.round(num(c.crop.x, 0, u.w) ?? 0)));
    const y = Math.max(0, Math.min(u.h - ch, Math.round(num(c.crop.y, 0, u.h) ?? 0)));
    if (x > 0 || y > 0 || cw < even(u.w) || ch < even(u.h)) out.crop = { x, y, w: cw, h: ch };
  }
  return out;
}

/** One clip as it can be made of its source; null when its source is not known. */
function clipOf(raw: unknown, factsOf: VideoFactsOf): VideoClip | null {
  const c = obj(raw);
  const src = str(c.src, 4096);
  const f = factsOf(src);
  if (!f) return null;
  const out: VideoClip = {};
  if (typeof c.id === 'string' && ID.test(c.id)) out.id = c.id;
  if (src) out.src = src;
  const name = str(c.name, 200);
  if (name) out.name = name;
  const still = !f.picture && c.still !== undefined && c.still !== null ? num(c.still, 0, f.duration) : undefined;
  if (f.picture) out.picture = true;
  else if (still !== undefined) out.still = ms(still);
  if (isStill(out)) out.length = ms(num(c.length, 0.2, 600) ?? PICTURE_SECONDS);
  else {
    const trim = pairIn(c.trim, 0, f.duration);
    if (trim && (trim[0] > 0.001 || trim[1] < f.duration - 0.001)) out.trim = trim;
    const speed = num(c.speed, 0.25, 4);
    if (speed !== undefined && Math.abs(speed - 1) > 0.001) out.speed = r2(speed);
    if (c.keepPitch === false) out.keepPitch = false;
    if (c.reverse === true) out.reverse = true;
    if (c.stabilize === true) out.stabilize = true;
  }
  Object.assign(out, framing(c, f.width, f.height));
  if (c.fit === 'fill') out.fit = 'fill';
  if (isStill(out) && c.motion && typeof c.motion === 'object') {
    const from = viewOf(c.motion.from);
    const to = viewOf(c.motion.to);
    if (from && to && (from.zoom !== 1 || to.zoom !== 1 || from.x !== to.x || from.y !== to.y)) out.motion = { from, to };
  }
  if (!isStill(out)) {
    if (c.mute === true) out.mute = true;
    const vol = num(c.volume, 0, 4);
    if (!out.mute && vol !== undefined && Math.abs(vol - 1) > 0.005) out.volume = r2(vol);
    const sound = str(c.sound, 4096);
    if (sound && !out.mute) out.sound = sound;
    if (!out.mute) {
      const len = clipLength(out, f);
      Object.assign(out, soundShapeOf(c, len));
      for (const k of ['soundFadeIn', 'soundFadeOut'] as const) {
        const n = num(c[k], 0, len / 2);
        if (n !== undefined && n >= 0.05) out[k] = r2(n);
      }
    }
  }
  const grade = normalizeGrade(c.grade);
  if (grade) out.grade = grade;
  const t = obj(c.transition);
  if (VIDEO_TRANSITIONS.some((x) => x.id === t.kind)) {
    const length = num(t.length, 0, MAX_TRANSITION) ?? 1;
    if (length >= 0.1) out.transition = { kind: t.kind as VideoTransitionKind, length: r2(length) };
  }
  return out;
}

function textOf(raw: unknown, length: number): VideoText | null {
  const t = obj(raw);
  if (typeof t.text !== 'string') return null;
  const text = t.text
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 300);
  if (!text) return null;
  const from = num(t.from, 0, length) ?? 0;
  const to = num(t.to, 0, length) ?? length;
  if (to - from < MIN_PART) return null;
  const bg = hexColor(t.background);
  const outline = hexColor(t.outline)?.slice(0, 7);
  return {
    ...(typeof t.id === 'string' && ID.test(t.id) ? { id: t.id } : {}),
    text,
    from: ms(from),
    to: ms(to),
    x: r3(num(t.x, 0, 1) ?? 0.5),
    y: r3(num(t.y, 0, 1) ?? 0.85),
    size: r3(num(t.size, 0.02, 0.3) ?? 0.07),
    color: hexColor(t.color)?.slice(0, 7) ?? '#ffffff',
    ...(bg ? { background: bg } : {}),
    ...(outline ? { outline } : {}),
    ...(t.bold === true ? { bold: true } : {}),
    ...(t.caption === true ? { caption: true } : {}),
  };
}

function overlayOf(raw: unknown, factsOf: VideoFactsOf, length: number): VideoOverlay | null {
  const o = obj(raw);
  const src = str(o.src, 4096);
  const f = src ? factsOf(src) : undefined;
  if (!src || !f) return null;
  const start = num(o.start, 0, Math.max(0, length - MIN_PART)) ?? 0;
  const room = length - start;
  const out: VideoOverlay = { src, start: ms(start), x: 0.5, y: 0.5, w: 0.3 };
  if (typeof o.id === 'string' && ID.test(o.id)) out.id = o.id;
  const name = str(o.name, 200);
  if (name) out.name = name;
  if (f.picture) {
    out.picture = true;
    out.length = ms(Math.min(room, num(o.length, 0.1, 3600) ?? Math.min(PICTURE_SECONDS, room)));
  } else {
    let trim = pairIn(o.trim, 0, f.duration) ?? [0, ms(f.duration)];
    if (trim[1] - trim[0] > room) trim = [trim[0], ms(trim[0] + room)];
    if (trim[0] > 0.001 || trim[1] < f.duration - 0.001) out.trim = trim;
  }
  out.track = num(o.track, 2, 3) === 3 ? 3 : 2;
  out.x = r3(num(o.x, -0.5, 1.5) ?? 0.5);
  out.y = r3(num(o.y, -0.5, 1.5) ?? 0.5);
  out.w = r3(num(o.w, 0.02, 2) ?? 0.3);
  const op = num(o.opacity, 0, 1);
  if (op !== undefined && op < 0.995) out.opacity = r2(op);
  const k = obj(o.key);
  const kc = hexColor(k.color)?.slice(0, 7);
  if (kc) out.key = { color: kc, similarity: r2(num(k.similarity, 0.01, 0.8) ?? 0.3), blend: r2(num(k.blend, 0, 0.5) ?? 0.1) };
  const len = overlayLength(out, f);
  for (const key of ['fadeIn', 'fadeOut'] as const) {
    const n = num(o[key], 0, len / 2);
    if (n !== undefined && n >= 0.05) out[key] = r2(n);
  }
  return len >= MIN_PART ? out : null;
}

function audioOf(raw: unknown, factsOf: VideoFactsOf, length: number): VideoAudio | null {
  const a = obj(raw);
  const src = str(a.src, 4096);
  const f = src ? factsOf(src) : undefined;
  if (!src || !f || !f.duration) return null;
  const start = num(a.start, 0, Math.max(0, length - 0.1)) ?? 0;
  const out: VideoAudio = { src, track: a.track === 'voice' ? 'voice' : 'music', start: ms(start) };
  if (typeof a.id === 'string' && ID.test(a.id)) out.id = a.id;
  const name = str(a.name, 200);
  if (name) out.name = name;
  let trim = pairIn(a.trim, 0, f.duration) ?? [0, ms(f.duration)];
  // No longer than the timeline after its start.
  if (trim[1] - trim[0] > length - start) trim = [trim[0], ms(trim[0] + (length - start))];
  if (trim[1] - trim[0] < MIN_PART) return null;
  if (trim[0] > 0.001 || trim[1] < f.duration - 0.001) out.trim = trim;
  const vol = num(a.volume, 0, 4);
  if (vol !== undefined && Math.abs(vol - 1) > 0.005) out.volume = r2(vol);
  const len = trim[1] - trim[0];
  for (const key of ['fadeIn', 'fadeOut'] as const) {
    const n = num(a[key], 0, len / 2);
    if (n !== undefined && n >= 0.05) out[key] = r2(n);
  }
  Object.assign(out, soundShapeOf(a, len));
  if (typeof a.clip === 'string' && ID.test(a.clip)) out.clip = a.clip;
  return out;
}

/** The first recipes' one-video edit, as clips: one for each part it keeps, with what it did to the whole. */
function fromFirstRecipe(r: Record<string, any>, main: VideoSize): Record<string, any> {
  const d = main.duration;
  const pair = (p: unknown) => pairIn(p, 0, d);
  const trim = pair(r.trim);
  const cuts = (Array.isArray(r.cuts) ? r.cuts : []).map(pair).filter((c: [number, number] | null): c is [number, number] => !!c);
  const parts = keptParts({ trim: trim ?? undefined, cuts }, d);
  if (!parts.length) throw new Error('Nothing of the video would be left: keep a part of it');
  const speed = num(r.speed, 0.25, 4) ?? 1;
  const grade = normalizeGrade({ brightness: r.brightness, contrast: r.contrast, saturation: r.saturation });
  const clip = (p: [number, number]) => ({
    ...(p[0] > 0.001 || p[1] < d - 0.001 ? { trim: p } : {}),
    speed,
    rotate: r.rotate,
    flipH: r.flipH,
    flipV: r.flipV,
    crop: r.crop,
    volume: r.volume,
    mute: r.mute,
    ...(grade ? { grade } : {}),
  });
  const texts = (Array.isArray(r.texts) ? r.texts : []).map((t: unknown) => {
    const x = obj(t);
    return { ...x, from: toEdited(num(x.from, 0, d) ?? 0, parts, speed), to: toEdited(num(x.to, 0, d) ?? d, parts, speed) };
  });
  const m = obj(r.music);
  const audio = typeof m.src === 'string' && m.src.trim() ? [{ src: m.src, name: m.name, track: 'music', volume: m.volume, start: m.start }] : [];
  return { clips: parts.map(clip), texts, audio, fadeIn: r.fadeIn, fadeOut: r.fadeOut };
}

/**
 * An edit as it can be made: every value in its range, times inside the timeline, each clip's trim inside its source,
 * transitions no longer than half the shorter clip they join, crops inside the picture with even sides (as H.264
 * needs), and whatever changes nothing left out. A first recipe (one video's trim, cuts, speed…) is read as the clips it
 * keeps. `sizes`: the video being edited's facts, or each source's (by src). Throws when nothing would be left.
 */
export function normalizeVideoRecipe(raw: unknown, sizes: VideoSize | VideoFactsOf): VideoRecipe {
  const factsOf: VideoFactsOf = typeof sizes === 'function' ? sizes : (src) => (src === undefined ? sizes : undefined);
  let r = obj(raw);
  if (!Array.isArray(r.clips)) {
    const main = factsOf(undefined);
    if (!main) throw new Error('The video being edited is not known');
    r = fromFirstRecipe(r, main);
  }
  const clips: VideoClip[] = [];
  for (const c of r.clips.slice(0, MAX_CLIPS)) {
    const clip = clipOf(c, factsOf);
    if (clip && clipLength(clip, factsOf(clip.src)) >= MIN_PART) clips.push(clip);
  }
  if (!clips.length) throw new Error('Nothing of the video would be left: keep a part of it');
  // Transitions: none after the last clip; at most half of the shorter of the two clips they join.
  const lengths = clips.map((c) => clipLength(c, factsOf(c.src)));
  clips.forEach((c, i) => {
    if (!c.transition) return;
    const most = i < clips.length - 1 ? Math.floor((Math.min(lengths[i], lengths[i + 1]) / 2) * 100) / 100 : 0;
    if (most < 0.1) delete c.transition;
    else if (c.transition.length > most) c.transition.length = most;
  });
  const out: VideoRecipe = { clips };
  const length = clipSpans(clips, factsOf).length;
  const overlays = (Array.isArray(r.overlays) ? r.overlays : [])
    .slice(0, MAX_OVERLAYS)
    .map((o: unknown) => overlayOf(o, factsOf, length))
    .filter((o: VideoOverlay | null): o is VideoOverlay => !!o);
  if (overlays.length) out.overlays = overlays;
  const audio = (Array.isArray(r.audio) ? r.audio : [])
    .slice(0, MAX_AUDIO)
    .map((a: unknown) => audioOf(a, factsOf, length))
    .filter((a: VideoAudio | null): a is VideoAudio => !!a);
  if (audio.length) out.audio = audio;
  const texts = (Array.isArray(r.texts) ? r.texts : [])
    .map((t: unknown) => textOf(t, length))
    .filter((t: VideoText | null): t is VideoText => !!t)
    .slice(0, MAX_TEXTS);
  if (texts.length) out.texts = texts;
  if ((VIDEO_OUT_SHAPES as readonly string[]).includes(r.shape)) out.shape = r.shape;
  for (const k of ['fadeIn', 'fadeOut'] as const) {
    // To the hundredth, rounded down: never longer than half of it.
    const n = num(r[k], 0, Math.min(10, length / 2));
    if (n !== undefined && n >= 0.05) out[k] = Math.floor(n * 100) / 100;
  }
  const tracks: Partial<Record<VideoTrackId, VideoTrackMix>> = {};
  for (const id of VIDEO_TRACKS) {
    const t = obj(obj(r.tracks)[id]);
    const m: VideoTrackMix = {};
    if (t.hidden === true && id[0] !== 'a') m.hidden = true;
    if (t.mute === true && id[0] === 'a') m.mute = true;
    if (t.solo === true && id[0] === 'a') m.solo = true;
    const vol = id[0] === 'a' ? num(t.volume, 0, 2) : undefined;
    if (vol !== undefined && Math.abs(vol - 1) > 0.005) m.volume = r2(vol);
    const pan = id[0] === 'a' ? num(t.pan, -1, 1) : undefined;
    if (pan !== undefined && Math.abs(pan) >= 0.01) m.pan = r2(pan);
    if (Object.keys(m).length) tracks[id] = m;
  }
  if (Object.keys(tracks).length) out.tracks = tracks;
  const fx = obj(r.fixes);
  const fixes: VideoFixes = {};
  const voice = num(fx.voice, 0, 1);
  if (voice !== undefined && voice >= 0.01) fixes.voice = r2(voice);
  if (fx.loudness === 'web' || fx.loudness === 'broadcast') fixes.loudness = fx.loudness;
  const duck = num(fx.duck, 0, 1);
  if (duck !== undefined && duck >= 0.01) fixes.duck = r2(duck);
  if (Object.keys(fixes).length) out.fixes = fixes;
  return out;
}

/** Whether an edit leaves the video being edited as it is: one clip of all of it, and nothing else. */
export function isPlainRecipe(r: VideoRecipe): boolean {
  const keys = Object.keys(r).filter((k) => k !== 'clips');
  if (keys.length) return false;
  const c = r.clips ?? [];
  return c.length === 1 && Object.keys(c[0]).every((k) => k === 'id' || k === 'name');
}

/** Whether an edit changes anything at all. */
export const changesVideo = (r: VideoRecipe) => !isPlainRecipe(r);

/**
 * The part of an edit between two moments of the timeline (In and Out, or a frame), as an edit of its own: the clips
 * outside it left out and those at its ends cut to it, the overlays, sounds and words moved to its time. Its time 0 is
 * `from`, give or take a transition it starts in (`offset` says where `from` is in it).
 */
export function windowRecipe(r: VideoRecipe, factsOf: VideoFactsOf, from: number, to: number): { recipe: VideoRecipe; offset: number; length: number } {
  const clips = r.clips ?? [];
  const { spans, length } = clipSpans(clips, factsOf);
  const a = Math.max(0, Math.min(from, length));
  const b = Math.max(a, Math.min(to, length));
  // The first clip showing at `a` (of two in a transition, the earlier), and the last showing at `b`.
  let first = spans.findIndex((s) => s.end > a + 1e-6);
  if (first < 0) first = spans.length - 1;
  let last = first;
  for (let i = first; i < spans.length; i++) if (spans[i].start < b - 1e-6) last = i;
  const out: VideoClip[] = [];
  let start = spans[first].start;
  for (let i = first; i <= last; i++) {
    const c: VideoClip = JSON.parse(JSON.stringify(clips[i]));
    const s = spans[i];
    const f = factsOf(c.src);
    // Cut at the window's ends: the first clip's head (it has no transition into it now), as far as its transition out
    // of it still fits; the last clip's tail, as far as its transition into it still fits.
    const cutHead = i === first ? Math.max(0, Math.min(a - s.start, s.length - (i === last ? 0 : s.tout) - MIN_PART)) : 0;
    const cutTail = i === last ? Math.max(0, Math.min(s.end - b, s.length - cutHead - (i === first ? 0 : s.tin) - MIN_PART)) : 0;
    if (i === first) start = s.start + cutHead;
    if (cutHead || cutTail) {
      const keep = s.length - cutHead - cutTail;
      if (isStill(c) || f?.picture) {
        if (c.motion) c.motion = { from: viewAt(c.motion, cutHead, s.length), to: viewAt(c.motion, s.length - cutTail, s.length) };
        c.length = ms(Math.max(MIN_PART, keep));
      } else {
        const sp = c.speed ?? 1;
        const [x, y] = c.trim ?? [0, f?.duration ?? 0];
        c.trim = c.reverse ? [ms(x + cutTail * sp), ms(y - cutHead * sp)] : [ms(x + cutHead * sp), ms(y - cutTail * sp)];
      }
    }
    if (i === last) delete c.transition;
    out.push(c);
  }
  const shift = (t: number) => t - start;
  const span = clipSpans(out, factsOf).length;
  const recipe: VideoRecipe = { ...r, clips: out };
  recipe.texts = (r.texts ?? []).filter((t) => t.to > start && t.from < start + span).map((t) => ({ ...t, from: Math.max(0, shift(t.from)), to: Math.min(span, shift(t.to)) }));
  recipe.overlays = (r.overlays ?? []).flatMap((o) => {
    const f = factsOf(o.src);
    const len = overlayLength(o, f);
    if (o.start + len <= start || o.start >= start + span) return [];
    const head = Math.max(0, start - o.start);
    const x: VideoOverlay = { ...o, start: Math.max(0, shift(o.start)) };
    if (head) {
      if (x.picture || f?.picture) x.length = ms(len - head);
      else {
        const [p, q] = o.trim ?? [0, f?.duration ?? 0];
        x.trim = [ms(p + head), q];
      }
    }
    return [x];
  });
  recipe.audio = (r.audio ?? []).flatMap((m) => {
    const f = factsOf(m.src);
    const len = audioLength(m, f);
    if (m.start + len <= start || m.start >= start + span) return [];
    const head = Math.max(0, start - m.start);
    const [p, q] = m.trim ?? [0, f?.duration ?? 0];
    return [{ ...m, start: Math.max(0, shift(m.start)), ...(head ? { trim: [ms(p + head), q] as [number, number], fadeIn: undefined } : {}) }];
  });
  // The whole video's fades, only where its start or end is in the window.
  if (start > 1e-6) delete recipe.fadeIn;
  if (start + span < length - 1e-6) delete recipe.fadeOut;
  return { recipe, offset: a - start, length: b - a };
}

/** The captions as an .srt file: each numbered, with its times ("00:00:01,200 --> 00:00:03,900") and words. */
export function captionsSrt(texts: Pick<VideoText, 'from' | 'to' | 'text'>[]): string {
  const at = (s: number) => {
    const t = Math.max(0, Math.round(s * 1000));
    const h = Math.floor(t / 3_600_000);
    const m = Math.floor((t % 3_600_000) / 60_000);
    const sec = Math.floor((t % 60_000) / 1000);
    const milli = t % 1000;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(milli).padStart(3, '0')}`;
  };
  return (
    [...texts]
      .sort((a, b) => a.from - b.from)
      .map((t, i) => `${i + 1}\n${at(t.from)} --> ${at(t.to)}\n${t.text.trim()}\n`)
      .join('\n')
  );
}

/** The caption styles offered: what each sets on every caption. */
export const CAPTION_STYLES = [
  { id: 'classic', label: 'Classic', set: { color: '#ffffff', background: '#000000b3', outline: undefined, bold: false, size: 0.055, y: 0.88 } },
  { id: 'bold', label: 'Bold yellow', set: { color: '#ffd60a', background: undefined, outline: '#000000', bold: true, size: 0.065, y: 0.85 } },
  { id: 'outline', label: 'White outline', set: { color: '#ffffff', background: undefined, outline: '#000000', bold: true, size: 0.06, y: 0.86 } },
  { id: 'big', label: 'Big, in the middle', set: { color: '#ffffff', background: undefined, outline: '#000000', bold: true, size: 0.09, y: 0.62 } },
  { id: 'light', label: 'Dark on light', set: { color: '#111111', background: '#ffffffe0', outline: undefined, bold: true, size: 0.055, y: 0.88 } },
] as const;
export type CaptionStyleId = (typeof CAPTION_STYLES)[number]['id'];

/** "1:05.3" for 65.3 seconds; tenths only under ten minutes. */
export function videoClock(s: number): string {
  const t = Math.max(0, s);
  const m = Math.floor(t / 60);
  const sec = t - m * 60;
  return m >= 10 ? `${m}:${String(Math.floor(sec)).padStart(2, '0')}` : `${m}:${sec.toFixed(1).padStart(4, '0')}`;
}

/** A timecode as editors show it, hours, minutes, seconds and frames: "00:01:05:12" at `fps`. */
export function timecode(s: number, fps: number): string {
  const f = Math.max(1, Math.round(fps));
  const total = Math.max(0, Math.floor(s * f + 1e-6));
  const fr = total % f;
  const secs = Math.floor(total / f);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(secs / 3600))}:${p(Math.floor((secs % 3600) / 60))}:${p(secs % 60)}:${p(fr)}`;
}
