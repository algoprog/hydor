// The one interface every search provider implements. A provider is one file in this folder that
// exports a SearchProvider; providers.ts lists them in their default order. docs/search-providers.md
// walks through adding one.
import type { NagetCredits, SearchCaps } from '../../shared/search.ts';

export type { SearchCaps } from '../../shared/search.ts';

/** One search, as the agent asked for it (web_search's arguments, checked and normalized). */
export interface SearchQuery {
  /** The words to search for, without operators (site:… and filetype:… are read into the fields below). */
  text: string;
  /** How many results, 1 to 100. */
  k: number;
  /** Sites to keep to, as hosts ("arxiv.org"); a site's subdomains count too. */
  sites: string[];
  excludeSites: string[];
  /** Naget Search's category ids ("academic", "uspto", "news"…); other providers map what they can. */
  categories: string[];
  /** Dates as YYYY-MM-DD, either end open. */
  from?: string;
  to?: string;
  /** ISO 639-1 codes ("en", "de"). */
  languages: string[];
  fileTypes: ('html' | 'pdf')[];
  /** Only sites' own home pages (a person's, a company's, a project's). */
  homepagesOnly: boolean;
  /** plain: each page's own snippet. filtered: the sentences of each page that answer the query. */
  snippets: 'plain' | 'filtered';
}

/** One result, the same whoever found it. */
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  /** The sentences of the page that answer the query, for snippets: 'filtered'. */
  filtered?: string;
  /** YYYY-MM-DD: published, else crawled. */
  date?: string;
  /** A category id ("pubmed", "news"). */
  category?: string;
  fileType?: 'html' | 'pdf';
  language?: string;
}

/** What a provider gets besides the query: its settings, a way out, and the network. */
export interface ProviderCtx {
  /** The key from Settings → Search, when it has one. */
  key?: string;
  /** Its address from Settings (or its default). */
  url?: string;
  signal: AbortSignal;
  /** fetch, swapped for recorded answers in the tests. */
  fetch: typeof fetch;
  /** Naget Search reports what is left of its allowance. */
  credits?(c: NagetCredits): void;
}

export interface ProviderAnswer {
  results: SearchResult[];
  /** The asked-for filters it could not keep to, in words ("categories", "exact dates"). */
  ignored?: string[];
}

export interface SearchProvider {
  /** Short and stable: settings and the tool's `provider` argument use it. */
  id: string;
  name: string;
  /** One line for Settings. */
  description: string;
  caps: SearchCaps;
  /** Whether it needs a key, gives more with one, or takes none; and where to get one. */
  key: 'required' | 'optional' | 'none';
  keyUrl?: string;
  /** An address: the user's own instance (required), or a default that can be changed. */
  url?: { placeholder: string; required: boolean; default?: string };
  /** On for a new install (one that needs nothing from the user). */
  enabledByDefault: boolean;
  /** Throws a SearchError when it cannot answer; the next provider then gets the query. */
  search(q: SearchQuery, ctx: ProviderCtx): Promise<ProviderAnswer>;
}

/**
 * Why a provider could not answer. Every kind but `invalid` passes the query on to the next provider;
 * `invalid` goes back to the agent, since its arguments need fixing (an unknown category).
 */
export type SearchErrorKind = 'auth' | 'credits' | 'limit' | 'blocked' | 'unavailable' | 'invalid';

export class SearchError extends Error {
  kind: SearchErrorKind;
  /** Don't ask it again before this time (a rate limit's Retry-After, an allowance's reset). */
  retryAt?: number;
  /** The provider's own code for it, when it gives one ("page_unreadable"). */
  code?: string;
  constructor(kind: SearchErrorKind, message: string, retryAt?: number) {
    super(message);
    this.kind = kind;
    this.retryAt = retryAt;
  }
}

/** A request: its answer as JSON (or as text, for a page), and the errors every HTTP provider has in common turned into SearchErrors. */
export async function request(ctx: ProviderCtx, name: string, url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<{ data: any; res: Response }> {
  const signal = AbortSignal.any([ctx.signal, AbortSignal.timeout(init.timeoutMs ?? 30_000)]);
  let res: Response;
  try {
    res = await ctx.fetch(url, { ...init, signal });
  } catch (e) {
    if (ctx.signal.aborted) throw e;
    const why = (e as Error)?.name === 'TimeoutError' ? 'did not answer in time' : `could not be reached (${(e as Error)?.message ?? e})`;
    throw new SearchError('unavailable', `${name} ${why}`);
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (res.status === 429) {
    const after = Number(res.headers.get('retry-after'));
    throw new SearchError('limit', `${name} is limiting requests${after > 0 ? `; it can be asked again in ${after} s` : ''}`, Date.now() + (after > 0 ? after : 60) * 1000);
  }
  if (res.status >= 500) throw new SearchError('unavailable', `${name} had a problem (${res.status})`, Date.now() + 30_000);
  return { data, res };
}

/** A tag-free, entity-free line of text. */
export function plainText(html: string | undefined | null): string {
  // Block tags part words; inline ones (<b>solid</b>-<b>state</b>) do not.
  return String(html ?? '')
    .replace(/<\/?(br|p|div|li|ul|ol|tr|td|th|h[1-6]|blockquote|section|article)\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (all, e: string) => {
      if (e[0] === '#') {
        const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : all;
      }
      return ENTITIES[e.toLowerCase()] ?? all;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', middot: '·', copy: '©', reg: '®', trade: '™' };

/** YYYY-MM-DD from a date or date-time ("2024-05-02T10:00:00Z"), when it is one. */
export function isoDay(v: unknown): string | undefined {
  if (typeof v !== 'string' || !v) return undefined;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(v);
  if (m) return m[1];
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : undefined;
}

/** Search operators for the providers that take them in the query (sites, sites left out, PDFs). */
export function withOperators(q: SearchQuery): string {
  const parts = [q.text];
  if (q.sites.length) parts.push(q.sites.map((s) => `site:${s}`).join(' OR '));
  for (const s of q.excludeSites) parts.push(`-site:${s}`);
  if (q.fileTypes.length === 1 && q.fileTypes[0] === 'pdf') parts.push('filetype:pdf');
  return parts.join(' ');
}

/** A rough freshness for providers that only know "the past day / week / month / year". */
export function freshness(q: SearchQuery, now = Date.now()): 'day' | 'week' | 'month' | 'year' | null {
  if (!q.from || (q.to && Date.parse(q.to) < now - 2 * 86_400_000)) return null;
  const days = (now - Date.parse(q.from)) / 86_400_000;
  return days <= 1.5 ? 'day' : days <= 8 ? 'week' : days <= 32 ? 'month' : days <= 367 ? 'year' : null;
}

/** The filters a query asks for that a provider with these abilities cannot keep to. */
export function unsupported(q: SearchQuery, caps: SearchCaps, extra: { dates?: boolean } = {}): string[] {
  const out: string[] = [];
  if (q.categories.length && !caps.categories) out.push('categories');
  if ((q.from || q.to) && !(extra.dates ?? caps.dates)) out.push('exact dates');
  if (q.languages.length && !caps.languages) out.push('languages');
  if (q.homepagesOnly && !caps.homepagesOnly) out.push('homepages only');
  if (q.fileTypes.length === 1 && q.fileTypes[0] === 'html' && !caps.fileTypes) out.push('web pages only');
  if (q.snippets === 'filtered' && !caps.filteredSnippets) out.push('filtered snippets (these are plain ones)');
  return out;
}
