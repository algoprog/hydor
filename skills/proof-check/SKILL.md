---
name: proof-check
description: Use when checking whether a proof written in words is correct (in a paper, a student's work or your own): every step justified or marked as a gap, the usual failures hunted, a verdict tied to its lines. Not for writing Lean (lean-proofs).
category: research
triggers: [check this proof, check the proof, check my proof, is this proof correct, is the proof correct, verify this proof, find the gap in the proof, referee the proof, does this proof hold, review the proof, proof of lemma]
---

# Checking a proof written in words

A proof can read well and be wrong. Check it as a careful referee would: every step has to earn
its place, and "it sounds right" is not a reason.

## 1. What is claimed

Restate the statement in your own words: the objects and their domains, every hypothesis, the
conclusion, and the order of the quantifiers. Note which definitions it relies on, and read them.
If the statement itself is unclear, or reads two ways, say so and check the likelier reading.
A claim that is false cannot have a correct proof: try a few small cases first.

## 2. Line by line

For each step, say what justifies it:

- a hypothesis,
- an earlier step (which one),
- a definition,
- a named theorem, **with each of its conditions checked against this case**,
- a computation (redo it),
- or nothing yet: a **gap**.

Do not fill a gap in your head and move on. Say what is missing, and whether you can supply it.

## 3. The usual failures

- A case not covered: zero, negative, empty, one element, infinite, the boundary, equality.
- Quantifiers swapped: a `δ` or `N` that depends on something it must not; pointwise used as
  uniform.
- A limit exchanged with a sum, integral, derivative or another limit without a reason
  (uniform or dominated convergence, monotonicity, Fubini's conditions).
- Dividing by what may be zero; a square root or logarithm of what may be negative.
- "Clearly", "obviously", "it is easy to see", "without loss of generality": prove it or show
  where it fails.
- Circular reasoning: the claim, or something equivalent to it, used on the way.
- A lemma used outside its conditions (compactness, finiteness, independence, convexity,
  measurability, integrability).
- Induction with a weak or missing base, a step that silently needs a larger `n`, or an
  inductive hypothesis too weak for what it is used for.
- Existence taken for granted: a maximum, a limit, an inverse, a choice.
- One direction proved of an "if and only if"; an implication used backwards.
- Constants that grow with the variable they are meant to be free of; wrong inequality
  direction after multiplying by a negative.

## 4. Try to break it

Test the claim and the doubtful steps on small and extreme cases. Where it can be computed,
compute (a short script, exact arithmetic where it matters): one counterexample settles a step.
A search that finds none is not a proof; say what range you tried.

## 5. The verdict

One of three, said first:

- **Holds as written.**
- **Holds once these gaps are filled**: each gap stated, with the argument that fills it.
- **Fails at this step**: which step and why, with the counterexample if you found one; say
  whether the claim itself is false or only this proof of it.

If you could not decide about a step, say which one and why. Do not call a proof correct because
you found nothing wrong in a part you did not check.

## 6. The report

A list tied to the proof's own lines or numbered steps, so each point can be found: where (file
and line numbers, or the sentence quoted), what the step claims, what justifies it, and, for a
gap or an error, what is wrong and how to mend it. Keep the steps that hold to a line each and
spend the words on the ones that do not.

Then offer to formalise the doubtful step in Lean with the `lean-proofs` skill (the statement
agreed first): a checker settles what reading cannot.
