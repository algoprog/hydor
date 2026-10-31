# Configuration

Settings, where the app keeps its data, and resetting the password. [Back to the README](../README.md).

Everything is optional. Set these in the environment (or in `.env` for Docker Compose):

| Variable | Default | What it does |
| --- | --- | --- |
| `HOST` | `127.0.0.1` (`0.0.0.0` in Docker) | Address to listen on |
| `PORT` | `8790` | Port to listen on |
| `DATA_DIR` | `~/.naget-agent` (`~/.web-agent` where an older install made it) | The app's own data (see below) |
| `DEFAULT_CWD` | your home folder (`/workspace` in Docker) | Folder new sessions start in |
| `ALLOWED_ORIGINS` | none | Extra addresses the app is opened at, comma-separated, when a proxy changes the `Host` header |
| `IDLE_STOP_HOURS` | `3` | Stop an agent process after this long without activity (`0`: never). History is kept, and it resumes on the next message |
| `UPLOAD_KEEP_DAYS` | `14` | Delete the app's copies of attachments after this many days |
| `UPLOAD_MAX_MB` | `2048` | And keep at most this much of them, oldest deleted first |
| `CLAUDE_BIN` | `~/.local/bin/claude`, else `claude` | The Claude Code executable |
| `CODEX_BIN` | the Codex installed with the app | The Codex executable |
| `CLAUDE_CONFIG_DIR` | `~/.claude` | Where Claude Code keeps its data |
| `CODEX_HOME` | `~/.codex` | Where Codex keeps its data |
| `NAGET_EMBED_DEVICE` | the GPU with the most free memory, else `cpu` | Where memory's search by meaning runs (`cpu`, `cuda:1`…); Settings → Memory can also keep it on the CPU |
| `NAGET_EMBED_THREADS` | half the CPU's cores, at most 4 | Threads it uses on the CPU |

## What it stores

In `DATA_DIR`: the password hash (`auth.json`), the session index and search database (`naget-agent.db`, `web-agent.db` in older installs),
logs of running agents (`runs/`), attachments waiting to be sent (`uploads/`), files deleted in the file
browser (`trash/`), notebook kernels and the terminal server, and, once search by meaning is turned on in
Settings → Memory, its private Python environment (`memory/venv`). Its model goes to Hugging Face's cache
(`~/.cache/huggingface`, or `memory/hf` in Docker). Conversations themselves stay where the agents
write them (`~/.claude/projects`, `~/.codex/sessions`); the app only reads them.

## Password

Change it in Settings → Password. If you forget it:

```bash
node dist/server/cli.js set-password                                        # without Docker
docker compose exec -it naget-agent node dist/server/cli.js set-password  # with Docker
```

Either way, every browser is signed out.
