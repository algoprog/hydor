---
name: clean-up
description: Use when a task is done, before the final reply, to remove what was made along the way and is no longer needed (scratch files, test data, temporary folders, git branches, worktrees and stashes, processes and containers started for the work), and whenever asked to clean or tidy up after work.
category: work
triggers: [clean up after, tidy up after, clean up afterwards, leftover files, temporary files, temp files, stale branches, unused branches]
---

# Clean up after a task

A finished task leaves what was asked for and nothing else. Scratch files, test data, extra branches
and forgotten processes cost the user disk space, attention and sometimes money, and they get in the
way of the next task. Clean up as the last step of the work, before the final reply.

## The steps

1. **List what you made.** Go back over the task: files and folders you created, things you
   downloaded or installed, git branches, worktrees, stashes and commits, processes, servers, watchers,
   containers and virtual environments you started, rows or tables you added to a database to test
   something, anything you created on a cloud service. `git status`, `git branch`, `git worktree list`,
   `git stash list` and a list of your own processes help.
2. **Sort each into keep or remove.**
   - Keep: what the user asked for, and anything the reply points to; what they will use next (a server
     they asked to keep running); what the project needs to run (installed dependencies, a build it is
     served from); work someone still has to review or merge (a branch with unmerged commits, a pull
     request's branch, a child session's worktree).
   - Remove: scratch and test files, sample data, debug logs, screenshots taken only to check
     something, `.bak`, `.orig` and `.rej` files, temporary folders, one-off scripts, branches that are
     merged or abandoned, worktrees and stashes you made, processes and containers you started.
3. **Never remove what you did not make.** Anything that was there before you started, or that the
   user or another session made, stays, even when it looks unused. When you cannot tell who made
   something, leave it.
4. **Ask first when it is big or unclear:** something large to download again (a model, a dataset),
   anything outside the working folder you are not sure about, a branch with commits not merged
   anywhere, anything shared (a database, a remote branch, a cloud resource).
5. **Remove each thing by name, the safe way.** `git worktree remove <path>`, then `git branch -d
   <branch>` (not `-D`, which also deletes unmerged work); stop a process by its own id, not by a
   pattern that can match other people's; delete the files you listed, not a pattern.
6. **Check that it is gone and that the work still works.** After removing anything the work might
   have used, run the quick check again: the tests, the build, opening the page or the document.
7. **Say what you did, in a line or two:** what you removed, and what you left in place and why.
   ("Removed the test CSVs, the scratch scripts and the branch try-sort; left the dev server running on
   port 5173, as you asked.")

## Pitfalls

- Deleting the result with the scratch: a file in a scratch folder that the reply points to.
- Cleaning too early, while a later step still needs the file. Clean up at the end.
- Broad commands: `git clean -fdx`, `rm -rf` with a wildcard, `docker system prune`, `pkill <name>`.
  They reach far beyond what you made.
- Removing caches the user's tools keep on purpose (package caches, models in ~/.cache) because they
  look big.
- Forgetting what is outside the folder: files in /tmp, a server still holding a port, a container
  still running, a branch pushed to the remote only to test something.
