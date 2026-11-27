// What a person (or an agent) says about runs without changing what they recorded: a line about a run, a star on the
// ones that count, and putting runs, or a whole experiment, aside. Nothing here deletes anything.
import { ACTIVE, NOTE_MAX, type RunRecord } from '../../shared/experiments.ts';
import { HttpError } from '../auth.ts';
import type { Deps } from '../features/types.ts';
import { tellRuns } from './queue.ts';
import { getRun, listRuns, markRun, setGroupArchived, withAttempts } from './records.ts';

/** The most runs one call changes. */
export const BULK_MAX = 500;

/** A note as kept: one line, at most 500 characters ('' clears it). */
export function cleanNote(v: unknown): string {
  if (typeof v !== 'string') throw new HttpError(400, 'note is text');
  const note = v.replace(/\s+/g, ' ').trim();
  if (note.length > NOTE_MAX) throw new HttpError(400, `A note is at most ${NOTE_MAX} characters`);
  return note;
}

/** What a request changes of a run, checked. */
export function marksOf(b: Record<string, unknown>): { note?: string; starred?: boolean; archived?: boolean } {
  const out: { note?: string; starred?: boolean; archived?: boolean } = {};
  if (b.note !== undefined && b.note !== null) out.note = cleanNote(b.note);
  for (const k of ['starred', 'archived'] as const) {
    if (b[k] === undefined || b[k] === null) continue;
    if (typeof b[k] !== 'boolean') throw new HttpError(400, `${k} is true or false`);
    out[k] = b[k] as boolean;
  }
  return out;
}

const must = (d: Deps, id: string): RunRecord => {
  const r = getRun(d.db, id);
  if (!r) throw new HttpError(404, 'There is no such run');
  return r;
};

/** Changes one run's note, star or archiving; `by`: who writes the note. */
export function patchRun(d: Deps, id: string, b: Record<string, unknown>, by: 'user' | 'agent'): RunRecord {
  const r = must(d, id);
  const m = marksOf(b);
  // A run still going holds a GPU or a place: it is not put out of sight.
  if (m.archived && ACTIVE.includes(r.status)) throw new HttpError(409, 'It has not ended: stop it first');
  markRun(d.db, id, { ...m, by });
  tellRuns(d, [id]);
  return withAttempts(d.db, [getRun(d.db, id)!])[0];
}

/** Stars, archives (or brings back) several runs at once; those still going are not archived, and are counted. */
export function markRuns(d: Deps, ids: string[], b: Record<string, unknown>): { runs: RunRecord[]; skipped: number } {
  const { starred, archived } = marksOf(b);
  let skipped = 0;
  const done: string[] = [];
  for (const id of ids) {
    const r = getRun(d.db, id);
    if (!r) continue;
    const going = ACTIVE.includes(r.status);
    if (archived && going) skipped++;
    markRun(d.db, id, { starred, ...(archived && going ? {} : { archived }) });
    done.push(id);
  }
  tellRuns(d, done);
  return { runs: withAttempts(d.db, done.map((id) => getRun(d.db, id)!)), skipped };
}

/** Archives a whole experiment (it leaves the lists) or brings it back. Its runs keep what was said of each. */
export function archiveGroup(d: Deps, name: string, on: boolean) {
  const runs = listRuns(d.db, { group: name, limit: 5000, plain: true });
  if (!runs.length) throw new HttpError(404, 'There is no experiment with that name: no run has it');
  if (on && runs.some((r) => ACTIVE.includes(r.status))) throw new HttpError(409, 'Runs of it are still going or waiting: stop them first');
  setGroupArchived(d.db, name, on);
  d.broadcast({ t: 'feature', id: 'experiments', data: { groups: [name] } });
}
