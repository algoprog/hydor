// The small picture of a file in a project's Files (GET /api/fs/thumb): a picture scaled down, a video's frame, a PDF's
// first page, the picture a Word, PowerPoint, Excel or OpenDocument file carries or the app draws of its first page,
// slide or cells, an HTML file or a notebook as a page opens. Made with what the computer has (ImageMagick, ffmpeg,
// poppler, a Mac's own tools, the app's capture browser), kept under the data folder by the file's path, time and size
// until it is a month old, and never made from anything but the file itself (the capture browser is offline). A file
// it draws nothing for has no picture (404): the page shows its own icon or text snippet then.
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { HttpError } from './auth.ts';
import { canCapture, capture } from './capture/index.ts';
import { config } from './config.ts';
import type { DB } from './db.ts';
import { renderPage } from './documents/pdf/render.ts';
import { Zip } from './documents/zip.ts';
import { agentBaseEnv } from './env.ts';
import * as files from './files.ts';
import { ffmpegBin } from './media/frames.ts';
import { mustKind, type PageKind } from './pages/kinds.ts';
import { which } from './platform.ts';

export interface Thumb {
  data: Buffer;
  type: 'image/webp' | 'image/jpeg' | 'image/png' | 'image/gif' | 'image/avif';
}

const EXT_OF: Record<Thumb['type'], string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/avif': 'avif' };
const TYPE_OF: Record<string, Thumb['type']> = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', avif: 'image/avif' };

const MB = 1024 * 1024;
/** The most of a file that is read for its picture, by what it is. */
const LIMITS = { video: 200 * MB, pdf: 100 * MB, office: 100 * MB, drawn: 30 * MB, text: 10 * MB, html: 2 * MB };
/** A picture file served as it is, when nothing here can scale it. */
const SERVE_AS_IS = 8 * MB;
const RENDER_MS = 20_000;
const KEEP_DAYS = 30;
const KEEP_BYTES = 300 * MB;
const AT_ONCE = 2;

const dir = () => path.join(config.dataDir, 'thumbs', 'files');

// ---- what a file is ------------------------------------------------------------------------------------------

type Coder = 'png' | 'jpeg' | 'gif' | 'webp' | 'bmp' | 'tiff' | 'heic' | 'avif';
/** The picture formats by their ending: the name ImageMagick reads them by, and whether a browser shows them itself. */
const PICTURES: Record<string, { coder: Coder; shown: boolean }> = {
  png: { coder: 'png', shown: true },
  jpg: { coder: 'jpeg', shown: true },
  jpeg: { coder: 'jpeg', shown: true },
  gif: { coder: 'gif', shown: true },
  webp: { coder: 'webp', shown: true },
  avif: { coder: 'avif', shown: true },
  bmp: { coder: 'bmp', shown: false },
  tif: { coder: 'tiff', shown: false },
  tiff: { coder: 'tiff', shown: false },
  heic: { coder: 'heic', shown: false },
  heif: { coder: 'heic', shown: false },
};
const VIDEOS = new Set(['mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi', 'ogv']);
/** Word, PowerPoint, Excel, OpenDocument and iWork files: zips that may carry a picture of their first page. */
const OFFICE = new Set(['docx', 'docm', 'dotx', 'pptx', 'ppsx', 'potx', 'xlsx', 'xlsm', 'odt', 'odp', 'ods', 'pages', 'key', 'numbers']);
/** What the app can draw itself, by ending: the kind of page its model makes. */
const DRAWN: Record<string, PageKind> = { docx: 'doc', docm: 'doc', dotx: 'doc', pptx: 'slides', ppsx: 'slides', potx: 'slides', xlsx: 'sheet', xlsm: 'sheet', ods: 'sheet', csv: 'sheet', tsv: 'sheet', ipynb: 'notebook' };
/** Where the pictures a document carries are, best first. */
const CARRIED = ['docProps/thumbnail.jpeg', 'docProps/thumbnail.jpg', 'docProps/thumbnail.png', 'Thumbnails/thumbnail.png', 'QuickLook/Thumbnail.jpg', 'QuickLook/Thumbnail.png', 'preview.jpg', 'preview.png'];

const extOf = (file: string) => path.extname(file).slice(1).toLowerCase();

/** What a picture's first bytes say it is (null: not a picture this serves). */
function pictureType(b: Buffer): Thumb['type'] | null {
  if (b.length < 12) return null;
  if (b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.toString('latin1', 0, 4) === 'GIF8') return 'image/gif';
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (b.toString('latin1', 4, 8) === 'ftyp' && /^avi[fs]/.test(b.toString('latin1', 8, 12))) return 'image/avif';
  return null;
}

/** Whether the bytes are what a file with this picture ending holds (so no tool is handed something else under its name). */
function looksLike(coder: Coder, b: Buffer): boolean {
  if (b.length < 12) return false;
  switch (coder) {
    case 'png':
      return pictureType(b) === 'image/png';
    case 'jpeg':
      return pictureType(b) === 'image/jpeg';
    case 'gif':
      return pictureType(b) === 'image/gif';
    case 'webp':
      return pictureType(b) === 'image/webp';
    case 'bmp':
      return b.toString('latin1', 0, 2) === 'BM';
    case 'tiff':
      return (b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 0x2a);
    case 'heic':
    case 'avif':
      return b.toString('latin1', 4, 8) === 'ftyp';
  }
}

/** A video's first bytes: an MP4 or QuickTime file, Matroska or WebM, AVI or Ogg. */
function looksLikeVideo(b: Buffer): boolean {
  if (b.length < 12) return false;
  if (/^(ftyp|moov|mdat|free|wide|skip|pnot)$/.test(b.toString('latin1', 4, 8))) return true;
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return true;
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 11) === 'AVI') return true;
  return b.toString('latin1', 0, 4) === 'OggS';
}

async function head(file: string, n = 32): Promise<Buffer> {
  const h = await fs.promises.open(file, 'r');
  try {
    const b = Buffer.alloc(n);
    const { bytesRead } = await h.read(b, 0, n, 0);
    return b.subarray(0, bytesRead);
  } finally {
    await h.close();
  }
}

// ---- running the tools ---------------------------------------------------------------------------------------

/** Runs a program (its arguments one by one, never through a shell); whether it ended well. */
function run(bin: string, args: string[], timeout = RENDER_MS): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout, killSignal: 'SIGKILL', maxBuffer: 1 << 20, windowsHide: true, env: { ...agentBaseEnv(), CUDA_VISIBLE_DEVICES: '' } }, (err) => resolve(!err));
  });
}

const sized = (f: string) => {
  try {
    return fs.statSync(f).size > 0;
  } catch {
    return false;
  }
};

const magickBin = () => which('magick') ?? (process.platform === 'win32' ? null : which('convert'));
const sipsBin = () => (process.platform === 'darwin' && fs.existsSync('/usr/bin/sips') ? '/usr/bin/sips' : null);

/** The ffmpeg filter that scales down to `w` pixels on the longer side and never up. */
const scaleFilter = (w: number) => `scale='min(${w},iw)':'min(${w},ih)':force_original_aspect_ratio=decrease`;

/** What a tool writes a file of this ending with, as its arguments for the output. */
const quality = (ext: string) => (ext === 'webp' ? ['-q:v', '75'] : ext === 'jpg' ? ['-q:v', '4'] : []);

/**
 * A picture file scaled to `w` on its longer side with what the computer has (ImageMagick, ffmpeg, a Mac's sips), WebP where
 * the tool writes it, else JPEG (PNG for pictures that may be see-through); null when no tool does it. `coder` names the
 * format for ImageMagick, so it reads this and nothing else under the file's name.
 */
async function scaleFile(input: string, w: number, tmp: string, o: { coder?: Coder; alpha: boolean }): Promise<Thumb | null> {
  const formats = ['webp', o.alpha ? 'png' : 'jpg'];
  const magick = magickBin();
  const ffmpeg = await ffmpegBin();
  const sips = sipsBin();
  let n = 0;
  const out = (ext: string) => path.join(tmp, `scaled-${n++}.${ext}`);
  const done = async (f: string, ext: string): Promise<Thumb | null> => (sized(f) ? { data: await fs.promises.readFile(f), type: TYPE_OF[ext] } : null);
  if (magick && o.coder) {
    for (const ext of formats) {
      const f = out(ext);
      if (await run(magick, ['-limit', 'memory', '256MiB', '-limit', 'map', '512MiB', '-limit', 'disk', '1GiB', '-limit', 'area', '128MP', '-limit', 'time', '20', `${o.coder}:${input}[0]`, '-auto-orient', '-resize', `${w}x${w}>`, '-quality', '80', f])) {
        const t = await done(f, ext);
        if (t) return t;
      }
    }
  }
  if (ffmpeg) {
    for (const ext of formats) {
      const f = out(ext);
      if (await run(ffmpeg, ['-v', 'error', '-nostdin', '-y', '-protocol_whitelist', 'file', '-i', `file:${input}`, '-map', '0:V:0', '-frames:v', '1', '-vf', scaleFilter(w), ...quality(ext), f])) {
        const t = await done(f, ext);
        if (t) return t;
      }
    }
  }
  if (sips) {
    const ext = o.alpha ? 'png' : 'jpg';
    const f = out(ext);
    if (await run(sips, ['-Z', String(w), '-s', 'format', ext === 'png' ? 'png' : 'jpeg', input, '--out', f])) return done(f, ext);
  }
  return null;
}

// ---- the kinds -----------------------------------------------------------------------------------------------

/** A picture file, scaled; or as it is when nothing can scale it and a browser shows it itself. */
async function picture(file: string, size: number, w: number, tmp: string): Promise<Thumb | null> {
  const ext = extOf(file);
  const p = PICTURES[ext];
  const first = await head(file);
  if (!p || !looksLike(p.coder, first)) return null;
  const small = await scaleFile(file, w, tmp, { coder: p.coder, alpha: p.coder !== 'jpeg' && p.coder !== 'bmp' });
  if (small) return small;
  const type = pictureType(first);
  return type && p.shown && size <= SERVE_AS_IS ? { data: await fs.promises.readFile(file), type } : null;
}

/** The first frame of a video (a second in, or the first frame of a shorter one), scaled; a Mac's Quick Look without ffmpeg. */
async function video(file: string, w: number, tmp: string): Promise<Thumb | null> {
  if (!looksLikeVideo(await head(file))) return null;
  const ffmpeg = await ffmpegBin();
  if (ffmpeg) {
    for (const ext of ['webp', 'jpg']) {
      for (const seek of [['-ss', '1'], []]) {
        const f = path.join(tmp, `frame-${seek.length}.${ext}`);
        const args = ['-v', 'error', '-nostdin', '-y', '-protocol_whitelist', 'file', ...seek, '-i', `file:${file}`, '-map', '0:V:0', '-frames:v', '1', '-vf', scaleFilter(w), ...quality(ext), f];
        if ((await run(ffmpeg, args)) && sized(f)) return { data: await fs.promises.readFile(f), type: TYPE_OF[ext] };
      }
    }
  }
  return quickLook(file, w, tmp);
}

/** A Mac's Quick Look picture of any file (qlmanage); null elsewhere or when it has none. */
async function quickLook(file: string, w: number, tmp: string): Promise<Thumb | null> {
  if (process.platform !== 'darwin' || !fs.existsSync('/usr/bin/qlmanage')) return null;
  const dest = path.join(tmp, 'ql');
  fs.mkdirSync(dest, { recursive: true });
  await run('/usr/bin/qlmanage', ['-t', '-s', String(w), '-o', dest, file]);
  const made = fs.readdirSync(dest).find((n) => n.endsWith('.png'));
  if (!made) return null;
  const data = await fs.promises.readFile(path.join(dest, made));
  return pictureType(data) === 'image/png' ? { data, type: 'image/png' } : null;
}

/** A PDF's first page, as the PDF tools draw it (server/documents/pdf/render.ts), then scaled down and compressed. */
async function pdf(file: string, w: number, tmp: string): Promise<Thumb | null> {
  const data = await fs.promises.readFile(file);
  if (data.subarray(0, 1024).indexOf('%PDF-') < 0) return null;
  const png = await renderPage(data, 1, { width: w });
  const f = path.join(tmp, 'page.png');
  await fs.promises.writeFile(f, png);
  return (await scaleFile(f, w, tmp, { coder: 'png', alpha: false })) ?? { data: png, type: 'image/png' };
}

/** The picture a document carries in itself, if it does (its zip holds one where Office, OpenDocument and iWork put it). */
async function carried(file: string, w: number, tmp: string): Promise<Thumb | null> {
  let zip: Zip;
  try {
    zip = new Zip(await fs.promises.readFile(file), 64 * MB);
  } catch {
    return null;
  }
  for (const name of CARRIED) {
    const data = zip.read(name, 8 * MB);
    const type = data && pictureType(data);
    if (!data || !type || (type !== 'image/png' && type !== 'image/jpeg')) continue;
    if (data.length > 150_000) {
      const f = path.join(tmp, `carried.${EXT_OF[type]}`);
      await fs.promises.writeFile(f, data);
      const small = await scaleFile(f, w, tmp, { coder: type === 'image/png' ? 'png' : 'jpeg', alpha: type === 'image/png' });
      if (small) return small;
    }
    return { data, type };
  }
  return null;
}

/** A Word, PowerPoint or Excel file, a CSV or a notebook, drawn as the app draws its first page, slide or cells (the model it opens as, shown alone). */
async function drawn(file: string, kind: PageKind, w: number, db: DB): Promise<Thumb | null> {
  if (!canCapture()) return null;
  const k = mustKind(kind);
  if (!k.fromFile) return null;
  const { model } = await k.fromFile(await fs.promises.readFile(file), path.basename(file));
  const text = JSON.stringify(model);
  const size = k.still(text);
  const html = await k.page(db, text, path.basename(file).replace(/\.[^.]+$/, ''), 'still');
  const shot = await capture({ html, width: size.width, height: size.height, outWidth: Math.min(w, size.width), format: 'webp', quality: 78, settleMs: 600, blockPrivate: true, offline: true });
  return { data: shot.data, type: 'image/webp' };
}

/** No script of the file runs for its picture: a folder shown is not a file run (a rule put in ahead of them). */
const NO_SCRIPTS = `<meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'">`;
export function withoutScripts(page: string): string {
  if (/<head(\s[^>]*)?>/i.test(page)) return page.replace(/<head(\s[^>]*)?>/i, (m) => m + NO_SCRIPTS);
  if (/^\s*<!doctype[^>]*>/i.test(page)) return page.replace(/^\s*<!doctype[^>]*>/i, (m) => m + NO_SCRIPTS);
  return NO_SCRIPTS + page;
}

/** An HTML file as a browser draws it with nothing from outside (no network, nothing from the files beside it) and none of its scripts. */
async function html(file: string, w: number): Promise<Thumb | null> {
  if (!canCapture()) return null;
  const page = withoutScripts((await fs.promises.readFile(file)).toString('utf8'));
  const shot = await capture({ html: page, width: 880, height: 550, outWidth: Math.min(w, 880), format: 'webp', quality: 76, settleMs: 500, blockPrivate: true, offline: true, colorScheme: 'light' });
  return { data: shot.data, type: 'image/webp' };
}

/** The picture of one file, made now (not looked up: see fileThumb); null when there is none. */
async function make(file: string, st: fs.Stats, w: number, db: DB): Promise<Thumb | null> {
  const ext = extOf(file);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-thumb-'));
  try {
    if (PICTURES[ext]) return await picture(file, st.size, w, tmp);
    if (VIDEOS.has(ext)) return st.size <= LIMITS.video ? await video(file, w, tmp) : null;
    if (ext === 'pdf') return st.size <= LIMITS.pdf ? await pdf(file, w, tmp) : null;
    if (ext === 'html' || ext === 'htm') return st.size <= LIMITS.html ? await html(file, w) : null;
    if (OFFICE.has(ext)) {
      if (st.size > LIMITS.office) return null;
      const own = await carried(file, w, tmp);
      if (own) return own;
      const kind = DRAWN[ext];
      if (kind && st.size <= LIMITS.drawn) {
        try {
          const d = await drawn(file, kind, w, db);
          if (d) return d;
        } catch {}
      }
      return await quickLook(file, w, tmp);
    }
    if (DRAWN[ext]) return st.size <= (ext === 'ipynb' || ext === 'csv' || ext === 'tsv' ? LIMITS.text : LIMITS.drawn) ? await drawn(file, DRAWN[ext], w, db) : null;
    return null;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---- keeping them --------------------------------------------------------------------------------------------

/** Where a picture is kept: by the file's own path, time, size and the width asked for. */
const cacheKey = (real: string, st: fs.Stats, w: number) => crypto.createHash('sha256').update(`1\0${real}\0${st.mtimeMs}\0${st.size}\0${w}`).digest('hex').slice(0, 40);

async function cached(key: string): Promise<Thumb | null> {
  for (const [ext, type] of Object.entries(TYPE_OF)) {
    const f = path.join(dir(), `${key}.${ext}`);
    try {
      const data = await fs.promises.readFile(f);
      const now = new Date();
      fs.promises.utimes(f, now, now).catch(() => {});
      return { data, type };
    } catch {}
  }
  return null;
}

async function keep(key: string, t: Thumb) {
  fs.mkdirSync(dir(), { recursive: true, mode: 0o700 });
  const f = path.join(dir(), `${key}.${EXT_OF[t.type]}`);
  const part = `${f}.${process.pid}.part`;
  await fs.promises.writeFile(part, t.data, { mode: 0o600 });
  await fs.promises.rename(part, f);
}

let swept = 0;
/** Old pictures go, at most once a day: none over 30 days old, and the oldest first while the folder is over about 300 MB. */
function sweep(now = Date.now()) {
  if (now - swept < 86_400_000) return;
  swept = now;
  try {
    const list = fs
      .readdirSync(dir())
      .map((n) => {
        const f = path.join(dir(), n);
        const s = fs.statSync(f, { throwIfNoEntry: false });
        return s && { f, t: s.mtimeMs, size: s.size };
      })
      .filter((x): x is { f: string; t: number; size: number } => !!x)
      .sort((a, b) => b.t - a.t);
    let total = 0;
    for (const x of list) {
      total += x.size;
      if (now - x.t > KEEP_DAYS * 86_400_000 || total > KEEP_BYTES) fs.rmSync(x.f, { force: true });
    }
  } catch {}
}

/** Makes the next sweep happen on the next ask (tests). */
export const resweepThumbs = () => void (swept = 0);

// ---- asking --------------------------------------------------------------------------------------------------

const making = new Map<string, Promise<Thumb | null>>();
/** Pictures that could not be made, for ten minutes (so a file with none is not tried at each look). */
const failed = new Map<string, number>();
let busy = 0;
const waiting: (() => void)[] = [];

/** How long a making holds its place at most: one that hangs gives it up then, so the others are not stopped for good. */
const HOLD_MS = 60_000;

/**
 * At most two pictures are made at once. A place is held until its making ends (whoever asked may have had an answer
 * already: fileThumb answers within its time), or HOLD_MS at most, and it passes straight to the next in line, so no
 * newcomer slips in between.
 */
async function turn<T>(job: () => Promise<T>): Promise<T> {
  if (busy < AT_ONCE) busy++;
  else await new Promise<void>((resolve) => waiting.push(resolve));
  let freed = false;
  const free = () => {
    if (freed) return;
    freed = true;
    const next = waiting.shift();
    if (next) next();
    else busy--;
  };
  const hold = setTimeout(free, HOLD_MS);
  hold.unref?.();
  const p = Promise.resolve().then(job);
  p.finally(() => (clearTimeout(hold), free())).catch(() => {});
  return p;
}

const within = <T>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('took too long')), ms);
    p.then(resolve, reject).finally(() => clearTimeout(t));
  });

/** How many pictures are being made or waiting (tests). */
export const thumbsBusy = () => busy + waiting.length;

/**
 * The picture of a file, `w` pixels on its longer side (or wide, for a PDF page or a drawn one): from the folder where they
 * are kept, else made (alike asks share one making; two at a time), and kept; null when there is none for it.
 */
export async function fileThumb(file: string, w: number, db: DB): Promise<Thumb | null> {
  const st = await fs.promises.stat(file).catch(() => null);
  if (!st?.isFile()) return null;
  const real = await fs.promises.realpath(file).catch(() => file);
  const key = cacheKey(real, st, w);
  const hit = await cached(key);
  if (hit) return hit;
  const no = failed.get(key);
  if (no && no > Date.now()) return null;
  let job = making.get(key);
  if (!job) {
    job = within(turn(() => make(real, st, w, db)), RENDER_MS + 5_000)
      .then(async (t) => {
        if (t && t.data.length) {
          await keep(key, t).catch(() => {});
          sweep();
          return t;
        }
        return null;
      })
      .catch(() => null)
      .then((t) => {
        if (!t) {
          if (failed.size > 2000) failed.clear();
          failed.set(key, Date.now() + 600_000);
        }
        return t;
      })
      .finally(() => making.delete(key));
    making.set(key, job);
  }
  return job;
}

/** GET /api/fs/thumb: the picture of a file, with the same rules for the path as /api/fs/raw (a file, found as it resolves). */
export function fileThumbRoutes(app: FastifyInstance, db: DB) {
  app.get('/api/fs/thumb', async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const file = files.resolvePath(q.path);
    const st = await fs.promises.stat(file).catch(() => null);
    if (!st || !st.isFile()) throw new HttpError(404, 'Not found');
    const asked = Math.round(Number(q.w));
    const w = Number.isFinite(asked) && asked > 0 ? Math.max(120, Math.min(800, asked)) : 360;
    const t = await fileThumb(file, w, db);
    if (!t) throw new HttpError(404, 'There is no picture for this file');
    reply.header('Content-Type', t.type);
    // The picture's address carries the file's time, so it never changes for one address.
    reply.header('Cache-Control', q.t ? 'private, max-age=31536000, immutable' : 'private, max-age=60');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Content-Length', t.data.length);
    return reply.send(t.data);
  });
}
