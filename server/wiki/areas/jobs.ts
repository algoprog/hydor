// What a wiki is doing at a person's (or an agent's) request: a build from the project's history, a rebuild from its
// sources, an update now, or a reorganisation of its areas. One at a time for each wiki. Its state is kept in the
// database (the server restarts often): GET …/wiki/rebuild answers from it, and a build or rebuild a restart cut short
// goes on where it stopped. A running job can be stopped (stopJob: its helper calls in flight end, what was written
// stays) and a stopped build or rebuild goes on where it stopped.
import { EventEmitter } from 'node:events';
import { kvGet, kvSet, type DB } from '../../db.ts';

export type JobKind = 'build' | 'rebuild' | 'update' | 'reorganise';
/** Where a job is: a rebuild reads its sources, organises the areas, then points the old paths at the new articles; an update does its parts in turn. */
export type JobPhase = 'archive' | 'sources' | 'organise' | 'hubs' | 'redirects' | 'documents' | 'conversations' | 'commits' | 'drift' | 'merges' | 'areas';

export interface JobState {
  kind: JobKind;
  state: 'running' | 'done' | 'failed' | 'stopped';
  phase?: JobPhase;
  /** Sources read (a build or rebuild), or parts done (an update). */
  done: number;
  total: number;
  startedAt: number;
  endedAt?: number;
  error?: string;
  /** An update's parts. */
  parts?: string[];
  /** What it did, a line each ("Read 2 documents", "Organised 31 articles into 6 areas…"). */
  did?: string[];
  /** A rebuild's: the archive of the wiki it replaced (its name), the sources it reads in order, those the helper could not read, the row it keeps in Recent updates, when it started each source (the hourly cap). */
  archive?: string;
  sources?: string[];
  failed?: string[];
  updateId?: number;
  starts?: number[];
  /** A rebuild's: the earlier wiki's articles that no new one covered were added to its sources (how many). */
  carried?: number;
  /**
   * A build's or rebuild's sources, in the order they are read: the first `essentials` of a build are what the agent needs
   * first (Files, Notes, the sessions that matter most), `essentialsAt` is when they had all been read. `cats` has one
   * letter for each source (f files, n notes, s sessions, c commits, d documents, k other kept sources). `finished` lists
   * the indexes of those read (several are read at once, so not in order; absent in a job of an older version: the first
   * `done` were). `current` is what is being read now, `workers` how many at once, `head` the commit the history was read to.
   */
  essentials?: number;
  essentialsAt?: number;
  cats?: string;
  finished?: number[];
  current?: string[];
  workers?: number;
  head?: string;
  /** How many commits the commit sources hold, and sessions and documents the job picked (for the progress). */
  counts?: { commits?: number; sessions?: number; documents?: number; notes?: number };
}

let broadcast: ((space: string | null) => void) | null = null;
/** The function that tells the web a wiki's job changed (the wiki-digest feature sets it at its start): jobs use it when whoever started them gave none, so progress reaches the web whoever started the job. */
export const setWikiJobBroadcast = (f: ((space: string | null) => void) | null) => (broadcast = f);
export const wikiJobChanged = (space: string | null): void => {
  try {
    broadcast?.(space);
  } catch {
    /* a listener failing never stops a job */
  }
};

/** Told what happens to a job: 'essentials' (space) once a build has read its essentials, 'end' (space, state) when a job ends (done, failed or stopped). */
export const wikiJobEvents = new EventEmitter();

const key = (space: string | null) => `wiki.job.${space ?? 'shared'}`;

export function jobState(db: DB, space: string | null): JobState | null {
  try {
    const s = JSON.parse(kvGet(db, key(space)) || 'null') as JobState | null;
    return s && typeof s === 'object' && s.kind ? s : null;
  } catch {
    return null;
  }
}

export function saveJob(db: DB, space: string | null, s: JobState): void {
  kvSet(db, key(space), JSON.stringify(s));
}

/** The wikis with a job running in this process, each with the controller that stops it. */
const active = new Map<string, AbortController>();
const place = (space: string | null) => space ?? '';

/** Whether a job runs for the wiki now. */
export const jobRunning = (space: string | null) => active.has(place(space));

/** Takes the wiki's one slot for a job: false when one runs already. */
export function claimJob(space: string | null): boolean {
  if (active.has(place(space))) return false;
  active.set(place(space), new AbortController());
  return true;
}

export const releaseJob = (space: string | null) => active.delete(place(space));

/** Ends a job's hold on the wiki and tells the listeners how it ended. */
export function finishJob(space: string | null, state: JobState['state']): void {
  active.delete(place(space));
  wikiJobEvents.emit('end', space, state);
}

/** The signal that stops the running job of a wiki (undefined while none runs). */
export const jobSignal = (space: string | null): AbortSignal | undefined => active.get(place(space))?.signal;

/**
 * Stops the running job: the loop ends between sources and the helper calls in flight are aborted. What was written
 * stays; the job's runner saves its state as 'stopped'. False when none runs.
 */
export function stopJob(space: string | null): boolean {
  const c = active.get(place(space));
  if (!c || c.signal.aborted) return false;
  c.abort();
  return true;
}

/** Any job the database says is running that no process runs (the server stopped): what to do about each. */
export function staleJobs(db: DB): { space: string | null; job: JobState }[] {
  const rows = db.prepare("select k, v from kv where k like 'wiki.job.%'").all() as { k: string; v: string }[];
  const out: { space: string | null; job: JobState }[] = [];
  for (const r of rows) {
    const space = r.k === 'wiki.job.shared' ? null : r.k.slice('wiki.job.'.length);
    const job = jobState(db, space);
    if (job?.state === 'running' && !jobRunning(space)) out.push({ space, job });
  }
  return out;
}
