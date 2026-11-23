// What word suggestions did, as counts only (never any text): kept in the database (kv, "suggest.usage") as totals
// since a moment and one bucket per local day, the last 31 days. The page adds to them in batches (POST /api/suggest/usage).
import { SUGGEST_COUNT_KEYS, SUGGEST_USAGE_CAP, SUGGEST_USAGE_DAYS, type SuggestCounts, type SuggestUsage } from '../../shared/suggest.ts';
import { HttpError } from '../auth.ts';
import { kvGet, kvSet, type DB } from '../db.ts';

export const USAGE_KEY = 'suggest.usage';

interface Stored {
  since: number;
  total: SuggestCounts;
  /** Counts for each local day, "YYYY-MM-DD". */
  days: Record<string, SuggestCounts>;
}

const none = (): SuggestCounts => ({ shown: 0, taken: 0, typedThrough: 0, wrong: 0, saved: 0, typedChars: 0 });
const plus = (a: SuggestCounts, b: SuggestCounts): SuggestCounts => {
  const out = none();
  for (const k of SUGGEST_COUNT_KEYS) out[k] = a[k] + b[k];
  return out;
};

/** The local day of a moment, as "YYYY-MM-DD" (the server's own clock and zone, which is the person's computer). */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The local day `back` days before the one of `ms` (calendar days, so a day of 23 or 25 hours counts as one). */
export function dayBefore(ms: number, back: number): string {
  const d = new Date(ms);
  return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - back, 12).getTime());
}

/** A body's counts, checked: whole numbers from 0 to the cap, nothing else in it. A missing count is 0. */
export function cleanUsage(body: unknown): SuggestCounts {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Send the counts as an object');
  const b = body as Record<string, unknown>;
  for (const k of Object.keys(b)) if (!(SUGGEST_COUNT_KEYS as readonly string[]).includes(k)) throw new HttpError(400, `${k}: not a count (${SUGGEST_COUNT_KEYS.join(', ')})`);
  const out = none();
  for (const k of SUGGEST_COUNT_KEYS) {
    const v = b[k];
    if (v === undefined) continue;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > SUGGEST_USAGE_CAP) throw new HttpError(400, `${k}: a whole number from 0 to ${SUGGEST_USAGE_CAP}`);
    out[k] = v;
  }
  return out;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const counts = (v: unknown): SuggestCounts => {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  const out = none();
  for (const k of SUGGEST_COUNT_KEYS) out[k] = num(o[k]);
  return out;
};

/** What is kept, as stored (a damaged or missing value reads as nothing counted, since `now`), without the days that are too old. */
function load(db: DB, now: number): Stored {
  let o: any = null;
  try {
    const raw = kvGet(db, USAGE_KEY);
    o = raw ? JSON.parse(raw) : null;
  } catch {
    o = null;
  }
  const days: Record<string, SuggestCounts> = {};
  const oldest = dayBefore(now, SUGGEST_USAGE_DAYS - 1);
  if (o && typeof o.days === 'object' && o.days) {
    for (const [d, c] of Object.entries(o.days)) if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d >= oldest) days[d] = counts(c);
  }
  return { since: o && Number.isFinite(o.since) && o.since > 0 ? o.since : now, total: counts(o?.total), days };
}

/** Adds `c` to the totals and to today's bucket, and drops the days beyond the 31 kept. */
export function addUsage(db: DB, c: SuggestCounts, now = Date.now()): void {
  const s = load(db, now);
  s.total = plus(s.total, c);
  const day = dayKey(now);
  s.days[day] = plus(s.days[day] ?? none(), c);
  kvSet(db, USAGE_KEY, JSON.stringify(s));
}

/** The counts as the page shows them: the totals, today, and the last 7 days. */
export function readUsage(db: DB, now = Date.now()): SuggestUsage {
  const s = load(db, now);
  let week = none();
  for (let i = 0; i < 7; i++) {
    const c = s.days[dayBefore(now, i)];
    if (c) week = plus(week, c);
  }
  return { since: s.since, total: s.total, today: s.days[dayKey(now)] ?? none(), week };
}

/** Starts the counts again from nothing, since now. */
export function resetUsage(db: DB, now = Date.now()): void {
  kvSet(db, USAGE_KEY, JSON.stringify({ since: now, total: none(), days: {} } satisfies Stored));
}
