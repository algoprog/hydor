// Local times: the wall-clock "YYYY-MM-DDTHH:MM" the data file stores, in the time zone the data file names.
import { fail } from './errors.mjs';

const MINUTE = 60000;

export function isKnownZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

// Splits "2025-10-26T03:30" into numbers, and refuses text that is not a real date and time of day.
export function parseLocal(text) {
  const [date = '', time = ''] = text.split('T');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) fail(`not a local time (YYYY-MM-DDTHH:MM): ${text}`);
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const real = new Date(Date.UTC(year, month - 1, day));
  if (month < 1 || month > 12 || real.getUTCMonth() !== month - 1 || real.getUTCDate() !== day || hour > 23 || minute > 59) {
    fail(`not a real date and time: ${text}`);
  }
  return { year, month, day, hour, minute };
}

// The local time as minutes since 1970 on a clock that never changes: only useful for differences between local
// times on the same clock, and as the middle step to real time below.
function wallMinutes(local) {
  const { year, month, day, hour, minute } = parseLocal(local);
  return Date.UTC(year, month - 1, day, hour, minute) / MINUTE;
}

// How many minutes the clock of a time zone is ahead of UTC at a moment (minutes since 1970).
function offsetAt(moment, timeZone) {
  return wallMinutes(nowLocal(timeZone, moment * MINUTE)) - moment;
}

// The moment (minutes since 1970) a local time stands for in a time zone. A local time that happens twice, when the
// clocks go back, is the first of the two; one that does not exist, skipped when the clocks go forward, is an error.
export function instantOf(local, timeZone) {
  const wall = wallMinutes(local);
  // The offset is the one before or the one after a change, and a change never comes twice within two days.
  const offsets = new Set([offsetAt(wall - 1440, timeZone), offsetAt(wall + 1440, timeZone)]);
  const moments = [...offsets].map((offset) => wall - offset).filter((moment) => offsetAt(moment, timeZone) === wall - moment);
  if (moments.length === 0) fail(`no such time in ${timeZone}: ${local}`);
  return Math.min(...moments);
}

// How many minutes of real time lie between two local times.
export function minutesBetween(start, end, timeZone) {
  return instantOf(end, timeZone) - instantOf(start, timeZone);
}

// The local time a number of real minutes after a local time.
export function addMinutes(local, minutes, timeZone) {
  return nowLocal(timeZone, (instantOf(local, timeZone) + minutes) * MINUTE);
}

// The local time in the time zone right now, or at the given moment (milliseconds since 1970).
export function nowLocal(timeZone, at = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(at);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

// The local date, "YYYY-MM-DD", of a local time.
export function dateOf(local) {
  return local.slice(0, 10);
}
