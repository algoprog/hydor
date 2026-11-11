// Durations: what people type after --for, and how amounts of time are shown.
import { fail } from './errors.mjs';

// Whole minutes for "90m", "2h", "1h30m", "1:30" or "1.5h".
export function parseDuration(text) {
  let m;
  if ((m = /^(\d+)m$/.exec(text))) return Number(m[1]);
  if ((m = /^(\d+)h(?:(\d+)m)?$/.exec(text))) {
    const minutes = m[2] === undefined ? 0 : Number(m[2]);
    if (minutes > 59) fail(`not a duration: ${text}`);
    return Number(m[1]) * 60 + minutes;
  }
  if ((m = /^(\d+):(\d+)$/.exec(text))) return Math.round(parseFloat(`${m[1]}.${m[2]}`) * 60);
  if ((m = /^(\d+)(?:\.(\d+))?h$/.exec(text))) {
    // Decimal hours in whole numbers, so that halves of a minute round up exactly.
    const fraction = m[2] ?? '';
    const scale = 10 ** fraction.length;
    const tenths = Number(m[1] + fraction);
    return Math.floor((tenths * 120 + scale) / (2 * scale));
  }
  return fail(`not a duration (try 90m, 1h30m, 1:30 or 1.5h): ${text}`);
}

// A number of minutes as h:mm: "0:05", "9:00", "26:30".
export function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}
