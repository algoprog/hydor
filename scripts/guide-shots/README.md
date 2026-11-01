# The guide's screenshots

`docs/guide/images/<topic>.webp` (dark theme) and `<topic>-light.webp` (light theme) show each guide topic's part
of the app. They are taken from a demo copy of the app filled with made-up data: Alex's sessions, spaces, memory,
tasks and pages, `alex@example.com`. Nothing comes from a real account.

Take them again when the app's look changes:

```bash
# 1. Build the app as it is now, in a worktree under /tmp (never build in the checkout: that is the live app).
git worktree add --detach /tmp/guide-shots-app HEAD
ln -s "$PWD/node_modules" /tmp/guide-shots-app/node_modules
(cd /tmp/guide-shots-app && OUTDIR=dist/server node scripts/build-server.mjs && npx vite build)

# 2. Take every shot (about three minutes), or a few with --only spaces,tasks; --themes dark for one theme.
systemd-run --user --scope -q -p MemoryMax=4G nice node scripts/guide-shots/run.mjs --root /tmp/guide-shots-app

# 3. Remove the worktree.
rm /tmp/guide-shots-app/node_modules && git worktree remove --force /tmp/guide-shots-app
```

To take a shot from uncommitted changes, apply them to the worktree before building. `--out <dir>` writes the
pictures somewhere else to compare first; `--serve` starts the demo app alone until Ctrl+C, to look around (port
8795, password "a demo password").

## How it works

- `run.mjs` makes a folder in `/dev/shm` (not `/tmp`: the Git page leaves out repositories there) with a home
  of its own, starts the built app on port 8795 with `HOME`, its data folder, `~/.claude` and `~/.codex` all
  inside it, signs in, and removes everything at the end (`--keep` keeps the folder). The app gets stand-ins
  for `claude` and `codex` that only say their version and that Alex is signed in, so no agent runs and no
  real account is read: the app starts agents' programs with the computer's own login environment.
- `demo.mjs` is the made-up world: folders and a git repository with history and one change not committed,
  sessions written as Claude Code transcripts (steps, a web search, files handed over), and what the app's own
  API keeps (spaces, guidelines, memory notes, scheduled tasks at times well away from now, pages, templates,
  learned skills). What only a running agent or a real account has is answered to the page instead
  (`overrides`): two sessions waiting on a card, Claude Code's model list, the plans' usage, the inbox and
  Settings → Models.
- `shots.mjs` lists the shots: the page, what to open on it (a menu, a folded group of steps) and the part to
  keep. Desktop shots are 1280×800 CSS pixels (taller where a page needs it) at twice the resolution, cut to
  that part and at most 1600 pixels wide; `devices` is a 390×844 phone at 780 pixels wide.
- `cdp.mjs` drives Playwright's Chromium headless shell over the DevTools protocol (`CHROME=/path/to/chrome`
  for another one) with real mouse and touch events, and saves WebP at quality 80.

A picture that comes out wrong usually means a label changed: the shots find buttons by their words.
