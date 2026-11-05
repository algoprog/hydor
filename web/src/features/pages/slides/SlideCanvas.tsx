// The slide being edited, as large as there is room for, or zoomed (View → Zoom, Ctrl+scroll, a pinch) and scrolled
// around: click a part to pick it (Shift adds to the pick, a drag across empty space picks what it touches), drag it
// to move it (it snaps to the slide's middle and edges, to other parts, to the guides and the grid, with lines that
// show where, and to gaps as wide as those between other parts, marked; Alt does not snap, Shift keeps it straight),
// its handles to size or turn it, a line's ends to move them (near a part, an end sticks to the middle of one of its
// sides: a connector, which follows its parts as they are dragged). A group is picked, moved, sized and turned as one;
// double-click it to pick a part inside, Esc or a click outside to leave it. Double-click words to change them in
// place, a table's cell to type in it (Shift-click another to pick the cells between), a picture to crop it (drag the
// frame's edges and corners over the whole picture, drag the picture under it; Enter keeps it, Esc does not). The
// rulers give guides: drag one out of a ruler, drag it back to take it away; zoomed in, they stay at the view's edges.
// The slide itself is drawn by the runtime as it shows anywhere; this draws what is picked over it, and moves parts
// while they are dragged without drawing the slide again. The marks of the slide's comments sit over it, at their
// parts' corners (the editor's alone).
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { elbowPoints, everyEl, reconnect, scaleEls, SIDES, sidePoint, turnedBox, type Crop, type Deck, type El, type GroupEl, type ImageEl, type LineEl, type Para, type Slide, type Stick, type TableEl, type TextProps } from '@shared/slides';
import { MessageSquare } from 'lucide-react';
import { cx } from '../../../components/ui';
import { boxOf, heightOf, mergeAt, setEls, W } from './ops';
import { PICS, RT } from './rt';

export interface CanvasHandle {
  /** The words being changed in place, read back now (null when none are). */
  readText(): { id: string; paras: Para[] } | null;
  /** The box of words being changed in place. */
  editBox(): HTMLElement | null;
  /** Ends changing words in place, keeping them. */
  stopEditing(): void;
  /** Changes the paragraphs the caret or selection is in, while words are changed in place (their list, alignment, level). */
  paraOp(f: (paras: Para[], picked: number[]) => Para[]): void;
  /** Ends cropping a picture, keeping the crop or not. */
  endCrop(keep: boolean): void;
}

/** A match of Find to mark: in a part's paragraph, a table's cell or a chart's words ([s, e) of their text), or an equation's LaTeX (the equation). */
export interface FindMark {
  id: string;
  para?: number;
  cell?: [number, number];
  /** A chart's words the match is in (its title, a label, a series' name). */
  chart?: string;
  /** In an equation's LaTeX: the equation is marked whole. */
  tex?: boolean;
  s: number;
  e: number;
  current: boolean;
}

/** Cells of a table picked together (to merge them, or fill them). */
export interface CellSel {
  id: string;
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

/** The mark of a slide's open comments: at a part's top-right corner, or where a comment on the slide is (the slide's pixels). */
export interface CommentPin {
  key: string;
  x: number;
  y: number;
  /** The comments it marks. */
  ids: string[];
  /** One of them is the one picked in the Comments tab. */
  active: boolean;
}

export interface GridOpts {
  show: boolean;
  snap: boolean;
  /** In the slide's pixels. */
  size: number;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface P {
  x: number;
  y: number;
}

/** A box something is drawn in: a group, or a picture being cropped. Inside it, its top-left corner is 0, 0. */
interface Frame extends Box {
  rot: number;
}

type Drag =
  | { kind: 'move'; ids: string[]; start: P; dx: number; dy: number; moved: boolean }
  | { kind: 'resize'; id: string; hx: number; hy: number; start: P; box: Box; rot: number; next: Box }
  | { kind: 'rotate'; id: string; cx: number; cy: number; rot: number }
  | { kind: 'end'; id: string; which: 'start' | 'end'; next: { x: number; y: number; w: number; h: number }; stick?: Stick; near?: string }
  | { kind: 'marquee'; start: P; at: P; add: string[] }
  | { kind: 'guide'; axis: 'x' | 'y'; index: number | null; at: number; off: boolean }
  | { kind: 'crop'; hx: number; hy: number; start: P; box: Box; full: Box };

/** Where a picture is cropped while it is: the frame kept, and the whole picture, inside the picture's own box. */
interface Cropping {
  id: string;
  box: Box;
  full: Box;
  url: string;
}

const HANDLES: [number, number][] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
];
const CURSOR: Record<string, string> = { '-1,-1': 'nwse-resize', '1,1': 'nwse-resize', '1,-1': 'nesw-resize', '-1,1': 'nesw-resize', '0,-1': 'ns-resize', '0,1': 'ns-resize', '-1,0': 'ew-resize', '1,0': 'ew-resize' };
const RULER = 18;
const GUIDE = '#14b8d4';
const SNAP = '#ff3b8b';

/** Where a caret goes for a point on the screen (browsers name it two ways). */
function caretAt(x: number, y: number): Range | null {
  const d = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  if (d.caretPositionFromPoint) {
    const p = d.caretPositionFromPoint(x, y);
    if (!p) return null;
    const r = document.createRange();
    r.setStart(p.offsetNode, p.offset);
    return r;
  }
  return document.caretRangeFromPoint?.(x, y) ?? null;
}

/** Which of a box's paragraphs the selection touches. */
function pickedParas(box: HTMLElement): number[] {
  const s = window.getSelection();
  if (!s?.rangeCount) return [];
  const r = s.getRangeAt(0);
  const out: number[] = [];
  Array.from(box.children).forEach((p, i) => {
    if (r.intersectsNode(p)) out.push(i);
  });
  return out;
}

/** The caret's place in a box of words: which paragraph, how far into it. */
function caretPlace(box: HTMLElement): { p: number; at: number } | null {
  const s = window.getSelection();
  if (!s?.rangeCount || !box.contains(s.anchorNode)) return null;
  const paras = Array.from(box.querySelectorAll(':scope > .ns-p'));
  const p = paras.findIndex((x) => x.contains(s.anchorNode));
  if (p < 0) return null;
  const r = document.createRange();
  r.selectNodeContents(paras[p]);
  r.setEnd(s.anchorNode!, s.anchorOffset);
  return { p, at: r.toString().length };
}

function placeCaret(box: HTMLElement, place: { p: number; at: number }) {
  const para = box.querySelectorAll(':scope > .ns-p')[place.p] as HTMLElement | undefined;
  if (!para) return;
  let left = place.at;
  const walk = document.createTreeWalker(para, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const len = n.nodeValue?.length ?? 0;
    if (left <= len) {
      const r = document.createRange();
      r.setStart(n, left);
      r.collapse(true);
      const s = window.getSelection();
      s?.removeAllRanges();
      s?.addRange(r);
      return;
    }
    left -= len;
  }
  const r = document.createRange();
  r.selectNodeContents(para);
  r.collapse(false);
  const s = window.getSelection();
  s?.removeAllRanges();
  s?.addRange(r);
}

/** A range over [s, e) of an element's text, through the text inside it. */
function textRange(root: Element, s: number, e: number): Range | null {
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let at = 0;
  const r = document.createRange();
  let started = false;
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const len = n.nodeValue?.length ?? 0;
    if (!started && s <= at + len) {
      r.setStart(n, Math.max(0, s - at));
      started = true;
    }
    if (started && e <= at + len) {
      r.setEnd(n, Math.max(0, e - at));
      return r;
    }
    at += len;
  }
  return null;
}

/** A point of the slide (or of the frame around) in a frame's own coordinates, through each frame in turn. */
function unframe(p: P, frames: Frame[]): P {
  return frames.reduce((q, f) => {
    const a = (-f.rot * Math.PI) / 180;
    const dx = q.x - (f.x + f.w / 2);
    const dy = q.y - (f.y + f.h / 2);
    return { x: f.w / 2 + dx * Math.cos(a) - dy * Math.sin(a), y: f.h / 2 + dx * Math.sin(a) + dy * Math.cos(a) };
  }, p);
}

const frameOf = (e: { x: number; y: number; w: number; h: number; rot?: number }): Frame => ({ x: e.x, y: e.y, w: e.w, h: e.h, rot: e.rot ?? 0 });

/** Frames inside each other, as the groups are: what is drawn in them shows where it is on the slide. */
function Nest({ frames, k, children }: { frames: Frame[]; k: number; children: ReactNode }) {
  if (!frames.length) return <>{children}</>;
  const [f, ...rest] = frames;
  return (
    <div className="pointer-events-none absolute" style={{ left: f.x * k, top: f.y * k, width: f.w * k, height: f.h * k, rotate: f.rot ? `${f.rot}deg` : undefined }}>
      <Nest frames={rest} k={k}>
        {children}
      </Nest>
    </div>
  );
}

/** A crop's shares from the frame kept and the whole picture (a flipped picture's sides swapped back). */
function cropOf(box: Box, full: Box, img: ImageEl): Crop | undefined {
  let l = (box.x - full.x) / full.w;
  let t = (box.y - full.y) / full.h;
  let r = (full.x + full.w - box.x - box.w) / full.w;
  let b = (full.y + full.h - box.y - box.h) / full.h;
  if (img.flipH) [l, r] = [r, l];
  if (img.flipV) [t, b] = [b, t];
  const c = { l: Math.max(0, Math.round(l * 10000) / 10000), t: Math.max(0, Math.round(t * 10000) / 10000), r: Math.max(0, Math.round(r * 10000) / 10000), b: Math.max(0, Math.round(b * 10000) / 10000) };
  return c.l || c.t || c.r || c.b ? c : undefined;
}

export const SlideCanvas = forwardRef<
  CanvasHandle,
  {
    deck: Deck;
    index: number;
    sel: string[];
    onSel: (ids: string[]) => void;
    editing: string | null;
    onEditing: (id: string | null) => void;
    change: (next: Deck | ((d: Deck) => Deck), key?: string) => void;
    fonts: number;
    readOnly?: boolean;
    /** An agent writing this slide (live.ts): the part its words are arriving in ('' for the slide as a whole), boxed in its colour. */
    agent?: string | null;
    /** Right-click (or a long press) on a part or the slide. */
    onMenu?: (at: { x: number; y: number }, id: string | null) => void;
    /** An empty picture was double-clicked: put one in its place. */
    onReplaceImage?: (id: string) => void;
    /** A chart was double-clicked: its numbers. */
    onChartData?: (id: string) => void;
    /** An equation or an icon was double-clicked: its LaTeX, or another icon. */
    onOpen?: (id: string) => void;
    /** Text selected while editing changed (for the toolbar's state). */
    onTextSelection?: () => void;
    /** 'fit', or how many screen pixels a slide's pixel takes. */
    zoom: number | 'fit';
    onZoom: (z: number | 'fit') => void;
    /** The groups entered, the outermost first: their parts are picked one by one. */
    scope: string[];
    onScope: (path: string[]) => void;
    grid: GridOpts;
    /** Rulers along the top and the left, and the guides. */
    rulers: boolean;
    /** The format painter is on: a click puts the look on a part (null: a click on none). */
    painting?: boolean;
    onPaint?: (id: string | null) => void;
    /** The picture being cropped. */
    cropping: string | null;
    onCropping: (id: string | null) => void;
    /** Find's matches on this slide. */
    marks?: FindMark[];
    cellSel?: CellSel | null;
    onCellSel?: (s: CellSel | null) => void;
    /** The slide's comments' marks (the editor's alone: never drawn in the slideshow), and a click on one. */
    pins?: CommentPin[];
    onPin?: (ids: string[]) => void;
    children?: ReactNode;
  }
>(function SlideCanvas(
  {
    deck,
    index,
    sel,
    onSel,
    editing,
    onEditing,
    change,
    fonts,
    readOnly,
    agent,
    onMenu,
    onReplaceImage,
    onChartData,
    onOpen,
    onTextSelection,
    zoom,
    onZoom,
    scope,
    onScope,
    grid,
    rulers,
    painting,
    onPaint,
    cropping,
    onCropping,
    marks,
    cellSel,
    onCellSel,
    pins,
    onPin,
    children,
  },
  handle,
) {
  const H = heightOf(deck);
  const slide = deck.slides[index];
  const wrap = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [gaps, setGaps] = useState<{ x1: number; y1: number; x2: number; y2: number; n: number }[]>([]);
  const [cell, setCell] = useState<{ id: string; r: number; c: number; box: Box; text: string } | null>(null);
  const [crop, setCrop] = useState<Cropping | null>(null);
  const [hl, setHl] = useState<{ x: number; y: number; w: number; h: number; current: boolean }[]>([]);
  const [cellBoxes, setCellBoxes] = useState<Box[]>([]);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  const dblAt = useRef<{ x: number; y: number } | null>(null);
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const anchor = useRef<{ p: P; cx: number; cy: number } | null>(null);
  const touches = useRef(new Map<number, P>());
  const rulerX = useRef<SVGSVGElement>(null);
  const rulerY = useRef<SVGSVGElement>(null);
  const corner = useRef<HTMLDivElement>(null);
  const pinch = useRef<{ dist: number; k: number; mid: P } | null>(null);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const phone = size.w < 520;
  const showRulers = rulers && !phone;
  const pad = phone ? 10 : showRulers ? 34 : 28;
  const fitK = size.w ? Math.max(0.05, Math.min((size.w - pad * 2) / W, (size.h - pad * 2) / H)) : 0.5;
  const k = zoom === 'fit' ? fitK : Math.max(0.05, Math.min(8, zoom));
  const sheet = { w: Math.max(size.w, Math.ceil(W * k + pad * 2)), h: Math.max(size.h, Math.ceil(H * k + pad * 2)) };
  const stage = { left: Math.round((sheet.w - W * k) / 2), top: Math.round((sheet.h - H * k) / 2), w: W * k, h: H * k };
  const zoomed = sheet.w > size.w + 1 || sheet.h > size.h + 1;

  // The groups entered, as they are now (a scope whose group is gone is left).
  const groups: GroupEl[] = [];
  {
    let els = slide?.els ?? [];
    for (const id of scope) {
      const g = els.find((e) => e.id === id);
      if (!g || g.type !== 'group') break;
      groups.push(g);
      els = g.els;
    }
  }
  const scoped = groups.length === scope.length ? groups : [];
  useEffect(() => {
    if (scope.length && groups.length !== scope.length) onScope(groups.map((g) => g.id));
  });
  const frames = scoped.map(frameOf);
  const levelEls: El[] = scoped.length ? scoped[scoped.length - 1].els : (slide?.els ?? []);
  /** The level's own coordinates are the slide's moved (nothing turned): the slide's lines can be snapped to there. */
  const straight = frames.every((f) => !f.rot);
  const origin = frames.reduce((o, f) => ({ x: o.x + f.x, y: o.y + f.y }), { x: 0, y: 0 });

  // After zooming at a point, that point stays under the pointer.
  useLayoutEffect(() => {
    const a = anchor.current;
    const el = wrap.current;
    if (!a || !el) return;
    anchor.current = null;
    const r = el.getBoundingClientRect();
    el.scrollLeft = stage.left + a.p.x * k - (a.cx - r.left);
    el.scrollTop = stage.top + a.p.y * k - (a.cy - r.top);
  }, [k]);

  // ---- drawing the slide ------------------------------------------------------------------------------
  useLayoutEffect(() => {
    const host = content.current;
    if (!host || !slide) return;
    // Words being changed in place stay as they are typed.
    if (editingRef.current && host.querySelector(`.ns-el[data-id="${CSS.escape(editingRef.current)}"] .ns-txt[contenteditable]`)) return;
    host.textContent = '';
    const el = RT.slide(deck, index, { edit: true, ...PICS });
    host.appendChild(el);
    RT.fit(el);
  }, [slide, deck.theme, deck.ratio, deck.footer, index, fonts, editing]);

  const nodeOf = (id: string) => content.current?.querySelector<HTMLElement>(`.ns-el[data-id="${CSS.escape(id)}"]`) ?? null;

  // Find's matches, marked where they are drawn.
  useLayoutEffect(() => {
    const st = stageRef.current?.getBoundingClientRect();
    if (!marks?.length || !st) return setHl([]);
    const out: typeof hl = [];
    for (const m of marks) {
      const part = nodeOf(m.id);
      const put = (b: DOMRect) => out.push({ x: b.left - st.left, y: b.top - st.top, w: b.width, h: b.height, current: m.current });
      // An equation: what KaTeX drew of it (its LaTeX is not on the slide).
      if (m.tex) {
        const drawn = part?.querySelector('.ns-mi') ?? part;
        if (drawn) put(drawn.getBoundingClientRect());
        continue;
      }
      // A chart's words, where it draws them (a series' name is in the legend; without one, the chart is marked).
      if (m.chart !== undefined) {
        const t = Array.from(part?.querySelectorAll('text') ?? []).find((x) => x.textContent === m.chart);
        const rr = t ? textRange(t, m.s, m.e) : null;
        const rects = rr ? Array.from(rr.getClientRects()) : [];
        if (rects.length) rects.forEach(put);
        else if (t ?? part) put((t ?? part)!.getBoundingClientRect());
        continue;
      }
      const root = m.cell ? part?.querySelector(`td[data-r="${m.cell[0]}"][data-c="${m.cell[1]}"]`) : part?.querySelectorAll(':scope > .ns-txt > .ns-p')[m.para ?? 0];
      const r = root ? textRange(root, m.s, m.e) : null;
      if (!r) continue;
      for (const b of Array.from(r.getClientRects())) put(b);
    }
    setHl(out);
  }, [marks, slide, k, size.w, size.h, fonts]);

  // The table cells picked together, marked.
  useLayoutEffect(() => {
    const st = stageRef.current?.getBoundingClientRect();
    if (!cellSel || !st) return setCellBoxes([]);
    const part = nodeOf(cellSel.id);
    const out: Box[] = [];
    for (const td of Array.from(part?.querySelectorAll<HTMLElement>('td') ?? [])) {
      const r = Number(td.dataset.r);
      const c = Number(td.dataset.c);
      if (r >= Math.min(cellSel.r0, cellSel.r1) && r <= Math.max(cellSel.r0, cellSel.r1) && c >= Math.min(cellSel.c0, cellSel.c1) && c <= Math.max(cellSel.c0, cellSel.c1)) {
        const b = td.getBoundingClientRect();
        out.push({ x: b.left - st.left, y: b.top - st.top, w: b.width, h: b.height });
      }
    }
    setCellBoxes(out);
  }, [cellSel, slide, k, size.w, size.h]);

  /** A point on the screen in the slide's pixels. */
  const toSlide = (clientX: number, clientY: number): P => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: (clientX - r.left) / k, y: (clientY - r.top) / k };
  };
  /** A point on the screen in the coordinates of the group entered (the slide's, when none is). */
  const toLocal = (clientX: number, clientY: number): P => unframe(toSlide(clientX, clientY), frames);

  /** The part under a point at the level picked from (a line only near the line itself); `inside`: within the group entered. */
  const hit = (clientX: number, clientY: number): { id: string | null; inside: boolean } => {
    const root = content.current?.firstElementChild as HTMLElement | null;
    if (!root) return { id: null, inside: true };
    const level = scoped.length ? nodeOf(scoped[scoped.length - 1].id) : root;
    const p = toLocal(clientX, clientY);
    for (const n of document.elementsFromPoint(clientX, clientY)) {
      let at = (n as HTMLElement).closest?.('.ns-el') as HTMLElement | null;
      if (!at || !root.contains(at) || at === level) continue;
      // Up to the part whose parent is the level's.
      while (at && at.parentElement !== level && at.parentElement !== root) at = at.parentElement?.closest('.ns-el') as HTMLElement | null;
      if (!at) continue;
      if (at.parentElement !== level) {
        // Outside the group entered: a part on the slide itself.
        let top: HTMLElement | null = at;
        while (top && top.parentElement !== root) top = top.parentElement?.closest('.ns-el') as HTMLElement | null;
        return { id: top?.dataset.id ?? null, inside: false };
      }
      const el = levelEls.find((e) => e.id === at!.dataset.id);
      if (el?.type === 'line') {
        const dx = el.w;
        const dy = el.h;
        const len2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((p.x - el.x) * dx + (p.y - el.y) * dy) / len2));
        if (Math.hypot(p.x - (el.x + t * dx), p.y - (el.y + t * dy)) > Math.max(10 / k, el.width)) continue;
      }
      return { id: at.dataset.id ?? null, inside: true };
    }
    const g = scoped[scoped.length - 1];
    return { id: null, inside: !g || (p.x >= 0 && p.y >= 0 && p.x <= g.w && p.y <= g.h) };
  };

  // ---- changing words in place ---------------------------------------------------------------------------
  const elById = (id: string | null): El | undefined => {
    if (!id || !slide) return undefined;
    const find = (els: El[]): El | undefined => {
      for (const e of els) {
        if (e.id === id) return e;
        if (e.type === 'group') {
          const got = find(e.els);
          if (got) return got;
        }
      }
      return undefined;
    };
    return find(slide.els);
  };
  const editBox = () => (editing ? (nodeOf(editing)?.querySelector<HTMLElement>(':scope > .ns-txt') ?? null) : null);
  const readText = () => {
    const box = editBox();
    const el = elById(editing);
    if (!box || !el || (el.type !== 'text' && el.type !== 'shape')) return null;
    return { id: el.id, paras: RT.read(box, el) };
  };
  const stop = () => {
    const got = readText();
    const box = editBox();
    if (box) box.removeAttribute('contenteditable');
    if (got) {
      const el = elById(got.id) as TextProps | undefined;
      if (el && JSON.stringify(el.paras) !== JSON.stringify(got.paras)) change((d) => setEls(d, index, [got.id], (e) => ({ ...e, paras: got.paras }) as El), `text:${got.id}`);
    }
    onEditing(null);
  };

  // ---- cropping a picture --------------------------------------------------------------------------------
  const cropEl = crop ? elById(crop.id) : undefined;
  const cropImg = cropEl?.type === 'image' ? cropEl : null;
  useEffect(() => {
    if (!cropping) return setCrop(null);
    const e = elById(cropping);
    if (!e || e.type !== 'image' || !e.src) return onCropping(null);
    if (crop?.id === cropping) return;
    const img = nodeOf(e.id)?.querySelector('img');
    const url = img?.src ?? '';
    const nw = img?.naturalWidth || e.w;
    const nh = img?.naturalHeight || e.h;
    let box: Box = { x: 0, y: 0, w: e.w, h: e.h };
    let full: Box;
    if (e.crop) {
      let { l, t, r, b } = e.crop;
      if (e.flipH) [l, r] = [r, l];
      if (e.flipV) [t, b] = [b, t];
      const fw = e.w / Math.max(0.05, 1 - l - r);
      const fh = e.h / Math.max(0.05, 1 - t - b);
      full = { x: -l * fw, y: -t * fh, w: fw, h: fh };
    } else if ((e.fit ?? 'cover') === 'cover') {
      const s = Math.max(e.w / nw, e.h / nh);
      full = { x: (e.w - nw * s) / 2, y: (e.h - nh * s) / 2, w: nw * s, h: nh * s };
    } else if (e.fit === 'contain') {
      const s = Math.min(e.w / nw, e.h / nh);
      full = { x: (e.w - nw * s) / 2, y: (e.h - nh * s) / 2, w: nw * s, h: nh * s };
      box = { ...full };
    } else full = { ...box };
    setCrop({ id: e.id, box, full, url });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropping]);
  const endCrop = (keep: boolean) => {
    const c = crop;
    const e = cropImg;
    setCrop(null);
    onCropping(null);
    if (!keep || !c || !e) return;
    // The frame kept becomes the picture's box, where it shows on the slide, turned as the picture is.
    const a = ((e.rot ?? 0) * Math.PI) / 180;
    const qx = c.box.x + c.box.w / 2 - e.w / 2;
    const qy = c.box.y + c.box.h / 2 - e.h / 2;
    const cx = e.x + e.w / 2 + qx * Math.cos(a) - qy * Math.sin(a);
    const cy = e.y + e.h / 2 + qx * Math.sin(a) + qy * Math.cos(a);
    const next = { x: Math.round(cx - c.box.w / 2), y: Math.round(cy - c.box.h / 2), w: Math.max(4, Math.round(c.box.w)), h: Math.max(4, Math.round(c.box.h)), crop: cropOf(c.box, c.full, e) };
    change((d) =>
      setEls(d, index, [e.id], (x) => {
        const { crop: _c, fit: _f, ...rest } = x as ImageEl;
        return { ...rest, ...next, ...(next.crop ? {} : { fit: 'fill' as const }) } as El;
      }),
    );
  };
  // Enter keeps the crop, Esc leaves the picture as it was; nothing else acts while cropping.
  useEffect(() => {
    if (!crop) return;
    const k2 = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        endCrop(e.key === 'Enter');
      } else if (!(e.target as HTMLElement | null)?.closest?.('input,textarea')) e.stopPropagation();
    };
    window.addEventListener('keydown', k2, true);
    return () => window.removeEventListener('keydown', k2, true);
  });

  useImperativeHandle(handle, () => ({
    readText,
    editBox,
    stopEditing: stop,
    paraOp: (f) => paraOp(f),
    endCrop,
  }));

  const paraOp = (f: (paras: Para[], picked: number[]) => Para[]) => {
    const box = editBox();
    const el = elById(editing);
    if (!box || !el || (el.type !== 'text' && el.type !== 'shape')) return;
    const picked = pickedParas(box);
    const place = caretPlace(box);
    const next = f(RT.read(box, el), picked.length ? picked : [0]);
    RT.words(box, deck, { ...el, paras: next });
    if (place) placeCaret(box, place);
  };

  useEffect(() => {
    if (!editing) return;
    const node = nodeOf(editing);
    const box = node?.querySelector<HTMLElement>(':scope > .ns-txt');
    if (!node || !box) return;
    box.setAttribute('contenteditable', 'true');
    box.spellcheck = true;
    box.focus({ preventScroll: true });
    const empty = node.classList.contains('ns-ph');
    const at = dblAt.current;
    dblAt.current = null;
    const range = !empty && at ? caretAt(at.x, at.y) : null;
    const s = window.getSelection();
    if (range && box.contains(range.startContainer)) {
      s?.removeAllRanges();
      s?.addRange(range);
    } else {
      const r = document.createRange();
      r.selectNodeContents(box);
      if (empty) r.collapse(true);
      s?.removeAllRanges();
      s?.addRange(r);
    }
    const onInput = () => {
      const hasWords = (box.textContent ?? '').replace(/​/g, '').length > 0;
      node.classList.toggle('ns-ph', !hasWords && !!box.querySelector('[data-ph]'));
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        stop();
      } else if (e.key === 'Tab') {
        // A paragraph a level deeper, or back up.
        e.preventDefault();
        paraOp((paras, picked) => paras.map((p, i) => (picked.includes(i) ? { ...p, lvl: Math.max(0, Math.min(4, (p.lvl ?? 0) + (e.shiftKey ? -1 : 1))) } : p)));
      }
      // Ctrl+F and Ctrl+H find, from inside words too, and Ctrl+Alt+M comments on them.
      if (!((e.ctrlKey || e.metaKey) && (/^[fhFH/]$/.test(e.key) || (e.altKey && e.code === 'KeyM')))) e.stopPropagation();
    };
    // Pasted words come in plain: a deck's runs keep its own look.
    const onPaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text/plain');
      if (text === undefined) return;
      e.preventDefault();
      document.execCommand('insertText', false, text);
    };
    const onSelChange = () => onTextSelection?.();
    box.addEventListener('input', onInput);
    box.addEventListener('keydown', onKey);
    box.addEventListener('paste', onPaste);
    document.addEventListener('selectionchange', onSelChange);
    return () => {
      box.removeEventListener('input', onInput);
      box.removeEventListener('keydown', onKey);
      box.removeEventListener('paste', onPaste);
      document.removeEventListener('selectionchange', onSelChange);
    };
    // Set up once per part edited.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  // A click outside the words being changed ends the change (and then picks what was clicked).
  useEffect(() => {
    if (!editing) return;
    const down = (e: PointerEvent) => {
      const box = editBox();
      const t = e.target as HTMLElement;
      if (!box || box.contains(t) || t.closest('[data-keeps-editing]')) return;
      stop();
    };
    document.addEventListener('pointerdown', down, true);
    return () => document.removeEventListener('pointerdown', down, true);
  });

  // Ctrl+scroll (and a trackpad's pinch) zooms where the pointer is.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const next = Math.max(0.1, Math.min(4, k * Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025))));
      if (Math.abs(next - k) < 0.001) return;
      anchor.current = { p: toSlide(e.clientX, e.clientY), cx: e.clientX, cy: e.clientY };
      onZoom(Math.abs(next - fitK) < 0.004 ? 'fit' : Math.round(next * 1000) / 1000);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  });

  // ---- pointers ---------------------------------------------------------------------------------------------
  const others = (ids: string[]) => levelEls.filter((e) => !ids.includes(e.id)).map(boxOf);
  /** What a box moving at this level snaps to: the slide's middle and edges, the other parts, the guides, the grid. */
  const snapLines = (ids: string[], box?: Box) => {
    const xs: number[] = [];
    const ys: number[] = [];
    if (straight) {
      xs.push(0 - origin.x, W / 2 - origin.x, W - origin.x);
      ys.push(0 - origin.y, H / 2 - origin.y, H - origin.y);
      if (rulers) {
        for (const g of deck.guides?.x ?? []) xs.push(g - origin.x);
        for (const g of deck.guides?.y ?? []) ys.push(g - origin.y);
      }
    }
    for (const b of others(ids)) {
      xs.push(b.x, b.x + b.w / 2, b.x + b.w);
      ys.push(b.y, b.y + b.h / 2, b.y + b.h);
    }
    // The grid's lines near the box.
    const gx: number[] = [];
    const gy: number[] = [];
    if (grid.snap && straight && box && grid.size > 1) {
      const near = (v: number, o: number) => {
        const n = Math.round((v + o) / grid.size) * grid.size - o;
        return [n - grid.size, n, n + grid.size];
      };
      gx.push(...near(box.x, origin.x), ...near(box.x + box.w, origin.x));
      gy.push(...near(box.y, origin.y), ...near(box.y + box.h, origin.y));
    }
    return { xs, ys, gx, gy };
  };
  const snap = (vals: number[], lines: number[], tol: number): { d: number; at: number[] } => {
    let best: { d: number; at: number[] } = { d: 0, at: [] };
    let bestAbs = tol + 1;
    for (const v of vals)
      for (const l of lines) {
        const d = l - v;
        if (Math.abs(d) < bestAbs - 0.01) {
          bestAbs = Math.abs(d);
          best = { d, at: [l] };
        } else if (Math.abs(Math.abs(d) - bestAbs) < 0.01 && !best.at.includes(l)) best.at.push(l);
      }
    return bestAbs <= tol ? best : { d: 0, at: [] };
  };
  /** Snapping to the lines and to the grid: whichever is nearer; only the lines' own are drawn. */
  const snapBoth = (vals: number[], lines: number[], gridLines: number[], tol: number) => {
    const a = snap(vals, lines, tol);
    const g = snap(vals, gridLines, tol);
    if (!g.at.length || (a.at.length && Math.abs(a.d) <= Math.abs(g.d))) return a;
    return { d: g.d, at: [] };
  };

  /**
   * Gaps as wide as those between other parts in the same row (or column): the box moved to make another such gap,
   * or to sit as far from the part on its one side as from the one on its other; and where the gaps are, to mark them.
   */
  const spacing = (b: Box, ids: string[], axis: 'x' | 'y', tol: number): { d: number; marks: { a: number; b: number; at: number }[] } | null => {
    const X = axis === 'x';
    const pos = (r: Box) => (X ? r.x : r.y);
    const len = (r: Box) => (X ? r.w : r.h);
    const across = (r: Box) => (X ? [r.y, r.y + r.h] : [r.x, r.x + r.w]);
    const [m0, m1] = across(b);
    const row = others(ids)
      .filter((r) => {
        const [a0, a1] = across(r);
        return a0 < m1 && a1 > m0;
      })
      .sort((p, q) => pos(p) - pos(q));
    if (row.length < 2) return null;
    const mid = (r: Box) => {
      const [a0, a1] = across(r);
      return (Math.max(a0, m0) + Math.min(a1, m1)) / 2;
    };
    let best: { d: number; marks: { a: number; b: number; at: number }[] } | null = null;
    const offer = (to: number, marks: { a: number; b: number; at: number }[]) => {
      const d = to - pos(b);
      if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, marks };
    };
    for (let i = 0; i < row.length - 1; i++) {
      const A = row[i];
      const B = row[i + 1];
      const gap = pos(B) - (pos(A) + len(A));
      if (gap <= 0) continue;
      // After B, and before A, with the gap they have.
      offer(pos(B) + len(B) + gap, [
        { a: pos(A) + len(A), b: pos(B), at: mid(A) },
        { a: pos(B) + len(B), b: pos(B) + len(B) + gap, at: mid(B) },
      ]);
      offer(pos(A) - gap - len(b), [
        { a: pos(A) - gap, b: pos(A), at: mid(A) },
        { a: pos(A) + len(A), b: pos(B), at: mid(B) },
      ]);
      // Between them, as far from each.
      const room = gap - len(b);
      if (room > 0)
        offer(pos(A) + len(A) + room / 2, [
          { a: pos(A) + len(A), b: pos(A) + len(A) + room / 2, at: mid(A) },
          { a: pos(B) - room / 2, b: pos(B), at: mid(B) },
        ]);
    }
    return best;
  };

  /** The connectors stuck to parts being dragged, drawn where they will go (`moved`: those parts as the drag has them now). */
  const follow = (moved: El[]) => {
    if (!slide || scoped.length || !moved.length) return;
    const by = new Map(moved.map((e) => [e.id, e]));
    const now = { ...slide, els: slide.els.map((e) => by.get(e.id) ?? e) };
    const after = reconnect(now);
    if (after === now) return;
    after.els.forEach((l, i) => {
      if (l === now.els[i] || l.type !== 'line' || by.has(l.id)) return;
      const n = nodeOf(l.id);
      if (n) n.replaceWith(RT.part(deck, slide, l, { edit: true, ...PICS }));
    });
  };

  const begin = (e: React.PointerEvent, d: Drag) => {
    if (readOnly) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDrag(d);
  };

  /** Drops what is moving with nothing changed (a second finger came: that is a pinch). */
  const dropDrag = () => {
    const d = dragRef.current;
    if (d?.kind === 'move') for (const id of d.ids) nodeOf(id)?.style.removeProperty('translate');
    setDrag(null);
    setGuides({ x: [], y: [] });
    setGaps([]);
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size === 2) {
        const [a, b] = [...touches.current.values()];
        dropDrag();
        pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, k, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
        return;
      }
    }
    // Shift-click on another cell of the table whose cell is picked: the cells between.
    if (e.button === 0 && e.shiftKey && cellSel && !editing) {
      const td = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.tagName === 'TD') as HTMLElement | undefined;
      if (td && (td.closest('.ns-el') as HTMLElement | null)?.dataset.id === cellSel.id) {
        e.preventDefault();
        if (cell) saveCell();
        onCellSel?.({ ...cellSel, r1: Number(td.dataset.r), c1: Number(td.dataset.c) });
        return;
      }
    }
    if (e.button !== 0 || editing || cell) return;
    wrap.current?.focus({ preventScroll: true });
    if (crop && cropImg) {
      // A press outside the whole picture keeps the crop; inside it, the picture moves under the frame.
      const p = unframe(toSlide(e.clientX, e.clientY), [...frames, frameOf(cropImg)]);
      const f = crop.full;
      if (p.x < f.x || p.y < f.y || p.x > f.x + f.w || p.y > f.y + f.h) return endCrop(true);
      return begin(e, { kind: 'crop', hx: 0, hy: 0, start: p, box: crop.box, full: crop.full });
    }
    const { id, inside } = hit(e.clientX, e.clientY);
    if (!inside) {
      // Outside the group entered: back to the slide's own parts.
      onScope([]);
      onSel(id ? [id] : []);
      return;
    }
    if (painting) {
      onPaint?.(id);
      if (id) return;
    }
    const p = toLocal(e.clientX, e.clientY);
    if (!id) {
      if (!e.shiftKey) onSel([]);
      onCellSel?.(null);
      if (!readOnly) begin(e, { kind: 'marquee', start: p, at: p, add: e.shiftKey ? sel : [] });
      return;
    }
    let ids = sel;
    if (e.shiftKey) {
      ids = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
      onSel(ids);
      return;
    }
    if (!sel.includes(id)) {
      ids = [id];
      onSel(ids);
      if (cellSel && cellSel.id !== id) onCellSel?.(null);
    }
    const movable = ids.filter((x) => levelEls.some((el) => el.id === x && !el.lock));
    if (movable.length) begin(e, { kind: 'move', ids: movable, start: p, dx: 0, dy: 0, moved: false });
  };

  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch' && touches.current.has(e.pointerId)) {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pc = pinch.current;
      if (pc && touches.current.size >= 2) {
        const [a, b] = [...touches.current.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const next = Math.max(0.1, Math.min(4, (pc.k * dist) / pc.dist));
        // The point under the fingers' middle stays under it as it moves.
        anchor.current = { p: toSlide(pc.mid.x, pc.mid.y), cx: mid.x, cy: mid.y };
        pc.mid = mid;
        if (Math.abs(next - k) > 0.002) onZoom(Math.round(next * 1000) / 1000);
        else {
          const el = wrap.current;
          const an = anchor.current;
          anchor.current = null;
          if (el && an) {
            const r = el.getBoundingClientRect();
            el.scrollLeft = stage.left + an.p.x * k - (an.cx - r.left);
            el.scrollTop = stage.top + an.p.y * k - (an.cy - r.top);
          }
        }
        return;
      }
    }
    const d = dragRef.current;
    if (!d) return;
    const p = toLocal(e.clientX, e.clientY);
    const tol = 6 / k;
    if (d.kind === 'marquee') return setDrag({ ...d, at: p });
    if (d.kind === 'guide') {
      const s = toSlide(e.clientX, e.clientY);
      const at = Math.round(d.axis === 'x' ? s.x : s.y);
      // Dragged off the slide (back over its ruler), it goes when let go.
      const off = at < 0 || at > (d.axis === 'x' ? W : H);
      return setDrag({ ...d, at, off });
    }
    if (d.kind === 'crop' && crop) {
      const q = unframe(toSlide(e.clientX, e.clientY), [...frames, frameOf(cropImg ?? { x: 0, y: 0, w: 1, h: 1 })]);
      const dx = q.x - d.start.x;
      const dy = q.y - d.start.y;
      const f = d.full;
      if (!d.hx && !d.hy) {
        // The picture moves under the frame, which stays within it.
        const x = Math.min(d.box.x, Math.max(d.box.x + d.box.w - f.w, f.x + dx));
        const y = Math.min(d.box.y, Math.max(d.box.y + d.box.h - f.h, f.y + dy));
        setCrop({ ...crop, full: { ...f, x, y } });
        return;
      }
      let { x, y, w, h } = d.box;
      if (d.hx < 0) {
        const nx = Math.max(f.x, Math.min(x + w - 8, x + dx));
        w += x - nx;
        x = nx;
      } else if (d.hx > 0) w = Math.max(8, Math.min(f.x + f.w - x, w + dx));
      if (d.hy < 0) {
        const ny = Math.max(f.y, Math.min(y + h - 8, y + dy));
        h += y - ny;
        y = ny;
      } else if (d.hy > 0) h = Math.max(8, Math.min(f.y + f.h - y, h + dy));
      setCrop({ ...crop, box: { x, y, w, h } });
      return;
    }
    if (d.kind === 'move') {
      let dx = p.x - d.start.x;
      let dy = p.y - d.start.y;
      if (!d.moved && Math.hypot(dx * k, dy * k) < 3) return;
      if (e.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      const boxes = levelEls.filter((x) => d.ids.includes(x.id)).map(boxOf);
      const x0 = Math.min(...boxes.map((b) => b.x));
      const y0 = Math.min(...boxes.map((b) => b.y));
      const bw = Math.max(...boxes.map((b) => b.x + b.w)) - x0;
      const bh = Math.max(...boxes.map((b) => b.y + b.h)) - y0;
      let gx: number[] = [];
      let gy: number[] = [];
      const marks: typeof gaps = [];
      if (!e.altKey) {
        const box = { x: x0 + dx, y: y0 + dy, w: bw, h: bh };
        const { xs, ys, gx: gridX, gy: gridY } = snapLines(d.ids, box);
        const sx = snapBoth([box.x, box.x + bw / 2, box.x + bw], xs, gridX, tol);
        const sy = snapBoth([box.y, box.y + bh / 2, box.y + bh], ys, gridY, tol);
        if (!e.shiftKey || dx !== 0) dx += sx.d;
        if (!e.shiftKey || dy !== 0) dy += sy.d;
        gx = sx.at;
        gy = sy.at;
        // Equal gaps, where no line was snapped to across (or down).
        const moved = { x: x0 + dx, y: y0 + dy, w: bw, h: bh };
        const hx = !gx.length && (!e.shiftKey || dx !== 0) ? spacing(moved, d.ids, 'x', tol) : null;
        if (hx) {
          dx += hx.d;
          for (const m of hx.marks) marks.push({ x1: m.a, y1: m.at, x2: m.b, y2: m.at, n: Math.round(m.b - m.a) });
        }
        const vy = !gy.length && (!e.shiftKey || dy !== 0) ? spacing({ ...moved, x: x0 + dx }, d.ids, 'y', tol) : null;
        if (vy) {
          dy += vy.d;
          for (const m of vy.marks) marks.push({ x1: m.at, y1: m.a, x2: m.at, y2: m.b, n: Math.round(m.b - m.a) });
        }
      }
      setGuides({ x: gx, y: gy });
      setGaps(marks);
      for (const id of d.ids) {
        const n = nodeOf(id);
        if (n) n.style.translate = `${dx}px ${dy}px`;
      }
      follow(levelEls.filter((x) => d.ids.includes(x.id)).map((x) => ({ ...x, x: x.x + dx, y: x.y + dy })));
      return setDrag({ ...d, dx, dy, moved: true });
    }
    if (d.kind === 'rotate') {
      let a = (Math.atan2(p.y - d.cy, p.x - d.cx) * 180) / Math.PI + 90;
      a = ((a % 360) + 360) % 360;
      if (e.shiftKey) a = Math.round(a / 15) * 15;
      else for (const m of [0, 90, 180, 270, 360]) if (Math.abs(a - m) < 3) a = m;
      a = a % 360;
      const n = nodeOf(d.id);
      if (n) n.style.rotate = `${a}deg`;
      const turned = levelEls.find((x) => x.id === d.id);
      if (turned) follow([{ ...turned, rot: a }]);
      return setDrag({ ...d, rot: a });
    }
    if (d.kind === 'resize') {
      const el = levelEls.find((x) => x.id === d.id);
      if (!el) return;
      const r = (d.rot * Math.PI) / 180;
      const gx0 = p.x - d.start.x;
      const gy0 = p.y - d.start.y;
      const lx = gx0 * Math.cos(r) + gy0 * Math.sin(r);
      const ly = -gx0 * Math.sin(r) + gy0 * Math.cos(r);
      let nw = d.hx ? Math.max(8, d.box.w + d.hx * lx) : d.box.w;
      let nh = d.hy ? Math.max(8, d.box.h + d.hy * ly) : d.box.h;
      // Pictures, icons, equations, videos and groups keep their shape from a corner (Shift: the other way round).
      const keepsShape = el.type === 'image' || el.type === 'icon' || el.type === 'math' || el.type === 'video' || el.type === 'group';
      const keep = (e.shiftKey ? !keepsShape : keepsShape) && d.hx !== 0 && d.hy !== 0;
      if (keep) {
        const s = Math.max(nw / d.box.w, nh / d.box.h);
        nw = Math.max(8, d.box.w * s);
        nh = Math.max(8, d.box.h * s);
      }
      // The side or corner across from the handle stays where it is.
      const cxl = (d.hx * (nw - d.box.w)) / 2;
      const cyl = (d.hy * (nh - d.box.h)) / 2;
      const cx0 = d.box.x + d.box.w / 2 + cxl * Math.cos(r) - cyl * Math.sin(r);
      const cy0 = d.box.y + d.box.h / 2 + cxl * Math.sin(r) + cyl * Math.cos(r);
      let next = { x: cx0 - nw / 2, y: cy0 - nh / 2, w: nw, h: nh };
      // Unturned, its moving edges snap.
      let gxs: number[] = [];
      let gys: number[] = [];
      if (!d.rot && !e.altKey && !keep) {
        const { xs, ys, gx: gridX, gy: gridY } = snapLines([d.id], next);
        if (d.hx) {
          const edge = d.hx > 0 ? next.x + next.w : next.x;
          const sx = snapBoth([edge], xs, gridX, tol);
          if (sx.d) {
            if (d.hx > 0) next.w += sx.d;
            else {
              next.x += sx.d;
              next.w -= sx.d;
            }
            gxs = sx.at;
          }
        }
        if (d.hy) {
          const edge = d.hy > 0 ? next.y + next.h : next.y;
          const sy = snapBoth([edge], ys, gridY, tol);
          if (sy.d) {
            if (d.hy > 0) next.h += sy.d;
            else {
              next.y += sy.d;
              next.h -= sy.d;
            }
            gys = sy.at;
          }
        }
      }
      next = { x: Math.round(next.x), y: Math.round(next.y), w: Math.max(8, Math.round(next.w)), h: Math.max(8, Math.round(next.h)) };
      setGuides({ x: gxs, y: gys });
      // The part drawn again at its new size (its words wrap anew; a group's parts sized with it).
      const n = nodeOf(d.id);
      const shown = (el.type === 'group' ? { ...el, ...next, els: scaleEls(el.els, next.w / el.w, next.h / el.h) } : { ...el, ...next }) as El;
      if (n) {
        const fresh = RT.part(deck, slide, shown, { edit: true, ...PICS });
        n.replaceWith(fresh);
        RT.fit(fresh);
      }
      follow([shown]);
      return setDrag({ ...d, next });
    }
    if (d.kind === 'end') {
      const el = levelEls.find((x) => x.id === d.id);
      if (!el || el.type !== 'line') return;
      const ax = d.which === 'start' ? el.x + el.w : el.x;
      const ay = d.which === 'start' ? el.y + el.h : el.y;
      let bx = p.x;
      let by = p.y;
      // Near a part (on the slide itself), its sides' middles show, and the end sticks to the nearest within reach (Alt: none).
      let stick: Stick | undefined;
      let near: string | undefined;
      if (!scoped.length && !e.altKey) {
        const reach = 14 / k;
        let best = Infinity;
        for (const part of levelEls) {
          if (part.id === el.id || part.type === 'line') continue;
          const b = turnedBox(part);
          const room = 36 / k;
          if (p.x < b.x - room || p.x > b.x + b.w + room || p.y < b.y - room || p.y > b.y + b.h + room) continue;
          near ??= part.id;
          for (const at of SIDES) {
            const q = sidePoint(part, at);
            const dist = Math.hypot(q.x - p.x, q.y - p.y);
            if (dist <= reach && dist < best) {
              best = dist;
              stick = { el: part.id, at };
              near = part.id;
              bx = q.x;
              by = q.y;
            }
          }
        }
      }
      if (stick) {
        // Stuck: no other snapping.
      } else if (e.shiftKey) {
        const ang = Math.round(Math.atan2(by - ay, bx - ax) / (Math.PI / 4)) * (Math.PI / 4);
        const len = Math.hypot(bx - ax, by - ay);
        bx = ax + Math.cos(ang) * len;
        by = ay + Math.sin(ang) * len;
      } else if (!e.altKey) {
        const { xs, ys, gx: gridX, gy: gridY } = snapLines([d.id], { x: bx, y: by, w: 0, h: 0 });
        bx += snapBoth([bx], xs, gridX, tol).d;
        by += snapBoth([by], ys, gridY, tol).d;
      }
      const r = (v: number) => (stick ? Math.round(v * 100) / 100 : Math.round(v));
      const next = d.which === 'start' ? { x: r(bx), y: r(by), w: r(ax - bx), h: r(ay - by) } : { x: el.x, y: el.y, w: r(bx - el.x), h: r(by - el.y) };
      // Drawn as it will be: the end stuck (or free), so an elbow turns as it will.
      const shown: LineEl = { ...el, ...next };
      if (d.which === 'start') shown.from = stick;
      else shown.to = stick;
      const n = nodeOf(d.id);
      if (n) {
        const fresh = RT.part(deck, slide, shown, { edit: true, ...PICS });
        n.replaceWith(fresh);
      }
      return setDrag({ ...d, next, stick, near });
    }
  };

  const onUp = (e?: React.PointerEvent) => {
    if (e?.pointerType === 'touch') {
      touches.current.delete(e.pointerId);
      if (pinch.current) {
        if (touches.current.size < 2) pinch.current = null;
        return;
      }
    }
    const d = dragRef.current;
    setDrag(null);
    setGuides({ x: [], y: [] });
    setGaps([]);
    if (!d) return;
    if (d.kind === 'marquee') {
      const x0 = Math.min(d.start.x, d.at.x);
      const x1 = Math.max(d.start.x, d.at.x);
      const y0 = Math.min(d.start.y, d.at.y);
      const y1 = Math.max(d.start.y, d.at.y);
      if (x1 - x0 < 3 && y1 - y0 < 3) return;
      const ids = levelEls
        .filter((e) => {
          const b = boxOf(e);
          return b.x < x1 && b.x + b.w > x0 && b.y < y1 && b.y + b.h > y0;
        })
        .map((e) => e.id);
      onSel([...new Set([...d.add, ...ids])]);
      return;
    }
    if (d.kind === 'guide') {
      change((dk) => {
        const list = [...(dk.guides?.[d.axis] ?? [])];
        if (d.index !== null) list.splice(d.index, 1);
        if (!d.off) list.push(d.at);
        const other = d.axis === 'x' ? dk.guides?.y : dk.guides?.x;
        const next = { ...(dk.guides ?? {}), [d.axis]: [...new Set(list)].sort((a, b) => a - b) };
        if (!next[d.axis]?.length) delete next[d.axis];
        const { guides: _g, ...rest } = dk;
        return next.x?.length || next.y?.length || other?.length ? { ...rest, guides: next } : rest;
      });
      return;
    }
    if (d.kind === 'crop') return;
    if (d.kind === 'move') {
      for (const id of d.ids) {
        const n = nodeOf(id);
        if (n) n.style.translate = '';
      }
      if (!d.moved || (Math.abs(d.dx) < 0.5 && Math.abs(d.dy) < 0.5)) return;
      // A connector moved lets go of the parts that stay where they are (moved with them, it stays stuck).
      const moving = new Set(everyEl(levelEls.filter((x) => d.ids.includes(x.id))).map((x) => x.id));
      change(
        setEls(deck, index, d.ids, (e) => {
          const at = { ...e, x: Math.round(e.x + d.dx), y: Math.round(e.y + d.dy) };
          if (at.type !== 'line' || (!at.from && !at.to)) return at;
          const { from, to, ...rest } = at;
          return { ...rest, ...(from && moving.has(from.el) ? { from } : {}), ...(to && moving.has(to.el) ? { to } : {}) };
        }),
      );
      return;
    }
    if (d.kind === 'rotate') {
      change(setEls(deck, index, [d.id], (e) => ({ ...e, rot: d.rot ? Math.round(d.rot * 10) / 10 : undefined })));
      return;
    }
    if (d.kind === 'resize') {
      const n = d.next;
      if (n.x === d.box.x && n.y === d.box.y && n.w === d.box.w && n.h === d.box.h) return;
      change(setEls(deck, index, [d.id], (e) => (e.type === 'group' ? { ...e, ...n, els: scaleEls(e.els, n.w / e.w, n.h / e.h) } : { ...e, ...n })));
      return;
    }
    if (d.kind === 'end')
      change(
        setEls(deck, index, [d.id], (e) => {
          if (e.type !== 'line') return e;
          const { from, to, ...rest } = e;
          const ends = d.which === 'start' ? { ...(d.stick ? { from: d.stick } : {}), ...(to ? { to } : {}) } : { ...(from ? { from } : {}), ...(d.stick ? { to: d.stick } : {}) };
          return { ...rest, ...d.next, ...ends };
        }),
      );
  };

  const editCell = (el: TableEl, td: HTMLElement) => {
    const r = Number(td.dataset.r);
    const c = Number(td.dataset.c);
    const wr = wrap.current!.getBoundingClientRect();
    const tr = td.getBoundingClientRect();
    setCell({ id: el.id, r, c, box: { x: tr.left - wr.left + wrap.current!.scrollLeft, y: tr.top - wr.top + wrap.current!.scrollTop, w: tr.width, h: tr.height }, text: el.rows[r]?.[c] ?? '' });
    onCellSel?.({ id: el.id, r0: r, c0: c, r1: r, c1: c });
  };

  const onDouble = (e: React.MouseEvent) => {
    if (readOnly || crop) return;
    const { id, inside } = hit(e.clientX, e.clientY);
    if (!inside || !id) return;
    const el = levelEls.find((x) => x.id === id);
    if (!el) return;
    if (el.type === 'group') {
      // Into the group: the part of it under the pointer is picked.
      const root = content.current?.firstElementChild;
      const groupNode = nodeOf(el.id);
      for (const n of document.elementsFromPoint(e.clientX, e.clientY)) {
        let at = (n as HTMLElement).closest?.('.ns-el') as HTMLElement | null;
        while (at && at.parentElement !== groupNode && root?.contains(at)) at = at.parentElement?.closest('.ns-el') as HTMLElement | null;
        if (at?.parentElement === groupNode) {
          onScope([...scope.slice(0, scoped.length), el.id]);
          onSel([at.dataset.id ?? '']);
          return;
        }
      }
      onScope([...scope.slice(0, scoped.length), el.id]);
      onSel([]);
      return;
    }
    if (el.type === 'text' || el.type === 'shape') {
      dblAt.current = { x: e.clientX, y: e.clientY };
      onSel([el.id]);
      onEditing(el.id);
    } else if (el.type === 'image') {
      if (el.src && !el.lock) {
        onSel([el.id]);
        onCropping(el.id);
      } else onReplaceImage?.(el.id);
    } else if (el.type === 'chart') onChartData?.(el.id);
    else if (el.type === 'math' || el.type === 'icon' || el.type === 'video') onOpen?.(el.id);
    else if (el.type === 'table') {
      const td = (document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.tagName === 'TD') as HTMLElement | undefined) ?? null;
      if (td) editCell(el, td);
    }
  };

  const saveCell = (next?: { r: number; c: number; back?: boolean }) => {
    if (!cell) return;
    const el = elById(cell.id) as TableEl | undefined;
    if (el && (el.rows[cell.r]?.[cell.c] ?? '') !== cell.text) {
      const rows = el.rows.map((row, ri) => (ri === cell.r ? row.map((v, ci) => (ci === cell.c ? cell.text : v)) : row));
      change((d) => setEls(d, index, [cell.id], (x) => ({ ...x, rows }) as El), `cell:${cell.id}`);
    }
    setCell(null);
    if (next && el) {
      // The next cell there is (not one merged into another), once the table is drawn again.
      const cols = Math.max(1, ...el.rows.map((r) => r.length));
      let { r, c } = next;
      for (let guard = 0; guard < 400 && r >= 0 && r < el.rows.length; guard++) {
        const m = mergeAt(el, r, c);
        if (!m || (m.r === r && m.c === c)) break;
        c += next.back ? -1 : 1;
        if (c >= cols) {
          c = 0;
          r++;
        } else if (c < 0) {
          c = cols - 1;
          r--;
        }
      }
      if (r < 0 || r >= el.rows.length) return;
      requestAnimationFrame(() => {
        const td = nodeOf(cell.id)?.querySelector<HTMLElement>(`td[data-r="${r}"][data-c="${c}"]`);
        const fresh = elById(cell.id);
        if (td && fresh?.type === 'table') editCell(fresh, td);
      });
    }
  };

  // ---- what is drawn over the slide ------------------------------------------------------------------------
  const live = (e: El): El => {
    const d = drag;
    if (!d) return e;
    if (d.kind === 'move' && d.ids.includes(e.id)) return { ...e, x: e.x + d.dx, y: e.y + d.dy };
    if (d.kind === 'resize' && d.id === e.id) return { ...e, ...d.next };
    if (d.kind === 'rotate' && d.id === e.id) return { ...e, rot: d.rot };
    if (d.kind === 'end' && d.id === e.id) return { ...e, ...d.next };
    return e;
  };
  const picked = levelEls.filter((e) => sel.includes(e.id)).map(live);
  const one = picked.length === 1 && !crop ? picked[0] : null;
  const S = (v: number) => v * k;

  const outline = (e: El, strong: boolean) => {
    if (e.type === 'line') {
      // Along its path: an elbow connector's right angles too.
      const pts = e.route === 'elbow' ? elbowPoints(e.x, e.y, e.x + e.w, e.y + e.h, e.from?.at, e.to?.at) : [[e.x, e.y], [e.x + e.w, e.y + e.h]];
      return (
        <svg key={e.id} className="pointer-events-none absolute top-0 left-0 overflow-visible" width={1} height={1}>
          <polyline points={pts.map((q) => `${S(q[0])},${S(q[1])}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth={strong ? 2 : 1} strokeDasharray={strong ? undefined : '4 3'} />
        </svg>
      );
    }
    return (
      <div
        key={e.id}
        className={cx('pointer-events-none absolute', strong ? 'outline-2 outline-accent' : 'outline-1 outline-accent/70 outline-dashed')}
        style={{ left: S(e.x), top: S(e.y), width: S(e.w), height: S(e.h), rotate: e.rot ? `${e.rot}deg` : undefined, outlineStyle: strong ? 'solid' : 'dashed' }}
      />
    );
  };

  const handles = (e: El) => {
    if (readOnly || e.lock || editing === e.id) return null;
    if (e.type === 'line') {
      return (['start', 'end'] as const).map((which) => {
        const x = which === 'start' ? e.x : e.x + e.w;
        const y = which === 'start' ? e.y : e.y + e.h;
        return (
          <div
            key={which}
            onPointerDown={(ev) => begin(ev, { kind: 'end', id: e.id, which, next: { x: e.x, y: e.y, w: e.w, h: e.h } })}
            className="pointer-events-auto absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border-2 border-accent bg-white shadow pointer-coarse:h-5 pointer-coarse:w-5"
            style={{ left: S(x), top: S(y) }}
          />
        );
      });
    }
    const box = { x: e.x, y: e.y, w: e.w, h: e.h };
    const rot = e.rot ?? 0;
    return (
      <div className="pointer-events-none absolute" style={{ left: S(e.x), top: S(e.y), width: S(e.w), height: S(e.h), rotate: rot ? `${rot}deg` : undefined }}>
        {HANDLES.map(([hx, hy]) => (
          <div
            key={`${hx},${hy}`}
            onPointerDown={(ev) => begin(ev, { kind: 'resize', id: e.id, hx, hy, start: toLocal(ev.clientX, ev.clientY), box, rot, next: box })}
            className={cx('pointer-events-auto absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-[3px] border-[1.5px] border-accent bg-white shadow-sm', 'pointer-coarse:h-4 pointer-coarse:w-4')}
            style={{ left: `${((hx + 1) / 2) * 100}%`, top: `${((hy + 1) / 2) * 100}%`, cursor: CURSOR[`${hx},${hy}`] }}
          />
        ))}
        <div className="absolute left-1/2 h-5 w-px -translate-x-1/2 bg-accent" style={{ top: -20 }} />
        <div
          title="Turn it (Shift: by 15°)"
          onPointerDown={(ev) => begin(ev, { kind: 'rotate', id: e.id, cx: e.x + e.w / 2, cy: e.y + e.h / 2, rot })}
          className="pointer-events-auto absolute left-1/2 h-3.5 w-3.5 -translate-x-1/2 cursor-grab rounded-full border-[1.5px] border-accent bg-white shadow-sm pointer-coarse:h-5 pointer-coarse:w-5"
          style={{ top: -27 }}
        />
      </div>
    );
  };

  /** The crop frame over the whole picture, dimmed outside it, with its handles. */
  const cropView = () => {
    if (!crop || !cropImg) return null;
    const { box, full } = crop;
    const flip = cropImg.flipH || cropImg.flipV ? `${cropImg.flipH ? -1 : 1} ${cropImg.flipV ? -1 : 1}` : undefined;
    const pic = (
      <img
        src={crop.url}
        alt=""
        draggable={false}
        className="absolute max-w-none select-none"
        style={{ left: S(full.x - box.x), top: S(full.y - box.y), width: S(full.w), height: S(full.h), scale: flip, filter: (nodeOf(cropImg.id)?.querySelector('img') as HTMLImageElement | null)?.style.filter || undefined }}
      />
    );
    return (
      <Nest frames={[...frames, frameOf(cropImg)]} k={k}>
        <div className="pointer-events-auto absolute cursor-move" style={{ left: S(full.x), top: S(full.y), width: S(full.w), height: S(full.h) }}>
          <img src={crop.url} alt="" draggable={false} className="absolute inset-0 h-full w-full max-w-none opacity-35 select-none" style={{ scale: flip }} />
        </div>
        <div className="pointer-events-auto absolute cursor-move overflow-hidden shadow-[0_0_0_9999px_rgba(0,0,0,.35)]" style={{ left: S(box.x), top: S(box.y), width: S(box.w), height: S(box.h) }}>
          {pic}
        </div>
        <div className="pointer-events-none absolute outline-2 outline-white [outline-style:solid]" style={{ left: S(box.x), top: S(box.y), width: S(box.w), height: S(box.h), boxShadow: '0 0 0 1px rgba(0,0,0,.5)' }}>
          {HANDLES.map(([hx, hy]) => (
            <div
              key={`${hx},${hy}`}
              onPointerDown={(ev) => {
                const q = unframe(toSlide(ev.clientX, ev.clientY), [...frames, frameOf(cropImg)]);
                begin(ev, { kind: 'crop', hx, hy, start: q, box, full });
              }}
              className={cx(
                'pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 border-black/60 bg-white',
                hx && hy ? 'h-4 w-4 rounded-[2px] border' : hx ? 'h-6 w-2 rounded-full border' : 'h-2 w-6 rounded-full border',
                'pointer-coarse:scale-125',
              )}
              style={{ left: `${((hx + 1) / 2) * 100}%`, top: `${((hy + 1) / 2) * 100}%`, cursor: CURSOR[`${hx},${hy}`] }}
            />
          ))}
        </div>
      </Nest>
    );
  };

  /**
   * The rulers stay at the edges of the view while a zoomed slide is scrolled: the top one at its top (lined up with the
   * slide across), the left one at its left, a corner where they meet. Placed as the view scrolls, without drawing again.
   */
  const pinRulers = () => {
    const el = wrap.current;
    if (!el) return;
    const top = Math.max(stage.top - RULER - 4, el.scrollTop);
    const left = Math.max(stage.left - RULER - 4, el.scrollLeft);
    if (rulerX.current) rulerX.current.style.top = `${top}px`;
    if (rulerY.current) rulerY.current.style.left = `${left}px`;
    if (corner.current) {
      corner.current.style.top = `${top}px`;
      corner.current.style.left = `${left}px`;
      // Only when they meet at the view's corner, over the slide.
      corner.current.style.display = top > stage.top - RULER - 4 && left > stage.left - RULER - 4 ? 'block' : 'none';
    }
  };
  useLayoutEffect(pinRulers);

  /** A ruler's ticks: every so many pixels of the slide, numbered every hundred or so. */
  const ruler = (axis: 'x' | 'y') => {
    const len = axis === 'x' ? W : H;
    const step = [5, 10, 20, 50, 100, 200].find((s) => s * k >= 7) ?? 200;
    const label = [50, 100, 200, 500, 1000].find((s) => s * k >= 44) ?? 1000;
    const ticks: ReactNode[] = [];
    for (let v = 0; v <= len; v += step) {
      const big = v % label === 0;
      const at = v * k;
      ticks.push(axis === 'x' ? <line key={v} x1={at} x2={at} y1={big ? 4 : RULER - 5} y2={RULER} /> : <line key={v} y1={at} y2={at} x1={big ? 4 : RULER - 5} x2={RULER} />);
      if (big && v > 0)
        ticks.push(
          axis === 'x' ? (
            <text key={`t${v}`} x={at + 3} y={10} className="fill-fg-3 stroke-none text-[9px]">
              {v}
            </text>
          ) : (
            <text key={`t${v}`} x={10} y={at + 3} className="fill-fg-3 stroke-none text-[9px]" transform={`rotate(-90 10 ${at + 3})`} textAnchor="end">
              {v}
            </text>
          ),
        );
    }
    return (
      <svg
        ref={axis === 'x' ? rulerX : rulerY}
        className={cx('absolute z-[6] bg-bg-2 stroke-fg-3/60 select-none', axis === 'x' ? 'cursor-s-resize' : 'cursor-e-resize')}
        style={axis === 'x' ? { left: stage.left, top: stage.top - RULER - 4, width: stage.w, height: RULER } : { left: stage.left - RULER - 4, top: stage.top, width: RULER, height: stage.h }}
        onPointerDown={(ev) => {
          // A guide out of the ruler: across from the top one, down from the left one.
          const s = toSlide(ev.clientX, ev.clientY);
          begin(ev, { kind: 'guide', axis: axis === 'x' ? 'y' : 'x', index: null, at: Math.round(axis === 'x' ? s.y : s.x), off: true });
        }}
        aria-hidden
      >
        <title>Drag a guide out</title>
        {ticks}
      </svg>
    );
  };

  const m = drag?.kind === 'marquee' ? drag : null;
  const gd = drag?.kind === 'guide' ? drag : null;
  // Snap lines go across the slide (in a turned group, well past its box).
  const span = straight ? { x0: -origin.x, x1: W - origin.x, y0: -origin.y, y1: H - origin.y } : { x0: -2000, x1: 3300, y0: -2000, y1: 3000 };
  const shownGuides = rulers ? { x: deck.guides?.x ?? [], y: deck.guides?.y ?? [] } : { x: [], y: [] };
  // Where an agent's words are arriving: the part (the group it is in, for a part of a group), or the whole slide.
  const agentBox = (sl: Slide | undefined, id: string) => {
    const e = id && sl ? sl.els.find((x) => x.id === id || (x.type === 'group' && everyEl(x.els).some((y) => y.id === id))) : undefined;
    const box = e && e.type !== 'line' ? { left: S(e.x) - 3, top: S(e.y) - 3, width: S(e.w) + 6, height: S(e.h) + 6, rotate: e.rot ? `${e.rot}deg` : undefined } : { left: 0, top: 0, width: stage.w, height: stage.h };
    return (
      <div aria-hidden className="pointer-events-none absolute z-[6] rounded-[3px] outline-2 outline-busy [outline-style:solid]" style={box}>
        <span className="absolute bottom-full left-0 mb-0.5 rounded-[3px] bg-busy px-1 text-[10px] leading-[14px] font-semibold whitespace-nowrap text-bg">Agent</span>
      </div>
    );
  };
  return (
    <div
      ref={wrap}
      tabIndex={-1}
      data-slide-canvas
      data-k={k}
      className={cx('relative h-full w-full touch-none bg-bg-2 outline-none select-none', zoomed ? 'overflow-auto' : 'overflow-hidden', painting && 'cursor-copy')}
      onScroll={pinRulers}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onDoubleClick={onDouble}
      onContextMenu={(e) => {
        if (!onMenu || editing || crop) return;
        e.preventDefault();
        const { id, inside } = hit(e.clientX, e.clientY);
        if (!inside) onScope([]);
        if (id && !sel.includes(id)) onSel([id]);
        onMenu({ x: e.clientX, y: e.clientY }, id);
      }}
    >
      <div className="relative" style={{ width: sheet.w, height: sheet.h }}>
        {showRulers && ruler('x')}
        {showRulers && ruler('y')}
        {showRulers && <div ref={corner} className="absolute z-[7] hidden bg-bg-2" style={{ width: RULER, height: RULER }} />}
        <div ref={stageRef} className="absolute shadow-[0_0_0_1px_var(--line-2),0_10px_30px_rgba(0,0,0,.18)]" style={{ left: stage.left, top: stage.top, width: stage.w, height: stage.h }}>
          <div ref={content} className="absolute top-0 left-0 origin-top-left" style={{ width: W, height: H, transform: `scale(${k})` }} />
          {grid.show && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{ backgroundImage: 'linear-gradient(to right, rgba(127,127,127,.28) 1px, transparent 1px), linear-gradient(to bottom, rgba(127,127,127,.28) 1px, transparent 1px)', backgroundSize: `${grid.size * k}px ${grid.size * k}px` }}
            />
          )}
          {hl.map((b, i) => (
            <div key={i} className={cx('pointer-events-none absolute rounded-[2px]', b.current ? 'bg-[#ff922b]/40 outline-2 outline-[#ff922b]' : 'bg-[#ffd43b]/35')} style={{ left: b.x - 1, top: b.y, width: b.w + 2, height: b.h }} />
          ))}
          {cellBoxes.map((b, i) => (
            <div key={`c${i}`} className="pointer-events-none absolute bg-accent/20 outline-1 outline-accent" style={{ left: b.x, top: b.y, width: b.w, height: b.h }} />
          ))}
          {shownGuides.x.map((x, i) => (
            <div
              key={`gx${x}`}
              title="Drag it back to the ruler to take it away"
              onPointerDown={(ev) => begin(ev, { kind: 'guide', axis: 'x', index: i, at: x, off: false })}
              className={cx('absolute -top-1 -bottom-1 w-[7px] -translate-x-[3px] cursor-ew-resize', gd?.axis === 'x' && gd.index === i && 'opacity-0')}
              style={{ left: Math.round(S(x)) }}
            >
              <div className="mx-auto h-full w-px" style={{ background: GUIDE }} />
            </div>
          ))}
          {shownGuides.y.map((y, i) => (
            <div
              key={`gy${y}`}
              title="Drag it back to the ruler to take it away"
              onPointerDown={(ev) => begin(ev, { kind: 'guide', axis: 'y', index: i, at: y, off: false })}
              className={cx('absolute -right-1 -left-1 h-[7px] -translate-y-[3px] cursor-ns-resize', gd?.axis === 'y' && gd.index === i && 'opacity-0')}
              style={{ top: Math.round(S(y)) }}
            >
              <div className="my-[3px] h-px w-full" style={{ background: GUIDE }} />
            </div>
          ))}
          {gd && (
            <div
              className={cx('pointer-events-none absolute', gd.off && 'opacity-40')}
              style={gd.axis === 'x' ? { left: S(gd.at), top: -6, bottom: -6, width: 1, background: GUIDE } : { top: S(gd.at), left: -6, right: -6, height: 1, background: GUIDE }}
            >
              <span className="absolute rounded bg-[#14b8d4] px-1 text-[10.5px] text-white tabular-nums" style={gd.axis === 'x' ? { top: 0, left: 4 } : { left: 0, top: 4 }}>
                {gd.at}
              </span>
            </div>
          )}
          {scoped.length > 0 && (
            <Nest frames={frames.slice(0, -1)} k={k}>
              {(() => {
                const g = frames[frames.length - 1];
                return <div className="pointer-events-none absolute outline-1 outline-accent/60 outline-dashed" style={{ left: S(g.x), top: S(g.y), width: S(g.w), height: S(g.h), rotate: g.rot ? `${g.rot}deg` : undefined, outlineOffset: 3 }} />;
              })()}
            </Nest>
          )}
          {agent !== undefined && agent !== null && agentBox(slide, agent)}
          <div className="pointer-events-none absolute inset-0">
            <Nest frames={frames} k={k}>
              {!crop && picked.map((e) => outline(e, picked.length === 1))}
              {one && handles(one)}
              {guides.x.map((x) => (
                <div key={`sx${x}`} className="pointer-events-none absolute w-px" style={{ left: Math.round(S(x)), top: S(span.y0), height: S(span.y1 - span.y0), background: SNAP }} />
              ))}
              {guides.y.map((y) => (
                <div key={`sy${y}`} className="pointer-events-none absolute h-px" style={{ top: Math.round(S(y)), left: S(span.x0), width: S(span.x1 - span.x0), background: SNAP }} />
              ))}
              {gaps.map((g, i) => {
                const across = g.y1 === g.y2;
                return (
                  <div key={`g${i}`} className="pointer-events-none absolute" style={across ? { left: S(g.x1), top: S(g.y1), width: S(g.x2 - g.x1), height: 0 } : { left: S(g.x1), top: S(g.y1), width: 0, height: S(g.y2 - g.y1) }}>
                    <div className={cx('absolute', across ? 'inset-x-0 top-0 h-px' : 'inset-y-0 left-0 w-px')} style={{ background: SNAP }} />
                    <div className={cx('absolute', across ? '-top-1 left-0 h-2 w-px' : '-left-1 top-0 h-px w-2')} style={{ background: SNAP }} />
                    <div className={cx('absolute', across ? '-top-1 right-0 h-2 w-px' : '-left-1 bottom-0 h-px w-2')} style={{ background: SNAP }} />
                    <span
                      className="absolute rounded px-1 text-[10.5px] leading-[15px] text-white tabular-nums"
                      style={{ background: SNAP, ...(across ? { left: '50%', top: 3, transform: 'translateX(-50%)' } : { top: '50%', left: 4, transform: 'translateY(-50%)' }) }}
                    >
                      {g.n}
                    </span>
                  </div>
                );
              })}
              {/* While a line's end is dragged near a part: the middles of its sides, the one it would stick to filled. */}
              {drag?.kind === 'end' &&
                drag.near &&
                (() => {
                  const part = levelEls.find((x) => x.id === drag.near);
                  return part
                    ? SIDES.map((at) => {
                        const q = sidePoint(part, at);
                        const on = drag.stick?.el === part.id && drag.stick.at === at;
                        return (
                          <div
                            key={`cx${at}`}
                            className={cx('pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-accent shadow-sm', on ? 'scale-125 bg-accent' : 'bg-white')}
                            style={{ left: S(q.x), top: S(q.y) }}
                          />
                        );
                      })
                    : null;
                })()}
              {m && (
                <div
                  className="pointer-events-none absolute border border-accent bg-accent/10"
                  style={{ left: S(Math.min(m.start.x, m.at.x)), top: S(Math.min(m.start.y, m.at.y)), width: S(Math.abs(m.at.x - m.start.x)), height: S(Math.abs(m.at.y - m.start.y)) }}
                />
              )}
            </Nest>
          </div>
          {cropView()}
          {pins?.map((p) => (
            <button
              key={p.key}
              type="button"
              title="Comments"
              aria-label="Comments"
              onPointerDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onPin?.(p.ids);
              }}
              className={cx(
                'absolute z-[5] flex h-6 min-w-6 -translate-y-full items-center justify-center gap-0.5 rounded-full px-1.5 text-[11px] font-semibold shadow-md tabular-nums pointer-coarse:h-8 pointer-coarse:min-w-8',
                // Near the slide's right edge it opens to the left of its point, staying on the slide.
                p.x > W - 64 ? '-translate-x-full rounded-br-[4px]' : 'rounded-bl-[4px]',
                p.active ? 'bg-accent text-accent-fg ring-2 ring-accent/40' : 'border border-line bg-elevated text-fg-2 hover:text-fg',
              )}
              style={{ left: p.x > W - 64 ? S(p.x) + 2 : S(p.x) - 2, top: S(p.y) + 2 }}
            >
              <MessageSquare size={12} />
              {p.ids.length > 1 && p.ids.length}
            </button>
          ))}
        </div>
        {cell && (
          <textarea
            autoFocus
            value={cell.text}
            onChange={(e) => setCell({ ...cell, text: e.target.value })}
            onBlur={() => saveCell()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') setCell(null);
              else if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                saveCell({ r: cell.r + 1, c: cell.c });
              } else if (e.key === 'Tab') {
                e.preventDefault();
                const el = elById(cell.id) as TableEl | undefined;
                const cols = el?.rows[0]?.length ?? 1;
                const n = cell.c + (e.shiftKey ? -1 : 1);
                saveCell(n >= cols ? { r: cell.r + 1, c: 0 } : n < 0 ? { r: Math.max(0, cell.r - 1), c: cols - 1, back: true } : { r: cell.r, c: n, back: e.shiftKey });
              }
            }}
            className="absolute z-10 resize-none rounded-sm border-2 border-accent bg-white px-1.5 py-1 text-[13px] leading-snug text-black outline-none"
            style={{ left: cell.box.x, top: cell.box.y, width: Math.max(80, cell.box.w), height: Math.max(32, cell.box.h) }}
          />
        )}
      </div>
      {children}
    </div>
  );
});
