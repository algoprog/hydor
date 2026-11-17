// Reading a job's sources: what a build and a rebuild share. The sources of a job (job.sources: raw/ paths, session:<key>,
// doc:<base>:<path>, wiki/ articles of an archive) are read by a small pool of workers, in order, a few at once (pool.ts); each
// goes through the digest (digestText, safe for several copies at a wiki: digest/lock.ts). The job's state is saved as each ends:
// which sources are read (`finished`, not in order when several run at once), what is being read now, the sources the helper could
// not read. A source the helper fails on is tried once more. Stopping (jobs.ts stopJob) ends the loop between sources and the
// helper calls in flight; what was read stays read, the sources that were in flight are read again when the job goes on.
import { kvGet, kvSet, type DB } from '../../db.ts';
import { helperParallel } from '../../helper.ts';
import { spaceById } from '../../spaces/index.ts';
import { withSignal, type DigestAsk } from '../digest/plan.ts';
import { jobSignal, saveJob, stopJob, wikiJobChanged, wikiJobEvents, type JobState } from './jobs.ts';
import { areaArticles } from './articles.ts';
import { runMerges } from './merge.ts';
import { runPool } from './pool.ts';
import { reorganiseWiki, reorganising } from './reorganise.ts';
import { areasHelper, refreshHubs } from './tend.ts';
import { AVG_KEY, BUILD_PER_HOUR, DEFAULT_SECONDS, prepareSource, type ReadContext } from './sources.ts';

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done, { once: true });
  });

/** What is being read now, for each wiki running a job in this process (the status shows it; it is not worth a save each time). */
const reading = new Map<string, Map<number, string>>();
const key = (space: string | null) => space ?? '';
export const readingNow = (space: string | null): string[] => mergeCommitTitles([...(reading.get(key(space))?.values() ?? [])]);

const COMMITS = /^Commits (\d{4}-\d\d-\d\d)–(\d{4}-\d\d-\d\d)$/;
/** The commit batches read side by side as one line: "Commits 2026-10-02 – 2026-11-12" (the first of the others stays where it was). */
export function mergeCommitTitles(titles: string[]): string[] {
  const ranges = titles.map((t) => COMMITS.exec(t)).filter((m): m is RegExpExecArray => !!m);
  if (ranges.length < 2) return titles;
  const from = ranges.map((m) => m[1]).sort()[0];
  const to = ranges.map((m) => m[2]).sort().at(-1)!;
  const merged = `Commits ${from} – ${to}`;
  const out: string[] = [];
  for (const t of titles) {
    if (!COMMITS.test(t)) out.push(t);
    else if (!out.includes(merged)) out.push(merged);
  }
  return out;
}

/** Keeps the average seconds a source takes: the average of the recent ones (each new one counts a fifth). */
export function recordSeconds(db: DB, seconds: number): void {
  let avg = 0;
  try {
    avg = (JSON.parse(kvGet(db, AVG_KEY) || 'null') as { avg?: number } | null)?.avg ?? 0;
  } catch {
    avg = 0;
  }
  // From the default, not from the first source alone (a project's files read in seconds; a batch of commits takes a minute).
  const from = avg > 0 ? avg : DEFAULT_SECONDS;
  kvSet(db, AVG_KEY, JSON.stringify({ avg: Math.round((from * 0.8 + seconds * 0.2) * 10) / 10 }));
}

/** What a build or a rebuild is given: the helper (Haiku on Automatic) and the stronger one for the areas (Sonnet), and how it goes. */
export interface JobOptions {
  /** Default: the helper of Settings → Models (areasHelper). */
  ask: DigestAsk;
  /** Default: the same with `strong`. */
  strong: DigestAsk;
  /** Default: the broadcaster the wiki-digest feature set (jobs.ts wikiJobChanged). */
  onUpdate?: (space: string | null) => void;
  /** Sources started an hour at most (BUILD_PER_HOUR), and how long a failed source waits before it is tried again. */
  perHour?: number;
  retryMs?: number;
  /** How many sources are read at once (the helper's: helperParallel). */
  workers?: number;
  now?: () => number;
}

/** A job's options with what is left out filled in: the settings' helper, the stronger one for the areas, the web broadcaster. */
export function jobOptions<T extends Partial<JobOptions>>(db: DB, o: T = {} as T): T & JobOptions {
  const ask = o.ask ?? areasHelper(db);
  return { ...o, ask, strong: o.strong ?? ((q) => ask({ ...q, strong: true })), onUpdate: o.onUpdate ?? wikiJobChanged };
}

export interface ReadSourcesOptions {
  ask: DigestAsk;
  /** 'build' or 'rebuild': what the sources' updates are listed under. */
  base: 'build' | 'rebuild';
  archiveDir?: string;
  onUpdate?: (space: string | null) => void;
  /** How many sources are read at once (the helper's: helperParallel). */
  workers?: number;
  /** Sources started in an hour at most (BUILD_PER_HOUR), and how long a failed source waits before it is tried again. */
  perHour?: number;
  retryMs?: number;
  now?: () => number;
  /** Told after each source ends (its row in Recent updates) and with the articles written so far. */
  progress?: (written: Set<string>) => void;
}

/** The indexes of the sources a job has read: the list it keeps, else (a job of an older version) its first `done`. */
export const finishedOf = (job: JobState): Set<number> => new Set(job.finished ?? Array.from({ length: job.done }, (_, i) => i));

/**
 * Reads the job's sources that are not read yet. Returns 'stopped' when the job was stopped (the state is left as it is: the
 * caller saves it as stopped), 'failed' when the helper could not read most of a build's essentials (job.error says so), else 'done' (sources the helper could not read are in job.failed). Throws nothing but what the
 * caller's own steps do; a source that throws counts as failed.
 */
export async function readSources(db: DB, space: string | null, root: string, job: JobState, o: ReadSourcesOptions): Promise<'done' | 'stopped' | 'failed'> {
  const now = o.now ?? Date.now;
  const signal = jobSignal(space);
  const ask = withSignal(o.ask, signal);
  const sources = job.sources ?? [];
  const workers = o.workers ?? helperParallel(db);
  const perHour = o.perHour ?? BUILD_PER_HOUR;
  const finished = finishedOf(job);
  const written = new Set<string>();
  const live = new Map<number, string>();
  reading.set(key(space), live);
  job.workers = workers;
  job.failed ??= [];
  job.starts ??= [];
  const ctx: ReadContext = { db, space, root, base: o.base, archiveDir: o.archiveDir, now, report: (articles) => articles.forEach((p) => written.add(p)) };
  const save = () => {
    job.finished = [...finished];
    job.done = finished.size;
    job.total = sources.length;
    saveJob(db, space, job);
    o.progress?.(written);
  };
  // The essentials of a build: when they have all been read the agent can start, and the event says so, once.
  const essentialsDone = () => {
    const n = job.essentials ?? 0;
    for (let i = 0; i < n; i++) if (!finished.has(i)) return false;
    return true;
  };
  let failedEarly = false;
  const checkEssentials = () => {
    if (job.essentials == null || job.essentialsAt != null || failedEarly || !essentialsDone()) return;
    // The helper could not read most of what matters first: no use going on to the rest.
    const first = new Set(sources.slice(0, job.essentials));
    const failedFirst = (job.failed ?? []).filter((f) => first.has(f)).length;
    if (job.essentials > 0 && failedFirst * 2 > job.essentials) {
      failedEarly = true;
      job.error = `The helper could not read ${failedFirst} of the ${job.essentials} sources that matter most: check Settings → Models → Helper model, then try again`;
      stopJob(space);
      return;
    }
    job.essentialsAt = now();
    save();
    wikiJobEvents.emit('essentials', space);
  };
  const guard = async () => {
    for (;;) {
      job.starts = (job.starts ?? []).filter((t) => t > now() - 3600_000);
      if (job.starts.length < perHour || signal?.aborted) break;
      await sleep(Math.max(1000, job.starts[0] + 3600_000 - now() + 1000), signal);
    }
    job.starts.push(now());
  };
  try {
    checkEssentials();
    await runPool(
      sources,
      workers,
      async (id, i) => {
        await guard();
        if (signal?.aborted) return;
        let ok = true;
        try {
          const ready = prepareSource(ctx, id);
          if (ready) {
            live.set(i, ready.title);
            ok = false;
            for (let attempt = 0; attempt < 2 && !ok; attempt++) {
              if (attempt) await sleep(o.retryMs ?? 60_000, signal);
              if (signal?.aborted) break;
              const t0 = now();
              try {
                const r = await ready.run(ask);
                ok = r !== false;
                if (r === true) recordSeconds(db, (now() - t0) / 1000);
              } catch {
                ok = false;
              }
            }
          }
        } catch {
          ok = false;
        }
        live.delete(i);
        // Stopped while it was being read: not counted, it is read again when the job goes on.
        if (signal?.aborted && !ok) return;
        if (!ok) job.failed = [...(job.failed ?? []), id];
        finished.add(i);
        save();
        o.onUpdate?.(space);
        checkEssentials();
      },
      { signal, skip: (i) => finished.has(i) },
    );
  } finally {
    reading.delete(key(space));
  }
  job.current = [];
  save();
  return failedEarly ? 'failed' : signal?.aborted ? 'stopped' : 'done';
}

// ---- the steps after the sources ---------------------------------------------------------------------------------------------

/** Whether the job was stopped (its signal is aborted). */
export const stoppedNow = (space: string | null) => !!jobSignal(space)?.aborted;

/**
 * Organises the wiki's areas (the proposal by the stronger helper, the fit check by the plain one), as a rebuild does: waits for another
 * wiki's reorganisation to end (one at a time in the app). `minArticles`: leaves it when the wiki has fewer. A line of `job.did` says what it did.
 */
export async function organisePhase(db: DB, space: string | null, root: string, job: JobState, o: JobOptions, minArticles = 0): Promise<void> {
  const signal = jobSignal(space);
  for (let i = 0; i < 60 && reorganising() && !signal?.aborted; i++) await sleep(5_000, signal);
  if (signal?.aborted) return;
  if (minArticles && areaArticles(root).length < minArticles) return;
  const p = space ? spaceById(db, space) : null;
  const r = await reorganiseWiki(root, {
    db,
    space,
    propose: withSignal(o.strong, signal),
    check: withSignal(o.ask, signal),
    project: p ? { name: p.name, description: p.description } : null,
    now: (o.now ?? Date.now)(),
    onUpdate: o.onUpdate,
  });
  if (signal?.aborted) return;
  if (r.ran) job.did = [...(job.did ?? []), r.summary!];
  else job.did = [...(job.did ?? []), `Areas not organised: ${r.error}`];
}

/** Writes the hubs of the areas and does the queued merges (this is where the duplicates reading made at once are merged). */
export async function hubsPhase(db: DB, space: string | null, root: string, job: JobState, o: JobOptions): Promise<void> {
  const signal = jobSignal(space);
  const now = (o.now ?? Date.now)();
  const ask = withSignal(o.ask, signal);
  const hubs = await refreshHubs(db, ask, [root], { max: Infinity, now });
  if (signal?.aborted) return;
  const merged = (await runMerges(root, ask, { db, space, now, onUpdate: o.onUpdate, max: 12, daily: Infinity })).filter((m) => m.ok).length;
  if (signal?.aborted) return;
  job.did = [...(job.did ?? []), `Wrote ${hubs} hub${hubs === 1 ? '' : 's'}${merged ? `; did ${merged} queued merge${merged === 1 ? '' : 's'}` : ''}`];
}

/** Whether a job read all its commit sources and none failed (then the daily commit pass may go on from the HEAD the job read to). */
export function commitsAllRead(job: JobState): boolean {
  const cats = job.cats ?? '';
  if (!cats.includes('c')) return false;
  const finished = finishedOf(job);
  const failed = new Set(job.failed ?? []);
  for (let i = 0; i < cats.length; i++) if (cats[i] === 'c' && (!finished.has(i) || failed.has((job.sources ?? [])[i]))) return false;
  return true;
}
