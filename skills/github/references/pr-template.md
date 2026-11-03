# A pull request description

Use the repository's own template when it has one (`.github/pull_request_template.md`). Otherwise:

```markdown
## What and why

Retrying a failed payment created a second invoice, because the retry called `create_invoice` again
instead of reusing the first one. Customers saw two invoices for one order (#412).

This change looks up the order's existing draft invoice before creating one, and makes the
payment retry send an idempotency key to the payment provider.

## How it was tested

- New test `test_retry_reuses_invoice`: fails before the change, passes after.
- Full suite: 312 passed.
- By hand on staging: a declined card, then a retry, gives one invoice (screenshot below).

## Risk and rollout

Touches invoice creation for every order. No database change. If something goes wrong, revert this
pull request; no data needs fixing.

Fixes #412
```

## What makes it good

- **The first lines say what changed and why**, in words a reviewer understands without opening
  the code. Lists of files belong in the diff, not the description.
- **Evidence of testing**: which tests, what was run, what was checked by hand.
- **Risk**: what it touches, what could break, how to undo it.
- **Small**: one topic. Split refactors and formatting from behaviour changes.
- **Visible changes**: before and after screenshots.
- **Links**: the issue it fixes (`Fixes #123` closes it on merge), related pull requests.

## Review comments that help

- "Blocking: `amount` is in cents here but in euros in `refund()` (line 88), so refunds come out 100
  times too large. Convert in one place, maybe `Money.from_cents`?"
- "Optional: this loop could be `sum(line.total for line in lines)`."
- "Question: is it intended that drafts older than 30 days are skipped?"
- "Nice: the new test reproduces the bug exactly."
