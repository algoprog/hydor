// Spreadsheets: a workbook kept in Pages (a page of the kind "sheet"), as the server, the editor and the exports
// share it. A workbook is a list of sheets; a sheet keeps its cells by name ("B2"), each a value (a number, words,
// TRUE or FALSE) or a formula ("=SUM(B2:B9)"), how it looks (borders, a number format of Excel's own codes too) and
// a note, the widths of its columns, the heights of its rows and which are hidden, the rows and columns that stay in
// view as it scrolls (frozen), cells merged into one, a filter on a header row, conditional formatting, the rules for
// what cells take (lists of options, checkboxes, ratings, numbers or dates in a range), and charts on its cells (each
// between the cells its corners are on, of a range or of several).
//
// normalizeBook takes what an agent or the editor sends, lenient about shorthand (rows from A1, a header row, a
// format per column, words typed as a person types them: "12%", "2026-01-31", "=B2*2"), and returns the workbook as
// it is kept, every value checked. computeBook works out what each formula gives, as Excel does: its operators,
// references to cells, ranges and other sheets, a long list of functions, dates as Excel's day numbers (1900 system).
// formatValue writes a value as its cell shows it. shiftFormula, adjustForInsert and adjustForDelete rewrite formulas
// (and the ranges rules and merges cover) as cells are copied, or rows and columns go in or out. What the rules make
// of the cells (rows a filter hides, the look conditional formatting gives) is worked out in sheet-rules.ts. Nothing
// here needs Node or a browser.

import { cleanComment, newCommentId, type Comment } from './comments.ts';

export const SHEET_LIMITS = { sheets: 50, cells: 200_000, rows: 20_000, cols: 500, text: 32_767, formula: 8_192, name: 31, note: 4_000, merges: 5_000, rules: 100, charts: 20, options: 500 };

/** A column's width and a row's height in the editor (px) when none is set. */
export const COL_W = 100;
export const ROW_H = 24;
export const MIN_W = 24;
export const MAX_W = 1200;
export const MIN_H = 16;
export const MAX_H = 600;
/** The type size cells have unless they say (pt). */
export const FONT_PT = 10;

/** How far references may reach (Excel's own grid), whatever a sheet holds. */
export const MAX_ROWS = 1_048_576;
export const MAX_COLS = 16_384;

export type NumFmt = 'general' | 'number' | 'percent' | 'currency' | 'accounting' | 'scientific' | 'date' | 'time' | 'datetime' | 'duration' | 'text';
export const NUM_FMTS: NumFmt[] = ['general', 'number', 'percent', 'currency', 'accounting', 'scientific', 'date', 'time', 'datetime', 'duration', 'text'];
/** The formats that show a date or a time of day (a cell typed in them is read as one). */
export const isDateFmt = (f: NumFmt | undefined) => f === 'date' || f === 'time' || f === 'datetime' || f === 'duration';

/** The fonts a cell may be in, each with what the browser is to look for (and stand-ins that look alike). */
export const CELL_FONTS: Record<string, string> = {
  Arial: 'Arial, Arimo, "Liberation Sans", Helvetica, sans-serif',
  Calibri: 'Calibri, Carlito, "Segoe UI", sans-serif',
  Cambria: 'Cambria, Caladea, Georgia, serif',
  'Courier New': '"Courier New", Cousine, "Liberation Mono", monospace',
  Georgia: 'Georgia, "Times New Roman", serif',
  'Times New Roman': '"Times New Roman", Tinos, "Liberation Serif", serif',
  'Trebuchet MS': '"Trebuchet MS", "Segoe UI", sans-serif',
  Verdana: 'Verdana, "DejaVu Sans", sans-serif',
};

/** A border's kinds: a line's weight or pattern. */
export const BORDER_KINDS = ['thin', 'medium', 'thick', 'dashed', 'dotted', 'double'] as const;
export type BorderKind = (typeof BORDER_KINDS)[number];

export interface CellStyle {
  b?: boolean;
  i?: boolean;
  u?: boolean;
  /** Struck through. */
  s?: boolean;
  /** #rrggbb. */
  color?: string;
  fill?: string;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
  wrap?: boolean;
  fmt?: NumFmt;
  /** Decimals shown (0–10). */
  dp?: number;
  /** A currency's sign: "$", "€", "£"… */
  cur?: string;
  /** An Excel number format code ("#,##0.00;[Red]-#,##0.00", "dd/mm/yyyy"): how the value shows, over fmt (which says what kind it is). */
  code?: string;
  /** Type size, in points. */
  size?: number;
  /** A font of CELL_FONTS (the app's own otherwise). */
  font?: string;
  /** The words turned, in degrees anticlockwise (-90 to 90). */
  rot?: number;
  /** Borders at the top, right, bottom and left: a kind of BORDER_KINDS, with a colour after it ("thin", "thick #1a73e8"); without one, the text's. */
  bt?: string;
  br?: string;
  bb?: string;
  bl?: string;
}

export type CellValue = string | number | boolean;

export interface Cell {
  /** What it holds (none when it has a formula: that is worked out). */
  v?: CellValue;
  /** A formula, without its "=". */
  f?: string;
  s?: CellStyle;
  /** A note on the cell, shown when it is pointed at. */
  note?: string;
  /** A link the cell opens (Insert → Link): a web address (https:, mailto:, tel:), or a place in the workbook ("#'Sheet 2'!A1"). */
  link?: string;
}

/**
 * What a filter, conditional formatting or a rule for what cells take checks. Values are written as a person types
 * them ("100", "2026-01-31", "words"); one starting with "=" is a formula, worked out for each cell from the range's
 * first one (as Excel and Google Sheets do).
 */
export interface Cond {
  op: CondOp;
  a?: string;
  b?: string;
}

/**
 * empty, notEmpty; text: contains, notContains, starts, ends, is (exactly); numbers: eq, neq, gt, gte, lt, lte,
 * between, notBetween; dates: dateIs, before, after (a date, or today, tomorrow, yesterday, week, month, year: the
 * past ones); formula (a: "=$C2>100"); and for conditional formatting over a range: dup, unique, top, bottom (a: how
 * many, b: "%" for a share), above, below (the average).
 */
export type CondOp =
  | 'empty'
  | 'notEmpty'
  | 'contains'
  | 'notContains'
  | 'starts'
  | 'ends'
  | 'is'
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'notBetween'
  | 'dateIs'
  | 'before'
  | 'after'
  | 'formula'
  | 'dup'
  | 'unique'
  | 'top'
  | 'bottom'
  | 'above'
  | 'below';
export const COND_OPS: CondOp[] = [
  'empty',
  'notEmpty',
  'contains',
  'notContains',
  'starts',
  'ends',
  'is',
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
  'notBetween',
  'dateIs',
  'before',
  'after',
  'formula',
  'dup',
  'unique',
  'top',
  'bottom',
  'above',
  'below',
];
/** The conditions that look at a range's values together (conditional formatting only). */
export const RANGE_OPS: CondOp[] = ['dup', 'unique', 'top', 'bottom', 'above', 'below'];
/** Dates a condition may name instead of a day. */
export const DATE_WORDS = ['today', 'tomorrow', 'yesterday', 'week', 'month', 'year'];

/** A filter's choice for one column: values it hides (as their cells show them; "" for empty ones), and a condition the rows shown meet. */
export interface FilterCol {
  hide?: string[];
  when?: Cond;
}

/** A filter on a block of rows: its range (the header row first), and what it keeps, by column letter. */
export interface SheetFilter {
  range: string;
  cols?: Record<string, FilterCol>;
}

/** How conditional formatting changes a cell's look. */
export interface CondStyle {
  b?: boolean;
  i?: boolean;
  u?: boolean;
  s?: boolean;
  color?: string;
  fill?: string;
}

/** A point of a colour scale: the lowest or highest value, a number, a percent of the way, or a percentile. */
export interface ScalePoint {
  color: string;
  at?: 'min' | 'max' | 'num' | 'pct' | 'pctile';
  v?: number;
}

/**
 * A rule of conditional formatting over a range (several, split by commas): a condition with the look it gives
 * (when), a colour scale of two or three colours (scale), or data bars (bar). Rules apply in order; for a cell, the
 * first whose condition holds gives its look, as in Google Sheets (scales and bars go with it).
 */
export interface CondRule {
  range: string;
  when?: Cond;
  style?: CondStyle;
  scale?: { min: ScalePoint; mid?: ScalePoint; max: ScalePoint };
  bar?: { color: string };
}

/** An option of a list, with the colour of its chip. */
export interface ListOption {
  v: string;
  color?: string;
}

/**
 * What cells of a range take: one of a list of options (or of a range's values: source), TRUE or FALSE shown as a
 * checkbox, a rating of stars (1 to max), or a number, a date or words of a length that meet a condition, or what a
 * formula allows. Other input is refused (reject) or kept with a warning.
 */
export interface Validation {
  range: string;
  type: 'list' | 'checkbox' | 'rating' | 'number' | 'date' | 'length' | 'formula';
  options?: ListOption[];
  source?: string;
  when?: Cond;
  max?: number;
  reject?: boolean;
}

export type SheetChartKind = 'column' | 'bar' | 'line' | 'area' | 'pie' | 'doughnut' | 'scatter' | 'combo' | 'histogram' | 'bubble' | 'radar';
export const SHEET_CHART_KINDS: SheetChartKind[] = ['column', 'bar', 'line', 'area', 'pie', 'doughnut', 'scatter', 'combo', 'histogram', 'bubble', 'radar'];

/** A series' own way of being drawn: as columns or a line (a combo chart), on the second axis at the right, with a trendline. */
export interface ChartSeriesOpts {
  type?: 'column' | 'line';
  axis?: 2;
  trend?: 'linear' | 'exp';
}

/** A corner of a chart: the cell it is on, and where in that cell (px from its top-left corner, at 100%). */
export interface ChartCorner {
  cell: string;
  dx?: number;
  dy?: number;
}

/**
 * A chart over the grid, drawn from a range's cells as they are now: its series in the range's columns (or rows,
 * by: "rows"), the first column (or row) as the labels and the first row (or column) as the series' names when it
 * says so. Its range may be in parts ("A1:A7,F1:F7", as Sheets allows): the parts side by side, as if one table (the
 * labels from one, the values from the others). Where it sits: its corners, each on a cell, so it moves and stretches
 * with its cells as rows and columns go in or out, change size or hide (Excel's "move and size with cells").
 */
export interface SheetChart {
  id: string;
  kind: SheetChartKind;
  range: string;
  by?: 'rows';
  labels?: boolean;
  names?: boolean;
  title?: string;
  legend?: 'bottom' | 'right' | 'top' | 'none';
  xTitle?: string;
  yTitle?: string;
  colors?: string[];
  stacked?: boolean;
  /** 100% stacked: each label's values as shares of its total. */
  percent?: boolean;
  /** The values written on the points, columns and slices. */
  values?: boolean;
  /** The value axis's lowest and highest (worked out when not said). */
  min?: number;
  max?: number;
  /** Each series' own way, by its place (columns or a line, the second axis, a trendline). */
  series?: ChartSeriesOpts[];
  /** A histogram's bins (worked out when not said). */
  bins?: number;
  from: ChartCorner;
  to: ChartCorner;
}

/**
 * A sheet's Kanban board, kept with it: the table it shows (by its header row's first cell), the column it groups by
 * and the columns its cards show (by letter; none said: the first few), the order of its lanes (the options' values;
 * the others after them), and whether the sheet opens on it.
 */
export interface SheetBoard {
  at: string;
  by: string;
  fields?: string[];
  lanes?: string[];
  open?: boolean;
}

/** A comment on a cell, as Sheets and Excel have them beside notes: a thread (who wrote it, replies, resolved) on the cell it is on. */
export interface SheetComment extends Comment {
  cell: string;
}

/**
 * A name for a range, a value or a formula (Data → Named ranges, Excel's Name Manager): `ref` is what it stands for,
 * written as a formula without its "=" ("'Sheet 1'!$B$2:$B$20", "0.21", "LAMBDA(x, x*1.21)"); formulas use the name
 * in its place, in any case. `sheet`: the id of the one sheet it is for (then it goes before a name of the workbook's).
 */
export interface NamedRange {
  name: string;
  ref: string;
  sheet?: string;
  note?: string;
}

/**
 * Cells protected from changes (Data → Protect): a range, or the whole sheet when it has none but the cells `except`
 * leaves open. A change to them warns first (`warn`), or is refused until the protection is taken off.
 */
export interface SheetProtect {
  range?: string;
  except?: string;
  warn?: boolean;
  note?: string;
}

/**
 * A pivot table's settings, kept with the sheet it made (Data → Pivot table), to change it again: the table it sums up
 * ("'Sales'!A1:F200", its header row first), the columns its rows and its columns are by, the columns it sums (counts,
 * averages…), and the values of columns it leaves out (filters); columns by their letters.
 */
export interface PivotDef {
  source: string;
  rows: string[];
  cols?: string;
  values: { col: string; fn: 'sum' | 'count' | 'average' | 'min' | 'max' }[];
  filters?: { col: string; hide: string[] }[];
}

/** Rows ("3:7") or columns ("C:E") grouped under an outline's bracket, folded away (hidden) or not. */
export interface SheetGroup {
  range: string;
  hidden?: boolean;
}

/**
 * How a sheet prints and goes to PDF: across the page or upright (by its width when not said), made to fit the page's
 * width (or the whole page; none: at its own size), the cells to print (all of them when not said), the rows at its
 * top each page repeats (its frozen rows or a header row when not said; 0: none), and the cells' lines (on unless said).
 */
export interface PrintSetup {
  orient?: 'portrait' | 'landscape';
  fit?: 'width' | 'page' | 'none';
  area?: string;
  titles?: number;
  grid?: boolean;
}

export interface Sheet {
  id: string;
  name: string;
  /** By name: "A1", "B12". */
  cells: Record<string, Cell>;
  /** Columns' widths in px, by index from 0 (A), and which are hidden. */
  cols?: Record<number, { w?: number; hidden?: boolean }>;
  /** Rows' heights in px, by index from 0 (row 1), and which are hidden. */
  rows?: Record<number, { h?: number; hidden?: boolean }>;
  /** Rows (from the top) and columns (from the left) that stay in view. */
  freeze?: { rows?: number; cols?: number };
  /** Cells merged into one, each a range ("A1:C1"): its first cell holds what it shows. */
  merges?: string[];
  filter?: SheetFilter;
  conditional?: CondRule[];
  validation?: Validation[];
  charts?: SheetChart[];
  board?: SheetBoard;
  /** Comments' threads, one a cell, in the cells' order. */
  comments?: SheetComment[];
  /** Cells that warn or refuse changes. */
  protect?: SheetProtect[];
  /** Rows and columns grouped, with + and − to fold them. */
  groups?: SheetGroup[];
  print?: PrintSetup;
  /** The grid's lines hidden in the editor (View → Gridlines), as Excel's showGridLines. */
  noGrid?: boolean;
  /** The colour of the sheet's tab (#rrggbb), as Excel's tab colour. */
  tabColor?: string;
  /** The sheet's tab is hidden (right-click a tab: Hide; Show hidden sheets brings it back), as Excel's hidden sheets. */
  hidden?: boolean;
  /** The pivot table this sheet holds (made by Data → Pivot table). */
  pivot?: PivotDef;
}

export interface Workbook {
  v: 1;
  sheets: Sheet[];
  /** Named ranges (and named values and formulas). */
  names?: NamedRange[];
  /**
   * The answers of the AI function (=AI(prompt, cells…)), by the key of what was asked (its prompt and the cells' values):
   * worked out once and kept with the workbook, asked again only when the prompt or the cells change, or with Refresh.
   */
  ai?: Record<string, CellValue>;
}

// ---- errors ------------------------------------------------------------------------------------------------

export type ErrCode = '#DIV/0!' | '#N/A' | '#NAME?' | '#NULL!' | '#NUM!' | '#REF!' | '#VALUE!' | '#CIRC!' | '#ERROR!' | '#SPILL!' | '#CALC!' | '#BUSY!';

/**
 * A formula's error, as its cell shows it. #CIRC!: it needs itself; #ERROR!: it cannot be read; #SPILL!: its array has
 * no room to spill into; #CALC!: it gives a LAMBDA that is never called, or an array of nothing; #BUSY!: an AI answer it
 * needs is not there yet.
 */
export class CellError {
  constructor(readonly code: ErrCode) {}
  toString() {
    return this.code;
  }
}

const E = {
  DIV: new CellError('#DIV/0!'),
  NA: new CellError('#N/A'),
  NAME: new CellError('#NAME?'),
  NULL: new CellError('#NULL!'),
  NUM: new CellError('#NUM!'),
  REF: new CellError('#REF!'),
  VALUE: new CellError('#VALUE!'),
  CIRC: new CellError('#CIRC!'),
  PARSE: new CellError('#ERROR!'),
  SPILL: new CellError('#SPILL!'),
  CALC: new CellError('#CALC!'),
  BUSY: new CellError('#BUSY!'),
};
const ERR_BY_CODE = new Map<string, CellError>(Object.values(E).map((e) => [e.code, e]));
/** The error of a code ("#N/A"), or null. */
export const errorOf = (code: string) => ERR_BY_CODE.get(code.toUpperCase()) ?? null;
export const isError = (v: unknown): v is CellError => v instanceof CellError;

/** A worked-out value: a number, words, TRUE or FALSE, an error, or nothing (an empty cell). */
export type Scalar = number | string | boolean | null | CellError;

// ---- cells' names --------------------------------------------------------------------------------------------

/** A column's letters: 0 → A, 25 → Z, 26 → AA. */
export function colName(i: number): string {
  let s = '';
  for (let n = Math.floor(i) + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** A column's index from its letters ("AB" → 27), or -1. */
export function colIndex(letters: string): number {
  if (!/^[A-Za-z]{1,3}$/.test(letters)) return -1;
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** A cell's name: (1, 2) → "C2". */
export const refName = (r: number, c: number) => `${colName(c)}${r + 1}`;

/** A cell's row and column (from 0) from its name ("C2", "$C$2"), or null. */
export function parseRef(s: string): { r: number; c: number } | null {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/.exec(s.trim());
  if (!m) return null;
  const c = colIndex(m[1]);
  const r = Number(m[2]) - 1;
  return c >= 0 && c < MAX_COLS && r >= 0 && r < MAX_ROWS ? { r, c } : null;
}

export interface Rect {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

/** A range from its name ("B2:D9", "B2", "A:C", "2:5"), corners in order, or null. */
export function parseRange(s: string): Rect | null {
  const t = s.trim().replace(/\$/g, '');
  const one = parseRef(t);
  if (one) return { r1: one.r, c1: one.c, r2: one.r, c2: one.c };
  let m = /^([A-Za-z]{1,3}\d{1,7}):([A-Za-z]{1,3}\d{1,7})$/.exec(t);
  if (m) {
    const a = parseRef(m[1]);
    const b = parseRef(m[2]);
    return a && b ? { r1: Math.min(a.r, b.r), c1: Math.min(a.c, b.c), r2: Math.max(a.r, b.r), c2: Math.max(a.c, b.c) } : null;
  }
  m = /^([A-Za-z]{1,3}):([A-Za-z]{1,3})$/.exec(t);
  if (m) {
    const a = colIndex(m[1]);
    const b = colIndex(m[2]);
    return a >= 0 && b >= 0 ? { r1: 0, c1: Math.min(a, b), r2: MAX_ROWS - 1, c2: Math.max(a, b) } : null;
  }
  m = /^(\d{1,7}):(\d{1,7})$/.exec(t);
  if (m) {
    const a = Number(m[1]) - 1;
    const b = Number(m[2]) - 1;
    return a >= 0 && b >= 0 ? { r1: Math.min(a, b), c1: 0, r2: Math.max(a, b), c2: MAX_COLS - 1 } : null;
  }
  return null;
}

/** A range's name: "B2:D9", or "B2" for one cell. */
export const rangeName = (x: Rect) => (x.r1 === x.r2 && x.c1 === x.c2 ? refName(x.r1, x.c1) : `${refName(x.r1, x.c1)}:${refName(x.r2, x.c2)}`);

/** Cells' names as numbers, for maps: a row and a column in one. */
export const pack = (r: number, c: number) => r * MAX_COLS + c;
export const unpackR = (k: number) => Math.floor(k / MAX_COLS);
export const unpackC = (k: number) => k % MAX_COLS;

const keyCache = new Map<string, number>();
/** A cell name's packed number (-1 when it is no cell's name); remembered, as the same names come again and again. */
export function keyOf(name: string): number {
  let k = keyCache.get(name);
  if (k !== undefined) return k;
  const m = /^([A-Z]{1,3})([1-9]\d{0,6})$/.exec(name);
  if (!m) return -1;
  const c = colIndex(m[1]);
  const r = Number(m[2]) - 1;
  k = c >= 0 && c < MAX_COLS && r < MAX_ROWS ? pack(r, c) : -1;
  if (keyCache.size > 400_000) keyCache.clear();
  keyCache.set(name, k);
  return k;
}

/** How far a sheet's cells reach: the number of rows and columns from A1 to its last cell. */
export function sheetExtent(sh: Sheet): { rows: number; cols: number } {
  let rows = 0;
  let cols = 0;
  for (const name in sh.cells) {
    const k = keyOf(name);
    if (k < 0) continue;
    rows = Math.max(rows, unpackR(k) + 1);
    cols = Math.max(cols, unpackC(k) + 1);
  }
  return { rows, cols };
}

// ---- colours ---------------------------------------------------------------------------------------------------

const NAMED: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  orange: '#ffa500',
  purple: '#800080',
  pink: '#ffc0cb',
  gray: '#808080',
  grey: '#808080',
  lightgray: '#d3d3d3',
  lightgrey: '#d3d3d3',
  darkgray: '#a9a9a9',
  navy: '#000080',
  teal: '#008080',
  gold: '#ffd700',
  silver: '#c0c0c0',
  brown: '#a52a2a',
  maroon: '#800000',
  olive: '#808000',
  lime: '#00ff00',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  indigo: '#4b0082',
  violet: '#ee82ee',
  coral: '#ff7f50',
  crimson: '#dc143c',
  lightblue: '#add8e6',
  lightgreen: '#90ee90',
  lightyellow: '#ffffe0',
};

/** A colour as a workbook keeps it, #rrggbb, from #hex, rgb() or a common name; null when it is none of those. */
export function cleanColor(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  if (!s || s.length > 40) return null;
  if (NAMED[s]) return NAMED[s];
  let m = /^#?([0-9a-f]{3}|[0-9a-f]{6})([0-9a-f]{2}|[0-9a-f])?$/.exec(s);
  if (m && (s.startsWith('#') || m[1].length === 6)) {
    const h = m[1].length === 3 ? [...m[1]].map((x) => x + x).join('') : m[1];
    return `#${h}`;
  }
  m = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/.exec(s);
  if (m) return `#${[m[1], m[2], m[3]].map((x) => Math.min(255, Number(x)).toString(16).padStart(2, '0')).join('')}`;
  return null;
}

/** Black or white, whichever reads better on `fill` (#rrggbb). */
export function textOn(fill: string): '#000000' | '#ffffff' {
  const n = parseInt(fill.slice(1, 7), 16);
  const lin = (x: number) => {
    const c = x / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return l > 0.36 ? '#000000' : '#ffffff';
}

// ---- dates -------------------------------------------------------------------------------------------------------

const DAY = 86_400_000;
const EPOCH = Date.UTC(1899, 11, 30);

/**
 * Excel's day number of a date (1 is 1900-01-01). Excel counts a 29 February 1900 that never was, so the days
 * before March 1900 are one lower than a plain count from 30 December 1899.
 */
export function dateSerial(y: number, m: number, d: number): number {
  const n = Math.round((Date.UTC(y, m - 1, d) - EPOCH) / DAY);
  return n <= 60 ? n - 1 : n;
}

/** A day number's date and time of day. */
export function serialParts(serial: number): { y: number; m: number; d: number; h: number; mi: number; s: number; wd: number } {
  let days = Math.floor(serial);
  // Seconds, rounded (Excel's times are fractions of a day: 0.5 is noon).
  let secs = Math.round((serial - days) * 86400);
  if (secs >= 86400) {
    days += 1;
    secs -= 86400;
  }
  let y: number;
  let m: number;
  let d: number;
  if (days === 60) [y, m, d] = [1900, 2, 29];
  else {
    const t = new Date(EPOCH + (days < 60 ? days + 1 : days) * DAY);
    [y, m, d] = [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
  }
  // The day of the week as Excel counts it (0 is Sunday), from the day number itself.
  const wd = (((days - 1) % 7) + 7) % 7;
  return { y, m, d, h: Math.floor(secs / 3600), mi: Math.floor((secs % 3600) / 60), s: secs % 60, wd };
}

/** Now as a day number, in this computer's time. */
export function nowSerial(at: Date = new Date()): number {
  return dateSerial(at.getFullYear(), at.getMonth() + 1, at.getDate()) + (at.getHours() * 3600 + at.getMinutes() * 60 + at.getSeconds()) / 86400;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MON3 = MONTHS.map((m) => m.slice(0, 3));
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const monthOf = (w: string) => {
  const s = w.toLowerCase().replace(/\.$/, '');
  const i = s.length >= 3 ? MONTHS.findIndex((m) => m.startsWith(s)) : -1;
  return i >= 0 && (s.length === 3 || MONTHS[i].startsWith(s)) ? i + 1 : 0;
};
const validDay = (y: number, m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate();

/** A date (and time) as a day number from how people write one: 2026-01-31, 2026-01-31 14:30, 31 Jan 2026, Jan 31, 2026, 14:30. */
export function parseDate(text: string): number | null {
  const s = text.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/.exec(s);
  let y: number;
  let mo: number;
  let d: number;
  let time = '';
  if (m) {
    [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (m[4] !== undefined) time = `${m[4]}:${m[5]}${m[6] ? `:${m[6]}` : ''}`;
  } else if ((m = /^(\d{1,2})[\s-]([A-Za-z]{3,9}\.?)[\s,-]+(\d{4})(?:,?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]m)?))?$/i.exec(s))) {
    [d, mo, y] = [Number(m[1]), monthOf(m[2]), Number(m[3])];
    time = m[4] ?? '';
  } else if ((m = /^([A-Za-z]{3,9}\.?)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?:,?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]m)?))?$/i.exec(s))) {
    [mo, d, y] = [monthOf(m[1]), Number(m[2]), Number(m[3])];
    time = m[4] ?? '';
  } else {
    const t = parseTime(s);
    return t;
  }
  if (!validDay(y, mo, d) || y < 1900 || y > 9999) return null;
  const t = time ? parseTime(time) : 0;
  if (t === null) return null;
  return dateSerial(y, mo, d) + t;
}

/** A time of day as a fraction of one ("14:30", "2:30 pm", "14:30:15"), or null. */
export function parseTime(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$/i.exec(text.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const mi = Number(m[2]);
  const sec = Number(m[3] ?? 0);
  if (m[4]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (/^p/i.test(m[4]) ? 12 : 0);
  }
  if (h > 23 || mi > 59 || sec > 59) return null;
  return (h * 3600 + mi * 60 + sec) / 86400;
}

// ---- numbers as text ----------------------------------------------------------------------------------------------

/** `n` rounded to `dp` decimals, halves away from zero, as Excel rounds (1.005 → 1.01). */
export function roundTo(n: number, dp: number): number {
  if (!Number.isFinite(n)) return n;
  const d = Math.max(-15, Math.min(15, Math.trunc(dp)));
  // Rounded at 15 digits first, so 1.005 (1.00499999…) rounds as it is written; moved by powers of ten as text.
  const r = shift10(Math.round(shift10(Number(Math.abs(n).toPrecision(15)), d)), -d);
  return n < 0 ? -r : r;
}

/** `x` × 10^e, exactly as written in decimal. */
function shift10(x: number, e: number): number {
  const [m, ex] = x.toExponential().split('e');
  return Number(`${m}e${Number(ex) + e}`);
}

/** Digits grouped in thousands: "1234567" → "1,234,567". */
const group = (int: string) => int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** A number with `dp` decimals, and thousands grouped when `sep`. */
export function fixed(n: number, dp: number, sep: boolean): string {
  const r = roundTo(n, dp);
  if (Math.abs(r) >= 1e21) return expo(r);
  const s = Math.abs(r).toFixed(Math.max(0, Math.min(20, dp)));
  const [int, frac] = s.split('.');
  const body = (sep ? group(int) : int) + (frac ? `.${frac}` : '');
  return r < 0 && Number(s) !== 0 ? `-${body}` : body;
}

/** "1.23457E+15": a mantissa of up to `dp` decimals. */
function expo(n: number, dp = 5): string {
  const [m, e] = n.toExponential(dp).split('e');
  const mant = m.includes('.') ? m.replace(/\.?0+$/, '') : m;
  const exp = Number(e);
  return `${mant}E${exp < 0 ? '-' : '+'}${String(Math.abs(exp)).padStart(2, '0')}`;
}

/** A number as a cell in General shows it: up to ten digits or so, then E notation. */
export function generalNumber(n: number): string {
  if (!Number.isFinite(n)) return '#NUM!';
  if (n === 0) return '0';
  const a = Math.abs(n);
  if (a >= 1e11 && !Number.isInteger(n)) return expo(n);
  if (a >= 1e15 || a < 1e-9) return expo(n);
  if (Number.isInteger(n)) return String(n);
  const s = n.toPrecision(10);
  if (s.includes('e')) return expo(n);
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/** A number as text in formulas (& and the text functions): its 15 digits, without grouping. */
export function numText(n: number): string {
  if (!Number.isFinite(n)) return '#NUM!';
  if (n === 0) return '0';
  const a = Math.abs(n);
  if (a >= 1e21 || a < 1e-15) return expo(n, 14);
  const s = Number(n.toPrecision(15)).toString();
  return s.includes('e') ? expo(n, 14) : s;
}

/** A date's text: 2026-01-31, with its time when it has one (14:30), or only the time for a time alone. */
export function dateText(serial: number): string {
  if (!Number.isFinite(serial) || serial < 0 || serial >= 2958466) return generalNumber(serial);
  const p = serialParts(serial);
  const two = (x: number) => String(x).padStart(2, '0');
  const time = `${two(p.h)}:${two(p.mi)}${p.s ? `:${two(p.s)}` : ''}`;
  if (serial < 1 && serial > 0) return time;
  const day = `${String(p.y).padStart(4, '0')}-${two(p.m)}-${two(p.d)}`;
  return Math.abs(serial - Math.round(serial)) < 1 / 86400 / 2 ? day : `${day} ${time}`;
}

const CUR_AFTER = /^[A-Za-z]/;

/** The codes of the formats that show times: of day, with a date, and lengths of time past a day. */
export const TIME_CODES = { time: 'hh:mm:ss', datetime: 'yyyy-mm-dd hh:mm:ss', duration: '[h]:mm:ss' } as const;

/** A value as its cell shows it, in the cell's number format (an Excel code when it has one). */
export function formatValue(v: Scalar | undefined, s?: CellStyle): string {
  if (v === null || v === undefined) return '';
  if (v instanceof CellError) return v.code;
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (s?.code && (typeof v === 'number' ? Number.isFinite(v) : true)) {
    // Words go through a code's part for words only (its fourth, or one with @); else they show as they are.
    const t = formatByCode(v, s.code);
    return typeof t === 'string' ? t : t.code;
  }
  if (typeof v === 'string') return v;
  if (!Number.isFinite(v)) return '#NUM!';
  const fmt = s?.fmt ?? 'general';
  switch (fmt) {
    case 'number':
      return fixed(v, s?.dp ?? 2, true);
    case 'percent':
      return `${fixed(v * 100, s?.dp ?? 0, false)}%`;
    case 'currency': {
      const cur = s?.cur ?? '$';
      const body = fixed(Math.abs(v), s?.dp ?? 2, true);
      const neg = v < 0 && Number(body.replace(/,/g, '')) !== 0;
      return CUR_AFTER.test(cur) ? `${neg ? '-' : ''}${body} ${cur}` : `${neg ? '-' : ''}${cur}${body}`;
    }
    case 'accounting': {
      const [cur, body] = accountingParts(v, s);
      return CUR_AFTER.test(cur) ? `${body} ${cur}` : `${cur} ${body}`;
    }
    case 'scientific': {
      const dp = s?.dp ?? 2;
      return formatByCode(v, dp ? `0.${'0'.repeat(dp)}E+00` : '0E+00') as string;
    }
    case 'date':
      return dateText(v);
    case 'time':
    case 'datetime':
    case 'duration':
      return formatByCode(v, TIME_CODES[fmt]) as string;
    default:
      return s?.dp !== undefined ? fixed(v, s.dp, false) : generalNumber(v);
  }
}

/** An amount as the Accounting format shows it: its currency's sign, and the number (negatives in brackets, zero a dash), which a cell shows apart. */
export function accountingParts(v: number, s?: CellStyle): [string, string] {
  const cur = s?.cur ?? '$';
  const body = fixed(Math.abs(v), s?.dp ?? 2, true);
  return [cur, Number(body.replace(/,/g, '')) === 0 ? '-' : v < 0 ? `(${body})` : body];
}

const CODE_COLORS: Record<string, string> = { black: '#000000', blue: '#0000ff', cyan: '#00ffff', green: '#008000', magenta: '#ff00ff', red: '#ff0000', white: '#ffffff', yellow: '#ffff00' };

/** The colour a number format code gives a value (its part for negatives in [Red], say), or undefined. */
export function codeColor(v: Scalar | undefined, code: string | undefined): string | undefined {
  if (!code || (typeof v !== 'number' && typeof v !== 'string')) return undefined;
  const secs = sections(code);
  let sec: string | undefined;
  if (typeof v === 'string') sec = secs.length >= 4 ? secs[3] : secs.find((x) => x.includes('@'));
  else if (v < 0 && secs.length >= 2 && secs[1] !== '') sec = secs[1];
  else if (v === 0 && secs.length >= 3) sec = secs[2];
  else sec = secs[0];
  const m = sec ? /\[(black|blue|cyan|green|magenta|red|white|yellow)\]/i.exec(sec) : null;
  return m ? CODE_COLORS[m[1].toLowerCase()] : undefined;
}

/** A length of time as the Duration format writes it for typing again: hours past a day too ("26:30:00"). */
export function durationText(v: number): string {
  const secs = Math.round(Math.abs(v) * 86400);
  const two = (x: number) => String(x).padStart(2, '0');
  return `${v < 0 ? '-' : ''}${Math.floor(secs / 3600)}:${two(Math.floor((secs % 3600) / 60))}:${two(secs % 60)}`;
}

// ---- what a person types --------------------------------------------------------------------------------------

export interface Typed {
  v?: CellValue;
  f?: string;
  /** The format the words suggest ("12%" is a percent), for a cell without one of its own. */
  fmt?: NumFmt;
  dp?: number;
  cur?: string;
}

const NUM_RE = /^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?(?:[eE][+-]?\d{1,3})?$|^[+-]?\.\d+(?:[eE][+-]?\d{1,3})?$/;
const CURRENCIES = ['$', '€', '£', '¥', '₹', '₩', '₽', '₺', '₪', 'R$', 'kr', 'CHF', 'zł'];
/** An amount with its currency's sign before or after it: "$1,200", "-€5", "15 €", "100 CHF". */
const CUR_RES = CURRENCIES.map((cur) => {
  const esc = cur.replace(/[$]/g, '\\$');
  return [cur, new RegExp(`^([+-]?)\\s*${esc}\\s*([+-]?[\\d.,]+)$|^([+-]?[\\d.,]+)\\s*${esc}$`)] as const;
});

/** A number from its text, commas between thousands allowed, or null. Long runs of digits (card numbers, ids) stay words. */
function plainNumber(t: string): { n: number; dp: number; sep: boolean } | null {
  if (!NUM_RE.test(t)) return null;
  // A leading zero (007, 0123) is an id or a code, not a number.
  if (/^[+-]?0\d/.test(t)) return null;
  const digits = t.replace(/[^0-9]/g, '').replace(/^0+/, '');
  if (digits.length > 15 && !/[eE]/.test(t)) return null;
  const n = Number(t.replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  const dot = t.indexOf('.');
  const dp = dot < 0 ? 0 : t.slice(dot + 1).replace(/[eE].*$/, '').length;
  return { n, dp, sep: t.includes(',') };
}

/** A number written as a number, a percent ("12%"), an amount ("$1,200", "15 €") or a date, with the format it suggests; else null. */
export function parseNumberText(text: string): Typed | null {
  const t = text.trim();
  // Every one of these has a digit in it.
  if (!t || !/\d/.test(t)) return null;
  const p = plainNumber(t);
  if (p) return p.sep ? { v: p.n, fmt: 'number', dp: p.dp } : { v: p.n };
  let m = /^([+-]?)(.+?)\s*%$/.exec(t);
  if (m) {
    const q = plainNumber(m[2]);
    if (q) return { v: (m[1] === '-' ? -q.n : q.n) / 100, fmt: 'percent', dp: q.dp };
  }
  for (const [cur, re] of CUR_RES) {
    m = re.exec(t);
    if (m) {
      const q = plainNumber((m[2] ?? m[3]).replace(/^[+-]/, ''));
      if (!q) continue;
      const neg = m[1] === '-' || /^-/.test(m[2] ?? m[3]);
      return { v: neg ? -q.n : q.n, fmt: 'currency', dp: q.dp ? 2 : 0, cur };
    }
  }
  const d = parseDate(t);
  if (d !== null) return { v: d, fmt: 'date' };
  return null;
}

/**
 * What a cell holds from what was typed in it, as a spreadsheet takes it: "=…" a formula, "'…" words as they
 * are, numbers, percents, amounts and dates as numbers (with the format they suggest), TRUE and FALSE; else words.
 * In a cell formatted as text, everything stays words.
 */
export function parseInput(text: string, fmt?: NumFmt): Typed {
  if (text === '') return {};
  if (fmt === 'text') return { v: text };
  if (text.startsWith('=') && text.trim().length > 1) return { f: text.slice(1).trim() };
  if (text.startsWith("'")) return text.length > 1 ? { v: text.slice(1) } : {};
  const t = text.trim();
  if (/^(true|false)$/i.test(t)) return { v: t.toLowerCase() === 'true' };
  // A length of time may run past a day: 26:30 is 26 hours and a half.
  const d = fmt === 'duration' ? /^(-?)(\d{1,6}):([0-5]\d)(?::([0-5]\d))?$/.exec(t) : null;
  if (d) return { v: ((d[1] ? -1 : 1) * (Number(d[2]) * 3600 + Number(d[3]) * 60 + Number(d[4] ?? 0))) / 86400 };
  return parseNumberText(t) ?? { v: text };
}

/** What a cell's box shows for editing: its formula with its "=", or its value as one would type it again. */
export function inputText(cell: Cell | undefined): string {
  if (!cell) return '';
  if (cell.f !== undefined) return `=${cell.f}`;
  const v = cell.v;
  if (v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') {
    const fmt = cell.s?.fmt;
    if (fmt === 'percent') return `${numText(roundTo(v * 100, 12))}%`;
    if (fmt === 'duration') return durationText(v);
    if (isDateFmt(fmt)) return dateText(v);
    return numText(v);
  }
  // Words that would be read as something else when typed again keep the mark that says they are words.
  const back = parseInput(v, cell.s?.fmt);
  return back.v === v && back.f === undefined ? v : `'${v}`;
}

// ---- checking what comes in ----------------------------------------------------------------------------------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const cleanText = (s: string) => s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, SHEET_LIMITS.text);
const intIn = (v: unknown, min: number, max: number): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : undefined;
};

export const newId = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');

/** Date codes that show what a plain Date shows (the day, its time when it has one): no code of their own needed. */
const PLAIN_DATES = new Set(['yyyy-mm-dd', 'yyyy-mm-dd hh:mm', 'yyyy-mm-dd h:mm', 'hh:mm', 'h:mm']);

/** The format an Excel number format code stands for ("#,##0.00" → number, 2 decimals; "0%"; "$#,##0"; "0.00E+00"; "yyyy-mm-dd"; "h:mm"). */
export function fmtFromCode(code: string): Pick<CellStyle, 'fmt' | 'dp' | 'cur'> {
  const c = code.trim();
  if (!c || /^general$/i.test(c)) return {};
  if (c === '@') return { fmt: 'text' };
  const first = c.split(';')[0];
  // What is not in quotes, escaped or in brackets decides what it is.
  const bare = first.replace(/"[^"]*"|\\.|\[[^\]]*\]/g, (m) => (m.startsWith('[$') ? m : ''));
  const noCur = bare.replace(/\[\$[^\]]*\]/g, '');
  const dp = (/\.([0#?]+)/.exec(bare)?.[1].length ?? 0) as number;
  if (/\[(h+|m+|s+)\]/i.test(first.replace(/"[^"]*"|\\./g, ''))) return { fmt: 'duration' };
  if (/[yd]|m{3,}|h|s/i.test(noCur) && !/[0#?]/.test(noCur.replace(/\.0+/, ''))) {
    if (PLAIN_DATES.has(noCur.trim().toLowerCase())) return { fmt: 'date' };
    const day = /[yd]/i.test(noCur) || /m{3,}/i.test(noCur) || (/m/i.test(noCur) && !/[hs]/i.test(noCur));
    const time = /[hs]/i.test(noCur);
    return { fmt: day && time ? 'datetime' : time ? 'time' : 'date' };
  }
  if (/[0#?](?:\.[0#?]+)?[eE][+-]/.test(bare)) return { fmt: 'scientific', dp };
  if (bare.includes('%')) return { fmt: 'percent', dp };
  const cur = /\[\$([^\]-]+)/.exec(c)?.[1] ?? /"([^"0-9#?]{1,4})"/.exec(c)?.[1] ?? /([$€£¥₹])/.exec(bare)?.[1];
  // Accounting: the sign kept at the cell's edge by a fill (* ) before the number.
  const accounting = /\*\s/.test(first) && /^_[(-]/.test(first.trim());
  if (cur && /[0#?]/.test(bare)) {
    const fmt = accounting ? 'accounting' : 'currency';
    return cur === '$' ? { fmt, dp } : { fmt, dp, cur: cur.trim() };
  }
  if (/[0#?]/.test(bare)) return bare.includes(',') ? { fmt: 'number', dp } : dp ? { fmt: 'general', dp } : { fmt: 'general', dp: 0 };
  return {};
}

/** The plain code of a format: how Excel would write what a style without a code shows (by kind, decimals, currency). */
export function fmtCode(s: Pick<CellStyle, 'fmt' | 'dp' | 'cur'> | undefined): string {
  const dec = (n: number) => (n > 0 ? `.${'0'.repeat(n)}` : '');
  const cur = s?.cur ?? '$';
  switch (s?.fmt ?? 'general') {
    case 'number':
      return `#,##0${dec(s?.dp ?? 2)}`;
    case 'percent':
      return `0${dec(s?.dp ?? 0)}%`;
    case 'currency': {
      const num = `#,##0${dec(s?.dp ?? 2)}`;
      return CUR_AFTER.test(cur) ? `${num} "${cur}"` : `"${cur}"${num}`;
    }
    case 'accounting': {
      const num = `#,##0${dec(s?.dp ?? 2)}`;
      const q = `"${cur}"`;
      return CUR_AFTER.test(cur) ? `_-* ${num} ${q}_-;-* ${num} ${q}_-;_-* "-"?? ${q}_-;_-@_-` : `_(${q}* ${num}_);_(${q}* \\(${num}\\);_(${q}* "-"??_);_(@_)`;
    }
    case 'scientific':
      return `0${dec(s?.dp ?? 2)}E+00`;
    case 'date':
      return 'yyyy-mm-dd';
    case 'time':
    case 'datetime':
    case 'duration':
      return TIME_CODES[s!.fmt as 'time'];
    case 'text':
      return '@';
    default:
      return s?.dp === undefined ? 'General' : `0${dec(s.dp)}`;
  }
}

/**
 * Whether a style needs a code to show what `code` shows: not when the plain format of its kind shows the same (tried
 * on a few values), unless the code colours some of them ([Red]).
 */
export function codeNeeded(code: string, s: Pick<CellStyle, 'fmt' | 'dp' | 'cur'>): boolean {
  if (!s.fmt || code === fmtCode(s)) return false;
  if (/\[(black|blue|cyan|green|magenta|red|white|yellow|color\s*\d+)\]/i.test(code)) return true;
  // Accounting shows its own way (the sign at the cell's edge), whatever spacing a file's code gives it.
  if (s.fmt === 'accounting') return false;
  if (s.fmt === 'text') return code.trim() !== '@';
  if (s.fmt === 'date')
    return !PLAIN_DATES.has(
      code
        .replace(/\[\$[^\]]*\]|\\/g, '')
        .trim()
        .toLowerCase(),
    );
  const samples = isDateFmt(s.fmt) ? [0.25, 0.6042, 46000.75, 1.5] : [1234.5678, -1234.5678, 0, 0.25, 12_345_678.9, -0.5];
  return samples.some((x) => formatByCode(x, code) !== formatValue(x, s));
}

const FMT_ALIAS: Record<string, Pick<CellStyle, 'fmt' | 'dp' | 'cur'>> = {
  general: {},
  auto: {},
  number: { fmt: 'number' },
  num: { fmt: 'number' },
  decimal: { fmt: 'number' },
  integer: { fmt: 'number', dp: 0 },
  int: { fmt: 'number', dp: 0 },
  percent: { fmt: 'percent' },
  percentage: { fmt: 'percent' },
  '%': { fmt: 'percent' },
  currency: { fmt: 'currency' },
  money: { fmt: 'currency' },
  usd: { fmt: 'currency' },
  dollar: { fmt: 'currency' },
  eur: { fmt: 'currency', cur: '€' },
  euro: { fmt: 'currency', cur: '€' },
  gbp: { fmt: 'currency', cur: '£' },
  pound: { fmt: 'currency', cur: '£' },
  jpy: { fmt: 'currency', cur: '¥' },
  inr: { fmt: 'currency', cur: '₹' },
  accounting: { fmt: 'accounting' },
  scientific: { fmt: 'scientific' },
  sci: { fmt: 'scientific' },
  exponential: { fmt: 'scientific' },
  date: { fmt: 'date' },
  datetime: { fmt: 'datetime' },
  time: { fmt: 'time' },
  duration: { fmt: 'duration' },
  text: { fmt: 'text' },
  string: { fmt: 'text' },
  '@': { fmt: 'text' },
};

/** A number format code as a style keeps it: words of up to 120 characters, or none. */
const cleanCode = (v: unknown) => (typeof v === 'string' && v.trim() && v.length <= 120 && !/[\u0000-\u001f\u007f]/.test(v) && !/^general$/i.test(v.trim()) ? v.trim() : undefined);

/** A format as a style takes it: a name ("currency", "percent", "eur"), an Excel code (kept when no plain format shows the same), or { fmt, dp, cur }. */
function fmtOf(v: unknown): Pick<CellStyle, 'fmt' | 'dp' | 'cur' | 'code'> | null {
  if (typeof v === 'string') {
    const a = FMT_ALIAS[v.trim().toLowerCase()];
    if (a) return a;
    const code = fmtFromCode(v);
    if (!code.fmt) return null;
    return codeNeeded(v.trim(), code) && cleanCode(v) ? { ...code, code: v.trim() } : code;
  }
  if (!isObj(v)) return null;
  const base = fmtOf(v.fmt ?? v.format ?? v.type) ?? {};
  const out: Pick<CellStyle, 'fmt' | 'dp' | 'cur' | 'code'> = { ...base };
  const dp = intIn(v.dp ?? v.decimals, 0, 10);
  if (dp !== undefined) out.dp = dp;
  if (typeof (v.cur ?? v.currency) === 'string') out.cur = String(v.cur ?? v.currency);
  return out;
}

const ALIGN: Record<string, CellStyle['align']> = { left: 'left', center: 'center', centre: 'center', middle: 'center', right: 'right' };
const VALIGN: Record<string, CellStyle['valign']> = { top: 'top', middle: 'middle', center: 'middle', centre: 'middle', bottom: 'bottom' };

/** The decimals a format shows when its style says none. */
export const DEFAULT_DP: Partial<Record<NumFmt, number>> = { number: 2, currency: 2, accounting: 2, scientific: 2, percent: 0 };
/** The formats decimals mean nothing to. */
const NO_DP = new Set<NumFmt | undefined>(['date', 'time', 'datetime', 'duration', 'text']);

/** A currency's sign as styles keep it: a few signs or letters, nothing that could be markup. */
const cleanCur = (v: unknown) => (typeof v === 'string' && /^[\p{Sc}A-Za-z. ]{1,5}$/u.test(v.trim()) ? v.trim() : undefined);

/** A style with every value checked, its keys always in one order (so a kept workbook's text stays the same); undefined when it says nothing. */
export function cleanStyle(v: unknown): CellStyle | undefined {
  if (!isObj(v)) return undefined;
  const s: CellStyle = {};
  if ((v.b ?? v.bold) === true) s.b = true;
  if ((v.i ?? v.italic) === true) s.i = true;
  if ((v.u ?? v.underline) === true) s.u = true;
  if ((v.s ?? v.strike ?? v.strikethrough) === true) s.s = true;
  const color = cleanColor(v.color ?? v.textColor ?? v.fontColor);
  if (color) s.color = color;
  const fill = cleanColor(v.fill ?? v.background ?? v.bg ?? v.fillColor);
  if (fill) s.fill = fill;
  const align = ALIGN[String(v.align ?? v.halign ?? v.horizontal ?? '').toLowerCase()];
  if (align) s.align = align;
  const valign = VALIGN[String(v.valign ?? v.vertical ?? '').toLowerCase()];
  if (valign) s.valign = valign;
  if ((v.wrap ?? v.wrapText) === true) s.wrap = true;
  const f = fmtOf(v.fmt ?? v.format ?? v.numFmt ?? v.numberFormat) ?? {};
  // An Excel code says what kind of format it is (its decimals and currency too); it is kept only when no plain format shows the same.
  const code = cleanCode(v.code) ?? f.code;
  const d = code ? fmtFromCode(code) : {};
  const kind = d.fmt ? d : f;
  const dp = d.fmt ? d.dp : (intIn(v.dp ?? v.decimals, 0, 10) ?? f.dp);
  const cur = d.fmt ? cleanCur(d.cur) : (cleanCur(v.cur ?? v.currency) ?? cleanCur(f.cur));
  if (kind.fmt && kind.fmt !== 'general') s.fmt = kind.fmt;
  // Decimals a format shows anyway are not kept (2 for numbers and amounts, none for percents).
  if (dp !== undefined && !NO_DP.has(s.fmt) && !(s.fmt && DEFAULT_DP[s.fmt] === dp)) s.dp = dp;
  if (cur && cur !== '$' && (s.fmt === 'currency' || s.fmt === 'accounting')) s.cur = cur;
  if (code && d.fmt && codeNeeded(code, d)) s.code = code;
  const size = intIn(v.size ?? v.fontSize, 6, 72);
  if (size !== undefined && size !== FONT_PT) s.size = size;
  const font = typeof (v.font ?? v.fontFamily) === 'string' ? fontOf(String(v.font ?? v.fontFamily)) : undefined;
  if (font) s.font = font;
  const rot = intIn(v.rot ?? v.rotate ?? v.rotation, -90, 90);
  if (rot) s.rot = rot;
  // Borders: each side, or all four at once (border).
  const all = cleanBorder(v.border ?? v.borders);
  for (const [k, alias] of [
    ['bt', 'borderTop'],
    ['br', 'borderRight'],
    ['bb', 'borderBottom'],
    ['bl', 'borderLeft'],
  ] as const) {
    const b = v[k] !== undefined || v[alias] !== undefined ? cleanBorder(v[k] ?? v[alias]) : all;
    if (b) s[k] = b;
  }
  return Object.keys(s).length ? s : undefined;
}

/** A font's name as CELL_FONTS has it (in any case), or undefined. */
export const fontOf = (name: string): string | undefined => Object.keys(CELL_FONTS).find((k) => k.toLowerCase() === name.trim().toLowerCase());

/** A border as a style keeps it: its kind, and its colour when it has one ("thin", "dashed #1a73e8"); undefined for none. */
export function cleanBorder(v: unknown): string | undefined {
  let kind: BorderKind | undefined;
  let color: string | null = null;
  if (v === true) return 'thin';
  if (typeof v === 'string') {
    for (const p of v.trim().toLowerCase().split(/\s+/)) {
      if ((BORDER_KINDS as readonly string[]).includes(p)) kind = p as BorderKind;
      else if (p === 'solid' || p === 'hair') kind ??= 'thin';
      else if (p === 'none' || p === 'false') return undefined;
      else color = cleanColor(p) ?? color;
    }
    if (!kind && color) kind = 'thin';
  } else if (isObj(v)) {
    const k = String(v.style ?? v.kind ?? 'thin').toLowerCase();
    kind = (BORDER_KINDS as readonly string[]).includes(k) ? (k as BorderKind) : k === 'none' ? undefined : 'thin';
    color = cleanColor(v.color ?? v.c);
  }
  if (!kind) return undefined;
  return color ? `${kind} ${color}` : kind;
}

/** A border's kind and colour, from how a style keeps it. */
export function borderOf(b: string | undefined): { kind: BorderKind; color?: string } | null {
  if (!b) return null;
  const [kind, color] = b.split(' ');
  return { kind: (BORDER_KINDS as readonly string[]).includes(kind) ? (kind as BorderKind) : 'thin', color: color && /^#[0-9a-f]{6}$/.test(color) ? color : undefined };
}

/** Two styles as one: `b`'s values over `a`'s, in the kept order. */
export const mergeStyle = (a: CellStyle | undefined, b: CellStyle | undefined): CellStyle | undefined => (!b ? a : !a ? b : cleanStyle({ ...a, ...b }));

const STYLE_KEYS = ['b', 'bold', 'i', 'italic', 'u', 'underline', 's', 'strike', 'color', 'fill', 'background', 'align', 'valign', 'wrap', 'fmt', 'format', 'dp', 'cur', 'code', 'size', 'font', 'rot', 'bt', 'br', 'bb', 'bl', 'border'];

/**
 * A cell from what was sent: a bare value is typed as a person types it (`typed`: "=B2*2", "12%"); a cell as an
 * object ({ v, f, s }) is taken as it says, its v as it is. null when it holds nothing at all.
 */
export function cleanCell(x: unknown, typed = true): Cell | null {
  if (x === null || x === undefined) return null;
  if (typeof x === 'number') return Number.isFinite(x) ? { v: x } : null;
  if (typeof x === 'boolean') return { v: x };
  if (typeof x === 'string') {
    if (!typed) return x === '' ? null : { v: cleanText(x) };
    const t = parseInput(cleanText(x));
    return typedCell(t, undefined);
  }
  if (!isObj(x)) return null;
  const cell: Cell = {};
  const raw = x.f ?? x.formula;
  const f = typeof raw === 'string' ? raw.trim().replace(/^=/, '').trim().slice(0, SHEET_LIMITS.formula) : '';
  const v = x.v ?? x.value;
  if (f) cell.f = f;
  else if (typeof v === 'number' && Number.isFinite(v)) cell.v = v;
  else if (typeof v === 'boolean') cell.v = v;
  else if (typeof v === 'string' && v !== '') cell.v = cleanText(v);
  const style = cleanStyle(isObj(x.s) ? x.s : isObj(x.style) ? x.style : STYLE_KEYS.some((k) => k in x && k !== 's') ? x : undefined);
  if (style) cell.s = style;
  const note = cleanNote(x.note ?? x.comment);
  if (note) cell.note = note;
  const link = cleanLink(x.link ?? x.href ?? x.url);
  if (link) cell.link = link;
  return cell.v === undefined && cell.f === undefined && !cell.s && !cell.note && !cell.link ? null : cell;
}

/**
 * A cell's link as kept: a web address (http, https, mailto, tel; "example.com" taken as https), or a place in the
 * workbook ("#Sheet2!A1", "#'My sheet'!B2:C4", "#TaxRate"); undefined for anything else.
 */
export function cleanLink(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim().replace(/[\u0000-\u001f\u007f]/g, '');
  if (!t || t.length > 2000) return undefined;
  if (t.startsWith('#')) return /^#[^<>"]{1,300}$/.test(t) ? t : undefined;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(t)) return /[\s<>"]/.test(t) ? undefined : t;
  if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/[^\s<>"]*)?$/i.test(t)) return `https://${t}`;
  return undefined;
}

/** A cell's note as it is kept: its words, without control characters, at most SHEET_LIMITS.note long; undefined for none. */
export const cleanNote = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = cleanText(v).trim().slice(0, SHEET_LIMITS.note);
  return t || undefined;
};

/** A cell from typed words and the style it has: the format the words suggest goes in when it has none of its own. */
export function typedCell(t: Typed, s: CellStyle | undefined): Cell | null {
  const cell: Cell = {};
  if (t.f !== undefined) cell.f = t.f.slice(0, SHEET_LIMITS.formula);
  else if (t.v !== undefined && t.v !== '') cell.v = typeof t.v === 'string' ? cleanText(t.v) : t.v;
  let style = s;
  if (t.fmt && (!s?.fmt || s.fmt === 'general') && cell.v !== undefined) style = cleanStyle({ ...s, fmt: t.fmt, dp: t.dp, cur: t.cur });
  if (style) cell.s = style;
  return cell.v === undefined && cell.f === undefined && !cell.s ? null : cell;
}

/** A sheet's name as Excel takes one: no []:*?/\, at most 31 characters, not "History". */
export function cleanSheetName(v: unknown, i = 0): string {
  const s = (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')
    .replace(/[\u0000-\u001f\u007f[\]:*?/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^'+|'+$/g, '')
    .slice(0, SHEET_LIMITS.name)
    .trim();
  return s || `Sheet ${i + 1}`;
}

/** `name`, or "name (2)" and so on when another sheet has it already (in any case). */
export function uniqueSheetName(name: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((x) => x.toLowerCase()));
  used.add('history');
  if (!used.has(name.toLowerCase())) return name;
  for (let n = 2; ; n++) {
    const tail = ` (${n})`;
    const cand = name.slice(0, SHEET_LIMITS.name - tail.length).trimEnd() + tail;
    if (!used.has(cand.toLowerCase())) return cand;
  }
}

export interface NormalizeOptions {
  /** What was left out (too many cells, rows past the limit…), said in plain words. */
  notes?: string[];
}

interface Budget {
  cells: number;
  cut: { cells: number; rows: number; cols: number };
}

/** A column (or several) from its letters: "C" → [2, 2], "C:E" → [2, 4]. */
function colSpan(k: string): [number, number] | null {
  const m = /^\s*([A-Za-z]{1,3})(?:\s*:\s*([A-Za-z]{1,3}))?\s*$/.exec(k);
  if (!m) return null;
  const a = colIndex(m[1]);
  const b = m[2] ? colIndex(m[2]) : a;
  return a < 0 || b < 0 ? null : [Math.min(a, b), Math.min(SHEET_LIMITS.cols - 1, Math.max(a, b))];
}

/**
 * Rows and columns that stay in view: any number the sheet holds (Freeze up to here may be far down). The editor draws no
 * more of them than fit in its window, so there is always room left to scroll.
 */
function freezeOf(v: unknown): { rows?: number; cols?: number } | undefined {
  let rows: number | undefined;
  let cols: number | undefined;
  if (v === true) rows = 1;
  else if (typeof v === 'number') rows = intIn(v, 0, SHEET_LIMITS.rows);
  else if (typeof v === 'string') {
    const p = parseRef(v);
    if (p) [rows, cols] = [Math.min(SHEET_LIMITS.rows, p.r), Math.min(SHEET_LIMITS.cols, p.c)];
  } else if (isObj(v)) {
    rows = intIn(v.rows ?? v.row ?? v.r, 0, SHEET_LIMITS.rows);
    cols = intIn(v.cols ?? v.columns ?? v.col ?? v.c, 0, SHEET_LIMITS.cols);
  }
  const out: { rows?: number; cols?: number } = {};
  if (rows) out.rows = rows;
  if (cols) out.cols = cols;
  return Object.keys(out).length ? out : undefined;
}

// ---- merges, a filter, conditional formatting, rules for cells, charts: checking them --------------------------------

/** Whether two rectangles share a cell. */
export const overlaps = (a: Rect, b: Rect) => a.r1 <= b.r2 && b.r1 <= a.r2 && a.c1 <= b.c2 && b.c1 <= a.c2;

/** A range within what a sheet may hold (a whole column stops at its last row), or null. */
function rangeIn(text: string): Rect | null {
  const rg = parseRange(text);
  if (!rg || rg.r1 >= SHEET_LIMITS.rows || rg.c1 >= SHEET_LIMITS.cols) return null;
  return { r1: rg.r1, c1: rg.c1, r2: Math.min(rg.r2, SHEET_LIMITS.rows - 1), c2: Math.min(rg.c2, SHEET_LIMITS.cols - 1) };
}

/** Ranges as a rule keeps them, each checked and within a sheet's limits, split by commas ("B2:B9,D2:D9"); '' for none. */
export function cleanRanges(v: unknown): string {
  const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,;\s]+/) : [];
  const out: string[] = [];
  for (const x of list.slice(0, 20)) {
    const rg = typeof x === 'string' ? rangeIn(x) : null;
    if (rg) out.push(rangeName(rg));
  }
  return [...new Set(out)].join(',');
}

/** A rule's ranges as rectangles. */
export const rectsOf = (ranges: string): Rect[] => ranges.split(',').flatMap((x) => parseRange(x) ?? []);

/** A range that may be on another sheet ("Sheet2!A1:A9", "'My list'!$A:$A"), as kept: its sheet quoted where it must be; undefined when it is none. */
export function cleanSource(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const m = /^\s*=?\s*(?:'((?:[^']|'')+)'|([A-Za-z_¡-￿][A-Za-z0-9_.¡-￿]*))!(.+)$/.exec(v);
  const rg = rangeIn(m ? m[3] : v.replace(/^\s*=/, ''));
  if (!rg) return undefined;
  if (!m) return rangeName(rg);
  const name = (m[1] ?? m[2]).replace(/''/g, "'");
  return `${quoteSheet(name)}!${rangeName(rg)}`;
}

/** A range that may be on another sheet: the sheet's name (none for its own) and its rectangle. */
export function sourceOf(text: string): { sheet?: string; x: Rect } | null {
  const m = /^(?:'((?:[^']|'')+)'|([^!]+))!(.+)$/.exec(text);
  const x = parseRange(m ? m[3] : text);
  if (!x) return null;
  return m ? { sheet: (m[1] ?? m[2]).replace(/''/g, "'"), x } : { x };
}

/** Merged ranges as kept: two cells or more each, within the limits, none over another (a later one gives way). */
function cleanMerges(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const kept: Rect[] = [];
  for (const x of v.slice(0, SHEET_LIMITS.merges)) {
    const rg = typeof x === 'string' ? parseRange(x) : isObj(x) && typeof x.range === 'string' ? parseRange(x.range) : null;
    if (!rg || (rg.r1 === rg.r2 && rg.c1 === rg.c2) || rg.r2 >= SHEET_LIMITS.rows || rg.c2 >= SHEET_LIMITS.cols) continue;
    if (kept.some((k) => overlaps(k, rg))) continue;
    kept.push(rg);
  }
  return kept.map(rangeName);
}

/** How agents and files may name a condition, besides its own name. */
const OP_WORDS: Record<string, CondOp> = {
  '>': 'gt',
  '>=': 'gte',
  '<': 'lt',
  '<=': 'lte',
  '=': 'eq',
  '==': 'eq',
  '<>': 'neq',
  '!=': 'neq',
  blank: 'empty',
  isempty: 'empty',
  isblank: 'empty',
  notblank: 'notEmpty',
  isnotempty: 'notEmpty',
  nonempty: 'notEmpty',
  doesnotcontain: 'notContains',
  notcontain: 'notContains',
  startswith: 'starts',
  beginswith: 'starts',
  endswith: 'ends',
  exactly: 'is',
  textis: 'is',
  equal: 'eq',
  equals: 'eq',
  equalto: 'eq',
  notequal: 'neq',
  notequalto: 'neq',
  greater: 'gt',
  greaterthan: 'gt',
  greaterorequal: 'gte',
  greaterthanorequal: 'gte',
  less: 'lt',
  lessthan: 'lt',
  lessorequal: 'lte',
  lessthanorequal: 'lte',
  date: 'dateIs',
  on: 'dateIs',
  datebefore: 'before',
  dateafter: 'after',
  custom: 'formula',
  duplicate: 'dup',
  duplicates: 'dup',
  aboveaverage: 'above',
  belowaverage: 'below',
};

const opOf = (v: unknown): CondOp | null => {
  if (typeof v !== 'string') return null;
  const k = v.trim();
  return COND_OPS.find((o) => o.toLowerCase() === k.toLowerCase()) ?? OP_WORDS[k] ?? OP_WORDS[k.toLowerCase().replace(/[\s_-]+/g, '')] ?? null;
};

/** The conditions that compare a value with one or two others. */
export const COMPARE_OPS: CondOp[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'notBetween'];

/** A condition as kept, its values as text (a formula with its "="); null when it says nothing usable. `whole`: conditions on a range's values together too. */
export function cleanCond(v: unknown, whole = false): Cond | null {
  if (typeof v === 'string' && v.trim().startsWith('=')) v = { op: 'formula', a: v };
  if (!isObj(v)) return null;
  const op = opOf(v.op ?? v.type ?? v.is);
  if (!op || (!whole && RANGE_OPS.includes(op))) return null;
  const val = (x: unknown): string | undefined => {
    if (typeof x === 'number' && Number.isFinite(x)) return numText(x);
    if (typeof x === 'boolean') return x ? 'TRUE' : 'FALSE';
    if (typeof x !== 'string') return undefined;
    const t = cleanText(x).trim();
    return t ? t.slice(0, t.startsWith('=') ? SHEET_LIMITS.formula : 1000) : undefined;
  };
  const list = Array.isArray(v.values) ? v.values : null;
  const a = val(v.a ?? v.value ?? v.v ?? v.min ?? v.from ?? v.formula ?? list?.[0]);
  const b = val(v.b ?? v.value2 ?? v.max ?? v.to ?? list?.[1]);
  const out: Cond = { op };
  switch (op) {
    case 'empty':
    case 'notEmpty':
    case 'dup':
    case 'unique':
    case 'above':
    case 'below':
      break;
    case 'between':
    case 'notBetween':
      if (a === undefined || b === undefined) return null;
      out.a = a;
      out.b = b;
      break;
    case 'top':
    case 'bottom':
      out.a = String(intIn(a ?? '10', 1, 1000) ?? 10);
      if (b === '%' || v.percent === true || v.pct === true) out.b = '%';
      break;
    case 'formula':
      if (!a) return null;
      out.a = a.startsWith('=') ? a : `=${a}`;
      break;
    case 'dateIs':
    case 'before':
    case 'after':
      if (!a) return null;
      out.a = DATE_WORDS.includes(a.toLowerCase()) ? a.toLowerCase() : a;
      break;
    default:
      if (a === undefined) return null;
      out.a = a;
  }
  // A formula as a value must be one that can be read.
  for (const k of ['a', 'b'] as const) if (out[k]?.startsWith('=') && formulaProblem(out[k]!.slice(1))) return null;
  return out;
}

/** A filter as kept: its range, and per column (by letter, within it) the values it hides and a condition. */
function cleanFilter(v: unknown): SheetFilter | undefined {
  if (typeof v === 'string') v = { range: v };
  if (!isObj(v)) return undefined;
  const rg = rangeIn(String(v.range ?? v.ref ?? ''));
  if (!rg) return undefined;
  const out: SheetFilter = { range: rangeName(rg) };
  const given = isObj(v.cols) ? v.cols : isObj(v.columns) ? v.columns : null;
  const cols: [number, FilterCol][] = [];
  if (given)
    for (const [k, x] of Object.entries(given)) {
      const c = colIndex(k.trim());
      if (c < rg.c1 || c > rg.c2 || !isObj(x)) continue;
      const fc: FilterCol = {};
      const hide = Array.isArray(x.hide) ? x.hide : Array.isArray(x.hidden) ? x.hidden : null;
      if (hide) {
        const list = [...new Set(hide.filter((t) => typeof t === 'string' || typeof t === 'number').map((t) => cleanText(String(t)).slice(0, 255)))].slice(0, 5000);
        if (list.length) fc.hide = list;
      }
      const when = cleanCond(x.when ?? x.condition ?? (x.op ? x : undefined));
      if (when) fc.when = when;
      if (fc.hide || fc.when) cols.push([c, fc]);
    }
  if (cols.length) out.cols = Object.fromEntries(cols.sort((a, b) => a[0] - b[0]).map(([c, fc]) => [colName(c), fc]));
  return out;
}

/** How a rule of conditional formatting changes a cell's look, checked; undefined when it changes nothing. */
function cleanCondStyle(v: unknown): CondStyle | undefined {
  if (!isObj(v)) return undefined;
  const s: CondStyle = {};
  if ((v.b ?? v.bold) === true) s.b = true;
  if ((v.i ?? v.italic) === true) s.i = true;
  if ((v.u ?? v.underline) === true) s.u = true;
  if ((v.s ?? v.strike ?? v.strikethrough) === true) s.s = true;
  const color = cleanColor(v.color ?? v.textColor);
  if (color) s.color = color;
  const fill = cleanColor(v.fill ?? v.background ?? v.bg);
  if (fill) s.fill = fill;
  return Object.keys(s).length ? s : undefined;
}

const SCALE_AT = ['min', 'max', 'num', 'pct', 'pctile'] as const;

/** A colour scale's point; what it is at is kept only when it is not its place's own (the lowest, the highest, the middle percentile). */
function cleanScalePoint(v: unknown, place: 'min' | 'mid' | 'max'): ScalePoint | null {
  const color = cleanColor(isObj(v) ? v.color : v);
  if (!color) return null;
  const def = place === 'mid' ? 'pctile' : place;
  const raw = isObj(v) ? String(v.at ?? v.type ?? def).toLowerCase() : def;
  const at = (SCALE_AT as readonly string[]).includes(raw) ? (raw as ScalePoint['at']) : raw === 'percent' ? 'pct' : raw === 'percentile' ? 'pctile' : raw === 'number' ? 'num' : def;
  let n = isObj(v) ? Number(v.v ?? v.value) : NaN;
  if (at === 'pct' || at === 'pctile') n = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 50;
  const out: ScalePoint = { color };
  if (at === 'num' && !Number.isFinite(n)) return out;
  if (at !== def || (at === 'pctile' && n !== 50)) out.at = at;
  if (at === 'num' || at === 'pct' || (at === 'pctile' && n !== 50)) out.v = n;
  return out;
}

/** A rule of conditional formatting as kept, or null. */
function cleanRule(x: unknown): CondRule | null {
  if (!isObj(x)) return null;
  const range = cleanRanges(x.range ?? x.ranges ?? x.ref);
  if (!range) return null;
  const scale = x.scale ?? x.colorScale;
  if (scale) {
    const list = Array.isArray(scale) ? scale : null;
    const min = cleanScalePoint(list ? list[0] : isObj(scale) ? scale.min : null, 'min');
    const max = cleanScalePoint(list ? list[list.length - 1] : isObj(scale) ? scale.max : null, 'max');
    const mid = list ? (list.length >= 3 ? cleanScalePoint(list[1], 'mid') : null) : isObj(scale) ? cleanScalePoint(scale.mid, 'mid') : null;
    return min && max ? { range, scale: { min, ...(mid ? { mid } : {}), max } } : null;
  }
  const bar = x.bar ?? x.dataBar ?? x.bars;
  if (bar) return { range, bar: { color: cleanColor(isObj(bar) ? bar.color : bar) ?? '#638ec6' } };
  const when = cleanCond(x.when ?? x.condition ?? (x.op ? x : null), true);
  const style = cleanCondStyle(x.style ?? x.format);
  return when && style ? { range, when, style } : null;
}

const cleanRules = (v: unknown): CondRule[] => (Array.isArray(v) ? v.slice(0, SHEET_LIMITS.rules).flatMap((x) => cleanRule(x) ?? []) : []);

/** A rule for what a range's cells take, as kept, or null. */
function cleanValidation(x: unknown): Validation | null {
  if (!isObj(x)) return null;
  const range = cleanRanges(x.range ?? x.ranges ?? x.ref);
  if (!range) return null;
  const given = String(x.type ?? '').toLowerCase();
  const listIn = x.options ?? x.list ?? x.values ?? x.items;
  const type: Validation['type'] | null =
    x.checkbox === true || given === 'checkbox' || given === 'boolean'
      ? 'checkbox'
      : (x.rating !== undefined && x.rating !== false) || given === 'rating' || given === 'stars'
        ? 'rating'
        : Array.isArray(listIn) || given === 'list' || given === 'dropdown' || given === 'select' || typeof x.source === 'string'
          ? 'list'
          : given === 'number' || given === 'decimal' || given === 'whole' || given === 'integer'
            ? 'number'
            : given === 'date'
              ? 'date'
              : given === 'length' || given === 'textlength'
                ? 'length'
                : given === 'formula' || given === 'custom'
                  ? 'formula'
                  : null;
  if (!type) return null;
  const out: Validation = { range, type };
  if (type === 'list') {
    const opts: ListOption[] = [];
    const seen = new Set<string>();
    for (const o of Array.isArray(listIn) ? listIn.slice(0, SHEET_LIMITS.options) : []) {
      const raw = typeof o === 'string' || typeof o === 'number' ? String(o) : isObj(o) ? String(o.v ?? o.value ?? o.label ?? o.name ?? '') : '';
      const v = cleanText(raw).trim().slice(0, 255);
      if (!v || seen.has(v.toLowerCase())) continue;
      seen.add(v.toLowerCase());
      const color = isObj(o) ? cleanColor(o.color ?? o.fill) : null;
      opts.push(color ? { v, color } : { v });
    }
    const source = cleanSource(x.source);
    if (opts.length) out.options = opts;
    else if (source) out.source = source;
    else return null;
  } else if (type === 'rating') {
    const m = intIn(typeof x.rating === 'number' ? x.rating : x.max, 1, 10);
    if (m && m !== 5) out.max = m;
  } else if (type === 'formula') {
    const when = cleanCond(typeof x.formula === 'string' ? { op: 'formula', a: x.formula } : (x.when ?? x.condition));
    if (!when || when.op !== 'formula') return null;
    out.when = when;
  } else if (type !== 'checkbox') {
    // A number or a date without a condition is any number or date; words' length needs one.
    const when = cleanCond(x.when ?? x.condition ?? (x.op ? x : null));
    if (when && COMPARE_OPS.includes(when.op)) out.when = when;
    else if (type === 'length') return null;
  }
  if (x.reject === true || x.strict === true) out.reject = true;
  return out;
}

const cleanValidations = (v: unknown): Validation[] => (Array.isArray(v) ? v.slice(0, SHEET_LIMITS.rules).flatMap((x) => cleanValidation(x) ?? []) : []);

const CHART_ALIAS: Record<string, SheetChartKind> = { col: 'column', columns: 'column', bars: 'bar', lines: 'line', donut: 'doughnut', ring: 'doughnut', xy: 'scatter', points: 'scatter', 'column-line': 'combo', mixed: 'combo', distribution: 'histogram', frequency: 'histogram', bubbles: 'bubble', spider: 'radar', web: 'radar' };

// ---- charts: their ranges and where they sit -------------------------------------------------------------------

/** A range's parts, split at the commas between them (not those in a sheet's quoted name). */
function splitParts(text: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (const ch of text) {
    if (ch === "'") quoted = !quoted;
    if (ch === ',' && !quoted) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out.filter(Boolean);
}

/** The parts of a chart's range ("A1:A7,F1:F7", "'My sheet'!A1:B9"), each a rectangle maybe on another sheet; null when one of them is no range. */
export function chartParts(range: string): { sheet?: string; x: Rect }[] | null {
  const out: { sheet?: string; x: Rect }[] = [];
  for (const p of splitParts(range)) {
    const kept = cleanSource(p);
    const src = kept ? sourceOf(kept) : null;
    if (!src) return null;
    out.push(src);
  }
  return out.length ? out : null;
}

/**
 * A chart's range as kept: its parts, each checked ("A1:A7,F1:F7"), from words or a list of ranges. Words that are no
 * range are kept as they were given (plain words, one line), so the chart stays and says why it cannot draw them.
 */
export function cleanChartRange(v: unknown): string {
  const list = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').flatMap(splitParts) : typeof v === 'string' ? splitParts(v) : [];
  const parts = list.slice(0, 20).map((p) => cleanSource(p));
  if (parts.length && parts.every(Boolean)) return parts.join(',');
  return cleanText(list.join(',')).replace(/\s+/g, ' ').trim().slice(0, 200);
}

/** A sheet's sizes for placing charts: each column's width and row's height (0 when hidden, unless `all`; rows a filter hides in `hid`), and where each starts from A1's corner, in px at 100%. */
export function sheetSizes(sh: Sheet, hid?: Set<number>, all = false) {
  const colW = (c: number) => (!all && sh.cols?.[c]?.hidden ? 0 : (sh.cols?.[c]?.w ?? COL_W));
  const rowH = (r: number) => (!all && (sh.rows?.[r]?.hidden || hid?.has(r)) ? 0 : (sh.rows?.[r]?.h ?? ROW_H));
  const lefts = [0];
  const tops = [0];
  const left = (c: number) => {
    while (lefts.length <= c) lefts.push(lefts[lefts.length - 1] + colW(lefts.length - 1));
    return lefts[c];
  };
  const top = (r: number) => {
    while (tops.length <= r) tops.push(tops[tops.length - 1] + rowH(tops.length - 1));
    return tops[r];
  };
  return { colW, rowH, left, top };
}
export type SheetSizes = ReturnType<typeof sheetSizes>;

/** The cell a point falls on (px from A1's corner) and where in it, at these sizes: never a hidden one, which is 0 wide. */
export function cornerAt(x: number, y: number, colW: (c: number) => number, rowH: (r: number) => number): ChartCorner {
  const walk = (px: number, size: (i: number) => number, limit: number): [number, number] => {
    let i = 0;
    let at = 0;
    while (i < limit - 1 && at + size(i) <= px) at += size(i++);
    return [i, Math.max(0, Math.round(px - at))];
  };
  const [c, dx] = walk(x, colW, SHEET_LIMITS.cols);
  const [r, dy] = walk(y, rowH, SHEET_LIMITS.rows);
  return { cell: refName(r, c), ...(dx ? { dx } : {}), ...(dy ? { dy } : {}) };
}

/** Where a corner is, in px from A1's corner, at these sizes and zoom: its cell's place and where in it (no further than the cell reaches, as it may have shrunk or hidden). */
export function cornerXY(k: ChartCorner, g: Pick<SheetSizes, 'left' | 'top' | 'colW' | 'rowH'>, z = 1): { x: number; y: number } {
  const p = parseRef(k.cell) ?? { r: 0, c: 0 };
  return { x: g.left(p.c) + Math.min((k.dx ?? 0) * z, g.colW(p.c)), y: g.top(p.r) + Math.min((k.dy ?? 0) * z, g.rowH(p.r)) };
}

/** Where a chart is, in px from A1's corner: between its corners (nothing, when the rows or columns under it are hidden). */
export function chartBox(ch: SheetChart, g: Pick<SheetSizes, 'left' | 'top' | 'colW' | 'rowH'>, z = 1): { x: number; y: number; w: number; h: number } {
  const a = cornerXY(ch.from, g, z);
  const b = cornerXY(ch.to, g, z);
  return { x: a.x, y: a.y, w: Math.max(0, b.x - a.x), h: Math.max(0, b.y - a.y) };
}

/** A corner as kept: a cell ("E2", or { cell, dx, dy }) within a sheet's limits, and where in it. */
function cleanCorner(v: unknown): ChartCorner | null {
  const o = typeof v === 'string' ? { cell: v } : isObj(v) ? v : null;
  const p = o && typeof o.cell === 'string' ? parseRef(o.cell.replace(/\$/g, '').trim().toUpperCase()) : null;
  if (!p || p.r >= SHEET_LIMITS.rows || p.c >= SHEET_LIMITS.cols) return null;
  const out: ChartCorner = { cell: refName(p.r, p.c) };
  const dx = intIn(o!.dx, 0, MAX_W);
  const dy = intIn(o!.dy, 0, MAX_H);
  if (dx) out.dx = dx;
  if (dy) out.dy = dy;
  return out;
}

/** Whether a corner is past another, right and down (a chart's far corner past its first). */
const pastCorner = (a: ChartCorner, b: ChartCorner) => {
  const p = parseRef(a.cell)!;
  const q = parseRef(b.cell)!;
  return (p.c > q.c || (p.c === q.c && (a.dx ?? 0) > (b.dx ?? 0))) && (p.r > q.r || (p.r === q.r && (a.dy ?? 0) > (b.dy ?? 0)));
};

/**
 * Charts as kept: each with its range and kind, its words checked, and its corners on cells: as given (from, to), at
 * a cell or over a range (at: "E2" with w and h in px, or at: "E2:J16"), in px from A1's corner as charts were kept
 * before (x, y, w, h: placed where they were drawn), or beside the cells it draws.
 */
function cleanCharts(v: unknown, g: SheetSizes): SheetChart[] {
  if (!Array.isArray(v)) return [];
  const ids = new Set<string>();
  const out: SheetChart[] = [];
  const text = (x: unknown) => (typeof x === 'string' && x.trim() ? cleanText(x).trim().replace(/\n+/g, ' ').slice(0, 200) : undefined);
  for (const x of v.slice(0, SHEET_LIMITS.charts)) {
    if (!isObj(x)) continue;
    const range = cleanChartRange(x.range ?? x.ranges ?? x.data);
    if (!range) continue;
    const k = String(x.kind ?? x.type ?? 'column').toLowerCase();
    const kind = (SHEET_CHART_KINDS as string[]).includes(k) ? (k as SheetChartKind) : (CHART_ALIAS[k] ?? 'column');
    let id = typeof x.id === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(x.id) ? x.id : newId();
    while (ids.has(id)) id = newId();
    ids.add(id);
    // Where it sits: its corners as given, else from a cell, a range, px, or the cells it draws.
    let from = cleanCorner(x.from);
    let to = cleanCorner(x.to);
    const at = typeof x.at === 'string' ? parseRange(x.at.replace(/\$/g, '').trim().toUpperCase()) : null;
    if (!from && at && at.r1 < SHEET_LIMITS.rows && at.c1 < SHEET_LIMITS.cols) {
      from = { cell: refName(at.r1, at.c1) };
      if (!to && (at.r2 > at.r1 || at.c2 > at.c1)) to = { cell: refName(Math.min(at.r2 + 1, SHEET_LIMITS.rows - 1), Math.min(at.c2 + 1, SHEET_LIMITS.cols - 1)) };
    }
    const px = intIn(x.x, 0, 400_000);
    const py = intIn(x.y, 0, 2_000_000);
    if (!from && (px !== undefined || py !== undefined)) from = cornerAt(px ?? 0, py ?? 0, g.colW, g.rowH);
    if (!from) {
      const src = chartParts(range)?.[0];
      from = src && !src.sheet ? { cell: refName(src.x.r1, Math.min(src.x.c2 + 2, SHEET_LIMITS.cols - 1)) } : { cell: 'A1' };
    }
    if (!to || !pastCorner(to, from)) {
      const w = intIn(x.w ?? x.width, 160, 3000) ?? 480;
      const h = intIn(x.h ?? x.height, 120, 2000) ?? 300;
      const p0 = cornerXY(from, g);
      to = cornerAt(p0.x + w, p0.y + h, g.colW, g.rowH);
    }
    const c: SheetChart = { id, kind, range, from, to };
    if (x.by === 'rows' || x.series === 'rows') c.by = 'rows';
    if (typeof x.labels === 'boolean') c.labels = x.labels;
    if (typeof x.names === 'boolean') c.names = x.names;
    const title = text(x.title);
    if (title) c.title = title;
    const legend = x.legend === false ? 'none' : String(x.legend ?? '').toLowerCase();
    if (legend === 'bottom' || legend === 'right' || legend === 'top' || legend === 'none') c.legend = legend;
    const xt = text(x.xTitle ?? x.xAxis);
    if (xt) c.xTitle = xt;
    const yt = text(x.yTitle ?? x.yAxis);
    if (yt) c.yTitle = yt;
    const colors = Array.isArray(x.colors) ? x.colors.slice(0, 12).flatMap((col) => cleanColor(col) ?? []) : [];
    if (colors.length) c.colors = colors;
    if (x.stacked === true || x.stacked === 'percent' || x.percent === true) c.stacked = true;
    if (x.percent === true || x.stacked === 'percent') c.percent = true;
    if (x.values === true || x.dataLabels === true || x.labelsOnPoints === true) c.values = true;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);
    const lo = num(x.min ?? x.yMin);
    const hi = num(x.max ?? x.yMax);
    if (lo !== undefined && (hi === undefined || lo < hi)) c.min = lo;
    if (hi !== undefined && (lo === undefined || lo < hi)) c.max = hi;
    if (Array.isArray(x.series)) {
      const opts = x.series.slice(0, 50).map((o): ChartSeriesOpts => {
        const s: ChartSeriesOpts = {};
        if (!isObj(o)) return s;
        if (o.type === 'line' || o.type === 'column') s.type = o.type;
        if (o.axis === 2 || o.axis === '2' || o.axis === 'right' || o.right === true) s.axis = 2;
        if (o.trend === 'linear' || o.trend === 'exp' || o.trendline === 'linear' || o.trendline === 'exp' || o.trend === true) s.trend = o.trend === 'exp' || o.trendline === 'exp' ? 'exp' : 'linear';
        return s;
      });
      while (opts.length && !Object.keys(opts[opts.length - 1]).length) opts.pop();
      if (opts.length) c.series = opts;
    }
    const bins = intIn(x.bins, 2, 100);
    if (bins && kind === 'histogram') c.bins = bins;
    out.push(c);
  }
  return out;
}

/**
 * A board as kept: its table's first cell, the column it groups by and those its cards show, each named by its letters
 * or by its header's words in the table's first row (the words first: "Id" is a header before it is column ID), its
 * lanes' order and whether the sheet opens on it; undefined without a column to group by.
 */
function cleanBoard(v: unknown, cells: Map<number, Cell>): SheetBoard | undefined {
  if (!isObj(v)) return undefined;
  const p = typeof v.at === 'string' ? parseRef(v.at.replace(/\$/g, '').trim().toUpperCase()) : null;
  const at = p && p.r < SHEET_LIMITS.rows && p.c < SHEET_LIMITS.cols ? p : { r: 0, c: 0 };
  const heads = new Map<string, number>();
  for (let c = at.c; c < SHEET_LIMITS.cols && c < at.c + 200; c++) {
    const h = cells.get(pack(at.r, c))?.v;
    if (typeof h === 'string' && h.trim() && !heads.has(h.trim().toLowerCase())) heads.set(h.trim().toLowerCase(), c);
  }
  const colOf = (x: unknown): number | null => {
    if (typeof x !== 'string' || !x.trim()) return null;
    const byHead = heads.get(x.trim().toLowerCase());
    if (byHead !== undefined) return byHead;
    const c = /^[A-Za-z]{1,3}$/.test(x.trim()) ? colIndex(x.trim().toUpperCase()) : -1;
    return c >= at.c && c < SHEET_LIMITS.cols ? c : null;
  };
  const by = colOf(v.by ?? v.group ?? v.groupBy);
  if (by === null) return undefined;
  const out: SheetBoard = { at: refName(at.r, at.c), by: colName(by) };
  if (Array.isArray(v.fields)) {
    const cols = [...new Set(v.fields.slice(0, 50).map(colOf).filter((c): c is number => c !== null && c !== by))].sort((a, b) => a - b);
    out.fields = cols.map(colName);
  }
  if (Array.isArray(v.lanes)) {
    const seen = new Set<string>();
    const lanes: string[] = [];
    for (const x of v.lanes.slice(0, 100)) {
      const t = typeof x === 'string' || typeof x === 'number' ? cleanText(String(x)).trim().slice(0, 255) : '';
      if (!t || seen.has(t.toLowerCase())) continue;
      seen.add(t.toLowerCase());
      lanes.push(t);
    }
    if (lanes.length) out.lanes = lanes;
  }
  if (v.open === true) out.open = true;
  return out;
}

/**
 * A sheet's comments as kept: each checked (plain words, within the limits) on a cell within the sheet's, one thread a
 * cell (a second on the same cell joins the first as replies, nothing lost), ids not twice in the workbook (`ids`).
 */
export function cleanSheetComments(v: unknown, ids: Set<string> = new Set()): SheetComment[] {
  if (!Array.isArray(v)) return [];
  const byCell = new Map<number, SheetComment>();
  for (const x of v.slice(0, 1000)) {
    if (!isObj(x) || typeof x.cell !== 'string') continue;
    const p = parseRef(x.cell.replace(/\$/g, '').trim().toUpperCase());
    const c = cleanComment(x);
    if (!p || !c || p.r >= SHEET_LIMITS.rows || p.c >= SHEET_LIMITS.cols) continue;
    while (ids.has(c.id)) c.id = newCommentId();
    ids.add(c.id);
    const k = pack(p.r, p.c);
    const had = byCell.get(k);
    if (!had) byCell.set(k, { ...c, cell: refName(p.r, p.c) });
    // Joined as a reply, it keeps who wrote it (someone it is shared with by their name).
    else had.replies = [...(had.replies ?? []), { id: c.id, by: c.by, ...(c.name ? { name: c.name } : {}), ...(c.who ? { who: c.who } : {}), ...(c.author ? { author: c.author } : {}), text: c.text, at: c.at }, ...(c.replies ?? [])].slice(0, 50);
    if (byCell.size >= 500) break;
  }
  return [...byCell.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => c);
}

// ---- names, protection, groups, printing, AI answers: checking them -----------------------------------------------

/** Whether words may name a range: a letter, _ or \ first, then letters, digits, _ . and \; not a cell (A1, R1C1), TRUE or FALSE. */
export function isRangeName(name: string): boolean {
  if (!/^[A-Za-z_\\\p{L}][\p{L}\p{N}_.\\]{0,254}$/u.test(name)) return false;
  return !(/^[A-Za-z]{1,3}\d+$/.test(name) || /^(R\d*C\d*|R\d*|C\d*)$/i.test(name) || /^(true|false)$/i.test(name));
}

/** Named ranges as kept: each name once (in any case, per sheet it is for), what it stands for a formula that can be read. */
export function cleanNames(v: unknown, sheetIds?: Set<string>): NamedRange[] {
  let list: unknown[] = [];
  if (Array.isArray(v)) list = v;
  else if (isObj(v)) list = Object.entries(v).map(([name, ref]) => (isObj(ref) ? { name, ...ref } : { name, ref }));
  const out: NamedRange[] = [];
  const seen = new Set<string>();
  for (const x of list.slice(0, 1000)) {
    if (!isObj(x)) continue;
    const name = typeof x.name === 'string' ? x.name.trim() : '';
    const raw = x.ref ?? x.range ?? x.value ?? x.formula;
    const ref = typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : typeof raw === 'string' ? cleanText(raw).trim().replace(/^=/, '').trim().slice(0, SHEET_LIMITS.formula) : '';
    if (!isRangeName(name) || !ref || formulaProblem(ref)) continue;
    const sheet = typeof x.sheet === 'string' && (!sheetIds || sheetIds.has(x.sheet)) ? x.sheet : undefined;
    const k = `${sheet ?? ''}\u0001${name.toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const one: NamedRange = { name, ref };
    if (sheet) one.sheet = sheet;
    const note = typeof x.note === 'string' ? cleanText(x.note).trim().slice(0, 300) : '';
    if (note) one.note = note;
    out.push(one);
  }
  return out;
}

/** The AI function's answers as kept: by their keys, each a number, TRUE or FALSE, or words. */
function cleanAi(v: unknown): Record<string, CellValue> | undefined {
  if (!isObj(v)) return undefined;
  const out: Record<string, CellValue> = {};
  let n = 0;
  for (const [k, x] of Object.entries(v)) {
    if (!/^[a-z0-9]{4,24}$/.test(k)) continue;
    if (typeof x === 'number' && Number.isFinite(x)) out[k] = x;
    else if (typeof x === 'boolean') out[k] = x;
    else if (typeof x === 'string') out[k] = cleanText(x);
    else continue;
    if (++n >= 20_000) break;
  }
  return n ? out : undefined;
}

/** Protected cells as kept: a range each (or the whole sheet, but the cells it leaves open), warning or refusing. */
function cleanProtect(v: unknown): SheetProtect[] {
  const list = Array.isArray(v) ? v : isObj(v) || v === true ? [v] : [];
  const out: SheetProtect[] = [];
  let whole = false;
  for (const x of list.slice(0, 50)) {
    const o = isObj(x) ? x : {};
    const range = cleanRanges(o.range ?? o.ranges);
    if (!range && whole) continue;
    const p: SheetProtect = {};
    if (range) p.range = range;
    else whole = true;
    const except = !range ? cleanRanges(o.except ?? o.unlocked) : '';
    if (except) p.except = except;
    if (o.warn === true || o.warning === true || o.mode === 'warn') p.warn = true;
    const note = typeof o.note === 'string' ? cleanText(o.note).trim().replace(/\n+/g, ' ').slice(0, 200) : '';
    if (note) p.note = note;
    out.push(p);
  }
  return out;
}

/** Groups of rows ("3:7") or columns ("C:E") as kept: within the sheet's limits, each once. */
function cleanGroups(v: unknown): SheetGroup[] {
  if (!Array.isArray(v)) return [];
  const out: SheetGroup[] = [];
  const seen = new Set<string>();
  for (const x of v.slice(0, 200)) {
    const o: Obj = isObj(x) ? x : { range: x };
    const t = typeof o.range === 'string' ? o.range.replace(/\$/g, '').replace(/\s+/g, '').toUpperCase() : typeof o.range === 'number' ? String(o.range) : '';
    let range = '';
    const rows = /^(\d{1,6})(?::(\d{1,6}))?$/.exec(t);
    const cols = /^([A-Z]{1,3})(?::([A-Z]{1,3}))?$/.exec(t);
    if (rows) {
      const a = Number(rows[1]);
      const b = Number(rows[2] ?? rows[1]);
      if (a >= 1 && b >= 1 && Math.max(a, b) <= SHEET_LIMITS.rows) range = `${Math.min(a, b)}:${Math.max(a, b)}`;
    } else if (cols) {
      const a = colIndex(cols[1]);
      const b = colIndex(cols[2] ?? cols[1]);
      if (a >= 0 && b >= 0 && Math.max(a, b) < SHEET_LIMITS.cols) range = `${colName(Math.min(a, b))}:${colName(Math.max(a, b))}`;
    }
    if (!range || seen.has(range)) continue;
    seen.add(range);
    out.push(o.hidden === true || o.collapsed === true ? { range, hidden: true } : { range });
  }
  return out;
}

/** A pivot table's settings as kept: a range to sum up, one or two columns for its rows, values, filters; undefined when unusable. */
export function cleanPivot(v: unknown): PivotDef | undefined {
  if (!isObj(v)) return undefined;
  const source = cleanSource(v.source);
  const col = (x: unknown) => (typeof x === 'string' && /^[A-Za-z]{1,3}$/.test(x.trim()) ? x.trim().toUpperCase() : null);
  const rows = (Array.isArray(v.rows) ? v.rows : [v.rows]).map(col).filter((c): c is string => !!c).slice(0, 2);
  const FNS2 = ['sum', 'count', 'average', 'min', 'max'];
  const values = (Array.isArray(v.values) ? v.values : []).flatMap((x) => (isObj(x) && col(x.col) ? [{ col: col(x.col)!, fn: (FNS2.includes(String(x.fn)) ? x.fn : 'sum') as PivotDef['values'][number]['fn'] }] : [])).slice(0, 10);
  if (!source || !rows.length || !values.length) return undefined;
  const out: PivotDef = { source, rows, values };
  const cc = col(v.cols);
  if (cc && !rows.includes(cc)) out.cols = cc;
  const filters = (Array.isArray(v.filters) ? v.filters : []).flatMap((x) => (isObj(x) && col(x.col) && Array.isArray(x.hide) ? [{ col: col(x.col)!, hide: x.hide.slice(0, 500).map((h) => cleanText(String(h)).slice(0, 255)) }] : [])).slice(0, 10);
  if (filters.length) out.filters = filters;
  return out;
}

/** How a sheet prints, as kept; undefined when it says nothing of its own. */
function cleanPrint(v: unknown): PrintSetup | undefined {
  if (!isObj(v)) return undefined;
  const p: PrintSetup = {};
  const o = String(v.orient ?? v.orientation ?? '').toLowerCase();
  if (o === 'portrait' || o === 'upright') p.orient = 'portrait';
  else if (o === 'landscape' || o === 'across') p.orient = 'landscape';
  const fit = v.fit === true ? 'width' : v.fit === false ? 'none' : String(v.fit ?? '').toLowerCase();
  if (fit === 'width' || fit === 'page' || fit === 'none') p.fit = fit;
  const area = cleanRanges(v.area ?? v.range);
  if (area) p.area = area.split(',')[0];
  const titles = intIn(v.titles ?? v.repeat ?? v.headerRows, 0, 20);
  if (titles !== undefined) p.titles = titles;
  if (typeof v.grid === 'boolean' || typeof v.gridlines === 'boolean') p.grid = (v.grid ?? v.gridlines) as boolean;
  return Object.keys(p).length ? p : undefined;
}

function sheetOf(raw: unknown, i: number, ids: Set<string>, names: string[], budget: Budget, commentIds: Set<string>): Sheet | null {
  if (Array.isArray(raw)) raw = { rows: raw };
  if (!isObj(raw)) return null;
  let id = typeof raw.id === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(raw.id) ? raw.id : newId();
  while (ids.has(id)) id = newId();
  ids.add(id);
  const name = uniqueSheetName(cleanSheetName(raw.name ?? raw.title, i), names);
  names.push(name);
  const cells = new Map<number, Cell>();
  const put = (r: number, c: number, cell: Cell | null) => {
    if (r >= SHEET_LIMITS.rows) return void (cell && budget.cut.rows++);
    if (c >= SHEET_LIMITS.cols) return void (cell && budget.cut.cols++);
    const k = pack(r, c);
    const had = cells.has(k);
    if (!cell) {
      if (had) (cells.delete(k), budget.cells++);
      return;
    }
    if (!had) {
      if (budget.cells <= 0) return void budget.cut.cells++;
      budget.cells--;
    }
    cells.set(k, cell);
  };
  const styleAt = (r: number, c: number, s: CellStyle | undefined, create: boolean) => {
    if (!s) return;
    const cur = cells.get(pack(r, c));
    if (cur) cells.set(pack(r, c), { ...cur, s: mergeStyle(cur.s, s) });
    else if (create) put(r, c, { s });
  };

  // From a file (a kept sheet), then rows from A1 (or `start`), then cells by name.
  const base = isObj(raw.base) ? raw.base : null;
  if (base && isObj(base.cells))
    for (const [k, x] of Object.entries(base.cells)) {
      const p = parseRef(k);
      if (p) put(p.r, p.c, cleanCell(x, false));
    }
  const values = Array.isArray(raw.rows) ? raw.rows : Array.isArray(raw.data) ? raw.data : Array.isArray(raw.values) ? raw.values : null;
  const at = typeof raw.start === 'string' ? parseRef(raw.start) : null;
  const [r0, c0] = at ? [at.r, at.c] : [0, 0];
  if (values)
    values.forEach((row, ri) => {
      if (Array.isArray(row)) row.forEach((x, ci) => put(r0 + ri, c0 + ci, cleanCell(x, true)));
      else if (row !== null && row !== undefined && !isObj(row)) put(r0 + ri, c0, cleanCell(row, true));
    });
  if (isObj(raw.cells))
    for (const [k, x] of Object.entries(raw.cells)) {
      const p = parseRef(k);
      if (p) put(p.r, p.c, cleanCell(x, !isObj(x)));
    }

  // Styles over ranges, formats over columns, a bold header row.
  const header = raw.header === true || raw.headers === true;
  if (isObj(raw.styles))
    for (const [k, x] of Object.entries(raw.styles)) {
      const rg = parseRange(k);
      if (!rg) continue;
      const s = cleanStyle(x);
      // An outline: a border round the range's outer edge only.
      const line = isObj(x) ? cleanBorder(x.outline) : undefined;
      if (!s && !line) continue;
      const r2 = Math.min(rg.r2, SHEET_LIMITS.rows - 1);
      const c2 = Math.min(rg.c2, SHEET_LIMITS.cols - 1);
      const area = (r2 - rg.r1 + 1) * (c2 - rg.c1 + 1);
      // A small range is styled cell by cell, empty ones too (a fill shows on them); a big one where it has cells.
      if (s) {
        if (area <= 5000) for (let r = rg.r1; r <= r2; r++) for (let c = rg.c1; c <= c2; c++) styleAt(r, c, s, true);
        else for (const key of [...cells.keys()]) if (unpackR(key) >= rg.r1 && unpackR(key) <= r2 && unpackC(key) >= rg.c1 && unpackC(key) <= c2) styleAt(unpackR(key), unpackC(key), s, false);
      }
      if (line && r2 - rg.r1 < 5000 && c2 - rg.c1 < 500)
        for (let r = rg.r1; r <= r2; r++)
          for (let c = rg.c1; c <= c2; c++) {
            const edge: CellStyle = {};
            if (r === rg.r1) edge.bt = line;
            if (r === r2) edge.bb = line;
            if (c === rg.c1) edge.bl = line;
            if (c === c2) edge.br = line;
            if (Object.keys(edge).length) styleAt(r, c, edge, true);
          }
    }
  // Notes by cell: { "B2": "Checked by Sam" }.
  if (isObj(raw.notes))
    for (const [k, x] of Object.entries(raw.notes)) {
      const p = parseRef(k);
      const note = cleanNote(x);
      if (!p || p.r >= SHEET_LIMITS.rows || p.c >= SHEET_LIMITS.cols) continue;
      const cur = cells.get(pack(p.r, p.c));
      if (cur) {
        const next: Cell = { ...cur };
        if (note) next.note = note;
        else delete next.note;
        cells.set(pack(p.r, p.c), next);
      } else if (note) put(p.r, p.c, { note });
    }
  const formats = isObj(raw.formats) ? raw.formats : isObj(raw.format) ? raw.format : null;
  if (formats)
    for (const [k, x] of Object.entries(formats)) {
      const span = colSpan(k);
      const f = fmtOf(x);
      if (!span || !f) continue;
      const s = cleanStyle(f) ?? {};
      const general = !f.fmt || f.fmt === 'general';
      for (const key of [...cells.keys()]) {
        const r = unpackR(key);
        const c = unpackC(key);
        if (c < span[0] || c > span[1] || (header && r === r0)) continue;
        const cur = cells.get(key)!;
        // A format replaces what the cell had (general clears it).
        const { fmt: _f, dp: _d, cur: _c, code: _k, ...rest } = cur.s ?? {};
        cells.set(key, { ...cur, s: general ? cleanStyle({ ...rest, dp: f.dp }) : cleanStyle({ ...rest, ...s }) });
      }
    }
  if (header) for (const key of [...cells.keys()]) if (unpackR(key) === r0) styleAt(r0, unpackC(key), { b: true }, false);

  // Columns' widths and rows' heights: kept ones by index, or an agent's by letters and row numbers.
  const cols: Record<number, { w?: number; hidden?: boolean }> = {};
  const setW = (c: number, w: unknown) => {
    const n = intIn(w, MIN_W, MAX_W);
    if (n !== undefined && c >= 0 && c < SHEET_LIMITS.cols && n !== COL_W) cols[c] = { ...cols[c], w: n };
  };
  const hideCol = (c: number) => c >= 0 && c < SHEET_LIMITS.cols && (cols[c] = { ...cols[c], hidden: true });
  for (const from of [base?.cols, raw.cols])
    if (isObj(from))
      for (const [k, x] of Object.entries(from)) {
        if (!/^\d+$/.test(k)) continue;
        setW(Number(k), isObj(x) ? x.w : x);
        if (isObj(x) && x.hidden === true) hideCol(Number(k));
      }
  const widths = raw.widths ?? raw.colWidths;
  if (Array.isArray(widths)) widths.forEach((w, c) => setW(c0 + c, w));
  else if (isObj(widths))
    for (const [k, w] of Object.entries(widths)) {
      if (/^\d+$/.test(k)) setW(Number(k), w);
      else {
        const span = colSpan(k);
        if (span) for (let c = span[0]; c <= span[1]; c++) setW(c, w);
      }
    }
  const rows: Record<number, { h?: number; hidden?: boolean }> = {};
  const setH = (r: number, h: unknown) => {
    const n = intIn(h, MIN_H, MAX_H);
    if (n !== undefined && r >= 0 && r < SHEET_LIMITS.rows && n !== ROW_H) rows[r] = { ...rows[r], h: n };
  };
  const hideRow = (r: number) => r >= 0 && r < SHEET_LIMITS.rows && (rows[r] = { ...rows[r], hidden: true });
  for (const from of [base?.rows, raw.rows])
    if (isObj(from))
      for (const [k, x] of Object.entries(from)) {
        if (!/^\d+$/.test(k)) continue;
        setH(Number(k), isObj(x) ? x.h : x);
        if (isObj(x) && x.hidden === true) hideRow(Number(k));
      }
  const heights = raw.heights ?? raw.rowHeights;
  if (Array.isArray(heights)) heights.forEach((h, r) => setH(r0 + r, h));
  else if (isObj(heights)) for (const [k, h] of Object.entries(heights)) if (/^\d+$/.test(k) && Number(k) >= 1) setH(Number(k) - 1, h);
  // Hidden rows and columns as an agent names them: { rows: [3, "5:7"], cols: ["C", "E:F"] }.
  if (isObj(raw.hidden)) {
    for (const x of Array.isArray(raw.hidden.rows) ? raw.hidden.rows.slice(0, 1000) : []) {
      const m = /^\s*(\d{1,6})(?:\s*:\s*(\d{1,6}))?\s*$/.exec(String(x));
      if (m) for (let r = Number(m[1]); r <= Math.min(Number(m[2] ?? m[1]), Number(m[1]) + 5000); r++) hideRow(r - 1);
    }
    for (const x of Array.isArray(raw.hidden.cols) ? raw.hidden.cols.slice(0, 500) : []) {
      const span = typeof x === 'string' ? colSpan(x) : null;
      if (span) for (let c = span[0]; c <= span[1]; c++) hideCol(c);
    }
  }

  const sheet: Sheet = { id, name, cells: {} };
  // Each in one order (its size, then whether it is hidden), so the kept text stays the same.
  const tidy = <T extends { w?: number; h?: number; hidden?: boolean }>(m: Record<number, T>) => {
    const out: Record<number, T> = {};
    for (const k of Object.keys(m)
      .map(Number)
      .sort((a, b) => a - b)) {
      const x = m[k];
      const one = { ...(x.w ? { w: x.w } : {}), ...(x.h ? { h: x.h } : {}), ...(x.hidden ? { hidden: true } : {}) } as T;
      if (Object.keys(one).length) out[k] = one;
    }
    return out;
  };
  const colsKept = tidy(cols);
  const rowsKept = tidy(rows);
  if (Object.keys(colsKept).length) sheet.cols = colsKept;
  if (Object.keys(rowsKept).length) sheet.rows = rowsKept;
  const freeze = raw.freeze !== undefined ? freezeOf(raw.freeze) : header ? { rows: r0 + 1 } : base?.freeze !== undefined ? freezeOf(base.freeze) : undefined;
  if (freeze) sheet.freeze = freeze;
  // Merges, a filter, conditional formatting, rules for what cells take, charts: an agent's, or else the file's.
  const pick = (...keys: string[]) => {
    for (const k of keys) if (raw[k] !== undefined) return raw[k];
    for (const k of keys) if (base?.[k] !== undefined) return base[k];
    return undefined;
  };
  const merges = cleanMerges(pick('merges', 'merged', 'merge'));
  if (merges.length) sheet.merges = merges;
  const filter = cleanFilter(pick('filter', 'autoFilter'));
  if (filter) sheet.filter = filter;
  const conditional = cleanRules(pick('conditional', 'conditionalFormatting', 'cf'));
  if (conditional.length) sheet.conditional = conditional;
  const validation = cleanValidations(pick('validation', 'validations', 'dataValidation'));
  if (validation.length) sheet.validation = validation;
  // Charts placed in px before were drawn with hidden rows and columns folded away: their corners are found so too.
  const charts = cleanCharts(pick('charts'), sheetSizes(sheet));
  if (charts.length) sheet.charts = charts;
  const board = cleanBoard(pick('board', 'kanban'), cells);
  if (board) sheet.board = board;
  const comments = cleanSheetComments(pick('comments'), commentIds);
  if (comments.length) sheet.comments = comments;
  const protect = cleanProtect(pick('protect', 'protected', 'protection'));
  if (protect.length) sheet.protect = protect;
  const groups = cleanGroups(pick('groups', 'outline'));
  if (groups.length) sheet.groups = groups;
  const print = cleanPrint(pick('print', 'pageSetup'));
  if (print) sheet.print = print;
  const pivot = cleanPivot(pick('pivot'));
  if (pivot) sheet.pivot = pivot;
  // The grid's lines hidden: noGrid: true, or gridlines: false (an agent's words), else as the file had them.
  const noGrid = raw.noGrid ?? (raw.gridlines === undefined ? undefined : raw.gridlines === false) ?? base?.noGrid;
  if (noGrid === true) sheet.noGrid = true;
  // The tab's colour, and the sheet hidden from the tabs (a sheet's hidden rows and columns are `hidden: {rows, cols}`, an object).
  const tab = cleanColor(raw.tabColor ?? raw.tab);
  if (tab) sheet.tabColor = tab;
  if (raw.hidden === true || raw.state === 'hidden' || raw.state === 'veryHidden') sheet.hidden = true;
  // Cells in reading order: row by row, left to right.
  const out: Record<string, Cell> = {};
  for (const k of [...cells.keys()].sort((a, b) => a - b)) out[refName(unpackR(k), unpackC(k))] = cells.get(k)!;
  sheet.cells = out;
  return sheet;
}

/**
 * The workbook as it is kept, from what an agent or the editor sent: unknown fields dropped, every value checked,
 * ids given where missing, names made fit for Excel. Throws when it is not a workbook at all.
 */
export function normalizeBook(input: unknown, o: NormalizeOptions = {}): Workbook {
  let v = typeof input === 'string' ? (JSON.parse(input) as unknown) : input;
  if (Array.isArray(v)) v = { sheets: v };
  if (!isObj(v)) throw new Error('A workbook is an object with sheets: [{ name, rows: [[…], …] }].');
  let list: unknown[] | null = null;
  if (Array.isArray(v.sheets)) list = v.sheets;
  else if (isObj(v.sheets)) list = Object.entries(v.sheets).map(([name, s]) => (isObj(s) ? { name, ...s } : Array.isArray(s) ? { name, rows: s } : null));
  else if (v.rows !== undefined || v.cells !== undefined) list = [v];
  if (!list) throw new Error('A workbook needs sheets: an array, each with rows (from A1) or cells by name.');
  if (list.length > SHEET_LIMITS.sheets) o.notes?.push(`Only the first ${SHEET_LIMITS.sheets} sheets were kept.`);
  const ids = new Set<string>();
  const names: string[] = [];
  const budget: Budget = { cells: SHEET_LIMITS.cells, cut: { cells: 0, rows: 0, cols: 0 } };
  const commentIds = new Set<string>();
  const sheets = list
    .slice(0, SHEET_LIMITS.sheets)
    .map((s, i) => sheetOf(s, i, ids, names, budget, commentIds))
    .filter((s): s is Sheet => !!s);
  if (!sheets.length) sheets.push({ id: newId(), name: 'Sheet 1', cells: {} });
  // At least one sheet shows.
  if (sheets.every((s) => s.hidden)) delete sheets[0].hidden;
  const { cells, rows, cols } = budget.cut;
  if (cells) o.notes?.push(`${cells} cell${cells === 1 ? '' : 's'} left out: a workbook holds at most ${SHEET_LIMITS.cells.toLocaleString('en')} cells.`);
  if (rows) o.notes?.push(`Cells below row ${SHEET_LIMITS.rows.toLocaleString('en')} were left out.`);
  if (cols) o.notes?.push(`Cells right of column ${colName(SHEET_LIMITS.cols - 1)} were left out.`);
  const book: Workbook = { v: 1, sheets };
  // A name for one sheet may say it by its name too ({ name, ref, sheet: "Budget" }).
  const rawNames = Array.isArray(v.names) ? v.names.map((x) => (isObj(x) && typeof x.sheet === 'string' ? { ...x, sheet: sheets.find((s) => s.id === x.sheet || s.name.toLowerCase() === String(x.sheet).toLowerCase())?.id } : x)) : v.names;
  const named = cleanNames(rawNames, new Set(sheets.map((s) => s.id)));
  if (named.length) book.names = named;
  const ai = cleanAi(v.ai);
  if (ai) book.ai = ai;
  return book;
}

/** A new workbook: one empty sheet. */
export function newBook(_title?: string): Workbook {
  return { v: 1, sheets: [{ id: newId(), name: 'Sheet 1', cells: {} }] };
}

/**
 * The workbook as text to keep: JSON with a line for each sheet's start and one for each row of its cells, so the
 * changes between two versions read as a diff of lines.
 */
export function bookText(b: Workbook): string {
  const out: string[] = ['{"v":1,"sheets":['];
  b.sheets.forEach((sh, i) => {
    const head: Record<string, unknown> = { id: sh.id, name: sh.name };
    if (sh.cols && Object.keys(sh.cols).length) head.cols = sh.cols;
    if (sh.rows && Object.keys(sh.rows).length) head.rows = sh.rows;
    if (sh.freeze) head.freeze = sh.freeze;
    if (sh.merges?.length) head.merges = sh.merges;
    if (sh.filter) head.filter = sh.filter;
    if (sh.conditional?.length) head.conditional = sh.conditional;
    if (sh.validation?.length) head.validation = sh.validation;
    if (sh.charts?.length) head.charts = sh.charts;
    if (sh.board) head.board = sh.board;
    if (sh.comments?.length) head.comments = sh.comments;
    if (sh.protect?.length) head.protect = sh.protect;
    if (sh.groups?.length) head.groups = sh.groups;
    if (sh.print) head.print = sh.print;
    if (sh.noGrid) head.noGrid = true;
    if (sh.tabColor) head.tabColor = sh.tabColor;
    if (sh.hidden) head.hidden = true;
    if (sh.pivot) head.pivot = sh.pivot;
    out.push(` ${JSON.stringify(head).slice(0, -1)},"cells":{`);
    const byRow = new Map<number, string[]>();
    const keys = Object.keys(sh.cells)
      .map((k) => [keyOf(k), k] as const)
      .filter(([n]) => n >= 0)
      .sort((x, y) => x[0] - y[0]);
    for (const [n, k] of keys) {
      const r = unpackR(n);
      let line = byRow.get(r);
      if (!line) byRow.set(r, (line = []));
      line.push(`${JSON.stringify(k)}:${JSON.stringify(sh.cells[k])}`);
    }
    const lines = [...byRow.values()];
    lines.forEach((l, j) => out.push(`  ${l.join(',')}${j < lines.length - 1 ? ',' : ''}`));
    out.push(` }}${i < b.sheets.length - 1 ? ',' : ''}`);
  });
  // The names after the sheets, and the AI answers last, a line each (an agent is shown the workbook without them).
  const ai = Object.entries(b.ai ?? {});
  if (!b.names?.length && !ai.length) {
    out.push(']}');
    return out.join('\n');
  }
  out.push(b.names?.length ? `],"names":${JSON.stringify(b.names)}${ai.length ? ',' : '}'}` : '],');
  if (ai.length) {
    out.push('"ai":{');
    ai.forEach(([k, v], j) => out.push(` ${JSON.stringify(k)}:${JSON.stringify(v)}${j < ai.length - 1 ? ',' : ''}`));
    out.push('}}');
  }
  return out.join('\n');
}

/** Whether stored page text is a workbook (rather than a page's HTML, a deck or a document). */
export const isBookText = (s: string) => /^\s*\{\s*"v"\s*:\s*1\s*,\s*"sheets"\s*:/.test(s);

// ---- formulas: reading them ------------------------------------------------------------------------------------

/** A reference's corner: its row and column from 0 (a whole column has no row, a whole row no column), and which are fixed ($). */
export interface RefPart {
  r?: number;
  c?: number;
  ar?: boolean;
  ac?: boolean;
}

/** A reference as written: to a cell (a), a range (a to b), whole columns or rows; on another sheet when it names one. */
export interface RefTok {
  sheet?: string;
  a: RefPart;
  b?: RefPart;
}

type Tok =
  | { k: 'num'; s: number; e: number; v: number }
  | { k: 'str'; s: number; e: number; v: string }
  | { k: 'bool'; s: number; e: number; v: boolean }
  | { k: 'err'; s: number; e: number; v: CellError }
  /** `ps`: where the reference starts after its sheet's name (the same as `s` without one). */
  | { k: 'ref'; s: number; e: number; ps: number; ref: RefTok }
  | { k: 'fn'; s: number; e: number; v: string }
  | { k: 'name'; s: number; e: number; v: string }
  | { k: 'op'; s: number; e: number; v: string }
  | { k: 'p'; s: number; e: number; v: string }
  | { k: 'bad'; s: number; e: number; v: string };

const RX = {
  ws: /\s+/y,
  num: /(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y,
  str: /"((?:[^"]|"")*)"/y,
  err: /#(?:DIV\/0!|N\/A|NAME\?|NULL!|NUM!|REF!|VALUE!)/iy,
  sheetQ: /'((?:[^']|'')+)'!/y,
  sheet: /([A-Za-z_¡-￿][A-Za-z0-9_.¡-￿]*)!/y,
  cell: /(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})(?![A-Za-z0-9_.(])/y,
  to: /:(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})(?![A-Za-z0-9_.(])/y,
  cols: /(\$?)([A-Za-z]{1,3}):(\$?)([A-Za-z]{1,3})(?![A-Za-z0-9_.(])/y,
  rows: /(\$?)(\d{1,7}):(\$?)(\d{1,7})(?![\d.A-Za-z_(])/y,
  ident: /[A-Za-z_\\¡-￿][A-Za-z0-9_.\\¡-￿]*/y,
  op: /<>|<=|>=|[-+*/^&=<>%]/y,
};

const at = (re: RegExp, s: string, i: number) => {
  re.lastIndex = i;
  return re.exec(s);
};

/** A cell's corner from a match of RX.cell or RX.to; null past Excel's grid. */
function cellPart(m: RegExpExecArray): RefPart | null {
  const c = colIndex(m[2]);
  const r = Number(m[4]) - 1;
  if (c < 0 || c >= MAX_COLS || r < 0 || r >= MAX_ROWS) return null;
  const p: RefPart = { r, c };
  if (m[1]) p.ac = true;
  if (m[3]) p.ar = true;
  return p;
}

/** A reference at `j` (after a sheet's name, if any): [the reference, where it ends], or null. */
function refAt(f: string, j: number): [RefTok, number] | null {
  let m = at(RX.cols, f, j);
  if (m) {
    const a = colIndex(m[2]);
    const b = colIndex(m[4]);
    if (a < MAX_COLS && b < MAX_COLS) return [{ a: { c: a, ...(m[1] ? { ac: true } : {}) }, b: { c: b, ...(m[3] ? { ac: true } : {}) } }, j + m[0].length];
  }
  m = at(RX.rows, f, j);
  if (m) {
    const a = Number(m[2]) - 1;
    const b = Number(m[4]) - 1;
    if (a >= 0 && b >= 0 && a < MAX_ROWS && b < MAX_ROWS) return [{ a: { r: a, ...(m[1] ? { ar: true } : {}) }, b: { r: b, ...(m[3] ? { ar: true } : {}) } }, j + m[0].length];
  }
  m = at(RX.cell, f, j);
  if (!m) return null;
  const a = cellPart(m);
  if (!a) return null;
  let end = j + m[0].length;
  const m2 = at(RX.to, f, end);
  const b = m2 ? cellPart(m2) : null;
  if (m2 && b) end += m2[0].length;
  return [b ? { a, b } : { a }, end];
}

/** A formula's words, numbers, references and signs, each with where it is in the text. Never throws: what it cannot read is "bad". */
function tokenize(f: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < f.length) {
    const ch = f[i];
    let m = at(RX.ws, f, i);
    if (m) {
      i += m[0].length;
      continue;
    }
    const s = i;
    if (ch === '"') {
      m = at(RX.str, f, i);
      if (!m) {
        out.push({ k: 'bad', s, e: f.length, v: f.slice(i) });
        break;
      }
      out.push({ k: 'str', s, e: (i += m[0].length), v: m[1].replace(/""/g, '"') });
      continue;
    }
    if (ch === '#') {
      m = at(RX.err, f, i);
      if (m) {
        out.push({ k: 'err', s, e: (i += m[0].length), v: errorOf(m[0])! });
        continue;
      }
    }
    // A reference, on another sheet perhaps; else a number, a function or a name.
    let j = i;
    let sheet: string | undefined;
    m = ch === "'" ? at(RX.sheetQ, f, i) : at(RX.sheet, f, i);
    if (m) {
      sheet = ch === "'" ? m[1].replace(/''/g, "'") : m[1];
      j = i + m[0].length;
    }
    const r = refAt(f, j);
    if (r) {
      out.push({ k: 'ref', s, e: (i = r[1]), ps: j, ref: sheet === undefined ? r[0] : { sheet, ...r[0] } });
      continue;
    }
    if (sheet !== undefined) {
      // Sheet2!#REF!: a reference that was deleted.
      m = at(RX.err, f, j);
      if (m) out.push({ k: 'err', s, e: (i = j + m[0].length), v: errorOf(m[0])! });
      else out.push({ k: 'bad', s, e: (i = j), v: f.slice(s, j) });
      continue;
    }
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      m = at(RX.num, f, i);
      if (m) {
        out.push({ k: 'num', s, e: (i += m[0].length), v: Number(m[0]) });
        continue;
      }
    }
    m = at(RX.ident, f, i);
    if (m) {
      i += m[0].length;
      let k = i;
      while (f[k] === ' ') k++;
      const word = m[0];
      if (f[k] === '(') out.push({ k: 'fn', s, e: i, v: word });
      else if (/^(true|false)$/i.test(word)) out.push({ k: 'bool', s, e: i, v: word.toLowerCase() === 'true' });
      else out.push({ k: 'name', s, e: i, v: word });
      continue;
    }
    m = at(RX.op, f, i);
    if (m) {
      out.push({ k: 'op', s, e: (i += m[0].length), v: m[0] });
      continue;
    }
    if ('(),;{}'.includes(ch)) {
      out.push({ k: 'p', s, e: ++i, v: ch });
      continue;
    }
    out.push({ k: 'bad', s, e: ++i, v: ch });
  }
  return out;
}

/** What a formula is, as a tree: values, references, functions and their arguments, signs between them. */
export type Node =
  | { k: 'n'; v: number }
  | { k: 's'; v: string }
  | { k: 'b'; v: boolean }
  | { k: 'e'; v: CellError }
  | { k: 'r'; sheet?: string; a: RefPart; b?: RefPart }
  | { k: 'f'; name: string; args: Node[] }
  | { k: 'neg'; x: Node }
  | { k: 'pct'; x: Node }
  /** Signs of one rank in a row, worked left to right: 1 + 2 - 3. */
  | { k: 'ch'; ops: string[]; xs: Node[] }
  | { k: 'arr'; rows: Scalar[][] }
  | { k: 'name'; v: string }
  /** An argument left out: IF(A1,,2). */
  | { k: 'nil' }
  /** A LAMBDA called where it is made, or a name's: LAMBDA(x, x*2)(5). */
  | { k: 'call'; fn: Node; args: Node[] }
  /** A value worked out already (a function worked on each value of an array, LAMBDA's arguments). */
  | { k: 'v'; v: Val };

class ParseError extends Error {}

/** A function's name as this knows it: upper case, without the prefixes files give some (_xlfn., COM.MICROSOFT.). */
const fnName = (v: string) => v.toUpperCase().replace(/^(?:_XLFN\.|_XLWS\.|_XLPM\.|COM\.MICROSOFT\.|ORG\.OPENOFFICE\.|ORG\.LIBREOFFICE\.)+/, '');

const LEVELS = [['=', '<>', '<', '>', '<=', '>='], ['&'], ['+', '-'], ['*', '/'], ['^']];
const MAX_DEPTH = 100;

/** A formula (without its "=") as a tree; throws ParseError when it cannot be read. */
export function parseFormula(text: string): Node {
  const toks = tokenize(text);
  let p = 0;
  let depth = 0;
  const fail = (why: string): never => {
    throw new ParseError(why);
  };
  const isOp = (t: Tok | undefined, ops: string[]) => t?.k === 'op' && ops.includes(t.v);
  const isP = (t: Tok | undefined, v: string) => t?.k === 'p' && t.v === v;
  const deeper = () => {
    if (++depth > MAX_DEPTH) fail('It nests too deeply.');
  };
  const level = (i: number): Node => {
    if (i === LEVELS.length) return unary();
    const first = level(i + 1);
    if (!isOp(toks[p], LEVELS[i])) return first;
    const ops: string[] = [];
    const xs: Node[] = [first];
    while (isOp(toks[p], LEVELS[i])) {
      ops.push((toks[p++] as { v: string }).v);
      xs.push(level(i + 1));
    }
    return { k: 'ch', ops, xs };
  };
  const unary = (): Node => {
    const t = toks[p];
    if (isOp(t, ['-', '+'])) {
      p++;
      deeper();
      const x = unary();
      depth--;
      return (t as { v: string }).v === '-' ? { k: 'neg', x } : x;
    }
    let x = primary();
    while (isOp(toks[p], ['%'])) {
      p++;
      x = { k: 'pct', x };
    }
    return x;
  };
  const arrayConst = (): Node => {
    const rows: Scalar[][] = [[]];
    for (;;) {
      let t = toks[p++];
      let neg = false;
      if (isOp(t, ['-', '+'])) {
        neg = (t as { v: string }).v === '-';
        t = toks[p++];
      }
      if (t?.k === 'num') rows[rows.length - 1].push(neg ? -t.v : t.v);
      else if (!neg && (t?.k === 'str' || t?.k === 'bool' || t?.k === 'err')) rows[rows.length - 1].push(t.v);
      else fail('An array holds only numbers, words, TRUE, FALSE and errors.');
      const sep = toks[p++];
      if (isP(sep, '}')) break;
      if (isP(sep, ';')) rows.push([]);
      else if (!isP(sep, ',')) fail('An array’s values are split by , and its rows by ;');
    }
    if (rows.some((r) => r.length !== rows[0].length)) fail('An array’s rows must be as long as each other.');
    return { k: 'arr', rows };
  };
  /** Arguments in brackets, after the "(" (a function's, or a LAMBDA's called where it is made). */
  const argList = (name: string): Node[] => {
    const args: Node[] = [];
    if (isP(toks[p], ')')) p++;
    else
      for (;;) {
        args.push(isP(toks[p], ',') || isP(toks[p], ')') ? { k: 'nil' } : level(0));
        const sep = toks[p++];
        if (isP(sep, ')')) break;
        if (!isP(sep, ',')) fail(`${name} is missing a , or a )`);
      }
    return args;
  };
  const primary = (): Node => {
    let x = primaryOnce();
    // A LAMBDA called where it is made: LAMBDA(x, x+1)(5), or a call's result called again.
    while (isP(toks[p], '(') && (x.k === 'f' || x.k === 'call')) {
      p++;
      deeper();
      x = { k: 'call', fn: x, args: argList('The call') };
      depth--;
    }
    return x;
  };
  const primaryOnce = (): Node => {
    const t = toks[p++];
    if (!t) return fail('It ends too soon.');
    switch (t.k) {
      case 'num':
        return { k: 'n', v: t.v };
      case 'str':
        return { k: 's', v: t.v };
      case 'bool':
        return { k: 'b', v: t.v };
      case 'err':
        return { k: 'e', v: t.v };
      case 'ref':
        return t.ref.sheet === undefined ? { k: 'r', a: t.ref.a, b: t.ref.b } : { k: 'r', sheet: t.ref.sheet, a: t.ref.a, b: t.ref.b };
      case 'name':
        return { k: 'name', v: t.v };
      case 'fn': {
        p++; // (
        deeper();
        const args = argList(t.v);
        depth--;
        return { k: 'f', name: fnName(t.v), args };
      }
      case 'p':
        if (t.v === '(') {
          deeper();
          const x = level(0);
          if (!isP(toks[p++], ')')) fail('A ( is not closed.');
          depth--;
          return x;
        }
        if (t.v === '{') return arrayConst();
        return fail(`Something is missing before “${t.v}”.`);
      default:
        return fail(`“${t.v}” cannot go there.`);
    }
  };
  if (!toks.length) fail('It is empty.');
  const node = level(0);
  if (p < toks.length) fail(`“${text.slice(toks[p].s, toks[p].s + 12)}” cannot go there.`);
  return node;
}

/** Whether a formula can be read; its problem in words when not. */
export function formulaProblem(f: string): string | null {
  try {
    parseFormula(f);
    return null;
  } catch (e) {
    return e instanceof ParseError ? e.message : String(e);
  }
}

const PARSED = new Map<string, Node | null>();
/** A formula's tree, remembered (null when it cannot be read). */
function parsedOf(f: string): Node | null {
  let n = PARSED.get(f);
  if (n !== undefined) return n;
  try {
    n = parseFormula(f);
  } catch (e) {
    if (!(e instanceof ParseError)) throw e;
    n = null;
  }
  if (PARSED.size > 50_000) PARSED.clear();
  PARSED.set(f, n);
  return n;
}

// ---- formulas: rewriting them -------------------------------------------------------------------------------------

/** A sheet's name as a reference writes it: in quotes unless it is a plain word. */
export function quoteSheet(name: string): string {
  const plain = /^[A-Za-z_¡-￿][A-Za-z0-9_.¡-￿]*$/.test(name) && !/^[A-Za-z]{1,3}\d+$/.test(name) && !/^R\d*C\d*$/i.test(name) && !/^(true|false)$/i.test(name);
  return plain ? name : `'${name.replace(/'/g, "''")}'`;
}

const partText = (p: RefPart, kind: 'cell' | 'col' | 'row') =>
  kind === 'cell' ? `${p.ac ? '$' : ''}${colName(p.c!)}${p.ar ? '$' : ''}${p.r! + 1}` : kind === 'col' ? `${p.ac ? '$' : ''}${colName(p.c!)}` : `${p.ar ? '$' : ''}${p.r! + 1}`;

/** A reference written out, without its sheet: "$A$1:B2", "A:C", "3:5". */
export function refText(ref: RefTok): string {
  const kind = ref.a.r === undefined ? 'col' : ref.a.c === undefined ? 'row' : 'cell';
  return partText(ref.a, kind) + (ref.b ? `:${partText(ref.b, kind)}` : '');
}

/** The formula with some of its pieces written anew: `f` gives a piece's new text, or undefined to leave it. */
function rewrite(formula: string, f: (t: Tok) => string | undefined): string {
  let out = '';
  let last = 0;
  for (const t of tokenize(formula)) {
    const next = f(t);
    if (next === undefined) continue;
    out += formula.slice(last, t.s) + next;
    last = t.e;
  }
  return last ? out + formula.slice(last) : formula;
}

/** The references of a formula with where each is in its text (to show them while it is typed). Never throws. */
export function formulaRefs(formula: string): { s: number; e: number; ref: RefTok }[] {
  return tokenize(formula).flatMap((t) => (t.k === 'ref' ? [{ s: t.s, e: t.e, ref: t.ref }] : []));
}

/** Whether a reference may be put at `pos` in a formula being typed: after "=", "(", ",", or a sign. */
export function refGoesAt(formula: string, pos: number): boolean {
  const before = formula.slice(0, pos).replace(/\s+$/, '');
  return /[=(,;+\-*/^&<>:%]$/.test(before) || before === '';
}

/**
 * The formula copied `dr` rows down and `dc` columns across: its relative references move, its fixed ($) ones
 * stay, and one moved off the sheet becomes #REF!.
 */
export function shiftFormula(f: string, dr: number, dc: number): string {
  if (!dr && !dc) return f;
  return rewrite(f, (t) => {
    if (t.k !== 'ref') return undefined;
    const move = (p: RefPart): RefPart | null => {
      const q = { ...p };
      if (q.r !== undefined && !q.ar) q.r += dr;
      if (q.c !== undefined && !q.ac) q.c += dc;
      return (q.r ?? 0) < 0 || (q.c ?? 0) < 0 || (q.r ?? 0) >= MAX_ROWS || (q.c ?? 0) >= MAX_COLS ? null : q;
    };
    const a = move(t.ref.a);
    const b = t.ref.b ? move(t.ref.b) : undefined;
    // The sheet's name stays as it was written ("'My sheet'!").
    const prefix = f.slice(t.s, t.ps);
    if (!a || b === null) return `${prefix}#REF!`;
    return prefix + refText(b ? { a, b } : { a });
  });
}

/** The prefix a reference token was written with ("Sheet2!", "'My sheet'!"), from the formula. */
const prefixOf = (f: string, t: Tok & { k: 'ref' }) => f.slice(t.s, t.ps);

/** Every formula of the workbook rewritten by `f`, given the sheet each formula is on; a new workbook when any changed. */
function mapFormulas(b: Workbook, f: (formula: string, on: Sheet) => string): Workbook {
  let changed = false;
  const sheets = b.sheets.map((sh) => {
    let cells: Record<string, Cell> | null = null;
    for (const k in sh.cells) {
      const c = sh.cells[k];
      if (c.f === undefined) continue;
      const next = f(c.f, sh);
      if (next === c.f) continue;
      cells ??= { ...sh.cells };
      cells[k] = { ...c, f: next };
    }
    if (!cells) return sh;
    changed = true;
    return { ...sh, cells };
  });
  return changed ? { ...b, sheets } : b;
}

/** A sheet no reference names: what a workbook name's own references are read on (theirs name their sheets). */
const NO_SHEET: Sheet = { id: '', name: '\u0000', cells: {} };

/** The workbook's names with what they stand for rewritten by `f`, given the sheet each is for (a new workbook when any changed). */
function mapNames(b: Workbook, f: (formula: string, on: Sheet) => string): Workbook {
  if (!b.names?.length) return b;
  let changed = false;
  const names = b.names.map((n) => {
    const ref = f(n.ref, (n.sheet && b.sheets.find((s) => s.id === n.sheet)) || NO_SHEET);
    if (ref === n.ref) return n;
    changed = true;
    return { ...n, ref };
  });
  return changed ? { ...b, names } : b;
}

/** A named range renamed: the formulas (and other names) that use it use the new name. */
export function renameName(book: Workbook, from: string, to: string): Workbook {
  const old = from.toLowerCase();
  const swap = (f: string) => rewrite(f, (t) => ((t.k === 'name' || t.k === 'fn') && t.v.toLowerCase() === old ? to : undefined));
  const moved = mapNames(mapFormulas(book, swap), swap);
  return { ...moved, names: (moved.names ?? []).map((n) => (n.name.toLowerCase() === old ? { ...n, name: to } : n)) };
}

/** Whether a reference written on sheet `on` points at the sheet named `name`. */
const pointsAt = (ref: RefTok, on: Sheet, name: string) => (ref.sheet ?? on.name).toLowerCase() === name.toLowerCase();

/** The references to `name` in a formula on sheet `on`, each moved by `move` (null: it is gone, #REF!). */
function moveRefs(formula: string, on: Sheet, name: string, move: (ref: RefTok) => RefTok | null): string {
  return rewrite(formula, (t) => {
    if (t.k !== 'ref' || !pointsAt(t.ref, on, name)) return undefined;
    const next = move(t.ref);
    if (!next) return t.ps > t.s ? `${prefixOf(formula, t)}#REF!` : '#REF!';
    const text = refText(next);
    return text === refText(t.ref) ? undefined : prefixOf(formula, t) + text;
  });
}

/** A sheet's cells moved: each name through `f` (null drops the cell). */
function moveCells(sh: Sheet, f: (r: number, c: number) => [number, number] | null): Record<string, Cell> {
  const list: [number, Cell][] = [];
  for (const k in sh.cells) {
    const n = keyOf(k);
    if (n < 0) continue;
    const to = f(unpackR(n), unpackC(n));
    if (to && to[0] < SHEET_LIMITS.rows && to[1] < SHEET_LIMITS.cols) list.push([pack(to[0], to[1]), sh.cells[k]]);
  }
  list.sort((x, y) => x[0] - y[0]);
  const out: Record<string, Cell> = {};
  for (const [n, c] of list) out[refName(unpackR(n), unpackC(n))] = c;
  return out;
}

/** Sizes kept by index, moved by `f` (null drops one). */
function moveSizes<T>(m: Record<number, T> | undefined, f: (i: number) => number | null, limit: number): Record<number, T> | undefined {
  if (!m) return undefined;
  const out: Record<number, T> = {};
  for (const [k, v] of Object.entries(m)) {
    const to = f(Number(k));
    if (to !== null && to < limit) out[to] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * A sheet's other references (its merges, filter, rules' ranges and formulas, lists' sources, charts' data), each
 * rewritten by `f` as a formula's text would be; what no longer points anywhere goes. `col` moves a filter's column
 * (null: it went); `corner` moves a chart's corners (on the sheet whose rows or columns went in or out).
 */
function mapSheetRefs(sh: Sheet, f: (text: string) => string, col?: (c: number) => number | null, corner?: (k: ChartCorner) => ChartCorner): Sheet {
  if (!sh.merges && !sh.filter && !sh.conditional && !sh.validation && !sh.charts && !sh.board && !sh.comments && !sh.protect && !sh.groups && !sh.print?.area && !sh.pivot) return sh;
  const out: Sheet = { ...sh };
  // A pivot table's table follows its cells (its sheet renamed, rows put in); one whose cells all went keeps its settings.
  if (sh.pivot) {
    const source = f(sh.pivot.source);
    if (!source.includes('#REF!') && cleanSource(source)) out.pivot = { ...sh.pivot, source: cleanSource(source)! };
  }
  // Protected ranges, groups and the print area follow their cells; one whose cells all went goes too.
  if (sh.protect) {
    const list = sh.protect.flatMap((p) => {
      if (!p.range) {
        const except = p.except ? cleanRanges(f(p.except)) : '';
        const next: SheetProtect = { ...p };
        if (except) next.except = except;
        else delete next.except;
        return [next];
      }
      const range = cleanRanges(f(p.range));
      return range ? [{ ...p, range }] : [];
    });
    if (list.length) out.protect = list;
    else delete out.protect;
  }
  if (sh.groups) {
    const list = sh.groups.flatMap((g) => {
      const t = f(g.range);
      return t.includes('#REF!') ? [] : cleanGroups([{ range: t, hidden: g.hidden }]);
    });
    if (list.length) out.groups = list;
    else delete out.groups;
  }
  if (sh.print?.area) {
    const area = cleanRanges(f(sh.print.area));
    const print: PrintSetup = { ...sh.print };
    if (area) print.area = area;
    else delete print.area;
    if (Object.keys(print).length) out.print = print;
    else delete out.print;
  }
  const formula = (t: string | undefined) => (t?.startsWith('=') ? `=${f(t.slice(1))}` : t);
  const broken = (t: string | undefined) => !!t && t.includes('#REF!');
  const cond = (c: Cond | undefined): Cond | undefined | null => {
    if (!c) return c;
    const next: Cond = { ...c };
    if (c.a !== undefined) next.a = formula(c.a);
    if (c.b !== undefined) next.b = formula(c.b);
    return broken(next.a) || broken(next.b) ? null : next;
  };
  if (sh.merges) {
    const merges = cleanMerges(sh.merges.map(f));
    if (merges.length) out.merges = merges;
    else delete out.merges;
  }
  if (sh.filter) {
    const range = f(sh.filter.range);
    const rg = broken(range) ? null : parseRange(range);
    if (!rg) delete out.filter;
    else {
      const filter: SheetFilter = { range: rangeName(rg) };
      const cols: Record<string, FilterCol> = {};
      for (const [k, fc] of Object.entries(sh.filter.cols ?? {})) {
        const c0 = colIndex(k);
        const c = col ? col(c0) : c0;
        if (c !== null && c >= rg.c1 && c <= rg.c2) cols[colName(c)] = fc;
      }
      if (Object.keys(cols).length) filter.cols = cols;
      out.filter = filter;
    }
  }
  if (sh.conditional) {
    const list = sh.conditional.flatMap((r) => {
      const range = cleanRanges(f(r.range));
      const when = cond(r.when);
      return range && when !== null ? [{ ...r, range, ...(when ? { when } : {}) }] : [];
    });
    if (list.length) out.conditional = list;
    else delete out.conditional;
  }
  if (sh.validation) {
    const list = sh.validation.flatMap((v) => {
      const range = cleanRanges(f(v.range));
      const when = cond(v.when);
      const source = v.source === undefined ? undefined : f(v.source);
      if (!range || when === null || broken(source)) return [];
      const next: Validation = { ...v, range };
      if (when) next.when = when;
      if (source !== undefined) next.source = source;
      return [next];
    });
    if (list.length) out.validation = list;
    else delete out.validation;
  }
  if (sh.charts) {
    const list = sh.charts.flatMap((c) => {
      // A range in parts keeps the parts still there; a chart none of whose cells are left goes.
      const parts = splitParts(f(c.range)).filter((p) => !broken(p));
      if (!parts.length) return [];
      const next: SheetChart = { ...c, range: parts.join(',') };
      if (corner) {
        next.from = corner(c.from);
        next.to = corner(c.to);
        // Its rows (or columns) all taken out: it keeps its size in cells from where it now is.
        const [a, b, a0, b0] = [next.from, next.to, c.from, c.to].map((k) => parseRef(k.cell)!);
        if (b.r < a.r || (b.r === a.r && (next.to.dy ?? 0) <= (next.from.dy ?? 0))) next.to = { ...next.to, cell: refName(Math.min(SHEET_LIMITS.rows - 1, a.r + Math.max(1, b0.r - a0.r)), b.c) };
        const b2 = parseRef(next.to.cell)!;
        if (b2.c < a.c || (b2.c === a.c && (next.to.dx ?? 0) <= (next.from.dx ?? 0))) next.to = { ...next.to, cell: refName(b2.r, Math.min(SHEET_LIMITS.cols - 1, a.c + Math.max(1, b0.c - a0.c))) };
      }
      return [next];
    });
    if (list.length) out.charts = list;
    else delete out.charts;
  }
  if (sh.comments) {
    // A comment follows its cell; one whose cell was taken out goes with it.
    const list = sh.comments.flatMap((c) => {
      const cell = f(c.cell);
      return broken(cell) || !parseRef(cell) ? [] : [{ ...c, cell }];
    });
    if (list.length) out.comments = list;
    else delete out.comments;
  }
  if (sh.board) {
    // The board's table and columns follow; with its header or its column to group by gone, it goes.
    const at = f(sh.board.at);
    const by = col ? col(colIndex(sh.board.by)) : colIndex(sh.board.by);
    if (broken(at) || !parseRef(at) || by === null) delete out.board;
    else {
      const next: SheetBoard = { ...sh.board, at, by: colName(by) };
      if (sh.board.fields && col)
        next.fields = sh.board.fields.flatMap((k) => {
          const c = col(colIndex(k));
          return c === null ? [] : [colName(c)];
        });
      out.board = next;
    }
  }
  return out;
}

/** A chart's corner with its row (or column) moved by `f`: null puts it at the start of the row (column) `at` instead, the first after those taken out. */
const moveCorner = (k: ChartCorner, row: boolean, f: (i: number) => number | null, at: number): ChartCorner => {
  const p = parseRef(k.cell)!;
  const i = f(row ? p.r : p.c);
  const out: ChartCorner = { ...k, cell: row ? refName(i ?? at, p.c) : refName(p.r, i ?? at) };
  if (i === null) delete out[row ? 'dy' : 'dx'];
  return out;
};

const withSizes = (sh: Sheet, cols: Sheet['cols'], rows: Sheet['rows']): Sheet => {
  const out: Sheet = { ...sh };
  if (cols) out.cols = cols;
  else delete out.cols;
  if (rows) out.rows = rows;
  else delete out.rows;
  return out;
};

/**
 * `count` rows (or columns) put in before `at` on a sheet: its cells below (or right) move along, and every
 * formula of the workbook that points there follows them; a range that spans `at` grows.
 */
export function adjustForInsert(book: Workbook, sheetId: string, axis: 'row' | 'col', at: number, count: number): Workbook {
  const sh = book.sheets.find((s) => s.id === sheetId);
  if (!sh || count <= 0) return book;
  const row = axis === 'row';
  const bump = (p: RefPart): RefPart => {
    const q = { ...p };
    if (row && q.r !== undefined && q.r >= at) q.r = Math.min(MAX_ROWS - 1, q.r + count);
    if (!row && q.c !== undefined && q.c >= at) q.c = Math.min(MAX_COLS - 1, q.c + count);
    return q;
  };
  const move = (ref: RefTok): RefTok => ({ ...ref, a: bump(ref.a), ...(ref.b ? { b: bump(ref.b) } : {}) });
  const moved = mapNames(mapFormulas(book, (f, on) => moveRefs(f, on, sh.name, move)), (f, on) => moveRefs(f, on, sh.name, move));
  return {
    ...moved,
    sheets: moved.sheets.map((s0) => {
      const mine = s0.id === sheetId;
      // A chart's corners on rows (columns) from `at` on move along: one past them stretches it.
      const corner = (k: ChartCorner) => moveCorner(k, row, (i) => (i >= at ? Math.min(i + count, (row ? SHEET_LIMITS.rows : SHEET_LIMITS.cols) - 1) : i), at);
      const s = mapSheetRefs(s0, (t) => moveRefs(t, s0, sh.name, move), mine && !row ? (c) => (c >= at ? c + count : c) : undefined, mine ? corner : undefined);
      if (s.id !== sheetId) return s;
      const cells = moveCells(s, (r, c) => (row ? [r >= at ? r + count : r, c] : [r, c >= at ? c + count : c]));
      const shift = (i: number) => (i >= at ? i + count : i);
      const next = withSizes({ ...s, cells }, row ? s.cols : moveSizes(s.cols, shift, SHEET_LIMITS.cols), row ? moveSizes(s.rows, shift, SHEET_LIMITS.rows) : s.rows);
      if (s.freeze) {
        const fz = { ...s.freeze };
        if (row && fz.rows && at < fz.rows) fz.rows = Math.min(SHEET_LIMITS.rows, fz.rows + count);
        if (!row && fz.cols && at < fz.cols) fz.cols = Math.min(SHEET_LIMITS.cols, fz.cols + count);
        next.freeze = fz;
      }
      return next;
    }),
  };
}

/**
 * `count` rows (or columns) from `at` taken out of a sheet: their cells go, those below (or right) move up (or
 * left), and every formula that pointed there follows; a reference to a cell that went becomes #REF!, a range shrinks.
 */
export function adjustForDelete(book: Workbook, sheetId: string, axis: 'row' | 'col', at: number, count: number): Workbook {
  const sh = book.sheets.find((s) => s.id === sheetId);
  if (!sh || count <= 0) return book;
  const row = axis === 'row';
  const end = at + count;
  const get = (p: RefPart) => (row ? p.r : p.c);
  const set = (p: RefPart, v: number): RefPart => (row ? { ...p, r: v } : { ...p, c: v });
  const shrink = (ref: RefTok): RefTok | null => {
    const s = get(ref.a);
    if (s === undefined) return ref;
    if (!ref.b) {
      if (s >= at && s < end) return null;
      return s >= end ? { ...ref, a: set(ref.a, s - count) } : ref;
    }
    const e = get(ref.b)!;
    const lo = Math.min(s, e);
    const hi = Math.max(s, e);
    const lo2 = lo < at ? lo : lo >= end ? lo - count : at;
    const hi2 = hi < at ? hi : hi >= end ? hi - count : at - 1;
    if (hi2 < lo2) return null;
    return { ...ref, a: set(ref.a, lo2), b: set(ref.b, hi2) };
  };
  const moved = mapNames(mapFormulas(book, (f, on) => moveRefs(f, on, sh.name, shrink)), (f, on) => moveRefs(f, on, sh.name, shrink));
  return {
    ...moved,
    sheets: moved.sheets.map((s0) => {
      const mine = s0.id === sheetId;
      // A chart's corner on a row (column) taken out goes to the start of the first one after them.
      const corner = (k: ChartCorner) => moveCorner(k, row, (i) => (i >= at && i < end ? null : i >= end ? i - count : i), at);
      const s = mapSheetRefs(s0, (t) => moveRefs(t, s0, sh.name, shrink), mine && !row ? (c) => (c >= at && c < end ? null : c >= end ? c - count : c) : undefined, mine ? corner : undefined);
      if (s.id !== sheetId) return s;
      const cells = moveCells(s, (r, c) => {
        const i = row ? r : c;
        if (i >= at && i < end) return null;
        const j = i >= end ? i - count : i;
        return row ? [j, c] : [r, j];
      });
      const shift = (i: number) => (i >= at && i < end ? null : i >= end ? i - count : i);
      const next = withSizes({ ...s, cells }, row ? s.cols : moveSizes(s.cols, shift, SHEET_LIMITS.cols), row ? moveSizes(s.rows, shift, SHEET_LIMITS.rows) : s.rows);
      if (s.freeze) {
        const fz = { ...s.freeze };
        const cut = (n: number | undefined) => (n === undefined ? n : Math.max(0, n - Math.max(0, Math.min(end, n) - at)));
        if (row) fz.rows = cut(fz.rows);
        else fz.cols = cut(fz.cols);
        if (!fz.rows) delete fz.rows;
        if (!fz.cols) delete fz.cols;
        if (Object.keys(fz).length) next.freeze = fz;
        else delete next.freeze;
      }
      return next;
    }),
  };
}

// ---- cells and lines moved ---------------------------------------------------------------------------------------

/** A reference's two corners when it is a cell or a range of cells (whole columns and rows have no cell corners). */
const cellCorners = (ref: RefTok): [RefPart, RefPart] | null => {
  if (ref.a.r === undefined || ref.a.c === undefined) return null;
  if (ref.b && (ref.b.r === undefined || ref.b.c === undefined)) return null;
  return [ref.a, ref.b ?? ref.a];
};

/** Cells in the order of their positions (rows first), as sheets keep them. */
function sortedCells(cells: Record<string, Cell>): Record<string, Cell> {
  const list = Object.keys(cells)
    .map((k) => [keyOf(k), k] as const)
    .filter(([n]) => n >= 0)
    .sort((a, b) => a[0] - b[0]);
  const out: Record<string, Cell> = {};
  for (const [, k] of list) out[k] = cells[k];
  return out;
}

/**
 * Cells moved, as Excel and Google Sheets do for Cut and Paste or a drag: the block `x` of a sheet goes with its
 * looks, notes and comments to where its top left corner is now `to` (on the same sheet or on another), what was
 * there is replaced, and every formula, name, chart, rule and list that pointed at the cells (a cell, or a range all
 * of whose cells moved) points at them where they are now. The formulas in the cells that moved keep pointing where
 * they did, apart from those that pointed into the block itself. Ranges only partly in the block stay as they were.
 * Rules, merges and filters follow when they lie wholly in the block, on the same sheet.
 */
export function adjustForMove(book: Workbook, from: { sheet: string; x: Rect }, to: { sheet: string; r: number; c: number }): Workbook {
  const src = book.sheets.find((s) => s.id === from.sheet);
  const dst = book.sheets.find((s) => s.id === to.sheet);
  if (!src || !dst) return book;
  const x = from.x;
  const dr = to.r - x.r1;
  const dc = to.c - x.c1;
  const same = src.id === dst.id;
  if (same && !dr && !dc) return book;
  const dest: Rect = { r1: x.r1 + dr, c1: x.c1 + dc, r2: x.r2 + dr, c2: x.c2 + dc };
  if (dest.r2 >= SHEET_LIMITS.rows || dest.c2 >= SHEET_LIMITS.cols || dest.r1 < 0 || dest.c1 < 0) return book;
  const inX = (p: RefPart) => p.r! >= x.r1 && p.r! <= x.r2 && p.c! >= x.c1 && p.c! <= x.c2;
  const shift = (p: RefPart): RefPart => ({ ...p, r: p.r! + dr, c: p.c! + dc });
  /**
   * The formula (written on the sheet `on`; `moving` when it is in a cell that goes) with its references to the block
   * following it. With `named`, only references that carry a sheet's name change (the rules of other sheets).
   */
  const retarget = (formula: string, on: Sheet, moving: boolean, named = false): string =>
    rewrite(formula, (t) => {
      if (t.k !== 'ref') return undefined;
      const written = t.ref.sheet !== undefined;
      if (named && !written) return undefined;
      const corners = (t.ref.sheet ?? on.name).toLowerCase() === src.name.toLowerCase() ? cellCorners(t.ref) : null;
      if (!corners || !inX(corners[0]) || !inX(corners[1])) {
        // A formula carried to another sheet keeps pointing at the cells it did: its references get their sheet's name.
        return moving && !same && !written ? `${quoteSheet(on.name)}!${formula.slice(t.ps, t.e)}` : undefined;
      }
      const next = { a: shift(t.ref.a), ...(t.ref.b ? { b: shift(t.ref.b) } : {}) };
      const lives = moving ? dst : on;
      return (same ? prefixOf(formula, t) : lives.id === dst.id ? '' : `${quoteSheet(dst.name)}!`) + refText(next);
    });
  // Formulas everywhere (and names).
  const moved: Workbook = { ...book, sheets: book.sheets.map((s) => ({ ...s, cells: { ...s.cells } })) };
  for (const s of moved.sheets) {
    for (const k in s.cells) {
      const c = s.cells[k];
      if (c.f === undefined) continue;
      const n = keyOf(k);
      const moving = s.id === src.id && n >= 0 && inX({ r: unpackR(n), c: unpackC(n) });
      const next = retarget(c.f, s, moving);
      if (next !== c.f) s.cells[k] = { ...c, f: next };
    }
  }
  if (moved.names) moved.names = moved.names.map((n) => {
    const ref = retarget(n.ref, (n.sheet && book.sheets.find((s) => s.id === n.sheet)) || NO_SHEET, false);
    return ref === n.ref ? n : { ...n, ref };
  });
  // Rules, charts and the rest of every sheet (their comments are moved below).
  moved.sheets = moved.sheets.map((s0) => {
    const s = mapSheetRefs({ ...s0, comments: undefined }, (t) => retarget(t, s0, false, !same));
    if (s0.comments) s.comments = s0.comments;
    else delete s.comments;
    return s;
  });
  // The cells (and their comments) leave the block, and come to where it goes, over what was there.
  const out = moved.sheets.find((s) => s.id === src.id)!;
  const into = moved.sheets.find((s) => s.id === dst.id)!;
  const carried: [string, Cell][] = [];
  for (const k in out.cells) {
    const n = keyOf(k);
    if (n < 0 || !inX({ r: unpackR(n), c: unpackC(n) })) continue;
    carried.push([refName(unpackR(n) + dr, unpackC(n) + dc), out.cells[k]]);
    delete out.cells[k];
  }
  for (const k in into.cells) {
    const n = keyOf(k);
    if (n < 0) continue;
    const [r, c] = [unpackR(n), unpackC(n)];
    if (r >= dest.r1 && r <= dest.r2 && c >= dest.c1 && c <= dest.c2) delete into.cells[k];
  }
  for (const [k, c] of carried) into.cells[k] = c;
  into.cells = sortedCells(into.cells);
  if (!same) out.cells = sortedCells(out.cells);
  const within = (cm: SheetComment, r: Rect) => {
    const p = parseRef(cm.cell);
    return !!p && p.r >= r.r1 && p.r <= r.r2 && p.c >= r.c1 && p.c <= r.c2;
  };
  const going = (src.comments ?? []).filter((cm) => within(cm, x)).map((cm) => {
    const p = parseRef(cm.cell)!;
    return { ...cm, cell: refName(p.r + dr, p.c + dc) };
  });
  if (going.length || dst.comments?.some((cm) => within(cm, dest))) {
    const keep = (sh: Sheet, gone: Rect[]) => (sh.comments ?? []).filter((cm) => !gone.some((g) => within(cm, g)));
    const put = (sh: Sheet, list: SheetComment[]) => {
      if (list.length) sh.comments = list.sort((a, b) => keyOf(a.cell) - keyOf(b.cell));
      else delete sh.comments;
    };
    if (same) put(out, [...keep(out, [x, dest]), ...going]);
    else {
      put(out, keep(out, [x]));
      put(into, [...keep(into, [dest]), ...going]);
    }
  }
  return moved;
}

/**
 * Whole rows (or columns) moved: `count` of them from `from` go to before the row (column) `to`, as dragging their
 * numbers (letters) does. Their cells, heights (widths) and hidden ones go along, and every formula that pointed at
 * a cell in them points where it went; ranges follow by their ends, so a range the rows moved out of shrinks.
 */
export function adjustForMoveLines(book: Workbook, sheetId: string, axis: 'row' | 'col', from: number, count: number, to: number): Workbook {
  const sh = book.sheets.find((s) => s.id === sheetId);
  if (!sh || count <= 0 || (to >= from && to <= from + count)) return book;
  const row = axis === 'row';
  const limit = row ? SHEET_LIMITS.rows : SHEET_LIMITS.cols;
  const end = from + count;
  if (end > limit || to > limit) return book;
  /** Where the row (column) `i` goes. */
  const perm = (i: number): number => {
    if (i >= from && i < end) return to > end ? i - from + (to - count) : i - from + to;
    if (to > end && i >= end && i < to) return i - count;
    if (to < from && i >= to && i < from) return i + count;
    return i;
  };
  const get = (p: RefPart) => (row ? p.r : p.c);
  const set = (p: RefPart, v: number): RefPart => (row ? { ...p, r: v } : { ...p, c: v });
  const move = (ref: RefTok): RefTok => {
    const s = get(ref.a);
    if (s === undefined) return ref;
    if (!ref.b) return { ...ref, a: set(ref.a, perm(s)) };
    const [lo, hi] = [Math.min(s, get(ref.b)!), Math.max(s, get(ref.b)!)];
    const inside = (i: number) => i >= from && i < end;
    let [p, q] = [perm(lo), perm(hi)];
    if (!(inside(lo) && inside(hi))) {
      // A range follows the rows that are not moved: it keeps the moved ones only when they land between them.
      const first = inside(lo) ? end : lo;
      const last = inside(hi) ? from - 1 : hi;
      [p, q] = [perm(first), perm(last)];
      const [bp, bq] = [perm(from), perm(end - 1)];
      if (bp >= p && bq <= q) [p, q] = [Math.min(p, bp), Math.max(q, bq)];
    }
    return { ...ref, a: set(ref.a, p), b: set(ref.b, q) };
  };
  const moved = mapNames(mapFormulas(book, (f, on) => moveRefs(f, on, sh.name, move)), (f, on) => moveRefs(f, on, sh.name, move));
  return {
    ...moved,
    sheets: moved.sheets.map((s0) => {
      const mine = s0.id === sheetId;
      const s = mapSheetRefs(s0, (t) => moveRefs(t, s0, sh.name, move), mine && !row ? perm : undefined, mine ? (k) => moveCorner(k, row, perm, 0) : undefined);
      if (!mine) return s;
      const cells = moveCells(s, (r, c) => (row ? [perm(r), c] : [r, perm(c)]));
      return withSizes({ ...s, cells }, row ? s.cols : moveSizes(s.cols, perm, SHEET_LIMITS.cols), row ? moveSizes(s.rows, perm, SHEET_LIMITS.rows) : s.rows);
    }),
  };
}

/** A sheet renamed, and every formula that names it changed to the new name. */
export function renameSheet(book: Workbook, sheetId: string, name: string): Workbook {
  const sh = book.sheets.find((s) => s.id === sheetId);
  if (!sh) return book;
  const clean = uniqueSheetName(cleanSheetName(name), book.sheets.filter((s) => s.id !== sheetId).map((s) => s.name));
  if (clean === sh.name) return book;
  const old = sh.name.toLowerCase();
  const renamed = (f: string) => rewrite(f, (t) => (t.k === 'ref' && t.ref.sheet !== undefined && t.ref.sheet.toLowerCase() === old ? `${quoteSheet(clean)}!${f.slice(t.ps, t.e)}` : undefined));
  const moved = mapNames(mapFormulas(book, renamed), renamed);
  return { ...moved, sheets: moved.sheets.map((s0) => mapSheetRefs(s0, renamed)).map((s) => (s.id === sheetId ? { ...s, name: clean } : s)) };
}

/** A sheet taken out of the workbook: the references other sheets had to it become #REF!. */
export function removeSheet(book: Workbook, sheetId: string): Workbook {
  const sh = book.sheets.find((s) => s.id === sheetId);
  if (!sh || book.sheets.length < 2) return book;
  const old = sh.name.toLowerCase();
  const rest = { ...book, sheets: book.sheets.filter((s) => s.id !== sheetId) };
  const gone = (f: string) => rewrite(f, (t) => (t.k === 'ref' && t.ref.sheet !== undefined && t.ref.sheet.toLowerCase() === old ? '#REF!' : undefined));
  // Names for that sheet alone go with it; the others' references to it become #REF!.
  const kept = rest.names?.some((n) => n.sheet === sheetId) ? { ...rest, names: rest.names.filter((n) => n.sheet !== sheetId) } : rest;
  if (kept.names && !kept.names.length) delete kept.names;
  const moved = mapNames(mapFormulas(kept, gone), gone);
  return { ...moved, sheets: moved.sheets.map((s) => mapSheetRefs(s, gone)) };
}

/** The formula for a file: newer functions named as Excel's files name them (_xlfn.XLOOKUP), references to sheets that are not there as #REF!. */
export function fileFormula(f: string, sheetNames: Set<string>): string {
  return rewrite(f, (t) => {
    if (t.k === 'fn') {
      const n = fnName(t.v);
      // FILTER and SORT came with a prefix of their own.
      if (n === 'FILTER' || n === 'SORT') return `_xlfn._xlws.${n}`;
      return XLFN.has(n) ? `_xlfn.${n}` : n === t.v ? undefined : n;
    }
    if (t.k === 'ref' && t.ref.sheet !== undefined && !sheetNames.has(t.ref.sheet.toLowerCase())) return '#REF!';
    return undefined;
  });
}

/**
 * A cell's formula as an Excel file writes it (fileFormula's, and more): Google Sheets' functions as Excel's own
 * (REGEXMATCH as REGEXTEST, JOIN as TEXTJOIN, SPLIT as TEXTSPLIT, ARRAYFORMULA left off, IMAGE's mode as its sizing),
 * LET's and LAMBDA's names as _xlpm.x; null when Excel has nothing that does what it does (AI, SPARKLINE): the cell is
 * then written as the value it shows. `names`: the workbook's named ranges (lower case), which stay as they are.
 */
export function excelFormula(f: string, sheetNames: Set<string>, names: Set<string> = new Set()): string | null {
  const toks = tokenize(f);
  if (toks.some((t) => t.k === 'bad')) return fileFormula(f, sheetNames);
  // Each call's brackets and the commas between its own arguments.
  const calls = new Map<number, { close: number; commas: number[] }>();
  const stack: { fn: number; commas: number[] }[] = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.k !== 'p') continue;
    if (t.v === '(' || t.v === '{') stack.push({ fn: t.v === '(' && i > 0 && toks[i - 1].k === 'fn' ? i - 1 : -1, commas: [] });
    else if (t.v === ')' || t.v === '}') {
      const top = stack.pop();
      if (top && top.fn >= 0) calls.set(top.fn, { close: i, commas: top.commas });
    } else if (t.v === ',' && stack.length) stack[stack.length - 1].commas.push(i);
  }
  const lambdas = toks.some((t) => t.k === 'fn' && /^(_xlfn\.)?(LET|LAMBDA)$/i.test(t.v));
  const edits: { at: number; end: number; text: string }[] = [];
  const put = (at: number, end: number, text: string) => edits.push({ at, end, text });
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.k === 'name' && lambdas && !names.has(t.v.toLowerCase()) && !/^_xlpm\./i.test(t.v)) put(t.s, t.e, `_xlpm.${t.v}`);
    if (t.k === 'ref' && t.ref.sheet !== undefined && !sheetNames.has(t.ref.sheet.toLowerCase())) put(t.s, t.e, '#REF!');
    if (t.k !== 'fn') continue;
    const n = fnName(t.v);
    const call = calls.get(i);
    const args = call ? (toks[i + 2]?.k === 'p' && (toks[i + 2] as { v: string }).v === ')' ? 0 : call.commas.length + 1) : 0;
    const argToks = (k: number): Tok[] => {
      if (!call) return [];
      const from = k === 0 ? i + 2 : call.commas[k - 1] + 1;
      const to = k < call.commas.length ? call.commas[k] : call.close;
      return toks.slice(from, to);
    };
    if (n === 'AI' || n === 'SPARKLINE' || GOOGLE_ONLY.has(n)) return null;
    if (n === 'ARRAYFORMULA') put(t.s, t.e, '');
    else if (n === 'REGEXMATCH') put(t.s, t.e, '_xlfn.REGEXTEST');
    else if (n === 'JOIN') {
      if (!call || args < 2) return null;
      put(t.s, t.e, '_xlfn.TEXTJOIN');
      put(toks[call.commas[0]].e, toks[call.commas[0]].e, 'FALSE,');
    } else if (n === 'SPLIT') {
      if (!call || args !== 2) return null;
      put(t.s, t.e, '_xlfn.TEXTSPLIT');
      // Each of the delimiter's characters splits, as Google Sheets does by default: an array of them.
      const d = argToks(1);
      if (d.length === 1 && d[0].k === 'str' && d[0].v.length > 1) put(d[0].s, d[0].e, `{${[...d[0].v].map((ch) => `"${ch.replace(/"/g, '""')}"`).join(',')}}`);
      put(toks[call.close].s, toks[call.close].s, ',,TRUE');
    } else if (n === 'REGEXEXTRACT') {
      put(t.s, t.e, '_xlfn.REGEXEXTRACT');
      // Left out, the return mode is the groups when the pattern has some (as Google Sheets), which Excel says with 2.
      const p = argToks(1);
      if (call && args === 2 && p.length === 1 && p[0].k === 'str' && /(^|[^\\])\((?!\?)/.test(p[0].v)) put(toks[call.close].s, toks[call.close].s, ',2');
    } else if (n === 'IMAGE') {
      put(t.s, t.e, '_xlfn.IMAGE');
      // Google Sheets' IMAGE(url, mode, height, width): Excel's IMAGE(url, alt text, sizing, height, width).
      const m = argToks(1);
      if (m.length === 1 && m[0].k === 'num') put(m[0].s, m[0].e, `"",${Math.max(0, Math.min(3, Math.trunc(m[0].v) - 1))}`);
    } else if (n === 'FILTER' || n === 'SORT') put(t.s, t.e, `_xlfn._xlws.${n}`);
    else if (XLFN.has(n)) put(t.s, t.e, `_xlfn.${n}`);
    else if (lambdas && !FNS[n] && !names.has(n.toLowerCase())) put(t.s, t.e, `_xlpm.${t.v}`);
    else if (n !== t.v) put(t.s, t.e, n);
  }
  edits.sort((x, y) => x.at - y.at || x.end - y.end);
  let out = '';
  let last = 0;
  for (const e of edits) {
    if (e.at < last) continue;
    out += f.slice(last, e.at) + e.text;
    last = e.end;
  }
  return out + f.slice(last);
}

/** A formula from a file: without the prefixes Excel's files give newer functions (_xlfn.XLOOKUP is XLOOKUP) and LAMBDA's names (_xlpm.x is x). */
export function formulaFromFile(f: string): string {
  return rewrite(f.replace(/^=/, ''), (t) =>
    t.k === 'fn' && /^(_xl|com\.microsoft\.|org\.(open|libre)office\.)/i.test(t.v) ? (/^_xlpm\./i.test(t.v) ? t.v.slice(6) : fnName(t.v)) : t.k === 'name' && /^_xlpm\./i.test(t.v) ? t.v.slice(6) : undefined,
  );
}

/** A formula with names a file defined (TaxRate) written as what they stand for (Sheet1!$B$1), by lower-case name. */
export function replaceNames(f: string, names: Map<string, string>): string {
  if (!names.size) return f;
  return rewrite(f, (t) => (t.k === 'name' ? names.get(t.v.toLowerCase()) : undefined));
}

/** Functions newer than Excel 2007, which its files write with a prefix. */
const XLFN = new Set([
  'AGGREGATE', 'CEILING.MATH', 'CONCAT', 'DAYS', 'FLOOR.MATH', 'IFNA', 'IFS', 'ISOWEEKNUM', 'MAXIFS', 'MINIFS', 'MODE.SNGL', 'PERCENTILE.INC',
  'QUARTILE.INC', 'RANK.EQ', 'STDEV.P', 'STDEV.S', 'SWITCH', 'TEXTJOIN', 'VAR.P', 'VAR.S', 'XLOOKUP', 'XMATCH', 'XOR', 'NORM.DIST', 'NORM.INV',
  'UNIQUE', 'SEQUENCE', 'SORTBY', 'LET', 'LAMBDA', 'MAP', 'REDUCE', 'SCAN', 'BYROW', 'BYCOL', 'MAKEARRAY', 'ISOMITTED', 'TEXTSPLIT', 'TEXTBEFORE',
  'TEXTAFTER', 'VSTACK', 'HSTACK', 'TAKE', 'DROP', 'CHOOSECOLS', 'CHOOSEROWS', 'TOCOL', 'TOROW', 'WRAPROWS', 'WRAPCOLS', 'EXPAND', 'REGEXTEST',
  'REGEXEXTRACT', 'REGEXREPLACE', 'IMAGE', 'RANDARRAY', 'FORECAST.LINEAR', 'NETWORKDAYS.INTL', 'WORKDAY.INTL', 'PERCENTILE.EXC', 'QUARTILE.EXC',
  'RANK.AVG', 'PERCENTRANK.INC', 'PERCENTRANK.EXC', 'COVARIANCE.P', 'COVARIANCE.S', 'NORM.S.DIST', 'NORM.S.INV', 'FORMULATEXT', 'NUMBERVALUE', 'UNICODE', 'UNICHAR',
  'ARABIC', 'ENCODEURL',
]);

/** Google Sheets' functions Excel has nothing like: a cell with one is written to an Excel file as the value it shows. */
const GOOGLE_ONLY = new Set(['COUNTUNIQUE', 'ISURL', 'ISEMAIL', 'FLATTEN', 'SORTN']);

// ---- formulas: working them out ----------------------------------------------------------------------------------

/** Cells of a sheet, as a reference gives them before their values are needed. */
export interface Rg {
  k: 'rg';
  si: number;
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}
/** Values in rows and columns: an array written in a formula ({1,2;3,4}), or what arithmetic on ranges gives. */
export interface Arr {
  k: 'arr';
  h: number;
  w: number;
  d: Scalar[];
}
/** A LAMBDA: its parameters' names (lower case), what it works out, and the names LET gave around it when it was made. */
export interface Lam {
  k: 'lam';
  params: string[];
  body: Node;
  env?: Map<string, Val>;
}
export type Val = Scalar | Rg | Arr | Lam;

const isRg = (v: Val): v is Rg => typeof v === 'object' && v !== null && (v as Rg).k === 'rg';
const isArr = (v: Val): v is Arr => typeof v === 'object' && v !== null && (v as Arr).k === 'arr';
const isLam = (v: Val): v is Lam => typeof v === 'object' && v !== null && (v as Lam).k === 'lam';
const multi = (v: Val) => isArr(v) || (isRg(v) && (v.r1 !== v.r2 || v.c1 !== v.c2));
/** A parameter a LAMBDA was called without (ISOMITTED tells): its name's mark in the names LET and LAMBDA give. */
const omitKey = (name: string) => `\u0000${name}`;

/** One question the AI function asks: its cell, the key its answer is kept by, the prompt and the cells' values as words. */
export interface AiAsk {
  sheet: string;
  cell: string;
  key: string;
  prompt: string;
  context: string[];
}

/** A cell's link, picture or sparkline, as HYPERLINK, IMAGE and SPARKLINE outermost in its formula (or Insert → Link) give it. */
export type CellSpecial =
  | { kind: 'link'; url: string }
  | { kind: 'image'; url: string; alt: string; fit: 'fit' | 'fill' | 'none' | 'size'; h?: number; w?: number }
  | { kind: 'spark'; values: (number | null)[]; type: 'line' | 'column' | 'bar' | 'winloss'; color?: string; neg?: string; max?: number; min?: number; width?: number; total?: number };

/**
 * Where a formula is being worked out: its sheet and cell, and how many random numbers it drew so far. A formula of
 * conditional formatting or of a rule is written for a range's first cell and worked out for each of its cells: its
 * references that are not fixed ($) move by dr rows and dc columns.
 */
export interface Ctx {
  si: number;
  r: number;
  c: number;
  n: number;
  dr?: number;
  dc?: number;
  /** The names LET and LAMBDA give here (lower case), to their values. */
  env?: Map<string, Val>;
  /** Worked out as an array (a formula that spills, an argument of SUM or FILTER): functions of one value work on each of an array's. */
  arr?: boolean;
}

export function toNum(v: Scalar): number | CellError {
  if (typeof v === 'number') return v;
  if (v === null) return 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof CellError) return v;
  // A range, an array or a LAMBDA where one value goes (a function given one by mistake).
  if (typeof v !== 'string') return E.CALC;
  const t = parseNumberText(v);
  return t && typeof t.v === 'number' ? t.v : E.VALUE;
}

export function toText(v: Scalar): string | CellError {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return numText(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v === null) return '';
  return v instanceof CellError ? v : E.CALC;
}

export function toBool(v: Scalar): boolean | CellError {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (v === null) return false;
  if (v instanceof CellError) return v;
  if (typeof v !== 'string') return E.CALC;
  const s = v.trim().toLowerCase();
  return s === 'true' ? true : s === 'false' ? false : E.VALUE;
}

/** A number as a result: NaN and infinities are #NUM!. */
const fin = (n: number): number | CellError => (Number.isFinite(n) ? (Object.is(n, -0) ? 0 : n) : E.NUM);

/** Two numbers as Excel compares them: equal when they agree to 15 digits (0.1 + 0.2 = 0.3). */
const near = (a: number, b: number) => a === b || Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * 1e-15;

const rank = (v: Scalar) => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : typeof v === 'boolean' ? 2 : 3);

/** Two values compared as Excel does: numbers before words before TRUE and FALSE; words without regard to case. */
export function compare(a: Scalar, b: Scalar): number {
  if (a === null) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0;
  if (b === null) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (typeof a === 'number' && typeof b === 'number') return near(a, b) ? 0 : a < b ? -1 : 1;
  if (typeof a === 'string' && typeof b === 'string') {
    const x = a.toLowerCase();
    const y = b.toLowerCase();
    return x === y ? 0 : x < y ? -1 : 1;
  }
  if (typeof a === 'boolean' && typeof b === 'boolean') return a === b ? 0 : a ? 1 : -1;
  return 0;
}

/** One sign between two values. */
function binScalar(op: string, a: Scalar, b: Scalar): Scalar {
  if (op === '&') {
    const x = toText(a);
    if (x instanceof CellError) return x;
    const y = toText(b);
    return y instanceof CellError ? y : (x + y).slice(0, SHEET_LIMITS.text);
  }
  if (op === '=' || op === '<>' || op === '<' || op === '>' || op === '<=' || op === '>=') {
    if (a instanceof CellError) return a;
    if (b instanceof CellError) return b;
    const c = compare(a, b);
    return op === '=' ? c === 0 : op === '<>' ? c !== 0 : op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0;
  }
  const x = toNum(a);
  if (x instanceof CellError) return x;
  const y = toNum(b);
  if (y instanceof CellError) return y;
  switch (op) {
    case '+':
      return fin(x + y);
    case '-':
      return fin(x - y);
    case '*':
      return fin(x * y);
    case '/':
      return y === 0 ? E.DIV : fin(x / y);
    case '^':
      if (x === 0 && y === 0) return E.NUM;
      if (x === 0 && y < 0) return E.DIV;
      return fin(x ** y);
  }
  return E.VALUE;
}

/** A value of an array (or of what stands for one), stretched as Excel stretches a row or a column to fit. */
function pick(a: Arr, i: number, j: number): Scalar {
  const ii = a.h === 1 ? 0 : i;
  const jj = a.w === 1 ? 0 : j;
  return ii < a.h && jj < a.w ? a.d[ii * a.w + jj] : E.NA;
}

class Deep {
  constructor(
    readonly si: number,
    readonly key: number,
  ) {}
}

/** How deep one formula may wait on others before the rest waits: chains of thousands of cells are worked out in steps. */
const FRAME_LIMIT = 700;
/** The most values an array may hold. */
const MAX_ARRAY = 2_000_000;

/** How a sheet's filter is worked out (sheet-rules.ts sets it when it is loaded): the rows it hides. */
let filterHook: ((sh: Sheet, si: number, calc: Calc) => Set<number>) | null = null;
export function setFilterHook(f: (sh: Sheet, si: number, calc: Calc) => Set<number>) {
  filterHook = f;
}

export interface CalcOptions {
  /** The time TODAY and NOW give (this computer's clock otherwise). */
  now?: Date;
  /** What RAND's numbers come from: the same seed gives the same numbers. */
  seed?: number;
}

/**
 * A workbook's formulas, worked out as they are needed and remembered until something changes: what a cell shows
 * (value), every result at once (all), and, for the editor, cells that changed (update) or a workbook that did (reset).
 */
/** The functions whose arrays spill into the cells beside and under their own (dynamic arrays). */
const SPILL_FNS = new Set([
  'FILTER', 'SORT', 'UNIQUE', 'SEQUENCE', 'SORTBY', 'TRANSPOSE', 'RANDARRAY', 'ARRAYFORMULA', 'LET', 'MAP', 'SCAN', 'BYROW', 'BYCOL', 'MAKEARRAY',
  'TEXTSPLIT', 'SPLIT', 'VSTACK', 'HSTACK', 'TAKE', 'DROP', 'CHOOSECOLS', 'CHOOSEROWS', 'TOCOL', 'TOROW', 'WRAPROWS', 'WRAPCOLS', 'EXPAND',
  'REGEXEXTRACT', 'TREND', 'GROWTH', 'LINEST', 'LOGEST', 'MMULT', 'MINVERSE', 'FREQUENCY', 'REDUCE', 'FLATTEN', 'SORTN',
]);

/** Whether a formula's result is an array that spills: one of SPILL_FNS outermost, or a LAMBDA called (=LAMBDA(x, x*2)(A1:A9)). */
export function spills(f: string): boolean {
  const n = parsedOf(f);
  // A function of no such name is a named LAMBDA's (=Tax(B2:B9)): it may give an array too.
  return !!n && ((n.k === 'f' && (SPILL_FNS.has(n.name) || !FNS[n.name])) || n.k === 'call');
}

/** An array a formula spilled: its rows and columns, values row by row. */
export interface Spill {
  h: number;
  w: number;
  d: Scalar[];
}

export class Calc {
  book!: Workbook;
  private idx: Map<number, Cell>[] = [];
  private memo: Map<number, Scalar>[] = [];
  /** Per sheet: the cells whose formulas spill, and the arrays they spilled (null: no room). */
  private anchors: Set<number>[] = [];
  private spilt: Map<number, Spill | null>[] = [];
  private busy: Set<number>[] = [];
  private ext: ({ rows: number; cols: number } | null)[] = [];
  private sorted: (number[] | null)[] = [];
  /** Per sheet: the rows its filter hides, worked out when SUBTOTAL first asks (and again after any change). */
  private filt: (Set<number> | null)[] = [];
  private byName = new Map<string, number>();
  private frames = 0;
  private rowsMax = -1;
  /** Named ranges by lower-case name: the workbook's (-1) and each sheet's own, as trees. */
  private named = new Map<string, Map<number, Node | null>>();
  private namesBusy = new Set<string>();
  private lamDepth = 0;
  /** What the AI function asked for and has no answer to yet (by cell and key), and every key it looked for. */
  private aiWant = new Map<string, AiAsk>();
  private aiSeen = new Set<string>();
  readonly now: number;
  readonly seed: number;

  constructor(book: Workbook, o: CalcOptions = {}) {
    this.now = nowSerial(o.now ?? new Date());
    this.seed = o.seed ?? Math.floor(Math.random() * 2 ** 31);
    this.reset(book);
  }

  /** Starts again from the workbook as it is now (rows went in or out, sheets changed). */
  reset(book: Workbook = this.book) {
    this.book = book;
    this.anchors = book.sheets.map(() => new Set<number>());
    this.idx = book.sheets.map((sh, si) => {
      const m = new Map<number, Cell>();
      for (const k in sh.cells) {
        const n = keyOf(k);
        if (n < 0) continue;
        m.set(n, sh.cells[k]);
        if (sh.cells[k].f !== undefined && spills(sh.cells[k].f!)) this.anchors[si].add(n);
      }
      return m;
    });
    this.byName = new Map(book.sheets.map((s, i) => [s.name.toLowerCase(), i]));
    this.ext = book.sheets.map(() => null);
    this.sorted = book.sheets.map(() => null);
    this.rowsMax = -1;
    this.named = new Map();
    for (const nm of book.names ?? []) {
      const k = nm.name.toLowerCase();
      const si = nm.sheet ? book.sheets.findIndex((s) => s.id === nm.sheet) : -1;
      if (nm.sheet && si < 0) continue;
      let m = this.named.get(k);
      if (!m) this.named.set(k, (m = new Map()));
      m.set(si, parsedOf(nm.ref));
    }
    this.clear();
  }

  /** Some cells of a sheet changed (by name): they are read again, and the formulas worked out anew. */
  update(si: number, names: Iterable<string>) {
    const sh = this.book.sheets[si];
    const m = this.idx[si];
    if (!sh || !m) return this.reset();
    const e = this.ext[si];
    for (const k of names) {
      const n = keyOf(k);
      if (n < 0) continue;
      const c = sh.cells[k];
      const had = m.has(n);
      if (c) m.set(n, c);
      else m.delete(n);
      if (c?.f !== undefined && spills(c.f)) this.anchors[si]?.add(n);
      else this.anchors[si]?.delete(n);
      if (had !== !!c) this.sorted[si] = null;
      if (e) {
        const r = unpackR(n);
        const col = unpackC(n);
        if (c) [e.rows, e.cols] = [Math.max(e.rows, r + 1), Math.max(e.cols, col + 1)];
        else if (r + 1 >= e.rows || col + 1 >= e.cols) this.ext[si] = null;
      }
    }
    this.rowsMax = -1;
    this.clear();
  }

  private clear() {
    this.filt = this.book.sheets.map(() => null);
    this.memo = this.book.sheets.map(() => new Map());
    this.busy = this.book.sheets.map(() => new Set());
    this.spilt = this.book.sheets.map(() => new Map());
    this.aiWant = new Map();
    this.aiSeen = new Set();
  }

  /** The AI answers the workbook changed (new ones came, or were asked again): the formulas are worked out anew. */
  aiChanged() {
    this.clear();
  }

  /** The AI function's questions that have no answer yet, of the cells worked out so far (aiCells works them all out). */
  aiAsks(): AiAsk[] {
    return [...this.aiWant.values()];
  }

  /** The keys of the AI answers the cells worked out so far look for. */
  aiKeys(): Set<string> {
    return this.aiSeen;
  }

  /** The AI function asked (by `cx`'s cell) for an answer it has not got. */
  wantAi(cx: Ctx, key: string, prompt: string, context: string[]) {
    this.aiSeen.add(key);
    const sh = this.book.sheets[cx.si];
    if (sh) this.aiWant.set(`${cx.si}:${cx.r}:${cx.c}:${key}`, { sheet: sh.id, cell: refName(cx.r, cx.c), key, prompt, context });
  }

  /** An AI answer looked up (found or not). */
  seenAi(key: string) {
    this.aiSeen.add(key);
  }

  /** A named range's (or value's, or LAMBDA's) value for a formula at `cx`: the sheet's own name first, else the workbook's. */
  nameVal(name: string, cx: Ctx): Val {
    const k = name.toLowerCase().replace(/^_xlpm\./, '');
    const m = this.named.get(k);
    const node = m?.has(cx.si) ? m.get(cx.si) : m?.get(-1);
    if (node === undefined) return E.NAME;
    if (node === null) return E.PARSE;
    const busy = `${cx.si}:${k}`;
    if (this.namesBusy.has(busy)) return E.CIRC;
    this.namesBusy.add(busy);
    try {
      return this.ev(node, { si: cx.si, r: cx.r, c: cx.c, n: cx.n, arr: cx.arr });
    } finally {
      this.namesBusy.delete(busy);
    }
  }

  /** Whether a name is one of the workbook's named ranges (for the sheet `si`). */
  hasName(name: string, si = -1): boolean {
    const m = this.named.get(name.toLowerCase());
    return !!m && (m.has(-1) || m.has(si));
  }

  /** A LAMBDA called with these values (undefined: left out, which ISOMITTED tells); #VALUE! with more than it takes. */
  call(lam: Lam, args: (Val | undefined)[], cx: Ctx): Val {
    if (args.length > lam.params.length) return E.VALUE;
    if (this.lamDepth > 400) return E.NUM;
    const env = new Map(lam.env ?? []);
    lam.params.forEach((p, i) => {
      const a = args[i];
      if (a === undefined) {
        env.set(p, null);
        env.set(omitKey(p), true);
      } else {
        env.set(p, a);
        env.delete(omitKey(p));
      }
    });
    const saved = cx.env;
    cx.env = env;
    this.lamDepth++;
    try {
      return this.ev(lam.body, cx);
    } finally {
      this.lamDepth--;
      cx.env = saved;
    }
  }

  /** A function of one value worked on each value of the arrays its arguments are (in a formula worked out as an array). */
  private lifted(name: string, fn: Fn, args: Node[], cx: Ctx): Val {
    const which = LIFT.get(name)!;
    const vals = args.map((a, i) => (a.k === 'nil' || (which !== 'all' && !which.includes(i)) ? null : this.ev(a, cx)));
    const arrays: (Arr | null)[] = [];
    let h = 1;
    let w = 1;
    let any = false;
    for (let i = 0; i < args.length; i++) {
      const v = vals[i];
      if (v === null || !multi(v)) {
        arrays.push(null);
        continue;
      }
      const a = this.arr(v);
      if (a instanceof CellError) return a;
      arrays.push(a);
      any = true;
      h = Math.max(h, a.h);
      w = Math.max(w, a.w);
    }
    const nodes = args.map((a, i): Node => (a.k === 'nil' || (which !== 'all' && !which.includes(i)) ? a : { k: 'v', v: vals[i]! }));
    if (!any) return fn(this, nodes, cx);
    if (h * w > MAX_ARRAY) return E.NUM;
    const d: Scalar[] = new Array(h * w);
    for (let i = 0; i < h; i++)
      for (let j = 0; j < w; j++) {
        const one = nodes.map((n, k): Node => (arrays[k] ? { k: 'v', v: pick(arrays[k]!, i, j) } : n));
        d[i * w + j] = this.sc(fn(this, one, cx), cx);
      }
    return { k: 'arr', h, w, d };
  }

  /**
   * A cell's link, picture or sparkline: its own link (Insert → Link), else HYPERLINK, IMAGE or SPARKLINE outermost in
   * its formula, worked out; null when it has none.
   */
  special(si: number, r: number, c: number): CellSpecial | null {
    const cell = this.cellAt(si, r, c);
    if (!cell) return null;
    if (cell.link) return { kind: 'link', url: cell.link };
    if (cell.f === undefined || !/^\s*(?:_xlfn\.)?(HYPERLINK|IMAGE|SPARKLINE)\s*\(/i.test(cell.f)) return null;
    const node = parsedOf(cell.f);
    if (!node || node.k !== 'f') return null;
    const cx: Ctx = { si, r, c, n: 0 };
    const a = node.args;
    try {
      if (node.name === 'HYPERLINK') {
        const url = S(this, a[0], cx);
        const link = typeof url === 'string' ? cleanLink(url) : undefined;
        return link ? { kind: 'link', url: link } : null;
      }
      if (node.name === 'IMAGE') return imageOf(this, a, cx);
      if (node.name === 'SPARKLINE') return sparkOf(this, a, cx);
    } catch {
      return null;
    }
    return null;
  }

  /**
   * What spills into an empty cell from a formula above or left of it, or null. `top`: asked from outside a formula
   * (the anchor is worked out as a top formula is); else from within one.
   */
  private ghost(si: number, key: number, top: boolean): Scalar {
    const anchors = this.anchors[si];
    if (!anchors?.size) return null;
    const r = unpackR(key);
    const c = unpackC(key);
    for (const a of anchors) {
      const ar = unpackR(a);
      const ac = unpackC(a);
      if (ar > r || ac > c) continue;
      if (!this.spilt[si].has(a)) {
        if (this.busy[si].has(a)) continue;
        if (top) this.top(si, a);
        else this.cell(si, a);
      }
      const sp = this.spilt[si].get(a);
      if (sp && r < ar + sp.h && c < ac + sp.w) return sp.d[(r - ar) * sp.w + (c - ac)];
    }
    return null;
  }

  /** The arrays a sheet's formulas spilled, each with its first cell (worked out as needed). */
  spillsOf(si: number): { r: number; c: number; sp: Spill }[] {
    const out: { r: number; c: number; sp: Spill }[] = [];
    for (const a of this.anchors[si] ?? []) {
      if (!this.spilt[si].has(a)) this.top(si, a);
      const sp = this.spilt[si].get(a);
      if (sp) out.push({ r: unpackR(a), c: unpackC(a), sp });
    }
    return out;
  }

  /** How far a sheet's cells reach with what spills from them: for drawing and saving it. */
  shownExtent(si: number): { rows: number; cols: number } {
    const e = this.extent(si);
    let { rows, cols } = e;
    for (const { r, c, sp } of this.spillsOf(si)) [rows, cols] = [Math.max(rows, r + sp.h), Math.max(cols, c + sp.w)];
    return { rows, cols };
  }

  /** How far a sheet's cells reach: rows and columns from A1 to its last one. */
  extent(si: number): { rows: number; cols: number } {
    let e = this.ext[si];
    if (!e) {
      let rows = 0;
      let cols = 0;
      for (const n of this.idx[si]?.keys() ?? []) {
        rows = Math.max(rows, unpackR(n) + 1);
        cols = Math.max(cols, unpackC(n) + 1);
      }
      e = this.ext[si] = { rows, cols };
    }
    return e;
  }

  /** The most rows any sheet has: how far whole columns reach when their values are laid out. */
  private maxRows(): number {
    if (this.rowsMax < 0) this.rowsMax = Math.max(1, ...this.book.sheets.map((_, i) => this.extent(i).rows));
    return this.rowsMax;
  }
  private maxCols(): number {
    return Math.max(1, ...this.book.sheets.map((_, i) => this.extent(i).cols));
  }

  sheetIndex(name: string): number {
    return this.byName.get(name.toLowerCase()) ?? -1;
  }

  /** Whether a row is hidden by hand (for SUBTOTAL's 101 to 111). */
  rowHidden(si: number, r: number): boolean {
    return !!this.book.sheets[si]?.rows?.[r]?.hidden;
  }

  /** Whether the sheet's filter hides a row (for SUBTOTAL): known once sheet-rules.ts is loaded, which the editor and the server always do. */
  rowFiltered(si: number, r: number): boolean {
    const sh = this.book.sheets[si];
    if (!filterHook || !sh?.filter) return false;
    return (this.filt[si] ??= filterHook(sh, si, this)).has(r);
  }

  /** The cell itself (what it holds), or undefined. */
  cellAt(si: number, r: number, c: number): Cell | undefined {
    return this.idx[si]?.get(pack(r, c));
  }

  /** What a cell shows: its formula's result, else what it holds; null when it is empty. */
  value(si: number, r: number, c: number): Scalar {
    if (r < 0 || c < 0 || r >= MAX_ROWS || c >= MAX_COLS) return E.REF;
    const key = pack(r, c);
    const cell = this.idx[si]?.get(key);
    if (!cell) return this.ghost(si, key, true);
    if (cell.f === undefined) return cell.v ?? null;
    return this.top(si, key);
  }

  /** By the sheet's id and the cell's name ("B2"). */
  get(sheetId: string, name: string): Scalar {
    const si = this.book.sheets.findIndex((s) => s.id === sheetId);
    const p = parseRef(name);
    return si < 0 || !p ? E.REF : this.value(si, p.r, p.c);
  }

  /**
   * What a formula (without its "=") gives, written for the cell (r0, c0) and worked out for (r, c): conditional
   * formatting's and rules' own formulas ("$C2>100" for C2, then C3 and on). Never throws.
   */
  evalAt(si: number, f: string, r: number, c: number, r0 = r, c0 = c): Scalar {
    const node = parsedOf(f);
    if (!node) return E.PARSE;
    for (let tries = 0; tries < 50; tries++) {
      const cx: Ctx = { si, r, c, n: 0, dr: r - r0, dc: c - c0 };
      try {
        this.frames = 0;
        const v = this.sc(this.ev(node, cx), cx);
        return v === null ? 0 : v;
      } catch (e) {
        if (!(e instanceof Deep)) return E.VALUE;
        // A long chain of cells it needs: worked out from its far end, then this again.
        this.top(e.si, e.key);
      }
    }
    return E.VALUE;
  }

  /** Every formula's result, by sheet id and cell name. */
  all(): Record<string, Record<string, Scalar>> {
    const out: Record<string, Record<string, Scalar>> = {};
    this.book.sheets.forEach((sh, si) => {
      const vals: Record<string, Scalar> = {};
      for (const k of this.keys(si)) {
        const c = this.idx[si].get(k)!;
        if (c.f !== undefined) vals[refName(unpackR(k), unpackC(k))] = this.value(si, unpackR(k), unpackC(k));
      }
      out[sh.id] = vals;
    });
    return out;
  }

  /** A sheet's cells' numbers in reading order (row by row). */
  keys(si: number): number[] {
    let s = this.sorted[si];
    if (!s) s = this.sorted[si] = [...(this.idx[si]?.keys() ?? [])].sort((a, b) => a - b);
    return s;
  }

  /** Works a formula out at the top: a chain too long to follow at once is worked out from its far end first. */
  private top(si: number, key: number): Scalar {
    const todo: [number, number][] = [[si, key]];
    while (todo.length) {
      const [s, k] = todo[todo.length - 1];
      if (this.memo[s].has(k)) {
        todo.pop();
        continue;
      }
      // Those waiting under it are being worked out: a formula that needs one of them goes round in a circle.
      const waiting = todo.slice(0, -1);
      for (const [ws, wk] of waiting) this.busy[ws].add(wk);
      try {
        this.frames = 0;
        this.cell(s, k);
        todo.pop();
      } catch (e) {
        if (!(e instanceof Deep)) throw e;
        todo.push([e.si, e.key]);
      } finally {
        for (const [ws, wk] of waiting) this.busy[ws].delete(wk);
      }
    }
    return this.memo[si].get(key) ?? null;
  }

  /** A cell's value while a formula needs it: worked out now when it is a formula. */
  cell(si: number, key: number): Scalar {
    const m = this.memo[si]?.get(key);
    if (m !== undefined) return m;
    const cell = this.idx[si]?.get(key);
    if (!cell) return this.ghost(si, key, false);
    if (cell.f === undefined) return cell.v ?? null;
    if (this.busy[si].has(key)) return E.CIRC;
    if (this.frames > FRAME_LIMIT) throw new Deep(si, key);
    this.busy[si].add(key);
    let v: Scalar;
    try {
      v = this.run(si, key, cell.f);
    } finally {
      this.busy[si].delete(key);
    }
    this.memo[si].set(key, v);
    return v;
  }

  /** A value at a row and column (blank past the grid). */
  at(si: number, r: number, c: number): Scalar {
    return r < 0 || c < 0 || r >= MAX_ROWS || c >= MAX_COLS ? E.REF : this.cell(si, pack(r, c));
  }

  private run(si: number, key: number, f: string): Scalar {
    const node = parsedOf(f);
    if (!node) return E.PARSE;
    const cx: Ctx = { si, r: unpackR(key), c: unpackC(key), n: 0 };
    const frames = this.frames;
    const lams = this.lamDepth;
    try {
      // A formula that spills is worked out as an array (=ARRAYFORMULA(LEFT(A2:A9, 3)) gives eight values).
      if (this.anchors[si]?.has(key)) return this.spill(si, key, this.ev(node, { ...cx, arr: true }), cx);
      const s = this.sc(this.ev(node, cx), cx);
      return s === null ? 0 : s;
    } catch (e) {
      if (e instanceof Deep) throw e;
      // A formula this cannot work out (far too big, say) is an error in its cell, not in the others'.
      this.frames = frames;
      this.lamDepth = lams;
      return E.VALUE;
    }
  }

  /**
   * A spilling formula's result laid out from its cell: its first value there, the rest in the cells beside and under
   * it, unless one of those holds something (then #SPILL!).
   */
  private spill(si: number, key: number, v: Val, cx: Ctx): Scalar {
    if (!multi(v)) {
      this.spilt[si].set(key, null);
      const s = this.sc(v, cx);
      return s === null ? 0 : s;
    }
    const a = this.arr(v);
    if (a instanceof CellError) {
      this.spilt[si].set(key, null);
      return a;
    }
    const r = unpackR(key);
    const c = unpackC(key);
    let blocked = r + a.h > SHEET_LIMITS.rows || c + a.w > SHEET_LIMITS.cols;
    const idx = this.idx[si];
    for (let i = 0; i < a.h && !blocked; i++)
      for (let j = 0; j < a.w; j++) {
        if (!i && !j) continue;
        const cell = idx.get(pack(r + i, c + j));
        if (cell && (cell.v !== undefined || cell.f !== undefined)) {
          blocked = true;
          break;
        }
      }
    if (blocked) {
      this.spilt[si].set(key, null);
      return E.SPILL;
    }
    this.spilt[si].set(key, { h: a.h, w: a.w, d: a.d });
    const first = a.d[0];
    return first === null || first === undefined ? 0 : first;
  }

  /** A formula's piece worked out: a value, or cells (a reference) or values in rows (an array) for what takes them. */
  ev(n: Node, cx: Ctx): Val {
    this.frames++;
    let v: Val;
    switch (n.k) {
      case 'n':
      case 's':
      case 'b':
      case 'e':
        v = n.v;
        break;
      case 'nil':
        v = null;
        break;
      case 'v':
        v = n.v;
        break;
      case 'name': {
        // A name LET or LAMBDA gives, else a named range.
        const bound = cx.env?.get(n.v.toLowerCase());
        v = bound !== undefined ? bound : this.nameVal(n.v, cx);
        break;
      }
      case 'call': {
        const f = this.ev(n.fn, cx);
        v = isLam(f) ? this.call(f, n.args.map((a) => (a.k === 'nil' ? undefined : this.ev(a, cx))), cx) : f instanceof CellError ? f : E.VALUE;
        break;
      }
      case 'arr':
        v = { k: 'arr', h: n.rows.length, w: n.rows[0]?.length ?? 0, d: n.rows.flat() };
        break;
      case 'r':
        if (cx.dr || cx.dc) {
          const move = (p: RefPart): RefPart => ({ ...p, ...(p.r !== undefined && !p.ar ? { r: p.r + (cx.dr ?? 0) } : {}), ...(p.c !== undefined && !p.ac ? { c: p.c + (cx.dc ?? 0) } : {}) });
          const a = move(n.a);
          const b = n.b ? move(n.b) : undefined;
          const off = (p: RefPart | undefined) => !!p && ((p.r ?? 0) < 0 || (p.c ?? 0) < 0 || (p.r ?? 0) >= MAX_ROWS || (p.c ?? 0) >= MAX_COLS);
          v = off(a) || off(b) ? E.REF : this.refVal(n.sheet, a, b, cx);
        } else v = this.refVal(n.sheet, n.a, n.b, cx);
        break;
      case 'neg':
        v = this.lift(this.ev(n.x, cx), cx, (s) => {
          const x = toNum(s);
          return x instanceof CellError ? x : fin(-x);
        });
        break;
      case 'pct':
        v = this.lift(this.ev(n.x, cx), cx, (s) => {
          const x = toNum(s);
          return x instanceof CellError ? x : x / 100;
        });
        break;
      case 'ch': {
        let acc = this.ev(n.xs[0], cx);
        for (let i = 0; i < n.ops.length; i++) acc = this.bin(n.ops[i], acc, this.ev(n.xs[i + 1], cx), cx);
        v = acc;
        break;
      }
      case 'f': {
        const fn = FNS[n.name];
        if (fn) v = cx.arr && LIFT.has(n.name) && n.args.length ? this.lifted(n.name, fn, n.args, cx) : fn(this, n.args, cx);
        else {
          // A LAMBDA LET gave this name, or a named one (Data → Named ranges), called.
          const bound = cx.env?.get(n.name.toLowerCase());
          const f = bound !== undefined ? bound : this.hasName(n.name, cx.si) ? this.nameVal(n.name, cx) : E.NAME;
          v = isLam(f) ? this.call(f, n.args.map((a) => (a.k === 'nil' ? undefined : this.ev(a, cx))), cx) : f instanceof CellError ? f : E.VALUE;
        }
        break;
      }
    }
    this.frames--;
    return v;
  }

  /** A reference's cells. */
  refVal(sheet: string | undefined, a: RefPart, b: RefPart | undefined, cx: Ctx): Val {
    const si = sheet === undefined ? cx.si : this.sheetIndex(sheet);
    if (si < 0) return E.REF;
    const end = b ?? a;
    const r1 = a.r ?? 0;
    const c1 = a.c ?? 0;
    const r2 = end.r ?? MAX_ROWS - 1;
    const c2 = end.c ?? MAX_COLS - 1;
    return { k: 'rg', si, r1: Math.min(r1, r2), c1: Math.min(c1, c2), r2: Math.max(r1, r2), c2: Math.max(c1, c2) };
  }

  /** One value from what may be cells or an array: the cell in the formula's own row or column, else the first. */
  sc(v: Val, cx: Ctx): Scalar {
    if (isRg(v)) {
      if (v.r1 === v.r2 && v.c1 === v.c2) return this.at(v.si, v.r1, v.c1);
      if (v.c1 === v.c2 && cx.r >= v.r1 && cx.r <= v.r2) return this.at(v.si, cx.r, v.c1);
      if (v.r1 === v.r2 && cx.c >= v.c1 && cx.c <= v.c2) return this.at(v.si, v.r1, cx.c);
      return this.at(v.si, v.r1, v.c1);
    }
    if (isArr(v)) return v.d.length ? v.d[0] : E.VALUE;
    // A LAMBDA never called is no value.
    if (isLam(v)) return E.CALC;
    return v;
  }

  /** Values in rows and columns, from cells (whole columns as far as the workbook's rows go), an array or one value. */
  arr(v: Val): Arr | CellError {
    if (isArr(v)) return v;
    if (isLam(v)) return E.CALC;
    if (!isRg(v)) return { k: 'arr', h: 1, w: 1, d: [v] };
    const r2 = v.r2 >= this.maxRows() ? Math.max(v.r1, this.maxRows() - 1) : v.r2;
    const c2 = v.c2 >= this.maxCols() ? Math.max(v.c1, this.maxCols() - 1) : v.c2;
    const h = r2 - v.r1 + 1;
    const w = c2 - v.c1 + 1;
    if (h * w > MAX_ARRAY) return E.NUM;
    const d: Scalar[] = new Array(h * w);
    for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) d[i * w + j] = this.at(v.si, v.r1 + i, v.c1 + j);
    return { k: 'arr', h, w, d };
  }

  /** The same work on each value of cells or an array (ABS(A1:A3)), or on one value. */
  lift(v: Val, cx: Ctx, f: (s: Scalar) => Scalar): Val {
    if (!multi(v)) return f(this.sc(v, cx));
    const a = this.arr(v);
    if (a instanceof CellError) return a;
    return { k: 'arr', h: a.h, w: a.w, d: a.d.map(f) };
  }

  private bin(op: string, a: Val, b: Val, cx: Ctx): Val {
    if (!multi(a) && !multi(b)) return binScalar(op, this.sc(a, cx), this.sc(b, cx));
    const A = this.arr(a);
    if (A instanceof CellError) return A;
    const B = this.arr(b);
    if (B instanceof CellError) return B;
    const h = Math.max(A.h, B.h);
    const w = Math.max(A.w, B.w);
    if (h * w > MAX_ARRAY) return E.NUM;
    const d: Scalar[] = new Array(h * w);
    for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) d[i * w + j] = binScalar(op, pick(A, i, j), pick(B, i, j));
    return { k: 'arr', h, w, d };
  }

  /**
   * The values of cells, an array or a single value, each with its place: `f(value, i, j)` (i, j from the range's
   * corner). Only cells that hold something are visited when `blanks` is false.
   */
  each(v: Val, f: (s: Scalar, i: number, j: number) => boolean | void, blanks = false): void {
    if (isArr(v)) {
      for (let i = 0; i < v.h; i++) for (let j = 0; j < v.w; j++) if (f(v.d[i * v.w + j], i, j) === false) return;
      return;
    }
    if (!isRg(v)) {
      f(isLam(v) ? E.CALC : v, 0, 0);
      return;
    }
    const idx = this.idx[v.si];
    if (!idx) return;
    if (blanks) {
      const a = this.arr(v);
      if (a instanceof CellError) return void f(a, 0, 0);
      return this.each(a, f);
    }
    // What spills into the range: visited first, so the cells holding something are visited as they always are.
    if (this.anchors[v.si]?.size) {
      for (const a of this.anchors[v.si]) {
        if (!this.spilt[v.si].has(a)) this.cell(v.si, a);
        const sp = this.spilt[v.si].get(a);
        if (!sp) continue;
        const ar = unpackR(a);
        const ac = unpackC(a);
        for (let i = 0; i < sp.h; i++)
          for (let j = 0; j < sp.w; j++) {
            const r = ar + i;
            const c = ac + j;
            if ((!i && !j) || r < v.r1 || r > v.r2 || c < v.c1 || c > v.c2 || idx.has(pack(r, c))) continue;
            if (f(sp.d[i * sp.w + j], r - v.r1, c - v.c1) === false) return;
          }
      }
    }
    const e = this.extent(v.si);
    const r2 = Math.min(v.r2, e.rows - 1);
    const c2 = Math.min(v.c2, e.cols - 1);
    if (r2 < v.r1 || c2 < v.c1) return;
    const area = (r2 - v.r1 + 1) * (c2 - v.c1 + 1);
    if (area <= idx.size * 2) {
      for (let r = v.r1; r <= r2; r++)
        for (let c = v.c1; c <= c2; c++) {
          const k = pack(r, c);
          if (idx.has(k) && f(this.cell(v.si, k), r - v.r1, c - v.c1) === false) return;
        }
      return;
    }
    for (const k of this.keys(v.si)) {
      const r = unpackR(k);
      const c = unpackC(k);
      if (r < v.r1 || r > r2 || c < v.c1 || c > c2) continue;
      if (f(this.cell(v.si, k), r - v.r1, c - v.c1) === false) return;
    }
  }

  /** A range's size as written, and how far it reaches into what its sheet holds (for looking through it). */
  dims(v: Val): { h: number; w: number; hh: number; ww: number; get: (i: number, j: number) => Scalar } {
    if (isArr(v)) return { h: v.h, w: v.w, hh: v.h, ww: v.w, get: (i, j) => (i < v.h && j < v.w ? v.d[i * v.w + j] : null) };
    if (!isRg(v)) return { h: 1, w: 1, hh: 1, ww: 1, get: (i, j) => (i === 0 && j === 0 ? (isLam(v) ? E.CALC : v) : null) };
    const e = this.extent(v.si);
    const h = v.r2 - v.r1 + 1;
    const w = v.c2 - v.c1 + 1;
    return { h, w, hh: Math.max(0, Math.min(h, e.rows - v.r1)), ww: Math.max(0, Math.min(w, e.cols - v.c1)), get: (i, j) => this.at(v.si, v.r1 + i, v.c1 + j) };
  }

  /** A random number in [0, 1), the same for a cell's n-th draw until the workbook is worked out with another seed. */
  rand(cx: Ctx): number {
    let h = (this.seed ^ Math.imul(cx.si + 1, 0x9e3779b1) ^ Math.imul(cx.r + 1, 0x85ebca77) ^ Math.imul(cx.c + 1, 0xc2b2ae3d) ^ Math.imul(++cx.n, 0x27d4eb2f)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
}

/** A workbook's formulas, ready to be worked out (value, get, all). */
export const computeBook = (b: Workbook, o?: CalcOptions) => new Calc(b, o);

// ---- formulas: functions --------------------------------------------------------------------------------------------

type Fn = (c: Calc, a: Node[], cx: Ctx) => Val;

/** An argument given (not left out, as in IF(A1,,2)). */
const has = (a: Node[], i: number) => i < a.length && a[i].k !== 'nil';
/** An argument as one value. */
const S = (c: Calc, n: Node | undefined, cx: Ctx): Scalar => (n ? c.sc(c.ev(n, cx), cx) : null);
const N = (c: Calc, n: Node | undefined, cx: Ctx) => toNum(S(c, n, cx));
const T = (c: Calc, n: Node | undefined, cx: Ctx) => toText(S(c, n, cx));
const B = (c: Calc, n: Node | undefined, cx: Ctx) => toBool(S(c, n, cx));
/** An optional number: `def` when it is left out. */
const opt = (c: Calc, a: Node[], i: number, cx: Ctx, def: number) => (has(a, i) ? N(c, a[i], cx) : def);
/** An argument worked out as an array (SUM's, FILTER's): functions of one value inside it work on each of an array's values. */
function evA(c: Calc, n: Node, cx: Ctx): Val {
  if (cx.arr) return c.ev(n, cx);
  cx.arr = true;
  try {
    return c.ev(n, cx);
  } finally {
    cx.arr = false;
  }
}

/** A function that takes from `min` to `max` arguments; called with another number of them, #N/A (as Google Sheets says). */
const def =
  (min: number, max: number, f: Fn): Fn =>
  (c, a, cx) =>
    a.length < min || a.length > max ? E.NA : f(c, a, cx);

/** A function of numbers, worked on each value when its first argument is cells or an array (ABS(A1:A3)). Left-out arguments are NaN. */
function math(min: number, max: number, f: (...x: number[]) => number | CellError): Fn {
  return def(min, max, (c, a, cx) => {
    const rest: number[] = [];
    for (let i = 1; i < a.length; i++) {
      if (!has(a, i)) {
        rest.push(NaN);
        continue;
      }
      const v = N(c, a[i], cx);
      if (v instanceof CellError) return v;
      rest.push(v);
    }
    const first = a.length ? c.ev(a[0], cx) : null;
    return c.lift(first, cx, (s) => {
      const x = toNum(s);
      if (x instanceof CellError) return x;
      const r = f(x, ...rest);
      return r instanceof CellError ? r : fin(r);
    });
  });
}

/** The first error among some cells or an array, visiting the others with `f`. */
function scan(c: Calc, v: Val, f: (s: Scalar, i: number, j: number) => void, blanks = false): CellError | null {
  const st: { e: CellError | null } = { e: null };
  c.each(
    v,
    (s, i, j) => {
      if (s instanceof CellError) {
        st.e = s;
        return false;
      }
      f(s, i, j);
    },
    blanks,
  );
  return st.e;
}

/** The numbers of the arguments, as SUM takes them: from cells and arrays only numbers; given directly, TRUE, FALSE and numbers in words too. */
function numbersOf(c: Calc, a: Node[], cx: Ctx): number[] | CellError {
  const out: number[] = [];
  for (const n of a) {
    if (n.k === 'nil') {
      out.push(0);
      continue;
    }
    const v = evA(c, n, cx);
    if (isRg(v) || isArr(v)) {
      const e = scan(c, v, (x) => typeof x === 'number' && out.push(x));
      if (e) return e;
    } else if (v !== null) {
      const x = toNum(c.sc(v, cx));
      if (x instanceof CellError) return x;
      out.push(x);
    }
  }
  return out;
}

/** A function of all the numbers of its arguments (SUM, AVERAGE, MEDIAN…). */
const agg = (f: (xs: number[]) => number | CellError, min = 1): Fn =>
  def(min, 255, (c, a, cx) => {
    const xs = numbersOf(c, a, cx);
    if (xs instanceof CellError) return xs;
    const r = f(xs);
    return r instanceof CellError ? r : fin(r);
  });

const sum = (xs: number[]) => {
  let s = 0;
  for (const x of xs) s += x;
  return s;
};
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : E.DIV);
const sorted = (xs: number[]) => [...xs].sort((x, y) => x - y);
function variance(xs: number[], sample: boolean): number | CellError {
  const n = xs.length;
  if (n < (sample ? 2 : 1)) return E.DIV;
  const m = sum(xs) / n;
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return s / (sample ? n - 1 : n);
}
const stdev = (sample: boolean) => (xs: number[]) => {
  const v = variance(xs, sample);
  return v instanceof CellError ? v : Math.sqrt(v);
};
function percentile(xs: number[], k: number): number | CellError {
  if (!xs.length || k < 0 || k > 1 || Number.isNaN(k)) return E.NUM;
  const s = sorted(xs);
  const pos = k * (s.length - 1);
  const lo = Math.floor(pos);
  return s[lo] + (pos - lo) * ((s[Math.min(lo + 1, s.length - 1)] ?? s[lo]) - s[lo]);
}

/** The numbers of cells or an array (first argument), and a number after them: LARGE(A1:A9, 2), PERCENTILE(…, 0.9). */
const withK = (f: (xs: number[], k: number) => number | CellError): Fn =>
  def(2, 2, (c, a, cx) => {
    const xs = numbersOf(c, [a[0]], cx);
    if (xs instanceof CellError) return xs;
    const k = N(c, a[1], cx);
    if (k instanceof CellError) return k;
    const r = f(xs, k);
    return r instanceof CellError ? r : fin(r);
  });

/** Words with * and ? as a pattern (~ before one of them means the sign itself), whole and in any case. */
function wildcard(p: string): RegExp {
  let re = '';
  for (let i = 0; i < p.length; i++) {
    const ch = p[i];
    if (ch === '~' && i + 1 < p.length && '*?~'.includes(p[i + 1])) re += `\\${p[++i]}`;
    else if (ch === '*') re += '[\\s\\S]*';
    else if (ch === '?') re += '[\\s\\S]';
    else re += ch.replace(/[.+^${}()|[\]\\/]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, 'i');
}

const cmpOp = (op: string, c: number) => (op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : op === '>=' ? c >= 0 : op === '<>' ? c !== 0 : c === 0);

/** A test from a criterion, as COUNTIF and SUMIF take one: 5, ">5", "<>", "app*", "=", TRUE. */
function criterion(crit: Scalar): (v: Scalar) => boolean {
  if (crit instanceof CellError) return (v) => v instanceof CellError && v.code === crit.code;
  const asNum = (v: Scalar): number | null => {
    if (typeof v === 'number') return v;
    if (typeof v !== 'string') return null;
    const t = parseNumberText(v);
    return t && typeof t.v === 'number' ? t.v : null;
  };
  if (typeof crit === 'number') return (v) => typeof v !== 'boolean' && v !== null && near(asNum(v) ?? NaN, crit);
  if (typeof crit === 'boolean') return (v) => v === crit;
  if (crit === null) return (v) => v === null || v === '';
  const m = /^(<=|>=|<>|<|>|=)?([\s\S]*)$/.exec(crit)!;
  const op = m[1] ?? '=';
  const rest = m[2];
  const n = rest.trim() === '' ? null : asNum(rest);
  if (op === '=' || op === '<>') {
    let test: (v: Scalar) => boolean;
    if (rest === '') test = (v) => v === null || v === '';
    else if (n !== null) test = (v) => typeof v !== 'boolean' && v !== null && near(asNum(v) ?? NaN, n);
    else if (/^(true|false)$/i.test(rest)) test = (v) => v === (rest.toLowerCase() === 'true');
    else {
      const re = wildcard(rest);
      test = (v) => typeof v === 'string' && re.test(v);
    }
    return op === '=' ? test : (v) => !test(v);
  }
  if (n !== null) return (v) => typeof v === 'number' && cmpOp(op, compare(v, n));
  return (v) => typeof v === 'string' && cmpOp(op, compare(v, rest));
}

/**
 * Ranges and their criteria (COUNTIFS, SUMIFS…): `f(i, j)` for each place where every criterion holds. Places
 * past what the sheets hold are all blank: they are counted at once (`blank`) rather than visited.
 */
function eachMatch(c: Calc, pairs: [Val, (v: Scalar) => boolean][], f: (i: number, j: number) => void): { blank: number } | CellError {
  const ds = pairs.map(([v]) => c.dims(v));
  const h = ds[0].h;
  const w = ds[0].w;
  if (ds.some((d) => d.h !== h || d.w !== w)) return E.VALUE;
  const hh = Math.max(...ds.map((d) => d.hh));
  const ww = Math.max(...ds.map((d) => d.ww));
  for (let i = 0; i < hh; i++)
    for (let j = 0; j < ww; j++) {
      let ok = true;
      for (let k = 0; k < pairs.length && ok; k++) ok = pairs[k][1](ds[k].get(i, j));
      if (ok) f(i, j);
    }
  const allBlank = pairs.every(([, t]) => t(null));
  return { blank: allBlank ? h * w - hh * ww : 0 };
}

/** COUNTIFS' and SUMIFS' arguments: pairs of a range and its criterion. */
function pairsOf(c: Calc, a: Node[], from: number, cx: Ctx): [Val, (v: Scalar) => boolean][] | CellError {
  if ((a.length - from) % 2 || a.length - from < 2) return E.NA;
  const out: [Val, (v: Scalar) => boolean][] = [];
  for (let i = from; i < a.length; i += 2) {
    const rg = c.ev(a[i], cx);
    if (!isRg(rg) && !isArr(rg)) return E.VALUE;
    out.push([rg, criterion(S(c, a[i + 1], cx))]);
  }
  return out;
}

/** The numbers at the places a SUMIFS-like function picked, from the range of values `v`. */
function picked(c: Calc, a: Node[], cx: Ctx, valuesAt: number, pairsFrom: number): number[] | CellError {
  const v = c.ev(a[valuesAt], cx);
  if (!isRg(v) && !isArr(v)) return E.VALUE;
  const pairs = pairsOf(c, a, pairsFrom, cx);
  if (pairs instanceof CellError) return pairs;
  const d = c.dims(v);
  const out: number[] = [];
  let err: CellError | null = null;
  const r = eachMatch(c, pairs, (i, j) => {
    const x = d.get(i, j);
    if (typeof x === 'number') out.push(x);
    else if (x instanceof CellError) err ??= x;
  });
  if (r instanceof CellError) return r;
  return err ?? out;
}

/** SUMIF's and AVERAGEIF's (range, criterion, [values]) as SUMIFS' (values, range, criterion). */
const ifArgs = (a: Node[]): Node[] => (a.length === 3 && a[2].k !== 'nil' ? [a[2], a[0], a[1]] : [a[0], a[0], a[1]]);

/** Looks for `x` along a row or column of `n` values: exact (wildcards in words), or the closest below (sorted up) or above (sorted down). */
function find(get: (i: number) => Scalar, n: number, x: Scalar, mode: 'exact' | 'below' | 'above', from = 0, step = 1, wild = true): number {
  const re = wild && typeof x === 'string' && /[*?~]/.test(x) ? wildcard(x) : null;
  if (mode === 'exact') {
    for (let i = from; i >= 0 && i < n; i += step) {
      const v = get(i);
      if (re ? typeof v === 'string' && re.test(v) : v !== null && rank(v) === rank(x) && compare(v, x) === 0) return i;
    }
    return -1;
  }
  // Sorted: the last value not past `x` (of the same kind as it).
  let best = -1;
  for (let i = 0; i < n; i++) {
    const v = get(i);
    if (v === null || rank(v) !== rank(x)) continue;
    const c = compare(v, x);
    if (c === 0) return i;
    if (mode === 'below' ? c < 0 : c > 0) best = i;
    else break;
  }
  return best;
}

/** XLOOKUP's and XMATCH's search: exact, exact or the next smaller (-1) or larger (1), or with wildcards (2); from the end with search -1. */
function xfind(get: (i: number) => Scalar, n: number, x: Scalar, mode: number, search: number): number {
  const back = search === -1 || search === -2;
  const order = (i: number) => (back ? n - 1 - i : i);
  let best = -1;
  let bestV: Scalar = null;
  const re = mode === 2 && typeof x === 'string' ? wildcard(x) : null;
  for (let k = 0; k < n; k++) {
    const i = order(k);
    const v = get(i);
    if (re) {
      if (typeof v === 'string' && re.test(v)) return i;
      continue;
    }
    if (v === null || rank(v) !== rank(x)) continue;
    const c = compare(v, x);
    if (c === 0) return i;
    if (mode === -1 && c < 0 && (best < 0 || compare(v, bestV) > 0)) [best, bestV] = [i, v];
    if (mode === 1 && c > 0 && (best < 0 || compare(v, bestV) < 0)) [best, bestV] = [i, v];
  }
  return best;
}

/** A row or column (or cell) of a range or array. */
function slice(c: Calc, v: Val, rowAt: number | null, colAt: number | null): Val {
  if (isRg(v)) {
    const r1 = rowAt === null ? v.r1 : v.r1 + rowAt;
    const c1 = colAt === null ? v.c1 : v.c1 + colAt;
    return { k: 'rg', si: v.si, r1, c1, r2: rowAt === null ? v.r2 : r1, c2: colAt === null ? v.c2 : c1 };
  }
  const a = c.arr(v);
  if (a instanceof CellError) return a;
  if (rowAt !== null && colAt !== null) return a.d[rowAt * a.w + colAt] ?? E.REF;
  if (rowAt !== null) return { k: 'arr', h: 1, w: a.w, d: a.d.slice(rowAt * a.w, rowAt * a.w + a.w) };
  if (colAt !== null) return { k: 'arr', h: a.h, w: 1, d: Array.from({ length: a.h }, (_, i) => a.d[i * a.w + colAt]) };
  return a;
}

function lookup(vertical: boolean): Fn {
  return def(3, 4, (c, a, cx) => {
    const x = S(c, a[0], cx);
    if (x instanceof CellError) return x;
    const t = c.ev(a[1], cx);
    const k = N(c, a[2], cx);
    if (k instanceof CellError) return k;
    const approx = has(a, 3) ? B(c, a[3], cx) : true;
    if (approx instanceof CellError) return approx;
    const d = c.dims(t);
    const idx = Math.trunc(k) - 1;
    if (idx < 0) return E.VALUE;
    if (idx >= (vertical ? d.w : d.h)) return E.REF;
    const n = vertical ? d.hh : d.ww;
    const get = (i: number) => (vertical ? d.get(i, 0) : d.get(0, i));
    const i = find(get, n, x, approx ? 'below' : 'exact');
    return i < 0 ? E.NA : vertical ? d.get(i, idx) : d.get(idx, i);
  });
}

const isNum = (v: Scalar) => typeof v === 'number';

const MATH_FNS: Record<string, Fn> = {
  SUM: agg(sum),
  AVERAGE: agg(mean),
  MIN: agg((xs) => (xs.length ? Math.min(...xs) : 0)),
  MAX: agg((xs) => (xs.length ? Math.max(...xs) : 0)),
  PRODUCT: agg((xs) => (xs.length ? xs.reduce((p, x) => p * x, 1) : 0)),
  MEDIAN: agg((xs) => (xs.length ? percentile(xs, 0.5) : E.NUM)),
  SUMSQ: agg((xs) => sum(xs.map((x) => x * x))),
  STDEV: agg(stdev(true)),
  'STDEV.S': agg(stdev(true)),
  STDEVP: agg(stdev(false)),
  'STDEV.P': agg(stdev(false)),
  VAR: agg((xs) => variance(xs, true)),
  'VAR.S': agg((xs) => variance(xs, true)),
  VARP: agg((xs) => variance(xs, false)),
  'VAR.P': agg((xs) => variance(xs, false)),
  MODE: agg((xs) => {
    const n = new Map<number, number>();
    let best: number | null = null;
    let most = 1;
    for (const x of xs) {
      const k = (n.get(x) ?? 0) + 1;
      n.set(x, k);
      if (k > most) [best, most] = [x, k];
    }
    return best ?? E.NA;
  }),
  LARGE: withK((xs, k) => (k >= 1 && k <= xs.length ? sorted(xs)[xs.length - Math.ceil(k)] : E.NUM)),
  SMALL: withK((xs, k) => (k >= 1 && k <= xs.length ? sorted(xs)[Math.ceil(k) - 1] : E.NUM)),
  PERCENTILE: withK(percentile),
  'PERCENTILE.INC': withK(percentile),
  QUARTILE: withK((xs, q) => (q >= 0 && q <= 4 ? percentile(xs, Math.trunc(q) / 4) : E.NUM)),
  'QUARTILE.INC': withK((xs, q) => (q >= 0 && q <= 4 ? percentile(xs, Math.trunc(q) / 4) : E.NUM)),
  RANK: def(2, 3, (c, a, cx) => {
    const x = N(c, a[0], cx);
    if (x instanceof CellError) return x;
    const xs = numbersOf(c, [a[1]], cx);
    if (xs instanceof CellError) return xs;
    const asc = has(a, 2) ? N(c, a[2], cx) : 0;
    if (asc instanceof CellError) return asc;
    if (!xs.some((y) => near(y, x))) return E.NA;
    return 1 + xs.filter((y) => (asc ? y < x : y > x) && !near(y, x)).length;
  }),
  COUNT: def(1, 255, (c, a, cx) => {
    let n = 0;
    for (const x of a) {
      const v = evA(c, x, cx);
      if (isRg(v) || isArr(v)) c.each(v, (s) => void (isNum(s) && n++));
      else {
        const s = c.sc(v, cx);
        if (isNum(s) || typeof s === 'boolean' || (typeof s === 'string' && !(toNum(s) instanceof CellError))) n++;
      }
    }
    return n;
  }),
  COUNTA: def(1, 255, (c, a, cx) => {
    let n = 0;
    for (const x of a) {
      if (x.k === 'nil') continue;
      const v = evA(c, x, cx);
      if (isRg(v) || isArr(v)) c.each(v, (s) => void (s !== null && n++));
      else n++;
    }
    return n;
  }),
  COUNTBLANK: def(1, 1, (c, a, cx) => {
    const v = c.ev(a[0], cx);
    if (!isRg(v)) return E.VALUE;
    let filled = 0;
    c.each(v, (s) => void (s !== null && s !== '' && filled++));
    return (v.r2 - v.r1 + 1) * (v.c2 - v.c1 + 1) - filled;
  }),
  SUMPRODUCT: def(1, 255, (c, a, cx) => {
    const arrs: Arr[] = [];
    for (const x of a) {
      const v = c.arr(evA(c, x, cx));
      if (v instanceof CellError) return v;
      if (arrs.length && (v.h !== arrs[0].h || v.w !== arrs[0].w)) return E.VALUE;
      arrs.push(v);
    }
    let s = 0;
    for (let i = 0; i < arrs[0].d.length; i++) {
      let p = 1;
      for (const v of arrs) {
        const x = v.d[i];
        if (x instanceof CellError) return x;
        p *= typeof x === 'number' ? x : 0;
      }
      s += p;
    }
    return fin(s);
  }),
  SUMIF: def(2, 3, (c, a, cx) => {
    const xs = picked(c, ifArgs(a), cx, 0, 1);
    return xs instanceof CellError ? xs : fin(sum(xs));
  }),
  SUMIFS: def(3, 255, (c, a, cx) => {
    const xs = picked(c, a, cx, 0, 1);
    return xs instanceof CellError ? xs : fin(sum(xs));
  }),
  AVERAGEIF: def(2, 3, (c, a, cx) => {
    const xs = picked(c, ifArgs(a), cx, 0, 1);
    return xs instanceof CellError ? xs : mean(xs);
  }),
  AVERAGEIFS: def(3, 255, (c, a, cx) => {
    const xs = picked(c, a, cx, 0, 1);
    return xs instanceof CellError ? xs : mean(xs);
  }),
  MAXIFS: def(3, 255, (c, a, cx) => {
    const xs = picked(c, a, cx, 0, 1);
    return xs instanceof CellError ? xs : xs.length ? Math.max(...xs) : 0;
  }),
  MINIFS: def(3, 255, (c, a, cx) => {
    const xs = picked(c, a, cx, 0, 1);
    return xs instanceof CellError ? xs : xs.length ? Math.min(...xs) : 0;
  }),
  COUNTIF: def(2, 2, (c, a, cx) => {
    const pairs = pairsOf(c, a, 0, cx);
    if (pairs instanceof CellError) return pairs;
    let n = 0;
    const r = eachMatch(c, pairs, () => n++);
    return r instanceof CellError ? r : n + r.blank;
  }),
  COUNTIFS: def(2, 254, (c, a, cx) => {
    const pairs = pairsOf(c, a, 0, cx);
    if (pairs instanceof CellError) return pairs;
    let n = 0;
    const r = eachMatch(c, pairs, () => n++);
    return r instanceof CellError ? r : n + r.blank;
  }),
  ROUND: math(2, 2, (x, d) => roundTo(x, d)),
  ROUNDUP: math(2, 2, (x, d) => {
    const k = 10 ** Math.trunc(d);
    const y = Number((Math.abs(x) * k).toPrecision(15));
    return (Math.sign(x) * Math.ceil(y)) / k;
  }),
  ROUNDDOWN: math(2, 2, (x, d) => {
    const k = 10 ** Math.trunc(d);
    const y = Number((Math.abs(x) * k).toPrecision(15));
    return (Math.sign(x) * Math.floor(y)) / k;
  }),
  TRUNC: math(1, 2, (x, d) => {
    const k = 10 ** Math.trunc(Number.isNaN(d) ? 0 : d);
    return Math.trunc(Number((x * k).toPrecision(15))) / k;
  }),
  INT: math(1, 1, (x) => Math.floor(Number(x.toPrecision(15)))),
  ABS: math(1, 1, Math.abs),
  SIGN: math(1, 1, Math.sign),
  SQRT: math(1, 1, (x) => (x < 0 ? E.NUM : Math.sqrt(x))),
  POWER: math(2, 2, (x, y) => (x === 0 && y === 0 ? E.NUM : x === 0 && y < 0 ? E.DIV : x ** y)),
  EXP: math(1, 1, Math.exp),
  LN: math(1, 1, (x) => (x <= 0 ? E.NUM : Math.log(x))),
  LOG10: math(1, 1, (x) => (x <= 0 ? E.NUM : Math.log10(x))),
  LOG: math(1, 2, (x, b) => {
    const base = Number.isNaN(b) ? 10 : b;
    return x <= 0 || base <= 0 || base === 1 ? E.NUM : Math.log(x) / Math.log(base);
  }),
  MOD: math(2, 2, (x, d) => (d === 0 ? E.DIV : x - d * Math.floor(x / d))),
  QUOTIENT: math(2, 2, (x, d) => (d === 0 ? E.DIV : Math.trunc(x / d))),
  PI: def(0, 0, () => Math.PI),
  CEILING: math(1, 2, (x, s) => {
    const sig = Number.isNaN(s) ? 1 : s;
    if (sig === 0) return 0;
    if (x > 0 && sig < 0) return E.NUM;
    return Math.ceil(Number((x / sig).toPrecision(15))) * sig;
  }),
  'CEILING.MATH': math(1, 3, (x, s, mode) => {
    const sig = Math.abs(Number.isNaN(s) ? 1 : s) || 1;
    const away = !Number.isNaN(mode) && mode !== 0 && x < 0;
    return (away ? Math.floor(Number((x / sig).toPrecision(15))) : Math.ceil(Number((x / sig).toPrecision(15)))) * sig;
  }),
  FLOOR: math(1, 2, (x, s) => {
    const sig = Number.isNaN(s) ? 1 : s;
    if (sig === 0) return x === 0 ? 0 : E.DIV;
    if (x > 0 && sig < 0) return E.NUM;
    return Math.floor(Number((x / sig).toPrecision(15))) * sig;
  }),
  'FLOOR.MATH': math(1, 3, (x, s, mode) => {
    const sig = Math.abs(Number.isNaN(s) ? 1 : s) || 1;
    const toward = !Number.isNaN(mode) && mode !== 0 && x < 0;
    return (toward ? Math.ceil(Number((x / sig).toPrecision(15))) : Math.floor(Number((x / sig).toPrecision(15)))) * sig;
  }),
  MROUND: math(2, 2, (x, m) => (m === 0 ? 0 : x * m < 0 ? E.NUM : roundTo(x / m, 0) * m)),
  EVEN: math(1, 1, (x) => Math.sign(x) * Math.ceil(Math.abs(x) / 2) * 2),
  ODD: math(1, 1, (x) => {
    const y = Math.ceil(Math.abs(x));
    return Math.sign(x || 1) * (y % 2 ? y : y + 1);
  }),
  FACT: math(1, 1, (x) => {
    if (x < 0) return E.NUM;
    let p = 1;
    for (let i = 2; i <= Math.trunc(x); i++) p *= i;
    return p;
  }),
  GCD: agg((xs) => {
    if (xs.some((x) => x < 0)) return E.NUM;
    const g = (p: number, q: number): number => (q ? g(q, p % q) : p);
    return xs.map(Math.trunc).reduce((p, x) => g(p, x), 0);
  }),
  LCM: agg((xs) => {
    if (xs.some((x) => x < 0)) return E.NUM;
    const g = (p: number, q: number): number => (q ? g(q, p % q) : p);
    return xs.map(Math.trunc).reduce((p, x) => (p && x ? (p * x) / g(p, x) : 0), 1);
  }),
  SIN: math(1, 1, Math.sin),
  COS: math(1, 1, Math.cos),
  TAN: math(1, 1, Math.tan),
  ASIN: math(1, 1, (x) => (Math.abs(x) > 1 ? E.NUM : Math.asin(x))),
  ACOS: math(1, 1, (x) => (Math.abs(x) > 1 ? E.NUM : Math.acos(x))),
  ATAN: math(1, 1, Math.atan),
  ATAN2: math(2, 2, (x, y) => (x === 0 && y === 0 ? E.DIV : Math.atan2(y, x))),
  DEGREES: math(1, 1, (x) => (x * 180) / Math.PI),
  RADIANS: math(1, 1, (x) => (x * Math.PI) / 180),
  RAND: def(0, 0, (c, _a, cx) => c.rand(cx)),
  RANDBETWEEN: def(2, 2, (c, a, cx) => {
    const lo = N(c, a[0], cx);
    if (lo instanceof CellError) return lo;
    const hi = N(c, a[1], cx);
    if (hi instanceof CellError) return hi;
    const l = Math.ceil(lo);
    const h = Math.floor(hi);
    return h < l ? E.NUM : l + Math.floor(c.rand(cx) * (h - l + 1));
  }),
};

const LOGIC_FNS: Record<string, Fn> = {
  IF: def(1, 3, (c, a, cx) => {
    const cond = c.ev(a[0], cx);
    const pick1 = (b: boolean | CellError): Val => (b instanceof CellError ? b : b ? (has(a, 1) ? c.ev(a[1], cx) : a.length > 1 ? 0 : true) : has(a, 2) ? c.ev(a[2], cx) : a.length > 2 ? 0 : false);
    if (!multi(cond)) return pick1(toBool(c.sc(cond, cx)));
    // A condition on many cells chooses for each of them.
    const yes = c.arr(has(a, 1) ? c.ev(a[1], cx) : 0);
    const no = c.arr(has(a, 2) ? c.ev(a[2], cx) : false);
    const k = c.arr(cond);
    if (k instanceof CellError) return k;
    if (yes instanceof CellError) return yes;
    if (no instanceof CellError) return no;
    return {
      k: 'arr',
      h: k.h,
      w: k.w,
      d: k.d.map((s, i) => {
        const b = toBool(s);
        return b instanceof CellError ? b : pick(b ? yes : no, Math.floor(i / k.w), i % k.w);
      }),
    };
  }),
  IFS: def(2, 254, (c, a, cx) => {
    if (a.length % 2) return E.NA;
    for (let i = 0; i < a.length; i += 2) {
      const b = B(c, a[i], cx);
      if (b instanceof CellError) return b;
      if (b) return c.ev(a[i + 1], cx);
    }
    return E.NA;
  }),
  IFERROR: def(2, 2, (c, a, cx) => {
    const v = c.ev(a[0], cx);
    if (multi(v)) {
      const alt = S(c, a[1], cx);
      return c.lift(v, cx, (s) => (s instanceof CellError ? alt : s));
    }
    const s = c.sc(v, cx);
    return s instanceof CellError ? c.ev(a[1], cx) : v;
  }),
  IFNA: def(2, 2, (c, a, cx) => {
    const v = c.ev(a[0], cx);
    const s = multi(v) ? null : c.sc(v, cx);
    return s instanceof CellError && s.code === '#N/A' ? c.ev(a[1], cx) : v;
  }),
  AND: def(1, 255, (c, a, cx) => logic(c, a, cx, (bs) => bs.every(Boolean))),
  OR: def(1, 255, (c, a, cx) => logic(c, a, cx, (bs) => bs.some(Boolean))),
  XOR: def(1, 255, (c, a, cx) => logic(c, a, cx, (bs) => bs.filter(Boolean).length % 2 === 1)),
  NOT: def(1, 1, (c, a, cx) => {
    const b = B(c, a[0], cx);
    return b instanceof CellError ? b : !b;
  }),
  TRUE: def(0, 0, () => true),
  FALSE: def(0, 0, () => false),
  NA: def(0, 0, () => E.NA),
  SWITCH: def(3, 254, (c, a, cx) => {
    const x = S(c, a[0], cx);
    if (x instanceof CellError) return x;
    let i = 1;
    for (; i + 1 < a.length; i += 2) {
      const v = S(c, a[i], cx);
      if (v instanceof CellError) return v;
      if (v !== null && compare(v, x) === 0 && rank(v) === rank(x)) return c.ev(a[i + 1], cx);
    }
    return i < a.length ? c.ev(a[i], cx) : E.NA;
  }),
  CHOOSE: def(2, 255, (c, a, cx) => {
    const i = N(c, a[0], cx);
    if (i instanceof CellError) return i;
    const k = Math.trunc(i);
    return k < 1 || k >= a.length ? E.VALUE : c.ev(a[k], cx);
  }),
};

/** AND, OR and XOR: the TRUE and FALSE of their arguments (numbers count; words in cells are passed over). */
function logic(c: Calc, a: Node[], cx: Ctx, f: (bs: boolean[]) => boolean): Val {
  const bs: boolean[] = [];
  for (const n of a) {
    const v = evA(c, n, cx);
    if (isRg(v) || isArr(v)) {
      const e = scan(c, v, (s) => {
        if (typeof s === 'boolean') bs.push(s);
        else if (typeof s === 'number') bs.push(s !== 0);
      });
      if (e) return e;
    } else {
      const b = toBool(c.sc(v, cx));
      if (b instanceof CellError) return b;
      bs.push(b);
    }
  }
  return bs.length ? f(bs) : E.VALUE;
}

/** IS… functions: a test of one value. */
const is = (f: (v: Scalar) => boolean): Fn => def(1, 1, (c, a, cx) => f(S(c, a[0], cx)));

const INFO_FNS: Record<string, Fn> = {
  ISBLANK: is((v) => v === null),
  ISNUMBER: is((v) => typeof v === 'number'),
  ISTEXT: is((v) => typeof v === 'string'),
  ISNONTEXT: is((v) => typeof v !== 'string'),
  ISLOGICAL: is((v) => typeof v === 'boolean'),
  ISERROR: is((v) => v instanceof CellError),
  ISERR: is((v) => v instanceof CellError && v.code !== '#N/A'),
  ISNA: is((v) => v instanceof CellError && v.code === '#N/A'),
  ISEVEN: def(1, 1, (c, a, cx) => {
    const x = N(c, a[0], cx);
    return x instanceof CellError ? x : Math.trunc(x) % 2 === 0;
  }),
  ISODD: def(1, 1, (c, a, cx) => {
    const x = N(c, a[0], cx);
    return x instanceof CellError ? x : Math.abs(Math.trunc(x) % 2) === 1;
  }),
  ISREF: def(1, 1, (c, a, cx) => isRg(c.ev(a[0], cx))),
  ISFORMULA: def(1, 1, (c, a, cx) => {
    const v = c.ev(a[0], cx);
    return isRg(v) ? c.cellAt(v.si, v.r1, v.c1)?.f !== undefined : E.VALUE;
  }),
  N: def(1, 1, (c, a, cx) => {
    const v = S(c, a[0], cx);
    return typeof v === 'number' ? v : typeof v === 'boolean' ? Number(v) : v instanceof CellError ? v : 0;
  }),
  T: def(1, 1, (c, a, cx) => {
    const v = S(c, a[0], cx);
    return typeof v === 'string' || v instanceof CellError ? v : '';
  }),
  ROW: def(0, 1, (c, a, cx) => {
    if (!has(a, 0)) return cx.r + 1;
    const v = c.ev(a[0], cx);
    return isRg(v) ? v.r1 + 1 : E.VALUE;
  }),
  COLUMN: def(0, 1, (c, a, cx) => {
    if (!has(a, 0)) return cx.c + 1;
    const v = c.ev(a[0], cx);
    return isRg(v) ? v.c1 + 1 : E.VALUE;
  }),
  ROWS: def(1, 1, (c, a, cx) => c.dims(c.ev(a[0], cx)).h),
  COLUMNS: def(1, 1, (c, a, cx) => c.dims(c.ev(a[0], cx)).w),
};

const LOOKUP_FNS: Record<string, Fn> = {
  VLOOKUP: lookup(true),
  HLOOKUP: lookup(false),
  LOOKUP: def(2, 3, (c, a, cx) => {
    const x = S(c, a[0], cx);
    if (x instanceof CellError) return x;
    const look = c.dims(c.ev(a[1], cx));
    const res = has(a, 2) ? c.dims(c.ev(a[2], cx)) : null;
    const vertical = look.w === 1 || look.h > look.w;
    const n = vertical ? look.hh : look.ww;
    const i = find((k) => (vertical ? look.get(k, 0) : look.get(0, k)), n, x, 'below', 0, 1, false);
    if (i < 0) return E.NA;
    if (!res) return vertical ? look.get(i, look.w - 1) : look.get(look.h - 1, i);
    return res.w === 1 ? res.get(i, 0) : res.get(0, i);
  }),
  MATCH: def(2, 3, (c, a, cx) => {
    const x = S(c, a[0], cx);
    if (x instanceof CellError) return x;
    const d = c.dims(c.ev(a[1], cx));
    if (d.h !== 1 && d.w !== 1) return E.NA;
    const type = has(a, 2) ? N(c, a[2], cx) : 1;
    if (type instanceof CellError) return type;
    const vertical = d.w === 1;
    const get = (i: number) => (vertical ? d.get(i, 0) : d.get(0, i));
    const i = find(get, vertical ? d.hh : d.ww, x, type === 0 ? 'exact' : type > 0 ? 'below' : 'above');
    return i < 0 ? E.NA : i + 1;
  }),
  XMATCH: def(2, 4, (c, a, cx) => {
    const x = S(c, a[0], cx);
    if (x instanceof CellError) return x;
    const d = c.dims(c.ev(a[1], cx));
    if (d.h !== 1 && d.w !== 1) return E.VALUE;
    const mode = opt(c, a, 2, cx, 0);
    const search = opt(c, a, 3, cx, 1);
    if (mode instanceof CellError) return mode;
    if (search instanceof CellError) return search;
    const vertical = d.w === 1;
    const i = xfind((k) => (vertical ? d.get(k, 0) : d.get(0, k)), vertical ? d.hh : d.ww, x, mode, search);
    return i < 0 ? E.NA : i + 1;
  }),
  XLOOKUP: def(3, 6, (c, a, cx) => {
    const x = S(c, a[0], cx);
    if (x instanceof CellError) return x;
    const lv = c.ev(a[1], cx);
    const rv = c.ev(a[2], cx);
    const d = c.dims(lv);
    const r = c.dims(rv);
    if (d.h !== 1 && d.w !== 1) return E.VALUE;
    const vertical = d.w === 1 && !(d.h === 1 && r.h === 1 && r.w > 1);
    if (vertical ? r.h !== d.h : r.w !== d.w) return E.VALUE;
    const mode = opt(c, a, 4, cx, 0);
    const search = opt(c, a, 5, cx, 1);
    if (mode instanceof CellError) return mode;
    if (search instanceof CellError) return search;
    const i = xfind((k) => (vertical ? d.get(k, 0) : d.get(0, k)), vertical ? d.hh : d.ww, x, mode, search);
    if (i < 0) return has(a, 3) ? c.ev(a[3], cx) : E.NA;
    return vertical ? slice(c, rv, i, r.w === 1 ? 0 : null) : slice(c, rv, r.h === 1 ? 0 : null, i);
  }),
  INDEX: def(2, 3, (c, a, cx) => {
    const v = c.ev(a[0], cx);
    const d = c.dims(v);
    let row = has(a, 1) ? N(c, a[1], cx) : 0;
    let col = has(a, 2) ? N(c, a[2], cx) : 0;
    if (row instanceof CellError) return row;
    if (col instanceof CellError) return col;
    // A single row takes its one number as the column.
    if (d.h === 1 && !has(a, 2) && a.length < 3) [row, col] = [1, row];
    row = Math.trunc(row);
    col = Math.trunc(col);
    if (row < 0 || col < 0 || row > d.h || col > d.w) return E.REF;
    if (d.w === 1 && col === 0 && row > 0) col = 1;
    return slice(c, v, row ? row - 1 : null, col ? col - 1 : null);
  }),
  OFFSET: def(3, 5, (c, a, cx) => {
    const v = c.ev(a[0], cx);
    if (!isRg(v)) return E.VALUE;
    const nums = [N(c, a[1], cx), N(c, a[2], cx), has(a, 3) ? N(c, a[3], cx) : v.r2 - v.r1 + 1, has(a, 4) ? N(c, a[4], cx) : v.c2 - v.c1 + 1];
    for (const n of nums) if (n instanceof CellError) return n;
    const [dr, dc, h, w] = (nums as number[]).map(Math.trunc);
    const r1 = v.r1 + dr;
    const c1 = v.c1 + dc;
    if (h < 1 || w < 1 || r1 < 0 || c1 < 0 || r1 + h > MAX_ROWS || c1 + w > MAX_COLS) return E.REF;
    return { k: 'rg', si: v.si, r1, c1, r2: r1 + h - 1, c2: c1 + w - 1 };
  }),
  INDIRECT: def(1, 2, (c, a, cx) => {
    const t = T(c, a[0], cx);
    if (t instanceof CellError) return t;
    const toks = tokenize(t.trim());
    const r = toks[0];
    if (toks.length !== 1 || r.k !== 'ref') return E.REF;
    return c.refVal(r.ref.sheet, r.ref.a, r.ref.b, cx);
  }),
  ADDRESS: def(2, 5, (c, a, cx) => {
    const r = N(c, a[0], cx);
    const col = N(c, a[1], cx);
    const abs = opt(c, a, 2, cx, 1);
    if (r instanceof CellError) return r;
    if (col instanceof CellError) return col;
    if (abs instanceof CellError) return abs;
    if (r < 1 || col < 1 || r > MAX_ROWS || col > MAX_COLS) return E.VALUE;
    const kind = Math.trunc(abs);
    const ref = `${kind === 1 || kind === 3 ? '$' : ''}${colName(Math.trunc(col) - 1)}${kind === 1 || kind === 2 ? '$' : ''}${Math.trunc(r)}`;
    const sheet = has(a, 4) ? T(c, a[4], cx) : '';
    if (sheet instanceof CellError) return sheet;
    return sheet ? `${quoteSheet(sheet)}!${ref}` : ref;
  }),
};

// ---- formulas: words, and number formats as the TEXT function writes them -----------------------------------------

/** A format code's sections (positive; negative; zero; words), split where ; is not in quotes or brackets. */
function sections(code: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch === '"') {
      const j = code.indexOf('"', i + 1);
      const end = j < 0 ? code.length : j + 1;
      cur += code.slice(i, end);
      i = end - 1;
    } else if (ch === '\\' && i + 1 < code.length) cur += code.slice(i, (i += 1) + 1);
    else if (ch === '[') {
      const j = code.indexOf(']', i);
      const end = j < 0 ? code.length : j + 1;
      cur += code.slice(i, end);
      i = end - 1;
    } else if (ch === ';') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** A format code's literal text: quoted words, escaped signs, a currency in brackets ([$€-407]); colours and conditions dropped. */
function literal(s: string): string {
  return s.replace(/"([^"]*)"|\\(.)|\[\$([^\]-]*)[^\]]*\]|\[[^\]]*\]|_.|\*./g, (_m, q, e, cur) => (q !== undefined ? q : e !== undefined ? e : cur !== undefined ? cur : _m[0] === '_' ? ' ' : ''));
}

const DATE_CODE = /(?:^|[^"\\])(?:y|d|h|s|m)/i;
const isDateCode = (sec: string) => {
  const bare = sec.replace(/"[^"]*"|\\.|\[[^\]]*\]/g, '');
  return DATE_CODE.test(bare) && !/[0#?]/.test(bare.replace(/\.0+/, '')) && !/general/i.test(bare);
};

/** A number written by the numeric part of a format code ("#,##0.00", "0%", "0.0E+00", "$#,##0", "0.0,," for millions). */
function numberByCode(sec: string, x: number, neg: boolean): string {
  // Quoted words keep their places but are blanked out while the code's signs are looked for.
  const plain = sec.replace(/"[^"]*"|\\.|\[[^\]]*\]/g, (m) => ' '.repeat(m.length));
  const em = /[eE]([+-])([0#?]+)/.exec(plain);
  const code = em ? sec.slice(0, em.index) : sec;
  const codePlain = em ? plain.slice(0, em.index) : plain;
  const tail = em ? sec.slice(em.index + em[0].length) : '';
  const marks = [...codePlain.matchAll(/[0#?]/g)].map((m) => m.index!);
  if (!marks.length) return (neg ? '-' : '') + literal(sec);
  const first = marks[0];
  let end = marks[marks.length - 1] + 1;
  // Commas right after the digits divide by a thousand each.
  let scale = 0;
  while (codePlain[end] === ',') (scale++, end++);
  const core = codePlain.slice(first, end).replace(/,+$/, '');
  const before = code.slice(0, first);
  const after = code.slice(end) + tail;
  const pct = (codePlain.slice(0, first) + codePlain.slice(end) + (em ? plain.slice(em.index + em[0].length) : '')).split('%').length - 1;
  const v = (x * 100 ** pct) / 1000 ** scale;
  const dot = core.indexOf('.');
  const intPart = dot < 0 ? core : core.slice(0, dot);
  const fracPart = dot < 0 ? '' : core.slice(dot + 1).replace(/[^0#?]/g, '');
  const grouped = /[0#?],+[0#?]/.test(intPart);
  const intMin = (intPart.match(/0/g) ?? []).length;
  const fracMax = fracPart.length;
  const fracMin = fracPart.replace(/[#?]+$/, '').length;
  const fraction = (f: string) => {
    if (fracMax <= fracMin) return f;
    const optional = f.slice(fracMin).replace(/0+$/, '');
    return f.slice(0, fracMin) + optional + fracPart.slice(fracMin + optional.length).replace(/#/g, '').replace(/\?/g, ' ');
  };
  let body: string;
  if (em) {
    const lead = Math.max(1, intMin);
    let exp = v === 0 ? 0 : Math.floor(Math.log10(Math.abs(v))) - (lead - 1);
    let mant = roundTo(Math.abs(v) / 10 ** exp, fracMax);
    if (mant >= 10 ** lead) [mant, exp] = [mant / 10, exp + 1];
    const [mi, mf = ''] = mant.toFixed(fracMax).split('.');
    const frac = fraction(mf);
    body = `${mi.padStart(lead, '0')}${frac ? `.${frac}` : ''}E${exp < 0 ? '-' : em[1] === '+' ? '+' : ''}${String(Math.abs(exp)).padStart(em[2].length, '0')}`;
  } else {
    const r = roundTo(Math.abs(v), fracMax);
    const [i, f = ''] = r.toFixed(fracMax).split('.');
    let int = i === '0' && intMin === 0 ? '' : i.padStart(intMin, '0');
    if (grouped) int = group(int);
    const frac = fraction(f);
    body = int + (dot >= 0 && (frac.length || core.endsWith('.')) ? `.${frac}` : '');
  }
  return `${neg && v !== 0 ? '-' : ''}${literal(before)}${body}${literal(after)}`;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** A date or time written by a format code ("yyyy-mm-dd", "d mmm yyyy", "dddd", "h:mm AM/PM", "[h]:mm"). */
function dateByCode(sec: string, serial: number): string {
  if (serial < 0 || serial >= 2958466) return '#'.repeat(8);
  const p = serialParts(serial);
  type Piece = { t: 'lit'; v: string } | { t: string; n: number };
  const ps: Piece[] = [];
  const re = /"([^"]*)"|\\(.)|\[(h+|m+|s+)\]|\[[^\]]*\]|(am\/pm|a\/p)|(y+|m+|d+|h+|s+)|(\.0+)|([\s\S])/gi;
  for (const m of sec.matchAll(re)) {
    if (m[1] !== undefined) ps.push({ t: 'lit', v: m[1] });
    else if (m[2] !== undefined) ps.push({ t: 'lit', v: m[2] });
    else if (m[3]) ps.push({ t: `[${m[3][0].toLowerCase()}]`, n: m[3].length });
    else if (m[4]) ps.push({ t: 'ampm', n: m[4].length, v: m[4] } as Piece);
    else if (m[5]) ps.push({ t: m[5][0].toLowerCase(), n: m[5].length });
    else if (m[6]) ps.push({ t: 'frac', n: m[6].length - 1 });
    else if (m[7] && !m[0].startsWith('[')) ps.push({ t: 'lit', v: m[7] });
  }
  // m is minutes after an hour or before seconds, else a month.
  const timeAt = (i: number, dir: 1 | -1) => {
    for (let j = i + dir; j >= 0 && j < ps.length; j += dir) {
      const t = ps[j].t;
      if (t === 'lit') continue;
      return dir < 0 ? t === 'h' || t === '[h]' : t === 's' || t === '[s]';
    }
    return false;
  };
  const twelve = ps.some((x) => x.t === 'ampm');
  let out = '';
  ps.forEach((x, i) => {
    if (x.t === 'lit') return void (out += (x as { v: string }).v);
    const n = (x as { n: number }).n;
    switch (x.t) {
      case 'y':
        out += n <= 2 ? pad2(p.y % 100) : String(p.y);
        break;
      case 'm':
        if (n <= 2 && (timeAt(i, -1) || timeAt(i, 1))) out += n === 2 ? pad2(p.mi) : String(p.mi);
        else if (n === 1) out += String(p.m);
        else if (n === 2) out += pad2(p.m);
        else if (n === 3) out += MON3[p.m - 1].replace(/^./, (c) => c.toUpperCase());
        else if (n === 4) out += MONTHS[p.m - 1].replace(/^./, (c) => c.toUpperCase());
        else out += MONTHS[p.m - 1][0].toUpperCase();
        break;
      case 'd':
        out += n === 1 ? String(p.d) : n === 2 ? pad2(p.d) : n === 3 ? DAYS[p.wd].slice(0, 3) : DAYS[p.wd];
        break;
      case 'h': {
        const h = twelve ? p.h % 12 || 12 : p.h;
        out += n >= 2 ? pad2(h) : String(h);
        break;
      }
      case 's':
        out += n >= 2 ? pad2(p.s) : String(p.s);
        break;
      case '[h]':
        out += String(Math.floor(serial * 24)).padStart(n, '0');
        break;
      case '[m]':
        out += String(Math.floor(serial * 1440)).padStart(n, '0');
        break;
      case '[s]':
        out += String(Math.floor(serial * 86400)).padStart(n, '0');
        break;
      case 'frac':
        out += `.${String(Math.round(((serial * 86400) % 1) * 10 ** n)).padStart(n, '0').slice(0, n)}`;
        break;
      case 'ampm': {
        const v = (x as unknown as { v: string }).v;
        const pm = p.h >= 12;
        out += v.length > 3 ? (pm ? 'PM' : 'AM') : pm ? 'P' : 'A';
        if (v[0] === v[0].toLowerCase()) out = out.slice(0, -(v.length > 3 ? 2 : 1)) + out.slice(-(v.length > 3 ? 2 : 1)).toLowerCase();
        break;
      }
    }
  });
  return out;
}

/** A value written by an Excel format code, as the TEXT function writes it. */
export function formatByCode(v: Scalar, code: string): string | CellError {
  if (v instanceof CellError) return v;
  const secs = sections(code);
  if (typeof v === 'string') {
    const s = secs.length >= 4 ? secs[3] : secs.find((x) => x.includes('@'));
    return s === undefined ? v : literal(s.replace(/@/g, '\u0000')).replace(/\u0000/g, v);
  }
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  let x = v ?? 0;
  let sec = secs[0];
  let neg = false;
  if (x < 0 && secs.length >= 2 && secs[1] !== '') [sec, x] = [secs[1], -x];
  else if (x === 0 && secs.length >= 3) sec = secs[2];
  else if (x < 0) [neg, x] = [true, -x];
  if (/general/i.test(sec.replace(/"[^"]*"/g, ''))) return literal(sec.replace(/general/i, () => `"${generalNumber(neg ? -x : x)}"`));
  if (isDateCode(sec)) return dateByCode(sec, neg ? -x : x);
  return numberByCode(sec, x, neg);
}

const TEXT_FNS: Record<string, Fn> = {
  CONCATENATE: def(1, 255, (c, a, cx) => {
    let s = '';
    for (const n of a) {
      const t = T(c, n, cx);
      if (t instanceof CellError) return t;
      s += t;
    }
    return s.slice(0, SHEET_LIMITS.text);
  }),
  CONCAT: def(1, 255, (c, a, cx) => joined(c, a, cx, '', false)),
  TEXTJOIN: def(3, 255, (c, a, cx) => {
    const d = T(c, a[0], cx);
    if (d instanceof CellError) return d;
    const skip = B(c, a[1], cx);
    if (skip instanceof CellError) return skip;
    return joined(c, a.slice(2), cx, d, skip);
  }),
  LEN: def(1, 1, (c, a, cx) => {
    const t = T(c, a[0], cx);
    return t instanceof CellError ? t : t.length;
  }),
  LEFT: def(1, 2, (c, a, cx) => textCut(c, a, cx, (t, n) => t.slice(0, n))),
  RIGHT: def(1, 2, (c, a, cx) => textCut(c, a, cx, (t, n) => (n ? t.slice(-n) : ''))),
  MID: def(3, 3, (c, a, cx) => {
    const t = T(c, a[0], cx);
    const s = N(c, a[1], cx);
    const n = N(c, a[2], cx);
    if (t instanceof CellError) return t;
    if (s instanceof CellError) return s;
    if (n instanceof CellError) return n;
    if (s < 1 || n < 0) return E.VALUE;
    return t.slice(Math.trunc(s) - 1, Math.trunc(s) - 1 + Math.trunc(n));
  }),
  UPPER: textMap((t) => t.toUpperCase()),
  LOWER: textMap((t) => t.toLowerCase()),
  PROPER: textMap((t) => t.toLowerCase().replace(/(^|[^\p{L}\p{N}'])(\p{L})/gu, (_m, p, ch) => p + ch.toUpperCase())),
  TRIM: textMap((t) => t.replace(/ +/g, ' ').trim()),
  CLEAN: textMap((t) => t.replace(/[\u0000-\u001f]/g, '')),
  SUBSTITUTE: def(3, 4, (c, a, cx) => {
    const [t, from, to] = [T(c, a[0], cx), T(c, a[1], cx), T(c, a[2], cx)];
    if (t instanceof CellError) return t;
    if (from instanceof CellError) return from;
    if (to instanceof CellError) return to;
    if (!from) return t;
    if (!has(a, 3)) return t.split(from).join(to).slice(0, SHEET_LIMITS.text);
    const k = N(c, a[3], cx);
    if (k instanceof CellError) return k;
    if (k < 1) return E.VALUE;
    let at = -1;
    for (let i = 0; i < Math.trunc(k); i++) {
      at = t.indexOf(from, at + 1);
      if (at < 0) return t;
    }
    return t.slice(0, at) + to + t.slice(at + from.length);
  }),
  REPLACE: def(4, 4, (c, a, cx) => {
    const t = T(c, a[0], cx);
    const s = N(c, a[1], cx);
    const n = N(c, a[2], cx);
    const w = T(c, a[3], cx);
    if (t instanceof CellError) return t;
    if (s instanceof CellError) return s;
    if (n instanceof CellError) return n;
    if (w instanceof CellError) return w;
    if (s < 1 || n < 0) return E.VALUE;
    return t.slice(0, Math.trunc(s) - 1) + w + t.slice(Math.trunc(s) - 1 + Math.trunc(n));
  }),
  FIND: def(2, 3, (c, a, cx) => textFind(c, a, cx, false)),
  SEARCH: def(2, 3, (c, a, cx) => textFind(c, a, cx, true)),
  REPT: def(2, 2, (c, a, cx) => {
    const t = T(c, a[0], cx);
    const n = N(c, a[1], cx);
    if (t instanceof CellError) return t;
    if (n instanceof CellError) return n;
    if (n < 0 || t.length * Math.trunc(n) > SHEET_LIMITS.text) return E.VALUE;
    return t.repeat(Math.trunc(n));
  }),
  EXACT: def(2, 2, (c, a, cx) => {
    const x = T(c, a[0], cx);
    const y = T(c, a[1], cx);
    return x instanceof CellError ? x : y instanceof CellError ? y : x === y;
  }),
  CODE: def(1, 1, (c, a, cx) => {
    const t = T(c, a[0], cx);
    return t instanceof CellError ? t : t ? t.charCodeAt(0) : E.VALUE;
  }),
  VALUE: def(1, 1, (c, a, cx) => {
    const v = S(c, a[0], cx);
    if (typeof v === 'number' || v instanceof CellError) return v;
    if (v === null) return 0;
    return toNum(String(v));
  }),
  TEXT: def(2, 2, (c, a, cx) => {
    const v = S(c, a[0], cx);
    const f = T(c, a[1], cx);
    if (f instanceof CellError) return f;
    if (typeof v === 'string') {
      const n = parseNumberText(v);
      return formatByCode(n && typeof n.v === 'number' ? n.v : v, f);
    }
    return formatByCode(v, f);
  }),
  FIXED: def(1, 3, (c, a, cx) => {
    const x = N(c, a[0], cx);
    const dp = opt(c, a, 1, cx, 2);
    const plain = has(a, 2) ? B(c, a[2], cx) : false;
    if (x instanceof CellError) return x;
    if (dp instanceof CellError) return dp;
    if (plain instanceof CellError) return plain;
    return dp < 0 ? fixed(roundTo(x, dp), 0, !plain) : fixed(x, Math.trunc(dp), !plain);
  }),
};
/** CHAR: the character of a code. */
TEXT_FNS.CHAR = def(1, 1, (c, a, cx) => {
  const n = N(c, a[0], cx);
  return n instanceof CellError ? n : n < 1 || n > 65535 ? E.VALUE : String.fromCharCode(Math.trunc(n));
});

function textMap(f: (t: string) => string): Fn {
  return def(1, 1, (c, a, cx) => c.lift(c.ev(a[0], cx), cx, (s) => {
    const t = toText(s);
    return t instanceof CellError ? t : f(t);
  }));
}

function textCut(c: Calc, a: Node[], cx: Ctx, f: (t: string, n: number) => string): Val {
  const t = T(c, a[0], cx);
  const n = has(a, 1) ? N(c, a[1], cx) : 1;
  if (t instanceof CellError) return t;
  if (n instanceof CellError) return n;
  return n < 0 ? E.VALUE : f(t, Math.trunc(n));
}

function textFind(c: Calc, a: Node[], cx: Ctx, loose: boolean): Val {
  const what = T(c, a[0], cx);
  const t = T(c, a[1], cx);
  const from = has(a, 2) ? N(c, a[2], cx) : 1;
  if (what instanceof CellError) return what;
  if (t instanceof CellError) return t;
  if (from instanceof CellError) return from;
  const s = Math.trunc(from) - 1;
  if (s < 0 || s > t.length) return E.VALUE;
  if (!loose) {
    const i = t.indexOf(what, s);
    return i < 0 ? E.VALUE : i + 1;
  }
  const re = new RegExp(wildcard(what).source.slice(1, -1), 'i');
  const m = re.exec(t.slice(s));
  return m ? m.index + s + 1 : E.VALUE;
}

/** CONCAT and TEXTJOIN: the words of every value, cells in reading order, joined. */
function joined(c: Calc, a: Node[], cx: Ctx, d: string, skip: boolean): Val {
  const parts: string[] = [];
  for (const n of a) {
    const v = evA(c, n, cx);
    if (isRg(v) || isArr(v)) {
      const e = scan(
        c,
        v,
        (s) => {
          const t = toText(s) as string;
          if (!skip || t !== '') parts.push(t);
        },
        !skip,
      );
      if (e) return e;
    } else {
      const t = toText(c.sc(v, cx));
      if (t instanceof CellError) return t;
      if (!skip || t !== '') parts.push(t);
    }
  }
  const s = parts.join(d);
  return s.length > SHEET_LIMITS.text ? E.VALUE : s;
}

// ---- formulas: dates ------------------------------------------------------------------------------------------

/** A day number from an argument: a number, or a date written as words. */
const dateArg = (c: Calc, n: Node | undefined, cx: Ctx): number | CellError => {
  const v = S(c, n, cx);
  const x = toNum(v);
  if (x instanceof CellError) return x;
  return x < 0 ? E.NUM : x;
};

const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** The day of the week, 0 for Sunday, as Excel counts it from a day number. */
const weekday = (d: number) => (((Math.floor(d) - 1) % 7) + 7) % 7;

function workdays(start: number, end: number, holidays: Set<number>): number {
  const [a, b, sign] = start <= end ? [start, end, 1] : [end, start, -1];
  let n = 0;
  for (let d = Math.floor(a); d <= Math.floor(b); d++) {
    const w = weekday(d);
    if (w !== 0 && w !== 6 && !holidays.has(d)) n++;
  }
  return n * sign;
}

function holidaysOf(c: Calc, n: Node | undefined, cx: Ctx): Set<number> | CellError {
  const out = new Set<number>();
  if (!n || n.k === 'nil') return out;
  const e = scan(c, c.ev(n, cx), (s) => {
    if (typeof s === 'number') out.add(Math.floor(s));
  });
  return e ?? out;
}

const part = (f: (p: ReturnType<typeof serialParts>) => number): Fn =>
  def(1, 1, (c, a, cx) => {
    const d = dateArg(c, a[0], cx);
    return d instanceof CellError ? d : f(serialParts(d));
  });

const DATE_FNS: Record<string, Fn> = {
  TODAY: def(0, 0, (c) => Math.floor(c.now)),
  NOW: def(0, 0, (c) => c.now),
  DATE: def(3, 3, (c, a, cx) => {
    const ns = [N(c, a[0], cx), N(c, a[1], cx), N(c, a[2], cx)];
    for (const n of ns) if (n instanceof CellError) return n;
    let [y, m, d] = (ns as number[]).map(Math.trunc);
    if (y < 0 || y > 9999) return E.NUM;
    // Years before 1900 count from it (DATE(26, 1, 1) is 1926); months and days past their end carry over.
    if (y < 1900) y += 1900;
    const s = dateSerial(y, m, d);
    return s < 0 ? E.NUM : s;
  }),
  TIME: def(3, 3, (c, a, cx) => {
    const ns = [N(c, a[0], cx), N(c, a[1], cx), N(c, a[2], cx)];
    for (const n of ns) if (n instanceof CellError) return n;
    const [h, m, s] = (ns as number[]).map(Math.trunc);
    const secs = h * 3600 + m * 60 + s;
    return secs < 0 ? E.NUM : (secs % 86400) / 86400;
  }),
  YEAR: part((p) => p.y),
  MONTH: part((p) => p.m),
  DAY: part((p) => p.d),
  HOUR: part((p) => p.h),
  MINUTE: part((p) => p.mi),
  SECOND: part((p) => p.s),
  WEEKDAY: def(1, 2, (c, a, cx) => {
    const d = dateArg(c, a[0], cx);
    const type = opt(c, a, 1, cx, 1);
    if (d instanceof CellError) return d;
    if (type instanceof CellError) return type;
    const w = weekday(d);
    const t = Math.trunc(type);
    if (t === 1 || t === 17) return w + 1;
    if (t === 2 || t === 11) return ((w + 6) % 7) + 1;
    if (t === 3) return (w + 6) % 7;
    if (t >= 12 && t <= 16) return ((w + 7 - (t - 10)) % 7) + 1;
    return E.NUM;
  }),
  WEEKNUM: def(1, 2, (c, a, cx) => {
    const d = dateArg(c, a[0], cx);
    const type = opt(c, a, 1, cx, 1);
    if (d instanceof CellError) return d;
    if (type instanceof CellError) return type;
    const t = Math.trunc(type);
    if (t === 21) return isoWeek(d);
    const start = t === 1 || t === 17 ? 0 : t === 2 || t === 11 ? 1 : t >= 12 && t <= 16 ? t - 10 : -1;
    if (start < 0) return E.NUM;
    const jan1 = dateSerial(serialParts(d).y, 1, 1);
    return Math.floor((Math.floor(d) - jan1 + ((weekday(jan1) - start + 7) % 7)) / 7) + 1;
  }),
  ISOWEEKNUM: def(1, 1, (c, a, cx) => {
    const d = dateArg(c, a[0], cx);
    return d instanceof CellError ? d : isoWeek(d);
  }),
  EOMONTH: def(2, 2, (c, a, cx) => {
    const d = dateArg(c, a[0], cx);
    const m = N(c, a[1], cx);
    if (d instanceof CellError) return d;
    if (m instanceof CellError) return m;
    const p = serialParts(d);
    const s = dateSerial(p.y, p.m + Math.trunc(m) + 1, 0);
    return s < 0 ? E.NUM : s;
  }),
  EDATE: def(2, 2, (c, a, cx) => {
    const d = dateArg(c, a[0], cx);
    const m = N(c, a[1], cx);
    if (d instanceof CellError) return d;
    if (m instanceof CellError) return m;
    const p = serialParts(d);
    const total = p.y * 12 + (p.m - 1) + Math.trunc(m);
    const [y, mo] = [Math.floor(total / 12), (total % 12) + 1];
    const s = dateSerial(y, mo, Math.min(p.d, daysIn(y, mo)));
    return s < 0 ? E.NUM : s;
  }),
  DATEDIF: def(3, 3, (c, a, cx) => {
    const s = dateArg(c, a[0], cx);
    const e = dateArg(c, a[1], cx);
    const u = T(c, a[2], cx);
    if (s instanceof CellError) return s;
    if (e instanceof CellError) return e;
    if (u instanceof CellError) return u;
    if (s > e) return E.NUM;
    const p = serialParts(s);
    const q = serialParts(e);
    const months = (q.y - p.y) * 12 + (q.m - p.m) - (q.d < p.d ? 1 : 0);
    switch (u.toUpperCase()) {
      case 'Y':
        return Math.floor(months / 12);
      case 'M':
        return months;
      case 'D':
        return Math.floor(e) - Math.floor(s);
      case 'MD':
        return q.d >= p.d ? q.d - p.d : daysIn(q.m === 1 ? q.y - 1 : q.y, q.m === 1 ? 12 : q.m - 1) - p.d + q.d;
      case 'YM':
        return months % 12;
      case 'YD': {
        let from = dateSerial(q.y, p.m, Math.min(p.d, daysIn(q.y, p.m)));
        if (from > Math.floor(e)) from = dateSerial(q.y - 1, p.m, Math.min(p.d, daysIn(q.y - 1, p.m)));
        return Math.floor(e) - from;
      }
    }
    return E.NUM;
  }),
  DAYS: def(2, 2, (c, a, cx) => {
    const e = dateArg(c, a[0], cx);
    const s = dateArg(c, a[1], cx);
    if (e instanceof CellError) return e;
    if (s instanceof CellError) return s;
    return Math.floor(e) - Math.floor(s);
  }),
  NETWORKDAYS: def(2, 3, (c, a, cx) => {
    const s = dateArg(c, a[0], cx);
    const e = dateArg(c, a[1], cx);
    const hs = holidaysOf(c, a[2], cx);
    if (s instanceof CellError) return s;
    if (e instanceof CellError) return e;
    if (hs instanceof CellError) return hs;
    return Math.abs(e - s) > 400_000 ? E.NUM : workdays(s, e, hs);
  }),
  WORKDAY: def(2, 3, (c, a, cx) => {
    const s = dateArg(c, a[0], cx);
    const n = N(c, a[1], cx);
    const hs = holidaysOf(c, a[2], cx);
    if (s instanceof CellError) return s;
    if (n instanceof CellError) return n;
    if (hs instanceof CellError) return hs;
    let left = Math.trunc(n);
    if (Math.abs(left) > 100_000) return E.NUM;
    const step = left < 0 ? -1 : 1;
    let d = Math.floor(s);
    while (left !== 0) {
      d += step;
      const w = weekday(d);
      if (w !== 0 && w !== 6 && !hs.has(d)) left -= step;
    }
    return d;
  }),
  DATEVALUE: def(1, 1, (c, a, cx) => {
    const t = T(c, a[0], cx);
    if (t instanceof CellError) return t;
    const d = parseDate(t);
    return d === null || d < 1 ? E.VALUE : Math.floor(d);
  }),
  TIMEVALUE: def(1, 1, (c, a, cx) => {
    const t = T(c, a[0], cx);
    if (t instanceof CellError) return t;
    const d = parseDate(t);
    return d === null ? E.VALUE : d - Math.floor(d);
  }),
};

function isoWeek(d: number): number {
  const day = Math.floor(d);
  const mon = (weekday(day) + 6) % 7;
  const thursday = day - mon + 3;
  const y = serialParts(thursday).y;
  return Math.floor((thursday - dateSerial(y, 1, 1)) / 7) + 1;
}

// ---- formulas: money --------------------------------------------------------------------------------------------

const fv = (r: number, n: number, pmt: number, pv: number, t: number) => (r === 0 ? -(pv + pmt * n) : -(pv * (1 + r) ** n + (pmt * (1 + r * t) * ((1 + r) ** n - 1)) / r));
const pmtOf = (r: number, n: number, pv: number, f: number, t: number) => (r === 0 ? -(pv + f) / n : -(r * (f + pv * (1 + r) ** n)) / ((1 + r * t) * ((1 + r) ** n - 1)));

/** A money function of numbers (left-out optional ones are 0). */
const money = (min: number, max: number, f: (...x: number[]) => number | CellError): Fn =>
  def(min, max, (c, a, cx) => {
    const xs: number[] = [];
    for (let i = 0; i < max; i++) {
      const v = has(a, i) ? N(c, a[i], cx) : NaN;
      if (v instanceof CellError) return v;
      xs.push(v);
    }
    const r = f(...xs);
    return r instanceof CellError ? r : fin(r);
  });
const or0 = (x: number) => (Number.isNaN(x) ? 0 : x);

/** Newton's way to the rate where `f` is zero, from `guess`. */
function solve(f: (r: number) => number, guess: number): number | CellError {
  let r = guess;
  for (let i = 0; i < 100; i++) {
    const y = f(r);
    const h = 1e-7 * Math.max(1, Math.abs(r));
    const dy = (f(r + h) - y) / h;
    if (!Number.isFinite(dy) || dy === 0) return E.NUM;
    const next = r - y / dy;
    if (!Number.isFinite(next)) return E.NUM;
    if (Math.abs(next - r) < 1e-10) return next;
    r = next;
  }
  return E.NUM;
}

const MONEY_FNS: Record<string, Fn> = {
  PMT: money(3, 5, (r, n, pv, f, t) => (n === 0 ? E.NUM : pmtOf(r, n, pv, or0(f), or0(t) ? 1 : 0))),
  FV: money(3, 5, (r, n, pmt, pv, t) => fv(r, n, pmt, or0(pv), or0(t) ? 1 : 0)),
  PV: money(3, 5, (r, n, pmt, f, t) => {
    const ty = or0(t) ? 1 : 0;
    return r === 0 ? -(or0(f) + pmt * n) : -(or0(f) + (pmt * (1 + r * ty) * ((1 + r) ** n - 1)) / r) / (1 + r) ** n;
  }),
  NPER: money(3, 5, (r, pmt, pv, f, t) => {
    const ty = or0(t) ? 1 : 0;
    const fv0 = or0(f);
    if (r === 0) return pmt === 0 ? E.NUM : -(pv + fv0) / pmt;
    const x = (pmt * (1 + r * ty) - fv0 * r) / (pmt * (1 + r * ty) + pv * r);
    return x <= 0 ? E.NUM : Math.log(x) / Math.log(1 + r);
  }),
  RATE: money(3, 6, (n, pmt, pv, f, t, g) => {
    const ty = or0(t) ? 1 : 0;
    const fv0 = or0(f);
    return solve((r) => (Math.abs(r) < 1e-12 ? pv + pmt * n + fv0 : pv * (1 + r) ** n + (pmt * (1 + r * ty) * ((1 + r) ** n - 1)) / r + fv0), Number.isNaN(g) ? 0.1 : g);
  }),
  IPMT: money(4, 6, (r, per, n, pv, f, t) => {
    const ty = or0(t) ? 1 : 0;
    if (per < 1 || per > n) return E.NUM;
    const pmt = pmtOf(r, n, pv, or0(f), ty);
    if (ty === 1) return per === 1 ? 0 : (fv(r, per - 2, pmt, pv, 1) - pmt) * r;
    return fv(r, per - 1, pmt, pv, 0) * r;
  }),
  PPMT: money(4, 6, (r, per, n, pv, f, t) => {
    const ty = or0(t) ? 1 : 0;
    if (per < 1 || per > n) return E.NUM;
    const pmt = pmtOf(r, n, pv, or0(f), ty);
    const ip = ty === 1 ? (per === 1 ? 0 : (fv(r, per - 2, pmt, pv, 1) - pmt) * r) : fv(r, per - 1, pmt, pv, 0) * r;
    return pmt - ip;
  }),
  NPV: def(2, 255, (c, a, cx) => {
    const r = N(c, a[0], cx);
    if (r instanceof CellError) return r;
    const xs = numbersOf(c, a.slice(1), cx);
    if (xs instanceof CellError) return xs;
    return fin(xs.reduce((s, x, i) => s + x / (1 + r) ** (i + 1), 0));
  }),
  IRR: def(1, 2, (c, a, cx) => {
    const xs = numbersOf(c, [a[0]], cx);
    if (xs instanceof CellError) return xs;
    const g = opt(c, a, 1, cx, 0.1);
    if (g instanceof CellError) return g;
    if (!xs.some((x) => x > 0) || !xs.some((x) => x < 0)) return E.NUM;
    return solve((r) => xs.reduce((s, x, i) => s + x / (1 + r) ** i, 0), g);
  }),
};

// ---- formulas: arrays that spill ------------------------------------------------------------------------------------

/** Values in sort order: numbers, words, TRUE and FALSE (as compare puts them), blanks last. */
const sortCmp = (a: Scalar, b: Scalar) => {
  const blank = (v: Scalar) => v === null || v === '';
  if (blank(a) || blank(b)) return blank(a) === blank(b) ? 0 : blank(a) ? 1 : -1;
  return compare(a, b);
};

/** An array's rows (or columns, `byCol`) as lists of values. */
const linesOf = (a: Arr, byCol: boolean): Scalar[][] => (byCol ? Array.from({ length: a.w }, (_, j) => Array.from({ length: a.h }, (_, i) => a.d[i * a.w + j])) : Array.from({ length: a.h }, (_, i) => a.d.slice(i * a.w, (i + 1) * a.w)));
/** Lists of values back as an array's rows (or columns). */
const fromLines = (lines: Scalar[][], byCol: boolean): Arr => {
  const n = lines.length;
  const m = lines[0]?.length ?? 0;
  if (!byCol) return { k: 'arr', h: n, w: m, d: lines.flat() };
  const d: Scalar[] = new Array(n * m);
  for (let j = 0; j < n; j++) for (let i = 0; i < m; i++) d[i * n + j] = lines[j][i];
  return { k: 'arr', h: m, w: n, d };
};

const ARRAY_FNS: Record<string, Fn> = {
  SEQUENCE: def(1, 4, (c, a, cx) => {
    const nums = [N(c, a[0], cx), opt(c, a, 1, cx, 1), opt(c, a, 2, cx, 1), opt(c, a, 3, cx, 1)];
    for (const n of nums) if (n instanceof CellError) return n;
    const [rows, cols, start, step] = nums as number[];
    const h = Math.trunc(rows);
    const w = Math.trunc(cols);
    if (h < 1 || w < 1) return E.VALUE;
    if (h * w > MAX_ARRAY) return E.NUM;
    return { k: 'arr', h, w, d: Array.from({ length: h * w }, (_, i) => fin(start + step * i) as Scalar) };
  }),
  FILTER: def(2, 3, (c, a, cx) => {
    const src = c.arr(evA(c, a[0], cx));
    if (src instanceof CellError) return src;
    const inc = c.arr(evA(c, a[1], cx));
    if (inc instanceof CellError) return inc;
    // Which rows (a column of tests as tall as the array) or columns (a row of them as wide) stay.
    const byCol = !(inc.w === 1 && inc.h === src.h) && inc.h === 1 && inc.w === src.w;
    if (!byCol && !(inc.w === 1 && inc.h === src.h)) return E.VALUE;
    const lines = linesOf(src, byCol);
    const kept: Scalar[][] = [];
    for (let i = 0; i < lines.length; i++) {
      const b = toBool(inc.d[i]);
      if (b instanceof CellError) return b;
      if (b) kept.push(lines[i]);
    }
    if (!kept.length) return has(a, 2) ? c.ev(a[2], cx) : E.NA;
    return fromLines(kept, byCol);
  }),
  SORT: def(1, 4, (c, a, cx) => {
    const src = c.arr(evA(c, a[0], cx));
    if (src instanceof CellError) return src;
    const idx = opt(c, a, 1, cx, 1);
    const order = opt(c, a, 2, cx, 1);
    const byCol = has(a, 3) ? B(c, a[3], cx) : false;
    if (idx instanceof CellError) return idx;
    if (order instanceof CellError) return order;
    if (byCol instanceof CellError) return byCol;
    const lines = linesOf(src, byCol);
    const k = Math.trunc(idx) - 1;
    if (k < 0 || k >= (lines[0]?.length ?? 0) || (order !== 1 && order !== -1)) return E.VALUE;
    const sorted = lines.map((l, i) => [l, i] as const).sort((x, y) => sortCmp(x[0][k], y[0][k]) * (x[0][k] === null || y[0][k] === null ? 1 : order) || x[1] - y[1]);
    return fromLines(
      sorted.map((x) => x[0]),
      byCol,
    );
  }),
  SORTBY: def(2, 255, (c, a, cx) => {
    const src = c.arr(evA(c, a[0], cx));
    if (src instanceof CellError) return src;
    const keys: { v: Arr; order: number }[] = [];
    for (let i = 1; i < a.length; i += 2) {
      const v = c.arr(evA(c, a[i], cx));
      if (v instanceof CellError) return v;
      if (v.h * v.w !== src.h) return E.VALUE;
      const order = opt(c, a, i + 1, cx, 1);
      if (order instanceof CellError) return order;
      keys.push({ v, order });
    }
    const lines = linesOf(src, false);
    const order = lines
      .map((_, i) => i)
      .sort((x, y) => {
        for (const k of keys) {
          const d = sortCmp(k.v.d[x], k.v.d[y]);
          if (d) return d * (k.v.d[x] === null || k.v.d[y] === null ? 1 : k.order);
        }
        return x - y;
      });
    return fromLines(
      order.map((i) => lines[i]),
      false,
    );
  }),
  UNIQUE: def(1, 3, (c, a, cx) => {
    const src = c.arr(evA(c, a[0], cx));
    if (src instanceof CellError) return src;
    const byCol = has(a, 1) ? B(c, a[1], cx) : false;
    const once = has(a, 2) ? B(c, a[2], cx) : false;
    if (byCol instanceof CellError) return byCol;
    if (once instanceof CellError) return once;
    const lines = linesOf(src, byCol);
    const key = (l: Scalar[]) => l.map((v) => (typeof v === 'string' ? `s${v.toLowerCase()}` : `${typeof v}${String(v)}`)).join('\u0001');
    const counts = new Map<string, number>();
    for (const l of lines) counts.set(key(l), (counts.get(key(l)) ?? 0) + 1);
    const seen = new Set<string>();
    const kept = lines.filter((l) => {
      const k = key(l);
      if (seen.has(k)) return false;
      seen.add(k);
      return !once || counts.get(k) === 1;
    });
    return kept.length ? fromLines(kept, byCol) : E.NA;
  }),
};

// ---- formulas: LET, LAMBDA and the functions that call one ----------------------------------------------------------

/** A name LET or LAMBDA gives (x, total, _xlpm.x as files write them), lower case; null when it is no such name. */
const paramName = (n: Node | undefined): string | null => {
  if (n?.k !== 'name') return null;
  const v = n.v.replace(/^_xlpm\./i, '');
  return /^[A-Za-z_\p{L}][\p{L}\p{N}_.]{0,254}$/u.test(v) && !/^[A-Za-z]{1,3}\d+$/.test(v) ? v.toLowerCase() : null;
};

/** An argument that must be a LAMBDA. */
const lamArg = (c: Calc, n: Node | undefined, cx: Ctx): Lam | CellError => {
  if (!n) return E.VALUE;
  const v = c.ev(n, cx);
  return isLam(v) ? v : v instanceof CellError ? v : E.VALUE;
};

/** What a LAMBDA gives for one place of an array: one value (an array there is #CALC!, as Excel has nested arrays). */
const oneOf = (c: Calc, v: Val, cx: Ctx): Scalar => (multi(v) ? E.CALC : c.sc(v, cx));

/** The values of an array argument, worked out as an array. */
const arrArg = (c: Calc, n: Node, cx: Ctx): Arr | CellError => c.arr(evA(c, n, cx));

const LAMBDA_FNS: Record<string, Fn> = {
  LET: def(3, 253, (c, a, cx) => {
    if (a.length % 2 === 0) return E.VALUE;
    const saved = cx.env;
    const env = new Map(saved ?? []);
    cx.env = env;
    try {
      for (let i = 0; i + 1 < a.length; i += 2) {
        const name = paramName(a[i]);
        if (!name) return E.VALUE;
        env.set(name, c.ev(a[i + 1], cx));
        env.delete(omitKey(name));
      }
      return c.ev(a[a.length - 1], cx);
    } finally {
      cx.env = saved;
    }
  }),
  LAMBDA: def(1, 254, (_c, a, cx) => {
    const params: string[] = [];
    for (let i = 0; i < a.length - 1; i++) {
      const p = paramName(a[i]);
      if (!p || params.includes(p)) return E.VALUE;
      params.push(p);
    }
    return { k: 'lam', params, body: a[a.length - 1], env: cx.env };
  }),
  ISOMITTED: def(1, 1, (_c, a, cx) => {
    const p = paramName(a[0]);
    return !!p && cx.env?.get(omitKey(p)) === true;
  }),
  MAP: def(2, 254, (c, a, cx) => {
    const lam = lamArg(c, a[a.length - 1], cx);
    if (lam instanceof CellError) return lam;
    const arrays: Arr[] = [];
    for (let i = 0; i < a.length - 1; i++) {
      const v = arrArg(c, a[i], cx);
      if (v instanceof CellError) return v;
      arrays.push(v);
    }
    if (lam.params.length !== arrays.length) return E.VALUE;
    const h = Math.max(...arrays.map((x) => x.h));
    const w = Math.max(...arrays.map((x) => x.w));
    if (h * w > MAX_ARRAY) return E.NUM;
    const d: Scalar[] = new Array(h * w);
    for (let i = 0; i < h; i++)
      for (let j = 0; j < w; j++)
        d[i * w + j] = oneOf(
          c,
          c.call(
            lam,
            arrays.map((x) => pick(x, i, j)),
            cx,
          ),
          cx,
        );
    return { k: 'arr', h, w, d };
  }),
  REDUCE: def(2, 3, (c, a, cx) => {
    const [i0, ia, il] = a.length === 3 ? [a[0], a[1], a[2]] : [null, a[0], a[1]];
    const lam = lamArg(c, il, cx);
    if (lam instanceof CellError) return lam;
    if (lam.params.length !== 2) return E.VALUE;
    const src = arrArg(c, ia, cx);
    if (src instanceof CellError) return src;
    let acc: Val = i0 && i0.k !== 'nil' ? c.ev(i0, cx) : null;
    for (const x of src.d) acc = c.call(lam, [acc, x], cx);
    return acc;
  }),
  SCAN: def(2, 3, (c, a, cx) => {
    const [i0, ia, il] = a.length === 3 ? [a[0], a[1], a[2]] : [null, a[0], a[1]];
    const lam = lamArg(c, il, cx);
    if (lam instanceof CellError) return lam;
    if (lam.params.length !== 2) return E.VALUE;
    const src = arrArg(c, ia, cx);
    if (src instanceof CellError) return src;
    let acc: Val = i0 && i0.k !== 'nil' ? c.ev(i0, cx) : null;
    const d = src.d.map((x) => {
      acc = c.call(lam, [acc, x], cx);
      return oneOf(c, acc, cx);
    });
    return { k: 'arr', h: src.h, w: src.w, d };
  }),
  BYROW: def(2, 2, (c, a, cx) => {
    const src = arrArg(c, a[0], cx);
    if (src instanceof CellError) return src;
    const lam = lamArg(c, a[1], cx);
    if (lam instanceof CellError) return lam;
    if (lam.params.length !== 1) return E.VALUE;
    const d = linesOf(src, false).map((l) => oneOf(c, c.call(lam, [{ k: 'arr', h: 1, w: l.length, d: l }], cx), cx));
    return { k: 'arr', h: d.length, w: 1, d };
  }),
  BYCOL: def(2, 2, (c, a, cx) => {
    const src = arrArg(c, a[0], cx);
    if (src instanceof CellError) return src;
    const lam = lamArg(c, a[1], cx);
    if (lam instanceof CellError) return lam;
    if (lam.params.length !== 1) return E.VALUE;
    const d = linesOf(src, true).map((l) => oneOf(c, c.call(lam, [{ k: 'arr', h: l.length, w: 1, d: l }], cx), cx));
    return { k: 'arr', h: 1, w: d.length, d };
  }),
  MAKEARRAY: def(3, 3, (c, a, cx) => {
    const rows = N(c, a[0], cx);
    const cols = N(c, a[1], cx);
    if (rows instanceof CellError) return rows;
    if (cols instanceof CellError) return cols;
    const lam = lamArg(c, a[2], cx);
    if (lam instanceof CellError) return lam;
    const h = Math.trunc(rows);
    const w = Math.trunc(cols);
    if (h < 1 || w < 1 || lam.params.length !== 2) return E.VALUE;
    if (h * w > MAX_ARRAY) return E.NUM;
    const d: Scalar[] = new Array(h * w);
    for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) d[i * w + j] = oneOf(c, c.call(lam, [i + 1, j + 1], cx), cx);
    return { k: 'arr', h, w, d };
  }),
};

// ---- formulas: more arrays (stacking, taking, wrapping) ----------------------------------------------------------------

/** How many rows or columns to take or drop: a number, negative from the end; null when left out. */
const countArg = (c: Calc, a: Node[], i: number, cx: Ctx): number | null | CellError => {
  if (!has(a, i)) return null;
  const n = N(c, a[i], cx);
  return n instanceof CellError ? n : Math.trunc(n);
};

/** Places picked from a line of `n`: numbers from 1 (negative from the end), each a number or an array of them. */
function placesOf(c: Calc, a: Node[], from: number, cx: Ctx, n: number): number[] | CellError {
  const out: number[] = [];
  for (let i = from; i < a.length; i++) {
    const v = arrArg(c, a[i], cx);
    if (v instanceof CellError) return v;
    for (const x of v.d) {
      const k = toNum(x);
      if (k instanceof CellError) return k;
      const t = Math.trunc(k);
      if (t === 0 || Math.abs(t) > n) return E.VALUE;
      out.push(t > 0 ? t - 1 : n + t);
    }
  }
  return out.length ? out : E.VALUE;
}

/** A pad value (#N/A when left out). */
const padArg = (c: Calc, a: Node[], i: number, cx: Ctx): Scalar => (has(a, i) ? S(c, a[i], cx) : E.NA);

const ARRAY2_FNS: Record<string, Fn> = {
  ARRAYFORMULA: def(1, 1, (c, a, cx) => evA(c, a[0], cx)),
  TRANSPOSE: def(1, 1, (c, a, cx) => {
    const src = arrArg(c, a[0], cx);
    if (src instanceof CellError) return src;
    const d: Scalar[] = new Array(src.h * src.w);
    for (let i = 0; i < src.h; i++) for (let j = 0; j < src.w; j++) d[j * src.h + i] = src.d[i * src.w + j];
    return { k: 'arr', h: src.w, w: src.h, d };
  }),
  VSTACK: def(1, 254, (c, a, cx) => {
    const list: Arr[] = [];
    for (const n of a) {
      const v = arrArg(c, n, cx);
      if (v instanceof CellError) return v;
      list.push(v);
    }
    const w = Math.max(...list.map((x) => x.w));
    const h = list.reduce((s, x) => s + x.h, 0);
    if (h * w > MAX_ARRAY) return E.NUM;
    const d: Scalar[] = [];
    for (const x of list) for (let i = 0; i < x.h; i++) for (let j = 0; j < w; j++) d.push(j < x.w ? x.d[i * x.w + j] : E.NA);
    return { k: 'arr', h, w, d };
  }),
  HSTACK: def(1, 254, (c, a, cx) => {
    const list: Arr[] = [];
    for (const n of a) {
      const v = arrArg(c, n, cx);
      if (v instanceof CellError) return v;
      list.push(v);
    }
    const h = Math.max(...list.map((x) => x.h));
    const w = list.reduce((s, x) => s + x.w, 0);
    if (h * w > MAX_ARRAY) return E.NUM;
    const d: Scalar[] = [];
    for (let i = 0; i < h; i++) for (const x of list) for (let j = 0; j < x.w; j++) d.push(i < x.h ? x.d[i * x.w + j] : E.NA);
    return { k: 'arr', h, w, d };
  }),
  TAKE: def(2, 3, (c, a, cx) => takeDrop(c, a, cx, true)),
  DROP: def(2, 3, (c, a, cx) => takeDrop(c, a, cx, false)),
  CHOOSECOLS: def(2, 254, (c, a, cx) => {
    const src = arrArg(c, a[0], cx);
    if (src instanceof CellError) return src;
    const cols = placesOf(c, a, 1, cx, src.w);
    if (cols instanceof CellError) return cols;
    const d: Scalar[] = [];
    for (let i = 0; i < src.h; i++) for (const j of cols) d.push(src.d[i * src.w + j]);
    return { k: 'arr', h: src.h, w: cols.length, d };
  }),
  CHOOSEROWS: def(2, 254, (c, a, cx) => {
    const src = arrArg(c, a[0], cx);
    if (src instanceof CellError) return src;
    const rows = placesOf(c, a, 1, cx, src.h);
    if (rows instanceof CellError) return rows;
    const d: Scalar[] = [];
    for (const i of rows) for (let j = 0; j < src.w; j++) d.push(src.d[i * src.w + j]);
    return { k: 'arr', h: rows.length, w: src.w, d };
  }),
  TOCOL: def(1, 3, (c, a, cx) => toLine(c, a, cx, true)),
  TOROW: def(1, 3, (c, a, cx) => toLine(c, a, cx, false)),
  WRAPROWS: def(2, 3, (c, a, cx) => wrapLine(c, a, cx, true)),
  WRAPCOLS: def(2, 3, (c, a, cx) => wrapLine(c, a, cx, false)),
  EXPAND: def(2, 4, (c, a, cx) => {
    const src = arrArg(c, a[0], cx);
    if (src instanceof CellError) return src;
    const rows = countArg(c, a, 1, cx);
    const cols = countArg(c, a, 2, cx);
    if (rows instanceof CellError) return rows;
    if (cols instanceof CellError) return cols;
    const h = rows ?? src.h;
    const w = cols ?? src.w;
    if (h < src.h || w < src.w) return E.VALUE;
    if (h * w > MAX_ARRAY) return E.NUM;
    const pad = padArg(c, a, 3, cx);
    const d: Scalar[] = new Array(h * w);
    for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) d[i * w + j] = i < src.h && j < src.w ? src.d[i * src.w + j] : pad;
    return { k: 'arr', h, w, d };
  }),
  RANDARRAY: def(0, 5, (c, a, cx) => {
    const nums = [opt(c, a, 0, cx, 1), opt(c, a, 1, cx, 1), opt(c, a, 2, cx, 0), opt(c, a, 3, cx, 1)];
    for (const n of nums) if (n instanceof CellError) return n;
    const whole = has(a, 4) ? B(c, a[4], cx) : false;
    if (whole instanceof CellError) return whole;
    const [rows, cols, lo, hi] = nums as number[];
    const h = Math.trunc(rows);
    const w = Math.trunc(cols);
    if (h < 1 || w < 1 || lo > hi) return E.VALUE;
    if (h * w > MAX_ARRAY) return E.NUM;
    const d: Scalar[] = Array.from({ length: h * w }, () => (whole ? Math.ceil(lo) + Math.floor(c.rand(cx) * (Math.floor(hi) - Math.ceil(lo) + 1)) : lo + c.rand(cx) * (hi - lo)));
    return { k: 'arr', h, w, d };
  }),
  MMULT: def(2, 2, (c, a, cx) => {
    const x = arrArg(c, a[0], cx);
    const y = arrArg(c, a[1], cx);
    if (x instanceof CellError) return x;
    if (y instanceof CellError) return y;
    if (x.w !== y.h) return E.VALUE;
    const d: Scalar[] = [];
    for (let i = 0; i < x.h; i++)
      for (let j = 0; j < y.w; j++) {
        let s = 0;
        for (let k = 0; k < x.w; k++) {
          const p = x.d[i * x.w + k];
          const q = y.d[k * y.w + j];
          if (typeof p !== 'number' || typeof q !== 'number') return p instanceof CellError ? p : q instanceof CellError ? q : E.VALUE;
          s += p * q;
        }
        d.push(fin(s));
      }
    return { k: 'arr', h: x.h, w: y.w, d };
  }),
  FREQUENCY: def(2, 2, (c, a, cx) => {
    const xs = numbersOf(c, [a[0]], cx);
    const bins = numbersOf(c, [a[1]], cx);
    if (xs instanceof CellError) return xs;
    if (bins instanceof CellError) return bins;
    const order = bins.map((b, i) => [b, i] as const).sort((p, q) => p[0] - q[0]);
    const counts = new Array(bins.length + 1).fill(0);
    for (const x of xs) {
      const k = order.find(([b]) => x <= b);
      counts[k ? k[1] : bins.length]++;
    }
    return { k: 'arr', h: counts.length, w: 1, d: counts };
  }),
};

function takeDrop(c: Calc, a: Node[], cx: Ctx, take: boolean): Val {
  const src = arrArg(c, a[0], cx);
  if (src instanceof CellError) return src;
  const rows = countArg(c, a, 1, cx);
  const cols = countArg(c, a, 2, cx);
  if (rows instanceof CellError) return rows;
  if (cols instanceof CellError) return cols;
  // The rows (columns) kept: the first or last n of them (take), or all but those (drop).
  const span = (n: number | null, len: number): [number, number] => {
    if (n === null) return [0, len];
    const k = Math.min(Math.abs(n), len);
    if (take) return n >= 0 ? [0, k] : [len - k, len];
    return n >= 0 ? [k, len] : [0, len - k];
  };
  if ((take && (rows === 0 || cols === 0)) || (rows === null && cols === null)) return E.CALC;
  const [r1, r2] = span(rows, src.h);
  const [c1, c2] = span(cols, src.w);
  if (r2 <= r1 || c2 <= c1) return E.CALC;
  const d: Scalar[] = [];
  for (let i = r1; i < r2; i++) for (let j = c1; j < c2; j++) d.push(src.d[i * src.w + j]);
  return { k: 'arr', h: r2 - r1, w: c2 - c1, d };
}

/** TOCOL and TOROW: an array's values in one column (or row), blanks or errors left out as asked, by rows or by columns. */
function toLine(c: Calc, a: Node[], cx: Ctx, col: boolean): Val {
  const src = arrArg(c, a[0], cx);
  if (src instanceof CellError) return src;
  const ignore = opt(c, a, 1, cx, 0);
  const byCol = has(a, 2) ? B(c, a[2], cx) : false;
  if (ignore instanceof CellError) return ignore;
  if (byCol instanceof CellError) return byCol;
  const k = Math.trunc(ignore);
  if (k < 0 || k > 3) return E.VALUE;
  const d = linesOf(src, byCol)
    .flat()
    .filter((v) => !((k & 1 && (v === null || v === '')) || (k & 2 && v instanceof CellError)));
  if (!d.length) return E.CALC;
  return col ? { k: 'arr', h: d.length, w: 1, d } : { k: 'arr', h: 1, w: d.length, d };
}

/** WRAPROWS and WRAPCOLS: a row or column of values into rows (columns) of `count`, the last padded. */
function wrapLine(c: Calc, a: Node[], cx: Ctx, rows: boolean): Val {
  const src = arrArg(c, a[0], cx);
  if (src instanceof CellError) return src;
  if (src.h > 1 && src.w > 1) return E.VALUE;
  const n = N(c, a[1], cx);
  if (n instanceof CellError) return n;
  const k = Math.trunc(n);
  if (k < 1) return E.NUM;
  const pad = padArg(c, a, 2, cx);
  const lines = Math.ceil(src.d.length / k);
  const d: Scalar[] = new Array(lines * k);
  for (let i = 0; i < lines; i++)
    for (let j = 0; j < k; j++) {
      const v = src.d[i * k + j];
      const at = rows ? i * k + j : j * lines + i;
      d[at] = v === undefined ? pad : v;
    }
  return rows ? { k: 'arr', h: lines, w: k, d } : { k: 'arr', h: k, w: lines, d };
}

// ---- formulas: words split and joined, regular expressions ------------------------------------------------------------

/** Words from an argument that may be several (TEXTSPLIT's and TEXTBEFORE's delimiters: "," or {",",";"}). */
function wordsArg(c: Calc, n: Node | undefined, cx: Ctx): string[] | CellError {
  if (!n || n.k === 'nil') return [];
  const v = c.arr(c.ev(n, cx));
  if (v instanceof CellError) return v;
  const out: string[] = [];
  for (const x of v.d) {
    const t = toText(x);
    if (t instanceof CellError) return t;
    out.push(t);
  }
  return out;
}

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
/** A pattern matching any of some words, the longest first (so "--" goes before "-"). */
const anyOf = (words: string[], ci: boolean) => new RegExp([...words].filter((w) => w !== '').sort((x, y) => y.length - x.length).map(escRe).join('|') || '(?!)', ci ? 'gi' : 'g');

/** A regular expression from a formula's pattern (a leading (?i) makes it ignore case); #VALUE! when it cannot be read. */
function regexOf(pattern: string, flags: string): RegExp | CellError {
  let p = pattern;
  let f = flags;
  if (/^\(\?i\)/.test(p)) {
    p = p.slice(4);
    if (!f.includes('i')) f += 'i';
  }
  try {
    return new RegExp(p, `${f}u`);
  } catch {
    try {
      return new RegExp(p, f);
    } catch {
      return E.VALUE;
    }
  }
}

/** TEXTBEFORE and TEXTAFTER: the words before (after) the n-th delimiter, from the end when n is negative. */
function textAround(c: Calc, a: Node[], cx: Ctx, before: boolean): Val {
  const t = T(c, a[0], cx);
  if (t instanceof CellError) return t;
  const ds = wordsArg(c, a[1], cx);
  if (ds instanceof CellError) return ds;
  const inst = opt(c, a, 2, cx, 1);
  const mode = opt(c, a, 3, cx, 0);
  const end = opt(c, a, 4, cx, 0);
  for (const n of [inst, mode, end]) if (n instanceof CellError) return n;
  const k = Math.trunc(inst as number);
  if (k === 0 || Math.abs(k) > t.length + 1) return E.VALUE;
  const notFound = () => (has(a, 5) ? c.ev(a[5], cx) : E.NA);
  if (ds.some((d) => d === '')) return before ? (k > 0 ? '' : t) : k > 0 ? t : '';
  const re = anyOf(ds, mode === 1);
  const hits = [...t.matchAll(re)].map((m) => [m.index!, m.index! + m[0].length] as const);
  if (end) hits.push([t.length, t.length]);
  if (end && k < 0) hits.unshift([0, 0]);
  const at = k > 0 ? hits[k - 1] : hits[hits.length + k];
  if (!at) return notFound();
  return before ? t.slice(0, at[0]) : t.slice(at[1]);
}

const TEXT2_FNS: Record<string, Fn> = {
  TEXTSPLIT: def(2, 6, (c, a, cx) => {
    const t = T(c, a[0], cx);
    if (t instanceof CellError) return t;
    const cols = wordsArg(c, a[1], cx);
    const rows = wordsArg(c, a[2], cx);
    if (cols instanceof CellError) return cols;
    if (rows instanceof CellError) return rows;
    const skip = has(a, 3) ? B(c, a[3], cx) : false;
    const mode = opt(c, a, 4, cx, 0);
    if (skip instanceof CellError) return skip;
    if (mode instanceof CellError) return mode;
    if (!cols.some(Boolean) && !rows.some(Boolean)) return E.VALUE;
    const ci = mode === 1;
    const lines = (rows.some(Boolean) ? t.split(anyOf(rows, ci)) : [t]).filter((l) => !skip || l !== '');
    const grid = lines.map((l) => (cols.some(Boolean) ? l.split(anyOf(cols, ci)) : [l]).filter((x) => !skip || x !== ''));
    const w = Math.max(1, ...grid.map((r) => r.length));
    const pad = padArg(c, a, 5, cx);
    if (!grid.length) return E.CALC;
    const d: Scalar[] = [];
    for (const r of grid) for (let j = 0; j < w; j++) d.push(j < r.length ? r[j] : pad);
    return { k: 'arr', h: grid.length, w, d };
  }),
  TEXTBEFORE: def(2, 6, (c, a, cx) => textAround(c, a, cx, true)),
  TEXTAFTER: def(2, 6, (c, a, cx) => textAround(c, a, cx, false)),
  SPLIT: def(2, 4, (c, a, cx) => {
    const t = T(c, a[0], cx);
    const d = T(c, a[1], cx);
    if (t instanceof CellError) return t;
    if (d instanceof CellError) return d;
    const each = has(a, 2) ? B(c, a[2], cx) : true;
    const drop = has(a, 3) ? B(c, a[3], cx) : true;
    if (each instanceof CellError) return each;
    if (drop instanceof CellError) return drop;
    if (!d) return E.VALUE;
    const parts = t.split(each ? anyOf([...d], false) : anyOf([d], false)).filter((x) => !drop || x !== '');
    if (!parts.length) return E.VALUE;
    // Numbers come out as numbers, as Google Sheets gives them.
    const vals: Scalar[] = parts.map((x) => {
      const n = /^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/.test(x) ? Number(x) : NaN;
      return Number.isFinite(n) ? n : x;
    });
    return { k: 'arr', h: 1, w: vals.length, d: vals };
  }),
  JOIN: def(2, 255, (c, a, cx) => {
    const d = T(c, a[0], cx);
    if (d instanceof CellError) return d;
    return joined(c, a.slice(1), cx, d, false);
  }),
  REGEXMATCH: def(2, 2, (c, a, cx) => regexTest(c, a, cx, false)),
  REGEXTEST: def(2, 3, (c, a, cx) => regexTest(c, a, cx, true)),
  REGEXEXTRACT: def(2, 4, (c, a, cx) => {
    const t = T(c, a[0], cx);
    const p = T(c, a[1], cx);
    if (t instanceof CellError) return t;
    if (p instanceof CellError) return p;
    const mode = has(a, 2) ? N(c, a[2], cx) : null;
    const ci = opt(c, a, 3, cx, 0);
    if (mode instanceof CellError) return mode;
    if (ci instanceof CellError) return ci;
    const re = regexOf(p, ci === 1 ? 'gi' : 'g');
    if (re instanceof CellError) return re;
    const all = [...t.matchAll(re)];
    if (!all.length) return E.NA;
    // Left out: the first match, or its groups when the pattern has some (as Google Sheets gives them).
    const groups = all[0].length > 1;
    const m = mode === null ? (groups ? 2 : 0) : Math.trunc(mode);
    if (m === 0) return all[0][0];
    if (m === 1) return { k: 'arr', h: all.length, w: 1, d: all.map((x) => x[0]) };
    if (m === 2) {
      const g = all[0].slice(1).map((x) => x ?? '');
      return g.length ? (g.length === 1 ? g[0] : { k: 'arr', h: 1, w: g.length, d: g }) : all[0][0];
    }
    return E.VALUE;
  }),
  REGEXREPLACE: def(3, 5, (c, a, cx) => {
    const t = T(c, a[0], cx);
    const p = T(c, a[1], cx);
    const r = T(c, a[2], cx);
    if (t instanceof CellError) return t;
    if (p instanceof CellError) return p;
    if (r instanceof CellError) return r;
    const occ = opt(c, a, 3, cx, 0);
    const ci = opt(c, a, 4, cx, 0);
    if (occ instanceof CellError) return occ;
    if (ci instanceof CellError) return ci;
    const re = regexOf(p, ci === 1 ? 'gi' : 'g');
    if (re instanceof CellError) return re;
    // $0 is the whole match, as Excel and Google Sheets write it.
    const rep = r.replace(/\$0/g, '$$&');
    const k = Math.trunc(occ);
    if (k === 0) return t.replace(re, rep).slice(0, SHEET_LIMITS.text);
    const all = [...t.matchAll(re)];
    const m = k > 0 ? all[k - 1] : all[all.length + k];
    if (!m) return t;
    const one = new RegExp(re.source, re.flags.replace('g', ''));
    return (t.slice(0, m.index!) + m[0].replace(one, rep) + t.slice(m.index! + m[0].length)).slice(0, SHEET_LIMITS.text);
  }),
};

function regexTest(c: Calc, a: Node[], cx: Ctx, excel: boolean): Val {
  const t = T(c, a[0], cx);
  const p = T(c, a[1], cx);
  if (t instanceof CellError) return t;
  if (p instanceof CellError) return p;
  const ci = excel ? opt(c, a, 2, cx, 0) : 0;
  if (ci instanceof CellError) return ci;
  const re = regexOf(p, ci === 1 ? 'i' : '');
  return re instanceof CellError ? re : re.test(t);
}

// ---- formulas: statistics, trends and fits ------------------------------------------------------------------------

/** The values of the "A" functions (AVERAGEA, STDEVA…): numbers, words as 0 and TRUE as 1 from cells; given directly, as SUM takes them. */
function numbersA(c: Calc, a: Node[], cx: Ctx): number[] | CellError {
  const out: number[] = [];
  for (const n of a) {
    if (n.k === 'nil') continue;
    const v = evA(c, n, cx);
    if (isRg(v) || isArr(v)) {
      const e = scan(c, v, (x) => {
        if (typeof x === 'number') out.push(x);
        else if (typeof x === 'boolean') out.push(x ? 1 : 0);
        else if (typeof x === 'string') out.push(0);
      });
      if (e) return e;
    } else if (v !== null) {
      const x = toNum(c.sc(v, cx));
      if (x instanceof CellError) return x;
      out.push(x);
    }
  }
  return out;
}

const aggA = (f: (xs: number[]) => number | CellError): Fn =>
  def(1, 255, (c, a, cx) => {
    const xs = numbersA(c, a, cx);
    if (xs instanceof CellError) return xs;
    const r = f(xs);
    return r instanceof CellError ? r : fin(r);
  });

/** Pairs of numbers from two ranges of the same size (where both cells hold numbers), for CORREL, SLOPE and the like. */
function pairsXY(c: Calc, ny: Node, nx: Node, cx: Ctx): { y: number[]; x: number[] } | CellError {
  const ya = c.arr(evA(c, ny, cx));
  const xa = c.arr(evA(c, nx, cx));
  if (ya instanceof CellError) return ya;
  if (xa instanceof CellError) return xa;
  if (ya.d.length !== xa.d.length) return E.NA;
  const y: number[] = [];
  const x: number[] = [];
  for (let i = 0; i < ya.d.length; i++) {
    const p = ya.d[i];
    const q = xa.d[i];
    if (p instanceof CellError) return p;
    if (q instanceof CellError) return q;
    if (typeof p === 'number' && typeof q === 'number') {
      y.push(p);
      x.push(q);
    }
  }
  return { y, x };
}

/** Sums of a simple fit: the means, Σ(x−x̄)², Σ(y−ȳ)² and Σ(x−x̄)(y−ȳ). */
function moments(y: number[], x: number[]) {
  const n = y.length;
  const mx = sum(x) / n;
  const my = sum(y) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
    sxy += (x[i] - mx) * (y[i] - my);
  }
  return { n, mx, my, sxx, syy, sxy };
}

const fit2 = (f: (m: ReturnType<typeof moments>) => number | CellError, min = 2): Fn =>
  def(2, 2, (c, a, cx) => {
    const p = pairsXY(c, a[0], a[1], cx);
    if (p instanceof CellError) return p;
    if (p.y.length < min) return E.DIV;
    const r = f(moments(p.y, p.x));
    return r instanceof CellError ? r : fin(r);
  });

/** Solves A·x = b (A n×n, by rows) with Gauss–Jordan elimination; null when A cannot be inverted. Gives A's inverse too. */
function solveLinear(A: number[][], b: number[]): { x: number[]; inv: number[][] } | null {
  const n = A.length;
  const m = A.map((row, i) => [...row, b[i], ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r;
    const scale = Math.max(1e-300, ...A.map((row) => Math.abs(row[col])));
    if (Math.abs(m[piv][col]) < 1e-12 * scale) return null;
    [m[col], m[piv]] = [m[piv], m[col]];
    const p = m[col][col];
    for (let j = 0; j < m[col].length; j++) m[col][j] /= p;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col];
      if (f) for (let j = 0; j < m[r].length; j++) m[r][j] -= f * m[col][j];
    }
  }
  return { x: m.map((row) => row[n]), inv: m.map((row) => row.slice(n + 1)) };
}

/**
 * A least-squares fit of known y's to known x's (one variable or several, as LINEST and TREND take them): its
 * coefficients (one per variable, in the x's order, then the intercept) and the statistics LINEST gives.
 */
interface Fit {
  m: number[];
  b: number;
  se: number[];
  seB: number;
  r2: number;
  sey: number;
  F: number;
  df: number;
  ssreg: number;
  ssresid: number;
  /** Variables down columns (y a column) or along rows. */
  byCol: boolean;
  k: number;
}

function knownXY(c: Calc, a: Node[], cx: Ctx, log: boolean): { y: number[]; X: number[][]; byCol: boolean; ya: Arr } | CellError {
  const ya = c.arr(evA(c, a[0], cx));
  if (ya instanceof CellError) return ya;
  const byCol = ya.w === 1;
  const n = ya.d.length;
  const y: number[] = [];
  for (const v of ya.d) {
    if (typeof v !== 'number') return v instanceof CellError ? v : E.VALUE;
    if (log && v <= 0) return E.NUM;
    y.push(log ? Math.log(v) : v);
  }
  let X: number[][];
  if (has(a, 1)) {
    const xa = c.arr(evA(c, a[1], cx));
    if (xa instanceof CellError) return xa;
    for (const v of xa.d) if (typeof v !== 'number') return v instanceof CellError ? v : E.VALUE;
    const xs = xa.d as number[];
    if (xa.h === ya.h && xa.w === ya.w) X = y.map((_, i) => [xs[i]]);
    else if (byCol && xa.h === n) X = Array.from({ length: n }, (_, i) => xs.slice(i * xa.w, (i + 1) * xa.w));
    else if (!byCol && ya.h === 1 && xa.w === n) X = Array.from({ length: n }, (_, i) => Array.from({ length: xa.h }, (_, k) => xs[k * xa.w + i]));
    else return E.REF;
  } else X = y.map((_, i) => [i + 1]);
  return { y, X, byCol, ya };
}

function fitOf(y: number[], X: number[][], withB: boolean, byCol: boolean): Fit | CellError {
  const n = y.length;
  const k = X[0]?.length ?? 0;
  const p = k + (withB ? 1 : 0);
  if (!n || !k) return E.VALUE;
  const rows = X.map((r) => (withB ? [...r, 1] : r));
  const A = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => rows.reduce((s, r) => s + r[i] * r[j], 0)));
  const bv = Array.from({ length: p }, (_, i) => rows.reduce((s, r, t) => s + r[i] * y[t], 0));
  const sol = solveLinear(A, bv);
  if (!sol) return E.NUM;
  const coef = sol.x;
  const fitted = rows.map((r) => r.reduce((s, v, i) => s + v * coef[i], 0));
  const my = sum(y) / n;
  const ssresid = y.reduce((s, v, i) => s + (v - fitted[i]) ** 2, 0);
  const sstot = withB ? y.reduce((s, v) => s + (v - my) ** 2, 0) : y.reduce((s, v) => s + v * v, 0);
  const ssreg = sstot - ssresid;
  const df = n - p;
  const sey = df > 0 ? Math.sqrt(ssresid / df) : NaN;
  const se = sol.inv.map((row, i) => Math.sqrt(Math.max(0, row[i]) * (sey * sey)));
  return {
    m: coef.slice(0, k),
    b: withB ? coef[k] : 0,
    se: se.slice(0, k),
    seB: withB ? se[k] : NaN,
    r2: sstot ? ssreg / sstot : 1,
    sey,
    F: df > 0 && ssresid ? ssreg / k / (ssresid / df) : NaN,
    df,
    ssreg,
    ssresid,
    byCol,
    k,
  };
}

/** LINEST and LOGEST: the coefficients (the last variable's first, as Excel lays them out), and the statistics under them when asked. */
function linest(c: Calc, a: Node[], cx: Ctx, log: boolean): Val {
  const kx = knownXY(c, a, cx, log);
  if (kx instanceof CellError) return kx;
  const withB = has(a, 2) ? B(c, a[2], cx) : true;
  const stats = has(a, 3) ? B(c, a[3], cx) : false;
  if (withB instanceof CellError) return withB;
  if (stats instanceof CellError) return stats;
  const f = fitOf(kx.y, kx.X, withB, kx.byCol);
  if (f instanceof CellError) return f;
  const w = f.k + 1;
  const num = (v: number): Scalar => (Number.isFinite(v) ? v : E.NUM);
  const row1 = [...f.m].reverse().map((m) => (log ? Math.exp(m) : m));
  row1.push(log ? Math.exp(f.b) : f.b);
  if (!stats) return { k: 'arr', h: 1, w, d: row1.map(num) };
  const na = (len: number) => Array.from({ length: len }, () => E.NA as Scalar);
  const d: Scalar[] = [
    ...row1.map(num),
    ...[...f.se].reverse().map(num),
    withB ? num(f.seB) : E.NA,
    num(f.r2),
    num(f.sey),
    ...na(w - 2),
    num(f.F),
    f.df,
    ...na(w - 2),
    num(f.ssreg),
    num(f.ssresid),
    ...na(w - 2),
  ];
  return { k: 'arr', h: 5, w, d };
}

/** TREND and GROWTH: the fitted values at new x's (the known ones when left out), in their shape. */
function trend(c: Calc, a: Node[], cx: Ctx, log: boolean): Val {
  const kx = knownXY(c, a, cx, log);
  if (kx instanceof CellError) return kx;
  const withB = has(a, 3) ? B(c, a[3], cx) : true;
  if (withB instanceof CellError) return withB;
  const f = fitOf(kx.y, kx.X, withB, kx.byCol);
  if (f instanceof CellError) return f;
  let newX: number[][];
  let h: number;
  let w: number;
  if (has(a, 2)) {
    const na = c.arr(evA(c, a[2], cx));
    if (na instanceof CellError) return na;
    for (const v of na.d) if (typeof v !== 'number') return v instanceof CellError ? v : E.VALUE;
    const xs = na.d as number[];
    if (f.k === 1) {
      newX = xs.map((x) => [x]);
      [h, w] = [na.h, na.w];
    } else if (kx.byCol) {
      if (na.w !== f.k) return E.REF;
      newX = Array.from({ length: na.h }, (_, i) => xs.slice(i * na.w, (i + 1) * na.w));
      [h, w] = [na.h, 1];
    } else {
      if (na.h !== f.k) return E.REF;
      newX = Array.from({ length: na.w }, (_, i) => Array.from({ length: na.h }, (_, k) => xs[k * na.w + i]));
      [h, w] = [1, na.w];
    }
  } else {
    newX = kx.X;
    [h, w] = [kx.ya.h, kx.ya.w];
  }
  const d = newX.map((r) => {
    const v = r.reduce((s, x, i) => s + x * f.m[i], f.b);
    return fin(log ? Math.exp(v) : v) as Scalar;
  });
  return { k: 'arr', h, w, d };
}

/** PERCENTILE.EXC's rank: k of the way between the values, as (n + 1) places. */
function percentileExc(xs: number[], k: number): number | CellError {
  const s = sorted(xs);
  const n = s.length;
  const pos = k * (n + 1) - 1;
  if (!n || k <= 0 || k >= 1 || pos < 0 || pos > n - 1) return E.NUM;
  const lo = Math.floor(pos);
  return s[lo] + (pos - lo) * ((s[Math.min(lo + 1, n - 1)] ?? s[lo]) - s[lo]);
}

/** PERCENTRANK: where x is among the values, as a share (cut, not rounded, to `sig` digits). */
function percentRank(c: Calc, a: Node[], cx: Ctx, exc: boolean): Val {
  const xs = numbersOf(c, [a[0]], cx);
  if (xs instanceof CellError) return xs;
  const x = N(c, a[1], cx);
  const sig = opt(c, a, 2, cx, 3);
  if (x instanceof CellError) return x;
  if (sig instanceof CellError) return sig;
  const s = sorted(xs);
  const n = s.length;
  if (!n || sig < 1 || x < s[0] || x > s[n - 1]) return n && sig >= 1 ? E.NA : E.NUM;
  const rankOf = (v: number) => {
    const below = s.filter((y) => y < v).length;
    return exc ? (below + 1) / (n + 1) : n > 1 ? below / (n - 1) : 1;
  };
  let r: number;
  const exact = s.findIndex((y) => y === x);
  if (exact >= 0) r = rankOf(x);
  else {
    const i = s.findIndex((y) => y > x);
    const lo = s[i - 1];
    const hi = s[i];
    r = rankOf(lo) + ((x - lo) / (hi - lo)) * (rankOf(hi) - rankOf(lo));
  }
  const k = 10 ** Math.trunc(sig);
  return Math.floor(Number((r * k).toPrecision(12))) / k;
}

/** A weekend as NETWORKDAYS.INTL and WORKDAY.INTL take it: a number (1: Saturday and Sunday … 17: Saturday only) or "0000011" from Monday. */
function weekendOf(c: Calc, a: Node[], i: number, cx: Ctx): boolean[] | CellError {
  if (!has(a, i)) return [true, false, false, false, false, false, true];
  const v = S(c, a[i], cx);
  if (v instanceof CellError) return v;
  // Sunday first, as weekday() counts.
  if (typeof v === 'string') {
    if (!/^[01]{7}$/.test(v) || v === '1111111') return E.VALUE;
    return [v[6] === '1', v[0] === '1', v[1] === '1', v[2] === '1', v[3] === '1', v[4] === '1', v[5] === '1'];
  }
  const n = toNum(v);
  if (n instanceof CellError) return n;
  const k = Math.trunc(n);
  const out = [false, false, false, false, false, false, false];
  if (k >= 1 && k <= 7) {
    // 1: Sat+Sun, 2: Sun+Mon … 7: Fri+Sat.
    const first = (k + 5) % 7;
    out[first] = true;
    out[(first + 1) % 7] = true;
  } else if (k >= 11 && k <= 17) out[(k - 11) % 7] = true;
  else return E.NUM;
  return out;
}

const STAT_FNS: Record<string, Fn> = {
  AVERAGEA: aggA(mean),
  MINA: aggA((xs) => (xs.length ? Math.min(...xs) : 0)),
  MAXA: aggA((xs) => (xs.length ? Math.max(...xs) : 0)),
  STDEVA: aggA(stdev(true)),
  STDEVPA: aggA(stdev(false)),
  VARA: aggA((xs) => variance(xs, true)),
  VARPA: aggA((xs) => variance(xs, false)),
  DEVSQ: agg((xs) => {
    const m = mean(xs);
    return m instanceof CellError ? 0 : sum(xs.map((x) => (x - m) ** 2));
  }),
  AVEDEV: agg((xs) => {
    const m = mean(xs);
    return m instanceof CellError ? E.NUM : sum(xs.map((x) => Math.abs(x - m))) / xs.length;
  }),
  GEOMEAN: agg((xs) => (!xs.length || xs.some((x) => x <= 0) ? E.NUM : Math.exp(sum(xs.map(Math.log)) / xs.length))),
  HARMEAN: agg((xs) => (!xs.length || xs.some((x) => x <= 0) ? E.NUM : xs.length / sum(xs.map((x) => 1 / x)))),
  'PERCENTILE.EXC': withK(percentileExc),
  'QUARTILE.EXC': withK((xs, q) => (q >= 1 && q <= 3 ? percentileExc(xs, Math.trunc(q) / 4) : E.NUM)),
  'RANK.AVG': def(2, 3, (c, a, cx) => {
    const x = N(c, a[0], cx);
    if (x instanceof CellError) return x;
    const xs = numbersOf(c, [a[1]], cx);
    if (xs instanceof CellError) return xs;
    const asc = has(a, 2) ? N(c, a[2], cx) : 0;
    if (asc instanceof CellError) return asc;
    const same = xs.filter((y) => near(y, x)).length;
    if (!same) return E.NA;
    const before = xs.filter((y) => (asc ? y < x : y > x) && !near(y, x)).length;
    return before + (same + 1) / 2;
  }),
  PERCENTRANK: def(2, 3, (c, a, cx) => percentRank(c, a, cx, false)),
  'PERCENTRANK.INC': def(2, 3, (c, a, cx) => percentRank(c, a, cx, false)),
  'PERCENTRANK.EXC': def(2, 3, (c, a, cx) => percentRank(c, a, cx, true)),
  CORREL: fit2((m) => (m.sxx && m.syy ? m.sxy / Math.sqrt(m.sxx * m.syy) : E.DIV)),
  PEARSON: fit2((m) => (m.sxx && m.syy ? m.sxy / Math.sqrt(m.sxx * m.syy) : E.DIV)),
  RSQ: fit2((m) => (m.sxx && m.syy ? m.sxy ** 2 / (m.sxx * m.syy) : E.DIV)),
  SLOPE: fit2((m) => (m.sxx ? m.sxy / m.sxx : E.DIV)),
  INTERCEPT: fit2((m) => (m.sxx ? m.my - (m.sxy / m.sxx) * m.mx : E.DIV)),
  STEYX: fit2((m) => (m.sxx && m.n > 2 ? Math.sqrt((m.syy - m.sxy ** 2 / m.sxx) / (m.n - 2)) : E.DIV), 3),
  'COVARIANCE.P': fit2((m) => m.sxy / m.n, 1),
  COVAR: fit2((m) => m.sxy / m.n, 1),
  'COVARIANCE.S': fit2((m) => m.sxy / (m.n - 1)),
  FORECAST: def(3, 3, (c, a, cx) => {
    const x = N(c, a[0], cx);
    if (x instanceof CellError) return x;
    const p = pairsXY(c, a[1], a[2], cx);
    if (p instanceof CellError) return p;
    if (p.y.length < 2) return E.DIV;
    const m = moments(p.y, p.x);
    if (!m.sxx) return E.DIV;
    const slope = m.sxy / m.sxx;
    return fin(m.my + slope * (x - m.mx));
  }),
  TREND: def(1, 4, (c, a, cx) => trend(c, a, cx, false)),
  GROWTH: def(1, 4, (c, a, cx) => trend(c, a, cx, true)),
  LINEST: def(1, 4, (c, a, cx) => linest(c, a, cx, false)),
  LOGEST: def(1, 4, (c, a, cx) => linest(c, a, cx, true)),
  'NETWORKDAYS.INTL': def(2, 4, (c, a, cx) => {
    const s = dateArg(c, a[0], cx);
    const e = dateArg(c, a[1], cx);
    const we = weekendOf(c, a, 2, cx);
    const hs = holidaysOf(c, a[3], cx);
    if (s instanceof CellError) return s;
    if (e instanceof CellError) return e;
    if (we instanceof CellError) return we;
    if (hs instanceof CellError) return hs;
    if (Math.abs(e - s) > 400_000) return E.NUM;
    const [lo, hi, sign] = s <= e ? [s, e, 1] : [e, s, -1];
    let n = 0;
    for (let d = Math.floor(lo); d <= Math.floor(hi); d++) if (!we[weekday(d)] && !hs.has(d)) n++;
    return n * sign;
  }),
  'WORKDAY.INTL': def(2, 4, (c, a, cx) => {
    const s = dateArg(c, a[0], cx);
    const n = N(c, a[1], cx);
    const we = weekendOf(c, a, 2, cx);
    const hs = holidaysOf(c, a[3], cx);
    if (s instanceof CellError) return s;
    if (n instanceof CellError) return n;
    if (we instanceof CellError) return we;
    if (hs instanceof CellError) return hs;
    let left = Math.trunc(n);
    if (Math.abs(left) > 100_000) return E.NUM;
    const step = left < 0 ? -1 : 1;
    let d = Math.floor(s);
    while (left !== 0) {
      d += step;
      if (!we[weekday(d)] && !hs.has(d)) left -= step;
    }
    return d;
  }),
};
STAT_FNS['FORECAST.LINEAR'] = STAT_FNS.FORECAST;

// ---- formulas: AI, links, pictures and sparklines -----------------------------------------------------------------

/** A short hash of words (53 bits, as base-36 letters): the key an AI answer is kept by. */
function hash53(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36).padStart(8, '0');
}

/** The key an AI answer is kept by: its prompt and the values it was given, so a change to either asks again. */
export const aiKey = (prompt: string, context: string[]) => `a${hash53(`${prompt.trim()}\u0001${context.join('\u0002')}`)}`;

/** A value the AI function is given, as words: a cell's, or a range's rows of tab-separated values (empty rows at the end left out). */
function aiText(c: Calc, v: Val, cx: Ctx): string | CellError {
  if (!multi(v)) {
    const s = c.sc(v, cx);
    return s instanceof CellError ? s : (toText(s) as string);
  }
  const a = c.arr(v);
  if (a instanceof CellError) return a;
  const lines: string[] = [];
  for (let i = 0; i < a.h; i++)
    lines.push(
      a.d
        .slice(i * a.w, (i + 1) * a.w)
        .map((x) => (x instanceof CellError ? x.code : (toText(x) as string)))
        .join('\t'),
    );
  while (lines.length && !lines[lines.length - 1].replace(/\t/g, '').trim()) lines.pop();
  return lines.join('\n').slice(0, 20_000);
}

/** IMAGE's picture: its address, words for it, and how it fills its cell (Excel's sizing 0–3, or Google Sheets' mode 1–4). */
function imageOf(c: Calc, a: Node[], cx: Ctx): CellSpecial | null {
  const url = S(c, a[0], cx);
  if (typeof url !== 'string' || !/^(https?:\/\/|data:image\/)/i.test(url.trim())) return null;
  const second = has(a, 1) ? S(c, a[1], cx) : null;
  // A number second is Google Sheets' mode (1 fit, 2 stretch, 3 its own size, 4 a size given); words, Excel's alt text.
  const gs = typeof second === 'number';
  const alt = typeof second === 'string' ? second : '';
  const mode = gs ? Math.trunc(second as number) - 1 : has(a, 2) ? toNum(S(c, a[2], cx)) : 0;
  const fit = mode === 1 ? 'fill' : mode === 2 ? 'none' : mode === 3 ? 'size' : 'fit';
  const num = (i: number) => {
    const n = has(a, i) ? toNum(S(c, a[i], cx)) : NaN;
    return typeof n === 'number' && n > 0 ? Math.min(2000, n) : undefined;
  };
  return { kind: 'image', url: url.trim(), alt, fit, h: num(gs ? 2 : 3), w: num(gs ? 3 : 4) };
}

/** SPARKLINE's chart: its numbers, and the options given as pairs ({"charttype","column";"color","red"}). */
function sparkOf(c: Calc, a: Node[], cx: Ctx): CellSpecial | null {
  const src = c.arr(c.ev(a[0], cx));
  if (src instanceof CellError) return null;
  const values = src.d.map((v) => (typeof v === 'number' ? v : null));
  const o: Record<string, Scalar> = {};
  if (has(a, 1)) {
    const opts = c.arr(c.ev(a[1], cx));
    if (!(opts instanceof CellError))
      for (let i = 0; i + 1 < opts.d.length; i += opts.w >= 2 ? opts.w : 2) {
        const k = opts.d[i];
        if (typeof k === 'string') o[k.toLowerCase()] = opts.d[i + 1];
      }
  }
  const t = String(o.charttype ?? 'line').toLowerCase();
  const type = t === 'column' || t === 'bar' || t === 'winloss' ? t : 'line';
  const col = (x: Scalar) => (typeof x === 'string' ? (cleanColor(x) ?? undefined) : undefined);
  const n = (x: Scalar) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);
  return { kind: 'spark', values: values.slice(0, 2000), type, color: col(o.color ?? o.color1 ?? null), neg: col(o.negcolor ?? o.color2 ?? null), max: n(o.ymax ?? o.max ?? null), min: n(o.ymin ?? null), width: n(o.linewidth ?? null) };
}

const AI_FNS: Record<string, Fn> = {
  AI: def(1, 30, (c, a, cx) => {
    const p = T(c, a[0], cx);
    if (p instanceof CellError) return p;
    if (!p.trim()) return E.VALUE;
    const context: string[] = [];
    for (let i = 1; i < a.length; i++) {
      if (a[i].k === 'nil') continue;
      const t = aiText(c, c.ev(a[i], cx), cx);
      if (t instanceof CellError) return t;
      context.push(t);
    }
    const key = aiKey(p, context);
    const got = c.book.ai?.[key];
    if (got !== undefined) {
      c.seenAi(key);
      return got;
    }
    c.wantAi(cx, key, p.trim(), context);
    return E.BUSY;
  }),
  HYPERLINK: def(1, 2, (c, a, cx) => {
    const url = T(c, a[0], cx);
    if (url instanceof CellError) return url;
    if (!has(a, 1)) return url;
    const label = S(c, a[1], cx);
    return label === null ? url : label;
  }),
  IMAGE: def(1, 5, (c, a, cx) => {
    const url = T(c, a[0], cx);
    if (url instanceof CellError) return url;
    const second = has(a, 1) ? S(c, a[1], cx) : null;
    return typeof second === 'string' ? second : '';
  }),
  SPARKLINE: def(1, 2, (c, a, cx) => {
    const v = c.ev(a[0], cx);
    return v instanceof CellError ? v : '';
  }),
};

/**
 * The functions that work on each value of an array given where one value goes (in a formula worked out as an array:
 * one that spills, or inside SUM, FILTER and the like), and which of their arguments do ('all', or their places).
 */
const LIFT = new Map<string, 'all' | number[]>([
  ...[
    'LEN', 'LEFT', 'RIGHT', 'MID', 'UPPER', 'LOWER', 'PROPER', 'TRIM', 'CLEAN', 'SUBSTITUTE', 'REPLACE', 'FIND', 'SEARCH', 'REPT', 'EXACT', 'CODE', 'CHAR',
    'VALUE', 'TEXT', 'FIXED', 'CONCATENATE', 'TEXTBEFORE', 'TEXTAFTER', 'REGEXMATCH', 'REGEXTEST', 'REGEXREPLACE', 'DATE', 'TIME', 'YEAR', 'MONTH', 'DAY',
    'HOUR', 'MINUTE', 'SECOND', 'WEEKDAY', 'WEEKNUM', 'ISOWEEKNUM', 'EOMONTH', 'EDATE', 'DATEDIF', 'DAYS', 'DATEVALUE', 'TIMEVALUE', 'ISBLANK', 'ISNUMBER',
    'ISTEXT', 'ISNONTEXT', 'ISLOGICAL', 'ISERROR', 'ISERR', 'ISNA', 'ISEVEN', 'ISODD', 'N', 'T', 'NOT', 'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'TRUNC', 'INT',
    'ABS', 'SIGN', 'SQRT', 'POWER', 'EXP', 'LN', 'LOG10', 'LOG', 'MOD', 'QUOTIENT', 'CEILING', 'FLOOR', 'MROUND', 'EVEN', 'ODD',
    'DEC2BIN', 'DEC2OCT', 'DEC2HEX', 'BIN2DEC', 'OCT2DEC', 'HEX2DEC', 'UNICODE', 'UNICHAR', 'ROMAN', 'ARABIC', 'ISURL', 'ISEMAIL', 'ENCODEURL', 'NUMBERVALUE', 'DOLLAR', 'YEARFRAC', 'DAYS360', 'EFFECT', 'NOMINAL', 'SLN',
  ].map((n) => [n, 'all'] as [string, 'all']),
  ...['VLOOKUP', 'HLOOKUP', 'XLOOKUP', 'MATCH', 'XMATCH'].map((n) => [n, [0]] as [string, number[]]),
  ...['COUNTIF', 'SUMIF', 'AVERAGEIF'].map((n) => [n, [1]] as [string, number[]]),
]);

// ---- formulas: more of Excel's and Google Sheets' functions ------------------------------------------------------------
// SUBTOTAL; the loans and depreciation (XIRR, XNPV, MIRR, SLN, DB, DDB, CUMIPMT, CUMPRINC, EFFECT, NOMINAL); dates
// (YEARFRAC, DAYS360); the normal distribution, skew and kurtosis, COMBIN, PERMUT, TRIMMEAN; words and numbers
// (NUMBERVALUE, DOLLAR, UNICODE, UNICHAR, ROMAN, ARABIC, ENCODEURL, the number systems); and Google Sheets' COUNTUNIQUE,
// ISURL, ISEMAIL, FLATTEN and SORTN.

/** The error function's complement for z ≥ 0: a series for the middle, a continued fraction for the tail. */
function erfcPos(z: number): number {
  if (z < 2.5) {
    // erf(z) = 2/√π · e^(−z²) · Σ 2ⁿ z^(2n+1) / (1·3·5…(2n+1)): all terms positive, so nothing is lost.
    let term = z;
    let s = z;
    for (let n = 1; n < 200; n++) {
      term *= (2 * z * z) / (2 * n + 1);
      s += term;
      if (term < s * 1e-17) break;
    }
    return 1 - (2 / Math.sqrt(Math.PI)) * Math.exp(-z * z) * s;
  }
  let f = 0;
  for (let k = 150; k >= 1; k--) f = k / 2 / (z + f);
  return Math.exp(-z * z) / Math.sqrt(Math.PI) / (z + f);
}
/** The standard normal distribution's cumulative probability. */
const normCdf = (x: number) => (x >= 0 ? 1 - 0.5 * erfcPos(x / Math.SQRT2) : 0.5 * erfcPos(-x / Math.SQRT2));
/** The standard normal distribution's inverse (Acklam's rational approximation, then one step to full precision). */
function normInv(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  let x: number;
  if (p < 0.02425) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p > 1 - 0.02425) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else {
    const q = p - 0.5;
    const r = q * q;
    x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const e = normCdf(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

/** The depreciation, loan and bond functions' working: the interest and the principal paid in a period of a loan. */
const ipmtAt = (r: number, per: number, n: number, pv: number, ty: number) => {
  const pmt = pmtOf(r, n, pv, 0, ty);
  if (ty === 1) return per === 1 ? 0 : (fv(r, per - 2, pmt, pv, 1) - pmt) * r;
  return fv(r, per - 1, pmt, pv, 0) * r;
};
/** CUMIPMT's and CUMPRINC's: the interest (or principal) paid from one period to another, as Excel checks them. */
const cumulative = (principal: boolean): Fn =>
  money(6, 6, (r, n, pv, from, to, type) => {
    const [s, e] = [Math.trunc(from), Math.trunc(to)];
    if (r <= 0 || n <= 0 || pv <= 0 || s < 1 || e < s || e > n || (type !== 0 && type !== 1)) return E.NUM;
    let total = 0;
    for (let per = s; per <= e; per++) {
      const ip = ipmtAt(r, per, n, pv, type);
      total += principal ? pmtOf(r, n, pv, 0, type) - ip : ip;
    }
    return total;
  });

/** Days from one date to another on a year of twelve 30-day months, as Excel's DAYS360 and bond rules count them. */
function days360(a: number, b: number, european: boolean): number {
  const p = serialParts(a);
  const q = serialParts(b);
  let d1 = p.d;
  let d2 = q.d;
  const leap = daysIn(p.y, 2) === 29;
  if (d1 === 31) d1 = 30;
  else if (!european && p.m === 2 && (d1 === 29 || (d1 === 28 && !leap))) d1 = 30;
  if (d2 === 31 && (european || d1 === 30)) d2 = 30;
  return (q.y - p.y) * 360 + (q.m - p.m) * 30 + (d2 - d1);
}
/** The fraction of a year between two dates, by Excel's day-count bases 0 to 4. */
function yearFrac(a0: number, b0: number, basis: number): number | CellError {
  const [a, b] = a0 <= b0 ? [Math.floor(a0), Math.floor(b0)] : [Math.floor(b0), Math.floor(a0)];
  switch (basis) {
    case 0:
      return days360(a, b, false) / 360;
    case 4:
      return days360(a, b, true) / 360;
    case 2:
      return (b - a) / 360;
    case 3:
      return (b - a) / 365;
    case 1: {
      const p = serialParts(a);
      const q = serialParts(b);
      const leap = (y: number) => daysIn(y, 2) === 29;
      if (p.y === q.y) return (b - a) / (leap(p.y) ? 366 : 365);
      // Within a year of the start: 366 when a 29 February lies between, else 365.
      const yearOn = dateSerial(p.y + 1, p.m, Math.min(p.d, daysIn(p.y + 1, p.m)));
      if (b <= yearOn) {
        const feb = (y: number) => dateSerial(y, 2, 29);
        const has29 = (leap(p.y) && a <= feb(p.y) && b >= feb(p.y)) || (leap(q.y) && a <= feb(q.y) && b >= feb(q.y));
        return (b - a) / (has29 ? 366 : 365);
      }
      let days = 0;
      for (let y = p.y; y <= q.y; y++) days += leap(y) ? 366 : 365;
      return (b - a) / (days / (q.y - p.y + 1));
    }
  }
  return E.NUM;
}

/** A number in base 2, 8 or 16 as Excel writes it: negatives in ten digits of two's complement. */
const BASES: Record<string, number> = { BIN: 2, OCT: 8, HEX: 16 };
function toBase(name: keyof typeof BASES): Fn {
  const base = BASES[name];
  const bits = base === 2 ? 10 : base === 8 ? 30 : 40;
  const lim = 2 ** (bits - 1);
  return def(1, 2, (c, a, cx) => {
    const raw = S(c, a[0], cx);
    const x = raw instanceof CellError ? raw : toNum(raw);
    const places = opt(c, a, 1, cx, 0);
    if (x instanceof CellError) return x;
    if (places instanceof CellError) return places;
    const n = Math.trunc(x);
    if (n < -lim || n >= lim) return E.NUM;
    const text = (n < 0 ? n + 2 ** bits : n).toString(base).toUpperCase();
    if (n < 0) return text.padStart(10, base === 2 ? '1' : base === 8 ? '7' : 'F');
    if (has(a, 1)) {
      const p = Math.trunc(places);
      if (p < 1 || p > 10 || text.length > p) return E.NUM;
      return text.padStart(p, '0');
    }
    return text;
  });
}
function fromBase(name: keyof typeof BASES): Fn {
  const base = BASES[name];
  const bits = base === 2 ? 10 : base === 8 ? 30 : 40;
  const digits = base === 2 ? /^[01]+$/ : base === 8 ? /^[0-7]+$/ : /^[0-9a-f]+$/i;
  return def(1, 1, (c, a, cx) => {
    const raw = S(c, a[0], cx);
    if (raw instanceof CellError) return raw;
    const t = raw === null ? '0' : typeof raw === 'boolean' ? '' : String(raw);
    if (!digits.test(t) || t.length > 10) return E.NUM;
    const v = parseInt(t, base);
    // Ten digits whose top bit is set are negative.
    return t.length === 10 && v >= 2 ** (bits - 1) ? v - 2 ** bits : v;
  });
}

const ROMANS: [number, string][] = [[1000, 'M'], [500, 'D'], [100, 'C'], [50, 'L'], [10, 'X'], [5, 'V'], [1, 'I']];
/** ROMAN's numerals for a form 0 (classic) to 4 (the most concise): each form allows subtracting smaller symbols from the larger ones. */
function romanOf(n: number, form: number): string {
  // The pairs (value, letters) a form allows, as Excel's table: M and D from C, L, X, V, I; C and L from X, V, I; X and V from I.
  const pairs: [number, string][] = [];
  const sub = (big: string, bigV: number, subs: string[]) => {
    for (let k = 0; k < subs.length && k <= form; k++) {
      const s = ROMANS.find((r) => r[1] === subs[k])!;
      pairs.push([bigV - s[0], s[1] + big]);
    }
  };
  sub('M', 1000, ['C', 'L', 'X', 'V', 'I']);
  sub('D', 500, ['C', 'L', 'X', 'V', 'I']);
  sub('C', 100, ['X', 'V', 'I']);
  sub('L', 50, ['X', 'V', 'I']);
  sub('X', 10, ['I']);
  sub('V', 5, ['I']);
  const table = [...ROMANS.map(([v, s]) => [v, s] as [number, string]), ...pairs].sort((x, y) => y[0] - x[0]);
  let out = '';
  let left = n;
  for (const [v, s] of table) {
    while (left >= v) {
      out += s;
      left -= v;
    }
  }
  return out;
}

/** The rows of the cells of a SUBTOTAL's range that count: those a filter hides never do; those hidden by hand only for 1–11. */
const SUBTOTALS: Record<number, (xs: number[], seen: Scalar[]) => number | CellError> = {
  1: (xs) => mean(xs),
  2: (xs) => xs.length,
  3: (_, seen) => seen.length,
  4: (xs) => (xs.length ? Math.max(...xs) : 0),
  5: (xs) => (xs.length ? Math.min(...xs) : 0),
  6: (xs) => (xs.length ? xs.reduce((p, x) => p * x, 1) : 0),
  7: (xs) => stdev(true)(xs),
  8: (xs) => stdev(false)(xs),
  9: (xs) => sum(xs),
  10: (xs) => variance(xs, true),
  11: (xs) => variance(xs, false),
};

const MORE_FNS: Record<string, Fn> = {
  SUBTOTAL: def(2, 255, (c, a, cx) => {
    const k = N(c, a[0], cx);
    if (k instanceof CellError) return k;
    const num = Math.trunc(k);
    const noHidden = num >= 101 && num <= 111;
    const f = SUBTOTALS[noHidden ? num - 100 : num];
    if (!f) return E.VALUE;
    const xs: number[] = [];
    const seen: Scalar[] = [];
    let err: CellError | null = null;
    for (let i = 1; i < a.length; i++) {
      const v = evA(c, a[i], cx);
      if (!isRg(v) && !isArr(v)) {
        const s = c.sc(v, cx);
        if (s instanceof CellError) return s;
        if (typeof s === 'number') xs.push(s);
        if (s !== null) seen.push(s);
        continue;
      }
      c.each(v, (s, di, dj) => {
        if (isRg(v)) {
          const r = v.r1 + di;
          // Rows a filter hides, and those hidden by hand for 101–111, do not count; nor do other SUBTOTALs inside the range.
          if (c.rowFiltered(v.si, r) || (noHidden && c.rowHidden(v.si, r))) return;
          if (/(^|[^A-Za-z0-9_.])SUBTOTAL\s*\(/i.test(c.cellAt(v.si, r, v.c1 + dj)?.f ?? '')) return;
        }
        if (s instanceof CellError) err ??= s;
        else {
          if (typeof s === 'number') xs.push(s);
          if (s !== null) seen.push(s);
        }
      });
    }
    if (err) return err;
    const r = f(xs, seen);
    return r instanceof CellError ? r : fin(r);
  }),
  COUNTUNIQUE: def(1, 255, (c, a, cx) => {
    const seen = new Set<string>();
    let err: CellError | null = null;
    for (const n of a) {
      const v = evA(c, n, cx);
      const add = (s: Scalar) => {
        if (s instanceof CellError) err ??= s;
        else if (s !== null && s !== '') seen.add(typeof s === 'string' ? `s${s.toLowerCase()}` : `${typeof s}${String(s)}`);
      };
      if (isRg(v) || isArr(v)) c.each(v, (s) => void add(s));
      else add(c.sc(v, cx));
    }
    return err ?? seen.size;
  }),
  YEARFRAC: def(2, 3, (c, a, cx) => {
    const s = dateArg(c, a[0], cx);
    const e = dateArg(c, a[1], cx);
    const basis = opt(c, a, 2, cx, 0);
    if (s instanceof CellError) return s;
    if (e instanceof CellError) return e;
    if (basis instanceof CellError) return basis;
    const b = Math.trunc(basis);
    if (b < 0 || b > 4) return E.NUM;
    const r = yearFrac(s, e, b);
    return r instanceof CellError ? r : fin(r);
  }),
  DAYS360: def(2, 3, (c, a, cx) => {
    const s = dateArg(c, a[0], cx);
    const e = dateArg(c, a[1], cx);
    const m = has(a, 2) ? B(c, a[2], cx) : false;
    if (s instanceof CellError) return s;
    if (e instanceof CellError) return e;
    if (m instanceof CellError) return m;
    return days360(Math.floor(s), Math.floor(e), m);
  }),
  XNPV: def(3, 3, (c, a, cx) => {
    const r = N(c, a[0], cx);
    const vs = numbersOf(c, [a[1]], cx);
    const ds = numbersOf(c, [a[2]], cx);
    if (r instanceof CellError) return r;
    if (vs instanceof CellError) return vs;
    if (ds instanceof CellError) return ds;
    if (vs.length !== ds.length || !vs.length) return E.NUM;
    if (r <= -1 || ds.some((d) => d < ds[0])) return E.NUM;
    return fin(vs.reduce((s, v, i) => s + v / (1 + r) ** ((Math.floor(ds[i]) - Math.floor(ds[0])) / 365), 0));
  }),
  XIRR: def(2, 3, (c, a, cx) => {
    const vs = numbersOf(c, [a[0]], cx);
    const ds = numbersOf(c, [a[1]], cx);
    const g = opt(c, a, 2, cx, 0.1);
    if (vs instanceof CellError) return vs;
    if (ds instanceof CellError) return ds;
    if (g instanceof CellError) return g;
    if (vs.length !== ds.length || vs.length < 2 || ds.some((d) => d < ds[0])) return E.NUM;
    if (!vs.some((v) => v > 0) || !vs.some((v) => v < 0)) return E.NUM;
    const years = ds.map((d) => (Math.floor(d) - Math.floor(ds[0])) / 365);
    const r = solve((x) => (x <= -1 ? NaN : vs.reduce((s, v, i) => s + v / (1 + x) ** years[i], 0)), g);
    return r instanceof CellError ? r : fin(r);
  }),
  MIRR: def(3, 3, (c, a, cx) => {
    const vs = numbersOf(c, [a[0]], cx);
    const fr = N(c, a[1], cx);
    const rr = N(c, a[2], cx);
    if (vs instanceof CellError) return vs;
    if (fr instanceof CellError) return fr;
    if (rr instanceof CellError) return rr;
    const n = vs.length;
    if (n < 2 || !vs.some((v) => v > 0) || !vs.some((v) => v < 0)) return E.DIV;
    const npv = (rate: number, xs: number[]) => xs.reduce((s, v, i) => s + v / (1 + rate) ** (i + 1), 0);
    const up = npv(rr, vs.map((v) => (v > 0 ? v : 0)));
    const down = npv(fr, vs.map((v) => (v < 0 ? v : 0)));
    return fin((-up * (1 + rr) ** n / (down * (1 + fr))) ** (1 / (n - 1)) - 1);
  }),
  SLN: money(3, 3, (cost, salvage, life) => (life === 0 ? E.DIV : (cost - salvage) / life)),
  DB: money(4, 5, (cost, salvage, life, period, month) => {
    const m = Number.isNaN(month) ? 12 : Math.trunc(month);
    const per = Math.trunc(period);
    if (cost < 0 || salvage < 0 || life <= 0 || per < 1 || m < 1 || m > 12 || per > life + (m < 12 ? 1 : 0)) return E.NUM;
    if (cost === 0) return 0;
    const rate = Math.round((1 - (salvage / cost) ** (1 / life)) * 1000) / 1000;
    let total = 0;
    let dep = 0;
    for (let i = 1; i <= per; i++) {
      dep = i === 1 ? (cost * rate * m) / 12 : i === life + 1 ? ((cost - total) * rate * (12 - m)) / 12 : (cost - total) * rate;
      total += dep;
    }
    return dep;
  }),
  DDB: money(4, 5, (cost, salvage, life, period, factor) => {
    const f = Number.isNaN(factor) ? 2 : factor;
    if (cost < 0 || salvage < 0 || life <= 0 || period < 1 || period > life || f <= 0) return E.NUM;
    let total = 0;
    let dep = 0;
    for (let i = 1; i <= Math.ceil(period); i++) {
      dep = Math.max(0, Math.min((cost - total) * (f / life), cost - salvage - total));
      total += dep;
    }
    return dep;
  }),
  CUMIPMT: cumulative(false),
  CUMPRINC: cumulative(true),
  EFFECT: money(2, 2, (r, n) => (r <= 0 || Math.trunc(n) < 1 ? E.NUM : (1 + r / Math.trunc(n)) ** Math.trunc(n) - 1)),
  NOMINAL: money(2, 2, (e, n) => (e <= 0 || Math.trunc(n) < 1 ? E.NUM : Math.trunc(n) * ((1 + e) ** (1 / Math.trunc(n)) - 1))),
  'NORM.S.DIST': def(1, 2, (c, a, cx) => {
    const z = N(c, a[0], cx);
    const cum = has(a, 1) ? B(c, a[1], cx) : true;
    if (z instanceof CellError) return z;
    if (cum instanceof CellError) return cum;
    return cum ? normCdf(z) : fin(Math.exp((-z * z) / 2) / Math.sqrt(2 * Math.PI));
  }),
  NORMSDIST: def(1, 1, (c, a, cx) => {
    const z = N(c, a[0], cx);
    return z instanceof CellError ? z : normCdf(z);
  }),
  'NORM.DIST': def(4, 4, (c, a, cx) => {
    const x = N(c, a[0], cx);
    const m = N(c, a[1], cx);
    const sd = N(c, a[2], cx);
    const cum = B(c, a[3], cx);
    if (x instanceof CellError) return x;
    if (m instanceof CellError) return m;
    if (sd instanceof CellError) return sd;
    if (cum instanceof CellError) return cum;
    if (sd <= 0) return E.NUM;
    const z = (x - m) / sd;
    return cum ? normCdf(z) : fin(Math.exp((-z * z) / 2) / (sd * Math.sqrt(2 * Math.PI)));
  }),
  'NORM.S.INV': math(1, 1, (p) => (p <= 0 || p >= 1 ? E.NUM : normInv(p))),
  NORMSINV: math(1, 1, (p) => (p <= 0 || p >= 1 ? E.NUM : normInv(p))),
  'NORM.INV': math(3, 3, (p, m, sd) => (p <= 0 || p >= 1 || sd <= 0 ? E.NUM : m + sd * normInv(p))),
  SKEW: agg((xs) => {
    const n = xs.length;
    if (n < 3) return E.DIV;
    const m = sum(xs) / n;
    const s = Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / (n - 1));
    return s === 0 ? E.DIV : (n / ((n - 1) * (n - 2))) * sum(xs.map((x) => ((x - m) / s) ** 3));
  }),
  KURT: agg((xs) => {
    const n = xs.length;
    if (n < 4) return E.DIV;
    const m = sum(xs) / n;
    const s = Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / (n - 1));
    return s === 0 ? E.DIV : ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * sum(xs.map((x) => ((x - m) / s) ** 4)) - (3 * (n - 1) ** 2) / ((n - 2) * (n - 3));
  }),
  COMBIN: math(2, 2, (n, k) => {
    const [a, b] = [Math.trunc(n), Math.trunc(k)];
    if (a < 0 || b < 0 || b > a) return E.NUM;
    let r = 1;
    for (let i = 1; i <= Math.min(b, a - b); i++) r = (r * (a - i + 1)) / i;
    return Math.round(r);
  }),
  PERMUT: math(2, 2, (n, k) => {
    const [a, b] = [Math.trunc(n), Math.trunc(k)];
    if (a < 0 || b < 0 || b > a) return E.NUM;
    let r = 1;
    for (let i = 0; i < b; i++) r *= a - i;
    return r;
  }),
  TRIMMEAN: def(2, 2, (c, a, cx) => {
    const xs = numbersOf(c, [a[0]], cx);
    const p = N(c, a[1], cx);
    if (xs instanceof CellError) return xs;
    if (p instanceof CellError) return p;
    if (p < 0 || p >= 1 || !xs.length) return E.NUM;
    // Excel leaves out a whole number of values, the same count from each end (rounded down to an even number).
    const cut = Math.floor(Math.floor(xs.length * p) / 2);
    return mean(sorted(xs).slice(cut, xs.length - cut));
  }),
  FORMULATEXT: def(1, 1, (c, a, cx) => {
    const v = c.ev(a[0], cx);
    if (!isRg(v)) return E.NA;
    const f = c.cellAt(v.si, v.r1, v.c1)?.f;
    return f === undefined ? E.NA : `=${f}`;
  }),
  ISURL: def(1, 1, (c, a, cx) => {
    const v = S(c, a[0], cx);
    return typeof v === 'string' && /^(?:(?:https?|ftp):\/\/)?(?:[\w-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#]\S*)?$/i.test(v.trim());
  }),
  ISEMAIL: def(1, 1, (c, a, cx) => {
    const v = S(c, a[0], cx);
    return typeof v === 'string' && /^[A-Za-z0-9._%+'-]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}$/.test(v.trim());
  }),
  NUMBERVALUE: def(1, 3, (c, a, cx) => {
    const t = T(c, a[0], cx);
    const dec = has(a, 1) ? T(c, a[1], cx) : '.';
    const grp = has(a, 2) ? T(c, a[2], cx) : ',';
    if (t instanceof CellError) return t;
    if (dec instanceof CellError) return dec;
    if (grp instanceof CellError) return grp;
    if (dec === grp || dec.length !== 1 || (has(a, 2) && grp.length !== 1)) return E.VALUE;
    let s = t.replace(/\s+/g, '');
    if (s === '') return 0;
    // Each % at the end divides by a hundred.
    let pct = 0;
    while (s.endsWith('%')) {
      s = s.slice(0, -1);
      pct++;
    }
    const ints = s.split(dec);
    if (ints.length > 2) return E.VALUE;
    const clean = ints.map((x, i) => (i === 0 && grp ? x.split(grp).join('') : x));
    const text = clean.join('.');
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return E.VALUE;
    return fin(Number(text) / 100 ** pct);
  }),
  DOLLAR: def(1, 2, (c, a, cx) => {
    const x = N(c, a[0], cx);
    const dp = opt(c, a, 1, cx, 2);
    if (x instanceof CellError) return x;
    if (dp instanceof CellError) return dp;
    const d = Math.trunc(dp);
    const r = roundTo(x, d);
    const body = fixed(Math.abs(r), Math.max(0, d), true);
    return r < 0 ? `($${body})` : `$${body}`;
  }),
  UNICODE: def(1, 1, (c, a, cx) => {
    const t = T(c, a[0], cx);
    return t instanceof CellError ? t : t === '' ? E.VALUE : (t.codePointAt(0) as number);
  }),
  UNICHAR: def(1, 1, (c, a, cx) => {
    const n = N(c, a[0], cx);
    if (n instanceof CellError) return n;
    const k = Math.trunc(n);
    return k < 1 || k > 0x10ffff || (k >= 0xd800 && k <= 0xdfff) ? E.VALUE : String.fromCodePoint(k);
  }),
  ROMAN: def(1, 2, (c, a, cx) => {
    const x = N(c, a[0], cx);
    if (x instanceof CellError) return x;
    // The form: 0 or TRUE classic; 1 to 3 more concise; 4 or FALSE the most concise.
    let form = 0;
    if (has(a, 1)) {
      const v = S(c, a[1], cx);
      if (v instanceof CellError) return v;
      form = typeof v === 'boolean' ? (v ? 0 : 4) : Math.trunc(toNum(v) as number);
    }
    const n = Math.trunc(x);
    if (n < 0 || n > 3999 || form < 0 || form > 4 || Number.isNaN(form)) return E.VALUE;
    return n === 0 ? '' : romanOf(n, form);
  }),
  ARABIC: def(1, 1, (c, a, cx) => {
    const t = T(c, a[0], cx);
    if (t instanceof CellError) return t;
    const s = t.trim().toUpperCase();
    const neg = s.startsWith('-');
    const body = neg ? s.slice(1) : s;
    if (body === '') return neg ? E.VALUE : 0;
    if (!/^[MDCLXVI]+$/.test(body) || body.length > 255) return E.VALUE;
    const val: Record<string, number> = { M: 1000, D: 500, C: 100, L: 50, X: 10, V: 5, I: 1 };
    let total = 0;
    for (let i = 0; i < body.length; i++) {
      const v = val[body[i]];
      total += v < (val[body[i + 1]] ?? 0) ? -v : v;
    }
    return neg ? -total : total;
  }),
  DEC2BIN: toBase('BIN'),
  DEC2OCT: toBase('OCT'),
  DEC2HEX: toBase('HEX'),
  BIN2DEC: fromBase('BIN'),
  OCT2DEC: fromBase('OCT'),
  HEX2DEC: fromBase('HEX'),
  ENCODEURL: def(1, 1, (c, a, cx) => {
    const t = T(c, a[0], cx);
    return t instanceof CellError ? t : encodeURIComponent(t).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
  }),
  FLATTEN: def(1, 255, (c, a, cx) => {
    const d: Scalar[] = [];
    for (const n of a) {
      const v = c.arr(evA(c, n, cx));
      if (v instanceof CellError) return v;
      d.push(...v.d);
    }
    if (d.length > MAX_ARRAY) return E.NUM;
    return { k: 'arr', h: d.length, w: 1, d };
  }),
  SORTN: def(1, 255, (c, a, cx) => {
    const src = c.arr(evA(c, a[0], cx));
    if (src instanceof CellError) return src;
    const count = opt(c, a, 1, cx, 1);
    const ties = opt(c, a, 2, cx, 0);
    if (count instanceof CellError) return count;
    if (ties instanceof CellError) return ties;
    const n = Math.trunc(count);
    const mode = Math.trunc(ties);
    if (n < 1 || mode < 0 || mode > 3) return E.VALUE;
    // Pairs of a column to sort by and whether it goes up (TRUE, the default).
    const keys: { col: number; asc: boolean }[] = [];
    for (let i = 3; i < a.length; i += 2) {
      const col = N(c, a[i], cx);
      const asc = has(a, i + 1) ? B(c, a[i + 1], cx) : true;
      if (col instanceof CellError) return col;
      if (asc instanceof CellError) return asc;
      if (col < 1 || col > src.w) return E.VALUE;
      keys.push({ col: Math.trunc(col) - 1, asc });
    }
    if (!keys.length) keys.push({ col: 0, asc: true });
    const lines = linesOf(src, false);
    const cmp = (x: Scalar[], y: Scalar[]) => {
      for (const k of keys) {
        const d = sortCmp(x[k.col], y[k.col]);
        if (d) return d * (x[k.col] === null || y[k.col] === null || k.asc ? 1 : -1);
      }
      return 0;
    };
    let rows = lines.map((l, i) => [l, i] as const).sort((x, y) => cmp(x[0], y[0]) || x[1] - y[1]).map((x) => x[0]);
    // Modes 2 and 3 leave out rows that repeat an earlier one.
    if (mode >= 2) {
      const seen = new Set<string>();
      rows = rows.filter((l) => {
        const k = l.map((v) => (typeof v === 'string' ? `s${v.toLowerCase()}` : `${typeof v}${String(v)}`)).join('\u0001');
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }
    let kept = rows.slice(0, n);
    // Modes 1 and 3 keep the rows that tie with the last one kept.
    if ((mode === 1 || mode === 3) && rows.length > n) for (let i = n; i < rows.length && cmp(rows[i], rows[n - 1]) === 0; i++) kept.push(rows[i]);
    if (!kept.length) kept = [];
    return kept.length ? fromLines(kept, false) : E.NA;
  }),
};

MORE_FNS.NORMDIST = MORE_FNS['NORM.DIST'];
MORE_FNS.NORMINV = MORE_FNS['NORM.INV'];

const FNS: Record<string, Fn> = { ...MATH_FNS, ...LOGIC_FNS, ...INFO_FNS, ...LOOKUP_FNS, ...TEXT_FNS, ...DATE_FNS, ...MONEY_FNS, ...ARRAY_FNS, ...LAMBDA_FNS, ...ARRAY2_FNS, ...TEXT2_FNS, ...STAT_FNS, ...MORE_FNS, ...AI_FNS };
FNS['MODE.SNGL'] = FNS.MODE;
FNS['RANK.EQ'] = FNS.RANK;

/** Every function formulas may use, by name. */
export const FUNCTION_NAMES: string[] = Object.keys(FNS).sort();

/** How the most used functions are written, for the list shown while a formula is typed. */
export const FUNCTION_HINTS: Record<string, string> = {
  SUM: 'SUM(number1, [number2], …)',
  AVERAGE: 'AVERAGE(number1, [number2], …)',
  MIN: 'MIN(number1, …)',
  MAX: 'MAX(number1, …)',
  COUNT: 'COUNT(value1, …): how many numbers',
  COUNTA: 'COUNTA(value1, …): how many are not empty',
  COUNTBLANK: 'COUNTBLANK(range)',
  COUNTIF: 'COUNTIF(range, criterion)',
  COUNTIFS: 'COUNTIFS(range1, criterion1, …)',
  SUMIF: 'SUMIF(range, criterion, [sum_range])',
  SUMIFS: 'SUMIFS(sum_range, range1, criterion1, …)',
  AVERAGEIF: 'AVERAGEIF(range, criterion, [average_range])',
  IF: 'IF(test, if_true, [if_false])',
  IFS: 'IFS(test1, value1, …)',
  IFERROR: 'IFERROR(value, if_error)',
  AND: 'AND(test1, …)',
  OR: 'OR(test1, …)',
  NOT: 'NOT(test)',
  VLOOKUP: 'VLOOKUP(value, table, column, [approximate])',
  HLOOKUP: 'HLOOKUP(value, table, row, [approximate])',
  XLOOKUP: 'XLOOKUP(value, look_in, return, [if_not_found], [match], [search])',
  INDEX: 'INDEX(range, row, [column])',
  MATCH: 'MATCH(value, range, [type])',
  ROUND: 'ROUND(number, digits)',
  ROUNDUP: 'ROUNDUP(number, digits)',
  ROUNDDOWN: 'ROUNDDOWN(number, digits)',
  INT: 'INT(number)',
  ABS: 'ABS(number)',
  SQRT: 'SQRT(number)',
  POWER: 'POWER(number, power)',
  MOD: 'MOD(number, divisor)',
  PRODUCT: 'PRODUCT(number1, …)',
  MEDIAN: 'MEDIAN(number1, …)',
  SUMPRODUCT: 'SUMPRODUCT(array1, [array2], …)',
  CONCAT: 'CONCAT(text1, …)',
  TEXTJOIN: 'TEXTJOIN(between, skip_empty, text1, …)',
  LEFT: 'LEFT(text, [count])',
  RIGHT: 'RIGHT(text, [count])',
  MID: 'MID(text, start, count)',
  LEN: 'LEN(text)',
  UPPER: 'UPPER(text)',
  LOWER: 'LOWER(text)',
  PROPER: 'PROPER(text)',
  TRIM: 'TRIM(text)',
  SUBSTITUTE: 'SUBSTITUTE(text, old, new, [which])',
  FIND: 'FIND(find, in_text, [start])',
  SEARCH: 'SEARCH(find, in_text, [start])',
  TEXT: 'TEXT(value, format)',
  VALUE: 'VALUE(text)',
  TODAY: 'TODAY()',
  NOW: 'NOW()',
  DATE: 'DATE(year, month, day)',
  YEAR: 'YEAR(date)',
  MONTH: 'MONTH(date)',
  DAY: 'DAY(date)',
  WEEKDAY: 'WEEKDAY(date, [type])',
  EOMONTH: 'EOMONTH(start, months)',
  EDATE: 'EDATE(start, months)',
  DATEDIF: 'DATEDIF(start, end, unit)',
  NETWORKDAYS: 'NETWORKDAYS(start, end, [holidays])',
  PMT: 'PMT(rate, periods, present_value, [future_value], [type])',
  FV: 'FV(rate, periods, payment, [present_value], [type])',
  PV: 'PV(rate, periods, payment, [future_value], [type])',
  NPV: 'NPV(rate, value1, …)',
  IRR: 'IRR(values, [guess])',
  RAND: 'RAND()',
  RANDBETWEEN: 'RANDBETWEEN(low, high)',
};

// ---- delimited text: CSV, TSV, what a clipboard holds -----------------------------------------------------------

/** Rows of fields from delimited text (RFC 4180 quotes; empty lines kept as empty rows). `sep` is found when not given. */
export function parseDelimited(text: string, sep?: string, maxRows = SHEET_LIMITS.rows + 1): { rows: string[][]; more: boolean; sep: string } {
  const d = sep ?? detectSep(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  let i = 0;
  const n = text.length;
  for (; i < n; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') (field += '"'), i++;
        else q = false;
      } else field += ch;
    } else if (ch === '"' && field === '') q = true;
    else if (ch === d) row.push(field), (field = '');
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      if (rows.length >= maxRows) break;
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  // A last line break ends the last row; it does not start another.
  while (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '' && i >= n) rows.pop();
  return { rows, more: i < n - 1, sep: d };
}

/** The separator of delimited text: the one of , ; tab | that splits its first lines most evenly. */
export function detectSep(text: string): string {
  const lines: string[] = [];
  let q = false;
  let cur = '';
  for (let i = 0; i < text.length && lines.length < 30 && i < 200_000; i++) {
    const ch = text[i];
    if (ch === '"') q = !q;
    if (!q && (ch === '\n' || ch === '\r')) {
      if (cur) lines.push(cur);
      cur = '';
    } else cur += q && ch !== '"' ? 'x' : ch;
  }
  if (cur) lines.push(cur);
  let best = ',';
  let score = 0;
  for (const s of [',', '\t', ';', '|']) {
    const counts = lines.map((l) => l.split(s).length - 1);
    const freq = new Map<number, number>();
    for (const k of counts) if (k) freq.set(k, (freq.get(k) ?? 0) + 1);
    let mode = 0;
    let times = 0;
    for (const [k, t] of freq) if (t > times || (t === times && k > mode)) [mode, times] = [k, t];
    const sc = times * Math.log2(mode + 1);
    if (sc > score) [best, score] = [s, sc];
  }
  return best;
}

/**
 * A sheet's cells from rows of words (a CSV file, a paste): numbers, percents, amounts and dates typed as a person
 * types them; words starting with "=" stay words (a file's data is not run as formulas).
 */
export function cellsFromRows(rows: string[][], notes?: string[], decimalComma = false): Record<string, Cell> {
  const out: Record<string, Cell> = {};
  // Numbers written the European way (1.234,50) where commas mark decimals: as numbers.
  const euro = (v: string) => (decimalComma && /^-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$/.test(v.trim()) && !/^-?0\d/.test(v.trim()) ? v.trim().replace(/\./g, '').replace(',', '.') : v);
  let n = 0;
  let cut = false;
  for (let r = 0; r < rows.length; r++) {
    if (r >= SHEET_LIMITS.rows) {
      notes?.push(`Only the first ${SHEET_LIMITS.rows.toLocaleString('en')} rows were taken in.`);
      break;
    }
    const row = rows[r];
    if (row.length > SHEET_LIMITS.cols && !cut) {
      cut = true;
      notes?.push(`Only the first ${SHEET_LIMITS.cols} columns were taken in.`);
    }
    for (let c = 0; c < Math.min(row.length, SHEET_LIMITS.cols); c++) {
      const v = row[c];
      if (v === '') continue;
      if (n >= SHEET_LIMITS.cells) {
        notes?.push(`Only the first ${SHEET_LIMITS.cells.toLocaleString('en')} cells were taken in.`);
        return out;
      }
      const cell = v.startsWith('=') ? { v: cleanText(v) } : cleanCell(euro(v), true);
      if (cell) {
        out[refName(r, c)] = cell;
        n++;
      }
    }
  }
  return out;
}

// ---- for agents -----------------------------------------------------------------------------------------------

/** A value for an outline: as its cell shows it, short. */
const brief = (v: Scalar, s?: CellStyle) => {
  const t = formatValue(v, s).replace(/\s+/g, ' ');
  return t.length > 40 ? `${t.slice(0, 39)}…` : t;
};

/**
 * A workbook in a few lines for an agent: each sheet's name and id, the cells it uses, frozen rows, and its first
 * rows (formulas with what they give).
 */
export function bookOutline(b: Workbook, calc: Calc = computeBook(b), rows = 4): string {
  return b.sheets
    .map((sh, si) => {
      const e = calc.extent(si);
      const names = Object.keys(sh.cells);
      const formulas = names.filter((k) => sh.cells[k].f !== undefined).length;
      const head = `${si + 1}. “${sh.name}” [${sh.id}]`;
      if (!e.rows) return `${head}: empty`;
      const n = (k: number, one: string) => `${k} ${one}${k === 1 ? '' : 's'}`;
      const frozen = [sh.freeze?.rows ? n(sh.freeze.rows, 'row') : '', sh.freeze?.cols ? n(sh.freeze.cols, 'column') : ''].filter(Boolean).join(' and ');
      const size = `${n(e.rows, 'row')} × ${n(e.cols, 'column')}, ${n(names.length, 'cell')}, ${n(formulas, 'formula')}`;
      const lines = [`${head}: A1:${refName(e.rows - 1, e.cols - 1)}, ${size}${frozen ? `, frozen: ${frozen}` : ''}`];
      // What else it has, in a line: a filter, rules, charts, merges, notes, hidden rows and columns.
      const notes = names.filter((k) => sh.cells[k].note).length;
      const open = (sh.comments ?? []).filter((c) => !c.resolved).length;
      const hiddenR = Object.values(sh.rows ?? {}).filter((x) => x.hidden).length;
      const hiddenC = Object.values(sh.cols ?? {}).filter((x) => x.hidden).length;
      const more = [
        sh.filter ? `a filter on ${sh.filter.range}` : '',
        sh.conditional?.length ? n(sh.conditional.length, 'conditional formatting rule') : '',
        sh.validation?.length ? `${sh.validation.length} rule${sh.validation.length === 1 ? '' : 's'} for what cells take` : '',
        sh.charts?.length ? `${n(sh.charts.length, 'chart')} (${sh.charts.slice(0, 6).map((c) => `${c.kind} of ${c.range} on ${c.from.cell}:${c.to.cell}`).join(', ')}${sh.charts.length > 6 ? '…' : ''})` : '',
        sh.merges?.length ? `merged: ${sh.merges.slice(0, 6).join(', ')}${sh.merges.length > 6 ? '…' : ''}` : '',
        sh.board ? `a Kanban board of the table at ${sh.board.at} grouped by column ${sh.board.by}${sh.board.open ? ', which the sheet opens on' : ''}` : '',
        notes ? n(notes, 'note') : '',
        sh.comments?.length ? `${n(sh.comments.length, 'comment')} (${open} open)` : '',
        hiddenR ? n(hiddenR, 'hidden row') : '',
        hiddenC ? n(hiddenC, 'hidden column') : '',
      ].filter(Boolean);
      if (more.length) lines.push(`   Also: ${more.join('; ')}`);
      const keys = calc.keys(si);
      let shown = 0;
      let at = 0;
      while (shown < rows && at < keys.length) {
        const r = unpackR(keys[at]);
        const parts: string[] = [];
        for (; at < keys.length && unpackR(keys[at]) === r; at++) {
          const c = unpackC(keys[at]);
          const cell = sh.cells[refName(r, c)];
          if (!cell || (cell.v === undefined && cell.f === undefined)) continue;
          const v = calc.value(si, r, c);
          parts.push(cell.f !== undefined ? `${refName(r, c)} =${cell.f} → ${brief(v, cell.s)}` : `${refName(r, c)} ${brief(v, cell.s)}`);
        }
        if (!parts.length) continue;
        const text = parts.join(' | ');
        lines.push(`   Row ${r + 1}: ${text.length > 400 ? `${text.slice(0, 399)}…` : text}`);
        shown++;
      }
      if (at < keys.length) lines.push(`   … more rows, to row ${e.rows}`);
      return lines.join('\n');
    })
    .join('\n');
}
