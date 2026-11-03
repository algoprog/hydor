// The files apps show (shared/app-media.ts): the pictures, videos, sounds and other files their runs hand in (a
// photo an agent found on this computer, a chart a program drew, a picture made as a data: address) and the files
// that come with an app (its assets, packed in its .naget-app). Each is kept once, by the hash of its bytes, under
// the data folder, and noted for what shows it ("run:<id>", "app:<id>"); a file nothing shows any more goes a day
// later.
//
// They are served at /app-media/<sha>/<name>, outside /api: a view draws in a sandboxed frame, which cannot send the
// sign-in, and a public page's visitors have none. Nobody can guess an address (160 bits of the file's hash), and
// what is served can never run on the app's own address: a sandbox policy goes with every file, and anything but a
// picture, video, sound or PDF downloads instead of opening.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { AnswerField } from '../../shared/apps.ts';
import { ASSET_NAME, isAssetRef, isDataMedia, isWeb, MEDIA_LIMITS, MEDIA_PATH, mediaKind, mimeOfName, type AppAsset, type MediaItem } from '../../shared/app-media.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import type { DB } from '../db.ts';
import { byteRange } from '../files.ts';
import { fetchPage } from '../web/fetch.ts';

let made = new WeakSet<DB>();

export function mediaTables(db: DB) {
  if (made.has(db)) return;
  db.exec(`
    create table if not exists app_media (
      sha text primary key,
      mime text not null,
      bytes integer not null,
      name text not null,
      created_at integer not null
    );
    create table if not exists app_media_refs (
      owner text not null,
      sha text not null,
      primary key (owner, sha)
    );
    create index if not exists app_media_refs_sha on app_media_refs(sha);
  `);
  made.add(db);
}

/** For tests: forget which databases have the tables. */
export const resetMediaTables = () => void (made = new WeakSet<DB>());

const dir = () => path.join(config.dataDir, 'app-media');
const fileOf = (sha: string) => path.join(dir(), sha.slice(0, 2), sha);

export interface MediaRow {
  sha: string;
  mime: string;
  bytes: number;
  name: string;
}

/** A kept file's name as its address ends: its own, made safe. */
export const safeMediaName = (n: string) =>
  path
    .basename(String(n || 'file'))
    .replace(/[^\w.\- ()]+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 120) || 'file';

/** Where a kept file shows from. */
export const mediaPath = (m: Pick<MediaRow, 'sha' | 'name'>) => `/app-media/${m.sha}/${encodeURIComponent(m.name)}`;

/** What kind of file the first bytes say it is; else what its name says. */
export function sniffMime(head: Buffer, name: string): string {
  const at = (s: string, i = 0) => head.length >= i + s.length && head.toString('latin1', i, i + s.length) === s;
  if (head.length > 8 && head.readUInt32BE(0) === 0x89504e47) return 'image/png';
  if (head.length > 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (at('GIF8')) return 'image/gif';
  if (at('RIFF') && at('WEBP', 8)) return 'image/webp';
  if (at('RIFF') && at('WAVE', 8)) return 'audio/wav';
  if (at('ftyp', 4)) {
    const brand = head.toString('latin1', 8, 12);
    if (/^(avif|avis)$/.test(brand)) return 'image/avif';
    if (/^(heic|heix|mif1|msf1)$/.test(brand)) return 'image/heic';
    if (brand === 'qt  ') return 'video/quicktime';
    if (/^M4A /.test(brand)) return 'audio/mp4';
    return 'video/mp4';
  }
  if (head.length > 4 && head.readUInt32BE(0) === 0x1a45dfa3) return /\.mkv$/i.test(name) ? 'video/x-matroska' : 'video/webm';
  if (at('OggS')) return /\.(ogv)$/i.test(name) ? 'video/ogg' : 'audio/ogg';
  if (at('fLaC')) return 'audio/flac';
  if (at('ID3') || (head.length > 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0 && /\.mp3$/i.test(name))) return 'audio/mpeg';
  if (at('%PDF')) return 'application/pdf';
  const text = head.subarray(0, 2048).toString('utf8').replace(/^﻿/, '').trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!doctype svg[^>]*>\s*)?<svg[\s>]/i.test(text)) return 'image/svg+xml';
  return mimeOfName(name);
}

const known = (db: DB, sha: string) => db.prepare('select sha, mime, bytes, name from app_media where sha = ?').get(sha) as MediaRow | undefined;

/**
 * Notes a kept file (one kept already counts as just added, so a sweep spares it until something shows it). The same
 * bytes are kept once, under whatever names they come in by: what it gives has the name it came in by now.
 */
function note(db: DB, m: MediaRow): MediaRow {
  db.prepare('insert into app_media (sha, mime, bytes, name, created_at) values (?, ?, ?, ?, ?) on conflict(sha) do update set created_at = excluded.created_at').run(m.sha, m.mime, m.bytes, m.name, Date.now());
  return { ...known(db, m.sha)!, name: m.name };
}

/** Keeps bytes; the file as it is kept. */
export function putMediaBuffer(db: DB, data: Buffer, name: string, mime?: string): MediaRow {
  mediaTables(db);
  if (data.length > MEDIA_LIMITS.file) throw new HttpError(413, `${name} is over ${MEDIA_LIMITS.file >> 20} MB`);
  const sha = crypto.createHash('sha256').update(data).digest('hex').slice(0, 40);
  const file = fileOf(sha);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, data, { mode: 0o600 });
    fs.renameSync(tmp, file);
  }
  const safe = safeMediaName(name);
  return note(db, { sha, mime: mime || sniffMime(data.subarray(0, 4096), safe), bytes: data.length, name: safe });
}

/** Keeps a file on this computer (read as it is copied, so a big video never sits in memory). */
export async function putMediaFile(db: DB, src: string, name = path.basename(src)): Promise<MediaRow> {
  mediaTables(db);
  const st = fs.statSync(src);
  if (!st.isFile()) throw new Error('it is not a file');
  if (st.size > MEDIA_LIMITS.file) throw new Error(`it is over ${MEDIA_LIMITS.file >> 20} MB`);
  fs.mkdirSync(dir(), { recursive: true, mode: 0o700 });
  const tmp = path.join(dir(), `in-${process.pid}-${crypto.randomBytes(6).toString('hex')}.tmp`);
  const hash = crypto.createHash('sha256');
  let head = Buffer.alloc(0);
  try {
    await new Promise<void>((ok, fail) => {
      const rd = fs.createReadStream(src);
      const wr = fs.createWriteStream(tmp, { mode: 0o600 });
      rd.on('data', (c) => {
        const b = c as Buffer;
        hash.update(b);
        if (head.length < 4096) head = Buffer.concat([head, b.subarray(0, 4096 - head.length)]);
      });
      rd.on('error', fail);
      wr.on('error', fail);
      wr.on('finish', () => ok());
      rd.pipe(wr);
    });
    const sha = hash.digest('hex').slice(0, 40);
    const file = fileOf(sha);
    if (fs.existsSync(file)) fs.rmSync(tmp, { force: true });
    else {
      fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
      fs.renameSync(tmp, file);
    }
    const safe = safeMediaName(name);
    return note(db, { sha, mime: sniffMime(head, safe), bytes: st.size, name: safe });
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
}

/** Keeps a file from the web (public addresses only, bounded in time and size). */
export async function putMediaUrl(db: DB, url: string, name?: string): Promise<MediaRow> {
  const r = await fetchPage(url, { maxBytes: MEDIA_LIMITS.file + 1, timeoutMs: 120_000 });
  if (r.status >= 400) throw new Error(`the site answered ${r.status}`);
  if (r.truncated) throw new Error(`it is over ${MEDIA_LIMITS.file >> 20} MB`);
  const body = r.body ?? Buffer.from(r.text ?? '', 'utf8');
  const fromUrl = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'file');
  return putMediaBuffer(db, body, name || fromUrl, r.contentType && !/^text\/html/i.test(r.contentType) ? r.contentType.split(';')[0].trim() : undefined);
}

/** The most a picture from the web may be, to keep a copy of it (bigger ones stay links). */
const WEB_PICTURE = 15 * 1024 * 1024;

/**
 * A copy of a picture on the web, when it is one (and not too big): the pages of this app load nothing from other
 * sites, so a picture an agent found shows everywhere only once it is kept here. Null when it is not a picture, or
 * could not be fetched (it stays a link).
 */
export async function keepWebPicture(db: DB, url: string, signal?: AbortSignal): Promise<MediaRow | null> {
  try {
    const r = await fetchPage(url, { maxBytes: WEB_PICTURE + 1, timeoutMs: 15_000, signal });
    if (r.status >= 400 || r.truncated) return null;
    const body = r.body ?? (/svg/i.test(r.contentType ?? '') ? Buffer.from(r.text ?? '', 'utf8') : null);
    if (!body?.length) return null;
    const fromUrl = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'picture') || 'picture';
    const mime = sniffMime(body.subarray(0, 4096), fromUrl);
    if (!mime.startsWith('image/')) return null;
    const ext = mime.split('/')[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg');
    return putMediaBuffer(db, body, /\.[A-Za-z0-9]{2,5}$/.test(fromUrl) ? fromUrl : `${fromUrl}.${ext}`, mime);
  } catch {
    return null;
  }
}

/** A data: address's bytes. */
function fromDataUrl(s: string): { data: Buffer; mime: string } | null {
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(s);
  return m ? { mime: m[1].toLowerCase(), data: Buffer.from(m[2], 'base64') } : null;
}

// ---- what shows them --------------------------------------------------------------------------------------------

/** The kept files a value points at (anywhere in it). */
export function shasIn(v: unknown): string[] {
  const s = typeof v === 'string' ? v : JSON.stringify(v ?? null);
  return [...new Set([...s.matchAll(/\/app-media\/([a-f0-9]{40})\//g)].map((m) => m[1]))];
}

/** The kept files an app's own files are (its assets: name → { sha }). */
export const shasOfAssets = (assets: Record<string, { sha?: unknown }> | undefined) => Object.values(assets ?? {}).flatMap((a) => (typeof a?.sha === 'string' && /^[a-f0-9]{40}$/.test(a.sha) ? [a.sha] : []));

/**
 * Notes what `owner` shows of the kept files: those `value` points at (or the hashes `shas` names), in place of what
 * it showed before (`keep`: besides it).
 */
export function refMedia(db: DB, owner: string, value: unknown, o: { keep?: boolean; shas?: string[] } = {}) {
  mediaTables(db);
  const shas = [...new Set([...shasIn(value), ...(o.shas ?? [])])];
  db.transaction(() => {
    if (!o.keep) db.prepare('delete from app_media_refs where owner = ?').run(owner);
    const put = db.prepare('insert or ignore into app_media_refs (owner, sha) select ?, sha from app_media where sha = ?');
    for (const sha of shas) put.run(owner, sha);
  })();
}

/** What these owners showed is no longer noted (a run, an app deleted); files nothing shows go a day later. */
export function dropMediaRefs(db: DB, owners: string[]) {
  mediaTables(db);
  const del = db.prepare('delete from app_media_refs where owner = ?');
  db.transaction(() => {
    for (const o of owners) del.run(o);
  })();
}

/** The runs of an app went: what they showed is no longer noted. */
export function dropRunMediaOfApp(db: DB, app: string) {
  mediaTables(db);
  db.prepare("delete from app_media_refs where owner in (select 'run:' || id from app_runs where app_id = ?)").run(app);
}

/** Deletes the files nothing has shown for a day. */
export function sweepMedia(db: DB) {
  mediaTables(db);
  const old = db.prepare('select sha from app_media where created_at < ? and not exists (select 1 from app_media_refs r where r.sha = app_media.sha)').all(Date.now() - 86_400_000) as { sha: string }[];
  const del = db.prepare('delete from app_media where sha = ?');
  for (const { sha } of old) {
    fs.rmSync(fileOf(sha), { force: true });
    del.run(sha);
  }
  return old.length;
}

// ---- an answer's files, taken in ------------------------------------------------------------------------------------

/** A path an agent gave: from its folder, from home (~), or absolute. */
const resolveFrom = (cwd: string, p: string) => (p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : path.resolve(cwd, p));

/**
 * The files an answer points at, kept: in its media fields (and their stills) and its tables' picture columns, a file
 * on this computer (when `local`) or a picture as a data: address becomes the address of the app's copy; a web
 * address and one the app keeps stay as they are. `errors`: what could not be kept, to fix.
 */
export async function takeInAnswer(db: DB, answer: AnswerField[], value: Record<string, unknown>, o: { cwd: string; local: boolean }): Promise<{ value: Record<string, unknown>; errors: string[] }> {
  const errors: string[] = [];
  // Pictures on the web are kept too (not a public run's: its visitors' runs fetch nothing here), a few at a time,
  // within half a minute in all; one that is not a picture, or does not come, stays a link.
  const budget = AbortSignal.timeout(30_000);
  let fetched = 0;
  const web = async (src: string, kind: string | undefined): Promise<string> => {
    if (!o.local || fetched >= 40 || budget.aborted || (kind && kind !== 'image')) return src;
    if (!kind && mediaKind(src) !== 'image' && mediaKind(src) !== 'file') return src;
    fetched++;
    const m = await keepWebPicture(db, src, budget);
    return m ? mediaPath(m) : src;
  };
  const one = async (src: string, where: string, kind?: string): Promise<string | null> => {
    if (isWeb(src)) return web(src, kind);
    if (MEDIA_PATH.test(src) || isAssetRef(src)) return src;
    try {
      if (isDataMedia(src)) {
        const d = fromDataUrl(src);
        if (!d) throw new Error('its data: address is not base64');
        const ext = d.mime.split('/')[1]?.replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '') || 'bin';
        return mediaPath(putMediaBuffer(db, d.data, `${where.replace(/[^\w]+/g, '-')}.${ext}`, d.mime));
      }
      if (!o.local) throw new Error('only a web address (https://…) can be shown here');
      const file = resolveFrom(o.cwd, src);
      if (!fs.existsSync(file)) throw new Error(`there is no file at ${src}`);
      return mediaPath(await putMediaFile(db, file));
    } catch (e) {
      errors.push(`${where}: ${(e as Error).message}`);
      return null;
    }
  };
  const out = { ...value };
  for (const f of answer) {
    if (f.type === 'media' && Array.isArray(out[f.id])) {
      const items: MediaItem[] = [];
      const list = out[f.id] as MediaItem[];
      // Taken in a few at a time, in their order.
      const got = new Array<string | null>(list.length);
      for (let i = 0; i < list.length; i += 4)
        await Promise.all(list.slice(i, i + 4).map(async (it, k) => (got[i + k] = await one(it.src, list.length > 1 ? `${f.id} item ${i + k + 1}` : f.id, it.kind))));
      for (const [i, it] of list.entries()) {
        const where = list.length > 1 ? `${f.id} item ${i + 1}` : f.id;
        const src = got[i];
        if (!src) continue;
        const item: MediaItem = { ...it, src };
        if (!item.name && !isWeb(it.src) && !isDataMedia(it.src) && !MEDIA_PATH.test(it.src) && !isAssetRef(it.src)) item.name = path.basename(it.src) || undefined;
        // What it is: as said, else what was kept (a picture from the web), else its address.
        if (!item.kind) item.kind = src !== it.src && isWeb(it.src) ? 'image' : mediaKind(it.src);
        if (it.poster) {
          const p = await one(it.poster, `${where} poster`);
          if (p) item.poster = p;
          else delete item.poster;
        }
        items.push(item);
      }
      out[f.id] = items;
    } else if (f.type === 'table' && Array.isArray(out[f.id])) {
      const cols = (f.columns ?? []).filter((c) => c.type === 'image');
      if (!cols.length) continue;
      const rows: Record<string, unknown>[] = [];
      for (const [i, r] of (out[f.id] as Record<string, unknown>[]).entries()) {
        const row = { ...r };
        for (const c of cols) if (typeof row[c.id] === 'string' && row[c.id]) row[c.id] = await one(row[c.id] as string, `${f.id} row ${i + 1}, ${c.id}`, 'image');
        rows.push(row);
      }
      out[f.id] = rows;
    }
  }
  return { value: out, errors };
}

// ---- an app's own files -------------------------------------------------------------------------------------------

/**
 * Keeps one of an app's files from what an agent or a page gave: a path on this computer (from `cwd`), a web
 * address, a data: address, or bytes. Its entry in the app's assets.
 */
export async function putAsset(db: DB, name: string, from: { path?: string; url?: string; data?: Buffer; cwd?: string }, caption?: string): Promise<AppAsset> {
  if (!ASSET_NAME.test(name) || name.includes('..')) throw new HttpError(400, `“${name.slice(0, 60)}” is not a file's name (letters, digits, dots, dashes, underscores, spaces; no folders)`);
  if (from.data && from.data.length > MEDIA_LIMITS.asset) throw new HttpError(413, `${name} is over ${MEDIA_LIMITS.asset >> 20} MB: an app's file is at most that`);
  let m: MediaRow;
  if (from.data) m = putMediaBuffer(db, from.data, name);
  else if (from.url && isDataMedia(from.url)) {
    const d = fromDataUrl(from.url);
    if (!d) throw new HttpError(400, `${name}: its data: address is not base64`);
    m = putMediaBuffer(db, d.data, name, d.mime);
  } else if (from.url && isWeb(from.url)) m = await putMediaUrl(db, from.url, name);
  else if (from.path) {
    const file = resolveFrom(from.cwd ?? config.home, from.path);
    if (!fs.existsSync(file)) throw new HttpError(400, `${name}: there is no file at ${from.path}`);
    m = await putMediaFile(db, file, name);
  } else throw new HttpError(400, `${name}: give its path on this computer, or an address`);
  if (m.bytes > MEDIA_LIMITS.asset) throw new HttpError(413, `${name} is over ${MEDIA_LIMITS.asset >> 20} MB: an app's file is at most that`);
  return { sha: m.sha, mime: m.mime, bytes: m.bytes, ...(caption ? { caption: caption.slice(0, 300) } : {}) };
}

/** A kept file's bytes (to pack an app's files into its .naget-app). */
export function mediaBytes(db: DB, sha: string): Buffer | null {
  try {
    return fs.readFileSync(fileOf(sha));
  } catch {
    return null;
  }
}

/** Whether an app's files are all here. */
export const hasMedia = (db: DB, sha: string) => (mediaTables(db), !!known(db, sha) && fs.existsSync(fileOf(sha)));

// ---- serving them ---------------------------------------------------------------------------------------------------

/** What may open where it is served: pictures, videos, sounds and PDFs. Anything else downloads. */
const INLINE = /^(image\/(png|jpeg|gif|webp|avif|svg\+xml|bmp|x-icon)|video\/|audio\/|application\/pdf$)/;

export function mediaRoutes(app: FastifyInstance, db: DB) {
  mediaTables(db);
  app.get('/app-media/:sha/:name', async (req, reply) => {
    const { sha } = req.params as { sha: string; name: string };
    if (!/^[a-f0-9]{40}$/.test(sha)) return reply.code(404).send({ error: 'No such file' });
    const m = known(db, sha);
    const file = fileOf(sha);
    let st: fs.Stats;
    try {
      st = fs.statSync(file);
    } catch {
      return reply.code(404).send({ error: 'No such file' });
    }
    if (!m) return reply.code(404).send({ error: 'No such file' });
    const inline = INLINE.test(m.mime);
    // Named as its address says (the same bytes may come in under several names).
    let name = m.name;
    try {
      name = safeMediaName(decodeURIComponent((req.params as { name: string }).name)) || m.name;
    } catch {}
    reply.header('Content-Type', m.mime);
    // Nothing served here runs as a page of the app; a PDF (known by its first bytes, never sniffed as anything else)
    // goes without the sandbox, which Chrome's PDF viewer refuses to open in.
    if (m.mime !== 'application/pdf') reply.header('Content-Security-Policy', "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'");
    reply
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .header('Cross-Origin-Resource-Policy', 'cross-origin')
      .header('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`)
      .header('Accept-Ranges', 'bytes');
    const range = byteRange(req.headers.range, st.size);
    if (range === 'bad') return reply.code(416).header('Content-Range', `bytes */${st.size}`).send();
    if (range !== 'all') {
      reply.code(206).header('Content-Range', `bytes ${range.start}-${range.end}/${st.size}`).header('Content-Length', range.end - range.start + 1);
      return reply.send(fs.createReadStream(file, { start: range.start, end: range.end }));
    }
    reply.header('Content-Length', st.size);
    return reply.send(fs.createReadStream(file));
  });
  // Files nothing shows any more go, now and then.
  setTimeout(() => sweepMedia(db), 60_000).unref();
  setInterval(() => sweepMedia(db), 6 * 3600_000).unref();
}
