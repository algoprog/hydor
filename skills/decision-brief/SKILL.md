---
name: decision-brief
description: Use when someone has to choose (a job offer, a supplier, a tool, a plan, whether to go ahead at all) and wants help deciding, or asks for a decision brief or a recommendation. Not for logging calls made while working alone (decisions-log).
category: planning
triggers: [help me decide, help us decide, decision brief, decision matrix, pros and cons, weigh the options, which option should, should i accept, should we go with, trade-offs, hard decision, can't decide]
---

# Decision brief

A decision gets easier when the real options sit side by side, judged against what matters to the
person, with a clear recommendation and the conditions that would change it. The result fits on one
page. The choice stays theirs: you lay it out and say what you would do.

## 1. Frame the decision

- Write it as one question with an owner and a date: "Which offer should Sam accept by 14 Nov?",
  "Do we move the shop online this year?"
- Name the goal behind it: what the choice is for. Options are judged against the goal, not against
  each other's features.
- **How reversible is it?** Cheap to undo (a monthly plan, a trial): decide quickly, try it, review.
  Hard to undo (a lease, a hire, a move, a sale): slow down and get evidence.
- Separate **must-haves** (any option without them is out) from **preferences** (they get weights).
- Ask only for what you cannot infer, one question at a time (the clarify-first skill's method); for
  several details at once, `ask_form` (criteria, budget, deadline).

## 2. Options: at least three

- List every real option, then make sure the set includes:
  - **Do nothing, or keep things as they are**, when that is possible. It is the baseline every
    other option has to beat.
  - **A middle way or a trial:** part of each, a pilot, a short delay to learn one thing first.
  - **One the person did not mention**, found by asking "how else could the goal be reached?"
- Watch for false either/or ("take the job or stay") and for two options that are really one with
  different timing.
- Drop options that fail a must-have, with a line on why. Keep three to five in the brief.

## 3. Criteria and weights

- Four to seven criteria, drawn from the goal: total cost over the period (not the price tag), time,
  risk, quality, effort to switch later, fit with values or brand, how it feels day to day.
- **Weights before scores.** Have the person split 100 points across the criteria, or rank them and
  propose weights for them to correct. Weights set after seeing the scores bend toward a favourite.
- Say what a low and a high score mean for each criterion ("Commute: 1 = over 90 minutes, 5 = under
  20"), so scores are not mood.

## 4. Evidence and scores

- Gather the facts for each option: prices, terms, reviews, data, the person's own numbers. Use the
  research skill for anything to look up, and cite it. Mark estimates as estimates, with a range.
- Keep each number with what it counts and when: "3 of 40 customers asked for it, in March", not
  "customers want it". When the count is missing, say so rather than writing a percentage.
- Score each option 1 to 5 on each criterion and work out the weighted total (weight × score, summed,
  divided by 100). A table works in the conversation; with `save_sheet` the person can change the
  weights and watch the totals move (`=SUMPRODUCT($B$2:$B$6,C2:C6)/100`).
- The total checks judgement; it does not replace it. If the winner feels wrong, something is
  missing: find the criterion or the weight, and add it.
- **Is it close?** Move the most uncertain score by one point, or the top weight by ten. If the winner
  changes, say the decision is close and turns on exactly that point.

## 5. Trade-offs and risks

- For the leading two options, say in one sentence each what choosing it gives up.
- Risks: what could go wrong, how likely, how bad, and what would reduce it. Include the worst case
  and whether the person could live with it.
- A pre-mortem: "It is a year later and this went badly. Why?" Three answers, each with a way to
  prevent it or to notice it early.
- Knock-on effects: who else it touches (family, team, customers), and what it leads to next.
- Leave out sunk costs: money and time already spent are gone whichever option wins.

## 6. Recommend

- Say which option and why in two or three sentences, tied to the criteria that weigh most.
- Say how sure you are, and what that rests on.
- **What would change it:** concrete conditions. "If B raises the salary above €68,000, B wins." "If
  fewer than 30 customers pre-order by March, keep the market stall."
- The first steps, the date to decide by, and for a reversible choice a date to review how it went.
- When it is genuinely close, say so and offer a tie-breaker: the more reversible option, a small
  test, or "which would you be relieved to hear had been chosen?"
- When the evidence is thin, recommend a small test rather than a confident yes: what is tried,
  for how long, who runs it, and the result that means go on or stop. Not an open-ended "find out
  more".
- For medical, legal, tax or large money decisions, the brief frames the questions to take to a
  professional; it does not stand in for one.

## 7. Write the brief

One page, recommendation at the top. The template and a filled-in example are in
`references/brief-template.md`.

- In the conversation for a quick one; with `save_doc` when the person will share, print or come
  back to it.
- `show_html` for a side-by-side view: the page kit's `table.n-compare` (with `.n-best` on the
  winning column) and `.n-proscons` suit it.
- `save_sheet` for a scoring table they will adjust themselves.
- Once it is decided, add a line at the top (what was chosen, by whom, when, and any disagreement),
  so the brief becomes the record to come back to at the review.

## Pitfalls

- Two options presented as the only two.
- Weights chosen after the scores.
- Must-haves mixed in with weighted criteria.
- False precision: 3.62 against 3.58 is a tie.
- Sunk costs treated as a reason.
- A recommendation without the conditions that would change it.
- Steering toward your preference instead of the person's goal.
- Leaving out the evidence that points the other way, or making a weak case sound certain.
