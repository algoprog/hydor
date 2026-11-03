# Literature matrix

A table with one row per paper and one column per thing you compare. It keeps the reading honest
(every paper answers the same questions) and makes the synthesis visible: where results agree, where
they do not, and why.

## Columns

| Column | What goes in it |
| --- | --- |
| Citation | Authors (first author et al.), year, short title, venue; the DOI or link |
| Status | Peer-reviewed journal, conference, preprint, report |
| Question | What the paper asks, in one line |
| Design | Randomised trial, cohort, case-control, survey, qualitative, benchmark study, simulation, review |
| Sample and setting | How many, who, where, when (for ML: datasets and their sizes) |
| Measures | Outcomes and how they were measured (for ML: metrics) |
| Comparison | Against what: placebo, usual care, baseline models, an earlier method |
| Main findings | The result with numbers: effect size and interval, or scores with the baseline's |
| Limitations | Those the authors state, then those you see (marked "mine") |
| Quality | High, medium or low, with the reason in a few words |
| Relevance | How directly it answers the user's question |
| Notes | Funding, conflicts, data and code availability, replications |

Add columns the question needs (dose, age group, model size, cost); remove those it does not.

## An example row

| Citation | Status | Design | Sample | Main findings | Limitations | Quality |
| --- | --- | --- | --- | --- | --- | --- |
| Hu et al. 2021, "LoRA: Low-Rank Adaptation of Large Language Models", ICLR 2022 (arXiv:2106.09685) | Peer-reviewed conference | Benchmark study: low-rank adapters vs full fine-tuning and other adapters | RoBERTa, DeBERTa, GPT-2, GPT-3 175B; GLUE, WikiSQL, MultiNLI, SAMSum and others | Matches or beats full fine-tuning on most tasks while training far fewer parameters (about 10,000 times fewer for GPT-3) | Mostly English NLP tasks; rank chosen per task; (mine) models from 2021 and earlier only | High: widely replicated |

## Making it

- In the app: `save_sheet` with one sheet "Papers" (a header row, freeze the first row and column,
  wrap long cells), and a second sheet "Synthesis" if useful. The user can sort by year or quality.
- As a file: CSV with a header row, or a Markdown table for a short list.
- Fill it while reading, not afterwards from memory. Mark anything inferred rather than stated.

## Writing the synthesis

1. Group the rows: by question, design or finding.
2. For each group: what the evidence says, how strong it is (count and quality of studies), and how
   consistent.
3. Explain disagreements: different populations, measures, doses, time frames, methods, funding.
4. Name the gaps: what no study has looked at, or only weak studies.
5. End with what this means for the user's question, and how sure you are.

Cite rows by author and year in the text, and list the full references at the end.
