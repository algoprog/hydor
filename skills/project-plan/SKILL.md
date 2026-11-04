---
name: project-plan
description: Use when a project (an event, a move, a launch, a renovation, software) needs a plan with milestones, tasks, owners, dates and risks, or a plan needs updating. Not for the first questions on a vague idea (clarify-first).
category: planning
triggers: [project plan, project timeline, project schedule, gantt*, milestones, critical path, work breakdown, launch plan, plan the launch, plan our move, moving house, event planning]
---

# Project plan

A project plan says who does what, by when, in an order that works, with the risks in view, and it
is kept up to date as things change. The method is the same for a wedding, a house move, a product
launch, a renovation or software; only the scale changes. If the goal itself is still vague, use the
clarify-first skill first, then start here from its brief.

## 1. Goal, scope and limits

Agree a short block with the person before any task list:

- **Goal:** one sentence with a finish line. "Move the family from Leeds to Bristol by 31 March,
  under £6,000, with no missed school days."
- **Done when:** what will be true, in terms anyone can check.
- **In scope and out of scope:** two short lists, so nobody expects what is not planned.
- **Limits:** the deadline, the budget, who is available and when, rules (permits, policies).
- **What gives first** when something has to: the date, the budget or the scope. Ask; the answer
  settles every later trade-off.
- **People:** who decides, who does the work, who must be kept informed.

## 2. Milestones

- Four to eight points where something is decided, delivered or can no longer be undone: "Venue
  booked", "Contract signed", "Beta live", "Kitchen units delivered". Each gets a date and a sentence
  on what reaching it means.
- With a fixed date (an event, a move, a launch day), plan backwards from it. With an open end, plan
  forwards from the start.

## 3. Tasks

- Break each milestone into tasks one person can finish in half a day to a few days (an hour or two
  for a small personal project). Verb first, with a visible result: "Get three removal quotes", not
  "Removals".
- Each task gets **one owner** (a name, never "the team"), an estimate, a start, an end, a status and
  what it depends on.
- For work nobody has done before, estimate a range (best, likely, worst), plan with
  (best + 4 × likely + worst) ÷ 6, and keep the worst case in view.
- Add the tasks people forget: approvals and sign-offs, ordering and delivery times, waiting for
  permits or replies, testing, travel, telling people, handover, clearing up. Checklists for events,
  moves, launches, renovations and software are in `references/checklists.md`.
- Start the long waits first: deliveries, permits, visas, printing, notice periods, popular venues
  and trades. They take time but little effort.

## 4. Order and dependencies

- For each task, note which tasks must finish before it can start. That covers nearly everything;
  mark the rare "must start together" by hand.
- **The critical path** is the longest chain of dependent tasks: a day lost on it is a day lost at
  the end. Mark it, and watch it first.
- Run in parallel whatever does not depend on each other, and check that no one is booked on two
  things at once.
- **Buffer:** add 15 to 25% of the critical path as one visible buffer before the deadline (more for
  unfamiliar work). Buffer hidden inside every estimate gets used up without anyone noticing.
- Detail the next two to four weeks fully; keep later work at milestone level and fill it in as the
  project moves.

## 5. Risks

A short register of the top five to ten: the risk, its likelihood and impact (low, medium, high), an
owner, what reduces it now, and the trigger and response if it happens. "If the worktop has not
shipped by 1 Dec, switch to the stock laminate (two weeks faster)." The usual ones: a supplier late,
someone ill or away, costs over budget, approvals slow, the weather, the scope growing.

## 6. The timeline

**A spreadsheet** with `save_sheet` (or an .xlsx with the spreadsheets skill, for coloured bars and
conditional formatting). Sheets: Plan, Milestones, Risks, and Budget when there is one. The Plan
sheet's columns: ID, Task, Milestone, Owner, Depends on, Start, Days, End, Status, Late, Notes.
Compute dates rather than typing them, so one slip moves everything after it:

- End: `=WORKDAY(F2,G2-1)`, or `=F2+G2-1` in calendar days (a move, an event weekend).
- The start of a task that follows task 3 (row 4): `=WORKDAY(H4,1)`; after several,
  `=WORKDAY(MAX(H4,H6),1)`.
- Late: `=IF(AND(H2<TODAY(),I2<>"Done"),"Late","")`.

Bars week by week can be drawn with formulas, one column per week. The full layout, with a
`save_sheet` example, is in `references/plan-sheet.md`.

**A page** with `save_page` when the plan is looked at more than edited: bars on a timeline,
milestones, a line for today, and tasks ticked off and kept with `hydor.storage`; it opens on a
phone at its own address.

## 7. Check the plan before sharing it

- Every "Done when" item and every in-scope item is reached by a milestone and its tasks, and no
  task serves something out of scope.
- Every task has one owner, an estimate and its dependencies; each long wait starts early enough
  to end before the task that needs it.
- The end, with the buffer, falls before the deadline; costs stay within the budget; nobody is
  booked on two things at once (look down each owner's weeks).
- Each decision still open has an owner and a date to decide by, and the tasks it holds up are
  marked Waiting.
- In a sheet, read it back (`get_page`): no error values, the critical path marked, and every End,
  and every Start after the first tasks, a formula rather than a typed date, so one slip moves
  everything after it.

## 8. Keep it up to date

- Agree a rhythm: weekly, or at each milestone. Each update: the status and dates of open tasks, the
  critical path checked again, the risks reviewed, new tasks added.
- Report in three lines: on track, at risk, late, or unknown (no fresh news is unknown, not on
  track); what was done since last time; what is next and what is needed from whom. Say when the
  end date moves, and why, as soon as you know it, not at the next update.
- When someone adds to the scope, say what it costs in time or money and ask which limit gives.
  Offer the choices: add it and move the date or budget, swap it for something of the same size,
  do it later, or not at all.
- **When it slips:** find what is really holding it up (one person, a supplier, a decision not
  made, work being redone). Then choose, guided by what gives first (step 1): simplify or cut
  scope, re-order around the blocker, run more in parallel, deliver in stages, move the date.
  People added late cost time before they save it (someone has to show them the work); overtime
  helps for a week or two, not as the plan. Give the new forecast at once, next to the baseline.
- Keep the agreed dates as a baseline: copy them once, as plain dates, into a Baseline end column,
  so slips show against them. (The sheet's earlier versions are kept too, but only the latest 40.)
- Offer a scheduled task (`schedule_task`) that reads the plan each Monday and sums up what is late
  and what is due, or asks the owners for their updates.
- **Closing:** check with whoever decides that it is done as agreed (the "Done when" list); give
  every leftover item an owner and a date, or drop it openly; hand over what others will now run
  or look after; note three lessons for next time.

## Pitfalls

- Tasks with no owner, or with several.
- Only the happy path: no waiting times, approvals or buffer.
- Typed dates that stay put when a task before them slips.
- Months planned in fine detail, then never updated.
- Estimates for unfamiliar work taken from the best case.
- A plan made once and left alone: it is only useful while it is current.
