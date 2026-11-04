# Technical SEO in more depth

Open this when the page check or Search Console shows a technical problem, or when a site is being
built, moved or relaunched.

## How a page gets into results

1. **Discovered:** a search engine learns the address from a link, a sitemap or a submission.
2. **Crawled:** its crawler fetches the page, if robots.txt allows it.
3. **Indexed:** the page is stored and can be shown, unless it says `noindex`, is a duplicate of
   another page, or is judged not worth keeping.
4. **Shown:** for a search, the indexed pages compete; the page appears only when it fits the search
   better than others.

A page that answers HTTP 200 has passed none of these yet. Search Console's URL Inspection says, for
one address, whether Google indexed it, which canonical it chose, and how it last crawled it; "Test
live URL" shows the page as Googlebot sees it now, and "Request indexing" asks for a fresh crawl.

## Search Console's Pages report: why pages are not indexed

| Reason | Meaning | What to do |
| --- | --- | --- |
| Excluded by "noindex" tag | The page asks not to be indexed | Remove the noindex if it should be found |
| Blocked by robots.txt | The crawler may not fetch it | Change robots.txt if it should be found |
| Not found (404) | The address does not exist | Fine for deleted pages; redirect moved ones; fix links pointing there |
| Soft 404 | The page looks empty or like an error, but answers 200 | Give it real content, or answer 404 or 410 |
| Page with redirect | The address redirects | Fine; link to the final address |
| Alternate page with proper canonical tag | A copy pointing to its main version | Fine |
| Duplicate without user-selected canonical | Google sees copies and picked one | Add a canonical to the version you want |
| Duplicate, Google chose different canonical than user | Google disagrees with your canonical | Make the copies really the same, or really different; check internal links point to the main one |
| Crawled, currently not indexed | Fetched but not kept (thin, duplicate, low value) | Improve or merge the page; it is a quality question, not a technical one |
| Discovered, currently not indexed | Known but not fetched yet | Link to it from important pages, keep it in the sitemap, be patient |
| Server error (5xx) | The site failed when Google came | Check hosting, plugins, firewall rules that block bots |

After fixing, "Validate fix" in the report asks Google to check again; it can take days to weeks.

## robots.txt

- It lives at the root of each host (`https://www.example.com/robots.txt`); `example.com`,
  `www.example.com` and `shop.example.com` each need their own.
- It controls crawling, not indexing. A blocked page can still be listed (as a bare address) when other
  pages link to it. To keep a page out of results, let it be crawled and give it `noindex`.
- Groups start with `User-agent:` lines; a crawler follows only the group with its own name and then
  ignores the `*` group completely. Rules that should apply to every crawler must be repeated in each
  named group.
- Within a group, the longest matching rule wins; on a tie, `Allow` wins. `*` matches anything and `$`
  marks the end of the address: `Disallow: /*.pdf$` blocks PDF files.
- Never block the CSS, JavaScript and images that pages need to display.
- If robots.txt answers with a server error (5xx), Google stops crawling the site for a while; a
  missing file (404) means everything may be crawled.
- Search Console's robots.txt report (under Settings) shows the version Google last fetched.

## Sitemaps

- Most platforms make one: WordPress (`/wp-sitemap.xml`, or `/sitemap_index.xml` with Yoast or Rank
  Math), Shopify, Wix and Squarespace (`/sitemap.xml`), Ghost (`/sitemap.xml`, split by type).
- It should list only pages meant to be found: canonical addresses, answering 200, without noindex.
- `lastmod` dates must be real changes, not the time the sitemap was made.
- Submit it in Search Console (Indexing → Sitemaps) and Bing Webmaster Tools, and add a line to
  robots.txt: `Sitemap: https://www.example.com/sitemap.xml`.
- Bing and some other engines also accept IndexNow pings for changed pages (some platforms and plugins
  send them); Google does not use IndexNow.

## Canonical addresses and duplicates

- The same page often answers at several addresses: http and https, with and without `www`, with and
  without a trailing slash, with `?utm_source=` or sorting parameters, printer versions.
- Choose one, redirect the others to it where you can (301), and give every page a
  `<link rel="canonical" href="…">` to its chosen address (a page points to itself).
- Link internally only to the chosen addresses, and list only them in the sitemap.
- A canonical is a strong hint, not an order: Google may pick another when the signals disagree.

## Redirects and moves

- Permanent moves: 301 (or 308). Temporary: 302 (or 307). Redirect each old address to its
  closest new page, not everything to the home page.
- Avoid chains (A to B to C): point A straight at C.
- Moving to a new domain: redirect every old address, keep the redirects for at least a year, and use
  Search Console's Change of Address tool.
- Before a relaunch, list the old addresses (the sitemap, Search Console's top pages) and map each one.

## HTTPS

- A valid certificate (most hosts give one free through Let's Encrypt); renew it automatically.
- http:// redirects permanently to https://; no "mixed content" (images or scripts loaded over http on
  an https page: the browser's console lists them).

## Speed and phones

- Google's Core Web Vitals, measured on real visits: Largest Contentful Paint (loading) at most
  2.5 s, Interaction to Next Paint (responding) at most 200 ms, Cumulative Layout Shift (things
  jumping) at most 0.1. Search Console's Core Web Vitals report and PageSpeed Insights show them.
- Usual fixes: compress and resize images, lazy-load images below the fold, fewer plugins, fonts and
  third-party scripts (chat widgets, trackers), caching or a CDN, width and height on images.
- Google indexes the phone version of a page. It needs `<meta name="viewport"
  content="width=device-width, initial-scale=1">`, readable text without zooming, buttons that are
  easy to tap, and the same content as on desktop.

## JavaScript-built pages

- Google renders JavaScript, sometimes later than it crawls. Many other crawlers, AI ones included,
  read only the HTML the server sends.
- If the page check finds little text but the browser shows a full page, the content is built in the
  browser. Server-side rendering, pre-rendering or a static site generator fixes that; most
  frameworks have an option for it.
- Links must be real `<a href="…">` links; content that appears only after a click or a scroll may
  not be seen.

## Languages and countries

- One address per language version (`/fr/`, `/de/`), never switched automatically by IP alone.
- `hreflang` links tell search engines which version suits which language or country; each version
  lists all the others and itself.

## Platform notes

Menus move between versions: if a path below has changed, look in the platform's help.

- **WordPress:** Settings → Reading, "Discourage search engines from indexing this site" must be
  unticked once live. An SEO plugin (Yoast or Rank Math) handles titles, descriptions, canonicals,
  sitemaps and basic structured data; use one, not two.
- **Shopify:** each product, collection and page has a search engine listing section for its title,
  description and address; the sitemap and canonicals are automatic; robots.txt is edited through the
  `robots.txt.liquid` theme template.
- **Wix and Squarespace:** titles, descriptions and indexing switches are in each page's SEO settings,
  and the site's SEO panel; a page can be hidden from search engines there.
- **Ghost:** each post's settings have meta data and social card fields; the sitemap is automatic;
  code injection adds extra markup to one post or the whole site.
