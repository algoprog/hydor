# Diagrams in SVG, by hand

For when positions carry meaning: a layered stack, a floor plan, a labelled illustration, a timeline
to scale, a diagram in a brand's style. Tested in a browser. It sits inline in an HTML page (for
`show_html` or `save_page`), so the page kit's colour variables reach it and it follows the app's
light and dark themes.

```html
<svg class="stack" viewBox="0 0 640 330" width="100%" role="img" aria-labelledby="stack-title stack-desc">
  <title id="stack-title">Layers of the shop's website</title>
  <desc id="stack-desc">A visitor's browser talks to a content delivery network, then a load balancer,
    then two app servers, which read and write one database.</desc>
  <style>
    .stack .layer { fill: var(--n-soft); stroke: var(--n-line); stroke-width: 1.5; }
    .stack .hot   { fill: var(--n-card); stroke: var(--n-accent); stroke-width: 2; }
    .stack text   { fill: var(--n-fg); font: 15px var(--n-font, system-ui, sans-serif); }
    .stack .note  { fill: var(--n-muted); font-size: 13px; }
    .stack .flow  { stroke: var(--n-muted); stroke-width: 2; fill: none; }
  </style>
  <defs>
    <marker id="stack-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7"
            orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" style="fill: var(--n-muted)"/>
    </marker>
  </defs>
  <!-- a row every 64 units; boxes 400 wide from x=40; notes from x=464 -->
  <rect class="layer" x="40" y="16"  width="400" height="48" rx="10"/>
  <text x="240" y="46" text-anchor="middle">Visitor's browser</text>
  <rect class="layer" x="40" y="80"  width="400" height="48" rx="10"/>
  <text x="240" y="110" text-anchor="middle">Content delivery network</text>
  <text class="note" x="464" y="110">pictures, scripts (cached)</text>
  <rect class="layer" x="40" y="144" width="400" height="48" rx="10"/>
  <text x="240" y="174" text-anchor="middle">Load balancer</text>
  <rect class="hot" x="40"  y="208" width="192" height="48" rx="10"/>
  <text x="136" y="238" text-anchor="middle">App server 1</text>
  <rect class="hot" x="248" y="208" width="192" height="48" rx="10"/>
  <text x="344" y="238" text-anchor="middle">App server 2</text>
  <text class="note" x="464" y="238">add more when busy</text>
  <rect class="layer" x="40" y="272" width="400" height="48" rx="10"/>
  <text x="240" y="302" text-anchor="middle">Database (orders, stock)</text>
  <text class="note" x="464" y="302">backed up nightly</text>
  <path class="flow" d="M 24 40 V 296" marker-end="url(#stack-arrow)" marker-start="url(#stack-arrow)"/>
</svg>
```

## Rules that keep it readable

- **Grid:** every coordinate a multiple of 8 (or 16). Rows the same height, gaps the same size.
  Work out the coordinates before writing, as the comment above does.
- **Text:** centred in its box (`text-anchor="middle"`, `y` at the box's middle plus about a third of
  the font size); at least 12 units high in a drawing 600 to 800 units wide; horizontal; short.
  SVG does not wrap text: split long labels into two `<text>` lines, or widen the box.
- **Colour:** only the kit's variables (`--n-fg`, `--n-muted`, `--n-line`, `--n-soft`, `--n-card`,
  `--n-accent`, `--n-c1` to `--n-c6` for categories). One accent for what matters most.
- **Names:** prefix classes and ids with the diagram's name (`stack-arrow`, `.stack .layer`): a
  `<style>` inside an SVG applies to the whole page, and two diagrams must not share an id.
- **Scaling:** `viewBox` plus `width="100%"`, no fixed pixel width; check it at phone width.
- **Accessibility:** `role="img"`, a `<title>` and a `<desc>` that says what the drawing shows.

## Saving it as a file

The same SVG works as a `.svg` file once the variables are replaced by colours (an SVG file opened
on its own does not know the page kit): replace each `var(--n-...)` with a hex colour, add
`xmlns="http://www.w3.org/2000/svg"` to the `<svg>` tag, and hand it over with `present_files`.
