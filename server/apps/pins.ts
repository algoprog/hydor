// The apps at the top of the Apps page, for quicker access: the ones you pinned there (kept here, so every device
// shows the same ones, in the order you drag them into; at most twelve) and the ones you ran lately (each once,
// with its latest run: how it went, to open its result or run it again). An app deleted, or a ready-made one
// uninstalled, leaves the pins. Agents' find_apps lists the user's apps in the same order (use.ts): the pinned ones
// first, then those used lately, then the others.
import type { AppRun } from '../../shared/apps.ts';
import { MAX_PINS, RECENT_APPS, USED_SOURCES } from '../../shared/apps.ts';
import { HttpError } from '../auth.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import { isInstalled } from './builtins.ts';
import { getApp, getRun, runView } from './store.ts';
import { templateById } from './templates.ts';

const KEY = 'apps.pins';
export { MAX_PINS, RECENT_APPS, USED_SOURCES };

function read(db: DB): string[] {
  try {
    const v = JSON.parse(kvGet(db, KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * The app something names, as runs know it: one of yours by its id or address (its id), a ready-made one as "tpl:<id>"
 * (or by its id alone, while no app of yours has that address). Null when there is no such app, or it is uninstalled.
 */
export function appIdOf(db: DB, ref: string): string | null {
  const r = ref.trim();
  if (!r) return null;
  if (!r.startsWith('tpl:')) {
    const a = getApp(db, r);
    if (a) return a.id;
  }
  const t = templateById(r.startsWith('tpl:') ? r.slice(4) : r);
  return t && isInstalled(db, t.id) ? `tpl:${t.id}` : null;
}

/** The apps pinned, in their order: those still here (one deleted or uninstalled since has left). */
export function pinsOf(db: DB): string[] {
  return read(db).filter((id) => appIdOf(db, id) === id);
}

/** Pins these apps, in this order, in place of those pinned before. Gives the pins as kept. */
export function setPins(db: DB, raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.some((x) => typeof x !== 'string')) throw new HttpError(400, 'ids: a list of apps, yours by their id and ready-made ones as tpl:<id>');
  const ids: string[] = [];
  for (const ref of raw as string[]) {
    const id = appIdOf(db, ref);
    if (!id) {
      const t = templateById(ref.trim().replace(/^tpl:/, ''));
      throw new HttpError(400, t ? `${t.name} is not installed: install it again on the Apps page to pin it` : `There is no app “${ref}” here`);
    }
    if (!ids.includes(id)) ids.push(id);
  }
  if (ids.length > MAX_PINS) throw new HttpError(400, `At most ${MAX_PINS} apps can be pinned: unpin one first`);
  kvSet(db, KEY, JSON.stringify(ids));
  return ids;
}

/** An app deleted, or a ready-made one uninstalled, leaves the pins. Gives whether it was pinned. */
export function unpin(db: DB, id: string): boolean {
  const ids = read(db);
  if (!ids.includes(id)) return false;
  kvSet(db, KEY, JSON.stringify(ids.filter((x) => x !== id)));
  return true;
}

/** One of the apps you ran lately: its id ("tpl:<id>" for a ready-made one) and its latest run. */
export interface UsedApp {
  app: string;
  run: AppRun;
}

const SOURCES = USED_SOURCES.map(() => '?').join(', ');

/**
 * The apps you ran lately, newest first, each once with its latest run (at most `n`): runs from its form, its own page
 * or screen, and those an agent ran for you in a chat. Not tries in the builder, scheduled runs, programs' or other
 * apps' runs, rows of a CSV, public pages', steps of other runs, nor runs of an app's other flows; not an app deleted
 * or uninstalled.
 */
export function recentApps(db: DB, n = RECENT_APPS): UsedApp[] {
  const apps = db.prepare(`select app_id as app, max(created_at) as at from app_runs where source in (${SOURCES}) and parent is null and flow is null group by app_id order by at desc`).all(...USED_SOURCES) as { app: string; at: number }[];
  const latest = db.prepare(`select id from app_runs where app_id = ? and created_at = ? and source in (${SOURCES}) and parent is null and flow is null order by rowid desc limit 1`);
  const out: UsedApp[] = [];
  for (const a of apps) {
    if (out.length >= n) break;
    if (appIdOf(db, a.app) !== a.app) continue;
    const row = latest.get(a.app, a.at, ...USED_SOURCES) as { id: string } | undefined;
    const run = row ? getRun(db, row.id) : null;
    if (run) out.push({ app: a.app, run: runView(run) });
  }
  return out;
}

/** How many times each app ran, all told: its runs, not tries in the builder, its steps' or its conversations'. */
export function useCounts(db: DB): Map<string, number> {
  return new Map((db.prepare("select app_id as id, count(*) as n from app_runs where source not in ('step', 'chat', 'test') group by app_id").all() as { id: string; n: number }[]).map((r) => [r.id, r.n]));
}

/**
 * The user's apps in the order agents get them (find_apps): the pinned ones first, as they are pinned, then those used
 * lately, newest first, then the others as they came. `idOf` names each one's app ("tpl:<id>" for a ready-made one).
 */
export function theirsFirst<T>(db: DB, list: T[], idOf: (x: T) => string): { list: T[]; pinned: Set<string>; used: Set<string> } {
  const pins = pinsOf(db);
  const used = recentApps(db).map((u) => u.app);
  const rank = (x: T) => {
    const id = idOf(x);
    const p = pins.indexOf(id);
    if (p >= 0) return p;
    const u = used.indexOf(id);
    return u >= 0 ? MAX_PINS + u : Infinity;
  };
  // A stable sort: the others keep their order.
  const sorted = list
    .map((x, i) => ({ x, i, r: rank(x) }))
    .sort((a, b) => (a.r === b.r ? a.i - b.i : a.r < b.r ? -1 : 1))
    .map((y) => y.x);
  return { list: sorted, pinned: new Set(pins), used: new Set(used.filter((id) => !pins.includes(id))) };
}
