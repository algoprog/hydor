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
| `HYDOR_EMBED_THREADS` | half the CPU's cores, at most 4 | Threads memory's search by meaning uses (it runs on the CPU, through ONNX Runtime) |
| `HYDOR_EMBED_PYTHON` | a private environment the app sets up | A Python with ONNX Runtime 1.23+, tokenizers and NumPy to run it with instead |
| `HYDOR_EMBED_MODEL_DIR` | `~/.cache/hydor/mDenseOn-ONNX-<revision>` (`~/Library/Caches/hydor/…` on a Mac, `%LOCALAPPDATA%\hydor\cache\…` on Windows, the data folder in Docker) | Where its model's files are kept (`model_q8.onnx`, `tokenizer.json`, `tokenizer_config.json`, from algoprog/mDenseOn-ONNX on Hugging Face) |
| `HF_ENDPOINT` | `https://huggingface.co` | A Hugging Face mirror to download that model from |
| `HYDOR_PICTURES_DEVICE` | the graphics card when there is one they can use | `cpu`: the picture tools (taking backgrounds out, erasing) run on the CPU and set up without ONNX Runtime's NVIDIA build (2.1 GB), leaving the graphics card to other work. Otherwise an NVIDIA GPU runs them through CUDA (the GPUs in `CUDA_VISIBLE_DEVICES` when it is set) and a Mac's through Core ML |
| `HYDOR_FFMPEG`, `HYDOR_FFPROBE` | `ffmpeg`, `ffprobe` on the `PATH` | The ffmpeg programs the Library takes videos' frames and stills and sounds' lengths and shapes with, and voice samples are read with |
| `HYDOR_UPDATE_FEED` | the newest GitHub release's `hydor-mac.json`, `hydor-windows.json` or `hydor-linux.json` | Where a desktop app looks for new versions |
| `HYDOR_URL`, `HYDOR_TOKEN` | this computer's Hydor, with the command line's own token | For the `hydor` command: another computer's Hydor, by its address and an access token made there (the same as `--server` and `--token`) |
| `NO_COLOR`, `FORCE_COLOR` | colours in a terminal, none when piped | For the `hydor` command: `NO_COLOR` turns its colours off, `FORCE_COLOR` on |

## What it stores

In `DATA_DIR`: the password hash (`auth.json`), the session index and search database (`hydor.db`; `naget-agent.db` or `web-agent.db` in older installs),
the agents' programs the app installed (`clients/`), logs of running agents (`runs/`), Claude Code's temporary files where `/tmp` can't have them (`tmp/`), attachments waiting to be sent (`uploads/`), files deleted in the file
browser (`trash/`), the Library's images, videos and sounds with their stills and frames (`media/`), the folders the Library's
notebooks run in (`notebooks/`), notebook kernels and the terminal server, the `hydor` command's token (`cli-token`)
and its input history (`terminal-history`), and search by meaning's private Python
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
