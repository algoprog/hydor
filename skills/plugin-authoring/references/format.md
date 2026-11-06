# The plugin format

Hydor reads plugins in the open Agent Plugins 1.0 format (agent-plugins.org), plus its own
extension for what the format leaves to each app. It also reads Claude Code's layout
(`.claude-plugin/plugin.json`, `.mcp.json`) for skills and servers.

## plugin.json

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "trip-tools",
  "version": "1.0.0",
  "description": "Skills and tools for planning trips.",
  "author": { "name": "Alex", "email": "alex@example.com", "url": "https://example.com" },
  "homepage": "https://example.com/trip-tools",
  "repository": "https://github.com/alex/trip-tools",
  "license": "MIT",
  "keywords": ["travel", "planning"],
  "extensions": {
    "com.naget.agent": {
      "title": "Trip tools",
      "category": "planning",
      "icon": "globe",
      "agents": ["claude", "codex", "custom", "acp"],
      "requires": {
        "plugins": { "python-data": "^1.0.0" },
        "pip": ["requests>=2.31,<3"],
        "python": ">=3.10",
        "npm": { "@modelcontextprotocol/sdk": "^1.0.0" },
        "commands": ["git", { "name": "ffmpeg", "hint": "brew install ffmpeg", "optional": true }],
        "files": [{ "url": "https://example.com/airports.csv", "path": "airports.csv", "sha256": "…" }],
        "keys": [{ "name": "WEATHER_API_KEY", "description": "From weather.example.com", "optional": true }]
      }
    }
  }
}
```

- Only `$schema` and `name` are required. Allowed top-level fields: `$schema`, `name`, `version`,
  `description`, `author`, `homepage`, `repository`, `license`, `keywords`, `extensions`.
- `extensions.com.naget.agent` (all optional):
  - `title`: the name people see; `category`: writing, documents, research, planning, data, creative,
    coding, ai, work or app; `icon`: puzzle, database, chart, film, mic, notes, book, scan, code, globe,
    image, mail, calendar, search, wrench, sparkles, ai.
  - `agents`: which agents get it (all four by default).
  - `requires.plugins`: other plugins by name with a semver range; built-in ones are added first.
  - `requires.pip` and `requires.python`: Python packages, in an environment at `${PLUGIN_DATA}/venv`.
  - `requires.pipNvidia`: Python packages added after `pip` only on a computer with an NVIDIA GPU, such as
    `nvidia-cublas-cu12` and `nvidia-cudnn-cu12` for CTranslate2 or `onnxruntime-gpu`; its servers find the CUDA
    libraries they bring (`LD_LIBRARY_PATH`, or `PATH` on Windows). If they fail to install, it still works, on the CPU,
    so a server should try the GPU and fall back to the CPU.
  - `requires.npm`: Node packages, in `${PLUGIN_DATA}/node/node_modules` (installed without their
    install scripts).
  - `requires.commands`: programs looked for on the computer; missing ones are shown with their hint.
  - `requires.files`: https downloads into `${PLUGIN_DATA}/files/<path>`, checked against sha256.
  - `requires.keys`: vault keys (capitals, digits, underscores) given to its servers by name.

## mcp.json

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  "mcpServers": {
    "trips": { "type": "stdio", "command": "python3", "args": ["${PLUGIN_ROOT}/server/trips.py"], "env": { "CACHE": "${PLUGIN_DATA}/cache" } },
    "docs": { "type": "streamable-http", "url": "https://mcp.example.com/mcp" }
  }
}
```

- stdio: `command` (one program: a bare name, or `./path` in the plugin), `args`, `env`, `cwd`
  (`./…`, `${PLUGIN_ROOT}…` or `${PLUGIN_DATA}…`; the plugin's folder when left out).
- streamable-http: `url` (https; http only for localhost) and `headers` (never secrets).
- The old `sse` transport is shown but not used.
- Every stdio server also gets `PLUGIN_ROOT` and `PLUGIN_DATA` in its environment, the plugin's own
  Python and Node packages first on `PATH`, and the keys it names.

## Other parts

- `skills/<name>/SKILL.md`: one folder per skill, its name the folder's; `scripts/`, `references/`
  and `assets/` beside it as needed.
- `com.naget.agent/instructions.md`: a few lines added to every agent's instructions while it is on.
- `files/`: files of its own (data, templates, pictures), reached at `${PLUGIN_ROOT}/files/…`.
