---
name: troubleshooting
description: Use when something does not work as expected and the cause is not yet known, in any field (an error or failing test, a broken setup or device, a home network, a spreadsheet, a recipe or process that keeps going wrong).
triggers: [not working, doesn't work, does not work, isn't working, stopped working, keeps failing, keeps crashing, won't start, troubleshoot*, debug*, fails with]
---

# Troubleshooting

For anything that does not behave as it should: software, a printer, a home network, a spreadsheet
formula, a bread that will not rise. The method is the same: see it fail, find out why, change one
thing at a time, and see it fixed.

## 1. Reproduce it first

- Make it fail on purpose, reliably, before changing anything. Write down the exact steps, the input,
  where it happens, and the exact symptom. Copy error messages word for word.
- If you cannot make it fail, gather facts instead of guessing: logs, when it started, how often,
  what changed around then.
- Shrink it: find the smallest case that still fails (one file, one row, one device, one step).

## 2. Facts before theories

- Read the whole error and the logs, not just the first line.
- Ask what changed: an update, an edit, a new part, a move, the weather, a different supplier.
- Compare with a case that works. The difference between the two is where the cause lives.
- Keep what you know apart from what you assume.

## 3. One hypothesis at a time

- Write one hypothesis: "X causes it, because Y." Say what you would see if it were true.
- Pick a test that could prove it wrong. Change one thing only, run the reproduction, read the result.
- Keep a short log (`references/log.md`): hypothesis, test, result, conclusion. Put back changes that
  did not help, unless they are improvements of their own.
- Never stack several fixes at once: when it starts working you will not know which one did it, or
  which one broke something else.

## 4. Fix the cause, then prove it

- Fix where the cause is, not only where the symptom shows.
- Run the original reproduction again: it must pass now. Check that the things next to it still work.
- In code, add a test that fails without the fix, where that is practical.
- Report with evidence (see the evidence-before-done skill): what the cause was, what changed, and the
  check that shows it works.

## 5. After three failed fixes, step back

Three fixes that did not work mean your picture of the problem is wrong. Stop fixing.

- Reread the facts and the log. List your assumptions and check each one.
- Widen the search: the environment, the data, the version, the layer underneath, the part you
  trusted.
- Ask the user for facts only they have, or suggest a different route.
- Tell the user where things stand: what you tried, what you learned, what you will try next.

## Pitfalls

- Changing things before seeing it fail.
- Guessing with several changes at once.
- Calling it fixed without running the reproduction again.
- Repeating the same attempt and hoping for a different result.
