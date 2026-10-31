// When a task runs next, in the user's time zone: wall-clock times turned into instants (across
// daylight-saving changes), weekdays, and five-field cron expressions. No dependencies: Intl knows
// the time zones.
import type { TaskSchedule } from '../../shared/automations.ts';
import { HttpError } from '../auth.ts';

const HOUR = 3600_000;
const fmts = new Map<string, Intl.DateTimeFormat>();

function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmts.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    fmts.set(tz, f);
  }
  return f;
}

export interface Wall {
  y: number;
  /** 1–12 */
  mo: number;
  d: number;
  h: number;
  mi: number;
  /** 0 Sunday … 6 Saturday */
  wd: number;
}

/** The wall-clock time at an instant in a time zone. */
export function wallAt(tz: string, at: number): Wall {
  const p: Record<string, number> = {};
  for (const x of fmt(tz).formatToParts(at)) if (x.type !== 'literal') p[x.type] = Number(x.value);
  const h = p.hour % 24;
  return { y: p.year, mo: p.month, d: p.day, h, mi: p.minute, wd: new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay() };
}

/** How far a time zone is ahead of UTC at an instant, in ms. */
export function tzOffset(tz: string, at: number): number {
  const s = Math.floor(at / 1000) * 1000;
  const p: Record<string, number> = {};
  for (const x of fmt(tz).formatToParts(s)) if (x.type !== 'literal') p[x.type] = Number(x.value);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - s;
}

/**
 * The instant a wall-clock time happens in a time zone. A time skipped when the clocks go forward
 * comes out as the same time after the change (02:30 becomes 03:30); one that happens twice when
 * they go back is the first.
 */
export function zonedTime(tz: string, y: number, mo: number, d: number, h: number, mi: number): number {
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const offsets = [...new Set([-30 * HOUR, -15 * HOUR, 0, 15 * HOUR, 30 * HOUR].map((dt) => tzOffset(tz, wall + dt)))];
  const fits = offsets.map((o) => wall - o).filter((t) => t + tzOffset(tz, t) === wall);
  return fits.length ? Math.min(...fits) : wall - Math.min(...offsets);
}

/** The calendar day `n` days after a date (no time zone involved). */
function addDays(y: number, mo: number, d: number, n: number) {
  const t = new Date(Date.UTC(y, mo - 1, d + n));
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate(), wd: t.getUTCDay() };
}

export function validZone(tz: string): boolean {
  try {
    fmt(tz);
    return true;
  } catch {
    return false;
  }
}

// ---- cron ----------------------------------------------------------------------------------------

export interface Cron {
  minute: number[];
  hour: number[];
  dom: Set<number>;
  month: Set<number>;
  dow: Set<number>;
  /** Day of month and weekday both restricted: either may match (as cron does). */
  either: boolean;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MACROS: Record<string, string> = {
  '@hourly': '0 * * * *',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@weekly': '0 0 * * 0',
  '@monthly': '0 0 1 * *',
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
};

/** One field's values; `wrap` maps a value onto another (weekday 7 is Sunday, 0). */
function field(src: string, lo: number, hi: number, names?: string[], wrap?: [number, number]): number[] {
  const out = new Set<number>();
  const num = (s: string) => {
    const i = names?.indexOf(s.toLowerCase()) ?? -1;
    const n = i >= 0 ? i + lo : /^\d+$/.test(s) ? Number(s) : NaN;
    if (!Number.isInteger(n)) throw new Error(`“${s}” is not a number`);
    return n;
  };
  for (const part of src.split(',')) {
    const m = /^(\*|\w+(?:-\w+)?)(?:\/(\d+))?$/.exec(part);
    if (!m) throw new Error(`“${part}” is not a cron field`);
    const step = m[2] ? Number(m[2]) : 1;
    if (step < 1) throw new Error('A step must be at least 1');
    let a = lo;
    let b = wrap ? wrap[0] - 1 : hi;
    if (m[1] !== '*') {
      const [x, y] = m[1].split('-');
      a = num(x);
      b = y !== undefined ? num(y) : m[2] ? hi : a;
    }
    if (a < lo || b > hi || a > b) throw new Error(`${part} is out of range (${lo}–${hi})`);
    for (let v = a; v <= b; v += step) out.add(wrap && v === wrap[0] ? wrap[1] : v);
  }
  return [...out].sort((x, y) => x - y);
}

/** Reads a five-field cron expression (minute hour day month weekday) or a macro like @daily; throws with the reason. */
export function parseCron(expr: string): Cron {
  const src = MACROS[expr.trim().toLowerCase()] ?? expr.trim();
  const f = src.split(/\s+/);
  if (f.length !== 5) throw new Error('A cron expression has five fields: minute hour day month weekday');
  return {
    minute: field(f[0], 0, 59),
    hour: field(f[1], 0, 23),
    dom: new Set(field(f[2], 1, 31)),
    month: new Set(field(f[3], 1, 12, MONTHS)),
    // Sunday is 0 or 7.
    dow: new Set(field(f[4], 0, 7, WEEKDAYS, [7, 0])),
    // As cron does: when both are restricted, either one matching is enough.
    either: !f[2].startsWith('*') && !f[4].startsWith('*'),
  };
}

function cronDay(c: Cron, day: { mo: number; d: number; wd: number }): boolean {
  if (!c.month.has(day.mo)) return false;
  const dom = c.dom.has(day.d);
  const dow = c.dow.has(day.wd);
  return c.either ? dom || dow : dom && dow;
}

// ---- next run ------------------------------------------------------------------------------------

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** The next time a schedule fires after `from`, in the time zone `tz`; null when it never will (webhooks, a past once). */
export function nextRun(s: TaskSchedule, from: number, tz: string): number | null {
  switch (s.kind) {
    case 'every':
      return from + Math.max(5, s.minutes) * 60_000;
    case 'watch':
      return from + Math.max(1, s.minutes) * 60_000;
    case 'once':
      return s.at > from ? s.at : null;
    case 'webhook':
      return null;
    case 'daily': {
      const m = HHMM.exec(s.time);
      if (!m) return null;
      const days = s.days?.length ? new Set(s.days) : null;
      const w = wallAt(tz, from);
      for (let i = 0; i < 9; i++) {
        const day = addDays(w.y, w.mo, w.d, i);
        if (days && !days.has(day.wd)) continue;
        const t = zonedTime(tz, day.y, day.mo, day.d, Number(m[1]), Number(m[2]));
        if (t > from) return t;
      }
      return null;
    }
    case 'cron': {
      let c: Cron;
      try {
        c = parseCron(s.expr);
      } catch {
        return null;
      }
      const w = wallAt(tz, from);
      // Five years covers the rarest real schedules (the 29th of February).
      for (let i = 0; i < 366 * 5 + 2; i++) {
        const day = addDays(w.y, w.mo, w.d, i);
        if (!cronDay(c, day)) continue;
        for (const h of c.hour) {
          for (const mi of c.minute) {
            const t = zonedTime(tz, day.y, day.mo, day.d, h, mi);
            if (t > from) return t;
          }
        }
      }
      return null;
    }
  }
}

/** The next few runs, for showing a schedule. */
export function nextRuns(s: TaskSchedule, from: number, tz: string, n = 3): number[] {
  const out: number[] = [];
  let t: number | null = from;
  while (out.length < n && (t = nextRun(s, t, tz)) !== null) {
    out.push(t);
    if (s.kind === 'once') break;
  }
  return out;
}

/** "Fri 6 Nov, 09:00": an instant in the user's time zone. */
export function localText(at: number, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(at);
}

/**
 * A wall-clock date and time in the user's time zone ("2026-11-06 09:00", "2026-11-06T09:00"), or an
 * ISO time with its own offset; null when it is not one.
 */
export function parseLocal(text: string, tz: string): number | null {
  const s = text.trim();
  if (/(Z|[+-]\d\d:?\d\d)$/i.test(s) && /\d{4}-\d\d-\d\dT/.test(s)) {
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : null;
  }
  const m = /^(\d{4})-(\d\d)-(\d\d)(?:[ T](\d\d?):(\d\d)(?::\d\d)?)?$/.exec(s);
  if (!m) return null;
  const [y, mo, d, h, mi] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4] ?? 9), Number(m[5] ?? 0)];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  return zonedTime(tz, y, mo, d, h, mi);
}

/** A cron expression's problem, as an HttpError for a form. */
export function checkCron(expr: string) {
  try {
    parseCron(expr);
  } catch (e) {
    throw new HttpError(400, `That cron expression doesn't work: ${(e as Error).message}`);
  }
}

export { HHMM };
