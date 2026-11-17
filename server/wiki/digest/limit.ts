// How many documents a project's wiki reads. A project with more documents in its knowledge than its limit reads only
// `limit` of them: the pinned ones, then those agents used most, then the newest. The others stay for agents to search
// (as does the shared knowledge against Settings' number): reading thousands of files with the helper model is slow
// and costs a lot, and retrieval serves them well.
import type { DB } from '../../db.ts';
import { knowledgeSchema } from '../../knowledge/store.ts';
import type { WikiDocuments } from '../../../shared/wiki.ts';
import { spaceById } from '../../spaces/index.ts';
import { isWikiBase } from '../knowledge/bindings.ts';
import { wikiSettings } from '../settings/settings.ts';
import { ensureDigestSchema, READ_TRIES, RETRY_AFTER_MS } from './store.ts';

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

/** A document as the sets below name it. */
export const docKey = (base: string, path: string) => `${base}\n${path}`;

/**
 * The documents a place's wiki reads when it holds more than its limit, in the order they are picked: pinned (the
 * latest pin first), then the most used by agents, then the newest; never more than the limit. Null when it holds no
 * more than its limit: every document is read.
 */
export function documentsToRead(db: DB, space: string | null): { base: string; path: string; title: string; id: number }[] | null {
  const { limit, over } = documentsOverLimit(db, space);
  if (!over) return null;
  return readSet(db, documentBases(db, space), limit).map(({ id, base, path, title }) => ({ id, base, path, title }));
}

/** The order the read set is picked in: pinned (the latest pin first), most used, newest. */
const READ_ORDER = 'coalesce(m.pinned_at, 0) desc, coalesce(m.uses, 0) desc, d.mtime desc, d.id desc';
/** The first `limit` indexed documents of the bases in read order, with the columns that order them. */
const READ_SET = (bases: string[]) =>
  `select d.id as id, d.base as base, d.path as path, d.title as title, d.indexed_at as indexed_at, coalesce(m.pinned_at, 0) as pinned, coalesce(m.uses, 0) as uses, d.mtime as mtime
   from kb_docs d left join kb_doc_marks m on m.base = d.base and m.path = d.path
   where d.status = 'indexed' and d.base in (${bases.map(() => '?').join(',')}) order by ${READ_ORDER} limit ?`;

function readSet(db: DB, bases: string[], limit: number) {
  if (!bases.length) return [];
  return db.prepare(READ_SET(bases)).all(...bases, limit) as { base: string; path: string; title: string; id: number }[];
}

/**
 * The documents of a place's read set (its first `documentLimit` documents in read order: all of them when it holds no
 * more than its limit, none when the limit is 0) that its wiki has not handled yet, in read order, at most `max`. A
 * document is handled when the digest read it (or had nothing to read) at its current version, gave it READ_TRIES
 * failed tries, or tried it less than RETRY_AFTER_MS before `now`; a changed document is unread again.
 */
export function unreadDocuments(db: DB, space: string | null, o: { max: number; now: number }): { base: string; path: string; title: string }[] {
  const bases = documentBases(db, space);
  const limit = documentLimit(db, space);
  if (!bases.length || o.max <= 0 || limit <= 0) return [];
  ensureDigestSchema(db);
  return db
    .prepare(
      `select s.base as base, s.path as path, s.title as title from (${READ_SET(bases)}) s left join wiki_doc_reads r on r.base = s.base and r.path = s.path
       where r.base is null or r.version < s.indexed_at or (r.ok = 0 and r.tries < ? and ? - r.at >= ?)
       order by s.pinned desc, s.uses desc, s.mtime desc, s.id desc limit ?`,
    )
    .all(...bases, limit, READ_TRIES, o.now, RETRY_AFTER_MS, o.max) as { base: string; path: string; title: string }[];
}

/** Whether a document is read into the place's wiki: always when the place is within its limit, else when it is picked. */
export function wikiReads(db: DB, space: string | null, base: string, path: string): boolean {
  const picked = documentsToRead(db, space);
  return !picked || picked.some((d) => d.base === base && d.path === path);
}
