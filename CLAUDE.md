# Notes for agents working on Naget Agent

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
