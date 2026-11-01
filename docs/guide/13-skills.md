# Skills

Skills are written methods that agents load when a task calls for them: how to research a question, track down a problem, make a Word document or clean up after a task. This topic covers the skill library that comes with the app, the skills agents learn with your approval, a space's own skills, keywords that bring a skill in for Custom, and Claude Code's and Codex's own skills.

![Settings → Skill library: skills agents learned with your approval, and those that come with the app](images/skills.webp)

## What a skill is

A skill is a short guide an agent follows for one kind of work. Each one is a folder with a file named SKILL.md in it: a name, one line on when to use it, then the steps, the checks and the mistakes to avoid. Some skills also bring files of their own: examples, templates or small scripts the steps use.

Agents don't read every skill all the time. At the start of a session an agent sees only each skill's name and its "when to use it" line. When a task fits one, it loads that skill and follows it. A greeting, a quick question or a small, clear change needs none.

Skills come from three places in the app:

- **The skill library**, in [Settings → Skill library](/settings?s=skillpack): the skills that come with the app, and the ones agents learned with your approval. Claude Code, Codex and Custom sessions started from the app all get it.
- **A space's own skills**, on the space's **Skills** tab: only the sessions started in the space get them, with the library. See [Give a space skills of its own](/guide/spaces#give-a-space-skills-of-its-own).
- **Claude Code's and Codex's own skills**, in [Settings → Skills](/settings?s=skills): the skills in your own folders and in a project's folder, which those agents read wherever they run.

An assistant can also name skills it favors: when one of them fits the task, the agent loads it before it starts. See [Assistants](/guide/assistants).

## Which agents get which skills

Every Claude Code, Codex and Custom session the app starts gets the skill library:

- **Claude Code** gets it as a plugin named "naget", so its skills show with that name in front: naget:research, naget:writing and so on.
- **Codex** gets it as an extra folder of skills.
- **Custom**, the app's own agent, gets it in its list of skills. See [Custom](/guide/custom).

Sessions started outside the app, in a terminal or in VS Code, don't see the library. Nothing of it is written into your Claude Code or Codex settings.

A session in a space gets the space's own skills in the same plugin, folder or list, with the library's. A space's skill with the name of a library skill takes its place in that space's sessions.

Your own skills and your projects' skills come first. When one of them has the same name as a skill in the library, agents use yours.

Custom reads its skills from several folders, in this order: the project's own skills (in its `.claude/skills` and `.agents/skills` folders), your own skills for Claude Code (`~/.claude/skills`) and Codex (`~/.agents/skills` and `~/.codex/skills`), then the library. Where two skills share a name, the first one found wins. So a skill you write in Settings → Skills, for Claude Code or for Codex, reaches Custom too.

## See when an agent uses a skill

When an agent loads a skill, a small pill shows in the conversation: **Using skill research**, with a spinner while the agent reads it. This works for Claude Code, Codex and Custom alike.

Click the pill to read the skill: what it says, when it applies and its history (see [Read a skill and its history](#read-a-skill-and-its-history)). If the skill isn't part of the app's library, the window says so: it comes from your own or the project's skills folder. In a space, the pill opens the space's own skill when that is the one the agent used: the window's badge shows the space's name, and **The space's skills** opens its Skills tab.

When your own words brought a skill into a Custom session, the pill says which words did it: "brought in by “research” in your message". See [Bring skills in by keywords](#bring-skills-in-by-keywords).

Each time an agent loads a skill counts as a use. The skill library shows how often each skill was used, and when last.

## Open the skill library

Go to **Settings → Capabilities → Skill library** ([open it](/settings?s=skillpack)). On a phone, open Settings, then tap **Skill library** under Capabilities.

The page has up to four parts:

- **Waiting for you**: skills agents proposed that need your answer. It only shows when there are some.
- **Learned**: the skills you approved.
- **Built in**: the skills that come with the app.
- **How agents get them**: the **Bring skills in by keywords** switch, and how each agent gets the library.

You can also find a skill from the search box (Ctrl+K, ⌘K on a Mac): type its name or what it is for. Skills show under **Skills**, and picking one opens the skill library at that skill.

## The built-in skills

Under **Built in** ([open it](/settings?s=skillpack&find=Built%20in)) are the skills that come with the app. They update with the app, and agents load each one when a task calls for it. Each row shows the skill's name, when to use it, how often agents used it ("Used 3 times, last 2 days ago", or "Not used yet"), and its keywords for Custom, if it has any. Click a name to read the whole skill.

The app comes with these skills:

- **clarify-first**: for a big or open-ended request (a website, a trip, a renovation, a talk, a business plan). The agent first reads what is already there, asks one question at a time and says why, plays back what it understood, offers two or three ways to do it, and writes a short brief for you to approve before it builds anything.
- **clean-up**: at the end of a task. The agent lists what it made along the way, removes what is no longer needed (scratch files, test data, temporary folders, merged or abandoned branches, worktrees, processes it started), never removes what it didn't make, asks first about anything big or shared, and says in a line what it removed and what it left. While **Clean up after a task** is on in [Settings → Assistants](/settings?s=assistants&find=Clean%20up%20after%20a%20task) (it is unless you turn it off), every agent is told to do this at the end of a task.
- **decisions-log**: for work without you at hand (a goal, a scheduled task, "don't wait for me"). The agent settles ordinary questions itself, writes each decision down with why and what it costs if wrong, and carries on. It stops only before steps that can't be undone (sending, paying, deleting, publishing), anything touching passwords or access, or anything outside the work; its final message lists every decision it made.
- **evidence-before-done**: before the agent says something is done, fixed, saved, sent or true. It names the check that would prove it, runs it, reads the result, and reports the claim with its evidence, or says plainly what it could not check.
- **pdf**: makes PDFs (reports, invoices, certificates, flyers, forms), merges, splits, rotates, fills in or stamps them, turns Office files into PDFs, and reads PDFs, scanned pages included.
- **presentations**: makes or changes slides (.pptx) with one look throughout, charts, tables and speaker notes, looks at them as pictures before handing them over, and reads .pptx, .ppt and .odp files.
- **research**: plans the searches a question needs, searches wide and then narrow (papers, patents, news, filings), checks each key claim against two independent sources or one primary source, and answers with citations, saying what it could not confirm.
- **spreadsheets**: makes or changes workbooks (.xlsx) with formulas, number formats and charts, checks the formulas for errors, and reads .xlsx, .xls, .ods and .csv files.
- **troubleshooting**: for anything that doesn't work as it should (an error, a device, a home network, a formula, a recipe). The agent makes the problem happen on purpose, gathers facts, tests one idea at a time, fixes the cause and shows that it is fixed.
- **word-documents**: makes or changes Word documents (.docx) with real headings, lists and tables, looks at the pages before handing them over, and reads .docx, .doc and .odt files.
- **writing**: for anything people will read (a report, an article, a letter, a speech, a story). The agent settles who reads it and what for, outlines before it drafts, and edits in separate passes.

The document skills (pdf, presentations, spreadsheets, word-documents) make files with small Python scripts. They need Python 3 on this computer. The first time one is needed, the libraries they use are downloaded into a private folder in the app's data folder (about 30 MB, once); nothing is installed for the whole system. If Python is missing, the agent tells you the command that installs it. To look at the pages as pictures before handing a file over, they use LibreOffice and Poppler when this computer has them. See [Documents, images and voice](/guide/documents-voice).

Built-in skills have no Remove button. You can't delete them, but an agent can propose an improvement to one, which is saved as your own version (see [Your version of a built-in skill](#your-version-of-a-built-in-skill)).

## Read a skill and its history

Click a skill's name in the skill library, or a **Using skill** pill in a conversation. A window opens with:

- the skill's name and a badge: **Built in**, **Learned**, or the space's name for a space's own skill;
- when to use it;
- its keywords, if it has any: "Custom brings it in when you say" and the words;
- two tabs: **Skill**, the whole guide as the agents read it, and **History**, with the number of changes;
- at the bottom, where its file is on this computer.

**History** lists every change to the skill, newest first: **Saved**, **Changed**, **Removed** or **Brought back**, how long ago, and how many lines were added and removed. Click a change to see it line by line; the newest is open already. A built-in skill nobody changed says it is as it came with the app.

On a phone the window opens as a sheet from the bottom of the screen. **Close** shuts it.

## Skills agents learned

Under **Learned** ([open it](/settings?s=skillpack&find=Learned)) are the skills you approved, for every agent. Each row shows:

- the name, with the badge **Your version of a built-in skill** when it takes a built-in skill's place;
- when to use it;
- how often agents used it, how long ago it was saved, and its keywords for Custom, if any;
- **History** (the clock), which opens the skill at its History tab;
- **Remove** (the bin).

With none yet, the page explains how they come: after a task that took real effort, an agent can propose keeping its method as a skill, or improving one it followed, and you approve, edit or dismiss each one.

### Remove a learned skill

1. Click **Remove** (the bin) on its row.
2. Confirm with **Remove**.

Agents stop seeing the skill. If it was your version of a built-in skill, agents go back to the built-in one. The text stays in the skill's history, so you can bring it back.

### Bring a removed skill back

Removed learned skills are listed under **Learned**, after **Removed:**. Click a name there (hover over it to see when it was removed). The skill's text comes back as it was when you removed it, and agents get it again.

### Add skills of your own to the library

The bottom of the page shows the folder learned skills live in (in the app's data folder, `~/.naget-agent/skills` unless your install keeps its data elsewhere). Skills you put there yourself join the library for every agent too: one folder per skill, named in lowercase letters, digits and dashes, with its SKILL.md inside. They show under **Learned**.

## Approve, edit or dismiss a proposed skill

After a task that took real effort, an agent may propose keeping its method as a skill: a fix found after several tries, a workflow you had to explain, a process whose steps are easy to get wrong. It may also propose an improvement to a skill it followed, when it found a step missing, wrong or unclear. Agents are told not to propose one-off facts, your personal details or anything secret.

Nothing is saved until you approve it. The agent carries on with its work meanwhile, and your answer reaches it as a message.

### What the card shows

The proposal shows as a card in the conversation, outside the folded steps, while the agent goes on. At the top it asks **Keep this as a skill?**, **Improve this skill?** or **Improve this built-in skill?**, with the skill's name and a badge: **Waiting for you**, **Saved**, **Dismissed** or **Replaced**.

Below that:

- **Why**: what happened in this task that makes it worth keeping, in the agent's words.
- **When it applies**: the line agents read to decide when to use it. For an improvement that changes it, the old line shows struck through.
- Its keywords for Custom, if it has any: "Custom brings it in when you say" and the words.
- Warnings, if any (see [Warnings on the card](#warnings-on-the-card)).
- The text, with a switch between **Text** (for a new skill) or **Changes** (for an improvement, line by line) and **Skill** (the guide as it reads), and how many lines it adds and removes.
- In a space, **Keep it for**: **Every session** or the space's name (see [Skills agents propose in a space](/guide/spaces#skills-agents-propose-in-a-space)).

### Approve it

Click **Approve**. The skill is saved into your library, and the card says it is in your skill library: every agent can use it. A **Skill library** link takes you there.

With the space's name picked under **Keep it for**, it is saved in the space's skills instead: the card says it is in them, and **The space's skills** takes you there.

Custom has the skill from its next turn; Claude Code and Codex from their next sessions.

### Edit it first

1. Click **Edit…**. A window opens with the whole skill as text.
2. Change what you like. The lines at the top (between the `---` lines) hold its name, which must stay, and the line on when to use it. Everything below them is the guide agents follow.
3. Click **Save and approve**.

The card then says you edited it before saving, and shows the saved version. The app checks the edited text as it checks the agent's: it needs a line on when to use it, real steps, and no secrets.

### Dismiss it

1. Click **Dismiss…**.
2. Optionally, tell the agent why in the box that opens.
3. Click **Dismiss** (or **Cancel** to go back).

Nothing is saved. The agent hears that you dismissed it, with your note, and is told not to propose it again unless you ask.

### Warnings on the card

Skills are files every agent reads, so the app checks each proposal before you see it:

- **A secret stops it.** A proposal with something that looks like a password, a key or a token (an API key, a private key, a password written out or inside an address) never reaches you as a card. The agent is told to take it out and say where the secret is kept instead.
- **Text that tries to steer agents is pointed out.** The card shows **Look at these lines before approving**, with the line number and the text, when a line the proposal adds: tells agents to ignore their instructions, tries to replace who the agent is, tells agents to keep something from you, tries to get around approvals, sends keys or private files somewhere, runs a script straight from the internet, changes agent settings or startup files, deletes or overwrites far outside a project, hides instructions in an HTML comment, or has characters you can't see.

Approving a proposal with warnings asks once more: **Save it with these warnings?** Click **Save it** only if the flagged lines are what you want agents to follow.

### Answer from Settings or the inbox

A proposal waits in three places, and an answer in any one of them shows everywhere, on every device:

- the card in its conversation;
- **Waiting for you** at the top of the skill library ("Skills agents proposed after hard tasks. Nothing is saved until you approve."). Each row says **New skill** or **Change to** and the name, how long ago, which conversation it came from (click to open it), and "has warnings" when it has any. **Review** opens the same card in a window;
- the [inbox](/inbox), as "Suggests a new skill: …" or "Suggests a change to the … skill". **Open** takes you to its conversation, where the card is. See [Inbox and notifications](/guide/inbox).

### Limits

- A proposal holds at most 20,000 characters. Longer guides are refused, and the agent is asked to keep the main steps.
- A new skill needs a name not in use. The name is short lowercase words with dashes, like release-notes.
- At most five proposals from one conversation wait for you at a time.
- When the agent proposes the same skill again before you answer, the newer proposal takes the older one's place, which shows **Replaced**.
- If a skill of that name was saved, or the skill changed, after the proposal was made, approving fails with a message. Dismiss it and ask the agent again.
- Agents can improve only skills in the app's library and a space's own skills. Skills in your own folders or a project's are not changed this way: edit those in [Settings → Skills](/settings?s=skills).
- Answered proposals stay on their cards in old conversations for half a year.

## Your version of a built-in skill

When you approve an improvement to a built-in skill, the card has said so: "A built-in skill: approving saves your own version in its place. The original stays with the app." Your version starts as a copy of the built-in skill's whole folder (with its examples and scripts), with the change made.

From then on agents use your version instead of the built-in one, even after the app updates the built-in skill. It shows under **Learned** with the badge **Your version of a built-in skill**. To go back to the built-in skill, remove your version: see [Remove a learned skill](#remove-a-learned-skill).

## Bring skills in by keywords

Some models rarely load a skill by themselves. For them, Custom can bring a skill in when your message uses its keywords: the skill's text comes along with your message, and the agent follows it where it fits.

The switch is in **Settings → Capabilities → Skill library → How agents get them → Bring skills in by keywords** ([open it](/settings?s=skillpack&find=Bring%20skills%20in%20by%20keywords)). It is on unless you turn it off. It only affects Custom; Claude Code and Codex load skills themselves. With it off, Custom still sees its list of skills and loads one when a task fits.

When keywords bring a skill in, a pill shows in the conversation under your message: **Using skill research**, "brought in by “research” in your message". Click it to read the skill.

### How keywords match

- A keyword matches whole words, in any case: "research" doesn't match "researchers".
- A keyword ending in * also matches longer words: "renovat*" matches renovate and renovation; "debug*" matches debugging.
- Messages shorter than four words bring nothing in, so "ok, go on" never loads a skill.
- At most two skills are brought in at a time: those with the most keywords in your message come first.
- A skill brought in stays for that message and the next two, so a process like asking first or researching can run over several turns. A newer message's skills take the place of older ones.
- A long skill is cut to fit what the model can take; the agent is told to load the rest itself.

The built-in skills with keywords are clarify-first ("plan a trip", "business plan", "renovat*"…), clean-up ("clean up after", "leftover files"…), decisions-log ("while I'm away", "overnight"…), evidence-before-done ("double-check", "verify"…), research ("research", "find sources", "fact-check"…), troubleshooting ("not working", "keeps crashing", "debug*"…) and writing ("draft a", "proofread", "cover letter"…). The document skills have none: Custom loads them when a task fits. You see each skill's keywords on its row and on its page.

### Give a skill keywords

A skill's keywords are a list in the lines at the top of its SKILL.md, for example `triggers: [weekly report, status update, standup]`. An agent can propose up to 12 keywords with a new skill, each 3 to 40 characters. Custom also matches keywords in skills of your own folders and a project's, since it reads those too.

## Claude Code's and Codex's own skills

Claude Code and Codex also read skills from folders of their own: yours, which they read in every folder, and a project's, which they read only there. Go to **Settings → Agents → Skills** ([open it](/settings?s=skills)) to see and manage them.

### Pick the folder

A project's skills depend on the folder, so this page shows one folder at a time. The **Folder** chip sits beside the section's title (on a phone, under the line that describes the section). It starts at the folder open in [Files](/files), or else your default folder. Click it to pick another folder.

### What the list shows

At the top: **All**, **Claude Code** or **Codex** to show one agent's skills, a **Filter skills** box (it matches names, descriptions and plugin names), and **New skill**.

Then a part for each agent, with how many skills it has. Each row shows the skill's name (greyed when it is off), a badge for where it comes from, the plugin's name for a plugin's skill, and its description:

- **This folder**: the folder's own skills.
- **This repository**: Codex skills that come with the repository.
- **All folders**: your own skills, for every folder.
- **Plugin**: skills that come with a plugin. Plugins are managed in [Settings → Plugins](/settings?s=plugins).
- **Built in**: skills that come with Codex.
- **Admin**: skills an administrator set up for Codex.

For Claude Code the page lists your skills (in `~/.claude/skills`) and the folder's (in its `.claude/skills`; none when the folder is your home folder). For Codex it lists what Codex itself reports for that folder. Problems reading skills, such as Codex not answering or a skill file it can't read, show in a note above the list.

The app's own skill library isn't in this list: it has its own page, [Settings → Skill library](/settings?s=skillpack).

### Turn a skill on or off

Use the switch at the end of a row. A skill turned off stays on disk, but the agent no longer gets it. Claude Code keeps the choice in its own settings, by the skill's name; Codex keeps it in its own configuration. Turn it back on with the same switch.

### Write a new skill

1. Click **New skill** ([open it](/settings?s=skills&find=New%20skill)).
2. Under **For**, pick **Claude Code** or **Codex**.
3. Type a **Name**. It becomes the folder's name: lowercase, with dashes ("Release notes" becomes release-notes).
4. Under **When to use it**, write one line, such as "Use when writing release notes from merged pull requests". The agent sees this line in every session and reads the rest of the skill only when it applies.
5. For Claude Code, pick **Where**: **All folders** (your own skills) or **This folder** (the folder picked at the top). The window says where the skill will be saved. Codex skills go in `~/.agents/skills`, which Codex reads in every folder.
6. Click **Create and edit**.

The app makes the skill's folder and its SKILL.md, with the name, your line and a placeholder for the steps, and opens it in an editor. Write the steps, then click **Save**, then **Done**. If a skill of that name is already there, the app says so and makes nothing.

### Edit or delete a skill

- **Edit** (the pencil; its label says **Open** for skills you can't delete) opens the skill's SKILL.md in an editor. Change it, click **Save**, then **Done**. **Open the folder in Files** shows the skill's folder, with any other files in it. If you close the editor with changes not saved, it asks before discarding them.
- **Delete** (the bin) removes the skill's folder from disk, with every file in it, after you confirm. It is there for your own skills, and for Claude Code also the folder's. Built-in, admin and plugin skills have no bin: turn them off instead. A deleted skill can't be brought back from the app.

## Ask an agent

- "Which skills in the library have agents used, and how often?"
- "Show me the skill proposals waiting for me, and what each would change."
- "Show me what changed in the research skill since I approved it."
- "Remove the learned skill release-notes", or "Bring back the skill I removed yesterday."
- "Turn off bringing skills in by keywords for Custom."
- "Which skills does my Thesis space have of its own, and how often were they used?"
- "List Claude Code's skills for ~/projects/shop and turn off the one called deploy."
