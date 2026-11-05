// Experiments: jobs that wait for a GPU (or a cluster's queue), run, and are kept as records: what ran (the command,
// the commit and its changes, the settings, the seed, the environment), how it went (its log, its metrics, what the
// agent on call did) and how they compare (results tables with significance). The server side is in
// server/experiments; docs/plans/research-and-engineering.md says how the other parts use it.

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
  /** Metrics: read from its log (key=value and JSON lines) and from a file it writes (metrics.jsonl, relative to cwd). */
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
   * "metric query value" lines), relative to cwd, with {name} placeholders as the command: kept with the run when
   * it ends, for paired tests over examples (queries, sentences) in results tables.
   */
  scoresFile?: string;
  /** When it ends, the session that started it hears how it went (its agent goes on from there). */
  report?: boolean;
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
  /** The commit it ran from, its branch, and whether there were changes not committed (kept as a patch). */
  commit?: string;
  branch?: string;
  dirty?: boolean;
  patchPath?: string;
  /** What it ran with: Python, PyTorch, CUDA, the driver… as found. */
  environment?: Record<string, string>;
  logPath?: string;
  metrics?: { last: Record<string, number>; best?: Record<string, number>; step?: number };
  events?: RunEvent[];
  /** The run's own folder (its log, the patch, its exit code, its metrics and scores). */
  folder?: string;
  /** Files in its folder that git does not track, when it started. */
  untracked?: number;
  /** Who started it. */
  startedBy?: { session?: string; app?: string; page?: boolean };
  /** The run this one is a new run of (Run again). */
  from?: string;
  /** Kept on another machine (where "m:<id>"): this is its copy as last read from there. */
  remote?: { machine: string; id: string };
  /** Listed from another machine (Settings → Machines): reading and stopping go through it. */
  machine?: { id: string; name: string };
  /** Its job in the cluster's queue (SLURM's job id), and its folder there. */
  clusterJob?: string;
  remoteDir?: string;
  /** Being stopped (why): it ends as stopped. */
  stopping?: string;
  /** When its log or metrics file last grew. */
  outputAt?: number;
  /** Per-example scores were kept with it (scoresFile). */
  scores?: boolean;
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
  /** A row per group, or per value of one setting ("param:lr"); runs with the same row are seeds, averaged. */
  rows?: 'group' | `param:${string}`;
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
  /** What the daggers mean, in words (as the LaTeX caption and the Markdown footnote say it). */
  footnote?: string;
  /** What to know about it: runs left out, a test that could not be made. */
  notes?: string[];
  /** Each column's test as made: "Welch's t-test over 3 seeds", "paired t-test over 200 examples"… */
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

/** A GPU as nvidia-smi gives it now; memory in MiB. `run`: the run of yours holding it. */
export interface GpuNow {
  index: number;
  name: string;
  memUsed: number;
  memTotal: number;
  util: number;
  run?: string;
}

/** The queue now, for the line above the list and the GPUs' meters. */
export interface QueueNow {
  running: number;
  waiting: number;
  gpus: GpuNow[];
  /** Why the GPUs could not be read (no NVIDIA GPU, nvidia-smi failed once). */
  gpuNote?: string;
  /** Jobs without a GPU: how many run now, and at most at once. */
  cpuRunning: number;
  cpuSlots: number;
}

/** A metric over steps, thinned to a few hundred points: [step, value]. */
export type MetricSeries = Record<string, [number, number][]>;

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

/** The page's own settings for the queue. */
export interface ExperimentsSettings {
  /** Jobs without a GPU running at once on this computer. */
  cpuSlots: number;
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

/** The marker line above a results table's tabular in a LaTeX document, so its numbers can be checked again. */
export const TABLE_MARK = (id: string) => `% hydor:table ${id}`;

/** The ids of the results tables a LaTeX file carries, in order. */
export function tableMarks(text: string): string[] {
  return [...text.matchAll(/^[ \t]*% hydor:table ([a-z0-9]{4,32})[ \t]*$/gm)].map((m) => m[1]);
}
