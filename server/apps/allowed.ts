// The apps agents run for the user without asking first. An agent that wants to run an app shows the app's card in
// the conversation and waits for a yes (use.ts); choosing "Always run it" there, or adding the app in Settings → Apps,
// puts it on this list, and its card then shows only when it lacks details. Kept in the database, so every device
// and every session sees the same list. Each entry is the app as runs know it: the app's own id for one of the
// user's, "tpl:<id>" for a ready-made one.
import { kvGet, kvSet, type DB } from '../db.ts';

const KEY = 'apps_allowed';

/** The apps allowed, as kept (one deleted or uninstalled since is still here: the routes leave it out). */
export function allowedApps(db: DB): string[] {
  try {
    const v = JSON.parse(kvGet(db, KEY) ?? '[]');
    return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && !!x))] : [];
  } catch {
    return [];
  }
}

/** Allows an app (on), or asks again before it runs (off). */
export function allowApp(db: DB, id: string, on: boolean) {
  const now = allowedApps(db);
  const next = on ? (now.includes(id) ? now : [...now, id]) : now.filter((x) => x !== id);
  if (next.length !== now.length) kvSet(db, KEY, JSON.stringify(next));
}
