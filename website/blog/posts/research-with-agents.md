---
title: Let agents run the experiments. Keep the score yourself.
description: Agents can run a hundred experiments while you sleep. The hard part is believing the result in the morning. How Hydor keeps one sealed score, checks what is new, has results tested before they count, and remembers the dead ends.
date: 2026-11-27
tags: Research, Experiments, Evaluations
cover: /img/blog/research-with-agents/cover.webp
coverAlt: Rows of small turquoise lights, one for each run, ripple away across dark water toward the horizon, while in the foreground a single dark sealed square with a thin ring of light around it lies perfectly still.
og: /img/blog/research-with-agents/og.jpg
order: 1
---

You start a hundred runs before bed. In the morning there are a hundred numbers, and one of them is lovely. Which result is real?

The question is pressing because running experiments has become cheap: what took a day of your attention can now take a prompt. Systems that run the whole loop already exist: [The AI Scientist](https://arxiv.org/abs/2408.06292) comes up with ideas, writes the code, runs the experiments and writes the paper, at a reported cost of under $15 a paper.

Believing the numbers has not got cheaper. METR [reports](https://metr.org/blog/2025-06-05-recent-reward-hacking/) that recent frontier models, on its tasks, try to get "impossibly high scores" by "exploiting bugs in our scoring code or subverting the task setup". On one task, o3 eventually did it in every run METR generated. It was far more common on one of METR's sets of tasks than on another, perhaps, METR writes, because there the model could see the whole scoring function. And [BenchJack](https://arxiv.org/abs/2605.12673), a red-teaming system for benchmarks, found exploits that reached near-perfect scores on most of ten popular agent benchmarks without solving a single task.

The pattern is the one in [Goals and swarms](/blog/goals-and-swarms): an agent that does the work and also judges it will find every weakness in the judge. So Hydor automates the doing and keeps the judging outside the agent. The score, the baseline, the final test and the statement of a theorem are yours. The rest of this post follows one made-up project through the tools that make that work: a dense retriever, scored by nDCG@10 on dev queries, and one question in mathematics.

## One way of keeping score, sealed

An **evaluation** is how a project keeps score: one command and the number that counts. You make one in **Experiments → ⋯ → New evaluation**, or ask an agent to set one up. You give the command (`python eval.py --split dev --seed {seed}`), the number it prints (`ndcg@10`), which way is better, and the files that must not change: the scorer and the data it scores against.

Hydor seals those files by their content, and from then on works out every score itself, by running the sealed command once for each seed (1, 2 and 3 unless you say otherwise). An agent that asks for a score reports the app's number, not its own.

<!-- figure: seal -->

If a sealed file differs, there is no score until it is back. An amber notice names the file, and gives you three ways out:

- **See what changed** shows each file marked Changed, Missing or New file, and what changed in it.
- **Put them back** writes the sealed copies over them.
- **Seal again…** accepts the files as they are now. Earlier scores are no longer compared with new ones, and the baseline has to be measured again.

The page also says how a score stands to the baseline, in words: better, worse, or "The same as the baseline, within the noise" when the difference could easily be chance, and how often chance alone would give such a difference.

![The evaluation's page in Hydor: the number that counts (ndcg@10, higher is better), three seeds, the sealed files, the Baseline, Latest score and Final test tiles, a chart of the scores with the baseline dashed, and the scores one by one.](/img/blog/research-with-agents/evaluation.webp "The evaluation of the retriever, from the demo copy of the app (made-up data): the sealed files, the Baseline, the Latest score and its place beside it, and every score so far.")

Two parts of the page are yours alone. The **Baseline** is the score the others are compared with, and only you measure it. The **Final test** is optional: its own command, and a **Held-out folder** outside the project that only the final test gets, so agents working in the project do not see it there. Each look at it tells you a little less, so the page counts how often it has run.

Agents can read evaluations, ask for a score, propose a new evaluation, which you see on a card and which is made only if you say yes, and put sealed files back. They cannot create or seal one, set the baseline, or run or read the final test.

## Is it new, and was it tried before?

Two questions waste research time: has someone already done this, and have we already tried it?

For the first, ask any agent **Is this new?** It writes several searches that would find the idea under other names, searches arXiv, OpenAlex and Semantic Scholar, and has a model compare the nearest papers with it. The answer is **Already known**, **Partly known**, **Looks new** or **Not judged**, with the closest papers as links, what each shares with the idea and what differs. It takes up to two minutes. Agents use it before they pursue an idea or call a result new.

<!-- figure: known -->

The two papers in the figure are the place to start reading. [ANCE](https://arxiv.org/abs/2007.00808), from 2020, builds negatives from an index of the corpus that is updated as the model trains. [RankGPT](https://aclanthology.org/2023.emnlp-main.923/), from 2023, proposes a sliding window so that a language model can rank more passages than fit in its context. The third came back **Looks new**, and the card reminds you that finding nothing is not proof.

For the second, a project keeps **Findings**. A finding is one thing the project tried and what came of it: a statement, a verdict (**Supported**, **Refuted**, **Unclear** or **Open**), what was learned, and the evidence as links to runs, scores, results tables, commits, files, papers or sessions. A measured number needs the run, score or table it came from, or the finding is refused. Agents look at a project's findings before they propose or start an experiment, and record one after each result, also when it did not work.

Dead ends are kept on purpose: the tidy-up never merges, sums up or removes a finding, and a later result replaces an earlier one but leaves it in the history. When a file given as evidence has changed since, the finding says so.

![A project's Memory tab on its Findings chip: five findings of the retriever project with their verdicts, and the supported one open, with what was learned and its evidence as links.](/img/blog/research-with-agents/findings.webp "The retriever project's findings, from the demo copy (made-up data). The top one is Open: a paper has done it, so the question is whether it pays at this size.")

## Experiments that run while you are away

A run in **Experiments** waits for a GPU with enough free memory on one of your machines (or its turn in a cluster's queue), runs on its own, and is kept as a record: the commit and branch, a patch of what was not committed, its hyperparameters and seed, the environment, its log and its metrics. On this computer, the scripts and small files its command names that Git does not track are copied into its folder, and its record says "Not in git, kept with the run". So you can run it again later, and say what produced the number.

Before a long run, **Try it first** in **New run** runs the command for a minute and a half and tells you whether it starts, how much memory it used and about how long the whole run should take.

![The runs of one experiment, three seeds of the retriever trained with hard negatives, with their status, hyperparameters and metrics in a table.](/img/blog/research-with-agents/runs.webp "One experiment's runs in the demo copy (made-up data): three seeds, each kept with its code, settings, log and metrics.")

A sweep is one command with a `{name}` for each hyperparameter, run for every combination or a random sample, with the runs that will not win stopped early. When runs end, an agent that asked to be told gets one message, in which runs that differ only in their seed are one line with the mean and spread. A results table tests each row against the baseline and marks it better, worse, or the same within the noise.

If your GPUs are also for your own work by day, send what can wait to the night. In **New run**, set **Start** to **Tonight**.

![New run with Start set to Tonight, and the night's hours beside it.](/img/blog/research-with-agents/new-run-tonight.webp "New run, with Tonight picked. The hours are the app's own: 23:00 to 07:00 until you change them.")

A night run starts only in the night hours of the computer it runs on, and only when none of your other runs waits there for the same thing: yours always go first. Until then it says **Waits for the night (from 23:00)**. The hours are 23:00 to 07:00 to start with, in your own time zone, and **Where runs go** changes them. When the night ends, running ones can finish or be stopped and started again the next night. In the morning there is one notice, such as "Last night: 5 runs done, 1 failed, 2 still wait for tonight", which opens that night's runs. Agents send exploratory runs there too, and their approval card says when a run will start.

<!-- figure: night -->

## Before a result counts, someone tries to break it

A gain that came out of a hundred runs deserves suspicion. Where you compare runs (tick them, then **Compare**), **Try to break it** is at the bottom of the window.

It starts an agent that did none of the work. You check **The result to test**, a sentence filled in from the runs you picked, choose the **Baseline** and who runs it (**Run by**), and press **Start**. The agent looks for other explanations of the gain: lucky seeds, an untuned baseline, a leak, a metric bug. It runs controls in an experiment of their own, on a copy of your code, asking before it uses much GPU time, and repairs nothing. Then it reports **It holds**, **It holds in part** or **It does not hold**, with what it tried, and the verdict goes into the project's findings.

In our example the new recipe gained +0.019 nDCG@10, and the obvious suspect is the baseline, never tuned the way the new recipe was. A control that tunes it the same way is what the agent runs.

<!-- figure: break -->

## Searches that work to the score

Some work is a search: a reranking function, a prompt, a slow routine, anything whose quality the evaluation can measure. Two tools use the evaluation for that.

A [goal](/docs/goals) can have a **Score** as one of its checks: done when the project's evaluation beats its baseline by at least a gain you agree ("better than the baseline by at least 0.02"; 0 means any gain beyond the noise of the seeds). The score never runs before you press **Start**, since its runs may take a GPU, and a gain within the noise of the seeds does not hold ("0.431 against 0.412: within the noise of 3 seeds"). The files the evaluation seals join the paths the agent may not change, and the goal never runs the final test: if the evaluation has one, the report of a reached goal links to the evaluation's page, where you may run it.

A goal's rounds can also be read as a **Map**: **Start**, the kept rounds joined as one line, and each undone round hanging below the one it started from, with the best line marked.

**Evolve…**, in the evaluation page's ⋯ menu, tries many small changes to the files you name, scores each with the evaluation, and keeps the best. Your own files are not touched: every try runs in a copy made from your last commit, and a change to a file the evaluation protects is refused. It asks the app's helper model to write each change. A try gets a quick score on one seed first, and only one that beats its line of work's best is checked with all the seeds. Only that full score can make it the best.

![An evolution's page: the start, the best so far and what it changed, the number of tries, a chart of every try with the best so far as a stepped line and the start dashed, and the list of what it tried.](/img/blog/research-with-agents/evolution.webp "A finished evolution of the retriever's reranking function, in the demo copy (made-up data): the chart and the list of what each try changed.")

<!-- figure: evolve -->

When it is done, **Take the best** makes a branch in your repository with that version and leaves the files you have checked out alone. It stops at the number of tries you set (50, 100, 200 or your own), at its hours, or when 40 in a row (unless you change that) bring nothing better. Started with **Tonight**, it works only in your night hours, over as many nights as it needs.

A search finds the weak spots of whatever scores it, which is why the evaluation can hold a final test on data the search never sees. It has not seen the version you took either: switch your folder to the branch and run it there.

## Mathematics: explore first, then prove what was agreed

A guess in mathematics deserves a cheap look before anyone spends a week proving it. **Tools → Explore a conjecture…** in the LaTeX editor, or a request in any session, has an agent say the statement exactly, look for a counterexample first (the edge cases, then a computer search over a stated range, in exact arithmetic), and compute the small cases. It ends with one of three answers: false, with a counterexample; known, with where; or open as far as it can tell, with the range it holds for. Small cases never prove anything, and it says so.

Euler's polynomial is the classic trap. *n*² + *n* + 41 is prime for *n* = 0, 1, 2, and keeps being prime for a long time.

<!-- figure: conjecture -->

When the guess is about a sequence of whole numbers, the agent looks it up in the [OEIS](https://oeis.org). What it looks up is sent to oeis.org, and a match on a few terms is only a lead: when we looked, the first seven Catalan numbers, 1, 1, 2, 5, 14, 42, 132, matched 37 entries, and one of those goes on with 428 where the Catalan numbers have 429. None of this needs Lean.

To prove what survives there is [Lean](https://lean-lang.org), a proof checker that accepts a proof only if every step follows. Agents write proofs in words that read well and are wrong; with Lean they can check them. You set it up once, in **Settings → General → Lean (proof checker)**.

The risk moves to the statement. A statement written in Lean can differ from what you meant: a whole number where you meant a real one, "less than" for "at most", an assumption that can never hold. So before proving anything, the agent writes the statement in Lean, says it back to you in plain mathematics from the Lean text alone, lists how it differs from what you asked, and waits for **It says what I mean** or **Not quite**.

The verdict is then proved, or proved except for named gaps. Proved means the file builds with no error, nothing is left out (Lean marks a proof left out with `sorry`), each theorem rests only on Lean's three standard assumptions, and Lean's core checker accepts every step. It comes with a **pin**: twelve letters and digits worked out from the statement. The pin stays the same however the proof is written, and changes when the statement does, or when a definition of your own that it rests on says something else. The agent checks the proof against the pin you agreed, so a statement weakened afterwards fails, even though it is proved. As a goal's check, that is a command:

```bash
leancheck Proofs/Main.lean --theorem main_theorem@3fa2c1d9ab12
```

For a proof written in words, **Tools → Check a proof…** has the agent beside the editor go through it step by step and report it gap by gap, with line numbers: whether it holds as written, holds once the gaps are filled, or fails. That needs no Lean.

## The morning

All of this could leave you with more places to look: Experiments for the runs, Memory for the findings, each session for its questions. So a project with research in it has a **Research** tab that reads like a morning brief, top to bottom.

![The Research tab of the retriever project: three cards under Waiting for you, the news of the last seven days with runs that ended and findings marked Open, Supported and Refuted, and Where it stands, a chart of the scores whose best so far climbs in steps, beside Running and waiting.](/img/blog/research-with-agents/research-tab.webp "The Research tab of the retriever project, in the demo copy of the app (made-up data).")

**Waiting for you** comes first: the decisions only you can make, each with its buttons. A question an agent asked, a baseline to measure, sealed files that differ, a goal that reached its score and asks whether to run the final test, a search the app paused. **Since you last looked** is the news: the findings recorded, the runs that ended, with several that failed the same way told as one line, and how far each search got. **Where it stands** draws every score against the baseline with the best so far as a stepped line, so one look says whether the week moved the number. **Running and waiting** says what is at work and about when the rest will start.

### What stays yours

Hydor leaves a short list to you. You measure the **Baseline**. You run the **Final test**, when you think you are done, because each look tells you a little less. You decide when sealed files are accepted again with **Seal again…**. You agree the statement of a theorem with **It says what I mean**. You say yes to an evaluation an agent proposes, and to an evolution it wants to start. And taking a result onto a branch is a button you press: **Take the best** asks first, makes the branch, and leaves your checked-out files alone.

<!-- figure: phone -->

## What it does not do

- **The check for earlier work can miss papers.** Finding nothing is not proof that an idea is new, and when nothing could be compared, it says **Not judged** rather than guess. It searches three services, so a confidential session does not have it.
- **Lean checks only what was formalised and agreed.** The verdict cannot say whether the statement is the one you meant: that is what you agree. A newer Lean or Mathlib may read the same text a little differently and give another pin.
- **A sealed score is only as good as the scorer you sealed.** When the evaluation is weak (few examples, a number that is easy to game), a search finds its weak spots: set a final test on data it never sees.
- **It runs on your own computers.** Runs go to this computer, to other machines you have connected, or to a cluster you reach over SSH (SLURM or plain). A night run cannot go to a cluster, which has its own queue, and **Try to break it** leaves out runs on other machines.

## Try it

[Download Hydor](/#download) for Mac, Windows or Linux, then:

1. Give a project one way of keeping score. Open **Experiments → ⋯ → New evaluation**, or ask an agent: "Set up an evaluation for this project: score eval.py on the dev split and seal it." Then press **Measure the baseline**.
2. Ask for an experiment: "Run these three ideas as an experiment tonight, and tell me in the morning what they showed."
3. Pick the runs that look best, press **Compare**, and use **Try to break it**.

The [Experiments guide](/docs/experiments) covers evaluations, Evolve, the night and results tables, the [research guide](/docs/researchers) covers Lean and exploring a conjecture, and [Findings](/docs/memory#findings-what-was-tried-and-what-came-of-it) says how a project remembers.

## Sources

1. [The AI Scientist: Towards Fully Automated Open-Ended Scientific Discovery](https://arxiv.org/abs/2408.06292), Lu et al., arXiv, 2024.
2. [Recent Frontier Models Are Reward Hacking](https://metr.org/blog/2025-06-05-recent-reward-hacking/), METR, 5 June 2025.
3. [Do Androids Dream of Breaking the Game? Systematically Auditing AI Agent Benchmarks with BenchJack](https://arxiv.org/abs/2605.12673), arXiv, May 2026.
4. [Approximate Nearest Neighbor Negative Contrastive Learning for Dense Text Retrieval](https://arxiv.org/abs/2007.00808), Xiong et al., arXiv, 2020.
5. [Is ChatGPT Good at Search? Investigating Large Language Models as Re-Ranking Agents](https://aclanthology.org/2023.emnlp-main.923/), Sun et al., EMNLP 2023.
