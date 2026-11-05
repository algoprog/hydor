# Review forms of the venues

As the Reviewer simulator knows them (the 2025 calls). Forms change a little each year: check the
current call before you rely on a field or a scale.

## ACL Rolling Review

What reviewers there weigh most: soundness of the claims, fair comparison with strong baselines, a Limitations section, the data and models released.

Fields: **Paper summary** (what the paper is about and what it contributes, in your own words); **Summary of strengths** (the main reasons to publish it); **Summary of weaknesses** (the main reasons not to, each with what would address it); **Comments, suggestions and typos** (everything else that would make it better).

| Score | Scale | What it means |
| --- | --- | --- |
| Soundness | 1 to 5 | 5: excellent, every claim well supported; 3: acceptable, some claims need more support; 1: major claims unsupported |
| Overall assessment (the decision) | 1 to 5 | 5: award-level, consider for a top paper; 4: conference; 3: findings; 2: resubmit next cycle; 1: do not resubmit |
| Confidence | 1 to 5 | 1: an educated guess; 5: certain, having checked the details |
| Reproducibility | 1 to 5 | 5: could easily reproduce the results; 1: could not reproduce them |

## SIGIR

What reviewers there weigh most: standard test collections and strong, tuned baselines (BM25 and recent neural rankers), significance testing, efficiency where it matters, and a clear contribution to retrieval.

Fields: **Summary** (the problem, the approach and the main findings); **Relevance to SIGIR** (how it bears on information retrieval); **Strengths** (numbered); **Weaknesses** (numbered, each with what would address it); **Detailed comments** (method, experiments, evaluation, writing).

| Score | Scale | What it means |
| --- | --- | --- |
| Originality | 1 to 5 | 5: highly original; 1: known |
| Technical soundness | 1 to 5 | 5: rigorous; 1: flawed |
| Quality of the evaluation | 1 to 5 | 5: strong baselines, collections and significance tests; 1: weak |
| Quality of presentation | 1 to 5 | 5: very clear; 1: hard to follow |
| Overall recommendation (the decision) | -3 to 3 | 3: strong accept; 1: weak accept; 0: borderline; -1: weak reject; -3: strong reject |
| Confidence | 1 to 5 | 1: an educated guess; 5: certain, having checked the details |

## NeurIPS

What reviewers there weigh most: technical quality, honest claims backed by experiments with error bars, clear writing, significance to the field, the checklist answered.

Fields: **Summary** (what it claims and how); **Strengths and weaknesses** (on quality, clarity, significance and originality); **Questions** (what the authors should answer; what would change your score); **Limitations** (whether the authors state the limitations and the possible harms of their work).

| Score | Scale | What it means |
| --- | --- | --- |
| Quality | 1 to 4 | 4: excellent; 1: poor |
| Clarity | 1 to 4 | 4: excellent; 1: poor |
| Significance | 1 to 4 | 4: excellent; 1: poor |
| Originality | 1 to 4 | 4: excellent; 1: poor |
| Overall (the decision) | 1 to 6 | 6: strong accept; 4: borderline accept; 3: borderline reject; 1: strong reject |
| Confidence | 1 to 5 | 1: an educated guess; 5: certain, having checked the details |

## ICLR

What reviewers there weigh most: whether the claims are supported, ablations that show where the gains come from, comparison with recent work, clarity.

Fields: **Summary** (what it claims to contribute); **Strengths** (the main ones); **Weaknesses** (the main ones, each with what would fix it); **Questions** (for the authors, to clear up in the discussion).

| Score | Scale | What it means |
| --- | --- | --- |
| Soundness | 1 to 4 | 4: excellent; 1: poor |
| Presentation | 1 to 4 | 4: excellent; 1: poor |
| Contribution | 1 to 4 | 4: excellent; 1: poor |
| Rating (the decision) | 1 to 10 | 10: strong accept; 8: accept; 6: marginally above the threshold; 5: marginally below; 3: reject; 1: strong reject |
| Confidence | 1 to 5 | 1: an educated guess; 5: certain, having checked the details |

## ICML

What reviewers there weigh most: claims backed by evidence, sound experimental design, the relation to prior work, and essential references.

Fields: **Summary** (the main findings and contributions); **Claims and evidence** (are the claims supported by clear and convincing evidence?); **Methods and evaluation criteria** (do they make sense for the problem?); **Experimental designs or analyses** (are they sound and valid?); **Relation to the broader literature** (and essential references it does not discuss); **Other strengths and weaknesses** (originality, significance, clarity); **Questions for the authors** (whose answers could change your evaluation).

| Score | Scale | What it means |
| --- | --- | --- |
| Overall recommendation (the decision) | 1 to 5 | 5: strong accept; 4: accept; 3: weak accept; 2: weak reject; 1: reject |
| Confidence | 1 to 5 | 1: an educated guess; 5: certain, having checked the details |

## KDD

What reviewers there weigh most: real-world significance and scale, strong baselines on public data, reproducibility (code and data), clear writing.

Fields: **Summary** (the problem, the method and the results); **Strengths** (s1, S2, …); **Weaknesses** (w1, W2, …, each with what would address it); **Detailed comments** (including reproducibility: code, data and settings).

| Score | Scale | What it means |
| --- | --- | --- |
| Novelty | 1 to 5 | 5: groundbreaking; 1: none |
| Technical quality | 1 to 5 | 5: excellent; 1: poor |
| Presentation | 1 to 5 | 5: excellent; 1: poor |
| Overall rating (the decision) | 1 to 6 | 6: strong accept; 4: weak accept; 3: weak reject; 1: strong reject |
| Confidence | 1 to 5 | 1: an educated guess; 5: certain, having checked the details |

## CIKM

What reviewers there weigh most: novelty, solid experiments with standard data and strong baselines, clarity.

Fields: **Summary** (the contribution in a few sentences); **Strengths** (numbered); **Weaknesses** (numbered); **Detailed comments** (for the authors).

| Score | Scale | What it means |
| --- | --- | --- |
| Overall evaluation (the decision) | -3 to 3 | 3: strong accept; 0: borderline; -3: strong reject |
| Confidence | 1 to 5 | 1: an educated guess; 5: certain, having checked the details |

## WSDM

What reviewers there weigh most: methods for search and data mining on the web, evaluated on real data against strong baselines.

Fields: **Summary** (what the paper does); **Strengths** (numbered); **Weaknesses** (numbered); **Detailed comments** (for the authors).

| Score | Scale | What it means |
| --- | --- | --- |
| Originality | 1 to 5 | 5: very original; 1: known |
| Technical quality | 1 to 5 | 5: excellent; 1: poor |
| Overall (the decision) | 1 to 5 | 5: strong accept; 3: borderline; 1: strong reject |
| Confidence | 1 to 5 | 1: an educated guess; 5: certain, having checked the details |

## TheWebConf

What reviewers there weigh most: a clear link to the Web, novelty, solid evaluation, ethics of the data used.

Fields: **Summary** (the contribution and its relevance to the track); **Strengths** (numbered); **Weaknesses** (numbered); **Detailed comments** (for the authors).

| Score | Scale | What it means |
| --- | --- | --- |
| Relevance to the Web and the track | 1 to 5 | 5: central; 1: off topic |
| Originality | 1 to 5 | 5: very original; 1: known |
| Technical quality | 1 to 5 | 5: excellent; 1: poor |
| Overall (the decision) | -3 to 3 | 3: strong accept; 0: borderline; -3: strong reject |
| Confidence | 1 to 5 | 1: an educated guess; 5: certain, having checked the details |

## A journal

What reviewers there weigh most: completeness, rigour, the discussion of related work and of limitations, and a clear contribution over the authors’ earlier papers.

Fields: **Summary** (what it claims and how it shows it); **Major comments** (numbered: what must change for it to be published); **Minor comments** (numbered: smaller fixes, clarity, typos).

| Score | Scale | What it means |
| --- | --- | --- |
| Recommendation (the decision) | 1 to 4 | 4: accept as it is; 3: minor revision; 2: major revision; 1: reject |
| Confidence | 1 to 5 | 1: an educated guess; 5: certain, having checked the details |

## Other

What reviewers there weigh most: whether the claims hold, the experiments and baselines, novelty, clarity.

Fields: **Summary** (what it claims and contributes); **Strengths** (the main ones); **Weaknesses** (the main ones, each with what would fix it); **Questions** (for the authors).

| Score | Scale | What it means |
| --- | --- | --- |
| Overall (the decision) | 1 to 10 | 10: top paper; 6: accept; 5: borderline; 3: reject; 1: strong reject |
| Confidence | 1 to 5 | 1: an educated guess; 5: certain, having checked the details |

