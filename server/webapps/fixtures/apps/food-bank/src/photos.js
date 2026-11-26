// Photos: only real pictures, checked by what is in the file, not by its name.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PHOTO_DIR } from './db.js';
import { Refusal } from './rules.js';

const MAX_BYTES = 10 * 1024 * 1024;
export const TYPES = { jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };

function kind(b) {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (/^GIF8[79]a/.test(b.subarray(0, 6).toString('latin1'))) return 'gif';
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

// Takes the File from the form; gives back the new file name, or undefined if none was chosen.
export async function readPhoto(file) {
  if (!file || typeof file === 'string' || (!file.size && !file.name)) return undefined;
  if (file.size > MAX_BYTES) throw new Refusal('That photo is too big (at most 10 MB).');
  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = kind(bytes);
  if (!ext) throw new Refusal('The photo must be a picture (JPEG, PNG, GIF or WebP).');
  return { name: `${crypto.randomBytes(16).toString('hex')}.${ext}`, bytes };
}

export const savePhoto = (photo) => fs.writeFileSync(path.join(PHOTO_DIR, photo.name), photo.bytes);

export function deletePhoto(url) {
  if (url) fs.rmSync(path.join(PHOTO_DIR, path.basename(url)), { force: true });
}
