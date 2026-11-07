// A diagram's pages drawn as SVG, the same drawing for the editor (each item on its own, as it changes), the viewer, the
// Library's picture of it and every file it is saved as. Colours an item does not give are the theme's: in a file,
// the light theme's (or the dark one's, when asked); where the page can follow the app's theme (the editor, the viewer),
// each such colour also carries a class the page's stylesheet points at the theme's colours, so the same drawing reads
// in light and dark. Words left without a colour on a filled shape take the colour that reads on that fill.
import { DARK, fontCss, inkOn, LIGHT, type Diagram, type DiagramEdge, type DiagramItem, type DiagramPage, type DiagramShape, type DiagramStyle, type DiagramTheme, type FontKind } from './diagram.ts';
import { labelBox, lookOf, pageBox, shapeGeom, type Box, type Pt } from './diagram-shapes.ts';
import { alongWalk, arrowHead, atDistance, edgeGeom, type EdgeGeom } from './diagram-route.ts';
import { lineHeight, textWidth, wrapText } from './diagram-text.ts';

export interface RenderOpts {
  theme?: DiagramTheme;
  /** Theme colours as classes too (the page's stylesheet, themeCss, sets them for light and dark). */
  themed?: boolean;
  /** A picture's source as the page can show it (a kept picture's address in the app, or the picture itself in a file). */
  src?: (src: string) => string;
  /** Shapes with a link open it when clicked. */
  links?: boolean;
  /** The whole diagram's look: drawn by hand, and its font. */
  sketch?: boolean;
  font?: FontKind;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (v: number) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

/** The stylesheet that gives the theme's colours to what is drawn in them, for the light and the dark theme. */
export function themeCss(scope = 'html[data-n-theme=dark]'): string {
  const rules = (t: DiagramTheme) =>
    `.dg-ink-s{stroke:${t.ink}}.dg-ink-f{fill:${t.ink}}.dg-paper-f{fill:${t.paper}}.dg-fill-f{fill:${t.fill}}.dg-muted-s{stroke:${t.muted}}.dg-muted-f{fill:${t.muted}}`;
  return `${rules(LIGHT)}${scope} ${rules(DARK).replace(/}\./g, `}${scope} .`)}`;
}

/** The SVG that every page carries once: a shadow, and the dashes that run along a flowing connector. */
export const DEFS =
  '<defs><filter id="dg-shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="2" stdDeviation="2.4" flood-color="#000" flood-opacity=".22"/></filter></defs>';
export const FLOW_CSS = '@keyframes dg-flow{to{stroke-dashoffset:-20}}.dg-flow{stroke-dasharray:8 6;animation:dg-flow .8s linear infinite}';

/** A colour to paint with, and the class that lets the theme change it (when it is the theme's). */
interface Paint {
  c: string;
  cls?: string;
}

class Ctx {
  t: DiagramTheme;
  constructor(public o: RenderOpts) {
    this.t = o.theme ?? LIGHT;
  }
  ink(kind: 's' | 'f'): Paint {
    return { c: this.t.ink, cls: this.o.themed ? `dg-ink-${kind}` : undefined };
  }
  paper(): Paint {
    return { c: this.t.paper, cls: this.o.themed ? 'dg-paper-f' : undefined };
  }
  fill(): Paint {
    return { c: this.t.fill, cls: this.o.themed ? 'dg-fill-f' : undefined };
  }
}

const attrs = (o: Record<string, string | number | undefined | false>) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== false && v !== '')
    .map(([k, v]) => ` ${k}="${typeof v === 'number' ? n(v) : esc(String(v))}"`)
    .join('');
const cls = (...c: (string | undefined)[]) => c.filter(Boolean).join(' ') || undefined;

/** A line's dashes, scaled to its width. */
export function dashArray(dash: DiagramStyle['dash'], w: number): string | undefined {
  const k = Math.max(1, w);
  if (dash === 'dashed') return `${n(5 * k)} ${n(3.5 * k)}`;
  if (dash === 'dotted') return `${n(0.01)} ${n(2.6 * k)}`;
  if (dash === 'dash-dot') return `${n(6 * k)} ${n(3 * k)} ${n(0.01)} ${n(3 * k)}`;
  return undefined;
}

// ---- drawn by hand ----------------------------------------------------------------------------------------------------

/** A number from a seed, the same each time (so a hand-drawn line keeps its wobble). */
function rng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** Path data (M, L, C, Q, Z) walked into figures of points. */
function figures(d: string): { pts: Pt[]; closed: boolean }[] {
  const out: { pts: Pt[]; closed: boolean }[] = [];
  const tok = d.match(/[MLCQZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
  let i = 0;
  let cur: { pts: Pt[]; closed: boolean } | null = null;
  let at: Pt = { x: 0, y: 0 };
  const num = () => Number(tok[i++]);
  let cmd = 'M';
  while (i < tok.length) {
    if (/[MLCQZ]/i.test(tok[i])) {
      cmd = tok[i++].toUpperCase();
      if (cmd === 'Z') {
        if (cur) cur.closed = true;
        cur = null;
        continue;
      }
    } else if (cmd === 'Z') {
      i++;
      continue;
    }
    if (cmd === 'M') {
      at = { x: num(), y: num() };
      cur = { pts: [at], closed: false };
      out.push(cur);
      cmd = 'L';
      continue;
    }
    if (!cur) {
      cur = { pts: [at], closed: false };
      out.push(cur);
    }
    if (cmd === 'L') {
      at = { x: num(), y: num() };
      cur.pts.push(at);
    } else if (cmd === 'C' || cmd === 'Q') {
      const c1 = { x: num(), y: num() };
      const c2 = cmd === 'C' ? { x: num(), y: num() } : c1;
      const b = { x: num(), y: num() };
      const a = at;
      for (let k = 1; k <= 8; k++) {
        const t = k / 8;
        const u = 1 - t;
        cur.pts.push(
          cmd === 'C'
            ? { x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x, y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y }
            : { x: u * u * a.x + 2 * u * t * c1.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c1.y + t * t * b.y },
        );
      }
      at = b;
    } else i++;
  }
  return out;
}

/** A path drawn as by hand: walked, shaken a little, and drawn as a smooth line through what it became. */
export function sketchPath(d: string, seed: string, rough = 1): string {
  const r = rng(seed);
  return figures(d)
    .map(({ pts, closed }) => {
      if (pts.length < 2) return '';
      const ring = closed ? [...pts, pts[0]] : pts;
      // Points a short way apart along it, each moved a little to one side.
      const out: Pt[] = [];
      for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i];
        const b = ring[i + 1];
        const L = Math.hypot(b.x - a.x, b.y - a.y);
        const steps = Math.max(1, Math.round(L / 18));
        for (let k = 0; k < steps; k++) {
          const t = k / steps;
          const j = (L > 6 ? 1.3 : 0.4) * rough;
          out.push({ x: a.x + (b.x - a.x) * t + (r() - 0.5) * 2 * j, y: a.y + (b.y - a.y) * t + (r() - 0.5) * 2 * j });
        }
      }
      const last = ring[ring.length - 1];
      out.push(closed ? { x: out[0].x + (r() - 0.5) * 2 * rough, y: out[0].y + (r() - 0.5) * 2 * rough } : last);
      let s = `M${n(out[0].x)} ${n(out[0].y)}`;
      for (let i = 1; i < out.length - 1; i++) s += `Q${n(out[i].x)} ${n(out[i].y)} ${n((out[i].x + out[i + 1].x) / 2)} ${n((out[i].y + out[i + 1].y) / 2)}`;
      s += `L${n(out[out.length - 1].x)} ${n(out[out.length - 1].y)}`;
      return s;
    })
    .join('');
}

// ---- words --------------------------------------------------------------------------------------------------------------

interface TextLook {
  font?: FontKind;
  size: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align: 'left' | 'center' | 'right';
  valign: 'top' | 'middle' | 'bottom';
}

/** Lines of words in a box, aligned as asked; `wrap`: broken to the box's width first. */
function textBlock(text: string, b: Box, look: TextLook, paint: Paint, o: { wrap?: boolean; rot?: -90; clip?: boolean } = {}): string {
  if (!text) return '';
  const font = { font: look.font, size: look.size, bold: look.bold, italic: look.italic };
  const width = o.rot ? b.h : b.w;
  const height = o.rot ? b.w : b.h;
  const lines = o.wrap === false ? text.split('\n') : wrapText(text, width, font);
  const lh = lineHeight(look.size);
  const total = lines.length * lh;
  const top = look.valign === 'top' ? 0 : look.valign === 'bottom' ? height - total : (height - total) / 2;
  const x = look.align === 'left' ? 0 : look.align === 'right' ? width : width / 2;
  const anchor = look.align === 'left' ? 'start' : look.align === 'right' ? 'end' : 'middle';
  const spans = lines
    .map((l, i) => `<tspan x="${n(x)}" y="${n(top + i * lh + lh / 2 + look.size * 0.35)}">${esc(l) || ' '}</tspan>`)
    .join('');
  const t =
    `<text${attrs({
      'font-family': fontCss(look.font),
      'font-size': look.size,
      'font-weight': look.bold ? 'bold' : undefined,
      'font-style': look.italic ? 'italic' : undefined,
      'text-decoration': look.underline ? 'underline' : undefined,
      'text-anchor': anchor,
      fill: paint.c,
      class: paint.cls,
    })} xml:space="preserve">${spans}</text>`;
  const place = o.rot ? `translate(${n(b.x)} ${n(b.y + b.h)}) rotate(-90)` : `translate(${n(b.x)} ${n(b.y)})`;
  return `<g transform="${place}">${t}</g>`;
}

// ---- shapes -----------------------------------------------------------------------------------------------------------

/** The fill and line a shape is drawn in. */
function shapePaints(s: DiagramShape, look: DiagramStyle, c: Ctx): { fill: Paint | null; stroke: Paint | null; text: Paint } {
  const fill: Paint | null = look.fill === 'none' ? null : look.fill ? { c: look.fill } : c.fill();
  const stroke: Paint | null = look.stroke === 'none' ? null : look.stroke ? { c: look.stroke } : c.ink('s');
  const text: Paint = look.color ? { c: look.color } : look.fill && look.fill !== 'none' && (look.label ?? 'inside') === 'inside' ? { c: inkOn(look.fill) } : c.ink('f');
  // A sticky note's words read on its paper whatever the theme.
  if (s.shape === 'sticky' && !look.color && !look.fill) text.c = '#1f2328';
  return { fill, stroke, text };
}

/** One shape, as an SVG group placed on the page. */
export function shapeSvg(s: DiagramShape, o: RenderOpts = {}, c = new Ctx(o)): string {
  const look = lookOf(s);
  const g = shapeGeom(s);
  const { fill, stroke, text } = shapePaints(s, look, c);
  const sw = look.width ?? (s.shape === 'icon' ? 2 : 1.5);
  const dash = dashArray(look.dash, sw);
  const sketch = (look.sketch ?? o.sketch) === true;
  const parts: string[] = [];
  let gradient = '';
  let fillRef = fill?.c;
  if (fill && look.gradient) {
    const id = `dg-gr-${s.id.replace(/[^\w-]/g, '_')}`;
    gradient = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${esc(fill.c)}"/><stop offset="1" stop-color="${esc(look.gradient)}"/></linearGradient></defs>`;
    fillRef = `url(#${id})`;
  }
  let first = true;
  g.paths.forEach((p, i) => {
    const seed = `${s.id}:${i}`;
    const d = sketch ? sketchPath(p.d, seed) : p.d;
    const shadow = first && look.shadow && p.kind === 'shape' ? 'url(#dg-shadow)' : undefined;
    if (p.kind === 'shape') first = false;
    if (p.kind === 'shape') {
      if (sketch) {
        // By hand: filled once inside its wobbly outline, its line drawn twice, a little apart.
        if (fill) parts.push(`<path${attrs({ d, fill: fillRef, class: fill.cls && !look.gradient ? fill.cls : undefined, filter: shadow })}/>`);
        if (stroke) {
          const d2 = sketchPath(p.d, `${seed}b`, 1.2);
          for (const dd of [d, d2]) parts.push(`<path${attrs({ d: dd, fill: 'none', stroke: stroke.c, class: stroke.cls, 'stroke-width': sw, 'stroke-dasharray': dash, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })}/>`);
        }
      } else
        parts.push(
          `<path${attrs({ d, fill: fill ? fillRef : 'none', stroke: stroke ? stroke.c : 'none', class: cls(fill && !look.gradient ? fill.cls : undefined, stroke?.cls), 'stroke-width': stroke ? sw : undefined, 'stroke-dasharray': dash, 'stroke-linejoin': 'round', filter: shadow })}/>`,
        );
    } else if (p.kind === 'line') {
      if (stroke) parts.push(`<path${attrs({ d, fill: 'none', stroke: stroke.c, class: stroke.cls, 'stroke-width': sw, 'stroke-dasharray': p.dash ? dashArray('dashed', Math.min(sw, 1.5)) : dash, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })}/>`);
    } else if (p.kind === 'solid') {
      const sc = stroke ?? c.ink('f');
      parts.push(`<path${attrs({ d, fill: sc.c, class: sc.cls ? 'dg-ink-f' : undefined, filter: shadow })}/>`);
    } else if (p.kind === 'tint') {
      const sc = stroke ?? c.ink('f');
      parts.push(`<path${attrs({ d, fill: sc.c, class: sc.cls ? 'dg-ink-f' : undefined, 'fill-opacity': 0.07 })}/>`);
    }
  });
  // A picture, or an icon, in its place.
  if (g.media && s.shape === 'image' && s.src) {
    const src = o.src ? o.src(s.src) : s.src;
    if (src) parts.push(`<image${attrs({ href: src, x: g.media.x, y: g.media.y, width: g.media.w, height: g.media.h, preserveAspectRatio: 'xMidYMid meet' })}/>`);
  } else if (g.media && s.shape === 'image') {
    const m = g.media;
    const k = Math.min(m.w, m.h) * 0.3;
    parts.push(
      `<path${attrs({ d: `M${n(m.x + m.w / 2 - k)} ${n(m.y + m.h / 2 + k * 0.6)}l${n(k * 0.7)} ${n(-k * 0.9)} ${n(k * 0.5)} ${n(k * 0.6)} ${n(k * 0.35)} ${n(-k * 0.4)} ${n(k * 0.45)} ${n(k * 0.7)}z`, fill: c.t.muted, class: o.themed ? 'dg-muted-f' : undefined, opacity: 0.6 })}/>`,
    );
  }
  if (g.media && s.shape === 'icon' && s.icon?.paths.length) {
    const m = g.media;
    const k = Math.min(m.w, m.h) / 24;
    const ic = stroke ?? c.ink('s');
    const body = s.icon.paths
      .map(([tag, a]) => `<${tag}${Object.entries(a)
        .map(([key, v]) => ` ${key}="${esc(String(v))}"`)
        .join('')}/>`)
      .join('');
    // Lines as wide as asked on the page (Lucide's own, 2 on its 24-unit grid, up to 3 pixels when it is drawn large).
    const iw = look.width !== undefined ? look.width / k : Math.min(2, 3 / k);
    parts.push(
      `<g${attrs({ transform: `translate(${n(m.x + (m.w - 24 * k) / 2)} ${n(m.y + (m.h - 24 * k) / 2)}) scale(${n(k)})`, fill: fill && look.fill ? fill.c : 'none', stroke: ic.c, class: ic.cls, 'stroke-width': iw, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })}>${body}</g>`,
    );
  }
  // The flip turns the drawing, never the words.
  const flip = s.flipH || s.flipV ? `translate(${n(s.flipH ? s.w : 0)} ${n(s.flipV ? s.h : 0)}) scale(${s.flipH ? -1 : 1} ${s.flipV ? -1 : 1})` : '';
  const drawing = flip ? `<g transform="${flip}">${parts.join('')}</g>` : parts.join('');
  // Words: the label, then a class's or a table's rows.
  const size = look.size ?? 14;
  const tl: TextLook = {
    font: look.font ?? o.font,
    size,
    bold: look.bold,
    italic: look.italic,
    underline: look.underline,
    align: look.align ?? 'center',
    valign: look.valign ?? 'middle',
  };
  const words: string[] = [];
  const lb = labelBox(s, g);
  if (s.text && lb) {
    const outside = (look.label ?? 'inside') !== 'inside';
    const headed = s.shape === 'class' || s.shape === 'entity' || s.shape === 'table';
    const at: TextLook = outside
      ? { ...tl, align: look.label === 'left' ? 'right' : look.label === 'right' ? 'left' : 'center', valign: look.label === 'above' ? 'bottom' : look.label === 'below' ? 'top' : 'middle' }
      : headed
        ? { ...tl, align: 'center', bold: look.bold ?? true }
        : tl;
    words.push(textBlock(s.text, lb, at, text, { rot: g.textRot }));
  }
  if (g.rows?.length) {
    const rowLook: TextLook = { ...tl, bold: false, valign: 'middle', align: s.shape === 'table' ? 'left' : (look.align ?? 'left') };
    for (const r of g.rows) {
      if (r.sep) continue;
      if (r.cells)
        r.cells.forEach((cell) => {
          if (cell.text) words.push(textBlock(cell.text, { x: cell.x + 8, y: r.y, w: Math.max(4, cell.w - 16), h: r.h }, { ...rowLook, bold: r.head || undefined }, text, { wrap: false }));
        });
      else words.push(textBlock(r.text, { x: 10, y: r.y, w: Math.max(4, s.w - 20), h: r.h }, rowLook, text, { wrap: false }));
    }
  }
  const turn = s.rot ? ` rotate(${n(s.rot)} ${n(s.w / 2)} ${n(s.h / 2)})` : '';
  const opacity = look.opacity !== undefined && look.opacity < 100 ? look.opacity / 100 : undefined;
  let out = `<g${attrs({ 'data-id': s.id, transform: `translate(${n(s.x)} ${n(s.y)})${turn}`, opacity })}>${gradient}${drawing}${words.join('')}${s.note ? `<title>${esc(s.note)}</title>` : ''}</g>`;
  if (o.links && s.link) out = `<a${attrs({ href: s.link, target: '_blank', rel: 'noopener' })}>${out}</a>`;
  return out;
}

// ---- connectors -------------------------------------------------------------------------------------------------------

/** One connector, as SVG: its line, its arrowheads and its words. */
export function edgeSvg(e: DiagramEdge, shapes: Map<string, DiagramShape>, o: RenderOpts = {}, c = new Ctx(o), geom: EdgeGeom = edgeGeom(e, shapes)): string {
  const look = e.style ?? {};
  const w = look.width ?? 1.5;
  const stroke: Paint = look.stroke && look.stroke !== 'none' ? { c: look.stroke } : c.ink('s');
  const ink: Paint = look.stroke && look.stroke !== 'none' ? { c: look.stroke } : c.ink('f');
  const sketch = (look.sketch ?? o.sketch) === true;
  const parts: string[] = [];
  const d = sketch ? sketchPath(geom.d, e.id, 0.8) : geom.d;
  const flow = look.flow ? 'dg-flow' : undefined;
  if (look.stroke !== 'none')
    parts.push(`<path${attrs({ d, fill: 'none', stroke: stroke.c, class: cls(stroke.cls, flow), 'stroke-width': w, 'stroke-dasharray': flow ? undefined : dashArray(look.dash, w), 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })}/>`);
  for (const [kind, end] of [
    [look.start ?? 'none', geom.start],
    [look.end ?? 'arrow', geom.end],
  ] as const) {
    if (kind === 'none' || look.stroke === 'none') continue;
    const h = arrowHead(kind, end.p, end.dir, w);
    if (h.solid) parts.push(`<path${attrs({ d: h.solid, fill: ink.c, class: ink.cls, stroke: ink.c, 'stroke-width': 1, 'stroke-linejoin': 'round' })}/>`);
    if (h.hollow) {
      const paper = c.paper();
      parts.push(`<path${attrs({ d: h.hollow, fill: paper.c, class: cls(paper.cls, stroke.cls), stroke: stroke.c, 'stroke-width': Math.max(1, w), 'stroke-linejoin': 'round' })}/>`);
    }
    if (h.line) parts.push(`<path${attrs({ d: h.line, fill: 'none', stroke: stroke.c, class: stroke.cls, 'stroke-width': Math.max(1, w), 'stroke-linecap': 'round' })}/>`);
  }
  // Words: in the middle (or where `at` says), on a patch of the paper; and near each end.
  const size = look.size ?? 13;
  const font = { font: look.font ?? o.font, size, bold: look.bold, italic: look.italic };
  const tp: Paint = look.color ? { c: look.color } : c.ink('f');
  const label = (text: string, p: Pt, patch: boolean) => {
    const lines = wrapText(text, 220, font);
    const lh = lineHeight(size);
    const tw = Math.max(...lines.map((l) => textWidth(l, font)));
    const b: Box = { x: p.x - tw / 2 - 4, y: p.y - (lines.length * lh) / 2 - 1, w: tw + 8, h: lines.length * lh + 2 };
    const paper = c.paper();
    return (
      (patch ? `<rect${attrs({ x: b.x, y: b.y, width: b.w, height: b.h, rx: 3, fill: paper.c, class: paper.cls, opacity: 0.92 })}/>` : '') +
      textBlock(lines.join('\n'), b, { ...font, size, underline: look.underline, align: 'center', valign: 'middle' }, tp, { wrap: false })
    );
  };
  if (e.text) parts.push(label(e.text, alongWalk(geom.walk, e.at ?? 0.5).p, true));
  const near = (text: string, fromEnd: boolean) => {
    const p = atDistance(geom.walk, 20, fromEnd);
    const dir = fromEnd ? geom.end.dir : { x: -geom.start.dir.x, y: -geom.start.dir.y };
    // Beside the line, to its left as it runs.
    const off = { x: dir.y * 11, y: -dir.x * 11 };
    return label(text, { x: p.x + off.x + (Math.abs(dir.y) > 0.5 ? (textWidth(text, font) / 2) * Math.sign(off.x || 1) : 0), y: p.y + off.y }, false);
  };
  if (e.fromText) parts.push(near(e.fromText, false));
  if (e.toText) parts.push(near(e.toText, true));
  const opacity = look.opacity !== undefined && look.opacity < 100 ? look.opacity / 100 : undefined;
  return `<g${attrs({ 'data-id': e.id, opacity })}>${parts.join('')}</g>`;
}

// ---- pages ------------------------------------------------------------------------------------------------------------

/** One item, as SVG. */
export function itemSvg(it: DiagramItem, shapes: Map<string, DiagramShape>, o: RenderOpts = {}): string {
  return it.type === 'shape' ? shapeSvg(it, o) : edgeSvg(it, shapes, o);
}

/** The box what a page holds takes, its words outside shapes and its connectors' courses with it; null when it is empty. */
export function pageBounds(p: DiagramPage, shapes = shapeMap(p)): Box | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const take = (b: Box) => {
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  };
  for (const it of p.items) {
    if (it.type === 'shape') {
      take(pageBox(it));
      const look = lookOf(it);
      if (it.text && (look.label ?? 'inside') !== 'inside') {
        const size = look.size ?? 14;
        const lines = wrapText(it.text, Math.max(it.w + 80, 140), { size, font: look.font });
        const tw = Math.max(...lines.map((l) => textWidth(l, { size, font: look.font })));
        const th = lines.length * lineHeight(size) + 6;
        const cx = it.x + it.w / 2;
        if (look.label === 'below') take({ x: cx - tw / 2, y: it.y + it.h, w: tw, h: th });
        else if (look.label === 'above') take({ x: cx - tw / 2, y: it.y - th, w: tw, h: th });
        else if (look.label === 'right') take({ x: it.x + it.w, y: it.y, w: tw + 12, h: it.h });
        else if (look.label === 'left') take({ x: it.x - tw - 12, y: it.y, w: tw + 12, h: it.h });
      }
    } else {
      const g = edgeGeom(it, shapes);
      for (const q of g.walk) take({ x: q.x - 6, y: q.y - 6, w: 12, h: 12 });
      if (it.text) {
        const q = alongWalk(g.walk, it.at ?? 0.5).p;
        const tw = Math.min(220, textWidth(it.text, { size: it.style?.size ?? 13 }));
        take({ x: q.x - tw / 2 - 6, y: q.y - 12, w: tw + 12, h: 24 });
      }
    }
  }
  return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

export const shapeMap = (p: DiagramPage) => new Map(p.items.filter((x): x is DiagramShape => x.type === 'shape').map((s) => [s.id, s]));

export interface PageSvgOpts extends RenderOpts {
  /** Room round what it holds, in pixels. */
  margin?: number;
  /** Its background: the page's colour (or the theme's paper) unless false (see-through). */
  background?: boolean;
  /** Scale: the SVG's width and height are its box times this. */
  scale?: number;
  /** Only these items (a selection), with what they need of the rest (the shapes their connectors join). */
  only?: Set<string>;
}

/** A page as a whole SVG document, sized to what it holds. */
export function pageSvg(d: Diagram, p: DiagramPage, o: PageSvgOpts = {}): { svg: string; box: Box } {
  const c = new Ctx({ ...o, sketch: o.sketch ?? d.sketch, font: o.font ?? d.font });
  const shapes = shapeMap(p);
  const items = o.only ? p.items.filter((it) => o.only!.has(it.id)) : p.items;
  const shown: DiagramPage = { ...p, items };
  const m = o.margin ?? 24;
  const b = pageBounds(shown, shapes) ?? { x: 0, y: 0, w: 320, h: 200 };
  const box = { x: Math.floor(b.x - m), y: Math.floor(b.y - m), w: Math.ceil(b.w + 2 * m), h: Math.ceil(b.h + 2 * m) };
  const k = o.scale ?? 1;
  const css: string[] = [];
  if (o.themed) css.push(themeCss());
  if (items.some((it) => it.type === 'edge' && it.style?.flow)) css.push(FLOW_CSS);
  const bg = o.background === false ? '' : p.background ? `<rect${attrs({ x: box.x, y: box.y, width: box.w, height: box.h, fill: p.background })}/>` : `<rect${attrs({ x: box.x, y: box.y, width: box.w, height: box.h, fill: c.t.paper, class: o.themed ? 'dg-paper-f' : undefined })}/>`;
  const body = items.map((it) => (it.type === 'shape' ? shapeSvg(it, c.o, c) : edgeSvg(it, shapes, c.o, c))).join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1"${attrs({ width: Math.round(box.w * k), height: Math.round(box.h * k), viewBox: `${box.x} ${box.y} ${box.w} ${box.h}` })}>` +
    (css.length ? `<style>${css.join('')}</style>` : '') +
    DEFS +
    bg +
    body +
    '</svg>';
  return { svg, box };
}

export { LIGHT, DARK };
