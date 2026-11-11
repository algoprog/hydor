// What the diagram editor does to a page, as plain functions of the page (each gives a new page; the one given stays as
// it was): moving shapes (what is in them with them, and the bends of connectors between moved shapes), resizing,
// turning and flipping, aligning, spacing out, matching sizes, grouping, bringing forward and sending back, copying and
// pasting (new ids, connectors among what was copied joined to the copies), taking out (with the connectors left
// hanging), the shapes that hold a point, and where guides line a moving box up with the others.
import { CONTAINER_KINDS, descendants, isEdge, isShape, newId, type DiagramEdge, type DiagramItem, type DiagramPage, type DiagramShape } from './diagram.ts';
import { inShape, pageBox, type Box } from './diagram-shapes.ts';
import { distanceTo, edgeGeom } from './diagram-route.ts';
import { SNAP, type SnapGuide } from './snap.ts';

export const shapeMapOf = (p: DiagramPage) => new Map(p.items.filter(isShape).map((s) => [s.id, s]));

/** The items a selection stands for: each picked one, the others of its group, and (for moving) what is inside containers picked. */
export function expandGroups(p: DiagramPage, ids: Iterable<string>): Set<string> {
  const out = new Set(ids);
  const groups = new Set<string>();
  for (const it of p.items) if (out.has(it.id) && it.group) groups.add(it.group);
  if (groups.size) for (const it of p.items) if (it.group && groups.has(it.group)) out.add(it.id);
  return out;
}

/** What moves when these move: themselves, what their containers hold, and connectors whose both ends move. */
export function movingSet(p: DiagramPage, ids: Iterable<string>): Set<string> {
  const out = expandGroups(p, ids);
  for (const id of [...out]) for (const d of descendants(p, id)) out.add(d);
  for (const it of p.items)
    if (isEdge(it)) {
      const a = it.from.id ? out.has(it.from.id) : true;
      const b = it.to.id ? out.has(it.to.id) : true;
      if ((a && b && (it.from.id || it.to.id)) || out.has(it.id)) out.add(it.id);
    }
  return out;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Items moved by dx, dy: shapes, the free ends and bends of connectors that move with them. */
export function moveItems(p: DiagramPage, ids: Set<string>, dx: number, dy: number): DiagramPage {
  if (!dx && !dy) return p;
  return {
    ...p,
    items: p.items.map((it) => {
      if (!ids.has(it.id)) return it;
      if (isShape(it)) return it.locked ? it : { ...it, x: r2(it.x + dx), y: r2(it.y + dy) };
      const e: DiagramEdge = { ...it };
      if (!e.from.id) e.from = { x: r2((e.from.x ?? 0) + dx), y: r2((e.from.y ?? 0) + dy) };
      if (!e.to.id) e.to = { x: r2((e.to.x ?? 0) + dx), y: r2((e.to.y ?? 0) + dy) };
      if (e.points) e.points = e.points.map(([x, y]) => [r2(x + dx), r2(y + dy)]);
      return e;
    }),
  };
}

/** One item replaced (by its id) with what `f` makes of it. */
export function updateItem<T extends DiagramItem>(p: DiagramPage, id: string, f: (it: T) => T): DiagramPage {
  return { ...p, items: p.items.map((it) => (it.id === id ? f(it as T) : it)) };
}

/** Many items changed by `f` (which gives the item back as it was to leave it). */
export function updateItems(p: DiagramPage, ids: Set<string>, f: (it: DiagramItem) => DiagramItem): DiagramPage {
  return { ...p, items: p.items.map((it) => (ids.has(it.id) ? f(it) : it)) };
}

/** Taken out: the items, what their containers held (let go, kept), and connectors left joined to nothing. */
export function removeItems(p: DiagramPage, ids: Set<string>): DiagramPage {
  const gone = expandGroups(p, ids);
  const items = p.items
    .filter((it) => !gone.has(it.id) && !(isEdge(it) && ((it.from.id && gone.has(it.from.id)) || (it.to.id && gone.has(it.to.id)))))
    .map((it) => (it.parent && gone.has(it.parent) ? (({ parent: _p, ...rest }) => rest as DiagramItem)(it) : it));
  return { ...p, items };
}

/** The box round some items on the page (shapes turned as they are, connectors' courses). */
export function boundsOf(p: DiagramPage, ids: Set<string>): Box | null {
  const shapes = shapeMapOf(p);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const it of p.items) {
    if (!ids.has(it.id)) continue;
    if (isShape(it)) {
      const b = pageBox(it);
      x0 = Math.min(x0, b.x);
      y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.w);
      y1 = Math.max(y1, b.y + b.h);
    } else {
      for (const q of edgeGeom(it, shapes).walk) {
        x0 = Math.min(x0, q.x);
        y0 = Math.min(y0, q.y);
        x1 = Math.max(x1, q.x);
        y1 = Math.max(y1, q.y);
      }
    }
  }
  return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

export type AlignHow = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

/** Shapes lined up on an edge or a middle of the box round them all (one alone: of nothing to line up with). */
export function alignShapes(p: DiagramPage, ids: Set<string>, how: AlignHow): DiagramPage {
  const shapes = p.items.filter((it): it is DiagramShape => isShape(it) && ids.has(it.id) && !it.locked);
  if (shapes.length < 2) return p;
  const b = boundsOf(p, new Set(shapes.map((s) => s.id)))!;
  let out = p;
  for (const s of shapes) {
    const q = pageBox(s);
    const dx = how === 'left' ? b.x - q.x : how === 'right' ? b.x + b.w - (q.x + q.w) : how === 'center' ? b.x + b.w / 2 - (q.x + q.w / 2) : 0;
    const dy = how === 'top' ? b.y - q.y : how === 'bottom' ? b.y + b.h - (q.y + q.h) : how === 'middle' ? b.y + b.h / 2 - (q.y + q.h / 2) : 0;
    out = moveItems(out, movingSet(out, [s.id]), dx, dy);
  }
  return out;
}

/** Three shapes or more spaced out evenly across (or down), the outer two staying where they are. */
export function distributeShapes(p: DiagramPage, ids: Set<string>, axis: 'x' | 'y'): DiagramPage {
  const shapes = p.items.filter((it): it is DiagramShape => isShape(it) && ids.has(it.id) && !it.locked);
  if (shapes.length < 3) return p;
  const boxes = shapes.map((s) => ({ s, b: pageBox(s) })).sort((a, b) => (axis === 'x' ? a.b.x - b.b.x : a.b.y - b.b.y));
  const first = boxes[0].b;
  const last = boxes[boxes.length - 1].b;
  const span = axis === 'x' ? last.x + last.w - first.x : last.y + last.h - first.y;
  const sizes = boxes.reduce((n, x) => n + (axis === 'x' ? x.b.w : x.b.h), 0);
  const gap = (span - sizes) / (boxes.length - 1);
  let at = axis === 'x' ? first.x + first.w + gap : first.y + first.h + gap;
  let out = p;
  for (const x of boxes.slice(1, -1)) {
    const d = at - (axis === 'x' ? x.b.x : x.b.y);
    out = moveItems(out, movingSet(out, [x.s.id]), axis === 'x' ? d : 0, axis === 'y' ? d : 0);
    at += (axis === 'x' ? x.b.w : x.b.h) + gap;
  }
  return out;
}

/** Shapes made as wide (or tall, or both) as the first picked, each about its middle. */
export function matchSize(p: DiagramPage, ids: string[], how: 'w' | 'h' | 'both'): DiagramPage {
  const shapes = ids.map((id) => p.items.find((it) => it.id === id)).filter((it): it is DiagramShape => isShape(it));
  if (shapes.length < 2) return p;
  const [ref] = shapes;
  const set = new Set(shapes.slice(1).map((s) => s.id));
  return updateItems(p, set, (it) => {
    const s = it as DiagramShape;
    const w = how === 'h' ? s.w : ref.w;
    const h = how === 'w' ? s.h : ref.h;
    return { ...s, x: r2(s.x + (s.w - w) / 2), y: r2(s.y + (s.h - h) / 2), w, h };
  });
}

/** Items grouped (they pick and move as one), or let go of their groups. */
export function groupItems(p: DiagramPage, ids: Set<string>): DiagramPage {
  if (ids.size < 2) return p;
  const g = newId('g');
  return updateItems(p, ids, (it) => ({ ...it, group: g }));
}
export function ungroupItems(p: DiagramPage, ids: Set<string>): DiagramPage {
  const all = expandGroups(p, ids);
  return updateItems(p, all, (it) => {
    if (!it.group) return it;
    const { group: _g, ...rest } = it;
    return rest as DiagramItem;
  });
}

/** Items brought to the front or sent to the back, or one step forward or back, keeping their order among themselves. */
export function reorder(p: DiagramPage, ids: Set<string>, how: 'front' | 'back' | 'forward' | 'backward'): DiagramPage {
  const items = [...p.items];
  if (how === 'front' || how === 'back') {
    const picked = items.filter((it) => ids.has(it.id));
    const rest = items.filter((it) => !ids.has(it.id));
    return { ...p, items: how === 'front' ? [...rest, ...picked] : [...picked, ...rest] };
  }
  if (how === 'forward') {
    for (let i = items.length - 2; i >= 0; i--)
      if (ids.has(items[i].id) && !ids.has(items[i + 1].id)) [items[i], items[i + 1]] = [items[i + 1], items[i]];
  } else {
    for (let i = 1; i < items.length; i++)
      if (ids.has(items[i].id) && !ids.has(items[i - 1].id)) [items[i], items[i - 1]] = [items[i - 1], items[i]];
  }
  return { ...p, items };
}

/** Containers after what holds them, and before what they hold, so what is inside is drawn over it. */
export function containersBehind(p: DiagramPage): DiagramPage {
  const idx = new Map(p.items.map((it, i) => [it.id, i]));
  let moved = false;
  const items = [...p.items];
  for (const it of p.items) {
    if (!it.parent) continue;
    const pi = idx.get(it.parent);
    const ci = idx.get(it.id);
    if (pi !== undefined && ci !== undefined && pi > ci) moved = true;
  }
  if (!moved) return p;
  // A stable order in which each container comes before what it holds.
  const out: DiagramItem[] = [];
  const done = new Set<string>();
  const byId = new Map(items.map((it) => [it.id, it]));
  const place = (it: DiagramItem, guard = 0) => {
    if (done.has(it.id) || guard > 64) return;
    if (it.parent && byId.has(it.parent)) place(byId.get(it.parent)!, guard + 1);
    done.add(it.id);
    out.push(it);
  };
  for (const it of items) place(it);
  return { ...p, items: out };
}

/**
 * Copies of items with new ids (groups and containers among them made anew; connectors among them joined to the copies,
 * a connector to a shape not copied keeps its end where it was, free), moved by dx, dy.
 */
export function cloneItems(items: DiagramItem[], dx: number, dy: number, shapesNow?: Map<string, DiagramShape>): DiagramItem[] {
  const ids = new Map<string, string>();
  const groups = new Map<string, string>();
  for (const it of items) ids.set(it.id, newId(isEdge(it) ? 'e' : 's'));
  const out: DiagramItem[] = [];
  for (const it of items) {
    const copy = JSON.parse(JSON.stringify(it)) as DiagramItem;
    copy.id = ids.get(it.id)!;
    if (copy.group) {
      if (!groups.has(copy.group)) groups.set(copy.group, newId('g'));
      copy.group = groups.get(copy.group);
    }
    if (copy.parent) {
      if (ids.has(copy.parent)) copy.parent = ids.get(copy.parent);
      else delete copy.parent;
    }
    if (isShape(copy)) {
      copy.x = r2(copy.x + dx);
      copy.y = r2(copy.y + dy);
      delete copy.locked;
    } else {
      const end = (e: DiagramEdge['from']): DiagramEdge['from'] => {
        if (e.id && ids.has(e.id)) return { ...e, id: ids.get(e.id) };
        if (e.id) {
          // Its shape stays behind: the end stays where it was, free.
          const s = shapesNow?.get(e.id);
          return s ? { x: r2(s.x + s.w / 2 + dx), y: r2(s.y + s.h / 2 + dy) } : { x: r2((e.x ?? 0) + dx), y: r2((e.y ?? 0) + dy) };
        }
        return { x: r2((e.x ?? 0) + dx), y: r2((e.y ?? 0) + dy) };
      };
      copy.from = end(copy.from);
      copy.to = end(copy.to);
      if (copy.points) copy.points = copy.points.map(([x, y]) => [r2(x + dx), r2(y + dy)]);
    }
    out.push(copy);
  }
  return out;
}

/** The topmost item at a point of the page, as they are drawn: a connector within a few pixels of its course, a shape in its outline. */
export function hitItem(p: DiagramPage, x: number, y: number, tol: number, o: { skip?: Set<string>; shapesOnly?: boolean; geom?: (e: DiagramEdge) => { walk: { x: number; y: number }[] } } = {}): DiagramItem | null {
  const shapes = shapeMapOf(p);
  const geomOf = o.geom ?? ((e: DiagramEdge) => edgeGeom(e, shapes));
  // From the top down, as drawn: a connector by its course (within a few pixels), a shape by its outline.
  for (let i = p.items.length - 1; i >= 0; i--) {
    const it = p.items[i];
    if (o.skip?.has(it.id)) continue;
    if (isEdge(it)) {
      if (!o.shapesOnly && distanceTo(geomOf(it).walk, { x, y }) <= tol) return it;
      continue;
    }
    // A container is picked by its edge or its title, not anywhere inside, so what it holds can be picked (and dragged onto it).
    if (CONTAINER_KINDS.has(it.shape)) {
      const b = pageBox(it);
      const inside = x > b.x + 10 && x < b.x + b.w - 10 && y > b.y + (it.shape === 'swimlane' ? 34 : it.shape === 'lane' || it.shape === 'frame' || it.shape === 'package' ? 26 : 30) && y < b.y + b.h - 10;
      const edgeHit = inShape(it, x, y, tol) && !(it.shape === 'lane' ? x > b.x + 34 && inside : inside);
      if (edgeHit) return it;
      continue;
    }
    if (inShape(it, x, y) || ((it.style?.fill === 'none' || it.shape === 'text' || it.shape === 'icon') && inShape(it, x, y, 2))) return it;
  }
  return null;
}

/** The innermost container under a point (none of `skip`, nor anything inside them): where a dropped shape goes. */
export function containerAt(p: DiagramPage, x: number, y: number, skip: Set<string>): DiagramShape | null {
  let best: DiagramShape | null = null;
  for (const it of p.items) {
    if (!isShape(it) || !CONTAINER_KINDS.has(it.shape) || skip.has(it.id)) continue;
    const b = pageBox(it);
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) best = it;
  }
  return best;
}

/** Each moved shape put in the container it was dropped in (or out of the one it left). */
export function reparent(p: DiagramPage, moved: Set<string>): DiagramPage {
  let out = p;
  const tops = [...moved].filter((id) => {
    const it = p.items.find((x) => x.id === id);
    return isShape(it) && !(it.parent && moved.has(it.parent));
  });
  for (const id of tops) {
    const s = out.items.find((x) => x.id === id) as DiagramShape;
    const b = pageBox(s);
    const skip = new Set([id, ...descendants(out, id)]);
    const c = containerAt(out, b.x + b.w / 2, b.y + b.h / 2, skip);
    const next = c?.id;
    if (next === s.parent) continue;
    out = updateItem<DiagramShape>(out, id, (x) => {
      const y: DiagramShape = { ...x };
      if (next) y.parent = next;
      else delete y.parent;
      return y;
    });
  }
  return containersBehind(out);
}

// ---- guides -------------------------------------------------------------------------------------------------------------

export type Guide = SnapGuide;

/**
 * Where a moving box lines up with the other shapes: its left, middle or right on theirs (and top, middle or bottom),
 * within `tol`. Gives how far to move it to meet them, and the lines that show it (the maths is shared with designs:
 * shared/snap.ts).
 */
export function snapBox(b: Box, others: Box[], tol: number): { dx: number; dy: number; guides: Guide[] } {
  const s = SNAP.snapMove(b, others, tol);
  return { dx: s.dx, dy: s.dy, guides: s.guides };
}

export const snapTo = (v: number, grid: number) => (grid > 0 ? Math.round(v / grid) * grid : v);

/** The items whose box meets (or with `whole`, holds wholly) a rectangle of the page: what a drag across the page picks. */
export function itemsIn(p: DiagramPage, r: Box, whole = true, geom?: (e: DiagramEdge) => { walk: { x: number; y: number }[] }): string[] {
  const shapes = shapeMapOf(p);
  const geomOf = geom ?? ((e: DiagramEdge) => edgeGeom(e, shapes));
  const out: string[] = [];
  const inR = (b: Box) => (whole ? b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h : b.x < r.x + r.w && r.x < b.x + b.w && b.y < r.y + r.h && r.y < b.y + b.h);
  for (const it of p.items) {
    if (isShape(it)) {
      if (inR(pageBox(it))) out.push(it.id);
    } else {
      const w = geomOf(it).walk;
      const xs = w.map((q) => q.x);
      const ys = w.map((q) => q.y);
      if (inR({ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) })) out.push(it.id);
    }
  }
  return out;
}
