# Tiers and the team: a strong lead, cheaper helpers

*How sessions pick their models by tier and hand work to cheaper helpers: what was built (0.52.0, with Max left to
the lead's own step up since 0.57.0), why it is shaped as it is, and what the measurements say.*

## What a session does now

| Tier | Who thinks with it | Claude Code | Codex |
|---|---|---|---|
| **Quick** | helpers on small, very clear jobs | Haiku | Luna |
| **Standard** | helpers on clear tasks of medium size | Sonnet | Terra |
| **Best** | a session's main agent: it plans, leads and checks | Opus | Sol |
| **Max** | the main agent of a hard problem | the newest Fable | Astra |

- **Automatic** is the start page's model until another is picked (`model: "auto"` in `POST /api/sessions`). The
  session starts on Best (`server/assistants/auto.ts`) and reaches Max only by its own agent's step up (below). Until
  0.57.0 the helper model also read each request as it started and sent what read as a hard problem to Max: the second
  measurement found that costly for coding work (16 of 37 requests, 43% more than Best on them, for one more solved).
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
- **Max when Best has struggled, not when a request sounds hard.** Reading a request's words to pick Max was quick and
  cheap in itself (one small call while the agent starts), but most of what reads as hard Best solves; the lead knows
  when it is stuck (a fix that failed twice, a cause it cannot find) and steps up then.

## What was measured

`scripts/tier-bench` gives each task to a session of a scratch copy of the app, the way a person would: an agent with
its tools, in a folder of its own, unattended, Claude Code throughout. A task counts as **solved** when a run passed
every one of its hidden checks (with several runs, the share of runs that did). Cost is what the tokens would cost at
API prices, per task on average. The runs are in `scripts/tier-bench/results/`.

### The team against each model alone

| Way | Tasks solved | Cost per task |
|---|---|---|
| **Team**: a lead on Best that hands parts to cheaper helpers | **96.6%** | **$0.51** |
| Best alone (Opus 5.5) | 94.8% | $0.62 |
| Quick alone (Haiku 5.5) | 94.3% | $0.08 |
| Standard alone (Sonnet 5.5), on 39 of the tasks | 92.3% | $0.17 |
| Max alone (Fable 5.2), on 8 of the tasks | 75.0% | $1.61 |

Over the 58 tasks the team solved the most, for 18% less than Best alone. By set:

| Set | Quick alone | Best alone | Team |
|---|---|---|---|
| A written specification (9) | 100% | 100% | 100% |
| Requirements left implied (5) | 100% | 100% | 100% |
| A hard core (4) | 100% | 75% | 75% |
| Contest problems from after the models' training (10) | 87% | 90% | **100%** |
| LiveCodeBench, hard problems (30) | 93% | 97% | 97% |

- **The team gains at the hard end.** It was the only way to solve all ten contest problems, rated up to 3596 on
  AtCoder's scale: Best alone gave up on one after 21 minutes without writing a solution, and Quick alone lost checks
  on three of them in some of its runs. On LiveCodeBench it solved one more than Quick alone, whose solution to it was
  too slow for the largest tests.
- **On everyday work every way is right, and the team costs less than Best alone**: 16% less where its lead hands
  parts to helpers, 8% less where it keeps everything itself.
- **The cheapest model alone comes close** (94.3%) for a sixth of the team's cost. Its misses are runs that lose a few
  checks where its other runs of the same problem pass them all.
- **The strongest model alone does worst.** Max alone solved 6 of 8 for the highest cost: on one task its replies ran
  over the length of a single reply three times and it wrote nothing.
- The gaps in tasks solved are a few tasks in 58, the same way round across the sets but within what chance could do
  (a run is one draw). The gaps in cost are large and certain.

The team is Hydor as it works now: on the 13 tasks where Automatic used to choose Max (before 0.57.0), its runs on
0.57.0; elsewhere the runs from before, when its lead was on Best as now. When Automatic still chose Max on a
request's wording, the team solved 98.3% for $0.72 a task.

### The tasks

1. **A written specification** (9 tasks, 10 November): modules to a specification, a mechanical change across files,
   a feature, an expression evaluator, a one-line fix, a timing bug, twelve modules, a linear-time matcher and an
   invoice rulebook.
2. **Requirements left implied** (5): a Python module ported to JavaScript with identical behaviour (505 cases from
   the Python itself), seven issues as users report them in a time tracker (time zones over daylight saving, money
   rounded at the right level, a reporter's wrong guess), a cache with four causes behind four symptoms (one a race),
   a report made fast with every byte kept, and an exhaustive search that has to become the right algorithm.
3. **A hard core** (4): a security review of a small service with thirteen unlisted holes, an exact rectilinear
   spanning tree for 200,000 points where the fast heuristics fail, spanning-tree probabilities that need a theorem,
   and an undocumented binary format worked out from samples.
4. **Contest problems from after the models' training** (10): AtCoder Regular Contest problems of July-October 2026,
   rated 2277 to 3596 on AtCoder's scale (3000 is the level of its strongest hundred or so contestants), with their
   statements as published, references from their editorials proved against brute force on thousands to millions of
   inputs, and our own hidden tests.
5. **LiveCodeBench** (30): hard problems of its release v6 (22 AtCoder, 8 LeetCode, drawn at random), graded by its
   own code at a pinned commit (`lcb/`). Anyone can check these. They are from January-April 2025, before the models
   were trained, so a model may have seen them.

**What the lead does**, read from its conversations: it reads the task, says in a line what goes to whom (as it is
told to), and hands out what can be specified: tests, modules to a written specification, twelve modules as four
helpers of three. It keeps what is one piece of reasoning (the evaluator, the feature's design, a contest problem),
writes its own checks while the helpers work, and runs them on what comes back. All of this was Claude Code's own
Agent tool with a model named for each helper; none of these tasks was long enough for child sessions.

**How far to trust it.** One run is one draw, and a set of 4 to 30 tasks is small: read the totals, not single sets.
The contest problems are recent enough that neither model can have seen them (asked, both said they knew nothing of
these contests), but our tests are our own; LiveCodeBench's tests are its own, but the models may have seen those
problems. Four LiveCodeBench problems whose exact comparison cannot judge them fairly (a test that contradicts its
statement, three that accept any of several answers) were replaced by the next in the random order before any run.
Run records were kept as they came, with three corrections, each noted in the results: 23 runs that never began (a
copied sign-in had lapsed) and 4 cut short by a restart of the app were run again, and 4 LiveCodeBench solutions were
graded again when the grader itself had failed (its Python lacked a package).

**What changed because of the measurements**:
- The lead's instructions went through four wordings. Told only what each tier is for, Opus did everything itself
  ("explaining the job to a helper would take about as long as writing the code"). It hands work over once told to
  sort the work first, to count a part by what must be written and read rather than by how hard it is, what each tier
  costs beside it, and to try the lower of two tiers first.
- Claude Code's helpers often work in the background after their lead's turn has ended. The app now waits for them
  before it says a session has finished, and so do `hydor run` and the benchmark.
- A helper stopped by the plan's usage limit was being run again a tier up, beside the original once another account
  took it over. It is no longer.
- The benchmark itself: tasks that need judgement, recent contest problems and LiveCodeBench; agents offline; a check
  that no run read its task's hidden files; everything it starts in a memory-capped scope of its own (two
  out-of-memory restarts of the machine on 11 November happened while it ran without one).

## Not done

- Starting on Quick and stepping up only on a failed check, which these results suggest could keep most of the
  quality at a fraction of the cost: not built, not measured.
- Max only by the lead's own step up (0.57.0) has been measured on the 13 tasks where Automatic used to choose Max,
  once each; more tasks and more runs would say more.
- Work whose result a program cannot check (a design, a report, writing) is not measured: it needs a judge, checked
  against people's ratings first.
- The benchmark ran Claude Code alone. Codex and Custom get the same tiers and the same instructions, with child
  sessions in place of Claude Code's own helpers; the tests check that, nothing has measured it.
- Custom has no tiers until its models are named in the table, so its sessions lead no team by default.
- Scheduled tasks and apps name a model or leave it to their program; they do not start on Automatic.
- A session does not step back down from Max when the hard part is over.
- The check that steps a child up reads its reply, not its work: a helper that says it is done when it is not is
  caught by its lead, or not at all.
