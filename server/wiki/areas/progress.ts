// What GET …/wiki/rebuild tells about a job in progress: its steps (what is read, what is done), what is being read now, and
// about how many minutes are left. The minutes are worked out from a measured time for a source (the average of recent ones, 30
// seconds until there is one: sources.ts averageSeconds) divided by the number of workers, plus the steps that follow the sources.
import type { DB } from '../../db.ts';
import { jobRunning, type JobState } from './jobs.ts';
import { finishedOf, readingNow } from './run.ts';
import { averageSeconds, type Cat } from './sources.ts';

export type StepId = 'files' | 'notes' | 'sessions' | 'commits' | 'documents' | 'sources' | 'organise' | 'hubs';

export interface Step {
  id: StepId;
  /** In plain words (the app says it in the person's language from the id and the numbers). */
  label: string;
  done: number;
  total: number;
  /** What the agent needs first: a build reads these before the rest, which goes on in the background. */
  essential: boolean;
  /** What the step covers when that is not its number of sources (the commits a batch holds). */
  count?: number;
}

export interface JobProgress {
  steps: Step[];
  /** What is being read now. */
  current: string[];
  minutesLeft: number;
  minutesLeftEssentials?: number;
  essentials?: number;
  essentialsAt?: number;
}

const STEP: Record<Cat, StepId> = { f: 'files', n: 'notes', s: 'sessions', c: 'commits', d: 'documents', k: 'sources' };
const LABEL: Record<StepId, string> = {
  files: 'Project files',
  notes: 'Memory notes',
  sessions: 'Sessions',
  commits: 'Commits',
  documents: 'Documents',
  sources: 'Earlier sources',
  organise: 'Organising the areas',
  hubs: 'Writing the hubs',
};
const AFTER: Record<string, number> = { sources: 0, organise: 1, hubs: 2, redirects: 3 };

/** The steps of a job that reads sources, in the order they are read. */
function sourceSteps(job: JobState): Step[] {
  const cats = job.cats ?? '';
  const finished = finishedOf(job);
  const essentials = job.essentials ?? 0;
  const out: Step[] = [];
  for (const essential of [true, false]) {
    const seen = new Map<StepId, Step>();
    for (let i = 0; i < cats.length; i++) {
      if (i < essentials !== essential) continue; // a source of the other kind
      const id = STEP[cats[i] as Cat] ?? 'sources';
      const step = seen.get(id) ?? { id, label: LABEL[id], done: 0, total: 0, essential };
      step.total++;
      if (finished.has(i)) step.done++;
      seen.set(id, step);
    }
    for (const step of seen.values()) {
      if (step.id === 'commits' && job.counts?.commits) step.count = commitsIn(job, essential);
      out.push(step);
    }
  }
  return out;
}

/** How many commits the essential commit sources hold, roughly (an even share of the batches). */
function commitsIn(job: JobState, essential: boolean): number {
  const cats = job.cats ?? '';
  const total = [...cats].filter((c) => c === 'c').length;
  if (!total || !job.counts?.commits) return 0;
  const inEssentials = [...cats.slice(0, job.essentials ?? 0)].filter((c) => c === 'c').length;
  return Math.round(((essential ? inEssentials : total - inEssentials) / total) * job.counts.commits);
}

/** The progress of a job (null for a reorganisation, which has none to show). `running`: it runs in this process now. */
export function jobProgress(db: DB, space: string | null, job: JobState, state: string): JobProgress | null {
  if (job.kind === 'reorganise') return null;
  const running = state === 'running';
  const avg = averageSeconds(db);
  const current = running && jobRunning(space) ? readingNow(space) : (job.current ?? []);
  if (job.kind === 'update') {
    const ids: Record<string, StepId> = { sources: 'sources', articles: 'hubs', areas: 'organise' };
    const labels: Record<string, string> = { sources: 'New documents, conversations and commits', articles: 'Stale articles, hubs and merges', areas: 'Organising the areas' };
    const steps = (job.parts ?? []).map((p, i) => ({ id: ids[p] ?? 'sources', label: labels[p] ?? p, done: i < job.done ? 1 : 0, total: 1, essential: false }));
    return { steps, current, minutesLeft: running ? Math.max(1, Math.ceil(((job.total - job.done) * 2 * Math.max(avg, 30)) / 60)) : 0 };
  }
  const total = job.sources?.length ?? job.total;
  const phase = AFTER[job.phase ?? (state === 'done' ? 'redirects' : 'sources')] ?? 0;
  const finished = finishedOf(job);
  const steps = sourceSteps(job.cats ? job : { ...job, cats: 'k'.repeat(total) });
  const over = state === 'done';
  steps.push({ id: 'organise', label: LABEL.organise, done: over || phase > 1 ? 1 : 0, total: 1, essential: false });
  steps.push({ id: 'hubs', label: LABEL.hubs, done: over || phase > 2 ? 1 : 0, total: 1, essential: false });
  const workers = Math.max(1, job.workers ?? 1);
  const left = Math.max(0, total - finished.size);
  const tail = (phase <= 1 ? 3 * avg : 0) + (phase <= 2 ? avg * Math.max(2, Math.min(12, Math.ceil(total / 8))) : 0);
  const seconds = (phase === 0 ? (left * avg) / workers : 0) + (over ? 0 : tail);
  const out: JobProgress = { steps, current, minutesLeft: running ? Math.max(1, Math.ceil(seconds / 60)) : 0 };
  if (job.essentials != null) {
    out.essentials = job.essentials;
    if (job.essentialsAt != null) out.essentialsAt = job.essentialsAt;
    else if (running) {
      let rest = 0;
      for (let i = 0; i < job.essentials; i++) if (!finished.has(i)) rest++;
      out.minutesLeftEssentials = Math.max(1, Math.ceil((rest * avg) / workers / 60));
    }
  }
  return out;
}
