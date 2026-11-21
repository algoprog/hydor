# Features

Everything Hydor does, by area. [Back to the README](../README.md).

## Sessions
- The prompt bar’s Stop button shows a rotating ring while a session starts or works, paused while
  waiting for you and respecting reduced-motion preferences. Once the turn is over, it stays, ring and all,
  while subagents or background tasks it started still run, and it stops all of them at once: the turn, the
  subagents, and the background tasks, with the ones they started (a stopped Hydor subagent does not report back and
  wake its parent). Pointing at it says what it stops (“Stops this turn, 2 subagents and 1 background task”). A
  stopped session shows stopped the moment Stop is pressed (here or in the header), while its agent takes a few seconds
  to finish, until the agent confirms it (or, still at work 20 seconds later, shows at work again).
- The work tray, one line above the prompt bar, gathers what a session started: its subagents and its
  background tasks (commands, monitors, workflows). Folded, it sums them up (“2 subagents and 1 background
  task running”, “1 needs you”) with a **Stop all**; opened, every one is a row in the same look, with its state,
  what it cost, **Open** and a stop button (a stop sign: a square in a circle), and its kind (“Hydor subagent ·
  Claude Code · Sonnet 5.5” for a session of its own that Hydor started, “Claude Code subagent · Explore · Haiku 5.5” for one Claude Code or Codex runs inside the
  session), with who runs it on hover. **Open** takes you to a subagent's own conversation, a Hydor one's or a
  program's; a command, a monitor or a workflow opens in a side panel with its output, refreshed as it runs.
- Start a Claude Code or Codex session in any folder, optionally in a worktree of its own (a new branch in a
  separate folder, so several agents can change one repository at once). The folder menu lists your projects and the
  folders you used last under their own headings, each with where it is (a project's own folder only as the project),
  with Browse for any other folder and a new task folder; it opens on the side of its chip with more room and fits
  without scrolling. Pick the model, how hard it
  thinks, and what it may do without asking you. The start page keeps what you pick for each
  project, each folder and the new task folder separately, on any device: the program with its model, effort and
  permissions, the agent, memory, a spending cap, Confidential and the worktree switch; a place you have not used
  opens with the defaults (the project's own agent, else General). What you
  write in a message box, with the files you attach, waits there while you look at other pages. Pressing
  Start opens the session's page at once with your message and the agent at work on it (Working), as the
  session shows it, and it becomes the session as soon as the agent is up, with no loading in between; if it
  can't start, the page says why and your message goes back in the start page's box. If the connection drops
  before the app answers (a phone gone to sleep, a change of network), the page says Reconnecting… and asks the
  app what came of the start once it can: the session opens if it started, and one press of Start never makes two
  sessions (after a minute out of reach, the page says so, with Try again). Pages, tabs, menus and dialogs open at
  once, with no fade.
- A session you start in a project whose wiki memory is empty (but that has conversations, commits, documents, notes
  or a README to build one from) first asks, in a card under your message, whether to build the memory: **Build memory,
  then start** holds your message while the most important part is written (the session says Building memory, the card
  shows the progress, with Start now and Stop building) and sends it when that is read; **Start without memory** starts
  now and does not ask that project for a week; **Don't ask for this project** never asks again. What you send meanwhile
  goes after your first message, and the waiting survives a restart.
- Starter ideas under the start page's empty message box ("Ask for anything: research, documents, plans, code."):
  three example requests that change each day (everyday work, research, documents, and code in a code folder), two
  of your apps (the ones you run most, else Deep research report and Trip planner) and an automation ("Every Monday
  at 8:00, send me …"). An example or the automation fills the box to change and send; an app opens its form. They
  fold away as you type; Hide puts them away on every device (Settings → General → Starter ideas brings them back);
  on a phone they are one row that scrolls sideways. Under them, Today in a line: "Today · 7 sessions · 12 file
  edits · $0.84", the money at API prices, which on a plan is not what you pay (its hover says so, with the lines,
  tokens and prompts).
- While you were away, under the start page's message box (above the starter ideas): what happened since your last
  visit, folded to a line, what matters first ("1 needs you · 1 failed · 3 done · next: Morning brief at 07:30 · Since
  yesterday 18:40"), each part opening it to just those (on a phone the whole line opens it, the time in the opened
  header). Open, up to six rows, most important first:
  what waits on you (approvals, questions, forms and calls held in the Outbox answered right there with the Inbox's
  own cards), sessions that finished Done or Failed and that you have not opened since (the start of the last reply or
  the error, and the files made, each opening in Files; one whose subagents or background tasks still run waits until they end), runs of scheduled tasks, agents' schedules and apps with how
  they went (done, failed, nothing new) and their cost, and what runs next today. It stays folded until you open it,
  and as you left it on each device; Mark all as seen clears it and marks its sessions as opened on every device. Your last visit is kept on
  the server for every device: the end of the last time the app was open, in front and in use for a minute or more
  (a reload or a glance does not move it). How each session's turn ended is kept when it ends; one route gives it all
  (GET /api/away); `hydor away` in a terminal; another machine on an older version shows none.
- Sessions name themselves: a moment after one starts with a request, the helper model gives it a title of a few
  words ("Weekend trip to Lisbon"), shown in the sidebar, the header and the search box instead of the start of the
  message, and passed to Claude Code and Codex for their own lists. Nothing shows in the conversation; sessions
  started together with the same request share one title; a title you give it with Rename always stays.
- Switch models or assistants mid-session; the model menu lists the session's own agent's models (or, when the agent
  did not start as the app asked for them, why, with Try again), and another assistant applies from your next
  message, the conversation carrying on. "Continue in Codex" (or
  Claude Code, or Custom Agent) in the session's menu hands the conversation over to another agent.
- Fork a session from the button under a reply (any reply of Claude Code, one from before a compaction too, with the
  conversation as it was then; the last reply of a finished turn for Codex and Custom), or edit an earlier message and go on from there, with the files put back as they were. Compact a long session, stop a turn, resume an old one.
- Give a session a goal (`/goal`): the agent keeps working, turn after turn, until it holds.
- A rail of tool icons at the left edge of every page on a computer (a tooltip names each one, with its shortcut, under the pointer or the keyboard), and, on the start page and in a session, the sidebar with your sessions beside it (its header: the logo, a filter and group button, and Hide). A session started as an agent other than the usual one names it at the start of its row's second line (its icon and name; the usual one is its project's own agent for a session in a project that has one, General otherwise; sessions started outside Hydor and deleted agents are not named either, and under Projects such a row keeps a second line for it). The filter button's menu has sections: Agent (All agents, then the agents your sessions were started as, the most used first, up to eight, each with its number of sessions), Runs on (Any, Claude Code, Codex) and Project (Every project and up to eight), then New project… and Group by folder or project; the filters combine, a chip for each one that is on shows under New session (its × shows everything again), and a list with nothing in it says so. Apps, Agents, Help and Settings have a column of the same kind (the logo, their own list, Hide), the Browser its own tab column, and the other pages (Projects, Inbox, Usage, System…) use the whole width. `Ctrl+B` (or Sessions on the rail) hides and shows the column of the page you are on. The column's width, 180 to 560 pixels, is the same in all of them, set by dragging its edge or with the arrow keys on it, and kept. A column's list shows its scroll bar whenever it holds more than fits (macOS would hide it until you scroll), and its foot fades while more is below.
- Every session on the machine is listed, including ones open in VS Code or a terminal, with what each is
  doing right now: Active lists all sessions with activity in the last five minutes, including finished ones,
  and moves them back to their usual group after five quiet minutes. Sessions awaiting automatic resume
  after a usage limit stay in Active until that scheduled resume is cleared, and so do sessions whose background
  agents, commands or monitors, or Hydor subagents, are still running, until those end (a session whose subagents still run shows as working, with no Done marker, and takes messages; so does one whose Hydor subagent's own background tasks or subagents still run). Pinned comes next, then Projects: a group for each project and each folder you picked
  (task folders, the home folder and temporary ones go by day), foldable, and each starting folded (the Active, Pinned and Projects headings fold too,
  kept on each computer; folded, Active and Pinned show their count and a dot for a finished session), a line per session, with a pen to
  start a new session there; a project's name opens its details window and the arrow beside it folds its sessions; and dragged by their headings into the order you like, the same on every device;
  a heading's ⋯, a right-click or a double-click renames the project or the folder (a folder's name is the app's
  for it, on every device, shown under sessions and in the folder menus too; Codex projects' folders, such as the
  ones it makes for ChatGPT projects, show by the project's name). Any session working in a project's folder is in the
  project's group, wherever it was started. A folder whose work began outside Hydor (its first
  session came from Claude Code or Codex in VS Code, a terminal or their desktop apps) and that is not a project
  carries the marks of the agents its sessions came from after its name (a project found in them carries the marks
  after the project's name), and its tooltip and ⋯ say which apps, and which added account; then the rest
  by day. Each row's ⋯ (or a right-click) renames, pins, snoozes
  (until later), settles (done for now), archives or deletes the session, on phones too.
- While a session works, its line says how long this turn has run and, after earlier turns, how long it has worked in
  all ("Working · 2m 10s · 47m in all"), in the session and in the sidebar. Once its agent is no longer running, its
  status says how the work ended: Done (with "· 3 files changed" or "· 2 files made"), Stopped (you stopped it, or it
  was cut off) or Failed (it ended with an error). After Done, Resume steps back, since a message in the box
  ("Message to continue…") starts the agent again anyway.
- **Confidential sessions** (Options → Confidential): for a submission you review, patient data or a client's code. The
  session runs on Custom with a model on this computer or your private network; web search, the browser, connected
  apps, apps and models elsewhere are off (an allowlist of tools, so new ones stay off too); its commands run without
  network (bubblewrap on Linux, Seatbelt on a Mac), or ask each time where that can't be done (Windows, some containers); its title, notices and memory send nothing out; a
  lock and a calm tint show it. Enforced on the server, not only in the page.
- More agents: besides Claude Code and Codex, any agent that speaks the Agent Client Protocol (Gemini CLI, OpenCode,
  Qwen Code, Goose, Kimi CLI, Auggie, Grok Build, or a command of your own). Their approvals become approval cards you can answer
  from a phone, and the app's guidelines, memory notes and skills reach them with the first message; the app's tools
  reach every one that takes MCP servers (through a small bridge when it takes only commands). The app installs the
  ones it can get with npm by itself (with an ACP adapter when the agent needs one, without install scripts); the
  others show their own install command.
- Grok Build, xAI's coding agent, is one click in More agents (the app installs it from npm when first needed, or uses
  yours, also xAI's own installer's `~/.grok/bin`) and runs over ACP with the app's tools, approval cards and Grok's
  models. Sign in with a Grok subscription under Settings → Accounts: a link and a one-time code to confirm on any
  device, no pasting; an `XAI_API_KEY` works instead. A session started while signed out stops and says where to sign
  in. A session whose ACP agent can no longer reopen it starts afresh, with a note, instead of failing. Its models take
  a reasoning effort (xhigh, high, medium or low as each model takes them; Grok 4.5 has no xhigh), offered on the start
  page as soon as Grok Build is added, changed in a running session and taken by app runs; a model that does not take
  the effort you had shows its own default. Any ACP agent whose models offer efforts gets the same picker.
- Several accounts per agent: sign in more than one Claude Code, Codex or Grok Build account and pick one per session
  (Grok accounts each keep their own sign-in and Grok history, and share the CLI's config, rules, skills, plugins and
  MCP sign-ins; a Grok session's Account chip moves it to another from the next message, its history with it); each
  shows its own usage and limits (Grok Build's too: its plan, weekly usage, credits and pay as you go, from Grok's own
  billing; no limit resets or API credit for Grok yet), and an added Claude account trusts the folders the main
  sign-in trusts. With **Switch accounts at a limit** (on by default), the app uses them all: a session whose
  account runs out of usage (for Grok, its weekly limit, credit limit or pay-as-you-go cap, not a short rate limit) moves, with its history, to another account with usage left and carries on (a Claude Code
  session's subagents that the limit stopped go on there too, and a Hydor subagent's lead hears that it carries on
  rather than an error), and the app's own quick
  questions (the helper model, apps' model steps) go to the next signed-in account too.
  An account that has been signed out (its sign-in ended or was revoked) is worked around the same way: a session
  whose turn it turned away moves to another signed-in account with usage left and carries on (with the setting off,
  or none left, it stops with a banner and a **Sign in** button, and continues by itself once you are signed in
  again); the helper model's background jobs pass it over for 15 minutes, then the next signed-in account, then
  Codex, then one of your Custom models (the one Custom's Quick tier names, else the cheapest you added; not your plans' models, which go through the same two programs) answer; and
  only when nothing could do the work does a card on every page ask you to sign in again.
  With **Use API credit at a limit** (off by default), Claude Code sessions carry on billed to an Anthropic API key saved for an
  account when every account is at its limit, and go back to the plan once it has usage again.

## Help with anything

Every agent here gets the same help from the app, whatever its model: Claude Code, Codex, Custom, and the
agents that speak ACP and take MCP servers.

- **Agents** (on the rail; assistants before 0.37.0): start as a Researcher, Writer, Tutor, Planner, Analyst, Coder or
  App builder (it makes apps; the others answer in the answer UIs that suit their work: the Tutor with practice
  problems and flashcards, the Planner with itineraries and calendars, the Analyst with key figures and charts), or one
  of your own, and switch to another in the session's message box when the work
  changes. The Agents page shows each of yours as a card with how it is doing (working, needs you, budget spent), its
  projects, tier, next run and what it spent this month. On a computer it has a column beside the rail, as Apps'
  (the logo, **New**, whose menu has New agent, Install an agent from a file and Import Claude Code agent files, and Hide;
  then All agents, Your agents, Needs you and On a schedule when some of yours are, Everywhere and each project that has
  agents of its own, a row for each built-in agent that opens its page (the page lists them too only while the column is hidden, or when a search finds them), and Schedules), a row with the place's name and a
  find box (by name and line), and an agent's own page keeps the column beside it; a phone keeps its header, tabs and
  chips. **New agent** opens a window in two steps: you say what it should
  do (or pick an idea: Paper digest, Weekly report, Change reviewer, Translator) and the helper model drafts its instructions,
  tools (switches for reading, editing, commands, the web, a browser, the computer and other tools), tier and a schedule,
  or you set it up yourself; then Set up shows the whole agent in seven sections (About, Where and when, Model, Tools,
  Team, Results, Budget), each with what it is set to, to change before Create agent. An agent's page reads its settings
  as sentences whose underlined words change it in place, and All settings opens the same window for it; Claude Code's
  agent files import. Its page lists its recent sessions, with a link that shows all of them in the sidebar (filtered to that agent). An agent works everywhere or only in
  some projects (offered only there, in the project's folder); runs on its schedules (scheduled tasks that run as it,
  listed on its page, and on a week with every other task in the page's Schedules place; deleted with it); thinks with a tier, Quick, Standard, Best or Max, whose model Settings → Models → Tiers sets for
  Claude Code, Codex and Custom (Automatic keeps the model picked where it starts); hands parts of its work to other
  agents: plain subagents on a tier the lead picks (never above its own, nor the highest its agent allows) or named agents
  with their own settings, only those its Team lists (built-in agents may ask any), never a freer mode than the lead's;
  steps up: a Hydor subagent on a tier whose reply to its brief fails a quick check by the helper model (or that stops with an
  error) runs again a tier up (its later replies, to messages, are not checked), as far as Best, the lead told why, and a scheduled run that fails goes again a tier up, unless the
  agent turns it off; hands
  back results: the fields of each (an app's answer fields: text, numbers, dates, links, lists, tables), checked by its
  hand_back tool, sent to a kept page (the same page each run as a new version of it, or a new page each
  run), a row in a kept spreadsheet each run (when it ran, then a column per field, found by their headings: new
  fields add columns at the end, the person's own columns, formats and formulas stay, formulas carry down and charts
  over the rows grow), an email to people from a connected mail account (HTML and plain text, a subject with {date},
  {time} and {agent}, sent at once without the Outbox), a file in its folder (Markdown or JSON, with {date}, {time} and
  {agent} in the name), an https webhook (signed with a vault key, to the hosts it allows) and a notification; kept for a
  year (up to 500 an agent) and shown on its page as a table, a row per result and a column per field, with where each
  went, paged, each row opening to the whole result (`hydor agents results` too); can keep one conversation of its own, with an inbox: messages from you and other
  agents go in one at a time and each answer goes back to its sender, its scheduled runs post there too; and keeps
  to a monthly budget, which caps each of its sessions at what is left and refuses new ones once it is spent. Each
  save that changes one of yours keeps a version (by you, an agent through the API, its draft, a file installed or an
  import; the latest 50), listed under its page's More → **Versions** with what changed in sentences, compared two at a
  time (its settings in sentences, its instructions as a diff) and brought back as a new version. Its **Examples** are
  messages to try it with and what its answer must do (sentences the helper model reads it against, or rules on
  {{reply}} and {{result.field}}, as an app's checks): **Try the examples** says first what it costs (from its last tries
  or its sessions this month, against its budget), then runs each in a throwaway session as the agent on its tier, in an
  empty folder removed once its result is kept, sending nothing (its connected apps' calls kept as would-have-sent, what it hands back kept with the
  try), and shows which passed, each version with how its examples went; after a change the page offers to try them
  again; they never run by themselves. **Download as a file** saves an agent (built-in ones too) as a `.hydor-agent`
  file: its settings, instructions, team by name, fields, the kinds of place its results go, schedules by the clock as
  suggestions and examples, with nothing of the person's own (projects, connected accounts, kept pages, email
  recipients, webhook addresses and keys are left out, and listed as what to set again); **Install** on the Agents page
  shows what a file brings and needs before saving, installs beside an agent of the same name unless you choose to
  replace it (as a new version), adds its schedules paused if you like, starts Full access as Accept edits, and says
  plainly what is wrong with a broken file or one from a newer Hydor (`hydor agents export` and `install` too). A
  project's Agents tab shows its agents as a team (what starts each, whom it hands work to), and a project can have an
  agent made for it as it is made, or later: drafted to fit it when it says enough about itself, else the template for
  its kind (software, a website, ML experiments, data, a LaTeX paper, research reading, writing, design and media,
  slides) from its files or description, else a default one, named and described in the app's language. A task
  without a folder gets one of its own
  (`~/Hydor/<date>-<task>`).
- **Agent Guidelines**: what you want every agent to follow (how you like to work, what to always or never do,
  how to talk to you), written once and given to every agent by the app itself, whichever it is: Claude Code,
  Codex, Custom or an ACP agent. Three levels: every session (Settings → Agents → Agent Guidelines), a project, and
  one session (the start page's Options, or the session's menu); the more specific wins. A changed session's
  agent follows the new ones from the next message. CLAUDE.md and AGENTS.md still work, and can be edited there too.
- **Agents that work the app**: every agent knows the app's own guide (the `app_guide` tool) and answers questions
  about it from there, with links to the place. Ask it to change a setting or set something up (a project, an
  assistant, a scheduled task, memory notes…) and it does it through the app's API (`app_api`): reading runs at
  once, and each change shows you a card first, with what changes before → after, to allow once, for the rest of
  the session, or not. Your agents have tools of their own (`list_agents`, `save_agent`, `delete_agent`): any agent
  makes one from what you say, changes only what you ask (a new version by An agent), adds, changes or removes its
  schedules in the same step, and deletes one with its schedules; its card shows the agent, or what changes in
  sentences, and when each schedule runs next, and schedules and deletions ask every time but in Full access. When it needs details it shows a form (`ask_form`). Passwords, keys' values, approvals,
  permissions, spending caps, files and commands stay yours. `page_action` does what an editor does in a click to the
  whole of a kept page, with the editor's own code and a new version: animate every slide, fix what the
  accessibility check finds, describe pictures, PowerPoint compatible or the web format, a theme, the slide shape,
  slides from another deck, charts updated from their spreadsheets; accept or reject suggestions, page setup, a
  header and footer; sort, remove duplicates, fill, clear, trim, split text, summarize, insert or delete rows and
  columns, the sheet tabs' menu; move a LaTeX document's files, tidy its source and its bibliography; clear a notebook's outputs; duplicate and turn into.
  The agent beside a page (Ask) is told its kind's actions and gets the ids of what was picked.
- **The web**: search with Naget Search (its own index of the web, papers, patents and filings; free daily
  searches without a key) or SearXNG, Brave Search and DuckDuckGo, by category, site or date, up to 100 results (when
  an agent sets no filter but the words of a Naget Search state some, such as "papers on retrieval augmented
  generation since 2024", the helper model reads them first, within about 8 seconds and for a few searches at a time,
  and the search's filter tags and a note naming the words searched show it; a search whose read filters find
  nothing, and the other providers, search as written);
  read whole pages, or only the parts that answer a question; find a picture and a video of each of a list of things
  (find_media: a Wikipedia article's lead picture, else what the pages about it show when shared, and a YouTube
  video whose title names it). Each search shows its results, and each reply the sources it cites: a chip with the
  site's icon and name where it cites a page (a card of its pages on hover or tap) and a Sources line under it that
  opens to a card for each page, only those cited, by the numbers the agent gave them, its list of sources no longer
  repeated in the text. When no provider can answer, Claude Code and Codex search with their own web search instead.
  [Search providers](search-providers.md).
- **A browser**: agents open sites, click, type and read pages, in a browser of their own. In the desktop apps it is
  the app's own browser (built on Chromium, running inside the app: nothing to install, its pages drawn fast in the
  window, and working with the window closed); elsewhere it is a Chromium the app starts, seen as a live picture. You
  watch it live above the message box, the agent's pointer gliding to each place it acts (a ring where it clicks, the
  field it types into outlined, scrolls and keys beside it, each step's picture marked where it clicked), and take over to log in,
  solve a check or pay, on a computer or a phone (in the desktop app a click or a key in the page takes over, and the agent waits); with a sign-in
  saved in the vault, the agent signs in itself, typing the password without seeing it, on that site only. Sites
  on your own network stay off limits unless you allow one. On a site it is signed in to (a profile that keeps
  sign-ins, or a page you handed it), an agent stops before a button that sends, posts, publishes, deletes or
  transfers and asks you to allow it (once, for the same words on that site, for two minutes; the words in English,
  German, Greek, Chinese, French and Spanish; **Ask before sending on signed-in sites** turns it off), as it always
  stops before paying. The desktop app's own browser is in Settings → Browser's list and chosen first; with it,
  **Show a window** and the download of a Chrome are not shown.
- **Your own browser** (the **Browser** tool on the rail, in the desktop app only: the web app and a
  phone have no Browser button, and `/browser` there says it is part of the desktop app; the agents' browsers work
  everywhere): its tabs are real pages in the app's window, connecting to sites directly like any browser, kept between
  visits (up to 30; private tabs are not kept). It keeps your sign-ins in a profile of its own that agents can never pick, and it can open
  addresses on your own network.
  - **A bar and three columns**: a bar across the top (back, forward, reload, home, the address box, **Save**, **Ask**, the buttons of
    the extensions you pinned, **Extensions** (the puzzle piece: every extension that is on, to use, pin or unpin), **Add to Hydor** on a Web Store page, and a ⋯ menu), a purple **Private** chip in a private tab, and
    the translate and reader view buttons at the end of the address box when a page can use them, under it the **tab column** (Ctrl/⌘+B folds
    it away), the page, and a **column beside the page** that shows only when something is in it. Nothing is laid over
    the page: it narrows to make room. Drag the column's left edge (or focus it and press ← →) to make it wider or
    narrower, at least 340 px and leaving the page 360 px; a double-click puts back its 400 px; kept on this device.
  - **The tab column**: the sites on your bookmarks bar pinned as tiles (five to a row, two rows, a **…** tile for the
    rest; click, middle or Ctrl click for a new tab, right-click to edit), **Agents at work** (a row for each agent's
    open browser with a dot for working or waiting for you), a purple **Private** section while private tabs are open
    (**Close private tabs**, **New private tab**), and your **Tabs** (icon, title, ⋯, ×, a speaker to mute,
    middle click to close, **New tab**), resized by its edge like every column; a title too long fades at its end and rolls to
    show the rest under the pointer; and **Read later**, a quiet section under the tabs, folded while nothing waits.
    **A tab's menu** (right-click, or its ⋯): close it, the others or the ones below;
    duplicate, reload, copy its address or **Copy as Markdown link**, bookmark; add it to a group or take it out. **Tab groups**: a header with a colour
    (one of seven), a name and the tab count, folded or opened by a click, its tabs under it (drag a tab on or off a group);
    the header's menu renames, colours, opens a new tab in it, ungroups or closes it. Groups are kept with the tabs for the next
    start. **Group my tabs with AI** (the sparkles in the **Tabs** row) sends the titles and addresses of the
    tabs in no group (never a private tab), without what follows a ? or #, to the helper model, only when pressed, and makes the groups it answers
    with, with **Undo**.
  - **The column beside the page**: **Ask**, with a switch at its top, **Ask** or **Do** (kept on this device): Ask about the
    page (a copy of its text goes to a new session with the agent the start page used last, each tab with its own
    question, its conversation right there, **Open as a session**), or Do, to have an agent work in the page (see
    **Hand a page to an agent**); an agent's conversation while you watch its tab; or **History**, **Downloads**,
    **Bookmarks**, **Import bookmarks and history**, **Highlights**, **Extensions**, **Site permissions**, **Settings**
    or **Keyboard shortcuts** (the keys the browser answers, by group), still open by `?panel=`. A sheet over the page in a narrow window.
  - **Save** keeps a reader copy of the page in a project's files as a Web page (the article as Mozilla's Readability finds it,
    with its pictures and videos, without the site's menus, ads and comments), whose Bookmarks, Read later, Downloads, History and
    Highlights panels list this browser's own. A ▾ beside it (Choose a project to save to) picks which project, or No project,
    kept on this device.
  - **A smart address bar**: as you type, a list offers your open tabs (switch to one), bookmarks and history (the pages
    you go to often and lately first, typed addresses counting most, a bookmark as twenty visits), what you typed as an address or a search (a **search shortcut** such as `yt` before your words, `yt lofi`, searches that
    site first: "Search YouTube for “lofi”"), the
    search engine's suggestions, **Ask about this page** (opens Ask beside the page with your words; **Do it on this page**
    while Do is picked in Ask, which has an agent do what you typed there) and **Ask an agent**, which starts a session with your words; the rest of an address
    completes in place (Tab or → takes it, found by words alone); Shift+Delete forgets a history suggestion. With search
    by meaning on, pages of your history and bookmarks that are about what you typed also show, after the ones with its
    words, even when theirs differ (the model runs on your computer, from a vector of each page's title and address,
    kept apart from everything else and gone with the page); the list keeps at least two of your pages and two of the
    engine's suggestions when it must be cut to fit, and always shows at least two matching bookmarks (they take the place of
    the last pages of the history, so a big imported history never hides them); a short window cuts pages of the history
    before bookmarks and open tabs. An address opens with or without https://, `localhost:3000` and
    files work, Alt+Enter or Ctrl/⌘+Enter opens in a new tab.
  - **A home page and a search engine**: new tabs open your home page (Google at first); the address
    bar searches with Google, DuckDuckGo, Bing, Brave, Ecosia, Startpage or a search address of your own, with search
    suggestions you can turn off.
  - **History**: a panel with a search box, by day, a way to delete one page, **Recently closed** and **Clear browsing
    data…**; Ctrl/⌘+Shift+T opens the tab you closed last. It stays on this computer, the last 20,000 pages. **Import**,
    at its foot, brings in the latest 20,000 pages of the other browsers on this computer (the ones for bookmarks, each
    profile by its name, with how many pages would come in): each keeps its title, last visit, visits and typed visits,
    so the address bar ranks them as that browser did; pages you have keep the later visit and larger counts, so
    importing again adds nothing twice. A browser that locks its history while it is open asks you to close it (Firefox
    can stay open); Safari needs Full Disk Access, and while macOS keeps Hydor out, its row has **Open System Settings** in
    place of **Import** (it opens Full Disk Access; coming back checks again, and the row says to reopen Hydor if it still
    can't read Safari). What the
    browser downloads is kept in a list too (name, where it was saved, where it came from; the last 5,000), cleared with
    the history, the files staying where they are.
  - **Browser settings**: home page (**Use the current page**), search engine, **Search shortcuts** (`yt`, `wiki`, `gh`,
    `scholar`, `arxiv` and `hf` at first; add your own, up to 50, with %s where your words go), search suggestions, **Block ads and
    trackers**, **Hide cookie banners**, **Translation** (what to translate into, the offer, languages to always or never
    translate, sites never translated), **Pages** (**Page zoom**, **Check spelling**, **Dark pages**, **Sites shown as they are**, **Let sites play sound by
    themselves**) and **Clear browsing data** (history with the list of downloads, cookies and site data, cached files,
    with a time range for the history).
  - **An ad and tracker blocker**, on at first, with Ghostery's lists (downloaded once, refreshed weekly): the
    padlock's popover counts what was blocked on the page and lets you **Allow ads on this site**. An extension's own
    request blocking may not run while it is on. **Hide cookie banners** (on at first, with the blocker on) adds
    EasyList's cookie notice list: it hides a notice and does not answer it, and allowing ads on a site shows its notice
    again.
  - **Private tabs** (Ctrl/⌘+Shift+N, **New private tab** in the ⋯ menu and the tab column, **Open link in private tab**,
    `/browser?private=1`): a purple **Private** section in the tab column and a **Private** chip in the address bar.
    Their sign-ins, cookies, site data and cache are kept apart, in memory, and forgotten when the last private tab
    closes or the app quits; their pages are not kept in history, in **Recently closed** or among the tabs that open
    again at the next start; their downloads are saved but not listed in the Downloads panel; extensions do not run
    in them; a site's permission answers are asked again and forgotten; bookmarks, Read later, highlights and Save
    still keep what you ask for. They can't be grouped, and agents never get them: no **Ask**
    or Ask items in the right-click menu, and the server refuses a copy of their page.
  - **Translate a page**: a button in the address bar when a page is in another language than the one you translate
    into (the app's own at first); the popover has **Translate** / **Show original** / **Try again** with a progress line,
    **Translate into**, **Always translate** and **Never translate** for the language, **Never translate** for the site
    and **Translation settings**. What is on screen is translated first, then the rest and what comes later; **Show
    original** puts every word back. Also **Menu** → **Translate page…**, the right-click menu (**Translate to** your
    language, or **Translate “…”** for selected words, in a **Translation** box with **Copy**). The words go to the helper
    model (Claude Haiku online on Automatic; a model on this computer keeps them here).
  - **Reader view**: a book button in the address bar on a page with an article shows it alone in a clean column (site,
    title, author, reading time, date), with **Aa** for text size, colours (**Auto**, **Dark**, **Light**, **Sepia**) and
    font (**Serif**, **Sans**), kept for every article; also **Menu** → **Reader view**. Nothing leaves the tab.
  - **Dark pages**: **Menu** → **Dark pages** (or the setting) shows pages with no dark look of their own dark, and uses a
    site's own dark look; the padlock's **Dark pages on this site** shows one site as it is.
  - **Screenshots and PDFs**: **Menu** → **Screenshot or PDF** → **Screenshot of what you see**, **Screenshot of the whole
    page** (PNG, saved in Downloads and copied to the clipboard, with **Show in folder**) and **Save as PDF…** (in Downloads).
  - **Sound that plays by itself** waits until you click or type in the page (muted video still plays), unless you turn
    on **Let sites play sound by themselves**. Pointing at a link shows its address in a small box at the bottom left of
    the page.
  - **Highlights**: select words on a page, right-click and choose Highlight, and they are marked in a soft yellow and kept;
    each time you open the page they are found by their words (and the words round them) and marked again, once the
    page has loaded and again a moment later (words inside a page's components too; not those in a frame inside it).
    Right-click one for Remove highlight. A page that has some shows a small
    yellow mark on the menu, whose **Highlights** item says how many and opens the column beside the page with them: show
    one on the page, copy it, add a note, delete it, or ask an agent about them together (the page's address and the
    highlights go to a new session, only when you ask). Kept privately on this computer by the page's address (without its
    #fragment and tracking parameters); agents are refused them.
  - **A padlock and site info** (a secure connection, or Not secure), with what the site may use, each answer with
    **Forget**, and **Cookies and site data** → **Delete** (asks first, signs you out of the site and reloads the page).
  - **A right-click menu** on pages, in the app's own look and language: Back, Forward, Reload; for a link, open it in a new tab or your default browser
    and copy it, or set it aside to read later; for a picture, open, save, copy it and its address, **Save image to a
    project** (read with the tab's own sign-ins, up to 50 MB, with the page as its source; a note with **Open**) and **Ask
    about this image** (opens Ask beside the page with the picture attached); for a link, also **Open link in private tab**;
    for a video or a sound, play or pause, mute, loop, controls, picture in picture, open, save and copy its address; for
    selected text, Copy, Search with your engine, Ask an agent about it (opens Ask beside the page, quoting up to 4,000
    characters), **Translate “…”** and Highlight; on a highlight of
    yours, Remove highlight; on the page itself, also **Translate to** your language; in a field, spelling
    suggestions, Undo, Redo, Cut, Copy, Paste, Select all; Bookmark this page, Read this page later, Print… and Inspect.
  - **Read later**: right-click a page or a link, or press **Add this page** at the top of the **Read later** panel, to set
    it aside. The list shows in the tab column and as its own **Read later** panel (⋯ → **Read later**, which says how many
    pages wait; `/browser?panel=later`); each page has **Mark as read** (it leaves the list; **Show read**
    brings the read ones back) and **Remove**. It is yours alone: agents are refused its routes.
  - **Zoom** (Ctrl/⌘ with + − 0, Ctrl and the wheel, and a **Zoom** row in the ⋯ menu with − and + and the percent; the
    **Page zoom** setting is what a site you did not zoom shows at, and a chip in the address bar resets one you did),
    **print**, full-screen video, **find in page** (Ctrl/⌘+F, "3 of 12", Match case) and a speaker on a tab that plays
    sound to mute it.
  - A star and the bookmarks bar as pinned tiles (folders, right-click to edit), downloads into your Downloads
    folder, the permissions a site asks for (camera, microphone, location, notifications… with Block and Allow,
    remembered for the site), a page's pop-up questions.
  - Shortcuts (Ctrl/⌘ with T, W, L, R, F, D, H, J, P, B, 1 to 9; Ctrl+Tab and Ctrl+Shift+Tab; Ctrl/⌘+Shift+T;
    Ctrl/⌘+Shift+N for a private tab;
    Ctrl/⌘+Shift+Delete; F5; Alt+← and Alt+→), all listed in the ⋯ menu's **Keyboard shortcuts** panel.
- **Bookmarks**: the bookmarks bar and Other bookmarks, folders, moving by dragging or with arrows, up to 20,000. A search
  box at the top finds bookmarks by every word in their names and addresses, and folders by name (Enter opens the first
  bookmark found), and **Organize with AI** (also in the search box, Ctrl+K, as "Organize bookmarks with AI") sorts them
  into folders by topic with the helper model, sending only titles, addresses without their ? or # parts and folder names,
  when you press **Organize**: **Keep my folders** files only the loose bookmarks (in Other bookmarks, or in a folder that
  only collects, such as an import's) into the folder that fits, one of yours or a new one; **Start over** puts every
  bookmark into new folders by topic and removes the old ones; the bar's own links stay either way, **Stop** changes
  nothing and **Undo** puts everything back (`/browser?panel=bookmarks&organize=1`; agents are not given it). Bring them
  in from the other browsers on this computer (Chrome, Chromium, Edge, Brave, Vivaldi, Opera, Firefox, and on a Mac
  Arc and Safari, each profile by its name, into one new folder that keeps the browser's own folders; Safari needs Full Disk
  Access) or from an exported bookmarks file, and export them as a file Chrome, Firefox and Safari import. The desktop
  app's welcome tour offers both, bookmarks and history, from those browsers. Someone who took the tour before it had
  that page, or skipped it, is offered them once, in a bar above the Browser page the first time it opens with other
  browsers on the computer (**No thanks**, or **Import…**, which opens the **Import bookmarks and history** panel);
  the panel stays at `/browser?panel=import` (the search box finds it; the Bookmarks and History panels have **Import**
  at their foot too), with a switch for Bookmarks and
  one for History and a row for each browser and profile with its counts and **Import**.
- **Chrome extensions** in your own browser (the desktop app's browser runs them): from the Chrome Web Store by link or
  id, or the **Add to Hydor** button on a Web Store page, from a folder (loaded where it is), or from the Chrome-based
  browsers on this computer; toolbar buttons with popups and badges for the ones you pin (as in Chrome: the puzzle-piece **Extensions** menu lists
  all of them to use, pin, unpin, turn off or remove, and right-clicking a button unpins it; those brought in from Chrome keep
  their pins, new ones start pinned), options pages, a switch to turn one off, **Remove**,
  and **Also in agents’ browsers** (those that use a profile) off until you turn it on. The app fills in the extension
  features Electron lacks: your tabs (the one you are on, opening one in front, switching, closing, their loads and
  changes), windows, downloads, cookies of the sites it may use, page-load events and a side panel shown under the
  button; extensions that use the `browser` object (Firefox's name) get them too. Each extension's row names the parts
  that may still not work (blocking or changing requests, signing in with an account, history…), and pressing the button
  of one that is not running says so. Changing an extension through the API asks you every time.
- **Hand a page to an agent**: **Ask** in the bar opens the column beside the page with a switch. **Ask** starts a
  session with a copy of the page's text (the agent cannot touch the page); **Do** (also the address box's **Do it on this
  page** row while it is picked) gives
  Claude Code or Custom one tab of its own at your page, signed in as you on that site, kept to that site, with the
  browser's tools and nothing else, asking before it sends, posts, deletes or transfers; **Take back** closes the agent's
  tab and opens the page in yours. **Agents at work** in the tab column lists the browsers agents have open: click one to
  see its tab in the page's place, ringed while it waits for you or you drive, with its conversation beside it, and
  **Stop**, **Take over** or **Hand back**, **Take back** and **Open the session** in the bar.
- **Memory**: agents save notes about you, the project and the session when you ask or they learn something
  lasting that the files don't say, one fact per note written to be found again, with how it is known (you said so,
  checked, or not checked yet), some only until a date, and a chip under the reply shows
  what changed (undo, edit, delete). Claude Code's and Codex's own memories stay off in the app's sessions: these notes
  are the one memory every agent shares. They also keep a profile of you (who you are, what you use, how you like
  answers) that every agent gets once, at the start of a session, after your guidelines: agents add to it only
  when you say something lasting, you edit it in Settings, and past its length (1,000 words unless changed) the
  helper model shortens it. Each agent starts, once, with the notes that bear on what you asked, at most 10 unless changed: a
  top-k by hybrid search, by words (BM25) and by meaning (on unless you turn it off; it sets itself up once), with
  LightOn's mDenseOn model on your own computer (in 8 bits through ONNX Runtime on the CPU: a 340 MB download, about
  1 GB of memory and a second or two to start, only while needed), each counting only when it stands out from the rest
  for that request; a place with few notes
  whole; an index of the rest by title, to look up (what agents used most first, the rest counted by area of the project);
  and a few lines naming the wiki articles that bear on the request, and the project's plans in progress. Nothing fills the
  room, and only what agents looked up weighs in ranking. Later messages add only what newly bears on them (a stricter bar, at
  most three notes and one wiki line, usually nothing), and opening a file adds the notes about it and its folders, once for each
  folder; a rare exact name in a request (a file name, a flag, a version) finds the few notes that hold it. Custom with a model
  of a small context gets less: memory is sized to its window. Each note counts how often agents were given it and how often they
  used it (looked it up, cited it or worked with its file); notes the helper kept from documents come last, as quoted material. Claude Code and Codex get the notes for the request with the first message, their instructions the same
  for every session of a project until its notes change, so the provider's cache of them holds from one session to
  the next; Custom keeps its block until it condenses, asks Claude models on OpenRouter to cache the conversation, and
  changes its tools at most once in a session, so its provider's cache holds. The model starts as you begin a
  message, and a session never waits for it. About once a day the helper
  model tidies memory up: it merges notes that say the same thing, titles them, and when there are more than fit,
  sums related ones up in topics and, for a project, a short profile (the standing rules agents need first); it checks the notes
  that name files that changed in the project's repository against the code, moves notes saved about you that are about one project
  to it, writes long design-history notes into the project's wiki, and compares notes with the project's AGENTS.md, removing what it
  says already and suggesting up to three lasting conventions for it, which you add or dismiss; and it learns from the day's conversations
  (Learn from conversations): it corrects notes they show wrong, checks the unchecked, and keeps at most three things
  a day that no agent saved, reading only what you wrote yourself (not attached files or pasted text) and never sessions
  with memory off. It runs whenever the app is on, once a day has passed, there is something new and you pause. Every change can be undone.
  Settings → Memory lists every note with when it was written, changed and last needed or given (each place its three
  newest first, with Show N more; each note two lines until you open it), lets you add your
  own, and suggests removing the ones no agent needed for months. Turn it off for one session or for all.
  Memory is one system of three parts, notes, Wiki memory and documents (below), and Settings → Memory has the Wiki memory group.
  Bring in… there brings what other assistants know into memory, as notes you pick from: Claude Code's memory files
  (each project's, and CLAUDE.md), Codex's memories and AGENTS.md, the memory and instruction files of other agents on
  this computer (a memory store is read from a copy, so the agent can keep running), and the export ChatGPT or Claude
  emails you (Claude's memory, ChatGPT's custom instructions, and what you wrote in your chats, newest first). The helper model reads them a part at a time against the notes memory has, leaves out
  what it says already (also in other words), secrets and text that would steer agents, puts a project's notes in
  its folder when that is on this computer, and proposes lines for your profile; nothing is added until you pick.
  The same dialog lists the skills you made in other agents, each with its
  name, description and source, as the preview: the ones you pick are copied, with their files, into your own skills.
  Keys and sign-in files are never copied, a skill's folder is capped (200 files, 512 KB each, 2 MB in all), and a
  skill whose name your skills have already is left out with a note. MCP servers are not brought over. Agents can also look up earlier sessions, by words and by meaning (each message you wrote gets a vector in the
  background), and search notes, wiki articles, documents and past conversations at once, in a project or in all of them (a
  project can keep itself out with **Searchable from other projects** on its Settings tab; what other projects keep is only read).
  [How memory works](memory.md) describes what agents are given and when, and how memory stays current; [Memory internals](memory-internals.md) is for people changing it.
- **Search by meaning stays light on memory**: the vectors live in the database on disk, and the ones used most are also
  held in memory, in one budget that notes and knowledge bases share: at most a 64th of the computer's memory (or of a
  container's limit), never over 512 MB or an eighth of what is free. When memory runs short nothing is held, it is let
  go within half a minute, and searches read from disk a little slower; the least recently used goes first. Past
  conversations and apps' records are always read from disk, and the search box keeps only what exists now.
- **Wiki memory** (formerly the LLM Wiki; Settings → Memory → Wiki memory): linked Markdown articles that agents keep for each
  project, and one shared wiki, from its documents and its work, each with its sources (`wiki/` articles, `raw/` sources,
  `index.md`, `log.md`). On for every project unless turned off: Settings has the default (it decides the shared wiki too) and
  each project's Settings tab has its own switch (As in Settings, On or Off). By default the shared wiki is a folder in the task folders'
  root (`~/Hydor/.wiki`) and each project's wiki is a folder inside it (`projects/<name>-<id>`), so nothing is written into your project
  folders; or each project keeps it in its own folder (`.wiki`, left out of Git if you like), or a line in the project's `AGENTS.md`
  (``- Wiki: `path` ``) names it. Every wiki folder is inside the wiki folder or its project, however it is set. Learn from new documents
  (on unless turned off): when a document is added or changed in knowledge, the helper model reads it (its first 40,000
  characters, one document at a time, after its base has been quiet for half a minute, at most 40 an hour), keeps its text as a
  source, picks among the twenty articles that match it best (by words and meaning), adds to up to three and writes up to two new ones, keeping only the important information (key facts,
  findings, decisions, names and numbers; the detail stays in the document, for search), and, for a project's documents, adds up
  to three short notes to its memory; a newer source may replace what an article said, the helper giving a reason for each
  statement it removes (a rewrite keeps at least half, and the earlier text is kept as a snapshot, the 20 newest of each article), an
  article over 12,000 characters is first split into a hub and parts, anything with a secret is left out, and each outcome is
  listed in Wiki updates (the Memory tab's ⋯ menu); documents already in a project's knowledge are
  read too, at the same pace (each project is checked every ten minutes for documents its wiki has not read yet, so a restart or a
  raised limit loses none; a document the helper could not read is tried again an hour later, up to three times, and when it changes). A large data file (CSV, TSV, a
  spreadsheet or JSON data, over 40,000 characters of text or 256 KB) is analysed with code instead: the helper writes Python that
  Hydor runs in a sandbox with no network that sees only that file, read-only (up to four runs of a minute each), and only its
  findings become the source and go into the articles; without such a sandbox (macOS and Windows for now) these files are searched
  only, and agents in sessions can analyse them with code from their paths. A project with more documents than the most to read
  into the wiki (Settings, 100 at first, 0 to 100,000; a project's Settings tab can set a number of its own) has its wiki read only
  that many: the pinned ones (the Read into wiki memory switch in a document's pane on the Memory tab), then those agents used most, then the newest, with an
  overview article for each folder it does not read; agents search all of them, and its Memory tab says so. Each article keeps a
  summary, the files it names and the commit it was written at: once a day, one whose files changed is marked out of date (agents see
  that), and up to five a day are brought up to date from the change. Learn from the project's work (about once a day, when memory's Learn from conversations is on, nobody has written for ten
  minutes, and the last pass was 20 hours ago; the first time it looks back two weeks): the helper reads the project's recent
  conversations (your own words and each agent's last reply of a turn, never tool output; not confidential sessions, sessions with
  memory off, child sessions or scheduled runs), the ones with most to keep first (commits made, corrections, fixes, length), at most
  four a project and twelve a pass, and a session once it has been quiet for 30 minutes (up to eight a day); once a day it also reads
  up to 60 new commit messages. It keeps where it stopped in each
  session: one it has read is never read again, a session that goes on is read from its new turns only, and one an agent is still
  working in, or that it had no room for, waits for the next time. It keeps each conversation as a source with the secrets taken
  out and adds to or starts articles with lasting knowledge only (no memory notes, nothing personal), and an update opens its
  session. Agents get tools to read it, keep a text or a document (up to 20 MiB) as a source,
  write articles with the hash of what they read, and check its sources and links, only in their own project's wiki (or the shared one),
  never in hidden folders, and not at all in Confidential sessions. Wiki articles are searched with the knowledge tools, and with `wiki_search` (words and meaning, words, exact text or a pattern; areas, articles or sections; one area or path; the articles, the sources or the plans; this project, another or all: each result with its article, section and lines), and `wiki_read` can read one section by its heading or a range of lines, numbered. Changing the wiki
  folder when it has files opens a review (keep, combine or replace, with a hidden backup of each original folder). Checkpoints: before and after an automatic
  compaction Claude Code, Codex and the Custom agent save one checkpoint of the session in the wiki folder (a resumed Claude Code or Codex
  session is given it once, and Custom's is cut to its model's context), with the secrets taken out (for
  Claude Code and Codex, the last messages go to the helper model first, up to about 14 seconds, for its summary);
  Hydor registers a hook in Claude Code and Codex for it, unless hooks or plugins of yours might already capture compactions, and
  trusts only its own Codex hook (found once per Codex version). Every chat in a project with Wiki memory on uses it (a Confidential chat never does); there is no switch in a chat's own options.
  Plans: an agent adopts a plan you give it or choose (`wiki_plan_preview`, then `wiki_plan_adopt`) as
  `output/projects/<name>/plan.md` in the project's wiki, with an execution register (separate states for implementation, deployment
  and acceptance), and revises it (`wiki_plan_revision_preview`, `wiki_plan_revise`) with the old text kept as an ordinary snapshot file with its checksum (it works on network drives too),
  the plan's identity and work item numbers kept; each change shows the exact text and waits for your OK, which never authorizes carrying the plan out. Nothing else
  can write in `output/projects/`: agents record what was done, deployed or accepted in `output/evidence/` with the ordinary wiki
  write. A project's Memory tab shows its wiki read-only (its articles, sources, plans and evidence), with the updates in its ⋯ menu (Wiki updates…).
  Areas: from ten articles a wiki's articles are grouped into areas, lasting topics (`areas:` in each article's front matter, the
  areas themselves in a hidden `.structure/areas.json`; no file moves), each with a hub kept by Hydor (`wiki/areas/<area>.md`: an
  overview, up to six key facts each checked against the article it cites, and the area's articles in reading order); `index.md`
  and the Memory tab list the articles by area, Other last. New articles are placed as they are written; now and then (the first
  ten articles, an area past twelve, Other filling up again, a quarter of the wiki new; at most once a week) a stronger model proposes
  the areas again (Sonnet on Automatic), a quick check overrules misplacements, and the code keeps every article placed, areas of two
  or more, two levels at most and a third of the articles moved at most per pass. Event articles and duplicates it finds are merged
  later, two a day, under the revision rules, the merged one left as a redirect that `wiki_read` follows. Agents get a line naming
  the areas, and article lines say the area; an agent can be asked to reorganise now (`POST /api/projects/:id/wiki/reorganise`).
  The Memory tab's ⋯ menu: **Update the wiki now** (the waiting documents, unread conversations and new commits read at once; up to ten
  out-of-date articles revised, stale hubs written, five queued merges done; the areas looked at again), **Build the wiki from history…**
  while the wiki is new (fewer than 10 articles, no build from history run yet) (it reads what the project has that the wiki never read: its files, memory notes, up to 300 conversations
  by signal, the newest 1,200 commit messages and its unread documents, what matters most first so an agent can start early, then the
  areas, hubs and merges; `/api/projects/:id/wiki/build`), **Rebuild the wiki…** (an estimate of what it reads, minutes, helper
  calls and cost first; the wiki archived, the last three kept and the first one always, then the files and the kept sources in
  `raw/` read again, commit messages fresh from the repository, the documents and conversations never read, the earlier articles no
  new one covers, the areas and hubs made anew, and old article paths redirected to the new articles; sources, plans and memory notes
  untouched; it goes on after a restart) and **Restore an earlier wiki…**. A build or rebuild reads several sources at once
  (three on Automatic, four over an API, one on a local model) and goes as fast as they do; a line under the tab's chips shows its steps (Details), what it reads now
  and the time left, with **Stop** (what was written stays), **Continue** and **Try again** (`…/wiki/stop`, `…/wiki/continue`); one
  job at a time for each wiki (`/api/projects/:id/wiki/rebuild`, `…/rebuild/restore`, `…/update`). Agents are told of a wiki only
  once it has an article.
- **Projects**: a project's sessions, files, documents, memory, guidelines, skills and assistant
  together, like Projects in ChatGPT or Claude. Pick a project by name in the start page's folder menu instead of a
  folder (its own folder is listed only as the project, and starts sessions in it however it was picked): its sessions work in its own folder (a new one, or one you have) and any other folders of yours it works
  with, are told what its folder holds, remember what its earlier sessions learned, search its documents, get its
  guidelines and its own skills and start as its assistant. The Projects page (Projects on the rail, right before Agents, and in the phone's drawer; `/projects`) lists every project as a card, on the page's whole width: a band in its colour with its mark and, for projects Hydor found, a Group, From Claude Code or From Codex chip; its name, what it is about (a group: Brings together …) and its folder; what it holds (sessions, documents, skills, kept files, Shared with N people); N working while its sessions work, and a dot when one finished since you last looked; when it was last at work; and small bars for its last four weeks of messages. New project (a split button: its ▾ has New project and New group of projects…, which needs two projects) makes one; Find a project filters by name, description and folder; a sort button (Recent activity, the usual, Name or Most sessions) is kept on each device. Pointing at a card (always on a touch screen) shows New session and ⋯ (Open its folder in Files, Show in Finder or its like, Only its sessions in the sidebar, Share with people, Delete the project); a click opens the details window; files dropped on a card go into the project's folder. Under the cards, Folders you work in lists the folders your sessions worked in lately that no project has, each with Make a project and ✕ (Not a project: stop suggesting it). With no projects it explains what a project is. The sidebar groups each
  project's sessions under its name, and a project's details open in a window over the page you are on, from a click on
  a card on the Projects page, its name in the sidebar (a tap on a phone; the arrow beside it folds its sessions), its ⋯ menu, the search box (Ctrl+K), or any
  link to it (`/projects/<id>`, with the tab after it). The window has a band in the project's colour (its mark, its name, what
  it is about or its folder, New session and a ⋯ menu: Open its folder in Files, Show in Finder, Only its sessions in the
  sidebar, Share with people, Delete the project) and its tabs under it: Overview, Files, Memory, Skills, Agents and Settings
  (on a phone the window fills the screen and the tabs that do not fit are under More at the row's end). Esc, ✕ or a
  click outside closes it, and so does going to another page, such as opening a document from Files. Its Overview has
  its sessions (with what each is doing), its newest files (up to six tiles, with All files to open the Files tab) and
  what every session in it gets (its folder, guidelines, memory as a line of notes, articles and documents, skills and
  assistant), who it is shared with, and a group's projects too; its Memory tab is one list of its notes, its wiki's articles and sources and its documents, newest first (the project's profile pinned at the top), with a search over all three at once (`GET /api/projects/:id/memory/search`: words, and meaning when search by meaning is on; it looks only in that project, and a note search inside a project now covers only that project's notes, which it could miss before), Add (a note, files, a folder kept up to date), a ⋯ menu (the wiki's jobs and Wiki updates…, Ask an agent to check the wiki, add a source or adopt a plan, Read the documents again, Open the wiki's folder, Memory settings, Deleted notes), chips All, Notes, Wiki and Documents with their counts (Notes: You said so, Not checked yet, Topics, Ends soon; Wiki: its areas, Sources, Plans; Documents: the folders it reads), and a pane that opens a note, a topic, an article or a document in place (`?part=notes`, `?part=wiki`, `?part=documents`; the old Knowledge and LLM Wiki addresses open it); files dropped anywhere on it join the project's documents; its Settings tab sets its name,
  colour, guidelines, the assistant its sessions start as (one tap among them), its Wiki memory switch, the most documents its wiki reads, whether its sessions also search the shared knowledge and whether other projects can search it (each saved at once) and its group, saved from a bar
  that shows once something changed. Its Files tab holds everything of the project that is a file or was kept in it
  (**Files in a project** below). Its Skills tab lists every skill its
  sessions get, each with a switch for the project alone (On here, Off here; Follow Settings goes back): its own
  skills, written there, copied from the library to change for the project alone, or proposed by an agent working
  in it and kept for the project when you approve; the library's; and Claude Code's and Codex's own for its folder,
  switched for its sessions through their settings for the session, not their own files. Turn off all skills, in the tab's
  menu, asks first and switches off every skill it lists for the project (Codex's own stay as they are when they could not be read). A group brings several projects
  together: its sessions work with all of them, their folders, documents, guidelines and skills. The sidebar's filter shows one
  project's sessions (with a chip under New session to show them all again). New project (the + on the sidebar's Projects heading, the start page's folder menu or the filter menu) asks only for a
  name (its colour on the mark beside it) and where its files go, a new folder or one you have, with the folders you
  used lately one tap away; what it is about, its guidelines and other folders are under More options. A folder's
  group in the sidebar has Make it a project in its ⋯ menu. Shared knowledge stays a page of its own, reached from
  Settings → Memory and the search box.
- **Files in a project**: a project's details window has a Files tab with its folder, and each other folder you
  attached, as chips over it, with Attach a folder and Open in Files. It shows tiles by default (As a list switches; a
  list you picked stays), each with a picture: a picture itself, a frame of a video, the first page of a PDF, the first
  page, slide or cells of a Word, PowerPoint, Excel or OpenDocument file, how an HTML file or a notebook opens, the first
  lines of text, Markdown, code, CSV and JSON on a paper-like tile, and the kind's icon for anything else; the pictures
  are made on this computer (ffmpeg, poppler, the app's own browser, Quick Look on a Mac) and kept for 30 days. What was kept in the project (pages,
  designs, slides, documents, spreadsheets, LaTeX documents, notebooks, diagrams, boards, saved web pages, and pictures,
  videos and sounds, whether an agent made them or you did) shows in the same grid at the top of the project's own
  folder, after the folders and before its files, the newest first, each with its kind on it, its name and when it changed,
  and opens in its editor or viewer. Its ⋯ menu has Edit (Present for slides), Rename, Open the original page, Start a session with it
  (pictures, videos and sounds), Share with people, Move to another project, Duplicate, Turn it into, Download as, Download,
  Write its title and description again and Delete. The bar has Find in the folder, Upload (and from its ▾ Upload a folder),
  New and the switch between tiles and a list: New makes a folder, a file or a notebook, and, under them, a Document, Slides,
  Spreadsheet, Page, Design, LaTeX, Diagram, Board or Picture for this project. Files and folders dropped anywhere on the
  tab go into the folder shown as they are, in pieces up to 1 GB with a tray of each file's progress (a Word, Excel or
  LaTeX file in Files opens in the app's own editors). A thing kept in a session that has no project stays with its
  conversation, whose card opens it; the search box finds it, and its own page can move it into a project.
- **Projects found in Claude Code and Codex**: Hydor lists the sessions you had in Claude Code and Codex outside it, and
  the folders you work in with them become projects by themselves: a folder once at least two sessions you started in
  Claude Code or Codex yourself (a terminal, VS Code, Claude's desktop app, the Codex app) worked in it, a Codex
  project (the ones you keep in the Codex app, with the folders it keeps for ChatGPT projects) once a session worked in
  one of its folders, under Codex's name. Sessions a script or another program ran, subagents and Hydor's own sessions
  don't count, a session in a subfolder of a Git repository counts for the whole repository, and the home folder,
  hidden and temporary folders, the app's own, folders you marked Not a project and folders a project already has are
  left out. It happens once Hydor has read your sessions after it starts, then within about a minute of new ones. The
  project is named after the folder (or what you renamed it to in the sidebar). It is a project like any other,
  with its own folder where the sessions ran (nothing moves), and deleting it keeps its folder from being made a
  project again. Every session working in a project's folder, or one inside it, is in the project, wherever it was
  started: making a project for a folder you work in brings its earlier sessions in at once, and sessions the app
  starts there start in the project.
- **Share a project with people** (a project's ⋯ → Share with people): your advisor or students get a personal link each
  (View and comment, or Edit documents; for a week, a month, or until you stop it), shown once, as a copy or a QR code.
  They open a portal of that project alone: its documents in the app's own viewers and editors, its sessions
  read-only, its experiments' runs and its reading list; they comment under their name (you get a notice and an Inbox
  line), and edit documents if you let them. Never your agents, files, settings or other projects; confidential
  sessions never show; wrong links count as wrong passwords.
- **Share one thing with people** (a page's Share → Share with people; Share on a picture's, video's or sound's page;
  Share with people in a card's ⋯): a document, slides, a spreadsheet, a LaTeX document, a notebook, a page, a design,
  a picture, a video or a sound, with each person by a link of their own (View and comment, or Edit; for a week, a
  month, or until you stop it), shown once, as a copy or a QR code. It opens that thing alone, without your password:
  they comment under their name on words, a slide, a spreadsheet's cell, a spot of a picture (a numbered pin) or a
  moment of a video or a sound (a mark on its timeline), and with Edit change it in the app's own editors (a page's
  words, pictures and layout, never its code; pictures, videos and sounds in their editors without AI tools or anything
  of yours to add, a video made on the processor), the one before kept as a version. You get a notice and an Inbox line
  for each comment until it is answered; agents read and answer them; cards show who it is shared with; a deleted
  thing's links stop. Shared projects' people comment on slides, spreadsheets and pages too, and edit pages and designs.
- **Comments and earlier versions for pictures, videos and sounds**: comments on a spot of a picture or a moment of a
  video or a sound, on its page (and through the API for agents); each picture, video or sound keeps the last five it
  was when saved over (in an editor, by an agent or through a link), to look at, download or bring back.
- **Web pages saved from your browser**: in the desktop app, Save in your own browser keeps the page you are looking at in
  a project's files as a reader copy, as a browser's reader view shows it: the article's title, who wrote it, its site and day,
  the address and date it was saved from, what you had selected quoted above, then the article in a column of readable
  width with its headings, lists, tables, quotes, code, pictures with captions and videos (YouTube and Vimeo play over the
  page from their picture; a few other sites' players are framed with a link; video files play). The site's menus, ads,
  comments and scripts are left out. Its pictures are downloaded and kept with the page (up to 40, 8 MB each, 60 MB in
  all), so it lasts when the site's go. A page with no article is kept as a document of its text. It shows as a Web
  page, with its site and when it was saved, among the project's kept things in its Files; the ▾ beside Save (Choose a
  project to save to) picks the project, or No project (the last pick is kept on the device); More → Open the original
  page opens the address it came from. A saved page is a kept thing like the rest, so agents can read it. The Browser's
  ⋯ menu has panels for what your own browser keeps as lists: History, Downloads, Bookmarks, Read later (`/browser?panel=later`)
  and Highlights, besides Import (`/browser?panel=import`) (each with a search field, a row's Open, Delete,
  Mark as read, Show in folder and Remove from the list or history, Show read on Read later, History and Downloads by
  day with Show older, and Highlights by page with Copy, a note and Ask an agent about these), for every project;
  agents are refused them. A picture kept from a page with Save image to a project (in the right-click menu) is a kept
  picture like any other (with the page it came from as its source).
- **Folders in a project**: a project's Files are real folders: New → New folder makes one, and dragging tiles onto a
  folder moves them into it. Kept things (pages, documents, pictures…) stay at the top of the project's own folder, and
  Move to another project in their menu puts one in another project. Agents keep what they make in the session's project.
- **Knowledge bases**: drop documents or a folder in once, and agents can search them: by their words (a
  full-text index ranked by BM25), by what they mean (local embeddings, with search by meaning on) or for exact
  text, as grep would; each passage cites its file and page. A folder on this computer is read where it is and
  kept up to date (of a text file over 4 MB, its first 4 MB). The page shows how far search by meaning has come,
  live, and why it waits when it does (setting itself up, starting, short of memory, stopped). Shared knowledge (a page of its own, from Settings → Memory or the search box) is searched by every session; a project's own
  documents (its Memory tab, the Documents chip) by its sessions alone, which search the shared knowledge too unless the project
  turns that off (a switch on its Settings tab). The wiki's own search index is not listed among a project's documents. A new or changed document also updates the project's notes and wiki memory (above), or the shared wiki for shared knowledge.
- **Documents**: agents read PDF, Word, Excel, PowerPoint, OpenDocument and EPUB files, and make them with the
  app's document skills; the file viewer previews them (a PowerPoint file as its slides, drawn as the app's own viewer draws
  decks, with its pictures, shapes, tables, charts, backgrounds and speaker notes, a box's words made smaller where a
  font this computer lacks needs more room; others as LibreOffice lays out their pages, when it is installed, or as
  their text), and finished files show as cards to open or download.
  Under every reply the documents the agent made or changed in the turn (PDF, Word, Excel, PowerPoint, OpenDocument,
  CSV and TSV, LaTeX, notebooks, EPUB, Markdown) show as cards marked New or Updated, handed over or not (the finished
  ones before their sources, four first), and file names and paths in the reply are links that open the file in the
  window over the conversation; agents are told to hand over what they made or changed and to name each file as a link.
  Agents make Jupyter notebooks too (the notebooks skill: sections with text, a run from the top before handing one
  over, an environment beside it to run it in): kept in the session's project with save_notebook, or handed over as a file
  whose card opens it in the notebook page. A file card can keep a copy of a notebook, a document, a
  spreadsheet or a LaTeX file in a project's files, the project you pick. Agents fill in PDF forms (every kind of field,
  drawn so every viewer shows the values, Greek and Chinese too; a form already signed digitally keeps its signature
  valid), write on PDF pages beside the words printed there (text, ticks, pictures, white-out, highlights, comments)
  and rotate, reorder, merge and split their pages, saving a copy unless asked to replace the file. Signatures: draw
  yours (mouse, finger or pen), type it in a handwriting or upload a photo of it, kept encrypted (Settings →
  Signatures); agents ask for one on a card and place it, by name and never seeing it, into Word files, PDFs, pictures
  and kept documents, each time after your OK on a card that shows where (a picture of a signature, not a
  cryptographic digital signature).
- **Images, videos and audio**: agents make pictures (or change yours), short videos (from words, from a picture
  to start or end on, or by changing a video) and sound with OpenRouter's image, video and audio models, the ones
  picked in Settings → Images, video and audio or one you name. Pictures come in two tiers, each a model of its
  own: Best (Seedream 5.0 Pro unless you pick another) for scenes, photos, words in a picture, diagrams and every
  change, and Quick (Seedream 5.0 Flash, or other quick ones) for icons, backgrounds and textures, picked by what is
  asked (generate_image's detail); a see-through background asked of a model that cannot make one goes to one that
  can, or is cut out here. Drawings (make_svg: icons, logos, diagrams, patterns, shapes, in given colours) are
  written as SVG by Claude or the helper model for nothing, or drawn by Recraft's vector model at Best (about
  $0.08), every one cleaned of scripts, links and what it would load. Plots (make_plot: scatter plots, histograms,
  error bars, several axes, heat maps, functions) are written in Python with matplotlib by the same writer and run
  on this computer, errors going back to it (three tries), with their code beside them to change, and a Plotly
  version that answers the pointer for web decks. Free photos (find_photos) come from Openverse (Wikimedia Commons
  when it cannot answer), only those free to change and use commercially, saved with their credits. The picture
  tools on this computer (Settings → Images, video and audio → Set up: a private Python with ONNX Runtime and a
  portable ffmpeg, about 145 MB, or 2.1 GB with ONNX Runtime's build for an NVIDIA GPU, and three models downloaded
  when first used, BiRefNet-lite, LaMa and Real-ESRGAN) take backgrounds out (remove_background), erase parts of
  pictures (erase_from_image) and make pictures 2× or 4× larger (upscale_image, a tile at a time) for nothing and in
  private, on the graphics card when there is one they can use (an NVIDIA GPU through CUDA, a Mac's through Core ML; a
  model the card fails runs on the CPU, and Settings says so) else on the CPU,
  each model loaded only while used, put away after a few idle minutes and never loaded without the memory for it;
  a poor cutout, and a large or detailed area to erase, go to an image model, and how: "ai" asks for one.
  edit_image crops, turns, sizes, adjusts (curves, levels, hue and saturation by colour, colour balance, clarity,
  dehaze, noise, grain, Auto enhance too), filters, marks up and blurs pictures, edit_video trims, cuts, crops,
  speeds up, joins clips and pictures with transitions, colours (looks, white balance, vignette, grain), lays logos
  and green screens over, captions (also from what is said, with an .srt), sets music and a voice-over to videos
  with the voices cleaned up, the music lowered under speech and the loudness evened out (on the graphics card when
  there is one), and edit_audio trims, cuts, silences, shortens pauses, takes out filler words, cleans up (noise
  reduction, equalizer, compressor, loudness for podcasts or streaming), adds echo or reverb and mixes music or sound
  effects into sounds (a kept sound put back in its place or beside it), all for nothing on this computer
  (ffmpeg). A tool that needs an
  OpenRouter key and finds none asks for it on a card in the conversation (it goes straight to Settings → Models,
  checked with OpenRouter; Skip and nothing runs or is spent, and the session is not asked again for six hours).
  When agents make slides, documents and pages they illustrate them by themselves where a picture helps, with
  these tools. The app's choices are ByteDance's Seedream 5.0 for
  pictures and Seedance 2.5 for videos, Google's Lyria 3 for music (whole songs with or without singing, from the
  agent's description and lyrics) and ByteDance's Seed Audio for voices and sounds (voice-overs in a voice described
  or copied from 1–3 recordings, conversations, sound effects and ambience); any of OpenRouter's speech models
  (ElevenLabs, Gemini TTS, Fish Audio, MAI…) and gpt-audio voices can be picked instead. First a form in the
  conversation shows the settings that model takes (shape, resolution, quality, how many, length, sound; for audio,
  singing or not, length, voice and file) and what the result costs; it comes once per model in a session, and
  scheduled tasks and apps' runs go without it. A video is a job the app follows to its end, also after the agent
  stops waiting, and plays in the app's own player; a sound plays in the app's own audio player, its shape (read
  from the file) the bar to seek along, with a song's lyrics under it. **Keep** (under each; then Kept, which opens it) keeps one in the
  session's project (a menu, Keep it in, picks which when there are projects, or No project), where a model that sees images writes its title and description (a video's from ten of its frames on
  one picture, with ffmpeg; a sound's from its prompt, lyrics and model, since no model hears it): the app's
  choice, any of OpenRouter's vision models, Claude through Claude Code, or a model of your own (Ollama, vLLM, an
  endpoint; Settings → Images, video and audio → Captions for what you keep). A kept picture, video or sound shows in its project's Files
  as a tile (with a video's length and a sound's play button), and the app finds, plays, downloads and edits them; **Start a session with it** opens
  a new session with one in the message box, and agents can work from them.
- **Connected apps**: on the Apps page, the last place in its column after your agent apps (Apps → Connected apps, which was Settings →
  Connections), a marketplace of services (Notion, Linear, GitHub, Google, Stripe and more), signed
  in once for every agent and app; anyone can add one with a pull request to `catalog/`. **Email** connects any
  mail account (Gmail, iCloud, Fastmail, Yahoo, GMX, Zoho, Proton Mail through its Bridge, most work and school mail)
  with its address and an app password, several at once: the servers fill in by themselves (the app's own list of
  providers with how to make an app password at each, else what the provider publishes for mail programs, else
  typed by hand), and signing in to read and to send is checked before anything is saved. Agents get tools to list
  folders, search, read (HTML as text, attachments' names), save attachments, mark, move, save drafts, send (replies
  in their thread, files from the session's folder attached, a copy in Sent) and delete; the server can send with
  `sendMail` (server/mail/send.ts). Outlook.com and Microsoft 365 are not possible this way: Microsoft turned off app
  passwords for them. Keys and sign-ins live in an
  encrypted vault: when a task needs one that isn't there, the agent asks with a card (one key, or a sign-in's
  fields), and uses it by name without ever seeing it, in API calls and site sign-ins on the hosts you allow, and
  in commands on this computer that you allow (what they print comes back masked). When an app needs something from
  you partway through (a date, a choice, a page to approve on), its form shows as a card in the session,
  whichever agent is working; Codex's own servers ask the same way. Each of an account's tools is On, Ask first or
  Off: a call to a tool on Ask first is never made straight away, but held in the Outbox for your OK, whichever
  program or permission mode the agent runs in (Full access too), while the agent goes on. Tools that send, post,
  publish, reply, invite, share, delete or pay are marked as acting outside, and start on Ask first in an account
  connected now; one connected before Ask first keeps its tools as they were, and its card offers to set them all
  to Ask first in one click. A scheduled task can start for each new item in an account (a deal, a file, a ticket,
  a payment) or before each event in a connected calendar (see Scheduled tasks).
- **Subagents**: an agent hands parts of a job to subagents and gets their results back. A Hydor subagent is a
  session of its own that Hydor starts, with any agent and model; it shows under its parent in the sidebar while it
  works or waits for you (and while you have it open), and in the work tray above the prompt bar, it opens to its
  reply, and you can talk to it. A Claude Code or Codex subagent is one the program runs inside the session, and it
  shows the same way. The subagents one turn started show together as one card under that turn (the Hydor ones in
  one, the program's own in another): its top line says how many and of what kind, with what they share (“6 Claude
  Code subagents · Sonnet 5.5”, “3 Hydor subagents · Claude Code · Sonnet 5.5”, “4 researchers” in a deep research)
  and how they stand (“5 working · 1 done”, “1 needs you”), and folds or unfolds on a click; it is open while any
  works or needs you and folds to that line once all have finished. Under it, a line for each: a dot in its state's
  colour, its title, on a wide screen its kind, model, agent and tier, and how it stands (how long it has worked,
  “Needs you”, “3 min ago”, “Stopped”, “Failed”), with a Hydor subagent's cost, and “Stepped up from” its first tier
  and why on hover; a click opens it. While others work, the finished ones fold into one line (“4 finished: …”),
  failed ones stay, and past six at work the card shows five with **Show 3 more**. A turn with one subagent shows it
  as a one-line card. **Stop** shows on a line you point at (a small stop button on a touch screen): a Hydor
  subagent stops at once, a Claude Code one asks first, a Codex one cannot be stopped one by one; the card's **⋯**
  menu has **Stop 5 subagents**, which stops them all without asking. The sidebar gathers them with the Hydor
  ones in one line under their lead (“5 subagents · 1 needs you”), the tray has a row for each, and a program's
  subagent opens as a page with its whole conversation, read-only and live while it works, with a bar that leads
  back to its lead (**Open parent**). When one that worked in the background comes back, its lead's conversation shows “Reply from …” (a
  Codex subagent's reply is fetched when you open the line), in place between the steps it came among. You cannot
  talk to a program's subagent, resume, fork or delete it (its lead can talk to it), its spending is its lead's own
  and it has no share of a spending cap, and Codex's cannot be stopped one by one. A Codex session counts its
  subagents as running work, as Claude Code's does: “Working · 2 subagents running”, no Done marker until they end.
- **Tiers and the team** (Settings → Models → Tiers): four tiers name a model and an effort for Claude Code, Codex
  and Custom: Quick for small, very clear jobs, Standard for clear tasks of medium size, Best for a session's main
  agent, Max for the hardest problems. Until you change one it is the newest model of its kind the program offers
  (Haiku, Sonnet, Opus and Fable for Claude Code; Luna, Terra, Sol and Astra for Codex). Custom's tiers fill
  themselves in the same way from the models it has: your Claude plan's (Haiku, Sonnet, Opus, the newest Fable),
  else your ChatGPT plan's (Luna, Terra, Sol, Astra), else the models you added that are not on this computer
  (OpenRouter, an endpoint) whose names say one of those families; a model on this computer is never picked for you
  (its name does not say how strong it is), and a small model (Haiku, Luna) never becomes Best, so with only small or
  local models the tiers stay empty until you choose. Once Best names a model, Custom has Automatic and its sessions
  lead Hydor subagents. Back to the defaults puts these picks back. The start page's Model
  opens on Automatic: the session starts on Best. The main agent is told to lead: it plans, hands clear parts to
  subagents on Standard and Quick (a subagent asked for with no tier gets Standard, and none thinks with a tier above
  its lead's), checks what comes back, and may move itself to Max with step_up_session when a problem proves harder
  than Best can manage (a line in the conversation says why); a request is not sent to Max on its wording alone.
  Claude Code's own Agent tool is told the same models. A scheduled task's Model menu offers Automatic first too, and
  a new task starts on it; an app, and each agent step of its flow, can think with a tier instead of a model by name.
  Two switches, **Lead with subagents** and **Max for hard
  problems**, turn the team and stepping up to Max off. `scripts/tier-bench` measures what each tier and the team cost
  and how their results compare on your own setup, on tasks of its own, recent contest problems and LiveCodeBench.
- **Deep research**: one switch under Options, or in a running session from its menu → Session settings → Deep
  research (it takes effect from the next message; the agent restarts with the new instructions and the conversation
  carries on). The agent plans the searches a question needs, sends researchers
  (Hydor subagents) after each part, digs into what they leave open, has the key claims checked against two
  sources, and delivers a cited report as a page or a Word document. How many researchers at a time, how many
  rounds and how many searches in all are yours to set; a bar in the session says what it is doing and the
  searches used, and opens the report once it is ready.
- **Swarm** (Options → Swarm, or a running session's menu → Session settings → Swarm; **Campaign** is the same for one
  big change in parts, below): a lead agent splits a hard problem into different angles, starts a member for each,
  and has the answer checked; members share a board. Like Deep research it takes effect from the next message, turning
  one on turns the other off, and neither is offered for a confidential session or one another session started.
  The first time someone picks Swarm, Campaign, Deep research or Arena (on the start page, in a scheduled task's
  options or in a session's dialog), a dialog says what it does, what it is worth it for and not, and what it costs;
  it shows once per mode, on every device, whether tips are on or not.
- **Pages and apps**: pages the agents show can answer back (pick an option, fill in a form), are kept with pictures, storage of their own and an address for a phone's home screen, and pages and folders publish at a
  link (a published page with a description and a social picture where its link is shared; **Published**, `/published`, lists them, from a page's Share menu or the search box). Kept things go by project: what an agent saves goes in its session's project, where it shows in the project's Files (its details window, from the sidebar), and Keep
  asks which project when there are projects (the session's first, or No project); a thing kept in a session with no project stays with its conversation, whose card opens it, and the search box finds it. New (in a project's Files, or the search box's New document, New slides…) makes it in the project you look at, and Move to
  another project, in a kept thing's menu or its own page's ⋯, moves it. Everything kept has a description (at most 100 words): the agent that
  saves something writes one (save_page and the other save tools' description, changed alone with an id), the helper
  model writes one for files added and pages kept from a conversation, models that see images write those of
  pictures and videos, and you can write your own (Write its title and description again). The search box (its Kept files) and agents (get_page's query) find things by title and description with hybrid search: by words (BM25) and by
  meaning, joined by rank. Files and whole folders dropped on a project's Files, or added with Upload, are put in the
  folder shown as they are, sent in pieces up to 1 GB with a tray of
  each file's progress (Upload files in the + of a phone's Files does the same). A page shows as the agent writes it (beside the conversation on a wide screen), fills the width it gets,
  looks like part of the app (its theme, light or dark as the app is, your colours and the app's font, unless you
  ask for another look), and you can change it in a visual editor that works on a phone too, written in as in Notion:
  Enter makes the next block, "/" adds headings, lists, to-dos, toggles, callouts, quotes, code, tables, pictures,
  videos, columns, cards, maths, a table of contents, a button, an embed (maps, Google Docs and Sheets, Figma, Spotify,
  CodePen, Loom… or any page that may be framed), a bookmark card (its title, description and picture read by the
  server), a file to download, a sound, a PDF shown in the page, a Mermaid diagram drawn as you type, a chart of a
  database's numbers or a small table, breadcrumbs or tabs, and blocks come in from Markdown, a web page, a Word file,
  a CSV or a Notion export (its databases with their rows' pages); AI on the page as Notion AI (Space on an empty line,
  /ai, Ctrl+J, Ask AI in a block's menu or over picked words) continues, writes about a topic, summarizes, makes shorter
  or longer, improves, fixes spelling and grammar, simplifies, changes the tone, translates, explains, makes a table or a
  list, brainstorms or finds action items, its answer shown in place as blocks to replace or insert below, try again,
  change in words or discard, one step to undo; Markdown turns into blocks as you type, a ⋮⋮ beside
  each block drags it or turns it into another kind and colours it, several blocks are picked at once (with a drag from
  either margin, as in Notion), an item of a nested list turned into another block keeps its place under its parent,
  a right-click on any part picks it and opens that menu with what is under it (a link's Open, Change and Remove, a
  picture's Replace, Edit and Description, Place freely, Bring forward and Send backward; while writing, Cut, Copy, Paste,
  Paste without formatting, Select all, Link, Bold and Italic), a part placed freely is dragged with pink guides and the
  distances on small pills (snapping to the other parts' edges and middles, their gaps, the box and the page; Shift keeps
  it straight, Alt turns snapping off, Ctrl drags a copy) and moved by the arrow keys, one that sticks when scrolled is
  dragged to where it sticks on the screen (under a header that stays there, with a dashed outline until the page is
  scrolled), a long press on a phone opens the same menu, parts are sized from any side or
  corner (Shift keeps the proportions, edges snap to other parts' edges and sizes), Ctrl+A picks every part, parts
  reach the system clipboard as HTML and words while pasted HTML keeps bold, italic, links, headings and lists (Ctrl+Shift+V
  pastes only the words, an address pasted over words links them), PDFs, videos, sounds and any other file dropped on the
  page become their blocks in the order dropped, the view zooms from 50 to 200 % (Ctrl+wheel) and takes any width, Ctrl+F
  and Ctrl+H find and replace words (never tags or addresses, one step to undo), a link typed as example.com goes to
  https://example.com and an address that runs code is refused,
  code blocks are coloured in about twenty languages (a language picker, or Auto; agents' plain code blocks too), "@"
  links to another kept page, databases as in Notion (a table of typed columns: text, number, select,
  multi-select, date, checkbox, URL, email, phone, files and pictures, a formula over the row's other columns, created
  and last edited time, and an AI column the helper model fills from each row when asked; sorted, filtered, grouped,
  a calculation under each column (sum, average, median, count, percent checked, earliest date…), shown as a table, a
  board of cards dragged between lanes, a gallery with pictures, a list, a calendar by a date column or a timeline of
  bars from a start to an end date; each row opens as a page of its own with blocks; rows in from a CSV and out as one;
  its rows kept with the page's own data on every device and changed in Use and Edit, by agents too), blocks and words take comments with replies that agents answer (kept beside the page, not in it), and a
  page gets an icon and a cover; click or tap a part to rewrite its words (bold, italic, code, links, colours), restyle it (this part, every part of its kind or class, on hover, or for tablets and
  phones only), move, size, copy, wrap or delete it, pick it from its layers, add parts and ready-made sections,
  set the whole page's colours, fonts, width and the look of its headings, links and buttons, ask the agent about
  a part, or edit its HTML with the page beside it; the agent hears of your changes with your next message.
  HTML files an agent writes open the same way. Pictures go into a page made with AI (Make with AI, A drawing (SVG)),
  as free photos with their credit under them, or as a cover made with AI; a picked picture is changed with AI or
  edited in the picture editor; Add has Add a block made with AI (a pricing table, questions and answers…); and
  pictures an agent saves into a page from its folder (a picture, a drawing, a plot) go inside it, made smaller where
  this computer can (a page up to 2 MB). Make pages of your own in New, each starting point drawn as it will look:
  a blank page, notes, a checklist, a tracker or a template made of blocks and databases (meeting notes, a project
  plan, a wiki, a journal, a reading list, a trip plan, a habit tracker), or import one (Markdown, a Notion export, a
  Word file, a web page), or describe it in the box at the top for an agent to make at once; lock a page so
  it doesn't change by accident, see the pages that link to it and how many words it has, and see or clear the
  data a page keeps. Export a page as a PDF, a Word document (headings, lists,
  tables, links, charts as pictures) or a web page; ask an agent to change the page, slides, document, spreadsheet
  or LaTeX you have open (this slide, every slide, a section, the cells picked, the part picked, all of it) and
  watch it change as it saves. Apps are small tools for one job that find things out and show them clearly, each
  with a form and a view of its answer: ready-made or your own (described to the App builder, built from scratch,
  or installed from a file, all under one New app menu). On a computer the Apps page has a column of places beside the
  rail, the same kind as the sessions' (the logo, New app and Hide sidebar, then All apps, Pinned, Recently used and
  Your own apps, a Kinds label over a row for each kind of app with its count, and, after a divider, Connected apps);
  the place is in the address (/apps, /apps?place=pinned, /apps?kind=Research), and the open one fills the page under
  a row with its name and the find box. All apps has the apps you pin at its very top (big
  tiles in your order, dragged or moved from a tile's menu, up to 12, the same on every device; Pin to the top and
  Unpin in each card's menu and an app's own page's), a find box that stays at the top and finds any app as you type
  (its name, kind and what it does, plurals too; Enter opens the best fit; on a phone or in a narrow window, with no
  column, its kinds are chips with their counts under it), the
  apps you ran lately (each once, up to 8: how its last run went and when, Open the result or Answer it, Run again
  with the same answers; the latest runs folded beside them), four ready-made apps to start with for someone new,
  your own apps (Most used, A to Z or Newest), the ready-made ones under their kinds (cards of one size, with what
  each asks for and marks for its own view, working in chats and a key it needs) and the ready-made apps you
  uninstalled, to install again; on a phone, one column with the two tabs Agent apps and Connected apps, the pinned and recent apps scrolling sideways. They run
  from the Apps page, the API, MCP, a public page, or once for each row of a CSV. An app thinks with a tier or a model
  by name (Edit → Who does it, a step's What it thinks with, or Change beside a ready-made app's "runs with": the
  Model menu lists Quick, Standard, Best and Max first, each with the model it means now for that program, then the
  models by name; a tier follows Settings → Models → Tiers and works whichever program runs the app, a model by name
  wins, an agent step's own pick replaces the app's, and the last pick is remembered); the agents that build apps pick
  the lowest tier that does the job well, and so do the ready-made apps with an agent step (Best for Deep research
  report, Reproduce a paper and Research sprint, Standard for most, Quick for Document Q&A's look; no step names a tier,
  so what you pick on the page reaches all of an app's agents). Ready-made apps come installed; Uninstall puts one aside, and Install brings it back after a card
  that says in plain words what it asks, gives and does. A session is told of the few apps pinned or run most with
  what they do (the pinned ones first) and of the others by name (up to 40 in all), and a message one app clearly does tells the agent which, with its
  form (a clear lead by words, so "best upcoming games for switch 2" runs the Game finder); past 40, agents find the
  right one with find_apps: a few words on what the user wants, searched by
  words (BM25 over names, kinds, descriptions and form questions, plurals and word starts matching) and by meaning
  (the search box's vectors), fused by rank, the user's own and those run lately lifted, the best twenty with
  their forms, those pinned on the Apps page first and those used lately next, each marked so. An app that needs a model through OpenRouter asks for OpenRouter's key with its other keys (kept
  in Settings → Models) and adds the model by itself when it first runs; one for Ollama, vLLM or an endpoint is
  refused until it is set up. Agents in any session run your apps for you (use_app):
  ask to plan a trip and the Trip planner runs there. The app's own card asks first (what it does, its steps, what it
  took from your message, how long and what its last run cost, a way to the app's page): Run it, Always run it or Don’t run,
  with the questions your message left out on it too (the optional ones may stay empty); an app you chose to always
  run, or added under Settings → Capabilities → Apps → Run without asking (remove it there to be asked again), shows its
  card only when it needs details your message left out, and a scheduled task's own session runs apps without asking.
  Its run and its view show in the conversation, and when its answer does not fit and the agent answers itself, the
  card is taken out so there is one answer. Each app's Agents can
  use it switch keeps agents from running it, and blocks and apps made for their own page stay out. An app's page has its form beside what you get, its latest
  runs and how it works, with a way to its graph; a ready-made one's agent and model wait behind one Change. The
  ready-made ones work in steps (Deep research plans its questions, searches them a few at a time, ranks the
  sources in code, reads the best in parallel, searches again for gaps and writes a cited report). Explore, one
  click from the top right of the start page, is a magazine made for you: it reads your profile, memory's notes about
  you and the titles of up to 1,000 of your latest sessions, has the helper model pick about six topics you would
  enjoy (half from your work, half from the rest of your life), finds each one's news of the past two weeks and long
  reads, reads the best pages side by side and lays them out as an edition with a cover line, a cover story and a
  section for each topic, each story with its picture, what it says and why it is there (opening one marks it read;
  Dig deeper starts a research report on it). It opens on its own page rather than in chats, with Update and its
  settings at the top: Update automatically (every day, on weekdays or once a week, at a time you pick: a scheduled task, off until you turn it on), how many sessions it reads,
  what to always cover and what to leave out. An app of your own whose view has pages for its own page gets the same
  Update and settings. Beside those come sixteen small, quick apps for everyday things that get real data from free services, no key needed, and show it
  as charts, maps and cards: a weather outlook and the best time to go somewhere (Open-Meteo), a team tracker and
  match previews (TheSportsDB and the web), recipes from what is in your fridge and a week of dinners (swapped for the diet where one does not fit) with one
  shopping list by aisle, its amounts scaled to the people (TheMealDB), gift ideas, what to watch tonight and where it streams (TVmaze), a game finder
  for games out now or coming soon (Nintendo Switch 2 too), each with its picture and trailer, and PC prices with
  their lowest ever, for the game asked for and no other (CheapShark), a quiz on any topic to play on its page, a book finder (Open
  Library), what's on in a city by day and on a map, a savings plan, your own spreadsheet or numbers as charts, a
  topic as a timeline (Wikipedia) and a place explored on a map in walking order, the kinds of place you name (dog parks, cafés, playgrounds) first from OpenStreetMap, then its best-known sights (Wikidata, Wikipedia). Many
  show pictures and videos of what they find, through find_media: each game's cover and trailer, each film's or show's
  trailer, each product, gift idea, news story and event, a picture for each day of a trip, a photo of the place to
  go. Each hands back its answer in a view of its own: pages of elements made for it (the Trip planner's timeline of days to tick
  off, a page for each day, a map of the days with each area looked up, a Good to know page with the weather, what is on and getting around, a list to book and a budget chart at the day's Frankfurter rate; Compare products' pick, and the products side by side with their scores on a chart;
  the news digest's stories by topic), with buttons that run it again with a change (a slower pace, one more day,
  a more formal letter, new questions about the same document) or start another app on part of it (research a
  story, a finding or a product). An app's view is part of it: elements (HTML templates its values fill, each
  with its own style), pages of them (tabs, and pages a click opens) and events (go to a page, tick something off
  and keep it with the run, set a filter, copy, open, ask its agent, run a flow, run it again with changed
  answers, start another app, keep a record), designed in its Edit's Design tab (seen with its latest run or a
  made-up answer, what to fix listed under it; asked of an agent, started from its answer, or changed as code)
  or by an agent, checked when it is saved, drawn in the pages' sandbox, shown on the run's page (Plain answer
  shows the card and tables), in its session and on its public page (where nothing reaches the app), and kept in
  its versions, its file and its folder. Views show media too: pictures (side by side, opening large), videos
  (files, YouTube, Vimeo) and sounds, maps of the places in an answer (Leaflet on OpenFreeMap's map, light or dark with the app; numbered and
  joined in order) and plots in 2D and 3D (Plotly: lines, stacked bars, areas, scatter, pies, histograms, boxes,
  heatmaps, 3D points, lines and surfaces); and widgets, elements drawn by a script of their own that imports
  npm packages at exact versions from jsDelivr (a 3D scene with three.js, a chart library, a game), reaching the
  app only through the view's events. An answer can hold pictures, videos and files (a media field, a picture
  column): what an agent hands in from this computer, a picture it found on the web or one it drew is kept as a
  copy, served at an address nobody can guess that never runs as a page of the app. An app has files of its own
  too (pictures, videos, data, added in its Design tab or by app_save), shown by name in its view and travelling
  in its file. An app names the keys it needs (API keys, tokens) and never their values: they are asked for on
  its form, on its install card or on its card in a session when an agent runs it, and kept in the vault, where
  its runs use them by name; a run without one does not start. Follow-ups refine a run's
  result, asked on its page or in its session, which opens on that result with a switch to the conversation.
  An app can also work in steps (an agent, a quick model answer, a tool, a decision by a rule or in words, a
  repeat over a list or until something holds, branches side by side, another app, its own data, a question
  to you that it waits for (a short form whose choices can be what the run found, to tick one or several),
  built-in values (today, now, the day of the week, the time zone where you are, what
  started the run), a program in JavaScript, TypeScript or Python in a sandbox, which can be the whole
  flow: its ctx calls to models, agents, tools, people, its data and other apps are steps of the run, kept
  and replayed after a restart, and values worked out at once and at no cost: the first, a count, a sum, a field
  of each, a join, a sort), each handing typed values to the next, laid out in its Edit (tabs for what it does, its
  form, its answer, examples and settings folded to a line each; what it does as one task, a list or a graph, which
  runs from the form and the built-in values at the top to the answer at the end; steps added from a short
  menu, values put in from the form and the steps before, checks shown as you go, and a graph of nodes and wires
  to build in on a computer: a step's settings beside it, a + on a wire, values wired by dragging from one step
  to another or into empty space for a new step, nodes placed by hand or laid out by Tidy, value wires bent where
  you double-click, groups with notes, full screen, and Try it there: steps lighting up as a test run goes, what
  each value's wire carried, pausing before a step to go on or take one step, and frozen steps that give what
  they gave in the last try; and Collapse to a block, steps that follow one another made an app of their own,
  called in their place, which other apps can call too; Add a step offers these blocks, yours and ready-made
  ones to sum up a page, translate, answer from the web, sort into kinds or pull out facts) or by an agent, shown
  step by step on the run's page, run again from any step there (the steps before it giving what they gave, also
  from a test run in its Edit) and resumed after a restart; keep records between runs that its steps, its agents
  and the API share (lists named in its Edit, with the fields their records hold); remember across runs in a
  memory of its own; and install the Node and Python packages it needs in a folder of its own. Examples (answers
  with checks on what a run gives) try it as it is on screen, each saying how its last try went. Each save that
  changes it is a version (who saved it, what changed, how its examples went with it), any of which can be
  brought back, and each run keeps the version it ran. An app can live as a folder of files too (app.json,
  each step's instructions, code steps as functions, its screens, with a schema for editors), changed in any
  editor or by a coding agent, each saved change coming back as a version. The command line's app commands make a
  app and its folder, try its examples as you save, and export and import it. Describe one on the New
  app page and the App builder assistant makes it. Save as an app turns a session that went well into one,
  with steps drafted from the tools it called (read a page, search the web) when they check out. Agents build
  apps with tools of their own: app_get, app_save (checked first; whole, a patch or one step; its view too),
  app_try (its examples or a set of answers, waited for, with the names its view uses that a try did not give),
  app_screen and app_data (the records it keeps: read, or added to). A
  app an agent saves opens beside its conversation, where what you change and save reaches the agent with
  your next message (its next save reads your version first). A tool, model, code, data or app step that fails
  can have an agent do its work, so the run goes on; Edit shows the steps that had to, with Ask an agent to fix
  it, and offers Firm it up for an agent step that did the same in each of its last runs: fixed steps in its
  place (the tools it called, with the values it called them with, then a model step), tried on its examples
  first, with what a run takes and costs either way. Beside a conversation, a step's menu has Ask the agent about
  it. Its steps, its agents and programs search its records by words and by meaning, as knowledge bases are
  searched. An app can have a screen of its own in place of its form: a page made from its parts (its form,
  its answer, a table for each list it keeps, its earlier runs) that runs it and changes as its records do,
  edited in the app's page editor (whose Add has an App tab with those parts) or by an agent, with buttons for its other
  flows and a conversation with its agent, who finds and changes its records and runs its flows for you (the
  latest conversation shows on return; earlier ones a click away). Apps travel as one file (.hydor-app or .json, with their records, screens, own files and the apps they
  call; the keys they need by name only), downloaded from an app's page or its card's More, the ready-made ones too (a ready-made app's file brings it
  back where it was uninstalled), and installed from New app or by dropping the file on the Apps page, after a card that says what they ask, give and do, in plain words, with the keys they need,
  then what they will use here (folded: their files, their view's scripts and libraries, models, packages), offering one of your models for any they ask for that is not set up here; uninstalling one deletes it.
- **Slides**: decks kept in a project's files, made by an agent (save_slides, from layouts or parts placed by position) or
  from eight ready-made looks, and edited as in PowerPoint, Google Slides or Keynote: menus (Edit, View, Insert,
  Format, Arrange, Slide, Tools) with Search the menus, slides to reorder, copy and skip, 15 layouts, text boxes with
  rich text, bullets and numbering, 20 shapes, pictures (cropped, with brightness, contrast, saturation, blur, black
  and white and see-through), lines and arrows, tables (merged cells, cell fills) and charts (column, bar, line, area,
  pie, doughnut), about 1,900 icons and emoji, equations in LaTeX (drawn without the internet wherever the deck shows),
  YouTube and Vimeo videos with their stills and videos from this device (up to 200 MB), connectors that stay joined to
  shapes as they move (straight or elbowed), comments on a slide or a part of it with replies that agents answer and
  resolve; groups (a part in one placed where it is on the slide), find and replace across slides, speaker notes,
  charts and equations, zoom, the format painter, a grid, rulers and guides, smart guides as in PowerPoint and Keynote (lines
  between the parts that line up, distances to the parts beside and the slide's edges, equal gaps, equal sizes, the place,
  size or angle by the pointer, every resize snapping, a turned part by the box it shows, Alt to move freely, Ctrl to drag
  a copy, View → Snap to parts and guides), alignment (with each other or the slide), stacking, lock, undo, copy and paste
  through the system clipboard (words, pictures), right-click menus on a part, the empty slide, a table's cell (rows and
  columns put in or taken out anywhere, merging, fills) and a slide in the list (several slides picked together); parts
  drawn on the slide at the size you drag (text boxes, shapes, lines), several parts sized and turned together; animations in order (on a click, with or after the one before, a
  paragraph at a time) and transitions, Morph among them (what two slides share glides into place); slide numbers
  and a footer; themes of colours and fonts; speaker notes; a slideshow (keys, swipes, black and white screens,
  every slide at once, a laser pointer, a pen and live captions) and a presenter's view with notes, the next slide,
  a timer and an audience window that follows it. They export as PowerPoint (every part still editable, native
  charts, groups, icons, equations, notes, transitions with Morph, animations, connectors still joined, videos that
  play and comments; looking in PowerPoint as here: the deck's fonts inside the file, compressed as PowerPoint keeps
  its own, words that wrap and fit the same, each layout one of PowerPoint's for New Slide and Reset Slide, the footer
  in its Header & Footer boxes, charts with their data for Edit Data), PDF, pictures of the slides
  (PNG) or a web page that presents itself, and open as a slideshow at their own address or a published link. PowerPoint files (.pptx) open as decks to edit,
  their layouts, text, pictures, tables, charts, groups, connectors, videos, notes and comments brought in.
  Decks are made for the web unless made PowerPoint compatible (Theme → Made for, or Tools → PowerPoint compatible,
  which first lists what changes, slide by slide; a deck opened from a .pptx starts so). The web format adds
  interactive parts (Insert → Interactive: custom code, a small web page of HTML, CSS and JavaScript in a sandboxed
  frame, from four starters or written by an agent; a web page or a site's embed code; quizzes and polls with what
  is said for each choice, and a quiz score; 3D shapes, words or your own .glb or .gltf models, with materials,
  lighting, turning and viewers turning them; and code shown coloured, in both formats), seventeen more effects
  (Typewriter, Count up, Draw the lines, Confetti burst…), started by a click on a part, word by word or letter by
  letter, kept going, with springs and bounces; cube, flip, dissolve, circle, blinds and glitch transitions; moving
  backgrounds and a video behind a slide; text effects, frosted glass and effects when the pointer is on a part;
  and a progress bar. Live parts run in the slideshow, the presenter's and audience's windows and the deck's own
  page, and show their picture in the editor until Run; the deck's web page is one small file with its fonts,
  pictures, 3D models and videos inside; its PowerPoint file has live parts as pictures of them running (a quiz as
  text boxes, its answer in the notes) and effects as PowerPoint's nearest, with a note of what changed. Pictures go
  in shapes (fourteen) or device frames (an instant photo, a phone, a laptop, a browser window); free photos come
  from Openverse (Wikimedia Commons when it cannot answer), their credits in the notes and a caption where the
  licence asks; QR codes; slides from another deck (their look kept or this deck's); charts from a kept
  spreadsheet that update from it; My themes (colours, fonts and a logo on every slide, also in New → Slides); a
  video's end as well as its start; and an eyedropper in the colour pickers. Design ideas lay the slide out anew
  from its own words, pictures and numbers (thirteen designs, by the helper model); Rewrite makes picked words
  shorter, longer, simpler, more formal, friendlier, correct or in another language; Animate every slide is
  Subtle, Lively or Striking; Check accessibility lists missing titles, reading order, pictures without a
  description (written with AI on request), low contrast, small words, videos with sound that start by themselves
  and tables without a header row, fixing what it can; Translate the slides asks the agent. Each slide may have a
  narration, recorded from its notes or made with AI (priced first), played by a narrated show that goes on by
  itself and kept in the PowerPoint file; Rehearse with coach times each slide, hears the pace, filler words (in six
  languages) and slides read out, and can give each slide its rehearsed time; Record a video records the slideshow
  with your voice and a camera bubble (Keep or Download); the camera bubble (V) shows in the
  slideshow, the presenter's view and the audience's window; and a phone opened from a QR code is the remote (next,
  back, any slide, a black screen, notes, a timer and the next slide).
- **Documents, spreadsheets and LaTeX**: kept in a project's files beside slides, each with versions, a picture in the list,
  its own address, menus with Search the menus, find and replace, a list of its keyboard shortcuts, and an agent that
  changes it on request, whose work you watch as it writes (slides too: the agent's caret where its words arrive, the
  page read-only meanwhile, your unsaved changes never overwritten), in steps (a section, some slides, some cells) as
  well as whole, its saves in one turn kept as one version. Documents (save_doc, written in Markdown, or opened from a Word, PDF (its title, headings, paragraphs and lists, two columns read in order, page numbers and running headers left out), Markdown, text or HTML file)
  are edited as in Word or Google Docs on real pages of their paper (what does not fit goes on to the next page, a long
  table's header row again, each page with its own header, footer and number): paragraph styles, fonts, sizes, colours and
  highlights, links, alignment, line and paragraph spacing, bullets, numbers and checklists, callouts, tables (column
  widths dragged, merged and coloured cells), pictures with captions, equations in LaTeX, a table of contents that
  keeps up, headers and footers with page numbers, lines and page breaks, a "/" menu and Markdown shortcuts as you
  type, blocks dragged by their handles (a click on the handle: turn into, duplicate, delete, move, comment, copy a link to a heading), a right-click menu for what is under the pointer (words, links, table cells with the rows and columns picked counted, pictures, comments, suggestions, footnotes and equations), words tidied as you type as in Google Docs (web addresses become links, curly quotes, dashes, signs, arrows, fractions; Undo takes back just that change; Tools turns them off), words dragged to move or copy them, the format painter and Ctrl+Alt+C / Ctrl+Alt+V for the look of words, size and indent keys, numbered lists in five formats (1. a. i. A. I.) that restart, continue or start at a number, paper in A4, Letter, Legal, A3 or A5 with a margin for each side (pages, print, PDF, Word and OpenDocument files, both ways with Word), the document's language (spell check, Word), special characters and emoji, comments with replies
  that agents read, answer and resolve (a Word file's keep their authors), Suggesting as Word's track changes and
  Google Docs' suggestions (accepted or rejected one by one or all at once, kept as Word's tracked changes both ways,
  and made by agents too), a comparison with any earlier version, paste from Word and Google Docs cleaned, an outline, zoom, a word count and
  printing, pictures, drawings and plots made with AI (Insert, "/", and a table's Make a plot of this table), free
  photos with their credit as the caption, a picked picture changed with AI (in words, its background taken out,
  part of it erased) or edited in the picture editor, Rewrite of the words picked, and a Section made with AI (an
  executive summary, a table of risks…); AI that writes with you, by the helper model: Write with AI at the caret
  (Ctrl+J, or Space on an empty line: a paragraph about…, continue writing, a summary of what is above, a conclusion,
  a list or a table of…; for words picked, explained, summed up or made a table), kept, tried again or discarded,
  a suggestion while suggesting; Proofread, a new tone or a translation of the whole document as suggestions by AI
  (a translation as a copy too); suggestions as you type (Tab takes them); and a panel that answers questions from the
  document with links to the passages they rest on; footnotes at the foot of their page, citations found by DOI,
  arXiv id or title in APA, MLA, Chicago or IEEE with a bibliography that keeps up, numbered captions of pictures,
  tables and equations with cross-references that keep up, bookmarks and links to headings and bookmarks, page setup
  (landscape, one to three columns, a page colour, a watermark of words or a picture), paragraph styles of the
  document's own (Update to match, Reset), voice typing with the app's dictation and reading aloud with the sentence
  marked; all of them kept in the PDF and the Word file as Word's own (footnotes, citations with their sources and the
  bibliography, captions, cross-references and bookmarks, sections, the page's colour, a watermark, styles) and read
  back from Word files, and done by agents too (save_doc, page_action); a picture, table or line put in from a table's
  cell goes after the table;
  they export as Word (styles, lists, tables, pictures, comments, tracked changes, equations, the table of
  contents and headers and footers as Word's own; laid out so Word's pages break where the editor's do, the
  document's fonts inside the file), OpenDocument for LibreOffice (its page, styles, lists, tables, pictures, footnotes and table of contents as LibreOffice's own), PDF on their paper, Markdown, EPUB (a chapter at each Heading 1, its footnotes, pictures and maths inside), plain text or a web page. Spreadsheets (save_sheet, with
  formulas, or opened from an Excel, ODS, CSV or TSV file) work as in Excel, Google Sheets or Airtable: a grid that
  stays quick with thousands of rows, frozen (up to any row: Freeze up to here) and hidden rows and columns, sizes to drag or typed exactly, a right-click menu on letters and numbers (resize, fit, freeze, group, move), nearly three hundred (290)
  of Excel's functions worked out as you type (lookups, criteria, SUBTOTAL, dates, text, loans and depreciation,
  the normal distribution, number systems, FILTER, SORT, UNIQUE and
  SEQUENCE that spill, and the newer ones: LET and LAMBDA with MAP, REDUCE, SCAN, BYROW and MAKEARRAY, VSTACK,
  HSTACK, TAKE, DROP, CHOOSECOLS, TOCOL and WRAPROWS, TEXTSPLIT, TEXTBEFORE and TEXTAFTER, regular expressions,
  TREND, LINEST, FORECAST and the statistics, Google Sheets' SPLIT, JOIN and ARRAYFORMULA, HYPERLINK, IMAGE and
  SPARKLINE drawn in the cell) with each function's arguments shown, named ranges (and named LAMBDAs) in formulas
  and the name box, references that move as cells are copied, filled, inserted and deleted, the fill handle with
  its series, number formats with Excel's own codes (and Excel's quick keys: Ctrl+Shift+1 to 6, $ and % buttons),
  AutoSum (Alt+= and a Σ button: sum, average, count, max, min),
  a format painter (a double click keeps it on), borders, merged cells, filters, sorting by several columns,
  conditional formatting (rules, colour scales, data bars), dropdowns with coloured chips, checkboxes, star ratings
  and a calendar for dates, links on cells, protected ranges and sheets that warn or refuse changes, groups of rows
  and columns folded with + and −, gridlines on or off, notes and comment threads that agents answer, charts (eleven
  kinds, combo, histogram, bubble and radar among them, with 100% stacking, trendlines, data labels, a second axis
  and the axis's limits) that sit on their cells and move with them, of one range or of several (Ctrl+click), Paste
  special, removing duplicates, splitting text into columns, summaries and a pivot table editor (rows, columns,
  values, filters) of formulas that keep up, Goal seek, Trace precedents and dependents, a row opened as a card,
  a Kanban board kept with its sheet (what it groups by, its cards' fields, its lanes' order), several sheets (tabs
  with colours, hidden sheets and drag to reorder, kept in Excel files), copy
  and paste with Excel, Google Sheets and web tables (their bold, italic, underline, colours, alignment and number
  formats come along; cells cut move for real: the formulas, names, charts and rules that used
  them follow), cells, rows and columns moved by dragging (Ctrl to copy; references follow), and the sum, average and
  count of what is picked. Compare with the version before (or any version, or See what changed under the agent's turn
  that changed it): the sheet with what changed marked in place (cells whose value or formula changed, number formats
  and looks alone, formulas whose results changed with them, rows and columns added and the ones removed where they
  were, tabs added, removed or renamed), the changes listed with what each was and is and a click to its cell, counts on
  top, rows lined up by a key column or by what they hold so a row put in marks only itself, Put back the version (a new
  version: nothing is lost) and Put this back on one cell, row, column or tab (a change to undo or save); agents get the
  same list in words (page_action compare). Find and replace with regular expressions, within the cells picked or across sheets; a list of every
  function with its help (Insert → Function → All functions…); Ctrl+wheel to zoom; Ctrl+P for the print setup; an
  Excel, ODS, CSV or TSV file dropped on the editor adds its sheets. AI in them uses the
  helper model, saying what it costs: the AI function (=AI(prompt, cells…), as Google Sheets has it: each answer
  worked out once and kept with the sheet, cells asked together, asked again only when they change or with
  Refresh, never just by opening the sheet), Write a formula from words, Explain this formula, Fill with AI
  (Ctrl+E: a pattern found in a few examples, for nothing, else the helper model), Analyze the data (questions
  answered, charts and pivot tables put in with a click), Clean up the data (spaces, numbers and dates kept as
  words, different spellings, duplicate and empty rows, each fixed with a click, for nothing) and a table made
  with AI. They print and export as PDF with their own setup (orientation, fitting, a print area, header rows
  repeated on each page, gridlines), and as Excel (formulas, the newer functions as Excel writes them, formats,
  filters, conditional formatting, dropdowns and checkboxes, long lists of options among them, merged cells, groups,
  named ranges, links, a sheet's protection, notes, threaded comments, the print setup and charts on their cells
  kept, with the editor's column widths and row heights) or CSV. LaTeX documents (save_latex, from nine templates, a conference
  paper as IEEE, ACM or Springer LNCS ask among them, or opened from a .tex file or a project's .zip) keep their source files and pictures, typeset on this computer (pdfLaTeX, XeLaTeX
  or LuaLaTeX, with BibTeX) as you type, beside the pages: a Visual mode that shows the source as a document while
  you type, formulas drawn as you write them, completion of commands, environments, packages, citations, labels and
  pictures, a symbols panel, tables made in a grid, references found by DOI, arXiv id or title, folding, spelling,
  the engine under Recompile's arrow (Typeset with) and Recompile beside the pages' zoom, giving way as that side narrows,
  quick checks before TeX runs, errors and warnings at their lines, the log, an outline, snippets, a word count,
  comments agents answer (on .tex files opened from Files too), Track changes as in Overleaf (an agent's
  edits too, each accepted or rejected), versions compared, dark pages, the pages presented full screen, and a jump between a place
  on a page and its line; Find in the typeset pages (the matches marked, each taking the source to its line) and words picked on
  a page going to their place in the source; right-click menus in the source and on the pages; Go to definition (Ctrl+click or F12 on a
  \ref, \cite, \input or \includegraphics name); citation and label completions that say who wrote it and what it is ("Knuth 1984 — The
  TeXbook", "Figure: The model"); Find and replace in every file of the document (regular expressions, one change); editor settings (text
  size, line wrap, line numbers); Vim and Emacs keys; Tidy the source (environments indented, table columns lined
  up at &); labels and citation keys that point nowhere marked as you type; Draft (pictures as boxes), Stop on the first
  error, Clear the cached files and the time each typesetting took; named versions ("Sent to ICML", kept past the newest
  40); and Tidy the bibliography (sorted, duplicates merged, keys fixed, fields filled from DOIs, unused entries out).
  With AI, outside any session: Rewrite the words picked (shorter, clearer, more academic, grammar, translated, as you
  say) with every command, formula, key and comment checked kept, as a change to accept (by AI while Track changes is
  on); Write with AI at the cursor (Ctrl+K: an equation, a table, an algorithm, a TikZ figure, a paragraph, the packages
  it needs said first); LaTeX from a pasted or dropped picture of an equation or a table (or the picture as a figure
  under figures/); Explain and Fix beside each error; Find a citation for this (papers from OpenAlex and arXiv judged
  against their abstracts, Cite adding the BibTeX and the \cite); and Proofread, as a list or as tracked changes by AI.
  Agents tidy a document's source and bibliography with page_action. TeX runs in a folder of its own, with no shell escape and, where bubblewrap is installed,
  in its sandbox. They export as the PDF, the main .tex file or the whole project as a .zip. Jupyter notebooks
  (save_notebook, from an .ipynb an agent wrote and ran, or opened from one) show in the notebook page's own view,
  with their outputs: cells edited and run in a kernel of the Python environment picked, in a folder of their own in
  the app's data folder, Ask on the whole notebook or a cell, and versions with their outputs; right-click menus on cells
  (run it, the cells above or below it, copy, cut, paste, duplicate, split, merge, clear or fold an output), cells picked
  together, an outline of the Markdown headings, a shortcuts list, and a run asked while the kernel starts waiting for it; they export as the
  .ipynb, a Python script with # %% cells, a PDF or a web page.
- **Resolve comments with AI**: comment on words as you read (a part of a slide, a cell, a block), then Resolve with AI on
  one comment, Resolve N comments with AI at the top of the comments for all the open ones (a LaTeX document's every
  file, a spreadsheet's sheet), or Ask AI (Ctrl+Shift+Enter) as a new one is written: an agent gets them at once, nothing
  to type, makes the change each asks for, and in the same save replies saying what it changed and resolves it (a
  question gets an answer and stays open, and so does one it cannot do, with why); meanwhile each says "AI is working on
  this" and the top counts them. In documents, LaTeX documents (and .tex files opened from Files), slides, spreadsheets
  and pages, through the Ask panel (going on with its conversation, after its turn while the agent works), the
  conversation a page is beside, or Files' Ask panel; a document being suggested gets the agent's changes as
  suggestions, a LaTeX document with Track changes on as tracked changes. The LaTeX source shows Comment over the words
  picked, as documents do.
- **Pictures, drawings, plots and videos in the editors**: slides, documents and pages make them where you put one
  in (Insert → Picture, "/", a page's picture and cover, a slide's background, a table's or a chart's Make a plot of
  this), each in a dialog that shows the price before anything is spent and the result before it is used, a sheet on
  a phone. A picture: what it is for (a picture, photo, illustration, background, icon, diagram, texture or logo,
  each asked for in its own way), a look, a shape, Quick or Best (Auto picks by what is asked), how many, a
  see-through background, a deck's colours, a picked picture to follow. A change: in words (everywhere, or only
  where you paint), the background taken out, or part of it erased with a brush, shown before and after, with Do it
  with AI instead under a result made on this computer. A drawing (SVG): what it is, its shape and colours, Quick
  (written by Claude or the helper model, free) or Best (Recraft's vector model). A plot: its data from the table or
  the chart it comes from, a file or pasted, its Python written by the same writer and run on this computer, changed
  in words or by editing its code (Run again), and in a web deck also a Plotly version that answers the pointer. A
  video (slides): its length, shape, sound and a picture to start from, its price range first, made while you work
  on (a note with Insert when it is done). Without an OpenRouter key the dialog asks for one in place, with Skip and
  a way that needs none (a drawing instead, or Quick). Settings → Images, video and audio has the Best and Quick
  models and the picture tools on this computer (Set up, what they are doing, Remove).
- **The picture and video editors**: pictures and videos open in editors of their own, in tabs inside the app (the
  page you came from first, a dot on a tab with changes not saved, Open editors on a phone), from a picture shown
  large (Edit), the picture and video pages, Files (Edit, and Edit the picture or Edit the video in a
  file's menu), slides (Edit picture, Edit video), documents (Edit picture), pages (Edit picture on a picked picture's
  bar and in its Part tab, Edit video), designs (Edit picture, Edit video) and an agent's video. The picture editor is
  laid out as Photoshop is (menus with their keys, the tool's options, a rail of tools in groups, dockable panels, a
  status bar; on a phone, tools along the bottom and panels in a sheet) and works in layers: pixel layers, words and
  shapes, and adjustment layers, each shown or hidden, locked, renamed, reordered by dragging, with sixteen blend
  modes and an opacity; duplicate, layer via copy or cut, merge down, merge visible, flatten, free transform (move,
  size, turn); a layer snaps to the canvas's edges and middle, the guides and the other layers while it is moved
  (thin pink lines, gaps in small pills; Shift straight, Ctrl drags a copy, Alt no snap; View → Snap) and Align puts it
  at the canvas's left, centre, right, top, middle or bottom; right-click menus on the picture and on each layer (and a
  touch held still); File → New (and a project's Files → New → Picture, which saves it in that project) makes a
  blank picture (Square post, Story, HD, A4 at 300 dpi or any size; white, see-through or a colour). Selections (rectangle, ellipse, lasso, polygon lasso, magic wand, the subject found by AI,
  all, invert, feather, grow, shrink; marching ants; dragged to move, Transform selection to size and turn) keep painting, fills, adjustments and the AI tools inside them, and cut, copy
  and paste to new layers. Painting and retouching: brush, eraser, clone stamp, spot healing brush, gradient, paint
  bucket, dodge and burn, eyedropper, foreground and background colours; brushes draw a straight line with Shift+click,
  take a colour with Alt+click, change hardness with { and }, opacity with the number keys, and size and flow with a pen's
  pressure. The zoom in the status bar opens a list (fit, 25 to 400%) and takes a size typed in. Adjustments on layers: light and colour,
  curves, levels, hue, saturation and lightness by colour range, colour balance, clarity, dehaze, sharpness, noise
  reduction, blur, vignette, grain, invert, posterize, threshold, thirteen looks and Auto enhance, with a live
  histogram. Crop (eight shapes, straighten, turns, mirror), crop to the selection, image size and canvas size,
  rulers, guides and a grid, history with every step by name, Photoshop's keys (a list in Edit → Keyboard shortcuts),
  words in seventy fonts (the app's, Google's and the computer's own where the browser allows) with bold, italic,
  alignment, line height, an outline and a shadow, the same when an agent edits a picture; pictures added as layers (a file, your kept pictures, the clipboard, dropped). Its AI: remove the background, erase, change
  with AI (a new layer, inside the selection), expand, make it 2× or 4× larger and select the subject, free on this
  computer where the picture tools can do it. It saves at a size and as PNG, JPEG or WebP, over the original (the old
  file to the Trash) or as a copy, and exports to this device. The video editor is laid out as a professional one (a
  menu bar with shortcuts, the workspaces Edit, Colour, Audio and Export, panels sized and remembered): a media panel
  (videos, pictures and sounds from this device, your kept things or Files, a voice-over recorded), a WebGL viewer
  (timecode, In and Out, safe areas and a grid, J/K/L), an inspector, and a multi-track timeline (T1 words, V3 and V2
  overlays, V1 clips with transitions, A1 their sound with its shape, A2 music, A3 voice; show, mute, solo, lock;
  Select, Blade, Trim and Hand tools, snapping by a part's start or end, markers with a menu, right-click menus built
  from the menu bar's own lists, several things picked at once with a box or Shift/Ctrl-click and moved, cut and
  deleted together, cut, copy, paste, duplicate and paste attributes, trim to the playhead and jump between cuts,
  files dropped from the desktop onto the panel or a track, a list of keyboard shortcuts; the viewer's pink guides
  while words or an overlay are moved or sized, Shift/Alt/Ctrl while dragging; locked tracks left alone by every
  command). Clips have their own part, speed (pitch
  kept or not), backwards, steadied, held frames, crop and turn, fitted or filling the output's shape (16:9, 9:16,
  1:1, 4:5), a picture's slow zoom and pan, their own sound or another in its place, unlinked (J and L cuts) and
  linked again; every sound (clips' own, music, voice-over) with its shape, trimmed, cut, silenced in parts, faded by
  handles (crossfades where two overlap), a volume line to click and drag, its channels (left or right only, one side
  on both, mono, swapped: a lapel microphone) and its own clean-up, evening out and normalizing, the sound editor for
  the rest; fourteen transitions; overlays placed, sized, see-through, keyed (green screen) and faded; words and
  captions made from what is said (whisper.cpp here) or imported from .srt and .vtt files, in five styles, saved as .srt or .vtt. Colour as Resolve's Color page:
  wheels (lift, gamma, gain, offset), primaries, curves, twelve looks, vignette, sharpen, denoise, grain, before and
  after, and scopes (waveform, vectorscope, histogram), the preview exactly as made (one 3D table for the browser and
  ffmpeg). Audio: a mixer (levels, meters, pan, mute, solo) and quick fixes (clean up voices, even out the loudness,
  lower the music under speech, fade the music). Export: ready-made settings (YouTube, Reels and TikTok, square and
  portrait posts), MP4, MOV, WebM or GIF, H.264, H.265 or AV1, size, frames a second, quality, In to Out, with
  progress and time left. Made with ffmpeg here (the picture tools bring one), on the graphics card when there is one
  that works (NVENC, VA-API, Quick Sync, VideoToolbox, AMF, Media Foundation; Settings → Images, video and audio), the
  processor taking over at once if it fails. Agents have edit_image and edit_video.
- **The sound editor**: sounds open in an editor of their own, in a tab like the others ("Sound · its name"), laid
  out as Audition or Audacity lay theirs: menus (File, Edit, Effects, Generate, View, Help, with their shortcuts, and a list of every key in Help), a
  transport (play, stop, record, loop, the time, the part picked to type or drag, snapping, zoom, a meter of peaks
  and loudness), the tracks as lanes (a header each with mute, solo, record, volume and pan; stereo waveforms or a
  spectrogram; clips to move, trim, fade by their handles and drag a copy of; a volume line on a clip with points to
  add, drag and remove, heard as it is saved; straight or smooth fades; a ruler with markers; zoom along and up;
  right-click menus, a long press on a phone, on a clip, the part picked, a lane, the ruler and a marker; sounds and
  videos dropped on a track or a new one), a dock of
  panels that fold and size (Effects, Properties, History, AI) and a status line. Edges snap to clips, markers, the
  playhead and a time grid (seconds, or beats at a tempo), and a part's edges and splits to the nearest zero
  crossing; J, K and L shuttle backwards and forwards at up to four times; a deletion or paste on some tracks keeps
  every track and the markers in step (as Audacity's sync-lock), or ripples all with Ripple delete. Moving an
  effect's slider while playing changes the running sound without a break. It opens MP3, WAV, M4A, AAC, OGG,
  Opus, FLAC and WebM sounds, and the sound of a video, from your kept sounds (Edit; a video's Edit its sound), Files
  (Edit, Edit the sound or Edit its sound in a file's menu) and a sound an agent made (Edit). Edits: cut, copy,
  paste (between sound editors too), delete (closing the gap) or silence, duplicate, split, trim to the part picked,
  insert silence, change speed with the pitch kept, shorten long pauses; tracks to mix in a kept sound, one from
  the device, a recording (record at the playhead, on an armed track or a new one) or music, a voice or a sound
  effect made with AI (its price first, the OpenRouter key asked for in place). Effects in a rack, each a card with
  its settings and presets, on and off, in order, on a track or the whole sound, on all of it or a part: volume,
  fades, normalize, loudness (podcast −16 LUFS, streaming −14, broadcast −23), noise reduction, equalizer (Clearer
  voice, Telephone, Radio and more), high- and low-pass, compressor, limiter, pitch, reverse, echo, reverb (four
  rooms, the same in the browser and in the file) and mono, heard as you edit. Speech recognition on this computer
  shows the words under the waveform, to cut by the word and to take out filler words. Undo and History go back any
  step. Saved with ffmpeg as MP3, M4A, Ogg Opus, WAV or FLAC (quality, bits, mono or stereo, sample rate), over the
  original (the old file to the Trash), kept in its place, or as a copy; a video's sound keeps the video's
  length (a deletion leaves silence) and goes back to the video. Agents have edit_audio.
- **Designs, as in Canva or Adobe Express**: New → Design makes a poster (A4, A3, US Letter, 18 × 24 in), a flyer, an
  Instagram post (square or portrait), a story, reel or TikTok, a Facebook post or cover, an X post, a LinkedIn
  banner, a YouTube thumbnail or banner, an invitation, a business card, a certificate, a menu, a postcard, a logo or
  any size in pixels, millimetres or inches, from 22 ready-made designs drawn for its size (with words and picture
  places to replace, in their own colours, your theme's, your brand's or a palette's), blank, or described for an
  agent (19 design kinds). Still a kept page (versions, its own address fitted to the screen, publishing),
  of one or several fixed-size artboards. Its editor places anything anywhere: drag with smart guides that snap to
  the page's edges and middle and to every other part (those inside groups too; equal gaps and the distance to the
  nearest part on each side shown in small pink pills), resize by handles that snap to the other parts' edges and
  middles or to their width and height (an "=" shows, and a size pill; Shift keeps proportions), Ctrl-drag a copy,
  Alt-drag without snapping (⌥ and ⌘ on a Mac), turn, nudge with the arrows, pick several (Shift+click, a box; a pick
  with locked parts moves the rest), group and ungroup, line up (with each other or with the page) and spread out,
  bring forward and send back, lock, duplicate, copy and paste the look, flip, see-through, zoom from 25% to 400% or to
  what is picked (Shift+2), pan with Space and a drag, words pasted from elsewhere become a text box, a right-click
  menu with every action, a list of every key (Ctrl+/), Layers (the page's parts front to back, groups with what
  they hold: click to pick, drag to reorder, hide, lock, rename; Ctrl+Shift+H hides), pages to add, move and
  duplicate, undo of every step. It adds words (heading, subheading, body, twelve font pairings, 54 Google fonts),
  shapes (27 and boxes), lines and arrows, frames for pictures (14 shapes), stickers, icons and emoji, QR codes, collages, pictures from this device, your kept pictures, free photos or made with AI, drawings, videos
  (from this device, your kept videos or made with AI, moving and silent or with controls) and backgrounds (colours,
  gradients, patterns, a picture, one made with AI). Words get effects (shadow, lift, hollow, outline, glow, neon,
  echo, splice, gradient), a highlight, a curve, spacing and capitals, and new words written by the helper model;
  pictures get frames, crop inside their frame, ten looks, brightness, contrast, saturation and blur, corners,
  borders and shadows, Edit picture, and changes with AI. A brand kit (colours, chosen or read from a picture or
  suggested from a mood, a heading and a body font, logos) is offered first and put on a whole design in a click;
  Resize makes a copy at another size, its parts placed to fit (Magic resize); Download makes a PNG (see-through if
  you like), a JPG at 1×, 2× or 3×, or a PDF to print at its own size. Agents make designs with save_page
  (how_to_make "design" says how, with the brand kit) and export them with export_page.
- **Diagrams, as in draw.io, Lucidchart or Visio**: New → Diagram (or save_diagram) makes a flowchart, an org chart,
  a mind map, a swimlane process, an architecture or network diagram, UML classes, an ER diagram, a sequence diagram,
  a timeline, a kanban board or a brainstorm: drawn on a blank page, opened from a draw.io file (.drawio, a draw.io
  SVG or PNG, compressed pages too) or Mermaid, or described for an agent (19 diagram kinds). A model of pages of shapes
  and connectors, drawn by one renderer for the editor, the viewer, the kept picture and every file. 75 kinds of
  shape (general, flowchart, containers, UML, ER, BPMN, block arrows, sticky notes, pictures, and icons from Lucide's
  library for network and cloud), connectors at right angles that keep clear of the shapes they join and of shapes in
  the way, straight or curved, fixed to a point of a shape or to the side that faces the other, with seventeen ends
  (crow's feet too), words in the middle and near each end, rounded bends and flowing dashes. The editor: a searchable
  shapes panel (click, or drag onto the page or into a container), draw.io's blue arrows (a shape like it, joined, in a
  click; a connector to another shape in a drag; Tab adds a connected shape to the right, Shift+Tab below), handles to
  size and turn (one shape, or several together by the frame round them), smart guides (thin pink lines, equal gaps, the distance to the nearest shape, "=" for the same width or
  height, a size pill; the same while sizing) and a grid to snap to, Ctrl-drag a copy, Alt-drag without snapping, a
  connector's ends, runs, points and words dragged, words typed in place (or over a picked shape), rows of classes and
  tables, a format panel (sixteen ready-made looks, fill, gradient, line, dashes, corners, opacity, shadow, drawn by
  hand, fonts, alignment, where words go, kind of shape, links and notes, position, turn, flip, order, align, space out,
  same size, group, lock, copy and paste a style), picture files dropped from the desktop, automatic layouts (layers
  down or across with few crossings and long edges between, trees, mind maps, rings, circles, grids; swimlanes stay lanes; containers grow round what they hold), pages as tabs, menus
  with their keys, a right-click menu with the same actions (order, align, lock, a connector's course, swap the ends,
  copy and paste a style), a double-click to add a shape, find and replace, copy and paste between
  diagrams and windows (draw.io's shapes, Mermaid, pictures and words pasted become what they are), undo, light and
  dark themes, and, while an agent writes one, the diagram growing on the page. It exports as PNG, SVG, PDF (each
  page its own size), a draw.io file and a web page to pan and zoom; Download as a picture saves a page or what is
  picked at 1× to 4×, see-through or dark, and Copy as a picture. Agents draw with save_diagram (nodes and edges laid
  out by the app, Mermaid, the model itself, or changes by id: change, add, remove, layout), read one with get_page,
  lay it out again or restyle it with page_action, and export it with export_page.
- **Boards of answer cards**: New → Board (or a card's … → Pin to a board → New board…, or save_board) keeps answer cards
  together in a grid, each drawn by the same view as in a reply (light and dark, phone and computer): twelve columns on a
  computer where S, M, L and Wide span 3, 4, 6 and 12, six on a narrower window, one on a phone. Each card keeps its UI's
  name and its data as the ```ui block held it (inline, or a reference it reads from), a title (its own, or changed), a
  size, its place, when it was pinned and where from (a conversation's reply, opened there; an app run; a scheduled task),
  and how it refreshes. A title the card draws as its own heading shows once. On hover (a tap on a phone): Size, Full screen
  and … (Refresh now, Keep it up to date…, Rename, Move up and down, Save as picture, Open the conversation, Remove with
  Undo); a drag by its handle moves it on a computer. Each change
  is a version (a change made over a newer one, an agent's, is made again on it); the whole board saves as a PNG as it
  shows; Export gives its cards' titles and data as a PDF, Markdown or a web page, and its picture when kept is a
  drawing of its tiles. Shared, a board is read only, its cards drawn in the person's browser (their web pictures
  through the app, only those the board holds; cards that read a spreadsheet or a data file through the link's own route,
  the owner's source read for them, only those its cards name; refreshed cards with their latest data, which guests
  cannot refresh). Agents make and change boards with save_board (cards checked against
  their UI's type as find_ui gives it, refused with a plain reason; add by id or by name, a new one for a name there is
  not; change, remove, order; set or stop a card's refresh), read them with get_page (with what refreshes when, what it
  costs and how the last went) and export them with export_page; `hydor files show` lists a
  board's cards, `hydor files export` makes its files, `hydor files refreshes` lists what refreshes on every board
  and `hydor files refresh` refreshes a card or a whole board now.
- **Board cards that keep themselves up to date**: a card's … → Keep it up to date… asks an agent its question again (the
  request it was pinned from, editable, or one you write) when you ask, every hour, every day, on weekdays or every week
  at a time in your time zone (the scheduler's own schedules), on a tier (Quick unless picked), saying first about what a
  refresh and a month cost (from the card's own refreshes, else refreshes on that tier, else the tier's model's price).
  Each refresh is a session of its own, clearly a board refresh, archived, sending nothing (calls that act outside are
  held as "would have sent", as in a test that sends nothing), quiet; its answer must be a ```ui block of the same UI
  whose data fits its type, which replaces the card's data in a new version of the board (nothing else changes; several
  close together are one version), with when and what it cost. A card's line says "Updated 07:00 · ≈$0.04 · every day at
  07:00", Updating… while one runs; Refresh now, Try again, Stop refreshing, and Refresh all for the board. A refresh that
  fails keeps the last good data and says "Could not update:" and why; three in a row pause the card's schedule, with one
  notice, and one that works turns it on again. Each board has a monthly cap for its refreshes ($5 unless changed, or
  off), counted from its refresh sessions' spending as agents' monthly budgets are, each refresh capped at what is left;
  once reached, refreshes wait for the next month, the board says so at the top and you get one notice. Refreshes show
  in Schedules as the board's, with their runs, costs and a pause switch, and in Settings → Scheduled tasks and `hydor
  tasks` as "Shop · Sales by day: refresh", changed on the board (Open the board), never through the task form; a card
  taken off, a refresh stopped or a board deleted takes its schedule away. A copy never starts spending by itself: a
  board made from cards that refresh (Duplicate, page_action's duplicate, one made through the API, an agent's board
  made from another's cards) keeps their settings paused, says so at the top, and Turn all on (which shows what they
  come to a month first) or a card's own settings turn them on.
- **Made with AI from a kind**: 254 kinds the app knows how to make well (56 slides, 29 decks, 43 documents, 19
  sections, 39 pages, 17 blocks of a page, 13 spreadsheets, 19 designs, 19 diagrams), in a gallery with a find box and chips by group: Insert
  → Slide made with AI (and a slide's own menu, A slide made with AI after it), Insert → Section made with AI, Add a
  block made with AI, the kinds under New's box and More kinds (then Make it with AI, or Make it yourself), and Turn it into in a
  kept thing's menu (slides, a document, a page or a diagram from what you have). Say what it is about, and an agent makes it from what
  is there, as you watch; web-only slides are marked Web format in a deck made for PowerPoint. Agents read the same
  instructions with how_to_make (free) before they make a known kind of thing by name.
- **Skills**: every skill agents can use on one page (Settings → Skills), grouped by what it is for: more than
  sixty that come with the app for every agent (ways of working, writing, documents, research and the web,
  planning, data, design and pictures, coding, AI models, this app), yours, those your plugins bring, Claude
  Code's and Codex's own, and each project's own. A search, a row of filters and a switch on every skill, for
  every session (a project can switch any skill the other way for its own sessions, and the row says so: "Off in
  Thesis"); write your own for every agent or for one, copy the ones you made in other agents (Memory → Bring in…), change a built-in one (your version takes its place),
  remove and bring back. Agents propose new skills or fixes to them, saved only when you approve, in the library or, in a project,
  for the project alone. Other ACP agents get the list of skills to read when one fits; Custom's instructions name them by group, and it can find one by what the work is. A new session's agent
  hears which skills fit its first message, found by words and by meaning, when any clearly do.
- **Plugins** for every agent (Settings → Plugins): skills, tool servers (MCP), instructions, files of their own
  and what they need (other plugins, Python and Node packages in an environment of their own, programs, files to
  download, keys from the vault), in the open Agent Plugins 1.0 format (Claude Code's layout read too). Eight come
  with the app (Audio and video, Ebooks, Library docs, Meeting recordings, Python for data, Speech to text, SQLite
  databases, Text from pictures); add others from a Git link, a .zip or a folder, after a look at what each gives
  and needs, with the plugins it needs added first and turned on and off together. Make your own in an editor
  (skills, tools, needs, files, instructions), or have an agent make one, and pack it into a .zip to share.
  Claude Code's and Codex's own plugins and marketplaces have a tab each.
- **Voice**: dictate into the message box, with the browser's own recognition or, when you turn it on, a model
  on this machine (whisper.cpp, on its GPU when it has one: Metal on a Mac, CUDA on an NVIDIA GPU, built for it in
  the background; else, or when the GPU fails, on the processor); replies can be read aloud. Hands-free mode (the
  headphones by the message box) is for walking: say what you want, and it starts, steers and checks sessions,
  answers approvals and reads you the results, telling you when the session it follows finishes or needs you.
- **Your language**: the app in English, German, Spanish, French, Brazilian Portuguese, Greek, Japanese or Chinese
  (Simplified) (Settings → General → Language), and the guide too, with dates and times written that way and
  notifications in it too, and agents write to you in it. At first the app follows the browser's language. Translations
  live in `web/src/i18n`: `npm run i18n:extract` lists every string, the server's messages and what ships with
  the app (skills, connections, search providers) included, and `npm run i18n:translate` translates what is new.
- **Model arena**: under Options (start page only: it sends the first message to the other models), send the same prompt to one or two more models; their answers show side by
  side, you keep the best one and the others are archived. Usage → Arena shows which models win on your own
  tasks, as a rating over the matches you decided.
- **A second opinion, and caps**: one click has another company's model check a turn's work against what you
  asked; a spending cap stops a session, or a scheduled task's run, at its limit, checked after each model call.

## For researchers

- **Keep up with your field** (ready-made apps under Apps → Research, each on its own page with Update automatically):
  **Paper radar** (each morning, new arXiv and OpenAlex papers in your fields, on your topics and by the people you
  follow, ranked against your projects with the local embedding model, each with why it matters to you; Save, Cite as
  BibTeX, Dig deeper, Not for me, which steer the next days), **Citation alerts** (who cited your papers, with the citing
  sentence, and whether it builds on, compares with or disputes your work; it says when the sentences could not be read and
  tries them again at the next update), **New-model watch** (new Hugging Face
  models of a task, checked against your limits and run on your own evaluation through Experiments; you hear only of
  those that beat your best), **Deadline radar** (your venues' deadlines from ccfddl and ai-deadlines, from AoE into your
  time zone, with reminders, page limits and templates; a venue neither list has is looked up on its website), **Living related work** (a page per topic that grows as papers
  appear, in themes, with a LaTeX related-work draft, its cite keys checked, and BibTeX) and **Gap finder** (project ideas from your papers and
  this month's, each checked for prior work and sized to your compute).
- **Read and organise papers**: a **Reading list** by project, kept in step with Zotero both ways (add by DOI, arXiv id,
  link or title; import and export .bib; status, tags, notes and a page per paper); a **Literature matrix** that reads up
  to 30 papers into a kept spreadsheet, each cell citing its page; **Reproduce a paper** (finds the code, builds a clean
  environment, sends long runs to Experiments, and compares each number with the paper's). A paper is found however
  it is given (DOI, arXiv id, link, title, PDF, .tex, a LaTeX project or a kept document), from open copies only.
- **Read and highlight PDFs** (Files → a PDF → Highlight): the app's own reader, the words in reading order (two columns
  too) to select; highlight passages, equations and figures in four colours, write notes beside them, copy them, and ask
  an agent about the exact part you picked. Notes are kept beside the file, follow it when it moves, and are found again
  by their words when the PDF changes; **Keep in a project** makes them one document of a project's knowledge, updated
  as you go, and **Save into the PDF** writes them as its own annotations. Agents read them with pdf_notes.
- **LaTeX projects as a tree**: a document's files beside its source on the left (the main file first, folders, the
  order the document reads them), with what it doesn't use set apart under Not used and what TeX takes from a folder
  shown read-only; new files, folders and pictures go where you say, and renaming or dragging a file keeps its
  \input and \includegraphics right. A chapter opened from Files opens with its document's tree.
- **Check a paper before you submit** (LaTeX editor → Tools → Check before submitting): pick the venue (ACL Rolling
  Review, SIGIR, CIKM, WSDM, TheWebConf, KDD, NeurIPS, ICLR, ICML, AAAI, journals, Other) and it checks every citation
  against the bibliography and online (Crossref, arXiv, OpenAlex, Semantic Scholar: does it exist, are the authors,
  year and venue right, has a preprint been published since), anonymity leaks, pages against the limit, Type 3 fonts,
  template changes, TODOs and the venue's required parts, and in tables the bold on the best values and the numbers
  Experiments put there, worked out again from their runs. Safe fixes in one click, the rest asked of the agent; findings
  go on their lines as comments. Agents run it with latex_check. **Export → arXiv package (.zip)** strips comments
  safely, keeps the files the paper uses, adds the .bbl and typesets the package to see it builds; **Tools → Your
  paper** asks the agent to make it camera-ready or move it to another template.
- **Review, answer and present**: a **Reviewer simulator** on a venue's own review form (1 to 5 reviewers, a meta-review,
  the weaknesses ranked by how likely each sinks the paper, the baselines and ablations reviewers will ask for), a
  **Rebuttal workbench** (points grouped across reviews and sorted, replies drafted within the limit, experiments to tick
  off), **Paper to talk, poster and thread** (timed slides with the paper's own figures and notes, an A0 LaTeX poster,
  posts for X, Bluesky and LinkedIn, a project page) and a **Figure doctor** (column width, the paper's font,
  colour-blind-safe colours, embedded fonts, one style file). The LaTeX editor opens them with your paper filled in.
- **Experiments** (System → Experiments): jobs wait for a GPU with enough free memory on any of your machines (or a
  SLURM cluster's queue over SSH), run in tmux and are kept as records: the commit and its changes, hyperparameters,
  seed, environment, log and metrics (what it prints again and again drawn as curves, the most telling first; what it
  prints once kept as values), and how far a run has got with about how long is left. The page has a column at the left
  (the queue, this computer's GPUs, **Find an experiment**, and the experiments by category) and an **Overview**:
  **Running now**, **Experiments** as cards and the **Latest runs**. Every experiment has a **title, a short
  description and a category**, written by the helper model soon after its first run (and again when it has twice
  the runs), by an agent that starts runs (experiment_describe) or by you (**Edit the title and description**), and
  found by the search box and **Find an experiment**. An experiment's page has three tabs: **Runs**, a table with a
  column per metric and per hyperparameter you choose (sortable, with the best of each column in bold, **Find a run**,
  **Filter**, **Columns**); **Charts**, a chart per metric over steps in sections (dev, train, Metrics, Other), up
  to 8 runs at once each keeping its colour, with **Smoothing**, a choice of X axis, a log scale, **Ignore
  outliers**, a drag to zoom and a bigger view with the numbers; and **Hyperparameters**, the best run, parallel
  coordinates, **Which hyperparameters matter** (ρ and η, a correlation, not proof) and each hyperparameter against a
  metric. A run's page has **Overview** (key metrics with their curves, hyperparameters, values, details, code,
  command, environment and what happened), **Charts** and **Log**. **Compare** puts the picked runs' metrics,
  hyperparameters (**Only what differs**) and charts side by side. An agent on call wakes on NaN, out of memory, a
  stall, a crash or divergence, and tells you or acts within your rules. Sweep hyperparameters (every combination or a
  random sample, losing runs stopped early; a sweep is one experiment, and its notice opens its Hyperparameters tab),
  and make **results tables** (mean ± std over seeds, the best in bold, paired or Welch tests with Holm's correction as
  daggers) as LaTeX, Markdown or CSV, or straight into a LaTeX document you kept. Agents use it with experiment_run,
  experiment_sweep, experiment_list, experiment_get, experiment_stop, experiment_table and experiment_describe.
- **The lab's work** (Apps → Lab and Work): an **Annotation workbench** (you and a model label the same sample, the
  model's label hidden until you give yours; disagreements, Cohen's κ and a confusion matrix; publish on Hugging Face
  with a dataset card), a **Research sprint** (hypotheses, code on its own branch, runs in Experiments, an analysis
  notebook and a report, with you approving each step), a **Sweep planner** (a sweep fitted to a budget of runs or GPU
  hours, reading the script only when the form leaves settings or a run's time open, and how much each setting mattered), a **Weekly progress report** for your advisor, team or manager, and a
  **Lab notebook** with a dated entry for each day you worked, kept apart from memory and searchable.
- New skills for every agent: papers' peer review, reproducing a paper, and figures for papers.

## For engineers

- Scheduled tasks' examples, grouped (Everyday, Watch, Engineering), with four for engineering, each with a webhook
  filter, switches for what it may do and a skill of its own: **CI doctor** (a failed GitHub Actions, GitLab CI,
  Buildkite or CircleCI run: the logs read, reproduced in a worktree, flaky told from real, re-run or a draft fix PR),
  **Issue triage** (labels, duplicates, what a report lacks, easy fixes tried as draft PRs), **Dependency gardener**
  (weekly upgrades in groups of risk, advisories first, tests run, a PR per group or a report) and **Incident first
  responder** (Sentry, Grafana, Datadog or Better Stack alerts: errors, deploys and the diff since the last good release
  in one timeline, a notice at once, a rollback only after your yes).
- **Find what broke it** (Git → History, a commit's ⋯): give the commit where it worked and what is broken; an agent
  writes a check, runs git bisect in a worktree of its own, names the first bad commit and says why.
- **Campaign** (Options → Swarm → Campaign, or a running session's menu → Session settings → Swarm): one big change in many parts, each made by a member in its own worktree
  with its tests, on a board of parts and their status; a failed part is tried once more, and the lead merges the parts
  in order or opens pull requests.
- New skills for every agent: ci-doctor, issue-triage, dependency-upgrades, incident-response and git-bisect.

## Custom: any model

OpenRouter session costs and token usage show above the message box without a spending cap. Charges come from OpenRouter automatically, with its generation records and catalog prices as fallbacks; its catalog also supplies Usage estimates, so no manual prices are required.

Custom is the app's own agent, for models beyond Claude Code's and Codex's, and for theirs too: it also runs the models of your Claude and ChatGPT plans. Its working and starting indicators use the Hydor loading animation (water rising and falling in its Ω), vertically centred beside their text. It works like them: it reads,
edits and searches files, runs commands, keeps a plan, loads skills, uses the MCP servers set up for Claude
Code and for Codex (and the project's `.mcp.json`), asks before edits and commands (or not, by mode), and condenses a
long conversation to stay within the model's context. In Auto mode routine steps go ahead and a quick check asks you
about risky ones, and commands can run in a sandbox that lets them change files only in the folder and the temporary folders (bubblewrap on Linux, Seatbelt on a Mac; on Windows, low integrity, with the folder marked once and a temporary folder of their own). Forks,
"Edit from here" (with the files put back) and `/goal` work for it as they do for Claude Code and Codex.

- **Your plans' models, and any others**: Custom's Model menu groups models under **Your subscriptions**, **On this computer** and **In the cloud**, each row with what it comes through (Claude Code, Codex, OpenRouter, Ollama, vLLM, an endpoint's name). With nothing to set up, a signed-in Claude Code offers Claude Opus, Fable, Sonnet and Haiku (always the newest of each), and Codex signed in with ChatGPT offers the models the plan lists (a program found signed out drops its models; Codex on an API key lends none). They use the plan's usage, not an API key or money per token (a session shows $0 for those steps), and each account of the program is tried in turn, so one at its limit or signed out hands the step to the next (with **Switch accounts at a limit** on). Claude's models answer through Claude Code itself, one step at a time, as Anthropic lets only its own programs use a plan's sign-in: Custom's tools are described in its instructions and Claude writes its calls as text, each step reusing the last one's cache. Claude Code cannot end a reply at its calls, so Custom ends it there and stops the program: what Claude writes after its calls (results it imagined, more calls on top of them) is never run, shown or kept. A step cut short by an update of the app is asked again once the app is back. Codex's are asked directly on the ChatGPT plan, with Custom's tools as real tools. A confidential session never uses them. They can be picked wherever Custom's models can: the start page, a session's model menu, Custom's tiers, the helper model, an agent's or app's model. Settings → Agents → Models shows them in **Your subscriptions**, after **Tiers**.
- **A helper for anything**: research, writing, documents and everyday tasks, with an engineer's habits in a code
  project (it runs the project's checks before it says it is done). It reads PDFs, Office files and images
  (described by the helper model for a model that does not see), and web pages as clean Markdown.
- **Careful with commands**: each part of a command is checked. "Always allow" covers just the commands you
  approved (`git status`, `npm run build`), so nothing can ride along after `&&`; commands that only look
  around run freely; risky ones (sudo, deleting outside the folder, running a download) ask every time outside
  Full access. Full access runs tools and commands without approval prompts or the command sandbox, with the
  computer account's permissions; confidential network isolation still applies. In the asking modes, files
  outside the folder and files with keys or passwords ask before they are read or changed.
- **Made for any model**: long output is kept in a file the model can page through, repeated or stuck steps
  are caught, malformed tool calls are repaired, independent reads run together, servers run in the
  background, and each model family gets its maker's sampling, edit format and reasoning effort. With many
  tools, the model sees a short catalog and looks up the ones it needs, and a feature's instructions about its own
  tools (pictures, apps, the browser, documents, signatures, experiments, Pages, the guide, keys and the vault) come
  with those tools, added when the model looks one up or uses it; the rules that hold whatever tools are in use
  (how replies look, memory, keys never typed into the chat, cleaning up) always stay. A model with a short context
  (about 32,000 tokens or less, not through OpenRouter) gets a leaner set: no guidance on answer UIs, the tool list
  by name only and fewer tools in full; memory is sized to its window too (under 12,000 tokens: a small block with the
  start of your profile, at most three notes, no index, nothing added with a message or a file, no wiki lines; up to
  about 33,000: at most 6% of the window, five notes and a short index), and the wiki's instructions come only with the tools they are about.
- **Skills by group**: Custom's instructions name its skills by group (the project's, yours, then the library's
  groups such as Coding or Documents) rather than listing each, up to 200 skills (at most 40 of the project's and
  yours); the ones that fit a new session's first message come with what each is for, and its skill tool loads one
  by name or finds one by what the work is.
- **How full the context is**: the ring beside the message box shows it as a percentage (point at it for the
  tokens), and the Options menu has a Context row ("42% in use") with an arrow that shows or hides a breakdown (folded at first): Instructions, Project
  instructions, Memory, App features, Skills, Tools and Conversation, each with its tokens and a bar for its share,
  estimated from the text and scaled to what the model's server counted. Custom condenses by itself, so there is no
  Compact for it.

Its models come from Settings → Models:

- **OpenRouter**: add a key, then add the suggested models (GPT-6 Luna, fast and cheap; Grok 4.7, good with fewer
  refusals; GPT-6.1 Sol, better; Claude Opus 5.5, best overall) or search its catalog (each model's maker, context,
  longest reply, price, release date, and whether it reasons, sees images or calls tools; filter and sort).
- **Ollama**: the models of an Ollama server, with GGUF weights pulled straight from Hugging Face.
- **vLLM**: Hugging Face models downloaded here and served on a GPU (a 16-bit model too big for it at 8-bit, FP8),
  split across 2, 4 or 8 GPUs when one has too little memory, or on a Mac's Apple silicon (vllm-metal), started
  when a session first uses them.
- **Any OpenAI-compatible endpoint** (LM Studio, llama.cpp's server, another provider).

Before any search, the models suggested for this computer show by what it can run, each with how it would run here
and Install: LFM3-VL 2B (almost any computer), Gemma 4 12B (a good graphics card), Flint (a Mac with Apple silicon and
32 GB or more) and GLM-5.3 Flash (a server with several large GPUs), the strongest that runs well marked Best here.
Hugging Face is searched by name, like OpenRouter's catalog: each model shows its maker, size, format (GGUF
for Ollama, safetensors for vLLM), downloads, likes and date, and a first verdict from its size on how it
would run here (a model too big for vLLM as stored may still run at 4-bit with Ollama). Filter to what runs
well here, a format, or models that see images; order by downloads, trend, likes or date. Before anything
downloads, Check tells exactly how it would run on this machine: where (a GPU, or the CPU),
the memory it needs, about how fast, and the disk it takes. Installed models show their size and remove
with one click. Models without native tool calls are told about the tools in their own format, or in the
prompt, and their calls are read from what they write.

The agents' own programs install by themselves when first needed (Claude Code, Gemini CLI, OpenCode, Grok Build…,
with npm into the app's folder), and stay up to date: once a day each is brought to its newest version, the
app's copies with npm and your own installs with their own updater (`claude update`, `codex update`,
`opencode upgrade`, `grok update`, or npm for `npm install -g` ones), Claude Code on its own release line (stable or latest). A
new version is kept only once it starts and answers the way the sessions use it (no sign-in or usage needed),
within a minute of the computer being awake or two more on a second start; one that does not is undone, and the
sessions keep running the version before. Settings → Accounts → Agent
programs shows each program's version and what is out, with Check now, Update now and Update automatically.

## Following along
- A readable timeline: the agent's messages read like a chat, and its work shows as an outline: each note it writes
  between steps starts a part, one line in a few words with a check, how many steps it took and the lines it changed,
  its steps folded under it with plain-words names ("Run the tests", "Read index.ts"), each a click away from its full
  output. The part under way shows the agent's note in full and the step being taken now, so a long turn takes a few
  lines rather than the screen; its latest parts show, the rest a click away. What the agent writes between steps that
  reads as a reply (its answer to a message sent while it worked, a report with a list or a table) shows as a reply in
  its place, with the work before and after it each folded under a line of its own. A step of Hydor's own that waits for a command
  Claude Code runs on its own shows Waiting in place of its clock, and counts from when it really starts. A reply long enough to fill the screen
  stops at its first line as it grows, so you read it from its beginning; a short one sits under what came before,
  with no empty space below it. A page still being written shows the app's mark and "Writing the page…" until it has
  something to show.
- A turn's time and cost: its cost beside a finished turn ("≈ $0.12", at API prices on a plan; the tokens when no
  price is known) opens where its time went (the model, commands, files, the
  web, other steps, waiting for you on approvals, questions and forms, and the rest), how soon its first reply or step
  came, its tokens by kind (read fresh, written to the provider's cache, read from it, with the hit rate, written out),
  and, with the model's price known, what each kind cost and what the cache saved.
- Replies made to read: every agent knows the app shows them as rich text, with Markdown (headings, lists, tables,
  code), maths in LaTeX drawn as in a textbook (KaTeX, chemistry included; numbers such as `$1$` and `$0$` render as
  maths, while ordinary dollar prices stay money), Mermaid diagrams (flowcharts, sequences,
  timelines, mind maps, Gantt and pie charts…) drawn in the app's colours with their code, a full-screen view and an
  SVG to save, figures and small interactive tools (a chart, a calculator, a simulation with sliders) that run in
  place in a sealed-off frame as the reply comes, and pictures from the web (fetched by the app's own server, so the
  sites never see your browser) or from this computer, opened large on a click. The user's guidelines can ask for
  plain text instead.
- Answer UIs: when part of an answer is something to look at, compare, choose from, follow, try or practise, the agent
  shows it in one of more than 140 ready-made UIs drawn in the app's look as the reply streams, by writing a
  ```` ```ui <name> ```` block of JSON. Agents are told to use one for every such part, which is most of an answer of more
  than a few lines (conversation, short answers and code changes stay text), to fill their pictures and to play a video
  where watching helps more. They
  cover summaries and notes (key points, callouts, fact sheets, definitions, glossaries, FAQs, tabs, columns, quotes,
  cards, fact checks that weigh each claim's evidence with a tally of verdicts that filters them, follow-up buttons at
  the end of an answer that send the next question when tapped), comparing and deciding (comparison tables with the best values marked, pros and cons, a decision matrix whose
  weights re-rank the options, choices whose pick is sent as your answer, picks, rankings, scorecards, head-to-heads, 2×2
  quadrants (named points, or numbered ones with a key below when the names would not fit), SWOT, troubleshooters and wizards that ask one question at a time, a wheel, dice or coin that picks for
  you, Venn diagrams), shopping (products, product grids, spec sheets, price history, homes to buy or rent), places and travel (places on a map,
  one place, day-by-day itineraries with maps, directions, flights, stays, weather, world clocks, currency, departure
  boards, a route's elevation profile), food and
  fitness (recipes whose servings scale the amounts and whose steps have timers, nutrition labels, meal plans, workouts),
  time and plans (timelines, agendas, calendars, roadmaps, how-to steps, checklists, countdowns, boards, status boards,
  go/no-go checks, week timetables, Gantt charts, timers that run alone or in sequence, parcel and order tracking), work
  and business (invoices, quotes and receipts with their totals, review findings by severity with fixes to ask for,
  action items by owner, QR codes for links, Wi-Fi and contacts, job openings), numbers (line, area, bar, stacked, pie, donut, scatter and radar charts with a table view, sortable
  and filterable tables with totals and CSV, KPI tiles, heatmaps, gauges, funnels, breakdowns, Plotly figures in 2D and
  3D, what-if calculators with live formulas, goals, experiment results with the best marked and ± std, Sankey flows,
  histograms and box plots, waterfalls, treemaps, calendar heatmaps with streaks, values on a map),
  money (stock quotes, loans, budgets, savings growth, pricing plans, splitting a bill, an investment portfolio), learning (quizzes, flashcards,
  worked solutions, explainers at several levels, vocabulary with pronunciation, translations, research papers with
  BibTeX, trees, resources, fill in the blanks, matching pairs, putting things in order, verb conjugations, dialogues to
  listen to, grading rubrics, chess positions to step through, practice problems you answer in your own words or numbers that are checked in place
  with hints, a worked solution and a score, network graphs of how things connect), science (tonight's sky with the moon's phase and the planets, unit conversion, formulas, a function plotter with
  sliders),
  media and events (galleries, videos with chapters, sounds, tracks, films, books and games, events with an .ics to add to
  a calendar, colour palettes with contrast checks, news, pictures with numbered notes, before-and-after sliders, chord
  charts, font pairings shown live), people and sports (profiles, people, org charts, matches,
  league tables, fixtures, contact cards with a vCard, knockout brackets), writing (emails, alternatives to pick from, social posts with character counts, changes to a
  text, annotated text whose marked passages open a note and a suggested change, with the original and the corrected text
  to switch between, a reference in APA, MLA, Chicago, IEEE, Harvard and BibTeX) and code (code in tabs, commands, API endpoints, errors explained, test results, a JSON explorer, a regular
  expression tester, shortcuts, repositories, a log viewer, cron schedules with their next runs, a code playground that runs JavaScript, Python and web pages in place, code walkthroughs
  whose steps light up the lines they explain, and a program's run stepped through line by line with its variables, call
  stack and output, after a prediction of what it prints). Agents find the ones that fit with `find_ui`: the names of the ones they already know together with a few words on what
  the other parts of the answer show, in one lookup, searched by words (BM25) and by meaning (the shipped vectors of each UI), fused by rank, the best five
  with the data each takes and an example, or the best three for each part of an answer at once (`queries`), since one
  answer may hold a UI for each of its parts and a session as many as its answers need. What you tick or answer in one
  is kept on that device; a button that says Send (your pick, a quiz score, practice results, where a wheel stopped)
  sends it at once as your next message and shows Sent, leaving what you are writing in the box (into the box instead
  when the session cannot take a message just then); an entry without a picture, or whose picture cannot load, shows without one (no empty box); **Show the data**,
  **Copy as text** and **Full screen** (the card alone over the page, as wide as the window, scrolling when tall) sit on each, and under
  its … **Save as picture** (a PNG of the card as it looks, in the current theme, at twice its size, named after its title) and **Copy as
  picture** where the browser allows it; a card with a map, a library-drawn plot, a video player or a playground's output inside has no
  picture buttons. **Pin to a board**, first under its …, keeps a copy of the card on a board (one picked, the one
  changed last first, or a New board… named in place; its title changeable first), with where it came from: in replies, an app
  run's follow-ups, a task's History and the gallery. The gallery (`/answers`) shows every UI with an example and plays one as it streams.
- Answer cards from a spreadsheet or a file: a table, a chart, key figures, a ranking, a histogram with box plots or values
  on a map can take, in place of its numbers, where they are (`from`: a kept spreadsheet by name or id, with a tab and a
  range or a named range, its first row the headings; or a CSV, TSV, JSON, JSONL or GeoJSON file in the session's folder
  or its project's) and what of them to show: columns by heading, `sum`, `avg`, `median`, `count`, `distinct`, `min`,
  `max`, `first` and `last`, `groupBy`, a filter in a small language of its own (`where: "Region = 'EU' and Revenue >
  1000"`: comparisons, `in`, `contains`, `starts with`, `is empty`, `between`, `and`, `or`, `not`; read, never run), a sort
  and a limit. The server works the card's data out in its own shape (`POST /api/answers/data`), so the views are the same
  and nothing is retyped: files of up to 50 MB (JSON 20 MB) and 1,000,000 rows, results capped for each card (a table's
  1,000 rows, a chart's 8 series), what was read kept a few minutes under the spreadsheet's version or the file's time of
  change. Under the card, **Data from** names the source with a link that opens it, when it was read and how much shows,
  with **Read again**; the card redraws when the spreadsheet is saved and when the app comes back into view. A missing
  spreadsheet, tab, column or file shows as a plain message in the card. Files outside the conversation's folders, and
  spreadsheets made in a confidential session (for other sessions), are not read. Agents are told to use one for numbers
  that live in a spreadsheet or a file, more than a few dozen rows, or a card to keep; `find_ui` gives each such card's
  form with an example.
- Agents can answer with a page (a report, a dashboard, a mock-up), shown in the conversation as it is written, or
  beside it on a wide screen. Before showing one, an agent can picture it as the app shows it, in the dark theme or
  the light, to see what would not read well.
- Before and after: when an agent changes how a web app looks, it shows screenshots of each screen it changed
  from before and after, on a computer's or a phone's screen, in the light or dark theme: a reply's screenshots as one card of small
  pictures (a row of them, with Show all, when there are more), each opening a review (beside the conversation, or
  over the app on a phone) with a slider or side by side, and arrows to the reply's other screens.
- Every file a turn changed, with its diff, and the commits it made, each opening to its message and diff. Screenshots you attach show in the conversation and open full size.
- Approve or deny commands and edits, approve plans, and answer the agent's questions from cards in the page.
- A message you send shows in the conversation at once, with the agent at work under it (or in the queue, when
  it waits there), before the agent has it, and the box is free for the next; one that does not go through comes
  off again and goes back into the box, with a notice that says why.
- Message the agent while it works: your note joins the running turn, or waits in a queue you can reorder and
  edit, attachments included. Custom picks up follow-ups (including a queued message's Send now) at the next
  model step, after running tools finish. An older Custom process kept across an app update queues the
  correction until the turn ends instead. Quote any part of a reply, or of your own
  messages, into your next message.
- Notifications when a session finishes, fails or needs you: in the app, as a system notification, or as a push
  notification on your phone with the app closed (finished means nothing it started still runs: while its background
  tasks, such as a command or a monitor, or its subagents are still at work, the notice waits until they end) (a desktop app shows the system's own notifications, with its window
  in front, behind or closed, none for the session you are looking at, and a click opens the session); agents and
  apps' steps can also send you one themselves (notify_user) for what cannot wait. A plain yes-or-no approval has
  Approve and Deny right on the notification (where the browser shows buttons; a desktop app's have none: click to
  open the session), and the Inbox lists everything waiting on you across sessions, scheduled tasks and machines,
  with approvals, questions and forms answered right there. Its Outbox holds the calls held for your OK, one card
  each, as a draft you can change (an email as To, Cc, Subject and Body; a chat message; a post; else the tool's
  fields): Send (Hydor makes the call, the session shows its answer and its agent hears it with your next message),
  Drop, or Send all for one session; they notify you like approvals, wait over restarts and are kept 30 days.
- Use on your phone (Settings → App → Use on your phone, and `hydor machines phone`): the app on your own phone, privately,
  with Tailscale. It says whether Tailscale is installed (looked for on PATH and where its installers put it on macOS,
  Windows and Linux), running and signed in, and this computer's name on the tailnet; Serve it on my devices publishes
  the app with Tailscale Serve over HTTPS to the devices signed in to your Tailscale account only (never Funnel, which is
  public), in the command line the installed version takes (from 1.52, and the older one), and the server accepts that
  address by itself (kept beside ALLOWED_ORIGINS, no file to edit). The address shows with Copy and a QR code that
  opens the page on the phone, which walks it through Add to Home Screen (Safari's Share on an iPhone, which notifications
  need there; Install where Android's browser offers it), Notify this device and Send a test to that phone only. What
  stands in the way comes with one thing to do: Serve or HTTPS certificates not on in the tailnet (Tailscale's link,
  as a button), Linux wanting you to be Tailscale's operator (the command to run once), something else published at
  that address (served on port 8443 instead, the other left alone), Funnel turned on by hand (flagged). Stop serving
  undoes exactly what was done, from a record kept for it; while it serves, the links the app hands out (chat apps'
  Open in Hydor, links agents give to sessions and kept pages) start with that address unless ALLOWED_ORIGINS names
  one; agents can serve it only through a card each time, Full access too. Desktop apps offer it in their welcome tour (Use it on your phone too?, skipped with one click).
- Chat apps (Settings → Chat apps): your agents in Telegram, Discord or Slack, each through a bot or app of your own
  (a Telegram bot from @BotFather, a Discord bot from the Developer Portal, a Slack app from a manifest the app gives
  you, with the exact scopes). Only the chats you link with a one-time code can use it. A message starts a session or
  goes on with the chat's own, its reply comes back when the turn ends (formatted for the app: Telegram's HTML,
  Discord Markdown, Slack mrkdwn in blocks; in up to ten messages when long; "typing…" in Telegram and Discord, an
  hourglass in Slack while it works), a yes-or-no question comes with buttons that answer it, /new, /sessions, /stop
  and /status steer it (slash commands in Discord, /hydor in Slack), and every session's notices can come too. Photos,
  files and voice messages come with a message (a caption with them, an album together): fetched within each service's
  limit (Telegram's 20 MB for bots, 25 MB from Discord and Slack; one too big is said plainly), saved in the folder of
  the session they go to under their own names (never outside it), and passed on as the message box's attachments are
  (pictures to look at, files by their paths); a voice message is turned into words with Settings → Voice's speech
  recognition (its recording stays in the folder; without it the recording goes as a file and the chat says how to turn
  it on); what files hold and what is forwarded from someone else reach the agent marked as outside data. /as and an
  agent's name starts a session as one of your own agents (Discord completes the name; /hydor as in Slack), /agents
  lists them with buttons, a standing agent takes the chat into its own conversation, and New sessions as makes one of
  them every new session's agent. In
  Discord and Slack a channel works too, when the person who linked it mentions the bot. The app connects out (it
  asks Telegram for messages, opens Discord's Gateway and Slack's Socket Mode WebSockets itself), so none needs an
  address on the internet; the tokens are kept in the vault. Connect refuses a token only when the service says no to
  it: when Telegram, Discord or Slack is slow or not reached, the token is kept, the row says Connecting… and why, and
  the bot connects by itself once the service answers (a Telegram bot taken by another program is said too).
- Share to Hydor: the web app installed on Android (Chrome, Edge) or on a computer (Chrome, Edge) is in the system's
  share sheet; a photo, a file, a page or text shared from another app opens the start page with it in the message box
  (the words and the link as text, the files as attachments, up to 25 MB), for you to add a word and send; signed in
  only. Safari on iPhone and iPad takes no shares from web apps: the chat apps take photos and files there, and a
  Shortcuts shortcut can open the start page with shared text (/?prompt=).

## Shipping the work
- Open a pull request on GitHub or Gitea from a session's branch, with a description written for you; its
  state and checks show in the sidebar.
- Review what a branch changes file by file, mark files viewed, and let a guide put them in an order that is
  easy to read, with a note on each.
- Share a session with a read-only link that ends when you want.
- Export a conversation from the session's menu: as a Markdown file, copied as Markdown, or as a kept document
  to edit, print and share (the title and date, your messages and the replies in order, a turn's steps as one line,
  files handed over by name, answer cards as text and tables, Mermaid and maths as written; in the document, your
  pictures and the handed-over ones too). A confidential session's stays on this computer. Also `hydor sessions export`
  and `GET /api/sessions/:key/export?format=md`.

## Around the agents
- Files: places to start from (recent files, home, pinned folders, your projects' folders, the folders sessions
  worked in, the trash), and each folder as a list with dates, sizes and git status (folders open in place, as a
  tree) or as tiles with pictures; sort, narrow as you type, pick several, drag to move (Alt copies) or to
  upload, keys for everything. Each file or folder's menu: start a session with it (named by its path, nothing
  uploaded), add it to a project (a file is copied into its folder, a folder joins those it works with), rename,
  duplicate, move or copy to a folder, download (a folder or several as one .zip), delete to a trash with Undo
  and Put back. One search finds names and text inside files, under a folder you pick, by kind. An editor with
  Markdown and HTML preview and diffs, quick open, and uploads: changes not saved are kept per file while the app is open
  (undo history, cursor and scroll too, also across Preview and Changes), a dot on the file's tab and a Save / Don't save /
  Cancel question before closing it, CRLF files saved as CRLF, a right-click menu, Go to line, a status bar (line and column,
  language, indentation, line ends, wrap) and a shortcuts list. Above every open file (Word, Excel, CSV and LaTeX too)
  its path is a row of links: Home, then each folder going to it in Files with the next step picked, "…" for the folders
  between, the file's name showing it in its folder; in the window over a conversation the folder opens in that window, with ‹ back to the file. Ask, beside an open file, has an agent change it
  or answer about it: unsaved changes are saved first, the conversation stays beside the file, and the editor
  takes in each change as it is written (every second while an agent works), the changed lines tinted for a
  moment and your place kept. Word, Excel, CSV and LaTeX files open in the
  app's own editors and save back to the same file: a CSV's untouched rows and cells keep their exact text, a LaTeX file
  brings the chapters and bibliography it reads and typesets among its folder's pictures (read only to TeX),
  writing only the files that changed; a Word or Excel file says first what the editor doesn't keep (headers and
  footers, comments, charts…), offers to save a copy instead, and its first save keeps the old file in the trash.
  A PDF's Fill & sign: its form's fields to type in, tick and pick over its pages, text, ticks, crosses, dates and
  signatures (saved ones, or drawn there) put anywhere with a click and dragged into place, saved as a copy beside it
  or over it.
  Jupyter notebooks open and run, with Ask beside them as for other files; New → New notebook starts one (an empty
  .ipynb opens as a new notebook too), saved outputs show as Jupyter shows them, a progress bar at its last state,
  and Jupyter kernels registered from a virtual environment are offered as environments to run in. Videos play in the app's own player (seek with a
  preview of the time, speed, loop, picture in picture, full screen, keyboard shortcuts, double-tap to skip on a
  phone), streamed in parts so they start at once and seek anywhere.
- Git: your repositories (those sessions worked in, and any you add: a folder on this computer, which can start
  a repository, or a clone from a link) with what changed and one Sync button that brings in and sends up
  commits, asking in plain words how to put them together when both sides moved on (your commits on top, or a
  merge). Commit from the app (pick the files, see each diff unified or side by side, put back one part of a
  file, have the message drafted from the changes, amend the last commit while no remote has it, commit and
  push in one go). A merge or rebase that stops on conflicts lists the files to settle, with Continue, Stop or
  an agent to resolve them. The history as a graph with branch and tag labels and a search; a commit can be
  explained by an agent, reverted, tagged, branched from or undone. Branches to switch, merge, compare,
  rename, publish and delete (saying which commits would be lost), and stashes to look inside, apply and drop.
- Preview: the web apps running on this computer (dev servers, told apart from APIs and databases, with their
  project, page title and framework), shown inside the app at a computer's, tablet's or phone's width with an
  address bar, back and forward. Where the browser can't reach the preview port (behind a tunnel), the page
  runs in a browser on this computer and streams to Preview live, to click, type, scroll and tap in (with a
  key row on phones); or as still pictures. A screen goes to a new session as a picture, with a question.
- Terminal: real shells that survive reloads and server restarts, with suggestions as you type (from your
  history, branches, scripts and folders, or written from a plain description) and an extra row of keys on
  phones.
- Scheduled tasks: agent work, by any agent (Custom included), that starts at a time of day in your time zone,
  every few minutes, once, by a cron expression, when a webhook is called, or when a watcher sees a change (new
  items in a feed, a page or a value in JSON changing, new files in a folder, a command's output, new email in a
  connected mail account, new items in a connected app, or a set time before each event in a connected calendar):
  watchers check without a model and wake the agent only then. A task's Model menu offers Automatic first, as the
  start page does (Best, its agent moving itself to Max when a problem proves too hard), when Lead with subagents is
  on and the program has tiers, and not for a confidential task; a new task starts on it, a saved one keeps its
  model, and a task an agent makes from a conversation on Automatic (or turned from such a session, or an
  agent's schedule, unless that agent names a model) starts on it too (`hydor tasks … --model auto`, and `"auto"` as
  a task's model in the API). New email starts one run
  per email (at most 10 a check, the rest summed up in a line), with the email as outside data and its attachments
  saved in the task's folder, and never the same email twice. A connected app's watcher calls one of the account's
  tools that only looks (never one that sends, changes, deletes or pays), as the Outbox does, at each check: Try it
  shows its answer and where the items are in it (the first list of records, told apart by an id, a key or an
  address, both changeable), starting points fill in the tool and its fields for a CRM's new contacts or deals, a
  drive's new files, new tickets, issues, payments and more (from the account's own tools), and `{{now}}` or
  `{{now+2d}}` in a field stand for the time of each check. Each new item starts its own run with the item as outside
  data, at most 10 a check, never twice, across restarts too. For a calendar, "Before each event" starts a run 15 or
  30 minutes or an hour before each event, or the evening before at a set time, for events with a title or with
  other people if you like, following an event that moves and skipping one cancelled. A signed-out account, a tool
  gone or an answer that changed shows on the task and starts no run. Ask in any conversation ("remind me Friday at 9", "every Monday
  summarize…") and confirm the task in a card; or start from an example, or turn a session that worked into one.
  A task can also run one of your apps, with the answers you set (a webhook's call or what a watcher saw
  filling them in), made from the app's Runs. Each run reports how it went: its history keeps the outcome, a
  summary, the cost and the session (or the app's run), and runs again with the same input. Runs with
  nothing to report stay quiet, failures always tell you, and failures in a row pause the task. A task no longer
  needed goes by itself: a one-off after a run that went well (one that failed stays, paused, to run again), and one
  whose run finds its job done (what it waited or watched for happened, as its prompt said to stop then) ends it
  with `report_outcome`'s end and says so; agents delete tasks nobody needs rather than pausing them. Test without
  sending runs a task as it would run, but keeps every call that would send, post, delete or pay as "would have
  sent" (listed in the run's history and its session) and makes none of them. A run the computer was off or asleep
  for runs at the next chance; the desktop apps keep the computer awake from a few minutes before a run is due until
  it starts. Webhooks can
  require a signature, skip repeated deliveries, filter on the payload, and wait for the reply (`?wait=60`).
  Schedules (a place in the Agents page's column, a tab on a phone; Settings → Scheduled tasks → Week view) shows everything that runs by itself,
  scheduled tasks, agents' and apps' schedules, board cards' refreshes, watchers and webhooks, on a week or a month in your time zone: each
  run that happened as a block at its time coloured by how it went (opening its session or its app run), the runs to
  come drawn faintly with their names, what runs more than eight times a day, watchers and webhooks as one band a
  day with counts, five at once gathered under "+N", each day's cost, filters by kind, and a list of them all with
  the last result, the next run, a pause switch and a link to where each is changed; on a phone, a day at a time.
  Sessions stopped by a usage limit can continue by themselves when it resets (quietly, with a line saying
  whose limit it hit, all your accounts of that agent or one by name, which one and when, while Resume after
  usage limits is on); one you stopped yourself never does.
- Usage: how much of each plan's limits (Claude Code, Codex and Grok Build, each account) you have used and when they reset, what the same work would cost
  through the API, and activity over time, for every agent or one (Custom and the ACP agents by name) and every
  model or one: today, this week, this month or this year so far, against the period before up to the same point,
  with a bar for each day, week, month or year.
- Every session is kept, whatever the agent's own program does: Claude Code is told to keep its conversations,
  and the app keeps its own link to every conversation file (no extra disk), so one that gets deleted comes back.
  Sessions nobody used for a year are deleted (Settings → General → Delete inactive sessions: on or off, and how
  long); pinned and busy ones stay, and their numbers stay in Activity.
- System: this computer under one tool on the rail, a tab each for Files, Git, Terminal, Preview,
  Monitor (CPU, memory, GPUs, disks, network, each live session's programs and the busiest processes, live) and
  Experiments, and an overview with how it is doing and what each tool holds now (recent files and a search,
  repositories with changes, the shells running, the web apps to preview).
- Each session's share of the computer: its programs (the agent's, the commands it runs, the servers it starts) with
  their CPU and memory, in its Info and in Monitor; and, on Linux, Settings → General → Limit each session puts each
  session in a systemd scope of its own with at most that much memory and so many processors, so a program that
  runs away is stopped alone, never the app or another session.
- Settings: sign the agents in and out from the browser, and manage MCP servers, skills, plugins, Agent
  Guidelines and the CLAUDE.md / AGENTS.md instruction files.
- An MCP server of its own, so an agent elsewhere can list, read, start and steer sessions here.

## In a terminal
- The `hydor` command does everything the app does, from a terminal. In a folder it opens a conversation with an
  agent in the terminal's own history (no full-screen mode, so it scrolls, copies, and works over SSH and in tmux):
  a welcome panel (the version in its top border, the folder on its git branch, program · model · mode, the mode in red when the agent
  acts without asking), your messages, the agent's text as it streams with its Markdown drawn for a terminal
  (headings, lists, quotes, tables aligned when they fit, links with their address, code never re-wrapped), each
  step on one line with what matters of its result (lines added and removed, the time a command took, its exit code
  and the first line of its error), thoughts as one line (`--thinking` for all of them, `-v` for each step's output),
  subagents starting and finishing (Claude Code's own subagents in the background too, while they work and as they
  end), tier notes, and each turn's end (time, cost, model, subagents). Only a few lines at the bottom change while the
  agent works: the text being written, the step under way, the subagents at work, a coloured spinner with the time,
  and the input line; nothing printed above them ever changes. Widths follow the terminal, wide characters and emoji
  included, and are redrawn on a resize. True colour where the terminal has it; `NO_COLOR`, `--no-color` and pipes
  turn colours off.
- The input sits between two thin rules with a status line under it (folder and branch, model and mode, the cost so
  far). A menu opens as you type and keeps up with every key: `/` lists the commands with what each does (the
  chat's own, then the program's), `/model`, `/mode`, `/effort`, `/agent`, `/subagents` and `/open` list their
  values, and `@` finds the session's files loosely (`mdl` finds `model`), browsing a folder when you end with `/`.
  Grey suggestions from your earlier messages (→ takes one, Alt+→ a word; the **Terminal suggestions** setting),
  Ctrl+R to search them, pickers with a highlighted row for sessions, models, efforts, modes and agents, history
  (the last 500), several lines (Alt+Enter, Ctrl+J or a `\` before Enter), pastes whole, and word moves and deletes.
  `!command` runs a shell command in the session's folder with the terminal handed over, so interactive programs work
  (the agent does not see it). While an agent works, Enter joins the running turn or waits for it to end, as
  **Sending while an agent works** says (`/queue` and `/now` decide for one message); asking the agent to change
  either device setting changes the chat too.
- Approvals answered with a key (`y`, `n`, a choice's number) or denied with your own words; questions with numbered
  choices, several picks or your own answer; forms field by field, files by their path; what an agent's browser waits
  for (a login, a payment, an address or a button to allow, a page's pop-up question) as a card with keys (`y`/`n`, or
  `o` to open the session in the app, `d` done, `n` can't). Commands for a new session,
  another session, the model, effort and mode, your agents, subagents, tiers, usage and cost, copying the last reply
  (`/copy`, over SSH and in tmux too) and clearing the screen; `/hydor <command>` runs any of the commands below
  inside the chat, with its own menu; any other `/command` goes to the agent. `hydor -c` carries on the folder's
  latest session, `hydor resume` picks one.
- `hydor run` for scripts: one request, followed until the work is done (subagents' replies, Claude Code's own subagents in
  the background, and the turns they wake included; a dev server left running does not hold it up), the reply on stdout, progress on stderr, `--json` (the reply, cost, tokens, turns, subagents) or
  `--stream-json` (each change as it happens), `--timeout`, and exit codes for done, failed (a usage limit named),
  bad usage, an answer needed (an approval, a question or what the agent's browser waits for), a time-out and Ctrl+C. A message can be piped in.
- Everything the app does is a command with verbs, grouped in `hydor help`: sessions (search, rename, archive, pin,
  snooze, move, fork, goal, share, changes, commands, the queue, delete; marks show what each is doing), projects and
  their documents, guidelines, agents, memory (notes, forgetting and restoring, your profile), skills, plugins, MCP
  servers, the vault's keys (a value is never typed as an option or printed), the inbox and the Outbox (send a held
  call as it is or with fields changed, or drop it), what happened while you were away (`hydor away`, and `seen`), experiments, scheduled
  tasks, apps, files, connections and accounts, machines, models, tiers and plan usage. Each takes ids, the
  start of an id, or names, asks before removing, and has `--json`. `hydor settings` reads and changes every option
  of the Settings page (`list`, `get`, `set`, `run` for buttons, `open`; alone on a terminal it is a browser of the
  sections and their options). `hydor find` searches everything the search box does, `hydor guide` reads the guide,
  `hydor open` gives any page's address (`--browser` opens it, for what only a page can do), and `hydor api` calls
  any endpoint.
- Tab completion for bash, zsh and fish (`hydor completion install`): commands, options and verbs, and what they
  take (session keys with their titles, models, agents, projects, skills, settings, folders…). `hydor help` is
  grouped, one line a command, with `hydor help <command>` for its usage, options and examples; a mistyped command,
  option or verb gets "did you mean"; errors are red.
- It starts this computer's Hydor when nothing answers and leaves it running; another computer's is reached with its
  address and an access token (`--server`, `--token`, or `HYDOR_URL` and `HYDOR_TOKEN`). The installer links it into
  `~/.local/bin`, the Docker image has it, and the Mac app puts it on your PATH by itself at every start (a link in
  `~/.local/bin`, `~/bin`, `/usr/local/bin` or `/opt/homebrew/bin`, or `~/.local/bin` with one line in your shell's
  startup file), running the app's own Node.js and opening the app when it is closed.
- The Linux and Windows desktop apps do the same at every start, with no password and no question: on Linux a small
  `hydor` file in `~/.local/bin`, `~/bin` or `/usr/local/bin` (or `~/.local/bin` with one line in your shell's startup
  file, placed before the .deb's own `/usr/bin/hydor`, which opens the window), on Windows `hydor.cmd` in your
  WindowsApps folder (or `%LOCALAPPDATA%\Hydor\bin`, added to your PATH). Another `hydor` already on your PATH is
  left alone.
- Where symbols cannot show (the Linux console, a locale that is not UTF-8, the old Windows console) the command draws
  with plain characters: `+-|` for the box, `>` for the prompt, `*`, `+` and `x` for marks, HYDOR for the logo.
  `HYDOR_ASCII=1` turns it on anywhere and `HYDOR_ASCII=0` off; output to a file or another program keeps its symbols
  unless it is set to 1.

## Everywhere
- Desktop apps for Mac (macOS 12+, Apple silicon or Intel), Windows (10 and 11, x64) and Linux (x64 and ARM: a .deb
  for Ubuntu and Debian, an AppImage for the others): the server and Node.js in one app (and tmux on a Mac and on
  Linux), in a window of its own, in the menu bar (the notification area, the system tray) when the window is closed,
  opening at login. They show a session's notices as the system's own notifications (Notification Center on a Mac,
  which asks once to allow them; when they are not allowed, the welcome tour's Turn on notifications and the Notify this
  device switch open System Settings at Hydor's notifications), even with the window closed, and click one to open its
  session, and while the window is away (closed, hidden, minimised or behind another app) their icon counts the
  sessions with new notices (the Dock on a Mac, the taskbar on Windows, the launcher on Linux desktops that show counts),
  even with Do Not Disturb on, until you bring the window to the front; they find your programs through your login
  shell's PATH (on Windows, your own environment); they keep the computer from going to sleep by itself while agents
  work (scheduled runs, app runs, subagents and running experiments too) and, by default, from a few minutes before
  a scheduled task is due until its run starts, but not for watchers' looks (Settings → General → Keep the computer
  awake: also only while agents work, or never; the screen may still turn off, and closing a laptop's lid still puts
  it to sleep); and they update
  themselves release by release: they look every 4 hours, download and
  check a new build as soon as it is out (Settings → General shows how far the download has got, a bar with its
  megabytes, and so does a note in the corner of every page for one started with Update now; a download that breaks
  off, as when the computer sleeps, carries on from where it stopped, and one that gets nowhere tries again an hour
  later), say so (a notification, and a note in every open page that counts down a minute, with Restart now and Later,
  which puts it off for 4 hours; Restart to Update in the icon's menu), and swap it in with agents carrying on: while
  it installs, the window shows only the Hydor logo with water rising in its Ω and "Updating to Hydor …", until it
  closes and opens again on the new version, on the same logo. A Mac app and an AppImage go back to the version before if the
  new one does not start; on Windows the new version's installer runs without its window; the .deb installs once you
  give your password.
- In the desktop apps, a file or folder on this computer can be shown selected in the system's own file manager, from
  the menu of each place that has one (Show in Finder on a Mac, Show in File Explorer on Windows, Show in folder on
  Linux; it never opens or runs anything): a file's or folder's menu and More in Files, the file viewer and editors,
  the cards and pictures, videos and sounds an agent hands over, the kept pictures, videos and sounds, the
  Browser's Downloads, a session's Folder and code, a project's menu, an experiment run's menu, a repository's menu
  and a changed file's, a plugin's and a skill's folder or file, an app's folder, and a notebook kernel's notebook in
  System. It is not in the web app, and not for the files of another machine (its pages, or a link someone shared).
- On Windows the server runs as it does elsewhere: agents' commands in Git for Windows' bash, terminals the app keeps
  itself (Windows has no tmux), and each version run from a copy of its own so agents carry on through updates.
- While the app loads, in a browser or while a desktop app starts, its logo shows, HYDΩR with water rising in the Ω
  and a wave moving across it. The moment the app has something to show it is there under the logo, which fades away as
  its water drains and the screen clears; with reduced motion it simply goes.
- Computer use in the desktop apps, on a Mac, on Windows, and on Linux with an X11 desktop (Settings → Computer use,
  off at first): agents see the computer's screen and use its mouse and keyboard in any app (screenshots of the main
  display at about 1280 pixels, clicks, drags, scrolls, typing in any language and on any keyboard layout, keys and
  shortcuts, opening apps by name: from the Start menu on Windows, by their desktop entries on Linux), beside the
  browser, which stays the way for websites. On a Mac, Settings asks macOS for its Accessibility and Screen Recording
  permissions, which carry over when the app updates (every version is signed with the same certificate); on Linux it says what is in the way (a Wayland desktop, a library missing). Each session asks on a
  card before its agent starts; one session at a time. While an agent works, a glow in the app's water colours lines
  every display's edges, with a note at the bottom ("An agent is using your Mac · Press Esc to stop"); clicks go
  through it, and the agent's screenshots never show it (it is hidden for the moment a screenshot is taken). A ring
  with an Agent tag circles the pointer the agent moves, which glides to each place instead of jumping, with a ripple
  on each click and the words or keys it types beside it, hidden from its screenshots too. Esc stops the agent (⌘⇧Esc too on a Mac), as do Stop in the menu bar or tray,
  in the session and in Settings; the agent pressing Escape itself does not. Each step shows in the conversation with
  the screen after it. Agents are told to look before they act and to leave passwords and payments to you.
- Works on phones and can be installed as an app. Four themes, light and dark, and your own: every colour
  can be changed. Text size, set per device in Settings → General → Appearance (Default, Large or Larger: about 15% or
  30% bigger), enlarges what is read and typed: the messages in a conversation (the agent's replies and your own), the
  Help pages and the message box; menus, the sidebar, editors and answer cards keep their size, and on a phone the message
  box never goes below 16 px.
- Small, quiet motion, set per device in Settings → General → Appearance → Motion (Full, Calm or Off; the system's
  Reduce motion always means Off). Full: buttons, rail tiles, session rows and chips dip to 97% while pressed; a copy turns into a check that draws itself, holds for a moment and turns back; switches spring;
  the rail's accent bar glides to the page you open; a session's dot turns green with one ring when work finishes and
  pulses twice amber when it needs you, its status words cross-fading; the session list's rows and the Browser's tab
  rows glide to their new places, a closed tab's row closing up and a new one opening; the Inbox count, the start page's
  numbers and usage percentages count to their new values, and the Inbox badge pops; the logo's water rises once when a
  session finishes; kept pictures shimmer until they load, then fade in; a step in a turn's outline that finishes
  draws its check. Five things bend the old rule that what you open shows at once, in Full only: the
  sidebar slides as you hide or show it, the Browser's right column and the Files page's Ask panel slide in and out, pages cross-fade (not to or from the Browser),
  the theme blends when you switch between light and dark, and windows come in over a page that dims behind them (a dialog or window rises a little as it grows to its size, and on a phone rises from the bottom edge like a sheet; a side panel slides in from the right; the search box and the picture and video viewer fade in quickly; all close at once). On a phone, the slides of the sidebar and columns and the page cross-fades don't play, but windows still rise from the bottom. Calm keeps all but those five; Off keeps only work in
  progress moving (the throbber's water, the dots of sessions at work). Nothing delays content, and nothing repeats but work in progress.
- The rail's icons (a tooltip names each, with its shortcut): Sessions (shows or hides the sidebar, or goes back to the session you had open), then the sections (Browser, which is in the desktop app only, Projects, Agents, Apps), right under them Inbox (with a count of what waits on you) and Search, and below, after some space, Usage, System, Settings and Help. The current page's icon is lit, with a bar of the accent colour beside it. Each group stays in the order you drag it into, as sessions do, the same on every device (Inbox and Search stay right under the sections; a tool a newer version brings, such as Projects, takes its usual place in an order you set, right before the next tool that follows it in the usual order, not the end); a phone has no rail, and its drawer holds them in one grid (hold one a moment to pick it up; the drawer's header has the Inbox). On a computer, right-click an icon for Back to the usual order. The sessions' sidebar shows on the start page and in a session only; Apps, Agents, Help and Settings have a column of the same kind (logo, their list, Hide), and the Browser draws one of its own. The rail shows the offline mark when no column does. Sessions are found with the search box, not a field in the sidebar.
- One search for everything, like Spotlight: `Ctrl+K` (⌘K on a Mac) or Search on the rail finds pages,
  every setting, sessions (by title, folder, first message and the agent they started as, archived ones too, marked Archived) and what was said in them, memory notes, projects, apps, scheduled tasks, assistants,
  skills, plugins, kept pages, pictures and videos, connections, themes and files, as you type. Pictures,
  videos, sounds, kept pages and files show with a thumbnail and their details (what each is, size or
  length, project, when it changed, a page's description); on a wide screen the preview shows a picture or
  a page larger and plays a video or a sound in place, and on a phone the rows are big enough to tap. Opening a result goes where it is: a setting opens its
  page and points at it, a project opens its details window over the page you are on, a kept thing opens in its editor or viewer, a message opens its session at the words. With search by meaning on (Settings →
  Memory; on unless you turn it off) things also match what they mean, in nine languages; what ships with the app has its vectors made
  ahead of time, and what you make gets them as you make it. Search in, beside the field, looks only in the
  places you pick (sessions, messages, projects, kept files, files, settings…), the same on every device; with nothing
  typed it lists what those places hold. In the desktop app the box also finds your own browser's history, bookmarks
  and downloads (**Browser** in Search in), by words and by meaning: a page or bookmark opens in a new tab of the Browser
  page, a download shows its file in its folder; what you type to find them is not remembered, and agents never get
  them. `Ctrl+F` finds within a conversation.
- A short welcome tour, made for people new to AI and drawn in water (Hydor is the Greek for it), calmly: a short
  film of a request being done, then what should do the work (Claude or ChatGPT with the plan you pay for, pay as you
  go through OpenRouter, free models on this computer, other agents), each set up on a page that fits the screen,
  its picture and words always in the same place: sign-ins, the suggested OpenRouter models and those for pictures,
  music, voices and videos, or a model suggested for this computer installed with one click. Beside each page,
  streams flow from what you picked into a pool around the Ω; small dots show the steps, over a sea whose waves
  drift gently. Then it shows you around as the app builds itself up, a ring of water lighting each part as it is
  explained, with first tasks to put in the message box. When the folder of Claude Code, Codex or another agent
  is on this computer, one more page, "Coming from another agent?", names what it found and opens
  Bring in over the tour. In the desktop apps, when other browsers are on this computer, "Bring in your bookmarks and
  history?" lists them, each with how many bookmarks and pages of history it has, and **Import** beside one brings in
  what is switched on (Bookmarks, History), or **Open System Settings** on a Mac while macOS keeps Hydor from reading
  Safari (the tour comes back to this page if Hydor has to reopen); Next goes on without. Help shows it again.
- After the tour, tips introduce the rest of the app as you come to it: the first time a part is on screen (the
  inbox, a session's menu and details, the queue, a goal, the browser's panel, a spending cap, the Git and Apps
  pages, Settings → Memory…), a small card beside it says what it is for, with Learn more for the
  guide. One at a time and a while apart, never while you type or a menu is open; each shows once, on every
  device. Skip tips, or skipping the tour, stops them; Settings → General → Tips turns them on again.
- Help (on the rail): a guide to every part of the app, its topics grouped on one page as cards (in a wide window, in a
  column of the same kind as the sessions' instead, with Hide sidebar beside the logo, the first page keeping its box and a few questions), each with a picture of
  that part of the app and its sections to open one at a time. One box finds sections as you type, or asks an
  agent on Enter: the answer, from the guide with links that open the place they name, shows in a panel beside
  it, and the agent can set things up for you there too. Its sections show in the search box as well. The same
  guide is in [docs/guide](guide/).
- Starts when the computer starts (on by default; Settings → General), as a service of your user.
- Updating a copy installed from git shows how far it has got, in Settings → General's version row (and in a note in the corner of every other page, for one started with Update now) and on an older machine's page offering to update it: the step's words (Getting the new version, Installing packages, Building; Restarting, this page reconnects by itself keeps its own), a percentage, a bar filling with water and a line such as "Step 2 of 3 · about 2 min left" ("less than a minute left", or "taking longer than usual" when a step that prints nothing has run 1.5 times as long as expected). The percentage comes from what each step is doing (Git's own download percentage, the packages npm has fetched against the last install's count, the web build's files against the last build's), a step that prints nothing goes by the clock on a curve that never stops moving and never says done early, the steps are weighed by how long they took last time on that machine (guesses the first time), and it never goes backwards. A machine running an older Hydor sends none of this, so the pages estimate it from its step and how long it has taken.
- Several machines: add other machines running Hydor, over SSH or by address, and switch between
  them from the sidebar. Notices from all of them reach you wherever you are. The machine row shows what happened on the machines you are not looking at: a number in an accent pill for sessions there that finished since you last looked (nothing counts on the machine a page shows; once you leave it, what finishes counts until you open that session or switch back), and an orange dot for sessions waiting on you. Its menu gives each machine a line like "2 finished · 1 needs you · 3 working" (this machine's too, on another's pages) and, under it, up to three sessions that finished there, with a check or a cross and the time; one click opens that session on its machine. A machine that is updating says how far it is ("Updating · 45%") or its step, and one restarting into a new version says "Restarting…" with a pulsing orange dot instead of "Not reachable". With the sessions sidebar hidden, the rail's Sessions tile carries a dot, in the accent colour for finished sessions elsewhere and orange for ones waiting on you. Settings → Machines shows the same lines. Another machine's pages open in this
  app's version, so opening one with an older Hydor first offers to update it from here (or to open it anyway), and a
  page that fails to draw says so, with Reload, instead of an empty window. A copy from git or Docker older than 0.78.0,
  which can't update itself past Hydor's rewritten history, gets the command to run on it once; newer copies with no
  commits of their own move to a rewritten history by themselves when they update.
- One password guards the app, and a browser stays signed in for 30 days. Wrong passwords are counted by the
  address they come from: after three in an hour the sign-in page also shows a picture of characters to type,
  drawn by the app itself (no outside service), and after ten that address can't sign in for an hour. Ten from
  anywhere bring the picture to everyone.
