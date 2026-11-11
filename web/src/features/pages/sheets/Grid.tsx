// A sheet's grid. Only the rows and columns in view are drawn, so thousands of rows scroll as smoothly as a few. The
// column letters and row numbers stay in view, as do frozen rows and columns: each is a band that sticks to its
// edge (the browser keeps it there while scrolling), and every cell is placed in the band it belongs to. Cells show
// what the sheet's rules make of them: merged cells as one, hidden rows and columns folded to a mark that shows them
// again, borders, conditional formatting (looks, colour scales, data bars), checkboxes, lists' coloured chips, stars,
// a mark for a note (shown when pointed at) and for a value its rule does not allow, and a filter's buttons on its
// header row. Over the cells: the selection, references outlined while a formula is typed, what was cut, the fill
// handle, the charts, and the box to type in, which is also what takes the keys and the clipboard while nothing is
// typed (so typing starts at once, in any language). It is drawn at the zoom asked for.
// Mouse: click, drag, Shift+click, Ctrl+click and Ctrl+drag (more ranges), the letters and numbers, edges of headers to
// size columns and rows (a double click fits them), the fill handle (drag it, or double-click it to fill down), the
// border of the cells picked (drag it to move them, Ctrl held to copy them) and a picked row's number or column's letter
// (drag it to move the rows or columns). Touch: a tap picks, a tap on the
// picked cell types in it, a drag scrolls, the round handle stretches the selection, a long press opens the menu.
import { forwardRef, memo, useCallback, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronsLeftRight, ChevronsUpDown, ListFilter, Maximize2, MessageSquare } from 'lucide-react';
import { accountingParts, borderOf, CELL_FONTS, codeColor, colName, formatValue, inputText, isError, refName, textOn, type Calc, type Cell, type CellStyle, type ListOption, type Rect, type Sheet, type SheetComment, type Validation } from '@shared/sheets';
import { allowed, isTicked, listOptions, type CondFormats, type Merges, type Rules } from '@shared/sheet-rules';
import { cx } from '../../../components/ui';
import { colW, indexAt, offsets, rectOf, rowH, type Sel } from './ops';
import { isCopyDrag } from '../common/keys';
import { asksAi, type AiState } from './ai';
import { AiMark, aiLabel, CellImage, LinkCard, Sparkline } from './CellExtras';
import type { Span } from '@shared/sheet-groups';

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

/** What the sheet's rules make of it, worked out once per change: hidden rows and columns, merges, looks, rules for cells, the filter. */
export interface GridView {
  /** Rows hidden, by hand or by the filter; those by hand (they get a mark to show them). */
  hidR: Set<number>;
  handR: Set<number>;
  hidC: Set<number>;
  merges: Merges;
  cf: CondFormats;
  rules: Rules;
  /** The filter's range, and the columns it filters by. */
  filter: { x: Rect; on: Set<number> } | null;
}

/** Where the grid's columns and rows start (px from A1's corner, at its zoom; a hidden one is 0 wide), for what is drawn over the cells. */
export interface GridGeo {
  colOff: Float64Array;
  rowOff: Float64Array;
  z: number;
}

export interface GridHandle {
  focus(): void;
  input(): HTMLTextAreaElement | null;
  /** Scrolls a cell into view (past the frozen rows and columns). */
  reveal(r: number, c: number): void;
  /** How many rows fit in view (for Page Up and Page Down). */
  pageRows(): number;
  /** Where a cell is on screen. */
  rectOf(r: number, c: number): DOMRect | null;
}

/** What a click on a cell's own widget asks for: a checkbox ticked, a list or a date picker opened, stars given. */
export type Smart = 'check' | 'list' | 'date' | 'rate';

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
  view: GridView;
  zoom: number;
  /** Formulas shown instead of what they give. */
  formulas?: boolean;
  /** Drawn over the cells, scrolling with them (the charts), placed from A1's corner by where the columns and rows are. */
  overlay?: (geo: GridGeo) => ReactNode;
  /** More ranges picked besides the selection (Ctrl+click, for a chart of several ranges). */
  more?: Rect[];
  /** `keepMore`: the selection grows (a Ctrl+drag), the other ranges picked stay. */
  onSel: (s: Sel, keepMore?: boolean) => void;
  /** Ctrl+click on a cell: a range of its own begins there, the ones picked stay picked. */
  onAddRange?: (r: number, c: number) => void;
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
  onSmart: (kind: Smart, r: number, c: number, at: DOMRect, n?: number) => void;
  /** A filter button pressed: its column, and where it is. */
  onFilter: (c: number, at: DOMRect) => void;
  /** The fill handle dragged from the selection over `target`; Ctrl held. */
  onFill: (target: Rect, ctrl: boolean) => void;
  onFillDown: () => void;
  /** A pick by the mouse is done (the button let go): the format painter paints what was picked. */
  onPicked?: () => void;
  /** The format painter is on: the pointer shows it. */
  painting?: boolean;
  /** The cells picked dragged by whole rows and columns (`dr`, `dc`) and dropped: moved, or copied with the copy key held. */
  onMove: (x: Rect, dr: number, dc: number, copy: boolean) => void;
  /** The picked rows (columns) from `from`, `count` of them, dropped before the row (column) `to`. */
  onMoveLines: (axis: 'row' | 'col', from: number, count: number, to: number) => void;
  onUnhide: (axis: 'row' | 'col', i: number) => void;
  onExpand: (r: number) => void;
  /** A comment's card clicked: its thread opens, to read and answer. */
  onComment?: (r: number, c: number) => void;
  /** What an AI cell of this sheet without its answer shows (by its name), and a cell's link opened. */
  ai?: (cell: string) => AiState | null;
  onOpenLink?: (url: string) => void;
  /** Groups of rows and columns (their brackets, with − and + to fold and show them), and a group's fold asked for. */
  outline?: { rows: Span[]; cols: Span[] };
  onFold?: (i: number, hide: boolean) => void;
}

// ---- measuring words ----------------------------------------------------------------------------------------------

let ctx2d: CanvasRenderingContext2D | null = null;
const widths = new Map<string, number>();
let family = 'system-ui, sans-serif';

/** A text's width in px in a cell's type (at 100%), remembered. */
export function textWidth(text: string, s?: CellStyle): number {
  const font = `${s?.i ? 'italic ' : ''}${s?.b ? 700 : 400} ${fontPx(s)}px ${s?.font && CELL_FONTS[s.font] ? CELL_FONTS[s.font] : family}`;
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
export const fontPx = (s?: CellStyle) => Math.round((((s?.size ?? 10) * 4) / 3) * 10) / 10;

// ---- how a cell looks -------------------------------------------------------------------------------------------------

interface Shown {
  text: string;
  style: React.CSSProperties;
  cls: string;
  /** An amount in the Accounting format: its sign, shown at the cell's left edge. */
  sign?: string;
}

/** A cell's words and look (numbers right, TRUE and FALSE and errors in the middle, words left unless it says), at a zoom. */
function shown(cell: Cell, v: ReturnType<Calc['value']>, z: number, formulas: boolean): Shown {
  const s = cell.s;
  let text = cell.v === undefined && cell.f === undefined ? '' : formatValue(v, s);
  if (formulas && cell.f !== undefined) text = inputText(cell);
  const style: React.CSSProperties = {};
  let cls = '';
  const align = s?.align ?? (formulas && cell.f !== undefined ? 'left' : typeof v === 'number' ? 'right' : typeof v === 'boolean' || isError(v) ? 'center' : 'left');
  style.justifyContent = align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start';
  style.textAlign = align;
  // Words wrapped start at the top (a row too short for them shows their beginning).
  style.alignItems = s?.valign === 'top' || (s?.wrap && !s.valign) ? 'flex-start' : s?.valign === 'bottom' ? 'flex-end' : 'center';
  if (s?.wrap) style.paddingTop = 3 * z;
  if (s?.b) style.fontWeight = 700;
  if (s?.i) style.fontStyle = 'italic';
  if (s?.u || s?.s) style.textDecoration = [s.u ? 'underline' : '', s.s ? 'line-through' : ''].filter(Boolean).join(' ');
  if (s?.size || z !== 1) style.fontSize = fontPx(s) * z;
  if (s?.font && CELL_FONTS[s.font]) style.fontFamily = CELL_FONTS[s.font];
  if (s?.fill) style.background = s.fill;
  const color = codeColor(v, s?.code) ?? s?.color ?? (s?.fill ? textOn(s.fill) : undefined);
  if (color) style.color = color;
  else if (isError(v)) cls = 'text-err';
  if (s?.wrap) style.whiteSpace = 'pre-wrap';
  let sign: string | undefined;
  if (s?.fmt === 'accounting' && !s.code && typeof v === 'number' && !(formulas && cell.f !== undefined)) {
    const [cur, body] = accountingParts(v, s);
    sign = cur;
    text = body;
  }
  return { text, style, cls, sign };
}

/** A border as CSS for one edge: its weight, pattern and colour (the text's when it has none). */
function edgeCss(b: string | undefined, z: number): string | null {
  const x = borderOf(b);
  if (!x) return null;
  const w = Math.max(1, Math.round((x.kind === 'medium' ? 2 : x.kind === 'thick' || x.kind === 'double' ? 3 : 1) * Math.min(z, 1.5)));
  return `${w}px ${x.kind === 'dashed' ? 'dashed' : x.kind === 'dotted' ? 'dotted' : x.kind === 'double' ? 'double' : 'solid'} ${x.color ?? 'var(--fg)'}`;
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
  const { sheet, si, calc, rev, rows, cols, sel, edit, readOnly, view: gv, zoom: z } = p;
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const [view, setView] = useState<View>({ top: 0, left: 0, w: 800, h: 600 });
  // A column or row being sized: its live size.
  const [sizing, setSizing] = useState<{ axis: 'col' | 'row'; i: number; size: number } | null>(null);
  // The fill handle being dragged: the cells it would fill.
  const [filling, setFilling] = useState<Rect | null>(null);
  // Cells being dragged to a new place (where they would land), or rows or columns (the boundary they would go before).
  const [moving, setMoving] = useState<{ x: Rect } | { axis: 'row' | 'col'; at: number } | null>(null);
  // The mouse is on the border of the cells picked: a drag from there moves them.
  const [edge, setEdge] = useState(false);
  // The cell the mouse is over (for its note).
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const touch = useRef(false);
  // A finger held still has opened the menu: lifting it must not click what now lies under it (the menu's dimmed page).
  const held = useRef(false);
  // An input method composing (Chinese, Japanese, Greek accents…): the caret is left where it is meanwhile.
  const composing = useRef(false);
  const cb = useRef(p);
  cb.current = p;
  // Groups' brackets in a gutter left of the row numbers (rows) and over the column letters (columns), a step a level.
  const rowLevels = p.outline?.rows.length ? Math.max(...p.outline.rows.map((s) => s.level)) : 0;
  const colLevels = p.outline?.cols.length ? Math.max(...p.outline.cols.map((s) => s.level)) : 0;
  const GW = rowLevels ? Math.round((6 + rowLevels * 13) * z) : 0;
  const GH = colLevels ? Math.round((4 + colLevels * 13) * z) : 0;
  const HH = Math.round(HEAD_H * z) + GH;
  const NW = Math.round(NUM_W * z) + GW;

  const fr = Math.min(sheet.freeze?.rows ?? 0, rows - 1);
  const fc = Math.min(sheet.freeze?.cols ?? 0, cols - 1);
  // The comments' threads by their cells.
  const threads = useMemo(() => new Map<string, SheetComment>((sheet.comments ?? []).map((c) => [c.cell, c])), [sheet.comments]);
  const colOff = useMemo(
    () => offsets(cols, (c) => (gv.hidC.has(c) ? 0 : Math.round((sizing?.axis === 'col' && sizing.i === c ? sizing.size : colW(sheet, c)) * z))),
    [cols, sheet, sheet.cols, sizing, rev, z, gv], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const rowOff = useMemo(
    () => offsets(rows, (r) => (gv.hidR.has(r) ? 0 : Math.round((sizing?.axis === 'row' && sizing.i === r ? sizing.size : rowH(sheet, r)) * z))),
    [rows, sheet, sheet.rows, sizing, rev, z, gv], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const FW = colOff[fc];
  const FH = rowOff[fr];
  const W = NW + colOff[cols];
  const H = HH + rowOff[rows];

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
    const r2 = Math.min(rows - 1, indexAt(rowOff, view.top + view.h - HH) + 3);
    // A few columns before the first in view too: their words may run on into it.
    const c1 = Math.max(fc, indexAt(colOff, view.left + FW) - 3);
    const c2 = Math.min(cols - 1, indexAt(colOff, view.left + view.w - NW) + 1);
    return { r1, r2, c1, c2 };
  }, [view, rowOff, colOff, rows, cols, fr, fc, FH, FW, HH, NW]);
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
      left: NW + colOff[c],
      top: region === 'left' ? rowOff[r] - FH : HH + rowOff[r],
    }),
    [colOff, rowOff, FH, NW, HH],
  );
  const regionOf = (r: number, c: number): Region => (r < fr ? (c < fc ? 'corner' : 'top') : c < fc ? 'left' : 'body');
  /** A cell's rectangle: its merge's when it is in one. */
  const spanOf = (r: number, c: number): Rect => gv.merges.at(r, c) ?? { r1: r, c1: c, r2: r, c2: c };

  // ---- where the pointer is ------------------------------------------------------------------------------------------
  /** The cell under a point on screen: -1 for the column letters or the row numbers. */
  const cellAt = (x: number, y: number): [number, number] => {
    const el = scroller.current!;
    const b = el.getBoundingClientRect();
    const vx = x - b.left;
    const vy = y - b.top;
    const c = vx < NW ? -1 : vx < NW + FW ? indexAt(colOff, vx - NW) : indexAt(colOff, vx - NW + el.scrollLeft);
    const r = vy < HH ? -1 : vy < HH + FH ? indexAt(rowOff, vy - HH) : indexAt(rowOff, vy - HH + el.scrollTop);
    return [Math.min(r, rows - 1), Math.min(c, cols - 1)];
  };
  /** A cell's (or its merge's) rectangle on screen. */
  const screenRect = (r: number, c: number): DOMRect | null => {
    const el = scroller.current;
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const m = spanOf(r, c);
    const x = b.left + NW + colOff[m.c1] - (m.c1 < fc ? 0 : el.scrollLeft);
    const y = b.top + HH + rowOff[m.r1] - (m.r1 < fr ? 0 : el.scrollTop);
    return new DOMRect(x, y, colOff[m.c2 + 1] - colOff[m.c1], rowOff[m.r2 + 1] - rowOff[m.r1]);
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
      const m = spanOf(r, c);
      if (r >= fr) {
        const y0 = rowOff[m.r1] - FH;
        const y1 = rowOff[m.r2 + 1] - FH;
        const room = el.clientHeight - HH - FH;
        if (y0 < el.scrollTop) el.scrollTop = y0;
        else if (y1 > el.scrollTop + room) el.scrollTop = Math.min(y0, y1 - room);
      }
      if (c >= fc) {
        const x0 = colOff[m.c1] - FW;
        const x1 = colOff[m.c2 + 1] - FW;
        const room = el.clientWidth - NW - FW;
        if (x0 < el.scrollLeft) el.scrollLeft = x0;
        else if (x1 > el.scrollLeft + room) el.scrollLeft = Math.min(x0, x1 - room);
      }
    },
    pageRows: () => Math.max(1, Math.floor((view.h - HH - FH) / (24 * z)) - 1),
    rectOf: screenRect,
  }));

  // ---- pointer: picking, dragging, typing in ----------------------------------------------------------------------------
  type DragKind = 'cells' | 'cols' | 'rows' | 'point' | 'handle' | 'fill' | 'move' | 'moveCols' | 'moveRows';
  const drag = useRef<{ kind: DragKind; id: number; x: number; y: number; moved: boolean; timer?: number; more?: boolean; from?: [number, number] } | null>(null);
  const auto = useRef<number | null>(null);

  /** The cells the fill handle would fill, dragged to (r, c): the selection grown down, up, right or left, whichever the pointer is furthest past. */
  const fillTarget = (r: number, c: number): Rect => {
    const x = rectOf(cb.current.sel);
    const dDown = r - x.r2;
    const dUp = x.r1 - r;
    const dRight = c - x.c2;
    const dLeft = x.c1 - c;
    const most = Math.max(dDown, dUp, dRight, dLeft);
    if (most <= 0) return x;
    if (most === dDown) return { ...x, r2: r };
    if (most === dUp) return { ...x, r1: r };
    if (most === dRight) return { ...x, c2: c };
    return { ...x, c1: c };
  };

  const extendTo = (r: number, c: number, kind: DragKind) => {
    const s = cb.current.sel;
    if (kind === 'point') return void cb.current.onPoint(Math.max(0, r), Math.max(0, c), true);
    if (kind === 'fill') return setFilling(fillTarget(Math.max(0, r), Math.max(0, c)));
    if (kind === 'move') {
      const from = drag.current?.from;
      if (!from) return;
      const x0 = rectOf(s);
      // Where the cells would land, kept on the sheet.
      const dr = Math.max(-x0.r1, Math.min(rows - 1 - x0.r2, r - from[0]));
      const dc = Math.max(-x0.c1, Math.min(cols - 1 - x0.c2, c - from[1]));
      return setMoving({ x: { r1: x0.r1 + dr, c1: x0.c1 + dc, r2: x0.r2 + dr, c2: x0.c2 + dc } });
    }
    if (kind === 'moveCols' || kind === 'moveRows') {
      const row = kind === 'moveRows';
      const x0 = rectOf(s);
      const i = row ? r : c;
      const [a, b] = row ? [x0.r1, x0.r2] : [x0.c1, x0.c2];
      // Dropped past the end of the rows picked: after the one pointed at; before it, if before them; on them: nowhere.
      return setMoving(i > b ? { axis: row ? 'row' : 'col', at: i + 1 } : i < a ? { axis: row ? 'row' : 'col', at: i } : null);
    }
    if (kind === 'cols') return cb.current.onSel({ ...s, fr: rows - 1, fc: Math.max(0, c) });
    if (kind === 'rows') return cb.current.onSel({ ...s, fr: Math.max(0, r), fc: cols - 1 });
    cb.current.onSel({ ...s, fr: Math.max(0, r), fc: Math.max(0, c) }, !!drag.current?.more);
  };

  /** While a drag is past the edge of the grid, it scrolls on. */
  const autoScroll = (x: number, y: number) => {
    if (auto.current) cancelAnimationFrame(auto.current);
    const el = scroller.current;
    const d = drag.current;
    if (!el || !d) return;
    const b = el.getBoundingClientRect();
    const dx = x < b.left + NW + FW ? -1 : x > b.right - 4 ? 1 : 0;
    const dy = y < b.top + HH + FH ? -1 : y > b.bottom - 4 ? 1 : 0;
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

  /** A click on a cell's own widget (a checkbox, a list's arrow, stars): what it asks for, or null. */
  const smartAt = (x: number, y: number, r: number, c: number): { kind: Smart; n?: number } | null => {
    const rule = gv.rules.any ? gv.rules.at(r, c)?.rule : undefined;
    if (!rule) return null;
    const b = screenRect(r, c);
    if (!b) return null;
    if (rule.type === 'checkbox') {
      const half = 9 * z;
      return Math.abs(x - (b.left + b.width / 2)) <= half + 2 && Math.abs(y - (b.top + b.height / 2)) <= half + 2 ? { kind: 'check' } : null;
    }
    if (rule.type === 'rating') {
      const star = 15 * z;
      const i = Math.floor((x - b.left - 5 * z) / star);
      return i >= 0 && i < (rule.max ?? 5) ? { kind: 'rate', n: i + 1 } : null;
    }
    if (rule.type === 'list') return x > b.right - 20 * z ? { kind: 'list' } : null;
    return null;
  };

  /** Whether a point on screen is on the border of the cells picked (a few px either side of it): a drag from there moves them. */
  const onEdge = (px: number, py: number): boolean => {
    const P = cb.current;
    if (P.readOnly || P.edit || touch.current) return false;
    const s = rectOf(P.sel);
    if ((s.r1 === 0 && s.r2 >= rows - 1) || (s.c1 === 0 && s.c2 >= cols - 1)) return false;
    const a = screenRect(s.r1, s.c1);
    const b = screenRect(s.r2, s.c2);
    if (!a || !b) return false;
    const t = 3;
    const outer = px >= a.left - t && px <= b.right + t && py >= a.top - t && py <= b.bottom + t;
    const inner = px > a.left + t && px < b.right - t && py > a.top + t && py < b.bottom - t;
    return outer && !inner;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-sizer],[data-own]') || t === input.current) return;
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
        held.current = true;
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
    // The border of the cells picked, or a picked row's number or column's letter: a drag moves them (a click is a click).
    if (!readOnly && !P.edit && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const x0 = rectOf(s);
      const allCols = x0.c1 === 0 && x0.c2 >= cols - 1;
      const allRows = x0.r1 === 0 && x0.r2 >= rows - 1;
      const kind: DragKind | null = r < 0 && c >= 0 ? (allRows && !allCols && c >= x0.c1 && c <= x0.c2 ? 'moveCols' : null) : c < 0 && r >= 0 ? (allCols && !allRows && r >= x0.r1 && r <= x0.r2 ? 'moveRows' : null) : r >= 0 && c >= 0 && onEdge(e.clientX, e.clientY) ? 'move' : null;
      if (kind) {
        drag.current = { kind, id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, from: [r, c] };
        scroller.current?.setPointerCapture(e.pointerId);
        input.current?.focus({ preventScroll: true });
        return;
      }
    }
    if (r < 0) {
      const next = e.shiftKey ? { ...s, ar: 0, fr: rows - 1, fc: c } : { r: 0, c, ar: 0, ac: c, fr: rows - 1, fc: c };
      P.onSel(next);
      drag.current = { kind: 'cols', id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    } else if (c < 0) {
      const next = e.shiftKey ? { ...s, ac: 0, fr: r, fc: cols - 1 } : { r, c: 0, ar: r, ac: 0, fr: r, fc: cols - 1 };
      P.onSel(next);
      drag.current = { kind: 'rows', id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    } else {
      // Ctrl+click (⌘ on a Mac): another range, the ones picked staying picked (a chart of several ranges).
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !P.edit && P.onAddRange) {
        P.onAddRange(r, c);
        drag.current = { kind: 'cells', id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, more: true };
        scroller.current?.setPointerCapture(e.pointerId);
        input.current?.focus({ preventScroll: true });
        return;
      }
      const smart = !e.shiftKey && !readOnly ? smartAt(e.clientX, e.clientY, r, c) : null;
      P.onSel(e.shiftKey ? { ...s, fr: r, fc: c } : { r, c, ar: r, ac: c, fr: r, fc: c });
      if (smart) {
        const at = screenRect(r, c);
        if (at) P.onSmart(smart.kind, r, c, at, smart.n);
        return;
      }
      drag.current = { kind: 'cells', id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    }
    scroller.current?.setPointerCapture(e.pointerId);
    input.current?.focus({ preventScroll: true });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d && e.pointerType === 'mouse') {
      // The cell pointed at, for its note or comment.
      const [r, c] = cellAt(e.clientX, e.clientY);
      const m = r >= 0 && c >= 0 ? spanOf(r, c) : null;
      const k = m ? refName(m.r1, m.c1) : '';
      const next = m && (sheet.cells[k]?.note || threads.has(k)) ? { r: m.r1, c: m.c1 } : null;
      if (next?.r !== hover?.r || next?.c !== hover?.c) setHover(next);
      const on = r >= 0 && c >= 0 && !(e.target as HTMLElement).closest('[data-own]') && onEdge(e.clientX, e.clientY);
      if (on !== edge) setEdge(on);
      return;
    }
    if (!d || d.id !== e.pointerId) return;
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 6) d.moved = true;
    if (touch.current && d.kind !== 'handle') return;
    const [r, c] = cellAt(e.clientX, e.clientY);
    extendTo(r < 0 ? (d.kind === 'cols' ? rows - 1 : 0) : r, c < 0 ? (d.kind === 'rows' ? cols - 1 : 0) : c, d.kind === 'handle' ? 'cells' : d.kind);
    autoScroll(e.clientX, e.clientY);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    finishPointer(e);
    // A pick is done: the format painter paints it.
    if (d && d.id === e.pointerId && (d.kind === 'cells' || d.kind === 'cols' || d.kind === 'rows' || (!d.moved && (d.kind === 'move' || d.kind === 'moveCols' || d.kind === 'moveRows')))) cb.current.onPicked?.();
  };
  const finishPointer = (e: React.PointerEvent) => {
    const d = drag.current;
    if (auto.current) cancelAnimationFrame(auto.current);
    auto.current = null;
    drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    if (d.timer) clearTimeout(d.timer);
    if (d.kind === 'move' || d.kind === 'moveCols' || d.kind === 'moveRows') {
      const m = moving;
      setMoving(null);
      const P = cb.current;
      const [r, c] = cellAt(e.clientX, e.clientY);
      if (d.moved && m) {
        const x0 = rectOf(P.sel);
        if ('axis' in m) P.onMoveLines(m.axis, m.axis === 'row' ? x0.r1 : x0.c1, m.axis === 'row' ? x0.r2 - x0.r1 + 1 : x0.c2 - x0.c1 + 1, m.at);
        else if (m.x.r1 !== x0.r1 || m.x.c1 !== x0.c1) P.onMove(x0, m.x.r1 - x0.r1, m.x.c1 - x0.c1, isCopyDrag(e));
        return;
      }
      if (d.moved) return;
      // No drag: it was a click after all.
      if (d.kind === 'moveCols') return P.onSel({ r: 0, c, ar: 0, ac: c, fr: rows - 1, fc: c });
      if (d.kind === 'moveRows') return P.onSel({ r, c: 0, ar: r, ac: 0, fr: r, fc: cols - 1 });
      if (r >= 0 && c >= 0) P.onSel({ r, c, ar: r, ac: c, fr: r, fc: c });
      return;
    }
    if (d.kind === 'fill') {
      const target = filling;
      setFilling(null);
      if (target) cb.current.onFill(target, e.ctrlKey || e.metaKey);
      return;
    }
    if (!touch.current || d.kind === 'handle' || d.moved) return;
    // A tap: picks the cell; on the cell picked already, types in it (the keyboard opens, as it is a tap).
    const P = cb.current;
    const [r, c] = cellAt(e.clientX, e.clientY);
    if (r < 0 && c < 0) return P.onSel({ r: 0, c: 0, ar: 0, ac: 0, fr: rows - 1, fc: cols - 1 });
    if (r < 0) return P.onSel({ r: 0, c, ar: 0, ac: c, fr: rows - 1, fc: c });
    if (c < 0) return P.onSel({ r, c: 0, ar: r, ac: 0, fr: r, fc: cols - 1 });
    if (P.edit && P.onPoint(r, c, false)) return;
    const smart = !P.readOnly && !P.edit ? smartAt(e.clientX, e.clientY, r, c) : null;
    if (smart) {
      P.onSel({ r, c, ar: r, ac: c, fr: r, fc: c });
      const at = screenRect(r, c);
      if (at) P.onSmart(smart.kind, r, c, at, smart.n);
      return;
    }
    const s = P.sel;
    const m = spanOf(r, c);
    if (!P.edit && !P.readOnly && s.r === m.r1 && s.c === m.c1 && (single(s) || sameRect(rectOf(s), m))) {
      const rule = gv.rules.any ? gv.rules.at(m.r1, m.c1)?.rule : undefined;
      const at = screenRect(m.r1, m.c1);
      // A list's cell opens its list; a date's, the calendar; others are typed in.
      if (rule?.type === 'list' && at) return P.onSmart('list', m.r1, m.c1, at);
      input.current?.focus({ preventScroll: true });
      P.onEdit('edit');
      return;
    }
    P.onSel({ r, c, ar: r, ac: c, fr: r, fc: c });
    scroller.current?.focus({ preventScroll: true });
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-sizer],[data-own]') || readOnly) return;
    const [r, c] = cellAt(e.clientX, e.clientY);
    if (r < 0 || c < 0 || cb.current.edit) return;
    const m = spanOf(r, c);
    const rule = gv.rules.any ? gv.rules.at(m.r1, m.c1)?.rule : undefined;
    if (rule?.type === 'checkbox' || rule?.type === 'rating') return;
    const at = screenRect(m.r1, m.c1);
    if (rule?.type === 'list' && at) return cb.current.onSmart('list', m.r1, m.c1, at);
    const cell = sheet.cells[refName(m.r1, m.c1)];
    const fmt = cell?.s?.fmt;
    if (at && cell?.f === undefined && (rule?.type === 'date' || fmt === 'date' || fmt === 'datetime')) return cb.current.onSmart('date', m.r1, m.c1, at);
    cb.current.onSel({ r: m.r1, c: m.c1, ar: m.r1, ac: m.c1, fr: m.r2, fc: m.c2 });
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
    // A row's number keeps the selection only when whole rows are picked and it is one of them (a column's letter
    // likewise): else that row (column) is picked, so its menu is about it.
    const allCols = x.c1 === 0 && x.c2 >= cols - 1;
    const allRows = x.r1 === 0 && x.r2 >= rows - 1;
    const inside = c < 0 && r >= 0 ? allCols && r >= x.r1 && r <= x.r2 : r < 0 && c >= 0 ? allRows && c >= x.c1 && c <= x.c2 : (r < 0 || (r >= x.r1 && r <= x.r2)) && (c < 0 || (c >= x.c1 && c <= x.c2));
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
      size = Math.max(axis === 'col' ? 24 : 16, Math.min(axis === 'col' ? 1200 : 600, Math.round(base + ((axis === 'col' ? ev.clientX : ev.clientY) - start) / z)));
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
  // cell (its merge), a frozen cell's place following the scrolling, and over the bands while words are typed in it.
  const am = spanOf(sel.r, sel.c);
  const at = { left: NW + colOff[am.c1] + (am.c1 < fc ? view.left : 0), top: HH + rowOff[am.r1] + (am.r1 < fr ? view.top : 0) };
  const cellW = colOff[am.c2 + 1] - colOff[am.c1];
  const cellH = rowOff[am.r2 + 1] - rowOff[am.r1];
  const editCell = sheet.cells[refName(am.r1, am.c1)];
  const editW = edit ? Math.min(Math.max(cellW, textWidth(edit.text || ' ', editCell?.s) * z + 18), Math.max(cellW, view.w - (at.left - view.left) - 8)) : cellW;
  const lineCount = edit ? edit.text.split('\n').length + (editCell?.s?.wrap ? Math.floor((textWidth(edit.text, editCell.s) * z) / Math.max(40, editW - 12)) : 0) : 1;
  const editH = Math.max(cellH, lineCount * (fontPx(editCell?.s) * z * 1.35) + 8);

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
        fontSize: fontPx(editCell?.s) * z,
        fontWeight: edit && editCell?.s?.b ? 700 : undefined,
        fontStyle: edit && editCell?.s?.i ? 'italic' : undefined,
        fontFamily: edit && editCell?.s?.font ? CELL_FONTS[editCell.s.font] : undefined,
        whiteSpace: 'pre-wrap',
        // While not typing it sits still and unseen at the cell (the keys and the clipboard come to it).
        caretColor: edit ? undefined : 'transparent',
      }}
    />
  );

  // ---- drawing --------------------------------------------------------------------------------------------------------
  const allRows = useMemo(() => ({ r1: 0, r2: fr - 1 }), [fr]);
  const allCols = useMemo(() => ({ c1: 0, c2: fc - 1 }), [fc]);
  const common = { sheet, si, calc, rev, fc, place, colOff, rowOff, view: gv, z, formulas: !!p.formulas, ai: p.ai };
  const cellsBody = <Cells {...common} rows={stableRange} cols={stableRange} region="body" />;
  const cellsTop = fr > 0 && <Cells {...common} rows={allRows} cols={stableRange} region="top" />;
  const cellsLeft = fc > 0 && <Cells {...common} rows={stableRange} cols={allCols} region="left" />;
  const cellsCorner = fr > 0 && fc > 0 && <Cells {...common} rows={allRows} cols={allCols} region="corner" />;

  const x = rectOf(sel);
  const selCols = (c: number) => c >= x.c1 && c <= x.c2;
  const selRows = (r: number) => r >= x.r1 && r <= x.r2;
  const wholeCols = x.r1 === 0 && x.r2 >= rows - 1;
  const wholeRows = x.c1 === 0 && x.c2 >= cols - 1;
  const fx = gv.filter?.x;
  const marker = 'absolute z-20 flex items-center justify-center rounded-sm border border-line-2 bg-elevated text-fg-3 shadow-sm hover:text-accent';

  const colHead = (c: number) => {
    const w = colOff[c + 1] - colOff[c];
    if (!w) return null;
    // Columns hidden by hand next to this one: a mark that shows them.
    const hiddenAfter = gv.hidC.has(c + 1);
    const hiddenBefore = c > 0 && gv.hidC.has(c - 1) && [...Array(c).keys()].every((k) => gv.hidC.has(k));
    return (
      <div
        key={c}
        className={cx('absolute flex items-center justify-center border-r border-b border-line select-none', selCols(c) ? (wholeCols ? 'bg-accent text-accent-fg' : 'bg-accent-soft font-semibold text-accent') : 'bg-panel text-fg-3')}
        style={{ left: NW + colOff[c], top: GH, width: w, height: HH - GH, fontSize: 11 * Math.min(z, 1.4) }}
      >
        <span translate="no">{colName(c)}</span>
        {!readOnly && <span data-sizer onPointerDown={startSize('col', c)} onDoubleClick={() => cb.current.onFit('col', c)} className="absolute top-0 -right-[4px] z-10 h-full w-[8px] cursor-col-resize hover:bg-accent/40" />}
        {hiddenAfter && (
          <button type="button" data-own title="Show the hidden columns" aria-label="Show the hidden columns" onClick={() => cb.current.onUnhide('col', c + 1)} className={marker} style={{ right: -7, top: 3, width: 14, height: HH - 6 }}>
            <ChevronsLeftRight size={10} />
          </button>
        )}
        {hiddenBefore && (
          <button type="button" data-own title="Show the hidden columns" aria-label="Show the hidden columns" onClick={() => cb.current.onUnhide('col', c - 1)} className={marker} style={{ left: 1, top: 3, width: 14, height: HH - 6 }}>
            <ChevronsLeftRight size={10} />
          </button>
        )}
      </div>
    );
  };
  const rowHead = (r: number, region: 'corner' | 'left') => {
    const h = rowOff[r + 1] - rowOff[r];
    if (!h) return null;
    const hiddenAfter = gv.handR.has(r + 1);
    const hiddenBefore = r > 0 && gv.handR.has(r - 1) && [...Array(r).keys()].every((k) => gv.hidR.has(k));
    // Rows a filter runs over are numbered in the accent colour, as spreadsheets mark a filtered range.
    const filtered = !!fx && gv.filter!.on.size > 0 && r > fx.r1 && r <= fx.r2;
    return (
      <div
        key={r}
        className={cx(
          'group absolute flex items-center justify-center border-r border-b border-line tabular-nums select-none',
          selRows(r) ? (wholeRows ? 'bg-accent text-accent-fg' : 'bg-accent-soft font-semibold text-accent') : filtered ? 'bg-panel text-accent' : 'bg-panel text-fg-3',
        )}
        style={{ top: region === 'left' ? rowOff[r] - FH : HH + rowOff[r], left: GW, width: NW - GW, height: h, fontSize: 11 * Math.min(z, 1.4) }}
      >
        {/* The number makes room for the button that expands the row (its cells as a card, as Airtable opens a record). */}
        <span translate="no" className={cx(h >= 16 && (sel.r === r ? 'pl-3.5' : 'group-hover:pl-3.5'))}>
          {r + 1}
        </span>
        {h >= 16 && (
          <button
            type="button"
            data-own
            title="Expand row (Space)"
            aria-label="Expand row"
            onClick={() => cb.current.onExpand(r)}
            className={cx('absolute top-1/2 left-0.5 h-4 w-4 -translate-y-1/2 place-items-center rounded text-fg-3 hover:bg-bg-2 hover:text-accent', sel.r === r ? 'grid' : 'hidden group-hover:grid')}
          >
            <Maximize2 size={10} />
          </button>
        )}
        {!readOnly && <span data-sizer onPointerDown={startSize('row', r)} onDoubleClick={() => cb.current.onFit('row', r)} className="absolute -bottom-[4px] left-0 z-10 h-[8px] w-full cursor-row-resize hover:bg-accent/40" />}
        {hiddenAfter && (
          <button type="button" data-own title="Show the hidden rows" aria-label="Show the hidden rows" onClick={() => cb.current.onUnhide('row', r + 1)} className={marker} style={{ bottom: -7, right: 3, width: 18, height: 14 }}>
            <ChevronsUpDown size={10} />
          </button>
        )}
        {hiddenBefore && (
          <button type="button" data-own title="Show the hidden rows" aria-label="Show the hidden rows" onClick={() => cb.current.onUnhide('row', r - 1)} className={marker} style={{ top: 1, right: 3, width: 18, height: 14 }}>
            <ChevronsUpDown size={10} />
          </button>
        )}
      </div>
    );
  };

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

  const multi = (!(x.r1 === x.r2 && x.c1 === x.c2) && !sameRect(x, am)) || !!p.more?.length;
  const overlay = (region: Region) => {
    const corner = place(x.r2, x.c2, region);
    const cx2 = corner.left + colOff[x.c2 + 1] - colOff[x.c2];
    const cy2 = corner.top + rowOff[x.r2 + 1] - rowOff[x.r2];
    return (
      <>
        {p.refs.map((b, i) => boxes(b, region, 'border-2 border-dashed', { borderColor: b.color, background: `color-mix(in srgb, ${b.color} 10%, transparent)` }, `ref${i}`))}
        {p.more?.map((b, i) => boxes(b, region, 'border border-accent bg-accent/10', {}, `more${i}`))}
        {p.cut && boxes(p.cut, region, 'border-2 border-dashed border-accent', {}, 'cut')}
        {multi && boxes(x, region, 'border border-accent bg-accent/10', {}, 'sel')}
        {filling && boxes(filling, region, 'border-2 border-dashed border-fg-3', {}, 'fill')}
        {moving && 'x' in moving && boxes(moving.x, region, 'border-2 border-dashed border-accent bg-accent/10', {}, 'moving')}
        {regionOf(am.r1, am.c1) === region && !edit && boxes(am, region, 'border-2 border-accent', {}, 'act')}
        {/* A filter's buttons on its header row. */}
        {fx &&
          regionOf(fx.r1, fx.c1) === region &&
          [...Array(fx.c2 - fx.c1 + 1).keys()].map((j) => {
            const c = fx.c1 + j;
            const w = colOff[c + 1] - colOff[c];
            const hgt = rowOff[fx.r1 + 1] - rowOff[fx.r1];
            if (!w || !hgt || (region === 'body' && (c < stableRange.c1 || c > stableRange.c2))) return null;
            const pos = place(fx.r1, c, region);
            const on = gv.filter!.on.has(c);
            const size = Math.min(18 * z, hgt - 4);
            return (
              <button
                key={`f${c}`}
                type="button"
                data-own
                title="Sort and filter this column"
                aria-label="Sort and filter this column"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => cb.current.onFilter(c, (e.currentTarget as HTMLElement).getBoundingClientRect())}
                className={cx('absolute z-10 grid place-items-center rounded', on ? 'bg-accent text-accent-fg' : 'bg-bg-2/90 text-fg-2 hover:text-fg')}
                style={{ left: pos.left + w - size - 3, top: pos.top + (hgt - size) / 2, width: size, height: size }}
              >
                <ListFilter size={Math.round(size * 0.65)} />
              </button>
            );
          })}
        {/* The fill handle: drag it to fill, or double-click it to fill down. */}
        {regionOf(x.r2, x.c2) === region && !readOnly && !edit && !touch.current && (
          <div
            key="fill"
            data-own
            title="Drag to fill; double-click to fill down"
            className="absolute z-30 h-[9px] w-[9px] cursor-crosshair border-2 border-bg bg-accent"
            style={{ left: cx2 - 5, top: cy2 - 5 }}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              drag.current = { kind: 'fill', id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
              setFilling(x);
              scroller.current?.setPointerCapture(e.pointerId);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              cb.current.onFillDown();
            }}
          />
        )}
        {regionOf(x.r2, x.c2) === region && !readOnly && !edit && touch.current && (
          <div
            key="handle"
            className="absolute z-30 h-6 w-6 -translate-x-1/2 -translate-y-1/2 touch-none"
            style={{ left: cx2, top: cy2 }}
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
  };

  /** The grid's lines in a band, at the right and bottom edge of each column and row in view. */
  const gridLines = (region: Region) => {
    // View → Gridlines off: none drawn.
    if (sheet.noGrid) return null;
    const rs = region === 'corner' || region === 'top' ? allRows : stableRange;
    const cs = region === 'corner' || region === 'left' ? allCols : stableRange;
    const out = [];
    const y0 = place(rs.r1, 0, region).top;
    const y1 = place(rs.r2, 0, region).top + rowOff[rs.r2 + 1] - rowOff[rs.r2];
    const x0 = NW + colOff[cs.c1];
    const x1 = NW + colOff[cs.c2 + 1];
    for (let c = cs.c1; c <= cs.c2; c++) if (colOff[c + 1] > colOff[c]) out.push(<div key={`c${c}`} className="absolute w-px bg-line" style={{ left: NW + colOff[c + 1] - 1, top: y0, height: y1 - y0 }} />);
    for (let r = rs.r1; r <= rs.r2; r++) {
      if (rowOff[r + 1] === rowOff[r]) continue;
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

  // A note, and a comment's thread in brief: shown beside the cell pointed at, or the active cell, while nothing is
  // typed; a click on a comment's opens its thread.
  const activeKey = refName(am.r1, am.c1);
  const noteAt = hover ?? (!edit && (sheet.cells[activeKey]?.note || threads.get(activeKey)) ? { r: am.r1, c: am.c1 } : null);
  const noteText = noteAt ? sheet.cells[refName(noteAt.r, noteAt.c)]?.note : undefined;
  const thread = noteAt ? threads.get(refName(noteAt.r, noteAt.c)) : undefined;
  let noteCard: ReactNode = null;
  if (noteAt && (noteText || thread)) {
    const m = spanOf(noteAt.r, noteAt.c);
    const left = NW + colOff[m.c2 + 1] + (m.c2 < fc ? view.left : 0) + 4;
    const top = HH + rowOff[m.r1] + (m.r1 < fr ? view.top : 0);
    const n = thread?.replies?.length ?? 0;
    noteCard = (
      <div
        data-own={thread ? '' : undefined}
        onClick={thread ? () => cb.current.onComment?.(noteAt.r, noteAt.c) : undefined}
        className={cx(
          'absolute z-40 max-w-[260px] min-w-[120px] rounded-lg border border-line bg-elevated px-2.5 py-1.5 text-[12.5px] leading-snug whitespace-pre-wrap text-fg shadow-lg',
          thread ? 'cursor-pointer hover:border-line-2' : 'pointer-events-none',
        )}
        style={{ left: Math.min(left, NW + colOff[cols] - 140), top }}
      >
        {noteText && <div translate="no">{noteText}</div>}
        {thread && (
          <div className={cx(noteText && 'mt-1.5 border-t border-line pt-1.5')}>
            <div className="flex items-center gap-1.5 text-[11.5px] text-fg-3">
              <MessageSquare size={11} className="text-[#a142f4]" />
              {thread.author ? <span translate="no">{thread.author}</span> : <span>{thread.by === 'agent' ? 'Agent' : 'You'}</span>}
              {thread.resolved && <span>Resolved</span>}
              {n > 0 && <span>{n === 1 ? '1 reply' : `${n} replies`}</span>}
            </div>
            <div translate="no" className="line-clamp-3">
              {thread.text}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Groups' brackets and buttons: a line along each group's rows (columns), a level a step in, with − at the row
  // (column) after it to fold it away, + to show it again; those in view only.
  const foldBtn = (s: Span, style: React.CSSProperties) => (
    <button
      key={`f${s.i}`}
      type="button"
      data-own
      title={s.hidden ? 'Show the group' : 'Fold the group away'}
      aria-label={s.hidden ? 'Show the group' : 'Fold the group away'}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => p.onFold?.(s.i, !s.hidden)}
      className="absolute z-10 grid place-items-center rounded-[3px] border border-fg-3 bg-bg text-[10px] leading-none font-semibold text-fg-2 hover:border-accent hover:text-accent"
      style={{ width: Math.round(11 * z), height: Math.round(11 * z), ...style }}
    >
      {s.hidden ? '+' : '−'}
    </button>
  );
  const outlineRows = (p.outline?.rows ?? [])
    .filter((s) => s.b + 1 >= stableRange.r1 && s.a <= stableRange.r2 + 1 && s.a >= fr)
    .flatMap((s) => {
      const x = Math.round((4 + (s.level - 1) * 13) * z);
      const y0 = rowOff[s.a] - FH;
      const y1 = rowOff[Math.min(s.b + 1, rows)] - FH;
      const after = Math.min(s.b + 1, rows - 1);
      const btnY = rowOff[after] - FH + (rowOff[after + 1] - rowOff[after]) / 2 - Math.round(5.5 * z);
      return [
        !s.hidden && y1 > y0 ? <div key={`l${s.i}`} aria-hidden className="pointer-events-none absolute border-t border-l border-fg-3" style={{ left: x + Math.round(5 * z), top: y0 + 3, width: Math.round(4 * z), height: Math.max(0, y1 - y0 - 3) }} /> : null,
        foldBtn(s, { left: x, top: btnY }),
      ];
    });
  const outlineCols = (p.outline?.cols ?? [])
    .filter((s) => s.b + 1 >= stableRange.c1 && s.a <= stableRange.c2 + 1 && s.a >= fc)
    .flatMap((s) => {
      const y = Math.round((3 + (s.level - 1) * 13) * z);
      const x0 = NW + colOff[s.a];
      const x1 = NW + colOff[Math.min(s.b + 1, cols)];
      const after = Math.min(s.b + 1, cols - 1);
      const btnX = NW + colOff[after] + (colOff[after + 1] - colOff[after]) / 2 - Math.round(5.5 * z);
      return [
        !s.hidden && x1 > x0 ? <div key={`l${s.i}`} aria-hidden className="pointer-events-none absolute border-t border-l border-fg-3" style={{ left: x0 + 3, top: y + Math.round(5 * z), width: Math.max(0, x1 - x0 - 3), height: Math.round(4 * z) }} /> : null,
        foldBtn(s, { left: btnX, top: y }),
      ];
    });

  // A link's card under the active cell (HYPERLINK, Insert → Link), while nothing is typed.
  const link = !edit && p.onOpenLink ? calc.special(si, am.r1, am.c1) : null;
  const linkCard =
    link?.kind === 'link' ? (
      <LinkCard url={link.url} left={NW + colOff[am.c1] + (am.c1 < fc ? view.left : 0)} top={HH + rowOff[am.r2 + 1] + (am.r1 < fr ? view.top : 0) + 4} onOpen={(u) => p.onOpenLink?.(u)} />
    ) : null;

  return (
    <div
      ref={scroller}
      tabIndex={-1}
      onScroll={onScroll}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => hover && setHover(null)}
      onPointerCancel={() => {
        if (drag.current?.timer) clearTimeout(drag.current.timer);
        drag.current = null;
        setFilling(null);
        setMoving(null);
      }}
      onTouchEnd={(e) => {
        if (!held.current) return;
        held.current = false;
        e.preventDefault();
      }}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => e.target === scroller.current && cb.current.onKey(e)}
      className={cx('relative min-h-0 flex-1 overflow-auto overscroll-contain bg-bg leading-[1.35] text-fg outline-none select-none [-webkit-touch-callout:none]', (edge || moving) && 'cursor-move', p.painting && 'cursor-copy')}
      style={{ fontSize: 13.3 * z }}
    >
      <div className="relative" style={{ width: W, height: H }}>
        {/* The letters along the top, with the frozen rows under them: they stay at the top. */}
        <div className="sticky top-0 z-30 bg-bg" style={{ width: W, height: HH + FH }}>
          <div className="sticky left-0 z-10 bg-bg" style={{ width: NW + FW, height: HH + FH }}>
            <div className="absolute top-0 left-0 border-r border-b border-line bg-panel" style={{ width: NW, height: HH }} />
            {frozenHeads}
            {frozenNums}
            {fr > 0 && fc > 0 && gridLines('corner')}
            {cellsCorner}
            {fr > 0 && fc > 0 && overlay('corner')}
            {/* Where the frozen part ends: a firmer line. */}
            {fc > 0 && <div className="pointer-events-none absolute top-0 z-20 bg-fg-3/50" style={{ left: NW + FW - 1, width: 2, height: HH + FH }} />}
            {fr > 0 && <div className="pointer-events-none absolute left-0 z-20 bg-fg-3/50" style={{ top: HH + FH - 1, height: 2, width: NW + FW }} />}
          </div>
          {heads}
          {moving && 'axis' in moving && moving.axis === 'col' && <div className="pointer-events-none absolute z-30 bg-accent" style={{ left: NW + colOff[moving.at] - 1, top: GH, width: 3, height: HH - GH }} />}
          {outlineCols}
          {fr > 0 && gridLines('top')}
          {cellsTop}
          {fr > 0 && overlay('top')}
          {fr > 0 && <div className="pointer-events-none absolute left-0 z-[5] bg-fg-3/50" style={{ top: HH + FH - 1, height: 2, width: W }} />}
        </div>
        {/* The numbers down the side, with the frozen columns beside them: they stay at the left. */}
        <div className="sticky left-0 z-20 bg-bg" style={{ width: NW + FW, height: H - HH - FH }}>
          {nums}
          {moving && 'axis' in moving && moving.axis === 'row' && moving.at >= fr && <div className="pointer-events-none absolute z-30 bg-accent" style={{ top: rowOff[moving.at] - FH - 1, left: GW, height: 3, width: NW - GW }} />}
          {outlineRows}
          {fc > 0 && gridLines('left')}
          {cellsLeft}
          {fc > 0 && overlay('left')}
          {fc > 0 && <div className="pointer-events-none absolute top-0 z-20 bg-fg-3/50" style={{ left: NW + FW - 1, width: 2, height: H - HH - FH }} />}
        </div>
        <div className="absolute top-0 left-0" style={{ width: W, height: H }}>
          {gridLines('body')}
          {cellsBody}
          {overlay('body')}
          {p.overlay && (
            <div className="absolute z-10" style={{ left: NW, top: HH }}>
              {p.overlay({ colOff, rowOff, z })}
            </div>
          )}
        </div>
        {noteCard}
        {!noteCard && linkCard}
        {box}
      </div>
    </div>
  );
});

const single = (s: Sel) => s.ar === s.fr && s.ac === s.fc;
const sameRect = (a: Rect, b: Rect) => a.r1 === b.r1 && a.c1 === b.c1 && a.r2 === b.r2 && a.c2 === b.c2;

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
  view: GridView;
  z: number;
  formulas: boolean;
  ai?: (cell: string) => AiState | null;
}

/**
 * The cells of a band in view: filled ones, those its rules draw on (checkboxes, stars, conditional looks) and merged
 * ones; words run on over empty cells to their right, as in a spreadsheet.
 */
const Cells = memo(function Cells({ sheet, si, calc, rows, cols, fc, region, place, colOff, rowOff, view: gv, z, formulas, ai }: CellsProps) {
  // View → Gridlines off: cells draw no lines of their own either.
  const line = sheet.noGrid ? 'border-transparent' : 'border-line';
  const out: React.ReactNode[] = [];
  const lines: React.ReactNode[] = [];
  // Each list's options once per drawing (a list from a range reads its cells).
  const optionsCache = new Map<Validation, ListOption[]>();
  const optionsOf = (rule: Validation) => {
    let o = optionsCache.get(rule);
    if (!o) optionsCache.set(rule, (o = listOptions(calc, si, rule)));
    return o;
  };
  // Merges that reach into the band, drawn once each from their first cell; their other cells are not drawn.
  const merges = gv.merges.list.filter((m) => m.r2 >= rows.r1 && m.r1 <= rows.r2 && m.c2 >= cols.c1 && m.c1 <= cols.c2);
  // What formulas spill into the band's cells that hold nothing (shown in their formula's number format).
  const ghosts = new Map<string, { v: ReturnType<Calc['value']>; s?: CellStyle }>();
  for (const { r, c, sp } of calc.spillsOf(si)) {
    const s = sheet.cells[refName(r, c)]?.s;
    for (let rr = Math.max(r, rows.r1); rr <= Math.min(r + sp.h - 1, rows.r2); rr++)
      for (let cc = Math.max(c, cols.c1); cc <= Math.min(c + sp.w - 1, cols.c2); cc++) {
        if (rr === r && cc === c) continue;
        const k = refName(rr, cc);
        const own = sheet.cells[k];
        if (own?.v !== undefined || own?.f !== undefined) continue;
        ghosts.set(k, { v: sp.d[(rr - r) * sp.w + (cc - c)], s: own?.s ?? s });
      }
  }
  // Cells with a comment's open thread (marked in their corner), drawn though they hold nothing.
  const open = new Set((sheet.comments ?? []).filter((c) => !c.resolved).map((c) => c.cell));
  // Cells the rules draw on though they hold nothing: in view, in a rule's range.
  const extra = new Set<string>(open);
  if (gv.cf.any || gv.rules.any) {
    for (let r = rows.r1; r <= rows.r2; r++) {
      if (rowOff[r + 1] === rowOff[r]) continue;
      for (let c = cols.c1; c <= cols.c2; c++) {
        const k = refName(r, c);
        if (sheet.cells[k] || colOff[c + 1] === colOff[c]) continue;
        const rule = gv.rules.any ? gv.rules.at(r, c)?.rule : undefined;
        if (rule?.type === 'checkbox' || rule?.type === 'rating' || (gv.cf.any && gv.cf.at(r, c))) extra.add(k);
      }
    }
  }
  const draw = (r: number, c: number, m: Rect | null) => {
    const k = refName(r, c);
    const ghost = ghosts.get(k);
    const cell: Cell = ghost ? { v: ghost.v === null || typeof ghost.v === 'object' ? '' : ghost.v, s: ghost.s } : (sheet.cells[k] ?? {});
    const filled = cell.v !== undefined || cell.f !== undefined;
    const v = ghost ? ghost.v : filled ? calc.value(si, r, c) : null;
    const look = shown(cell, v, z, formulas);
    const r2 = m ? m.r2 : r;
    const c2 = m ? m.c2 : c;
    let w = colOff[c2 + 1] - colOff[c];
    const h = rowOff[r2 + 1] - rowOff[r];
    if (!w || !h) return;
    const style: React.CSSProperties = { ...look.style };
    // Conditional formatting: its look over the cell's own, a colour scale's fill, a data bar.
    const cfLook = gv.cf.any ? gv.cf.at(r, c) : null;
    if (cfLook?.style) {
      const s = cfLook.style;
      if (s.b) style.fontWeight = 700;
      if (s.i) style.fontStyle = 'italic';
      if (s.u || s.s) style.textDecoration = [s.u ? 'underline' : '', s.s ? 'line-through' : ''].filter(Boolean).join(' ');
      if (s.fill) style.background = s.fill;
      if (s.color || s.fill) style.color = s.color ?? textOn(s.fill!);
    }
    if (cfLook?.scale && !cfLook.style?.fill) {
      style.background = cfLook.scale;
      if (!cell.s?.color) style.color = textOn(cfLook.scale);
    }
    const rule = gv.rules.any ? gv.rules.at(r, c) : null;
    let text = look.text;
    let content: ReactNode = null;
    if (rule?.rule.type === 'checkbox') {
      const on = isTicked(v);
      const s = Math.round(16 * z);
      content = (
        <span className="flex w-full items-center justify-center">
          <span className={cx('grid place-items-center rounded-[4px] border-2', on ? 'border-accent bg-accent text-accent-fg' : 'border-fg-3')} style={{ width: s, height: s }}>
            {on && (
              <svg viewBox="0 0 12 12" width={s - 4} height={s - 4} aria-hidden>
                <path d="M2.5 6.2 5 8.6 9.6 3.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
        </span>
      );
    } else if (rule?.rule.type === 'rating' && (typeof v === 'number' || v === null)) {
      const max = rule.rule.max ?? 5;
      const n = Math.max(0, Math.min(max, Math.round(typeof v === 'number' ? v : 0)));
      content = (
        <span className="flex items-center" style={{ fontSize: 14 * z, letterSpacing: 1 * z, paddingLeft: 1 * z }}>
          {[...Array(max).keys()].map((i) => (
            <span key={i} style={{ width: 15 * z, color: i < n ? '#f5a623' : undefined }} className={i < n ? '' : 'text-fg-3 opacity-40'}>
              ★
            </span>
          ))}
        </span>
      );
    } else if (rule?.rule.type === 'list' && text) {
      const opt = optionsOf(rule.rule).find((o) => o.v.toLowerCase() === text.trim().toLowerCase());
      if (opt?.color)
        content = (
          <span className="min-w-0 truncate rounded-full px-2 leading-[1.45]" style={{ background: opt.color, color: textOn(opt.color), fontSize: '0.92em' }}>
            {text}
          </span>
        );
    }
    if (rule?.rule.type === 'list' && !formulas) {
      // The list's arrow at the cell's right edge.
      content = (
        <>
          <span className="flex min-w-0 flex-1 items-center overflow-hidden">{content ?? <span className="min-w-0 truncate">{text}</span>}</span>
          <ChevronDown size={Math.round(13 * z)} className="ml-0.5 shrink-0 text-fg-3" />
        </>
      );
      text = '';
    }
    // An AI cell: its mark, and in place of #BUSY! what it waits for. A link's words in a link's colour; a picture; a sparkline.
    const isAi = !ghost && !formulas && asksAi(cell.f);
    let title: string | undefined;
    if (isAi && isError(v) && v.code === '#BUSY!') {
      const st = ai?.(k);
      const lab = aiLabel(st ?? { state: 'waiting' });
      text = lab.text;
      look.cls = lab.cls;
      title = lab.title;
    }
    const extra = !ghost && !formulas && (cell.link || (cell.f && /HYPERLINK|IMAGE|SPARKLINE/i.test(cell.f))) ? calc.special(si, r, c) : null;
    if (extra?.kind === 'link' && !cell.s?.color) {
      style.color = 'var(--link, #3b82f6)';
      style.textDecoration = 'underline';
    } else if (extra?.kind === 'image') content = <CellImage spec={extra} />;
    else if (extra?.kind === 'spark') content = <Sparkline spec={extra} w={Math.max(0, (colOff[(m ? m.c2 : c) + 1] - colOff[c]) - 4)} h={Math.max(0, rowOff[(m ? m.r2 : r) + 1] - rowOff[r] - 4)} />;
    // Words that do not fit: numbers become ###, words run on over empty cells to the right.
    if (!content && text && !cell.s?.wrap && !cell.s?.rot && !m) {
      const need = textWidth(text, cell.s) * z + 9;
      if (typeof v === 'number' && !look.sign && need > w) text = '#'.repeat(Math.max(1, Math.floor((w - 8) / (8 * z))));
      else if (need > w && look.style.justifyContent === 'flex-start') {
        // Over the empty cells to the right, as far as the words need (not out of the frozen columns, nor into a merge).
        const last = region === 'left' || region === 'corner' ? fc - 1 : cols.c2 + 8;
        for (let k2 = c + 1; k2 <= last && w < need; k2++) {
          const next = sheet.cells[refName(r, k2)];
          if ((next && (next.v !== undefined || next.f !== undefined || next.s?.fill)) || gv.merges.at(r, k2)) break;
          w += colOff[k2 + 1] - colOff[k2];
        }
      }
    }
    const pos = place(r, c, region);
    const invalid =
      rule &&
      filled &&
      rule.rule.type !== 'checkbox' &&
      (rule.rule.type === 'list' ? !!look.text.trim() && !optionsOf(rule.rule).some((o) => o.v.toLowerCase() === look.text.trim().toLowerCase()) : !allowed(calc, si, rule.rule, v, look.text, { r, c, r0: rule.r0, c0: rule.c0 }));
    out.push(
      <div key={`${r}:${c}`} translate="no" title={title} className={cx('absolute flex overflow-hidden border-r border-b px-[4px] whitespace-nowrap', line, look.cls, !style.background && 'bg-bg', extra && extra.kind !== 'link' && 'items-center justify-center px-[2px]')} style={{ left: pos.left, top: pos.top, width: w, height: h, ...style }}>
        {cfLook?.bar && <span className="pointer-events-none absolute top-[3px] bottom-[3px] rounded-sm opacity-60" style={{ left: `${cfLook.bar.from * 100}%`, width: `${(cfLook.bar.to - cfLook.bar.from) * 100}%`, background: cfLook.bar.color }} />}
        {look.sign && <span className="relative mr-auto pr-1">{look.sign}</span>}
        {content ?? (
          <span className="relative min-w-0 overflow-hidden" style={{ textOverflow: 'clip', ...(cell.s?.rot ? { transform: `rotate(${-cell.s.rot}deg)`, display: 'inline-block', alignSelf: 'center' } : {}) }}>
            {text}
          </span>
        )}
        {/* A comment's open thread marks the corner (purple, as Excel marks its threads), a note too (orange, its tip). */}
        {open.has(k) && <span className="pointer-events-none absolute top-0 right-0 border-t-[9px] border-l-[9px] border-t-[#a142f4] border-l-transparent" />}
        {cell.note && <span className="pointer-events-none absolute top-0 right-0 border-t-[7px] border-l-[7px] border-t-[#e37400] border-l-transparent" />}
        {invalid && <span className="pointer-events-none absolute top-0 left-0 border-t-[7px] border-r-[7px] border-t-err border-r-transparent" title="This value is not one its rule allows" />}
        {isAi && <AiMark z={z} />}
      </div>,
    );
    // Borders: drawn on the grid's lines, each side as the style says.
    const s = cell.s;
    if (s && (s.bt || s.br || s.bb || s.bl)) {
      const sides: [string | undefined, React.CSSProperties][] = [
        [s.bt, { left: pos.left - 1, top: pos.top - 1, width: w + 1, height: 0, borderTop: edgeCss(s.bt, z) ?? undefined }],
        [s.bb, { left: pos.left - 1, top: pos.top + h - 1, width: w + 1, height: 0, borderTop: edgeCss(s.bb, z) ?? undefined }],
        [s.bl, { left: pos.left - 1, top: pos.top - 1, width: 0, height: h + 1, borderLeft: edgeCss(s.bl, z) ?? undefined }],
        [s.br, { left: pos.left + w - 1, top: pos.top - 1, width: 0, height: h + 1, borderLeft: edgeCss(s.br, z) ?? undefined }],
      ];
      sides.forEach(([b, st], i) => b && lines.push(<span key={`b${r}:${c}:${i}`} className="pointer-events-none absolute z-[1]" style={st} />));
    }
  };
  for (const m of merges) draw(m.r1, m.c1, m);
  for (let r = rows.r1; r <= rows.r2; r++) {
    if (rowOff[r + 1] === rowOff[r]) continue;
    for (let c = cols.c1; c <= cols.c2; c++) {
      const k = refName(r, c);
      if (!sheet.cells[k] && !extra.has(k) && !ghosts.has(k)) continue;
      if (merges.length && gv.merges.at(r, c)) continue;
      draw(r, c, null);
    }
  }
  return (
    <>
      {out}
      {lines}
    </>
  );
});
