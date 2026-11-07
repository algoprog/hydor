// How each kind of shape is drawn: its outline and the lines over it, in its own box (0,0 to w,h), as SVG path data; the
// outline as a polygon (where connectors meet it, and what a click on it picks); the box its words go in; a class's or
// an entity's rows; and the points connectors can be fixed to. The renderer (diagram-render.ts), the editor and every
// file a diagram is saved as draw shapes from this alone, so they look the same everywhere. Also each kind's size and
// look when it is made, and where a shape's own coordinates meet the page's when it is turned or flipped.
import type { DiagramShape, DiagramStyle, ShapeKind } from './diagram.ts';
import { lineHeight, textWidth } from './diagram-text.ts';

export type Pt = { x: number; y: number };
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A part of a shape's drawing: `shape` is filled and lined in the shape's colours (the first one is its outline, which
 * casts its shadow), `line` only lined, `solid` filled with its line's colour, `tint` filled with a wash of its line's
 * colour (a swimlane's title band).
 */
export interface GeomPath {
  d: string;
  kind: 'shape' | 'line' | 'solid' | 'tint';
  /** Lined in dashes whatever the shape's own line (a lifeline's). */
  dash?: boolean;
}

export interface RowGeom {
  y: number;
  h: number;
  text: string;
  /** A line between parts ("---"). */
  sep?: boolean;
  /** A table's cells, each with where it starts and how wide it is. */
  cells?: { x: number; w: number; text: string }[];
  /** The header row of a table. */
  head?: boolean;
}

export interface ShapeGeom {
  paths: GeomPath[];
  /** The outline as a polygon, in the shape's own box. */
  poly: [number, number][];
  /** Where its words go; null for none. */
  text: Box | null;
  /** Its words turned (a lane's title, up its side). */
  textRot?: -90;
  rows?: RowGeom[];
  /** Where a picture or an icon is drawn. */
  media?: Box;
}

/** The look a shape of a kind has unless it says otherwise. */
export interface KindDef {
  w: number;
  h: number;
  style?: DiagramStyle;
  /** Rectangular: connectors may also fix to the quarters of its sides. */
  boxy?: boolean;
}

const K = (w: number, h: number, style?: DiagramStyle, boxy = false): KindDef => ({ w, h, ...(style ? { style } : {}), boxy });
const NONE: DiagramStyle = { fill: 'none', stroke: 'none' };

export const KINDS: Record<ShapeKind, KindDef> = {
  rect: K(120, 60, undefined, true),
  rounded: K(120, 60, undefined, true),
  ellipse: K(120, 80),
  diamond: K(140, 90),
  triangle: K(100, 90),
  'triangle-right': K(90, 100),
  hexagon: K(140, 70),
  octagon: K(90, 90),
  pentagon: K(100, 95),
  parallelogram: K(140, 60),
  trapezoid: K(140, 60),
  star: K(100, 95),
  cross: K(90, 90),
  heart: K(100, 90),
  cylinder: K(90, 100),
  cloud: K(150, 100),
  document: K(130, 80),
  note: K(130, 80),
  card: K(120, 70),
  callout: K(150, 100),
  cube: K(120, 80),
  step: K(140, 60),
  chevron: K(140, 60),
  'arrow-right': K(130, 70),
  'arrow-left': K(130, 70),
  'arrow-up': K(70, 130),
  'arrow-down': K(70, 130),
  'arrow-both': K(160, 70),
  text: K(120, 30, { ...NONE }),
  image: K(140, 100, { stroke: 'none', label: 'below' }),
  icon: K(56, 56, { fill: 'none', stroke: 'none', label: 'below' }),
  sticky: K(150, 150, { fill: '#fff1a8', stroke: 'none', shadow: true, size: 15 }),
  brace: K(30, 120, { fill: 'none', label: 'right', align: 'left' }),
  bracket: K(160, 60, { fill: 'none' }),
  terminator: K(130, 50),
  predefined: K(140, 60, undefined, true),
  'manual-input': K(140, 70),
  delay: K(120, 60),
  display: K(140, 60),
  'multi-document': K(140, 90),
  'off-page': K(70, 70),
  connector: K(40, 40),
  'manual-operation': K(140, 60),
  'stored-data': K(140, 60),
  'internal-storage': K(110, 80, undefined, true),
  merge: K(90, 70),
  extract: K(90, 70),
  sort: K(90, 90),
  collate: K(70, 80),
  or: K(50, 50),
  summing: K(50, 50),
  'loop-limit': K(140, 60),
  'punched-tape': K(140, 70),
  annotation: K(140, 60, { fill: 'none', align: 'left' }),
  container: K(340, 220, { fill: 'none', dash: 'dashed', radius: 10, align: 'left', valign: 'top', bold: true }, true),
  swimlane: K(320, 260, { bold: true }, true),
  lane: K(640, 170, { bold: true }, true),
  class: K(180, 110, { align: 'left' }, true),
  entity: K(180, 110, { align: 'left' }, true),
  table: K(260, 120, { align: 'left' }, true),
  actor: K(40, 72, { label: 'below' }),
  component: K(150, 70, undefined, true),
  package: K(200, 140, { valign: 'top', bold: true }, true),
  lifeline: K(130, 320),
  activation: K(12, 80),
  initial: K(30, 30, { label: 'below' }),
  final: K(30, 30, { label: 'below' }),
  bar: K(100, 8, { label: 'below' }),
  frame: K(360, 220, { fill: 'none', align: 'left', valign: 'top' }, true),
  event: K(44, 44, { width: 1.5, label: 'below' }),
  'event-end': K(44, 44, { width: 4, label: 'below' }),
  'event-mid': K(44, 44, { label: 'below' }),
  gateway: K(56, 56, { label: 'below' }),
  'gateway-parallel': K(56, 56, { label: 'below' }),
  'gateway-inclusive': K(56, 56, { label: 'below' }),
  'data-object': K(44, 56, { label: 'below' }),
};

/** A shape's own look as drawn: its kind's, then what it says. */
export const lookOf = (s: Pick<DiagramShape, 'shape' | 'style'>): DiagramStyle => (KINDS[s.shape]?.style ? { ...KINDS[s.shape].style, ...s.style } : (s.style ?? {}));

// ---- a path, written and walked ---------------------------------------------------------------------------------------

const f = (v: number) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

/** Writes SVG path data and, as it goes, its first figure as a polygon (curves walked in steps). */
class Path {
  private parts: string[] = [];
  /** Each figure's points. */
  figs: [number, number][][] = [];
  private at: [number, number] = [0, 0];
  private start: [number, number] = [0, 0];
  M(x: number, y: number) {
    this.parts.push(`M${f(x)} ${f(y)}`);
    this.figs.push([[x, y]]);
    this.at = [x, y];
    this.start = [x, y];
    return this;
  }
  L(x: number, y: number) {
    this.parts.push(`L${f(x)} ${f(y)}`);
    this.fig().push([x, y]);
    this.at = [x, y];
    return this;
  }
  C(x1: number, y1: number, x2: number, y2: number, x: number, y: number) {
    this.parts.push(`C${f(x1)} ${f(y1)} ${f(x2)} ${f(y2)} ${f(x)} ${f(y)}`);
    const [x0, y0] = this.at;
    const fig = this.fig();
    for (let i = 1; i <= 10; i++) {
      const t = i / 10;
      const u = 1 - t;
      fig.push([u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x, u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y]);
    }
    this.at = [x, y];
    return this;
  }
  Q(x1: number, y1: number, x: number, y: number) {
    const [x0, y0] = this.at;
    return this.C(x0 + (2 / 3) * (x1 - x0), y0 + (2 / 3) * (y1 - y0), x + (2 / 3) * (x1 - x), y + (2 / 3) * (y1 - y), x, y);
  }
  /** An arc of the ellipse about (cx, cy) from angle a0 to a1 (radians, clockwise from the right), in pieces of a quarter at most. */
  E(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number) {
    const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 2) - 1e-9));
    const da = (a1 - a0) / n;
    const k = (4 / 3) * Math.tan(da / 4);
    let a = a0;
    for (let i = 0; i < n; i++) {
      const b = a + da;
      const [c0, s0, c1, s1] = [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b)];
      this.C(cx + rx * (c0 - k * s0), cy + ry * (s0 + k * c0), cx + rx * (c1 + k * s1), cy + ry * (s1 - k * c1), cx + rx * c1, cy + ry * s1);
      a = b;
    }
    return this;
  }
  Z() {
    this.parts.push('Z');
    this.at = this.start;
    return this;
  }
  private fig() {
    if (!this.figs.length) this.figs.push([this.at]);
    return this.figs[this.figs.length - 1];
  }
  get d() {
    return this.parts.join('');
  }
}

const poly = (...pts: [number, number][]) => {
  const p = new Path().M(pts[0][0], pts[0][1]);
  for (const q of pts.slice(1)) p.L(q[0], q[1]);
  return p.Z();
};
const rectP = (x: number, y: number, w: number, h: number, r = 0) => {
  const p = new Path();
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  if (!r) return p.M(x, y).L(x + w, y).L(x + w, y + h).L(x, y + h).Z();
  return p
    .M(x + r, y)
    .L(x + w - r, y)
    .E(x + w - r, y + r, r, r, -Math.PI / 2, 0)
    .L(x + w, y + h - r)
    .E(x + w - r, y + h - r, r, r, 0, Math.PI / 2)
    .L(x + r, y + h)
    .E(x + r, y + h - r, r, r, Math.PI / 2, Math.PI)
    .L(x, y + r)
    .E(x + r, y + r, r, r, Math.PI, (3 * Math.PI) / 2)
    .Z();
};
const ellP = (cx: number, cy: number, rx: number, ry: number) => new Path().M(cx + rx, cy).E(cx, cy, rx, ry, 0, 2 * Math.PI).Z();
const lineD = (...segs: [number, number, number, number][]) => segs.map(([a, b, c, d]) => `M${f(a)} ${f(b)}L${f(c)} ${f(d)}`).join('');

const box = (x: number, y: number, w: number, h: number): Box => ({ x, y, w: Math.max(0, w), h: Math.max(0, h) });

/** How tall a row of a class, an entity or a table is at a font size. */
export const rowHeight = (size: number) => Math.round(lineHeight(size) + 8);
/** The header of a class or an entity: as tall as its name's lines. */
export const headHeight = (lines: number, size: number) => Math.round(Math.max(1, lines) * lineHeight(size) + 14);
/** A swimlane's title band. */
export const BAND = 34;

/** A table's columns' widths, from what their cells hold, fitted to the width there is. */
function tableCols(rows: string[][], w: number, size: number): number[] {
  const n = Math.max(1, ...rows.map((r) => r.length));
  const want = new Array(n).fill(24);
  for (const r of rows) r.forEach((c, i) => (want[i] = Math.max(want[i], textWidth(c, { size }) + 16)));
  const total = want.reduce((a, b) => a + b, 0);
  return want.map((x) => (x / total) * w);
}

/**
 * A shape's drawing, in its own box. `text` is the shape's words (some kinds size a part of themselves to them: a frame's
 * tab, a class's header).
 */
export function shapeGeom(s: Pick<DiagramShape, 'shape' | 'w' | 'h' | 'text' | 'rows' | 'style'>): ShapeGeom {
  const { w, h } = s;
  const look = lookOf(s);
  const size = look.size ?? 14;
  const m = Math.min(w, h);
  const pad = 6;
  const inner = box(pad, 3, w - 2 * pad, h - 6);
  const one = (p: Path, text: Box | null = inner, more: GeomPath[] = []): ShapeGeom => ({ paths: [{ d: p.d, kind: 'shape' }, ...more], poly: p.figs[0] ?? [], text });
  const lines = (d: string): GeomPath => ({ d, kind: 'line' });
  switch (s.shape) {
    case 'rect':
    case 'predefined':
    case 'internal-storage':
    case 'activation': {
      const p = rectP(0, 0, w, h, s.shape === 'rect' ? (look.radius ?? 0) : 0);
      if (s.shape === 'predefined') {
        const k = Math.min(w * 0.1, 14);
        return one(p, box(k + 4, 3, w - 2 * k - 8, h - 6), [lines(lineD([k, 0, k, h], [w - k, 0, w - k, h]))]);
      }
      if (s.shape === 'internal-storage') {
        const k = Math.min(14, w * 0.15, h * 0.2);
        return one(p, box(k + 4, k + 2, w - k - 8, h - k - 4), [lines(lineD([k, 0, k, h], [0, k, w, k]))]);
      }
      return one(p, s.shape === 'activation' ? null : inner);
    }
    case 'rounded':
      return one(rectP(0, 0, w, h, look.radius ?? Math.min(16, m * 0.18)));
    case 'terminator':
      return one(rectP(0, 0, w, h, h / 2), box(h * 0.3, 3, w - h * 0.6, h - 6));
    case 'ellipse':
    case 'connector':
      return one(ellP(w / 2, h / 2, w / 2, h / 2), box(w * 0.15, h * 0.15, w * 0.7, h * 0.7));
    case 'diamond':
      return one(poly([w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]), box(w * 0.17, h * 0.2, w * 0.66, h * 0.6));
    case 'sort': {
      const p = poly([w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]);
      return one(p, box(w * 0.2, h * 0.2, w * 0.6, h * 0.6), [lines(lineD([0, h / 2, w, h / 2]))]);
    }
    case 'triangle':
    case 'extract':
      return one(poly([w / 2, 0], [w, h], [0, h]), box(w * 0.22, h * 0.45, w * 0.56, h * 0.5));
    case 'merge':
      return one(poly([0, 0], [w, 0], [w / 2, h]), box(w * 0.22, h * 0.05, w * 0.56, h * 0.5));
    case 'triangle-right':
      return one(poly([0, 0], [w, h / 2], [0, h]), box(w * 0.05, h * 0.25, w * 0.6, h * 0.5));
    case 'hexagon': {
      const k = Math.min(w * 0.22, h * 0.5);
      return one(poly([k, 0], [w - k, 0], [w, h / 2], [w - k, h], [k, h], [0, h / 2]), box(k * 0.6, 3, w - k * 1.2, h - 6));
    }
    case 'octagon': {
      const c = m * 0.29;
      return one(poly([c, 0], [w - c, 0], [w, c], [w, h - c], [w - c, h], [c, h], [0, h - c], [0, c]), box(c * 0.5, c * 0.5, w - c, h - c));
    }
    case 'pentagon':
      return one(poly([w / 2, 0], [w, h * 0.38], [w * 0.81, h], [w * 0.19, h], [0, h * 0.38]), box(w * 0.18, h * 0.3, w * 0.64, h * 0.6));
    case 'parallelogram': {
      const k = Math.min(w * 0.2, h * 0.6);
      return one(poly([k, 0], [w, 0], [w - k, h], [0, h]), box(k * 0.8, 3, w - k * 1.6, h - 6));
    }
    case 'trapezoid': {
      const k = Math.min(w * 0.2, h * 0.6);
      return one(poly([k, 0], [w - k, 0], [w, h], [0, h]), box(k * 0.8, 3, w - k * 1.6, h - 6));
    }
    case 'manual-operation': {
      const k = Math.min(w * 0.2, h * 0.6);
      return one(poly([0, 0], [w, 0], [w - k, h], [k, h]), box(k * 0.8, 3, w - k * 1.6, h - 6));
    }
    case 'star': {
      const pts: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? 0.4 : 1;
        pts.push([w / 2 + (w / 2) * r * Math.cos(a), h * 0.53 + (h * 0.53) * r * Math.sin(a)]);
      }
      return one(poly(...pts), box(w * 0.3, h * 0.38, w * 0.4, h * 0.34));
    }
    case 'cross': {
      const t = m * 0.34;
      const [x1, x2, y1, y2] = [(w - t) / 2, (w + t) / 2, (h - t) / 2, (h + t) / 2];
      return one(poly([x1, 0], [x2, 0], [x2, y1], [w, y1], [w, y2], [x2, y2], [x2, h], [x1, h], [x1, y2], [0, y2], [0, y1], [x1, y1]), box(x1, y1, t, t));
    }
    case 'heart': {
      const p = new Path()
        .M(w / 2, h * 0.28)
        .C(w * 0.42, h * 0.02, 0, h * 0.02, 0, h * 0.33)
        .C(0, h * 0.6, w * 0.3, h * 0.78, w / 2, h)
        .C(w * 0.7, h * 0.78, w, h * 0.6, w, h * 0.33)
        .C(w, h * 0.02, w * 0.58, h * 0.02, w / 2, h * 0.28)
        .Z();
      return one(p, box(w * 0.2, h * 0.28, w * 0.6, h * 0.4));
    }
    case 'cylinder': {
      const ry = Math.min(h * 0.18, Math.max(8, w * 0.12), 22);
      const p = new Path()
        .M(0, ry)
        .E(w / 2, ry, w / 2, ry, Math.PI, 2 * Math.PI)
        .L(w, h - ry)
        .E(w / 2, h - ry, w / 2, ry, 0, Math.PI)
        .Z();
      const rim = new Path().M(0, ry).E(w / 2, ry, w / 2, ry, Math.PI, 0);
      return one(p, box(pad, ry * 2 + 2, w - 2 * pad, h - ry * 3 - 4), [lines(rim.d)]);
    }
    case 'cloud': {
      const p = new Path()
        .M(0.25 * w, 0.25 * h)
        .C(0.05 * w, 0.25 * h, 0, 0.5 * h, 0.16 * w, 0.55 * h)
        .C(0, 0.66 * h, 0.18 * w, 0.9 * h, 0.31 * w, 0.8 * h)
        .C(0.4 * w, h, 0.7 * w, h, 0.8 * w, 0.8 * h)
        .C(w, 0.8 * h, w, 0.6 * h, 0.875 * w, 0.5 * h)
        .C(w, 0.3 * h, 0.8 * w, 0.1 * h, 0.625 * w, 0.2 * h)
        .C(0.5 * w, 0.05 * h, 0.3 * w, 0.05 * h, 0.25 * w, 0.25 * h)
        .Z();
      return one(p, box(w * 0.16, h * 0.24, w * 0.68, h * 0.54));
    }
    case 'document': {
      const dy = Math.min(h * 0.16, 16);
      const p = new Path()
        .M(0, 0)
        .L(w, 0)
        .L(w, h - dy)
        .Q(w * 0.75, h - dy * 2.6, w / 2, h - dy)
        .Q(w * 0.25, h + dy * 0.6, 0, h - dy)
        .Z();
      return one(p, box(pad, 3, w - 2 * pad, h - dy * 1.6 - 4));
    }
    case 'multi-document': {
      const o = Math.min(8, w * 0.06, h * 0.08);
      const dy = Math.min((h - 2 * o) * 0.16, 14);
      const doc = (x: number, y: number) => {
        const W = w - 2 * o;
        const H = h - 2 * o;
        return new Path()
          .M(x, y)
          .L(x + W, y)
          .L(x + W, y + H - dy)
          .Q(x + W * 0.75, y + H - dy * 2.6, x + W / 2, y + H - dy)
          .Q(x + W * 0.25, y + H + dy * 0.6, x, y + H - dy)
          .Z();
      };
      const front = doc(0, 2 * o);
      return {
        paths: [
          { d: doc(2 * o, 0).d, kind: 'shape' },
          { d: doc(o, o).d, kind: 'shape' },
          { d: front.d, kind: 'shape' },
        ],
        poly: [
          [0, 2 * o],
          [2 * o, 2 * o],
          [2 * o, 0],
          [w, 0],
          [w, h - 2 * o - dy],
          [w - 2 * o, h - dy],
          [w / 2 - o, h - dy],
          [0, h - dy],
        ],
        text: box(pad, 2 * o + 3, w - 2 * o - 2 * pad, h - 2 * o - dy * 1.6 - 6),
      };
    }
    case 'note':
    case 'data-object': {
      const k = Math.min(18, w * 0.25, h * 0.3);
      const p = poly([0, 0], [w - k, 0], [w, k], [w, h], [0, h]);
      return one(p, s.shape === 'note' ? box(pad, k * 0.5 + 2, w - 2 * pad, h - k * 0.5 - 5) : inner, [lines(`M${f(w - k)} 0V${f(k)}H${f(w)}`)]);
    }
    case 'card': {
      const k = Math.min(18, w * 0.25, h * 0.35);
      return one(poly([k, 0], [w, 0], [w, h], [0, h], [0, k]));
    }
    case 'loop-limit': {
      const k = Math.min(16, w * 0.2, h * 0.35);
      return one(poly([k, 0], [w - k, 0], [w, k], [w, h], [0, h], [0, k]));
    }
    case 'callout': {
      const hb = h * 0.76;
      const r = Math.min(12, m * 0.12);
      const p = new Path()
        .M(r, 0)
        .L(w - r, 0)
        .E(w - r, r, r, r, -Math.PI / 2, 0)
        .L(w, hb - r)
        .E(w - r, hb - r, r, r, 0, Math.PI / 2)
        .L(w * 0.42, hb)
        .L(w * 0.22, h)
        .L(w * 0.26, hb)
        .L(r, hb)
        .E(r, hb - r, r, r, Math.PI / 2, Math.PI)
        .L(0, r)
        .E(r, r, r, r, Math.PI, (3 * Math.PI) / 2)
        .Z();
      return one(p, box(pad, 3, w - 2 * pad, hb - 6));
    }
    case 'cube': {
      const d = Math.min(18, w * 0.2, h * 0.25);
      const p = poly([0, d], [d, 0], [w, 0], [w, h - d], [w - d, h], [0, h]);
      return one(p, box(pad, d + 3, w - d - 2 * pad, h - d - 6), [lines(`M0 ${f(d)}H${f(w - d)}V${f(h)}M${f(w - d)} ${f(d)}L${f(w)} 0`)]);
    }
    case 'step': {
      const k = Math.min(w * 0.2, h * 0.5);
      return one(poly([0, 0], [w - k, 0], [w, h / 2], [w - k, h], [0, h], [k, h / 2]), box(k + 2, 3, w - 2 * k - 4, h - 6));
    }
    case 'chevron': {
      const k = Math.min(w * 0.2, h * 0.5);
      return one(poly([0, 0], [w - k, 0], [w, h / 2], [w - k, h], [0, h]), box(pad, 3, w - k - pad, h - 6));
    }
    case 'arrow-right':
    case 'arrow-left':
    case 'arrow-up':
    case 'arrow-down':
    case 'arrow-both': {
      const vertical = s.shape === 'arrow-up' || s.shape === 'arrow-down';
      // Drawn across, then turned for one that points up or down.
      const L = vertical ? h : w;
      const T = vertical ? w : h;
      const head = Math.min(L * (s.shape === 'arrow-both' ? 0.28 : 0.38), T * 0.9);
      const a = T * 0.26;
      let pts: [number, number][] =
        s.shape === 'arrow-both'
          ? [[0, T / 2], [head, 0], [head, a], [L - head, a], [L - head, 0], [L, T / 2], [L - head, T], [L - head, T - a], [head, T - a], [head, T]]
          : [[0, a], [L - head, a], [L - head, 0], [L, T / 2], [L - head, T], [L - head, T - a], [0, T - a]];
      let tb = s.shape === 'arrow-both' ? box(head * 0.7, a, L - head * 1.4, T - 2 * a) : box(4, a, L - head - 4, T - 2 * a);
      if (s.shape === 'arrow-left') pts = pts.map(([x, y]) => [L - x, y]);
      if (s.shape === 'arrow-left') tb = box(L - tb.x - tb.w, tb.y, tb.w, tb.h);
      if (vertical) {
        // Across becomes down; pointing up, it is turned the other way.
        pts = pts.map(([x, y]) => (s.shape === 'arrow-down' ? [y, x] : [y, L - x]));
        tb = s.shape === 'arrow-down' ? box(tb.y, tb.x, tb.h, tb.w) : box(tb.y, L - tb.x - tb.w, tb.h, tb.w);
      }
      return one(poly(...pts), tb);
    }
    case 'text':
      return one(rectP(0, 0, w, h), box(2, 2, w - 4, h - 4));
    case 'image':
    case 'icon':
      return { ...one(rectP(0, 0, w, h), box(0, 0, w, h)), media: box(0, 0, w, h) };
    case 'sticky': {
      const p = rectP(0, 0, w, h, 2);
      return one(p, box(12, 10, w - 24, h - 20));
    }
    case 'brace': {
      // A "}" down the box, its point to the right.
      const x0 = 0;
      const x1 = w * 0.5;
      const p = new Path()
        .M(x0, 0)
        .Q(x1, 0, x1, h * 0.12)
        .L(x1, h * 0.38)
        .Q(x1, h / 2, w, h / 2)
        .Q(x1, h / 2, x1, h * 0.62)
        .L(x1, h * 0.88)
        .Q(x1, h, x0, h);
      return { paths: [lines(p.d)], poly: [[0, 0], [w, 0], [w, h], [0, h]], text: box(w + 6, 0, 160, h) };
    }
    case 'bracket': {
      const k = Math.min(10, w * 0.15);
      return { paths: [lines(`M${f(k)} 0H0V${f(h)}H${f(k)}M${f(w - k)} 0H${f(w)}V${f(h)}H${f(w - k)}`)], poly: [[0, 0], [w, 0], [w, h], [0, h]], text: box(k + 4, 3, w - 2 * k - 8, h - 6) };
    }
    case 'annotation': {
      const k = Math.min(14, w * 0.2);
      return { paths: [lines(`M${f(k)} 0H0V${f(h)}H${f(k)}`)], poly: [[0, 0], [w, 0], [w, h], [0, h]], text: box(k + 6, 3, w - k - 10, h - 6) };
    }
    case 'manual-input':
      return one(poly([0, h * 0.28], [w, 0], [w, h], [0, h]), box(pad, h * 0.28 + 2, w - 2 * pad, h * 0.72 - 5));
    case 'delay': {
      const r = Math.min(h / 2, w / 2);
      const p = new Path()
        .M(0, 0)
        .L(w - r, 0)
        .E(w - r, h / 2, r, h / 2, -Math.PI / 2, Math.PI / 2)
        .L(0, h)
        .Z();
      return one(p, box(pad, 3, w - r * 0.6 - pad, h - 6));
    }
    case 'display': {
      const k = Math.min(w * 0.16, h * 0.5);
      const r = Math.min(w * 0.14, h / 2);
      const p = new Path()
        .M(k, 0)
        .L(w - r, 0)
        .E(w - r, h / 2, r, h / 2, -Math.PI / 2, Math.PI / 2)
        .L(k, h)
        .L(0, h / 2)
        .Z();
      return one(p, box(k, 3, w - k - r * 0.7, h - 6));
    }
    case 'off-page':
      return one(poly([0, 0], [w, 0], [w, h * 0.62], [w / 2, h], [0, h * 0.62]), box(3, 3, w - 6, h * 0.6));
    case 'stored-data': {
      const k = Math.min(w * 0.14, 22);
      const p = new Path()
        .M(k, 0)
        .L(w, 0)
        .Q(w - k * 1.6, h / 2, w, h)
        .L(k, h)
        .Q(-k * 0.6, h / 2, k, 0)
        .Z();
      return one(p, box(k * 0.8, 3, w - k * 1.8, h - 6));
    }
    case 'collate': {
      const p = new Path().M(0, 0).L(w, 0).L(w / 2, h / 2).Z().M(w / 2, h / 2).L(w, h).L(0, h).Z();
      return { paths: [{ d: p.d, kind: 'shape' }], poly: [[0, 0], [w, 0], [w / 2, h / 2], [w, h], [0, h], [w / 2, h / 2]], text: null };
    }
    case 'or':
    case 'summing': {
      const p = ellP(w / 2, h / 2, w / 2, h / 2);
      const c = 0.7071;
      const d =
        s.shape === 'or' ? lineD([w / 2, 0, w / 2, h], [0, h / 2, w, h / 2]) : lineD([w / 2 - (w / 2) * c, h / 2 - (h / 2) * c, w / 2 + (w / 2) * c, h / 2 + (h / 2) * c], [w / 2 + (w / 2) * c, h / 2 - (h / 2) * c, w / 2 - (w / 2) * c, h / 2 + (h / 2) * c]);
      return { ...one(p, null, [lines(d)]) };
    }
    case 'punched-tape': {
      const a = Math.min(h * 0.1, 10);
      const p = new Path()
        .M(0, a)
        .Q(w / 4, a * 3, w / 2, a)
        .Q((w * 3) / 4, -a, w, a)
        .L(w, h - a)
        .Q((w * 3) / 4, h - a * 3, w / 2, h - a)
        .Q(w / 4, h + a, 0, h - a)
        .Z();
      return one(p, box(pad, a * 2 + 2, w - 2 * pad, h - a * 4 - 4));
    }
    case 'container':
      return one(rectP(0, 0, w, h, look.radius ?? 10), box(12, 8, w - 24, Math.max(lineHeight(size), h - 16)));
    case 'swimlane': {
      const band = Math.min(BAND, h);
      const p = rectP(0, 0, w, h);
      return one(p, box(pad, 0, w - 2 * pad, band), [{ d: rectP(0, 0, w, band).d, kind: 'tint' }, lines(lineD([0, band, w, band]))]);
    }
    case 'lane': {
      const band = Math.min(BAND, w);
      const p = rectP(0, 0, w, h);
      return { ...one(p, box(0, pad, band, h - 2 * pad), [{ d: rectP(0, 0, band, h).d, kind: 'tint' }, lines(lineD([band, 0, band, h]))]), textRot: -90 };
    }
    case 'class':
    case 'entity':
    case 'table': {
      const p = rectP(0, 0, w, h, s.shape === 'entity' ? Math.min(look.radius ?? 0, 12) : 0);
      const head = s.shape === 'table' && !s.text ? 0 : headHeight((s.text ?? '').split('\n').length, size);
      const rh = rowHeight(size);
      const out: GeomPath[] = [];
      const rows: RowGeom[] = [];
      let y = head;
      if (head) {
        out.push({ d: rectP(0, 0, w, Math.min(head, h)).d, kind: s.shape === 'class' ? 'line' : 'tint' });
        if (head < h) out.push(lines(lineD([0, head, w, head])));
      }
      const raw = s.rows ?? [];
      if (s.shape === 'table') {
        const cells = raw.map((r) => r.split('|').map((c) => c.trim()));
        const cols = tableCols(cells, w, size);
        const xs = cols.reduce<number[]>((a, c, i) => [...a, (a[i] ?? 0) + c], [0]);
        cells.forEach((r, i) => {
          if (y >= h - 1) return;
          rows.push({ y, h: rh, text: r.join(' '), head: i === 0 && !head, cells: cols.map((cw, j) => ({ x: xs[j], w: cw, text: r[j] ?? '' })) });
          if (i === 0 && !head) out.push({ d: rectP(0, 0, w, Math.min(rh, h)).d, kind: 'tint' });
          y += rh;
          if (y < h - 0.5) out.push(lines(lineD([0, y, w, y])));
        });
        const bottom = Math.min(y, h);
        if (cols.length > 1 && bottom > head) out.push(lines(xs.slice(1, -1).map((x) => lineD([x, head, x, bottom])).join('')));
      } else {
        for (const r of raw) {
          if (y >= h - 1) break;
          if (r.trim() === '---') {
            rows.push({ y, h: 8, text: '', sep: true });
            out.push(lines(lineD([0, y + 4, w, y + 4])));
            y += 8;
            continue;
          }
          rows.push({ y, h: rh, text: r });
          y += rh;
        }
      }
      return { paths: [{ d: p.d, kind: 'shape' }, ...out], poly: p.figs[0], text: head ? box(pad, 0, w - 2 * pad, Math.min(head, h)) : null, rows };
    }
    case 'actor': {
      const r = Math.min(w * 0.22, h * 0.12);
      const cx = w / 2;
      const neck = r * 2;
      const hip = h * 0.62;
      const head = ellP(cx, r, r, r);
      const body = lineD([cx, neck, cx, hip], [cx - w * 0.42, neck + h * 0.12, cx + w * 0.42, neck + h * 0.12], [cx, hip, cx - w * 0.36, h], [cx, hip, cx + w * 0.36, h]);
      return { paths: [{ d: head.d, kind: 'shape' }, lines(body)], poly: [[0, 0], [w, 0], [w, h], [0, h]], text: box(0, 0, w, h) };
    }
    case 'component': {
      const k = Math.min(14, w * 0.12);
      const main = rectP(k, 0, w - k, h);
      const tab = (y: number) => rectP(0, y, k * 2, Math.min(12, h * 0.18)).d;
      return {
        paths: [
          { d: main.d, kind: 'shape' },
          { d: tab(h * 0.22), kind: 'shape' },
          { d: tab(h * 0.6), kind: 'shape' },
        ],
        poly: [[k, 0], [w, 0], [w, h], [k, h]],
        text: box(k * 2 + 4, 3, w - k * 2 - 8, h - 6),
      };
    }
    case 'package': {
      const th = 22;
      const tw = Math.min(w * 0.8, Math.max(60, textWidth(s.text?.split('\n')[0] ?? '', { size, bold: look.bold !== false }) + 24));
      const tab = rectP(0, 0, tw, th);
      const body = rectP(0, th, w, Math.max(1, h - th));
      return { paths: [{ d: tab.d, kind: 'shape' }, { d: body.d, kind: 'shape' }], poly: [[0, 0], [tw, 0], [tw, th], [w, th], [w, h], [0, h]], text: box(8, 1, tw - 16, th - 2) };
    }
    case 'lifeline': {
      const hh = Math.min(40, h);
      const head = rectP(0, 0, w, hh);
      return { paths: [{ d: head.d, kind: 'shape' }, { d: lineD([w / 2, hh, w / 2, h]), kind: 'line', dash: true }], poly: [[0, 0], [w, 0], [w, h], [0, h]], text: box(pad, 0, w - 2 * pad, hh) };
    }
    case 'initial':
      return { paths: [{ d: ellP(w / 2, h / 2, w / 2, h / 2).d, kind: 'solid' }], poly: ellP(w / 2, h / 2, w / 2, h / 2).figs[0], text: box(0, 0, w, h) };
    case 'final': {
      const outer = ellP(w / 2, h / 2, w / 2, h / 2);
      return { paths: [{ d: outer.d, kind: 'shape' }, { d: ellP(w / 2, h / 2, w * 0.3, h * 0.3).d, kind: 'solid' }], poly: outer.figs[0], text: box(0, 0, w, h) };
    }
    case 'bar':
      return { paths: [{ d: rectP(0, 0, w, h, Math.min(2, h / 2)).d, kind: 'solid' }], poly: [[0, 0], [w, 0], [w, h], [0, h]], text: box(0, 0, w, h) };
    case 'frame': {
      const t = (s.text ?? '').split('\n')[0];
      const tw = Math.min(w, Math.max(60, textWidth(t, { size, bold: !!look.bold }) + 30));
      const th = Math.min(h, Math.max(26, lineHeight(size) + 10));
      const tag = poly([0, 0], [tw, 0], [tw, th - 8], [tw - 8, th], [0, th]);
      return { paths: [{ d: rectP(0, 0, w, h).d, kind: 'shape' }, { d: tag.d, kind: 'tint' }, lines(tag.d)], poly: [[0, 0], [w, 0], [w, h], [0, h]], text: box(8, 0, tw - 18, th) };
    }
    case 'event':
    case 'event-end':
      return one(ellP(w / 2, h / 2, w / 2, h / 2), box(0, 0, w, h));
    case 'event-mid': {
      const p = ellP(w / 2, h / 2, w / 2, h / 2);
      return one(p, box(0, 0, w, h), [lines(ellP(w / 2, h / 2, w / 2 - 4, h / 2 - 4).d)]);
    }
    case 'gateway':
    case 'gateway-parallel':
    case 'gateway-inclusive': {
      const p = poly([w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]);
      const k = 0.22;
      const mark =
        s.shape === 'gateway'
          ? lineD([w * (0.5 - k), h * (0.5 - k), w * (0.5 + k), h * (0.5 + k)], [w * (0.5 + k), h * (0.5 - k), w * (0.5 - k), h * (0.5 + k)])
          : s.shape === 'gateway-parallel'
            ? lineD([w / 2, h * 0.22, w / 2, h * 0.78], [w * 0.22, h / 2, w * 0.78, h / 2])
            : ellP(w / 2, h / 2, w * 0.22, h * 0.22).d;
      return { ...one(p, box(0, 0, w, h), [{ d: mark, kind: 'line' }]) };
    }
  }
  return one(rectP(0, 0, w, h));
}

// ---- words ------------------------------------------------------------------------------------------------------------

/**
 * Where a shape's words go, in its own box: in its text box, or beside it (an icon's, a person's, a picture's under it),
 * with how wide their lines may be.
 */
export function labelBox(s: Pick<DiagramShape, 'shape' | 'w' | 'h' | 'text' | 'rows' | 'style'>, g: ShapeGeom = shapeGeom(s)): Box | null {
  if (!g.text) return null;
  const pos = lookOf(s).label ?? 'inside';
  const width = Math.max(s.w + 80, 140);
  if (pos === 'below') return box(s.w / 2 - width / 2, s.h + 4, width, 400);
  if (pos === 'above') return box(s.w / 2 - width / 2, -404, width, 400);
  if (pos === 'right') return box(s.shape === 'brace' ? s.w + 8 : s.w + 8, 0, 240, s.h);
  if (pos === 'left') return box(-248, 0, 240, s.h);
  return g.text;
}

// ---- where a shape meets the page ---------------------------------------------------------------------------------------

type Placed = Pick<DiagramShape, 'x' | 'y' | 'w' | 'h' | 'rot' | 'flipH' | 'flipV'>;

/** A point of a shape's own box on the page (turned and flipped as the shape is). */
export function toPage(s: Placed, lx: number, ly: number): Pt {
  let x = s.flipH ? s.w - lx : lx;
  let y = s.flipV ? s.h - ly : ly;
  x -= s.w / 2;
  y -= s.h / 2;
  if (s.rot) {
    const a = (s.rot * Math.PI) / 180;
    const [c, n] = [Math.cos(a), Math.sin(a)];
    [x, y] = [x * c - y * n, x * n + y * c];
  }
  return { x: s.x + s.w / 2 + x, y: s.y + s.h / 2 + y };
}

/** A point of the page in a shape's own box. */
export function toLocal(s: Placed, px: number, py: number): Pt {
  let x = px - (s.x + s.w / 2);
  let y = py - (s.y + s.h / 2);
  if (s.rot) {
    const a = (-s.rot * Math.PI) / 180;
    const [c, n] = [Math.cos(a), Math.sin(a)];
    [x, y] = [x * c - y * n, x * n + y * c];
  }
  x += s.w / 2;
  y += s.h / 2;
  return { x: s.flipH ? s.w - x : x, y: s.flipV ? s.h - y : y };
}

/** The box a shape takes on the page, turned as it is. */
export function pageBox(s: Placed): Box {
  if (!s.rot) return { x: s.x, y: s.y, w: s.w, h: s.h };
  const c = [toPage(s, 0, 0), toPage(s, s.w, 0), toPage(s, s.w, s.h), toPage(s, 0, s.h)];
  const xs = c.map((p) => p.x);
  const ys = c.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Where the line from (ax, ay) to (bx, by) meets the polygon nearest to b's side: the point and how far along (0..1). */
function rayHit(poly: [number, number][], ax: number, ay: number, bx: number, by: number): { x: number; y: number; t: number } | null {
  let best: { x: number; y: number; t: number } | null = null;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % n];
    const dx = bx - ax;
    const dy = by - ay;
    const ex = x2 - x1;
    const ey = y2 - y1;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((x1 - ax) * ey - (y1 - ay) * ex) / den;
    const u = ((x1 - ax) * dy - (y1 - ay) * dx) / den;
    if (t >= 0 && u >= -1e-6 && u <= 1 + 1e-6 && (!best || t > best.t)) best = { x: ax + dx * t, y: ay + dy * t, t };
  }
  return best;
}

/** The outline's polygon for a shape (its kind's), in its own box. */
const polyOf = (s: DiagramShape) => {
  const g = shapeGeom(s);
  return g.poly.length >= 3 ? g.poly : ([[0, 0], [s.w, 0], [s.w, s.h], [0, s.h]] as [number, number][]);
};

/** Where a connector from inside a shape toward `to` (a point on the page) leaves its outline. */
export function perimeterPoint(s: DiagramShape, to: Pt): Pt {
  const p = toLocal(s, to.x, to.y);
  const cx = s.w / 2;
  const cy = s.h / 2;
  if (Math.abs(p.x - cx) < 1e-6 && Math.abs(p.y - cy) < 1e-6) return toPage(s, cx, 0);
  // Far enough out that the line crosses the outline once on its way.
  const k = (s.w + s.h) * 4 / Math.max(1e-6, Math.hypot(p.x - cx, p.y - cy));
  const hit = rayHit(polyOf(s), cx, cy, cx + (p.x - cx) * k, cy + (p.y - cy) * k);
  return hit ? toPage(s, hit.x, hit.y) : toPage(s, cx, cy);
}

export type Side = 'n' | 'e' | 's' | 'w';
export const SIDE_DIR: Record<Side, Pt> = { n: { x: 0, y: -1 }, e: { x: 1, y: 0 }, s: { x: 0, y: 1 }, w: { x: -1, y: 0 } };

/** The point where a shape's outline meets the line from its middle toward a side, in its own box. */
function sideLocal(s: DiagramShape, side: Side): Pt {
  const cx = s.w / 2;
  const cy = s.h / 2;
  const d = SIDE_DIR[side];
  const hit = rayHit(polyOf(s), cx, cy, cx + d.x * (s.w + s.h), cy + d.y * (s.w + s.h));
  return hit ? { x: hit.x, y: hit.y } : { x: cx + (d.x * s.w) / 2, y: cy + (d.y * s.h) / 2 };
}

/** A side of a shape on the page, as turned: the side whose way out is nearest to `dir`'s. */
export function turnedSide(s: Placed, side: Side): Side {
  if (!s.rot && !s.flipH && !s.flipV) return side;
  const d = SIDE_DIR[side];
  const a = toPage(s, s.w / 2 + d.x, s.h / 2 + d.y);
  const c = toPage(s, s.w / 2, s.h / 2);
  return sideOfDir(a.x - c.x, a.y - c.y);
}
export const sideOfDir = (dx: number, dy: number): Side => (Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'e' : 'w') : dy >= 0 ? 's' : 'n');

/** Where a connector meets a side of a shape on the page (which way the page sees it), and that side. */
export function sidePoint(s: DiagramShape, pageSide: Side): Pt {
  // Which of the shape's own sides faces that way on the page.
  const sides: Side[] = ['n', 'e', 's', 'w'];
  const own = sides.find((x) => turnedSide(s, x) === pageSide) ?? pageSide;
  const p = sideLocal(s, own);
  return toPage(s, p.x, p.y);
}

/** The points of a shape connectors can be fixed to, as fractions of its box. */
export function shapePorts(s: DiagramShape): [number, number][] {
  if (s.shape === 'lifeline') return [];
  const out: [number, number][] = [];
  for (const side of ['n', 'e', 's', 'w'] as Side[]) {
    const p = sideLocal(s, side);
    out.push([Math.round((p.x / s.w) * 1000) / 1000, Math.round((p.y / s.h) * 1000) / 1000]);
  }
  if (KINDS[s.shape]?.boxy)
    out.push([0.25, 0], [0.75, 0], [1, 0.25], [1, 0.75], [0.25, 1], [0.75, 1], [0, 0.25], [0, 0.75]);
  else if (s.shape === 'ellipse' || s.shape === 'connector' || s.shape === 'or' || s.shape === 'summing') {
    const c = 0.5 - 0.5 * Math.SQRT1_2;
    out.push([c, c], [1 - c, c], [1 - c, 1 - c], [c, 1 - c]);
  }
  return out;
}

/** A fixed point of a shape on the page, and the side it faces. */
export function portPoint(s: DiagramShape, port: [number, number]): { p: Pt; side: Side } {
  const lx = port[0] * s.w;
  const ly = port[1] * s.h;
  const p = toPage(s, lx, ly);
  // The side it is nearest to, in the shape's own box, then as the page sees it.
  const d = [ly, s.w - lx, s.h - ly, lx];
  const own = (['n', 'e', 's', 'w'] as Side[])[d.indexOf(Math.min(...d))];
  return { p, side: turnedSide(s, own) };
}

/** Whether a point of the page is in a shape (in its outline; within its box for a shape that is only lines). */
export function inShape(s: DiagramShape, px: number, py: number, slop = 0): boolean {
  const p = toLocal(s, px, py);
  if (p.x < -slop || p.y < -slop || p.x > s.w + slop || p.y > s.h + slop) return false;
  const g = shapeGeom(s);
  if (g.poly.length < 3 || slop > 0) return true;
  let inside = false;
  const pts = g.poly;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The natural height of a class, an entity or a table: its header and every row. */
export function rowsHeight(s: Pick<DiagramShape, 'shape' | 'text' | 'rows' | 'style'>): number {
  const size = lookOf(s).size ?? 14;
  const head = s.shape === 'table' && !s.text ? 0 : headHeight((s.text ?? '').split('\n').length, size);
  return head + (s.rows ?? []).reduce((n, r) => n + (r.trim() === '---' && s.shape !== 'table' ? 8 : rowHeight(size)), 0) + (s.rows?.length ? 4 : 0);
}
