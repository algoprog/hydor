# Watch tasks: calls and prompts

Each example is a `schedule_task` call: `name`, `schedule` and `prompt`. Times are in the person's
time zone. The person sees a card and confirms; their answer comes back as a message.

The shapes of `schedule`:

- `{ "kind": "watch", "minutes": 60, "watch": { … } }`: a check without a model every so many
  minutes (15 if left out), waking the agent only when something changed. `watch` is one of:
  - `{ "kind": "page", "url": "…", "match": "Price" }`: only the lines with that text (and the line
    before and after each); or `"selector": "main .price"` for a part of the page.
  - `{ "kind": "json", "url": "…", "path": "data.items[0].price", "op": "lt", "value": "100" }`: `op`
    is changed (the default), eq, ne, gt, lt or contains. A condition wakes the agent when it starts
    to hold, not again while it holds.
  - `{ "kind": "feed", "url": "…" }`: each new item of an RSS or Atom feed.
  - `{ "kind": "folder", "path": "/home/sam/Invoices", "pattern": "*.pdf" }` (a full path) and
    `{ "kind": "command", "command": "…" }`.
- `{ "kind": "every", "minutes": 120 }`, `{ "kind": "daily", "time": "08:00", "days": [1, 2, 3, 4, 5] }`
  (0 is Sunday) or `{ "kind": "cron", "cron": "0 9 * * 1" }`: an agent run each time.

What a watcher saw reaches the run as quoted data after the prompt. A run reads its notes first
(`task_notes`) and ends with `report_outcome`: `done` and a one-line summary when there is something
to tell (that line is the notification), `silent` when there is not.

## The notes, kept short

```text
last: 329.00 EUR, 2026-11-03 14:00
alert: active since 2026-11-04 (at or below 299)
reported: https://example.com/a, https://example.com/b
stop after: 2026-12-03
```

## A price on a shop's page

```json
{
  "name": "Price watch: Sony WH-1000XM6",
  "schedule": { "kind": "watch", "minutes": 60,
    "watch": { "kind": "page", "url": "https://shop.example.com/sony-wh-1000xm6", "match": "€" } },
  "prompt": "The price area of the Sony WH-1000XM6 page at shop.example.com changed; what the watcher saw is below. Read this task's notes first. Find the current price of the BLACK version with delivery included; if what the watcher saw is unclear, read the page with read_page. If it is 299 EUR or less and no alert is active, report done with one line: the new price, the last price, and the link; then mark the alert active in the notes. If it is above 305 EUR, clear the alert. If the price did not really change (another colour, a banner, a layout change), report silent. Always update the notes with the price and the time. After 2026-12-03, report done with 'The watch has ended; you can delete this task.'"
}
```

## Back in stock

```json
{
  "name": "Back in stock: trail shoes, size 42",
  "schedule": { "kind": "watch", "minutes": 30,
    "watch": { "kind": "page", "url": "https://shop.example.com/trail-shoe", "selector": ".stock-status" } },
  "prompt": "The stock status on the trail shoe page changed; what the watcher saw is below. Check with read_page whether size 42 can be added to the basket now. If it can and the notes do not say an alert was already sent, report done with one line and the link, and note the alert. If it is still out of stock, or only other sizes came back, report silent. Never buy anything."
}
```

Test first that a plain fetch shows the stock text (`read_page`): if the shop draws it with
JavaScript, the watcher will not see it. Then use the shop's own "email me when available" button, or
a repeating task that opens the page with `browser_open` and `browser_read`.

## A number crossing a line (an API, no key)

```json
{
  "name": "Euro above 1.15 dollars",
  "schedule": { "kind": "watch", "minutes": 60,
    "watch": { "kind": "json", "url": "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD",
               "path": "rates.USD", "op": "gt", "value": "1.15" } },
  "prompt": "The euro went above 1.15 US dollars (what the watcher saw is below). Report done with one line: the rate and the date it is for."
}
```

The watcher only wakes the agent when the rate crosses the line, so there is nothing to remember
between runs.

## News about a company

A feed watcher on a news search, cheap between items:

```json
{
  "name": "News: Acme Robotics",
  "schedule": { "kind": "watch", "minutes": 120,
    "watch": { "kind": "feed", "url": "https://news.google.com/rss/search?q=%22Acme+Robotics%22&hl=en-GB&gl=GB&ceid=GB:en" } },
  "prompt": "New items appeared in a news search for \"Acme Robotics\"; they are below. Read this task's notes: the stories already reported. Keep only items that are really about Acme Robotics (not another company with a similar name) and that are new (the same story from several outlets counts once). Report done only for news that matters to an investor: results, funding, a takeover, leadership changes, lawsuits, a major product, job cuts. Give one line per story with its link, at most five. Otherwise report silent. Add the reported stories' titles and links to the notes, keeping the last 50."
}
```

Or one agent run a day, which can weigh several sources:

```json
{
  "name": "Daily news: Acme Robotics",
  "schedule": { "kind": "daily", "time": "08:00", "days": [1, 2, 3, 4, 5] },
  "prompt": "Look for news about Acme Robotics since the date in this task's notes (web_search with categories news and a from date; also the company's own newsroom). Drop anything already listed in the notes. If there is something new and significant (results, funding, takeover, leadership, lawsuits, major products, job cuts), report done with up to five lines, each with its source link. If not, report silent. Then write today's date and the new links into the notes, keeping the last 50 links."
}
```

## A new release of a project

```json
{
  "name": "New Node.js releases",
  "schedule": { "kind": "watch", "minutes": 360,
    "watch": { "kind": "feed", "url": "https://github.com/nodejs/node/releases.atom" } },
  "prompt": "A new release of Node.js appeared (below). Skip alpha, beta and release-candidate versions: report silent for those. For a real release, read its release notes (read_page on its link) and report done with one line: the version, whether it is a long-term support line, and anything that could break an existing app."
}
```

## A page whose wording matters (terms, a policy, a job listing)

```json
{
  "name": "Changes to the supplier's terms",
  "schedule": { "kind": "watch", "minutes": 720,
    "watch": { "kind": "page", "url": "https://supplier.example.com/terms", "selector": "main" } },
  "prompt": "The supplier's terms page changed; the lines that appeared and went are below. Say what changed in plain words and whether it affects us (prices, payment terms, delivery, liability, cancellation). If the change is only formatting, a date or a typo, report silent. Otherwise report done with one line, and keep the old and new wording in the notes."
}
```

A selector has to exist on that page: if the watcher's Test says "Nothing on the page matches
main", pick another part (`http_request` on the address shows the page's HTML), or use `match`
with a phrase that is always near the part you care about.

## A value behind a key

A page or watcher cannot use the person's keys. A repeating run can, through the vault:

```json
{
  "name": "Stock of item 1234",
  "schedule": { "kind": "every", "minutes": 120 },
  "prompt": "Call GET https://api.example.com/v1/items/1234 with http_request (auth: EXAMPLE_API_KEY) and read its stock level. Read this task's notes for the last level and whether a low-stock alert is active. If the stock is 10 or fewer and no alert is active, report done with the level and mark the alert active. If it is above 15, clear the alert. Otherwise report silent. Write the level and time into the notes."
}
```

If the key is not in the vault yet, ask for it with `request_secret` before proposing the task
(`list_connections` shows which keys are saved).

## Before handing it over

- Run the check once by hand and show the person what it sees now.
- Offer a **Test run** from the task's form, or **Run now** once it is saved (for a watcher, that
  runs the agent with what the watcher sees now).
- Say in a line what will make it alert, what will keep it quiet, and how to stop it.
