// At the server's start: a rebuild the last stop cut short goes on where it stopped (its archive is made and its
// sources listed, so it reads the rest); an update or a reorganisation that was running is marked as stopped.
import type { DB } from '../../db.ts';
import { wikiMemoryOn, wikiRoot } from '../roots.ts';
import { claimJob, saveJob, staleJobs } from './jobs.ts';
import { runRebuild } from './rebuild.ts';
import { areasHelper } from './tend.ts';

export function resumeWikiJobs(db: DB, o: { onUpdate?: (space: string | null) => void; busy?: (key: string) => boolean } = {}): number {
  let resumed = 0;
  for (const { space, job } of staleJobs(db)) {
    let root: string | null = null;
    try {
      root = wikiMemoryOn(db, space) ? wikiRoot(db, space) : null;
    } catch {
      root = null;
    }
    if (job.kind !== 'rebuild' || !root || !claimJob(space)) {
      saveJob(db, space, { ...job, state: 'failed', endedAt: Date.now(), error: 'It stopped when the app restarted' });
      continue;
    }
    const ask = areasHelper(db);
    void runRebuild(db, space, root, job, { ask, strong: (q) => ask({ ...q, strong: true }), onUpdate: o.onUpdate });
    resumed++;
  }
  return resumed;
}
