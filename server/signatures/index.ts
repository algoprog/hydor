// Signatures: the user draws (or types, or uploads) their signature once and keeps it, encrypted (store.ts), under a
// name; they put it into the documents they write in the Library, and agents ask for one and place one into Word
// files, PDFs, pictures and documents, each placement allowed by the user on a card first (tools.ts). A placed
// signature is a picture of one, not a cryptographic digital signature.
//
// Routes, signed in (agents' app_api may only list them: the pictures and every change are the user's):
//   GET /api/signatures                 the saved signatures (names, kinds and sizes; never their pictures)
//   GET /api/signatures/:id/image       one's picture (PNG, see-through), for the app's own pages
//   POST /api/signatures                keeps a new one; PATCH /api/signatures/:id changes one; DELETE removes it
//   POST /api/signatures/:id/asset      one put into a document of the Library: kept as one of its pictures
//   GET /api/signatures/previews/:token a page as an agent would sign it, for the card that asks
import { HttpError } from '../auth.ts';
import type { Deps, Feature } from '../features/types.ts';
import { ASSET } from '../../shared/docs.ts';
import { putAsset } from '../pages/assets.ts';
import { addSignature, changeSignature, deleteSignature, findSignature, listSignatures, pictureBytes, signatureImage, signatureTables, touchSignature } from './store.ts';
import { SIGNATURE_FOR_NOW_MS } from '../../shared/signatures.ts';
import { previewPicture, signatureTools } from './tools.ts';

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
  // Into a document of the Library (Insert → Signature): kept as one of its pictures, which the document shows from then on.
  app.post('/api/signatures/:id/asset', async (req) => {
    const pic = await signatureImage(db, own(P(req).id).id);
    if (!pic) throw new HttpError(404, 'There is no such signature');
    const src = `${ASSET}${putAsset(db, pic.png)}`;
    touchSignature(db, pic.signature.id);
    changed();
    return { src, width: pic.width, height: pic.height };
  });
  // A page as an agent would sign it, for the card that asks the user.
  app.get('/api/signatures/previews/:token', async (req, reply) => {
    const png = previewPicture(P(req).token);
    if (!png) throw new HttpError(404, 'That picture is no longer kept');
    reply.header('Content-Type', 'image/png');
    reply.header('Cache-Control', 'private, no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Content-Security-Policy', "default-src 'none'");
    return reply.send(png);
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
  tools: signatureTools,
  spawn: () => ({
    instructions: [
      'Signatures: the user can keep their signature (a picture of it, drawn once) to sign documents and files with. To sign one for them, use place_signature with a saved signature by name (look first with look: true; the user allows each placement on a card); if none is saved, ask_signature has them draw one. A placed signature is a picture of their signature, not a cryptographic digital signature.',
    ],
  }),
};
