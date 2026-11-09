# Memory

Agents in Hydor remember what matters from one session to the next: facts about you, about each project, and where a task stands, and a profile of you that every agent starts with. This topic covers what they keep and when, your profile, what an agent starts with, how to see, correct or undo what was saved, and everything in Settings → Memory, including search by meaning and the tidy-up that runs by itself. Use it so agents stop asking the same things twice, and so you always know what they know.

![Settings → Memory: what agents remember about you and your projects](images/memory.webp)

## What agents remember

Memory is a set of short notes, called memory notes. Each is a sentence or two, at most 500 characters. Every agent the app runs shares them: Claude Code, Codex, Custom and the agents that speak ACP, such as Gemini CLI. Claude Code's and Codex's own memories stay off in the sessions the app runs, so these notes are the one memory they all share, and you can see and undo everything they keep. Each note belongs to one of three places:

- **About you**: lasting facts and preferences about you ("Prefers metric units", "Likes short answers", "Works mostly in Python"). Every session gets these.
- **A project**: facts about one project, such as its conventions, the commands that build and test it, where things are, and decisions made. The project is the folder a session works in: the top folder of its Git repository when it is in one, or the folder itself otherwise. A worktree (a separate copy of a repository on its own branch) shares its main repository's notes, so the sessions on every branch see the same ones. A session in your home folder itself has no project notes: it gets only what is about you and its own.
- **A session**: where one task stands, for that session to pick up when it goes on. These go when the session is deleted.

A session sees and changes only three sets of notes: the ones about you, its own project's, and its own. An agent working in one project never sees another project's notes. The sessions of a [project](/guide/projects) all work in the project's folder, so they share its project notes. A task that gets a new folder of its own (see [Agents](/guide/agents)) has that folder as its project.

Once a place has many notes, more kinds of entry appear there: **topics**, each summing up a group of related notes, and for a project a **profile**, a short summary agents always get first. The tidy-up writes them (see [Tidy up automatically](/guide/memory#tidy-up-automatically)), and a short title for each note and topic, for the index agents start with. Your own profile is another thing: you and your agents write it (see [Your profile](/guide/memory#your-profile)).

Memory works in the sessions this app runs, not in ones it only lists, such as a session open in a terminal or VS Code.

## How notes get written

Agents save notes in two cases: when you ask ("Remember that I'm vegetarian", "Remember that the test server is test.example.com"), or when they learn something lasting that a later session could not find out by itself: what you want, a decision and why, a pitfall, a rule learned the hard way. Nothing is written by itself after a reply: notes come from agents choosing to save them, from notes you write or edit yourself, and from the tidy-up, which reworks notes already kept and, with [Learn from conversations](/guide/memory#learn-from-conversations) on, keeps at most three things a day that no agent saved.

- **The agent picks the place**: about you, this project, or this session.
- **One fact per note, written to be found again**: each note says one thing in a sentence that stands on its own, naming what it is about (the project, the tool, the person or the place), so that a later request in other words still finds it. What every agent should always know about you goes in your profile instead. Not what a project's files or history already say: where code is and what it does change, and the files tell it anyway.
- **How it is known**: the agent says how it knows what it saves: you said so, it checked (a test, a command's output, a file), or it is its own conclusion, not checked yet. Later agents are told which notes are not checked yet, and the tidy-up checks those first. A note you write yourself counts as said by you.
- **Some notes are true only until a date**: a trip, a deadline, a visit. The agent gives such a note an end date. From then on agents no longer get it, and within the hour it moves to Deleted notes, where you can restore it for 30 days.
- **Corrections replace the old note**: to update a note, the agent rewrites it under its number instead of adding another. A note with the same text is not saved twice. With [search by meaning](/guide/memory#search-by-meaning) on, neither is a note that says the same thing in other words.
- **Agents forget, too**: an agent removes a note when it turns out wrong or out of date, or when you ask ("Forget my old address").
- **Never secrets**: a note that seems to hold a password, a key, a token or a card number is refused. So is text that reads like instructions to an agent ("ignore the previous instructions…"), since it would reach every later session.

You can also write a note yourself with **Add a note** in [Settings → Memory](/settings?s=memory&find=Add%20a%20note), and edit, date and delete every note there.

## Your profile

Besides notes, memory keeps one profile of you: who you are and what you do, what you use, how you like answers, and what to avoid. While memory is on, every agent gets it once, at the start of a session, right after your [Agent Guidelines](/guide/guidelines), and lets it shape how it works with you; your guidelines and what you say in a session still come first. Notes hold what matters now and then; the profile holds what every agent should always know.

- **Agents keep it current.** When something you say shows something lasting that will help every agent serve you better, such as your work, the tools you use or how you like replies, the agent rewrites the profile with it. Most messages change nothing. The change shows under its reply as **Your profile**, with undo (see [See what an agent saved after a reply](/guide/memory#see-what-an-agent-saved-after-a-reply)). Agents never put secrets in it, can't clear it, and can't overwrite a change made since their session started: they are shown the profile as it is now, and try again.
- **Write it yourself.** In [Settings → Memory](/settings?s=memory&find=Your%20profile), **Your profile** shows it with its lines. **Edit** (or **Write it**, while there is none) opens it: Enter starts a new line, Ctrl+Enter (⌘+Enter on a Mac) or **Save** saves it, and Escape or **Cancel** leaves it as it was. The count under the text says how many words it has, of how many it may have.
- **How long it may be.** **Profile length**, under it, is the most words it may have: 250, 500, 1,000 (the usual) or 2,000. Agents keep within it. A longer profile, saved by you or left over when you pick a shorter length, is kept as written while the helper model shortens it to fit in the background ("Shortening it to fit 1,000 words…"); the shorter version shows as changed **by the helper**. When the helper can't, the reason shows with **Try again**.
- **Under it**: how many words it has, and when it last changed and by whom: **by you**, **by an agent** (with the session it came from) or **by the helper**. Its **⋯** (Profile menu) has **History of changes**, every version with who wrote it and why, and **Clear profile**, which asks first. A cleared profile stays under Deleted notes for 30 days, where **Restore** brings it back.

## See what an agent saved after a reply

When an agent saves, changes or removes notes during a turn, a chip appears under its reply, such as **Memory · 1 added, 1 updated**. It counts the changes still in effect (added, updated, removed); when every one was undone, it says **undone**. Several changes in one turn show as one chip, and a note changed several times shows as one change, from what it said before to what it says after.

Click the chip to open it. Each change shows:

- A badge: **Added**, **Updated**, **Removed**, or **Undone**.
- Where the note belongs (**About you**, **Project ·** and the folder's name, **This session**, or **Another session**; **Your profile** for a change to your profile), "saved by the agent", and how many changes it went through in that turn.
- The text. For an update, the words taken out are struck through and the words put in are marked. When most of it was rewritten, the old text shows struck through above the new.
- **Changed again since**, when the note was edited after this turn: click it to see what it says now.
- A last line with the reason the agent gave, if any, and **Deleted since** or **No longer kept** when the note was deleted or erased after this turn.

The buttons on each change:

- **Undo this change** (or **Undo these changes**): an added note goes, an updated note gets its old text back, a removed note comes back.
- **Edit**: change the text in place. Enter saves, Shift+Enter starts a new line, Escape cancels. For your profile, it opens Settings → Memory, where the profile has room for its lines.
- **Delete**: removes the note. It stays under Deleted in Settings for 30 days. Your profile has no Delete here: clear it in Settings.
- **Restore**: brings back a note that was deleted since.

The **⋯** (Memory options) at the top of the open chip has **Memory for this session**, which turns memory off or on for this session, and **All memory**, which opens Settings → Memory. Click the chip's top row to close it.

## What an agent starts with

Each agent starts with a short explanation of memory, your profile, the notes that bear on your request and an index of the rest, once, in the instructions it starts with:

- **When**: Claude Code and Codex get them when the session starts or is resumed. Agents that speak ACP get them with your first message. [Custom](/guide/custom) gets them with your first message and keeps them while it works: only when it condenses a long conversation does it read memory again, for your latest message. A session that goes on within the hour (after the app restarts, say) gets the same again, so the model's provider can reuse what it kept of the conversation, which is quicker and costs less.
- **Which**: your profile (see [Your profile](/guide/memory#your-profile)); this project's profile, when it has one; this session's own notes, when the session goes on; every note of a place that has only a few (about you, or a project, with no topics yet); and from a bigger place, the notes and topics that bear on what you asked, at most 10 unless you change it with [Notes each agent starts with](/settings?s=memory&find=Notes%20each%20agent%20starts%20with). Nothing is given just to fill the room: when fewer bear on it, the agent gets fewer. A note that a topic already given sums up is left out.
- **The index**: for each bigger place, the agent also gets the titles of the notes and topics it was not given, so it knows what is kept and looks it up when it needs it; a topic stands for the notes it sums up. The tidy-up writes the titles (see [Tidy up automatically](/guide/memory#tidy-up-automatically)); until then a note's first words stand in.
- **How notes are found**: by hybrid search. One list ranks notes by their words, rare words counting most; with search by meaning on, another ranks them by what they mean, so "keep it brief" finds "Likes short answers". The two lists are merged by rank, and notes agents looked up lately and often get a little more weight. A note counts as bearing on your request only when it stands out from the rest for that request: some requests are alike to every note and some to almost none, so each note is measured against how alike the request is to all of them. With search by meaning on, a session that starts while its model is not running waits a few seconds for it, so your first message is matched by meaning too.
- **Skills that fit**: the same kind of search names the skills that fit your first message, when any clearly do (see [Skills](/guide/skills#skills-that-fit-a-new-session)).
- **How it treats them**: as background. The agent is told the notes may be out of date, which of them are not checked yet, that what you say now always comes first, and not to mention them unless they help.

The notes an agent got because they bear on your request count as **needed**. Settings shows how often each note was needed and when last, and suggests removing the ones no agent has needed for months. Which notes come first another time weighs only what agents looked up themselves: being given a note at the start does not make it come first again.

Agents also get tools for memory: save a note (in a place, with how it is known and an end date if it has one), correct a note, forget one, look notes up by words and meaning (including the notes a topic stands for), update your profile, and search and read past conversations (see [Search earlier sessions](/guide/memory#search-earlier-sessions)). A note found with a lookup counts as needed too.

## Turn memory off for one session

Start a session without memory from the start page:

1. Under the message box, open **Options**.
2. Open **Memory** and pick **Off for this session** ("Starts fresh and keeps nothing from it"). **On** ("Uses and adds to what agents remember") is the usual.
3. The Options chip now names **No memory**. The start page keeps this pick for your next sessions too, until you set it back to On.

**What agents remember**, at the bottom of that menu, opens Settings → Memory. On a phone, these menus open as sheets from the bottom of the screen. The Memory option is not there while memory is off for all sessions.

For a session that is already going, open the session's menu (⋯) → **Session settings** → **Memory**. Its hint says **On** or **Off**; click it to switch. The same switch is in the memory chip's ⋯ as **Memory for this session**. While memory is off for all sessions, both are greyed out with the hint **Off for all**.

With memory off, a session "neither reads nor writes notes":

- Its agent gets no notes, no profile and no memory tools, and nothing from the session is saved.
- Agents in other sessions can't find it when they search past conversations, and can't read it.

A scheduled task's editor has the same Memory chip, so its runs can work without memory (see [Scheduled tasks](/guide/tasks)). Runs started from an app's public page always have memory off (see [Apps](/guide/apps)).

## Turn memory off for all sessions

Turn off the **Memory** switch at the top of [Settings → Memory](/settings?s=memory&find=Memory). The line under it says what it does: "Agents start with what earlier sessions kept about you and your projects, and save what they learn." Once it is off: "Off: agents get no notes and save nothing new. Your notes stay."

While it is off:

- No agent gets notes, your profile or memory tools, and nothing is saved.
- Your notes stay. Turn the switch back on and agents get them again.
- The Memory option leaves the start page, and the search box (Ctrl+K) stops showing notes.
- **Search by meaning**, **Tidy up automatically** and **Learn from conversations** are greyed out, and the tidy-up report and **Tidy up now** are hidden.
- Above the notes, a line says "Memory is off: agents don’t get these notes, and save no new ones."

## Settings → Memory

Everything about memory is in [Settings → Capabilities → Memory](/settings?s=memory): "What agents remember about you, your projects and each session, and when it was written". At the top are the switches (**Memory**, **Search by meaning**, **Tidy up automatically**, **Learn from conversations**) and **Notes each agent starts with**, each with a line on what it does, and the last tidy-up. Below them are **Your profile** (see [Your profile](/guide/memory#your-profile)) and **Notes**, the list of every note. On a phone, Settings opens as a list: tap **Memory** to open it on its own page. There the notes take the screen's whole width, and every menu on the page opens as a sheet from the bottom of the screen.

### Search by meaning

[Search by meaning](/settings?s=memory&find=Search%20by%20meaning) "finds notes, what the Library holds and more by what they mean as well as by their words, with a model that runs on this computer": LightOn's mDenseOn, which reads nine languages. It is on unless you turn it off, so notes and the Library are found by hybrid search: by their words and by what they mean, the two lists merged by rank. The model runs here, so your notes aren't sent to a service to be searched. With it off, notes are found by their words alone. With it on:

- Agents start with the notes that bear on your request even when the notes use other words than you did.
- Agents looking notes up, and the search field in the Notes list, find them by meaning as well as by words.
- A note that says the same as one already kept, in other words, isn't saved again, and the tidy-up groups notes by meaning.
- The Library's search finds pages, documents, pictures and the rest by what their titles and descriptions mean (see [Find your pages](/guide/library#find-your-pages)).
- The search box (Ctrl+K) finds pages, settings, sessions, apps and more by what they mean, and knowledge bases are searched by meaning too (see [Projects and knowledge](/guide/projects)).

**How it gets ready**, once:

1. A minute after the app first starts, the app sets up a private Python environment in its data folder, with PyTorch (its smaller CPU build when there is no NVIDIA GPU; on a Mac its usual build, which uses the Mac's GPU) and Transformers; if you turned it off, it does this as soon as you turn **Search by meaning** back on (memory itself must be on). This takes a few minutes, and the line under the switch shows each step, such as "Making a private Python environment" and "Installing PyTorch (CPU build): a few minutes".
2. The first time the model starts, it downloads: "Downloading the model (1.2 GB, once)". After that, starting says "Loading the model".
3. Every note gets its vector (the numbers search by meaning compares) in the background, and so does everything in the Library. The line counts the notes: "all 120 notes found by meaning", or "80 of 120 notes found by meaning (the rest soon)".

**Turn it off** with the same switch: the model stops, and everything is found by its words alone. A computer short of disk space or memory can do without it.

**What it needs**:

- Python 3.10 or newer on this computer, unless the uv tool is installed, which gets its own. If neither is there, setting up stops and says so, with how to install Python: on Debian or Ubuntu `sudo apt install python3 python3-venv`, on a Mac from python.org or with Homebrew (`brew install python`). On a Mac, Apple's own Python counts only when its developer tools are installed, so the app never asks you to install them.
- Disk space: PyTorch takes about 1 GB, or about 5 GB with an NVIDIA GPU, and the model 1.2 GB. Setting up stops with "Not enough disk space" when less than about 3 GB is free (9 GB with an NVIDIA GPU).
- An internet connection, once, for the downloads.
- Free memory to start the model: about 2.5 GB on the CPU or a Mac's GPU (which shares the computer's memory), or 1.5 GB with an NVIDIA GPU. Until there is enough, it says "Waiting for memory" and notes are found by their words.

**Where it runs**: under the switch, pick **Automatic** or **CPU only**.

- **Automatic** runs it on a GPU when there is one: the NVIDIA GPU with the most free memory, when one has more than 2 GB free, or a Mac's own GPU (Apple silicon); otherwise on the CPU. On an NVIDIA GPU it loads at once and stays loaded; on a Mac's GPU, which shares the computer's memory, it starts when needed and stops after a few idle minutes, as on the CPU. The line says where it runs ("Loaded on" and the GPU's name). A GPU that fails its first try leaves it on the CPU, and the line says why.
- **CPU only** keeps it off the GPUs, to leave them to other work, such as models you run on this computer.
- On the CPU it starts only when needed, takes about 1.4 GB of memory while it runs, and stops after a few idle minutes: "Starts on the CPU when needed, and stops after a few idle minutes". Starting takes a few seconds, so it starts as soon as you begin a message on the start page (or in a session whose agent stopped), and shortly before a scheduled task runs: a new session's notes and skills are then found by meaning too. A session never waits for it to load: one that starts before it is up gets its notes and skills by their words. A computer with 8 GB of memory is enough.

When something goes wrong, the line turns into a warning with the reason (for example "The model took too long to load") and a **Try again** button. Turning the switch off stops the model; what was set up stays, so turning it on again is quick.

### Notes each agent starts with

[Notes each agent starts with](/settings?s=memory&find=Notes%20each%20agent%20starts%20with) sets how many notes and topics about you and the project an agent starts with at most, besides your profile: **5**, **10** (the usual), **20** or **40**. The line under it says what they are: "Besides your profile: at most this many of the notes about you and the project that bear on what you ask, found by their words and, with search by meaning on, by what they mean, and the titles of the rest, which agents look up when they need them. A place with only a few notes is given whole." More lets more of what bears on a request in from the start, at the cost of more to read in every session; fewer keeps what they start with short. This session's own notes come besides these. See [What an agent starts with](/guide/memory#what-an-agent-starts-with).

### Tidy up automatically

[Tidy up automatically](/settings?s=memory&find=Tidy%20up%20automatically) keeps memory short and current. It is on by default. The helper model does the work: the small model the app uses for jobs beside sessions, picked in [Settings → Models → Helper model](/settings?s=models&find=Helper%20model) (see [Agents, accounts and models](/guide/agents-models)). It reads notes only, unless [Learn from conversations](/guide/memory#learn-from-conversations) is on: then it first reads the conversations since the last tidy-up. It leaves sessions' own notes alone: they are few, and go with their session.

Each tidy-up does these things:

1. **Near-copies, wrong notes, end dates.** Each note added or changed since the last tidy-up is compared with the closest notes in the same place (by meaning when search by meaning is on, else by words). Notes that say the same thing, or where one updates another, are merged into one note that keeps every fact still true; where they disagree, the newer one wins, and the merged note must be shorter than the notes it joins. A note that a newer one shows to be wrong is deleted. A note true only until a date it names ("until Friday", "the trip in March") gets that end date. At most 200 notes are checked in one tidy-up; the rest wait for the next.
2. **Topics, and a project's profile.** Once a place's notes take more than about 2,400 characters, related notes are summed up in topics, each covering a handful of notes (up to 12). Agents then get the topic, and can still look up the notes it stands for. A project also gets a short profile (at most 700 characters) that agents always get first: what it is, how to build, test and run it, and its pitfalls. A topic or profile is written again when what it sums up changes. Your own profile is left to you and your agents (see [Your profile](/guide/memory#your-profile)).
3. **Titles.** Each note and topic about you and your projects gets a title of a few words, for the index agents start with. New notes get theirs within the hour, and a note whose text changes gets a new one.

It runs by itself about once a day, whenever the app is on, so a computer that sleeps at night gets it too: once 20 hours have passed since the last tidy-up, there is something new (a message you wrote, or a note you or an agent changed) and you have paused for ten minutes, so it never runs while you type. With nothing new it doesn't run at all. Every change it makes goes in the note's history as made by "the helper", and each change of the last tidy-up can be undone (below).

### Learn from conversations

[Learn from conversations](/settings?s=memory&find=Learn%20from%20conversations) is on by default: "With the tidy-up, the helper model reads the conversations since the last one (not those with memory off): it corrects the notes they show wrong, checks the notes not checked yet, and keeps at most a few things a day that no agent saved." It is the first part of each tidy-up, whether it runs by itself or with **Tidy up now**.

Agents save notes in the moment, before they know what comes next, so a note can be wrong from the start or go out of date, and some lasting things are never written down. Project by project, the helper model reads what you wrote and the last reply of each turn (never the files you attached, text you pasted, the steps in between, tool output or web pages), with the notes those conversations bear on, and:

- **corrects** a note a conversation shows wrong or out of date, or removes it when nothing true is left;
- **checks** a note not checked yet that a conversation shows true; for such a note it also reads the conversation that wrote it;
- **keeps** what a later session would need and could not find in the project's files: something you want or corrected, a decision and why, a pitfall. At most three a day, so memory stays small; the tidy-up then merges them with near-copies, as every new note.

A project note that names a file no longer in the project is pointed out to it, so it can correct the note.

It never reads sessions with memory off (confidential sessions have it off), child sessions (an agent wrote their requests) or scheduled runs, and the first time it reads back three days. Each change shows in the tidy-up's list with the conversation it came from, and can be undone there (below). Turn the switch off and the tidy-up reads notes only.

### Tidy up now and undo its changes

Under **Tidy up automatically**, a line reports the last tidy-up:

- "Not tidied up yet."
- "Tidying up…" while it runs.
- "Last tidied up 3h ago: 2 added, 1 updated, 3 removed." (what it changed), or "nothing to change (14 notes looked at)."
- "It read 12 conversations.", when [Learn from conversations](/guide/memory#learn-from-conversations) read some; "Learning from conversations stopped:" and why, when that part failed (the rest of the tidy-up still ran).
- When the latest found nothing but an earlier one did: "nothing to change. Before that, 2d ago:" and that earlier tidy-up's changes. They stay listed, and undoable, until a tidy-up changes something again.
- When it failed, the reason, such as the helper model not answering.

**What changed (N)** opens the list of those changes. Each shows a badge (Added, Updated, Removed, Ends, No end date, Checked, or Undone), **Topic** or **Profile** when it is one, the place and the reason ("Merged into #12", "Sums up 5 related notes", "Learned from “Upload page”"), and the text, the old struck through above the new. **Open the conversation** opens the conversation a change was learned from. **Undo this change** reverses one: what it added goes, what it changed gets its old text back, what it deleted comes back, an end date it set is taken away, and a note it checked is not checked again. **Hide** closes the list.

[Tidy up now](/settings?s=memory&find=Tidy%20up%20now) runs a tidy-up at once, whether or not **Tidy up automatically** is on: "Tidying up: this takes a minute or two". It needs memory on.

### The Notes list

[Notes](/settings?s=memory&find=Notes) lists every note kept, with the count under its title: "42 kept: 12 about you, 25 in projects, 5 in sessions". **Add a note**, beside the title, writes one of your own (below). Your profile is not among them, nor in the counts: it has its own place above.

- **Search**: the field at the top ("Search the notes", or "Search the notes, by words or meaning" when search by meaning is ready) finds notes with every word you type, the last one as the start of a word, and with search by meaning on, notes that mean the same. The best come first. Escape clears it.
- **Tabs**: **All**, **About you**, **Projects** and **Sessions**. Where there is room, each shows its count.
- **Groups**: notes come grouped by place: About you first, then each project (its folder's name and path), then the sessions' notes together, each naming its session (click the name to open the session). Each group shows how many notes it holds. A project's profile comes first, then its topics, then its notes, newest change first; when you search, the best match comes first. Under **All**, each group shows its first three notes, with **Show 12 more** (or however many there are) under them, and **Show fewer** to fold them again; in one place's tab, in a search and in the lists to review, the first ten.
- When some notes have gone unused for months, a line above the list says how many, with **Review** (see [Notes no agent needed lately](/guide/memory#notes-no-agent-needed-lately)).
- At the bottom of the list: **Deleted notes**, **Export** and **Clear all…** (below).

Each note shows the first two lines of its text (with a **Topic** or **Profile** badge when it is one) and a line under it. Click a note, or press Enter on it, to read it whole, with who wrote it and where; click it again to fold it. The line under it says:

- **Added** and when, or **Changed** and when if it changed since, and, once the note is open, who did it: **by you**, **by an agent** or **by the helper** (the tidy-up). Point at the time to see the exact dates.
- Once the note is open, **in** the session it came from, which you can click to open.
- For a topic or profile, once it is open, how many notes it **sums up**.
- How it is known: **you said so**, **checked** or **not checked yet** (point at it for what that means). Notes from before this was kept say nothing.
- **needed** once or N times: how often an agent got it as bearing on a request, or found it by looking it up. Point at it to see when last.
- **until** a date, when it has an end date.

The **⋯** button beside each note (Note menu) holds what you can do with it. On a phone it opens as a sheet from the bottom of the screen, with the note's first words at the top.

- **Edit**: change the text in place, up to 500 characters (800 for a topic or profile). Enter saves, Shift+Enter starts a new line, Escape cancels. Text that seems to hold a secret can't be saved.
- **End date** (with the date beside it, when the note has one): "True until" a date, then **Save**. The note stops being true at the end of that day: from tomorrow up to five years ahead. **No end date** takes an end date away.
- **What it sums up** (topics and profiles only): the notes it stands for, deleted ones struck through.
- **History of changes**: every step in the note's life, newest first: Added, Changed (old text → new text), Deleted, Restored, End date ("Until" a date, or "Taken away"), How it is known, each with when, by whom, in which session, and why.
- **Delete**: "Deleted. It stays under Deleted notes for 30 days."

What opens under a note (its end date, its history, or what it sums up) closes with its **×**, or by picking the same item in the menu again.

### Add a note

[Add a note](/settings?s=memory&find=Add%20a%20note) opens a field at the top of the list: "What should agents remember? Say, “I prefer short answers”." Write the note, then **Save** or press Enter. Shift+Enter starts a new line; Escape or **Cancel** drops it.

- **Where it belongs**: a note is about you unless you pick a project. The chip before the buttons (**About you**) lists the projects memory has notes for; a note about a project reaches only the sessions that work in it. With no project notes yet, the chip is not there and the note is about you.
- The same rules as for agents' notes: at most 500 characters, kept as one paragraph, and never anything that seems to hold a password, a key, a token or a card number.
- The note shows **by you**. Sessions get it as they start (Custom before its next turn), like every note.

### Notes no agent needed lately

When some notes have gone unused for four months, a line above the list says how many ("One note no agent has needed for four months"). **Review** opens them: "No agent has needed these for four months: not changed, not found, not given as bearing on a request. Keep what still matters; delete the rest."

Only notes about you and projects are suggested, never topics, profiles, notes with an end date, or sessions' notes. **Keep it** counts the note as needed today, so it leaves the list. **Delete** removes it. The list shows up to 100, the longest unneeded first. **All notes**, at the top, goes back.

### Deleted notes

[Deleted notes](/settings?s=memory&find=Deleted%20notes), at the bottom of the list, opens the notes deleted by you, an agent, the tidy-up, or their end date: "Deleted notes stay here for 30 days, then go for good." A session's notes go for good soon after the session itself is deleted. The search field finds deleted notes by their words, and **All notes**, at the top, goes back.

- **Restore** brings a note back. A note whose end date had passed comes back without it. A cleared profile shows here as **Your profile**: restored, it is your profile again, in place of one written since.
- The **⋯** menu has the note's **History of changes**, and **Erase for good**, which asks "Erase this note for good?" ("It goes with its history, and cannot come back.") and then removes it at once.

### Export your notes

[Export](/settings?s=memory&find=Export), at the bottom of the list, downloads every note kept. **Markdown** ("A list to read") is a readable list grouped by place, with when each note was added and changed and its end date. **JSON** ("With histories") has each note with its history and, for topics and profiles, the notes they sum up. Deleted notes are not included.

### Clear all…

[Clear all…](/settings?s=memory&find=Clear%20all%E2%80%A6), at the bottom of the list, deletes every note and its history. It asks first: "Clear all memory? Every note about you, your projects and your sessions goes, with its history. This cannot be undone; export first to keep a copy." Click **Clear all** to go ahead. The button is greyed out when there are no notes.

## Search earlier sessions

Besides notes, agents can look through your past conversations, with any agent. Ask "What did we decide about the venue last month?" and the agent searches what you and the agents wrote in every session for the words (all of them must match) and, with [search by meaning](/guide/memory#search-by-meaning) on, what you asked in each session by what it means, so a question in other words still finds it; also the commands run and the files changed when it needs to. Each message you write gets its vector in the background, a few at a time, the newest first: your own words, not the files you attached or text you pasted. Then it reads the session that holds the answer: its messages and the titles of the steps taken, oldest first.

Sessions with memory off are left out of this search and can't be read from another session. These tools exist only while memory is on for the session the agent works in.

You can search past sessions yourself with the search box (Ctrl+K, or ⌘K on a Mac). It finds sessions by title, messages that hold your words, and memory notes, under **Memory**. Opening a note "Opens Settings → Memory, at this note".

## Ask an agent

- "What do you remember about me? Delete anything about my old job."
- "Add to my profile that I'm a nurse and like answers in bullet points."
- "Show me my profile, and shorten it to about 300 words."
- "Start every session with 20 notes instead of 10."
- "Keep search by meaning on the CPU, so the graphics card stays free."
- "Tidy up memory now, then tell me what it merged."
- "Which notes has no agent needed for months? Delete the ones about the old website."
- "The note about my trip to Lisbon is only true until 12 May: give it that end date."
- "Which notes about this project are not checked yet? Check them against the code."
- "Stop learning from conversations, but keep the tidy-up."
- "Turn memory off for the session called Tax return."
