# Hydor in a terminal

The `hydor` command does in a terminal what you do in the app's pages: talk to an agent and follow its work as it happens, approve what it asks and answer its questions, run one request from a script and get the answer back, and look after everything the app keeps: your sessions, projects, agents, memory, skills, plugins, keys, scheduled tasks, usage and every setting. Where only a page can do it (drawing a signature, the slides and diagram editors), the command gives you the page's address. It uses the same Hydor as the app, so a session started in the terminal shows in the app, and one started in the app carries on in the terminal. Your shell completes it as you type.

![The hydor command: its welcome box, and the menu that opens when you type a slash](images/terminal.webp)

## Get the command

- **Installed with the installer** (`./install.sh`): the installer links `hydor` into `~/.local/bin` when that folder is on your PATH, and says so. Otherwise it says where the command is: `bin/hydor.mjs` in Hydor's folder, which you can run as it is or link where you keep commands.
- **With Docker**: the image has it. Run `docker exec -it hydor hydor` to talk to an agent inside the container.
- **The Mac app** puts it on your PATH by itself, every time it starts. It links `hydor` into `~/.local/bin`, `~/bin`, `/usr/local/bin` or `/opt/homebrew/bin`, the first of them that is on your PATH and yours to write to. When none is, it uses `~/.local/bin` and adds one line, marked as Hydor's, to your shell's startup file (`~/.zprofile` for zsh) so that folder is on your PATH. Open a new Terminal window afterwards. The command runs the app's own Node.js, and when the app is closed, `hydor` opens it. It does nothing from the disk image, or before you move the app to **Applications**. Inside the app, `hydor update`, `hydor service install` and `hydor serve` only say that the app does that itself.
- **The Windows and Linux desktop apps** do not put the command on your PATH yet. On Linux, the installer links it as above. From a copy of Hydor on another computer, you can still use theirs: see [Use another computer's Hydor](#use-another-computers-hydor).

`hydor help` lists everything it does, in groups with a line for each; `hydor help <command>` gives a command's usage, its options and examples, `hydor help options` lists every option, and `hydor help <command> <verb>` a verb's. The maintenance commands work under the same name: `hydor service status`, `hydor setup-token`, `hydor update` and the rest (`node dist/server/cli.js …` keeps working too). Mistype a command, an option or a verb and it says "Did you mean …?". Errors show in red.

A message that starts with a command's name goes in quotes (`hydor "find the bug in login"`), or after `hydor chat`, so it is not taken for the command.

You don't have to start Hydor first. When nothing answers on this computer, the command starts it in the background, says **Starting Hydor…** and leaves it running when it ends, so your sessions go on. `hydor status` says which Hydor it uses, its version, whether it runs as a service, and what is working.

## Tab completion in your shell

Turn it on once:

```bash
hydor completion install
```

It sets it up for the shell you use (bash, zsh or fish): it writes the script where the shell looks for it and, for zsh and for bash without bash-completion, adds one line to your `.zshrc` or `.bashrc`. Open a new terminal afterwards. Running it again changes nothing twice. `hydor completion bash` (or `zsh`, `fish`) prints the script instead, to put where you like: `source <(hydor completion bash)`.

Then Tab completes what you type: the commands, their verbs and options, and the things they take. After `hydor show ` or `hydor send `, it lists your sessions' keys, each with its title; after `--model` the models, after `--as` your agents, after `--cwd` folders; and in the same way projects, skills, plugins, settings, guide topics and more, as they are on this Hydor. If Hydor does not answer quickly, completion offers what it can without it, and never holds your shell up.

## Talk to an agent

In a folder, run `hydor`, or `hydor` followed by your message (`hydor fix the failing test`). The first message starts a session in that folder.

The chat opens with a welcome box: **HYDΩR** with its version, the folder and its git branch, and what will answer you: the program (**Claude Code**, **Codex** or **Custom**), the model (**Automatic** when the model goes by the job, on a Hydor with tiers) and the permissions mode. The mode shows in red when the agent acts without asking, and in the accent colour for plan. A line of hints follows: `/ commands · @ files · ! shell · ↑ history · Ctrl+R search · /help`.

What you see stays in the terminal's own history, so you can scroll back and copy from it, over SSH and in tmux too:

- **Your messages**, after a `›`.
- **The agent's text** as it comes, with its headings, lists, quotes, tables, links (the address after the words) and code (never re-wrapped, so what you copy runs).
- **Each step** on one line: what it read, searched, edited (with the lines added and removed), ran (with the time it took, and its exit code when it failed, with the first line of the error under it).
- **Thoughts** as one dim line, such as "Thought for 8 s". Start with `--thinking` to see them in full, and with `-v` to see the first lines of each step's output.
- **Subagents**: "Subagent started" when the agent hands part of its work to a [Hydor subagent](/guide/research#let-an-agent-hand-work-to-subagents), and "Subagent finished" (or "Subagent failed") when its reply comes back. Claude Code can also run subagents of its own in the background and end its turn while they work: the bottom lines say which are at work in the background, "Finished in the background" shows as each one ends, and the agent carries on by itself. A command it leaves running in the background, such as a dev server, holds nothing up. `/subagents` lists them all with what each is doing (and what a subagent cost).
- **The end of each turn**: how long it took, what it cost, the model, and how many subagents worked ("1 subagent", "3 subagents").

At the bottom, a few lines change while the agent works: the text still being written, the step under way, the subagents at work, a spinner in colour with the time so far (a shimmer runs over "Working"), and your input line. Press Esc or Ctrl+C to stop the turn.

### The input line

Your input sits between two thin rules, with a status line under it: the folder and its branch, the model and the mode, and the cost so far, with `/help` on the right.

- **A grey suggestion** from your earlier messages shows after what you type. **→** takes it, **Alt+→** one word of it. **Settings → App → General → Terminal suggestions** turns it off and on ([Settings](/settings?s=general&find=Terminal%20suggestions)).
- **Ctrl+R** searches your earlier messages: type some of its words, move to a match with **↑** and **↓**, and **Enter** puts it in the line without sending it, so you can change it first. **Esc** gives up.
- A message can have several lines, and a paste comes in whole.

### The completion menu

A menu opens under the line as you type, and keeps up with every key:

| Type | The menu lists |
| --- | --- |
| `/` | The commands, each with what it does: the chat's own first, then the program's own (Claude Code's commands and skills, for instance). |
| `/model `, `/mode `, `/effort `, `/agent `, `/subagents `, `/open ` | That command's values: the models, modes, efforts, your agents, the subagents, where to open. |
| `@` and a few letters | The files of the session's folder, found loosely: `@clits` finds `src/cli.ts`. End with `/` to browse that folder. |

**↑** and **↓** move, **Tab** completes the highlighted row, and **Enter** completes it and runs it (a command that needs a value opens that command's values instead). **Esc** closes the menu. Matching is loose, and a command's letters need not be next to each other: `mdl` finds `/model`.

### Pickers

`/sessions`, `/resume`, `/model`, `/effort`, `/mode` and `/agent`, typed without a value, open a picker: a list with one highlighted row. **↑** and **↓** move, typing narrows the list, **Enter** picks, **Esc** leaves. A digit still picks when the list has nine rows or fewer. `hydor resume` with no key opens the same picker of your sessions.

### Shell commands with `!`

Start a line with `!` and the rest runs as a shell command in the session's folder: `!git status`, `!npm test`. The chat hands the terminal over while it runs, so interactive programs work (`!vim notes.md`, `!htop`), and takes it back when it ends. The prompt turns yellow while the line starts with `!`. The agent does not see the command or what it printed; to show it something, say so in a message. It only works with this computer's Hydor.

### Answer what the agent asks

When the agent needs your approval, the request shows with what it is about (the command, the change to a file, the plan), and its choices under it:

- Press **y** for the first choice that allows it, **n** to deny it, or the **number** of any choice (such as "Always allow").
- To deny it and tell the agent what to do instead, type that and press Enter.

A question shows its choices numbered: press a number to pick one (several, for a question that takes several, then Enter), or type your own answer and press Enter. Esc skips it. A form asks its fields one by one: type each answer and press Enter, or press Enter to keep what it shows. A file is asked for by its path on this computer.

Some requests need the app: one about a signature, or a key for one of your apps. The terminal says so and gives the session's address in the app.

### While it works

Your input line stays yours. What Enter does with a message you send while the agent works is set by **Sending while an agent works** in [Settings → App → General](/settings?s=general&find=Sending%20while%20an%20agent%20works): **Join the turn** (the default, as in the app) puts it into the running turn, and **Wait for it** queues it, to go when the turn ends (it shows as **queued**). Whichever is set, two commands decide for one message:

- `/queue <message>` always waits for the turn to end.
- `/now <message>` always joins the running turn.

The two device settings, **Sending while an agent works** and **Terminal suggestions**, are the chat's own: set them here, with `hydor settings set general.sending-while-an-agent-works wait`, or ask the agent to change one (see [Settings](#settings)), and the chat follows at once.

### Keys

- **Enter** sends. **Alt+Enter**, **Ctrl+J**, or a `\` at the end of the line before Enter, adds a line. A paste comes in whole, with its line breaks.
- **↑** and **↓** go through your earlier messages (the last 500 are kept); in a message of several lines they move between its lines first. With the menu open they move in it.
- **←**, **→**, **Home**, **End**, **Ctrl+A** and **Ctrl+E** move; **Alt+←** and **Alt+→** move a word at a time; **Ctrl+W** deletes the word before the cursor, **Ctrl+U** and **Ctrl+K** the rest of the line before and after it.
- **Tab** opens the menu, and accepts the highlighted row. **Ctrl+R** searches earlier messages.
- **Esc** closes the menu, or stops the turn. **Ctrl+C** stops the turn when one runs, clears the line when there is text, and otherwise leaves when you press it twice. **Ctrl+D** on an empty line leaves. **Ctrl+L** clears the screen. **Ctrl+Z** suspends the chat (`fg` brings it back).

`/keys` lists them in the chat. When you leave, the session goes on: the terminal tells you how to come back to it.

### Commands

Type them in the input line (`/` lists them):

- `/help`: the commands, the keys, and a few more things (`@`, `!`), in sections: **Commands**, **Keys**, **Also**. `/keys` lists just the keys.
- `/new` (and a message): a new session in the same folder.
- `/sessions` (or `/resume`): pick another session to carry on.
- `/model`, `/effort`, `/mode`: change the model, how hard it thinks, and what it may do without asking. Without a name, each opens a picker.
- `/agent`: work as one of [your agents](/guide/agents), from the next message on.
- `/subagents`: the subagents, those in the background too, what each is doing (and what a subagent cost); `/subagents 2` shows the second subagent's conversation.
- `/tiers`, `/usage`, `/cost`: which model each tier means, your plans' usage and limits, and what this session and its subagents cost.
- `/copy`: copies the agent's last reply to the clipboard, over SSH and in tmux too. `/clear` clears the screen.
- `/queue` and `/now`: send a message to wait or to join, whichever is set ([While it works](#while-it-works)).
- `/stop`, `/rename`, `/open`, `/quit`: stop the turn and the subagents in the background, rename the session, show its address in the app, leave.
- `/hydor <command>`: run any command of the next sections in the chat ([Inside the chat](#inside-the-chat)).

Any other `/command` goes to the agent as it is, for the program's own commands and skills.

Colours are true colour where the terminal has it. `NO_COLOR` and `--no-color` turn them off, and so does a pipe.

## Carry on a session

- `hydor -c` carries on the latest session of the folder you are in.
- `hydor resume` opens a picker of your latest sessions; `hydor resume 6f1e2a3b` carries on that one.

The last few turns show first, each with its work folded into one line ("Ran 3 commands, read 4 files"); `hydor show` prints all of it.

## Choose how a session starts

These go with `hydor`, `hydor run` and `hydor resume`:

- `--agent claude`, `codex`, `custom`, or the name of [another agent program](/guide/agents-models): which program answers.
- `--model` (a model's name, or `auto` for Automatic), `--effort`, and `--mode ask`, `edits`, `plan` or `full` (or the program's own name for a mode).
- `--as Researcher`: start as one of [your agents](/guide/agents).
- `--cwd` (a folder; the folder you are in when you leave it out), `--worktree` (a branch and folder of its own), `--cap 2` (spend at most $2), `--no-memory`, `--title`.

What you leave out comes from what the app's start page picked last, then from the app's defaults.

## One request from a script

`hydor run "…"` (or `hydor -p "…"`) starts a session with your message, follows it until the work is done, prints the agent's last reply, and ends. Done means the turn ended, no subagent is still working or still owes its reply (Claude Code's own subagents in the background included, the agent's or a subagent's), and nothing waits in the queue: an agent that ends its turn to wait for its subagents is woken by their replies or their ends, and the run waits for that turn too. A command left running in the background, such as a dev server, does not hold it up. On `--timeout` or Ctrl+C, the subagents in the background are stopped with the turn. With nothing after it, it reads the message from what is piped in: `git diff | hydor run "review this change"`.

- On a terminal, short lines on the side say what happens (each step, subagents starting and finishing); `-q` turns them off.
- Nobody is there to answer, so an approval or a question stops the run, says what it was asked, and the session waits for you in the app or with `hydor resume`. With `--mode full` (or `-y`) the agent asks nothing.
- `--json` prints one object at the end: `key`, `url`, `status`, `reply`, `model`, `costUsd` (with its subagents'), `tokens`, `durationMs`, `turns`, `children` (each Hydor subagent's `title`, `label`, `tier`, `costUsd`, `status`) and `error` when it failed. `--stream-json` prints a line for each change as it happens (`item`, `live`, `note`), then that object as its last line.
- `--timeout 300` stops the turn after 300 seconds.

It ends with an exit code a script can check:

| Code | What happened |
| --- | --- |
| 0 | Done |
| 1 | The session failed (an error, or the plan's usage limit, which it names), or Hydor refused |
| 2 | The command was not used right |
| 3 | It needs an answer from you |
| 124 | It took longer than `--timeout` |
| 130 | You pressed Ctrl+C (the turn was stopped first) |

## Everything the app does, from the terminal

Each part of the app has a command of its own, with verbs for what its page does. Leave the verb out and it lists: `hydor projects` is `hydor projects list`. `hydor help` shows them grouped as below, and Tab completes the verbs, the options and the things they take.

How they all work:

- **Naming things**: wherever a command takes one of something (a session, a project, an agent, a skill…), give its id or the start of it, or its name or title (any case, when only one fits). With two or more matches it lists up to five. On a terminal, leave the name out and the command offers a list to pick from.
- **Changing things**: the fields are options (`--description`, `--name`). A long text comes from `--file <path>`, from what you pipe in with `-`, or, on a terminal with neither, from your editor (`$VISUAL`, `$EDITOR`) opened on the current text: saving it unchanged changes nothing.
- **Removing things** asks `Remove “name”? [y/N]`. `-y` (or `--yes`) answers yes. With no terminal and no `-y` it refuses, rather than guess.
- **`--json`** prints what the app's API gives, as it gave it, for scripts.
- **Exit codes**: 0 when it is done, 1 when Hydor refused or failed (it says why), 2 when the command was not used right (it says what to type).
- **Another computer's Hydor**: every command works with `--server` and `--token`.
- **Only a page can do it**: the command says so and gives the page's address. `hydor open … --browser` opens it.

### Sessions

| Command | What it does |
| --- | --- |
| `hydor sessions` | Your latest sessions, each with a mark: ● working, ● needs you, ✓ finished, ✗ error. Its verbs do what a session's menu does: `search`, `rename`, `archive` and `unarchive`, `pin` and `unpin`, `read`, `snooze`, `move` to a project, `fork`, `goal`, `share` (a read-only link), `changes` (the files it changed), `commands` (the commands it ran), `queue` (the messages waiting, and `queue clear` and `queue remove`), `show`, `send`, `stop` and `delete`. |
| `hydor inbox` | What waits on you (approvals, questions, a key an agent asked for, a skill to review): `list`, and `show` for one item, with where to answer it. |

`hydor show 6f1e2a3b` is the same as `hydor sessions show 6f1e2a3b`, and so are `send` and `stop`: the short ones stay.

```bash
hydor sessions search login          # sessions about login
hydor sessions rename 6f1e "Fix the login bug"
hydor sessions fork 6f1e "try it with a cache instead"
hydor inbox
```

### Your work

| Command | What it does |
| --- | --- |
| `hydor projects` | `list`, `show`, `new`, `rename`, `edit` (description, guidelines, the agent it starts as, folders), `sessions`, `files` (the documents it reads: `files add` and `files remove`) and `remove`. |
| `hydor tasks` | Your [scheduled tasks](/guide/tasks) and the other work that starts by itself: `list`, `show`, `new` (when it runs: `--every 2h`, `--at 09:00 --days weekdays`, `--cron`, `--once`; or `--webhook`, `--watch-feed`, `--watch-page`, `--watch-folder`), `edit`, `pause`, `resume`, `run` (now, even while paused), `runs` (the latest runs, `--reply` for the last reply) and `remove`. Watching a command or a JSON address is on the page. |
| `hydor apps` | Your [apps](/guide/apps) and the ready-made ones: `list`, `show`, `run` (the form's answers as `field=value`, or `--input` JSON; it prints the answer and what it cost), `runs`, `run-show` (one run) and `remove`. `hydor app …` (without the s) makes apps as files: `new`, `folder`, `dev`, `try`, `export`, `import`. |
| `hydor library` | The [Library](/guide/library): `list` (`--kind`, `--project`), `search`, `show` (a document's text, or what the item is), `export` (`--to pdf`, `docx`, `pptx`…, `-o file`), `open` (the address of its editor) and `remove`. |
| `hydor experiments` | Training and evaluation runs: `list`, `show` and `stop`. Starting a run is for the agents and the page. |

```bash
hydor projects new Thesis
hydor projects edit thesis --file guidelines.md
hydor tasks new --at 09:00 --days weekdays "Summarise my unread email"
hydor apps run trip-planner destination=Lisbon days=5
hydor library export "Q3 report" --to pdf -o q3.pdf
```

### Agents and models

| Command | What it does |
| --- | --- |
| `hydor models` and `hydor tiers` | The models each program offers, and which model each [tier](/guide/agents-models#tiers-a-model-for-each-kind-of-job) means (`hydor tiers set claude best opus --effort high`, `hydor tiers reset`; `hydor tiers team off` and `hydor tiers hard off` turn off **Lead with subagents** and **Max for hard problems**, and `on` turns them back on). |
| `hydor usage` | Each plan's usage and limits, and when they reset. |
| `hydor agents` | [Your agents](/guide/agents): `list`, `show`, `new`, `edit` and `remove` (the built-in ones can be copied, not changed). An agent's output fields and where its results go are set on its page (`hydor open agents`). |
| `hydor accounts` | The sign-ins of Claude Code and Codex: `list`, `add <program> <name>` (another account, signed in at once), `sign-in`, `sign-out`, `remove` and `use` (the one new sessions start with). The API key for API credit and the switches at a usage limit are settings (`accounts.*`). |

```bash
hydor agents new Bookkeeper --tools read,edit --tier standard
hydor tiers set claude best opus --effort high
hydor accounts add claude Work
hydor accounts use work
```

### What agents know and use

| Command | What it does |
| --- | --- |
| `hydor memory` | What agents remember about you: `list`, `search`, `show`, `add`, `edit`, `forget` (restorable for 30 days) and `restore`, and `profile` and `profile edit` for what every agent reads first. `--scope`, `--project` and `--session` say whose notes. |
| `hydor guidelines` | `show` and `edit` what every agent follows: for every session, for a project (`--project`) or for one session (`--session`). |
| `hydor skills` | The skills agents use: `list`, `show`, `on`, `off`, `add` (from a `SKILL.md` or a folder) and `remove`. `--agent claude` or `--agent codex` is for the skills those programs have of their own. |
| `hydor plugins` | Add-ons with skills and tools: `list`, `show`, `on`, `off`, `add` (built in, a Git address, a .zip or a folder) and `remove`. Making a plugin of your own is on its page (`hydor open plugins`). |
| `hydor mcp` | Tool servers (MCP) for Claude Code and Codex: `list`, `status` (starts each and says which work), `add`, `edit` and `remove`. |
| `hydor connections` | The [connected apps](/guide/connections) (Notion, GitHub, Gmail…): `list`, `show`, `services` (what can be connected), `connect <service>` (a key typed hidden, or a sign-in in your browser that the command waits for) and `disconnect`. Which tools of a connection are on is on its page. |
| `hydor keys` | The [vault](/guide/connections): `list` your keys' names and where each may go, `set <NAME>` and `remove <NAME>`. A value is asked for with what you type hidden, or read from what you pipe in; it is never typed as an option (your shell would keep it) and never printed. |

```bash
hydor memory add I prefer short answers
hydor memory forget 42
hydor skills off research
hydor mcp add github --env GITHUB_TOKEN -- npx -y gh-mcp
hydor keys set GITHUB_TOKEN --domain github.com
hydor guidelines edit --project thesis
hydor connections connect notion --browser
```

### Settings

`hydor settings` reaches every option of [Settings](/settings), in its three tabs (**App**, **Agents**, **Capabilities**) and their sections. Each option has an id, such as `general.resume-after-usage-limits`: its section, then its words. You may name one by that id, by its section and the start of its words (`general.resume`), or by its words alone when only one fits; Tab completes them.

On a terminal, `hydor settings` alone opens a browser: pick a section, then an option. **↑** and **↓** and typing find them, **Enter** opens a section or changes an option (a switch flips, a choice offers its values, a number or text is typed, a button asks first), and **Esc** goes back. Piped, it lists every option. For scripts and quick changes:

| Command | What it does |
| --- | --- |
| `hydor settings list [section]` | Every option with its value, or one section's. |
| `hydor settings get <option>` | One option's value and what it takes. |
| `hydor settings set <option> <value>` | Changes it: a switch takes `on` or `off`, a choice one of its values, a number a whole number, a list its items with commas (`none` empties it). A key or token is asked for hidden, or read from what you pipe in. A long text comes from `--file` or your editor. |
| `hydor settings run <option>` | Presses a button of the page (**Send a test**, **Check now**…), after asking when it removes or downloads something. |
| `hydor settings open [section]` | The address of a section or an option in the app. |

```bash
hydor settings list memory
hydor settings get general.resume-after-usage-limits
hydor settings set general.resume-after-usage-limits on
hydor settings set search.providers duckduckgo,naget
hydor settings run notifications.send-a-test
```

What the app keeps in each browser (the theme, the language, the notification sound) cannot be changed from here: such an option says so and gives the page's address. An option only the page can change does the same. The two device settings that belong to a terminal, **Sending while an agent works** and **Terminal suggestions**, are the chat's own, and `hydor settings set` changes them.

### Find, guide, open and api

- `hydor find rate limit` searches everything the search box does (**Ctrl+K**): pages, settings and their options, sessions, memory, skills… `--in settings` looks only there, `--urls` shows each result's address under it, and `--open 2` opens the second in your browser.
- `hydor guide` lists the guide's topics; `hydor guide projects` reads one in the terminal, and `hydor guide projects "what a project is"` one section of it. `--sections` lists a topic's sections.
- `hydor open` prints the app's address; `hydor open library`, `hydor open settings memory`, `hydor open project thesis`, `hydor open guide projects` or `hydor open 6f1e2a3b` (a session) print that page's. `--browser` opens it in your browser too. It is how you reach what only a page does: the editors for slides, sheets, pictures and diagrams, a signature, a theme's colours, signing in to a service.
- `hydor api GET /api/projects` calls any endpoint of the app's API and prints its JSON (`hydor api POST /api/projects -d '{"name":"Thesis"}'`; the body can come from `@file` or `-`). The endpoints are in the [API topic](/guide/api).

### Inside the chat

`/hydor <command>` runs any command above without leaving the conversation: `/hydor sessions`, `/hydor memory add I prefer short answers`, `/hydor settings get general.resume-after-usage-limits`. Its menu offers the commands after `/hydor `, then their verbs and what they take. What it prints shows above the input line, a question it asks (a removal) appears as a picker, and an editor it needs is handed the terminal, as `!` does. <!-- TODO-VERIFY: the exact behaviour of /hydor, once the chat's helper is done -->

## Look after this Hydor

- `hydor status` says whether Hydor runs, its version and address, where its data is, whether it is a service, and which sessions are working or need you (with the same marks as `hydor sessions`).
- `hydor serve` runs Hydor here, in the foreground, until Ctrl+C. `hydor service install` keeps it running as a background service, `hydor update` pulls the latest code, builds it and restarts, and `hydor set-password`, `hydor setup-token` and `hydor access-token` do what their names say. In the Mac app, `hydor update`, `hydor service install` and `hydor serve` say that the app does that itself.
- `hydor open` prints the app's address; `--browser` opens it.

## Use another computer's Hydor

Make an access token on that computer (in its [Settings → App → Machines](/settings?s=machines&find=Access%20from%20other%20machines) → **New token**, or `hydor access-token "my laptop"` there), then name it with its address:

```bash
hydor --server https://hydor.example.com --token acm_… sessions
```

or set `HYDOR_URL` and `HYDOR_TOKEN` once. Folders are that computer's: a session starts in its default folder unless you give `--cwd` with a folder there (an address on this computer itself, such as `http://localhost:8790`, keeps the folder you are in).  `!` commands only work with this computer's Hydor. On this computer, the command makes a token of its own the first time, which [Settings → App → Machines](/settings?s=machines&find=Access%20from%20other%20machines) lists as "This computer's command line". To have this Hydor show another computer's sessions and pages, add it as a machine: `hydor machines` lists the machines this Hydor uses and whether they answer, `hydor machines add Lab --url https://lab.example.com` adds one (give `--ssh <host>` instead of `--url` to reach it through SSH; its access token is typed hidden, or comes from `--file -`), and `hydor machines remove lab` stops using it.

## Colours and pipes

Colours are on in a terminal (true colour where it has it) and off when the output goes to a file or another program, and with `NO_COLOR` set or `--no-color`; `FORCE_COLOR` turns them on. When what you type is piped in (`echo "…" | hydor`), it works as `hydor run`. When only the output is piped, the conversation prints without colours or the changing lines, and each line you type is sent. Lists such as `hydor sessions` then print the same columns, without colours and without cutting what is long, so scripts can read them.

## Ask an agent

- "How do I talk to an agent from my terminal?"
- "Turn on Tab completion for the hydor command in my shell."
- "Give me a script that runs a review of my staged changes with hydor run and fails the commit when it finds a bug."
- "What does exit code 3 from hydor run mean?"
- "Set up the hydor command on my laptop to use this computer's Hydor."
- "Which hydor command lists my scheduled tasks, and how do I turn one off from the terminal?"
- "Make the terminal wait until a turn ends before it sends my message."
- "Turn off the grey suggestions in the terminal."
