// Stopping a wiki's running job and going on with a stopped one. Stop ends a build, a rebuild or an update between its sources and
// aborts the helper calls in flight (jobs.ts stopJob): what was written stays, the job's state becomes 'stopped' with where it
// stopped, its slot is released, and a stopped rebuild keeps its archive (Restore still works). Continue goes on with a stopped build
// or rebuild from where it stopped (the sources that were in flight are read again); after a failed one it is Try again: the
// sources the helper could not read are tried again too.
import { HttpError } from '../../auth.ts';
import type { DB } from '../../db.ts';
import { spaceById } from '../../spaces/index.ts';
import { wikiMemoryOn, wikiRoot } from '../roots.ts';
import { runBuild, type BuildOptions } from './build.ts';
import { claimJob, jobRunning, jobState, saveJob, stopJob, wikiJobChanged } from './jobs.ts';
import { jobOptions } from './run.ts';
import { runRebuild } from './rebuild.ts';

/** Stops the wiki's running build, rebuild or update. It answers at once; the job's state changes to 'stopped' as its calls end. */
export function stopWikiJob(db: DB, space: string | null): { stopping: true; kind: string } {
  if (space && !spaceById(db, space)) throw new HttpError(404, 'No such project');
  const job = jobState(db, space);
  if (!job || job.state !== 'running' || !jobRunning(space)) throw new HttpError(409, 'Nothing is running on this wiki');
  if (job.kind === 'reorganise') throw new HttpError(409, 'A reorganisation cannot be stopped: it takes a few minutes');
  if (!stopJob(space)) throw new HttpError(409, 'It is stopping already');
  wikiJobChanged(space);
  return { stopping: true, kind: job.kind };
}

/** Goes on with a stopped build or rebuild from where it stopped, in the background. 409 when there is none, or the wiki is busy. */
export function continueWikiJob(db: DB, space: string | null, options: BuildOptions = {}): { started: true; kind: string; done: number; total: number } {
  const o = jobOptions(db, options);
  if (space && !spaceById(db, space)) throw new HttpError(404, 'No such project');
  const job = jobState(db, space);
  // A job the database says runs that nothing in this process runs was cut short: it counts as failed.
  const state = job?.state === 'running' && !jobRunning(space) ? 'failed' : job?.state;
  if (!job || (state !== 'stopped' && state !== 'failed') || (job.kind !== 'build' && job.kind !== 'rebuild') || !job.phase)
    throw new HttpError(409, 'There is no stopped or failed build or rebuild to go on with');
  if (!wikiMemoryOn(db, space)) throw new HttpError(409, space ? 'Wiki memory is off for this project' : 'The shared wiki is off in Settings → Memory → Wiki memory');
  const root = wikiRoot(db, space);
  if (!root) throw new HttpError(409, 'The wiki folder is not available');
  if (!claimJob(space)) throw new HttpError(409, 'The wiki is busy with a build, a rebuild, an update or a reorganisation: try again when it is done');
  if (state === 'failed' && job.failed?.length) {
    // Try again: what the helper could not read is read again.
    const bad = new Set(job.failed);
    const sources = job.sources ?? [];
    job.finished = [...(job.finished ?? [])].filter((i) => !bad.has(sources[i]));
    job.done = job.finished.length;
    job.failed = [];
  }
  job.state = 'running';
  delete job.error;
  delete job.endedAt;
  saveJob(db, space, job);
  o.onUpdate?.(space);
  if (job.kind === 'build' && space) void runBuild(db, space, root, job, o);
  else void runRebuild(db, space, root, job, o);
  return { started: true, kind: job.kind, done: job.done, total: job.total };
}
