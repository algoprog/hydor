// Files for pages: what a page's File, Sound (audio) and PDF blocks show, and what a database's Files & pictures cells hold,
// kept by the app as files of their own (a page keeps only their address): each once, by the hash of its bytes, up to
// 50 MB. Their address carries this server's signature of them and is its own permission (no sign-in), so a page shows
// them wherever it opens: in the editor, in Use, at its own address and in a published copy.
//   POST /api/pages/files?name=&type=  (the file's bytes, application/octet-stream) → {src, name, type, size}
//   POST /api/pages/files/library {id} → {src, name, type, size}: a sound or a picture of the Library, for a page.
//   GET  /pg/file/:sha/:sig/:name: the file (ranges for sound and video). Pictures, sounds, videos and PDFs show in
//     the page; anything else is a download, never a page of this app (what it says runs nowhere).
// A file no page has named for a month goes (a page's versions and its data are looked through).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import type { DB } from '../db.ts';
import { byteRange } from '../files.ts';
import { signWithKey } from '../links.ts';

export const MAX_PAGE_FILE = 50 * 1024 * 1024;
const dir = () => path.join(config.dataDir, 'page-files');

let ready = false;
function init(db: DB) {
  if (ready) return;
  db.exec('create table if not exists page_files (sha text primary key, name text not null, mime text not null, bytes integer not null, created_at integer not null)');
  ready = true;
}

/** What a page may show of a file as it is; anything else is only downloaded. */
const SHOWN = /^(image\/(png|jpeg|gif|webp|avif|bmp)|audio\/[\w.+-]+|video\/(mp4|webm|quicktime)|application\/pdf|text\/plain)$/;
const MIME_OF: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  aac: 'audio/aac',
  webm: 'video/webm',
  mp4: 'video/mp4',
  txt: 'text/plain',
  csv: 'text/csv',
  zip: 'application/zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
/** A file's kind: what its bytes say for the ones a page shows (a PDF, a picture, a sound), else its name's. */
export function fileType(name: string, head: Buffer, given = ''): string {
  if (head.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (head.length > 8 && head.readUInt32BE(0) === 0x89504e47) return 'image/png';
  if (head.length > 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (head.subarray(0, 4).toString('latin1') === 'GIF8') return 'image/gif';
  if (head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WAVE') return 'audio/wav';
  if (head.subarray(0, 3).toString('latin1') === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  if (head.subarray(0, 4).toString('latin1') === 'OggS') return 'audio/ogg';
  if (head.subarray(0, 4).toString('latin1') === 'fLaC') return 'audio/flac';
  const ext = /\.([a-z0-9]{1,5})$/i.exec(name)?.[1]?.toLowerCase() ?? '';
  const byName = MIME_OF[ext];
  if (byName) return byName;
  return /^[\w.+-]+\/[\w.+-]+$/.test(given) && !/html|xml|javascript|svg/i.test(given) ? given : 'application/octet-stream';
}

const cleanName = (n: unknown) =>
  String(n ?? '')
    .replace(/[\u0000-\u001f\u007f/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'file';

/** A kept file's address: its own permission. */
export const fileAddress = (sha: string, name: string) => `/pg/file/${sha}/${signWithKey(`page-file:${sha}`).slice(0, 32)}/${encodeURIComponent(cleanName(name))}`;
const addressOk = (sha: string, sig: string) => {
  const want = signWithKey(`page-file:${sha}`).slice(0, 32);
  return /^[a-f0-9]{64}$/.test(sha) && want.length === sig.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig));
};

/** Keeps a file's bytes: its address, name, kind and size. */
export function keepPageFile(db: DB, data: Buffer, name0: string, given = ''): { src: string; name: string; type: string; size: number } {
  init(db);
  if (!data.length) throw new HttpError(400, 'The file is empty');
  if (data.length > MAX_PAGE_FILE) throw new HttpError(413, `That file is over ${MAX_PAGE_FILE / 1024 / 1024} MB`);
  const name = cleanName(name0);
  const sha = crypto.createHash('sha256').update(data).digest('hex');
  const type = fileType(name, data.subarray(0, 64), given);
  fs.mkdirSync(dir(), { recursive: true });
  const file = path.join(dir(), sha);
  if (!fs.existsSync(file)) fs.writeFileSync(file, data);
  db.prepare('insert into page_files (sha, name, mime, bytes, created_at) values (?, ?, ?, ?, ?) on conflict(sha) do update set created_at = excluded.created_at').run(sha, name, type, data.length, Date.now());
  return { src: fileAddress(sha, name), name, type, size: data.length };
}

async function readAll(body: Readable, max: number): Promise<Buffer> {
  const parts: Buffer[] = [];
  let n = 0;
  for await (const c of body) {
    n += (c as Buffer).length;
    if (n > max) throw new HttpError(413, `That file is over ${max / 1024 / 1024} MB`);
    parts.push(c as Buffer);
  }
  return Buffer.concat(parts);
}

/** Files no page names any more (in a version or in its data), a month after they were kept, go. */
export function sweepPageFiles(db: DB) {
  init(db);
  const old = Date.now() - 30 * 86_400_000;
  const list = db.prepare('select sha from page_files where created_at < ?').all(old) as { sha: string }[];
  const named = db.prepare("select 1 from page_versions where html like ? limit 1");
  const kept = db.prepare('select 1 from page_storage where value like ? limit 1');
  const del = db.prepare('delete from page_files where sha = ?');
  for (const { sha } of list) {
    const like = `%/pg/file/${sha}/%`;
    if (named.get(like) || kept.get(like)) continue;
    fs.rmSync(path.join(dir(), sha), { force: true });
    del.run(sha);
  }
}

export function pageFilesRoutes(app: FastifyInstance, db: DB) {
  init(db);
  app.post('/api/pages/files', { bodyLimit: MAX_PAGE_FILE + 1024 }, async (req) => {
    const body = req.body as Readable | undefined;
    if (!body || typeof body.pipe !== 'function') throw new HttpError(400, 'Send the file’s bytes (application/octet-stream)');
    const q = req.query as Record<string, string | undefined>;
    const data = await readAll(body, MAX_PAGE_FILE);
    return keepPageFile(db, data, q.name ?? 'file', q.type ?? '');
  });
  app.get('/pg/file/:sha/:sig/*', async (req, reply) => {
    const p = req.params as Record<string, string>;
    reply.header('X-Robots-Tag', 'noindex, nofollow');
    if (!addressOk(p.sha, p.sig)) return reply.code(404).send({ error: 'No such file' });
    init(db);
    const row = db.prepare('select name, mime, bytes from page_files where sha = ?').get(p.sha) as { name: string; mime: string; bytes: number } | undefined;
    const file = path.join(dir(), p.sha);
    const st = row ? await fs.promises.stat(file).catch(() => null) : null;
    if (!row || !st?.isFile()) return reply.code(404).send({ error: 'No such file' });
    const shown = SHOWN.test(row.mime);
    // (a page in its sandbox reads a PDF to draw it; a file of its own address is the same file for ever)
    reply
      .header('Access-Control-Allow-Origin', '*')
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
      .header('Content-Disposition', `${shown ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(row.name)}`)
      .header('Accept-Ranges', 'bytes')
      .type(shown ? row.mime : 'application/octet-stream');
    const range = byteRange(req.headers.range, st.size);
    if (range === 'bad') return reply.code(416).header('Content-Range', `bytes */${st.size}`).send();
    if (range !== 'all') {
      reply.code(206).header('Content-Range', `bytes ${range.start}-${range.end}/${st.size}`).header('Content-Length', range.end - range.start + 1);
      return reply.send(fs.createReadStream(file, { start: range.start, end: range.end }));
    }
    return reply.header('Content-Length', st.size).send(fs.createReadStream(file));
  });
}
