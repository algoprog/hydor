# Tiers and the team: a strong lead, cheaper helpers

*10 November 2026. The owner: "change the way agents work so that by default, they use 3 tiers of agents (4 in the case
of claude): one for planning / orchestration of subagents (these are main agents, eg opus, gpt sol), another for
subagents that implement well defined coding tasks or other tasks of medium complexity (eg sonnet and gpt terra),
another for very well defined simpler tasks (targeted code edits, specific jobs etc), and another when trying to solve
more complex problems (fable 5.2, gpt astra as main agents / orchestrators) … this will help the agent reduce cost
without sacrificing quality", then "smallest tier would use haiku, luna etc", and "do some testing to validate the
approach works well without quality loss". What was built in 0.52.0, why it is shaped as it is, and what the
measurements say.*

## What a session does now

| Tier | Who thinks with it | Claude Code | Codex |
|---|---|---|---|
| **Quick** | helpers on small, very clear jobs | Haiku | Luna |
| **Standard** | helpers on clear tasks of medium size | Sonnet | Terra |
| **Best** | a session's main agent: it plans, leads and checks | Opus | Sol |
| **Max** | the main agent of a hard problem | the newest Fable | Astra |

- **Automatic** is the start page's model until another is picked (`model: "auto"` in `POST /api/sessions`). The
  session starts on Best. While its agent starts, the helper model reads the request and says whether it is a hard
  problem (`server/assistants/auto.ts`); if so the session is on Max before its first message goes, and a line in the
  conversation says why. A start never waits more than ten seconds for that answer, and reads silence as "not hard":
  the session is on Best then, and only the server's log says that the helper model was not there to ask (`[auto]`).
- **The main agent leads** (`server/children/team.ts`): it is told what each tier is for and what each costs beside
  it, to sort the work before it starts, to hand the doing to helpers and keep the deciding, and that it answers for
  what comes back. A helper asked for with no tier gets Standard; none thinks with a tier above its lead's.
- **Two ways to hand a part over, for Claude Code**: its own Agent tool for a part of a few minutes (told which model
  name is Quick and which Standard, since with none a helper runs on the lead's model), and child sessions for long
  parts, parts the user should be able to follow, and other programs' models. Codex and Custom have child sessions.
- **Stepping up**: a child session whose reply fails the helper model's check runs again a tier up, as far as Best
  (it was there before; a turn stopped by the plan's usage limit no longer counts as a failure). A main agent on
  Automatic may move itself to Max with `step_up_session` when a problem proves harder than it looked; a session whose
  model was picked by name stays on it.
- **Settings → Models → Tiers**: the table, with a row for Max, and two switches: **Lead with helpers** and **Max for
  hard problems**. A tier nobody changed follows its program's newest model of that kind: the app remembers the models
  each program lists (`models.tiers.seen`) and keeps only the picks that were changed.

## Why it is shaped this way

- **The lead keeps the judgement.** What separates the models is not typing code but knowing what to build, noticing
  that a result is wrong, and deciding what to do about it. So the plan, the design, the diagnosis and the final check
  stay on the strongest model in the session, and what goes down is work whose result can be checked.
- **Tiers, not model names.** The same instruction serves Claude Code, Codex and Custom, survives a new model
  generation, and lets a plan without a family fall back to the nearest it has.
- **Default on, two switches off.** The request was for a default. A session that names its model still leads
  helpers, since that is where most of the saving is; it only never changes its own model.
- **No silent change of a remembered pick.** Someone who picked Sonnet to spend less must not find sessions on Opus.
  Automatic is what the start page shows where no model was ever picked, and the first row of the menu for everyone
  else.
- **Sizing up is one small call, in parallel.** A request is read once by the cheapest model there is while the
  agent's program starts. The alternative, the lead deciding for itself, costs a turn of the lead and comes after
  it has begun.

## What was measured

`scripts/tier-bench` (its README says how to run it): nine coding tasks with hidden checkers, each done on a scratch
copy of the app by one agent alone on each tier's model and by a session on Automatic with the team on; and thirty
requests, ten of them hard, sized up by the helper model. Claude Code throughout: Haiku 5.5, Sonnet 5.5, Opus 5.5
and Fable 5.2 as Quick, Standard, Best and Max. Costs are what the tokens would cost at API prices on 10 November
2026 (a plan is flat-rate: the figures compare runs). Checks are the share of a task's hidden cases that pass. Every
run behind the tables is recorded in `scripts/tier-bench/results/2026-11-10/`, and `report.mjs` shows them again.

**Sizing up.** The helper model (Haiku through Claude Code) called all 10 hard requests hard and kept all 20 plain
ones on Best, in 1.8 s at the median and 3.7 s at most. A start waits at most 10 s for it.

**Seven ordinary tasks** (six small ones of different kinds and one of twelve modules). Best alone and the team are
means of two or three runs, the others one run each:

Each cell: checks passed · cost · time.

| Task | Quick alone | Standard alone | Best alone | Max alone | Team |
|---|---|---|---|---|---|
| page-count | 100% · $0.01 · 0.5 min | 100% · $0.08 · 0.5 min | 100% · $0.16 · 0.5 min | 100% · $0.19 · 0.7 min | 100% · $0.17 · 0.5 min |
| logger-move | 100% · $0.01 · 0.8 min | 100% · $0.12 · 0.6 min | 100% · $0.29 · 0.7 min | 100% · $0.33 · 0.7 min | 100% · $0.29 · 0.7 min |
| todo-due | 100% · $0.02 · 1.3 min | 100% · $0.15 · 1.0 min | 100% · $0.37 · 1.4 min | 100% · $0.86 · 12.5 min | 100% · $0.43 · 1.8 min |
| utils4 | 100% · $0.03 · 2.0 min | 100% · $0.26 · 1.7 min | 100% · $0.55 · 2.0 min | 97.3% · $3.09 · 15.7 min | 100% · $0.41 · 1.6 min |
| expr | 100% · $0.05 · 3.8 min | 100% · $0.25 · 1.7 min | 100% · $0.98 · 3.6 min | 100% · $2.25 · 12.3 min | 100% · $0.71 · 4.0 min |
| flaky-queue | 100% · $0.01 · 1.1 min | 100% · $0.10 · 1.0 min | 100% · $0.29 · 1.6 min | 100% · $0.73 · 5.7 min | 100% · $0.41 · 2.6 min |
| kit12 | 100% · $0.03 · 3.9 min | 100% · $0.68 · 4.2 min | 100% · $1.46 · 5.4 min | – | 100% · $1.33 · 2.7 min |
| **The six** | **100% · $0.11 · 9.4 min** | **100% · $0.95 · 6.5 min** | **100% · $2.65 · 9.8 min** | **99.5% · $7.45 · 47.5 min** | **100% · $2.42 · 11.3 min** |
| **All seven** | **100% · $0.15 · 13.3 min** | **100% · $1.63 · 10.7 min** | **100% · $4.11 · 15.2 min** | – | **100% · $3.76 · 14.0 min** |

- **No check was lost by leading with helpers**: the team passed every hidden case in every run (14 runs), as Best
  alone did (19 runs). The team's 14 are the runs made with the lead's instructions as shipped; the 19 made with
  earlier wordings of them are left out of the means, and passed every case as well (for 2% less than Best alone).
- **The team cost 9% less than Best alone** over the seven, and took about as long: from 27% less where Quick helpers
  did real work (the evaluator's tests, four modules) and half the time on the twelve modules, to 41% more on the one
  task whose request reads as a hard problem, which Automatic started on Max although Best alone solves it.
- **Against the strongest model for everything it cost 67% less** (the six tasks Max alone was run on: $2.42 against
  $7.45, and 11 minutes against 47, ten of those spent waiting on a question nobody was there to answer), which is
  the comparison for anyone who ran every session on Max.
- **These tasks do not tell the tiers apart**: Quick alone passed every case for 4% of what Best alone cost. A lead
  that hands a clear part to a Quick helper is safe on work like this, which is why the lead is told to try the
  lower tier first and check; it also says that the big lever is the main agent's own tier, not its helpers'.
- One run is one draw: the same task twice differed by up to a third in cost (what the lead chose to hand over, and
  to which tier). The means above are of few runs.

**Two hard tasks**, written so that a quick solution fails where a careful one passes (a matcher that must run in
linear time, where a backtracking one passes 51 of 74 cases; an invoice rulebook where floating-point numbers and the
wrong rounding pass 37 of 61):

| Task | Quick alone | Standard alone | Best alone | Max alone | Team |
|---|---|---|---|---|---|
| regex-linear | 100% · $0.14 · 5.8 min | 100% · $0.42 · 3.2 min | 100% · $1.62 · 8.6 min | 0% · $2.78 · 24.5 min | 100% · $2.22 · 11.5 min |
| invoice-rules | 100% · $0.05 · 3.5 min | 100% · $0.33 · 1.8 min | 100% · $0.80 · 2.7 min | 100% · $2.62 · 11.8 min | 100% · $1.32 · 5.9 min |
| **Both** | **100% · $0.19 · 9.3 min** | **100% · $0.75 · 5.0 min** | **100% · $2.42 · 11.4 min** | **50% · $5.39 · 36.3 min** | **100% · $3.54 · 17.4 min** |

- **Every tier passed these too**, Quick alone included, so they do not tell the tiers apart either: with a written
  specification to work from, the smallest model of this generation writes a matcher that never backtracks and gets
  banker's rounding right. What would tell them apart is work without a specification, which a checker cannot mark.
- **Automatic started both on Max**, as their requests read as hard problems. The team passed every case in all four
  runs, for 46% more than Best alone ($3.54 against $2.42) and 34% less than Max alone. Max for hard problems is
  insurance: on tasks Best can do, it is the price of not knowing that beforehand.
- **Max alone failed one of them outright**: on the matcher its replies ran over the 32,000-token limit of one reply
  three times, and the turn ended after 24 minutes and $2.78 with no file written. The same model as a lead, told to
  sort the work and hand parts over, finished it in both runs. One run proves little, but it is the only task a way
  failed in the whole benchmark, and it was the most expensive way.

**What the lead does**, read from its conversations: it reads the task, says in a line what goes to whom (as it is
told to), and hands out what can be specified: tests, modules to a written specification, twelve modules as four
helpers of three. It keeps what is one piece of reasoning (the evaluator, the feature's design), writes its own
checks from the specification while the helpers work, and runs them on what comes back. A mechanical change across
twelve files it did itself with one command, which no helper would have beaten. All of this was Claude Code's own
Agent tool with a model named for each helper; none of these tasks was long enough for child sessions.

**What changed because of the measurements**:
- The lead's instructions went through four wordings. Told only what each tier is for, Opus did everything itself
  ("explaining the job to a helper would take about as long as writing the code"). It hands work over once told to
  sort the work first, to count a part by what must be written and read rather than by how hard it is, what each tier
  costs beside it, and to try the lower of two tiers first.
- Claude Code's helpers often work in the background after their lead's turn has ended. The app now waits for them
  before it says a session has finished, and so do `hydor run` and the benchmark.
- A helper stopped by the plan's usage limit was being run again a tier up, beside the original once another account
  took it over. It is no longer.

## Not done

- The benchmark ran Claude Code alone. Codex and Custom get the same tiers and the same instructions, with child
  sessions in place of Claude Code's own helpers; the tests check that, nothing has measured it.
- Custom has no tiers until its models are named in the table, so its sessions lead no team by default.
- Scheduled tasks and apps name a model or leave it to their program; they do not start on Automatic.
- A session does not step back down from Max when the hard part is over.
- The check that steps a child up reads its reply, not its work: a helper that says it is done when it is not is
  caught by its lead, or not at all.
