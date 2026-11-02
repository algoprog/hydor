# Installation

How to run Naget Agent with Docker or as a service of your user, and keep it up to date. [Back to the README](../README.md).

## Requirements

- **Linux**, x86-64 or ARM64. On macOS or Windows, use Docker (or WSL2 on Windows).
- **A subscription for at least one agent:** a Claude plan (Pro, Max, Team or Enterprise) or an Anthropic
  Console account for Claude Code, and a ChatGPT plan for Codex. You sign in from the app.
- With Docker, nothing else. Without it: Node.js 22.12 or newer, `git`, `tmux`, a C/C++ toolchain for the
  native modules (`build-essential` and `python3` on Debian or Ubuntu), and
  [Claude Code](https://docs.anthropic.com/en/docs/claude-code) if you want it (Codex is installed with the app).
- Optional: [TeX Live](https://tug.org/texlive/) to typeset LaTeX documents in Pages, with bubblewrap to keep it
  in a sandbox of its own (on Debian or Ubuntu `sudo apt install texlive-latex-extra texlive-xetex latexmk
  poppler-utils bubblewrap`; LuaLaTeX runs only in that sandbox). The Docker image leaves TeX out; build it with
  `--build-arg LATEX=true` to add it (about 500 MB more; pdfLaTeX and XeLaTeX).

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

## Updates

Naget Agent checks for a newer version once a day and installs it by itself after 5 hours without a
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

The app was called Agent Console before version 0.5. Installs from then keep working as they are: the
service stays `agent-console`, the data stays in `~/.web-agent`, and `~/.config/agent-console.env` is
still read. With Docker the service is now named `naget-agent`, so rebuild with
`docker compose up -d --build --remove-orphans` (your data volume stays).
