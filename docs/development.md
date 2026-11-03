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

## The Mac app

`mac/` wraps the server in an Electron app (`mac/main.cjs`): it starts the server with the Node.js inside it and a
message channel (`server/desktop.ts`), shows it in a window, keeps it in the menu bar, and installs the updates the
server downloads (`server/updates.ts`, release by release from `naget-mac.json` on the newest GitHub release),
going back to the version before when a new one does not start.

The channel goes both ways. The server tells the app what to show and do: `ready` (its address), `update` (a new
version downloaded and waiting, for Restart to Update in the menus; with `notice`, the words of the notification
the Mac shows a minute before it installs) and `install`. It asks the app what only the app can find out or do
(`ask`, answered with `reply`), and hears what you picked in the app's menus (`update-now`). The server looks for a
release a minute after it starts and every 4 hours; with Update automatically on it downloads a new one at once,
counts down a minute in every page (`update.ready.installIn`) and then sends `install`; Later
(`POST /api/update/later`) puts it off for 4 hours. `server/desktop-test.ts` plays the app over the real channel;
`NAGET_UPDATE_NOTICE_MS` shortens the minute when trying it.

Releases are built by `.github/workflows/mac.yml` on GitHub's Macs, for Apple silicon and Intel, when a tag
`v<version>` (the version in `package.json`) is pushed; it publishes the `.dmg` and `.zip` builds and
`naget-mac.json` on the Releases page, with the version's notes from `CHANGELOG.md`. Running it by hand (Actions →
Mac app) builds without publishing. With the signing secrets the workflow lists, the app is signed with a Developer
ID and notarized; without them it is signed ad hoc.

On a Mac, by hand:

```bash
npm ci && npm run build          # at the top of the repository
mac/scripts/stage.sh             # the server with its production packages, Node.js and tmux, in mac/build/
cd mac && npm ci && scripts/dist.sh   # mac/dist/Naget-Agent-<version>-<arch>-mac.dmg and .zip
scripts/smoke.sh "dist/mac-arm64/Naget Agent.app"   # its server starts (dist/mac/ on Intel)
npm start                        # or: the app around this repository's own build, to work on main.cjs
```

To try the updater without a release, point the server at a feed of your own with `NAGET_UPDATE_FEED` (in
`~/.config/naget-agent.env`), and, in development, the app at a stand-in bundle with `NAGET_DESKTOP_BUNDLE`.

## Keeping the docs current

What users can see and do is described in several places, which change with the feature in the same commit:
the user guide in [docs/guide](guide/) (the app shows it under Help, the search box finds its sections, and
agents read it to answer questions and to change things in the app), this folder's documents and the README,
the search box's catalog (`shared/find-catalog.ts`, then `npm run find:vectors`), translations
(`npm run i18n:extract`), and the release notes. [CLAUDE.md](../CLAUDE.md) says how; `server/guide/guide-test.ts`
fails when the guide no longer matches the app (a link that points nowhere, a Settings section or an API route
it does not describe, a picture that is missing). The guide's pictures (`docs/guide/images`) come from a demo copy
of the app with made-up data: `scripts/guide-shots` takes them again when a page they show changes.
