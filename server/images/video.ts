// Videos through OpenRouter: its video models (/videos/models: the lengths, resolutions and shapes each makes,
// whether it makes sound or starts from a picture, and its prices), and one generation, which is a job: it is
// sent (/videos), asked after every few seconds until it is done, and the video it made is downloaded into the
// session's folder (videos/). A job outlives the tool call that started it: when an agent stops waiting, the
// app keeps asking, saves the video when it comes, and the agent's next call with its id picks it up.
import fs from 'node:fs';
import path from 'node:path';
import type { VideoModel } from '../../shared/media.ts';
import { HEADERS, slug, type Reference } from './openrouter.ts';

/** The app's choice, first one OpenRouter still lists: ByteDance's Seedance 2.5, then cheap, quick ones, all with sound. */
export const PREFERRED_VIDEO = ['bytedance/seedance-2.5', 'google/veo-3.1-lite', 'google/veo-3.1-fast', 'bytedance/seedance-2.0-fast', 'kwaivgi/kling-v3.0-std', 'alibaba/wan-2.7', 'google/veo-3.1'];

const FRAMES = new Set(['first_frame', 'last_frame']);

let cache: { at: number; list: VideoModel[] } | null = null;

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);

/** One model from OpenRouter's /videos/models. */
export function videoModel(m: any): VideoModel {
  const name = String(m.name ?? m.id);
  const durations = (Array.isArray(m.supported_durations) ? m.supported_durations : [])
    .map(Number)
    .filter((n: number) => Number.isFinite(n) && n > 0)
    .sort((a: number, b: number) => a - b);
  const skus: Record<string, string> = {};
  if (m.pricing_skus && typeof m.pricing_skus === 'object') for (const [k, v] of Object.entries(m.pricing_skus)) if (typeof v === 'string' || typeof v === 'number') skus[k] = String(v);
  const resolutions = strings(m.supported_resolutions).sort((a, b) => height(a) - height(b));
  const base: VideoModel = {
    id: String(m.id),
    label: name.replace(/^[^:]+:\s*/, ''),
    org: name.includes(':') ? name.slice(0, name.indexOf(':')).trim() : undefined,
    description: typeof m.description === 'string' ? m.description.replace(/\s+/g, ' ').slice(0, 300) : undefined,
    created: Number(m.created) ? Number(m.created) * 1000 : undefined,
    durations: [...new Set<number>(durations)],
    resolutions,
    aspects: strings(m.supported_aspect_ratios),
    audio: m.generate_audio === true,
    frames: strings(m.supported_frame_images).filter((f) => FRAMES.has(f)) as VideoModel['frames'],
    // It names no lengths and makes nothing from a picture: it works on a video (an edit, an upscale).
    videoIn: !durations.length && !strings(m.supported_frame_images).length,
    skus,
  };
  const all = perSecondPrices(base);
  if (all.length) {
    base.perSecond = Math.min(...all);
    base.perSecondMax = Math.max(...all);
  }
  return base;
}

/** OpenRouter's video models, kept for an hour (the list needs no key). */
export async function videoModels(base: string): Promise<VideoModel[]> {
  if (cache && Date.now() - cache.at < 3600_000) return cache.list;
  const r = await fetch(`${base}/videos/models`, { headers: HEADERS, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`OpenRouter answered ${r.status}`);
  const d: any = await r.json();
  const list = (Array.isArray(d.data) ? d.data : []).filter((m: any) => m?.id).map(videoModel);
  cache = { at: Date.now(), list };
  return list;
}

// ---- prices ---------------------------------------------------------------------------------------------

/** "480p" → 480, "2K" → 1440, "4K" → 2160: to sort and compare resolutions. */
export function height(res: string): number {
  const m = /^(\d+)p$/i.exec(res);
  if (m) return Number(m[1]);
  const k = /^(\d+(?:\.\d+)?)k$/i.exec(res);
  return k ? Math.round(Number(k[1]) * 720) : 0;
}

/** A resolution's width and height at 16:9, for prices by the pixel (video tokens). */
const pixels = (res: string) => {
  const h = height(res) || 720;
  return { w: Math.round((h * 16) / 9), h };
};

interface Sku {
  /** Dollars a second. */
  usd: number;
  res?: string;
  audio?: boolean;
  /** Dollars a video token (ByteDance's Seedance): a second costs width × height × 24 / 1024 tokens. */
  perToken?: boolean;
}

/** OpenRouter's SKUs read as prices a second: by resolution and sound when their names say so. */
export function skusOf(skus: Record<string, string>): Sku[] {
  const out: Sku[] = [];
  for (const [name, raw] of Object.entries(skus)) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) continue;
    const k = name.toLowerCase();
    // Not what a video from words costs: pictures or videos given, continuations, upscales, a minimum, a whole generation.
    if (/image_input|input_image|reference|continuation|megapixel|minimum|with_video_input|^generate$/.test(k)) continue;
    const res = /(?:^|_)(\d{3,4}p|\d(?:\.\d)?k)(?:_|$)/.exec(k)?.[1];
    const audio = /without_audio/.test(k) ? false : /with_audio/.test(k) ? true : undefined;
    const usd = k.includes('cents') ? n / 100 : n;
    if (/^video_tokens/.test(k)) out.push({ usd, res: res && res.toUpperCase().endsWith('K') ? res.toUpperCase() : res, audio, perToken: true });
    else if (/second/.test(k)) out.push({ usd, res: res && res.toUpperCase().endsWith('K') ? res.toUpperCase() : res, audio });
  }
  return out;
}

const tokenSeconds = (res: string) => {
  const p = pixels(res);
  return (p.w * p.h * 24) / 1024;
};

/** What a second costs at a resolution, with or without sound (the closest price OpenRouter lists). */
export function perSecondFor(m: VideoModel, res?: string, audio?: boolean): number | undefined {
  const skus = skusOf(m.skus ?? {});
  if (!skus.length) return undefined;
  const at = res ?? m.resolutions[0] ?? '720p';
  const fits = (s: Sku) => (s.res === undefined || s.res.toLowerCase() === at.toLowerCase()) && (s.audio === undefined || audio === undefined || s.audio === audio);
  // The most particular price that fits: one for this resolution and sound, then either, then the plain one.
  const score = (s: Sku) => (s.res ? 2 : 0) + (s.audio !== undefined ? 1 : 0);
  const best = skus.filter(fits).sort((a, b) => score(b) - score(a))[0] ?? skus.sort((a, b) => a.usd - b.usd)[0];
  return best.perToken ? best.usd * tokenSeconds(best.res ?? at) : best.usd;
}

/** Every price a second the model lists, at each of its resolutions, with sound and without. */
export function perSecondPrices(m: VideoModel): number[] {
  const out = new Set<number>();
  const res = m.resolutions.length ? m.resolutions : [undefined];
  for (const r of res) for (const a of m.audio ? [false, true] : [undefined]) {
    const p = perSecondFor(m, r, a);
    if (p !== undefined && p > 0) out.add(Math.round(p * 10000) / 10000);
  }
  return [...out];
}

// ---- one generation ---------------------------------------------------------------------------------------

export interface VideoAsk {
  model: string;
  prompt: string;
  duration?: number;
  resolution?: string;
  aspect?: string;
  audio?: boolean;
  seed?: number;
  first?: Reference;
  last?: Reference;
  /** Pictures for it to follow (a style, a character), not frames. */
  refs?: Reference[];
  /** A video for it to change (edit and upscale models). */
  video?: { mime: string; data: Buffer };
}

const dataUrl = (mime: string, data: Buffer) => `data:${mime};base64,${data.toString('base64')}`;

/** The request: only the settings given, as OpenRouter names them. */
export function buildVideoRequest(a: VideoAsk): Record<string, unknown> {
  const frames = [
    ...(a.first ? [{ type: 'image_url', image_url: { url: dataUrl(a.first.mime, a.first.data) }, frame_type: 'first_frame' }] : []),
    ...(a.last ? [{ type: 'image_url', image_url: { url: dataUrl(a.last.mime, a.last.data) }, frame_type: 'last_frame' }] : []),
  ];
  const refs = [
    ...(a.video ? [{ type: 'video_url', video_url: { url: dataUrl(a.video.mime, a.video.data) } }] : []),
    ...(a.refs ?? []).map((r) => ({ type: 'image_url', image_url: { url: dataUrl(r.mime, r.data) } })),
  ];
  return {
    model: a.model,
    ...(a.prompt ? { prompt: a.prompt } : {}),
    ...(a.duration ? { duration: Math.round(a.duration) } : {}),
    ...(a.resolution ? { resolution: a.resolution } : {}),
    ...(a.aspect ? { aspect_ratio: a.aspect } : {}),
    ...(typeof a.audio === 'boolean' ? { generate_audio: a.audio } : {}),
    ...(Number.isInteger(a.seed) ? { seed: a.seed } : {}),
    ...(frames.length ? { frame_images: frames } : {}),
    ...(refs.length ? { input_references: refs } : {}),
  };
}

export interface VideoJob {
  id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'expired' | string;
  error?: string;
  urls: string[];
  cost?: number;
}

const jobOf = (j: any): VideoJob => ({
  id: String(j?.id ?? ''),
  status: String(j?.status ?? 'pending'),
  error: typeof j?.error === 'string' ? j.error : (j?.error?.message ?? undefined),
  urls: Array.isArray(j?.unsigned_urls) ? j.unsigned_urls.filter((u: unknown) => typeof u === 'string') : [],
  cost: Number(j?.usage?.cost) > 0 ? Number(j.usage.cost) : undefined,
});

function refusal(status: number, j: any): Error {
  const why = j?.error?.message ?? (typeof j?.error === 'string' ? j.error : `OpenRouter answered ${status}`);
  return new Error(status === 401 ? `OpenRouter did not take the key (${why}). The user can check it in Settings → Models.` : status === 402 ? `The OpenRouter account is out of credits (${why}).` : String(why));
}

/** Sends the job; OpenRouter answers at once with its id. */
export async function submitVideo(base: string, key: string, a: VideoAsk): Promise<VideoJob> {
  const r = await fetch(`${base}/videos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...HEADERS },
    body: JSON.stringify(buildVideoRequest(a)),
    signal: AbortSignal.timeout(120_000),
  });
  const j: any = await r.json().catch(() => null);
  if (!r.ok || !j?.id) throw refusal(r.status, j);
  return jobOf(j);
}

export async function pollVideo(base: string, key: string, id: string): Promise<VideoJob> {
  const r = await fetch(`${base}/videos/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${key}`, ...HEADERS }, signal: AbortSignal.timeout(30_000) });
  const j: any = await r.json().catch(() => null);
  if (!r.ok) throw refusal(r.status, j);
  return jobOf(j);
}

export const DONE = new Set(['completed', 'failed', 'cancelled', 'expired']);

const EXT: Record<string, string> = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };

export interface SavedVideo {
  path: string;
  bytes: number;
}

/** Downloads a finished job's videos into `dir`, never over a file that is there (up to 500 MB each). */
export async function downloadVideos(base: string, key: string, job: VideoJob, dir: string, name: string): Promise<SavedVideo[]> {
  await fs.promises.mkdir(dir, { recursive: true });
  const urls = job.urls.length ? job.urls : [`${base}/videos/${encodeURIComponent(job.id)}/content?index=0`];
  const out: SavedVideo[] = [];
  for (const [i, u] of urls.slice(0, 4).entries()) {
    // Only OpenRouter's own addresses get the key.
    if (!u.startsWith(base.replace(/\/api\/v1$/, ''))) continue;
    const r = await fetch(u, { headers: { Authorization: `Bearer ${key}`, ...HEADERS }, signal: AbortSignal.timeout(300_000) });
    if (!r.ok) throw new Error(`The video could not be downloaded: OpenRouter answered ${r.status}`);
    const type = (r.headers.get('content-type') ?? 'video/mp4').split(';')[0];
    const data = Buffer.from(await r.arrayBuffer());
    if (!data.length) continue;
    if (data.length > 500 * 1024 * 1024) throw new Error('The video is over 500 MB');
    const ext = EXT[type] ?? 'mp4';
    const stem = slug(name, 'video');
    for (let n = 1; n < 1000; n++) {
      const file = path.join(dir, `${urls.length > 1 ? `${stem}-${i + 1}` : stem}${n > 1 ? `-${n}` : ''}.${ext}`);
      try {
        await fs.promises.writeFile(file, data, { flag: 'wx' });
        out.push({ path: file, bytes: data.length });
        break;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      }
    }
  }
  return out;
}

// ---- jobs the app follows ----------------------------------------------------------------------------------

export interface Followed {
  id: string;
  model: string;
  key: string;
  startedAt: number;
  status: string;
  /** Settles with the saved videos (and what they cost), or the job's failure. */
  done: Promise<{ files: SavedVideo[]; cost?: number }>;
}

const followed = new Map<string, Followed>();

/** How often a job is asked after (the tests ask more often). */
export const timing = { pollMs: 5000 };

/** Follows a job until it ends (at most an hour), then saves its videos: whoever waits gets them from `done`. */
export function follow(o: { base: string; key: string; job: VideoJob; model: string; session: string; dir: string; name: string; every?: number }): Followed {
  const had = followed.get(o.job.id);
  if (had) return had;
  const f: Followed = { id: o.job.id, model: o.model, key: o.session, startedAt: Date.now(), status: o.job.status, done: Promise.resolve({ files: [] }) };
  f.done = (async () => {
    let job = o.job;
    const until = Date.now() + 3600_000;
    let misses = 0;
    while (!DONE.has(job.status)) {
      if (Date.now() > until) throw new Error('OpenRouter did not finish the video within an hour');
      await new Promise((res) => setTimeout(res, o.every ?? timing.pollMs));
      try {
        job = await pollVideo(o.base, o.key, job.id);
        f.status = job.status;
        misses = 0;
      } catch (e) {
        // A blip in the network is not the job's end.
        if (++misses >= 6) throw e;
      }
    }
    if (job.status !== 'completed') throw new Error(job.error ? `The video was not made: ${job.error}` : `The video was not made (${job.status})`);
    const files = await downloadVideos(o.base, o.key, job, o.dir, o.name);
    if (!files.length) throw new Error('OpenRouter finished without a video');
    return { files, cost: job.cost };
  })();
  // Kept a while after it ends, for the agent's next call to pick up.
  f.done.then(
    () => setTimeout(() => followed.delete(f.id), 6 * 3600_000).unref?.(),
    () => setTimeout(() => followed.delete(f.id), 3600_000).unref?.(),
  );
  followed.set(f.id, f);
  return f;
}

export const followedJob = (id: string) => followed.get(id);
