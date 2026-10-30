# Configuration

Settings, where the app keeps its data, and resetting the password. [Back to the README](../README.md).

Everything is optional. Set these in the environment (or in `.env` for Docker Compose):

| Variable | Default | What it does |
| --- | --- | --- |
| `HOST` | `127.0.0.1` (`0.0.0.0` in Docker) | Address to listen on |
| `PORT` | `8790` | Port to listen on |
| `DATA_DIR` | `~/.web-agent` | The app's own data (see below) |
| `DEFAULT_CWD` | your home folder (`/workspace` in Docker) | Folder new sessions start in |
| `ALLOWED_ORIGINS` | none | Extra addresses the app is opened at, comma-separated, when a proxy changes the `Host` header |
| `IDLE_STOP_HOURS` | `3` | Stop an agent process after this long without activity (`0`: never). History is kept, and it resumes on the next message |
| `UPLOAD_KEEP_DAYS` | `14` | Delete the app's copies of attachments after this many days |
| `UPLOAD_MAX_MB` | `2048` | And keep at most this much of them, oldest deleted first |
| `CLAUDE_BIN` | `~/.local/bin/claude`, else `claude` | The Claude Code executable |
| `CODEX_BIN` | the Codex installed with the app | The Codex executable |
| `CLAUDE_CONFIG_DIR` | `~/.claude` | Where Claude Code keeps its data |
| `CODEX_HOME` | `~/.codex` | Where Codex keeps its data |

## What it stores

In `DATA_DIR`: the password hash (`auth.json`), the session index and search database (`web-agent.db`),
logs of running agents (`runs/`), attachments waiting to be sent (`uploads/`), files deleted in the file
browser (`trash/`), notebook kernels and the terminal server. Conversations themselves stay where the agents
write them (`~/.claude/projects`, `~/.codex/sessions`); the app only reads them.

## Password

Change it in Settings → Password. If you forget it:

```bash
node dist/server/cli.js set-password                                        # without Docker
docker compose exec -it agent-console node dist/server/cli.js set-password  # with Docker
```

Either way, every browser is signed out.
