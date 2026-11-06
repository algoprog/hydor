// What ffmpeg tells and makes of a picture, a video or a sound: its size and length (ffprobe), a still to show it
// by, a smaller copy of a picture, a video's frames on one picture (ten of them, evenly spread, in a grid, which is
// what a model sees to write a video's title and description), a sound's shape (how loud it is along its length,
// to draw it by), and a voice sample cut and turned into the WAV a voice model takes. Without ffmpeg on the
// computer, the picture tools' own does it (a portable ffmpeg that comes with them, imageio-ffmpeg: it has no ffprobe,
// so sizes and lengths are read from what ffmpeg says of a file); without either, none of these: a video then shows
// without a still, and is described from what it was made from.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.ts';
import { agentBaseEnv } from '../env.ts';

function run(bin: string, args: string[], timeout = 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout, maxBuffer: 8 << 20, env: { ...agentBaseEnv(), CUDA_VISIBLE_DEVICES: '' } }, (err, stdout, stderr) => {
      if (err) reject(new Error(String(stderr || err.message).trim().split('\n').pop() || 'ffmpeg failed'));
      else resolve(String(stdout));
    });
  });
}

/** The same, for what comes out as bytes (raw sound). */
function runRaw(bin: string, args: string[], timeout = 60_000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout, maxBuffer: 64 << 20, encoding: 'buffer', env: { ...agentBaseEnv(), CUDA_VISIBLE_DEVICES: '' } }, (err, stdout, stderr) => {
      if (err) reject(new Error(String(stderr || err.message).trim().split('\n').pop() || 'ffmpeg failed'));
      else resolve(stdout);
    });
  });
}

/** What ffmpeg says of a file it is only asked to read (it then ends with an error, having nothing to write): its words. */
function said(bin: string, args: string[], timeout = 30_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout, maxBuffer: 8 << 20, env: { ...agentBaseEnv(), CUDA_VISIBLE_DEVICES: '' } }, (err, _stdout, stderr) => {
      if (err && (err as NodeJS.ErrnoException).code === 'ENOENT') reject(err);
      else if (err?.killed) reject(new Error('ffmpeg took too long'));
      else resolve(String(stderr));
    });
  });
}

// ---- finding ffmpeg ----------------------------------------------------------------------------------------------

/** Where ffmpeg is, and ffprobe when it is there too. */
export interface FfmpegTools {
  ffmpeg: string;
  ffprobe: string | null;
  /** The picture tools' portable ffmpeg (no ffprobe), not one installed on this computer. */
  portable: boolean;
}

/** What to tell a person when there is no ffmpeg at all. */
export const NO_FFMPEG = 'Video editing needs ffmpeg: set up the picture tools in Settings → Images, video and audio, or install ffmpeg';

/** The picture tools' Python (server/images/local.ts sets it up), which carries a portable ffmpeg. */
const picturePython = () => process.env.HYDOR_PICTURES_PYTHON || path.join(config.dataDir, 'pictures', 'venv', ...(process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python']));

const works = (bin: string) =>
  run(bin, ['-hide_banner', '-version'], 10_000).then(
    () => true,
    () => false,
  );

async function lookFor(): Promise<FfmpegTools | null> {
  const ffmpeg = process.env.HYDOR_FFMPEG || 'ffmpeg';
  const ffprobe = process.env.HYDOR_FFPROBE || 'ffprobe';
  const [a, b] = await Promise.all([works(ffmpeg), works(ffprobe)]);
  if (a) return { ffmpeg, ffprobe: b ? ffprobe : null, portable: false };
  const py = picturePython();
  if (!fs.existsSync(py)) return null;
  const out = await run(py, ['-I', '-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], 30_000).catch(() => '');
  const exe = out.trim().split('\n').pop()?.trim() ?? '';
  return exe && path.isAbsolute(exe) && fs.existsSync(exe) && (await works(exe)) ? { ffmpeg: exe, ffprobe: null, portable: true } : null;
}

let known: { at: number; tools: FfmpegTools | null } | null = null;
let looking: Promise<FfmpegTools | null> | null = null;

/**
 * ffmpeg on this computer (with ffprobe when it is there), else the picture tools' portable one; null without either.
 * Looked for again a minute after none was found (the picture tools may be set up meanwhile), and when the portable
 * one is gone (the picture tools removed).
 */
export async function ffmpegTools(): Promise<FfmpegTools | null> {
  const k = known;
  if (k && (k.tools ? !k.tools.portable || fs.existsSync(k.tools.ffmpeg) : Date.now() - k.at < 60_000)) return k.tools;
  return (looking ??= lookFor()
    .catch(() => null)
    .then((tools) => {
      known = { at: Date.now(), tools };
      looking = null;
      return tools;
    }));
}

/** Looks for ffmpeg again on the next ask (tests; the picture tools just set up). */
export const forgetFfmpeg = () => void (known = null);

/** Whether ffmpeg is here: this computer's, or the picture tools' own. */
export const hasFfmpeg = async (): Promise<boolean> => !!(await ffmpegTools());

/** The ffmpeg to run for the editors' own work (a picture edited, a video cut): this computer's or the picture tools' own; null without either. */
export const ffmpegBin = async (): Promise<string | null> => (await ffmpegTools())?.ffmpeg ?? null;

export interface Probed {
  width?: number;
  height?: number;
  /** Seconds. */
  duration?: number;
  /** It has moving pictures (not only a still), and sound. */
  video: boolean;
  audio: boolean;
  frames?: number;
}

/** What ffmpeg says of a file, read: its length, size, turn, frames a second and sound; null when it reads nothing. */
export interface FfmpegInfo extends Probed {
  /** The turn a phone put in it, in degrees (0, 90, 180 or 270): ffmpeg and browsers show it turned so, a quarter turn with its sides swapped. */
  rotation: number;
  fps?: number;
}

/** What ffmpeg's words about a file say of it (read by ffmpegInfo; apart, so it can be tested). */
export function readFfmpegInfo(text: string): FfmpegInfo | null {
  const lines = text.split(/\r?\n/);
  const d = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(text);
  const duration = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : undefined;
  // The first video stream that is not a cover picture, and the side data under it (its turn).
  const at = lines.findIndex((l) => /Stream #\d+:\d+.*: Video:/.test(l) && !/\(attached pic\)/.test(l));
  const audio = lines.some((l) => /Stream #\d+:\d+.*: Audio:/.test(l));
  if (at < 0 && !audio && duration === undefined) return null;
  const v = at >= 0 ? lines[at] : '';
  const size = /,\s*(\d{1,5})x(\d{1,5})(?=[\s,\[]|$)/.exec(v);
  const fps = /,\s*(\d+(?:\.\d+)?)\s*fps\b/.exec(v) ?? /,\s*(\d+(?:\.\d+)?)\s*tbr\b/.exec(v);
  let rotation = 0;
  if (at >= 0)
    for (let i = at + 1; i < lines.length && !/^\s*Stream #/.test(lines[i]); i++) {
      const r = /rotation of\s*(-?\d+(?:\.\d+)?)\s*degrees/i.exec(lines[i]);
      if (r) {
        rotation = (((Math.round(Number(r[1]) / 90) * 90) % 360) + 360) % 360;
        break;
      }
    }
  return {
    width: size ? Number(size[1]) || undefined : undefined,
    height: size ? Number(size[2]) || undefined : undefined,
    duration: duration && Number.isFinite(duration) && duration > 0 ? duration : undefined,
    video: at >= 0,
    audio,
    rotation,
    ...(fps && Number(fps[1]) > 0 && Number(fps[1]) < 1000 ? { fps: Number(fps[1]) } : {}),
  };
}

/** A file's length, size (as stored: a phone's turn is in `rotation`), frames a second and sound, from ffmpeg's own words; null without ffmpeg. */
export async function ffmpegInfo(file: string): Promise<FfmpegInfo | null> {
  const bin = await ffmpegBin();
  if (!bin) return null;
  try {
    return readFfmpegInfo(await said(bin, ['-hide_banner', '-nostdin', '-i', `file:${file}`]));
  } catch {
    return null;
  }
}

/** A file's size and length, as ffprobe reads them (as ffmpeg says them, without ffprobe); null without ffmpeg or when it reads nothing. */
export async function probe(file: string): Promise<Probed | null> {
  const t = await ffmpegTools();
  if (!t) return null;
  if (!t.ffprobe) {
    const i = await ffmpegInfo(file);
    return i && { width: i.width, height: i.height, duration: i.duration, video: i.video, audio: i.audio };
  }
  try {
    const out = await run(t.ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height,nb_frames,duration:stream_disposition=attached_pic', '-of', 'json', file], 30_000);
    const j = JSON.parse(out);
    const streams: any[] = Array.isArray(j.streams) ? j.streams : [];
    // A cover picture inside an MP4 is a video stream too: the real one is not "attached".
    const v = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
    const duration = Number(j.format?.duration) || Number(v?.duration) || undefined;
    return {
      width: Number(v?.width) || undefined,
      height: Number(v?.height) || undefined,
      duration: duration && Number.isFinite(duration) ? duration : undefined,
      video: !!v,
      audio: streams.some((s) => s.codec_type === 'audio'),
      frames: Number(v?.nb_frames) || undefined,
    };
  } catch {
    return null;
  }
}

/** A still of a video (a tenth of the way in) or a smaller copy of a picture, as JPEG at most `width` wide. */
export async function still(file: string, out: string, o: { at?: number; width?: number } = {}): Promise<boolean> {
  const FFMPEG = await ffmpegBin();
  if (!FFMPEG) return false;
  const w = o.width ?? 640;
  try {
    await run(FFMPEG, ['-v', 'error', '-y', ...(o.at ? ['-ss', o.at.toFixed(2)] : []), '-i', file, '-map', '0:V:0', '-frames:v', '1', '-vf', `scale='min(${w},iw)':-2`, '-q:v', '4', out]);
    return fs.existsSync(out) && fs.statSync(out).size > 0;
  } catch {
    return false;
  }
}

/**
 * Ten frames of a video, evenly spread from start to end, on one JPEG: two rows of five, or five rows of two,
 * whichever comes nearer square for the video's shape, at most about 1,600 pixels on its longer side.
 */
export async function frameGrid(file: string, out: string, o: { count?: number; duration?: number; width?: number; height?: number } = {}): Promise<{ cols: number; rows: number } | null> {
  const FFMPEG = await ffmpegBin();
  if (!FFMPEG) return null;
  const count = o.count ?? 10;
  const ar = o.width && o.height ? o.width / o.height : 16 / 9;
  // Five across suits tall videos; two across, wide ones.
  const layouts = [
    { cols: 5, rows: 2 },
    { cols: 2, rows: 5 },
  ];
  const squareness = (l: { cols: number; rows: number }) => Math.abs(Math.log((l.cols * ar) / l.rows));
  const { cols, rows } = layouts.sort((a, b) => squareness(a) - squareness(b))[0];
  const long = 1600;
  const fw = Math.max(96, Math.floor(Math.min(long / cols, (long / rows) * ar) / 2) * 2);
  const dur = o.duration && o.duration > 0 ? o.duration : undefined;
  // Spread over the whole length; without one, a frame a second.
  const pick = dur ? `fps=${count}/${dur.toFixed(3)}` : 'fps=1';
  try {
    await run(FFMPEG, ['-v', 'error', '-y', '-i', file, '-map', '0:V:0', '-vf', `${pick},scale=${fw}:-2,tile=${cols}x${rows}:padding=6:margin=6:color=0x161616`, '-frames:v', '1', '-q:v', '4', out], 120_000);
    return fs.existsSync(out) && fs.statSync(out).size > 0 ? { cols, rows } : null;
  } catch {
    return null;
  }
}

/** How loud raw 16-bit mono sound is along its length: `count` levels from 0 to 1 (the loudest part is 1). */
export function peaksOf(pcm: Buffer, count = 64): number[] | null {
  const n = Math.floor(pcm.length / 2);
  if (n < count) return null;
  const per = n / count;
  const levels: number[] = [];
  for (let i = 0; i < count; i++) {
    const a = Math.floor(i * per);
    const b = Math.max(a + 1, Math.floor((i + 1) * per));
    let sum = 0;
    for (let j = a; j < b; j++) {
      const v = pcm.readInt16LE(j * 2) / 32768;
      sum += v * v;
    }
    levels.push(Math.sqrt(sum / (b - a)));
  }
  const top = Math.max(...levels);
  return levels.map((v) => (top > 0 ? Math.round((v / top) * 100) / 100 : 0));
}

/** A sound's shape, to draw it by: how loud each of `count` parts of it is (peaksOf), read with ffmpeg; null without it. */
export async function waveform(file: string, count = 64): Promise<number[] | null> {
  const FFMPEG = await ffmpegBin();
  if (!FFMPEG) return null;
  try {
    // One channel, 2,000 samples a second: a 3-minute song is 720 KB to read.
    const raw = await runRaw(FFMPEG, ['-v', 'error', '-i', file, '-map', '0:a:0', '-ac', '1', '-ar', '2000', '-f', 's16le', '-c:a', 'pcm_s16le', '-'], 120_000);
    return peaksOf(raw, count);
  } catch {
    return null;
  }
}

/** A voice sample as voice models take it: its first `seconds`, one channel at 24 kHz, as WAV at `out`; false without ffmpeg. */
export async function voiceClip(file: string, out: string, seconds = 30): Promise<boolean> {
  const FFMPEG = await ffmpegBin();
  if (!FFMPEG) return false;
  try {
    await run(FFMPEG, ['-v', 'error', '-y', '-i', file, '-map', '0:a:0', '-t', String(seconds), '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', out], 120_000);
    return fs.existsSync(out) && fs.statSync(out).size > 44;
  } catch {
    return false;
  }
}
