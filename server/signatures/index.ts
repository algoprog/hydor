// Signatures: the user draws (or types, or uploads) their signature once and keeps it, encrypted (store.ts), under a
// name; they put it into the documents they write in the Library, and agents ask for one and place one into Word
// files, PDFs, pictures and documents, each placement allowed by the user on a card first (tools.ts). A placed
// signature is a picture of one, not a cryptographic digital signature.
//
// Routes, signed in (agents' app_api may only list them: the pictures and every change are the user's):
//   GET /api/signatures                 the saved signatures (names, kinds and sizes; never their pictures)
//   GET /api/signatures/:id/image       one's picture (PNG, see-through), for the app's own pages
//   POST /api/signatures                keeps a new one; PATCH /api/signatures/:id changes one; DELETE removes it
import { HttpError } from '../auth.ts';
import type { Deps, Feature } from '../features/types.ts';
import { addSignature, changeSignature, deleteSignature, findSignature, listSignatures, pictureBytes, signatureImage, signatureTables } from './store.ts';
import { SIGNATURE_FOR_NOW_MS } from '../../shared/signatures.ts';

/** Pictures come as base64 in JSON: a little over 4 MB of PNG. */
const BODY = 6 * 1024 * 1024;

function routes(d: Deps) {
  const { app, db } = d;
  signatureTables(db);
  const changed = () => d.broadcast({ t: 'feature', id: 'signatures', data: { changed: 'signatures' } });
  const P = (req: { params: unknown }) => req.params as Record<string, string>;
  const B = (req: { body: unknown }) => (req.body ?? {}) as Record<string, unknown>;
  const own = (id: string) => {
    const s = findSignature(db, id);
    if (!s || s.id !== id) throw new HttpError(404, 'There is no such signature');
    return s;
  };

  app.get('/api/signatures', async () => ({ signatures: listSignatures(db) }));
  app.get('/api/signatures/:id/image', async (req, reply) => {
    const pic = await signatureImage(db, own(P(req).id).id);
    if (!pic) throw new HttpError(404, 'There is no such signature');
    // Only for the page that asked: never kept by a cache, never taken for anything but a picture.
    reply.header('Content-Type', 'image/png');
    reply.header('Cache-Control', 'private, no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Content-Security-Policy', "default-src 'none'");
    return reply.send(pic.png);
  });
  app.post('/api/signatures', { bodyLimit: BODY }, async (req) => {
    const b = B(req);
    // One the user gives an agent without keeping it for later goes after a day.
    const s = addSignature(db, { name: b.name, kind: b.kind, png: pictureBytes(b.image), until: b.keep === false ? Date.now() + SIGNATURE_FOR_NOW_MS : undefined });
    changed();
    return { signature: s };
  });
  app.patch('/api/signatures/:id', { bodyLimit: BODY }, async (req) => {
    const b = B(req);
    const s = changeSignature(db, own(P(req).id).id, { name: b.name, kind: b.kind, png: b.image === undefined ? undefined : pictureBytes(b.image), keep: b.keep === true });
    changed();
    return { signature: s };
  });
  app.delete('/api/signatures/:id', async (req) => {
    deleteSignature(db, own(P(req).id).id);
    changed();
    return { ok: true };
  });
}

export const signatures: Feature = {
  id: 'signatures',
  routes,
};
