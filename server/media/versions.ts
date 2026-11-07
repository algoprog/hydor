// Earlier versions of the Library's pictures, videos and sounds. When one is saved over (in its editor, by an agent, or
// by someone it is shared with through their link), the file it had is kept, with its size, length and shape and who
// made it, in media/versions/<id>/<version>.<ext>; the newest five are kept, at most 2 GB of them an item, the oldest
// going first. Bringing one back keeps the one shown now as a version in its turn, so nothing is lost by it.
//
// Routes, signed in (media/index.ts):
//   GET  /api/media/:id/versions               { versions: MediaVersion[] } the newest first
//   GET  /api/media/:id/versions/:v/file       its file (?download=1 to save it)
//   POST /api/media/:id/versions/:v/restore    → { item } it is the one shown again
import fs from 'node:fs';
import path from 'node:path';
import { MEDIA_VERSION_LIMITS, type MediaItem, type MediaVersion } from '../../shared/media.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { moveWhole } from '../filemove.ts';
import { frameGrid, still } from './frames.ts';
import { filesOf, getMedia, initMedia, MEDIA_DIR, mustMedia, versionsDir } from './store.ts';

interface Row {
  media_id: string;
  version: number;
  file: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  peaks: string | null;
  sha: string | null;
  who: string | null;
  created_at: number;
}

const toVersion = (r: Row): MediaVersion => ({
  version: r.version,
  mime: r.mime,
  bytes: r.bytes,
  ...(r.width ? { width: r.width } : {}),
  ...(r.height ? { height: r.height } : {}),
  ...(r.duration ? { duration: r.duration } : {}),
  ...(r.who ? { who: r.who } : {}),
  at: r.created_at,
});

/** An item's earlier versions, the newest first. */
export function listMediaVersions(db: DB, id: string): MediaVersion[] {
  initMedia(db);
  return (db.prepare('select * from media_versions where media_id = ? order by version desc').all(id) as Row[]).map(toVersion);
}

function versionRow(db: DB, id: string, v: number): Row {
  initMedia(db);
  const r = Number.isInteger(v) ? (db.prepare('select * from media_versions where media_id = ? and version = ?').get(id, v) as Row | undefined) : undefined;
  if (!r) throw new HttpError(404, 'That version is no longer kept');
  return r;
}

/** A version's file, and its kind of file. */
export function mediaVersionFile(db: DB, id: string, v: number): { file: string; mime: string } {
  const r = versionRow(db, id, v);
  const file = path.join(versionsDir(id), r.file);
  if (!fs.existsSync(file)) throw new HttpError(404, 'That version’s file is gone');
  return { file, mime: r.mime };
}

/** Keeps the newest versions within the limits: the oldest go first. */
function prune(db: DB, id: string) {
  const rows = db.prepare('select version, file, bytes from media_versions where media_id = ? order by version desc').all(id) as { version: number; file: string; bytes: number }[];
  let total = 0;
  const drop = rows.filter((r, i) => {
    total += r.bytes;
    return i >= MEDIA_VERSION_LIMITS.count || total > MEDIA_VERSION_LIMITS.bytes;
  });
  for (const r of drop) {
    db.prepare('delete from media_versions where media_id = ? and version = ?').run(id, r.version);
    fs.rmSync(path.join(versionsDir(id), r.file), { force: true });
  }
}

/**
 * Keeps the file an item has now as an earlier version, before it is saved over: moved (not copied) out of the way, so
 * the new file takes its place. Nothing to keep (no file there): nothing is done.
 */
export async function keepEarlierVersion(db: DB, m: MediaItem): Promise<void> {
  initMedia(db);
  if (!fs.existsSync(m.file)) return;
  const row = db.prepare('select peaks, sha, who from media where id = ?').get(m.id) as { peaks: string | null; sha: string | null; who: string | null } | undefined;
  const v = ((db.prepare('select max(version) as n from media_versions where media_id = ?').get(m.id) as { n: number | null }).n ?? 0) + 1;
  const ext = path.extname(m.file).slice(1).toLowerCase() || 'bin';
  const name = `${v}.${ext}`;
  await fs.promises.mkdir(versionsDir(m.id), { recursive: true, mode: 0o700 });
  await moveWhole(m.file, path.join(versionsDir(m.id), name));
  db.prepare('insert into media_versions (media_id, version, file, mime, bytes, width, height, duration, peaks, sha, who, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    m.id,
    v,
    name,
    m.mime,
    m.bytes,
    m.width ?? null,
    m.height ?? null,
    m.duration ?? null,
    row?.peaks ?? null,
    row?.sha ?? null,
    row?.who ?? null,
    Date.now(),
  );
  prune(db, m.id);
}

/** Its still (and a video's frames) made again from the file it has now. */
export async function remakeStills(m: MediaItem) {
  const f = filesOf(m);
  await fs.promises.rm(f.still, { force: true }).catch(() => {});
  await fs.promises.rm(f.frames, { force: true }).catch(() => {});
  if (m.kind === 'video') {
    await still(f.file, f.still, { at: m.duration ? Math.min(m.duration * 0.1, 2) : undefined, width: 720 }).catch(() => {});
    void frameGrid(f.file, f.frames, { duration: m.duration, width: m.width, height: m.height }).catch(() => {});
  } else if (m.kind === 'image' && (m.bytes > 400 * 1024 || (m.width ?? 0) > 1200)) await still(f.file, f.still, { width: 720 }).catch(() => {});
}

/** Brings an earlier version back: the one shown now is kept as a version in its turn. The pages hear of it. */
export async function restoreMediaVersion(d: Pick<Deps, 'db' | 'broadcast'>, id: string, v: number): Promise<MediaItem> {
  const { db } = d;
  const m = mustMedia(db, id);
  const r = versionRow(db, id, v);
  const from = path.join(versionsDir(id), r.file);
  if (!fs.existsSync(from)) throw new HttpError(404, 'That version’s file is gone');
  // Out of the way first, under a name of its own: keeping the current one may prune this one.
  const ext = path.extname(r.file).slice(1).toLowerCase() || 'bin';
  const held = path.join(MEDIA_DIR, `.${id}.restore.${ext}`);
  await moveWhole(from, held);
  db.prepare('delete from media_versions where media_id = ? and version = ?').run(id, v);
  try {
    await keepEarlierVersion(db, m);
  } catch (e) {
    await moveWhole(held, from).catch(() => {});
    throw e;
  }
  const name = `${id}.${ext}`;
  await fs.promises.rename(held, path.join(MEDIA_DIR, name));
  db.prepare('update media set file = ?, mime = ?, bytes = ?, width = ?, height = ?, duration = ?, peaks = ?, sha = ?, who = ?, updated_at = ? where id = ?').run(
    name,
    r.mime,
    r.bytes,
    r.width,
    r.height,
    r.duration,
    r.peaks,
    r.sha,
    r.who,
    Date.now(),
    id,
  );
  const item = getMedia(db, id)!;
  await remakeStills(item);
  d.broadcast({ t: 'feature', id: 'media', data: { what: 'media', item: getMedia(db, id)! } });
  return getMedia(db, id)!;
}
