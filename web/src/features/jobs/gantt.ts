// Where each job's bar goes on the Jobs page's timeline (Timeline.tsx), in time: what has run, what is estimated, where a
// waiting job should start, how far the axis goes and which bars are joined (a job and those that wait for it). Plain
// functions, so tests need no page (gantt-test.ts).
import type { JobEntry, JobsList } from '@shared/jobs';

export interface GanttRow {
  job: JobEntry;
  kind: 'running' | 'queued' | 'ended';
  /** Where the bar begins: when it started, or should start. */
  from: number;
  /** Running: how far it has run (now). Ended: when it ended. Drawn solid from `from`. */
  solidTo?: number;
  /** The estimated end, of a running or waiting job that has one. */
  estTo?: number;
  /** Where the bar ends: the estimate, or a stretch that fades out when there is none (`open`). */
  to: number;
  open: boolean;
  /** It should have ended by now. */
  over: boolean;
  /** A waiting job whose start nobody knows: it is placed after what it waits for. */
  unsure: boolean;
}

export interface Gantt {
  rows: GanttRow[];
  /** The ends of the axis. */
  from: number;
  to: number;
  now: number;
  /** A job (`a`, a row's place) and one that waits for it (`b`). */
  links: { a: number; b: number }[];
}

/** The shortest axis, so jobs a few seconds old are not stretched across the page. */
const MIN_SPAN = 60_000;
/** The part of the axis a bar with no estimate fades out over. */
const FADE = 0.16;

export function ganttOf(list: Pick<JobsList, 'running' | 'queued' | 'ended'>, now: number): Gantt {
  const live = [...list.running, ...list.queued];
  // The ended jobs that one of these waited for, so its connector has somewhere to come from.
  const needed = new Set(live.flatMap((j) => j.after ?? []));
  const before = list.ended.filter((j) => needed.has(j.id) && j.startedAt && j.endedAt).sort((x, y) => x.startedAt! - y.startedAt!);

  // The axis as far as anything is known of it, which sets how long a fading stretch is.
  const known = [now];
  for (const j of [...before, ...live]) for (const t of [j.startedAt, j.startsAt, j.estimate?.endsAt, j.endedAt]) if (t) known.push(t);
  const from = Math.min(...known);
  const length = Math.max(Math.max(...known) - from, MIN_SPAN);
  const fade = length * FADE;

  const rows: GanttRow[] = before.map((job) => ({ job, kind: 'ended', from: job.startedAt!, solidTo: job.endedAt, to: job.endedAt!, open: false, over: false, unsure: false }));
  for (const job of list.running) {
    const start = job.startedAt ?? job.queuedAt ?? now;
    const end = job.estimate?.endsAt;
    const estTo = end && end > now ? end : undefined;
    rows.push({ job, kind: 'running', from: start, solidTo: now, estTo, to: estTo ?? (end ? now : now + fade), open: !end, over: !!end && !estTo, unsure: false });
  }
  const place = new Map(rows.map((r) => [r.job.id, r]));
  const lastInQueue = new Map<string, GanttRow>();
  for (const r of rows) if (r.kind === 'running' && r.job.queue) lastInQueue.set(r.job.queue, r);
  // The waiting ones come in the order they should start, so what each waits for is placed already.
  for (const job of list.queued) {
    const ahead = [...(job.after ?? []).map((id) => place.get(id)), job.queue ? lastInQueue.get(job.queue) : undefined];
    // Never before now: a start that is due shows at the line.
    const start = Math.max(now, job.startsAt ?? Math.max(now, ...ahead.map((r) => r?.to ?? now)));
    const end = job.estimate?.endsAt;
    const estTo = end && end > start ? end : undefined;
    const row: GanttRow = { job, kind: 'queued', from: start, estTo, to: estTo ?? start + fade, open: !estTo, over: false, unsure: !job.startsAt };
    rows.push(row);
    place.set(job.id, row);
    if (job.queue) lastInQueue.set(job.queue, row);
  }

  const at = new Map(rows.map((r, i) => [r.job.id, i]));
  const links = rows.flatMap((r, b) => (r.job.after ?? []).flatMap((id) => (at.has(id) ? [{ a: at.get(id)!, b }] : [])));
  const to = Math.max(from + length, ...rows.map((r) => r.to)) + length * 0.03;
  return { rows, from, to, now, links };
}

/** Where a time is along the axis, as a percent of it. */
export const along = (g: Pick<Gantt, 'from' | 'to'>, t: number): number => Math.max(0, Math.min(100, ((t - g.from) / (g.to - g.from)) * 100));

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const STEPS = [MIN, 2 * MIN, 5 * MIN, 10 * MIN, 15 * MIN, 30 * MIN, HOUR, 2 * HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, DAY, 2 * DAY, 7 * DAY, 14 * DAY, 30 * DAY];

/**
 * The axis's marks, `most` at most, on round times of the clock (`offset`: what the local time is ahead of UTC, in ms),
 * and the step between them.
 */
export function ticks(from: number, to: number, most: number, offset = 0): { step: number; at: number[] } {
  const step = STEPS.find((s) => (to - from) / s <= most) ?? STEPS[STEPS.length - 1];
  const at: number[] = [];
  for (let t = Math.ceil((from + offset) / step) * step - offset; t <= to; t += step) at.push(t);
  return { step, at };
}
