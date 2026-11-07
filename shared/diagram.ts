// Diagrams: flowcharts, org charts, mind maps, network and architecture diagrams, UML, ER and sequence diagrams,
// swimlanes, as in draw.io, Lucidchart or Visio. A diagram is a kind of page of the Library (server/pages/kinds.ts)
// whose model is kept here: pages (the tabs at its foot), each a canvas of items drawn in their order (back to front):
//
//   - shapes, each of a kind of the shape library (diagram-shapes.ts says how each is drawn), placed where they are
//     (x, y, w, h in pixels, turned by rot degrees about their middle), with their words and their look; a shape in a
//     container (a swimlane, a group box, a UML package) names it as its parent, and moves with it;
//   - connectors, from a shape (or a free point) to a shape (or a point): joined to a shape, an end follows it when it
//     moves, at a fixed point of it (port: where on its box, as fractions) or at the side that faces the other end; a
//     connector runs at right angles (orthogonal, the default), straight, or curved, through the points it is given.
//
// Colours left out follow the theme a diagram is shown in (dark lines and words on light paper, or the other way round),
// so a diagram reads in the app's dark theme as in its light one; a colour given stays as it is. The model is kept as
// text with a line for each item (diagramText), so two versions read as a diff of lines.
import type { IconNode } from './slides.ts';

export const DIAGRAM_VERSION = 1;

/** The most a diagram may hold. */
export const DIAGRAM_LIMITS = { pages: 40, items: 3000, text: 4000, rows: 200, points: 60, name: 80, coord: 1_000_000, size: 100_000 };

// ---- what a diagram holds -------------------------------------------------------------------------------------------

/** Where a connector's ends meet a shape, or a free end, and how its ends are drawn. */
export type ArrowKind =
  | 'none'
  | 'arrow'
  | 'open'
  | 'block'
  | 'triangle'
  | 'diamond'
  | 'diamond-open'
  | 'circle'
  | 'circle-open'
  | 'bar'
  | 'cross'
  | 'er-one'
  | 'er-only-one'
  | 'er-zero-one'
  | 'er-many'
  | 'er-one-many'
  | 'er-zero-many';

export const ARROWS: { id: ArrowKind; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'arrow', label: 'Arrow' },
  { id: 'open', label: 'Open arrow' },
  { id: 'block', label: 'Triangle' },
  { id: 'triangle', label: 'Hollow triangle' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'diamond-open', label: 'Hollow diamond' },
  { id: 'circle', label: 'Dot' },
  { id: 'circle-open', label: 'Circle' },
  { id: 'bar', label: 'Bar' },
  { id: 'cross', label: 'Cross' },
  { id: 'er-one', label: 'One' },
  { id: 'er-only-one', label: 'One and only one' },
  { id: 'er-zero-one', label: 'Zero or one' },
  { id: 'er-many', label: 'Many' },
  { id: 'er-one-many', label: 'One or many' },
  { id: 'er-zero-many', label: 'Zero or many' },
];
const ARROW_IDS = new Set<string>(ARROWS.map((a) => a.id));

/** How a connector runs: at right angles round the shapes, straight from point to point, or curved. */
export type RouteKind = 'orthogonal' | 'straight' | 'curved';
export const ROUTES: RouteKind[] = ['orthogonal', 'straight', 'curved'];

export type Dash = 'solid' | 'dashed' | 'dotted' | 'dash-dot';
export const DASHES: Dash[] = ['solid', 'dashed', 'dotted', 'dash-dot'];

/** The fonts a diagram's words are in: a sans serif (Helvetica), a serif, a monospaced one and a handwritten one. */
export type FontKind = 'sans' | 'serif' | 'mono' | 'hand';
export const FONTS: { id: FontKind; label: string; css: string }[] = [
  { id: 'sans', label: 'Sans serif', css: "Helvetica, Arial, 'Liberation Sans', sans-serif" },
  { id: 'serif', label: 'Serif', css: "Georgia, 'Times New Roman', 'Liberation Serif', serif" },
  { id: 'mono', label: 'Monospace', css: "'JetBrains Mono', Menlo, Consolas, 'Liberation Mono', monospace" },
  { id: 'hand', label: 'Handwriting', css: "'Comic Sans MS', 'Comic Neue', 'Segoe Print', 'Bradley Hand', 'Chalkboard SE', cursive" },
];
export const fontCss = (f: FontKind | undefined) => (FONTS.find((x) => x.id === f) ?? FONTS[0]).css;

export type Align = 'left' | 'center' | 'right';
export type VAlign = 'top' | 'middle' | 'bottom';
/** Where a shape's words go: inside it, or beside it (an icon's, a person's or a picture's under it). */
export type LabelPos = 'inside' | 'below' | 'above' | 'left' | 'right';

/** How an item looks; what is left out is the theme's (or its kind's own). */
export interface DiagramStyle {
  /** Its fill: a colour (#rrggbb) or 'none'. */
  fill?: string;
  /** A second colour the fill runs to, top to bottom. */
  gradient?: string;
  /** Its line: a colour or 'none'. */
  stroke?: string;
  /** The line's width, in pixels. */
  width?: number;
  dash?: Dash;
  /** How opaque it is, 0 to 100. */
  opacity?: number;
  shadow?: boolean;
  /** A rectangle's rounded corners (pixels); a connector's rounded bends (0 for sharp ones). */
  radius?: number;
  /** Drawn by hand, as on a whiteboard. */
  sketch?: boolean;
  font?: FontKind;
  /** The words' size, in pixels. */
  size?: number;
  /** The words' colour. */
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: Align;
  valign?: VAlign;
  label?: LabelPos;
  /** A connector's ends. */
  start?: ArrowKind;
  end?: ArrowKind;
  /** Dashes that run along a connector, to show what flows (in the editor and the viewer). */
  flow?: boolean;
}

/** An icon of Lucide's library, by its name, with its lines so it draws anywhere. */
export interface DiagramIcon {
  name: string;
  paths: IconNode[];
}

export interface DiagramShape {
  id: string;
  type: 'shape';
  /** Its kind: a shape of the library (SHAPE_KINDS). */
  shape: ShapeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Turned this many degrees, clockwise, about its middle. */
  rot?: number;
  flipH?: boolean;
  flipV?: boolean;
  /** Its words (lines apart by \n). */
  text?: string;
  /** A class's, an entity's or a table's rows under its name ("---" draws a line between parts; "|" splits a table's cells). */
  rows?: string[];
  /** An icon shape's drawing. */
  icon?: DiagramIcon;
  /** A picture's source (naget-asset:…, data:…, https://…). */
  src?: string;
  style?: DiagramStyle;
  /** The container it is in (a swimlane, a group box, a package): it moves with it. */
  parent?: string;
  /** Items grouped together pick and move as one. */
  group?: string;
  /** An address it opens in the viewer. */
  link?: string;
  /** A note shown when pointed at. */
  note?: string;
  locked?: boolean;
}

/** An end of a connector: joined to a shape (at a fixed point of it, or the side that faces the other end), or free. */
export interface DiagramEnd {
  id?: string;
  /** A fixed point of the shape: where on its box, as fractions (0..1) across and down. */
  port?: [number, number];
  x?: number;
  y?: number;
}

export interface DiagramEdge {
  id: string;
  type: 'edge';
  from: DiagramEnd;
  to: DiagramEnd;
  route?: RouteKind;
  /** The points it runs through (an orthogonal one's bends, a curved one's points). */
  points?: [number, number][];
  /** Its words, in its middle (or where `at` says, 0..1 along it). */
  text?: string;
  at?: number;
  /** Words near its ends (an ER diagram's "1" and "N", a UML association's "0..*"). */
  fromText?: string;
  toText?: string;
  style?: DiagramStyle;
  parent?: string;
  group?: string;
  locked?: boolean;
}

export type DiagramItem = DiagramShape | DiagramEdge;

export interface DiagramPage {
  id: string;
  name: string;
  /** The page's colour; left out, the paper of the theme it is shown in. */
  background?: string;
  items: DiagramItem[];
}

export interface Diagram {
  v: number;
  pages: DiagramPage[];
  /** The grid shapes snap to, in pixels (0: none). */
  grid?: number;
  /** The whole diagram drawn by hand. */
  sketch?: boolean;
  /** The font its words are in, unless an item says. */
  font?: FontKind;
}

// ---- the shape library's kinds ----------------------------------------------------------------------------------------

/**
 * Every kind of shape, each drawn by diagram-shapes.ts. Kinds are geometry: the palette (diagram-palette.ts) offers them
 * under names of their own (a flowchart's Decision is a diamond with "Decision?" in it).
 */
export const SHAPE_KINDS = [
  // Basic
  'rect',
  'rounded',
  'ellipse',
  'diamond',
  'triangle',
  'triangle-right',
  'hexagon',
  'octagon',
  'pentagon',
  'parallelogram',
  'trapezoid',
  'star',
  'cross',
  'heart',
  'cylinder',
  'cloud',
  'document',
  'note',
  'card',
  'callout',
  'cube',
  'step',
  'chevron',
  'arrow-right',
  'arrow-left',
  'arrow-up',
  'arrow-down',
  'arrow-both',
  'text',
  'image',
  'icon',
  'sticky',
  'brace',
  'bracket',
  // Flowchart
  'terminator',
  'predefined',
  'manual-input',
  'delay',
  'display',
  'multi-document',
  'off-page',
  'connector',
  'manual-operation',
  'stored-data',
  'internal-storage',
  'merge',
  'extract',
  'sort',
  'collate',
  'or',
  'summing',
  'loop-limit',
  'punched-tape',
  'annotation',
  // Containers
  'container',
  'swimlane',
  'lane',
  // UML and ER
  'class',
  'entity',
  'table',
  'actor',
  'component',
  'package',
  'lifeline',
  'activation',
  'initial',
  'final',
  'bar',
  'frame',
  // BPMN
  'event',
  'event-end',
  'event-mid',
  'gateway',
  'gateway-parallel',
  'gateway-inclusive',
  'data-object',
] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];
const KIND_SET = new Set<string>(SHAPE_KINDS);
export const isShapeKind = (k: unknown): k is ShapeKind => typeof k === 'string' && KIND_SET.has(k);

/** Kinds that hold other shapes: what is dropped inside one is its child, and moves with it. */
export const CONTAINER_KINDS = new Set<ShapeKind>(['container', 'swimlane', 'lane', 'frame', 'package']);
/** Kinds whose words go under them (left out: inside). */
export const LABEL_BELOW = new Set<ShapeKind>(['icon', 'image', 'actor', 'initial', 'final', 'event', 'event-end', 'event-mid', 'gateway', 'gateway-parallel', 'gateway-inclusive', 'bar', 'data-object']);
/** Kinds with rows under their name. */
export const ROW_KINDS = new Set<ShapeKind>(['class', 'entity', 'table']);

/**
 * Names agents (and Mermaid, and draw.io) call shapes by, as the kind they are, with what else they bring: an icon of
 * Lucide's by its name, or words of their own.
 */
export const SHAPE_ALIASES: Record<string, { shape: ShapeKind; icon?: string; style?: DiagramStyle }> = {
  box: { shape: 'rect' },
  rectangle: { shape: 'rect' },
  square: { shape: 'rect' },
  process: { shape: 'rect' },
  'rounded-rect': { shape: 'rounded' },
  'round-rect': { shape: 'rounded' },
  roundrect: { shape: 'rounded' },
  task: { shape: 'rounded' },
  state: { shape: 'rounded' },
  activity: { shape: 'rounded' },
  oval: { shape: 'ellipse' },
  circle: { shape: 'ellipse' },
  usecase: { shape: 'ellipse' },
  'use-case': { shape: 'ellipse' },
  attribute: { shape: 'ellipse' },
  rhombus: { shape: 'diamond' },
  decision: { shape: 'diamond' },
  choice: { shape: 'diamond' },
  relationship: { shape: 'diamond' },
  condition: { shape: 'diamond' },
  pill: { shape: 'terminator' },
  stadium: { shape: 'terminator' },
  start: { shape: 'terminator' },
  end: { shape: 'terminator' },
  'start-end': { shape: 'terminator' },
  terminal: { shape: 'terminator' },
  database: { shape: 'cylinder' },
  db: { shape: 'cylinder' },
  storage: { shape: 'cylinder' },
  data: { shape: 'parallelogram' },
  io: { shape: 'parallelogram' },
  input: { shape: 'parallelogram' },
  output: { shape: 'parallelogram' },
  'input-output': { shape: 'parallelogram' },
  subroutine: { shape: 'predefined' },
  'predefined-process': { shape: 'predefined' },
  subprocess: { shape: 'predefined' },
  preparation: { shape: 'hexagon' },
  documents: { shape: 'multi-document' },
  'multiple-documents': { shape: 'multi-document' },
  'off-page-connector': { shape: 'off-page' },
  junction: { shape: 'connector' },
  'on-page-connector': { shape: 'connector' },
  'sticky-note': { shape: 'sticky' },
  postit: { shape: 'sticky' },
  'post-it': { shape: 'sticky' },
  comment: { shape: 'note' },
  label: { shape: 'text' },
  title: { shape: 'text' },
  picture: { shape: 'image' },
  photo: { shape: 'image' },
  group: { shape: 'container' },
  boundary: { shape: 'container' },
  zone: { shape: 'container' },
  pool: { shape: 'lane' },
  'swim-lane': { shape: 'swimlane' },
  person: { shape: 'actor' },
  user: { shape: 'actor' },
  stickman: { shape: 'actor' },
  interface: { shape: 'class' },
  'uml-class': { shape: 'class' },
  'er-entity': { shape: 'entity' },
  'start-state': { shape: 'initial' },
  'initial-state': { shape: 'initial' },
  'end-state': { shape: 'final' },
  'final-state': { shape: 'final' },
  fork: { shape: 'bar' },
  join: { shape: 'bar' },
  'start-event': { shape: 'event' },
  'end-event': { shape: 'event-end' },
  'intermediate-event': { shape: 'event-mid' },
  'exclusive-gateway': { shape: 'gateway' },
  'parallel-gateway': { shape: 'gateway-parallel' },
  'inclusive-gateway': { shape: 'gateway-inclusive' },
  'data-store': { shape: 'cylinder' },
  queue: { shape: 'cylinder' },
  arrow: { shape: 'arrow-right' },
  'block-arrow': { shape: 'arrow-right' },
  flag: { shape: 'off-page' },
  asymmetric: { shape: 'callout' },
  speech: { shape: 'callout' },
  bubble: { shape: 'callout' },
  box3d: { shape: 'cube' },
  node: { shape: 'cube' },
  folder: { shape: 'package' },
  server: { shape: 'icon', icon: 'server' },
  computer: { shape: 'icon', icon: 'monitor' },
  desktop: { shape: 'icon', icon: 'monitor' },
  laptop: { shape: 'icon', icon: 'laptop' },
  phone: { shape: 'icon', icon: 'smartphone' },
  mobile: { shape: 'icon', icon: 'smartphone' },
  tablet: { shape: 'icon', icon: 'tablet' },
  router: { shape: 'icon', icon: 'router' },
  firewall: { shape: 'icon', icon: 'brick-wall' },
  internet: { shape: 'icon', icon: 'globe' },
  globe: { shape: 'icon', icon: 'globe' },
  users: { shape: 'icon', icon: 'users' },
  team: { shape: 'icon', icon: 'users' },
  api: { shape: 'icon', icon: 'webhook' },
  service: { shape: 'icon', icon: 'cog' },
  lock: { shape: 'icon', icon: 'lock' },
  mail: { shape: 'icon', icon: 'mail' },
  email: { shape: 'icon', icon: 'mail' },
  wifi: { shape: 'icon', icon: 'wifi' },
  'cloud-service': { shape: 'icon', icon: 'cloud' },
  cpu: { shape: 'icon', icon: 'cpu' },
  disk: { shape: 'icon', icon: 'hard-drive' },
  file: { shape: 'icon', icon: 'file' },
  key: { shape: 'icon', icon: 'key-round' },
  browser: { shape: 'icon', icon: 'app-window' },
  app: { shape: 'icon', icon: 'app-window' },
  cache: { shape: 'icon', icon: 'zap' },
  bot: { shape: 'icon', icon: 'bot' },
  ai: { shape: 'icon', icon: 'brain' },
  model: { shape: 'icon', icon: 'brain' },
};

/** A shape's kind as named (a kind, or a name it is known by), with what that name brings. */
export function shapeFrom(v: unknown): { shape: ShapeKind; icon?: string; style?: DiagramStyle } | null {
  if (typeof v !== 'string') return null;
  const k = v
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
  if (isShapeKind(k)) return { shape: k };
  return SHAPE_ALIASES[k] ?? SHAPE_ALIASES[k.replace(/-/g, '')] ?? null;
}

// ---- colours ----------------------------------------------------------------------------------------------------------

/** Ready-made looks, a fill and a line that go together (draw.io's), by name: what agents and the format panel offer. */
export const STYLE_SETS: { id: string; label: string; fill: string; stroke: string; color?: string }[] = [
  { id: 'white', label: 'White', fill: '#ffffff', stroke: '#1f2328' },
  { id: 'grey', label: 'Grey', fill: '#f5f5f5', stroke: '#666666' },
  { id: 'blue', label: 'Blue', fill: '#dae8fc', stroke: '#6c8ebf' },
  { id: 'green', label: 'Green', fill: '#d5e8d4', stroke: '#82b366' },
  { id: 'orange', label: 'Orange', fill: '#ffe6cc', stroke: '#d79b00' },
  { id: 'yellow', label: 'Yellow', fill: '#fff2cc', stroke: '#d6b656' },
  { id: 'red', label: 'Red', fill: '#f8cecc', stroke: '#b85450' },
  { id: 'purple', label: 'Purple', fill: '#e1d5e7', stroke: '#9673a6' },
  { id: 'teal', label: 'Teal', fill: '#d0eeea', stroke: '#3d9a8b' },
  { id: 'pink', label: 'Pink', fill: '#fbe0ef', stroke: '#c2588f' },
  { id: 'dark-blue', label: 'Strong blue', fill: '#1f6feb', stroke: '#1550b4', color: '#ffffff' },
  { id: 'dark-green', label: 'Strong green', fill: '#2da44e', stroke: '#1a7f37', color: '#ffffff' },
  { id: 'dark-orange', label: 'Strong orange', fill: '#e8590c', stroke: '#b4430a', color: '#ffffff' },
  { id: 'dark-red', label: 'Strong red', fill: '#cf222e', stroke: '#a40e26', color: '#ffffff' },
  { id: 'dark-purple', label: 'Strong purple', fill: '#8250df', stroke: '#6339b5', color: '#ffffff' },
  { id: 'dark', label: 'Dark', fill: '#24292f', stroke: '#1f2328', color: '#ffffff' },
];
export const styleSet = (name: unknown) => {
  const k = typeof name === 'string' ? name.trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/^gray/, 'grey') : '';
  return STYLE_SETS.find((s) => s.id === k) ?? STYLE_SETS.find((s) => s.id === `dark-${k.replace(/^strong-/, '')}` && k.startsWith('strong-')) ?? null;
};

/** The colours a sticky note comes in. */
export const STICKY_COLOURS = ['#fff1a8', '#ffd3a3', '#ffc2d1', '#d4c2ff', '#b8e3ff', '#c3f0ca', '#e8e8e8'];

/** Colour names agents use, as colours. */
const NAMED: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#e03131',
  green: '#2f9e44',
  blue: '#1971c2',
  yellow: '#f5c518',
  orange: '#f08c00',
  purple: '#7048e8',
  pink: '#d6336c',
  teal: '#0c8599',
  cyan: '#1098ad',
  grey: '#868e96',
  gray: '#868e96',
  brown: '#8d5524',
  navy: '#1c3d73',
  transparent: 'none',
  none: 'none',
};

/** A colour as a diagram keeps it: #rrggbb (lower case), or 'none' where `none` may be; undefined when it is no colour. */
export function cleanColour(v: unknown, none = true): string | undefined {
  if (typeof v !== 'string') return undefined;
  let s = v.trim().toLowerCase();
  if (NAMED[s]) s = NAMED[s];
  if (s === 'none') return none ? 'none' : undefined;
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${[...s.slice(1)].map((c) => c + c).join('')}`;
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{8}$/.test(s)) return s.slice(0, 7);
  const m = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/.exec(s);
  if (m) return `#${[m[1], m[2], m[3]].map((x) => Math.min(255, Number(x)).toString(16).padStart(2, '0')).join('')}`;
  return undefined;
}

/** How light a colour is, 0 (black) to 1 (white), as the eye sees it. */
export function lightness(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return 1;
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => {
    const c = parseInt(x, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The theme a diagram is drawn in: its paper, its lines and words, and quieter lines. */
export interface DiagramTheme {
  paper: string;
  ink: string;
  muted: string;
  /** Shapes' fill when none is given. */
  fill: string;
  /** The grid's dots. */
  grid: string;
  dark: boolean;
}
export const LIGHT: DiagramTheme = { paper: '#ffffff', ink: '#1f2328', muted: '#6e7781', fill: '#ffffff', grid: '#d8dee4', dark: false };
export const DARK: DiagramTheme = { paper: '#16181d', ink: '#e6e8eb', muted: '#9198a1', fill: '#1d2026', grid: '#30363d', dark: true };

/** Words in a colour that reads on a fill: dark on a light one, white on a dark one. */
export const inkOn = (fill: string) => (lightness(fill) > 0.32 ? '#1f2328' : '#ffffff');

// ---- checking what comes in ---------------------------------------------------------------------------------------------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
/** A coordinate, rounded to a hundredth, in bounds. */
const coord = (v: unknown, d = 0) => r2(clamp(num(v) ?? d, -DIAGRAM_LIMITS.coord, DIAGRAM_LIMITS.coord));
/** Text in bounds, without control characters but its line breaks. */
export const cleanText = (v: unknown, max = DIAGRAM_LIMITS.text): string =>
  (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .slice(0, max);

const ID = /^[\w.:-]{1,64}$/;
let idN = 0;
/** A new id, short and unlikely to meet another. */
export function newId(prefix = 'd'): string {
  idN = (idN + 1) % 1296;
  return `${prefix}${Date.now().toString(36).slice(-5)}${idN.toString(36).padStart(2, '0')}${Math.floor(Math.random() * 1296)
    .toString(36)
    .padStart(2, '0')}`;
}

const FONT_IDS = new Set<string>(FONTS.map((f) => f.id));
const ALIGNS = new Set(['left', 'center', 'right']);
const VALIGNS = new Set(['top', 'middle', 'bottom']);
const LABELS = new Set(['inside', 'below', 'above', 'left', 'right']);
const DASH_SET = new Set<string>(DASHES);

/** An arrow kind as named (draw.io's and Mermaid's names too); undefined when it is none of them. */
export function arrowFrom(v: unknown): ArrowKind | undefined {
  if (v === false || v === null) return 'none';
  if (v === true) return 'arrow';
  if (typeof v !== 'string') return undefined;
  const k = v.trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (ARROW_IDS.has(k)) return k as ArrowKind;
  const alias: Record<string, ArrowKind> = {
    classic: 'arrow',
    filled: 'arrow',
    normal: 'arrow',
    yes: 'arrow',
    v: 'open',
    'open-arrow': 'open',
    'filled-triangle': 'block',
    'hollow-triangle': 'triangle',
    inheritance: 'triangle',
    extends: 'triangle',
    generalization: 'triangle',
    realization: 'triangle',
    composition: 'diamond',
    aggregation: 'diamond-open',
    'hollow-diamond': 'diamond-open',
    dot: 'circle',
    oval: 'circle',
    'hollow-circle': 'circle-open',
    dash: 'bar',
    tee: 'bar',
    x: 'cross',
    one: 'er-one',
    'only-one': 'er-only-one',
    'exactly-one': 'er-only-one',
    'zero-or-one': 'er-zero-one',
    many: 'er-many',
    'one-or-many': 'er-one-many',
    'one-or-more': 'er-one-many',
    'zero-or-many': 'er-zero-many',
    'zero-or-more': 'er-zero-many',
    crowfoot: 'er-many',
  };
  return alias[k];
}

/** A look, checked: what is not one of its own values is left out. */
export function cleanStyle(v: unknown): DiagramStyle | undefined {
  if (!isObj(v)) return undefined;
  const s: DiagramStyle = {};
  const fill = cleanColour(v.fill ?? v.fillColor ?? v.background);
  if (fill) s.fill = fill;
  const gradient = cleanColour(v.gradient ?? v.gradientColor, false);
  if (gradient) s.gradient = gradient;
  const stroke = cleanColour(v.stroke ?? v.strokeColor ?? v.line ?? v.border);
  if (stroke) s.stroke = stroke;
  const width = num(v.width ?? v.strokeWidth);
  if (width !== undefined) s.width = r2(clamp(width, 0, 40));
  const dash = typeof v.dash === 'string' ? v.dash.trim().toLowerCase() : v.dashed === true ? 'dashed' : undefined;
  if (dash && DASH_SET.has(dash)) s.dash = dash as Dash;
  const opacity = num(v.opacity);
  if (opacity !== undefined) s.opacity = Math.round(clamp(opacity <= 1 && opacity > 0 && !Number.isInteger(opacity) ? opacity * 100 : opacity, 0, 100));
  if (v.shadow === true) s.shadow = true;
  const radius = num(v.radius ?? v.rounded);
  if (radius !== undefined) s.radius = r2(clamp(radius, 0, 1000));
  else if (v.rounded === true) s.radius = 10;
  if (v.sketch === true) s.sketch = true;
  if (typeof v.font === 'string' && FONT_IDS.has(v.font)) s.font = v.font as FontKind;
  const size = num(v.size ?? v.fontSize);
  if (size !== undefined) s.size = r2(clamp(size, 4, 400));
  const color = cleanColour(v.color ?? v.fontColor ?? v.textColor, false);
  if (color) s.color = color;
  for (const k of ['bold', 'italic', 'underline', 'flow'] as const) if (v[k] === true) s[k] = true;
  if (typeof v.align === 'string' && ALIGNS.has(v.align)) s.align = v.align as Align;
  if (typeof v.valign === 'string' && VALIGNS.has(v.valign)) s.valign = v.valign as VAlign;
  if (typeof v.label === 'string' && LABELS.has(v.label)) s.label = v.label as LabelPos;
  const start = arrowFrom(v.start ?? v.startArrow);
  if (start) s.start = start;
  const end = arrowFrom(v.end ?? v.endArrow);
  if (end) s.end = end;
  return Object.keys(s).length ? s : undefined;
}

/** A point of a connector, or a free end's place: [x, y]. */
const point = (v: unknown): [number, number] | null => {
  if (Array.isArray(v) && v.length >= 2) {
    const x = num(v[0]);
    const y = num(v[1]);
    return x !== undefined && y !== undefined ? [coord(x), coord(y)] : null;
  }
  if (isObj(v)) {
    const x = num(v.x);
    const y = num(v.y);
    return x !== undefined && y !== undefined ? [coord(x), coord(y)] : null;
  }
  return null;
};

function cleanEnd(v: unknown): DiagramEnd | null {
  if (typeof v === 'string' && v.trim()) return { id: v.trim() };
  if (!isObj(v)) {
    const p = point(v);
    return p ? { x: p[0], y: p[1] } : null;
  }
  const e: DiagramEnd = {};
  if (typeof v.id === 'string' && v.id.trim()) e.id = v.id.trim();
  else if (typeof v.shape === 'string' && v.shape.trim()) e.id = v.shape.trim();
  if (e.id) {
    const p = Array.isArray(v.port) ? point(v.port) : null;
    if (p) e.port = [r2(clamp(p[0], 0, 1)), r2(clamp(p[1], 0, 1))];
    else if (typeof v.port === 'string') {
      const side: Record<string, [number, number]> = { n: [0.5, 0], top: [0.5, 0], s: [0.5, 1], bottom: [0.5, 1], e: [1, 0.5], right: [1, 0.5], w: [0, 0.5], left: [0, 0.5] };
      const got = side[v.port.trim().toLowerCase()];
      if (got) e.port = got;
    }
  }
  const x = num(v.x);
  const y = num(v.y);
  if (x !== undefined && y !== undefined) {
    e.x = coord(x);
    e.y = coord(y);
  }
  return e.id || e.x !== undefined ? e : null;
}

/** One item, checked; null when it is not one. Ids are checked for clashes by the page. */
function cleanItem(v: unknown): DiagramItem | null {
  if (!isObj(v)) return null;
  const id = typeof v.id === 'string' && ID.test(v.id.trim()) ? v.id.trim() : newId(v.type === 'edge' ? 'e' : 's');
  const common = {
    ...(typeof v.parent === 'string' && ID.test(v.parent) ? { parent: v.parent } : {}),
    ...(typeof v.group === 'string' && ID.test(v.group) ? { group: v.group } : {}),
    ...(v.locked === true ? { locked: true as const } : {}),
  };
  const style = cleanStyle(v.style);
  if (v.type === 'edge' || (v.type === undefined && (v.from !== undefined || v.source !== undefined) && v.x === undefined)) {
    const from = cleanEnd(v.from ?? v.source);
    const to = cleanEnd(v.to ?? v.target);
    if (!from || !to) return null;
    const e: DiagramEdge = { id, type: 'edge', from, to };
    if (typeof v.route === 'string' && (ROUTES as string[]).includes(v.route)) e.route = v.route as RouteKind;
    if (Array.isArray(v.points)) {
      const pts = v.points
        .slice(0, DIAGRAM_LIMITS.points)
        .map(point)
        .filter((p): p is [number, number] => !!p);
      if (pts.length) e.points = pts;
    }
    const text = cleanText(v.text ?? v.label);
    if (text) e.text = text;
    const at = num(v.at);
    if (at !== undefined && at !== 0.5) e.at = r2(clamp(at, 0, 1));
    const ft = cleanText(v.fromText, 200);
    if (ft) e.fromText = ft;
    const tt = cleanText(v.toText, 200);
    if (tt) e.toText = tt;
    if (style) e.style = style;
    return { ...e, ...common };
  }
  const kind = shapeFrom(v.shape ?? 'rect');
  if (!kind) return null;
  const s: DiagramShape = {
    id,
    type: 'shape',
    shape: kind.shape,
    x: coord(v.x),
    y: coord(v.y),
    w: r2(clamp(num(v.w ?? v.width) ?? 120, 1, DIAGRAM_LIMITS.size)),
    h: r2(clamp(num(v.h ?? v.height) ?? 60, 1, DIAGRAM_LIMITS.size)),
  };
  const rot = num(v.rot ?? v.rotation);
  if (rot) {
    const r = ((rot % 360) + 360) % 360;
    if (r) s.rot = r2(r);
  }
  if (v.flipH === true) s.flipH = true;
  if (v.flipV === true) s.flipV = true;
  const text = cleanText(v.text ?? v.label);
  if (text) s.text = text;
  if (Array.isArray(v.rows)) {
    const rows = v.rows.slice(0, DIAGRAM_LIMITS.rows).map((r) => cleanText(r, 1000).replace(/\n/g, ' '));
    if (rows.length) s.rows = rows;
  }
  if (isObj(v.icon) && typeof v.icon.name === 'string' && Array.isArray(v.icon.paths)) {
    const paths = cleanIconPaths(v.icon.paths);
    if (paths.length) s.icon = { name: v.icon.name.slice(0, 60), paths };
  }
  if (typeof v.src === 'string' && v.src.trim() && v.src.length <= 12_000_000) s.src = v.src.trim();
  if (typeof v.link === 'string' && v.link.trim()) s.link = v.link.trim().slice(0, 2000);
  const note = cleanText(v.note, 2000);
  if (note) s.note = note;
  const merged = kind.style ? { ...kind.style, ...style } : style;
  if (merged) s.style = merged;
  return { ...s, ...common };
}

/** An icon's lines, checked as a deck checks its icons' (only known SVG elements, numbers and path data). */
function cleanIconPaths(v: unknown[]): IconNode[] {
  const out: IconNode[] = [];
  const TAGS: Record<string, string[]> = {
    path: ['d'],
    circle: ['cx', 'cy', 'r'],
    ellipse: ['cx', 'cy', 'rx', 'ry'],
    rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
    line: ['x1', 'y1', 'x2', 'y2'],
    polyline: ['points'],
    polygon: ['points'],
  };
  for (const n of v.slice(0, 64)) {
    if (!Array.isArray(n) || typeof n[0] !== 'string' || !TAGS[n[0]] || !isObj(n[1])) continue;
    const a: Record<string, string | number> = {};
    for (const k of TAGS[n[0]]) {
      const x = n[1][k];
      if (k === 'd' || k === 'points') {
        if (typeof x === 'string' && x.length <= 4000 && /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]+$/.test(x)) a[k] = x.replace(/\s+/g, ' ').trim();
      } else {
        const nv = num(x);
        if (nv !== undefined && Math.abs(nv) <= 1000) a[k] = Math.round(nv * 1000) / 1000;
      }
    }
    if (Object.keys(a).length) out.push([n[0] as IconNode[0], a]);
  }
  return out;
}

/**
 * A page, checked: its items with ids of their own (a clash renamed), parents and groups that are there, and connectors
 * whose shapes are on it (an end whose shape is gone keeps where it was only if it says).
 */
function cleanPage(v: unknown, i: number, seenPages: Set<string>): DiagramPage {
  const o = isObj(v) ? v : {};
  let id = typeof o.id === 'string' && ID.test(o.id) ? o.id : `p${i + 1}`;
  while (seenPages.has(id)) id = newId('p');
  seenPages.add(id);
  const name = cleanText(o.name ?? o.title, DIAGRAM_LIMITS.name).replace(/\n/g, ' ').trim() || `Page ${i + 1}`;
  const raw = Array.isArray(o.items) ? o.items : [];
  const items: DiagramItem[] = [];
  const ids = new Set<string>();
  const renamed = new Map<string, string>();
  for (const r of raw.slice(0, DIAGRAM_LIMITS.items)) {
    const it = cleanItem(r);
    if (!it) continue;
    if (ids.has(it.id)) {
      const was = it.id;
      it.id = newId(it.type === 'edge' ? 'e' : 's');
      if (!renamed.has(was)) renamed.set(was, it.id);
    }
    ids.add(it.id);
    items.push(it);
  }
  const shapes = new Map(items.filter((x): x is DiagramShape => x.type === 'shape').map((s) => [s.id, s]));
  const out: DiagramItem[] = [];
  for (const it of items) {
    if (it.parent && (!shapes.has(it.parent) || it.parent === it.id)) delete it.parent;
    if (it.type === 'edge') {
      const fix = (e: DiagramEnd): DiagramEnd | null => {
        if (e.id && !shapes.has(e.id)) {
          if (e.x === undefined) return null;
          return { x: e.x, y: e.y };
        }
        return e;
      };
      const from = fix(it.from);
      const to = fix(it.to);
      if (!from || !to) continue;
      it.from = from;
      it.to = to;
    }
    out.push(it);
  }
  // A parent that is (through others) its own child is cut loose.
  for (const s of out) {
    const seen = new Set<string>([s.id]);
    let p = s.parent;
    while (p) {
      if (seen.has(p)) {
        delete s.parent;
        break;
      }
      seen.add(p);
      p = shapes.get(p)?.parent;
    }
  }
  const page: DiagramPage = { id, name, items: out };
  const bg = cleanColour(o.background);
  if (bg && bg !== 'none') page.background = bg;
  return page;
}

/** A diagram as it comes in (the editor's, an agent's, a file's), checked: what it cannot hold is left out. */
export function normalizeDiagram(v: unknown): Diagram {
  const o = isObj(v) ? v : {};
  const pagesIn = Array.isArray(o.pages) ? o.pages : Array.isArray(o.items) ? [{ items: o.items, name: o.name, background: o.background }] : [];
  const seen = new Set<string>();
  const pages = pagesIn.slice(0, DIAGRAM_LIMITS.pages).map((p, i) => cleanPage(p, i, seen));
  if (!pages.length) pages.push({ id: 'p1', name: 'Page 1', items: [] });
  const d: Diagram = { v: DIAGRAM_VERSION, pages };
  const grid = num(o.grid);
  d.grid = grid === undefined ? 10 : Math.round(clamp(grid, 0, 200));
  if (o.sketch === true) d.sketch = true;
  if (typeof o.font === 'string' && FONT_IDS.has(o.font) && o.font !== 'sans') d.font = o.font as FontKind;
  return d;
}

/** A new diagram: one empty page. */
export const newDiagram = (): Diagram => ({ v: DIAGRAM_VERSION, grid: 10, pages: [{ id: 'p1', name: 'Page 1', items: [] }] });

/**
 * The diagram as it is kept: JSON with each page's head and each item on a line of its own, so two versions read as a
 * diff of lines. JSON.parse reads it back.
 */
export function diagramText(d: Diagram): string {
  const { pages, ...head } = d;
  const lines: string[] = [`${JSON.stringify(head).slice(0, -1)},"pages":[`];
  pages.forEach((p, i) => {
    const { items, ...ph } = p;
    lines.push(`${JSON.stringify(ph).slice(0, -1)},"items":[`);
    items.forEach((it, j) => lines.push(JSON.stringify(it) + (j < items.length - 1 ? ',' : '')));
    lines.push(`]}${i < pages.length - 1 ? ',' : ''}`);
  });
  lines.push(']}');
  return lines.join('\n');
}

// ---- reading a diagram --------------------------------------------------------------------------------------------------

export const isShape = (it: DiagramItem | undefined): it is DiagramShape => !!it && it.type === 'shape';
export const isEdge = (it: DiagramItem | undefined): it is DiagramEdge => !!it && it.type === 'edge';

/** A page's shapes by id. */
export const shapesOf = (p: DiagramPage): Map<string, DiagramShape> => new Map(p.items.filter(isShape).map((s) => [s.id, s]));

/** The picture sources a diagram shows (its pictures', kept beside it). */
export function diagramSources(d: Diagram): string[] {
  const out: string[] = [];
  for (const p of d.pages) for (const it of p.items) if (it.type === 'shape' && it.src) out.push(it.src);
  return out;
}

/** The diagram with each picture's source as `f` makes it (to keep pictures apart, or put them inside a file). */
export function mapDiagramSources(d: Diagram, f: (src: string) => string): Diagram {
  return { ...d, pages: d.pages.map((p) => ({ ...p, items: p.items.map((it) => (it.type === 'shape' && it.src ? { ...it, src: f(it.src) } : it)) })) };
}

/** Every word a diagram holds, in order: for search, a description, and the Library's words. */
export function diagramWords(d: Diagram): string {
  const out: string[] = [];
  for (const p of d.pages) {
    if (d.pages.length > 1) out.push(p.name);
    for (const it of p.items) {
      if (it.text) out.push(it.text.replace(/\n/g, ' '));
      if (it.type === 'shape' && it.rows) out.push(...it.rows.filter((r) => r !== '---'));
      if (it.type === 'edge') {
        if (it.fromText) out.push(it.fromText);
        if (it.toText) out.push(it.toText);
      }
    }
  }
  return out.join('\n');
}

/** A shape's descendants (in containers inside it too). */
export function descendants(p: DiagramPage, id: string): Set<string> {
  const out = new Set<string>();
  const kids = new Map<string, string[]>();
  for (const it of p.items) if (it.parent) kids.set(it.parent, [...(kids.get(it.parent) ?? []), it.id]);
  const walk = (x: string) => {
    for (const k of kids.get(x) ?? []) {
      if (out.has(k)) continue;
      out.add(k);
      walk(k);
    }
  };
  walk(id);
  return out;
}
