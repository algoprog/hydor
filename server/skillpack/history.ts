// Every change to a skill, with its text before and after, and every time an agent loaded one: the skill
// library's and each space's own (server/skillpack/spaceSkills.ts), told apart by the space they belong to.
import type { SkillChange } from '../../shared/skillpack.ts';
import type { DB } from '../db.ts';
import { lineDiff } from './diff.ts';

const made = new WeakSet<DB>();
export function historyTables(db: DB) {
  if (made.has(db)) return;
  db.exec(`
    create table if not exists skillpack_history (
      id integer primary key autoincrement, name text not null, at integer not null, action text not null,
      key text, proposal text, before text, after text
    );
    create index if not exists skillpack_history_name on skillpack_history(name, at);
    create table if not exists skillpack_usage (
      key text not null, item text not null, name text not null, at integer not null, how text not null,
      primary key (key, item)
    );
    create index if not exists skillpack_usage_name on skillpack_usage(name);`);
  // A space's own skills have their history here too, by the space's id (none: the library's).
  if (!(db.prepare('pragma table_info(skillpack_history)').all() as { name: string }[]).some((c) => c.name === 'space')) {
    try {
      db.exec('alter table skillpack_history add column space text');
    } catch {}
  }
  made.add(db);
}

export function record(db: DB, c: { name: string; action: SkillChange['action']; key?: string; proposal?: string; before?: string | null; after?: string | null; space?: string }) {
  historyTables(db);
  db.prepare('insert into skillpack_history (name, at, action, key, proposal, before, after, space) values (?, ?, ?, ?, ?, ?, ?, ?)').run(
    c.name,
    Date.now(),
    c.action,
    c.key ?? null,
    c.proposal ?? null,
    c.before ?? null,
    c.after ?? null,
    c.space ?? null,
  );
}

interface ChangeRow {
  id: number;
  name: string;
  at: number;
  action: SkillChange['action'];
  key: string | null;
  before: string | null;
  after: string | null;
}

/** A skill's changes, the newest first: the library's, or with `space` that space's own skill of the name. */
export function history(db: DB, name: string, space?: string): SkillChange[] {
  historyTables(db);
  const rows = db.prepare('select * from skillpack_history where name = ? and space is ? order by at desc, id desc limit 100').all(name, space ?? null) as ChangeRow[];
  return rows.map((r) => ({ id: r.id, name: r.name, at: r.at, action: r.action, key: r.key ?? undefined, ...lineDiff(r.before ?? '', r.after ?? '') }));
}

/** Skills whose last change was their removal, newest first, with their text then: the library's, or a space's. */
export function lastRemoved(db: DB, space?: string): { name: string; at: number; before: string | null }[] {
  historyTables(db);
  const rows = db
    .prepare('select name, action, at, before from skillpack_history h where space is ? and id = (select id from skillpack_history where name = h.name and space is h.space order by at desc, id desc limit 1)')
    .all(space ?? null) as { name: string; action: string; at: number; before: string | null }[];
  return rows.filter((r) => r.action === 'remove').sort((a, b) => b.at - a.at);
}

/** An agent loaded a skill (once per timeline item). */
export function noteUse(db: DB, u: { key: string; item: string; name: string; how: 'tool' | 'trigger'; at?: number }) {
  historyTables(db);
  db.prepare('insert into skillpack_usage (key, item, name, at, how) values (?, ?, ?, ?, ?) on conflict (key, item) do nothing').run(u.key, u.item, u.name, u.at ?? Date.now(), u.how);
}

/** How often each skill was loaded, and when last: in every session, or in the sessions of these spaces. */
export function usage(db: DB, spaces?: string[]): Map<string, { uses: number; last: number }> {
  historyTables(db);
  const rows = (
    spaces
      ? db
          .prepare(
            "select u.name, count(*) as n, max(u.at) as last from skillpack_usage u join app_sessions s on s.key = u.key where json_extract(s.extra, '$.space') in (select value from json_each(?)) group by u.name",
          )
          .all(JSON.stringify(spaces))
      : db.prepare('select name, count(*) as n, max(at) as last from skillpack_usage group by name').all()
  ) as { name: string; n: number; last: number }[];
  return new Map(rows.map((r) => [r.name, { uses: r.n, last: r.last }]));
}
