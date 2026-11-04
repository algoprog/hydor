# Development

Building and changing Hydor. [Back to the README](../README.md).

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
OUTDIR=dist/dev node scripts/build-server.mjs server/guide/guide-test.ts && DATA_DIR=/tmp/hydor-test-guide node dist/dev/guide-test.js
```

Built-in skills are folders in `skills/` (a SKILL.md each, with `category:` for its group on the Skills page);
`server/skillpack/tests.ts` checks them. Built-in plugins are folders in `plugins/`, in the Agent Plugins 1.0
format (`plugin.json`, `skills/`, `mcp.json`) with the app's own extension, `com.naget.agent`, for what they need.
`server/plugins/` reads them, sets them up in their own data folders and gives every agent their skills and tool
servers (stdio servers start through `dist/server/pluginlaunch.js`, in the plugin's folder). Its tests check every
built-in plugin; with `HYDOR_TEST_REAL_SETUP=1` they install the plugins' packages for real and talk to their
servers:

```bash
OUTDIR=dist/dev node scripts/build-server.mjs server/plugins/plugins-test.ts && HYDOR_TEST_REAL_SETUP=1 DATA_DIR=/tmp/hydor-test-plugins node dist/dev/plugins-test.js
```

## The desktop apps

`desktop/` wraps the server in an Electron app (`desktop/main.cjs`) for macOS, Windows and Linux: it starts the server
with the Node.js inside it and a message channel (`server/desktop.ts`), shows it in a window, keeps it in the menu bar
(the notification area, the system tray), and installs the updates the server downloads (`server/updates.ts`, release
by release from `hydor-mac.json`, `hydor-windows.json` or `hydor-linux.json` on the newest GitHub release). How a copy
was installed decides how it updates (`HYDOR_DESKTOP_FORMAT`): a Mac app (`app`) and an AppImage swap themselves for the
new version and go back to the one before when it does not start; Windows (`nsis`) runs the new installer without its
window (`/S --updated --force-run`); the `.deb` installs with `pkexec dpkg -i`, so a version downloaded by itself waits
for Restart to Update.

On Windows and from an AppImage the app first copies its server, Node.js and tmux to `runtime/<version>-<build>` in
its local data folder (`%LOCALAPPDATA%\Hydor`, `~/.local/share/Hydor`) and runs them from there: agents outlive the
app, and Windows cannot replace a file a program has open (its installer stops every program running from the app's
folder), while an AppImage's files go when it closes. Copies nothing runs from any more are removed a minute after
the server starts.

The channel goes both ways. The server tells the app what to show and do: `ready` (its address), `update` (a new
version downloaded and waiting, for Restart to Update in the menus; with `notice`, the words of the notification
the app shows a minute before it installs) and `install`. It asks the app what only the app can find out or do
(`ask`, answered with `reply`), and hears what you picked in the app's menus (`update-now`) and, on Windows, `quit`
(there is no SIGTERM a program can catch there). The server looks for a release a minute after it starts and every
4 hours; with Update automatically on it downloads a new one at once, counts down a minute in every page
(`update.ready.installIn`) and then sends `install`; Later (`POST /api/update/later`) puts it off for 4 hours.
`server/desktop-test.ts` plays the app over the real channel, for each kind of copy; `HYDOR_UPDATE_NOTICE_MS` shortens
the minute when trying it.

The server on Windows (`server/platform.ts` holds what differs): runners listen on a named pipe with a random name and
answer only a client that sends the key in their `sock` file; commands run in Git for Windows' bash; npm's `.cmd`
launchers start through Node.js and the script they name; programs stop with their whole tree (`taskkill /T`);
terminals are shells in ConPTY that the server keeps, with what they printed, since there is no tmux; links to folders
are junctions. `server/platform-test.ts` checks all of it on the system it runs on, and the desktop workflow runs it on
each.

Computer use (`server/computer/`, in the desktop apps) works through that channel too. `plan.ts` checks the agent's
actions and turns them into one list of driver steps for every system, with each system's keys (macOS's key codes,
Windows' virtual-key codes, X11's keysyms) and the screenshot's pixels mapped to the screen (points on a Mac, pixels
elsewhere); `access.ts` keeps the setting, the per-session card, Stop and the one session at the computer; each system
has its machine (`machine.ts`):

- **macOS** (`mac.ts`) runs macOS's own programs as children of the server, so macOS checks the app's permissions:
  `screencapture` for the main display, `sips` to scale it to 1280 pixels and make a JPEG, `open -a` for apps, and
  `osascript -l JavaScript` with one driver script (`driver.ts`) that posts CGEvents through the ObjC bridge: clicks
  with their click count, drags, scroll wheels, key combinations by their US-keyboard codes, and text as Unicode on
  key events (a pasted fallback puts the clipboard back). The server asks the app for macOS's permissions (`ask`
  `permissions`, and `request` to show macOS's prompt and its System Settings pane).
- **Windows** (`windows.ts`) keeps one helper running (`helper.ts`: a request and an answer per line of JSON),
  `windows-helper.cs`: SendInput for the mouse and keyboard (text as Unicode), a per-monitor DPI-aware copy of the
  screen scaled to a JPEG, and apps from the Start menu (`shell:AppsFolder`). `desktop/scripts/stage.sh` builds it into
  `bin/hydor-computer.exe` with the C# compiler Windows has (.NET Framework's `csc`, so C# 5); without that,
  PowerShell compiles the same file as it starts.
- **Linux** (`linux.ts`) needs an X11 desktop (a Wayland one is told apart and said so): `x11-helper.py`, Python's own
  ctypes with libX11 and libXtst, moves the pointer, clicks and types through XTest (a character the layout lacks
  borrows a spare key for a moment), the app takes the screenshot (Electron's `desktopCapturer`), and apps open by
  their `.desktop` entries (`gio launch`, `gtk-launch`, or the Exec line).

While an agent acts, the server tells the app (`computer`, with the words of its note and whether to glow: not on a
Linux desktop without a compositor), and the app (`desktop/glow.cjs`) lines every display's edges with a glow in
see-through, click-through windows above everything, with a note at the bottom; registers Esc (and ⌘⇧Esc on a Mac)
meanwhile, and sends `computer-stop` when one is pressed, or Stop is chosen in its menu. The agent's screenshots never
show the glow: its windows ask to be left out of captures (`setContentProtection`), but macOS 15.4 and later may put
them in all the same, and Windows' copy of the screen did on GitHub's runners, so the server asks the app to hide it
(`ask` `glow`) while the screenshot is taken and tells it to come back (`glow`); on Linux the app takes the screenshot
itself (`ask` `screenshot`), hiding it meanwhile. Around the agent's own Escape the server asks the app to let go of Esc (`ask`
`esc`) and gives it back (`esc`), so the agent does not stop itself. `server/computer/computer-test.ts` runs
everything but the systems themselves (the Mac's driver with stand-ins for the bridge); `x11-test.ts` drives the X11
helper against a test window on an X display, `windows-test.ts` the Windows helper against Notepad, and
`desktop/scripts/glow-test.cjs` shows the glow and checks the agent's screenshot leaves it out: the desktop workflow
runs them on each system.

Releases are built by `.github/workflows/desktop.yml` on GitHub's own computers when a tag `v<version>` (the version in
`package.json`) is pushed: the Mac app for Apple silicon and Intel, the Windows installer for x64, and the Linux
AppImage and `.deb` for x64 and ARM (on Ubuntu 22.04, so they need its C library, 2.34, or newer). Each build is
checked before it is kept: its server starts from inside it, the app itself opens and starts its server (the AppImage
from its own copy; on Windows also once installed with its installer, then uninstalled). It publishes them on the
Releases page with the update feeds and the version's notes from `CHANGELOG.md`, and copies under names without the
version for the README's links. Running it by hand (Actions → Desktop apps) builds without publishing. With the
signing secrets the workflow lists, the Mac app is signed with a Developer ID and notarized; without them it is signed
ad hoc. The Windows installer is not signed.

By hand, on the kind of computer the app is for (on Windows in Git's bash; on Linux with `libncurses-dev` for tmux):

```bash
npm ci && npm run build              # at the top of the repository
desktop/scripts/stage.sh             # the server with its production packages, Node.js (and tmux), in desktop/build/
cd desktop && npm ci && scripts/dist.sh   # desktop/dist/: the .dmg and .zip, the installer, or the AppImage and .deb
node scripts/smoke.mjs dist/mac-arm64/Hydor.app   # its server starts (dist/mac/, dist/win-unpacked, dist/linux-unpacked)
node scripts/launch-test.mjs dist/linux-unpacked/hydor   # the app opens and starts its server
npm start                            # or: the app around this repository's own build, to work on main.cjs
```

To try the updater without a release, point the server at a feed of your own with `HYDOR_UPDATE_FEED` (in
`~/.config/hydor.env`), and, in development, the app at a stand-in bundle with `HYDOR_DESKTOP_BUNDLE`.

## The Docker image

`Dockerfile` makes the image: the app as a git checkout (so it can update itself in place), with Claude Code and
Codex. `.github/workflows/docker.yml` builds it on GitHub's runners for `linux/amd64` and `linux/arm64` (ARM under
emulation) when a tag `v<version>` is pushed, beside the desktop apps' release, and pushes `algoprog/hydor:<version>` and
`algoprog/hydor:latest` to Docker Hub, signed in with the repository secret `DOCKERHUB_TOKEN`. Running it by hand
(Actions → Docker image) builds both without pushing. To build one here: `docker build -t hydor .`

## The website

[hydor.app](https://hydor.app) is the website in `website/`: plain HTML, CSS and JavaScript, dark like the app's
dark theme, with screenshots of the app and frames of its tour film. Its docs (`/docs`) are made when it is built
from the same Markdown the app and GitHub show (the guide in `docs/guide`, the documents the README lists, and
`CHANGELOG.md`), with the app's own guide parser and Help's search, so the docs are written in one place only.
`node website/build.mjs --serve 4321` builds it into `dist/website` and shows it at http://localhost:4321;
`--deploy` publishes it on Cloudflare Pages (project `hydor`) with `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` set. It names the latest release and shows the docs as they were when it was built, so
publish it again after a release or a change to the docs. [website/README.md](../website/README.md) has the rest.

## Keeping the docs current

What users can see and do is described in several places, which change with the feature in the same commit:
the user guide in [docs/guide](guide/) (the app shows it under Help, the search box finds its sections, and
agents read it to answer questions and to change things in the app), this folder's documents and the README,
the search box's catalog (`shared/find-catalog.ts`, then `npm run find:vectors`), translations
(`npm run i18n:extract`), and the release notes. [CLAUDE.md](../CLAUDE.md) says how; `server/guide/guide-test.ts`
fails when the guide no longer matches the app (a link that points nowhere, a Settings section or an API route
it does not describe, a picture that is missing). The guide's pictures (`docs/guide/images`) come from a demo copy
of the app with made-up data: `scripts/guide-shots` takes them again when a page they show changes.
