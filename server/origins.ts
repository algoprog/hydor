// The addresses besides this computer's own that the app is opened at, and so may change things and open its
// WebSocket from (server/index.ts checks each request's Origin against them). Two lists: ALLOWED_ORIGINS in the
// environment (a reverse proxy the person set up by hand, read once at start), and the ones the app adds itself and
// keeps in its database, such as the https://<machine>.<tailnet>.ts.net address Settings → App → Use on your phone
// serves it at (server/phone). Requests from the same host as the one they are sent to, and localhost, pass anyway.
import { config } from './config.ts';
import { kvGet, kvSet, type DB } from './db.ts';

const KEY = 'allowed_origins';
let stored: string[] = [];
let db: DB | null = null;

/** An origin as browsers send it: scheme, host and a port only when it is not the scheme's own. Null for anything else. */
export function cleanOrigin(s: unknown): string | null {
  try {
    const u = new URL(String(s ?? '').trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** Reads the stored list (once, as the server starts). */
export function loadOrigins(d: DB) {
  db = d;
  try {
    const v = JSON.parse(kvGet(d, KEY) ?? '[]');
    stored = Array.isArray(v) ? v.map(cleanOrigin).filter((o): o is string => !!o) : [];
  } catch {
    stored = [];
  }
}

const save = () => db && kvSet(db, KEY, JSON.stringify(stored));

/** The ones the app added itself. */
export const storedOrigins = (): string[] => [...stored];

/** Every extra origin: the environment's, then the stored ones. */
export const extraOrigins = (): string[] => [...new Set([...config.allowedOrigins, ...stored])];

/** Whether an origin is one of the extra ones (this computer's own are checked by the caller). */
export const originListed = (origin: string): boolean => config.allowedOrigins.includes(origin) || stored.includes(origin);

/** Adds one to the stored list; false when it was allowed already (by the environment or the list), so nothing changed. */
export function addOrigin(origin: string): boolean {
  const o = cleanOrigin(origin);
  if (!o || originListed(o)) return false;
  stored.push(o);
  save();
  return true;
}

/**
 * The address links the app hands out start with (a session's link in a chat app's reply, the links agents are given to
 * sessions and saved pages): the first of ALLOWED_ORIGINS when it is set, which stays as it is; else the Tailscale
 * address Use on your phone serves the app at, so they open on the phone; else this computer's own.
 */
export function linkBase(allowed: readonly string[], served: string | null, port: number): string {
  return allowed[0] ?? served ?? `http://127.0.0.1:${port}`;
}

/** Takes one out of the stored list (never the environment's); false when it was not there. */
export function removeOrigin(origin: string): boolean {
  const o = cleanOrigin(origin);
  if (!o || !stored.includes(o)) return false;
  stored = stored.filter((x) => x !== o);
  save();
  return true;
}
