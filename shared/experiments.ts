// Experiments: jobs that wait for a GPU (or a cluster's queue), run, and are kept as records: what ran (the command,
// the commit and its changes, the settings, the seed, the environment), how it went (its log, its metrics, what the
// agent on call did) and how they compare (results tables with significance). The server side is in
// server/experiments; docs/plans/research-and-engineering.md says how the other parts use it.
import type { FindingVerdict } from './findings.ts';

/** queued: in line; waiting: its turn, but what it needs is not free yet (`why` says what); lost: its process went missing (the machine restarted). */
export type RunStatus = 'queued' | 'waiting' | 'starting' | 'running' | 'done' | 'failed' | 'stopped' | 'lost';

/** What the agent on call watches for. */
export type WatchKind = 'nan' | 'oom' | 'stall' | 'crash' | 'diverge';

export interface OnCallSpec {
  on: boolean;
  watch?: WatchKind[];
  /** No new line in its log for this long counts as a stall. */
  stallMinutes?: number;
  /** tell: a notification; agent: an agent looks into it and acts within the rules, then tells you. */
  act?: 'tell' | 'agent';
  /** What the agent may do, in your words ("resume from the last checkpoint with half the batch; never delete anything"). */
  rules?: string;
  agent?: string;
  model?: string;
}

export interface NotifySpec {
  done?: boolean;
  failed?: boolean;
  /** Tell when a metric crosses a value (New-model watch: a new model beats your best). */
  when?: { metric: string; op: '>' | '<' | '>=' | '<='; value: number };
}

export interface JobSpec {
  name?: string;
  /** The experiment it belongs to: its runs are compared together (a sweep's runs share one). */
  group?: string;
  command: string;
  cwd: string;
  /** Where it runs: "local" (this computer, the default), a Hydor machine ("m:<id>") or a cluster ("c:<id>"). */
  where?: string;
  /** GPUs it needs (0: none), and the free memory each must have, in GB. */
  gpus?: number;
  gpuMemGb?: number;
  /** Its GPUs to itself: no other run of yours goes on them while it runs, however much memory it asks for. */
  alone?: boolean;
  /** For a cluster's queue (SLURM): processors, memory in GB, hours, partition. */
  cpus?: number;
  memGb?: number;
  hours?: number;
  partition?: string;
  env?: Record<string, string>;
  params?: Record<string, string | number | boolean>;
  seed?: number;
  tags?: string[];
  /** Higher goes first. */
  priority?: number;
  /**
   * night: it starts only in the night hours of the computer it runs on, and only when no ordinary run waits there
   * (Where runs go sets the hours and what happens to it when the night ends). Not for a cluster.
   */
  when?: 'night';
  /** Metrics: read from its log (key=value and JSON lines) and from a file it writes (metrics.jsonl, relative to cwd; {name}, {run} and $HYDOR_RUN_DIR as for scoresFile). */
  metricsFile?: string;
  onCall?: OnCallSpec;
  notify?: NotifySpec;
  /** The sweep it is part of. */
  sweep?: string;
  /** The project (space id) it belongs to. */
  project?: string;
  /** Which way is better for a metric whose name does not say ("bleu": max); loss, error, perplexity and the like are lower-is-better by name, others higher. */
  better?: Record<string, 'max' | 'min'>;
  /**
   * Scores per example that the run writes (JSON lines, each with an "id" and a number per metric, or TREC's
   * "metric query value" lines), relative to cwd, with {name} placeholders as the command ({run}: the run's id; or a
   * path under $HYDOR_RUN_DIR, the run's own folder): kept with the run when it ends, for paired tests over examples
   * (queries, sentences) in results tables. A scores.jsonl a run writes into $HYDOR_RUN_DIR needs no naming.
   */
  scoresFile?: string;
  /** When it ends, the session that started it hears how it went (its agent goes on from there). */
  report?: boolean;
  /** The command with {seed} still in it, when it was written so: a results table with a row per command takes the seed out by it. */
  seedTemplate?: string;
  /**
   * The command that goes on from the run's last checkpoint, {name} placeholders filled as the command's: a night run
   * stopped at the night's end starts again with it, and so does a run lost in a restart (or preempted on a cluster).
   */
  resume?: string;
  /** Seconds it has after the warning (Ctrl-C) before it is stopped hard (GRACE); left out, the app's own stops give it GRACE.default. */
  grace?: number;
  /**
   * Which code runs when the folder has changed while the run waited: left out, the code as it was when it was queued
   * (from a copy); "now", the folder as it is when it starts.
   */
  code?: 'now';
}

/** The code kept when a run was queued (this computer's runs in a git repository; server/experiments/code.ts). */
export interface QueuedCode {
  at: number;
  commit: string;
  /** The sha256 of the patch of changes not committed. */
  patch?: string;
  /** The files kept that git does not track, by their paths in the repository, with the sha256 of each. */
  files: Record<string, string>;
  /** False when the patch was cut, or code or settings were too large to keep. */
  whole: boolean;
  /** How many tracked files had changes not committed, and the first of them. */
  changed?: number;
  changedFiles?: string[];
}

/** The seconds of warning before a stop: what a run gets unless it says, and the least and most it may ask for. */
export const GRACE = { default: 30, min: 5, max: 600 };

/** What a run's own folder holds besides the app's own files (its log, command, patch, exit code, process id, metrics, kept copies). */
export interface RunFiles {
  count: number;
  bytes: number;
  /** The largest three, by their paths in the folder, the largest first. */
  names: string[];
}

/** Files over this size are offered to be kept when their run is deleted. */
export const KEEP_OFFER_BYTES = 100 * 1024 * 1024;

/**
 * A notice Experiments sends a session when runs it started have ended, or when one still running looks wrong (nothing
 * printed for a while, NaN, a loss going up) (server/experiments/notices.ts): it starts with one of these lines, and
 * the conversation draws it as one quiet row. `wrong`: only runs still running are in it. Null for any other message.
 */
export function experimentNoticeOf(text: string): { body: string; wrong?: true } | null {
  const m = /^\[Experiments · (runs ended|a run needs a look)\][ \t]*\n/.exec(text);
  return m ? { body: text.slice(m[0].length), ...(/needs a look/.test(m[1]) ? { wrong: true as const } : {}) } : null;
}

/** Where a failed run first went wrong, as found in its log (server/experiments/failures.ts). */
export interface FirstError {
  /** The line it is on, counted from 1. */
  line: number;
  /** The line that says it: for a Python traceback, its last line (the exception). */
  text: string;
  /** A few lines around it, the first of them line `from` of the log, which starts at byte `offset`. */
  lines: string[];
  from: number;
  offset: number;
}

/** What a run on this computer used, at most, as sampled while it ran: GPU memory in GB for each of its GPUs (as gpuIds lists them), and resident memory in GB. */
export interface RunPeak {
  gpuMemGb: number[];
  ramGb: number;
}

// ---- GPU hours: what runs may cost -------------------------------------------------------------------------------

/** What a start may use, in GPU hours (GPUs times hours): `atMost` from its time limit, `about` from how long the last finished run of the same command took, or neither. */
export interface GpuHours {
  atMost?: number;
  about?: number;
}

/** What agents' runs used in the last seven days on this computer, the ceiling set for it, and how many runs it holds. */
export interface AgentsUse {
  ceiling?: number;
  used: number;
  held: number;
}

/**
 * A number of GPU hours as it is written: whole from 100, one decimal below, two figures when under 0.1. `floor`: for
 * what has been used or is left, which is never rounded up to a limit it has not reached.
 */
export function gpuNum(h: number, floor = false): string {
  const to = floor ? (x: number) => Math.floor(x + 1e-6) : Math.round;
  if (h >= 100) return String(to(h));
  if (h >= 0.1 || h <= 0) return String(to(Math.max(h, 0) * 10) / 10);
  return String(Number(h.toPrecision(1)));
}

/** "1 GPU hour", "24 GPU hours". */
export const gpuHoursWords = (h: number) => `${gpuNum(h)} GPU hour${gpuNum(h) === '1' ? '' : 's'}`;

/** "agents have used 100 of 100 GPU hours in the last seven days". */
export const agentsUsedWords = (used: number, ceiling: number) => `agents have used ${gpuNum(used, true)} of ${gpuNum(ceiling)} GPU hours in the last seven days`;

/** How the reason of a run held at the ceiling on agents' GPU hours begins. */
export const HELD_WHY = 'Waits for you: ';

// ---- trying a command first --------------------------------------------------------------------------------------

/** How long a trial runs at most, in seconds: what it is without asking, and the least and most one may ask for. */
export const TRY_SECONDS = { default: 90, min: 30, max: 600 };

/** A trial of a command: a short run before the real one (server/experiments/trial.ts), kept out of experiments' lists. */
export const isTrialRun = (r: Pick<JobSpec, 'tags' | 'env'>) => !!r.tags?.includes('try') && r.env?.HYDOR_TRY !== undefined;

/** How long a trial was asked to run at most, in seconds. */
export const trySecondsOf = (r: Pick<JobSpec, 'env'>) => Math.min(Math.max(Math.round(Number(r.env?.HYDOR_TRY_SECONDS) || TRY_SECONDS.default), TRY_SECONDS.min), TRY_SECONDS.max);

/** Why a trial that ran its time ended: not a failure. */
export const tryUpWhy = (seconds: number) => `Tried for ${seconds} seconds, then stopped`;

/** What a trial answers, as it goes and once it has ended. */
export interface TrialAnswer {
  /** The trial's run. */
  id: string;
  status: RunStatus;
  /** It has ended. */
  over: boolean;
  /** Why it waits, or why it failed. */
  why?: string;
  /** It got going: it ran without failing (absent while it waits or runs). */
  ok?: boolean;
  /** The command ended by itself within the trial. */
  finished?: boolean;
  /** The most it was let run, and how long it has run, in seconds. */
  seconds: number;
  ran?: number;
  firstError?: FirstError;
  peak?: RunPeak;
  /** The most GPU memory on one GPU, and the most resident memory, in GB. */
  gpuMemGb?: number;
  ramGb?: number;
  /** One step, in seconds, and how far it got of how many, when its output says. */
  stepSeconds?: number;
  steps?: { done: number; total: number };
  /** How long the whole run should take, in hours, when its output says how far it has to go. */
  estimateHours?: number;
  /** What to ask for: free GPU memory per GPU (GB) and a time limit (hours). */
  ask?: { gpuMemGb?: number; hours?: number };
  /** In a sentence. */
  said: string;
}

export interface RunEvent {
  at: number;
  kind: 'queued' | 'waiting' | 'started' | WatchKind | 'agent' | 'stopped' | 'done' | 'failed' | 'note';
  text: string;
  /** The session of the agent that looked into it. */
  session?: string;
}

export interface RunRecord extends JobSpec {
  id: string;
  status: RunStatus;
  /** What it waits for, or why it stopped, in plain words. */
  why?: string;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  exitCode?: number | null;
  host?: string;
  gpuIds?: number[];
  /** The runs of yours that were already on its GPUs when it started (a GPU shared with them), by GPU. */
  shared?: { gpu: number; runs: string[] }[];
  /** A waiting run: about when it can start, from how long the runs that hold what it needs still have to go. */
  startsAbout?: number;
  /** A SLURM run in the cluster's queue: when `sbatch --test-only` guessed it would start, which is often far too late. */
  startsGuess?: number;
  /** A night run that waits for a GPU or a slot: since when (any other run has waited since it was made). */
  waitingSince?: number;
  /** You were told that it has waited long (once). */
  waitTold?: boolean;
  /** The commit it ran from, its branch, and whether there were changes not committed (kept as a patch). */
  commit?: string;
  branch?: string;
  dirty?: boolean;
  patchPath?: string;
  /** What it ran with: Python, PyTorch, CUDA, the driver… as found. */
  environment?: Record<string, string>;
  logPath?: string;
  metrics?: RunMetrics;
  events?: RunEvent[];
  /** The run's own folder (its log, the patch, its exit code, its metrics and scores). */
  folder?: string;
  /** Files in its folder that git does not track, when it started. */
  untracked?: number;
  /**
   * The files its command names that git does not track (or ignores), copied into the run's folder under untracked/:
   * those in its folder by their paths there, those outside it (listed as the command gave them) under untracked/outside/.
   */
  kept?: string[];
  /** Those that were too large to keep. */
  notKept?: string[];
  /** The code as it was when it was queued. */
  queuedCode?: QueuedCode;
  /** Its code is still being read: it does not start before that is done. */
  codePending?: boolean;
  /** Which code it ran: as queued, or the folder as it was when it started. */
  codeAt?: 'queued' | 'start';
  /** The files that differed from what was queued when it started (20 at most), by their paths in the repository. */
  codeChanged?: string[];
  /** It ran from a copy of the code as queued: the folder there that stands for its own. */
  codeDir?: string;
  /** That copy is gone: it was slimmed away when the run ended (Open its code makes one again). */
  codeRemoved?: boolean;
  /** The command as it ran in its copy, with the variables pointed there before it, when that is not as it was given. */
  ranAs?: string;
  /** The copy made to look at its code (Open its code), once it has ended or when it ran in its folder. */
  codeView?: string;
  /**
   * What stayed in its copy when it ended (something was there already, or it changed a file of the code): paths in the
   * copy (the run's folder, under code/; the rest of the copy is gone), 100 at most.
   */
  leftInCopy?: string[];
  /** The run whose own code it was queued with (Run again). */
  codeFrom?: string;
  /**
   * Who started it: a session or an app's step (an agent), the person on a page, or `agent`: an agent with neither
   * (through the app's API, for an evolution it started, `for` its session).
   */
  startedBy?: { session?: string; app?: string; page?: boolean; agent?: boolean; for?: string };
  /** Held back: agents have used the GPU hours allowed to them in seven days (`why` says so). */
  held?: boolean;
  /** You let it run beyond that limit (when). */
  letRun?: number;
  /** The evolution whose score it is a run of. */
  evolution?: string;
  /** When it stopped being held: its wait for a GPU is counted from here. */
  freedAt?: number;
  /** A night run's earlier starts, stopped at the night's end: [from, to] each. */
  earlierSpans?: [number, number][];
  /** The run this one is a new run of (Run again), or another attempt at (an agent's `replaces`). */
  from?: string;
  /** Your line about it, or an agent's: what a later reader must know. */
  note?: string;
  noteBy?: 'user' | 'agent';
  /** Starred: one of the runs that count. When. */
  starredAt?: number;
  /** Put aside: out of the table, the charts and the counts, and nothing deleted. When. */
  archivedAt?: number;
  /**
   * Worked out as the run is listed, never kept (shared/experiment-attempts.ts): the failed, lost or stopped run it is
   * another attempt at, the later attempt that took its place, and which attempt it is (2 or more).
   */
  retryOf?: string;
  replacedBy?: string;
  attempt?: number;
  /** A night run: the nights it was part of (ran in, or waited through), each by the date it began on ("2026-01-05"). */
  nights?: string[];
  /** A night run whose night ended while it ran, with "stop them" chosen: it is being put back to wait. */
  nightStop?: boolean;
  /** Kept on another machine (where "m:<id>"): this is its copy as last read from there. */
  remote?: { machine: string; id: string };
  /** Listed from another machine (Settings → Machines): reading and stopping go through it. */
  machine?: { id: string; name: string };
  /** Its job in the cluster's queue (SLURM's job id), and its folder there. */
  clusterJob?: string;
  remoteDir?: string;
  /** Being stopped (why): it ends as stopped. */
  stopping?: string;
  /** Being stopped with a warning: when its seconds are up and it is stopped hard. */
  hardStopAt?: number;
  /** Its next start runs `resume`, to carry on from a checkpoint; `ranResume`: its last start did. */
  carriesOn?: boolean;
  ranResume?: boolean;
  /** How many times the app has started this chain again by itself (lost, or preempted), and the run that did so for this one. */
  autoResumes?: number;
  restartedAs?: string;
  /** When its log or metrics file last grew. */
  outputAt?: number;
  /** Per-example scores were kept with it (scoresFile). */
  scores?: boolean;
  /**
   * The evaluations whose home its folder belongs to, as its files were when it started: whether the sealed ones
   * were as sealed, and the first 10 that were not (shared/evaluations.ts).
   */
  sealed?: { evaluation: string; name: string; ok: boolean; changed?: string[] }[];
  /** What it used at most (this computer's runs, sampled while they run). */
  peak?: RunPeak;
  /** Each of its GPUs' whole memory, in GB. */
  gpuTotalGb?: number[];
  /** What other programs held on each of its GPUs, in GB: when it started, and at the last look. */
  others?: { start?: number[]; end?: number[] };
  /** The most memory it could use here (the computer's, or its control group's), in GB; and whether memory ran very low while it ran. */
  memoryLimitGb?: number;
  memoryLow?: boolean;
  /** Where a failed (or lost) run first went wrong. */
  firstError?: FirstError;
  /** A trial's first and last progress readings, kept for its estimate. */
  tried?: { first?: RunProgress; last?: RunProgress };
  /** What was told of it already, outside the agent on call. */
  told?: string[];
}

export interface ResultsColumn {
  metric: string;
  label?: string;
  better: 'max' | 'min';
  digits?: number;
  /** Each run's last value (the default) or its best. */
  value?: 'last' | 'best';
  /** Multiplied before it is shown (100 for a fraction as a percentage). */
  scale?: number;
}

export interface ResultsTableSpec {
  /** The runs it is made from: their ids, or every finished run of a group. */
  runs?: string[];
  group?: string;
  /**
   * A row per group, per value of one setting ("param:lr"), or per command with its seed taken out ("command");
   * runs with the same row are seeds, averaged.
   */
  rows?: 'group' | 'command' | `param:${string}`;
  columns: ResultsColumn[];
  /** The row the others are tested against (its key; the first row when not given). */
  baseline?: string;
  /**
   * Left out: paired over examples when the runs kept per-example scores, else paired over seeds when the rows'
   * runs share seeds, else Welch's t-test over seeds. paired: over examples, else seeds. bootstrap: a paired
   * bootstrap over examples (needs per-example scores).
   */
  test?: 'welch' | 'paired' | 'bootstrap' | 'none';
  alpha?: number;
  correction?: 'holm' | 'none';
  caption?: string;
  /** Names for the rows in place of their keys ("Ours" for a group called "lora-r16"). */
  labels?: Record<string, string>;
}

export interface ResultsCell {
  mean: number | null;
  std?: number | null;
  n: number;
  best?: boolean;
  /** Better than the baseline at the level asked for (after the correction). */
  significant?: boolean;
  /** How it stands against the baseline by the test, in the direction the metric is better in; absent: not tested. */
  verdict?: 'better' | 'worse' | 'same';
  p?: number | null;
  /** After the correction. */
  pAdj?: number | null;
}

export interface ResultsTable {
  id: string;
  spec: ResultsTableSpec;
  rows: { key: string; label: string; runs: string[]; cells: ResultsCell[] }[];
  latex: string;
  markdown: string;
  csv: string;
  madeAt: number;
  /** What the marks († better, ‡ worse) mean, in words (as the LaTeX caption and the Markdown footnote say it). */
  footnote?: string;
  /** What to know about it: runs left out, a test that could not be made, comparisons the seeds say little of. */
  notes?: string[];
  /** The tests as made, in the columns' order (a column nothing was tested in has none): "Welch's t-test over 3 seeds", "paired t-test over 200 examples"… */
  tests?: string[];
}

/** A cluster reached over SSH: plain (commands run there in tmux) or SLURM (sbatch, squeue, sacct). */
export interface ClusterSpec {
  id: string;
  name: string;
  /** An entry of ~/.ssh/config, or user@host. */
  host: string;
  kind: 'slurm' | 'ssh';
  /** Where runs keep their logs there. */
  workdir?: string;
  /** Lines run before each job (module load…, conda activate…). */
  setup?: string;
  partition?: string;
  account?: string;
  /** The last Check: whether it worked, and what it found (partitions, GPUs) or what went wrong. */
  checked?: { at: number; ok: boolean; text: string };
}

// ---- what the page and the tools read beside the records ---------------------------------------------------

/** A GPU as nvidia-smi gives it now; memory in MiB. `run`: the run of yours holding it; `runs`: all of them, when it is shared. */
export interface GpuNow {
  index: number;
  name: string;
  memUsed: number;
  memTotal: number;
  util: number;
  run?: string;
  runs?: string[];
}

/** The queue now, for the line above the list and the GPUs' meters. */
export interface QueueNow {
  running: number;
  waiting: number;
  gpus: GpuNow[];
  /** Why the GPUs could not be read (no NVIDIA GPU, nvidia-smi failed once). */
  gpuNote?: string;
  /** Agents' GPU hours in seven days against their ceiling, when one is set. */
  agents?: AgentsUse;
  /** Jobs without a GPU: how many run now, and at most at once. */
  cpuRunning: number;
  cpuSlots: number;
}

/** A metric over steps, thinned to a few hundred points: [step, value]. */
export type MetricSeries = Record<string, [number, number][]>;

/** How far a run has got, as its output last said: `done` of `total` (steps, iterations), read at `at` (ms). */
export interface RunProgress {
  done: number;
  total: number;
  at: number;
}

/**
 * A run's metrics as last read: each one's last value, its best, the step. `repeated`: the metrics read more than
 * once (a curve to chart), in the order they came; the others were printed once (settings at the start, results at
 * the end). Records made before it was kept have no `repeated`. `progress`: while a phase is under way.
 */
export interface RunMetrics {
  last: Record<string, number>;
  best?: Record<string, number>;
  step?: number;
  repeated?: string[];
  progress?: RunProgress;
}

/**
 * How far a running run is (a whole percent) and, when it has gone long enough to tell, how long was left (ms) when its
 * output last said how far it is. The page shows it and the queue works out from it when a waiting run may start.
 */
export function progressOf(r: Pick<RunRecord, 'status' | 'metrics' | 'startedAt'>): { pct: number; left?: number } | null {
  const p = r.metrics?.progress;
  if (r.status !== 'running' || !p || !(p.done > 0) || !(p.done < p.total)) return null;
  const elapsed = p.at - (r.startedAt ?? p.at);
  const left = elapsed >= 60_000 && p.done / p.total >= 0.01 ? (elapsed * (p.total - p.done)) / p.done : undefined;
  return { pct: Math.round((p.done / p.total) * 100), left };
}

/** A sweep: one command, settings' values expanded into runs of one group. */
export interface SweepSpec {
  id: string;
  group: string;
  command: string;
  params: Record<string, (string | number | boolean)[]>;
  mode: 'grid' | 'random';
  maxRuns?: number;
  /** Stops a run whose metric at a step is worse than the median of the other runs at that step. */
  earlyStop?: { metric: string; better: 'max' | 'min'; afterSteps?: number };
  createdAt: number;
}

/**
 * What an experiment (the group its runs share) is, in words: a title, a description of a few sentences and a
 * category, so people see at a glance what it tests and find it by searching. The helper model writes them when an
 * experiment has none, an agent may write them as it starts runs (experiment_describe), and you can change them.
 */
export interface ExperimentInfo {
  /** The group's name, as the runs carry it. */
  name: string;
  title?: string;
  description?: string;
  category?: string;
  /** Who wrote them last. */
  by?: 'helper' | 'agent' | 'user';
  at?: number;
}

/** A run as the page of another attempt names it. */
export interface RunRef {
  id: string;
  name?: string;
  status: RunStatus;
  why?: string;
  exitCode?: number | null;
  /** The line that says where it first went wrong. */
  error?: string;
}

/** A run's place among the attempts at the same thing. */
export interface RunChain {
  /** Which attempt it is, counted from 1. */
  attempt: number;
  previous?: RunRef;
  next?: RunRef;
}

/** The longest a run's note may be, in characters. */
export const NOTE_MAX = 500;

/** An experiment as the page lists it: what it is, and its runs counted (this computer's). */
export interface ExperimentGroup extends ExperimentInfo {
  runs: number;
  done: number;
  lastAt: number;
  /** Of its runs: those with a row of their own, the earlier attempts under them, and those put aside. */
  shown?: number;
  earlier?: number;
  archived?: number;
  /** The whole experiment was archived (and no run was added since). When. */
  archivedAt?: number;
  /** What the newest finding that names its runs says. */
  verdict?: FindingVerdict;
}

/** A finding that names one of an experiment's runs or results tables, as the experiment's page shows it. */
export interface ExperimentFinding {
  /** The memory note's number. */
  id: number;
  verdict: FindingVerdict;
  statement: string;
  learned?: string;
  at: number;
  /** The project it is of: its folder, and the project (space) whose Memory shows it, when there is one. */
  root: string;
  project?: string;
}

/** The page's own settings for the queue. */
export interface ExperimentsSettings {
  /** Jobs without a GPU running at once on this computer. */
  cpuSlots: number;
  /** The night, "HH:MM" on this computer's own clock; it may cross midnight. From equal to to: there is no night. */
  nightFrom: string;
  nightTo: string;
  /** When the night ends, night runs still going: let finish, or stopped to start again the next night (from their checkpoint when they say how, else from the beginning). */
  nightEnds: 'finish' | 'stop';
  /** Runs that say how much GPU memory they need share a GPU when it fits (on unless turned off). */
  shareGpus: boolean;
  /** The most GPU hours agents' runs may use on this computer in any seven days; null: no limit (the default). */
  agentGpuHours: number | null;
}

/** The words for a status, as the page and the tools say them. */
export const STATUS_WORDS: Record<RunStatus, string> = {
  queued: 'In line',
  waiting: 'Waiting',
  starting: 'Starting',
  running: 'Running',
  done: 'Done',
  failed: 'Failed',
  stopped: 'Stopped',
  lost: 'Went missing',
};

/** Statuses of runs that have not ended. */
export const ACTIVE: RunStatus[] = ['queued', 'waiting', 'starting', 'running'];

/** Lower is better for a metric with one of these in its name (unless the job says otherwise). */
const LOWER = /loss|error|perplexity|regret|latency|distance|rmse|(^|[^a-z])(err|ppl|wer|cer|mse|mae|nll|bpb|bpc|fid|ece)([^a-z]|$)/i;

/** Which way is better for a metric: what the job said, else by its name. */
export function betterOf(metric: string, told?: Record<string, 'max' | 'min'>): 'max' | 'min' {
  return told?.[metric] ?? (LOWER.test(metric) ? 'min' : 'max');
}

/** The note for comparisons not tested over seeds, since the seeds barely change the number; `where`: which ones. */
export const seedsFlatNote = (where: string) => `${where}: The seeds barely change this number, so a test over seeds says little: compare per example (give the runs a scores file)`;

/** The note for a row whose per-example scores are the baseline's, example for example. */
export const identicalNote = (row: string, metric: string, base: string) => `${row}, ${metric}: identical to ${base} on every example`;

/** The marker line above a results table's tabular in a LaTeX document, so its numbers can be checked again. */
export const TABLE_MARK = (id: string) => `% hydor:table ${id}`;

/** The ids of the results tables a LaTeX file carries, in order. */
export function tableMarks(text: string): string[] {
  return [...text.matchAll(/^[ \t]*% hydor:table ([a-z0-9]{4,32})[ \t]*$/gm)].map((m) => m[1]);
}
