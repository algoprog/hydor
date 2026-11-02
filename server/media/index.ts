// The Library's images and videos: what the user keeps of what agents made (or any picture or video on this
// computer), each copied in with a title and a description a model writes for it (caption.ts): from the picture
// itself, or from ten of a video's frames on one picture (frames.ts). The Library page shows them beside the
// pages; agents reach them through the API (app_api), and work from their files (an item's file).
//
// Routes, signed in:
//   GET  /api/media                      every item, newest first
//   POST /api/media                      keeps a file: { path, prompt?, model?, sessionKey? }
//   GET/PATCH/DELETE /api/media/:id      one item; PATCH { title?, description? }
//   POST /api/media/:id/caption          writes its title and description again
//   GET  /api/media/:id/file             the file (?download=1 to save it), in parts for a video player
//   GET  /api/media/:id/still            a still to show it by; GET /api/media/:id/frames a video's frames
//   GET/PUT /api/media/settings          the model that writes titles and descriptions (MediaSettings)
//   GET  /api/media/caption-models?provider=&q=   the models a provider offers for it
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { MediaEvent, MediaItem, MediaKind, MediaSettings } from '../../shared/media.ts';
import { CAPTION_PROVIDERS, type CaptionProvider } from '../../shared/media.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import type { Deps, Feature } from '../features/types.ts';
import { byteRange, resolvePath } from '../files.ts';
import { dimensions, slug } from '../images/openrouter.ts';
import { captionModels, captionSettings, setCaptionChoice, titleFrom, writeCaption } from './caption.ts';
import { frameGrid, hasFfmpeg, probe, still } from './frames.ts';
import { addMedia, deleteMedia, editMedia, filesOf, initMedia, listMedia, mustMedia, savedFrom, setCaption } from './store.ts';

const TYPES: Record<string, { kind: MediaKind; mime: string }> = {
  png: { kind: 'image', mime: 'image/png' },
  jpg: { kind: 'image', mime: 'image/jpeg' },
  jpeg: { kind: 'image', mime: 'image/jpeg' },
  webp: { kind: 'image', mime: 'image/webp' },
  gif: { kind: 'image', mime: 'image/gif' },
  avif: { kind: 'image', mime: 'image/avif' },
  mp4: { kind: 'video', mime: 'video/mp4' },
  m4v: { kind: 'video', mime: 'video/mp4' },
  webm: { kind: 'video', mime: 'video/webm' },
  mov: { kind: 'video', mime: 'video/quicktime' },
};

const MAX_BYTES = 1024 * 1024 * 1024;

const tell = (d: Pick<Deps, 'broadcast'>, data: MediaEvent) => d.broadcast({ t: 'feature', id: 'media', data });

// ---- titles and descriptions, a few at a time --------------------------------------------------------------

let running = 0;
const waiting: (() => Promise<void>)[] = [];

function queue(job: () => Promise<void>) {
  waiting.push(job);
  pump();
}

function pump() {
  while (running < 2 && waiting.length) {
    const job = waiting.shift()!;
    running++;
    job()
      .catch((e) => console.error(`[media] caption: ${(e as Error)?.message ?? e}`))
      .finally(() => {
        running--;
        pump();
      });
  }
}

/** Has its title and description written, and tells the pages. */
function caption(d: Deps, id: string) {
  queue(async () => {
    const m = mustMedia(d.db, id);
    const c = await writeCaption(d.db, d, m);
    // The user may have written their own meanwhile: theirs stays.
    if (mustMedia(d.db, id).caption === 'edited') return;
    const item = setCaption(d.db, id, { title: c.title, description: c.description, caption: c.error ? 'failed' : 'done', error: c.error ?? null, by: c.by ?? null });
    if (item) tell(d, { what: 'media', item });
  });
}

// ---- keeping a file ------------------------------------------------------------------------------------------

export async function keepFile(d: Deps, b: { path?: unknown; prompt?: unknown; model?: unknown; sessionKey?: unknown }): Promise<{ item: MediaItem; existed: boolean }> {
  if (typeof b.path !== 'string' || !b.path.trim()) throw new HttpError(400, 'path: the image or video to keep');
  const file = resolvePath(b.path);
  const st = await fs.promises.stat(file).catch(() => null);
  if (!st?.isFile()) throw new HttpError(404, `No such file: ${file}`);
  const ext = path.extname(file).slice(1).toLowerCase();
  const type = TYPES[ext];
  if (!type) throw new HttpError(400, 'The Library keeps pictures (PNG, JPEG, WebP, GIF, AVIF) and videos (MP4, WebM, MOV)');
  if (st.size > MAX_BYTES) throw new HttpError(413, 'The file is over 1 GB');
  const had = savedFrom(d.db, file, st.size);
  if (had) return { item: had, existed: true };
  const str = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined);
  const prompt = str(b.prompt, 4000);
  let size: { width?: number; height?: number; duration?: number } = {};
  if (type.kind === 'video') {
    const p = await probe(file);
    size = { width: p?.width, height: p?.height, duration: p?.duration };
  } else {
    const head = Buffer.alloc(64 * 1024);
    const fd = await fs.promises.open(file, 'r');
    try {
      await fd.read(head, 0, head.length, 0);
    } finally {
      await fd.close();
    }
    const dim = dimensions(head);
    if (dim) size = { width: dim.w, height: dim.h };
    else {
      const p = await probe(file);
      size = { width: p?.width, height: p?.height };
    }
  }
  const item = await addMedia(d.db, {
    kind: type.kind,
    from: file,
    ext: ext === 'jpeg' ? 'jpg' : ext === 'm4v' ? 'mp4' : ext,
    mime: type.mime,
    bytes: st.size,
    title: titleFrom({ kind: type.kind, prompt, name: path.basename(file) }),
    ...size,
    prompt,
    model: str(b.model, 120),
    sessionKey: str(b.sessionKey, 200),
  });
  // A still to show it by: a tenth of the way into a video; a smaller copy of a large picture.
  const f = filesOf(item);
  if (type.kind === 'video') {
    await still(f.file, f.still, { at: item.duration ? Math.min(item.duration * 0.1, 2) : undefined, width: 720 });
    void frameGrid(f.file, f.frames, { duration: item.duration, width: item.width, height: item.height });
  } else if (st.size > 400 * 1024 || (item.width ?? 0) > 1200) await still(f.file, f.still, { width: 720 });
  tell(d, { what: 'media', item });
  caption(d, item.id);
  return { item, existed: false };
}

// ---- files -----------------------------------------------------------------------------------------------------

async function send(req: FastifyRequest, reply: FastifyReply, file: string, mime: string, download?: string) {
  const st = await fs.promises.stat(file).catch(() => null);
  if (!st?.isFile()) throw new HttpError(404, 'Not found');
  reply.header('Content-Type', download ? 'application/octet-stream' : mime);
  reply.header('Content-Security-Policy', "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'");
  // Each item's files never change: its id is new each time.
  reply.header('Cache-Control', 'private, max-age=604800');
  if (download) reply.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(download)}`);
  reply.header('Accept-Ranges', 'bytes');
  const range = byteRange(req.headers.range, st.size);
  if (range === 'bad') return reply.code(416).header('Content-Range', `bytes */${st.size}`).send();
  if (range !== 'all') {
    reply.code(206).header('Content-Range', `bytes ${range.start}-${range.end}/${st.size}`).header('Content-Length', range.end - range.start + 1);
    return reply.send(fs.createReadStream(file, { start: range.start, end: range.end }));
  }
  reply.header('Content-Length', st.size);
  return reply.send(fs.createReadStream(file));
}

async function settingsOf(db: DB, d: Deps): Promise<MediaSettings> {
  return { captions: await captionSettings(db, d), ffmpeg: await hasFfmpeg() };
}

export const media: Feature = {
  id: 'media',
  routes(d) {
    const { app, db } = d;
    initMedia(db);
    app.get('/api/media', async () => ({ items: listMedia(db) }));
    app.post('/api/media', async (req) => keepFile(d, (req.body ?? {}) as Record<string, unknown>));
    app.get('/api/media/settings', async () => settingsOf(db, d));
    app.put('/api/media/settings', async (req) => {
      const b = (req.body ?? {}) as { captions?: { provider?: unknown; model?: unknown } };
      if (b.captions) setCaptionChoice(db, b.captions);
      return settingsOf(db, d);
    });
    app.get('/api/media/caption-models', async (req) => {
      const q = req.query as Record<string, string>;
      const provider = CAPTION_PROVIDERS.includes(q.provider as CaptionProvider) ? (q.provider as CaptionProvider) : null;
      if (!provider || provider === 'auto') throw new HttpError(400, 'provider: openrouter, claude, ollama, vllm or endpoint');
      return { models: await captionModels(d, provider, String(q.q ?? '')) };
    });
    app.get('/api/media/:id', async (req) => ({ item: mustMedia(db, (req.params as { id: string }).id) }));
    app.patch('/api/media/:id', async (req) => {
      const item = editMedia(db, (req.params as { id: string }).id, (req.body ?? {}) as Record<string, unknown>);
      tell(d, { what: 'media', item });
      return { item };
    });
    app.delete('/api/media/:id', async (req) => {
      const id = (req.params as { id: string }).id;
      await deleteMedia(db, id);
      tell(d, { what: 'media', removed: id });
      return { ok: true };
    });
    app.post('/api/media/:id/caption', async (req) => {
      const m = mustMedia(db, (req.params as { id: string }).id);
      const item = setCaption(db, m.id, { caption: 'pending', error: null })!;
      tell(d, { what: 'media', item });
      caption(d, m.id);
      return { item };
    });
    app.get('/api/media/:id/file', async (req, reply) => {
      const m = mustMedia(db, (req.params as { id: string }).id);
      const download = (req.query as { download?: string }).download === '1' ? `${slug(m.title) || m.kind}${path.extname(m.file)}` : undefined;
      return send(req, reply, m.file, m.mime, download);
    });
    app.get('/api/media/:id/still', async (req, reply) => {
      const m = mustMedia(db, (req.params as { id: string }).id);
      const f = filesOf(m);
      if (fs.existsSync(f.still)) return send(req, reply, f.still, 'image/jpeg');
      if (m.kind === 'image') return send(req, reply, m.file, m.mime);
      throw new HttpError(404, 'No still of this video');
    });
    app.get('/api/media/:id/frames', async (req, reply) => {
      const m = mustMedia(db, (req.params as { id: string }).id);
      if (m.kind !== 'video') throw new HttpError(404, 'Only a video has frames');
      const f = filesOf(m);
      if (!fs.existsSync(f.frames) && !(await frameGrid(f.file, f.frames, { duration: m.duration, width: m.width, height: m.height }))) throw new HttpError(404, 'The frames could not be taken (is ffmpeg on this computer?)');
      return send(req, reply, f.frames, 'image/jpeg');
    });
  },
};
