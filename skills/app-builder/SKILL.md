---
name: app-builder
description: Use when making or changing one of the user's apps (made here: a form, steps, a view, data, screens and examples), or when they want a tool they will run again and again, or work that runs by itself.
triggers: [make a template, build a template, make an app, build an app, an app that, a tool that, every time I, automate, workflow]
---

# Building apps

An app is what it asks (a form), what it does (one agent's task, or steps), what it gives back
(answer fields), how its answer looks (a view: pages, elements, events), what it keeps (lists of records, a
memory), its own page (a screen, or view pages for it), when it runs (its form, a schedule, a webhook, a watcher)
and examples to try it with. Build them with app_get, app_save, app_try,
app_screen and app_data (its records: start it off with some, or see what its runs kept); app_guide's apps
topic says what each part does, and its API topic gives the format.

## 1. Pin down the job

- What goes in: the form's questions, few, each of the kind that fits (number, date, choice, yes or no, file).
- What comes out: answer fields with types (a table when there are rows, a list for short items, `media` for
  pictures, videos or files the agent finds or makes: an https:// address, or a file's path on this computer, of
  which a copy is kept; a table's `image` column for a picture in each row).
- What it needs: keys for the services it calls (an API key, a token) go in `secrets` by name, with the hosts each
  may go to and where to get one, never a value: the user gives them when installing it or before its first run,
  and its runs use them by name (http_request `auth: NAME`). Check list_connections for a key already saved.
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
  - **Keep data** to add, find, search or change the records the app keeps.
  - **Work out a value** for the first item, a count, a sum or an average, a field of each, a join or a sort: at
    once and free, no code step needed.
  - **Call an app** to reuse a block: an app made to be a step of others (block: true; app_get's list marks
    them). Ready-made ones sum up a page, translate, answer from the web, sort into kinds and pull out facts. A part
    used in several apps is worth making a block of its own (block: true), changed in one place.
  - **Run code** for exact arithmetic, parsing and formatting: JavaScript, TypeScript or Python, no network. A
    program can also be the flow itself, when its logic is easier written than drawn: ctx.model, ctx.agent,
    ctx.tool, ctx.ask, ctx.data and ctx.app are steps of the run, kept and replayed after a restart (so make the
    same calls in the same order for the same input). Say what it gives (outputs).
  - **Ask a person** before anything that sends, spends or deletes, and when the choice is the user's.
  - **Ask an agent** for the parts that need judgement and tools, with outputs it hands in.
- Every step's outputs are what later steps use (`{{step.value}}`); the form's answers are `{{field}}`, a Repeat's
  item `{{item}}`, and the built-in values `{{today}}`, `{{now}}`, `{{weekday}}`, `{{timezone}}` (the user's) and
  `{{run.source}}` (web, api, task, batch…: guard an Ask a person step with it, so runs nobody watches never wait).
  Fill the answer fields from the steps (`flow.outputs`), or let them come by name.

## 3. Examples, then try

- Write two to four examples with checks (rules on `{{answer.field}}`, `{{step.value}}`, `{{reply}}`) before you
  hand the app over: the usual case, an edge, and one that should be refused or come back empty.
- Try them with app_try and fix what fails. Say what a run costs and how long it takes.
- To change a late step, save the change and run again from that step (its run page, or a test run in its Edit):
  the steps before it give what they gave, at no cost.
- Each save that changes it is a version, its line app_save's why: try the examples on each saved version (Versions
  compares them), and when a change made it worse, app_get with version gives the one before to save again.

## 4. Design how its answer looks

Give every app people will read a view (`ui`, saved with app_save): its answer then opens in pages made for it,
not a plain card. The format is in app_guide's API topic (Apps: views).

- **Pages** are tabs, one for each thing a person comes back to (the trip, the days, what to book, the budget),
  at most four or five; a detail page (`tab: false`) opens from a click on an item (a day, a product).
- **Elements** are small HTML templates that the answer fills: `{{result.overview}}`, a day card drawn once for
  each day (`data: "result.days", each: true`, with `{{date|weekday}}` inside), a big number (`{{result.flags|count}}`).
  Give each element its own CSS (rules for what is inside it, `&` for itself), with the page kit's colours only
  (`var(--n-card)`, `--n-line`, `--n-muted`, `--n-accent`, `--n-accent-soft`, `--n-ok`, `--n-warn`, `--n-err`,
  `--n-radius`), so it fits the app in light and dark; no fixed widths; no animations; text people read at 14–15px.
  Built-in elements save work: text (Markdown with values), markdown, list, checklist (ticks kept with the run),
  table, chart (bars), and for media: image (pictures side by side, opening large), video (a file, YouTube,
  Vimeo), audio, map (rows with `lat` and `lng`: `with: { label, popup, line: true, numbered: true }`; the agent
  must hand in coordinates) and plot (Plotly from rows: `with: { kind: line|bar|area|scatter|pie|histogram|
  heatmap|scatter3d|surface, x, y, series, stacked }`, or a Plotly figure as the value).
- **Widgets**, for what no element draws (a 3D scene, a game, a chart library's own look): `ui.widgets.<name>.code`
  is an ES module, `export default function (el, value, view) { … }`, placed by a block as an element is; it
  imports the npm packages `ui.libs` names at exact versions (`"three": "0.170.0"`), loaded from jsDelivr. Use
  the built-in map and plot first; a widget reaches the app only through `view.event(name, item)` and `view.set`.
- **Its own files** (pictures, a logo, sample videos, a data file): app_save's `assets` (a name → a path or an
  https:// address); a view shows one as `asset:<name>` (an image block's value, or a template's `src`). They
  travel in its .naget-app.
- **Events** make it useful: `data-event="name"` on a button, mapped to actions. Go to a detail page with the item;
  tick something off and keep it (`toggle`, `name: "done.@key"`, `keep: true`); filter with `set` and a block's
  `where`; copy the part people paste elsewhere; run it again with one answer changed (`again`: a slower pace,
  one more day, a more formal letter, new questions); start another app on part of it (`start`). `ask` (a
  follow-up to the agent) works only for one-task apps; with steps, use `again` or a flow (`run`, with `as` to
  show its answer).
- Save, then app_try a run and read its `view`: the names it uses that the answer did not give show empty. Send
  the user the run's link (the view opens there) and say what its buttons do.

## 5. Safe and cheap

- Limits: runs a day and the most a run may spend. Tools: only those it needs.
- A step that may fail says what happens then (If it fails…: go on without it, other steps, or `failed: "agent"`:
  an agent does a tool, model, code, data or app step's work with what it was given, and the run goes on).
- Nothing reaches outside data and private data and sends things out in one step without an Ask a person first.

## 6. Firm it up later

- app_get's advice says what an app's runs showed: a step that failed and had an agent do its work (fix it so
  it works by itself), and an agent step that did the same each time, with the fixed steps that could do it.
  Put those in its place, try them on the examples (app_try with the recipe), compare time and cost, then save.

## 7. Hand it over

- A screen (app_screen) when it will be used often or keeps data: start from the one made from its parts. Its
  `<n-chat>` part lets people ask the app's agent about its records, or to change them or run its flows.
- When it should run by itself, propose a scheduled task that runs it (schedule_task with template: the app and its answers).
- Agents in the user's sessions run their apps for them (use_app, when asked for what one does), asking on the
  app's card for what the request left out: give its questions labels that read on their own, and mark only what
  it truly needs as required. An app used on its own page (a screen, or a view of what it keeps) gets
  `sessions: false`, so agents leave it alone.
- Say in a few lines what it asks, what it does, what a run costs, and how to change it (Edit, or ask you).
