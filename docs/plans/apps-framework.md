# Apps: a plan for building apps on top of agents

*A proposal, 2 November 2026; revised the same day so that the visual editor follows Unreal Engine's Blueprints.
Nothing here is built yet; it is meant to be argued with.*

## In short

- An **app** is a small program built from agents. It **asks** for something, **does** the work in steps (agents,
  quick model calls, tools, code, people), **keeps** data, **gives back** results and **shows** screens of its own. It
  runs when someone presses Run, on a schedule, when something changes, when it is called, or from a button on one of
  its screens.
- **One app, three ways to make it**: describe it to an agent, wire it up with nodes as in Unreal
  Engine's Blueprints, or write it as files and code. All three edit the same definition (`app.json` and the files it names), so you can switch between
  them at any point, and an agent can pick up where a person left off, and the other way round.
- **Start with words, firm up with steps.** A new app can be one instruction to an agent. Parts that need to be
  cheaper, faster or surer become fixed steps or code. The app suggests this itself from its runs (**Firm it up**),
  and a fixed step can hand over to an agent when it breaks (**If it fails, an agent tries**).
- **Built from what is already here.** Today's template run becomes the agent step; the CSV runner becomes
  **Repeat**; webhooks, watchers and the scheduler become triggers; child sessions and Swarm become **At the same
  time**; Pages (its sandbox, editor, versions, storage and phone address) become the app's screens.
- **Templates become the simplest apps**: one agent step and the screen made for it. Their addresses, API, MCP
  tools, public pages and CSV runs keep working.
- **Order**: the format and the engine first (nothing visible), then steps and triggers in today's builder, then
  screens and data, then the App builder agent, then the node editor, then code-first and sharing. About
  14 focused weeks plus two of slack, to mid-February 2027.

## What I assumed

Say which of these are wrong; the plan changes with them.

1. You (or agents working for you) make apps on your own Naget Agent. They are used by you, by people you send a link
   to, by your programs and by other agents. A shared store of strangers' apps is not a goal yet (export, import and
   a catalog come last).
2. "Apps" becomes the name people read again, replacing "Templates" (see [Naming](#naming)).
3. Most apps will be made by describing them. The node editor is for shaping, wiring and debugging; code is for developers
   and for the parts that need it.
4. The stack stays: Fastify and SQLite on the server, React in the app, pages in the sandboxed frame. No workflow
   engine or node-editor library comes in; like every feature here, it is written fresh.

## 1. What an app is

Your words map onto its parts like this: the inputs are **what it asks**, the outputs **what it gives back**, the data
flow is its **steps** and the values passed between them, its behaviour is **when it runs** and what its agents are
told, and the custom UI is its **screens**.

| Part (as the builder names it) | What it is | Today |
|---|---|---|
| **What it asks** | Inputs: a form, or values from a trigger. Today's kinds of question, plus list, table and record | The form |
| **What it does** | Flows: steps in order, side by side or repeated. One flow (Run) to start with, more for other events | The task, one agent |
| **What it gives back** | Typed outputs: today's answer fields, plus file, image, record and *view* (a page made for one result) | The answer |
| **When it runs** | Triggers: Run, a button on a screen, a schedule, a change (a watcher), a webhook or the API, another agent (MCP), rows of a CSV, its data changing | Run, API, MCP, public page, CSV |
| **How it looks** | Screens: the one made for it, or pages of its own | The form and the result card |
| **What it keeps** | Data: collections of records its runs and screens share; files | Pages have storage |
| **Who works on it** | Named agents: agent, model, effort, mode, assistant, skills, instructions, a Space's knowledge | Who does it |
| **What it may use** | Tools, connections, folders, network, keys by name; spending per run and per day; runs per day | Tools, Limits |
| **Examples** | Saved inputs with checks, to try the app and to notice when it gets worse | Test run |

### From words to steps to code

Each step sits somewhere between "an agent, told in words" and "code", and it can move:

- An **agent step** is flexible, but slower, dearer, and it can surprise you.
- **Fixed steps** (one tool, a quick model call, a rule) are fast, cheap and predictable.
- **Code** does anything exact.

Two features move steps along that line:

- **Firm it up.** After a few runs the app notices that an agent step does the same thing every time (read the page,
  then sum it up) and offers to replace it with fixed steps, showing the time and money saved per run, after trying
  the change on the examples.
- **If it fails, an agent tries.** A fixed or code step can hand its inputs, the error and the outputs it owes to an
  agent, so the run carries on; the app then proposes a fix for the step.

This is what makes it a framework *on top of agents* rather than one more workflow tool: you can start with almost
nothing written down, and harden only what matters.

### An example: Reading list

Save links; each is summed up and tagged, and the unread ones arrive as a digest every Friday. (A sketch: the exact
shapes are settled in phase 0.)

```jsonc
{
  "format": 2,
  "name": "Reading list",
  "icon": "book",
  "color": "teal",
  "description": "Save links: each is summed up and tagged, and the unread ones come as a digest every Friday.",

  "inputs": {
    "url": { "label": "Link", "type": "url", "required": true }
  },
  "data": {
    "items": { "url": "url", "title": "text", "summary": "long", "tags": "list(text)", "read": "yesno" }
  },
  "agents": {
    "librarian": { "agent": "claude", "model": "sonnet", "instructions": "instructions/librarian.md" }
  },

  "flows": {
    "add": {
      "on": ["run", "screen", "api", "mcp"],
      "steps": [
        { "id": "page", "do": "tool", "tool": "read_page", "with": { "url": "{{inputs.url}}" },
          "failed": [{ "id": "sorry", "do": "tool", "tool": "notify", "with": { "text": "Could not read {{inputs.url}}" } }] },
        { "id": "sum", "do": "model",
          "instructions": "A title, a three-line summary and up to five tags for this page: {{page.text}}",
          "outputs": { "title": "text", "summary": "long", "tags": "list(text)" } },
        { "id": "save", "do": "data", "add": "items",
          "with": { "url": "{{inputs.url}}", "title": "{{sum.title}}", "summary": "{{sum.summary}}",
                    "tags": "{{sum.tags}}", "read": false } }
      ],
      "outputs": { "item": "{{save.record}}" }
    },
    "digest": {
      "on": [{ "schedule": "Fridays 17:00" }],
      "steps": [
        { "id": "unread", "do": "data", "find": "items", "where": { "read": false } },
        { "id": "write", "do": "agent", "agent": "librarian", "if": "{{unread.count}} > 0",
          "instructions": "instructions/digest.md", "outputs": { "digest": "long" } },
        { "id": "tell", "do": "tool", "tool": "notify", "with": { "text": "{{write.digest}}" } }
      ]
    }
  },

  "screens": { "main": "screens/main.html" },
  "permissions": { "tools": ["read_page", "notify"], "connections": [], "spendPerRun": 0.5, "spendPerDay": 3 },
  "examples": [
    { "flow": "add", "inputs": { "url": "https://example.com/a-post" }, "checks": ["sum.tags has one to five items"] }
  ]
}
```

- Types are short names (`text`, `long`, `number`, `yesno`, `date`, `url`, `file`, `list(text)`,
  `table(name: text, price: number)`, `record(…)`), with JSON Schema underneath: the same schema tools and MCP use.
- `{{inputs.url}}` and `{{sum.title}}` point at values; a bare `{{name}}` is an input, so today's tasks work as they
  are, and so do today's `{{#x}}…{{/x}}` sections. A rule (`if`) compares a value with a value (`=`, `<`, `>`,
  contains, is empty), joined by *and* or *or*. Small conversions are ready-made values (see
  [Data between steps](#data-between-steps)); anything cleverer is a code step or words: no expression language to
  learn.
- A step that takes a while has two exits: **Done** goes on to the next step, **Failed** to the steps under `failed`
  (`"failed": "agent"` lets an agent try instead; with neither, the run stops and says why).

Its screen is an ordinary page that uses App parts:

```html
<!doctype html>
<html>
<body class="n-page">
  <h1>Reading list</h1>
  <!-- The flow's form: sending it runs the flow -->
  <n-form flow="add"></n-form>
  <!-- Live: a link shows up as soon as it is saved -->
  <n-table data="items" columns="title, tags, read" edit="read" open="summary"></n-table>
  <n-chat agent="librarian" placeholder="Ask about what you saved"></n-chat>
</body>
</html>
```

A code step, for a place where exact arithmetic matters (which of your Hugging Face models lost downloads this week):

```ts
// steps/drops.ts
export const meta = {
  inputs: { now: 'table(model: text, downloads: number)', before: 'table(model: text, downloads: number)' },
  outputs: { drops: 'table(model: text, change: number)' },
};

export default async function ({ now, before }) {
  const was = new Map(before.map((r) => [r.model, r.downloads]));
  const drops = now
    .filter((r) => was.get(r.model))
    .map((r) => ({ model: r.model, change: r.downloads / was.get(r.model) - 1 }))
    .filter((r) => r.change < -0.2);
  return { drops };
}
```

## 2. How an app runs

### The kinds of step

Ten kinds, so the picker fits on one screen with a find field:

| Kind | What it does | Built on |
|---|---|---|
| **Ask an agent** | A session (Claude Code, Codex, Custom with any model, an added agent) with instructions, an assistant, tools, and outputs it must hand in | Today's run: `submit_result`, the reminder, follow-ups |
| **Ask a model** | One call, no session, typed outputs: sort, extract, sum up, choose. Cheap, and $0 on local models | The helper model |
| **Use a tool** | One tool with set inputs: web search, read a page, the browser, documents, images, a connection's tools, an HTTP request with a saved key | Session tools, connections, `http_request` |
| **Run code** | JavaScript or TypeScript (Python later) with typed inputs and outputs, in the sandbox | bubblewrap, as for Custom's commands |
| **Ask a person** | A form or an approval; the run waits as **Needs you**, with a card on the run, in the inbox and on the phone | `ask_form`, approval cards, the inbox, push |
| **Decide** | If / otherwise, by a rule (`price < 100`) or in words ("the reply sounds urgent"), which the helper model judges | /goal's judge |
| **Repeat** | For each item (so many at once), or until something holds (at most so many times) | The CSV runner, /goal |
| **At the same time** | Branches side by side, joined at the end; or a team: a swarm on one task | Child sessions, Swarm |
| **Keep data** | Add, change, find or remove the app's records | Pages' storage, grown up |
| **Call an app** | Another app, as one step | Apps as MCP tools |

Capabilities bring their own. The `Feature` interface gets a `steps()` hook beside `tools()`, so research, documents,
images, the browser and every connection show up as steps without the engine knowing about them, and a capability
added later appears in the picker by itself.

### Data between steps

- Small conversions are **values**, not steps: about twenty ready-made ones (the first item, a count, joined text, a
  field of a record, a date written out, sums and comparisons), worked out when a step needs them, like Unreal's pure
  nodes. In the steps list they sit inside the chips ("Tags › first"); in the graph they are small green nodes with
  value wires only.
- Each hand-off is checked against its type, as answer fields are today. An agent is told what to fix; any other
  step stops the run with the reason.
- Put into an agent's instructions, a table becomes a Markdown table, a record a list and a file its path. Files and
  long tables travel as files in the run's folder.
- What comes from outside (a webhook's body, a page that was read, a CSV row) reaches agents marked as outside data,
  as webhooks and watchers do today.

### The engine

- A run is a row in `app_runs`, as now; its steps are rows in a new `app_steps` (inputs, outputs, status, attempt,
  session, cost, times, error).
- Two kinds of wire, as in Unreal's Blueprints. **What happens next** is the order of the steps: one after another,
  the paths of a Decide, the body of a Repeat, the branches of At the same time. **Values** travel by reference from
  the step that made them to the steps that use them. Steps run side by side only inside At the same time, so a run
  never does (or spends) more at once than it shows.
- Steps that take a while (an agent, a model, a tool, a person, a wait) pause the run while they work, like Unreal's
  latent nodes, and leave by **Done** or **Failed**.
- A value from a step that may not have run on this path (the other side of a Decide) is flagged while you build.
  Each result is saved before anything uses it, and after a restart runs carry on from the last saved step (as CSV
  rows do today).
- Each step has a time limit, retries (tools and code), a share of the run's spending cap, and an option to reuse its
  result for the same inputs for a while.
- A run keeps the version of the app it started with, as runs keep their recipe today.
- Tools that expect a session get a context of the run's own, so a card a tool shows (an approval, a form) lands on
  the run's page and in the inbox.
- Triggers reuse what exists. Schedules and watchers are scheduler tasks owned by the app (listed under Scheduled
  tasks as "From the app …"); webhooks are today's (a secret, a signature, no double runs, `?wait`); the API, MCP,
  the public page and CSV rows keep their routes; screens use the bridge.

### Apps that live on: data, conversations, events

Not every app is "inputs in, result out". A reading list, a small CRM or a habit coach lives on: data that grows,
screens you come back to, an agent you talk to.

- **Data**: an `app_data` table (app, collection, record, times). Simple finds (equals, contains, between, sort,
  limit); change events to screens and to "when data changes" triggers; limits like a page's storage; CSV and JSON
  export; a **What it keeps** view. A collection is shared, or kept per person, so each visitor sees only their own.
- **Conversations**: a chat part opens a conversation with one of the app's agents, which gets the app's data and
  flows as tools. Each conversation is its own session, kept under the app; the data, not one endless transcript, is
  what the app remembers.
- **Memory**: the app's agents write no memory notes unless the app turns that on. Its data is its memory, which
  keeps memory lean.

### Flows written as code

A flow can be one code file:

```ts
// flows/triage.ts
export default flow({ inputs: { email: 'long' } }, async ({ email }, ctx) => {
  const { kind } = await ctx.model('Which kind of email is this?', { email }, { kind: 'choice(bug, question, sales, other)' });
  if (kind === 'bug') {
    const { issue } = await ctx.agent('engineer', 'Reproduce the bug and file an issue.', { email }, { issue: 'url' });
    await ctx.ask('Send the sender the link to the issue?', { issue });
  }
  return { kind };
});
```

Each `ctx` call is recorded as a step, so the run's page shows it like any flow. After a restart the code runs again,
and the recorded calls answer with their saved results until it reaches new work. So code reaches the outside world
only through `ctx`; the types and the docs say so plainly.

## 3. How an app looks

Four levels, each enough on its own:

0. **Made for it**: the form, the run as it goes, results as cards and tables, earlier runs and follow-ups: today's
   run page, built from the app's parts.
1. **A layout**: Form and result, Dashboard, List and detail, or Chat: a screen made from the app's parts, ready to
   change.
2. **Arranged**: the Pages editor, with an **App** group under **Add**: form, result, runs, a table of data, chart,
   chat, progress, a button that runs a flow, ask a person. The **Part** tab shows what each is tied to (which flow,
   which data). Or ask the agent to rearrange it. As in Unreal's UMG (a design, with a graph behind it), picking a
   button and choosing **When pressed** opens a flow that starts with that event.
3. **Written**: HTML and JavaScript with `naget.app`.

Results can also be **views**: an output of kind *view* is a page an agent writes for that one result (a map of the
trip, a chart of the prices), shown in the result in the same sandbox.

`naget.app` sits beside `naget.storage` in the page bridge:

```js
const run = await naget.app.run('add', { url });   // start a flow
run.on('step', showStep);                           // follow it live
run.on('result', showResult);
const items = naget.app.data('items');              // the app's data
await items.find({ read: false });
items.watch(redraw);                                // its changes, live
const chat = naget.app.chat('librarian');           // talk to one of its agents
await chat.send('What did I save about vLLM?');
naget.app.user;                                     // you, a guest or a visitor
```

The App parts are custom elements written on top of it and shipped in the page kit (like `.n-options` today), so a
page written by hand and one arranged in the editor use the same parts.

Screens run in today's sandbox: an opaque origin, with nothing of the app's sign-in. Each call is checked against the
app: which flows a screen may start, which data it may read or change, for which kind of user. A public screen
reaches only public flows and its own visitor's data. Keys never reach a screen. What people write on screens is
their own content, marked `translate="no"` as pages are.

Each app gets an address for a phone's home screen (the `/pg` shell) and, when you open it to anyone, a public page
(today's `/a/<slug>`) showing its screens.

## 4. Three ways to make an app

### Describe it

- Say "make me an app that …" in any session, or use **Describe it** on the Apps page (like Pages' "Or describe it,
  and an agent makes it").
- A built-in **App builder** assistant, with a bundled skill on building apps well: which kind of step to use when,
  typed outputs, examples, limits.
- The agent drafts the parts, saves a version, tries the examples, fixes what fails, and says what a run costs and
  takes before it hands over.
- The app opens beside the conversation, as a page does while it is written, and changes as the agent saves. You can
  use it, change a step or a part yourself, or press **Ask the agent** on one. The agent hears of your changes with
  your next message, as it does for pages.
- Tools: `app_get`, `app_save` (whole or a patch, checked, mistakes explained in plain words), `app_try` (runs a flow
  with inputs or the examples, returns the steps, outputs and cost), `app_data` and `app_screen`. Everything is in
  `app_api` too, as for every feature.
- **Make an app from this session** (today's **Save as template**) drafts steps from what the session did: tool calls
  it made the same way become fixed steps; the rest stays an agent step.

### Design it: nodes, as in Unreal's Blueprints

In Unreal Engine the node graph *is* the program: events start it, white wires say what happens next, coloured wires
carry typed values, and people who don't write C++ build whole games that way. Apps work the same way:

| Unreal Blueprints | The app editor |
|---|---|
| Event nodes (BeginPlay, OnClicked, custom events) | **When it runs**: When the form is sent, Every Friday at 17:00, When Add is pressed, When items change, When another agent calls it |
| White execution wires | **What happens next**: the order of the steps, the paths of a Decide, the body of a Repeat |
| Coloured data wires and pins, by type | **Values**, coloured by type (text, number, list, table, record, file…); only pins that fit connect |
| Function calls, and latent nodes (Delay, AI MoveTo) | **Steps**; those that take a while (an agent, a model, a tool, a person) show a clock and have **Done** and **Failed** exits |
| Pure nodes (maths, getters), with no exec pins | **Values** worked out when needed (first item, count, join text…): small nodes with value wires only |
| Branch, Sequence, ForEachLoop | **Decide**, **At the same time**, **Repeat** |
| Drag off a pin for the nodes that fit it | The same: let go of a wire in empty space and a short menu offers only what takes that type |
| Collapse to Function, macros | **Collapse to a block**: a selection becomes a block with pins of its own, reusable in other apps, changed in one place |
| A C++ function marked BlueprintCallable | A code step: its `meta` makes it a node with typed pins |
| UMG: the Designer, and the graph behind it | **Screens**: the Pages editor; a button's **When pressed** opens its flow |
| Variables, and AI's Blackboard | **The app's data**, and the run's values |
| Play In Editor: breakpoints, watched pin values | **Try it**: wires light up as the run goes; point at a wire to see its value; a red dot pauses before a step; step through |
| A node that fails to compile | Mistakes show on the node itself, checked as you build, with no Compile button |
| Comment boxes, reroute nodes | **Groups with a note**, and **bends** to route a wire |
| My Blueprint and Details panels | **Outline** (screens, flows, data, agents, examples) and **Inspector** (the picked node's settings, drawn from its kind) |

What differs from Unreal, on purpose:

- **One flow, two views.** The steps list is the what-happens-next wires: the steps in order, with Decide and Repeat
  as indented blocks and values as chips. The graph adds the value wires. Phones and quick changes use the list;
  branching and wiring use the graph on a computer. Switch any time.
- **Readable files, not binary ones.** Unreal keeps Blueprints in binary assets: git can't merge them, and comparing
  two versions needs Unreal itself. Here a flow is stored as steps in `app.json`, readable for people, agents and
  git; where its nodes sit is kept beside it in `graph.json`, which the editor writes and agents may ignore (nodes
  without a place are laid out by themselves).
- **No spaghetti by construction.** What-happens-next wires join only where paths end (after a Decide), never into
  the middle of another path, so every graph also reads as a list. **Tidy** lays a graph out again, and the agent can
  tidy one too.
- **Freezing makes trying cheap.** (Not "pinning": in Unreal, pins are a node's connectors.) A frozen step keeps the
  output of its last run for later tries, so building the steps after an expensive agent step costs nothing.
- **No typing references.** An input offers only the values that fit it; in text they sit as chips.
- **Few visible controls.** A node shows what it uses and gives back; agent, model, limits, retries and reuse wait
  behind **More**.
- **On a phone**: the outline and the steps list, the inspector as a sheet from the bottom, Try it, and screens in
  the Pages phone editor. No graph.

### Write it

An app is a folder, kept where agents can open it (outside the app's private data):

```
reading-list/
  app.json            what it asks, does, gives back, keeps and may use
  instructions/       agents' instructions and long prompts, in Markdown
  screens/main.html   pages that use naget.app
  steps/*.ts          code steps, or whole flows
  examples/*.json     inputs and checks
  files/              what its agents should know
```

- Its data stays in the app's database, not in the folder.
- Edit it with any editor or coding agent (Claude Code or Codex in a session opened on the folder). The app watches
  the folder and reloads; the editor says **Changed outside the editor**.
- `app.json` has a JSON Schema at `/api/apps/schema.json` for completion and checks, and there are types for code
  steps and `ctx` (`naget-app.d.ts`).
- A code step exports `meta` (what it uses and gives) and a function; the editor draws its fields and pins from
  `meta`. TypeScript runs as it is (Node strips the types); Python comes later.
- From the command line: `node dist/server/cli.js app new | dev | try | export | import`; `dev` watches, reloads and
  runs the examples.
- The folder can be a git repository. Export is one `.naget-app` file: the folder, zipped.

### Keeping the three in step

- `app.json` is the source of truth; instructions, screens and code live in the files it names.
- The editor writes `app.json` in a stable order and keeps keys it does not know, so diffs stay small and hand edits
  survive.
- Every save, from the editor, an agent or the folder, is a version with a line saying what changed ("Added Check
  prices after Find hotels"); **Versions** brings one back. Runs keep the version they started with.
- When two saves overlap (you and the agent), the later one asks before going on top, as pages do.

## 5. Safety, cost and sharing

- **Declared and shown.** What an app may use is written in the app, shown in plain words when it is imported or
  shared ("This app searches the web, reads your Notion and may spend up to $2 a run"), and enforced. The tools list
  works as today; a list of connections per app is new (today a run gets every connection that is on).
- **Code** runs as a separate process under bubblewrap, like Custom's commands: the system read-only, a temporary
  folder of its own, the network off unless the step asks for it, limits on time and memory. Where bubblewrap cannot
  run, code steps run only in your own apps, never in imported or public ones.
- **Screens**: the Pages sandbox and the checks above; no keys.
- **The risky mix.** The editor warns when one step reads outside content, can reach private data and can send
  things out (it reads web pages and your mail, and can send mail), and offers an **Ask a person** before the
  sending.
- **Public apps**: Custom only, no commands or files, budgets and rate limits: today's public page rules, now for
  flows and screens.
- **Imported apps** arrive with their triggers off and a permissions card to accept.
- **Cost**: caps per run and per day; a model per step (quick model steps, $0 on local models); reused results; an
  estimate before a CSV (as today) and per run from history; the cost of every step on every run.
- **Sharing**: a link (the public page), API keys, other agents (MCP), the phone address, the `.naget-app` file, and
  later a catalog anyone can add to, like `catalog/connections/`.

## 6. What happens to today's features

- **Templates** become Apps. Each upgrades to one agent step, its task kept word for word:

  ```jsonc
  { "format": 2, "name": "Trip planner", "inputs": { "destination": { … }, "start": { … }, "days": { … } },
    "flows": { "run": { "on": ["run", "api", "mcp", "public", "rows"],
      "steps": [{ "id": "plan", "do": "agent", "agent": "claude", "instructions": "<today's task>",
                  "outputs": { "summary": "long", "itinerary": "table(…)" } }],
      "outputs": "{{plan}}" } } }
  ```

  "Template" stays as the word for the ready-made apps you start from (**Start from a template**).
- **Pages** stay as they are. A kept page gets **Turn into an app**: its HTML becomes the app's screen and its storage
  the app's data. An app's screens live inside the app, not in the Pages library.
- **Scheduled tasks** stay, for "do this every morning" prompts. App triggers run on the same scheduler and show in
  the same list, marked with their app, so one place lists everything that runs by itself.
- **Connections** become tool steps; their "connected apps" wording changes (below).
- **Child sessions, Swarm, /goal, watchers, webhooks and the helper model** become kinds of step and triggers, and
  stay as they are in sessions.

### Naming

On 1 November Apps was renamed Templates, because "Apps" ran together with Pages and connected apps. With apps
becoming a real thing:

- **Apps** are your own apps. The code already says apps (`server/apps`, `/apps`, `/api/apps`).
- **Connections** keep their name, but "connected apps" in their texts becomes "connected accounts" (or "services").
- **Pages** are things to read and keep; apps are things to use. A tracker can be either, and **Turn into an app**
  moves it across.

## 7. Roadmap

Each phase ships something people can use and keeps everything that works today working. Each also carries this
repository's docs work: the guide in English, Chinese and Greek and its pictures, `features.md` and the README (and
its film, if it shows that part), the search box's catalog and vectors, the dictionaries, API routes in the guide,
what agents are told, and the release notes. Plan on about a quarter of each phase for it.

### Phase 0: decide, and write the format (this week)

- Settle the decisions in section 8.
- `shared/app-manifest.ts`: the types, the checks (mistakes explained in plain words) and the upgrade from today's
  recipe.
- Write the compatibility tests first: every ready-made template, the API contract, the MCP tools, the public page
  and CSV runs, all on the new format.

### Phase 1: the engine (nothing visible changes)

- `app_steps`, the executor (ready steps, saving, resuming, retries, limits, reuse) and a run context for tools
  outside a session.
- Kinds of step: agent (today's run, moved in), model, tool, decide, repeat, at the same time, call an app.
- Every template runs as a one-step app.
- **Done when** every existing apps test passes on the engine, and a two-step app (a model, then an agent) runs from
  the API with its steps shown.

### Phase 2: steps and triggers in the builder → 0.11.0

- The builder gets **What it does** (the steps list, the picker, value chips, type checks) and **When it runs**
  (schedule, watcher and webhook beside Run, API, MCP and CSV).
- Code steps (bubblewrap) and Ask a person (cards on the run, in the inbox and on the phone); a notification tool,
  which apps need and agents do not have yet.
- The run page shows the steps, each with its outputs, time, cost and session; **Try it** with frozen steps, and
  **Run again from here**.
- A graph of each flow to look at, laid out by itself in the node style of phase 5: it lights up during Try it, and a
  click on a node opens it in the inspector.
- Agents can build and run multi-step apps through `app_api`.
- Templates becomes Apps wherever people read it (the guide topic, with old links still working; the search box; the
  dictionaries).
- **Done when** "Competitor watch" (every Monday → for each competitor: read their page → a model notes what changed
  → if anything did: an agent writes a brief → a notification) is built without code and tried with frozen steps.

### Phase 3: screens and data → 0.12.0

- `naget.app` in the bridge, the App parts, and the App group in the Pages editor with what each part is tied to.
- Data with live changes, **What it keeps** and per-person collections (the Keep data step); conversations with the
  app's agents; views as outputs.
- The layouts, the phone address, public screens, and **Turn into an app** for kept pages.
- **Done when** Reading list (above) works with its own screen, data and chat, from a phone's home screen.

### Phase 4: the App builder → 0.13.0

- The App builder assistant and skill, the `app_*` tools, the app beside the conversation, your changes reaching the
  agent, **Describe it** on the Apps page, and **Make an app from this session** with steps.
- **Firm it up**, and **If it fails, an agent tries**.
- **Done when** a paragraph becomes a tested app with a screen; you change one step in the editor and the agent builds
  on your change; and Firm it up shows a real saving on a real app.

### Phase 5: the node editor → 0.14.0

- Editing in the graph, Blueprint-style, on a canvas of our own: wiring by dragging, the short menu when a wire is let
  go, values as nodes, Collapse to a block (blocks with overrides, reusable across apps), groups with notes, bends,
  Tidy, and `graph.json` for where nodes sit.
- Try it in the graph: wires lighting up, values on the wires, pausing before a step, stepping through.
- On computers only; phones keep the list.
- **Done when** a branching flow (sort into three kinds → three paths → join) is built and debugged in the graph with
  frozen steps, and one block is used in two apps.

### Phase 6: code-first and sharing → 0.15.0

- The app as a folder, reloading on change, the schema and types, the CLI's `app` commands, Python steps (a uv
  environment per app), and flows written as code, with replay.
- `.naget-app` export and import with the permissions card; the gallery of apps and blocks; examples compared across
  versions (pass rate, time, cost).
- **Done when** an app written in VS Code reloads live in Naget, and moves to another machine through its file and its
  permissions card.

### Timeline

| Phase | When | Size | Ships |
|---|---|---|---|
| 0 · Decide, write the format | 2–6 Nov | 1 week | |
| 1 · Engine | 9–20 Nov | 2 weeks | |
| 2 · Steps and triggers | 23 Nov – 4 Dec | 2 weeks | 0.11.0 |
| 3 · Screens and data | 7–18 Dec | 2 weeks | 0.12.0 |
| Slack, holidays | 21 Dec – 1 Jan | 2 weeks | |
| 4 · App builder | 4–15 Jan | 2 weeks | 0.13.0 |
| 5 · Node editor | 18 Jan – 5 Feb | 3 weeks | 0.14.0 |
| 6 · Code-first, sharing | 8–19 Feb | 2 weeks | 0.15.0 |

Sized for one person steering agents at a careful pace. This repository often moves faster than that, but here design
and review set the pace, not typing. The order matters more than the dates: phases 1 to 3 carry the risk, and 4 to 6
build on them.

## 8. Decide first

1. **The name.** Apps for the framework, and "connected accounts" in Connections (recommended). Or keep Templates for
   the simple ones and call the rest "agent apps"; or call the whole thing Tools.
2. **Where an app lives.**
   - A. A folder per app, indexed in the database, with versions as snapshots (recommended: editors and coding agents
     work on it directly, and git is there when wanted).
   - B. Rows in the database, as now, with export to a folder: simpler, but developers and coding agents work on
     copies.
3. **What flows are stored as.** Steps in `app.json`, with code as steps or as whole flows, and the graph drawn from
   them (recommended). Or nodes and wires as the stored form, as Unreal does (much harder for agents to write and for
   people to read in a diff); or code only, with the editor drawing it (hard to edit visually and keep in step).
4. **What screens are.** HTML pages with App parts in today's sandbox (recommended: the Pages editor, versions, themes,
   the phone address and publishing come for free). Or a JSON layout drawn by the app's own React: tidier and easier
   to lock down, but a new editor and far less freedom.
5. **What comes after the engine.** Screens (phase 3) before the App builder (phase 4), as above (recommended: the
   builder then has screens to build with, and agents can already build multi-step apps from phase 2). Or the App
   builder first, for the quickest "describe it" demo.
6. **When editing nodes comes.** After the App builder, with a graph to look at from phase 2 (recommended: most
   people will describe their apps, and how they use the builder shows what the node editor needs). Or swap phases
   4 and 5 if wiring nodes matters more to you: the total time is the same.

## 9. Risks

| Risk | How to keep it small |
|---|---|
| Building n8n, Retool and Unreal's Blueprints at once | Each phase ships on its own; editing nodes waits until the format has settled |
| The format keeps changing | A `format` number, upgrade functions and tests from phase 0 |
| Agent steps wander or cost too much | Typed outputs, caps, quick model steps, frozen steps, Firm it up |
| Code steps and imported apps | bubblewrap, the permissions card, triggers off on import, no keys in screens |
| The editor overwhelms people | Steps list first, few visible controls, More for the rest, a picker of ten |
| Spaghetti graphs, as Blueprints get | Blocks, wires that join only where paths end, Tidy, groups with notes, the list view |
| Breaking what works | Compatibility tests for templates, the API, MCP, public pages and CSV runs |
| You and the agent change an app at once | Versions, and the later save asks first |
| The docs work | A quarter of each phase, done at the end of the phase in one go |

## 10. How we will know it works

- A simple app from a description in under five minutes; a three-step one in under fifteen.
- Most apps made without code.
- At least 95% of runs end with outputs that fit, and the rest say why.
- After Firm it up, a repeated app costs less and runs faster than as a single agent, measured on its examples.
- No existing template, API caller, MCP caller or public page notices the change.
