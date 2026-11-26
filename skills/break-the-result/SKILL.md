---
name: break-the-result
description: Use when a result should be checked before it counts (a gain over a baseline, a new best score, "is this real?"), by looking for other explanations, running the controls in Experiments, and reporting what survived.
category: research
triggers: [try to break it, try to break the result, break the result, is the gain real, is this result real, explain away the gain, run the controls, too good to be true, check for leakage, label leak*, lucky seed*]
---

# Try to break the result

Before a result counts, someone who did none of the work tries to explain it away. Assume the gain is an
accident until the controls say otherwise: automated research mostly fails by trusting a number that came
from a leak, a metric bug, lucky seeds or an untuned baseline. You are not there to improve the work or to
defend it. You look for what else could give that number, test it, and say what survived.

## 1. State the claim exactly

- Which runs against which baseline, which number, by how much, on which data: "runs r1, r2 against r3,
  dev nDCG@10 0.431 against 0.412 (+0.019), on the 6,980 dev queries".
- When the sentence you were given is vague, pin it down from the records before anything else:
  `experiment_get` for each run (command, folder, commit, changes, settings, seed, environment, metrics, its
  log) and `experiment_list` for its whole experiment and folder. Runs left out of the claim count too: how
  many were tried, and was this one picked as the best of them?
- Say which value the claim uses, the last or the best over steps. The best over steps was chosen on that
  data.
- Work in a worktree of your own, never in the person's checkout. A session started from **Try to break it**
  on runs with a commit already has one. Otherwise make one (`git worktree add --detach <scratch>/copy <commit>`),
  or copy the code to a scratch folder when it is not in git. In it, check out the commit each run ran from; a
  run with changes not committed kept them as a patch (`patchPath`; apply it with `git apply`). Untracked files
  are not in the patch: say what you could not reconstruct.
- Never touch a final test or held-out data: do not read its examples, score against it again or choose
  anything by it. If the folder has an evaluation, `evaluation_get` says what is protected, and whether a run
  had its scorer as sealed (a run that did not is itself something to check).
- Read data and saved outputs where they are; write only in your own folder.

## 2. List what else could explain it

Write the list before running anything, cheapest to check first, with what each would predict if it were
the reason. Drop one only with a reason.

- **Seed luck**: too few seeds, or the spread between seeds as large as the gain. Predicts: other seeds
  overlap the baseline.
- **An unequal fight**: the baseline had less tuning, fewer steps, less data, an older checkpoint, a
  different batch size or precision, or the new side is the best of many tries. Predicts: given the same,
  the baseline catches up.
- **A leak**: test or dev examples in training, near-duplicates across the splits, preprocessing or
  normalisation fitted on all the data, labels reachable from the inputs (an id, a file name, a length),
  time order broken, the model or the checkpoint chosen on the test set. Predicts: the number stays high
  when it should not, and falls once the overlap is taken out.
- **A metric bug**: ties, empty outputs, truncation, micro against macro averages, a changed number of
  examples. Predicts: another implementation gives another number from the same predictions.
- **A different evaluation**: another split, filtering, tokeniser, maximum length or prompt. Predicts: the
  gain goes when both sides are evaluated the same way.
- **A different code path**: read the diff between the two commits (and the patches): is anything other than
  the claimed change different (a default, a data loader, a library version in the runs' environments)?
  Predicts: that other change carries the gain.
- **A gain that lives in a few examples**: with per-example scores (`scores.jsonl` in the run's folder, when
  it kept them): a paired test over examples, the largest winners and losers, one slice or one dataset only.
  Predicts: without them there is no difference.

Much of this costs nothing: the records, the diff, the logs (examples counted, warnings, what was loaded) and
the saved predictions.

## 3. Run the controls

Start with the cheapest one that could kill the claim. For each, write down first what it would show if the
result were not real.

| Control | If the result were not real |
|---|---|
| More seeds, for both sides | the two ranges overlap |
| Shuffled labels or inputs | the number does not fall to chance |
| The claimed part switched off in the new code | the gain stays |
| The baseline given the same tuning budget | the baseline catches up |
| The number computed again by other code, from the saved predictions | it comes out different |

- Run them through Experiments (`experiment_run`), in an experiment of their own: as `group`, the claim's
  experiment's name with `-controls` added, so the claim's own table, charts and best run stay as they were.
  Give it a title and a description with `experiment_describe`. Each run gets the tag `control`, a name that
  says what it is ("control: shuffled labels · seed 1") and `report: true`. On
  the CPU when it can be: say `gpus: 0`, since leaving it out takes a GPU on a computer that has one.
- Have each run write its per-example scores to `$HYDOR_RUN_DIR/scores.jsonl` (its own folder, so runs never
  share a file): they are kept with it, and `experiment_table` then compares the runs example by example.
- Set `cwd` to your own copy. Check the command for paths it writes to (checkpoints, predictions, logs) and
  point them somewhere new, so a control never overwrites what the claim rests on.
- More seeds: the same commit, patch, data, settings and environment as the claim's runs, only the seed
  changed. A record's command already has its `{seed}` filled in, so give the command again with the new
  seed in it (`again` with `seed` alone may run the old seed again), and check in the log that it took.
- When only the new code can switch the part off, make that change in your copy, small, and show it in the
  report.
- The recomputed metric is your own short script, not the project's metric code; run it as a run too, so its
  number has a record.
- Never start a run on the person's GPUs without their go-ahead. Before controls that need real GPU time,
  ask (a card with `ask_form` when you have it), with the choices in GPU hours: for example "2 GPU hours: two
  more seeds a side", "8 GPU hours: and the baseline tuned too", "None: stop at the free checks".
- No Experiments here: run them in your copy, and keep each command and its output beside the report.

## 4. Do not repair anything

The job is a verdict, not a better result. Do not fix the bug you found and report the new number as the
result, do not tune the new method, never change a number and never drop a run that disagrees. A fix you can
see goes in the report as a suggestion.

## 5. Report

The verdict first, one of these three, then one sentence of why:

- **It holds**: the controls that could have killed it were run, and none of them did.
- **It holds in part**: there is something real, but smaller, or only on some data or settings, or something
  that could still explain it was not settled.
- **It does not hold**: a control showed what it would show if the result were not real.

Then:

1. The claim as you pinned it down.
2. A table: **what was tried** · **what it would have shown if the result were not real** · **what it
   showed** · **the run** (its id).
3. What was not checked, and why (cost, data you may not touch, something you could not reconstruct).
4. The one next step that would settle what is still open.

Then keep the verdict for the project: `finding_record` with the claim as the statement (It holds → `supported`,
in part → `unclear`, does not hold → `refuted`), one or two sentences of what came of it, and the control runs as
evidence (kind `run`).

Numbers only from runs' records. For means, spreads and paired tests use `experiment_table`, and give it the
runs' ids (`runs`), not a group: the claim's runs and the controls are in two experiments. Leave
your worktree for the person when it holds a change a control used; otherwise remove what you made.

## Pitfalls

- Declaring it broken on one noisy control: repeat it, or say how noisy it is.
- Running controls with other seeds than the claim's without saying so.
- "More seeds" taken from a different commit, data or environment than the claim's.
- Reading the final test, "only to check".
- Saying it holds when the control that could have killed it was never run.
