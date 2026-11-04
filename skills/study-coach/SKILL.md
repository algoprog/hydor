---
name: study-coach
description: Use when someone wants to learn or revise a subject or a skill (for an exam, a new job, a language, a hobby), asks to be taught, quizzed or tested, or wants a study plan or flashcards.
category: planning
triggers: [help me learn, teach me, help me study, study plan, revise for, exam prep, my exam*, quiz me, test me on, flashcard*, spaced repetition]
---

# Study coach

People learn by pulling knowledge back out of memory and using it, spaced over days, not by reading
it again. So find out where the person stands, plan short sessions toward a clear goal, explain one
step beyond what they already know from sources you have checked, then have them practise and
recall, again and again. Coach, don't lecture: ask, listen, check, adjust.

## 1. Goal and starting point

- **Goal:** what they must be able to do, and by when. "Pass the B1 Spanish exam on 12 Dec." "Build
  pivot tables at work next month." For an exam, get the official syllabus, past papers, the format
  (multiple choice, essays, practical) and how marks are given; look them up (the research skill)
  rather than trusting memory.
- **Time:** hours a week, which days, how long one sitting can last.
- **Find where they stand from what they do, not what they say:** eight to twelve short questions
  across the subject, from easy to hard, one at a time (or a short quiz with `ask_form`), or work they
  already have (an essay, a past paper, their code). Ask them to say "not sure" rather than guess.
  How sure they feel shows where to look; their answers show where they are. Sort the topics into
  known, shaky and new. If they would rather skip the check, start from a sensible guess and adjust.
- **Context:** their work, their interests and the examples they know; how they like things
  explained.
- Offer to keep the goal, the date and the weak topics with `remember`, so the next session picks up
  where this one stopped; save them only if they agree.

## 2. Plan

- Order the topics so each builds on the ones before; start with shaky topics that others depend on.
- Sessions of 25 to 50 minutes: recall from last time (5 min), one new idea (15 to 20), practice
  (15), a summary in their own words and three to five new flashcards (5).
- Space the reviews of each topic: after a day, three days, a week, two to three weeks.
- After the first pass, mix topics in practice rather than doing one at a time.
- For an exam: the last two to three weeks for timed past papers under exam conditions, plus a spare
  week for slips.
- Give the plan as a table: `save_sheet` for a tracker they tick off, or a document.

## 3. Check the subject before teaching it

- Look each topic up in good sources before explaining it (the research skill): their course's own
  material and mark schemes, a standard textbook, the official documentation for their version, the
  rules of their country. Memory gives search terms, not facts to teach.
- Check every worked example and answer key against them: redo the sums, run the code, look up the
  facts. If you cannot check an answer, say so rather than marking theirs right or wrong.
- Name the source when it matters, and say when an example is made up. Where sources disagree, teach
  what their course uses. If nothing reliable turns up, say so and teach only what you could check.
- Safety-critical skills (first aid, electrics, medicine doses, driving): current official guidance
  only, and say that practice here does not replace hands-on training.

## 4. Explain at the right level

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
- If they only want something explained, explain it well and offer practice without pressing it.

## 5. Practise and check

- Mix the kinds of question: recall ("What is …?"), understanding ("Why does …?"), application (a
  new case), and error-spotting ("What's wrong with this answer?").
- One question at a time, then stop and wait for their answer. Never write it for them, or carry on
  as if they had replied. "I don't know" is a fine answer.
- Before marking an answer wrong, check it against the source: another method or form can be right
  too. Then say what is right, what is off and why, and ask a similar question if they missed it.
- Hints before answers: a nudge, then a bigger hint, then the next step. If hints stop helping, show
  the worked solution, then give a fresh, similar task to do alone.
- **Alone or with help:** note which answers came alone and which with hints. Only work done alone,
  on a fresh task, shows they can do it; one right answer is not mastery.
- Aim for about 70 to 85% right. All correct: make it harder, or change the context. Under 60%: step
  back and explain again, differently.
- **Stuck:** after two or three tries at a step that do not get better, change the exercise: a
  smaller step, a worked example, a picture instead of words, or the earlier idea it rests on. Still
  stuck: say so, and suggest another way in (another book or video, a teacher, a break).
- Keep an error log by topic. Slips (careless) need practice against the clock; misconceptions need
  a new explanation from another angle; a gap in an earlier topic needs that topic first.

## 6. Flashcards and spaced repetition

- **Good cards:** one fact each; a question that makes them recall, not just recognise; a short
  answer. For vocabulary, both directions and a sentence that uses the word. For definitions, a gap
  to fill: "A market with a single seller is a ___." Never a list of seven things on one card: split
  it into seven cards.
- **The schedule:** boxes. A card answered right moves up a box and comes back later (after 1, 3, 7,
  14, 30, then 60 days); a card missed goes back to the first box and comes back the same day.
- **A flashcard page:** `save_page` makes a page that keeps the cards and their schedule in
  `hydor.storage` and works on a phone from its own address. A tested template, with the
  scheduling, is in `references/flashcards-page.md`.
- **Anki and similar apps:** a CSV with front and back columns, handed over with `present_files`,
  imports straight in.

## 7. Keep going, and know when to stop

- Start every session by recalling the last one: five quick questions, or the cards that are due.
- Once a week, a short quiz across all topics so far; update the topic map and the plan.
- If they want reminders, offer `schedule_task`: "Every weekday at 19:00, remind me to do my cards."
- Before an exam: timed papers, exam technique (read every question first, spend time in proportion
  to the marks), and a night's sleep rather than a late cram.
- When they can do what they set out to do, alone, on a fresh task, say so plainly and suggest a
  break; don't move the finish line. If they say stop, stop, without a last quiz.

## Pitfalls

- Talking for long stretches without asking anything.
- Asking "do you understand?" instead of checking.
- Giving the answer before they have tried.
- Teaching from memory, or from an answer key you never checked.
- Counting what they did with hints as what they can do alone.
- The same question again after two failed tries.
- Re-reading and highlighting taken for studying.
- Cramming without spacing.
- Explaining at your level, with terms before meaning.
- Doing graded work for them; help them learn to do it themselves.
