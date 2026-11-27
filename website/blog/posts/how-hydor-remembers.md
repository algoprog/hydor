---
title: How Hydor remembers: one memory for every agent
description: Claude Code, Codex and every other agent in Hydor share one memory that you can see and undo. How it is kept, what each agent is given and when, how the right notes are found, and how memory stays true as your work changes.
date: 2026-10-31
tags: Memory, Under the hood
cover: /img/blog/how-hydor-remembers/cover.webp
coverAlt: Small glowing cards float on dark water, each joined by a thread of light to one bright point at the centre, where ripples spread outward.
og: /img/blog/how-hydor-remembers/og.jpg
order: 1
---

Tell an agent that the staging server is only up on weekdays and it will use that all afternoon. Tomorrow, in a new session, it asks again. Switch to another agent and it asks again too, because each agent keeps what it keeps in its own place, if it keeps anything. You end up being the memory that carries facts from one to the next.

This post is about the other way: one memory that every agent shares. Each section starts in plain words, then goes into how it works, for engineers and anyone who builds search: the algorithms, constants and measurements.

## One memory, not one for each agent

In [Hydor](/) every agent the app runs shares the same memory: Claude Code, Codex, Custom (the app's own agent, for any model) and agents that speak ACP, such as Gemini CLI. Tell one something once and the rest know it. Claude Code's and Codex's own memories are switched off in these sessions, so there is one memory, and you can open, edit and undo it.

A session sees three sets of notes and no more: yours, its project's and its own. A project is the folder a session works in, the top folder of its Git repository when it has one, and an agent working in one project never sees another's notes unless it searches for them on purpose.

For engineers: everything lives in the app's SQLite database. A note is a row with a scope (you, a project, a session), a text of at most 500 characters, how it is known, when it ends, and how often agents were given it and used it.

## Three parts

Memory is one thing with three parts, each for something else.

<!-- figure: parts -->

**Memory notes** are short facts, a sentence or two each. Every agent starts with the ones that matter for what it is about to do, which stops them asking the same question twice. **Wiki memory** is longer, linked articles for each project: a note says tests run with `npm test`, an article explains how the search code fits together and why. **Documents** are the files themselves, which agents search and cite and are never given unasked.

A small model connects them: the **helper model**, picked in **Settings → Agents → Models → Helper model**. It reads new documents, finished conversations and commit messages, and keeps what is worth keeping as notes and articles.

## What an agent is given, and when

An agent is not handed all of memory. It gets a little at the start, a little more only when something new bears on what it is doing, and it can always look up the rest.

<!-- figure: timeline -->

The limits matter as much as the content. A message adds at most three notes within 1,500 characters, and usually nothing; a file adds at most two within 800.

How it arrives differs by agent, mostly because of caching. Claude Code and Codex get the explanation, the profiles and the index in their instructions, which stay the same for every session of a project until its notes change, so the model's provider can reuse what it kept. The notes that bear on your first message come ahead of it in a `<system-reminder>`. For files, Hydor gives Claude Code a `PostToolUse` hook, with a five-second limit, that asks for the notes about the file; that lookup is plain SQL with no embeddings, so it answers at once. Codex and ACP agents have no such hook: the notes for the files a turn touched come with your next message. Custom reads memory itself, as a block it keeps until it condenses its conversation.

The index is ordered by how much each note was used, in steps that double (never, once, two or three times, four to seven…), then by latest change, so it reads the same from one session to the next and the provider's cache holds.

## How notes are found

For the person using it: two searches run at once. One ranks notes by their words, with rare words counting most. The other ranks them by meaning, so "keep it brief" finds "Likes short answers with a clear pick" although they share no word. The two lists are merged by rank.

<!-- figure: hybrid -->

The words list is SQLite's [FTS5](https://www.sqlite.org/fts5.html) ranked with BM25. The request becomes a query of up to 32 words, any of which may match, and a word of more than five letters also matches by its start, so `deploy` finds `deployment`. The meaning list is a cosine search over embeddings, covered below.

The lists are joined by **reciprocal rank fusion**: an item at rank *r* in a list adds *w* ÷ (60 + *r*) to its score. The weights are 0.1 for words and 1 for meaning, and they come from a measurement, not a guess. On nine retrieval benchmarks, meaning alone scored 53.26 nDCG@10 and words alone 30.20. Fused with equal weights, the result was 46.18, seven points worse than meaning alone: noisy word matches pushed good notes down. With words at a tenth it was 53.87, better than meaning alone on eight of the nine sets (FiQA lost 1.4). Without meaning, words are all there is. In the figure, a rare word such as "Stripe" lifts a note a few places, and no more.

Two more things shape the order. A request that names a file, a function, a version or a flag (`server/queue/worker.ts`, `v0.62.0`, `--resume`) also searches for those exact names, and the notes that hold them, at most three, are fused as a third list of weight 1. A name only counts when at most max(2, 1%) of the active notes hold it, and hyphenated English such as "built-in" is not a name. And a note changed or looked up lately and often gets a little more: its score is multiplied by 1 + 0.3 × e^(−age / 90 days) + 0.2 × min(1, log₂(1 + look-ups) ÷ 6). Only look-ups count, not being given: a note the ranking already chose says nothing new about its worth.

## Standing out

A ranked list is half the job. The other half is where to stop, and a fixed similarity threshold cannot say, because how alike a request is to every note depends mostly on the request. Measured on 88 notes of one real project and the first messages of its last 40 sessions, a short question had a mean similarity to all notes of 0.20, and a long brief 0.44. A cut at 0.30 that suits the question lets in nearly every note for the brief.

So a note's similarity is measured against the **bulk** of the request's similarities to all notes: the mean and standard deviation of all but the best 5%, since the best are what may stand out and would drag the mean and the spread up. A note bears on the request when its z-score is at least **2.3**.

<!-- figure: stands-out -->

On 20 first messages judged by hand, a fixed 0.3 with the best 10 handed out 180 notes, 19% of them bearing on the request. A z bar of 2.6 handed out 23, 87% bearing on it, and found 54% of the notes judged to bear on it; the rest are in the index, a look-up away.

The bar was measured again on a replay of 782 messages in 242 sessions, 42 of them judged by hand. Against the earlier bar of 2.6, a bar of 2.3 gives 1.7 notes for a first message instead of 1.0, gives nothing to 22% of them instead of 39%, and finds 43% of the notes judged helpful instead of 24%, without losing precision (42% against 36%). At 2.0 it gives 2.95 notes and finds 53%, but precision falls to 24%: the notes it adds help about as often as chance. So the bar is 2.3. With fewer than 12 notes there is no bulk to judge by, and a cosine of at least 0.30 decides. A message after the first is held to a stricter 3.0 and only counts notes not yet given. The caveats are real: one installation, one person, two repositories and 17 days, and the hand-judged columns rest on 18 first messages.

## Meaning, on your own computer

Meaning needs a model, and it runs on your computer: LightOn's [mDenseOn](https://huggingface.co/lightonai/mDenseOn), 307 million parameters, 768 dimensions, nine languages, Apache 2.0. Hydor runs [an 8-bit ONNX build of it](https://huggingface.co/algoprog/mDenseOn-ONNX) on the CPU in a small Python worker that starts when needed and stops after five idle minutes. Against the PyTorch worker it replaced, it installs at about 150 MB instead of about 1 GB, holds 0.55 GB once loaded instead of 1.43 GB, and scored within 0.2 nDCG@10 points of full precision on SciFact and NFCorpus.

Each note's vector is then stored in **4 bits** a dimension, on 16 levels per dimension fitted by Lloyd–Max (one-dimensional k-means) to 32,400 texts in the model's nine languages: 384 bytes a note instead of 3,072. The request stays in full precision, and its score against a note is a sum over the note's bytes from a table made once per request, so a scan reads each stored vector once.

<!-- figure: codebook -->

The cost of the squeeze was measured on ten retrieval sets: against float32 vectors, the mean change in nDCG@10 was −0.05 points, and the worst set, SciDocs, lost 0.27. Dividing each score by the stored vector's length, which is not quite 1 after quantizing, took the mean loss from −0.24 to −0.05 at no cost at search time. Vectors are cached in memory within a budget of min(512 MB, total memory ÷ 64, free memory ÷ 8); when free memory runs low the cache is dropped and each search streams the vectors from the database, a little slower. A session start waits at most 1.5 seconds for the worker, and otherwise finds notes by words alone.

## How notes are written

Agents save a note when you ask ("Remember that the staging server is only up on weekdays"), or when they learn something lasting that a later session could not find out by itself, such as a decision and why, or a pitfall. You can add notes under **Settings → Capabilities → Memory**, and the helper writes some when it tidies up. A few rules keep them good.

- **One fact per note**, a sentence that stands on its own and names what it is about, so a later request in other words still finds it.
- **How each is known**: you said so, it was checked (a test, a command, a file), or it is an agent's own conclusion, not checked yet. Agents are told which are not checked, and the tidy-up checks those first.
- **End dates.** A note true only until a date, such as a trip, gets one, and agents stop getting it after.
- **Corrections replace**, so there is one note, not two that disagree.
- **Never secrets.** Text that looks like a password, a key, a token or a card number is refused, and so is text that reads like instructions to an agent.

Everything given is framed as background: notes may be out of date, and what you say now comes first. Notes the helper kept from documents come last, marked as quoted material.

## How memory stays true

Notes are written in the moment, before anyone knows what comes next, and a project changes. Background jobs keep memory short and true, and every change they make is in the note's history and can be undone. Press a step to read about it.

<!-- figure: lifecycle -->

**Notes tied to the code.** A project note that names files is anchored to them: Hydor finds the paths in its text among the repository's tracked files, and remembers the commit it was written against. Every ten minutes it checks whether a project's latest commit has moved; if so it asks Git which files changed since each note's commit, and flags the notes whose files did. Agents given it see "may be out of date" with the files. Nothing is rewritten silently: the next tidy-up shows the helper each flagged note with the diff of its files, up to 20, and the helper keeps it, fixes it or deletes it, and each change is listed under **What changed**.

**The daily tidy-up.** About once a day, when something new has been written and you have been quiet for ten minutes, the helper merges near-copies (notes at least 0.7 alike), checks notes against the code, and moves project notes saved as being about you to their project. A place with more than 2,400 characters of notes gets **topics**, each summing up 4 to 12 notes at least 0.6 alike, and a project gets a **profile** with its standing rules first. Agents get a topic and can look up its notes. **Learn from conversations**, on at first, also reads what you wrote and each agent's last reply of each turn, never tool output, to correct notes it shows wrong and keep at most three things a day no agent saved. It never reads a confidential session.

Long notes that read as history (a version, a date, several file paths) are written into the wiki once they are a week old, and replaced by a one-line pointer to the article that holds them. A convention the project's `AGENTS.md` does not yet say can become a **suggestion** for it, at most three a tidy-up; nothing is written to your project until you press **Add**.

## Wiki memory, briefly

Wiki memory is a folder of ordinary Markdown files: `wiki/` for the articles, `raw/` for their sources, an `index.md` and a `log.md`. The [wiki memory docs](/docs/wiki-memory) have the rest; these are the parts a reader might not expect.

An article names its sources, and it is revised, not only added to. When a new source contradicts or outdates a statement, the helper can replace it, but it must list each statement it drops with a reason (superseded by a source, moved to another article, or no longer true as of a date). A rewrite that leaves out more than a fifth of the article is refused unless every drop has a reason, and one that keeps less than half is always refused. Before any rewrite the old text goes to a hidden snapshot, the 20 newest kept for each article. An article over 12,000 characters is split into a hub and two to five parts that together keep at least 90% of the text: reorganising, not summarising.

Articles are tied to the code the way notes are. Each records the files it names and the commit it was written against; once a day, with no model involved, Hydor marks as stale any article whose files changed, and the helper revises up to five a day. From ten articles on, they are grouped into **areas**, each with a **hub** of up to six key facts, each checked against the article it comes from, so an agent can read one hub instead of the whole index. An article merged into another stays as a redirect, so links keep working.

## Small context windows

Custom can run models with small context windows, where memory must not crowd out the work. There memory's share is a percentage of the window, in three classes: **tiny** for a window under 12,000 tokens, **lean** up to about 33,000 tokens when the model is not through OpenRouter, and **full** for the rest. Claude Code, Codex and ACP agents manage their own context and count as full.

<!-- figure: budgets -->

A tiny window gets a block of at most 6% of it, with at most three notes, no index (one line says that `recall` finds more), and nothing added with messages or file touches. A lean one gets at most 6%, five notes, a short index and one note with a message. Your profile is cut to its first 400 words for lean and 120 for tiny, and a session that saw only the start of it cannot rewrite it. A test with a project of 150 notes measured the block at 1,668 characters for an 8k model, 3,776 for a 32k one and 7,323 for a 200k one.

## What you see, and what stays on your computer

**Settings → Capabilities → Memory** shows your profile, every note with its history, what the last tidy-up changed, and the switches. A note's dialog says who wrote it, how it is known, and how often agents were given it and used it. A project's **Memory** tab holds its notes, wiki articles and documents in one searchable list.

- **Undo.** After a reply, the chip **Memory · 1 added** opens what an agent saved, with **Undo this change**. **What changed** does the same for the tidy-up. Deleted notes stay 30 days.
- **Off switches.** The **Memory** switch turns it off for all sessions, and a session's menu for one. **Learn from conversations**, **Tidy up automatically** and **Search by meaning** each have a switch, and wiki memory is on or off for each project.
- **Confidential sessions** save nothing, are never read by learning, and do not use wiki memory.

Notes live in the app's database and wikis in plain files, both on your computer. Search by meaning runs on your CPU, and no note is sent anywhere to be searched. Only the helper model you pick reads anything else: notes, your words and agents' last replies, documents and commit messages, with secrets cut out first and everything treated as data, never as instructions. Pick a model on your own computer under **Settings → Agents → Models → Helper model** and nothing leaves it. [What leaves your computer](/docs/privacy) lists every connection the app makes.

The docs go further: [How memory works](/docs/how-memory-works), [Memory internals](/docs/memory-internals), and the guide's pages on [Memory](/docs/memory) and [Wiki memory](/docs/wiki-memory) for every setting. Or ask an agent what it remembers about a project, and which notes are not checked yet.
