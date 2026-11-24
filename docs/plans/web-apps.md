# Web apps: whole products on a kit, inside Hydor or anywhere

*A proposal, 24 November 2026, meant to be argued with. Phase 0 was built the same day (section 10 says what it
found); the rest is not built. It follows [Apps: a plan for building apps on top of agents](apps-framework.md), which
is built: agent apps stay as that plan made them.*

## In short

- **One kind of app, with two halves.** An *agent app* stays a small tool for one job, run by Hydor's agents and
  shown as cards. When it needs more it gets **an app of its own** on the kit: real pages, its own data and
  accounts, behaving like a proper web app, with its flows still run by agents. A *web app* is the same kit without
  the flows: a whole product with pages, accounts, database, payments and search. An app moves from one to the
  next without starting over.
- **One kit, two places to run.** The same code runs inside Hydor (which keeps it running, signs you in and lends it
  its models, agents and embedding model) or standalone (a server, a one-click platform, serverless), with accounts
  and keys of its own. What differs sits behind nine seams, set by configuration and never by changing the app.
- **Hydor Kit** (MIT, a public repository of its own) is versioned packages for what should be the same in every
  app (the core, each block's engine, the interface parts), thin source copied into the app for what makes it this
  app, **blocks** that bring both (accounts, teams, billing, search, admin, landing sections, blog, store,
  booking…), **starters** (one per app type), **designs**, and **checks** that travel with each block. Every block
  says in a manifest what it needs, what it offers and which choices to put to the maker.
- **Updates reach apps.** A fix or an improvement in the kit arrives as a new version of a package: `kit upgrade`
  takes it, runs its migrations and the checks, and nothing is merged. Only the thin copied source is joined three
  ways, and a part a maker wants to change is taken into the app (`kit eject`) and joined from then on.
- **The stack**: TypeScript, React, TanStack Start on Vite, Tailwind and shadcn/ui, Drizzle on SQLite first, Better
  Auth, Stripe, and Hydor's own hybrid search (words and 4-bit vectors, joined by rank), with a small embedding
  model on the app's own server by default.
- **The guide**: the App builder takes the maker through seven stages (Brief, Features, Design, Build, Check, Launch,
  Run). At each it shows options to pick from, read from the kit's manifests and drawn from the real blocks, with
  the live app beside the conversation and the app's own page as the map.
- **Safe by construction.** The failures reported for AI-built apps (rows anyone can read, keys in the browser) are
  closed in the kit's data layer and checked by tests the kit writes itself, not left to each generated route.
- **All twelve app types**, in four waves. The scope is fixed and the dates move, so there is no calendar here: the
  order is the plan, and a phase is over when its "done when" holds.

## What is decided

| Question | Decision | Where it lands |
|---|---|---|
| How apps inside Hydor and standalone apps relate | One kit, two places to run; agent apps stay and plug in | Sections 2 and 3 |
| The base stack | React and Vite on one plain Node server | TanStack Start, with a fallback (section 4) |
| How prebuilt material reaches an app | Source blocks on a small tested core package | Section 4 |
| Agent apps on the kit | Agent apps can use the same kit when they need more: an interface of their own, not only what an agent shows in a session, behaving like proper web apps | Section 2: one kind of app with a flows half and a web half; a ninth seam, flows |
| Updates | An app must stay easy to update as the kit gets fixes and improvements; some parts are reused and updated in place | Section 4, "How an app stays current": more lives in packages, less is copied |
| Licence of the kit and what it puts in apps | MIT | Section 4. Hydor itself stays AGPL-3.0 |
| Where the kit lives | A public repository of its own, a copy inside each Hydor release | Section 4 |
| Database and search | SQLite first, Postgres as a switch | Sections 3, 4 and 9 |
| Vectors in a standalone app | A small model on the app's server by default, an API as an option | Section 6 |
| Where a web app goes live | Inside Hydor; Docker over SSH; Render, Railway, Fly.io; Cloudflare and Vercel | Section 9. No hosting service of ours |
| Agent steps outside Hydor | An AI block first, a portable runtime for agent-app steps later | Section 6, Phase 8 |
| Where the guiding happens | The app's page is the map, the conversation does the work | Sections 7 and 8 |
| App types | All twelve | Four waves (section 6) |
| When | No date: the order matters, quality sets the pace | Section 10: an order and sizes |
| What gives first | The date | Nothing is cut |
| Names | Left empty | Hydor Kit, Agent apps, Web apps |

## What I assumed

Say which of these are wrong; the plan changes with them.

1. **Makers who do not code come first.** They never have to open a file. The code is always there for those who want
   it, and the kit works without Hydor for developers and their own coding agents.
2. **TypeScript end to end.** A Python worker block comes later, for apps with models of their own (as Hydor runs
   its embedding worker).
3. **One App builder for every app.** It says which halves an app gets (flows, pages of its own, or both) and why,
   and the maker can overrule it.
4. **Accounts are the app's own** (Better Auth), with no sign-in service to rent. Inside Hydor, Hydor's sign-in
   stands in for them.
5. **Stripe first**, behind an interface, so a second provider that is the merchant of record can follow.
6. **Inside Hydor a web app is private**: you and the people you share it with. Anyone on the internet means
   launching it (Decide next, 3).
7. **Phones get an installable web app.** Native apps are not in this plan.
8. **The kit sends nothing home.** Quality is measured on a benchmark of scripted briefs we run ourselves.

## 1. What is there today

**Agent apps.** A recipe (`shared/apps.ts`, flows in `shared/app-manifest.ts`): a form, eleven kinds of step, typed
answer fields, a view, records (20 collections, 20,000 records), screens, examples with checks. Hydor's agents run
it, so it runs only where a Hydor server is. Views and screens are drawn in a sandboxed frame with no origin of its
own. The public page (`/a/<slug>`) is the form and the answer, on Custom only. An app has no accounts, no routes, no
database beyond its records and no server of its own, and the App builder is told to keep an app to one job and to
send "a whole product" to a project instead. That is the gap this plan fills.

**What a builder of web apps can reuse.**

| Already in Hydor | Used here for |
|---|---|
| Preview (`server/preview.ts`): a dev server shown from an origin of its own, Hydor's cookies kept from it, a streamed view where only one hostname reaches the computer | Running a web app inside Hydor |
| The vault, `request_secret`, `run_with_secrets` | Keys by name; pushed to a host at launch, never seen by agents |
| Projects, with a hidden `web` kind that already gives a web developer agent | A web app is a project |
| Pages beside the conversation, before and after screenshots, the browser | The live app beside the conversation; checks that look |
| Child sessions and tiers | A lead that decides, helpers that adapt blocks in parallel |
| Skills: frontend-polish, web-app-qa, ui-mockups, brand-kit, seo, security-check, web-accessibility, docker, servers, sql-and-databases, dependency-upgrades | The method for each stage |
| `how_to_make`: landing, pricing, portfolio pages; hero, features, testimonials, pricing, FAQ, footer blocks | The first landing sections, ported |
| Hybrid search (`server/memory`): FTS5, 4-bit vectors scanned in process, rank fusion | The kit's search block |
| Connected apps for Stripe, Cloudflare, Vercel, Railway, Neon and others | Setting up accounts at launch |
| `app_sketch`, the builder beside the conversation, `.hydor-app` files, versions | The same habits for web apps |

**What is missing.** A kit to build on; a method for accounts and payments (none of the 76 skills covers them) and
for launching an app from start to end (the docker and servers skills cover parts); a way to keep an app's own
server running inside Hydor; anywhere to launch to (`publish_site` serves files only, and the Dockerfile,
`compose.yaml` and `render.yaml` in this repository deploy Hydor itself). Nothing says who owns what people make
with Hydor: this plan adds that sentence (section 4).

## 2. One kind of app, with two halves

An app can have a **flows half** (the recipe an agent app is today: a form, steps, an answer, run by Hydor's
agents) and a **web half** (an app on the kit: pages, data, accounts). It has either, or both, and it gains the
other without starting over.

| | Agent app | Agent app with an app of its own | Web app |
|---|---|---|---|
| Halves | Flows | Flows and web | Web |
| What it is | A small tool for one job, shown as cards in a session and on its page | The same work by agents, behind a real interface: its own pages, lists, settings, history | A product: pages, accounts, data, payments |
| Its interface | A view Hydor draws (cards, elements, widgets) | Pages on the kit, built from the kit's interface parts, with parts made for runs | Pages on the kit |
| Who works when it runs | Hydor's agents and models | Hydor's agents and models, started from its own pages; its own server for the rest | Its own server; models only where it uses AI |
| Its data | Records | A database of its own, which its agents reach through the app's functions | A database of its own |
| Its users | You, people with its key, visitors of its public page | Hydor's sign-in inside Hydor; accounts of its own once launched | Accounts of its own (Hydor's sign-in inside Hydor) |
| Where it runs | Inside Hydor | Inside Hydor; anywhere once its steps can run outside (Phase 8) | Inside Hydor, or anywhere |
| What a use costs | Model use, every run | Model use for the runs; hosting once launched | Hosting; model use only for AI features |

**What the web half adds to an agent app.**

- **A ninth seam, flows.** The app's pages start a flow, follow its steps as they go, show its result, answer what
  it asks a person, and list earlier runs, all through one interface (`flows.run`, `flows.get`, `flows.list`).
  Inside Hydor the driver is Hydor's own engine, so nothing about how agents run changes. Outside it is the
  portable runtime of Phase 8; until then the guide marks such an app **Only inside Hydor** when the half is added.
- **Parts made for runs**, in the kit's interface package: the form of a flow, the run as it goes (its steps, what
  it found so far), the result (text, tables, pictures, and the cards an answer is made of), a question waiting for
  a person, a conversation with one of the app's agents, the list of runs.
- **Its agents work on its data through the app, not around it.** The app's server functions are offered to its
  agents as tools. A run acts for the person who started it, so every call goes through the same narrowed handle
  as a click on a page: an agent can no more read another person's rows than that person could.
- **The recipe lives in the app's folder** (`flows/`, beside `src/`), so the steps, the pages and the tables are
  one project in git, edited together and updated together.
- **Everything an agent app has today keeps working**: agents run it in sessions (`use_app`) and show its card,
  its API keys, its MCP tools, its schedules, its file. **Open the app** on the card opens its own pages.

**The front door.** **New app** on the Apps page keeps its menu and gains one entry: **Describe it to an agent**,
**Start from a type** (the app types as cards, each with a picture and what it comes with), **Start from scratch**
and **Install from a file**. The App builder's first reply is one sketch, as today, and the sketch now says which
halves the app gets. Its rule of thumb: a job an agent does for you, answered in a card, is flows alone; when
people will come back to it, keep things in it, or need more than a card shows, it gets pages of its own; when no
agent does the work, it is the web half alone. It says why, and the maker can overrule it.

**Moving up, later.**

- **Give it an app of its own**, on an agent app: its form and view become pages on the kit, its records tables,
  its flows stay as they are. Its address, keys and schedules do not change.
- **Add flows**, on a web app: the same half from the other side.
- A web app inside Hydor can also **call another agent app** as a function (a trip planner behind a travel site's
  back office), within its daily cap.
- The ready-made **Build a small web app** is retired once the guide covers it (Phase 2): the guide does the same
  job with a kit under it.

**Names.** The Apps page shows one list of apps, with marks for what each has (**Agents**, **Its own pages**),
and **Connected apps** beside it. The Preview page lists the dev servers it finds under "Web apps" today; those
that are not kit apps become **Running here**.

## 3. One kit, two places to run

An app never asks where it is. It asks a seam, and the seam's driver is picked per environment in the app's
configuration.

| Seam | Inside Hydor | On a server (Docker, Render, Railway, Fly.io) | Serverless (Cloudflare, Vercel) |
|---|---|---|---|
| **Who is signed in** | Hydor's sign-in: you and those you share with | Accounts of its own | Accounts of its own |
| **Database** | A SQLite file in the app's data folder | A SQLite file on a disk; Postgres later | D1 on Cloudflare; Postgres on Vercel |
| **Files** | A folder | The disk, or S3-compatible storage | R2 or S3 |
| **Jobs** | A loop in the app's process | The same | The platform's cron calls a tick route |
| **AI** | Hydor's models by tier, its agents and agent apps, within a daily cap | The maker's key: an OpenAI-compatible endpoint, Anthropic, a model server of their own | The same |
| **Embeddings** | Hydor's embedding worker (no memory of its own) | A local model in a worker, or an API | An API, or Workers AI |
| **Mail** | An outbox you read on the app's page; nothing leaves until you set a sender | SMTP or a mail service | A mail service |
| **Live updates** | In the app's process | The same | Durable Objects on Cloudflare; none on Vercel |
| **Flows** (an app with agents) | Hydor's own engine: its agents, tools and step kinds | The portable runtime (Phase 8), for the step kinds that need no Hydor agent | The same |

- **Environments.** `dev` (sample data, inside Hydor), `hydor` (your real use inside Hydor) and `production`. Each
  names its drivers and the keys it needs, by name only.
- **Web standards from the first day.** Outside the drivers, blocks use only what every runtime has (fetch, Web
  Crypto, streams). The kit's own tests run the skeleton on Node and on Cloudflare's runtime from Phase 1, so
  serverless is never a port done later.
- **The place decides what fits.** Each block says where it runs. `kit check --target <place>` lists what an app
  uses that the place lacks, in plain words ("Live chat needs a server that stays up: Vercel cannot hold
  connections open"), and the guide says it before the maker picks a place, not after.
- **What Hydor lends is marked.** The same check lists what an app takes from Hydor (its models, an agent app, the
  embedding worker) and what stands in for each outside. A feature with no stand-in yet (a step that needs a Claude
  Code session) is marked **Only inside Hydor** when it is added.
- **Moving out.** The database file and the files go along. The owner becomes the first admin account and the
  others are invited. Production data never comes back into Hydor unless you ask for a copy.

## 4. The kit

### What is in it

```
hydor-kit/                 public, MIT
  packages/core/           the plumbing an app depends on: configuration, the seams and their drivers, migrations,
                           access rules, security defaults, health, logs
  packages/ui/             the interface parts (buttons, forms, tables, shells, landing sections), themed by the app
  packages/blocks/<name>/  a block's engine: the logic no app has a reason to change
  packages/cli/            new, add, remove, update, upgrade, eject, check, doctor, dev, build, deploy, data, mcp
  registry/blocks/<name>/  block.json, the thin source it copies in, tests/, AGENTS.md, pictures, changes
  registry/starters/<type>/  the blocks and options of an app type, its data model, pages and sample data
  registry/designs/<name>/   colours, type, spacing, shells and page variants
  examples/                one reference app per starter, built from the registry by the tests
  bench/                   the scripted briefs (section 13)
  docs/                    for people and, version by version, for agents
```

- **The core is small and tested.** It holds what must be the same in every app and must be fixable for all of
  them at once: the seams, the access rules, the security defaults.
- **A block is an engine and a surface.** Its engine is a package the app depends on: the logic no app has a reason
  to change (checking a payment webhook, who may use what, how search ranks). Its surface is thin source that
  `kit add` copies into the app, the agent adapts and the maker owns: the pages, their wording, the app's own
  fields. The surface calls the engine.
- **Interface parts are a package too**, themed by the app's own colours, type and spacing and filled through
  their properties and slots, so a better table or a fixed form reaches every app. They use shadcn's names for
  theme values, so parts copied from any shadcn registry sit beside them.
- **Starters are thin.** An app type is a list of blocks with their options, a data model, pages and sample data.
  New types come from new blocks far more than from new starters.

### How an app stays current

The rule for where a thing lives: if a fix to it should reach every app, it is in a package; if it is what makes
this app this app, it is source in the app.

| Part of an app | Where it lives | How the app changes it | How a kit fix reaches it |
|---|---|---|---|
| The seams, access rules, security defaults | The core package | Configuration | A new version |
| A block's engine (payments, sign-in wiring, search, jobs) | The block's package | Settings, events it can listen to, functions it can pass in | A new version, with its migrations |
| Interface parts and landing sections | The interface package | The theme, properties, slots | A new version |
| Pages, wording, emails' text, the app's own fields | Source in the app | Edited freely | A three-way join, rarely needed because it is thin |
| A packaged part the maker wants to differ | Taken into the app with `kit eject` | Edited freely | A three-way join from then on; everything else still updates by version |

- **`kit upgrade`** is the one command: it lists what is new (`kit outdated` only lists), takes the new versions of
  the packages, joins any copied source that changed, runs the database migrations the versions bring and a small
  rewrite program where a version changed how something is called, then runs the app's checks. It works on a
  branch, so the app that is live is untouched until the maker says so.
- **Every release says what it is**, in words for the maker and marked as a fix, a security fix, an improvement or
  a change that needs attention. Security fixes can be taken alone (`kit upgrade --security`).
- **A change that breaks apps is rare and never silent**: it comes with the rewrite program, a major version, and a
  note in the update card. The previous major version keeps getting security fixes for a stated time.
- **The database goes along.** A block's version brings its own migrations; an upgrade backs the database up, runs
  them, and can go back.
- **Customising should not mean leaving the update path.** Before a part is taken into the app, the agent looks
  for a setting, a property, a slot or an event that does the job, and the block's notes list them. What makers
  eject most is a signal to add such a point to the package.
- **In Hydor**, the Run stage shows updates as a card ("3 updates, 1 for security"), tries them on a branch with
  the checks, shows before and after pictures of the pages that changed, and launches when the maker says so. A
  weekly check can run as a scheduled task, and security fixes can be set to apply by themselves when the checks
  pass.

### The stack

Versions and licences were read from the npm registry on 24 November 2026.

| Layer | Choice | Checked | Licence | Why, and the risk |
|---|---|---|---|---|
| Framework | [TanStack Start](https://tanstack.com/blog/tanstack-start-1-0) on Vite, as a Node server | 1.169.7; 1.0 on 13 October 2026 | MIT | Typed routes and server functions turn an agent's mistakes into compile errors. One code base reaches Node, Cloudflare and Vercel. Lovable (May 2026) and Base44 moved to it. It is young: React Router 8.5 is the fallback |
| Interface | React 19, Tailwind 4, [shadcn/ui](https://ui.shadcn.com/docs/changelog) | Tailwind 4.3.5 | MIT | What models know best, and the widest stock of ready parts. The kit's own parts ship as a package on shadcn's theme names |
| Data | [Drizzle](https://github.com/drizzle-team/drizzle-orm/releases) on SQLite | 0.45.4; 1.0.0-rc.6 | Apache-2.0 | One driver per place (a file, D1, Postgres later). 1.0 is not final: the kit pins a version and takes the upgrade once for everyone |
| Accounts | [Better Auth](https://www.better-auth.com/docs/plugins/organization): teams, admin, two-factor, passkeys | 1.7.27 | MIT | Kept up by its own team, which now also keeps Auth.js. Less sign-in code of ours to get wrong |
| Payments | Stripe: Checkout, Billing, the customer portal, [Managed Payments](https://docs.stripe.com/payments/managed-payments) as an option | 23.2.0 | MIT | A hosted checkout keeps card data out of the app |
| Search | FTS5, 4-bit vectors scanned in process, rank fusion: Hydor's own, ported | | MIT | No vector extension to depend on, and it runs on any SQLite and on Postgres |
| Embeddings | ONNX Runtime in a worker | 1.31.1 | MIT | The model is chosen after measuring (Decide next, 2) |
| AI | The AI SDK over OpenAI-compatible and Anthropic endpoints | 7.0.181 | Apache-2.0 | One interface for chat, tools and streaming; inside Hydor its provider is Hydor |
| Mail | React Email, with Nodemailer or a mail service | 6.11; 10.6 | MIT; MIT-0 | |
| Tests | Vitest and Playwright | | MIT; Apache-2.0 | Every block brings its own |

Kept out, and why:

- **For their licences**: ParadeDB's `pg_search` (AGPL-3.0), Typesense's server (GPL-3.0), Vendure (GPLv3), Convex
  (FSL). A licence check runs on every change to the kit.
- **For where they are heading**: Lemon Squeezy (folding into Stripe's Managed Payments), PocketBase (its
  repository was archived on 26 October 2026), and libSQL as the engine (Supabase is acquiring Turso, and Turso's
  own work goes into a rewrite, not libSQL). Turso's cloud can still be a driver for people who use it.
- **`sqlite-vec`** (0.1.9, before 1.0, breaking changes expected): not needed, since vectors are scanned as Hydor
  scans them.

### A block's manifest

A sketch; the exact shapes are settled in Phase 0.

```jsonc
{
  "name": "billing",
  "version": "1.1.0",
  "title": "Payments and subscriptions",
  "summary": "People pay you: plans, trials, one-off purchases, and a page to manage their plan.",
  "when": "The app sells access or things. Not for a store's cart (use store), which builds on this.",
  "needs": { "blocks": ["accounts"], "seams": ["db", "jobs", "mail"],
             "packages": { "@hydor/kit-billing": "1.1.0" },
             "keys": ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] },
  "changes": [{ "version": "1.1.0", "kind": "security", "what": "Refunds are now checked against the order's owner." }],
  "offers": { "pages": ["/pricing", "/settings/billing"], "tables": ["subscriptions", "purchases"],
              "admin": ["Subscriptions"], "events": ["subscription.started", "subscription.ended"] },
  "options": [
    { "id": "model", "ask": "How do people pay?",
      "choices": [{ "id": "subscriptions", "label": "Monthly or yearly plans" },
                  { "id": "one-time", "label": "Once, for a product or lifetime access" },
                  { "id": "credits", "label": "Credits they use up" }] },
    { "id": "seats", "ask": "Does a team pay per member?", "if": "blocks.teams", "choices": ["yes", "no"] },
    { "id": "trialDays", "ask": "A free trial?", "choices": [0, 7, 14, 30], "default": 14 }
  ],
  "places": { "hydor": "test mode", "server": true, "cloudflare": true, "vercel": true },
  "checks": ["tests/checkout.e2e.ts", "tests/webhooks.test.ts", "access"]
}
```

`options` is what makes the guide concrete: the choices a maker sees come from here, so a new block or a new option
shows up in the guide by itself, and the agent does not make the choices up.

### What an app keeps about itself

`kit.json`, in the app's folder and in git, beside a brief in plain words (`docs/brief.md`):

```jsonc
{
  "kit": "1.0.0", "name": "Trailhead", "type": "saas", "stage": "build",
  "blocks": {
    "accounts": { "version": "1.2.0", "options": { "signIn": ["password", "magic-link", "google"] } },
    "teams":    { "version": "1.0.3", "options": { "roles": ["owner", "admin", "member"] } },
    "billing":  { "version": "1.1.0", "options": { "model": "subscriptions", "seats": "yes", "trialDays": 14 } }
  },
  "design": { "theme": "slate-indigo", "type": "inter-lora", "radius": "md", "shell": "sidebar" },
  "environments": {
    "hydor":      { "db": "sqlite", "auth": "hydor", "ai": "hydor", "embed": "hydor", "mail": "outbox" },
    "production": { "place": "ssh:my-server", "db": "sqlite", "auth": "accounts", "ai": "openai-compatible",
                    "embed": "local", "mail": "smtp", "keys": ["STRIPE_SECRET_KEY", "SMTP_URL"] }
  }
}
```

It also records each copied file's hash, which is how an update knows what the maker changed and how we measure
how much of an app came from blocks.

### The commands

- `kit new <type>` and `kit add <block> --option value` are plain programs with no model in them: they copy files,
  join the tables into the schema, add the keys to the list of what the app needs and write the migration. A
  scaffold takes seconds and costs nothing; the agent's work starts where judgement does.
- `kit add resource <name>` is the workhorse: from a table's description it writes the list, the detail page, the
  form, the filters, the server functions, the access rule and the tests.
- `kit update <block>` joins three things: the block's source as it was copied (kept untouched in the app under
  `.kit/base`, so an update needs no network and no history), the source as it is now, and the app's own version.
  What does not join cleanly goes to the agent, which then runs the block's checks.
- `kit upgrade` does the whole of "How an app stays current" for the core and every block at once; `kit outdated`
  lists what it would do.
- `kit eject <part>` takes a packaged part into the app as source, records it like any copied file, and points the
  app's imports at the copy.
- A block's options reach its code through one generated file, not through placeholders inside its files, so the
  copied source stays ordinary code that joins cleanly.
- `kit check` runs the type check, the tests, the access tests and the security list; `kit doctor` says what is
  missing in an environment (a key, a driver, a migration).
- `kit mcp` offers find, add and check to any coding agent, so the kit is usable from Claude Code, Codex or an
  editor with no Hydor at all.

### When a block is done

1. A manifest and notes for agents (what it is for, how to extend it, what not to change).
2. Its own tests, with one flow from start to end through the pages.
3. Access tests that pass (section 5).
4. It runs inside Hydor and on a server, and on Cloudflare if it says so.
5. Each option tried at least once.
6. Pictures for the pickers: light and dark, computer and phone.
7. Words ready to translate, and an accessibility check that passes.
8. No dependency under a licence the kit keeps out.
9. Its engine is in a package with a typed, documented surface, and what an app may change about it is a setting,
   a property, a slot or an event; its copied source is thin.
10. Each release says what changed in words for the maker, marks security fixes, brings its migrations and, for a
    change in how something is called, a rewrite program; and the upgrade is tried on the reference apps, adapted
    ones included, before it is released.

A block short of this is marked experimental, and the guide does not offer it.

### The licence line

- The kit, its blocks and everything they put into an app are MIT. The docs, the README and the kit's own NOTICE
  say in one sentence that **what you make with Hydor is yours**.
- Hydor stays AGPL-3.0. Nothing from Hydor crosses into the kit by copying. What is worth porting (the hybrid
  search, the landing patterns of `how_to_make`) is yours to give under MIT, as a step of its own with a list of
  what was ported. Third-party pieces inside Hydor are checked before any port.
- The kit's repository takes contributions under the same agreement as Hydor's, unless you prefer a lighter one
  (Decide next, 6).
- Each Hydor release carries a copy of the registry, pinned by version and hash, so building works offline.
  Online, Hydor reads the kit's release index and offers newer blocks; it never runs a block whose hash does not
  match the index. The manifests get shipped search vectors, as apps and skills do.

## 5. Safe by construction

Independent scans of apps made with AI builders keep finding the same things: tables anyone can read because no
access rule was written, checks that confirm someone is signed in but not that the row is theirs, and service keys
in the browser's code. The kit's answer is to take those decisions away from generated code.

1. **Access rules live in the data layer.** Every table says who owns its rows (a person, a team, or anyone may
   read). Route code gets a database handle already narrowed to whoever is signed in, with a handful of calls
   (list, get, add, change, remove) and not the whole query builder, because a narrow handle is one that can be
   made airtight: a row that is not yours behaves as if it did not exist. The handle that sees everything is for
   the admin block and for jobs, each use says why, and `kit check` lists them. (Built and tested in Phase 0.)

   ```ts
   export const projects = table('projects', { id: id(), name: text() }, { owner: 'team' });

   export const listProjects = serverFn({ input: z.object({}) }, async (_, ctx) =>
     ctx.db.list(projects));                   // only the signed-in team's rows can come back
   ```

2. **The browser never talks to the database.** Everything goes through server functions that check their input
   with the same schema the form uses.
3. **Access tests write themselves.** For every table and every route, `kit check` makes two accounts and asserts
   that the second can neither read nor change the first one's rows.
4. **Keys stay on the server.** Each key is marked in the app's configuration. A build fails when browser code
   reaches one. Values live in Hydor's vault, go to the host's own secret store at launch, and are never in git.
5. **Payments.** A hosted checkout only, so no card data touches the app. Webhooks are verified and safe to
   receive twice. One function answers "may this person use this", from the plans file.
6. **Defaults.** Security headers, limits on sign-in and forms, uploads checked by kind and size, an audit log,
   and account export and deletion.
7. **A gate at Launch.** A red security check stops a launch unless the maker goes on knowingly, and the card says
   what the risk is.
8. **On your own computer.** A web app's server is a process of its own with its own keys and its own folder,
   never Hydor's data, and under bubblewrap where that exists. Its pages get an origin apart from Hydor's, as
   Preview's do. An app from someone else arrives stopped, with a card that says what it will use.
9. **What stays the maker's.** At Launch the guide says plainly what the kit cannot decide: the terms and privacy
   pages are drafts to read, tax settings are theirs to confirm, and so is what people post.

## 6. The blocks and the twelve app types

### Blocks, by what they are for

| Group | Blocks |
|---|---|
| **Base** (in every app) | Design system and shells, settings, mail, uploads, jobs, admin, audit log, pages search engines read (titles, share pictures, sitemap), legal pages, translations, install on a phone |
| **People** | Accounts, teams and roles, invitations, profiles, notifications, API keys |
| **Money** | Billing (plans, trials, one-off purchases, credits, the customer portal), usage metering, payouts to sellers |
| **Content** | Landing sections (hero, features, proof, pricing, questions, call to action, footer, several variants each), waitlist, blog, docs, changelog, newsletter, forms and surveys |
| **Data and search** | Resources (the scaffolder), search, directory (listings, categories, a map, submissions, moderation, reviews), import and export |
| **AI** | Chat, answers over the app's data with citations, an agent that calls the app's functions, caps and credits |
| **Flows** | The parts an agent app's own pages are made of: a flow's form, the run as it goes, the result and its cards, a question waiting for a person, a conversation with one of the app's agents, the list of runs |
| **Commerce** | Products, cart and orders, digital goods, discount codes; booking (services, availability, time zones, deposits, reminders, a calendar feed); courses (lessons, progress, timed release); memberships |
| **Social and live** | Threads and comments, reactions, follows, a feed, moderation; live channels and presence, chat rooms and direct messages, live boards |

### The twelve types, in four waves

Each wave is ordered so that most of what it adds is reused by the next.

| Wave | App type | Its starter is made of | New blocks it brings |
|---|---|---|---|
| 1 | Landing page and waitlist | Base, landing sections, waitlist | Design system, landing sections, waitlist, mail, legal |
| 1 | Internal tool or admin dashboard | Base, accounts, resources, admin | Accounts, roles, resources, admin, charts, import and export |
| 1 | SaaS: accounts, teams, subscriptions | Landing, accounts, teams, billing, resources | Teams, billing, onboarding, API keys, usage |
| 1 | Agent app with an app of its own (a thirteenth type) | Base, flows, resources | The flows seam and its parts |
| 2 | Content site: blog, docs, newsletter | Landing, blog, docs, newsletter, search | Blog, docs, changelog, newsletter, search |
| 2 | AI app: chat and answers over your data | The SaaS starter, chat, answers, agent | The AI blocks, credits |
| 2 | Portfolio or personal site | Landing, blog, a contact form | Forms; a build with no server |
| 2 | Directory with search | Accounts, directory, search, billing | Directory, filters, a map, moderation, reviews |
| 3 | Online store | Landing, products, cart, orders, admin | The store blocks, digital goods |
| 3 | Booking and scheduling | Accounts, booking, billing, mail | Booking, the calendar feed, reminders |
| 3 | Courses and paid memberships | Accounts, billing, courses, memberships | Courses, gated content |
| 3 | Marketplace: the directory, selling | Directory, store, payouts | Payouts to sellers (Stripe Connect) |
| 4 | Community: forum, profiles, feed | Accounts, profiles, threads, feed, search | The social blocks |
| 4 | Real-time: chat, live boards | Accounts, live, chat, boards | The live seam's drivers, chat, boards |

"Directory or marketplace with search" is one type of the twelve: the directory comes in wave 2 and selling through it
in wave 3, because paying sellers is a piece of work of its own.

### Three blocks worth a closer look

**Search.** Hydor's own design, ported: words through FTS5, meaning through vectors kept at 4 bits a number (384
bytes for 768 dimensions) and scanned in the app's process, the two lists joined by rank. Blocks register what is
searchable (posts, products, listings, lessons, threads), so the site's search box, a directory's filters, the
admin's search and an AI answer all read one index. Embeddings come from a driver: Hydor's worker inside Hydor, a
local model in a worker on a server, an API or Workers AI where there is no room for a model. On Cloudflare the
vectors of a large app go to Vectorize; words stay in D1. A small re-ranker can follow, since ranking is your own
field.

**AI.** One seam with two calls (a model's answer, and an agent that works with tools). Inside Hydor its provider
is Hydor: your plans and local models by tier, your agents and agent apps, within the daily cap on the
app's card. Outside, it is the maker's key. The blocks on top: a chat with history per person, answers over the
app's own data with the passages cited, an agent that calls the app's server functions as tools, and a meter that
turns use into credits the billing block can sell.

**Billing.** Plans live in one file. A command makes Stripe match it, so the maker never clicks through Stripe's
dashboard, and the pricing section reads the same file. Subscriptions, one-off purchases and credits are options of
the one block. Managed Payments, where Stripe is the merchant of record and handles sales tax, is an option the
guide explains at Launch. Inside Hydor the block runs in Stripe's test mode.

## 7. The guide: seven stages

| Stage | What the maker sees and picks | What the agent does | What is kept |
|---|---|---|---|
| **Brief** | One sketch: the app type it matched, who uses it and the few things they do there, which kind of app it is and where it could run. At most three questions, each with likely answers to tap | Matches the description to types and blocks (`kit_find`), assumes the rest and says what it assumed | `docs/brief.md`, a first `kit.json` |
| **Features** | A list in three groups (**In the first version**, **Soon**, **Not now**), each feature with what it means for their users and its choices: how people sign in, how they pay, which roles. The data as a small diagram. What each needs from them later (a Stripe account, a domain, a sender for mail) | Reads the choices from the manifests; suggests what apps of this type usually need; says what each adds in keys and running costs | The blocks and options in `kit.json` |
| **Design** | Two or three directions drawn from the real blocks with their name, words and colours, on a computer and a phone, light and dark; each opens live. Pick one or mix them, then tune colours, type, corners and spacing while watching. Landing sections are picked the same way | Applies themes and shells to the same code, so what is picked is what is built; makes a name and a logo when there is none | `design` in `kit.json`, the theme files |
| **Build** | The app beside the conversation, filling in step by step, with sample data that reads like their business. **View as** switches between a visitor, a member and an admin. Point at a part and say what to change | Scaffolds with the kit's commands, then adapts: the data model, the pages, the words, the emails. The lead decides and reviews; helpers adapt blocks side by side | A commit per accepted step ("Added team invitations"), and **Back to before this** |
| **Check** | One card: tests, access tests, keys in the browser's code, phone layout, accessibility, speed, what search engines see. Each line passes or fails, with **Fix it** | Runs `kit check` and the looking checks; fixes what fails | The results, on the app's page |
| **Launch** | The places as cards, with what each costs and needs and what would not run there. Then the keys still missing, the domain, backups, and a going-live list (Stripe's live mode, the mail sender's DNS, the legal pages read) | Sets up the place, pushes the keys from the vault, deploys, tries the live address, keeps the way back | `production` in `kit.json`, the launch history |
| **Run** | On the app's page: is it up, errors, sign-ups and revenue, backups. A card when blocks or dependencies have updates ("3 updates, 1 for security") | Applies updates on a branch, checks, and deploys when the maker says so; a weekly check can run as a scheduled task | The update and launch history |

How it behaves:

- **A sketch before anything is made**, as the App builder works today: nothing is created until **Build it**.
- **Options come from the kit, not from the model's imagination.** Types, features and their choices, designs and
  places are read from manifests and drawn from real blocks.
- **The stages are a map, not a corridor.** "Just build it" jumps ahead and the agent says what was assumed. Going
  back works too: a new design re-applies the theme, a dropped feature removes its block.
- **Long waits are asked for early.** At Features the guide already says which accounts take time to open (a Stripe
  account, a sender's DNS, a sign-in app at Google), so they are ready by Launch.
- **What it costs is said.** Before Build, what the build should take and cost in model use, from the benchmark;
  at Launch, what the place costs each month.
- **The cheapest worker for each part.** Scaffolding is a program. Adapting a block is a Standard helper with the
  block's notes. Mechanical edits are Quick. The lead thinks with Best.
- **Any session can pick it up.** The brief, `kit.json` and git say where the app stands and what was decided.

## 8. Inside Hydor

### Keeping a web app running

- **A host for apps** in the server: it builds an app, starts it when someone opens it, stops it after a while with
  no visitors (as the embedding worker does), restarts it when it falls over, and keeps its last log lines. Each
  app gets a limit on memory and a low priority, so the computer stays usable.
- **Three ways in, the best that works**: a hostname of its own (`<app>.localhost` on this computer, or a wildcard
  address you set up), else a port of its own, else a path with a token inside a sandbox for a tunnel with a single
  hostname. In all three the app's pages cannot reach Hydor's own. Phase 0 settles the details on the Preview code.
- **Signing in**: Hydor tells the app who is there (you, someone you shared it with, a guest of a link), signed
  with a secret only that app has. The app needs no passwords of its own.
- **What it may use**: a card when the app is made or installed, as for agent apps: which models and up to how much
  a day, which agent apps, which connected accounts (none unless asked for), and whether it may notify you.

### The app's page

A web app is a project of its own kind, so its sessions, files and memory stay together. Its page has:

- **Overview**: the seven stages with where it stands, what was decided, and the next step.
- **Preview**: the live app, as a computer or a phone, with **View as**.
- **Features**: the blocks it has, with their options, and the ones it could have.
- **Design**: the theme and the picked variants.
- **Data**: its tables to look through, the sample data, an export.
- **Checks**: the last results, and **Run the checks**.
- **Launch**: its places, keys by name, the domain, history, logs and backups.
- **Settings**: its name, who may use it inside Hydor, what it may use.

A button on each asks the agent, as **Ask the agent** does elsewhere.

### What agents get

- `kit_find`: blocks, starters and designs by words and meaning, with their manifests.
- `app_sketch` grows `kind: "web"`: the brief as a card.
- `webapp_get`: where an app stands (its `kit.json`, stage, checks, places, what changed outside).
- `webapp_choose`: puts real options to the maker as a card (features, designs, places); the answer lands in
  `kit.json`.
- `webapp_run`: starts or stops it in Hydor, shows it beside the conversation, takes pictures as a given account.
- `webapp_check`: runs the checks and fills the card.
- `webapp_launch`: deploys after the maker's yes on a card, with keys from the vault by name; status, logs, the way
  back.

The kit's own commands run in the project's shell like any others. The method is a bundled skill,
`web-app-builder`, with a reference for each stage, beside new skills for accounts, payments and launching.

### Where the code goes

- Hydor: `shared/webapps.ts`, `server/webapps/` (the store, the host, the ways in, the kit's copy and its search,
  the tools, the checks, launching), `web/src/features/webapps/`, `skills/web-app-builder/`, and the App builder in
  `server/assistants/builtins.ts`. Routes under `/api/webapps`.
- Every phase carries this repository's docs work: a guide topic in all eight languages with its pictures,
  `features.md` and the README, the search catalog and vectors, the dictionaries, the routes in the API topic, what
  agents are told, and the release notes. Plan on a quarter of each phase for it.
- The kit has its own repository, tests and notes for agents.

## 9. Launching: places and what runs where

| Place | How it gets there | Database | To know |
|---|---|---|---|
| **Inside Hydor** | It is already there | A SQLite file | Private. Reaches your phone the way Hydor does |
| **Your own server** | Over SSH: Docker, a compose file with the app and Caddy for HTTPS, a volume for the data | A SQLite file on the volume | No registry needed: the image is built there or sent over. A few seconds of downtime at each deploy |
| **Render, Railway, Fly.io** | The platform's own file (`render.yaml`, `fly.toml`, Railway's), written by the kit and deployed with your token | A SQLite file on the platform's disk | A disk means one instance, and on Render no deploys without downtime |
| **Cloudflare** | Workers, through TanStack Start's own build | D1; R2 for files | No local model, no image work in the Worker; live updates need Durable Objects |
| **Vercel** | Functions | Postgres (Neon, Supabase) | Arrives with the Postgres dialect. No live updates |
| **A static host** | For an app with no server parts (a portfolio, a landing page without a waitlist) | None | `publish_site` inside Hydor does the same |

- **Hosts** are new in Hydor: a server by name, how to reach it and what was checked on it. They are not the
  machines of `docs/machines.md`, which are other Hydor servers. The first connection shows the host's key for you
  to confirm.
- **Backups** are part of a launch, not an extra: SQLite's online backup on a schedule, to S3-compatible storage or
  pulled home to your Hydor. **Restore** is tried once before a launch counts as done.
- **Every deploy asks first.** It is outward-facing and hard to undo, so each one is a card you confirm, and the
  one before is kept to go back to.
- **Postgres is the way up.** One SQLite file means one instance. When an app outgrows it, `kit data move` copies
  it to Postgres and the same blocks run on the second dialect (words through `tsvector`, vectors through pgvector
  or the same scan).

## 10. Roadmap

No calendar. A phase ends when its "done when" holds, and nothing is cut to make a date. The earlier
Apps plan was sized at fourteen weeks and its first three phases were built in a day, so sizes here are relative
(Phase 0 is 1). Typing is not what takes the time: trying things against real services (Stripe, mail, hosts), your
look at designs and flows, and the benchmark runs are.

**The order.** Phases 0 to 3 are the spine, each needing the one before. After Phase 3, Phases 4 to 7 are tracks
that can run side by side in sessions of their own; the numbers are the order I would take them in one at a time.

| Phase | What ships | Size | Needs |
|---|---|---|---|
| 0 · Prove the base | A skeleton that runs in both places; the formats | 1 | |
| 1 · The core, first blocks, web apps in Hydor | A landing page and an internal tool, inside Hydor | 3 | 0 |
| 2 · The guide | Seven stages, from a paragraph to an app without touching code | 3 | 1 |
| 3 · Launch on servers, and SaaS | Billing; Docker over SSH; Render, Railway, Fly.io; Run | 3 | 2 |
| 4 · Content, search and AI | Wave 2: content site, AI app, portfolio, directory | 4 | 3 |
| 5 · Serverless and Postgres | Cloudflare, Vercel, the second dialect | 3 | 3; search from 4 for its Postgres side |
| 6 · Commerce | Wave 3: store, booking, courses, marketplace | 4 | 3; the directory from 4 |
| 7 · Community and live | Wave 4: community, chat, live boards | 3 | 3; search from 4 |
| 8 · Portable flows and sharing | Agent-app steps outside Hydor; a catalog others add to | 3 | 4 |

### Phase 0: prove the base

| | Task | Who | After | Size |
|---|---|---|---|---|
| 0.1 | Reserve the names: the repository, the npm scope, an address for the docs | You | | small |
| 0.2 | Put keys for trying things in the vault: Stripe in test mode, a small server reachable over SSH, Cloudflare, Render | You | | small, but a wait |
| 0.3 | A skeleton on TanStack Start: a page, accounts, one owned table, a server function, a test | Lead session | 0.1 | medium |
| 0.4 | The seams as interfaces, with the drivers the skeleton needs for Hydor and for a server | Lead session | 0.3 | medium |
| 0.5 | The host for apps, as a trial: the skeleton kept running in Hydor, opened the three ways, signed in from Hydor | Lead session | 0.3 | medium |
| 0.6 | The same skeleton in Docker on the server, with HTTPS | Lead session | 0.2, 0.3 | small |
| 0.7 | One table description, both dialects: the skeleton's tests on SQLite and on an embedded Postgres | Lead session | 0.3 | medium |
| 0.8 | The skeleton on Cloudflare's runtime with D1 | Lead session | 0.4 | medium |
| 0.9 | The formats, written down with schemas and tests: `block.json`, the starter's file, `kit.json` | Lead session | 0.4 | medium |
| 0.10 | One block (the waitlist) added, adapted, then updated through a three-way join | Lead session | 0.9 | medium |
| 0.11 | Measure embeddings: Hydor's model under ONNX Runtime in Node on a 1 GB server (memory, speed), against two smaller models on a retrieval set | Lead session | 0.3 | small |
| 0.12 | Can a cheaper agent build on it: a Standard helper with only the kit's notes adds a resource to the skeleton, five times (success, time, cost) | Lead session | 0.9 | small |
| 0.13 | Decide: the framework stays or falls back; the SQLite driver; the embedding model; the ways in | You | all | small |
| 0.14 | Prove an update end to end: the waitlist as an engine package and thin source, in an app that adapted the source and ejected one part; a new kit version with a fix in the engine, a migration and a change to the source reaches it through `kit upgrade` with the checks green | Lead session | 0.10 | medium |

**Done when** the skeleton runs inside Hydor and on a server from the same code with only configuration between
them, a Standard helper adds a resource from the notes alone at least four times in five, the formats have tests,
and an adapted app takes a new version of the kit through `kit upgrade` with nothing merged by hand.

### What Phase 0 found (24 November 2026)

Phase 0 is done but for one task. The kit is a repository of its own: a core, the three formats, the commands, the
first block, a skeleton app, and three benchmarks, with 818 tests. The Hydor side is a branch, `webapps-host-trial`, not merged.

| Task | Result |
|---|---|
| 0.3, 0.4 · Skeleton and seams | The same build runs with accounts of its own or with Hydor's sign-in. Nine seams. Route code gets a narrow handle (list, get, add, change, remove, and writes that happen together); a second person can never see or change the first one's rows, tested on every database |
| 0.5 · Kept running inside Hydor | Works: started on first use, stopped when idle, back after a crash with its data, two people kept apart through the proxy, nothing of Hydor's reaching the app, writable only in its own folder under bubblewrap |
| 0.6 · Docker on a server | The image builds and runs as a user without rights, its data in a volume. **Open:** a real server with HTTPS (none was at hand) |
| 0.7 · SQLite and Postgres | One table description serves both; the skeleton's files are the same on each; the same end-to-end run passes on SQLite, an embedded Postgres and Postgres 17 |
| 0.8 · Cloudflare | The same source builds for Cloudflare's runtime and runs on D1 locally, with accounts and with Hydor's header. Not tried on Cloudflare itself |
| 0.9 · Formats | `block.json`, `starter.json`, `kit.json` and a registry index, each with a check that explains every problem in plain words |
| 0.10, 0.14 · A block, and an update | The waitlist as an engine package and a thin surface. An app that reworded it, rearranged its page and ejected its form took a new kit version (an engine fix, a security fix, a table change, source changes) through `kit upgrade` with nothing merged by hand: of 11 copied files, 7 untouched, 3 joined by themselves, 1 taken; 4 engine files by one version number. An edit on the very line the block changed left one file for an agent |
| 0.11 · Embeddings | Hydor's model is the best (mean nDCG@10 79.0 over eight sets) and does not fit a 1 GB server in practice (822 to 976 MB, 84 ms a query). multilingual-e5-small is 3.4 points lower on average (about 9 on the two English sets, level on Japanese, ahead on Greek), in 467 MB and 4 ms a query |
| 0.12 · A cheaper agent | A Standard agent with only the kit's notes added a resource to the skeleton: 4 of 5 runs kept every rule at first, 5 of 5 once the kit had an ordering option of its own and a checklist. About two minutes and 80,000 tokens a run |

**Decided from it (0.13).**

- **The framework stays.** TanStack Start held up on Node and on Cloudflare; typed routes and the split between
  server and browser code worked as documented. Node hosting goes through Nitro, whose current release is a
  release candidate: pinned, and watched.
- **better-sqlite3 for now.** It has to be compiled when an image is built. Node's own SQLite takes over when
  Drizzle's stable release has a driver for it.
- **Two embedding models, picked by the memory there is**: multilingual-e5-small under 2 GB, Hydor's model above
  it and inside Hydor. An index is tied to the model that made it, so a change of model means embedding again.
- **Two ways in, not three.** A hostname of its own for each app is the safe one and the default. A path with a
  token works for a tunnel with a single hostname, for apps built with a base-path marker the proxy rewrites. A
  port of its own is dropped: cookies are shared across ports on one host.
- **A build is one dialect and one kind of place.** The kit's Vite plugin gives a build only the drivers it can
  run, and refuses a mix in a sentence.
- **Base copies travel with the app** (`.kit/base`), so an update needs no network and no history, and a block's
  options reach its code through one generated file, with no placeholders inside copied files.

**What it changes in Phase 1.**

- **A block becomes one npm package** carrying its engine, its manifest, its copied source and its parts, so the
  package registry keeps every version and nothing else has to.
- **The kit ships JavaScript.** Its packages are TypeScript source today, which Node will not load from an
  installed package; the update proof gets past that with a loader.
- **More of a block in its package.** The waitlist keeps 59% of its lines in the package against the two thirds
  aimed for; its admin page becomes a packaged part. Wording lives in a file of its own per block, since it is
  what makers change most and what conflicts most.
- **Checks for the two ways an update goes wrong quietly**: installed packages that differ from what the app
  names, and an ejected copy that joined cleanly while the engine under it moved.
- **Small things blocks asked the core for**: a count, an equals that ignores case, "may this person manage this
  table", the environment's values passed to blocks.
- **Hydor's API for runs** needs, for the flows seam: listing an app's runs, answering a waiting question and
  stopping a run by key, the waiting question in what a run returns, which flow to start, which person a run acts
  for, and a documented answer.
- **Running apps safely on every computer.** Under bubblewrap an app cannot read Hydor's files; without it (a Mac,
  Windows) it could, so those need an answer of their own before apps from other people run there. Also: a cap on
  an app's memory, and a sweep at start for apps left behind by a crash.
- **Cloudflare's free plan and sign-in.** Hashing a password took 80 to 115 ms here; if a free Worker gets 10 ms
  of processor time a request, as its docs are read, sign-in there needs the paid plan or another hasher, and the
  Launch stage says so.

### Phase 1: the core, the first blocks, web apps in Hydor

Two tracks that meet at the end.

- **The kit**: the core (seams and drivers for Hydor and servers, access rules and the tests they write, security
  defaults, migrations, jobs, mail, files); the commands (`new`, `add`, `remove`, `update`, `check`, `doctor`,
  `dev`, `build`); the blocks of the base, accounts, roles, admin, resources, landing sections and waitlist; the
  starters for a landing page and an internal tool; the reference apps as tests, on Node and on Cloudflare's
  runtime.
- **Hydor**: the store and routes for web apps, the host for apps, the project kind, apps with pages of their own on the Apps page,
  the app's page with **Overview**, **Preview**, **Features** and **Data**, the kit's copy in the release with
  `kit_find` and its vectors, the card for what an app may use.
- **Done when** an agent with the kit's commands and notes makes a landing page with a waitlist and a small
  customer list from a description, both are used inside Hydor from a phone, and their access tests pass.

### What Phase 1 found (24 November 2026)

Phase 1 is done: its test passed in all three parts. Two agents who had never seen the kit each made an app from a
description with only the kit's command and the app's own notes (a landing page with a waitlist for a tide-times
service; a bike shop's customers and repair jobs with three numbers on its home page); the tool's access checks
passed (94 of them); and both were registered, built, started and used inside Hydor on a phone-sized screen. The
Hydor side is still a branch, not merged.

| Built | What it is now |
|---|---|
| The core | Nine seams; drivers for SQLite, D1 and Postgres; conditions, ordering, sums and writes that happen together with no Drizzle in app code; security defaults; jobs, files and a mail outbox; access checks that write themselves; a build that fails on a key in browser code |
| The interface package | Four themes and `defineTheme`; the parts, with charts, pickers and a file upload; five shells; landing sections in variants; fonts loaded from the package; the parts' words in eight languages |
| Blocks | Waitlist, accounts, admin, landing: each keeps 69 to 73% of its lines in its package |
| Resources | `kit add resource` writes a list's table, rules, pages and tests; the pages are a few lines over parts of the interface package, so 93% of the code doing the work is in packages and a further list adds about 110 lines to an app |
| Releasing | The kit ships JavaScript; a block is one package; a release is a store of tarballs with an index, every version kept |
| Starters | Landing and internal tool, from one command each, both also running on Cloudflare's runtime locally |
| Hydor | A store and routes for web apps; a host that starts, idles, restarts and sandboxes them; two ways in; the kit's store read and its commands run as jobs; six tools for agents; the Apps page and an app's page with Overview, Preview, Features and Data |

**What the builders tripped over, and what changed.** A name that came out as a slug in mails; notes that described
the bare template; a second migration nobody needed; themes nobody had described, none of them calm and coastal
(`kit new --brand` now makes one from a colour); an invited colleague who saw nothing until made an admin (an app is
now one team unless it says otherwise); sums done in JavaScript (the data layer now has them); a starter's example
data to remove by hand. A second proof now rebuilds both apps from scratch with none of those fixes needed.

**What using them inside Hydor showed.** An app was not told its own address; a browser could pass its own
forwarded address through to an app; both fixed. A landing page cannot collect sign-ups from the public while it
lives inside Hydor, since a visitor without a session is refused: that is the rule chosen, and it makes Launch what
a landing page needs.

### Phase 2: the guide

- The App builder covers both halves; the `web-app-builder` skill with a reference for each stage; the sketch with a
  kind; the features card, the designs card and **View as**; the stages on the app's page; a commit per step and
  **Back to before this**; pointing at a part of the page; helpers by tier.
- Designs drawn from the real blocks: themes, shells and section variants, pictured for the cards.
- The Check stage whole: tests, access, keys in the browser's code, phone layout, accessibility, speed.
- The benchmark's first briefs, for the wave 1 types.
- The ready-made **Build a small web app** gives way to the guide.
- **Agent apps on the kit**: the flows seam with Hydor's engine behind it, the parts made for runs, the app's
  functions offered to its agents as tools acting for the person who started the run, the recipe in the app's
  folder, **Give it an app of its own** on an agent app and **Add flows** on a web app, and the starter for an
  agent app with pages of its own. Agent apps without a web half are untouched.
- **Done when** someone who does not code gets from a paragraph to a working app inside Hydor through the stages,
  picking the type, the features and one of three designs, and at least eight of ten scripted briefs for wave 1 end
  with every check green and no hand on the code; and one of today's ready-made agent apps (the Trip planner) gets
  an app of its own, where a trip is started from its own page, followed as the agents work, kept in its own
  list, and still run for you by an agent in a session.

### What Phase 2 found (24 November 2026)

Phase 2 is built, and two of its three tests are met as far as they can be without the feature on a real Hydor.
The Hydor side is still a branch, not merged, and its pages are in English only.

| Test | Result |
|---|---|
| Scripted briefs end with every check green and no hand on the code | 9 of 12 on the first run, each built by an agent that had only the brief, the kit's commands and the app's notes. The three that failed were rebuilt after the kit's fixes and pass. The whole set has not been run again since |
| The Trip planner gets an app of its own | Met with the real kit: started from its own page, refused in a sentence when a question is left empty, followed live, kept as a row only its person sees, found again by the agent through the app's own function, and still run from a session, whose card opens the row |
| Someone who does not code goes from a paragraph to a working app through the stages | Not shown. The stages, the cards and the tools exist and are tested with made-up replies; no real agent has led a person through them, which needs the feature on a running Hydor |

| Built | What it is now |
|---|---|
| The guide | Brief, Features, Design, Build and Check on the app's page; a sketch with a kind; cards for features, for three designs pictured from the real blocks, and for one of a few; a commit per step and **Back to before this**; pointing at a part of the page in Preview; the `web-app-builder` skill with a reference per stage |
| Designs and checks in the kit | `kit designs` pictures three directions for a brief from the themes, shells and section variants; **View as** another person or role; `kit check --full` runs the tests, the access checks, the search for keys in browser code, phone layout, accessibility and speed |
| Agent apps on the kit | The flows seam with Hydor's engine behind it; parts for starting, following and listing runs; the flows block and the agent-app starter; a run acts for the person signed in, checked by Hydor; the app's functions as its agents' tools, each switched on by the owner, one that changes things asking on a card |
| In Hydor's pages | **Give it an app of its own** on an agent app or a ready-made one, as one job that leaves nothing behind if a step fails; **Add agents' work** on a web app; a **Flows** tab with the flows, the runs, the functions and what was spent today |
| The benchmark | Twelve briefs with a judge that uses each app as two people over HTTP and in a browser, and a test of the judge itself |

**What the briefs showed.** A form the public fills in had no home (the kit now has public forms); a list name with
an underscore got an address the notes did not say; the builders reached for the database underneath where the
data layer lacked a condition; one builder left servers running. Each became a fix in the kit or a line in its
notes.

**What giving the Trip planner an app showed.** A run started in a session did not act for anyone, so it kept no
row; Hydor now tells the app when a run ends. An app's tools were cut at 80, which dropped its own functions. A
kept trip shows its tables and its formatted text raw: the kit's pages need a way to draw both.

**Not done in this phase.** The ready-made **Build a small web app** still stands, until the guide has been used
for real. Helpers by tier are in the skill's words only, not measured. The briefs cover the kit and a builder,
not the guide's cards.

### Phase 3: launch on servers, and SaaS

- Blocks: teams, billing (subscriptions, one-off purchases, the portal, the plans file and its sync, Managed
  Payments as an option), onboarding, API keys, usage. The SaaS starter.
- Launch: hosts, the Docker and compose files with HTTPS, backups and restore, keys pushed from the vault, the
  domain, the going-live list, trying the live address, the way back; the files for Render, Railway and Fly.io.
- Run: is it up, errors and logs, backups, the updates card for blocks and dependencies, the weekly check.
- Skills for accounts, payments and launching.
- **Done when** a SaaS with teams and subscriptions goes from a brief to its own domain on a small server, a
  purchase in Stripe's test mode works end to end (sign up, subscribe, change the plan, cancel), it comes back from
  its backup, and it takes a block's update through the card.

### Phase 4: content, search and AI

- Blocks: search (with the embedding drivers), blog, docs, changelog, newsletter, forms, the AI blocks with caps
  and credits, directory, translations, the MCP block.
- Starters: content site, AI app, portfolio, directory. A build with no server for sites that need none.
- Inside Hydor: a web app calls an agent app; sessions use a web app.
- **Done when** a docs site with a blog and search, an app that answers from the maker's documents (inside Hydor
  on Hydor's models, outside on the maker's key, from the same code) and a directory with filtered search are each
  built through the guide and launched.

### Phase 5: serverless and Postgres

- Cloudflare: the D1, R2, cron and Workers AI drivers, launching, and Vectorize for large indexes.
- The Postgres dialect: the driver, search on it, `kit data move`. Then Vercel on it.
- `kit check --target` and the guide's place cards say what fits where.
- **Done when** the SaaS and the content site run on Cloudflare and on Vercel from the code that runs on a server,
  the check refuses what cannot run there with a plain reason, and the SaaS moves from SQLite to Postgres with its
  data and every check green.

### Phase 6: commerce

- Blocks: products, cart and orders, digital goods, discount codes; booking; courses and memberships; payouts to
  sellers. A second payment provider behind the billing interface (Decide next, 5).
- Starters: store, booking, courses and memberships, marketplace.
- **Done when** each is launched through the guide with a real test purchase, and a seller's account in the
  marketplace is paid out in test mode.

### Phase 7: community and live

- The live seam's drivers (in the app's process; Durable Objects on Cloudflare); profiles, threads, comments,
  reactions, follows, a feed, notifications, moderation; chat rooms and direct messages; live boards; notifications
  on a phone.
- Starters: community, real-time.
- **Done when** a community with live chat and a live board runs on a server and on Cloudflare, and on Vercel the
  guide says plainly that it cannot hold connections open and offers checking for news at intervals instead.

### Phase 8: portable flows and sharing

- A runtime for agent-app steps on the AI seam (a model, a tool, a decision, a repeat, data, code): the flows
  seam's second driver, so an agent app with an app of its own can be launched outside Hydor. A step that needs one
  of Hydor's agents (a Claude Code or Codex session) stays inside Hydor and is marked so.
- Web apps as files between Hydor servers, with the card for what they use. A catalog of blocks, starters and
  designs that others add to, reviewed and pinned by hash. A gallery on hydor.app.
- **Done when** an agent app with steps becomes a web app that runs without Hydor, and a block made by someone else
  is installed through its card.

### Start first

These take waiting, not work, so they start now: the names (0.1); the test accounts (0.2); a sender's domain for
mail with its DNS records; sign-in apps at Google and GitHub for trying social sign-in; and Stripe's approval for
paying sellers, which Phase 6 needs and which can take a while.

## 11. Decide next

| | Decision | By | What I would do |
|---|---|---|---|
| 1 | The kit's public name, repository and npm scope | Phase 0 | "Hydor Kit", in a repository beside Hydor's |
| 2 | The embedding model outside Hydor: Hydor's own (310 MB on disk, about 1 GB loaded) or a smaller one | Decided in Phase 0 | multilingual-e5-small under 2 GB of memory, Hydor's model above it and inside Hydor (measured: `bench/embeddings` in the kit) |
| 3 | May a web app inside Hydor be opened to anyone on the internet from your own computer, as an agent app's public page is | Phase 3 | No: share it with people you invite; anyone means Launch |
| 4 | The SQLite driver on servers: Node's own (no native module, still marked experimental in Node 22) or better-sqlite3 (which Hydor uses) | Decided in Phase 0 | better-sqlite3 now, Node's own when Drizzle's stable release has a driver for it |
| 5 | The second payment provider: Polar, Paddle, or Stripe's Managed Payments alone | Phase 6 | Managed Payments alone, unless makers ask for another |
| 6 | Contributions to the kit: Hydor's agreement or a lighter sign-off | When the repository opens | Hydor's, so the kit can always be offered on other terms |
| 7 | What a web app inside Hydor may spend on models a day unless you say otherwise | Phase 1 | \$1, raised on its card |
| 8 | Whether the benchmark of scripted briefs is published | Phase 2 | Yes: it is the kit's best argument, and it invites others to beat it |
| 9 | The cards an answer is made of (Hydor's 140 answer UIs, AGPL-3.0) inside an agent app's own pages: give them to the kit under MIT, or have Hydor draw them in a frame | Phase 2 | Give the kit the ones results use most, as a step of its own; inside Hydor a frame covers the rest |

## 12. Risks

| Risk | How to keep it small |
|---|---|
| Twelve types on four kinds of place, twice (in and out of Hydor): more combinations than anyone can try by hand | Blocks say where they run; the reference apps are the tests, built every night; a type counts only when its briefs pass |
| A young stack: TanStack Start reached 1.0 in October 2026, Drizzle 1.0 is not final | The kit pins versions and takes each upgrade once, for every app; Phase 0 decides with a fallback named |
| Models know the new framework less well than older ones | Notes for agents in every block, tied to the version; typed routes, so mistakes show at once; the Standard-helper test repeated each phase |
| A generated app leaks data or keys | Section 5: access in the data layer, tests the kit writes, a build that fails on a key in browser code, a gate at Launch |
| Money and the law: tax, privacy, what makers promise their users | A hosted checkout only; Managed Payments explained; legal pages as drafts; what stays the maker's said at Launch |
| A generated server running on your computer | Its own process, keys and folder, bubblewrap where it exists, an origin apart from Hydor's, stopped when idle, a card for what it uses |
| Two ways to give an agent app a face (the view Hydor draws, and pages on the kit) confuse makers and split the work | One ladder with a plain rule in the guide; the view stays for cards in a session and small apps, and is not grown further; the kit's parts for runs draw the same answer fields, so a result looks the same in both |
| An agent acting inside an app reaches data it should not | Its tools are the app's own functions, called as the person who started the run, through the same narrowed handle as a click; a run with no person behind it (a schedule) names one, or has only what the app marks for it |
| It works in Hydor and not outside | The check lists what an app takes from Hydor and its stand-in; **Only inside Hydor** is said when a feature is added, not at Launch |
| Apps drift from their blocks, and updates stop joining | Engines and interface parts are packages, updated by version with nothing to join; copied source is thin; an ejected part is the exception, counted, and a reason to add a setting or a slot; every release is tried on adapted reference apps first |
| Packages that are hard to bend push agents to eject everything | Settings, properties, slots and events listed in each block's notes; what gets ejected is measured on the benchmark |
| Fifty blocks to keep up | Upstream plugins before code of our own (Better Auth's, Stripe's); nightly builds; experimental blocks stay out of the guide |
| AGPL code reaching the MIT kit | Ports are a step of their own, listed, and only of what is yours to give; the licence check on every change |
| A build costs too much in model use | Scaffolding is a program; helpers on cheaper tiers; cost per build is a number the benchmark reports |
| The docs work, in eight languages | A quarter of each phase, done at its end in one go |

## 13. How we will know it works

**The benchmark**: three scripted briefs for each app type (thirty-six), each with a maker's answers written out
and the flows the finished app must pass. It runs on every release of the kit and of the builder, by tier, and
reports four numbers: how many end with every check green and no hand on the code, the time, the model cost, and
the share of the app's lines that came from blocks. Targets to argue with:

- From a paragraph to a running wave 1 app inside Hydor in under twenty minutes.
- At least eight in ten briefs of a type green before that type counts as done.
- At least seven in ten of a new app's lines from blocks and the starter, unchanged or lightly adapted.
- No access test failing and no server key in browser code in any app that passes Launch.
- A new version of the kit reaches a benchmark app through `kit upgrade`, checks green, with no hand and no agent
  in nine apps of ten, and with the agent in ninety-nine of a hundred. The benchmark keeps each app as it was built
  on the previous version to measure this.
- At least two thirds of the code a block brings stays in its package, measured per block.
- Every benchmark app passes its checks inside Hydor and on a server from the same code, and on Cloudflare where
  its blocks say they run there.
- From pressing Launch to a live address with HTTPS on a fresh server in under fifteen minutes.

## 14. Not in this plan

- Native phone apps, and a hosting service of ours.
- Other stacks (Next.js, Python).
- Bringing in apps made with other builders.
- A drag-and-drop editor for a web app's pages: they change by conversation, picks and the theme. The Pages editor
  stays for pages.
- Running one app on many servers at once: one SQLite file is one instance, and Postgres is the way up.
- A store's logistics (carriers, warehouses).

## Checked on the web, 24 November 2026

- TanStack Start 1.0 on 13 October 2026: [its announcement](https://tanstack.com/blog/tanstack-start-1-0). Lovable's
  new apps use it since 13 May 2026: [Lovable's changelog](https://docs.lovable.dev/changelog). Base44's too:
  [Base44's changelog](https://docs.base44.com/changelog/developers).
- What scans of AI-built apps found: [no access rules in 89% of 50 apps](https://dev.to/tgoldi/is-lovable-actually-secure-i-checked-the-supabase-rls-on-50-apps-38o2)
  (one person's scan); [the Cloud Security Alliance's note](https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-codegen-vulnerability-debt-20260406-csa/)
  on CVE-2025-48757.
- Better Auth: [teams](https://www.better-auth.com/docs/plugins/organization), [Stripe](https://www.better-auth.com/docs/plugins/stripe),
  and [Auth.js joining it](https://better-auth.com/blog/authjs-joins-better-auth).
- Drizzle 1.0 still a release candidate: [its releases](https://github.com/drizzle-team/drizzle-orm/releases).
- shadcn/ui's registries and Base UI as the default: [its changelog](https://ui.shadcn.com/docs/changelog).
- Stripe as merchant of record: [Managed Payments](https://docs.stripe.com/payments/managed-payments). Lemon
  Squeezy folding into it: [its 2026 update](https://www.lemonsqueezy.com/blog/2026-update).
- Supabase acquiring Turso: [Supabase](https://supabase.com/blog/supabase-is-acquiring-turso) and
  [Turso](https://turso.tech/blog/turso-is-joining-supabase); libSQL no longer where Turso's work goes:
  [Turso's docs](https://docs.turso.tech/libsql).
- `sqlite-vec` before 1.0: [its repository](https://github.com/asg017/sqlite-vec). FTS5 on D1:
  [Cloudflare's docs](https://developers.cloudflare.com/d1/sql-api/sql-statements/). FTS5 in Node's own SQLite: tried
  here on Node 22.23.
- Embedded Postgres takes one connection, so it is for tests: [PGlite's docs](https://pglite.dev/docs/).
- Licences kept out: [ParadeDB](https://www.paradedb.com/docs/operate/deploy/enterprise),
  [Typesense](https://github.com/typesense/typesense). PocketBase archived:
  [its repository](https://github.com/pocketbase/pocketbase).
- Disks: [Render](https://render.com/docs/disks), [Railway](https://docs.railway.com/volumes),
  [Fly.io](https://docs.fly.io/volumes/overview); none that lasts on
  [Cloudflare's containers](https://developers.cloudflare.com/containers/faq/).
- Not confirmed on a page of its owner: that Vercel has no disk that lasts (widely known), and the dates reported
  for Lemon Squeezy's closing.
