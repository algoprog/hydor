# Research: papers, writing and the lab

<!-- Lead: the intro paragraph and the picture line (images/researchers.webp). -->

## Keep up with your field

Six ready-made apps keep you up with your field: they are on the Apps page under **Research** (open [Apps](/apps) and pick the **Research** chip). Five of them open on a page of their own and can update by themselves every day: **Paper radar**, **Citation alerts**, **New-model watch**, **Deadline radar** and **Living related work**. The sixth, **Gap finder**, runs when you ask, with a form, and agents can run it for you in any session.

They read open services, gently: arXiv, OpenAlex, Semantic Scholar, Hugging Face, and the deadline lists ccfddl and ai-deadlines on GitHub. None needs a key, but two help: an **OpenAlex API key** (free: without it OpenAlex is asked at most twice an update, from a small budget everyone on your network shares) and a **Semantic Scholar API key** (free on request: without it Semantic Scholar is often busy, and OpenAlex answers instead, without the sentences that cite you). Give them in the app's settings, the sliders at the top of its page, under **Keys it needs**: they go to your vault, and only to those services.

On an app's own page, **Update** at the top makes a new one now, and the sliders hold its settings: **Update every day** (off until you turn it on), the time, and its questions. Under the page, **Earlier** lists the ones before, each opening as it was. Before the first one, the page asks only what the app cannot do without (your name as an author, your venues); **Make the first one** keeps your answers as its settings. Once it updates every day, Settings → Scheduled tasks lists it too (see [Scheduled tasks](/guide/tasks)).

### Paper radar

[Paper radar](/apps/t/paper-radar) brings you each morning the new papers of your field, ranked against what you work on, each with a line on what it does and why it matters to you.

- **What it reads**: arXiv's new papers in the categories you follow (a few hundred at most, sent in the last three days, more after a gap), those on your topics from any field, and those of the people you follow; OpenAlex's on your topics too (journals and proceedings). A paper an earlier update looked at never comes again.
- **How it ranks**: against your projects (their names, descriptions and latest sessions), your topics and your profile. By meaning with the embedding model on your computer when [Search by meaning](/settings?s=memory&find=Search%20by%20meaning) is on, else by their words. The papers you save pull the ranking toward them; those you put aside push it away. Papers by people you follow always come first.
- **The page**: **Today**, the day's papers under the project or topic each fits best (pick one at the top, or **All**). Each card has where and when it came out, its title (a link to it), its authors, what it does in a sentence and why it is for you, with **☆ Save**, **Cite** (copies its BibTeX), **PDF**, **Dig deeper** (a [Deep research report](/apps/t/deep-research) on it, of a few minutes) and **Not for me** (it folds away, with **Undo**). **Saved** lists what you saved, newest first, with **Copy all as BibTeX**, and for each **Cite**, **Add to Reading list**, **Dig deeper** and **Take it out**.
- **Its settings**: **Fields to follow** (arXiv's categories, by name or code: Information Retrieval or cs.IR, Computation and Language or cs.CL; a field that is no category is taken as a topic), **Topics** (one a line), **People to follow** (one a line, as their papers print their names) and **How many papers** (15 unless you change it, between 5 and 40). Left empty, it works out fields and topics from your profile and projects.

An update asks the helper model one or two quick questions (what each paper means for you) and takes a minute or two.

### Citation alerts

[Citation alerts](/apps/t/citation-alerts) tells you who cited your papers since it last looked, with the sentence that cites you and whether it builds on, compares with or disputes your work.

- **The page**: **New**, the new citations by your paper: how each cites you (**builds on**, **compares with**, **disputes** or **mentions**, picked from the sentence by the helper model; show one kind at the top), the sentence with your paper's mention marked, a word on what it says of your work, and the citing paper (a link), its authors, where and when, with **Copy the sentence**. **Your papers** lists your papers with their citations and how many are new.
- **How it finds them**: it finds you on Semantic Scholar (or OpenAlex when it is busy), takes your papers that have citations (the most cited and the latest, thirty an update), and asks who cited each lately. The citations it has seen are kept, so each update shows only what is new; the first time, only last month's count as new. A citing paper with no sentence is one the service has not read in full.
- **Its settings**: **You, as an author** (your name as your papers print it, or your Semantic Scholar id, digits, or OpenAlex id, A and digits) and **Only these papers** (titles, DOIs or arXiv ids, one a line; empty: all of yours). Once a week is often enough for most people: turn on **Update every day**, or ask an agent to make it weekly.

### New-model watch

[New-model watch](/apps/t/new-model-watch) watches Hugging Face for new models of a kind (rerankers, embedders and others), checks them against your limits, and runs your own evaluation on each, so you hear only of those that beat your best.

- **What it looks at**: the newest models of the kind (with the words you give in their names), once they are as old as you said (7 days unless you change it) and have enough downloads by then; the eight most downloaded an update (the rest wait for the next). Copies of a model in another format (GGUF, ONNX, quantized) are left out unless your words ask for them. It reads each one's page and model card for its licence, its size and what it is, and leaves out those your licences or size rule out.
- **Your evaluation**: give a command with `{model}` where the model's name goes (`python eval.py --model {model}`), its folder, the score it prints (`ndcg@10`), whether higher or lower is better, and your best so far. Each new model worth trying then runs in [Experiments](/system/experiments) (group "New-model watch", a GPU each, in its queue), which tells you when one does better than your best; the next update reads each run's score. Without a command it only lists the new models.
- **The page**: **Models**, each with where it stands (**new**, **evaluating**, **done**, **beats** your best, **not run**, **skipped**, **too new**), what its card says, its size, licence, downloads and likes, and its score; those that beat your best come first. **Your evaluation** says what runs, with **Open Experiments**.

### Deadline radar

[Deadline radar](/apps/t/deadline-radar) puts your venues' deadlines on one timeline in your time zone, reminds you before each, and links the call for papers, its page limit and its template.

- **Where the dates come from**: two open lists on GitHub, ccfddl's and ai-deadlines', joined. Each deadline is turned from the time zone its call gives (most say AoE, Anywhere on Earth, which is UTC−12) into yours, which the app takes from your browser.
- **The page**: **Timeline**, each deadline ahead with its day and time where you are, what is due, as the call gives it, where the conference is, **Call for papers** and **Template** links and its page limit, and how long is left (as you look); the next abstract or paper deadline of each venue stands out. Show one venue at the top; **Copy the deadlines** copies them as lines; **Show the past ones** unfolds those of the last few months. **Venues** shows each venue in full, its rank, its next deadline and its site, and the names neither list knows.
- **Reminders**: each update sends you a notification for the deadlines at the days you gave (14, 3 and 1 unless you change them), each reminder once, all of them in one notification. Turn on **Update every day** so they come in time.
- **Its settings**: **Your venues** (as you say them, between commas: SIGIR, ACL, EMNLP, NeurIPS, The Web Conference, KDD…) and **Remind me** (days before, between commas; empty: no reminders). To find each call's page limit and template, it searches for the call once per conference and reads it (the helper model notes them).

### Living related work

[Living related work](/apps/t/living-related-work) keeps a page for each of your topics that grows as papers appear: each paper summed up, said how it relates, grouped into themes, the new ones marked.

- **How it grows**: the first time, it takes arXiv's best papers on each topic and its latest of the past year, and OpenAlex's most cited; after that, what came out since. The papers citing your seed papers come in for every topic. The helper model keeps those a related-work section should cite, sums each up in a sentence, says how it relates (to the topic and your seeds) and puts it in a theme.
- **The page**: **Related work**, each topic with its papers theme by theme, newest first, those the latest update added marked **New** (pick one topic at the top). Each paper has its cite key, **BibTeX** (copies its entry) and **Not related** (it leaves the topic for good). **Draft the related work** has an agent write the topic's section in LaTeX, a paragraph a theme, with `\cite` keys from your papers: it shows with **Copy the LaTeX** and **Copy the .bib** when it is done (a few minutes; it goes on if you leave). **Export BibTeX** gathers all the topic's entries to copy. **New this time** lists what the latest update added.
- **Its settings**: **Topics** (one a line), **Seed papers** (titles, arXiv ids or DOIs, one a line) and **Most papers a topic** (80 unless you change it).

### Gap finder

[Gap finder](/apps/t/gap-finder) crosses your papers with this month's in an area for project ideas, checks each for prior work and sizes it to the compute you have. It runs from its form, or an agent runs it for you in a session.

- **What you give**: **Your papers** (your name as an author, which brings your latest and most cited papers, or their titles or arXiv ids, one a line), **The area** (in words, or an arXiv category: conversational search, cs.IR), **The compute you have** (one 24 GB GPU unless you say) and **How many ideas** (5).
- **What it does**: it reads your papers and the past month's in the area, ranks the month's against yours, and has the helper model propose ideas that cross them. For each idea it searches arXiv and Semantic Scholar for prior work and has the helper model judge it: **new**, **partly done** or **done**, with the closest paper; the first experiment to run, what it takes on your compute, and whether it **fits**, is **tight** or is **too big**.
- **The view**: **Ideas**, new ones first (show one verdict at the top), each with what it crosses, why its verdict, the closest work (a link), the first experiment and its cost, and **Plan it** (opens the Research sprint app with the idea as its question), **Dig deeper** (a deep research report on the work near it) and **Copy**. **What it crossed** lists your papers and the month's it used.

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

<!-- Workstream D: Annotation workbench, Research sprint, Sweep planner. -->

<!-- end: lab -->

## Reports: your week and your lab notebook

<!-- Workstream D: Weekly progress report, Lab notebook. -->

<!-- end: reports -->

## Ask an agent

- "Set up Paper radar to follow cs.IR and cs.CL, with dense retrieval and query performance prediction as topics, and have it update every day at 7:30."
- "What did Paper radar find for me today? Which papers touch my Hydor project?"
- "Turn on Citation alerts for my papers (I publish as Chris Samarinas) and tell me who cited ProCIS lately."
- "Add SIGIR, ACL and EMNLP to Deadline radar and remind me 21, 7 and 2 days before each deadline."
- "Watch Hugging Face for new rerankers under 1B parameters with an Apache or MIT licence, and run my evaluation on each: python eval.py --model {model} in ~/rerank-eval, ndcg@10, my best is 0.512."
- "Start a living related work on learned sparse retrieval, seeded with SPLADE and ColBERT, and draft its related-work section."
- "Find gaps between my papers and this month's work on conversational search; I have one 24 GB GPU."

<!-- end: ask-b1 -->

<!-- B2's examples -->

<!-- end: ask-b2 -->

<!-- C's examples -->

<!-- end: ask-c -->

<!-- D's examples -->
