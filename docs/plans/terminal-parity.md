# Everything the app does, in the terminal too

The user's call (12 November 2026): every setting and feature of the app's pages works from the `hydor` command as
well. This plan says how, so that the parts built at the same time fit together. It adds to
[terminal.md](terminal.md), which built the chat, `run` and the first listing commands.

## What "everything" means here

- **Every area of the app gets a command**, a noun, with verbs for what its page does: list, show, make, change,
  turn on and off, run, remove. The areas and their verbs are listed below.
- **Every option of the Settings page** is read and changed with `hydor settings`, from one table that names each
  option's endpoint. A test fails when the search box's catalog (`shared/find-catalog.ts` OPTIONS) has an option the
  table does not cover, so a new setting cannot be forgotten.
- **What only a page can do** (drawing a signature, a sign-in in a browser, the slides, sheet, picture and diagram
  editors, a theme's colours) is reached with `hydor open <page>`, which prints the page's address and opens it with
  `--browser`. The command never pretends: such a verb says it opens the page.
- **Anything else**: `hydor api <METHOD> <path>` calls any endpoint of the app's API (`docs/guide/90-api.md`), as the
  pages do; `hydor find <words>` searches everything as the search box does; `hydor guide [topic]` reads the guide.
- **In the chat**, `/hydor <command…>` runs any of these without leaving the conversation.

## Conventions every command follows

- **Grammar**: `hydor <area> [verb] [args…] [options]`. Areas are nouns (`projects`, `memory`, `tasks`); without a
  verb, an area lists (`hydor projects` = `hydor projects list`). The commands that exist keep working as they are
  (`hydor sessions`, `show`, `send`, `stop`, `models`, `tiers`, `agents`, `tasks`, `usage`, `status`, `open`, `app`).
- **Naming things**: wherever a command takes one of something, it takes its id, a unique start of its id, or its
  name or title (any case, when unique). Two or more matches: a usage error listing up to five of them.
- **Output**: on a terminal, aligned columns, a mark before a state (as `hydor sessions`), dim for what is secondary,
  cut to the width; piped, the same columns without colours or cutting. `--json` prints what the API returned, as it
  returned it (2-space indented): scripts rely on it, so it never changes shape for looks. `show` prints its fields as
  aligned `name  value` lines and its long text (a description, instructions, a note, a guide topic) drawn as Markdown
  by the chat's renderer.
- **Changing things**: fields as options (`--name`, `--description`); a long text from `--file <path>`, from stdin
  with `-`, or, on a terminal with neither, in your editor (`$VISUAL`, `$EDITOR`, else `nano`, else `vi`) on a scratch
  file holding the current text. Saving it unchanged changes nothing.
- **Removing**: asks `Remove “<name>”? [y/N]` on a terminal; `-y`/`--yes` answers yes; with no terminal and no `-y` it
  refuses (exit 2) rather than guess.
- **Exit codes**: 0 done, 1 the server refused or failed (its message), 2 wrong usage (what to type instead).
- **Another computer's Hydor**: every command works with `--server`/`--token` (or `HYDOR_URL`/`HYDOR_TOKEN`).
- **Words**: the app's own labels, in plain words, as the guide uses them. No file names in what people read.

## The framework (server/tui/areas/)

- `kit.ts`: the types and the helpers every area uses.
  - `Area { name, aliases?, summary, group, verbs: Verb[] }`; `group` places it in `hydor help`.
  - `Verb { name, aliases?, args: Arg[], options?: Record<string, OptionSpec>, summary, help?, examples?, run(ctx, args, values) }`;
    `Arg { name, kind, optional?, rest? }`. `kind` says what completes there: session, project, agent, task, app,
    run, page, skill, plugin, mcp, key, note, experiment, machine, connection, account, setting, section, topic,
    route, place, file, dir, or text (nothing to complete).
  - `Ctx { conn, look, o, out(lines), json(value), confirm(question), edit(text, ext), readText(arg) }`. Commands
    write only through `ctx`, never to process.stdout, so the chat can run them too.
  - `table(rows, { head?, marks? })`, `fields(pairs)`, `pickOne(list, given, { id, names, what })` (the naming rule
    above), `markdown(text)`.
- `index.ts`: the list of areas, one import a line.
- `args.ts` gives each area's verb options to the parser after the area and verb are known (strict, so a typo still
  says "did you mean"); `hydor help`, `hydor help <area>` and `hydor help <area> <verb>` come from the registry, as
  does Tab completion: the verbs, the options, and each argument's kind, listed from the server by
  `completion.ts` (one loader a kind, the same 700 ms cap).
- `main.ts` hands an area's command to its verb with a `Ctx` that writes to the terminal.

## The areas and their verbs

The endpoints are in `docs/guide/90-api.md` (the guide's API topic); each verb uses the ones the page uses.

| Area | Verbs |
| --- | --- |
| `sessions` | list (as now), search `<words>`, rename, archive, unarchive, pin, unpin, read (mark read), snooze `<until>`, move `<project>`, fork `[message]`, goal `[text]` / `--clear`, share (a read-only link), changes (files changed), commands (commands run), queue (list, clear, remove), delete. `show`, `send`, `stop` stay as they are, and are also verbs here. |
| `projects` | list, show, new, rename, edit (description, instructions), files (its documents: list, add, remove), sessions, remove |
| `guidelines` | show, edit (`--project`, `--session`; none: every session's) |
| `agents` | list (as now), show, new, edit, remove |
| `memory` | list (`--scope`), search, show, add (`--scope`), edit, forget, profile (show, edit) |
| `skills` | list, show, on, off, add (from a folder or file), remove |
| `plugins` | list, show, on, off, add (from where the page takes them), remove |
| `mcp` | list, add, edit, on, off, remove |
| `keys` | list (names only, never values), set `<NAME>` (asked hidden, or from stdin), remove |
| `connections` | list, connect `<service>` (opens the sign-in page), disconnect |
| `accounts` | list, add (as the page does it), remove, and which one sessions use |
| `machines` | list, add, remove (`hydor access-token` stays) |
| `tasks` | list (as now), show, run (as now), new, edit, pause, resume, runs, remove |
| `apps` | list, show, run (its form's fields as options, or `--input`; prints the answer), runs, show a run, remove; `hydor app …` (the files: new, folder, dev, try, export, import) stays as it is |
| `library` | list (`--kind`), search, show (a document's text; the rest, what it is), export `--to <format>` `-o <file>`, open, remove |
| `experiments` | list, show, stop |
| `inbox` | list, show |
| `settings` | (no verb, on a terminal: a browser of the sections and their options to change), list `[section]`, get `<option>`, set `<option> <value>`, open `[section]` |
| `find` | `<words>` (`--in <places>`): everything the search box finds, each with its address |
| `guide` | `[topic] [section]`: the guide in the terminal; without a topic, the topics |
| `open` | `[session key or page]`: any page's address (`settings memory`, `library`, `projects/<id>`), `--browser` opens it |
| `api` | `<METHOD> <path>` (`-d '<json>'`, `-d @file`, `-d -`): any endpoint, its JSON printed |

## Settings

- `server/tui/settings-table.ts`: for each option of `shared/find-catalog.ts` OPTIONS (by section and the words the
  page shows), its id in the terminal (`<section>.<slug of the words>`, such as `general.resume-after-usage-limits`),
  what kind of value it takes (switch, choice with its values, number with its range, text, list, secret, action, or
  page-only), how to read it (endpoint and field) and how to change it (method, endpoint, body), from the page's own
  code (`web/src/features/settings/` and the pages each section shows).
- Settings kept on each device (theme, language, sound, what Enter does while an agent works, terminal suggestions)
  live in each browser: the table says so, and the chat's own equivalent applies where there is one.
- `hydor settings` on a terminal: the sections as the page groups them (App, Agents, Capabilities), then a section's
  options with their values; Enter changes one (a switch flips, a choice offers its values, a text or number is typed,
  an action runs after a yes, a page-only option prints its address). `list`, `get`, `set` and `open` do the same
  from scripts, and `--json` gives the values.
- `server/tui/settings-test.ts` fails when an option of the catalog has no row in the table, or a row names no option.

## In the chat

- `/hydor <command…>`: runs the command with the chat's connection; what it prints shows above, `confirm` asks with
  the chat's picker, `edit` hands the terminal to the editor as `!` does. The completion menu offers the commands after
  `/hydor `, and their verbs and arguments after that.

## Tests and docs

- Each area has a test script (`server/tui/areas/<area>-test.ts`) with a fake connection: its verbs call the right
  endpoints with the right bodies, resolve names, refuse to remove without a yes, and print what they should, `--json`
  included. Tab completion and help come out of the registry, so `completion-test.ts` checks them for every area.
- The guide's terminal topic (`docs/guide/27-terminal.md`, in Chinese and Greek too) gains a section per group of areas
  and one on settings; `docs/features.md` and the README say the terminal does everything the app does.
