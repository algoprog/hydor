// Custom's settings beyond its models (Settings → Custom): the sandbox for its commands in Auto
// mode. (How many rounds a goal may take is Settings → Goals now: server/goals/settings.ts, which reads the old key below until it is set there.)
import { kvGet, kvSet, type DB } from '../db.ts';

export interface CustomSettings {
  /** Commands in Auto mode run in the sandbox (when bwrap works here). */
  sandbox: boolean;
  /** The old setting of a goal's rounds (Settings → Custom, before Settings → Goals): only read, by the goals' defaults as their fallback. */
  goalRounds: number;
}

export function customSettings(db: DB): CustomSettings {
  const n = Number(kvGet(db, 'custom.goalRounds'));
  return { sandbox: kvGet(db, 'custom.sandbox') !== '0', goalRounds: Number.isInteger(n) && n >= 1 && n <= 500 ? n : 30 };
}

export function setCustomSettings(db: DB, p: Partial<Pick<CustomSettings, 'sandbox'>>) {
  if (typeof p.sandbox === 'boolean') kvSet(db, 'custom.sandbox', p.sandbox ? '1' : '0');
}
