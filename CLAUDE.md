# Notes for agents working on Naget Agent

## Releases: every version has its release notes

Each version has notes in `CHANGELOG.md`, newest first, and the app shows them (Settings → General →
Release notes, the search box, and a "What's new" note once after an update). When you make a new version:

1. Set it in `package.json` and both places at the top of `package-lock.json`.
2. Add its section at the top of `CHANGELOG.md`: a `## x.y.z · D Month YYYY` heading, one line that sums
   the version up, then bullets in plain words on what changed for the people using it (not file names).
   Write them from the commits since the last version (`git log --oneline <last release>..HEAD`).
3. Commit it as `x.y.z: what it brings` (the repository's release commits look like that).

`server/releases/releases-test.ts` fails while the version in `package.json` has no notes at the top.

## Docs: every place that describes a feature changes with it

The app's features are described in several places, and people and agents rely on each. Whenever you add, change,
rename or remove something users can see or do (a page, a button, a setting or an option in one, a menu item, an
`/api/` route, a tool agents get, a behaviour), update all of these in the same commit:

1. **The guide**, `docs/guide/NN-<topic>.md`: the app's Help page shows it, the search box (Ctrl+K) finds its
   sections, and agents read it (`app_guide`) to answer questions about the app and to know how to change it for
   the user. Change the section that describes the feature, and its topic's "Ask an agent" examples. A Settings
   section or option also goes in `docs/guide/30-settings.md` (made from `shared/find-catalog.ts`: keep the two
   alike). An `/api/` route goes in `docs/guide/90-api.md`, one bullet in its area:
   `` - `METHOD /api/path/:param` — what it does. Body: `{ field: type — meaning }`. Returns: `{ … }`. `` (routes
   agents must not use are listed in `server/guide/api.ts` RULES, which refuses them, and in the test's
   `UNDOCUMENTED`). Write as the guide does: plain words for people who are not programmers, second person, the
   UI's own labels in bold with arrows (**Settings → Capabilities → Memory**), links to the place
   (`/settings?s=<section>&find=<option>`, `/guide/<topic>#<section>`), no source file names.
2. **The GitHub docs**: `README.md` (what the app is and does) and `docs/features.md` (everything, by area), plus the
   ones the change touches: `docs/install.md`, `docs/configuration.md`, `docs/how-it-works.md`, `docs/machines.md`,
   `docs/remote-access.md`, `docs/search-providers.md`, `docs/development.md`.
3. **What agents are told**: a capability's `spawn` instructions and its tools' descriptions are all an agent knows
   of it; keep them saying what the app does now.
4. **The search box and translations**: `shared/find-catalog.ts` and the shipped vectors (below; the guide's sections
   are searchable too, so a changed section needs `npm run find:vectors`), and new UI text in `web/src/i18n`
   (`npm run i18n:extract`, then translate it into Chinese and Greek).
5. **Release notes** in `CHANGELOG.md` when you make a version (above).

`server/guide/guide-test.ts` fails when a guide link points nowhere, a Settings section is not named in the guide,
or an `/api/` route is missing from `docs/guide/90-api.md`:

```bash
OUTDIR=dist/dev node scripts/build-server.mjs server/guide/guide-test.ts && DATA_DIR=/tmp/naget-test-guide node dist/dev/guide-test.js
```

## Search embeddings: keep the shipped vectors current

The search box (Ctrl+K) and memory find things by meaning with an embedding model that runs on the user's
own computer (`server/memory/embed.ts`). Users never compute vectors for what ships with the app: those are
made ahead of time and committed in `server/find/shipped-vectors.json`. Whatever users make themselves
(sessions, memory notes, apps, scheduled tasks, assistants, learned skills, pages, connected apps) gets its
vector on their machine the moment it is made or changed (`server/find/index.ts`, `server/memory/`); that
needs nothing from you.

So whenever you add, rename or reword anything users can search for that comes with the app, make the
vectors again before you commit:

- a page, an action, a Settings section or an option in one, or a built-in theme: update
  `shared/find-catalog.ts` first (its labels must say exactly what the page shows: the search box points at
  an option by its words);
- an app template (`server/apps/templates.ts`), a built-in assistant (`server/assistants/builtins.ts`) or a
  bundled skill (`skills/`);
- the embedding model or its codebook (`server/memory/codebook.ts`): then every vector is made again.

```bash
npm run find:vectors   # embeds only the texts without a vector yet, on the CPU; commit shipped-vectors.json
```

It needs a Python with PyTorch and Transformers 5.6+: the app's own one once search by meaning is turned on
in Settings → Memory, or `NAGET_EMBED_PYTHON=/path/to/python`. `server/find/find-test.ts` fails while a
shipped text has no vector, or the catalog no longer matches the Settings pages:

```bash
OUTDIR=dist/dev node scripts/build-server.mjs server/find/find-test.ts && DATA_DIR=/tmp/naget-test-find node dist/dev/find-test.js
```
