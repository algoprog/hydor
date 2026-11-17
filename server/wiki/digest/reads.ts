// Which conversations were read into a project's wiki and when, so a project never has more than a few read a day:
// the daily pass and the pass for sessions that went quiet (work.ts) count together. Kept in the database.
import type { DB } from '../../db.ts';

const ready = new WeakSet<DB>();

function schema(db: DB) {
  if (ready.has(db)) return;
  db.exec(`
    create table if not exists wiki_work_reads (space text not null, key text not null, at integer not null);
    create index if not exists wiki_work_reads_space on wiki_work_reads (space, at);
  `);
  ready.add(db);
}

/** A conversation of a project was given to the helper at `at`. */
export function logRead(db: DB, space: string, key: string, at: number) {
  schema(db);
  db.prepare('insert into wiki_work_reads (space, key, at) values (?, ?, ?)').run(space, key, at);
}

/** How many conversations of a project were read in the 24 hours up to `now`. */
export function readsInDay(db: DB, space: string, now: number): number {
  schema(db);
  return (db.prepare('select count(*) as n from wiki_work_reads where space = ? and at > ? and at <= ?').get(space, now - 86400_000, now) as { n: number }).n;
}

/** Forgets what was read before `before`. */
export function dropReads(db: DB, before: number) {
  schema(db);
  db.prepare('delete from wiki_work_reads where at < ?').run(before);
}
