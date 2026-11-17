# Wiki memory

Wiki memory is a set of linked articles that agents keep for each of your projects, and one shared set, in plain Markdown files. The articles are written from the project's documents and its work, and each one lists the sources it came from. It is one part of Hydor's memory, beside memory notes and documents. This topic covers how the three fit together, where wiki memory is kept, how new documents and a project's own work update it, what you see on a project's Memory tab, and what agents can and cannot do with it. Use it to let what a project learns build up over time instead of being found again each session.

![A project's Memory tab on its Wiki part: the articles by area, an area's hub open, and the recent updates](images/wiki-memory.webp)

## How it sits beside notes and documents

Memory has three parts. Each is for something else, and they work together:

- **Memory notes** are short facts every agent starts with: about you, about a project, about a session (see [Memory](/guide/memory)).
- **Wiki memory** is articles: longer, linked, with their sources, kept for a project (and one shared wiki). Agents read them when they need the detail, and add to them as they work. They are not handed whole: an agent is told which articles bear on what it is doing (see below).
- **Documents** are the files themselves, which agents search and cite (see [Projects and knowledge](/guide/projects#give-a-project-documents-of-its-own)).

The idea comes from a wiki that an AI agent maintains: keep the original sources, then bring what they say together in articles that point back to them. When something new arrives, the agent updates the articles instead of starting again, so you can build on earlier work and check where a claim came from.

When a document is added or changed, Hydor can read it and add what it says to the other two parts: a few memory notes (for a project's documents) and updates to the wiki (see [Learn from new documents](#learn-from-new-documents)). About once a day, Hydor also reads the project's recent conversations and commit messages and adds what is worth keeping to the wiki (see [Learn from the project's work](#learn-from-the-projects-work)).

**What agents get without asking.** An agent in a project is given, with your first message, up to three lines naming the project's articles that bear on it ("From this project’s wiki (wiki_read opens one)": each article's title, a line of what it says and where it is), and with a later message at most one. It reads an article with the wiki tool when it needs more. Only articles count, not the sources, `index.md` or `log.md`, and usually none is clear enough to be named. A line says "may be out of date" when the files its article names have changed since it was written (see [Articles tied to the code](#articles-tied-to-the-code)). The project's active plans come in the agent's instructions, each with its title, where it is and what is still open ("Active plans in this project’s wiki"). This needs wiki memory on for the project and for the chat, and memory on for the session; it never happens in a Confidential session, and a session in no project is not given the shared wiki unasked. Custom with a small model gets fewer lines, or none (see [Custom](/guide/custom#what-the-model-reads)). The rest of memory's delivery is in [What an agent starts with](/guide/memory#what-an-agent-starts-with).

## Turn it on or off

Wiki memory is on for every project unless you turn it off. Two places decide:

- [Settings → Capabilities → Memory → Wiki memory](/settings?s=memory&find=Wiki%20memory) has the default: the **Wiki memory** switch. It also decides the shared wiki, the one that belongs to no project.
- Each project's own **Settings** tab has a **Wiki memory** choice: **As in Settings (On)** (or **(Off)**, as the default is now), **On** or **Off**. It saves at once. Pick **On** or **Off** to make this project differ from the default.
- Under it, **Most documents to read into its wiki** has **As in Settings (100)** (the number [Settings](/settings?s=memory&find=Most%20documents%20to%20read%20into%20the%20wiki) has now) or **A number of its own**, with a box to type it in. It saves at once too. See [When a project has too many documents](#when-a-project-has-too-many-documents) for what it does.

With wiki memory off for a project, its Memory tab says "Wiki memory is off for this project", agents' wiki tools there say it is off, and nothing is written. What is already in the folder stays.

In chat options, **Wiki memory** and **Auto lessons learned** apply to that chat. Their defaults are in **Settings → Memory → Wiki memory**. Automatic lesson suggestions also need Memory; saving a reviewed suggestion needs your confirmation. A native agent started before Wiki memory was turned on needs a restart to register its checkpoint hook.

Learning from documents, learning from a project's work and session checkpoints also need [Memory](/guide/memory#turn-memory-off-for-all-sessions) itself to be on: with Memory off, new documents add nothing and no checkpoints are saved.

## Where wikis are kept

By default, in one folder: **Wiki folder** in [Settings → Memory → Wiki memory](/settings?s=memory&find=Wiki%20folder). It starts as `.wiki` in Hydor's task folder (for example `~/Hydor/.wiki`). The shared wiki is that folder, and each project's wiki is a folder of its own inside it, under `projects/`, made when first needed. The folder is named after the project and kept even if you rename the project. Nothing is written into your project folders, which are often Git repositories.

The folder is an absolute path on the computer running Hydor (when Hydor runs in a container, a path the container can reach). Press **Browse** to pick it: the desktop app opens the system folder dialog; in a browser or on another machine, Hydor shows the folders of the machine running it, and you can make a folder there.

**Project wikis** can instead be **In each project’s folder**. Each project then keeps its wiki in its own folder, at **Folder inside each project** (`.wiki` at first; a path inside the project, never `.git`). **Leave it out of Git** adds that folder to the project's `.gitignore` when the wiki is written, for wikis kept in the project's folder and in Git repositories only. It is off at first; turning it off later keeps an entry already added, and files Git already tracks stay tracked.

A project can also name its wiki folder itself: a line in its `AGENTS.md` such as ``- Wiki: `knowledge/wiki` `` makes that folder, inside the project, its wiki. That wins over the settings above. A path that is absolute, starts with `~`, climbs out with `..`, goes through a Git or hidden Hydor folder, leaves the project through a link or leads to the shared wiki itself is ignored. Only projects have a wiki of their own: in a folder that is not one of your projects, agents use the shared wiki, whatever that folder holds.

Whatever the settings say, every wiki is a folder inside the wiki folder or inside its own project, never anywhere else.

Inside a wiki, `wiki/` holds the articles, `raw/` the sources they came from, `index.md` lists the articles, and `log.md` says what changed and when. They are ordinary Markdown files, so other tools can read them too.

## Learn from new documents

With **Learn from new documents** on (in Settings → Memory → Wiki memory, on at first), a document added to knowledge, or changed there, updates memory by itself:

- A project's documents update **that project's** wiki and add notes to **its** memory.
- Documents in the shared knowledge update the shared wiki. They add no memory notes, because they belong to no project.

The helper model (set in [Settings → Models](/settings?s=models)) does the reading, a little at a time:

- A document is read once its knowledge base has had no new files for about half a minute, one document at a time, and at most 40 an hour. The rest wait for the next hour.
- It reads up to the first 40,000 characters of a document and says so in the source it keeps if it cut it.
- It keeps the document's text, with passwords and keys taken out, as a source in the wiki's `raw/` folder. Then it chooses which articles the document bears on: Hydor finds the best twenty by their titles' words and by what they mean, and shows the helper only those. It picks up to three of them to add to, up to two new articles, and up to three short notes for the project.
- The articles keep only what matters: what the document is for, its key facts, findings, decisions, names and numbers. Detail, examples and tables row by row stay in the document, which agents search.
- Articles can be revised, not only added to (see [Revisions and long articles](#revisions-and-long-articles)). Anything that holds a secret is left out. The notes are short, new, and never repeat one the project has.
- A document with the same text is not read twice. A change to a document reads it again.
- Documents already in a project's knowledge are read too, once, at the same pace (the newest first, up to 400 a project, the shared knowledge counting as one), so an existing project's wiki fills in over a few hours. A project is looked at again every ten minutes, so one that was not ready (its wiki memory was off, say) is read once it is. A project with more documents than its limit reads those it picks (see below).
- Wiki memory's own folder is a knowledge base too, but never digests itself.

If the helper cannot be reached or finds nothing worth adding, nothing is lost: the update is listed with the reason, and the document is tried again when it changes.

### Revisions and long articles

An article used to only grow. Now a newer source may **replace** what an article said, when it contradicts a statement or shows it out of date:

- For each statement it takes out, the helper gives a reason: replaced by a source, moved to another article, or no longer true as of a date. A rewrite that leaves out more than a fifth of the article is refused unless every statement it dropped is listed with its reason (and really was in the article), and one that would keep less than half of it is always refused.
- Before a rewrite, the earlier text is kept as a **snapshot** in a hidden history folder inside the wiki, the 20 newest of each article, and `log.md` gets a line such as "revised … replaced 2 statements (earlier text kept)".
- An article over 12,000 characters that needs an update is first **split**: the helper reorganises it into a hub, at the same place, with links to two to five parts. The parts must keep at least 90% of its text, in its own words: it is reorganising, not summarising. `log.md` says it was split, and its text is kept as a snapshot. When it cannot be split and is too long to rewrite, it is left as it was and the update says so.

Each article also keeps a one-line **summary**, shown in `index.md` beside its title and in the lines agents are given.

### When a project has too many documents

Reading every file of a big collection (a thousand papers, a whole documentation site) would take the helper model days and cost a lot, and the wiki would be too full to help. So the wiki reads **at most a limit** of the documents of a project: **Most documents to read into the wiki** in [Settings → Memory → Wiki memory](/settings?s=memory&find=Most%20documents%20to%20read%20into%20the%20wiki), 100 at first (a whole number from 0 to 100,000). A project with more documents than that has its wiki read up to the limit of them, in this order:

1. the ones you **pinned** (below);
2. then the ones agents **used most**, meaning a document search returned one of its passages or an agent read it;
3. then the **newest**.

The rest are not read into the wiki. Agents still find and cite them with their ordinary document search, which covers all of them. The count is the indexed documents in the project's own knowledge, not the wiki's own files. The shared wiki counts the shared knowledge the same way.

- **Pin a document**: in the project's **Memory** tab → **Documents**, open a document's **More** menu and pick **Read into wiki memory**; **Don’t read into wiki memory** lets it go. A pinned document shows a pin. The menu is there while wiki memory is on. A pinned document comes first, so it is read even when the project is over its limit, and it is read at once; the wiki never reads more than its limit in all.
- **Overviews**: for each folder holding documents the wiki does not read (a big folder's own subfolders, when they hold at least five), the helper writes one short article, "Overview: <folder>", from the documents' titles, sizes, dates and first lines: what kinds of documents are there, how many, and the notable ones. It guesses nothing about what is inside them, and says agents find that with a document search. It is written again when the folder's unread documents change, at most three a hour. They are listed in **Recent updates** as **Overview**.
- A project can have a number of its own: on its **Settings** tab, **Most documents to read into its wiki** (see [Turn it on or off](#turn-it-on-or-off)). It wins over the one in Settings; **As in Settings** follows it again.
- A limit of 0 reads no documents at all, and says "This project has 240 documents, more than the 0 its wiki reads: agents search them instead of reading them into the wiki." To stop reading documents for every project, turn off **Learn from new documents** instead.
- Change a limit and the project is looked at again within ten minutes: raise it, pin documents, or delete documents until the project is under it, and the documents it now reads are read then. Documents that arrived while it was over the limit are read too, when they are among those it reads.
- The project's Memory tab says it when it is over: "Its wiki reads 100 of its 240 documents: the pinned, the most used and the newest. Agents search all of them."

### Large data files

A large data file, such as a CSV or TSV file, a spreadsheet or JSON data (more than 40,000 characters of text, or bigger than 256 KB), doesn't read well as text, so the helper analyses it with code instead:

- It writes short Python programs, and Hydor runs each one in a sandbox with no network that sees only that file (read-only) and a scratch folder: up to four runs, a minute each. The helper reads what they print, then writes its findings: what the file holds, its size and columns, key numbers and patterns.
- Only the findings are kept as the source and go into the articles. The file stays in knowledge, where agents search it.
- This needs a sandbox for code, which Hydor has on Linux with bubblewrap. Elsewhere (macOS and Windows for now), large data files are searched only, and **Recent updates** says so.

In a session, an agent that may run commands can analyse such a file itself, loading it from its path in a script.

## Learn from the project's work

About once a day, with Memory's [Learn from conversations](/settings?s=memory&find=Learn%20from%20conversations) on (it is at first), the helper model reads a project's recent conversations and commit messages and adds what is worth keeping to that project's wiki. It reads only what you and the agents said: your own words (not files you attached or text you pasted) and each agent's last reply to you, never the output of tools. It never reads a Confidential session, a session with memory off, a helper session or a scheduled run.

- **Conversations, picked by what they hold.** It runs when the last time was a day ago or more and nobody has written to an agent for ten minutes, so it does not get in the way of your work. A busy project has more conversations than are worth reading, so each gets a score from what its text shows: commits made in it, corrections you made, failures that were fixed, and its length. The best go first, and short ones are skipped. It reads at most four conversations for a project and twelve in all each time. The first time, it looks back two weeks, so a project that already has sessions gets its wiki soon after you update. Each time after, it reads only what is new: it keeps where it stopped in each session, so a conversation it has read is never read again, and when one goes on, only its new turns are read. A session an agent is still working in waits for the next time, and so does one it had no room for.
- **Conversations that went quiet.** A session is also read once it has had no new turn for 30 minutes, without waiting for the day's pass, so what it learned is in the wiki sooner. All together, at most eight sessions a project a day are read.
- **Commit messages.** Once a day, for a project in a Git repository, the new commit messages (up to 60: the messages, not the code) are read as one source, with passwords and keys taken out, and listed under **Recent updates** as **Commits**.
- For each of them it keeps the text, with passwords and keys taken out, as a source in the wiki's `raw/` folder, named after the session and its day, then adds to or updates articles, or starts a new one. It keeps lasting knowledge about the project: decisions and why they were made, how things work, conventions, commands that worked, pitfalls and their fixes, results, and open questions. "Nothing worth keeping" is a fine answer.
- It never keeps personal details about you, secrets, instructions for agents, or a step-by-step log of what an agent did. Articles can be revised, as with documents. It adds no memory notes: those come from [Learn from conversations](/guide/memory#learn-from-conversations) in the tidy-up.

Each conversation and each day's commits show up under **Recent updates** on the project's Memory tab, and you can open the session from there. To stop all of it, turn off [Learn from conversations](/settings?s=memory&find=Learn%20from%20conversations) (this also stops memory's own learning from conversations), or turn wiki memory off for the project.

## Articles tied to the code

An article about a project's code goes out of date when the code changes. So each article the wiki writes records, besides its summary, the files and folders of the project it names (up to 30) and the commit the project was at when it was written.

- Once a day, for a project whose folder is a Git repository, Hydor compares those files with what changed since that commit. With no model involved, an article whose files changed is marked **stale**, and agents are given its line marked "may be out of date" until it is brought up to date.
- Up to five stale articles a day are then brought up to date by the helper model, from the article and the change to its files, under the same rules as any revision: the earlier text kept as a snapshot, each statement it replaces listed with a reason, a line in `log.md` (see [Revisions and long articles](#revisions-and-long-articles)). The stale mark goes when an article has been revised, or when its files are back as they were.
- Each of these shows under **Recent updates** on the project's Memory tab as **Code changes**, with the articles it brought up to date.

A project that is not a Git repository has no such marks. The same ties between a project's files and what it remembers hold for memory notes (see [Tidy up automatically](/guide/memory#tidy-up-automatically)).

## Areas and hubs

Once a project's wiki has ten articles, Hydor groups them into **areas**: each one a lasting topic of the project (a part of the system, a field of work, a kind of decision) with the articles about it, and a line saying what belongs in it. An article is in one area, or two when it is truly about both. What fits no area yet is in **Other**. No file moves: every article keeps its place, so every link and every note that points at one keeps working.

- **Hubs.** Each area with two or more articles has a **hub**, `wiki/areas/<area>.md`: a short overview of the area, up to six key facts, each with a link to the article it comes from, and the area's articles in the order to read them. The helper model writes the overview and the facts; Hydor checks each fact and leaves out one that cites no article of the area, or that its article does not say, and makes the list of articles itself. A hub is written again when its articles change, at most six hubs an hour in all. Agents read hubs but cannot write them: they change the articles, and the hub follows.
- **The index.** `index.md` lists the articles by area: a heading for each area that links its hub, the line saying what belongs in it, then its articles, with sub-areas under their area and Other last. An article in two areas is listed under both. A wiki of fewer than ten articles, or one with no areas yet, keeps a single list.
- **New articles.** When a document or a conversation adds an article, the helper places it in an area in the same step. An article an agent writes is placed within ten minutes.
- **How the areas change by themselves.** The areas are looked at again when the wiki first reaches ten articles, when an area holds more than twelve, when Other holds four articles or a fifth of them and more than after the last time, or when a quarter of the articles are new or changed since the last time; never more than once a week (but the first time), and only while nobody has written to an agent for ten minutes. A stronger model proposes the areas as they should be (Claude Sonnet, when the helper model in **Settings → Models** is **Automatic**): it may split a big area or give it sub-areas (two levels at most), merge or rename areas, and move articles. Then the helper checks each article that would move, and where it says the article does not fit, its answer wins. Hydor keeps to a few rules: every article is in an area (else Other), an area has at least two articles, there is at most one area for every two articles, and but for the first time a pass moves at most a third of the articles (the rest wait for the next one). A renamed area keeps its old name as another name for it, and so does the area that takes a merged one's articles.
- **Folds and merges.** The same pass may find an article about an event ("… in 0.34.0", "… for crawl 31") whose lasting content belongs in a topic article, or two articles about the same thing. They are merged later, at most two a day, under the rules of any revision (see [Revisions and long articles](#revisions-and-long-articles)): the helper writes the merged article, and if it would leave anything out without a reason, the other article's text is added to it as it was, under "From" and its title, instead. Both texts are kept as snapshots, and the article merged away becomes a **redirect**: a short page saying where it went. An agent reading it is taken to the article it went to; the index, the hubs and searches leave redirects out, and the wiki check accepts them.
- **Ask for it now.** There is no button: it runs by itself. To have the areas looked at now, ask an agent ("Reorganise this project's wiki now"): it runs at once, whatever the triggers say, and tells you what changed. It takes a minute or two.
- **What you see.** The project's **Memory** tab shows the articles by area (see [A project's Memory tab](#a-projects-memory-tab)). Each reorganisation and each merge adds a line to `log.md`, and shows under **Recent updates** as **Areas** or **Merged**.

Agents are told that `index.md` lists the articles by area and that `wiki/areas/<area>.md` is an area's hub, and get one line naming the wiki's areas with how many articles each holds ("Wiki areas: Crawling (5) · Ranking (4) · …"; not Custom with a small model). The lines naming a project's articles (see [How it sits beside notes and documents](#how-it-sits-beside-notes-and-documents)), and the search across your projects, say which area each article is in.

## Build a wiki from a project's history

A project that existed before wiki memory, or whose wiki is still empty, has a lot the wiki has not read. **Build from history** reads it. While the project's wiki has no article yet, the **⋯** menu beside the buttons on its **Memory** tab → **Wiki** offers **Build from history…** in place of **Rebuild from sources…**. The empty **Wiki** tab shows it too: under the line that says it is empty, what the project has to build it from, with a **Build from history…** button. A dialog says what it will read ("38 conversations, 412 commits, 9 documents, 14 notes, README.md, docs/"), about how long it takes (for what matters most, and in all) and what it costs: "It uses your Claude plan", or the price when your helper model has one in the app. Press **Build** to start it.

What it reads:

- **Project files**: the project's name and description, the top two levels of its folder with the number of files in each (in a Git repository, what Git lists, so ignored files are left out; else the folder without hidden folders, `node_modules`, `dist`, `build`, `venv`, `__pycache__` and `target`), its README, `AGENTS.md`, `CLAUDE.md` and `CONTRIBUTING.md` (each up to 8,000 characters), and the title and first paragraph of up to 40 Markdown files in `docs/`.
- **Memory notes** of the project. They are only read: no note is added, changed or removed.
- **Conversations** of the project that the daily pass may read and has not read yet (never those with memory off, Confidential ones, subagents and scheduled runs, and none when **Learn from conversations** is off), up to 300, the ones with the most signal first: commits made in them, corrections, failures fixed, length.
- **Commit messages**: the newest 1,200 (merges left out; trailers, e-mail addresses and secrets cleaned), in batches of the size the daily pass reads. The daily pass then goes on from the latest commit.
- **Documents** in the project's knowledge that the wiki has not read, picked as for any project (the pinned, the most used and the newest, up to its limit; see [When a project has too many documents](#when-a-project-has-too-many-documents)).

What matters most comes first: the project files, the notes and the 10 conversations with the most signal (with fewer than ten conversations, the newest commits join them). Once those are read, an agent can already find its way in the wiki; the other conversations, the rest of the commits and the documents follow in the background. When all are read, the areas are organised, the hubs written and the duplicates that reading side by side made are merged (see [Areas and hubs](#areas-and-hubs)). **Recent updates** shows the build as one row ("Building from history: 12 of 48 sources", then what it made). If the helper cannot read most of what matters first, or more than half of the sources, the build fails and says so. After an app restart it goes on where it stopped. Progress, **Stop** and **Continue** are described in [the next section](#update-rebuild-or-restore-the-wiki). Agents are told that wiki memory exists only once the project's wiki has an article.

A new session you start in a project whose wiki is still empty asks first whether to build it, so the agent starts out knowing the project: a card under your message offers **Build memory, then start**, which builds what matters most and sends your message when that is read, while the rest builds on in the background. See [Build a project's memory before the agent starts](/guide/sessions#build-a-projects-memory-before-the-agent-starts).

## Update, rebuild or restore the wiki

The wiki keeps itself up to date over hours and days. When you want it now, or want it written again, the **⋯** menu beside the buttons on the project's **Memory** tab → **Wiki** has three entries (with an empty wiki, **Build from history…** takes the place of the rebuild). One runs at a time for each wiki, and a build or rebuild reads several sources at once: three on **Automatic**, four with a model reached over an API, one with a model on this computer or your network. Each article is written against what it holds when its turn comes, so two sources about the same topic never overwrite each other. The slow pace of the daily and quiet passes, the commit pass and the document queue is for what runs by itself: a build or rebuild you start goes as fast as its helpers do, and those passes leave the project alone while it runs.

While a build, rebuild or update runs, a panel at the top of the **Wiki** tab shows what it is doing: a title, a bar, the steps (a check for what is done, a dot with "4 of 10" for the one being read, a circle for the later ones; a build lists what matters first and the rest on one line, "Later, in the background: …"), what it reads now and about how long is left. **Stop** asks "Stop? What is written stays; you can continue later." Once it has stopped, the panel says "Stopped at 23 of 48" and **Continue** goes on from there (for a build or rebuild; a stopped rebuild keeps its archive, so **Restore the previous wiki…** still works). A job that failed says why, and **Try again** goes on, reading again what the helper could not read. A finished one says what it made. The panel stays, with its **Dismiss** button, until you dismiss it. On a phone the buttons are full width.

- **Update now** does at once what would otherwise wait: it reads the project's documents waiting their turn, its conversations not read yet (with the same limits and the same sessions left out as the daily pass) and its new commits; brings up to date the articles marked out of date by the code (up to ten), every hub whose articles changed and the queued merges (up to five); and looks at the areas again (see [Areas and hubs](#areas-and-hubs)). It costs what those would cost later: a few helper calls, more when much was waiting.
- **Rebuild from sources…** writes the whole wiki again. A dialog says what it will read and what it costs before anything happens: how many sources, which of them are the project's files, its commits, its documents and conversations the wiki never read and its notes, about how long it takes, about how many helper calls (two a source, then the areas and one for each hub) and how much text, and the price when your helper model has one in the app (with **Automatic**, it uses your Claude account's usage). Press **Rebuild** to start it. The current wiki is archived first (its articles, index, log and areas; the last three archives are kept, and always the wiki as it was before its first rebuild); the sources, plans and memory notes are never touched. Then it reads, a few at a time: the project's files, made fresh; the sources it keeps in `raw/`, oldest first (the text of its documents, its conversations, notes moved from memory), except the commit messages, which it reads fresh from the repository instead, all of them as a build does; the documents and conversations the wiki never read; and the project's memory notes, made fresh. Then the areas are organised and the hubs written. An article no source backs (one an agent wrote from nothing kept) is read too, and so is each article of the earlier wiki that no new article covers (the helper keeps only what matters of each source, and may leave a topic out), so nothing drops out of the wiki; each of those adds about two helper calls, which is why the dialog also says the most it may take. Every old article that is gone becomes a redirect to the new article that holds what it said (else to the index), so notes and links that name it still lead somewhere. **Recent updates** shows it as one **Rebuild** row with its progress. A wiki with no article is built, not rebuilt.
- **Restore the previous wiki…** (there once an archive exists) lists the archived wikis with their dates and number of articles. **Restore** puts one back; the wiki as it is now is archived first, so you can come back to it the same way. It is refused while the wiki is rebuilding or updating.

Agents can do the same when you ask them ("Rebuild this project's wiki from its sources"): they use the same steps, and the app asks you on a card first.

## A project's Memory tab

Open [Projects](/projects), pick a project and open its **Memory** tab. It replaces the Knowledge and LLM Wiki tabs of earlier versions, and its count adds up the notes, articles and documents. A switch at the top moves between three parts:

- **Notes**: the project's memory notes, as in Settings → Memory, with **Add a note** and a search field, and the folder they belong to.
- **Wiki**: the project's articles and sources. Once the wiki has areas, the articles are grouped by area: each area's name opens its hub, a line says what belongs in it, and the arrow beside it folds it away; sub-areas sit under their area, and **Other** comes last (see [Areas and hubs](#areas-and-hubs)). Select an article to read it, follow its links, and open its listed sources. An article that was merged into another opens that one. The **⋯** menu beside the buttons has **Update now**, **Rebuild from sources…** (**Build from history…** while the wiki is empty) and **Restore the previous wiki…** (see [Update, rebuild or restore the wiki](#update-rebuild-or-restore-the-wiki)). It is read-only here: agents write it. If wiki memory is off, the tab says so and has **Open its Settings**; if nothing is in it yet, "Nothing here yet. Agents add to it as they work, and new documents update it." The wiki's folder is shown under the list.
- **Documents**: the project's own documents and whether its sessions search the shared knowledge too, as before (see [Give a project documents of its own](/guide/projects#give-a-project-documents-of-its-own)). A line says when new and changed documents also update the project's notes and wiki, and another when the project has more documents than its wiki reads: "Its wiki reads 100 of its 240 documents: the pinned, the most used and the newest. Agents search all of them." (see [When a project has too many documents](#when-a-project-has-too-many-documents)). The Wiki part says that too, under the articles. In the list of a knowledge base's documents, a pinned document shows a pin, and each row's **More** menu has **Read into wiki memory** or **Don’t read into wiki memory**.

Under the articles, **Recent updates** lists what new and changed documents, the project's conversations, its commits and its code did lately, newest first, up to 20. Each row says what it came from: the document; **Session:** and the session's title (click it to open the session); **Commits:** and the range read; **Code changes**, for articles brought up to date after the project's files changed (see [Articles tied to the code](#articles-tied-to-the-code)); or **Overview:** and a folder's name, for an overview of documents the wiki does not read; **Areas:** and what changed when the areas were reorganised ("Split Crawling into Fetching and Index; moved 6 articles"), with the articles it moved; **Merged:** and which article went into which; or **Rebuild:** and how far a rebuild has got, then what it made. Then how long ago, the articles it added or changed, how many notes it added, or "Nothing to add", or why it did nothing or what went wrong. Click an article to read it.

The Overview tab's **Memory** card sums it up ("12 notes · 8 articles · 5 documents"). On a phone, the switch is the same and the lists stack.

## What agents can do with it

In a project, an agent gets a few tools for the project's wiki, and nothing for another:

- It can see where the wiki is and whether anything is in it, and read an article or a source. It is told which articles bear on what you ask without asking (see [How it sits beside notes and documents](#how-it-sits-beside-notes-and-documents)).
- It can keep a text or a document as a source (a document file up to 20 MiB, kept as it is, with its text next to it; the text may be incomplete) and write articles, `index.md` and `log.md`. To change a file it must have read it first, so two writers cannot overwrite each other. It cannot write a source after it is kept.
- It can check the articles: that the sources they list and the links between them exist.
- It can name "the shared wiki" to work in that one instead, when it is on.
- It finds what is in a wiki with its ordinary document search, so an answer can cite the article, and with the wiki search, which is more flexible (see below).
- It can read just one section of an article (by its heading) or a range of lines, instead of the whole file, with the lines numbered. A page that was folded into another one (a redirect) is followed to where it went.
- It can read another project's wiki, only to read, by that project's name: its articles, sources and where it is. A project that keeps itself to itself (its **Searchable from other projects** switch is off) or has wiki memory off refuses. Writing stays with each project's own agents: no tool writes in another project's wiki, and the plan and lesson tools only work in the project they are in. The search across your projects (see [Search beyond one project](/guide/memory#search-beyond-one-project)) names these articles, each with the project it is in.

**Searching the wiki.** An agent has a search made for the wiki alone, `wiki_search`, and each result says exactly where it is: the article, the section and its lines, and how to open it with the wiki tool. It can search in four ways: by **words and meaning** together (the default, the way document search works), by **words** alone, for the **exact text** as written (upper and lower case aside unless it asks otherwise, with the lines around each match, like `grep`) or for a **pattern** (a regular expression, one line at a time; a pattern that is not valid is refused with the reason). It can look for areas, whole articles or single sections; keep to one area (by its name, its id or an old name, sub-areas included) or to a folder or a name pattern such as `wiki/crawl-*`; and look in the articles (the default), in the sources kept in `raw/` or in the plans and evidence in `output/`. With **project** it searches another project's wiki or all of them, only those that are open to other projects, as the search across your projects allows. An answer holds at most 10,000 characters and at most 50 results. It never looks in hidden folders, at retired articles or at a page that only points to another one. It is only for reading, so it needs no OK from you, and like the other wiki tools it is not there in a Confidential session or in a chat with wiki memory off.

**Plans.** Ask an agent to adopt a plan (one you give it, or a document already in the wiki) and it shows you the exact text, where it goes (`output/projects/<name>/plan.md` in the project's wiki), its execution register (what is implemented, deployed and accepted, each its own state, with evidence or what blocks it) and the plans already there, and waits for your OK. To change a plan it shows the old and the new text and the reason, and waits again; the old text is first kept in a protected snapshot, so every earlier revision stays, and the plan's identity and its work item numbers stay. Approving a plan or a change to one never starts carrying it out. No other tool can write in `output/projects/`, whatever a file is called: plans change only this way. What was done, deployed or accepted is recorded in `output/evidence/<plan>/` with the ordinary wiki write, and nothing there is ever a plan. A plan is shown read-only on the Memory tab with the articles and sources.

What it cannot do: write in another project's wiki; read or write hidden files and folders, Git and archive folders, retired or archived articles, or a link that leads out of the wiki; keep text with passwords or keys in it; or use wiki memory at all in a Confidential session. Ask the agent to check the wiki and it reports a basic problem list; it does not change the files for that.

## Checkpoints and lessons learned

With wiki memory and memory both on, Hydor's Custom agent can save a checkpoint of a session when it compacts its own context, to carry on from afterwards. There is one checkpoint per session, written over each time, in the shared wiki folder. It holds a redacted summary or only the event: never a full transcript. For Claude Code and Codex, Hydor attempts a checkpoint when you start compaction from Hydor and, when its native hook is registered, before automatic compaction. Existing or hidden hooks, plugins, policy or unavailable hook discovery can prevent registration. Just before an automatic compaction, the last messages of the session go to the helper model to write the summary, which can take up to about 14 seconds; the compaction waits for it, and goes on without a checkpoint when it takes longer. A checkpoint can contain only metadata when no summary is available. For Codex, Hydor trusts only its own hook (an exact command it made itself, handed to that session alone); a hook of yours is never trusted this way, and Hydor looks for it once for each Codex version rather than at every start. Check the session details to see its latest outcome. A failed checkpoint does not stop compaction. Turning memory off for a session, or all of it, prevents checkpoints and their use; existing ones stay.

Hydor uses the checkpoint to carry a session on. When you resume a Claude Code or Codex session after its context was condensed, the first message it gets carries the checkpoint: where to read it, and its summary, up to 3,000 characters, once. Custom, after it condenses its own conversation, is given the checkpoint with memory read again for your latest message; its share is sized to its model: at most 8% of the model's context, and never more than 16,000 characters, with where to read the rest (see [What an agent starts with](/guide/memory#what-an-agent-starts-with)).

Ask an agent to preview lessons learned from a session: it writes nothing. It uses the indexed messages, so the latest may be missing. Saving selected lessons asks for your confirmation first.

With **Auto lessons learned** on for a chat, the helper looks at each turn's last exchange (about once a minute at most, never in a Confidential chat or with memory off) and, when it finds something worth keeping, adds a suggestion as a card in the chat: the lessons, with their evidence and the place they would go. Nothing is written until you keep it there, and what you keep is exactly what you saw; or you dismiss it. Agents cannot keep or dismiss a suggestion for you, and they ask you before they change either of a chat's two switches. The switch is off at first: turn it on for every chat in Settings, or for one chat in its options.

## Move the wiki folder

When the current **Wiki folder** has files, changing it opens a review. You can leave them where they are, or move them. If the new folder has files too, you can combine the two folders or replace the destination, and for files in both, keep the source's, the destination's or the older one by modification time. Hydor keeps a complete copy of each original folder as a hidden backup beside it and shows where. The old folder is kept, not deleted. Pause other programs that write to either folder meanwhile, and update any other tool set to the old path. Moving the shared wiki's folder moves the project wikis kept in it. Changing the folder inside each project does not move any project's files.

## Ask an agent

- "Is wiki memory on for this project? Turn it off for the Taxes 2026 project only."
- "Turn wiki memory on for every project except my thesis."
- "Keep each project's wiki in its own folder, in `.wiki`, and leave it out of Git."
- "Adopt this plan into the project's wiki."
- "Move the wiki folder to ~/Notes/wiki."
- "Stop reading my new documents into memory."
- "Why is this project's wiki not reading my documents? How many does it have?"
- "Let the wiki read up to 300 documents in the Papers project, and keep the 100 for the others."
- "Why is this project's wiki still empty?"
- "What did my last documents add to this project's wiki?"
- "Which conversations did this project's wiki learn from this week?"
- "Add this paper to the project's wiki, then write what it says about retrieval in an article."
- "Check this project's wiki for broken links and missing sources."
- "Search the wiki for the exact text `NATIVE_INDEX_DEDUP` and show me the lines around it."
- "Which sections of the wiki talk about the crawl memory guard? Read the first one."
- "Find every article in the Evaluation area that mentions leakage."
- "Look in the sources for where we first mentioned the 260 GiB budget."
- "Search all my projects' wikis for how deploys are done."
- "Pin the Methods paper so the wiki always reads it."
- "Why does the wiki read 100 of my 240 documents? Which ones does it read?"
- "Which articles in this project's wiki are marked out of date, and why?"
- "What did the wiki learn from this project's commits this week?"
- "Show me what changed in the architecture article when it was revised, and what it replaced."
- "Preview the lessons learned in this session, and save the first two."
- "Reorganise this project's wiki now."
- "What areas does this project's wiki have, and what is still in Other?"
- "Read me the hub of the Crawling area."
- "Which articles were merged in this project's wiki this week, and where did they go?"
- "Update this project's wiki now."
- "What would it cost to rebuild this project's wiki from its sources?"
- "Rebuild the wiki from its sources, then tell me what changed."
- "Build this project's wiki from its history."
- "Stop the wiki job that is running, and continue it tomorrow."
- "Put back the wiki as it was before the rebuild."
