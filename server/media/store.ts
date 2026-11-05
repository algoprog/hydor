// The Library's images, videos and audio: a row each in SQLite (its title and description, what it was made from
// and with, its size and length, a sound's shape and words, the hash of its bytes), and its file copied into the app's
// data folder (media/<id>.<ext>; moved there instead for a file the desktop app drops, or an upload), with a still to
// show it by (<id>.still.jpg) and, for a video, its frames on one picture (<id>.frames.jpg). The copy stays when the
// session's folder is cleaned up or the original is moved. The same bytes are kept once (keptWithBytes).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { CaptionStatus, MediaItem, MediaKind } from '../../shared/media.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import type { DB } from '../db.ts';
import { fileHash, moveWhole } from '../filemove.ts';
import { fitFolder } from '../pages/folders.ts';

export const MEDIA_DIR = path.join(config.dataDir, 'media');
const MAX_ITEMS = 5000;

const ready = new WeakSet<DB>();

export function initMedia(db: DB) {
  if (ready.has(db)) return;
  ready.add(db);
  db.exec(`
    create table if not exists media (
      id text primary key,
      kind text not null,
      title text not null,
      description text not null default '',
      file text not null,
      mime text not null,
      bytes integer not null,
      width integer,
      height integer,
      duration real,
      prompt text,
      model text,
      session_key text,
      source text,
      caption text not null,
      caption_error text,
      caption_by text,
      created_at integer not null,
      updated_at integer not null
    );
    create index if not exists media_source on media(source);
  `);
  // The space it belongs to (shared/spaces.ts), or none, as the Library's pages have; a sound's shape (JSON) and words.
  const cols = (db.prepare('pragma table_info(media)').all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes('space')) db.exec('alter table media add column space text');
  if (!cols.includes('peaks')) db.exec('alter table media add column peaks text');
  if (!cols.includes('lyrics')) db.exec('alter table media add column lyrics text');
  // The SHA-256 of its bytes, to keep the same file once (items kept before have none until one of their size comes).
  if (!cols.includes('sha')) db.exec('alter table media add column sha text');
  db.exec('create index if not exists media_bytes on media(bytes)');
  // The Library folder it is in (server/pages/folders.ts), or none.
  if (!cols.includes('folder')) db.exec('alter table media add column folder text');
}

interface Row {
  id: string;
  kind: MediaKind;
  title: string;
  description: string;
  file: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  prompt: string | null;
  model: string | null;
  session_key: string | null;
  source: string | null;
  caption: CaptionStatus;
  caption_error: string | null;
  caption_by: string | null;
  space: string | null;
  folder: string | null;
  peaks: string | null;
  lyrics: string | null;
  sha: string | null;
  created_at: number;
  updated_at: number;
}

/** A sound's shape as kept: levels from 0 to 1, or nothing when it does not read as one. */
function peaksOf(raw: string | null): number[] | undefined {
  if (!raw) return undefined;
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) && p.length && p.every((x) => typeof x === 'number') ? p : undefined;
  } catch {
    return undefined;
  }
}

const toItem = (r: Row): MediaItem => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  description: r.description,
  mime: r.mime,
  bytes: r.bytes,
  ...(r.width ? { width: r.width } : {}),
  ...(r.height ? { height: r.height } : {}),
  ...(r.duration ? { duration: r.duration } : {}),
  ...(peaksOf(r.peaks) ? { peaks: peaksOf(r.peaks) } : {}),
  ...(r.lyrics ? { lyrics: r.lyrics } : {}),
  ...(r.prompt ? { prompt: r.prompt } : {}),
  ...(r.model ? { model: r.model } : {}),
  ...(r.session_key ? { sessionKey: r.session_key } : {}),
  ...(r.source ? { source: r.source } : {}),
  caption: r.caption,
  ...(r.caption_error ? { captionError: r.caption_error } : {}),
  ...(r.caption_by ? { captionBy: r.caption_by } : {}),
  ...(r.space ? { space: r.space } : {}),
  ...(r.folder ? { folder: r.folder } : {}),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  file: path.join(MEDIA_DIR, r.file),
});

export function listMedia(db: DB): MediaItem[] {
  initMedia(db);
  return (db.prepare('select * from media order by created_at desc').all() as Row[]).map(toItem);
}

export function getMedia(db: DB, id: string): MediaItem | null {
  initMedia(db);
  const r = db.prepare('select * from media where id = ?').get(id) as Row | undefined;
  return r ? toItem(r) : null;
}

export function mustMedia(db: DB, id: string): MediaItem {
  const m = /^[a-f0-9]{10}$/.test(id) ? getMedia(db, id) : null;
  if (!m) throw new HttpError(404, 'No such image, video or sound in the Library');
  return m;
}

/** The item already saved from this file, as it is now (same size). */
export function savedFrom(db: DB, source: string, bytes: number): MediaItem | null {
  initMedia(db);
  const r = db.prepare('select * from media where source = ? and bytes = ? order by created_at desc limit 1').get(source, bytes) as Row | undefined;
  return r ? toItem(r) : null;
}

/**
 * The item whose file has these bytes (the same size, the same SHA-256), when one is kept: an older item of that size,
 * kept before items had their hash, has its file's taken now, once.
 */
export async function keptWithBytes(db: DB, sha: string, bytes: number): Promise<MediaItem | null> {
  initMedia(db);
  const rows = db.prepare('select * from media where bytes = ? order by created_at').all(bytes) as Row[];
  for (const r of rows) {
    let s = r.sha;
    if (!s) {
      s = await fileHash(path.join(MEDIA_DIR, r.file)).catch(() => null);
      if (!s) continue;
      db.prepare('update media set sha = ? where id = ?').run(s, r.id);
    }
    if (s === sha) return toItem(r);
  }
  return null;
}

/** The files of an item: the copy, its still and its frames. */
export const filesOf = (m: Pick<MediaItem, 'id' | 'file'>) => ({ file: m.file, still: path.join(MEDIA_DIR, `${m.id}.still.jpg`), frames: path.join(MEDIA_DIR, `${m.id}.frames.jpg`) });

export const cleanText = (t: unknown, max: number) =>
  String(t ?? '')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, max);

export interface NewMedia {
  kind: MediaKind;
  /** The file to copy in (or move in, with `move`). */
  from: string;
  /** Moved into the Library's folder rather than copied: it leaves where it was (a file the desktop app drops, an upload). */
  move?: boolean;
  /** What it was saved from, when that is not `from`: an upload's file name, or where a moved file was. */
  source?: string;
  /** The SHA-256 of its bytes. */
  sha?: string;
  ext: string;
  mime: string;
  bytes: number;
  title: string;
  description?: string;
  width?: number;
  height?: number;
  duration?: number;
  /** A sound's shape, and the words sung or spoken in it. */
  peaks?: number[];
  lyrics?: string;
  prompt?: string;
  model?: string;
  sessionKey?: string;
  /** The space it goes in (an id checked by the caller), or none. */
  space?: string | null;
}

/** Copies (or moves) the file in and adds its row, its title and description to be written (caption "pending"). */
export async function addMedia(db: DB, n: NewMedia): Promise<MediaItem> {
  initMedia(db);
  const count = (db.prepare('select count(*) as n from media').get() as { n: number }).n;
  if (count >= MAX_ITEMS) throw new HttpError(400, `The Library keeps at most ${MAX_ITEMS} images, videos and sounds: delete some first`);
  await fs.promises.mkdir(MEDIA_DIR, { recursive: true, mode: 0o700 });
  const id = crypto.randomBytes(5).toString('hex');
  const name = `${id}.${n.ext}`;
  if (n.move) await moveWhole(n.from, path.join(MEDIA_DIR, name));
  else await fs.promises.copyFile(n.from, path.join(MEDIA_DIR, name), fs.constants.COPYFILE_EXCL);
  const now = Date.now();
  db.prepare(
    `insert into media (id, kind, title, description, file, mime, bytes, width, height, duration, peaks, lyrics, prompt, model, session_key, source, caption, space, sha, created_at, updated_at)
     values (@id, @kind, @title, @description, @file, @mime, @bytes, @width, @height, @duration, @peaks, @lyrics, @prompt, @model, @session, @source, 'pending', @space, @sha, @now, @now)`,
  ).run({
    id,
    kind: n.kind,
    title: cleanText(n.title, 120) || (n.kind === 'video' ? 'Video' : n.kind === 'audio' ? 'Audio' : 'Image'),
    description: cleanText(n.description, 2000),
    file: name,
    mime: n.mime,
    bytes: n.bytes,
    width: n.width ?? null,
    height: n.height ?? null,
    duration: n.duration ?? null,
    peaks: n.peaks?.length ? JSON.stringify(n.peaks) : null,
    lyrics: n.lyrics ? String(n.lyrics).replace(/\r\n?/g, '\n').trim().slice(0, 8000) || null : null,
    prompt: n.prompt ? cleanText(n.prompt, 4000) : null,
    model: n.model ? cleanText(n.model, 120) : null,
    session: n.sessionKey ?? null,
    source: n.source ?? n.from,
    space: n.space ?? null,
    sha: n.sha ?? null,
    now,
  });
  return getMedia(db, id)!;
}

export function setCaption(db: DB, id: string, c: { title?: string; description?: string; caption: CaptionStatus; error?: string | null; by?: string | null }): MediaItem | null {
  const m = getMedia(db, id);
  if (!m) return null;
  db.prepare('update media set title = @title, description = @description, caption = @caption, caption_error = @error, caption_by = @by, updated_at = @now where id = @id').run({
    id,
    title: c.title !== undefined ? cleanText(c.title, 120) || m.title : m.title,
    description: c.description !== undefined ? cleanText(c.description, 2000) : m.description,
    caption: c.caption,
    error: c.error ?? null,
    by: c.by === undefined ? (m.captionBy ?? null) : c.by,
    now: Date.now(),
  });
  return getMedia(db, id);
}

/** The user's own title or description: kept as they wrote it. */
export function editMedia(db: DB, id: string, p: { title?: unknown; description?: unknown }): MediaItem {
  const m = mustMedia(db, id);
  const title = p.title !== undefined ? cleanText(p.title, 120) : m.title;
  if (!title) throw new HttpError(400, 'A title, please');
  return setCaption(db, id, { title, description: p.description !== undefined ? cleanText(p.description, 2000) : m.description, caption: 'edited', error: null })!;
}

/** Puts an item in a space (its id, checked by the caller), or in none. */
export function setMediaSpace(db: DB, id: string, space: string | null): MediaItem {
  mustMedia(db, id);
  db.prepare('update media set space = ? where id = ?').run(space, id);
  // Out of its Library folder, unless that folder is in the space too.
  fitFolder(db, 'media', id);
  return getMedia(db, id)!;
}

export async function deleteMedia(db: DB, id: string) {
  const m = mustMedia(db, id);
  db.prepare('delete from media where id = ?').run(id);
  const f = filesOf(m);
  for (const p of [f.file, f.still, f.frames]) await fs.promises.rm(p, { force: true });
}
