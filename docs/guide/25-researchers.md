# Research: papers, writing and the lab

Hydor helps with the work around research: keeping up with your field, reading and organising papers, checking a paper before it goes out, answering reviews and presenting your work, and running your lab's experiments and reports. Most of it comes as ready-made apps, under **Research**, **Writing**, **Lab** and **Work** on the [Apps](/apps) page, which agents also run for you in any session when you ask in your own words. The checks for a paper sit in the [LaTeX editor](/guide/library), and the jobs you train and evaluate have a place of their own, [System → Experiments](/guide/experiments). Reviewing someone else's submission? Start a [confidential session](/guide/sessions#keep-a-session-confidential): only models on this computer, and nothing leaves it.

![The apps for research on the Apps page](images/researchers.webp)

## Keep up with your field

<!-- Workstream B1: Paper radar, Citation alerts, New-model watch, Deadline radar, Living related work, Gap finder. Subsections (###) as needed. -->

<!-- end: keep-up -->

## Read and organise papers

<!-- Workstream B2: Reading list with Zotero sync, Literature matrix, Reproduce a paper. -->

<!-- end: read -->

## Check a paper before you submit

Before a paper goes out, the LaTeX editor checks it as a venue's desk and its reviewers would: its references, whether it gives you away, its pages and fonts, the parts the venue asks for, and the numbers in its tables. Open your paper ([your LaTeX documents](/library?kind=tex)) and pick **Tools → Check before submitting**.

1. Pick where it goes: **ACL Rolling Review** (a long or a short paper; **EMNLP** and **NAACL** take papers through it), **SIGIR** (full or short), **CIKM**, **WSDM**, **TheWebConf**, **KDD**, **NeurIPS**, **ICLR**, **ICML**, **AAAI**, **An IEEE journal**, **An ACM journal**, or **Other**, with a page limit and **Reviewed anonymously** of your own. A line under it says what the venue asks: its page limit, what does not count toward it, whether it reviews anonymously and the parts it requires. Venues change their rules every year, so the line links to the call for papers too. The check remembers the venue for each paper, and the first time picks the one the paper's own style points to.
2. **Check** typesets the paper, reads its PDF, looks its references up online and shows what it finds as it comes. Only the references' titles, DOIs and arXiv ids are sent, to Crossref, arXiv, OpenAlex, Semantic Scholar and DBLP; what the services said is kept a few days, and one that did not answer is named under the findings. OpenAlex and Semantic Scholar answer programs more readily with a free key of your own: add it in [Keys](/apps/connected?tab=keys) as OPENALEX_API_KEY (for api.openalex.org) or SEMANTIC_SCHOLAR_API_KEY (for api.semanticscholar.org), and the check uses it.

What it finds comes in five groups, each finding marked **Must fix**, **Check it** or **For your information**:

- **References**: keys cited but in no entry of the bibliography (or cited with other capitals than their entry's), entries never cited, the same paper under two keys, and entries without what their kind needs (an article's journal, a paper's proceedings, a year). Every cited entry is looked up by its DOI, its arXiv id or else its title, and compared with what the services list: its title, its authors, its year and where it appeared. A preprint is looked for in a published version, which reviewers expect you to cite. A paper found nowhere is said to perhaps not exist: check it yourself, as the services can miss things too.
- **Anonymity**, where reviewing is anonymous: your names, when the template is in its final version (ACL's, NeurIPS's, ICML's, ICLR's and acmart's have an anonymous one); **\thanks** notes; an acknowledgements section; links that may name you or your lab (your own repository, a personal page); "our previous work" next to a citation; and the PDF's own Author and Title fields.
- **Format**: the pages that count against the limit (up to where the references begin, or the parts the venue does not count, such as ACL's Limitations), the references' pages and the pages in all where the venue caps them; Type 3 fonts and fonts not embedded; changes to the template's margins, fonts and spacing, and negative **\vspace**s (as hints: some are allowed); references and citations that show as ??; **TODO**, **XXX** and **\todo** marks; lines far into the margin; and the errors, when it does not typeset.
- **Required parts**: an abstract, and what the venue asks for: ACL's Limitations section, the NeurIPS Paper Checklist (and its answers still **\answerTODO**), ICML's Impact Statement, ICLR's AI use statement, CIKM's GenAI disclosure, IEEE's Index Terms, ACM's CCS concepts and keywords.
- **Numbers**: see [Numbers that match your runs](#numbers-that-match-your-runs).

The button with a finding's file and line shows it in the source. Where a change is safe, **Fix** makes it: the entry as the services list it, under the same key, so your citations stay as they are (**The entry** shows it first), the published version of a preprint, the template switched to its anonymous version, the acknowledgements commented out, the PDF's Author field cleared, a **\todo** note taken out, the bold moved, a table updated. A fix is a change in the editor like any other: **Undo** takes it back, and **Save** keeps it as a new version. Where no change is safe, **Ask the agent** asks the agent beside the editor, with the finding in the request; **Ask the agent to fix them** asks for all of them at once.

**Add as comments** puts the open findings on their words as the document's comments (see [LaTeX documents](/guide/library#latex-documents)), so you, the people you share the paper with and agents see each where it is; an agent asked to answer the comments fixes them and resolves them. Check again, and it says how many are fixed since the last check, how many are left and how many are new; **Add as comments** then resolves the comments of those fixed.

Agents run the same check on a paper of your Library or a LaTeX project of yours: "check my paper for ACL before I submit it".

### Numbers that match your runs

The check reads every table of the paper, number by number:

- **Bold on the best value.** In each column, bold should mark the best value. Which way is better comes from the column's header: loss, error, latency or perplexity lower; accuracy, F1, nDCG or BLEU higher; an arrow (↓ or ↑) says it outright. Where the header does not say, higher is taken as better, and the finding says so. Bold on the best of each block of rows (between two rules), ties, and tables with their metrics in rows are fine. **Move the bold** puts it on the best value.
- **Tables made by Experiments.** A table you put in the paper from [Experiments](/system/experiments) (**Make a table**, then **Put it in a LaTeX document**) has a line `% hydor:table …` above it. The check works it out again from its runs as they are now, and flags every number that changed since, and significance marks that came or went. **Update the table** puts in the new one.
- **The other tables.** Their numbers are looked for in the finished runs of the paper's project (or its folder), rounded as the table rounds them, and as percentages. How many were found is said for your information, never as a problem: a number may come from another paper, or a run made elsewhere.

### The arXiv package

**Export → arXiv package (.zip)**, at the top of an open LaTeX document (on a phone, **More** (⋯) → **Download as**), makes a .zip of the saved paper to upload to arXiv, which publishes the source as you send it. What it will do is ticked:

- **Take out the comments**, safely: `\%` stays, and so does what TeX takes as it is (verbatim text, listings, **\verb**, the addresses of **\url** and **\href**); `\begin{comment}` blocks go, and with **Take out \iffalse … \fi blocks too**, those as well.
- **Only the files the paper uses**: the pictures **\includegraphics** shows, the files it reads, its own styles and classes.
- **Add the .bbl and leave the .bib out**: the bibliography as it was typeset here, which arXiv uses. Untick it to send the .bib and let arXiv run BibTeX.
- **Put \input and \include files into main.tex** and **Put \pdfoutput=1 first** (arXiv's old way of asking for pdfLaTeX), when you tick them.

Names with spaces get dashes, and the source follows. **Make the package** typesets the package as it is, in the same sandbox as any document, to see it builds, and downloads it. The dialog says what is in it, what was left out or renamed, how it typeset, its size against arXiv's limit of 50 MB, and which processor to pick on arXiv. It remembers your choices.

### Camera-ready, another template, and your paper in the apps

**Tools → Your paper** has the rest:

- **Make it camera-ready** asks the agent beside the editor for the final version, written from the venue's rules: the template's final version, the authors and their affiliations back, the acknowledgements back, the copyright or rights block, what the final version adds, and its page limit. Give it the authors, their affiliations and the acknowledgements if they are not in the source.
- **Move to another template** asks the agent to move the paper to another venue's template (or Springer's LNCS, Elsevier's, a plain article), as its version for review or its final version, keeping its words, figures, tables and references.
- **arXiv package (.zip)**, as above.
- **Review it as reviewers would**, **Answer reviews** and **Make a talk, poster and thread** open those apps with your paper filled in (its PDF, or for the talk the folder of its sources): see [Review, answer and present your paper](#review-answer-and-present-your-paper).

What is not saved yet is saved first, so each gets the paper as you see it.

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

- "Check my paper for ACL before I submit it, and fix what you safely can."
- "Are all the references in my LaTeX paper real, with the right authors and years? Correct the ones that are not."
- "Has any preprint my paper cites been published since? Cite the published versions."
- "Make my NeurIPS paper anonymous for review: names, links, acknowledgements, the PDF's own fields."
- "Is my paper within EMNLP's page limit? If it is over, tighten it to fit."
- "Do the numbers in my results tables still match my runs?"
- "My SIGIR paper was accepted: make it camera-ready."
- "Move my paper to the ICLR template, as the version for review."

<!-- end: ask-c -->

<!-- D's examples -->

- "Load 200 texts from the sentiment part of tweet_eval on Hugging Face into the Annotation workbench, with the labels positive, negative and neutral and these guidelines: …"
- "How well do I agree with the model on my latest annotation set? Which labels do we confuse most?"
- "Run a research sprint on whether a curriculum from short to long queries helps the retriever in ~/code/retriever, with 6 GPU hours."
- "Plan a sweep of the learning rate and batch size of ~/code/model/train.py within 10 GPU hours; lower val_loss is better."
- "Turn on my weekly progress report: for my advisor, Fridays at 15:00, only the Retriever project."
- "What did I decide about hard negatives last week? Look in my lab notebook."
- "Write my lab notebook's entry for last Tuesday."
