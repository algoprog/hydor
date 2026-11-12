# Hydor in a terminal: the `hydor` command

*The spec the first build of the `hydor` command followed (10 November 2026); change it as the build teaches better.*

## What it is

One command, `hydor`, that does in a terminal what people do in the app's pages, for the parts that make sense
without a GUI: talk to an agent (start a session, follow its work live, approve what it asks, answer its questions,
steer it), run one request and get the answer back (for scripts), and look after sessions, models, tiers, agents,
tasks and usage. It is a client of the same server the web app uses (its HTTP API and its `/ws` event socket), so a
session started in the terminal shows in the web app and the other way round, and nothing about sessions is
implemented twice.

## Where the code goes

- `server/cli.ts` stays the one entry (`dist/server/cli.js`): the maintenance commands it has stay as they are
  (`set-password`, `setup-token`, `access-token`, `service …`, `update`, `app …`). Everything new is dispatched from it
  to modules under `server/tui/`, imported lazily as `app` does with `./apps/cli.ts`, so a maintenance command never
  loads the terminal client. With no command at all it now opens the chat (it used to print the usage; `hydor help`
  and `hydor --help` print it, and so does an unknown command, with exit code 2).
- `bin/hydor.mjs`: a two-line Node launcher (`#!/usr/bin/env node`, then import `../dist/server/cli.js`); `package.json`
  gets `"bin": { "hydor": "bin/hydor.mjs" }`. `install.sh` links it into `~/.local/bin/hydor` when that folder is on the
  PATH (say so; never fail the install over it). The `Dockerfile` links it into `/usr/local/bin`.
- No new npm packages: Node 22's own `fetch`, `readline`, `tty`, `util.parseArgs`/`styleText`, and the `ws` package the
  server already depends on. The shared types (`shared/types.ts`, `shared/children.ts`, `shared/tiers.ts`,
  `shared/features.ts`) are imported, not copied.
- Tests: `server/tui/tui-test.ts`, a script like every other test here (docs/development.md; `scripts/test.mjs` finds
  it by its name).

## Reaching the server

1. `--server URL` and `--token TOKEN`, or `HYDOR_URL` and `HYDOR_TOKEN`: another machine's Hydor (the token is one
   `hydor access-token` printed there). The token goes as `Authorization: Bearer …` on every request and on the
   socket's upgrade; the server's `onRequest` hook (server/index.ts) accepts it for `/api/` and `/ws` alike.
2. Otherwise this computer's: the port from the service's env file and `PORT` as `server/cli.ts` already reads them
   (`server/config.ts`), at `http://127.0.0.1:<port>`. Its token is made once straight in the database
   (`createAccessToken(db, …)`, server/machines.ts, the way `access-token` does) and kept in `<dataDir>/cli-token`
   (mode 0600): the same file and name ("This computer’s command line") as `hydor app …` already uses, so Settings →
   Machines lists one token for the command line. A kept token the server refuses (401) is made again once.
3. Nothing answers `/api/health` there: start the server in the background (`node dist/server/index.js`, detached,
   its output appended to `<dataDir>/logs/terminal-server.log`), wait for health (say "Starting Hydor…" on stderr
   after a second, give up after 60 s with where the log is), and leave it running when the command ends: sessions
   keep working, as with the service. `hydor serve` runs the server in the foreground instead (what `npm start` does),
   and `hydor status` says which server is used, its version, whether the service is installed, and what is running.

`server/tui/client.ts` holds this: `connect(opts) → { api(method, path, body?), socket }`, errors as the server words
them (`{ error }` bodies), and an event socket that subscribes (`{t:'sub', key}`), pings every 25 s, reconnects with
backoff and subscribes again, like `web/src/lib/ws.ts`.

## Commands

```
hydor [message]                 open the chat in this folder (the message starts the session)
hydor chat [message]            the same, by name
hydor -c | --continue           carry on the latest session of this folder
hydor resume [key]              carry on a session: the one named, or pick from a list
hydor run <message>             one request, no questions asked: prints the answer and ends (-p is short for it)
hydor sessions                  the sessions (latest first): what each is doing
hydor show <key>                a session's conversation, printed
hydor send <key> <message>      a message to a session (queued when it is working)
hydor stop <key>                stop a session's turn
hydor models [program]          the models each program offers
hydor tiers [show|set|reset|team]   which model each tier means, and how sessions use them
hydor agents                    your agents (Researcher, Writer… and your own)
hydor tasks [run <id>]          scheduled tasks, and running one now
hydor usage                     plan usage and limits
hydor status                    the server, its version, what is running
hydor serve                     run the server here, in the foreground
hydor open [key]                the address of the web app (or a session in it); --browser opens it
```

Options that start or continue a session (chat, run, resume): `--agent claude|codex|custom|<acp id>` (the program;
"custom" is the ACP agent `console`), `--model <name>|auto`, `--effort <level>`, `--mode ask|edits|plan|full` (mapped to
the program's own mode names with `agentMode` in shared/assistants.ts; a program's own mode name is accepted too),
`--as <agent>` (one of the user's agents, by name or id: `extra.assistant`), `--cwd <folder>` (default: where the
command runs), `--worktree`, `--cap <dollars>` (`extra.capUsd`), `--no-memory` (`extra.memory = false`), `--title`.
What is not given comes from what the web app's start page picked last (`GET /api/bootstrap` → `start`, see
web/src/lib/start.ts; read only, the terminal does not change them), then the server's defaults.

Every listing command takes `--json` (the API's own objects, one JSON document) and is plain aligned text otherwise.

### `hydor run`

For scripts and for people who want one answer. It starts a session with the message (or reads the message from
stdin when none is given and stdin is not a terminal), follows it until the work is done, prints the agent's last
reply to stdout, and ends.

- "Done" is: the session's turn ended, none of its child sessions is working, and nothing waits in its queue (a
  lead that ended its turn to wait for helpers is woken by their replies, so wait for the turn after them; poll
  `GET /api/sessions/:key` and the children's summaries, and keep listening on the socket).
- Progress goes to stderr as short lines when it is a terminal (each step's one-line title, helpers starting and
  finishing); `--quiet` turns it off.
- An approval or a question with nobody to answer: with `--mode full` (or `--yes`, the same) none are asked; otherwise
  the run stops, says what it was asked on stderr and exits 3 (the session stays, to answer in the app or with
  `hydor resume`).
- A turn that ends with nothing in it (no reply, no turn's end: the plan at its usage limit, an error at its start)
  fails the run (exit 1) a few seconds on, with the reason: the agent's error, or "Claude Code is at its usage limit
  (Weekly · all models): it lifts in 46h 41m" from `GET /api/usage`. (The first real run found this: it used to end
  as done with an empty reply.)
- `--json`: one object on stdout when it ends: `{ key, url, status ('done' | 'failed' | 'needs-answer' | 'timeout' |
  'interrupted'), reply, model, costUsd, tokens: { in, out, cached }, durationMs, turns, children: [{ key, title, label,
  tier, costUsd, status }], error?, asks? }`; `costUsd` and `tokens` are the lead's and its helpers' together, `asks` is
  what it waits for. `--stream-json`: one JSON
  line per event as it happens (`{type:'item', item}`, `{type:'live', live}`, `{type:'note', note}`, then
  `{type:'result', …}` as above).
- `--timeout <seconds>`: stop the turn and exit 124 when it takes longer.
- Exit codes: 0 done, 1 the session failed or the server refused, 2 bad usage, 3 it needs an answer, 124 timed out,
  130 interrupted (Ctrl+C stops the turn first).

### The chat

A conversation in the terminal's own scrollback (no full-screen mode: what was said stays above, selectable, and
works over SSH and in tmux). One region at the bottom is redrawn while the agent works; everything else is printed
once and left.

```
 HYDΩR 0.52.0   ~/code/shop   Claude Code · Automatic · Ask                    /help
────────────────────────────────────────────────────────────────────────────────────
› add a --json flag to the export command

  ● Read src/export.ts
  ● Searched "parseArgs" in src/
  ◆ Helper started: Add --json to export · Sonnet 5.5 · Standard
  ● Edited src/cli.ts  +14 −2
  ● Ran npm test  (passed, 8.1 s)

  The flag is in: `shop export --json` prints one object per row…

  ✓ 1m 04s · $0.31 · Opus 5.5 · 1 helper
⠹ Working · 12 s · esc to stop                                    (while a turn runs)
›
```

- **What shows**: the user's message; the agent's text as it streams, Markdown drawn for a terminal (headings bold,
  lists, quotes, `code` and fenced code set apart and never re-wrapped, links as text with the address after it,
  tables aligned when they fit and left as written when they do not), wrapped to the width by words; thinking as one
  dim line ("Thought for 8 s") unless `--thinking`; each tool step as one line from `ToolInfo.title` (its `label` when
  it has one), with what matters of its result (exit code and time for a command, +added −removed for an edit, an
  error in red with its first line); a turn's end as one line (time, cost, model, helpers). Follow `web/src/features/session`
  (items.tsx, outline.ts, Timeline.tsx) for what each kind of item says and how steps fold; `-v` shows each step's
  output (its first lines).
- **Live**: items come over the socket as `items` (persisted, with `reset`) and `live` events whose `overlay.items` are
  the ones still streaming and whose `overlay.patches` change tool steps in place (see `web/src/lib/store.ts` for how
  the page merges them). Print an item once it is final; show what is still streaming in the redrawn region (the
  last lines of the text, the running step, a spinner with the elapsed time), so nothing printed ever has to change.
- **Helpers**: a note of kind `child` (`GET /api/sessions/:key/notes`, and `note` events; `ChildNote` in
  shared/children.ts) is a line when a child session starts ("Helper started: title · label"), and its reply coming
  back is the user item `childReplyOf` (shared/children.ts) recognises: one line ("Helper finished: title", stopped or
  failed in its colour). `/helpers` lists them with what each is doing and what it cost; `/helpers <n>` prints one's
  conversation. A note of kind `tier` (new, below) is one line.
- **Approvals and questions** (`overlay.approvals`, `ApprovalRequest`): the request with its detail (a command, a
  diff's summary), then its options as numbered choices with single keys (`y` the first allowing option, `n` deny, a
  digit for any); a question (`questions`) as a numbered list per question, several picks where it allows, "other" as
  free text; a form (`form`) field by field. Answer with `POST /api/sessions/:key/approvals/:id`
  (web/src/features/session/Approval.tsx and QuestionForm.tsx show the bodies). What the terminal cannot show (a
  signature pad, an app's card with secrets) says so and gives the session's address in the web app.
- **The input line**: a small editor of its own in raw mode (not `readline`): arrows, Home/End, Ctrl+A/E/K/U/W,
  Alt+←/→ by word, history with ↑/↓ (kept in `<dataDir>/terminal-history`, last 500), Enter sends, Alt+Enter or
  Ctrl+J or a trailing `\` adds a line, a paste comes in whole (bracketed paste) with its line breaks, Tab completes
  `/commands`, `@` paths relative to the folder, and model names after `/model`. Ctrl+C: stops the turn when one
  runs, clears the line when there is text, else says "Ctrl+C again to leave" and leaves on the second; Ctrl+D on an
  empty line leaves; Esc stops the turn. While the agent works the line stays usable: Enter queues the message
  (`POST /api/sessions/:key/queue`), shown as "queued".
- **Slash commands**: `/help`, `/new [message]`, `/sessions` (pick one to carry on), `/model [name|auto]`,
  `/effort [level]`, `/mode [name]`, `/agent [name]` (switch the session's agent of yours:
  `PUT /api/assistants/session/:key`), `/helpers`, `/tiers`, `/usage`, `/cost` (this session and its helpers),
  `/stop`, `/rename <title>`, `/open` (its address in the web app), `/quit`. Without an argument a command that
  picks (model, effort, mode, agent, sessions) shows a numbered list to choose from. Any other `/name` goes to the
  agent as it is (the program's own commands and skills, as `GET /api/catalog/:agent` lists them in `commands`, which
  Tab completes; `GET /api/sessions/:key/commands` lists the shell commands a session ran, not these).
- **Not a terminal** (piped): `hydor` with stdin piped reads it as the message and behaves as `run`; with stdout
  piped there are no colours, no spinner and no redrawn region. `NO_COLOR` and `--no-color` turn colours off;
  `FORCE_COLOR` turns them on.
- **Look**: the app's own plain words ("Working", "Needs you", "Finished"), one accent colour, dim for what is
  secondary, red only for errors, green only for success. Widths follow the terminal (`process.stdout.columns`,
  redrawn on resize), East Asian wide characters and emoji counted as two columns.

### Tiers in the terminal

The server side of tiers is being built on another branch; the terminal codes against this contract and degrades
when a server does not have it yet (an older Hydor on another machine):

- A session may start with `model: "auto"` (`POST /api/sessions`): Automatic. The server picks the model: the Best
  tier's for the program, or the Max tier's when the request reads as a hard problem. The terminal's default model
  for a new session is `auto` when `GET /api/models/tiers` answers with a `team` whose `on` is true (`hydor tiers team
  off` turns that default off; `--model auto` and `/model auto` still work while a `team` is there), unless a model is
  named, the start page's last pick for that program is another model, or the agent of yours it starts as thinks with a
  tier of its own (the server then picks that tier's model).
- Tiers are `quick`, `standard`, `best` and `max` (labels Quick, Standard, Best, Max; `shared/tiers.ts` has them:
  import `TIERS` and `tierLabel`, and code for `max` being there or not).
- `GET /api/models/tiers` → `{ tiers, defaults, team?: { on: boolean, hard: boolean } }` where `tiers[program][tier]` is
  `{ model?, effort? }` for programs `claude`, `codex`, `console`. `PUT /api/models/tiers` takes `{ tiers?, team? }`.
  `hydor tiers` prints the table (a row per tier, a column per program, the model's label from the program's catalog)
  and the two team settings; `hydor tiers set <program> <tier> <model> [--effort <level>]`, `hydor tiers reset`,
  `hydor tiers team on|off`, `hydor tiers hard on|off` change them.
- A session note of kind `tier` has data `{ event: 'auto' | 'stepUp', tier, label, why? }`: "Automatic picked Max
  (Fable 5.2): why" or "Stepped up to Max (Fable 5.2): why". One line in the chat, and in `run`'s progress.

## Tests

`server/tui/tui-test.ts`, with a scratch `DATA_DIR` under `/tmp` and no network beyond 127.0.0.1:

- Pure parts: arguments to options (every command), Markdown to terminal lines at several widths (wrapping, code
  blocks untouched, wide characters), a tool step's line for each category, the turn line, a child's lines, an
  approval's choices and the body each key sends, the editor's keys (feed bytes, read the line and cursor), paste.
- Against a small fake server in the test (`node:http` and `ws` on 127.0.0.1, checking the bearer token): `run` end to
  end (start, items and live events streamed, a helper's note, done only after the helper's reply and the lead's next
  turn, `--json`'s object, the exit codes for a failed turn, an approval with nobody to answer, a timeout), `sessions
  --json`, `tiers` show and set, a socket that drops and comes back.
- The chat itself in a pseudo-terminal (`node-pty` is already a dependency), its screen read back through a headless
  `@xterm/xterm` (already a dependency): type a message, see a streamed reply, answer an approval with a key, queue a
  message while a turn runs, paste lines, Ctrl+C twice to leave, at 80 and 120 columns; a question (one pick, several
  picks in one read, your own words) and a form field by field; Tab; Esc stopping a turn; a resize while it works;
  and with stdout not a terminal.

## Docs that change with it (AGENTS.md)

A guide topic of its own, `docs/guide/27-terminal.md` ("Hydor in a terminal"), with `web/src/features/guide/topics.ts`
knowing it; `docs/features.md`, `README.md`, `docs/install.md` (the maintenance commands there are spelled
`node dist/server/cli.js …`: `hydor …` is the short way once it is linked, both keep working), `docs/development.md`
for the test. The Chinese and Greek guide, the search box's catalog and vectors, and the release notes are done
after the two branches are merged.

## What the first build changed or settled

- **A word that reads like a command**: the first word is the command when it is one; otherwise the words are the
  chat's first message. A single lowercase word that is no command (`hydor sesions`) is taken for a typo: "Unknown
  command" with the usage and exit 2 (a one-word message goes as `hydor chat hello`).
- **The start page's last picks** give the program, its model, effort and mode, the agent of yours it starts as (unless
  that is General), memory and the spending cap; not the worktree or the folder (they belong to the start page's own
  folder). On another computer's Hydor no folder is sent unless `--cwd` names one there.
- **Short keys**: `hydor sessions` shows the shortest start of each id (8 characters at least) that tells the listed
  sessions apart (Codex's ids begin with the time they were made, so 8 were not enough), and the commands take any
  unique start of an id or key. Piped, its lines are not cut to a width.
- **"Done" for `run`**: not working, no helper working or owing its reply (each helper's turns are counted against the
  replies the lead got; a helper stepped up is not waited for; a reply is waited for at most 120 s after its helper
  stopped), no background helper running (`live.backgroundTasks` entries whose `kind` contains "agent" and whose
  `status` is `running`, the session's or a helper's: Claude Code's own Agent tool in the background, after which the
  lead ends its turn idle and is woken by each one's end; a command left running there, kind "local_bash" such as a
  dev server, may never end and does not count, as on the tiers branch's server; a "Background task …: …" notice after the last turn's end means a woken turn is on its way, so that
  turn's end is not the last), nothing queued (a held queue does not count), settled 1.2 s with the turn's end in the conversation, or
  settled 15 s without one. Its socket is backed by a look at the session and its helpers every 2 s.
- **Background helpers in the chat** (the same "agent" kinds): while one runs, the region says so ("At work in the background: Check the docs",
  "2 helpers at work in the background: …") and the status line says each one's end wakes the agent; a "Background
  task completed: …" notice is one line ("◆ Finished in the background: …", stopped and failed in their colours);
  `/helpers` lists them (running, and the background tasks that ended), and `/stop` stops them with the turn
  (`POST /api/sessions/:key/tasks/:taskId/stop`), as `run` does on `--timeout` and Ctrl+C.
- **`send`** posts to `/message` when the session is not working and to `/queue` when it is.
- **The chat's input** treats a line and its Enter in one read as typed (a paste without bracketed paste is text with a
  line break inside it), and keys that answer a card are taken one by one even when several come in one read.
- **A message that comes to nothing** in the chat (a usage limit answers before the agent ever shows as working) gets a
  red line saying why, three seconds on.
- **The guide's picture** (`docs/guide/images/terminal.webp`, `-light.webp`) is drawn from the chat's own renderers
  (the Printer and the region's lines, as ANSI) in the app's dark and light colours and screenshotted with headless
  Chromium; `scripts/guide-shots` has no step for it yet.
- **Not tried against a real agent**: the environment's Claude Code account was at its weekly limit when the build was
  tried (Codex was not to be used), so the real runs only reached the limit, which is how the empty-turn case above was
  found. Everything else was tried against the test's fake server and, for the listing commands and the chat's own
  commands, a scratch server built from the branch.

