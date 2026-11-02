// The slide being edited, as large as there is room for: click a part to pick it (Shift adds to the pick, a drag
// across empty space picks what it touches), drag it to move it (it snaps to the slide's middle and edges and to
// other parts, with guides; Alt does not snap, Shift keeps it straight), its handles to size or turn it, a line's
// ends to move them. Double-click words to change them in place, a table's cell to type in it, a picture to put
// another in its place. The slide itself is drawn by the runtime as it shows anywhere; this draws what is picked
// over it, and moves parts while they are dragged without drawing the slide again.
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Deck, El, Para, TableEl, TextProps } from '@shared/slides';
import { cx } from '../../../components/ui';
import { boxOf, heightOf, setEls, W } from './ops';
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
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Drag =
  | { kind: 'move'; ids: string[]; start: { x: number; y: number }; dx: number; dy: number; moved: boolean }
  | { kind: 'resize'; id: string; hx: number; hy: number; start: { x: number; y: number }; box: Box; rot: number; next: Box }
  | { kind: 'rotate'; id: string; cx: number; cy: number; rot: number }
  | { kind: 'end'; id: string; which: 'start' | 'end'; next: { x: number; y: number; w: number; h: number } }
  | { kind: 'marquee'; start: { x: number; y: number }; at: { x: number; y: number }; add: string[] };

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
    /** Right-click (or a long press) on a part or the slide. */
    onMenu?: (at: { x: number; y: number }, id: string | null) => void;
    /** A picture was double-clicked: put another in its place. */
    onReplaceImage?: (id: string) => void;
    /** A chart was double-clicked: its numbers. */
    onChartData?: (id: string) => void;
    /** Text selected while editing changed (for the toolbar's state). */
    onTextSelection?: () => void;
    children?: ReactNode;
  }
>(function SlideCanvas({ deck, index, sel, onSel, editing, onEditing, change, fonts, readOnly, onMenu, onReplaceImage, onChartData, onTextSelection, children }, handle) {
  const H = heightOf(deck);
  const slide = deck.slides[index];
  const wrap = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [cell, setCell] = useState<{ id: string; r: number; c: number; box: Box; text: string } | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  const dblAt = useRef<{ x: number; y: number } | null>(null);
  const editingRef = useRef(editing);
  editingRef.current = editing;

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const pad = size.w < 520 ? 10 : 28;
  const k = size.w ? Math.max(0.05, Math.min((size.w - pad * 2) / W, (size.h - pad * 2) / H)) : 0.5;
  const stage = { left: Math.round((size.w - W * k) / 2), top: Math.round((size.h - H * k) / 2), w: W * k, h: H * k };

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
  }, [slide, deck.theme, deck.ratio, index, fonts, editing]);

  const nodeOf = (id: string) => content.current?.querySelector<HTMLElement>(`.ns-el[data-id="${CSS.escape(id)}"]`) ?? null;

  /** A point on the screen in the slide's pixels. */
  const toSlide = (clientX: number, clientY: number) => {
    const r = wrap.current!.getBoundingClientRect();
    return { x: (clientX - r.left - stage.left) / k, y: (clientY - r.top - stage.top) / k };
  };

  /** The part under a point, topmost first (a line only near the line itself). */
  const hit = (clientX: number, clientY: number): string | null => {
    const p = toSlide(clientX, clientY);
    for (const n of document.elementsFromPoint(clientX, clientY)) {
      const part = (n as HTMLElement).closest?.('.ns-el') as HTMLElement | null;
      if (!part || !content.current?.contains(part)) continue;
      const el = slide?.els.find((e) => e.id === part.dataset.id);
      if (el?.type === 'line') {
        const dx = el.w;
        const dy = el.h;
        const len2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((p.x - el.x) * dx + (p.y - el.y) * dy) / len2));
        if (Math.hypot(p.x - (el.x + t * dx), p.y - (el.y + t * dy)) > Math.max(10 / k, el.width)) continue;
      }
      return part.dataset.id ?? null;
    }
    return null;
  };

  // ---- changing words in place ---------------------------------------------------------------------------
  const editBox = () => (editing ? (nodeOf(editing)?.querySelector<HTMLElement>('.ns-txt') ?? null) : null);
  const readText = () => {
    const box = editBox();
    const el = slide?.els.find((e) => e.id === editing);
    if (!box || !el || (el.type !== 'text' && el.type !== 'shape')) return null;
    return { id: el.id, paras: RT.read(box, el) };
  };
  const stop = () => {
    const got = readText();
    const box = editBox();
    if (box) box.removeAttribute('contenteditable');
    if (got) {
      const el = slide.els.find((e) => e.id === got.id) as TextProps | undefined;
      if (el && JSON.stringify(el.paras) !== JSON.stringify(got.paras)) change((d) => setEls(d, index, [got.id], (e) => ({ ...e, paras: got.paras }) as El), `text:${got.id}`);
    }
    onEditing(null);
  };
  useImperativeHandle(handle, () => ({
    readText,
    editBox,
    stopEditing: stop,
    paraOp: (f) => paraOp(f),
  }));

  const paraOp = (f: (paras: Para[], picked: number[]) => Para[]) => {
    const box = editBox();
    const el = slide?.els.find((e) => e.id === editing);
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
    const box = node?.querySelector<HTMLElement>('.ns-txt');
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
      e.stopPropagation();
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

  // ---- pointers ---------------------------------------------------------------------------------------------
  const others = (ids: string[]) => slide.els.filter((e) => !ids.includes(e.id)).map(boxOf);
  const snapLines = (ids: string[]) => {
    const xs = [0, W / 2, W];
    const ys = [0, H / 2, H];
    for (const b of others(ids)) {
      xs.push(b.x, b.x + b.w / 2, b.x + b.w);
      ys.push(b.y, b.y + b.h / 2, b.y + b.h);
    }
    return { xs, ys };
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

  const begin = (e: React.PointerEvent, d: Drag) => {
    if (readOnly) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDrag(d);
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || editing || cell) return;
    wrap.current?.focus({ preventScroll: true });
    const id = hit(e.clientX, e.clientY);
    const p = toSlide(e.clientX, e.clientY);
    if (!id) {
      if (!e.shiftKey) onSel([]);
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
    }
    const movable = ids.filter((x) => !slide.els.find((el) => el.id === x)?.lock);
    if (movable.length) begin(e, { kind: 'move', ids: movable, start: p, dx: 0, dy: 0, moved: false });
  };

  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const p = toSlide(e.clientX, e.clientY);
    const tol = 6 / k;
    if (d.kind === 'marquee') return setDrag({ ...d, at: p });
    if (d.kind === 'move') {
      let dx = p.x - d.start.x;
      let dy = p.y - d.start.y;
      if (!d.moved && Math.hypot(dx * k, dy * k) < 3) return;
      if (e.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      const boxes = slide.els.filter((x) => d.ids.includes(x.id)).map(boxOf);
      const bx = Math.min(...boxes.map((b) => b.x)) + dx;
      const by = Math.min(...boxes.map((b) => b.y)) + dy;
      const bw = Math.max(...boxes.map((b) => b.x + b.w)) - Math.min(...boxes.map((b) => b.x));
      const bh = Math.max(...boxes.map((b) => b.y + b.h)) - Math.min(...boxes.map((b) => b.y));
      let gx: number[] = [];
      let gy: number[] = [];
      if (!e.altKey) {
        const { xs, ys } = snapLines(d.ids);
        const sx = snap([bx, bx + bw / 2, bx + bw], xs, tol);
        const sy = snap([by, by + bh / 2, by + bh], ys, tol);
        if (!e.shiftKey || dx !== 0) dx += sx.d;
        if (!e.shiftKey || dy !== 0) dy += sy.d;
        gx = sx.at;
        gy = sy.at;
      }
      setGuides({ x: gx, y: gy });
      for (const id of d.ids) {
        const n = nodeOf(id);
        if (n) n.style.translate = `${dx}px ${dy}px`;
      }
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
      return setDrag({ ...d, rot: a });
    }
    if (d.kind === 'resize') {
      const el = slide.els.find((x) => x.id === d.id);
      if (!el) return;
      const r = (d.rot * Math.PI) / 180;
      const gx = p.x - d.start.x;
      const gy = p.y - d.start.y;
      const lx = gx * Math.cos(r) + gy * Math.sin(r);
      const ly = -gx * Math.sin(r) + gy * Math.cos(r);
      let nw = d.hx ? Math.max(8, d.box.w + d.hx * lx) : d.box.w;
      let nh = d.hy ? Math.max(8, d.box.h + d.hy * ly) : d.box.h;
      const keep = (e.shiftKey ? el.type !== 'image' : el.type === 'image') && d.hx !== 0 && d.hy !== 0;
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
        const { xs, ys } = snapLines([d.id]);
        if (d.hx) {
          const edge = d.hx > 0 ? next.x + next.w : next.x;
          const sx = snap([edge], xs, tol);
          if (sx.at.length) {
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
          const sy = snap([edge], ys, tol);
          if (sy.at.length) {
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
      // The part drawn again at its new size (its words wrap anew).
      const n = nodeOf(d.id);
      if (n) {
        const fresh = RT.part(deck, slide, { ...el, ...next } as El, { edit: true, ...PICS });
        n.replaceWith(fresh);
        RT.fit(fresh);
      }
      return setDrag({ ...d, next });
    }
    if (d.kind === 'end') {
      const el = slide.els.find((x) => x.id === d.id);
      if (!el || el.type !== 'line') return;
      const ax = d.which === 'start' ? el.x + el.w : el.x;
      const ay = d.which === 'start' ? el.y + el.h : el.y;
      let bx = p.x;
      let by = p.y;
      if (e.shiftKey) {
        const ang = Math.round(Math.atan2(by - ay, bx - ax) / (Math.PI / 4)) * (Math.PI / 4);
        const len = Math.hypot(bx - ax, by - ay);
        bx = ax + Math.cos(ang) * len;
        by = ay + Math.sin(ang) * len;
      } else if (!e.altKey) {
        const { xs, ys } = snapLines([d.id]);
        bx += snap([bx], xs, tol).d;
        by += snap([by], ys, tol).d;
      }
      const next = d.which === 'start' ? { x: Math.round(bx), y: Math.round(by), w: Math.round(ax - bx), h: Math.round(ay - by) } : { x: el.x, y: el.y, w: Math.round(bx - el.x), h: Math.round(by - el.y) };
      const n = nodeOf(d.id);
      if (n) {
        const fresh = RT.part(deck, slide, { ...el, ...next }, { edit: true, ...PICS });
        n.replaceWith(fresh);
      }
      return setDrag({ ...d, next });
    }
  };

  const onUp = () => {
    const d = dragRef.current;
    setDrag(null);
    setGuides({ x: [], y: [] });
    if (!d) return;
    if (d.kind === 'marquee') {
      const x0 = Math.min(d.start.x, d.at.x);
      const x1 = Math.max(d.start.x, d.at.x);
      const y0 = Math.min(d.start.y, d.at.y);
      const y1 = Math.max(d.start.y, d.at.y);
      if (x1 - x0 < 3 && y1 - y0 < 3) return;
      const ids = slide.els
        .filter((e) => {
          const b = boxOf(e);
          return b.x < x1 && b.x + b.w > x0 && b.y < y1 && b.y + b.h > y0;
        })
        .map((e) => e.id);
      onSel([...new Set([...d.add, ...ids])]);
      return;
    }
    if (d.kind === 'move') {
      for (const id of d.ids) {
        const n = nodeOf(id);
        if (n) n.style.translate = '';
      }
      if (!d.moved || (Math.abs(d.dx) < 0.5 && Math.abs(d.dy) < 0.5)) return;
      change(setEls(deck, index, d.ids, (e) => ({ ...e, x: Math.round(e.x + d.dx), y: Math.round(e.y + d.dy) })));
      return;
    }
    if (d.kind === 'rotate') {
      change(setEls(deck, index, [d.id], (e) => ({ ...e, rot: d.rot ? Math.round(d.rot * 10) / 10 : undefined })));
      return;
    }
    if (d.kind === 'resize') {
      const n = d.next;
      if (n.x === d.box.x && n.y === d.box.y && n.w === d.box.w && n.h === d.box.h) return;
      change(setEls(deck, index, [d.id], (e) => ({ ...e, ...n })));
      return;
    }
    if (d.kind === 'end') change(setEls(deck, index, [d.id], (e) => ({ ...e, ...d.next })));
  };

  const onDouble = (e: React.MouseEvent) => {
    if (readOnly) return;
    const id = hit(e.clientX, e.clientY);
    const el = slide.els.find((x) => x.id === id);
    if (!el) return;
    if (el.type === 'text' || el.type === 'shape') {
      dblAt.current = { x: e.clientX, y: e.clientY };
      onSel([el.id]);
      onEditing(el.id);
    } else if (el.type === 'image') onReplaceImage?.(el.id);
    else if (el.type === 'chart') onChartData?.(el.id);
    else if (el.type === 'table') {
      const td = (document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.tagName === 'TD') as HTMLElement | undefined) ?? null;
      if (!td) return;
      const r = Number(td.dataset.r);
      const c = Number(td.dataset.c);
      const wr = wrap.current!.getBoundingClientRect();
      const tr = td.getBoundingClientRect();
      setCell({ id: el.id, r, c, box: { x: tr.left - wr.left, y: tr.top - wr.top, w: tr.width, h: tr.height }, text: el.rows[r]?.[c] ?? '' });
    }
  };

  const saveCell = (next?: { r: number; c: number }) => {
    if (!cell) return;
    const el = slide.els.find((x) => x.id === cell.id) as TableEl | undefined;
    if (el && (el.rows[cell.r]?.[cell.c] ?? '') !== cell.text) {
      const rows = el.rows.map((row, ri) => (ri === cell.r ? row.map((v, ci) => (ci === cell.c ? cell.text : v)) : row));
      change((d) => setEls(d, index, [cell.id], (x) => ({ ...x, rows }) as El), `cell:${cell.id}`);
    }
    setCell(null);
    if (next && el && next.r < el.rows.length) {
      // The next cell, once the table is drawn again.
      requestAnimationFrame(() => {
        const td = nodeOf(cell.id)?.querySelector<HTMLElement>(`td[data-r="${next.r}"][data-c="${next.c}"]`);
        const wr = wrap.current?.getBoundingClientRect();
        if (!td || !wr) return;
        const tr = td.getBoundingClientRect();
        const rows = (slide.els.find((x) => x.id === cell.id) as TableEl | undefined)?.rows;
        setCell({ id: cell.id, r: next.r, c: next.c, box: { x: tr.left - wr.left, y: tr.top - wr.top, w: tr.width, h: tr.height }, text: rows?.[next.r]?.[next.c] ?? '' });
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
  const picked = slide ? slide.els.filter((e) => sel.includes(e.id)).map(live) : [];
  const one = picked.length === 1 ? picked[0] : null;
  const S = (v: number) => v * k;

  const frameOf = (e: El, strong: boolean) => {
    if (e.type === 'line') {
      return (
        <svg key={e.id} className="pointer-events-none absolute inset-0 overflow-visible" width={stage.w} height={stage.h}>
          <line x1={S(e.x)} y1={S(e.y)} x2={S(e.x + e.w)} y2={S(e.y + e.h)} stroke="var(--accent)" strokeWidth={strong ? 2 : 1} strokeDasharray={strong ? undefined : '4 3'} />
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
            className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border-2 border-accent bg-white shadow"
            style={{ left: S(x), top: S(y) }}
          />
        );
      });
    }
    const box = { x: e.x, y: e.y, w: e.w, h: e.h };
    const rot = e.rot ?? 0;
    return (
      <div className="absolute" style={{ left: S(e.x), top: S(e.y), width: S(e.w), height: S(e.h), rotate: rot ? `${rot}deg` : undefined }}>
        {HANDLES.map(([hx, hy]) => (
          <div
            key={`${hx},${hy}`}
            onPointerDown={(ev) => begin(ev, { kind: 'resize', id: e.id, hx, hy, start: toSlide(ev.clientX, ev.clientY), box, rot, next: box })}
            className={cx('absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-[3px] border-[1.5px] border-accent bg-white shadow-sm', 'pointer-coarse:h-4 pointer-coarse:w-4')}
            style={{ left: `${((hx + 1) / 2) * 100}%`, top: `${((hy + 1) / 2) * 100}%`, cursor: CURSOR[`${hx},${hy}`] }}
          />
        ))}
        <div className="absolute left-1/2 h-5 w-px -translate-x-1/2 bg-accent" style={{ top: -20 }} />
        <div
          title="Turn it (Shift: by 15°)"
          onPointerDown={(ev) => begin(ev, { kind: 'rotate', id: e.id, cx: e.x + e.w / 2, cy: e.y + e.h / 2, rot })}
          className="absolute left-1/2 h-3.5 w-3.5 -translate-x-1/2 cursor-grab rounded-full border-[1.5px] border-accent bg-white shadow-sm pointer-coarse:h-5 pointer-coarse:w-5"
          style={{ top: -27 }}
        />
      </div>
    );
  };

  const m = drag?.kind === 'marquee' ? drag : null;
  return (
    <div
      ref={wrap}
      tabIndex={-1}
      className="relative h-full w-full touch-none overflow-hidden bg-bg-2 outline-none select-none"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onDoubleClick={onDouble}
      onContextMenu={(e) => {
        if (!onMenu || editing) return;
        e.preventDefault();
        const id = hit(e.clientX, e.clientY);
        if (id && !sel.includes(id)) onSel([id]);
        onMenu({ x: e.clientX, y: e.clientY }, id);
      }}
    >
      <div className="absolute shadow-[0_0_0_1px_var(--line-2),0_10px_30px_rgba(0,0,0,.18)]" style={{ left: stage.left, top: stage.top, width: stage.w, height: stage.h }}>
        <div ref={content} className="absolute top-0 left-0 origin-top-left" style={{ width: W, height: H, transform: `scale(${k})` }} />
        <div className={cx('absolute inset-0', editing && 'pointer-events-none')}>
          {picked.map((e) => frameOf(e, picked.length === 1))}
          {one && handles(one)}
          {guides.x.map((x) => (
            <div key={`gx${x}`} className="pointer-events-none absolute top-0 bottom-0 w-px bg-[#ff3b8b]" style={{ left: S(x) }} />
          ))}
          {guides.y.map((y) => (
            <div key={`gy${y}`} className="pointer-events-none absolute right-0 left-0 h-px bg-[#ff3b8b]" style={{ top: S(y) }} />
          ))}
          {m && (
            <div
              className="pointer-events-none absolute border border-accent bg-accent/10"
              style={{ left: S(Math.min(m.start.x, m.at.x)), top: S(Math.min(m.start.y, m.at.y)), width: S(Math.abs(m.at.x - m.start.x)), height: S(Math.abs(m.at.y - m.start.y)) }}
            />
          )}
        </div>
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
              const el = slide.els.find((x) => x.id === cell.id) as TableEl | undefined;
              const cols = el?.rows[0]?.length ?? 1;
              const n = cell.c + (e.shiftKey ? -1 : 1);
              saveCell(n >= cols ? { r: cell.r + 1, c: 0 } : n < 0 ? { r: Math.max(0, cell.r - 1), c: cols - 1 } : { r: cell.r, c: n });
            }
          }}
          className="absolute z-10 resize-none rounded-sm border-2 border-accent bg-white px-1.5 py-1 text-[13px] leading-snug text-black outline-none"
          style={{ left: cell.box.x, top: cell.box.y, width: Math.max(80, cell.box.w), height: Math.max(32, cell.box.h) }}
        />
      )}
      {children}
    </div>
  );
});
