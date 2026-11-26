# Command-line tools for coding agents

Three small programs that save a coding agent round trips: `waitfor`, `edits` and `sym`. They are developer tools kept
in this repository, for the agents that work on Hydor (or on any other project) from your shell. The app does not hand
them to agents by itself: you put them on your `PATH` and tell your agents they are there (below). None calls a model,
and none needs anything installed beyond Node.js 22 (the tree-sitter parser `sym` uses is in `lib/sym/`, with its licence).

| Program | Takes the place of |
|---|---|
| `bin/waitfor` | `for i in $(seq ...); do sleep 5; ...; done; tail log` loops that wait for a job |
| `bin/edits` | a script that does `text.replace(old, new)` on several files, with checks written by hand |
| `bin/sym` | `grep -n "export function X" -A30`, then `sed -n A,Bp` to read the part you found |

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

## Put them on your PATH

```bash
for t in waitfor edits sym; do ln -s "$PWD/scripts/agent-tools/bin/$t" ~/.local/bin/$t; done   # from the repository's root
```

The links point into your checkout, so a new version of the tools comes with a `git pull`. Check that `~/.local/bin` is
on your `PATH`.

## Tests

```bash
node --test "scripts/agent-tools/test/*.test.mjs"  # the three suites, from the repository's root
node --test scripts/agent-tools/test/sym.test.mjs # or one of them
npm run check                                      # runs them when something here changed
```

`npm test` runs them too (`server/agent-tools-test.ts`). They work from any folder and clean up after themselves. The
`waitfor` suite waits on real timers and takes about a minute; on a machine that is busy with other tests, one of its
short waits can run late, so run it alone first when it fails.

## Tell your agents

Add this to your agents' instructions (an `AGENTS.md`, `CLAUDE.md` or a message at the start of a session):

```
Shell tools on PATH (each has --help):
- waitfor: wait for a long job in ONE call instead of sleep/poll loops. Conditions: --pid, --proc, --file,
  --log FILE --match REGEX, --http URL, --unit, --slurm ID [--via 'ssh host'], --until 'cmd'; add --fail REGEX to
  stop at the first crash line, --tail FILE:N for the output, --timeout 30m. `waitfor -- cmd args` runs a command and
  waits for it. Run it as a background command when the wait may exceed a few minutes.
- edits: apply several exact search/replace edits across files in one atomic call (a script of `=== path` sections
  with <<<<<<< SEARCH / ======= / >>>>>>> REPLACE blocks on stdin). Nothing is written unless every block matches
  exactly once; it prints the changed lines with numbers, so no re-read is needed. `--check` then runs the repo's check.
- sym NAME...: a definition with its full body and exact line range (TypeScript, JavaScript, Python, Rust);
  `sym --refs NAME` for references, `sym --outline FILE` for a file's declarations. Use grep for text and strings.
Batch independent lookups into one command where you can.
```

## What is in this folder

`bin/` has the three programs (`sym` is a short launcher for `lib/sym/`). `lib/sym/grammars/` holds the five grammars
`sym` reads code with, and `lib/sym/vendor/web-tree-sitter/` the parser that runs them: both are copied unchanged from
npm packages, each with a `SOURCE.txt` of where from and their checksums (the licences are in `NOTICE` at the root of
the repository). `lib/sym/dev/` has the scripts used to make and check them (`vendor-grammars.mjs`) and to check `sym`'s
answers on a repository of yours (`verify-real.mjs`, `fuzz-names.mjs`, `scan-outline.mjs`: each takes the repository's
path). `fixtures/` is the code the tests read, all written for them.
