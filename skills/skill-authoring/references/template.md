# A SKILL.md template

Copy it into a folder named after the skill (`<name>/SKILL.md`), fill it in, and delete what does not
apply. Keep the body to what an agent needs while doing the work.

```markdown
---
name: <lowercase-words-with-dashes, same as the folder>
description: Use when <the situations and requests that call for it, in one sentence>. Not for <a close neighbour; see other-skill>.
triggers: [<two- or three-word phrases people type>, <another>, <a stem*>]
---

# <Title>

<One short paragraph: what this is for, and the idea that makes it work.>

## 1. <First thing to do>

- <What to do, concretely: the command, the file, the setting.>
- <A decision rule: if X, do Y; otherwise Z.>

## 2. <Next thing to do>

| Situation | Do this |
| --- | --- |
| <case> | <action> |
| <case> | <action> |

## 3. Check the result

- <How to know it worked: the check to run and what it should show.>
- Report with the evidence (see evidence-before-done).

## Pitfalls

- <A mistake that really happens, and how to avoid it.>
- <Another.>
```

## Questions to answer before proposing it

- When exactly should an agent load it, and when should it not? (That is the description.)
- What would an agent get wrong without it? (That is the body; cut everything else.)
- Which steps can be checked, and how? (Those are the checks.)
- Which commands did you actually run? (Only those go in.)
- What is long but only sometimes needed? (That goes in a file under `references/`.)
- What is mechanical and error-prone? (That might be a script under `scripts/`, run once to prove it.)

## A good description, and weaker ones

| Description | Why |
| --- | --- |
| Use when importing supplier invoices (PDF or CSV) into the accounts sheet, or when an import shows wrong totals or duplicates. | Good: situations and words a user would say |
| Imports invoices by parsing PDFs, matching suppliers and appending rows. | Weak: says what it does step by step, not when to use it |
| Use for invoices. | Weak: too vague to choose well, and catches unrelated invoice tasks |

## Triggers: good and risky

| Trigger | Verdict |
| --- | --- |
| `import invoices`, `supplier invoice*` | Good: specific phrases |
| `merge conflict*` | Good: the stem catches "conflicts" too |
| `invoice` | Risky: also in "send an invoice", "invoice template" |
| `data`, `test`, `plan` | Too broad: appear in many unrelated requests |
