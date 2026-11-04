---
name: performance
description: Use when software is too slow or uses too much memory or CPU (a slow page, endpoint, query, build, test suite or script), or when asked to optimise or benchmark code.
category: coding
triggers: [too slow, runs slow*, performance issue*, performance problem*, slow query, slow queries, page load*, load time*, memory leak*, high cpu, n+1, bundle size]
---

# Performance

Make it faster by measuring, not guessing. Agree what "fast enough" means, find where the time really
goes, fix the biggest cost, measure again, and stop when the goal is met. Intuition about hot spots is
wrong more often than right.

## 1. Define the goal

- Which operation, measured how, on what data: "the orders page renders in under 1 s with 10,000
  orders", "the nightly import of 2 million rows finishes in 15 minutes", "95% of /search requests
  answer in under 300 ms", "memory stays under 512 MB".
- Use realistic data sizes. Many problems (a query per row, nested loops over lists) only appear at scale.
- Agree the goal with the user before optimising; it also tells you when to stop.

## 2. Measure a baseline you can repeat

- One command that reproduces the slow case and prints a number:
  - a script or CLI: `time <command>`, or `hyperfine --warmup 3 '<command>'` when installed. When `real`
    is far above `user` plus `sys`, it is mostly waiting (disk, network, a lock, a sleep), not computing:
    look at what it waits on, as a CPU profile will show little;
  - an endpoint: `curl -o /dev/null -s -w '%{http_code} %{time_total}\n' http://localhost:3000/orders`;
  - a function: `python -m timeit -s "from app import f" "f()"`, `go test -bench . -benchmem`, or a small
    timing loop with `performance.now()`.
- Run it several times and note the median and the spread. Same machine, same data, nothing else heavy
  running. Say whether caches were warm or cold.
- Check that every run succeeded (the status code, the output): an error comes back fast, and leaving
  out the runs that failed or timed out flatters the numbers.
- Measure the production build, not the development mode (unminified bundles and dev servers are slower
  in different places).
- Write the baseline down: command, numbers, commit.

## 3. Profile to find where the time goes

| What | Tool |
| --- | --- |
| Node.js CPU | `node --cpu-prof app.js` writes a `.cpuprofile` on exit (`--cpu-prof-dir=prof`); open it in Chrome DevTools, Performance panel |
| Node.js live or memory | `node --inspect app.js`, then DevTools: Performance, and Memory heap snapshots (take two, compare) |
| Python CPU | `python -m cProfile -o prof.out script.py`, then `python -m pstats prof.out` (`sort cumtime`, `stats 20`) |
| A running Python process | `py-spy top --pid <pid>`; `py-spy record -o profile.svg --pid <pid>` (a flame graph); `py-spy dump --pid <pid>` for a hang |
| Python memory | `tracemalloc` snapshots compared before and after |
| A web page | DevTools Performance panel (record a load or an interaction), Lighthouse, the Network panel's waterfall |
| SQL | `EXPLAIN ANALYZE` (PostgreSQL, MySQL 8.0.18+), `EXPLAIN QUERY PLAN` (SQLite); the slow query log |
| Go | `go test -cpuprofile cpu.out -bench .`, then `go tool pprof -http=:8080 cpu.out` |
| The whole machine | `top`, `vmstat 1`, `iostat`: is it CPU-bound, waiting on disk, or waiting on the network? |

- Read a profile by inclusive (cumulative) time first: which call tree holds most of the time? Then
  self time inside it.
- `EXPLAIN ANALYZE` runs the statement: wrap writes in `BEGIN; ... ROLLBACK;`.
- Only some requests or runs slow (the median is fine, the slowest few are not)? Compare a slow one with
  a normal one, side by side in the logs or traces: the difference is the cause. Usual suspects: one big
  customer or file, a queue, retries, a lock, garbage collection, a cold cache.
- More on each tool, and on reading the results, in `references/profiling.md`.

## 4. Fix the biggest cost first

The usual causes, roughly in order of how often they are the answer:

- **A query per item (N+1):** a loop that queries for each row. One query with a join or
  `WHERE id IN (...)`, or the ORM's eager loading (`select_related` and `prefetch_related` in Django,
  `joinedload` and `selectinload` in SQLAlchemy, `include` in Prisma). Count the queries per request
  with query logging to see it.
- **A missing index:** a full scan of a large table in the plan, on a column used to filter, join or sort.
  Add the index (see sql-and-databases) and read the plan again.
- **Repeated work:** the same parse, file read, computation or API call inside a loop. Hoist it out,
  memoise it, or cache it with a clear rule for when it goes stale.
- **The algorithm:** nested loops over two lists, so n times m; a dict, Map or Set lookup instead.
  Sorting again and again; building strings in a loop instead of joining once.
- **One at a time instead of in batches:** single inserts or requests per item. Bulk inserts, batch
  APIs, and one transaction around many writes (in SQLite above all).
- **Doing everything up front:** loading all rows instead of a page, the whole file instead of a stream,
  slow work in the request instead of a background job.
- **Waiting in sequence:** independent network calls one after another. Run them concurrently with a
  limit (`Promise.all` on chunks, `asyncio.gather` with a semaphore). For CPU-bound Python, processes,
  not threads.
- **Not caching what could be:** static assets with hashed names and long cache headers; a response or
  computed value cached with a time limit and invalidation decided up front.
- **Web pages:** a big JavaScript bundle (look at it with the bundler's analyser, such as
  rollup-plugin-visualizer for Vite or webpack-bundle-analyzer; split by route; drop heavy dependencies),
  oversized images (resize, modern formats, `loading="lazy"`, width and height set), render-blocking
  scripts and fonts, re-rendering long lists (virtualise them). Targets for Core Web Vitals: LCP under
  2.5 s, INP under 200 ms, CLS under 0.1.

One change at a time, with its measurement, so you know what each one bought.

## 5. Measure again, and check it is still right

- The same end-to-end command on the same data (a faster function is not yet a faster page). Report
  before and after with numbers: "median 1.8 s to 240 ms over five runs".
- When the gain is small, alternate old and new runs in one session (old, new, old, new), so a machine
  that warms up or gets busy affects both. `git worktree add ../before main` keeps the old version
  runnable beside the new (`git worktree remove ../before` after). A difference smaller than the spread
  between runs is not a gain.
- Profile again after each fix: the biggest cost is now somewhere else.
- Run the tests: a faster wrong answer is a bug. Check caches do not serve stale or another user's data,
  and that batching kept the error handling.
- For memory, watch growth over many requests or iterations, not one moment: a leak grows steadily.
- Keep it fixed where that is cheap: a test that counts the queries a page makes (Django's
  `assertNumQueries`, or query logging), a bundle size limit. Timing limits in CI are noisy: run the
  unchanged code several times first, and set the limit well above its spread.

## 6. Know when to stop

- The goal is met: stop and report. Further gains usually cost readability.
- The rest of the time is in something you do not control (a third-party API, the network, the disk):
  report it with numbers, and options (caching, doing it in the background, another provider).
- The next step needs a bigger change (a schema change, a new service, a rewrite): propose it with the
  expected gain and cost, and do not start it unasked.

## Pitfalls

- Optimising without a profile, speeding up something that was 2% of the time.
- Benchmarks on tiny data, or with warm caches that production does not have.
- Micro-optimisations that make code harder to read for no measurable gain.
- Caches without invalidation: fast and wrong.
- Several changes at once, so nobody knows which helped and which hurt.
- Conclusions drawn from development mode.
- Comparing timings taken under a profiler: it slows some code far more than other code. Profile to find
  the cost; time without it.
- Speed bought by switching off safety (a transaction, fsync, SQLite's `synchronous=OFF`, validation): it
  changes what the program promises, so only with the user's agreement.
