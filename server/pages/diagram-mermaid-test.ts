// Script tests for Mermaid read into a diagram (shared/diagram-mermaid.ts): flowcharts (every bracket and Mermaid 11
// shape, words in quotes, Markdown, entity codes, each kind of link with its words, chains and &, subgraphs inside
// subgraphs, style, classDef and linkStyle), mind maps (the tree by indentation, its shapes, each branch's colour), class
// diagrams (members, generics, annotations, each relation and its cardinalities, namespaces), ER diagrams (crow's feet
// either way round, attributes and keys, aliases), state diagrams (a start and an end in each composite state, forks,
// choices, notes), sequence diagrams (lifelines, messages of each kind, a message to itself, activations, notes, blocks,
// every number in its place), the kinds it refuses, and Mermaid cut short, as it is while it streams in. It touches no
// data. Build and run in the worktree:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/pages/diagram-mermaid-test.ts
//   node dist/dev/diagram-mermaid-test.js
import { arrowFrom, CONTAINER_KINDS, isShapeKind, styleSet, type ShapeKind } from '../../shared/diagram.ts';
import type { SpecEdge, SpecNode, SpecPage } from '../../shared/diagram-spec.ts';
import { textWidth } from '../../shared/diagram-text.ts';
import { isMermaid, mermaidSpec } from '../../shared/diagram-mermaid.ts';

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};

const node = (p: SpecPage, id: string): SpecNode | undefined => p.nodes.find((n) => n.id === id);
const edge = (p: SpecPage, from: string, to: string): SpecEdge | undefined => p.edges.find((e) => e.from === from && e.to === to);
const errorOf = (t: string) => {
  try {
    mermaidSpec(t);
    return '';
  } catch (e) {
    return (e as Error).message;
  }
};
const width = (t: string) => Math.max(...t.split('\n').map((l) => textWidth(l, { size: 14 })));
const SUPPORTED = 'supported: flowchart, mindmap, class, ER, state and sequence diagrams.';

/** What is wrong with a page read: ids a diagram cannot keep, kinds of shape it does not have, parents and edges naming nodes not there, ends of no kind, numbers that are not numbers. */
function problems(p: SpecPage): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  for (const n of p.nodes) {
    if (!/^[\w.:-]{1,64}$/.test(n.id) || ids.has(n.id)) out.push(`id ${JSON.stringify(n.id)}`);
    ids.add(n.id);
    if (!isShapeKind(n.shape)) out.push(`${n.id}: shape ${n.shape}`);
    if (n.color !== undefined && !styleSet(n.color)) out.push(`${n.id}: colour ${n.color}`);
    for (const k of ['x', 'y', 'w', 'h'] as const) if (n[k] !== undefined && !Number.isFinite(n[k])) out.push(`${n.id}.${k} = ${n[k]}`);
    if ((n.w !== undefined && !(n.w > 0)) || (n.h !== undefined && !(n.h > 0))) out.push(`${n.id}: size ${n.w} × ${n.h}`);
  }
  for (const n of p.nodes) {
    if (n.parent === undefined) continue;
    const parent = node(p, n.parent);
    if (!parent || !CONTAINER_KINDS.has(parent.shape as ShapeKind)) out.push(`${n.id}: parent ${n.parent}`);
    let up: string | undefined = n.parent;
    for (let k = 0; up && k < 100 && up !== n.id; k++) up = node(p, up)?.parent;
    if (up === n.id) out.push(`${n.id} is inside itself`);
  }
  for (const e of p.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) out.push(`edge ${e.from} → ${e.to}`);
    for (const end of [e.start, e.end]) if (end !== undefined && arrowFrom(end) !== end) out.push(`end ${end}`);
    for (const port of [e.fromPort, e.toPort]) if (Array.isArray(port) && !port.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)) out.push(`port ${port}`);
    for (const pt of e.points ?? []) if (!pt.every(Number.isFinite)) out.push(`point ${pt}`);
  }
  if (p.layout === 'none')
    for (const n of p.nodes) if (![n.x, n.y, n.w, n.h].every((v) => typeof v === 'number' && Number.isFinite(v)) || (n.x as number) < 0 || (n.y as number) < 0) out.push(`${n.id} not placed on the page`);
  return out;
}
const sound = (p: SpecPage, what: string) => {
  const pr = problems(p);
  ok(!pr.length, `${what}: a sound page (${pr.slice(0, 4).join('; ')})`);
};

// ---- flowcharts: every bracket, words, the text round it ---------------------------------------------------------------
{
  const { page: p, notes } = mermaidSpec(`---
title: Orders
config:
  theme: base
---
%%{init: {"flowchart": {"curve": "basis"}}}%%
flowchart LR
  %% every bracket
  a[Rect] --> b(Rounded) --> c([Stadium]) --> d[[Sub]] --> e[(Database)]
  f((Circle)) --> g(((Double))) --> h>Flag] --> i{Decide} --> j{{Prepare}}
  k[/In/] --> l[\\Out\\] --> m[/Top\\] --> n[\\Bottom/]
  o(-Oval-) --> p
  accTitle: Not a node
  accDescr {
    Nor this
  }
`);
  sound(p, 'brackets');
  ok(p.layout === 'right' && p.name === 'Orders', `LR lays out right, the front matter's title is the page's name (${p.layout}, ${p.name})`);
  const kinds: Record<string, string> = {
    a: 'rect',
    b: 'rounded',
    c: 'terminator',
    d: 'predefined',
    e: 'cylinder',
    f: 'ellipse',
    g: 'event-mid',
    h: 'step',
    i: 'diamond',
    j: 'hexagon',
    k: 'parallelogram',
    l: 'parallelogram',
    m: 'trapezoid',
    n: 'manual-operation',
    o: 'ellipse',
    p: 'rect',
  };
  for (const [id, shape] of Object.entries(kinds)) ok(node(p, id)?.shape === shape, `${id} is a ${shape} (${node(p, id)?.shape})`);
  ok(node(p, 'a')?.text === 'Rect' && node(p, 'l')?.text === 'Out' && node(p, 'm')?.text === 'Top' && node(p, 'p')?.text === 'p', 'words in brackets, and a bare name as its own words');
  const f = node(p, 'f');
  ok(f?.w === f?.h && (f?.w ?? 0) >= 80 && (f?.w ?? 0) >= width('Circle') + 30, `a circle as wide as it is tall, its words inside (${f?.w} × ${f?.h})`);
  ok(node(p, 'a')?.w === undefined && node(p, 'i')?.w === undefined, 'other shapes are sized where the page is made');
  ok(p.nodes.length === 16 && p.edges.length === 12, `16 nodes, 12 links (${p.nodes.length}, ${p.edges.length})`);
  ok(!notes.length, `nothing left out (${notes.join('; ')})`);
  for (const [dir, layout] of [
    ['TD', 'down'],
    ['TB', 'down'],
    ['BT', 'up'],
    ['RL', 'left'],
    ['', 'down'],
  ])
    ok(mermaidSpec(`graph ${dir}\n  A --> B`).page.layout === layout, `graph ${dir || '(no direction)'} lays out ${layout}`);
  const one = mermaidSpec('graph TD;A-->B;B-->C').page;
  ok(one.nodes.length === 3 && one.edges.length === 2 && one.layout === 'down', 'statements after the first line’s semicolon, and apart at semicolons');
  ok(errorOf('Here:\n```mermaid\nflowchart TD\n```').startsWith('This is not'), 'words before a fence are not Mermaid');
  const fence = mermaidSpec('```mermaid\nflowchart TD\n  A --> B\n```').page;
  ok(fence.nodes.length === 2 && fence.edges.length === 1, 'Mermaid in a fence, as Markdown writes it');
}

// ---- flowcharts: words in quotes, Markdown, entity codes, HTML ----------------------------------------------------------
{
  const { page: p } = mermaidSpec(`flowchart TD
  A["Quoted [brackets] (and parens) {braces}"] --> B["#quot;Hi#quot; #35;1 #9829; &amp; &lt;b&gt;"]
  C["\`**Bold** and _italic_ and *more*\`"] --> D[Line 1<br>Line 2<br/>Line 3<br />Line 4]
  E[<b>Bold</b> <i>and</i> <span style='color:red'>red</span>] --> F["One\\nTwo"]
  G["\`A Markdown string
  over two lines\`"] --> H[snake_case_name]
  I[foo (bar)] --> J[  spaced  ]
`);
  sound(p, 'words');
  ok(node(p, 'A')?.text === 'Quoted [brackets] (and parens) {braces}', `words in quotes may hold brackets (${node(p, 'A')?.text})`);
  ok(node(p, 'B')?.text === '"Hi" #1 ♥ & <b>', `entity codes, Mermaid’s and HTML’s (${node(p, 'B')?.text})`);
  ok(node(p, 'C')?.text === 'Bold and italic and more', `a Markdown string without its marks (${node(p, 'C')?.text})`);
  ok(node(p, 'D')?.text === 'Line 1\nLine 2\nLine 3\nLine 4', 'every <br> a new line');
  ok(node(p, 'E')?.text === 'Bold and red', `other HTML tags left out (${node(p, 'E')?.text})`);
  ok(node(p, 'F')?.text === 'One\nTwo', '\\n a new line');
  ok(node(p, 'G')?.text === 'A Markdown string\nover two lines', `a Markdown string over two lines (${JSON.stringify(node(p, 'G')?.text)})`);
  ok(node(p, 'H')?.text === 'snake_case_name', 'underscores inside words stay');
  ok(node(p, 'I')?.text === 'foo (bar)' && node(p, 'J')?.text === 'spaced', 'brackets unquoted inside a box, and spaces round words trimmed');
}

// ---- flowcharts: links ------------------------------------------------------------------------------------------------
{
  const { page: p, notes } = mermaidSpec(`flowchart LR
  A1 --> B1
  A2 --- B2
  A3 -.-> B3
  A4 -.- B4
  A5 ==> B5
  A6 === B6
  A7 --o B7
  A8 --x B8
  A9 <--> B9
  A10 o--o B10
  A11 x--x B11
  A12 <-.-> B12
  A13 <==> B13
  A14 ---> B14
  A15 -...-> B15
  A16 ====> B16
  A17 ~~~ B17
  A18 -->|Yes| B18
  A19 -- No --> B19
  A20 -. maybe .-> B20
  A21 == surely ==> B21
  A22 --> |spaced| B22
  A23 -->|"a | bar"| B23
  A24 e1@--> B24
  e1@{ animate: true }
  A25 -- text --- B25
  A26 --text-->B26
  A27 -- "dashes -- and --> inside" --> B27
`);
  sound(p, 'links');
  const e = (n: number) => edge(p, `A${n}`, `B${n}`);
  ok(e(1) && !e(1)?.arrow && !e(1)?.start && !e(1)?.end && !e(1)?.dashed && !e(1)?.thick, '--> an arrow at its end (the usual: nothing said)');
  ok(e(2)?.arrow === 'none' && !e(2)?.start, '--- no arrowheads');
  ok(e(3)?.dashed && !e(3)?.arrow, '-.-> dashed with its arrow');
  ok(e(4)?.dashed && e(4)?.arrow === 'none', '-.- dashed, no arrowheads');
  ok(e(5)?.thick && !e(5)?.arrow, '==> thick');
  ok(e(6)?.thick && e(6)?.arrow === 'none', '=== thick, no arrowheads');
  ok(e(7)?.start === 'none' && e(7)?.end === 'circle', '--o a circle at its end');
  ok(e(8)?.start === 'none' && e(8)?.end === 'cross', '--x a cross at its end');
  ok(e(9)?.start === 'arrow' && e(9)?.end === 'arrow', '<--> arrows at both ends');
  ok(e(10)?.start === 'circle' && e(10)?.end === 'circle', 'o--o circles at both ends');
  ok(e(11)?.start === 'cross' && e(11)?.end === 'cross', 'x--x crosses at both ends');
  ok(e(12)?.start === 'arrow' && e(12)?.end === 'arrow' && e(12)?.dashed, '<-.-> dashed, both ways');
  ok(e(13)?.start === 'arrow' && e(13)?.end === 'arrow' && e(13)?.thick, '<==> thick, both ways');
  ok(e(14) && !e(14)?.arrow && e(15)?.dashed && e(16)?.thick, 'longer links are the same links');
  ok(!edge(p, 'A17', 'B17') && node(p, 'A17') && node(p, 'B17') && notes.includes('invisible links (~~~) are left out'), 'an invisible link is left out (its nodes stay), and said');
  ok(e(18)?.text === 'Yes' && e(19)?.text === 'No' && e(20)?.text === 'maybe' && e(20)?.dashed && e(21)?.text === 'surely' && e(21)?.thick, 'words between bars and on the line, on each kind of link');
  ok(e(22)?.text === 'spaced' && e(23)?.text === 'a | bar', 'words between bars after a space, and a bar inside quotes');
  ok(e(24) && e(24)?.style?.flow === true && !node(p, 'e1') && !e(24)?.id, 'a Mermaid 11 edge id is dropped, its animation kept as flowing dashes, and no node is made of it');
  ok(e(25)?.text === 'text' && e(25)?.arrow === 'none' && e(26)?.text === 'text', 'words on a line with no arrowhead, and with no spaces');
  ok(e(27)?.text === 'dashes -- and --> inside', `quoted words on the line may hold arrows (${e(27)?.text})`);
  ok(p.edges.length === 26, `26 edges (${p.edges.length})`);
}

// ---- flowcharts: chains, &, a node named before it is defined -----------------------------------------------------------
{
  const { page: p } = mermaidSpec(`flowchart TD
  A --> B --> C
  D & E --> F & G
  H -->|go| I -.-> J
  K --> L
  L{Decide} --> M
  N[First words] --> O
  N(Second words)
  P:::hot --> Q:::cold & R
`);
  sound(p, 'chains');
  ok(edge(p, 'A', 'B') && edge(p, 'B', 'C') && !edge(p, 'A', 'C'), 'a chain links each to the next');
  const pairs = p.edges.filter((e) => ['D', 'E'].includes(e.from)).map((e) => `${e.from}${e.to}`);
  ok(pairs.join(',') === 'DF,DG,EF,EG', `& links every pair, in Mermaid's order (${pairs})`);
  ok(edge(p, 'H', 'I')?.text === 'go' && edge(p, 'I', 'J')?.dashed && !edge(p, 'I', 'J')?.text, 'a chain’s links keep their own words and lines');
  ok(p.nodes.filter((n) => n.id === 'L').length === 1 && node(p, 'L')?.shape === 'diamond' && node(p, 'L')?.text === 'Decide', 'a node named in a link and defined later is one node, as defined');
  ok(node(p, 'N')?.shape === 'rounded' && node(p, 'N')?.text === 'Second words', 'the last definition wins');
  ok(p.nodes.map((n) => n.id).join(',') === 'A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R', 'nodes in the order they were first named');
}

// ---- flowcharts: Mermaid 11 shapes --------------------------------------------------------------------------------------
{
  const { page: p, notes } = mermaidSpec(`flowchart TD
  a@{ shape: rect, label: "Process" }
  b@{ shape: rounded }
  c@{ shape: stadium, label: "Go" }
  d@{ shape: subproc }
  e@{ shape: cyl, label: "DB" }
  f@{ shape: circle, label: "Round" }
  g@{ shape: dbl-circ }
  h@{ shape: diam, label: "Yes?" }
  i@{ shape: hex }
  j@{ shape: lean-r }
  k@{ shape: lean-l }
  l@{ shape: trap-b }
  m@{ shape: trap-t }
  n@{ shape: doc }
  o@{ shape: docs }
  p@{ shape: delay }
  q@{ shape: das }
  r@{ shape: lin-cyl }
  s@{ shape: notch-rect }
  t@{ shape: bow-rect }
  u@{ shape: tri }
  v@{ shape: flip-tri }
  w@{ shape: sm-circ }
  x@{ shape: fr-circ }
  y@{ shape: f-circ }
  z@{ shape: cross-circ }
  a2@{ shape: hourglass }
  b2@{ shape: brace }
  c2@{ shape: flag }
  d2@{ shape: notch-pent }
  e2@{ shape: curv-trap }
  f2@{ shape: sl-rect }
  g2@{ shape: div-rect }
  h2@{ shape: text, label: "Just words" }
  i2@{ shape: bolt }
  j2@{ shape: squiggle }
  k2@{ shape: Documents }
  l2@{ label: "Words only" }
  m2@{
    shape: database
    label: "Over lines"
  }
  n2@{ icon: "fa:user", label: "User" } --> o2@{ shape: doc, label: "Doc" }
`);
  sound(p, 'Mermaid 11 shapes');
  const want: Record<string, string> = {
    a: 'rect',
    b: 'rounded',
    c: 'terminator',
    d: 'predefined',
    e: 'cylinder',
    f: 'ellipse',
    g: 'event-mid',
    h: 'diamond',
    i: 'hexagon',
    j: 'parallelogram',
    k: 'parallelogram',
    l: 'trapezoid',
    m: 'manual-operation',
    n: 'document',
    o: 'multi-document',
    p: 'delay',
    q: 'cylinder',
    r: 'cylinder',
    s: 'card',
    t: 'stored-data',
    u: 'extract',
    v: 'merge',
    w: 'initial',
    x: 'final',
    y: 'connector',
    z: 'summing',
    a2: 'collate',
    b2: 'annotation',
    c2: 'punched-tape',
    d2: 'loop-limit',
    e2: 'display',
    f2: 'manual-input',
    g2: 'internal-storage',
    h2: 'text',
    i2: 'rect',
    j2: 'rect',
    k2: 'multi-document',
    l2: 'rect',
    m2: 'cylinder',
  };
  for (const [id, shape] of Object.entries(want)) ok(node(p, id)?.shape === shape, `shape data: ${id} is a ${shape} (${node(p, id)?.shape})`);
  ok(node(p, 'a')?.text === 'Process' && node(p, 'b')?.text === 'b' && node(p, 'h2')?.text === 'Just words', 'its label, or its name');
  ok(node(p, 'f')?.w === node(p, 'f')?.h && (node(p, 'f')?.w ?? 0) >= 80, 'a circle by name is round too');
  ok(!node(p, 'w')?.text && !node(p, 'x')?.text && !node(p, 'y')?.text, 'a start, a stop and a junction show no name');
  ok(node(p, 'l2')?.text === 'Words only' && node(p, 'm2')?.text === 'Over lines', 'shape data without a shape, and over several lines');
  ok(notes.includes('the bolt shape is drawn as a rectangle') && notes.includes('the shape "squiggle" is not known, so it is drawn as a rectangle') && notes.includes('icons are left out'), `what is left out is said (${notes.join('; ')})`);
  ok(edge(p, 'n2', 'o2') && node(p, 'n2')?.text === 'User', 'shape data on both ends of a link');
}

// ---- flowcharts: subgraphs ------------------------------------------------------------------------------------------------
{
  const { page: p, notes } = mermaidSpec(`flowchart TB
  c1 --> a2
  subgraph one [Stage one]
    direction LR
    a1 --> a2
    subgraph inner["Inner part"]
      i1 --> i2
    end
  end
  subgraph two
    b1 --> b2
  end
  subgraph "Three words here"
    t1
  end
  subgraph "Quoted"
    q1
  end
  subgraph Plain words title
    w1
  end
  one --> two
  inner --> b1
`);
  sound(p, 'subgraphs');
  const c = (id: string) => node(p, id);
  ok(c('one')?.shape === 'container' && c('one')?.text === 'Stage one' && !c('one')?.parent, 'subgraph id [title]: a container with its title');
  ok(c('inner')?.shape === 'container' && c('inner')?.text === 'Inner part' && c('inner')?.parent === 'one', 'a subgraph inside a subgraph is inside it');
  ok(c('two')?.text === 'two', 'a subgraph with a name only: its name as its title');
  ok(c('a1')?.parent === 'one' && c('i1')?.parent === 'inner' && c('i2')?.parent === 'inner' && c('b2')?.parent === 'two', 'what is named inside a subgraph is in it (the innermost)');
  ok(c('a2')?.parent === 'one' && !c('c1')?.parent, 'a node named before a subgraph and then inside it is in it, as Mermaid draws it');
  const three = p.nodes.find((n) => n.text === 'Three words here');
  ok(three?.shape === 'container' && three.id.startsWith('__') && c('t1')?.parent === three.id, `a subgraph titled in words has an id made up (${three?.id})`);
  ok(c('Quoted')?.shape === 'container' && c('q1')?.parent === 'Quoted', 'subgraph "Title" takes its title as its id when it can');
  const plain = p.nodes.find((n) => n.text === 'Plain words title');
  ok(plain?.shape === 'container' && c('w1')?.parent === plain.id, 'subgraph Title words');
  ok(edge(p, 'one', 'two') && edge(p, 'inner', 'b1') && c('b1')?.parent === 'two', 'links to and from subgraphs');
  const firstOther = p.nodes.findIndex((n) => n.shape !== 'container');
  ok(p.nodes.slice(0, firstOther).length === 6 && p.nodes.slice(firstOther).every((n) => n.shape !== 'container'), 'containers come first, drawn behind what they hold');
  ok(notes.includes('the direction of a subgraph is left out: the whole flowchart runs one way'), 'a subgraph’s own direction is said to be left out');
  const unclosed = mermaidSpec('flowchart TD\n  subgraph S\n    a --> b');
  ok(node(unclosed.page, 'a')?.parent === 'S' && unclosed.notes.includes('a subgraph with no end is closed at the end'), 'a subgraph with no end is closed at the end of the text');
  const loop = mermaidSpec('flowchart TD\n  subgraph A\n    B --> x\n  end\n  subgraph B\n    A --> y\n  end').page;
  sound(loop, 'subgraphs naming each other');
}

// ---- flowcharts: style, classDef, class, linkStyle, click ---------------------------------------------------------------
{
  const { page: p, notes } = mermaidSpec(`flowchart LR
  A[Start] --> B[Next] --> C[Done]
  C --> D:::warn
  E ~~~ F
  F --> G
  classDef default fill:lightblue,stroke:#333
  classDef warn fill:#f96,stroke:#000,stroke-width:4px,color:white,font-weight:bold;
  classDef calm,quiet fill:hsl(120, 50%, 50%)
  class B,C warn
  class G calm
  style A fill:#f9f,stroke:#333,stroke-width:4px,color:#fff,stroke-dasharray: 5 5
  style C fill:rgb(255, 0, 0)
  linkStyle default stroke:#999
  linkStyle 0,2 stroke:#ff3,stroke-width:3px,color:red
  linkStyle 4 interpolate basis stroke-dasharray: 3
  linkStyle 9 stroke:#00f
  click A callback "Tooltip"
  click B "https://example.com" _blank
  subgraph S
    H
  end
  style S fill:#eeeeee
`);
  sound(p, 'styles');
  const a = node(p, 'A');
  ok(a?.fill === '#ff99ff' && a.stroke === '#333333' && a.textColor === '#ffffff' && a.style?.width === 4 && a.style.dash === 'dashed', `style: fill, line, words, width, dashes (${JSON.stringify(a)})`);
  ok(node(p, 'B')?.fill === '#ff9966' && node(p, 'B')?.stroke === '#000000' && node(p, 'B')?.textColor === '#ffffff' && node(p, 'B')?.style?.bold, 'class B warn: its classDef’s look');
  ok(node(p, 'C')?.fill === '#ff0000' && node(p, 'C')?.stroke === '#000000', 'style wins over a class (rgb() read)');
  ok(node(p, 'D')?.fill === '#ff9966', ':::warn on a node in a link');
  ok(node(p, 'E')?.fill === '#add8e6' && node(p, 'E')?.stroke === '#333333', 'classDef default for nodes with no class (CSS colour names read)');
  ok(node(p, 'G')?.fill === '#40bf40', `a classDef for two names at once, hsl() read (${node(p, 'G')?.fill})`);
  ok(node(p, 'S')?.fill === '#eeeeee' && node(p, 'S')?.stroke !== '#333333', 'a subgraph styled, without the default class');
  // Links in order, an invisible one counted: 0 A→B, 1 B→C, 2 C→D, 3 E~F, 4 F→G.
  const ab = edge(p, 'A', 'B');
  ok(ab?.color === '#ffff33' && ab.width === 3 && ab.style?.color === '#ff0000', `linkStyle 0: line colour, width, words’ colour (${JSON.stringify(ab)})`);
  ok(edge(p, 'B', 'C')?.color === '#999999' && edge(p, 'C', 'D')?.color === '#ffff33', 'linkStyle default for the others, a number over it');
  ok(edge(p, 'F', 'G')?.route === 'curved' && edge(p, 'F', 'G')?.dashed, 'linkStyle numbers count invisible links; interpolate basis curves');
  ok(notes.includes('linkStyle 9 names no link') && notes.includes('click lines are left out'), `notes: a linkStyle naming no link, clicks (${notes.join('; ')})`);
}

// ---- flowcharts: what could not be read ---------------------------------------------------------------------------------
{
  const { page: p, notes } = mermaidSpec('flowchart TD\n  A --> B %% a comment\n  what is this\n  --> C\n  D --> E -->');
  ok(edge(p, 'A', 'B') && p.edges.length === 1, `the lines that read are kept, a comment at a line’s end cut off (${p.edges.length})`);
  ok(notes.some((n) => n === 'line 3 could not be read: "what is this"') && notes.some((n) => n === 'line 4 could not be read: "--> C"'), `a line that does not read is said, with its number (${notes.join('; ')})`);
  ok(!node(p, 'what') && !node(p, 'D') && !node(p, 'E'), 'a line that does not read (or is cut short) adds nothing of itself');
  const many = mermaidSpec(`flowchart TD\n${Array.from({ length: 12 }, () => '  --> ?').join('\n')}`).notes;
  ok(many.length === 9 && many[8] === '4 more lines could not be read', `the first few unread lines said, the rest counted (${many.length})`);
  const ids = mermaidSpec('flowchart TD\n  开始 --> 结束\n  my.node --> x-1').page;
  sound(ids, 'names a diagram cannot keep as ids');
  ok(ids.nodes[0].text === '开始' && ids.nodes[0].id.startsWith('__') && node(ids, 'my.node') && node(ids, 'x-1'), 'a name a diagram cannot keep gets an id made up, its words kept');
}

// ---- mind maps --------------------------------------------------------------------------------------------------------------
{
  const { page: p, notes } = mermaidSpec(`mindmap
  root((Mind map))
    Origins
      Long history
      ::icon(fa fa-book)
      Popularisation
        British author Tony Buzan
    Research
      On effectiveness<br/>and features
      sq[Square]
      rd(Rounded)
      bang))Bang((
      cl)Cloud(
      hx{{Hexagon}}
      ci((Circle))
    Tools:::urgent
      md["\`**Bold** over
two lines\`"]
    B4
    B5
    B6
    B7
    B8
    B9
`);
  sound(p, 'mind map');
  ok(p.layout === 'mindmap' && p.route === 'curved', 'a mind map’s layout, its links curved');
  const root = p.nodes[0];
  ok(root.text === 'Mind map' && root.shape === 'ellipse' && root.color === 'dark-blue' && root.w === root.h, 'the root first: a circle in strong blue');
  const byText = (t: string) => p.nodes.find((n) => n.text === t);
  const parentOf = (t: string) => p.edges.find((e) => e.to === byText(t)?.id)?.from;
  ok(parentOf('Origins') === root.id && parentOf('Long history') === byText('Origins')?.id && parentOf('British author Tony Buzan') === byText('Popularisation')?.id, 'each node under the nearest node above it indented less');
  ok(p.edges.every((e) => e.arrow === 'none'), 'links with no arrowheads');
  ok(byText('Origins')?.color === 'blue' && byText('Research')?.color === 'green' && byText('Tools')?.color === 'orange', 'each branch the next colour');
  ok(byText('British author Tony Buzan')?.color === 'blue' && byText('Square')?.color === 'green' && byText('Bold over\ntwo lines')?.color === 'orange', 'what a branch holds takes its colour');
  ok(['B4', 'B5', 'B6', 'B7', 'B8'].map((t) => byText(t)?.color).join() === 'purple,yellow,red,teal,pink' && byText('B9')?.color === 'blue', 'eight colours, then round again');
  const shape = (t: string) => byText(t)?.shape;
  ok(shape('Square') === 'rect' && shape('Rounded') === 'rounded' && shape('Bang') === 'cloud' && shape('Cloud') === 'cloud' && shape('Hexagon') === 'hexagon' && shape('Circle') === 'ellipse' && shape('Long history') === 'rounded', 'every shape, and words alone rounded');
  ok(node(p, 'sq')?.text === 'Square' && node(p, 'hx'), 'a node’s own name as its id');
  ok(byText('On effectiveness\nand features') && byText('Bold over\ntwo lines'), '<br> and a Markdown string over two lines');
  ok(notes.includes('icons are left out') && !p.nodes.some((n) => /icon|urgent/.test(n.text ?? '')), 'icons and classes are not nodes');
  const two = mermaidSpec('mindmap\n  A\n    a1\n  B\n    b1');
  ok(two.page.edges.some((e) => e.from === two.page.nodes[0].id && e.to === two.page.nodes[2].id) && two.notes.includes('a mind map has one root: the nodes beside it are put under it'), 'a second root goes under the first, and is said');
  const dup = mermaidSpec('mindmap\n  a[Root]\n    a[Again]\n    a[Third]').page;
  sound(dup, 'a mind map’s names used twice');
}

// ---- class diagrams -----------------------------------------------------------------------------------------------------------
{
  const { page: p, notes } = mermaidSpec(`classDiagram
  note "From Duck till Zebra"
  Animal <|-- Duck
  note for Duck "can fly\\ncan swim"
  Zebra --|> Animal
  Animal : +int age
  Animal : +String gender
  Animal: +isMammal() bool
  Animal: +mate()
  <<abstract>> Animal
  class Duck{
    +String beakColor
    +swim()
    +quack()$
    +someAbstract()*
  }
  class Shape{
    <<interface>>
    noOfVertices
    draw()
  }
  class Square~Shape~{
    int id
    List~int~ position
    Map~string, List~int~~ index
    setPoints(List~int~ points)
    getPoints() List~int~
  }
  class Empty
  class Methods {
    +run()
  }
  class Labelled["A label"]
  class Styled:::hot
  classDef hot fill:#f96
  Customer "1" --> "*" Ticket : buys
  Car *-- Wheel : has
  Axle --* Spoke
  Pond o-- Duck
  Book --o Library
  Student ..> Course : uses
  Bird ..|> Flyer
  Foo <|.. Bar
  A -- B
  C .. D
  E <--> F
  G "1..*" --o "1" H
  I --() J
  click Duck call cb()
`);
  sound(p, 'class diagram');
  ok(p.layout === 'down', 'laid out down');
  const animal = node(p, 'Animal');
  ok(animal?.shape === 'class' && animal.text === '«abstract»\nAnimal', `an annotation over the name (${JSON.stringify(animal?.text)})`);
  ok(JSON.stringify(animal?.rows) === JSON.stringify(['+int age', '+String gender', '---', '+isMammal() : bool', '+mate()']), `members named after the class: attributes, a line, methods (${JSON.stringify(animal?.rows)})`);
  ok(JSON.stringify(node(p, 'Duck')?.rows) === JSON.stringify(['+String beakColor', '---', '+swim()', '+quack()', '+someAbstract()']), 'members in braces; static and abstract marks off');
  ok(node(p, 'Shape')?.text === '«interface»\nShape' && JSON.stringify(node(p, 'Shape')?.rows) === JSON.stringify(['noOfVertices', '---', 'draw()']), 'an annotation inside the braces');
  const sq = node(p, 'Square');
  ok(sq?.text === 'Square<Shape>', `a generic class (${sq?.text})`);
  ok(JSON.stringify(sq?.rows) === JSON.stringify(['int id', 'List<int> position', 'Map<string, List<int>> index', '---', 'setPoints(List<int> points)', 'getPoints() : List<int>']), `generics in members, nested too (${JSON.stringify(sq?.rows)})`);
  ok(node(p, 'Empty')?.rows === undefined && node(p, 'Methods')?.rows?.join() === '---,+run()', 'no rows with no members; the line only before methods');
  ok(node(p, 'Labelled')?.text === 'A label' && node(p, 'Styled')?.fill === '#ff9966', 'a class’s label, and :::class');
  const rel = (a: string, b: string) => edge(p, a, b);
  ok(rel('Animal', 'Duck')?.start === 'triangle' && rel('Animal', 'Duck')?.end === 'none' && !rel('Animal', 'Duck')?.dashed, 'A <|-- B: from the parent, its triangle at the start');
  ok(rel('Animal', 'Zebra')?.start === 'triangle' && !rel('Zebra', 'Animal'), 'B --|> A turned round: the parent first');
  ok(rel('Customer', 'Ticket')?.end === 'arrow' && rel('Customer', 'Ticket')?.start === 'none' && rel('Customer', 'Ticket')?.fromText === '1' && rel('Customer', 'Ticket')?.toText === '*' && rel('Customer', 'Ticket')?.text === 'buys', 'an association as written, its cardinalities at their ends, its label');
  ok(rel('Car', 'Wheel')?.start === 'diamond' && rel('Car', 'Wheel')?.end === 'none' && rel('Car', 'Wheel')?.text === 'has', 'composition: from the whole, its diamond at the start');
  ok(rel('Spoke', 'Axle')?.start === 'diamond', 'B --* A turned round: the whole first');
  ok(rel('Pond', 'Duck')?.start === 'diamond-open' && rel('Library', 'Book')?.start === 'diamond-open', 'aggregation, either way round');
  ok(rel('Student', 'Course')?.dashed && rel('Student', 'Course')?.end === 'open' && rel('Student', 'Course')?.text === 'uses', 'a dependency: dashed, an open arrow');
  ok(rel('Flyer', 'Bird')?.start === 'triangle' && rel('Flyer', 'Bird')?.dashed && rel('Foo', 'Bar')?.start === 'triangle' && rel('Foo', 'Bar')?.dashed, 'realization: dashed, from the interface, either way round');
  ok(rel('A', 'B')?.arrow === 'none' && !rel('A', 'B')?.dashed && rel('C', 'D')?.arrow === 'none' && rel('C', 'D')?.dashed, 'links with no arrowheads, solid and dashed');
  ok(rel('E', 'F')?.start === 'arrow' && rel('E', 'F')?.end === 'arrow', 'both ways');
  const gh = rel('H', 'G');
  ok(gh?.start === 'diamond-open' && gh.fromText === '1' && gh.toText === '1..*', `turned round with its cardinalities (${JSON.stringify(gh)})`);
  ok(rel('I', 'J')?.end === 'circle-open', 'a lollipop interface');
  const memo = p.nodes.find((n) => n.shape === 'note' && n.text === 'can fly\ncan swim');
  ok(memo && edge(p, memo.id, 'Duck')?.dashed && edge(p, memo.id, 'Duck')?.arrow === 'none' && p.nodes.some((n) => n.shape === 'note' && n.text === 'From Duck till Zebra'), 'notes, one joined to its class by dashes');
  ok(notes.includes('click, link and callback lines are left out'), 'a click is said to be left out');
  const ns = mermaidSpec(`classDiagram
  direction RL
  namespace Shapes {
    class Triangle
    class Rectangle {
      double width
    }
  }
  Triangle <|-- Right`).page;
  sound(ns, 'namespaces');
  ok(node(ns, 'Shapes')?.shape === 'container' && node(ns, 'Triangle')?.parent === 'Shapes' && node(ns, 'Rectangle')?.parent === 'Shapes' && !node(ns, 'Right')?.parent, 'a namespace holds its classes');
  ok(ns.layout === 'left' && node(ns, 'Rectangle')?.rows?.join() === 'double width', 'direction RL, and a class’s members inside a namespace');
}

// ---- ER diagrams ----------------------------------------------------------------------------------------------------------------
{
  const { page: p, notes } = mermaidSpec(`erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE-ITEM : contains
  CUSTOMER }|..|{ DELIVERY-ADDRESS : "uses daily"
  CUSTOMER |o--o| LOYALTY : ""
  ORDER }o--|| SHOP : at
  CUSTOMER {
    string name
    string custNumber PK "the number"
    string sector
  }
  ORDER {
    int orderNumber PK
    int customerId FK
    varchar(255) note
    int both PK, FK
  }
  p[Person] {
    string firstName
  }
  a["Customer Account"] { string email ; int id UK }
  p ||--o| a : has
  CAR 1 to zero or more NAMED-DRIVER : allows
  PERSON only one optionally to one or more CAR : drives
  "Quoted name" ||--|| SHOP : owns
`);
  sound(p, 'ER diagram');
  ok(p.layout === 'right', 'laid out right');
  const e = (a: string, b: string) => edge(p, a, b);
  ok(e('CUSTOMER', 'ORDER')?.start === 'er-only-one' && e('CUSTOMER', 'ORDER')?.end === 'er-zero-many' && e('CUSTOMER', 'ORDER')?.text === 'places' && !e('CUSTOMER', 'ORDER')?.dashed, '||--o{: one and only one to zero or many, solid, its label');
  ok(e('ORDER', 'LINE-ITEM')?.end === 'er-one-many', '|{ one or many');
  ok(e('CUSTOMER', 'DELIVERY-ADDRESS')?.start === 'er-one-many' && e('CUSTOMER', 'DELIVERY-ADDRESS')?.dashed && e('CUSTOMER', 'DELIVERY-ADDRESS')?.text === 'uses daily', '}|..|{ dashed, a quoted label');
  ok(e('CUSTOMER', 'LOYALTY')?.start === 'er-zero-one' && e('CUSTOMER', 'LOYALTY')?.end === 'er-zero-one' && !e('CUSTOMER', 'LOYALTY')?.text, '|o and o| zero or one; an empty label');
  ok(e('ORDER', 'SHOP')?.start === 'er-zero-many' && e('ORDER', 'SHOP')?.end === 'er-only-one', '}o zero or many on the left');
  ok(JSON.stringify(node(p, 'CUSTOMER')?.rows) === JSON.stringify(['name string', 'custNumber string PK', 'sector string']), `attributes as name, type and keys (${JSON.stringify(node(p, 'CUSTOMER')?.rows)})`);
  ok(JSON.stringify(node(p, 'ORDER')?.rows) === JSON.stringify(['orderNumber int PK', 'customerId int FK', 'note varchar(255)', 'both int PK, FK']), `FK, a type with brackets, two keys (${JSON.stringify(node(p, 'ORDER')?.rows)})`);
  ok(node(p, 'p')?.text === 'Person' && node(p, 'a')?.text === 'Customer Account' && node(p, 'a')?.rows?.join() === 'email string,id int UK', 'aliases shown; attributes on one line, apart by semicolons');
  ok(e('p', 'a')?.end === 'er-zero-one', 'a relationship between aliased entities, by their names');
  ok(e('CAR', 'NAMED-DRIVER')?.start === 'er-only-one' && e('CAR', 'NAMED-DRIVER')?.end === 'er-zero-many' && !e('CAR', 'NAMED-DRIVER')?.dashed, 'cardinalities in words');
  ok(e('PERSON', 'CAR')?.dashed && e('PERSON', 'CAR')?.end === 'er-one-many', '“optionally to” dashed');
  const quoted = p.nodes.find((n) => n.text === 'Quoted name');
  ok(quoted && quoted.id.startsWith('__') && e(quoted.id, 'SHOP'), 'a quoted entity name with spaces');
  ok(node(p, 'LINE-ITEM')?.shape === 'entity' && node(p, 'LINE-ITEM')?.rows === undefined, 'an entity named only in a relationship, without rows');
  ok(notes.includes('the comments on attributes are left out'), 'comments on attributes said to be left out');
  ok(mermaidSpec('erDiagram\n  direction TB\n  A ||--|| B : x').page.layout === 'down', 'direction TB');
}

// ---- state diagrams -------------------------------------------------------------------------------------------------------------
{
  const { page: p, notes } = mermaidSpec(`stateDiagram-v2
  [*] --> Still
  Still --> [*]
  Still --> Moving : push
  Moving --> Still
  Moving --> Crash
  Crash --> [*]
  state "This is a state description" as s2
  s2 : and one more line
  Crash : The car crashed
  state First {
    [*] --> second
    second --> [*]
    state Inner {
      [*] --> deep
    }
  }
  state fork_state <<fork>>
  [*] --> fork_state
  fork_state --> State2
  fork_state --> State3
  state join_state <<join>>
  State2 --> join_state
  State3 --> join_state
  state if_state <<choice>>
  join_state --> if_state
  if_state --> False : if n < 0
  if_state --> True : if n >= 0
  note right of State2 : Important information!
  note left of deep
    A note on
    two lines.
  end note
  state Active {
    [*] --> NumLockOff
    --
    [*] --> CapsLockOff
  }
  classDef bad fill:#f00,color:white
  class Crash bad
  Moving:::bad --> Still
`);
  sound(p, 'state diagram');
  ok(p.layout === 'down', 'laid out down');
  ok(node(p, '__start')?.shape === 'initial' && node(p, '__end')?.shape === 'final' && !node(p, '__start')?.parent, '[*]: a start and an end for the whole diagram');
  ok(edge(p, '__start', 'Still') && edge(p, 'Still', '__end') && edge(p, 'Crash', '__end') && edge(p, '__start', 'fork_state'), 'one start and one end, shared');
  ok(node(p, '__start_First')?.parent === 'First' && node(p, '__end_First')?.parent === 'First' && node(p, '__start_Inner')?.parent === 'Inner', 'each composite state its own start and end');
  ok(node(p, 'First')?.shape === 'container' && node(p, 'Inner')?.parent === 'First' && node(p, 'second')?.parent === 'First' && node(p, 'deep')?.parent === 'Inner', 'composite states hold their states, one inside another');
  ok(edge(p, 'Still', 'Moving')?.text === 'push' && !edge(p, 'Still', 'Moving')?.arrow, 'a transition’s label, its arrow the usual one');
  ok(node(p, 'Still')?.shape === 'rounded' && node(p, 'Still')?.text === 'Still', 'a state: rounded, its name');
  ok(node(p, 's2')?.text === 'This is a state description\nand one more line', 'state "…" as s2, and a description a line under it');
  ok(node(p, 'Crash')?.text === 'Crash\nThe car crashed', 'a description adds a line under the name');
  ok(node(p, 'fork_state')?.shape === 'bar' && node(p, 'fork_state')?.w === 80 && node(p, 'fork_state')?.h === 8 && !node(p, 'fork_state')?.text, 'a fork: a bar across');
  ok(node(p, 'join_state')?.shape === 'bar', 'a join: a bar');
  ok(node(p, 'if_state')?.shape === 'diamond' && node(p, 'if_state')?.w === 40 && node(p, 'if_state')?.h === 40 && !node(p, 'if_state')?.text, 'a choice: a small diamond with no words');
  ok(edge(p, 'if_state', 'False')?.text === 'if n < 0' && edge(p, 'if_state', 'True')?.text === 'if n >= 0', 'labels with < and >');
  const n1 = p.nodes.find((n) => n.shape === 'note' && n.text === 'Important information!');
  ok(n1 && edge(p, n1.id, 'State2')?.dashed && edge(p, n1.id, 'State2')?.arrow === 'none', 'a note joined to its state by dashes, from the note');
  const n2 = p.nodes.find((n) => n.shape === 'note' && n.text === 'A note on\ntwo lines.');
  ok(n2?.parent === 'Inner' && edge(p, n2.id, 'deep'), 'a note of several lines, in its state’s container');
  ok(node(p, 'NumLockOff')?.parent === 'Active' && edge(p, '__start_Active', 'CapsLockOff') && notes.includes('the lines between concurrent regions (--) are left out'), 'concurrent regions read, their line said to be left out');
  ok(node(p, 'Crash')?.fill === '#ff0000' && node(p, 'Crash')?.textColor === '#ffffff' && node(p, 'Moving')?.fill === '#ff0000', 'classDef with class, and :::class in a transition');
  ok(p.nodes.findIndex((n) => n.shape !== 'container') === 3, 'containers first');
  const lr = mermaidSpec('stateDiagram\n  direction LR\n  state f <<fork>>\n  [*] --> f').page;
  ok(lr.layout === 'right' && node(lr, 'f')?.w === 8 && node(lr, 'f')?.h === 80, 'direction LR: a fork’s bar stands up across the way it runs');
}

// ---- sequence diagrams: lifelines, messages, rows --------------------------------------------------------------------------
{
  const { page: p, notes } = mermaidSpec(`sequenceDiagram
  title Checkout
  participant W as Web shop
  actor U as Shopper
  U->>W: Add to basket, please, with a longer message
  W-->>U: Updated
  U-)P: Pay
  P--)U: Paid
  U-xW: Lost
  U--xW: Lost too
  U->W: Line
  U-->W: Dashed line
  W<<->>P: Both ways
  W<<-->>P: Both, dashed
  W->>W: Check<br/>stock
  W->>P: Two<br>lines
  participant Q as Late
  Q->>W: Last
`);
  sound(p, 'sequence diagram');
  ok(p.layout === 'none' && p.name === 'Checkout', 'laid out here; its title the page’s name');
  const lifelines = p.nodes.filter((n) => n.shape === 'lifeline');
  ok(lifelines.map((n) => n.id).join() === 'W,U,P,Q', `participants in the order declared or first met (${lifelines.map((n) => n.id)})`);
  ok(node(p, 'W')?.text === 'Web shop' && node(p, 'U')?.text === 'Shopper' && node(p, 'P')?.text === 'P', 'an alias’s words; an actor a lifeline too; a name alone');
  ok(lifelines[0].x === 40 && lifelines.every((n) => n.y === 40), 'the first lifeline at 40, 40; all at the same top');
  for (const n of lifelines) ok(n.w === Math.max(120, Math.ceil((width(n.text ?? '') + 32) / 2) * 2), `${n.id}: its head as wide as its name with room, 120 at least (${n.w})`);
  ok(new Set(lifelines.map((n) => n.h)).size === 1, 'every lifeline as long as the others');
  for (let i = 1; i < lifelines.length; i++) ok((lifelines[i].x ?? 0) - ((lifelines[i - 1].x ?? 0) + (lifelines[i - 1].w ?? 0)) >= 60, `${lifelines[i].id}: 60 or more from the one before`);
  const cx = (id: string) => (node(p, id)?.x ?? 0) + (node(p, id)?.w ?? 0) / 2;
  const H = lifelines[0].h ?? 0;
  const yOf = (e: SpecEdge | undefined, end: 'fromPort' | 'toPort' = 'fromPort') => 40 + ((e?.[end] as [number, number])[1] ?? 0) * H;
  // Every message's words fit between its lifelines' middles, 12 pixels clear of each.
  for (const e of p.edges) if (e.from !== e.to) ok(Math.abs(cx(e.to) - cx(e.from)) >= width(e.text ?? '') + 24 - 0.5, `“${e.text}” fits between its lifelines (${Math.abs(cx(e.to) - cx(e.from))} for ${width(e.text ?? '')})`);
  const msg = (text: string) => p.edges.find((e) => e.text === text);
  const first = msg('Add to basket, please, with a longer message');
  ok(first?.from === 'U' && first.to === 'W' && first.route === 'straight' && !first.arrow && !first.start && !first.dashed, '->> solid, its arrow at the end');
  ok(Math.abs(yOf(first) - 132) < 0.5 && JSON.stringify(first?.fromPort) === JSON.stringify(first?.toPort) && (first?.fromPort as [number, number])[0] === 0.5, `the first row at 40 + 40 + 30, its line in its middle; both ends at the lifelines’ middles (${yOf(first)})`);
  ok(String((first?.fromPort as [number, number])[1]).replace(/^0\./, '').length <= 4, 'fractions to four places');
  ok(msg('Updated')?.dashed && !msg('Updated')?.arrow, '-->> dashed, its arrow');
  ok(msg('Pay')?.end === 'open' && !msg('Pay')?.dashed && msg('Paid')?.end === 'open' && msg('Paid')?.dashed, '-) and --) an open arrow');
  ok(msg('Lost')?.end === 'cross' && msg('Lost too')?.end === 'cross' && msg('Lost too')?.dashed, '-x and --x a cross');
  ok(msg('Line')?.arrow === 'none' && !msg('Line')?.dashed && msg('Dashed line')?.arrow === 'none' && msg('Dashed line')?.dashed, '-> and --> no arrowhead');
  ok(msg('Both ways')?.start === 'arrow' && msg('Both ways')?.end === 'arrow' && msg('Both, dashed')?.dashed, '<<->> and <<-->> both ways');
  const order = p.edges.map((e) => yOf(e));
  ok(order.every((y, i) => !i || y > order[i - 1]), 'messages down the page in their order');
  ok(Math.abs(yOf(msg('Updated')) - yOf(first) - 44) < 0.5 && Math.abs(yOf(msg('Paid')) - yOf(msg('Pay')) - 44) < 0.5, 'a row 44 high');
  const self = p.edges.find((e) => e.from === 'W' && e.to === 'W');
  const sy = yOf(self);
  ok(self?.route === 'orthogonal' && Math.abs(yOf(self, 'toPort') - sy - 22) < 0.5, `a message to itself comes back 22 lower (${yOf(self, 'toPort') - sy})`);
  const pts = self?.points ?? [];
  ok(pts.length === 2 && Math.abs(pts[0][0] - cx('W') - 44) < 0.5 && Math.abs(pts[0][1] - sy) < 0.5 && Math.abs(pts[1][0] - cx('W') - 44) < 0.5 && Math.abs(pts[1][1] - sy - 22) < 0.5, `its loop 44 to the right and 22 down (${JSON.stringify(pts)})`);
  // Rows: Both, dashed (one line) 22 from its foot; the message to itself 44 + 18 + 22 high, its loop in its middle.
  ok(self?.text === 'Check\nstock' && Math.abs(sy - yOf(msg('Both, dashed')) - (22 + 31)) < 0.5, `its row taller: a line more, and the loop (${sy - yOf(msg('Both, dashed'))})`);
  const two = msg('Two\nlines');
  ok(Math.abs(yOf(two) - sy - (53 + 31)) < 0.5, `a row of two lines, 62 high, after it (${yOf(two) - sy})`);
  const last = msg('Last');
  ok(Math.abs(yOf(last) - yOf(two) - (31 + 22)) < 0.5, `a row with a line more is 18 higher (${yOf(last) - yOf(two)})`);
  ok(Math.abs(H - (yOf(last) + 22 + 30 - 40)) < 0.5, `the lifelines end 30 under the last row (${H})`);
  ok(!notes.length, `nothing left out (${notes.join('; ')})`);
}

// ---- sequence diagrams: activations, notes, blocks, numbers --------------------------------------------------------------
{
  const { page: p, notes } = mermaidSpec(`sequenceDiagram
  autonumber
  participant A as Alice
  participant B as Bob
  participant C as Carol
  A->>+B: Hello Bob
  B->>+B: Think
  B-->>-A: Hi Alice
  B-->>-A: Done
  activate C
  C->>A: Ping
  deactivate C
  Note right of B: Bob thinks
  Note left of A: Alice waits
  Note over C: Carol alone
  Note over A,C: A note over all three of them
  loop Every minute
    B->>C: Tick
  end
  alt is sick
    B->>A: Not so good
  else is well
    A->>B: Fresh
  else
    A->>B: Shrug
  end
  opt
    C->>B: Maybe
  end
  par Alice to Bob
    A->>B: One
  and Alice to Carol
    A->>C: Two
  end
  rect rgb(191, 223, 255)
    A->>B: Inside rect
  end
  destroy C
  A->>B: Bye; B->>A: Bye too
`);
  sound(p, 'sequence diagram with blocks');
  const lifelines = p.nodes.filter((n) => n.shape === 'lifeline');
  const H = lifelines[0].h ?? 0;
  const cx = (id: string) => (node(p, id)?.x ?? 0) + (node(p, id)?.w ?? 0) / 2;
  const yOf = (e: SpecEdge | undefined) => 40 + ((e?.fromPort as [number, number])[1] ?? 0) * H;
  const msg = (text: string) => p.edges.find((e) => e.text === text);
  ok(p.edges.slice(0, 3).map((e) => e.text).join('|') === '1. Hello Bob|2. Think|3. Hi Alice', `autonumber: each message numbered (${p.edges.slice(0, 3).map((e) => e.text)})`);
  ok(msg('14. Bye') && msg('15. Bye too'), 'two messages on one line, apart by a semicolon');
  const acts = p.nodes.filter((n) => n.shape === 'activation');
  const firstAct = p.nodes.findIndex((n) => n.shape === 'activation');
  ok(acts.length === 3 && firstAct > p.nodes.findIndex((n) => n.shape === 'lifeline') && p.nodes.slice(firstAct, firstAct + 3).every((n) => n.shape === 'activation'), 'three activations, after the lifelines');
  const outer = acts.find((n) => Math.abs((n.x ?? 0) + 6 - cx('B')) < 0.5);
  const inner = acts.find((n) => Math.abs((n.x ?? 0) - cx('B')) < 0.5);
  ok(outer && Math.abs((outer.y ?? 0) - yOf(msg('1. Hello Bob'))) < 0.5 && Math.abs((outer.y ?? 0) + (outer.h ?? 0) - yOf(msg('4. Done'))) < 0.5 && outer.w === 12, 'A->>+B activates Bob from that row, B-->>-A ends it at its row, centred on his lifeline');
  ok(inner && Math.abs((inner.x ?? 0) - ((outer?.x ?? 0) + 6)) < 0.5 && Math.abs((inner.y ?? 0) - yOf(msg('2. Think'))) < 0.5, 'one inside another 6 to the right');
  const onC = acts.find((n) => Math.abs((n.x ?? 0) + 6 - cx('C')) < 0.5);
  ok(onC && (onC.h ?? 0) >= 20 && Math.abs((onC.y ?? 0) - yOf(msg('4. Done'))) < 0.5, `activate and deactivate: from the row before, at least 20 high (${onC?.h})`);
  const note = (t: string) => p.nodes.find((n) => n.shape === 'note' && n.text === t);
  const right = note('Bob thinks');
  const left = note('Alice waits');
  const over = note('Carol alone');
  const all = note('A note over all three of them');
  ok(right && Math.abs((right.x ?? 0) - cx('B') - 16) < 0.5 && (right.w ?? 0) >= 100, 'a note right of its lifeline, 100 wide at least');
  ok(left && Math.abs((left.x ?? 0) + (left.w ?? 0) - cx('A') + 16) < 0.5 && (left.x ?? -1) >= 0, 'a note left of the first lifeline, everything moved right to make room');
  ok(over && Math.abs((over.x ?? 0) + (over.w ?? 0) / 2 - cx('C')) < 1, 'a note over a lifeline, in its middle');
  ok(all && (all.x ?? 0) <= cx('A') - 20 && (all.x ?? 0) + (all.w ?? 0) >= cx('C') + 20, 'a note over several, across them all');
  ok(right && left && (left.y ?? 0) >= (right.y ?? 0) + (right.h ?? 0) && (right.y ?? 0) > yOf(msg('5. Ping')), 'each note a row of its own');
  ok(all && (all.h ?? 0) >= 30 && (all.w ?? 0) >= width('A note over all three of them') + 20, 'a note as large as its words');
  const frames = p.nodes.filter((n) => n.shape === 'frame');
  const firstLifeline = p.nodes.findIndex((n) => n.shape === 'lifeline');
  ok(frames.length === 4 && p.nodes.slice(0, firstLifeline).every((n) => n.shape === 'frame' || n.shape === 'bar'), `four frames (rect left out), before the lifelines (${frames.length})`);
  const loop = frames.find((f) => f.text === 'loop [Every minute]');
  const tick = msg('6. Tick');
  ok(loop && Math.abs((loop.x ?? 0) - (cx('B') - 70)) < 0.5 && Math.abs((loop.x ?? 0) + (loop.w ?? 0) - (cx('C') + 70)) < 0.5, 'a loop’s frame across its lifelines’ middles, 70 past each');
  ok(loop && tick && (loop.y ?? 0) + 30 <= yOf(tick) - 10 && (loop.y ?? 0) + (loop.h ?? 0) >= yOf(tick) + 22 + 10 - 0.5, 'its head above its rows, its foot 10 under its last');
  const alt = frames.find((f) => f.text === 'alt [is sick]');
  const bars = p.nodes.filter((n) => n.shape === 'bar');
  ok(alt && Math.abs((alt.x ?? 0) - (cx('A') - 70)) < 0.5 && Math.abs((alt.x ?? 0) + (alt.w ?? 0) - (cx('B') + 70)) < 0.5, 'an alt’s frame');
  const altBars = bars.filter((b) => alt && (b.y ?? 0) > (alt.y ?? 0) && (b.y ?? 0) < (alt.y ?? 0) + (alt.h ?? 0));
  ok(altBars.length === 2 && altBars.every((b) => b.h === 1 && b.w === alt?.w && b.x === alt?.x && b.stroke === '#9198a1'), 'each else a thin line across its frame');
  ok(altBars.length === 2 && yOf(msg('7. Not so good')) < (altBars[0].y ?? 0) && (altBars[0].y ?? 0) < yOf(msg('8. Fresh')) && (altBars[1].y ?? 0) < yOf(msg('9. Shrug')), 'the lines between the parts');
  const cond = p.nodes.find((n) => n.shape === 'text' && n.text === '[is well]');
  ok(cond && Math.abs((cond.y ?? 0) - (altBars[0]?.y ?? 0)) < 10 && (cond.x ?? 0) > (alt?.x ?? 0) && p.nodes.indexOf(cond) > p.nodes.indexOf(all as SpecNode), 'an else’s condition under its line, at the left, after the notes');
  ok(!p.nodes.some((n) => n.shape === 'text' && n.text === '[]'), 'an else with no condition has no words');
  ok(frames.some((f) => f.text === 'opt') && frames.some((f) => f.text === 'par [Alice to Bob]') && p.nodes.some((n) => n.text === '[Alice to Carol]'), 'a block with no words is its keyword; par and and');
  ok(notes.includes('the coloured backgrounds of rect blocks are left out') && notes.includes('destroy lines are left out: every lifeline runs to the end'), `rect and destroy said (${notes.join('; ')})`);
  for (const n of p.nodes) {
    if (n.shape === 'lifeline') continue;
    ok((n.y ?? 0) >= 40 && (n.y ?? 0) + (n.h ?? 0) <= 40 + H + 0.5, `${n.id} within the lifelines’ length`);
  }
  const numbered = mermaidSpec('sequenceDiagram\n  autonumber 10 5\n  A->>B: x\n  B->>A: y\n  autonumber off\n  A->>B: z').page;
  ok(numbered.edges.map((e) => e.text).join() === '10. x,15. y,z', 'autonumber from 10 by 5, then off');
  const mermaid11 = mermaidSpec('sequenceDiagram\n  participant A@{ "type": "actor" }\n  participant D@{ "type": "database" } as Store\n  A->>D: save');
  ok(node(mermaid11.page, 'A')?.shape === 'lifeline' && node(mermaid11.page, 'D')?.text === 'Store' && mermaid11.notes.some((n) => n.startsWith('kinds of participant')), 'Mermaid 11 participants with their kind');
  const empty = mermaidSpec('sequenceDiagram\n  participant A\n  participant B').page;
  sound(empty, 'participants alone');
  ok(empty.edges.length === 0 && empty.nodes.length === 2 && (empty.nodes[0].h ?? 0) > 40, 'participants alone: their lifelines');
}

// ---- what it refuses, and what is Mermaid -----------------------------------------------------------------------------------
{
  for (const [text, kind] of [
    ['gantt\n  title A plan\n  section A\n  Task :a1, 2024-01-01, 30d', 'gantt'],
    ['pie title Pets\n  "Dogs" : 386', 'pie'],
    ['journey\n  title My day', 'journey'],
    ['gitGraph\n  commit', 'gitGraph'],
    ['timeline\n  title History', 'timeline'],
    ['quadrantChart\n  title Reach', 'quadrantChart'],
    ['sankey-beta\n  a,b,1', 'sankey'],
    ['xychart-beta\n  title Sales', 'xychart'],
    ['C4Context\n  title System', 'C4Context'],
    ['requirementDiagram\n  requirement r {\n  }', 'requirementDiagram'],
  ])
    ok(errorOf(text) === `Mermaid ${kind} diagrams cannot become an editable diagram; ${SUPPORTED}`, `${kind}: refused, saying which kinds can (${errorOf(text)})`);
  for (const text of ['hello world', 'A --> B', '', '   \n\t', 'graph of sales by month', '{"nodes": []}'])
    ok(/^This is not a Mermaid diagram: .*flowchart, mindmap, classDiagram, erDiagram, stateDiagram or sequenceDiagram/.test(errorOf(text)), `${JSON.stringify(text)}: not Mermaid, saying what it should start with`);
  ok(errorOf('flowchart XY\n  A --> B') === 'A flowchart runs TD, TB, BT, LR or RL, not XY.', 'a flowchart’s direction that is none');
  for (const text of ['flowchart TD\n  A-->B', 'graph LR', '%% a comment\nsequenceDiagram\n  A->>B: hi', '---\ntitle: T\n---\nclassDiagram\n  A <|-- B', '%%{init: {}}%%\nerDiagram', 'stateDiagram-v2\n  [*] --> A', 'stateDiagram', 'mindmap\n  root', '```mermaid\nflowchart TD\n```', 'classDiagram-v2'])
    ok(isMermaid(text), `isMermaid: ${JSON.stringify(text.slice(0, 30))}`);
  for (const text of ['gantt\n  title x', 'pie', 'hello', '', 'graph of sales', 'A --> B', 'flowchart XY'])
    ok(!isMermaid(text), `not isMermaid: ${JSON.stringify(text)}`);
}

// ---- Mermaid cut short, as it streams in: every beginning reads, or is refused as not Mermaid yet -------------------------------
{
  const texts = [
    'flowchart LR\n  A[Start] --> B{Is it?}\n  B -->|Yes| C("Done [ok]")\n  subgraph S [Box]\n    D -.-> E@{ shape: doc, label: "A doc" }\n  end\n  style A fill:#f9f\n  linkStyle 0 stroke:#f00\n  F["`**md**\n  two`"] --> G',
    'mindmap\n  root((Root))\n    A\n      a1[Square]\n    B))Bang((\n    C["`multi\nline`"]',
    'classDiagram\n  Animal <|-- Duck\n  Customer "1" --> "*" Ticket : buys\n  class Duck{\n    +swim()\n  }\n  namespace N {\n    class X\n  }',
    'erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER {\n    int id PK "c"\n  }\n  p[Person] ||--|| a : has',
    'stateDiagram-v2\n  [*] --> A\n  state B {\n    [*] --> b1\n  }\n  state f <<fork>>\n  note left of A\n    two\n  end note\n  A --> [*]',
    'sequenceDiagram\n  autonumber\n  participant A as Alice\n  A->>+B: Hi\n  loop Each\n    B-->>-A: Yo\n  alt x\n    A->>A: self\n  else y\n    Note over A,B: n\n  end\n  end',
  ];
  for (const text of texts) {
    let bad = '';
    for (let i = 0; i <= text.length && !bad; i++) {
      try {
        const r = mermaidSpec(text.slice(0, i));
        const pr = problems(r.page);
        if (pr.length) bad = `at ${i}: ${pr[0]}`;
      } catch (e) {
        if (!(e instanceof Error) || e.constructor !== Error || !/^(This is not a Mermaid diagram|A flowchart runs)/.test(e.message)) bad = `at ${i}: ${String(e)}`;
      }
    }
    ok(!bad, `${text.split('\n')[0]} cut short anywhere: a sound page or not Mermaid yet ${bad}`);
  }
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
