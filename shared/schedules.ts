// Schedules: one place for everything that runs by itself (scheduled tasks, agents' schedules, apps' schedules,
// watchers and webhooks, all scheduled tasks underneath), as a week or a month: the runs that happened with how
// each went, and the runs to come (GET /api/automations/week, server/automations/week.ts). Times come with their
// day and minute in the user's time zone, so a page draws them without any time-zone sums of its own.
import type { RunStatus, RunTrigger, TaskSchedule } from './automations.ts';

/** What a scheduled task is for: a task of its own, one of an agent's schedules, or an app's. */
export type ScheduleSource = 'task' | 'agent' | 'app';

/** One thing that runs by itself, as the Schedules list shows it. */
export interface ScheduleItem {
  /** Its scheduled task. */
  id: string;
  name: string;
  source: ScheduleSource;
  /** Its trigger: a time, every few minutes, once, a cron expression, a webhook, a watcher. */
  kind: TaskSchedule['kind'];
  /** When it runs, in words ("Weekdays at 09:00", "Every 15 min"). */
  when: string;
  enabled: boolean;
  /** Why it paused itself. */
  pausedReason?: string;
  /** Its next run, when it is on and has one. */
  nextAt?: number;
  /** Its latest run: how it went, when, and where to open it. */
  last?: { status: RunStatus; at: number; summary?: string; key?: string; appRun?: string };
  /** The latest outcomes, newest first (up to six), as the task list's dots. */
  recent?: { status: RunStatus; at: number }[];
  /** "ok", or why its last run could not start. */
  lastStatus?: string;
  /** The agent it runs as (an agent's schedule). */
  agent?: { id: string; name: string; icon?: string };
  /** The app it runs (an app's schedule), and whether it is that app's Update automatically. */
  app?: { id: string; name?: string; daily?: boolean };
  /** Where it is changed, a page of the app: the agent's page, the app's page, or Settings → Scheduled tasks. */
  edit: string;
  /**
   * Drawn as one band a day rather than a block a run: it repeats every few minutes (more than eight runs a day), or it
   * waits for something to happen (a watcher, a webhook).
   */
  band: boolean;
}

/** A run that happened (or goes on) in the range, of an item drawn as blocks. */
export interface WeekRun {
  id: string;
  /** Its item (scheduled task). */
  task: string;
  at: number;
  endedAt?: number;
  /** Which day of the range (0 is the first) and the minute of that day it started, in the user's time zone. */
  day: number;
  min: number;
  /** How long it took, in minutes (so far, while it runs). */
  mins: number;
  status: RunStatus;
  trigger: RunTrigger;
  summary?: string;
  costUsd?: number;
  /** The session it ran in. */
  key?: string;
  /** The app run it started. */
  appRun?: string;
}

/** A run to come, of an item drawn as blocks. */
export interface WeekNext {
  task: string;
  at: number;
  day: number;
  min: number;
}

/** An item drawn as a band, on one day: how many runs, how they went, what they cost, and how many more are planned. */
export interface WeekBand {
  task: string;
  day: number;
  runs: number;
  by: Partial<Record<RunStatus, number>>;
  costUsd: number;
  /** Runs still to come that day. */
  planned: number;
}

/** One day of the range, in the user's time zone. */
export interface WeekDay {
  /** YYYY-MM-DD */
  date: string;
  /** Its first and last instant (a day is 23 or 25 hours when the clocks change). */
  from: number;
  to: number;
  /** 0 Sunday … 6 Saturday */
  wd: number;
  /** Every run that day (the bands' too): how many, how they went, what they cost. */
  runs: number;
  by: Partial<Record<RunStatus, number>>;
  costUsd: number;
  /** Runs still to come that day. */
  planned: number;
}

export interface ScheduleWeek {
  /** The user's time zone, which every day and minute here is in. */
  tz: string;
  now: number;
  /** Today, YYYY-MM-DD, in that zone. */
  today: string;
  /** The first day of the range (YYYY-MM-DD). */
  start: string;
  days: WeekDay[];
  items: ScheduleItem[];
  runs: WeekRun[];
  next: WeekNext[];
  bands: WeekBand[];
  /** Some runs to come were left out (too many to show). */
  capped?: boolean;
}

/** The most days a range may have (a month's six weeks). */
export const MAX_RANGE_DAYS = 42;

/** The calendar day `n` days after a YYYY-MM-DD one. */
export function addDate(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** The Monday on or before a YYYY-MM-DD day. */
export function mondayOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDate(date, -((wd + 6) % 7));
}
