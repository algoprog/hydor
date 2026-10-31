// What the app knows of the person using it beyond settings: their time zone (from the browser), so
// agents and schedules speak in local time.
import { kvGet, kvSet, type DB } from './db.ts';

/** An IANA time zone ("Europe/Athens"); the server's own when the browser has not said. */
export function userTimezone(db: DB): string {
  return kvGet(db, 'user.tz') || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function setUserTimezone(db: DB, tz: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
  } catch {
    return;
  }
  if (kvGet(db, 'user.tz') !== tz) kvSet(db, 'user.tz', tz);
}

/** "Friday 31 October 2026, 14:05 (Europe/Athens)": now, in the user's time zone. */
export function localNow(db: DB, at = Date.now()): string {
  const tz = userTimezone(db);
  const s = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(at);
  return `${s} (${tz})`;
}
