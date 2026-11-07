// A picture, video or sound of the Library shared alone, as its person's link reads and changes it (portal.ts does the
// rest of a link: its project's or its page's things, the editors' pictures). They see it, play it and download it,
// and comment on a spot of a picture or a moment of a video or a sound, under their name. With Edit, the picture, video
// or sound editor opens in their browser and saves over it (the file it had kept as an earlier version), as the owner's
// editors do; but an edit reads nothing but this item and what they add from their own device (never a file, another
// item or a web address of the owner's), its result goes nowhere but over this item, and the AI tools, the captions
// and the words read aloud (which spend the owner's money or their computer's time) are not theirs to use.
//
//   GET  /p-api/:token/media/:id                the item, its comments, and whether its editor opens
//   GET  /p-api/:token/media/:id/file           its file, in parts for a player (?download=1 to save it); …/still a still
//   POST /p-api/:token/media/:id/comments       { ops } (shared/media-comments.ts): theirs under their name
//   POST /p-api/:token/mediaedit/image          the picture editor's save, over the item
//   GET  /p-api/:token/mediaedit/video/(info|strip|peaks|encoders), POST …/video/peak, POST/GET …/video/sound(/:sha),
//   POST /p-api/:token/pages/videos, POST …/mediaedit/video, GET/DELETE …/mediaedit/video/:job      the video editor's calls
//   GET  /p-api/:token/mediaedit/audio/(info|source), POST/GET …/audio/sounds(/:sha), POST …/mediaedit/audio,
//   GET/DELETE …/mediaedit/audio/:job                                                               the sound editor's calls
import fs from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { MediaItem } from '../../shared/media.ts';
import type { PortalMediaView } from '../../shared/share.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { changeMediaComments, mediaComments } from '../media/comments.ts';
import { hasFfmpeg, NO_FFMPEG } from '../media/frames.ts';
import { send } from '../media/index.ts';
import { filesOf, getMedia } from '../media/store.ts';
import { browserCopy, BROWSER_READS, keptKind, MIMES, NO_FFMPEG_SOUND, prepareSound, sendFile, soundFactsOf, soundJob, soundOf, startSoundEdit, stopSoundEdit } from '../mediaedit/audio.ts';
import { keepSoundStream, keptSoundFile, keptSoundSha } from '../mediaedit/audio-store.ts';
import { MAX_PICTURE, saveEdited } from '../mediaedit/index.ts';
import { encodersOf, keepSound, peaksOf, prepare, SOUND_MIME, soundPeak, sourceOf, sourcesNamed, startVideoEdit, stopVideoEdit, videoInfo, videoJob, videoStrip } from '../mediaedit/video.ts';
import { ffmpegTools } from '../media/frames.ts';
import { sendVideo, takeVideoPiece } from '../pages/videos.ts';
import { slug } from '../images/openrouter.ts';
import { forPerson, noteActivity, ownerName } from './share.ts';
import { mediaView, personOf, rememberUpload, take, tellOwner, uploadedBy, type Person } from './portal.ts';

const P = (req: FastifyRequest) => req.params as Record<string, string>;
const quiet = (reply: FastifyReply) => reply.header('Cache-Control', 'no-store').header('X-Robots-Tag', 'noindex, nofollow');

/** The picture, video or sound the person's link opens, as it is now; nothing else. */
function itemOf(db: DB, p: Person, id: unknown): MediaItem {
  const m = p.scope.kind === 'media' && id === p.scope.media.id ? getMedia(db, p.scope.media.id) : null;
  if (!m) throw new HttpError(404, 'This link does not open that');
  return m;
}

/** The item the link opens, for its editor: Edit, and the kind of editor that is asked. */
function editable(db: DB, p: Person, kind?: MediaItem['kind']): MediaItem {
  if (p.scope.kind !== 'media') throw new HttpError(404, 'This link does not open that');
  if (p.share.role !== 'edit') throw new HttpError(403, 'This link lets you see it and comment, not change it');
  const m = getMedia(db, p.scope.media.id);
  if (!m) throw new HttpError(410, 'This is no longer shared: it was deleted.');
  if (kind && m.kind !== kind) throw new HttpError(404, 'This link does not open that');
  return m;
}

const MEDIA_SRC = /^(?:media:|\/api\/media\/)([a-f0-9]{10})(?:\/file)?(?:[?#].*)?$/;
const KEPT_SRC = /^(?:naget-video:|\/api\/pages\/videos\/|naget-asset:|\/api\/pages\/assets\/|naget-sound:|\/api\/mediaedit\/video\/sound\/|\/api\/mediaedit\/audio\/sounds\/)([a-f0-9]{16,64})(?:[?#].*)?$/;

/** Whether an edit may read this source: the item the link opens, or something the person added from their device. */
function theirs(p: Person, m: MediaItem, src: unknown): boolean {
  const s = typeof src === 'string' ? src.trim() : '';
  const own = MEDIA_SRC.exec(s);
  if (own) return own[1] === m.id;
  const kept = KEPT_SRC.exec(s);
  return !!kept && uploadedBy(p.share.id, kept[1]);
}

function mustBeTheirs(p: Person, m: MediaItem, srcs: unknown[]) {
  for (const s of srcs) if (!theirs(p, m, s)) throw new HttpError(403, 'An edit through a link uses this item and what you add from your device: nothing else');
}

/** Every source a sound edit's recipe names (its tracks' clips). */
function soundSources(recipe: unknown): string[] {
  const out: string[] = [];
  const r = (recipe && typeof recipe === 'object' ? recipe : {}) as { tracks?: unknown };
  for (const t of Array.isArray(r.tracks) ? r.tracks : []) for (const c of Array.isArray((t as { clips?: unknown })?.clips) ? (t as { clips: unknown[] }).clips : []) {
    const src = (c as { src?: unknown })?.src;
    if (typeof src === 'string' && src.trim()) out.push(src.trim());
  }
  return out;
}

export function portalMediaRoutes(d: Deps) {
  const { app, db } = d;
  const person = (req: FastifyRequest, write = false) => personOf(db, req, write);
  const body = (req: FastifyRequest) => (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  /** The edits each person started, which alone they may follow or stop. */
  const started = new Map<string, string>();
  const ownJob = (p: Person, job: string) => {
    if (started.get(job) !== p.share.id) throw new HttpError(404, 'No such edit');
    return job;
  };
  const remember = (job: string, p: Person) => {
    started.set(job, p.share.id);
    if (started.size > 2000) started.delete(started.keys().next().value!);
  };

  app.get('/p-api/:token/media/:id', async (req, reply): Promise<PortalMediaView> => {
    const p = person(req);
    quiet(reply);
    const m = itemOf(db, p, P(req).id);
    const read = p.share.activity;
    if (!read || read.page !== m.id || Date.now() - read.at > 10 * 60_000) noteActivity(db, p.share.id, 'read', m);
    const edits = p.share.role === 'edit' && (m.kind === 'image' || (await hasFfmpeg()));
    return { item: mediaView(m), comments: forPerson(mediaComments(db, m.id), ownerName(db)), editable: edits };
  });

  app.get('/p-api/:token/media/:id/file', async (req, reply) => {
    const p = person(req);
    const m = itemOf(db, p, P(req).id);
    const download = (req.query as { download?: string }).download === '1' ? `${slug(m.title) || m.kind}${path.extname(m.file)}` : undefined;
    reply.header('X-Robots-Tag', 'noindex, nofollow');
    return send(req, reply, m.file, m.mime, download);
  });

  app.get('/p-api/:token/media/:id/still', async (req, reply) => {
    const p = person(req);
    const m = itemOf(db, p, P(req).id);
    const f = filesOf(m);
    if (fs.existsSync(f.still)) return send(req, reply, f.still, 'image/jpeg');
    if (m.kind === 'image') return send(req, reply, m.file, m.mime);
    throw new HttpError(404, m.kind === 'audio' ? 'A sound has no still' : 'No still of this video');
  });

  app.post('/p-api/:token/media/:id/comments', { bodyLimit: 64 * 1024 }, async (req, reply) => {
    const p = person(req, true);
    quiet(reply);
    const m = itemOf(db, p, P(req).id);
    take(p, 'comment', 200, 'That is a lot of comments in an hour.');
    const ops = body(req).ops;
    if (!Array.isArray(ops) || !ops.length || ops.length > 20) throw new HttpError(400, 'ops: the changes, as a list');
    const r = changeMediaComments(db, m.id, ops, { name: p.share.name, who: p.share.id });
    // What could not be done (another's comment to delete or change), when nothing else was.
    if (r.notes.length && !r.added.length && !r.replied.length) throw new HttpError(403, r.notes[0].replace(/^Comment \S+ is /, 'That comment is '));
    const on = { id: `media:${m.id}`, title: m.title };
    for (const cid of r.added) tellOwner(d, on, p.who, { cid, text: r.list.find((c) => c.id === cid)?.text ?? '' });
    for (const x of r.replied) tellOwner(d, on, p.who, { cid: x.id, parent: x.parent, text: r.list.find((c) => c.id === x.parent)?.replies?.find((y) => y.id === x.id)?.text ?? '' });
    if (r.added.length || r.replied.length) noteActivity(db, p.share.id, r.replied.length && !r.added.length ? 'reply' : 'comment', m);
    d.broadcast({ t: 'feature', id: 'media', data: { what: 'comments', id: m.id } });
    d.broadcast({ t: 'feature', id: 'sharing', data: { activity: true } });
    return { comments: forPerson(r.list, ownerName(db)) };
  });

  // ---- the picture editor ----

  app.post('/p-api/:token/mediaedit/image', { bodyLimit: Math.ceil(MAX_PICTURE * 1.37) + 65536 }, async (req, reply) => {
    const p = person(req, true);
    quiet(reply);
    const m = editable(db, p, 'image');
    take(p, 'save', 60, 'That is a lot of saves in an hour.');
    const b = body(req);
    const to = (b.to && typeof b.to === 'object' ? b.to : {}) as Record<string, unknown>;
    if (to.media !== m.id || to.as !== 'replace') throw new HttpError(403, 'Through a link, the picture is saved over itself');
    const out = await saveEdited(d, { data: b.data, format: b.format, quality: b.quality, to: { media: m.id, as: 'replace' } }, p.share.name);
    noteActivity(db, p.share.id, 'edit', m);
    d.broadcast({ t: 'feature', id: 'sharing', data: { activity: true } });
    // What the owner's own editor is told, without where it is kept on their computer.
    const { item: _i, path: _p, ...rest } = out;
    return rest;
  });

  // ---- what the video and sound editors read ----

  /** A source the editor asks about by its src: the item, or something the person added. */
  const readable = (req: FastifyRequest, kind: MediaItem['kind'], src: unknown) => {
    const p = person(req);
    const m = editable(db, p, kind);
    mustBeTheirs(p, m, [src]);
    return p;
  };

  app.get('/p-api/:token/mediaedit/video/info', async (req, reply) => {
    quiet(reply);
    const q = req.query as Record<string, string>;
    const p = readable(req, 'video', q.src);
    take(p, 'read', 2000, 'That is a lot in an hour.');
    return videoInfo(db, q.src);
  });
  app.get('/p-api/:token/mediaedit/video/strip', async (req, reply) => {
    const q = req.query as Record<string, string>;
    const p = readable(req, 'video', q.src);
    take(p, 'strip', 600, 'That is a lot in an hour.');
    const file = await videoStrip(db, q);
    if (!file) throw new HttpError(400, NO_FFMPEG);
    reply.header('Content-Type', 'image/jpeg').header('Cache-Control', 'private, max-age=3600');
    return reply.send(fs.createReadStream(file));
  });
  app.get('/p-api/:token/mediaedit/video/peaks', async (req, reply) => {
    quiet(reply);
    const q = req.query as Record<string, string>;
    const p = readable(req, 'video', q.src);
    take(p, 'peaks', 600, 'That is a lot in an hour.');
    const s = await sourceOf(db, q.src, { kinds: ['video', 'sound'] });
    return { peaks: await peaksOf(s.file, Math.max(16, Math.min(4000, Math.round(Number(q.n) || 400)))) };
  });
  app.post('/p-api/:token/mediaedit/video/peak', async (req, reply) => {
    quiet(reply);
    const b = body(req);
    const p = readable(req, 'video', b.src);
    take(p, 'peaks', 600, 'That is a lot in an hour.');
    return soundPeak(db, b);
  });
  app.get('/p-api/:token/mediaedit/video/encoders', async (req, reply) => {
    quiet(reply);
    editable(db, person(req), 'video');
    const tools = await ffmpegTools();
    const e = tools ? await encodersOf(tools.ffmpeg) : {};
    // Which encoders there are; never the owner's graphics card (videos made through a link are made on the processor).
    return { ffmpeg: !!tools, h264: !!e.h264, h265: !!e.h265, av1: !!e.av1, webm: !!(e.vp9 ?? e.vp8), gpu: { mode: 'off', checked: true, found: null } };
  });

  // ---- what they add from their device: a video, a sound (pictures go to …/pages/assets) ----

  app.post('/p-api/:token/pages/videos', async (req, reply) => {
    const p = person(req, true);
    quiet(reply);
    if (p.share.role !== 'edit') throw new HttpError(403, 'This link lets you see it and comment, not change it');
    const b = req.body as Readable | undefined;
    if (!b || typeof b.pipe !== 'function') throw new HttpError(400, 'Send the video’s bytes (application/octet-stream), a piece at a time');
    const q = req.query as Record<string, string>;
    if (q.offset === '0') take(p, 'video', 30, 'That is a lot of videos in an hour.');
    const got = (await takeVideoPiece(db, b, q)) as { src?: string };
    const sha = got.src ? /^naget-video:([a-f0-9]{16,64})$/.exec(got.src)?.[1] : undefined;
    if (sha) rememberUpload(p.share.id, sha);
    return got;
  });
  app.post('/p-api/:token/mediaedit/video/sound', async (req, reply) => {
    const p = person(req, true);
    quiet(reply);
    editable(db, p, 'video');
    const b = req.body as Readable | undefined;
    if (!b || typeof b.pipe !== 'function') throw new HttpError(400, 'Send the sound’s bytes (application/octet-stream)');
    if (!(await ffmpegTools())) throw new HttpError(400, NO_FFMPEG);
    take(p, 'sound', 60, 'That is a lot of sounds in an hour.');
    const kept = await keepSound(b);
    const sha = keptSoundSha(kept.src);
    if (sha) rememberUpload(p.share.id, sha);
    return kept;
  });
  app.get('/p-api/:token/mediaedit/video/sound/:sha', async (req, reply) => {
    const p = person(req);
    const sha = String(P(req).sha ?? '');
    const ok = /^[a-f0-9]{16,64}$/.test(sha) && uploadedBy(p.share.id, sha);
    const s = ok ? await sourceOf(db, `naget-sound:${sha}`, { kinds: ['sound'] }).catch(() => null) : null;
    return sendVideo(req, reply, s ? { file: s.file, mime: SOUND_MIME[path.extname(s.file).slice(1)] ?? 'application/octet-stream' } : null);
  });

  // ---- a video made: over the item, never elsewhere ----

  app.post('/p-api/:token/mediaedit/video', { bodyLimit: 40 * 1024 * 1024 }, async (req, reply) => {
    const p = person(req, true);
    quiet(reply);
    const m = editable(db, p, 'video');
    const b = body(req);
    const to = (b.to && typeof b.to === 'object' ? b.to : {}) as Record<string, unknown>;
    if (to.media !== m.id || to.as !== 'replace' || b.frame !== undefined) throw new HttpError(403, 'Through a link, the video is saved over itself');
    mustBeTheirs(p, m, [b.src, ...sourcesNamed(b.recipe).keys()]);
    take(p, 'make', 30, 'That is a lot of videos made in an hour.');
    const prep = await prepare(d, { ...b, encoder: 'cpu' } as Parameters<typeof prepare>[1], { to: { media: m.id, as: 'replace' } });
    prep.who = p.share.name;
    const job = startVideoEdit(prep);
    remember(job.job, p);
    noteActivity(db, p.share.id, 'edit', m);
    return job;
  });
  app.get('/p-api/:token/mediaedit/video/:job', async (req, reply) => {
    quiet(reply);
    const v = videoJob(ownJob(person(req), String(P(req).job ?? '')));
    if (!v) throw new HttpError(404, 'No such edit: it ended over an hour ago, or the app started again since');
    return v;
  });
  app.delete('/p-api/:token/mediaedit/video/:job', async (req, reply) => {
    quiet(reply);
    const v = stopVideoEdit(ownJob(person(req, true), String(P(req).job ?? '')));
    if (!v) throw new HttpError(404, 'No such edit');
    return v;
  });

  // ---- the sound editor ----

  app.get('/p-api/:token/mediaedit/audio/info', async (req, reply) => {
    quiet(reply);
    const q = req.query as Record<string, string>;
    const p = readable(req, 'audio', q.src);
    take(p, 'read', 2000, 'That is a lot in an hour.');
    if (!(await ffmpegTools())) return { ffmpeg: false, why: NO_FFMPEG_SOUND };
    const s = await soundOf(db, q.src);
    return { ffmpeg: true, duration: s.duration, rate: s.rate, channels: s.channels, codec: s.codec, format: keptKind(s.file), video: s.video, bytes: s.bytes, name: s.name };
  });
  app.get('/p-api/:token/mediaedit/audio/source', async (req, reply) => {
    const q = req.query as Record<string, string>;
    const p = readable(req, 'audio', q.src);
    take(p, 'read', 2000, 'That is a lot in an hour.');
    const s = await soundOf(db, q.src);
    const ext = path.extname(s.file).slice(1).toLowerCase();
    if (q.as !== 'm4a' && !s.video && BROWSER_READS.has(ext)) return sendFile(req, reply, s.file, MIMES[ext] ?? 'application/octet-stream');
    return sendFile(req, reply, await browserCopy(s), 'audio/mp4');
  });
  app.post('/p-api/:token/mediaedit/audio/sounds', async (req, reply) => {
    const p = person(req, true);
    quiet(reply);
    editable(db, p, 'audio');
    take(p, 'sound', 60, 'That is a lot of sounds in an hour.');
    const kept = await keepSoundStream(req.body as Readable | undefined);
    const sha = keptSoundSha(kept.src);
    if (sha) rememberUpload(p.share.id, sha);
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
  app.get('/p-api/:token/mediaedit/audio/sounds/:sha', async (req, reply) => {
    const p = person(req);
    const sha = String(P(req).sha ?? '');
    const file = keptSoundSha(`naget-sound:${sha}`) && uploadedBy(p.share.id, sha) ? keptSoundFile(sha) : null;
    const ext = file ? path.extname(file).slice(1) : '';
    return sendVideo(req, reply, file ? { file, mime: MIMES[ext] ?? (ext === 'mp4' ? 'audio/mp4' : 'application/octet-stream') } : null);
  });
  app.post('/p-api/:token/mediaedit/audio', { bodyLimit: 8 * 1024 * 1024 }, async (req, reply) => {
    const p = person(req, true);
    quiet(reply);
    const m = editable(db, p, 'audio');
    const b = body(req);
    const to = (b.to && typeof b.to === 'object' ? b.to : {}) as Record<string, unknown>;
    if (to.media !== m.id || to.as !== 'replace') throw new HttpError(403, 'Through a link, the sound is saved over itself');
    mustBeTheirs(p, m, [b.src, ...soundSources(b.recipe)]);
    take(p, 'make', 30, 'That is a lot of sounds made in an hour.');
    const prep = await prepareSound(d, b as Parameters<typeof prepareSound>[1], { to: { media: m.id, as: 'replace' } });
    prep.who = p.share.name;
    const job = startSoundEdit(prep);
    remember(job.job, p);
    noteActivity(db, p.share.id, 'edit', m);
    return job;
  });
  app.get('/p-api/:token/mediaedit/audio/:job', async (req, reply) => {
    quiet(reply);
    const v = soundJob(ownJob(person(req), String(P(req).job ?? '')));
    if (!v) throw new HttpError(404, 'No such edit: it ended over an hour ago, or the app started again since');
    return v;
  });
  app.delete('/p-api/:token/mediaedit/audio/:job', async (req, reply) => {
    quiet(reply);
    const v = stopSoundEdit(ownJob(person(req, true), String(P(req).job ?? '')));
    if (!v) throw new HttpError(404, 'No such edit');
    return v;
  });
}
