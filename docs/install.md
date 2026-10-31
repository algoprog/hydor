# Installation

How to run Agent Console with Docker or as a service of your user, and keep it up to date. [Back to the README](../README.md).

## Requirements

- **Linux**, x86-64 or ARM64. On macOS or Windows, use Docker (or WSL2 on Windows).
- **A subscription for at least one agent:** a Claude plan (Pro, Max, Team or Enterprise) or an Anthropic
  Console account for Claude Code, and a ChatGPT plan for Codex. You sign in from the app.
- With Docker, nothing else. Without it: Node.js 22.12 or newer, `git`, `tmux`, a C/C++ toolchain for the
  native modules (`build-essential` and `python3` on Debian or Ubuntu), and
  [Claude Code](https://docs.anthropic.com/en/docs/claude-code) if you want it (Codex is installed with the app).

## With Docker

```bash
git clone https://github.com/Naget-Inc/agent-console agent-console && cd agent-console
printf 'UID=%s\nGID=%s\n' "$(id -u)" "$(id -g)" > .env   # files the agents create will be yours
mkdir -p workspace                                        # the folder the agents work in
docker compose up -d --build
docker compose logs | grep setup                          # your one-time setup link
```

Open the setup link from the log (`http://localhost:8790/setup?token=…`), choose a password, and the
welcome tour walks you through signing in to Claude Code and Codex.

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
git clone https://github.com/Naget-Inc/agent-console agent-console && cd agent-console
./install.sh
```

The installer checks what it needs (Node.js 22.12+, git, tmux, a compiler), installs the dependencies,
builds the app and runs it as a systemd **user** service that starts at boot: no root needed. It prints a
setup link (`http://localhost:8790/setup?token=…`): open it, choose a password, and the welcome tour does the
rest.

Without cloning first: `curl -fsSL https://raw.githubusercontent.com/Naget-Inc/agent-console/main/install.sh | bash`
clones into `~/agent-console` (or `AGENT_CONSOLE_DIR`; `AGENT_CONSOLE_REPO` installs from another copy). `PORT=…` picks another port; `NO_SERVICE=1` only builds, and then
`npm start` runs it.

Sessions run as the user who runs the server, with that user's `~/.claude` and `~/.codex`.

## The service

```bash
node dist/server/cli.js service status      # is it running
node dist/server/cli.js service logs        # its recent log
node dist/server/cli.js service uninstall   # stop it and remove the unit (your data stays)
node dist/server/cli.js service install     # put it back
```

Settings such as `PORT`, `HOST`, `DATA_DIR` or `ALLOWED_ORIGINS` go in `~/.config/agent-console.env`, one
`NAME=value` per line. Restarting the service never interrupts a running agent: the server reconnects to it.

If you missed the setup link, `node dist/server/cli.js setup-token` prints the token, to use as
`/setup?token=<token>`.

## Updates

Agent Console checks for a newer version once a day and installs it by itself after 5 hours without a
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
