# Command-line tools for coding agents

Small programs for coding agents: `waitfor`, `edits` and `sym`, which save round trips, and `leancheck`, which says
whether the proofs in a Lean file hold. They are part of Hydor: every
agent session the app starts (Claude Code, Codex, Custom and the other ACP agents) finds them on its `PATH` and is told
about them, in a checkout, in Docker and in the desktop apps (below). You can also use them from your own shell and
tell your own agents about them (below). None calls a model, and none needs anything installed beyond Node.js 22 (the
tree-sitter parser `sym` uses is in `lib/sym/`, with its licence), but `leancheck`, which needs Lean 4.

| Program | Takes the place of |
|---|---|
| `bin/waitfor` | `for i in $(seq ...); do sleep 5; ...; done; tail log` loops that wait for a job |
| `bin/edits` | a script that does `text.replace(old, new)` on several files, with checks written by hand |
| `bin/sym` | `grep -n "export function X" -A30`, then `sed -n A,Bp` to read the part you found |
| `bin/leancheck` | reading `lake build`'s output and hoping a proof holds |

Each has `--help`.

## waitfor

Waits for a long job in one call and prints one short result, instead of an agent polling again and again. It can wait
for a process to exit (`--pid`, `--proc`), a file to appear or go (`--file`, `--gone`), a line in a log (`--log` with
`--match`), a web address to answer (`--http`), a systemd unit (`--unit`), a Slurm job (`--slurm`, with `--via 'ssh host'`
for a login node) or a command to succeed (`--until`). `--fail REGEX` stops at the first line that says the job crashed,
`--tail FILE:N` prints the end of a log, and `--timeout 30m` bounds the wait.

```bash
waitfor --log build.log --match 'DONE|BUILD OK' --fail 'Traceback|FATAL' --timeout 30m --tail build.log:20
waitfor --timeout 20m --progress 'epoch \d+' -- python train.py --epochs 50   # runs the command and waits for it
```

An agent should run it as a background command when the wait may be longer than a few minutes.

Limit: a log that is emptied and grows past its old size again between two checks is not noticed (`--every` sets how
often it looks).

## edits

Applies several search-and-replace edits, across any number of files, in one call. It reads a script from standard input:
a `=== path` line for each file, then blocks of `<<<<<<< SEARCH`, the old text, `=======`, the new text and
`>>>>>>> REPLACE`. Nothing is written unless every block matches, and then it prints the changed lines with their
numbers, so the agent does not need to read the files again. `--dry-run` only checks, and `--check` runs the project's
check afterwards (`scripts/check` if the project has one, else `npm run check`; in Hydor, `npm run check`).

```bash
edits <<'EOF'
=== server/example.ts
<<<<<<< SEARCH
const limit = 10;
=======
const limit = 20;
>>>>>>> REPLACE
EOF
```

Limit: the old text must be matched exactly (every space and line break), and it must occur exactly once in the file;
for a short text, include a neighbouring line. `SEARCH all` or `SEARCH 3` replaces every occurrence, or says how many
there must be. A line of `=======` in the old text needs the JSON form (`--help` shows it).

## sym

Finds where something is defined and prints it whole, with its doc comment and exact line numbers. It reads the code with
a parser, so braces in strings and comments do not confuse it, and it needs no index: it parses only the files that
contain the name.

```bash
sym sessionPath Widget            # the full bodies of two definitions
sym --refs HttpError --no-tests   # where something is used (not in comments or strings)
sym --outline server/sessions.ts  # a file's declarations with their line ranges
```

Limits: it understands definitions in TypeScript, JavaScript, Python and Rust files only (grep is still the tool for
text, strings and other languages). A name that is everywhere (`get`, `index`) is slow to look up, because every file
that has the word has to be parsed. When it cannot be sure where a definition ends (a file with a syntax error, or a
language form it does not know) it says "extent unsure" or "heuristic extent" in the header: look at those lines before
you edit them.

## leancheck

Says whether the proofs in a Lean 4 file really hold, and exits 0 only then. It is ok when the file builds (in a Lake
project, its imports first), nothing is left as `sorry`, each theorem named with `--theorem` (else every theorem and
lemma of the file) depends only on the standard axioms (`propext`, `Classical.choice`, `Quot.sound`), and Lean's
`leanchecker` accepts every declaration of the file and of the project's own files it imports.

```bash
leancheck Proofs/Main.lean                                 # every theorem of the file
leancheck Proofs/Main.lean --theorem main                  # just that theorem
leancheck Proofs/Main.lean --theorem main@3fa2c1d9ab12     # and it still states what it did: a goal's check
leancheck Proofs/Main.lean --allow-sorry                   # a skeleton: gaps pass, everything else still fails
```

Each theorem is printed as `name@pin`, then what it states, as Lean reads it, and the definitions of your own that
the statement rests on. The pin is 12 hexadecimal digits of a hash of the elaborated type, written down term by term,
with those definitions' content: names of variables and of your own definitions, binder brackets, spacing, comments
and proofs do not change it; any other term, type, number, universe, instance or library name does, and so does what
one of those definitions says. Another version of Lean or Mathlib may read the same text otherwise and give another
pin. With `--allow-sorry` a theorem that still has a gap is printed as `gap`, not `ok`.

Exit codes: 0 verified; 1 not verified (errors, gaps, axioms that are not standard); 2 the question is wrong or cannot
be put (no such file, no such theorem, a malformed pin, no Lean); 3 a statement changed from its pin; 64 usage.

It does not trust what the file can change. `#print axioms` can be redefined by the file's own `macro_rules`, and
`set_option debug.skipKernelTC true` puts in a proof the kernel never saw, reported as using no axioms (both with Lean
4.36). So the axioms are read by a small program of ours that loads the compiled file without running its syntax
(`lib/lean/core.mjs`), and `leanchecker` plays the declarations back through the kernel. The statement is printed by
the same program with Lean's and the downloaded libraries' notation only, never the file's or the project's, so a
notation of one's own cannot make it read as another. The verdict cannot say whether the statement is the one you
meant: agree that first, then hold the proof to its pin.

Lean is found as your own `lake` and `lean` on `PATH`, else the one Hydor set up (`HYDOR_LEAN_DIR`, which the app's
launcher sets). A snippet or loose file that imports Mathlib needs Mathlib added in the app.

## How the app gives them to agents

Agents' shells have no Node.js on their `PATH` (the tools start with `#!/usr/bin/env node`), so the app does not link the
scripts. At each start the server (`server/shelltools/`) writes a small `sh` launcher for each tool into
`<data folder>/shelltools/bin`, which runs the app's own Node.js (`process.execPath`) on the tool's script in the app's
own folder (`exec "<node>" "<app>/scripts/agent-tools/bin/<tool>" "$@"`; `sym` also gets `HYDOR_RG`, the ripgrep that
comes with Codex, when there is one, and `leancheck` gets `HYDOR_LEAN_DIR`, where the app keeps its own Lean). A launcher is rewritten only when the app's folder or its Node.js changed, which
is what every new version of a desktop app does (Windows and AppImages run from a copy of the server for each version);
on Windows each also has a `.cmd`, and Git's bash, in which agents run commands, uses the one without an ending. The
server then tries each launcher once, in the background, with a `PATH` of the system's folders and no node (`--help` for
`waitfor`, `edits` and `leancheck`; for `sym`, the outline of a three-line TypeScript file, which proves its parser loads), logs one
line for each that fails, and from then on puts the launchers' folder first on the `PATH` of every session it starts (and last on the `PATH` a goal's
checks run with) and
adds a text to its instructions that names only the tools that passed. `HYDOR_SHELL_TOOLS=0` turns all of it off
([configuration](../../docs/configuration.md)); there is no setting. The desktop apps ship `bin/` and `lib/` (not `test/`
or `fixtures/`: `desktop/scripts/stage.sh`), and CI fails a packed app whose launchers cannot run the tools
(`desktop/scripts/smoke.mjs`).

## Put them on your PATH

For your own shell (the app's agents do not need this):

```bash
for t in waitfor edits sym leancheck; do ln -s "$PWD/scripts/agent-tools/bin/$t" ~/.local/bin/$t; done   # from the repository's root
```

The links point into your checkout, so a new version of the tools comes with a `git pull`. Check that `~/.local/bin` is
on your `PATH`.

## Where they run

Linux, macOS and Windows, on Node.js 22. On Windows agents run commands in Git's bash (Git for Windows), which the app finds as it does for every command.

- `waitfor` reads the process table (`--pid`, `--proc`) from `/proc` on Linux, from `ps` where there is no `/proc` (macOS), and from PowerShell on Windows, where `--proc` needs it. `--unit` (systemd) is Linux only and is refused elsewhere with a message that says so. On Windows `--until` and `--slurm` need Git's `sh`, and it says so before it starts waiting. A command started with `--` is stopped with `taskkill` on Windows.
- `edits` tries its final rename again on Windows when a file is briefly held by another program (five tries), and puts every file back if it still cannot.
- `sym` finds the files that hold a name with ripgrep first (the file `HYDOR_RG` names, which the app's launcher sets to the ripgrep that comes with Codex; else `rg` on the `PATH`), then `git grep`, then plain `grep`. The three give the same files; ripgrep is the fastest (about 1.0 s against 1.3 s with `git grep` in a large repository). `SYM_BACKEND=rg|git|grep` (for tests) uses one only.

Honestly: the macOS and Windows paths are covered by tests that stand in for `ps`, PowerShell and `taskkill` on Linux (and a hidden `SYM_FAKE_PLATFORM`), and by the desktop builds' smoke check in CI (`desktop/scripts/smoke.mjs`), which runs the tools through their launchers on each system; the three suites themselves have not run in full on a real macOS or Windows machine.

## Tests

```bash
node --test "scripts/agent-tools/test/*.test.mjs"  # the four suites, from the repository's root
node --test scripts/agent-tools/test/sym.test.mjs # or one of them
npm run check                                      # runs them when something here changed
```

`npm test` runs them too (`server/agent-tools-test.ts`); the launchers, the `PATH` agents get and the staging list have their
own test (`server/shelltools/shelltools-test.ts`). They work from any folder and clean up after themselves. The
`waitfor` suite waits on real timers and takes about a minute; on a machine that is busy with other tests, one of its
short waits can run late, so run it alone first when it fails.

## Tell your own agents

Agents the app starts are told already. For others (an `AGENTS.md`, `CLAUDE.md` or a message at the start of a session),
this is the text the app gives its own (`SHELL_TOOLS_TEXT` in `server/shelltools/index.ts`):

```
Shell commands this app adds to your PATH (each has --help):
- waitfor: wait for a long job in ONE call instead of sleep/poll loops. Conditions: --pid, --proc, --file,
  --log FILE --match REGEX, --http URL, --unit, --slurm ID [--via 'ssh host'], --until 'cmd'. Add --fail REGEX to stop
  at the first crash line, --tail FILE:N to see the output, --timeout 30m. `waitfor -- cmd args` runs a command and
  waits for it. Run it as a background command when the wait may take more than a few minutes.
- edits: several exact search/replace edits across files in one atomic call. It reads a script on stdin: `=== path`
  sections holding <<<<<<< SEARCH / ======= / >>>>>>> REPLACE blocks. Nothing is written unless every block matches
  exactly once, and it prints the changed lines with their numbers, so there is no need to re-read the files. Use it
  when changing more than one place.
- sym NAME...: a definition with its whole body and exact line range (TypeScript, JavaScript, Python, Rust).
  `sym --refs NAME` lists references, `sym --outline FILE` a file's declarations. Use grep for text and strings.
- leancheck FILE.lean: whether its proofs hold (it builds, no sorry, standard axioms only, kernel re-check), with what
  each theorem states and a pin of that statement. Exits 0 only then, so a goal's command check can be "leancheck
  Proofs/Main.lean --theorem NAME@PIN" (with the pin of the agreed statement, so a changed one fails: exit 3).
  --theorem NAME[@PIN], --allow-sorry. Needs Lean set up.
```

## What is in this folder

`bin/` has the four programs (`sym` is a short launcher for `lib/sym/`, `leancheck` for `lib/lean/`, which the app's
Lean tools use too). `lib/sym/grammars/` holds the five grammars
`sym` reads code with, and `lib/sym/vendor/web-tree-sitter/` the parser that runs them: both are copied unchanged from
npm packages, each with a `SOURCE.txt` of where from and their checksums (the licences are in `NOTICE` at the root of
the repository). `lib/sym/dev/` has the scripts used to make and check them (`vendor-grammars.mjs`) and to check `sym`'s
answers on a repository of yours (`verify-real.mjs`, `fuzz-names.mjs`, `scan-outline.mjs`: each takes the repository's
path). `fixtures/` is the code the tests read, all written for them.
