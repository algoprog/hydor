// A diagram page on screen, as draw.io's canvas: the page drawn by the same renderer as its files (each item on its own,
// drawn again only when it or what it joins changes), panned with a drag on empty space (the middle button, Space, or a
// finger), zoomed with Ctrl and the wheel or a pinch; picking (a click, Shift for more, a drag across the page),
// moving (guides line shapes up with the others, with the gaps they share, and say how far the nearest shape is on each
// side; the grid takes them otherwise; Ctrl drags a copy, Alt snaps to nothing, Shift keeps it straight; dropped in a
// container, a shape goes in it), resizing (its edges line up with the others' too, or make it as wide or high as
// another, with the same pink guides and pills; Shift keeps its shape) and turning; the blue arrows round a shape pointed at, which add a shape
// joined to it in a click or draw a connector where they are dragged; a connector's ends dragged to other shapes (or a
// fixed point of one), its bends and runs moved, its words slid along it; words typed in place. What changes is handed
// up when a gesture ends: the editor keeps it, for Undo.
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CONTAINER_KINDS, DARK, descendants, fontCss, inkOn, isEdge, isShape, LIGHT, newId, ROW_KINDS, type Diagram, type DiagramEdge, type DiagramEnd, type DiagramItem, type DiagramPage, type DiagramShape } from '@shared/diagram';
import { KINDS, labelBox, lookOf, pageBox, perimeterPoint, portPoint, shapeGeom, shapePorts, toLocal, toPage, type Box, type Pt } from '@shared/diagram-shapes';
import { alongWalk, edgeGeom, type EdgeGeom } from '@shared/diagram-route';
import { DEFS, edgeSvg, FLOW_CSS, shapeSvg, themeCss } from '@shared/diagram-render';
import { boundsOf, cloneItems, hitItem, itemsIn, moveItems, movingSet, reparent, snapTo, updateItem } from '@shared/diagram-ops';
import { GUIDE_COLOUR, SNAP, type SnapBox, type SnapGap, type SnapGuide } from '@shared/snap';
import { lineHeight, textSize } from '@shared/diagram-text';
import { cx } from '../../../components/ui';
import { isCopyDrag, isNoSnap } from '../common/keys';

export interface View {
  x: number;
  y: number;
  k: number;
}

export interface CanvasApi {
  /** A point of the screen as a point of the page. */
  toPage(cx: number, cy: number): Pt;
  /** The middle of what shows, on the page. */
  middle(): Pt;
  /** Zooms about the middle (or a point of the screen). */
  zoomBy(f: number, at?: { x: number; y: number }): void;
  /** Fits what the page holds (or a box of it) in the window. */
  fit(box?: Box | null, max?: number): void;
  /** Starts typing in a shape's words (or a connector's), or a class's rows; `text`: in place of its words (typed over it). */
  edit(id: string, part?: 'text' | 'rows', o?: { text?: string }): void;
  /** The element the page is drawn in. */
  el(): HTMLDivElement | null;
  /** Puts a box of the page in view, unless it is already. */
  show(box: Box): void;
}

export interface CanvasProps {
  diagram: Diagram;
  page: DiagramPage;
  sel: string[];
  onSel: (ids: string[]) => void;
  readOnly: boolean;
  dark: boolean;
  view: View;
  onView: (v: View) => void;
  /** A change made by a gesture (handed up once, when it ends). */
  onChange: (page: DiagramPage, key?: string) => void;
  /** Right click (or a long press): the item under it, if any, and where. */
  onMenu: (at: { x: number; y: number }, hit: DiagramItem | null) => void;
  /** A double click on empty space: where, to add a shape there. */
  onQuickAdd: (at: { x: number; y: number }, p: Pt) => void;
  /** Where an agent's words are arriving: that item, marked. */
  mark?: string;
  /** Pictures as the app shows them (a kept picture by its address). */
  src: (s: string) => string;
  snap: boolean;
  showGrid: boolean;
  /** Items matched by Find, marked. */
  found?: Set<string>;
  touch?: boolean;
}

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const HPOS: Record<Handle, [number, number]> = { nw: [0, 0], n: [0.5, 0], ne: [1, 0], e: [1, 0.5], se: [1, 1], s: [0.5, 1], sw: [0, 1], w: [0, 0.5] };
const CURSOR: Record<Handle, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };

type Drag =
  | { kind: 'pan'; x0: number; y0: number; v: View }
  | { kind: 'band'; p0: Pt; p1: Pt; add: boolean; base: string[] }
  | { kind: 'move'; p0: Pt; ids: Set<string>; base: DiagramPage; moved: boolean; copy: boolean; hit: string; wasSel: boolean }
  | { kind: 'resize'; id: string; h: Handle; base: DiagramPage; s0: DiagramShape }
  | { kind: 'rotate'; id: string; base: DiagramPage; s0: DiagramShape }
  | { kind: 'end'; id: string; which: 'from' | 'to'; base: DiagramPage }
  | { kind: 'connect'; from: DiagramEnd; p: Pt; base: DiagramPage; dir?: 'n' | 'e' | 's' | 'w'; sx: number; sy: number; went: boolean }
  | { kind: 'seg'; id: string; i: number; base: DiagramPage; pts: Pt[]; p0: Pt }
  | { kind: 'point'; id: string; i: number; base: DiagramPage; insert: boolean }
  | { kind: 'label'; id: string; base: DiagramPage };

const r2 = (v: number) => Math.round(v * 100) / 100;

/** What a drag shows over the page: guide lines, the gaps between shapes, and small pills with a length or a size. */
interface Marks {
  guides: SnapGuide[];
  gaps: SnapGap[];
  pills: { x: number; y: number; text: string }[];
}
const NO_MARKS: Marks = { guides: [], gaps: [], pills: [] };

/** A small pink pill with white words, the same size on the screen at any zoom. */
function Pill({ x, y, text, k }: { x: number; y: number; text: string; k: number }) {
  const w = text.length * 6.2 + 10;
  return (
    <g transform={`translate(${x} ${y}) scale(${1 / k})`} style={{ pointerEvents: 'none' }}>
      <rect x={-w / 2} y={-8} width={w} height={16} rx={5} fill={GUIDE_COLOUR} />
      <text y={3.8} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="#fff" fontFamily="system-ui, sans-serif">
        {text}
      </text>
    </g>
  );
}

/** The pills for "as wide as" and "as high as" another shape: an "=" on each of them, under it or beside it. */
function equalPills(box: SnapBox, same: SnapBox[], horizontal: boolean, k: number): { x: number; y: number; text: string }[] {
  const at = (b: SnapBox) => (horizontal ? { x: b.x + b.w / 2, y: b.y + b.h + 12 / k, text: '=' } : { x: b.x + b.w + 12 / k, y: b.y + b.h / 2, text: '=' });
  return same.length ? [at(box), ...same.map(at)] : [];
}

/** An item drawn: its SVG, made again only when it (or, for a connector, a shape it joins) changes. */
const ItemView = memo(function ItemView({ svg }: { svg: string }) {
  return <g dangerouslySetInnerHTML={{ __html: svg }} />;
});

export const DiagramCanvas = forwardRef<CanvasApi, CanvasProps>(function DiagramCanvas(props, ref) {
  const { diagram, page, sel, onSel, readOnly, dark, view, onView, onChange, onMenu, onQuickAdd, mark, src, snap, showGrid, found, touch } = props;
  const root = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [preview, setPreview] = useState<DiagramPage | null>(null);
  const [marks, setMarks] = useState<Marks>(NO_MARKS);
  const [hover, setHover] = useState<string | null>(null);
  const [target, setTarget] = useState<{ id: string; port?: [number, number] } | null>(null);
  const [editing, setEditing] = useState<{ id: string; part: 'text' | 'rows'; value: string; end?: boolean } | null>(null);
  const space = useRef(false);
  const viewRef = useRef(view);
  viewRef.current = view;
  const shown = preview ?? page;
  const shapes = useMemo(() => new Map(shown.items.filter(isShape).map((s) => [s.id, s])), [shown]);
  const selSet = useMemo(() => new Set(sel), [sel]);
  const setD = (d: Drag | null) => {
    dragRef.current = d;
    setDrag(d);
  };

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const toPg = useCallback((clientX: number, clientY: number): Pt => {
    const r = root.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - r.left - v.x) / v.k, y: (clientY - r.top - v.y) / v.k };
  }, []);

  const zoomAt = useCallback(
    (f: number, sx: number, sy: number) => {
      const v = viewRef.current;
      const k = Math.min(8, Math.max(0.05, v.k * f));
      onView({ k, x: sx - ((sx - v.x) * k) / v.k, y: sy - ((sy - v.y) * k) / v.k });
    },
    [onView],
  );

  const fit = useCallback(
    (box?: Box | null, max = 1) => {
      const b = box ?? boundsOf(page, new Set(page.items.map((it) => it.id)));
      const el = root.current;
      if (!el) return;
      const W = el.clientWidth;
      const H = el.clientHeight;
      if (!b) return onView({ x: W / 2 - 300, y: 60, k: 1 });
      const k = Math.min(max, Math.max(0.1, Math.min((W - 80) / Math.max(1, b.w), (H - 80) / Math.max(1, b.h))));
      onView({ k, x: W / 2 - (b.x + b.w / 2) * k, y: H / 2 - (b.y + b.h / 2) * k });
    },
    [page, onView],
  );

  useImperativeHandle(ref, () => ({
    toPage: toPg,
    middle: () => {
      const v = viewRef.current;
      return { x: (size.w / 2 - v.x) / v.k, y: (size.h / 2 - v.y) / v.k };
    },
    zoomBy: (f, at) => zoomAt(f, at?.x ?? size.w / 2, at?.y ?? size.h / 2),
    fit,
    edit: (id, part = 'text', o) => startEdit(id, part, o),
    el: () => root.current,
    show: (b) => {
      const v = viewRef.current;
      const x0 = b.x * v.k + v.x;
      const y0 = b.y * v.k + v.y;
      const x1 = (b.x + b.w) * v.k + v.x;
      const y1 = (b.y + b.h) * v.k + v.y;
      if (x0 >= 20 && y0 >= 20 && x1 <= size.w - 20 && y1 <= size.h - 20) return;
      onView({ ...v, x: size.w / 2 - (b.x + b.w / 2) * v.k, y: size.h / 2 - (b.y + b.h / 2) * v.k });
    },
  }));

  // ---- the drawing --------------------------------------------------------------------------------------------------
  const opts = useMemo(() => ({ themed: true, theme: dark ? DARK : LIGHT, src, sketch: diagram.sketch, font: diagram.font }), [dark, src, diagram.sketch, diagram.font]);
  const cache = useRef(new Map<string, { it: DiagramItem; a?: DiagramShape; b?: DiagramShape; ver: unknown; svg: string; geom?: EdgeGeom }>());
  // Drawn another way (the theme, by hand, the font): every item drawn again, in this very drawing.
  const cacheFor = useRef(opts);
  if (cacheFor.current !== opts) {
    cacheFor.current = opts;
    cache.current.clear();
  }
  // Connectors keep clear of the shapes in their way: all are drawn again when the page changes, but while a gesture
  // goes on only those joined to what moves.
  const settled = drag ? 'drag' : page;
  const geomOf = (e: DiagramEdge) => {
    const a = e.from.id ? shapes.get(e.from.id) : undefined;
    const b = e.to.id ? shapes.get(e.to.id) : undefined;
    const c = cache.current.get(e.id);
    if (c && c.it === e && c.a === a && c.b === b && (c.ver === settled || settled === 'drag') && c.geom) return c;
    const geom = edgeGeom(e, shapes);
    const svg = edgeSvg(e, shapes, opts, undefined, geom);
    const entry = { it: e, a, b, ver: settled, svg, geom };
    cache.current.set(e.id, entry);
    return entry;
  };
  const edgeOf = (e: DiagramEdge) => geomOf(e).geom!;
  const svgOf = (it: DiagramItem): string => {
    const editingThis = editing?.id === it.id;
    if (isEdge(it)) {
      if (editingThis) return edgeSvg({ ...it, text: undefined }, shapes, opts);
      return geomOf(it).svg;
    }
    const c = cache.current.get(it.id);
    if (!editingThis && c && c.it === it) return c.svg;
    const svg = shapeSvg(editingThis ? (editing!.part === 'rows' ? { ...it, rows: it.rows?.map(() => '') } : { ...it, text: undefined }) : it, opts);
    if (!editingThis) cache.current.set(it.id, { it, ver: null, svg });
    return svg;
  };

  // ---- gestures -----------------------------------------------------------------------------------------------------
  const tol = 6 / view.k;
  const grid = diagram.grid ?? 10;

  /** The other shapes' boxes, those in view: what a moving box lines up with. */
  const othersInView = (skip: Set<string>): Box[] => {
    const v = viewRef.current;
    const vx0 = -v.x / v.k;
    const vy0 = -v.y / v.k;
    const vx1 = vx0 + size.w / v.k;
    const vy1 = vy0 + size.h / v.k;
    const out: Box[] = [];
    for (const it of page.items) {
      if (!isShape(it) || skip.has(it.id)) continue;
      const b = pageBox(it);
      if (b.x + b.w < vx0 || b.x > vx1 || b.y + b.h < vy0 || b.y > vy1) continue;
      out.push(b);
      if (out.length > 300) break;
    }
    return out;
  };

  /** Where a connector end would join under a point: a shape (and a fixed point of it, when near one). */
  const joinAt = (p: Pt, skip?: string): { id: string; port?: [number, number] } | null => {
    const hit = hitItem(shown, p.x, p.y, tol, { shapesOnly: true, skip: skip ? new Set([skip]) : undefined });
    // Near a shape's edge counts too: ports sit on it.
    let s = hit && isShape(hit) ? hit : null;
    if (!s)
      for (let i = shown.items.length - 1; i >= 0; i--) {
        const it = shown.items[i];
        if (isShape(it) && it.id !== skip) {
          const b = pageBox(it);
          if (p.x > b.x - 12 / view.k && p.x < b.x + b.w + 12 / view.k && p.y > b.y - 12 / view.k && p.y < b.y + b.h + 12 / view.k) {
            s = it;
            break;
          }
        }
      }
    if (!s) return null;
    if (s.shape === 'lifeline') {
      const l = toLocal(s, p.x, p.y);
      return { id: s.id, port: [0.5, Math.round(Math.min(1, Math.max(0, l.y / s.h)) * 10000) / 10000] };
    }
    for (const port of shapePorts(s)) {
      const q = toPage(s, port[0] * s.w, port[1] * s.h);
      if (Math.hypot(q.x - p.x, q.y - p.y) <= 10 / view.k) return { id: s.id, port };
    }
    return { id: s.id };
  };

  const startEdit = (id: string, part: 'text' | 'rows' = 'text', o: { text?: string } = {}) => {
    if (readOnly) return;
    const it = page.items.find((x) => x.id === id);
    if (!it) return;
    if (isShape(it) && part === 'rows' && ROW_KINDS.has(it.shape)) setEditing({ id, part, value: (it.rows ?? []).join('\n') });
    // Typing on a picked shape: its words become what was typed, the caret after it.
    else if (o.text !== undefined) setEditing({ id, part: 'text', value: o.text, end: true });
    else setEditing({ id, part: 'text', value: it.text ?? '' });
  };

  const finishEdit = (cancel = false) => {
    const e = editing;
    setEditing(null);
    if (!e || cancel) return;
    const it = page.items.find((x) => x.id === e.id);
    if (!it) return;
    if (e.part === 'rows' && isShape(it)) {
      const rows = e.value.split('\n').map((r) => r.replace(/\s+$/, ''));
      while (rows.length && !rows[rows.length - 1]) rows.pop();
      if (JSON.stringify(rows) === JSON.stringify(it.rows ?? [])) return;
      return onChange(updateItem<DiagramShape>(page, it.id, (s) => withRows(s, rows)), undefined);
    }
    const text = e.value.replace(/\s+$/, '');
    if (text === (it.text ?? '')) return;
    onChange(updateItem<DiagramItem>(page, it.id, (x) => (isShape(x) ? fitText(x, text) : { ...x, text: text || undefined })), undefined);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (editing) finishEdit();
    root.current?.focus({ preventScroll: true });
    const p = toPg(e.clientX, e.clientY);
    const t = e.target as Element;
    const handle = t.closest('[data-h]')?.getAttribute('data-h');
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    if (e.button === 1 || space.current || (e.button === 0 && touch && !handle && !hitItem(shown, p.x, p.y, tol))) {
      setD({ kind: 'pan', x0: e.clientX, y0: e.clientY, v: viewRef.current });
      return;
    }
    if (e.button === 2) return;
    if (handle && !readOnly) {
      const [kind, id, extra] = handle.split(':');
      if (kind === 'size') {
        const s = page.items.find((x) => x.id === id) as DiagramShape;
        return setD({ kind: 'resize', id, h: extra as Handle, base: page, s0: s });
      }
      if (kind === 'rot') return setD({ kind: 'rotate', id, base: page, s0: page.items.find((x) => x.id === id) as DiagramShape });
      if (kind === 'end') return setD({ kind: 'end', id, which: extra as 'from' | 'to', base: page });
      if (kind === 'seg') {
        const g = geomOf(page.items.find((x) => x.id === id) as DiagramEdge).geom!;
        return setD({ kind: 'seg', id, i: Number(extra), base: page, pts: g.pts, p0: p });
      }
      if (kind === 'pt' || kind === 'mid') return setD({ kind: 'point', id, i: Number(extra), base: page, insert: kind === 'mid' });
      if (kind === 'label') return setD({ kind: 'label', id, base: page });
      if (kind === 'arrow' || kind === 'port') {
        const s = page.items.find((x) => x.id === id) as DiagramShape;
        const from: DiagramEnd = kind === 'port' ? { id, port: extra.split(',').map(Number) as [number, number] } : { id };
        if (!s) return;
        return setD({ kind: 'connect', from, p, base: page, dir: kind === 'arrow' ? (extra as 'n' | 'e' | 's' | 'w') : undefined, sx: e.clientX, sy: e.clientY, went: false });
      }
    }
    const hit = hitItem(shown, p.x, p.y, tol, { geom: edgeOf });
    if (!hit) {
      if (!e.shiftKey) onSel([]);
      setD({ kind: 'band', p0: p, p1: p, add: e.shiftKey, base: e.shiftKey ? sel : [] });
      return;
    }
    const groupOf = (id: string) => {
      const it = page.items.find((x) => x.id === id);
      return it?.group ? page.items.filter((x) => x.group === it.group).map((x) => x.id) : [id];
    };
    let next = sel;
    const wasSel = selSet.has(hit.id);
    if (e.shiftKey) next = wasSel ? sel.filter((x) => !groupOf(hit.id).includes(x)) : [...sel, ...groupOf(hit.id)];
    else if (!wasSel) next = groupOf(hit.id);
    if (next !== sel) onSel(next);
    if (readOnly) return;
    const movable = next.filter((id) => {
      const it = page.items.find((x) => x.id === id);
      return it && !it.locked && (isShape(it) || (isEdge(it) && (!it.from.id || !it.to.id)));
    });
    if (!movable.length) return;
    setD({ kind: 'move', p0: p, ids: movingSet(page, movable), base: page, moved: false, copy: isCopyDrag(e), hit: hit.id, wasSel });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    const p = toPg(e.clientX, e.clientY);
    if (!d) {
      if (readOnly || editing) return;
      const hit = hitItem(shown, p.x, p.y, tol, { shapesOnly: true });
      // Pointing near a picked shape's blue arrows keeps it pointed at.
      const keep = hover && (e.target as Element).closest('[data-h]');
      setHover(hit && isShape(hit) ? hit.id : keep ? hover : null);
      return;
    }
    if (d.kind === 'pan') {
      onView({ ...d.v, x: d.v.x + e.clientX - d.x0, y: d.v.y + e.clientY - d.y0 });
      return;
    }
    if (d.kind === 'band') {
      setD({ ...d, p1: p });
      const r = { x: Math.min(d.p0.x, p.x), y: Math.min(d.p0.y, p.y), w: Math.abs(p.x - d.p0.x), h: Math.abs(p.y - d.p0.y) };
      const ids = itemsIn(page, r, !e.altKey, edgeOf);
      onSel([...new Set([...d.base, ...ids])]);
      return;
    }
    if (d.kind === 'move') {
      let dx = p.x - d.p0.x;
      let dy = p.y - d.p0.y;
      if (!d.moved && Math.hypot(dx, dy) * view.k < 3) return;
      if (e.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      let base = d.base;
      let ids = d.ids;
      // A copy is dragged, not the shapes themselves.
      if (d.copy && !d.moved) {
        const items = d.base.items.filter((it) => d.ids.has(it.id));
        const copies = cloneItems(items, 0, 0, new Map(d.base.items.filter(isShape).map((s) => [s.id, s])));
        base = { ...d.base, items: [...d.base.items, ...copies] };
        ids = new Set(copies.map((c) => c.id));
        onSel(copies.filter((c) => sel.includes(items[copies.indexOf(c)]?.id ?? '')).map((c) => c.id));
      }
      const box = boundsOf(base, new Set([...ids].filter((id) => shapes.has(id) || base.items.some((x) => x.id === id && isShape(x)))));
      let m = NO_MARKS;
      if (box && snap) {
        const moved = { ...box, x: box.x + dx, y: box.y + dy };
        const others = othersInView(ids);
        // Alt (⌘ on a Mac): no snapping to anything for this drag; the distances still show.
        let ex = dx;
        let ey = dy;
        const guides: SnapGuide[] = [];
        let gaps: SnapGap[] = [];
        if (!isNoSnap(e)) {
          const s1 = SNAP.snapMove(moved, others, tol);
          const s2 = SNAP.snapEqual(moved, others, tol, s1.dx, s1.dy, s1.x, s1.y);
          ex += s2.dx;
          ey += s2.dy;
          guides.push(...s1.guides);
          gaps = s2.gaps;
          if (!s1.x && s2.dx === s1.dx && grid) ex = snapTo(box.x + dx, grid) - box.x;
          if (!s1.y && s2.dy === s1.dy && grid) ey = snapTo(box.y + dy, grid) - box.y;
        }
        // How far the nearest shape is on each side, where an equal gap does not say so already.
        const at = { x: box.x + ex, y: box.y + ey, w: box.w, h: box.h };
        const same = (a: SnapGap, b: SnapGap) => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5;
        for (const g of SNAP.neighbourGaps(at, others)) if (!gaps.some((q) => same(q, g))) gaps.push(g);
        m = { guides, gaps, pills: [] };
        dx = ex;
        dy = ey;
      }
      setMarks(m);
      setPreview(moveItems(base, ids, r2(dx), r2(dy)));
      dragRef.current = { ...d, moved: true, base, ids };
      return;
    }
    if (d.kind === 'resize') {
      const s = d.s0;
      const l = toLocal(s, p.x, p.y);
      const [hx, hy] = HPOS[d.h];
      let x0 = 0;
      let y0 = 0;
      let x1 = s.w;
      let y1 = s.h;
      if (hx === 0) x0 = Math.min(l.x, s.w - 8);
      if (hx === 1) x1 = Math.max(l.x, 8);
      if (hy === 0) y0 = Math.min(l.y, s.h - 8);
      if (hy === 1) y1 = Math.max(l.y, 8);
      let nb = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      let m = NO_MARKS;
      if (!s.rot) {
        // Unturned: the edges that move line up with the other shapes' (or make it as wide or high as one), else go to
        // the grid; Shift keeps its shape, the edge that moves most leading. Alt (⌘ on a Mac) snaps to nothing.
        const on = snap && !isNoSnap(e);
        const skip = new Set([s.id, ...descendants(page, s.id)]);
        const r = SNAP.snapResize({
          box: { x: s.x + x0, y: s.y + y0, w: x1 - x0, h: y1 - y0 },
          from: { x: s.x, y: s.y, w: s.w, h: s.h },
          edges: { l: hx === 0, r: hx === 1, t: hy === 0, b: hy === 1 },
          others: on ? othersInView(skip) : [],
          tol: on ? tol : 0,
          grid: on && grid ? grid : 0,
          ratio: e.shiftKey,
          min: 4,
        });
        nb = { x: r.box.x - s.x, y: r.box.y - s.y, w: r.box.w, h: r.box.h };
        m = {
          guides: r.guides,
          gaps: [],
          pills: [{ x: r.box.x + r.box.w / 2, y: r.box.y + r.box.h + 20 / view.k, text: `${Math.round(r.box.w)} × ${Math.round(r.box.h)}` }, ...equalPills(r.box, r.sameW, true, view.k), ...equalPills(r.box, r.sameH, false, view.k)],
        };
      } else if (e.shiftKey && hx !== 0.5 && hy !== 0.5) {
        // A corner of a turned shape keeps its shape (and the opposite corner where it was).
        const ratio = s.w / s.h;
        const w = x1 - x0;
        const h = y1 - y0;
        if (w / h > ratio) {
          const nh = w / ratio;
          if (hy === 0) y0 = y1 - nh;
          else y1 = y0 + nh;
        } else {
          const nw = h * ratio;
          if (hx === 0) x0 = x1 - nw;
          else x1 = x0 + nw;
        }
        nb = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      }
      setMarks(m);
      // Where its corner went on the page: the shape turned about its new middle keeps the anchored side in place.
      const c0 = toPage(s, nb.x + nb.w / 2, nb.y + nb.h / 2);
      const next: DiagramShape = { ...s, x: r2(c0.x - nb.w / 2), y: r2(c0.y - nb.h / 2), w: r2(nb.w), h: r2(nb.h) };
      setPreview(updateItem(d.base, d.id, () => next));
      return;
    }
    if (d.kind === 'rotate') {
      const s = d.s0;
      const c = { x: s.x + s.w / 2, y: s.y + s.h / 2 };
      let a = (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI + 90;
      a = ((a % 360) + 360) % 360;
      if (!e.shiftKey) {
        const snapA = Math.round(a / 15) * 15;
        if (Math.abs(snapA - a) < 5) a = snapA % 360;
      }
      setPreview(updateItem<DiagramShape>(d.base, d.id, (x) => ({ ...x, rot: Math.round(a) || undefined })));
      return;
    }
    if (d.kind === 'end') {
      const j = joinAt(p, undefined);
      setTarget(j);
      const end: DiagramEnd = j ? { id: j.id, ...(j.port ? { port: j.port } : {}) } : { x: r2(p.x), y: r2(p.y) };
      setPreview(updateItem<DiagramEdge>(d.base, d.id, (x) => ({ ...x, [d.which]: end, points: x.points && (x.route === 'straight' || x.route === 'curved') ? x.points : undefined })));
      return;
    }
    if (d.kind === 'connect') {
      const went = d.went || Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 5;
      const j = went ? joinAt(p, undefined) : null;
      setTarget(j && j.id !== d.from.id ? j : null);
      setD({ ...d, p, went });
      return;
    }
    if (d.kind === 'seg') {
      // A run moved across itself: its two corners, made fixed points of the connector.
      const pts = d.pts.map((q) => ({ ...q }));
      const a = pts[d.i];
      const b = pts[d.i + 1];
      const horiz = Math.abs(a.y - b.y) < 0.5;
      const delta = horiz ? p.y - d.p0.y : p.x - d.p0.x;
      const v = (n: number) => (snap && grid ? snapTo(n, grid / 2) : n);
      if (pts.length <= 3 || d.i === 0 || d.i === pts.length - 2) {
        // The first or last run, or a course of one or two runs: a bend through the point dragged to.
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const q: [number, number] = horiz ? [r2(mid.x), r2(v(mid.y + delta))] : [r2(v(mid.x + delta)), r2(mid.y)];
        const inner = pts.slice(1, -1).map((x) => [r2(x.x), r2(x.y)] as [number, number]);
        const at = Math.max(0, d.i);
        inner.splice(Math.min(at, inner.length), 0, q);
        setPreview(updateItem<DiagramEdge>(d.base, d.id, (x) => ({ ...x, points: inner })));
        return;
      }
      if (horiz) {
        a.y = v(a.y + delta);
        b.y = a.y;
      } else {
        a.x = v(a.x + delta);
        b.x = a.x;
      }
      setPreview(updateItem<DiagramEdge>(d.base, d.id, (x) => ({ ...x, points: pts.slice(1, -1).map((q) => [r2(q.x), r2(q.y)] as [number, number]) })));
      return;
    }
    if (d.kind === 'point') {
      const q: [number, number] = [r2(snap && grid ? snapTo(p.x, grid / 2) : p.x), r2(snap && grid ? snapTo(p.y, grid / 2) : p.y)];
      setPreview(
        updateItem<DiagramEdge>(d.base, d.id, (x) => {
          const pts = [...(x.points ?? [])];
          if (d.insert) pts.splice(d.i, 0, q);
          else pts[d.i] = q;
          return { ...x, points: pts };
        }),
      );
      return;
    }
    if (d.kind === 'label') {
      const ed = d.base.items.find((x) => x.id === d.id) as DiagramEdge;
      const g = geomOf(ed).geom!;
      // The share of the way along it nearest the pointer.
      let best = 0.5;
      let bd = Infinity;
      for (let i = 0; i <= 100; i++) {
        const q = alongWalk(g.walk, i / 100).p;
        const dd = Math.hypot(q.x - p.x, q.y - p.y);
        if (dd < bd) {
          bd = dd;
          best = i / 100;
        }
      }
      setPreview(updateItem<DiagramEdge>(d.base, d.id, (x) => ({ ...x, at: best === 0.5 ? undefined : best })));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    setD(null);
    setMarks(NO_MARKS);
    const pv = preview;
    setPreview(null);
    setTarget(null);
    if (!d) return;
    const p = toPg(e.clientX, e.clientY);
    if (d.kind === 'move') {
      if (!d.moved) {
        // A click on one of several picked: that one alone.
        if (d.wasSel && !e.shiftKey && sel.length > 1) {
          const it = page.items.find((x) => x.id === d.hit);
          onSel(it?.group ? page.items.filter((x) => x.group === it.group).map((x) => x.id) : [d.hit]);
        }
        return;
      }
      if (pv) onChange(reparent(pv, new Set([...d.ids].filter((id) => pv.items.some((x) => x.id === id && isShape(x))))), undefined);
      return;
    }
    if (d.kind === 'connect') {
      const j = joinAt(p);
      const src = page.items.find((x) => x.id === d.from.id) as DiagramShape | undefined;
      if (j && j.id !== d.from.id) {
        const e2: DiagramEdge = { id: newId('e'), type: 'edge', from: d.from, to: { id: j.id, ...(j.port ? { port: j.port } : {}) } };
        onChange(withEdge(page, e2), undefined);
        onSel([e2.id]);
        return;
      }
      if (!src) return;
      // A click (the pointer stayed where it was pressed), or a drag out to somewhere.
      const moved = d.went && !(j && j.id === d.from.id);
      // A click on a blue arrow: a shape like it, joined to it, that way.
      if (!moved && d.dir) {
        const r = addBeside(page, src, d.dir);
        onChange(r.page, undefined);
        onSel([r.id]);
        return;
      }
      if (!moved) return;
      // Dragged to empty space: a shape like it there, joined to it.
      const copy = blank(src, r2(p.x - src.w / 2), r2(p.y - src.h / 2));
      const e2: DiagramEdge = { id: newId('e'), type: 'edge', from: d.from, to: { id: copy.id } };
      const placed = withEdge({ ...page, items: [...page.items, copy] }, e2);
      onChange(placed, undefined);
      onSel([copy.id]);
      return;
    }
    if (pv && d.kind !== 'pan' && d.kind !== 'band') onChange(pv, undefined);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (readOnly) return;
    const p = toPg(e.clientX, e.clientY);
    const hit = hitItem(page, p.x, p.y, tol, { geom: edgeOf });
    if (!hit) {
      const r = root.current!.getBoundingClientRect();
      return onQuickAdd({ x: e.clientX - r.left, y: e.clientY - r.top }, p);
    }
    if (isShape(hit) && ROW_KINDS.has(hit.shape)) {
      // In a class or an entity: its name in the header, its rows below.
      const l = toLocal(hit, p.x, p.y);
      const head = shapeGeom(hit).text;
      return startEdit(hit.id, head && l.y <= head.y + head.h ? 'text' : 'rows');
    }
    if (isEdge(hit) && !hit.text) {
      // A connector's new words go where it was clicked.
      const g = geomOf(hit).geom!;
      let best = 0.5;
      let bd = Infinity;
      for (let i = 0; i <= 50; i++) {
        const q = alongWalk(g.walk, i / 50).p;
        const dd = Math.hypot(q.x - p.x, q.y - p.y);
        if (dd < bd) {
          bd = dd;
          best = i / 50;
        }
      }
      if (Math.abs(best - 0.5) > 0.08) onChange(updateItem<DiagramEdge>(page, hit.id, (x) => ({ ...x, at: best })), undefined);
    }
    startEdit(hit.id);
  };

  const onWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const r = root.current!.getBoundingClientRect();
      const v = viewRef.current;
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * (e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 50 ? 0.01 : 0.0025)), e.clientX - r.left, e.clientY - r.top);
      else onView({ ...v, x: v.x - (e.shiftKey ? e.deltaY : e.deltaX), y: v.y - (e.shiftKey ? 0 : e.deltaY) });
    },
    [zoomAt, onView],
  );
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel]);
  // Two fingers: pinch to zoom, move to pan.
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; cx: number; cy: number } | null>(null);
  const onTouchPointer = (e: React.PointerEvent, kind: 'down' | 'move' | 'up') => {
    if (e.pointerType !== 'touch') return false;
    if (kind === 'down') touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    else if (kind === 'move' && touches.current.has(e.pointerId)) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    else if (kind === 'up') touches.current.delete(e.pointerId);
    if (touches.current.size === 2) {
      const [a, b] = [...touches.current.values()];
      const dd = Math.hypot(a.x - b.x, a.y - b.y);
      const r = root.current!.getBoundingClientRect();
      const cxp = (a.x + b.x) / 2 - r.left;
      const cyp = (a.y + b.y) / 2 - r.top;
      if (pinch.current) {
        const v = viewRef.current;
        const k = Math.min(8, Math.max(0.05, v.k * (dd / pinch.current.d)));
        const nx = cxp - ((pinch.current.cx - v.x) * k) / v.k;
        const ny = cyp - ((pinch.current.cy - v.y) * k) / v.k;
        onView({ k, x: nx, y: ny });
      }
      pinch.current = { d: dd, cx: cxp, cy: cyp };
      setD(null);
      setPreview(null);
      return true;
    }
    pinch.current = null;
    return false;
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target as HTMLElement)?.closest?.('input,textarea,[contenteditable="true"]')) space.current = true;
    };
    const up = (e: KeyboardEvent) => e.code === 'Space' && (space.current = false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // ---- what is drawn over the page ------------------------------------------------------------------------------------
  const k = view.k;
  const pickedShapes = sel.map((id) => shapes.get(id)).filter((s): s is DiagramShape => !!s);
  const pickedEdges = sel.map((id) => shown.items.find((x) => x.id === id)).filter((x): x is DiagramEdge => isEdge(x));
  const single = pickedShapes.length === 1 && sel.length === 1 ? pickedShapes[0] : null;
  const hs = 8 / k;
  const overlay: ReactNode[] = [];
  const blue = 'var(--accent, #2f6feb)';
  for (const s of pickedShapes) {
    const corners = [toPage(s, 0, 0), toPage(s, s.w, 0), toPage(s, s.w, s.h), toPage(s, 0, s.h)];
    overlay.push(<polygon key={`o${s.id}`} points={corners.map((c) => `${c.x},${c.y}`).join(' ')} fill="none" stroke={blue} strokeWidth={1.25 / k} strokeDasharray={s.locked ? `${4 / k} ${3 / k}` : undefined} />);
  }
  if (single && !readOnly && !single.locked && !drag) {
    for (const h of HANDLES) {
      if ((single.shape === 'text' || single.shape === 'bar') && (h === 'n' || h === 's') && single.h < 30) continue;
      const q = toPage(single, HPOS[h][0] * single.w, HPOS[h][1] * single.h);
      overlay.push(<rect key={`h${h}`} data-h={`size:${single.id}:${h}`} x={q.x - hs / 2} y={q.y - hs / 2} width={hs} height={hs} rx={1.5 / k} fill="#fff" stroke={blue} strokeWidth={1.25 / k} style={{ cursor: CURSOR[h] }} />);
    }
    const top = toPage(single, single.w / 2, 0);
    const rh = toPage(single, single.w / 2, -24 / k);
    overlay.push(<line key="rl" x1={top.x} y1={top.y} x2={rh.x} y2={rh.y} stroke={blue} strokeWidth={1 / k} />);
    overlay.push(<circle key="rc" data-h={`rot:${single.id}`} cx={rh.x} cy={rh.y} r={5 / k} fill="#fff" stroke={blue} strokeWidth={1.25 / k} style={{ cursor: 'grab' }} />);
  }
  // A picked connector: its course traced, its ends to drag, its bends and runs to move, its words to slide.
  for (const ed of pickedEdges) {
    const g = geomOf(ed).geom!;
    overlay.push(<polyline key={`e${ed.id}`} points={g.walk.map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke={blue} strokeWidth={3 / k} strokeOpacity={0.35} />);
    if (readOnly || sel.length !== 1 || drag) continue;
    for (const which of ['from', 'to'] as const) {
      const q = which === 'from' ? g.start.p : g.end.p;
      const joined = !!ed[which].id;
      overlay.push(<circle key={`end${which}`} data-h={`end:${ed.id}:${which}`} cx={q.x} cy={q.y} r={5.5 / k} fill={joined ? blue : '#fff'} stroke={blue} strokeWidth={1.5 / k} style={{ cursor: 'move' }} />);
    }
    const route = ed.route ?? 'orthogonal';
    if (route === 'orthogonal') {
      for (let i = 0; i < g.pts.length - 1; i++) {
        const a = g.pts[i];
        const b = g.pts[i + 1];
        const L = Math.hypot(b.x - a.x, b.y - a.y);
        if (L * k < 24) continue;
        const horiz = Math.abs(a.y - b.y) < 0.5;
        overlay.push(
          <rect key={`seg${i}`} data-h={`seg:${ed.id}:${i}`} x={(a.x + b.x) / 2 - (horiz ? 7 : 3) / k} y={(a.y + b.y) / 2 - (horiz ? 3 : 7) / k} width={(horiz ? 14 : 6) / k} height={(horiz ? 6 : 14) / k} rx={2 / k} fill="#fff" stroke={blue} strokeWidth={1.25 / k} style={{ cursor: horiz ? 'ns-resize' : 'ew-resize' }} />,
        );
      }
    } else {
      const pts = ed.points ?? [];
      pts.forEach(([x, y], i) => overlay.push(<circle key={`pt${i}`} data-h={`pt:${ed.id}:${i}`} cx={x} cy={y} r={4.5 / k} fill={blue} stroke="#fff" strokeWidth={1 / k} style={{ cursor: 'move' }} />));
      // Between each two points of its course: one to drag, to add a bend there.
      const course = [g.start.p, ...pts.map(([x, y]) => ({ x, y })), g.end.p];
      for (let i = 0; i < course.length - 1; i++) {
        const m = { x: (course[i].x + course[i + 1].x) / 2, y: (course[i].y + course[i + 1].y) / 2 };
        overlay.push(<circle key={`mid${i}`} data-h={`mid:${ed.id}:${i}`} cx={m.x} cy={m.y} r={3.5 / k} fill="#fff" stroke={blue} strokeWidth={1 / k} style={{ cursor: 'copy' }} />);
      }
    }
    if (ed.text) {
      const q = alongWalk(g.walk, ed.at ?? 0.5).p;
      overlay.push(<rect key="lab" data-h={`label:${ed.id}`} x={q.x - 5 / k} y={q.y - 14 / k} width={10 / k} height={6 / k} rx={2 / k} fill={blue} style={{ cursor: 'grab' }} />);
    }
  }
  // Pointed at: the shape's fixed points, and the four blue arrows that add a shape beside it.
  const pointed = !readOnly && !drag && !editing && hover ? shapes.get(hover) : null;
  const joining = drag?.kind === 'connect' || drag?.kind === 'end';
  const showPorts = (s: DiagramShape, strong: boolean) =>
    shapePorts(s).map((port, i) => {
      const q = toPage(s, port[0] * s.w, port[1] * s.h);
      const on = target?.id === s.id && target.port && target.port[0] === port[0] && target.port[1] === port[1];
      return (
        <g key={`p${s.id}${i}`} data-h={!joining ? `port:${s.id}:${port.join(',')}` : undefined} style={{ cursor: 'crosshair' }}>
          <circle cx={q.x} cy={q.y} r={(on ? 6 : 4) / k} fill={on ? blue : strong ? '#fff' : 'transparent'} stroke={blue} strokeWidth={1.25 / k} opacity={strong ? 1 : 0.7} />
        </g>
      );
    });
  // Under the handles: what pointing at a shape shows (its fixed points, but on a picked shape, whose handles they would hide).
  const under: ReactNode[] = [];
  if (pointed && !CONTAINER_KINDS.has(pointed.shape) && pointed.shape !== 'lifeline') {
    if (!selSet.has(pointed.id)) under.push(...showPorts(pointed, false));
    const b = pageBox(pointed);
    const gap = 16 / k;
    const sides: { dir: 'n' | 'e' | 's' | 'w'; x: number; y: number; rot: number }[] = [
      { dir: 'n', x: b.x + b.w / 2, y: b.y - gap, rot: 0 },
      { dir: 'e', x: b.x + b.w + gap, y: b.y + b.h / 2, rot: 90 },
      { dir: 's', x: b.x + b.w / 2, y: b.y + b.h + gap, rot: 180 },
      { dir: 'w', x: b.x - gap, y: b.y + b.h / 2, rot: 270 },
    ];
    for (const sd of sides)
      under.push(
        <g key={`ar${sd.dir}`} data-h={`arrow:${pointed.id}:${sd.dir}`} transform={`translate(${sd.x} ${sd.y}) rotate(${sd.rot}) scale(${1 / k})`} style={{ cursor: 'pointer' }}>
          <circle r={11} fill="transparent" />
          <path d="M0 -7 L6 1 L2 1 L2 7 L-2 7 L-2 1 L-6 1 Z" fill={blue} opacity={0.75} />
        </g>,
      );
  }
  if (joining && target) {
    const s = shapes.get(target.id);
    if (s) {
      const b = pageBox(s);
      overlay.push(<rect key="tgt" x={b.x - 3 / k} y={b.y - 3 / k} width={b.w + 6 / k} height={b.h + 6 / k} rx={4 / k} fill={blue} fillOpacity={0.08} stroke={blue} strokeWidth={1.5 / k} />);
      overlay.push(...showPorts(s, true));
    }
  }
  if (drag?.kind === 'connect') {
    const src = shapes.get(drag.from.id!);
    if (src) {
      const tgt = target ? shapes.get(target.id) : null;
      const a = drag.from.port ? portPoint(src, drag.from.port).p : perimeterPoint(src, tgt ? { x: tgt.x + tgt.w / 2, y: tgt.y + tgt.h / 2 } : drag.p);
      const bpt = tgt ? (target!.port ? portPoint(tgt, target!.port).p : perimeterPoint(tgt, a)) : drag.p;
      overlay.push(<line key="conn" x1={a.x} y1={a.y} x2={bpt.x} y2={bpt.y} stroke={blue} strokeWidth={1.5 / k} strokeDasharray={`${5 / k} ${4 / k}`} />);
    }
  }
  if (drag?.kind === 'band') {
    const r = { x: Math.min(drag.p0.x, drag.p1.x), y: Math.min(drag.p0.y, drag.p1.y), w: Math.abs(drag.p1.x - drag.p0.x), h: Math.abs(drag.p1.y - drag.p0.y) };
    overlay.push(<rect key="band" x={r.x} y={r.y} width={r.w} height={r.h} fill={blue} fillOpacity={0.08} stroke={blue} strokeWidth={1 / k} />);
  }
  const pink = GUIDE_COLOUR;
  for (const g of marks.guides) overlay.push(g.axis === 'x' ? <line key={`g${g.axis}${g.at}`} x1={g.at} y1={g.from - 10 / k} x2={g.at} y2={g.to + 10 / k} stroke={pink} strokeWidth={1 / k} /> : <line key={`g${g.axis}${g.at}`} x1={g.from - 10 / k} y1={g.at} x2={g.to + 10 / k} y2={g.at} stroke={pink} strokeWidth={1 / k} />);
  // A gap: a line across it, a short bar at each end, and its length in a pill (not where it is too small to read).
  marks.gaps.forEach((g, i) => {
    const cap = 4 / k;
    const mid = { x: g.x + g.w / 2, y: g.y + g.h / 2 };
    overlay.push(
      <g key={`gap${i}`} stroke={pink} strokeWidth={1 / k} style={{ pointerEvents: 'none' }}>
        <line x1={g.x} y1={g.y} x2={g.x + g.w} y2={g.y + g.h} />
        {g.vertical ? (
          <>
            <line x1={g.x - cap} y1={g.y} x2={g.x + cap} y2={g.y} />
            <line x1={g.x - cap} y1={g.y + g.h} x2={g.x + cap} y2={g.y + g.h} />
          </>
        ) : (
          <>
            <line x1={g.x} y1={g.y - cap} x2={g.x} y2={g.y + cap} />
            <line x1={g.x + g.w} y1={g.y - cap} x2={g.x + g.w} y2={g.y + cap} />
          </>
        )}
      </g>,
    );
    if (g.value * k >= 18) overlay.push(<Pill key={`gp${i}`} x={g.vertical ? mid.x + 18 / k : mid.x} y={g.vertical ? mid.y : mid.y - 12 / k} text={`${Math.round(g.value)}`} k={k} />);
  });
  marks.pills.forEach((q, i) => overlay.push(<Pill key={`pill${i}`} x={q.x} y={q.y} text={q.text} k={k} />));
  if (mark) {
    const it = shown.items.find((x) => x.id === mark);
    const b = it ? boundsOf(shown, new Set([it.id])) : null;
    if (b) overlay.push(<rect key="mark" x={b.x - 5 / k} y={b.y - 5 / k} width={b.w + 10 / k} height={b.h + 10 / k} rx={6 / k} fill="none" stroke="var(--busy, #f59f00)" strokeWidth={2 / k} strokeDasharray={`${6 / k} ${4 / k}`} />);
  }
  if (found?.size)
    for (const id of found) {
      const b = boundsOf(shown, new Set([id]));
      if (b) overlay.push(<rect key={`f${id}`} x={b.x - 4 / k} y={b.y - 4 / k} width={b.w + 8 / k} height={b.h + 8 / k} rx={4 / k} fill="#f5c518" fillOpacity={0.18} stroke="#f5c518" strokeWidth={1.5 / k} />);
    }

  // ---- words typed in place ---------------------------------------------------------------------------------------------
  let editor: ReactNode = null;
  if (editing) {
    const it = page.items.find((x) => x.id === editing.id);
    if (it) editor = <TextEditor it={it} page={page} part={editing.part} value={editing.value} end={editing.end} view={view} dark={dark} font={diagram.font} onValue={(v) => setEditing({ ...editing, value: v })} onDone={finishEdit} />;
  }

  const bg = page.background ?? (dark ? DARK.paper : LIGHT.paper);
  const dot = dark ? 'rgba(255,255,255,.13)' : 'rgba(0,0,0,.16)';
  const gs = (grid || 10) * k;
  const gridBg: CSSProperties =
    showGrid && grid && gs >= 5
      ? { backgroundImage: `radial-gradient(circle, ${dot} ${Math.max(0.6, Math.min(1.2, k))}px, transparent ${Math.max(0.6, Math.min(1.2, k)) + 0.4}px)`, backgroundSize: `${gs}px ${gs}px`, backgroundPosition: `${view.x - gs / 2}px ${view.y - gs / 2}px` }
      : {};
  const flow = shown.items.some((it) => isEdge(it) && it.style?.flow);
  const cursor = drag?.kind === 'pan' ? 'grabbing' : drag?.kind === 'move' ? (drag.copy && drag.moved ? 'copy' : 'move') : joining ? 'crosshair' : space.current ? 'grab' : 'default';
  return (
    <div
      ref={root}
      tabIndex={-1}
      translate="no"
      className="relative h-full w-full touch-none overflow-hidden outline-none select-none"
      style={{ backgroundColor: bg, cursor, ...gridBg }}
      onPointerDown={(e) => {
        if (onTouchPointer(e, 'down')) return;
        onPointerDown(e);
      }}
      onPointerMove={(e) => {
        if (onTouchPointer(e, 'move')) return;
        onPointerMove(e);
      }}
      onPointerUp={(e) => {
        onTouchPointer(e, 'up');
        onPointerUp(e);
      }}
      onPointerCancel={(e) => {
        onTouchPointer(e, 'up');
        setD(null);
        setPreview(null);
        setMarks(NO_MARKS);
      }}
      onPointerLeave={() => !dragRef.current && setHover(null)}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => {
        e.preventDefault();
        const p = toPg(e.clientX, e.clientY);
        const hit = hitItem(page, p.x, p.y, tol, { geom: edgeOf });
        if (hit && !selSet.has(hit.id)) onSel([hit.id]);
        onMenu({ x: e.clientX, y: e.clientY }, hit);
      }}
    >
      <svg className="absolute inset-0 block" width={size.w} height={size.h}>
        <style>{themeCss('.dark') + (flow ? FLOW_CSS : '')}</style>
        <g dangerouslySetInnerHTML={{ __html: DEFS }} />
        <g transform={`translate(${view.x} ${view.y}) scale(${k})`}>
          <g style={{ pointerEvents: 'none' }}>
            {shown.items.map((it) => (
              <ItemView key={it.id} svg={svgOf(it)} />
            ))}
          </g>
          <g>{under}</g>
          <g>{overlay}</g>
        </g>
      </svg>
      {editor}
    </div>
  );
});

// ---- typing in place ------------------------------------------------------------------------------------------------------

function TextEditor({ it, page, part, value, end, view, dark, font, onValue, onDone }: { it: DiagramItem; page: DiagramPage; part: 'text' | 'rows'; value: string; end?: boolean; view: View; dark: boolean; font?: Diagram['font']; onValue: (v: string) => void; onDone: (cancel?: boolean) => void }) {
  const ta = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const t = ta.current;
    if (!t) return;
    t.focus({ preventScroll: true });
    if (end) t.setSelectionRange(t.value.length, t.value.length);
    else t.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useLayoutEffect(() => {
    const t = ta.current;
    if (!t) return;
    t.style.height = '0px';
    t.style.height = `${t.scrollHeight}px`;
  }, [value]);
  const k = view.k;
  let box: Box;
  let size = 14;
  let align: 'left' | 'center' | 'right' = 'center';
  let valign: 'top' | 'middle' | 'bottom' = 'middle';
  let color = dark ? DARK.ink : LIGHT.ink;
  let bold = false;
  let italic = false;
  let ff = fontCss(font);
  if (isShape(it)) {
    const look = lookOf(it);
    size = look.size ?? 14;
    ff = fontCss(look.font ?? font);
    bold = !!look.bold || ((it.shape === 'class' || it.shape === 'entity' || it.shape === 'table') && part === 'text' && look.bold !== false);
    italic = !!look.italic;
    const g = shapeGeom(it);
    if (part === 'rows') {
      const rowsTop = g.rows?.[0]?.y ?? g.text?.h ?? 0;
      box = { x: 8, y: rowsTop, w: it.w - 16, h: Math.max(it.h - rowsTop, 40) };
      align = 'left';
      valign = 'top';
      bold = false;
    } else {
      box = labelBox(it, g) ?? { x: 0, y: 0, w: it.w, h: it.h };
      const outside = (look.label ?? 'inside') !== 'inside';
      align = outside ? (look.label === 'left' ? 'right' : look.label === 'right' ? 'left' : 'center') : ROW_KINDS.has(it.shape) ? 'center' : (look.align ?? 'center');
      valign = outside ? (look.label === 'above' ? 'bottom' : look.label === 'below' ? 'top' : 'middle') : (look.valign ?? 'middle');
      if (g.textRot) box = { x: box.x, y: box.y, w: Math.max(box.w, 120), h: box.h };
    }
    if (look.color) color = look.color;
    else if (look.fill && look.fill !== 'none' && (look.label ?? 'inside') === 'inside') color = inkOn(look.fill);
    if (it.shape === 'sticky' && !look.color) color = '#1f2328';
    // The box on the screen (a turned shape's words are typed unturned, about its middle).
    const c = toPage(it, box.x + box.w / 2, box.y + box.h / 2);
    box = { x: c.x - box.w / 2, y: c.y - box.h / 2, w: box.w, h: box.h };
  } else {
    const shapes = new Map(page.items.filter(isShape).map((s) => [s.id, s]));
    const g = edgeGeom(it as DiagramEdge, shapes);
    const q = alongWalk(g.walk, (it as DiagramEdge).at ?? 0.5).p;
    size = it.style?.size ?? 13;
    box = { x: q.x - 110, y: q.y - 14, w: 220, h: 28 };
    if (it.style?.color) color = it.style.color;
  }
  const lh = lineHeight(size);
  const want = textSize(value || ' ', box.w, { size, font: undefined, bold }).h;
  const style: CSSProperties = {
    left: box.x * k + view.x,
    top: box.y * k + view.y,
    width: box.w * k,
    minHeight: Math.max(box.h, want, lh) * k,
    alignItems: 'stretch',
    justifyContent: valign === 'top' ? 'flex-start' : valign === 'bottom' ? 'flex-end' : 'center',
  };
  return (
    <div className="absolute z-10 flex flex-col" style={style} onPointerDown={(e) => e.stopPropagation()}>
      <textarea
        ref={ta}
        value={value}
        rows={1}
        spellCheck
        onChange={(e) => onValue(e.target.value)}
        onBlur={() => onDone()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape' || ((e.ctrlKey || e.metaKey) && e.key === 'Enter')) {
            e.preventDefault();
            onDone();
          }
          if (e.key === 'Tab') {
            e.preventDefault();
            onDone();
          }
        }}
        className={cx('w-full resize-none overflow-hidden rounded-[3px] bg-transparent p-0 outline-none', !isShape(it) && 'bg-[var(--n-bg,#fff)] shadow')}
        style={{
          font: `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size * k}px/${lh / size} ${ff}`,
          color,
          textAlign: align,
          caretColor: color,
          boxShadow: '0 0 0 1.5px var(--accent, #2f6feb)',
        }}
      />
    </div>
  );
}

// ---- small helpers the editor shares -----------------------------------------------------------------------------------

/** A shape's new words, its box grown down (and a text shape across too) where they no longer fit. */
export function fitText(s: DiagramShape, text: string): DiagramShape {
  const out: DiagramShape = { ...s, text: text || undefined };
  if (!text) return out;
  const look = lookOf(s);
  const size = look.size ?? 14;
  if (s.shape === 'text') {
    const t = textSize(text, Math.max(s.w - 4, 320), { size, font: look.font, bold: look.bold });
    if (t.w + 12 > s.w) out.w = Math.ceil(t.w + 14);
    out.h = Math.max(s.h, Math.ceil(t.h + 10));
    return out;
  }
  if ((look.label ?? 'inside') !== 'inside' || CONTAINER_KINDS.has(s.shape) || ROW_KINDS.has(s.shape)) return out;
  const g = shapeGeom(out);
  if (!g.text) return out;
  const t = textSize(text, g.text.w, { size, font: look.font, bold: look.bold });
  const extra = t.h - g.text.h;
  if (extra > 1) {
    out.h = Math.ceil(s.h + extra * (s.h / Math.max(1, g.text.h)) + 2);
    out.y = r2(s.y - (out.h - s.h) / 2);
  }
  return out;
}

/** A class's (or an entity's, or a table's) new rows, its height made to hold them. */
export function withRows(s: DiagramShape, rows: string[]): DiagramShape {
  const out: DiagramShape = { ...s, rows: rows.length ? rows : undefined };
  if (!out.rows) delete out.rows;
  const g = shapeGeom({ ...out, h: 100_000 });
  const last = g.rows?.[g.rows.length - 1];
  out.h = Math.max(40, Math.ceil((last ? last.y + last.h : (g.text?.h ?? 30)) + 4));
  return out;
}

/** A shape like another (its kind, size and look), without its words, at a place. */
export function blank(s: DiagramShape, x: number, y: number): DiagramShape {
  const { id: _id, text: _t, rows: _r, parent: _p, group: _g, link: _l, note: _n, locked: _k, ...rest } = s;
  return { ...rest, id: newId('s'), x, y, ...(s.rows ? { rows: [] } : {}), ...(s.parent ? { parent: s.parent } : {}) } as DiagramShape;
}

/** A connector added after the shapes it joins (so it is drawn over containers, under the shapes). */
export function withEdge(p: DiagramPage, e: DiagramEdge): DiagramPage {
  const ids = new Set([e.from.id, e.to.id].filter(Boolean) as string[]);
  // Just under the first of the shapes it joins (after the containers they are in).
  const at = p.items.findIndex((it) => ids.has(it.id) && isShape(it) && !CONTAINER_KINDS.has(it.shape));
  const items = [...p.items];
  items.splice(at < 0 ? items.length : at, 0, e);
  return { ...p, items };
}

/** A shape like `src` beside it, that way, clear of the others, joined to it: what a click on a blue arrow makes. */
export function addBeside(p: DiagramPage, src: DiagramShape, dir: 'n' | 'e' | 's' | 'w'): { page: DiagramPage; id: string } {
  const gap = 60;
  const b = pageBox(src);
  const step = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] }[dir];
  let x = src.x + step[0] * (b.w + gap);
  let y = src.y + step[1] * (b.h + gap);
  const others = p.items.filter(isShape).filter((s) => !CONTAINER_KINDS.has(s.shape));
  const clash = (bx: number, by: number) => others.some((o) => {
    const q = pageBox(o);
    return bx < q.x + q.w + 16 && q.x < bx + src.w + 16 && by < q.y + q.h + 16 && q.y < by + src.h + 16;
  });
  // Taken: across the way it goes, beside what is there.
  for (let i = 1; i < 30 && clash(x, y); i++) {
    if (step[0] === 0) x = src.x + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (src.w + 30);
    else y = src.y + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (src.h + 30);
  }
  const copy = blank(src, r2(x), r2(y));
  const e: DiagramEdge = { id: newId('e'), type: 'edge', from: { id: src.id }, to: { id: copy.id } };
  // An edge like the last one leaving it, in look.
  const like = [...p.items].reverse().find((it): it is DiagramEdge => isEdge(it) && it.from.id === src.id);
  if (like?.style) e.style = { ...like.style };
  if (like?.route) e.route = like.route;
  const page = withEdge({ ...p, items: [...p.items, copy] }, e);
  return { page, id: copy.id };
}

/** A new shape of a kind at a point (its middle there), as the shapes panel makes it. */
export function makeShape(kind: DiagramShape['shape'], at: Pt, more: Partial<DiagramShape> = {}): DiagramShape {
  const def = KINDS[kind];
  const w = more.w ?? def.w;
  const h = more.h ?? def.h;
  return { id: newId('s'), type: 'shape', shape: kind, x: r2(at.x - w / 2), y: r2(at.y - h / 2), w, h, ...more } as DiagramShape;
}
