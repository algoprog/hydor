// Wiki memory from documents and from a project's work (server/wiki/digest): new and changed documents in knowledge
// add memory notes and update the wiki (listening to knowledge's 'indexed' event; the documents already there when
// this came are read too, every check queuing those its wiki has not read yet, up to 100 waiting a place; a project with
// more documents than its limit reads the pinned, the most used and the newest, and has an overview article for each
// folder of the rest, overviews.ts), and about once a day, and when a session
// has gone quiet, the project's recent conversations update it (work.ts), as do its commit messages once a day
// (commits.ts). Lists what it did for the project page. The same check keeps the wikis' areas (../areas): new articles
// placed, the reorganising pass when it is due, folds and merges, hubs written again; and a route asks for a pass now.
import { HttpError } from '../../auth.ts';
import type { DB } from '../../db.ts';
import type { Feature } from '../../features/types.ts';
import { knowledgeEvents, type IndexedDoc } from '../../knowledge/events.ts';
import { knowledgeSchema } from '../../knowledge/store.ts';
import { memoryOn } from '../../memory/store.ts';
import { spaceById } from '../../spaces/index.ts';
import { wikiMemoryOn } from '../roots.ts';
import { wikiSettings } from '../settings/settings.ts';
import { digestCommitsDue } from './commits.ts';
import { createDigest, type Digest } from './digest.ts';
import { documentBases, documentsOverLimit, docKey, unreadDocuments } from './limit.ts';
import { writeOverviews } from './overviews.ts';
import { helperDigestAsk } from './plan.ts';
import { updatesOf } from './store.ts';
import { startWikiDrift } from './drift.ts';
import { CHECK_MS, FIRST_CHECK_MS, learnWikiFromQuiet, learnWikiFromWork, nobodyWriting, wikiWorkDue } from './work.ts';
import { areasHelper, reorganiseNow, tendAreas } from '../areas/tend.ts';
import { estimateRebuild, restoreArchive, startRebuild, wikiJobStatus } from '../areas/rebuild.ts';
import { startUpdate, updateParts } from '../areas/update.ts';
import { buildOffer, startBuild } from '../areas/build.ts';
import { continueWikiJob, stopWikiJob } from '../areas/control.ts';
import { resumeWikiJobs } from '../areas/resume.ts';
import { setWikiJobBroadcast } from '../areas/jobs.ts';
import { setDigestQueue } from './queue.ts';

let digest: Digest | null = null;
let timers: NodeJS.Timeout[] = [];

/** The most documents waiting at once for a place: the next ones are queued as these are read. */
export const WAITING_PER_PLACE = 100;

/**
 * Queues the documents a place's wiki should read and has not read yet (those in knowledge, not a wiki's own), in the
 * order its wiki reads them, up to WAITING_PER_PLACE waiting for a place, for the same digest as new ones: it skips
 * texts it has read and keeps to its hourly budget. Nothing is marked as queued: what was read (or tried too often) is
 * in the database (store.ts), what waits is in the queue, so a restart, a limit raised later or a switch turned on
 * later loses nothing, and every check queues the next ones as the waiting ones are read. A place qualifies when memory
 * and "Learn from new documents" are on and wiki memory is on for it. One with more documents than its limit (Wiki
 * memory's "Most documents to read into the wiki") queues the documents its wiki reads (the pinned, the most used and
 * the newest). Returns how many it queued.
 */
export function backfillDocuments(db: DB, queue: Pick<Digest, 'enqueue' | 'waiting'>, o: { now?: number; perPlace?: number } = {}): number {
  if (!memoryOn(db) || !wikiSettings(db).fromDocuments) return 0;
  knowledgeSchema(db);
  const now = o.now ?? Date.now();
  const perPlace = o.perPlace ?? WAITING_PER_PLACE;
  const places = (db.prepare('select distinct space from kb_bases').all() as { space: string | null }[]).map((r) => r.space);
  if (!places.includes(null)) places.push(null);
  let queued = 0;
  for (const space of places) {
    if (space && !spaceById(db, space)) continue;
    if (!wikiMemoryOn(db, space)) continue;
    const bases = new Set(documentBases(db, space));
    const waiting = queue.waiting().filter((w) => bases.has(w.base));
    const room = perPlace - waiting.length;
    if (room <= 0) continue;
    const here = new Set(waiting.map((w) => docKey(w.base, w.path)));
    const next = unreadDocuments(db, space, { max: room + waiting.length, now }).filter((r) => !here.has(docKey(r.base, r.path))).slice(0, room);
    for (const r of next) queue.enqueue({ base: r.base, path: r.path, title: r.title });
    queued += next.length;
  }
  return queued;
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
    setWikiJobBroadcast(changed);
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
    /** Build from history: what a project's empty wiki would read (GET, and POST without confirm), or start it. Projects only. */
    const build = async (req: { params: unknown; body: unknown }) => {
      const space = place(req);
      if (!space) throw new HttpError(404, 'Only a project can be built from its history');
      const body = (req.body ?? {}) as { confirm?: unknown; exclude?: unknown };
      if (body.confirm !== true) {
        const offer = await buildOffer(d.db, space);
        if (!offer) throw new HttpError(409, 'Memory, or wiki memory for this project, is off');
        return offer;
      }
      return startBuild(d.db, space, { ...helpers(), ...(typeof body.exclude === 'string' ? { exclude: body.exclude } : {}) });
    };
    const stop = async (req: { params: unknown }) => stopWikiJob(d.db, place(req));
    const goOn = async (req: { params: unknown }) => continueWikiJob(d.db, place(req), helpers());
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
    d.app.get('/api/projects/:id/wiki/build', build);
    d.app.post('/api/projects/:id/wiki/build', build);
    d.app.post('/api/wiki/stop', stop);
    d.app.post('/api/projects/:id/wiki/stop', stop);
    d.app.post('/api/wiki/continue', goOn);
    d.app.post('/api/projects/:id/wiki/continue', goOn);
    d.app.post('/api/wiki/update', update);
    d.app.post('/api/projects/:id/wiki/update', update);
  },
  start(d) {
    digest?.dispose();
    const onUpdate = (space: string | null) => d.broadcast({ t: 'feature', id: 'wiki', data: { space } });
    setWikiJobBroadcast(onUpdate);
    const mine = (digest = createDigest(d.db, { onUpdate }));
    setDigestQueue(mine);
    // A rebuild the last stop cut short goes on where it stopped; an update or a reorganisation is not taken up again.
    resumeWikiJobs(d.db, { onUpdate, busy: (key) => ['working', 'waiting', 'starting'].includes(d.sessions.summary(key)?.live?.status ?? '') });
    knowledgeEvents.on('indexed', (doc: IndexedDoc) => mine.enqueue(doc));
    startWikiDrift(d.db, onUpdate);
    // The documents already there, which the last run did not finish reading (what was read is in the database, not
    // in a mark: an older version's marks go): every check queues what a place's wiki should read and has not read,
    // up to 100 waiting a place, so a restart, a raised limit or a switch turned on later loses nothing.
    d.db.prepare("delete from kv where k like 'wiki.digest.backfilled.%' or k like 'wiki.digest.picked.%'").run();
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
