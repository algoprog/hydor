# A catalog of refactorings

Each entry: when to use it, the steps, and what tends to go wrong. Run the tests after every numbered
step.

## Extract function

When: a block inside a long function does one thing you can name.

1. Pick the block and a name that says what it does, not how ("parseInvoiceLines", not "loop2").
2. Find the variables it reads (become parameters) and the ones it changes that are used later (become
   return values). More than three or four of either: the block may be the wrong size.
3. Create the new function, copy the block in, return what callers need.
4. Replace the block with the call.
5. Look for other copies of the same block and replace them too, one at a time.

Watch for: early `return`, `break` or `continue` inside the block; `this` or closures in JavaScript;
exceptions that were caught by a surrounding `try`.

## Inline function or variable

When: the name adds nothing over the body, or an indirection hides what happens.

1. Check it is not overridden, exported, or used by reflection or by name elsewhere.
2. Replace each call with the body, adjusting names.
3. Delete the function.

## Rename

When: a name misleads, is too generic (`data`, `handle`, `utils`), or the meaning changed.

1. Use the editor's or language server's rename where possible; it updates imports and references.
2. Search for the old name as text too: strings, templates, docs, config, tests, other repositories.
3. Public names (exported functions, API fields, CLI flags, config keys, database columns): add the new
   name, keep the old one working and deprecated, move users over, remove later.

## Move function, class or file

When: it uses another module's data or helpers more than its own, or its folder no longer fits.

1. Copy it to the new place; make the old place re-export or delegate to it.
2. Move importers to the new path in batches (an editor's "update imports on move" helps).
3. Remove the re-export once nothing imports the old path.

Watch for: circular imports created by the move; module side effects at import time; build or bundler
configs that list paths.

## Split a large module

When: a file holds several responsibilities, or nobody can find anything in it.

1. List its contents and group them by responsibility (routes, validation, persistence, formatting).
2. Move one group to a new module, re-exporting from the old file so nothing else changes. Tests.
3. Repeat for the next group.
4. Move importers to the new modules; remove the re-exports.

Watch for: shared private helpers that several groups use (move them to a small shared module first),
and import cycles between the new modules (a sign the grouping is wrong).

## Replace a conditional with a table or polymorphism

When: the same `switch` on a type or kind appears in several places, or grows with every new kind.

1. Write a test per kind if there is not one.
2. For data-like differences, a lookup table: `const FEES = { standard: 4.9, express: 9.9 }`.
3. For behaviour differences, one handler per kind (an object or class per kind, or a map from kind to
   function), selected once.
4. Replace each `switch` with a lookup; keep an explicit error for unknown kinds.

## Guard clauses

When: deep nesting where the real work sits in the innermost branch.

1. Turn each precondition into an early return or throw at the top (`if (!user) return null;`).
2. The main path ends up unindented at the bottom.

## Introduce a parameter object

When: the same three or more values travel together through several functions.

1. Define a small type or dataclass for them.
2. Add it as a parameter alongside the old ones; move callers over; remove the old parameters.

## Split a flag argument

When: a boolean switches between two behaviours (`export(data, true)`).

1. Create two functions with names for each behaviour (`exportCsv`, `exportXlsx`), each calling the old
   one with the flag fixed.
2. Move callers to the named functions; inline the old one if nothing else needs it.

## Replace magic values with named constants

When: a number or string means something the reader has to guess (`if (status === 3)`).

1. Define the constant once, near where it belongs (`const STATUS_SHIPPED = 3`, or an enum).
2. Replace uses one at a time; do not merge different meanings that happen to share a value.

## Remove dead code

When: a function, branch, flag or file is never used.

1. Prove it: search the name everywhere (including dynamic use, configs and other repositories), check
   logs or metrics for the code path if it is a route or job.
2. Delete it in its own commit, so it is easy to bring back.

## Characterisation tests (before refactoring untested code)

1. Call the code with representative inputs, including odd ones.
2. Record the outputs as the expected values, even where they look wrong (mark those with a comment).
3. For large outputs, save them to files and compare (a "golden master"); normalise times and ids first.
4. Refactor with these tests as the net; report the suspicious behaviours separately.
