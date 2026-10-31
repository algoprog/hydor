// DuckDuckGo, through the simple HTML page it keeps for browsers without JavaScript: no key, about
// 10 results a page, and now and then it asks to prove the visitor is not a bot. A last resort.
import { freshness, plainText, request, SearchError, unsupported, withOperators, type SearchProvider, type SearchResult } from './types.ts';

const PAGE = 'https://html.duckduckgo.com/html/';
const UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0';

const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(tag)?.[1];

/** The page a result links to: DuckDuckGo sometimes wraps it in a redirect of its own (…/l/?uddg=…). */
function target(href: string): string | null {
  const h = plainText(href);
  if (/duckduckgo\.com\/l\/\?/.test(h)) {
    const u = new URL(h.startsWith('//') ? `https:${h}` : h).searchParams.get('uddg');
    return u && /^https?:\/\//.test(u) ? u : null;
  }
  // Ads go through duckduckgo.com/y.js.
  return /^https?:\/\//.test(h) && !/^https?:\/\/(\w+\.)?duckduckgo\.com\//.test(h) ? h : null;
}

/** The results of one page, and the form that asks for the next (when there is one). */
export function parseDuckDuckGo(html: string): { results: SearchResult[]; next: Record<string, string> | null } {
  const results: SearchResult[] = [];
  // Each result is a <div class="result …">; ads have result--ad.
  for (const chunk of html.split(/<div class="result(?=[ "])/).slice(1)) {
    if (/^[^>]*result--ad/.test(chunk)) continue;
    const a = /<a\b([^>]*\bclass="[^"]*\bresult__a\b[^"]*"[^>]*)>([\s\S]*?)<\/a>/i.exec(chunk);
    const url = a ? target(attr(a[1], 'href') ?? '') : null;
    if (!a || !url) continue;
    const snip = /<(a|div|td)\b[^>]*\bclass="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/\1>/i.exec(chunk);
    results.push({ title: plainText(a[2]) || url, url, snippet: plainText(snip?.[2]) });
  }
  let next: Record<string, string> | null = null;
  for (const form of html.match(/<form\b[\s\S]*?<\/form>/gi) ?? []) {
    if (!/value="Next"/i.test(form)) continue;
    next = {};
    for (const input of form.match(/<input\b[^>]*>/gi) ?? []) {
      const name = attr(input, 'name');
      if (name && /type="hidden"/i.test(input)) next[name] = plainText(attr(input, 'value') ?? '');
    }
  }
  return { results, next };
}

export const duckduckgo: SearchProvider = {
  id: 'duckduckgo',
  name: 'DuckDuckGo',
  description: 'DuckDuckGo’s simple page, without a key: a last resort. About 10 results a page, and it may ask to prove this is not a bot.',
  caps: { maxK: 30, sites: true, excludeSites: true, categories: false, dates: true, languages: false, fileTypes: true, homepagesOnly: false, filteredSnippets: false },
  key: 'none',
  enabledByDefault: true,
  async search(q, ctx) {
    const time = freshness(q);
    let form: Record<string, string> | null = { q: withOperators(q), kl: 'wt-wt', ...(time ? { df: time[0] } : {}) };
    const out: SearchResult[] = [];
    const seen = new Set<string>();
    for (let page = 0; form && out.length < q.k && page < 3; page++) {
      const { data, res } = await request(ctx, 'DuckDuckGo', PAGE, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA, referer: 'https://html.duckduckgo.com/' },
        body: new URLSearchParams(form).toString(),
        timeoutMs: 20_000,
      });
      const html = typeof data === 'string' ? data : '';
      if (res.status === 202 || /anomaly-modal|anomaly\.js|bots use DuckDuckGo/i.test(html)) {
        if (out.length) break;
        throw new SearchError('blocked', 'DuckDuckGo asked to prove this is not a bot; it will be asked again in a while', Date.now() + 15 * 60_000);
      }
      if (!res.ok) throw new SearchError('unavailable', `DuckDuckGo answered ${res.status}`, Date.now() + 60_000);
      const p = parseDuckDuckGo(html);
      for (const hit of p.results) {
        if (seen.has(hit.url)) continue;
        seen.add(hit.url);
        out.push(hit);
      }
      form = p.results.length ? p.next : null;
    }
    return { results: out.slice(0, q.k), ignored: unsupported(q, this.caps, { dates: !!time }) };
  },
};
