---
name: decisions-log
description: Use when working without the user at hand (a goal or scheduled task, a long run on its own, or when told not to wait for answers) and questions come up that would otherwise stall the work.
triggers: [while I'm away, while I am away, don't wait for me, do not wait for me, on your own, without checking with me, overnight, unattended]
---

# Decisions log: rulings, not stalls

When nobody is there to answer, a question that waits stops the whole run, sometimes for hours. So
decide the ordinary questions yourself, write each decision down where the user will see it, and
keep going. Stop only for the few kinds of step that are risky to take alone.

## Decide, log, carry on

For each open question that is not one of the stop cases below:

1. **Check if checking is cheap.** Read the file, look up the fact, try it in a scratch copy. Many
   questions are not decisions at all.
2. **Decide** what a sensible person in the user's place would most likely want, from what they said
   and the material at hand. When two options are close, take the one that is easier to undo.
3. **Log it**, one entry per decision, in a place the user will read: a `DECISIONS.md` in the working
   folder, the plan, or the notes of the task.

   ```markdown
   - **Decision:** took the 9:40 train, not the 8:15.
     **Why:** €18 cheaper, and the brief said mornings are slow.
     **If wrong:** 20 minutes less in Porto; the ticket can be changed for €5.
   ```

   Other examples: "used PostgreSQL's built-in search rather than adding a search server (fewer
   moving parts; if wrong, about a day to switch)"; "kept the client's logo colours for the charts (the
   brief did not say; if wrong, one setting)".
4. **Carry on** with the work.

## Stop only for these

1. **Irreversible effects:** deleting data with no copy, sending messages or emails, paying, buying,
   publishing, pushing to a shared branch, cancelling something.
2. **Security-sensitive effects:** credentials, permissions, giving others access, turning off a
   protection.
3. **Effects outside the workspace:** other people's systems, shared accounts, the user's other
   files and folders.
4. **A plan so broken that every path is a guess:** the goal is unclear or contradicts what you found,
   so any choice would be a coin toss about what the user wants.

For these: do not take the step. Prepare everything up to it, write the question clearly with your
recommendation, and go on with other work that does not depend on it.

## At the end

The final message lists every ruling, the weightiest first, briefly:

```markdown
Rulings I made (change any of them):
1. <decision>: <why>. If wrong: <cost, and how to undo>.
2. …

Waiting for you:
- <the question you stopped on>, and what I recommend.
```

## Pitfalls

- Stalling on a question you could have settled by looking.
- Deciding silently: a decision the user cannot see is one they cannot fix.
- Treating a stop case as minor because it seems small: a single email or one deleted folder cannot
  be taken back.
