// Settings a session keeps beyond its agent's own (memory on or off, its assistant, a spending cap…),
// as JSON in app_sessions.extra. Each capability reads and writes its own fields.
import { WIKI_FEATURES, type WikiChoices } from '../shared/wiki-controls.ts';
import { HttpError } from './auth.ts';
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
    // Merge individual wiki choices so concurrent changes do not discard other controls.
    if (k === 'wikiFeatures' && v !== null && v !== undefined) {
      if (typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, 'wikiFeatures: expected feature choices');
      const choices: WikiChoices = { ...next.wikiFeatures };
      for (const [feature, value] of Object.entries(v)) {
        if (!WIKI_FEATURES.includes(feature as typeof WIKI_FEATURES[number]) || (value !== null && typeof value !== 'boolean')) throw new HttpError(400, 'wikiFeatures: true, false or null');
        // Automatic lessons already have a persisted chat field; normalize the API alias into that field.
        if (feature === 'autoLessons') {
          if (Object.hasOwn(patch, 'wikiAutoLessons') && patch.wikiAutoLessons !== value) throw new HttpError(400, 'Conflicting automatic lessons choices');
          if (value === null) delete next.wikiAutoLessons;
          else next.wikiAutoLessons = value as boolean;
          delete choices.autoLessons;
          continue;
        }
        if (value === null) delete choices[feature as keyof WikiChoices];
        else choices[feature as keyof WikiChoices] = value as boolean;
      }
      if (Object.keys(choices).length) next.wikiFeatures = choices;
      else delete next.wikiFeatures;
      continue;
    }
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
