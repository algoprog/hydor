---
name: refactoring
description: Use when restructuring code without changing what it does, such as splitting a large file or function, removing duplication, untangling dependencies, or making room for a change. Not for fixing bugs or adding features in the same step.
category: coding
triggers: [refactor*, clean up this code, clean up the code, simplify this code, code smell*, spaghetti code, duplicated code, technical debt, tech debt, extract a function, split this module, without changing behavio*]
---

# Refactoring

Refactoring changes the shape of code and nothing it does. It stays safe when the behaviour is pinned by
tests, every step is small, and every step ends with the tests passing, so a mistake shows up at once
and costs one undo.

## 1. Know why, and agree the scope

- Write the goal in one line: "adding a payment provider becomes a one-file change", "split the
  2,000-line `api.ts` so each route is easy to find", "one date parser instead of three". A refactoring
  without a goal never ends.
- Agree the scope when it is more than a local tidy-up: which modules, and what must not change (public
  APIs, file names others import, database schema, URLs, config keys).
- Keep it apart from behaviour changes. Refactor first to make the change easy, commit, then make the
  change. A bug fixed halfway through, or a feature mixed in, makes the diff unreviewable and a failing
  test ambiguous.

## 2. Pin the behaviour first

- Run the existing tests and look at how well they cover the code you will touch (the project's coverage
  report, if it has one; otherwise read the tests).
- Thin coverage: add characterisation tests that record what the code does now, odd behaviour included.
  Assert the current output even where it looks wrong, and note suspicious cases for the user instead of
  fixing them now.
- Code that is hard to test alone: test one level up (an HTTP request in process, a CLI run on sample
  input compared with a saved output), or open one small seam: pass the clock, the random source, the
  HTTP client or the file system in as a parameter that defaults to the real one, so callers see no
  change and a test can hand in a fake.
- Prove the tests can catch a break: change something on purpose once, see a test fail, undo it.

## 3. Small steps, green after each

The loop: one refactoring, run the fast tests, commit (or at least checkpoint), next.

- When tests fail, undo the step (`git restore .` back to the last commit) and take a smaller one.
  Do not debug a large tangled step.
- Let tools do the mechanical part: the editor's rename and move (it updates imports), and the type
  checker after every step (`npx tsc --noEmit`, `mypy`, `go vet`); a type error is a free test.
- Before changing a name or signature, find every use: `git grep -n -w oldName`, and also strings,
  templates, config files, reflection or dynamic access (`getattr`, `obj[name]`), serialised data, and
  other repositories that import this one.
- Run the whole suite at checkpoints, not only the fast part.

## 4. Common refactorings

| Smell | Refactoring |
| --- | --- |
| A long function doing several things | Extract function: move one coherent block into a well-named function |
| A name that misleads or says nothing | Rename, with every use at once |
| The same logic in several places | Extract it once, then replace the copies one at a time, tests after each |
| A function that adds nothing over its body | Inline it |
| Code that uses another module's data more than its own | Move it there; keep a re-export while callers move |
| A long if/else or switch on a type or kind | A lookup table, or one handler per kind |
| Deep nesting | Guard clauses that return early; extract the inner block |
| The same group of parameters passed around | One parameter object or small type |
| Boolean flags that switch behaviour (`render(x, true, false)`) | Two functions with clear names |
| A huge file or module | Split by responsibility, one cohesive group at a time |
| One change means edits in many files | Bring that knowledge into one place (a module, a table, a constant) |
| Magic numbers and strings | Named constants |

Steps and traps for each: `references/catalog.md`.

## 5. Changing an interface others use

When other modules, services or users of a library call it:

1. Add the new form next to the old one.
2. Make the old one call the new one, and mark it deprecated.
3. Move callers over, a few at a time, tests after each batch.
4. Remove the old form once a search finds no callers.

Database columns and API fields follow the same pattern (expand, migrate, contract: see the
sql-and-databases skill).

## 6. Finish

- Run the full suite, the type checker and the linter, and use the app once.
- Review your own diff (code-review): no behaviour change slipped in, no dead code left, no formatting
  churn in lines you did not need to touch. Run a formatter over a whole file only in its own commit.
- Commit refactorings separately from features and fixes, with messages that say so ("Refactor: extract
  price rules from checkout").
- Report what changed in structure, what stayed the same (behaviour, public interfaces), and the evidence
  (the tests that ran).

## When to stop

Stop when the goal is met, not when the code is perfect. Stop and ask when the next step would change
behaviour, when you find a bug (note it, report it, fix it separately), when adding tests turns into a
project of its own, or when the work grows past the agreed scope.

When the aim was to add something and pinning the old code would be a project of its own, leave the old
code alone: write the new part as a new function with its own tests and call it from one line in the
old code, or wrap the old function in a new one that does the extra work before or after it.

## Pitfalls

- A big-bang rewrite: days of red tests and a diff nobody can review.
- Calling a refactoring safe without tests that would catch a break.
- Renaming something used as a string (config keys, routes, JSON field names, database columns,
  translation keys): it compiles and still breaks stored data or other clients.
- "While I'm here" fixes that change behaviour inside a refactoring commit.
- Abstracting too early: two similar copies are often fine; extract at the third, when you can see what
  really varies. If you cannot give the shared piece a good name, it is the wrong abstraction.
- Reformatting whole files along with real changes.
