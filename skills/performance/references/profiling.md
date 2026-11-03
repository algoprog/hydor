# Profiling, tool by tool

Commands checked with Node 22, Python 3.13 and py-spy 0.4. Profile the same reproducible case you use
for timing.

## Node.js

**CPU, from start to exit**

```bash
node --cpu-prof --cpu-prof-dir=prof app.js      # writes prof/CPU.<date>.<pid>...cpuprofile when the process exits
```

Open the file in Chrome DevTools (Performance panel, "Load profile") or in VS Code. For a server, stop it
cleanly (Ctrl+C) after exercising the slow path, so the profile is written.

**Live, with DevTools**

```bash
node --inspect app.js        # then chrome://inspect, "inspect" under the target
```

- Performance panel: record, exercise the slow path, stop. Look at the bottom-up view for self time and
  the call tree for inclusive time.
- Memory panel: take a heap snapshot, repeat the action many times, take another, and compare
  ("Comparison" view). Objects whose count grows with each repetition are the leak; "Retainers" shows
  what holds them.

**Other options**

- `node --heap-prof app.js` writes a `.heapprofile` (sampled allocations) on exit.
- `node --prof app.js` then `node --prof-process isolate-*.log > processed.txt`: V8's own tick profiler, a
  text report.
- In code: `performance.now()` around a section; `console.time('label')` and `console.timeEnd('label')`.
- Event loop delay (a busy CPU blocking requests): `perf_hooks.monitorEventLoopDelay()`.

## Python

**cProfile, the whole run**

```bash
python -m cProfile -o prof.out script.py
python -m pstats prof.out
# at the prompt:  sort cumtime    stats 25    callers <function>    quit
python -m cProfile -s cumtime script.py | head -40   # quick text summary
```

`cumtime` is the time in a function including what it calls; `tottime` excludes callees. Start with the
largest `cumtime` in your own code, then look for the largest `tottime` inside it.

**py-spy, sampling without changing the program**

```bash
py-spy record -o profile.svg -- python script.py   # launch and profile, writes a flame graph
py-spy record -o profile.svg --pid 12345 -d 30     # attach to a running process for 30 s
py-spy top --pid 12345                             # live view, like top, of the hottest functions
py-spy dump --pid 12345                            # the current stack of every thread (hangs, deadlocks)
```

Add `--subprocesses` for multiprocessing workers and `--native` for C extensions. Attaching to another
user's process may need `sudo` or a ptrace setting: ask before using either.

**Memory**

```python
import tracemalloc
tracemalloc.start()
before = tracemalloc.take_snapshot()
run_the_slow_thing()
after = tracemalloc.take_snapshot()
for stat in after.compare_to(before, 'lineno')[:15]:
    print(stat)
```

**Micro-benchmarks**

```bash
python -m timeit -s "from mymod import parse; data = open('sample.txt').read()" "parse(data)"
```

## Databases

| Database | Plan | Notes |
| --- | --- | --- |
| PostgreSQL | `EXPLAIN (ANALYZE, BUFFERS) <query>;` | Look for `Seq Scan` on large tables, estimated rows far from actual, `Sort Method: external merge` (sorting on disk), nested loops over many rows |
| MySQL 8 | `EXPLAIN ANALYZE <query>;` or `EXPLAIN FORMAT=TREE` | `type: ALL` is a full scan; `Using filesort` and `Using temporary` are costly on big sets |
| SQLite | `EXPLAIN QUERY PLAN <query>;` | `SCAN <table>` is a full scan; `SEARCH ... USING INDEX` is what you want |

- Find the slow queries first: PostgreSQL's `pg_stat_statements` (sorted by `total_exec_time`), or
  `log_min_duration_statement = 500` in its config; MySQL's slow query log (`slow_query_log`,
  `long_query_time`); in the app, query logging with timings.
- Count queries per request; dozens of near-identical queries mean N+1.
- `EXPLAIN ANALYZE` executes the statement. Wrap writes in a transaction and roll back.

## Web front end

- DevTools Performance panel: record a page load with CPU throttling (4x) and a slow network preset to
  see what a phone sees. Long tasks (over 50 ms) block input.
- Lighthouse (DevTools, or `npx lighthouse <url> --only-categories=performance --view`): LCP, CLS, Total
  Blocking Time, with the elements and resources responsible.
- Network panel: sort by size and by time; check `Cache-Control` on static assets; look for requests
  waiting on each other (a waterfall of round trips).
- Bundle size: the bundler's analyser (rollup-plugin-visualizer for Vite and Rollup,
  webpack-bundle-analyzer, or esbuild's `--metafile` with its analyser); `source-map-explorer` works on
  any bundle with source maps.
- React: the React DevTools Profiler shows which components re-render and why.

## Go

```bash
go test -bench . -benchmem -cpuprofile cpu.out -memprofile mem.out ./pkg
go tool pprof -http=:8080 cpu.out
```

For a running server, import `net/http/pprof` and fetch `/debug/pprof/profile?seconds=30` (keep it off
public ports).

## Linux, any language

- `top` or `htop`: which process, how much CPU and memory.
- `vmstat 1`: high `wa` means waiting on disk; high `us` means busy CPU.
- `iostat -x 1` (sysstat): disk utilisation and wait.
- `perf top` or `perf record -g -p <pid>` then `perf report`: native and kernel-level hot spots (may
  need permissions).

## Reading results honestly

- Report the median and spread of several runs, not the best run.
- Compare like with like: same data, same build mode, same machine, caches in the same state.
- A change that helps by less than the run-to-run noise has not been shown to help.
