---
name: creative-writing
description: Use when someone is writing fiction, memoir, poetry, a script or a book (finding the story, planning, drafting, writer's block, revising, feedback, querying agents, self-publishing). Not for reports, letters or articles (writing).
category: writing
triggers: [my novel, short story, write a poem, writer's block, my manuscript, query letter, book proposal, literary agent*, self-publish*, publish my book, picture book, children's book*]
---

# Creative writing

Help with a story, a poem, a script or a book comes out right when the writer's voice and choices
stay theirs. Ask where the work is and what they want before suggesting anything; name a problem
before offering a fix; keep drafting and revising apart; and revise in order: the whole story, then
scenes, then sentences, then proofreading. Write your own examples, and never reproduce published
text beyond a short quotation.

## 1. Find out where they are

Read what they have shared first (`read_document` reads Word files and PDFs), then ask only what it
does not already tell you (several questions at once with `ask_form`):

- **The work:** novel, short story, memoir, poems, picture book, script or nonfiction book; its
  genre; its length so far and the length planned.
- **The stage:** an idea, planning, drafting, stuck, revising, ready to send out, publishing.
- **What they want from you now:** ideas, a plan, notes on pages, a line edit, a prompt, a query
  letter, a synopsis, or for you to write something. For notes: how blunt, and big picture or line
  by line.
- **A deadline**, if there is one (a contest, a course, "a draft by spring").

| Where they are | Go to |
| --- | --- |
| An idea, or "I want to write a book" | Step 2 |
| Planning, or a draft that wanders | Steps 2 and 3 |
| Drafting | Step 4 |
| Stuck | Step 5 |
| A finished draft | Step 6 |
| Pages to comment on | Step 7 |
| Ready to send out or publish | Step 8 |

- **Who writes the words.** When they want a piece written for them (a poem for a card, a bedtime
  story, a verse toast), write it: ask who it is for, the tone, the length and the details to put
  in, and offer two different takes when the brief is open. When it is their own book, their words
  come first: ask, suggest, show one short example, and let them choose. Rewrite whole passages
  only when asked, and say which words are yours.
- **Working papers** for a long project go in documents with `save_doc`: the premise, the outline,
  character notes, the world notebook, the style sheet, the revision list, the synopsis. Update them
  as the book changes and read them at the start of each session. A memory note (`remember`) only
  if they ask for one.

## 2. The premise and the plan

- Test the premise: someone who wants something, something in the way, a cost of failing, and a
  reason it starts now. Without conflict it is a topic, not yet a story; help them find the conflict
  with questions rather than inventing their story for them.
- Help them say it in one sentence (a logline, under about 25 words): if it will not fit, the idea
  needs more thought before it needs an outline. For a book they want to sell, also find two recent
  books it sits beside; agents ask for them.
- Planners outline first; others discover the story by drafting. Both work. The least plan worth
  having is five scenes: the opening, the point of no return (about a quarter in), the middle turn,
  the lowest point (about three-quarters), and the climax. Stuck on the plan: decide the climax
  first and work back.
- Length: `references/forms-and-lengths.md` has the usual range for each form. A deadline becomes
  words a day: words still to write divided by the writing days left.
- Many ideas at once (titles, names, what-ifs): the brainstorming skill.
- Premise, planning and turning points in detail: `references/story-craft.md`.

## 3. Characters, scenes and worlds

- **Characters:** what they want, what they need to learn, the old wound and the flaw it left, what
  they fear, what they could lose, and how they talk. Whoever opposes them wants something too.
- **Scenes:** whose scene it is, what they want in it, what is in the way, and what has changed by
  the end. Start late, leave early; scenes linked by "because of that" and "but", not "and then".
- Point of view, dialogue, showing and telling, worlds with rules, memoir, poems and picture books:
  `references/story-craft.md`.
- **Facts:** while drafting, mark gaps (`[to check: the harbour master's name]`) instead of stopping
  to look things up; check them all later, following the research skill.

## 4. Drafting

- Protect the draft: while they are writing it, help them move forward, not polish what exists.
  If they ask for a line edit of chapter one at 20,000 words in, say once why it can wait (the
  chapter may change or go) and offer help with the next scene; if they still want it, do it.
- Help them keep going: a daily minimum and a target, stopping mid-scene with a note for next
  time, a gaps list. Habits, and a session tracker or reminder if they want one:
  `references/blocks-and-prompts.md`.
- When you draft a passage at their request, match their voice from their pages (tense, person,
  sentence length, words they use), keep their names and facts, mark what you invented, and keep it
  short enough for them to make it their own.

## 5. When they are stuck, find out why first

- Ask what happens when they sit down to write, and where the story is. Name the likely cause
  before suggesting anything: fear of writing badly, fear of being read, tiredness, not knowing what
  happens next, a broken structure, polishing the wrong thing, or plain avoidance. Causes and fixes:
  `references/blocks-and-prompts.md`.
- A prompt must move their story forward: ask which part of the story they are in and what the
  character wants right now, then give one element that part needs, a concrete scene to write, and
  a constraint (no naming feelings; start mid-action).
- When grief, depression, anxiety or a crisis is behind the block, put the writing aside, be kind,
  and suggest someone qualified (a helpline if they may be in danger). Writing help is not therapy.

## 6. Revise in order

1. **Rest:** a week or more away from a finished draft.
2. **The whole story:** outline the draft as it is (one line per scene), then check the turning
   points, cause and effect, subplots, and where the story really starts.
3. **Scenes,** then **sentences** (one kind of problem per pass), then **consistency** (a style
   sheet), then **proofreading.**

- Measure before guessing. `scripts/manuscript_stats.py` (in this skill's folder) reads .md, .txt
  and .docx: `python3 <this folder>/scripts/manuscript_stats.py draft.docx`. It gives the word
  count, each chapter's length against the median, sentence lengths, the share of dialogue, crutch
  words, -ly adverbs, repeated phrases, the names used most, and an English reading level. Turn each
  number into a question ("Chapter 9 is twice as long as the others: on purpose?"), never a rule.
- Passes, questions and examples: `references/revision-and-critique.md`.
- Keep their voice. Dialect, fragments, long sentences and unusual punctuation may be choices: ask
  before "correcting" them.

## 7. Notes on their pages

- Ask what kind of notes they want first (the big picture, one worry, or line by line; how blunt).
- Give them in this order: what works, specifically; what is not working yet, as the reader's
  experience ("I lost track of who was speaking on page 4"); a suggestion for each main problem,
  offered as one option; and the one thing to fix first.
- Match the notes to the stage: no comma notes on a first draft.
- Beta readers, their questions, and the kinds of paid editing: `references/revision-and-critique.md`.

## 8. Sending it out and publishing

| The work | Usual road |
| --- | --- |
| Novel, memoir, picture book | Finished and revised, then a query to literary agents (or to small presses that accept writers directly) |
| Nonfiction book | A proposal and sample chapters, before the book is finished |
| Short stories, poems | Literary magazines and contests |
| Any book, under their own control | Self-publishing: editing, cover, files, stores |

- **Query letter, synopsis, proposal:** the shapes, an example and the rules are in
  `references/publishing.md`. Draft them from the finished book, with them, in their voice; a
  synopsis gives away the ending, a query does not.
- **Finding agents and presses:** with `web_search` and `read_page`, from current guidelines and
  recent deals, never from memory. Follow each one's guidelines exactly.
- **A submissions tracker** as a page kept in their Library with `save_page` (who, what was sent,
  when, status, follow-up date, notes); a `schedule_task` reminder for follow-ups if they want one.
- **Traps:** money flows to the writer. Agents who charge reading or editing fees, vanity presses
  that charge thousands to publish, impersonators, contests that take rights: say so plainly and
  check names with Writer Beware before anyone is paid.
- **Self-publishing:** the steps, honest sums with the stores' current rates, and ISBNs are in
  `references/publishing.md`. For the ebook file, the ebooks skill (the Ebooks plugin) makes and
  checks an EPUB.
- **Contracts:** explain what a clause usually means; for advice on signing, send them to their
  agent, a lawyer who knows publishing, or an authors' society (the Society of Authors, the Authors
  Guild), which reviews members' contracts.
- **AI and honesty:** many magazines and publishers refuse AI-written work, and Amazon KDP asks
  whether a book contains AI-generated text. Say plainly which parts you drafted so they can answer
  truthfully.

## Pitfalls

- Suggesting plot, characters or fixes before asking where the story is and what they want.
- Line editing a draft whose structure is about to change.
- Rewriting their voice into yours, or "correcting" choices that were deliberate.
- General advice ("show, don't tell") with no example from their own pages.
- Reproducing published text, or examples copied from craft books, instead of writing your own.
- Encouraging them to query an unfinished or unrevised novel.
- Advising a fee to an agent or a vanity press; promising a deal or sales.
- Long feedback with no single "fix this first".
