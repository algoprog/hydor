// Routes for Files' Fill & sign: what a PDF is (its pages' sizes, its form's fields and where they are), pictures of
// its pages without its fields (the page draws its own over them, to type in), and saving what the user filled in and
// placed (text boxes, ticks, signatures) as a copy beside the file or over it, its old version to the Trash.
//   GET  /api/pdf/info?path=
//   GET  /api/pdf/page?path=&page=&width=&fields=0
//   POST /api/pdf/save { path, values, marks, replace?, flatten?, mtime? }
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { HttpError } from '../../auth.ts';
import type { DB } from '../../db.ts';
import { freeName, resolvePath, trashCopy, writeFile } from '../../files.ts';
import { signatureImage, touchSignature } from '../../signatures/store.ts';
import type { Mark } from './draw.ts';
import { fillAndMark, pagePicture, pdfInfo, PdfError, FormError } from './index.ts';

const MAX_BYTES = 200 * 1024 * 1024;

function load(p: unknown): { file: string; data: Buffer; mtime: number } {
  const file = resolvePath(String(p ?? ''));
  const st = fs.statSync(file, { throwIfNoEntry: false });
  if (!st?.isFile()) throw new HttpError(404, 'Not found');
  if (st.size > MAX_BYTES) throw new HttpError(413, `The PDF is over ${MAX_BYTES / 1024 / 1024} MB.`);
  const data = fs.readFileSync(file);
  if (!data.subarray(0, 1024).includes('%PDF-')) throw new HttpError(415, 'This is not a PDF file.');
  return { file, data, mtime: Math.floor(st.mtimeMs) };
}

/** What the PDF code says is wrong with a file or a request, as a reply the page shows. */
function readable<T>(f: () => T): T {
  try {
    return f();
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(422, (e as Error).message);
  }
}

/** A mark the page placed, checked: its kind, page and box, its words or its picture (a saved signature's, read here). */
async function markOf(m: unknown, i: number, db: DB): Promise<Mark> {
  if (!m || typeof m !== 'object') throw new HttpError(400, `marks[${i}] is not a mark`);
  const o = m as Record<string, unknown>;
  const n = (k: string) => {
    const v = Number(o[k]);
    if (!Number.isFinite(v)) throw new HttpError(400, `marks[${i}].${k} is not a number`);
    return v;
  };
  const at = { page: Math.round(n('page')), x: n('x'), y: n('y') };
  switch (o.type) {
    case 'text':
      if (typeof o.text !== 'string' || !o.text.trim()) throw new HttpError(400, `marks[${i}] has no text`);
      return { type: 'text', ...at, text: o.text.slice(0, 5000), size: Math.max(4, Math.min(72, Number(o.size) || 11)), ...(typeof o.color === 'string' ? { color: o.color } : {}) };
    case 'check':
    case 'cross':
    case 'dot':
      return { type: o.type, ...at, size: Math.max(4, Math.min(100, Number(o.size) || 12)), ...(typeof o.color === 'string' ? { color: o.color } : {}) };
    case 'image': {
      // A saved signature by its id (its picture never leaves the server), or a picture sent (one drawn now).
      if (typeof o.signature === 'string' && o.signature) {
        const s = await signatureImage(db, o.signature);
        if (!s) throw new HttpError(404, 'That saved signature is no longer there: pick it again.');
        touchSignature(db, s.signature.id);
        return { type: 'image', ...at, w: n('w'), h: n('h'), data: s.png };
      }
      const b64 = typeof o.png === 'string' ? o.png.replace(/^data:image\/[a-z]+;base64,/, '') : '';
      const data = Buffer.from(b64, 'base64');
      if (!data.length || data.length > 15 * 1024 * 1024) throw new HttpError(400, `marks[${i}] has no picture, or one over 15 MB`);
      return { type: 'image', ...at, w: n('w'), h: n('h'), data };
    }
    default:
      throw new HttpError(400, `marks[${i}].type is text, check, cross, dot or image`);
  }
}

export function pdfRoutes(app: FastifyInstance, db: DB) {
  app.get('/api/pdf/info', async (req) => {
    const { data, mtime } = load((req.query as Record<string, string>).path);
    const info = readable(() => pdfInfo(data));
    return { ...info, mtime, size: data.length };
  });

  app.get('/api/pdf/page', async (req, reply) => {
    const q = req.query as Record<string, string>;
    const { data, mtime } = load(q.path);
    const page = Math.round(Number(q.page) || 1);
    const width = Math.max(200, Math.min(3200, Math.round(Number(q.width) || 1200)));
    let png: Buffer;
    try {
      png = await pagePicture(data, page, { width, fields: q.fields !== '0' });
    } catch (e) {
      throw new HttpError(e instanceof PdfError ? 422 : 503, (e as Error).message);
    }
    reply.header('Content-Type', 'image/png');
    // The same file (by its time) and page always look the same.
    reply.header('Cache-Control', 'private, max-age=3600');
    reply.header('ETag', `"${mtime}-${page}-${width}-${q.fields === '0' ? 0 : 1}"`);
    return reply.send(png);
  });

  app.post('/api/pdf/save', async (req) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const { file, data, mtime } = load(b.path);
    if (typeof b.mtime === 'number' && b.mtime !== mtime) throw new HttpError(409, 'The file changed since you opened it: open it again to fill it in.');
    const values = b.values && typeof b.values === 'object' && !Array.isArray(b.values) ? (b.values as Record<string, never>) : {};
    const marks = await Promise.all((Array.isArray(b.marks) ? b.marks : []).slice(0, 500).map((m, i) => markOf(m, i, db)));
    if (!Object.keys(values).length && !marks.length) throw new HttpError(400, 'Nothing to save: fill in a field or place something on a page first.');
    let out: { data: Buffer; notes: string[] };
    try {
      out = await fillAndMark(data, values, marks, { flatten: b.flatten === true });
    } catch (e) {
      throw new HttpError(e instanceof FormError || e instanceof PdfError ? 422 : 500, (e as Error).message);
    }
    if (b.replace === true) {
      const was = await trashCopy(file);
      const w = await writeFile(file, out.data, {});
      return { path: file, replaced: true, trashed: was, mtime: w.mtime, notes: out.notes };
    }
    const dest = freeName(path.dirname(file), `${path.basename(file, path.extname(file))} (filled).pdf`);
    const w = await writeFile(dest, out.data, { create: true });
    return { path: dest, replaced: false, mtime: w.mtime, notes: out.notes };
  });
}
