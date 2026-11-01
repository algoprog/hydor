// What the search box learns from use, kept here so every device learns together: each thing picked from it
// (with what was typed), and each place visited (a page, a Settings section, a session, a template…). A count
// is stored as it stood when last added to, and is worth half as much after a half-life (shared/find.ts), so
// nothing needs rewriting as time passes; the weakest go once there are more than a few thousand.
import { decayed, PICK_HALF_LIFE, usageQuery, VISIT_HALF_LIFE, type FindUsage } from '../../shared/find.ts';
import type { DB } from '../db.ts';

/** Most rows kept; below this a count is forgotten. */
const MAX_ROWS = 3000;
const FORGET_BELOW = 0.05;

const made = new WeakSet<DB>();
function table(db: DB) {
  if (made.has(db)) return;
  // key: "p\u0001<id>" a pick, "v\u0001<place>" a visit, "q\u0001<query>\u0001<id>" a pick with what was typed.
  db.exec('create table if not exists find_usage (key text primary key, n real not null, at integer not null)');
  made.add(db);
}

const SEP = '\u0001';
const halfOf = (key: string) => (key.startsWith(`v${SEP}`) ? VISIT_HALF_LIFE : PICK_HALF_LIFE);
const clip = (s: unknown, max: number) => (typeof s === 'string' ? s.slice(0, max) : '');

function bump(db: DB, key: string, now: number) {
  const r = db.prepare('select n, at from find_usage where key = ?').get(key) as { n: number; at: number } | undefined;
  const n = (r ? decayed(r.n, r.at, now, halfOf(key)) : 0) + 1;
  db.prepare('insert into find_usage (key, n, at) values (?, ?, ?) on conflict(key) do update set n = excluded.n, at = excluded.at').run(key, n, now);
}

/** Adds picks (each with what was typed) and visits. */
export function noteUsage(db: DB, u: { picks?: { id: string; q?: string }[]; visits?: string[] }, now = Date.now()) {
  table(db);
  db.transaction(() => {
    for (const p of (u.picks ?? []).slice(0, 20)) {
      const id = clip(p?.id, 400);
      if (!id) continue;
      bump(db, `p${SEP}${id}`, now);
      const q = usageQuery(clip(p.q, 200));
      if (q.length >= 2) bump(db, `q${SEP}${q}${SEP}${id}`, now);
    }
    for (const v of (u.visits ?? []).slice(0, 50)) {
      const place = clip(v, 400);
      if (place) bump(db, `v${SEP}${place}`, now);
    }
  })();
  prune(db, now);
}

/** Forgets counts worth almost nothing now, and the weakest past the most kept. */
function prune(db: DB, now: number) {
  const n = (db.prepare('select count(*) as n from find_usage').get() as { n: number }).n;
  if (n <= MAX_ROWS) return;
  const rows = (db.prepare('select key, n, at from find_usage').all() as { key: string; n: number; at: number }[]).map((r) => ({ key: r.key, w: decayed(r.n, r.at, now, halfOf(r.key)) })).sort((a, b) => b.w - a.w);
  const drop = rows.filter((r, i) => i >= MAX_ROWS * 0.9 || r.w < FORGET_BELOW);
  const del = db.prepare('delete from find_usage where key = ?');
  db.transaction(() => drop.forEach((r) => del.run(r.key)))();
}

/** Everything learned, as it is worth now. */
export function findUsage(db: DB, now = Date.now()): FindUsage {
  table(db);
  const out: FindUsage = { picks: {}, visits: {}, queries: [] };
  for (const r of db.prepare('select key, n, at from find_usage').iterate() as Iterable<{ key: string; n: number; at: number }>) {
    const w = decayed(r.n, r.at, now, halfOf(r.key));
    if (w < FORGET_BELOW) continue;
    const [kind, a, b] = r.key.split(SEP);
    if (kind === 'p') out.picks[a] = w;
    else if (kind === 'v') out.visits[a] = { n: w, at: r.at };
    else if (kind === 'q' && b) out.queries.push([a, b, w]);
  }
  return out;
}
