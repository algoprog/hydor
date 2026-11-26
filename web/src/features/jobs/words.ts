// The words of the Jobs page (JobsPage.tsx, Timeline.tsx, OutputPanel.tsx): what a job is, how it stands, how long it
// has run and has left, and what a waiting one waits for. Plain functions, so tests need no page (words-test.ts). The
// pages translate these as they are drawn, so each sentence is one template with its values in it.
import type { JobEntry, JobEstimate, JobKind, JobsList } from '@shared/jobs';
import { taskKindLabel } from '../../lib/work';

/** What a job is: "Command", "Claude Code subagent" (`program`: its session's), "Experiment run", "Job"… */
export function kindLabel(kind: JobKind, program?: string): string {
  if (kind === 'hydor-subagent') return 'Hydor subagent';
  if (kind === 'experiment') return 'Experiment run';
  if (kind === 'job') return 'Job';
  if (kind === 'server') return 'Server';
  return taskKindLabel(kind, program);
}

const two = (n: number) => String(n).padStart(2, '0');

/** Hours and minutes, or days and hours, of a whole number of minutes (an hour or more). */
function long(minutes: number): string {
  const h = Math.floor(minutes / 60);
  if (h < 48) return `${h} h ${two(minutes % 60)} min`;
  const d = Math.floor(h / 24);
  return `${d} days ${h % 24} h`;
}

/** A length of time to the minute: "less than a minute", "40 min", "2 h 03 min", "3 days 4 h". */
export function span(ms: number): string {
  if (ms < 60_000) return 'less than a minute';
  const m = Math.round(ms / 60_000);
  return m < 60 ? `${m} min` : long(m);
}

/** A clock that runs, with its seconds while it has run under an hour: "45 s", "12 min 05 s", "2 h 03 min". */
export function runClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min ${two(s % 60)} s` : long(m);
}

/** How long an ended job took: "under a second", "12 s", "40 min", "2 h 03 min". */
export function tookTime(ms: number): string {
  if (ms < 1000) return 'under a second';
  return ms < 60_000 ? `${Math.floor(ms / 1000)} s` : span(ms);
}

/** Where an estimate comes from, said on hover. */
export const SOURCE_WORDS: Record<JobEstimate['source'], string> = {
  progress: 'Worked out from how fast its progress moves',
  output: 'The time left that the job itself printed',
  agent: 'The estimate the agent gave when it started it',
  history: 'From how long the same job took before',
};

/** How far past its end an estimate read from the job's output may be before it counts as over: the time between two readings. */
const GRACE_MS = 60_000;

export interface TimeLeft {
  text: string;
  /** A guess (low confidence): said muted beside it. */
  guess: boolean;
  /** It should have ended by now. */
  over: boolean;
  source: string;
}

/** "about 1 h 12 min left", "less than a minute left" or "over its estimate"; null without an estimate. */
export function timeLeft(job: JobEntry, now: number): TimeLeft | null {
  const e = job.estimate;
  if (job.state !== 'running' || !e) return null;
  const left = e.endsAt - now;
  const read = e.source === 'progress' || e.source === 'output';
  const source = SOURCE_WORDS[e.source];
  if (left <= 0 && (!read || -left > GRACE_MS)) return { text: 'over its estimate', guess: false, over: true, source };
  return { text: leftWords(left), guess: e.confidence === 'low', over: false, source };
}

function leftWords(ms: number): string {
  if (ms < 60_000) return 'less than a minute left';
  const m = Math.round(ms / 60_000);
  // Hours with minutes are a sentence of their own: "about {0} left" would lose to another page's "about {0} min left",
  // which would leave the hours untranslated.
  return m >= 60 && m < 48 * 60 ? `about ${Math.floor(m / 60)} h ${two(m % 60)} min left` : `about ${span(ms)} left`;
}

/** A waiting job's "starts in about 40 min", when the jobs before it have estimates. */
export function startsIn(job: JobEntry, now: number): string | null {
  if (job.state !== 'queued' || !job.startsAt) return null;
  const ms = job.startsAt - now;
  return ms < 60_000 ? 'starts in under a minute' : `starts in about ${span(ms)}`;
}

/** A waiting job's place in its queue: "Next in queue gpu", "3rd in queue gpu". */
export function queuePlace(job: JobEntry): string | null {
  const { queue, position: n } = job;
  if (job.state !== 'queued' || !queue || !n) return null;
  if (n === 1) return `Next in queue ${queue}`;
  // Each ending is a sentence of its own, so each can be translated.
  const teen = n % 100 >= 11 && n % 100 <= 13;
  if (!teen && n % 10 === 1) return `${n}st in queue ${queue}`;
  if (!teen && n % 10 === 2) return `${n}nd in queue ${queue}`;
  if (!teen && n % 10 === 3) return `${n}rd in queue ${queue}`;
  return `${n}th in queue ${queue}`;
}

const pending = (j: JobEntry) => j.state === 'running' || j.state === 'queued';

/** The jobs a waiting job still waits for (those it names that run or wait). */
export function waitsFor(job: JobEntry, byId: ReadonlyMap<string, JobEntry>): JobEntry[] {
  return (job.after ?? []).flatMap((id) => {
    const d = byId.get(id);
    return d && pending(d) ? [d] : [];
  });
}

/** The waiting jobs that wait for this one ("Then: …"). */
export const waitedBy = (job: JobEntry, queued: readonly JobEntry[]): JobEntry[] => (pending(job) ? queued.filter((j) => j.after?.includes(job.id)) : []);

/**
 * What else a waiting job waits for, in words, beside the jobs it names (`named`: how many are listed) and its place in
 * a queue: a free GPU, or what the server says when it is neither of those.
 */
export function waitingWords(job: JobEntry, named: number): string | null {
  if (job.state !== 'queued') return null;
  const w = job.waitingFor?.trim();
  // The server's words that the page says in full, so each can be translated.
  if (w === 'a free GPU') return 'Waiting for a free GPU';
  if (w === 'a free slot') return 'Waiting for a free slot';
  if (named || queuePlace(job)) return null;
  if (!w || w === 'its start') return 'Waiting to start';
  // Words that are a sentence already (a run of Experiments says why it waits) stay as they are.
  return /^(Waiting|Waits|In )/.test(w) ? w : `Waits for ${w}`;
}

/** How an ended job ended: "Done", "Failed (exit code 2)", "Stopped", "Never started"; "Ended" when nobody saw how. */
export function endedWords(job: JobEntry): string {
  if (job.exitUnknown) return 'Ended';
  if (job.state === 'done') return 'Done';
  if (job.state === 'stopped') return 'Stopped';
  if (job.state === 'cancelled') return 'Never started';
  return job.exitCode != null ? `Failed (exit code ${job.exitCode})` : 'Failed';
}

/** Why it ended so, when that says more than endedWords does. */
export function endedReason(job: JobEntry): string | null {
  const r = job.reason?.trim();
  if (!r || pending(job) || (job.state === 'done' && !job.exitUnknown)) return null;
  const code = /^exit code (-?\d+)\.?$/i.exec(r)?.[1];
  if (r === endedWords(job) || (code !== undefined && Number(code) === job.exitCode)) return null;
  return r;
}

/** A job's state in a word or two, for its pill. */
export const stateWords = (job: JobEntry): string => (job.state === 'running' ? 'Running' : job.state === 'queued' ? 'Queued' : endedWords(job));

/** "3 running · 2 queued · all done in about 2 h 10 min"; null while nothing runs or waits. */
export function summaryLine(list: Pick<JobsList, 'running' | 'queued' | 'allDoneAt'>, now: number): string | null {
  const { running, queued, allDoneAt } = list;
  if (!running.length && !queued.length) return null;
  const parts: string[] = [];
  if (running.length) parts.push(`${running.length} running`);
  if (queued.length) parts.push(`${queued.length} queued`);
  const left = allDoneAt ? allDoneAt - now : 0;
  if (left > 0) parts.push(left < 60_000 ? 'all done in under a minute' : `all done in about ${span(left)}`);
  return parts.join(' · ');
}

/** How far a job has got as a whole percent, when it is known. */
export function percent(job: JobEntry): number | null {
  const f = job.progress?.fraction;
  if (f == null || !Number.isFinite(f)) return null;
  // Rounded down, so 100% is only what has got to the end; the nudge keeps 0.29 from reading 28%.
  return Math.max(0, Math.min(100, Math.floor(f * 100 + 1e-9)));
}

/** The job's own words for how far it is ("450/1000"), when they say more than the percent. */
export function progressText(job: JobEntry): string | null {
  const t = job.progress?.text?.trim();
  const p = percent(job);
  return t && !(p != null && /^\d+(\.\d+)?\s*%$/.test(t)) ? t : null;
}
