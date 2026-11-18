// The highlights you made on web pages in your own browsing: a table of the app's database, kept by the page they are on
// (shared/highlights.ts `highlightKey`). Private to you: the routes are under /api/browser/browsing/, which agents are
// refused, and nothing here is copied into the Library, memory or a session.
import crypto from 'node:crypto';
import { HIGHLIGHT_CONTEXT, HIGHLIGHT_MAX, HIGHLIGHT_NOTE_MAX, highlightKey, type PageHighlight } from '../../shared/highlights.ts';
import type { DB } from '../db.ts';

const TITLE_MAX = 300;
const URL_MAX = 2000;
/** The most highlights one page keeps, and the most a list returns. */
export const MAX_PER_PAGE = 500;
export const MAX_LIST = 1000;

const ready = new WeakSet<DB>();
export function table(db: DB) {
  if (ready.has(db)) return;
  db.exec(`create table if not exists browser_highlights (
    id text primary key,
    key text not null,
    url text not null,
    title text not null default '',
    text text not null,
    prefix text not null default '',
    suffix text not null default '',
    note text not null default '',
    hay text not null,
    at integer not null
  )`);
  db.exec('create index if not exists browser_highlights_key on browser_highlights(key, at)');
  db.exec('create index if not exists browser_highlights_at on browser_highlights(at)');
  ready.add(db);
}

interface Row {
  id: string;
  key: string;
  url: string;
  title: string;
  text: string;
  prefix: string;
  suffix: string;
  note: string;
  at: number;
}
const COLS = 'id, key, url, title, text, prefix, suffix, note, at';
const one = (s: unknown, max: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
/** Words round a highlight: spaces gathered, but the ones at their edges kept (they are where the page's words meet them). */
const around = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ');
const hayOf = (h: { title: string; text: string; note: string; url: string }) => `${h.title}\n${h.text}\n${h.note}\n${h.url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')}`.toLowerCase();
const wordsOf = (q: string): string[] => q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);

/** An address without its #fragment, as a page of your browsing is kept. */
export const pageUrl = (url: string) => String(url).replace(/#.*$/s, '').slice(0, URL_MAX);

/** A new highlight. Null when the address is not a page to keep highlights on; throws when there are too many on the page. */
export function addHighlight(db: DB, o: { url: string; title?: string; text: string; prefix?: string; suffix?: string; id?: string }, now = Date.now()): PageHighlight | null {
  table(db);
  const key = highlightKey(o.url);
  if (!key) return null;
  const text = one(o.text, HIGHLIGHT_MAX + 1);
  if (!text) return null;
  if (text.length > HIGHLIGHT_MAX) throw new Error(`A highlight holds up to ${HIGHLIGHT_MAX} characters`);
  const n = (db.prepare('select count(*) as n from browser_highlights where key = ?').get(key) as { n: number }).n;
  if (n >= MAX_PER_PAGE) throw new Error(`A page keeps up to ${MAX_PER_PAGE} highlights`);
  const h: PageHighlight = {
    id: o.id && /^[0-9a-f-]{36}$/.test(o.id) ? o.id : crypto.randomUUID(),
    key,
    url: pageUrl(o.url),
    title: one(o.title, TITLE_MAX),
    text,
    prefix: around(o.prefix).slice(-HIGHLIGHT_CONTEXT),
    suffix: around(o.suffix).slice(0, HIGHLIGHT_CONTEXT),
    note: '',
    at: now,
  };
  db.prepare('insert into browser_highlights (id, key, url, title, text, prefix, suffix, note, hay, at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(h.id, h.key, h.url, h.title, h.text, h.prefix, h.suffix, h.note, hayOf(h), h.at);
  return h;
}

export function getHighlight(db: DB, id: string): PageHighlight | null {
  table(db);
  return (db.prepare(`select ${COLS} from browser_highlights where id = ?`).get(id) as Row | undefined) ?? null;
}

/** The highlights of one page (by any address of it), oldest first, in the order they were made. */
export function pageHighlights(db: DB, url: string): PageHighlight[] {
  table(db);
  const key = highlightKey(url);
  if (!key) return [];
  return db.prepare(`select ${COLS} from browser_highlights where key = ? order by at asc, rowid asc limit ?`).all(key, MAX_PER_PAGE) as Row[];
}

/** How many highlights a page has. */
export function pageCount(db: DB, url: string): number {
  table(db);
  const key = highlightKey(url);
  if (!key) return 0;
  return (db.prepare('select count(*) as n from browser_highlights where key = ?').get(key) as { n: number }).n;
}

/** Every highlight, newest first; `q`: only those with all its words in the text, note, title or address; `before`: only those made before that time. */
export function listHighlights(db: DB, o: { q?: string; before?: number; limit?: number } = {}): PageHighlight[] {
  table(db);
  const limit = Math.max(1, Math.min(MAX_LIST, Math.floor(o.limit ?? 500) || 500));
  const where: string[] = [];
  const args: (string | number)[] = [];
  for (const w of wordsOf(o.q ?? '')) {
    where.push('instr(hay, ?) > 0');
    args.push(w);
  }
  if (typeof o.before === 'number' && Number.isFinite(o.before)) {
    where.push('at < ?');
    args.push(o.before);
  }
  return db.prepare(`select ${COLS} from browser_highlights ${where.length ? `where ${where.join(' and ')}` : ''} order by at desc, rowid desc limit ?`).all(...args, limit) as Row[];
}

/** A note (empty takes it away). Null when there is no such highlight. */
export function setNote(db: DB, id: string, note: unknown): PageHighlight | null {
  table(db);
  const h = getHighlight(db, id);
  if (!h) return null;
  const n = String(note ?? '').replace(/\r\n?/g, '\n').trim().slice(0, HIGHLIGHT_NOTE_MAX);
  const next = { ...h, note: n };
  db.prepare('update browser_highlights set note = ?, hay = ? where id = ?').run(n, hayOf(next), id);
  return next;
}

export function removeHighlight(db: DB, id: string): PageHighlight | null {
  table(db);
  const h = getHighlight(db, id);
  if (!h) return null;
  db.prepare('delete from browser_highlights where id = ?').run(id);
  return h;
}

/** Takes away all the highlights of a page, or all of them. */
export function clearHighlights(db: DB, url?: string): number {
  table(db);
  if (url === undefined) return db.prepare('delete from browser_highlights').run().changes;
  const key = highlightKey(url);
  return key ? db.prepare('delete from browser_highlights where key = ?').run(key).changes : 0;
}
