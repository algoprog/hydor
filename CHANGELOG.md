# Release notes

What changed in each version of Naget Agent, newest first. The app shows these in Settings → General →
Release notes, and says what is new after it updates.

## 0.12.0 · 2 November 2026

Apps: what were Templates are now apps of your own, with steps, data, memory, a screen and a conversation with
their agent, made by describing them, in a graph or as files; and Connections speak of services and connected
accounts.

- **Apps**: Templates are called Apps again, everywhere you read about them. An app still starts as a form an
  agent fills in, and can now do much more. Old links to the guide's Templates topic open the Apps topic.
- **Steps**: an app can work in steps: an agent, a quick answer from a model, one of the app's tools, a decision
  by a rule or in words, a repeat over a list or until something holds, branches side by side, another app, its
  own data, a question for you (it waits, and the Inbox says so), a program in JavaScript, TypeScript or Python,
  or a value worked out at no cost. A step that fails can have an agent do its work, **Firm it up** offers cheaper
  steps for work an agent did the same way each time, and a finished run can run again from any step.
- **Build them your way**: describe one and the **App builder** makes it, with examples and checks it tries
  before handing it over; save a session that went well as an app, its steps drafted from what the agent did;
  change the steps in a list or in a graph of nodes and wires, where **Try it** lights each step up as it runs,
  pauses before a step or keeps an expensive one's answer, and **Collapse to a block** turns steps into an app of
  their own; or work on it as a folder of files in any editor, or from the command line.
- **Data, memory and screens**: an app can keep lists of records, searched by words and by meaning, and a memory
  of its own. It can have a screen in place of its form: a page made from its parts (its form, its answer, a
  table for each list, its runs) or by an agent, edited in Pages' editor, that runs it live. On a screen you can
  also talk with the app's agent, who reads and changes its records and runs its flows for you.
- **Blocks, versions and examples**: apps made to be steps of others (five come ready-made: sum up a page,
  translate, answer from the web, sort into kinds, pull out the facts); every save that changes an app is a
  version you can bring back, with how its examples went.
- **Running and sharing**: a scheduled task can run an app at a time, on a webhook or when a watcher sees a
  change; agents and steps can send you a notification; an app travels as one file with its records, screens,
  the apps it calls and what it needs (packages, models), installed after a card that says what it will do.
- **Connections**: the marketplace now lists services, and what you connect are connected accounts, in Settings,
  in a session's menu and in what agents are told.

## 0.11.0 · 2 November 2026

Slides, documents, spreadsheets and LaTeX in Pages, each with its own editor and an agent to ask; assistants you
switch mid-session; and a search box you can tell where to look.

- **Slides**: decks you edit as in PowerPoint or Google Slides, with 15 layouts, text, shapes, pictures, lines,
  tables and charts, animations and transitions, themes and speaker notes, and present full screen or with a
  presenter's view (your notes, the next slide, a timer and a window for the audience). They save as PowerPoint
  files you can still edit, as PDFs, or as a web page that presents itself.
- **Documents**: written and edited as in Word or Google Docs, on a page the size of their paper, with headings,
  fonts, colours, lists and checklists, tables, pictures and page breaks; what you paste from Word or Google Docs
  keeps its formatting. Open a Word, Markdown or text file as one, and save it as Word, PDF or Markdown.
- **Spreadsheets**: as in Excel or Google Sheets, with about two hundred of Excel's functions, number formats,
  frozen rows, sorting, several sheets, and copy and paste with Excel. Open an Excel, ODS or CSV file as one, and
  save it as Excel, CSV or PDF.
- **LaTeX documents**: the source beside its typeset pages, as in Overleaf, typeset again as you type, with each
  error at its line. Open a .tex file or a project's .zip, and save the PDF, the .tex or the whole project. TeX
  runs on the computer the app runs on, shut in a folder of its own.
- **Ask about what you have open**: Ask, on a page, slides, a document, a spreadsheet or a LaTeX document, has an
  agent change it while you watch: this slide or every slide, a section, the words, cells or lines you picked, or
  all of it. Each change is a version you can go back from.
- **Pages as PDF and Word**: a page an agent made saves as a PDF or a Word document too.
- **Switch the assistant mid-session**: the message box shows the assistant a session works as (General,
  Researcher, Planner…); pick another, and it takes over from your next message, with its own instructions,
  connected apps and permissions.
- **Search in**: beside the search box, choose where it looks: everywhere, or only the places you tick (sessions,
  messages, spaces, pages, files, settings and more), the same on every device. Spaces are found too.
- **Starting a session flows into it**: what you wrote on the start page becomes your first message right where
  you wrote it, and the message box glides to its place, with no spinner in between.
- **Memory settings on a phone**: each switch says what it does, you can add notes of your own, each note keeps its
  actions in one menu, and notes no agent has needed for months come up to review.
- **The sidebar on phones** slides in smoothly, even while agents work.

## 0.10.1 · 2 November 2026

Pages that look like part of the app: in its theme, and light or dark as the app is.

- **Pages in the app's theme**: the pages agents make take the theme you use, with its colours (your own themes
  too), the app's font and chart colours from it, unless you ask for another look. An open page changes with the
  app when you switch themes.
- **Light or dark as the app is**: a page with light and dark looks of its own shows the one the app is in, not the
  one your device is set to: with the app light on a device set to dark, the page is light.
- **Saved as a file**, a page keeps its ready-made look.

## 0.10.0 · 2 November 2026

A page editor that works on phones and changes whole pages, sign-ins agents use without seeing them, and a
conversation where answers, pictures and screenshots are easier to follow.

- **The page editor, on phones too**: tap a part to pick it and tap it again to type, with a drawer that folds away
  while you write. Make words bold, italic or a link where they are, size a part by its edges, copy, paste and
  wrap parts, and pick them from a tree of layers. Change one part, every part of its kind or class, its look on
  hover, or how it looks on tablets and phones only. The Page tab sets the whole page's colours, fonts and width
  and how its text, headings, links and buttons look; Add has ready-made sections; and Ask the agent tells the
  agent which part you mean.
- **Pages fill their space**: a page opens as wide as there is room for, sits in the middle when it is narrower,
  and shows its own colour behind it in the dark theme, so nothing flashes white. Agents are asked for pages that
  fill the width they get, and a page's card in the conversation is as wide as the message box.
- **Sign-ins agents use without seeing them**: when a task needs a sign-in that isn't saved, the agent asks for all
  of it on one card (an email and a password, a database's address, user and password), then uses it by name:
  typed into a site's sign-in page on its own hosts, put into a web request, or given to a command on this
  computer that you allow, with what comes back hidden.
- **Screenshots, compact**: a reply's screenshots show as one card of small pictures, a screen's before and after
  split down the middle. A picture opens its review, with arrows to the reply's other screens.
- **Pictures you attach show at once**, in your message and in the queue while it waits, and a message sent while
  the agent works no longer shows twice.
- **Answers from their start**: your message moves up as you send it, and a new answer stays where it begins while
  it grows, so you read it from its first line.

## 0.9.0 · 1 November 2026

Pages you watch being written and change yourself, with the agent building on your version; before and after
screenshots of the web apps agents change; and Pages, Preview, Git, Files and Help made anew.

- **Pages you can change**: a page an agent writes shows as it comes, beside the conversation on a wide screen
  (in the conversation on a phone). Change it yourself: click a part to rewrite its words, move, copy or delete
  it, add headings, pictures, tables and more, and change its colours, spacing and width; or edit its HTML with
  the page beside it, at a computer's, tablet's or phone's size. When you save, the agent hears what you changed
  with your next message and builds on your version. HTML files an agent writes open the same way.
- **Pages, redone**: each page as a card with a picture of it, find and sort, and New page to start from a blank
  page, notes, a checklist or a tracker, or to ask an agent for one. A page's Share puts its phone address and
  publishing together, and What it keeps shows the data it keeps, to read, download or clear.
- **Before and after**: when an agent changes how a web app looks, it shows you screenshots of each screen from
  before and after, on a computer's or a phone's screen, to compare with a slider or side by side, with Looks
  good and Change something.
- **Preview, redone**: the web apps running on your computer, told apart from other servers, with their project
  and page title, shown inside the app with an address bar, back, forward and device sizes. Where your browser
  can't reach the preview port (behind a tunnel), it shows pictures of the screen instead. Ask an agent about a
  screen, or save a picture of it.
- **Git, redone**: one Sync button that asks in plain words what to do when both sides moved on; merges that stop
  on conflicts list the files to settle, with an agent to resolve them; the history as a graph with a search,
  where a commit can be explained, reverted, undone or tagged; branches to merge, compare, rename and publish;
  stashes to look inside; diffs side by side, with one part of a file put back; and repositories you add from a
  folder or clone from a link.
- **Files, redone**: places on the left (recent files, home, pinned folders, spaces, the trash), pick several,
  drag to move, a trash to put things back from, and a search that finds names and text under the folder you
  pick. Files go to a space or a new session in a click, and a space can work in folders you have.
- **Help, redone**: one box that searches the guide or asks an agent, topics as cards with pictures, and
  sections to open one by one.
- **Accounts switch at a limit**: a session whose account runs out of usage carries on with another account of
  the same agent, also when the limit stops a turn before its usage was read.
- **Spaces' own skills**: skills only a space's sessions get, written on its Skills tab or copied from the
  library to change for the space alone.
- **The whole app in Chinese and Greek**, with dates written the language's way and notifications in it too.
- **Deep research**: the bar says what it is doing and opens the report when it is ready, and each researcher's
  reply is a line that opens to what it found. Its session opens again instead of a black page.
- **The start page** keeps what you wrote, attached and set while you visit other pages, and Options →
  Guidelines stays open while you type in it.
- Videos, pictures, PDFs and audio over 10 MB open in their player or viewer again.

## 0.8.0 · 1 November 2026

A guide to every part of the app, agents that answer from it and work the app for you, one set of guidelines for
every agent, and every session kept until you no longer need it.

- **Help**: a guide to every part of the app, under Help in the sidebar (where Tour was; the tour starts from
  there), in English, Chinese and Greek. It has contents, a search, and links that open the setting or page they
  name; its sections show in the search box too.
- **Agents that work the app**: ask any agent how something works and it answers from the guide, with a link to
  the place. Ask it to change a setting or set something up (a space, an assistant, a scheduled task, memory
  notes…) and it does it: each change shows you a card first, with what changes, to allow once, for the rest of
  the session, or not. When it needs details from you, it shows a form. Your password, keys, approvals,
  permissions and spending caps stay yours.
- **Agent Guidelines**: one text every agent follows, whichever it is (Claude Code, Codex, Custom or an ACP agent),
  for every session (Settings → Agents → Agent Guidelines), for a space, or for one session (Options on the start
  page, or the session's menu). The more specific wins, and a change reaches a running session from your next
  message. They take the place of Settings → Instructions and "How the agents talk to you" (what you wrote there
  moved in); CLAUDE.md and AGENTS.md stay editable, folded away beneath them.
- **Every session kept**: Claude Code no longer deletes conversations after 30 days, and the app keeps its own link
  to every conversation, so one that an agent's program deletes comes back. Sessions nobody used for a year are
  deleted instead (Settings → General → Delete inactive sessions: on or off, and how long); pinned and busy ones
  stay, and their numbers stay in Activity.
- **Activity by agent and model**: Custom and every other agent by name, in the filter and under By agent; By
  model counts sessions and prompts too, and a click on a model shows the page for it alone.
- **Videos in Files** play in the app's own player: drag or click along the bar (the time shows under the
  pointer, the part loaded is paler), volume, speed from 0.5× to 2×, loop, picture in picture, full screen and
  keyboard shortcuts; on a phone, double-tap a side to skip 10 seconds. Videos stream in parts, so they start at
  once, seek anywhere, and play on iPhones. A video the browser can't play says so and offers the download.
- **Esc no longer stops a session**: it only closes what is open (the find bar, a list, a menu). Stop stops it.
- **The tour** goes straight to each part of the app as it comes to rest, and Settings arrives with the other
  tools.

## 0.7.2 · 1 November 2026

Groups of spaces, a search box that learns what you use, and text cut short that scrolls into view.

- **Groups of spaces**: bring several spaces together in one ("Group spaces together" on the Spaces page, or
  in a space's settings). Sessions started in a group work with all of them: their instructions, their
  folders and their documents, each cited by the space it comes from, beside the group's own and the shared
  knowledge. A group's mark is stacked; a space can be in several groups, but a group holds no other groups.
- **Search learns what you use**: something you picked before for the same words comes first, at once. Among
  the matches, what you pick and the places you visit (pages, Settings sections, sessions, templates, files)
  come up, as much as they match what you typed, and less as time passes. With nothing typed, the places you
  use most are suggested. Your phone and computer learn together.
- **Text cut short scrolls into view**: rest the mouse on a title or name that ends in "…" and it scrolls
  slowly to its end, then back, for as long as you stay. Nothing moves on touch screens, or when your device
  asks for less motion.

## 0.7.1 · 1 November 2026

Spaces in the sidebar, each with documents of its own, and a tidier message box on phones.

- **Spaces in the sidebar**, where Knowledge was. Each space has its own page with its sessions, its
  documents and its settings; the Spaces page's second tab, Shared knowledge, holds the documents every
  session searches.
- **Documents for one space**: a space's Knowledge tab holds documents only its sessions search, and the
  sessions they start. A switch there decides whether they search the shared knowledge too (on unless you
  turn it off). A knowledge base moves into a space, or back to shared, from its menu; deleting a space keeps
  its documents, shared from then on.
- **The message box in a session, on a phone** (or a narrow window): one chip names the model, and the effort
  and permissions when they are not the usual; it opens a sheet with the three and how much of the
  conversation's room is used, with Compact. Nothing is cut off any more; wide windows keep the three side
  by side.
- **Chinese and Greek**: dark mode reads right in the theme hint, counts read right in Greek whatever the
  number, and a few more words are in the right form.

## 0.7.0 · 1 November 2026

The app in Chinese and Greek, hands-free voice, knowledge bases, deep research, spaces, a model arena and an
inbox for everything waiting on you.

- **Your language**: the whole app in Chinese (Simplified) or Greek, picked in Settings → General → Language
  (it starts in your browser's language when it has it). Agents write to you in it too; conversations, files
  and code stay as they were written.
- **Hands-free**: the headphones by the message box open a voice mode for walking. Say "start a session to
  plan my weekend", "how are my sessions doing?", "read me the answer", "approve" or "stop", and hear what it
  did. It tells you when the session it follows finishes or needs you, and keeps the screen on.
- **Inbox**: everything waiting on you, from every session, scheduled task and machine, in one list (the tray
  by the sidebar's title shows how many). Approvals, questions and forms are answered right there. A plain
  yes-or-no approval has Approve and Deny on the push notification itself, where the browser shows buttons.
- **Knowledge bases**: drop documents or a folder in once, on the Knowledge page, and every agent can search
  them: by their words, by what they mean (with search by meaning on) or for exact text, citing the file and
  the page. A folder on this computer is read where it is and kept up to date.
- **Deep research**: one switch under Options. The agent plans the searches, sends researchers after each
  part, digs into what they leave open, checks the key claims against two sources and delivers a cited
  report as a page or a Word document, within the researchers at a time, rounds and searches you set.
- **Spaces**: a project's sessions, files, memory, instructions and assistant together, like Projects in
  ChatGPT or Claude. Pick a space by name in the folder menu instead of a folder; the sidebar's filter shows
  one space's sessions, and the Spaces page keeps them.
- **Model arena**: under Options, send the same prompt to one or two more models, compare their answers side
  by side and keep the best. Usage → Arena shows which models win on your own tasks.
- **Forms from connected apps**: when an app needs something from you partway through (a date, a choice, a
  page to approve on), its form shows as a card in the session, whichever agent is working. Codex's own
  servers ask the same way.
- **Stricter spending caps**: checked after each model call, so a turn stops right after the call that
  reaches the cap, rather than seconds later.
- **A safer browser**: every connection the agents' browser makes goes through a checkpoint of the app's, so
  neither WebSockets nor web addresses that change where they point can reach this computer or its network.
- **Gemini CLI, OpenCode and the other ACP agents** get memory, the assistant and how you like to be talked
  to, like Claude Code and Codex.
- On a phone: the session list scrolls without catching and the drawer opens at once, and a template's result
  table too wide for the screen shows a card a row.

## 0.6.3 · 1 November 2026

Swarm mode for hard problems, agents that clean up after themselves, Templates (what Apps were called), and
a start page made for phones.

- **Swarm**: turn it on under Options when you start a session, and a lead agent sets a team on the task,
  each member attacking it from its own angle. Members post what they try and find to a shared board, read
  each other's posts and message each other; the lead hears how it is going as it goes, starts more members
  as some finish, has the answer checked and stops the rest. The lead's session shows how many are working
  and opens the board, and Settings → Child sessions sets how many work at once (5 to start). It costs
  several times what one agent does: it is meant for a proof, a stubborn bug, a question with many routes.
- **Agents clean up after a task**: once it is done, they remove what they made along the way and no longer
  need (scratch and test files, temporary data, extra branches and worktrees, processes they started), keep
  the work, never touch what they did not make, ask first about anything large or unclear, and say what they
  removed. A new clean-up skill has the method; Settings → Assistants → When a task is done turns it off.
- **Templates** is the new name for Apps: a task you run again and again by filling in a form, ready-made or
  your own (Save as template in a session's menu). Pages are the small tools and pages agents made for you,
  and connected apps your accounts in other services, so the three no longer run together. Scheduled tasks
  start from examples. Links, keys and the API work as before.
- **The start page on a phone**: the agent, model, folder, assistant and Options menus open as sheets from
  the bottom of the screen, clear of the keyboard, and a setting under Options opens over it. The folder
  menu starts with the three folders you used last, on any screen; on a phone its path field waits to be
  tapped, lists subfolders as you type, and no longer adds what you type to the folder in use.
- **The tour**: its setup pages list the steps beside them, and Back, the dots and Next stay in place on
  frosted glass. Fixed: the next page going black, and Next blanking the app in newer Chrome.
- Fixed: without a key, reading a page for a question set Naget Search aside for ten minutes, so searches
  went to DuckDuckGo meanwhile; now the page's paragraphs are picked by their words.

## 0.6.2 · 31 October 2026

A welcome tour that builds the app up as it shows you around, model menus that keep to their agent, and
conversations as wide as the message box.

- **The welcome tour** starts on an empty screen. Setting up what you want to use happens on pages that fill
  the screen; then the app builds itself up as the tour shows it around, each part arriving as it is
  explained: the message box, the row under it, Options, your sessions, the tools and Settings. The rest
  arrives as the tour ends. A new install goes from choosing its password straight into the tour.
- **Model menus** list only the models of the agent a message box is set to: Claude Code's, Codex's or
  Custom's. Picking another agent is the agent menu's job.
- **Continue in another agent**: a Claude Code or Codex session's menu offers Continue in Codex (or Claude
  Code) and, once Custom has a model in Settings → Models, Continue in Custom Agent, beside Fork. The
  message box then says where the next message goes, and the new session opens with the conversation so
  far.
- **Conversations** line up with the message box under them, in sessions and in an app's results. A message
  of yours longer than nine lines folds to its first six, with Show more; Find opens a folded message to
  show what it found.
- Menu items no longer end in "…"; buttons in dialogs keep it.

## 0.6.1 · 31 October 2026

Memory that finds by meaning and keeps itself tidy, one search for everything, and these release notes.

- **Memory** is written by agents when you ask them to remember something or they learn something lasting,
  no longer after every reply. A note can be true only until a date, and agents can correct one in place.
  They start with the notes that bear on what you asked, found by their words and, once you turn on
  search by meaning in Settings → Memory, by what they mean, with LightOn's mDenseOn model on your own
  computer: on a GPU, or on the CPU in about 1.4 GB, only while needed.
- Each night the helper model tidies memory up: it merges notes that say the same thing, dates the ones
  true only for a while and, once a place's notes no longer fit, sums them up in topics and a short
  profile agents get first. Every change can be undone. Settings shows when each note was last needed
  and suggests removing the ones no agent needed for months.
- **Search everything**: Ctrl+K (⌘K on a Mac), or Search in the sidebar, finds pages, every setting,
  sessions and what was said in them, memory notes, apps, scheduled tasks, assistants, skills, pages,
  connections, themes and files, as you type. Opening a result goes where it is: a setting opens its page
  and points at it, a message opens its session at the words. With search by meaning on, things match
  what they mean too, in nine languages.
- **Release notes** for every version, here and from the search box; after an update a note says what
  is new.
- A file opened from a session shows in a dialog over the conversation, which stays where it was. The
  editor fits a phone, and the dark editor uses the app's own colours.
- The start page has one quiet row under the message box (the agent, its model, the folder, the
  assistant), with the rest under Options, and opens with what you picked there last, on any device.
- Settings on wide screens: a tab per group, one scroll, smaller theme cards.
- Sessions open at once, without a fade. A session's … menu shows the main things first and the rest in
  three submenus. A scheduled run's message shows as one line, replies keep their line breaks, and the
  memory chip under a reply shows what changed word by word.
- Apps: ask for changes after a run and the agent hands in the whole updated result; a template's page
  picks the reasoning effort too.
- The sources under a reply include what Claude Code and Codex searched and read with their own web
  tools, and agents know which Pages tool fits what.
- On phones: the usage-limit banner fits, the message box's pickers and the background tasks span the
  screen, and the account buttons wrap under the name.
- Fixed: the browser's … menu opens again after full screen, and nothing in the sidebar shows through the
  full-screen browser.

## 0.6.0 · 31 October 2026

Help with anything: Naget Agent grows from a harness for coding agents into an assistant for any task.

- Every agent gets web search (Naget Search by default) and a browser you can watch and take over.
- Memory of you, each project and each session; documents in and out; connected apps with a vault for
  keys; child sessions; pages and apps you keep; skills; voice; a second opinion; spending caps.
- Custom gets a harness that makes any model work like Claude Code and Codex, Auto mode, fork, edit from
  here and /goal.
- Assistants and task folders for work that is not code; scheduled tasks from chat, with watchers and run
  history.

## 0.5.3 · 31 October 2026

Starts with the computer, and a published Docker image.

- Settings → General: "Start when this computer starts", on by default, for a service of your user, a
  system service or Docker's restart policy. A copy started by hand from a git clone sets up its user
  service the first time it runs.
- Docker: the image is built for linux/amd64 and linux/arm64 and published as nagetai/naget-agent;
  compose pulls it, or builds it here with your own user ids. Its copy of the app updates from the
  public repository.

## 0.5.2 · 31 October 2026

Hugging Face search, and clearer model setup.

- Search Hugging Face by name: each model's maker, size, format (GGUF for Ollama, safetensors for vLLM),
  downloads, likes and date, with a first verdict on how it runs here. Filters and an order; Check shows
  the exact fit, and Install is in the row.
- This computer at a glance: graphics, memory and disk, Ollama and vLLM, and how big a model fits; in the
  tour and in Settings → Models.
- OpenRouter: a "Connected" row, your models listed compactly, and filters that wrap.

## 0.5.1 · 31 October 2026

A mark of its own, and a richer OpenRouter search.

- The new mark: Naget's n holding a gold nugget, on the favicon, the app icons and the loader, arriving
  the way it does in the film.
- OpenRouter search shows each model's maker, context, longest reply, prices, release month and
  description, with badges for new, free, reasoning, images and models without native tool calls.
  Filters and an order; browsing works without a query.

## 0.5.0 · 31 October 2026

Naget Agent, a tour that adapts to what you use, and blurred backdrops.

- The app is renamed Naget Agent, a self-hosted agent harness; installs from before keep their service,
  data folder and settings. The built-in agent is called Custom.
- The welcome tour asks what you want to use (Claude Code, Codex, models through OpenRouter or on this
  computer, other agents), sets each up in place, and words the rest of the tour for those.
- Dialogs, the drawer, the palette and viewers blur the page behind them.
- The history no longer jumps while you type a message of several lines.

## 0.4.1 · 31 October 2026

Console (now Custom) uses Codex's MCP servers too, from ~/.codex/config.toml, beside Claude Code's and the
project's.

## 0.4.0 · 31 October 2026

Commit, branches and stashes on the Git page.

- Pick the files to commit, see each diff in place, discard a file's changes, and commit or commit and
  push. "Write message" drafts the message in the style of the repository's recent commits.
- Switch, create and delete merged branches from the branch name.
- Stash every change and apply it again later; any commit opens to its files and diffs.

## 0.3.2 · 31 October 2026

The sidebar's sessions show the moment it opens.

## 0.3.1 · 31 October 2026

One agent picker on the start page, listing Claude Code, Codex, Console and any agent you added alike.

## 0.3.0 · 31 October 2026

Console, the app's own agent, for any model; models from Hugging Face; agent programs that install
themselves.

- Console (now Custom) works with OpenRouter, Ollama, Hugging Face models served here with vLLM, or any
  OpenAI-compatible endpoint: it reads, edits and searches files, runs commands, keeps a plan, loads
  skills and uses MCP servers, asking before edits and commands by mode.
- Settings → Models: an OpenRouter key and pinned models; Ollama and vLLM found by themselves; a model
  from Hugging Face shows first whether and how it runs here, then installs.
- Claude Code, Gemini CLI, OpenCode and the other agents install by themselves when needed, and stay up
  to date.

## 0.2.1 · 31 October 2026

On phones the drawer fills the screen and each session has a delete button; in a session the
conversation fades out under the header.

## 0.2.0 · 31 October 2026

Updates install themselves; phone layouts, motion and an app-mark loader.

- A copy installed from git checks for a newer version once a day and installs it by itself after 5 hours
  without a message from you (Settings → General), or at once with "Update now", while agents carry on.
- Phones: a compact drawer, and Activity, System, Files and the start page fit the screen.
- Activity starts at the first month with data, and offers to keep Claude Code's conversations past its
  30 days.
- Small motion across the app: icons that answer the pointer, tiles that count up, meters that grow.

## 0.1.0 · 30 October 2026

The first release, as Agent Console: a self-hosted web app that runs the official Claude Code and Codex
on your machine, with one interface for desk and phone: live timelines in plain words, approvals, diffs,
notifications and push, pull requests and reviews, terminal, files, git, notebooks, scheduled tasks,
usage limits, several accounts and machines, and agents that speak ACP.
