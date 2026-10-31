// Brave Search: Brave's own independent index, through its Search API. It needs a key (there is a
// free plan); it takes 20 results a request, so a deeper search makes a few.
import { isoDay, plainText, request, SearchError, unsupported, withOperators, type SearchProvider, type SearchQuery, type SearchResult } from './types.ts';

const API = 'https://api.search.brave.com/res/v1/web/search';

/** Brave's own date range: "2024-01-01to2024-06-30". */
function range(q: SearchQuery): string | undefined {
  if (!q.from && !q.to) return undefined;
  return `${q.from ?? '1990-01-01'}to${q.to ?? new Date().toISOString().slice(0, 10)}`;
}

/** Its description, then up to two more snippets it found on the page. */
export function braveResult(r: any): SearchResult | null {
  const url = typeof r?.url === 'string' ? r.url : '';
  if (!/^https?:\/\//.test(url)) return null;
  const extra = Array.isArray(r.extra_snippets) ? r.extra_snippets.slice(0, 2) : [];
  return {
    title: plainText(r.title) || url,
    url,
    snippet: [r.description, ...extra].map(plainText).filter(Boolean).join(' … '),
    date: isoDay(r.page_age),
    language: typeof r.language === 'string' ? r.language : undefined,
  };
}

export const brave: SearchProvider = {
  id: 'brave',
  name: 'Brave Search',
  description: 'Brave’s own independent index, through its Search API. Needs a key; there is a free plan.',
  caps: { maxK: 100, sites: true, excludeSites: true, categories: false, dates: true, languages: true, fileTypes: true, homepagesOnly: false, filteredSnippets: false },
  key: 'required',
  keyUrl: 'https://api-dashboard.search.brave.com',
  enabledByDefault: false,
  async search(q, ctx) {
    if (!ctx.key) throw new SearchError('auth', 'Brave Search needs a key (Settings → Search)');
    const count = Math.min(20, q.k);
    const out: SearchResult[] = [];
    const seen = new Set<string>();
    for (let offset = 0; out.length < q.k && offset <= 9; offset++) {
      const p = new URLSearchParams({ q: withOperators(q), count: String(count), offset: String(offset), extra_snippets: 'true', text_decorations: 'false', safesearch: 'moderate' });
      const f = range(q);
      if (f) p.set('freshness', f);
      if (q.languages[0]) p.set('search_lang', q.languages[0]);
      let answer;
      try {
        answer = await request(ctx, 'Brave Search', `${API}?${p}`, { headers: { accept: 'application/json', 'x-subscription-token': ctx.key }, timeoutMs: 20_000 });
      } catch (e) {
        // A later page over the rate limit: keep what came.
        if (out.length && e instanceof SearchError && e.kind === 'limit') break;
        throw e;
      }
      const { data, res } = answer;
      const detail = String(data?.error?.detail ?? data?.error?.code ?? '');
      if (res.status === 401 || res.status === 403 || /token|subscription/i.test(detail)) throw new SearchError('auth', `Brave Search did not accept the key${detail ? ` (${detail})` : ''}`, Date.now() + 10 * 60_000);
      if (!res.ok) throw new SearchError(res.status === 400 || res.status === 422 ? 'invalid' : 'unavailable', `Brave Search answered ${res.status}${detail ? `: ${detail}` : ''}`);
      const rows: unknown[] = Array.isArray(data?.web?.results) ? data.web.results : [];
      for (const r of rows) {
        const hit = braveResult(r);
        if (!hit || seen.has(hit.url)) continue;
        seen.add(hit.url);
        out.push(hit);
      }
      if (rows.length < count || data?.query?.more_results_available === false) break;
    }
    return { results: out.slice(0, q.k), ignored: unsupported(q, this.caps) };
  },
};
