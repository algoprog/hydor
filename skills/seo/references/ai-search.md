# AI answers: crawlers, robots.txt and measuring

Open this when deciding which AI crawlers may visit a site, writing the robots.txt rules, or measuring
whether AI assistants mention the business.

## How AI answers pick their sources

AI assistants that search the web run one or more searches for the question, read some of the
results, write an answer and link a few of the pages they used. So the basics decide most of it: the
page has to be in the index the assistant searches (Google's for AI Overviews and AI Mode, Bing's for
Copilot, the companies' own for ChatGPT, Claude and Perplexity), it has to be readable without
JavaScript, and it has to answer the question plainly. Nobody outside these companies controls which
pages are chosen, and the same question can get different answers each time.

## The crawlers, by purpose

Each company publishes its crawlers' names; check its page when this matters, as names get added.

| Company | Search (appear in answers) | Training (future models) | Fetches when a user asks |
| --- | --- | --- | --- |
| Google | `Googlebot` (Search, AI Overviews and AI Mode alike) | `Google-Extended` (a robots.txt name only: Gemini training and grounding; no effect on Search) | |
| Microsoft | `Bingbot` (Bing and Copilot) | | |
| OpenAI | `OAI-SearchBot` (ChatGPT search) | `GPTBot` | `ChatGPT-User` (OpenAI says robots.txt may not apply) |
| Anthropic | `Claude-SearchBot` | `ClaudeBot` | `Claude-User` |
| Perplexity | `PerplexityBot` | (says its crawlers collect nothing for training) | `Perplexity-User` (generally ignores robots.txt) |
| Apple | `Applebot` (Siri, Spotlight) | `Applebot-Extended` (a robots.txt name only) | |
| Common Crawl | | `CCBot` (a public crawl many models are trained on) | |
| Meta | | `Meta-ExternalAgent` | |

- Blocking a search crawler keeps the site out of that assistant's answers.
- Blocking a training crawler keeps future content out of that company's training; it does not take
  the site out of search, and it does not remove what was collected before.
- To keep text out of Google's AI Overviews while staying in Google Search, the controls are
  `nosnippet`, `data-nosnippet` or `max-snippet`, which also limit the normal result's snippet.

## robots.txt recipes

A crawler that has its own group ignores the `*` group completely, so rules every crawler should
follow (keeping out of `/cart/` or `/admin/`) must be repeated in each named group that allows access.
Keep the site's existing rules; add to them.

**Stay in search everywhere, keep content out of AI training** (a common choice):

```
User-agent: GPTBot
User-agent: ClaudeBot
User-agent: Google-Extended
User-agent: Applebot-Extended
User-agent: CCBot
User-agent: Meta-ExternalAgent
Disallow: /

User-agent: *
Disallow: /cart/
Disallow: /admin/

Sitemap: https://www.example.com/sitemap.xml
```

`Google-Extended` also decides whether the Gemini app may ground its answers in the site's pages:
leave it out of the blocked group if being cited there matters more than staying out of Gemini's
training. Google Search, AI Overviews and AI Mode are not affected either way.

**Allow everything:** no robots.txt at all, or `User-agent: *` with an empty `Disallow:`, plus the
`Sitemap:` line.

**Keep out of one assistant's answers too** (rarely wise for a business that wants customers): add
its search crawler (`OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot`) to the blocked group.

Then:

1. Test the draft against the important pages before publishing it:
   `python3 scripts/page_check.py https://www.example.com/page --robots draft-robots.txt`.
2. Publish it at the root of every host the site uses (`www.` and without, shop subdomains).
3. Run the page check on the live site and read the crawler table. Companies take up to a day or so
   to notice a change.

## When robots.txt is not the whole story

- **CDNs and hosts:** Cloudflare and other services have their own AI crawler settings (block AI
  bots, block training, a managed robots.txt that they write for the site) and these can block
  crawlers whatever the site's own file says. If an allowed crawler is still kept out, look at the
  host's or CDN's bot settings and firewall rules, and read the live `/robots.txt`, not the file you
  uploaded.
- **Security plugins and firewalls** can block unknown bots, AI search crawlers included.
- **Logs:** the server's or CDN's logs show which crawlers really came and what they got (status
  codes). User-agent names can be faked; the companies publish IP ranges to check against.

## llms.txt

A community proposal for a short Markdown file at `/llms.txt` that lists a site's most useful pages
for AI tools. Google says its Search, AI Overviews and AI Mode do not use it; no major assistant has
said it relies on it. It does no harm and can help tools that read documentation sites, but it is not
a ranking or citation lever. If one is published, keep it short, accurate and up to date.

## Measuring AI visibility

- **Question list:** 10 to 20 questions customers really ask, in their words ("best plumber in Leeds
  for a boiler repair", "is stoneware dishwasher safe"), fixed so months can be compared, including a
  few where the business is not expected to appear.
- **Monthly check:** ask each assistant the same questions (logged out or in a private window where
  possible; note the country), and record for each: date, assistant, question, whether the business
  is mentioned, whether it is linked, which page, whether what is said is correct, and which
  competitors appear. A mention is not a link, and a link is not a visit.
- **Read the cited pages:** an answer can cite a page for something the page does not say. Wrong
  facts usually come from somewhere: an old directory listing, an outdated page, a review site; fix
  the source.
- **Data from the companies:** Bing Webmaster Tools' AI Performance report (citations in Copilot and
  Bing's AI answers, with the queries behind them); Search Console counts AI Overviews and AI Mode
  within its Performance report. ChatGPT, Claude and Perplexity give ordinary site owners no such
  report.
- **Visits:** analytics referrals from chatgpt.com, perplexity.ai, claude.ai, copilot.microsoft.com
  and gemini.google.com; some arrive without a referrer and show as direct.
- **Variation:** answers change between runs, days, places and accounts. Look at the pattern over
  months, not one answer; and a change after an edit is not proof the edit caused it.

## Claims to correct

| Claim | What is true |
| --- | --- |
| "Add llms.txt to appear in AI answers" | Google ignores it; others have not said they use it |
| "FAQ schema gets you cited" | No markup guarantees citations; Google dropped FAQ rich results |
| "AI needs short paragraphs, chunked content, exact-question headings" | Google says no special formatting is needed; clear writing helps people and machines alike |
| "Allow every bot and you will be cited" | Access makes a page eligible, nothing more |
| "Make a page for every way of asking" | Near-duplicate pages break spam policies and help no one |
| "We guarantee first place on Google / in ChatGPT" | No one can; treat it as a warning sign |
