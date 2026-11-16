// Resolve per-chat controls without replacing project-level wiki memory settings.
import type { SessionExtra } from '../../shared/features.ts';
import { isConfidential } from '../../shared/confidential.ts';
import type { DB } from '../db.ts';
import { sessionExtra } from '../sessionExtra.ts';
import { wikiMemoryOn, wikiSpaceOfSession } from './roots.ts';
import { wikiSettings } from './settings/settings.ts';

/** A chat setting supplements the project's existing Wiki memory setting. */
export function wikiChatEnabled(db: DB, extra: SessionExtra): boolean {
  return !isConfidential(extra) && (typeof extra.wikiEnabled === 'boolean' ? extra.wikiEnabled : wikiSettings(db).defaultChatEnabled);
}

/** Automatic suggestions use the same session choice and installation defaults. */
export function wikiAutoLessonsEnabled(db: DB, extra: SessionExtra): boolean {
  return wikiChatEnabled(db, extra) && (typeof extra.wikiAutoLessons === 'boolean' ? extra.wikiAutoLessons : wikiSettings(db).defaultAutoLessons);
}

/** Every access must also respect the existing per-project wiki setting. */
export function wikiEnabledForSession(db: DB, key: string, cwd?: string): boolean {
  return wikiChatEnabled(db, sessionExtra(db, key)) && wikiMemoryOn(db, wikiSpaceOfSession(db, key, cwd));
}
