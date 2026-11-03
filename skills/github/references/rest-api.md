# GitHub REST API: the endpoints most tasks need

Every request: `https://api.github.com`, headers `Accept: application/vnd.github+json` and
`X-GitHub-Api-Version: 2026-03-10`, and the token (`http_request` with `auth: GITHUB_TOKEN`).
`{owner}/{repo}` is the repository, such as `cli/cli`. Lists take `per_page` (up to 100) and `page`;
the `Link` header gives the next page.

## Pull requests

| Do | Request |
| --- | --- |
| List open ones | `GET /repos/{owner}/{repo}/pulls?state=open&per_page=100` |
| One, with its head commit | `GET /repos/{owner}/{repo}/pulls/{number}` (`head.sha`, `mergeable`, `draft`) |
| Its changed files | `GET /repos/{owner}/{repo}/pulls/{number}/files` |
| Open one | `POST /repos/{owner}/{repo}/pulls` with `{ "title", "head": "my-branch", "base": "main", "body", "draft": true }` |
| Review it | `POST /repos/{owner}/{repo}/pulls/{number}/reviews` with `{ "event": "COMMENT", "body" }` (or `"APPROVE"`, `"REQUEST_CHANGES"`) |
| Line comments of reviews | `GET /repos/{owner}/{repo}/pulls/{number}/comments` |
| Conversation comments | `GET` or `POST /repos/{owner}/{repo}/issues/{number}/comments` (`{ "body" }`) |
| Merge it | `PUT /repos/{owner}/{repo}/pulls/{number}/merge` with `{ "merge_method": "squash" }` |

## Checks and Actions

| Do | Request |
| --- | --- |
| Check runs of a commit | `GET /repos/{owner}/{repo}/commits/{sha}/check-runs` (`name`, `status`, `conclusion`) |
| Combined status (older status API) | `GET /repos/{owner}/{repo}/commits/{sha}/status` |
| Recent failed runs | `GET /repos/{owner}/{repo}/actions/runs?branch=main&status=failure&per_page=10` |
| A run's jobs and steps | `GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs` |
| A job's log (redirects to a download) | `GET /repos/{owner}/{repo}/actions/jobs/{job_id}/logs` |
| Rerun failed jobs | `POST /repos/{owner}/{repo}/actions/runs/{run_id}/rerun-failed-jobs` |
| Start a manual workflow | `POST /repos/{owner}/{repo}/actions/workflows/{file name or id}/dispatches` with `{ "ref": "main", "inputs": { } }` |

## Issues

| Do | Request |
| --- | --- |
| List (pull requests included: skip items with a `pull_request` field) | `GET /repos/{owner}/{repo}/issues?state=open&labels=bug` |
| Search | `GET /search/issues?q=repo:{owner}/{repo}+is:issue+is:open+duplicate+invoice` |
| Create | `POST /repos/{owner}/{repo}/issues` with `{ "title", "body", "labels": ["bug"] }` |
| Close | `PATCH /repos/{owner}/{repo}/issues/{number}` with `{ "state": "closed", "state_reason": "completed" }` (or `"not_planned"`) |

## Releases and files

| Do | Request |
| --- | --- |
| Latest release | `GET /repos/{owner}/{repo}/releases/latest` |
| Create a release | `POST /repos/{owner}/{repo}/releases` with `{ "tag_name": "v1.4.0", "name", "body", "draft": true, "generate_release_notes": false }` |
| Read a file | `GET /repos/{owner}/{repo}/contents/{path}?ref=main` (`content` is base64) |
| Your rate limit | `GET /rate_limit` (read `resources.core`) |

## Errors you will meet

- **401:** the token is missing, wrong or expired.
- **403:** the token lacks a permission for this repository, or a rate limit (`x-ratelimit-remaining:
  0`; wait until `x-ratelimit-reset`). A secondary rate limit (too many writes too fast) also gives
  403 or 429 with `retry-after`: slow down.
- **404:** wrong owner or name, or the token cannot see a private repository (GitHub answers 404,
  not 403, for those).
- **422:** validation failed: the body says which field (a pull request that already exists, a
  branch with no difference from the base).
