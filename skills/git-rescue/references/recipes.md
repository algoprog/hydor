# Git rescue recipes

Each recipe assumes you have looked (`git status`, `git log --oneline --graph --all -20`) and made a
backup branch (`git branch backup/rescue-$(date +%Y%m%d-%H%M)`). Commands checked with git 2.43.

## Commits on the wrong branch (not pushed)

Two commits landed on `main` that belong on a new branch `feature`:

```bash
git branch feature            # feature now points at the two commits
git reset --hard HEAD~2       # main goes back two commits (they stay on feature)
git switch feature
```

They belong on an existing branch instead:

```bash
git switch existing-branch
git cherry-pick <sha1> <sha2>     # oldest first; or a range: git cherry-pick A^..B
git switch main
git reset --hard HEAD~2           # only if main is not pushed
```

Already pushed to a shared branch: leave its history alone. `git revert <sha>` the commits there, and
cherry-pick them onto the right branch.

## Undo a rebase or reset that went wrong

```bash
git reflog                        # find the entry before it, e.g. "HEAD@{5}: checkout: moving from main to feature"
git reset --hard HEAD@{5}         # or the sha from that line
```

Right after a rebase, `ORIG_HEAD` usually points at the branch as it was: `git reset --hard ORIG_HEAD`.

## Undo an amend

```bash
git reset --soft HEAD@{1}         # back to the commit before the amend, changes staged
```

## Split the last commit (not pushed)

```bash
git reset HEAD~1                  # undo the commit, keep the changes unstaged
git add -p                        # stage the first part, hunk by hunk
git commit -m "First part"
git add -A && git commit -m "Second part"
```

## Squash or fix up recent commits without an interactive editor

Interactive rebase needs an editor you can type into. These do the same without one (unpushed commits).

Squash the last three commits into one:

```bash
git reset --soft HEAD~3
git commit -m "One clear message"
```

Fold a fix into an older commit:

```bash
git add <files>
git commit --fixup=<sha>                                  # a "fixup!" commit aimed at <sha>
GIT_SEQUENCE_EDITOR=true git rebase -i --autosquash <sha>~1  # accepts the prepared plan as it is
```

Reword the last commit: `git commit --amend -m "Better message"`.

## Recover a deleted branch

```bash
git reflog | grep -i "<branch-name>"     # or look for the last commit message you remember
git branch <branch-name> <sha>
```

If the reflog has expired or the branch only existed on a remote: `git fsck --lost-found` lists dangling
commits; `git show <sha>` each candidate. On GitHub a deleted pull request branch can be restored from
the pull request page.

## Get one file back from another commit or branch

```bash
git restore --source=main -- path/to/file          # as it is on main
git restore --source=<sha> -- path/to/file         # as it was at a commit
git show <sha>:path/to/file > /tmp/old-version     # just to look, without touching the working tree
```

## Remove a file from the last commit but keep it on disk

```bash
git rm --cached path/to/file
echo "path/to/file" >> .gitignore
git commit --amend --no-edit
```

## Abort whatever is in progress

```bash
git merge --abort
git rebase --abort
git cherry-pick --abort
git revert --abort
git am --abort
```

`git status` says which one is in progress.

## Conflicts that keep coming back

When the same conflict repeats across a long rebase, turn on reuse of recorded resolutions for this
repository: `git config rerere.enabled true`. Git then replays a resolution you made once.

## The remote moved while you were working

```bash
git fetch
git status                          # ahead N, behind M
git rebase origin/main              # your commits on top of theirs (your own branch)
# or
git merge origin/main               # a merge commit, no history rewrite (shared branch)
```

Rejected push ("non-fast-forward")? Fetch and integrate as above. Do not force-push to make the error go
away.

## A collaborator's copy after a history rewrite

Tell them to save their own unpushed work first (a branch or a stash), then:

```bash
git fetch
git switch <branch>
git reset --hard origin/<branch>
```

Or to clone again, which is simpler and is required after removing a secret.

## Line endings and file mode noise

A diff where every line changed but nothing visible did is usually line endings or file modes:

- `git diff --stat --ignore-all-space` (or `-w`) to see whether there is a real change.
- `git config core.autocrlf` (`input` on macOS and Linux, `true` on Windows), or a `.gitattributes`
  with `* text=auto`.
- `git config core.fileMode false` when only the executable bit differs (for example on a mounted drive).
