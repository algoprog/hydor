// A highlight on a web page of your own browsing (the Browser page): the words you marked, a little text round them to find
// them again, and the page's address as its highlights are kept by, the same for the same page whatever it carries after
// the address (a #fragment, tracking parameters). Shared by the server (the store, the routes) and the app.

/** One highlight: kept privately on this computer, never seen by agents. */
export interface PageHighlight {
  id: string;
  /** What the page's highlights are kept by (see `highlightKey`). */
  key: string;
  /** The page's address as it was when you marked it (without its #fragment). */
  url: string;
  title: string;
  /** The marked words, as the page reads (spaces gathered, a space between paragraphs). */
  text: string;
  /** Some words just before and just after them, to tell this place from another of the same words. */
  prefix: string;
  suffix: string;
  note: string;
  at: number;
}

/** The most characters one highlight may hold, and a note. */
export const HIGHLIGHT_MAX = 5000;
export const HIGHLIGHT_NOTE_MAX = 2000;
/** How many characters of text round a highlight are kept on each side. */
export const HIGHLIGHT_CONTEXT = 32;

const TRACKING = /^(utm_.*|fbclid|gclid|dclid|gbraid|wbraid|msclkid|yclid|twclid|ttclid|igshid|mc_cid|mc_eid|_ga|_gl|mkt_tok|vero_id|ref_src|ref_url|spm|oly_enc_id|oly_anon_id|__s|_hsenc|_hsmi|hsa_.*)$/i;

/**
 * The page an address is: no scheme (http and https are one page), no www., no #fragment, no tracking parameters, the
 * rest of the parameters in order, no slash at the end. Null for anything that is not a website or a file.
 */
export function highlightKey(address: string): string | null {
  if (typeof address !== 'string' || address.length > 4000) return null;
  let u: URL;
  try {
    u = new URL(address);
  } catch {
    return null;
  }
  if (u.protocol === 'file:') return `file://${u.pathname}`;
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const keep = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k));
  keep.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  const query = keep.length ? `?${keep.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')}` : '';
  const host = u.host.toLowerCase().replace(/^www\./, '');
  const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : '';
  return `${host}${path}${query}`;
}
