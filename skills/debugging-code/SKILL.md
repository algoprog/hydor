---
name: debugging-code
description: Use when code gives a wrong result, throws an exception or stack trace, crashes or hangs, or a test fails or flakes, and the cause is not yet known. Not for problems outside code (a device, a network, a process); see troubleshooting.
category: coding
triggers: [stack trace, traceback, find the bug, failing test, flaky test, git bisect, segfault, debugger, debug this code, uncaught exception, cannot read propert*, off-by-one]
---

# Debugging code

The method is the troubleshooting skill's: see it fail, gather facts, test one hypothesis at a time, fix
the cause, prove the fix. Code gives you sharper tools for each step: a test that fails on demand, the
stack trace, a debugger, targeted logging and the version history. This skill is about those tools.

## 1. Make it fail on demand, as a test if you can

- Turn the report into one command that fails. A failing test is best: it runs in seconds, points at the
  behaviour, and becomes the regression test. Otherwise a small script, or a `curl` against a local server.
- Run only that: `pytest tests/test_cart.py::test_total -x`, `npx vitest run src/cart.test.ts -t "total"`,
  `npx jest src/cart -t "total"`, `node --test --test-name-pattern="total"`, `go test ./cart -run TestTotal`,
  `cargo test total`.
- Pin what varies: random seeds, the clock, `TZ=UTC`, the locale, the input data, dependency versions (the
  lockfile), environment variables.
- Flaky: run it in a loop until it fails, `for i in $(seq 50); do <command> || break; done`, then alone and
  with its neighbours. Order dependence means shared state: globals, database rows, files, time, ports.
- Fails only elsewhere (CI, production): list what differs (versions, config, data, environment, OS,
  CPU architecture, time zone) and reproduce that difference locally. Compare the database schema too:
  test fixtures often build a simpler one, without the NOT NULL, unique and foreign key rules of the real
  one (`PRAGMA table_info(orders)` in SQLite, `\d orders` in psql, on both, side by side).

## 2. Read the error properly

- Python prints the most recent call last; JavaScript, Java and Go print the error first, then the frames
  from where it was raised. Find the first frame in this project's code, not in a library: start there.
- Follow the chain: "Caused by:", "During handling of the above exception…", an error's `cause`. The
  original error (the innermost "Caused by:" in Java, the first traceback Python prints) is usually the
  real one; the rest are consequences.
- Read the message as a precise claim. "Cannot read properties of undefined (reading 'id')": which object
  was undefined, and where should it have been set? `KeyError: 'price'`: which dict, filled by whom?
- Get more detail when the trace is short or unreadable: `node --stack-trace-limit=50`,
  `node --enable-source-maps` for TypeScript or bundled code, `python -X faulthandler` for segfaults,
  `py-spy dump --pid <pid>` for a hang, `RUST_BACKTRACE=1`, `GOTRACEBACK=all`.
- A long log with many errors is usually a few bugs repeated. Count each kind once before reading
  (numbers and ids become placeholders), then start with the most common:

  ```bash
  grep -E 'ERROR|Error|Exception' app.log | sed -E 's/[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}/<id>/g; s/0x[0-9a-fA-F]+/<hex>/g; s/[0-9]+/N/g' | sort | uniq -c | sort -rn | head
  ```

- Search the exact message in the code (`git grep -n "message text"`) to see where it is raised. When it
  comes from a dependency, search the web for it in quotes with the library's name and version
  (`web_search`), and its issue tracker. Read the whole thread: the fix that worked is often near the
  end, and may hold only for some versions.

## 3. Narrow it down

Pick the cheapest tool that answers the question you have now:

| Question | Tool |
| --- | --- |
| Which change broke it? | `git bisect` |
| When did this line change, and why? | `git log -S "quantity" -p -- src/` (commits that added or removed the text), `git blame -L 40,60 src/cart.py` |
| What are the values at this line? | A breakpoint, or one targeted log line |
| Which part of the input triggers it? | Halve the input until the failure goes away |
| Which layer is wrong? | Check the data at each boundary: request in, query, result, response out |
| This code or the dependency? | Reproduce with the library alone; read its source in `node_modules` or `site-packages` |

**When it used to work, bisect.** Commit or stash your work first, and keep the script outside the repo
so checkouts do not change it:

```bash
git bisect start
git bisect bad                 # this commit is broken
git bisect good v1.4.0         # a commit or tag that worked
git bisect run /tmp/repro.sh   # exit 0 = good, 1-127 = bad, 125 = cannot test this one (skip)
git bisect reset               # back to where you started
```

**Debuggers** (commands and flags in `references/debuggers.md`):

- Node: `node --inspect-brk app.js`, then Chrome at `chrome://inspect` or the editor's debugger; a
  `debugger;` statement pauses there.
- Python: `breakpoint()` on the line; `pytest --pdb` stops at the failure; `python -m pdb -c continue
  script.py` stops where it crashes.
- An agent's shell usually cannot type into an interactive debugger, and the command would wait forever.
  Script it instead: `python -m pdb -c "b shop.py:4" -c c -c "p item" -c q shop.py < /dev/null`, or
  post-mortem with `-c continue -c "p item" -c q`. For Node, prefer logging.

**Logging that helps:** log at boundaries and just before the failing line, with types and sizes
(`repr()` in Python, `util.inspect()` or `JSON.stringify()` in Node), ids, and which branch ran. Mark the
temporary lines (`// DEBUG-cart`) so you can find and remove every one.

## 4. Check the assumptions

Most bugs are a wrong belief about one of these. Check each with a print or an assertion, not by reading:

- **Inputs:** the type (the string "1" or the number 1), null, None or undefined, empty, whitespace,
  encoding and byte order marks, units, naive versus time-zone-aware dates, float rounding, case.
- **State:** what ran before (caches, memoisation, singletons, globals), stale build output (`dist/`,
  `.next/`, `__pycache__`), the wrong config file or environment variable, data not as you think it is.
- **The code that actually runs:** the server restarted? the container rebuilt? the module you edited is
  the one imported (`python -c "import pkg; print(pkg.__file__)"`, `node -p "require.resolve('pkg')"`)?
  the dependency version you expect (`npm ls pkg`, `pip show pkg`)? A linked local copy instead of the
  released package (`pip show` lists an "Editable project location", `npm ls` shows `-> ./path`) is often
  the bug itself; if you did not put it there, ask before switching it back.
- **Time and concurrency:** a promise not awaited or not returned, two requests racing, a callback firing
  twice, a timeout or a retry hiding the first error.
- **Edges:** off by one, an empty list, the first or last item, a value exactly at a limit.

## 5. Fix the cause, then lock it in

- Say the bug in one sentence before fixing: "The total is wrong because quantity is None for items
  added through the API, which skips the default." If you cannot, keep narrowing.
- Fix where the bad value is made, not where it surfaces. A `try/except`, a `?? 0` or a retry at the
  symptom hides the bug.
- Search for the same mistake elsewhere (`git grep -n`): bugs come in families.
- Keep the reproducing test as a regression test, named for the behaviour ("treats a missing quantity as
  one"), not "test bug 123". See the test-first skill.
- Run the whole suite, not only the one test. Remove every temporary log line, `breakpoint()`,
  `debugger;`, `.only` and skip: `git diff` shows them.
- If it failed in a scheduled job, a service or a container, run the exact command that runs it there
  (same user, interpreter, working folder and environment) and read its exit code and log: a passing unit
  test does not prove that path. For a job, compare what it produced with what it took in (rows read and
  written, files in and out): "finished" with half the output is still broken.
- Report the cause, the fix and the check that proves it (see evidence-before-done).

## Pitfalls

- Changing code before you can make it fail: you cannot tell whether the change helped.
- Reasoning about what a value "must be" instead of printing it.
- Trusting the top frame: library code often fails because of bad input from the project's code.
- Debugging stale code: a server that did not restart, a cached build, an old container image.
- An interactive debugger in a shell that cannot take input.
- Widening a `catch` or adding a retry so the symptom goes away.
- Leaving debug output, skipped tests or `.only` in the diff.
- Reading a long log line by line, so one repeated error looks like many.
- Fixing a library by editing its installed copy (`node_modules`, `site-packages`): the next install
  undoes it. Upgrade, pin or work around it in the project, and say so.
