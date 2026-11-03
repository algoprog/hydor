# Features

Everything Naget Agent does, by area. [Back to the README](../README.md).

## Sessions
- The prompt bar’s Stop button shows a rotating ring while a session starts or works, paused while
  waiting for you and respecting reduced-motion preferences.
- Start a Claude Code or Codex session in any folder, optionally in a worktree of its own (a new branch in a
  separate folder, so several agents can change one repository at once). Pick the model, how hard it
  thinks, and what it may do without asking you. The start page opens with what you picked there last,
  on any device: the agent and its model, the folder, the assistant, memory and a spending cap. What you
  write in a message box, with the files you attach, waits there while you look at other pages. As a
  session starts, the start page becomes it: the box moves down to its place and what you wrote moves up
  as your first message.
- Switch models or assistants mid-session; the model menu lists the session's own agent's models, and another
  assistant applies from your next message, the conversation carrying on. "Continue in Codex" (or
  Claude Code, or Custom Agent) in the session's menu hands the conversation over to another agent.
- Fork a session from any reply, or edit an earlier message and go on from there, with the files put back as
  they were. Compact a long session, stop a turn, resume an old one.
- Give a session a goal (`/goal`): the agent keeps working, turn after turn, until it holds.
- Every session on the machine is listed, including ones open in VS Code or a terminal, with what each is
  doing right now: Active lists all sessions with activity in the last five minutes, including finished ones,
  and moves them back to their usual group after five quiet minutes. Sessions awaiting automatic resume
  after a usage limit stay in Active until that scheduled resume is cleared. Pinned comes next, then Projects: a group for each space and each folder you picked
  (task folders, the home folder and temporary ones go by day), foldable, a line per session, with a pen to
  start a new session there; then the rest by day. Each row's ⋯ (or a right-click) renames, pins, snoozes
  (until later), settles (done for now), archives or deletes the session, on phones too.
- More agents: besides Claude Code and Codex, any agent that speaks the Agent Client Protocol (Gemini CLI,
  OpenCode, Qwen Code, Goose, Kimi CLI, Auggie, or a command of your own).
- Several accounts per agent: sign in more than one Claude or Codex account and pick one per session; each
  shows its own usage and limits. With **Switch accounts at a limit** (on by default), the app uses them all: a session whose
  account runs out of usage moves, with its history, to another account with usage left and carries on.

## Help with anything

Every agent here gets the same help from the app, whatever its model: Claude Code, Codex, Custom, and the
agents that speak ACP and take MCP servers.

- **Assistants**: start as a Researcher, Writer, Tutor, Planner, Analyst, Coder or App builder (it makes
  apps), or one of your own (its instructions, model, tools and connected accounts; import Claude Code's agent
  files), and switch to another in the session's message box when the work changes. A task without a folder gets
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
  above the message box and take over to log in, solve a check or pay, on a computer or a phone; with a sign-in
  saved in the vault, the agent signs in itself, typing the password without seeing it, on that site only. Sites
  on your own network stay off limits unless you allow one.
- **Memory**: agents save notes about you, the project and the session when you ask or they learn something
  lasting, some only until a date, and a chip under the reply shows what changed (undo, edit, delete). Each
  agent starts with the notes that bear on what you asked, found by words and, once you turn it on, by meaning,
  with LightOn's mDenseOn model on your own computer (on a GPU, or on the CPU in about 1.5 GB, only while
  needed). Each night the helper model tidies memory up: it merges notes that say the same thing and, when
  there are more than fit, sums related ones up in topics and a short profile; every change can be undone.
  Settings → Memory lists every note with when it was written, changed and last needed, lets you add your
  own, and suggests removing the ones no agent needed for months. Turn it off for one session or for all.
  Agents can also look up earlier sessions.
- **Spaces** (in the sidebar): a project's sessions, files, documents, memory, guidelines, skills and assistant
  together, like Projects in ChatGPT or Claude. Pick a space by name in the start page's folder menu instead of a
  folder: its sessions work in its own folder (a new one, or one you have) and any other folders of yours it works
  with, are told what its folder holds, remember what its earlier sessions learned, search its documents, get its
  guidelines and its own skills and start as its assistant. Its Files tab shows its folders; files come in from
  Files, a file's window or an agent's file cards with Add to a space. Its Skills tab holds skills only its
  sessions get, with the skill library: written there, copied from the library to change for the space alone, or
  proposed by an agent working in it and kept for the space when you approve. A group brings several spaces
  together: its sessions work with all of them, their folders, documents, guidelines and skills. The sidebar
  groups each space's sessions under its name, and its filter shows one space's sessions.
- **Knowledge bases**: drop documents or a folder in once, and agents can search them: by their words (a
  full-text index ranked by BM25), by what they mean (local embeddings, with search by meaning on) or for exact
  text, as grep would; each passage cites its file and page. A folder on this computer is read where it is and
  kept up to date. Shared knowledge (Spaces → Shared knowledge) is searched by every session; a space's own
  documents (its Knowledge tab) by its sessions alone, which search the shared knowledge too unless the space
  turns that off.
- **Documents**: agents read PDF, Word, Excel, PowerPoint, OpenDocument and EPUB files, and make them with the
  app's document skills; the file viewer previews them, and finished files show as cards to open or download.
- **Images and videos**: agents make pictures (or change yours) and short videos (from words, from a picture to
  start or end on, or by changing a video) with OpenRouter's image and video models, the ones picked in Settings →
  Images and video or one you name. First a form in the conversation shows the settings that model takes (shape,
  resolution, quality, how many, length, sound) and what the result costs; it comes once per model in a session,
  and scheduled tasks and apps' runs go without it. A video is a job the app follows to its end, also after the
  agent stops waiting, and plays in the app's own player. **Save to Library** keeps one in the Library, where a
  model that sees images writes its title and description (a video's from ten of its frames on one picture, with
  ffmpeg): the app's choice, any of OpenRouter's vision models, Claude through Claude Code, or a model of your own
  (Ollama, vLLM, an endpoint). The Library's Media tab finds, plays, downloads and edits them, and agents can work
  from them.
- **Connections**: a marketplace of apps and services (Notion, Linear, GitHub, Google, Stripe and more), signed
  in once for every agent; anyone can add one with a pull request to `catalog/`. Keys and sign-ins live in an
  encrypted vault: when a task needs one that isn't there, the agent asks with a card (one key, or a sign-in's
  fields), and uses it by name without ever seeing it, in API calls and site sign-ins on the hosts you allow, and
  in commands on this computer that you allow (what they print comes back masked). When an app needs something from
  you partway through (a date, a choice, a page to approve on), its form shows as a card in the session,
  whichever agent is working; Codex's own servers ask the same way.
- **Child sessions**: an agent hands parts of a job to new sessions, with any agent and model, and gets their
  results back, each a line in its conversation that opens to the reply; they show under it in the sidebar.
- **Deep research**: one switch under Options. The agent plans the searches a question needs, sends researchers
  (child sessions) after each part, digs into what they leave open, has the key claims checked against two
  sources, and delivers a cited report as a page or a Word document. How many researchers at a time, how many
  rounds and how many searches in all are yours to set; a bar in the session says what it is doing and the
  searches used, and opens the report once it is ready.
- **Pages and apps**: pages the agents show can answer back (pick an option, fill in a form), stay in the
  Library with pictures, storage of their own and an address for a phone's home screen, and folders publish at a
  link. A page shows as the agent writes it (beside the conversation on a wide screen), fills the width it gets,
  looks like part of the app (its theme, light or dark as the app is, your colours and the app's font, unless you
  ask for another look), and you can change it in a visual editor that works on a phone too: click or tap a part to rewrite its words
  (bold, italic, links), restyle it (this part, every part of its kind or class, on hover, or for tablets and
  phones only), move, size, copy, wrap or delete it, pick it from its layers, add parts and ready-made sections,
  set the whole page's colours, fonts, width and the look of its headings, links and buttons, ask the agent about
  a part, or edit its HTML with the page beside it; the agent hears of your changes with your next message.
  HTML files an agent writes open the same way. Make pages of your own from a blank page, notes, a checklist or
  a tracker, and see or clear the data a page keeps. Export a page as a PDF, a Word document (headings, lists,
  tables, links, charts as pictures) or a web page; ask an agent to change the page, slides, document, spreadsheet
  or LaTeX you have open (this slide, every slide, a section, the cells picked, the part picked, all of it) and
  watch it change as it saves. Apps are tasks you repeat, each with a form: ready-made or your own (described in a
  box at the top of the Apps page for the App builder to make, or built from scratch, each card saying what it is
  made of), run from the Apps page, the API, MCP, a public page, or once for each row of a CSV. The ready-made ones
  work in steps (Deep research plans its questions, searches them a few at a time, ranks the sources in code,
  reads the best in parallel, searches again for gaps and writes a cited report), and an app's page shows how it
  works with a way to its graph. Follow-ups refine a run's
  result, asked on its page or in its session, which opens on that result with a switch to the conversation.
  An app can also work in steps (an agent, a quick model answer, a tool, a decision by a rule or in words, a
  repeat over a list or until something holds, branches side by side, another app, its own data, a question
  to you that it waits for, built-in values (today, now, the day of the week, the time zone where you are, what
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
  apps with tools of their own: app_get, app_save (checked first; whole, a patch or one step), app_try (its
  examples or a set of answers, waited for), app_screen and app_data (the records it keeps: read, or added to). A
  app an agent saves opens beside its conversation, where what you change and save reaches the agent with
  your next message (its next save reads your version first). A tool, model, code, data or app step that fails
  can have an agent do its work, so the run goes on; Edit shows the steps that had to, with Ask an agent to fix
  it, and offers Firm it up for an agent step that did the same in each of its last runs: fixed steps in its
  place (the tools it called, with the values it called them with, then a model step), tried on its examples
  first, with what a run takes and costs either way. Beside a conversation, a step's menu has Ask the agent about
  it. Its steps, its agents and programs search its records by words and by meaning, as knowledge bases are
  searched. An app can have a screen of its own in place of its form: a page made from its parts (its form,
  its answer, a table for each list it keeps, its earlier runs) that runs it and changes as its records do,
  edited in the Library's page editor (whose Add has an App tab with those parts) or by an agent, with buttons for its other
  flows and a conversation with its agent, who finds and changes its records and runs its flows for you (the
  latest conversation shows on return; earlier ones a click away). Apps travel as one file (.naget-app or .json, with their records, screens and the apps they
  call), installed after a card that says what they will do here and offers one of your models for any it asks
  for that is not set up here.
- **Slides**: decks kept in the Library, made by an agent (save_slides, from layouts or parts placed by position) or
  from eight ready-made looks, and edited as in PowerPoint or Google Slides: slides to reorder, copy and skip, 15
  layouts, text boxes with rich text, bullets and numbering, 20 shapes, pictures, lines and arrows, tables and
  charts (column, bar, line, area, pie, doughnut), snapping guides, alignment, stacking, undo, copy and paste;
  animations in order (on a click, with or after the one before, a paragraph at a time) and transitions; themes
  of colours and fonts; speaker notes; a slideshow (keys, swipes, black and white screens, every slide at once)
  and a presenter's view with notes, the next slide, a timer and an audience window that follows it. They export
  as PowerPoint (every part still editable, native charts, notes, transitions and animations), PDF or a web page
  that presents itself, and open as a slideshow at their own address or a published link.
- **Documents, spreadsheets and LaTeX**: kept in the Library beside slides, each with versions, a picture in the list,
  its own address and an agent that changes it on request. Documents (save_doc, written in Markdown, or opened from
  a Word, Markdown, text or HTML file) are edited as in Word or Google Docs on a page of their paper: paragraph
  styles, fonts, sizes, colours and highlights, links, alignment, bullets, numbers and checklists, tables, pictures
  with captions, lines and page breaks, Markdown shortcuts as you type, paste from Word and Google Docs cleaned, an
  outline and a word count; they export as Word (styles, lists, tables and pictures as Word's own), PDF on their
  paper, Markdown or a web page. Spreadsheets (save_sheet, with formulas, or opened from an Excel, ODS, CSV or TSV
  file) work as in Excel or Google Sheets: a grid that stays quick with thousands of rows, frozen rows and columns,
  sizes to drag, about two hundred of Excel's functions worked out as you type (lookups, criteria, dates, text,
  loans), references that move as cells are copied, filled, inserted and deleted, number formats, styles, sorting,
  several sheets, copy and paste with Excel and Google Sheets, and the sum, average and count of what is picked;
  they export as Excel (formulas, formats, widths and frozen panes kept), CSV or PDF. LaTeX documents (save_latex, or opened from a .tex file or a project's .zip) keep
  their source files and pictures, typeset on this computer (pdfLaTeX, XeLaTeX or LuaLaTeX, with BibTeX) as you
  type, beside the pages: errors and warnings at their lines, the log, an outline, snippets, completion of
  citations, labels and pictures, and a jump between a place on a page and its line. TeX runs in a folder of its
  own, with no shell escape and, where bubblewrap is installed, in its sandbox. They export as the PDF, the main
  .tex file or the whole project as a .zip.
- **Skills**: a library that comes with the app (clarify first, check before saying it is done, troubleshooting,
  research, writing, documents, building apps) for every agent, and skills of a space's own for its
  sessions. Agents propose new skills or fixes to them, saved only when you approve, in the library or, in a
  space, for the space alone.
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

OpenRouter session costs and token usage show above the message box without a spending cap. Charges come from OpenRouter automatically, with its generation records and catalog prices as fallbacks; its catalog also supplies Usage estimates, so no manual prices are required.

Custom is the app's own agent, for models beyond Claude Code's and Codex's. Its working and starting indicators use the Naget loading animation, vertically centred beside their text. It works like them: it reads,
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
with npm into the app's folder), and stay up to date: once a day each is brought to its newest version, the
app's copies with npm and your own installs with their own updater (`claude update`, `codex update`,
`opencode upgrade`, or npm for `npm install -g` ones), Claude Code on its own release line (stable or latest). A
new version is kept only once it starts and answers the way the sessions use it (no sign-in or usage needed);
one that does not is undone, and the sessions keep running the version before. Settings → Accounts → Agent
programs shows each program's version and what is out, with Check now, Update now and Update automatically.

## Following along
- A readable timeline: the agent's messages read like a chat, and its commands fold into small boxes with
  plain-words names ("Run the tests", "Read index.ts"), each a click away from its full output. A reply starts
  near the top of the screen and stays there as it grows, so you read it from its beginning.
- Agents can answer with a page (a chart, a report, a mock-up), shown in the conversation as it is written, or
  beside it on a wide screen.
- Before and after: when an agent changes how a web app looks, it shows screenshots of each screen it changed
  from before and after, on a computer's or a phone's screen: a reply's screenshots as one card of small
  pictures, each opening a review (beside the conversation, or over the app on a phone) with a slider or side by
  side, and arrows to the reply's other screens.
- Every file a turn changed, with its diff, and the commits it made, each opening to its message and diff. Screenshots you attach show in the conversation and open full size.
- Approve or deny commands and edits, approve plans, and answer the agent's questions from cards in the page.
- Message the agent while it works: your note joins the running turn, or waits in a queue you can reorder and
  edit, attachments included. Quote any part of a reply, or of your own
  messages, into your next message.
- Notifications when a session finishes, fails or needs you: in the app, as a system notification, or as a push
  notification on your phone with the app closed; agents and apps' steps can also send you one themselves
  (notify_user) for what cannot wait. A plain yes-or-no approval has Approve and Deny right on the notification
  (where the browser shows buttons), and the Inbox lists everything waiting on you across sessions, scheduled
  tasks and machines, with approvals, questions and forms answered right there.

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
  Markdown and HTML preview and diffs, quick open, and uploads. Ask, beside an open file, has an agent change it
  or answer about it: unsaved changes are saved first, the conversation stays beside the file, and the editor
  takes in each change as it is written (every second while an agent works), the changed lines tinted for a
  moment and your place kept. Word, Excel, CSV and LaTeX files open in the
  Library's editors and save back to the same file: a CSV's untouched rows and cells keep their exact text, a LaTeX file
  brings the chapters and bibliography it reads and typesets among its folder's pictures (read only to TeX),
  writing only the files that changed; a Word or Excel file says first what the editor doesn't keep (headers and
  footers, comments, charts…), offers to save a copy instead, and its first save keeps the old file in the trash.
  Jupyter notebooks open and run. Videos play in the app's own player (seek with a
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
  address bar, back and forward; as pictures taken on this computer where the browser can't reach the preview
  port (behind a tunnel); and a screen goes to a new session as a picture, with a question.
- Terminal: real shells that survive reloads and server restarts, with suggestions as you type (from your
  history, branches, scripts and folders, or written from a plain description) and an extra row of keys on
  phones.
- Scheduled tasks: agent work, by any agent (Custom included), that starts at a time of day in your time zone,
  every few minutes, once, by a cron expression, when a webhook is called, or when a watcher sees a change (new
  items in a feed, a page or a value in JSON changing, new files in a folder, a command's output): watchers check
  without a model and wake the agent only then. Ask in any conversation ("remind me Friday at 9", "every Monday
  summarize…") and confirm the task in a card; or start from an example, or turn a session that worked into one.
  A task can also run one of your apps, with the answers you set (a webhook's call or what a watcher saw
  filling them in), made from the app's Runs. Each run reports how it went: its history keeps the outcome, a
  summary, the cost and the session (or the app's run), and runs again with the same input. Runs with
  nothing to report stay quiet, failures always tell you, and failures in a row pause the task. Webhooks can
  require a signature, skip repeated deliveries, filter on the payload, and wait for the reply (`?wait=60`).
  Sessions stopped by a usage limit can continue by themselves when it resets.
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
- The tools at the bottom of the sidebar (Files, Git, Terminal, Library, Spaces, Apps, Usage, Settings…) stay in
  the order you drag them into, as sessions do, the same on every device; on a phone, hold one a moment to pick
  it up. On a computer, right-click one for Back to the usual order.
- One search for everything, like Spotlight: `Ctrl+K` (⌘K on a Mac) or Search in the sidebar finds pages,
  every setting, sessions and what was said in them, memory notes, spaces, apps, scheduled tasks, assistants,
  skills, the Library's pages, images and videos, connections, themes and files, as you type. Opening a result goes where it is: a setting opens its
  page and points at it, a message opens its session at the words. With search by meaning on (Settings →
  Memory) things also match what they mean, in nine languages; what ships with the app has its vectors made
  ahead of time, and what you make gets them as you make it. Search in, beside the field, looks only in the
  places you pick (sessions, messages, spaces, pages, files, settings…), the same on every device; with nothing
  typed it lists what those places hold. `Ctrl+F` finds within a conversation.
- A short welcome tour asks what you want to use (Claude Code, Codex, models through OpenRouter or on this
  computer, other agents) and sets those up, on pages that fill the screen. Then it shows you around as the
  app builds itself up: each part arrives as it is explained, the rest as the tour ends. Help shows it again.
- After the tour, tips introduce the rest of the app as you come to it: the first time a part is on screen (the
  inbox, a session's menu and details, the queue, a goal, the browser's panel, a spending cap, the Git, Library,
  Apps and Spaces pages, Settings → Memory…), a small card beside it says what it is for, with Learn more for the
  guide. One at a time and a while apart, never while you type or a menu is open; each shows once, on every
  device. Skip tips, or skipping the tour, stops them; Settings → General → Tips turns them on again.
- Help (in the sidebar): a guide to every part of the app, its topics grouped on one page, each with a picture of
  that part of the app and its sections to open one at a time. One box finds sections as you type, or asks an
  agent on Enter: the answer, from the guide with links that open the place they name, shows in a panel beside
  it, and the agent can set things up for you there too. Its sections show in the search box as well. The same
  guide is in [docs/guide](guide/).
- Starts when the computer starts (on by default; Settings → General), as a service of your user.
- Several machines: add other machines running Naget Agent, over SSH or by address, and switch between
  them from the sidebar. Notices from all of them reach you wherever you are.
- One password guards the app, and a browser stays signed in for 30 days. Wrong passwords are counted by the
  address they come from: after three in an hour the sign-in page also shows a picture of characters to type,
  drawn by the app itself (no outside service), and after ten that address can't sign in for an hour. Ten from
  anywhere bring the picture to everyone.
