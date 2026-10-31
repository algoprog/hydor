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
