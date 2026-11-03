---
name: plugin-authoring
description: Use when the user wants to make, change, package or share a plugin for Hydor (skills, tool servers and instructions bundled for every agent), or to turn a skill, script or MCP server they have into one.
category: app
triggers: [make a plugin, create a plugin, build a plugin, package a plugin, plugin for hydor, turn this into a plugin]
---

# Making a plugin

A plugin bundles what agents need for one kind of work (skills, tools from MCP servers, a few lines of
instructions, its own files, and what it needs installed) so every agent the app runs gets it at once:
Claude Code, Codex, Custom and the other agents. It is a folder in the open Agent Plugins 1.0 format, so
its skills and servers also work in other tools that read the format. The full layout is in
`references/format.md`; a complete small example is in `references/example.md`.

## 1. Decide what goes in it

Ask, or work out, what the plugin is for and what agents should be able to do with it. Then pick the
smallest set of parts:

| The need | The part |
| --- | --- |
| A method agents should follow (steps, checks, pitfalls) | a skill in `skills/<name>/SKILL.md` |
| Something agents cannot do with their own tools (an API, a database, a local model) | a tool server in `mcp.json` |
| One or two things every agent should always know while it is on | `com.naget.agent/instructions.md` |
| Data, templates or scripts the skills and tools use | files in `files/` |
| Packages, programs, downloads, keys, other plugins | `requires` in the manifest's extension |

Prefer a skill over a server when the agent's own tools (shell, files, web) can do the work: skills
cost nothing to run. Write a server only for real capabilities, and keep its tools few and clear.

## 2. Make the folder

The quickest way is in the app: **Settings → Agents → Plugins → Add → Make a plugin**, then its
editor (skills, tools, needs, files, instructions). To write it by hand, make a folder (in the user's
project, or anywhere they want to keep it) with:

```
my-plugin/
├── plugin.json            the manifest: $schema, name, version, description, extensions
├── skills/<skill>/SKILL.md
├── mcp.json               only if it has tool servers
├── files/                 its own files
├── com.naget.agent/instructions.md
└── README.md              what it does, for people
```

Rules that matter (details in `references/format.md`):

- `name`: lowercase letters, digits, dashes and dots; the same everywhere you refer to it.
- `$schema` must be `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`, and mcp.json's
  `https://agent-plugins.org/schemas/1.0.0/mcp.schema.json`. No other top-level fields in either.
- A server's `command` is one program: a name on the computer (`python3`, `node`, `npx`) or `./path`
  inside the plugin. Arguments go in `args`. Never a shell line.
- `${PLUGIN_ROOT}` (the plugin's folder) and `${PLUGIN_DATA}` (its data folder, where its packages
  are installed) work in a server's `args`, `env` and `cwd`, and in skills' text.
- No secrets in the plugin: list the keys it needs under `requires.keys`; the app gives its servers
  the user's saved keys by name, in their environment.

## 3. Write the parts well

- Skills: follow the skill-authoring skill. The description starts "Use when…" and says when, not what.
- Servers: for Python with no packages, copy the small standard-library server pattern in
  `references/example.md`. Tools take full paths (servers do not run in the agent's folder), return
  short results, and raise clear errors the agent can act on. Mark tools that only read
  (`readOnlyHint`) and those that change or delete things (`destructiveHint`).
- Packages: pin a range (`pandas>=2.2,<3`), not a bare name. Python packages go in an environment of
  the plugin's own; its servers find `python` there first.

## 4. Check it, then add it

1. Read the manifest back and validate the JSON (`python3 -m json.tool plugin.json`).
2. Run each server by hand once: send it an `initialize` request on stdin and see it answer.
3. Add it in place, so edits apply to new sessions: in the app, **Plugins → Add → From a folder**;
   or as an agent, with app_api: `POST /api/plugins/inspect` with `{ "path": "<folder>" }` (it answers
   what the plugin brings and needs, and a `token`), then `POST /api/plugins/install` with
   `{ "token": "…" }`. The user confirms on a card.
4. Start a new session and use it for real: the skill loads, the tools answer.

## 5. Share it

- A .zip: **Pack into a .zip** in the plugin's menu (or `GET /api/plugins/<name>/export`). Anyone adds
  it with **Add → From a .zip file**.
- A Git repository: push the folder; others add it with **Add → From a link** (owner/repo, or a link
  to its folder on GitHub). Raise `version` with each change people should get.

## Pitfalls

- Fields outside the format's list in plugin.json or mcp.json (they are ignored, or the server is
  skipped): app-specific settings go under `extensions` → `com.naget.agent`.
- A server that only works in the author's folder: paths must come from `${PLUGIN_ROOT}`.
- Long instructions: they go to every agent in every session; two to five lines is plenty.
- Naming a skill like a built-in one (research, writing…): the built-in one wins and the plugin's is
  left out.
