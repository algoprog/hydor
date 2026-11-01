# Features

Everything Naget Agent does, by area. [Back to the README](../README.md).

## Sessions
- Start a Claude Code or Codex session in any folder, optionally in a worktree of its own (a new branch in a
  separate folder, so several agents can change one repository at once). Pick the model, how hard it
  thinks, and what it may do without asking you. The start page opens with what you picked there last,
  on any device: the agent and its model, the folder, the assistant, memory and a spending cap. What you
  write in a message box, with the files you attach, waits there while you look at other pages.
- Switch models mid-session; the model menu lists the session's own agent's models. "Continue in Codex" (or
  Claude Code, or Custom Agent) in the session's menu hands the conversation over to another agent.
- Fork a session from any reply, or edit an earlier message and go on from there, with the files put back as
  they were. Compact a long session, stop a turn, resume an old one.
- Give a session a goal (`/goal`): the agent keeps working, turn after turn, until it holds.
- Every session on the machine is listed, including ones open in VS Code or a terminal, with what each is
  doing right now. Snooze one until later, or settle it when you are done for now.
- More agents: besides Claude Code and Codex, any agent that speaks the Agent Client Protocol (Gemini CLI,
  OpenCode, Qwen Code, Goose, Kimi CLI, Auggie, or a command of your own).
- Several accounts per agent: sign in more than one Claude or Codex account and pick one per session; each
  shows its own usage and limits. With **Switch accounts at a limit** on, the app uses them all: a session whose
  account runs out of usage moves, with its history, to another account with usage left and carries on.

## Help with anything

Every agent here gets the same help from the app, whatever its model: Claude Code, Codex, Custom, and the
agents that speak ACP and take MCP servers.

- **Assistants**: start as a Researcher, Writer, Tutor, Planner, Analyst or Coder, or one of your own (its
  instructions, model, tools and connected apps; import Claude Code's agent files). A task without a folder gets
  one of its own (`~/Naget/<date>-<task>`).
- **Agent Guidelines**: what you want every agent to follow (how you like to work, what to always or never do,
  how to talk to you), written once and given to every agent by the app itself, whichever it is: Claude Code,
  Codex, Custom or an ACP agent. Three levels: every session (Settings → Agents → Agent Guidelines), a space, and
  one session (the start page's Options, or the session's menu); the more specific wins. A changed session's
  agent follows the new ones from the next message. CLAUDE.md and AGENTS.md still work, and can be edited there too.
- **Agents that work the app**: every agent knows the app's own guide (the `app_guide` tool) and answers questions
  about it from there, with links to the place. Ask it to change a setting or set something up (a space, an
  assistant, a scheduled task, memory notes…) and it does it through the app's API (`app_api`): reading runs at
  once, and each change shows you a card first, with what changes before → after, to allow once, for the rest of
  the session, or not. When it needs details it shows a form (`ask_form`). Passwords, keys' values, approvals,
  permissions, spending caps, files and commands stay yours.
- **The web**: search with Naget Search (its own index of the web, papers, patents and filings; free daily
  searches without a key) or SearXNG, Brave Search and DuckDuckGo, by category, site or date, up to 100 results;
  read whole pages, or only the parts that answer a question. Each search shows its results, and each reply its
  sources. [Search providers](search-providers.md).
- **A browser**: agents open sites, click, type and read pages, in a Chromium of their own. You watch it live
  above the message box and take over to log in, solve a check or pay, on a computer or a phone; sites on your
  own network stay off limits unless you allow one.
- **Memory**: agents save notes about you, the project and the session when you ask or they learn something
  lasting, some only until a date, and a chip under the reply shows what changed (undo, edit, delete). Each
  agent starts with the notes that bear on what you asked, found by words and, once you turn it on, by meaning,
  with LightOn's mDenseOn model on your own computer (on a GPU, or on the CPU in about 1.5 GB, only while
  needed). Each night the helper model tidies memory up: it merges notes that say the same thing and, when
  there are more than fit, sums related ones up in topics and a short profile; every change can be undone.
  Settings → Memory lists every note with when it was written, changed and last needed, and suggests
  removing the ones no agent needed for months. Turn it off for one session or for all. Agents can also look
  up earlier sessions.
- **Spaces** (in the sidebar): a project's sessions, files, documents, memory, guidelines, skills and assistant
  together, like Projects in ChatGPT or Claude. Pick a space by name in the start page's folder menu instead of a
  folder: its sessions work in its own folder (a new one, or one you have) and any other folders of yours it works
  with, are told what its folder holds, remember what its earlier sessions learned, search its documents, get its
  guidelines and its own skills and start as its assistant. Its Files tab shows its folders; files come in from
  Files, a file's window or an agent's file cards with Add to a space. Its Skills tab holds skills only its
  sessions get, with the skill library: written there, copied from the library to change for the space alone, or
  proposed by an agent working in it and kept for the space when you approve. A group brings several spaces
  together: its sessions work with all of them, their folders, documents, guidelines and skills. The sidebar's
  filter shows one space's sessions.
- **Knowledge bases**: drop documents or a folder in once, and agents can search them: by their words (a
  full-text index ranked by BM25), by what they mean (local embeddings, with search by meaning on) or for exact
  text, as grep would; each passage cites its file and page. A folder on this computer is read where it is and
  kept up to date. Shared knowledge (Spaces → Shared knowledge) is searched by every session; a space's own
  documents (its Knowledge tab) by its sessions alone, which search the shared knowledge too unless the space
  turns that off.
- **Documents**: agents read PDF, Word, Excel, PowerPoint, OpenDocument and EPUB files, and make them with the
  app's document skills; the file viewer previews them, and finished files show as cards to open or download.
  Images can be made and edited through OpenRouter.
- **Connections**: a marketplace of apps and services (Notion, Linear, GitHub, Google, Stripe and more), signed
  in once for every agent; anyone can add one with a pull request to `catalog/`. Keys live in an encrypted
  vault: agents ask for one with a card and use it without ever seeing it. When an app needs something from
  you partway through (a date, a choice, a page to approve on), its form shows as a card in the session,
  whichever agent is working; Codex's own servers ask the same way.
- **Child sessions**: an agent hands parts of a job to new sessions, with any agent and model, and gets their
  results back, each a line in its conversation that opens to the reply; they show under it in the sidebar.
- **Deep research**: one switch under Options. The agent plans the searches a question needs, sends researchers
  (child sessions) after each part, digs into what they leave open, has the key claims checked against two
  sources, and delivers a cited report as a page or a Word document. How many researchers at a time, how many
  rounds and how many searches in all are yours to set; a bar in the session says what it is doing and the
  searches used, and opens the report once it is ready.
- **Pages and templates**: pages the agents show can answer back (pick an option, fill in a form), stay in a
  library with storage of their own and an address for a phone's home screen, and folders publish at a link.
  Templates are tasks you repeat, each with a form: ready-made or your own, run from the Templates page, the
  API, MCP, a public page, or once for each row of a CSV. Follow-ups refine a run's result, asked on its page
  or in its session, which opens on that result with a switch to the conversation.
- **Skills**: a library that comes with the app (clarify first, check before saying it is done,
  troubleshooting, research, writing, documents) for every agent, and skills of a space's own for its sessions.
  Agents propose new skills or fixes to them, saved only when you approve, in the library or, in a space, for the
  space alone.
- **Voice**: dictate into the message box, with the browser's own recognition or, when you turn it on, a model
  on this machine; replies can be read aloud. Hands-free mode (the headphones by the message box) is for
  walking: say what you want, and it starts, steers and checks sessions, answers approvals and reads you the
  results, telling you when the session it follows finishes or needs you.
- **Your language**: the app in English, Chinese (Simplified) or Greek (Settings → General → Language), with
  dates and times written that way and notifications in it too, and agents write to you in it. Translations
  live in `web/src/i18n`: `npm run i18n:extract` lists every string, the server's messages and what ships with
  the app (skills, connections, search providers) included.
- **Model arena**: under Options, send the same prompt to one or two more models; their answers show side by
  side, you keep the best one and the others are archived. Usage → Arena shows which models win on your own
  tasks, as a rating over the matches you decided.
- **A second opinion, and caps**: one click has another company's model check a turn's work against what you
  asked; a spending cap stops a session, or a scheduled task's run, at its limit, checked after each model call.

## Custom: any model

Custom is the app's own agent, for models beyond Claude Code's and Codex's. It works like them: it reads,
edits and searches files, runs commands, keeps a plan, loads skills, uses the MCP servers set up for Claude
Code and for Codex (and the project's `.mcp.json`), asks before edits and commands (or not, by mode), and condenses a
long conversation to stay within the model's context. In Auto mode routine steps go ahead and a quick check asks you
about risky ones, and commands can run in a sandbox that lets them change files only in the folder and /tmp. Forks,
"Edit from here" (with the files put back) and `/goal` work for it as they do for Claude Code and Codex.

- **A helper for anything**: research, writing, documents and everyday tasks, with an engineer's habits in a code
  project (it runs the project's checks before it says it is done). It reads PDFs, Office files and images
  (described by the helper model for a model that does not see), and web pages as clean Markdown.
- **Careful with commands**: each part of a command is checked. "Always allow" covers just the commands you
  approved (`git status`, `npm run build`), so nothing can ride along after `&&`; commands that only look
  around run freely; risky ones (sudo, deleting outside the folder, running a download) ask every time, in every
  mode. Files outside the folder and files with keys or passwords ask before they are read or changed.
- **Made for any model**: long output is kept in a file the model can page through, repeated or stuck steps
  are caught, malformed tool calls are repaired, independent reads run together, servers run in the
  background, and each model family gets its maker's sampling, edit format and reasoning effort. With many
  tools, the model sees a short catalog and looks up the ones it needs.

Its models come from Settings → Models:

- **OpenRouter**: add a key, then search its catalog (each model's maker, context, longest reply, price,
  release date, and whether it reasons, sees images or calls tools; filter and sort) and add the models to offer.
- **Ollama**: the models of an Ollama server, with GGUF weights pulled straight from Hugging Face.
- **vLLM**: Hugging Face models downloaded here and served on a GPU, started when a session first uses them.
- **Any OpenAI-compatible endpoint** (LM Studio, llama.cpp's server, another provider).

Hugging Face is searched by name, like OpenRouter's catalog: each model shows its maker, size, format (GGUF
for Ollama, safetensors for vLLM), downloads, likes and date, and a first verdict from its size on how it
would run here (a model too big for vLLM as stored may still run at 4-bit with Ollama). Filter to what runs
well here, a format, or models that see images; order by downloads, trend, likes or date. Before anything
downloads, Check tells exactly how it would run on this machine: where (a GPU, or the CPU),
the memory it needs, about how fast, and the disk it takes. Installed models show their size and remove
with one click. Models without native tool calls are told about the tools in their own format, or in the
prompt, and their calls are read from what they write.

The agents' own programs install by themselves when first needed (Claude Code, Gemini CLI, OpenCode…,
with npm into the app's folder), and the copies the app installed are kept up to date.

## Following along
- A readable timeline: the agent's messages read like a chat, and its commands fold into small boxes with
  plain-words names ("Run the tests", "Read index.ts"), each a click away from its full output.
- Agents can answer with a page (a chart, a report, a mock-up), shown in the conversation.
- Every file a turn changed, with its diff. Screenshots you attach show in the conversation and open full size.
- Approve or deny commands and edits, approve plans, and answer the agent's questions from cards in the page.
- Message the agent while it works: your note joins the running turn, or waits in a queue you can reorder and
  edit, attachments included. Quote any part of a reply into your next message.
- Notifications when a session finishes, fails or needs you: in the app, as a system notification, or as a
  push notification on your phone with the app closed. A plain yes-or-no approval has Approve and Deny right
  on the notification (where the browser shows buttons), and the Inbox lists everything waiting on you across
  sessions, scheduled tasks and machines, with approvals, questions and forms answered right there.

## Shipping the work
- Open a pull request on GitHub or Gitea from a session's branch, with a description written for you; its
  state and checks show in the sidebar.
- Review what a branch changes file by file, mark files viewed, and let a guide put them in an order that is
  easy to read, with a note on each.
- Share a session with a read-only link that ends when you want.

## Around the agents
- Files: places to start from (recent files, home, pinned folders, your spaces' folders, the folders sessions
  worked in, the trash), and each folder as a list with dates, sizes and git status (folders open in place, as a
  tree) or as tiles with pictures; sort, narrow as you type, pick several, drag to move (Alt copies) or to
  upload, keys for everything. Each file or folder's menu: start a session with it (named by its path, nothing
  uploaded), add it to a space (a file is copied into its folder, a folder joins those it works with), rename,
  duplicate, move or copy to a folder, download (a folder or several as one .zip), delete to a trash with Undo
  and Put back. One search finds names and text inside files, under a folder you pick, by kind. An editor with
  Markdown and HTML preview and diffs, quick open, and uploads. Jupyter notebooks open and run. Videos play in the app's own player (seek with a
  preview of the time, speed, loop, picture in picture, full screen, keyboard shortcuts, double-tap to skip on a
  phone), streamed in parts so they start at once and seek anywhere.
- Git: your repositories with their changes, ahead/behind counts, fetch, pull and push. Commit from the app (pick
  the files, see each diff, have the message drafted from the changes, commit and push in one go), discard a
  file's changes, switch or create branches and delete merged ones, stash and apply, and open any commit to
  see what it changed.
- Terminal: real shells that survive reloads and server restarts, with suggestions as you type (from your
  history, branches, scripts and folders, or written from a plain description) and an extra row of keys on
  phones.
- Scheduled tasks: agent work, by any agent (Custom included), that starts at a time of day in your time zone,
  every few minutes, once, by a cron expression, when a webhook is called, or when a watcher sees a change (new
  items in a feed, a page or a value in JSON changing, new files in a folder, a command's output): watchers
  check without a model and wake the agent only then. Ask in any conversation ("remind me Friday at 9", "every
  Monday summarize…") and confirm the task in a card; or start from a template, or turn a session that worked
  into one. Each run reports how it went: its history keeps the outcome, a summary, the cost and the session,
  and runs again with the same input. Runs with nothing to report stay quiet, failures always tell you, and
  failures in a row pause the task. Webhooks can require a signature, skip repeated deliveries, filter on the
  payload, and wait for the reply (`?wait=60`). Sessions stopped by a usage limit can continue by themselves
  when it resets.
- Usage: how much of each plan's limits you have used and when they reset, what the same work would cost
  through the API, and activity over time, for every agent or one (Custom and the ACP agents by name) and every
  model or one.
- Every session is kept, whatever the agent's own program does: Claude Code is told to keep its conversations,
  and the app keeps its own link to every conversation file (no extra disk), so one that gets deleted comes back.
  Sessions nobody used for a year are deleted (Settings → General → Delete inactive sessions: on or off, and how
  long); pinned and busy ones stay, and their numbers stay in Activity.
- System: CPU, memory, GPUs, disks, network and the busiest processes, live.
- Settings: sign the agents in and out from the browser, and manage MCP servers, skills, plugins, Agent
  Guidelines and the CLAUDE.md / AGENTS.md instruction files.
- An MCP server of its own, so an agent elsewhere can list, read, start and steer sessions here.

## Everywhere
- Works on phones and can be installed as an app. Four themes, light and dark, and your own: every colour
  can be changed.
- One search for everything, like Spotlight: `Ctrl+K` (⌘K on a Mac) or Search in the sidebar finds pages,
  every setting, sessions and what was said in them, memory notes, templates, scheduled tasks, assistants, skills,
  pages, connections, themes and files, as you type. Opening a result goes where it is: a setting opens its
  page and points at it, a message opens its session at the words. With search by meaning on (Settings →
  Memory) things also match what they mean, in nine languages; what ships with the app has its vectors made
  ahead of time, and what you make gets them as you make it. `Ctrl+F` finds within a conversation.
- A short welcome tour asks what you want to use (Claude Code, Codex, models through OpenRouter or on this
  computer, other agents) and sets those up, on pages that fill the screen. Then it shows you around as the
  app builds itself up: each part arrives as it is explained, the rest as the tour ends. Help shows it again.
- Help (in the sidebar): a guide to every part of the app, its topics grouped on one page, each with a picture of
  that part of the app and its sections to open one at a time. One box finds sections as you type, or asks an
  agent on Enter: the answer, from the guide with links that open the place they name, shows in a panel beside
  it, and the agent can set things up for you there too. Its sections show in the search box as well. The same
  guide is in [docs/guide](guide/).
- Starts when the computer starts (on by default; Settings → General), as a service of your user.
- Several machines: add other machines running Naget Agent, over SSH or by address, and switch between
  them from the sidebar. Notices from all of them reach you wherever you are.
