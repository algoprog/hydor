---
name: diagrams
description: Use when a diagram would explain something better than words (a flowchart, sequence diagram, org chart, timeline, mind map, architecture or data-flow diagram), or when asked to draw how something works. Not for charts of numbers.
category: creative
triggers: [diagram, flowchart, flow chart, sequence diagram, org chart, mind map, mindmap, mermaid, architecture diagram, data flow, draw how, visualise the process]
---

# Diagrams

A good diagram answers one question at a glance: what happens next, who talks to whom, what belongs
where. Decide the question, write the content in words, draw it with Mermaid (text that a script
turns into a diagram), then look at the result and fix what is hard to read. Draw it by hand in SVG
when Mermaid cannot put things where the meaning needs them. Charts of numbers (bars, lines, pies)
are not diagrams: see the dashboards skill. A project schedule with owners and dates is the
project-plan skill's; a mind map of fresh ideas starts with the brainstorming skill.

## 1. Pick the question, then the type

| The question | Diagram | Mermaid |
| --- | --- | --- |
| What happens, in what order, with which decisions? | Flowchart | `flowchart TD` |
| Who sends what to whom, over time? | Sequence diagram | `sequenceDiagram` |
| Who reports to whom; what contains what? | Org chart, tree | `flowchart TD` |
| When do things happen? | Timeline; with durations and dates, a Gantt chart | `timeline`, `gantt` |
| What ideas hang off a topic? | Mind map | `mindmap` |
| How do the parts of a system connect, where does data go? | Architecture or data-flow diagram | `flowchart LR` with `subgraph`, or `architecture-beta` |
| Which states can a thing be in? | State diagram | `stateDiagram-v2` |
| How are the records of a database related? | Entity-relationship diagram | `erDiagram` |

Mermaid also draws class, journey, quadrant, Sankey, Kanban and more; the syntax of each is at
mermaid.js.org. Examples of the common ones, all tested, are in `references/mermaid.md`.

## 2. Write the content before the drawing

- List the things (boxes) and the relations (arrows) in plain words. Check them against the source:
  the process document, the code, what the user said. Mark what you inferred, and ask about it.
- Keep it small: about 15 boxes at most. More than that, split it: an overview, then a detail
  diagram for each part.
- Labels: two to five words; nouns in boxes ("Finance team"), verbs on arrows ("approves"); the
  user's own terms, spelled the same way every time.
- One reading direction. The main path runs straight; exceptions and loops branch to the side.
- Shapes and colours only where they mean something: rounded ends for start and finish, a diamond
  for a decision, a cylinder for stored data. Explain any colour in a legend, and never let colour
  carry meaning alone.

## 3. Write it in Mermaid

- Node ids short and without spaces; the label in brackets: `pay["Pay by card (or cash)"]`. Quote
  labels that contain punctuation.
- A node or label called `end` breaks flowcharts: write `End` or `Finish`.
- Arrow labels: `A -- approves --> B` or `A -->|approves| B`. Line breaks in a label: `<br>`.
- Group with `subgraph Name ... end`. Comments start with `%%`.
- Add `accTitle:` and `accDescr:` lines: screen readers read them.
- Mermaid 12 lays flowcharts out with ELK by default. If the result looks tangled, reorder the lines
  (Mermaid places nodes roughly in the order they appear), or try the older dagre layout with a
  config block at the top of the diagram (shown in the reference).
- In an HTML page, write `&lt;` and `&amp;` for `<` and `&` inside labels; `-->` is fine as it is.

## 4. Show it, keep it

- `show_html` with the page in `references/mermaid.md`: it loads Mermaid from a CDN, takes the app's
  colours, gives each diagram a card, and shows a readable error if the text has a mistake. Give the
  page a title and a one-line caption that says what to look at.
- `save_page` when the user will come back to it, or the diagram documents something lasting.
- In Markdown that renders Mermaid (GitHub, GitLab, many wikis and editors), a fenced block with
  the language `mermaid` is enough.
- An image file: `npx -p @mermaid-js/mermaid-cli mmdc -i diagram.mmd -o diagram.svg` (it downloads
  a browser the first time; say so), or take a screenshot of the page.

## 5. Look at it, then fix it

Never hand over a diagram you have not looked at. Save the page as an HTML file and look at it with
`ui_screenshot` (phase `check`, viewport `both`), or open it in the browser with a screenshot.

- **Too small to read:** a wide left-to-right diagram shrinks on a phone. Switch to top-down,
  shorten labels, or split it.
- **Crossing or tangled lines:** reorder the declarations, group with subgraphs, change the
  direction, or try the other layout.
- **Cut-off or overlapping labels:** shorten them, or break them with `<br>`.
- **Wrong:** an arrow pointing the wrong way, a missing step. Compare it once more with the source.
- **A syntax error:** the page shows Mermaid's message with the line; fix that line and look again.

Under the diagram, put a short text version (a numbered list of the steps, or the main
relations). It helps on small screens, in search, and for people using screen readers.

## 6. When Mermaid is not enough: SVG by hand

Write SVG yourself when positions carry meaning or must be exact: a layered stack, a floor plan, a
labelled illustration, a timeline drawn to scale, a diagram in the user's brand.

- A `viewBox` and a grid (every position a multiple of 8 or 16), so things line up.
- Text at least 12 units high in a 600 to 800 unit wide drawing, left to right, never rotated.
- Colours from the page kit's variables (`var(--n-fg)`, `var(--n-line)`, `var(--n-accent)`,
  `var(--n-c1)` to `var(--n-c6)`), so it follows the app's light and dark themes.
- Arrows with a `<marker>`; `<title>` and `<desc>` for accessibility; `width="100%"` so it scales.

A tested template is in `references/svg.md`. For very large graphs (hundreds of nodes), use Graphviz
(`dot -Tsvg graph.dot -o graph.svg`) when it is installed, and expect to simplify the graph.

## Pitfalls

- One diagram trying to show everything.
- Decorative colours, icons and shadows that carry no meaning.
- Unlabelled arrows where the relation is not obvious.
- Rendering without looking.
- A diagram that disagrees with the text next to it.
