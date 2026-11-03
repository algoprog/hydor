# Adding an app to the catalog

Apps → Connected apps lists the apps in `catalog/connections/`, one JSON file per app. Anyone can add
one, or fix one, with a pull request. Once connected, an app's tools reach every agent the person runs
in Hydor: Claude Code, Codex, ACP agents and Custom.

## What makes a good entry

- **A real MCP server, preferably the vendor's own remote one.** Use its documented address; never
  guess one. A local server (`npx`, `uvx`…) is welcome when there is no remote one, or it does
  something only a local one can (files on this computer, a database on the network).
- **One plain sentence** saying what an agent can do with it, ending with a full stop.
- **No secrets in the file.** Keys and tokens are entered by the person and kept in the vault.

## The file

`catalog/connections/<id>.json`, where `<id>` is lowercase letters, digits and dashes. The id is also
the name agents see for the server. `catalog/schema.json` describes every field; your editor can
check a file against it through the `$schema` line.

```json
{
  "$schema": "../schema.json",
  "id": "example",
  "name": "Example",
  "description": "Find, create and update projects in Example.",
  "category": "tasks",
  "icon": "example",
  "color": "#3355FF",
  "homepage": "https://example.com",
  "docs": "https://example.com/docs/mcp",
  "server": { "transport": "http", "url": "https://mcp.example.com/mcp" },
  "auth": { "type": "oauth" },
  "keywords": ["projects", "tasks"],
  "verified": { "by": "your-github-handle", "date": "2026-10-31" }
}
```

### server

- `"transport": "http"` for Streamable HTTP, `"sse"` for the older HTTP with server-sent events, with
  `"url"`.
- `"transport": "stdio"` for a command: `"command"` (one program: `npx`, `uvx`, `docker`…), `"args"`
  and `"env"`.
- `{{NAME}}` in the address, arguments or environment is filled from a field (below).

### auth

- `{ "type": "none" }`: nothing to sign in to.
- `{ "type": "oauth" }`: the person signs in in their browser. Hydor finds the sign-in server from
  the MCP server's own metadata, registers itself as a client, and uses PKCE. The sign-in comes back
  to Hydor's own address, so it works from a phone too.
  - A sign-in server that does not let apps register by themselves needs the person's own client ID.
    Say how to get one in `"help"`.
  - Add `"scopes"` only when the server's metadata does not say which to ask for.
  - Add `"params"` for extra sign-in parameters, like Google's `access_type: offline`.
- `{ "type": "api_key" }`: a key. For a remote server it goes in a header: `"header"` (default
  `Authorization`) after `"prefix"` (default `Bearer ` for Authorization). Give `"url"`, where to
  get the key. For a local server, declare the key as a secret field and use it in `"env"`.

### fields

What the person fills in when connecting:
`{ "name": "FOLDERS", "label": "Folders it may use", "placeholder": "…", "help": "…" }`.

- `"secret": true` keeps a field in the vault. A secret may only go in a local server's `"env"`,
  never in an address or an argument, because a command line is visible to other programs.
- `"optional"`, `"default"` and `"url"` (where to get it) are there when needed.

### the rest

- `"category"`: one of `docs`, `tasks`, `communication`, `calendar`, `files`, `design`, `dev`,
  `cloud`, `data`, `analytics`, `sales`, `finance`, `commerce`, `search`, `ai`, `life`, `local`.
- `"icon"`: the app's id, drawn as a letter tile in `"color"`. It may also be a generic glyph
  (`folder`, `git`, `globe`, `brain`, `clock`, `database`, `browser`, `search`, `terminal`, `mail`,
  `calendar`, `chat`, `key`, `cloud`, `list`), or `{ "svg": "<svg …>" }`: a small SVG with no
  scripts, links or images.
- `"defaultTools"`: tool names on by default, when a server has risky tools that are best turned on
  by choice. Leave it out for all tools.
- `"featured": true` is for maintainers to set.
- `"notes"`: anything to know before connecting, in a sentence or two.
- `"verified"`: who checked that the server answers as the file says, and when. `null` if nobody
  has yet; the app then marks it as not checked.

## Check before you send it

```sh
node scripts/check-catalog.mjs                    # every file against the schema and the rules
node scripts/check-catalog.mjs --probe example    # ask the server itself how it answers
```

The probe sends a remote server an MCP `initialize` and looks up its sign-in (whether it asks for
one, where, and whether apps can register by themselves). For a local server it looks the package
up on npm or PyPI. Nothing is installed or run. If you connected the app in Hydor and its Test
listed the tools, say so in the pull request.
