---
name: ci-doctor
description: Use when a CI run failed (GitHub Actions, GitLab CI, Buildkite, CircleCI) and the job is to find out why, tell a flaky failure from a real one, then re-run it, fix it in a draft pull request or report; often a scheduled task woken by the CI's webhook.
category: coding
triggers: [ci failed, ci is failing, ci run failed, build failed, failed build, failing pipeline, pipeline failed, workflow failed, red build, flaky test*, ci doctor]
---

# CI doctor

A failed run asks one question: did the code break, or did the run? Answer it with evidence, act only within
what you were allowed (a scheduled task's prompt says: re-run, open a draft pull request, comment), and leave a
short report someone can act on. Never turn a build green by hiding the failure. For the gh command and pull
requests in general, see the github skill; for the bug itself, debugging-code.

## 1. The facts

- What failed: the run's address, the workflow or pipeline, the job, the branch, the commit and what started it
  (a push, a pull request, a schedule). A task's webhook gives these; check them against the service.
- Who you act as: `gh auth status` or `glab auth status`; else `list_connections` for a connected app (GitHub,
  GitLab, Buildkite, CircleCI) or a key in the vault. Missing one? `request_secret`, never a token in the chat.
- That the folder holds the repository that failed (`git remote -v`), and the commit:
  `git fetch origin <branch>`, then `git cat-file -t <sha>`.
- Read your task notes first: a failure seen before (the same test, the same error) changes the verdict.

## 2. Read the logs, from the first real error

| CI | The failed jobs' logs |
| --- | --- |
| GitHub Actions | `gh run view <run id> --log-failed`; `gh run view <run id> --json jobs` for the jobs and steps |
| GitLab CI | `glab ci view`, `glab ci trace <job id>`; or the API: `projects/:id/pipelines/:id/jobs?scope[]=failed`, then `projects/:id/jobs/:job_id/trace` |
| Buildkite | the connected app's tools; or the REST API: `organizations/{org}/pipelines/{pipeline}/builds/{number}`, then each failed job's `/log` |
| CircleCI | the connected app's tools; or the API (v2): `workflow/{id}/job` for the failed jobs, then the job's steps and their output |

Read the failing step from its top down to the first error: the last lines are usually its consequence ("exit
code 1", "1 test failed"). Note the failing test and its assertion, compiler errors with file and line, "command
not found", time-outs, exit 137 (killed: out of memory), a full disk, 429s and 5xx from a registry or a service.

## 3. Flaky or real

Signs of a flaky failure (two or more make it likely):

- The same job passed on the same commit, before or on another attempt:
  `gh run list --workflow <file> --branch <branch> --limit 20 --json conclusion,headSha,createdAt,attempt`.
- The error is in the run, not the code: a network or DNS time-out, a package download that failed, a service
  answering 5xx, a runner lost or out of disk, a rate limit.
- The test failed and passed on the default branch lately without code changes, or it depends on time, order,
  randomness, a port, or a sleep.
- The commit cannot touch what failed (a documentation change failing a database test).

Signs of a real one:

- It fails the same way on another attempt, or here.
- The error points into what the commit changed (`git show --stat <sha>`).
- It started with this commit: the one before it passed.

Say how sure you are, and why.

## 4. Reproduce it in a worktree

Never in the user's own checkout, and in a temporary folder rather than beside it:

```bash
git fetch origin <branch>
git worktree add --detach /tmp/ci-<run id> <sha>
cd /tmp/ci-<run id>
```

Run what the CI runs: read its configuration (`.github/workflows/*.yml`, `.gitlab-ci.yml`,
`.buildkite/pipeline.yml`, `.circleci/config.yml`) for the install, the command and the environment variables
(never the secrets). The failing test first (`npm test -- -t "name"`, `pytest path::test -x`,
`go test -run TestName ./pkg`), then the suite around it. For a test you suspect is flaky, run it 10 to 20 times,
with the seed or order the runner printed. Cannot reproduce it (it needs a service, a secret, another system)?
Say so instead of guessing.

## 5. Act, within what you were allowed

- **Flaky, and re-runs allowed**: re-run the failed jobs once: `gh run rerun <run id> --failed`;
  `glab ci retry <job id>`; Buildkite's job `retry`; CircleCI's `workflow/{id}/rerun` with `{"from_failed": true}`.
  Never a second time: a second failure is not "just flaky". Note the test and the date in your task notes, so a
  pattern shows.
- **Real, and a fix allowed**: the smallest change that fixes the cause, on a branch of your own
  (`ci-fix/<short-name>`) made from the failing branch, in the worktree. Run the failing test and the suite around
  it, commit with a message that says what broke and why, push your branch and open a draft pull request against
  the branch that failed (`gh pr create --draft --base <branch> --head ci-fix/<short-name> --body-file pr.md`):
  the failing run's link, the cause, the fix, how you checked it.
- **Comments allowed**: one comment on the pull request (or the commit), with the cause and the fix or next step.
  Short, and no @mentions.
- **Not allowed**: say in your report what you would have done ("re-run looks safe: a registry time-out").

Never: push to the default branch or someone else's branch, force-push, merge, change CI settings, secrets or
permissions, or skip, delete or quarantine a test to make it pass (a quarantine is a code change: only in a
draft pull request that says so).

## 6. Report

- `report_outcome` with one line: "Flaky: registry time-out in npm ci; re-ran it" or "Real: the date parser
  breaks on leap years (a1b2c3d); draft pull request #42".
- Your reply, in a few lines: what failed (the job and test), flaky or real and the evidence, what you did (the new
  attempt's link, the pull request's), and what you suggest.
- Add to your task notes: the failure, the verdict, flaky tests seen and how often.
- Clean up: `git worktree remove /tmp/ci-<run id>`, and local branches that hold nothing.

## Pitfalls

- Reading only the last lines of the log, or the first failure of many caused by one setup step.
- Calling a failure flaky because it is inconvenient: the evidence decides.
- Re-running until green.
- Reproducing in the user's checkout, which mixes your changes with theirs.
- A fix for the symptom (a longer time-out, a retry) when the cause is a race or a real bug: say it is a stopgap.
