---
title: The blog's style guide
description: Every element a post can use, and one small figure that shows the shared runtime: the page that the posts' writers check their work against. Not published.
date: 2026-11-24
tags: Draft, Style guide
cover: /img/app-start.webp
coverAlt: Hydor's start page: the window of the app in its dark theme, with a message box and the projects beside it.
order: 99
---

This draft is built only with `--drafts`. It shows what each piece of a post looks like, so a writer can see whether a
paragraph, a figure or a table is doing its job. Paragraphs are plain words, in the second person, in short sentences:
[a link](/docs/) is in the water colour and underlined only under the pointer, **bold** marks the name of a button, *italics* are rare, and
`inline code` is for file names and settings, such as `HYDOR_SITE_OUT`.

A second paragraph, to show the spacing between two: the text column is 720 pixels wide, set at 18 pixels with a
generous line height, and 17 on a phone. Press <kbd>Ctrl</kbd> <kbd>K</kbd> to search the docs.

## Headings and parts

Each `##` heading makes a part of the post and a line in the **On this page** list at the right (on a wide screen).
Its address comes from its words: `## Headings and parts` is `#headings-and-parts`. Hover a heading to see its link.

### A smaller heading

A `###` heading is a part of a part. It has an address too, but is not in the list.

#### The smallest heading

Rarely needed. Prefer a list or two paragraphs.

## Lists and a quote

A bulleted list, for a few short points:

- The first point is a sentence, and ends with a full stop.
- The second point is longer, so you can see how a line that wraps lines up with the text of its own item and not with the marker.
- A third, with a nested list:
  - one inside,
  - and another.

A numbered list, for steps:

1. Open **Settings → Memory**.
2. Turn on search by meaning.
3. Ask an agent what it remembers.

> A quotation, or a sentence the post wants you to stop and read. It has the water's gradient down its left side.

<aside class="callout"><p>A callout is a one-line aside: a caveat, a number to remember, a pointer to the docs. Write it as an <code>aside</code> with the class <code>callout</code>.</p></aside>

## Code

A block of code has its language, a **Copy** button and a scrollbar when a line is long:

```bash
npm ci
HYDOR_SITE_OUT=/tmp/site-mine node website/build.mjs --langs en --posts meet-hydor --serve 4410
```

```json
{ "model": "hydor-suggest-49m", "parameters": 48800000, "languages": 200 }
```

The figure line, shown here in a code block so it stays text (on its own line, with a blank line before and after, it
puts the file in):

```
<!-- figure: demo -->
```

## A picture and a table

A picture on a line of its own is a figure, its title the caption:

![Hydor's start page in the dark theme, with a message box and the projects beside it.](/img/app-start.webp "Hydor's start page. A picture is rounded, has a thin border, and its caption is centred and muted.")

A table scrolls on a phone and keeps its header:

| Piece | Used for | Written as |
|---|---|---|
| Callout | One line aside | `<aside class="callout">` |
| Stats | A row of big numbers | `<div class="stats">` |
| Chip | A small label | `<span class="chip">` |
| Key | A key on the keyboard | `<kbd>Tab</kbd>` |

## Numbers, chips and keys

Numbers that matter go in a row. Each counts up the first time you see it (and shows its value at once when your
system asks for reduced motion):

<div class="stats"><div class="stat"><b data-count-to="48.8" data-suffix="M">48.8M</b><span>parameters in the model</span></div><div class="stat"><b data-count-to="200">200</b><span>languages</span></div><div class="stat"><b data-count-to="10.5" data-suffix="%">10.5%</b><span>keystrokes saved (an example)</span></div></div>

Chips label things in a line: <span class="chip">Default</span> <span class="chip" style="--c: var(--w2)">Water</span> <span class="chip" style="--c: var(--ok)">Works</span> <span class="chip" style="--c: var(--amber)">Careful</span> <span class="chip" style="--c: var(--err)">Fails</span> <span class="chip" style="--c: #b9a9ff">Codex</span>.

## A figure

A figure lives in its own file and is put in as it is. This one runs a short sequence with `fig.wait`, moves a marker
with `fig.loop`, has buttons that say their state, and stands still under reduced motion. Scroll it off the screen and
it stops.

<!-- figure: demo -->

A wide figure breaks out of the text column, to about 1080 pixels:

<!-- figure: wide -->

## The end

The page adds the panel to try Hydor and the links to other posts by itself: a post ends where its text ends.
