# Installation

How to run Hydor as a desktop app (Mac, Windows, Linux), with Docker or as a service of your user, and keep it up to
date. [Back to the README](../README.md).

## Requirements

- **macOS 12 or newer** (Apple silicon or Intel) for the Mac app; **Windows 10 or 11** (x64) for the Windows app, with
  [Git for Windows](https://git-scm.com/download/win); **Linux**, x86-64 or ARM64, for the Linux app (a system from
  2022 or later: Ubuntu 22.04, Debian 12, Fedora 36, RHEL 9 or newer), Docker or the installer.
- **A subscription for at least one agent:** a Claude plan (Pro, Max, Team or Enterprise) or an Anthropic
  Console account for Claude Code, and a ChatGPT plan for Codex. You sign in from the app.
- With a desktop app or Docker, nothing else (the apps bring their own Node.js, and tmux on a Mac and on Linux). On
  Linux with the installer: Node.js 22.12 or newer, `git`, `tmux`, a C/C++ toolchain for the native modules
  (`build-essential` and `python3` on Debian or Ubuntu), and
  [Claude Code](https://docs.anthropic.com/en/docs/claude-code) if you want it (Codex is installed with the app).
- Optional: [TeX Live](https://tug.org/texlive/) to typeset LaTeX documents in Pages, with bubblewrap to keep it
  in a sandbox of its own (on Debian or Ubuntu `sudo apt install texlive-latex-extra texlive-xetex latexmk
  poppler-utils bubblewrap`; LuaLaTeX runs only in that sandbox). The Docker image leaves TeX out; build it with
  `--build-arg LATEX=true` to add it (about 560 MB more; pdfLaTeX and XeLaTeX), or `LATEX=full` for every template
  (about 1.7 GB more). Some of New → LaTeX's templates need more of TeX than that (the editor offers only those it
  can typeset, and says what to install for the others):
  - **IEEE paper** (IEEEtran), **ACM paper** (acmart) and **Springer LNCS paper** (llncs): on Debian or Ubuntu
    `sudo apt install texlive-publishers`, and `texlive-fonts-extra` too for the ACM paper's fonts; on Fedora
    `sudo dnf install texlive-ieeetran texlive-acmart texlive-llncs`; with TeX Live from tug.org,
    `tlmgr install ieeetran acmart llncs`.
  - **CV or résumé** (moderncv) needs `texlive-fonts-extra` on Debian or Ubuntu for its icons; **Beamer slides**,
    **Homework** and **Poster** come with `texlive-latex-extra`.
  - On a Mac, [MacTeX](https://tug.org/mactex/) has them all (BasicTeX does not: New → LaTeX names the
    `sudo tlmgr install …` that adds what it lacks). On Windows, [MiKTeX](https://miktex.org/) installs what a
    document needs the first time it is typeset, so every template is offered; TeX Live for Windows has them all.
- Optional: [ffmpeg](https://ffmpeg.org/) (`sudo apt install ffmpeg`), for the Library to take a video's frames,
  which its title and description are written from, and stills of videos, and a sound's length and shape; and for
  voice samples in any format (without it, WAV and MP3 only). Without it, a video's description comes from the
  words it was made from. The Docker image has it (`--build-arg FFMPEG=false` leaves it out).

## The Mac app

Download `Hydor-<version>-arm64-mac.dmg` (Apple silicon) or `…-x64-mac.dmg` (Intel) from the
[Releases page](https://github.com/algoprog/hydor/releases/latest), open it and drag **Hydor** to
**Applications**. Open it from there: its window opens on the page where you choose a password, and the welcome
tour does the rest. Until the releases are signed with an Apple Developer ID, macOS asks the first time whether
to open an app from an unidentified developer: right-click the app, choose **Open**, then **Open** again (or
**System Settings → Privacy & Security → Open Anyway**).

The app runs the server inside it, with the Node.js and tmux that come with it, and shows Hydor in its own
window. Closing the window keeps it running, with its icon in the menu bar (**Open Hydor**, **Open in
Browser**, **Settings…**, **Quit Hydor**). Other devices reach it as they would any copy: see
[Remote access](remote-access.md). It opens in the background when you log in (Settings → General → **Start
when this computer starts**).

- Sessions run as you, with your `~/.claude` and `~/.codex`, and with the `PATH` your login shell sets up, so
  the programs you installed with Homebrew or npm are found.
- Its data is in `~/.hydor`, as on Linux. Settings such as `PORT` or `DATA_DIR` go in
  `~/.config/hydor.env`, one `NAME=value` per line; quit and open the app to apply them.
- The server's log is in `~/Library/Logs/Hydor/server.log` (**Help → Show the Server Log**).
- **Quit Hydor** stops the server; running agents carry on and are picked up again the next time it opens.
- Computer use: agents can see your Mac's screen and use its mouse and keyboard, once you turn it on in Settings →
  Computer use and give Hydor macOS's Accessibility and Screen Recording permissions (its **Allow…** buttons
  ask). Each session asks you first; a glow lines the screen while an agent works, and **Esc** (or **Stop** in the
  menu bar, or ⌘⇧Esc) stops it. The permissions carry over when the app updates: macOS ties them to the app's
  signature, and every version since 0.28.1 is signed with the same certificate. Coming from an earlier version, give
  them once more: **Allow…** clears the old switch first.
- Not in the Mac app yet: **Run code** steps in apps and the agent sandbox need Linux's bubblewrap.

Opened from the disk image or the Downloads folder, the app offers to move itself to Applications, where it can
update itself.

## The Windows app

Download `Hydor-<version>-x64-win.exe` from the [Releases page](https://github.com/algoprog/hydor/releases/latest) and
run it: it installs Hydor for your account (no administrator needed), adds it to the Start menu and the desktop, and
opens it on the page where you choose a password. The installer is not signed yet, so Windows SmartScreen may say it
protected your PC: choose **More info**, then **Run anyway**.

Install [Git for Windows](https://git-scm.com/download/win) as well: agents run their commands in its bash, as Claude
Code does on Windows, and the app's terminals open it too (PowerShell without it).

The app runs the server with the Node.js that comes with it, and shows Hydor in its own window. Closing the window keeps
it running, with its icon in the notification area of the taskbar: click it to open Hydor, or right-click it for **Open
in Browser**, **Settings…** and **Quit Hydor**. It opens in the background when you sign in to Windows (Settings →
General → **Start when this computer starts**).

- Sessions run as you, with your `%USERPROFILE%\.claude` and `%USERPROFILE%\.codex`, and the environment Windows
  gives your apps (your `PATH`).
- Its data is in `%USERPROFILE%\.hydor`. Settings such as `PORT` go in `%USERPROFILE%\.config\hydor.env`, one
  `NAME=value` per line; quit and open the app to apply them.
- The server's log is in `%APPDATA%\Hydor\logs\server.log` (**Help → Show the Server Log**: press Alt for the menu).
- Each version runs from a copy of itself in `%LOCALAPPDATA%\Hydor\runtime`, made the first time it opens, so agents
  keep running through updates (Windows cannot replace files a program uses); copies nothing runs from any more go.
- Windows has no tmux: the app keeps the terminals itself, and they close when it quits.
- Computer use: agents can see your PC's screen and use its mouse and keyboard, once you turn it on in Settings →
  Computer use (nothing to allow in Windows). Each session asks you first; a glow lines the screen while an agent
  works, and **Esc** (or **Stop** from the icon in the notification area) stops it. Programs running as
  administrator are out of its reach.
- Not in the Windows app yet: the agent sandbox and **Run code** steps in apps (they need macOS or
  Linux), local voice transcription, and the figures on the System page.

## The Linux app

On Ubuntu, Debian and systems like them, download `Hydor-<version>-amd64.deb` (`-arm64.deb` on ARM) from the
[Releases page](https://github.com/algoprog/hydor/releases/latest) and install it:

```bash
sudo apt install ./Hydor-*-amd64.deb
```

On any other system (Fedora, Arch, openSUSE…), download `Hydor-<version>-x86_64.AppImage` (`-arm64.AppImage` on ARM),
make it executable and open it:

```bash
chmod +x Hydor-*.AppImage && ./Hydor-*.AppImage
```

Like the Mac app, it brings its own Node.js and tmux, shows Hydor in a window of its own, keeps running in the system
tray when the window is closed, and opens in the background when you log in.

- Its data is in `~/.hydor`, settings go in `~/.config/hydor.env`, and the server's log is in
  `~/.config/Hydor/logs/server.log`.
- The AppImage runs its server from a copy in `~/.local/share/Hydor/runtime`, so agents keep running after it closes
  or updates. Keep it in a folder you can write to (your home folder, say) so it can update itself.
- The `.deb` updates with your password: once a new version has downloaded, **Restart to Update** asks for it, and
  the app opens again as the new version.
- The tray icon needs a desktop with a system tray (GNOME needs the AppIndicator extension, which Ubuntu has); without
  one, open Hydor again from your applications to get its window back.
- Computer use (Settings → Computer use): agents can see the screen and use the mouse and keyboard on an X11 (Xorg)
  desktop, with Python 3 and the XTest library (`libxtst6`, which the `.deb` brings). On a Wayland desktop, as GNOME
  and KDE are on most systems now, apps cannot see or use the others, so computer use needs an X11 session (on
  Ubuntu, the gear on the login screen → **Ubuntu on Xorg**). A glow lines the screen while an agent works (on
  desktops that composite their windows), and **Esc** (or **Stop** in the tray) stops it.

## With Docker

The image is published as [`algoprog/hydor`](https://hub.docker.com/r/algoprog/hydor) for
`linux/amd64` and `linux/arm64`, so it runs with Docker on Linux and with Docker Desktop on macOS (Intel or
Apple silicon) and Windows. Pull it and run it:

```bash
mkdir -p workspace                                        # the folder the agents work in
docker run -d --name hydor --restart unless-stopped -p 127.0.0.1:8790:8790 \
  -v hydor-home:/home/node -v "$PWD/workspace:/workspace" algoprog/hydor
docker logs hydor | grep setup                      # your one-time setup link
```

The published image runs the agents as user id 1000, the first user on most Linux systems. If yours is
another (`id -u`), build the image yourself so the files the agents create in your folders are yours; on
macOS and Windows, Docker Desktop takes care of this. To build it, from a clone of the repository:

```bash
git clone https://github.com/algoprog/hydor hydor && cd hydor
printf 'UID=%s\nGID=%s\n' "$(id -u)" "$(id -g)" > .env   # files the agents create will be yours
mkdir -p workspace                                        # the folder the agents work in
docker compose up -d --build                              # without --build: the published image
docker compose logs | grep setup                          # your one-time setup link
```

Open the setup link from the log (`http://localhost:8790/setup?token=…`), choose a password, and the
welcome tour sets up what you want to use: Claude Code, Codex, models or other agents.

It starts again with the computer as long as Docker does (the restart policy `unless-stopped`; Docker
Desktop has a setting to start when you sign in). To move to a newer image: `docker pull algoprog/hydor`,
then remove the container and run it again (the `hydor-home` volume keeps your data; one made before the rename is called `naget-agent-home`, so give that name instead), or
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

## On a cloud service

The README's buttons run the public Docker image (`algoprog/hydor`) on a hosting service, billed to your account
there. Each makes one web service on port 8790, checked at `/api/health`:

- **Render** (`render.yaml`): a Starter service with a 10 GB disk at `/home/node`, so your settings, sessions and
  agents' sign-ins stay through restarts and updates.
- **DigitalOcean App Platform** (`.do/deploy.template.yaml`): a 1 vCPU / 2 GB app. App Platform has no lasting disk:
  everything starts afresh when the app is redeployed. For a lasting copy, run the image on a Droplet as in
  [With Docker](#with-docker).
- **Koyeb**: the image as it is, on a small instance; without a volume it also starts afresh when redeployed.

When it is up, find the line `No password set yet. Open http://…/setup?token=…` in the service's logs, open
`/setup?token=…` at the address the service gives you, and choose a password. The service's address is served
over HTTPS, so phones can use it at once. The app updates when the service pulls `algoprog/hydor:latest` again
(a redeploy).

## Without Docker

```bash
git clone https://github.com/algoprog/hydor hydor && cd hydor
./install.sh
```

The installer checks what it needs (Node.js 22.12+, git, tmux, a compiler), installs the dependencies,
builds the app and runs it as a systemd **user** service that starts at boot: no root needed. It prints a
setup link (`http://localhost:8790/setup?token=…`): open it, choose a password, and the welcome tour does the
rest.

Without cloning first: `curl -fsSL https://raw.githubusercontent.com/algoprog/hydor/main/install.sh | bash`
clones into `~/hydor`, or updates a copy from before the rename in `~/naget-agent` (or `HYDOR_DIR`; `HYDOR_REPO` installs from another copy). `PORT=…` picks another port; `NO_SERVICE=1` only builds, and then
`npm start` runs it.

Sessions run as the user who runs the server, with that user's `~/.claude` and `~/.codex`.

## The service

```bash
node dist/server/cli.js service status      # is it running
node dist/server/cli.js service logs        # its recent log
node dist/server/cli.js service uninstall   # stop it and remove the unit (your data stays)
node dist/server/cli.js service install     # put it back
```

Settings such as `PORT`, `HOST`, `DATA_DIR` or `ALLOWED_ORIGINS` go in `~/.config/hydor.env`, one
`NAME=value` per line. Restarting the service never interrupts a running agent: the server reconnects to it.

**Start when this computer starts** (Settings → General) is on by default: the service starts at boot, even
before anyone logs in, and comes back if it stops. A copy started by hand (`npm start`) from a git clone
sets up this service the first time it runs, with the settings it was started with; turn the switch off to
keep it from starting at boot. With Docker, the restart policy decides instead; with a system service of your
own, its `systemctl enable` does.

If you missed the setup link, `node dist/server/cli.js setup-token` prints the token, to use as
`/setup?token=<token>`.

## Apps from the command line

With Hydor running, the `app` commands work on your apps through its API, with a key of their own
(Settings → Machines lists it as “This computer’s command line”):

```bash
node dist/server/cli.js app new "Reading list"   # an app, and its folder of files to write in any editor
node dist/server/cli.js app dev reading-list     # each change saved in its folder, tried on its examples
node dist/server/cli.js app try reading-list     # try its examples once (exit 1 when a check fails)
node dist/server/cli.js app export reading-list  # one file (.hydor-app) to carry to another computer
node dist/server/cli.js app import reading-list.hydor-app   # says what it will do, then installs it
```

`app help` lists them all. `PORT`, or `HYDOR_URL`, says where Hydor is.

## Updates

The desktop apps update by release: a minute after one opens and then every 4 hours it looks at the newest release
on GitHub, and when it is newer, it downloads the build for your system at once and checks it against the release's
checksum (and, for a signed Mac app, that the same developer signed it). A download that breaks off (the computer
asleep, the connection dropped or quiet for a minute) carries on from where it stopped; one that gets no further for a
couple of minutes keeps what it has and tries again an hour later. Then it says so, with a notification and a
note in every open page that counts down a minute (**Restart now**, **Later**), and opens the new version in place of
the one you run. **Later** puts it off for 4 hours; **Restart to Update** in the menu of its icon (the menu bar, the
notification area, the tray) installs it whenever you like. Running agents carry on. With **Update automatically** off
(Settings → General), nothing downloads by itself: Settings says a version is out, and **Update now** installs it.

- **Mac**: if the new version's server does not start, the app goes back to the version before by itself, says why
  in Settings → General, and leaves that version for **Update now**. It needs to be in a folder you can write to
  (Applications is): opened from the disk image, it can't update.
- **Windows**: the new version's installer runs without its window, installs over the app and opens it again.
- **Linux**: an AppImage replaces its own file, and goes back to the version before if the new one does not start; the
  `.deb` asks for your password to install, so a version that downloaded by itself waits for **Restart to Update**.

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

The app was called Naget Agent before version 0.20, and Agent Console before 0.5. Installs from then keep working
as they are: the service keeps its name (`naget-agent` or `agent-console`), the data stays in `~/.naget-agent` or
`~/.web-agent`, the folders it made stay in `~/Naget` and `~/naget-apps`, `~/.config/naget-agent.env` and
`~/.config/agent-console.env` are still read, and so are settings named `NAGET_…` (now `HYDOR_…`). With Docker the
service is now named `hydor`, so rebuild with
`docker compose up -d --build --remove-orphans` (your data volume stays).
