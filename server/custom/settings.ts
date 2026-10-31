// Custom's settings beyond its models (Settings → Custom): the sandbox for its commands in Auto and
// Full modes, and how many rounds a goal may take.
import { HttpError } from '../auth.ts';
import { kvGet, kvSet, type DB } from '../db.ts';

export interface CustomSettings {
  /** Commands in Auto and Full modes run in the sandbox (when bwrap works here). */
  sandbox: boolean;
  /** Most next steps a goal sends before it pauses. */
  goalRounds: number;
}

export function customSettings(db: DB): CustomSettings {
  const n = Number(kvGet(db, 'custom.goalRounds'));
  return { sandbox: kvGet(db, 'custom.sandbox') !== '0', goalRounds: Number.isInteger(n) && n >= 1 && n <= 500 ? n : 30 };
}

export function setCustomSettings(db: DB, p: Partial<CustomSettings>) {
  if (typeof p.sandbox === 'boolean') kvSet(db, 'custom.sandbox', p.sandbox ? '1' : '0');
  if (p.goalRounds !== undefined) {
    const n = Math.round(Number(p.goalRounds));
    if (!(n >= 1 && n <= 500)) throw new HttpError(400, 'A goal’s rounds: from 1 to 500');
    kvSet(db, 'custom.goalRounds', String(n));
  }
}
