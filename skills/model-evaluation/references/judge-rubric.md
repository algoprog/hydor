# LLM-as-judge: rubrics and checks

## An absolute rubric (one answer at a time)

```text
You are grading an answer from a customer-support assistant for Lisbon Bakes.

Question: {question}
Reference answer (correct facts): {reference}
Answer to grade: {answer}

Grade on these criteria:
1. Correct: every fact agrees with the reference answer; nothing invented.
2. Complete: answers what was asked, including the deadline or amount when the question needs one.
3. Clear and polite: plain words, no more than four sentences.

Scale:
5 = correct, complete and clear.
4 = correct and complete, slightly unclear or long.
3 = correct but missing something the customer needs.
2 = partly wrong, or vague enough to mislead.
1 = wrong, invented, or does not answer.

First write two or three sentences of reasoning, then the last line exactly as:
SCORE: <1-5>
```

Parse only the final `SCORE:` line; count an answer without one as a judging failure and look at it.

## A pairwise comparison (which of two answers is better)

```text
Question: {question}
Reference answer: {reference}

Answer A: {answer_a}
Answer B: {answer_b}

Which answer serves the customer better, judged on correctness first, then completeness, then
clarity? Length is not a merit in itself. Explain briefly, then end with exactly one line:
WINNER: A, WINNER: B, or WINNER: TIE
```

Run every pair twice, with A and B swapped. A system wins an item only when it wins in both orders;
anything else is a tie. Report wins, losses and ties, with the number of items.

## Checking the judge before trusting it

1. Take 50 to 100 items; have one or two people grade them with the same rubric, without seeing
   the judge's grades.
2. Measure agreement between person and judge (and between the people, if two): Cohen's kappa for
   labels, or the share of exact and within-one-point matches for 1-5 scores.
3. Read every disagreement: is the rubric unclear, or the judge wrong in a pattern (too lenient,
   fooled by confident tone, favouring length)? Fix the rubric and measure again.
4. Use the judge only when it agrees about as well as two people do (kappa around 0.6 or more is a
   common bar), and say how well it agreed in the report.

```python
from collections import Counter

def cohen_kappa(a, b):
    """Agreement between two raters on the same items, corrected for chance (1 = perfect, 0 = chance)."""
    n = len(a)
    observed = sum(x == y for x, y in zip(a, b)) / n
    ca, cb = Counter(a), Counter(b)
    expected = sum(ca[k] * cb[k] for k in set(a) | set(b)) / (n * n)
    return (observed - expected) / (1 - expected) if expected < 1 else 1.0
```

## Habits that keep judging fair

- A judge model from a different family than the systems being compared.
- Temperature 0, a fixed judge version and prompt, recorded in the report.
- Anonymous answers: no system names, and the same formatting for every system.
- Keep every raw judgement (JSONL) next to the scores.
- Spot-check: read ten random judgements per run even after the judge passed its check.
