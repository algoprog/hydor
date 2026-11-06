# Configuration

Settings, where the app keeps its data, and resetting the password. [Back to the README](../README.md).

Everything is optional. Set these in the environment (or in `.env` for Docker Compose, or in `~/.config/hydor.env`
for the service and the desktop apps; on Windows `%USERPROFILE%\.config\hydor.env`):

| Variable | Default | What it does |
| --- | --- | --- |
| `HOST` | `127.0.0.1` (`0.0.0.0` in Docker) | Address to listen on |
| `PORT` | `8790` | Port to listen on |
| `DATA_DIR` | `~/.hydor` (`~/.web-agent` where an older install made it) | The app's own data (see below) |
| `DEFAULT_CWD` | your home folder (`/workspace` in Docker) | Folder new sessions and terminals start in |
| `ALLOWED_ORIGINS` | none | Extra addresses the app is opened at, comma-separated, when a proxy changes the `Host` header |
| `IDLE_STOP_HOURS` | `3` | Stop an agent process after this long without activity (`0`: never). History is kept, and it resumes on the next message |
| `UPLOAD_KEEP_DAYS` | `14` | Delete the app's copies of attachments after this many days |
| `UPLOAD_MAX_MB` | `2048` | And keep at most this much of them, oldest deleted first |
| `CLAUDE_BIN` | `~/.local/bin/claude`, else `claude` | The Claude Code executable. One named here is used as it is: the app does not update it |
| `CODEX_BIN` | the Codex installed with the app | The Codex executable. One named here is used as it is: the app does not update it |
| `DISABLE_AUTOUPDATER` | unset (`1` in Docker) | Claude Code's own: `1` turns its updates off, and the app's daily update then leaves your Claude Code alone too (**Update now** in Settings → Accounts → Agent programs still updates it) |
| `CLAUDE_CONFIG_DIR` | `~/.claude` | Where Claude Code keeps its data |
| `CLAUDE_CODE_TMPDIR` | your `TMPDIR`, else `/tmp` | Claude Code's own: where it keeps its temporary files (in `claude-<your user id>`). Set here or in your shell, the agents' Claude Code uses it. Unset and where Claude Code can't make that folder (`/tmp` closed to you), the app points it at `tmp/` in `DATA_DIR`, since Claude Code does not start without it |
| `CODEX_HOME` | `~/.codex` | Where Codex keeps its data |
| `HYDOR_EMBED` | `on` | `off`: search by meaning starts off on a new install, so the app never sets it up on its own (a test's or a demo's copy); Settings → Memory still turns it on. Once Settings has turned it on or off, that wins |
| `HYDOR_EMBED_DEVICE` | the NVIDIA GPU with the most free memory, else a Mac's own GPU (`mps`), else `cpu` | Where memory's search by meaning runs (`cpu`, `cuda:1`, `mps`…); Settings → Memory can also keep it on the CPU |
| `HYDOR_EMBED_THREADS` | half the CPU's cores, at most 4 | Threads it uses on the CPU |
| `HYDOR_EMBED_PYTHON` | a private environment the app sets up | A Python with PyTorch and Transformers 5.6+ to run it with instead |
| `HYDOR_FFMPEG`, `HYDOR_FFPROBE` | `ffmpeg`, `ffprobe` on the `PATH` | The ffmpeg programs the Library takes videos' frames and stills and sounds' lengths and shapes with, and voice samples are read with |
| `HYDOR_UPDATE_FEED` | the newest GitHub release's `hydor-mac.json`, `hydor-windows.json` or `hydor-linux.json` | Where a desktop app looks for new versions |

## What it stores

In `DATA_DIR`: the password hash (`auth.json`), the session index and search database (`hydor.db`; `naget-agent.db` or `web-agent.db` in older installs),
the agents' programs the app installed (`clients/`), logs of running agents (`runs/`), Claude Code's temporary files where `/tmp` can't have them (`tmp/`), attachments waiting to be sent (`uploads/`), files deleted in the file
browser (`trash/`), the Library's images, videos and sounds with their stills and frames (`media/`), the folders the Library's
notebooks run in (`notebooks/`), notebook kernels and the terminal server, and search by meaning's private Python
environment (`memory/venv`: set up a minute after the app first starts, unless it was turned off in Settings → Memory). Its model goes to Hugging Face's cache
(`~/.cache/huggingface`, or `memory/hf` in Docker). Conversations themselves stay where the agents
write them (`~/.claude/projects`, `~/.codex/sessions`); the app only reads them.

## Password

Change it in Settings → Password. If you forget it:

```bash
node dist/server/cli.js set-password                                        # without Docker
docker compose exec -it hydor node dist/server/cli.js set-password  # with Docker
```

Either way, every browser is signed out, and addresses paused after ten wrong passwords can sign in again.
