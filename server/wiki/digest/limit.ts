// How many documents a project's wiki reads. A project with more documents in its knowledge than its limit keeps them
// out of its wiki (agents search them instead), as does the shared knowledge against Settings' number: reading
// thousands of files with the helper model is slow and costs a lot, and retrieval serves them well.
import type { DB } from '../../db.ts';
import { knowledgeSchema } from '../../knowledge/store.ts';
import type { WikiDocuments } from '../../../shared/wiki.ts';
import { spaceById } from '../../spaces/index.ts';
import { isWikiBase } from '../knowledge/bindings.ts';
import { wikiSettings } from '../settings/settings.ts';

/** The most documents the place's wiki reads: the project's own number, else Settings' (the shared wiki has only that). */
export function documentLimit(db: DB, space: string | null): number {
  return (space ? spaceById(db, space)?.wikiDocumentLimit : undefined) ?? wikiSettings(db).documentLimit;
}

/** The knowledge bases of a place (a project's id; null: the shared knowledge) that are not a wiki's own. */
export function documentBases(db: DB, space: string | null): string[] {
  knowledgeSchema(db);
  return (db.prepare('select id from kb_bases where space is ?').all(space) as { id: string }[]).map((r) => r.id).filter((id) => !isWikiBase(db, id));
}

/** Indexed documents in a place's knowledge, not counting its wiki's own. */
export function documentCount(db: DB, space: string | null): number {
  const bases = documentBases(db, space);
  if (!bases.length) return 0;
  return (db.prepare(`select count(*) as n from kb_docs where status = 'indexed' and base in (${bases.map(() => '?').join(',')})`).get(...bases) as { n: number }).n;
}

/** How many documents a place holds, the most its wiki reads, and whether it holds more. */
export function documentsOverLimit(db: DB, space: string | null): WikiDocuments {
  const limit = documentLimit(db, space);
  const count = documentCount(db, space);
  return { count, limit, over: count > limit };
}
