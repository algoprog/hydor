# Research: papers, writing and the lab

<!-- Lead: the intro paragraph and the picture line (images/researchers.webp). -->

## Keep up with your field

<!-- Workstream B1: Paper radar, Citation alerts, New-model watch, Deadline radar, Living related work, Gap finder. Subsections (###) as needed. -->

<!-- end: keep-up -->

## Read and organise papers

<!-- Workstream B2: Reading list with Zotero sync, Literature matrix, Reproduce a paper. -->

<!-- end: read -->

## Check a paper before you submit

Before a paper goes out, the LaTeX editor checks it as a venue's desk and its reviewers would: its references, whether it gives you away, its pages and fonts, the parts the venue asks for, and the numbers in its tables. Open your paper ([your LaTeX documents](/library?kind=tex)) and pick **Tools → Check before submitting**.

1. Pick where it goes: **ACL Rolling Review** (a long or a short paper; **EMNLP** and **NAACL** take papers through it), **SIGIR** (full or short), **CIKM**, **WSDM**, **TheWebConf**, **KDD**, **NeurIPS**, **ICLR**, **ICML**, **AAAI**, **An IEEE journal**, **An ACM journal**, or **Other**, with a page limit and **Reviewed anonymously** of your own. A line under it says what the venue asks: its page limit, what does not count toward it, whether it reviews anonymously and the parts it requires. Venues change their rules every year, so the line links to the call for papers too. The check remembers the venue for each paper, and the first time picks the one the paper's own style points to.
2. **Check** typesets the paper, reads its PDF, looks its references up online and shows what it finds as it comes. Only the references' titles, DOIs and arXiv ids are sent, to Crossref, arXiv, OpenAlex, Semantic Scholar and DBLP; what the services said is kept a few days, and one that did not answer is named under the findings.

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

<!-- Workstream D: Annotation workbench, Research sprint, Sweep planner. -->

<!-- end: lab -->

## Reports: your week and your lab notebook

<!-- Workstream D: Weekly progress report, Lab notebook. -->

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
