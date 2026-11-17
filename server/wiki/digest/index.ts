// Wiki memory from documents and from a project's work (server/wiki/digest): new and changed documents in knowledge
// add memory notes and update the wiki (listening to knowledge's 'indexed' event; the documents already there when
// this came are read once too, each project once unless it has too many documents), and about once a day the project's recent conversations update it
// (work.ts). Lists what it did for the project page.
import { HttpError } from '../../auth.ts';
import { kvGet, kvSet, type DB } from '../../db.ts';
import type { Feature } from '../../features/types.ts';
import { knowledgeEvents, type IndexedDoc } from '../../knowledge/events.ts';
import { knowledgeSchema } from '../../knowledge/store.ts';
import { memoryOn } from '../../memory/store.ts';
import { spaceById } from '../../spaces/index.ts';
import { wikiMemoryOn } from '../roots.ts';
import { wikiSettings } from '../settings/settings.ts';
import { createDigest, type Digest } from './digest.ts';
import { documentBases, documentsOverLimit } from './limit.ts';
import { updatesOf } from './store.ts';
import { CHECK_MS, FIRST_CHECK_MS, learnWikiFromWork, wikiWorkDue } from './work.ts';

let digest: Digest | null = null;
let timers: NodeJS.Timeout[] = [];

/** The most documents queued at once for a place when it first qualifies. */
export const BACKFILL_MAX = 400;
/** Marks a place whose documents were queued (the project's id, or "shared"): per place, so one that qualifies later is queued then. */
const markKey = (space: string | null) => `wiki.digest.backfilled.${space ?? 'shared'}`;

/**
 * Queues the documents already indexed in a place's knowledge bases (not a wiki's own), the newest first, at most
 * BACKFILL_MAX, for the same digest as new ones: it skips texts it has read and keeps to its hourly budget. A place is
 * queued once, when it first qualifies: memory and "Learn from new documents" on, wiki memory on for it, and not more
 * documents than its limit (Wiki memory's "Most documents to read into the wiki"). A place that does not qualify yet
 * is not marked, so it is queued when it does (a limit raised, a switch turned on); one over its limit loses its mark,
 * so documents added while it was over are read when it is under again. Returns how many it queued.
 */
export function backfillDocuments(db: DB, queue: Pick<Digest, 'enqueue'>): number {
  if (!memoryOn(db) || !wikiSettings(db).fromDocuments) return 0;
  knowledgeSchema(db);
  const places = (db.prepare('select distinct space from kb_bases').all() as { space: string | null }[]).map((r) => r.space);
  if (!places.includes(null)) places.push(null);
  const found: (IndexedDoc & { indexed_at: number; id: number })[] = [];
  for (const space of places) {
    if (space && !spaceById(db, space)) continue;
    if (!wikiMemoryOn(db, space)) continue;
    if (documentsOverLimit(db, space).over) {
      if (kvGet(db, markKey(space)) === '1') kvSet(db, markKey(space), '');
      continue;
    }
    if (kvGet(db, markKey(space)) === '1') continue;
    const bases = documentBases(db, space);
    if (bases.length) {
      const rows = db.prepare(`select id, base, path, title, indexed_at from kb_docs where status = 'indexed' and base in (${bases.map(() => '?').join(',')}) order by indexed_at desc, id desc limit ${BACKFILL_MAX}`).all(...bases) as typeof found;
      found.push(...rows);
    }
    kvSet(db, markKey(space), '1');
  }
  // The newest first, across the places that qualified.
  found.sort((a, b) => b.indexed_at - a.indexed_at || b.id - a.id);
  for (const r of found) queue.enqueue({ base: r.base, path: r.path, title: r.title });
  return found.length;
}

export const wikiDigest: Feature = {
  id: 'wiki-digest',
  routes(d) {
    /** What new and changed documents did to the shared wiki and memory, newest first. */
    d.app.get('/api/wiki/updates', async () => ({ updates: updatesOf(d.db, null), documents: documentsOverLimit(d.db, null) }));
    /** The same for one project. */
    d.app.get('/api/projects/:id/wiki/updates', async (req) => {
      const id = String((req.params as { id: string }).id);
      if (!spaceById(d.db, id)) throw new HttpError(404, 'No such project');
      return { updates: updatesOf(d.db, id), documents: documentsOverLimit(d.db, id) };
    });
  },
  start(d) {
    digest?.dispose();
    const onUpdate = (space: string | null) => d.broadcast({ t: 'feature', id: 'wiki', data: { space } });
    const mine = (digest = createDigest(d.db, { onUpdate }));
    knowledgeEvents.on('indexed', (doc: IndexedDoc) => mine.enqueue(doc));
    // The documents already there: each place once, when it qualifies; looked at again with every check, so a limit
    // raised or a switch turned on later reads that place's documents then.
    const backfill = () => {
      try {
        backfillDocuments(d.db, mine);
      } catch (e) {
        console.warn(`[wiki] reading the documents already there: ${(e as Error).message}`);
      }
    };
    backfill();
    // The project's work, about once a day when nobody has been writing for a few minutes. The server restarts often:
    // when it last ran is in the database. A first pass comes soon after the start, so a wiki fills after an update.
    timers.forEach(clearTimeout);
    const check = () => {
      backfill();
      try {
        if (memoryOn(d.db) && wikiWorkDue(d.db)) void learnWikiFromWork(d.db, undefined, Date.now(), onUpdate, { busy: (key) => ['working', 'waiting', 'starting'].includes(d.sessions.summary(key)?.live?.status ?? '') });
      } catch (e) {
        console.warn(`[wiki] learning from the projects' work: ${(e as Error).message}`);
      }
    };
    const first = setTimeout(check, FIRST_CHECK_MS);
    const every = setInterval(check, CHECK_MS);
    first.unref?.();
    every.unref?.();
    timers = [first, every];
  },
};
