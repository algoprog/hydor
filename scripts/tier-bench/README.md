# The tiers' benchmark

Does a session led by a strong model, with cheaper helpers for the clear parts, do the work as well as one strong
agent alone, and what does each cost? This folder measures it on your own setup: your models, your plan, your tiers.
Nothing in the app depends on it.

- `tasks/<name>/`: six small coding jobs, each with the request an agent gets (`task.md`), the files it starts
  with (`seed/`), a hidden checker (`check.mjs`: it prints how many of its cases pass) and a solution the checker
  was proved against (`reference/`). `node tasks/verify.mjs` proves every checker again: the reference passes all
  its cases, the bare seed does not.
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
| `standard`, `quick` | One agent on that tier's model alone, the team off: what the tier can do with no lead. |

## Run it

```bash
npm run build:server
node scripts/tier-bench/tasks/verify.mjs                       # the checkers hold
node scripts/tier-bench/serve.mjs --from ~/.claude &           # the scratch app, on port 8814
node scripts/tier-bench/run.mjs --out /tmp/hydor-bench/results.json            # solo and team, every task
node scripts/tier-bench/run.mjs --ways standard,quick --out /tmp/hydor-bench/results.json   # each tier alone
node scripts/tier-bench/report.mjs /tmp/hydor-bench/results.json

OUTDIR=dist/dev node scripts/build-server.mjs scripts/tier-bench/size.ts
DATA_DIR=/tmp/hydor-bench/data node dist/dev/size.js           # how Automatic sizes requests up
```

`--from` names a signed-in Claude Code folder (`~/.claude`, or an added account's folder under the app's data).
Only its access token is copied, never the token that renews it, so the copy cannot replace the real sign-in; it
works until it runs out (an hour or two: run `serve.mjs --from …` again to renew it while the server is up). The runs
use that account's plan: six tasks two ways come to a few dollars at API prices. A run already in the results file is
not run again; `--repeat 3` runs each three times (the table shows means), `--tasks a,b` some of them,
`--parallel 3` how many at once, `--recost` reads the costs again.

When you are done, stop `serve.mjs` and remove `/tmp/hydor-bench`: it holds the copied token.

## Reading the table

Checks are the share of the hidden checker's cases a run passed. Cost is what the tokens would cost at API prices
(a plan is flat-rate; the figure compares runs). Helpers are child sessions by tier, and for a Claude Code lead the
helpers it ran inside its own turns, by the model it gave each.

One run of a task is one draw: agents do not do the same thing twice, and a single run can differ from the next by
a third in cost. Read a row as an example and the totals as the measurement; use `--repeat` before you conclude
anything from a small difference.
