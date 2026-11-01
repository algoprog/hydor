# Release notes

What changed in each version of Naget Agent, newest first. The app shows these in Settings → General →
Release notes, and says what is new after it updates.

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
