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
| `ALLOWED_ORIGINS` | none | Extra addresses the app is opened at, comma-separated, when a proxy changes the `Host` header. The first is also the address the links the app hands out start with (chat apps' Open in Hydor, links agents give to sessions and pages); without one, they use the Tailscale address while Settings → App → Use on your phone serves the app, else `http://127.0.0.1:<PORT>`. That Tailscale address needs nothing here: the app keeps it beside these |
| `TAILSCALE_BIN` | `tailscale` on the `PATH`, else where Tailscale's installers put it | The `tailscale` command Use on your phone runs. Named here, it is the only one used |
| `IDLE_STOP_HOURS` | `3` | Stop an agent process after this long without activity (`0`: never). History is kept, and it resumes on the next message |
| `UPLOAD_KEEP_DAYS` | `14` | Delete the app's copies of attachments after this many days |
| `UPLOAD_MAX_MB` | `2048` | And keep at most this much of them, oldest deleted first |
| `CLAUDE_BIN` | `~/.local/bin/claude`, else `claude` | The Claude Code executable. One named here is used as it is: the app does not update it |
| `CODEX_BIN` | the Codex installed with the app | The Codex executable. One named here is used as it is: the app does not update it |
| `DISABLE_AUTOUPDATER` | unset (`1` in Docker) | Claude Code's own: `1` turns its updates off, and the app's daily update then leaves your Claude Code alone too (**Update now** in Settings → Accounts → Agent programs still updates it) |
| `CLAUDE_CONFIG_DIR` | `~/.claude` | Where Claude Code keeps its data. Set for the app (or a `HOME` of its own given it), its agents' Claude Code uses it too, so they keep their sign-in and sessions where the app reads them |
| `CLAUDE_CODE_TMPDIR` | your `TMPDIR`, else `/tmp` | Claude Code's own: where it keeps its temporary files (in `claude-<your user id>`). Set here or in your shell, the agents' Claude Code uses it. Unset and where Claude Code can't make that folder (`/tmp` closed to you), the app points it at `tmp/` in `DATA_DIR`, since Claude Code does not start without it |
| `CODEX_HOME` | `~/.codex` | Where Codex keeps its data. Set for the app (or a `HOME` of its own given it), its agents' Codex uses it too |
| `HYDOR_EMBED` | `on` | `off`: search by meaning starts off on a new install, so the app never sets it up on its own (a test's or a demo's copy); Settings → Memory still turns it on. Once Settings has turned it on or off, that wins |
| `HYDOR_EMBED_THREADS` | half the CPU's cores, at most 4 | Threads memory's search by meaning uses (it runs on the CPU, through ONNX Runtime) |
| `HYDOR_EMBED_PYTHON` | a private environment the app sets up | A Python with ONNX Runtime 1.23+, tokenizers and NumPy to run it with instead |
| `HYDOR_EMBED_MODEL_DIR` | `~/.cache/hydor/mDenseOn-ONNX-<revision>` (`~/Library/Caches/hydor/…` on a Mac, `%LOCALAPPDATA%\hydor\cache\…` on Windows, the data folder in Docker) | Where its model's files are kept (`model_q8.onnx`, `tokenizer.json`, `tokenizer_config.json`, from algoprog/mDenseOn-ONNX on Hugging Face) |
| `HF_ENDPOINT` | `https://huggingface.co` | A Hugging Face mirror to download that model from, and the models of word suggestions |
| `HYDOR_SUGGEST` | `on` | `off`: word suggestions are never set up on this server (Settings → Capabilities → Word suggestions says so, and turning it on is refused): for a test's or a demo's copy |
| `HYDOR_SUGGEST_PYTHON` | a private environment the app sets up in `DATA_DIR/suggest/venv` | A Python that has PyTorch (the CPU build), tokenizers, NumPy and safetensors, used as it is, to run word suggestions' engine and its learning |
| `HYDOR_SUGGEST_MODEL_DIR` | `~/.cache/hydor/suggest/…` (`~/Library/Caches/hydor/suggest/…` on a Mac, `%LOCALAPPDATA%\hydor\cache\suggest\…` on Windows, `DATA_DIR/suggest/models/…` in Docker) | A folder that holds the small model's files (`config.json`, `model.safetensors`, `tokenizer.json`, `gate.json`, `switch.json`, `calibration.json`, `lid.json`, `lid.bin` and `replay/`): used as it is, with no download |
| `HYDOR_SUGGEST_GGUF` | the 8-bit or 4-bit Qwen3.5-0.8B-Base file the app downloads from `ggml-org/Qwen3.5-0.8B-Base-GGUF` | A GGUF file to run as word suggestions' language model instead |
| `HYDOR_SUGGEST_LLAMA_SERVER` | llama.cpp's ready-made `llama-server` for this system, from GitHub, in `DATA_DIR/suggest/llama` | A `llama-server` of your own (one built for your graphics card, say), used as it is. Where llama.cpp has no ready-made build for the system (a Raspberry Pi, say), word suggestions need it |
| `HYDOR_PICTURES_DEVICE` | the graphics card when there is one they can use | `cpu`: the picture tools (taking backgrounds out, erasing) run on the CPU and set up without ONNX Runtime's NVIDIA build (2.1 GB), leaving the graphics card to other work. Otherwise an NVIDIA GPU runs them through CUDA (the GPUs in `CUDA_VISIBLE_DEVICES` when it is set) and a Mac's through Core ML |
| `HYDOR_FFMPEG`, `HYDOR_FFPROBE` | `ffmpeg`, `ffprobe` on the `PATH` | The ffmpeg programs that take videos' frames and stills (and the pictures of videos in a project's Files) and sounds' lengths and shapes, and voice samples are read with |
| `HYDOR_UPDATE_FEED` | the newest GitHub release's `hydor-mac.json`, `hydor-windows.json` or `hydor-linux.json` | Where a desktop app looks for new versions |
| `HYDOR_URL`, `HYDOR_TOKEN` | this computer's Hydor, with the command line's own token | For the `hydor` command: another computer's Hydor, by its address and an access token made there (the same as `--server` and `--token`) |
| `NO_COLOR`, `FORCE_COLOR` | colours in a terminal, none when piped | For the `hydor` command: `NO_COLOR` turns its colours off, `FORCE_COLOR` on |

## What it stores

In `DATA_DIR`: the password hash (`auth.json`), the session index and search database (`hydor.db`; `naget-agent.db` or `web-agent.db` in older installs),
the agents' programs the app installed (`clients/`), logs of running agents (`runs/`), Claude Code's temporary files where `/tmp` can't have them (`tmp/`), attachments waiting to be sent (`uploads/`), files deleted in the file
browser (`trash/`), the pictures of files shown in a project's Files, kept for a month (`thumbs/`), the kept images, videos and sounds with their stills and frames (`media/`), the folders the kept
notebooks run in (`notebooks/`), notebook kernels and the terminal server, the `hydor` command's token (`cli-token`)
and its input history (`terminal-history`), and search by meaning's private Python
environment (`memory/venv`: set up a minute after the app first starts, unless it was turned off in Settings → Memory). Its model goes to Hugging Face's cache
(`~/.cache/huggingface`, or `memory/hf` in Docker). Once word suggestions are turned on, `suggest/` holds their Python environment (`venv/`),
llama.cpp (`llama/`) and the small model that learned from what you write (`personal/`, readable by you alone); their other models go to a cache folder
of your user account, as `HYDOR_SUGGEST_MODEL_DIR` says. Conversations themselves stay where the agents
write them (`~/.claude/projects`, `~/.codex/sessions`); the app only reads them.

Wiki memory's files are not in `DATA_DIR`: they are plain Markdown in the wiki folder from Settings → Memory → Wiki memory, an
absolute path on the computer running Hydor (at first `.wiki` in the task folders' root, `~/Hydor/.wiki`), with each project's wiki
inside it under `projects/` (or, if you choose that setting, in each project's own folder). In Docker, keep it in a folder you
mount, so it outlives the container. The setting itself, and whether wiki memory is on, are kept in `DATA_DIR`.

## Password

Change it in Settings → Password. If you forget it:

```bash
node dist/server/cli.js set-password                                        # without Docker
docker compose exec -it hydor node dist/server/cli.js set-password  # with Docker
```

Either way, every browser is signed out, and addresses paused after ten wrong passwords can sign in again.
