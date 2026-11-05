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
}

export interface ResultsColumn {
  metric: string;
  label?: string;
  better: 'max' | 'min';
  digits?: number;
}

export interface ResultsTableSpec {
  /** The runs it is made from: their ids, or every finished run of a group. */
  runs?: string[];
  group?: string;
  /** A row per group, or per value of one setting ("param:lr"); runs with the same row are seeds, averaged. */
  rows?: 'group' | `param:${string}`;
  columns: ResultsColumn[];
  /** The row the others are tested against. */
  baseline?: string;
  test?: 'welch' | 'paired' | 'bootstrap' | 'none';
  alpha?: number;
  correction?: 'holm' | 'none';
  caption?: string;
}

export interface ResultsCell {
  mean: number | null;
  std?: number | null;
  n: number;
  best?: boolean;
  /** Better than the baseline at the level asked for (after the correction). */
  significant?: boolean;
  p?: number | null;
}

export interface ResultsTable {
  id: string;
  spec: ResultsTableSpec;
  rows: { key: string; label: string; runs: string[]; cells: ResultsCell[] }[];
  latex: string;
  markdown: string;
  csv: string;
  madeAt: number;
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
}
