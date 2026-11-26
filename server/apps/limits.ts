// Rate limits for what anyone may call (the public page, API keys): how many times a name (an
// address, a key) was let through within a window. Kept in memory, and a restart forgets them; the
// daily caps, counted from the runs in the database, do not. A limiter made with a `scope` (the API keys'
// calls, a web app's function calls) keeps its counts in Hydor's database once `persistLimits` was given
// it, so a restart of Hydor does not start the minute, or a run's calls, again.
import type { DB } from '../db.ts';

let store: DB | null = null;
/** Keeps the counts of the limiters that have a scope in this database from now on (the table is made, and what is a day old goes). */
export function persistLimits(db: DB) {
  db.exec('create table if not exists rate_hits (scope text not null, name text not null, at integer not null); create index if not exists rate_hits_name on rate_hits (scope, name, at);');
  db.prepare('delete from rate_hits where at < ?').run(Date.now() - 8 * 24 * 3600_000);
  store = db;
}

export class Limiter {
  private hits = new Map<string, number[]>();
  private now: () => number;
  private scope: string | null;

  constructor(now: () => number = Date.now, scope: string | null = null) {
    this.now = now;
    this.scope = scope;
    setInterval(() => this.sweep(), 10 * 60_000).unref?.();
  }

  private get db(): DB | null {
    return this.scope && store ? store : null;
  }

  /** How many were let through for `name` within the window. */
  count(name: string, windowMs: number): number {
    const t = this.now();
    const db = this.db;
    if (db) return Number((db.prepare('select count(*) as n from rate_hits where scope = ? and name = ? and at > ?').get(this.scope, name, t - windowMs) as { n: number }).n);
    return (this.hits.get(name) ?? []).filter((x) => x > t - windowMs).length;
  }

  /** Counts one for `name` without a limit (the caller checked `count`). */
  add(name: string) {
    const db = this.db;
    if (db) db.prepare('insert into rate_hits (scope, name, at) values (?, ?, ?)').run(this.scope, name, this.now());
    else this.hits.set(name, [...(this.hits.get(name) ?? []), this.now()]);
  }

  /** Forgets what was counted (tests). */
  clear() {
    this.hits.clear();
    if (this.db) this.db.prepare('delete from rate_hits where scope = ?').run(this.scope);
  }

  /** Lets one more through for `name` if fewer than `limit` passed in the last `windowMs`; returns whether it did. */
  take(name: string, limit: number, windowMs: number): boolean {
    const t = this.now();
    if (this.db) {
      if (this.count(name, windowMs) >= limit) return false;
      this.add(name);
      return true;
    }
    const list = (this.hits.get(name) ?? []).filter((x) => x > t - windowMs);
    if (list.length >= limit) {
      this.hits.set(name, list);
      return false;
    }
    list.push(t);
    this.hits.set(name, list);
    return true;
  }

  /** How long until `name` may go again, in ms (0: now). */
  wait(name: string, limit: number, windowMs: number): number {
    const t = this.now();
    if (this.db) {
      const at = (this.db.prepare('select at from rate_hits where scope = ? and name = ? and at > ? order by at').all(this.scope, name, t - windowMs) as { at: number }[]).map((r) => r.at);
      return at.length < limit ? 0 : Math.max(0, at[at.length - limit] + windowMs - t);
    }
    const list = (this.hits.get(name) ?? []).filter((x) => x > t - windowMs);
    return list.length < limit ? 0 : Math.max(0, list[list.length - limit] + windowMs - t);
  }

  /** Gives back the last one let through (the run did not start after all). */
  undo(name: string) {
    if (this.db) this.db.prepare('delete from rate_hits where rowid = (select rowid from rate_hits where scope = ? and name = ? order by at desc, rowid desc limit 1)').run(this.scope, name);
    else this.hits.get(name)?.pop();
  }

  private sweep() {
    const t = this.now();
    if (this.db) this.db.prepare('delete from rate_hits where scope = ? and at < ?').run(this.scope, t - 24 * 3600_000);
    for (const [k, list] of this.hits) if (!list.length || list[list.length - 1] < t - 24 * 3600_000) this.hits.delete(k);
  }
}

/** "in 12 min", for a refusal. */
export function waitText(ms: number): string {
  const m = Math.ceil(ms / 60_000);
  if (m <= 1) return 'in a minute';
  if (m < 60) return `in ${m} min`;
  const h = Math.ceil(m / 60);
  return `in ${h} hour${h > 1 ? 's' : ''}`;
}
