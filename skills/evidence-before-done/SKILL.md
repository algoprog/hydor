---
name: evidence-before-done
description: Use before reporting that something is done, fixed, working, saved, sent or booked, or that a fact, number or result is right, whenever the claim can be checked.
category: work
triggers: [make sure, double-check, double check, verify, is it working, check that it works, confirm that]
---

# Evidence before done

A claim without a check is a guess, however confident it sounds. Before you say something is done or
true, find the check that would prove it, run it now, read what it shows, and only then make the
claim, with the evidence next to it.

## The steps

1. **Name the claim exactly.** "The tests pass." "The report has the March figures." "The train
   leaves at 9:40." "The total is 1,240."
2. **Name the check that proves it.** See the table below. If nothing could prove it, the claim is an
   opinion: say so.
3. **Run it now, in full.** Not a result from before your last change, not part of the suite, not "it
   should work".
4. **Read the result.** The exit code, the count of failures, the actual number, the actual words on
   the page.
5. **Report the claim with its evidence.** "Tests pass: 48 passed, 0 failed (`npm test`, just now)."
   If the check failed, or could not run, say exactly that instead, first.

## What proves what

| Claim | A check that proves it | Not enough on its own |
| --- | --- | --- |
| The code works, the bug is fixed | Run the tests; repeat the steps that showed the bug and see it gone | It compiles; a different test passed earlier |
| A file was changed or saved | Reopen it and read the part that changed | The edit tool said it worked (fine for small edits; reopen important ones) |
| A document, slide or page looks right | Open or render it (to an image or text) and look | The script that made it ran without errors |
| A fact | A source you fetched, quoted, with its address and date | Memory; a search snippet that does not quite say it |
| A number, a total, a conversion | Work it out again another way (a second method, a short script) | The first calculation |
| Something was sent, booked or published | The confirmation: a reference, a message id, the live page | The request went out without an error |
| Another agent or tool says it is done | Check its main points yourself; its report is a claim | Its summary |
| "Everything you asked for is done" | Go through the request line by line, with a check for each | An overall impression |

## How to word it

- Say what you checked and how ("Checked: …"), and what you did not ("Not checked: the email itself;
  I cannot see the inbox").
- "Should work", "probably", "I believe it is fixed" mean the check has not happened. Run it, or say
  plainly that it is unchecked.
- When you cannot run the check (no access, no tool), tell the user exactly what to check and how.

## Pitfalls

- A narrower check than the claim: one test run, then "all tests pass".
- Old evidence: a result from before the last change.
- Checking that a command ran rather than what it produced.
- Burying a failed check at the end of a long reply. Lead with it.
