# The guide's screenshots

`docs/guide/images/<topic>.webp` (dark theme) and `<topic>-light.webp` (light theme) show each guide topic's part
of the app. They are taken from a demo copy of the app filled with made-up data: Alex's sessions, projects, memory,
tasks and pages, `alex@example.com`. Nothing comes from a real account.

Take them again when the app's look changes:

```bash
# 1. Build the app as it is now, in a worktree under /tmp (never build in the checkout: that is the live app).
git worktree add --detach /tmp/guide-shots-app HEAD
ln -s "$PWD/node_modules" /tmp/guide-shots-app/node_modules
(cd /tmp/guide-shots-app && OUTDIR=dist/server node scripts/build-server.mjs && npx vite build)

# 2. Take every shot (about three minutes), or a few with --only projects,tasks; --themes dark for one theme.
systemd-run --user --scope -q -p MemoryMax=4G nice node scripts/guide-shots/run.mjs --root /tmp/guide-shots-app

# 3. Remove the worktree.
rm /tmp/guide-shots-app/node_modules && git worktree remove --force /tmp/guide-shots-app
```

`--shots <file>` takes another list of shots instead of the guide's, such as the website's whole windows of the app
(`website/shots.mjs`, see `website/README.md`).

The README's pictures (`docs/media/readme-*.webp`) come from `readme-shots.mjs` the same way, then `readme-frame.py` (Pillow)
gives the windows their rounded corners and puts the phone over the session's dimmed window; its header says how.
A list of shots may export `prepare(ctx)`, which run.mjs calls once the demo is seeded (with its API and its database) to
add what only its pictures show: the README's and the website's add the Trip planner's run in the Lisbon session (its
card, on the map) and the trip's slides in the Library (`tripRun` and `lisbonDeck` in demo.mjs).
They also add what the newer pictures show (`showcaseSessions`, `shopBoard`, `bringInState`, `browsingView` in demo.mjs): the App
builder's sketch of an app and a reply with answer cards as two more sessions, a board of pinned cards, the notes a ChatGPT export
would give Bring in, and the Browser page's tabs and article (its shot gives the desktop stand-in a `show` that draws the
article where the native view would be). Word suggestions have no models in the demo: that shot answers the page's request to
`/api/suggest` itself.
A list may also export `desktop = true`, as those two do: its window pictures then show the desktop app, with the
Browser in the rail, which only the desktop app has (run.mjs gives each page a stand-in for the desktop app's bridge;
a phone's screen stays a phone's). The guide's own pictures show the app as a web browser does.

To take a shot from uncommitted changes, apply them to the worktree before building. `--out <dir>` writes the
pictures somewhere else to compare first; `--serve` starts the demo app alone until Ctrl+C, to look around (port
8795, password "a demo password").

Settings → App → Use on your phone runs `tailscale`: the demo app finds the computer's own when it is installed
(only to read its state, unless a shot presses a button), so point `TAILSCALE_BIN` at a stand-in
(`server/phone/fake-tailscale.mjs`, copied as `tailscale` and made executable) to show that section; run.mjs passes it on.

The demo's home is its own, so the app finds no Chromium for its pictures (each page's in Pages, screenshots,
Preview's) unless `PLAYWRIGHT_BROWSERS_PATH` says where Playwright's are (`~/.cache/ms-playwright`); run.mjs
passes it on. Preview is off in the demo unless `PREVIEW_PORT` gives it a port of its own (the usual 8791 may be
the real app's).

## How it works

- `run.mjs` makes a folder in `/dev/shm` (not `/tmp`: the Git page leaves out repositories there) with a home
  of its own, starts the built app on port 8795 with `HOME`, its data folder, `~/.claude` and `~/.codex` all
  inside it, signs in, and removes everything at the end (`--keep` keeps the folder). The app gets stand-ins
  for `claude` and `codex` that only say their version and that Alex is signed in, so no agent runs and no
  real account is read: the app starts agents' programs with the computer's own login environment.
- `demo.mjs` is the made-up world: folders and a git repository with history, a remote beside the home that lacks
  its last commit, and one change not committed, sessions written as Claude Code transcripts (steps, a web
  search, files handed over, a picture and a clip made), and what the app's own API keeps (projects, guidelines,
  memory notes, scheduled tasks at times well away from now, pages, the Library's images and videos, apps, learned
  skills). The pictures and clips are in `media/`: made once through OpenRouter, kept small. How some sessions ended and a few scheduled runs (`awayData`) go straight into its
  database, for the start page's While you were away. What only a running agent or a real account has
  is answered to the page instead (`overrides`): two sessions waiting on a card, Claude Code's model list, the
  plans' usage, the inbox (and what waits on you in While you were away), and Settings → Models with the models it
  suggests.
- `shots.mjs` lists the shots: the page, what to open on it (a menu, a folded group of steps) and the part to
  keep. Desktop shots are 1280×800 CSS pixels (taller where a page needs it) at twice the resolution, cut to
  that part and at most 1600 pixels wide; `devices` is a 390×844 phone at 780 pixels wide.
- `cdp.mjs` drives Playwright's Chromium headless shell over the DevTools protocol (`CHROME=/path/to/chrome`
  for another one) with real mouse and touch events, and saves WebP at quality 80.

A picture that comes out wrong usually means a label changed: the shots find buttons by their words.
