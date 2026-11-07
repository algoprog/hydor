// Changes to a diagram by the ids of what it holds, as agents send them (save_diagram's change, add, remove and layout)
// and as the editor's Arrange → Layout makes them: a shape's words, kind, look, place or container changed (its size
// grown to fit new words); connectors joined elsewhere or drawn otherwise; shapes and connectors added (those without a
// place put beside what they join, clear of the rest) or taken out (with the connectors that joined them); a page laid
// out again. The rest stays as it was.
import { arrowFrom, cleanColour, cleanStyle, cleanText, isShape, newId, normalizeDiagram, shapeFrom, styleSet, type Diagram, type DiagramEdge, type DiagramItem, type DiagramPage, type DiagramShape, type DiagramStyle } from './diagram.ts';
import { pageBox, KINDS } from './diagram-shapes.ts';
import { layout, type LEdge, type LNode } from './diagram-layout.ts';
import { sizeFor, specPage, darker, type LayoutKind, type SpecEdge, type SpecNode, type SpecOpts } from './diagram-spec.ts';
import { lineHeight, textSize, textWidth } from './diagram-text.ts';
import { CONTAINER_KINDS } from './diagram.ts';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

export interface DiagramEdits {
  /** Items changed, each by its id, with the fields that change. */
  change?: unknown[];
  /** Shapes and connectors added to a page. */
  add?: { nodes?: SpecNode[]; edges?: SpecEdge[] } | unknown[];
  /** Ids of items taken out. */
  remove?: unknown[];
  /** The page `add` and `layout` are for: its name, id or number (from 1); the first when left out. */
  page?: string | number;
  /** That page laid out again. */
  layout?: LayoutKind;
}

/**
 * Whether a save carries changes by id (rather than a whole diagram): change, add or remove; or layout alone with the id
 * of a saved one (with nodes, pages or Mermaid, layout says how those are laid out).
 */
export function editsIn(a: Obj): boolean {
  const given = (k: string) => a[k] !== undefined && a[k] !== null && !(Array.isArray(a[k]) && !(a[k] as unknown[]).length);
  if (['change', 'add', 'remove'].some(given)) return true;
  return given('layout') && typeof a.id === 'string' && !!a.id.trim() && !['nodes', 'pages', 'mermaid', 'diagram'].some(given);
}

/** The page a change names: by name, id or number (from 1), the first when left out. */
export function pageNamed(d: Diagram, p: unknown): DiagramPage | null {
  if (p === undefined || p === null || p === '') return d.pages[0] ?? null;
  if (typeof p === 'number') return d.pages[Math.round(p) - 1] ?? null;
  const s = String(p).trim();
  if (/^\d+$/.test(s)) return d.pages[Number(s) - 1] ?? null;
  return d.pages.find((x) => x.id === s) ?? d.pages.find((x) => x.name.toLowerCase() === s.toLowerCase()) ?? null;
}

/** A look changed by what a change says of it: a ready-made look by name, colours, then anything of its style. */
function restyle(base: DiagramStyle | undefined, c: Obj, edge: boolean): DiagramStyle | undefined {
  const st: DiagramStyle = { ...base };
  if (!edge) {
    const set = styleSet(c.color);
    if (set) {
      st.fill = set.fill;
      st.stroke = set.stroke;
      if (set.color) st.color = set.color;
      else delete st.color;
    } else {
      const col = cleanColour(c.color);
      if (col && col !== 'none') {
        st.fill = col;
        st.stroke = darker(col);
      }
    }
    const fill = cleanColour(c.fill);
    if (fill) st.fill = fill;
  } else {
    const col = cleanColour(c.color, false);
    if (col) st.stroke = col;
    if (c.dashed === true) st.dash = 'dashed';
    if (c.dotted === true) st.dash = 'dotted';
    if (c.dashed === false || c.dotted === false) delete st.dash;
    if (c.thick === true) st.width = 2.5;
    const w = typeof c.width === 'number' && c.width > 0 ? Math.min(c.width, 20) : undefined;
    if (w) st.width = w;
    if (c.arrow !== undefined) {
      const a = String(c.arrow);
      st.start = a === 'start' || a === 'both' ? 'arrow' : 'none';
      st.end = a === 'end' || a === 'both' ? 'arrow' : 'none';
      if (st.start === 'none') delete st.start;
    }
    const s = arrowFrom(c.start);
    if (s) st.start = s;
    const e = arrowFrom(c.end);
    if (e) st.end = e;
  }
  const stroke = cleanColour(c.stroke);
  if (stroke) st.stroke = stroke;
  const tc = cleanColour(c.textColor, false);
  if (tc) st.color = tc;
  if (isObj(c.style)) {
    // null in a change's style takes that part of the look away.
    for (const [k, v] of Object.entries(c.style)) if (v === null) delete (st as Obj)[k];
    Object.assign(st, cleanStyle(c.style) ?? {});
  }
  return Object.keys(st).length ? st : undefined;
}

/** The ends a change gives a connector: a shape's id, or {id, port}, or {x, y}. */
function endFrom(v: unknown, shapes: Map<string, DiagramShape>): DiagramEdge['from'] | null {
  if (typeof v === 'string') return shapes.has(v.trim()) ? { id: v.trim() } : null;
  if (!isObj(v)) return null;
  if (typeof v.id === 'string' && shapes.has(v.id)) {
    const e: DiagramEdge['from'] = { id: v.id };
    if (Array.isArray(v.port) && v.port.length === 2) e.port = [Math.min(1, Math.max(0, Number(v.port[0]) || 0)), Math.min(1, Math.max(0, Number(v.port[1]) || 0))];
    return e;
  }
  if (typeof v.x === 'number' && typeof v.y === 'number') return { x: v.x, y: v.y };
  return null;
}

/** A shape changed by a change: its words (growing it to fit, unless it is given a size), kind, look, place and more. */
function changeShape(s: DiagramShape, c: Obj, page: DiagramPage, o: SpecOpts, notes: string[]): DiagramShape {
  const out: DiagramShape = { ...s };
  if (c.text !== undefined) {
    const t = cleanText(c.text);
    if (t) out.text = t;
    else delete out.text;
  }
  if (c.shape !== undefined) {
    const k = shapeFrom(c.shape);
    if (k) {
      out.shape = k.shape;
      if (k.icon && o.icon) {
        const paths = o.icon(k.icon);
        if (paths?.length) out.icon = { name: k.icon, paths };
      }
    } else notes.push(`${s.id}: there is no shape “${String(c.shape)}”; it kept its kind.`);
  }
  if (typeof c.icon === 'string' && c.icon.trim()) {
    const paths = o.icon?.(c.icon.trim());
    if (paths?.length) {
      out.icon = { name: c.icon.trim(), paths };
      if (out.shape !== 'icon') out.shape = 'icon';
    } else notes.push(`${s.id}: there is no icon “${c.icon}” in Lucide.`);
  }
  if (Array.isArray(c.rows)) out.rows = c.rows.slice(0, 200).map((r) => cleanText(r, 1000).replace(/\n/g, ' '));
  if (c.rows === null) delete out.rows;
  out.style = restyle(s.style, c, false);
  if (!out.style) delete out.style;
  for (const k of ['x', 'y', 'w', 'h', 'rot'] as const) if (typeof c[k] === 'number' && Number.isFinite(c[k])) out[k] = k === 'w' || k === 'h' ? Math.max(1, c[k] as number) : (c[k] as number);
  if (c.parent === null || c.parent === '') delete out.parent;
  else if (typeof c.parent === 'string' && page.items.some((it) => it.id === c.parent && it.type === 'shape' && it.id !== s.id)) out.parent = c.parent;
  if (typeof c.link === 'string') out.link = c.link.trim() || undefined;
  if (typeof c.note === 'string') out.note = cleanText(c.note, 2000) || undefined;
  if (typeof c.locked === 'boolean') out.locked = c.locked || undefined;
  // New words (or rows, or kind) that no longer fit: it grows, its middle where it was.
  if ((c.text !== undefined || c.rows !== undefined || c.shape !== undefined) && c.w === undefined && c.h === undefined && !CONTAINER_KINDS.has(out.shape)) {
    const need = sizeFor(out.shape, out, o.font);
    const w = Math.max(out.w, need.w);
    const h = out.shape === 'class' || out.shape === 'entity' || out.shape === 'table' ? need.h : Math.max(out.h, need.h);
    out.x -= (w - out.w) / 2;
    out.y -= out.shape === 'class' || out.shape === 'entity' || out.shape === 'table' ? 0 : (h - out.h) / 2;
    out.w = w;
    out.h = h;
  }
  for (const k of Object.keys(out) as (keyof DiagramShape)[]) if (out[k] === undefined) delete out[k];
  return out;
}

function changeEdge(e: DiagramEdge, c: Obj, shapes: Map<string, DiagramShape>, notes: string[]): DiagramEdge {
  const out: DiagramEdge = { ...e, from: { ...e.from }, to: { ...e.to } };
  if (c.from !== undefined) {
    const f = endFrom(c.from, shapes);
    if (f) out.from = f;
    else notes.push(`${e.id}: its new start names no shape on its page.`);
  }
  if (c.to !== undefined) {
    const t = endFrom(c.to, shapes);
    if (t) out.to = t;
    else notes.push(`${e.id}: its new end names no shape on its page.`);
  }
  for (const k of ['text', 'fromText', 'toText'] as const)
    if (c[k] !== undefined) {
      const t = cleanText(c[k], k === 'text' ? undefined : 200);
      if (t) out[k] = t;
      else delete out[k];
    }
  if (typeof c.route === 'string' && ['orthogonal', 'straight', 'curved'].includes(c.route)) {
    if (c.route === 'orthogonal') delete out.route;
    else out.route = c.route as DiagramEdge['route'];
  }
  if (c.points === null || (Array.isArray(c.points) && !c.points.length)) delete out.points;
  else if (Array.isArray(c.points)) out.points = c.points.filter((p): p is [number, number] => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number' && Number.isFinite(v))).slice(0, 60);
  if (typeof c.at === 'number') out.at = Math.min(1, Math.max(0, c.at));
  out.style = restyle(e.style, c, true);
  if (!out.style) delete out.style;
  // Joined elsewhere: its old points belong to its old course.
  if ((c.from !== undefined || c.to !== undefined) && c.points === undefined) delete out.points;
  return out;
}

/** The way a page's connectors mostly run: down, or across. */
function flowOf(page: DiagramPage): 'down' | 'right' {
  const shapes = new Map(page.items.filter(isShape).map((s) => [s.id, s]));
  let down = 0;
  let right = 0;
  for (const it of page.items) {
    if (it.type !== 'edge' || !it.from.id || !it.to.id) continue;
    const a = shapes.get(it.from.id);
    const b = shapes.get(it.to.id);
    if (!a || !b) continue;
    const dx = Math.abs(b.x + b.w / 2 - (a.x + a.w / 2));
    const dy = Math.abs(b.y + b.h / 2 - (a.y + a.h / 2));
    if (dy >= dx) down++;
    else right++;
  }
  return right > down ? 'right' : 'down';
}

/** Whether a box meets any of the shapes of a page (with a margin). */
const clashes = (b: { x: number; y: number; w: number; h: number }, list: DiagramShape[], m = 24) =>
  list.some((s) => {
    if (CONTAINER_KINDS.has(s.shape)) return false;
    const q = pageBox(s);
    return b.x < q.x + q.w + m && q.x < b.x + b.w + m && b.y < q.y + q.h + m && q.y < b.y + b.h + m;
  });

/**
 * New shapes without a place put beside what they join (below it, or to its right, as the page's connectors run),
 * moved along until clear of the others; those joined to nothing go under everything.
 */
export function placeNew(page: DiagramPage, fresh: DiagramShape[], edges: DiagramEdge[]): void {
  const flow = flowOf(page);
  const placed = page.items.filter(isShape).filter((s) => !fresh.includes(s));
  const all = () => [...placed];
  for (const s of fresh) {
    const link = edges.find((e) => (e.to.id === s.id && placed.some((p) => p.id === e.from.id)) || (e.from.id === s.id && placed.some((p) => p.id === e.to.id)));
    const otherId = link ? (link.to.id === s.id ? link.from.id : link.to.id) : undefined;
    const near = otherId ? placed.find((p) => p.id === otherId) : undefined;
    let x: number;
    let y: number;
    if (near) {
      const before = link!.from.id === s.id;
      if (flow === 'down') {
        x = near.x + near.w / 2 - s.w / 2;
        y = before ? near.y - 70 - s.h : near.y + near.h + 70;
      } else {
        x = before ? near.x - 90 - s.w : near.x + near.w + 90;
        y = near.y + near.h / 2 - s.h / 2;
      }
      // Along the row (or the column) until it is clear, out to either side by turns.
      for (let k = 0, step = 0; k < 40 && clashes({ x, y, w: s.w, h: s.h }, all()); k++) {
        step = (k % 2 ? -1 : 1) * Math.ceil((k + 1) / 2) * (flow === 'down' ? s.w + 40 : s.h + 40);
        if (flow === 'down') x = near.x + near.w / 2 - s.w / 2 + step;
        else y = near.y + near.h / 2 - s.h / 2 + step;
      }
    } else {
      const bottom = placed.length ? Math.max(...placed.map((p) => pageBox(p).y + pageBox(p).h)) : 0;
      const left = placed.length ? Math.min(...placed.map((p) => pageBox(p).x)) : 40;
      x = left;
      y = bottom + 60;
      for (let k = 0; k < 60 && clashes({ x, y, w: s.w, h: s.h }, all()); k++) x += s.w + 40;
    }
    s.x = Math.round(x);
    s.y = Math.round(y);
    placed.push(s);
  }
}

/**
 * A page laid out again: its shapes placed as `kind` says (containers holding theirs), its connectors' points and the
 * sides they were set to taken away, so they run afresh. Shapes keep their sizes, but containers, which fit what they hold.
 */
export function relayoutPage(page: DiagramPage, kind: LayoutKind, o: { spacing?: number } = {}): DiagramPage {
  if (kind === 'none') return page;
  const shapes = page.items.filter(isShape);
  const holders = new Set(shapes.map((s) => s.parent).filter((p): p is string => !!p));
  const nodes: LNode[] = shapes.map((s) => {
    const look = { ...KINDS[s.shape].style, ...s.style };
    let w = s.w;
    let h = s.h;
    // Words under a shape take their room in the layout.
    if (s.text && (look.label === 'below' || look.label === 'above')) {
      const t = textSize(s.text, Math.max(s.w + 80, 140), { size: look.size ?? 14, font: look.font });
      w = Math.max(w, t.w + 8);
      h += t.h + 8;
    }
    const pad = holders.has(s.id)
      ? s.shape === 'swimlane'
        ? { top: 60, left: 26, right: 26, bottom: 26 }
        : s.shape === 'lane'
          ? { top: 26, left: 60, right: 26, bottom: 26 }
          : { top: (s.text ? lineHeight(look.size ?? 14) * s.text.split('\n').length + 18 : 0) + 22, left: 24, right: 24, bottom: 24 }
      : undefined;
    return { id: s.id, w: holders.has(s.id) ? 40 : w, h: holders.has(s.id) ? 40 : h, parent: s.parent, ...(pad ? { pad } : {}), ...(!s.parent && s.shape === 'lane' ? { lane: 'row' as const } : !s.parent && s.shape === 'swimlane' ? { lane: 'column' as const } : {}) };
  });
  const edgeList = page.items.filter((it): it is DiagramEdge => it.type === 'edge' && !!it.from.id && !!it.to.id && it.from.id !== it.to.id);
  const ledges: LEdge[] = edgeList.map((e) => ({ from: e.from.id!, to: e.to.id!, ...(e.text ? { label: { w: Math.min(220, textWidth(e.text, { size: e.style?.size ?? 13 })) + 12, h: lineHeight(13) * e.text.split('\n').length + 6 } } : {}) }));
  const r = layout(nodes, ledges, kind, o);
  const byEdge = new Map(edgeList.map((e, i) => [e.id, i]));
  const items: DiagramItem[] = page.items.map((it) => {
    if (it.type === 'shape') {
      const p = r.pos.get(it.id);
      if (!p) return it;
      const look = { ...KINDS[it.shape].style, ...it.style };
      const roomW = nodes.find((nd) => nd.id === it.id)!.w;
      const s: DiagramShape = { ...it, x: holders.has(it.id) ? p.x : p.x + (look.label === 'below' || look.label === 'above' ? (roomW - it.w) / 2 : 0), y: p.y };
      if (holders.has(it.id)) {
        s.w = p.w;
        s.h = p.h;
      }
      return s;
    }
    const i = byEdge.get(it.id);
    if (i === undefined) return it;
    const e: DiagramEdge = { ...it, from: { id: it.from.id }, to: { id: it.to.id } };
    delete e.points;
    const back = r.back.get(i);
    const ports = r.ports.get(i);
    if (back && e.route !== 'curved') {
      e.from.port = back.from;
      e.to.port = back.to;
      e.points = back.points.map((q) => [Math.round(q.x), Math.round(q.y)]);
    } else {
      if (ports) {
        e.from.port = ports.from;
        e.to.port = ports.to;
      }
      const bends = r.bends.get(i);
      if (bends?.length && e.route !== 'curved') e.points = bends.map((q) => [Math.round(q.x), Math.round(q.y)]);
    }
    if (kind === 'mindmap' || kind === 'radial') e.route = 'curved';
    return e;
  });
  return { ...page, items };
}

/**
 * Changes made on a diagram (it is not changed: a new one is given back), and what could not be done, said for the agent.
 */
export function applyDiagramEdits(d: Diagram, edits: DiagramEdits, o: SpecOpts = {}): { diagram: Diagram; notes: string[] } {
  const notes: string[] = [];
  const pages = d.pages.map((p) => ({ ...p, items: [...p.items] }));
  const where = new Map<string, DiagramPage>();
  for (const p of pages) for (const it of p.items) where.set(it.id, p);
  // Out: what is taken away, with the connectors joined to it; what was in a container taken away stays, on its own.
  if (Array.isArray(edits.remove)) {
    const gone = new Set(edits.remove.filter((x): x is string => typeof x === 'string').map((x) => x.trim()));
    const missing = [...gone].filter((x) => !where.has(x));
    if (missing.length) notes.push(`Nothing has the id ${missing.slice(0, 6).join(', ')}: nothing was taken out for ${missing.length === 1 ? 'it' : 'them'}.`);
    for (const p of pages) {
      p.items = p.items.filter((it) => !gone.has(it.id) && !(it.type === 'edge' && ((it.from.id && gone.has(it.from.id)) || (it.to.id && gone.has(it.to.id)))));
      p.items = p.items.map((it) => (it.parent && gone.has(it.parent) ? (({ parent: _p, ...rest }) => rest as DiagramItem)(it) : it));
    }
  }
  // Changed: each by its id, wherever it is.
  if (Array.isArray(edits.change)) {
    for (const c of edits.change) {
      if (!isObj(c) || typeof c.id !== 'string') continue;
      const p = pages.find((x) => x.items.some((it) => it.id === c.id));
      if (!p) {
        notes.push(`Nothing has the id ${c.id}: that change was not made.`);
        continue;
      }
      const shapes = new Map(p.items.filter(isShape).map((s) => [s.id, s]));
      p.items = p.items.map((it) => (it.id !== c.id ? it : it.type === 'shape' ? changeShape(it, c, p, o, notes) : changeEdge(it, c, shapes, notes)));
    }
  }
  // Added: made as a spec's nodes and edges are, then put beside what they join.
  const target = pageNamed({ ...d, pages }, edits.page);
  if (edits.add !== undefined && edits.add !== null) {
    if (!target) notes.push(`There is no page ${String(edits.page)}: nothing was added.`);
    else {
      const raw = edits.add;
      const nodes: SpecNode[] = Array.isArray(raw) ? (raw.filter((x) => isObj(x) && x.from === undefined) as unknown as SpecNode[]) : Array.isArray(raw.nodes) ? raw.nodes : [];
      const edges: SpecEdge[] = Array.isArray(raw) ? (raw.filter((x) => isObj(x) && x.from !== undefined) as unknown as SpecEdge[]) : Array.isArray(raw.edges) ? raw.edges : [];
      const have = new Set(target.items.map((it) => it.id));
      // The new ones made on their own (edges to shapes already there are joined after).
      const made = specPage({ nodes: nodes.map((nd) => (have.has(nd.id) ? { ...nd, id: newId('s') } : nd)), edges: [], layout: 'none' }, o);
      const fresh = made.page.items.filter(isShape);
      const unplaced = fresh.filter((s) => !nodes.find((nd) => nd.id === s.id && typeof nd.x === 'number' && typeof nd.y === 'number'));
      const shapes = new Map([...target.items.filter(isShape), ...fresh].map((s) => [s.id, s]));
      const conn = specPage({ nodes: [...shapes.values()].map((s) => ({ id: s.id, x: s.x, y: s.y, w: s.w, h: s.h })), edges: edges.map((e) => (e.id && have.has(e.id) ? { ...e, id: undefined } : e)), layout: 'none' }, o);
      notes.push(...made.notes, ...conn.notes.filter((n) => !n.startsWith('Shapes not in the library')));
      const newEdges = conn.page.items.filter((it): it is DiagramEdge => it.type === 'edge');
      // Placed (before the connectors are counted in), the new shapes among the others.
      target.items.push(...fresh);
      placeNew(target, unplaced, newEdges);
      // Containers go behind; connectors over the containers, under the shapes.
      const containers = fresh.filter((s) => CONTAINER_KINDS.has(s.shape));
      target.items = [...containers, ...target.items.filter((it) => !containers.includes(it as DiagramShape))];
      const firstShape = target.items.findIndex((it) => it.type === 'shape' && !CONTAINER_KINDS.has(it.shape));
      target.items.splice(firstShape < 0 ? target.items.length : firstShape, 0, ...newEdges);
    }
  }
  let out: Diagram = { ...d, pages };
  if (edits.layout) {
    const p = pageNamed(out, edits.page);
    if (!p) notes.push(`There is no page ${String(edits.page)} to lay out.`);
    else out = { ...out, pages: out.pages.map((x) => (x === p ? relayoutPage(x, edits.layout!) : x)) };
  }
  return { diagram: normalizeDiagram(out), notes };
}
