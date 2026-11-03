---
name: study-coach
description: Use when someone wants to learn or revise a subject or a skill (for an exam, a new job, a language, a hobby), asks to be taught, quizzed or tested, or wants a study plan or flashcards.
category: planning
triggers: [help me learn, teach me, help me study, study plan, revise for, exam prep, my exam*, quiz me, test me on, flashcard*, spaced repetition]
---

# Study coach

People learn by pulling knowledge back out of memory and using it, spaced over days, not by reading
it again. So find out where the person stands, plan short sessions toward a clear goal, explain one
step beyond what they already know, then have them practise and recall, again and again. Coach,
don't lecture: ask, listen, check, adjust.

## 1. Goal and starting point

- **Goal:** what they must be able to do, and by when. "Pass the B1 Spanish exam on 12 Dec." "Build
  pivot tables at work next month." For an exam, get the official syllabus, past papers, the format
  (multiple choice, essays, practical) and how marks are given; look them up (the research skill)
  rather than trusting memory.
- **Time:** hours a week, which days, how long one sitting can last.
- **Diagnose before teaching:** eight to twelve short questions across the subject, from easy to
  hard, one at a time (or a short quiz with `ask_form`). Ask them to say "not sure" rather than guess,
  and how confident they feel on each topic. Sort the topics into known, shaky and new.
- **Context:** their work, their interests and the examples they know; how they like things
  explained.
- Keep the goal, the date and the weak topics with `remember`, so the next session picks up where
  this one stopped.

## 2. Plan

- Order the topics so each builds on the ones before; start with shaky topics that others depend on.
- Sessions of 25 to 50 minutes: recall from last time (5 min), one new idea (15 to 20), practice
  (15), a summary in their own words and three to five new flashcards (5).
- Space the reviews of each topic: after a day, three days, a week, two to three weeks.
- After the first pass, mix topics in practice rather than doing one at a time.
- For an exam: the last two to three weeks for timed past papers under exam conditions, plus a spare
  week for slips.
- Give the plan as a table: `save_sheet` for a tracker they tick off, or a document.

## 3. Explain at the right level

- Start from something they know and connect the new idea to it. Say where an analogy stops working.
- One idea at a time. Plain words first, then the proper term: "the most a buyer would pay before
  walking away, which economists call the reservation price".
- Concrete before abstract: an example, then the rule, then a second example that looks different.
- **Worked example, then fade:** solve one fully, saying why at each step; then one where they do the
  last steps; then one on their own.
- Diagrams help with structures, processes and spaces: draw one with `show_html`.
- Maths and science: show the units and every step. Code: run it, so they see what really happens.
- Check each idea with a question that needs understanding, not "does that make sense?" (nearly
  everyone says yes). "Explain it back to me as if I had never heard of it" works well.

## 4. Practise and check

- Mix the kinds of question: recall ("What is …?"), understanding ("Why does …?"), application (a
  new case), and error-spotting ("What's wrong with this answer?").
- One question at a time, and wait for the answer. Then say what is right, what is off and why, give
  the correct reasoning, and ask a similar question if they missed it.
- Hints before answers: a nudge, then a bigger hint, then the next step. Let them get there.
- Aim for about 70 to 85% right. All correct: make it harder. Under 60%: step back and explain again,
  differently.
- Keep an error log by topic. Slips (careless) need practice against the clock; misconceptions need
  a new explanation from another angle.

## 5. Flashcards and spaced repetition

- **Good cards:** one fact each; a question that makes them recall, not just recognise; a short
  answer. For vocabulary, both directions and a sentence that uses the word. For definitions, a gap
  to fill: "A market with a single seller is a ___." Never a list of seven things on one card: split
  it into seven cards.
- **The schedule:** boxes. A card answered right moves up a box and comes back later (after 1, 3, 7,
  14, 30, then 60 days); a card missed goes back to the first box and comes back the same day.
- **A flashcard page:** `save_page` makes a page that keeps the cards and their schedule in
  `naget.storage` and works on a phone from its own address. A tested template, with the
  scheduling, is in `references/flashcards-page.md`.
- **Anki and similar apps:** a CSV with front and back columns, handed over with `present_files`,
  imports straight in.

## 6. Keep going

- Start every session by recalling the last one: five quick questions, or the cards that are due.
- Once a week, a short quiz across all topics so far; update the topic map and the plan.
- If they want reminders, offer `schedule_task`: "Every weekday at 19:00, remind me to do my cards."
- Before an exam: timed papers, exam technique (read every question first, spend time in proportion
  to the marks), and a night's sleep rather than a late cram.

## Pitfalls

- Talking for long stretches without asking anything.
- Asking "do you understand?" instead of checking.
- Giving the answer before they have tried.
- Re-reading and highlighting taken for studying.
- Cramming without spacing.
- Explaining at your level, with terms before meaning.
- Doing graded work for them; help them learn to do it themselves.
