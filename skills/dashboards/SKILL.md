---
name: dashboards
description: Use when someone wants a chart or a dashboard to come back to (sales, a budget, habits, project status, prices), or asks which chart suits their data or why one misleads. Not for a one-off question about data (data-analysis).
category: data
triggers: [dashboard*, make a chart, make a graph, chart this, chart of, graph of, plot this, bar chart, line chart, pie chart, visualis*, visualiz*]
---

# Dashboards and charts

A chart answers one question at a glance; a dashboard is a handful of such answers that someone
checks again and again. Decide what the viewer needs to see, pick the chart that shows it most
directly, label it so it reads without you, keep it honest, and build it where it will be used.

## 1. What question, for whom, how often

- The decisions it supports, and the three to seven numbers that matter for them, each with its
  target or the line where it turns bad.
- Who looks, and how: a glance on a phone each morning, or a monthly review on a laptop.
- The time span and the step (days, weeks, months); where the data comes from and how fresh it must
  be.
- One chart for a report, or a dashboard to come back to? The answer decides where to build it (5).

## 2. Choose the chart

| To show | Use | Avoid |
| --- | --- | --- |
| Change over time | a line (many points); columns (a few periods) | pies; stacked areas with many series |
| Comparing categories | horizontal bars, sorted by value | pies with more than three slices; 3D |
| Parts of a whole | a stacked or 100% bar; a pie only for two or three parts | pies side by side to compare groups |
| Spread of values | a histogram, a box plot, dots | an average on its own |
| Two measures together | a scatter plot, with a trend line if it helps | two y-axes |
| Ranking | sorted bars | an unsorted list |
| One number against a target | a big number with its change and a small trend line; a bullet bar | a dial |
| Places | a map coloured by rates, not raw counts | a map of counts that only shows where people live |
| Exact values to look up | a table | a chart nobody can read values from |

## 3. Make it readable

- **Title says the finding:** "Costs rose 12% in Q3, mostly travel". A subtitle gives what, units,
  period and source.
- **Label axes with units**; label lines directly at their ends instead of a legend far away; round
  numbers (12.4k, not 12,431.27).
- **Sort categories** by value, unless they have a natural order (months, age groups).
- **Few colours:** grey for context, one accent for what matters, the same colour for the same thing
  on every chart. Colour-blind safe: never red against green alone; add labels or patterns so colour
  is not the only clue.
- **Less ink:** light or no gridlines, no 3D, no shadows, no decimals nobody needs.
- **Status colours** for good and bad, not for up and down: rising costs are bad news in green.

## 4. Keep it honest

- Bars start at zero. A line may start elsewhere, but do not stretch a small change into a cliff.
- The same scale on charts placed side by side; no two y-axes unless there is no other way, and
  then both clearly labelled.
- Rates or per-person figures when groups differ in size; money adjusted for inflation over many
  years when it matters.
- Show uncertainty and small samples (n = 12); do not join points across missing data; mark a
  period that is not over yet ("November so far").
- Time on the x-axis at even steps; a start date chosen for the data, not for the story.
- Sizes drawn by area, not by width, for bubbles and pictures.

## 5. Build it in the right place

- **A quick look in the conversation:** `show_html`, a self-contained page with the data inside it.
  It cannot reach the app or the user's files, and keeps nothing between views.
- **A dashboard to keep:** `save_page`. It sits in the Library, opens at its own address (a phone can
  add it to its home screen), and keeps data with `hydor.storage`: entries the person types in,
  their settings, the last data fetched as a cache.
- **Live data:** a page can fetch public sources that allow it (web APIs that send CORS headers);
  test that the fetch works from the page. A page runs without the app's sign-in and anyone with its
  address can read its code, so never put a key or a password in a page. For data behind a key, an
  agent fetches it on a schedule (`schedule_task`, with `http_request` using the key saved in the
  vault) and saves a new version of the page with the fresh data in it (`save_page` with the page's
  id).
- **In a spreadsheet:** `save_sheet` has no charts; an .xlsx with charts comes from the spreadsheets
  skill.
- **A picture for a report or slides:** matplotlib (the data-analysis skill's data-python); or
  chart slides with `save_slides`.
- **An app's answer:** the app's own view, with its plot and chart elements (the app-builder skill).

On a page, use the page kit so it fits the app in light and dark: `<body class="n-page">`, colours
from its variables (`--n-c1` to `--n-c6` for series, `--n-fg`, `--n-muted`, `--n-line`, and
`--n-ok`, `--n-warn`, `--n-err` for status), which a chart library reads with
`getComputedStyle(document.body)`. Libraries load from cdn.jsdelivr.net, unpkg.com or
cdnjs.cloudflare.com. A tested skeleton (number tiles, a line chart, a sorted bar chart, cached
fetch, "last updated") is in `references/dashboard-page.md`.

## 6. Lay out a dashboard

- Top row: three to five number tiles (the value, its change against a stated period, coloured by
  good or bad, and the target if there is one).
- Then the main trend, then the breakdowns, then the detail table.
- Filters (date range, region) only when they are needed, with sensible defaults.
- Always show when the data was last updated and where it came from, and say so plainly when a
  fetch fails ("Couldn't load today's prices; showing 3 Nov, 10:42").
- On a phone everything stacks in one column, and nothing important hides in a hover.

## 7. Check before handing over

- Three or four numbers on screen compared with the source data.
- Totals add up; dates and time zones are right; the latest period is complete or marked.
- Labels readable in light and dark, on a narrow screen, with nothing cut off.
- For a live page: what it shows when the fetch fails or returns nothing.

## Pitfalls

- A chart that answers no question; twenty charts where five would do.
- Pies with many slices, 3D, two y-axes, bars that do not start at zero.
- Rainbow colours, or red and green as the only signal.
- Units missing; legends far from what they label.
- A key or password written into a page.
- No "last updated", so old data passes for new.
