// Build from history: a project that existed before its wiki memory has an empty or thin wiki. A build reads what the
// project has that the wiki has not (sources.ts): its files, its memory notes, its conversations, its commit messages and the
// Knowledge documents. The most useful come first, the essentials (Files, Notes and the sessions with the most signal), so an
// agent can start as soon as they are read; the rest follows in the background. Several sources are read at once (run.ts), then the
// areas are organised, the hubs written and the duplicates that reading in parallel made are merged. One at a time for each wiki; its state
// is in the database (jobs.ts), so a build a restart cut short goes on where it stopped, and a person can stop it and go on later.
import { HttpError } from '../../auth.ts';
import { kvGet, kvSet, type DB } from '../../db.ts';
import { helperCost, helperParallel } from '../../helper.ts';
import { memoryOn } from '../../memory/store.ts';
import { spaceById } from '../../spaces/index.ts';
import { markCommitsRead } from '../digest/commits.ts';
import { changeUpdate, recordUpdate } from '../digest/store.ts';
import { appendLines, writeIndex } from '../digest/write.ts';
import { wikiArticleCount } from '../has-articles.ts';
import { wikiMemoryOn, wikiRoot } from '../roots.ts';
import { areaArticles } from './articles.ts';
import { claimJob, finishJob, jobState, releaseJob, saveJob, type JobState } from './jobs.ts';
import { hasAreas, loadRegistry } from './registry.ts';
import { MIN_ARTICLES } from './reorganise.ts';
import { commitsAllRead, hubsPhase, jobOptions, organisePhase, readSources, stoppedNow, type JobOptions } from './run.ts';
import { averageSeconds, BUILD_ESSENTIAL_SESSIONS, BUILD_ESSENTIALS_MIN, gatherHistory, historyCounts, noteTexts } from './sources.ts';

export type BuildOptions = Partial<JobOptions> & {
  /** A session left out of what is read: the one that is asking (the session start's question). */
  exclude?: string;
};

const builtKey = (space: string) => `wiki.built.${space}`;
/**
 * Whether a build from history has run for the project (or a rebuild has finished: it read everything too). A build that started before
 * this was kept counts too (its job says so while it is the last one).
 */
export const historyBuilt = (db: DB, space: string): boolean => kvGet(db, builtKey(space)) === '1' || jobState(db, space)?.kind === 'build';
/** A build has started, or a rebuild has finished: the history has been read. */
export const markHistoryBuilt = (db: DB, space: string): void => kvSet(db, builtKey(space), '1');

/** A wiki is new while it has fewer than MIN_ARTICLES articles and no build from history has run for the project. */
export const wikiIsNew = (db: DB, space: string, root: string | null): boolean => !historyBuilt(db, space) && wikiArticleCount(root, MIN_ARTICLES) < MIN_ARTICLES;

export interface BuildOffer {
  /** The wiki has no article yet (not counting the index, the log, the hubs and the redirects). */
  empty: boolean;
  /**
   * The wiki is new: fewer than 10 articles and no build from history has run for the project. The passes that run by themselves put a
   * source or a few articles into a wiki soon after it is on, so "empty" is too strict for asking: a new wiki is one to build.
   */
  fresh: boolean;
  /** What the project has to read: sessions, commits and documents the wiki has not read, its memory notes, and the files found (README.md, AGENTS.md, docs/…). */
  counts: { sessions: number; commits: number; documents: number; notes: number; files: string[] };
  /** There is anything to read. */
  worth: boolean;
  /** How many sources the essentials and all hold. */
  essentials: number;
  sources: number;
  /** About how long the essentials take, and all of it, with the helper's workers at once. */
  minutesEssentials: number;
  minutesAll: number;
  helper: { label: string; priced: boolean; usd?: number };
}

const minutes = (seconds: number) => Math.max(1, Math.ceil(seconds / 60));

/**
 * What building the project's wiki from its history would read and take; null when memory, the project or its wiki memory is off.
 * Cheap enough for every session start: SQL counts, git's own count of commits (cached for a minute) and a look at the folder's top
 * level; no text is made. `exclude`: a session key not counted (the session that is asking).
 */
export async function buildOffer(db: DB, space: string, o: { exclude?: string; now?: number } = {}): Promise<BuildOffer | null> {
  if (!memoryOn(db)) return null;
  const project = spaceById(db, space);
  if (!project || !wikiMemoryOn(db, space)) return null;
  let root: string | null = null;
  try {
    root = wikiRoot(db, space);
  } catch {
    root = null;
  }
  const empty = wikiArticleCount(root, 1) === 0;
  const fresh = wikiIsNew(db, space, root);
  const c = await historyCounts(db, project, { exclude: o.exclude, quick: true, exactDocuments: false, now: o.now });
  const noteSources = c.notes ? noteTexts(db, project, o.now).length : 0;
  // The commit batches are counted as the build makes them.
  const commitSources = c.commitBatches;
  const files = c.anyFiles ? 1 : 0;
  const sources = files + noteSources + c.sessions + commitSources + c.documents;
  // The essentials: Files, Notes and the first sessions; with few sessions the newest commit batches too, up to BUILD_ESSENTIALS_MIN.
  let essentials = files + noteSources + Math.min(BUILD_ESSENTIAL_SESSIONS, c.sessions);
  if (c.sessions < BUILD_ESSENTIAL_SESSIONS) essentials += Math.min(commitSources, Math.max(0, BUILD_ESSENTIALS_MIN - essentials));
  if (!essentials) essentials = Math.min(5, sources);
  const avg = averageSeconds(db);
  const workers = helperParallel(db);
  // The areas and the hubs follow the sources: about three minutes when the wiki will have 10 articles or more (about one an article is made for each source).
  const tail = wikiArticleCount(root, MIN_ARTICLES) + sources >= MIN_ARTICLES ? 180 : 0;
  const cost = helperCost(db, {
    tokensIn: Math.round((sources * 14_000 + sources * 12_000 + 3_000 + (sources / 5) * 5_000) / 4),
    tokensOut: Math.round((sources * 5_000 + (sources / 5) * 1_200) / 4),
  });
  return {
    empty,
    fresh,
    counts: { sessions: c.sessions, commits: c.commits, documents: c.documents, notes: c.notes, files: c.files },
    worth: sources > 0,
    essentials,
    sources,
    minutesEssentials: sources ? minutes((essentials * avg) / workers) : 0,
    minutesAll: sources ? minutes((sources * avg) / workers + tail) : 0,
    helper: { label: cost.label, priced: cost.priced, ...(cost.usd != null ? { usd: cost.usd } : {}) },
  };
}

/**
 * Starts a build from the project's history, in the background. 409 unless the wiki is new (fewer than 10 articles, no build run before: an
 * update or a rebuild is for one that has more), reading only what the wiki has not read; and while the wiki does something else at a person's request. The texts of the files, notes and commits are kept as
 * sources first, so the job's list holds paths and session keys and survives a restart.
 */
export async function startBuild(db: DB, space: string, options: BuildOptions = {}): Promise<{ started: true; sources: number; essentials: number }> {
  const o = jobOptions(db, options);
  const project = spaceById(db, space);
  if (!project) throw new HttpError(404, 'No such project');
  if (!memoryOn(db)) throw new HttpError(409, 'Memory is off in Settings → Memory');
  if (!wikiMemoryOn(db, space)) throw new HttpError(409, 'Wiki memory is off for this project');
  const root = wikiRoot(db, space, { create: true });
  if (!root) throw new HttpError(409, 'The wiki folder is not available');
  if (!claimJob(space)) throw new HttpError(409, 'The wiki is busy with a build, a rebuild, an update or a reorganisation: try again when it is done');
  try {
    if (!wikiIsNew(db, space, root)) throw new HttpError(409, 'It already has articles or was built from history: use Update now or Rebuild');
    const now = (o.now ?? Date.now)();
    const h = await gatherHistory(db, project, root, { exclude: o.exclude, order: 'build', now });
    if (!h.sources.length) throw new HttpError(409, 'The project has nothing to build a wiki from yet');
    const updateId = recordUpdate(
      db,
      { space, base: 'build', document: `Building from history: 0 of ${h.sources.length} sources`, path: `build:${new Date(now).toISOString()}`, articles: [], notes: 0 },
      now,
    );
    const job: JobState = {
      kind: 'build',
      state: 'running',
      phase: 'sources',
      done: 0,
      total: h.sources.length,
      startedAt: now,
      sources: h.sources.map((s) => s.id),
      cats: h.sources.map((s) => s.cat).join(''),
      essentials: h.essentials,
      finished: [],
      failed: [],
      did: [],
      updateId,
      starts: [],
      workers: o.workers ?? helperParallel(db),
      head: h.head ?? undefined,
      counts: { commits: h.counts.commits, sessions: h.byCat.s.length, documents: h.byCat.d.length, notes: h.counts.notes },
    };
    saveJob(db, space, job);
    markHistoryBuilt(db, space);
    o.onUpdate?.(space);
    void runBuild(db, space, root, job, o);
    return { started: true, sources: h.sources.length, essentials: h.essentials };
  } catch (e) {
    releaseJob(space);
    throw e;
  }
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const day = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Goes on with a build (from where it stopped: after a restart or a stop). Never throws; the job's slot is released at the end. */
export async function runBuild(db: DB, space: string, root: string, job: JobState, options: BuildOptions = {}): Promise<void> {
  const o = jobOptions(db, options);
  const now = o.now ?? Date.now;
  const save = () => saveJob(db, space, job);
  let written = new Set<string>();
  const row = (document: string, articles?: string[], error?: string | null) => {
    if (job.updateId) changeUpdate(db, job.updateId, { document, articles, error }, now());
    o.onUpdate?.(space);
  };
  const stopped = () => {
    Object.assign(job, { state: 'stopped', endedAt: now(), current: [] });
    save();
    row(`Building from history stopped at ${job.done} of ${job.total} sources`, [...written].slice(0, 50));
  };
  try {
    job.state = 'running';
    delete job.error;
    delete job.endedAt;
    if (job.phase === 'sources') {
      const r = await readSources(db, space, root, job, {
        ...o,
        base: 'build',
        progress: (w) => ((written = new Set([...written, ...w])), row(`Building from history: ${job.done} of ${job.total} sources`, [...written].slice(0, 50))),
      });
      if (r === 'failed') throw new Error(job.error ?? 'The helper could not read the sources that matter most');
      if (r === 'stopped') return stopped();
      const failed = job.failed?.length ?? 0;
      const total = job.sources?.length ?? 0;
      if (total && failed > total / 2) throw new Error(`The helper could not read ${failed} of ${total} sources: check Settings → Models → Helper model, then try again`);
      // The commits are read to the repository's HEAD: the daily pass goes on from there.
      if (job.head && commitsAllRead(job)) markCommitsRead(db, space, job.head, now());
      job.phase = 'organise';
      save();
    }
    if (job.phase === 'organise') {
      row(`Building from history: organising ${plural((await areaArticles(root)).length, 'article')}`, [...written].slice(0, 50));
      await organisePhase(db, space, root, job, o, MIN_ARTICLES);
      if (stoppedNow(space)) return stopped();
      job.phase = 'hubs';
      save();
    }
    if (job.phase === 'hubs') {
      row('Building from history: writing the hubs', [...written].slice(0, 50));
      await hubsPhase(db, space, root, job, o);
      if (stoppedNow(space)) return stopped();
    }
    await writeIndex(root).catch(() => {});
    const articles = await areaArticles(root);
    const reg = loadRegistry(root);
    const areas = hasAreas(reg) ? reg.areas.length - 1 : 0;
    const failed = job.failed?.length ?? 0;
    const total = job.sources?.length ?? 0;
    const summary = `Built from history: ${plural(total, 'source')}, ${plural(articles.length, 'article')}${areas ? ` in ${plural(areas, 'area')}` : ''}${failed ? `; ${plural(failed, 'source')} could not be read` : ''}`;
    await appendLines(root, [`- ${day(now())} · built from history: ${plural(total, 'source')}, ${plural(articles.length, 'article')}`]).catch(() => {});
    Object.assign(job, { state: 'done', endedAt: now(), phase: undefined, current: [], did: [summary, ...(job.did ?? [])] });
    save();
    row(summary, articles.map((a) => a.path).slice(0, 50), failed ? `Could not read: ${job.failed!.join(', ')}`.slice(0, 600) : null);
  } catch (e) {
    if (stoppedNow(space) && !job.error) return stopped();
    Object.assign(job, { state: 'failed', endedAt: now(), error: job.error ?? (e as Error).message.slice(0, 400), current: [] });
    save();
    row(`Building from history stopped after ${job.done} of ${job.total} sources`, [...written].slice(0, 50), job.error);
  } finally {
    finishJob(space, job.state);
    o.onUpdate?.(space);
  }
}
