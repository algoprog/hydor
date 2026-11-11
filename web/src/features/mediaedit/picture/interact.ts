// What a press on the picture does with each tool, as Photoshop's tools do it: the move tool drags the picked layer (or
// the one under the pointer, with Auto-select, or a mark clicked); the marquees, lassos and magic wand select (Shift adds
// to the selection, Alt takes away, both cross); the crop tool's box and handles; a free transform's handles (corners
// size it, keeping its shape unless Shift is held; sides stretch it; outside a corner turns it, by 15° with Shift);
// brushes paint (Alt+click sets the clone stamp's source); the gradient is dragged; the bucket and the eyedropper click;
// words are written where clicked; shapes, lines and hidden areas are dragged out. Everything here is in the canvas's
// pixels; the View turns the screen's into them.
import { CROP_SHAPES, textMetrics, type Mark } from '@shared/mediaedit';
import { markAt, markBox } from '../render';
import { flattenDoc, layerInk, markBounds } from './compose';
import { isCopyDrag, isNoSnap } from '../shell/menus';
import { activeLayer, layerOf, type Doc, type Layer, type MarkLayer } from './doc';
import { affineOf, markBoundsUnturned, TEXT_BACKS, type PictureEd, type ToolId } from './editor';
import { ellipseMask, featherMask, floodMask, maskAt, moveMask, polygonMask, rectMask, type Box, type MaskOp } from './mask';

export type Pt = [number, number];

/** How the canvas sits on screen: `z` screen pixels a canvas pixel, its top left at (ox, oy). */
export interface ViewT {
  z: number;
  ox: number;
  oy: number;
}

export interface Gesture {
  move(p: Pt, e: PointerEvent): void;
  up(p: Pt, e: PointerEvent): void;
}

const NONE: Gesture = { move() {}, up() {} };

/** How near, on the screen, a moved box has to come to a line for it to snap. */
export const SNAP_PX = 6;

const toScreen = (t: ViewT, p: Pt): Pt => [p[0] * t.z + t.ox, p[1] * t.z + t.oy];

/** The selection's way, by the keys held as the press began (else the options bar's). */
function opOf(ed: PictureEd, e: PointerEvent): MaskOp {
  if (e.shiftKey && e.altKey) return 'intersect';
  if (e.shiftKey) return 'add';
  if (e.altKey) return 'subtract';
  return ed.opts.selMode;
}

/** The topmost layer with something at a point: a mark under it (with a little room), or a pixel layer's pixel there. */
export function layerAt(doc: Doc, x: number, y: number, slop: number): Layer | null {
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const l = doc.layers[i];
    if (!l.visible) continue;
    if (l.kind === 'mark') {
      // Into the mark's own frame (before its turn).
      const b = markBox(l.mark);
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const t = (-l.angle * Math.PI) / 180;
      const px = cx + (x - cx) * Math.cos(t) - (y - cy) * Math.sin(t);
      const py = cy + (x - cx) * Math.sin(t) + (y - cy) * Math.cos(t);
      const hide = l.mark.type === 'blur' || l.mark.type === 'pixelate';
      if (hide ? px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h : markAt([l.mark], px, py, slop)) return l;
    } else if (l.kind === 'raster') {
      const lx = Math.floor(x - l.x);
      const ly = Math.floor(y - l.y);
      if (lx < 0 || ly < 0 || lx >= l.px.w || ly >= l.px.h) continue;
      if (l.px.canvas.getContext('2d', { willReadFrequently: true })!.getImageData(lx, ly, 1, 1).data[3] > 16) return l;
    }
  }
  return null;
}

// ---- crop --------------------------------------------------------------------------------------------------------

/** The crop's box dragged: moved, or an edge or corner pulled, within the canvas, keeping `ratio` (width ÷ height) when set. */
export function dragCrop(b: Box, kind: string, dx: number, dy: number, frame: { w: number; h: number }, ratio: number | null): Box {
  const MIN = Math.max(4, Math.min(frame.w, frame.h) * 0.01);
  if (kind === 'move') return { x: Math.round(Math.max(0, Math.min(frame.w - b.w, b.x + dx))), y: Math.round(Math.max(0, Math.min(frame.h - b.h, b.y + dy))), w: b.w, h: b.h };
  let x0 = b.x;
  let y0 = b.y;
  let x1 = b.x + b.w;
  let y1 = b.y + b.h;
  if (kind.includes('w')) x0 = Math.max(0, Math.min(x1 - MIN, x0 + dx));
  if (kind.includes('e')) x1 = Math.min(frame.w, Math.max(x0 + MIN, x1 + dx));
  if (kind.includes('n')) y0 = Math.max(0, Math.min(y1 - MIN, y0 + dy));
  if (kind.includes('s')) y1 = Math.min(frame.h, Math.max(y0 + MIN, y1 + dy));
  if (ratio) {
    let w = x1 - x0;
    let h = y1 - y0;
    if (kind === 'n' || kind === 's') w = h * ratio;
    else if (kind === 'e' || kind === 'w') h = w / ratio;
    else if (w / h > ratio) h = w / ratio;
    else w = h * ratio;
    const roomW = kind.includes('w') ? x1 : kind.includes('e') ? frame.w - x0 : frame.w;
    const roomH = kind.includes('n') ? y1 : kind.includes('s') ? frame.h - y0 : frame.h;
    const k = Math.min(1, roomW / w, roomH / h);
    w *= k;
    h *= k;
    if (kind.includes('w')) x0 = x1 - w;
    else if (kind.includes('e')) x1 = x0 + w;
    else {
      const cx = b.x + b.w / 2;
      x0 = Math.max(0, Math.min(frame.w - w, cx - w / 2));
      x1 = x0 + w;
    }
    if (kind.includes('n')) y0 = y1 - h;
    else if (kind.includes('s')) y1 = y0 + h;
    else {
      const cy = b.y + b.h / 2;
      y0 = Math.max(0, Math.min(frame.h - h, cy - h / 2));
      y1 = y0 + h;
    }
  }
  return { x: Math.round(x0), y: Math.round(y0), w: Math.max(1, Math.round(x1 - x0)), h: Math.max(1, Math.round(y1 - y0)) };
}

/** The crop's shape as width ÷ height: none for any shape, the picture's own for Original. */
export function cropRatio(ed: PictureEd): number | null {
  const s = ed.opts.cropShape;
  if (s === 'free') return null;
  if (s === 'original') return ed.doc.w / ed.doc.h;
  return CROP_SHAPES.find((x) => x.id === s)?.ratio || null;
}

/** The largest box of the crop's shape in the middle of the canvas. */
export function cropOfShape(W: number, H: number, ratio: number | null): Box {
  if (!ratio) return { x: 0, y: 0, w: W, h: H };
  let w = W;
  let h = W / ratio;
  if (h > H) {
    h = H;
    w = H * ratio;
  }
  return { x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w: Math.round(w), h: Math.round(h) };
}

export const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;

/** A box's handles on screen. */
export function handlesOf(b: Box): Record<(typeof HANDLES)[number], Pt> {
  const { x, y, w, h } = b;
  return { nw: [x, y], n: [x + w / 2, y], ne: [x + w, y], e: [x + w, y + h / 2], se: [x + w, y + h], s: [x + w / 2, y + h], sw: [x, y + h], w: [x, y + h / 2] };
}

function pressCrop(ed: PictureEd, p: Pt, t: ViewT): Gesture {
  const c = ed.crop!;
  const sp = toScreen(t, p);
  const hs = handlesOf(c.box);
  const hit = HANDLES.find((k) => {
    const q = toScreen(t, hs[k]);
    return Math.hypot(q[0] - sp[0], q[1] - sp[1]) <= 14;
  });
  const inside = p[0] >= c.box.x && p[0] <= c.box.x + c.box.w && p[1] >= c.box.y && p[1] <= c.box.y + c.box.h;
  const frame = { w: ed.doc.w, h: ed.doc.h };
  const ratio = cropRatio(ed);
  if (hit || inside) {
    const kind = hit ?? 'move';
    const b0 = c.box;
    return {
      move: (q) => ed.setCrop({ box: dragCrop(b0, kind, q[0] - p[0], q[1] - p[1], frame, ratio) }),
      up: () => {},
    };
  }
  // A new box, from where the press was.
  const a: Pt = [Math.max(0, Math.min(frame.w, p[0])), Math.max(0, Math.min(frame.h, p[1]))];
  return {
    move: (q) => {
      const bx = Math.max(0, Math.min(frame.w, q[0]));
      const by = Math.max(0, Math.min(frame.h, q[1]));
      let w = Math.abs(bx - a[0]);
      let h = Math.abs(by - a[1]);
      if (ratio) {
        if (w / Math.max(1, h) > ratio) h = w / ratio;
        else w = h * ratio;
      }
      const x = bx < a[0] ? a[0] - w : a[0];
      const y = by < a[1] ? a[1] - h : a[1];
      if (w > 2 && h > 2) ed.setCrop({ box: { x: Math.round(Math.max(0, x)), y: Math.round(Math.max(0, y)), w: Math.round(Math.min(w, frame.w)), h: Math.round(Math.min(h, frame.h)) } });
    },
    up: () => {},
  };
}

// ---- free transform ----------------------------------------------------------------------------------------------

/** The free transform's box corners on the canvas (where the layer's box goes). */
export function xformCorners(ed: PictureEd): Pt[] | null {
  const x = ed.xform;
  if (!x) return null;
  const m = affineOf(x);
  const b = x.box;
  return [
    [b.x, b.y],
    [b.x + b.w, b.y],
    [b.x + b.w, b.y + b.h],
    [b.x, b.y + b.h],
  ].map(([X, Y]) => [m[0] * X + m[2] * Y + m[4], m[1] * X + m[3] * Y + m[5]] as Pt);
}

function pressTransform(ed: PictureEd, p: Pt, e: PointerEvent, t: ViewT): Gesture | null {
  const x0 = ed.xform!;
  const cs = xformCorners(ed)!;
  const sp = toScreen(t, p);
  const mids: Pt[] = cs.map((c, i) => [(c[0] + cs[(i + 1) % 4][0]) / 2, (c[1] + cs[(i + 1) % 4][1]) / 2]);
  const near = (q: Pt, r: number) => {
    const s = toScreen(t, q);
    return Math.hypot(s[0] - sp[0], s[1] - sp[1]) <= r;
  };
  const C: Pt = [x0.box.x + x0.box.w / 2 + x0.tx, x0.box.y + x0.box.h / 2 + x0.ty];
  const rad = (x0.angle * Math.PI) / 180;
  /** A point in the box's own frame (unturned, from its middle). */
  const local = (q: Pt): Pt => {
    const dx = q[0] - C[0];
    const dy = q[1] - C[1];
    return [dx * Math.cos(-rad) - dy * Math.sin(-rad), dx * Math.sin(-rad) + dy * Math.cos(-rad)];
  };
  const corner = cs.findIndex((c) => near(c, 12));
  const side = corner < 0 ? mids.findIndex((c) => near(c, 12)) : -1;
  // Inside the box (in its own frame).
  const l0 = local(p);
  const inside = Math.abs(l0[0]) <= (x0.box.w * Math.abs(x0.sx)) / 2 && Math.abs(l0[1]) <= (x0.box.h * Math.abs(x0.sy)) / 2;
  if (corner >= 0 || side >= 0) {
    return {
      move: (q, ev) => {
        const l1 = local(q);
        const kx = Math.abs(l0[0]) > 0.5 ? l1[0] / l0[0] : 1;
        const ky = Math.abs(l0[1]) > 0.5 ? l1[1] / l0[1] : 1;
        if (corner >= 0) {
          if (ev.shiftKey) ed.setTransform({ sx: x0.sx * kx, sy: x0.sy * ky });
          else {
            const k = Math.max(0.01, (Math.abs(kx) + Math.abs(ky)) / 2);
            ed.setTransform({ sx: x0.sx * k, sy: x0.sy * k });
          }
        } else if (side === 0 || side === 2) ed.setTransform({ sy: x0.sy * ky });
        else ed.setTransform({ sx: x0.sx * kx });
      },
      up: () => {},
    };
  }
  if (inside) {
    // Dragged, its box lines up with the canvas, the guides and the other layers as a moved layer does.
    const xs = cs.map((c) => c[0]);
    const ys = cs.map((c) => c[1]);
    const bb: Box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    return {
      move: (q, ev) => {
        const r = ed.dragBy(bb, q[0] - p[0], q[1] - p[1], { except: x0.sel ? [] : [x0.id], shift: ev.shiftKey, noSnap: isNoSnap(ev), tol: SNAP_PX / t.z });
        ed.setTransform({ tx: x0.tx + r.dx, ty: x0.ty + r.dy });
      },
      up: () => ed.clearGuides(),
    };
  }
  // Outside: turning, about the middle.
  void e;
  const a0 = Math.atan2(p[1] - C[1], p[0] - C[0]);
  return {
    move: (q, ev) => {
      let a = x0.angle + ((Math.atan2(q[1] - C[1], q[0] - C[0]) - a0) * 180) / Math.PI;
      if (ev.shiftKey) a = Math.round(a / 15) * 15;
      ed.setTransform({ angle: Math.round(a * 10) / 10 });
    },
    up: () => {},
  };
}

// ---- selecting ---------------------------------------------------------------------------------------------------

function pressMarquee(ed: PictureEd, p: Pt, e: PointerEvent, kind: 'rect' | 'ellipse', t: ViewT): Gesture {
  const op = opOf(ed, e);
  const shift = e.shiftKey;
  let box: Box = { x: p[0], y: p[1], w: 0, h: 0 };
  const at = (q: Pt, ev: PointerEvent): Box => {
    let w = q[0] - p[0];
    let h = q[1] - p[1];
    // Shift held after the press began: a square, or a circle.
    if (ev.shiftKey && !shift) {
      const s = Math.max(Math.abs(w), Math.abs(h));
      w = Math.sign(w || 1) * s;
      h = Math.sign(h || 1) * s;
    }
    if (ev.altKey && op !== 'subtract' && op !== 'intersect') return { x: p[0] - Math.abs(w), y: p[1] - Math.abs(h), w: Math.abs(w) * 2, h: Math.abs(h) * 2 };
    return { x: Math.min(p[0], p[0] + w), y: Math.min(p[1], p[1] + h), w: Math.abs(w), h: Math.abs(h) };
  };
  return {
    move: (q, ev) => {
      box = at(q, ev);
      ed.overlay = { ...ed.overlay, marquee: { kind, box } };
      ed.emit(false);
    },
    up: (q, ev) => {
      box = at(q, ev);
      ed.overlay = { ...ed.overlay, marquee: undefined };
      const d = ed.doc;
      if (box.w * t.z < 3 || box.h * t.z < 3) {
        if (op === 'replace') ed.deselect();
        else ed.emit(false);
        return;
      }
      let m = kind === 'rect' ? rectMask(box, d.w, d.h) : ellipseMask(box, d.w, d.h);
      if (m && ed.opts.feather > 0) m = featherMask(m, ed.opts.feather, d.w, d.h);
      ed.setSel(m, kind === 'rect' ? 'Rectangle select' : 'Ellipse select', op);
    },
  };
}

/**
 * A press inside the selection with a selection tool (no Shift or Alt, a new selection each time): the drag moves the
 * selection's outline (Shift keeps it straight; it lines up as a moved layer does), not what is under it. A click that
 * goes nowhere is what it always was: the selection dropped. null when the press is not inside one.
 */
function pressMoveSelection(ed: PictureEd, p: Pt, e: PointerEvent, t: ViewT): Gesture | null {
  const sel = ed.doc.sel;
  if (!sel || e.shiftKey || e.altKey || ed.opts.selMode !== 'replace' || maskAt(sel, p[0], p[1]) === 0) return null;
  const from = ed.doc;
  const box: Box = { x: sel.x, y: sel.y, w: sel.w, h: sel.h };
  let moved = false;
  const delta = (q: Pt, ev: PointerEvent) => ed.dragBy(box, q[0] - p[0], q[1] - p[1], { except: [], shift: ev.shiftKey, noSnap: isNoSnap(ev), tol: SNAP_PX / t.z });
  return {
    move: (q, ev) => {
      if (!moved && Math.hypot(q[0] - p[0], q[1] - p[1]) * t.z < 3) return;
      moved = true;
      const r = delta(q, ev);
      ed.moveSelection(from, r.dx, r.dy, false);
    },
    up: (q, ev) => {
      if (moved) {
        const r = delta(q, ev);
        ed.moveSelection(from, r.dx, r.dy, true);
      } else ed.deselect();
      ed.clearGuides();
    },
  };
}

function pressLasso(ed: PictureEd, p: Pt, e: PointerEvent): Gesture {
  const op = opOf(ed, e);
  const pts: number[] = [p[0], p[1]];
  return {
    move: (q) => {
      const n = pts.length;
      if (Math.hypot(q[0] - pts[n - 2], q[1] - pts[n - 1]) < 0.75) return;
      pts.push(q[0], q[1]);
      ed.overlay = { ...ed.overlay, lasso: pts };
      ed.emit(false);
    },
    up: () => {
      ed.overlay = { ...ed.overlay, lasso: undefined };
      finishLasso(ed, pts, op, 'Lasso');
    },
  };
}

function finishLasso(ed: PictureEd, pts: number[], op: MaskOp, label: string) {
  const d = ed.doc;
  if (pts.length < 6) {
    if (op === 'replace') ed.deselect();
    else ed.emit();
    return;
  }
  let m = polygonMask(pts, d.w, d.h);
  if (m && ed.opts.feather > 0) m = featherMask(m, ed.opts.feather, d.w, d.h);
  ed.setSel(m, label, op);
}

/** The polygon lasso: each click a corner; a click on the first one, a double click or Enter closes it. */
export function polyClose(ed: PictureEd) {
  const poly = ed.overlay.poly;
  ed.overlay = { ...ed.overlay, poly: undefined };
  if (poly) finishLasso(ed, poly.pts, ed.opts.selMode, 'Polygon lasso');
  else ed.emit();
}

function pressPoly(ed: PictureEd, p: Pt, t: ViewT): Gesture {
  const poly = ed.overlay.poly;
  if (poly && poly.pts.length >= 6) {
    const first = toScreen(t, [poly.pts[0], poly.pts[1]]);
    const sp = toScreen(t, p);
    if (Math.hypot(first[0] - sp[0], first[1] - sp[1]) < 10) {
      polyClose(ed);
      return NONE;
    }
  }
  ed.overlay = { ...ed.overlay, poly: { pts: [...(poly?.pts ?? []), p[0], p[1]], at: p } };
  ed.emit(false);
  return NONE;
}

function pressWand(ed: PictureEd, p: Pt, e: PointerEvent) {
  const d = ed.doc;
  const op = opOf(ed, e);
  const l = activeLayer(d);
  const all = ed.opts.sampleAll || l?.kind !== 'raster';
  const src = all ? flattenDoc(d) : l.px.canvas;
  const ox = all || l?.kind !== 'raster' ? 0 : l.x;
  const oy = all || l?.kind !== 'raster' ? 0 : l.y;
  const px = src.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, src.width, src.height).data;
  const m = floodMask(px, src.width, src.height, p[0] - ox, p[1] - oy, ed.opts.tolerance, ed.opts.contiguous);
  ed.setSel(m ? ed.inside(moveMask(m, ox, oy)) : null, 'Magic wand', op);
}

// ---- marks ---------------------------------------------------------------------------------------------------------

const SHAPES: Partial<Record<ToolId, { type: Mark['type']; name: string }>> = {
  'shape-rect': { type: 'rect', name: 'Rectangle' },
  'shape-ellipse': { type: 'ellipse', name: 'Oval' },
  'shape-line': { type: 'line', name: 'Line' },
  'shape-arrow': { type: 'arrow', name: 'Arrow' },
  'shape-pen': { type: 'pen', name: 'Line' },
  'shape-highlighter': { type: 'highlighter', name: 'Highlight' },
  'hide-blur': { type: 'blur', name: 'Blurred area' },
  'hide-pixelate': { type: 'pixelate', name: 'Pixelated area' },
};

function pressShape(ed: PictureEd, p: Pt, t: ViewT): Gesture | null {
  const s = SHAPES[ed.tool];
  if (!s) return null;
  const o = ed.opts;
  const label = 'Draw';
  const make = (q: Pt, pts?: number[]): Mark => {
    const box = { x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(q[0] - p[0]), h: Math.abs(q[1] - p[1]) };
    switch (s.type) {
      case 'pen':
      case 'highlighter':
        return { type: s.type, pts: pts ?? [p[0], p[1]], color: ed.fg, width: s.type === 'highlighter' ? o.hiWidth : o.width };
      case 'line':
      case 'arrow':
        return { type: s.type, x1: p[0], y1: p[1], x2: q[0], y2: q[1], color: ed.fg, width: o.width };
      case 'rect':
      case 'ellipse':
        return { type: s.type, ...box, color: ed.fg, width: o.width, ...(o.fill ? { fill: ed.bg } : {}) };
      default:
        return { type: s.type === 'pixelate' ? 'pixelate' : 'blur', ...box, strength: o.hideStrength };
    }
  };
  const pts: number[] = [p[0], p[1]];
  let id: string | null = null;
  let last = make(p, pts);
  const put = (m: Mark, done: boolean) => {
    if (!id) id = ed.addMark(m, label, s.name, done).id;
    else ed.setMark(id, m, label, done);
  };
  if (s.type === 'pen' || s.type === 'highlighter') put(last, false);
  return {
    move: (q) => {
      if (s.type === 'pen' || s.type === 'highlighter') pts.push(Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10);
      last = make(q, [...pts]);
      put(last, false);
    },
    up: (q) => {
      if (s.type !== 'pen' && s.type !== 'highlighter') last = make(q);
      const b = markBox(last);
      // Too small to mean anything: a slip, not a mark (a dot of the pen is one).
      if (s.type !== 'pen' && s.type !== 'highlighter' && Math.max(b.w, b.h) * t.z < 6) {
        if (id) ed.deleteLayer(id);
        ed.settle();
        return;
      }
      put(last, true);
    },
  };
}

function pressText(ed: PictureEd, p: Pt, t: ViewT) {
  const d = ed.doc;
  const hit = layerAt(d, p[0], p[1], 6 / t.z);
  if (hit?.kind === 'mark' && hit.mark.type === 'text') {
    ed.pickLayer(hit.id);
    ed.startWriting(hit.id);
    return;
  }
  const o = ed.opts;
  const m: Mark = { type: 'text', x: p[0], y: p[1] - textMetrics(o.textSize).line / 2, text: '', size: o.textSize, color: ed.fg, font: o.font, ...(TEXT_BACKS[o.back] ? { bg: TEXT_BACKS[o.back] } : {}) };
  const l = ed.addMark(m, 'Add words', 'Words', false);
  ed.startWriting(l.id);
}

// ---- the press -------------------------------------------------------------------------------------------------------

/**
 * A press on the picture (`p` in the canvas's pixels): the gesture it starts, 'pan' to move the view instead, or null
 * when it did all it does at once.
 */
export function press(ed: PictureEd, p: Pt, e: PointerEvent, t: ViewT, o: { bigHeal?: Parameters<PictureEd['endStroke']>[0] } = {}): Gesture | 'pan' | null {
  if (ed.busy || ed.comparing) return 'pan';
  if (ed.crop) return pressCrop(ed, p, t);
  if (ed.xform) return pressTransform(ed, p, e, t);
  if (ed.writing) {
    ed.endWriting();
    return null;
  }
  const d = ed.doc;
  switch (ed.tool) {
    case 'hand':
      return 'pan';
    case 'zoom':
      ed.view?.zoomBy(e.altKey ? 1 / 1.6 : 1.6, toScreen(t, p));
      return null;
    case 'move': {
      let l = activeLayer(d);
      const hit = layerAt(d, p[0], p[1], 6 / t.z);
      // A mark clicked, or Auto-select: the layer under the pointer is picked.
      if (hit && (ed.opts.autoSelect || hit.kind === 'mark') && hit.id !== l?.id) {
        ed.pickLayer(hit.id);
        l = hit;
      }
      const ink = l ? layerInk(l) : null;
      // Nothing to move (no layer, or an adjustment that is everywhere): the drag moves the view.
      if (!l || !ink) return 'pan';
      const from = ed.doc;
      const id = l.id;
      const layer = l;
      // Ctrl (⌥ on a Mac) held as the press began: what is dragged is a copy, the layer stays where it was.
      const asCopy = isCopyDrag(e);
      let copy: Layer | undefined;
      let moved = false;
      const delta = (q: Pt, ev: PointerEvent) => ed.dragBy(ink, q[0] - p[0], q[1] - p[1], { except: copy ? [id, copy.id] : [id], shift: ev.shiftKey, noSnap: isNoSnap(ev), tol: SNAP_PX / t.z });
      return {
        move: (q, ev) => {
          // A click that wobbles a pixel is not a move.
          if (!moved && Math.hypot(q[0] - p[0], q[1] - p[1]) * t.z < 3) return;
          moved = true;
          if (asCopy && !copy) copy = ed.copyOf(layer);
          const r = delta(q, ev);
          ed.moveLayerBy(from, id, r.dx, r.dy, false, copy);
        },
        up: (q, ev) => {
          if (moved) {
            const r = delta(q, ev);
            ed.moveLayerBy(from, id, r.dx, r.dy, true, copy);
          }
          ed.clearGuides();
        },
      };
    }
    case 'marquee-rect':
      return pressMoveSelection(ed, p, e, t) ?? pressMarquee(ed, p, e, 'rect', t);
    case 'marquee-ellipse':
      return pressMoveSelection(ed, p, e, t) ?? pressMarquee(ed, p, e, 'ellipse', t);
    case 'lasso':
      return pressMoveSelection(ed, p, e, t) ?? pressLasso(ed, p, e);
    case 'lasso-poly':
      return pressPoly(ed, p, t);
    case 'wand':
      pressWand(ed, p, e);
      return null;
    case 'eyedropper': {
      const pick = (q: Pt, ev: PointerEvent) => {
        const c = ed.sample(q[0], q[1]);
        if (c) (ev.altKey ? ed.setBg(c, false) : ed.setFg(c, false));
      };
      pick(p, e);
      return { move: pick, up: (q, ev) => (pick(q, ev), ev.altKey ? ed.setBg(ed.bg) : ed.setFg(ed.fg)) };
    }
    case 'brush':
    case 'eraser':
    case 'clone':
    case 'heal':
    case 'dodge':
    case 'burn': {
      if (ed.tool === 'clone' && e.altKey) {
        ed.cloneSrc = p;
        ed.cloneOffset = null;
        ed.toast('Where to copy from is set: now paint where it goes.');
        ed.emit();
        return null;
      }
      if (!ed.beginStroke(ed.tool, p[0], p[1])) return null;
      return { move: (q) => ed.strokeTo(q[0], q[1]), up: () => ed.endStroke(o.bigHeal) };
    }
    case 'gradient': {
      if (!ed.paintTarget()) return null;
      return {
        move: (q) => ed.gradientTo(p, q, false),
        up: (q) => {
          if (Math.hypot(q[0] - p[0], q[1] - p[1]) * t.z < 4) {
            ed.live = { ...ed.live, stroke: undefined };
            ed.overlay = { ...ed.overlay, gradient: undefined };
            return ed.emit();
          }
          ed.gradientTo(p, q, true);
        },
      };
    }
    case 'bucket':
      ed.bucket(p[0], p[1]);
      return null;
    case 'text':
      pressText(ed, p, t);
      return NONE;
    case 'shape-emoji': {
      const o2 = ed.opts;
      ed.addMark({ type: 'emoji', x: p[0] - o2.emojiSize / 2, y: p[1] - o2.emojiSize / 2, emoji: o2.emoji, size: o2.emojiSize }, 'Add an emoji', 'Emoji');
      return null;
    }
    default:
      return pressShape(ed, p, t);
  }
}

/** A double click: words edited, a polygon lasso closed. */
export function doubleClick(ed: PictureEd, p: Pt, t: ViewT) {
  if (ed.tool === 'lasso-poly' && ed.overlay.poly) return polyClose(ed);
  const hit = layerAt(ed.doc, p[0], p[1], 6 / t.z);
  if (hit?.kind === 'mark' && hit.mark.type === 'text') {
    ed.pickLayer(hit.id);
    ed.startWriting(hit.id);
    return;
  }
  if (ed.tool === 'move' || ed.tool === 'hand') ed.view?.fit();
}

/** The box a free transform or a picked mark shows (for a mark: turned with it). */
export function pickedOutline(ed: PictureEd): Pt[] | null {
  const l = activeLayer(ed.doc);
  if (!l || l.kind !== 'mark' || ed.xform) return null;
  const b = markBoundsUnturned(l as MarkLayer);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const a = (l.angle * Math.PI) / 180;
  return [
    [b.x, b.y],
    [b.x + b.w, b.y],
    [b.x + b.w, b.y + b.h],
    [b.x, b.y + b.h],
  ].map(([x, y]) => [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)] as Pt);
}

export { markBounds, layerOf };
