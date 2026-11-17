// What a wiki is doing at a person's (or an agent's) request: a rebuild from its sources, an update now, or a
// reorganisation of its areas. One at a time for each wiki. Its state is kept in the database (the server restarts
// often): GET …/wiki/rebuild answers from it, and a rebuild a restart cut short goes on where it stopped.
import { kvGet, kvSet, type DB } from '../../db.ts';

export type JobKind = 'rebuild' | 'update' | 'reorganise';
/** Where a job is: a rebuild reads its sources, organises the areas, then points the old paths at the new articles; an update does its parts in turn. */
export type JobPhase = 'archive' | 'sources' | 'organise' | 'hubs' | 'redirects' | 'documents' | 'conversations' | 'commits' | 'drift' | 'merges' | 'areas';

export interface JobState {
  kind: JobKind;
  state: 'running' | 'done' | 'failed';
  phase?: JobPhase;
  /** Sources read (a rebuild), or parts done (an update). */
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
}

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

/** The wikis with a job running in this process. */
const active = new Set<string>();
const place = (space: string | null) => space ?? '';

/** Whether a job runs for the wiki now. */
export const jobRunning = (space: string | null) => active.has(place(space));

/** Takes the wiki's one slot for a job: false when one runs already. */
export function claimJob(space: string | null): boolean {
  if (active.has(place(space))) return false;
  active.add(place(space));
  return true;
}

export const releaseJob = (space: string | null) => active.delete(place(space));

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
