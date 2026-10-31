# Searching with web_search and read_page

These are the app's own tools (on the naget-agent server). Which filters a provider can keep to
depends on the providers turned on in Settings → Search: the answer says when one was ignored.

## web_search

| Field | Use it for | Example |
| --- | --- | --- |
| `query` | Plain words; `site:`, `-site:` and `filetype:pdf` work inside it too | `"heat pump" noise limits residential` |
| `k` | How many results, up to 100 | `k: 60` for a survey of a field |
| `categories` | Keep to a kind of source | `["academic"]`, `["uspto"]`, `["news"]`, `["sec-filings"]` |
| `sites`, `exclude_sites` | Only, or never, these hosts | `sites: ["who.int"]` |
| `from`, `to` | Dates, `YYYY-MM-DD` | `from: "2025-01-01"` |
| `homepages_only` | A person's own page, an official site | find a researcher's homepage |
| `languages` | ISO codes | `["de"]` for German sources |
| `file_types` | `["pdf"]` for papers, reports, filings | |
| `snippets` | `"filtered"`: the sentences that answer the query | facts from many pages at once |

Patterns that work:

- **A field's papers:** `categories: ["academic"]`, `k: 50`, then narrow `from` to recent years and
  read the most cited or most recent in full.
- **Patents:** `categories: ["uspto"]`, `k: 40`, queries in the patent office's words (what the device
  does, not its brand name).
- **People:** the name with the organisation and field, `homepages_only: true`; then confirm it is
  the same person from two details (employer, topic, location).
- **Official facts:** `sites` set to the authority's domain, then read the page itself.
- **The other side:** a query with the opposing claim, or "criticism of", "problems with".

## read_page

- `url`: the page or PDF.
- `question`: only the parts of the page that answer it come back. Prefer it for long pages.
- `page`: long pages come in parts, 1, 2, 3…

## Without these tools

Use the agent's own search and page fetch the same way: plan the queries, read the key pages in
full, and keep the source notes.
