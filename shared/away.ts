// "While you were away" on the start page: what happened since your last visit, in one place. What waits on you
// (approvals, questions, calls held in the Outbox), sessions that finished (Done or Failed, with a line of their last
// reply and the files they made), what ran by itself (scheduled tasks', your agents' and apps' runs, with how each went
// and its cost) and what runs next today. One route gives it ready to show (GET /api/away, server/away); the page shows
// the first rows of `rows`, which come most important first.
import type { InboxItem } from './inbox.ts';
import type { Agent } from './types.ts';

/** Which part a row is in: it waits on you, a session finished, or something ran by itself. */
export type AwayGroup = 'needs' | 'finished' | 'ran';

/** How it stands: waiting on you, done, failed, or a run that found nothing new to tell. */
export type AwayOutcome = 'waiting' | 'done' | 'failed' | 'quiet';

/** What ran by itself: a scheduled task, one of your agents (its schedule), or an app. */
export type AwayBy = 'task' | 'agent' | 'app';

export interface AwayRow {
  /** Stable while it shows: "session:<key>", "run:<id>", "app:<id>", or the inbox item's id. */
  id: string;
  group: AwayGroup;
  outcome: AwayOutcome;
  /** The session's title, the task's, agent's or app's name, or what is asked. */
  title: string;
  /** One line, plain text: the start of its last reply, the run's summary or error, or the question's detail. */
  line?: string;
  /** When it finished, or since when it waits. */
  at: number;
  /** Where it opens in the app: the session, the run, or where it waits to be answered. */
  path: string;
  agent?: Agent;
  /** For a session of another agent (Settings → More agents): its name. */
  acpName?: string;
  /** The session it waits in, for something that needs you. */
  session?: string;
  /** Files the session made (their paths, the first few), and how many it made or changed in all. */
  files?: string[];
  fileCount?: number;
  /** What the run cost, in US dollars. */
  costUsd?: number;
  /** For a run: what ran it, and its name (the task's, the agent's or the app's). */
  by?: AwayBy;
  byName?: string;
  /** For something that needs you: the inbox item itself, answered in place when its card allows (an approval, a held call). */
  item?: InboxItem;
}

/** A scheduled run due later today. */
export interface AwayNext {
  /** The task's id. */
  id: string;
  name: string;
  at: number;
  /** The task in Settings → Scheduled tasks, or the agent's page. */
  path: string;
  by: AwayBy;
}

export interface AwaySummary {
  /** When the server answered: Mark all as seen clears up to here. */
  now: number;
  /** Since when: the end of your last visit (or the time you last marked all as seen, if later). */
  since: number;
  /** Everything there is, most important first. */
  rows: AwayRow[];
  /** All of it counted, not only the rows that show: done (sessions and runs), waiting on you, failed, and runs with nothing new. */
  counts: AwayCounts;
  /** What runs next today, soonest first (a few). */
  next: AwayNext[];
}

export interface AwayCounts {
  needs: number;
  done: number;
  failed: number;
  quiet: number;
}

/** The rows the start page shows at most, when it opens. */
export const AWAY_SHOWN = 6;

const RANK: Record<string, number> = { needs: 0, failed: 1, 'finished:done': 2, 'ran:done': 3, quiet: 4 };
const rank = (r: AwayRow) => (r.group === 'needs' ? RANK.needs : r.outcome === 'failed' ? RANK.failed : r.outcome === 'quiet' ? RANK.quiet : RANK[`${r.group}:done`]);

/**
 * Most important first: what waits on you (the longest waiting first), then what failed, then sessions that finished,
 * then runs that went well, and last runs that found nothing new (each newest first).
 */
export function awayOrder(rows: AwayRow[]): AwayRow[] {
  return [...rows].sort((a, b) => rank(a) - rank(b) || (a.group === 'needs' ? a.at - b.at : b.at - a.at));
}

export function awayCounts(rows: AwayRow[]): AwayCounts {
  const c: AwayCounts = { needs: 0, done: 0, failed: 0, quiet: 0 };
  for (const r of rows) {
    if (r.group === 'needs') c.needs++;
    else if (r.outcome === 'failed') c.failed++;
    else if (r.outcome === 'quiet') c.quiet++;
    else c.done++;
  }
  return c;
}

/**
 * Whether there is anything to show. Runs that found nothing new, and what runs next, show along with the rest but are
 * no reason to show the block on their own.
 */
export const awayHasNews = (s: Pick<AwaySummary, 'counts'> | null | undefined): boolean => !!s && s.counts.needs + s.counts.done + s.counts.failed > 0;
