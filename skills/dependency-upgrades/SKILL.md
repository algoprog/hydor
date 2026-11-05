---
name: dependency-upgrades
description: Use when upgrading a project's dependencies or checking them for security advisories (npm, pnpm, yarn, pip, uv, poetry, cargo, go): what is outdated, security fixes first, upgrades grouped by risk in worktrees with the tests run, one pull request per group.
category: coding
triggers: [outdated dependencies, outdated packages, upgrade dependencies, update dependencies, dependency upgrade*, npm audit, pip-audit, security advisor*, vulnerable dependenc*, bump packages, dependency gardener]
---

# Dependency upgrades

Upgrades go wrong when they come all at once and unread. So: security fixes first, then the rest by how much
could break (patch, minor, major), each group on its own branch with the tests run and the release notes read,
one pull request per group. A group that breaks holds back only its culprit. For pull requests in general, see
the github skill.

## 1. What the project uses

Find every manifest and lock file, in every workspace of a monorepo:

| Ecosystem | Manifest | Lock file says which tool |
| --- | --- | --- |
| JavaScript | `package.json` (and `workspaces`) | `package-lock.json` npm, `pnpm-lock.yaml` pnpm, `yarn.lock` yarn (`.yarnrc.yml`: yarn 2+) |
| Python | `pyproject.toml`, `requirements*.txt` | `uv.lock` uv, `poetry.lock` poetry, none: pip |
| Rust | `Cargo.toml` | `Cargo.lock` |
| Go | `go.mod` | `go.sum` |

Use the tool and version the project pins (`packageManager` in package.json through corepack, `.python-version`,
`rust-toolchain.toml`), in the project's own environment, never the system's Python.

## 2. What is outdated, and what is vulnerable

| | Outdated | Advisories |
| --- | --- | --- |
| npm | `npm outdated --json` | `npm audit --json` |
| pnpm | `pnpm outdated --format json` | `pnpm audit --json` |
| yarn | `yarn outdated` (1), `yarn upgrade-interactive` (2+) | `yarn audit --json` (1), `yarn npm audit --json` (2+) |
| uv | `uv lock --upgrade --dry-run`, `uv pip list --outdated` | `uvx pip-audit` |
| poetry | `poetry show --outdated` | `pip-audit` on `poetry export` |
| pip | `pip list --outdated --format json` | `pip-audit -r requirements.txt` |
| cargo | `cargo outdated` (if installed), `cargo update --dry-run` | `cargo audit` |
| go | `go list -m -u -json all` | `govulncheck ./...` (it says which are reached) |

No audit tool? OSV's free API answers for any ecosystem: `POST https://api.osv.dev/v1/querybatch` with
`{"queries":[{"package":{"name":"lodash","ecosystem":"npm"},"version":"4.17.20"}]}`, then
`GET https://api.osv.dev/v1/vulns/<id>` for each advisory's details, severity and fixed versions.

For each advisory note: the package, the installed and fixed versions, the severity, whether it is direct or
pulled in by another package, and whether it ships (a dev tool's advisory matters less than a server's).

## 3. Group by risk

1. **Security**: every upgrade that fixes an advisory, to the smallest version that fixes it, even a major (say so).
2. **Patch** (1.2.3 → 1.2.4).
3. **Minor** (1.2 → 1.3). Under 1.0, a minor bump (0.4 → 0.5) can break things: treat it as a major.
4. **Majors**: each package on its own, or a few that belong together (react with react-dom and their types).

Never mix a major into the other groups. Read your task notes: skip what is still open in a pull request, and
what was held back for a reason that still holds.

## 4. Each group in a worktree, with the tests

```bash
git fetch origin
git worktree add -b deps/<group>-<yyyy-mm-dd> ../deps-<group> origin/<default>
cd ../deps-<group>
```

- Upgrade with the tool, never by editing a lock file: `npm install pkg@1.4.2`, `npm update` (within ranges),
  `pnpm update pkg`, `uv lock --upgrade-package pkg`, `poetry update pkg`, `cargo update -p pkg`,
  `go get pkg@v1.4.2 && go mod tidy`. A major may need the manifest's range changed.
- Install from scratch (`npm ci`, `uv sync`, `poetry install`), then build, type-check, lint and run the tests.
- Read what changed between the two versions of each package: its GitHub releases
  (`gh release list -R owner/repo`), its `CHANGELOG.md`, its migration guide. Note breaking changes, deprecations
  and highlights; for a major, make the code changes it needs, in the same branch.
- A group whose tests fail: find the culprit by halving the group, hold it back (with the reason in your notes)
  and try the rest again.

## 5. One pull request per group

If you may open pull requests: commit (manifest and lock file together), push the branch, open a draft:
`gh pr create --draft --title "Dependencies: patch upgrades (12)" --body-file pr.md`. The body:

- A table: package, from, to, and a link to its release notes.
- The advisories it fixes: id, severity, one line each.
- Breaking changes and what you changed for them.
- What you ran (install, build, tests) and how it went; what to watch after merging.

If you may not: push nothing; report each group's upgrades, what you checked and the commands that apply it.
Either way, remove the worktrees (`git worktree remove ../deps-<group>`) and update your task notes: pull
requests open, upgrades held back and why, advisories without a fix yet.

## Pitfalls

- `npm audit fix --force`: it installs majors without a word. Never.
- `--legacy-peer-deps` or `--force` to get past a conflict: it hides the conflict, it does not settle it.
- Overrides and resolutions for a transitive package: only for a security fix nothing else brings, and say so.
- Lock file churn from another tool version than the project's.
- A green test run on a project with few tests: say how much the tests cover what changed.
