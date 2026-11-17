// At the server's start: a build or a rebuild the last stop cut short goes on where it stopped (its sources are listed, and the
// rebuild's archive is made, so it reads the rest); an update or a reorganisation that was running is marked as failed. A job a person
// stopped stays stopped (it goes on when they say so).
import type { DB } from '../../db.ts';
import { wikiMemoryOn, wikiRoot } from '../roots.ts';
import { claimJob, saveJob, staleJobs } from './jobs.ts';
import { runBuild } from './build.ts';
import { runRebuild } from './rebuild.ts';
import { jobOptions } from './run.ts';

export function resumeWikiJobs(db: DB, o: { onUpdate?: (space: string | null) => void; busy?: (key: string) => boolean; workers?: number; retryMs?: number } = {}): number {
  let resumed = 0;
  for (const { space, job } of staleJobs(db)) {
    let root: string | null = null;
    try {
      root = wikiMemoryOn(db, space) ? wikiRoot(db, space) : null;
    } catch {
      root = null;
    }
    if ((job.kind !== 'rebuild' && job.kind !== 'build') || (job.kind === 'build' && !space) || !root || !claimJob(space)) {
      saveJob(db, space, { ...job, state: 'failed', endedAt: Date.now(), error: 'It stopped when the app restarted' });
      continue;
    }
    const opts = jobOptions(db, { ...(o.onUpdate ? { onUpdate: o.onUpdate } : {}), ...(o.workers ? { workers: o.workers } : {}), ...(o.retryMs != null ? { retryMs: o.retryMs } : {}) });
    if (job.kind === 'build' && space) void runBuild(db, space, root, job, opts);
    else void runRebuild(db, space, root, job, opts);
    resumed++;
  }
  return resumed;
}
