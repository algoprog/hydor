---
name: peer-review
description: Use when reviewing a paper (your own draft before submitting, or one assigned to you) on a venue's review form, or answering reviews (a rebuttal, an author response, a response to reviewers for a journal).
category: research
triggers: [peer review, review this paper, review my paper, review my draft, reviewer comments, reviews of my paper, rebuttal, author response, response to reviewers, meta-review, area chair, review form, openreview]
---

# Reviewing papers, and answering reviews

A review judges whether the paper's claims hold and matter, on the venue's own form, and says
what would change the judgement. A rebuttal answers the points that decide the outcome, with
evidence, within the limit. Both are read by busy people: be specific, be fair, and put the
important things first. The venues' forms (fields, scores and what each end of a scale means) are
in `references/venues.md`.

## 1. Read it for its claims

- First what it claims: the contributions as the paper states them (often a list at the end of
  the introduction). Then, for each, the evidence it gives: a theorem, an experiment, a table.
- Read in this order: abstract, introduction, figures and tables, the experiments, then the method
  in detail and the related work. Note the page or section of everything you will mention.
- Judge the paper it is, not the one you would have written; and judge it against the venue (a
  short paper, a findings paper, a journal article each promise less or more).

## 2. The usual weaknesses

| Kind | What to look for |
| --- | --- |
| Baselines | The obvious strong baseline missing; baselines not tuned as well as the method; numbers copied from other papers under other settings; outdated baselines only |
| Ablations | Where the gain comes from: each component removed in turn; the effect of extra data or compute alone |
| Evaluation | One dataset; no significance tests or variance over seeds; the test set used to tune; data leaking between training and test; metrics that do not match the claim; cherry-picked examples |
| Novelty | A small change to known work presented as new; close prior work missed |
| Soundness | Claims beyond the evidence ("generalises" from one benchmark); proofs with gaps; wrong statistics |
| Clarity | Undefined terms, notation that changes, a method that cannot be followed |
| Reproducibility | Settings, code, data or checkpoints missing; compute not stated |
| Limits and ethics | No Limitations section where the venue asks for one; data with consent or licence problems; harms unmentioned |

In information retrieval add: the standard collections (MS MARCO, TREC DL, BEIR), BM25 tuned and a
recent neural ranker as baselines, efficiency (latency, index size) when the method costs more,
and significance tests (paired t-test or permutation, with a correction for many comparisons).

## 3. Write the review

- A summary in your own words: it shows you understood the paper, and the authors can correct a
  misreading.
- Strengths first, honestly. Then the weaknesses, numbered, the major ones apart from the minor
  ones, each with what would address it ("compare with ColBERTv2 on TREC DL 2019 and 2020").
- Questions whose answers could change your score; say which.
- Scores consistent with the text, on the form's own scale (`references/venues.md`), and a
  confidence that says how well you know the area and how carefully you checked.
- The tone of a colleague: about the paper, never the authors; no "obviously" or "trivially"; no
  demands for your own papers to be cited unless they are truly missing.

## 4. Reviewing your own draft

- Read it as several reviewers would: the method's expert (is the method sound and new?), the
  area's expert (the related work and baselines the field expects), a sceptical empiricist (are the
  experiments convincing?), a newcomer (can it be followed?), a reproducibility reviewer (could
  someone redo it?). The Reviewer simulator app does this on the venue's form.
- Rank what you find by how likely it is to sink the paper, and fix from the top: a missing
  baseline or ablation outweighs any amount of polish. Add what reviewers will ask for before they
  ask.

## 5. Answer reviews

- **Read all reviews first**, then group the points: the same concern from several reviewers is
  answered once, early ("R1 and R3 ask about…"). Answer the points that decide the outcome first:
  major concerns shared by reviewers, then the rest.
- **Sort each point**:
  - Misread: the paper already answers it. Point to where (section, page, table), quote a line if
    short, and offer to make it clearer. Never say the reviewer is wrong in so many words.
  - Needs an experiment: run it if the window allows, and report the numbers; otherwise say exactly
    what you will run and add. Never invent or round up results.
  - Needs words: give the clarification or justification, and say what you will add to the paper
    and where.
  - Minor: acknowledge in a line, together.
- **Concede where they are right**, and say what changes. Do not argue with a score or a tone.
- **Keep to the limit**: per review on OpenReview (ARR, ICLR, NeurIPS's 6,000 characters per
  review, with a one-page PDF of new results when allowed), or one response in all; words or
  characters as the venue counts them. Short replies are read; long ones are skimmed.
- **Keep anonymity**: no names, no links to your own repository or pages unless anonymised.
- **A journal's response to reviewers**: every comment quoted, each answered, with the changes
  marked in the revised manuscript (page and line).
- The Rebuttal workbench app groups and sorts the points, drafts each reply within its share of the
  limit and lists the experiments and changes to make; check every fact in its drafts against the
  paper.

## Pitfalls

- A review that only lists typos, or only gives a score.
- Weaknesses without what would fix them.
- A rebuttal that promises everything and shows nothing.
- Answering the easy points at length and the hard one in a line.
- New claims in the rebuttal that the paper cannot back.
