// What your own browsing has downloaded, kept in a list of the app's database (the Downloads panel shows the last few of
// the open browser; this list outlives it, so the search box can find a file you got last month). A row is made when a
// download ends, done or failed, and the last 5 000 are kept. Clearing browsing data with the history ticked clears it too
// (the files stay where they were saved).
import type { DownloadEntry } from '../../shared/browser.ts';
import type { DB } from '../db.ts';
import { dropVectors, sweepDownloadVectors } from './meaning.ts';

export const MAX_DOWNLOADS = 5000;
const NAME_MAX = 200;
const PATH_MAX = 2000;
const URL_MAX = 2000;

export type { DownloadEntry };

const ready = new WeakSet<DB>();
export function downloadsTable(db: DB) {
  if (ready.has(db)) return;
  db.exec(`create table if not exists browser_downloads (
    id integer primary key autoincrement,
    name text not null,
    path text not null default '',
    url text not null default '',
    at integer not null,
    failed integer not null default 0
  )`);
  db.exec('create index if not exists browser_downloads_at on browser_downloads(at)');
  ready.add(db);
}

interface Row {
  id: number;
  name: string;
  path: string;
  url: string;
  at: number;
  failed: number;
}
const entry = (r: Row): DownloadEntry => ({ id: r.id, name: r.name, path: r.path, url: r.url, at: r.at, failed: !!r.failed });

/** An address worth keeping with a download: a website's or a file's, without its #fragment (a blob: or data: address is no page). */
const sourceUrl = (url: unknown): string => {
  const u = String(url ?? '').replace(/#.*$/s, '');
  return /^(https?|file):\/\//i.test(u) && u.length <= URL_MAX ? u : '';
};

/** A download that ended: kept in the list (`path` empty: it failed). The oldest go once there are more than the most. */
export function addDownload(db: DB, d: { name: string; path?: string | null; url?: unknown; failed?: boolean; at?: number }): DownloadEntry {
  downloadsTable(db);
  const at = d.at ?? Date.now();
  const row = {
    name: String(d.name || 'download').slice(0, NAME_MAX),
    path: String(d.path ?? '').slice(0, PATH_MAX),
    url: sourceUrl(d.url),
    failed: d.failed ?? !d.path,
  };
  let trimmed = false;
  const go = db.transaction((): number => {
    const r = db.prepare('insert into browser_downloads (name, path, url, at, failed) values (?, ?, ?, ?, ?)').run(row.name, row.path, row.url, at, row.failed ? 1 : 0);
    const n = (db.prepare('select count(*) as n from browser_downloads').get() as { n: number }).n;
    if (n > MAX_DOWNLOADS) {
      db.prepare('delete from browser_downloads where id in (select id from browser_downloads order by at asc, id asc limit ?)').run(n - MAX_DOWNLOADS);
      trimmed = true;
    }
    return Number(r.lastInsertRowid);
  });
  const id = go();
  if (trimmed) sweepDownloadVectors(db);
  return { id, name: row.name, path: row.path, url: row.url, at, failed: row.failed };
}

/** The downloads, newest first; `q`: only those with all its words in the name or the address it came from; `before`: only those older than this time (the next page of a long list). */
export function listDownloads(db: DB, o: { q?: string; limit?: number; before?: number } = {}): DownloadEntry[] {
  downloadsTable(db);
  const limit = Math.max(1, Math.min(200, Math.floor(o.limit ?? 100) || 100));
  const words = (o.q ?? '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  // The words are looked for in lower case in any language, which the database's own lower() does for ASCII only: the (at most 5 000) rows are read and tested here.
  const rows = db.prepare('select id, name, path, url, at, failed from browser_downloads order by at desc, id desc').all() as Row[];
  const out: DownloadEntry[] = [];
  for (const r of rows) {
    if (o.before !== undefined && r.at >= o.before) continue;
    if (words.length) {
      const hay = `${r.name}\n${r.url}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) continue;
    }
    out.push(entry(r));
    if (out.length >= limit) break;
  }
  return out;
}

export function downloadsByIds(db: DB, ids: number[]): DownloadEntry[] {
  downloadsTable(db);
  const get = db.prepare('select id, name, path, url, at, failed from browser_downloads where id = ?');
  return ids.flatMap((id) => {
    const r = get.get(id) as Row | undefined;
    return r ? [entry(r)] : [];
  });
}

export function downloadCount(db: DB): number {
  downloadsTable(db);
  return (db.prepare('select count(*) as n from browser_downloads').get() as { n: number }).n;
}

/** How many downloads listDownloads finds for the words (all of them with none). */
export function countDownloads(db: DB, q = ''): number {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  if (!words.length) return downloadCount(db);
  downloadsTable(db);
  const rows = db.prepare('select name, url from browser_downloads').all() as Pick<Row, 'name' | 'url'>[];
  return rows.filter((r) => {
    const hay = `${r.name}\n${r.url}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  }).length;
}

/** Clears the list: everything downloaded since that time, or all of it (the files stay). Returns how many went. */
export function clearDownloads(db: DB, since?: number): number {
  downloadsTable(db);
  const n = (since === undefined ? db.prepare('delete from browser_downloads').run() : db.prepare('delete from browser_downloads where at >= ?').run(since)).changes;
  sweepDownloadVectors(db);
  return n;
}

/** Takes one download out of the list (the file stays where it was saved) and its vector with it. True when it was there. */
export function removeDownload(db: DB, id: number): boolean {
  downloadsTable(db);
  const n = db.prepare('delete from browser_downloads where id = ?').run(id).changes;
  dropVectors(db, 'download', [String(id)]);
  return n > 0;
}
