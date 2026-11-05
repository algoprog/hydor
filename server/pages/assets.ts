// The pictures of slide decks, kept apart from the decks themselves: each once, by the hash of its bytes
// ("naget-asset:<sha>" in a deck), however many versions and decks show it, so a deck's text stays small, every
// version of it costs only its words, and an agent reading a deck gets no picture data. What the versions of a
// deck show is noted; a picture nothing shows any more goes a day after (one just added waits for the deck that
// will show it). A deck's own page (and its exports) gets its pictures put inside it. A deck's videos are noted and
// swept with its pictures, their files kept apart (videos.ts).
//
// Pictures come in as the editor's uploads, as data: addresses, as files of an agent's session, or from the web
// (public addresses only, bounded in time and size).
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ASSET, VIDEO } from '../../shared/slides.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import type { DB } from '../db.ts';
import { fetchPage } from '../web/fetch.ts';
import { initVideos, sweepVideos } from './videos.ts';

/** The largest picture kept. */
export const MAX_ASSET = 12 * 1024 * 1024;

export function initAssets(db: DB) {
  db.exec(`
    create table if not exists page_assets (
      sha text primary key,
      mime text not null,
      data blob not null,
      bytes integer not null,
      created_at integer not null
    );
    create table if not exists page_asset_refs (
      page_id text not null,
      version integer not null,
      sha text not null,
      primary key (page_id, version, sha)
    );
    create index if not exists page_asset_refs_sha on page_asset_refs(sha);
  `);
  initVideos(db);
}

const MIMES: Record<string, string> = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };

/** What kind of picture the bytes are, by their first bytes (an SVG by its text); null when not a picture. */
export function pictureType(b: Buffer): string | null {
  if (b.length > 8 && b.readUInt32BE(0) === 0x89504e47) return MIMES.png;
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return MIMES.jpeg;
  if (b.length > 6 && b.toString('latin1', 0, 4) === 'GIF8') return MIMES.gif;
  if (b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return MIMES.webp;
  const head = b.subarray(0, 2048).toString('utf8').replace(/^\ufeff/, '').trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!doctype svg[^>]*>\s*)?<svg[\s>]/i.test(head)) return MIMES.svg;
  return null;
}

/** Keeps a picture; its sha. One kept already counts as just added again (a file opened in an editor shows it). */
export function putAsset(db: DB, data: Buffer): string {
  if (data.length > MAX_ASSET) throw new HttpError(413, `That picture is over ${MAX_ASSET / 1024 / 1024} MB`);
  const mime = pictureType(data);
  if (!mime) throw new HttpError(415, 'That is not a picture (PNG, JPEG, GIF, WebP or SVG)');
  const sha = crypto.createHash('sha256').update(data).digest('hex').slice(0, 40);
  db.prepare('insert into page_assets (sha, mime, data, bytes, created_at) values (?, ?, ?, ?, ?) on conflict(sha) do update set created_at = excluded.created_at').run(sha, mime, data, data.length, Date.now());
  return sha;
}

export function getAsset(db: DB, sha: string): { mime: string; data: Buffer } | null {
  if (!/^[a-f0-9]{16,64}$/.test(sha)) return null;
  return (db.prepare('select mime, data from page_assets where sha = ?').get(sha) as { mime: string; data: Buffer } | undefined) ?? null;
}

/** A kept picture as a data: address, to put inside a page. */
export function assetDataUrl(db: DB, sha: string): string | null {
  const a = getAsset(db, sha);
  return a ? `data:${a.mime};base64,${a.data.toString('base64')}` : null;
}

/** The pictures (and videos, videos.ts) a version of a deck shows: noted, so they stay while it is kept. */
export function noteRefs(db: DB, pageId: string, version: number, sources: string[]) {
  const put = db.prepare('insert or ignore into page_asset_refs (page_id, version, sha) values (?, ?, ?)');
  for (const s of sources) {
    if (s.startsWith(ASSET)) put.run(pageId, version, s.slice(ASSET.length));
    else if (s.startsWith(VIDEO)) put.run(pageId, version, s.slice(VIDEO.length));
  }
}

/** Versions went (or a whole page): what they showed is no longer noted, and pictures nothing shows go after a day. */
export function dropRefs(db: DB, pageId: string, versions?: number[]) {
  if (versions) {
    const del = db.prepare('delete from page_asset_refs where page_id = ? and version = ?');
    for (const v of versions) del.run(pageId, v);
  } else db.prepare('delete from page_asset_refs where page_id = ?').run(pageId);
  sweepAssets(db);
}

export function sweepAssets(db: DB) {
  db.prepare('delete from page_assets where created_at < ? and not exists (select 1 from page_asset_refs r where r.sha = page_assets.sha)').run(Date.now() - 86_400_000);
  sweepVideos(db);
}

/** A path an agent gave: from its session's folder, from home (~), or absolute. */
const fromSession = (cwd: string | undefined, p: string) => (p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : path.resolve(cwd || config.defaultCwd, p));

/**
 * A picture's source as a deck keeps it: one the app keeps already, or a picture taken in (a data: address, a file
 * of the session's when `cwd` is given, a public address on the web). What could not be taken in is said in `notes`
 * and leaves the source empty, unless it is an address on the web, which stays as it is (shown where the web is reachable).
 */
export async function takeIn(db: DB, src: string, o: { cwd?: string; notes: string[] }): Promise<string> {
  const s = src.trim();
  if (!s) return '';
  if (s.startsWith(ASSET)) {
    if (getAsset(db, s.slice(ASSET.length))) return s;
    o.notes.push(`${s} is not a picture this app keeps; it was left out.`);
    return '';
  }
  try {
    if (s.startsWith('data:')) {
      const m = /^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=\s]+)$/i.exec(s);
      if (!m) throw new Error('a data: address that is not a base64 picture');
      return ASSET + putAsset(db, Buffer.from(m[1], 'base64'));
    }
    if (/^https?:\/\//i.test(s)) {
      try {
        const r = await fetchPage(s, { maxBytes: MAX_ASSET + 1, timeoutMs: 20_000 });
        if (r.status >= 400) throw new Error(`the site answered ${r.status}`);
        const body = r.body ?? (/svg/i.test(r.contentType) ? Buffer.from(r.text, 'utf8') : null);
        if (!body) throw new Error(`it is ${r.contentType || 'not a picture'}`);
        if (r.truncated) throw new Error(`it is over ${MAX_ASSET / 1024 / 1024} MB`);
        return ASSET + putAsset(db, body);
      } catch (e) {
        o.notes.push(`The picture at ${s} could not be fetched (${(e as Error).message}); the deck shows it from the web where it can, but exports may leave it out.`);
        return s;
      }
    }
    if (o.cwd !== undefined) {
      const file = fromSession(o.cwd, s);
      const st = fs.statSync(file, { throwIfNoEntry: false });
      if (!st?.isFile()) throw new Error('no such file');
      if (st.size > MAX_ASSET) throw new Error(`it is over ${MAX_ASSET / 1024 / 1024} MB`);
      return ASSET + putAsset(db, fs.readFileSync(file));
    }
    throw new Error('not a picture’s address');
  } catch (e) {
    o.notes.push(`The picture "${s.length > 120 ? `${s.slice(0, 120)}…` : s}" was left out: ${(e as Error).message}.`);
    return '';
  }
}
