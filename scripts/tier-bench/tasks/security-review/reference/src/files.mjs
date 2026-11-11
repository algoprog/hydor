// Each person's files, kept in <data folder>/files/<user name>/ with a record of each in the data.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from './util.mjs';

const folder = (store, userName) => path.join(store.dir, 'files', userName);

// The path of a file in a folder. A name that is not a plain file name, or would end up outside the folder, is refused.
function inside(dir, name) {
  const plain = typeof name === 'string' && name.length > 0 && Buffer.byteLength(name) <= 255 && !/[/\\\0]/.test(name) && name !== '.' && name !== '..';
  const full = plain ? path.resolve(dir, name) : null;
  if (!full || path.dirname(full) !== path.resolve(dir)) throw new HttpError(400, 'that is not a usable file name');
  return full;
}

function describe(file) {
  return { id: file.id, name: file.name, size: file.size, createdAt: file.createdAt };
}

export function upload(store, user, name, data) {
  if (typeof name !== 'string' || name.length === 0) throw new HttpError(400, 'the file needs a name');
  const target = inside(folder(store, user.name), name);
  fs.mkdirSync(folder(store, user.name), { recursive: true });
  fs.writeFileSync(target, data);
  let file = store.data.files.find((f) => f.owner === user.id && f.name === name);
  if (file) {
    file.size = data.length;
  } else {
    file = { id: crypto.randomBytes(8).toString('hex'), owner: user.id, name, size: data.length, createdAt: new Date().toISOString() };
    store.data.files.push(file);
  }
  store.save();
  return describe(file);
}

export function list(store, user) {
  return store.data.files
    .filter((f) => f.owner === user.id)
    .map(describe)
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function readFrom(dir, name) {
  try {
    return fs.readFileSync(inside(dir, name));
  } catch {
    throw new HttpError(404, 'no such file');
  }
}

export function download(store, user, name) {
  return { name, data: readFrom(folder(store, user.name), name) };
}

export function downloadById(store, user, id) {
  const file = store.data.files.find((f) => f.id === id);
  const owner = file && store.userById(file.owner);
  if (!file || !owner || file.owner !== user.id) throw new HttpError(404, 'no such file');
  return { name: file.name, data: readFrom(folder(store, owner.name), file.name) };
}

// The file with this record, for the share links.
export function readRecord(store, file) {
  const owner = store.userById(file.owner);
  if (!owner) throw new HttpError(404, 'no such file');
  return readFrom(folder(store, owner.name), file.name);
}

export function remove(store, user, name) {
  const file = store.data.files.find((f) => f.owner === user.id && f.name === name);
  if (!file) throw new HttpError(404, 'no such file');
  fs.rmSync(inside(folder(store, user.name), file.name), { force: true });
  dropFile(store, file);
  store.save();
}

// Forgets a file's record and the share links to it (the caller saves).
export function dropFile(store, file) {
  store.data.files = store.data.files.filter((f) => f !== file);
  store.data.shares = store.data.shares.filter((s) => s.fileId !== file.id);
}

export function removeAllOf(store, user) {
  for (const file of store.data.files.filter((f) => f.owner === user.id)) dropFile(store, file);
  fs.rmSync(folder(store, user.name), { recursive: true, force: true });
}
