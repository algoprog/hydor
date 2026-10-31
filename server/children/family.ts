// Who started whom: a child session keeps its parent's key in its settings (extra.parent).
import type { DB } from '../db.ts';
import { parseExtra, sessionExtra } from '../sessionExtra.ts';

/** The session that started this one, when it is a child session. */
export function parentOf(db: DB, key: string): string | undefined {
  const p = sessionExtra(db, key).parent;
  return typeof p === 'string' && p ? p : undefined;
}

/** A session's child sessions, oldest first. */
export function childKeys(db: DB, key: string): string[] {
  const rows = db.prepare('select key, extra from app_sessions where instr(extra, ?) > 0 order by created_at, key').all(`"parent":${JSON.stringify(key)}`) as { key: string; extra: string }[];
  return rows.filter((r) => parseExtra(r.extra).parent === key).map((r) => r.key);
}
