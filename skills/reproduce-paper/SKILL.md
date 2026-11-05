---
name: reproduce-paper
description: Use when reproducing a paper's results (finding its code and exact setting, building its environment, fetching data and checkpoints, running its evaluation, comparing with its table), or checking whether a published number holds up.
category: research
triggers: [reproduce the paper, reproduce a paper, reproduce this paper, reproduce their results, reproduce the results, replicate the results, reproducibility study, rerun their evaluation, match the paper's numbers, the paper's code]
---

# Reproducing a paper's results

A reproduction answers one question: running the authors' method as they describe it, do you get
their numbers? Pin down the exact target, set up exactly what they used, try it small before you
try it big, compare like with like, and write down everything you changed. A number that does not
match is a finding too, when you can say why. The report's outline is in `references/writeup.md`.

## 1. The exact target

- Name it as the paper does: the table, the row and the column ("Table 2, BM25 + monoT5, MRR@10 on
  MS MARCO dev"), and copy the number exactly as printed, with its page.
- Read what the paper says of the setting: the dataset and its version and split, the model and its
  checkpoint, hyperparameters, seeds, the number of runs averaged, the hardware and precision, the
  evaluation script and its cutoffs. Check the appendix and the supplementary material: settings
  often hide there.
- Note which version you read (arXiv v1 and v3 can differ, and the published one again). Read the
  code's issues for "reproduce" and "numbers": others may have met the same gap.
- Say what is out of reach before you start (a private dataset, a model never released, more GPU
  hours than you have), and reproduce what is in reach.

## 2. Find the code

- In order: the paper's own links (abstract, footnotes, the last page), the arXiv page's "Code"
  links, the authors' pages, the venue's page (OpenReview's supplementary), GitHub's search for the
  title or the method's name, and Hugging Face (models and datasets named after the paper). Papers
  with Code closed in 2025: do not count on it.
- Check that it is the paper's code and not a re-implementation: the authors, the README's
  citation, a commit near the paper's date. Use the commit or tag of the paper's version when there
  is one, and write down the hash you used.
- No code at all: say so, and reproduce from the paper's description only if the user wants that
  (it is a re-implementation, and its numbers say less).

## 3. A clean environment

- Make it as the repository says: `requirements.txt` or `pyproject.toml` (a venv, or `uv venv`),
  `environment.yml` (conda), or its `Dockerfile`. Use the Python version its setup or CI names.
  Never install into the system's Python.
- Keep the environment, the data caches and the outputs in the work folder (`HF_HOME`,
  `TORCH_HOME`, `TRANSFORMERS_CACHE` pointed there), so what it uses on disk is in one place and
  can be removed.
- Match the GPU stack: the CUDA version PyTorch was built for, against the driver's (`nvidia-smi`).
  Old code with new libraries breaks quietly: pin what the repository pins; when it pins nothing,
  pick versions from the paper's date.
- Write down the exact versions (`pip freeze > freeze.txt`, `conda env export`).

## 4. Data and checkpoints

- Get them from their official sources, at the version the paper used, with their licences
  respected. Check the free disk first (`df -h`), and the download's size; check checksums when
  they are given.
- Checkpoints from Hugging Face: `huggingface-cli download <repo> --revision <commit>` (a revision
  fixes the version); datasets with `datasets` and an explicit revision.
- When the authors' checkpoint is gone, say so; training it again is a different reproduction
  (and costs much more): ask before you do.

## 5. Small first

- Run the whole pipeline on a tiny slice before the real run: ten queries, a hundred documents, one
  batch. It finds wrong paths, formats and versions in minutes instead of hours.
- Check the slice's output by eye: the right files, sensible scores, no empty rankings.

## 6. The real run

- A run that needs a GPU or takes more than a few minutes goes through Experiments when you have
  it: `experiment_run` with the `command`, its folder as `cwd`, a `name`, `gpus` and `hours` within
  your limits, and the paper's id in `tags`. It waits for free GPUs, runs on its own, keeps the
  run's record, its log and its metrics, and the user sees it under System → Experiments. It
  answers at once with the run's id: read how it goes with `experiment_get` (its status, metrics and
  the end of its log). In the Reproduce a paper app, hand in the ids instead of waiting: the app
  waits for the runs to end, then an agent finishes from your notes. Without Experiments, run it in
  the background with its output in a log. Never take a GPU another run is using, and never stop
  someone else's run.
- Keep within the limits you were given (hours, disk, GPUs). When a limit would be passed, stop,
  and report what you have and what the rest would need.
- Several seeds when the paper averages them and it is cheap; report the mean and the spread.

## 7. Compare like with like

- The same metric, the same way: the paper's own evaluation script, else the standard one
  (`trec_eval`, `ir_measures`, `pytrec_eval`; `sacrebleu`; `lm-eval`), with the same cutoffs (MRR@10
  is not MRR@100) and the same qrels or references.
- Put each number beside the paper's, with the difference. Within noise is reproduced: about half a
  point on a 0–100 scale (0.005 on a 0–1 scale) for most IR and NLP metrics; more for small test
  sets or high-variance training. A gap needs a reason.
- The usual reasons for a gap: another checkpoint or data version (MS MARCO v1 or v2, a dataset
  re-release), another tokenizer or library version, precision (fp16 or bf16 against fp32), index
  or BM25 settings (k1, b, stemming, stopwords), truncation lengths, nondeterminism on GPUs, a bug
  fixed in the code after the paper, or a setting the paper never states.
- Try the likely reason when it is cheap, and say which gaps you explained and which you could not.

## 8. Write it down

- Every change you made to their code or settings, with the file, what and why ("pinned
  transformers==4.30 for its tokenizer"); every fix of something broken; the commands you ran.
- The time each step took, and the GPU hours and disk in all.
- `REPRODUCTION.md` in the work folder, as `references/writeup.md` lays it out. Hand over the
  numbers, the steps, the fixes and the report: the Reproduce a paper app shows them side by side.

## Pitfalls

- Comparing with a number from another table, version or split than the one you ran.
- Tuning on the test set to close a gap: it is not a reproduction any more.
- Leaving out a change you made because it "should not matter".
- Calling a gap "noise" without knowing the noise (several seeds, or the paper's own spread).
- Long runs without a small run first; downloads that fill the disk.
- Keys, tokens or private data written into the report or the repository.
