---
name: app-builder
description: Use when making or changing one of the user's templates (their own small apps, with a form, steps, data, screens and examples), or when they want a tool they will run again and again, or work that runs by itself.
triggers: [make a template, build a template, make an app, build an app, an app that, a tool that, every time I, automate, workflow]
---

# Building templates

A template is a small app: what it asks (a form), what it does (one agent's task, or steps), what it gives back
(answer fields), what it keeps (lists of records, a memory), how it looks (a screen), when it runs (its form, a
schedule, a webhook, a watcher) and examples to try it with. Build them with app_get, app_save, app_try,
app_screen and app_data (its records: start it off with some, or see what its runs kept); app_guide's templates
topic says what each part does, and its API topic gives the format.

## 1. Pin down the job

- What goes in: the form's questions, few, each of the kind that fits (number, date, choice, yes or no, file).
- What comes out: answer fields with types (a table when there are rows, a list for short items).
- What makes a run good: the checks you will write. Ask only what changes the design; assume the rest and say so.

## 2. Pick the steps: the cheapest that works

- One agent with a task, when the work is open-ended (research, writing, changing code). Start here when unsure,
  and firm it up later.
- Steps, when parts of the work are fixed:
  - **Use a tool** for one exact call: read a page, search the web, call an address with a saved key, read a document.
  - **Ask a model** for one quick answer with no tools: sort, pull out, sum up, classify. Cheap; give it outputs.
  - **Decide** by a rule when a value settles it (`{{price}} < 100`), by a question in words otherwise.
  - **Repeat** over a list (a few at a time), or until something holds, with a limit.
  - **At the same time** for parts that do not depend on each other.
  - **Keep data** to add, find, search or change the records the template keeps.
  - **Work out a value** for the first item, a count, a sum or an average, a field of each, a join or a sort: at
    once and free, no code step needed.
  - **Call an app** to reuse a block: a template made to be a step of others (block: true; app_get's list marks
    them). Ready-made ones sum up a page, translate, answer from the web, sort into kinds and pull out facts. A part
    used in several templates is worth making a block of its own (block: true), changed in one place.
  - **Run code** for exact arithmetic, parsing and formatting: JavaScript, TypeScript or Python, no network. A
    program can also be the flow itself, when its logic is easier written than drawn: ctx.model, ctx.agent,
    ctx.tool, ctx.ask, ctx.data and ctx.app are steps of the run, kept and replayed after a restart (so make the
    same calls in the same order for the same input). Say what it gives (outputs).
  - **Ask a person** before anything that sends, spends or deletes, and when the choice is the user's.
  - **Ask an agent** for the parts that need judgement and tools, with outputs it hands in.
- Every step's outputs are what later steps use (`{{step.value}}`); the form's answers are `{{field}}`, a Repeat's
  item `{{item}}`. Fill the answer fields from the steps (`flow.outputs`), or let them come by name.

## 3. Examples, then try

- Write two to four examples with checks (rules on `{{answer.field}}`, `{{step.value}}`, `{{reply}}`) before you
  hand the template over: the usual case, an edge, and one that should be refused or come back empty.
- Try them with app_try and fix what fails. Say what a run costs and how long it takes.
- To change a late step, save the change and run again from that step (its run page, or a test run in its Edit):
  the steps before it give what they gave, at no cost.
- Each save that changes it is a version, its line app_save's why: try the examples on each saved version (Versions
  compares them), and when a change made it worse, app_get with version gives the one before to save again.

## 4. Safe and cheap

- Limits: runs a day and the most a run may spend. Tools: only those it needs.
- A step that may fail says what happens then (If it fails…: go on without it, other steps, or `failed: "agent"`:
  an agent does a tool, model, code, data or app step's work with what it was given, and the run goes on).
- Nothing reaches outside data and private data and sends things out in one step without an Ask a person first.

## 5. Firm it up later

- app_get's advice says what a template's runs showed: a step that failed and had an agent do its work (fix it so
  it works by itself), and an agent step that did the same each time, with the fixed steps that could do it.
  Put those in its place, try them on the examples (app_try with the recipe), compare time and cost, then save.

## 6. Hand it over

- A screen (app_screen) when it will be used often or keeps data: start from the one made from its parts. Its
  `<n-chat>` part lets people ask the template's agent about its records, or to change them or run its flows.
- When it should run by itself, propose a scheduled task that runs it (schedule_task with template).
- Say in a few lines what it asks, what it does, what a run costs, and how to change it (Edit, or ask you).
