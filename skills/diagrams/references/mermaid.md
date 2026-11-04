# Mermaid: a page that renders it, and tested examples

## The page

Tested with Mermaid 12 in a browser. Each `<pre class="mermaid">` becomes a diagram in its own card.
The script turns the page kit's colours into the hex values Mermaid needs, so the diagrams follow
the app's theme; a mistake in one diagram shows as a message with the line, and the others still
render. Keep `deterministicIds` and the single `mermaid.run` call: with Mermaid's default ids (the
time in milliseconds), or one call per diagram, two diagrams can get the same id and draw on top of
each other.

```html
<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>How an expense claim is approved</title>
<style>
  .diagram { background: var(--n-card, #fff); border: 1px solid var(--n-line, #ddd);
             border-radius: var(--n-radius, 12px); padding: 16px; margin: 14px 0; overflow-x: auto; }
  .diagram svg { max-width: 100%; height: auto; }
  .err { color: var(--n-err, #b00); white-space: pre-wrap; font-family: var(--n-mono, monospace); }
</style></head>
<body class="n-page">
<h1>How an expense claim is approved</h1>
<p class="n-muted">Claims over 500 euros go through Finance first.</p>
<div class="diagram"><pre class="mermaid">
flowchart TD
  accTitle: Expense claim approval
  accDescr: How an expense claim moves from submission to payment.
  A([Employee submits claim]) --> B{Over 500 euros?}
  B -- No --> C[Line manager approves]
  B -- Yes --> D[Finance reviews]
  D --> C
  C --> E[(Payroll system)]
  E --> F([Paid with next salary])
</pre></div>
<ol>
  <li>The employee submits the claim.</li>
  <li>Claims over 500 euros are reviewed by Finance first.</li>
  <li>The line manager approves; payroll pays it with the next salary.</li>
</ol>
<script type="module">
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@12/dist/mermaid.esm.min.mjs';
const css = getComputedStyle(document.body);
const ctx = document.createElement('canvas').getContext('2d');
const hex = (name, fallback) => {            // a CSS colour, as the hex Mermaid needs
  const v = css.getPropertyValue(name).trim();
  if (!v) return fallback;
  ctx.fillStyle = fallback; ctx.fillStyle = v;
  return ctx.fillStyle.startsWith('#') ? ctx.fillStyle : fallback;
};
mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  deterministicIds: true,
  theme: 'base',
  look: 'classic',
  fontFamily: css.getPropertyValue('--n-font') || 'system-ui, sans-serif',
  themeVariables: {
    background: hex('--n-card', '#ffffff'),
    primaryColor: hex('--n-soft', '#eeeeee'),
    primaryTextColor: hex('--n-fg', '#111111'),
    primaryBorderColor: hex('--n-accent', '#555555'),
    lineColor: hex('--n-muted', '#666666'),
    secondaryColor: hex('--n-bg', '#f6f6f6'),
    tertiaryColor: hex('--n-card', '#ffffff'),
    fontSize: '15px'
  }
});
for (const el of document.querySelectorAll('pre.mermaid')) {   // a readable message for a mistake
  try {
    await mermaid.parse(el.textContent);
  } catch (e) {
    const p = document.createElement('pre');
    p.className = 'err';
    p.textContent = 'This diagram has a mistake:\n' + (e.message || e);
    el.replaceWith(p);
  }
}
await mermaid.run({ querySelector: 'pre.mermaid', suppressErrors: true });   // one call: unique ids
</script>
</body></html>
```

To check it yourself, write the page to a file and look at it with `ui_screenshot` (phase `check`).

## Examples (each renders in Mermaid 12)

Sequence, with a branch and a note:

```
sequenceDiagram
  autonumber
  actor U as Customer
  participant W as Website
  participant P as Payment provider
  U->>W: Pays for order
  W->>P: Charge card
  alt Card accepted
    P-->>W: Payment confirmed
    W-->>U: Confirmation email
  else Card declined
    P-->>W: Declined
    W-->>U: Please try another card
  end
  Note over W,P: All traffic over HTTPS
```

Org chart (top-down flowchart; emphasis without colour):

```
flowchart TD
  CEO["Maria Silva<br>Chief Executive"]
  CEO --> CTO["Jon Park<br>Technology"]
  CEO --> CFO["Ana Costa<br>Finance"]
  CEO --> COO["Lee Wong<br>Operations"]
  CTO --> D1[Platform team]
  CTO --> D2[Data team]
  COO --> D3[Support]
  classDef lead font-weight:bold,stroke-width:3px
  class CEO lead
```

Timeline (periods evenly spaced; for dates to scale use `gantt`):

```
timeline
  title Office move, 2027
  January : Lease signed
  February : Fit-out starts : IT cabling
  April : Furniture delivered
  May : Move weekend : First day in new office
```

Gantt chart:

```
gantt
  title Website relaunch
  dateFormat YYYY-MM-DD
  axisFormat %d %b
  section Design
    Wireframes      :done, w, 2027-01-04, 10d
    Visual design   :active, v, after w, 14d
  section Build
    Front end       :f, after v, 21d
    Content entry   :c, after v, 15d
  section Launch
    Launch          :milestone, after f, 0d
```

Mind map (indentation sets the levels):

```
mindmap
  root((Team offsite))
    Goals
      Plan next year
      Meet new hires
    Logistics
      Venue
      Travel
      Budget
    Agenda
      Day 1 workshops
      Day 2 outdoors
```

Data flow between parts of a system (left to right; becomes small on phones):

```
flowchart LR
  subgraph Browser
    UI[Web app]
  end
  subgraph Server
    API[API server] --> DB[(PostgreSQL)]
    API --> Q[[Job queue]]
    Q --> W[Worker]
  end
  UI -- HTTPS JSON --> API
  W -- sends --> Mail[/Email service/]
```

States:

```
stateDiagram-v2
  [*] --> Draft
  Draft --> Submitted: submit
  Submitted --> Approved: approve
  Submitted --> Draft: request changes
  Approved --> [*]
```

Database records and their relations:

```
erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ ORDER_LINE : contains
  PRODUCT ||--o{ ORDER_LINE : "appears in"
  CUSTOMER {
    int id PK
    string name
    string email
  }
```

Architecture with icons (`cloud`, `database`, `disk`, `internet`, `server`):

```
architecture-beta
  group cloud(cloud)[Cloud]
  service web(server)[Web server] in cloud
  service db(database)[Database] in cloud
  service store(disk)[File storage] in cloud
  web:R --> L:db
  web:B --> T:store
```

## Flowchart shapes

`A[Box]`, `A(Rounded)`, `A([Start or end])`, `A{Decision}`, `A[(Stored data)]`, `A[[Subprocess]]`,
`A[/Input or output/]`, `A((Circle))`. Arrows: `-->` solid, `-.->` dotted, `==>` thick, `---` a line
without a head, `~~~` an invisible link that only nudges the layout.

## The older layout, for one diagram

```
---
config:
  layout: dagre
---
flowchart TD
  A --> B
```

Spacing and wrapping for one diagram (spacing works only with dagre; wrapping with both layouts):

```
---
config:
  layout: dagre
  flowchart:
    nodeSpacing: 60
    rankSpacing: 80
    wrappingWidth: 320
---
flowchart LR
  A[Order received] --> B[Packed] --> C[Sent]
```

## Pitfalls, each tried in Mermaid 12

- **A box whose id starts with o or x, right after a link:** `dev---ops` draws a link with a circle
  end to a box called "ps" (`--o` and `--x` are link ends). Write `dev--- ops`, or `Ops`.
- **Spacing that does nothing:** `nodeSpacing` and `rankSpacing` are ignored by the default ELK
  layout; they work with `layout: dagre`, as above.
- **Labels wrapped into narrow boxes:** `wrappingWidth: 320` (above) keeps each line as written.
- **A subgraph's own `direction`** is ignored once a box inside it links to one outside it: plan the
  direction of the whole diagram instead.
- **Quotes and # inside a label:** write `#quot;` and `#35;` in a quoted label:
  `A["Say #quot;hello#quot; at #35;1"]`.
- **Activation bars in a sequence diagram:** `A->>+B: request` opens one on B and `B-->>-A: reply`
  closes it; every `+` needs its `-`.
- **Mermaid's C4 syntax** (`C4Context`, `C4Container`): experimental; flowcharts work better, as in
  `references/c4.md`.
- **Markdown made into PDF or Word without a browser** (Pandoc and most converters): a `mermaid` block
  comes out as code. Render it to an image first (mmdc, or a screenshot) and put the image in.
- **Documents and slides in the app** (`save_doc`, `save_slides`) do not draw Mermaid either: add the
  diagram as a picture, a PNG from mmdc or a screenshot.
