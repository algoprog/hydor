# Installation

How to run Naget Agent as the Mac app, with Docker or as a service of your user, and keep it up to date. [Back to the README](../README.md).

## Requirements

- **macOS 12 or newer** (Apple silicon or Intel) for the Mac app, or **Linux**, x86-64 or ARM64. On Windows, use
  Docker (or WSL2).
- **A subscription for at least one agent:** a Claude plan (Pro, Max, Team or Enterprise) or an Anthropic
  Console account for Claude Code, and a ChatGPT plan for Codex. You sign in from the app.
- With the Mac app or Docker, nothing else (the Mac app brings its own Node.js and tmux). On Linux without Docker: Node.js 22.12 or newer, `git`, `tmux`, a C/C++ toolchain for the
  native modules (`build-essential` and `python3` on Debian or Ubuntu), and
  [Claude Code](https://docs.anthropic.com/en/docs/claude-code) if you want it (Codex is installed with the app).
- Optional: [TeX Live](https://tug.org/texlive/) to typeset LaTeX documents in Pages, with bubblewrap to keep it
  in a sandbox of its own (on Debian or Ubuntu `sudo apt install texlive-latex-extra texlive-xetex latexmk
  poppler-utils bubblewrap`; LuaLaTeX runs only in that sandbox). The Docker image leaves TeX out; build it with
  `--build-arg LATEX=true` to add it (about 500 MB more; pdfLaTeX and XeLaTeX).
- Optional: [ffmpeg](https://ffmpeg.org/) (`sudo apt install ffmpeg`), for the Library to take a video's frames,
  which its title and description are written from, and stills of videos. Without it, a video's description comes
  from the words it was made from. The Docker image has it (`--build-arg FFMPEG=false` leaves it out).

## The Mac app

Download `Naget-Agent-<version>-arm64-mac.dmg` (Apple silicon) or `…-x64-mac.dmg` (Intel) from the
[Releases page](https://github.com/Naget-Inc/naget-agent/releases/latest), open it and drag **Naget Agent** to
**Applications**. Open it from there: its window opens on the page where you choose a password, and the welcome
tour does the rest. Until the releases are signed with an Apple Developer ID, macOS asks the first time whether
to open an app from an unidentified developer: right-click the app, choose **Open**, then **Open** again (or
**System Settings → Privacy & Security → Open Anyway**).

The app runs the server inside it, with the Node.js and tmux that come with it, and shows Naget Agent in its own
window. Closing the window keeps it running, with its icon in the menu bar (**Open Naget Agent**, **Open in
Browser**, **Settings…**, **Quit Naget Agent**). Other devices reach it as they would any copy: see
[Remote access](remote-access.md). It opens in the background when you log in (Settings → General → **Start
when this computer starts**).

- Sessions run as you, with your `~/.claude` and `~/.codex`, and with the `PATH` your login shell sets up, so
  the programs you installed with Homebrew or npm are found.
- Its data is in `~/.naget-agent`, as on Linux. Settings such as `PORT` or `DATA_DIR` go in
  `~/.config/naget-agent.env`, one `NAME=value` per line; quit and open the app to apply them.
- The server's log is in `~/Library/Logs/Naget Agent/server.log` (**Help → Show the Server Log**).
- **Quit Naget Agent** stops the server; running agents carry on and are picked up again the next time it opens.
- Computer use: agents can see your Mac's screen and use its mouse and keyboard, once you turn it on in Settings →
  Computer use and give Naget Agent macOS's Accessibility and Screen Recording permissions (its **Allow…** buttons
  ask). Each session asks you first; **Stop** in the menu bar or ⌘⇧Esc stops it. Builds not signed with a Developer
  ID may need the permissions given again after an update (macOS ties them to the app's signature).
- Not in the Mac app yet: **Run code** steps in apps and the agent sandbox need Linux's bubblewrap.

Opened from the disk image or the Downloads folder, the app offers to move itself to Applications, where it can
update itself.

## With Docker

The image is published as [`nagetai/naget-agent`](https://hub.docker.com/r/nagetai/naget-agent) for
`linux/amd64` and `linux/arm64`, so it runs with Docker on Linux and with Docker Desktop on macOS (Intel or
Apple silicon) and Windows. Pull it and run it:

```bash
mkdir -p workspace                                        # the folder the agents work in
docker run -d --name naget-agent --restart unless-stopped -p 127.0.0.1:8790:8790 \
  -v naget-agent-home:/home/node -v "$PWD/workspace:/workspace" nagetai/naget-agent
docker logs naget-agent | grep setup                      # your one-time setup link
```

The published image runs the agents as user id 1000, the first user on most Linux systems. If yours is
another (`id -u`), build the image yourself so the files the agents create in your folders are yours; on
macOS and Windows, Docker Desktop takes care of this. To build it, from a clone of the repository:

```bash
git clone https://github.com/Naget-Inc/naget-agent naget-agent && cd naget-agent
printf 'UID=%s\nGID=%s\n' "$(id -u)" "$(id -g)" > .env   # files the agents create will be yours
mkdir -p workspace                                        # the folder the agents work in
docker compose up -d --build                              # without --build: the published image
docker compose logs | grep setup                          # your one-time setup link
```

Open the setup link from the log (`http://localhost:8790/setup?token=…`), choose a password, and the
welcome tour sets up what you want to use: Claude Code, Codex, models or other agents.

It starts again with the computer as long as Docker does (the restart policy `unless-stopped`; Docker
Desktop has a setting to start when you sign in). To move to a newer image: `docker pull nagetai/naget-agent`,
then remove the container and run it again (the `naget-agent-home` volume keeps your data), or
`docker compose pull && docker compose up -d`.

What the container keeps:

| Path in the container | What | Default in `compose.yaml` |
| --- | --- | --- |
| `/workspace` | The folders the agents work in | `./workspace` (set `WORKSPACE=/path/to/your/code` in `.env`) |
| `/home/node` | Agent sign-ins, settings and history, and the app's data | the `agent-home` volume |

To use your existing logins and history from this computer instead, mount `~/.claude`, `~/.claude.json` and
`~/.codex` into `/home/node`. Mount your projects at the **same path** they have on the host, so sessions
started outside the container can be continued inside it.

Inside the container, the container itself is the boundary around the agents. Codex's own sandbox can't
start there (containers block the Linux namespaces it needs), so the app makes *Full access* the default for
Codex and says why in the mode menu. Claude Code's permission prompts work as usual.

## Without Docker

```bash
git clone https://github.com/Naget-Inc/naget-agent naget-agent && cd naget-agent
./install.sh
```

The installer checks what it needs (Node.js 22.12+, git, tmux, a compiler), installs the dependencies,
builds the app and runs it as a systemd **user** service that starts at boot: no root needed. It prints a
setup link (`http://localhost:8790/setup?token=…`): open it, choose a password, and the welcome tour does the
rest.

Without cloning first: `curl -fsSL https://raw.githubusercontent.com/Naget-Inc/naget-agent/main/install.sh | bash`
clones into `~/naget-agent` (or `NAGET_AGENT_DIR`; `NAGET_AGENT_REPO` installs from another copy). `PORT=…` picks another port; `NO_SERVICE=1` only builds, and then
`npm start` runs it.

Sessions run as the user who runs the server, with that user's `~/.claude` and `~/.codex`.

## The service

```bash
node dist/server/cli.js service status      # is it running
node dist/server/cli.js service logs        # its recent log
node dist/server/cli.js service uninstall   # stop it and remove the unit (your data stays)
node dist/server/cli.js service install     # put it back
```

Settings such as `PORT`, `HOST`, `DATA_DIR` or `ALLOWED_ORIGINS` go in `~/.config/naget-agent.env`, one
`NAME=value` per line. Restarting the service never interrupts a running agent: the server reconnects to it.

**Start when this computer starts** (Settings → General) is on by default: the service starts at boot, even
before anyone logs in, and comes back if it stops. A copy started by hand (`npm start`) from a git clone
sets up this service the first time it runs, with the settings it was started with; turn the switch off to
keep it from starting at boot. With Docker, the restart policy decides instead; with a system service of your
own, its `systemctl enable` does.

If you missed the setup link, `node dist/server/cli.js setup-token` prints the token, to use as
`/setup?token=<token>`.

## Apps from the command line

With Naget Agent running, the `app` commands work on your apps through its API, with a key of their own
(Settings → Machines lists it as “This computer’s command line”):

```bash
node dist/server/cli.js app new "Reading list"   # an app, and its folder of files to write in any editor
node dist/server/cli.js app dev reading-list     # each change saved in its folder, tried on its examples
node dist/server/cli.js app try reading-list     # try its examples once (exit 1 when a check fails)
node dist/server/cli.js app export reading-list  # one file (.naget-app) to carry to another computer
node dist/server/cli.js app import reading-list.naget-app   # says what it will do, then installs it
```

`app help` lists them all. `PORT`, or `NAGET_URL`, says where Naget Agent is.

## Updates

The Mac app updates by release: a minute after it opens and then every 4 hours it looks at the newest release on
GitHub, and when it is newer, it downloads the build for your Mac at once and checks it against the release's
checksum (and, for a signed app, that the same developer signed it). Then it says so, with a notification from the
Mac and a note in every open page that counts down a minute (**Restart now**, **Later**), and opens the new version
in place of the one you run. **Later** puts it off for 4 hours; **Restart to Update** in the menu-bar icon's menu
installs it whenever you like. Running agents carry on. With **Update automatically** off (Settings → General),
nothing downloads by itself: Settings says a version is out, and **Update now** installs it. If the new version's
server does not start, the app goes back to the version before by itself, says why in Settings → General, and
leaves that version for **Update now**. It needs to be in a folder you can write to (Applications is): opened from
the disk image, it can't update.

A copy installed from git checks for a newer version once a day and installs it by itself after 5 hours without a
message from you, at most once a day. Agents can be at work meanwhile: they carry on through the
restart. Settings → General shows what is out, has **Update now** for updating at once, and a switch to
turn the automatic updates off.

This works for the installer's service and for Docker, which both start the server again after it
exits. A server started by hand (`npm start`) only checks; update it with `git pull && npm ci && npm run
build` and start it again. With the service, the same from a terminal:

```bash
node dist/server/cli.js update   # pull, build, restart the service; running agents carry on
```

The Docker container updates the copy of the app inside it. Rebuilding the image (`docker compose up -d
--build`) starts again from your clone of the repository, so `git pull` before you do.

The agents' programs keep up to date as well, however the app runs: once a day Claude Code, Codex, Gemini CLI
and the others are brought to their newest version, the app's own copies with npm and yours with their own
updater (`claude update`, `codex update`…), and a new version that does not work the way the sessions use it is
undone. Settings → Accounts → Agent programs has **Update now** and a switch to turn this off. The Docker image's
Claude Code is left to the image (it sets `DISABLE_AUTOUPDATER=1`, and it is installed for all users).

The app was called Agent Console before version 0.5. Installs from then keep working as they are: the
service stays `agent-console`, the data stays in `~/.web-agent`, and `~/.config/agent-console.env` is
still read. With Docker the service is now named `naget-agent`, so rebuild with
`docker compose up -d --build --remove-orphans` (your data volume stays).
