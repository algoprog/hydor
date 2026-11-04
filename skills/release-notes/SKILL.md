---
name: release-notes
description: Use when writing release notes, a changelog entry or upgrade notes from commits and pull requests, or when choosing the next version number. Not for writing a single commit message.
category: writing
triggers: [release notes, changelog, change log, patch notes, upgrade notes, upgrade guide, since the last release, since last release, semver, semantic version*, version bump, bump the version]
---

# Release notes

Release notes tell the people who use the software what changed for them and what they have to do.
Gather everything that changed since the last release, translate each change from what the developer
did into what the reader gets, group it by what matters to them, and check that nothing important is
missing.

## 1. Follow the project's own way

- Read the existing `CHANGELOG.md` (or `HISTORY`, `NEWS`, `docs/releases/`), earlier releases on the
  hosting service (`gh release list`, `gh release view <tag>`), and the contributor notes (CONTRIBUTING,
  CLAUDE.md, AGENTS.md) for rules about versions, headings, dates, tone and release commits.
- Match what is there: heading format, date format, sections, how pull requests and authors are linked.
- No format yet: newest first, one section per version, the groups in step 4. A template is in
  `references/template.md`.
- An `## [Unreleased]` section at the top (Keep a Changelog): move its entries under the new
  version's heading, leave an empty `## [Unreleased]` above it, and add the new version's compare
  link at the bottom.
- A changelog written by a tool from commit messages (release-please, semantic-release, git-cliff):
  fix the wording at its source, or edit the text after the tool has run. With release-please, a
  `BEGIN_COMMIT_OVERRIDE` … `END_COMMIT_OVERRIDE` block of corrected messages in a squash-merged pull
  request's description replaces its message, and `Release-As: 2.0.0` in a commit body sets the
  next version.

## 2. Gather what changed

```bash
git describe --tags --abbrev=0                            # the last release tag
git log --oneline --no-merges v1.3.0..HEAD                # every commit since
git log --merges --first-parent --oneline v1.3.0..HEAD    # merged pull requests on this branch
git diff --stat v1.3.0..HEAD                              # where the changes are
gh pr list --state merged --base main --search "merged:>=2026-10-01" --limit 200 --json number,title,labels,author
```

- Read pull request descriptions and linked issues for anything the title does not explain; commit
  subjects often hide what users actually see.
- Look for changes nobody wrote a line about: database migrations, new or renamed settings and
  environment variables, changed defaults, new minimum versions (Node, Python, an operating system),
  removed or renamed functions, routes, flags and options, security fixes, deprecations.
- Conventional commit prefixes (`feat:`, `fix:`, `perf:`, a `!` or a `BREAKING CHANGE:` footer) help to
  sort, but read the change itself: labels are often wrong or missing.

## 3. Choose the version number

For software with a public interface, semantic versioning, MAJOR.MINOR.PATCH:

| What changed | Bump |
| --- | --- |
| Something users rely on breaks: a removed or renamed API, a changed default, a dropped platform or runtime version, an incompatible data format | MAJOR |
| New features, deprecations, compatible improvements | MINOR |
| Only bug fixes, including security fixes that break nothing | PATCH |

- Before 1.0.0 anything may change; many projects bump MINOR for breaking changes in 0.x (npm's
  `^0.3.1` does not take 0.4.0, so nobody is moved onto it unasked). Follow the project's habit.
- Pre-releases: `2.0.0-rc.1`, `2.0.0-beta.2`.
- Unsure whether a change breaks someone? Treat it as breaking.
- The version usually lives in files too (`package.json` and its lock file, `pyproject.toml`,
  `Cargo.toml`, a `version.py`): change them together, and match the tag.
- Apps without a public interface often use their own scheme (dates, marketing versions): follow it.

## 4. Write for the reader

Group by what each change means to them, in this order, leaving out empty groups:

1. **Breaking changes**, with what to do (step 5). For software others build on, say "No breaking
   changes" when there are none.
2. **Security:** what was fixed, how serious, the advisory or CVE id, affected versions; no exploit
   details. Say "upgrade promptly" when it is serious.
3. **New:** things users can do now.
4. **Improved:** faster, clearer, easier; changed behaviour that breaks nothing.
5. **Fixed:** bugs users could have met, described by their symptom.
6. **Deprecated and removed:** what to use instead, and when the old way goes.
7. **Known issues:** what still goes wrong in this version, with a way round it or when a fix is due.

Each line:

- Says what the reader can now do or will notice, not what the code does. "CSV exports keep the leading
  zeros in postcodes", not "Fix dtype in CSV serializer".
- Uses the product's own names for things, as its screens and docs do; plain words; one line where
  possible.
- Leaves out internal work (refactoring, CI, tests, dependency updates without visible effect), unless
  the readers are developers who need it (a library's runtime or peer dependency changes).
- Links the pull request or issue when the readers are developers, and credits outside contributors if
  the project does.

Open each version with one line that sums it up: the two or three things that matter most.

A release that had to be pulled keeps its entry, marked as withdrawn (`[YANKED]` after the date in
Keep a Changelog), with the reason and the version to use instead.

## 5. Upgrade notes for breaking changes

For each one: what changed, who is affected (and how to tell), what to do, with before and after:

```markdown
### `timeout` is now in seconds, not milliseconds

Affects you if you set `timeout` in `config.yaml`. Divide your value by 1000:
`timeout: 30000` becomes `timeout: 30`. Values above 3600 are now refused at start-up, with a message
naming the setting.
```

Order them by how many people they affect. Mention data migrations (automatic or manual, how long they
take, whether they can be undone) and new minimum versions.

## 6. Check that nothing is missing

- Go through the commit list and account for every commit: in the notes, or deliberately left out as
  internal.
- Compare with the diff for visible surfaces no commit mentions: settings, CLI help, API routes,
  translations, screens, migrations.
- Check the facts: the version, the date, the names of settings and flags as the software spells them,
  that links work.
- Read it as someone upgrading: can they tell whether they are affected, and what to do?
- Show it to the user first. Do not create tags or publish releases (`gh release create`) unless asked.

## Pitfalls

- A commit log pasted in as release notes.
- A breaking change buried under "Improved".
- Developer words ("refactored the reducer", "bumped deps") where readers need effects.
- "Various bug fixes" hiding the fix someone was waiting for.
- Missing changes that came without a pull request (direct pushes, squashed merges, reverts).
- A version in the notes that differs from the one in the files and the tag.
