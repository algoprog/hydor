// The video editor's work on the server: an edit (shared/mediaedit-video.ts) made with ffmpeg as one command
// (video-plan.ts), as a job: in line (two are made at once, the rest wait their turn), made with its progress, stopped
// when asked, then put where it was asked to go: kept as a deck's video (its first frame a kept picture, for the
// slide's still), as a deck's picture (a frame, a GIF), as a Library item's file or a new item, over a file (the old
// one to the Trash) or as a copy beside it. A job is kept in memory for an hour after it ends. Without ffmpeg on this
// computer, the picture tools' portable one does it (server/media/frames.ts); without either, the routes say how to get one.
//
// Routes, signed in (agents have edit_video instead, video-tool.ts):
//   GET    /api/mediaedit/video/info?src=          VideoFacts: its length, size and sound, and whether ffmpeg is here
//   GET    /api/mediaedit/video/strip?src=&n=&h=   n of its frames side by side, h pixels tall (a JPEG), for the timeline
//   POST   /api/mediaedit/video                    VideoEditAsk → VideoEditJob
//   GET    /api/mediaedit/video/:job               VideoEditJob
//   DELETE /api/mediaedit/video/:job               stops it → VideoEditJob
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { MediaItem } from '../../shared/media.ts';
import { editedLength, keptParts, normalizeVideoRecipe, toEdited, MAX_GIF_SECONDS, type VideoEditAsk, type VideoEditJob, type VideoFacts, type VideoOut, type VideoRecipe, type VideoSaveTo } from '../../shared/mediaedit-video.ts';
import { ASSET, VIDEO } from '../../shared/slides.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import { kvGet, type DB } from '../db.ts';
import { agentBaseEnv } from '../env.ts';
import type { Deps, Feature } from '../features/types.ts';
import { claimName, fileHash, moveWhole } from '../filemove.ts';
import { deletePath, resolvePath, trashCopy } from '../files.ts';
import { slug } from '../images/openrouter.ts';
import { ffmpegInfo, ffmpegTools, frameGrid, NO_FFMPEG, still } from '../media/frames.ts';
import { keepFile } from '../media/index.ts';
import { filesOf, getMedia, initMedia, MEDIA_DIR, mustMedia } from '../media/store.ts';
import { putInFolder } from '../pages/folders.ts';
import { MAX_ASSET, putAsset } from '../pages/assets.ts';
import { getVideo, keepVideoFile, videoType } from '../pages/videos.ts';
import { fontFor } from './video-fonts.ts';
import { checkPlan, planVideo, type DrawHere, type Plan } from './video-plan.ts';
import { editVideoTool } from './video-tool.ts';

/** How many are made at once, how many may wait, how long one may take, and how long one is kept after it ends. */
const AT_ONCE = 2;
const WAITING = 8;
const LIMIT_MS = 30 * 60_000;
const KEEP_MS = 3600_000;
/** The longest edited video made, in seconds. */
const MAX_SECONDS = 30 * 60;

const tmpRoot = () => path.join(config.dataDir, 'mediaedit', 'tmp');
const stripDir = () => path.join(config.dataDir, 'mediaedit', 'strips');

const VIDEO_EXT: Record<string, true> = { mp4: true, m4v: true, mov: true, webm: true };
const SOUND_EXT: Record<string, true> = { mp3: true, wav: true, m4a: true, aac: true, ogg: true, oga: true, opus: true, flac: true };

// ---- what is edited, and the music under it --------------------------------------------------------------------

/** A video to edit: its file, and what it is in the app (a deck's kept video, a Library item, a file). */
export interface Source {
  file: string;
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

/** The video `src` names: a deck's kept video, a Library item, or a file (an MP4, MOV or WebM); throws what is wrong. */
export async function sourceOf(db: DB, src: unknown, o: { cwd?: string } = {}): Promise<Source> {
  const s = typeof src === 'string' ? src.trim() : '';
  if (!s) throw new HttpError(400, 'src: the video to edit');
  const kept = KEPT_VIDEO.exec(s);
  if (kept) {
    const v = getVideo(db, kept[1]);
    if (!v) throw new HttpError(404, 'That video is no longer kept by the app');
    return { file: v.file, kept: VIDEO + kept[1], name: 'video' };
  }
  const media = MEDIA_ID.exec(s);
  if (media) {
    const m = mustMedia(db, media[1]);
    if (m.kind !== 'video') throw new HttpError(400, 'That Library item is not a video');
    return { file: m.file, media: m, name: m.title };
  }
  const file = pathOf(s, o.cwd);
  const st = await fs.promises.stat(file).catch(() => null);
  if (!st?.isFile()) throw new HttpError(404, `No such video: ${file}`);
  if (!VIDEO_EXT[path.extname(file).slice(1).toLowerCase()] || !videoType(await headOf(file))) throw new HttpError(400, `${path.basename(file)} is not a video this editor takes: an MP4, MOV or WebM file`);
  return { file, path: file, name: path.basename(file).replace(/\.[^.]+$/, '') };
}

/** The music `src` names: a sound of the Library's, or a sound file. */
export async function musicOf(db: DB, src: string, o: { cwd?: string } = {}): Promise<string> {
  const media = MEDIA_ID.exec(src.trim());
  if (media) {
    const m = mustMedia(db, media[1]);
    if (m.kind !== 'audio') throw new HttpError(400, 'The music is not a sound of the Library’s');
    return m.file;
  }
  const file = pathOf(src, o.cwd);
  const st = await fs.promises.stat(file).catch(() => null);
  if (!st?.isFile()) throw new HttpError(404, `No such sound: ${file}`);
  if (!SOUND_EXT[path.extname(file).slice(1).toLowerCase()]) throw new HttpError(400, `${path.basename(file)} is not a sound (MP3, WAV, M4A, AAC, OGG, OPUS or FLAC)`);
  return file;
}

/** What ffmpeg says of a video, as the editor needs it: its length, its size as it shows, its sound and frames a second. */
export async function factsOf(file: string): Promise<Required<Pick<VideoFacts, 'duration' | 'width' | 'height' | 'audio'>> & { fps?: number }> {
  const i = await ffmpegInfo(file);
  if (!i?.video || !i.width || !i.height) throw new HttpError(422, 'ffmpeg could not read that video');
  if (!i.duration) throw new HttpError(422, 'The video’s length could not be read');
  const side = i.rotation === 90 || i.rotation === 270;
  return { duration: i.duration, width: side ? i.height : i.width, height: side ? i.width : i.height, audio: i.audio, ...(i.fps ? { fps: i.fps } : {}) };
}

// ---- ffmpeg's encoders, and fonts for words drawn here ----------------------------------------------------------

const encoders = new Map<string, Promise<{ h264?: string; vp9?: string; vp8?: string; opus?: boolean }>>();

/** The encoders an ffmpeg has, asked once: H.264 (x264 first), VP9, VP8, Opus. */
function encodersOf(bin: string) {
  let e = encoders.get(bin);
  if (!e) {
    e = new Promise((resolve) => {
      execFile(bin, ['-hide_banner', '-encoders'], { timeout: 20_000, maxBuffer: 8 << 20, env: agentBaseEnv() }, (_err, stdout) => {
        const have = new Set(
          String(stdout ?? '')
            .split('\n')
            .map((l) => /^\s*V[^\s]*\s+(\S+)|^\s*A[^\s]*\s+(\S+)/.exec(l))
            .filter((m) => !!m)
            .map((m) => (m![1] ?? m![2]) as string),
        );
        resolve({
          h264: ['libx264', 'libopenh264', 'h264_videotoolbox', 'h264_mf'].find((x) => have.has(x)),
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

/** Where an edit goes: as the route asks (VideoSaveTo), or (an agent's) into a folder of its session under a name. */
export type SaveTo = VideoSaveTo | { into: string; name: string };

/** An edit checked and ready to make. */
export interface Prepared {
  d: Deps;
  source: Source;
  facts: { duration: number; width: number; height: number; audio: boolean; fps?: number };
  recipe: VideoRecipe;
  format: VideoOut;
  frame?: number;
  size?: number;
  /** A deck's video: the moment its still is taken at (seconds of the original). */
  still?: number;
  to: SaveTo;
  music?: string;
  /** The editor's drawings of the texts (PNG), by the recipe's order; null where it drew none. */
  drawn: (Buffer | null)[];
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

function runFfmpeg(bin: string, plan: Plan, cwd: string, j: Job): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, plan.args, { cwd, env: { ...agentBaseEnv(), CUDA_VISIBLE_DEVICES: '' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
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
    // The words over it: the editor's drawings, or drawn here in a font of this computer's.
    const texts: ({ png: string; w: number; h: number } | DrawHere | null)[] = [];
    for (const [i, t] of (p.recipe.texts ?? []).entries()) {
      const png = p.drawn[i];
      const size = png ? pngSize(png) : null;
      if (png && size) {
        const file = path.join(dir, `drawn${i}.png`);
        await fs.promises.writeFile(file, png);
        texts.push({ png: file, ...size });
        continue;
      }
      const font = await fontInto(dir, i, t.text, !!t.bold);
      if (!font) throw new Error('No font was found on this computer to draw the words with');
      texts.push({
        font,
        lines: t.text
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .slice(0, 12),
      });
    }
    const ext = p.format === 'webm' ? 'webm' : p.format === 'gif' ? 'gif' : p.format === 'jpg' ? 'jpg' : p.format === 'png' ? 'png' : containerOf(p) === 'mov' ? 'mov' : 'mp4';
    const output = path.join(dir, `out.${ext}`);
    const plan = planVideo({
      recipe: p.recipe,
      video: p.facts,
      input: p.source.file,
      output,
      format: p.format,
      container: containerOf(p),
      frame: p.frame,
      size: p.size,
      music: p.music,
      texts,
      encoders: await encodersOf(tools.ffmpeg),
    });
    checkPlan(plan);
    for (const [name, text] of Object.entries(plan.files)) await fs.promises.writeFile(path.join(dir, name), text);
    if (j.stopping) throw new Error('stopped');
    await runFfmpeg(tools.ffmpeg, plan, dir, j);
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

/** The kind of file a video is written as: a .mov written over stays a .mov, a .webm a WebM, the rest MP4. */
function containerOf(p: Prepared): 'mp4' | 'mov' | 'webm' {
  if (p.format === 'webm') return 'webm';
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
    const when = p.still !== undefined ? toEdited(p.still, keptParts(p.recipe, p.facts.duration), p.recipe.speed ?? 1) : p.recipe.fadeIn ? p.recipe.fadeIn + 0.05 : 0;
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
  if (from?.folder && from.space === item.space) {
    try {
      putInFolder(db, 'media', item.id, from.folder);
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

const FORMATS: VideoOut[] = ['mp4', 'webm', 'gif', 'jpg', 'png'];
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

/**
 * An ask (the route's, or edit_video's) checked against the video: its source read, its recipe made to fit, the format
 * and where it goes agreeing, the music found, the editor's drawings read. Throws, in words a person can act on.
 */
export async function prepare(d: Deps, b: Partial<VideoEditAsk> & { to?: unknown }, o: { cwd?: string; to?: SaveTo } = {}): Promise<Prepared> {
  if (!(await ffmpegTools())) throw new HttpError(400, NO_FFMPEG);
  const source = await sourceOf(d.db, b.src, o);
  const facts = await factsOf(source.file);
  let recipe: VideoRecipe;
  try {
    recipe = normalizeVideoRecipe(b.recipe ?? {}, facts);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  const to = o.to ?? saveToOf(b.to);
  let format: VideoOut = FORMATS.includes(b.format as VideoOut) ? (b.format as VideoOut) : b.frame !== undefined ? 'jpg' : 'mp4';
  const picture = format === 'jpg' || format === 'png';
  const frame = b.frame === undefined || b.frame === null ? undefined : Number(b.frame);
  if (picture && (frame === undefined || !Number.isFinite(frame) || frame < 0 || frame > facts.duration)) throw new HttpError(400, `frame: the moment to take, in seconds of the video (0 to ${Math.floor(facts.duration * 10) / 10})`);
  // Written over a video, it stays the kind it was.
  const over = 'file' in to && to.as === 'replace' ? to.file : 'media' in to && to.as === 'replace' ? mustMedia(d.db, to.media).file : null;
  if (over && (picture || format === 'gif')) throw new HttpError(400, `A ${picture ? 'picture of a frame' : 'GIF'} is saved as a copy, not over the video`);
  if (over) format = /\.webm$/i.test(over) ? 'webm' : 'mp4';
  if ('video' in to && (picture || format === 'gif')) throw new HttpError(400, 'A frame or a GIF is kept as a picture: to: { asset: true }');
  if ('asset' in to && !(picture || format === 'gif')) throw new HttpError(400, 'A video is kept as a deck’s video: to: { video: true }');
  if ('media' in to && to.as === 'replace' && mustMedia(d.db, to.media).kind !== 'video') throw new HttpError(400, 'That Library item is not a video');
  const length = editedLength(recipe, facts.duration);
  if (!picture && length > MAX_SECONDS) throw new HttpError(400, `The edited video would be over ${MAX_SECONDS / 60} minutes: cut it shorter`);
  if (format === 'gif' && length > MAX_GIF_SECONDS) throw new HttpError(400, `A GIF can be at most ${MAX_GIF_SECONDS} seconds: cut it shorter, or save it as a video`);
  const music = recipe.music && !picture && format !== 'gif' ? await musicOf(d.db, recipe.music.src, o) : undefined;
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
  const stillAt = Number(b.still);
  return {
    d,
    source,
    facts,
    recipe,
    format,
    ...(frame !== undefined && picture ? { frame } : {}),
    ...(Number.isFinite(size) && size >= 120 ? { size: Math.round(Math.min(4320, size)) } : {}),
    ...(b.still !== undefined && b.still !== null && Number.isFinite(stillAt) && 'video' in to ? { still: Math.min(facts.duration, Math.max(0, stillAt)) } : {}),
    to,
    ...(music ? { music } : {}),
    drawn,
  };
}

// ---- the timeline's frames ----------------------------------------------------------------------------------------

/** `n` frames of a video side by side, each `h` pixels tall (a JPEG, kept for next time): its path, or null without ffmpeg. */
export async function frameStrip(file: string, n: number, h: number): Promise<string | null> {
  const tools = await ffmpegTools();
  if (!tools) return null;
  const st = await fs.promises.stat(file);
  const key = crypto.createHash('sha256').update(`${file}\0${st.size}\0${st.mtimeMs}\0${n}\0${h}`).digest('hex').slice(0, 32);
  const out = path.join(stripDir(), `${key}.jpg`);
  if (fs.existsSync(out)) return out;
  const facts = await factsOf(file);
  await fs.promises.mkdir(stripDir(), { recursive: true, mode: 0o700 });
  // Each frame read on its own (a seek, not the whole video), in the middle of its share of the length.
  const at = Array.from({ length: n }, (_, i) => Math.min(facts.duration - 0.05, ((i + 0.5) * facts.duration) / n));
  const args = ['-hide_banner', '-nostdin', '-y', '-v', 'error'];
  for (const t of at) args.push('-protocol_whitelist', 'file', '-ss', Math.max(0, t).toFixed(3), '-i', `file:${file}`);
  const scaled = at.map((_, i) => `[${i}:V]scale=-2:${h},setsar=1[f${i}]`).join(';');
  const graph = n > 1 ? `${scaled};${at.map((_, i) => `[f${i}]`).join('')}hstack=inputs=${n}[out]` : `[0:V]scale=-2:${h},setsar=1[out]`;
  const tmp = `${out}.${process.pid}.tmp.jpg`;
  await new Promise<void>((resolve, reject) =>
    execFile(tools.ffmpeg, [...args, '-filter_complex', graph, '-map', '[out]', '-frames:v', '1', '-q:v', '5', '-update', '1', '-f', 'image2', `file:${tmp}`], { timeout: 120_000, maxBuffer: 8 << 20, env: agentBaseEnv() }, (err, _o, stderr) =>
      err ? reject(new Error(ffmpegWords(String(stderr)))) : resolve(),
    ),
  );
  await fs.promises.rename(tmp, out);
  // The newest sixty are kept.
  const all = fs.readdirSync(stripDir()).map((f) => ({ f, t: fs.statSync(path.join(stripDir(), f)).mtimeMs }));
  for (const x of all.sort((a, b) => b.t - a.t).slice(60)) fs.rmSync(path.join(stripDir(), x.f), { force: true });
  return out;
}

// ---- routes ---------------------------------------------------------------------------------------------------------

const JOB = /^[a-f0-9]{16}$/;

export function videoEditRoutes(d: Deps) {
  const { app, db } = d;
  app.get('/api/mediaedit/video/info', async (req): Promise<VideoFacts> => {
    const src = (req.query as Record<string, string>).src;
    if (!(await ffmpegTools())) return { ffmpeg: false, why: NO_FFMPEG };
    const s = await sourceOf(db, src);
    return { ffmpeg: true, ...(await factsOf(s.file)) };
  });
  app.get('/api/mediaedit/video/strip', async (req, reply) => {
    const q = req.query as Record<string, string>;
    const s = await sourceOf(db, q.src);
    const n = Math.max(1, Math.min(40, Math.round(Number(q.n) || 12)));
    const h = Math.max(24, Math.min(160, Math.round(Number(q.h) || 64) & ~1));
    const file = await frameStrip(s.file, n, h);
    if (!file) throw new HttpError(400, NO_FFMPEG);
    reply.header('Content-Type', 'image/jpeg').header('Cache-Control', 'private, max-age=3600');
    return reply.send(fs.createReadStream(file));
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
}

/** Job folders left by a run that ended with the app (it stopped mid-edit), a day on. */
function sweepJobs() {
  try {
    const old = Date.now() - 86_400_000;
    for (const n of fs.readdirSync(tmpRoot())) {
      const p = path.join(tmpRoot(), n);
      if (fs.statSync(p).mtimeMs < old) fs.rmSync(p, { recursive: true, force: true });
    }
  } catch {}
}

/** Agents get edit_video while Settings → Images, video and audio has videos on. */
function videosOn(db: DB): boolean {
  try {
    return JSON.parse(kvGet(db, 'videos') ?? '{}').enabled !== false;
  } catch {
    return true;
  }
}

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
