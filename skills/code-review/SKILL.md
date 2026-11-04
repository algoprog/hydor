---
name: code-review
description: Use when asked to review a change (a diff, a branch, a pull request, a patch), or before handing over your own code changes as finished. Not for a security audit of a whole app; see security-check.
category: coding
triggers: [code review, review this pr, review my pr, review the pr, review pr, review this pull request, review the pull request, review this diff, review my changes, review the changes, review my code, review this code]
---

# Code review

A review answers three questions: does the change do what it is meant to, is it safe, and will the next
person understand it? Read for the intent first, then correctness, then everything else. Report a few
findings that matter, each with where it is, why it matters and a concrete fix.

## 1. Get the change and its intent

- The diff: `git diff --stat main...HEAD` for its size and shape, then `git diff main...HEAD` (three dots:
  what the branch changed since it left main) and `git log --oneline main..HEAD`. Uncommitted work:
  `git diff` and `git diff --staged`. One commit: `git show <sha>`. Add `-w` to hide changes that are
  only whitespace (a reformat can bury the real change), and `-W` to see each changed function whole.
- A GitHub pull request: `gh pr view 123 --comments`, `gh pr diff 123`, and `gh pr checkout 123` to run it.
  Without `gh`: `git fetch origin pull/123/head:pr-123`.
- The intent: the description, the linked issue, the commit messages. Write it down in one sentence. If
  you cannot tell what the change is for, that is your first finding. When the description and the code
  disagree, ask which is right: sometimes it is the description.
- **Depth follows risk, not size.** Forty lines touching login, permissions, payments, deleting data, a
  migration, a public API or the build deserve the full checklist and a run; nine hundred lines of tests
  or docs may need only a careful read.
- Generated files, lockfiles and vendored code: do not read them line by line. Check that what generates
  them is in the diff and, for a lockfile, which new packages arrived (`references/checklist.md`).
- Big diffs (more than a few hundred lines of logic): review one part at a time (data model, core logic,
  interfaces, UI), each with its tests, and say whether the change should be split.

## 2. Read in the right order

1. The tests, or the spec: what behaviour does the author claim?
2. The core of the change: new logic, data model, migrations.
3. Outside the diff: callers of changed functions and the code they call (`git grep -n "functionName("`).
   Many bugs live in lines the diff did not touch: a changed signature, a new return value or error
   nobody handles, a default that moved.
4. Run it when you can: the tests, the linter and type checker, the app, the steps from the bug report.
   Reading finds some bugs; running finds others.

## 3. Correctness first

For each changed function, ask:

- **Inputs:** empty, null, zero, negative, very large, Unicode, duplicates, the wrong type. What happens?
- **Errors:** what can fail (I/O, network, parsing, permissions)? Is it handled where something useful
  can be done, with a clear message, and not swallowed? After a partial failure, is the state consistent?
- **Data:** can this lose or corrupt data (overwrites, deletes, a migration without a backfill, writes
  outside a transaction)? Does it still read data stored by the old version, and serve older clients?
- **Concurrency:** two requests at once, retries, double submits, an unawaited promise, shared mutable
  state, check-then-act races, a missing lock or unique constraint.
- **Edges:** off by one, time zones and daylight saving, money in floats, the last page, limits.
- **Intent:** does it do what the description says in every branch, behind every flag, on every platform?
- **Written by an AI** (an agent's pull request, or your own work): check that every function, option,
  config key and package it uses really exists in the installed version (its docs or source, not
  memory), that the tests come from the request rather than from what the code happens to do, and that
  its comments claim no more than the code does.

## 4. Then the rest, in order of cost

- **Security:** input reaching SQL, a shell, HTML, file paths or outgoing URLs; a new route or query
  without an authorisation check; secrets in code or logs. For anything sensitive, use security-check.
- **Tests:** would a test fail without this change? To know, put back the old code but keep the new
  tests (with everything committed: `git checkout main -- src/file.py`), run them and watch one fail,
  then `git checkout HEAD -- src/file.py`. Are error paths, edges and refusals (a user who may not do it
  is turned away) covered? Do the tests assert outcomes rather than internals?
- **Weakened tests:** tests deleted or skipped, assertions loosened, snapshots re-recorded. They are easy
  to miss in a diff and the quiet way to make a failing suite pass; each needs a stated reason.
- **Performance where it matters:** a query per item in a loop, unbounded lists, repeated work, large
  payloads (see the performance skill).
- **Readability:** names say what things are; each function does one thing; no dead or commented-out
  code; no debug output; complexity that earns its place. Code you cannot follow after a careful read is
  a finding: the next reader will not follow it either.
- **Consistency:** follows the codebase's patterns, error handling, naming and layout, and its written
  rules (CONTRIBUTING, CLAUDE.md, AGENTS.md). A new pattern needs a reason.
- **Operability:** logs and errors someone on call can use; new settings documented; migrations
  reversible; user-visible changes in the docs and changelog.

A longer checklist by area is in `references/checklist.md`.

## 5. Write findings that can be acted on

Each finding gives its severity, the place, what is wrong, why it matters (a concrete failure), and the
fix:

```text
[blocking] src/orders/refund.ts:88. refund() reads the balance, then writes the new one, outside a
transaction. Two refunds at once both read 100 and both write 50, so one refund is lost. Do it in one
statement (UPDATE accounts SET balance = balance - $1 WHERE id = $2 AND balance >= $1) or lock the row
with SELECT ... FOR UPDATE inside a transaction.
```

| Severity | Meaning |
| --- | --- |
| Blocking | A bug, data loss, a security hole, a broken build or a broken user flow. Must change before merging. |
| Should fix | A real problem with a smaller blast radius: a risky path without a test, unclear error handling, a maintenance trap. |
| Suggestion | Optional: a clearer name, a simpler way. Mark it optional and keep these few. |
| Question | You are not sure. Ask; do not assert. |

- Open with a short summary: what the change does, whether it is ready, the blocking items, and what
  you did not review or could not run (silence reads as "checked").
- Check before you claim. "This crashes on an empty list" needs a run, or the line that proves it. If
  you could not check, make it a question.
- Show the fix when it is short (a snippet or the exact change).
- Write about the code, not the author: "this loop runs a query per item", not "you wrote slow code".
- Leave to the tools what the formatter, linter and type checker enforce: run them instead.
- Findings from a review bot or another model are leads, not verdicts: keep those you can tie to a line
  and confirm yourself; drop the rest or ask them as questions.

## Reviewing your own work before handing it over

Review your own diff the same way before you say it is done:

- `git diff` against where you started, read top to bottom as if someone else wrote it.
- Remove debug output, commented-out code, stray files and unrelated changes (reformatted lines you did
  not need to touch).
- Put back any test you skipped or loosened to get the suite passing. If one truly had to change, say
  which and why when you hand over.
- Run the tests, linter and type checker, and use the feature once for real.
- Check the result against the request line by line (evidence-before-done), then tidy up (clean-up).

## Posting the review, and the next round

Post comments or approve only when asked. With `gh`: `gh pr review 123 --comment --body-file review.md`,
or `--request-changes` or `--approve` instead of `--comment`. Otherwise give the review in the reply.

On the next round, check each blocking finding is really fixed (run its check; a changed line is not a
fix) and read what changed since the commit you reviewed (`git diff <that-sha> HEAD`).

## Pitfalls

- Reviewing only the lines in the diff, when the bug is in a caller.
- Thirty small remarks that bury the one real bug. Lead with what blocks.
- Vague findings ("this could be better") with no reason and no fix.
- Asserting a bug you did not check.
- Rewriting the change to your own taste instead of the codebase's conventions.
- Approving because the tests pass: they only cover what the author thought of.
- Missing a deleted assertion or a skipped test because it looked like tidying.
