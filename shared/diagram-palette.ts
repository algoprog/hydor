// The shape library the diagram editor offers, as draw.io's sidebar does: groups of ready shapes (a kind of shape with its
// size, words and look, a flowchart's Decision a diamond with a question in it), connectors to drop, sticky notes, and
// icons for network and cloud diagrams. Labels are the app's words (translated); `also` holds more English words the
// search finds an entry by.
import type { DiagramEdge, DiagramStyle, ShapeKind } from './diagram.ts';
import { STICKY_COLOURS } from './diagram.ts';

export interface PaletteEntry {
  id: string;
  label: string;
  shape?: ShapeKind;
  w?: number;
  h?: number;
  text?: string;
  rows?: string[];
  style?: DiagramStyle;
  /** An icon shape's icon, by its Lucide name. */
  icon?: string;
  /** A connector to drop instead of a shape. */
  edge?: Pick<DiagramEdge, 'route' | 'style'>;
  also?: string;
}

export interface PaletteGroup {
  id: string;
  label: string;
  entries: PaletteEntry[];
}

const E = (id: string, label: string, shape: ShapeKind, more: Omit<PaletteEntry, 'id' | 'label' | 'shape'> = {}): PaletteEntry => ({ id, label, shape, ...more });
const I = (id: string, label: string, icon: string, also = ''): PaletteEntry => ({ id: `net.${id}`, label, shape: 'icon', icon, text: label, also });

export const PALETTE: PaletteGroup[] = [
  {
    id: 'general',
    label: 'General',
    entries: [
      E('general.rect', 'Rectangle', 'rect', { also: 'box square process' }),
      E('general.rounded', 'Rounded rectangle', 'rounded', { also: 'box' }),
      E('general.ellipse', 'Ellipse', 'ellipse', { also: 'oval' }),
      E('general.circle', 'Circle', 'ellipse', { w: 80, h: 80 }),
      E('general.diamond', 'Diamond', 'diamond', { also: 'rhombus decision' }),
      E('general.triangle', 'Triangle', 'triangle'),
      E('general.hexagon', 'Hexagon', 'hexagon'),
      E('general.parallelogram', 'Parallelogram', 'parallelogram'),
      E('general.trapezoid', 'Trapezoid', 'trapezoid'),
      E('general.cylinder', 'Cylinder', 'cylinder', { also: 'database storage' }),
      E('general.cloud', 'Cloud', 'cloud'),
      E('general.document', 'Document', 'document'),
      E('general.note', 'Note', 'note', { also: 'comment folded' }),
      E('general.card', 'Card', 'card'),
      E('general.callout', 'Speech bubble', 'callout', { also: 'callout' }),
      E('general.cube', 'Cube', 'cube', { also: '3d box' }),
      E('general.star', 'Star', 'star'),
      E('general.cross', 'Plus', 'cross', { also: 'cross' }),
      E('general.heart', 'Heart', 'heart'),
      E('general.octagon', 'Octagon', 'octagon', { also: 'stop' }),
      E('general.pentagon', 'Pentagon', 'pentagon'),
      E('general.step', 'Step', 'step', { also: 'chevron process arrow' }),
      E('general.chevron', 'Arrow box', 'chevron', { also: 'chevron signpost' }),
      E('general.text', 'Text', 'text', { text: 'Text', also: 'label words' }),
      E('general.heading', 'Heading', 'text', { text: 'Heading', w: 200, h: 40, style: { size: 24, bold: true }, also: 'title' }),
      E('general.image', 'Picture', 'image', { also: 'image photo' }),
      E('general.brace', 'Brace', 'brace', { also: 'curly bracket' }),
      E('general.bracket', 'Brackets', 'bracket'),
      E('general.arrow-right', 'Arrow right', 'arrow-right', { also: 'block arrow' }),
      E('general.arrow-left', 'Arrow left', 'arrow-left', { also: 'block arrow' }),
      E('general.arrow-up', 'Arrow up', 'arrow-up', { also: 'block arrow' }),
      E('general.arrow-down', 'Arrow down', 'arrow-down', { also: 'block arrow' }),
      E('general.arrow-both', 'Double arrow', 'arrow-both', { also: 'block arrow' }),
    ],
  },
  {
    id: 'lines',
    label: 'Connectors',
    entries: [
      { id: 'lines.arrow', label: 'Arrow', edge: {}, also: 'connector line' },
      { id: 'lines.line', label: 'Line', edge: { style: { end: 'none' } } },
      { id: 'lines.dashed', label: 'Dashed arrow', edge: { style: { dash: 'dashed' } } },
      { id: 'lines.both', label: 'Two-way arrow', edge: { style: { start: 'arrow' } }, also: 'double headed' },
      { id: 'lines.straight', label: 'Straight arrow', edge: { route: 'straight' } },
      { id: 'lines.curved', label: 'Curved arrow', edge: { route: 'curved' } },
      { id: 'lines.thick', label: 'Thick arrow', edge: { style: { width: 3, end: 'block' } } },
    ],
  },
  {
    id: 'flowchart',
    label: 'Flowchart',
    entries: [
      E('flow.terminator', 'Start or end', 'terminator', { text: 'Start', also: 'terminator begin finish' }),
      E('flow.process', 'Process', 'rect', { text: 'Process', also: 'step action' }),
      E('flow.decision', 'Decision', 'diamond', { text: 'Decision?', also: 'condition if branch' }),
      E('flow.data', 'Data', 'parallelogram', { text: 'Data', also: 'input output io' }),
      E('flow.predefined', 'Predefined process', 'predefined', { text: 'Subprocess', also: 'subroutine' }),
      E('flow.document', 'Document', 'document', { text: 'Document' }),
      E('flow.documents', 'Documents', 'multi-document', { text: 'Documents', also: 'multiple' }),
      E('flow.database', 'Database', 'cylinder', { text: 'Database', also: 'storage db' }),
      E('flow.manual-input', 'Manual input', 'manual-input', { text: 'Input' }),
      E('flow.manual-operation', 'Manual operation', 'manual-operation', { text: 'Manual step' }),
      E('flow.preparation', 'Preparation', 'hexagon', { text: 'Prepare' }),
      E('flow.delay', 'Delay', 'delay', { text: 'Wait', also: 'wait' }),
      E('flow.display', 'Display', 'display', { text: 'Display', also: 'screen' }),
      E('flow.stored-data', 'Stored data', 'stored-data', { text: 'Stored data' }),
      E('flow.internal-storage', 'Internal storage', 'internal-storage', { text: 'Memory' }),
      E('flow.off-page', 'Off-page link', 'off-page', { text: 'A', also: 'connector reference' }),
      E('flow.connector', 'On-page link', 'connector', { text: 'A', also: 'connector junction' }),
      E('flow.merge', 'Merge', 'merge'),
      E('flow.extract', 'Extract', 'extract'),
      E('flow.sort', 'Sort', 'sort'),
      E('flow.collate', 'Collate', 'collate'),
      E('flow.or', 'Or', 'or'),
      E('flow.summing', 'Summing junction', 'summing', { also: 'and' }),
      E('flow.loop-limit', 'Loop limit', 'loop-limit', { text: 'Loop', also: 'repeat' }),
      E('flow.punched-tape', 'Punched tape', 'punched-tape'),
      E('flow.annotation', 'Comment', 'annotation', { text: 'A comment', also: 'annotation' }),
    ],
  },
  {
    id: 'containers',
    label: 'Containers',
    entries: [
      E('box.container', 'Group box', 'container', { text: 'Group', also: 'boundary zone region vpc' }),
      E('box.swimlane', 'Swimlane', 'swimlane', { text: 'Lane', also: 'column' }),
      E('box.lane', 'Horizontal lane', 'lane', { text: 'Lane', also: 'pool row swimlane' }),
      E('box.frame', 'Frame', 'frame', { text: 'frame', also: 'uml fragment alt loop' }),
      E('box.package', 'Package', 'package', { text: 'Package', also: 'folder' }),
    ],
  },
  {
    id: 'uml',
    label: 'UML',
    entries: [
      E('uml.class', 'Class', 'class', { text: 'ClassName', rows: ['+ field: Type', '---', '+ method(): Type'], also: 'object' }),
      E('uml.interface', 'Interface', 'class', { text: '«interface»\nName', rows: ['+ method(): Type'] }),
      E('uml.actor', 'Actor', 'actor', { text: 'Actor', also: 'person user stick' }),
      E('uml.usecase', 'Use case', 'ellipse', { text: 'Use case', w: 140, h: 70 }),
      E('uml.component', 'Component', 'component', { text: 'Component' }),
      E('uml.node', 'Node', 'cube', { text: 'Node', also: 'device server' }),
      E('uml.lifeline', 'Lifeline', 'lifeline', { text: 'Object', also: 'sequence participant' }),
      E('uml.activation', 'Activation', 'activation', { also: 'sequence execution' }),
      E('uml.initial', 'Initial state', 'initial', { also: 'start' }),
      E('uml.final', 'Final state', 'final', { also: 'end' }),
      E('uml.state', 'State', 'rounded', { text: 'State' }),
      E('uml.choice', 'Choice', 'diamond', { w: 40, h: 40 }),
      E('uml.bar', 'Fork or join', 'bar', { also: 'synchronization' }),
      E('uml.note', 'Note', 'note', { text: 'Note' }),
    ],
  },
  {
    id: 'er',
    label: 'Entity relation',
    entries: [
      E('er.entity', 'Entity', 'entity', { text: 'Customer', rows: ['id int PK', 'name text', 'email text'], also: 'table database' }),
      E('er.table', 'Table', 'table', { rows: ['Name | Role', 'Ada | Engineer', 'Grace | Admiral'], also: 'grid cells' }),
      E('er.relationship', 'Relationship', 'diamond', { text: 'has', w: 110, h: 70 }),
      E('er.attribute', 'Attribute', 'ellipse', { text: 'attribute', w: 110, h: 50 }),
    ],
  },
  {
    id: 'bpmn',
    label: 'BPMN',
    entries: [
      E('bpmn.task', 'Task', 'rounded', { text: 'Task', also: 'activity' }),
      E('bpmn.start', 'Start event', 'event', { also: 'circle' }),
      E('bpmn.mid', 'Intermediate event', 'event-mid'),
      E('bpmn.end', 'End event', 'event-end'),
      E('bpmn.gateway', 'Exclusive gateway', 'gateway', { also: 'xor decision' }),
      E('bpmn.parallel', 'Parallel gateway', 'gateway-parallel', { also: 'and' }),
      E('bpmn.inclusive', 'Inclusive gateway', 'gateway-inclusive', { also: 'or' }),
      E('bpmn.data', 'Data object', 'data-object'),
      E('bpmn.pool', 'Pool', 'lane', { text: 'Pool', also: 'lane participant' }),
    ],
  },
  {
    id: 'network',
    label: 'Network and cloud',
    entries: [
      I('server', 'Server', 'server', 'host machine'),
      I('database', 'Database', 'database', 'db sql storage'),
      I('cloud', 'Cloud', 'cloud'),
      I('globe', 'Internet', 'globe', 'web www'),
      I('monitor', 'Desktop', 'monitor', 'computer pc'),
      I('laptop', 'Laptop', 'laptop'),
      I('phone', 'Phone', 'smartphone', 'mobile'),
      I('tablet', 'Tablet', 'tablet'),
      I('router', 'Router', 'router'),
      I('network', 'Switch', 'network', 'load balancer lan'),
      I('firewall', 'Firewall', 'brick-wall', 'security'),
      I('wifi', 'Wi-Fi', 'wifi', 'wireless'),
      I('disk', 'Storage', 'hard-drive', 'disk drive'),
      I('cpu', 'Compute', 'cpu', 'processor'),
      I('container', 'Container', 'container', 'docker'),
      I('cluster', 'Cluster', 'boxes', 'kubernetes'),
      I('queue', 'Queue', 'layers', 'stream kafka'),
      I('cache', 'Cache', 'zap', 'redis fast'),
      I('function', 'Function', 'square-function', 'lambda serverless'),
      I('api', 'API', 'webhook', 'endpoint rest'),
      I('app', 'App', 'app-window', 'browser web'),
      I('code', 'Code', 'code', 'service'),
      I('terminal', 'Terminal', 'terminal', 'cli shell'),
      I('gear', 'Service', 'cog', 'settings worker'),
      I('lock', 'Lock', 'lock', 'secure auth'),
      I('shield', 'Shield', 'shield-check', 'security'),
      I('key', 'Key', 'key-round', 'secret credential'),
      I('user', 'User', 'user', 'person customer'),
      I('users', 'Users', 'users', 'people team group'),
      I('mail', 'Email', 'mail', 'message'),
      I('bot', 'Bot', 'bot', 'agent ai'),
      I('brain', 'AI model', 'brain', 'llm ml'),
      I('file', 'File', 'file-text', 'document'),
      I('folder', 'Folder', 'folder'),
      I('cart', 'Shop', 'shopping-cart', 'store checkout'),
      I('card', 'Payment', 'credit-card', 'pay'),
      I('bell', 'Notification', 'bell', 'alert'),
      I('chart', 'Analytics', 'chart-bar', 'metrics dashboard'),
      I('building', 'Office', 'building-2', 'company'),
      I('warehouse', 'Warehouse', 'warehouse'),
      I('truck', 'Delivery', 'truck', 'shipping'),
      I('printer', 'Printer', 'printer'),
      I('satellite', 'Satellite', 'satellite'),
    ],
  },
  {
    id: 'sticky',
    label: 'Sticky notes',
    entries: STICKY_COLOURS.map((c, i) => E(`sticky.${i}`, 'Sticky note', 'sticky', { style: { fill: c }, also: 'post-it brainstorm' })),
  },
];

export const paletteEntry = (id: string): PaletteEntry | undefined => PALETTE.flatMap((g) => g.entries).find((e) => e.id === id);

/** The entries whose words (or search words) hold every word of a search. */
export function searchPalette(q: string): PaletteEntry[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return PALETTE.flatMap((g) => g.entries.map((e) => ({ e, hay: `${e.label} ${e.also ?? ''} ${e.shape ?? ''} ${g.label}`.toLowerCase() }))).filter((x) => words.every((w) => x.hay.includes(w))).map((x) => x.e);
}
