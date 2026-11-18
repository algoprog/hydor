// What each project's sessions did over the last days, for the Projects page's Where the work went: the messages
// sent to its sessions on each local day (the indexer's per-hour activity rows, as the stats page reads them), and
// how many sessions were at work. A session belongs to the project its own record says, else its root session's.
import type { DB } from '../db.ts';
import type { SpaceActivity, SpacesActivity } from '../../shared/spaces.ts';
import { allSpaces } from './index.ts';

const DAY = 86400_000;
const pad = (n: number) => String(n).padStart(2, '0');

/** The day as its key ("2026-11-18") for a date held as UTC midnight. */
const keyOf = (t: number) => {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

/** The projects' messages and sessions over the last `days` days (7 to 90, 28 unless given) in the time zone `tz`, the busiest project first. */
export function spacesActivity(db: DB, q: { tz?: string; days?: number }): SpacesActivity {
  const n = Math.max(7, Math.min(Math.round(Number(q.days)) || 28, 90));
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat('en-US', { timeZone: q.tz || 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' });
  } catch {
    fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' });
  }
  const local = (ms: number) => {
    let y = 0;
    let m = 0;
    let d = 0;
    for (const p of fmt.formatToParts(ms)) {
      if (p.type === 'year') y = Number(p.value);
      else if (p.type === 'month') m = Number(p.value);
      else if (p.type === 'day') d = Number(p.value);
    }
    return Date.UTC(y, m - 1, d);
  };
  const today = local(Date.now());
  const days = Array.from({ length: n }, (_, i) => {
    const start = today - (n - 1 - i) * DAY;
    return { key: keyOf(start), start };
  });
  const index = new Map(days.map((d, i) => [d.key, i]));
  const mine = new Map<string, SpaceActivity & { roots: Set<string> }>();
  try {
    const known = new Set(allSpaces(db).map((s) => s.id));
    // Two days of slack either side of the local-midnight boundary, as the stats do.
    const from = Math.floor((days[0].start - 2 * DAY) / 3_600_000);
    const rows = db
      .prepare(
        `select a.root as root, a.hour as hour, a.prompts as prompts,
                coalesce(json_extract(s.extra, '$.space'), json_extract(r.extra, '$.space')) as space
         from activity a left join app_sessions s on s.key = a.key left join app_sessions r on r.key = a.root
         where a.hour >= ?`,
      )
      .all(from) as { root: string; hour: number; prompts: number; space: string | null }[];
    const hourDay = new Map<number, number | undefined>();
    for (const r of rows) {
      if (!r.space || !known.has(r.space)) continue;
      let at = hourDay.get(r.hour);
      if (!hourDay.has(r.hour)) hourDay.set(r.hour, (at = index.get(keyOf(local(r.hour * 3_600_000)))));
      if (at === undefined) continue;
      let p = mine.get(r.space);
      if (!p) mine.set(r.space, (p = { id: r.space, sessions: 0, prompts: 0, byDay: days.map(() => 0), roots: new Set() }));
      p.prompts += r.prompts;
      p.byDay[at] += r.prompts;
      p.roots.add(r.root);
    }
  } catch {
    mine.clear();
  }
  return {
    days,
    projects: [...mine.values()].map(({ roots, ...p }) => ({ ...p, sessions: roots.size })).sort((a, b) => b.prompts - a.prompts || b.sessions - a.sessions),
  };
}
