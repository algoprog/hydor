---
name: test-first
description: Use when adding behaviour or fixing a bug where the tests can come first (TDD), or when deciding what to test, at which level, and what to mock. Not for tracking down an unknown cause; see debugging-code.
category: coding
triggers: [tdd, test-first, test first, tests first, test-driven, red-green, red-green-refactor, write unit tests, add unit tests, regression test, what to mock]
---

# Test first

Write a test for the next small piece of behaviour, watch it fail for the right reason, write the least
code that makes it pass, then tidy up while everything stays green. The tests become a running
specification and a safety net, and the steps stay so small that when something breaks, you know which
change did it. A worked example is in `references/worked-example.md`.

## When it pays, and when it does not

- **Pays:** business rules, parsing and validation, calculations, state machines, data transformations,
  public APIs with clear inputs and outputs, and every bug fix (the failing test is the reproduction).
- **Weak fit:** an exploratory spike while the shape is unknown (spike, throw it away, then build the real
  thing test-first); visual design (judge with screenshots, see frontend-polish); a thin wrapper over a
  third-party service (an integration test is worth more); a one-off script.
- **Existing code without tests:** first pin what it does now with characterisation tests (see the
  refactoring skill), then change it test-first.

## 1. Learn how tests run here

- Find the runner and its conventions before writing a line: `package.json` scripts, `vitest.config.*`,
  `jest.config.*`, `pytest.ini` or `[tool.pytest.ini_options]` in `pyproject.toml`, `go test`,
  `cargo test`, the CI workflow. Copy the existing layout, naming, fixtures and helpers.
- Run the whole suite once: note how long it takes and anything already failing, so you neither fix nor
  take the blame for it by accident.
- Note which folders and file names the runner and the CI command pick up (`test_*.py`, `*.test.ts`), so
  a new test is not silently left out.
- Find the fastest way to run one test: `npx vitest run path -t "name"`, `npx jest path -t "name"`,
  `pytest path::test_name`, `go test ./pkg -run TestName`, `node --test --test-name-pattern="name"`.

## 2. List the behaviours, then pick the smallest next one

- Before any code, write the cases in plain words: the simplest one, the variations, the edges, the
  errors. For a shipping fee: "free from 50", "4.90 below 50", "exactly 50 is free", "rejects a negative
  total". Keep the list beside you and add what you discover. To find the cases:

| The behaviour has | Cases to list |
| --- | --- |
| A limit or a range | Each side of every edge (49.99, 50, 50.01); the minimum, the maximum, one past each |
| Kinds of input that should act alike | One example of each kind, valid and invalid, not ten of one kind |
| Rules that combine conditions | One case per combination; a small table (member or not, over 100 or not) shows the gaps |
| States (an order: created, paid, shipped) | Each allowed move, and a forbidden one refused with the state left as it was |
| Any input | Empty, missing, duplicate, very long, odd characters, midnight and month-end |

- When a rule should hold for every input (a round trip such as `parse(format(x)) == x`, a total never
  negative, sorted output), a property-based test tries hundreds of generated inputs and shrinks a
  failure to the smallest case: Hypothesis in Python, fast-check in JavaScript. For output that varies
  from run to run (a model's reply), assert its shape and limits, not exact words.
- Start with the simplest case that needs real code, then add cases that force the code to generalise.
- For a bug: the first test reproduces it through the public interface, with the input from the report.

## 3. Red: one failing test

- The name states the behaviour, like a line of the specification: `test_exactly_fifty_ships_free`,
  `it('keeps leading zeros in postcodes')`. Not `test_fee_2`.
- Arrange, act, assert. One behaviour per test; several assertions are fine when they describe one
  outcome.
- Work out each expected value from the request, the bug report or by hand, never by running the code
  and copying what it returns: a test copied from the code agrees with the code, bugs included.
- Assert what can be observed from outside: return values, state read through the public interface,
  messages sent, rows written. Not private helpers or the order of internal calls.
- Run it and read the failure. It must fail on the assertion, for the reason you expect, not on an
  import error, a typo or a missing fixture. A test that passes at once proves nothing yet: make it fail
  by breaking the code on purpose, then put the code back.
- Read the summary, not only the exit code: "0 items", "no tests ran", or everything skipped or
  deselected means your test did not run (a file name the runner ignores, a filter that matches nothing).

## 4. Green: the least code that passes

- Make it pass in the simplest way, even a naive one. A hard-coded value is fine when the next test on
  your list will force the general version.
- Write only the code some test asks for. Run the one test, then its file, then the suite.

## 5. Refactor while green

- Remove duplication, improve names, extract functions, in the code and in the tests. Run the tests
  after each small change (see the refactoring skill).
- Commit at green: the test with the code that satisfies it.
- Back to step 2 for the next case. Stop when the list is done.

## What to mock, and what not

| Use the real thing | Replace with a fake or a stub |
| --- | --- |
| Your own logic, value objects, pure functions | Third-party services over the network: payments, email, SMS, model APIs |
| The database, when a fast real one is at hand: SQLite in memory, a test container, a transaction rolled back after each test | The clock (fake timers, a frozen time), randomness (a seed), generated ids |
| The filesystem, inside a temporary folder | Anything slow or flaky by nature, or with effects you cannot undo |
| HTTP through the framework's in-process test client | Hardware and other machines |

- Mock at a boundary you own: wrap the payment provider in a small module of your own and fake that
  module, rather than patching deep inside the vendor's library.
- Prefer simple fakes (a working in-memory version) to mocks that verify call sequences: tests that pin
  internal calls break on every refactor while the behaviour stays right.
- A test that needs many mocks is a design signal: the code under test depends on too much.
- In Python, patch a name where it is looked up, not where it is defined: when `service.py` does
  `from clients import HttpClient`, patch `service.HttpClient`; patching `clients.HttpClient` leaves the
  real one in use.

## Test at the right level

- **Unit** (most tests): one function or class, no I/O, milliseconds each.
- **Integration** (some): your code with the real database, filesystem or HTTP layer, in process.
- **End to end** (few): the whole app through its UI or public API, for the main flows (see web-app-qa).
- Choose the lowest level that can catch the bug: a rounding rule needs a unit test; a wrong SQL join
  needs an integration test against a real database.

## Keep the suite fast and trustworthy

- Unit tests run in seconds in total; slow tests are marked and run separately.
- Each test sets up its own data and cleans up; no order dependence, no shared mutable globals.
- No sleeps: wait for a condition, or use fake timers. Fix seeds, time, time zone and locale.
- A flaky test is a bug. Fix it, or quarantine it with a note and an issue; never ignore it silently.
- To check a whole file's tests the way you check one, a mutation tool (mutmut for Python, Stryker for
  JavaScript, PIT for Java) makes many small breaks and lists those no test noticed. Treat them as leads,
  not a score to chase.

## Pitfalls

- Writing all the tests first and then all the code: the small steps that tell you what broke are gone.
- Never seeing a test fail, so it may test nothing.
- Expected values copied from the code's own output.
- Trusting a green exit code when no test ran.
- Testing implementation details, or snapshotting huge outputs nobody reads.
- Mocking the very thing under test.
- Changing a failing test until it passes without understanding why it failed.
- Leaving `.only`, `.skip`, `xit` or `@pytest.mark.skip` behind.
- Chasing a coverage number: lines run by weak assertions prove little.
