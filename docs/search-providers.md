# Search providers

How agents search the web, and how to add a search provider in one file. [Back to the README](../README.md).

Every agent the app runs (Claude Code, Codex, Custom and ACP agents) gets two tools on its session's own
MCP server: `web_search` and `read_page`. A search goes to the providers in Settings → Search, in their
order: the first one that is on answers, and when it can't (no key, a limit reached, out of reach, a bot
check), the next one does. One that failed rests until it may be asked again, so every search doesn't
wait on it. The answer tells the agent which provider answered, and which filters it could not keep to.

| Provider | Key | What it keeps a search to |
| --- | --- | --- |
| Naget Search (the default) | none needed: a free daily allowance; a key from naget.com gives more | categories (papers, patents, filings, news, docs…), sites, dates, languages, PDFs, home pages, and the sentences of each page that answer the query |
| SearXNG | none: your instance's address | sites, rough dates (the past day, week, month, year), a language, PDFs |
| Brave Search | needed (there is a free plan) | sites, dates, a language, PDFs |
| DuckDuckGo | none | sites, rough dates, PDFs; a last resort, about 10 results a page |

`read_page` reads a page through the app's safe fetch (public addresses only), in parts when it is
long. Given a question, it returns only the parts of the page that answer it: through Naget Search's
context filter while Naget Search is on, else the paragraphs that share the most words with the
question.

## Adding a provider

A provider is one file in `server/search/` that exports a `SearchProvider` (`server/search/types.ts`),
plus one line in `server/search/providers.ts`. Settings → Search shows it with a switch, its key or
address field and a Test button; `web_search` lists it among the providers; the fallback order includes
it. Nothing else changes.

```ts
// server/search/example.ts
import { isoDay, plainText, request, SearchError, unsupported, withOperators, type SearchProvider, type SearchResult } from './types.ts';

export const example: SearchProvider = {
  id: 'example', // stable: settings and web_search's `provider` argument use it
  name: 'Example Search',
  description: 'One line for Settings: what it is and what it needs.',
  // What it can keep a search to; web_search tells the agent about the rest.
  caps: { maxK: 50, sites: true, excludeSites: true, categories: false, dates: true, languages: true, fileTypes: false, homepagesOnly: false, filteredSnippets: false },
  key: 'required', // or 'optional' (more with one) or 'none'
  keyUrl: 'https://example.com/api-keys',
  // url: { placeholder: 'https://search.example.org', required: true }, // for one the user runs
  enabledByDefault: false, // only providers that need nothing from the user start on
  async search(q, ctx) {
    if (!ctx.key) throw new SearchError('auth', 'Example Search needs a key (Settings → Search)');
    const p = new URLSearchParams({ q: withOperators(q), count: String(Math.min(q.k, 50)) });
    if (q.from) p.set('since', q.from);
    // request() turns a timeout, a 429 (with its Retry-After) and a 5xx into SearchErrors.
    const { data, res } = await request(ctx, 'Example Search', `https://api.example.com/search?${p}`, { headers: { authorization: `Bearer ${ctx.key}` } });
    if (res.status === 401 || res.status === 403) throw new SearchError('auth', 'Example Search did not accept the key', Date.now() + 10 * 60_000);
    if (!res.ok) throw new SearchError('unavailable', `Example Search answered ${res.status}`);
    const results: SearchResult[] = (data?.items ?? []).map((r: any) => ({ title: plainText(r.name), url: String(r.link), snippet: plainText(r.summary), date: isoDay(r.published) }));
    return { results, ignored: unsupported(q, this.caps) };
  },
};
```

```ts
// server/search/providers.ts
export const PROVIDERS: SearchProvider[] = [naget, searxng, brave, example, duckduckgo];
```

What a provider gets and gives:

- **The query** (`SearchQuery`): the words, with `site:` and `filetype:` already read out of them; how
  many results (1 to 100); sites to keep to and to leave out; Naget's category ids; dates as
  `YYYY-MM-DD`; ISO language codes; file types (`html`, `pdf`); home pages only; and which snippets.
  `withOperators(q)` writes sites and PDFs back as operators, for engines that take them in the query.
- **Its settings** (`ProviderCtx`): the key and address from Settings, a signal to stop, and `fetch`
  (the tests pass their own).
- **Results** (`SearchResult`): title, address and snippet; a date, category, file type and language
  when it knows them. The tool numbers them for the agent to cite and marks them as outside data, so a
  provider never adds instructions of its own.
- **Errors** (`SearchError`): `auth` (no key, a key refused), `credits` (an allowance used up), `limit`
  (rate limited), `blocked` (a bot check), `unavailable` (down, out of reach) pass the search on to the
  next provider; give `retryAt` to let it rest until then. `invalid` goes back to the agent instead,
  because its arguments need fixing (an unknown category, say).

## Testing it

Record a real answer (or write one from the provider's documentation) in
`server/search/tests/fixtures/`, and add a test beside the others in
`server/search/tests/search.test.ts` that feeds it through a fake `fetch` and checks the request and the
normalized results. Then:

```bash
node --test server/search/tests/search.test.ts   # providers, fallback order, arguments, formats
node server/search/tests/live.ts                 # a few real calls (Naget Search, DuckDuckGo)
```
