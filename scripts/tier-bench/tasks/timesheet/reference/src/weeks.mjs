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

// The first day of week 1 of a year, as a day number. Week 1 is the week with 4 January in it, which can start in
// the December before.
function week1Start(year) {
  const jan4 = dayNumber(`${year}-01-04`);
  return jan4 - (isoWeekday(jan4) - 1);
}

function weeksInYear(year) {
  return (week1Start(year + 1) - week1Start(year)) / 7;
}

export function formatWeek(year, week) {
  return `${year}-W${String(week).padStart(2, '0')}`;
}

// The week a date is in, as "YYYY-Www". Around New Year it can belong to the year before or the year after.
export function weekOf(date) {
  const n = dayNumber(date);
  let year = Number(date.slice(0, 4));
  if (n >= week1Start(year + 1)) year++;
  else if (n < week1Start(year)) year--;
  return formatWeek(year, Math.floor((n - week1Start(year)) / 7) + 1);
}

// The first and last date of a week, from "YYYY-Www".
export function weekRange(id) {
  const m = /^(\d{4})-W(\d{2})$/.exec(id);
  if (!m) fail(`not a week (YYYY-Www): ${id}`);
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (week < 1 || week > weeksInYear(year)) fail(`${year} has no week ${week}`);
  const from = week1Start(year) + (week - 1) * 7;
  return { from: fromDayNumber(from), to: fromDayNumber(from + 6) };
}
