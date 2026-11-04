---
name: seo
description: Use when a website, shop or blog should be found in search engines and AI answers (Google, ChatGPT, Perplexity), such as an SEO check, titles and descriptions, indexing, structured data or AI crawlers. Not for writing the pages (writing).
category: writing
triggers: [seo, search engine optimi*, search console, google rank*, search ranking*, show up on google, page of google, google business profile, meta description*, schema markup, ai overview*, llms.txt]
---

# SEO: found in search and AI answers

People find a site through search engines and, more and more, through AI answers (ChatGPT,
Perplexity, Copilot, Google's AI Overviews and AI Mode), which mostly draw on the same indexes. The
work is the same for both: pages that search engines can reach and index, titles and text that answer
what people actually ask, the same true facts about the business everywhere, and honest measurement.
Nobody can guarantee a ranking or an AI citation: never promise one, and warn against anyone who does.

## 1. Start from the business and its customers

- Get the site's address, what it is (a local shop or service, an online shop, a blog), where its
  customers are, and what it runs on (WordPress, Shopify, Wix, Squarespace, Ghost, hand-made). Fixes
  happen in that platform's settings or SEO plugin (Yoast, Rank Math), not in code nobody can touch.
- Ask for five to ten searches a customer would really type ("plumber in Leeds", "gluten-free
  birthday cake"), and the main competitors. `ask_form` gathers these at once.
- Take a quick look: `web_search` the business name, the main searches with the town, and `site:`
  with the domain (a rough sample of what is indexed, not a count).

## 2. Set up what matters most for a small site

Find out which of these they already have (their own data beats any guess), then set up the rest.

| Do this | Why |
| --- | --- |
| **Google Search Console:** add and verify the site, submit the sitemap | Shows which pages Google indexed and why others are not, and the searches that bring people |
| **Bing Webmaster Tools:** import the site from Search Console | Bing's index feeds Copilot; its AI Performance report shows when Copilot cites the site |
| **Google Business Profile** (local businesses): claim it; exact name, address, phone, hours, categories, photos; reply to reviews | Decides how the business shows in Maps and local results. Apple Business Connect and Bing Places do the same for Apple Maps and Bing |
| **Google Merchant Center** (online shops): connect the product feed (Shopify and WooCommerce have apps for it) | Free product listings in Google's shopping results |
| **The same facts everywhere:** name, address, phone, hours and prices alike on the site, the profiles, directories and social pages | Search engines and AI answers combine them; facts that disagree get the business described wrongly |
| **One page per main thing people look for:** each service, product range or area served, in the customers' words | A page is found for what it is clearly about |

Walk them through each step in their own accounts; act there yourself only through tools they have
connected, and only when they agree.

## 3. Check the technical basics

Run `python3 scripts/page_check.py <address>` on the important pages (home, main services or
categories, a typical article or product). It reports what search engines meet first: status and
redirects, https, noindex, the canonical address, title, description, headings, images without alt
text, the phone viewport, structured data, link previews, how much text the HTML holds, and which
search and AI crawlers robots.txt lets in. Without Python, read the page source and `/robots.txt`
for the same points.

| Finding | What to do |
| --- | --- |
| `noindex` on a page that should be found | Remove it (WordPress: Settings → Reading, untick "Discourage search engines"; or the SEO plugin's page setting) |
| robots.txt blocks Googlebot or Bingbot | Fix the rule; never block the CSS and scripts pages need |
| Canonical points to another address | Point it to the page itself, unless the page is a deliberate copy |
| http:// or another variant does not redirect | One https address per page; permanent (301) redirects from the others |
| An error status, or a chain of redirects | Fix the page, or link straight to the final address |
| Almost no text in the HTML | JavaScript builds the page: see what Google sees with URL Inspection in Search Console; many AI crawlers see nothing |
| Slow, or awkward on a phone | PageSpeed Insights (pagespeed.web.dev) shows what to fix; usually huge images or too many plugins and scripts (the performance and frontend-polish skills help) |

For the whole site, Search Console's **Pages** report says why pages are not indexed. The reasons it
gives, sitemaps, redirects, speed thresholds and platform settings are in `references/technical.md`.

## 4. Titles, descriptions, headings

- **Title:** unique per page; what the page is, in the customers' words, the brand at the end
  ("Emergency plumber in Leeds, 24 hours | Smith Plumbing"). About 50 to 60 characters show in full.
- **Meta description:** one or two sentences, about 150 to 160 characters, saying what the page
  offers. Not a ranking factor, and Google often writes its own, but a good one earns clicks.
- **Headings:** one H1 that says what the page is; H2s for the sections, each saying what follows.
- **Addresses:** short words with hyphens (`/emergency-plumber-leeds`); change a published one only
  with a 301 redirect from the old address.
- **Images:** descriptive file names and alt text; compressed (WebP, most under 200 KB).
- **Internal links:** link related pages with words that say where they lead; every important page
  within a few clicks of the home page.
- Offer two or three versions of a title or description to choose from, in the business's voice.

## 5. Content that answers real questions

- Collect the questions customers really ask: emails, calls, reviews, Search Console's queries,
  "People also ask", forums. One page per distinct need, not one per wording or per town.
- Answer near the top: a direct answer under the heading in a sentence or two, then the details
  (prices, steps, examples, exceptions, what to do next).
- Show real experience: their own photos and examples, real prices, who wrote it and when, sources
  for claims. Update when things change; a new date on old text fools no one.
- Never mass-produce pages to catch searches (written by AI or not), copy text, stuff keywords, buy
  links or post fake reviews: search engines' spam policies can sink the whole site.
- For writing the pages themselves, follow the writing skill.

## 6. Structured data that matches the page

- JSON-LD describes what the page visibly shows: `LocalBusiness` (or a type such as `Restaurant`,
  `Dentist`), `Organization`, `Product` with its `Offer`, `Article`, `BreadcrumbList`, `Event`,
  `Recipe`. Platforms and SEO plugins often add some already: check the page check's list first.
- Every value must be on the page and true: no reviews, prices or questions the page does not show.
- Test with Google's Rich Results Test and the Schema Markup Validator (validator.schema.org).
  Valid markup proves the syntax, not that a rich result or an AI citation will follow. Examples and
  rules are in `references/structured-data.md`.
- Google dropped FAQ rich results in 2026 and HowTo results earlier, and needs no markup for AI
  answers: FAQ markup is not a shortcut.

## 7. AI answers and AI crawlers

- Google's AI Overviews and AI Mode use the normal index: a page must be indexed and allowed a
  snippet; no special file or markup is needed.
- ChatGPT, Claude and Perplexity search with their own crawlers (`OAI-SearchBot`, `Claude-SearchBot`,
  `PerplexityBot`); Copilot uses Bing. Blocking a search crawler keeps the site out of those answers.
- Training crawlers are separate (`GPTBot`, `ClaudeBot`, `CCBot`; `Google-Extended` and
  `Applebot-Extended` are names only robots.txt reads). Blocking them keeps future content out of
  training without leaving search. Blocking Googlebot drops the site from Google and AI Overviews alike.
- Agree with the owner which purposes to allow, write the rules from `references/ai-search.md`, and
  test the draft first: `python3 scripts/page_check.py <address> --robots draft.txt`.
- A host, CDN or security plugin (Cloudflare's AI crawler settings, for one) can block crawlers
  whatever robots.txt says, and some rewrite robots.txt: look there when an allowed crawler is kept out.
- Myths to correct: `llms.txt` is an optional proposal that Google says it does not use; FAQ markup,
  short paragraphs, "AI-optimised" rewrites and allowing every bot guarantee nothing.

## 8. Measure honestly

- Search Console's **Performance** report (AI Overviews and AI Mode are counted in it, not split
  out): clicks, impressions, position, and the queries and pages behind them. Compare like with like
  (28 days with the 28 before, or the same months last year for a seasonal trade); changes take weeks.
- Bing Webmaster Tools: search performance, and AI Performance for citations in Copilot.
- Visits from AI assistants show in analytics as referrals from chatgpt.com, perplexity.ai,
  copilot.microsoft.com or gemini.google.com (some arrive as "direct").
- For AI answers, ask each assistant the same 10 to 20 customer questions monthly: is the business
  mentioned, linked, described correctly? Answers vary between runs; a mention is not a link, nor a
  link a visit. Log it with `save_sheet`; `schedule_task` can run the check (details in
  `references/ai-search.md`).
- A rise after a change does not prove the change caused it: seasons, Google updates and
  competitors move too.

## 9. Report and hand over

- Lead with the three to five changes worth most for the effort: what, why, how on their platform,
  and how to check it worked.
- Keep apart what you saw on the site, what you recommend, and what you are guessing.
- Change their site, robots.txt or settings only when they ask; otherwise give the exact text to
  paste. A longer audit fits `save_doc`; a checklist to tick off fits `save_page`.

## Pitfalls

- Promising rankings, traffic or AI citations, or trusting anyone who does.
- Taking a working page (HTTP 200) or valid structured data as proof the page is indexed.
- A test site's noindex, or "Discourage search engines", left on after launch.
- Blocking a page in robots.txt to hide it: it can still be listed; let it be crawled, with noindex.
- Blocking Googlebot or every bot when the aim was to keep content out of AI training.
- Structured data that says what the page does not show.
- Dozens of near-identical pages for every town or wording.
- Changing addresses without redirects.
- Judging from one AI answer, one week of data, or your own search results.
