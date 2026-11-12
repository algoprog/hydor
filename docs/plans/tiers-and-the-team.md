# Tiers and the team: a strong lead, cheaper helpers

*10 November 2026. The owner: "change the way agents work so that by default, they use 3 tiers of agents (4 in the case
of claude): one for planning / orchestration of subagents (these are main agents, eg opus, gpt sol), another for
subagents that implement well defined coding tasks or other tasks of medium complexity (eg sonnet and gpt terra),
another for very well defined simpler tasks (targeted code edits, specific jobs etc), and another when trying to solve
more complex problems (fable 5.2, gpt astra as main agents / orchestrators) … this will help the agent reduce cost
without sacrificing quality", then "smallest tier would use haiku, luna etc", and "do some testing to validate the
approach works well without quality loss". What was built in 0.52.0, why it is shaped as it is, and what the
measurements say. Measured again on 11-12 November, when the first tasks proved too easy to tell the tiers apart:
"all models score 100% which should not be the case for weaker models".*

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

`scripts/tier-bench` (its README says how to run it) gives each task to a session of a scratch copy of the app, the
way a person would: an agent with its tools, in a folder of its own, unattended. Five ways: **Quick alone**
(Haiku 5.5), **Standard alone** (Sonnet 5.5), **Best alone** (Opus 5.5), **Max alone** (Fable 5.2), and the
**team**: Automatic, with its main agent leading helpers as shipped. Claude Code throughout. A run passes a task when
it passes every one of the task's hidden cases. Costs are what the tokens would cost at API prices (a plan is
flat-rate: they compare runs). In the second measurement the agents worked offline, and every transcript was checked
for reads of the tasks' hidden files (none). The runs: `scripts/tier-bench/results/2026-11-10/` and `2026-11-12/`.

**Sizing up** (the first measurement, before 0.57.0 removed it): the helper model called all 10 hard requests of a set
of 30 hard and kept all 20 plain ones on Best, in 1.8 s at the median. It was accurate on requests as people word
them; on coding requests it was eager, and the second measurement shows what that cost.

### Five sets of tasks

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

### What came of it

Each cell: runs that passed every case · the cost of one pass over the set (each task's mean, summed). On the first
set Best alone and the team ran two or three times on each task, and Quick alone three times on each contest
problem; everything else once.

| Set | Quick alone | Standard alone | Best alone | Max alone | Team |
|---|---|---|---|---|---|
| Written specification (9) | 9 of 9 · $0.34 | 9 of 9 · $2.38 | 21 of 21 · $6.53 | 6 of 8 · $12.84 | 18 of 18 · $7.29 |
| Requirements implied (5) | 5 of 5 · $0.68 | – | 5 of 5 · $6.71 | – | 5 of 5 · $9.63 |
| A hard core (4) | 4 of 4 · $0.87 | – | 3 of 4 · $4.41 | – | 4 of 4 · $6.14 |
| Contest problems after training (10) | 26 of 30 · $2.19 | – | 9 of 10 · $8.45 | – | 10 of 10 · $9.38 |
| LiveCodeBench, hard (30) | 28 of 30 · $0.73 | 27 of 30 · $4.37 | 29 of 30 · $9.97 | – | 29 of 30 · $9.13 |
| **All 58 tasks** | **72 of 78 (92%) · $4.81** | | **67 of 70 (96%) · $36.07** | | **66 of 67 (98.5%) · $41.57** |

- **The cheapest model alone did nearly all of it**, for an eighth of what Best alone cost: every task with a
  written specification or with implied requirements, the security review with all thirteen holes, the theorem, the
  binary format, and every one of the ten contest problems in at least one of its three runs (98.5% of their cases),
  including the two rated above 3500. It checks its work against whatever can tell it the answer (it ran the Python
  it was porting on its own edge cases), and it knew every algorithm and theorem these tasks were built around.
- **Its six misses** (of 78 runs): a LiveCodeBench solution too slow for the largest tests, a game problem every way
  missed, and four contest runs that lost some hidden cases (34 of 47 on one problem, 53 and 60 of 61 on another, 51
  of 53 on a third) where its other runs of the same problems passed them all. They are misses of reliability, not
  of reach.
- **A strong model alone is no guarantee.** Best alone missed three: the game problem; a contest problem Haiku solved
  three times, where Opus explored for 21 minutes (117,000 tokens written) and never wrote the solution; and eight
  of the 78 cases of the security review.
- **The team was the most reliable**, 66 of 67 runs, its one miss the problem nobody solved, and the dearest: 15%
  more than Best alone, because Automatic started 10 of its 49 new runs on Max (seven of the nine on our own tasks;
  its extra contest solve was one of them) and its leads handed over almost nothing: 3 helpers in 49 runs, none on
  the contest or LiveCodeBench problems, which are one piece of reasoning each. Where it stayed on Best
  (LiveCodeBench), it did what Best alone did, at about the same cost.
- **These quality differences are within noise**: 92% (95% interval 84-96%), 96% (88-99%) and 98.5% (92-100%); Quick
  against the team, p = 0.12 (Fisher). The cost differences are not: 7.5 times from Quick alone to Best alone.
- **What it means for the design.** On work whose result can be checked, the doing can go to the cheapest tier, and
  the lead's price buys reliability on the rare hard miss rather than ability. The big levers are the lead's own tier
  and Max: the sizer sent many coding requests to Max (16 of the 37 team runs on our own tasks and the contest
  problems), which cost more here than it bought, so 0.57.0 leaves Max to the lead's own step up. Not measured yet:
  starting on Quick and moving up a tier only when a check fails, and work whose result cannot be checked by a program
  (designs, research, writing), where a judge has to read it.

**After 0.57.0** (Max only by the lead's own step up), the team ran again, once each, on the 13 tasks where Automatic
had started it on Max. It passed every case in 12 of the 13 (2 of 78 security cases missed), for $13.07 in all: 48%
less than the same tasks had cost the team on Max ($24.90, 13 of 13) and 25% less than Best alone ($17.51, 11 of 13).
No lead stepped itself up: none found a problem too hard for Best, including the contest problem Best alone had
failed, which it solved. `results/2026-11-12/team-after-0.57.json`.

**The first measurement** (10 November, the nine tasks with a written specification): the team cost 9% less than
Best alone over seven ordinary tasks, from 27% less where Quick helpers did real work to 41% more on a request that
reads as a hard problem, which Automatic started on Max. Against Max alone it cost 67% less over six. Max alone failed
the linear-time matcher outright: its replies ran over the 32,000-token limit of one reply three times, and the turn
ended after 24 minutes and $2.78 with no file written. The same model as a lead, told to sort the work and hand parts
over, finished it in both runs.

**What the lead does**, read from its conversations: it reads the task, says in a line what goes to whom (as it is
told to), and hands out what can be specified: tests, modules to a written specification, twelve modules as four
helpers of three. It keeps what is one piece of reasoning (the evaluator, the feature's design, a contest problem),
writes its own checks while the helpers work, and runs them on what comes back. All of this was Claude Code's own
Agent tool with a model named for each helper; none of these tasks was long enough for child sessions.

**How far to trust it.** One run is one draw, and a set of 4 to 30 tasks is small: read the totals, not single cells.
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
- Max only by the lead's own step up (0.57.0) is measured on the 13 tasks where Automatic had chosen Max (below), once
  each; a wider set and more runs would say more.
- Work whose result a program cannot check (a design, a report, writing) is not measured: it needs a judge, checked
  against people's ratings first.
- The benchmark ran Claude Code alone. Codex and Custom get the same tiers and the same instructions, with child
  sessions in place of Claude Code's own helpers; the tests check that, nothing has measured it.
- Custom has no tiers until its models are named in the table, so its sessions lead no team by default.
- Scheduled tasks and apps name a model or leave it to their program; they do not start on Automatic.
- A session does not step back down from Max when the hard part is over.
- The check that steps a child up reads its reply, not its work: a helper that says it is done when it is not is
  caught by its lead, or not at all.
