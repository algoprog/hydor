// The ready-made apps (templates.ts) come installed: each one you uninstall leaves your apps, and agents' tools,
// and waits under Ready-made apps on the Apps page to be installed again; its runs stay. Agents in your sessions
// may run each installed one for you unless you turn that off on its page (Agents can use it). Both are kept as
// lists of the ones changed, so a ready-made app added in a later version comes installed and offered.
import type { AppTemplate } from '../../shared/apps.ts';
import { madeForSessions } from '../../shared/apps.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import { TEMPLATES } from './templates.ts';

const KEY = 'apps.builtins';

interface State {
  /** Uninstalled, by id. */
  removed: string[];
  /** Installed, but agents in sessions may not run them, by id. */
  quiet: string[];
}

function read(db: DB): State {
  try {
    const s = JSON.parse(kvGet(db, KEY) ?? '{}') as Partial<State>;
    const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    return { removed: ids(s.removed), quiet: ids(s.quiet) };
  } catch {
    return { removed: [], quiet: [] };
  }
}

function write(db: DB, s: State) {
  kvSet(db, KEY, JSON.stringify({ removed: [...new Set(s.removed)].sort(), quiet: [...new Set(s.quiet)].sort() }));
}

/** A ready-made app is installed (all are, until you uninstall one). */
export const isInstalled = (db: DB, id: string): boolean => !read(db).removed.includes(id);

/** Agents in sessions may run it (when it is installed and made for that). */
export const agentsMay = (db: DB, id: string): boolean => !read(db).quiet.includes(id);

export function setInstalled(db: DB, id: string, on: boolean) {
  const s = read(db);
  s.removed = on ? s.removed.filter((x) => x !== id) : [...s.removed, id];
  write(db, s);
}

export function setAgents(db: DB, id: string, on: boolean) {
  const s = read(db);
  s.quiet = on ? s.quiet.filter((x) => x !== id) : [...s.quiet, id];
  write(db, s);
}

/** A ready-made app as the pages list it: whether it is installed, and whether agents may run it. */
export type BuiltinView = AppTemplate & { installed: boolean; agents: boolean };

export function builtinsOf(db: DB): BuiltinView[] {
  const s = read(db);
  return TEMPLATES.map((t) => ({ ...t, installed: !s.removed.includes(t.id), agents: !s.quiet.includes(t.id) }));
}

/** The ready-made apps agents in sessions may run now: installed, allowed, and made for it. */
export const builtinsForAgents = (db: DB): AppTemplate[] => builtinsOf(db).filter((t) => t.installed && t.agents && madeForSessions(t));
