// SearXNG: a search engine you run yourself (or one you trust), which asks many others at once and
// keeps no record of you. Its JSON answers must be turned on: `json` in `search.formats` of its
// settings.yml. The instance may be on your own network, so its address is not limited to public ones.
import { freshness, isoDay, plainText, request, SearchError, unsupported, withOperators, type SearchProvider, type SearchResult } from './types.ts';

/** Naget's categories that SearXNG has a category of its own for. */
const CATEGORY: Record<string, string> = {
  academic: 'science',
  arxiv: 'science',
  pubmed: 'science',
  europepmc: 'science',
  'semantic-scholar': 'science',
  openalex: 'science',
  'acl-anthology': 'science',
  dblp: 'science',
  news: 'news',
  docs: 'it',
  discussion: 'social media',
  reddit: 'social media',
};

export function searxResult(r: any): SearchResult | null {
  const url = typeof r?.url === 'string' ? r.url : '';
  if (!/^https?:\/\//.test(url)) return null;
  return {
    title: plainText(r.title) || url,
    url,
    snippet: plainText(r.content),
    date: isoDay(r.publishedDate ?? r.pubdate),
    category: typeof r.category === 'string' && r.category !== 'general' ? r.category : undefined,
  };
}

export const searxng: SearchProvider = {
  id: 'searxng',
  name: 'SearXNG',
  description: 'Your own SearXNG instance, which asks many search engines at once and keeps no record of you.',
  caps: { maxK: 100, sites: true, excludeSites: true, categories: false, dates: true, languages: true, fileTypes: true, homepagesOnly: false, filteredSnippets: false },
  key: 'none',
  url: { placeholder: 'https://searx.example.org', required: true },
  enabledByDefault: false,
  async search(q, ctx) {
    if (!ctx.url) throw new SearchError('auth', 'SearXNG needs your instance’s address (Settings → Search)');
    const base = ctx.url.trim().replace(/\/+$/, '').replace(/\/search$/, '');
    const time = freshness(q);
    const cats = [...new Set(q.categories.map((c) => CATEGORY[c]).filter(Boolean))];
    const ignored = unsupported(q, this.caps, { dates: !!time }).filter((w) => !(w === 'categories' && cats.length));
    const out: SearchResult[] = [];
    const seen = new Set<string>();
    // About 10 to 20 results a page.
    for (let page = 1; out.length < q.k && page <= 6; page++) {
      const p = new URLSearchParams({ q: withOperators(q), format: 'json', pageno: String(page) });
      if (time) p.set('time_range', time);
      if (q.languages[0]) p.set('language', q.languages[0]);
      if (cats.length) p.set('categories', cats.join(','));
      const { data, res } = await request(ctx, 'SearXNG', `${base}/search?${p}`, { headers: { accept: 'application/json' } });
      if (res.status === 403) throw new SearchError('blocked', 'SearXNG refused: turn on its JSON answers (add json to search.formats in its settings.yml)', Date.now() + 10 * 60_000);
      if (!res.ok || !data || typeof data !== 'object') throw new SearchError('unavailable', `SearXNG answered ${res.status}${res.ok ? ' with something other than JSON' : ''}`, Date.now() + 60_000);
      let added = 0;
      for (const r of Array.isArray(data.results) ? data.results : []) {
        const hit = searxResult(r);
        if (!hit || seen.has(hit.url)) continue;
        seen.add(hit.url);
        out.push(hit);
        added++;
      }
      if (!added) break;
    }
    return { results: out.slice(0, q.k), ignored };
  },
};
