# Debuggers and diagnostic flags

Commands checked with Node 22, Python 3.13 and git 2.43. Interactive sessions need a terminal you can
type into; from an agent's shell, use the scripted forms.

## Python

| Goal | Command |
| --- | --- |
| Pause at a line | Put `breakpoint()` there (Python 3.7+); `PYTHONBREAKPOINT=0` turns them all off |
| Stop where it crashes | `python -m pdb -c continue script.py` |
| Scripted, no terminal needed | `python -m pdb -c "b app.py:42" -c c -c "p order" -c "p order.items" -c q app.py < /dev/null` |
| Same for a module | `python -m pdb -m package.module` |
| Stop at a failing test | `pytest path::test_name --pdb` (add `-x` to stop at the first failure) |
| Stop at the start of each test | `pytest path::test_name --trace` |
| Re-run only what failed last time | `pytest --lf` |
| Tracebacks on a segfault or other fatal signal | `python -X faulthandler script.py` |
| Extra runtime checks and warnings | `python -X dev script.py` |
| Where a running process is stuck | `py-spy dump --pid <pid>` |

pdb commands: `p expr` print, `pp expr` pretty-print, `w` where (the stack), `u` / `d` up and down the
stack, `n` next line, `s` step into, `r` run to return, `c` continue, `b file:line` breakpoint,
`b func, condition` conditional breakpoint, `l` / `ll` list code, `display expr` show it at each stop,
`interact` a Python prompt in the current frame, `q` quit.

## Node.js

| Goal | Command |
| --- | --- |
| Pause before the first line, attach a debugger | `node --inspect-brk app.js`, then `chrome://inspect` in Chrome, or the editor's "attach" |
| Attach to a running server | Start it with `node --inspect app.js` (port 9229) |
| Terminal debugger | `node inspect app.js` (`c`, `n`, `s`, `o` out, `bt` backtrace, `sb('app.js', 42)` breakpoint, `repl`) |
| Debug a Jest test | `node --inspect-brk node_modules/.bin/jest --runInBand path/to/test` |
| Longer stack traces | `node --stack-trace-limit=50 app.js`, or `Error.stackTraceLimit = 50` in code |
| TypeScript line numbers in traces | `node --enable-source-maps dist/app.js` |
| Where warnings come from | `node --trace-warnings app.js` |
| Where an uncaught exception was thrown | `node --trace-uncaught app.js` |

A `debugger;` statement pauses there when a debugger is attached, and does nothing otherwise. In the
browser, DevTools' Sources panel does the same for front-end code; "Pause on exceptions" stops at the
throw, and the Network panel shows each request's payload and response.

## Other languages

- Go: `dlv debug ./cmd/app`, `dlv test ./pkg -- -test.run TestName`; `GOTRACEBACK=all` for every
  goroutine's stack on a panic; `go test -race ./...` for data races.
- Rust: `RUST_BACKTRACE=1` (or `full`); `rust-gdb` / `rust-lldb target/debug/app`.
- C and C++: `gdb --args ./app arg1` then `run`, `bt`; build with `-g -O0`; `-fsanitize=address,undefined`
  finds memory errors at the line that causes them.
- Java: `-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=5005`, then attach the IDE.

## Seeing what a process does

- Files it opens, missing files: `strace -f -e trace=file <command>` (Linux).
- Network calls: `strace -f -e trace=network <command>`, or the app's HTTP client debug logging.
- Environment it really gets: `cat /proc/<pid>/environ | tr '\0' '\n'` (Linux), or log it at startup with
  secrets removed.

## git bisect, more

- Skip a commit that cannot be tested (it does not build): `git bisect skip`, or exit 125 from the script.
- Look at the log so far: `git bisect log`. Start over: `git bisect reset`.
- Limit to commits touching a folder: `git bisect start HEAD v1.4.0 -- src/billing`.
- A good script: builds if needed, runs the one failing test, exits 0 when it passes and 1 when it fails,
  and exits 125 when the build itself fails.
