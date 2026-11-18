// The history of the other browsers on this computer (Chrome and the browsers built on it, Firefox, Safari), brought into
// your own browsing's history (history.ts mergeHistory) as bookmarks.ts brings in their bookmarks: the browsers and
// profiles found are the same, with the same ids. Each browser's database is read from a copy (a running browser locks
// its file), its latest 20 000 pages with their last visit, visit count and typed count.
import fs from 'node:fs';
import path from 'node:path';
import type { HistorySource } from '../../shared/browser.ts';
import { HttpError } from '../auth.ts';
import type { Deps } from '../features/types.ts';
import { MAX_HISTORY, mergeHistory } from './history.ts';
import { chromeTime, chromiumProfiles, dirsNow, firefoxProfiles, readCopy, type Dirs } from './other-browsers.ts';

const SAFARI_DENIED = 'Hydor may not read Safari’s history: allow it in System Settings → Privacy & Security → Full Disk Access';
const UNREADABLE = 'Its history cannot be read.';

/** A page as another browser has it: its last visit in milliseconds, how often it was visited and how often its address was typed. */
interface Page {
  url: string;
  title: string;
  at: number;
  visits: number;
  typed: number;
}

interface Candidate {
  info: Omit<HistorySource, 'count' | 'error'>;
  /** How many pages would come in. */
  count: () => Promise<number>;
  /** The newest pages, newest first. */
  load: () => Promise<Page[]>;
}

/** What a database column holds when it is a web page or a file (the rest, like about: and chrome: pages, is not history). */
const web = (col: string) => `(${col} like 'http://%' or ${col} like 'https://%' or ${col} like 'file://%')`;

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Why a browser's database could not be read, in words for the person (what they can do about it, when they can do something). */
function explain(e: unknown, browser: string): Error {
  const code = (e as NodeJS.ErrnoException)?.code;
  // The browser holds the file while it runs (Windows refuses a copy of it with a permission error).
  if (code === 'EBUSY' || (process.platform === 'win32' && (code === 'EPERM' || code === 'EACCES'))) return new Error(`Close ${browser}, then try again: it locks its history while it is open`);
  if (browser === 'Safari' && (code === 'EPERM' || code === 'EACCES')) return new Error(SAFARI_DENIED);
  return new Error(UNREADABLE);
}

/** Runs a reader of one browser's database, turning what goes wrong into a plain message. */
async function guarded<T>(browser: string, file: string, read: (db: import('better-sqlite3').Database) => T): Promise<T> {
  try {
    return await readCopy(file, read);
  } catch (e) {
    throw explain(e, browser);
  }
}

// Chrome and the browsers built on it: the `urls` table of the History file; times are microseconds since 1601.
async function chromiumPages(file: string, browser: string): Promise<Page[]> {
  const rows = (await guarded(browser, file, (db) =>
    db
      .prepare(`select url, title, visit_count, typed_count, last_visit_time from urls where hidden = 0 and last_visit_time > 0 and ${web('url')} order by last_visit_time desc limit ?`)
      .all(MAX_HISTORY),
  )) as { url: string; title: string | null; visit_count: number; typed_count: number; last_visit_time: number }[];
  const out: Page[] = [];
  for (const r of rows) {
    const at = chromeTime(r.last_visit_time);
    if (at) out.push({ url: String(r.url), title: r.title ?? '', at, visits: num(r.visit_count), typed: num(r.typed_count) });
  }
  return out;
}

const chromiumCount = (file: string, browser: string): Promise<number> =>
  guarded(browser, file, (db) => (db.prepare(`select count(*) as n from (select 1 from urls where hidden = 0 and last_visit_time > 0 and ${web('url')} limit ?)`).get(MAX_HISTORY) as { n: number }).n);

// Firefox: places.sqlite; times are microseconds since 1970, and a typed visit is visit type 2.
async function firefoxPages(folder: string): Promise<Page[]> {
  const rows = (await guarded('Firefox', path.join(folder, 'places.sqlite'), (db) =>
    db
      .prepare(
        `select p.url, p.title, p.visit_count, p.last_visit_date,
          (select count(*) from moz_historyvisits v where v.place_id = p.id and v.visit_type = 2) as typed
        from moz_places p where p.hidden = 0 and p.visit_count > 0 and p.last_visit_date is not null and ${web('p.url')} order by p.last_visit_date desc limit ?`,
      )
      .all(MAX_HISTORY),
  )) as { url: string; title: string | null; visit_count: number; last_visit_date: number; typed: number }[];
  return rows.map((r) => ({ url: String(r.url), title: r.title ?? '', at: num(r.last_visit_date) / 1000, visits: num(r.visit_count), typed: num(r.typed) }));
}

const firefoxCount = (folder: string): Promise<number> =>
  guarded('Firefox', path.join(folder, 'places.sqlite'), (db) =>
    (db.prepare(`select count(*) as n from (select 1 from moz_places p where p.hidden = 0 and p.visit_count > 0 and p.last_visit_date is not null and ${web('p.url')} limit ?)`).get(MAX_HISTORY) as { n: number }).n,
  );

// Safari: History.db; times are seconds since 2001, and it does not tell typed addresses.
const SAFARI_EPOCH = 978_307_200;

async function safariPages(file: string): Promise<Page[]> {
  const rows = (await guarded('Safari', file, (db) =>
    db
      .prepare(
        `select i.url, i.visit_count, max(v.visit_time) as last,
          (select v2.title from history_visits v2 where v2.history_item = i.id and v2.title is not null and v2.title <> '' order by v2.visit_time desc limit 1) as title
        from history_items i join history_visits v on v.history_item = i.id where ${web('i.url')} group by i.id order by last desc limit ?`,
      )
      .all(MAX_HISTORY),
  )) as { url: string; visit_count: number; last: number; title: string | null }[];
  return rows.map((r) => ({ url: String(r.url), title: r.title ?? '', at: (num(r.last) + SAFARI_EPOCH) * 1000, visits: num(r.visit_count), typed: 0 }));
}

const safariCount = (file: string): Promise<number> =>
  guarded('Safari', file, (db) =>
    (db.prepare(`select count(*) as n from (select 1 from history_items i where ${web('i.url')} and exists (select 1 from history_visits v where v.history_item = i.id) limit ?)`).get(MAX_HISTORY) as { n: number }).n,
  );

function safariCandidates(h: Dirs): Candidate[] {
  if (process.platform !== 'darwin') return [];
  const file = path.join(h.home, 'Library', 'Safari', 'History.db');
  try {
    fs.statSync(file);
  } catch (e) {
    // Not there at all: Safari is not used. Refused by the system: it is, and Hydor may not look.
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
  }
  return [{ info: { id: 'safari', browser: 'Safari' }, count: () => safariCount(file), load: () => safariPages(file) }];
}

const candidates = (): Candidate[] => {
  const h = dirsNow();
  return [
    ...chromiumProfiles(h, 'History').map((p): Candidate => ({ info: { id: p.id, browser: p.browser, profile: p.profile }, count: () => chromiumCount(p.file, p.browser), load: () => chromiumPages(p.file, p.browser) })),
    ...firefoxProfiles(h).map((p): Candidate => ({ info: { id: p.id, browser: p.browser, profile: p.profile }, count: () => firefoxCount(p.folder), load: () => firefoxPages(p.folder) })),
    ...safariCandidates(h),
  ];
};

/** The browsers on this computer and their profiles that have history (or that could not be read), each with its count. */
export async function historySources(): Promise<HistorySource[]> {
  const out: HistorySource[] = [];
  for (const c of candidates()) {
    try {
      const count = await c.count();
      if (count > 0) out.push({ ...c.info, count });
    } catch (e) {
      out.push({ ...c.info, count: 0, error: (e as Error).message });
    }
  }
  return out;
}

export function historyImportRoutes(d: Deps) {
  const { app, db } = d;

  app.get('/api/browser/browsing/history/sources', async () => ({ sources: await historySources() }));

  app.post('/api/browser/browsing/history/import', async (req) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (typeof b.source !== 'string' || !b.source) throw new HttpError(400, 'Say which browser to import from.');
    const c = candidates().find((x) => x.info.id === b.source);
    if (!c) throw new HttpError(404, 'That browser’s history is not here any more.');
    let pages: Page[];
    try {
      pages = await c.load();
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    if (!pages.length) throw new HttpError(400, 'There is no history to import there.');
    return mergeHistory(db, pages);
  });
}
