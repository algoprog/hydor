# hydor.app

The website: one page that shows people what Hydor is and gets them to download it, in eight languages. Plain HTML,
CSS and JavaScript with no framework, dark like the app's own dark theme, and nothing that tracks visitors.

- `src/` is the site: `index.html` (the page), `style.css`, `main.js` (the water behind the hero, the scripted demo
  and the small animations), `404.html`, `_headers` (security headers and caching on Cloudflare Pages),
  `robots.txt`, `sitemap.xml`, the fonts (Inter and JetBrains Mono, under the SIL Open Font License, beside their
  licence files) and the pictures in `img/`.
- `build.mjs` copies `src/` to `dist/website`, writes in the version people download (GitHub's latest release)
  with its date and the line that sums it up in `CHANGELOG.md`, makes every page in each language (below), hashes
  every inline script on every page for the Content-Security-Policy, writes `sitemap.xml` (with each page's
  alternates in the other languages), and adds the app's tour film from `docs/media/hydor-intro.mp4`. Every page asks
  for the pictures and the film with `?v=` and a hash of what they hold: Cloudflare and browsers keep `/img/` and
  `/media/` for a week, so without it a picture taken again under the same name would show the old one until then.
- `i18n.mjs` is the machinery of the languages (below); `i18n/` holds `strings.json` and the translations;
  `i18n-test.mjs` checks them.
- `docs.mjs` makes the docs (`/docs`) from the repository's Markdown: a page for each topic of the guide
  (`docs/guide`, in Help's groups, with Help's icons and lines from `web/src/features/guide/topics.ts`), for each
  document the README lists, and the release notes (`CHANGELOG.md`). It reads them with the app's own parser
  (`shared/guide.ts`, so a section's address is the app's) and renders them with the app's Markdown renderer. Links
  to places in the app show as their names; links to other topics stay on the site. Nothing of the docs is kept
  here: change the Markdown and build again. A guide topic is shown in the language of the visitor from
  `docs/guide/<lang>/`, where that translation is in step with the English topic.
- `blog.mjs` makes the blog (`/blog`) from `blog/posts/*.md` (below).
- `search.ts` is the docs' search (the header's Search, Ctrl+K or "/" on any page): Help's own search
  (`web/src/features/guide/search.ts`) over every section, bundled into `docs/search.js` when the site is built.
- `og/og.html` is the picture shown where a link to the site is shared (`src/img/og.jpg`, 1200×630).
- `shots.mjs` lists the site's pictures of the app (below).

## Look at it

```bash
node website/build.mjs --serve 4321   # then open http://localhost:4321
```

To build somewhere else, so several people can build at once without overwriting each other (`i18n-test.mjs` reads it
too), and to build only part of the site for a quick look:

```bash
HYDOR_SITE_OUT=/tmp/site-mine node website/build.mjs --langs en --posts meet-hydor --drafts --serve 4410
```

`HYDOR_SITE_OUT=<folder>` replaces `dist/website` (it is emptied first, so it refuses folders that are not a build's
own: the repository, your home, `/tmp` itself); `--langs en,de` builds only those languages (the sitemap and the
language checks are then partial); `--posts a,b` only those blog posts; `--drafts` also the blog's drafts. The three
flags are refused with `--deploy`: what is published is all of the site.

The page offers the download that suits the visitor: the Mac app for their Mac's chip, the Windows installer, and on
Linux the .deb (where the browser names Ubuntu or Debian) or else the AppImage, for their processor; Docker, the Linux
server's installer and the cloud services follow. Reduced motion in the system's settings turns its animations off.

## Blog

`/blog/` is the blog: notes on how Hydor works. It is English only, like `/compare`: the other languages' pages link to
it, its pages have no alternates and no language script, and its language menu goes to each language's home page. A post
is `/blog/<slug>`, and `/blog/feed.xml` is an Atom feed (every post with its date, title and description; drafts are
not in it, nor in `sitemap.xml`).

| What | Where |
|---|---|
| The post: front matter, then Markdown | `blog/posts/<slug>.md` |
| A figure: an HTML fragment | `blog/figures/<slug>/<name>.html` |
| The post's own figure styles and code, linked from its page when they exist | `src/blog/<slug>.css`, `src/blog/<slug>.js` |
| The post's pictures (`cover.webp` 1600×900, `og.jpg` 1200×630, anything else it shows) | `src/img/blog/<slug>/` |
| The pages' look, and the pieces every figure shares | `src/blog/blog.css` |
| The figures' runtime, the reading progress, the "On this page" list, the counters | `src/blog/blog.js` |

**Front matter**, between two lines of `---`, one `key: value` a line: `title`, `description` (the line under the title,
the page's description, the card's text and the feed's summary), `date` (`YYYY-MM-DD`), `tags` (comma separated; the
first is in the breadcrumb), `cover` and `coverAlt`, `og` (the social card, else `/img/og.jpg`), and `order` (the
tie-break between posts of one date: lower first). Posts are newest first; the first is the wide one on `/blog/`. A file
name starting with `_` is a draft: built only with `--drafts` (marked noindex, with its own files in `src/blog/` left
out of the build otherwise). `_style-guide.md` is one: every element a post can use, and a small figure. Build it and
look.

**Markdown** is the docs' (GitHub-flavoured, rendered like the guide). Do not write an `#` title: the page has it. `##`
and `###` headings get an address from their words (lower case, letters, digits and hyphens, made unique), and the `##`
ones are the "On this page" list. A picture alone on a line, `![alt](/img/blog/<slug>/x.webp "Caption")`, becomes a
figure with its caption and its size read from the file (WebP, PNG, JPEG or SVG; a missing file stops the build).
Tables scroll on a phone, code blocks have a copy button, and links to other sites open with `rel="noopener"`. Small
inline HTML (`<kbd>`, `<span class="chip">`, `<aside class="callout"><p>…</p></aside>`) is fine. The reading time is the
words outside code, tags and figures over 230 a minute.

**Figures**: a line `<!-- figure: name -->` on its own (blank lines around it) is replaced by
`blog/figures/<slug>/<name>.html`, as it is: never read as Markdown. A figure is `<figure class="fig"
data-fig="<slug>-<name>">…<figcaption>…</figcaption></figure>`. The Content-Security-Policy allows no inline script and no
outside file, so a figure's code goes in the post's `src/blog/<slug>.js` and its styles in `<slug>.css` (every rule
under `[data-fig^="<slug>-"]`). The shared classes are `.fig` (and `.fig.wide`, up to about 1080 px), `.fig-stage`,
`.fig-controls` with `.fig-btn[aria-pressed]`, `.fig-legend`, `.chip` (`--c` is its colour), `.callout`, `.stats` with
`.stat` (`<b data-count-to="10.5" data-suffix="%">10.5%</b>` counts up when first seen), `.sr-only` and `<kbd>`.

**The runtime** (`blog.js`) is `window.HydorBlog`, loaded before the post's script:

```js
HydorBlog.figure('<slug>-<name>', (el, fig) => {
  /* runs once for each [data-fig="<slug>-<name>"], when it is first within 300 px of the screen */
});
```

- `fig.reduced`: the reader asked for reduced motion. Draw the final state, with no motion and no auto-play (buttons
  still work).
- `fig.visible`, `fig.on('show' | 'hide', fn)`: whether it is on screen.
- `fig.wait(ms)`: a Promise that resolves after `ms` of on-screen time; its clock stops while the figure is off screen
  or the tab is hidden.
- `fig.loop((dt, t) => …)`: called on each animation frame while it is on screen (`dt` and `t` in milliseconds);
  returns a function that stops it.
- Every `.fig` gets `is-in` the first time it is on screen and `is-visible` while it is, for CSS entrances. A CSS loop
  pauses with `.fig:not(.is-visible) .x { animation-play-state: paused }`, and stops under
  `@media (prefers-reduced-motion: reduce)`.

Nothing runs or loops off screen, and under reduced motion nothing moves (counters show their value). A post with no
figures needs none of this. Look at a post, on a phone (390 px) and a desktop, with the flags above; a missing figure or
picture stops the build and names the post and the file.

**Pictures** go through the same `?v=` hashes as the rest of the site, in sub-folders too (`img/blog/<slug>/cover.webp`,
in an attribute, in CSS and as `https://hydor.app/…` in `og:image`), so a picture taken again under the same name shows
at once.

## Languages

The site is in the app's eight languages (`LANGS` in `shared/i18n.ts`). English is at `/`, `/docs/…` and `/blog/…`, the others
under their id: `/de/`, `/es/`, `/fr/`, `/pt/` (Brazilian Portuguese), `/el/`, `/ja/`, `/zh/` (Simplified Chinese),
each with the home page, a 404 page (Cloudflare Pages shows the nearest `404.html`, so `/de/nothing` shows
`/de/404.html`) and the docs (`/de/docs/…`). The pages are static: nothing runs on the server.

**What is translated.** The English HTML and JavaScript stay the source: write the site in English, as before.
`node website/build.mjs --extract` reads the pages (`src/index.html`, `src/404.html`), the docs' chrome in
`docs.mjs` and the texts in `src/main.js` and `search.ts`, and writes `i18n/strings.json`: `{ "English text": "English
text" }`, about 370 texts and 3,200 words. A translation is `i18n/<lang>.json`, the same keys with the text in that
language. The build uses what is there and shows English for any text without a translation, so it builds with any
subset (it says how many texts each language has, and when `strings.json` is out of date).

- A block of text (a paragraph, heading, list item, link, button, caption, table cell, `<summary>`…) is one text, and
  its inline elements are numbered placeholders: `Read the <0>guide</0>, press <1>Ctrl K</1>`, `<2/>` for one with no
  words (an icon, `<br>`). The build puts the original elements and their attributes back around the translated
  words, so word order can change. Code, `<kbd>`, `translate="no"` and anything with its own `lang` (the Greek
  word) show their text for the translator to read but stay as they are. A translation that loses or adds a
  placeholder (or a `{name}` or `%VERSION%`) is refused and the English shows; the build lists them.
  In the text outside the tags, `&`, `<` and `>` are written `&amp;`, `&lt;` and `&gt;`.
- Also translated: `<title>`, the meta description, `og:title`, `og:description`, `og:image:alt`, the JSON-LD
  description, and the attributes `title`, `alt`, `aria-label` and `placeholder`.
- `src/main.js` and `search.ts` show words too (the demo, the download notes, "Copied"). They write them as
  `T('text')`, or `TH('text <0>with</0> elements', ['<b>'])` for HTML, with a string in quotes in the call (that is how
  they are found), and the build writes the language's texts into each page as a JSON data block
  (`#hydor-i18n`) that they read. English pages have no block and show the texts as written.
- `docs.mjs` does the same at build time for the docs' navigation, headings, buttons and search box (`T(…)`): the
  texts it asks for are recorded in the English build, which is what `--extract` uses.
- A guide topic's words come from `docs/guide/<lang>/<topic>.md` when that file is in step with the English one
  (`translatedTopic` in `shared/guide.ts`), else from the English topic, in an element with `lang="en"`. Section
  addresses are the English ones in every language. The other documents (Install, release notes…), `/compare` and
  `/blog` are English only: the pages of other languages link to them. Each language's docs have their own search index
  (`/de/docs/search.json`). The release summary written from `CHANGELOG.md` stays English (`lang="en"`) and its date
  is written for the page's language.

**Making and refreshing translations.** After changing the English site, run `node website/build.mjs --extract`, and
translate the texts that are new or changed in each `i18n/<lang>.json` (a key no longer in `strings.json` is just
ignored; a changed English text is a new key). Then `node website/build.mjs` and `node website/i18n-test.mjs`.

**Choosing the language.** Every page has a language menu in the header: native names from `LANGS`, each a link to the same page in
that language (the same docs topic, else that language's home), so it works without script; `main.js` adds
Escape, the arrow keys, Home and End, and saves the choice in `localStorage` (`hydor.lang`). Every English page that has
translated pages starts with a small inline script: a saved language other than English, else the first of
`navigator.languages` whose part before `-` is one of the eight (`pt-PT` is `pt`, `zh-TW` is `zh`), and if that is not
English it goes to the same page under its prefix, with its query and hash (it does nothing if `localStorage` is
blocked). Pages under a prefix never redirect, so a link to `/fr/` always shows French. Every page has `hreflang`
alternates and `x-default` (English), its own canonical address and `og:locale`, and `sitemap.xml` lists them all.

**Fonts.** Inter's Latin and Greek subsets load by `unicode-range`, so Greek pages use the Greek one. Japanese and
Chinese pages name system fonts for their characters (`html:lang(ja)`: Hiragino Sans, Noto Sans JP, Yu Gothic, Meiryo;
`html:lang(zh)`: PingFang SC, Noto Sans SC, Microsoft YaHei) and drop the tight letter-spacing the Latin type uses.

**The header** has more or less room by language: the links (Demo … Docs, Blog) are 419 px wide in Chinese and 741 in
Portuguese. `style.css` ("The header in every language") gives each language two widths: below the first the search box
and GitHub shrink to their icons, below the second the links give way to the menu button. They are measured (the widths of
`.nav-links` and `.nav-end` at 1700 px, plus a little room): when a link is added or a long word comes in, measure again.

**Adding a language** means adding it to `LANGS` in `shared/i18n.ts` (and its tags to `TAGS` and `OG_LOCALES` in
`i18n.mjs`), then translating.

```bash
node website/build.mjs --extract    # write i18n/strings.json
node website/build.mjs              # build dist/website (every language)
node website/i18n-test.mjs          # check the placeholders, the language script, every page's references and alternates
```

## Publish it

It runs on Cloudflare Pages (project `hydor`) at https://hydor.app, and at www.hydor.app, which sends people on
to hydor.app:

```bash
CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… node website/build.mjs --deploy
```

The token needs Account · Cloudflare Pages · Edit (and Zone · DNS · Edit on hydor.app to change the domain's
records). Publish it again after each release, so the page names the new version, and after a change to the docs.

## Its pictures

- `img/app-*.webp`, `trip-app.webp` (the Trip planner's answer in a chat, on its map) and `library-slides.webp` (the
  trip's slides in the Library's editor) are whole windows of the desktop app (with the Browser in the rail) in its dark
  theme, all 1280×800 (and a phone's screen), taken from the demo copy with made-up data that the guide's screenshot
  tool runs. `shots.mjs` lists them; take them again when the app's look changes (build the app in a worktree first, as
  `scripts/guide-shots/README.md` says):

  ```bash
  node scripts/guide-shots/run.mjs --root /tmp/guide-shots-app --shots website/shots.mjs --themes dark --out website/src/img
  ```

- `tour-poster.webp` is a frame of the tour film (its source is in `~/naget-video/source/hydor`), shown before it plays.
- `og.jpg`: with the site served as above, copy `og/og.html` into `dist/website`, take a 1200×630 screenshot of
  http://localhost:4321/og.html and save it as `src/img/og.jpg`.
