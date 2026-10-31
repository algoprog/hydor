// Naget Search: Naget's own Web Index (pages, papers, patents, filings, reference records), each
// document with a category, so a search can keep to papers, patents, news or people's home pages.
// No key is needed: anonymous searches draw on a free daily allowance per network, and a key from
// naget.com gives more. Also here: the taxonomy (which categories exist, for the tool's description)
// and the context filter (the sentences of a page that answer a question, for read_page).
import type { NagetCredits } from '../../shared/search.ts';
import { request, isoDay, plainText, SearchError, type ProviderCtx, type SearchProvider, type SearchQuery, type SearchResult } from './types.ts';

export const NAGET_URL = 'https://naget.com';

/** The API's origin from what Settings holds: "https://naget.com", also given as ".../v1/". */
export const nagetBase = (url?: string) => (url?.trim() || NAGET_URL).replace(/\/+$/, '').replace(/\/v1$/, '');

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(+v) ? +v : undefined);
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

/**
 * What is left of the allowance, from an answer's `credits` object. Read loosely: the anonymous
 * allowance is new, so its exact fields may differ from a signed-in account's receipt.
 */
export function readCredits(c: unknown, at = Date.now()): NagetCredits | null {
  if (!c || typeof c !== 'object') return null;
  const o = c as Record<string, any>;
  const free = (o.free_usage ?? o.free ?? o.allowance ?? {}) as Record<string, any>;
  const remaining =
    num(o.remaining) ?? num(o.remaining_credits) ?? num(free.available_credits) ?? num(free.remaining) ?? num(o.free_available_credits) ?? num(o.available_credits) ?? num(o.remaining_balance_credits);
  const limit = num(o.limit) ?? num(o.daily_credits) ?? num(free.daily_credits) ?? num(free.limit) ?? num(o.daily_limit);
  if (remaining === undefined && limit === undefined) return null;
  const resetAt = str(o.reset_at) ?? str(o.resets_at) ?? str(o.quota_reset_at) ?? str(free.reset_at);
  return { remaining, limit, resetAt, at, exhausted: remaining !== undefined && remaining <= 0 };
}

/** One call to Naget's API, its errors in plain words (and whether to stop asking for a while). */
async function call(ctx: ProviderCtx, path: string, body: unknown | null, timeoutMs: number): Promise<any> {
  const headers: Record<string, string> = { accept: 'application/json', 'user-agent': 'Naget Agent' };
  if (body) headers['content-type'] = 'application/json';
  if (ctx.key) headers.authorization = `Bearer ${ctx.key}`;
  const { data, res } = await request(ctx, 'Naget Search', nagetBase(ctx.url) + path, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined, timeoutMs });
  const credits = readCredits(data?.credits);
  if (res.ok) {
    if (credits) ctx.credits?.(credits);
    return data;
  }
  const code = String(data?.error?.code ?? '');
  const message = String(data?.error?.message ?? '').trim();
  if (res.status === 402) {
    const resetAt = credits?.resetAt ?? str(data?.error?.details?.reset_at);
    ctx.credits?.({ ...credits, remaining: 0, resetAt, exhausted: true, at: Date.now() });
    const until = resetAt ? Date.parse(resetAt) : NaN;
    throw new SearchError('credits', `Naget Search’s free allowance for today is used up${ctx.key ? '' : ' (a key from naget.com gives more)'}`, Number.isFinite(until) ? until : Date.now() + 3600_000);
  }
  if (res.status === 401 || res.status === 403) {
    if (!ctx.key) throw new SearchError('auth', 'Naget Search needs a key for now: add one in Settings → Search', Date.now() + 10 * 60_000);
    const why = code === 'early_access_required' ? 'its account has no early access yet' : message || `${res.status}`;
    throw new SearchError('auth', `Naget Search did not accept the key: ${why}`, Date.now() + 10 * 60_000);
  }
  if (res.status === 400 || res.status === 413 || res.status === 422) {
    const e = new SearchError('invalid', `Naget Search: ${message || 'it could not take that request'}`);
    e.code = code;
    throw e;
  }
  throw new SearchError('unavailable', `Naget Search answered ${res.status}${message ? `: ${message}` : ''}`, Date.now() + 30_000);
}

/** Words that state dates, a language, PDFs or home pages: Naget's own reading of the query helps then. */
const STATES = /\b(19|20)\d{2}\b|\b(today|yesterday|recent(ly)?|latest|newest|since|before|after)\b|\b(this|last|past) (day|week|month|year)\b|\bpdfs?\b|\bhome ?pages?\b|\bofficial (web ?)?sites?\b|\bin (english|german|french|spanish|italian|portuguese|dutch|polish|russian|chinese|japanese|korean|arabic|hindi|turkish)\b/i;

function scope(q: SearchQuery): Record<string, unknown> {
  const s: Record<string, unknown> = {};
  if (q.categories.length) s.categories = q.categories;
  if (q.sites.length) s.include_domains = q.sites;
  if (q.excludeSites.length) s.exclude_domains = q.excludeSites;
  if (q.from) s.start_date = q.from;
  if (q.to) s.end_date = q.to;
  if (q.homepagesOnly) s.homepages_only = true;
  if (q.languages.length) s.languages = q.languages;
  if (q.fileTypes.length === 1) s.file_types = q.fileTypes;
  return s;
}

/** The request body for POST /v1/web-index/search. */
export function nagetRequest(q: SearchQuery): Record<string, unknown> {
  const web_index = scope(q);
  const body: Record<string, unknown> = { query: q.text, k: Math.max(1, Math.min(100, q.k)) };
  if (Object.keys(web_index).length) body.web_index = web_index;
  // Without filters of its own, let Naget read the ones the words state ("… from last year", "PDF reports on …").
  else if (STATES.test(q.text)) body.parse_query = true;
  if (q.snippets === 'filtered') body.result_fields = ['filtered_snippet'];
  return body;
}

/** One of Naget's results, normalized. A category comes as "tier2/pubmed": its last part is the id. */
export function nagetResult(r: any): SearchResult | null {
  const url = str(r?.url);
  if (!url) return null;
  const filtered = typeof r.filtered_snippet === 'string' ? r.filtered_snippet.trim() : undefined;
  return {
    title: plainText(r.title) || url,
    url,
    snippet: plainText(r.snippet),
    filtered,
    date: isoDay(r.date),
    category: str(r.category)?.split('/').pop(),
    fileType: r.file_type === 'pdf' || r.file_type === 'html' ? r.file_type : undefined,
    language: str(r.language),
  };
}

export const naget: SearchProvider = {
  id: 'naget',
  name: 'Naget Search',
  description: 'Naget’s own index of the web, papers, patents and filings. Free daily searches without a key; a key gives more.',
  caps: { maxK: 100, sites: true, excludeSites: true, categories: true, dates: true, languages: true, fileTypes: true, homepagesOnly: true, filteredSnippets: true },
  key: 'optional',
  keyUrl: 'https://naget.com',
  url: { placeholder: NAGET_URL, required: false, default: NAGET_URL },
  enabledByDefault: true,
  async search(q, ctx) {
    // Reading each page for filtered snippets takes a while.
    const data = await call(ctx, '/v1/web-index/search', nagetRequest(q), q.snippets === 'filtered' ? 120_000 : 45_000);
    const rows: unknown[] = Array.isArray(data?.data) ? data.data : [];
    return { results: rows.map(nagetResult).filter((r): r is SearchResult => !!r) };
  },
};

// ---- the taxonomy: which categories exist ------------------------------------------------------------

export interface NagetCategory {
  id: string;
  label: string;
  group: 'collection' | 'page_type' | string;
  description?: string;
}

export interface Taxonomy {
  categories: NagetCategory[];
  languages: { id: string; label: string }[];
  /** Read from Naget (else the list below, from its documentation). */
  live: boolean;
  at: number;
}

/** What the API reference lists, for when the taxonomy cannot be read (no key yet, offline). */
export const FALLBACK_TAXONOMY: Taxonomy = {
  live: false,
  at: 0,
  languages: [],
  categories: [
    ['academic', 'Scholarly papers', 'page_type', 'all the scholarly collections: Semantic Scholar, OpenAlex, PubMed, Europe PMC, S2ORC, arXiv, ACL Anthology, DBLP'],
    ['news', 'News', 'page_type'],
    ['docs', 'Documentation', 'page_type'],
    ['howto', 'How-to guides', 'page_type'],
    ['discussion', 'Discussions', 'page_type', 'forums and Q&A, Stack Exchange and Reddit included'],
    ['reference', 'Reference', 'page_type', 'encyclopedias, Wikipedia included'],
    ['data', 'Data', 'page_type', 'datasets'],
    ['article', 'Articles', 'page_type'],
    ['arxiv', 'arXiv', 'collection', 'preprints'],
    ['pubmed', 'PubMed', 'collection', 'biomedical papers'],
    ['europepmc', 'Europe PMC', 'collection'],
    ['semantic-scholar', 'Semantic Scholar', 'collection'],
    ['openalex', 'OpenAlex', 'collection'],
    ['acl-anthology', 'ACL Anthology', 'collection'],
    ['dblp', 'DBLP', 'collection'],
    ['uspto', 'US patents', 'collection'],
    ['sec-filings', 'SEC filings', 'collection', 'company filings'],
    ['wikipedia', 'Wikipedia', 'collection'],
    ['stackexchange', 'Stack Exchange', 'collection'],
    ['reddit', 'Reddit', 'collection'],
    ['wikihow', 'wikiHow', 'collection'],
    ['datasets', 'Datasets', 'collection'],
  ].map(([id, label, group, description]) => ({ id, label, group, description })),
};

export async function fetchTaxonomy(ctx: ProviderCtx): Promise<Taxonomy> {
  const data = await call(ctx, '/v1/web-index/taxonomy', null, 20_000);
  const categories: NagetCategory[] = (Array.isArray(data?.categories) ? data.categories : [])
    .filter((c: any) => str(c?.id))
    .map((c: any) => ({ id: String(c.id), label: str(c.label) ?? String(c.id), group: str(c.group) ?? 'page_type', description: str(c.description) }));
  if (!categories.length) throw new SearchError('unavailable', 'Naget Search sent no categories');
  const languages = (Array.isArray(data?.languages) ? data.languages : []).filter((l: any) => str(l?.id)).map((l: any) => ({ id: String(l.id), label: str(l.label) ?? String(l.id) }));
  return { categories, languages, live: true, at: Date.now() };
}

// ---- the context filter: the parts of a page that answer a question -----------------------------------

export interface Filtered {
  text: string;
  title?: string;
  url?: string;
  inputWords?: number;
  keptWords?: number;
}

/** The sentences of a page (by its address, or its text) that answer `query`. */
export async function contextFilter(ctx: ProviderCtx, body: { query: string; url: string } | { query: string; text: string }): Promise<Filtered> {
  const data = await call(ctx, '/v1/context-filter', body, 90_000);
  return { text: String(data?.filtered_snippet ?? '').trim(), title: str(data?.title), url: str(data?.url), inputWords: num(data?.input_words), keptWords: num(data?.kept_words) };
}
