// A sheet's grid. Only the rows and columns in view are drawn, so thousands of rows scroll as smoothly as a few. The
// column letters and row numbers stay in view, as do frozen rows and columns: each is a band that sticks to its
// edge (the browser keeps it there while scrolling), and every cell is placed in the band it belongs to. Over the
// cells: the selection, references outlined while a formula is typed, what was cut, and the box to type in, which
// is also what takes the keys and the clipboard while nothing is typed (so typing starts at once, in any language).
// Mouse: click, drag, Shift+click, the letters and numbers, edges of headers to size columns and rows (a double
// click fits them). Touch: a tap picks, a tap on the picked cell types in it, a drag scrolls, the round handle
// stretches the selection, a long press opens the menu.
import { forwardRef, memo, useCallback, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { colName, formatValue, isError, refName, textOn, type Calc, type Cell, type CellStyle, type Rect, type Sheet } from '@shared/sheets';
import { cx } from '../../../components/ui';
import { colW, indexAt, offsets, rectOf, rowH, type Sel } from './ops';

export const HEAD_H = 24;
export const NUM_W = 46;

/** A reference being pointed at while a formula is typed (arrows or clicks), and where its name sits in the words. */
export interface Point {
  s: number;
  e: number;
  ar: number;
  ac: number;
  fr: number;
  fc: number;
}

export interface Edit {
  text: string;
  /** type: begun by typing (arrows end it); edit: F2, a double click or a tap (arrows move in the words). */
  mode: 'type' | 'edit';
  /** In the cell, or in the formula bar. */
  where: 'cell' | 'bar';
  point?: Point;
}

/** A range outlined in a colour (a formula's references while it is typed). */
export interface RefBox extends Rect {
  color: string;
}

export interface GridHandle {
  focus(): void;
  input(): HTMLTextAreaElement | null;
  /** Scrolls a cell into view (past the frozen rows and columns). */
  reveal(r: number, c: number): void;
  /** How many rows fit in view (for Page Up and Page Down). */
  pageRows(): number;
}

interface Props {
  sheet: Sheet;
  si: number;
  calc: Calc;
  /** Changes with every change to the workbook. */
  rev: number;
  rows: number;
  cols: number;
  sel: Sel;
  edit: Edit | null;
  refs: RefBox[];
  cut: Rect | null;
  readOnly?: boolean;
  onSel: (s: Sel) => void;
  onEdit: (mode: 'type' | 'edit', text?: string) => void;
  onText: (text: string, caret: number) => void;
  /** The caret moved in the words (`text`: what the box holds then, to tell a late report from a current one). */
  onCaret: (text: string, caret: number) => void;
  onKey: (e: React.KeyboardEvent<HTMLElement>) => void;
  /** A cell clicked while a formula is typed where a reference can go: true when it was put in. */
  onPoint: (r: number, c: number, extend: boolean) => boolean;
  /** A column's or row's new size; null puts it back as it was by default. */
  onSize: (axis: 'col' | 'row', i: number, size: number | null) => void;
  onFit: (axis: 'col' | 'row', i: number) => void;
  onMenu: (at: { x: number; y: number }, on: 'cell' | 'col' | 'row') => void;
  onCopy: (e: React.ClipboardEvent) => void;
  onCut: (e: React.ClipboardEvent) => void;
  onPaste: (e: React.ClipboardEvent) => void;
}

// ---- measuring words ----------------------------------------------------------------------------------------------

let ctx2d: CanvasRenderingContext2D | null = null;
const widths = new Map<string, number>();
let family = 'system-ui, sans-serif';

/** A text's width in px in a cell's type, remembered. */
export function textWidth(text: string, s?: CellStyle): number {
  const font = `${s?.i ? 'italic ' : ''}${s?.b ? 700 : 400} ${fontPx(s)}px ${family}`;
  const key = `${font}|${text}`;
  let w = widths.get(key);
  if (w !== undefined) return w;
  ctx2d ??= document.createElement('canvas').getContext('2d');
  if (!ctx2d) return text.length * 7;
  ctx2d.font = font;
  w = Math.max(...text.split('\n').map((l) => ctx2d!.measureText(l).width));
  if (widths.size > 20_000) widths.clear();
  widths.set(key, w);
  return w;
}

/** A cell's type size in px (styles keep points). */
export const fontPx = (s?: CellStyle) => Math.round(((s?.size ?? 10) * 4) / 3 * 10) / 10;

// ---- how a cell looks -------------------------------------------------------------------------------------------------

interface Shown {
  text: string;
  style: React.CSSProperties;
  cls: string;
}

/** A cell's words and look (numbers right, TRUE and FALSE and errors in the middle, words left unless it says). */
function shown(cell: Cell, v: ReturnType<Calc['value']>): Shown {
  const s = cell.s;
  const text = cell.v === undefined && cell.f === undefined ? '' : formatValue(v, s);
  const style: React.CSSProperties = {};
  let cls = '';
  const align = s?.align ?? (typeof v === 'number' ? 'right' : typeof v === 'boolean' || isError(v) ? 'center' : 'left');
  style.justifyContent = align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start';
  style.textAlign = align;
  // Words wrapped start at the top (a row too short for them shows their beginning).
  style.alignItems = s?.valign === 'top' || (s?.wrap && !s.valign) ? 'flex-start' : s?.valign === 'bottom' ? 'flex-end' : 'center';
  if (s?.wrap) style.paddingTop = 3;
  if (s?.b) style.fontWeight = 700;
  if (s?.i) style.fontStyle = 'italic';
  if (s?.u || s?.s) style.textDecoration = [s.u ? 'underline' : '', s.s ? 'line-through' : ''].filter(Boolean).join(' ');
  if (s?.size) style.fontSize = fontPx(s);
  if (s?.fill) style.background = s.fill;
  const color = s?.color ?? (s?.fill ? textOn(s.fill) : undefined);
  if (color) style.color = color;
  else if (isError(v)) cls = 'text-err';
  if (s?.wrap) style.whiteSpace = 'pre-wrap';
  return { text, style, cls };
}

// ---- the grid ---------------------------------------------------------------------------------------------------------

interface View {
  top: number;
  left: number;
  w: number;
  h: number;
}

type Region = 'corner' | 'top' | 'left' | 'body';

export const Grid = forwardRef<GridHandle, Props>(function Grid(p, ref) {
  const { sheet, si, calc, rev, rows, cols, sel, edit, readOnly } = p;
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const [view, setView] = useState<View>({ top: 0, left: 0, w: 800, h: 600 });
  // A column or row being sized: its live size.
  const [sizing, setSizing] = useState<{ axis: 'col' | 'row'; i: number; size: number } | null>(null);
  const touch = useRef(false);
  // An input method composing (Chinese, Japanese, Greek accents…): the caret is left where it is meanwhile.
  const composing = useRef(false);
  const cb = useRef(p);
  cb.current = p;

  const fr = Math.min(sheet.freeze?.rows ?? 0, rows - 1);
  const fc = Math.min(sheet.freeze?.cols ?? 0, cols - 1);
  const colOff = useMemo(() => offsets(cols, (c) => (sizing?.axis === 'col' && sizing.i === c ? sizing.size : colW(sheet, c))), [cols, sheet, sheet.cols, sizing, rev]);
  const rowOff = useMemo(() => offsets(rows, (r) => (sizing?.axis === 'row' && sizing.i === r ? sizing.size : rowH(sheet, r))), [rows, sheet, sheet.rows, sizing, rev]);
  const FW = colOff[fc];
  const FH = rowOff[fr];
  const W = NUM_W + colOff[cols];
  const H = HEAD_H + rowOff[rows];

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    family = getComputedStyle(el).fontFamily || family;
    const ro = new ResizeObserver(() => setView((v) => ({ ...v, w: el.clientWidth, h: el.clientHeight })));
    ro.observe(el);
    setView({ top: el.scrollTop, left: el.scrollLeft, w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // What is in view (and a little more), as row and column ranges: drawn anew only when they change.
  const range = useMemo(() => {
    const r1 = Math.max(fr, indexAt(rowOff, view.top + FH) - 3);
    const r2 = Math.min(rows - 1, indexAt(rowOff, view.top + view.h - HEAD_H) + 3);
    // A few columns before the first in view too: their words may run on into it.
    const c1 = Math.max(fc, indexAt(colOff, view.left + FW) - 3);
    const c2 = Math.min(cols - 1, indexAt(colOff, view.left + view.w - NUM_W) + 1);
    return { r1, r2, c1, c2 };
  }, [view, rowOff, colOff, rows, cols, fr, fc, FH, FW]);
  const rangeKey = `${range.r1}:${range.r2}:${range.c1}:${range.c2}`;
  const stableRange = useMemo(() => range, [rangeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    setView((v) => (v.top === el.scrollTop && v.left === el.scrollLeft ? v : { ...v, top: el.scrollTop, left: el.scrollLeft }));
  };

  /** A cell's place within its band. */
  const place = useCallback(
    (r: number, c: number, region: Region) => ({
      left: NUM_W + colOff[c],
      top: region === 'left' ? rowOff[r] - FH : HEAD_H + rowOff[r],
    }),
    [colOff, rowOff, FH],
  );
  const regionOf = (r: number, c: number): Region => (r < fr ? (c < fc ? 'corner' : 'top') : c < fc ? 'left' : 'body');

  // ---- where the pointer is ------------------------------------------------------------------------------------------
  /** The cell under a point on screen: -1 for the column letters or the row numbers. */
  const cellAt = (x: number, y: number): [number, number] => {
    const el = scroller.current!;
    const b = el.getBoundingClientRect();
    const vx = x - b.left;
    const vy = y - b.top;
    const c = vx < NUM_W ? -1 : vx < NUM_W + FW ? indexAt(colOff, vx - NUM_W) : indexAt(colOff, vx - NUM_W + el.scrollLeft);
    const r = vy < HEAD_H ? -1 : vy < HEAD_H + FH ? indexAt(rowOff, vy - HEAD_H) : indexAt(rowOff, vy - HEAD_H + el.scrollTop);
    return [Math.min(r, rows - 1), Math.min(c, cols - 1)];
  };

  useImperativeHandle(ref, () => ({
    focus: () => {
      if (touch.current) scroller.current?.focus({ preventScroll: true });
      else input.current?.focus({ preventScroll: true });
    },
    input: () => input.current,
    reveal: (r, c) => {
      const el = scroller.current;
      if (!el) return;
      if (r >= fr) {
        const y0 = rowOff[r] - FH;
        const y1 = rowOff[r + 1] - FH;
        const room = el.clientHeight - HEAD_H - FH;
        if (y0 < el.scrollTop) el.scrollTop = y0;
        else if (y1 > el.scrollTop + room) el.scrollTop = y1 - room;
      }
      if (c >= fc) {
        const x0 = colOff[c] - FW;
        const x1 = colOff[c + 1] - FW;
        const room = el.clientWidth - NUM_W - FW;
        if (x0 < el.scrollLeft) el.scrollLeft = x0;
        else if (x1 > el.scrollLeft + room) el.scrollLeft = Math.min(x0, x1 - room);
      }
    },
    pageRows: () => Math.max(1, Math.floor((view.h - HEAD_H - FH) / 24) - 1),
  }));

  // ---- pointer: picking, dragging, typing in ----------------------------------------------------------------------------
  const drag = useRef<{ kind: 'cells' | 'cols' | 'rows' | 'point' | 'handle'; id: number; x: number; y: number; moved: boolean; timer?: number } | null>(null);
  const auto = useRef<number | null>(null);

  const extendTo = (r: number, c: number, kind: 'cells' | 'cols' | 'rows' | 'point' | 'handle') => {
    const s = cb.current.sel;
    if (kind === 'point') return void cb.current.onPoint(Math.max(0, r), Math.max(0, c), true);
    if (kind === 'cols') return cb.current.onSel({ ...s, fr: rows - 1, fc: Math.max(0, c) });
    if (kind === 'rows') return cb.current.onSel({ ...s, fr: Math.max(0, r), fc: cols - 1 });
    cb.current.onSel({ ...s, fr: Math.max(0, r), fc: Math.max(0, c) });
  };

  /** While a drag is past the edge of the grid, it scrolls on. */
  const autoScroll = (x: number, y: number) => {
    if (auto.current) cancelAnimationFrame(auto.current);
    const el = scroller.current;
    const d = drag.current;
    if (!el || !d) return;
    const b = el.getBoundingClientRect();
    const dx = x < b.left + NUM_W + FW ? -1 : x > b.right - 4 ? 1 : 0;
    const dy = y < b.top + HEAD_H + FH ? -1 : y > b.bottom - 4 ? 1 : 0;
    if (!dx && !dy) return;
    const step = () => {
      if (!drag.current) return;
      el.scrollLeft += dx * 16;
      el.scrollTop += dy * 16;
      const [r, c] = cellAt(x, y);
      extendTo(r < 0 ? 0 : r, c < 0 ? 0 : c, d.kind);
      auto.current = requestAnimationFrame(step);
    };
    auto.current = requestAnimationFrame(step);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-sizer]') || t === input.current) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    touch.current = e.pointerType !== 'mouse';
    const [r, c] = cellAt(e.clientX, e.clientY);
    const P = cb.current;
    if (touch.current) {
      // A finger: nothing happens until it lifts (a drag scrolls), or holds still (the menu).
      const d = { kind: 'cells' as const, id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, timer: 0 };
      d.timer = window.setTimeout(() => {
        if (!drag.current || drag.current.moved) return;
        drag.current = null;
        const s = P.sel;
        const x = rectOf(s);
        if (r >= 0 && c >= 0 && !(r >= x.r1 && r <= x.r2 && c >= x.c1 && c <= x.c2)) P.onSel({ r, c, ar: r, ac: c, fr: r, fc: c });
        P.onMenu({ x: e.clientX, y: e.clientY }, r < 0 ? 'col' : c < 0 ? 'row' : 'cell');
      }, 520);
      drag.current = d;
      return;
    }
    e.preventDefault();
    if (r < 0 && c < 0) {
      P.onSel({ r: 0, c: 0, ar: 0, ac: 0, fr: rows - 1, fc: cols - 1 });
      input.current?.focus({ preventScroll: true });
      return;
    }
    if (P.edit && !(r < 0 || c < 0) && P.onPoint(r, c, e.shiftKey)) {
      drag.current = { kind: 'point', id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
      scroller.current?.setPointerCapture(e.pointerId);
      return;
    }
    const s = P.sel;
    if (r < 0) {
      const next = e.shiftKey ? { ...s, ar: 0, fr: rows - 1, fc: c } : { r: 0, c, ar: 0, ac: c, fr: rows - 1, fc: c };
      P.onSel(next);
      drag.current = { kind: 'cols', id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    } else if (c < 0) {
      const next = e.shiftKey ? { ...s, ac: 0, fr: r, fc: cols - 1 } : { r, c: 0, ar: r, ac: 0, fr: r, fc: cols - 1 };
      P.onSel(next);
      drag.current = { kind: 'rows', id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    } else {
      P.onSel(e.shiftKey ? { ...s, fr: r, fc: c } : { r, c, ar: r, ac: c, fr: r, fc: c });
      drag.current = { kind: 'cells', id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    }
    scroller.current?.setPointerCapture(e.pointerId);
    input.current?.focus({ preventScroll: true });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 6) d.moved = true;
    if (touch.current && d.kind !== 'handle') return;
    const [r, c] = cellAt(e.clientX, e.clientY);
    extendTo(r < 0 ? (d.kind === 'cols' ? rows - 1 : 0) : r, c < 0 ? (d.kind === 'rows' ? cols - 1 : 0) : c, d.kind);
    autoScroll(e.clientX, e.clientY);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (auto.current) cancelAnimationFrame(auto.current);
    auto.current = null;
    drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    if (d.timer) clearTimeout(d.timer);
    if (!touch.current || d.kind === 'handle' || d.moved) return;
    // A tap: picks the cell; on the cell picked already, types in it (the keyboard opens, as it is a tap).
    const P = cb.current;
    const [r, c] = cellAt(e.clientX, e.clientY);
    if (r < 0 && c < 0) return P.onSel({ r: 0, c: 0, ar: 0, ac: 0, fr: rows - 1, fc: cols - 1 });
    if (r < 0) return P.onSel({ r: 0, c, ar: 0, ac: c, fr: rows - 1, fc: c });
    if (c < 0) return P.onSel({ r, c: 0, ar: r, ac: 0, fr: r, fc: cols - 1 });
    if (P.edit && P.onPoint(r, c, false)) return;
    const s = P.sel;
    if (!P.edit && !P.readOnly && s.r === r && s.c === c && s.ar === s.fr && s.ac === s.fc) {
      input.current?.focus({ preventScroll: true });
      P.onEdit('edit');
      return;
    }
    P.onSel({ r, c, ar: r, ac: c, fr: r, fc: c });
    scroller.current?.focus({ preventScroll: true });
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-sizer]') || readOnly) return;
    const [r, c] = cellAt(e.clientX, e.clientY);
    if (r < 0 || c < 0 || cb.current.edit) return;
    cb.current.onSel({ r, c, ar: r, ac: c, fr: r, fc: c });
    input.current?.focus({ preventScroll: true });
    cb.current.onEdit('edit');
  };

  const onContextMenu = (e: React.MouseEvent) => {
    if (e.target === input.current && cb.current.edit) return;
    e.preventDefault();
    // A finger held still opens the menu itself (some phones send this too).
    if (touch.current) return;
    const [r, c] = cellAt(e.clientX, e.clientY);
    const s = cb.current.sel;
    const x = rectOf(s);
    const inside = (r < 0 || (r >= x.r1 && r <= x.r2)) && (c < 0 || (c >= x.c1 && c <= x.c2));
    if (!inside) {
      if (r < 0 && c >= 0) cb.current.onSel({ r: 0, c, ar: 0, ac: c, fr: rows - 1, fc: c });
      else if (c < 0 && r >= 0) cb.current.onSel({ r, c: 0, ar: r, ac: 0, fr: r, fc: cols - 1 });
      else if (r >= 0 && c >= 0) cb.current.onSel({ r, c, ar: r, ac: c, fr: r, fc: c });
    }
    cb.current.onMenu({ x: e.clientX, y: e.clientY }, r < 0 && c >= 0 ? 'col' : c < 0 && r >= 0 ? 'row' : 'cell');
  };

  // ---- sizing columns and rows ---------------------------------------------------------------------------------------------
  const startSize = (axis: 'col' | 'row', i: number) => (e: React.PointerEvent) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    const start = axis === 'col' ? e.clientX : e.clientY;
    const base = axis === 'col' ? colW(sheet, i) : rowH(sheet, i);
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    let size = base;
    const move = (ev: PointerEvent) => {
      size = Math.max(axis === 'col' ? 24 : 16, Math.min(axis === 'col' ? 1200 : 600, Math.round(base + (axis === 'col' ? ev.clientX : ev.clientY) - start)));
      setSizing({ axis, i, size });
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      setSizing(null);
      if (size !== base) cb.current.onSize(axis, i, size);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  // ---- the box typed into -------------------------------------------------------------------------------------------------
  // One box for the whole grid, never moved from band to band (that would lose the focus): it sits over the active
  // cell, a frozen cell's place following the scrolling, and over the bands while words are typed in it.
  const at = { left: NUM_W + colOff[sel.c] + (sel.c < fc ? view.left : 0), top: HEAD_H + rowOff[sel.r] + (sel.r < fr ? view.top : 0) };
  const cellW = colOff[sel.c + 1] - colOff[sel.c];
  const cellH = rowOff[sel.r + 1] - rowOff[sel.r];
  const editCell = sheet.cells[refName(sel.r, sel.c)];
  const editW = edit ? Math.min(Math.max(cellW, textWidth(edit.text || ' ', editCell?.s) + 18), Math.max(cellW, view.w - (at.left - view.left) - 8)) : cellW;
  const lineCount = edit ? edit.text.split('\n').length + (editCell?.s?.wrap ? Math.floor(textWidth(edit.text, editCell.s) / Math.max(40, editW - 12)) : 0) : 1;
  const editH = Math.max(cellH, lineCount * (fontPx(editCell?.s) * 1.35) + 8);

  // Not typing: the box holds a selected space, so a key typed replaces it (and copying always has something to copy).
  useLayoutEffect(() => {
    const el = input.current;
    if (!el || edit) return;
    if (el.value !== ' ') el.value = ' ';
    if (document.activeElement === el) el.select();
  }, [edit, sel]);
  // Typing begun: the caret goes to the end of the words.
  const editing = !!edit;
  useLayoutEffect(() => {
    const el = input.current;
    if (!el || !editing || cb.current.edit?.where !== 'cell' || composing.current) return;
    const n = el.value.length;
    el.setSelectionRange(n, n);
  }, [editing]);

  const box = (
    <textarea
      ref={input}
      aria-label="Cell"
      spellCheck={false}
      autoCapitalize="off"
      autoComplete="off"
      autoCorrect="off"
      readOnly={readOnly}
      value={edit ? edit.text : ' '}
      onChange={(e) => {
        const v = e.target.value;
        if (cb.current.edit) cb.current.onText(v, e.target.selectionStart ?? v.length);
        else if (v !== ' ' && !readOnly) cb.current.onEdit('type', v.replace(/^ /, ''));
      }}
      onCompositionStart={() => {
        composing.current = true;
        if (!cb.current.edit && !readOnly) cb.current.onEdit('type', input.current?.value ?? '');
      }}
      onCompositionEnd={() => (composing.current = false)}
      onFocus={(e) => {
        if (!cb.current.edit) e.target.select();
      }}
      onKeyDown={(e) => cb.current.onKey(e)}
      onCopy={(e) => !cb.current.edit && cb.current.onCopy(e)}
      onCut={(e) => !cb.current.edit && cb.current.onCut(e)}
      onPaste={(e) => !cb.current.edit && cb.current.onPaste(e)}
      onSelect={(e) => cb.current.edit && cb.current.onCaret((e.target as HTMLTextAreaElement).value, (e.target as HTMLTextAreaElement).selectionStart ?? 0)}
      className={cx(
        'absolute z-40 m-0 resize-none overflow-hidden border-0 p-0 px-[4px] py-[3px] leading-[1.35] outline-none',
        edit ? 'bg-panel text-fg shadow-[0_0_0_2px_var(--accent),0_4px_14px_rgba(0,0,0,.18)]' : 'pointer-events-none opacity-0',
      )}
      style={{
        left: at.left,
        top: at.top,
        width: edit ? editW : cellW,
        height: edit ? editH : cellH,
        fontSize: fontPx(editCell?.s),
        fontWeight: edit && editCell?.s?.b ? 700 : undefined,
        fontStyle: edit && editCell?.s?.i ? 'italic' : undefined,
        whiteSpace: 'pre-wrap',
        // While not typing it sits still and unseen at the cell (the keys and the clipboard come to it).
        caretColor: edit ? undefined : 'transparent',
      }}
    />
  );

  // ---- drawing --------------------------------------------------------------------------------------------------------
  const allRows = useMemo(() => ({ r1: 0, r2: fr - 1 }), [fr]);
  const allCols = useMemo(() => ({ c1: 0, c2: fc - 1 }), [fc]);
  const cellsBody = <Cells sheet={sheet} si={si} calc={calc} rev={rev} rows={stableRange} cols={stableRange} fc={fc} region="body" place={place} colOff={colOff} rowOff={rowOff} />;
  const cellsTop = fr > 0 && <Cells sheet={sheet} si={si} calc={calc} rev={rev} rows={allRows} cols={stableRange} fc={fc} region="top" place={place} colOff={colOff} rowOff={rowOff} />;
  const cellsLeft = fc > 0 && <Cells sheet={sheet} si={si} calc={calc} rev={rev} rows={stableRange} cols={allCols} fc={fc} region="left" place={place} colOff={colOff} rowOff={rowOff} />;
  const cellsCorner = fr > 0 && fc > 0 && <Cells sheet={sheet} si={si} calc={calc} rev={rev} rows={allRows} cols={allCols} fc={fc} region="corner" place={place} colOff={colOff} rowOff={rowOff} />;

  const x = rectOf(sel);
  const selCols = (c: number) => c >= x.c1 && c <= x.c2;
  const selRows = (r: number) => r >= x.r1 && r <= x.r2;
  const wholeCols = x.r1 === 0 && x.r2 >= rows - 1;
  const wholeRows = x.c1 === 0 && x.c2 >= cols - 1;

  const colHead = (c: number) => (
    <div
      key={c}
      className={cx(
        'absolute top-0 flex items-center justify-center border-r border-b border-line text-[11px] select-none',
        selCols(c) ? (wholeCols ? 'bg-accent text-accent-fg' : 'bg-accent-soft font-semibold text-accent') : 'bg-panel text-fg-3',
      )}
      style={{ left: NUM_W + colOff[c], width: colOff[c + 1] - colOff[c], height: HEAD_H }}
    >
      {colName(c)}
      {!readOnly && (
        <span
          data-sizer
          onPointerDown={startSize('col', c)}
          onDoubleClick={() => cb.current.onFit('col', c)}
          className="absolute top-0 -right-[4px] z-10 h-full w-[8px] cursor-col-resize hover:bg-accent/40"
        />
      )}
    </div>
  );
  const rowHead = (r: number, region: 'corner' | 'left') => (
    <div
      key={r}
      className={cx(
        'absolute left-0 flex items-center justify-center border-r border-b border-line text-[11px] tabular-nums select-none',
        selRows(r) ? (wholeRows ? 'bg-accent text-accent-fg' : 'bg-accent-soft font-semibold text-accent') : 'bg-panel text-fg-3',
      )}
      style={{ top: region === 'left' ? rowOff[r] - FH : HEAD_H + rowOff[r], width: NUM_W, height: rowOff[r + 1] - rowOff[r] }}
    >
      {r + 1}
      {!readOnly && (
        <span
          data-sizer
          onPointerDown={startSize('row', r)}
          onDoubleClick={() => cb.current.onFit('row', r)}
          className="absolute -bottom-[4px] left-0 z-10 h-[8px] w-full cursor-row-resize hover:bg-accent/40"
        />
      )}
    </div>
  );

  /** A range outlined in each band it crosses: borders only on its own edges. */
  const boxes = (rect: Rect, region: Region, cls: string, style: React.CSSProperties = {}, key = '') => {
    const rr = region === 'corner' || region === 'top' ? { a: 0, b: fr - 1 } : { a: fr, b: rows - 1 };
    const cc = region === 'corner' || region === 'left' ? { a: 0, b: fc - 1 } : { a: fc, b: cols - 1 };
    const r1 = Math.max(rect.r1, rr.a);
    const r2 = Math.min(rect.r2, rr.b);
    const c1 = Math.max(rect.c1, cc.a);
    const c2 = Math.min(rect.c2, cc.b);
    if (r1 > r2 || c1 > c2) return null;
    const p0 = place(r1, c1, region);
    return (
      <div
        key={`${key}${region}`}
        className={cx('pointer-events-none absolute', cls)}
        style={{
          left: p0.left - 1,
          top: p0.top - 1,
          width: colOff[c2 + 1] - colOff[c1] + 1,
          height: rowOff[r2 + 1] - rowOff[r1] + 1,
          borderTopWidth: r1 === rect.r1 ? undefined : 0,
          borderBottomWidth: r2 === rect.r2 ? undefined : 0,
          borderLeftWidth: c1 === rect.c1 ? undefined : 0,
          borderRightWidth: c2 === rect.c2 ? undefined : 0,
          ...style,
        }}
      />
    );
  };

  const overlay = (region: Region) => (
    <>
      {p.refs.map((b, i) => boxes(b, region, 'border-2 border-dashed', { borderColor: b.color, background: `color-mix(in srgb, ${b.color} 10%, transparent)` }, `ref${i}`))}
      {p.cut && boxes(p.cut, region, 'border-2 border-dashed border-accent', {}, 'cut')}
      {!(x.r1 === x.r2 && x.c1 === x.c2) && boxes(x, region, 'border border-accent bg-accent/10', {}, 'sel')}
      {regionOf(sel.r, sel.c) === region && !edit && boxes({ r1: sel.r, c1: sel.c, r2: sel.r, c2: sel.c }, region, 'border-2 border-accent', {}, 'act')}
      {regionOf(x.r2, x.c2) === region && !readOnly && !edit && touch.current && (
        <div
          key="handle"
          className="absolute z-30 h-6 w-6 -translate-x-1/2 -translate-y-1/2 touch-none"
          style={{ left: place(x.r2, x.c2, region).left + colOff[x.c2 + 1] - colOff[x.c2], top: place(x.r2, x.c2, region).top + rowOff[x.r2 + 1] - rowOff[x.r2] }}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            drag.current = { kind: 'handle', id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
            scroller.current?.setPointerCapture(e.pointerId);
          }}
        >
          <span className="absolute top-1/2 left-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-panel bg-accent shadow" />
        </div>
      )}
    </>
  );

  /** The grid's lines in a band, at the right and bottom edge of each column and row in view. */
  const gridLines = (region: Region) => {
    const rs = region === 'corner' || region === 'top' ? allRows : stableRange;
    const cs = region === 'corner' || region === 'left' ? allCols : stableRange;
    const out = [];
    const y0 = place(rs.r1, 0, region).top;
    const y1 = place(rs.r2, 0, region).top + rowOff[rs.r2 + 1] - rowOff[rs.r2];
    const x0 = NUM_W + colOff[cs.c1];
    const x1 = NUM_W + colOff[cs.c2 + 1];
    for (let c = cs.c1; c <= cs.c2; c++) out.push(<div key={`c${c}`} className="absolute w-px bg-line" style={{ left: NUM_W + colOff[c + 1] - 1, top: y0, height: y1 - y0 }} />);
    for (let r = rs.r1; r <= rs.r2; r++) {
      const y = place(r, 0, region).top + rowOff[r + 1] - rowOff[r] - 1;
      out.push(<div key={`r${r}`} className="absolute h-px bg-line" style={{ top: y, left: x0, width: x1 - x0 }} />);
    }
    return out;
  };

  const heads: React.ReactNode[] = [];
  for (let c = stableRange.c1; c <= stableRange.c2; c++) heads.push(colHead(c));
  const frozenHeads: React.ReactNode[] = [];
  for (let c = 0; c < fc; c++) frozenHeads.push(colHead(c));
  const nums: React.ReactNode[] = [];
  for (let r = stableRange.r1; r <= stableRange.r2; r++) nums.push(rowHead(r, 'left'));
  const frozenNums: React.ReactNode[] = [];
  for (let r = 0; r < fr; r++) frozenNums.push(rowHead(r, 'corner'));

  return (
    <div
      ref={scroller}
      tabIndex={-1}
      translate="no"
      onScroll={onScroll}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        if (drag.current?.timer) clearTimeout(drag.current.timer);
        drag.current = null;
      }}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => e.target === scroller.current && cb.current.onKey(e)}
      className="relative min-h-0 flex-1 overflow-auto overscroll-contain bg-bg text-[13.3px] leading-[1.35] text-fg outline-none select-none [-webkit-touch-callout:none]"
    >
      <div className="relative" style={{ width: W, height: H }}>
        {/* The letters along the top, with the frozen rows under them: they stay at the top. */}
        <div className="sticky top-0 z-30 bg-bg" style={{ width: W, height: HEAD_H + FH }}>
          <div className="sticky left-0 z-10 bg-bg" style={{ width: NUM_W + FW, height: HEAD_H + FH }}>
            <div className="absolute top-0 left-0 border-r border-b border-line bg-panel" style={{ width: NUM_W, height: HEAD_H }} />
            {frozenHeads}
            {frozenNums}
            {fr > 0 && fc > 0 && gridLines('corner')}
            {cellsCorner}
            {fr > 0 && fc > 0 && overlay('corner')}
            {/* Where the frozen part ends: a firmer line. */}
            {fc > 0 && <div className="pointer-events-none absolute top-0 z-20 bg-fg-3/50" style={{ left: NUM_W + FW - 1, width: 2, height: HEAD_H + FH }} />}
            {fr > 0 && <div className="pointer-events-none absolute left-0 z-20 bg-fg-3/50" style={{ top: HEAD_H + FH - 1, height: 2, width: NUM_W + FW }} />}
          </div>
          {heads}
          {fr > 0 && gridLines('top')}
          {cellsTop}
          {fr > 0 && overlay('top')}
          {fr > 0 && <div className="pointer-events-none absolute left-0 z-[5] bg-fg-3/50" style={{ top: HEAD_H + FH - 1, height: 2, width: W }} />}
        </div>
        {/* The numbers down the side, with the frozen columns beside them: they stay at the left. */}
        <div className="sticky left-0 z-20 bg-bg" style={{ width: NUM_W + FW, height: H - HEAD_H - FH }}>
          {nums}
          {fc > 0 && gridLines('left')}
          {cellsLeft}
          {fc > 0 && overlay('left')}
          {fc > 0 && <div className="pointer-events-none absolute top-0 z-20 bg-fg-3/50" style={{ left: NUM_W + FW - 1, width: 2, height: H - HEAD_H - FH }} />}
        </div>
        <div className="absolute top-0 left-0" style={{ width: W, height: H }}>
          {gridLines('body')}
          {cellsBody}
          {overlay('body')}
        </div>
        {box}
      </div>
    </div>
  );
});

// ---- the cells of one band ----------------------------------------------------------------------------------------------

interface CellsProps {
  sheet: Sheet;
  si: number;
  calc: Calc;
  rev: number;
  rows: { r1: number; r2: number };
  cols: { c1: number; c2: number };
  fc: number;
  region: Region;
  place: (r: number, c: number, region: Region) => { left: number; top: number };
  colOff: Float64Array;
  rowOff: Float64Array;
}

/** The filled cells of a band in view; words run on over empty cells to their right, as in a spreadsheet. */
const Cells = memo(function Cells({ sheet, si, calc, rows, cols, fc, region, place, colOff, rowOff }: CellsProps) {
  const out: React.ReactNode[] = [];
  for (let r = rows.r1; r <= rows.r2; r++) {
    for (let c = cols.c1; c <= cols.c2; c++) {
      const cell = sheet.cells[refName(r, c)];
      if (!cell) continue;
      const v = cell.v === undefined && cell.f === undefined ? null : calc.value(si, r, c);
      const look = shown(cell, v);
      let w = colOff[c + 1] - colOff[c];
      const h = rowOff[r + 1] - rowOff[r];
      let text = look.text;
      if (text && !cell.s?.wrap) {
        const need = textWidth(text, cell.s) + 9;
        if (typeof v === 'number' && need > w) text = '#'.repeat(Math.max(1, Math.floor((w - 8) / 8)));
        else if (need > w && look.style.justifyContent === 'flex-start') {
          // Over the empty cells to the right, as far as the words need (not out of the frozen columns).
          const last = region === 'left' || region === 'corner' ? fc - 1 : cols.c2 + 8;
          for (let k = c + 1; k <= last && w < need; k++) {
            const next = sheet.cells[refName(r, k)];
            if (next && (next.v !== undefined || next.f !== undefined || next.s?.fill)) break;
            w += colOff[k + 1] - colOff[k];
          }
        }
      }
      const at = place(r, c, region);
      out.push(
        <div
          key={`${r}:${c}`}
          className={cx('absolute flex overflow-hidden border-r border-b border-line px-[4px] whitespace-nowrap', look.cls, !look.style.background && 'bg-bg')}
          style={{ left: at.left, top: at.top, width: w, height: h, ...look.style }}
        >
          <span className="min-w-0 overflow-hidden" style={{ textOverflow: 'clip' }}>
            {text}
          </span>
        </div>,
      );
    }
  }
  return <>{out}</>;
});
