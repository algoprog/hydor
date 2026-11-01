# Spaces and knowledge

A space keeps one project together: its sessions, a folder for its files, documents of its own, what agents remember about it, the guidelines every agent in it follows and the assistant its sessions start as. Shared knowledge holds the documents and folders you add once so that every session can search them and cite the file and page it read. This topic covers making and using spaces and groups of spaces, and adding, searching and managing the documents agents search.

## What a space is

A space is a project with everything that belongs to it, like Projects in ChatGPT or Claude. A tax return, a thesis, a garden, a website: each can be a space. On the start page you pick a space by its name instead of a folder, and every session you start in it:

- **works in the space's folder**. The agent is told that this folder holds the space's files, and to keep what it makes for the space there;
- **follows the space's guidelines**: what every agent in the space should know, such as who the work is for, how to work and what to keep in mind (see [Agent Guidelines](/guide/guidelines));
- **starts as the space's assistant**, when the space has one (see [Assistants](/guide/assistants));
- **remembers what earlier sessions in the space learned**: agents keep notes about a project by its folder, so the sessions of a space share them (see [Memory](/guide/memory));
- **searches the space's own documents**, and the shared knowledge too unless the space turns that off (see [Which sessions search which knowledge](#which-sessions-search-which-knowledge)).

A space can also bring other spaces together. That is a **group**: see [Bring spaces together in a group](#bring-spaces-together-in-a-group).

## Open the Spaces page

Click **Spaces** among the tools at the bottom of the sidebar. On a phone, open the sidebar first: it is a drawer. You can also type "spaces" in the search box (Ctrl+K, or ⌘K on a Mac).

The page has two tabs:

- **All spaces**: your spaces, with **New space** at the top right.
- **Shared knowledge**: the documents every session can search (see [Shared knowledge: documents every session can search](#shared-knowledge-documents-every-session-can-search)).

Each space shows as a card:

- its mark: a rounded square in its colour with the first letter of its name (a group's mark has a second square behind it);
- its name, and under it what it is about, or its folder when it has no description. A group says "Brings together" and the names of its spaces;
- how many sessions it has, how many documents, and how long ago one of its sessions was last at work.

Click a card to open the space's own page. With no spaces yet, the page says what a space is for; click **New space** to make one.

## Make a space

1. On the [Spaces page](/spaces), click **New space**. The start page's folder menu has **New space** too (see [Start a session in a space](#start-a-session-in-a-space)).
2. Fill in the window:
   - **Name**: what you call the project, such as "Taxes 2026", "The garden" or "Thesis". Up to 60 characters. It is the only field you must fill in.
   - **What it is about**: an optional line, shown under the name. Up to 300 characters.
   - **Agent Guidelines: what every agent in it follows**, in the larger box: optional. What every agent in the space should know, such as who the work is for, how to work and what to keep in mind: "Amounts in EUR. I am self-employed in Greece." Up to 20,000 characters. See [Agent Guidelines](/guide/guidelines).
   - **Colour**: one of eight dots (amber, blue, green, pink, violet, teal, orange, slate). If you pick none, spaces take the colours in turn.
3. Click **Make the space**, or press Enter in the name field.

The app makes the space a folder of its own, named after it, in a **Spaces** folder where task folders go: "Taxes 2026" gets `~/Naget/Spaces/taxes-2026`, unless you moved task folders elsewhere (see [Move task folders](/guide/assistants#move-task-folders)). If that name is taken, it adds `-2`, `-3` and so on. Made from the Spaces page, the new space's page opens. Made from the start page, the new space is picked for the session you are about to start.

Two more things are set on the space's **Settings** tab afterwards: the assistant its sessions start as, and the spaces it brings together. Its documents go on its **Knowledge** tab.

### A space for a folder you already have

The **New space** window always makes a new folder. To make a space around a folder you already work in, such as a project on this computer, ask an agent: "Make a space called Shop for ~/code/shop". The app's API takes an existing folder for a new space; the window doesn't. A space's folder can't be changed once the space is made.

## Start a session in a space

There are two ways:

- **From the space**: on its page, click **New session**. The start page opens with the space picked, and with its assistant when it has one.
- **From the start page**: open the folder chip in the row under the message box. Its menu lists your spaces first, then the folder in use and the ones you used last, then **New task folder** and **New space**. Until you type, it shows the three spaces at work most recently (and the one picked, if it isn't among them). Type part of a name in the field at the top to find any space, or any folder. Each space shows its mark, its name and what it is about.

When you pick a space, the chip shows its mark and name instead of a folder, and the session will work in the space's folder. If the space starts its sessions as an assistant, the **Assistant** chip changes to it, with any agent, model and permissions that assistant suggests. You can still change any of them before you start. Then type your message and click **Start**.

The start page remembers the space for your next session, on any device you use. To work outside it again, pick a folder or **New task folder** in the same menu. If a space you had picked is deleted, the start page keeps its folder but no longer the space.

On a phone, the menu opens as a sheet from the bottom of the screen, titled "Space or folder to work in", and the keyboard waits until you tap the field.

When the space's folder is a Git repository, the end of the menu offers **New worktree**, as for any folder in a repository: the session then works on a branch of its own, in a separate copy of the repository (see [Sessions](/guide/sessions)). Sessions you start by voice in hands-free mode start in the space picked last on the start page (see [Documents, images and voice](/guide/documents-voice)).

## A space's own page

Click a space on the Spaces page to open it. At the top are its mark and name, what it is about, and two buttons: **All spaces** goes back to the list (on a phone only its arrow shows), and **New session** starts a session in the space. Below them are three tabs: **Sessions** and **Knowledge**, each with a count, and **Settings**.

### Sessions

- **Its files** opens the space's folder in [Files](/files).
- **What agents remember** opens [Settings → Memory](/settings?s=memory), where the notes agents kept about the space are listed under its folder.
- Next to them, the folder's path.
- Below, the sessions started in the space, the one at work most recently first, each with its agent's icon, its title and how long ago it was at work. Click one to open it.

With no sessions yet, the tab says that **New session** starts one here, with the space's folder, assistant and guidelines.

### Knowledge

The space's own documents, which only its sessions search, and whether they search the shared knowledge too. See [Give a space documents of its own](#give-a-space-documents-of-its-own).

### Settings

Everything about the space itself:

- **Name**, **What it is about** and the **Agent Guidelines**, as when you made it.
- **The spaces it brings together**: pick spaces here to turn this space into a group (see [Bring spaces together in a group](#bring-spaces-together-in-a-group)).
- **Its sessions start as**: **The assistant picked on the start page** (the default: picking the space leaves the start page's assistant as it is), or any of your assistants, built in or your own. Picking the space on the start page then picks that assistant too.
- The colour dots.
- **Save**, which turns on once you change something, and **Delete the space**.

## Change a space

Open the space, go to its **Settings** tab, change what you like and click **Save**. Sessions you start in the space from then on get the new name, description and guidelines. A new assistant applies the next time you pick the space on the start page, or click **New session** on its page. The space's folder stays the same: it can't be moved to another folder.

## Delete a space

1. Open the space and go to its **Settings** tab.
2. Click **Delete the space**.
3. The app asks "Delete the *name* space?" Click **Delete**.

Deleting a space keeps everything that was in it:

- **Its folder** and the files in it stay where they are.
- **Its sessions** stay, and no longer belong to a space.
- **Its documents** move to the shared knowledge, so every session can search them from then on. To keep them apart, move their knowledge base into another space (see [Rename, move, read again or delete a knowledge base](#rename-move-read-again-or-delete-a-knowledge-base)).
- **What agents remember** about its folder stays: notes belong to the folder, not to the space.
- It leaves any group it was in. A group left with none of its spaces becomes a plain space.

## Bring spaces together in a group

A group is a space that brings several spaces together, for work that spans them: "Everything for the thesis" bringing in "Thesis" and "Reading notes", say. It has everything a space has: a name, a folder of its own, guidelines, documents and an assistant. Its sessions also work with every space it brings together.

### What sessions in a group get

- **The spaces' folders**: Claude Code can work in each of them as in its own folder; other agents are told where each one is. What a session makes goes in the group's own folder, unless you say otherwise.
- **The spaces' guidelines**: after the group's own, each space's name, what it is about, its folder and its guidelines.
- **The spaces' documents**: searched together with the group's own documents and the shared knowledge (unless the group turns the shared knowledge off). The agent is told which space each knowledge base comes from.
- **Memory** comes from the group's own folder. The notes agents kept in each space stay with that space.

### Make a group

1. On the [Spaces page](/spaces), click **Group spaces together**. This card shows once you have at least two spaces that aren't groups.
2. In **New group of spaces**, give it a **Name**, such as "Work" or "Everything for the thesis".
3. Under **The spaces it brings together**, tap each space to bring in; tap one again to take it out. Pick at least one.
4. Optionally, fill in **What it is about** and the **Agent Guidelines**, and pick a colour.
5. Click **Make the group**. Like a space, it gets a folder of its own for what is made in it, and its page opens.

You can also turn an existing space into a group: on its **Settings** tab, pick spaces under **The spaces it brings together** and click **Save**. Change a group's spaces the same way. Take all of them out and it is a plain space again.

A group's **Knowledge** tab also shows **Also the documents of the spaces it brings together**: each of its spaces, with how many documents it has. Click one to open that space's Knowledge tab.

### Limits

- A group brings plain spaces together, not other groups: groups are one level deep. A space that is in a group can't bring other spaces together itself; its Settings tab says which group it is in instead.
- A space can be in several groups.
- A group brings together at most 12 spaces. Once 12 are picked, the others can't be tapped.

## Show one space's sessions in the sidebar

1. In the sidebar, click the filter button at the end of the **Search sessions** field. Its label is **Filter by agent or space** once you have spaces.
2. The menu lists **All agents**, **Claude Code** and **Codex**, then **Every space**, up to eight of your spaces, and **Spaces**, which opens the Spaces page. Pick a space.

The session list then shows only the sessions started in that space, and the filter button is coloured while a filter is on. Pick **Every space** to see every session again. The agent filter works at the same time, to show only one agent's sessions in a space. If the space is deleted, the list shows every session again.

On a phone, open the sidebar (a drawer) first.

## Shared knowledge: documents every session can search

Agents can search documents you add once: contracts, manuals, notes, papers, a whole folder. They find passages by their words or by what they mean, and cite the file and page they read. Documents are kept in **knowledge bases**: named collections of files you dropped in and folders on this computer.

- **Shared knowledge** ([Spaces → Shared knowledge](/knowledge)): every session searches it, in a space too unless the space turns that off.
- **A space's own knowledge**, on its **Knowledge** tab: only that space's sessions search it, and the sessions of a group that brings the space in.

To open the shared knowledge, click the **Shared knowledge** tab on the Spaces page, or type "shared knowledge" in the search box (Ctrl+K).

## Add documents

With no shared knowledge yet, the page says "Add your documents once" over a large box to drop documents in. Drop files or a folder there, and a knowledge base called "My documents" is made for them. **Start with a folder on this computer instead** makes an empty "My documents" base, where you then add a folder.

Every knowledge base has its own drop box and its own **Add a folder on this computer** button. To start another base, click **New knowledge base** at the top of the page (**New** on a phone). Separate bases keep things apart, and an agent can search one base by its name, but one is enough to start.

### Drop or choose files

Drag documents or a folder onto a knowledge base's box ("Drop documents or a folder here"), or click **choose files**, or **folder** to pick a whole folder. The files are copied into the app's data folder and read as soon as they are in, so later changes to your originals don't reach the base. A small panel shows the upload. If a file of the same name is already in the base, the panel asks whether to **Replace** it, **Skip existing** or **Cancel**.

The files come from the device you are using. On a phone, **choose files** opens the phone's file picker; picking a whole folder is offered on a computer only.

### Add a folder on this computer

1. On a knowledge base, click **Add a folder on this computer**.
2. In the menu that opens ("A folder to read, and keep up to date"), type a folder's name to find it among the folders you used lately and those in your home folder, or type its path, such as `~/Documents/Manuals`. Pick it.

The folder is read where it is: nothing is copied. It shows as a chip on the base, and the base keeps up with it. A minute after the app starts, and every hour after that, the app reads what is new or changed in the folder and drops what was deleted. To read it at once, pick **Read again now** in the base's menu.

"This computer" is the one Naget Agent runs on, which may not be the device in front of you.

To stop reading a folder, click the × on its chip. Its documents leave the base; the folder and its files are untouched.

### What can be read

- **Documents**: PDF, Word, Excel, PowerPoint, OpenDocument, EPUB, CSV and RTF; old .doc, .xls and .ppt files too when LibreOffice is installed on this computer.
- **Text**: plain text and Markdown, web pages (their text, without the markup), and code and data files such as JSON, YAML, Python or JavaScript.

Left out: pictures; files and folders whose names start with a dot (hidden ones); and the folders tools make, such as `node_modules`, `.git`, `dist`, `build`, `target` and `venv`. A folder is read up to 20,000 files and 12 levels deep. Text files over 4 MB and documents over 300 MB aren't read. A scanned PDF without a text layer has no text to search.

Each document is cut into passages of up to about 1,400 characters, each keeping the page, slide, sheet or heading it came from, so agents can cite it.

## See what a knowledge base holds

Each knowledge base is a card. Under its name, a line counts what it holds: its documents and passages, how much of it is ready to search by meaning (when that is on: "ready to search by meaning", or a percentage while it gets ready), and how long ago it was last read. While it is being read, the line starts "Reading 12 of 40…".

- **Show the documents** lists every document: its name or path, then how many passages it has and its size. **no text** marks a document with nothing to read in it, and **could not read** one that failed; point at it to see why. Click a document to open it. **Hide the documents** folds the list.
- When some documents couldn't be read, a red line says how many, with the first few and the reason for each.
- A file you dropped in can be removed with the × at the end of its row (on a computer, it shows when you point at the row). This deletes the base's copy. A document from a folder on this computer has no ×: remove it from the folder itself, or stop reading the folder.

## Rename, move, read again or delete a knowledge base

The ⋯ button (**More**) at the top right of a knowledge base opens its menu:

- **Read again now**: reads its files and folders again at once, for files just added or a folder that changed.
- **Rename**: opens **Rename the knowledge base**. Type the new name (up to 60 characters) and click **Save**.
- **Move to**: **Shared knowledge**, or one of your spaces; a check marks where the base is now. In a space, only that space's sessions search it; in the shared knowledge, every session does. This item shows once you have spaces.
- **Delete**: asks "Delete *name*?" Its passages go, and the files dropped into it with them; folders on this computer stay as they are. Click **Delete** to go ahead.

## Give a space documents of its own

Open the space and go to its **Knowledge** tab.

- **Also search the shared knowledge** is a switch, on unless you turn it off. Turn it off and the space's sessions search only the space's own documents (and, in a group, those of its spaces). The line under it says how many shared documents there are, with a **Shared knowledge** link.
- With no documents yet, drop documents or a folder in the box, or choose them: a knowledge base named after the space is made for them. **Start with a folder on this computer instead** makes an empty one, named after the space, to add a folder to.
- Once it has documents, the tab shows a search box (see [Try a search yourself](#try-a-search-yourself)), the space's knowledge bases with the same cards and menus as shared ones, and **New knowledge base** at the bottom.

A shared knowledge base can be moved into a space from its menu (**Move to**), and back.

## How agents search your documents

Once there is at least one knowledge base, agents get tools to search the documents their session may search, to read more of a document around a passage, and to list what the knowledge bases hold. Claude Code, Codex, Custom and the agents that speak ACP and take MCP servers (tool servers) all get them.

At the start of a session, the agent is told which knowledge bases it can search and how many documents each holds; in a space, also whether each is the space's own, shared, or from a space its group brings in. It is told to search there first, before the web or memory, when a question may be answered from them; to answer from what the passages say; to cite each passage it uses with its file and page or part, and its path; and to say so when the documents don't answer the question.

In the conversation, a search shows as a step: **Searched your documents**, what it looked for, and how many passages it found, or "nothing found". Click it to see the passages, each with its file, page and knowledge base. Click a passage to open the file.

### By words, by meaning, or the exact text

Agents search in three ways:

- **By words**: passages that hold the words of the question, the best matches first. Always available.
- **By meaning**: passages that mean what the question asks, even in other words or another language. This needs **Search by meaning**, turned on in [Settings → Memory](/settings?s=memory&find=Search%20by%20meaning). It runs on this computer, and once it is on, every base gets ready for it in the background (see [Memory](/guide/memory#search-by-meaning)). While it is off, the Shared knowledge tab and each space's Knowledge tab say where to turn it on, and agents find passages by their words.
- **The exact text**: a phrase in quotes ("notice period") or a pattern between slashes (a regular expression, such as `/INV-\d+/`), found as the grep command would find it: for names, numbers and codes. These passages come in the order they appear in the documents.

An agent searches by words and by meaning together unless it asks for one, and a question in quotes or between slashes is searched for exactly. It gets 8 passages at a time unless it asks for more (up to 25), and it can search one knowledge base by its name.

### Try a search yourself

Above the knowledge bases, a field says "Try a search, as agents do: a question, or “exact words” in quotes". Type and press Enter. Up to 10 passages come back, each with its file and page, its knowledge base and how it was found: **by words**, **by meaning**, or both, or **by exact** for exact text. Click one to open the file.

On the Shared knowledge tab, it searches what a session outside any space searches. On a space's Knowledge tab, it searches what a session in that space searches.

## Which sessions search which knowledge

| A session… | searches |
|---|---|
| outside any space | the shared knowledge |
| in a space | the space's own documents, and the shared knowledge unless the space turns it off |
| in a group | the group's own documents, the documents of every space it brings together, and the shared knowledge unless the group turns it off |
| started by another session (a child session) | what the session that started it searches |

The knowledge tools never bring up another space's documents, not even when an agent asks for a file by its path. A knowledge base whose space was deleted is shared.

## Ask an agent

- "Make a space called Taxes 2026 for my receipts and tax return. Its sessions should start as the Researcher, and every agent in it should know that amounts are in EUR."
- "Make a space called Shop for my project in ~/code/shop."
- "Group my Thesis and Reading notes spaces into one called Everything for the thesis."
- "Add the folder ~/Documents/Manuals to my shared knowledge."
- "Move the Contracts knowledge base into the Taxes 2026 space, and stop that space from searching the shared knowledge."
- "Which knowledge bases do I have, and which documents couldn't be read?"
