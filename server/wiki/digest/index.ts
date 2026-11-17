// Wiki memory from documents and from a project's work (server/wiki/digest): new and changed documents in knowledge
// add memory notes and update the wiki (listening to knowledge's 'indexed' event; the documents already there when
// this came are read once too; a project with more documents than its limit reads the pinned, the most used and the
// newest, and has an overview article for each folder of the rest, overviews.ts), and about once a day, and when a session
// has gone quiet, the project's recent conversations update it (work.ts), as do its commit messages once a day
// (commits.ts). Lists what it did for the project page. The same check keeps the wikis' areas (../areas): new articles
// placed, the reorganising pass when it is due, folds and merges, hubs written again; and a route asks for a pass now.
import { HttpError } from '../../auth.ts';
import { kvGet, kvSet, type DB } from '../../db.ts';
import type { Feature } from '../../features/types.ts';
import { knowledgeEvents, type IndexedDoc } from '../../knowledge/events.ts';
import { knowledgeSchema } from '../../knowledge/store.ts';
import { memoryOn } from '../../memory/store.ts';
import { spaceById } from '../../spaces/index.ts';
import { wikiMemoryOn } from '../roots.ts';
import { wikiSettings } from '../settings/settings.ts';
import { createHash } from 'node:crypto';
import { digestCommitsDue } from './commits.ts';
import { createDigest, type Digest } from './digest.ts';
import { documentBases, documentsOverLimit, documentsToRead, docKey } from './limit.ts';
import { writeOverviews } from './overviews.ts';
import { helperDigestAsk } from './plan.ts';
import { updatesOf } from './store.ts';
import { startWikiDrift } from './drift.ts';
import { CHECK_MS, FIRST_CHECK_MS, learnWikiFromQuiet, learnWikiFromWork, nobodyWriting, wikiWorkDue } from './work.ts';
import { areasHelper, reorganiseNow, tendAreas } from '../areas/tend.ts';
import { estimateRebuild, restoreArchive, startRebuild, wikiJobStatus } from '../areas/rebuild.ts';
import { startUpdate, updateParts } from '../areas/update.ts';
import { resumeWikiJobs } from '../areas/resume.ts';
import { setDigestQueue } from './queue.ts';

let digest: Digest | null = null;
let timers: NodeJS.Timeout[] = [];

/** The most documents queued at once for a place when it first qualifies. */
export const BACKFILL_MAX = 400;
/** Marks a place whose documents were queued (the project's id, or "shared"): per place, so one that qualifies later is queued then. */
const markKey = (space: string | null) => `wiki.digest.backfilled.${space ?? 'shared'}`;
/** For a place over its limit: the documents of its read set that were queued (short hashes), so only a document that joins the set later is queued. */
const pickedKey = (space: string | null) => `wiki.digest.picked.${space ?? 'shared'}`;
const shortHash = (base: string, path: string) => createHash('sha1').update(docKey(base, path)).digest('hex').slice(0, 12);

/**
 * Queues the documents already indexed in a place's knowledge bases (not a wiki's own), the newest first, at most
 * BACKFILL_MAX, for the same digest as new ones: it skips texts it has read and keeps to its hourly budget. A place is
 * queued once, when it first qualifies: memory and "Learn from new documents" on, and wiki memory on for it. One with
 * more documents than its limit (Wiki memory's "Most documents to read into the wiki") queues the documents its wiki
 * reads (the pinned, the most used and the newest), first; each check queues those that joined that set since (a document
 * pinned or used a lot), and it loses its mark, so documents added while it was over are read when it is under again.
 * A place that does not qualify yet is not marked, so it is queued when it does (a switch turned on). Returns how many it queued.
 */
export function backfillDocuments(db: DB, queue: Pick<Digest, 'enqueue'>): number {
  if (!memoryOn(db) || !wikiSettings(db).fromDocuments) return 0;
  knowledgeSchema(db);
  const places = (db.prepare('select distinct space from kb_bases').all() as { space: string | null }[]).map((r) => r.space);
  if (!places.includes(null)) places.push(null);
  const found: (IndexedDoc & { indexed_at: number; id: number })[] = [];
  const picked: IndexedDoc[] = [];
  for (const space of places) {
    if (space && !spaceById(db, space)) continue;
    if (!wikiMemoryOn(db, space)) continue;
    const reads = documentsToRead(db, space);
    if (reads) {
      if (kvGet(db, markKey(space)) === '1') kvSet(db, markKey(space), '');
      const now = reads.slice(0, BACKFILL_MAX);
      const queued = new Set<string>(JSON.parse(kvGet(db, pickedKey(space)) || '[]'));
      for (const r of now) if (!queued.has(shortHash(r.base, r.path))) picked.push({ base: r.base, path: r.path, title: r.title });
      kvSet(db, pickedKey(space), JSON.stringify(now.map((r) => shortHash(r.base, r.path))));
      continue;
    }
    if (kvGet(db, pickedKey(space))) kvSet(db, pickedKey(space), '');
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
  for (const r of [...picked, ...found]) queue.enqueue({ base: r.base, path: r.path, title: r.title });
  return picked.length + found.length;
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
    const changed = (space: string | null) => d.broadcast({ t: 'feature', id: 'wiki', data: { space } });
    /** Reorganise the shared wiki's areas now, whatever the triggers say (one at a time). */
    d.app.post('/api/wiki/reorganise', async () => reorganiseNow(d.db, null, { onUpdate: changed }));
    /** The same for a project's wiki. */
    d.app.post('/api/projects/:id/wiki/reorganise', async (req) => {
      const id = String((req.params as { id: string }).id);
      if (!spaceById(d.db, id)) throw new HttpError(404, 'No such project');
      return reorganiseNow(d.db, id, { onUpdate: changed });
    });
    // Rebuild a wiki from its sources (an estimate first, then { confirm: true }), its status, putting an archive back, and Update now.
    const helpers = () => {
      const ask = areasHelper(d.db);
      return { ask, strong: ((q) => ask({ ...q, strong: true })) as typeof ask, onUpdate: changed };
    };
    const busy = (key: string) => ['working', 'waiting', 'starting'].includes(d.sessions?.summary(key)?.live?.status ?? '');
    const place = (req: { params: unknown }): string | null => {
      const id = (req.params as { id?: string }).id;
      if (id === undefined) return null;
      if (!spaceById(d.db, String(id))) throw new HttpError(404, 'No such project');
      return String(id);
    };
    const rebuild = async (req: { params: unknown; body: unknown }) => {
      const space = place(req);
      const body = (req.body ?? {}) as { confirm?: unknown };
      if (body.confirm !== true) return estimateRebuild(d.db, space);
      return startRebuild(d.db, space, helpers());
    };
    const status = async (req: { params: unknown }) => wikiJobStatus(d.db, place(req));
    const restore = async (req: { params: unknown; body: unknown }) => {
      const at = (req.body as { at?: unknown } | undefined)?.at;
      if (typeof at !== 'string' || !at) throw new HttpError(400, 'at: the time of the archive to restore (GET …/wiki/rebuild lists them)');
      return restoreArchive(d.db, place(req), at, { onUpdate: changed });
    };
    const update = async (req: { params: unknown; body: unknown }) => startUpdate(d.db, place(req), updateParts((req.body as { parts?: unknown } | undefined)?.parts), { ...helpers(), busy });
    d.app.post('/api/wiki/rebuild', rebuild);
    d.app.post('/api/projects/:id/wiki/rebuild', rebuild);
    d.app.get('/api/wiki/rebuild', status);
    d.app.get('/api/projects/:id/wiki/rebuild', status);
    d.app.post('/api/wiki/rebuild/restore', restore);
    d.app.post('/api/projects/:id/wiki/rebuild/restore', restore);
    d.app.post('/api/wiki/update', update);
    d.app.post('/api/projects/:id/wiki/update', update);
  },
  start(d) {
    digest?.dispose();
    const onUpdate = (space: string | null) => d.broadcast({ t: 'feature', id: 'wiki', data: { space } });
    const mine = (digest = createDigest(d.db, { onUpdate }));
    setDigestQueue(mine);
    // A rebuild the last stop cut short goes on where it stopped; an update or a reorganisation is not taken up again.
    resumeWikiJobs(d.db, { onUpdate, busy: (key) => ['working', 'waiting', 'starting'].includes(d.sessions.summary(key)?.live?.status ?? '') });
    knowledgeEvents.on('indexed', (doc: IndexedDoc) => mine.enqueue(doc));
    startWikiDrift(d.db, onUpdate);
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
    const busy = (key: string) => ['working', 'waiting', 'starting'].includes(d.sessions.summary(key)?.live?.status ?? '');
    // Each part of a check in turn (one helper call at a time), and one that fails holds up none of the others.
    const guarded = async (what: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (e) {
        console.warn(`[wiki] ${what}: ${(e as Error).message}`);
      }
    };
    const check = () => {
      backfill();
      if (!memoryOn(d.db)) return;
      void (async () => {
        // The daily pass over the projects' work; besides it, a session that has been quiet for a while is read now, not tomorrow.
        if (wikiWorkDue(d.db)) await guarded("learning from the projects' work", () => learnWikiFromWork(d.db, undefined, Date.now(), onUpdate, { busy }));
        else await guarded('learning from quiet sessions', () => learnWikiFromQuiet(d.db, undefined, Date.now(), onUpdate, { busy }));
        await guarded('reading commits', () => digestCommitsDue(d.db, undefined, Date.now(), onUpdate));
        await guarded('writing overviews', () => writeOverviews(d.db, helperDigestAsk(d.db), Date.now(), onUpdate));
        // The wikis' areas: placing new articles, the reorganising pass when it is due (only while nobody is writing to an agent), merges, hubs.
        await guarded('keeping wiki areas', () => tendAreas(d.db, { now: Date.now(), onUpdate, quiet: nobodyWriting(d.db) }));
      })();
    };
    const first = setTimeout(check, FIRST_CHECK_MS);
    const every = setInterval(check, CHECK_MS);
    first.unref?.();
    every.unref?.();
    timers = [first, every];
  },
};
