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
- `og/og.html` is the picture shown where a link to the site is shared (`src/img/og.jpg`, 1200×630).

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
records). Publish it again after each release, so the page names the new version.

## Its pictures

- `img/app-*.webp` are the app in its dark theme, taken with the guide's screenshot tool from a demo copy with
  made-up data (see `scripts/guide-shots/README.md`):

  ```bash
  node scripts/guide-shots/run.mjs --root /tmp/guide-shots-app --themes dark --out /tmp/site-shots
  ```

  then copy `start`, `sessions`, `web`, `tasks`, `spaces` and `devices` from `/tmp/site-shots` over
  `app-start`, `app-session`, `app-research`, `app-tasks`, `app-projects` and `app-phone`.
- `browser.webp`, `trip-app.webp`, `library-slides.webp`, `around.webp` and `tour-poster.webp` are frames of the
  tour film (`docs/media/hydor-intro.mp4`, at 45, 75, 90, 105 and 90 seconds), cropped to the app.
- `og.jpg`: with the site served as above, copy `og/og.html` into `dist/website`, take a 1200×630 screenshot of
  http://localhost:4321/og.html and save it as `src/img/og.jpg`.
