// How the Jobs page sorts its jobs by what they are part of: each tag's colour, which jobs the picked tag and the search
// leave, the chips over the list, the groups of the work in hand and the days of what finished. A job is grouped and
// filtered under its first tag (shared/jobs.ts). Plain functions, so tests need no page (tags-test.ts).
import type { JobEntry, JobsList } from '@shared/jobs';

/** A tag's colour, the same wherever it shows: one of the charts' eight, picked by its name. */
export function tagTone(name: string): string {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return `var(--viz-${1 + ((h >>> 0) % 8)})`;
}

export const firstTag = (job: JobEntry): string | null => job.tags?.[0] ?? null;

export interface JobFilter {
  /** Only the jobs under this tag. */
  tag?: string;
  /** Only the jobs with no tag. */
  untagged?: boolean;
  /** Words looked for in a job's name, command, session, project and tags. */
  query?: string;
}

export const filtering = (f: JobFilter): boolean => !!(f.tag || f.untagged || f.query?.trim());

export function matches(job: JobEntry, filter: JobFilter): boolean {
  if (filter.tag && firstTag(job) !== filter.tag) return false;
  if (!filter.tag && filter.untagged && firstTag(job) !== null) return false;
  const q = filter.query?.trim().toLocaleLowerCase();
  if (!q) return true;
  return [job.name, job.command, job.session?.title, job.session?.project?.name, ...(job.tags ?? [])].some((s) => s?.toLocaleLowerCase().includes(q));
}

/** Subagents never say how long they take: the end of everything is told without them (as server/jobs does). */
const timed = (j: JobEntry) => j.kind !== 'subagent' && j.kind !== 'hydor-subagent';

/** When all of these should be done: nothing while one of them has no estimate still to come. */
function doneBy(jobs: JobEntry[], now: number): number | undefined {
  const ends = jobs.filter(timed).map((j) => j.estimate?.endsAt);
  return ends.length && ends.every((t): t is number => t !== undefined && t > now) ? Math.max(...(ends as number[])) : undefined;
}

/** The list with only the jobs the filter leaves, and the end of everything worked out again from those. */
export function filterList(list: JobsList, filter: JobFilter): JobsList {
  const keep = (jobs: JobEntry[] | undefined) => (jobs ?? []).filter((j) => matches(j, filter));
  const running = keep(list.running);
  const queued = keep(list.queued);
  return { ...list, running, queued, servers: keep(list.servers), ended: keep(list.ended), allDoneAt: doneBy([...running, ...queued], list.at) };
}

export interface TagCount {
  name: string;
  /** Running and queued. */
  atWork: number;
  /** All of its jobs in the list, servers and finished ones too. */
  total: number;
  /** When the last of its finished jobs ended; 0 when none has. */
  lastAt: number;
}

/** The chips: tags with work running or queued first (the most first), then the others, the one that ended last first. */
export function tagChips(list: JobsList): { tags: TagCount[]; untagged: { atWork: number; total: number } } {
  const by = new Map<string, TagCount>();
  const untagged = { atWork: 0, total: 0 };
  const count = (jobs: JobEntry[], atWork: boolean, ended: boolean) => {
    for (const j of jobs) {
      const name = firstTag(j);
      let c: { atWork: number; total: number } = untagged;
      if (name !== null) {
        let t = by.get(name);
        if (!t) by.set(name, (t = { name, atWork: 0, total: 0, lastAt: 0 }));
        if (ended) t.lastAt = Math.max(t.lastAt, j.endedAt ?? 0);
        c = t;
      }
      c.total++;
      if (atWork) c.atWork++;
    }
  };
  count(list.running, true, false);
  count(list.queued, true, false);
  count(list.servers ?? [], false, false);
  count(list.ended, false, true);
  const tags = [...by.values()].sort((a, b) => b.atWork - a.atWork || b.lastAt - a.lastAt || a.name.localeCompare(b.name));
  return { tags, untagged };
}

export interface JobGroup {
  /** null: the jobs with no tag. */
  tag: string | null;
  /** Oldest first, as the list has them. */
  running: JobEntry[];
  /** In the order they should start, as the list has them. */
  queued: JobEntry[];
  /** When all of it should be done, when each of its jobs has an estimate. */
  doneAt?: number;
}

/** The session all of a group's work comes from, when it is one: its header names it, and its rows then do not. */
export function sharedSession(g: JobGroup): JobEntry['session'] {
  const jobs = [...g.running, ...g.queued];
  const first = jobs[0]?.session;
  return first && jobs.every((j) => j.session?.key === first.key) ? first : undefined;
}

/** The work in hand by tag: the most running first, then the most queued, then by name; the untagged last. */
export function groupAtWork(running: JobEntry[], queued: JobEntry[], now: number): JobGroup[] {
  const by = new Map<string | null, JobGroup>();
  const group = (j: JobEntry) => {
    const tag = firstTag(j);
    let g = by.get(tag);
    if (!g) by.set(tag, (g = { tag, running: [], queued: [] }));
    return g;
  };
  for (const j of running) group(j).running.push(j);
  for (const j of queued) group(j).queued.push(j);
  return [...by.values()]
    .map((g) => ({ ...g, doneAt: doneBy([...g.running, ...g.queued], now) }))
    .sort((a, b) => Number(a.tag === null) - Number(b.tag === null) || b.running.length - a.running.length || b.queued.length - a.queued.length || (a.tag ?? '').localeCompare(b.tag ?? ''));
}

/** Midnight at the start of the day a time is in, here. */
export function startOfDay(t: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export interface JobDay {
  /** The day's midnight. */
  day: number;
  label: 'today' | 'yesterday' | 'date';
  jobs: JobEntry[];
}

/** Finished jobs (newest first) by the day they ended. */
export function byDay(ended: JobEntry[], now: number): JobDay[] {
  const today = startOfDay(now);
  // By the calendar, not by 24 hours: a day the clocks change is longer or shorter.
  const yesterday = startOfDay(today - 1);
  const days: JobDay[] = [];
  for (const job of ended) {
    const day = startOfDay(job.endedAt ?? job.startedAt ?? job.queuedAt ?? now);
    const last = days.at(-1);
    if (last?.day === day) last.jobs.push(job);
    else days.push({ day, label: day >= today ? 'today' : day === yesterday ? 'yesterday' : 'date', jobs: [job] });
  }
  return days;
}
