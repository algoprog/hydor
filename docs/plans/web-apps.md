# Web apps: whole products on a kit, inside Hydor or anywhere

*A proposal, 24 November 2026, written from your answers to fifteen questions the same day. Nothing here is built yet;
it is meant to be argued with. It follows [Apps: a plan for building apps on top of agents](apps-framework.md), which
is built: agent apps stay as that plan made them.*

## In short

- **Apps get a second kind.** *Agent apps* stay what they are: small tools for one job, run by Hydor's agents. *Web
  apps* are whole products: code projects with their own pages, accounts, database, payments and search.
- **One kit, two places to run.** The same code runs inside Hydor (which keeps it running, signs you in and lends it
  its models, agents and embedding model) or standalone (a server, a one-click platform, serverless), with accounts
  and keys of its own. What differs sits behind eight seams, set by configuration and never by changing the app.
- **Hydor Kit** (MIT, a public repository of its own) is a small core package, **blocks** copied into the app as
  source (accounts, teams, billing, search, admin, landing sections, blog, store, booking…), **starters** (one per
  app type), **designs**, and **checks** that travel with each block. Every block says in a manifest what it needs,
  what it offers and which choices to put to the maker.
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

## What you decided

| Question | Your answer | Where it lands |
|---|---|---|
| How apps inside Hydor and standalone apps relate | One kit, two places to run; agent apps stay and plug in | Sections 2 and 3 |
| The base stack | React and Vite on one plain Node server | TanStack Start, with a fallback (section 4) |
| How prebuilt material reaches an app | Source blocks on a small tested core package | Section 4 |
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
3. **One App builder for both kinds.** It says which kind fits and why, and the maker can overrule it.
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

## 2. Two kinds of app, one front door

| | Agent app | Web app |
|---|---|---|
| What it is | A small tool for one job: a form, steps, an answer, a view | A product: pages, accounts, data, payments |
| Made of | A recipe the builder and agents edit | Code in a project folder, on the kit, in git |
| Who works when it runs | Hydor's agents and models | Its own server; models only where it uses AI |
| Its data | Records | A database of its own |
| Its users | You, people with its key, visitors of its public page | Accounts of its own (Hydor's sign-in inside Hydor) |
| Where it runs | Inside Hydor | Inside Hydor, or anywhere |
| What a use costs | Model use, every run | Hosting; model use only for AI features |

**The front door.** **New app** on the Apps page keeps its menu and gains one entry: **Describe it to an agent**,
**Start from a type** (the twelve types as cards, each with a picture and what it comes with), **Start from
scratch** and **Install from a file**. The App builder's first reply is one sketch, as today, and the sketch now
names the kind. Its rule of thumb: one job an agent does for you is an agent app; something people sign in to, come
back to, pay for or find on the web is a web app. It says why, and **Make it the other kind** is on the sketch.

**How the two connect.**

- A web app inside Hydor **calls an agent app** as a function (a trip planner behind a travel site's back office),
  through the AI seam and within the app's daily cap.
- Agents in sessions **use a web app** as they use agent apps: they open it, or call the actions it offers (an MCP
  block, Phase 4).
- **Make it a web app**, on an agent app, comes with the portable runtime (Phase 8): its form and view become
  pages, its records tables, its flow runs through Hydor or standalone.
- The ready-made **Build a small web app** is retired once the guide covers it (Phase 2): the guide does the same
  job with a kit under it.

**Names.** The Apps page gains **Web apps** among its places, and on a phone a tab beside **Agent apps** and
**Connected apps**. The Preview page lists the dev servers it finds under "Web apps" today; those that are not kit
apps become **Running here**.

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
  packages/cli/            new, add, remove, update, check, doctor, dev, build, deploy, data, mcp
  registry/blocks/<name>/  block.json, src/, tests/, AGENTS.md, pictures for the pickers, changes
  registry/starters/<type>/  the blocks and options of an app type, its data model, pages and sample data
  registry/designs/<name>/   colours, type, spacing, shells and page variants
  examples/                one reference app per starter, built from the registry by the tests
  bench/                   the scripted briefs (section 13)
  docs/                    for people and, version by version, for agents
```

- **The core is small and tested, and it is the only part an app depends on.** It holds what must be the same in
  every app and must be fixable for all of them at once: the seams, the access rules, the security defaults.
- **Blocks are source.** `kit add` copies one into the app, the agent adapts it, and the maker owns it. A block
  holds everything a feature needs: pages, components, server functions, tables, emails, jobs, tests and notes.
- **Starters are thin.** An app type is a list of blocks with their options, a data model, pages and sample data.
  New types come from new blocks far more than from new starters.
- **Interface parts travel in shadcn's registry format**, so the parts of other shadcn registries fit an app
  without anything of ours.

### The stack

Versions and licences were read from the npm registry on 24 November 2026.

| Layer | Choice | Checked | Licence | Why, and the risk |
|---|---|---|---|---|
| Framework | [TanStack Start](https://tanstack.com/blog/tanstack-start-1-0) on Vite, as a Node server | 1.169.7; 1.0 on 13 October 2026 | MIT | Typed routes and server functions turn an agent's mistakes into compile errors. One code base reaches Node, Cloudflare and Vercel. Lovable (May 2026) and Base44 moved to it. It is young: React Router 8.5 is the fallback |
| Interface | React 19, Tailwind 4, [shadcn/ui](https://ui.shadcn.com/docs/changelog) | Tailwind 4.3.5 | MIT | What models know best, and the widest stock of ready parts |
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
             "keys": ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] },
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
- `kit update <block>` joins three things: the block as it was copied, the block as it is now, and the app's own
  version. What does not join cleanly goes to the agent, which then runs the block's checks.
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
   read). Route code gets a database handle already narrowed to whoever is signed in. The handle that sees
   everything is for the admin block and for jobs, and `kit check` lists every use of it.

   ```ts
   export const projects = table('projects', { id: id(), teamId: ref(teams), name: text() }, { owner: 'team' });

   export const listProjects = serverFn({ input: z.object({}) }, async (_, ctx) =>
     ctx.db.select().from(projects));          // only the signed-in team's rows can come back
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
| **Commerce** | Products, cart and orders, digital goods, discount codes; booking (services, availability, time zones, deposits, reminders, a calendar feed); courses (lessons, progress, timed release); memberships |
| **Social and live** | Threads and comments, reactions, follows, a feed, moderation; live channels and presence, chat rooms and direct messages, live boards |

### The twelve types, in four waves

Each wave is ordered so that most of what it adds is reused by the next.

| Wave | App type | Its starter is made of | New blocks it brings |
|---|---|---|---|
| 1 | Landing page and waitlist | Base, landing sections, waitlist | Design system, landing sections, waitlist, mail, legal |
| 1 | Internal tool or admin dashboard | Base, accounts, resources, admin | Accounts, roles, resources, admin, charts, import and export |
| 1 | SaaS: accounts, teams, subscriptions | Landing, accounts, teams, billing, resources | Teams, billing, onboarding, API keys, usage |
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

"Directory or marketplace with search" is one of your twelve: the directory comes in wave 2 and selling through it
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

No calendar, as you chose. A phase ends when its "done when" holds, and nothing is cut to make a date. The earlier
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

**Done when** the skeleton runs inside Hydor and on a server from the same code with only configuration between
them, a Standard helper adds a resource from the notes alone at least four times in five, and the formats have
tests.

### Phase 1: the core, the first blocks, web apps in Hydor

Two tracks that meet at the end.

- **The kit**: the core (seams and drivers for Hydor and servers, access rules and the tests they write, security
  defaults, migrations, jobs, mail, files); the commands (`new`, `add`, `remove`, `update`, `check`, `doctor`,
  `dev`, `build`); the blocks of the base, accounts, roles, admin, resources, landing sections and waitlist; the
  starters for a landing page and an internal tool; the reference apps as tests, on Node and on Cloudflare's
  runtime.
- **Hydor**: the store and routes for web apps, the host for apps, the project kind, **Web apps** on the Apps page,
  the app's page with **Overview**, **Preview**, **Features** and **Data**, the kit's copy in the release with
  `kit_find` and its vectors, the card for what an app may use.
- **Done when** an agent with the kit's commands and notes makes a landing page with a waitlist and a small
  customer list from a description, both are used inside Hydor from a phone, and their access tests pass.

### Phase 2: the guide

- The App builder covers both kinds; the `web-app-builder` skill with a reference for each stage; the sketch with a
  kind; the features card, the designs card and **View as**; the stages on the app's page; a commit per step and
  **Back to before this**; pointing at a part of the page; helpers by tier.
- Designs drawn from the real blocks: themes, shells and section variants, pictured for the cards.
- The Check stage whole: tests, access, keys in the browser's code, phone layout, accessibility, speed.
- The benchmark's first briefs, for the wave 1 types.
- The ready-made **Build a small web app** gives way to the guide.
- **Done when** someone who does not code gets from a paragraph to a working app inside Hydor through the stages,
  picking the type, the features and one of three designs, and at least eight of ten scripted briefs for wave 1 end
  with every check green and no hand on the code.

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

- A runtime for agent-app steps on the AI seam (a model, a tool, a decision, a repeat, data, code), so a flow runs
  in a standalone app. **Make it a web app** on an agent app.
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
| 2 | The embedding model outside Hydor: Hydor's own (310 MB on disk, about 1 GB loaded) or a smaller one | After 0.11 | The smaller one by default if it keeps most of the quality, Hydor's where memory allows. Your call: it is your field |
| 3 | May a web app inside Hydor be opened to anyone on the internet from your own computer, as an agent app's public page is | Phase 3 | No: share it with people you invite; anyone means Launch |
| 4 | The SQLite driver on servers: Node's own (no native module, still marked experimental in Node 22) or better-sqlite3 (which Hydor uses) | 0.13 | better-sqlite3 now, Node's own when it is stable |
| 5 | The second payment provider: Polar, Paddle, or Stripe's Managed Payments alone | Phase 6 | Managed Payments alone, unless makers ask for another |
| 6 | Contributions to the kit: Hydor's agreement or a lighter sign-off | When the repository opens | Hydor's, so the kit can always be offered on other terms |
| 7 | What a web app inside Hydor may spend on models a day unless you say otherwise | Phase 1 | \$1, raised on its card |
| 8 | Whether the benchmark of scripted briefs is published | Phase 2 | Yes: it is the kit's best argument, and it invites others to beat it |

## 12. Risks

| Risk | How to keep it small |
|---|---|
| Twelve types on four kinds of place, twice (in and out of Hydor): more combinations than anyone can try by hand | Blocks say where they run; the reference apps are the tests, built every night; a type counts only when its briefs pass |
| A young stack: TanStack Start reached 1.0 in October 2026, Drizzle 1.0 is not final | The kit pins versions and takes each upgrade once, for every app; Phase 0 decides with a fallback named |
| Models know the new framework less well than older ones | Notes for agents in every block, tied to the version; typed routes, so mistakes show at once; the Standard-helper test repeated each phase |
| A generated app leaks data or keys | Section 5: access in the data layer, tests the kit writes, a build that fails on a key in browser code, a gate at Launch |
| Money and the law: tax, privacy, what makers promise their users | A hosted checkout only; Managed Payments explained; legal pages as drafts; what stays the maker's said at Launch |
| A generated server running on your computer | Its own process, keys and folder, bubblewrap where it exists, an origin apart from Hydor's, stopped when idle, a card for what it uses |
| It works in Hydor and not outside | The check lists what an app takes from Hydor and its stand-in; **Only inside Hydor** is said when a feature is added, not at Launch |
| Apps drift from their blocks, and updates stop joining | A small core for fixes that must reach everyone; the three-way join with the agent behind it; a block's tests travel with it |
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
- A block's update joins by itself in eight apps of ten, and with the agent in nineteen of twenty.
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
