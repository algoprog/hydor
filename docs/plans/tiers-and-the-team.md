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
  conversation says why. A start never waits more than ten seconds for that answer, and reads silence as "not hard".
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

`scripts/tier-bench` (its README says how to run it): six coding tasks with hidden checkers, each done by one agent
on Best alone and by a session on Automatic with the team on, on a scratch copy of the app; and thirty requests,
ten of them hard, sized up by the helper model.

RESULTS

## Not done

- Custom has no tiers until its models are named in the table, so its sessions lead no team by default.
- Scheduled tasks and apps name a model or leave it to their program; they do not start on Automatic.
- A session does not step back down from Max when the hard part is over.
- The check that steps a child up reads its reply, not its work: a helper that says it is done when it is not is
  caught by its lead, or not at all.
