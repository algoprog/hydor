# Features

Everything Hydor does, by area. [Back to the README](../README.md).

## Sessions
- The prompt bar’s Stop button shows a rotating ring while a session starts or works, paused while
  waiting for you and respecting reduced-motion preferences.
- Start a Claude Code or Codex session in any folder, optionally in a worktree of its own (a new branch in a
  separate folder, so several agents can change one repository at once). Pick the model, how hard it
  thinks, and what it may do without asking you. The start page opens with what you picked there last,
  on any device: the agent and its model, the folder, the assistant, memory and a spending cap. What you
  write in a message box, with the files you attach, waits there while you look at other pages. Pressing
  Start opens the session's page at once with your message and the agent at work on it (Working), as the
  session shows it, and it becomes the session as soon as the agent is up, with no loading in between; if it
  can't start, the page says why and your message goes back in the start page's box. Pages, tabs, menus and
  dialogs open at once, with no fade.
- Sessions name themselves: a moment after one starts with a request, the helper model gives it a title of a few
  words ("Weekend trip to Lisbon"), shown in the sidebar, the header and the search box instead of the start of the
  message, and passed to Claude Code and Codex for their own lists. Nothing shows in the conversation; sessions
  started together with the same request share one title; a title you give it with Rename always stays.
- Switch models or assistants mid-session; the model menu lists the session's own agent's models, and another
  assistant applies from your next message, the conversation carrying on. "Continue in Codex" (or
  Claude Code, or Custom Agent) in the session's menu hands the conversation over to another agent.
- Fork a session from any reply, or edit an earlier message and go on from there, with the files put back as
  they were. Compact a long session, stop a turn, resume an old one.
- Give a session a goal (`/goal`): the agent keeps working, turn after turn, until it holds.
- Every session on the machine is listed, including ones open in VS Code or a terminal, with what each is
  doing right now: Active lists all sessions with activity in the last five minutes, including finished ones,
  and moves them back to their usual group after five quiet minutes. Sessions awaiting automatic resume
  after a usage limit stay in Active until that scheduled resume is cleared, and so do sessions whose background
  agents, commands or monitors are still running, until those end. Pinned comes next, then Projects: a group for each project and each folder you picked
  (task folders, the home folder and temporary ones go by day), foldable, a line per session, with a pen to
  start a new session there, and dragged by their headings into the order you like, the same on every device;
  a heading's ⋯, a right-click or a double-click renames the project or the folder (a folder's name is the app's
  for it, on every device, shown under sessions and in the folder menus too; Codex projects' folders, such as the
  ones it makes for ChatGPT projects, show by the project's name). A folder whose work began outside Hydor (its first
  session came from Claude Code or Codex in VS Code, a terminal or their desktop apps) carries the marks of the agents
  its sessions came from after its name, and its tooltip and ⋯ say which apps, and which added account; then the rest
  by day. Each row's ⋯ (or a right-click) renames, pins, snoozes
  (until later), settles (done for now), archives or deletes the session, on phones too.
- While a session works, its line says how long this turn has run and, after earlier turns, how long it has worked in
  all ("Working · 2m 10s · 47m in all"), in the session and in the sidebar.
- **Confidential sessions** (Options → Confidential): for a submission you review, patient data or a client's code. The
  session runs on Custom with a model on this computer or your private network; web search, the browser, connected
  apps, apps and models elsewhere are off (an allowlist of tools, so new ones stay off too); its commands run without
  network (bubblewrap), or ask each time where that can't be done; its title, notices and memory send nothing out; a
  lock and a calm tint show it. Enforced on the server, not only in the page.
- More agents: besides Claude Code and Codex, any agent that speaks the Agent Client Protocol (Gemini CLI,
  OpenCode, Qwen Code, Goose, Kimi CLI, Auggie, or a command of your own).
- Several accounts per agent: sign in more than one Claude or Codex account and pick one per session; each
  shows its own usage and limits. With **Switch accounts at a limit** (on by default), the app uses them all: a session whose
  account runs out of usage moves, with its history, to another account with usage left and carries on, and the app's own quick
  questions (the helper model, apps' model steps) go to the next signed-in account too.

## Help with anything

Every agent here gets the same help from the app, whatever its model: Claude Code, Codex, Custom, and the
agents that speak ACP and take MCP servers.

- **Assistants**: start as a Researcher, Writer, Tutor, Planner, Analyst, Coder or App builder (it makes
  apps), or one of your own (its instructions, model, tools and connected accounts; import Claude Code's agent
  files), and switch to another in the session's message box when the work changes. A task without a folder gets
  one of its own (`~/Hydor/<date>-<task>`).
- **Agent Guidelines**: what you want every agent to follow (how you like to work, what to always or never do,
  how to talk to you), written once and given to every agent by the app itself, whichever it is: Claude Code,
  Codex, Custom or an ACP agent. Three levels: every session (Settings → Agents → Agent Guidelines), a project, and
  one session (the start page's Options, or the session's menu); the more specific wins. A changed session's
  agent follows the new ones from the next message. CLAUDE.md and AGENTS.md still work, and can be edited there too.
- **Agents that work the app**: every agent knows the app's own guide (the `app_guide` tool) and answers questions
  about it from there, with links to the place. Ask it to change a setting or set something up (a project, an
  assistant, a scheduled task, memory notes…) and it does it through the app's API (`app_api`): reading runs at
  once, and each change shows you a card first, with what changes before → after, to allow once, for the rest of
  the session, or not. When it needs details it shows a form (`ask_form`). Passwords, keys' values, approvals,
  permissions, spending caps, files and commands stay yours.
- **The web**: search with Naget Search (its own index of the web, papers, patents and filings; free daily
  searches without a key) or SearXNG, Brave Search and DuckDuckGo, by category, site or date, up to 100 results;
  read whole pages, or only the parts that answer a question; find a picture and a video of each of a list of things
  (find_media: a Wikipedia article's lead picture, else what the pages about it show when shared, and a YouTube
  video whose title names it). Each search shows its results, and each reply the sources it cites: a chip with the
  site's icon and name where it cites a page (a card of its pages on hover or tap) and a Sources line under it that
  opens to a card for each page, only those cited, by the numbers the agent gave them, its list of sources no longer
  repeated in the text. When no provider can answer, Claude Code and Codex search with their own web search instead.
  [Search providers](search-providers.md).
- **A browser**: agents open sites, click, type and read pages, in a Chromium of their own. You watch it live
  above the message box, the agent's pointer gliding to each place it acts (a ring where it clicks, the field it types
  into outlined, scrolls and keys beside it, each step's picture marked where it clicked), and take over to log in, solve a check or pay, on a computer or a phone; with a sign-in
  saved in the vault, the agent signs in itself, typing the password without seeing it, on that site only. Sites
  on your own network stay off limits unless you allow one.
- **Memory**: agents save notes about you, the project and the session when you ask or they learn something
  lasting, one fact per note written to be found again, some only until a date, and a chip under the reply shows
  what changed (undo, edit, delete). They also keep a profile of you (who you are, what you use, how you like
  answers) that every agent gets once, at the start of a session, after your guidelines: agents add to it only
  when you say something lasting, you edit it in Settings, and past its length (1,000 words unless changed) the
  helper model shortens it. Each agent starts with the notes that bear most on what you asked, 10 unless changed: a
  top-k by hybrid search, by words (BM25) and, once you turn it on, by meaning, with LightOn's mDenseOn model on your
  own computer (on a GPU, or on the CPU in about 1.5 GB, only while needed), then the latest. Each night the helper
  model tidies memory up: it merges notes that say the same thing and, when there are more than fit, sums related
  ones up in topics and, for a project, a short profile; every change can be undone.
  Settings → Memory lists every note with when it was written, changed and last needed (each place its three
  newest first, with Show N more; each note two lines until you open it), lets you add your
  own, and suggests removing the ones no agent needed for months. Turn it off for one session or for all.
  Agents can also look up earlier sessions.
- **Projects** (in the sidebar): a project's sessions, files, documents, memory, guidelines, skills and assistant
  together, like Projects in ChatGPT or Claude. Pick a project by name in the start page's folder menu instead of a
  folder: its sessions work in its own folder (a new one, or one you have) and any other folders of yours it works
  with, are told what its folder holds, remember what its earlier sessions learned, search its documents, get its
  guidelines and its own skills and start as its assistant. The Projects page shows each as a card in its colour with
  what it holds (sessions, things in the Library, documents, skills) and New session. A project's own page opens at
  once under a band of its colour, with the way back on the left, New session and one menu (its folder in Files,
  only its sessions in the sidebar, delete it); its Overview has its sessions (with what each is doing), what it
  holds in the Library and what every session in it gets (its folder, guidelines, documents, skills, assistant and
  memory), a group's projects too, and its Library tab everything it holds there; its Settings tab sets its name,
  colour, guidelines, the assistant its sessions start as (one tap among them) and its group, saved from a bar
  that shows once something changed. Its Files tab shows its folders; files come in from
  Files, a file's window or an agent's file cards with Add to a project. Its Skills tab lists every skill its
  sessions get, each with a switch for the project alone (On here, Off here; Follow Settings goes back): its own
  skills, written there, copied from the library to change for the project alone, or proposed by an agent working
  in it and kept for the project when you approve; the library's; and Claude Code's and Codex's own for its folder,
  switched for its sessions through their settings for the session, not their own files. A group brings several projects
  together: its sessions work with all of them, their folders, documents, guidelines and skills. The sidebar
  groups each project's sessions under its name, and its filter shows one project's sessions. New project asks only for a
  name (its colour on the mark beside it) and where its files go, a new folder or one you have, with the folders you
  used lately one tap away; what it is about, its guidelines and other folders are under More options. Under your
  projects, the Projects page suggests folders your sessions worked in, or changed files in, over the last 90 days that
  no project has yet (a folder in a Git repository counting as the repository), each with Make a project, or ✕ to stop
  suggesting it.
- **Share a project with people** (a project's ⋯ → Share with people): your advisor or students get a personal link each
  (View and comment, or Edit documents; for a week, a month, or until you stop it), shown once, as a copy or a QR code.
  They open a portal of that project alone: its documents in the Library's own viewers and editors, its sessions
  read-only, its experiments' runs and its reading list; they comment under their name (you get a notice and an Inbox
  line), and edit documents if you let them. Never your agents, files, settings or other projects; confidential
  sessions never show; wrong links count as wrong passwords.
- **Folders in the Library**: each project's things in folders (and folders in folders), shown first as tiles, with the
  way back over them; More → Move to a folder, or drag a card onto one; a folder moved to another project takes what
  it holds; deleting one deletes nothing in it. **New → Import a folder** brings a folder of this computer in: a LaTeX
  project as one document with its whole tree, any other folder as Library folders with its documents, spreadsheets,
  slides, notebooks and LaTeX. Agents save into a folder by its name or path.
- **Knowledge bases**: drop documents or a folder in once, and agents can search them: by their words (a
  full-text index ranked by BM25), by what they mean (local embeddings, with search by meaning on) or for exact
  text, as grep would; each passage cites its file and page. A folder on this computer is read where it is and
  kept up to date. Shared knowledge (Projects → Shared knowledge) is searched by every session; a project's own
  documents (its Knowledge tab) by its sessions alone, which search the shared knowledge too unless the project
  turns that off.
- **Documents**: agents read PDF, Word, Excel, PowerPoint, OpenDocument and EPUB files, and make them with the
  app's document skills; the file viewer previews them, and finished files show as cards to open or download.
  Agents make Jupyter notebooks too (the notebooks skill: sections with text, a run from the top before handing one
  over, an environment beside it to run it in): kept in the Library with save_notebook, or handed over as a file
  whose card opens it in the notebook page. A card's Save to Library keeps a copy of a notebook, a document, a
  spreadsheet or a LaTeX file in the Library, in the project you pick. Agents fill in PDF forms (every kind of field,
  drawn so every viewer shows the values, Greek and Chinese too; a form already signed digitally keeps its signature
  valid), write on PDF pages beside the words printed there (text, ticks, pictures, white-out, highlights, comments)
  and rotate, reorder, merge and split their pages, saving a copy unless asked to replace the file. Signatures: draw
  yours (mouse, finger or pen), type it in a handwriting or upload a photo of it, kept encrypted (Settings →
  Signatures); agents ask for one on a card and place it, by name and never seeing it, into Word files, PDFs, pictures
  and Library documents, each time after your OK on a card that shows where (a picture of a signature, not a
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
  portable ffmpeg, about 145 MB, and two models downloaded when first used, BiRefNet-lite and LaMa) take
  backgrounds out (remove_background) and erase parts of pictures (erase_from_image) for nothing and in private,
  each model loaded only while used, put away after a few idle minutes and never loaded without the memory for it;
  a poor cutout, and a large or detailed area to erase, go to an image model, and how: "ai" asks for one.
  edit_image crops, turns, sizes, adjusts, filters, marks up and blurs pictures, and edit_video trims, cuts, crops,
  speeds up, captions and sets music to videos, both for nothing on this computer (ffmpeg). A tool that needs an
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
  from the file) the bar to seek along, with a song's lyrics under it. **Save to Library** keeps one in the
  Library, where a model that sees images writes its title and description (a video's from ten of its frames on
  one picture, with ffmpeg; a sound's from its prompt, lyrics and model, since no model hears it): the app's
  choice, any of OpenRouter's vision models, Claude through Claude Code, or a model of your own (Ollama, vLLM, an
  endpoint). The Library shows them among its other things (Pictures, Videos and Audio show each kind alone, a
  sound's card playing it in place), and finds, plays, downloads and edits them; **Start a session with it** opens
  a new session with one in the message box, and agents can work from them.
- **Connected apps**: on the Apps page beside your agent apps (Apps → Connected apps, which was Settings →
  Connections), a marketplace of services (Notion, Linear, GitHub, Google, Stripe and more), signed
  in once for every agent and app; anyone can add one with a pull request to `catalog/`. Keys and sign-ins live in an
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
  link. The Library is sorted by project: what an agent saves goes in its session's project, Keep and Save to Library
  ask which project when there are projects (the session's first), New makes it in the project you look at, and More →
  Move to a project moves anything; its places (Everything, each project's things under its name, Not in a project,
  Published) sit beside the cards, with Find by name, sorting and kind chips (Pages, Slides, Documents,
  Spreadsheets, LaTeX, Pictures, Videos, Audio). Drop files or whole folders on the Library, on a project in its list
  or on a project's card, and each becomes what it is (Word, Markdown, text or HTML a document; Excel, OpenDocument or
  CSV a spreadsheet; PowerPoint slides; LaTeX a LaTeX document; a notebook a notebook; pictures, videos and sounds the
  Library's media, kept once; anything else a file in the project's folder), sent in pieces up to 1 GB with a tray of
  each file's progress (Upload files in New does the same on a phone); in the desktop apps a drop moves the file (an
  original that became a page goes to the trash, unless the page could not keep all of it). A page shows as the agent writes it (beside the conversation on a wide screen), fills the width it gets,
  looks like part of the app (its theme, light or dark as the app is, your colours and the app's font, unless you
  ask for another look), and you can change it in a visual editor that works on a phone too, written in as in Notion:
  Enter makes the next block, "/" adds headings, lists, to-dos, toggles, callouts, quotes, code, tables, pictures,
  videos, columns, cards, maths, a table of contents or a button, Markdown turns into blocks as you type, a ⋮⋮ beside
  each block drags it or turns it into another kind and colours it, several blocks are picked at once (with a drag from
  either margin, as in Notion), an item of a nested list turned into another block keeps its place under its parent,
  code blocks are coloured in about twenty languages (a language picker, or Auto; agents' plain code blocks too), "@"
  links to another page of the Library, databases as in Notion (a table of typed columns: text, number, select,
  multi-select, date, checkbox and link, sorted and filtered, or a board of cards dragged between lanes, its rows kept
  with the page's own data on every device and changed in Use and Edit, by agents too), blocks and words take comments with replies that agents answer (kept beside the page, not in it), and a
  page gets an icon and a cover; click or tap a part to rewrite its words (bold, italic, code, links, colours), restyle it (this part, every part of its kind or class, on hover, or for tablets and
  phones only), move, size, copy, wrap or delete it, pick it from its layers, add parts and ready-made sections,
  set the whole page's colours, fonts, width and the look of its headings, links and buttons, ask the agent about
  a part, or edit its HTML with the page beside it; the agent hears of your changes with your next message.
  HTML files an agent writes open the same way. Make pages of your own from a blank page, notes, a checklist or
  a tracker, and see or clear the data a page keeps. Export a page as a PDF, a Word document (headings, lists,
  tables, links, charts as pictures) or a web page; ask an agent to change the page, slides, document, spreadsheet
  or LaTeX you have open (this slide, every slide, a section, the cells picked, the part picked, all of it) and
  watch it change as it saves. Apps are small tools for one job that find things out and show them clearly, each
  with a form and a view of its answer: ready-made or your own (described to the App builder, built from scratch,
  or installed from a file, all under one New app menu). The Apps page has the apps you pin at its very top (big
  tiles in your order, dragged or moved from a tile's menu, up to 12, the same on every device; Pin to the top and
  Unpin in each card's menu and an app's own page's), a find box that stays at the top and finds any app as you type
  (its name, kind and what it does, plurals too; Enter opens the best fit), its kinds as chips with their counts, the
  apps you ran lately (each once, up to 8: how its last run went and when, Open the result or Answer it, Run again
  with the same answers; the latest runs folded beside them), four ready-made apps to start with for someone new,
  your own apps (Most used, A to Z or Newest), the ready-made ones under their kinds (cards of one size, with what
  each asks for and marks for its own view, working in chats and a key it needs) and the ready-made apps you
  uninstalled, to install again; on a phone, one column, the pinned and recent apps scrolling sideways. They run
  from the Apps page, the API, MCP, a public page, or once for each row of a CSV. Ready-made apps come installed; Uninstall puts one aside, and Install brings it back after a card
  that says in plain words what it asks, gives and does. A session is told of the few apps pinned or run most with
  what they do (the pinned ones first) and of the others by name (up to 40 in all), and a message one app clearly does tells the agent which, with its
  form (a clear lead by words, so "best upcoming games for switch 2" runs the Game finder); past 40, agents find the
  right one with find_apps: a few words on what the user wants, searched by
  words (BM25 over names, kinds, descriptions and form questions, plurals and word starts matching) and by meaning
  (the search box's vectors), fused by rank, the user's own and those run lately lifted, the best twenty with
  their forms, those pinned on the Apps page first and those used lately next, each marked so. An app that needs a model through OpenRouter asks for OpenRouter's key with its other keys (kept
  in Settings → Models) and adds the model by itself when it first runs; one for Ollama, vLLM or an endpoint is
  refused until it is set up. Agents in any session run your apps for you (use_app):
  ask to plan a trip and the Trip planner runs there, the questions your message left out asked on the app's own
  card (the optional ones may stay empty), its run and its view shown in the conversation; each app's Agents can
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
  match previews (TheSportsDB and the web), recipes from what is in your fridge and a week of dinners with one
  shopping list by aisle (TheMealDB), gift ideas, what to watch tonight and where it streams (TVmaze), a game finder
  for games out now or coming soon (Nintendo Switch 2 too), each with its picture and trailer, and PC prices with
  their lowest ever (CheapShark), a quiz on any topic to play on its page, a book finder (Open
  Library), what's on in a city by day and on a map, a savings plan, your own spreadsheet or numbers as charts, a
  topic as a timeline (Wikipedia) and a place explored on a map in walking order (Wikipedia and OpenStreetMap). Many
  show pictures and videos of what they find, through find_media: each game's cover and trailer, each film's or show's
  trailer, each product, gift idea, news story and event, a picture for each day of a trip, a photo of the place to
  go. Each hands back its answer in a view of its own: pages of elements made for it (the Trip planner's timeline of days to tick
  off, a page for each day, a map of the days, a list to book and a budget chart; Compare products' pick, and the products side by side with their scores on a chart;
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
  (files, YouTube, Vimeo) and sounds, maps of the places in an answer (Leaflet and OpenStreetMap, numbered and
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
  edited in the Library's page editor (whose Add has an App tab with those parts) or by an agent, with buttons for its other
  flows and a conversation with its agent, who finds and changes its records and runs its flows for you (the
  latest conversation shows on return; earlier ones a click away). Apps travel as one file (.hydor-app or .json, with their records, screens, own files and the apps they
  call; the keys they need by name only), downloaded from an app's page or its card's More, the ready-made ones too (a ready-made app's file brings it
  back where it was uninstalled), and installed from New app or by dropping the file on the Apps page, after a card that says what they ask, give and do, in plain words, with the keys they need,
  then what they will use here (folded: their files, their view's scripts and libraries, models, packages), offering one of your models for any they ask for that is not set up here; uninstalling one deletes it.
- **Slides**: decks kept in the Library, made by an agent (save_slides, from layouts or parts placed by position) or
  from eight ready-made looks, and edited as in PowerPoint, Google Slides or Keynote: menus (Edit, View, Insert,
  Format, Arrange, Slide, Tools) with Search the menus, slides to reorder, copy and skip, 15 layouts, text boxes with
  rich text, bullets and numbering, 20 shapes, pictures (cropped, with brightness, contrast, saturation, blur, black
  and white and see-through), lines and arrows, tables (merged cells, cell fills) and charts (column, bar, line, area,
  pie, doughnut), about 1,900 icons and emoji, equations in LaTeX (drawn without the internet wherever the deck shows),
  YouTube and Vimeo videos with their stills and videos from this device (up to 200 MB), connectors that stay joined to
  shapes as they move (straight or elbowed), comments on a slide or a part of it with replies that agents answer and
  resolve; groups (a part in one placed where it is on the slide), find and replace across slides, speaker notes,
  charts and equations, zoom, the format painter, a grid, rulers and guides, snapping guides and equal
  gaps, alignment, stacking, undo, copy and paste; animations in order (on a click, with or after the one before, a
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
- **Documents, spreadsheets and LaTeX**: kept in the Library beside slides, each with versions, a picture in the list,
  its own address, menus with Search the menus, find and replace, a list of its keyboard shortcuts, and an agent that
  changes it on request, whose work you watch as it writes (slides too: the agent's caret where its words arrive, the
  page read-only meanwhile, your unsaved changes never overwritten), in steps (a section, some slides, some cells) as
  well as whole, its saves in one turn kept as one version. Documents (save_doc, written in Markdown, or opened from a Word, Markdown, text or HTML file)
  are edited as in Word or Google Docs on real pages of their paper (what does not fit goes on to the next page, a long
  table's header row again, each page with its own header, footer and number): paragraph styles, fonts, sizes, colours and
  highlights, links, alignment, line and paragraph spacing, bullets, numbers and checklists, callouts, tables (column
  widths dragged, merged and coloured cells), pictures with captions, equations in LaTeX, a table of contents that
  keeps up, headers and footers with page numbers, lines and page breaks, a "/" menu and Markdown shortcuts as you
  type, blocks dragged by their handles, the format painter, special characters and emoji, comments with replies
  that agents read, answer and resolve (a Word file's keep their authors), Suggesting as Word's track changes and
  Google Docs' suggestions (accepted or rejected one by one or all at once, kept as Word's tracked changes both ways,
  and made by agents too), a comparison with any earlier version, paste from Word and Google Docs cleaned, an outline, zoom, a word count and
  printing; they export as Word (styles, lists, tables, pictures, comments, tracked changes, equations, the table of
  contents and headers and footers as Word's own; laid out so Word's pages break where the editor's do, the
  document's fonts inside the file), PDF on their paper, Markdown or a web page. Spreadsheets (save_sheet, with
  formulas, or opened from an Excel, ODS, CSV or TSV file) work as in Excel, Google Sheets or Airtable: a grid that
  stays quick with thousands of rows, frozen and hidden rows and columns, sizes to drag, about two hundred of
  Excel's functions worked out as you type (lookups, criteria, dates, text, loans, and FILTER, SORT, UNIQUE and
  SEQUENCE that spill) with each function's arguments shown, references that move as cells are copied, filled,
  inserted and deleted, the fill handle with its series, number formats with Excel's own codes, borders, merged
  cells, filters, sorting by several columns, conditional formatting (rules, colour scales, data bars), dropdowns
  with coloured chips, checkboxes, star ratings and a calendar for dates, notes and comment threads that agents answer, charts (seven kinds) that sit on their cells and move with them,
  of one range or of several (Ctrl+click), Paste special,
  removing duplicates, splitting text into columns, summaries as a pivot table makes them, a row opened as a card,
  a Kanban board kept with its sheet (what it groups by, its cards' fields, its lanes' order), several sheets, copy and paste with Excel and Google Sheets, and the sum, average and count of what
  is picked; they export as Excel (formulas, formats, filters, conditional formatting, dropdowns and checkboxes,
  long lists of options among them, merged cells, notes, threaded comments and charts on their cells kept, with
  the editor's column widths, row heights and print layout), CSV or PDF. LaTeX documents (save_latex, from nine templates, a conference
  paper as IEEE, ACM or Springer LNCS ask among them, or opened from a .tex file or a project's .zip) keep their source files and pictures, typeset on this computer (pdfLaTeX, XeLaTeX
  or LuaLaTeX, with BibTeX) as you type, beside the pages: a Visual mode that shows the source as a document while
  you type, formulas drawn as you write them, completion of commands, environments, packages, citations, labels and
  pictures, a symbols panel, tables made in a grid, references found by DOI, arXiv id or title, folding, spelling,
  quick checks before TeX runs, errors and warnings at their lines, the log, an outline, snippets, a word count,
  comments agents answer (on .tex files opened from Files too), Track changes as in Overleaf (an agent's
  edits too, each accepted or rejected), versions compared, dark pages, the pages presented full screen, and a jump between a place
  on a page and its line. TeX runs in a folder of its own, with no shell escape and, where bubblewrap is installed,
  in its sandbox. They export as the PDF, the main .tex file or the whole project as a .zip. Jupyter notebooks
  (save_notebook, from an .ipynb an agent wrote and ran, or opened from one) show in the notebook page's own view,
  with their outputs: cells edited and run in a kernel of the Python environment picked, in a folder of their own in
  the app's data folder, Ask on the whole notebook or a cell, and versions with their outputs; they export as the
  .ipynb, a Python script with # %% cells, a PDF or a web page.
- **Skills**: every skill agents can use on one page (Settings → Skills), grouped by what it is for: more than
  sixty that come with the app for every agent (ways of working, writing, documents, research and the web,
  planning, data, design and pictures, coding, AI models, this app), yours, those your plugins bring, Claude
  Code's and Codex's own, and each project's own. A search, a row of filters and a switch on every skill, for
  every session (a project can switch any skill the other way for its own sessions, and the row says so: "Off in
  Thesis"); write your own for every agent or for one, change a built-in one (your version takes its place),
  remove and bring back. Agents propose new skills or fixes to them, saved only when you approve, in the library or, in a project,
  for the project alone. Other ACP agents get the list of skills to read when one fits. A new session's agent
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

## For researchers

- **Keep up with your field** (ready-made apps under Apps → Research, each on its own page with Update automatically):
  **Paper radar** (each morning, new arXiv and OpenAlex papers in your fields, on your topics and by the people you
  follow, ranked against your projects with the local embedding model, each with why it matters to you; Save, Cite as
  BibTeX, Dig deeper, Not for me, which steer the next days), **Citation alerts** (who cited your papers, with the citing
  sentence, and whether it builds on, compares with or disputes your work), **New-model watch** (new Hugging Face
  models of a task, checked against your limits and run on your own evaluation through Experiments; you hear only of
  those that beat your best), **Deadline radar** (your venues' deadlines from ccfddl and ai-deadlines, from AoE into your
  time zone, with reminders, page limits and templates), **Living related work** (a page per topic that grows as papers
  appear, in themes, with a LaTeX related-work draft and BibTeX) and **Gap finder** (project ideas from your papers and
  this month's, each checked for prior work and sized to your compute).
- **Read and organise papers**: a **Reading list** by project, kept in step with Zotero both ways (add by DOI, arXiv id,
  link or title; import and export .bib; status, tags, notes and a page per paper); a **Literature matrix** that reads up
  to 30 papers into a Library spreadsheet, each cell citing its page; **Reproduce a paper** (finds the code, builds a clean
  environment, sends long runs to Experiments, and compares each number with the paper's). A paper is found however
  it is given (DOI, arXiv id, link, title, PDF, .tex, a LaTeX project or a Library document), from open copies only.
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
  SLURM cluster's queue over SSH), run in tmux and are kept as records: the commit and its changes, settings, seed,
  environment, log and metrics, drawn as charts. An agent on call wakes on NaN, out of memory, a stall, a crash or
  divergence, and tells you or acts within your rules. Compare runs, sweep settings (every combination or a random
  sample, losing runs stopped early), and make **results tables** (mean ± std over seeds, the best in bold, paired or
  Welch tests with Holm's correction as daggers) as LaTeX, Markdown or CSV, or straight into a LaTeX document of the
  Library. Agents use it with experiment_run, experiment_sweep, experiment_list, experiment_get, experiment_stop and
  experiment_table.
- **The lab's work** (Apps → Lab and Work): an **Annotation workbench** (you and a model label the same sample, the
  model's label hidden until you give yours; disagreements, Cohen's κ and a confusion matrix; publish on Hugging Face
  with a dataset card), a **Research sprint** (hypotheses, code on its own branch, runs in Experiments, an analysis
  notebook and a report, with you approving each step), a **Sweep planner** (a sweep fitted to a budget of runs or GPU
  hours, and how much each setting mattered), a **Weekly progress report** for your advisor, team or manager, and a
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
- **Campaign** (Options → Swarm → Campaign): one big change in many parts, each made by a member in its own worktree
  with its tests, on a board of parts and their status; a failed part is tried once more, and the lead merges the parts
  in order or opens pull requests.
- New skills for every agent: ci-doctor, issue-triage, dependency-upgrades, incident-response and git-bisect.

## Custom: any model

OpenRouter session costs and token usage show above the message box without a spending cap. Charges come from OpenRouter automatically, with its generation records and catalog prices as fallbacks; its catalog also supplies Usage estimates, so no manual prices are required.

Custom is the app's own agent, for models beyond Claude Code's and Codex's. Its working and starting indicators use the Hydor loading animation (water rising and falling in its Ω), vertically centred beside their text. It works like them: it reads,
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

The agents' own programs install by themselves when first needed (Claude Code, Gemini CLI, OpenCode…,
with npm into the app's folder), and stay up to date: once a day each is brought to its newest version, the
app's copies with npm and your own installs with their own updater (`claude update`, `codex update`,
`opencode upgrade`, or npm for `npm install -g` ones), Claude Code on its own release line (stable or latest). A
new version is kept only once it starts and answers the way the sessions use it (no sign-in or usage needed);
one that does not is undone, and the sessions keep running the version before. Settings → Accounts → Agent
programs shows each program's version and what is out, with Check now, Update now and Update automatically.

## Following along
- A readable timeline: the agent's messages read like a chat, and its commands fold into small boxes with
  plain-words names ("Run the tests", "Read index.ts"), each a click away from its full output. A reply long enough
  to fill the screen stops at its first line as it grows, so you read it from its beginning; a short one sits
  under what came before, with no empty space below it.
- Replies made to read: every agent knows the app shows them as rich text, with Markdown (headings, lists, tables,
  code), maths in LaTeX drawn as in a textbook (KaTeX, chemistry included; numbers such as `$1$` and `$0$` render as
  maths, while ordinary dollar prices stay money), Mermaid diagrams (flowcharts, sequences,
  timelines, mind maps, Gantt and pie charts…) drawn in the app's colours with their code, a full-screen view and an
  SVG to save, figures and small interactive tools (a chart, a calculator, a simulation with sliders) that run in
  place in a sealed-off frame as the reply comes, and pictures from the web (fetched by the app's own server, so the
  sites never see your browser) or from this computer, opened large on a click. The user's guidelines can ask for
  plain text instead.
- Agents can answer with a page (a report, a dashboard, a mock-up), shown in the conversation as it is written, or
  beside it on a wide screen.
- Before and after: when an agent changes how a web app looks, it shows screenshots of each screen it changed
  from before and after, on a computer's or a phone's screen: a reply's screenshots as one card of small
  pictures (a row of them, with Show all, when there are more), each opening a review (beside the conversation, or
  over the app on a phone) with a slider or side by side, and arrows to the reply's other screens.
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
- Files: places to start from (recent files, home, pinned folders, your projects' folders, the folders sessions
  worked in, the trash), and each folder as a list with dates, sizes and git status (folders open in place, as a
  tree) or as tiles with pictures; sort, narrow as you type, pick several, drag to move (Alt copies) or to
  upload, keys for everything. Each file or folder's menu: start a session with it (named by its path, nothing
  uploaded), add it to a project (a file is copied into its folder, a folder joins those it works with), rename,
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
  items in a feed, a page or a value in JSON changing, new files in a folder, a command's output): watchers check
  without a model and wake the agent only then. Ask in any conversation ("remind me Friday at 9", "every Monday
  summarize…") and confirm the task in a card; or start from an example, or turn a session that worked into one.
  A task can also run one of your apps, with the answers you set (a webhook's call or what a watcher saw
  filling them in), made from the app's Runs. Each run reports how it went: its history keeps the outcome, a
  summary, the cost and the session (or the app's run), and runs again with the same input. Runs with
  nothing to report stay quiet, failures always tell you, and failures in a row pause the task. Webhooks can
  require a signature, skip repeated deliveries, filter on the payload, and wait for the reply (`?wait=60`).
  Sessions stopped by a usage limit can continue by themselves when it resets (quietly, with a line saying
  whose limit it hit, all your accounts of that agent or one by name, which one and when, while Resume after
  usage limits is on); one you stopped yourself never does.
- Usage: how much of each plan's limits you have used and when they reset, what the same work would cost
  through the API, and activity over time, for every agent or one (Custom and the ACP agents by name) and every
  model or one.
- Every session is kept, whatever the agent's own program does: Claude Code is told to keep its conversations,
  and the app keeps its own link to every conversation file (no extra disk), so one that gets deleted comes back.
  Sessions nobody used for a year are deleted (Settings → General → Delete inactive sessions: on or off, and how
  long); pinned and busy ones stay, and their numbers stay in Activity.
- System: this computer under one tool in the sidebar, a tab each for Files, Git, Terminal, Preview,
  Monitor (CPU, memory, GPUs, disks, network and the busiest processes, live) and Experiments, and an overview with how it is
  doing and what each tool holds now (recent files and a search, repositories with changes, the shells
  running, the web apps to preview).
- Settings: sign the agents in and out from the browser, and manage MCP servers, skills, plugins, Agent
  Guidelines and the CLAUDE.md / AGENTS.md instruction files.
- An MCP server of its own, so an agent elsewhere can list, read, start and steer sessions here.

## Everywhere
- Desktop apps for Mac (macOS 12+, Apple silicon or Intel), Windows (10 and 11, x64) and Linux (x64 and ARM: a .deb
  for Ubuntu and Debian, an AppImage for the others): the server and Node.js in one app (and tmux on a Mac and on
  Linux), in a window of its own, in the menu bar (the notification area, the system tray) when the window is closed,
  opening at login. They show notifications themselves, find your programs through your login shell's PATH (on
  Windows, your own environment), and update themselves release by release: they look every 4 hours, download and
  check a new build as soon as it is out (a download that breaks off, as when the computer sleeps, carries on from where
  it stopped, and one that gets nowhere tries again an hour later), say so (a notification, and a note in every open
  page that counts down a minute, with Restart now and Later, which puts it off for 4 hours; Restart to Update in the
  icon's menu), and swap it in with agents carrying on. A Mac app and an AppImage go back to the version before if the
  new one does not start; on Windows the new version's installer runs without its window; the .deb installs once you
  give your password.
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
  can be changed.
- The tools at the bottom of the sidebar (Library, Projects, Apps, Usage, System, Settings, Search, Help) stay in
  the order you drag them into, as sessions do, the same on every device; on a phone, hold one a moment to pick
  it up. On a computer, right-click one for Back to the usual order.
- One search for everything, like Spotlight: `Ctrl+K` (⌘K on a Mac) or Search in the sidebar finds pages,
  every setting, sessions and what was said in them, memory notes, projects, apps, scheduled tasks, assistants,
  skills, plugins, the Library's pages, images and videos, connections, themes and files, as you type. Opening a result goes where it is: a setting opens its
  page and points at it, a message opens its session at the words. With search by meaning on (Settings →
  Memory) things also match what they mean, in nine languages; what ships with the app has its vectors made
  ahead of time, and what you make gets them as you make it. Search in, beside the field, looks only in the
  places you pick (sessions, messages, projects, pages, files, settings…), the same on every device; with nothing
  typed it lists what those places hold. `Ctrl+F` finds within a conversation.
- A short welcome tour, made for people new to AI and drawn in water (Hydor is the Greek for it), calmly: a short
  film of a request being done, then what should do the work (Claude or ChatGPT with the plan you pay for, pay as you
  go through OpenRouter, free models on this computer, other agents), each set up on a page that fits the screen,
  its picture and words always in the same place: sign-ins, the suggested OpenRouter models and those for pictures,
  music, voices and videos, or a model suggested for this computer installed with one click. Beside each page,
  streams flow from what you picked into a pool around the Ω; small dots show the steps, over a sea whose waves
  drift gently. Then it shows you around as the app builds itself up, a ring of water lighting each part as it is
  explained, with first tasks to put in the message box. Help shows it again.
- After the tour, tips introduce the rest of the app as you come to it: the first time a part is on screen (the
  inbox, a session's menu and details, the queue, a goal, the browser's panel, a spending cap, the Git, Library,
  Apps and Projects pages, Settings → Memory…), a small card beside it says what it is for, with Learn more for the
  guide. One at a time and a while apart, never while you type or a menu is open; each shows once, on every
  device. Skip tips, or skipping the tour, stops them; Settings → General → Tips turns them on again.
- Help (in the sidebar): a guide to every part of the app, its topics grouped on one page, each with a picture of
  that part of the app and its sections to open one at a time. One box finds sections as you type, or asks an
  agent on Enter: the answer, from the guide with links that open the place they name, shows in a panel beside
  it, and the agent can set things up for you there too. Its sections show in the search box as well. The same
  guide is in [docs/guide](guide/).
- Starts when the computer starts (on by default; Settings → General), as a service of your user.
- Several machines: add other machines running Hydor, over SSH or by address, and switch between
  them from the sidebar. Notices from all of them reach you wherever you are.
- One password guards the app, and a browser stays signed in for 30 days. Wrong passwords are counted by the
  address they come from: after three in an hour the sign-in page also shows a picture of characters to type,
  drawn by the app itself (no outside service), and after ten that address can't sign in for an hour. Ten from
  anywhere bring the picture to everyone.
