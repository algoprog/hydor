// What new and changed documents did to a place's memory: the updates the project page lists, and the texts
// already digested (the same text is never read twice). Kept in the database; the last 200 updates of each place.
import type { WikiUpdate } from '../../../shared/wiki.ts';
import type { DB } from '../../db.ts';

const ready = new WeakSet<DB>();

function schema(db: DB) {
  if (ready.has(db)) return;
  db.exec(`
    create table if not exists wiki_updates (
      id integer primary key autoincrement, space text, base text not null, document text not null, path text not null,
      at integer not null, articles text not null, notes integer not null default 0, error text
    );
    create index if not exists wiki_updates_space on wiki_updates (space, id);
    create table if not exists wiki_digested (place text not null, hash text not null, at integer not null, primary key (place, hash));
    create table if not exists wiki_work_sessions (key text primary key, space text, upto integer not null, at integer not null);
  `);
  ready.add(db);
}

/** Updates kept for each place. */
export const KEEP_UPDATES = 200;
/** Most updates a page gets. */
export const SHOW_UPDATES = 20;

export interface NewUpdate {
  space: string | null;
  base: string;
  document: string;
  path: string;
  articles: string[];
  notes: number;
  error?: string;
}

export function recordUpdate(db: DB, u: NewUpdate, at = Date.now()): number {
  schema(db);
  return db.transaction(() => {
    const r = db.prepare('insert into wiki_updates (space, base, document, path, at, articles, notes, error) values (?, ?, ?, ?, ?, ?, ?, ?)').run(u.space, u.base, u.document, u.path, at, JSON.stringify(u.articles), u.notes, u.error ?? null);
    db.prepare('delete from wiki_updates where space is ? and id not in (select id from wiki_updates where space is ? order by id desc limit ?)').run(u.space, u.space, KEEP_UPDATES);
    return Number(r.lastInsertRowid);
  })();
}

/** A place's updates (null: the shared wiki's), newest first. */
export function updatesOf(db: DB, space: string | null, limit = SHOW_UPDATES): WikiUpdate[] {
  schema(db);
  const rows = db.prepare('select * from wiki_updates where space is ? order by id desc limit ?').all(space, Math.min(limit, SHOW_UPDATES)) as { id: number; at: number; document: string; path: string; articles: string; notes: number; error: string | null }[];
  return rows.map((r) => ({ id: r.id, at: r.at, document: r.document, path: r.path, articles: JSON.parse(r.articles) as string[], notes: r.notes, ...(r.error ? { error: r.error } : {}) }));
}

const place = (space: string | null) => space ?? '';

export function digested(db: DB, space: string | null, hash: string): boolean {
  schema(db);
  return !!db.prepare('select 1 from wiki_digested where place = ? and hash = ?').get(place(space), hash);
}

export function markDigested(db: DB, space: string | null, hash: string, at = Date.now()) {
  schema(db);
  db.prepare('insert or replace into wiki_digested (place, hash, at) values (?, ?, ?)').run(place(space), hash, at);
}

/** Where the work pass stopped reading a session: its last turn read (the turn's own time), and when it was read. */
export interface WorkMark {
  space: string | null;
  upto: number;
  at: number;
}

export function workMark(db: DB, key: string): WorkMark | undefined {
  schema(db);
  return db.prepare('select space, upto, at from wiki_work_sessions where key = ?').get(key) as WorkMark | undefined;
}

export function setWorkMark(db: DB, key: string, m: WorkMark) {
  schema(db);
  db.prepare('insert or replace into wiki_work_sessions (key, space, upto, at) values (?, ?, ?, ?)').run(key, m.space, m.upto, m.at);
}

/** Forgets the marks of sessions read before `before` (a session that old is not looked at again). */
export function dropWorkMarks(db: DB, before: number) {
  schema(db);
  db.prepare('delete from wiki_work_sessions where at < ?').run(before);
}
