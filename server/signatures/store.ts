// The user's saved signatures (a signature, initials, under names of their choosing): each a PNG with a see-through
// background, sealed with the vault's key (AES-256-GCM, bound to its row, sealed again when the key is replaced), so
// the database never holds a picture in the clear. Its picture leaves only for the app's own pages
// (GET /api/signatures/:id/image, which agents' tools are refused) and into the files the user or an agent signs;
// agents know signatures by name. One given to an agent without keeping it for later goes after a day.
import crypto from 'node:crypto';
import { SIGNATURE_LIMITS, signatureKind, signatureName, type SignatureKind, type SignatureView } from '../../shared/signatures.ts';
import { HttpError } from '../auth.ts';
import { addSealed, seal, unseal } from '../connections/vault.ts';
import type { DB } from '../db.ts';
import { readPng, writePng } from './png.ts';

interface Row {
  id: string;
  name: string;
  kind: string;
  image: string;
  width: number;
  height: number;
  created_at: number;
  updated_at: number;
  used_at: number | null;
  until: number | null;
}

const aad = (id: string) => `signature:${id}`;

export function signatureTables(db: DB) {
  db.exec(`create table if not exists signatures (
    id text primary key, name text not null, kind text not null, image text not null, width integer not null, height integer not null,
    created_at integer not null, updated_at integer not null, used_at integer, until integer
  );
  create unique index if not exists signatures_name on signatures (name collate nocase);`);
  addSealed({ table: 'signatures', id: 'id', col: 'image', aad });
}

const view = (r: Row): SignatureView => ({
  id: r.id,
  name: r.name,
  kind: signatureKind(r.kind),
  width: r.width,
  height: r.height,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  ...(r.used_at ? { usedAt: r.used_at } : {}),
  ...(r.until ? { until: r.until } : {}),
});

/** Signatures kept only for a while go once their time is up. */
function sweep(db: DB) {
  db.prepare('delete from signatures where until is not null and until < ?').run(Date.now());
}

export function listSignatures(db: DB): SignatureView[] {
  sweep(db);
  return (db.prepare("select * from signatures order by case kind when 'signature' then 0 else 1 end, created_at").all() as Row[]).map(view);
}

/** A signature by its id, or by its name (any case). */
export function findSignature(db: DB, idOrName: string): SignatureView | null {
  sweep(db);
  const s = String(idOrName ?? '').trim();
  if (!s) return null;
  const r = (db.prepare('select * from signatures where id = ?').get(s) ?? db.prepare('select * from signatures where name = ? collate nocase').get(signatureName(s))) as Row | undefined;
  return r ? view(r) : null;
}

/** The PNG a picture is kept as: read, checked and written again, so only its pixels stay (no text chunks, no other data). */
export function cleanPicture(png: Buffer): { png: Buffer; width: number; height: number } {
  if (!png.length) throw new HttpError(400, 'Draw, type or upload a signature first');
  if (png.length > SIGNATURE_LIMITS.bytes) throw new HttpError(413, 'That picture is too large for a signature');
  let img;
  try {
    img = readPng(png, { maxPixels: SIGNATURE_LIMITS.side * SIGNATURE_LIMITS.side });
  } catch (e) {
    throw new HttpError(400, `A signature is a PNG picture: ${(e as Error).message}`);
  }
  if (Math.max(img.width, img.height) > SIGNATURE_LIMITS.side) throw new HttpError(413, 'That picture is too large for a signature');
  let ink = false;
  for (let i = 3; i < img.data.length && !ink; i += 4) ink = img.data[i] > 8;
  if (!ink) throw new HttpError(400, 'The picture is empty: draw, type or upload a signature first');
  return { png: writePng(img), width: img.width, height: img.height };
}

/** A picture as a page or a card sends it: base64, or a data: address. */
export function pictureBytes(v: unknown): Buffer {
  const s = typeof v === 'string' ? v.trim().replace(/^data:image\/png;base64,/, '') : '';
  if (!s || !/^[A-Za-z0-9+/=\s]+$/.test(s)) throw new HttpError(400, 'Send the signature as a PNG picture (base64)');
  return Buffer.from(s, 'base64');
}

const taken = (db: DB, name: string, not = '') => !!db.prepare('select 1 from signatures where name = ? collate nocase and id != ?').get(name, not);

/** Keeps a new signature; `until` keeps it only that long. */
export function addSignature(db: DB, s: { name: unknown; kind?: unknown; png: Buffer; until?: number }): SignatureView {
  sweep(db);
  const name = signatureName(s.name);
  if (!name) throw new HttpError(400, 'Give it a name, like “Signature” or “Initials”');
  if (taken(db, name)) throw new HttpError(409, `There is a signature named “${name}” already: choose another name, or draw that one again`);
  const n = (db.prepare('select count(*) as n from signatures').get() as { n: number }).n;
  if (n >= SIGNATURE_LIMITS.count) throw new HttpError(409, `At most ${SIGNATURE_LIMITS.count} signatures are kept: delete one first`);
  const pic = cleanPicture(s.png);
  const id = `sg_${crypto.randomBytes(9).toString('base64url')}`;
  const now = Date.now();
  db.prepare('insert into signatures (id, name, kind, image, width, height, created_at, updated_at, until) values (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    id,
    name,
    signatureKind(s.kind),
    seal(pic.png.toString('base64'), aad(id)),
    pic.width,
    pic.height,
    now,
    now,
    s.until ?? null,
  );
  return findSignature(db, id)!;
}

/** Renames one, changes its kind, draws it again (`png`), or keeps it for good (`keep`). */
export function changeSignature(db: DB, id: string, c: { name?: unknown; kind?: unknown; png?: Buffer; keep?: boolean }): SignatureView {
  const old = db.prepare('select * from signatures where id = ?').get(id) as Row | undefined;
  if (!old) throw new HttpError(404, 'There is no such signature');
  const name = c.name === undefined ? old.name : signatureName(c.name);
  if (!name) throw new HttpError(400, 'Give it a name, like “Signature” or “Initials”');
  if (taken(db, name, id)) throw new HttpError(409, `There is a signature named “${name}” already`);
  const kind: SignatureKind = c.kind === undefined ? signatureKind(old.kind) : signatureKind(c.kind);
  const pic = c.png ? cleanPicture(c.png) : null;
  db.prepare('update signatures set name = ?, kind = ?, image = ?, width = ?, height = ?, updated_at = ?, until = ? where id = ?').run(
    name,
    kind,
    pic ? seal(pic.png.toString('base64'), aad(id)) : old.image,
    pic?.width ?? old.width,
    pic?.height ?? old.height,
    Date.now(),
    c.keep ? null : old.until,
    id,
  );
  return findSignature(db, id)!;
}

export function deleteSignature(db: DB, id: string) {
  db.prepare('delete from signatures where id = ?').run(id);
}

/** Notes that a signature was placed into something now. */
export const touchSignature = (db: DB, id: string) => db.prepare('update signatures set used_at = ? where id = ?').run(Date.now(), id);

/**
 * A saved signature's picture (by its id, or its name in any case): the PNG with its see-through background and its
 * size in pixels; null when there is none. For the server's own use (placing it into a file) and the app's own pages:
 * never for an agent to see.
 */
export async function signatureImage(db: DB, idOrName: string): Promise<{ png: Buffer; width: number; height: number; signature: SignatureView } | null> {
  const s = findSignature(db, idOrName);
  if (!s) return null;
  const r = db.prepare('select image from signatures where id = ?').get(s.id) as { image: string } | undefined;
  if (!r) return null;
  return { png: Buffer.from(unseal(r.image, aad(s.id)), 'base64'), width: s.width, height: s.height, signature: s };
}
