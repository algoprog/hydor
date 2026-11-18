# Release notes

What changed in each version of Hydor (called Naget Agent until 0.20), newest first. The app shows these in Settings → General →
Release notes, and says what is new after it updates.

## 0.89.0 · 18 November 2026

Your bookmarks are easier to find and to keep in order: the address bar offers them, the Bookmarks panel searches
them, and AI sorts them into folders.

- **Bookmarks in the address bar**: the bookmarks that match what you type now show among the suggestions even when
  your history holds many pages with the same words, as one brought in from another browser does. A bookmark counts as
  twenty visits, at least two of the bookmarks that match are always in the list, and when the list is cut to fit a
  short window, pages of your history go first.
- **Search your bookmarks**: the Bookmarks panel has a search box at its top. It finds bookmarks by the words in their
  names and addresses, and folders by their names, each with where it is; **Show in folder** opens its folder in the
  tree, and **Enter** opens the first one found.
- **Organize with AI**: the sparkle button at the top of the Bookmarks panel sorts your bookmarks into folders by topic,
  with the helper model (Settings → Models). **Keep my folders** leaves your folders and what is in them as they are, and
  files the loose bookmarks (in Other bookmarks, or in an import's folders) into the folder that fits, one of yours or
  a new one; **Start over** puts every bookmark into new folders and removes the old ones. The sites pinned on your
  bookmarks bar stay where they are, only titles, addresses (without what follows a ? or #) and folder names are sent,
  you can follow it and stop it, and **Undo** puts everything back. The search box (Ctrl+K) finds it too.

## 0.88.0 · 18 November 2026

Experiments shows what matters about your runs: the curves you care about, how far each run has got, and a tidier
list.

- **The right charts**: a run's page charts the metrics it prints again and again, the most telling first (losses and
  scores before the learning rate, speed and memory), and lists the numbers it prints once (its settings at the start,
  its results at the end) as **Values**, with **All** and a box to find one. A run that prints more than 100 numbers
  keeps its curves first, so a long list of settings at its start no longer crowds out its loss; runs already
  recorded that way get their curves back from their logs.
- **How far a run has got**: while a run goes, its row and its page show a bar, the steps done of all of them and about
  how long is left, when its output says so (a progress bar, "step 120/1000", or a total of steps it prints).
- **A tidier list**: each run's name has the whole width; under it, its status with how long it took ("Done after
  1 h 47 min"), its key metrics (never bookkeeping such as token counts), and where it runs only when your runs are in
  more than one place. In each experiment the runs going now come first, then those waiting, in the order they will
  start. Click an experiment's name to fold it away; a long one shows its first 10 runs, with **Show more**. The box to
  tick a run shows when you point at it.
- **Waiting, in plain words**: a job without a GPU waiting for its turn says **Waiting for a run to end**, no longer
  "Waiting for a GPU".
- **Compare** charts what changes over steps, and puts the values the runs printed once side by side, the best of each
  row in bold.

## 0.87.0 · 18 November 2026

Your own browser translates pages, opens private tabs, shows articles in reader view and pages in dark colours, and
does more of what you expect of a browser.

- **Translate a page**: when a page is in another language, a button in the address bar translates it where it is, what
  you see first, and goes on as you scroll or the page changes; **Show original** brings its own words back. Pick your
  language, always translate a language, never translate a language or a site, or select words and right-click →
  **Translate “…”**. The words are translated by the helper model (Settings → Models): Claude Haiku on Automatic, or a
  model on your computer.
- **Private tabs**: **New private tab** (Ctrl+Shift+N, ⇧⌘N on a Mac) opens a tab whose pages are not kept in your
  history, the closed tabs or the tabs that come back next time, and whose sign-ins, cookies and site data are kept
  apart and forgotten when you close the last private tab. They sit in a purple **Private** part of the tab column;
  extensions do not run in them, and agents never get them. Right-click a link → **Open link in private tab**.
- **Reader view**: on an article, the book button in the address bar shows the article alone, in a clean column, with
  the text size, colours (Auto, Dark, Light or Sepia) and font you choose.
- **Dark pages**: ⋯ → **Dark pages** shows pages that have no dark look of their own in dark colours, except on the
  sites you leave as they are (from the padlock).
- **Where a link goes**: point at a link and its address shows at the bottom of the page.
- **Screenshots and PDFs**: ⋯ → a screenshot of what you see or of the whole page, saved in your Downloads folder and
  copied, or **Save as PDF…**.
- **Quieter pages**: a page's sound waits until you click or type in it (a setting lets sites play it by themselves),
  and the ad blocker hides cookie banners too (**Hide cookie banners**).
- **A site's data**: the padlock deletes a site's cookies and data, and turns dark pages off for one site.
- **Video and sound**: right-click a video or a sound for Play, Mute, Loop, Show controls, Picture in picture, and
  saving it or copying its address.
- **Bring in your history**: **Import** at the foot of the History panel brings in the history of Chrome, Edge, Brave,
  Firefox, Safari and the other browsers on this computer, its latest 20,000 pages, so the address bar suggests the
  sites you know. Importing again adds nothing twice.
- **Your browsers, in the welcome tour**: in the desktop apps, the tour asks **Bring in your bookmarks and history?**
  when it finds other browsers on this computer, and brings in what you pick, one browser at a time. If you took the
  tour before, the Browser page offers it once instead; any time, it is at ⋯ → **Import bookmarks and history…**. On a
  Mac, **Open System Settings** on Safari's row takes you to where you give Hydor Full Disk Access, and Hydor checks
  again when you come back.

## 0.86.3 · 18 November 2026

Stop takes effect on screen the moment you press it.

- **Stop shows at once**: pressing **Stop** in a session, by the message box or in its header, shows the session
  stopped straight away: the turn ends "Stopped after …", the send button comes back and the session is no longer
  marked as working in the list, along with the subagents and background tasks it stopped. Before, nothing changed
  until the agent had finished stopping, which can take a few seconds. If the agent is somehow still at work 20
  seconds later, the session shows it at work again.

## 0.86.2 · 18 November 2026

The desktop apps of 0.86.0 and 0.86.1 come out with this version.

- **The desktop apps catch up**: the Mac, Windows and Linux apps of 0.86.0 and 0.86.1 never came out, because a test of
  the Windows app stopped their release after the app itself had passed it. This version brings both to the desktop
  apps, and changes nothing else.

## 0.86.1 · 18 November 2026

Links in an agent's reply to the app's own pages now take you there.

- **Links to the app's pages**: a link in an agent's reply to a place in the app, such as **Settings → Agents →
  Models** or a topic of the guide, opens that page (at the option it names, if it names one) instead of a window
  saying "Could not open the file". Links to files on this computer still open the file, even when its path starts
  the same way as a page's (a drive under /media, a folder called projects).

## 0.86.0 · 18 November 2026

Custom can use the models of your Claude and ChatGPT plans with nothing to set up, and the subagents a turn starts
show together in one compact card instead of filling the screen.

- **Your plans' models in Custom**: when Claude Code is signed in on this computer, Custom can use Claude Opus, Fable,
  Sonnet and Haiku through it, and when Codex is signed in with ChatGPT, the models your ChatGPT plan lists: no API key,
  nothing to set up, and nothing extra to pay. Custom's model menus group models under **Your subscriptions**, **On this
  computer** and **In the cloud**, and **Settings → Models** has a **Your subscriptions** group that says which models
  each program lends, or why it lends none. A confidential session never uses them.
- **Subagents in one card**: the subagents a turn starts now show together as one card under it, with what they share
  said once ("6 Claude Code subagents · Sonnet 5.5") and how they stand ("5 working · 1 done"), and a line for each with
  its title and how long it has worked. While others work, the finished ones fold into one line ("4 finished: …"), and
  the card folds to its top line once all are done; click the top line to open or fold it. A turn with one subagent
  shows it as a one-line card.
- **Stop that looks like stop**: point at a subagent's line and **Stop** takes the place of its time (on a touch screen
  it is always there), and the card's **⋯** menu stops them all. The stop buttons in the line above the message box are
  a stop sign now, no longer a square that looked like a checkbox.
- **The terminal's settings**: `hydor settings` lists **General → Motion** again.

## 0.85.1 · 18 November 2026

Highlights work on the pages where they said "Select some words on the page first", the browser's right-click menu
looks like the rest of the app, and PowerPoint files show as their slides.

- **Highlights on more pages**: **Highlight** now finds the words you selected on sites that build their pages in ways
  the first version missed, such as MDN, the BBC and Reddit, and words inside a page's own components. Words in a frame
  inside a page (another page shown in it) cannot be highlighted, so the menu no longer offers it there.
- **The right-click menu in the app's own look**: in the desktop app, a right click on a page opens a menu like the
  app's other menus, with icons and in the language the app is in; **Esc** or a click outside closes it.
- **PowerPoint files as their slides**: a .pptx opened from a reply or in Files now shows each slide as it looks, with
  its pictures, shapes, tables, charts and background in place and its speaker notes under it, instead of only its
  words. **Text** still shows the words, and **Pages** the LibreOffice layout where it is installed.
- **Slides with too many words for their box**: where a deck uses a font this computer lacks, a box's words are made a
  little smaller to fit instead of being cut off; and in every deck, the lines of a box that is too full no longer run
  into each other.

## 0.85.0 · 18 November 2026

Your own browser becomes a place to collect and organise what you read: highlight it, keep clean reader copies with
their pictures, save pictures, set pages aside to read later, and put your tabs in groups, by hand or with AI.

- **Highlights**: select words on a page, right-click and choose **Highlight**: they are marked in a soft yellow, kept,
  and marked again whenever you come back to the page. The Library's **Highlights** lists them by page, with search,
  **Copy**, a note, and **Ask an agent about these**. Right-click a highlight to remove it. Your highlights are yours
  alone: agents never see them.
- **Save keeps a reader copy**: Save keeps the article as a reader view shows it, with its headings, pictures and
  videos and without the site's menus, ads, comments and scripts. Its pictures are kept with the page, so it lasts
  when the site's are gone. The ▾ beside Save picks the project or folder it goes in.
- **Pictures to the Library**: right-click a picture for **Save image to Library** (it is read with the tab's own
  sign-ins) or **Ask about this image**.
- **Read later**: right-click a page or a link, or use the ⋯ menu, to set it aside. The list is in the tab column and
  in the Library, with **Mark as read**.
- **Tab groups**: right-click a tab for **Close tab**, **Close other tabs**, **Close tabs below**, **Duplicate**,
  **Reload**, **Copy address**, **Bookmark** and **Add to group**. A group has a name and a colour, folds away and
  comes back with your tabs. **Group my tabs with AI** sorts your open tabs into groups, with **Undo**: only their
  titles and addresses go to the helper model, and only when you press it.
- **Asking about a selection** quotes up to 4,000 characters of it.
- **Subagents in the sidebar**: the line under a session says how many subagents it has at work and how many need you.
- **New pictures** of the app in the guide, on the website and in the README, in the new look.

## 0.84.2 · 18 November 2026

Fixes for the Browser: a menu always shows over the page, tab names stay in their column, and the tab column resizes
like every other one.

- **Menus over the page**: a menu that opens over the page, such as the ⋯ menu at the end of the bar, always shows on
  top. On a wide window it sometimes stayed behind the page.
- **Tab names**: a tab's row stays inside the tab column with its ×, and a title too long fades out at its end and
  rolls along to show the rest while you point at it (not with Motion off); the agents' rows do the same.
- **The tab column resizes**: drag its edge to make it wider or narrower, as every column in the app does.
- **Home** is back in the bar, after Reload: it opens your home page in the tab you are on.
- **Help**: **Take the tour** sits in the first page's top right corner.

## 0.84.1 · 18 November 2026

The sidebar keeps to the subagents that are at work or waiting for you.

- **Subagents in the sidebar**: under a session, only its subagents at work or waiting for you show, with the line on
  how many and what they are doing. One that finishes leaves the sidebar, unless you have it open, and stays on its
  card in the conversation and in the line above the message box.

## 0.84.0 · 18 November 2026

A new look for the whole app: a rail of icons down the left edge, the same kind of column beside every page that has a
list, and a Browser built around your pages, with Ask and your agents beside them. The Library keeps web pages and your
browser's lists, the desktop apps show files in Finder or File Explorer, and the app moves a little, quietly, as you
use it.

- **A rail of icons**: on a computer every page has a rail down its left edge: Sessions, Browser, Library, Projects,
  Apps and Agents at the top, Inbox, Search, Usage, System, Settings and Help at the bottom. A tooltip names each icon,
  with its shortcut. Phones keep their icons at the bottom.
- **One kind of column**: the sidebar with your sessions shows on the start page and in sessions; the Library, Apps,
  Projects, Agents, Help and Settings each have a column of the same kind, with Hydor's logo at the top, their own
  places and **Hide sidebar** (Ctrl+B). Every column has the same width, shows its scroll bar when it holds more than
  fits, and fades at its foot while there is more below, and a page no longer repeats what its column lists.
- **The sessions sidebar** starts with the logo, and its Search sessions field is gone: the search box (Ctrl+K) finds
  sessions, archived ones too. A session's subagents are listed with those at work or waiting for you first, then the
  most recent.
- **The Browser, redesigned** (desktop app): one bar across the top goes to an address, searches, asks about the page,
  or hands a task to an agent in a tab of its own; a column holds your pinned sites, the agents at work and your tabs;
  **Ask** answers about the page beside it; and an agent's tab opens with its conversation beside it, with **Stop** and
  **Take over**. Opening a menu no longer makes the page flash, and a hidden sidebar can always be shown again.
- **Your browsing, found by meaning**: the address bar and the search box find pages in your history, bookmarks and
  downloads by what they are about (with search by meaning on), beside the usual suggestions. Agents never see them.
- **The Library keeps web pages**: **Save to the Library** in the Browser saves the page you are on, the **Web pages**
  chip shows them, and in the desktop app the Library also has your browser's **Bookmarks**, **Downloads** and
  **History**.
- **Show in Finder** (File Explorer on Windows, the folder on Linux): the desktop apps open the system's file manager
  at a file or folder, from Files, the file viewer, the Library's pictures and videos, downloads, sessions, projects
  and more.
- **Apps, Projects, Agents and Help** have columns of their own: the kinds of apps and Connected apps; your projects
  and Shared knowledge; your agents' places, the built-in agents and Schedules; the guide's topics, with Help's first
  page now just its box and a few questions. Each page has the Library's row, its title at the left and a find box at
  the right.
- **Motion**: buttons dip a little as you press them, a copy turns into a check, lists glide to their new places,
  numbers count to their new values, and the sidebar slides as you hide or show it. **Settings → General →
  Appearance → Motion** turns it down (Calm) or off, and your system's Reduce motion always means Off.
- **Claude Code's and Codex's own subagents** show and behave like Hydor's: the same card under the turn that started
  them, a row in the work tray and a place under their lead in the sidebar, and **Open** shows each one's whole
  conversation, live while it works.
- **Signed-out accounts**: when Claude Code, Codex or Grok Build turns an account away for its sign-in, background work
  moves to another account or model, a session moves to another signed-in account with usage left, and Hydor asks you
  to sign in again only when nothing else can do the work.
- **Fixes**: an HTML file in a deeper folder opens as a page again, and an HTML page no longer flashes white as it
  opens or changes; the conversation no longer flashes as you scroll up to earlier messages; an agent's browser,
  watched larger or full screen, is sharp instead of stretched and blurred; and search by meaning keeps within the
  computer's memory.

## 0.83.0 · 17 November 2026

Your own browser grows into one you can use every day, in the desktop app: a smart address bar, Google as the home
page and search engine, an ad blocker, history and the rest, and it is faster and smoother. A message you send shows at
once, and Naget Search keeps to the sites, dates and kinds of pages a search's words ask for.

- **In the desktop app**: the Browser page is now part of the desktop app, where its pages are real pages. The web app
  and phones have no Browser button any more (the pages came there as pictures and lagged); the agents' browser in
  sessions works everywhere as before.
- **Faster and smoother**: your own tabs connect directly rather than through the app, the app no longer follows every
  request your pages make, the page stays in view under menus, popovers and the address bar's suggestions as a picture
  as sharp as the page itself (on a Retina screen too) instead of a small blurry one, it follows the window as you resize
  it, and the outline around the page is gone.
- **A smart address bar**: as you type, your open tabs, bookmarks and the pages you visit most and most lately, the
  address completed in place, your search engine's suggestions, and **Ask an agent** to start a session with what you
  typed.
- **Home page and search engine**: a Home button; new tabs and a first start open your home page, Google unless you
  change it. The address bar searches with Google, DuckDuckGo, Bing, Brave, Ecosia, Startpage or a search page of your
  own, with suggestions you can turn off (**Browser settings** in the ⋯ menu).
- **Ads and trackers blocked**, on unless you turn it off (Ghostery's lists, downloaded only while it is on and
  refreshed weekly): the padlock says how many were blocked on a page, and allows ads on a site.
- **History** with search and **Recently closed** (Ctrl+Shift+T reopens a tab), and **Clear browsing data** (history
  for a time range; cookies, site data and cached files).
- **What a browser does**: a right-click menu on pages (open a link in a new tab or your default browser, copy, save
  images, search for or ask an agent about the selection, spelling suggestions, inspect), zoom (Ctrl with + − 0, or
  with the wheel), print, full-screen video, find with a match count, muting a tab that plays sound, a padlock with the
  site's permissions, **Open in your default browser**, and more shortcuts (Ctrl+Tab, Ctrl+1…9, Ctrl+D, Ctrl+H,
  Ctrl+J, Ctrl+P). A page's file field opens the system's own file picker.
- **A message you send shows at once**: in the conversation with the agent at work under it, or with the messages
  waiting when it goes to the queue, and the box is free for the next one straight away (before, looking up what memory
  has for it or starting a stopped agent again could hold it back a second or more). A message that does not go through
  goes back into its box with a note that says why.
- **Naget Search reads the filters in a search's words**: when an agent searches for words that ask for a site, dates,
  a kind of page, a language, PDFs or home pages and sets no filters itself, the helper model turns them into Naget's
  filters first (within 8 seconds), and the search's tags say what was searched. When that finds nothing, the words are
  searched as written; other search providers get the search as written.
- **Wiki memory**: a new Codex session picked into a project on the start page knows of that project's wiki straight
  away; reading or searching another project's wiki needs Wiki memory on in this project as well as in the chat, so
  turning it off while a session runs closes those too; on a phone, a project's Memory tab puts its explanation under
  the switch. With thanks to wirrockendigital, whose contribution brought these.

## 0.82.1 · 17 November 2026

Copies installed from git or Docker before 0.78.0 can update again, and Bypass no longer stops for approvals.

- **Updating an older copy**: Hydor's history on GitHub was rewritten in 0.78.0, and a copy installed from git or
  Docker before then stopped updating with "Not possible to fast-forward, aborting." Update it once on its machine (run
  the installer again, pull the new Docker image, or follow the guide's Update an older copy by hand); from then on it
  updates by itself again. When you update such a machine from another machine's app, its page and its Settings →
  General now say why the update failed and give the command to run there.
- **Updates follow a rewritten history**: if the history a copy updates from is rewritten again, Update now, `hydor
  update` and the installer move a copy with no commits of its own to it, keeping the files you changed; a copy with
  commits of its own is left as it is, and the update says what to do. The number of updates out counts only the new
  ones.
- **Bypass never asks**: Claude Code still asks about a few steps in every mode, Bypass included (a removal whose
  target it can't work out, such as `rm -rf "$X"/*`, or a command whose safety check didn't finish), and the app
  showed each as an approval card. In Bypass the app now allows them itself, at once, also after a restart; a question
  for you and a plan to approve still show, and a subagent's result now settles the approval its step asked for.

## 0.82.0 · 17 November 2026

A browser of your own in Hydor, to browse with and to hand pages to agents, and in the desktop app the agents' browser
runs inside the app.

- **The Browser page** (**Browser** in the sidebar): tabs, an address bar that opens addresses and searches with your
  search providers, back, forward and reload, find in page (Ctrl+F), downloads into your Downloads folder, and sites
  asking for your camera, microphone, location or notifications (**Site permissions** lists what you allowed or
  blocked). In the desktop app its pages are real pages in the window; in a browser or on a phone they show as a live
  picture you drive, as the agents' browser does.
- **Bookmarks**: a bookmarks bar, a star in the address bar and a bookmarks panel with folders. Bring in your bookmarks
  from Chrome, Edge, Brave, Chromium, Vivaldi, Opera, Arc, Firefox or Safari on this computer, or from a bookmarks file
  any browser exports, and export yours.
- **Chrome extensions**: add one from the Chrome Web Store (paste its link, or press **Add to Hydor** on its page), from
  a folder, or bring in those installed in your other browsers. Their buttons, popups and badges sit beside the address
  bar; you can turn each off, and let one run in agents' browsers too. They run in the desktop app's browser, which has
  most of what extensions use; the panel says which parts of one may not work.
- **Hand a page to an agent**: **Ask about this page** starts a session with a copy of the page's text, and **Do this
  here** gives an agent a tab of its own at your page, signed in as you on that site and kept to it, with nothing but
  the browser (no commands, files or other tools), in Claude Code or Custom. **Take back** gives you the page back, and
  **Agents' tabs** shows every agent's browser beside yours.
- **Asking before sending on signed-in sites**: where an agent's browser is signed in (a profile that keeps sign-ins, or
  a page you handed it), it now stops before a button that sends, posts, publishes, deletes or transfers something and
  asks you, as it already did before paying (**Settings → Browser → Ask before sending on signed-in sites**).
- **The agents' browser in the desktop app** now runs inside the app, with no Chrome to install: its pages draw fast in
  the window and you click into one to use it yourself (the agent waits meanwhile), and it keeps working with the
  window closed. **Settings → Browser** lists it first; Chrome and Chromium are still there to choose.
- **The terminal**: `hydor` chat shows what an agent's browser waits for (a login, a payment, an address on this
  computer, a button to allow, a page's question) and lets you answer it, and `hydor run` stops with needs-answer.
- **Usage** has its own button in the sidebar again, right after **Browser**, with the bar that shows how much your
  plans have left; **System** keeps Files, Git, Terminal, Preview, Monitor and Experiments. The sidebar's ten tools sit
  in two rows of five.

## 0.81.0 · 17 November 2026

Grok Build gets an effort picker, plan usage meters and switching accounts at a limit, like Claude Code and Codex.

- **Effort for Grok Build**: Grok's models take a reasoning effort, each its own levels (Grok 4.6: xhigh, high,
  medium or low, high to start; Grok 4.5: high, medium or low). The start page's **Options → Effort** offers them as soon as Grok
  Build is added, even before its first session, because the app asks Grok for its models. A running session changes
  its effort in its own Effort picker, and app runs take it too. When you switch to a model that does not take the
  effort you had (xhigh on Grok 4.5), the picker shows that model's default, and that is what it runs with. The same
  works for any other agent that speaks ACP whose models offer efforts.
- **Grok's plan usage**: the Usage page's **Limits** tab has a **Grok Build** card for Grok's own sign-in and one for
  each Grok account you added, with the plan (SuperGrok, SuperGrok Plus or SuperGrok Heavy), **Weekly** usage and when
  it resets, the credits left and **Pay as you go** spending ("$12.00 of $50.00 this month") when the plan has them.
  Signed out, the card says to sign in; on a plan run by a team it says the limits are managed by your team. The
  small usage meter in the sidebar counts Grok too.
- **Switch accounts at a limit** and **Resume after usage limits** now work for Grok Build: when a Grok account
  reaches its weekly limit, its credit limit or its pay-as-you-go spending cap, the session moves to another signed-in
  Grok account with usage left (the least used one) and continues there; with none left it waits for the reset when
  **Resume after usage limits** is on. A message to a session whose account is out moves it first, a new session
  starts on an account with usage left, and a short rate limit (a burst of requests) moves nothing. The limit notice
  above the message box shows for Grok sessions too, and **Switch accounts at a limit** shows in **Settings → Agents →
  Accounts** as soon as you have added any account, Grok's included.
- Limit resets (Codex reset credits, Claude reset grants) and API credit at a limit are still for Claude Code and
  Codex only.

## 0.80.0 · 17 November 2026

Projects that were around before wiki memory can build it from their own history, and a new session offers to do it first.

- **Build from history**: a project's wiki memory can now be built from everything the project already has: its files
  (the folder's layout, README, AGENTS.md and docs), its memory notes, every conversation, the whole commit history and
  its documents in Knowledge. What matters most is read first, the rest follows in the background, and the articles
  are organised into areas at the end. While a project's wiki is new (fewer than 10 articles, never built),
  **Memory → Wiki** says what the project has to build it from, with a **Build from history…** button.
- **A new session asks first**: when you start a session in a project whose wiki is new but has something to build
  from, a card under your first message asks whether to build its memory first (recommended for large or ongoing
  projects). The agent gets your message once the most important part is read, usually a few minutes later, and the
  rest goes on in the background. **Start now** stops waiting, **Start without memory** asks again after a week, and
  **Don't ask for this project** stops asking. What you send meanwhile waits in the queue and goes after the first
  message. It works the same on a phone.
- **Progress you can stop**: while a build, rebuild or update runs, **Memory → Wiki** shows its steps, what it is
  reading and about how long is left, with **Stop** and later **Continue**. What it wrote stays.
- **Rebuild reads everything**: **Rebuild from sources** now also reads the project's files, the conversations and
  documents the wiki never read, and the whole commit history, not only what the wiki kept.
- **Faster**: a build or rebuild reads several sources at once (three with the Automatic helper, four with a model over
  an API), and two of them never overwrite the same article.
- **Less noise for agents**: agents hear of a project's wiki only once it has an article, or while their session waits
  for its build.
- The **Memory** tab's count no longer counts the wiki's own sources as documents.

## 0.79.0 · 17 November 2026

Grok Build, xAI's coding agent, runs in Hydor, with your Grok subscription.

- **Grok Build as an agent**: add it in **Settings → Agents → More agents**, beside Gemini CLI, OpenCode and the others,
  with one click. The app installs it the first time it is needed, or uses the one you already have, and keeps it up to
  date with the other agent programs. Its sessions use the app's own tools and approval cards, and Grok's models.
- **Sign in with a Grok subscription**: once it is added, **Settings → Agents → Accounts** lists **Grok Build** beside
  Claude Code and Codex. **Sign in** gives you a link and a one-time code: open the link on any device, sign in with your
  Grok account and confirm the code, and the page notices when you are done. A session started while signed out says so
  and where to sign in. An xAI API key in `XAI_API_KEY` works too.
- **More than one Grok account**: **Add an account** offers Grok Build beside Claude Code and Codex. Each account keeps
  its own sign-in and its own Grok history; your Grok settings, rules, skills and plugins are shared. Pick the account
  for a new session under **Options → Account** on the start page, and move a session to another one with its
  **Account** chip. Usage meters and switching accounts at a limit are still for Claude Code and Codex only.
- A session whose agent can no longer reopen it (any agent that speaks ACP) now starts afresh, with a note, instead of
  failing.

## 0.78.1 · 17 November 2026

Translations leave technical words alone.

- In the app's languages, a word placed inside a sentence (a search mode, a file or field name, a project's folder, a
  parameter) stays as it is when it looks technical, or is written in small letters where the app's own label of that
  name has a capital: "hybrid", a wiki search mode, no longer comes out in Chinese as another screen's "hybrid working".
  The app's own labels, times and lists of days are translated in their sentences as before.

## 0.78.0 · 17 November 2026

A wiki that organises itself: articles grouped in areas with hub pages, a structure that changes as the project does,
rebuild and update on demand, and a flexible search for agents down to the section.

- **Areas and hubs**: a project's wiki now groups its articles in areas (at most two levels), each with a hub page: what
  the area covers, its key facts (each from the article it names) and its articles. The index lists them by area, the
  Memory tab's Wiki groups them, and agents get the list of areas in one line. A new article is placed as it is
  written; an article that fits no area waits in **Other**.
- **It keeps itself in order**: hubs are rewritten when their articles change; articles named after an event ("…
  rebuild in 0.34.0") are folded into topic articles and near-duplicates merged, with the earlier text kept and the old
  path leading to the new one; and the areas themselves change over time (split, merged or renamed when the wiki grows),
  a little at a time and at most weekly, the old names still understood. **Recent updates** shows each change.
- **Update now, rebuild, restore**: a **⋯** menu on the project's Memory tab → Wiki can update the wiki at once (read
  what waits, bring articles up to date, reorganise the areas), rebuild it from the sources it keeps (an estimate of
  the helper calls and cost first; the current wiki archived, and the one before the first rebuild always kept), or put
  an earlier wiki back. Agents can do the same when you ask them.
- **Search the wiki any way**: agents get wiki_search, by words and meaning, exact text or a pattern, over areas,
  articles or sections, in an area, under a path, among the sources or plans, or in other projects; and wiki_read can
  open just one section, or some lines.

## 0.77.0 · 17 November 2026

Richer search results: pictures, videos, sounds, the Library's pages and files show in the search box with thumbnails
and their details, on a computer and on a phone.

- **Thumbnails in the search box**: pictures, videos (with a play mark), sounds (their shape), the Library's pages,
  documents, slides and spreadsheets, and picture files show a small picture beside their name, so you can tell them
  apart at a glance.
- **Details under each name**: what it is (a picture, a video, a document, slides, a PNG image…), its size or length,
  the project and folder it is in, and when it last changed; a page's description follows.
- **A larger preview**: on a wide screen the preview beside the list shows the picture or page larger and plays a
  video or a sound right there, with its kind, size, length, the model that made it, its project and folder.
- **Easier on a phone**: the rows are taller and easy to tap, and each says enough without the preview.
- **Find things by their kind**: typing "slides", "spreadsheet" or "document" finds your decks, sheets and documents.

## 0.76.0 · 17 November 2026

Memory across projects: agents can search your other projects' notes, wiki and documents, and past conversations of
this project or all of them, when they need to; a project can keep itself to itself.

- **Search all of memory**: a new tool, memory_search, lets an agent look through memory notes, wiki articles,
  documents and past conversations at once, in its own project, in all your projects, or in one by its name ("how did
  we set up releases in the other project?"). Other projects' memory is only ever read, and only when an agent asks:
  nothing more is given unasked.
- **Past conversations of this project or all**: search_sessions can keep to this project, or search one project or
  all of them, and says which project each conversation is from.
- **Other projects' wikis and documents**: an agent can open an article of another project's wiki, or one of its
  documents, to read it; writing stays with each project's own agents.
- **Searchable from other projects**: a switch on a project's Settings tab, on unless you turn it off, keeps that
  project's notes, wiki, documents and conversations out of reach of your other projects' agents.

## 0.75.0 · 17 November 2026

Memory that keeps up with big projects: agents get what bears on each message and on each file they open, notes and
wiki articles follow the code as it changes, the wiki revises itself, and models with a small context get memory sized
to them.

- **Memory with each message and each file**: besides what they start with, agents get the notes that newly bear on
  each later message, and the notes about a file and its folder when they open or change it, each only once a session,
  and usually nothing at all. They also start with the project's wiki articles that bear on the request, and its active
  plans.
- **Better picks**: agents start with the notes that help more often (measured on this app's own sessions), never a
  note together with the topic that sums it up, and a rare name you write (a file, a function, a version) finds the
  notes that hold it. A project's profile puts first the rules agents need in most sessions.
- **Notes that follow the code**: a project's notes and wiki articles are tied to the files they name. When those files
  change, they are marked as maybe out of date (agents see it, and you see it under **In the code** in the note), and
  the tidy-up checks them against the change: still true, brought up to date, or removed.
- **A tidier memory**: the tidy-up moves notes about one project out of **About you**, moves long design history into
  the project's wiki (leaving a pointer), drops notes the project's AGENTS.md already says, and suggests lasting
  conventions for it: **Add** or **Dismiss** them under **Suggested for AGENTS.md** in **What the last tidy-up changed**.
- **Needed means used**: **Needed by agents** now counts the times agents used a note (looked it up, cited it, worked on
  its files), and a new line, **Given to agents**, the times they got it without asking.
- **A wiki that revises itself**: an article can now replace what a newer source contradicts, with a reason for each
  statement it removes, and its earlier text is kept (the 20 latest of each article). Long articles are split into
  parts, the index gives each article's summary, and articles whose files changed are brought up to date each day
  (**Code changes** in Recent updates).
- **Big document sets**: a project with more documents than its wiki reads now has the pinned, the most used and the
  newest read, up to its limit, and an overview article for the rest. **Read into wiki memory**, in a document's menu
  on the project's Memory tab, pins one.
- **Learning from busy projects**: the wiki picks the conversations that hold the most (commits made, corrections,
  fixes), reads a session once it has gone quiet, and reads the day's commit messages (**Commits** in Recent updates).
- **Small models**: with a model of a small context, Custom gets memory sized to it: under 12,000 tokens a small block
  and nothing added with messages or files; up to 33,000 a little more; your profile's start only (a session that saw
  only its start cannot rewrite it); and a session's checkpoint cut to fit.
- **How memory works**: two new pages in the documentation, with figures, describe memory for everyone and its
  internals for developers.
- Hydor subagents that reach their account's usage limit carry on with another account, and tell their lead so.
- Quadrant charts write every name in full, beside its point or in a numbered key when names would overlap; subagent
  cards name the tier and the agent once.

## 0.74.0 · 17 November 2026

Plans and lesson suggestions in Wiki memory, Wiki memory switches for each chat, the whole guide in German, and all of a
project's skills turned on as well as off. With thanks again to wirrockendigital, whose contributions brought these.

- **Plans in Wiki memory**: **Adopt a plan** on a project's Memory tab (Wiki) starts a session that asks you for the
  plan, shows what the project has already and a preview, and keeps it in the project's wiki once you agree on a card.
  A plan changes only that way: each revision is shown first, and the plan as it was is kept. Agreeing to a plan does not
  let an agent start on it. **Plans and evidence** lists them, with what was done for each.
- **Wiki memory for each chat**: a chat's options have **Wiki memory** and **Auto lessons learned** switches, and
  **Settings → Memory** has their defaults (**Wiki memory on by default in chats**: on; **Auto lessons learned by default
  in chats**: off). An agent changing them always asks you first.
- **Lesson suggestions**: with Auto lessons learned on, the helper model may suggest a lesson for the project's wiki
  after a turn; only you keep or dismiss it.
- **A checkpoint before a long conversation is compacted**: Claude Code and Codex sessions keep one in Wiki memory first
  (the helper reads the last messages, which can add a few seconds). A session started before Wiki memory was turned on
  gets it after a restart.
- **The guide in German**: every topic, when the app is in German. German now says one thing one way throughout, and the
  built-in agents have German names (Forscher, Programmierer…).
- **A project's skills**: **Turn on all skills** beside **Turn off all skills** in its Skills tab's **⋯** menu, both
  asking first; the menu's other items now read **Follow default settings for all skills** and **Change default skill
  settings for all projects**.
- **Your own messages**: **Copy message** sits under each message you send, with **Edit from here** and the time.
- **Fixes**: in Chinese and Greek, the phone setup's messages and the board's monthly cap notice are translated; a
  picker's label is translated even when it shows one of your own agents; a message with only files shows its files and
  nothing empty to copy.

## 0.73.0 · 17 November 2026

Wiki memory reads each conversation once and keeps only what matters from documents. A project with too many documents
leaves them to search, and large data files are analysed with code.

- **Each conversation is read once**: learning from a project's work keeps where it stopped in each session. A session it
  has read is never read again; when it goes on, only its new turns are read, and the helper is told they continue what it
  read before. A session an agent is still working in, or one there was no room for that day, waits for the next time
  instead of being missed.
- **Only what matters from documents**: the wiki keeps a document's key facts, findings, decisions, names and numbers,
  and leaves the detail in the document, where agents search it.
- **Most documents to read into the wiki**: a new setting in Settings → Memory → Wiki memory (100 at first), and a
  number of its own on a project's Settings tab. A project with more documents than that keeps them all out of its wiki:
  agents search them instead, and its Memory tab says so. Raise the limit and they are read.
- **Large data files analysed with code**: a big CSV or TSV file, a spreadsheet or JSON data is no longer read as text.
  The helper writes short Python programs that Hydor runs in a sandbox with no network, which sees only that file, and
  only its findings go into the wiki. This works on Linux with bubblewrap; on macOS and Windows such files are searched
  only for now. Agents in sessions are also told to analyse a large data file with code from its path.

## 0.72.0 · 16 November 2026

Your agents get switches for the browser and the computer, wiki memory learns from each project's work, and a folder
linked in a reply opens in its pop-up.

- **Use a browser and Use the computer**: what an agent may use has two more switches. **Use a browser** lets it open
  websites, click and fill in forms in the app's browser (until now that came with **Use the web**), and **Use the
  computer** lets it see the screen and use the mouse and keyboard, in the desktop apps with Computer use on (until now
  every agent could). Claude Code, Codex and Custom all have those tools switched off when they are off, and an agent
  no longer reads how to use tools it can't. Agents you saved with some switches off keep what they could do: the
  browser where they had the web, the computer where they could run commands. The same goes for an older version of an
  agent you bring back, and for an agent file from an earlier Hydor.
- **Wiki memory learns from the project's work**: about once a day, with **Learn from conversations** on in Settings →
  Memory, the helper model reads each project's recent conversations (your own words and the agents' replies, never
  their tools' output; never confidential sessions, sessions with memory off, helpers or scheduled runs) and adds what
  is worth keeping to the project's wiki: decisions and why, how things work, pitfalls and their fixes. Each
  conversation is kept as a source, and **Recent updates** on the Memory tab opens the session it came from. The first
  time it looks back two weeks, so wikis that were still empty fill in soon after this update.
- **Documents already in a project's knowledge** are read into its wiki too, once, at the same gentle pace as new
  ones: until now only documents added after 0.71.0 were.
- **A folder linked in an agent's reply** opens in the pop-up over the conversation, as the Files page shows it,
  instead of "Could not open the file". Its folders open in place, a file opened from it has an arrow back to the
  folder, and **Open in Files** goes to the folder there.

## 0.71.0 · 16 November 2026

Wiki memory: each project keeps a wiki that grows from its documents and its work, beside its notes and documents on
one Memory tab. Hydor in German, a sidebar you can resize and fold, and the buttons under every reply. With thanks to
wirrockendigital, whose contributions brought German, the wiki this grew from, and the new navigation.

- **Wiki memory**: each project keeps a wiki of Markdown articles with their sources. Agents read it and add to it as
  they work, and when you add or change a document in a project's knowledge, the helper model reads it, updates or adds
  a few articles and keeps a few short notes in the project's memory. It is on for every project: turn it off for all
  of them in **Settings → Memory → Wiki memory**, or for one in its **Settings** tab. Project wikis are kept in the wiki
  folder (`~/Hydor/.wiki`), so nothing is written into your project folders, unless you choose each project's own
  folder. Agents only reach their own project's wiki and the shared one, never hidden files, and a folder move keeps
  the old folder as a backup.
- **One Memory tab per project**: a project's notes, its wiki and its documents in one place (**Notes · Wiki ·
  Documents**), with what new documents changed lately. It replaces the Knowledge tab. **Learn from new documents** in
  Settings → Memory stops the updates from documents, if you'd rather the helper model didn't read them.
- **Hydor in German**: **Settings → General → Language → Deutsch**, and agents write to you in German too. A browser set
  to German starts in German.
- **The sidebar**: drag its edge to make it wider or narrower, and fold **Active** and **Projects**.
- **Under each reply**: **Copy message**, **Fork from this reply** and **Read aloud** sit under every finished reply,
  no longer only when you point at it. A Codex reply can be forked too, from the last reply of a finished turn.
- **Turn off all skills** for a project, in its Skills tab's **⋯** menu, after you confirm.
- **Fixes**: in Chinese and Greek, **Recent files**, **Home folder** and **Trash** in the file browser are translated;
  branch names, the steps an agent writes in its plan and the names in menu labels are never translated.

## 0.70.0 · 16 November 2026

Boards: pin answer cards from any reply to a page of the Library and have them keep themselves up to date. Answer
cards can read their numbers from a spreadsheet or a file, and the app can be opened on your own phone in one step.

- **Boards**: a new kind of Library page, a grid of answer cards. **Pin to a board**, first under any answer card's
  **…**, keeps a copy of the card on a board you pick, or on a **New board…** named there. On the board, set each card's
  size (S, M, L or Wide), move it, open it full screen, save it as a picture, rename it, remove it or open the
  conversation it came from; on a phone, one card under another. Boards keep a version of each change, sit in folders
  and projects, and can be shared by a read-only link. Agents can make a board or add cards to one when you ask.
- **Cards that keep themselves up to date**: **Keep it up to date…** in a card's menu asks an agent the card's question
  again on a schedule (every hour, every day or weekday at a time, or every week), on the tier you choose, after
  telling you about what each update and a month of them cost. Each update runs in a session of its own that sends
  nothing, changes only that card, and shows when it was updated and what it cost; **Refresh now** and **Refresh all**
  do it at once. A card that fails three times in a row pauses. Each board has a monthly cap for its updates ($5 unless
  you change it). Updates show in the week view of everything that runs by itself, and in **Settings → Scheduled
  tasks**. A copy of a board keeps its cards' updates paused until you turn them on.
- **Numbers from a spreadsheet or a file**: a table, a chart, key figures, a ranking, a histogram or values on a map can
  read its numbers from one of your Library spreadsheets, or from a CSV, TSV, JSON or JSONL file in the conversation's
  folder or its project's, with totals, averages, groups and filters, instead of an agent typing them. It redraws when
  the spreadsheet changes, says where its numbers come from, and stays current on a board without any update. Shared
  boards show these cards to the people you share them with.
- **Use on your phone**: **Settings → Use on your phone** checks for Tailscale on this computer, serves the app over
  HTTPS to your own devices only (never the public internet; the password is still asked), and shows a QR code to scan.
  On the phone, it walks you through **Add to Home Screen**, **Notify this device** and a test notification. **Stop
  serving** undoes it. Links the app sends you use that address when no other is set. The desktop apps offer it in
  their first-run tour; in a terminal, `hydor machines phone`.

## 0.69.0 · 16 November 2026

See what happened while you were away, everything that runs by itself on one week, exactly what changed in a
spreadsheet, and agents you can roll back, check with examples and share as a file.

- **While you were away**: under the message box, one folded line says what needs you, what failed, what finished and
  what runs next since your last visit. Open it for the rows: answer a question or an approval in place, open a
  finished session or run, or **Mark all as seen**. It stays as you left it on each device. In a terminal: `hydor away`.
- **Schedules**: a tab on the Agents page, and **Week view** in **Settings → Scheduled tasks**, show everything that runs
  by itself on a week: each run coloured by how it went (opening its session), what runs next drawn faintly, tasks that
  run every few minutes, watchers and webhooks as bands, each day's cost, a month view, and a list of them all with a
  switch to pause each. On a phone, one day at a time.
- **What changed in a spreadsheet**: **Tools → Compare with the version before** (or with any version) shows the changes
  in place: changed cells tinted, rows and columns added or removed, tabs added, removed or renamed, and a list of each
  change with before → after. Put back one change, or the whole version, kept as a new version. A spreadsheet an agent
  changed in a session has **See what changed** on its card.
- **Agents with versions**: every save of one of your agents keeps the version before, with who made it (you, an
  agent, an install). **More → Versions** compares two and brings one back.
- **Examples that check an agent**: give an agent a few example messages and what its answer must do. **Try the
  examples** runs them in throwaway sessions that send nothing, after telling you what it costs, and shows which passed.
- **Share an agent as a file**: **More → Download as a file** saves it as a `.hydor-agent` file, leaving out your
  projects, accounts, recipients and keys. **Install** on the Agents page shows what a file brings and needs before
  anything is saved; its schedules come paused, and Full access becomes Accept edits. In a terminal: `hydor agents
  export` and `hydor agents install`.

## 0.68.1 · 16 November 2026

Starter ideas line up on a phone.

- **Starter ideas on a phone**: the row of ideas under an empty message box now starts in line with the box, instead of
  with its first card cut off at the edge of the screen.

## 0.68.0 · 16 November 2026

Work that starts with an email and ends with something sent: connect your mail with an app password, start a task for
each new email, record or event, keep what agents would send in an Outbox until you say so, and send an agent's
results to people. The start page gives you ideas to begin with, sessions say how they ended, answer cards open full
screen and save as pictures, conversations export, and what you capture on your phone reaches your agents.

- **Email, with an app password**: **Apps → Connected apps → Email** connects Gmail, iCloud, Fastmail, Yahoo, GMX, Zoho,
  Proton Mail (through its Bridge) and most other mail with your address and an app password. The servers fill in by
  themselves, with a link to your provider's page on making the password, and no Google Cloud project is needed. Agents
  can search, read, file, draft and send, and save attachments in their folder. Outlook.com and Microsoft 365 need a
  Microsoft sign-in, which this does not do yet; the form says so.
- **Ask first, and the Outbox**: each tool of a connected account is now **On**, **Ask first** or **Off**. Tools that send,
  post, delete or pay start on Ask first for accounts you connect from now on; accounts you connected before keep their
  settings, with a one-click offer to switch. A call to such a tool waits in **Inbox → Outbox** as a draft you can
  change (an email shows To, Cc, Subject and Body): send it, drop it, or send all of a session's at once. It holds for
  every agent and in every permission mode, Full access included.
- **Test without sending**: beside a scheduled task's **Test run**, a test that runs it as it would run but keeps every
  call that would send, post, delete or pay as "would have sent", and makes none of them.
- **A task for each new email**: **Watch → Email** starts a task when new mail arrives in a folder, from someone or with a
  subject you choose: one run for each email, with its text and its attachments, never twice for the same one.
- **A task for anything new in a connected account**: **Watch → A connected app** checks one of an account's tools that
  only reads (new deals, files, tickets, payments…), without a model, and starts a run for each new item. **Try it**
  shows what came back and picks out the items. For a calendar, **Before each event** starts a run 15 minutes, 30
  minutes, an hour or the evening before each event, following events that move and skipping cancelled ones.
- **Where an agent's results go**: each run can add a row to one Library spreadsheet (a column for each field, so charts
  of it follow), update the same Library page as a new version instead of making a new page each time, and email the
  results to the people you name, from your connected mail account. An agent's page now shows its results as a table,
  a column for each field, kept for a year.
- **From your phone to your agents**: photos, files and voice messages you send to Hydor in Telegram, Discord or Slack
  now reach the agent, saved in the session's folder (voice messages turned into words). `/agents` lists your own
  agents and `/as Bookkeeper` starts a session as one of them; **New sessions as** gives each chat app one. Installed
  on Android or a computer from Chrome or Edge, the web app appears in the **Share** menu: what you share opens in the
  start page's message box.
- **Starter ideas**: under an empty message box, six ways to begin: three example requests that change each day, the
  two apps you run most, and an example of work that repeats. A tap fills the box; **Hide** puts them away, and
  **Settings → General → Starter ideas** brings them back. The line under the title now says what you can ask for.
- **Sessions in plain words**: a session that is not running says how it ended: **Done** (with the files it made or
  changed), **Stopped** or **Failed**, where all of them said Stopped. A finished turn shows what it cost (at API prices
  when you are on a plan) where its tokens were; the tokens are still under **Time and cost**. **Today** on the start
  page counts sessions, file edits and cost.
- **Answer cards full screen and as pictures**: every answer card has **Full screen**, and **Save as picture** and **Copy
  as picture** under its **…**. Cards with a map or a Plotly chart inside cannot be saved as pictures yet.
- **Export a conversation**: the session menu's **Export** saves it as a Markdown file, copies it as Markdown, or makes a
  Library document of it, with answer cards as tables and text. In a terminal: `hydor sessions export`.
- **Keep the computer awake**: the desktop apps keep the computer from going to sleep on its own while agents work and
  from a few minutes before a scheduled task is due until it starts (**Settings → General → Keep the computer awake**).
  Closing a laptop's lid still puts it to sleep.
- **Screenshots agents check**: the smaller copy of a screenshot that agents look at to check their work came out
  garbled with the newer browser; it is right again.

## 0.67.1 · 15 November 2026

A session you delete leaves the list at once, and stays gone.

- **Deleting a session**: it leaves the sidebar as soon as you confirm, a running one too, though the app still stops
  its agent first. Before, it stayed for a few seconds while the agent stopped.
- **No coming back**: a deleted session could show up in the list again when something reached it just after the
  delete: its agent's last lines being read as it stopped, a page still open on it marking it read, or a pull request
  check on its way. None of these brings it back now.

## 0.67.0 · 15 November 2026

Custom sends far less to its model before your message: about 10,000 tokens instead of 17,700 for a first "hi", and
about 5,900 for a model with a small context, such as one on your own computer. Its sessions now show how full the
model's context is, and what fills it.

- **Skills by name**: Custom is told its skills' names, by group (the project's own, yours, then the library's groups
  such as Coding or Documents), instead of a description of each one. The skills that fit your first message still
  come with what each is for, and Custom can look a skill up by what the work is. It now takes up to 200 skills, so
  none of the library's are left out when you have many of your own.
- **Instructions that come with their tools**: what a feature tells Custom about its own tools (pictures, apps, the
  browser, PDFs and documents, signatures, Pages, the guide, keys in the vault…) now comes when Custom brings one of
  those tools in, not with every message. The rules that always hold stay: how replies look, never asking you to type a
  password into the chat, your knowledge bases, experiments on your GPUs only when you ask, cleaning up. A session you
  start from Help or from a page has its feature's instructions from the start. Claude Code and Codex are told
  everything as before.
- **Lean for small models**: a model with a context of about 32,000 tokens or less (not through OpenRouter) gets no
  guidance on answer UIs, the list of its other tools by name only, and fewer tools in full.
- **How full the context is**: a Custom session shows the ring beside the message box, as Claude Code and Codex
  sessions do, without Compact, since Custom condenses its conversation by itself. Under **Options**, click the
  **Context** row to see what fills it: instructions, the project's instructions, memory, the app's features, skills,
  tools and the conversation.

## 0.66.0 · 15 November 2026

Custom's sandbox for commands now works on a Mac and on Windows too, and a Claude Code session no longer stays
"working" after its turn ended when its model is switched.

- **The sandbox for commands on a Mac and on Windows**: in Auto mode, Custom's commands can change files only in the
  session's folder and the temporary folders, everywhere Hydor runs. On a Mac it uses Seatbelt, the sandbox that comes
  with macOS, which also keeps a confidential session's commands off the network. On Windows commands run at low
  integrity, a protection Windows has: they can read everything but change files only in the session's folder, which
  Hydor marks for it the first time, and in a temporary folder of their own; your home folder, a whole drive and
  system folders are never marked. Before, the sandbox needed bubblewrap, so it worked on Linux only.
- **Sessions that finished show as finished**: a Claude Code session whose model was switched after its turn ended
  showed as working until the app restarted. What the model switch prints no longer counts as a new turn.

## 0.65.0 · 14 November 2026

Compare products asks which of the options it found to compare as choices you tick, reads what you add in your own
words, and gives a clearer answer: a runner-up, how each one scores on what matters, and prices from where you buy.

- **Compare products, picking what to compare**: when you describe a need, the options it finds come as choices to
  tick, all ticked at first, with a line to add others or to say what else to look for ("include Chinese brands"). What
  you write there is read and acted on: before, an answer like "all, including chinese phones" was taken for the name
  of a product, and the run compared that one "product".
- **Compare products, a clearer answer**: the pick shows its price, the shop it was seen at and its score; a runner-up
  says who should choose it instead; Side by side has a table of each product's score on each thing that matters, and
  each product's page shows how it scores. Prices come from shops in the country you buy in (or your time zone's), in
  one currency; a budget you give is kept to; products the research found too little on are named instead of guessed
  at; and when only one product was compared, it says so.
- **Apps, choices from what a run found**: an Ask a person step's choice can offer the items an earlier step found,
  and a choice can let people pick several (**Several can be picked**, in an app's form too); a ticked choice shows a
  check mark.
- **Apps, questions with tables**: an Ask a person question shows its tables and lists formatted on its card, and
  reads as one plain line in its notice and the Inbox.
- **Bar charts in app views**: horizontal bars read from the top down, long names go on two or three lines instead of
  being cut off, and the chart grows with the number of bars.

## 0.64.1 · 14 November 2026

Agents reach for answer UIs in more of their answers: a comparison comes as a comparison table to read across, not
plain text, and next steps as buttons to tap.

- **Comparisons and lists**: when an answer compares things, lists things each with its details or shows rows of data,
  agents now show it in one of the app's answer UIs instead of a plain table, and look up the ones they need in a
  single step before they write.
- **Next steps as buttons**: instead of ending on an offer such as "tell me your engine and I'll suggest a library",
  agents give you the likely next steps as follow-up buttons.
- **Practice problems**: tutors know how your answers are matched, so they accept each way you might write one.

## 0.64.0 · 14 November 2026

Agents answer with more than words: the parts of an answer that are better seen, compared, tried or practised come as
cards, charts, maps and small tools, and six new ones let you practise, run code, check claims and ask the next question
with a tap.

- **Richer answers, more often**: every agent now knows which answer UIs suit which kind of answer (options to weigh,
  things with pictures, numbers, plans, things to do, learning, writing, checking facts) and shows each part of an answer
  that one of them shows better than prose in it, with pictures filled in, and a video where watching helps more.
  Conversation, short answers and code changes stay text, and your guidelines can still ask for plain text.
- **Practice problems**: answer in your own words or numbers and each one is checked in place (numbers within a
  tolerance, words without minding capitals, with a note when only the accents are off), with hints one at a time, the
  worked solution once you've tried, and your results to send to the tutor.
- **Code playground**: JavaScript, Python or a web page that runs in the reply, sealed off from the app. Change it and
  run it again, see its output (and Python's plots), or send your code to be checked.
- **Annotated text**: your writing with passages marked, each with a note (a correction, a comment, a meaning). Tap one
  to read it, filter the notes by kind, and copy the text with every change made.
- **Fact check**: claims with their verdicts, why, how sure, and the evidence for and against with its sources; tap a
  verdict to see only those claims.
- **Network graph**: how things connect (a concept map, a novel's characters, ideas, dependencies). Tap a node to light
  up its links and read its note, drag nodes to make room, or read it as a list.
- **Follow-ups**: buttons for the next questions at the end of an answer. One tap sends it when your message box is
  empty, or adds it to what you're writing.
- **The built-in agents**: General asks with choices to click and offers next steps to tap. The Tutor makes each step
  something to see or try, checks with practice problems and quizzes, corrects a language learner's sentences in place
  and closes a topic with flashcards. The Researcher leads with the key points and weighs claims in a fact check; the
  Writer shows its edits marked, with why, and hands over emails and posts ready to use; the Planner shows itineraries,
  agendas, checklists and budgets; the Analyst key figures, charts and tables; the Coder errors, test runs and commands
  to run.

## 0.63.2 · 14 November 2026

A project's tabs fit a phone: the ones that don't fit are one tap away under More, instead of running off the edge of
the screen.

- **Project tabs on a phone**: a project's page shows the tabs that fit (Overview, Library, Files and Knowledge on most
  phones), then **More**, whose menu has the rest (Skills, Agents and Settings), each with its icon. While you're in
  one of those, its name shows in place of **More**, so you always see where you are. The same goes for the page of a
  project someone shared with you, and for a narrow window on a computer.
- **Tidier tab rows**: a project's tabs are taller on a phone, so they're easier to tap. No scroll bars show under any
  row of tabs, and a row that still scrolls sideways elsewhere in the app keeps the open tab in view.

## 0.63.1 · 13 November 2026

When an agent answers you and then goes on working, its answer shows as a reply in the conversation, not folded into
its steps.

- **Answers between steps**: a message you send while the agent works, or a question it answers before recording what
  you agreed, used to get its answer folded into the turn's steps, shown as one short line of the outline, with only
  the agent's last words under the work. Now that answer shows as a reply, in its place, tables and lists included. So
  do the reports it writes between steps during a long task, and its summary of a subagent's reply.
- **The work around it**: the steps before and after such a reply each fold under a line of their own ("Worked for
  20s · 2 commands"), so the turn reads in the order things happened. Short notes between steps stay in the outline,
  as before.

## 0.63.0 · 13 November 2026

The projects you work on in Claude Code and Codex are Hydor projects now: they show on the Projects page by themselves,
with their sessions, ready for documents, skills and guidelines of their own.

- **Projects found in Claude Code and Codex**: a folder where at least two sessions you started in Claude Code or Codex
  worked (in a terminal, VS Code, Claude's desktop app or the Codex app) becomes a project by itself, named after the
  folder, or after the name you gave it in the sidebar. Codex's own projects come over under Codex's name, with all
  their folders. Sessions that scripts ran don't count, and your home folder, hidden and temporary folders are left out.
- **A project like any other**: each one has its documents, skills, guidelines, agent, Library and sharing. Its card
  says **From Claude Code**, **From Codex** or **From Claude Code and Codex**, and its group in the sidebar shows where
  its sessions came from. Delete one you don't want, and Hydor won't make it again.
- **Every session in a project's folder is in the project**: wherever it was started (in Hydor, Claude Code or Codex),
  a session working in a project's folder now shows under the project, in the sidebar and on the project's page, and a
  session Hydor starts there gets the project's guidelines, skills and knowledge from its first turn. Making a project
  for a folder you already work in brings its earlier sessions along at once.
- **A found project becomes yours**: making a project for a folder Hydor already found makes that project yours, with
  the name and details you give it, rather than a second project for the same folder.
- **Last at work** on a project's card now follows its sessions' own activity, including sessions that run in a
  terminal or VS Code.

## 0.62.0 · 13 November 2026

Documents an agent makes or changes now always show under its reply, file names in replies open the file, every folder
in an open file's path is a click away, and the LaTeX editor's top bar is tidier.

- **Every document a turn makes shows under the reply**: when an agent writes or changes a PDF, a Word, Excel or
  PowerPoint file, a LaTeX file, a notebook, a table or a Markdown write-up, it shows as a card under its reply, each
  saying **New** or **Updated**, with **Open**, **Download** and **⋯**, whether or not the agent handed it over. That
  includes what its commands made in the session's folder, such as the PDF a LaTeX report typesets into; files other
  sessions write in the same folder at the same time are left out. Finished documents come first, then their sources;
  the first four show, the rest under **Show more documents**.
- **File names in replies open the file**: a file's name or path in an agent's reply (`report.tex`,
  `docs/report.pdf`, `src/app.ts:42`, or a full path in the text) is a link. A click opens the file in a window over
  the conversation, at the line when one is given, with **Open in Files** to see it among its folder's files.
  Agents are also told to hand over what they made or changed at the end of every such turn and to name each file as
  a link.
- **Click any folder in a file's path**: above a file opened in **Files** or in the window over a conversation, the
  path reads Home › … › folder › file, and each folder takes you to it in **Files**, with the next step picked there.
  **…** lists the folders between, and the file's own name shows it in its folder. On a phone, the folder line under
  the name lists every folder on the way.
- **A tidier LaTeX editor**: with the source and the pages side by side, **Recompile** now sits at the top of the
  pages, and the engine (**pdfLaTeX**, **XeLaTeX**, **LuaLaTeX**) is under its arrow as **Typeset with** (and still in
  **Tools**). The top bar keeps the file's path and the menus, **Edit**, **Insert**, **Format**, **View** and **Tools**,
  now as words rather than one ≡ button, and the bar over the pages no longer cuts off "N pages typeset": when it is
  narrow, its less used buttons give way first, all of them still in the menus.

## 0.61.3 · 12 November 2026

The start page now keeps its own picks for each project, each folder and the new task folder, and the **Agent** chip no
longer shows "…" after you pick a project or folder.

- **Each place keeps its own picks**: the start page remembers what you picked separately for each project, each
  folder and **New task folder**: **Runs on**, each program's **Model**, and under **Options** its **Effort** and
  **Permissions**, the **Agent**, **Memory**, the **Spending cap**, **Confidential** and the **New worktree** switch.
  Pick a place in the **Folder** chip and the box opens with that place's picks; what you have written and attached
  stays in it. A place keeps its picks once you change one there or start a session there; just looking at it keeps
  nothing. A folder you make into a project brings its picks along. The account (**Options → Account**) is the same
  everywhere.
- **Places you have not used yet open with the defaults**: the agent is **General**, or the project's own agent when it
  has one (with the program, model and permissions that agent suggests); the model is **Automatic** where it is offered;
  memory is on, there is no spending cap, and **Confidential** and **New worktree** are off. **Runs on** stays the
  program you used last, and after the update the place you had picked last keeps the picks you had.
- **Start from a place and find it as you left it**: **New session** on a project's card or page, or the project in the
  sidebar, opens the start page with that project's picks; **New session in this folder** on a folder opens it with
  that folder's picks. Sessions you start by voice in hands-free mode start in the place picked last on the start page,
  with its picks, as the agent picked there (else the project's own agent, else General).
- **No more "…" on the Agent chip**: after you picked a project or folder, the chip could show "…" because the project
  still named an agent that had been deleted. An agent that no longer exists, or does not work in the project picked,
  now gives way to the default: the project's own agent, else General.
- **Deleting an agent clears it from projects**: the projects that started their sessions as it forget it, and their
  sessions start as General (or the agent you pick) again.
- **A new project's agent shows up**: when you make a project from the start page and it gets an agent of its own (made
  in the background), the **Agent** chip switches to it once it is ready, unless you picked another agent meanwhile.
- **Picking an agent keeps you in your project**: in a project, picking an agent no longer moves the box to a new task
  folder. Elsewhere, an agent that works in the folder shown (Coder) or in a new task folder still takes the box there
  until you pick a folder yourself, and the box then shows that place's picks with the agent you picked.

## 0.61.2 · 12 November 2026

The start page's folder menu is rebuilt: your projects and your folders in two short lists, each row saying where it
is, and the whole menu fits on the screen.

- **Projects and folders in their own lists**: the folder menu now shows **Projects**, the five at work most recently
  with each one's folder, and **Folders**, the one in use and the three you picked last with where each is, under
  their own headings, then **New task folder** ("a fresh one in ~/Hydor"). **New** beside the Projects heading makes
  a project. **Browse** beside Folders lists the folders in your home folder; an arrow in the field goes up a folder,
  and the cross (or Escape) goes back to the lists.
- **A project's folder is the project**: a project's own folder is no longer listed a second time as a plain folder.
  A session started in it works in the project, with its guidelines, skills and knowledge, even when the start page
  had the folder picked rather than the project. The leftover word "space" under each project is gone.
- **It fits on screen**: the menu opens above or below its chip, wherever there is more room, and in a small window
  it shows fewer folders, then fewer projects, rather than scroll, so the **New worktree** switch is never cut off;
  a line such as "2 more" under the projects brings back the rest. On a phone everything shows in its sheet.
- The **New worktree** switch says what it does: a new branch, in a copy of the repository.

## 0.61.1 · 12 November 2026

Pages agents make look right in the dark theme again, and agents can now check a page in the dark before they show
it to you.

- **Pages in the dark theme**: a page an agent made (a mock-up, a report, a dashboard) could come out with white
  panels and pale text you could hardly read when the app was dark: the page took its colours from the app's light
  theme while its text followed the dark one. Its colours now follow the app's theme everywhere on the page, light or
  dark, and colours the page sets for itself still come first.
- **Screenshots in the light or dark theme**: you can ask an agent for a screenshot "in the dark theme", and a site
  that follows your computer's light or dark shows in the one you asked for. When an agent looks at a page it made
  before showing it to you, the screenshot shows the page as the app does, in the dark theme unless the light one
  is asked for, so it can fix what would not read well first.

## 0.61.0 · 12 November 2026

Agents ask before they run one of your apps, steps waiting their turn say so, and Explore a place finds the kinds of
place you ask for. Another machine with an older Hydor no longer opens as an empty window: the app offers to update it
from where you are. The desktop apps also show on their icon how many sessions have news for you.

- **Agents ask before running an app**: when an agent wants to run one of your apps for you, the app's card first
  shows what the app does (its steps, what it took from your message, how long its last run took and what it cost)
  and asks: **Run it**, **Always run it** or **Don’t run**. The apps you always run are listed in **Settings → Apps**,
  where you can remove one to be asked again, or add one. A scheduled task's own session runs apps without asking:
  you set the task up, and nobody is there to answer.
- **One answer, not two**: when an app's answer turns out not to fit what you asked and the agent answers itself, it
  takes the app's card out of the conversation, so you don't get both.
- **Steps waiting their turn say so**: Claude Code runs a command on its own, and the searches and page reads asked
  for after it wait until it ends. They now show **Waiting** instead of a clock that made them look stuck, and count
  their time from when they really start. Agents are also told to send a slow command on its own.
- **Explore a place finds what you ask for**: name a kind of place under **What you like** (dog parks, cafés,
  playgrounds…) and it looks for those on OpenStreetMap as well as for the sights on Wikipedia and Wikidata, and
  picks those first.
- **No empty picture boxes**: in answer UIs and app views, an entry without a picture (or whose picture can't load)
  shows without one, its words taking the space, instead of an empty, crossed-out box.
- **Machines with an older Hydor open again**: picking a machine in the sidebar's switcher that runs a Hydor from
  before 0.52 showed an empty window; its start page works again.
- **Update another machine from here**: the app you open shows another machine's pages in its own version, so a
  machine with an older Hydor now opens on a page that says so, with **Update** (it updates that machine where it
  is, shows each step, and opens its pages once it is back; agents working there carry on), **Open anyway**, and a
  way back to your own machine. When a machine cannot update itself, the page says why.
- **No more empty windows**: a page that fails to draw now says "This page stopped working", with what went wrong and
  **Reload**, and the sidebar stays.
- **A count on the app's icon**: while the window of the Mac, Windows or Linux app is away, its icon shows how many
  sessions have new notices (on the Dock, the taskbar button, or the launcher), even with Do Not Disturb or a Focus
  on. Bringing the window to the front clears it.
- Another machine's pages no longer say "Hydor was updated" when only that machine runs a different version.

## 0.60.1 · 12 November 2026

A session's options now have everything the start page offers, so you can change them without leaving the session.

- **All of a session's settings in its options**: the chip in a session's message box now lists, below Permissions,
  the same options as the start page: **Account**, **Confidential**, **Memory**, **Spending cap**, **Swarm**,
  **Research**, **Arena** and **Guidelines**. Another account takes the session over from your next message.
  Confidential and Arena show how the session started: both are picked when it starts, and a click says how to get
  the other.

## 0.60.0 · 12 November 2026

Swarm and deep research can be turned on, off or changed inside a session, and the modes that cost several times
as much explain themselves the first time you pick them.

- **Swarm and deep research in a session**: the session menu's **Session settings** now has **Swarm** (off, a swarm
  or a campaign) and **Deep research** (off or on, with its researchers, rounds, searches and report). Before, they
  could only be picked on the start page. A change takes effect from your next message: the agent starts afresh with
  what the mode needs, and the conversation carries on.
- **Know what a costly mode is for before you use it**: the first time you pick Swarm, Campaign, Deep research or
  Arena, a short card says what it does, what it is worth it for, what it is not (a quick question or a small fix is
  better done by one agent, for a fraction of the cost) and what it costs. Use it or cancel; it shows once for each
  mode, on every device, whether tips are on or not.
- **The work tray keeps a working subagent as working**: a subagent still at work no longer shows as done when one
  of its background commands ends.

## 0.59.1 · 12 November 2026

Agents you have finished with stop on their own again, so they no longer use up the computer's memory.

- **Idle agents stop again after the app restarts**: an agent session left idle stops after three hours, as before,
  even when the app restarted in the meantime. Each restart used to start the count again, so on a computer where the
  app restarted often, idle agents were never stopped and kept their memory (40 were left running at once).

## 0.59.0 · 12 November 2026

Every editor gets a right-click menu, and the ones that place things help you line them up as you move and size them,
as PowerPoint, Canva and Figma do.

- **A right-click menu in every editor**: documents, slides, spreadsheets, designs, diagrams, pages, LaTeX, notebooks,
  the code editor, and the picture, video and sound editors. It offers what fits where you click (words, a link, a
  table cell, a picture, a clip…) with the same names and keys as the editor's menus; the menu key or Shift+F10 opens
  it from the keyboard, and a long press on a phone.
- **Lining things up** in slides, designs, diagrams, pages, pictures and the video's viewer: what you move or size snaps
  to the edges and middles of the other parts and of the page, with pink lines between them, the distances to its
  neighbours, and its position or size as you go. **Ctrl+drag** copies it and **Alt** turns snapping off (**⌥** and
  **⌘** on a Mac), as in PowerPoint and Keynote; Shift keeps it straight.
- **Documents**: a web address you type becomes a link, and quotes, dashes and signs turn typographic (undo straight
  after takes one back; both can be turned off in **Tools**); drag picked words to move them; a menu on each
  paragraph's handle; table rows and columns go in and out as many as are picked; numbered lists in 1. a. i. A. I. that
  restart, continue or start at a number; Legal, A3 and A5 paper and a margin for each side; the document's language
  (**Tools → Language**); keys for the font size, the indent and copying the format.
- **Slides**: copy and paste work with other apps both ways (before, anything copied in the editor stopped pastes from
  elsewhere); rows and columns go in anywhere in a table; several parts are aligned to the slide, locked, sized and
  turned together; text boxes, shapes and lines are drawn at the size you drag; several slides are picked in the list to
  move, copy or delete together.
- **Pages**: placed parts are dragged anywhere with guides (**Place freely** in the right-click menu), nudged with the
  arrow keys and sized from every side; pasted words keep their bold, italic, links, lists and headings; any file can be
  dropped in (a PDF, a video, a sound); zoom, a width of your own, find and replace, and Ctrl+A.
- **Designs**: a **Layers** panel to pick, reorder, hide, lock and rename parts; a list of the keys (Ctrl+/); Shift+2
  zooms to what is picked and Space+drag pans; words pasted from elsewhere become a text box.
- **Diagrams**: copy and paste a shape's look (Ctrl+Alt+C, Ctrl+Alt+V); **Tab** adds a connected shape; pictures dropped
  from your computer; several shapes sized and turned together; Ctrl+Shift+H fits the page again.
- **Pictures**: **New → Picture** in the Library (and **File → New** in the editor) for a blank picture of the size you
  choose; Align to the canvas; move or transform a selection; words in some sixty fonts with bold, italic, alignment,
  outline and shadow; Shift+click draws straight lines, Alt picks a colour, a pen's pressure counts; a zoom list in the
  status bar; Paste in place; merging no longer swallows hidden layers.
- **Video**: Cut, Copy, Paste, Duplicate and Paste attributes for clips and words; several picked at once (Shift-click or
  a box) to move, cut or delete together; files dropped from your computer; captions read from .srt and .vtt files and
  saved as .vtt; a list of the keys; ↑ and ↓ jump between cuts, Q and W trim to the playhead; locked tracks are safe from
  every command, and S splits what is picked.
- **Sound**: a list of the keys; files dropped from your computer; J, K and L shuttle (Loop moves to Q); splits and picks
  snap to zero crossings, and to a time grid if you want one; a volume line on each clip, kept when you save; smooth
  fades; moving an effect's slider no longer stutters; a ripple delete keeps every track and the markers in step.
- **Spreadsheets**: cut and paste re-point the formulas that used the cells (before, they turned to 0); drag cells, rows
  and columns to move them; Ctrl+Shift+1 to 6 for number formats, Alt+= and a Σ button for AutoSum, $ and % buttons and
  a format painter; pasting from Excel, Google Sheets or a web page keeps its look; 45 more functions (SUBTOTAL, XIRR,
  NORM.DIST, ROMAN…) and a list of all of them; coloured and hidden sheet tabs; Resize, Fit to the data and Freeze up to
  here on the row and column headers.
- **LaTeX, notebooks and code**: in LaTeX, Ctrl+click (or F12) on a \ref, a \cite or an \input goes to what it names,
  citations offer "Author Year — Title" as you type, **Search** finds and replaces in every file of the project, and
  **View → Editor settings** sets the text size, wrapping and line numbers. In notebooks, each cell's menu (⋯ or a
  right-click) runs the cells above or below it, copies, cuts, pastes, splits and merges cells, and folds or clears an
  output; an outline of the headings; a run asked while the kernel starts waits for it. In the code editor, **unsaved
  changes are no longer lost** when you switch to another file's tab (a dot marks them, and closing asks first); a
  status bar shows the line and column, the indentation and the line ends (files with Windows line ends keep them), and
  Ctrl+G goes to a line.

## 0.58.0 · 12 November 2026

The `hydor` command now comes with the Linux and Windows apps too, draws only what every terminal font shows (plain
characters where symbols can't show), and greets you with a new panel.

- **The Linux and Windows apps put `hydor` on your PATH** by themselves whenever they start, as the Mac app does: no
  password, no question. Open a new terminal afterwards. With any of the desktop apps, `hydor` opens the app when it
  is closed.
- **A new welcome panel**: HYDΩR and the version in its border, the folder on its git branch, the program, model and
  mode, and the keys to remember, at one steady width. The status line under the message says the same in a line.
- **Symbols every terminal font has**: the few some fonts lacked (the branch sign, the hourglass of a queued message
  and a few more) are gone, so lines and boxes line up in Menlo, SF Mono, Consolas and DejaVu alike. In the Linux
  console, in a locale that isn't UTF-8 and in Windows' old console, the command uses plain characters instead;
  `HYDOR_ASCII=1` turns that on anywhere.
- **`hydor accounts show`** and **`hydor mcp show`** say everything about one account or tool server, never a key's
  value.
- **Lists fit narrow terminals**: descriptions are left out before names are cut, plugins and apps have a column for
  each thing they say, and `hydor library show` gives a document's full id.
- `hydor … | head` stops quietly instead of with an error.

## 0.57.0 · 12 November 2026

Sessions on Automatic start on Best and move to Max only when their own agent finds a problem too hard for it, which
costs less for the same work.

- **Max when it is needed, not when a request sounds hard.** A session on Automatic used to start on Max whenever its
  request read as a hard problem. Measured on 37 runs of coding tasks, that sent 16 of them to Max, cost 43% more on
  those, and solved one more task. Now every session on Automatic starts on Best, and its main agent moves itself to
  Max when a problem proves harder than Best can manage (a fix that has failed twice, a cause it cannot find); the
  conversation says when it does. **Max for hard problems** in Settings → Models → Tiers now turns that step up on or
  off. Measured again on those tasks, the team cost 48% less than before and 25% less than Best alone, and passed every
  check in 12 of 13 (Best alone, 11).
- **The tiers measured again**, on harder tasks: ones whose requirements are only implied, recent contest problems from
  after the models were trained, and 30 hard LiveCodeBench problems. The cheapest tier alone passed most of them, at
  about an eighth of the cost of Best; leading cheaper subagents saves 8-16% next to Best alone when the main agent
  stays on Best. The results are written up in the repository, in docs/plans/tiers-and-the-team.md.

## 0.56.0 · 12 November 2026

The `hydor` command does everything the app does, with a menu that completes as you type, Tab completion in your
shell and a new look; on a Mac it is there by itself, and agents change a session's settings when you ask.

- **Everything from the terminal.** Each part of the app is a command of its own: `hydor projects`, `tasks`, `apps`,
  `library`, `memory`, `guidelines`, `skills`, `plugins`, `mcp`, `connections`, `keys`, `agents`, `accounts`,
  `machines`, `inbox` and `experiments`, and `hydor sessions` can now search, rename, pin, archive, move, fork and share
  them. `hydor settings` reads and changes every option of the Settings page, or lets you browse them. `hydor find`
  searches everything as the search box does, `hydor guide` reads this guide, `hydor open` opens any page (the editors
  in your browser), and `hydor api` calls any part of the app's API.
- **A menu as you type in the chat.** Type `/` for the commands with what each does, `@` for files (found loosely;
  end with `/` to look inside a folder), or a value after `/model`, `/mode` or `/effort`: ↑ and ↓ choose, Tab
  completes, Enter runs. Matching is loose: `mdl` finds `/model`.
- **Your earlier messages** show in grey as you type (→ takes them), and Ctrl+R searches them.
- **A new look**: a welcome box with the folder and its branch, the message line between two rules with the model,
  the mode and what was spent under it, the mode in red when the agent acts without asking, and lists you move through
  with the arrows and filter by typing.
- **New in the chat**: `!command` runs a command in the session's folder, `/copy` copies the agent's last reply (over
  SSH too), `/clear`, `/keys`, `/queue` and `/now`, and `/hydor <command>` runs any of the commands above without
  leaving the conversation. While the agent works, Enter joins its turn or waits for it to end, as **Settings →
  General → Sending while an agent works** says.
- **At your shell**: Tab completion for bash, zsh and fish (`hydor completion install`) completes commands, options,
  sessions, models, agents and folders. `hydor help` fits on one screen, `hydor help <command>` explains one, and a
  mistyped command or option gets "Did you mean…".
- **On a Mac, `hydor` just works.** The Mac app puts the command on your PATH by itself whenever it starts, with no
  password: open a new Terminal window after the update. When the app is closed, `hydor` opens it.
- **Agents change a session's settings when you ask**: "use Opus for this session", "think harder", "leave plan mode
  and go ahead". A change to a session's permissions or spending cap asks you on a card every time, even in Bypass or
  Full access, and in Plan mode an agent can still change its own session's settings on a card.

## 0.55.5 · 12 November 2026

The helpers an agent starts all go by one name, subagents, and each one says who started it.

- What used to be called child sessions or helper sessions are now **subagents** everywhere: their cards in the
  conversation, the sidebar ("3 subagents · 1 needs you"), the tray above the message box, the status line, the
  Stop button and the guide.
- Each one says who started it. A **Hydor subagent** is a session of its own that Hydor runs, on any agent and
  model ("Hydor subagent · Codex · GPT-5.5"), which you can open and talk to. A **Claude Code subagent** is one the
  agent's own program runs inside the session, which you can watch and stop. Point at it to see which is which.
- Both kinds count as subagents in the tray, the status line and the Stop button: "2 subagents and 1 background
  task running". Background tasks are now just commands, monitors and workflows.
- **Settings → Capabilities → Child sessions** is now **Subagents**, and **Lead with helpers** in Settings → Models →
  Tiers is now **Lead with subagents**. The spending cap bar says "with subagents" when they've spent part of it.
- In the terminal app, `/subagents` lists them (`/helpers` still works), and its lines say "Subagent finished" and
  "Subagent failed".
- Agents are told the same names, so what they write about their subagents matches what you see.

## 0.55.4 · 11 November 2026

The welcome tour turns on the desktop apps' notifications, and opens System Settings when your Mac isn't allowing them.

- **Hear when it's done**, the welcome tour's step on notifications, has **Turn on notifications** in the Mac and
  Windows apps too. It shows a test notification; if your system isn't showing Hydor's notifications yet, it opens
  System Settings right at Hydor's notifications (on Windows, Settings → System → Notifications), and when you come
  back it checks again and says when they're on.
- **Settings → Notifications** does the same: when your system isn't showing them, the **Notify this device** switch
  is off, and turning it on opens those settings.
- On a Mac, notifications are still yours to allow: macOS asks once when the app starts, and clicking **Allow** is
  all it takes. System Settings is only needed if that question was missed or declined, since macOS never asks twice.

## 0.55.3 · 11 November 2026

What a session started sits in one tray above its message box, and Stop stops all of it.

- A session's helper sessions and background tasks (subagents, commands and monitors) are listed together in a tray
  just above the message box. It's folded to one line, like "1 helper session and 2 background tasks running", with
  **Stop all**. Opened, each one is a row in the same look, with how it stands, **Open** and Stop.
- A background task opens in a panel on the right, laid out like a session: how it stands, its steps or its output
  as they come, and **Stop**. It used to open in a plain dialog.
- While a session's turn, or anything it started, is still running, the button in the message box is **Stop**, and
  it stops all of it: the turn, the background tasks and the helper sessions, with any they started. Helper sessions
  stopped this way don't report back and wake the session up again.
- A helper session's card in the conversation has the same look as the tray's rows.

## 0.55.2 · 11 November 2026

The prompt bar keeps its spinning ring while a session's background work still runs.

- **When a turn ends while what it started is still running** (a helper agent, a command in the background, a
  monitor or a child session), the ring by the message box keeps turning, now around the **Send** button, until they
  finish. Before, it stopped, so the session looked finished although its header said "Working · 2 in background".
  You can send messages as usual meanwhile, and pointing at the button says what is still running.
- It also shows when the session's own process has stopped between turns while its child sessions run, on session
  pages and in Help's ask panel.

## 0.55.1 · 11 November 2026

The desktop apps' notices come as your system's own notifications, such as Mac notifications, even with the window
closed.

- **When a session finishes, fails or needs you**, the Mac, Windows and Linux apps now show a notification from your
  system (on a Mac, in Notification Center), whether the window is in front, behind other windows or closed, and also
  when the app opened at login without its window. Before, they showed only a small card inside the window, so a
  notice could go unseen while you worked in another app. Click a notification to open its session.
- The cards inside the window no longer show in a desktop app, so nothing comes twice. They show only when your
  system doesn't show the app's notifications (on a Mac, when they're not allowed in System Settings → Notifications
  → Hydor). There is still no notice about the session you're looking at, and a newer notification about a session
  takes the place of the older one.
- On a Mac, macOS asks once whether Hydor may send notifications. Notifications left from before the app restarted
  still open their session.
- **Settings → Notifications** in a desktop app says how the notifications reach you and whether your system shows
  them, and **Send a test** shows one right away.

## 0.55.0 · 11 November 2026

Settings, redesigned: every section is calmer and easier to scan, and Memory is rebuilt from the ground up.

- **Every section reads the same way**: short groups of settings, each with its name, at most one short line on what
  it does, and its switch or button at the end. The longer explanations sit behind an **(i)** beside a setting's
  name, and the line under each section's title ends with **Learn more**, which opens its part of Help.
- **The main switch or button sits beside the section's title**: Memory, the browser and computer use turn on and off
  there, and **Add server**, **New task** or **New skill** are there too. Rarer actions are in a row's **⋯** menu,
  and forms such as a new password, an API key or a token open in a dialog.
- **Memory**: your profile first, then your notes as an index of places (about you, each project, sessions, notes no
  agent needed lately, deleted notes), each opening as a page of its own with its own search. A note opens with
  everything about it in one place: its whole text, where it came from, how it is known, how often agents needed it,
  its end date and its history, to edit, delete or restore. The options are grouped as **Learning**, **What agents
  get** and **Your data**.
- **Models**: the tiers show one program at a time (Claude Code, Codex or Custom), a row for each tier.
- **General**: groups for the look, sessions, terminals, starting and updating, and help; the version and its
  updates are one row.
- **Long lists show their first few** (projects, agents, examples, models) with **Show all**.
- **On a phone**, a row's switch or button stays on its line.
- **The search box** (Ctrl+K) keeps pointing at a setting low on a page while the page fills in above it.

## 0.54.6 · 11 November 2026

Limit resets no longer go missing because the app asked for them too often.

- The app read your Claude limit resets with every usage refresh: every two minutes while a page was open, and more
  often while a session waited out a limit. Anthropic started refusing those reads, so the list in System → Usage
  went missing. It now reads them about every ten minutes, waits longer after a refusal, and keeps showing the list
  it last read in between, even after the app restarts.
- A reset you use leaves the list at once.

## 0.54.5 · 11 November 2026

Claude limit resets show in the Mac app again, and a session whose helpers are still running shows as working.

- **Limit resets** in System → Usage show for your Claude accounts in the Mac app. On a Mac, Claude Code keeps its
  sign-in in the Keychain, and the app looked for it only in a file that Claude Code no longer keeps up to date
  there, so the list went missing once that file's sign-in ran out.
- A list of limit resets that can't be read for a moment keeps the last one it had, for Claude and Codex, instead of
  disappearing. A Codex card whose limits can't be read keeps its last limits too, rather than saying "No usage
  limits reported for this plan".
- A session whose own turn is over while child sessions it started are still running shows as working: its dot
  keeps breathing, it shows no Done marker, it stays under Active, and its status says "Working · 2 helper
  sessions". You can still send it messages.

## 0.54.4 · 11 November 2026

Agent program updates no longer fail because a Mac went to sleep while a new version was being checked.

- Before it keeps a new version of Claude Code, Codex or another agent program, the app checks that it answers, and
  gives it a minute. That minute used to keep running while a Mac slept, so an update that ran at night could undo a
  version that works, with "it did not answer within a minute", and not try it again. Now only time the computer is
  awake counts.
- A new version that is slow to answer the first time is started again with two more minutes before it counts as
  not working.
- The installs behind these updates also count only time awake, so one that a sleep cuts in two carries on after
  it instead of being stopped half done.

## 0.54.3 · 11 November 2026

Forks from any Claude Code reply, even one from before the conversation was compacted.

- **Fork from this reply** works on a Claude Code reply from before the conversation was compacted. It used to stop
  with "Claude Code did not start: session ended". The fork now starts with the whole conversation up to that reply,
  as it was before it was compacted.
- **When an agent does not start**, the message ends with the reason the agent gave. Claude Code's note about a folder
  that is not trusted yet no longer hides it.
- **Added Claude Code accounts trust the folders your main sign-in trusts**, so a folder's own permission rules (its
  .claude/settings.json) apply in their sessions too.

## 0.54.2 · 11 November 2026

Other agents, described more briefly in the guide and Settings.

- **The guide** describes the agents you can add under Settings → Agents → More agents, and what Settings → Memory →
  Bring in takes from other agents, in general terms. Each agent's row and the Bring in dialog still say exactly what
  they find and how to get it.
- **Settings → More agents** and the search box describe the agents that speak ACP more briefly.

## 0.54.1 · 11 November 2026

Chat apps connect even when Telegram, Discord or Slack is slow to answer.

- **Connect keeps a good token.** Settings → Chat apps turned a token down whenever Telegram, Discord or Slack was slow
  to answer or briefly out of reach (as can happen in a new Telegram bot's first minutes), saying it "did not take that
  token". Now only a token the service itself refuses is turned down. Otherwise Hydor keeps it, the row says
  **Connecting…** and why, and the bot connects by itself as soon as the service answers.
- **Clearer when something is wrong.** A Telegram bot whose token was revoked, or that another copy of Hydor or another
  program is using, now says so in plain words, and a webhook another program left on a Telegram bot is taken off so
  its messages come here. The row also notices by itself when a problem clears.

## 0.54.0 · 10 November 2026

More agents run in Hydor, what other agents know comes over, and Discord and Slack join Telegram.

- **Three more agents** that speak ACP join the others in Settings → Agents → More agents. Pick one as a session's
  agent and follow it here, answer its approvals from your phone, and it gets your guidelines, memory and skills like
  the others. The app installs one of them by itself, with its ACP adapter; the others show their own install
  command. Not all of them get the app's tools yet.
- **Bring in from other agents**: Settings → Memory → Bring in reads more agents, beside Claude Code and Codex, and
  offers the skills you made in them. You see each one first; those you pick are copied into your own skills. A skill
  with a name you already have is left alone, and keys and sign-in files never come over.
- **The setup tour** asks "Coming from another agent?" when it finds another agent on this computer, and opens Bring in.
- **Chat apps**: Discord and Slack join Telegram in one section, Settings → App → **Chat apps**. Each is a bot or app of
  your own that only chats linked with a one-time code can use: a message starts a session or carries on the chat's
  own, the reply comes back when the turn ends, yes-or-no questions come with buttons, and /new, /sessions, /stop and
  /status steer it. None needs an address on the internet.
- **A helper is judged by its answer to the job it was given**: a later reply of its own, to a message, no longer
  sends the whole job round again a tier up.
- **Naget Search turned off hears nothing from the app**, not even the daily request for its categories.
- **What leaves your computer**: a new page lists every connection Hydor itself makes, host by host, with how to turn
  each one off. Hydor has no telemetry.
- **Hydor vs other agents**: comparison pages (hydor.app/compare) showing what Hydor gives you that other agents
  don't, with sources; a README that says what Hydor is in one sentence; a security policy and a code of conduct.
- **The desktop apps open on the app, not an empty window**: opened after starting without one (at login, or after
  updating themselves with the window closed), from the Dock, Finder, the menu bar or a notification, the window
  stayed empty until you quit the app and opened it again. A page that cannot load while the app's server starts
  again now shows the logo, then comes back by itself.

## 0.53.0 · 10 November 2026

Claude Code sessions can carry on with your API credit when every account is at its usage limit.

- **Use API credit at a limit**, in Settings → Agents → Accounts, is off until you turn it on. When a Claude Code
  session's account runs out of usage, the session first moves to another account with usage left, as before. When
  none has any, it carries on, billed to the Anthropic API key you saved for that account (or for another of your
  Claude accounts), without moving its history. Once a plan has usage again, the session goes back to it after the
  turn.
- Each Claude Code account's **⋯** menu has **Add API key…** (checked with Anthropic, kept encrypted on this computer)
  and **Remove API key**. A row with a key shows "API credit", and so does a session while it runs on it.
- Agents cannot add or read these keys.

## 0.52.0 · 10 November 2026

A strong model leads and cheaper ones do the clear parts, by default; and Hydor in a terminal.

- **Automatic** is the start page's model until you pick another: a session starts on the **Best** tier's model
  (Opus for Claude Code), or on **Max**'s (the newest Fable) when your request reads as a hard problem. The helper
  model sizes the request up while the agent starts, so nothing waits for it, and a line in the conversation says
  when Max was picked, and why. A model you picked before stays picked: choose Automatic in the Model menu.
- **The main agent leads helpers**: it works out what is asked, plans, hands the clear parts to helpers on cheaper
  tiers, checks what comes back and answers for the result. **Standard** (Sonnet) takes clear tasks of medium size,
  **Quick** (Haiku) small, very clear jobs; a helper asked for with no tier gets Standard, and none thinks with a tier
  above its lead's. Claude Code's own helpers inside a turn are told the same models.
- **Four tiers**: Quick, Standard, Best and the new **Max**, for the hardest problems. For Codex they start as Luna,
  Terra, Sol and Astra, or the nearest your plan offers. A tier you leave alone follows its program's newest model
  of that kind, so a new Fable or Opus is picked up by itself.
- **Stepping up**: a main agent on Automatic may move itself to Max when a problem proves harder than it looked (a
  line in the conversation says so). A helper whose turn was stopped by your plan's usage limit is no longer run
  again a tier up for it.
- **Two switches** under Settings → Models → Tiers: **Lead with helpers** and **Max for hard problems**, both on to
  start.
- **Finished means finished**: a lead that ends its turn while its helpers still work no longer notifies you that it
  is done; the turn after them does.
- **Hydor in a terminal**: the new `hydor` command talks to an agent in the terminal's own scrollback (its text as
  it comes, each step on a line, approvals and questions answered with a key, helpers, queued messages, commands
  such as `/model` and `/helpers`), runs one request for a script (`hydor run "…" --json`, with exit codes), and
  looks after sessions, models, tiers, agents, scheduled tasks and usage. It uses the same Hydor as the app, on this
  computer or another one, and starts it when nothing is running. Help → **Hydor in a terminal** has the rest.
- **Measured, not assumed**: on nine coding tasks with hidden checks, a led session passed every check in every
  run. It cost about a tenth less than Opus alone on the seven ordinary ones, two thirds less than Fable for
  everything, and more than Opus alone where Automatic took a problem to Max that Opus could have solved (that is
  what the second switch is for). `scripts/tier-bench` runs the same measurement on your own models and plan;
  `docs/plans/tiers-and-the-team.md` has the numbers.

## 0.51.2 · 10 November 2026

Usage fits a phone.

- **System → Usage on a phone**: the plan cards stay within the screen, so every limit's percentage and reset time
  shows; long limit-reset names wrap instead of being cut off.
- System's header on a phone is one line shorter: the subtitle that was cut off is gone.

## 0.51.1 · 10 November 2026

System fits a phone, and follow-ups wait safely after an update.

- **System on a phone**: the title says which part you are in (System / Monitor); tap it to see all eight parts,
  four to a row, instead of tabs that ran off the edge of the screen.
- **Overview** rows are easier to tap, and Preview's ports sit at the right instead of over the names.
- **Monitor** on a phone: the computer's details wrap neatly, each graphics card shows its numbers without a
  chart, and network and disk chart labels are no longer cut off.
- A follow-up sent to a Custom session that was already running before an app update now waits in the queue
  until the turn ends, instead of getting lost.

## 0.51.0 · 9 November 2026

Full access that means full access, reliable Custom follow-ups, and clearer account limits.

- **Custom's Full access runs without approval prompts or the command sandbox**, including administrator commands
  and changes outside the session folder. It uses your computer account's permissions; it does not grant rights
  your account lacks. Auto mode keeps its checks and optional sandbox, and confidential sessions keep their
  network restrictions.
- **Custom follow-ups and Send now work during running turns**: queued messages reach the agent without losing
  the conversation or interrupting the wrong turn.
- **Claude plan names stay current**, including added accounts and accounts with running sessions. Usage shows
  the provider's display name, such as Claude Ultra, instead of an internal plan name, and refreshes it automatically.
- **Limit resets explain what blocks them**: a reset held back by another usage limit says which limit and when
  it becomes usable; a reset that has not started yet says when it starts.

## 0.50.0 · 9 November 2026

What each session's programs use, and limits that keep one session from taking over the computer.

- **System → Monitor → Sessions** lists each running session with what its programs use (its agent and everything it
  runs: commands, servers it started), the most memory first; a click opens the session.
- **A session's Info** shows the same for that session, and the limits it runs under.
- **Settings → General → Limit each session** sets the most memory (2 to 16 GB) and processors (1 to 8) each session
  started from then on may use (on Linux). Over its memory, the program that asked for more is stopped, not the app or
  another session, and the session's Info says so.

## 0.49.0 · 9 November 2026

Search by meaning without PyTorch, and where each turn's time and money went.

- **Search by meaning sets up small and starts fast**: its model now runs in 8 bits through ONNX Runtime, about 500 MB
  to set up instead of 2 GB or more, ready in about a second and in about 1 GB of memory, and it finds the same notes.
  An older setup with PyTorch is replaced by itself, freeing its gigabytes; what was found by meaning before stays.
- **It runs on the processor**: Settings → Memory no longer asks where it runs, and the graphics card is left to other
  work.
- **A turn's time and cost**: the tokens beside a finished turn open where its time went (the model, commands, files,
  the web, waiting for you, the rest), how soon its first reply came, its tokens by kind with the cache's share, and
  what it cost and what the cache saved.
- **Bring in** is found by the search box in Chinese and Greek too.

## 0.48.0 · 9 November 2026

Memory that starts with what other assistants already know about you, picked by you.

- **Settings → Memory → Bring in…** reads what Claude Code, Codex and other agents keep on this computer, and the
  export ChatGPT or Claude emails you, and turns it into notes you pick from.
- **Only what lasts**: the helper model reads a part at a time against the notes memory has, and leaves out what it
  says already (also in other words), secrets, and text that would steer agents.
- **In the right place**: a note about a project goes to that project when its folder is on this computer, and new
  lines for your profile are offered too.
- **Your words only**: of an export's chats, only what you wrote is read, the newest first. Nothing is added until you
  pick, and the export is deleted once its notes are in.

## 0.47.0 · 9 November 2026

Your agents in a Telegram chat: start sessions, read their replies and answer what they ask, from any phone.

- **Settings → Telegram** connects a bot of your own, made with @BotFather in a minute. Only the chats you link with
  a one-time code can use it, and the app asks Telegram for messages itself, so it needs no address on the internet.
- **A message starts a session**, or goes on with the one the chat is in; the reply comes back when the agent is done,
  formatted, with "typing…" while it works.
- **What an agent asks** comes with buttons when Yes or No answers it, and with Notices from every session on, every
  session that finishes, fails or needs you says so in your chat.
- **Commands**: /new, /sessions to go on with another, /stop and /status.

## 0.46.0 · 9 November 2026

Smoother while agents work: a session's page keeps up with a reply as it comes, and a message never goes twice.

- **A reply coming in**: the turns already there are left alone while the newest is written, instead of being drawn
  again a dozen times a second; on a long session the page does less than half the work it did, and its long pauses
  are nearly gone.
- **Searching sessions by their words** no longer holds up the rest of the app while it ranks many messages.
- **Opening a long session** no longer sends all of it at once to a page that has it open.
- **A message goes once**: an answer lost on the way (a phone that slept, a network that changed) is asked for again
  by itself, and sending the same message again after an error no longer sends it twice.
- **For contributors**: CONTRIBUTING.md says where to start and how, AGENTS.md is the notes every coding agent reads,
  `npm test` runs the tests, and pull requests are checked on GitHub.

## 0.45.0 · 9 November 2026

Faster from the first moment: sessions start without waiting, the app loads in a fraction of the time, and long
replies no longer slow the page.

- **Sessions start at once**: a new session no longer waits for the model that finds notes by meaning (it waited up to
  8 seconds, often twice, and on a busy computer then used words anyway). The model starts as you begin writing a
  message, and shortly before a scheduled task runs.
- **Quicker, cheaper first replies**: every session of a project starts with the same instructions, so the model's
  provider reuses what it kept of them from one session to the next. What bears on your request alone (the notes for
  it, the skills that fit, what the project's folder holds now) comes with your first message.
- **The app loads faster**: the sign-in screen no longer waits for the whole app, and the app comes in fewer pieces,
  most of which a new version leaves in the browser's cache. On a phone's slow connection the sign-in screen shows in
  about a second (it took 7) and the start page in about 4 (it took 8).
- **Long replies stay smooth**: a reply still coming is drawn block by block, so it no longer slows the page as it
  grows, and code in it is highlighted once it is whole instead of flashing with every few words.
- **No more stalls**: opening Git, and memory's daily upkeep, no longer hold the whole app for seconds.
- **Restarts in a moment**: the app stops within two seconds even with a phone's connection or an agent's request
  still open, starts a second or two sooner, and stays up when a program an agent started runs out of memory.
- **Custom**: Claude models through OpenRouter keep the conversation in their cache, and Custom's tools change at most
  once in a session, so each step costs less.

## 0.44.1 · 8 November 2026

Memory upkeep no longer waits for the night: it runs about once a day, whenever the app is on.

- **Tidy up automatically** (was Tidy up each night): the tidy-up, and learning from conversations with it, now runs
  once 20 hours have passed since the last one, there is something new (a message you wrote, or a note you or an agent
  changed) and you have paused for ten minutes, at any hour. A computer that sleeps at night, or the desktop app
  closed overnight, gets it too; with nothing new it doesn't run at all.
- **Only your own words**: learning from conversations, and finding past sessions by meaning, leave out the files you
  attached and the text you pasted into your messages.

## 0.44.0 · 8 November 2026

Memory that checks itself: each night it learns from the day's conversations, and agents start with only what
bears on your request, plus an index of the rest.

- **Learn from conversations**: with the nightly tidy-up, the helper model now reads the conversations since the last
  one (never those with memory off, child sessions or scheduled runs). It corrects notes a conversation shows wrong or
  out of date, confirms notes no one had checked, and keeps at most three things a night that no agent saved. Each
  change shows in Settings → Memory with the conversation it came from (Open the conversation), and can be undone.
  It has a switch of its own.
- **What agents start with**: only the notes that really bear on your request, judged against how alike that request
  is to all your notes, so a long brief no longer pulls in half of them, and nothing fills the room with the latest.
  A place with only a few notes is given whole; for the rest, agents get an index of titles, to know what to look up.
  On one real project's notes, about nine in ten of the notes given now bear on the request, against one in five before.
- **Titles**: the tidy-up gives each note and topic a short title for that index; new notes get theirs within the hour.
- **How each note is known**: agents say whether you told them, they checked it, or it is their own conclusion, not
  checked yet. Later agents are told which are unchecked, and those are checked first at night. Settings shows it
  under each note and in its history; notes you write yourself count as said by you.
- **What comes first**: notes rank by what agents looked up themselves; being handed a note at the start no longer
  makes it come first again and again.
- **Custom keeps its memory steady**: Custom gets its memory once, as the other agents do, and reads it again only when
  it condenses a long conversation, so its model's server can reuse what it kept (quicker, and it costs less). A
  session that goes on within the hour gets the same memory again too.
- **One memory for every agent**: Claude Code's own memory and Codex's stay off in the sessions Hydor runs, so nothing
  is kept where Settings can't show it.
- **Earlier conversations by meaning**: when agents look through past sessions, they find them by what you asked, in
  other words too, not only by the exact words; each message you wrote gets its vector in the background.
- **Better guidance**: agents are told what memory is for (what a later session couldn't find out by itself) and not to
  save what the project's files already say; Custom's models are reminded to read memory before answering about you or
  the project.

## 0.43.0 · 7 November 2026

Comments in the Library's editors can be resolved with AI in one click: an agent makes the change each comment asks
for, replies saying what it changed, and resolves it.

- **Resolve with AI on a comment**: the sparkle beside Resolve sends that comment to an agent at once, with nothing to
  type. Documents, LaTeX documents (and .tex files opened from Files), slides, spreadsheets and pages all have it.
- **All of them at once**: Resolve 3 comments with AI, at the top of the comments, sends every open one (in a LaTeX
  document every file's, in a spreadsheet the sheet's). It takes the place of Ask the agent to answer the comments,
  which only opened an empty box.
- **Ask AI as you write a comment**: beside Comment (or Ctrl+Shift+Enter), it keeps the comment and sends it straight
  away.
- **Watch it work**: each comment the agent is on says "AI is working on this" and the top of the comments counts them,
  while its changes show in the editor as it writes them. Its reply shows as Agent; a comment that only asks a question
  gets an answer and stays open for you, and so does one it cannot do, with why.
- **One conversation**: the requests go through the Ask panel and go on with the conversation open there (after its
  turn while the agent is at work), so you can send comments one at a time as you write them; where the panel would
  cover the page it folds away. Beside a conversation they go into it, and for a .tex file from Files into Files' Ask
  panel.
- **Check before it goes in**: in a document that is suggesting changes, the agent's changes come as suggestions to
  accept or reject; in a LaTeX document with Track changes on, as tracked changes.
- **Comment over the words in LaTeX**: picking words in the source shows Comment above them, as documents do.

## 0.42.0 · 7 November 2026

New in the Library is redrawn: each starting point shows as it will look, and describing what you want for an agent
comes first.

- **What to make, down the side**: Page, Design, Slides, Document, Spreadsheet, LaTeX, Notebook and Diagram are a
  list on the left, each with its own icon and colour (chips across the top on a phone), and a line at the top says
  what each one is. The window keeps its size as you switch, and the project it goes in and **Upload files** sit at
  the foot of the list.
- **Every starting point drawn**: the page templates (notes, a checklist, meeting notes, a project plan, a wiki, a
  journal, a reading list…), LaTeX's templates (an article, a thesis, a letter, beamer slides, a CV, a poster…), the
  slide themes with their colours, and a blank document, spreadsheet, notebook or diagram each show as a small picture
  of what you get. Opening a file of yours is the last card, and a double click makes one at once.
- **Describe it first**: the box at the top takes what you want in your own words, with the kinds agents are asked
  for most under it (a pitch deck, a cover letter, a budget, a flowchart…) and **More kinds** for all of them. **Make
  it with AI** starts the session that makes it right away, with the name, folder and project you picked, instead of
  sending you to the start page; **Make it yourself** makes what is picked below instead.
- **A design's size** is picked from a button that shows it, so its designs get the room.
- **Diagrams described in words** now reach the agent with everything New knows about them (their name, folder and
  language), as the other kinds do.

## 0.41.1 · 7 November 2026

The part the agent is working on keeps the outline's even spacing.

- **The outline's last part**: the part under way, or waiting for you, sits as far below the part before it as every
  other part does, with its note lined up on its mark; it sat a few pixels too close.

## 0.41.0 · 7 November 2026

The agent's work reads as a short outline while it works, and a page being written shows that it is on its way.

- **The work as an outline**: each note the agent writes between its steps starts a part, one line in a few words
  with a check, how many steps it took and the lines it changed; click it for the whole note and every step. The part
  under way shows the agent's note and the step being taken now, so a long turn takes a few lines instead of the whole
  screen. A long turn shows its latest parts; **Show 12 earlier parts** shows the rest.
- **Notes stay small**: while the agent works, a short note it writes after its last step shows in the outline in
  quieter type, not as a reply; it becomes the reply only if the turn ends there.
- **A page on its way**: while an agent writes a page and nothing of it can be drawn yet (its styles often come
  first), the panel beside the conversation, the page's card and figures in replies show the app's mark and "Writing
  the page…" instead of an empty frame.

## 0.40.2 · 7 November 2026

An app's answer in a conversation reads from its top, and apps' answers look as they should: trailers, game covers,
cards, and no notes on their sources.

- **An app's answer shows from its top**: when an agent runs an app for you and its answer is taller than the screen,
  the conversation shows it from its top, with the agent's words about it above it, rather than from its end; **Latest**
  goes on down. A conversation that ended with one opens the same way.
- **Answers without notes on their sources**: apps' answers no longer say things like "from general knowledge; not in
  the snippets" or which source gave another date: each part says just what it is, and what cannot be known is left
  empty.
- **Trailers and covers**: a YouTube trailer's picture fills its frame (it repeated in tiles before), in its large size
  where YouTube has one. Game finder shows a game's cover whole and sharp on its page, keeps the covers' titles in view
  on its cards, and gives its summary as a paragraph rather than a headline.
- **Smaller fixes**: cards in apps' grids keep to their column; Weather outlook writes its days as Sat, Sun (not "Sa…");
  Citation alerts says in plain words why a service did not answer, and shows its filters only when there is something
  to filter.

## 0.40.1 · 7 November 2026

Maps draw again in apps and answers, and Explore a place starts from the sights a place is known for.

- **Maps work again**: OpenStreetMap's map servers had begun refusing the maps in apps' views and in answers, which
  showed "Access blocked" squares. Maps now draw OpenFreeMap's map of OpenStreetMap's data (free, with no key), light
  or dark with the app; a browser that cannot draw it still shows the places, on a plain ground, and says why. Map
  pages agents make for you use it too.
- **Explore a place finds what a place is known for**: it ranks what is around by how well known each is (how many
  Wikipedias write about it, from Wikidata), so a walk through Thessaloniki starts from the White Tower, the Rotunda
  and Agios Dimitrios rather than side streets. It leaves out what is no place to visit (the city itself, suburbs,
  events, institutions, a painting kept in a museum), finds landmarks by name ("Colosseum" is Rome's), has pictures
  for nearly every place, and its summary reads like a guide's.

## 0.40.0 · 7 November 2026

More answer UIs: 38 new ones, 142 in all, for deciding, planning, work, studying, data, media and code, and several
in one answer when it has several parts.

- **Several UIs in every answer**: in each turn of a conversation, the first and every later one, an answer with several
  parts (a trip's plan, its weather and what to pack) can show each in a UI of its own, and the agent looks for all of
  them in one search; UIs it used before it uses again without looking them up, and a later answer can bring one up to
  date. Many of the same UI on one page each keep to themselves.
- **Decide**: a troubleshooter or wizard that asks one question at a time and ends with an answer, a wheel, dice, a coin
  or a draw that picks for you, and Venn diagrams of what overlaps.
- **Plan**: a week's timetable, a Gantt chart with dependencies and a today line, timers that run alone or one after
  another, where a parcel or an order stands, a departures board that counts down, and a hike's elevation profile.
- **Work and business**, a new group: invoices, quotes and receipts with their totals worked out and a page to print,
  review findings by severity with fixes to ask for, action items by owner, QR codes for a link, a Wi-Fi network or a
  contact, and job openings to filter.
- **Study**: fill in the blanks, match pairs, put things in order, verb conjugations to listen to, dialogues read
  aloud with their translations, grading rubrics, chess positions to step through, and a reference written in APA,
  MLA, Chicago, IEEE, Harvard and BibTeX.
- **Numbers and money**: histograms and box plots, waterfalls, treemaps to click into, a year of activity with its
  streaks, numbers on a map as sized circles, an investment portfolio, and a function plotter with sliders.
- **Media, people and code**: pictures with numbered notes, a before-and-after slider, guitar, ukulele and piano chords,
  font pairings shown live, homes to buy or rent, contact cards with a vCard, knockout brackets, a log viewer and cron
  schedules with their next runs.

## 0.39.0 · 7 November 2026

Answers you can use: agents show an answer as a card, a table, a chart, a map or a small tool when that makes it clearer,
picked from more than a hundred answer UIs and filled in as the reply comes.

- **Answer UIs in replies**: options to compare become a table with the best value in each row marked, a recipe a card
  whose servings scale the amounts and whose steps have timers, a forecast the coming hours and days, places a map with
  numbered pins, a trip a day-by-day plan, numbers a chart you can switch to its figures, a quiz questions you answer in
  place. There are UIs for summaries, comparisons, shopping, travel, food, plans, numbers, money, learning, the night
  sky, media and events, people and sports, writing and code.
- **They build up as the reply streams**, in the app's look, light or dark, with pictures, videos, maps and charts of
  their own. Ticks, answers and choices stay when you come back on the same device; some put words in your message box
  for you to send (the option you picked, your quiz score).
- **Only where they help**: conversation, short answers, explanations and code changes stay text. Agents find the UIs
  that fit what their answer shows by words and, with search by meaning on, by meaning too, so none is handed the whole
  collection.
- **On each one**: **Show the data** shows what the agent wrote, and **Copy as text** copies it.
- **A gallery of them all**: Answer UIs (`/answers`, or search for it with Ctrl+K) shows every one with an example, by
  group, and plays one as it streams. Ask for one in plain words: "compare them in a table", "put them on a map".
- **Charts in the house style**: one palette of eight colours checked for colour blindness, in both themes.
- **Pictures from the web load more reliably**: the app asks a site for a few pictures at a time and tries again after a
  moment when the site is busy, so a gallery from Wikimedia no longer leaves some pictures blank for ten minutes.

## 0.38.0 · 7 November 2026

Agents that check their helpers' work and step up when a cheap try falls short, hand back results in the shape you
set to the places you choose, and can keep one conversation of their own with an inbox.

- **Stepping up**: a helper an agent starts on Quick or Standard whose reply does not pass a quick check (the helper
  model reads its brief and its reply), or that stops with an error, runs again a tier up, never above the highest the
  agent allows. The lead is told it happened and why, the new helper is told why the first try fell short, and the
  helper's card says "Stepped up from" its first tier. A scheduled run of an agent that fails goes again a tier up too,
  up to Best. **Step up when a check fails** is on for every agent until you turn it off; a lead can also step a helper
  up itself when it finds the result not good enough.
- **What an agent hands back**: give an agent the fields of each result (text, long text, numbers, yes or no, dates,
  links, lists and tables) and it hands back each result checked against them, then sends it where you chose besides
  the conversation: a file in the folder it works in (Markdown, or JSON for a name ending in .json, with the date, time
  and agent's name filled in), a page in the Library, a notification, or a webhook (https only, signed with a key from
  the vault and sent only to the hosts that key allows). Its page lists what it handed back lately and where each went.
- **An agent with a conversation of its own**: turn on **Keeps one conversation, with an inbox** and the agent keeps
  one conversation that remembers what came before. Messages from you (from its page) and from other agents that hand
  it work wait in its Inbox and go in one at a time; each answer goes back to whoever sent it, as a message to another
  agent or a notification to you. Its scheduled runs post into the same conversation, and its monthly budget is
  checked as each message or run goes in.
- **Project agents in your language**: an agent made for a new project from a template now has its name, description
  and role in the app's language (English, Chinese or Greek).
- An agent's instructions now begin "# Agent:" and say the user picked this agent, matching what the app calls them.

## 0.37.0 · 7 November 2026

Agents of your own: say what one should do and it is drafted for you, then it works everywhere or in some projects,
on its own schedules, thinks with a model tier, hands parts of its work to other agents, and keeps to a monthly budget.

- **Agents take over from assistants**: the Agents page (in the sidebar) shows each of your agents as a card with how
  it is doing, the projects it works in, its tier, when it runs next and what it spent this month; the built-in ones
  (General, Researcher, Writer, Coder and the rest) are under it. Your assistants are your agents now, with everything
  they had.
- **New agent**: say in a few sentences what it should do, and when it should work by itself, and the helper model
  drafts it: its name, instructions, what it may use, its tier and a schedule. Read it as sentences and click any
  underlined words to change them; All settings has every setting.
- **Where an agent works**: everywhere, or only in some projects, where it is offered and works in the project's
  folder. A project's new Agents tab shows its agents as a team: what starts each one and whom it hands work to.
- **An agent for each project**: a new project can get an agent made for it, and a project without one can get one
  from its Agents tab: drafted to fit it when it says enough about itself, else the template for its kind (software,
  a website, machine learning, data, a LaTeX paper, research reading, writing, design and media, slides), else a
  default one.
- **Schedules on an agent's page**: the scheduled tasks that run as an agent are its schedules, listed and added on
  its page.
- **Tiers**: Quick, Standard and Best pick a model by the job; Settings → Models → Tiers sets what each means for
  Claude Code, Codex and Custom. An agent can think with one, and gives the helpers it starts one for their part,
  never above the highest it allows.
- **Agents that hand work to other agents**: an agent can hand a part of its work to one of your agents by name,
  which works with its own instructions, tools and tier; yours ask only those their Team lists, and an agent can take
  work from none. Each helper's card in the conversation shows the agent and its tier.
- **A monthly budget**: once an agent's sessions have spent it, no new one starts as it until the next month, and each
  session is capped at what is left.
- **Usage is a tab of System**, so the sidebar keeps two rows of tools with Agents among them; the plans' usage shows
  on the System button.
- **The start page**: the program picker is called Runs on, beside the Agent picker, which lists the agents of the
  project picked as well as those that work everywhere.
- **New → Diagram starts blank**: draw it yourself, or describe it for an agent to draw.

## 0.36.0 · 7 November 2026

Diagrams in the Library, drawn and edited as in draw.io: flowcharts, org charts, mind maps, swimlanes, architecture,
network, UML and ER diagrams, made by you or by an agent, and opened from or saved as draw.io files.

- **A diagram editor as in draw.io**: shapes on the left (searchable, with groups for flowcharts, containers, UML,
  ER, BPMN, network and cloud icons and sticky notes), the page in the middle, a format panel on the right, and the
  pages as tabs at the bottom. Point at a shape and its blue arrows add a shape joined to it in a click, or draw a
  connector to another in a drag; connectors follow the shapes they join and run round the shapes in their way.
- **Everything you would reach for**: guides and a grid to line things up, handles to size and turn, words typed in
  place, sixteen ready-made looks, fills, gradients, dashes, shadows, a hand-drawn look, arrowheads including crow's
  feet, align and space out, group, lock, order, find and replace, copy and paste between diagrams, and undo.
- **Laid out for you**: Layout places every shape again from what joins what, as a flowchart down or across, a tree,
  a mind map, rings, a circle or a grid; swimlanes stay lanes and containers grow round what they hold.
- **Drawn by you, or by an agent**: New → Diagram opens a blank page to draw on, or describe the diagram you want (or
  pick one of nineteen kinds) and watch it grow as an agent draws it. **Turn it into** makes a diagram of a document,
  slides, a page, a spreadsheet or a notebook.
- **draw.io and Mermaid in and out**: open a .drawio file (or a draw.io SVG or PNG) or Mermaid text as a diagram,
  insert them into one, or paste them in; export a diagram as PNG, SVG, PDF, a draw.io file or a web page to pan and
  zoom, and download or copy any page as a picture, light or dark, see-through or not.
- **Agents draw them too**: they say what is in a diagram and what joins what (or write Mermaid), and the app sizes and
  lays it out; they change one shape at a time, lay a diagram out again, restyle it and export it.
- **In Chinese and Greek**: the diagram editor and its part of the guide. And Find's count in the other editors
  ("1 of 3") no longer has the editor's name stuck to it in those languages ("doc::1 / 3"); New's kinds fit their
  tiles again.

## 0.35.0 · 7 November 2026

Share one thing at a link of its own: a document, slides, a spreadsheet, a page, a design, a picture, a video or a
sound, for people to comment on or to edit; and comments and earlier versions for pictures, videos and sounds.

- **Share with people, one thing at a time**: from a page's **Share**, the **Share** of a picture, a video or a sound, or
  a card's **More** in the Library, invite someone by name with **View and comment** or **Edit**, for a week, a month or
  until you stop it. Each person gets a link of their own (shown once, or as a QR code) that opens that thing alone,
  without your password and nothing else of yours; change what they may do, make them a new link or stop sharing any
  time. Cards show what is shared, and with how many people.
- **Comments where they look**: through their link people comment under their name on a document's or a page's words,
  on a slide, on a spreadsheet's cell, on a spot of a picture (a numbered pin) or at a moment of a video or a sound (a
  mark on its timeline). You get a notice and an inbox line until you or an agent answer, and agents take them as
  requests about that thing alone.
- **Edit through a link**: documents, spreadsheets, slides, LaTeX, pages and designs open in their own editors; pictures,
  videos and sounds in the picture, video and sound editors, without AI tools or anything of yours to add, a video made
  on the processor. A page's code (its scripts) never changes through a link, and nothing new is fetched from the web.
- **Comments on your pictures, videos and sounds**: pins on a picture and marks along a video's or a sound's time, on
  its page in the Library, where agents read and answer them too.
- **Earlier versions of pictures, videos and sounds**: whenever one is saved over (in its editor, by an agent, or
  through a link) it keeps the one before, the last five, under **More → Earlier versions**, to look at, download or
  bring back.
- **Shared projects do more**: people with a project's link now comment on its slides, spreadsheets and pages too, and
  with **Edit documents** change its pages and designs as well.

## 0.34.0 · 6 November 2026

Editors as complete as the apps people know them from: a picture editor rebuilt as Photoshop's, a video editor rebuilt
as DaVinci Resolve's that makes videos on the graphics card, a new sound editor, posters and social posts designed as in
Canva, and documents, spreadsheets, LaTeX and pages with AI that writes, checks and explains with you.

- **The picture editor, rebuilt as Photoshop's**: menus with their keys, a rail of tools, the tool's options, panels you
  fold and size, and a status bar. Work in layers (pictures, words, shapes and adjustment layers, with sixteen blend
  modes and their opacity), select (rectangle, ellipse, lasso, magic wand, or the subject found by AI) and paint and
  retouch (brush, eraser, clone stamp, healing brush, gradient, paint bucket, dodge and burn). New adjustments: curves,
  levels, colours by range, colour balance, clarity, dehaze, noise reduction, grain and Auto enhance, with a live
  histogram; image and canvas size; and **Make it larger** (2× or 4×), free on your own computer.
- **The video editor, rebuilt as DaVinci Resolve's**: four workspaces (**Edit**, **Colour**, **Audio** and **Export**), a
  media panel, a viewer and a timeline of tracks. Join videos and pictures with fourteen transitions, lay a logo, a
  picture or a video over them (green screen too), give pictures a slow zoom, and play clips backwards, steady them or
  hold a frame. Colour wheels, curves, twelve looks and scopes (waveform, vectorscope, histogram), the preview exactly as
  the saved video; captions made from what is said, saved as an .srt too. Sound right in the timeline: each sound's
  channels (a microphone on one side heard on both), fades, a volume line, silenced parts, cleaner voices, even loudness
  and the music lowered under speech. Videos are made on the graphics card when there is one that works (NVIDIA, Intel,
  AMD or Apple), the processor taking over at once if it fails: **Settings → Images, video and audio → Use the graphics
  card for videos**.
- **A sound editor**: open a sound (or a video's sound) from the Library, Files, a conversation, or the video editor's
  **Edit the sound…**. Tracks with waveforms or a spectrogram; cut, copy, paste and silence; sixteen effects in a rack
  (noise reduction, equalizer, compressor, loudness for podcasts or streaming, reverb and more); record from the
  microphone; cut by the words said and take out the "um"s; and music, voices and sound effects made with AI. It saves
  MP3, M4A, Opus, WAV or FLAC, and agents edit sounds the same way.
- **Designs, as in Canva**: **New → Design** for a poster, a flyer, an Instagram post or story, a YouTube thumbnail, an
  invitation, a business card, a certificate and more (twenty sizes, or your own), from twenty-two templates, or
  described for an agent to make. Drag anything anywhere with guides that snap; words with effects and curved text,
  shapes, frames, stickers, QR codes and collages; your brand's colours, fonts and logos; **Resize** to another size and
  **Download** as PNG, JPG or PDF. Pictures and videos in any page now open in the picture and video editors.
- **Documents with AI**: **Write with AI** (Ctrl+J, or Space on an empty line), **Proofread** as suggestions to accept or
  reject, **Suggest as I type**, **Ask about this document** (answers that link to their passages), and the whole
  document's tone changed or translated. Footnotes, citations in APA, MLA, Chicago or IEEE with a bibliography that
  keeps up, numbered captions and cross-references, landscape pages, a page colour, a watermark, columns, styles you
  change, voice typing and **Read aloud**; save as OpenDocument, EPUB or text, and open a PDF as a document.
- **Spreadsheets with AI**: the **=AI()** function, **Write a formula** and **Explain this formula**, **Fill with AI**
  (Ctrl+E), **Analyze the data**, **Clean up the data** and tables made with AI. About seventy newer functions (LET,
  LAMBDA, TEXTSPLIT, VSTACK, the REGEX ones, SPARKLINE, IMAGE and more), named and protected ranges, groups of rows and
  columns, combo, histogram, bubble and radar charts with trendlines, goal seek, tracing a formula's cells, a pivot
  table editor and print setup.
- **LaTeX with AI**: rewrite with your \cite, \ref and \label keys kept, **Write with AI** (Ctrl+K), LaTeX from a picture
  of an equation or a table, errors explained and fixed, papers found that back a claim, and proofreading as tracked
  changes. Vim and Emacs keys, **Tidy the source** and the bibliography, find in the typeset pages, named versions and
  draft typesetting.
- **Pages as in Notion, with Notion AI**: **Ask AI** on any block or words; databases as a gallery, a list, a calendar or
  a timeline, with formula, file and AI columns, totals under each column, rows that open as pages, and CSV in and out;
  new blocks (embeds, bookmarks, files, sounds, PDFs, Mermaid diagrams, charts, tabs); page templates; imports from
  Markdown, Word and Notion; locking a page; and the pages that link to it.

## 0.33.1 · 6 November 2026

Forms agents ask never expire, and a long form opens at its top.

- **A form waits as long as you need**: a form an agent shows you (its questions in one card) used to go away when you
  had not answered it within about nine minutes. Now it stays in the conversation: the agent ends its turn there, and
  the form stays even when the agent stops or the app restarts. When you fill it in, your answers go to the agent as
  your next message, and it carries on; if they can't reach it, the form stays for you to send again. **Not now** puts
  it away.
- **A long form opens at its top**: a form taller than the screen shows its title, what it asks and its first fields,
  with **Latest** to go to its end, rather than its buttons alone.

## 0.33.0 · 6 November 2026

The models that run on your own computer use its graphics card by default, a Mac's too: search by meaning, the
picture tools, dictation, Speech to text and Text from pictures. Each says where it runs, and goes back to the
processor, saying why, when the card fails.

- **Search by meaning on a Mac's GPU**: on a Mac with Apple silicon, search by meaning (memory, the Library, knowledge
  bases) runs on the Mac's own GPU instead of its processor, so a big knowledge base gets ready far sooner; on an NVIDIA
  card as before. Its vectors are the same as the processor's, so nothing is made again. Settings → Memory says where it
  runs (the chip's name), and when the GPU fails its first try, it runs on the processor and says why.
- **Picture tools on the graphics card**: taking backgrounds out and erasing things run on an NVIDIA card (CUDA) or a
  Mac's GPU (Core ML), and on the processor when the card fails, one model at a time. With an NVIDIA card their setup
  is bigger (about 2.1 GB rather than 145 MB) and runs once more after this update. Settings → Images, video and audio
  says where they run. Erasing also starts faster on the processor.
- **Dictation on the GPU**: on a Mac, speech recognition on this computer runs on the Mac's GPU (Metal), now asked for
  in so many words. On Linux with an NVIDIA card and NVIDIA's CUDA toolkit, a build for the card is made in the
  background while dictation already works on the processor; without the toolkit, Settings → Voice says what it needs.
  When the GPU fails, the recording is done again on the processor. Settings → Voice says where it runs.
- **Speech to text and Text from pictures** (plugins) run on an NVIDIA card by default, their setup adding NVIDIA's
  libraries there; Text from pictures uses a Mac's GPU too. Speech to text stays on a Mac's processor: its Whisper has
  no Apple GPU support. Each says in its answer where it ran.
- **Plugins can ask for what an NVIDIA GPU needs**: `requires.pipNvidia` in a plugin's plugin.json adds Python packages
  only on a computer with an NVIDIA GPU (CUDA's libraries, a GPU build), and a failure there never fails its setup.
  The plugin editor keeps them, and a plugin's Python version, when it saves.
- **Starting a session on a shaky connection**: when a phone sleeps or its network changes while a session starts, the
  page no longer says the session did not start when the server made it: it asks what came of the start and opens the
  session, saying Reconnecting… meanwhile. One press of Start never makes two sessions.

## 0.32.1 · 6 November 2026

Knowledge bases get ready to search by meaning on a Mac, say what they wait for when they wait, and read big text
files instead of refusing them; Claude Code starts where its temporary folder is closed to it.

- **Search by meaning gets going on a Mac**: a knowledge base could stay at "0% ready to search by meaning" for good,
  because the app counted a Mac's free memory without what macOS gives back at once, and so never found enough to
  start the model. It now counts it as Activity Monitor does, for search by meaning, the picture tools and Settings →
  Models alike.
- **You see it get there**: the percentage goes up as the passages get ready (1% as soon as any are), without
  reloading the page. When the model can't run yet, it tries again every two minutes rather than an hour later, and a
  line above the knowledge bases says why it waits: it is setting itself up, starting, waiting for memory (how much is
  free and how much it needs), or it stopped, with **Try again**.
- **Big text files are read**: of a text file over 4 MB, such as a big log or data file, the first 4 MB are read, and
  its last passage says where it was cut, rather than "too big to read here". **Read again now**, and the first
  reading after the app starts, try again the documents that couldn't be read, so one an older version refused is
  read now.
- A knowledge base's line says "read 25m ago" rather than "read 25m".
- **Claude Code starts where its temporary folder is closed to it**: where it can't make its folder in /tmp (one
  another user made, say), new sessions said "Claude Code did not start" and the model menu was an empty box. Claude
  Code now keeps its temporary files in Hydor's data folder there; when it still doesn't start, the model menu says
  why, with **Try again**, and the usage report gives the same reason rather than "signed out?".
- The picture tools' setup card gives their real sizes: about 145 MB, and about 200 MB a model.

## 0.32.0 · 6 November 2026

Slides, documents and pages you make with AI: pictures, drawings, plots and videos made and changed right in the
editors (and by agents as they make things), backgrounds taken out and things erased on your own computer, picture
and video editors that open in a tab of their own, slides that are web pages by default (quizzes, custom code, 3D,
narration and much more), over two hundred kinds of slide, document and page an agent makes from a word or two, and a
friendlier Apps page with your apps pinned to the top.

- **Pictures made with AI, in every editor**: **Insert → Picture → Make with AI** in slides, documents and pages (and a
  slide's background, a page's cover): what it is for, a look, its shape, how many, a see-through background, and the
  price on the button before anything is spent. Two models do the work: **Quick** (cheaper, for icons, backgrounds and
  textures) and **Best** (for scenes, photos, words in a picture and every change); Auto picks one. **Change with AI**
  changes a picture as you say, everywhere or only where you paint.
- **Backgrounds out and things erased, free and private**: **Remove the background** and **Erase part of it** run on your
  own computer once you set up the **picture tools** (Settings → Images, video and audio): each model loads only when it
  is used and is put away when idle. When the result is not right, **Do it with AI instead** redoes it with an image model;
  without the picture tools they go through OpenRouter.
- **Drawings, plots and videos**: **Drawing (SVG)** draws icons, logos, diagrams and patterns that stay sharp at any size;
  **Plot** has an agent write the plot's code from your words and data and run it on your computer (in a web deck, a plot
  you can point at); **Video → Make with AI** makes a short clip. **Free photos** finds openly licensed photos, their
  credit added for you.
- **Picture and video editors, in a tab of their own**: **Edit** on any picture or video (a slide's, a document's, a
  page's, the Library's, a file's, one in a conversation) opens its editor in a tab beside the page you were on, which
  stays as it was. Pictures: crop to a shape, straighten, a dozen adjustments, filters, markup, blurring faces or numbers,
  and the AI tools. Videos: trim, cut parts out, speed, crop to 16:9, 9:16 or square, titles and captions, fades, music,
  a frame as a picture, a GIF. Save puts it back where it came from, or keep a copy.
- **Slides for the web**: a new deck is a web page by default, still exported to PowerPoint (its web parts as pictures);
  **Theme → Made for** makes one PowerPoint compatible. The web format adds **quizzes** with a score, **custom code**,
  **web pages** and **3D** on a slide, effects such as typewriter text, lines that draw themselves and numbers that count
  up, effects that start when a part is clicked, cube, flip and glitch transitions, moving backgrounds, shining text,
  frosted glass and parts that answer the pointer. A deck saves as **one small web page** that opens in any browser.
- **More for slides**: **Design ideas** (three new layouts of a slide's own content), **Rewrite** picked words (shorter,
  friendlier, translated…, in documents too), **Animate every slide** in one click, **Check accessibility** with fixes,
  **Translate the slides**; pictures in **shapes and frames**, **QR codes**, **slides from another deck**, **charts from a
  spreadsheet** that update, **My themes** with your logo, trimmed videos and an eyedropper; **narration** recorded or made
  with AI, a narrated show that plays itself, **Rehearse with coach**, **Record a video** of your slideshow with your
  camera, a **camera bubble** while you present, and your **phone as a remote**.
- **Made with AI from a kind**: pick one of over two hundred kinds (a SWOT slide, a pitch deck, a cover letter, a lesson
  plan, a habit tracker, a pricing table, a budget…), say what it is about if you like, and an agent makes it from what is
  already there: **Insert → Slide made with AI**, **Section made with AI**, **Add a block made with AI**, or **New page →
  Choose a kind**. **Turn it into** makes slides from a document, a document from slides, and so on.
- **Agents do all of it too**: they illustrate what they make by themselves (pictures, free photos, drawings, plots,
  videos), edit pictures and videos, work on a deck's or document's own pictures, and do what the editors do in a click
  (animate every slide, fix accessibility, make PowerPoint compatible, sort a spreadsheet, accept suggestions…).
  **Ask the agent** beside a page knows exactly what you picked. When a model needs an OpenRouter key that is not set,
  the agent asks for it on a card (the key goes straight to Settings), and skipping it means that model does not run.
- **The Apps page**: pin your apps to its top (the same on every device), see the apps you used lately with **Run again**,
  find any app as you type, and start with four ready-made ones if you are new.
- **The Library**: everything in it says what it is in a short description, and its search finds things by their title
  and description, by words and by meaning.
- Fixed: a picture put in while the caret was in a document's table cell was dropped without a word; a picture's flip
  buttons in the slides editor showed each other's pictures.

## 0.31.0 · 5 November 2026

For researchers and engineers: Experiments, where your training runs wait for a free GPU and are kept as records, with
an agent on call; papers to keep up with, read, check and present; your lab's labelling, sprints, sweeps, weekly
report and notebook; engineering tasks that look after CI, issues, dependencies and incidents; confidential sessions
on models of your own computer; projects shared with your advisor or students; PDFs you highlight and ask about;
LaTeX projects as a tree of their files; and folders in the Library.

- **Experiments** (System → Experiments): a run waits until a GPU has enough free memory on any of your machines, or a
  SLURM cluster's queue over SSH takes it, runs in tmux and is kept as a record: its commit and changes, settings,
  seed, environment, log and metrics, drawn as charts. An **agent on call** wakes on NaN, out of memory, a stall, a
  crash or divergence, and tells you or acts within your rules. Compare runs, sweep settings with losing runs stopped
  early, and make **results tables** (mean ± std over seeds, the best in bold, paired or Welch tests with Holm's
  correction as daggers) as LaTeX, Markdown or CSV, or straight into a LaTeX document. Agents start and read runs too.
- **Keep up with your field** (Apps → Research): **Paper radar** ranks each morning's new papers against your projects
  and says why each matters to you; **Citation alerts** shows who cited your papers, with the citing sentence;
  **New-model watch** runs new Hugging Face models on your own evaluation and tells you only of those that beat your
  best; **Deadline radar** puts your venues' deadlines in your time zone, with reminders; **Living related work** grows a
  page per topic; **Gap finder** proposes projects, each checked for prior work.
- **Papers**: a **Reading list** kept in step with Zotero, a **Literature matrix** made in one click into a spreadsheet,
  **Reproduce a paper** (its code run, its numbers compared), a **Reviewer simulator** on a venue's own form, a **Rebuttal
  workbench**, **Paper to talk, poster and thread**, and a **Figure doctor** for print-ready plots.
- **Check before submitting** (LaTeX editor → Tools): every citation checked online (does it exist, are the authors,
  year and venue right, is the preprint published since), anonymity, pages and fonts, the venue's required parts,
  and the numbers in your tables against their runs; findings go on their lines as comments, with safe fixes in one
  click. **Export → arXiv package (.zip)** strips comments, keeps what the paper uses, adds the .bbl and checks it
  builds.
- **The lab** (Apps → Lab and Work): an **Annotation workbench** (you and a model label the same sample; Cohen's κ;
  published on Hugging Face), a **Research sprint** with you approving each step, a **Sweep planner**, a **Weekly
  progress report** for your advisor or team, and a **Lab notebook** written each evening. Apps on their own page now
  update automatically every day, on weekdays or once a week.
- **Engineering** (Settings → Scheduled tasks → Start from an example): **CI doctor**, **Issue triage**, **Dependency
  gardener** and **Incident first responder**, each with a skill of its own and switches for what it may do. **Find
  what broke it** in Git's history runs git bisect in a worktree and names the commit. **Campaign** (Options → Swarm)
  makes one big change in parts, each in a worktree.
- **Confidential sessions** (Options → Confidential): only models on this computer or your network, no web, browser,
  connected apps or outside models, commands without network, nothing sent out about it, and a lock that shows it.
- **Share a project with people** (a project's ⋯ → Share with people): a link each for your advisor or students, to read
  its documents, sessions, runs and reading list, comment under their name and, if you let them, edit documents;
  never your agents, files or settings.
- **Read and highlight PDFs** (Files → a PDF → Highlight): passages, equations and figures in four colours, notes beside
  them that follow the file, Ask about the part you picked, notes kept in a project's knowledge or saved into the PDF.
- **LaTeX projects as a tree** of their files beside the source, the ones the document doesn't use set apart, renames
  that keep references right; a chapter from Files opens with its document's tree. **Folders in the Library**, and
  **Import a folder**: a LaTeX project comes in as one document.
- While a session works, its line also says how long it has worked in all, its turns together ("Working · 2m 10s
  (47m)"); a share link's page no longer shows steps twice where the agent thought between them.

## 0.30.0 · 5 November 2026

The editors' second round, and what you keep around them: documents on real pages with Suggesting, comments and charts
on their cells in spreadsheets, videos and connectors on slides, Track changes in LaTeX, Notion's drag-select, links
and databases in pages; agents' writing you watch as it comes; Word, Excel and PowerPoint files that look the same in
Office, and PowerPoint files that open as slides; PDFs you and agents fill in and sign, with a signature you draw
once; files dropped on the Library; and the agent's pointer plain to see.

- **Documents** are laid out on real pages of their paper, as in Word and Google Docs: what does not fit goes on to the
  next page (a long paragraph between its lines, a long table between its rows with its header row again), and each
  page has its own header, footer and "Page 3 of 9". **Suggesting** (View → Editing or suggesting, the pencil at the
  end of the toolbar, or Ctrl+Alt+Shift+X) makes what you type, delete or restyle a suggestion beside the page, with
  Accept, Reject and replies, and Tools → Accept all suggestions or Reject all suggestions; Word files keep them as
  tracked changes both ways, and agents read, accept, reject, answer or make suggestions. **Tools → Compare with a
  version** shows what changed since any version, words added and taken out marked, with Restore this version. A Word
  file's comments keep their authors' names, typing just after commented words no longer stretches the comment, and
  the "/" list fits without scrolling.
- **Spreadsheets**: charts sit on their cells and move and stretch with them as rows and columns go in, out or change
  size, and draw ranges in several parts (picked with Ctrl+click or Ctrl+drag, or typed as A1:A7,F1:F7); a range a
  chart cannot draw says why. **Comments** with replies and Resolve beside notes (right-click → Comment, or
  Ctrl+Alt+M), all of them in View → Comments, answered by agents and kept as Excel's threaded comments. The Kanban
  board remembers what it groups by, the fields its cards show and the order of its lanes, and a sheet can open on it.
  Undo and redo keys work; spilled values count in the sum under the sheet, in CSV saves and in Paste special;
  OpenDocument files bring their merged cells, notes, dropdowns and conditional formatting; long dropdown lists and
  their chips' colours come back from Excel files; and Files says exactly what saving an Excel file loses.
- **Slides**: videos from your computer (Insert → Video → From this device, or a video file dropped on a slide; up to
  200 MB), played in the slideshow, a deck's own page and PowerPoint; Vimeo videos with their stills; **comments** on
  a slide or a part of it (Insert → Comment, or Ctrl+Alt+M), with replies and Resolve, that agents answer, kept as
  PowerPoint's comments; **connectors** (Insert → Line or arrow) whose ends stay joined to shapes as they move,
  straight or elbowed, joined in PowerPoint too; equations drawn without the internet in a deck's own page, its
  exports and published copies; find and replace in charts and equations; a part in a group placed where it is on the
  slide; and rulers that stay in view as you zoom.
- **LaTeX**: papers as IEEE, ACM and Springer LNCS ask (New → LaTeX → Conference paper → Paper style), with what to
  install for one your TeX lacks; **Track changes** (Tools → Track changes): your edits and an agent's marked with who
  made them and when, each accepted or rejected, all at once too; comments on .tex files opened from Files; completion
  as you type on a phone; a toolbar that folds into the menus instead of scrolling sideways; and Insert keeps the words
  you picked.
- **Pages**: pick several blocks with a drag from either margin, as in Notion; an item of a nested list turned into
  text, a heading or a quote keeps its place under its parent; code blocks coloured in about twenty languages, with a
  language picker (code agents write in pages is coloured too); "@" (or "/" → Link to a page) links to another page of
  your Library; **comments** on blocks or words (⋮⋮ → Comment, or Ctrl+Alt+M), kept beside the page rather than in it,
  that agents answer; and **databases** as in Notion ("/" → Database): a table of typed columns (text, number, select,
  multi-select, date, checkbox, link) with sort and filter, or a board of cards you drag between lanes, its rows kept
  with the page on every device and changed in Use and in Edit, by agents too.
- **Watch agents write**: a document, slides, a spreadsheet or a LaTeX paper grows on screen as an agent writes it,
  beside the conversation and in the Library, with an **Agent** caret where its words arrive; the page is read-only
  meanwhile, your unsaved changes and the words you are typing are never overwritten, and a save that fails or is
  stopped leaves the page as it was. Agents change just part of a page too (a section, some slides, some cells) and
  build long ones in steps you watch; an agent's saves in one turn are one version ("· 4 saves").
- **Office files that look the same in Office**: Word files carry their fonts and break their pages where the editor
  does (lines, spacing, lists, tables, headers and footers as here); Excel files keep the editor's column widths, row
  heights, font size, list colours and print layout; PowerPoint files carry their fonts (compressed, as PowerPoint
  keeps them), wrap and fit words as here, and have PowerPoint's own layouts (New Slide, Reset Slide), footer boxes
  and guides, and charts with their data for **Edit Data**. Every file passes the Office standard's checks.
- **PowerPoint files open as slides** (New → Slides → **Open a PowerPoint file**, Save to Library, or dropped on
  the Library), up to 200 MB with their videos: layouts, text, pictures, tables, charts, groups, connectors, notes and
  comments come in.
- **PDFs**: **Fill & sign** in Files types into a form's fields over its pages, puts text, ticks, crosses, dates and
  signatures anywhere with a click, and saves a copy or the file itself. Agents fill in forms too (so every viewer
  shows the values, Greek and Chinese as well; a form already signed digitally stays valid), write beside the words
  printed on a page, and rotate, reorder, merge and split pages.
- **Signatures**: draw yours with a mouse, a finger or a pen, type it in a handwriting, or upload a photo of it;
  it is kept encrypted (Settings → Signatures). **Insert → Signature** puts it in a document; an agent asks you for
  one on a card, and places it into Word files, PDFs, pictures and Library documents only after your OK on a card that
  shows where. It is a picture of your signature, not a cryptographic digital signature.
- **Drop files on the Library** (or on a project in it, or a project's card), whole folders too: each becomes what it
  is (a document, a spreadsheet, slides, a LaTeX document, a notebook, a picture, a video or a sound; anything else a
  file in the project's folder), with a tray of their progress; **Upload files** in New does the same on a phone. In
  the desktop apps a drop moves the file instead of copying it.
- **The agent's pointer, plain to see**: in the browser's live view it glides to where the agent acts, with a ring on
  each click and the field it types into outlined; over your screen in computer use, a ring with an Agent tag circles
  the pointer, which now glides instead of jumping, with the words and keys it types beside it (never in the agent's
  own screenshots). Each step's picture marks where it clicked.
- **In every editor**, leaving a page for another place in the app saves what you changed (a note says so), and closing
  or reloading the tab with changes not saved asks first. Ctrl+B in a document or on a slide makes words bold without
  hiding the sidebar, and Ctrl+K in a document puts in a link without opening the search box.
- Fixes: PDFs, pictures and Word files of pages no longer fail now and then with "The browser has closed", and PDFs
  made on a Linux server set their words as Mac and Windows do; a click you make while driving the agent's browser
  lands where you click; words on screen in Chinese and Greek are no longer split ("Forms" is not "For" + "ms") or
  half English (the browser's busy line, a turn's steps in short); the LaTeX editor's menus are reachable again in
  narrow windows and on phones, and Replace all keeps its comments in place; a page's words typed in Edit show Save at
  once (they could be lost), and on a phone a tap no longer lands on a block menu's Delete; a link in a page opens in
  a tab of its own; a document's web page opened again keeps its lists and layout; PowerPoint files keep words inside
  the boxes the editor shrinks them to, and PDFs keep a deck's equations and video stills; Esc in the slides editor
  closes a menu and keeps what is picked; and a right-click on a row's number in a spreadsheet is about that row.

## 0.29.3 · 5 November 2026

The desktop apps carry Hydor's license and notices.

- **License and notices in the apps**: the desktop apps carry the NOTICE file beside the license, and the app's own plugins are under
  the same license as the app.

## 0.29.2 · 5 November 2026

Notebooks and documents an agent hands over go into the Library from their cards.

- **Save to Library** in a file card's **More** (⋯), under an agent's reply: a Jupyter notebook, a Word or Markdown
  document, a spreadsheet or a LaTeX file becomes a copy of its own in the Library, opened in its editor there, in the
  project you pick when you have projects (the session's first). **Add to a project** still copies the file itself
  into a project's folder, where it shows in Files.

## 0.29.1 · 5 November 2026

The Mac and Windows apps of 0.29.0, with everything it brought.

- 0.29.0's Mac and Windows apps could not be built: two of the LaTeX editor's files had names that differ only in
  their capitals, which those computers' disks take for one name. They are named apart now, so the desktop apps
  update straight from 0.28.1 to this version, with all of 0.29.0's changes below.

## 0.29.0 · 5 November 2026

The Library's editors on par with the apps they are compared with: documents as in Word and Google Docs, spreadsheets as
in Excel, Google Sheets and Airtable, slides as in PowerPoint and Keynote, LaTeX as in Overleaf, and pages you write in
as in Notion.

- **Every editor has menus** beside its title (Edit, View, Insert, Format, Tools and the rest), their names shown
  wherever there is room, and **Search the menus** (Alt+/) finds anything in them by its words. Each also has find and
  replace (Ctrl+F, Ctrl+H) with Match case, Whole words and regular expressions, a list of its keyboard shortcuts
  (Ctrl+/), and emoji and special characters found by name.
- **Documents**: comments on words, with replies and Resolve, beside the page or in a panel, that agents read, answer
  and resolve (and Word's own comments, out and back in); a "/" menu of what to put where you are; equations written
  in LaTeX; a table of contents that keeps up with the headings; headers and footers with page numbers; callouts; line
  and paragraph spacing; merged and coloured table cells, and columns sized by dragging; the format painter; UPPERCASE,
  lowercase, Title Case and Sentence case; a word count with the reading time; zoom; printing; spelling on or off; and
  blocks moved by the handle beside them. Word files keep all of it.
- **Spreadsheets**: filters on a header row; conditional formatting (rules, colour scales, data bars); dropdowns with
  coloured chips, checkboxes, star ratings and a calendar for dates; borders; merged cells; the fill handle with its
  series; hidden rows and columns; Excel's number formats and codes of your own; charts of seven kinds; Paste special;
  removing duplicates, splitting text into columns and trimming spaces; summaries as a pivot table makes them; notes;
  a row opened as a card; a Kanban board; FILTER, SORT, UNIQUE and SEQUENCE that spill; each function's arguments as
  you type; and zoom. Excel files keep them.
- **Slides**: groups; zoom; about 1,900 icons and emoji; equations; YouTube and Vimeo videos; cropping and a picture's
  colours; slide numbers and a footer; the format painter; a grid, rulers and guides, and equal gaps as you drag;
  merged table cells; the Morph transition, where what two slides share glides into place; and in the slideshow a
  laser pointer, a pen and live captions. Slides also export as pictures, and PowerPoint files keep groups, icons,
  equations and Morph.
- **LaTeX**: a Visual mode that shows the source as a document while you type; formulas drawn as you write them;
  completion of commands, environments and packages; a symbols panel; tables made in a grid; references found by DOI,
  arXiv id or title and added to the bibliography; nine templates for a new document; folding; spelling; checks for
  what is sure to fail before TeX runs; a word count; comments agents answer; versions compared, a file brought back
  from one; dark pages; and the pages presented full screen.
- **Pages, written in as in Notion**: Enter makes the next block; "/" adds headings, lists, to-dos, toggles, callouts,
  quotes, code, tables, pictures, videos, columns, cards, maths, a table of contents or a button; Markdown turns into
  blocks as you type; the ⋮⋮ beside each block drags it, turns it into another kind or colours it; several blocks are
  picked at once; and a page gets an icon and a cover. To-dos tick and toggles open on the page itself.
- **Jupyter notebooks** are a kind of their own in the Library, shown and run in the notebook page's view with their
  outputs, with **Ask** on the whole notebook or a cell, and exported as the .ipynb, a Python script, a PDF or a web
  page. **New notebook** in Files makes one, an empty .ipynb file opens as a notebook, outputs show as Jupyter shows
  them, and agents have a notebooks skill.
- **Projects** live at /projects, with the guide's topic at /guide/projects; older links land in the new place, and
  a project's Knowledge, Skills and Settings tabs are as wide as the rest.
- As the app opens, the loading logo moves into its place in the sidebar.
- Background tasks show how long they have run after the app restarts, a new terminal starts in your home folder, the
  form before a picture, video or sound is made quotes the agent's whole description, and Settings → Models suggests
  Grok 4.7 in GLM 5.3's place.

## 0.28.1 · 5 November 2026

Updates of the desktop apps no longer give up on a slow or interrupted download, and on a Mac they keep the
permissions you gave Hydor.

- **A download that breaks off carries on**: when your computer goes to sleep, or the connection drops or goes quiet
  for a minute, the new version's download picks up where it stopped as soon as it can, instead of failing after half
  an hour and starting again from nothing 4 hours later. If it still gets no further after a couple of minutes, it
  keeps what it has and tries again an hour later.
- When an update fails, Settings → General says why in plain words: how far the download got, that GitHub did not
  answer, or that it could not be reached, rather than "The operation was aborted due to timeout".
- **The Mac app keeps its permissions when it updates**: Accessibility and Screen Recording, which computer use needs,
  carry over to each new version, so you no longer have to give them again after every update. Coming from an earlier
  version, give them once more: macOS still lists the old Hydor as switched on, and **Allow…** in Settings → Computer
  use now clears that old switch, so macOS asks again and you turn Hydor on.

## 0.28.0 · 4 November 2026

Computer use on Windows and Linux too, a glow around the screen while an agent is at it, and Esc to stop it.

- **A glow while an agent uses your computer**: the edges of every display light up in the app's water colours,
  and a note at the bottom says an agent is using your Mac (your PC, your computer) and that Esc stops it. Clicks go
  through it and it never takes the keyboard. It is for you only: the agent's screenshots never show it.
- **Esc stops the agent**: press Esc in any app while an agent uses the computer (⌘⇧Esc still works on a Mac).
  When the agent presses Escape itself, to close a dialog say, that does not stop it.
- **Computer use on Windows**: agents see the PC's screen and use its mouse and keyboard in any app, type in any
  language, and open apps by their names in the Start menu. There is nothing to allow in Windows: turn it on in
  Settings → Computer use.
- **Computer use on Linux**, on an X11 (Xorg) desktop: the same, with apps opened by the names your applications
  menu shows, and text in any script whatever the keyboard layout. A Wayland desktop lets no app see or use the
  others, so there Settings says so, and how to log in to an X11 session instead.
- Settings → Computer use is the same in every desktop app: **Let agents use this computer**, macOS's permissions on
  a Mac, and on Linux what is in the way, if anything. The card each session shows asks about your Mac, your PC or
  your computer.

## 0.27.0 · 4 November 2026

Hydor for Windows and Linux: desktop apps beside the Mac one, that bring everything they need and keep themselves up
to date.

- **The Windows app**: an installer for your account (no administrator needed) that puts Hydor in the Start menu and
  opens it in a window of its own. It stays in the notification area of the taskbar when you close the window, opens
  in the background when you sign in to Windows, and updates itself as the Mac app does: a minute's notice, then the
  new version's installer runs without its window and opens the app again. Agents run their commands in Git for
  Windows' bash, as Claude Code does there; terminals open it too. Install Git for Windows beside it.
- **The Linux app**: a `.deb` for Ubuntu and Debian and an AppImage for every other system, for x64 and ARM. It brings
  its own Node.js and tmux, stays in the system tray, opens when you log in, and updates itself: an AppImage replaces
  its own file (and goes back to the version before if the new one does not start); the `.deb` installs a new version
  once you give your password.
- **Agents carry on through updates everywhere**: on Windows and from an AppImage, each version runs from a copy of
  itself in your local data folder, so the agents that outlive the app never hold its files.
- **The server runs on Windows**: agents' runners talk over named pipes that answer only the app, programs installed
  with npm start without a shell in between, stopping a command stops everything it started, Windows paths
  (`C:\Users\…`) work in the Files page, the sidebar's folders, Git and the folder picker, and the safety checks on
  agents' commands read Windows and Git Bash paths too.
- The README offers each system its download: Mac (Apple silicon or Intel), Windows, and Linux (`.deb` or AppImage,
  x64 or ARM). Settings → General words updates and starting at login for the system you are on.
- Projects in the sidebar that began outside Hydor, in Claude Code or Codex (VS Code, a terminal, their desktop apps),
  show the mark of the agent they came from. Point at one, or open its ⋯, to see which apps and which added account
  its sessions came from. A session's Info now says "Hydor" for the sessions Hydor started.
- Not in the Windows and Linux apps yet: computer use (it stays in the Mac app). On Windows also the agent sandbox,
  **Run code** steps in apps, local voice transcription and the System page's figures, and terminals end when the app
  quits (Windows has no tmux).

## 0.26.0 · 4 November 2026

Explore, a magazine made for you; sessions that name themselves; and memory notes that no longer fill the page.

- **Explore**: a new ready-made app, one click away from **Explore** at the top right of the start page. It reads your
  profile, the notes memory keeps about you and the titles of your latest sessions, picks about six topics you would
  enjoy (half from your work, half from the rest of your life, never anything private), and finds each one's news of
  the past two weeks and long reads worth your time. It lays them out as a magazine: a cover line, a note from the
  editor, a cover story, then a section for each topic, each story with its picture, what it says and why it is there.
  Click a story to read it on its site (it is then marked read), or **Dig deeper** for a research report on it.
  **Update** makes a new edition; in its settings, **Update every day** (off until you turn it on) has one ready each
  morning, **Recent sessions to read** says how many of your sessions it learns from (1,000 unless you change it), and
  **Also cover** and **Leave out** steer it. It opens on its own page, and agents don't run it in your chats.
- **Sessions name themselves**: a moment after you start a session, the helper model gives it a title of a few words
  for what you asked, which the sidebar, the session's header and the search box show instead of the start of your
  message. Nothing shows in the conversation, Claude Code and Codex get the title for their own lists too, and a
  name you give a session yourself is never replaced.
- **Memory notes, a few at a time**: in Settings → Memory, each place shows its three newest notes, with **Show N
  more** for the rest, and each note shows two lines until you click it, which also shows who wrote it and where.
- Your own apps that open on a page of their own get the same **Update** and settings at the top: their form's
  answers, kept, and **Update every day**.
- The helper model's long questions (over 64 KB) go to Claude Code and Codex on their input, instead of failing.

## 0.25.1 · 4 November 2026

Skills you can switch on or off for one project, whatever Settings says for every other session.

- **Every skill a project gets, on its Skills tab**: a project's **Skills** tab now lists all the skills its
  sessions get: its own, your skill library's (built in, yours, your plugins'), and Claude Code's and Codex's own
  for its folder, with the same search and filters as Settings → Skills.
- **Switches for one project**: each skill there has a switch for that project's sessions alone. A skill switched
  the other way from Settings says **On here** or **Off here**, and **Changed here** lists them. **Follow Settings**,
  in a skill's window, goes back to what Settings says; **Reset every switch here**, in the ⋯ menu, does it for all
  of them. Claude Code's and Codex's own skills are switched for the project's sessions without changing those
  agents' own settings.
- **Settings → Skills is for every session**: its switches count wherever a project doesn't say otherwise, and a
  skill's row says when one does ("Off in Thesis"). The folder chip at its top right is gone: Claude Code's and
  Codex's own skills show as every folder has them, and a project folder's own are on that project's tab.
- **Change a library skill for one project**: open it on the project's Skills tab and click **Change for this
  project**, in place of the old From the library button.

## 0.25.0 · 4 November 2026

A profile of you that every agent starts with, memory that brings the notes bearing most on your request, skills named
when they fit, web search that keeps working when the search providers can't, and the files Codex cites shown as files.

- **Your profile**: memory keeps one profile of you (who you are and what you do, what you use, how you like answers,
  what to avoid) that every agent gets once, at the start of a session, right after your Agent Guidelines. Agents add
  to it only when something you say will help every agent serve you better, and the change shows under their reply,
  with undo. Write or edit it yourself in Settings → Memory. **Profile length** sets the most words it may have (1,000
  unless you change it); a longer one is kept as you wrote it while the helper model shortens it to fit.
- **The notes that bear on your request**: each agent starts with the notes about you and the project that bear most
  on what you asked, found by their words and, with search by meaning on, by what they mean, then the latest: 10
  unless you change it with **Notes each agent starts with**. Agents look up the rest when they need it. With search
  by meaning on, a new session waits a few seconds for its model, so your first message is matched by meaning too.
- Agents write each note as one fact that stands on its own and names what it is about, so that it is found again
  later; what every agent should always know goes in your profile instead. The nightly tidy-up still sums a project's
  notes up in a profile of the project, and leaves yours to you and your agents.
- **Skills that fit**: a new session's agent hears which skills fit its first message, when any clearly do, found by
  their words and by meaning. **Suggest skills that fit**, in the ⋯ menu of Settings → Skills, turns it off.
- **Web search when the providers can't answer**: when every search provider fails, Claude Code and Codex search with
  their own web search instead of stopping there, and cite its pages as usual.
- **Files Codex cites**: Codex points to files in its replies in a form of its own (`:codex-file-citation{…}`), which
  showed as raw text. Now each shows as the file's name with a file icon, and opens the file, as in the ChatGPT app.

## 0.24.7 · 4 November 2026

Projects and folders can be renamed right from the sidebar.

- **Rename from a heading**: point at a project's or a folder's heading in the sidebar and click its **⋯** (or
  right-click the heading) for **Rename**, or double-click the name. Type the new one and press Enter. A project's
  new name is its name everywhere.
- **Folders keep the name you give them**: it shows in the sidebar, under each session and in the folder menus
  on the start page, on every device. The folder on disk keeps its own name, and **Use the folder's own name** in
  the same menu brings it back.
- **Rename folder** in a session's menu names the folder it works in, even one with no group of its own, such as
  a folder the Codex app made for a ChatGPT project: once named, it gets a group under that name.

## 0.24.6 · 4 November 2026

Your ChatGPT projects no longer show in the sidebar as folders with long id names.

- **ChatGPT projects in the sidebar**: the Codex app makes a folder for each of your ChatGPT projects, named only by an
  id (g-p-6a8f48…), and the sidebar gave each of them a group under that name. Now a folder Codex knows the project
  name for shows under that name; the others get no group, so their sessions go by day, and show **ChatGPT project**
  as their folder.
- **Folders of the same name**: two folders called the same, in folders also called the same, now show as much of
  their place as it takes to tell them apart, where the sidebar showed the same label twice.

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
