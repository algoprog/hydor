---
name: papers
description: Use when working closely with academic papers, such as tracing who cites a paper, getting a legal full text, summarising one, building a literature matrix, judging a study's quality, or citing with BibTeX. Pairs with the research skill.
category: research
triggers: [this paper, these papers, arxiv, semantic scholar, openalex, pubmed, bibtex, literature matrix, systematic review, peer-reviewed, preprint*, citation count]
---

# Academic papers

The research skill covers the method: plan the question, search wide, weigh sources, cite. This one
adds what scholarly literature needs: the indexes that find papers precisely, citation trails, a
legal full text, reading a paper for what it really shows, judging how far to trust it, and citing
it exactly. Request examples for every service are in `references/scholarly-apis.md`.

## 1. Find candidates

- **A systematic review**, or any answer that claims to cover a field: before screening, write down
  what counts and what does not (years, languages, study designs, populations, outcomes); keep each
  query with where and when it ran; count what was found, excluded (with the reason) and kept. A
  PRISMA flow diagram reports exactly that, and it lets someone repeat the review.
- `web_search` with `categories: ["academic"]` (every scholarly index), `["arxiv"]` or
  `["pubmed"]`, `k` up to 100, `from` and `to` for years, `file_types: ["pdf"]` for full texts.
  Use the field's own terms and several phrasings; the title of one key paper finds its
  neighbours.
- The scholarly APIs, for exact searches and for the trails between papers:
  - **OpenAlex** (all fields): filters by year, type, open access, citations; lookups by ID are
    free, searches use a small daily allowance without a key (a free key gives ten times more).
  - **Semantic Scholar**: citations, references, recommendations, one-line summaries. Without a key
    it often answers 429; wait and retry, or ask the user for a free key (`request_secret`, sent as
    an `x-api-key` header).
  - **arXiv** for preprints in physics, maths, computer science and more: fielded queries (`ti:`,
    `au:`, `abs:`, `cat:`), newest first; one request every 3 seconds.
  - **PubMed** and **Europe PMC** for medicine and life sciences; **Crossref** for any DOI.
- Snowball from two or three key papers: backwards through their references, forwards through the
  papers citing them. Sort citing papers by date for the latest work, by citations for the
  influential work. Stop when new papers only cite ones you have and add no new findings.
- Look for newer versions of what you found: the published version of a preprint (results can
  change), corrections, and retractions (the publisher's page; Retraction Watch's database).

## 2. Get the full text legally

In order: the open-access link that OpenAlex (`best_oa_location`) or Semantic Scholar
(`openAccessPdf`) gives; the arXiv, bioRxiv, medRxiv or PubMed Central version; the author's own or
university page; Unpaywall by DOI. If the paper is only behind a paywall, say so, work from the
abstract and say that you did, and ask whether the user has access (a library, an employer) and can
give you the PDF. Never use shadow libraries such as Sci-Hub or LibGen. Access problems in general:
the blocked-pages skill.

## 3. Read it for what it shows

- `read_page` on the PDF with a `question`, or download it and use `read_document` (it gives page
  numbers to cite). arXiv's HTML version (`arxiv.org/html/<id>`) often reads better than its PDF.
  Check numbers you will quote against the PDF itself: tables can come out jumbled as text.
- Read in this order: abstract, figures and tables, conclusion, then methods and results in detail.
- Note for each paper: the question; the design (experiment, trial, cohort, survey, benchmark);
  the data and sample (how many, who, where, when); what it is compared with; the main result with
  its size and uncertainty; the limitations the authors state, and the ones they do not.
- Separate what the paper shows from what its abstract or press release claims.

## 4. Build a literature matrix

One row per paper, one column per thing you compare: citation, question, design, sample, measures,
main findings with numbers, limitations, quality, relevance. Make it with `save_sheet` so the user
can sort and filter it (or a CSV or Markdown table). Then write the synthesis across the rows: where
results agree, where they conflict and why (population, measure, method, date), and what is still
unknown. Template and an example in `references/literature-matrix.md`.

## 5. Judge how far to trust it

| Ask | Stronger | Weaker |
| --- | --- | --- |
| Was it reviewed? | Peer-reviewed in a recognised venue | Preprint; a journal with no clear review (check DOAJ, the publisher) |
| What design? | Randomised, controlled, preregistered; for ML, a held-out test, tuned baselines, several seeds | Observational for a causal claim; one run; tested on the training data |
| How big, and who? | Large, matches the population in the question | Small, narrow, many dropouts |
| How big is the effect? | Effect sizes with confidence intervals | A p-value only; many comparisons with a few "significant" |
| Has it held up? | Replicated; consistent with reviews and meta-analyses | A single study; contradicted later |
| Who paid, what is shared? | Declared funding, open data and code | Undeclared interests; data "on request" |

Citation counts measure attention, not truth, and lag for recent work. Prefer systematic reviews and
meta-analyses for "what is known". Say the strength of evidence in plain words: "one small
observational study", "consistent across three randomised trials and a meta-analysis".

## 6. Cite exactly

- Take the metadata from the source of record, never from memory: BibTeX for a DOI with
  `curl -sSL -H "Accept: application/x-bibtex" https://doi.org/<doi>`, a formatted reference with
  `-H "Accept: text/x-bibliography; style=apa"`, and for arXiv `https://arxiv.org/bibtex/<id>`.
- Check each entry: authors, year, title, venue, volume and pages. In BibTeX titles, protect
  capitals with braces (`{BERT}`, `{COVID}-19`).
- Cite the version you read; when a preprint has a published version, cite that and say if the
  results changed. Quotes get a page or section.
- Every reference must resolve: open each DOI or link and confirm it is the paper you mean. A
  reference you cannot find does not go in.
- For a LaTeX paper, keep the `.bib` file with it (`save_latex`); elsewhere, the style the user
  asks for (APA, Vancouver, IEEE).

## Pitfalls

- Summarising methods or results from the abstract alone.
- Treating a preprint, or a single study, as settled.
- Relative effects without absolute ones: "doubles the risk" may mean 1 in 10,000 becoming 2.
- Stronger words than the paper's: "associated with" becoming "causes", "in mice" becoming "in people".
- Missing the latest work: always look at who cited the key papers in the last two years.
- Invented or half-remembered references.
- Many fast requests to the APIs: they throttle, then block.
