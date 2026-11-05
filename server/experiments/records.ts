// The records of experiments' runs and the results tables made from them, as the rest of the app reads them (the
// pre-submission check traces a paper's numbers to them; apps' steps list them). A placeholder until the
// Experiments workstream writes the real thing: keep these names and what they take and give.
import type { ResultsTable, RunRecord, RunStatus } from '../../shared/experiments.ts';
import type { DB } from '../db.ts';

export interface RunQuery {
  /** Runs started in this folder or under it. */
  cwd?: string;
  group?: string;
  tag?: string;
  status?: RunStatus[];
  project?: string;
  limit?: number;
}

/** Runs, newest first. */
export function listRuns(_db: DB, _q: RunQuery = {}): RunRecord[] {
  return [];
}

export function getRun(_db: DB, _id: string): RunRecord | null {
  return null;
}

/** A results table as it was made. */
export function getTable(_db: DB, _id: string): ResultsTable | null {
  return null;
}

/** The same table worked out again from its runs as they are now (null when it is gone). */
export function recomputeTable(_db: DB, _id: string): ResultsTable | null {
  return null;
}
