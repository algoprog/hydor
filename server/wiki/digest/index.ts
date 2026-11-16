// Wiki memory from documents and from a project's work (server/wiki/digest): new and changed documents in knowledge
// add memory notes and update the wiki (listening to knowledge's 'indexed' event; the documents already there when
// this came are read once too), and about once a day the project's recent conversations update it
// (work.ts). Lists what it did for the project page.
import { HttpError } from '../../auth.ts';
import { kvGet, kvSet, type DB } from '../../db.ts';
import type { Feature } from '../../features/types.ts';
import { knowledgeEvents, type IndexedDoc } from '../../knowledge/events.ts';
import { knowledgeSchema } from '../../knowledge/store.ts';
import { memoryOn } from '../../memory/store.ts';
import { spaceById } from '../../spaces/index.ts';
import { isWikiBase } from '../knowledge/bindings.ts';
import { wikiSettings } from '../settings/settings.ts';
import { createDigest, type Digest } from './digest.ts';
import { updatesOf } from './store.ts';
import { CHECK_MS, FIRST_CHECK_MS, learnWikiFromWork, wikiWorkDue } from './work.ts';

let digest: Digest | null = null;
let timers: NodeJS.Timeout[] = [];

/** The most documents the one-time backfill queues. */
export const BACKFILL_MAX = 400;
const KV_BACKFILLED = 'wiki.digest.backfilled';

/**
 * Once per install: queues the documents already indexed in the knowledge bases (not a wiki's own), the newest first,
 * for the same digest as new ones: it skips texts it has read and keeps to its hourly budget. Not marked done
 * while memory or "Learn from new documents" is off, so it still happens once they are on. Returns how many it queued.
 */
export function backfillDocuments(db: DB, queue: Pick<Digest, 'enqueue'>): number {
  if (kvGet(db, KV_BACKFILLED) === '1') return 0;
  if (!memoryOn(db) || !wikiSettings(db).fromDocuments) return 0;
  knowledgeSchema(db);
  const rows = db.prepare("select base, path, title from kb_docs where status = 'indexed' order by indexed_at desc, id desc").all() as IndexedDoc[];
  const wiki = new Map<string, boolean>();
  let n = 0;
  for (const r of rows) {
    if (n >= BACKFILL_MAX) break;
    if (!wiki.has(r.base)) wiki.set(r.base, isWikiBase(db, r.base));
    if (wiki.get(r.base)) continue;
    queue.enqueue({ base: r.base, path: r.path, title: r.title });
    n++;
  }
  kvSet(db, KV_BACKFILLED, '1');
  return n;
}

export const wikiDigest: Feature = {
  id: 'wiki-digest',
  routes(d) {
    /** What new and changed documents did to the shared wiki and memory, newest first. */
    d.app.get('/api/wiki/updates', async () => ({ updates: updatesOf(d.db, null) }));
    /** The same for one project. */
    d.app.get('/api/projects/:id/wiki/updates', async (req) => {
      const id = String((req.params as { id: string }).id);
      if (!spaceById(d.db, id)) throw new HttpError(404, 'No such project');
      return { updates: updatesOf(d.db, id) };
    });
  },
  start(d) {
    digest?.dispose();
    const onUpdate = (space: string | null) => d.broadcast({ t: 'feature', id: 'wiki', data: { space } });
    const mine = (digest = createDigest(d.db, { onUpdate }));
    knowledgeEvents.on('indexed', (doc: IndexedDoc) => mine.enqueue(doc));
    try {
      backfillDocuments(d.db, mine);
    } catch (e) {
      console.warn(`[wiki] reading the documents already there: ${(e as Error).message}`);
    }
    // The project's work, about once a day when nobody has been writing for a few minutes. The server restarts often:
    // when it last ran is in the database. A first pass comes soon after the start, so a wiki fills after an update.
    timers.forEach(clearTimeout);
    const check = () => {
      try {
        if (memoryOn(d.db) && wikiWorkDue(d.db)) void learnWikiFromWork(d.db, undefined, Date.now(), onUpdate);
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
