// Keeping sessions. Every conversation stays, whatever the agent's own program does with it: Claude Code is told
// to keep its conversations (claudeHistory.ts), and the indexer keeps its own link to each transcript and brings
// back one that disappears (indexer/kept.ts). What goes is what nobody used for a while: sessions inactive for
// a year by default (Settings → General → Delete inactive sessions, on until turned off, the length yours to
// pick), their numbers staying in Activity. Pinned ones stay, and so do ones at work, waiting, with messages
// queued, snoozed, due to resume, running elsewhere or with an open pull request.
//
//   GET /api/retention   { on, days }
//   PUT /api/retention   { on?: boolean, days?: number (30 to 3650) }
import type { RetentionSettings } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import { keepClaudeHistoryByDefault } from '../claudeHistory.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import type { Deps, Feature } from '../features/types.ts';

const KEY = 'keep.inactive';
const DAY = 86_400_000;
export const DEFAULT_RETENTION: RetentionSettings = { on: true, days: 365 };
export const MIN_DAYS = 30;
export const MAX_DAYS = 3650;
/** Most sessions one clean-up deletes (the next takes the rest). */
const BATCH = 200;

export function retentionOf(db: DB): RetentionSettings {
  try {
    const v = JSON.parse(kvGet(db, KEY) ?? '{}') as Partial<RetentionSettings>;
    return { on: v.on !== false, days: typeof v.days === 'number' && v.days >= MIN_DAYS && v.days <= MAX_DAYS ? Math.round(v.days) : DEFAULT_RETENTION.days };
  } catch {
    return { ...DEFAULT_RETENTION };
  }
}

export function setRetention(db: DB, b: { on?: unknown; days?: unknown }): RetentionSettings {
  const cur = retentionOf(db);
  const days = b.days === undefined ? cur.days : Number(b.days);
  if (!Number.isFinite(days) || days < MIN_DAYS || days > MAX_DAYS) throw new HttpError(400, `days: from ${MIN_DAYS} to ${MAX_DAYS}`);
  const next = { on: b.on === undefined ? cur.on : b.on !== false, days: Math.round(days) };
  kvSet(db, KEY, JSON.stringify(next));
  return next;
}

/** The sessions inactive for longer than the setting says, that may go: the least recently used first. */
export function inactiveSessions(d: Pick<Deps, 'db' | 'sessions'>, now = Date.now()): string[] {
  const { on, days } = retentionOf(d.db);
  if (!on) return [];
  const cutoff = now - days * DAY;
  const rows = d.db
    .prepare('select key from sessions where hidden = 0 and coalesce(updated_at, 0) > 0 and updated_at < ? order by updated_at limit ?')
    .all(cutoff, BATCH * 2) as { key: string }[];
  const out: string[] = [];
  for (const { key } of rows) {
    const s = d.sessions.summary(key);
    if (!s || (s.updatedAt ?? 0) >= cutoff) continue;
    const busy = !!s.live || !!s.external || !!s.queue?.length || !!s.resumeAt || (s.snoozedUntil ?? 0) > now;
    const open = s.pr?.state === 'open' || s.pr?.state === 'draft';
    if (s.pinned || busy || open) continue;
    out.push(key);
    if (out.length >= BATCH) break;
  }
  return out;
}

/** Deletes what inactiveSessions finds; their numbers stay in Activity. Returns how many went. */
export async function deleteInactive(d: Pick<Deps, 'db' | 'sessions'>, now = Date.now()): Promise<number> {
  let n = 0;
  for (const key of inactiveSessions(d, now)) {
    try {
      await d.sessions.remove(key, { keepActivity: true });
      n++;
    } catch (e) {
      console.warn(`[keep] could not delete ${key}: ${(e as Error).message}`);
    }
  }
  if (n) console.log(`[keep] deleted ${n} session${n === 1 ? '' : 's'} inactive for over ${retentionOf(d.db).days} days`);
  return n;
}

export const keep: Feature = {
  id: 'keep',
  routes(d) {
    d.app.get('/api/retention', async () => retentionOf(d.db));
    d.app.put('/api/retention', async (req) => setRetention(d.db, (req.body ?? {}) as Record<string, unknown>));
  },
  start(d) {
    keepClaudeHistoryByDefault();
    // Ten minutes after the server starts (the index is read by then), then once a day; added accounts are
    // told to keep their conversations on the same round.
    const round = () => {
      keepClaudeHistoryByDefault();
      deleteInactive(d).catch((e) => console.warn(`[keep] ${(e as Error).message}`));
    };
    setTimeout(round, 10 * 60_000).unref();
    setInterval(round, DAY).unref();
  },
};
