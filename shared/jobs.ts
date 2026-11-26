// Jobs: long work that sessions run in the background, all in one place (the Jobs section, /jobs). A job is any of:
// - a background task of a session (a command, a monitor, a Claude Code subagent), seen in its live state;
// - a job an agent ran through the `job` shell command, which gives it a name, an estimate of how long it takes, the
//   jobs it waits for (dependencies) and a queue it waits its turn in (one at a time per queue name);
// - a run of Experiments, queued or running;
// - a Hydor subagent (a session another session started) while it works.
// The server (server/jobs) gathers them, reads how far each has got from its output (shared/job-progress.ts), estimates
// the time left, keeps what ended for a week, and tells the `job` command when a waiting job may start.
//
// Tags sort jobs by the broad kind of work they are (BROAD_TAGS: experiments, data-collection, builds…), never by
// project or topic. The agent that runs a job gives it one (`job run --tag`), reusing a tag in use; a person can change
// any job's on the page. A run of Experiments is always tagged experiments. Any other work with no tag (a session's
// background commands, subagents, a job run without --tag) is tagged by the helper model, each piece of work by its own
// name and command, from the same tags. The page groups and filters by the first tag.

/** command: a background shell command; monitor: a watch on a log or a process; subagent: a "<program> subagent"
 *  (Claude Code's, Codex's); hydor-subagent: a session another session started; experiment: a run of Experiments;
 *  job: one started with the `job` command; server: a command that serves (a dev server, an API, a notebook) and runs
 *  until it is stopped, so it has no end to wait for (JobsList.servers, kept out of the running count); task: any other
 *  background task. */
export type JobKind = 'command' | 'monitor' | 'subagent' | 'hydor-subagent' | 'experiment' | 'job' | 'server' | 'task';

/** queued: waits (for the jobs it depends on, its turn in its queue, a GPU); running; the rest ended. cancelled: it
 *  never started (a job it waited for failed or was stopped, or it was stopped while it waited). */
export type JobState = 'queued' | 'running' | 'done' | 'failed' | 'stopped' | 'cancelled';

export const JOB_ENDED: readonly JobState[] = ['done', 'failed', 'stopped', 'cancelled'];

/** The broad kinds of work that tags name, in the order they are offered, with what each covers. Agents and the helper
 *  model pick one of these (or another tag in use); a new tag only when none fits, and then as broad as these. */
export const BROAD_TAGS: readonly { name: string; covers: string }[] = [
  { name: 'experiments', covers: 'training, evaluation, sweeps, benchmarks' },
  { name: 'data-collection', covers: 'crawling, scraping, downloading, querying services, labelling or generating data' },
  { name: 'data-processing', covers: 'cleaning, converting, indexing, embedding data' },
  { name: 'development', covers: 'writing or changing code, docs or translations, reviewing it' },
  { name: 'builds', covers: 'building, compiling, packaging' },
  { name: 'tests', covers: 'test suites, type checks, linting' },
  { name: 'deployment', covers: 'shipping, releasing, running servers' },
  { name: 'analysis', covers: 'research, reports, plots, statistics' },
  { name: 'maintenance', covers: 'backups, clean-up, updates' },
];

/** How many tags a job may have, and how long each may be. */
export const MAX_TAGS = 3;
export const MAX_TAG_LENGTH = 32;

/** A tag as it is kept: lower case, its words joined by hyphens, letters and digits of any script ("Intent data" →
 *  "intent-data", "word_suggest" → "word-suggest"); '' when nothing is left of it. */
export function normalTag(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s_./:]+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_TAG_LENGTH)
    .replace(/-+$/, '');
}

/** Tags as given (a list, or one string; each may hold several split by commas), kept: no empty ones or twice the
 *  same, the first `MAX_TAGS`, in the order given. */
export function normalTags(given: unknown): string[] {
  const raw = Array.isArray(given) ? given : typeof given === 'string' ? [given] : [];
  const out: string[] = [];
  for (const piece of raw.flatMap((v) => (typeof v === 'string' ? v.split(',') : []))) {
    const t = normalTag(piece);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/** A tag in use: how many jobs it was given to, and when last (kept 180 days after its last use). A broad tag not used
 *  yet is listed after those in use with `uses: 0` and `lastAt: 0`. */
export interface JobTag {
  name: string;
  uses: number;
  lastAt: number;
  /** For a broad tag (BROAD_TAGS), whether in use or not: what it covers, in words ("training, evaluation, sweeps"). */
  covers?: string;
}

/** How far a job has got, as last read. */
export interface JobProgress {
  /** 0..1, when known. */
  fraction?: number;
  /** As the job put it, short: "450/1000", "epoch 3/10", "42%". */
  text?: string;
  /** When this was read (ms). */
  at: number;
}

/** How long a job has left, and where that comes from. */
export interface JobEstimate {
  /** When it should end (ms since the epoch). */
  endsAt: number;
  /** progress: from how fast its progress moves; output: a time left the job itself printed (tqdm, Keras);
   *  agent: the estimate the agent gave (`job run --eta`); history: how long the same job took before. */
  source: 'progress' | 'output' | 'agent' | 'history';
  /** high: steady progress or the job's own figure; medium: progress read only a few times; low: a guess. */
  confidence: 'high' | 'medium' | 'low';
}

/** Where a job's output is read from (GET /api/jobs/:id/log reads any of them). */
export type JobOutput = { kind: 'task'; sessionKey: string; taskId: string } | { kind: 'job' } | { kind: 'run'; runId: string };

export interface JobEntry {
  /** task:<session key>:<task id>, job:<id>, run:<run id>, child:<session key>. */
  id: string;
  kind: JobKind;
  state: JobState;
  /** What it is, in a few words: the name the agent gave, the task's description, the run's name, the subagent's title. */
  name: string;
  /** The command it runs, when there is one (shortened to 500 characters). */
  command?: string;
  /** The folder it runs in. */
  cwd?: string;
  /** The session that started it (the lead's, for a Hydor subagent), with its title and project when it has one. */
  session?: { key: string; title: string; project?: { id: string; name: string } };
  /** The project it belongs to: its session's, else the one whose folder it runs in (the innermost). */
  project?: { id: string; name: string };
  queuedAt?: number;
  startedAt?: number;
  endedAt?: number;
  exitCode?: number;
  /** Queued: what it waits for, in words ("Build the index", "its turn in queue gpu", "a free GPU"). */
  waitingFor?: string;
  /** The ids of the jobs it waits for, or waited for (`job run --after`). */
  after?: string[];
  /** Its queue (`job run --queue`), and its place in it while it waits (1: next). */
  queue?: string;
  position?: number;
  progress?: JobProgress;
  /** Running: when it should end. Queued: when it should start (`startsAt`) and end, when the jobs before it have estimates. */
  estimate?: JobEstimate;
  startsAt?: number;
  /** The last line of its output that says something (no blank or progress-bar lines), up to 300 characters. */
  lastLine?: string;
  /** It ended, but how is not known: an adopted process (`job adopt`) that is gone, whose exit code no one saw. */
  exitUnknown?: boolean;
  /** Why it ended as it did, when known ("Waited for Build index, which failed", "Exit code 1"). */
  reason?: string;
  output?: JobOutput;
  /** Its own page in the app, when it has one (a session, a run of Experiments). */
  href?: string;
  /** The page can stop it. */
  stoppable?: boolean;
  /** What it is part of ("intent-data"), the first the one it is grouped under; none when neither it nor its session has any. */
  tags?: string[];
  /** Who tagged it: agent (`job run --tag`, `job tag`), person (on the page), helper (the helper model), kind (a run of
   *  Experiments, always experiments). */
  tagsFrom?: 'agent' | 'person' | 'helper' | 'kind';
}

export interface JobsList {
  /** Oldest first. */
  running: JobEntry[];
  /** In the order they should start. */
  queued: JobEntry[];
  /** Servers sessions left running (kind `server`), oldest first: they run until stopped, so they are not in `running`. */
  servers: JobEntry[];
  /** Newest first, the last 7 days (up to `?ended=` of them, default 100). */
  ended: JobEntry[];
  /** When everything running and queued should be done, when each has an estimate. */
  allDoneAt?: number;
  /** The tags in use, the one used last first (up to 50), then the broad tags not used yet: what an agent picks from,
   *  and the page suggests. */
  tags?: JobTag[];
  at: number;
}

/** PUT /api/jobs/:id/tags (and /agent/jobs/:id/tags, the `job tag` command): that job's tags, whatever kind it is. An
 *  empty list clears what a person or agent set (the helper model may then tag it again). Returns `{ job: JobEntry }`. */
export interface JobTagsSet {
  tags: string[];
}

/** GET /api/jobs?project=<id>: only that project's jobs (a group's: those of the projects it brings together too). */
export interface JobsQuery {
  ended?: string;
  project?: string;
}

/** The counts the server sends the pages when they change: { t: 'jobs', running, queued } (the rail's badge). */
export interface JobCounts {
  running: number;
  queued: number;
}

export interface JobLog {
  text: string;
  size?: number;
  truncated?: boolean;
  updatedAt: number;
}

// ---- the `job` command and the server (routes under /agent/jobs, Bearer HYDOR_JOBS_TOKEN) -----------------------

/** POST /agent/jobs: a job to run. */
export interface JobRegister {
  name: string;
  command: string;
  cwd: string;
  /** The `job` process itself (to see whether it still lives). */
  pid: number;
  /** The agent's estimate of how long it runs (ms). */
  etaMs?: number;
  /** Jobs it waits for: ids (j-…), or names of jobs on this computer (the newest with that name). */
  after?: string[];
  /** One at a time per queue name. */
  queue?: string;
  /** A regular expression for its progress lines (capture groups: done and total, or a percent; or done, with `total`). */
  progress?: string;
  /** What the count of its progress lines goes up to, when they print only how many are done ("177600 written"): with a
   *  `progress` of one capture group, that group is done out of this (`--total`). */
  total?: number;
  /** The session the job belongs to, by its key: taken only from the app's own sign-in (a person, or an agent through
   *  the app's API, adopting another session's work); a session's own run is always its own. */
  session?: string;
  /**
   * `job adopt`: a process already running (started before, not by `job`) to show as this job instead of a command to
   * run: it counts as running from when that process started, and ends when it is gone. `command` is then what that
   * process runs (as `ps` shows it) and `pid` the process itself.
   */
  adoptPid?: number;
  /** `job adopt --log FILE`: the file that process writes its output to, read for its progress and last line. */
  logFile?: string;
  /** The kind of work it is (`--tag`, repeatable; one is usual): kept with normalTags. */
  tags?: string[];
}

/** The answer: its id, the file to write its output to, and whether it may start now. */
export interface JobRegistered {
  id: string;
  log: string;
  start: boolean;
  /** Not starting: what it waits for, in words. */
  waitingFor?: string;
  /** The tags it was given, as kept. */
  tags?: string[];
  /** When it was given no tags, or one no job had before: the tags in use, the one used last first, then the broad tags
   *  not used yet (up to 12), so the command can say them and the agent reuse one (`job tag ID TAG` changes them). */
  tagsInUse?: string[];
}

/** GET /agent/jobs/:id/go (answers within 25 s): start it, it still waits, or it never will. */
export type JobGo = { start: true } | { wait: string } | { cancel: string };

/** POST /agent/jobs/:id: it started (with the pid of its command), or ended. */
export type JobReport = { state: 'running'; pid: number } | { state: 'done' | 'failed' | 'stopped'; exitCode?: number; signal?: string };

/** What a session's environment holds for the `job` command. */
export const JOBS_ENV = { url: 'HYDOR_JOBS_URL', token: 'HYDOR_JOBS_TOKEN' } as const;
