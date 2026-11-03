---
name: weekly-review
description: Use when someone wants a weekly review or reset, asks to plan their coming week, or feels things are slipping and wants their notes, calendar, mail and task lists brought into order. Not for planning a single project (project-plan).
category: planning
triggers: [weekly review, weekly reset, weekly planning, plan my week, plan next week, review my week, review last week, my week ahead, open loops, next week's priorities]
---

# Weekly review

Once a week, get every open loop out of the person's head and tools onto one list, decide what each
one needs, look back at the week, and choose the few things that matter next week, with time set
aside for them. You do the gathering, sorting and arithmetic; the person makes the calls. The first
review takes about an hour; later ones, half that.

## 1. Gather

Collect from every place where work hides, with what you can reach (`list_connections` shows the
connected accounts; for the rest, ask for an export or a pasted list):

- **Calendar:** the past week, and the next two weeks.
- **Task lists:** Todoist, Notion, Asana, Linear, a to-do file, notes typed in from paper.
- **Mail and chat:** flagged or starred messages, threads waiting on the person, promises made in
  replies (the email skill's triage does this part).
- **Notes:** meeting notes, memory notes on deadlines and promises (`recall`), last week's review.
- **Their head:** ask "What's on your mind that isn't written down anywhere?", then prompt by area:
  work, home, money, health, family and friends, admin, things promised to someone, things someone
  promised them.

Put everything on one flat list, duplicates merged. Do not sort yet.

## 2. Clarify each item

Decide with the person, item by item:

- **Not actionable:** delete it, park it under Someday, or file it as reference.
- **One step:** write the next physical action, verb first: "Email Priya the draft", not "Report".
  If it takes under two minutes, mark it to do straight after the review.
- **Several steps:** it is a project. Give it an outcome ("Kitchen quote accepted") and one next
  action.
- **Someone else's move:** a Waiting for item, with who, what, and the date it was asked.
- **Tied to a date:** a deadline goes on the list with its date; an appointment goes on the calendar.

## 3. Look back

Short and factual, no verdicts:

- What got done? Read closed tasks, past events and sent mail; name three things that went well.
- What was planned and did not happen, and why: too big, blocked, interrupted, no longer important,
  or too much planned?
- Where the time went: hours in meetings against hours of focused work, from the calendar, set
  against what the person meant to spend it on.
- One thing to do differently next week.

## 4. Spot what is stuck

| Sign | Likely cause | Suggest |
| --- | --- | --- |
| A project with nothing finished in two weeks | no clear next action, or no longer wanted | write the next action, or move it to Someday |
| A task moved three times or more | too big, unclear or dreaded | split it, make the first step tiny, or drop it |
| Waiting for something for over a week | the other person forgot | a short chaser (the email skill) |
| A deadline within two weeks and no plan | not started | book the first block of time now |

Name each stuck item and one move for it; the person decides.

## 5. Plan next week

1. **Count the time.** From the calendar, subtract meetings, travel and fixed commitments, then keep
   20 to 30% free for the unplanned. What is left is the week's real capacity for focused work.
2. **Pick three priorities**, written as outcomes ("Proposal sent to Acme"), not activities ("Work
   on proposal"). Propose them from deadlines, goals and what is stuck; the person chooses.
3. **Block time** for each priority in the hours the person works best (ask once, then keep it with
   `remember`), plus one block for admin and email.
4. **Check the load.** If the hours the plan needs exceed the capacity, show the numbers and ask what
   to drop, move or hand to someone else. Never let the plan quietly overflow.
5. **List the rest:** this week's deadlines, Waiting for items to chase, next actions grouped by
   where they happen (calls, computer, errands).

Creating events, moving meetings or changing tasks in the person's accounts changes things: show the
plan first, and make those changes after a yes.

## 6. Write it down

Keep the review where next week's can find it; the format is in `references/review-template.md`.

- `save_doc` keeps it in the Library, to read and print. A page made with `save_page` can hold the
  week's priorities as a checklist that keeps its ticks (`hydor.storage`). A Markdown file suits
  someone who keeps their notes in a folder.
- Next week, start by comparing: which priorities happened, which carried over, and why.

## 7. Make it a habit

Offer a scheduled task with `schedule_task`, for example Fridays at 16:00, that gathers the
calendar, tasks and flagged mail, drafts the look back and the list of stuck items, and leaves every
choice to the person. Its prompt must stand on its own, since the run sees nothing of this
conversation; a ready prompt is in the template file.

## Pitfalls

- Planning more than the week holds: the most common failure.
- Tasks without verbs, and projects sitting on the list as if they were single tasks.
- Rebuilding the whole system instead of reviewing it.
- Choosing the priorities for the person.
- Skipping the look back, so the same plan fails the same way.
- Changing calendars or task lists without asking.
