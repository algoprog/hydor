// The user's OK to press a button that sends, posts, deletes or transfers on a signed-in site (ops.ts asks, and
// SessionBrowser.answer grants it). An OK is for the button's words on that site, for two minutes and one press.

/** How long an OK to press a button lasts. */
export const ALLOW_MS = 120_000;

/** The site (host and port) of a page's address; '' for none. */
export function hostOf(url: string | undefined): string {
  try {
    return new URL(url ?? '').host;
  } catch {
    return '';
  }
}

/** What an OK is for: the button's words (as the page words them, in lower case) on a site. */
export const allowKey = (host: string, words: string): string => `${host}\n${words.replace(/\s+/g, ' ').trim().toLowerCase()}`;

/** The user allowed pressing `words` on `url`'s site: once, in the next two minutes. */
export function allow(allowed: Map<string, number>, url: string | undefined, words: string, now = Date.now()) {
  for (const [k, until] of allowed) if (until <= now) allowed.delete(k);
  allowed.set(allowKey(hostOf(url), words), now + ALLOW_MS);
}

/** Whether pressing `words` on `url`'s site is allowed now; an OK is used up by the press it lets through. */
export function useAllowance(allowed: Map<string, number>, url: string | undefined, words: string, now = Date.now()): boolean {
  const k = allowKey(hostOf(url), words);
  const until = allowed.get(k);
  if (until === undefined) return false;
  allowed.delete(k);
  return until > now;
}
