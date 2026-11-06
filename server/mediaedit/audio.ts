// The sound editor's work on the server: what a sound is (its length, rate and channels, read by ffmpeg), its bytes for
// the browser to read (a video's sound taken out of it, or a sound the browser cannot read made an M4A), the sounds the
// editor keeps (recordings, files from this device, sounds made with AI: audio-store.ts), and an edit (shared/
// mediaedit-audio.ts) made with ffmpeg (audio-plan.ts) as a job: in line (two are made at once), measured first where
// Normalize or Loudness need to know how loud it is, made with its progress, stopped when asked, then put where it was
// asked to go: kept for a video ("naget-sound:…"), over a Library sound or as a new one, over a file (the old one to the
// Trash) or as a copy beside it, or (an agent's) into its session's folder. A job is kept in memory for an hour after it
// ends. Without ffmpeg on this computer, the picture tools' portable one does it.
//
// Routes, signed in (agents have edit_audio instead, audio-tool.ts):
//   GET    /api/mediaedit/audio/info?src=           SoundFacts
//   GET    /api/mediaedit/audio/source?src=&as=m4a  the sound's bytes for the browser to read
//   POST   /api/mediaedit/audio/sounds              a sound's bytes → KeptSound ("naget-sound:…")
//   GET    /api/mediaedit/audio/sounds/:sha         a kept sound
//   POST   /api/mediaedit/audio                     SoundEditAsk → SoundEditJob
//   GET    /api/mediaedit/audio/:job                SoundEditJob
//   DELETE /api/mediaedit/audio/:job                stops it → SoundEditJob
// and the words of a sound (audio-words.ts) and sounds made with AI (audio-make.ts).
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { MediaItem } from '../../shared/media.ts';
import {
  activeEffects,
  audibleTracks,
  normalizeSoundRecipe,
  SOUND_FORMATS,
  soundFormatOfName,
  soundLength,
  type KeptSound,
  type SoundEditAsk,
  type SoundEditJob,
  type SoundFacts,
  type SoundFormat,
  type SoundOutput,
  type SoundRecipe,
  type SoundSaveTo,
} from '../../shared/mediaedit-audio.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import { kvGet, type DB } from '../db.ts';
import { agentBaseEnv } from '../env.ts';
import type { Deps, Feature } from '../features/types.ts';
import { claimName, fileHash, moveWhole } from '../filemove.ts';
import { byteRange, deletePath, resolvePath, trashCopy } from '../files.ts';
import { slug } from '../images/openrouter.ts';
import { ffmpegTools, waveform } from '../media/frames.ts';
import { keepFile } from '../media/index.ts';
import { getMedia, initMedia, MEDIA_DIR, mustMedia } from '../media/store.ts';
import { putInFolder } from '../pages/folders.ts';
import { getVideo, sendVideo } from '../pages/videos.ts';
import { checkSoundPlan, gainFor, planSound, readLoudness, type PlanSource, type SoundCaps, type SoundPlan } from './audio-plan.ts';
import { keepSoundFile, keepSoundStream, keptSoundFile, keptSoundSha, sweepKeptSounds } from './audio-store.ts';
import { editAudioTool } from './audio-tool.ts';
import { soundMakeRoutes } from './audio-make.ts';
import { soundWordsRoutes } from './audio-words.ts';

/** What to tell a person when there is no ffmpeg at all. */
export const NO_FFMPEG_SOUND = 'Sound editing needs ffmpeg: set up the picture tools in Settings → Images, video and audio (they bring ffmpeg with them), or install ffmpeg';

const AT_ONCE = 2;
const WAITING = 8;
const LIMIT_MS = 30 * 60_000;
const KEEP_MS = 3600_000;

const tmpRoot = () => path.join(config.dataDir, 'mediaedit', 'tmp');
const previewDir = () => path.join(config.dataDir, 'mediaedit', 'previews');

/** Files the editor opens: sounds, and videos (their sound). */
export const SOUND_EXT = new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'flac', 'webm', 'weba']);
export const VIDEO_EXT = new Set(['mp4', 'm4v', 'mov', 'webm', 'mkv']);
/** Sounds every browser (but Safari's Ogg) reads as they are. */
const BROWSER_READS = new Set(['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'oga', 'opus', 'webm', 'weba']);

// ---- what a sound is ---------------------------------------------------------------------------------------------

/** A sound found from what names it, with what ffmpeg says of it. */
export interface Sound extends PlanSource {
  /** It is a video's sound. */
  video: boolean;
  codec?: string;
  name: string;
  media?: MediaItem;
  /** A file of the computer's (Files), or of an agent's session. */
  path?: string;
  /** A sound the editor keeps ("naget-sound:…"). */
  kept?: string;
  bytes?: number;
}

const MEDIA_ID = /^(?:media:|\/api\/media\/)([a-f0-9]{10})(?:\/file)?(?:[?#].*)?$/;
const KEPT_VIDEO = /^(?:naget-video:|\/api\/pages\/videos\/)([a-f0-9]{16,64})(?:[?#].*)?$/;
const KEPT_SOUND = /^(?:naget-sound:|\/api\/mediaedit\/audio\/sounds\/)([a-f0-9]{40})(?:[?#].*)?$/;

/** A path given in a request or by an agent: its own session's (`cwd`), else the signed-in user's (Files'). */
export function soundPathOf(p: string, cwd?: string): string {
  const fsRaw = /^\/api\/fs\/raw\?(.*)$/.exec(p);
  if (fsRaw) p = new URLSearchParams(fsRaw[1]).get('path') ?? '';
  if (cwd === undefined) return resolvePath(p);
  const s = p.trim();
  return s === '~' || s.startsWith('~/') ? path.join(os.homedir(), s.slice(1)) : path.resolve(cwd, s);
}

const facts = new Map<string, Promise<Omit<SoundFacts, 'ffmpeg' | 'why'>>>();

/** ffprobe's (or ffmpeg's) words about a file's sound: its length, rate, channels and kind; whether it is a video. */
export async function soundFactsOf(file: string): Promise<{ duration: number; rate: number; channels: number; codec?: string; video: boolean; bytes: number }> {
  const st = await fs.promises.stat(file);
  const key = `${file}\0${st.size}\0${st.mtimeMs}`;
  let f = facts.get(key);
  if (!f) {
    f = readFacts(file).then((x) => ({ ...x, bytes: st.size }));
    facts.set(key, f);
    f.catch(() => facts.delete(key));
    if (facts.size > 300) facts.delete(facts.keys().next().value!);
  }
  const x = await f;
  if (!x.duration || !x.rate) throw new HttpError(422, 'ffmpeg found no sound in it');
  return x as { duration: number; rate: number; channels: number; codec?: string; video: boolean; bytes: number };
}

async function readFacts(file: string): Promise<Omit<SoundFacts, 'ffmpeg' | 'why'>> {
  const t = await ffmpegTools();
  if (!t) throw new HttpError(400, NO_FFMPEG_SOUND);
  const run = (bin: string, args: string[]) =>
    new Promise<string>((resolve) => execFile(bin, args, { timeout: 30_000, maxBuffer: 8 << 20, env: agentBaseEnv() }, (_e, out, err) => resolve(String(out ?? '') + String(err ?? ''))));
  if (t.ffprobe) {
    const out = await run(t.ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,sample_rate,channels,duration:stream_disposition=attached_pic', '-of', 'json', file]);
    try {
      const j = JSON.parse(out.slice(out.indexOf('{')));
      const streams: any[] = Array.isArray(j.streams) ? j.streams : [];
      const a = streams.find((s) => s.codec_type === 'audio');
      if (!a) throw new HttpError(422, 'It has no sound');
      const duration = Number(j.format?.duration) || Number(a.duration) || 0;
      return {
        duration,
        rate: Number(a.sample_rate) || 0,
        channels: Math.min(2, Number(a.channels) || 2),
        codec: typeof a.codec_name === 'string' ? a.codec_name : undefined,
        video: streams.some((s) => s.codec_type === 'video' && !s.disposition?.attached_pic),
      };
    } catch (e) {
      if (e instanceof HttpError) throw e;
    }
  }
  // ffmpeg's own words: "Duration: 00:03:12.48", "Stream #0:0: Audio: mp3, 44100 Hz, stereo, fltp, 192 kb/s".
  const text = await run(t.ffmpeg, ['-hide_banner', '-nostdin', '-i', `file:${file}`]);
  const d = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(text);
  const a = /Stream #\d+:\d+.*?: Audio: ([a-z0-9_]+)[^,]*, (\d+) Hz, ([^,]+)/.exec(text);
  if (!a) throw new HttpError(422, 'It has no sound');
  const layout = a[3].trim();
  return {
    duration: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0,
    rate: Number(a[2]) || 0,
    channels: layout === 'mono' || layout === '1 channels' ? 1 : 2,
    codec: a[1],
    video: /Stream #\d+:\d+.*: Video: /.test(text.replace(/.*\(attached pic\).*\n?/g, '')),
  };
}

/** The sound `src` names: a kept one, a deck's video, a Library sound or video, or a file (a sound, or a video's sound); throws what is wrong. */
export async function soundOf(db: DB, src: unknown, o: { cwd?: string } = {}): Promise<Sound> {
  const s = typeof src === 'string' ? src.trim() : '';
  if (!s) throw new HttpError(400, 'src: the sound');
  let file: string;
  let extra: Partial<Sound> = {};
  let name = 'sound';
  const kept = KEPT_SOUND.exec(s);
  const video = KEPT_VIDEO.exec(s);
  const media = MEDIA_ID.exec(s);
  if (kept) {
    const f = keptSoundFile(kept[1]);
    if (!f) throw new HttpError(404, 'That sound is no longer kept by the app');
    file = f;
    extra = { kept: `naget-sound:${kept[1]}` };
  } else if (video) {
    const v = getVideo(db, video[1]);
    if (!v) throw new HttpError(404, 'That video is no longer kept by the app');
    file = v.file;
    name = 'video';
  } else if (media) {
    const m = mustMedia(db, media[1]);
    if (m.kind !== 'audio' && m.kind !== 'video') throw new HttpError(400, 'That Library item is a picture, not a sound');
    file = m.file;
    name = m.title;
    extra = { media: m };
  } else {
    file = soundPathOf(s, o.cwd);
    const st = await fs.promises.stat(file).catch(() => null);
    if (!st?.isFile()) throw new HttpError(404, `No such sound: ${file}`);
    const ext = path.extname(file).slice(1).toLowerCase();
    if (!SOUND_EXT.has(ext) && !VIDEO_EXT.has(ext)) throw new HttpError(400, `${path.basename(file)} is not a sound this editor opens: an MP3, WAV, M4A, AAC, OGG, Opus, FLAC or WebM sound, or a video's sound`);
    name = path.basename(file).replace(/\.[^.]+$/, '');
    extra = { path: file };
  }
  const f = await soundFactsOf(file);
  return { file, name, ...extra, ...f };
}

// ---- what this ffmpeg can do --------------------------------------------------------------------------------------

const capsCache = new Map<string, Promise<SoundCaps>>();

/** The filters, options and encoders an ffmpeg has, asked once. */
export function capsOf(bin: string): Promise<SoundCaps> {
  let c = capsCache.get(bin);
  if (!c) {
    const ask = (args: string[]) =>
      new Promise<string>((resolve) => execFile(bin, ['-hide_banner', ...args], { timeout: 20_000, maxBuffer: 8 << 20, env: agentBaseEnv() }, (_e, out, err) => resolve(String(out ?? '') + String(err ?? ''))));
    c = Promise.all([ask(['-filters']), ask(['-encoders']), ask(['-h', 'filter=afir']), ask(['-h', 'filter=alimiter'])]).then(([filters, enc, afir, lim]) => {
      const has = (name: string) => new RegExp(`^\\s*[A-Z.]{6}\\s+${name}\\s`, 'm').test(enc);
      return {
        rubberband: /^\s*[A-Z.]{3}\s+rubberband\s/m.test(filters),
        afirPlain: /\birnorm\b/.test(afir) ? 'irnorm' : /\bgtype\b/.test(afir) ? 'gtype' : null,
        limiterLatency: /\blatency\b/.test(lim),
        encoders: { mp3: has('libmp3lame'), aac: has('aac'), opus: has('libopus'), vorbis: has('libvorbis'), flac: has('flac') },
      } satisfies SoundCaps;
    });
    capsCache.set(bin, c);
  }
  return c;
}

// ---- the browser's copy of a sound -------------------------------------------------------------------------------

/** Sends a file in byte ranges (it may change: not kept by the browser). */
async function sendFile(req: FastifyRequest, reply: FastifyReply, file: string, mime: string) {
  const st = await fs.promises.stat(file).catch(() => null);
  if (!st?.isFile()) throw new HttpError(404, 'Not found');
  reply.header('Content-Type', mime).header('Cache-Control', 'private, no-cache').header('Accept-Ranges', 'bytes').header('Content-Security-Policy', "default-src 'none'; sandbox");
  const range = byteRange(req.headers.range, st.size);
  if (range === 'bad') return reply.code(416).header('Content-Range', `bytes */${st.size}`).send();
  if (range !== 'all') {
    reply.code(206).header('Content-Range', `bytes ${range.start}-${range.end}/${st.size}`).header('Content-Length', range.end - range.start + 1);
    return reply.send(fs.createReadStream(file, { start: range.start, end: range.end }));
  }
  return reply.header('Content-Length', st.size).send(fs.createReadStream(file));
}

const MIMES: Record<string, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac', webm: 'audio/webm', weba: 'audio/webm' };

/** A sound as an M4A the browser reads (a video's sound taken out as it is when it is AAC), kept for next time: its path. */
export async function browserCopy(s: Sound): Promise<string> {
  const tools = await ffmpegTools();
  if (!tools) throw new HttpError(400, NO_FFMPEG_SOUND);
  const st = await fs.promises.stat(s.file);
  const key = crypto.createHash('sha256').update(`${s.file}\0${st.size}\0${st.mtimeMs}`).digest('hex').slice(0, 32);
  const out = path.join(previewDir(), `${key}.m4a`);
  if (fs.existsSync(out)) return out;
  await fs.promises.mkdir(previewDir(), { recursive: true, mode: 0o700 });
  const tmp = `${out}.${process.pid}.tmp.m4a`;
  const copy = s.codec === 'aac';
  const args = ['-hide_banner', '-nostdin', '-y', '-v', 'error', '-protocol_whitelist', 'file', '-i', `file:${s.file}`, '-map', '0:a:0', '-vn', ...(copy ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '192k']), '-movflags', '+faststart', '-f', 'mp4', `file:${tmp}`];
  await new Promise<void>((resolve, reject) =>
    execFile(tools.ffmpeg, args, { timeout: 20 * 60_000, maxBuffer: 8 << 20, env: { ...agentBaseEnv(), CUDA_VISIBLE_DEVICES: '' } }, (err, _o, stderr) => (err ? reject(new HttpError(422, ffmpegWords(String(stderr)))) : resolve())),
  );
  await fs.promises.rename(tmp, out);
  // The newest thirty are kept.
  const all = fs.readdirSync(previewDir()).map((f) => ({ f, t: fs.statSync(path.join(previewDir(), f)).mtimeMs }));
  for (const x of all.sort((a, b) => b.t - a.t).slice(30)) fs.rmSync(path.join(previewDir(), x.f), { force: true });
  return out;
}

// ---- jobs ---------------------------------------------------------------------------------------------------------

/** Where an edit goes: as the route asks (SoundSaveTo), or (an agent's) into a folder of its session under a name. */
export type SoundTo = SoundSaveTo | { into: string; name: string };

/** An edit checked and ready to make. */
export interface PreparedSound {
  d: Deps;
  source: Sound;
  recipe: SoundRecipe;
  sources: Map<string, PlanSource>;
  out: SoundOutput;
  to: SoundTo;
  name: string;
}

interface Job {
  view: SoundEditJob;
  prep: PreparedSound;
  proc?: ChildProcess;
  stopping?: boolean;
  late?: boolean;
  ended: Promise<void>;
  end: () => void;
}

const jobs = new Map<string, Job>();
const line: Job[] = [];
let making = 0;

export const soundJob = (id: string): SoundEditJob | null => jobs.get(id)?.view ?? null;

/** Waits for a job to end, at most `ms`: whether it did. */
export async function waitForSoundJob(id: string, ms: number, signal?: AbortSignal): Promise<boolean> {
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

const isEnded = (s: SoundEditJob['status']) => s === 'done' || s === 'failed' || s === 'stopped';

function finish(j: Job, status: 'done' | 'failed' | 'stopped', error?: string) {
  if (isEnded(j.view.status)) return;
  Object.assign(j.view, { status, endedAt: Date.now(), ...(error ? { error } : {}) });
  delete j.view.step;
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
export function startSoundEdit(prep: PreparedSound): SoundEditJob {
  if (line.length >= WAITING) throw new HttpError(429, `${WAITING} edits are waiting already: wait for some of them to be made`);
  let end!: () => void;
  const ended = new Promise<void>((r) => (end = r));
  const view: SoundEditJob = { job: crypto.randomBytes(8).toString('hex'), status: 'queued', format: prep.out.format, startedAt: Date.now() };
  const j: Job = { view, prep, ended, end };
  jobs.set(view.job, j);
  line.push(j);
  pump();
  return view;
}

/** Stops a job: one in line leaves it, one being made is ended (its files go). */
export function stopSoundEdit(id: string): SoundEditJob | null {
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
export function ffmpegWords(tail: string): string {
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

/** Runs one pass; its progress counts from `done` to `done + share` of the job. Its words (stderr's last 40 KB). */
function runPass(bin: string, plan: SoundPlan, cwd: string, j: Job, done: number, share: number): Promise<string> {
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
        if (m && plan.seconds > 0) j.view.progress = Math.max(j.view.progress ?? 0, Math.min(0.99, done + share * Math.min(1, Number(m[1]) / 1e6 / plan.seconds)));
      }
    });
    proc.stderr!.on('data', (b: Buffer) => void (tail = (tail + b.toString('utf8')).slice(-40_000)));
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
      if (code === 0 && !j.stopping) resolve(tail);
      else reject(new Error(j.stopping ? 'stopped' : j.late ? `It took over ${LIMIT_MS / 60_000} minutes, so it was stopped: make a shorter one` : ffmpegWords(tail)));
    });
  });
}

/** Normalize and Loudness that are on and heard, in the order they are made: each track's, then the whole sound's. */
export function measuredEffects(r: SoundRecipe) {
  const heard = audibleTracks(r).filter((t) => t.clips.length);
  return [...heard.flatMap((t) => activeEffects(r, t.id)), ...activeEffects(r, null)].filter((e) => e.type === 'normalize' || e.type === 'loudness');
}

async function make(j: Job): Promise<void> {
  if (isEnded(j.view.status)) return;
  const p = j.prep;
  j.view.status = 'running';
  j.view.progress = 0;
  await fs.promises.mkdir(tmpRoot(), { recursive: true, mode: 0o700 });
  const dir = await fs.promises.mkdtemp(path.join(tmpRoot(), 'sound-'));
  try {
    const tools = await ffmpegTools();
    if (!tools) throw new Error(NO_FFMPEG_SOUND);
    const caps = await capsOf(tools.ffmpeg);
    const fmt = SOUND_FORMATS.find((f) => f.id === p.out.format)!;
    const output = path.join(dir, `out.${fmt.ext}`);
    const measures = measuredEffects(p.recipe);
    const passes = measures.length + 1;
    const gains: Record<string, number> = {};
    const limit: string[] = [];
    const base = { recipe: p.recipe, sources: p.sources, out: p.out, dir, output, caps };
    for (const [i, e] of measures.entries()) {
      j.view.step = e.type === 'loudness' ? 'Measuring its loudness' : 'Finding its loudest peak';
      const plan = planSound({ ...base, gains, limit, measure: e.id });
      checkSoundPlan(plan);
      for (const [name, data] of Object.entries(plan.files)) await fs.promises.writeFile(path.join(dir, name), data);
      if (j.stopping) throw new Error('stopped');
      const said = await runPass(tools.ffmpeg, plan, dir, j, i / passes, 1 / passes);
      const g = gainFor(e, readLoudness(said));
      gains[e.id] = g.gain;
      if (g.limit) limit.push(e.id);
    }
    j.view.step = 'Making it';
    const plan = planSound({ ...base, gains, limit });
    checkSoundPlan(plan);
    for (const [name, data] of Object.entries(plan.files)) await fs.promises.writeFile(path.join(dir, name), data);
    if (j.stopping) throw new Error('stopped');
    await runPass(tools.ffmpeg, plan, dir, j, measures.length / passes, 1 / passes);
    const st = await fs.promises.stat(output).catch(() => null);
    if (!st?.size) throw new Error('ffmpeg made nothing');
    Object.assign(j.view, { bytes: st.size, seconds: Math.round(plan.seconds * 100) / 100 });
    j.view.step = 'Saving it';
    await deliver(j, output, fmt.ext, dir);
    finish(j, 'done');
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    finish(j, j.stopping || msg === 'stopped' ? 'stopped' : 'failed', j.stopping || msg === 'stopped' ? undefined : msg);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** A name for what is made of `source` ("interview (edited).mp3"). */
function madeName(p: PreparedSound, ext: string): string {
  const stem =
    (p.name || p.source.name || 'sound')
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
      .replace(/\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|webm|mp4|mov|mkv)$/i, '')
      .trim()
      .slice(0, 80) || 'sound';
  return /\(edited\)$/.test(stem) || p.name ? `${stem}.${ext}` : `${stem} (edited).${ext}`;
}

/** Whether a file is the app's own (its data folder), which is never written from here. */
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

async function deliver(j: Job, out: string, ext: string, dir: string): Promise<void> {
  const p = j.prep;
  const to = p.to;
  const db = p.d.db;
  if ('sound' in to) {
    j.view.src = (await keepSoundFile(out, { move: true, ext })).src;
    return;
  }
  if ('into' in to) {
    await fs.promises.mkdir(to.into, { recursive: true });
    const at = await claimName(to.into, `${slug(to.name, 'sound')}.${ext}`);
    await moveWhole(out, at);
    j.view.path = at;
    return;
  }
  if ('file' in to) {
    const original = soundPathOf(to.file);
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
    const item = await replaceLibrarySound(p.d, mustMedia(db, to.media), out, ext);
    j.view.media = item.id;
    return;
  }
  // A new sound in the Library (a copy of an item goes in its project and folder).
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

const SOUND_MIME: Record<string, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', flac: 'audio/flac' };

/** A Library sound's file swapped for an edited one: its size, length, shape and hash with it, its title and description kept. */
export async function replaceLibrarySound(d: Deps, m: MediaItem, from: string, ext: string): Promise<MediaItem> {
  initMedia(d.db);
  if (m.kind !== 'audio') throw new HttpError(400, 'That Library item is not a sound: save it as a new one');
  const name = `${m.id}.${ext}`;
  const to = path.join(MEDIA_DIR, name);
  const tmp = path.join(MEDIA_DIR, `.${m.id}.${crypto.randomBytes(4).toString('hex')}.tmp`);
  await moveWhole(from, tmp);
  await fs.promises.rename(tmp, to);
  if (path.resolve(m.file) !== path.resolve(to)) await fs.promises.rm(m.file, { force: true }).catch(() => {});
  const st = await fs.promises.stat(to);
  const [f, peaks] = await Promise.all([soundFactsOf(to).catch(() => null), waveform(to)]);
  d.db
    .prepare('update media set file = ?, mime = ?, bytes = ?, duration = ?, peaks = ?, sha = ?, updated_at = ? where id = ?')
    .run(name, SOUND_MIME[ext] ?? 'audio/mpeg', st.size, f?.duration ?? null, peaks?.length ? JSON.stringify(peaks) : null, await fileHash(to), Date.now(), m.id);
  const item = getMedia(d.db, m.id)!;
  d.broadcast({ t: 'feature', id: 'media', data: { what: 'media', item } });
  return item;
}

// ---- checking what is asked ----------------------------------------------------------------------------------------

/** Where the result may go, as the route takes it. */
function saveToOf(v: unknown): SoundSaveTo {
  const t = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const as = t.as === 'replace' || t.as === 'copy' ? t.as : null;
  if (t.sound === true) return { sound: true };
  if (t.library === true)
    return {
      library: true,
      ...(typeof t.session === 'string' && /^[\w:.-]{1,200}$/.test(t.session) ? { session: t.session } : {}),
      ...(typeof t.title === 'string' && t.title.trim() ? { title: t.title.trim().slice(0, 120) } : {}),
    };
  if (typeof t.media === 'string' && /^[a-f0-9]{10}$/.test(t.media) && as) return { media: t.media, as };
  if (typeof t.file === 'string' && t.file.trim() && as) return { file: t.file.trim(), as };
  throw new HttpError(400, 'to: where it goes ({ sound: true }, { library: true }, { media: id, as: "replace" | "copy" } or { file: path, as: "replace" | "copy" })');
}

/** How it is saved, as asked: a kind this editor makes, at a quality it offers. */
export function outputOf(v: unknown, fallback: SoundFormat): SoundOutput {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const format = SOUND_FORMATS.some((f) => f.id === o.format) ? (o.format as SoundFormat) : fallback;
  const info = SOUND_FORMATS.find((f) => f.id === format)!;
  const out: SoundOutput = { format };
  const k = Number(o.kbps);
  if (info.kbps && Number.isFinite(k)) out.kbps = info.kbps.reduce((a, b) => (Math.abs(b - k) < Math.abs(a - k) ? b : a));
  if ((format === 'wav' || format === 'flac') && o.bits === 24) out.bits = 24;
  if (o.channels === 1 || o.channels === 2) out.channels = o.channels;
  const rate = Number(o.rate);
  if (Number.isFinite(rate) && rate >= 8000 && rate <= 48_000) out.rate = Math.round(rate);
  return out;
}

/** The kind a file written over must stay: its own, when this editor makes it exactly. */
export function keptKind(file: string): SoundFormat | null {
  const ext = path.extname(file).slice(1).toLowerCase();
  return ext === 'mp3' || ext === 'wav' || ext === 'flac' || ext === 'm4a' ? ext : ext === 'ogg' || ext === 'opus' || ext === 'oga' ? 'ogg' : null;
}

/**
 * An ask (the route's, or edit_audio's) checked: the sound being edited and every sound its clips play found, its
 * recipe made to fit them, how it is saved and where it goes agreeing. Throws, in words a person can act on.
 */
export async function prepareSound(d: Deps, b: Partial<SoundEditAsk> & { to?: unknown }, o: { cwd?: string; to?: SoundTo } = {}): Promise<PreparedSound> {
  if (!(await ffmpegTools())) throw new HttpError(400, NO_FFMPEG_SOUND);
  const source = await soundOf(d.db, b.src, o);
  const raw = (b.recipe && typeof b.recipe === 'object' ? b.recipe : {}) as Record<string, any>;
  // Every sound the clips play, found once.
  const sounds = new Map<string, Sound>([['', source]]);
  for (const t of Array.isArray(raw.tracks) ? raw.tracks : [])
    for (const c of Array.isArray(t?.clips) ? t.clips : []) {
      const src = typeof c?.src === 'string' ? c.src.trim() : '';
      if (sounds.has(src)) continue;
      if (sounds.size > 40) throw new HttpError(400, 'An edit can mix at most 40 sounds');
      sounds.set(src, await soundOf(d.db, src, o));
    }
  let recipe: SoundRecipe;
  try {
    recipe = normalizeSoundRecipe(raw, { length: (src) => sounds.get(src)?.duration, video: raw.length !== undefined && raw.length !== null });
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  const to = o.to ?? saveToOf(b.to);
  if ('file' in to && appsOwn(soundPathOf(to.file))) throw new HttpError(403, 'That file is part of the app’s own data: it is not written from here.');
  if ('media' in to && to.as === 'replace' && mustMedia(d.db, to.media).kind !== 'audio') throw new HttpError(400, 'That Library item is not a sound: save the edit as a new one');
  const own = keptKind(source.file);
  let out = outputOf(b.out, own ?? 'mp3');
  // Written over a file, it stays the kind it was.
  if ('file' in to && to.as === 'replace') {
    const kind = keptKind(soundPathOf(to.file));
    if (!kind) throw new HttpError(400, `${path.basename(to.file)} is not a kind of file this editor writes over: save a copy beside it`);
    if (out.format !== kind) out = { ...outputOf(b.out, kind), format: kind };
  }
  if ('sound' in to && !b.out) out = { format: 'm4a', kbps: 256 };
  const length = soundLength(recipe);
  if (length <= 0) throw new HttpError(400, 'Nothing would be left of it');
  const sources = new Map<string, PlanSource>([...sounds].map(([k, s]) => [k, { file: s.file, duration: s.duration, rate: s.rate, channels: s.channels }]));
  return { d, source, recipe, sources, out, to, name: typeof b.name === 'string' ? b.name.trim().slice(0, 120) : '' };
}

// ---- routes ---------------------------------------------------------------------------------------------------------

const JOB = /^[a-f0-9]{16}$/;

export function soundEditRoutes(d: Deps) {
  const { app, db } = d;
  app.get('/api/mediaedit/audio/info', async (req): Promise<SoundFacts> => {
    const src = (req.query as Record<string, string>).src;
    if (!(await ffmpegTools())) return { ffmpeg: false, why: NO_FFMPEG_SOUND };
    const s = await soundOf(db, src);
    return { ffmpeg: true, duration: s.duration, rate: s.rate, channels: s.channels, codec: s.codec, format: keptKind(s.file), video: s.video, bytes: s.bytes, name: s.name };
  });
  app.get('/api/mediaedit/audio/source', async (req, reply) => {
    const q = req.query as Record<string, string>;
    const s = await soundOf(db, q.src);
    const ext = path.extname(s.file).slice(1).toLowerCase();
    if (q.as !== 'm4a' && !s.video && BROWSER_READS.has(ext)) return sendFile(req, reply, s.file, MIMES[ext] ?? 'application/octet-stream');
    return sendFile(req, reply, await browserCopy(s), 'audio/mp4');
  });
  app.post('/api/mediaedit/audio/sounds', async (req): Promise<KeptSound> => {
    const kept = await keepSoundStream(req.body as Readable | undefined);
    const name = String((req.query as Record<string, string>).name ?? '')
      .trim()
      .slice(0, 120);
    try {
      const f = await soundFactsOf(kept.file);
      return { src: kept.src, duration: f.duration, rate: f.rate, channels: f.channels, ...(name ? { name } : {}) };
    } catch (e) {
      throw new HttpError(422, `That is not a sound ffmpeg can read: ${(e as Error).message}`);
    }
  });
  app.get('/api/mediaedit/audio/sounds/:sha', async (req, reply) => {
    const sha = String((req.params as { sha?: string }).sha ?? '');
    const file = keptSoundSha(`naget-sound:${sha}`) ? keptSoundFile(sha) : null;
    const ext = file ? path.extname(file).slice(1) : '';
    return sendVideo(req, reply, file ? { file, mime: MIMES[ext] ?? (ext === 'mp4' ? 'audio/mp4' : 'application/octet-stream') } : null);
  });
  app.post('/api/mediaedit/audio', async (req) => startSoundEdit(await prepareSound(d, (req.body ?? {}) as Partial<SoundEditAsk>)));
  app.get('/api/mediaedit/audio/:job', async (req) => {
    const id = String((req.params as { job?: string }).job ?? '');
    if (!JOB.test(id)) throw new HttpError(400, 'job: the id POST /api/mediaedit/audio gave');
    const v = soundJob(id);
    if (!v) throw new HttpError(404, 'No such edit: it ended over an hour ago, or the app started again since');
    return v;
  });
  app.delete('/api/mediaedit/audio/:job', async (req) => {
    const id = String((req.params as { job?: string }).job ?? '');
    const v = JOB.test(id) ? stopSoundEdit(id) : null;
    if (!v) throw new HttpError(404, 'No such edit');
    return v;
  });
  soundWordsRoutes(d);
  soundMakeRoutes(d);
}

/** Job folders and browser copies left by a run that ended with the app, a day on. */
function sweep() {
  try {
    const old = Date.now() - 86_400_000;
    for (const n of fs.readdirSync(tmpRoot())) {
      const p = path.join(tmpRoot(), n);
      if (n.startsWith('sound-') && fs.statSync(p).mtimeMs < old) fs.rmSync(p, { recursive: true, force: true });
    }
  } catch {}
  sweepKeptSounds();
}

/** Agents get edit_audio while Settings → Images, video and audio has audio on. */
function audioOn(db: DB): boolean {
  try {
    return JSON.parse(kvGet(db, 'audio') ?? '{}').enabled !== false;
  } catch {
    return true;
  }
}

export const soundEdit: Feature = {
  id: 'mediaedit-audio',
  routes(d) {
    soundEditRoutes(d);
  },
  tools: ({ deps }) => (audioOn(deps.db) ? [editAudioTool()] : []),
  start() {
    sweep();
    setInterval(sweep, 6 * 3600_000).unref?.();
  },
};

/** What edit_audio's answer names a format by. */
export const formatOfFile = (file: string): SoundFormat => soundFormatOfName(file) ?? 'mp3';
