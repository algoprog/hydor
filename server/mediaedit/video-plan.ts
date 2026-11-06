// A video's edit (shared/mediaedit-video.ts) as one ffmpeg command. Each clip of the main track is read from its own
// file (the part kept), played faster or slower (its sound in tune, or not), backwards, steadied, turned, mirrored,
// cropped, coloured (its grade as a 3D table, shared/video-grade.ts), sharpened, denoised, given a vignette and grain,
// and fitted into (or filling) the output's shape at one frame rate; a picture or a held frame shows still or with a
// slow zoom and pan. The clips are joined by cuts (concat) or transitions (xfade, and acrossfade for their sound); the
// overlays (pictures, videos, a green screen keyed out) and the words go over them; the music and the voice-over are
// laid under the clips' own sound, the voices cleaned up, the music lowered under speech, the loudness evened out;
// all faded in and out, cut to a part of the timeline if asked (In and Out, or one frame), and written as MP4 or MOV
// (H.264, H.265 or AV1, on the processor or the graphics card), WebM, a GIF, a picture of a frame, or (for captions)
// the voices alone as WAV. Pure: it only plans (video.ts runs it), so it can be tested without ffmpeg.
//
// The filter graph is built from parts and checked before it runs: only the filters below, each with only the options
// listed for it, values that are numbers, colours, time ranges and the names of files the job made in its own folder,
// nothing that could close a quote or start another filter. The command reads only the inputs it was given and writes
// only its output.
import type { VideoClip, VideoCodec, VideoFactsOf, VideoGrade, VideoOut, VideoQuality, VideoRecipe, VideoSize, VideoTransition } from '../../shared/mediaedit-video.ts';
import { audioLength, clipLength, clipSpans, editedSize, fitBox, heard, isStill, MIN_PART, outputSize, overlayLength, turnedSize, VIDEO_TRANSITIONS, windowRecipe } from '../../shared/mediaedit-video.ts';
import { cubeText, denoiseStrength, gradeHasColour, gradeLut, grainStrength, sharpenAmount, vignetteAngle } from '../../shared/video-grade.ts';
import { encoderArgs, hwDecode, hwInit, hwTail, type HwApi } from './video-gpu.ts';

/** The filters an edit uses, each with the options it may be given: none reads a file or an address but the job's own, runs commands, or listens for them. */
export const FILTER_OPTIONS: Record<string, readonly string[]> = {
  crop: ['w', 'h', 'x', 'y'],
  transpose: ['dir'],
  hflip: [],
  vflip: [],
  colorchannelmixer: ['rr', 'rg', 'rb', 'gr', 'gg', 'gb', 'br', 'bg', 'bb', 'aa'],
  lut3d: ['file', 'interp'],
  overlay: ['x', 'y', 'enable', 'eof_action'],
  drawtext: ['fontfile', 'textfile', 'expansion', 'fontsize', 'fontcolor', 'box', 'boxcolor', 'boxborderw', 'shadowcolor', 'shadowx', 'shadowy', 'borderw', 'bordercolor', 'x', 'y', 'enable'],
  split: ['outputs'],
  asplit: ['outputs'],
  trim: ['start', 'end', 'duration', 'end_frame'],
  atrim: ['start', 'end', 'duration'],
  setpts: ['expr'],
  asetpts: ['expr'],
  concat: ['n', 'v', 'a'],
  fps: ['fps'],
  fade: ['t', 'st', 'd', 'alpha'],
  afade: ['t', 'st', 'd'],
  volume: ['volume'],
  atempo: ['tempo'],
  asetrate: ['r'],
  aresample: ['osr'],
  adelay: ['delays', 'all'],
  amix: ['inputs', 'duration', 'dropout_transition', 'normalize'],
  scale: ['w', 'h', 'flags'],
  format: ['pix_fmts'],
  aformat: ['sample_fmts', 'sample_rates', 'channel_layouts'],
  palettegen: ['stats_mode'],
  paletteuse: ['dither', 'bayer_scale'],
  null: [],
  anull: [],
  xfade: ['transition', 'duration', 'offset'],
  acrossfade: ['d', 'c1', 'c2'],
  pad: ['w', 'h', 'x', 'y', 'color'],
  setsar: ['r'],
  tpad: ['stop_mode', 'stop_duration'],
  apad: [],
  anullsrc: ['r', 'cl'],
  reverse: [],
  areverse: [],
  deshake: ['rx', 'ry', 'edge'],
  zoompan: ['z', 'x', 'y', 'd', 's', 'fps'],
  colorkey: ['color', 'similarity', 'blend'],
  vignette: ['angle'],
  unsharp: ['lx', 'ly', 'la', 'cx', 'cy', 'ca'],
  hqdn3d: ['luma_spatial', 'chroma_spatial', 'luma_tmp', 'chroma_tmp'],
  noise: ['c0s', 'c0f'],
  highpass: ['f'],
  afftdn: ['nr', 'nf', 'tn'],
  sidechaincompress: ['threshold', 'ratio', 'attack', 'release', 'makeup'],
  loudnorm: ['i', 'tp', 'lra'],
  stereotools: ['balance_out'],
  hwupload: [],
};
export const ALLOWED_FILTERS = new Set(Object.keys(FILTER_OPTIONS));

type Value = string | number;

/** One filter: its name and its options, in order. */
export interface Filter {
  name: string;
  args?: [string, Value][];
}

/** A chain of filters from labelled inputs to labelled outputs: "[0:v]crop=…,transpose=1[v]". */
export interface Chain {
  ins: string[];
  filters: Filter[];
  outs: string[];
}

const LABEL = /^(?:\d{1,3}:[vVa]|[a-z][a-z0-9_]{0,15})$/;
/** A file the job made in its own folder (the command runs there): a font, the words of a text, a grade's table. */
const OWN_FILE = /^(?:font\d{1,3}\.(?:ttf|otf|ttc)|text\d{1,3}-\d{1,2}\.txt|grade\d{1,3}\.cube)$/;
const FILE_KEYS = new Set(['fontfile', 'textfile', 'file']);
/** What else a value may be: numbers, colours, expressions of numbers and t, w, h; nothing that closes a quote or starts a filter. */
const PLAIN = /^[A-Za-z0-9_.+\-*/@#()|, ]{0,240}$/;

/** A number as ffmpeg reads it: no exponent, a few decimals. */
export const n = (x: number, places = 3) => {
  if (!Number.isFinite(x)) throw new Error(`Not a number in the plan: ${x}`);
  const s = x.toFixed(places).replace(/\.?0+$/, '');
  return s === '-0' ? '0' : s;
};

const F = (name: string, ...args: [string, Value][]): Filter => (args.length ? { name, args } : { name });

/** Throws when a chain is not one the plan may run. */
export function checkChain(c: Chain): void {
  for (const l of [...c.ins, ...c.outs]) if (!LABEL.test(l)) throw new Error(`A label the plan may not use: ${l}`);
  if (!c.filters.length) throw new Error('A chain without filters');
  for (const f of c.filters) {
    const keys = FILTER_OPTIONS[f.name];
    if (!keys) throw new Error(`A filter the plan may not use: ${f.name}`);
    for (const [k, v] of f.args ?? []) {
      if (!keys.includes(k)) throw new Error(`An option the plan may not use: ${f.name} ${k}`);
      if (typeof v === 'number') {
        if (!Number.isFinite(v)) throw new Error(`${f.name} ${k} is not a number`);
      } else if (FILE_KEYS.has(k)) {
        if (!OWN_FILE.test(v)) throw new Error(`${f.name} may read only the job's own files, not ${v}`);
      } else if (!PLAIN.test(v)) throw new Error(`${f.name} ${k} has a value the plan may not use`);
    }
  }
}

/** A value as the filter graph reads it: quoted when it has a comma, a bracket or a space. */
const val = (v: Value) => (typeof v === 'number' ? n(v) : /[,() ]/.test(v) ? `'${v}'` : v);

/** The filter graph's text, its chains checked first. */
export function graphText(chains: Chain[]): string {
  return chains
    .map((c) => {
      checkChain(c);
      const fs = c.filters.map((f) => (f.args?.length ? `${f.name}=${f.args.map(([k, v]) => `${k}=${val(v)}`).join(':')}` : f.name)).join(',');
      return `${c.ins.map((l) => `[${l}]`).join('')}${fs}${c.outs.map((l) => `[${l}]`).join('')}`;
    })
    .join(';');
}

/** "0xrrggbb@0.6" from "#rrggbb" or "#rrggbbaa" (a background's colour and how solid it is). */
export function ffColor(hex: string, alpha?: number): string {
  const h = hex.replace('#', '').toLowerCase();
  const a = alpha ?? (h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1);
  return `0x${h.slice(0, 6)}@${n(Math.max(0, Math.min(1, a)), 2)}`;
}

/** atempo takes 0.5 to 2 at a time on older ffmpeg: a speed as a few of them. */
export function tempos(speed: number): number[] {
  const out: number[] = [];
  let left = speed;
  while (left > 2.0001) (out.push(2), (left /= 2));
  while (left < 0.4999) (out.push(0.5), (left /= 0.5));
  if (Math.abs(left - 1) > 0.0001) out.push(left);
  return out;
}

/** A text drawn here (for agents): its lines, each a file of the job's folder, and the font it is drawn in. */
export interface DrawHere {
  font: string;
  lines: string[];
}
/** A text as the editor drew it (a PNG of the job's, its size), or how to draw it here. */
export type TextHow = { png: string; w: number; h: number } | DrawHere;

/** The encoders this ffmpeg has, for the processor. */
export interface Encoders {
  h264?: string;
  h265?: string;
  av1?: string;
  vp9?: string;
  vp8?: string;
  opus?: boolean;
}

export interface PlanInput {
  /** The edit, as normalizeVideoRecipe made it. */
  recipe: VideoRecipe;
  /** Each source's facts, by its src (none: the video being edited). */
  factsOf: VideoFactsOf;
  /** Each clip's file, and its sound's in place of its own, in the recipe's order. */
  clipFiles: { file: string; sound?: string }[];
  overlayFiles?: string[];
  audioFiles?: string[];
  output: string;
  format: VideoOut;
  /** The kind of file a video is written as (mov when written over a .mov). */
  container?: 'mp4' | 'mov' | 'webm';
  /** A picture of this moment of the timeline (seconds), for jpg and png. */
  frame?: number;
  /** Only this part of the timeline, in seconds. */
  range?: [number, number];
  /** The output's shorter side at most, in pixels (exactly, with `exactSize`). */
  size?: number;
  exactSize?: boolean;
  fps?: number;
  codec?: VideoCodec;
  quality?: VideoQuality;
  /** For each of the recipe's texts: the editor's drawing of it, or how to draw it here; null to leave it out. */
  texts?: (TextHow | null)[];
  encoders: Encoders;
  /** The graphics card's encoder, when it makes it. */
  hw?: { api: HwApi; encoder: string; device?: string };
}

export interface Plan {
  /** ffmpeg's arguments (without ffmpeg itself), run in the job's folder. */
  args: string[];
  /** The files it reads, and the one it writes. */
  inputs: string[];
  output: string;
  /** The files to write in the job's folder before it runs (a text's lines, a grade's table). */
  files: Record<string, string>;
  /** How long what it makes is in seconds (what progress is counted against); 0 for a frame. */
  seconds: number;
  /** The size of what it makes. */
  w: number;
  h: number;
  /** It has sound. */
  audio: boolean;
  /** The video encoder (the graphics card's when `hw`). */
  encoder?: string;
  graph: string;
}

const even = (x: number) => Math.max(2, Math.round(x / 2) * 2);

/** The size a picture `w`×`h` is made at most `size` on its shorter side (and a GIF at most 480 on its longer, unless a size is asked). */
export function scaledSize(w: number, h: number, o: { size?: number; gif?: boolean }): { w: number; h: number } {
  let k = 1;
  if (o.size && Math.min(w, h) > o.size) k = o.size / Math.min(w, h);
  if (o.gif) k = Math.min(k, (o.size ? 960 : 480) / Math.max(w, h));
  return k < 1 ? { w: even(w * k), h: even(h * k) } : { w: w - (w % 2), h: h - (h % 2) };
}

/** The most memory a reversed clip may take (it keeps all its frames), in bytes. */
export const REVERSE_BYTES = 1.2 * 1024 ** 3;

/** The encoder the processor makes `codec` with, or why it cannot. */
function cpuEncoder(e: Encoders, codec: VideoCodec): string {
  const enc = codec === 'h265' ? e.h265 : codec === 'av1' ? e.av1 : e.h264;
  if (enc) return enc;
  if (codec === 'h264') throw new Error('This ffmpeg cannot make H.264 videos: install ffmpeg, or set up the picture tools in Settings → Images, video and audio');
  throw new Error(`This ffmpeg cannot make ${codec === 'h265' ? 'H.265' : 'AV1'} videos: pick H.264`);
}

type Tagged<T> = T & { _i: number };

/** The ffmpeg command for an edit. Throws, in words a person can act on, for what cannot be made. */
export function planVideo(p: PlanInput): Plan {
  const fmt = p.format;
  const picture = fmt === 'jpg' || fmt === 'png';
  const gif = fmt === 'gif';
  const wav = fmt === 'wav';
  const video = !wav;
  const sound = !picture && !gif;
  const full = p.recipe;
  if (!full.clips?.length) throw new Error('Nothing of the video would be left: keep a part of it');
  const total = clipSpans(full.clips, p.factsOf).length;
  // Frames a second: as asked, else the first video clip's own (at most 60), else 30; a GIF's at most 15.
  const firstVideo = full.clips.find((c) => !isStill(c) && !p.factsOf(c.src)?.picture);
  const own = firstVideo ? p.factsOf(firstVideo.src)?.fps : undefined;
  let fps = p.fps && p.fps >= 1 ? Math.min(60, p.fps) : own && own >= 1 ? Math.min(60, own) : 30;
  if (gif) fps = Math.min(15, fps);

  // ---- the part of the timeline made: all of it, In to Out, or one frame -----------------------------------------
  let a = 0;
  let b = total;
  if (picture) {
    a = Math.max(0, Math.min(p.frame ?? 0, total - 1 / fps));
    b = Math.min(total, a + Math.max(0.1, 2 / fps));
  } else if (p.range) {
    a = Math.max(0, Math.min(total, p.range[0]));
    b = Math.max(0, Math.min(total, p.range[1]));
    if (b - a < MIN_PART) throw new Error('The part between In and Out is too short: mark a longer part');
  }
  const tag = <T>(xs?: T[]): Tagged<T>[] => (xs ?? []).map((x, i) => ({ ...x, _i: i }));
  const tagged: VideoRecipe = { ...full, clips: tag(full.clips), overlays: tag(full.overlays), audio: tag(full.audio), texts: tag(full.texts) };
  const win = a > 1e-6 || b < total - 1e-6 ? windowRecipe(tagged, p.factsOf, a, b) : { recipe: tagged, offset: 0, length: total };
  const r = win.recipe;
  const clips = r.clips as Tagged<VideoClip>[];
  const span = clipSpans(clips, p.factsOf).length;
  const seconds = picture ? 0 : win.length;
  const cut = win.offset > 0.0005 || win.length < span - 0.0005;

  // ---- the output's size --------------------------------------------------------------------------------------------
  let { w: W, h: H } = outputSize(full, p.factsOf, { size: p.size, exact: p.exactSize && !gif });
  if (gif) ({ w: W, h: H } = scaledSize(W, H, { size: p.size, gif: true }));

  const inputs: string[] = [];
  const args = ['-hide_banner', '-nostdin', '-y', '-v', 'error', ...(picture ? [] : ['-progress', 'pipe:1', '-nostats'])];
  const hw = p.hw && (fmt === 'mp4' || fmt === 'mov') ? p.hw : undefined;
  if (hw) args.push(...hwInit(hw.api, hw.device));
  const decode = hw ? hwDecode(hw.api) : [];
  const videoInputs = clips.filter((c) => !c.picture && !p.factsOf(c.src)?.picture).length + (r.overlays?.length ?? 0);
  // Many videos at once: fewer decoding threads each, so their memory stays small.
  const threads = videoInputs > 6 ? ['-threads', '2'] : [];
  const addInput = (file: string, pre: string[] = []) => {
    inputs.push(file);
    args.push(...pre, '-protocol_whitelist', 'file', '-i', `file:${file}`);
    return inputs.length - 1;
  };
  const chains: Chain[] = [];
  const files: Record<string, string> = {};
  let label = 0;
  const next = (p0: string) => `${p0}${label++}`;

  // ---- colour: one table for each grade, its effects as ffmpeg's filters ------------------------------------------
  const luts = new Map<string, string>();
  const lutFile = (g: VideoGrade) => {
    const { vignette: _v, sharpen: _s, denoise: _d, grain: _g, ...colour } = g;
    const key = JSON.stringify(colour);
    let name = luts.get(key);
    if (!name) {
      name = `grade${luts.size}.cube`;
      luts.set(key, name);
      files[name] = cubeText(gradeLut(colour));
    }
    return name;
  };
  /** Denoise, sharpen and the colour, on the clip's own picture. */
  const gradeBefore = (g?: VideoGrade): Filter[] => {
    if (!g) return [];
    const out: Filter[] = [];
    if (g.denoise) {
      const s = denoiseStrength(g.denoise);
      out.push(F('hqdn3d', ['luma_spatial', s.spatial], ['chroma_spatial', n(s.spatial * 0.75, 2)], ['luma_tmp', s.temporal], ['chroma_tmp', n(s.temporal * 0.75, 2)]));
    }
    if (g.sharpen) out.push(F('unsharp', ['lx', 5], ['ly', 5], ['la', sharpenAmount(g.sharpen)], ['cx', 5], ['cy', 5], ['ca', 0]));
    if (gradeHasColour(g)) out.push(F('lut3d', ['file', lutFile(g)], ['interp', 'trilinear']));
    return out;
  };
  /** The vignette and the grain, on what shows of the clip. */
  const gradeAfter = (g?: VideoGrade): Filter[] => {
    const out: Filter[] = [];
    if (g?.vignette) out.push(F('vignette', ['angle', vignetteAngle(g.vignette)]));
    // Grain on the brightness alone (its first part once in YUV).
    if (g?.grain) out.push(F('format', ['pix_fmts', 'yuv420p']), F('noise', ['c0s', grainStrength(g.grain)], ['c0f', 't+u']));
    return out;
  };

  /** Turned, mirrored and cropped to the clip's frame (even sides, as H.264 needs). */
  const framing = (c: VideoClip, f: VideoSize): Filter[] => {
    const out: Filter[] = [];
    if (c.rotate === 90) out.push(F('transpose', ['dir', 'clock']));
    if (c.rotate === 270) out.push(F('transpose', ['dir', 'cclock']));
    // Half a turn is mirrored both ways; a mirror on top of it undoes one of them.
    const half = c.rotate === 180;
    if (!!c.flipH !== half) out.push(F('hflip'));
    if (!!c.flipV !== half) out.push(F('vflip'));
    const up = turnedSize(f.width, f.height, c.rotate);
    const crop = c.crop ?? { x: 0, y: 0, w: up.w - (up.w % 2), h: up.h - (up.h % 2) };
    if (c.crop || up.w % 2 || up.h % 2) out.push(F('crop', ['w', crop.w], ['h', crop.h], ['x', crop.x], ['y', crop.y]));
    return out;
  };
  /** A picture `sw`×`sh` fitted into the output (bars around it) or filling it (its edges cut off). */
  const placing = (sw: number, sh: number, fill: boolean, scaled = false): Filter[] => {
    const box = fitBox(sw, sh, W, H, fill);
    const out: Filter[] = [];
    if (!scaled && (box.w !== sw || box.h !== sh)) out.push(F('scale', ['w', box.w], ['h', box.h], ['flags', 'bicubic']));
    if (fill) {
      if (box.w !== W || box.h !== H) out.push(F('crop', ['w', W], ['h', H], ['x', Math.max(0, -box.x)], ['y', Math.max(0, -box.y)]));
    } else if (box.w !== W || box.h !== H) out.push(F('pad', ['w', W], ['h', H], ['x', box.x], ['y', box.y], ['color', 'black']));
    out.push(F('setsar', ['r', 1]));
    return out;
  };
  /** Every clip ends the same: one frame rate, one pixel format, exactly its length, from 0. */
  const ending = (L: number): Filter[] => [F('format', ['pix_fmts', 'yuv420p']), F('tpad', ['stop_mode', 'clone'], ['stop_duration', 1]), F('trim', ['duration', n(L)]), F('setpts', ['expr', 'PTS-STARTPTS'])];
  const silence = (L: number): Chain => ({ ins: [], filters: [F('anullsrc', ['r', 48000], ['cl', 'stereo']), F('aformat', ['sample_fmts', 'fltp'], ['sample_rates', 48000], ['channel_layouts', 'stereo']), F('atrim', ['duration', n(L)])], outs: [next('sil')] });
  const a1On = heard(r, 'a1');

  // ---- each clip: its picture and its sound, exactly its length -----------------------------------------------------
  interface Seg {
    v?: string;
    a?: string;
    len: number;
  }
  const segs: Seg[] = clips.map((c) => {
    const f = p.factsOf(c.src);
    if (!f) throw new Error('A clip’s video could not be read');
    const files0 = p.clipFiles[c._i];
    const L = clipLength(c, f);
    const seg: Seg = { len: L };
    const still = isStill(c) || !!f.picture;
    const [ta, tb] = c.trim ?? [0, f.duration];
    let idx = -1;
    if (video) {
      const vf: Filter[] = [];
      const fill = c.fit === 'fill';
      if (still) {
        idx = c.still !== undefined ? addInput(files0.file, [...decode, '-ss', n(c.still)]) : addInput(files0.file);
        vf.push(F('trim', ['end_frame', 1]), F('setpts', ['expr', 'PTS-STARTPTS']), ...framing(c, f), ...gradeBefore(c.grade));
        const pic = editedSize(c, f.width, f.height);
        if (c.motion) {
          // A slow zoom and pan: zoompan over the picture made three times larger than where it shows, for smooth motion.
          const box = fitBox(pic.w, pic.h, W, H, fill);
          const k3 = Math.min(3, 7680 / box.w);
          const frames = Math.max(1, Math.round(L * fps));
          const t = frames > 1 ? `on/${frames - 1}` : '0';
          const m = c.motion;
          const lerp = (x: number, y: number) => (Math.abs(y - x) < 1e-6 ? n(x, 4) : `(${n(x, 4)}${y >= x ? '+' : '-'}${n(Math.abs(y - x), 4)}*${t})`);
          vf.push(
            F('scale', ['w', even(box.w * k3)], ['h', even(box.h * k3)], ['flags', 'bicubic']),
            F('zoompan', ['z', lerp(m.from.zoom, m.to.zoom)], ['x', `${lerp(m.from.x, m.to.x)}*iw-iw/zoom/2`], ['y', `${lerp(m.from.y, m.to.y)}*ih-ih/zoom/2`], ['d', frames], ['s', `${box.w}x${box.h}`], ['fps', n(fps, 3)]),
            ...gradeAfter(c.grade),
            ...placing(box.w, box.h, fill, true),
          );
        } else vf.push(...gradeAfter(c.grade), ...placing(pic.w, pic.h, fill), F('tpad', ['stop_mode', 'clone'], ['stop_duration', n(L + 1)]));
        vf.push(F('fps', ['fps', n(fps, 3)]), ...ending(L));
      } else {
        idx = addInput(files0.file, [...decode, ...threads, '-ss', n(ta), '-t', n(tb - ta + 0.05)]);
        const sp = c.speed ?? 1;
        vf.push(F('setpts', ['expr', 'PTS-STARTPTS']));
        if (sp !== 1) vf.push(F('setpts', ['expr', `PTS/${n(sp, 4)}`]));
        if (c.stabilize) vf.push(F('deshake', ['rx', 32], ['ry', 32], ['edge', 'mirror']));
        const pic = editedSize(c, f.width, f.height);
        vf.push(...framing(c, f), ...gradeBefore(c.grade), ...gradeAfter(c.grade), ...placing(pic.w, pic.h, c.fit === 'fill'), F('fps', ['fps', n(fps, 3)]));
        if (c.reverse) {
          // reverse keeps every frame of the clip until its end: at the output's size, within a limit.
          const bytes = Math.ceil(L * fps) * W * H * 1.5;
          if (bytes > REVERSE_BYTES) throw new Error(`A clip played backwards is kept whole in memory: this one would need about ${(bytes / 1024 ** 3).toFixed(1)} GB. Split it shorter (at most about ${Math.floor(REVERSE_BYTES / (fps * W * H * 1.5))} seconds at this size) or make the video smaller`);
          vf.push(F('reverse'));
        }
        vf.push(...ending(L));
      }
      seg.v = next('v');
      chains.push({ ins: [`${idx}:V`], filters: vf, outs: [seg.v] });
    }
    if (sound) {
      const own = !still && !c.mute && a1On && (c.sound || f.audio);
      if (own) {
        const sidx = c.sound ? addInput(files0.sound!, ['-ss', n(ta), '-t', n(tb - ta + 0.05)]) : idx >= 0 ? idx : addInput(files0.file, ['-ss', n(ta), '-t', n(tb - ta + 0.05)]);
        const af: Filter[] = [F('aformat', ['sample_fmts', 'fltp'], ['sample_rates', 48000], ['channel_layouts', 'stereo']), F('asetpts', ['expr', 'PTS-STARTPTS'])];
        if (c.reverse) af.push(F('areverse'));
        const sp = c.speed ?? 1;
        if (sp !== 1) {
          if (c.keepPitch === false) af.push(F('asetrate', ['r', Math.round(48000 * sp)]), F('aresample', ['osr', 48000]));
          else af.push(...tempos(sp).map((x) => F('atempo', ['tempo', n(x, 4)])));
        }
        if (c.volume !== undefined) af.push(F('volume', ['volume', n(c.volume, 3)]));
        af.push(F('apad'), F('atrim', ['duration', n(L)]), F('asetpts', ['expr', 'PTS-STARTPTS']));
        seg.a = next('a');
        chains.push({ ins: [`${sidx}:a`], filters: af, outs: [seg.a] });
      } else {
        const s = silence(L);
        chains.push(s);
        seg.a = s.outs[0];
      }
    }
    return seg;
  });

  // ---- joined: runs of cuts by concat, runs by their transitions ---------------------------------------------------
  const concat = (run: Seg[]): Seg => {
    if (run.length === 1) return run[0];
    const out: Seg = { len: run.reduce((x, s) => x + s.len, 0) };
    if (video) out.v = next('cv');
    if (sound) out.a = next('ca');
    chains.push({
      ins: run.flatMap((s) => [...(video ? [s.v!] : []), ...(sound ? [s.a!] : [])]),
      filters: [F('concat', ['n', run.length], ['v', video ? 1 : 0], ['a', sound ? 1 : 0])],
      outs: [...(video ? [out.v!] : []), ...(sound ? [out.a!] : [])],
    });
    return out;
  };
  const xfade = (x: Seg, y: Seg, t: VideoTransition): Seg => {
    const d = Math.min(t.length, x.len - 0.01, y.len - 0.01);
    const out: Seg = { len: x.len + y.len - d };
    if (video) {
      out.v = next('xv');
      const ff = VIDEO_TRANSITIONS.find((k) => k.id === t.kind)?.ff ?? 'fade';
      chains.push({ ins: [x.v!, y.v!], filters: [F('xfade', ['transition', ff], ['duration', n(d)], ['offset', n(x.len - d)])], outs: [out.v] });
    }
    if (sound) {
      out.a = next('xa');
      chains.push({ ins: [x.a!, y.a!], filters: [F('acrossfade', ['d', n(d)], ['c1', 'tri'], ['c2', 'tri'])], outs: [out.a] });
    }
    return out;
  };
  let acc: Seg | null = null;
  let run: Seg[] = [];
  let joinWith: VideoTransition | undefined;
  const flush = () => {
    const seg = concat(run);
    run = [];
    acc = acc && joinWith ? xfade(acc, seg, joinWith) : acc ? concat([acc, seg]) : seg;
  };
  clips.forEach((c, i) => {
    run.push(segs[i]);
    if (i < clips.length - 1 && c.transition) {
      flush();
      joinWith = c.transition;
    }
  });
  flush();
  const main = acc as unknown as Seg;

  // ---- over the clips: overlays and words; the whole faded, cut to the part asked ----------------------------------
  let vcur = main.v ?? '';
  if (video) {
    const step = (filters: Filter[], ins: string[] = [vcur]) => {
      const out = next('p');
      chains.push({ ins, filters, outs: [out] });
      vcur = out;
    };
    if (r.tracks?.v1?.hidden) step([F('colorchannelmixer', ['rr', 0], ['gg', 0], ['bb', 0])]);
    const overlays = [...((r.overlays ?? []) as Tagged<NonNullable<VideoRecipe['overlays']>[number]>[])].filter((o) => !r.tracks?.[o.track === 3 ? 'v3' : 'v2']?.hidden).sort((x, y) => (x.track ?? 2) - (y.track ?? 2) || x.start - y.start);
    for (const o of overlays) {
      const f = p.factsOf(o.src);
      const file = p.overlayFiles?.[o._i];
      if (!f || !file) continue;
      const len = Math.min(overlayLength(o, f), span - o.start);
      if (len < MIN_PART) continue;
      const ow = even(o.w * W);
      const oh = even((ow * f.height) / Math.max(1, f.width));
      const of: Filter[] = [];
      let idx: number;
      if (o.picture || f.picture) {
        idx = addInput(file);
        of.push(F('format', ['pix_fmts', 'rgba']));
      } else {
        const [p0, p1] = o.trim ?? [0, f.duration];
        idx = addInput(file, [...decode, ...threads, '-ss', n(p0), '-t', n(Math.min(p1 - p0, len) + 0.05)]);
        of.push(F('setpts', ['expr', 'PTS-STARTPTS']), F('fps', ['fps', n(fps, 3)]), F('format', ['pix_fmts', 'rgba']));
      }
      if (o.key) of.push(F('colorkey', ['color', `0x${o.key.color.slice(1, 7)}`], ['similarity', n(o.key.similarity, 3)], ['blend', n(o.key.blend, 3)]));
      of.push(F('scale', ['w', ow], ['h', oh], ['flags', 'bicubic']));
      if (o.opacity !== undefined) of.push(F('colorchannelmixer', ['aa', n(o.opacity, 3)]));
      if (o.picture || f.picture) of.push(F('tpad', ['stop_mode', 'clone'], ['stop_duration', n(len + 1)]), F('fps', ['fps', n(fps, 3)]));
      if (o.fadeIn) of.push(F('fade', ['t', 'in'], ['st', 0], ['d', n(o.fadeIn)], ['alpha', 1]));
      if (o.fadeOut) of.push(F('fade', ['t', 'out'], ['st', n(Math.max(0, len - o.fadeOut))], ['d', n(o.fadeOut)], ['alpha', 1]));
      of.push(F('trim', ['duration', n(len)]), F('setpts', ['expr', `PTS-STARTPTS+${n(o.start)}/TB`]));
      const ol = next('o');
      chains.push({ ins: [`${idx}:V`], filters: of, outs: [ol] });
      step([F('overlay', ['x', Math.round(o.x * W - ow / 2)], ['y', Math.round(o.y * H - oh / 2)], ['eof_action', 'pass'])], [vcur, ol]);
    }
    if (!r.tracks?.t1?.hidden)
      ((r.texts ?? []) as Tagged<NonNullable<VideoRecipe['texts']>[number]>[]).forEach((t) => {
        const how = p.texts?.[t._i];
        if (!how || t.to <= t.from) return;
        const when: [string, Value] = ['enable', `between(t,${n(t.from)},${n(t.to)})`];
        if ('png' in how) {
          const idx = addInput(how.png);
          step([F('overlay', ['x', Math.round(t.x * W - how.w / 2)], ['y', Math.round(t.y * H - how.h / 2)], when)], [vcur, `${idx}:v`]);
          return;
        }
        const fontsize = Math.max(8, Math.round(t.size * H));
        const lh = Math.round(fontsize * 1.3);
        const pad = Math.max(2, Math.round(fontsize * 0.28));
        const top = Math.round(t.y * H - (how.lines.length * lh) / 2);
        const cx = n(t.x * W, 1);
        const draws: Filter[] = how.lines.map((line, j) => {
          const file = `text${t._i}-${j}.txt`;
          files[file] = line;
          const look: [string, Value][] = t.background
            ? [
                ['box', 1],
                ['boxcolor', ffColor(t.background)],
                ['boxborderw', pad],
              ]
            : t.outline
              ? [
                  ['borderw', Math.max(1, Math.round(fontsize / 14))],
                  ['bordercolor', ffColor(t.outline, 1)],
                ]
              : // No box: a soft shadow, as the editor draws them, keeps light words readable.
                [
                  ['shadowcolor', '0x000000@0.55'],
                  ['shadowx', Math.max(1, Math.round(fontsize / 24))],
                  ['shadowy', Math.max(1, Math.round(fontsize / 24))],
                ];
          return F('drawtext', ['fontfile', how.font], ['textfile', file], ['expansion', 'none'], ['fontsize', fontsize], ['fontcolor', ffColor(t.color, 1)], ...look, ['x', `${cx}-text_w/2`], ['y', top + j * lh + Math.round((lh - fontsize) / 2)], when);
        });
        if (draws.length) step(draws);
      });
    const end: Filter[] = [];
    if (r.fadeIn) end.push(F('fade', ['t', 'in'], ['st', 0], ['d', n(r.fadeIn)]));
    if (r.fadeOut) end.push(F('fade', ['t', 'out'], ['st', n(Math.max(0, span - r.fadeOut))], ['d', n(r.fadeOut)]));
    if (cut) end.push(F('trim', ['start', n(win.offset)], ...(picture ? [] : ([['duration', n(win.length)]] as [string, Value][]))), F('setpts', ['expr', 'PTS-STARTPTS']));
    if (end.length) step(end);
  }

  // ---- the sound: the clips', the music and the voice-over, mixed --------------------------------------------------
  let aout: string | null = null;
  if (sound) {
    const busOf = (id: 'a1' | 'a2' | 'a3'): Filter[] => {
      const t = r.tracks?.[id];
      return [...(t?.volume !== undefined ? [F('volume', ['volume', n(t.volume, 3)])] : []), ...(t?.pan ? [F('stereotools', ['balance_out', n(t.pan, 2)])] : [])];
    };
    const v = r.fixes?.voice;
    const clean: Filter[] = v ? [F('highpass', ['f', 80]), F('afftdn', ['nr', n(6 + 18 * v, 1)], ['nf', -45], ['tn', 1])] : [];
    const chain = (ins: string[], filters: Filter[], p0: string) => {
      if (!filters.length) return ins[0];
      const out = next(p0);
      chains.push({ ins, filters, outs: [out] });
      return out;
    };
    // A1, the clips' own sound (silence where they have none: it gives the mix its length).
    let a1: string | null = chain([main.a!], [...busOf('a1'), ...(wav ? [] : clean)], 'b');
    /** A track of sounds placed on the timeline, mixed: its label, or null with none heard. */
    const track = (kind: 'music' | 'voice'): string | null => {
      const id = kind === 'music' ? 'a2' : 'a3';
      if (!heard(r, id) && !wav) return null;
      const items = ((r.audio ?? []) as Tagged<NonNullable<VideoRecipe['audio']>[number]>[]).filter((m) => m.track === kind);
      const labels: string[] = [];
      for (const m of items) {
        const f = p.factsOf(m.src);
        const file = p.audioFiles?.[m._i];
        if (!f || !file) continue;
        const [p0, p1] = m.trim ?? [0, f.duration];
        const len = Math.min(audioLength(m, f), span - m.start);
        if (len < MIN_PART) continue;
        const idx = addInput(file, ['-ss', n(p0), '-t', n(Math.min(p1 - p0, len) + 0.05)]);
        const mf: Filter[] = [F('aformat', ['sample_fmts', 'fltp'], ['sample_rates', 48000], ['channel_layouts', 'stereo']), F('asetpts', ['expr', 'PTS-STARTPTS']), F('atrim', ['duration', n(len)])];
        if (m.volume !== undefined) mf.push(F('volume', ['volume', n(m.volume, 3)]));
        if (m.fadeIn) mf.push(F('afade', ['t', 'in'], ['st', 0], ['d', n(m.fadeIn)]));
        if (m.fadeOut) mf.push(F('afade', ['t', 'out'], ['st', n(Math.max(0, len - m.fadeOut))], ['d', n(m.fadeOut)]));
        if (m.start > 0.0005) mf.push(F('adelay', ['delays', Math.round(m.start * 1000)], ['all', 1]));
        labels.push(chain([`${idx}:a`], mf, 'm'));
      }
      if (!labels.length) return null;
      const mixed = labels.length > 1 ? chain(labels, [F('amix', ['inputs', labels.length], ['duration', 'longest'], ['dropout_transition', 0], ['normalize', 0])], 'mx') : labels[0];
      return chain([mixed], [...busOf(id), ...(kind === 'voice' && !wav ? clean : [])], 'b');
    };
    const a3 = track('voice');
    if (wav) {
      // The voices alone, for captions: the clips' sound and the voice-over, as whisper reads them.
      const mixed = a3 ? chain([a1!, a3], [F('amix', ['inputs', 2], ['duration', 'first'], ['dropout_transition', 0], ['normalize', 0])], 'vo') : a1!;
      aout = chain([mixed], [F('aformat', ['sample_fmts', 's16'], ['sample_rates', 16000], ['channel_layouts', 'mono'])], 'aout');
    } else {
      let a2 = track('music');
      let tracksMix: string[];
      // The music lowered while someone speaks: compressed by the voices (a copy of them).
      const speech = [a1On && clips.some((c) => !isStill(c) && !c.mute && (c.sound || p.factsOf(c.src)?.audio)) ? 'a1' : null, a3 ? 'a3' : null].filter(Boolean) as string[];
      if (a2 && r.fixes?.duck && speech.length) {
        const keys: string[] = [];
        if (speech.includes('a1')) {
          const [x, y] = [next('d'), next('d')];
          chains.push({ ins: [a1!], filters: [F('asplit', ['outputs', 2])], outs: [x, y] });
          a1 = x;
          keys.push(y);
        }
        let a3b = a3;
        if (a3 && speech.includes('a3')) {
          const [x, y] = [next('d'), next('d')];
          chains.push({ ins: [a3], filters: [F('asplit', ['outputs', 2])], outs: [x, y] });
          a3b = x;
          keys.push(y);
        }
        const key = keys.length > 1 ? chain(keys, [F('amix', ['inputs', keys.length], ['duration', 'longest'], ['dropout_transition', 0], ['normalize', 0])], 'k') : keys[0];
        a2 = chain([a2, key], [F('sidechaincompress', ['threshold', 0.03], ['ratio', n(2 + 10 * r.fixes.duck, 1)], ['attack', 20], ['release', 400], ['makeup', 1])], 'dk');
        tracksMix = [a1!, a2, ...(a3b ? [a3b] : [])];
      } else tracksMix = [a1!, ...(a2 ? [a2] : []), ...(a3 ? [a3] : [])];
      const mix = tracksMix.length > 1 ? chain(tracksMix, [F('amix', ['inputs', tracksMix.length], ['duration', 'first'], ['dropout_transition', 0], ['normalize', 0])], 'mix') : tracksMix[0];
      const end: Filter[] = [];
      if (r.fadeIn) end.push(F('afade', ['t', 'in'], ['st', 0], ['d', n(r.fadeIn)]));
      if (r.fadeOut) end.push(F('afade', ['t', 'out'], ['st', n(Math.max(0, span - r.fadeOut))], ['d', n(r.fadeOut)]));
      if (r.fixes?.loudness) {
        const web = r.fixes.loudness === 'web';
        end.push(F('loudnorm', ['i', web ? -14 : -23], ['tp', web ? -1.5 : -2], ['lra', web ? 11 : 15]), F('aresample', ['osr', 48000]));
      }
      if (cut) end.push(F('atrim', ['start', n(win.offset)], ['duration', n(win.length)]), F('asetpts', ['expr', 'PTS-STARTPTS']));
      aout = chain([mix], end.length ? end : [F('anull')], 'aout');
    }
  }

  // ---- the file -----------------------------------------------------------------------------------------------------
  if (wav) {
    const graph = graphText(chains);
    args.push('-filter_complex', graph, '-map', `[${aout}]`, '-c:a', 'pcm_s16le', '-f', 'wav', `file:${p.output}`);
    return { args, inputs, output: p.output, files, seconds, w: 0, h: 0, audio: true, graph };
  }
  if (picture) {
    const graph = graphText(chains);
    args.push('-filter_complex', graph, '-map', `[${vcur}]`, '-frames:v', '1', '-update', '1');
    args.push(...(fmt === 'png' ? ['-c:v', 'png'] : ['-q:v', '2']), '-f', 'image2', `file:${p.output}`);
    return { args, inputs, output: p.output, files, seconds: 0, w: W, h: H, audio: false, graph };
  }
  if (gif) {
    const [g0, g1, pal] = [next('g'), next('g'), next('pal')];
    chains.push({ ins: [vcur], filters: [F('split')], outs: [g0, g1] });
    chains.push({ ins: [g0], filters: [F('palettegen', ['stats_mode', 'diff'])], outs: [pal] });
    chains.push({ ins: [g1, pal], filters: [F('paletteuse', ['dither', 'bayer'], ['bayer_scale', 4])], outs: ['vout'] });
    const graph = graphText(chains);
    args.push('-filter_complex', graph, '-map', '[vout]', '-an', '-loop', '0', '-f', 'gif', `file:${p.output}`);
    return { args, inputs, output: p.output, files, seconds, w: W, h: H, audio: false, graph };
  }
  const tail = hw ? hwTail(hw.api) : { pix: 'yuv420p', upload: false };
  chains.push({ ins: [vcur], filters: [F('format', ['pix_fmts', tail.pix]), ...(tail.upload ? [F('hwupload')] : [])], outs: ['vout'] });
  const graph = graphText(chains);
  args.push('-filter_complex', graph, '-map', '[vout]', ...(aout ? ['-map', `[${aout}]`] : ['-an']));
  const quality = p.quality ?? 'standard';
  let encoder: string;
  if (fmt === 'webm') {
    encoder = p.encoders.vp9 ?? p.encoders.vp8 ?? '';
    if (!encoder) throw new Error('This ffmpeg cannot make WebM videos (it has no VP9 or VP8 encoder): save it as MP4');
    args.push('-c:v', encoder, ...encoderArgs(encoder, { quality, codec: 'h264', w: W, h: H, fps }));
    if (aout) args.push('-c:a', p.encoders.opus ? 'libopus' : 'libvorbis', '-b:a', quality === 'high' ? '192k' : '128k');
    args.push('-f', 'webm');
  } else {
    const codec = p.codec ?? 'h264';
    encoder = hw?.encoder ?? cpuEncoder(p.encoders, codec);
    args.push('-c:v', encoder, ...encoderArgs(encoder, { quality, codec, w: W, h: H, fps }));
    if (aout) args.push('-c:a', 'aac', '-b:a', quality === 'high' ? '256k' : quality === 'small' ? '128k' : '160k');
    args.push('-movflags', '+faststart', '-f', p.container === 'mov' || fmt === 'mov' ? 'mov' : 'mp4');
  }
  args.push(`file:${p.output}`);
  return { args, inputs, output: p.output, files, seconds, w: W, h: H, audio: !!aout, encoder, graph };
}

/** Throws unless a plan reads only its inputs and writes only its output (each named once, as a file). */
export function checkPlan(plan: Plan): void {
  const read: string[] = [];
  for (let i = 0; i < plan.args.length; i++) if (plan.args[i] === '-i') read.push(plan.args[++i]);
  if (read.length !== plan.inputs.length || read.some((x, i) => x !== `file:${plan.inputs[i]}`)) throw new Error('The command reads something it was not given');
  if (plan.args[plan.args.length - 1] !== `file:${plan.output}`) throw new Error('The command writes somewhere it was not told');
  const named = plan.args.filter((x) => x.startsWith('file:'));
  if (named.length !== plan.inputs.length + 1) throw new Error('The command names a file it was not given');
}
