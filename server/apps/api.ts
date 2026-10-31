// What programs get back from an app run (the API, MCP), and the daily limit every way of starting
// a run checks first.
import type { AppDef, AppRecipe, RunStatus } from '../../shared/apps.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { dayStart, usageSince, type RunRecord } from './store.ts';

export interface ApiAnswer {
  run: string;
  status: RunStatus;
  /** What the agent handed in for the answer fields (null until it has). */
  result: Record<string, unknown> | null;
  /** The agent's last reply. */
  reply: string | null;
  /** The session doing the work: its key and where to open it. */
  session: { key: string; url: string } | null;
  error?: string;
  costUsd?: number;
}

export function apiAnswer(r: RunRecord, link: (key: string) => string): ApiAnswer {
  return {
    run: r.id,
    status: r.status,
    result: r.result ?? null,
    reply: r.reply ?? null,
    session: r.key ? { key: r.key, url: link(r.key) } : null,
    ...(r.error ? { error: r.error } : {}),
    ...(r.costUsd !== undefined ? { costUsd: r.costUsd } : {}),
  };
}

/** Refuses a run past the app's runs for the day. */
export function checkDaily(db: DB, app: { id: string; limits: AppRecipe['limits'] } | AppDef) {
  const max = app.limits.runsPerDay;
  if (max && usageSince(db, app.id, dayStart()).runs >= max) throw new HttpError(429, `This app has run ${max} time${max > 1 ? 's' : ''} today, its limit (Limits in its settings).`);
}

/** Seconds to wait, as asked (within bounds). */
export const waitSeconds = (v: unknown, dflt: number, max = 600) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : dflt;
};
