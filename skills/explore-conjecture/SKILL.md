---
name: explore-conjecture
description: Use when someone has a conjecture, a pattern or a guess in mathematics and wants to know if it is worth their time (is it false, already known, or open). Not for writing a Lean proof (lean-proofs).
category: research
triggers: [explore this conjecture, explore the conjecture, test this conjecture, i have a conjecture, find a counterexample, look for a counterexample, is this conjecture true, is this pattern known, is this sequence known, integer sequence*, oeis, check small cases, compute small cases]
---

# Exploring a conjecture

A guess in mathematics is usually false, already known, or hard. This method finds out which, cheapest
first, before anyone spends a week on a proof. Its answers rest on exact computation and on what is
really found, never on what looks plausible. Small cases can refute a statement; they cannot prove it.

Tools: your shell (code that computes), `oeis_lookup` (integer sequences), `prior_work` (has it been
done), `lean_search` and the web (known theorems), `read_page`, `finding_record`.

## 1. Say it exactly

Write the statement down before computing anything:

- the **objects**, and the **domain** each variable ranges over (naturals with or without 0, integers,
  primes, reals; finite sets or any; connected or not);
- the **quantifiers**, in order, and what each constant may depend on;
- the **indexing**: does it start at 0 or at 1? Which is the first term, the empty sum, `0!`?
- **what would count as a counterexample**: the exact thing a program checks.

When the person's sentence leaves one of these open, say which reading you take. Ask only when the
readings differ in truth (find a small case where they do, and show it); otherwise state your reading
and go on. Never change the statement to make it computable or true without saying so.

## 2. Hunt a counterexample first

It is the cheapest way to finish.

1. **The edges**: 0, 1, 2, the empty set, equal arguments, primes and prime powers, powers of two,
   negative numbers, very unbalanced inputs (one huge, one tiny), degenerate shapes (a single point,
   a graph with no edges, a constant function).
2. **Then brute force over a stated range**, written down: every `n` up to N, every pair up to M, every
   graph on k vertices. Random large inputs as well, when the range cannot be exhaustive.
3. **Exact arithmetic only**: Python's integers and `fractions.Fraction`, or sympy if it is already
   there (do not install anything without asking). Never floats for a claim: rewrite the test in whole
   numbers (compare squares in place of square roots, cross-multiply fractions). A floating-point search
   may only point at candidates, each then checked exactly.
4. Check the checker: run it on a case you know is true and one you know is false.

A counterexample is **checked twice, by code written two ways** (not the same function called again),
satisfies every hypothesis of the statement as written, and is shown small enough to verify by hand when
it can be: give the smallest one found, with the numbers on both sides. Then say what the nearest
statement might be that survives (an extra hypothesis, a weaker bound), clearly as a new guess.

## 3. Compute the small cases

When it survives, make a table of the first values, with the code that made it, saved in the working
folder. Say the range checked and how long it took, so someone can go further. Before a search that will
take long, say what it costs and what it could change.

## 4. Look the numbers up

- A **sequence of integers** goes to `oeis_lookup`. Give the matches with their A-numbers, names and
  links, how many terms matched and from which offset. **A match on a handful of terms is a lead, not a
  fact**: compute the next terms and compare them with the entry's (its page has more than the first
  twenty). Read the entry's definition and formulas, not only its name.
- No match: try without the first one or two terms, with a common factor divided out, the differences,
  or the terms at even and at odd places. Say which variant matched.
- A **constant or an identity** is looked for with the web (its digits, its usual names) and with
  `lean_search` (what the libraries already prove).

## 5. Look for a pattern

When nothing known fits: differences and ratios, parity and residues modulo small numbers, factorisations,
growth. A recurrence or a closed form is **fitted on some terms and tested on terms held back**: say how
many were fitted, how many were tested and what happened. A formula with as many unknowns as the terms it
was fitted on says nothing.

## 6. Has it been done?

Before calling anything new, run `prior_work` with the statement in two to six sentences, and name the
nearest known theorem, with its link, and how the guess differs from it. A statement that follows in a few
lines from a known one is known. Finding nothing is not proof that it is new.

## 7. Report

One of these three, first:

- **"False: here is a counterexample"**: the case, the two sides, how it was checked twice.
- **"Known: it is <theorem or sequence>, here"**: with the link, and any difference in hypotheses.
- **"Open as far as I can tell, and it holds for <range>"**: say what that is and is not worth. Small
  cases prove nothing: say how many cases were checked, and whether the range is one where a
  counterexample would be expected (if first failures of such statements usually come late, or only at
  special inputs, say so).

Then: the exact statement you tested, the files with the code, and the **next step**: a proof to try
(with the lean-proofs skill for a statement worth pinning), or a larger search and what it would cost.

When the folder's project keeps findings (you have `findings` and `finding_record`), look there before
starting, and record the outcome: the statement, `supported` (a proof, or a theorem found), `refuted`
(a counterexample) or `open` (it holds for a range and no proof), with the code as evidence
(`{ kind: "file", ref: its path in the project }`).

## Pitfalls

- **The strong law of small numbers**: small numbers satisfy too many patterns. `n² + n + 41` is prime
  for `n = 0 … 39` and not for `n = 40`.
- **An off-by-one against the OEIS**: check `offset` and `matchedFrom` before reading an entry's formula
  as yours. For a table the terms run row by row, and for a constant's digits the offset is where the
  decimal point is.
- **Floats**: a difference of `1e-12` may be rounding or may be the counterexample.
- **A range that stops just short** of where a counterexample is plausible (the first large prime of a
  kind, the size where one term overtakes another, an overflow). Say why the range is where it is.
- **"It matches A000…" from five terms.**
- **Rounding a statement into a different one** while making it exact: "almost all" is not "all", `≤` is
  not `<`, "for large `n`" is not "for every `n`" (a finite search says nothing about the first).
- A bug that skips cases looks exactly like a true statement: count the cases checked and compare with
  the number there should be.
