// The diagrams New offers to start from, as draw.io's templates: a blank page, a flowchart, an org chart, a mind map,
// swimlanes, a cloud architecture, UML classes, an ER diagram, a sequence diagram, a timeline, a kanban board and a
// brainstorm. Each is said as nodes and edges (diagram-spec.ts) and laid out when it is made, or placed by hand where a
// layout would not say it so well. Labels and blurbs are the app's words; the diagrams' own words are English examples
// to write over.
import { normalizeDiagram, type Diagram, type DiagramItem } from './diagram.ts';
import { specPage, type SpecOpts, type SpecPage } from './diagram-spec.ts';

export interface DiagramTemplate {
  id: string;
  label: string;
  blurb: string;
  /** A Lucide icon's name, for its tile. */
  icon: string;
  build: (o: SpecOpts) => Diagram;
}

const one = (spec: SpecPage, o: SpecOpts): Diagram => normalizeDiagram({ pages: [specPage(spec, o).page] });

const flowchart: SpecPage = {
  name: 'Flowchart',
  layout: 'down',
  nodes: [
    { id: 'start', text: 'Start', shape: 'terminator', color: 'green' },
    { id: 'input', text: 'Get the request', shape: 'data' },
    { id: 'check', text: 'Is it complete?', shape: 'decision', color: 'yellow' },
    { id: 'ask', text: 'Ask for what is missing', color: 'orange' },
    { id: 'do', text: 'Do the work', color: 'blue' },
    { id: 'review', text: 'Review it', color: 'blue' },
    { id: 'end', text: 'Done', shape: 'terminator', color: 'grey' },
  ],
  edges: [
    { from: 'start', to: 'input' },
    { from: 'input', to: 'check' },
    { from: 'check', to: 'do', text: 'Yes' },
    { from: 'check', to: 'ask', text: 'No' },
    { from: 'ask', to: 'input' },
    { from: 'do', to: 'review' },
    { from: 'review', to: 'end' },
  ],
};

const org: SpecPage = {
  name: 'Org chart',
  layout: 'tree',
  nodes: [
    { id: 'ceo', text: 'Alex Morgan\nChief Executive', color: 'dark-blue' },
    { id: 'cto', text: 'Sam Lee\nTechnology', color: 'blue' },
    { id: 'cfo', text: 'Riya Patel\nFinance', color: 'blue' },
    { id: 'cmo', text: 'Jo Rivera\nMarketing', color: 'blue' },
    { id: 'eng', text: 'Engineering' },
    { id: 'design', text: 'Design' },
    { id: 'acc', text: 'Accounting' },
    { id: 'brand', text: 'Brand' },
    { id: 'growth', text: 'Growth' },
  ],
  edges: [
    { from: 'ceo', to: 'cto' },
    { from: 'ceo', to: 'cfo' },
    { from: 'ceo', to: 'cmo' },
    { from: 'cto', to: 'eng' },
    { from: 'cto', to: 'design' },
    { from: 'cfo', to: 'acc' },
    { from: 'cmo', to: 'brand' },
    { from: 'cmo', to: 'growth' },
  ],
};

const mind: SpecPage = {
  name: 'Mind map',
  layout: 'mindmap',
  nodes: [
    { id: 'root', text: 'Main idea', shape: 'ellipse', color: 'dark-purple' },
    { id: 'a', text: 'Goals', color: 'blue' },
    { id: 'a1', text: 'This year', color: 'blue' },
    { id: 'a2', text: 'Next year', color: 'blue' },
    { id: 'b', text: 'People', color: 'green' },
    { id: 'b1', text: 'Team', color: 'green' },
    { id: 'b2', text: 'Partners', color: 'green' },
    { id: 'c', text: 'Risks', color: 'red' },
    { id: 'c1', text: 'Budget', color: 'red' },
    { id: 'd', text: 'Next steps', color: 'orange' },
    { id: 'd1', text: 'First step', color: 'orange' },
    { id: 'd2', text: 'Second step', color: 'orange' },
  ],
  edges: [
    ['root', 'a'],
    ['a', 'a1'],
    ['a', 'a2'],
    ['root', 'b'],
    ['b', 'b1'],
    ['b', 'b2'],
    ['root', 'c'],
    ['c', 'c1'],
    ['root', 'd'],
    ['d', 'd1'],
    ['d', 'd2'],
  ].map(([from, to]) => ({ from, to, arrow: 'none' as const })),
};

const lanes: SpecPage = {
  name: 'Process',
  layout: 'right',
  nodes: [
    { id: 'l1', text: 'Customer', shape: 'lane' },
    { id: 'l2', text: 'Sales', shape: 'lane' },
    { id: 'l3', text: 'Delivery', shape: 'lane' },
    { id: 's', text: 'Start', shape: 'terminator', parent: 'l1', color: 'green' },
    { id: 'r', text: 'Send a request', parent: 'l1' },
    { id: 'q', text: 'Write a quote', parent: 'l2', color: 'blue' },
    { id: 'ok', text: 'Approved?', shape: 'decision', parent: 'l1', color: 'yellow' },
    { id: 'plan', text: 'Plan the work', parent: 'l3', color: 'purple' },
    { id: 'deliver', text: 'Deliver', parent: 'l3', color: 'purple' },
    { id: 'e', text: 'End', shape: 'terminator', parent: 'l1', color: 'grey' },
  ],
  edges: [
    { from: 's', to: 'r' },
    { from: 'r', to: 'q' },
    { from: 'q', to: 'ok' },
    { from: 'ok', to: 'plan', text: 'Yes' },
    { from: 'ok', to: 'q', text: 'No' },
    { from: 'plan', to: 'deliver' },
    { from: 'deliver', to: 'e' },
  ],
};

const cloud: SpecPage = {
  name: 'Architecture',
  layout: 'right',
  nodes: [
    { id: 'users', text: 'Users', icon: 'users' },
    { id: 'cdn', text: 'CDN', icon: 'globe' },
    { id: 'vpc', text: 'Cloud', shape: 'container' },
    { id: 'lb', text: 'Load balancer', icon: 'network', parent: 'vpc' },
    { id: 'web', text: 'Web servers', icon: 'server', parent: 'vpc' },
    { id: 'api', text: 'API', icon: 'webhook', parent: 'vpc' },
    { id: 'db', text: 'Database', shape: 'cylinder', parent: 'vpc', color: 'purple' },
    { id: 'cache', text: 'Cache', shape: 'cylinder', parent: 'vpc', color: 'red' },
    { id: 'queue', text: 'Queue', icon: 'layers', parent: 'vpc' },
  ],
  edges: [
    { from: 'users', to: 'cdn' },
    { from: 'cdn', to: 'lb', text: 'HTTPS' },
    { from: 'lb', to: 'web' },
    { from: 'web', to: 'api' },
    { from: 'api', to: 'db' },
    { from: 'api', to: 'cache' },
    { from: 'api', to: 'queue', dashed: true },
  ],
};

const classes: SpecPage = {
  name: 'Classes',
  layout: 'down',
  nodes: [
    { id: 'animal', shape: 'class', text: '«abstract»\nAnimal', rows: ['- name: String', '- age: int', '---', '+ speak(): String', '+ move(): void'] },
    { id: 'dog', shape: 'class', text: 'Dog', rows: ['- breed: String', '---', '+ fetch(): void'] },
    { id: 'cat', shape: 'class', text: 'Cat', rows: ['- indoor: boolean', '---', '+ climb(): void'] },
    { id: 'owner', shape: 'class', text: 'Owner', rows: ['- name: String', '---', '+ adopt(a: Animal): void'], color: 'blue' },
  ],
  edges: [
    { from: 'animal', to: 'dog', start: 'triangle', end: 'none' },
    { from: 'animal', to: 'cat', start: 'triangle', end: 'none' },
    { from: 'owner', to: 'animal', start: 'diamond-open', end: 'none', fromText: '1', toText: '0..*' },
  ],
};

const er: SpecPage = {
  name: 'Database',
  layout: 'right',
  nodes: [
    { id: 'customer', shape: 'entity', text: 'customer', rows: ['id int PK', 'name text', 'email text'], color: 'blue' },
    { id: 'order', shape: 'entity', text: 'order', rows: ['id int PK', 'customer_id int FK', 'placed_at timestamp'], color: 'blue' },
    { id: 'item', shape: 'entity', text: 'order_item', rows: ['order_id int FK', 'product_id int FK', 'quantity int'], color: 'blue' },
    { id: 'product', shape: 'entity', text: 'product', rows: ['id int PK', 'name text', 'price numeric'], color: 'blue' },
  ],
  edges: [
    { from: 'customer', to: 'order', start: 'er-only-one', end: 'er-zero-many', text: 'places' },
    { from: 'order', to: 'item', start: 'er-only-one', end: 'er-one-many', text: 'contains' },
    { from: 'product', to: 'item', start: 'er-only-one', end: 'er-zero-many' },
  ],
};

/** A sequence diagram, placed by hand: lifelines and the messages between them. */
function sequence(o: SpecOpts): Diagram {
  const names = ['Browser', 'Server', 'Database'];
  const H = 330;
  const nodes = names.map((n, i) => ({ id: `l${i}`, text: n, shape: 'lifeline', x: 40 + i * 220, y: 40, w: 140, h: H }));
  const msgs: [number, number, string, boolean][] = [
    [0, 1, 'GET /orders', false],
    [1, 2, 'SELECT orders', false],
    [2, 1, 'rows', true],
    [1, 0, '200 OK (JSON)', true],
  ];
  const edges = msgs.map(([a, b, text, reply], i) => {
    const fy = Math.round(((100 + i * 50) / H) * 10000) / 10000;
    return { from: `l${a}`, to: `l${b}`, text, fromPort: [0.5, fy] as [number, number], toPort: [0.5, fy] as [number, number], route: 'straight' as const, ...(reply ? { dashed: true, end: 'open' } : {}) };
  });
  return one({ name: 'Sequence', layout: 'none', nodes: [...nodes, { id: 'act', shape: 'activation', x: 40 + 220 + 64, y: 40 + 92, w: 12, h: 166 }], edges }, o);
}

/** A timeline, placed by hand: a line, its milestones, and what each one is, above and below it by turns. */
function timeline(o: SpecOpts): Diagram {
  const steps = [
    ['Jan', 'Kick-off'],
    ['Mar', 'First prototype'],
    ['May', 'User tests'],
    ['Jul', 'Beta launch'],
    ['Sep', 'Launch'],
  ];
  const colours = ['blue', 'green', 'orange', 'purple', 'red'];
  const nodes = steps.flatMap(([when, what], i) => {
    const x = 80 + i * 180;
    const up = i % 2 === 0;
    return [
      { id: `dot${i}`, shape: 'ellipse', x: x - 9, y: 191, w: 18, h: 18, color: `dark-${colours[i]}` },
      { id: `when${i}`, shape: 'text', text: when, x: x - 40, y: up ? 214 : 160, w: 80, h: 26, style: { bold: true } },
      { id: `what${i}`, text: what, color: colours[i], x: x - 70, y: up ? 96 : 250, w: 140, h: 52 },
    ];
  });
  const edges = steps.flatMap((_, i) => [{ from: `dot${i}`, to: `what${i}`, arrow: 'none' as const, route: 'straight' as const, dashed: true }]);
  const d = one({ name: 'Timeline', layout: 'none', nodes, edges }, o);
  // The line itself: a thick connector from end to end, behind the milestones.
  const line: DiagramItem = { id: 'axis', type: 'edge', from: { x: 40, y: 200 }, to: { x: 80 + (steps.length - 1) * 180 + 60, y: 200 }, route: 'straight', style: { width: 3, end: 'block' } };
  d.pages[0].items.unshift(line);
  return d;
}

/** A kanban board: columns of sticky notes. */
function kanban(o: SpecOpts): Diagram {
  const cols = [
    ['To do', ['Write the brief', 'Book the venue', 'Draft the budget']],
    ['Doing', ['Design the poster', 'Call the sponsors']],
    ['Done', ['Pick a date']],
  ] as const;
  const fills = ['#fff1a8', '#b8e3ff', '#c3f0ca'];
  const nodes = cols.flatMap(([name, cards], i) => [
    { id: `c${i}`, shape: 'swimlane', text: name, x: 40 + i * 240, y: 40, w: 220, h: 520 },
    ...cards.map((t, j) => ({ id: `n${i}${j}`, shape: 'sticky', text: t, parent: `c${i}`, x: 40 + i * 240 + 30, y: 40 + 54 + j * 150, w: 160, h: 130, fill: fills[i] })),
  ]);
  return one({ name: 'Board', layout: 'none', nodes, edges: [] }, o);
}

const brainstorm: SpecPage = {
  name: 'Brainstorm',
  layout: 'radial',
  nodes: [
    { id: 'q', text: 'How might we…?', shape: 'cloud', color: 'dark-blue' },
    ...['Idea one', 'Idea two', 'Idea three', 'Idea four', 'Idea five', 'Idea six'].map((t, i) => ({ id: `i${i}`, text: t, shape: 'sticky', fill: ['#fff1a8', '#ffd3a3', '#ffc2d1', '#d4c2ff', '#b8e3ff', '#c3f0ca'][i] })),
  ],
  edges: [0, 1, 2, 3, 4, 5].map((i) => ({ from: 'q', to: `i${i}`, arrow: 'none' as const, dashed: true })),
};

export const DIAGRAM_TEMPLATES: DiagramTemplate[] = [
  { id: 'blank', label: 'Blank', blurb: 'An empty page', icon: 'square-dashed', build: () => normalizeDiagram({}) },
  { id: 'flowchart', label: 'Flowchart', blurb: 'Steps and decisions', icon: 'workflow', build: (o) => one(flowchart, o) },
  { id: 'org', label: 'Org chart', blurb: 'Who reports to whom', icon: 'network', build: (o) => one(org, o) },
  { id: 'mindmap', label: 'Mind map', blurb: 'Ideas round a topic', icon: 'brain', build: (o) => one(mind, o) },
  { id: 'swimlanes', label: 'Swimlanes', blurb: 'A process across roles', icon: 'rows-3', build: (o) => one(lanes, o) },
  { id: 'architecture', label: 'Architecture', blurb: 'Systems and how they connect', icon: 'server', build: (o) => one(cloud, o) },
  { id: 'uml-class', label: 'UML classes', blurb: 'Classes and how they relate', icon: 'box', build: (o) => one(classes, o) },
  { id: 'er', label: 'Database (ER)', blurb: 'Tables and their keys', icon: 'database', build: (o) => one(er, o) },
  { id: 'sequence', label: 'Sequence', blurb: 'Messages over time', icon: 'arrow-right-left', build: sequence },
  { id: 'timeline', label: 'Timeline', blurb: 'Milestones in order', icon: 'milestone', build: timeline },
  { id: 'kanban', label: 'Kanban board', blurb: 'Cards in columns', icon: 'square-kanban', build: kanban },
  { id: 'brainstorm', label: 'Brainstorm', blurb: 'Sticky notes round a question', icon: 'sticky-note', build: (o) => one(brainstorm, o) },
];

export const diagramTemplate = (id: string) => DIAGRAM_TEMPLATES.find((t) => t.id === id);
