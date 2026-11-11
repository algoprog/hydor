// Calendar dates ("YYYY-MM-DD") and weeks. Weeks run Monday to Sunday.
import { fail } from './errors.mjs';

const DAY = 86400000;
const NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Days since 1 January 1970 for a date, which must be real.
export function dayNumber(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) fail(`not a date (YYYY-MM-DD): ${date}`);
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const at = new Date(Date.UTC(year, month - 1, day));
  if (month < 1 || month > 12 || at.getUTCMonth() !== month - 1 || at.getUTCDate() !== day) fail(`not a real date: ${date}`);
  return at.getTime() / DAY;
}

export function fromDayNumber(n) {
  return new Date(n * DAY).toISOString().slice(0, 10);
}

export function addDays(date, days) {
  return fromDayNumber(dayNumber(date) + days);
}

// 1 for Monday to 7 for Sunday.
function isoWeekday(n) {
  return ((n + 3) % 7) + 1;
}

export function dayName(date) {
  return NAMES[isoWeekday(dayNumber(date)) - 1];
}

// The Monday on or before a date.
export function mondayOf(date) {
  const n = dayNumber(date);
  return fromDayNumber(n - (isoWeekday(n) - 1));
}

// Weeks are counted inside the calendar year: week 1 starts on 1 January and runs to the first Sunday, and every
// later week starts on a Monday. The second week's first day:
function secondWeekStart(year) {
  const jan1 = dayNumber(`${year}-01-01`);
  return jan1 + ((7 - isoWeekday(jan1)) % 7) + 1;
}

export function formatWeek(year, week) {
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function weekNumber(year, n) {
  const second = secondWeekStart(year);
  return n < second ? 1 : Math.floor((n - second) / 7) + 2;
}

// The week a date is in, as "YYYY-Www".
export function weekOf(date) {
  const year = Number(date.slice(0, 4));
  return formatWeek(year, weekNumber(year, dayNumber(date)));
}

// The first and last date of a week, from "YYYY-Www".
export function weekRange(id) {
  const m = /^(\d{4})-W(\d{2})$/.exec(id);
  if (!m) fail(`not a week (YYYY-Www): ${id}`);
  const year = Number(m[1]);
  const week = Number(m[2]);
  const last = dayNumber(`${year}-12-31`);
  if (week < 1 || week > weekNumber(year, last)) fail(`${year} has no week ${week}`);
  const second = secondWeekStart(year);
  const from = week === 1 ? dayNumber(`${year}-01-01`) : second + (week - 2) * 7;
  const to = week === 1 ? second - 1 : Math.min(from + 6, last);
  return { from: fromDayNumber(from), to: fromDayNumber(to) };
}
