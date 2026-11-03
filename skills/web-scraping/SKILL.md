---
name: web-scraping
description: Use when collecting structured data from websites (listings, tables, prices, a catalogue, many pages) into CSV or JSON, or writing a scraper or crawler. Not for reading a page or two (read_page) or a page that will not load (blocked-pages).
category: research
triggers: [scrape, scraping, scraper, web scrap*, crawl the, crawler, beautifulsoup, robots.txt, every product page, all the listings, data from the website]
---

# Web scraping

Getting structured data out of websites, politely and reliably: look for an official route first,
read the site's rules, fetch slowly with a cache, parse into a clean table, and check the data
before you hand it over. A scraper that hammers a site, or quietly returns half the rows, does more
harm than no scraper.

## 1. Look for a better route first

- An official API (look for "developers" or "API" on the site), a bulk download, an open-data portal,
  a published CSV: `web_search` with `categories: ["data"]` finds datasets.
- RSS or Atom feeds, and sitemaps (`/sitemap.xml`, listed in `/robots.txt`) for lists of pages.
- Data already in the page: `<script type="application/ld+json">` blocks (products, recipes,
  events, articles), `__NEXT_DATA__` in Next.js sites, or the JSON the page fetches (open the page in
  a browser and watch its network requests). JSON is cleaner, lighter and steadier than HTML.
- Wikipedia and Wikidata for general facts.

## 2. Check the rules

- **robots.txt** says which paths automated clients may fetch and sometimes how slowly
  (`Crawl-delay`). Follow it; the script below does.
- **Terms of service**: some sites forbid automated collection, or reuse of their data. Pages behind
  a login are off limits unless the site allows it and the user decides, with their own account.
- **Personal data**: do not collect names, emails, phone numbers, photos or profiles of people
  without a clear purpose the user has stated and a lawful basis (GDPR and similar laws apply to
  public pages too). Collect the minimum, never build lists of people, and keep it secure.
- **Copyright**: facts are free to use; articles, photos and curated databases may not be. Store
  what the task needs and keep the source link.
- When the rules say no, that is the answer: tell the user and offer the alternatives from step 1.

## 3. Pick the tool by size and page type

Is the data in the HTML? `read_page` or `curl` shows it: then the page is static. If the text you
need is missing, the page builds it with JavaScript.

| How many pages | Static HTML | Built with JavaScript |
| --- | --- | --- |
| A few | `read_page` (with a `question`) | `browser_open`, then `browser_read` (kind `extract` with a `schema`) |
| Dozens to thousands | Python: fetch politely, parse with BeautifulSoup | The JSON endpoint the page calls; else Playwright |

## 4. Fetch politely

- Name yourself: a `User-Agent` with the project and a real contact the user agrees to.
- One request at a time per site, a few seconds apart (longer if `Crawl-delay` says so); big jobs
  at quiet hours.
- Retry 429 and 5xx answers with growing pauses, honouring `Retry-After`; stop on repeated 403 (you
  are blocked: do not evade it with proxies, rotating addresses, fake browsers or captcha services).
- Keep every page in a cache on disk and parse from the cache, so fixing the parser costs the site
  nothing.

`scripts/polite_fetch.py` (in this skill's folder) does all of that with Python's standard library:

```bash
python3 <this folder>/scripts/polite_fetch.py --ua "PriceSurvey/1.0 (+mailto:<contact>)" --delay 3 \
  --cache .scrape-cache --urls pages.txt > fetched.jsonl
```

It prints one JSON line per address (`status`, `file` with the saved page, `note` for anything
skipped, such as "disallowed by robots.txt"). Run it again and cached pages are not fetched again.

## 5. Find every page

- Follow the "next" link, page numbers (`?page=2`), offset and limit, or cursors in JSON answers;
  stop when a page brings nothing new, and always set a maximum.
- Infinite scroll is a JSON endpoint underneath: call it directly.
- Sitemaps list every product or article page; filter them by path.
- Remove duplicates by the item's ID or address as you go.

## 6. Parse

- BeautifulSoup with CSS selectors (`soup.select("article.product")`); prefer stable hooks (ids,
  `data-*` attributes, `itemprop`, JSON-LD) over positions (`div:nth-child(3)`).
- HTML tables: `pandas.read_html`.
- JavaScript pages: Playwright's `page.wait_for_selector(...)`, then read the elements; or catch the
  JSON the page loads with `page.expect_response(...)`.
- Clean as you go: numbers as numbers (strip currency signs; mind "1.234,56" in many countries),
  dates as ISO 8601 (`2026-11-03`), units in the column name, trimmed text, absolute links
  (`urljoin`), and the source address and date on every row.

Tested examples (requests with retries, a JSON API, Playwright, JSON-LD) are in
`references/examples.md`.

## 7. Save and check the data

- CSV (UTF-8, header row) for flat tables, JSON Lines for nested data, or `save_sheet` for the user
  to browse and sort.
- Check before you report:
  - the count matches what the site says ("1,240 results") or the pages you fetched;
  - no duplicate rows; no column unexpectedly empty (count blanks per column);
  - values in sensible ranges (prices above zero, dates in the right years);
  - three to five rows compared by eye with the live pages;
  - pages that failed are listed, and fetched again or reported.
- Report the source, the date collected, the row count, what was skipped and why.
- A recurring scrape (`schedule_task`) only with the user's agreement, at a gentle pace, comparing
  each run with the last so a silent breakage shows. To be told when one page changes (a price,
  stock, a new release), follow the watch-and-alert skill instead.

## Pitfalls

- Scraping what an API or a download already offers.
- Developing the parser against the live site, page after page, instead of the cache.
- A block page or an empty template parsed as "0 items" and reported as a result.
- Selectors tied to the layout that break silently on the next redesign: check the counts each run.
- Collecting personal data because it was there.
