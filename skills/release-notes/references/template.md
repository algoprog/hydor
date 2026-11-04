# Release notes templates

Use the project's own format when it has one. These are starting points.

## A changelog file (newest first)

```markdown
# Changelog

## 2.4.0 · 3 November 2026

Faster exports, shared folders, and the end of the old API keys.

### Breaking changes
- **Old-style API keys stop working.** Keys starting with `key_` are refused from this version. Create a
  new key in Settings, then API, and replace the old one wherever you use it.

### Security
- Fixed a flaw that let a signed-in user see the names of other teams' folders (advisory
  GHSA-xxxx-xxxx-xxxx). Versions 2.0 to 2.3 are affected; upgrade promptly.

### New
- Share a folder with your team: everyone in it sees new files as they arrive.

### Improved
- Exports of large projects are about four times faster.

### Fixed
- CSV exports keep the leading zeros in postcodes and phone numbers.
- The date picker no longer jumps to January when you clear it.

### Deprecated
- The `/v1/files` API route. Use `/v2/files`; `/v1/files` will be removed in 3.0.

### Known issues
- On iPads with iOS 16 or older the Share button is hidden: share from the web app until 2.4.1.

## 2.3.1 · 14 October 2026
...
```

Notes:

- One heading per version, with its date; the same date format throughout.
- A one-line summary under each heading.
- Only the groups that have entries.
- For developer audiences, end lines with the pull request: `(#482)`, and credit outside contributors:
  `(thanks @someone)`. (Only real handles: a mention notifies that person.)

## A release on GitHub or GitLab

```markdown
**Faster exports, shared folders, and the end of the old API keys.**

## Before you upgrade
Old-style API keys (starting with `key_`) stop working in this version. Create new keys first:
Settings, then API.

## What's new
- Share a folder with your team (#470)
- Exports of large projects are about four times faster (#476)

## Fixes
- CSV exports keep leading zeros in postcodes (#481)

**Full list of changes:** v2.3.1...v2.4.0
```

`gh release create v2.4.0 --title "2.4.0" --notes-file notes.md` publishes it: only when the user asks.
`gh release create ... --generate-notes` makes a list of pull requests to start from, not finished notes.

## Upgrade notes for one breaking change

```markdown
### <What changed, in one line>

**Affects you if** <how a reader can tell: you use X, you set Y, you call Z>.

**What to do:**
1. <Step one, with the exact setting, command or code.>
2. <Step two.>

Before:

    <old config or code>

After:

    <new config or code>

**If you do nothing:** <what happens: an error at start-up naming the setting, a warning in the log, ...>
```

## A checklist before publishing

- [ ] Every commit since the last tag is either in the notes or deliberately left out.
- [ ] Breaking changes first, each with what to do.
- [ ] Security fixes with severity and affected versions, without exploit details.
- [ ] Known issues listed, each with a way round it.
- [ ] Each line says what the reader gets or must do, in the product's own words.
- [ ] Version number matches the files and the tag; the date is right.
- [ ] Names of settings, flags and screens checked against the software.
- [ ] Links work.
- [ ] The user has read it before anything is published.
