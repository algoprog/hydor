// The machine this page shows. The app shows one machine at a time: pages under /m/<id>/ are another
// machine's (Settings → Machines), whose API and sockets this server forwards there; the rest are this
// server's own machine.
const m = /^\/m\/([a-z0-9-]{1,40})(?=\/|$)/.exec(location.pathname);

/** The other machine this page shows, or null for this server's own. */
export const machineId: string | null = m ? m[1] : null;

/** The path prefix of the machine's pages, and of its API and sockets ('' for this server's own). */
export const machineBase = machineId ? `/m/${machineId}` : '';

/** Calls this server answers itself, whichever machine the page shows: sign-in, the machines, push, themes, the tour and its tips, the sidebar's tools. */
const OWN = /^\/api\/(auth\/|machines\b|push\b|themes\b|tour\b|tips\b|sidebar\b)/;

/**
 * A project shared with someone, opened at their link (/p/<token>, server/spaces/portal.ts): the Library's editors and
 * viewers there ask the link's own routes for what they ask of /api/pages/…, which answer for that project alone; any
 * other call of the app's API goes nowhere from there.
 */
export const portalToken: string | null = /^(?:\/m\/[a-z0-9-]{1,40})?\/p\/([A-Za-z0-9_-]{32})\/?$/.exec(location.pathname)?.[1] ?? null;

/** A URL on the server of the machine this page shows. */
export function mu(path: string): string {
  if (portalToken && path.startsWith('/api/')) return `${machineBase}/p-api/${portalToken}/${path.startsWith('/api/pages/') ? path.slice('/api/'.length) : `none/${path.slice('/api/'.length)}`}`;
  return machineBase && !OWN.test(path) ? machineBase + path : path;
}

/** A browser storage key of this machine's own (open files, the explorer's folder, the terminal). */
export const machineKey = (key: string) => (machineId ? `${key}@${machineId}` : key);

/** A page of a machine (null: this server's own), for a link or a full load. */
export const machinePath = (id: string | null, path = '/') => (id ? `/m/${id}${path === '/' ? '/' : path}` : path);

/** The machine and page an absolute path (as a notification carries) points at. */
export function splitMachinePath(path: string): { id: string | null; path: string } {
  const x = /^\/m\/([a-z0-9-]{1,40})(\/.*)?$/.exec(path);
  return x ? { id: x[1], path: x[2] || '/' } : { id: null, path };
}
