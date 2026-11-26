// Evaluations: how a project keeps score. One command and one number, sealed, so every run and every agent is
// scored the same way: the scorer's files are sealed by hash and a score is refused while they differ, a score is
// always worked out by the app from its own run of the sealed command, and the baseline and the final test are the
// person's alone. The server side is in server/experiments/evaluations.ts.
export interface EvalSpec {
  /** Up to 80 characters. */
  name: string;
  /** Its home: the folder (usually a git repository) the command runs in. */
  cwd: string;
  /** Prints the number; "{seed}" is replaced by each seed. */
  command: string;
  /** The number that counts, by the name the command prints it under. */
  metric: string;
  better: 'higher' | 'lower';
  /** Used when the command has {seed}: 1 to 10 of them, [1, 2, 3] unless given. */
  seeds: number[];
  /** What must stay as sealed: files and folders (ending in "/") relative to cwd, "*" and "**" allowed. */
  protect: string[];
  /** The final test; heldOut: an absolute folder outside cwd, handed to the command as $HYDOR_HELD_OUT. */
  final?: { command: string; heldOut?: string };
  // What its runs ask for, as JobSpec has them.
  gpus?: number;
  gpuMemGb?: number;
  hours?: number;
  where?: string;
  env?: Record<string, string>;
}

/** A sealed file that differs; a path in the held-out folder starts with HELD_OUT. */
export interface SealChange {
  path: string;
  what: 'changed' | 'missing' | 'added';
}

export interface SealState {
  ok: boolean;
  checkedAt: number;
  /** At most 50 listed. */
  changed: SealChange[];
  /** How many more differ than are listed. */
  more?: number;
}

export interface Evaluation extends EvalSpec {
  id: string;
  createdAt: number;
  updatedAt: number;
  /** `n` counts the seals: scores of an older seal are never compared with newer ones. */
  seal: { n: number; at: number; files: number; bytes: number };
  /** Of its home folder, as last checked. */
  state: SealState;
  /** A score's id. */
  baseline?: string;
  /** How often the final test has run under this seal. */
  finals: number;
}

/** An evaluation as the list gives it. */
export interface EvaluationListed extends Evaluation {
  /** Its latest finished score under the current seal. */
  last?: EvalScore;
  baselineScore?: EvalScore;
}

export type ScoreKind = 'score' | 'baseline' | 'final';
export type ScoreStatus = 'waiting' | 'running' | 'done' | 'failed' | 'stopped';

export interface EvalScore {
  id: string;
  evaluation: string;
  seal: number;
  kind: ScoreKind;
  status: ScoreStatus;
  /** Why it failed, in plain words. */
  why?: string;
  /** The run to look at when it failed or was stopped. */
  failedRun?: string;
  /** When the number was not printed: the names of the numbers it did print. */
  printed?: string[];
  folder: string;
  commit?: string;
  branch?: string;
  dirty?: boolean;
  /** Files and folders read from the home folder, because the folder scored does not have them. */
  lent?: string[];
  runs: string[];
  seeds: number[];
  values: number[];
  mean?: number;
  std?: number;
  against?: { baseline: string; delta: number; p: number | null; verdict: Verdict };
  /** "evolve": a candidate of an evolution (or its start, candidate "start"), left out of the evaluation's own lists. */
  by: { who: 'you' | 'agent' | 'goal' | 'app' | 'evolve'; session?: string; evolution?: string; candidate?: string };
  createdAt: number;
  endedAt?: number;
}

export type Verdict = 'better' | 'worse' | 'same';

/** A folder an evaluation can score: its home, or a git worktree of the same repository. */
export interface EvalFolder {
  path: string;
  branch?: string;
  home: boolean;
}

/** One sealed file that differs, with what changed in it when a copy was kept and it is text. */
export interface EvalChange extends SealChange {
  diff?: string;
  /** The diff was longer than is shown. */
  cut?: boolean;
}

/** What putting the sealed files back did. */
export interface EvalRestored {
  folder: string;
  restored: string[];
  /** What could not be put back, and why. */
  left: { path: string; why: string }[];
  state: SealState;
}

/** The start of a sealed path that is in the held-out folder. */
export const HELD_OUT = 'held-out:';
