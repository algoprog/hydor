---
name: web-app-qa
description: Use when asked to test a web app or site by hand like a demanding user, look for bugs before a release, check that its main flows work end to end, or write up the bugs found. Not for writing unit tests; see test-first.
category: coding
triggers: [test the app, test the site, test the website, qa this, qa pass, exploratory test*, manual test*, smoke test*, find bugs, bug report*, try to break, playwright]
---

# Web app QA

Test the app the way a demanding user would: list what people come to do, do each of those things for
real, then push on the edges until something gives. Every bug you report comes with steps someone else
can follow, what should happen, what did happen, and the evidence.

## 1. Scope and setup

- Which app, where, and which build: a local dev server, staging, or production. Note the commit or
  version you test, so each bug can be tied to it.
- Production: no real purchases, no messages to real customers, no changes to real data unless the user
  says so. Prefer test accounts, test payment cards and a staging copy.
- What matters most: a new feature, a release, a specific worry, and places that broke before (closed
  bug reports, recent fixes), since bugs cluster. Spend most of the time there.
- Sign-ins: ask with `request_secret` rather than in the chat, and type them with `browser_act` using
  `"secret": "NAME"`, so passwords never pass through the conversation.

## 2. List the main flows

Write the five to ten things people come to do, in their words, each as start, steps and expected end:
"sign up with an email, confirm it, land on the dashboard"; "add two items, apply a coupon, pay, see the
confirmation and get the email". Add the flows the latest change touches. This list is the test plan and
the outline of the report.

## 3. Walk each flow carefully

- With the app's browser (a real Chromium the user can watch): `browser_open` the page (a page on
  localhost asks the user's permission first), `browser_act` to click, type, choose and press keys by the
  element numbers in the outline, `browser_read` to read the page, find text, or take a screenshot.
- Or drive it with Playwright (step 5), or both: the browser tools to explore, Playwright to repeat.
- At each step, check that the result is right (amounts, names, dates, totals), the page says what
  happened, nothing jumps or flickers, and the address, title and Back button behave.
- Watch for silent failures: errors in the console, requests failing with 4xx or 5xx, data saved wrongly
  but shown rightly (reload to check). In DevTools: the Console, and the Network panel filtered to
  failed requests. A flow that "works" while throwing errors is a bug.
- A success message proves only that the message appeared. Check the effect itself: reload, look from
  another session or account (or through the API), check it happened exactly once (one order, one
  email, one charge), and that nothing else changed (another user's data, other records).
- When nothing says what should happen, judge against the previous version, the same kind of feature
  elsewhere in the app, what its help or marketing promises, comparable apps, and standards (WCAG for
  accessibility). Say which one you used when you report.

## 4. Push on the edges

Then try to break it. The full list is in `references/edge-cases.md`; the usual winners:

- **Input:** empty, only spaces, very long (500+ characters), accents (`Zoë Ñúñez`), emoji, right-to-left
  text, `<b>bold</b>` and `<script>` as text, quotes (`O'Brien`), leading zeros, zero, negative, huge
  numbers, a decimal comma, 29 February, other time zones.
- **Actions:** double-click submit, submit twice quickly, click while loading, Enter instead of click,
  Back after submitting, reload halfway, two tabs at once, a deep link straight into step 3, a session that
  expires mid-flow.
- **Conditions:** a slow network (DevTools throttling), offline, a failing API, a big account (1,000
  rows), a brand-new empty account.
- **Screens:** phone width (390px), tablet, 200% zoom, keyboard only (Tab, Enter, Escape), dark theme.
- **Permissions:** a user without rights opening a page by its address; another user's id in the URL.

## 5. Automate what you will repeat

For flows worth re-running, a short Playwright test that also fails on console errors and server errors:

```ts
import { test, expect } from '@playwright/test';

test('checkout with a coupon', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('response', (r) => { if (r.status() >= 500) problems.push(`${r.status()} ${r.url()}`); });

  await page.goto('http://localhost:3000/shop');
  await page.getByRole('button', { name: 'Add to cart' }).first().click();
  await page.getByRole('link', { name: 'Cart' }).click();
  await page.getByLabel('Coupon').fill('SAVE10');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('10% off')).toBeVisible();
  expect(problems).toEqual([]);
});
```

- `npx playwright codegen <url>` records a flow as code; `npx playwright test --headed` shows it running;
  `npx playwright test --trace on` then `npx playwright show-trace <trace.zip>` replays a failure step by
  step.
- Slow API: `await page.route('**/api/**', async (route) => { await new Promise((r) => setTimeout(r,
  3000)); await route.continue(); })`. Offline: `await page.context().setOffline(true)`. Phone size:
  `test.use({ viewport: { width: 390, height: 844 } })`.
- Wait with the assertions that retry by themselves (`await expect(locator).toBeVisible()`,
  `toHaveText`, `toHaveURL`), never with fixed pauses (`page.waitForTimeout`).
- A flaky test: run it alone several times (`npx playwright test <file> --repeat-each=5 --workers=1`)
  and read the trace. Usually a locator matched nothing yet, matched two things, or caught an element
  being redrawn: fix the locator, not the timing. A failing test is a finding until shown otherwise;
  never change its expected result, or skip it, to get a green run.
- Accept new screenshots or snapshots (`--update-snapshots`) only after looking at what changed.
- An accessibility scan: `npm i -D @axe-core/playwright`, then in a test
  `const { violations } = await new AxeBuilder({ page }).analyze();` (`AxeBuilder` is that package's
  default export). Report the `critical` and `serious` ones as bugs.

## 6. Report each bug so it can be fixed

One bug per report, using `references/bug-report.md`:

- **Title:** what is wrong, and where. "Coupon applied twice when Apply is double-clicked."
- **Environment:** address, build or commit, browser, screen size, account used.
- **Steps:** numbered, from a known starting point, as few as reproduce it.
- **Expected** and **actual**, one line each. Write what you saw, not a guess at the cause ("Save returns
  500", not "the backend is broken"); a suspected cause goes under Notes, marked as a guess.
- **Evidence:** a screenshot (`browser_read` with `kind: "screenshot"`, or `ui_screenshot` with
  `phase: "check"`), the console error text, the failing request (method, address, status, response).
- **Severity:**

| Severity | Meaning |
| --- | --- |
| Critical | Data loss, a security hole, wrong payments, or a main flow blocked for everyone |
| High | A main flow broken for some users, or with no workaround |
| Medium | Wrong behaviour with a workaround; confusing errors |
| Low | Cosmetic issues, typos, small layout problems |

Reproduce each bug twice before reporting it; if it is intermittent, say how often it happened.

## 7. Sum up

Lead with the verdict (ready or not, and why), then the bugs by severity, then what you tested and what
you did not (flows, browsers, devices), so the gaps are visible. Remove test data and accounts you made
unless the user wants them kept (see clean-up).

## Pitfalls

- Testing only the happy path you were shown.
- "It doesn't work" with no steps, or several bugs in one report.
- Missing silent failures: console errors, failed requests, data that is wrong after a reload.
- Trusting a success message without checking that the change really happened, and only once.
- Real purchases, real emails or real customer data touched while testing production.
- Calling the app ready without saying what was not tested.
- Passwords or tokens written into scripts, screenshots or reports.
