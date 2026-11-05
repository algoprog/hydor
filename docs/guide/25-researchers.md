# Research: papers, writing and the lab

<!-- Lead: the intro paragraph and the picture line (images/researchers.webp). -->

## Keep up with your field

<!-- Workstream B1: Paper radar, Citation alerts, New-model watch, Deadline radar, Living related work, Gap finder. Subsections (###) as needed. -->

<!-- end: keep-up -->

## Read and organise papers

Three ready-made apps, under **Research** on [the Apps page](/apps), help with the papers you read: the **Reading list** keeps them, the **Literature matrix** compares several in a spreadsheet, and **Reproduce a paper** checks that a paper's numbers hold by running its code. Open them there, or ask for what they do in any session ("Add 1706.03762 to my reading list"), and the agent runs them for you ([Have an agent run an app for you](/guide/apps#have-an-agent-run-an-app-for-you)).

They find a paper however you give it: a DOI, an arXiv id, a link (arXiv, a DOI's, the ACL Anthology, OpenReview, a publisher's page or a PDF), its title, or a PDF on this computer. They read papers from open copies only (arXiv, the open copies OpenAlex knows of, the paper's own page), never past a paywall: a paper without one is read from its abstract, and the app says so.

### Reading list

[The Reading list](/apps/t/reading-list) opens on your papers rather than on a form: it is a place to work in.

- **Add a paper**: **+ Add**, then **The paper** (a DOI, an arXiv id, a link or its title), and if you like its **Project**, **Tags** (between commas) and **Status**. **Add it** looks it up and keeps it with its authors, year, venue, abstract, links to it and to an open PDF, and its BibTeX entry. A paper you have already is not added again (the same DOI, arXiv id or title): what it lacked is filled in, and your notes, tags and status stay as they were. One that nothing finds is kept with the title you gave and an entry made from it: check that one.
- **Find your papers**: the top says how many you have to read, are reading and have read (click one to show only those), and in how many projects. **Search your papers** finds them by any of their words, and **All**, **To read**, **Reading** and **Read** show one status. Each paper shows its authors, venue and year, its project and tags (click one to show only its papers; its **✕** shows them all again), and **To read**, **Reading** and **Read**, to change where it stands: **Read** notes the day.
- **A paper's own page**: click its title. It has **Its page** and **The PDF** (or **Open the PDF**, for one on this computer), where it stands, its abstract, its project and tags (each with **Save**), your **Notes** (**Save the notes**), its BibTeX (**Copy the BibTeX**) and **Remove it from the list**. **Reproduce it** opens [Reproduce a paper](#reproduce-a-paper) with the paper filled in.
- **By project**: each project with how many papers it has and how many you have read; click one to show its papers. Name one of your [projects](/guide/projects) and its papers go with that project (they follow it when you rename it), or use any name you like.
- **More** has **Import a .bib** (paste it, or give the path of a .bib file on this computer, with a project and tags for the papers it adds: those you have already are completed, yours kept), **Export a .bib** (**Those shown**, as your search and filters show them, or **All of them**: a file to download, or **Copy it**) and **Sync with Zotero** (below).
- **Make a literature matrix**: tick papers (the box at their left), and a bar says how many you picked, with **Make a literature matrix**, which starts the [Literature matrix](#literature-matrix) with them, and **Clear**.

When an agent adds a paper for you, its card shows **The paper**: the paper as the list has it now, whether it was new, **Open your reading list**, and its BibTeX to copy.

### Keep it in step with Zotero

**More** → **Sync with Zotero** → **Sync now** keeps the list and your Zotero library in step.

1. The first time, the page asks for your **Zotero API key**: **Get one** opens Zotero's page of keys, where you make one that may read your library (and write to it, for papers to go there too). Paste it and press **Save**: it goes to your vault, for Zotero alone ([Keep keys in the vault](/guide/connections#keep-keys-in-the-vault)). **Zotero user ID** can stay empty: it is found from the key (for a group's library, give `groups/` and the group's number). Then press **Sync now** again.
2. What is in Zotero comes in: new papers are added, and the ones you have are completed, matched by DOI, arXiv id or title. Zotero's details win where they differ, and your status, notes and project stay yours.
3. Papers only here go to Zotero, as new items.

Each sync after the first moves only what changed since the last one. A paper you delete in Zotero stays here, no longer linked, and is never sent back. A line at the top of your papers says when it last synced and what it did ("12 new from Zotero, 3 sent to it"), with **Sync again**.

### Literature matrix

[The Literature matrix](/apps/t/literature-matrix) reads several papers side by side and fills in a spreadsheet: a row for each paper, a column for each thing you compare, and in each cell what the paper says, with where it says it (its page or section).

- **The papers**: one a line (thirty at most), each a DOI, an arXiv id, a link, a title or a PDF on this computer. Or from your reading list: a line such as "my reading list, tag: dense" (or a project, or a status: "my reading list, to read"). **Make a literature matrix** on the Reading list fills it in with the papers you picked.
- **The columns**: one a line; **Task**, **Data**, **Method**, **Metrics**, **Results** and **Limits** until you change them.
- **Project**: the project of yours its spreadsheet goes in. A line "my reading list" with nothing after it then takes that project's papers.

It reads three papers at a time (the whole paper from an open copy, or its abstract when there is none), has a quick model fill in each row, writes what the papers say together, and keeps the matrix as a spreadsheet in your [Library](/guide/library#spreadsheets), with a second sheet that lists the papers. Its view has **The matrix** (how many it read, **Open in the Library**, **Copy as a table**, the matrix itself, the papers it could not read and why, and **Another column**: name one, and **Make it again with it** runs it again with that column too), **Papers** (each with what it does in a sentence, and what it was read from) and **Across the papers** (where they agree and disagree and what is still open, with **Copy it**).

### Reproduce a paper

[Reproduce a paper](/apps/t/reproduce-paper) runs a paper's own code to see whether its numbers hold: it finds the code, builds its environment, gets its data and checkpoints, runs its evaluation, compares the numbers with the paper's table, and says what it took.

- **The paper** (or **Or upload it**), **Its code** (a link or a folder on this computer; left empty, it is looked for), **What to reproduce**, as the paper names it ("Table 2, the BM25 + monoT5 row on MS MARCO dev"), **Limits** (the time, disk and GPUs it may use: "At most 4 hours, 100 GB of disk and 1 GPU" until you change it) and **Where to work** (a folder; a new one for each run when empty).

It reads the paper and looks in it for its code; when the paper names none, it searches GitHub and the web side by side and picks the likeliest repository. A quick model works out the exact setting (the data and split, the model and checkpoint, the settings) and the numbers to match, as printed. Then an agent does the work the way the **reproduce-paper** skill says: a clean environment as the repository says (venv, conda or Docker), the data and checkpoints, a run on a small slice first, then the real run, with every change it makes written down and why, and a report, `REPRODUCTION.md`, in the work folder. A real run that needs a GPU or hours goes to [Experiments](/guide/experiments), which waits for free GPUs and keeps the run's record and log: the app waits for its runs to end without keeping a session busy, then an agent reads their numbers and finishes the report. Last, each number goes beside the paper's: within half a point on a 0–100 scale (0.005 on a 0–1 scale) counts as reproduced.

Its view has **Did it reproduce?** (the verdict, how many numbers came close, the hours it took and the fixes it made, its repository, **Open the folder**, its runs in Experiments, and **Try again** when it did not reproduce; then the paper's numbers beside ours with the difference, the close ones in green, and the setting as the paper gives it), **What it took** (each step with its minutes, and every change and fix) and **Report** (with **Copy the report**).

It runs code on this computer and can take hours: it keeps within your limits, and when one would be passed it stops and reports what it has. Code it cannot get, or data that is not public, it says plainly.

<!-- end: read -->

## Check a paper before you submit

<!-- Workstream C: the pre-submission check (references, anonymity, format, required parts, numbers that match the runs), the arXiv package and camera-ready. -->

<!-- end: check -->

## Review, answer and present your paper

Four ready-made apps, under **Writing** on [the Apps page](/apps), help with your own paper: the **Reviewer simulator** reviews your draft as a venue's reviewers would, the **Rebuttal workbench** drafts your answer to the reviews you got, **Paper to talk, poster and thread** makes what you present it with, and the **Figure doctor** makes its plots fit for print. The first three read your paper from a PDF, a .tex file or a LaTeX project's folder on this computer, a link, or a LaTeX document of your Library (paste its address); **Or upload it** takes a PDF instead.

### Reviewer simulator

[The Reviewer simulator](/apps/t/reviewer-simulator) reviews your draft before the real reviewers do, on the venue's own review form and scores, and lists what they are likely to ask for, the most dangerous first.

- **Your paper**, **The venue** (**ACL Rolling Review**, **SIGIR**, **NeurIPS**, **ICLR**, **ICML**, **KDD**, **CIKM**, **WSDM**, **TheWebConf**, **A journal** or **Other**, each with its form as of 2025), **How many reviewers** (1 to 5; 3 unless you change it) and **Anything to focus on**.

It seats the reviewers, each with an angle of their own (in order: the method's expert, the area's expert, a sceptical empiricist, a careful reader from a neighbouring field and a reproducibility reviewer), and each fills in the venue's form, side by side. Then an area chair writes the meta-review with the likely outcome, and the weaknesses are ranked by how likely each is to sink the paper. The reviews come from a model: they find weak spots before real reviewers do, and are no forecast of the decision.

Its view has **The reviews** (the venue, the likely outcome, the average overall score, then each review: its reviewer and angle, scores, summary, strengths, weaknesses and questions), **Meta-review** (with **Copy it** and **Copy every review**; then **What could sink it, the most dangerous first**: each weakness with why, how likely and what fixes it), **Baselines and ablations** (what reviewers will ask for, why, and the work it takes) and **Before you submit** (a list to tick off, and **Answer these reviews**, which starts the Rebuttal workbench with them, to rehearse your rebuttal).

### Rebuttal workbench

[The Rebuttal workbench](/apps/t/rebuttal-workbench) drafts your answer to the reviews you got, point by point, within the venue's limit.

- **The reviews** (paste them all, each under its reviewer: "Reviewer 1", "R2", OpenReview's "Reviewer xYz1"…), **Your paper** (or **Or upload it**; optional, for the replies to point at its sections), **The limit** (as the venue sets it: characters or words, per reviewer, per point or in all; "2,500 characters per reviewer" unless you change it) and **Tone** (**Courteous and firm**, **Warm and grateful** or **Brief and to the point**).

It splits the reviews by reviewer, pulls out each one's points side by side, merges the same point raised by several reviewers, and sorts them: misread (your paper answers it already), needs an experiment, needs words (a clarification, a justification, a citation), or minor. It finds what your paper says on each, drafts each reply within its share of the limit, and puts the rebuttal together, counted against the limit. A reply that needs a new result leaves [placeholders] for you to fill in: it never makes results up.

Its view has **Points** (the rebuttal in a line; **All points**, **Misread**, **Need an experiment**, **Need words** and **Minor** show one kind; each point with who raised it, in their words, its draft reply, its length against its share, and **Copy**), **To do** (the experiments to run and the changes to make in the paper, to tick off) and **Whole rebuttal** (each reviewer's reply against the limit, and **Copy the whole rebuttal**).

### Paper to talk, poster and thread

[Paper to talk, poster and thread](/apps/t/paper-to-talk) makes what you present your paper with: slides with its real figures and equations, timed, with what to say; an A0 poster; posts for X, Bluesky and LinkedIn; and a project page.

- **Your paper** (its LaTeX project's folder is best, for its figures; from arXiv, its source is fetched for them), **The talk's length, in minutes** (15 unless you change it), **Audience** (**Researchers in the field**, **Researchers in other fields** or **A general audience**), what to make (**Slides**, **An A0 poster**, **A thread (X, Bluesky, LinkedIn)** and **A project page**) and **Project** (the project of yours what it makes goes in).

It plans the talk (about a slide a minute, one idea each, from the problem to the take-away), a program shares out the minutes so they add up to the length, and then it makes what you asked for side by side: the slides, which you edit and present in the Library ([Slides](/guide/library#slides)), the poster as a LaTeX document ([LaTeX documents](/guide/library#latex-documents)), the posts, and the project page, ready for you to publish ([Publish a page](/guide/library#publish-a-page)).

Its view has **What was made** (the talk's message and an opening line, then each thing made, with **Open it**), **The talk** (the talk as one strip, each slide as wide as its minutes, then each slide: its minutes, title, points, figure, equation and what to say) and **Thread** (**X**, **Bluesky** and **LinkedIn** show each one's posts, numbered, each with **Copy**, and **Copy the thread**; LinkedIn's one post has **Copy the post**).

### Figure doctor

[The Figure doctor](/apps/t/figure-doctor) makes your paper's plots fit for print: as wide as the column, in the paper's font, in colours colour-blind readers can tell apart, saved as vector PDFs with their fonts embedded, all with one style file.

- **Your plotting code** (a script, a notebook or a folder of them on this computer, made with matplotlib or seaborn), **The venue's template** (**ACL, EMNLP, NAACL**, **ACM (SIGIR, KDD, CIKM, WSDM, TheWebConf)**, **IEEE**, **ICML**, **NeurIPS, ICLR**, **Springer LNCS** or **Other (give the width)**), **Width** (**One column** or **Both columns**), **Or the width in inches** (for another template) and **The paper's font** (**As the template**, **Times**, **Computer Modern**, **Linux Libertine** or **Helvetica**).

A program works out the style (the width in inches, the font and its sizes, a palette for colour-blind readers), and an agent changes your scripts where they are, after copying each one beside itself (name.orig.py) and keeping a picture of each figure as it was. Every script then uses one style file, `paper.mplstyle`, beside them; each figure is saved as a vector PDF, and its fonts are checked: all embedded, none of Type 3, which many venues refuse. It runs your scripts, so it needs what they need on this computer (Python, matplotlib and their data).

Its view has **Before and after** (the size, font and colours it used, then each figure as it was and as it is now, with **Open the PDF** and what changed), **Style file** (`paper.mplstyle`, with **Copy it** and how to use it) and **What changed** (every change, and what the fonts check found).

Agents in your sessions know these crafts too, from skills that come with Hydor (**peer-review**, **reproduce-paper** and **figures-for-papers**: see [Skills](/guide/skills)): ask one to review a paper with you, answer one reviewer, or fix a single figure, and it works the same way.

<!-- end: present -->

## Run your lab's work

<!-- Workstream D: Annotation workbench, Research sprint, Sweep planner. -->

<!-- end: lab -->

## Reports: your week and your lab notebook

<!-- Workstream D: Weekly progress report, Lab notebook. -->

<!-- end: reports -->

## Ask an agent

<!-- B1's examples -->

<!-- end: ask-b1 -->

- "Add 2104.08663 and the ColBERT paper to my reading list, in the project Dense retrieval."
- "Import ~/papers/refs.bib into my reading list, tagged survey."
- "Sync my reading list with Zotero."
- "Which papers in my reading list are still to read for the Dense retrieval project?"
- "Make a literature matrix of the papers tagged dense in my reading list, with a column for whether their code is released."
- "Reproduce Table 2 of the BEIR paper, BM25 on SciFact, in at most an hour and without a GPU."
- "Open Reproduce a paper filled in for 2104.08663, but don't run it yet."
- "Review my draft in ~/papers/draft as three SIGIR reviewers would, and tell me what could sink it."
- "Here are my ARR reviews: draft a rebuttal of at most 2,500 characters per reviewer."
- "Make a 12-minute talk, an A0 poster and a thread from my paper in ~/papers/colbert, in the project ColBERT."
- "Fix the plots in ~/papers/colbert/plots for an ACL paper, one column wide, in Times."

<!-- end: ask-b2 -->

<!-- C's examples -->

<!-- end: ask-c -->

<!-- D's examples -->
