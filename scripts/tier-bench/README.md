# The tiers' benchmark

Does a session led by a strong model, with cheaper helpers for the clear parts, do the work as well as one strong
agent alone, and what does each cost? This folder measures it on your own setup: your models, your plan, your tiers.
Nothing in the app depends on it.

- `tasks/<name>/`: fourteen coding jobs, each with the request an agent gets (`task.md`), the files it starts with
  (`seed/`), a hidden checker (`check.mjs`: it prints how many of its cases pass) and a solution the checker was
  proved against (`reference/`). `node tasks/verify.mjs` proves every checker again: the reference passes all its
  cases, the bare seed does not.
- **Nine come with their specification written down** (routine work, and every tier passes them): six small ones of
  different kinds (four modules to a specification, a mechanical change across files, a feature in a small program,
  an expression evaluator, a one-line fix, a bug of timing whose request reads as a hard problem), `kit12` (twelve
  modules), and two hard on purpose but fully specified: `regex-linear` (a matcher that must never backtrack) and
  `invoice-rules` (a rulebook of discounts, rounding and tax).
- **Five leave the requirements implied**: the request is short, as people write them, and the hidden cases check
  what a careful engineer makes sure of without being told, though the request and the files imply it. `py-port` (a
  Python module ported to JavaScript with identical behaviour: Python's own semantics at the edges, 505 cases from
  the Python itself), `timesheet` (seven issues as users report them in a small program: time zones over daylight
  saving, money rounded at the right level, overlapping time, one reporter's wrong guess), `stale-cache` (four
  symptoms, four causes, one of them a race, fixed without more database reads), `slow-report` (a report made fast
  with every byte of its output kept) and `job-picker` (an exhaustive search that has to become the right algorithm).
  Hurried solutions written while building them lost 11-70% of the cases, but Haiku 5.5 alone passed every case of
  all five: it checks its work against whatever can tell it the answer (the Python, the old program, a brute force).
- `serve.mjs`: a scratch copy of the app for the runs: its own data folder and port, and one Claude Code account
  that signs in with a copy of an account's access token. The app you use never hears of the runs.
- `run.mjs`: each task done several ways, with what came of it: the share of checks passed, the cost at API
  prices (the lead's and its helpers'), the time, the helpers and their tiers.
- `report.mjs`: the results as a table.
- `size.ts` and `requests.json`: how well Automatic tells a hard problem from the rest: thirty requests as people
  write them, ten of them hard, sized up by the helper model as a session's start does.

## The ways

| Way | What runs |
|---|---|
| `solo` | One agent on the Best tier's model, the team off: how a session worked before tiers led by default. |
| `team` | Automatic, the team on: the main agent leads on Best (Max for a hard problem) and hands parts to helpers. |
| `lead` | The team on with Max for hard problems off: the main agent always leads on Best and hands parts to helpers. |
| `max` | One agent on the Max tier's model, the team off: the strongest model for everything. |
| `standard`, `quick` | One agent on that tier's model alone, the team off: what the tier can do with no lead. |

## Run it

```bash
npm run build:server
node scripts/tier-bench/tasks/verify.mjs                       # the checkers hold
node scripts/tier-bench/serve.mjs --from ~/.claude &           # the scratch app, on port 8814
node scripts/tier-bench/run.mjs --out /tmp/hydor-bench/results.json            # solo and team, every task
node scripts/tier-bench/run.mjs --ways max,standard,quick --out /tmp/hydor-bench/results.json   # each tier alone
node scripts/tier-bench/report.mjs /tmp/hydor-bench/results.json

OUTDIR=dist/dev node scripts/build-server.mjs scripts/tier-bench/size.ts
DATA_DIR=/tmp/hydor-bench/data node dist/dev/size.js           # how Automatic sizes requests up
```

The benchmark's agents work offline: the tasks hold everything they need, and a task made from a published problem
must be solved, not looked up. `serve.mjs` gives its account Claude Code settings that deny web search and reading,
the app's browser and HTTP tools, and curl and wget (`--web` allows them).

Nothing the benchmark starts can take the machine's memory: on Linux `serve.mjs` starts the scratch server in a scope
of its own with at most 24 GB for it, its agents and what they run (`--memory`, in GB; 0 for no cap), each checker
runs with at most 8 GB, and `run.mjs` starts a run only while the machine has 16 GB available (`--min-free`). Past a
cap the kernel ends processes in that scope alone. The scratch server runs as a copy in development, so it sets up
nothing on the computer (no service that starts it at boot) and leaves the agents' programs as they are.

`--from` names a signed-in Claude Code folder (`~/.claude`, or an added account's folder under the app's data).
Only its access token is copied, never the token that renews it, so the copy cannot replace the real sign-in; it
works until it runs out (an hour or two: run `serve.mjs --from …` again to renew it while the server is up). The runs
use that account's plan: the first nine tasks two ways come to about ten dollars at API prices (Max alone to as much
again), the whole second measurement to about $110. A run already in the results file is not run again; `--repeat 3`
runs each three times (the table shows means), `--tasks a,b` some of them, `--parallel 3` how many at once,
`--recost` reads the costs again. A run waits for the copied token to have 20 minutes left: for a long measurement,
copy it again every few minutes while the account is in use elsewhere (it renews there).

When you are done, stop `serve.mjs` and remove `/tmp/hydor-bench`: it holds the copied token.

## Recorded runs

`results/2026-11-10/` holds the runs behind `docs/plans/tiers-and-the-team.md`, one run a line (Claude Code with
Haiku 5.5, Sonnet 5.5, Opus 5.5 and Fable 5.2): `ordinary.json` (the seven ordinary tasks, every way), `hard.json`
(the two hard ones) and `earlier-wordings.json` (the team's runs under earlier wordings of the lead's instructions,
which the means leave out). `node scripts/tier-bench/report.mjs scripts/tier-bench/results/2026-11-10/ordinary.json`
shows one as a table. Keep a new measurement beside them, in a folder named by its date.

`results/2026-11-12/` holds the second measurement (11-12 November, the same models, agents offline): `own.json`
(the nine newer tasks of our own), `contest.json` (the ten AtCoder problems, Quick alone three times each) and
`lcb.json` (the thirty LiveCodeBench problems; `node scripts/tier-bench/run.mjs --tasks-dir
~/.cache/hydor-bench/lcb/tasks` after `lcb/make-tasks.py`). Runs made in the trial of 11 November and carried over
say so in `copiedFrom`; four LiveCodeBench solutions graded again after the grader failed say so in `regraded`.

## Reading the table

Checks are the share of the hidden checker's cases a run passed. Cost is what the tokens would cost at API prices
(a plan is flat-rate; the figure compares runs). Helpers are child sessions by tier, and for a Claude Code lead the
helpers it ran inside its own turns, by the model it gave each.

One run of a task is one draw: agents do not do the same thing twice, and a single run can differ from the next by
a third in cost. Read a row as an example and the totals as the measurement; use `--repeat` before you conclude
anything from a small difference.
