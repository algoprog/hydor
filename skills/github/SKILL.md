---
name: github
description: Use when working with GitHub, such as opening, reviewing or merging pull requests, checking CI runs and their logs, managing issues or releases, or using the gh command or GitHub's REST API.
category: coding
triggers: [github, pull request, open a pr, gh pr, gh cli, gh run, github actions, ci failed, ci is failing, the pr, merge the pr, github release]
---

# GitHub

Working with GitHub for the user: with the `gh` command when it is installed and signed in, with
the REST API and a token from the vault when it is not, and with care on repositories other people
share. Endpoints for the API route are in `references/rest-api.md`; a pull request description
template is in `references/pr-template.md`. Judging the code itself is the code-review skill;
writing the notes for a release, release-notes; git in a tangle (conflicts, an undone push),
git-rescue.

## 1. See what you have

- `gh --version` and `gh auth status`: installed, and signed in as whom, with which scopes.
- Not signed in: `list_connections` for a saved token (GITHUB_TOKEN or similar). None? Use
  `request_secret` (name `GITHUB_TOKEN`, domains `api.github.com` and `github.com`, `commands: true`
  for use in commands) and say in `why`: a fine-grained personal access token from GitHub's
  Settings → Developer settings, limited to the repositories needed, with only the permissions the
  task needs (Contents, Pull requests, Issues, Actions; read or write), and an expiry date.
- `gh` reads a token from `GH_TOKEN` or `GITHUB_TOKEN`, so through `run_with_secrets` it works as if
  signed in: `GH_TOKEN="$GITHUB_TOKEN" gh pr list`.
- Know which repository you act on: `gh repo view --json nameWithOwner -q .nameWithOwner`, or
  `git remote -v`. With forks, name the target explicitly: `--repo owner/name`.

## 2. Pull requests

**Opening one**

- A branch from the latest base, one topic per pull request, tests passing locally. Push your own
  branch: `git push -u origin my-branch`.
- `gh pr create --base main --head my-branch --title "Fix duplicate invoices on retry" --body-file pr.md`
  (`--draft` while it is not ready). Follow the repository's template if it has one
  (`.github/pull_request_template.md`); otherwise `references/pr-template.md`.
- A good description says what changed and why, how it was tested, what could go wrong, and links
  the issue ("Fixes #123", which closes it on merge). For visible changes, before and after
  screenshots (`ui_screenshot`).

**Checks**

- `gh pr checks 123 --watch --fail-fast` waits for CI. A failure: `gh run view <run-id> --log-failed`
  shows the failing steps. Read from the first error, not the last line, and compare with the last
  green run: what changed?
- Rerun (`gh run rerun <run-id> --failed`) only once you know the failure was not caused by the
  change (a flaky test, a network blip), and say so.

**Reviewing someone else's**

- `gh pr view 123 --comments`, `gh pr diff 123`; `gh pr checkout 123` to run it.
- Comment on the change, not the person. Be specific: where, what, why, and a suggested fix. Mark
  what blocks merging and what is optional ("nit:", "optional:"). Ask when unsure instead of
  assuming. Say what is good too.
- Draft the review, show it to the user, and post it when they say so:
  `gh pr review 123 --comment -b "..."`, `--approve`, or `--request-changes -b "..."`.

**Answering review on your own**

Address every comment: change the code, or reply with the reason. Push new commits rather than
rewriting history during review, reply on each thread, then ask for review again.

**Merging**

Only when the user asks, or the repository's process clearly says so; with checks green and the
required approvals. Use the repository's usual method: `gh pr merge 123 --squash --delete-branch`
(or `--merge`, `--rebase`); `--auto` merges once requirements are met.

## 3. Issues

- Search before creating, pull requests too: `gh issue list --search "invoice duplicate" --state all`,
  `gh pr list --search "invoice duplicate" --state all`.
- `gh issue create --title "..." --body-file issue.md --label bug`: what happened, what was expected,
  steps to reproduce, versions and environment, logs or screenshots. A feature request: the problem
  and who has it first, then the idea and the alternatives. A label that does not exist makes the
  command fail: `gh label list` first.
- A security hole is never a public issue: follow the project's `SECURITY.md`, or report it privately
  (the repository's Security tab → Report a vulnerability, where the project has it turned on).
- `gh issue view 45 --comments`, `gh issue comment 45 -b "..."`,
  `gh issue close 45 --reason "not planned" -c "Why, in one line"`.

## 4. Releases

- `gh release create v1.4.0 --title "v1.4.0" --notes-file notes.md` (or `--generate-notes` as a
  first draft), `--draft` to review before publishing, `--prerelease` for betas; files to attach
  go after the tag. `--verify-tag` when the tag should already exist.
- Release notes for the people who use it: breaking changes first, then new features and fixes,
  in plain words; thank contributors.
- Before tagging: pull the merged main, check that the version in the package file (`package.json`,
  `pyproject.toml`) matches the tag, and see what the release workflow listens for (`on: push: tags`
  or `release: published`). Often the tag, not the merge, is what publishes.
- A published version is permanent: people and registries may already have it (npm refuses the same
  version twice). A broken release gets a new patch version; never move or re-push a tag others may
  have fetched.

## 5. Actions

- `gh run list --branch my-branch --limit 10`, `gh run view <id>`, `gh run view <id> --log-failed`,
  `gh run watch <id>`, `gh run download <id>` for artifacts.
- `gh workflow run deploy.yml --ref main -f environment=staging` starts a workflow that allows manual
  runs: one that deploys or publishes needs the user's go-ahead.

## 6. Without gh: the REST API

- `http_request` with `auth: GITHUB_TOKEN` and the headers `Accept: application/vnd.github+json` and
  `X-GitHub-Api-Version: 2026-03-10`.
- Lists come in pages: `per_page=100` and the `Link` header's `rel="next"`. Watch
  `x-ratelimit-remaining` (5,000 requests an hour with a token, 60 without).
- `gh api` reaches any endpoint `gh` has no command for:
  `gh api repos/{owner}/{repo}/pulls/123/comments --paginate`.

## 7. Contributing to someone else's project

Maintainers are often volunteers: a contribution is welcome when it is easy to take in.

- Read the rules first: `CONTRIBUTING.md` (also in `.github/` or `docs/`), the code of conduct, the
  templates, and any policy on AI-assisted work (some projects refuse it, some ask for a note: follow
  it and tell the user; where there is none, suggest a short note in the description that an AI
  assistant helped). Note what they require: signed-off commits (`git commit -s`, for a DCO), a CLA, a
  commit message format, how to run the tests and linters.
- Search issues and pull requests, open and closed (section 3): the fix may exist, be under way, or
  have been declined already.
- Welcome work: issues labelled "good first issue" or "help wanted", or a bug with clear steps. Avoid
  ones waiting for information, marked won't fix or upstream, or with an open pull request.
- Anything beyond a small fix (a feature, a new dependency, a refactor, a few hundred lines): open an
  issue first with the problem and the plan, and wait for a maintainer's yes.
- The fork route: `gh repo fork owner/name --clone`, a branch from the upstream default branch (not
  always `main`: `gh repo view owner/name --json defaultBranchRef -q .defaultBranchRef.name`), push to
  the fork, then `gh pr create --repo owner/name --base <default> --head <you>:<branch>`. If the
  organisation blocks that, give the user the page to open the pull request themselves:
  `https://github.com/owner/name/compare/<default>...<you>:<branch>`.
- One change per pull request; a second fix found on the way gets its own branch and pull request. Run
  their tests and linters first; update the docs and changelog where the project keeps them.
- Afterwards: fix CI failures quickly and answer every review comment. No response? One polite ping
  after a week or two. Closed without merging: ask why once if it is unclear, then accept it.

## 8. Rules for shared repositories

- Never push to someone else's branch, and never force-push a shared branch (main, release
  branches, a pull request others work on). On your own branch, if history must change, use
  `git push --force-with-lease`, and only when the user agrees.
- Without the user's explicit go-ahead, do not: merge, close or reopen others' pull requests or
  issues; delete branches, tags or releases; change repository settings, branch protection or
  secrets; make a private repository public.
- Comments, reviews and issues are public and speak for the user: draft, show, then post. An
  `@name` notifies that person: use it on purpose only.
- Never commit secrets. If one was pushed, tell the user to revoke it now; removing it from
  history does not undo the leak.
- Follow the repository's CONTRIBUTING file, templates, commit style and code of conduct.

## Pitfalls

- Acting on the fork instead of the upstream repository, or the reverse.
- Rerunning CI until it passes instead of finding out why it failed.
- A huge pull request mixing a refactor, a feature and formatting.
- A description that lists files instead of saying what changed and why.
- A token with far more access than the task needs.
- Backticks or `$` inside a double-quoted `--title`, `-b` or `--body`: the shell runs them. Use single
  quotes or `--body-file`.
