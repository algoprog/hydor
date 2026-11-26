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
(the verdict, with what each theorem states and a pin of that statement). If one says Lean or
Mathlib is not set up, ask with `lean_setup` (most real mathematics needs Mathlib) and wait; do not
write proofs you cannot check and present them as checked.

## 1. Agree the statement first

Never start proving before this is done.

1. Write the formal statement, with its definitions, and `sorry` for the proof. Check it with
   `lean_check` until it compiles with no error (the only gap the `sorry`).
2. **Try it on small values** where that is possible (`#eval` both sides, `decide` on a few
   instances, the edge cases such as `0` and the empty set): a false statement compiles as happily
   as a true one. Over `ℕ`, `(a - b) + b = a` compiles, and `a = 0`, `b = 1` shows it is false.
3. **Translate it back into plain mathematics from the Lean text alone**, as if you had never seen
   the original. Read each binder, type, hypothesis and operator for what Lean does with it.
4. List every way your translation differs from what was asked. Look for:
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
5. Show the person the Lean statement, the plain translation and the differences, and ask them to
   confirm it says what they mean, as choices (a choices card, or `ask_form`):
   **"It says what I mean"** and **"Not quite: …"**.
6. Wait for their yes. But when your brief, or the person, has already given their answer or a
   criterion for the statement, compare your reading with it and go on, reporting any mismatch,
   instead of stopping. Either way, never change an agreed statement or definition silently: when
   a proof seems to need a change (a missing hypothesis, a false claim), stop, say why, show the
   new statement the same way, and ask again. A statement that changes gets a new pin.
7. Once it is agreed, **pin it**: run `lean_verify` on the file with the proof still `sorry`.
   The verdict is "not proved yet", and each theorem comes with its `statement` (as Lean reads it)
   and its `pin`. Check that the `statement` is the one you showed, and that every name in
   `definitions` (your own definitions it rests on, which the pin covers too) says what was agreed.
   Write the pin down beside the agreed statement in what you show them: `name@pin`.

A subagent that cannot ask, and whose brief gives neither the answer nor a criterion, returns the
statement and its translation to the session that started it, and stops there.

## 2. Search before proving

The library probably has the theorem, or half of it. `lean_search` with ordinary words, and with a
pattern (`_ * _ ≤ _ * _`) or a name. Inside Lean, `exact?`, `apply?` and `rw?` search for you:
check a snippet and read the "Try this" lines in `info`.

## 3. A skeleton first

Write the main steps as lemmas (or `have` steps) with `sorry`, with the final theorem proved from
them. Check it: if the skeleton does not compile, the plan is wrong, and you learn it before any
hard work. Then fill one gap at a time and check after each. Test a lemma you doubt on small cases
(`#eval`, `decide`) before trying to prove it. A proof of one line needs no skeleton.

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

The verdict is `lean_verify`'s (or `leancheck` as a goal's command check), not yours. Ask for it
with the pin: `lean_verify { file, theorems: ["name@pin"] }`, so that it also fails when the
statement is no longer the agreed one. When it says the statement changed, do not take the new pin
for the old one: put the agreed statement back, or go back to the person (step 1).
Report it as it is: **proved** (ok, with the theorem names, their pins and the axioms), or **proved
except these gaps** (each named, with why it is open). Say again, in one line of plain words, which
statement was proved: the agreed one.

For long work set a goal whose check is `leancheck Proofs/Main.lean --theorem name@pin`, so it
keeps going until the agreed statement is proved.

When the work belongs to a project that keeps findings (you have the `findings` and
`finding_record` tools), record what was proved or refuted with `finding_record`: the statement,
`supported` or `refuted`, and the Lean file as its evidence (`{ kind: "file", ref: its path in the
project }`).

## In a Lake project of your own

- When Lean is the app's own, `lake` and `lean` are not on the path (the tools and `leancheck` find them by
  themselves). To run them: `PATH="$HYDOR_LEAN_DIR/elan/bin:$PATH" ELAN_HOME="$HYDOR_LEAN_DIR/elan" lake build`.
- `lake init <name> lib` (and `lake new`) also make a git repository, a README and a workflow file for GitHub:
  say so, and take out what the person did not ask for.
- No `require` of Mathlib unless they want it: a project that requires Mathlib needs its own copy
  (`lake exe cache get`, several GB), so ask first. A loose `.lean` file that imports Mathlib uses the app's copy.
- A snippet cannot import the project's files: to try small values, put the `#eval` lines in a temporary file of
  the project, check it, and delete it.
- Checking leaves `.lake/` (lake's own `.gitignore` leaves it out) and `lake-manifest.json` (it belongs with the
  project).
- A pin covers how your own definitions are written, not only their values: a definition rewritten under an
  agreed statement goes back to the person, like a changed statement.

## Several results: a board

For a paper's chain of lemmas rather than one theorem:

1. List the statements in the order the paper proves them, with what each one uses. Agree the formal
   statement of **every** one with the person first, as section 1 says, and pin each: one table for
   them (the statement in words, in Lean, its pin). A statement later found wrong goes back to them,
   with what depends on it.
2. One file a result (or one theorem a part), in a Lake project so that the files can import one
   another. Each proof is `sorry` at first, and each later result is free to use the earlier ones as
   stated. The whole must compile with the gaps before any proving.
3. Keep a board in the project, a Markdown file: result · `name@pin` · what it rests on · status
   (stated, proved, or stuck with what was tried).
4. Prove from the leaves up (what rests on nothing first). When the person wants it done in parallel,
   hand the parts out as a Campaign instead: each part is one result, and its check is
   `leancheck <file> --theorem name@pin` (exit code 0). A member changes no statement and no other
   part's file. A part that needs an earlier one uses it as stated even while that one is still
   `sorry`. `leancheck` fails a theorem that rests on any gap, so until the earlier ones are proved,
   such a part's check is the same command with `--allow-sorry`, and no `sorry` or `admit` in its own
   file.
5. The whole is proved when, after merging, every part's check passes without `--allow-sorry` and one
   `leancheck` over the top file shows no `sorry` left anywhere it rests on.

## Pitfalls

- "It compiles" is not "it is proved": `sorry` compiles with a warning. Only the verdict counts.
- A pin comes from the statement you agreed, never from the file after the proof: a pin taken
  later accepts whatever the file says by then.
- `ℕ` subtraction and division round down to `0`: state with `ℤ`, `ℚ` or `ℝ`, or add hypotheses.
- Autobound implicits turn a misspelled name into a new variable, and the statement still
  compiles: put `set_option autoImplicit false` at the top of the file.
- Names and signatures change between Mathlib versions: check a name with `#check` here rather
  than trusting memory.
- `decide` fails or runs for ages on large numbers; do not reach for `native_decide` instead.
- A project that requires Mathlib is not checked until its own copy is there: in a terminal in
  the project, `lake exe cache get` (it needs the network and about 8 GB; tell the person first).
  A first `lake build` of a project's own files can take long too.
- Keep the file Lean checks and the file you report the same: verify after the last edit.
