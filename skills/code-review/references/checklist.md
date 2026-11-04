# Code review checklist

Use the parts that fit the change. Each line is a question; a "no" is a finding to weigh, not
automatically a blocking one.

## Intent and scope

- Can you say in one sentence what the change is for, and does the code do that?
- Is everything in the diff needed for that purpose? Unrelated changes belong in their own change.
- Is it small enough to review well? If not, which parts could land separately?

## Correctness

- Empty input, a single item, many items, the maximum; null, None, undefined; zero and negative numbers.
- Strings: Unicode, emoji, very long values, leading and trailing spaces, case differences.
- Numbers: integer overflow, float rounding, division by zero, money in integer cents or decimals.
- Dates and times: time zones, daylight saving changes, end of month, leap years, stored in UTC.
- Branches: every `if` has a sensible `else`; every `switch` handles unknown values.
- Loops: off-by-one boundaries; mutation of a collection while iterating over it.
- Return values and errors from every call are used or deliberately ignored.
- Defaults: a changed default changes behaviour for everyone who relied on the old one.

## Errors and failure

- What happens when the network, disk, database or a dependency fails or is slow? Timeouts set?
- Errors caught where something useful can be done; not caught and ignored; not caught too broadly.
- Messages say what failed and with what input, without leaking secrets or personal data.
- Retries are bounded, back off, and are safe to repeat (idempotent).
- After a failure halfway, is the data still consistent? Is cleanup in `finally` / `defer` / `with`?

## Data and compatibility

- Migrations: reversible or backed up; safe on large tables; old code still works while they run.
- Old data still readable: new fields optional or backfilled; enums extended, not renumbered.
- Public interfaces (API responses, function signatures, CLI flags, config keys, events): changed in a
  backward-compatible way, or the break is deliberate, versioned and documented.
- Deletes and overwrites: intended, scoped by a correct WHERE or filter, and recoverable.

## Concurrency

- Shared mutable state guarded; no check-then-act races (use transactions, atomic updates, unique
  constraints, locks).
- Async: every promise awaited or deliberately detached with error handling; no fire-and-forget writes.
- Double submit and retries cannot create duplicates (idempotency keys, unique constraints).
- Locks always released; consistent lock order to avoid deadlocks.

## Security

- Input validated at the boundary (type, length, format, allowed values).
- SQL parameterised; no shell strings built from input; file paths kept under a base folder; outgoing
  URLs from users checked against an allowlist.
- Output escaped for its context (HTML, attributes, URLs, JSON in HTML).
- Every new route, job and query checks who may do it, including access to each object by id. A test
  shows that a user who may not do it is refused: a test of the allowed path proves nothing about the
  boundary.
- No secrets in code, tests, logs or error messages; new secrets read from the environment or a store.

## Dependencies and generated files

- New dependencies: needed (not a big package for a small job), maintained, licence acceptable, no known
  vulnerabilities.
- Read the lockfile diff, not only the manifest: how many packages came along, any install scripts
  (`preinstall`, `postinstall`), names one letter off a well-known package.
- A major version bump: its changelog read for breaking changes.
- Generated files: what generates them is in the diff, and they match it (regenerate and compare when
  that is cheap). Vendored code: where it came from, and which version.

## Tests

- A test that fails without the change and passes with it.
- Edge cases and error paths covered, not only the happy path.
- Tests assert outcomes, are independent of each other, and do not sleep or depend on real time.
- No `.only`, `.skip` or commented-out tests left behind; flaky tests not introduced.
- No test deleted, assertion loosened or snapshot re-recorded without a stated reason.

## Performance

- No query or request per item inside a loop (N+1); batch or join instead.
- Lists bounded or paginated; large files streamed, not loaded whole.
- Expensive work not repeated per request when it can be cached or hoisted, with invalidation.
- Indexes exist for new query patterns on large tables.
- Front end: no large new dependency for a small feature; images sized; no extra render loops.

## Readability and design

- Names say what things are and do; no misleading names left from an earlier version.
- Functions short enough to understand at once; one level of abstraction each.
- No duplicated logic that will drift apart; no premature abstraction either.
- Comments explain why, not what; no commented-out code; no TODO without an owner or issue.
- Consistent with the surrounding code: style, error handling, logging, file layout.

## Operability and docs

- Logs at the right level, with ids that let someone trace a request; no noisy logging in hot loops.
- Metrics or health checks updated when behaviour changes.
- Config and environment variables documented, with safe defaults.
- User-visible changes reflected in the docs, help text, translations and changelog.

## Written by an AI

- Every function, method, option, environment variable and config key it uses exists in the installed
  version.
- Tests written from the request. A test written by reading the code agrees with the code even when both
  are wrong.
- No dependency added unasked; no pattern copied from an old version of a library.
- Comments, commit messages and the description claim only what the code does.
- No changes nobody asked for.

## Front end specifics

- States: loading, empty, error, disabled; no layout jump when data arrives.
- Keyboard and screen reader basics: real buttons and links, labels, focus visible.
- Works at phone width; long text and translations do not break the layout.
- No secrets or internal URLs shipped in the bundle.
