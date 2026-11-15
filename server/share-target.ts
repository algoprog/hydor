// Share to Hydor: the web app installed on a phone or a computer (the browser's Install, or Add to Home Screen) is a
// target of the system's share sheet (the manifest's share_target, web/public/manifest.webmanifest). What another app
// shares comes to POST /share as a form: its title, words, link and files. Only when signed in: the files are saved
// where the message box's uploads go (each share in a folder of its own), the rest is kept for an hour, and the start
// page opens with all of it in its message box (/?share=<id>, read with GET /api/share/:id) for you to add a word and
// send. The service worker (web/public/sw.js) sends a share on from the page's own origin when it can, so the sign-in
// goes with it; a share the system sends straight here is checked the same way.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Shared } from '../shared/share-target.ts';
import { HttpError } from './auth.ts';
import { saveIn } from './chatapps/files.ts';

/** A share carries up to 25 MB of files, as the message box does (and a little more for its form). */
export const MAX_SHARE = 25 * 1024 * 1024;
const KEEP_MS = 60 * 60_000;
const MAX_FILES = 20;

const shares = new Map<string, Shared>();

/** Shares older than an hour go (their files stay, as uploads do, until the uploads are cleaned). */
function prune() {
  const old = Date.now() - KEEP_MS;
  for (const [id, s] of shares) if (s.at < old) shares.delete(id);
  while (shares.size > 50) shares.delete(shares.keys().next().value!);
}

class TooBig extends Error {}

async function readAll(body: Readable, max: number): Promise<Buffer> {
  const parts: Buffer[] = [];
  let n = 0;
  for await (const c of body) {
    n += (c as Buffer).length;
    if (n > max) throw new TooBig();
    parts.push(c as Buffer);
  }
  return Buffer.concat(parts);
}

const field = (v: FormDataEntryValue | null | undefined, max: number) => (typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim().slice(0, max) : '');

/** Takes one share's form: its words kept, its files saved in a folder of their own under `uploads`. */
export async function takeShare(req: FastifyRequest, uploads: string): Promise<Shared> {
  const type = String(req.headers['content-type'] ?? '');
  let form: FormData;
  if (/^multipart\/form-data/i.test(type)) {
    const raw = await readAll(req.body as Readable, MAX_SHARE + 256 * 1024);
    try {
      form = await new Response(new Uint8Array(raw), { headers: { 'content-type': type } }).formData();
    } catch {
      throw new HttpError(400, 'That is not a form a share sends');
    }
  } else if (req.body && typeof req.body === 'object' && !(typeof (req.body as Readable).on === 'function')) {
    form = new FormData();
    for (const [k, v] of Object.entries(req.body as Record<string, unknown>)) if (typeof v === 'string') form.append(k, v);
  } else throw new HttpError(415, 'Send a share as a form');
  const files = form.getAll('files').filter((f): f is File => typeof f === 'object' && f !== null && 'arrayBuffer' in f && (f as File).size > 0);
  if (files.reduce((n, f) => n + f.size, 0) > MAX_SHARE) throw new TooBig();
  const id = crypto.randomBytes(9).toString('base64url');
  const saved: Shared['files'] = [];
  if (files.length) {
    const dir = path.join(uploads, `share-${crypto.randomBytes(4).toString('hex')}`);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    for (const [i, f] of files.slice(0, MAX_FILES).entries()) {
      const p = saveIn(dir, f.name || `shared-${i + 1}`, Buffer.from(await f.arrayBuffer()));
      saved.push({ path: p, name: path.basename(p), size: f.size });
    }
  }
  const s: Shared = { id, title: field(form.get('title'), 500), text: field(form.get('text'), 60_000), url: field(form.get('url'), 4000), files: saved, at: Date.now() };
  if (!s.title && !s.text && !s.url && !saved.length) throw new HttpError(400, 'Nothing was shared');
  prune();
  shares.set(id, s);
  return s;
}

/** A share kept, by its id (null when there is none, or it is over an hour old). */
export function sharedById(id: string): Shared | null {
  prune();
  return shares.get(id) ?? null;
}

/**
 * The routes: POST /share (the share sheet's form; signed in only) and GET /api/share/:id (what the start page puts in its
 * box). `signedIn` is the app's own check of the sign-in cookie: /share is not under /api, so the app's guard leaves it
 * to this (a form from another site never carries the cookie, which is SameSite=Strict, and is refused besides).
 */
export function shareRoutes(app: FastifyInstance, o: { signedIn(req: FastifyRequest): boolean; uploads: string }) {
  // A share's form, read by its route as it comes.
  if (!app.hasContentTypeParser('multipart/form-data')) app.addContentTypeParser('multipart/form-data', (_req, payload, done) => done(null, payload));
  app.post('/share', async (req: FastifyRequest, reply: FastifyReply) => {
    const json = /application\/json/i.test(String(req.headers.accept ?? ''));
    const answer = (status: number, id: string | null, trouble?: string) =>
      json ? reply.code(status).send(id ? { id } : { error: trouble }) : reply.code(303).header('Location', `/?share=${encodeURIComponent(id ?? trouble ?? 'failed')}`).send();
    if (req.headers['sec-fetch-site'] === 'cross-site') return answer(403, null, 'failed');
    if (!o.signedIn(req)) {
      // What was sent is not read.
      (req.body as Readable | undefined)?.resume?.();
      return answer(401, null, 'signed-out');
    }
    try {
      const s = await takeShare(req, o.uploads);
      return answer(200, s.id);
    } catch (e) {
      if (e instanceof TooBig) return answer(413, null, 'too-big');
      if (json) throw e;
      return answer(400, null, 'failed');
    }
  });
  app.get('/api/share/:id', async (req) => {
    const s = sharedById(String((req.params as { id: string }).id));
    if (!s) throw new HttpError(404, 'That share is gone: share it again');
    return s;
  });
}
