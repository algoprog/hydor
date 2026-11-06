# Pictures, drawings, plots and videos in the editors, and slides for the web: a plan

*6 November 2026. The owner asked for AI picture making and editing in documents, slides and pages (in the editors
and as tools agents use by themselves while they make content: pictures, backgrounds, icons), with a better, dearer
model for complex pictures and a cheaper one for simple ones; video making; a background remover and an object
eraser; drawings (SVG); plots made by an agent writing code; and slides that are, by default, in a richer format than
PowerPoint's (custom code, interactive parts, quizzes, 3D, effects), saved as one small web page that opens in any
browser, with PowerPoint compatibility as a choice. Several builders work on it at once, each in a worktree and
branch of its own (`mr/<workstream>`, off `mr/int`); the lead merges them, translates, makes the vectors, writes the
guide and the release notes, and ships one release.*

## In short

- **Reuse first.** Pictures, videos and their prices already go through OpenRouter (`server/images`), with a form
  that asks the user once per model in a session; decks, documents and pages already keep pictures by their hash
  (`naget-asset:<sha>`, `server/pages/assets.ts`) and videos as files (`naget-video:<sha>`); the app already sets
  up a private Python on this computer for search by meaning (`server/memory/embed.ts`), and runs one-off model
  questions outside sessions (`server/helper.ts`, `server/oneshot.ts`); pages already run in sandboxed frames
  (`/htmlframe`, `PAGE_CSP`) and load libraries from jsDelivr (`shared/app-media.ts`). Build on these.
- **Two tiers.** Quick (cheap, fast: icons, backgrounds, textures, simple pictures) and Best (scenes, photos,
  words in a picture, diagrams, every change to a picture). Auto picks by what is asked (`shared/image-tier.ts`).
  Settings → Images, video and audio gets the Quick model beside the image model (which becomes Best).
- **Local where it is better.** Background removal and erasing run on this computer when the user sets up the
  picture tools (free, private, exact pixels): a private Python with ONNX Runtime, BiRefNet-lite (MIT) for cutouts and
  LaMa (Apache-2.0) for erasing, downloaded once. **Each model loads only when it is needed and unloads after a few
  idle minutes; the worker quits when idle; nothing loads without enough free memory** (the owner's ask). Without
  them, the same tools go through OpenRouter, priced on screen.
- **The web format is the default for decks** (`Deck.format`: `"web"`, left out = web; `"pptx"` = PowerPoint
  compatible). Its parts and effects run only inside sandboxed frames where they run code; nothing from a deck ever
  becomes markup or script in the app itself.
- **Calm screens.** New things go inside the menus and panels they belong to (Insert, a picture's bar, the
  Inspector), a dialog per tool; no new sidebar entries; menus fit on screen; no fade-ins; both themes; phones get
  sheets. Plain words for people who are not programmers.

## Workstreams

| | What | Owns (writes) | Reads |
|---|---|---|---|
| **A1** | Pictures and drawings, server: Quick/Best tiers and settings, `/api/images/tiers`, `/make`, `/edit`, `/svg`; `generate_image` tiers + see-through fallback; the agent tool `make_svg`; SVG cleaning | `server/images/` (new files: `tiers.ts`, `make.ts`, `svg.ts`, `svg-clean.ts`…; `index.ts` routes and tools), `shared/images.ts` (additions only), `shared/model-picks.ts` | `server/pages/assets.ts`, `server/helper.ts`, `server/oneshot.ts` |
| **A2** | Picture tools on this computer: the Python worker and its set-up, cutouts and erasing (local and through OpenRouter), `/api/images/local*`, `/cutout`, `/erase`; agent tools `remove_background`, `erase_from_image`; plots' runner | `server/images/local.ts`, `server/images/picture_worker.py`, `server/images/cutout.ts`, `server/images/erase.ts` | `server/memory/embed.ts` (copy its pattern, do not import its state) |
| **A3** | Plots and videos for the editors: `/api/plots/make` (a model writes Python, it runs here, errors go back to it), `/api/videos/make` + `/:job`; the agent tool `make_plot` | `server/images/plots.ts`, `server/images/videojobs.ts` | A2's runner for Python (`runPython`, contract below), `server/images/video.ts`, `server/pages/videos.ts` |
| **B** | The editors' AI tools (dialogs) and their use in documents and pages; Settings → Images (Quick model, picture tools) | `web/src/features/images/studio/*` (new), `web/src/features/images/ImagesSettings.tsx`, `web/src/features/pages/docs/*`, `web/src/features/pages/studio/*`, `web/src/features/pages/pictures.ts` | contracts below |
| **C1** | The web format: model, runtime, frames, PowerPoint mapping, the deck as one minified web page | `shared/slides.ts`, `shared/slides-runtime.ts`, `server/pages/slides*.ts`, `server/pages/pptx*.ts`, `server/pages/export.ts`, `server/pages/assets.ts` (3D models), `server/index.ts` (`/partframe` only), `scripts/build-server.mjs` (minified runtime only) | |
| **C2** | The slides editor for the web format, and the AI tools in it | `web/src/features/pages/slides/*` | C1's model and runtime, B's dialogs |
| **Lead** | Contracts, merging, agents' instructions, the guide (3 languages), API topic, features list, README, search catalog and vectors, translations, release notes, release | everything else | |

Builders do not edit: `web/src/i18n/*.json`, `docs/guide/**`, `docs/features.md`, `README.md`, `CHANGELOG.md`,
`package.json`, `package-lock.json`, `shared/find-catalog.ts`, `server/find/shipped-vectors.json`. Write in the
brief's report what the lead must say there (new labels, routes, settings, tools).

## Contracts

These names are fixed so the workstreams fit when merged. Add fields if you need to; do not rename. The types are in
`shared/images.ts` (pictures, drawings, plots, videos), `shared/image-tier.ts` (`tierFor`) and `shared/slides.ts`
(the web format), already on `mr/int`.

### Routes (signed-in app; each answers `{ error }` with a status a person can act on)

- `GET /api/images/tiers` → `TiersInfo` (A1; `local` from A2's `localState()`).
- `PUT /api/images/settings` also takes `quick` (an OpenRouter id, or '' for the app's choice) (A1).
- `POST /api/images/make` `MakeImageAsk` → `MakeImageAnswer` (A1). Pictures kept with `putAsset`; one to four.
- `POST /api/images/edit` `EditImageAsk` → `PictureAnswer` (A1). With a mask the model is shown where to change
  (the picture with the area marked, and told to change only there); a PNG original and PNG answer are put together
  on the server (`server/signatures/png.ts`); otherwise the answer comes back `whole: true` and the editor composites.
- `POST /api/images/svg` `SvgAsk` → `SvgAnswer` (A1). Quick: written by a model (the helper model if the user picked
  one, else Claude's Sonnet through `oneShot`, else Codex); Best: a Recraft vector model through OpenRouter
  (`recraft/recraft-v4.1-vector`, then `-pro-vector`); cleaned by `cleanSvg` (`server/images/svg-clean.ts`): an allow
  list of elements and attributes, no scripts, `on*`, `foreignObject`, `<image>` or `href`s out, no `url(` but `#ids`.
- `GET /api/images/local` → `LocalToolsState`; `POST /api/images/local/setup` starts the set-up (the app asks
  again every second or so while `installing`); `DELETE /api/images/local` removes it (A2). The set-up makes the
  environment (about 120 MB); each model downloads the first time its tool is used (about 220 MB each), its
  progress in `step`.
- `POST /api/images/cutout` `CutoutAsk` → `PictureAnswer` (PNG with see-through parts) (A2).
- `POST /api/images/erase` `EraseAsk` → `PictureAnswer` (A2; cloud answers may be `whole: true`).
- `POST /api/plots/make` `PlotAsk` → `PlotAnswer` (A3).
- `POST /api/videos/make` `MakeVideoAsk` → `VideoJob`; `GET /api/videos/make/:job` → `VideoJob` (A3). Done videos are
  kept as decks' are (`keepVideoFile`-like, in `server/pages/videos.ts`), their first frame a kept picture.

**No OpenRouter key** (the owner's ask, 6 November): a tool that needs a model through OpenRouter asks for the key
when it needs it, and if the user skips, that model does not run. Agents' tools call
`openRouterKey(ctx, { why })` from `server/connections/openrouter-key.ts` (on `mr/int`): it returns the key, or after a
card in the conversation (the key goes from the browser straight to Settings → Models, checked with OpenRouter; never
through the conversation) the key or why there is none; `noKeyText(answer, what)` is what to tell the agent (a normal
answer, not an error: skipping is the user's choice). Where a way without a key exists, take it instead of failing (a
Quick drawing written by a model; the picture tools on this computer). The editors' dialogs, when `TiersInfo.keySet` is
false, show the key field in place (saved with `PUT /api/models` `{ openrouterKey }`, as Settings → Models does) beside
**Skip**, and offer what needs no key.

**Every tool for agents too** (the owner, 6 November): each thing the editors do has an agent's way (generate_image,
make_svg, remove_background, erase_from_image, make_plot, generate_video, save_slides' web format, export_page,
publish_site, app_api for settings and the picture tools' set-up), the tools take pictures already in a deck or
document (`naget-asset:<sha>`) as well as files, and a spawn instruction tells agents to use them unprompted when they
make slides, documents and pages. The editors' own routes are refused to agents (app_api points them to their tools).

**AI when the local tools fall short** (the owner, 6 November): cutouts and erasing take `how: auto | local | ai`; on
auto a cutout whose mask looks poor is redone by an image model, a large area to erase goes to AI fill; the answers
tell agents to look and redo with `how: "ai"` (or generate_image) when it is not right; the editors offer **Do it with
AI instead** under a result made on this computer.

Prices: every route that spends says what it cost (`cost`, US dollars, when OpenRouter says); the dialogs show an
estimate before (`TiersInfo`). Without an OpenRouter key, routes that need one answer 400 with
"Add an OpenRouter key in Settings → Models" (and the dialogs show that with a link, `/settings?s=models`).

### Server functions shared between workstreams

The workstreams reach each other only through `server/images/hooks.ts` (on `mr/int`), so no branch imports a file
another branch is writing:

- A2's `server/images/local.ts` calls `setLocalTools({ state, ready, cutout, erase, runPython })` when it loads
  (`runPython` runs in the picture tools' Python when set up, else a Python on this computer that has matplotlib,
  and throws words a person can act on when there is none).
- A1's `server/images/make.ts` calls `setCloudTools({ edit, cleanSvg })` when it loads (`cleanSvg` lives in
  `server/images/svg-clean.ts`). A2's cloud cutouts and erasing use `cloudTools().edit`; A3 cleans plots' SVG
  with `cloudTools().cleanSvg`.
- `server/images/writer.ts` (on `mr/int`): `writeWith(db, { system, prompt })` and `writerName(db)`: the model that
  writes drawings' SVG (A1) and plots' code (A3).
- A2 and A3 each export a `Feature` of their own (`pictureTools` from `server/images/local.ts`, `plots` from
  `server/images/plots.ts`) and add it to `server/features/index.ts` (one line each); A1 keeps `images`.

### Agents' tools (on each session's own MCP server, while Settings → Images, video and audio has images on)

- `generate_image` gains `detail: "simple" | "complex"` (left out: auto by `tierFor`); a see-through background
  asked of a model that cannot make one goes to the transparent model, else is cut out after (A2) (A1).
- `make_svg` {prompt, kind, colors, detail, name} → a cleaned `.svg` in the session's `images/` folder (A1).
- `remove_background` {path, name} → a PNG cutout in `images/` (A2); `erase_from_image` {path, boxes: [{x, y, w, h}]
  in the picture's pixels, or prompt: what to take away (through OpenRouter)} → a PNG in `images/` (A2).
- `make_plot` {request, data, data_file, code, format, name, interactive} → `images/<name>.svg|png` and
  `<name>.py` (and `<name>.html` when interactive) (A3).

Each tool's description says when to use it and what it costs; the lead adds a spawn instruction to the pages
capability ("when you make slides, documents or pages, illustrate them…") once the tools exist.

### The editors' AI tools (B), as components

From `web/src/features/images/studio/index.ts`:

```ts
// Each opens a dialog (a sheet on phones) and resolves with what was made, or null when closed.
makePicture(o: { kind?: PictureKind; aspect?: string; transparent?: boolean; refs?: string[]; prompt?: string; theme?: { colors: string[] } }): Promise<MadePicture | null>
editPicture(o: { src: string; mode?: 'change' | 'cutout' | 'erase' }): Promise<MadePicture | null>
makeDrawing(o: { kind?: DrawingKind; aspect?: string; colors?: string[] }): Promise<(MadePicture & { svg: string }) | null>
makePlot(o: { data?: string; theme?: PlotAsk['theme']; w?: number; h?: number; interactive?: boolean; code?: string }): Promise<PlotAnswer | null>
makeVideo(o: { aspect?: string; first?: string }): Promise<{ src: string; poster?: string; w?: number; h?: number } | null>
```

They show the price line before anything is spent, the result before it is used, and keep working on a phone.

### The web format (C1, C2)

All types in `shared/slides.ts`: `DeckFormat`, `Deck.format`, `Deck.progress`, part types `code` (both formats),
`html`, `embed`, `quiz`, `score`, `scene3d` (`RICH_TYPES`, web only); `Base.hover`; `TextProps.textFx`, `glass`;
`Bg.fx`, `Bg.video`; `Anim.on: 'tap'` with `trigger`, `loop`, `by`, `ease`; `RICH_ANIM_FX`; `RICH_TRANSITIONS`;
`isWebDeck`, `richFeatures`, `toPowerPoint` (stubs until C1 fills them in).

- `normalizeDeck` keeps the web format's parts and effects only in web decks; given them for a `pptx` deck it turns
  them into PowerPoint's (`toPowerPoint`). An imported `.pptx` is a `pptx` deck; a new deck is a web deck.
- Live parts (`html`, `embed`, `scene3d`) draw in frames: the runtime's `DrawOpts.frame?(html, part)` lets the app
  make the frame (an iframe at `/partframe`, which takes its page by `postMessage`, served with `PAGE_CSP`); without
  it, the runtime makes a sandboxed `srcdoc` frame (a deck's own page). `DrawOpts.live` says whether they run
  (slideshow, the deck's page) or show their poster (thumbnails, prints, the editor until "Run" is pressed).
- 3D draws with three.js from jsDelivr (a pinned version beside Plotly's in `shared/app-media.ts`), inside its frame.
- The deck's own page is one file: its runtime minified (built with esbuild by `scripts/build-server.mjs` and given
  to the server bundle as a constant; `toString()` stays the fallback for tests), its pictures, videos (up to the
  existing limits) and fonts inside it (fonts from `server/pages/fonts.ts`' cache), its HTML and CSS tight. File →
  Download → Web page (.html) and `export_page` html give it; Publish gives its link.
- PowerPoint export of a web deck: each web-only part as a picture (its poster, or taken by the capture browser),
  effects and transitions as their nearest, and a note of what changed (`richFeatures`).

## Order

1. Lead: contracts on `mr/int` (done with this plan).
2. A1, A2, A3, B, C1, C2 start together. A3 waits for A2's `runPython` by writing against the contract (a stub
   until A2's branch is merged). B builds the dialogs against the routes (stubbed by its own small fake server if
   A's routes are not merged yet) and does documents and pages; C2 does the web format's editor first, then puts
   B's dialogs into the slides editor once the lead says they are merged.
3. Lead merges each branch as it is ready (`mr/int`), runs the tests and typecheck, then the guide, translations,
   vectors, release notes; one release.

## More asks the same day, and their workstreams

| | What | Owns |
|---|---|---|
| **D** | **Made by AI from a type**: a gallery of slide (45+), deck (25+), document (40+), document section (15+), page (35+), page block (15+) and spreadsheet (12+) types; pick one, say what it is about if you like, and an agent makes it from what is there (the deck so far, the document); **Turn into…** slides, a document or a page from the Library | `shared/content-types.ts`, `web/src/features/pages/types/*`, `AskPage.tsx`, `parts.tsx` (New page), `Library.tsx` (an item's menu); the editors' entry points after B and C2 are merged |
| **F1** | **The image editor**, opened in a tab of its own inside the app from anywhere (a slide's, a document's or a page's picture, the Library, Files, any picture shown full size): crop, rotate, straighten, adjust, filters, markup, blur areas, the AI tools; saved back where it came from or as a copy; `edit_image` for agents | `shared/mediaedit.ts`, `web/src/features/mediaedit/*` (the tab host), `server/mediaedit/*`, Lightbox, Library and Files entry points |
| **F2** | **The video editor**, in the same tabs: trim, split and cut, speed, crop to a shape, rotate, text and captions, adjust, fades, music, a frame as a picture, GIF; rendered by ffmpeg on the server (a portable ffmpeg from the picture tools when there is none); `edit_video` for agents | `VideoEditor.tsx`, `server/mediaedit/video*.ts`, `server/media/frames.ts` (finding ffmpeg) |
| **E1–E3** (after C1/C2 are merged) | Slides features from PowerPoint, Google Slides, Canva and Keynote: **E1** design ideas, rewriting picked words, translating a deck, animating in one click, an accessibility check; **E2** AI narration and a narrated show, recording a video of the slideshow with camera and voice, a camera bubble, rehearsing with a coach, a phone as the remote; **E3** free photos (Openverse), pictures in shapes and frames, reusing slides of another deck, charts from a Library spreadsheet, my themes and logo, QR codes, trimming videos, an eyedropper | the slides editor, once C2's work is in |
| **G** | **The Apps page, friendlier**: apps pinned to the top (kept for every device), the apps used lately (each once, with Open the result and Run again), one find box over every app, kinds with counts, cards of one shape, a "Start with" row for someone new, calm on phones; `find_apps` lists pinned and recent apps first | `web/src/features/apps/Gallery.tsx` and new files beside it, the pins' routes in `server/apps/` |
| **H** | **Agents can do on every kind of page what people do in its editor**, the agent beside the page (Ask the agent) first: an audit of every editor's actions (`docs/plans/agent-parity.md`), a `page_action` tool for the editors' actions that run only in the browser (animate every slide, fix accessibility, PowerPoint compatible, a theme, reuse slides, update charts from spreadsheets, accept or reject suggestions, sort and filter, turn into another kind…), every route behind an action in the API topic, and the Ask panel's agent told what it can do and given the ids of what was picked | `server/pages/actions.ts`, the save tools' descriptions, `askInstructions`, the Ask scopes' leads |
