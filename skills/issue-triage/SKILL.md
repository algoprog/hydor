---
name: issue-triage
description: Use when triaging a new issue in a repository (labelling it, finding duplicates, asking the reporter for what is missing, and trying an easy fix as a draft pull request), often a scheduled task woken when an issue is opened.
category: coding
triggers: [issue triage, triage issue*, triage this issue, triage new issues, label the issue, label issues, duplicate issue*, needs repro, needs reproduction]
---

# Issue triage

Triage turns a new issue into one a maintainer can act on in a minute: what kind it is, whether it is already
known, what is missing, and, when it is small and clear, a fix to look at. Everything you write on the issue is
public and speaks for the user: kind, short, specific. For the gh command, see the github skill.

## 1. Read it, and the project's rules

- The issue whole: `gh issue view <n> --comments` (or the API with a key from the vault). The title is often wrong;
  the body and logs are the facts.
- The project's ways: `CONTRIBUTING.md` (also in `.github/` or `docs/`), the issue templates
  (`.github/ISSUE_TEMPLATE/`), and any policy on AI-assisted work. A project that refuses AI-made pull requests
  gets none: say so in your report instead.
- The labels it has: `gh label list --limit 200`. Use only those; never make new ones.
- A security hole reported in public: do not discuss the details. Point the reporter to `SECURITY.md` or the
  repository's private reporting, add nothing else, and tell the user at once (`notify_user`).

## 2. What kind it is

A bug (something worked differently than documented or expected), a feature request, a question (better in the
project's discussions or docs), documentation, or not this project's (a dependency's bug, the user's setup). For
a bug, check it against the latest version: the changelog, closed issues and recent commits
(`git log --oneline -30 -- <the files it touches>`) may say it is fixed already.

## 3. Duplicates, by meaning

Titles differ while problems match, so search in several wordings: the error message (exact, in quotes), the
symptom in plain words, the feature or file it concerns, and a synonym or two.

```bash
gh issue list --state all --limit 30 --search "\"cannot read properties of undefined\" checkout"
gh issue list --state all --limit 30 --search "coupon payment fails"
gh search issues --repo owner/name "discount code checkout error"
```

Open the likely ones and compare the facts (the same error, steps, version, platform), not the titles. Say how
sure you are: **the same** (same error and cause), **likely the same** (same symptom, details differ), or
**related** (same area). Only "the same" earns the duplicate label; the rest are links in your comment.

## 4. Label

The kind (bug, enhancement, question, documentation), the area if the project labels areas, and a state when it
fits (needs-info, duplicate, good first issue). Two to four labels, chosen from the list: `gh issue edit <n>
--add-label bug,checkout`. When no label fits, label nothing rather than the wrong thing.

## 5. Ask for what is missing

A bug report needs: the version, the platform (system, browser, runtime), the steps from the start, what was
expected and what happened, and the logs or error. One comment, only for what is missing:

> Thanks for the report! To look into it we need two things: the version you run (`shop --version`) and the full
> error from the console. If it happens with the steps below too, please say so: ...

Link a likely duplicate in the same comment ("This looks like #123, the same error after a coupon is applied: if
it is the same, please follow there; if not, tell us what differs"). Never promise a fix or a date, never assign
or @mention people, never argue.

## 6. Try the easy ones

Easy means: the cause is clear from the report and the code; the change is small (a few lines in one or two
files); a test can show it; and it needs no design decision. A typo, a wrong message, a missed edge case with a
clear expected result. Anything else: leave it, and say in your report why it is not easy.

1. A worktree from the default branch, in a temporary folder: `git fetch origin && git worktree add -b fix/<n>-<short-name> /tmp/issue-<n> origin/<default>`.
2. A test that fails for the reported reason first, then the fix; run the suite around it and the linters.
3. Commit with the project's message style, push your branch, open a draft pull request:
   `gh pr create --draft --title "..." --body-file pr.md`, the body saying what was wrong, the fix, how you
   checked it, and "Fixes #<n>".
4. `git worktree remove /tmp/issue-<n>`.

## 7. Report

`report_outcome` with one line: the kind and labels, any duplicate and how sure, what you asked for, any draft
pull request. Keep a line per issue in your task notes (number, kind, duplicate of), so the next run can find
duplicates among recent ones faster.

## Never

Close, lock, transfer, pin or delete issues (even an obvious duplicate: label it and let a maintainer close it),
assign people, change milestones or projects, push to the default branch, force-push, or merge.
