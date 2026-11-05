// Videos for slides, kept by the app as their pictures are (assets.ts) but as files of their own: a video is large,
// and its player seeks by asking for the part it needs. One from someone's device comes in pieces (so no proxy's limit
// on a request's size stops it), one of an agent's session is copied in. Each is kept once, by the hash of its bytes
// ("naget-video:<sha>" in a deck); the versions of decks that show it are noted with their pictures, and one nothing
// shows any more goes a day after (one just added waits for the deck that will show it).
//
// Served with range requests: to the signed-in app (the editor, the slideshow, the presenter's and the audience's
// windows), and at an address that is its own permission, signed by this server, for what opens without the app's
// sign-in (a deck's own page, its published copies, the conversation's frame).
import crypto from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { VIDEO } from '../../shared/slides.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import type { DB } from '../db.ts';
import { byteRange } from '../files.ts';
import { signWithKey } from '../links.ts';
import { probe, still } from '../media/frames.ts';

/** The largest video kept: a few minutes of a phone's film, and no file PowerPoint would choke on. */
export const MAX_VIDEO = 200 * 1024 * 1024;
/** The pieces a video comes in from a browser (the app's own uploads use the same, well under Cloudflare's 100 MB). */
export const VIDEO_CHUNK = 32 * 1024 * 1024;

const dir = () => path.join(config.dataDir, 'page-videos');

export function initVideos(db: DB) {
  db.exec('create table if not exists page_videos (sha text primary key, mime text not null, ext text not null, bytes integer not null, created_at integer not null)');
}

/** ISO media brands that are pictures or sound, not films (HEIC and AVIF pictures, M4A sound). */
const NOT_FILMS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1', 'avif', 'avis', 'M4A ', 'M4B ', 'M4P ', 'F4A ', 'F4B ']);

/** What kind of video the bytes start as: MP4 (M4V too), QuickTime (.mov) or WebM; null for anything else. */
export function videoType(head: Buffer): { mime: string; ext: string } | null {
  if (head.length >= 12 && head.toString('latin1', 4, 8) === 'ftyp') {
    const brand = head.toString('latin1', 8, 12);
    if (NOT_FILMS.has(brand)) return null;
    return brand === 'qt  ' ? { mime: 'video/quicktime', ext: 'mov' } : { mime: 'video/mp4', ext: 'mp4' };
  }
  // Matroska's header; a WebM file says so in it (another Matroska file is not one browsers play).
  if (head.length >= 4 && head.readUInt32BE(0) === 0x1a45dfa3 && head.subarray(0, 64).includes('webm')) return { mime: 'video/webm', ext: 'webm' };
  return null;
}

const MIMES: Record<string, string> = { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' };

/** A kept video by its sha: its file, kind and size; null when there is none (or its file is gone). */
export function getVideo(db: DB, sha: string): { file: string; mime: string; ext: string; bytes: number } | null {
  if (!/^[a-f0-9]{16,64}$/.test(sha)) return null;
  const r = db.prepare('select ext, bytes from page_videos where sha = ?').get(sha) as { ext: string; bytes: number } | undefined;
  if (!r) return null;
  const file = path.join(dir(), `${sha}.${r.ext}`);
  return fs.existsSync(file) ? { file, mime: MIMES[r.ext] ?? 'video/mp4', ext: r.ext, bytes: r.bytes } : null;
}

/** A kept video named as a deck names it ("naget-video:<sha>"), or null. */
export const videoOf = (db: DB, src: string) => (src.startsWith(VIDEO) ? getVideo(db, src.slice(VIDEO.length)) : null);

/** A kept video's bytes for a file it goes into whole (PowerPoint's), with its kind; null when it is not kept. */
export function videoFileFor(db: DB, src: string): { data: Buffer; ext: string; mime: string } | null {
  const v = videoOf(db, src);
  return v ? { data: fs.readFileSync(v.file), ext: v.ext, mime: v.mime } : null;
}

/** How large a video may be to go inside a deck's web page (a file on its own): larger ones show their still there. */
export const VIDEO_INSIDE = 40 * 1024 * 1024;

/** A kept video as a data: address, to put inside a page, when it is no larger than `max`; null otherwise. */
export function videoDataUrl(db: DB, src: string, max = VIDEO_INSIDE): string | null {
  const v = videoOf(db, src);
  return v && v.bytes <= max ? `data:${v.mime};base64,${fs.readFileSync(v.file).toString('base64')}` : null;
}

async function hashFile(file: string): Promise<string> {
  const h = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(file), h);
  return h.digest('hex').slice(0, 40);
}

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

/** A whole video file (an upload's, or a copy) kept by its hash: moved into the store, noted as just added. */
async function keep(db: DB, file: string, bytes: number, move: boolean): Promise<{ src: string; mime: string; bytes: number }> {
  const type = videoType(await headOf(file));
  if (!type) {
    if (move) await fs.promises.rm(file, { force: true });
    throw new HttpError(415, 'That is not a video this app keeps: an MP4, MOV or WebM file');
  }
  const sha = await hashFile(file);
  const to = path.join(dir(), `${sha}.${type.ext}`);
  if (fs.existsSync(to)) {
    if (move) await fs.promises.rm(file, { force: true });
  } else if (move) await fs.promises.rename(file, to);
  else await fs.promises.copyFile(file, to);
  db.prepare('insert into page_videos (sha, mime, ext, bytes, created_at) values (?, ?, ?, ?, ?) on conflict(sha) do update set created_at = excluded.created_at').run(sha, type.mime, type.ext, bytes, Date.now());
  return { src: VIDEO + sha, mime: type.mime, bytes };
}

/** How far past what a piece may carry its bytes are still read (and let go) before it is refused; much more, and it is cut. */
const LET_GO = 8 * 1024 * 1024;

/**
 * A piece refused before its bytes were read: they are read and let go first, so the refusal reaches the page. A browser
 * still sending a piece the server stopped reading sees only a broken connection, never the answer.
 */
async function refuse(body: Readable, e: HttpError): Promise<never> {
  let n = 0;
  try {
    for await (const chunk of body as AsyncIterable<Buffer>) {
      n += chunk.length;
      if (n > VIDEO_CHUNK + LET_GO) break;
    }
  } catch {}
  throw e;
}

/**
 * A piece of a video sent from a browser, at `offset` of `total` bytes, under the upload's own id: added to what came
 * before; the last gives the kept video's source. Pieces come in order, each at most VIDEO_CHUNK.
 */
export async function takeVideoPiece(db: DB, body: Readable, q: { upload?: unknown; offset?: unknown; total?: unknown }): Promise<{ received: number } | { src: string; mime: string; bytes: number }> {
  const id = typeof q.upload === 'string' && /^[a-z0-9]{8,40}$/.test(q.upload) ? q.upload : null;
  const offset = Number(q.offset);
  const total = Number(q.total);
  if (!id || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(total) || total <= 0 || offset >= total) return refuse(body, new HttpError(400, 'Send upload (its id), offset and total with each piece'));
  if (total > MAX_VIDEO) return refuse(body, new HttpError(413, `That video is over ${MAX_VIDEO / 1024 / 1024} MB`));
  await fs.promises.mkdir(dir(), { recursive: true });
  const part = path.join(dir(), `${id}.part`);
  if (offset === 0) await fs.promises.writeFile(part, '');
  else {
    const have = (await fs.promises.stat(part).catch(() => null))?.size;
    if (have !== offset) return refuse(body, new HttpError(409, `The upload is out of step (${have ?? 0} bytes came before this piece)`));
  }
  // Counted as it comes: a piece no larger than a piece, the whole no larger than it said. What comes past that is read
  // and let go a little way, so the refusal reaches the page rather than a broken connection; much more, and it is cut.
  let got = offset;
  const limit = Math.min(total, offset + VIDEO_CHUNK);
  const out = fs.createWriteStream(part, { flags: 'a' });
  let failed: Error | null = null;
  out.on('error', (e) => void (failed ??= e));
  try {
    for await (const chunk of body as AsyncIterable<Buffer>) {
      got += chunk.length;
      if (got > limit) {
        if (got > limit + LET_GO) break;
        continue;
      }
      if (failed) break;
      if (!out.write(chunk)) await once(out, 'drain');
    }
  } catch (e) {
    failed ??= e as Error;
  }
  await new Promise<void>((r) => (failed ? (out.destroy(), r()) : out.end((e?: Error | null) => (e && (failed ??= e), r()))));
  if (failed || got > limit) {
    await fs.promises.rm(part, { force: true });
    if (failed) throw failed instanceof HttpError ? failed : new HttpError(499, `The upload was cut: ${(failed as Error).message}`);
    throw new HttpError(413, 'That piece is larger than the upload said');
  }
  if (got < total) return { received: got };
  return keep(db, part, total, true);
}

/** A path an agent gave: from its session's folder, from home (~), or absolute. */
const fromSession = (cwd: string | undefined, p: string) => (p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : path.resolve(cwd || config.defaultCwd, p));

/**
 * A video file of an agent's session, kept: its source, and its first frame as a picture's bytes with its size when
 * this computer has ffmpeg (else none: the slide shows it dark until it plays).
 */
export async function keepVideoFile(db: DB, p: string, cwd: string): Promise<{ src: string; frame?: Buffer; w?: number; h?: number }> {
  const file = fromSession(cwd, p);
  const st = await fs.promises.stat(file).catch(() => null);
  if (!st?.isFile()) throw new Error('no such file');
  if (st.size > MAX_VIDEO) throw new Error(`it is over ${MAX_VIDEO / 1024 / 1024} MB`);
  await fs.promises.mkdir(dir(), { recursive: true });
  const kept = await keep(db, file, st.size, false).catch((e: Error) => {
    throw new Error(e.message.replace(/^That is not/, 'it is not'));
  });
  const v = getVideo(db, kept.src.slice(VIDEO.length));
  if (!v) return { src: kept.src };
  const out = path.join(dir(), `${kept.src.slice(VIDEO.length)}.still.jpg`);
  try {
    const [size, ok] = await Promise.all([probe(v.file), still(v.file, out, { width: 1280 })]);
    const frame = ok ? await fs.promises.readFile(out) : undefined;
    return { src: kept.src, frame, w: size?.width, h: size?.height };
  } finally {
    await fs.promises.rm(out, { force: true });
  }
}

/** The address of a kept video that is its own permission (no sign-in): for pages that open without the app's. */
export const videoAddress = (sha: string) => `/pg/video/${sha}/${signWithKey(`page-video:${sha}`).slice(0, 32)}`;

/** Whether a video's address carries this server's signature of it. */
export function videoAddressOk(sha: string, sig: string): boolean {
  const want = signWithKey(`page-video:${sha}`).slice(0, 32);
  return /^[a-f0-9]{16,64}$/.test(sha) && want.length === sig.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig));
}

/** A kept video as a reply: the part a range asks for (a player seeks so), or all of it. */
export async function sendVideo(req: FastifyRequest, reply: FastifyReply, v: { file: string; mime: string } | null) {
  if (!v) return reply.code(404).send({ error: 'No such video' });
  const st = await fs.promises.stat(v.file).catch(() => null);
  if (!st?.isFile()) return reply.code(404).send({ error: 'No such video' });
  // A kept video of its own address is the same video for ever.
  reply.header('Cache-Control', 'private, max-age=31536000, immutable').header('Content-Security-Policy', "default-src 'none'; sandbox").header('Accept-Ranges', 'bytes').type(v.mime);
  const range = byteRange(req.headers.range, st.size);
  if (range === 'bad') return reply.code(416).header('Content-Range', `bytes */${st.size}`).send();
  if (range !== 'all') {
    reply
      .code(206)
      .header('Content-Range', `bytes ${range.start}-${range.end}/${st.size}`)
      .header('Content-Length', range.end - range.start + 1);
    return reply.send(fs.createReadStream(v.file, { start: range.start, end: range.end }));
  }
  return reply.header('Content-Length', st.size).send(fs.createReadStream(v.file));
}

/** Videos no version of a deck shows, a day after they were added, go; so do uploads left unfinished a day. */
export function sweepVideos(db: DB) {
  const old = Date.now() - 86_400_000;
  const gone = db.prepare('select sha, ext from page_videos where created_at < ? and not exists (select 1 from page_asset_refs r where r.sha = page_videos.sha)').all(old) as { sha: string; ext: string }[];
  const del = db.prepare('delete from page_videos where sha = ?');
  for (const v of gone) {
    fs.rmSync(path.join(dir(), `${v.sha}.${v.ext}`), { force: true });
    del.run(v.sha);
  }
  try {
    for (const n of fs.readdirSync(dir())) if (n.endsWith('.part') && fs.statSync(path.join(dir(), n)).mtimeMs < old) fs.rmSync(path.join(dir(), n), { force: true });
  } catch {}
}
