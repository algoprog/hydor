// What ffmpeg tells and makes of a picture or a video: its size and length (ffprobe), a still to show it by,
// a smaller copy of a picture, and a video's frames on one picture: ten of them, evenly spread, in a grid,
// which is what a model sees to write a video's title and description. Without ffmpeg on the computer, none
// of these: a video then shows without a still, and is described from what it was made from.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { agentBaseEnv } from '../env.ts';

function run(bin: string, args: string[], timeout = 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout, maxBuffer: 8 << 20, env: { ...agentBaseEnv(), CUDA_VISIBLE_DEVICES: '' } }, (err, stdout, stderr) => {
      if (err) reject(new Error(String(stderr || err.message).trim().split('\n').pop() || 'ffmpeg failed'));
      else resolve(String(stdout));
    });
  });
}

const FFMPEG = process.env.NAGET_FFMPEG || 'ffmpeg';
const FFPROBE = process.env.NAGET_FFPROBE || 'ffprobe';

let found: Promise<boolean> | null = null;

/** Whether ffmpeg and ffprobe are on this computer (asked once). */
export function hasFfmpeg(): Promise<boolean> {
  return (found ??= Promise.all([run(FFMPEG, ['-hide_banner', '-version'], 10_000), run(FFPROBE, ['-hide_banner', '-version'], 10_000)]).then(
    () => true,
    () => false,
  ));
}

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

/** A file's size and length, as ffprobe reads them; null without ffprobe or when it reads nothing. */
export async function probe(file: string): Promise<Probed | null> {
  if (!(await hasFfmpeg())) return null;
  try {
    const out = await run(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height,nb_frames,duration:stream_disposition=attached_pic', '-of', 'json', file], 30_000);
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
  if (!(await hasFfmpeg())) return false;
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
  if (!(await hasFfmpeg())) return null;
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
