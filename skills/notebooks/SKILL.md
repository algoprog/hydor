---
name: notebooks
description: Use when making, running or changing a Jupyter notebook (.ipynb), such as an analysis, a lesson or tutorial, a model trained step by step, or any notebook handed over to run again. Not for a one-off answer from data (data-analysis).
category: data
triggers: [jupyter, ipynb, python notebook, colab notebook, kaggle notebook, notebook cell*, notebook kernel, analysis notebook, training notebook]
---

# Notebooks

A notebook is read from top to bottom and then run again by someone else. As a document, each output has to
make sense where it stands; as a program, it has to run in a fresh kernel on their computer. Plan what it tells,
write it as text and small cells, give it an environment to run in, run it all the way through, look at what it
shows, and hand it over.

## 1. Plan it

- Who it is for and what they should get from it: learn a method, repeat an analysis, check a result, reuse a
  model. That sets how much to explain.
- One notebook, one job, in sections that tell it: for a model, data → model → training → evaluation →
  predictions → saving; for an analysis, question → data → checks → findings → caveats.
- What it needs: packages, data (where from, how big), hardware and time. Aim for a run of minutes on a laptop's
  CPU; make longer work a choice (a constant to turn up), not the default.
- Where it lives: in the user's Library (to read, run and come back to, with versions and Ask; it runs in a folder
  of its own there), or as a file in the project's or the session's folder when it belongs with code or data there,
  with what it reads and writes in folders beside it (`data/`, `outputs/`). Write and run it as a file either way.

## 2. Write it

Never type the notebook's JSON by hand. Either:

- write the cells as a Python script with `# %%` markers (`# %% [markdown]` before a text cell, its lines as
  comments) in a scratch folder, and turn it into a notebook with this skill's `scripts/py_to_notebook.py`:
  `<this folder>/scripts/nb-python <this folder>/scripts/py_to_notebook.py draft.py analysis.ipynb`;
- or build it with `nbformat` in a short script; to change cells of a notebook that exists, use your
  notebook-editing tool (NotebookEdit) or nbformat, never a rewrite from memory.

How it reads:

- **First, a text cell:** a title, what the notebook does and shows, what it needs (packages, data, time,
  hardware), and its main result once known.
- **A text cell before each section:** why this step, and what to look for in its output; not the code retold.
- **Small code cells**, each doing one thing and ending with something to see: a line printed, a table's first
  rows, a chart. Helper functions in a cell of their own, above their first use.
- **Settings at the top:** imports, constants in capitals (`DATA_DIR`, `EPOCHS`, `SEED`), a seed for each random
  generator used, the device (`cuda`, then `mps` on Apple silicon, then `cpu`), and a commented
  `# %pip install …` line for what may be missing.
- **Runs in order from a fresh kernel:** no cell needs one below it or something done by hand; paths are relative
  to the notebook's folder (its kernel starts there); downloads happen only when the file is not there yet.
- **Output that reads well once saved:** a line per epoch or step, not a progress bar per batch; a table's head or
  a summary, not thousands of rows; numbers rounded to what matters.
- **Charts:** one point each, axes labelled with units, a title that says what to see, colours that work on a
  light and a dark page (or in the person's own theme, if they keep one); `%config
  InlineBackend.figure_format = "retina"` keeps them sharp at their size.
- **No secrets** in cells or outputs: read keys from the environment (`os.environ["API_KEY"]`) and never print
  them.

## 3. Give it somewhere to run

Hydor's notebook page runs a notebook in a Python environment that has `ipykernel`. It lists virtual
environments named `.venv`, `venv` or `env` in the notebook's folder or the folders above it, conda
environments, the system Python and registered Jupyter kernels, and suggests the one beside the notebook first.

- Look for an environment that already has what the notebook needs (`<python> -c "import torch, pandas"`) before
  making one.
- Otherwise make one beside the notebook, so it is suggested: `uv venv .venv`, then
  `uv pip install --python .venv/bin/python ipykernel <packages>` (or `python3 -m venv .venv` and
  `.venv/bin/pip install …`). For PyTorch on a computer whose GPU it will not use, `--torch-backend=cpu` (uv) or
  PyTorch's CPU index keeps the download small.
- Ask before installing into an environment that exists already (it is the person's), before downloads of more
  than a gigabyte or two, and before anything for the whole system. In a git repository, keep `.venv/`, data and
  model files out of commits.
- A notebook in the Library has no folder beside it to find a `.venv` in: it is offered the conda environments,
  the system Python and registered kernels. Register the environment you made, with the user's OK
  (`.venv/bin/python -m ipykernel install --user --name <name> --display-name "<Name>"`), and set the notebook's
  `metadata.kernelspec` to that name and display name: the notebook page then suggests it.

## 4. Run it through, then look

Run every cell in a fresh kernel and save the notebook with its outputs, with this skill's runner:

```bash
<this folder>/scripts/nb-python <this folder>/scripts/run_notebook.py analysis.ipynb --python .venv/bin/python
```

It runs the cells in order in that environment, in the notebook's folder, keeps each stream's output as one
block, stops at the first error (saving the notebook with the error under its cell), and reports errors,
warnings, slow cells, the file's size and the pictures the cells drew, saved as PNG files for you to look at.
`nb-python` sets up its two libraries once, in Hydor's data folder; the notebook's own packages come from the
environment given with `--python`.

- Fix each error and run it again from the top until it runs clean. The outputs you hand over come from the
  notebook exactly as handed over, in one run.
- Read the outputs as the reader will: numbers that look wrong (accuracy at chance, a loss that climbs, totals
  that do not add up), warnings worth acting on, cells that print too much.
- Look at every picture: labels, overlaps, empty or squashed charts.
- Heavy work runs in the background. On a shared computer keep to its rules (no GPU: `CUDA_VISIBLE_DEVICES=`
  before the command; a cap on memory).
- A saved notebook of more than a few MB is nearly always its outputs: fewer or smaller pictures, shorter prints.

## 5. Hand it over

- For the Library: `save_notebook` with `path`, the .ipynb you ran (its outputs come along), and a title. It
  opens in the Library's notebook view, where the person reads it, runs it, asks an agent about a cell, and exports
  it. Then remove the file you ran unless they want it too.
- For a file in a folder: call present_files with the notebook: its card opens it in Hydor's notebook page,
  outputs and all, where the person can pick the environment and run the cells again.
- Say what it does, the main result, how long it takes to run and on what, the environment it runs in (the
  `.venv` beside it is picked by itself), and what running it writes (downloaded data, saved models).
- Remove what you made only to check it (draft scripts, test copies); keep what running it needs.

## Changing a notebook someone has

- Read it first, outputs too (a Library notebook: get_page with its id). Keep their cells, ids, metadata and style;
  change only what was asked.
- A Library notebook changes with `save_notebook` and its id: to keep outputs that match the code, export it
  (`export_page`, format `ipynb`) into your folder, change and run it there with the runner, and save it back with
  `path`.
- Run it again after changing code, so outputs match the code; if it is too slow to rerun, say which outputs are
  out of date.
- If they have it open in the notebook page with unsaved changes, the page asks whether to reload it or keep
  theirs: tell them you changed the file. What they run there reaches the file only when they save it.

## Pitfalls

- Hidden state: a notebook that only works because cells ran in another order, or used a variable from a cell
  since deleted. A fresh run from the top catches it.
- Absolute paths, and files only you have (`/home/you/data.csv`).
- Outputs left from an older version of a cell.
- A progress bar per batch or step: thousands of lines in the saved file.
- Data or model files of hundreds of MB committed to git, or pasted into outputs.
- An environment the person cannot find or start: name it in the reply.
