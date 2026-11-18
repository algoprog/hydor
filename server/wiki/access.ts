// Wiki memory is set for every project (Settings → Memory → Wiki memory) and in each project's own settings; a chat has no switch of its own.
import type { SessionExtra } from '../../shared/features.ts';
import { isConfidential } from '../../shared/confidential.ts';
import type { DB } from '../db.ts';
import { sessionExtra } from '../sessionExtra.ts';
import { wikiMemoryOn, wikiSpaceOfSession } from './roots.ts';

/** Every chat may use wiki memory but a Confidential one. */
export function wikiChatEnabled(extra: SessionExtra): boolean {
  return !isConfidential(extra);
}

/** A session uses wiki memory while its project (or the shared wiki) has it on, unless the chat is Confidential. */
export function wikiEnabledForSession(db: DB, key: string, cwd?: string): boolean {
  return wikiChatEnabled(sessionExtra(db, key)) && wikiMemoryOn(db, wikiSpaceOfSession(db, key, cwd));
}
