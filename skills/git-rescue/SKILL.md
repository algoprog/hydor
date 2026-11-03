---
name: git-rescue
description: Use when git is in a bad state or work seems lost, such as undoing a commit or a push, a merge or rebase conflict, a detached HEAD, commits on the wrong branch, or a secret or huge file committed. Not for routine commits and branches.
category: coding
triggers: [merge conflict*, rebase conflict*, detached head, undo a commit, undo my last commit, accidentally committed, wrong branch, reflog, lost commit*, reset --hard, force push*, from git history]
---

# Git rescue

Committed work is almost never lost: the reflog remembers where each branch and HEAD pointed, by default
for 30 days for commits no branch holds any more and 90 days for the rest. Most damage comes from the
rescue itself, a hasty `reset --hard` or a force-push over someone else's work. So stop, look, make a
backup, then take the smallest step that fixes the problem.

## 1. Stop and look

Before anything that changes the repository:

```bash
git status                           # branch, staged and unstaged files, a merge or rebase in progress
git log --oneline --graph --all -20  # where the branches are
git reflog -20                       # where HEAD has been, newest first
git stash list
```

- Say what state it is in and what the user wants: "two commits on main that belong on a feature branch,
  not pushed yet".
- Pushed or not? `git status` shows ahead and behind; `git log --oneline @{u}..HEAD` lists commits not on
  the remote yet. This decides most of what follows.

## 2. Back up, and know what is off limits

- A free backup of where you are: `git branch backup/rescue-$(date +%Y%m%d-%H%M)`.
- Uncommitted changes are the one thing git cannot bring back. Save them first:
  `git stash push --include-untracked -m "before rescue"` (bring them back with `git stash apply`).
- Rewriting history that others may have pulled (main, release branches, someone else's pull request
  branch) needs the user's explicit go-ahead. Rewriting your own unpushed commits is fine.
- Prefer steps that add (revert, a new branch, cherry-pick) over steps that remove (`reset --hard`,
  force-push, filter-repo).

## 3. Undo commits

| Situation | Not pushed | Pushed and shared |
| --- | --- | --- |
| Undo the last commit, keep its changes | `git reset --soft HEAD~1` | `git revert HEAD` |
| Drop the last commit and its changes | `git reset --hard HEAD~1` (after the backup) | `git revert HEAD` |
| Fix the last commit's message or add a forgotten file | `git commit --amend` (after `git add <file>`) | A new commit |
| Undo a merge | `git reset --hard ORIG_HEAD`, right after merging | `git revert -m 1 <merge-sha>` |
| Unstage a file | `git restore --staged <file>` | |
| Throw away edits to a file | Look first (`git diff <file>`), then `git restore <file>` | |

Commits on the wrong branch, splitting a commit, undoing a rebase and more: `references/recipes.md`.

## 4. Recover lost work

- **A commit or branch reset away or deleted:** find it in `git reflog` (or `git reflog show <branch>`),
  look at it (`git show --stat <sha>`), then `git branch rescued <sha>`.
- **A dropped stash:** `git fsck --unreachable | grep commit | cut -d' ' -f3 | xargs git log --merges
  --no-walk --grep=WIP` lists lost stashes; bring one back with `git stash apply <sha>`.
- **A deleted file:** `git log --oneline -- path/to/file` shows the commit that deleted it; restore it
  with `git restore --source=<sha>~1 -- path/to/file`.
- **Uncommitted edits lost to `reset --hard` or `restore`:** git never had them, unless they were
  staged: `git fsck --lost-found` writes staged blobs to `.git/lost-found/other/`. Then check the editor's
  local history and any backups.

## 5. Merge and rebase conflicts

1. `git status` names the operation; `git diff --name-only --diff-filter=U` lists conflicted files.
2. For each file, understand both sides before editing: what each branch was trying to do
   (`git log --oneline -3 HEAD -- <file>`, then the same with `MERGE_HEAD`, or `REBASE_HEAD` during a
   rebase; or the pull requests).
3. Resolve by keeping the intent of both changes, not by picking a side for every file. Remove all the
   markers (`<<<<<<<`, `=======`, `>>>>>>>`); `git diff --check` finds leftovers.
4. Taking a whole file from one side: `git checkout --ours <file>` or `--theirs <file>`. During a rebase
   these are swapped from what most people expect: "ours" is the branch you are rebasing onto and
   "theirs" is your own commit being replayed.
5. Lock files (`package-lock.json`, `poetry.lock`, `Cargo.lock`): do not merge them by hand. Take one side,
   rerun the package manager to regenerate it, and stage the result.
6. Build and run the tests, then `git add <file>` and `git merge --continue` or `git rebase --continue`.
7. Lost? `git merge --abort`, `git rebase --abort` or `git cherry-pick --abort` returns to where you were.

## 6. Detached HEAD

HEAD points at a commit instead of a branch, and commits made there are easy to lose when you switch
away. Keep them with `git switch -c <new-branch>`. Already switched away: find them in `git reflog`, then
`git branch <name> <sha>`. If `git status` says a rebase is in progress, finish or abort the rebase
instead.

## 7. A secret was committed

1. **Rotate it first:** revoke the key or password at the provider and issue a new one. Once pushed,
   assume it was copied; rewriting history does not reach forks, clones, caches or CI logs.
2. **Not pushed:** remove it from the files, add the file to `.gitignore`, `git rm --cached <file>` if the
   whole file should go, and amend or redo the commits that contain it. Check with
   `git log -p --all -S'<a few characters of it>'`.
3. **Pushed:** with the user's go-ahead, rewrite history in a fresh clone with `git filter-repo
   --sensitive-data-removal --invert-paths --path <file>` (or `--replace-text <expressions-file>`),
   force-push every affected branch and tag, have collaborators clone again, and follow the host's guide
   for purging cached copies (pull request refs, forks). git filter-repo is a separate tool; install it
   for the user's account (for example `pipx install git-filter-repo`), not system-wide.
4. **Prevent a repeat:** ignore env files, and add a secret scanner (see the security-check skill).

## 8. A huge file was committed

- Not pushed: `git rm --cached <file>`, add it to `.gitignore`, and amend or redo the commits that hold it.
- Find what is big in history: `git rev-list --objects --all | git cat-file
  --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' | awk '$1 == "blob"' | sort -k3 -n -r
  | head -20`.
- Pushed, or rejected by the host (GitHub refuses files over 100 MB): `git filter-repo
  --strip-blobs-bigger-than 50M`, or move the files to Git LFS with `git lfs migrate import
  --include="*.psd" --everything`. Both rewrite history: backup, go-ahead, force-push, re-clone.

## 9. Force-pushing

Only after rewriting history you are allowed to rewrite. Use `git push --force-with-lease`, never plain
`--force`: it refuses when the remote has commits you have not seen. Tell collaborators what happened and
what to run on their copy.

## Pitfalls

- `reset --hard`, `clean -fd`, `restore .` or `stash drop` without first looking at what they remove.
- Rewriting pushed, shared history without asking, or to tidy up.
- Scrubbing a secret from history without rotating it.
- Resolving every conflict by taking one side.
- Forgetting that ours and theirs swap during a rebase.
- Deleting the backup branch before the user has confirmed all is well (remove it then; see clean-up).
