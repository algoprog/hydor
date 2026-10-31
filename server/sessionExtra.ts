// Settings a session keeps beyond its agent's own (memory on or off, its assistant, a spending cap…),
// as JSON in app_sessions.extra. Each capability reads and writes its own fields.
import type { SessionExtra } from '../shared/features.ts';
import type { DB } from './db.ts';

const agentOf = (key: string) => (key.startsWith('codex:') ? 'codex' : key.startsWith('acp:') ? 'acp' : 'claude');

export function parseExtra(v: string | null | undefined): SessionExtra {
  if (!v) return {};
  try {
    const x = JSON.parse(v);
    return x && typeof x === 'object' && !Array.isArray(x) ? x : {};
  } catch {
    return {};
  }
}

export function sessionExtra(db: DB, key: string): SessionExtra {
  const r = db.prepare('select extra from app_sessions where key = ?').get(key) as { extra: string | null } | undefined;
  return parseExtra(r?.extra);
}

/** Merges `patch` into the session's settings: a null field is removed. Returns the result. */
export function setSessionExtra(db: DB, key: string, patch: Record<string, unknown>): SessionExtra {
  const next: SessionExtra = { ...sessionExtra(db, key) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined) delete next[k];
    else next[k] = v;
  }
  const now = Date.now();
  db.prepare('insert into app_sessions (key, agent, extra, created_at, updated_at) values (?, ?, ?, ?, ?) on conflict(key) do update set extra = excluded.extra').run(
    key,
    agentOf(key),
    JSON.stringify(next),
    now,
    now,
  );
  return next;
}
