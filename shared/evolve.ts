// Evolve: Hydor tries many small changes to the files you name, scores each with an evaluation, and keeps the best.
// A population of candidate versions on a few islands, the helper model proposing each change, and the evaluation's
// sealed command choosing what survives: a candidate that touches a protected file is refused by the seal, and your
// checkout is never changed (each candidate is scored in a git worktree of the app's own). The server side is in
// server/experiments/evolve.ts.
export interface EvolveSpec {
  /** The evaluation that scores. */
  evaluation: string;
  /** The folder whose current commit is the start: the evaluation's home unless given (a git worktree of the same repository is fine). */
  from?: string;
  /** What it may change: files relative to `from`, 1 to 8, none protected by the evaluation, 200 KB in all at most. */
  files: string[];
  /** What to try for, in the person's words (up to 2000 characters). */
  aim?: string;
  /** How many candidates to try at most (10 to 2000; 100 unless given). */
  candidates: number;
  /** Stop after this many hours of running (paused time does not count). */
  hours?: number;
  /** How many candidates are worked on at once (1 to 4; 2 unless given). */
  atOnce?: number;
  /** Stop when this many in a row brought no new best (40 unless given; 0 never). */
  stallAfter?: number;
}

export type EvolveStatus = 'starting' | 'running' | 'paused' | 'done' | 'stopped' | 'failed';

export interface Evolution extends EvolveSpec {
  id: string;
  /** The evaluation's seal it started under: a new seal ends it, as its scores no longer compare. */
  seal: number;
  status: EvolveStatus;
  /** Why it ended, failed or was paused by the app, in plain words. */
  why?: string;
  /** Where it started: the commit of `from` (and its branch, when it was on one). */
  startCommit: string;
  branch?: string;
  /** The start's own score, measured first with all the evaluation's seeds. */
  start?: { mean: number; std?: number; values: number[]; score: string };
  /** The best candidate's id: the one with the best full mean that beats the start. */
  best?: string;
  /** Candidates that ended (scored or failed), those of them that failed, and the model calls made. */
  tried: number;
  failed: number;
  calls: number;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  /** Time spent running, in ms (what `hours` is counted against). */
  activeMs: number;
  /** What "Take the best" made last. */
  taken?: { branch: string; commit: string; at: number; candidate: string };
  by: { who: 'you' | 'agent'; session?: string };
}

export type CandidateStatus = 'proposing' | 'scoring' | 'checking' | 'scored' | 'failed';

export interface Candidate {
  id: string;
  evolution: string;
  /** 1, 2, 3… in the order they were proposed. */
  n: number;
  /** The candidate it was made from; none: the start. */
  parent?: string;
  island: number;
  status: CandidateStatus;
  /** Why it failed, in plain words. */
  why?: string;
  /** One line from the model: what it changed and why. */
  summary: string;
  model: 'quick' | 'strong';
  /** Its first, cheap score: the evaluation's first seed only. */
  quick?: { value: number; score: string };
  /** All the evaluation's seeds: only for one whose cheap score beat its island's best's. */
  full?: { mean: number; std?: number; values: number[]; score: string };
  /** Against the start, in the direction that is better (positive is better): by the full mean when it has one, else its cheap score against the start's on the same seed. */
  gain?: number;
  /** It became the best so far when it was scored. */
  bestWhenScored?: boolean;
  /** It became its island's best. */
  islandBest?: boolean;
  /** Against the start, line counts. */
  changed: { path: string; added: number; removed: number }[];
  createdAt: number;
  endedAt?: number;
}

/** A candidate as one is read on its own: what it changed against the start, and its scores' ids. */
export interface CandidateDetail extends Candidate {
  /** Unified, per file, against the start; at most 400 lines a file. */
  diff: { path: string; diff: string; cut?: boolean }[];
  scores: string[];
}
