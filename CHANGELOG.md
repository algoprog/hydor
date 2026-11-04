# Release notes

What changed in each version of Hydor (called Naget Agent until 0.20), newest first. The app shows these in Settings → General →
Release notes, and says what is new after it updates.

## 0.24.5 · 4 November 2026

The logo fills with water while the app loads, and numbers written as maths show as maths.

- **While the app loads**: in a browser, and while the Mac app starts, you see the app's logo, HYDΩR, with water rising
  in its Ω and a wave moving gently across it, where there was a blank page and a small spinner (in the Mac app, a line
  saying Starting Hydor). The app takes its place the moment it is ready: nothing waits for the animation.
- **The Mac app's window** opens in the app's own colours, black or light, so nothing flashes grey or white first.
- **Numbers in maths**: numbers between paired dollar signs in a reply (`$1$`, `$0$`) are drawn as maths, while ordinary
  prices such as $4.70 stay money.

## 0.24.4 · 4 November 2026

Agents' replies show maths, diagrams, small interactive figures and pictures, and every agent knows how to use them.

- **Maths looks right**: sub- and superscripts, fractions and equations set apart were misdrawn in every reply; they
  are drawn as in a textbook now. Equations written on their own lines (align, equation, gather) and chemistry
  (2H₂ + O₂ → 2H₂O) show too, and "$5x + 3 = 0$" is maths while "from $5 to $10" stays money.
- **Diagrams**: flowcharts, sequence and state diagrams, timelines, mind maps, Gantt and pie charts are drawn in the
  reply, in the app's colours, light or dark. Over each: the code, **Save as a picture (SVG)**, **Full screen** and
  copy. One that can't be drawn shows its code and why.
- **Figures and small tools in the reply**: a chart, an annotated figure, a calculator or a simulation with sliders
  runs right inside the reply, sealed off like the pages agents show, in the app's look. It builds up as the reply
  is written, and its bar has the code, **Save as a file** and **Full screen**.
- **Pictures**: photos from the web and pictures on this computer show in replies, fitted to them; click one to see
  it large. Web pictures come through the app's own server, so the sites never see your browser; one that can't load
  becomes a link.
- **Every agent is told**: Claude Code, Codex, Custom and the other agents now write their replies for the app, with
  headings, lists and tables where they help, and use these where they make an answer clearer. Ask for plain text in
  your guidelines if you prefer it.
- Pictures attached inside a notebook's text cells now show, and links to files on this computer open them in the
  app.

## 0.24.3 · 4 November 2026

Preview shows a dev server live when you reach the app through a tunnel: click, type and scroll in it, instead of
looking at pictures.

- **Live behind a tunnel**: where your browser can't reach the preview port (the app behind a tunnel or a proxy with
  one hostname), Preview opens the page in a browser on this computer and streams it to you live, at the size you
  picked, instead of still pictures. Click, type, scroll and paste in it as in any page; back, forward, reload and
  the address bar work, and hot reload shows there too.
- **On a phone**, tap and drag in the page; **Type** under it brings up the keyboard, beside Tab, Enter, Esc and the
  arrows.
- **Save a picture of it** and **Ask an agent about this screen** take the page as it is on your screen, after your
  clicks and typing.
- The page reaches only the dev server you are looking at, not the other servers on this computer, and closes after
  15 minutes with nobody looking. **Show it as a picture** in **More** still shows still pictures.

## 0.24.2 · 4 November 2026

A neater Make an app card on the Apps page.

- **Make an app** looks like the app cards beside it: a plus on a tile of the app's accent colour, its name and what
  it does, instead of a grey dashed box. With no apps of your own yet, it is one row across the page.

## 0.24.1 · 4 November 2026

A welcome tour that fits the screen, with a clearer picture and gentle waves.

- **Every page fits**: each page of the welcome tour fits the screen without scrolling, its picture and its words
  in the same place on every page, and its texts are shorter and wrap evenly.
- **What does the work, as streams**: beside each page, what you picked flows as streams into a pool around the Ω,
  which fills as you pick more.
- **Pictures, music, voices and videos** have a page of their own after Pay as you go.
- Small dots show where you are in the tour instead of droplets, and the sea's waves drift gently.

## 0.24.0 · 4 November 2026

Twelve new skills for agents, a new Ebooks plugin, a deeper Audio and video plugin, and sharper built-in skills.

- **New skills**: agents now know how to check whether an ad, a post or a message is true, misleading or a scam
  (**spin-check**), get a website found in search engines and AI answers (**seo**), help with stories, novels,
  poems and getting published (**creative-writing**), get you ready for a job interview with mock interviews
  (**job-interviews**), prepare and run meetings (**meetings**), test and price a business of your own
  (**solo-business**), make infographics, YouTube thumbnails and a brand kit (**infographics**,
  **youtube-thumbnails**, **brand-kit**), look after a server over SSH without locking you out (**servers**) and
  make websites everyone can use (**web-accessibility**). Ask "what can you do for me?" and **everyday-help** finds,
  in a short conversation, where the app could help in your days, then sets up one small thing if you say yes.
- **Ebooks**, a new plugin (**Settings → Plugins**): read an EPUB, make one with a cover and a table of contents
  from a manuscript, and check or repair it before it goes to Kindle, Apple Books or Kobo.
- **Audio and video** evens out a podcast's loudness, shortens long pauses, cuts a recording from a list of the
  parts to keep and makes vertical clips for social media.
- **Sharper built-in skills**: code review looks for weakened tests and for AI-written code; github covers
  contributing to other people's projects; data-analysis has a guide to cleaning data and a before-and-after check;
  study-coach checks the facts before it teaches; local-models knows llama.cpp's new default port; and debugging,
  security, performance, testing, SQL, research, papers, fine-tuning, model evaluation, financial models (unit
  economics, burn and runway), project plans, release notes, diagrams, Docker and the document skills gained the
  checks and pitfalls they were missing.
- **Meeting recordings** keep what was proposed apart from what was agreed, and never make up owners, dates or
  agreement.
- **Custom always sees the built-in skills**: however many skills of your own you have, at most 40 of them take
  places in its list, so the library's are never crowded out. "Fact-check" now brings in spin-check.
- Many of these skills are adapted from Magnus Hedemark's agent-skills collection, under the MIT License.

## 0.23.1 · 4 November 2026

The dark themes trade colours, and both are pure black behind your sessions.

- **Hydor Dark is cool blue now**: the dark theme you start with has blue-black panels and a periwinkle accent, the
  colours Midnight had. **Midnight** takes the warm near-black and gold that Hydor Dark had, so you can still pick
  them in **Settings → General → Theme**.
- **Pure black behind your sessions**: in both dark themes the page behind the conversation is black; the sidebar,
  cards, menus and fields keep their own shades so they still stand out. Pages, documents and slides shown in the
  dark follow it.

## 0.23.0 · 4 November 2026

Agents make music, voices and sounds, new picks for pictures and videos, and the welcome tour drawn in water again,
calmly.

- **Music, voices and sounds**: ask any agent for a song, a voice-over or the sound of rain, and hear it in the
  conversation in the app's own player, then keep it in your Library, which keeps sounds now too. Songs come from
  Google's Lyria 3 Pro; voices, narration and sound effects from ByteDance's Seed Audio 1.0, which can also speak in
  a voice copied from a short recording you give it. A short form shows what it costs before anything is made, as
  for pictures and videos. Change the models in **Settings → Images, video and audio** (called Images and video
  before).
- **New picks for pictures and videos**: unless you picked others, pictures come from Seedream 5.0 Pro (Flash is
  quicker and cheaper) and videos from Seedance 2.5. Each model list in Settings now opens on **Suggested**, with
  these first.
- **The welcome tour, in water again but calm**: its pictures are back (a short film of a request being done, a map
  of what does the work around the Ω, droplets for the steps, a sea under the pages), but the waves are still, the
  film plays once, nothing glows or splashes, and the icons are plain lines.

## 0.22.2 · 4 November 2026

A cleaner headline for the Game finder.

- **The picks in a sentence**: the Game finder's headline says what it picked, without notes on the details its
  sources left out.

## 0.22.1 · 4 November 2026

The Game finder keeps to what you ask for.

- **Only games still to come**: asked for games coming soon, the Game finder picks only those (fewer rather than
  one already out), each with when it comes out on its card, and sums them up without notes on missing details.

## 0.22.0 · 4 November 2026

Sources you can see at a glance, apps that run when they fit, and pictures and trailers in their answers.

- **Sources where the reply cites them**: where an agent cites a page, a small chip with the site's icon and name
  sits in the text. Point at it on a computer, or tap it on a phone, to see the page; click to open it.
- **One Sources line under the reply**: it shows the first sites' icons and how many pages the reply cites, and
  opens to a card for each page. Only the pages the reply cites, not every search the agent ran, and the list at
  the end of the reply no longer repeats in the text, with each number pointing at the right page.
- **Your apps, when they fit**: ask for something one of your apps does ("best upcoming games for Switch 2") and
  the agent runs it instead of answering itself. Every session now knows all your apps by name (up to 40).
- **Games coming soon**: the Game finder finds games still to come, with when each comes out, as well as those out
  now, and knows the Nintendo Switch 2.
- **Pictures and trailers in apps**: the Game finder shows each game's cover and trailer on any platform, What to
  watch each pick's trailer, and pictures come with Compare products, Gift ideas, the Weekly news digest, What's on,
  each day of the Trip planner and Best time to go. Pictures from the web are kept with the run, so they last.
- **Pictures for anything**: agents and app steps can find a picture, and a video, of each thing in a list: from its
  Wikipedia article, the pages about it, or YouTube.
- A table in an app can now have up to 16 columns.
- **Fixed**: Weather outlook, Match preview and Best time to go no longer repeat a heading and its list once for each
  thing in it.

## 0.21.1 · 4 November 2026

A quieter welcome tour, and bigger models on one graphics card.

- **A quieter welcome tour**: plain pages in the app's own colours, one column with fine lines and one accent,
  and nothing that glows, loops or splashes. The welcome says what Hydor is and how it works in three short
  lines under the app's mark, the choices and models are rows on one panel as in Settings, and in the app a thin
  ring marks each part as it is explained. The password and sign-in screens are plain again too.
- **Bigger models on one graphics card**: a model too big for your card as it is now runs on it at 8-bit (FP8)
  before it is split across several, so Gemma 4 12B runs on a single 24 GB card. How much memory a model needs
  for a long conversation is reckoned more truly too, so fewer models look too big for this computer.

## 0.21.0 · 4 November 2026

A new welcome tour, models suggested for your computer, a sidebar you can arrange, and a tidier app editor.

- **A new welcome tour**: redesigned for people new to AI, in plain words and drawn in water. It shows what can do
  the work (Claude or ChatGPT with the plan you pay for, pay as you go, free on this computer, other agents), then
  lights up each part of the app with something to try. The password and sign-in screens match it.
- **Models that suit your computer**: Settings → Models (and the tour) suggests models this computer can run, marks
  the best one, and installs it in one click; bigger ones say what they need. vLLM can split a model across several
  graphics cards and runs on Macs with Apple silicon, and OpenRouter suggests a few good models before you search.
- **Arrange the sidebar**: drag a project's or a folder's group by its heading to put it where you like (on a phone,
  hold it a moment first); the order is kept on every device. The logo fills with water under the pointer, and the
  tools at the bottom hold still.
- **The app editor keeps one width**: every tab (What it does, Form, Answer, Design, Examples, Settings) is as
  wide as the others, so nothing jumps when you switch. The tabs have icons, stay at the top as you scroll, and on
  a phone show in two rows, so none is out of sight.
- **See the form as you build it**: on a wide screen, Form shows the form beside its questions as the app's page
  asks it, and Answer shows a made-up answer as a run shows it, both changing as you type.
- **Cleaner questions and answer fields**: each is a numbered card; moving it up or down and removing it are in
  its ⋯ menu, and its help text, example and first answer are labelled. The name and description read like the
  app's own heading, the task has its Insert chips and Preview in one bar, Settings is one list with an icon for
  each part, and **Not saved yet** shows beside Save while you have changes.
- **Apps pages on a phone and a computer**: on a phone each part's apps are rows of one list, so many more fit, and
  a **Make an app** tile follows your own apps. Connected apps lists the kinds of services beside them on a
  computer, Featured has arrows, and on a phone the services are rows of one list.

## 0.20.4 · 3 November 2026

The agent points the right way to an app's answer.

- **"Below", not "above"**: when an agent tells you about an app it ran for you, it now knows the app's card
  shows under its words, so it no longer sends you to "the card above".

## 0.20.3 · 3 November 2026

Tidier conversations when an agent runs an app for you.

- **The reply first, then the app**: when an app an agent ran for you finishes, the agent's few words about it
  come first and the app's answer shows right under them, instead of above.
- **No stray messages**: the note telling the agent the app has finished no longer shows in the conversation as
  if you had written it, and the app's card no longer repeats its own reply under its answer (it is still on
  the run's page).
- **No "Today" over a new conversation**: the day line shows only where a conversation moves from one day to the
  next.

## 0.20.2 · 3 November 2026

A fix for the welcome tour on phones.

- **System shows in the tour**: while the tour shows the tools on a phone, the System tile appears with the
  others instead of leaving an empty space in the grid's corner.

## 0.20.1 · 3 November 2026

A fix for sessions started before the rename to Hydor.

- **One card for a page saved again, in older sessions too**: in a Claude Code session started before the rename, a
  page, deck, document, spreadsheet or LaTeX document the agent saves again shows as one card while it is being
  written, as it does in new sessions, instead of a second one until the save is done.

## 0.20.0 · 3 November 2026

Naget Agent is now Hydor: a new name and a new logo, and everything you had keeps working.

- **A new name**: the app is now Hydor, from ὕδωρ, "water" in ancient Greek, which takes the shape of whatever holds
  it. The window and the browser tab, the Mac app, the guide in English, Chinese and Greek, and the Docker image
  (`algoprog/hydor`) all use it.
- **A new logo**: HYDΩR, in thin capitals of one even stroke as Greek inscriptions are cut, the Greek Ω in the sea's
  blue. It stands alone at the top left of the app and on the sign-in screen. The app's icon is that Ω on a deep blue
  tile, and Custom's mark and the loading animation are the same Ω, with water rising and falling in it while it
  works. The two built-in themes are now called Hydor Dark and Hydor Light.
- **Everything you had stays**: your data folder, your settings file, the folders the app made for tasks, projects
  and apps (`~/Naget`, `~/naget-apps`), the service that starts it, apps saved as `.naget-app` files, and pages that
  keep their data with `naget.storage` all keep working as they are. New installs use `~/.hydor`, `~/Hydor`,
  `~/hydor-apps` and `hydor.service`.
- **New names where you type them**: settings in the environment are now `HYDOR_…` (the `NAGET_…` ones still
  apply), apps are shared as `.hydor-app` files, pages keep their data with `hydor.storage`, the agents' tools
  come from the server called `hydor` (as Settings → Connect other agents shows), and the app's own
  skills are `hydor:research`, `hydor:writing` and so on.
- **The Mac app** moves its own folders over the first time it starts as Hydor; macOS asks once more for the
  permissions computer use needs.
- **With Docker**, the image `algoprog/hydor` comes with each release for Intel/AMD and ARM computers, and the
  container and the Compose service are now called `hydor`. The README's command keeps your
  data in a volume called `hydor-home`; to go on with one from before, give its name (`naget-agent-home`) instead.

## 0.19.0 · 3 November 2026

Every skill on one page, more than fifty of them built in, plugins that bring skills and tools to every agent (seven
built in, others from a link or a file, or your own), and System: your computer's files, Git, terminals, previews and
monitor under one tool. And Spaces are now called Projects.

- **Skills, all in one place**: Settings → Skills now holds every skill agents can use (the old Skill library is part
  of it): the ones that come with the app, yours, those of your plugins, Claude Code's and Codex's own, and your
  projects'. They are grouped by what they are for, with a search, a row of filters and a switch on each to turn it off
  for agents. Open a skill to read it and its history; write one of your own for every agent (or only Claude Code or
  Codex) in plain fields, change one of yours, or make your own version of a built-in one. Skills agents suggest wait
  at the top.
- **More than forty new built-in skills**: emails, decision briefs, weekly reviews, project plans, brainstorming,
  studying, translation, plain language, data analysis, dashboards, financial models, keeping watch on prices and
  news, social media posts, image prompts; blocked pages, places and maps, papers, web scraping, diagrams and quick
  mockups; APIs, GitHub, debugging, tests first, code reviews, getting out of Git trouble, refactoring, finding your
  way in a codebase, polishing a web page, testing a web app, Docker, security checks, speed, SQL, MCP servers,
  release notes, writing skills and making plugins; Hugging Face, fine-tuning, evaluating and running models
  locally. Agents other than Claude Code, Codex and Custom now get the skills too, as a list to read from.
- **Plugins for every agent**: Settings → Plugins adds skills, tool servers, instructions and files of their own to
  every agent at once (Claude Code, Codex, Custom and the others), with what they need set up in a folder of their
  own: other plugins (added first, and turned on and off together), Python and Node packages, files to download,
  programs and keys. Seven come with the app: **Audio and video**, **Library docs**, **Meeting recordings**,
  **Python for data**, **Speech to text** (on this computer), **SQLite databases** and **Text from pictures**. Add
  others from a Git link, a .zip or a folder after a look at what each gives and needs; plugins made for Claude Code
  work too. Plugins use the open Agent Plugins format.
- **Make and share plugins**: **Make a plugin** opens an editor for its skills (write one, or copy one of yours),
  tools, needs, files and instructions, or have an agent make one for you; **Pack into a .zip** makes the file to
  share, and anyone adds it with **From a .zip file**.
- **Claude Code's and Codex's own plugins** have a tab each on the Plugins page; Codex's are new there.
- **System**: Files, Git, Terminal and Preview moved under one **System** tool in the sidebar, which now has two rows
  of tools and more room for your sessions. System opens on an overview of the computer (processor, memory, disk,
  graphics) and of each tool (recent files and a search, repositories with changes, the shells running, the web apps
  to preview), with a tab for each and **Monitor** for the live charts.
- **Spaces are now Projects**: the sidebar, the Projects page, Settings, the Library, the start page, the guide and
  what agents are told all say project for what was a space. Your projects keep everything they held, their folders
  included; a new project's folder goes in a Projects folder beside your task folders. Links to the old pages still
  work.

## 0.18.1 · 3 November 2026

One card for each page an agent saves in a reply, and previews in the conversation that fit the screen.

- **One card for each page**: when an agent saves a page, slides, a document, a spreadsheet or a LaTeX report several
  times in one reply, the reply shows one card, for the newest version, instead of one for each save. The earlier
  saves are among the reply's steps ("Saved “Report” · version 2"), and while the agent saves the page again its card
  keeps showing the version before, with **saving a new version…**.
- **Older cards keep small**: a card from an earlier reply whose page has a newer version since (the agent's, or
  yours) keeps to its title line and says **a newer one is there**; **Open** shows the newest. Only the newest version
  shows a preview.
- **Previews that fit**: a page, a document or a report in the conversation stops at half the window's height, with
  **See the whole page**, instead of growing as tall as 900 pixels; slides still show whole, and a phone's keyboard no
  longer changes the size.
- The panel beside the conversation lists each page once.

## 0.18.0 · 3 November 2026

A redesigned page for each space, a session's page the moment you press Start, no more fades, and usage limits that
say whose they are.

- **A space's page, redesigned**: it opens at once under a band of the space's colour, with the arrow back on the
  left as on the app's other pages, **New session**, and one menu: **Open its folder in Files**, **Only its sessions
  in the sidebar** and **Delete the space**. **Overview** shows its sessions (with what each is doing), what it holds
  in the Library, and what every session in it gets: its folder, guidelines, documents, skills, assistant and memory;
  a group lists its spaces too. **Settings** puts each part beside a line on what it is for, the assistant its
  sessions start as is one tap among a few, and **Save** shows once you change something. Its tabs fit a phone.
- **Sessions start at once**: pressing **Start** opens the session's page straight away with your message
  (**Starting**), and it becomes the session the moment the agent is ready, with no loading in between. If it can't
  start, the page says why, and **Back to the start page** puts your message, with what you attached, back in the box.
- **No more fades**: pages, tabs, menus, dialogs, side panels and the parts you unfold open at once, and on a phone a
  Settings section opens without sliding. Only what arrives by itself (a reply, a toast, a card that asks you
  something) still comes in softly.
- **Back arrows that fit**: on an app's editor, an app's page and a run, and on a phone in Settings and Help, the
  arrow back sits beside the title instead of in it, so it is never cut off.
- **Usage limits say whose they are**: when a limit stops a session, the notice says "All your Claude Code accounts
  have hit their usage limit" when every account is used up, or names the account when another still has usage
  left, then which limit and when the session continues.

## 0.17.1 · 3 November 2026

Pictures and videos each have their own place in the Library.

- **Pictures** and **Videos** are separate in the Library: each kind has a chip of its own above the cards, and in
  the search box. A picture's or video's page goes back to its own kind.

## 0.17.0 · 3 November 2026

The Library and Spaces sorted by project, a clearer Apps page with many more ready-made apps, agents that find the
right app among many, updates that install themselves in the Mac app, and computer use there.

- **The Library, by space**: what you keep belongs to a space or to none. What an agent saves goes in its
  session's space; **Keep** and **Save to Library** ask which space when you have spaces (the session's first);
  **New** makes it in the space you are looking at; **More → Move to a space** moves anything. The Library itself
  is new: its places (Everything, each space, Not in a space, Published) beside the cards, each space's things
  together, and **Find by name**, sorting and kinds above them.
- **Spaces, redesigned**: each space is a card in its colour with what it holds and **New session**. A space's
  page opens on **Overview**: its sessions, what it holds in the Library, and where it works, what its agents
  follow, its documents, skills and assistant at a glance; **Library** has everything it holds there, and
  **Settings** comes in four plain parts.
- **The Apps page, redesigned**: the "What should your next app do?" box is gone (**New app** does that). A short
  note says what apps are: small tools for one job that find things out and show them clearly, opened here or just
  asked for in any chat. Find an app by name or kind; each card says whether it has its own view and works in
  chats; ready-made apps show under their kinds.
- **16 new ready-made apps**, each with a view made for its answer: **Weather outlook** and **Best time to go**
  (charts of the days and months ahead), **Team tracker** and **Match preview**, **Cook with what you have** and
  **Meal plan and shopping list**, **Gift ideas**, **What to watch** (and where it streams), **Game finder**, a
  **Quiz on any topic** to play on its page, **Book finder**, **What's on** in a city (on a map, with each day's
  weather), **Savings plan**, **Chart my data** (a spreadsheet or numbers as charts), **A topic as a timeline** and
  **Explore a place** on a map. None needs a key. The **Trip planner** has a map of each day, and **Compare
  products** scores each product.
- **Agents find the right app among many**: a session is no longer told of every app, only the few you run most;
  agents search the rest by what they do, by words and by meaning, and pick from the best twenty.
- **Apps that need a model from a provider**: an app that uses a model through OpenRouter asks for your OpenRouter
  key with its other keys, and adds the model to your models by itself the first time it runs.
- **Mac app updates install themselves**: a new version downloads in the background, then a notice (in the app and
  from macOS) counts down a minute before it restarts to install it, with **Restart now** and **Later**. Agents
  keep running through the restart.
- **Computer use in the Mac app**: with **Settings → Capabilities → Computer use** on, agents can see your Mac's
  screen and use its mouse and keyboard, in any app, after you allow it once per session. The menu bar shows when
  an agent is at work, and **Stop** (or ⌘⇧Esc) ends it at once. Off until you turn it on.
- **The sidebar's tools** now start with Library, Spaces, Apps and Usage. A reply with many before-and-after
  screenshots shows one row of them, with **Show all**.

## 0.16.0 · 3 November 2026

Your apps work in any session and show maps, charts, pictures and videos; Connections join the Apps page; apps ask
for the keys they need; and every app downloads as a file.

- **Agents run your apps for you**: ask for what an app does in any session ("Plan a 4-day trip to Lisbon in May")
  and the agent runs it there. What it needs and you didn't say is asked on the app's own card in the
  conversation (the optional questions may stay empty), and its answer shows there as the app shows it. Each app
  has **Agents can use it**, to turn that off.
- **Ready-made apps come installed**: they are among your apps from the start. Uninstall one you don't use
  (**More → Uninstall**), and install it again from **Ready-made apps to install**. Installing an app from a file
  first shows a card that says in plain words what it asks, what you get and how it works.
- **Keys an app needs**: an app can say which API keys or tokens it needs (a weather service's, say). Its page asks
  for one it lacks, with where to get it, and so do its install card and its card in a session. Keys go to your
  vault, never into the app or its file, and agents use them without seeing them.
- **Connected apps**: Settings → Connections is now part of the Apps page, which has two tabs: **Agent apps** and
  **Connected apps** (the services you connected, the marketplace and your keys).
- **Apps as files**: every app downloads as a file from its card's **More** menu, the ready-made ones too, with
  its own pictures and videos. Drop a file on the Apps page to install it. A ready-made app's file brings that app
  back where you uninstalled it.
- **Maps, charts, pictures and videos**: an app's view can show a map of the places in its answer, charts in 2D
  and 3D, pictures that open large, videos (YouTube and Vimeo too) and sounds, and drawings of its own made with a
  library it names. An answer can hold pictures, videos and files the agent found on your computer or on the web:
  a copy is kept, so they keep showing. An app can also carry files of its own (**Edit → Design → Its own files**).
- **Quick questions** to Claude and Codex (an app's quick steps, memory notes, pull-request descriptions, command
  suggestions) no longer hang when an account is at its limit: the next signed-in account answers, and when none
  does, the error says why.

## 0.15.0 · 3 November 2026

Apps with views of their own: each ready-made app's answer opens in pages made for it, with buttons that do things,
and the Apps pages are friendlier.

- **Views**: an app's answer can open in a view of its own: tabs, elements made for it (a timeline of days, a
  product with its strengths and weaknesses, a story card) and buttons. Open a day or a product on a page of its
  own, tick things off (kept with the run, on every device), show one topic's stories or one person's actions, copy
  an email or a letter, run it again with a change (a slower pace, one more day, a more formal tone, new questions
  about the same document), or start another app on part of it (research a story, a finding or a product).
  **Plain answer** shows the card and tables as before.
- **The ready-made apps** each have one: the Trip planner's days to tick off, a page for each day, what to book and
  a budget chart; Compare products' pick and the products side by side; the meeting's actions by owner; a
  contract's red flags by how serious; a lesson's timeline; and more. Compare products also names its pick on its
  own, for programs.
- **Design**: a new tab in an app's **Edit** shows its view with its latest run (or a made-up answer), lists what
  to fix, and lets you ask an agent to design it, start from its answer, or change it as code. Agents design views
  too, and a try tells them what a view used that the run did not give.
- **The Apps page**: a box that asks what your next app should do, with ideas to start from; your apps with when
  each last ran; the runs to pick up again; ready-made apps showing what you get from each; building blocks folded
  away. **New app** is one menu: describe it, start from scratch, or install from a file.
- **An app's page**: what it does at the top, your answers in one card, and beside them what you get, its latest
  runs and how it works; a ready-made app's agent and model wait behind **Change**. Its back arrow is no longer cut
  off. A run's page says what it was asked, with **Run again** at the top.
- **Sessions**: no empty space under a short reply; the view holds a new text at its top only once what is below
  it fills the screen.

## 0.14.3 · 3 November 2026

Naget Agent as an app for your Mac that keeps itself up to date, a Library item to start a session with, and simpler
Spaces and welcome tour.

- **Mac app**: Naget Agent now comes as an app for macOS (Apple silicon and Intel), from the Releases page on
  GitHub. It runs in a window of its own, stays in the menu bar when you close the window, can open when your Mac
  starts (**Settings → General → Start when this computer starts**), finds your programs as your Terminal does, and
  shows notifications. It updates itself from each new release, and goes back to the version before if a new one
  will not start.
- **Library pictures on another machine**: when you use another machine (**Settings → Machines**), the Library's
  cards show their pictures again instead of a letter, and so do the pictures inside slides and documents and the
  before and after screenshots in a session.
- **Start a session with a Library item**: an image or a video in the Library has **Start a session with it** beside
  **Download**, and the new session gets it with your first message.
- **Spaces**: the **New space** window asks only for a name and where its files go (a new folder or one you have,
  with the folders used lately one tap away); the rest is under **More options**.
- **Welcome tour**: in plain words for people who don't code, with the choice of AI explained simply.
- **Quote your own messages**: select text in one of your messages and **Quote** puts it in the message box.
- **Commits under a reply**: commits an agent makes quietly now show under its reply too.
- **Long tools in Claude sessions**: tools such as making a video may take up to ten minutes without failing.

## 0.14.2 · 3 November 2026

Ask an agent about a file without leaving it, a sidebar that lists your projects, and a sharp browser in full screen.

- **Ask beside a file**: **Ask** in a file's editor bar (✨ on a phone) opens a panel next to the file. Say what to
  change or ask about it, and the agent edits the file in place while you watch. The conversation stays with the
  file, and **Open as a session** takes it further. The editor now takes in changes made on disk without starting
  again, so your place, cursor and scroll stay, and the changed lines light up for a moment.
- **Projects in the sidebar**: folders and spaces sit under a **Projects** heading, one line per session with how
  long ago it was active (or what the agent is doing). Every row has a **⋯** menu, on phones too, now with
  **Delete**.
- **Browser in full screen**: the page no longer shows up small and blurry. The small picture in the browser's bar
  kept asking for small frames, and full screen stretched them.

## 0.14.1 · 3 November 2026

A picture to read after wrong passwords and an hour's pause after ten, and sessions that wait out a usage limit only
when one really stopped them.

- **Wrong passwords**: after three from the same address within an hour, the sign-in page also shows a picture of
  five characters to type, so a program can't go on guessing. Typing them wrong costs nothing, and **New picture**
  brings another. After ten, that address can't sign in for an hour, not even with the right password, and the page
  says how long is left. When many wrong passwords come in from anywhere, everyone gets the picture. If you lock
  yourself out, a new password set on the computer itself (`set-password`) lifts every pause.
- **Your visitors' own addresses**: wrong passwords are counted by the address of whoever is behind Cloudflare
  Tunnel, Caddy or Docker's network, and a program can no longer pretend to come from a new address for each try.
- **Usage limits**: a session waits to carry on after a limit only when its turn was really stopped by one, not when
  your plan's usage reached 100% just as the work finished. Sending a message, pressing **Stop**, or a turn that
  finishes normally cancels the wait.

## 0.14.0 · 3 November 2026

Tips that go on showing you the app after the welcome tour, a simpler message box, one list of your accounts that
carries on past a limit by itself, and running sessions that are easier to spot.

- **Tips after the tour**: the first time a part of the app is on your screen (the inbox, a session's menu and
  details, the queue, a goal, the browser's panel, a spending cap, the Git, Library, Apps and Spaces pages,
  **Settings → Memory**…), a small card beside it says what it is for, with **Learn more** for the guide. Tips come
  one at a time and a while apart, never while you type or have a menu open, and each shows once, on every device.
  **Skip tips**, or **Skip the tour**, stops them; **Settings → General → Tips** turns them on again.
- **A simpler message box**: the assistant, model, effort and permissions are one **Options** chip (amber while the
  agent runs without asking), files and screenshots are under one **+** button, and the context shows as a small
  ring with its percentage. The speed and cache meters are at the foot of the Options menu.
- **Your accounts**: the Claude Code and Codex sign-ins and the accounts you added are one list, grouped by agent,
  with **Sign out**, **Rename** and **Remove** behind a **⋯** menu. **Switch accounts at a limit** is now on unless
  you turned it off, and the limit banner stays hidden while another account can carry on.
- **The sidebar**: Active lists every session with activity in the last five minutes, finished ones too, and a
  session waiting to resume after a usage limit stays there. The bar under **Usage** shows what is left across
  your paid subscriptions.
- **Running sessions stand out**: the Stop button turns a ring while a session starts or works, Custom shows the
  app's own loading mark, and the conversation fades out above the message box as it does under the header.
- **Commits under a reply**: the commits an agent made in a turn show in a chip under its changed files, each
  opening to its whole message, author and every file's diff, with **Open in Git**.
- **OpenRouter costs**: what an OpenRouter session costs, and its tokens, show by themselves above the message box,
  with prices from OpenRouter, so there are none to set by hand.

## 0.13.0 · 2 November 2026

Pictures and short videos from agents, kept in the Library (what Pages became); Word, Excel, CSV and LaTeX files
edited in Files and saved back to themselves; a sidebar you group and arrange; and agents' programs that keep
up to date by themselves.

- **Images and videos**: agents make short videos as well as pictures, through OpenRouter, with the model picked in
  **Settings → Images and video** or one you name. A form in the conversation shows the settings that model takes
  (shape, resolution, length, sound…) and what it costs, once per model in a session. Videos play in the app's
  own player.
- **The Library**: Pages is now the Library, with **Pages**, **Media** and **Published** tabs; old links to Pages
  still work. **Save to Library** keeps a picture or a video there, titled and described by a model that sees
  images (pick which under **Captions in the Library**). Each one has a page of its own to play, edit, make again,
  download or delete, and the search box finds them.
- **Edit documents in Files**: Word, Excel, CSV and LaTeX files open in the Library's editors, and **Save** writes
  the same file again. A CSV keeps the cells you didn't touch exactly as they were. A LaTeX file opens with the
  chapters and bibliography it reads, and its preview uses the pictures in its folder. A Word or Excel file says
  first what the editor can't keep (headers and footers, comments, charts…), offers **Save as a copy**, and its
  first save puts the old file in the Trash. Its text or preview is still under **More** (⋯).
- **The sidebar**: sessions are grouped by the space or the folder they work in, each group folding to a line
  (**Filter and group sessions** lists them by day again). The tools at the bottom stay in the order you drag
  them into, the same on every device; right-click one for **Back to the usual order**.
- **Agents' programs keep up to date**: once a day Claude Code, Codex and the others move to their newest version,
  your own installs too, and a version that doesn't work here is undone. **Settings → Accounts → Agent programs**
  shows each one's version, with **Check now**, **Update now** and a switch to turn it off.
- **Apps**: the ready-made apps work in steps and open in the builder as a graph, steps can use built-in values
  (today's date, the time, your time zone), and the Apps page has a box to describe a new app for the App builder.
- **Fixes**: a session started on an added account shows its conversation; a session's steps no longer stay
  "running" when Claude Code writes its transcript somewhere unexpected; a screenshot fills a phone's width.

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
