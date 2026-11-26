---
name: lean-proofs
description: Use before proving anything for someone in Lean, formalising a theorem or lemma, or filling a sorry in a Lean 4 file. Agree the statement with them first, then prove in checked steps. Not for a proof written in words (proof-check).
category: research
triggers: [prove it in lean, prove this in lean, formalise in lean, formalize in lean, formalise this theorem, formalize this theorem, state this theorem in lean, lean 4 proof, lean proof, lean theorem, fill the sorry, mathlib proof]
---

# Proving with Lean

Lean accepts only correct proofs, so a proof it accepts is correct **for the statement written**.
Proofs go wrong in two ways, and this method guards against both: proving a statement that is not
the one the person meant, and "proofs" that lean on `sorry` or an added axiom.

Tools: `lean_check` (a file or a snippet), `lean_search` (what the libraries have), `lean_verify`
(the verdict). If one says Lean or Mathlib is not set up, ask with `lean_setup` (most real
mathematics needs Mathlib) and wait; do not write proofs you cannot check and present them as
checked.

## 1. Agree the statement first

Never start proving before this is done.

1. Write the formal statement, with its definitions, and `sorry` for the proof. Check it with
   `lean_check` until it compiles with no error (the only gap the `sorry`).
2. **Translate it back into plain mathematics from the Lean text alone**, as if you had never seen
   the original. Read each binder, type, hypothesis and operator for what Lean does with it.
3. List every way your translation differs from what was asked. Look for:
   - quantifier order (`∀ ε, ∃ δ` against `∃ δ, ∀ ε`) and which variables a constant may depend on;
   - domains and coercions: `ℕ` where `ℤ` or `ℝ` was meant; in `ℕ`, `3 - 5 = 0` and `7 / 2 = 3`;
     division by zero is `0`; where a cast `(n : ℝ)` sits changes the value;
   - off by one: `Finset.range n` is `0 … n-1`; `Finset.Icc` includes both ends;
   - strict against non-strict (`<` and `≤`), "positive" against "non-negative";
   - vacuous hypotheses: can all of them hold at once? Contradictory ones prove anything;
   - a statement made trivially true: an existential with an easy witness, an implicit variable
     bound the wrong way, a typo that makes both sides equal, a definition that already says the
     conclusion;
   - what was left out (finiteness, non-emptiness, continuity, measurability) or added.
4. Show the person the Lean statement, the plain translation and the differences, and ask them to
   confirm it says what they mean, as choices (a choices card, or `ask_form`):
   **"It says what I mean"** and **"Not quite: …"**.
5. Do not go on without their yes. Never change an agreed statement or definition silently: when
   a proof seems to need a change (a missing hypothesis, a false claim), stop, say why, show the
   new statement the same way, and ask again.

A subagent that cannot ask returns the statement and its translation to the session that started
it, and stops there.

## 2. Search before proving

The library probably has the theorem, or half of it. `lean_search` with ordinary words, and with a
pattern (`_ * _ ≤ _ * _`) or a name. Inside Lean, `exact?`, `apply?` and `rw?` search for you:
check a snippet and read the "Try this" lines in `info`.

## 3. A skeleton first

Write the main steps as lemmas (or `have` steps) with `sorry`, with the final theorem proved from
them. Check it: if the skeleton does not compile, the plan is wrong, and you learn it before any
hard work. Then fill one gap at a time and check after each. Test a lemma you doubt on small cases
(`#eval`, `decide`) before trying to prove it.

## 4. Read the goal

Do not guess what Lean wants. Put `trace_state` where you are unsure, or leave the tactic out, and
read the "unsolved goals" message: the hypotheses above the line, the goal after `⊢`. Check the
types there; a surprising `↑` or `ℕ` explains many failures.

## 5. Small steps, automation first

One tactic, one check. Before proving by hand, try `simp`, `omega` (linear arithmetic over `ℕ`
and `ℤ`), `linarith`, `nlinarith`, `positivity`, `ring`, `norm_num`, `aesop`, `decide`, `exact?`,
`apply?` (some need Mathlib). Prefer named intermediate facts (`have h1 : …`) to long tactic
chains that break when anything changes.

## 6. What is never allowed

To make something pass, never: leave a `sorry`; add an `axiom`; use `native_decide`; change or
weaken a definition or the statement; switch checks off (`set_option debug.skipKernelTC`); or
redefine syntax so that a check reads differently. If you are stuck, say exactly which lemma is
still open, its statement, what you tried and what Lean answered.

## 7. The verdict

The verdict is `lean_verify`'s (or `leancheck File.lean` as a goal's command check), not yours.
Report it as it is: **proved** (ok, with the theorem names and the axioms), or **proved except
these gaps** (each named, with why it is open). Say again, in one line of plain words, which
statement was proved: the agreed one.

For long work set a goal whose check is `leancheck Proofs/Main.lean --theorem <name>`, so it keeps
going until the proof holds.

## Pitfalls

- "It compiles" is not "it is proved": `sorry` compiles with a warning. Only the verdict counts.
- `ℕ` subtraction and division round down to `0`: state with `ℤ`, `ℚ` or `ℝ`, or add hypotheses.
- Autobound implicits turn a misspelled name into a new variable, and the statement still
  compiles: put `set_option autoImplicit false` at the top of the file.
- Names and signatures change between Mathlib versions: check a name with `#check` here rather
  than trusting memory.
- `decide` fails or runs for ages on large numbers; do not reach for `native_decide` instead.
- A first build of a project can take long: in a terminal, `lake exe cache get` (Mathlib
  projects), then `lake build`.
- Keep the file Lean checks and the file you report the same: verify after the last edit.
