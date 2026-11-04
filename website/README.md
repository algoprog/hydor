# hydor.app

The website: one page that shows people what Hydor is and gets them to download it. Plain HTML, CSS and
JavaScript with no framework, dark like the app's own dark theme, and nothing that tracks visitors.

- `src/` is the site: `index.html` (the page), `style.css`, `main.js` (the water behind the hero, the scripted demo
  and the small animations), `404.html`, `_headers` (security headers and caching on Cloudflare Pages),
  `robots.txt`, `sitemap.xml`, the fonts (Inter and JetBrains Mono, under the SIL Open Font License, beside their
  licence files) and the pictures in `img/`.
- `build.mjs` copies `src/` to `dist/website`, writes in the version people download (GitHub's latest release)
  with its date and the line that sums it up in `CHANGELOG.md`, hashes the page's inline script for the
  Content-Security-Policy, and adds the app's tour film from `docs/media/hydor-intro.mp4`.
- `docs.mjs` makes the docs (`/docs`) from the repository's Markdown: a page for each topic of the guide
  (`docs/guide`, in Help's groups, with Help's icons and lines from `web/src/features/guide/topics.ts`), for each
  document the README lists, and the release notes (`CHANGELOG.md`). It reads them with the app's own parser
  (`shared/guide.ts`, so a section's address is the app's) and renders them with the app's Markdown renderer. Links
  to places in the app show as their names; links to other topics stay on the site. Nothing of the docs is kept
  here: change the Markdown and build again.
- `search.ts` is the docs' search (the header's Search, Ctrl+K or "/" on any page): Help's own search
  (`web/src/features/guide/search.ts`) over every section, bundled into `docs/search.js` when the site is built.
- `og/og.html` is the picture shown where a link to the site is shared (`src/img/og.jpg`, 1200×630).
- `shots.mjs` lists the site's pictures of the app (below).

## Look at it

```bash
node website/build.mjs --serve 4321   # then open http://localhost:4321
```

The page offers the download that suits the visitor: the Mac app for their Mac's chip, Docker on Windows, the
installer on Linux. Reduced motion in the system's settings turns its animations off.

## Publish it

It runs on Cloudflare Pages (project `hydor`) at https://hydor.app, and at www.hydor.app, which sends people on
to hydor.app:

```bash
CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… node website/build.mjs --deploy
```

The token needs Account · Cloudflare Pages · Edit (and Zone · DNS · Edit on hydor.app to change the domain's
records). Publish it again after each release, so the page names the new version, and after a change to the docs.

## Its pictures

- `img/app-*.webp` are whole windows of the app in its dark theme, all 1280×800 (and a phone's screen), taken from
  the demo copy with made-up data that the guide's screenshot tool runs. `shots.mjs` lists them; take them again
  when the app's look changes (build the app in a worktree first, as `scripts/guide-shots/README.md` says):

  ```bash
  node scripts/guide-shots/run.mjs --root /tmp/guide-shots-app --shots website/shots.mjs --themes dark --out website/src/img
  ```

- `trip-app.webp`, `library-slides.webp` and `tour-poster.webp` are frames of the tour film (its source is in
  `~/naget-video/source/hydor`): the Trip planner's map at 75 s, and the slides in their editor at 90 s (cropped just
  inside the editor's border; the poster is the whole frame).
- `og.jpg`: with the site served as above, copy `og/og.html` into `dist/website`, take a 1200×630 screenshot of
  http://localhost:4321/og.html and save it as `src/img/og.jpg`.
