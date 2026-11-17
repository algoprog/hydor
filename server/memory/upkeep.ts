// What memory does in the background for project notes: anchors for the files they name (anchors.ts) and, every ten
// minutes, a look at whether those files changed in the project since (drift.ts).
import type { DB } from '../db.ts';
import { watchAnchors } from './anchors.ts';
import { checkDrift } from './drift.ts';

/** How often the drift of anchored files is looked at (the memory upkeep's rhythm). */
export const DRIFT_EVERY = 10 * 60_000;

const started = new WeakSet<DB>();

/** Starts the anchors, the one-time backfill and the drift check. */
export function startAnchors(db: DB) {
  if (started.has(db)) return;
  started.add(db);
  watchAnchors(db);
  const look = () => checkDrift(db).catch((e) => console.warn(`[memory] drift: ${(e as Error).message}`));
  setTimeout(look, 90_000).unref?.();
  setInterval(look, DRIFT_EVERY).unref?.();
}
