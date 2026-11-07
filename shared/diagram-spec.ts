// A diagram said simply: nodes and the edges between them, with what each says and how it looks, and how to lay them
// out. Agents save diagrams this way (save_diagram's nodes and edges, or Mermaid, which diagram-mermaid.ts reads into
// this), templates are written this way, and specPage turns it into a page of the model (diagram.ts), sizing each
// shape to its words and placing the shapes not placed (diagram-layout.ts). Positions given are kept.
import { arrowFrom, cleanColour, cleanStyle, cleanText, CONTAINER_KINDS, inkOn, newId, shapeFrom, styleSet, type DiagramEdge, type DiagramStyle, type RouteKind, type DiagramEnd, type DiagramIcon, type DiagramItem, type DiagramPage, type DiagramShape, type FontKind, type ShapeKind } from './diagram.ts';
import { BAND, KINDS, rowsHeight } from './diagram-shapes.ts';
import { layout, type LEdge, type LNode } from './diagram-layout.ts';
import { lineHeight, textSize, textWidth } from './diagram-text.ts';
import type { IconNode } from './slides.ts';

/** How a page's nodes are laid out: in layers down, right, up or left (a flowchart), as a tree (an org chart), a mind map, a circle, a grid; none keeps what is given. */
export type LayoutKind = 'down' | 'right' | 'up' | 'left' | 'tree' | 'tree-right' | 'mindmap' | 'radial' | 'circle' | 'grid' | 'none';
export const LAYOUTS: LayoutKind[] = ['down', 'right', 'up', 'left', 'tree', 'tree-right', 'mindmap', 'radial', 'circle', 'grid', 'none'];

/** A side of a shape, or a fixed point of it as fractions of its box. */
export type SpecPort = 'n' | 'e' | 's' | 'w' | 'top' | 'right' | 'bottom' | 'left' | [number, number];

export interface SpecNode {
  id: string;
  /** Its words (\n between lines). */
  text?: string;
  /** Its kind: a kind of shape (diagram.ts SHAPE_KINDS) or a name it is known by ("decision", "database", "server"). */
  shape?: string;
  /** An icon shape's icon: the name of one of Lucide's icons ("server", "database", "user"). */
  icon?: string;
  /** A ready-made look by name (diagram.ts STYLE_SETS: "blue", "green", "dark-red"…), or a fill colour. */
  color?: string;
  fill?: string;
  stroke?: string;
  textColor?: string;
  /** Anything else of its look. */
  style?: DiagramStyle;
  /** A class's, an entity's or a table's rows. */
  rows?: string[];
  /** Where it is and how large; left out, its place comes from the layout and its size from its words. */
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  /** The container node it is in (a swimlane, a group box). */
  parent?: string;
  link?: string;
  note?: string;
}

export interface SpecEdge {
  id?: string;
  from: string;
  to: string;
  text?: string;
  fromText?: string;
  toText?: string;
  /** Where its arrowheads go (end when left out); start and end name their kinds (diagram.ts ARROWS) instead. */
  arrow?: 'end' | 'start' | 'both' | 'none';
  start?: string;
  end?: string;
  dashed?: boolean;
  dotted?: boolean;
  /** A heavier line. */
  thick?: boolean;
  route?: RouteKind;
  color?: string;
  width?: number;
  style?: DiagramStyle;
  /** Fixed points it leaves and meets its shapes at. */
  fromPort?: SpecPort;
  toPort?: SpecPort;
  /** Points it runs through. */
  points?: [number, number][];
}

export interface SpecPage {
  name?: string;
  layout?: LayoutKind;
  /** The room between shapes side by side and between layers, in pixels (the layout's own when left out). */
  spacing?: number;
  nodes: SpecNode[];
  edges: SpecEdge[];
  background?: string;
  /** Edges run this way unless they say (orthogonal; a mind map's curved). */
  route?: RouteKind;
}

// ---- the spec made a page ---------------------------------------------------------------------------------------------


export interface SpecOpts {
  /** One of Lucide's icons by its name, as lines (the server reads them from Lucide; the editor from its icon list). */
  icon?: (name: string) => IconNode[] | null;
  /** The diagram's font, for sizing shapes to their words. */
  font?: FontKind;
  /** The page's id and its name when the spec gives none. */
  id?: string;
  name?: string;
}

/** A colour a little darker (a fill's line). */
export function darker(hex: string, k = 0.32): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return hex;
  return `#${[m[1], m[2], m[3]].map((x) => Math.round(parseInt(x, 16) * (1 - k)).toString(16).padStart(2, '0')).join('')}`;
}

const SIDES: Record<string, [number, number]> = { n: [0.5, 0], top: [0.5, 0], e: [1, 0.5], right: [1, 0.5], s: [0.5, 1], bottom: [0.5, 1], w: [0, 0.5], left: [0, 0.5] };
const portOf = (p: SpecPort | undefined): [number, number] | undefined => {
  if (Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number' && Number.isFinite(v))) return [Math.min(1, Math.max(0, p[0])), Math.min(1, Math.max(0, p[1]))];
  if (typeof p === 'string') return SIDES[p.trim().toLowerCase()];
  return undefined;
};

/** A node's look from its colour (a ready-made look's name, or a fill), its fill, line and words' colours, and its style. */
function nodeStyle(nd: SpecNode, base?: DiagramShape['style']): DiagramShape['style'] {
  const st: NonNullable<DiagramShape['style']> = { ...base };
  const set = styleSet(nd.color);
  if (set) {
    st.fill = set.fill;
    st.stroke = set.stroke;
    if (set.color) st.color = set.color;
  } else {
    const c = cleanColour(nd.color);
    if (c && c !== 'none') {
      st.fill = c;
      st.stroke = darker(c);
    }
  }
  const fill = cleanColour(nd.fill);
  if (fill) st.fill = fill;
  const stroke = cleanColour(nd.stroke);
  if (stroke) st.stroke = stroke;
  const text = cleanColour(nd.textColor, false);
  if (text) st.color = text;
  Object.assign(st, cleanStyle(nd.style) ?? {});
  // Words that read on the fill, when a strong fill was given without them.
  if (st.fill && st.fill !== 'none' && !st.color && inkOn(st.fill) === '#ffffff') st.color = '#ffffff';
  return Object.keys(st).length ? st : undefined;
}

/** The size a shape of a kind needs for its words (and rows), at least its kind's own size. */
export function sizeFor(kind: ShapeKind, s: Pick<DiagramShape, 'text' | 'rows' | 'style'>, font?: FontKind): { w: number; h: number } {
  const def = KINDS[kind];
  const look = { ...def.style, ...s.style };
  const size = look.size ?? 14;
  const f = { font: look.font ?? font, size, bold: look.bold };
  const text = s.text ?? '';
  const ts = (max: number) => textSize(text, max, f);
  const up = (v: number) => Math.ceil(v / 10) * 10;
  switch (kind) {
    case 'text': {
      const t = ts(320);
      return { w: up(Math.max(40, t.w + 14)), h: up(Math.max(24, t.h + 10)) };
    }
    case 'icon':
    case 'image':
    case 'actor':
    case 'initial':
    case 'final':
    case 'event':
    case 'event-end':
    case 'event-mid':
    case 'gateway':
    case 'gateway-parallel':
    case 'gateway-inclusive':
    case 'bar':
    case 'data-object':
    case 'connector':
    case 'or':
    case 'summing':
    case 'activation':
      return { w: def.w, h: def.h };
    case 'class':
    case 'entity':
    case 'table': {
      const rows = s.rows ?? [];
      let w = Math.max(...text.split('\n').map((l) => textWidth(l, { ...f, bold: true }) + 32), def.w * 0.8);
      if (kind === 'table') {
        const cols: number[] = [];
        for (const r of rows) r.split('|').forEach((c, i) => (cols[i] = Math.max(cols[i] ?? 0, textWidth(c.trim(), f) + 18)));
        w = Math.max(w, cols.reduce((a, b) => a + b, 0));
      } else for (const r of rows) w = Math.max(w, textWidth(r, f) + 28);
      return { w: up(Math.min(Math.max(w, 140), 520)), h: Math.max(rowsHeight({ shape: kind, text: s.text, rows, style: s.style }), 40) };
    }
    case 'container':
    case 'swimlane':
    case 'lane':
    case 'frame':
    case 'package':
    case 'lifeline':
      return { w: def.w, h: def.h };
    case 'diamond':
    case 'sort': {
      const t = ts(180);
      return { w: up(Math.max(def.w, t.w * 1.55 + 40)), h: up(Math.max(def.h, t.h * 2 + 26)) };
    }
    case 'ellipse':
    case 'cloud': {
      const t = ts(200);
      return { w: up(Math.max(def.w, t.w * 1.4 + 36)), h: up(Math.max(def.h, t.h * 1.7 + 24)) };
    }
    case 'hexagon':
    case 'parallelogram':
    case 'trapezoid':
    case 'manual-operation':
    case 'terminator':
    case 'display':
    case 'stored-data':
    case 'step':
    case 'chevron':
    case 'off-page': {
      const t = ts(220);
      return { w: up(Math.max(def.w, t.w + 64)), h: up(Math.max(def.h, t.h + 24)) };
    }
    case 'cylinder': {
      const t = ts(200);
      return { w: up(Math.max(def.w, t.w + 32)), h: up(Math.max(def.h, t.h + 56)) };
    }
    case 'sticky': {
      const t = textSize(text, def.w - 24, f);
      return { w: def.w, h: up(Math.max(def.h, t.h + 34)) };
    }
    case 'triangle':
    case 'extract':
    case 'merge': {
      const t = ts(160);
      return { w: up(Math.max(def.w, t.w * 2 + 30)), h: up(Math.max(def.h, t.h * 2 + 30)) };
    }
    default: {
      const t = ts(220);
      return { w: up(Math.max(def.w, Math.min(t.w + 34, 280))), h: up(Math.max(def.h, t.h + 26)) };
    }
  }
}

/** The room a container keeps round what it holds, by its kind. */
function padOf(s: DiagramShape): LNode['pad'] {
  const lh = lineHeight(s.style?.size ?? 14);
  switch (s.shape) {
    case 'swimlane':
      return { top: BAND + 26, left: 26, right: 26, bottom: 26 };
    case 'lane':
      return { top: 26, left: BAND + 26, right: 26, bottom: 26 };
    case 'frame':
      return { top: Math.max(26, lh + 10) + 24, left: 26, right: 26, bottom: 24 };
    case 'package':
      return { top: 22 + 26, left: 24, right: 24, bottom: 24 };
    default:
      return { top: (s.text ? lh * s.text.split('\n').length + 18 : 0) + 22, left: 24, right: 24, bottom: 24 };
  }
}

/**
 * A spec made a page: its nodes made shapes (sized to their words where no size is given, each kind's alike in size when
 * they are near it), its edges connectors, and the shapes without a place laid out as `layout` says (down, unless all
 * have places). Containers come first (drawn behind), then connectors, then the other shapes.
 */
export function specPage(spec: SpecPage, o: SpecOpts = {}): { page: DiagramPage; notes: string[] } {
  const notes: string[] = [];
  const shapes: DiagramShape[] = [];
  const ids = new Set<string>();
  const nodes = Array.isArray(spec.nodes) ? spec.nodes : [];
  const unknown: string[] = [];
  for (const nd of nodes) {
    if (!nd || typeof nd !== 'object') continue;
    let id = typeof nd.id === 'string' && /^[\w.:-]{1,64}$/.test(nd.id.trim()) ? nd.id.trim() : newId('s');
    if (ids.has(id)) id = newId('s');
    ids.add(id);
    const named = shapeFrom(nd.shape ?? (nd.icon ? 'icon' : 'rounded'));
    if (!named && nd.shape) unknown.push(String(nd.shape));
    let kind: ShapeKind = named?.shape ?? 'rounded';
    let icon: DiagramIcon | undefined;
    const iconName = typeof nd.icon === 'string' && nd.icon.trim() ? nd.icon.trim() : named?.icon;
    if (kind === 'icon' || iconName) {
      const paths = iconName && o.icon ? o.icon(iconName) : null;
      if (paths?.length) {
        icon = { name: iconName!, paths };
        kind = 'icon';
      } else if (kind === 'icon') {
        kind = 'rounded';
        if (iconName) notes.push(`There is no icon “${iconName}” in Lucide: node ${id} is a rounded box instead.`);
      }
    }
    const s: DiagramShape = { id, type: 'shape', shape: kind, x: 0, y: 0, w: 0, h: 0 };
    const text = cleanText(nd.text);
    if (text) s.text = text;
    if (Array.isArray(nd.rows) && nd.rows.length) s.rows = nd.rows.slice(0, 200).map((r) => cleanText(r, 1000).replace(/\n/g, ' '));
    if (icon) s.icon = icon;
    const style = nodeStyle(nd, named?.style);
    if (style) s.style = style;
    if (typeof nd.link === 'string' && nd.link.trim()) s.link = nd.link.trim().slice(0, 2000);
    if (typeof nd.note === 'string' && nd.note.trim()) s.note = cleanText(nd.note, 2000);
    if (typeof nd.parent === 'string' && nd.parent.trim()) s.parent = nd.parent.trim();
    const size = sizeFor(kind, s, o.font);
    s.w = typeof nd.w === 'number' && nd.w > 0 ? Math.min(nd.w, 100_000) : size.w;
    s.h = typeof nd.h === 'number' && nd.h > 0 ? Math.min(nd.h, 100_000) : size.h;
    if (typeof nd.x === 'number' && Number.isFinite(nd.x)) s.x = nd.x;
    if (typeof nd.y === 'number' && Number.isFinite(nd.y)) s.y = nd.y;
    shapes.push(s);
  }
  if (unknown.length) notes.push(`Shapes not in the library came in as rounded boxes: ${[...new Set(unknown)].slice(0, 8).join(', ')}.`);
  const byId = new Map(shapes.map((s) => [s.id, s]));
  for (const s of shapes) if (s.parent && (!byId.has(s.parent) || s.parent === s.id)) delete s.parent;
  // Containers hold what names them: one that holds something is a container even if it was not named one.
  const holders = new Set(shapes.map((s) => s.parent).filter((p): p is string => !!p));
  for (const id of holders) {
    const c = byId.get(id)!;
    if (!CONTAINER_KINDS.has(c.shape)) {
      c.shape = 'container';
      const size = sizeFor('container', c, o.font);
      c.w = Math.max(c.w, size.w);
      c.h = Math.max(c.h, size.h);
    }
  }
  const edges: DiagramEdge[] = [];
  const missing: string[] = [];
  const kindRoute = spec.route ?? (spec.layout === 'mindmap' || spec.layout === 'radial' ? 'curved' : 'orthogonal');
  for (const ed of Array.isArray(spec.edges) ? spec.edges : []) {
    if (!ed || typeof ed !== 'object') continue;
    const from = typeof ed.from === 'string' ? ed.from.trim() : '';
    const to = typeof ed.to === 'string' ? ed.to.trim() : '';
    if (!byId.has(from) || !byId.has(to)) {
      missing.push(`${from || '?'} → ${to || '?'}`);
      continue;
    }
    const fromEnd: DiagramEnd = { id: from };
    const toEnd: DiagramEnd = { id: to };
    const fp = portOf(ed.fromPort);
    if (fp) fromEnd.port = fp;
    const tp = portOf(ed.toPort);
    if (tp) toEnd.port = tp;
    let eid = typeof ed.id === 'string' && /^[\w.:-]{1,64}$/.test(ed.id.trim()) ? ed.id.trim() : newId('e');
    if (ids.has(eid)) eid = newId('e');
    ids.add(eid);
    const e: DiagramEdge = { id: eid, type: 'edge', from: fromEnd, to: toEnd };
    const route = ed.route ?? kindRoute;
    if (route !== 'orthogonal') e.route = route;
    const text = cleanText(ed.text);
    if (text) e.text = text;
    const ft = cleanText(ed.fromText, 200);
    if (ft) e.fromText = ft;
    const tt = cleanText(ed.toText, 200);
    if (tt) e.toText = tt;
    const st: NonNullable<DiagramEdge['style']> = { ...cleanStyle(ed.style) };
    const arrow = ed.arrow ?? 'end';
    const start = arrowFrom(ed.start) ?? (arrow === 'start' || arrow === 'both' ? 'arrow' : undefined);
    const end = arrowFrom(ed.end) ?? (arrow === 'none' || arrow === 'start' ? 'none' : undefined);
    if (start && start !== 'none') st.start = start;
    if (end) st.end = end;
    if (ed.dashed) st.dash = 'dashed';
    if (ed.dotted) st.dash = 'dotted';
    if (ed.thick) st.width = 2.5;
    const color = cleanColour(ed.color, false);
    if (color) st.stroke = color;
    if (typeof ed.width === 'number' && ed.width > 0) st.width = Math.min(ed.width, 20);
    if (Object.keys(st).length) e.style = st;
    if (Array.isArray(ed.points) && ed.points.length) e.points = ed.points.filter((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)).slice(0, 60) as [number, number][];
    edges.push(e);
  }
  if (missing.length) notes.push(`Edges that name a node not there were left out: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ` and ${missing.length - 6} more` : ''}.`);
  // Laid out: what has no place, unless the layout is none (then those go in a row under what has one).
  const placed = (nd: SpecNode) => typeof nd.x === 'number' && typeof nd.y === 'number';
  const kind = spec.layout ?? (nodes.length && nodes.every(placed) ? 'none' : 'down');
  if (kind !== 'none') {
    // Shapes of a kind laid out side by side read best alike in size: each kind's that are near its widest take its size.
    if (kind !== 'mindmap' && kind !== 'radial') {
      const groups = new Map<string, DiagramShape[]>();
      for (const s of shapes) if (!holders.has(s.id) && !KINDS[s.shape].style?.label && s.shape !== 'text') groups.set(s.shape, [...(groups.get(s.shape) ?? []), s]);
      for (const list of groups.values()) {
        const free = list.filter((s) => !nodes.find((nd) => nd.id === s.id && (nd.w || nd.h)));
        if (free.length < 2) continue;
        const maxW = Math.max(...free.map((s) => s.w));
        const maxH = Math.max(...free.map((s) => s.h));
        for (const s of free) {
          if (s.w >= maxW * 0.6) s.w = maxW;
          if (s.h >= maxH * 0.6) s.h = maxH;
        }
      }
    }
    // A shape whose words hang under it (an icon's) takes their room too, so the next layer keeps clear of them.
    const below = new Map<string, { w: number; h: number }>();
    for (const s of shapes) {
      const look = { ...KINDS[s.shape].style, ...s.style };
      if (!s.text || (look.label ?? 'inside') === 'inside') continue;
      const f = { font: look.font ?? o.font, size: look.size ?? 14 };
      const t = textSize(s.text, Math.max(s.w + 80, 140), f);
      if (look.label === 'below' || look.label === 'above') below.set(s.id, { w: Math.max(s.w, t.w + 8), h: s.h + t.h + 8 });
      else below.set(s.id, { w: s.w + t.w + 16, h: Math.max(s.h, t.h) });
    }
    const lnodes: LNode[] = shapes.map((s) => ({ id: s.id, w: below.get(s.id)?.w ?? s.w, h: below.get(s.id)?.h ?? s.h, parent: s.parent, ...(holders.has(s.id) ? { pad: padOf(s) } : {}) }));
    const ledges: LEdge[] = edges.map((e) => {
      const f = { size: e.style?.size ?? 13 };
      return { from: e.from.id!, to: e.to.id!, ...(e.text ? { label: { w: Math.min(220, textWidth(e.text, f)) + 12, h: lineHeight(13) * e.text.split('\n').length + 6 } } : {}) };
    });
    const r = layout(lnodes, ledges, kind, { spacing: spec.spacing });
    const pinned = new Set(nodes.filter(placed).map((nd) => nd.id));
    for (const s of shapes) {
      const p = r.pos.get(s.id);
      if (!p) continue;
      if (!pinned.has(s.id)) {
        // Within the room its words took: the shape at the top (under words above it), in the middle across.
        const room = below.get(s.id);
        const look = { ...KINDS[s.shape].style, ...s.style };
        s.x = room ? p.x + (look.label === 'right' ? 0 : look.label === 'left' ? room.w - s.w : (room.w - s.w) / 2) : p.x;
        s.y = room ? p.y + (look.label === 'above' ? room.h - s.h : look.label === 'below' ? 0 : (room.h - s.h) / 2) : p.y;
      }
      if (holders.has(s.id)) {
        s.w = Math.max(s.w, p.w);
        s.h = Math.max(s.h, p.h);
      }
    }
    edges.forEach((e, i) => {
      if (e.points || e.from.port || e.to.port) return;
      const back = r.back.get(i);
      if (back && e.route !== 'curved') {
        e.from.port = back.from;
        e.to.port = back.to;
        e.points = back.points.map((p) => [Math.round(p.x), Math.round(p.y)]);
        return;
      }
      const ports = r.ports.get(i);
      if (ports) {
        e.from.port = ports.from;
        e.to.port = ports.to;
      }
      const bends = r.bends.get(i);
      if (bends?.length && e.route !== 'curved') e.points = bends.map((p) => [Math.round(p.x), Math.round(p.y)]);
    });
  } else {
    // No layout: those without a place in a row under the others.
    const placedShapes = shapes.filter((s) => nodes.find((nd) => nd.id === s.id && placed(nd)));
    let x = 40;
    const y = placedShapes.length ? Math.max(...placedShapes.map((s) => s.y + s.h)) + 60 : 40;
    for (const s of shapes)
      if (!placedShapes.includes(s)) {
        s.x = x;
        s.y = y;
        x += s.w + 40;
      }
  }
  // Drawn in order: containers (outer first), connectors, then the other shapes.
  const depth = (s: DiagramShape) => {
    let d = 0;
    for (let p = s.parent; p && d < 64; p = byId.get(p)?.parent) d++;
    return d;
  };
  const containers = shapes.filter((s) => holders.has(s.id) || CONTAINER_KINDS.has(s.shape)).sort((a, b) => depth(a) - depth(b));
  const rest = shapes.filter((s) => !containers.includes(s));
  const items: DiagramItem[] = [...containers, ...edges, ...rest];
  const page: DiagramPage = { id: o.id ?? 'p1', name: (spec.name ?? o.name ?? 'Page 1').toString().slice(0, 80) || 'Page 1', items };
  const bg = cleanColour(spec.background);
  if (bg && bg !== 'none') page.background = bg;
  return { page, notes };
}
