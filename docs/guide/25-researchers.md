# Research: papers, writing and the lab

<!-- Lead: the intro paragraph and the picture line (images/researchers.webp). -->

## Keep up with your field

<!-- Workstream B1: Paper radar, Citation alerts, New-model watch, Deadline radar, Living related work, Gap finder. Subsections (###) as needed. -->

<!-- end: keep-up -->

## Read and organise papers

<!-- Workstream B2: Reading list with Zotero sync, Literature matrix, Reproduce a paper. -->

<!-- end: read -->

## Check a paper before you submit

<!-- Workstream C: the pre-submission check (references, anonymity, format, required parts, numbers that match the runs), the arXiv package and camera-ready. -->

<!-- end: check -->

## Review, answer and present your paper

<!-- Workstream B2: Reviewer simulator, Rebuttal workbench, Paper to talk, poster and thread, Figure doctor. -->

<!-- end: present -->

## Run your lab's work

Three ready-made apps, under **Lab** on the [Apps](/apps) page, help with a lab's daily work: labelling data and checking a model against your labels, testing an idea on your own code from hypotheses to a report, and tuning a model's settings. The sprint and the sweep run their jobs in [Experiments](/guide/experiments), so they need it to have a computer (or a cluster) with GPUs.

### Annotation workbench

**Annotation workbench** has you and a model label the same sample of texts, so you see where you disagree and how far the model can be trusted with the rest. Open it from **Apps** and fill in:

- **The labels**, between commas: up to nine, one for each key from 1 to 9. **How to label**: your guidelines, in your own words; the model labels with them too.
- The texts: **a CSV or JSON lines file**, **a Hugging Face dataset** by its name (as stanfordnlp/imdb) or its address, with **Its split** when it has several (and its configuration before a slash, as plain_text/test), or texts pasted, one a line. **The column with the text** is found by itself (one called text, review or sentence, else the one with the longest texts): name it when the guess is wrong.
- **How many to label**: taken at random, 100 unless you change it, at most 1,000.

It reads the texts (a dataset through Hugging Face's datasets server, a few pages of rows from random places), takes the sample in a random order, and has the helper model label them twenty at a time, each with a short reason. The run's page is then where you work:

- **Label**: a text at a time, with a big button for each label. Press one, or its key (**1** to **9**): only then does the model's label show, in a line above the next text (with its reason when you disagree), so it never sways you. **Skip for now** (**S**) sends a text to the end, **Change** (**Z**) takes back the last one, and a note (**N** to start one) stays with its text. The bar shows how far you are.
- **Disagreements**: each text you and the model labelled differently, your label and notes beside the model's label and reason. **Label it again** sends it back to **Label**.
- **Agreement**: how often you gave the same label, Cohen's κ (that agreement beyond what chance alone would give: 1 is perfect, 0 no better than chance, above 0.6 substantial) and what chance alone would give, and the confusion matrix: your labels down the side, the model's across the top.
- **Export**: **CSV** or **JSON lines** downloads the texts you labelled, each with your label, the model's and its reason, and your notes. **Publish on Hugging Face** makes a dataset of its own there (private unless you choose **Everyone**), with the data and a card that says how it was labelled, with your guidelines and how well you and the model agreed. It needs a Hugging Face token that can write: the app does without it otherwise, so the first time you publish it says so; add it under the app's form (**Hugging Face token**, marked optional) or in **Apps → Connected apps → Keys** as HF_TOKEN. **Remove its texts** deletes a set's texts and labels.

Each set is a run of its own, and keeps its texts and your labels as the app's records: the app's page lists your sets among its latest runs, and each opens where you left off.

### Research sprint

**Research sprint** takes a research question through a short sprint on your own code, with you approving each step. Fill in **Your research question**, **The repository** (a Git repository on this computer), **What it should know** (the metric that matters, the baseline and its numbers, how to train and evaluate, what not to change), **GPU hours it may use** (8 unless you change it, for all its runs together) and **How many hypotheses** (one to five). Then:

1. The helper model proposes hypotheses from your question and the repository's README, each with what would support it and what would count against it, and the experiment that tests it.
2. With **Let me approve each step** ticked (it is unless you untick it), the run waits for you: keep them, or write the ones to test instead, one a line. The question shows on the run's page, in your inbox and as a notice.
3. An agent makes a worktree of the repository on a new branch (sprint/…), beside your checkout, which it never changes. There it writes the plan (SPRINT.md) and the code the runs need, commits them, and lists the runs: a baseline and each hypothesis's, with seeds. Those that would go past your GPU hours are left out, and named.
4. It waits for you again, before any GPU time is spent: start the runs, or say no, and the sprint stops there (the plan and the code stay on the branch).
5. Experiments runs them, tagged with the sprint, and the sprint waits for them all to end.
6. A results table compares each condition with the baseline, with significance; an agent analyses the runs in a Jupyter notebook, saved in your [Library](/library), decides each hypothesis (supported, not supported or unclear, with its evidence) and writes a short report.

Its view has **The sprint** (the question, how it went, its branch, and each hypothesis with its verdict and evidence), **Runs** (the results table, and each run with its metric) and **Report** (to read and copy, with **Open the notebook** and what to try next). Run from the API or a schedule, nobody is there to approve, so it goes straight through.

### Sweep planner

**Sweep planner** plans a hyperparameter sweep of a training script within a budget, starts it, stops bad trials early, and writes up what mattered. Fill in **The script or command**, **Its folder**, **The metric** (as the script prints or writes it: metric=value lines, or JSON) and **Which way is better**, **Settings to tune** (one a line, with the values to try, as lr: 1e-4, 3e-4, 1e-3; leave it empty to have them found), the **Budget** (runs or GPU hours: "20 runs", "10 GPU hours") and **Stop bad trials early**.

- An agent reads the script, without running or changing it: its arguments, how long a run takes and when a bad run shows. It proposes the settings and values to try (yours, when you gave them), and a program fits them to the budget: every combination when they fit, else as many random draws as it allows.
- With **Let me check the plan first**, the run waits for you: start it as it is, or write changes, one setting a line (lr: 3e-4, 1e-3 for other values, drop dropout to leave one out).
- Experiments runs the sweep as one experiment; with **Stop bad trials early**, a run clearly worse than the best so far is stopped, to save its GPU time.
- When the runs have ended, a program finds the best run and how much each setting mattered (the share of the metric's spread across runs that its values account for), and the helper model says what that means and what to try next.

Its view has **Results** (the best run's settings and metric, what it found, what to try next, and a bar for each setting's weight), **By setting** (the metric for each of a setting's values, as boxes) and **All runs**.

<!-- end: lab -->

## Reports: your week and your lab notebook

Two ready-made apps, under **Work** on the [Apps](/apps) page, write up what you did from what Hydor knows of your work: your sessions (those here, and the Claude Code and Codex sessions in VS Code or a terminal that Hydor reads), your commits in the Git repositories they worked in, your Experiments runs, what you made in the Library and the papers you marked read in your Reading list. Sessions with memory off and Confidential sessions are left out, and so is the work of sessions agents start for parts of a task (it counts as their parent's). Both open on a page of their own, and can update by themselves.

### Weekly progress report

**Weekly progress report** turns your week into an update for your advisor, your team or a manager: what got done, results with their numbers, problems and what blocks you, next week's plan, and questions to ask. It opens on its own page with this week's report (the seven days up to the day it is written): its title and summary, the week in numbers, then **Done**, **Results**, **Problems and blockers**, **Next week** and **Questions**.

- **Copy as Markdown**, and **Copy as an email** (a subject line, then a short note that opens and closes as yours would), put it on your clipboard; **Save as a document** keeps it in your Library, to change and export as Word or PDF.
- **Update** writes this week's report now. **Earlier**, under it, lists the earlier weeks, each a click away.
- **Settings**, the sliders at the top: **Update automatically** (off until you turn it on) writes a new one each Friday at 16:00; under the switch, pick other days (**Every day**, **On weekdays**, **Once a week on** a day) and the time. It is a [scheduled task](/guide/tasks), so [Settings → Scheduled tasks](/settings?s=tasks) lists it too. Below it: **Who it is for** (your advisor, your team or a manager: it writes for them), **Projects** (all of them, or some, by name) and **What to include** ("research only, no costs").

### Lab notebook

**Lab notebook** keeps a dated entry for each day you worked: what was tried, what was found and decided, and what is still open, with links to that day's sessions, commits, runs, files and Library items. Its entries are the app's own records, kept apart from [memory](/guide/memory). It opens on its own page with them, newest first:

- **Search the notebook** finds entries by their words and by what they mean (when [Search by meaning](/settings?s=memory&find=Search%20by%20meaning) is on), best first; **All entries** brings them all back.
- **Copy its link**, under each entry, copies the address of its own page, which shows the entry as it was written: to cite it in a paper, a report or a note.
- **Update** writes today's entry now, and **Write an earlier day** a day you missed. A day written again takes the place of its entry; a day you did nothing gets none.
- **Settings**: **Update automatically** (off until you turn it on) writes the day's entry each evening at 21:00, on the days and at the time you pick; **Projects** keeps it to some projects.

<!-- end: reports -->

## Ask an agent

<!-- B1's examples -->

<!-- end: ask-b1 -->

<!-- B2's examples -->

<!-- end: ask-b2 -->

<!-- C's examples -->

<!-- end: ask-c -->

<!-- D's examples -->

- "Load 200 texts from the sentiment part of tweet_eval on Hugging Face into the Annotation workbench, with the labels positive, negative and neutral and these guidelines: …"
- "How well do I agree with the model on my latest annotation set? Which labels do we confuse most?"
- "Run a research sprint on whether a curriculum from short to long queries helps the retriever in ~/code/retriever, with 6 GPU hours."
- "Plan a sweep of the learning rate and batch size of ~/code/model/train.py within 10 GPU hours; lower val_loss is better."
- "Turn on my weekly progress report: for my advisor, Fridays at 15:00, only the Retriever project."
- "What did I decide about hard negatives last week? Look in my lab notebook."
- "Write my lab notebook's entry for last Tuesday."
