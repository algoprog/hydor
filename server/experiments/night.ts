// Runs that wait for the night (a job's when: "night"): the night's hours in the person's own time zone (the one their
// browser reported; this computer's when it has not said: a server's clock is often UTC), why such a run
// waits, what happens when a night ends (runs still going are let finish, or marked to be stopped and put back to wait
// for the next night) and the one notice in the morning. The queue (queue.ts) looks here on every pass.
//
// A night is named by the date it began on. The one being watched is kept in the app's data, so a morning that comes
// while the app is not running is still told when it is back. A night run keeps the nights it was part of, which is
// what the morning's notice opens (Experiments, ?night=<date>).
import { ACTIVE, type ExperimentsSettings, type RunRecord } from '../../shared/experiments.ts';
import type { NotifyEvent } from '../../shared/types.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { listRuns, updateRun } from './records.ts';

/** The clock the night is read from (the tests set it). */
export const clock = { now: () => Date.now() };

/** Why a night run stopped at the night's end waits, until the next night. */
export const NIGHT_AGAIN = 'The night ended: it starts again tonight';
/** Why a night run waits in the night itself while an ordinary run waits. */
export const NIGHT_BEHIND = 'Its turn comes after your other waiting runs: it is a night run';
const NIGHT_UNSET = 'Waits for the night: none is set. Give Night two different times in Where runs go';
export const NIGHT_CLUSTER = 'A run on a cluster cannot wait for the night: the cluster has its own queue. Send it without “Tonight”, or run it on this computer or one of your machines';

type Hours = Pick<ExperimentsSettings, 'nightFrom' | 'nightTo'>;

/** A time of day as typed ("7:00", "23:30") as "07:00", "23:30"; null for anything else. */
export function clockTime(v: unknown): string | null {
  const m = /^\s*([01]?\d|2[0-3]):([0-5]\d)\s*$/.exec(typeof v === 'string' ? v : '');
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const dateOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The wall clock at `at` in a time zone (this computer's own when none is given, or it is not one): minutes into the day, the date, and the date before. */
function wall(at: number, tz?: string): { now: number; date: string; before: string } {
  const d = new Date(at);
  if (tz) {
    try {
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
      const before = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day) - 1)).toISOString().slice(0, 10);
      return { now: Number(p.hour) * 60 + Number(p.minute), date: `${p.year}-${p.month}-${p.day}`, before };
    } catch {}
  }
  return { now: d.getHours() * 60 + d.getMinutes(), date: dateOf(d), before: dateOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)) };
}

/**
 * The night `at` is in, by the date it began on; null by day, and always when there is no night (from equal to to).
 * The hours are read in `tz`, the person's time zone: on a server whose clock is UTC, 23:00 is still their 23:00.
 */
export function nightAt(at: number, h: Hours, tz?: string): string | null {
  const from = minutesOf(h.nightFrom);
  const to = minutesOf(h.nightTo);
  const { now, date, before } = wall(at, tz);
  if (from === to) return null;
  if (from < to) return now >= from && now < to ? date : null;
  if (now >= from) return date;
  // The early hours belong to the night that began the evening before.
  return now < to ? before : null;
}

/** Why a night run waits by day: when it will start. */
export function nightWhy(r: Pick<RunRecord, 'why'>, h: Hours): string {
  if (h.nightFrom === h.nightTo) return NIGHT_UNSET;
  return r.why === NIGHT_AGAIN ? NIGHT_AGAIN : `Waits for the night (from ${h.nightFrom})`;
}

/** When a night run asked for now will start, for an agent and its approval card. `machine`: sent to that machine. */
export function tonightWords(h: Hours, machine?: string): string {
  if (machine) return `It will start tonight, in the night hours set on ${machine}`;
  if (h.nightFrom === h.nightTo) return 'It will wait until night hours are set (Experiments → Where runs go): there is no night now';
  return `It will start tonight, between ${h.nightFrom} and ${h.nightTo}`;
}

/** The time zone the night's hours are read in: the person's, as their browser reported it (the tests leave it unset: this computer's). */
export const nightZone = (db: DB): string | undefined => kvGet(db, 'user.tz') || undefined;

/**
 * For an agent, beside when a night run will start: how long until then, whose clock the hours are on, and that it
 * runs the code its folder has when it starts (nothing is fixed when it is queued). Empty when there is no night.
 */
export function tonightMore(h: Hours, o: { tz?: string; at?: number } = {}): string {
  if (h.nightFrom === h.nightTo) return '';
  const at = o.at ?? clock.now();
  const zone = o.tz ? `The hours are in ${o.tz} time. ` : '';
  const code = 'It runs the code as its folder has it when it starts, so leave that folder and its branch as they should run.';
  if (nightAt(at, h, o.tz)) return `${zone}It is night now, so it starts as soon as nothing else waits. ${code}`;
  const left = (minutesOf(h.nightFrom) - wall(at, o.tz).now + 1440) % 1440;
  const about = left >= 90 ? `${Math.round(left / 60)} hours` : left >= 60 ? 'an hour' : `${Math.max(1, left)} minutes`;
  return `${zone}That is in about ${about}. ${code}`;
}

/** A night run in this computer's own queue (one sent to another machine is that machine's). */
export const isNightHere = (r: Pick<RunRecord, 'when' | 'remote' | 'where'>) => r.when === 'night' && !r.remote && !/^[cm]:/.test(r.where ?? '');

// ---- the night being watched ---------------------------------------------------------------------------------

const KEY = 'experiments_night';
/** `open` until its morning is dealt with; `since`: when it was first watched (its morning counts what ended after). */
interface Watch {
  night: string;
  open: boolean;
  since: number;
}

function watchOf(db: DB): Watch | null {
  try {
    return JSON.parse(kvGet(db, KEY) ?? 'null') as Watch | null;
  } catch {
    return null;
  }
}
const keep = (db: DB, w: Watch) => kvSet(db, KEY, JSON.stringify(w));

/** Whether a morning is still to be told: the queue's loop stays awake for it. */
export const morningDue = (db: DB): boolean => !!watchOf(db)?.open;

/**
 * On every pass, before anything else: closes a night that has ended (its runs still going marked to be stopped when
 * the settings say so, and the morning told), then watches the night it is now, while night runs are there.
 * `night`: the one it is now (nightAt); `active`: the runs not ended.
 */
export function watchNight(d: Deps, night: string | null, active: RunRecord[], settings: ExperimentsSettings): void {
  let w = watchOf(d.db);
  if (w?.open && w.night !== night) {
    // Only when it is day again: a computer asleep through a whole day wakes in the next night, and its runs go on.
    const stop = !night && settings.nightEnds === 'stop';
    if (stop) for (const r of active) if (isNightHere(r) && (r.status === 'starting' || r.status === 'running')) updateRun(d.db, r.id, { info: { nightStop: true } });
    // Closed before it is told, so a morning is told once whatever happens.
    keep(d.db, { ...w, open: false });
    tellMorning(d, w, stop);
    w = null;
  }
  if (night && !w?.open && active.some(isNightHere)) keep(d.db, { night, open: true, since: Date.now() });
}

const noteNight = (db: DB, r: RunRecord, night: string) => {
  if (!r.nights?.includes(night)) updateRun(db, r.id, { info: { nights: [...(r.nights ?? []), night].slice(-60) } });
};

/** A run ended: a night run counts for the night open now. True when the morning will tell of it. */
export function endedAtNight(db: DB, r: RunRecord): boolean {
  const w = watchOf(db);
  if (!isNightHere(r) || !w?.open) return false;
  noteNight(db, r, w.night);
  return true;
}

// ---- the morning ---------------------------------------------------------------------------------------------

export interface Morning {
  done: number;
  failed: number;
  stopped: number;
  running: number;
  waiting: number;
}

/** "Last night: 5 runs done, 1 failed, 2 still wait for tonight". The first part says what is counted: runs. */
export function morningWords(n: Morning): string {
  const parts: string[] = [];
  const count = (k: number) => (parts.length ? `${k}` : k === 1 ? '1 run' : `${k} runs`);
  if (n.done) parts.push(`${count(n.done)} done`);
  if (n.failed) parts.push(`${count(n.failed)} failed`);
  if (n.stopped) parts.push(`${count(n.stopped)} stopped`);
  if (n.running) parts.push(`${count(n.running)} still running`);
  if (n.waiting) parts.push(`${count(n.waiting)} still ${n.waiting === 1 ? 'waits' : 'wait'} for tonight`);
  return `Last night: ${parts.join(', ')}`;
}

/** The one notice of a night: nothing when none of its runs ended and none still waits. `stopping`: those going are being put back to wait. */
function tellMorning(d: Deps, { night, since }: Watch, stopping: boolean): void {
  // One you stopped, or one stopped before it started, is not news.
  const ended = listRuns(d.db, { night, limit: 5000 }).filter((r) => isNightHere(r) && !ACTIVE.includes(r.status) && (r.endedAt ?? 0) >= since && (r.status !== 'stopped' || (!!r.startedAt && r.why !== 'Stopped by you')));
  const open = listRuns(d.db, { status: ACTIVE, limit: 5000 }).filter(isNightHere);
  const waiting = open.filter((r) => stopping || r.status === 'queued' || r.status === 'waiting').length;
  if (!ended.length && !waiting) return;
  for (const r of open) noteNight(d.db, r, night);
  const n: Morning = {
    done: ended.filter((r) => r.status === 'done').length,
    failed: ended.filter((r) => r.status === 'failed' || r.status === 'lost').length,
    stopped: ended.filter((r) => r.status === 'stopped').length,
    running: open.length - waiting,
    waiting,
  };
  d.sessions.emit('notify', {
    key: 'experiments:night',
    kind: n.failed && !n.done ? 'failed' : 'done',
    title: 'Experiments',
    body: morningWords(n),
    agent: 'claude',
    at: Date.now(),
    url: `/experiments?night=${night}`,
  } satisfies NotifyEvent);
}
