// Videos for the editors (documents, slides and pages): one made from words, and from a kept picture to start on if
// wanted, through OpenRouter with the video model picked in Settings → Images, video and audio (or one named). No
// form: the editor's dialog showed what it costs before it was pressed. The app follows the job after the request
// ends (video.ts), keeps the video as a deck keeps its own ("naget-video:<sha>", server/pages/videos.ts) with its first
// frame as a kept picture, and the editor asks after it until it is done. Jobs are kept in memory, for an hour after
// they end; one the app no longer knows (it restarted meanwhile) is asked of OpenRouter, and followed again.
//   POST /api/videos/make        MakeVideoAsk → VideoJob
//   GET  /api/videos/make/:job   VideoJob
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { MakeVideoAsk, VideoJob } from '../../shared/images.ts';
import type { VideoModel } from '../../shared/media.ts';
import { ASSET } from '../../shared/slides.ts';
import { HttpError } from '../auth.ts';
import { kvGet, type DB } from '../db.ts';
import { probe } from '../media/frames.ts';
import { loadConfig } from '../models/config.ts';
import { OPENROUTER_URL } from '../models/openrouter.ts';
import { getAsset, putAsset } from '../pages/assets.ts';
import { keepVideoFile } from '../pages/videos.ts';
import type { Reference } from './openrouter.ts';
import { videoCost, videoDefaults, type VideoChoice } from './settings.ts';
import { DONE, follow, height, pollVideo, PREFERRED_VIDEO, submitVideo, videoModels, type Followed, type VideoJob as OpenRouterJob } from './video.ts';

export const NO_KEY = 'Add an OpenRouter key in Settings → Models: videos are made through OpenRouter';

/** How long a job is kept after it ends, and how many may be made at once. */
const KEEP_MS = 3600_000;
const AT_ONCE = 4;

const MODEL_ID = /^[\w.~:/-]{1,120}$/;
const JOB_ID = /^[\w.-]{4,120}$/;

interface Job {
  job: VideoJob;
  f: Followed;
  ended?: number;
}

/** The editors' jobs, by OpenRouter's id. */
export const videoJobs = new Map<string, Job>();

/** The model picked in Settings → Images, video and audio, or '' for the app's choice. */
function picked(db: DB): string {
  try {
    const s = JSON.parse(kvGet(db, 'videos') ?? '{}');
    return typeof s.model === 'string' ? s.model : '';
  } catch {
    return '';
  }
}

/** The model to use: the one asked for, the one picked, or the first of the app's choices OpenRouter still lists. */
async function modelFor(db: DB, asked?: string): Promise<{ id: string; info?: VideoModel; listed: boolean }> {
  const list = await videoModels(OPENROUTER_URL).catch(() => [] as VideoModel[]);
  const id = asked || picked(db) || PREFERRED_VIDEO.find((p) => list.some((m) => m.id === p)) || PREFERRED_VIDEO[0];
  return { id, info: list.find((m) => m.id === id), listed: list.length > 0 };
}

/** The one of `xs` closest by `far`; of two as close, the first (lists run from the shortest and cheapest). */
const nearest = <T>(xs: T[], far: (x: T) => number): T => xs.reduce((best, x) => (far(x) < far(best) ? x : best));

const ratio = (a: string) => {
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(a);
  return m && Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : NaN;
};

/** What was asked, made to fit what the model makes: the nearest length, resolution and shape it lists; sound only if it makes it. */
export function fitVideo(m: VideoModel | undefined, v: VideoChoice): VideoChoice {
  if (!m) return v;
  const out: VideoChoice = { ...v };
  if (out.duration !== undefined && m.durations.length && !m.durations.includes(out.duration)) out.duration = nearest(m.durations, (d) => Math.abs(d - out.duration!));
  if (out.resolution && m.resolutions.length && !m.resolutions.includes(out.resolution)) {
    const want = height(out.resolution);
    out.resolution = want ? nearest(m.resolutions, (r) => Math.abs(height(r) - want)) : (videoDefaults(m).resolution ?? m.resolutions[0]);
  }
  if (out.aspect && m.aspects.length && !m.aspects.includes(out.aspect)) {
    const r = ratio(out.aspect);
    const known = m.aspects.filter((a) => Number.isFinite(ratio(a)));
    if (Number.isFinite(r) && known.length) out.aspect = nearest(known, (a) => Math.abs(Math.log(ratio(a) / r)));
    else delete out.aspect;
  }
  if (!m.audio && out.audio) delete out.audio;
  return out;
}

/** A kept picture to start on (or a picture as a data: address): one a video model takes. */
function startOn(db: DB, src: string): Reference {
  let data: Buffer | undefined;
  let mime = '';
  if (src.startsWith(ASSET)) {
    const a = getAsset(db, src.slice(ASSET.length));
    if (a) [data, mime] = [a.data, a.mime];
  } else {
    const m = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(src);
    if (m) [data, mime] = [Buffer.from(m[2], 'base64'), m[1].toLowerCase()];
  }
  if (!data?.length) throw new HttpError(400, 'The picture to start on is not one this app keeps (first: "naget-asset:…")');
  if (!/^image\/(png|jpeg|webp)$/.test(mime)) throw new HttpError(400, 'A video starts on a picture such as a photo (PNG, JPEG or WebP), not a drawing or an animation');
  return { name: 'first', mime, data };
}

const str = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);

/** Where a job is now: still in line, being made (or kept), or ended. */
const statusOf = (s: string): VideoJob['status'] => (s === 'pending' || s === 'queued' ? 'queued' : 'running');

const view = (j: Job): VideoJob => ({ ...j.job, ...(j.ended ? {} : { status: statusOf(j.f.status) }) });

/**
 * A job followed until it ends, then its video kept (its first frame a kept picture, its size and length read), or its
 * failure in words; the download goes to a folder of its own, gone after.
 */
function track(db: DB, key: string, oj: OpenRouterJob, o: { model: string; cost?: number; seconds?: number }): Job {
  const had = videoJobs.get(oj.id);
  if (had) return had;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-video-'));
  const f = follow({ base: OPENROUTER_URL, key, job: oj, model: o.model, session: 'editor', dir, name: 'video' });
  const job: VideoJob = { job: oj.id, status: statusOf(f.status), model: o.model, ...(o.seconds ? { seconds: o.seconds } : {}), ...(o.cost !== undefined ? { cost: o.cost } : {}), startedAt: Date.now() };
  const j: Job = { job, f };
  videoJobs.set(oj.id, j);
  void (async () => {
    try {
      const { files, cost } = await f.done;
      const file = files[0].path;
      const kept = await keepVideoFile(db, file, path.dirname(file)).catch((e: Error) => {
        throw new Error(`The video was made but could not be kept: ${e.message}`);
      });
      let poster: string | undefined;
      try {
        if (kept.frame) poster = ASSET + putAsset(db, kept.frame);
      } catch {}
      const p = await probe(file).catch(() => null);
      Object.assign(job, {
        status: 'done',
        src: kept.src,
        ...(poster ? { poster } : {}),
        ...(kept.w && kept.h ? { w: kept.w, h: kept.h } : {}),
        ...(p?.duration ? { seconds: Math.round(p.duration * 10) / 10 } : {}),
        ...(cost ? { cost } : {}),
      });
    } catch (e) {
      Object.assign(job, { status: 'failed', error: String((e as Error).message ?? e) });
    } finally {
      j.ended = Date.now();
      await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
      setTimeout(() => videoJobs.get(oj.id) === j && videoJobs.delete(oj.id), KEEP_MS).unref?.();
    }
  })();
  return j;
}

export function videoRoutes(app: FastifyInstance, db: DB) {
  /** A video started: its job, with about what it will cost; the app follows it from here. */
  app.post('/api/videos/make', async (req) => {
    const b = (req.body ?? {}) as MakeVideoAsk & Record<string, unknown>;
    const key = loadConfig().openrouter.apiKey;
    if (!key) throw new HttpError(400, NO_KEY);
    const prompt = str(b.prompt, 4000) ?? '';
    const from = str(b.first, 20_000_000);
    if (!prompt && !from) throw new HttpError(400, 'Say what happens in the video (prompt)');
    const asked = str(b.model);
    if (asked && !MODEL_ID.test(asked)) throw new HttpError(400, 'model: an OpenRouter id, like google/veo-3.1');
    if ([...videoJobs.values()].filter((j) => !j.ended).length >= AT_ONCE) throw new HttpError(429, `${AT_ONCE} videos are being made already: wait for one of them to finish`);
    const { id, info, listed } = await modelFor(db, asked);
    if (asked && !info && listed) throw new HttpError(400, `OpenRouter has no video model ${asked}`);
    if (info?.videoIn) throw new HttpError(400, `${info.label} changes a video it is given and cannot make one from words: pick another video model in Settings → Images, video and audio`);
    const first = from ? startOn(db, from) : undefined;
    if (first && info && !info.frames.includes('first_frame')) throw new HttpError(400, `${info.label} does not start on a picture: leave the picture out, or pick a video model that does in Settings → Images, video and audio`);
    const res = str(b.resolution, 20);
    const given: VideoChoice = {
      ...(Number(b.duration) > 0 ? { duration: Math.round(Math.min(120, Number(b.duration))) } : {}),
      ...(str(b.aspect, 20) ? { aspect: str(b.aspect, 20) } : {}),
      ...(res ? { resolution: /^\d+p?$/i.test(res) ? `${parseInt(res, 10)}p` : res.toUpperCase() } : {}),
      ...(typeof b.audio === 'boolean' ? { audio: b.audio } : {}),
    };
    const v = fitVideo(info, { ...videoDefaults(info), ...given });
    // A picture to start on sets the shape for most models.
    if (first && !given.aspect) delete v.aspect;
    let submitted;
    try {
      submitted = await submitVideo(OPENROUTER_URL, key, {
        model: id,
        prompt,
        duration: v.duration,
        aspect: v.aspect,
        resolution: v.resolution,
        ...(info?.audio || v.audio === false ? { audio: v.audio } : {}),
        first,
      });
    } catch (e) {
      throw new HttpError(502, `The video was not started: ${(e as Error).message}`);
    }
    if (DONE.has(submitted.status) && submitted.status !== 'completed') throw new HttpError(502, submitted.error ? `The video was not made: ${submitted.error}` : `The video was not made (${submitted.status})`);
    return view(track(db, key, submitted, { model: id, cost: videoCost(info, v), seconds: v.duration }));
  });

  /** Where a video is: in line, being made, done (its video and first frame kept) or failed. */
  app.get('/api/videos/make/:job', async (req) => {
    const id = String((req.params as { job?: string }).job ?? '');
    if (!JOB_ID.test(id)) throw new HttpError(400, 'job: the id POST /api/videos/make gave');
    const had = videoJobs.get(id);
    if (had) return view(had);
    // The app restarted since it began: OpenRouter may have it still.
    const key = loadConfig().openrouter.apiKey;
    const oj = key ? await pollVideo(OPENROUTER_URL, key, id).catch(() => null) : null;
    if (oj?.id) return view(track(db, key!, oj, { model: '' }));
    throw new HttpError(404, 'No such video: it ended over an hour ago, or it was never started here');
  });
}
