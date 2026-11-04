# What Hydor offers for everyday life

A map from needs to the app's features, with the places as the app names them. The app changes:
before naming a feature, check it with `app_guide` (a `query`, or the topic in brackets) and give the
person the link it returns. Ready-made apps can be uninstalled, so `find_apps` says which they have.

## Things that happen by themselves [tasks]

Scheduled tasks live in Settings → Agents → Scheduled tasks (`/settings?s=tasks`). An agent proposes
one with `schedule_task` and the person confirms it on a card; they can also start from the ready-made
examples under **Start from an example** there. Each run is an agent's session, so it uses a model's
time; a watcher looks without a model and costs nothing until something changes. Tasks run while the
app is running; a run missed because the computer was off runs at the next chance. A run with nothing
to report stays quiet, and failures always notify.

| Need | Ready-made example, or how | Notes |
| --- | --- | --- |
| A nudge at a time | **Reminder** (repeats on chosen days); a one-off: `schedule_task` with kind `once` | "remind me tomorrow at 8 to take the bins out" |
| Weather, news, today's events and urgent mail each morning | **Morning brief** | events and mail only with a calendar or mail account connected |
| News on a subject, quiet when nothing is new | **News on a topic** | |
| A price to watch, or a target price | **Price watch** | the watch-and-alert skill |
| A page changing | **Page change alert** | |
| What came into the mailbox, most urgent first | **Inbox digest** | needs a connected mail account; it only reads |
| A daily question about a habit, with a streak | **Habit check-in** | the streak lives in the task's notes |
| A weekly round-up of what changed in a folder | **Weekly report from a folder** | changes no files |
| Something done with each new file (scans, invoices) | **New files in a folder** | |
| An app run on a schedule (a meal plan each Sunday) | the app's **Runs** → **When it runs by itself** → **Add a schedule**, or `schedule_task` with `template` | |
| Something that worked once, done again | the session's menu (⋯) → **More** → **Make this an automation** | drafts a task from the conversation |

To hear from tasks with the app closed, notifications must be on for that device (below).

## Apps: one job, run again and again [apps]

On the Apps page (`/apps`). In a conversation, find the app with `find_apps` and run it with `use_app`;
its card asks for whatever the request left out. Ready-made apps that suit everyday life, by the name
`use_app` takes:

| Need | App |
| --- | --- |
| The weather ahead, what to wear | `weather-outlook` (Weather outlook) |
| When to travel somewhere | `best-time-to-visit` (Best time to go) |
| A trip planned day by day, with a budget | `trip-planner` (Trip planner) |
| Things to do in a city on given days | `whats-on` (What's on) |
| What is around a place, as a walk | `place-explorer` (Explore a place) |
| What to cook from what is in the fridge | `fridge-recipes` (Cook with what you have) |
| A week of dinners and one shopping list | `meal-planner` (Meal plan and shopping list) |
| A present within a budget | `gift-ideas` (Gift ideas) |
| Something to watch tonight | `what-to-watch` (What to watch) |
| Books, or games, they would like | `book-finder` (Book finder), `game-finder` (Game finder) |
| A team's fixtures, results and next match | `team-tracker` (Team tracker), `match-preview` (Match preview) |
| Saving towards a goal by a date | `savings-plan` (Savings plan) |
| Which product to buy | `compare-products` (Compare products) |
| Questions about a document; what a contract says | `document-qa` (Document Q&A), `explain-contract` (Explain a contract) |
| Meeting notes turned into actions | `meeting-actions` (Meeting notes to actions) |
| A cover letter for a job | `cover-letter` (Cover letter) |
| A quiz, or a topic as a timeline | `quiz` (Quiz on any topic), `topic-timeline` (A topic as a timeline) |
| A sourced report; the week's news on chosen topics | `deep-research` (Deep research report), `news-digest` (Weekly news digest) |
| Charts from a spreadsheet or pasted numbers | `chart-my-data` (Chart my data) |

A repeated job of their own becomes an app of their own (the app-builder skill), or comes from a
conversation that went well: the session's menu (⋯) → **More** → **Save as an app**.

## Pages, documents and spreadsheets in the Library [library]

- `save_page` keeps a page in the Library (`/library`): a tracker, a checklist, a log, a calculator, a
  packing list. A kept page stores what they enter, the same wherever they open it.
- Every kept page has its own address: open it, **Share** → **On your phone**, then add it to the
  phone's home screen. Anyone with the address can open it and change its data, so it stays private.
- The Library's **New** also makes pages by hand: **Notes**, **Checklist** and **Tracker** to start from.
- `save_doc` makes a document to edit, print or export (letters, plans); `save_sheet` a spreadsheet
  (budgets, lists with numbers).

## Their accounts: Connected apps [connections]

Apps → Connected apps (`/apps/connected`), with a **Marketplace** of services: mail and calendars
(Gmail, Google Calendar), notes and tasks (Notion, Todoist), files (Google Drive, Dropbox), everyday
services (Strava, AllTrails, Kiwi.com, trivago) and many more. The person connects an account
themselves, by signing in in the browser or by giving a key, which goes into the vault: agents never
see it. `list_connections` shows what is connected.

## Keeping things together, and how agents behave [spaces, guidelines, assistants, memory]

- **A project** for a long piece of life (a move, a renovation, a job hunt, a course): its own folder,
  documents, guidelines and memory. **Projects** among the tools at the bottom of the sidebar.
- **Shared knowledge** (Projects → **Shared knowledge**): documents every session can search, such as
  manuals, policies, a recipe collection.
- **Agent Guidelines** (Settings → Agents → Agent Guidelines, `/settings?s=guidelines`): what every
  agent follows, such as "answer briefly, in plain English". The place for how they like to be talked to.
- **An assistant of their own** (Settings → Capabilities → Assistants): a role for a kind of session,
  such as a household bookkeeper or a travel agent.
- **Memory** (Settings → Capabilities → Memory): short notes agents see in later sessions. Only with
  their agreement, one sentence each.

## Away from the desk [devices, documents-voice, inbox]

- **On a phone:** the app needs an HTTPS address (Tailscale, a Cloudflare tunnel or a proxy); then add
  it to the home screen.
- **Notifications:** Settings → App → Notifications → **Notify this device**, on each device, then
  **Send a test**. On an iPhone, only from the app opened from the home screen.
- **Voice:** the microphone in the message box (dictation), the speaker on a reply (read aloud), and the
  headphones button, **Hands-free**, to talk with the app while walking or cooking.
- **The inbox** (the tray at the top of the sidebar) gathers everything waiting on them.

## Plugins that add abilities [plugins]

Settings → Agents → Plugins: **Text from pictures** (receipts, photos of letters, scans), **Speech to
text** (voice notes, recordings), **Meeting recordings** (notes and actions from a recording), **Audio
and video**, **Python for data**, **SQLite databases**. Adding a plugin always asks the person on a card.

## Not a fit

Say so plainly: anything physical; an account they do not want to connect; paying and ordering (the
browser stops before paying and hands over to them); medical, legal and money decisions, which stay
with them and a professional; watching other people.
