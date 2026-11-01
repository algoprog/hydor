# Development

Building and changing Naget Agent. [Back to the README](../README.md).

```bash
npm ci
npm run build:server && npm start   # the server, on :8790
npm run dev:web                     # the web app with hot reload on :5173, proxying /api and /ws to :8790
npm run typecheck
```

`npm run build` builds both into `dist/`. The code:

- `server/`: the HTTP and WebSocket API, the session manager (`sessions.ts`), the agent adapters
  (`agents/`), the transcript parsers (`history/`), the runner (`runner/`) and the indexer (`indexer/`).
- `web/`: the React app (Vite, Tailwind), one folder per area in `web/src/features/`.
- `shared/`: types and helpers used by both.

The app's capabilities (search, the browser, memory, the guide…) each live in `server/<name>/` and
`web/src/features/<name>/`. Each capability's tests are a script beside it (`*-test.ts`), built and run with a
scratch data folder:

```bash
OUTDIR=dist/dev node scripts/build-server.mjs server/guide/guide-test.ts && DATA_DIR=/tmp/naget-test-guide node dist/dev/guide-test.js
```

## Keeping the docs current

What users can see and do is described in several places, which change with the feature in the same commit:
the user guide in [docs/guide](guide/) (the app shows it under Help, the search box finds its sections, and
agents read it to answer questions and to change things in the app), this folder's documents and the README,
the search box's catalog (`shared/find-catalog.ts`, then `npm run find:vectors`), translations
(`npm run i18n:extract`), and the release notes. [CLAUDE.md](../CLAUDE.md) says how; `server/guide/guide-test.ts`
fails when the guide no longer matches the app (a link that points nowhere, a Settings section or an API route
it does not describe, a picture that is missing). The guide's pictures (`docs/guide/images`) come from a demo copy
of the app with made-up data: `scripts/guide-shots` takes them again when a page they show changes.
