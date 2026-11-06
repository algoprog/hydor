// A video's edit (shared/mediaedit-video.ts) as one ffmpeg command: the input read from the first part kept to the
// last, the picture cropped, turned, mirrored and coloured, the words put over it (as the editor drew them, or drawn
// here with a font of this computer's), the parts kept joined, played faster or slower with the sound kept in tune,
// faded in and out, the music mixed under it, and written as MP4 (H.264 and AAC), WebM, a GIF, or one frame as a
// picture. Pure: it only plans (video.ts runs it), so it can be tested without ffmpeg.
//
// The filter graph is built from parts and checked before it runs: only the filters below, values that are numbers,
// colours, time ranges and the names of files the job made in its own folder, nothing that could close a quote or
// start another filter. The command reads only the inputs it was given and writes only its output.
import type { VideoOut, VideoRecipe } from '../../shared/mediaedit-video.ts';
import { editedLength, editedSize, keptParts } from '../../shared/mediaedit-video.ts';

/** The filters an edit uses: none that reads a file or an address, runs commands, or listens for them. */
export const ALLOWED_FILTERS = new Set([
  'crop',
  'transpose',
  'hflip',
  'vflip',
  'colorchannelmixer',
  'lutrgb',
  'overlay',
  'drawtext',
  'split',
  'asplit',
  'trim',
  'atrim',
  'setpts',
  'asetpts',
  'concat',
  'fps',
  'fade',
  'afade',
  'volume',
  'atempo',
  'adelay',
  'amix',
  'scale',
  'format',
  'palettegen',
  'paletteuse',
  'hstack',
  'null',
  'anull',
]);

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

const LABEL = /^(?:\d{1,2}:[vVa]|[a-z][a-z0-9_]{0,15})$/;
const KEY = /^[a-z_]{1,20}$/;
/** A file the job made in its own folder (the command runs there): a font, the words of a text. */
const OWN_FILE = /^(?:font\d{1,2}\.(?:ttf|otf|ttc)|text\d{1,2}-\d{1,2}\.txt)$/;
/** What else a value may be: numbers, colours, expressions of numbers and t, w, h; nothing that closes a quote or starts a filter. */
const PLAIN = /^[A-Za-z0-9_.+\-*/@#()|, ]{0,240}$/;

/** A number as ffmpeg reads it: no exponent, a few decimals. */
export const n = (x: number, places = 3) => {
  if (!Number.isFinite(x)) throw new Error(`Not a number in the plan: ${x}`);
  const s = x.toFixed(places).replace(/\.?0+$/, '');
  return s === '-0' ? '0' : s;
};

/** Throws when a chain is not one the plan may run. */
export function checkChain(c: Chain): void {
  for (const l of [...c.ins, ...c.outs]) if (!LABEL.test(l)) throw new Error(`A label the plan may not use: ${l}`);
  if (!c.filters.length) throw new Error('A chain without filters');
  for (const f of c.filters) {
    if (!ALLOWED_FILTERS.has(f.name)) throw new Error(`A filter the plan may not use: ${f.name}`);
    for (const [k, v] of f.args ?? []) {
      if (!KEY.test(k)) throw new Error(`An option the plan may not use: ${k}`);
      if (typeof v === 'number') {
        if (!Number.isFinite(v)) throw new Error(`${f.name} ${k} is not a number`);
      } else if ((k === 'fontfile' || k === 'textfile') && !OWN_FILE.test(v)) throw new Error(`${f.name} may read only the job's own files, not ${v}`);
      else if (k !== 'fontfile' && k !== 'textfile' && !PLAIN.test(v)) throw new Error(`${f.name} ${k} has a value the plan may not use`);
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

/**
 * Brightness, contrast and saturation as the editor's preview shows them (the browser's brightness(), contrast() and
 * saturate(), one after the other): one matrix of the red, green and blue, then what is added to each.
 */
export function colourMath(r: Pick<VideoRecipe, 'brightness' | 'contrast' | 'saturation'>): { m: number[]; add: number } | null {
  if (!r.brightness && !r.contrast && !r.saturation) return null;
  const b = cssBrightness(r.brightness);
  const c = cssContrast(r.contrast);
  const s = cssSaturate(r.saturation);
  // saturate(s): the browser's matrix; it keeps greys grey, so the contrast's shift stays one number for all three.
  const sat = [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s];
  return { m: sat.map((x) => x * b * c), add: 0.5 * (1 - c) };
}

/** The editor's sliders (-1 to 1) as the browser's filter amounts: brightness 0.4 to 1.6, contrast 0.4 to 1.6, saturation 0 to 2. */
export const cssBrightness = (v = 0) => 1 + v * 0.6;
export const cssContrast = (v = 0) => 1 + v * 0.6;
export const cssSaturate = (v = 0) => 1 + v;

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

export interface PlanInput {
  recipe: VideoRecipe;
  /** The video as ffmpeg shows it: its length, its size turned upright, whether it has sound, its frames a second. */
  video: { duration: number; width: number; height: number; audio: boolean; fps?: number };
  input: string;
  output: string;
  format: VideoOut;
  /** The kind of file a video is written as (mov when written over a .mov); from the format otherwise. */
  container?: 'mp4' | 'mov' | 'webm';
  /** A picture of this moment (seconds of the original), for jpg and png. */
  frame?: number;
  /** The edited picture's shorter side at most, in pixels. */
  size?: number;
  music?: string;
  /** For each of the recipe's texts: the editor's drawing of it (a PNG file and its size), or how to draw it here. */
  texts?: ({ png: string; w: number; h: number } | DrawHere | null)[];
  /** The encoders this ffmpeg has. */
  encoders: { h264?: string; vp9?: string; vp8?: string; opus?: boolean };
}

export interface Plan {
  /** ffmpeg's arguments (without ffmpeg itself), run in the job's folder. */
  args: string[];
  /** The files it reads, and the one it writes. */
  inputs: string[];
  output: string;
  /** The text files to write in the job's folder before it runs (a text's lines). */
  files: Record<string, string>;
  /** The edited video's length in seconds (what progress is counted against); 0 for a frame. */
  seconds: number;
  /** The size of what it makes. */
  w: number;
  h: number;
  /** It has sound. */
  audio: boolean;
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

/** The ffmpeg command for an edit. Throws, in words a person can act on, for what cannot be made. */
export function planVideo(p: PlanInput): Plan {
  const r = p.recipe;
  const v = p.video;
  const picture = p.format === 'jpg' || p.format === 'png';
  const gif = p.format === 'gif';
  const parts = keptParts(r, v.duration);
  if (!parts.length) throw new Error('Nothing of the video would be left: keep a part of it');
  const speed = r.speed ?? 1;
  const seconds = picture ? 0 : editedLength(r, v.duration);
  // Where reading starts: the first part kept (or the frame); the graph's times count from there.
  const base = picture ? Math.max(0, Math.min(p.frame ?? parts[0][0], v.duration - 0.001)) : parts[0][0];
  const span = parts[parts.length - 1][1] - base;
  const inputs = [p.input];
  const args = ['-hide_banner', '-nostdin', '-y', '-v', 'error', ...(picture ? [] : ['-progress', 'pipe:1', '-nostats'])];
  args.push('-protocol_whitelist', 'file', '-ss', n(base), ...(picture ? [] : ['-t', n(span + 0.001)]), '-i', `file:${p.input}`);
  const chains: Chain[] = [];
  const files: Record<string, string> = {};

  // ---- the picture: cropped (even sides, as H.264 needs), turned, mirrored, coloured -------------------------
  const crop = r.crop ?? { x: 0, y: 0, w: v.width - (v.width % 2), h: v.height - (v.height % 2) };
  const size = editedSize({ crop, rotate: r.rotate }, v.width, v.height);
  const pre: Filter[] = [];
  if (r.crop || v.width % 2 || v.height % 2)
    pre.push({
      name: 'crop',
      args: [
        ['w', crop.w],
        ['h', crop.h],
        ['x', crop.x],
        ['y', crop.y],
      ],
    });
  if (r.rotate === 90) pre.push({ name: 'transpose', args: [['dir', 'clock']] });
  if (r.rotate === 270) pre.push({ name: 'transpose', args: [['dir', 'cclock']] });
  // Half a turn is mirrored both ways; a mirror on top of it undoes one of them.
  const half = r.rotate === 180;
  if (!!r.flipH !== half) pre.push({ name: 'hflip' });
  if (!!r.flipV !== half) pre.push({ name: 'vflip' });
  const colour = colourMath(r);
  if (colour) {
    const k = ['rr', 'rg', 'rb', 'gr', 'gg', 'gb', 'br', 'bg', 'bb'];
    pre.push({ name: 'colorchannelmixer', args: colour.m.map((x, i): [string, Value] => [k[i], n(x, 4)]) });
    if (Math.abs(colour.add) > 0.0005) {
      const add = n(colour.add * 255, 2);
      pre.push({
        name: 'lutrgb',
        args: [
          ['r', `val+${add}`.replace('+-', '-')],
          ['g', `val+${add}`.replace('+-', '-')],
          ['b', `val+${add}`.replace('+-', '-')],
        ],
      });
    }
  }
  // The video itself, never a cover picture inside the file (0:V).
  chains.push({ ins: ['0:V'], filters: pre.length ? pre : [{ name: 'null' }], outs: ['p0'] });

  // ---- words over it: the editor's drawings laid on, or drawn here -------------------------------------------
  let cur = 'p0';
  let k = 0;
  const texts = r.texts ?? [];
  const at = (t: number) => t - base;
  texts.forEach((t, i) => {
    const how = p.texts?.[i];
    if (!how) return;
    // A picture shows the words there at its moment; a video, each between its times.
    if (picture ? !(p.frame! >= t.from && p.frame! < t.to) : t.to <= base || t.from >= parts[parts.length - 1][1]) return;
    const when: [string, Value][] = picture ? [] : [['enable', `between(t,${n(Math.max(0, at(t.from)))},${n(at(t.to))})`]];
    const out = `p${++k}`;
    if ('png' in how) {
      const idx = inputs.length;
      inputs.push(how.png);
      args.push('-protocol_whitelist', 'file', '-i', `file:${how.png}`);
      const x = Math.round(t.x * size.w - how.w / 2);
      const y = Math.round(t.y * size.h - how.h / 2);
      chains.push({
        ins: [cur, `${idx}:v`],
        filters: [
          {
            name: 'overlay',
            args: [['x', x], ['y', y], ...when],
          },
        ],
        outs: [out],
      });
    } else {
      const fontsize = Math.max(8, Math.round(t.size * size.h));
      const lh = Math.round(fontsize * 1.3);
      const pad = Math.max(2, Math.round(fontsize * 0.28));
      const top = Math.round(t.y * size.h - (how.lines.length * lh) / 2);
      const cx = n(t.x * size.w, 1);
      const draws: Filter[] = how.lines.map((line, j) => {
        const file = `text${i}-${j}.txt`;
        files[file] = line;
        return {
          name: 'drawtext',
          args: [
            ['fontfile', how.font],
            ['textfile', file],
            ['expansion', 'none'],
            ['fontsize', fontsize],
            ['fontcolor', ffColor(t.color, 1)],
            ...(t.background
              ? ([
                  ['box', 1],
                  ['boxcolor', ffColor(t.background)],
                  ['boxborderw', pad],
                ] as [string, Value][])
              : []),
            ['x', `${cx}-text_w/2`],
            ['y', top + j * lh + Math.round((lh - fontsize) / 2)],
            ...when,
          ],
        };
      });
      if (!draws.length) return;
      chains.push({ ins: [cur], filters: draws, outs: [out] });
    }
    cur = out;
  });

  // ---- a frame: that picture, and done -----------------------------------------------------------------------
  if (picture) {
    const s = scaledSize(size.w, size.h, { size: p.size });
    const end: Filter[] = [];
    if (s.w !== size.w || s.h !== size.h)
      end.push({
        name: 'scale',
        args: [
          ['w', s.w],
          ['h', s.h],
        ],
      });
    chains.push({ ins: [cur], filters: end.length ? end : [{ name: 'null' }], outs: ['vout'] });
    const graph = graphText(chains);
    args.push('-filter_complex', graph, '-map', '[vout]', '-frames:v', '1', '-update', '1');
    args.push(...(p.format === 'png' ? ['-c:v', 'png'] : ['-q:v', '2']), '-f', 'image2', `file:${p.output}`);
    return { args, inputs, output: p.output, files, seconds: 0, w: s.w, h: s.h, audio: false, graph };
  }

  // ---- the parts kept, joined ----------------------------------------------------------------------------------
  const sound = v.audio && !r.mute && !gif;
  const many = parts.length > 1;
  if (many) chains.push({ ins: [cur], filters: [{ name: 'split', args: [['outputs', parts.length]] }], outs: parts.map((_, i) => `s${i}`) });
  if (sound) {
    const lead: Filter[] = r.volume !== undefined ? [{ name: 'volume', args: [['volume', n(r.volume, 3)]] }] : [];
    if (many) chains.push({ ins: ['0:a'], filters: [...lead, { name: 'asplit', args: [['outputs', parts.length]] }], outs: parts.map((_, i) => `x${i}`) });
    else chains.push({ ins: ['0:a'], filters: [...lead, { name: 'asetpts', args: [['expr', 'PTS-STARTPTS']] }], outs: ['ac'] });
  }
  if (many) {
    parts.forEach(([a, b], i) => {
      chains.push({
        ins: [`s${i}`],
        filters: [
          {
            name: 'trim',
            args: [
              ['start', n(at(a))],
              ['end', n(at(b))],
            ],
          },
          { name: 'setpts', args: [['expr', 'PTS-STARTPTS']] },
        ],
        outs: [`v${i}`],
      });
      if (sound)
        chains.push({
          ins: [`x${i}`],
          filters: [
            {
              name: 'atrim',
              args: [
                ['start', n(at(a))],
                ['end', n(at(b))],
              ],
            },
            { name: 'asetpts', args: [['expr', 'PTS-STARTPTS']] },
          ],
          outs: [`a${i}`],
        });
    });
    chains.push({
      ins: parts.flatMap((_, i) => (sound ? [`v${i}`, `a${i}`] : [`v${i}`])),
      filters: [
        {
          name: 'concat',
          args: [
            ['n', parts.length],
            ['v', 1],
            ['a', sound ? 1 : 0],
          ],
        },
      ],
      outs: sound ? ['vc', 'ac'] : ['vc'],
    });
  } else chains.push({ ins: [cur], filters: [{ name: 'setpts', args: [['expr', 'PTS-STARTPTS']] }], outs: ['vc'] });

  // ---- speed, frames a second, fades, size ---------------------------------------------------------------------
  const fps = gif ? Math.min(15, v.fps ?? 15) : Math.min(60, v.fps && v.fps >= 1 ? v.fps : 30);
  const after: Filter[] = [];
  if (speed !== 1) after.push({ name: 'setpts', args: [['expr', `PTS/${n(speed, 4)}`]] });
  after.push({ name: 'fps', args: [['fps', n(fps, 3)]] });
  if (r.fadeIn)
    after.push({
      name: 'fade',
      args: [
        ['t', 'in'],
        ['st', 0],
        ['d', n(r.fadeIn)],
      ],
    });
  if (r.fadeOut)
    after.push({
      name: 'fade',
      args: [
        ['t', 'out'],
        ['st', n(Math.max(0, seconds - r.fadeOut))],
        ['d', n(r.fadeOut)],
      ],
    });
  const out = scaledSize(size.w, size.h, { size: p.size, gif });
  if (out.w !== size.w || out.h !== size.h)
    after.push({
      name: 'scale',
      args: [['w', out.w], ['h', out.h], ...(gif ? ([['flags', 'lanczos']] as [string, Value][]) : [])],
    });
  if (gif) {
    chains.push({ ins: ['vc'], filters: [...after, { name: 'split' }], outs: ['g0', 'g1'] });
    chains.push({ ins: ['g0'], filters: [{ name: 'palettegen', args: [['stats_mode', 'diff']] }], outs: ['pal'] });
    chains.push({
      ins: ['g1', 'pal'],
      filters: [
        {
          name: 'paletteuse',
          args: [
            ['dither', 'bayer'],
            ['bayer_scale', 4],
          ],
        },
      ],
      outs: ['vout'],
    });
  } else chains.push({ ins: ['vc'], filters: [...after, { name: 'format', args: [['pix_fmts', 'yuv420p']] }], outs: ['vout'] });

  // ---- sound: in tune at its speed, the music under it, faded with the picture -------------------------------
  let audioOut: string | null = null;
  if (!gif) {
    let a: string | null = sound ? 'ac' : null;
    if (a && speed !== 1) {
      chains.push({ ins: [a], filters: tempos(speed).map((x) => ({ name: 'atempo', args: [['tempo', n(x, 4)]] as [string, Value][] })), outs: ['at'] });
      a = 'at';
    }
    if (p.music) {
      const idx = inputs.length;
      inputs.push(p.music);
      args.push('-protocol_whitelist', 'file', '-i', `file:${p.music}`);
      const start = Math.min(r.music?.start ?? 0, Math.max(0, seconds - 0.05));
      const m: Filter[] = [
        {
          name: 'atrim',
          args: [
            ['start', 0],
            ['end', n(Math.max(0.05, seconds - start))],
          ],
        },
        { name: 'asetpts', args: [['expr', 'PTS-STARTPTS']] },
      ];
      if (r.music?.volume !== undefined) m.push({ name: 'volume', args: [['volume', n(r.music.volume, 3)]] });
      if (start > 0)
        m.push({
          name: 'adelay',
          args: [
            ['delays', Math.round(start * 1000)],
            ['all', 1],
          ],
        });
      chains.push({ ins: [`${idx}:a`], filters: m, outs: ['mus'] });
      if (a) {
        chains.push({
          ins: [a, 'mus'],
          filters: [
            {
              name: 'amix',
              args: [
                ['inputs', 2],
                ['duration', 'first'],
                ['dropout_transition', 0],
                ['normalize', 0],
              ],
            },
          ],
          outs: ['am'],
        });
        a = 'am';
      } else a = 'mus';
    }
    if (a) {
      const fades: Filter[] = [];
      if (r.fadeIn)
        fades.push({
          name: 'afade',
          args: [
            ['t', 'in'],
            ['st', 0],
            ['d', n(r.fadeIn)],
          ],
        });
      if (r.fadeOut)
        fades.push({
          name: 'afade',
          args: [
            ['t', 'out'],
            ['st', n(Math.max(0, seconds - r.fadeOut))],
            ['d', n(r.fadeOut)],
          ],
        });
      chains.push({ ins: [a], filters: fades.length ? fades : [{ name: 'anull' }], outs: ['aout'] });
      audioOut = 'aout';
    }
  }

  // ---- the file ----------------------------------------------------------------------------------------------
  const graph = graphText(chains);
  args.push('-filter_complex', graph, '-map', '[vout]', ...(audioOut ? ['-map', `[${audioOut}]`] : ['-an']));
  if (gif) args.push('-loop', '0', '-f', 'gif');
  else if (p.format === 'webm') {
    const vp = p.encoders.vp9 ?? p.encoders.vp8;
    if (!vp) throw new Error('This ffmpeg cannot make WebM videos (it has no VP9 or VP8 encoder): save it as MP4');
    args.push('-c:v', vp, ...(vp === 'libvpx-vp9' ? ['-b:v', '0', '-crf', '33', '-deadline', 'realtime', '-cpu-used', '8', '-row-mt', '1'] : ['-b:v', '2M', '-crf', '10', '-deadline', 'realtime', '-cpu-used', '8']));
    if (audioOut) args.push('-c:a', p.encoders.opus ? 'libopus' : 'libvorbis', '-b:a', '128k');
    args.push('-f', 'webm');
  } else {
    const h264 = p.encoders.h264;
    if (!h264) throw new Error('This ffmpeg cannot make H.264 videos: install ffmpeg, or set up the picture tools in Settings → Images, video and audio');
    args.push('-c:v', h264, ...(h264 === 'libx264' ? ['-preset', 'veryfast', '-crf', '20'] : ['-b:v', '8M']));
    if (audioOut) args.push('-c:a', 'aac', '-b:a', '160k');
    args.push('-movflags', '+faststart', '-f', p.container === 'mov' ? 'mov' : 'mp4');
  }
  args.push(`file:${p.output}`);
  return { args, inputs, output: p.output, files, seconds, w: out.w, h: out.h, audio: !!audioOut, graph };
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
