---
name: git-bisect
description: Use when something worked in an earlier version and is broken now ("it worked in 1.2"), to find the commit that broke it with a check script and git bisect run in a worktree of its own, and to explain why that commit broke it.
category: coding
triggers: [find what broke it, what broke it, which commit broke, which change broke, first bad commit, git bisect, bisect*, worked in v*, broke after updat*]
---

# Find what broke it

`git bisect` halves the commits between a good end and a bad end until one is left: the first bad commit. With
a script that tells good from bad, `git bisect run` does every step by itself, about log2(n) checks: 1,000
commits take 10. The work is in the script; the answer is only as good as it. For a bug with no "it used to
work", see debugging-code.

## 1. What exactly is broken

Pin the symptom down to something a program can see: a command's output, an exit code, a test, a page's text,
a time over a limit. "The export is broken" becomes "`./export --pdf sample.docx` exits 1 with 'image too large'".
If the request is vague and you can ask, ask; otherwise make it concrete yourself and say how.

## 2. The two ends

- Good: where it worked (a tag, a release, a commit); bad: where it is broken (usually HEAD).
- `git rev-parse <good>^{commit}` and `git rev-parse <bad>^{commit}` say they exist.
- Good must come before bad: `git merge-base --is-ancestor <good> <bad>`. If not (a release branch), bisect from
  `git merge-base <good> <bad>` and say so.
- `git rev-list --count <good>..<bad>` says how many commits lie between, so you can say how long it will take.

## 3. A worktree of its own

Bisecting checks out commit after commit, so never do it in the user's checkout. A session started from Git's
**Find what broke it** already runs in a worktree of its own. Otherwise make one:
`git worktree add --detach ../bisect-<short-name> <bad>`. Bisect state belongs to the worktree: the user's own
checkout and branches stay as they are.

## 4. The check script

Keep it outside the repository (checkouts would change it), say `/tmp/bisect-<short-name>/check.sh`:

```sh
#!/bin/sh
# Exits 0 when it works, 1 when it is broken, 125 when this commit cannot be tested.
cd "$(git rev-parse --show-toplevel)" || exit 125
npm ci --silent >/dev/null 2>&1 || exit 125         # cannot build this commit: skip it
out=$(timeout 120 node bin/export.js --pdf /tmp/bisect-export/sample.docx 2>&1)
code=$?
[ $code -eq 124 ] && exit 1                          # hangs: that is the bug here (or 125, if not)
echo "$out" | grep -q 'image too large' && exit 1    # the symptom
[ $code -eq 0 ] && exit 0
exit 125                                             # failed some other way: not this bug
```

- **0** good, **1** bad (any of 1 to 127 but 125), **125** skip. Anything 128 or over (a crash: 139 is a
  segfault) stops the bisect: turn crashes into 1 when the crash is the bug, 125 when it is not.
- Test the symptom, not "the whole suite passes": an unrelated failure in an old commit misleads the bisect.
- Set up what each commit needs: dependencies when their lock file changed (`npm ci`, `uv sync`), submodules
  (`git submodule update --init`), a build. Clean only inside the worktree (`git clean -fdx`) when old build
  output could leak from one commit to the next.
- A symptom that comes and goes: run the check three times and call it bad if any run fails.

## 5. Try it on both ends first

```bash
git checkout --detach <good> && sh /tmp/bisect-<short-name>/check.sh; echo $?   # must be 0
git checkout --detach <bad>  && sh /tmp/bisect-<short-name>/check.sh; echo $?   # must be 1
```

Good gives 1: the check is wrong, or it was not good there; find an older good end or fix the check. Bad gives 0:
it does not reproduce here (data, settings, the platform). Stop and say so rather than bisecting noise.

## 6. Run it

```bash
git bisect start <bad> <good>
git bisect run sh /tmp/bisect-<short-name>/check.sh
git bisect log > /tmp/bisect-<short-name>/bisect.log
```

The output ends with "<hash> is the first bad commit" and that commit. Skipped commits can leave a few
candidates ("The first bad commit could be any of"): look at each. For a long history of merges,
`git bisect start --first-parent` finds the merge first. For a slowdown rather than a breakage,
`--term-old fast --term-new slow` reads better.

## 7. Why it broke

- `git show <hash>`: find the part of the change that causes the symptom, and explain the mechanism in plain words.
- The strongest proof: undo just that commit on top of bad and check again:
  `git checkout --detach <bad> && git revert --no-commit <hash> && sh check.sh` gives 0. Then
  `git revert --abort` (or `git reset --hard` inside the worktree).
- Suggest a fix: a revert, or a change that keeps what the commit wanted and drops the bug.

## 8. Clean up and report

- `git bisect reset`, always, even when it went wrong.
- Remove a worktree you made (`git worktree remove ../bisect-<short-name>`) unless asked to keep it; leave the
  session's own (the user removes it with the session). Delete the scratch folder.
- Report: the first bad commit (hash, subject, author, date, and its link on GitHub or GitLab when there is one),
  what in it broke what and why, the evidence (the check at both ends, the revert test), the fix you suggest, and
  how many steps and skipped commits it took. Change nothing on the user's branches unless asked.

## Pitfalls

- A dirty worktree: bisect carries the changes along, or refuses.
- The script inside the repository, changing with each checkout.
- A check that fails for another reason in old commits (a missing tool, a changed command line): skip those (125).
- Forgetting `git bisect reset`, which leaves the worktree on an old commit.
