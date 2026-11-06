// The video editor's work on the server: an edit (shared/mediaedit-video.ts, a timeline of clips, overlays, sounds and
// words) made with ffmpeg as one command (video-plan.ts), as a job: in line (two are made at once, the rest wait their
// turn), made with its progress, stopped when asked, then put where it was asked to go: kept as a deck's video (its
// first frame a kept picture, for the slide's still), as a deck's picture (a frame, a GIF), as a Library item's file or
// a new item, over a file (the old one to the Trash) or as a copy beside it. A video is made on the graphics card when
// there is one that works (video-gpu.ts); when the card fails, it is made again on the processor at once. A job is kept
// in memory for an hour after it ends. Without ffmpeg on this computer, the picture tools' portable one does it
// (server/media/frames.ts); without either, the routes say how to get one.
//
// Routes, signed in (agents have edit_video instead, video-tool.ts):
//   GET    /api/mediaedit/video/info?src=          VideoFacts: a video's, a picture's or a sound's length, size and sound, and whether ffmpeg is here
//   GET    /api/mediaedit/video/strip?src=&n=&h=&from=&to=   n of its frames side by side (from and to: seconds of it), h pixels tall (a JPEG)
//   GET    /api/mediaedit/video/peaks?src=&n=      { peaks }: how loud its sound is along its length, for the timeline
//   GET    /api/mediaedit/video/encoders           what this ffmpeg can make, and the graphics card
//   POST   /api/mediaedit/video/sound              a sound from this device or the microphone (its bytes) → { src: "naget-sound:…", duration }
//   GET    /api/mediaedit/video/sound/:sha         that sound
//   POST   /api/mediaedit/video/captions           { src, recipe, lang? } → { captions, srt }: what is said, with its times
//   POST   /api/mediaedit/video                    VideoEditAsk → VideoEditJob
//   GET    /api/mediaedit/video/:job               VideoEditJob
//   DELETE /api/mediaedit/video/:job               stops it → VideoEditJob
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import type { MediaItem } from '../../shared/media.ts';
import {
  captionsSrt,
  clipSpans,
  MAX_GIF_SECONDS,
  normalizeVideoRecipe,
  outputSize,
  type VideoCodec,
  type VideoEditAsk,
  type VideoEditJob,
  type VideoFacts,
  type VideoFactsOf,
  type VideoOut,
  type VideoQuality,
  type VideoRecipe,
  type VideoSaveTo,
  type VideoSize,
} from '../../shared/mediaedit-video.ts';
import { ASSET, VIDEO } from '../../shared/slides.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import { kvGet, type DB } from '../db.ts';
import { agentBaseEnv } from '../env.ts';
import type { Deps, Feature } from '../features/types.ts';
import { claimName, fileHash, moveWhole } from '../filemove.ts';
import { deletePath, resolvePath, trashCopy } from '../files.ts';
import { slug } from '../images/openrouter.ts';
import { ffmpegInfo, ffmpegTools, frameGrid, NO_FFMPEG, still, waveform } from '../media/frames.ts';
import { keepFile } from '../media/index.ts';
import { filesOf, getMedia, initMedia, MEDIA_DIR, mustMedia } from '../media/store.ts';
import { putInFolder } from '../pages/folders.ts';
import { getAsset, MAX_ASSET, pictureType, putAsset } from '../pages/assets.ts';
import { getVideo, keepVideoFile, sendVideo, videoType } from '../pages/videos.ts';
import { voiceService } from '../voice/index.ts';
import { fontFor } from './video-fonts.ts';
import { gpuEncoder, gpuRoutes, gpuState, HW_NAMES, markBroken } from './video-gpu.ts';
import { checkPlan, planVideo, type DrawHere, type Encoders, type Plan, type TextHow } from './video-plan.ts';
import { editVideoTool } from './video-tool.ts';

/** How many are made at once, how many may wait, how long one may take, and how long one is kept after it ends. */
const AT_ONCE = 2;
const WAITING = 8;
const LIMIT_MS = 45 * 60_000;
const KEEP_MS = 3600_000;
/** The longest edited video made, in seconds. */
const MAX_SECONDS = 60 * 60;
/** The most files an edit reads at once (each a decoder in memory). */
const MAX_INPUTS = 120;

const tmpRoot = () => path.join(config.dataDir, 'mediaedit', 'tmp');
const stripDir = () => path.join(config.dataDir, 'mediaedit', 'strips');
const soundDir = () => path.join(config.dataDir, 'mediaedit', 'sounds');
const pictureDir = () => path.join(config.dataDir, 'mediaedit', 'pictures');

const VIDEO_EXT: Record<string, true> = { mp4: true, m4v: true, mov: true, webm: true };
const PICTURE_EXT: Record<string, true> = { png: true, jpg: true, jpeg: true, webp: true, gif: true, bmp: true };
const SOUND_EXT: Record<string, true> = { mp3: true, wav: true, m4a: true, aac: true, ogg: true, oga: true, opus: true, flac: true, webm: true, weba: true };

// ---- what is edited: videos, pictures and sounds ---------------------------------------------------------------------

export type SourceKind = 'video' | 'picture' | 'sound';

/** A video, a picture or a sound an edit reads: its file, and what it is in the app (a deck's, a Library item, a file). */
export interface Source {
  file: string;
  kind: SourceKind;
  /** A deck's video ("naget-video:<sha>"). */
  kept?: string;
  media?: MediaItem;
  /** A file of the computer's (Files), or of an agent's session. */
  path?: string;
  /** What to call what is made of it. */
  name: string;
}

const MEDIA_ID = /^(?:media:|\/api\/media\/)([a-f0-9]{10})(?:\/file)?(?:[?#].*)?$/;
const KEPT_VIDEO = /^(?:naget-video:|\/api\/pages\/videos\/)([a-f0-9]{16,64})(?:[?#].*)?$/;
const KEPT_PICTURE = /^(?:naget-asset:|\/api\/pages\/assets\/)([a-f0-9]{16,64})(?:[?#].*)?$/;
const KEPT_SOUND = /^(?:naget-sound:|\/api\/mediaedit\/video\/sound\/)([a-f0-9]{16,64})(?:[?#].*)?$/;

async function headOf(file: string): Promise<Buffer> {
  const fd = await fs.promises.open(file, 'r');
  try {
    const b = Buffer.alloc(64);
    const { bytesRead } = await fd.read(b, 0, 64, 0);
    return b.subarray(0, bytesRead);
  } finally {
    await fd.close();
  }
}

/** A path given in a request or by an agent: its own session's (`cwd`), else the signed-in user's (Files'). */
function pathOf(p: string, cwd?: string): string {
  const fsRaw = /^\/api\/fs\/raw\?(.*)$/.exec(p);
  if (fsRaw) p = new URLSearchParams(fsRaw[1]).get('path') ?? '';
  if (cwd === undefined) return resolvePath(p);
  const s = p.trim();
  return s === '~' || s.startsWith('~/') ? path.join(os.homedir(), s.slice(1)) : path.resolve(cwd, s);
}

const KIND_WORDS: Record<SourceKind, string> = { video: 'a video (MP4, MOV or WebM)', picture: 'a picture (PNG, JPEG, WebP or GIF)', sound: 'a sound (MP3, WAV, M4A, OGG, OPUS or FLAC)' };

/** A deck's picture as a file the edit can read (kept beside the editor's other files, made once). */
function pictureFile(db: DB, sha: string): string {
  const a = getAsset(db, sha);
  if (!a) throw new HttpError(404, 'That picture is no longer kept by the app');
  const ext = a.mime === 'image/png' ? 'png' : a.mime === 'image/webp' ? 'webp' : a.mime === 'image/gif' ? 'gif' : 'jpg';
  const file = path.join(pictureDir(), `${sha}.${ext}`);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(pictureDir(), { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, a.data);
  }
  return file;
}

/** What `src` names (a deck's video or picture, a Library item, a sound kept by the editor, or a file), if it is one of `kinds`; throws what is wrong. */
export async function sourceOf(db: DB, src: unknown, o: { cwd?: string; kinds?: SourceKind[] } = {}): Promise<Source> {
  const kinds = o.kinds ?? ['video'];
  const s = typeof src === 'string' ? src.trim() : '';
  if (!s) throw new HttpError(400, 'src: the video to edit');
  const want = (kind: SourceKind, x: Source): Source => {
    if (!kinds.includes(kind)) throw new HttpError(400, `That is not ${kinds.map((k) => KIND_WORDS[k]).join(' or ')}`);
    return x;
  };
  const kept = KEPT_VIDEO.exec(s);
  if (kept) {
    const v = getVideo(db, kept[1]);
    if (!v) throw new HttpError(404, 'That video is no longer kept by the app');
    return want('video', { file: v.file, kind: 'video', kept: VIDEO + kept[1], name: 'video' });
  }
  const pic = KEPT_PICTURE.exec(s);
  if (pic) return want('picture', { file: pictureFile(db, pic[1]), kind: 'picture', name: 'picture' });
  const snd = KEPT_SOUND.exec(s);
  if (snd) {
    const file = fs.existsSync(soundDir()) ? fs.readdirSync(soundDir()).find((n) => n.startsWith(`${snd[1]}.`)) : undefined;
    if (!file) throw new HttpError(404, 'That sound is no longer kept by the app');
    return want('sound', { file: path.join(soundDir(), file), kind: 'sound', name: 'sound' });
  }
  const media = MEDIA_ID.exec(s);
  if (media) {
    const m = mustMedia(db, media[1]);
    const kind: SourceKind = m.kind === 'video' ? 'video' : m.kind === 'image' ? 'picture' : 'sound';
    if (!kinds.includes(kind)) throw new HttpError(400, m.kind === 'video' ? 'That Library item is a video' : m.kind === 'image' ? 'That Library item is a picture, not a video' : 'That Library item is a sound, not a video');
    return { file: m.file, kind, media: m, name: m.title };
  }
  const file = pathOf(s, o.cwd);
  const st = await fs.promises.stat(file).catch(() => null);
  if (!st?.isFile()) throw new HttpError(404, `No such file: ${file}`);
  const ext = path.extname(file).slice(1).toLowerCase();
  const name = path.basename(file).replace(/\.[^.]+$/, '');
  const head = await headOf(file);
  if (VIDEO_EXT[ext] && videoType(head) && kinds.includes('video')) return { file, kind: 'video', path: file, name };
  if (PICTURE_EXT[ext] && (pictureType(head) || ext === 'bmp') && kinds.includes('picture')) return { file, kind: 'picture', path: file, name };
  if (SOUND_EXT[ext] && kinds.includes('sound')) return { file, kind: 'sound', path: file, name };
  throw new HttpError(400, `${path.basename(file)} is not ${kinds.map((k) => KIND_WORDS[k]).join(' or ')}`);
}

/** The music `src` names: a sound of the Library's, a sound kept by the editor, or a sound file. */
export async function musicOf(db: DB, src: string, o: { cwd?: string } = {}): Promise<string> {
  return (await sourceOf(db, src, { ...o, kinds: ['sound'] })).file;
}

/** What ffmpeg says of a video, as the editor needs it: its length, its size as it shows, its sound and frames a second. */
export async function factsOf(file: string): Promise<Required<Pick<VideoFacts, 'duration' | 'width' | 'height' | 'audio'>> & { fps?: number }> {
  const i = await ffmpegInfo(file);
  if (!i?.video || !i.width || !i.height) throw new HttpError(422, 'ffmpeg could not read that video');
  if (!i.duration) throw new HttpError(422, 'The video’s length could not be read');
  const side = i.rotation === 90 || i.rotation === 270;
  return { duration: i.duration, width: side ? i.height : i.width, height: side ? i.width : i.height, audio: i.audio, ...(i.fps ? { fps: i.fps } : {}) };
}

/** A source's facts as the timeline needs them: a video's, a picture's size, a sound's length. */
export async function sizeOf(s: Source): Promise<VideoSize> {
  if (s.kind === 'video') return factsOf(s.file);
  const i = await ffmpegInfo(s.file);
  if (s.kind === 'picture') {
    if (!i?.width || !i.height) throw new HttpError(422, `ffmpeg could not read the picture ${path.basename(s.file)}`);
    const side = i.rotation === 90 || i.rotation === 270;
    return { duration: 0, width: side ? i.height : i.width, height: side ? i.width : i.height, picture: true };
  }
  if (!i?.duration) throw new HttpError(422, `The sound’s length could not be read: ${path.basename(s.file)}`);
  return { duration: i.duration, width: 0, height: 0, audio: true };
}

// ---- ffmpeg's encoders ------------------------------------------------------------------------------------------------

const encoders = new Map<string, Promise<Encoders>>();

/** The encoders an ffmpeg has, asked once: H.264 (x264 first), H.265, AV1, VP9, VP8, Opus. */
export function encodersOf(bin: string): Promise<Encoders> {
  let e = encoders.get(bin);
  if (!e) {
    e = new Promise((resolve) => {
      execFile(bin, ['-hide_banner', '-encoders'], { timeout: 20_000, maxBuffer: 8 << 20, env: agentBaseEnv() }, (_err, stdout) => {
        const have = new Set(
          String(stdout ?? '')
            .split('\n')
            .map((l) => /^\s*[VA]\S*\s+(\S+)/.exec(l)?.[1])
            .filter((x): x is string => !!x),
        );
        resolve({
          h264: ['libx264', 'libopenh264', 'h264_videotoolbox', 'h264_mf'].find((x) => have.has(x)),
          h265: ['libx265'].find((x) => have.has(x)),
          av1: ['libsvtav1', 'libaom-av1', 'librav1e'].find((x) => have.has(x)),
          vp9: have.has('libvpx-vp9') ? 'libvpx-vp9' : undefined,
          vp8: have.has('libvpx') ? 'libvpx' : undefined,
          opus: have.has('libopus'),
        });
      });
    });
    encoders.set(bin, e);
  }
  return e;
}

// ---- jobs ---------------------------------------------------------------------------------------------------------

/** Whether a file is the app's own (its data folder: the Library's files, a deck's videos), which is never written from here. */
function appsOwn(file: string): boolean {
  const real = (p: string) => {
    try {
      return fs.realpathSync(p);
    } catch {
      return path.resolve(p);
    }
  };
  const data = real(config.dataDir);
  const at = real(fs.existsSync(file) ? file : path.dirname(file));
  return at === data || at.startsWith(data + path.sep);
}

/** Where an edit goes: as the route asks (VideoSaveTo), or (an agent's) into a folder of its session under a name. */
export type SaveTo = VideoSaveTo | { into: string; name: string };

/** An edit checked and ready to make. */
export interface Prepared {
  d: Deps;
  /** The video being edited (where it is saved, and its clips without a src). */
  source: Source;
  facts: VideoSize;
  /** Every source of the edit, by its src. */
  sources: Map<string, { source: Source; facts: VideoSize }>;
  factsOf: VideoFactsOf;
  recipe: VideoRecipe;
  format: VideoOut;
  frame?: number;
  range?: [number, number];
  size?: number;
  exactSize?: boolean;
  fps?: number;
  codec?: VideoCodec;
  quality?: VideoQuality;
  /** Made on the processor even with a graphics card that could. */
  cpu?: boolean;
  /** A deck's video: the moment its still is taken at (seconds of the timeline). */
  still?: number;
  to: SaveTo;
  /** The editor's drawings of the texts (PNG), by the recipe's order; null where it drew none. */
  drawn: (Buffer | null)[];
  /** The timeline's length, and what is made of it. */
  length: number;
  seconds: number;
}

interface Job {
  view: VideoEditJob;
  prep: Prepared;
  proc?: ChildProcess;
  stopping?: boolean;
  late?: boolean;
  /** Settles when it ends, whichever way. */
  ended: Promise<void>;
  end: () => void;
}

const jobs = new Map<string, Job>();
const line: Job[] = [];
let making = 0;

/** A job by its id, as the routes and edit_video see it. */
export const videoJob = (id: string): VideoEditJob | null => jobs.get(id)?.view ?? null;
/** Waits for a job to end, at most `ms`: whether it did. */
export async function waitForJob(id: string, ms: number, signal?: AbortSignal): Promise<boolean> {
  const j = jobs.get(id);
  if (!j) return false;
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<false>((r) => {
    timer = setTimeout(() => r(false), Math.max(0, ms));
    signal?.addEventListener('abort', () => r(false), { once: true });
  });
  try {
    return await Promise.race([j.ended.then(() => true as const), late]);
  } finally {
    clearTimeout(timer);
  }
}

const isEnded = (s: VideoEditJob['status']) => s === 'done' || s === 'failed' || s === 'stopped';

function finish(j: Job, status: 'done' | 'failed' | 'stopped', error?: string) {
  if (isEnded(j.view.status)) return;
  Object.assign(j.view, { status, endedAt: Date.now(), ...(error ? { error } : {}) });
  if (status === 'done') j.view.progress = 1;
  else delete j.view.progress;
  j.end();
  setTimeout(() => jobs.get(j.view.job) === j && jobs.delete(j.view.job), KEEP_MS).unref?.();
}

function pump() {
  while (making < AT_ONCE && line.length) {
    const j = line.shift()!;
    making++;
    void make(j).finally(() => {
      making--;
      pump();
    });
  }
}

/** Starts an edit (in line behind two being made): its job. */
export function startVideoEdit(prep: Prepared): VideoEditJob {
  if (line.length >= WAITING) throw new HttpError(429, `${WAITING} edits are waiting already: wait for some of them to be made`);
  let end!: () => void;
  const ended = new Promise<void>((r) => (end = r));
  const view: VideoEditJob = { job: crypto.randomBytes(8).toString('hex'), status: 'queued', format: prep.format, startedAt: Date.now() };
  const j: Job = { view, prep, ended, end };
  jobs.set(view.job, j);
  line.push(j);
  pump();
  return view;
}

/** Stops a job: one in line leaves it, one being made is ended (its files go). */
export function stopVideoEdit(id: string): VideoEditJob | null {
  const j = jobs.get(id);
  if (!j) return null;
  if (isEnded(j.view.status)) return j.view;
  const i = line.indexOf(j);
  if (i >= 0) {
    line.splice(i, 1);
    finish(j, 'stopped');
    return j.view;
  }
  j.stopping = true;
  if (j.proc) {
    j.proc.kill('SIGTERM');
    const p = j.proc;
    setTimeout(() => p.exitCode === null && p.signalCode === null && p.kill('SIGKILL'), 3000).unref?.();
  }
  return j.view;
}

/** ffmpeg's last words, as a reason a person can read. */
function ffmpegWords(tail: string): string {
  const lines = tail
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^(?:\[.*?\] )?(?:Last message repeated|Conversion failed!)/.test(l));
  const last = lines
    .slice(-3)
    .join(' ')
    .replace(/file:\S+/g, 'the file')
    .slice(0, 400);
  return last ? `ffmpeg could not make it: ${last}` : 'ffmpeg could not make it';
}

/** Runs a plan in the job's folder, its progress told to the job. The graphics card is hidden from it unless it uses it. */
function runFfmpeg(bin: string, plan: Plan, cwd: string, j: Job, gpu: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const env = gpu ? agentBaseEnv() : { ...agentBaseEnv(), CUDA_VISIBLE_DEVICES: '' };
    const proc = spawn(bin, plan.args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    j.proc = proc;
    let tail = '';
    let buf = '';
    proc.stdout!.on('data', (b: Buffer) => {
      buf += b.toString('utf8');
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        const m = /^out_time_(?:us|ms)=(\d+)/.exec(buf.slice(0, i).trim());
        buf = buf.slice(i + 1);
        if (m && plan.seconds > 0) j.view.progress = Math.max(j.view.progress ?? 0, Math.min(0.99, Number(m[1]) / 1e6 / plan.seconds));
      }
    });
    proc.stderr!.on('data', (b: Buffer) => void (tail = (tail + b.toString('utf8')).slice(-6000)));
    const timer = setTimeout(() => {
      j.late = true;
      proc.kill('SIGKILL');
    }, LIMIT_MS);
    proc.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      j.proc = undefined;
      if (code === 0 && !j.stopping) resolve();
      else reject(new Error(j.stopping ? 'stopped' : j.late ? `It took over ${LIMIT_MS / 60_000} minutes, so it was stopped: make a shorter or smaller one` : ffmpegWords(tail)));
    });
  });
}

/** The PNG's size from its header; null for anything that is not a PNG. */
export function pngSize(b: Buffer): { w: number; h: number } | null {
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47 || b.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

/** A font for words drawn here, linked (or copied) into the job's folder as `name`: its file name there, or null without one. */
async function fontInto(dir: string, i: number, text: string, bold: boolean): Promise<string | null> {
  const font = await fontFor(text, bold);
  if (!font) return null;
  const ext = path.extname(font).toLowerCase();
  const name = `font${i}${ext === '.otf' || ext === '.ttc' ? ext : '.ttf'}`;
  try {
    await fs.promises.symlink(font, path.join(dir, name));
  } catch {
    await fs.promises.copyFile(font, path.join(dir, name));
  }
  return name;
}

/** The words over it: the editor's drawings (written into the job's folder), or drawn here in a font of this computer's. */
async function textsFor(p: Prepared, dir: string): Promise<(TextHow | null)[]> {
  const out: (TextHow | null)[] = [];
  for (const [i, t] of (p.recipe.texts ?? []).entries()) {
    const png = p.drawn[i];
    const size = png ? pngSize(png) : null;
    if (png && size) {
      const file = path.join(dir, `drawn${i}.png`);
      await fs.promises.writeFile(file, png);
      out.push({ png: file, ...size });
      continue;
    }
    const font = await fontInto(dir, i, t.text, !!t.bold);
    if (!font) throw new Error('No font was found on this computer to draw the words with');
    out.push({
      font,
      lines: t.text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 12),
    } satisfies DrawHere);
  }
  return out;
}

/** The plan for a prepared edit, on the graphics card's encoder or the processor's. */
async function planFor(p: Prepared, dir: string, output: string, bin: string, hw: Awaited<ReturnType<typeof gpuEncoder>>): Promise<Plan> {
  const fileOf = (src: string | undefined) => (src === undefined ? p.source.file : p.sources.get(src)!.source.file);
  return planVideo({
    recipe: p.recipe,
    factsOf: p.factsOf,
    clipFiles: (p.recipe.clips ?? []).map((c) => ({ file: fileOf(c.src), ...(c.sound ? { sound: fileOf(c.sound) } : {}) })),
    overlayFiles: (p.recipe.overlays ?? []).map((o) => fileOf(o.src)),
    audioFiles: (p.recipe.audio ?? []).map((a) => fileOf(a.src)),
    output,
    format: p.format,
    container: containerOf(p),
    frame: p.frame,
    range: p.range,
    size: p.size,
    exactSize: p.exactSize,
    fps: p.fps,
    codec: p.codec,
    quality: p.quality,
    texts: p.format === 'wav' ? [] : await textsFor(p, dir),
    encoders: await encodersOf(bin),
    ...(hw ? { hw: { api: hw.api, encoder: hw.encoder, ...(hw.device ? { device: hw.device } : {}) } } : {}),
  });
}

async function make(j: Job): Promise<void> {
  if (isEnded(j.view.status)) return;
  const p = j.prep;
  j.view.status = 'running';
  j.view.progress = 0;
  await fs.promises.mkdir(tmpRoot(), { recursive: true, mode: 0o700 });
  const dir = await fs.promises.mkdtemp(path.join(tmpRoot(), 'job-'));
  try {
    const tools = await ffmpegTools();
    if (!tools) throw new Error(NO_FFMPEG);
    const ext = p.format === 'mp4' || p.format === 'mov' ? (containerOf(p) === 'mov' ? 'mov' : 'mp4') : p.format;
    const output = path.join(dir, `out.${ext}`);
    // The graphics card for MP4 and MOV, when there is one that works and it is not turned off.
    const video = p.format === 'mp4' || p.format === 'mov';
    const hw = video && !p.cpu ? await gpuEncoder(p.d.db, tools.ffmpeg, p.codec ?? 'h264') : null;
    let plan = await planFor(p, dir, output, tools.ffmpeg, hw);
    checkPlan(plan);
    for (const [name, text] of Object.entries(plan.files)) await fs.promises.writeFile(path.join(dir, name), text);
    if (j.stopping) throw new Error('stopped');
    j.view.made = hw ? { gpu: true, by: `${hw.name.startsWith('NVIDIA') ? 'NVIDIA' : hw.name.split(' ')[0]} ${HW_NAMES[hw.api]}` } : { gpu: false, by: 'processor' };
    try {
      await runFfmpeg(tools.ffmpeg, plan, dir, j, !!hw);
    } catch (e) {
      if (!hw || j.stopping || j.late) throw e;
      // The card failed: not used again until the app starts again, and this one made on the processor at once.
      markBroken(hw.encoder);
      j.view.made = { gpu: false, by: 'processor' };
      j.view.note = `The graphics card (${HW_NAMES[hw.api]}) could not make it, so the processor did`;
      j.view.progress = 0;
      await fs.promises.rm(output, { force: true });
      plan = await planFor(p, dir, output, tools.ffmpeg, null);
      checkPlan(plan);
      await runFfmpeg(tools.ffmpeg, plan, dir, j, false);
    }
    const st = await fs.promises.stat(output).catch(() => null);
    if (!st?.size) throw new Error('ffmpeg made nothing');
    Object.assign(j.view, { w: plan.w, h: plan.h, bytes: st.size, ...(plan.seconds ? { seconds: Math.round(plan.seconds * 10) / 10 } : {}) });
    await deliver(j, output, ext, dir);
    finish(j, 'done');
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    finish(j, j.stopping || msg === 'stopped' ? 'stopped' : 'failed', j.stopping || msg === 'stopped' ? undefined : msg);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** The kind of file a video is written as: a .mov written over stays a .mov, a .webm a WebM, the rest MP4 (or MOV, asked). */
function containerOf(p: Prepared): 'mp4' | 'mov' | 'webm' {
  if (p.format === 'webm') return 'webm';
  if (p.format === 'mov') return 'mov';
  const over = 'file' in p.to && p.to.as === 'replace' ? p.to.file : 'media' in p.to && p.to.as === 'replace' ? getMedia(p.d.db, p.to.media)?.file : undefined;
  return over && /\.mov$/i.test(over) ? 'mov' : 'mp4';
}

const MIME: Record<string, string> = { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', gif: 'image/gif', jpg: 'image/jpeg', png: 'image/png' };

/** A name for what is made of `source` ("boat (edited).mp4", "boat (at 3.2 s).jpg"), as the picture editor names its copies. */
function madeName(p: Prepared, ext: string): string {
  const stem =
    (p.source.name || 'video')
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
      .trim()
      .slice(0, 80) || 'video';
  return p.frame !== undefined ? `${stem} (at ${Math.round(p.frame * 10) / 10} s).${ext}` : `${stem} (edited).${ext}`;
}

/** Puts what was made where it was asked to go, and says so in the job's view. */
async function deliver(j: Job, out: string, ext: string, dir: string): Promise<void> {
  const p = j.prep;
  const to = p.to;
  const db = p.d.db;
  if ('video' in to) {
    const kept = await keepVideoFile(db, out, dir).catch((e: Error) => {
      throw new Error(`It was made but could not be kept: ${e.message}`);
    });
    j.view.src = kept.src;
    // The slide's still: the moment picked, else its first frame (or the end of its fade in from black).
    let frame = kept.frame;
    const seconds = j.view.seconds ?? 1;
    const when = p.still !== undefined ? p.still - (p.range?.[0] ?? 0) : p.recipe.fadeIn ? p.recipe.fadeIn + 0.05 : 0;
    if (when > 0) {
      const at = path.join(dir, 'still.jpg');
      if (await still(out, at, { at: Math.min(when, Math.max(0, seconds - 0.05)), width: 1280 })) frame = await fs.promises.readFile(at);
    }
    try {
      if (frame) j.view.poster = ASSET + putAsset(db, frame);
    } catch {}
    if (kept.w && kept.h) Object.assign(j.view, { w: kept.w, h: kept.h });
    return;
  }
  if ('asset' in to) {
    const data = await fs.promises.readFile(out);
    if (data.length > MAX_ASSET) throw new Error(`It came out over ${MAX_ASSET / 1024 / 1024} MB, too large for a picture: make it shorter or smaller`);
    j.view.src = ASSET + putAsset(db, data);
    return;
  }
  if ('into' in to) {
    await fs.promises.mkdir(to.into, { recursive: true });
    const at = await claimName(to.into, `${slug(to.name, p.frame !== undefined ? 'frame' : 'video')}.${ext}`);
    await moveWhole(out, at);
    j.view.path = at;
    return;
  }
  if ('file' in to) {
    const original = pathOf(to.file);
    if (to.as === 'replace') {
      // Beside it first (the same disk), then in its place: the old one goes to the Trash, so it can be had back.
      const tmp = path.join(path.dirname(original), `.${path.basename(original)}.${crypto.randomBytes(4).toString('hex')}.tmp`);
      await moveWhole(out, tmp);
      try {
        await deletePath(original).catch(async (e: Error) => {
          if (!(e instanceof HttpError) || e.status !== 409) throw e;
          await trashCopy(original);
        });
        await fs.promises.rename(tmp, original);
      } catch (e) {
        await fs.promises.rm(tmp, { force: true }).catch(() => {});
        throw e;
      }
      j.view.path = original;
      return;
    }
    const at = await claimName(path.dirname(original), madeName(p, ext));
    await moveWhole(out, at);
    j.view.path = at;
    return;
  }
  if ('media' in to && to.as === 'replace') {
    const item = await replaceMediaFile(p.d, mustMedia(db, to.media), out, ext);
    j.view.media = item.id;
    return;
  }
  // A new item in the Library (a copy of an item goes in its project and folder).
  const from = 'media' in to ? mustMedia(db, to.media) : p.source.media;
  const named = path.join(dir, madeName(p, ext));
  await fs.promises.rename(out, named);
  const session = from?.sessionKey ?? ('library' in to ? to.session : undefined);
  const { item } = await keepFile(p.d, { path: named, ...(from?.space ? { space: from.space } : {}), ...(session ? { sessionKey: session } : {}) }, { move: true, source: `${from?.source ?? p.source.path ?? p.source.kept ?? named} (edited)` });
  if (from?.folder && from.space === item.space && !item.folder) {
    try {
      putInFolder(db, 'media', item.id, from.folder);
      p.d.broadcast({ t: 'feature', id: 'media', data: { what: 'media', item: getMedia(db, item.id)! } });
    } catch {}
  }
  j.view.media = item.id;
}

/**
 * A Library item's file swapped for an edited one: its size, length and hash with it, its still and frames made again,
 * its title and description kept (Write them again makes new ones). The pages hear of it.
 */
export async function replaceMediaFile(d: Deps, m: MediaItem, from: string, ext: string): Promise<MediaItem> {
  initMedia(d.db);
  const mime = MIME[ext] ?? 'application/octet-stream';
  const kind = mime.startsWith('video/') ? 'video' : 'image';
  if (kind !== m.kind) throw new Error(m.kind === 'video' ? 'A Library video is replaced by a video: save a frame or a GIF as a new item' : 'That Library item is not a video');
  const name = `${m.id}.${ext}`;
  const to = path.join(MEDIA_DIR, name);
  const tmp = path.join(MEDIA_DIR, `.${m.id}.${crypto.randomBytes(4).toString('hex')}.tmp`);
  await moveWhole(from, tmp);
  await fs.promises.rename(tmp, to);
  if (path.resolve(m.file) !== path.resolve(to)) await fs.promises.rm(m.file, { force: true }).catch(() => {});
  const st = await fs.promises.stat(to);
  const facts = await factsOf(to).catch(() => null);
  d.db
    .prepare('update media set file = ?, mime = ?, bytes = ?, width = ?, height = ?, duration = ?, sha = ?, updated_at = ? where id = ?')
    .run(name, mime, st.size, facts?.width ?? null, facts?.height ?? null, facts?.duration ?? null, await fileHash(to), Date.now(), m.id);
  const item = getMedia(d.db, m.id)!;
  const f = filesOf(item);
  await fs.promises.rm(f.still, { force: true }).catch(() => {});
  await fs.promises.rm(f.frames, { force: true }).catch(() => {});
  await still(f.file, f.still, { at: item.duration ? Math.min(item.duration * 0.1, 2) : undefined, width: 720 });
  void frameGrid(f.file, f.frames, { duration: item.duration, width: item.width, height: item.height });
  d.broadcast({ t: 'feature', id: 'media', data: { what: 'media', item } });
  return item;
}

// ---- checking what is asked -------------------------------------------------------------------------------------

const FORMATS: VideoOut[] = ['mp4', 'mov', 'webm', 'gif', 'jpg', 'png'];
const PNG_DATA = /^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/;

/** Where the result may go, as the route takes it. */
function saveToOf(v: unknown): VideoSaveTo {
  const t = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const as = t.as === 'replace' || t.as === 'copy' ? t.as : null;
  if (t.video === true) return { video: true };
  if (t.asset === true) return { asset: true };
  if (t.library === true) return { library: true, ...(typeof t.session === 'string' && /^[\w:.-]{1,200}$/.test(t.session) ? { session: t.session } : {}) };
  if (typeof t.media === 'string' && /^[a-f0-9]{10}$/.test(t.media) && as) return { media: t.media, as };
  if (typeof t.file === 'string' && t.file.trim() && as) return { file: t.file.trim(), as };
  throw new HttpError(400, 'to: where it goes ({ video: true }, { asset: true }, { library: true }, { media: id, as: "replace" | "copy" } or { file: path, as: "replace" | "copy" })');
}

/** Every src an edit names, with the kinds each may be: clips (videos, pictures), overlays (the same), sounds (sounds, or a video's sound). */
function sourcesNamed(raw: unknown): Map<string, Set<'clip' | 'sound'>> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const out = new Map<string, Set<'clip' | 'sound'>>();
  const add = (s: unknown, as: 'clip' | 'sound') => {
    if (typeof s !== 'string' || !s.trim()) return;
    const k = s.trim().slice(0, 4096);
    if (!out.has(k)) out.set(k, new Set());
    out.get(k)!.add(as);
  };
  for (const c of Array.isArray(r.clips) ? r.clips : []) {
    add(c?.src, 'clip');
    add(c?.sound, 'sound');
  }
  for (const o of Array.isArray(r.overlays) ? r.overlays : []) add(o?.src, 'clip');
  for (const a of Array.isArray(r.audio) ? r.audio : []) add(a?.src, 'sound');
  if (r.music && typeof r.music === 'object') add(r.music.src, 'sound');
  return out;
}

/** The sources an edit names, each read once: their files and facts. */
async function readSources(db: DB, raw: unknown, o: { cwd?: string }): Promise<Map<string, { source: Source; facts: VideoSize }>> {
  const out = new Map<string, { source: Source; facts: VideoSize }>();
  const named = sourcesNamed(raw);
  if (named.size > MAX_INPUTS) throw new HttpError(400, `This edit uses ${named.size} files: at most ${MAX_INPUTS}`);
  for (const [src, as] of named) {
    const kinds: SourceKind[] = as.has('clip') ? ['video', 'picture'] : ['sound', 'video'];
    const source = await sourceOf(db, src, { ...o, kinds });
    out.set(src, { source, facts: await sizeOf(source) });
  }
  return out;
}

/**
 * An ask (the route's, or edit_video's) checked against its sources: each read, the recipe made to fit them, the format
 * and where it goes agreeing, the editor's drawings read. Throws, in words a person can act on.
 */
export async function prepare(d: Deps, b: Partial<VideoEditAsk> & { to?: unknown }, o: { cwd?: string; to?: SaveTo; forCaptions?: boolean } = {}): Promise<Prepared> {
  if (!(await ffmpegTools())) throw new HttpError(400, NO_FFMPEG);
  const source = await sourceOf(d.db, b.src, { ...o, kinds: o.cwd !== undefined ? ['video', 'picture'] : ['video'] });
  const facts = await sizeOf(source);
  const sources = await readSources(d.db, b.recipe, o);
  const factsOf_: VideoFactsOf = (src) => (src === undefined ? facts : sources.get(src)?.facts);
  let recipe: VideoRecipe;
  try {
    recipe = normalizeVideoRecipe(b.recipe ?? {}, factsOf_);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  const length = clipSpans(recipe.clips ?? [], factsOf_).length;
  const to: SaveTo = o.forCaptions ? { library: true } : (o.to ?? saveToOf(b.to));
  let format: VideoOut = o.forCaptions ? 'wav' : FORMATS.includes(b.format as VideoOut) ? (b.format as VideoOut) : b.frame !== undefined ? 'jpg' : 'mp4';
  const picture = format === 'jpg' || format === 'png';
  const frame = b.frame === undefined || b.frame === null ? undefined : Number(b.frame);
  if (picture && (frame === undefined || !Number.isFinite(frame) || frame < 0 || frame > length + 0.001)) throw new HttpError(400, `frame: the moment to take, in seconds of the edited video (0 to ${Math.floor(length * 10) / 10})`);
  if ('file' in to && appsOwn(pathOf(to.file))) throw new HttpError(403, 'That file is part of the app’s own data: it is not written from here.');
  // Written over a video, it stays the kind it was.
  const over = 'file' in to && to.as === 'replace' ? to.file : 'media' in to && to.as === 'replace' ? mustMedia(d.db, to.media).file : null;
  if (over && (picture || format === 'gif')) throw new HttpError(400, `A ${picture ? 'picture of a frame' : 'GIF'} is saved as a copy, not over the video`);
  if (over) format = /\.webm$/i.test(over) ? 'webm' : /\.mov$/i.test(over) ? 'mov' : 'mp4';
  if ('video' in to && (picture || format === 'gif')) throw new HttpError(400, 'A frame or a GIF is kept as a picture: to: { asset: true }');
  if ('video' in to && format === 'mov') format = 'mp4';
  if ('asset' in to && !(picture || format === 'gif')) throw new HttpError(400, 'A video is kept as a deck’s video: to: { video: true }');
  if ('media' in to && to.as === 'replace' && mustMedia(d.db, to.media).kind !== 'video') throw new HttpError(400, 'That Library item is not a video');
  const pair = Array.isArray(b.range) && b.range.length === 2 ? [Number(b.range[0]), Number(b.range[1])] : null;
  if (pair && pair.every(Number.isFinite) && Math.min(length, pair[1]) - Math.max(0, pair[0]) < 0.05) throw new HttpError(400, 'The part between In and Out is too short: mark a longer part');
  const range: [number, number] | undefined = pair && pair.every(Number.isFinite) && (pair[0] > 0.001 || pair[1] < length - 0.001) ? [Math.max(0, pair[0]), Math.min(length, pair[1])] : undefined;
  const seconds = picture ? 0 : range ? range[1] - range[0] : length;
  if (!picture && seconds > MAX_SECONDS) throw new HttpError(400, `The edited video would be over ${MAX_SECONDS / 60} minutes: cut it shorter`);
  if (format === 'gif' && seconds > MAX_GIF_SECONDS) throw new HttpError(400, `A GIF can be at most ${MAX_GIF_SECONDS} seconds: cut it shorter, or save it as a video`);
  const drawn = (recipe.texts ?? []).map((_, i) => {
    const raw = Array.isArray(b.drawn) ? b.drawn[i] : undefined;
    const m = typeof raw === 'string' ? PNG_DATA.exec(raw) : null;
    if (!m) return null;
    const data = Buffer.from(m[1], 'base64');
    const size = pngSize(data);
    if (!size || data.length > 6 * 1024 * 1024 || size.w > 8192 || size.h > 8192) throw new HttpError(400, `The drawing of text ${i + 1} is not a PNG this editor takes`);
    return data;
  });
  const size = Number(b.size);
  const fps = Number(b.fps);
  const stillAt = Number(b.still);
  const codec = b.codec === 'h265' || b.codec === 'av1' ? b.codec : undefined;
  const quality = b.quality === 'small' || b.quality === 'high' ? b.quality : undefined;
  return {
    d,
    source,
    facts,
    sources,
    factsOf: factsOf_,
    recipe,
    format,
    ...(frame !== undefined && picture ? { frame } : {}),
    ...(range && !picture ? { range } : {}),
    ...(Number.isFinite(size) && size >= 120 ? { size: Math.round(Math.min(4320, size)), ...(b.exactSize === true ? { exactSize: true } : {}) } : {}),
    ...(Number.isFinite(fps) && fps >= 1 ? { fps: Math.min(60, fps) } : {}),
    ...(codec ? { codec } : {}),
    ...(quality ? { quality } : {}),
    ...(b.encoder === 'cpu' ? { cpu: true } : {}),
    ...(b.still !== undefined && b.still !== null && Number.isFinite(stillAt) && 'video' in to ? { still: Math.min(length, Math.max(0, stillAt)) } : {}),
    to,
    drawn,
    length,
    seconds,
  };
}

// ---- captions: what is said, with its times ----------------------------------------------------------------------------

/** The voices of an edit (its clips' sound and its voice-over) as 16 kHz WAV, then turned into words with their times. */
export async function captionsOf(prep: Prepared, lang: string, signal?: AbortSignal): Promise<{ from: number; to: number; text: string }[]> {
  const voice = voiceService();
  if (!voice) throw new HttpError(503, 'The app is still starting');
  const tools = await ffmpegTools();
  if (!tools) throw new HttpError(400, NO_FFMPEG);
  await fs.promises.mkdir(tmpRoot(), { recursive: true, mode: 0o700 });
  const dir = await fs.promises.mkdtemp(path.join(tmpRoot(), 'words-'));
  try {
    const out = path.join(dir, 'voices.wav');
    const plan = await planFor({ ...prep, format: 'wav', range: undefined }, dir, out, tools.ffmpeg, null);
    checkPlan(plan);
    const j = { view: { job: 'captions', status: 'running', format: 'wav', startedAt: Date.now() }, prep, ended: Promise.resolve(), end: () => {} } as Job;
    signal?.addEventListener('abort', () => j.proc?.kill('SIGKILL'), { once: true });
    await runFfmpeg(tools.ffmpeg, plan, dir, j, false);
    const said = await voice.transcribeTimed(out, lang);
    return said.map((s) => ({ from: Math.max(0, Math.min(prep.length, s.from)), to: Math.max(0, Math.min(prep.length, s.to)), text: s.text })).filter((s) => s.to - s.from >= 0.1);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// ---- the timeline's frames and sound shapes --------------------------------------------------------------------------

/** `n` frames of a video (from and to: seconds of it) side by side, each `h` pixels tall (a JPEG, kept for next time): its path, or null without ffmpeg. */
export async function frameStrip(file: string, n: number, h: number, range?: [number, number]): Promise<string | null> {
  const tools = await ffmpegTools();
  if (!tools) return null;
  const st = await fs.promises.stat(file);
  const facts = await factsOf(file);
  const a = Math.max(0, Math.min(facts.duration, range?.[0] ?? 0));
  const b = Math.max(a, Math.min(facts.duration, range?.[1] ?? facts.duration));
  const key = crypto.createHash('sha256').update(`${file}\0${st.size}\0${st.mtimeMs}\0${n}\0${h}\0${a.toFixed(2)}\0${b.toFixed(2)}`).digest('hex').slice(0, 32);
  const out = path.join(stripDir(), `${key}.jpg`);
  if (fs.existsSync(out)) return out;
  await fs.promises.mkdir(stripDir(), { recursive: true, mode: 0o700 });
  // Each frame read on its own (a seek, not the whole video), in the middle of its share of the part.
  const len = Math.max(0.05, b - a);
  const at = Array.from({ length: n }, (_, i) => Math.min(facts.duration - 0.05, a + ((i + 0.5) * len) / n));
  const args = ['-hide_banner', '-nostdin', '-y', '-v', 'error'];
  for (const t of at) args.push('-protocol_whitelist', 'file', '-ss', Math.max(0, t).toFixed(3), '-i', `file:${file}`);
  const scaled = at.map((_, i) => `[${i}:V]scale=-2:${h},setsar=1[f${i}]`).join(';');
  const graph = n > 1 ? `${scaled};${at.map((_, i) => `[f${i}]`).join('')}hstack=inputs=${n}[out]` : `[0:V]scale=-2:${h},setsar=1[out]`;
  const tmp = `${out}.${process.pid}.tmp.jpg`;
  await new Promise<void>((resolve, reject) =>
    execFile(tools.ffmpeg, [...args, '-filter_complex', graph, '-map', '[out]', '-frames:v', '1', '-q:v', '5', '-update', '1', '-f', 'image2', `file:${tmp}`], { timeout: 120_000, maxBuffer: 8 << 20, env: { ...agentBaseEnv(), CUDA_VISIBLE_DEVICES: '' } }, (err, _o, stderr) =>
      err ? reject(new Error(ffmpegWords(String(stderr)))) : resolve(),
    ),
  );
  await fs.promises.rename(tmp, out);
  // The newest two hundred are kept.
  const all = fs.readdirSync(stripDir()).map((f) => ({ f, t: fs.statSync(path.join(stripDir(), f)).mtimeMs }));
  for (const x of all.sort((x, y) => y.t - x.t).slice(200)) fs.rmSync(path.join(stripDir(), x.f), { force: true });
  return out;
}

const peaksKept = new Map<string, number[] | null>();

/** How loud a file's sound is along its length, `n` levels (0 to 1), kept in memory once read. */
async function peaksOf(file: string, n: number): Promise<number[] | null> {
  const st = await fs.promises.stat(file);
  const key = `${file}\0${st.size}\0${st.mtimeMs}\0${n}`;
  if (peaksKept.has(key)) return peaksKept.get(key)!;
  const p = await waveform(file, n);
  peaksKept.set(key, p);
  if (peaksKept.size > 300) peaksKept.delete(peaksKept.keys().next().value!);
  return p;
}

/** A sound sent from this device or recorded with the microphone, kept for the editor: its source and length. */
async function keepSound(body: Readable): Promise<{ src: string; duration: number }> {
  const dir = soundDir();
  await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 });
  const tmp = path.join(dir, `.in-${crypto.randomBytes(6).toString('hex')}`);
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  const MAX = 200 * 1024 * 1024;
  try {
    const w = fs.createWriteStream(tmp);
    for await (const c of body) {
      bytes += (c as Buffer).length;
      if (bytes > MAX) throw new HttpError(413, 'That sound is over 200 MB');
      hash.update(c as Buffer);
      if (!w.write(c)) await new Promise<void>((r) => w.once('drain', () => r()));
    }
    await new Promise<void>((r, f) => w.end((e?: Error | null) => (e ? f(e) : r())));
    if (bytes < 64) throw new HttpError(400, 'That sound is empty');
    const i = await ffmpegInfo(tmp);
    if (!i?.audio || !i.duration) throw new HttpError(422, 'That is not a sound ffmpeg can read');
    const head = await headOf(tmp);
    const ext = head.toString('latin1', 0, 4) === 'RIFF' ? 'wav' : head.toString('latin1', 0, 4) === 'fLaC' ? 'flac' : head.toString('latin1', 0, 4) === 'OggS' ? 'ogg' : head[0] === 0x1a && head[1] === 0x45 ? 'webm' : head.toString('latin1', 4, 8) === 'ftyp' ? 'm4a' : 'mp3';
    const sha = hash.digest('hex').slice(0, 40);
    for (const n of fs.readdirSync(dir)) if (n.startsWith(`${sha}.`)) fs.rmSync(path.join(dir, n), { force: true });
    await fs.promises.rename(tmp, path.join(dir, `${sha}.${ext}`));
    return { src: `naget-sound:${sha}`, duration: i.duration };
  } finally {
    await fs.promises.rm(tmp, { force: true }).catch(() => {});
  }
}

const SOUND_MIME: Record<string, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', ogg: 'audio/ogg', webm: 'audio/webm', m4a: 'audio/mp4' };

// ---- routes ---------------------------------------------------------------------------------------------------------

const JOB = /^[a-f0-9]{16}$/;
const ANY: SourceKind[] = ['video', 'picture', 'sound'];

export function videoEditRoutes(d: Deps) {
  const { app, db } = d;
  app.get('/api/mediaedit/video/info', async (req): Promise<VideoFacts> => {
    const src = (req.query as Record<string, string>).src;
    if (!(await ffmpegTools())) return { ffmpeg: false, why: NO_FFMPEG };
    const s = await sourceOf(db, src, { kinds: ANY });
    const f = await sizeOf(s);
    return { ffmpeg: true, ...(s.kind === 'picture' ? { picture: true } : s.kind === 'sound' ? { sound: true } : {}), duration: f.duration, width: f.width, height: f.height, audio: !!f.audio, ...(f.fps ? { fps: f.fps } : {}) };
  });
  app.get('/api/mediaedit/video/strip', async (req, reply) => {
    const q = req.query as Record<string, string>;
    const s = await sourceOf(db, q.src);
    const n = Math.max(1, Math.min(40, Math.round(Number(q.n) || 12)));
    const h = Math.max(24, Math.min(160, Math.round(Number(q.h) || 64) & ~1));
    const from = Number(q.from);
    const to = Number(q.to);
    const file = await frameStrip(s.file, n, h, Number.isFinite(from) && Number.isFinite(to) && to > from ? [from, to] : undefined);
    if (!file) throw new HttpError(400, NO_FFMPEG);
    reply.header('Content-Type', 'image/jpeg').header('Cache-Control', 'private, max-age=3600');
    return reply.send(fs.createReadStream(file));
  });
  app.get('/api/mediaedit/video/peaks', async (req) => {
    const q = req.query as Record<string, string>;
    const s = await sourceOf(db, q.src, { kinds: ['video', 'sound'] });
    const n = Math.max(16, Math.min(4000, Math.round(Number(q.n) || 400)));
    return { peaks: await peaksOf(s.file, n) };
  });
  app.get('/api/mediaedit/video/encoders', async () => {
    const tools = await ffmpegTools();
    const e = tools ? await encodersOf(tools.ffmpeg) : {};
    return { ffmpeg: !!tools, h264: !!e.h264, h265: !!e.h265, av1: !!e.av1, webm: !!(e.vp9 ?? e.vp8), gpu: gpuState(db) };
  });
  app.post('/api/mediaedit/video/sound', async (req) => {
    const body = req.body as Readable | undefined;
    if (!body || typeof body.pipe !== 'function') throw new HttpError(400, 'Send the sound’s bytes (application/octet-stream)');
    if (!(await ffmpegTools())) throw new HttpError(400, NO_FFMPEG);
    return keepSound(body);
  });
  app.get('/api/mediaedit/video/sound/:sha', async (req, reply) => {
    const sha = String((req.params as { sha?: string }).sha ?? '');
    const s = /^[a-f0-9]{16,64}$/.test(sha) ? await sourceOf(db, `naget-sound:${sha}`, { kinds: ['sound'] }).catch(() => null) : null;
    return sendVideo(req, reply, s ? { file: s.file, mime: SOUND_MIME[path.extname(s.file).slice(1)] ?? 'application/octet-stream' } : null);
  });
  app.post('/api/mediaedit/video/captions', async (req) => {
    const b = (req.body ?? {}) as Partial<VideoEditAsk> & { lang?: unknown };
    const prep = await prepare(d, b, { forCaptions: true });
    const ac = new AbortController();
    req.raw.on('close', () => req.raw.destroyed && ac.abort());
    const captions = await captionsOf(prep, typeof b.lang === 'string' ? b.lang : '', ac.signal);
    return { captions, srt: captionsSrt(captions) };
  });
  app.post('/api/mediaedit/video', async (req) => startVideoEdit(await prepare(d, (req.body ?? {}) as Partial<VideoEditAsk>)));
  app.get('/api/mediaedit/video/:job', async (req) => {
    const id = String((req.params as { job?: string }).job ?? '');
    if (!JOB.test(id)) throw new HttpError(400, 'job: the id POST /api/mediaedit/video gave');
    const v = videoJob(id);
    if (!v) throw new HttpError(404, 'No such edit: it ended over an hour ago, or the app started again since');
    return v;
  });
  app.delete('/api/mediaedit/video/:job', async (req) => {
    const id = String((req.params as { job?: string }).job ?? '');
    const v = JOB.test(id) ? stopVideoEdit(id) : null;
    if (!v) throw new HttpError(404, 'No such edit');
    return v;
  });
  gpuRoutes(d);
}

/** Job folders left by a run that ended with the app (it stopped mid-edit), a day on; sounds and pictures the editor kept, a week on. */
function sweepJobs() {
  const sweep = (dir: string, age: number) => {
    try {
      const old = Date.now() - age;
      for (const n of fs.readdirSync(dir)) {
        const p = path.join(dir, n);
        if (fs.statSync(p).mtimeMs < old) fs.rmSync(p, { recursive: true, force: true });
      }
    } catch {}
  };
  sweep(tmpRoot(), 86_400_000);
  sweep(soundDir(), 7 * 86_400_000);
  sweep(pictureDir(), 7 * 86_400_000);
}

/** Agents get edit_video while Settings → Images, video and audio has videos on. */
function videosOn(db: DB): boolean {
  try {
    return JSON.parse(kvGet(db, 'videos') ?? '{}').enabled !== false;
  } catch {
    return true;
  }
}

/** The output's size for an edit, as the editor and edit_video say it. */
export const outputOf = (p: Prepared) => outputSize(p.recipe, p.factsOf, { size: p.size, exact: p.exactSize });

export const videoEdit: Feature = {
  id: 'mediaedit-video',
  routes(d) {
    videoEditRoutes(d);
  },
  tools: ({ deps }) => (videosOn(deps.db) ? [editVideoTool()] : []),
  start() {
    sweepJobs();
  },
};
